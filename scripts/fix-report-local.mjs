#!/usr/bin/env node
//
// scripts/fix-report-local.mjs
//
// LOCAL operator wrapper for the v6.1 report-fix pipeline, running the LLM via
// the Claude Code subscription transport (`claude -p`) instead of the Anthropic
// API. This is the local counterpart to the (now-neutered) v61-report-fix.yml
// CI job — it must run on a machine where `claude` is authenticated (e.g. WSL)
// and where `wrangler` can read production KV (`--remote`).
//
// Why local: invokeClaudePWithLedger (subscription) refuses to run in CI
// (process.env.CI / GITHUB_ACTIONS guard), and GitHub's hosted runners can't
// reach your Claude Code auth. So the subscription LLM step runs here.
//
// Flow (mirrors the CI workflow, but APPLIES the diff before gating — the CI
// job validated the diff with `git apply --check` but never applied it, so its
// regression gate tested unmodified code and its PR diff was empty):
//   1. Resolve repo + issue body -> kv-key -> fp-short
//   2. D-06 idempotency: skip if an open auto-fix/<fp> PR already exists
//   3. Fetch the KV record (wrangler --remote, via review-reports getRecord)
//   4. Up to MAX_ITER: runReportFix (subscription) -> git apply -> regression
//      gate -> pass:break / fail:revert + re-trigger / exhausted:auto-fix-stuck
//   5. On success: leave the fix applied + print the diff; with --push, also
//      create the auto-fix/<fp> draft PR (overfit -> human-review-required).
//
// Usage:
//   node scripts/fix-report-local.mjs <issue-number> [--repo owner/repo]
//   node scripts/fix-report-local.mjs --kv-key report:<fp>:<ts> [--repo ...]
//   npm run fix-report -- <issue-number> [--push]
//
// Flags:
//   --kv-key <key>     KV key directly (skip issue-body extraction)
//   --repo <o/r>       GitHub repo (default: gh repo view)
//   --max-iter <n>     regression-loop iterations (default: 3)
//   --re-trigger       skip the D-06 idempotency check
//   --gate-cmd <cmd>   regression gate command (default: "npx vitest run")
//   --push             after a green fix, create the auto-fix/<fp> draft PR
//   --transport <t>    'subscription' (default local) | 'sdk'

import { parseArgs } from 'node:util';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getNamespaceId, getRecord } from './review-reports.mjs';
import { runReportFix, findExistingPr, resolveTransport } from './report-fix.mjs';
import { makeKvReportGhClient } from './gh-client.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(HERE, '..');

function sh(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', cwd: REPO_ROOT, ...opts });
}

function fail(msg) {
  console.error(`[fix-report] ERROR: ${msg}`);
  process.exit(1);
}

async function main() {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: {
      'kv-key': { type: 'string' },
      'repo': { type: 'string' },
      'max-iter': { type: 'string', default: '3' },
      're-trigger': { type: 'boolean', default: false },
      'gate-cmd': { type: 'string', default: 'npx vitest run' },
      'push': { type: 'boolean', default: false },
      'transport': { type: 'string' },
      'timeout-ms': { type: 'string' },
    },
    strict: false,
  });

  const transport = resolveTransport(values.transport || 'subscription');
  if (transport === 'sdk') {
    console.error('[fix-report] WARNING: transport=sdk requested — this wrapper is for the local subscription path.');
  }
  const maxIter = parseInt(values['max-iter'], 10);
  if (!Number.isInteger(maxIter) || maxIter < 1) fail('--max-iter must be a positive integer');

  // 1. Resolve repo
  let repo = values.repo;
  if (!repo) {
    try { repo = sh('gh', ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner']).trim(); }
    catch { fail('could not resolve repo — pass --repo owner/repo'); }
  }

  // 1b. Resolve kv-key (from --kv-key or the Issue body's <!-- kv-key: ... --> marker)
  let kvKey = values['kv-key'];
  const issueNumber = positionals[0] ? String(positionals[0]).replace(/^#/, '') : null;
  if (!kvKey) {
    if (!issueNumber) fail('provide an <issue-number> positional or --kv-key');
    let body;
    try { body = sh('gh', ['issue', 'view', issueNumber, '--repo', repo, '--json', 'body', '-q', '.body']); }
    catch { fail(`could not read issue #${issueNumber} in ${repo}`); }
    const m = body.match(/<!--\s*kv-key:\s*(report:[0-9a-fA-F]+:[0-9]+)\s*-->/);
    if (!m) fail(`no <!-- kv-key: ... --> marker found in issue #${issueNumber} body`);
    kvKey = m[1];
  }
  if (!/^report:[0-9a-fA-F]+:[0-9]+$/.test(kvKey)) fail(`malformed kv-key: ${kvKey}`);
  const fpFull = kvKey.replace(/^report:/, '').replace(/:[0-9]+$/, '');
  const fpShort = fpFull.slice(0, 8);

  console.error(`[fix-report] repo=${repo} issue=${issueNumber ?? '(none)'} kvKey=${kvKey} fpShort=${fpShort} transport=${transport}`);

  // 2. D-06 idempotency
  if (!values['re-trigger']) {
    const existing = findExistingPr(fpShort, repo);
    if (existing !== null) {
      console.error(`[fix-report] D-06: open PR #${existing} already exists for auto-fix/${fpShort} — skipping. Use --re-trigger to override.`);
      process.exit(0);
    }
  }

  // 3. Fetch KV record (wrangler --remote)
  const nsId = getNamespaceId(readFileSync(path.join(REPO_ROOT, 'worker', 'wrangler.toml'), 'utf8'));
  let kvRecord;
  try { kvRecord = getRecord(nsId, kvKey); }
  catch (e) { fail(`KV fetch failed for ${kvKey}: ${e.message}`); }
  if (!kvRecord || !kvRecord.patentNumber) fail('KV record missing or has no patentNumber');

  // 4. Regression-driven loop (subscription LLM -> apply -> gate)
  const [gateBin, ...gateArgs] = values['gate-cmd'].split(/\s+/);
  const timeoutMs = values['timeout-ms'] ? parseInt(values['timeout-ms'], 10) : undefined;
  let reTrigger = values['re-trigger'];
  let success = null;
  for (let iter = 1; iter <= maxIter; iter += 1) {
    console.error(`\n[fix-report] === iteration ${iter}/${maxIter} (transport=${transport}) ===`);
    const result = await runReportFix({ kvRecord, fpShort, issueNumber, repo, reTrigger, transport, timeoutMs });

    if (!result.ok) {
      console.error(`[fix-report] dispatcher: reason=${result.reason}${result.stderrSnip ? ` | git apply: ${result.stderrSnip}` : ''}`);
      if (result.diff) {
        const dbg = `/tmp/report-fix-${fpShort}-iter${iter}.diff`;
        try { writeFileSync(dbg, result.diff); console.error(`[fix-report] failing diff saved to ${dbg}`); } catch { /* ignore */ }
      }
      if (result.skipped) process.exit(0);
      if (iter >= maxIter) { markStuck(repo, issueNumber); fail(`hard-abort after ${maxIter} iterations: ${result.reason}`); }
      reTrigger = true;
      continue;
    }

    // Apply the validated diff to the working tree (the CI job never did this).
    try { sh('git', ['apply', '--recount'], { input: result.diff, stdio: ['pipe', 'pipe', 'pipe'] }); }
    catch (e) { console.error(`[fix-report] git apply failed: ${e.message}`); if (iter >= maxIter) { markStuck(repo, issueNumber); fail('apply failed at last iteration'); } reTrigger = true; continue; }

    // Regression gate (golden corpus). On failure, revert and re-trigger.
    console.error(`[fix-report] applied diff to ${result.changedPaths.join(', ')} — running gate: ${values['gate-cmd']}`);
    let gateOk = true;
    try { sh(gateBin, gateArgs, { stdio: ['ignore', 'inherit', 'inherit'] }); }
    catch { gateOk = false; }

    if (!gateOk) {
      console.error(`[fix-report] regression gate FAILED on iteration ${iter} — reverting ${result.changedPaths.join(', ')}`);
      try { sh('git', ['checkout', '--', ...result.changedPaths]); } catch { /* best-effort */ }
      if (iter >= maxIter) { markStuck(repo, issueNumber); fail(`regression persists after ${maxIter} iterations`); }
      reTrigger = true;
      continue;
    }

    success = result;
    console.error(`[fix-report] iteration ${iter} PASSED — clean regression. overfit=${result.overfitFlag}`);
    break;
  }

  if (!success) fail('no clean fix produced');

  // 5. Success: the fix is applied to the working tree.
  console.error(`\n[fix-report] ✅ fix applied to: ${success.changedPaths.join(', ')}`);
  console.error(`[fix-report] overfit=${success.overfitFlag} (overfit => human-review-required)`);

  if (!values.push) {
    console.error('\n[fix-report] Fix left applied to your working tree (NOT pushed). Review it, then open the PR:');
    console.error(`  git switch -c auto-fix/${fpShort}`);
    console.error(`  git add ${success.changedPaths.join(' ')}`);
    console.error(`  git commit -m "auto-fix: report ${fpShort} — citation regression"`);
    console.error(`  git push -u origin auto-fix/${fpShort}`);
    console.error(`  gh pr create --repo ${repo} --base main --head auto-fix/${fpShort} --draft \\`);
    console.error(`    --title "auto-fix: report ${fpShort} — citation regression" \\`);
    console.error(`    --body $'## Auto-Fix Report\\n\\n**Source Issue:** #${issueNumber}\\n<!-- source_issue: ${issueNumber} -->\\n**KV Key:** \`${kvKey}\`\\n\\nGenerated locally via the Claude Code subscription transport (source: report-fix-api).'`);
    console.error('  (Re-run with --push to do the branch/commit/push/PR automatically.)');
    return;
  }

  // --push: create the draft PR (commit ONLY the changed paths; leaves any other
  // working-tree noise untouched and uncommitted).
  const branch = `auto-fix/${fpShort}`;
  sh('git', ['switch', '-c', branch]);
  sh('git', ['add', ...success.changedPaths]);
  sh('git', ['commit', '-m', `auto-fix: report ${fpShort} — citation regression`]);
  sh('git', ['push', '-u', 'origin', branch]);
  const body = [
    '## Auto-Fix Report', '',
    `**Source Issue:** #${issueNumber}`,
    `<!-- source_issue: ${issueNumber} -->`,
    `**KV Key:** \`${kvKey}\``,
    `**Fingerprint:** \`${fpShort}\``, '',
    'Generated locally via the Claude Code subscription transport (`claude -p`), source: `report-fix-api`.',
    'Passes the golden-corpus regression gate; gated by `v40-verifier-gate.yml`; human merge required (GATE-04).',
  ].join('\n');
  sh('gh', ['pr', 'create', '--repo', repo, '--base', 'main', '--head', branch, '--draft',
    '--title', `auto-fix: report ${fpShort} — citation regression`, '--body', body]);
  console.error(`[fix-report] ✅ draft PR opened on ${branch}`);
  if (success.overfitFlag && issueNumber) {
    try { makeKvReportGhClient(repo).addLabel(Number(issueNumber), 'human-review-required'); } catch { /* best-effort */ }
  }
}

function markStuck(repo, issueNumber) {
  if (!issueNumber) return;
  try { makeKvReportGhClient(repo).addLabel(Number(issueNumber), 'auto-fix-stuck'); } catch { /* best-effort */ }
}

main().catch((e) => fail(e?.stack || e?.message || String(e)));

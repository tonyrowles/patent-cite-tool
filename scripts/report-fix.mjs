#!/usr/bin/env node
//
// scripts/report-fix.mjs — Phase 12 Plan 03 (D-01)
//
// Fresh KV-report → src/shared/matching-core diff dispatcher.
// Converts a human bug-report KV record into a candidate unified diff
// by: building the <report_data>-enveloped user turn, invoking the LLM
// via SDK transport, running the D-05 hard-abort validation sequence, and
// emitting the FIX-04 overfit signal when needed.
//
// This dispatcher does NOT own the 3-iteration loop — that lives in Plan 04
// (v61-report-fix.yml). This file is invoked once per workflow iteration.
//
// D-01: Does NOT extend or import scripts/auto-fix.mjs — fresh entry point.
// D-02: Imports parseFencedDiff/changedPathsFromDiff from fix-primitives.js.
// COST-01: All ledger writes via safeAppendLedger/invokeAnthropicSdkWithLedger
//          with source:'report-fix-api'. Direct appendLedgerEntry calls are forbidden here.

import { parseArgs } from 'node:util';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { makeKvReportGhClient } from './gh-client.mjs';
import { parseFencedDiff, changedPathsFromDiff } from '../tests/e2e/lib/fix-primitives.js';
import { REPORT_FIX_SCAFFOLD } from '../tests/e2e/lib/fix-prompt-builder.js';
import { invokeAnthropicSdkWithLedger, invokeClaudePWithLedger } from '../tests/e2e/lib/llm-driver.js';
import { LEDGER_PATH } from '../tests/e2e/lib/llm-ledger.js';
import { safeAppendLedger } from '../tests/e2e/lib/safe-append-ledger.js';
import { checkDiffGuard } from './check-diff-guard.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(HERE, '..');

// ---------------------------------------------------------------------------
// FORBIDDEN_DELIMITERS for the <report_data> envelope (FIX-03)
// Re-implemented here (not coupled to issue-payload-builder.js's private function).
// Pattern from issue-payload-builder.js:107-119:
//   splice '-DELIMITER-ESCAPED-PHASE-42' between second-to-last and last char.
//   Iterate longest-first to prevent superstring mangling.
// ---------------------------------------------------------------------------

const REPORT_DATA_DELIMITERS = Object.freeze([
  '<report_data>',
  '</report_data>',
]);

/**
 * Neutralize <report_data> / </report_data> envelope delimiters in user-supplied text.
 * Mirrors the pattern in issue-payload-builder.js:107-119 but targets the report_data
 * envelope (not issue_body_untrusted). Pure: no I/O, no env reads.
 *
 * @param {string} text
 * @returns {string}
 */
export function escapeReportDataDelimiters(text) {
  if (typeof text !== 'string' || text.length === 0) return text === '' ? '' : '';
  let out = text;
  // Iterate longest-first (</report_data> before <report_data>) to avoid
  // superstring-mangling identical to issue-payload-builder.js:110-118.
  for (let i = REPORT_DATA_DELIMITERS.length - 1; i >= 0; i -= 1) {
    const d = REPORT_DATA_DELIMITERS[i];
    if (out.indexOf(d) === -1) continue;
    const escaped = d.slice(0, -1) + '-DELIMITER-ESCAPED-PHASE-42' + d.slice(-1);
    out = out.split(d).join(escaped);
  }
  return out;
}

// ---------------------------------------------------------------------------
// buildReportUserTurn (FIX-01 / FIX-03 / FIX-05)
// ---------------------------------------------------------------------------

/**
 * Build the user turn for the LLM call.
 *
 * The turn wraps all content in the <report_data> envelope.
 * User-controlled fields (note, selectionText, errorLog) are
 * FORBIDDEN_DELIMITERS-escaped and truncated (FIX-03).
 * selectionText is omitted entirely when absent (FIX-05).
 * Matching core source files are embedded under <matching_core_source>;
 * pdf-parser.js is included only when pdfParseStatus === 'error'.
 *
 * @param {object} kvRecord — KV record fields
 * @param {{ matching: string, positionMapBuilder: string, pdfParser: string }} matchingCoreSources
 * @returns {string}
 */
export function buildReportUserTurn(kvRecord, matchingCoreSources) {
  // Sanitize user-controlled fields (FIX-03)
  const safeNote = kvRecord.note != null
    ? escapeReportDataDelimiters(String(kvRecord.note).slice(0, 256))
    : null;
  const safeSelectionText = kvRecord.selectionText != null
    ? escapeReportDataDelimiters(String(kvRecord.selectionText).slice(0, 1000))
    : null;
  const safeErrorLog = Array.isArray(kvRecord.errorLog)
    ? kvRecord.errorLog
        .slice(0, 5)
        .map(e => escapeReportDataDelimiters(String(e).slice(0, 200)))
    : [];

  const lines = [
    '<report_data>',
    '',
    '## Bug Report Fields',
    '',
    `category: ${kvRecord.category}`,
    `patentNumber: ${kvRecord.patentNumber}`,
    `patentUrl: ${kvRecord.patentUrl}`,
    `returnedCitation: ${kvRecord.returnedCitation ?? '(null — no citation produced)'}`,
    `confidenceTier: ${kvRecord.confidenceTier ?? '(unknown)'}`,
    `pdfParseStatus: ${kvRecord.pdfParseStatus ?? '(unknown)'}`,
    `duplicate_count: ${kvRecord.duplicate_count ?? 0}`,
  ];

  // FIX-05: omit selectionText entirely when absent
  if (safeSelectionText !== null) {
    lines.push(`selectionText: ${safeSelectionText}`);
  }

  // FIX-03: errorLog in sanitized form
  if (safeErrorLog.length > 0) {
    lines.push('', 'errorLog (recent errors from extension):');
    safeErrorLog.forEach((e, i) => lines.push(`  [${i}]: ${e}`));
  }

  // FIX-03: note in sanitized form
  if (safeNote !== null) {
    lines.push('', `note (user comment): ${safeNote}`);
  }

  // Include the matching core source files (Option C single-turn SDK transport)
  lines.push(
    '',
    '## Matching Core Source (READ-ONLY reference — your diff targets these files)',
    '',
    '<matching_core_source>',
    '### src/shared/matching.js',
    matchingCoreSources.matching,
    '### src/shared/position-map-builder.js',
    matchingCoreSources.positionMapBuilder,
    // pdf-parser.js only when pdfParseStatus is 'error' (token cost optimization)
    ...(kvRecord.pdfParseStatus === 'error' ? [
      '### src/shared/pdf-parser.js',
      matchingCoreSources.pdfParser,
    ] : []),
    '</matching_core_source>',
    '',
    '</report_data>',
  );

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// scanForOverfit (FIX-04 / D-03)
// ---------------------------------------------------------------------------

/**
 * Scan a candidate diff for the FIX-04 overfit pattern: patentNumber appearing
 * as a string literal in added lines within src/ hunks.
 *
 * This is a SOFT FLAG (D-03): the dispatcher signals overfit but does NOT drop
 * the candidate. The workflow then withholds auto-fix:verified and adds
 * human-review-required.
 *
 * @param {string} diff — validated unified diff text
 * @param {string|null|undefined} patentNumber — e.g. 'US11427642'
 * @returns {boolean} — true if overfit detected
 */
export function scanForOverfit(diff, patentNumber) {
  if (!patentNumber || typeof patentNumber !== 'string') return false;
  if (typeof diff !== 'string') return false;

  // Track whether we're in a src/ hunk
  let inSrcHunk = false;

  for (const line of diff.split(/\r?\n/)) {
    // Detect file path transitions
    if (line.startsWith('+++ b/')) {
      const filePath = line.slice(6);
      inSrcHunk = filePath.startsWith('src/');
      continue;
    }
    // Only check added lines in src/ hunks
    if (!inSrcHunk) continue;
    if (!line.startsWith('+')) continue;
    // Skip +++ header lines
    if (line.startsWith('+++')) continue;

    // Check if the added line contains the patentNumber as a string literal
    if (line.includes(patentNumber)) {
      return true;
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// validateMaxFixes (COST-02)
// ---------------------------------------------------------------------------

/**
 * Validate MAX_FIXES_PER_RUN as a non-negative integer.
 * Throws Error with message matching /non-negative integer/i on invalid values.
 *
 * @param {number} n
 * @throws {Error}
 */
export function validateMaxFixes(n) {
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
    throw new Error('MAX_FIXES_PER_RUN must be a non-negative integer');
  }
}

// ---------------------------------------------------------------------------
// getDiffAbortReason (D-05 hard-abort detection)
// ---------------------------------------------------------------------------

/**
 * Check whether a candidate LLM response should trigger a D-05 hard abort.
 *
 * Runs the parseFencedDiff → changedPathsFromDiff → checkDiffGuard sequence.
 * Returns a reason string if any gate fails, or null if all gates pass.
 *
 * NOTE: git apply --check is NOT run here (it requires a real git repo and
 * writes temporary files). The dispatcher's main run function handles that
 * separately via execFileSync. This function covers the pure (testable) gates.
 *
 * @param {string} llmText — raw LLM response text
 * @returns {string|null} — abort reason string or null if no abort needed
 */
export function getDiffAbortReason(llmText) {
  // Gate 1: parseFencedDiff
  const parsed = parseFencedDiff(llmText);
  if (!parsed.ok) {
    return `malformed-diff:${parsed.reason}`;
  }

  // Gate 2: changedPathsFromDiff + checkDiffGuard
  const changedPaths = changedPathsFromDiff(parsed.diff);
  const guardResult = checkDiffGuard(changedPaths);
  if (!guardResult.ok) {
    return `forbidden-paths:${guardResult.violations.join(',')}`;
  }

  return null;
}

// ---------------------------------------------------------------------------
// findExistingPr (D-06 idempotency — GitHub-authoritative dedup)
// ---------------------------------------------------------------------------

/**
 * Query GitHub for an existing open PR with head branch auto-fix/<fpShort>.
 *
 * CWE-94: uses execFileSync arg-array, NEVER a shell string.
 * Returns the PR number if found, or null.
 *
 * @param {string} fpShort — short fingerprint (used in branch name)
 * @param {string|null} repo — GitHub repo in owner/repo format (or null for ambient)
 * @returns {number|null}
 */
export function findExistingPr(fpShort, repo) {
  const headBranch = `auto-fix/${fpShort}`;
  const args = [
    'pr', 'list',
    '--head', headBranch,
    '--state', 'open',
    '--json', 'number',
  ];
  if (repo) {
    args.push('--repo', repo);
  }
  try {
    const raw = execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0].number === 'number') {
      return parsed[0].number;
    }
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// resolveTransport — subscription (local Claude Code) vs sdk (CI Anthropic API)
// ---------------------------------------------------------------------------

/**
 * Resolve the LLM transport. Explicit 'sdk' | 'subscription' wins; otherwise
 * pick by environment to honor the inverse-CI invariant in llm-driver.js
 * (invokeClaudePWithLedger refuses in CI; invokeAnthropicSdkWithLedger refuses
 * outside CI). Default outside CI is the subscription transport — no API key /
 * no per-token billing, runs through the Claude Code Max subscription (`claude -p`).
 *
 * @param {string} [explicit] — 'sdk' | 'subscription' | undefined
 * @returns {'sdk'|'subscription'}
 */
export function resolveTransport(explicit) {
  if (explicit === 'sdk' || explicit === 'subscription') return explicit;
  const inCi = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
  return inCi ? 'sdk' : 'subscription';
}

// Subscription (`claude -p`) timeout for the report-fix call. The shared
// invokeClaudeP default (LLM_TIMEOUT_MS = 60s) was tuned for small triage
// prompts; report-fix embeds the full matching-core source and runs up to 5
// tool-use turns, so it needs much more headroom. Tunable via env.
export const REPORT_FIX_SUBSCRIPTION_TIMEOUT_MS = parseInt(
  process.env.REPORT_FIX_TIMEOUT_MS ?? '300000', 10,
);

// ---------------------------------------------------------------------------
// runReportFix — main orchestration entry point (D-01)
// ---------------------------------------------------------------------------

/**
 * Main dispatcher: runs a SINGLE attempt per invocation.
 * The outer 3-iteration loop lives in the workflow (Plan 04).
 *
 * Protocol:
 *   1. D-06 idempotency: skip if PR already exists (unless --re-trigger)
 *   2. Read matching-core source files
 *   3. Build user turn via buildReportUserTurn
 *   4. Single LLM call via invokeAnthropicSdkWithLedger (source:'report-fix-api')
 *   5. D-05: parseFencedDiff → changedPathsFromDiff → checkDiffGuard → git apply --check
 *      Any failure → hard abort: label auto-fix-stuck, write ledger, return {ok:false,hardAbort:true}
 *   6. FIX-04: scanForOverfit → set overfitFlag in return value (soft flag, caller handles)
 *   7. Return {ok:true, diff, overfitFlag, llmResult}
 *
 * @param {object} opts
 * @param {object} opts.kvRecord — parsed KV record
 * @param {string} opts.fpShort — short fingerprint (for D-06 / branch naming)
 * @param {string|null} opts.issueNumber — GitHub Issue number (for labeling)
 * @param {string|null} opts.repo — GitHub repo in owner/repo format
 * @param {boolean} [opts.reTrigger] — if true, skip D-06 dedup check
 * @param {number} [opts.maxFixes] — MAX_FIXES_PER_RUN (already validated by caller)
 * @returns {Promise<object>}
 */
export async function runReportFix({
  kvRecord,
  fpShort,
  issueNumber,
  repo,
  reTrigger = false,
  maxFixes,
  transport,
  timeoutMs,
}) {
  const ghClient = makeKvReportGhClient(repo);
  // Transport selection: subscription (local Claude Code, no API key) vs sdk (CI
  // Anthropic API). Threaded into every ledger entry so COST caps/audit unify
  // across both via combinedMonthlyTotalByTransport.
  const resolvedTransport = resolveTransport(transport);

  // COST-02: validate maxFixes (caller should validate, but defensive check)
  if (maxFixes !== undefined && maxFixes !== null) {
    validateMaxFixes(maxFixes);
  }

  // D-06: idempotency — skip if an open PR already exists (unless re-trigger)
  if (!reTrigger) {
    const existingPr = findExistingPr(fpShort, repo);
    if (existingPr !== null) {
      safeAppendLedger(LEDGER_PATH, {
        iso: new Date().toISOString(),
        model: 'n/a',
        cost_usd: 0,
        tokens_in: 0,
        tokens_out: 0,
        phase: 'phase-12',
        transport: resolvedTransport,
        source: 'report-fix-api',
        errorReason: 'skipped-pr-exists',
        issueId: issueNumber ? String(issueNumber) : undefined,
      });
      return { ok: false, skipped: true, reason: 'pr-exists', prNumber: existingPr };
    }
  }

  // Read matching-core source files
  const matchingCoreSources = {
    matching: readFileSync(path.join(REPO_ROOT, 'src', 'shared', 'matching.js'), 'utf8'),
    positionMapBuilder: readFileSync(path.join(REPO_ROOT, 'src', 'shared', 'position-map-builder.js'), 'utf8'),
    pdfParser: readFileSync(path.join(REPO_ROOT, 'src', 'shared', 'pdf-parser.js'), 'utf8'),
  };

  // Build the user turn (FIX-01 / FIX-03 / FIX-05)
  const userPrompt = buildReportUserTurn(kvRecord, matchingCoreSources);

  // Single LLM attempt (COST-03: the 3-iteration loop lives in the workflow/local
  // wrapper, not here). Subscription transport → local Claude Code (`claude -p`,
  // no API key); sdk transport → Anthropic API (CI only). Both return a
  // compatible { ok, llmText, modelId, costUsd } shape on success.
  const llmResult = resolvedTransport === 'subscription'
    ? await invokeClaudePWithLedger({
        systemPrompt: REPORT_FIX_SCAFFOLD,
        userPrompt,
        timeoutMs: timeoutMs ?? REPORT_FIX_SUBSCRIPTION_TIMEOUT_MS,
        // Single-shot diff: source is already embedded, so give claude NO tools
        // (tools:'' → never burns a turn on a tool call → no error_max_turns) and
        // enough budget to emit the whole diff without mid-output truncation.
        maxTurns: 2,
        tools: '',
        maxBudgetUsd: process.env.REPORT_FIX_MAX_BUDGET_USD ?? '3.00',
        phase: 'phase-12',
        source: 'report-fix-api',
      })
    : await invokeAnthropicSdkWithLedger({
        systemPrompt: REPORT_FIX_SCAFFOLD,
        userPrompt,
        model: 'claude-sonnet-4-6',
        maxTokens: 8192,
        phase: 'phase-12',
        issueId: issueNumber ? String(issueNumber) : undefined,
        source: 'report-fix-api',
      });

  if (!llmResult.ok) {
    // LLM error, cap block, or ci-gate (subscription refused in CI) — hard-abort.
    const errorReason = llmResult.capBlocked
      ? 'cap-blocked'
      : llmResult.ciGate
        ? 'ci-gate-subscription-blocked'
        : (llmResult.errorReason || `${resolvedTransport}-error`);
    if (issueNumber) {
      try {
        ghClient.addLabel(Number(issueNumber), 'auto-fix-stuck');
      } catch { /* best-effort */ }
    }
    safeAppendLedger(LEDGER_PATH, {
      iso: new Date().toISOString(),
      model: 'claude-sonnet-4-6',
      cost_usd: 0,
      tokens_in: 0,
      tokens_out: 0,
      phase: 'phase-12',
      transport: resolvedTransport,
      source: 'report-fix-api',
      errorReason,
      issueId: issueNumber ? String(issueNumber) : undefined,
    });
    return { ok: false, hardAbort: true, reason: errorReason };
  }

  // D-05: diff-validation sequence
  //   parseFencedDiff → changedPathsFromDiff → checkDiffGuard → git apply --check
  // Any failure → hard abort (no iteration consumed in the outer 3-iteration loop)
  const parsed = parseFencedDiff(llmResult.llmText);
  if (!parsed.ok) {
    const errorReason = `malformed-diff:${parsed.reason}`;
    if (issueNumber) {
      try {
        ghClient.addLabel(Number(issueNumber), 'auto-fix-stuck');
      } catch { /* best-effort */ }
    }
    safeAppendLedger(LEDGER_PATH, {
      iso: new Date().toISOString(),
      model: llmResult.modelId || 'claude-sonnet-4-6',
      cost_usd: llmResult.costUsd ?? 0,
      tokens_in: 0,
      tokens_out: 0,
      phase: 'phase-12',
      transport: resolvedTransport,
      source: 'report-fix-api',
      errorReason,
      issueId: issueNumber ? String(issueNumber) : undefined,
    });
    return { ok: false, hardAbort: true, reason: errorReason };
  }

  // Normalize: LLM fenced diffs almost always omit the final newline, which makes
  // `git apply` report "corrupt patch" at the last hunk line (the diff hits EOF
  // mid-hunk). Append one. Flows to git apply --check, scanForOverfit, and the
  // diff returned to the wrapper's real apply.
  if (!parsed.diff.endsWith('\n')) parsed.diff += '\n';

  const changedPaths = changedPathsFromDiff(parsed.diff);
  const guardResult = checkDiffGuard(changedPaths);
  if (!guardResult.ok) {
    const errorReason = `forbidden-paths:${guardResult.violations.join(',')}`;
    if (issueNumber) {
      try {
        ghClient.addLabel(Number(issueNumber), 'auto-fix-stuck');
      } catch { /* best-effort */ }
    }
    safeAppendLedger(LEDGER_PATH, {
      iso: new Date().toISOString(),
      model: llmResult.modelId || 'claude-sonnet-4-6',
      cost_usd: llmResult.costUsd ?? 0,
      tokens_in: 0,
      tokens_out: 0,
      phase: 'phase-12',
      transport: resolvedTransport,
      source: 'report-fix-api',
      errorReason,
      issueId: issueNumber ? String(issueNumber) : undefined,
    });
    return { ok: false, hardAbort: true, reason: errorReason };
  }

  // D-05: git apply --check (CWE-94: execFileSync arg-array)
  try {
    // --recount: recompute hunk line-counts from content. LLM-generated diffs
    // very commonly have correct context but wrong @@ -x,y +a,b @@ counts;
    // --recount makes the check tolerant of that without weakening context match.
    execFileSync('git', ['apply', '--check', '--recount'], {
      input: parsed.diff,
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf8',
    });
  } catch (err) {
    const stderrSnip = String(err.stderr ?? err.message ?? '').slice(0, 500);
    const errorReason = `apply-check-failed:${stderrSnip}`;
    if (issueNumber) {
      try {
        ghClient.addLabel(Number(issueNumber), 'auto-fix-stuck');
      } catch { /* best-effort */ }
    }
    safeAppendLedger(LEDGER_PATH, {
      iso: new Date().toISOString(),
      model: llmResult.modelId || 'claude-sonnet-4-6',
      cost_usd: llmResult.costUsd ?? 0,
      tokens_in: 0,
      tokens_out: 0,
      phase: 'phase-12',
      transport: resolvedTransport,
      source: 'report-fix-api',
      errorReason: 'apply-check-failed',
      issueId: issueNumber ? String(issueNumber) : undefined,
    });
    return { ok: false, hardAbort: true, reason: 'apply-check-failed', stderrSnip, diff: parsed.diff };
  }

  // FIX-04 / D-03: overfit soft-flag — scan for patentNumber literal in src/ added lines
  const overfitFlag = scanForOverfit(parsed.diff, kvRecord.patentNumber);

  // Success: return validated diff + overfit flag
  // Regression check (GATE-01) and PR creation are in the workflow (Plan 04)
  return {
    ok: true,
    diff: parsed.diff,
    overfitFlag,
    llmResult,
    changedPaths,
  };
}

// ---------------------------------------------------------------------------
// CLI entry point (workflow invokes: node scripts/report-fix.mjs --kv-record-file <path> ...)
// ---------------------------------------------------------------------------

if (import.meta.url === `file://${process.argv[1]}`) {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      'kv-record-file': { type: 'string' },
      'fp-short': { type: 'string' },
      'issue-number': { type: 'string' },
      'repo': { type: 'string' },
      're-trigger': { type: 'boolean', default: false },
      'output-file': { type: 'string' },
      'transport': { type: 'string' },        // 'sdk' | 'subscription' (default: env-resolved)
      'subscription': { type: 'boolean', default: false },  // shorthand for --transport subscription
      'timeout-ms': { type: 'string' },        // subscription claude -p timeout (default 300s / env REPORT_FIX_TIMEOUT_MS)
    },
    strict: false,
  });

  // COST-02: parse and validate MAX_FIXES_PER_RUN
  const maxFixes = parseInt(process.env.MAX_FIXES_PER_RUN ?? '5', 10);
  try {
    validateMaxFixes(maxFixes);
  } catch (e) {
    console.error('[report-fix] MAX_FIXES_PER_RUN error:', e.message);
    process.exit(1);
  }

  if (!values['kv-record-file']) {
    console.error('[report-fix] --kv-record-file is required');
    process.exit(1);
  }

  let kvRecord;
  try {
    kvRecord = JSON.parse(readFileSync(values['kv-record-file'], 'utf8'));
  } catch (e) {
    console.error('[report-fix] Failed to parse KV record file:', e.message);
    process.exit(1);
  }

  const transport = resolveTransport(
    values['subscription'] ? 'subscription' : values['transport'],
  );
  console.error(`[report-fix] transport=${transport}`);

  const result = await runReportFix({
    kvRecord,
    fpShort: values['fp-short'] || 'unknown',
    issueNumber: values['issue-number'] || null,
    repo: values['repo'] || null,
    reTrigger: values['re-trigger'] || false,
    maxFixes,
    transport,
    timeoutMs: values['timeout-ms'] ? parseInt(values['timeout-ms'], 10) : undefined,
  });

  if (values['output-file']) {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(values['output-file'], JSON.stringify(result, null, 2), 'utf8');
  }

  if (!result.ok) {
    console.error('[report-fix] result:', JSON.stringify(result));
    process.exit(result.hardAbort ? 2 : 1);
  }

  // Emit for workflow step outputs
  const outputLines = [
    `overfit=${result.overfitFlag ? 'true' : 'false'}`,
    `changed_paths=${(result.changedPaths || []).join(',')}`,
  ];
  if (process.env.GITHUB_OUTPUT) {
    const { appendFileSync } = await import('node:fs');
    appendFileSync(process.env.GITHUB_OUTPUT, outputLines.join('\n') + '\n');
  }
  console.log('[report-fix] success:', JSON.stringify({
    ok: result.ok,
    overfitFlag: result.overfitFlag,
    changedPaths: result.changedPaths,
  }));
}

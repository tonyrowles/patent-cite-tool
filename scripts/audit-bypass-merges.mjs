#!/usr/bin/env node
// scripts/audit-bypass-merges.mjs
//
// Phase 62 BYPASS-01 — sole-maintainer `--admin` bypass-audit probe.
//
// Queries `gh api repos/<owner>/<repo>/actions/runs` for verifier-gate runs and
// detects bypass merges where the verifier-gate completed AFTER the PR was
// merged (or was cancelled/skipped before it could gate). Outputs CSV consumed
// by Phase 66's `a-b-winner.mjs --admin-bypass` filter so bypass-tainted
// `outcome:'pass'` ledger entries are excluded from A/B winner math.
//
// CRITICAL — Anti-Pattern (RESEARCH line 298):
//   On auto-fix/* branches, DO NOT merge Phase 62's own PR via `gh pr merge --admin`.
//   This audit ships precisely to detect that behavior. Doing so would create a
//   meta-circular forensic anomaly (the bypass-detector itself shipped via bypass).
//
// Trust-invariant design:
//   - Pure read; idempotent; no state mutations.
//   - `gh auth status` pre-check exits 1 before any API call when unauthed.
//   - `--repo` argv validated against /^[\w.-]+\/[\w.-]+$/ (V5 input validation,
//     Threat T-62-C mitigation).
//   - `gh api ... --paginate` flag literal — Pitfall 62-D mitigation
//     (prevents silent 100-result truncation).
//   - Zero new npm deps. Uses node:child_process + node:fs + tests/e2e/lib/llm-ledger.js.
//
// Cross-phase contracts:
//   - CSV header (LOCKED): see CSV_HEADER constant below — the canonical literal
//     is declared exactly once and consumed by Phase 66 `a-b-winner.mjs
//     --admin-bypass` to filter bypass-tainted samples.

import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readLedger, LEDGER_PATH } from '../tests/e2e/lib/llm-ledger.js';

// ---------------------------------------------------------------------------
// Pure functions (unit-tested in tests/unit/audit-bypass-merges.test.js)
// ---------------------------------------------------------------------------

/**
 * Detect whether a verifier-gate run was bypassed for its associated PR.
 *
 * Algorithm (RESEARCH.md lines 631-649; mirrors Pitfall 11 definition):
 *   - status !== 'completed' → null (defer to next audit window)
 *   - conclusion in {cancelled, skipped} → true (gate never ran)
 *   - else compare timestamps: run.updated_at > pr.merged_at → bypass
 *
 * @param {{status: string, conclusion: string|null, updated_at: string}} verifierRun
 * @param {string} prMergedAt — ISO-8601 PR merge timestamp
 * @returns {true | false | null}
 */
export function detectBypass(verifierRun, prMergedAt) {
  if (verifierRun.status !== 'completed') return null;
  if (verifierRun.conclusion === 'cancelled' || verifierRun.conclusion === 'skipped') {
    return true;
  }
  const runCompletedAt = new Date(verifierRun.updated_at);
  const mergedAt = new Date(prMergedAt);
  return runCompletedAt > mergedAt;
}

/**
 * Cross-reference the spend ledger for the `ledger_source_tag` CSV column.
 *
 * Returns the matching iteration's `source` field when:
 *   - iteration.prNumber === prNumber
 *   - typeof iteration.source === 'string'
 *   - iteration.source starts with 'auto-fix-' (only auto-fix entries qualify)
 *
 * @param {number} prNumber
 * @param {{months: object}} ledger — parsed via readLedger(LEDGER_PATH)
 * @returns {string} matched source OR 'no-entry'
 */
export function ledgerSourceForPr(prNumber, ledger) {
  const months = ledger?.months ?? {};
  for (const bucket of Object.values(months)) {
    const iterations = bucket?.iterations ?? [];
    for (const it of iterations) {
      if (
        it &&
        it.prNumber === prNumber &&
        typeof it.source === 'string' &&
        it.source.startsWith('auto-fix-')
      ) {
        return it.source;
      }
    }
  }
  return 'no-entry';
}

/** Locked CSV header — consumed by Phase 66 a-b-winner.mjs --admin-bypass filter. */
const CSV_HEADER = 'pr_number,merged_at,verifier_gate_completed_at,bypass_detected,ledger_source_tag';

/**
 * Serialize rows to CSV with the locked header. Booleans render as `true`/`false`
 * literals; nulls render as empty fields.
 *
 * @param {Array<{pr_number, merged_at, verifier_gate_completed_at, bypass_detected, ledger_source_tag}>} rows
 * @returns {string}
 */
export function rowsToCsv(rows) {
  const lines = [CSV_HEADER];
  for (const r of rows) {
    const vgc = r.verifier_gate_completed_at == null ? '' : String(r.verifier_gate_completed_at);
    const bd = r.bypass_detected === true ? 'true' : r.bypass_detected === false ? 'false' : '';
    lines.push(
      `${r.pr_number},${r.merged_at},${vgc},${bd},${r.ledger_source_tag}`,
    );
  }
  return lines.join('\n') + '\n';
}

/** Regex used by parseArgv to validate --repo (V5 input validation, T-62-C mitigation). */
const REPO_RE = /^[\w.-]+\/[\w.-]+$/;

/**
 * Parse argv with defaults.
 *
 * Defaults:
 *   --since-iso       8 days ago (RESEARCH Open Question 2 — 1-day cron-drift margin)
 *   --output          csv
 *   --branch-prefix   auto-fix/
 *   --workflow-path   .github/workflows/v40-verifier-gate.yml
 *                     (CR-02 fix: switched from name-based to path-based
 *                     matching. The GitHub API `name` field on /actions/runs
 *                     is the workflow's declared `name:` from the YAML
 *                     [`V40 Verifier Gate`], NOT the file slug. Matching by
 *                     `path` is resilient to YAML `name:` edits and avoids
 *                     the silent-zero-rows defect from the original code.)
 *   --repo            (omitted — main() resolves via gh repo view)
 *
 * @param {string[]} argv
 * @returns {{sinceIso: string, output: string, repo?: string, branchPrefix: string, workflowPath: string}}
 */
export function parseArgv(argv) {
  const out = {
    sinceIso: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000)
      .toISOString()
      .replace(/\.\d{3}Z$/, 'Z'),
    output: 'csv',
    branchPrefix: 'auto-fix/',
    workflowPath: '.github/workflows/v40-verifier-gate.yml',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const k = argv[i];
    const v = argv[i + 1];
    switch (k) {
      case '--since-iso':
        out.sinceIso = v;
        i += 1;
        break;
      case '--output':
        if (v !== 'csv' && v !== 'json') {
          throw new Error(`audit-bypass-merges: invalid --output '${v}' (expected csv|json)`);
        }
        out.output = v;
        i += 1;
        break;
      case '--repo':
        // V5 input validation — Threat T-62-C: --repo flows to `gh api`; reject
        // anything that does not match the simple owner/name shape.
        if (typeof v !== 'string' || !REPO_RE.test(v)) {
          throw new Error(
            `audit-bypass-merges: invalid --repo '${v}' (must match ${REPO_RE})`,
          );
        }
        out.repo = v;
        i += 1;
        break;
      case '--branch-prefix':
        out.branchPrefix = v;
        i += 1;
        break;
      case '--workflow-path':
        out.workflowPath = v;
        i += 1;
        break;
      default:
        // Unknown / unsupported flag: ignored (forward-compat).
        break;
    }
  }
  return out;
}

/**
 * Verify the `gh` CLI is authenticated. Exits 1 with a stderr message when not.
 * Called by main() BEFORE any API queries.
 */
export function assertGhAuth() {
  try {
    execSync('gh auth status', { stdio: 'pipe' });
  } catch {
    process.stderr.write(
      '[audit-bypass-merges] gh CLI not authenticated. Run: gh auth login\n',
    );
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// main — orchestrator
// ---------------------------------------------------------------------------

/**
 * Resolve the active repo when --repo was not passed.
 * Reads `gh repo view --json nameWithOwner -q .nameWithOwner` (existing pattern).
 *
 * @returns {string} "owner/name"
 */
function resolveDefaultRepo() {
  const raw = execSync('gh repo view --json nameWithOwner -q .nameWithOwner', {
    encoding: 'utf8',
  });
  return raw.trim();
}

/**
 * Fetch a PR's merged_at via `gh api repos/<repo>/pulls/<number> --jq .merged_at`.
 * Returns null when the PR is not merged.
 *
 * @param {string} repo "owner/name"
 * @param {number} prNumber
 * @returns {string|null} ISO timestamp OR null
 */
function fetchPrMergedAt(repo, prNumber) {
  const raw = execSync(
    `gh api 'repos/${repo}/pulls/${prNumber}' --jq .merged_at`,
    { encoding: 'utf8' },
  );
  const trimmed = raw.trim();
  if (!trimmed || trimmed === 'null') return null;
  return trimmed;
}

export async function main(argv = process.argv.slice(2)) {
  const parsed = parseArgv(argv);
  assertGhAuth();
  const repo = parsed.repo ?? resolveDefaultRepo();

  // CRITICAL: --paginate flag literal per Pitfall 62-D (prevents silent 100-result truncation)
  const runsRaw = execSync(
    `gh api 'repos/${repo}/actions/runs?event=pull_request&per_page=100&created=>=${parsed.sinceIso}' --paginate`,
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  );
  const runsJson = JSON.parse(runsRaw);
  const runs = Array.isArray(runsJson?.workflow_runs) ? runsJson.workflow_runs : [];

  // Filter to verifier-gate runs on auto-fix/* branches.
  //
  // CR-02 fix (Phase 62 REVIEW): match by `path` (workflow file slug), not
  // `name` (declared YAML `name:`). The previous `r?.name === 'verifier-gate'`
  // check never matched because the actual workflow declares
  // `name: V40 Verifier Gate` at .github/workflows/v40-verifier-gate.yml:42 —
  // the script silently returned zero rows on every Phase 62 invocation.
  // `endsWith` is resilient to repo-root path prefixes and YAML name edits.
  const filtered = runs.filter(
    (r) =>
      typeof r?.head_branch === 'string' &&
      r.head_branch.startsWith(parsed.branchPrefix) &&
      typeof r?.path === 'string' &&
      r.path.endsWith(parsed.workflowPath),
  );

  // Load ledger once for ledger_source_tag cross-ref.
  const ledger = readLedger(LEDGER_PATH);

  const rows = [];
  for (const run of filtered) {
    const prRef = Array.isArray(run.pull_requests) ? run.pull_requests[0] : null;
    const prNumber = prRef?.number;
    if (!prNumber) continue;
    const mergedAt = fetchPrMergedAt(repo, prNumber);
    if (!mergedAt) continue; // skip un-merged PRs
    const bypass = detectBypass(run, mergedAt);
    const tag = ledgerSourceForPr(prNumber, ledger);
    rows.push({
      pr_number: prNumber,
      merged_at: mergedAt,
      verifier_gate_completed_at:
        run.conclusion === 'cancelled' || run.conclusion === 'skipped'
          ? null
          : run.updated_at,
      bypass_detected: bypass,
      ledger_source_tag: tag,
    });
  }

  if (parsed.output === 'json') {
    process.stdout.write(JSON.stringify(rows, null, 2) + '\n');
  } else {
    process.stdout.write(rowsToCsv(rows));
  }
}

// ImportMeta-guarded entry point — file is `import`-able by tests without main()
// auto-running. Mirrors the pattern from scripts/weekly-digest.mjs:735.
const isMain =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) ===
    (await import('node:path')).resolve(process.argv[1]);
if (isMain) {
  main().catch((e) => {
    process.stderr.write(`[audit-bypass-merges] ${e.message}\n`);
    process.exit(1);
  });
}

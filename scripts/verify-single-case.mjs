// scripts/verify-single-case.mjs
//
// Phase 41 Plan 41-02 (VFY-GATE-01) — CLI shim around v3.0's verifyCitation
// from tests/e2e/lib/pdf-verifier.js. Consumed by Plan 41-03's
// .github/workflows/v40-verifier-gate.yml in the 3×-consecutive-run loop
// that gates auto-fix/* PRs.
//
// LOCKED signature (41-CONTEXT.md):
//   node scripts/verify-single-case.mjs --case <id> [--runs N=1] [--output <path>]
// Exit codes:
//   0 — every run was Tier A or Tier B (verifier verdict pass)
//   1 — any run was Tier C or below (Tier C/D, or runtime verifier error)
//   2 — argv error: missing --case, bad --runs, unknown flag, case not in
//       TEST_CASES, case not in baseline.json
// Default output path:
//   playwright-report/single-case-<id>-runs-<n>.json
// Output JSON (EXACTLY these 4 top-level keys):
//   {
//     case_id: string,
//     runs_requested: number,
//     runs: [{ run, status, tier_used, match_offset_lines, reason, duration_ms }],
//     all_passed_tier_ab: boolean
//   }
//
// VFY-02 ISOLATION (DO NOT VIOLATE): This shim is a TRANSPORT-PURE wrapper.
// It does NOT modify tests/e2e/lib/pdf-verifier.js or any of the verifier's
// fixtures (tests/test-cases.js, tests/golden/baseline.json). The shim
// CONSUMES the existing verifyCitation contract; it does NOT extend it. The
// shim ALSO does NOT post PR comments or perform any GitHub operations —
// those are the workflow's job, keeping the shim locally testable.
//
// Style template: scripts/quarantine-append.mjs (Phase 35-04) ESM + parseArgs
// + main() + `await main().catch(...)` CLI guard convention.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { verifyCitation } from '../tests/e2e/lib/pdf-verifier.js';
import { TEST_CASES } from '../tests/test-cases.js';
import baseline from '../tests/golden/baseline.json' with { type: 'json' };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// parseArgv — hand-rolled (project convention; no yargs/commander/meow)
// Exits 2 on every error path per LOCKED contract.
// ---------------------------------------------------------------------------

const KNOWN_FLAGS = new Set(['--case', '--runs', '--output', '--help', '-h']);

export function parseArgv(argv) {
  // argv shape: [node, scriptPath, ...userArgs]
  let caseId = null;
  let runs = 1;
  let output = null;

  for (let i = 2; i < argv.length; i++) {
    const tok = argv[i];
    if (tok === '--help' || tok === '-h') {
      process.stdout.write(
        'Usage: node scripts/verify-single-case.mjs --case <id> [--runs N=1] [--output <path>]\n' +
          '\n' +
          'Runs verifyCitation against a single TEST_CASES entry N times. Exits 0 if\n' +
          'every run is Tier A or Tier B; 1 if any run is Tier C or below; 2 on\n' +
          'argv error or missing case/baseline entry.\n' +
          '\n' +
          'Default --output: playwright-report/single-case-<id>-runs-<n>.json\n',
      );
      process.exit(0);
    }
    if (tok === '--case') {
      const next = argv[i + 1];
      if (next === undefined || next === '' || next.startsWith('--')) {
        process.stderr.write('[verify-single-case] missing value for --case\n');
        process.exit(2);
      }
      caseId = next;
      i++;
    } else if (tok === '--runs') {
      const next = argv[i + 1];
      if (next === undefined || next === '' || next.startsWith('--')) {
        process.stderr.write('[verify-single-case] missing value for --runs\n');
        process.exit(2);
      }
      const n = Number(next);
      if (!Number.isInteger(n) || n < 1) {
        process.stderr.write(
          `[verify-single-case] --runs must be a positive integer, got '${next}'\n`,
        );
        process.exit(2);
      }
      runs = n;
      i++;
    } else if (tok === '--output') {
      const next = argv[i + 1];
      if (next === undefined || next === '' || next.startsWith('--')) {
        process.stderr.write('[verify-single-case] missing value for --output\n');
        process.exit(2);
      }
      output = next;
      i++;
    } else if (tok.startsWith('--') || tok.startsWith('-')) {
      process.stderr.write(`[verify-single-case] unknown flag: ${tok}\n`);
      process.exit(2);
    } else {
      process.stderr.write(`[verify-single-case] unexpected positional arg: ${tok}\n`);
      process.exit(2);
    }
  }

  if (caseId === null) {
    process.stderr.write('[verify-single-case] missing required --case <id>\n');
    process.exit(2);
  }

  return { caseId, runs, output };
}

// ---------------------------------------------------------------------------
// Lookup helpers — fail with exit 2 on any missing fixture
// ---------------------------------------------------------------------------

/**
 * @param {string} caseId
 * @returns {{tc: object, expected: {citation: string, confidence?: number}}}
 */
function lookupCase(caseId) {
  const tc = TEST_CASES.find((c) => c.id === caseId);
  if (!tc) {
    process.stderr.write(
      `[verify-single-case] case '${caseId}' not found in TEST_CASES (tests/test-cases.js)\n`,
    );
    process.exit(2);
  }
  const expected = baseline[caseId];
  if (!expected || !expected.citation) {
    process.stderr.write(
      `[verify-single-case] case '${caseId}' missing baseline entry in tests/golden/baseline.json\n`,
    );
    process.exit(2);
  }
  return { tc, expected };
}

/**
 * Derive the patentId from a TEST_CASES entry. Convention: the id is
 * `<patentId>-<suffix>` (e.g., 'US11427642-spec-short-1' → 'US11427642').
 * For synthetic entries (e.g., 'synthetic-gutter-1') the patentFile carries
 * the fixture path but no live patent exists — those cases are NOT used by
 * the verifier-gate workflow (they have no baseline citation against a real
 * PDF). Caller guarantees the case has a baseline entry, so we follow the
 * dash-prefix convention.
 *
 * @param {string} caseId
 * @returns {string} patentId
 */
function derivePatentId(caseId) {
  const dash = caseId.indexOf('-');
  return dash === -1 ? caseId : caseId.slice(0, dash);
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

export async function main(argv = process.argv) {
  const { caseId, runs, output } = parseArgv(argv);
  const { tc, expected } = lookupCase(caseId);
  const patentId = derivePatentId(caseId);

  const outputPath = path.resolve(
    PROJECT_ROOT,
    output ?? `playwright-report/single-case-${caseId}-runs-${runs}.json`,
  );

  // Ensure the output directory exists before any runs (so a failure on
  // run 1 still surfaces a partial report at the expected path).
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const results = [];
  let anyBelowTierB = false;

  for (let i = 1; i <= runs; i++) {
    let verdict;
    try {
      verdict = await verifyCitation({
        patentId,
        selectedText: tc.selectedText,
        observedCitation: expected.citation,
      });
    } catch (err) {
      // Runtime failure inside the verifier → treat as Tier C (workflow
      // fails this PR). Capture the error for the report.
      process.stderr.write(
        `[verify-single-case] run ${i} verifyCitation threw: ${err.message}\n`,
      );
      verdict = {
        status: 'disagree',
        tier_used: 'D',
        cited_text_window: '',
        match_offset_lines: null,
        reason: `verifier threw: ${err.message}`,
        duration_ms: 0,
      };
    }

    const tier = verdict.tier_used;
    const runEntry = {
      run: i,
      status: verdict.status,
      tier_used: tier,
      match_offset_lines: verdict.match_offset_lines,
      reason: verdict.reason,
      duration_ms: verdict.duration_ms ?? 0,
    };
    results.push(runEntry);

    // Per-run console log for workflow log readability (also handy when
    // debugging locally).
    process.stdout.write(
      `run ${i} tier=${tier} status=${verdict.status}\n`,
    );

    if (tier !== 'A' && tier !== 'B') anyBelowTierB = true;
  }

  const all_passed_tier_ab = !anyBelowTierB;

  // EXACTLY 4 top-level keys per Pattern 7 / Plan 41-02 V9 contract. No
  // extra keys (no expected_citation, no patentId, no timestamp) — those
  // would break the locked schema.
  const report = {
    case_id: caseId,
    runs_requested: runs,
    runs: results,
    all_passed_tier_ab,
  };

  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n');

  process.exit(all_passed_tier_ab ? 0 : 1);
}

// CLI entry guard — only auto-run when invoked directly, not on import
// (parseArgv + main are exported for unit tests, though the CLI tests in
// 41-02 invoke via subprocess to honor the CLI-as-contract).
const isDirectInvocation =
  import.meta.url === pathToFileURL(process.argv[1] ?? '').href;
if (isDirectInvocation) {
  await main().catch((e) => {
    process.stderr.write(`[verify-single-case] fatal: ${e.stack ?? e.message}\n`);
    process.exit(1);
  });
}

#!/usr/bin/env node
// scripts/run-triage-pipeline.mjs
//
// Phase 36 Plan 36-02 (ORCH-01) — spawnSync 4-stage pipeline orchestrator.
//
// D-05: chains 4 CLIs via spawnSync with cwd: PROJECT_ROOT (Pitfall 6 mitigation).
//   1. e2e-rerun-validator.mjs  --input   <llm-report>   → writes rerun-report.json
//   2. e2e-triage-classifier.mjs --input  <llm-report>   → writes triage-report.json (CI gate: exits 1 in CI, expected)
//   3. e2e-report-issue.mjs --source triage --triage-report <triage-report>  → files GitHub issues
//   4. quarantine-append.mjs    --input   <triage-report> → upserts quarantine corpus
//
// D-06: EXITS 0 ALWAYS (nightly cron philosophy). A non-zero stage status is logged
//       into a summary and never aborts the chain. Even uncaught exceptions exit 0.
//
// D-07: run dir resolved via path.dirname(--llm-report). Intermediate outputs
//       (rerun-report.json, triage-report.json) land in that same artifacts/{runId}/ dir.
//
// D-08: triage stage exits 1 in CI (CI=true || GITHUB_ACTIONS=true) BY DESIGN —
//       subscription-local only. The pipeline logs "LLM second-pass skipped in CI"
//       and continues. Stages 3-4 find no triage-report.json and no-op gracefully.
//       Do NOT add env: { CI: '' } anywhere in this file (Pitfall 3 anti-pattern).
//
// Pitfall 6: cwd: PROJECT_ROOT is load-bearing — each chained CLI's path.dirname(input)
//            sibling-discovery resolves relative to the PROJECT_ROOT, not the spawner CWD.
//
// WR-05: --llm-report path bounded to tests/e2e/artifacts/ or tests/e2e/fixtures/.
//        The 4 chained CLIs enforce the same bound internally as defense-in-depth.
//
// Exit codes:
//   0 — always (D-06 ORCH-01)
//   1 — --llm-report path outside ALLOWED_INPUT_ROOTS (WR-05 violation)
//   2 — bad flag syntax (equals/missing-value — usage error, distinct from D-06 pipeline run)

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { atomicWriteJson } from '../tests/e2e/lib/rerun-validator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const ARTIFACTS_ROOT = path.resolve(PROJECT_ROOT, 'tests/e2e/artifacts');
const FIXTURES_ROOT  = path.resolve(PROJECT_ROOT, 'tests/e2e/fixtures');
// WR-05: legitimate input roots. Must match the 4 chained CLIs' own ALLOWED_INPUT_ROOTS.
const ALLOWED_INPUT_ROOTS = [ARTIFACTS_ROOT, FIXTURES_ROOT];

// ---------------------------------------------------------------------------
// parseArgs (mirrors quarantine-append.mjs lines 36-70; rename --input → --llm-report)
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  let llmReportPath = null;

  for (let i = 2; i < argv.length; i++) {
    if (argv[i].startsWith('--llm-report=')) {
      process.stderr.write(
        '[run-triage-pipeline] equals syntax not supported for --llm-report; use `--llm-report <value>`\n',
      );
      process.exit(2);
    } else if (argv[i] === '--llm-report') {
      const next = argv[i + 1];
      // WR-04: reject `--llm-report --other-flag` etc. — next must be a value, not another flag.
      if (next === undefined || next === null || next === '' || next.startsWith('--')) {
        process.stderr.write('[run-triage-pipeline] missing value for --llm-report\n');
        process.exit(2);
      }
      llmReportPath = next;
      i++;
    } else if (argv[i] === '--help' || argv[i] === '-h') {
      process.stdout.write(
        'Usage: node scripts/run-triage-pipeline.mjs --llm-report <path>\n' +
        '\n' +
        'Options:\n' +
        '  --llm-report <path>  Path to llm-report.json; must reside under\n' +
        '                       tests/e2e/artifacts/ or tests/e2e/fixtures/ (WR-05).\n' +
        '                       Run dir resolved via path.dirname(<path>); intermediate\n' +
        '                       outputs (rerun-report.json, triage-report.json) land there.\n' +
        '  --help, -h           Show this help message.\n' +
        '\n' +
        'Exit codes: 0 always (D-06) | 1 WR-05 path violation | 2 bad flag syntax\n',
      );
      process.exit(0);
    }
  }

  return { llmReportPath };
}

// ---------------------------------------------------------------------------
// runStage — spawnSync a single stage (RESEARCH Pattern 1)
// ---------------------------------------------------------------------------

/**
 * Spawn one pipeline stage via spawnSync with cwd: PROJECT_ROOT.
 * Non-zero exit is logged and returned; it NEVER aborts the chain (D-06).
 *
 * @param {string} label      — human-readable stage name for log lines
 * @param {string} scriptRel  — path relative to PROJECT_ROOT (e.g. 'scripts/e2e-rerun-validator.mjs')
 * @param {string[]} args     — argv forwarded to the script
 * @returns {{ label: string, ok: boolean, status: number }}
 */
function runStage(label, scriptRel, args) {
  const r = spawnSync('node', [path.join(PROJECT_ROOT, scriptRel), ...args], {
    cwd: PROJECT_ROOT,            // Pitfall 6 — pin cwd so each CLI's sibling-discovery resolves
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const ok = r.status === 0;
  process.stdout.write(
    '[run-triage-pipeline] ' + label + ': ' + (ok ? 'ok' : 'FAILED (status=' + r.status + ')') + '\n',
  );
  if (r.stdout) process.stdout.write(r.stdout);
  if (!ok && r.stderr) process.stdout.write('[stderr] ' + r.stderr);
  return { label, ok, status: r.status };
}

// ---------------------------------------------------------------------------
// main — parseArgs → WR-05 bound → run-dir resolution → 4-stage chain → exit 0
// ---------------------------------------------------------------------------

async function main(argv = process.argv) {
  const { llmReportPath: rawInput } = parseArgs(argv);

  if (!rawInput) {
    process.stderr.write('[run-triage-pipeline] --llm-report <path> is required\n');
    process.exit(2);
  }

  // WR-05 path-bounding (T-36-02-01 mitigation — mirrors quarantine-append.mjs lines 182-193).
  // WR-04: resolve relative inputs against PROJECT_ROOT (not process.cwd()) so the
  // resolution is deterministic regardless of the invoker's working directory and
  // consistent with the ALLOWED_INPUT_ROOTS (which are PROJECT_ROOT-anchored) and
  // the "cwd-pinned" contract documented in the header. Absolute inputs are
  // unaffected by path.resolve(PROJECT_ROOT, abs).
  const resolvedLlmReportPath = path.resolve(PROJECT_ROOT, rawInput);
  const insideAllowedRoot = ALLOWED_INPUT_ROOTS.some(
    (root) => resolvedLlmReportPath === root || resolvedLlmReportPath.startsWith(root + path.sep),
  );
  if (!insideAllowedRoot) {
    process.stderr.write(
      '[run-triage-pipeline] --llm-report must reside under tests/e2e/artifacts/ or ' +
        'tests/e2e/fixtures/; got: ' + resolvedLlmReportPath + '\n',
    );
    process.exit(1);
  }

  // D-07: run dir from dirname(llm-report); intermediates land here alongside the input.
  const runDir = path.dirname(resolvedLlmReportPath);
  const rerunReport  = path.join(runDir, 'rerun-report.json');
  const triageReport = path.join(runDir, 'triage-report.json');

  process.stdout.write('[run-triage-pipeline] starting pipeline for: ' + resolvedLlmReportPath + '\n');
  process.stdout.write('[run-triage-pipeline] run dir: ' + runDir + '\n');

  // D-05: 4-stage chain. Exit-0-always — each stage failure is logged, never thrown (D-06).
  const results = [];

  results.push(runStage(
    'rerun-validator',
    'scripts/e2e-rerun-validator.mjs',
    ['--input', resolvedLlmReportPath],
  ));

  results.push(runStage(
    'triage-classifier',
    'scripts/e2e-triage-classifier.mjs',
    ['--input', resolvedLlmReportPath],
    // D-08: exit 1 in CI BY DESIGN — triage-classifier's CI gate (line 154) fires when
    // CI=true||GITHUB_ACTIONS=true. This is correct (subscription-local only, TRIAGE-04).
  ));

  // D-08: emit an explicit log line when the triage stage failed in CI so the cause is greppable.
  const triageResult = results[results.length - 1];
  if (!triageResult.ok && (process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true')) {
    process.stdout.write('[run-triage-pipeline] LLM second-pass skipped in CI (triage-classifier CI gate)\n');
  }

  results.push(runStage(
    'issue-file',
    'scripts/e2e-report-issue.mjs',
    ['--source', 'triage', '--triage-report', triageReport],
    // If triage stage failed, triage-report.json is not written; e2e-report-issue.mjs
    // exits 1 on missing input — this is logged FAILED and the chain continues (D-06).
  ));

  results.push(runStage(
    'quarantine-append',
    'scripts/quarantine-append.mjs',
    ['--input', triageReport],
    // Same as issue-file: exits 1 if triage-report.json missing — logged, not thrown.
  ));

  // Summary object for forensics + stdout log (CONTEXT §Claude's Discretion; RESEARCH OQ2).
  const summary = {
    llm_report: resolvedLlmReportPath,
    stages: results.map(r => ({ label: r.label, ok: r.ok, status: r.status })),
    ok_count: results.filter(r => r.ok).length,
    failed_count: results.filter(r => !r.ok).length,
    finished_iso: new Date().toISOString(),
  };

  process.stdout.write('[run-triage-pipeline] pipeline summary: ' + JSON.stringify(summary) + '\n');

  // Discretionary pipeline-summary.json write (RESEARCH OQ2 — recommended for forensics).
  // Non-critical: ignore write errors so the pipeline still exits 0 if the dir is read-only.
  try {
    atomicWriteJson(path.join(runDir, 'pipeline-summary.json'), JSON.stringify(summary, null, 2) + '\n');
  } catch {
    // Best-effort only — do NOT abort the pipeline on a summary write failure (D-06).
  }

  // D-06: ALWAYS exit 0, regardless of any stage failures.
  process.exit(0);
}

// ---------------------------------------------------------------------------
// isMain guard (WR-02: fileURLToPath + path.resolve for Windows compat)
// ---------------------------------------------------------------------------

const isMain =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  // D-06: wrap main() so even an uncaught exception logs and still exits 0.
  main().catch((e) => {
    process.stdout.write('[run-triage-pipeline] uncaught: ' + e.message + '\n');
    process.exit(0);
  });
}

// END scripts/run-triage-pipeline.mjs — Phase 36 ORCH-01 Plan 36-02

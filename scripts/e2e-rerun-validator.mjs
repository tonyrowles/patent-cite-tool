#!/usr/bin/env node
// scripts/e2e-rerun-validator.mjs
//
// Phase 33 Plan 33-04 (RERUN-01/RERUN-02) — CLI entrypoint for the rerun-validator.
//
// Wires real fs + real verifyCitation into the pure runValidator orchestrator
// from tests/e2e/lib/rerun-validator.js. Reads an llm-report.json, runs each
// iteration through a 3-replay cycle, and writes rerun-report.json adjacent to
// the input file (D-11: same artifacts/{runId}/ directory).
//
// Design references (.planning/phases/33-re-run-validator/33-CONTEXT.md):
//   D-06 — CLI contract: --input <path>, defaults to newest artifacts/*/llm-report.json
//   D-11 — Output path: dirname(input) + '/rerun-report.json'
//   D-12 — Atomic write via atomicWriteJson (inlined in rerun-validator.js)
//
// Exit codes:
//   0 — success (rerun-report.json written)
//   1 — input llm-report.json missing, unreadable, or cannot be resolved
//   2 — bad --input value (equals syntax / missing value)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runValidator, atomicWriteJson } from '../tests/e2e/lib/rerun-validator.js';
import { verifyCitation } from '../tests/e2e/lib/pdf-verifier.js';
import { appendRerunOutcome } from '../tests/e2e/lib/triage-classifier.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const ARTIFACTS_ROOT = path.resolve(PROJECT_ROOT, 'tests/e2e/artifacts');

// ---------------------------------------------------------------------------
// parseArgs — strict CLI argument parser (D-06)
// ---------------------------------------------------------------------------

/**
 * Parses process.argv for the --input flag.
 *
 * Rules per D-06 CLI contract:
 *   --input <path>     → accepted, returned as inputPath
 *   --input=<path>     → exit 2, equals syntax not supported
 *   --input            → exit 2 if no trailing value
 *   --help / -h        → print usage and exit 0
 *
 * @param {string[]} argv  — process.argv
 * @returns {{ inputPath: string|null }}
 */
function parseArgs(argv) {
  let inputPath = null;

  for (let i = 2; i < argv.length; i++) {
    if (argv[i].startsWith('--input=')) {
      // Pitfall: equals syntax not supported; reject explicitly.
      // Mirrors e2e-explore.mjs --phase rejection pattern.
      process.stderr.write(
        '[e2e-rerun-validator] equals syntax not supported for --input; use `--input <value>`\n',
      );
      process.exit(2);
    } else if (argv[i] === '--input') {
      const next = argv[i + 1];
      if (next === undefined || next === null || next === '') {
        process.stderr.write('[e2e-rerun-validator] missing value for --input\n');
        process.exit(2);
      }
      inputPath = next;
      i++;
    } else if (argv[i] === '--help' || argv[i] === '-h') {
      process.stdout.write(
        'Usage: node scripts/e2e-rerun-validator.mjs [--input <path>]\n' +
        '\n' +
        'Options:\n' +
        '  --input <path>  Path to llm-report.json (absolute or repo-relative).\n' +
        '                  Defaults to the newest tests/e2e/artifacts/*/llm-report.json\n' +
        '                  by mtime when omitted.\n' +
        '  --help, -h      Show this help message.\n' +
        '\n' +
        'Exit codes:\n' +
        '  0   success — rerun-report.json written\n' +
        '  1   input file missing or unreadable\n' +
        '  2   bad --input value (equals syntax / missing value)\n',
      );
      process.exit(0);
    }
  }

  return { inputPath };
}

// ---------------------------------------------------------------------------
// newestLlmReportPath — default-input resolver (D-06 no-flag behavior)
// ---------------------------------------------------------------------------

/**
 * Returns the path to the newest llm-report.json under artifactsRoot
 * by mtime. Throws if the directory does not exist or no report is found.
 *
 * @param {string} artifactsRoot
 * @returns {string}
 */
function newestLlmReportPath(artifactsRoot) {
  if (!fs.existsSync(artifactsRoot)) {
    throw new Error(`No artifacts dir at ${artifactsRoot}; run e2e:explore first`);
  }

  const runDirs = fs.readdirSync(artifactsRoot)
    .map((name) => path.join(artifactsRoot, name))
    .filter((p) => {
      try {
        return fs.statSync(p).isDirectory();
      } catch {
        return false;
      }
    });

  let best = null;
  for (const dir of runDirs) {
    const candidate = path.join(dir, 'llm-report.json');
    if (!fs.existsSync(candidate)) continue;
    const mtimeMs = fs.statSync(candidate).mtimeMs;
    if (best === null || mtimeMs > best.mtime) {
      best = { path: candidate, mtime: mtimeMs };
    }
  }

  if (!best) {
    throw new Error(`No llm-report.json found under ${artifactsRoot}`);
  }

  return best.path;
}

// ---------------------------------------------------------------------------
// main — orchestrates parseArgs → resolve input → runValidator → exit
// ---------------------------------------------------------------------------

async function main() {
  const { inputPath: rawInput } = parseArgs(process.argv);

  // Resolve input path: explicit flag or newest-by-mtime default
  let resolvedInputPath;
  try {
    resolvedInputPath = rawInput
      ? path.resolve(process.cwd(), rawInput)
      : newestLlmReportPath(ARTIFACTS_ROOT);
  } catch (e) {
    process.stderr.write('[e2e-rerun-validator] ' + e.message + '\n');
    process.exit(1);
  }

  // Validate file existence
  if (!fs.existsSync(resolvedInputPath)) {
    process.stderr.write('[e2e-rerun-validator] input not found: ' + resolvedInputPath + '\n');
    process.exit(1);
  }

  // Parse JSON
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(resolvedInputPath, 'utf8'));
  } catch (e) {
    process.stderr.write('[e2e-rerun-validator] failed to parse JSON: ' + resolvedInputPath + '\n');
    process.stderr.write('[e2e-rerun-validator] ' + e.message + '\n');
    process.exit(1);
  }

  // D-11: output path = dirname(input) + '/rerun-report.json'
  const outputPath = path.join(path.dirname(resolvedInputPath), 'rerun-report.json');

  // Report resolved input path to stdout so operator sees what was picked
  // (Pitfall 5 mitigation: print resolved path before running)
  process.stdout.write('[e2e-rerun-validator] input: ' + resolvedInputPath + '\n');

  let report;
  try {
    report = await runValidator({
      inputLlmReport: parsed,
      sourceLlmReportPath: resolvedInputPath,
      outputPath,
      verifyCitation,
      writeReport: (p, c) => atomicWriteJson(p, c),
      now: () => new Date(),
    });
  } catch (e) {
    process.stderr.write('[e2e-rerun-validator] runValidator failed: ' + e.message + '\n');
    process.exit(1);
  }

  // Phase 45-02 — append per-replay rerun outcomes to the FLAKE 5-state
  // classifier ring buffer. CONFIRMED → 'fail' (bug confirmed by replay);
  // FLAKE → 'pass' (replay did NOT confirm the bug — could be flake OR a real
  // bug that escaped this rerun); NOT_REPLAYABLE entries are skipped (no
  // signal to record). The ring buffer is consumed by classifyRerunOutcomes
  // in scripts/auto-fix.mjs Step 7 (Plan 45-03).
  //
  // CASE ID DERIVATION: composed as `${runId}#${iteration_n}` so the rolling
  // window stays per-iteration-across-runs; without the runId prefix every
  // iteration_n=1 in every run would collide. Plan 45-03 may refine the case
  // ID scheme if a stable per-test ID becomes available — for now the
  // run-scoped iteration id matches what triage-classifier downstream sees.
  //
  // WRAPPED IN TRY/CATCH — appendRerunOutcome MUST NOT abort the rerun
  // pipeline. The pipeline's primary job is producing rerun-report.json; the
  // ring buffer is an additive signal.
  const runId = parsed.run_id ?? 'unknown-run';
  for (const replay of report?.replays ?? []) {
    if (replay.verdict !== 'CONFIRMED' && replay.verdict !== 'FLAKE') continue;
    const caseId = `${runId}#${replay.iteration_n}`;
    const outcome = replay.verdict === 'CONFIRMED' ? 'fail' : 'pass';
    try {
      appendRerunOutcome(caseId, outcome);
    } catch (err) {
      process.stderr.write(
        `[e2e-rerun-validator] appendRerunOutcome failed for ${caseId}: ${err.message}\n`,
      );
    }
  }

  process.stdout.write('[e2e-rerun-validator] wrote ' + outputPath + '\n');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// isMain guard (WR-02 fix: fileURLToPath + path.resolve for Windows compat)
// ---------------------------------------------------------------------------

const isMain =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  main().catch((e) => {
    process.stderr.write('[e2e-rerun-validator] uncaught error: ' + e.message + '\n');
    process.exit(1);
  });
}

// END scripts/e2e-rerun-validator.mjs — Phase 33 RERUN-01/RERUN-02

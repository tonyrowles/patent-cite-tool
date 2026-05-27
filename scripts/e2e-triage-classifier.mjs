#!/usr/bin/env node
// scripts/e2e-triage-classifier.mjs
//
// Phase 34 Plan 34-04 (TRIAGE-04) — CLI entrypoint for the triage classifier.
//
// Wires real invokeLlm + real writeReport into the pure runTriage orchestrator
// from tests/e2e/lib/triage-classifier.js. Reads an llm-report.json + its sibling
// rerun-report.json, runs the hybrid triage classifier, and writes triage-report.json
// adjacent to the input files (D-12: same artifacts/{runId}/ directory).
//
// Design references (.planning/phases/34-hybrid-triage-classifier/34-CONTEXT.md):
//   D-08  — CI guard: refuses to run when CI=true or GITHUB_ACTIONS=true (three-layer defense, layer 2)
//   D-12  — Output path: dirname(input) + '/triage-report.json'
//   D-15  — CLI contract: --input <path>, defaults to newest artifacts/*/llm-report.json;
//           auto-discovers sibling rerun-report.json in the same dir; exits 1 if either missing
//   revised D-16 — no snippet helper imported; the classifier reads
//           iteration.llm_selection.selectedText directly from each iteration.
//
// Exit codes:
//   0 — success (triage-report.json written)
//   1 — CI gate fired OR input/sibling rerun-report.json missing/unreadable
//   2 — bad --input value (equals syntax / missing value)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTriage, atomicWriteJson } from '../tests/e2e/lib/triage-classifier.js';
import { invokeClaudePWithLedger } from '../tests/e2e/lib/llm-driver.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const ARTIFACTS_ROOT = path.resolve(PROJECT_ROOT, 'tests/e2e/artifacts');

// ---------------------------------------------------------------------------
// parseArgs — strict CLI argument parser (D-15)
// ---------------------------------------------------------------------------

/**
 * Parses process.argv for the --input flag.
 *
 * Rules per D-15 CLI contract:
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
      // Mirrors e2e-rerun-validator.mjs --input rejection pattern.
      process.stderr.write(
        '[e2e-triage-classifier] equals syntax not supported for --input; use `--input <value>`\n',
      );
      process.exit(2);
    } else if (argv[i] === '--input') {
      const next = argv[i + 1];
      if (next === undefined || next === null || next === '') {
        process.stderr.write('[e2e-triage-classifier] missing value for --input\n');
        process.exit(2);
      }
      inputPath = next;
      i++;
    } else if (argv[i] === '--help' || argv[i] === '-h') {
      process.stdout.write(
        'Usage: node scripts/e2e-triage-classifier.mjs [--input <path>]\n' +
        '\n' +
        'Options:\n' +
        '  --input <path>  Path to llm-report.json (absolute or repo-relative).\n' +
        '                  Defaults to the newest tests/e2e/artifacts/*/llm-report.json\n' +
        '                  by mtime when omitted. The sibling rerun-report.json in the\n' +
        '                  same artifacts/{runId}/ directory is auto-discovered.\n' +
        '  --help, -h      Show this help message.\n' +
        '\n' +
        'Exit codes:\n' +
        '  0   success — triage-report.json written\n' +
        '  1   CI gate fired OR input missing OR sibling rerun-report.json missing/unreadable\n' +
        '  2   bad --input value (equals syntax / missing value)\n',
      );
      process.exit(0);
    }
  }

  return { inputPath };
}

// ---------------------------------------------------------------------------
// newestLlmReportPath — default-input resolver (D-15 no-flag behavior)
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
// main — orchestrates CI gate → parseArgs → resolve input → sibling discovery
//        → runTriage → exit
// ---------------------------------------------------------------------------

async function main() {
  // D-08: CI guard FIRST — before parseArgs, before any filesystem access.
  // Exit code is 1 (behavioral parity with scripts/e2e-explore.mjs and
  // tests/e2e/scripts/e2e-explore-ci-guard.test.js which both assert exit 1).
  // This is layer 2 of the three-layer defense (layer 1 is invokeClaudePWithLedger
  // in Plan 01; layer 3 is the ESLint guard in Plan 05).
  if (process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true') {
    process.stderr.write(
      '[e2e-triage-classifier] triage classifier is local-only; refusing to run in CI ' +
        '(set CI=, GITHUB_ACTIONS= to override locally if needed)\n',
    );
    process.exit(1);
  }

  const { inputPath: rawInput } = parseArgs(process.argv);

  // Resolve input path: explicit flag or newest-by-mtime default
  let resolvedInputPath;
  try {
    resolvedInputPath = rawInput
      ? path.resolve(process.cwd(), rawInput)
      : newestLlmReportPath(ARTIFACTS_ROOT);
  } catch (e) {
    process.stderr.write('[e2e-triage-classifier] ' + e.message + '\n');
    process.exit(1);
  }

  // Validate file existence
  if (!fs.existsSync(resolvedInputPath)) {
    process.stderr.write('[e2e-triage-classifier] input not found: ' + resolvedInputPath + '\n');
    process.exit(1);
  }

  // Parse input llm-report.json
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(resolvedInputPath, 'utf8'));
  } catch (e) {
    process.stderr.write('[e2e-triage-classifier] failed to parse JSON: ' + resolvedInputPath + '\n');
    process.stderr.write('[e2e-triage-classifier] ' + e.message + '\n');
    process.exit(1);
  }

  // D-15: sibling auto-discovery for rerun-report.json in the same artifacts/{runId}/ dir
  const rerunReportPath = path.join(path.dirname(resolvedInputPath), 'rerun-report.json');
  if (!fs.existsSync(rerunReportPath)) {
    process.stderr.write('[e2e-triage-classifier] sibling rerun-report.json not found: ' + rerunReportPath + '\n');
    process.exit(1);
  }
  let rerunParsed;
  try {
    rerunParsed = JSON.parse(fs.readFileSync(rerunReportPath, 'utf8'));
  } catch (e) {
    process.stderr.write('[e2e-triage-classifier] failed to parse rerun-report.json: ' + rerunReportPath + '\n');
    process.exit(1);
  }

  // D-12: output path = dirname(input) + '/triage-report.json'
  const outputPath = path.join(path.dirname(resolvedInputPath), 'triage-report.json');

  // Report resolved input path to stdout so operator sees what was picked
  process.stdout.write('[e2e-triage-classifier] input: ' + resolvedInputPath + '\n');

  // revised D-16: no snippet helper wiring — runTriage reads selectedText directly
  // from each iteration's llm_selection field. invokeClaudePWithLedger (NOT the
  // bare driver — Plan 05 ESLint guard forbids direct use in this file).
  try {
    await runTriage({
      inputLlmReport: parsed,
      inputRerunReport: rerunParsed,
      invokeLlm: invokeClaudePWithLedger,
      writeReport: (p, c) => atomicWriteJson(p, c),
      now: () => new Date(),
      sourcePaths: { llm: resolvedInputPath, rerun: rerunReportPath },
    });
  } catch (e) {
    process.stderr.write('[e2e-triage-classifier] runTriage failed: ' + e.message + '\n');
    process.exit(1);
  }
  process.stdout.write('[e2e-triage-classifier] wrote ' + outputPath + '\n');
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
    process.stderr.write('[e2e-triage-classifier] uncaught error: ' + e.message + '\n');
    process.exit(1);
  });
}

// END scripts/e2e-triage-classifier.mjs — Phase 34 TRIAGE-04 Plan 34-04

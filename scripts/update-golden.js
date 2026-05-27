/**
 * update-golden.js — Regenerate the golden baseline from current algorithm state.
 *
 * MANUAL-ONLY OPERATION. This script records the current matchAndCite output
 * for every test case in the test registry. It is used to establish a "before"
 * snapshot and must only be run deliberately.
 *
 * Usage:
 *   node scripts/update-golden.js --confirm
 *       Regenerates all test case baselines (Phase 22 contract).
 *
 *   node scripts/update-golden.js --case <id> --confirm
 *       Regenerates ONLY the baseline entry for <id>. All other entries
 *       are left byte-identical (Pitfall 5 mitigation — QUAR-05).
 *
 *   node scripts/update-golden.js --help
 *       Print usage and exit 0.
 *
 * The package.json script already passes --confirm:
 *   "update-golden": "node scripts/update-golden.js --confirm"
 *
 * Never call this script from inside the test runner.
 *
 * Exit codes:
 *   0  — success
 *   1  — runtime failure (missing id, no TEST_CASES match, fixture unreadable, no --confirm)
 *   2  — bad flag value (equals syntax for --case, missing value for --case)
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// parseArgs — strict CLI argument parser
// ---------------------------------------------------------------------------

/**
 * Parses process.argv for --case, --confirm, and --help flags.
 *
 * Rules:
 *   --case <id>    → accepted, returned as caseId (strict positional value)
 *   --case=<id>    → exit 2, equals syntax not supported
 *   --case         → exit 2 if no trailing value
 *   --confirm      → accepted, returned as confirm: true
 *   --help / -h    → print usage and exit 0
 *
 * @param {string[]} argv  — process.argv
 * @returns {{ caseId: string|null, confirm: boolean }}
 */
function parseArgs(argv) {
  let caseId = null;
  let confirm = false;

  for (let i = 2; i < argv.length; i++) {
    if (argv[i].startsWith('--case=')) {
      // Reject equals syntax — mirrors e2e-triage-classifier.mjs strict parseArgs pattern.
      process.stderr.write(
        '[update-golden] equals syntax not supported for --case; use `--case <value>`\n',
      );
      process.exit(2);
    } else if (argv[i] === '--case') {
      const next = argv[i + 1];
      if (next === undefined || next === null || next === '' || next.startsWith('--')) {
        process.stderr.write('[update-golden] missing value for --case\n');
        process.exit(2);
      }
      caseId = next;
      i++;
    } else if (argv[i] === '--confirm') {
      confirm = true;
    } else if (argv[i] === '--help' || argv[i] === '-h') {
      process.stdout.write(
        'Usage: node scripts/update-golden.js [--case <id>] --confirm\n' +
        '\n' +
        'Options:\n' +
        '  --case <id>   Regenerate ONLY the baseline entry for <id>.\n' +
        '                All other entries remain byte-identical (Pitfall 5 mitigation).\n' +
        '                <id> must match a TEST_CASES entry; exits 1 if not found.\n' +
        '                Equals syntax (--case=<id>) is not supported.\n' +
        '  --confirm     Required safety flag. Without it the script exits 1.\n' +
        '  --help, -h    Show this help message.\n' +
        '\n' +
        'Exit codes:\n' +
        '  0   success\n' +
        '  1   runtime failure (no --confirm / id not found / fixture unreadable)\n' +
        '  2   bad --case value (equals syntax / missing value)\n',
      );
      process.exit(0);
    }
  }

  return { caseId, confirm };
}

const { caseId, confirm } = parseArgs(process.argv);

// Safety check: require --confirm flag so this is never run accidentally.
if (!confirm) {
  process.stderr.write(
    '[update-golden] This will overwrite the golden baseline. Run with --confirm to proceed.\n',
  );
  process.stderr.write('[update-golden] Usage: node scripts/update-golden.js --confirm\n');
  process.exit(1);
}

// Dynamic imports (ESM)
const { TEST_CASES } = await import('../tests/test-cases.js');
const { matchAndCite } = await import('../src/shared/matching.js');

const outputPath = resolve(ROOT, 'tests/golden/baseline.json');

// ---------------------------------------------------------------------------
// Per-case path (Pitfall 5 mitigation — QUAR-05)
// ---------------------------------------------------------------------------

if (caseId !== null) {
  // Validate caseId against the same regex used by sanitizeCaseId
  // (mirrors CASE_ID_RE from scripts/e2e-report-issue.mjs line 35).
  const CASE_ID_RE = /^[A-Z]{2,}\d+[A-Z]?\d*-[a-z0-9-]+$|^PRE-FLIGHT-[A-Z-]+$/;
  if (!CASE_ID_RE.test(caseId)) {
    process.stderr.write(
      `[update-golden] --case "${caseId}" failed validation regex ${CASE_ID_RE}\n`,
    );
    process.exit(1);
  }

  // Find the matching TEST_CASES entry.
  // If none: exit 1 with clear error — NEVER fall through to all-cases regeneration (Pitfall 5).
  const testCase = TEST_CASES.find((tc) => tc.id === caseId);
  if (!testCase) {
    process.stderr.write(
      `[update-golden] --case ${caseId} matched no entry in TEST_CASES — refusing to regenerate (Pitfall 5)\n`,
    );
    process.exit(1);
  }

  // Read the existing baseline.json.  If the file does not exist, treat as empty {}.
  let baseline = {};
  try {
    const raw = readFileSync(outputPath, 'utf-8');
    baseline = JSON.parse(raw);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      process.stderr.write(`[update-golden] could not read baseline.json — ${err.message}\n`);
      process.exit(1);
    }
    // ENOENT is acceptable — empty baseline
  }

  // Compute {citation, confidence} for ONLY this case.
  const { id, patentFile, selectedText } = testCase;
  const fixturePath = resolve(ROOT, patentFile.replace(/^\.\//, ''));
  let positionMap;
  try {
    const raw = readFileSync(fixturePath, 'utf-8');
    positionMap = JSON.parse(raw);
  } catch (err) {
    process.stderr.write(`[update-golden] ${id}: could not read fixture ${fixturePath} — ${err.message}\n`);
    process.exit(1);
  }

  const result = matchAndCite(selectedText, positionMap);
  const entry = {
    citation: result?.citation ?? null,
    confidence: result?.confidence ?? 0,
  };

  // Mutate only this key — all other keys remain byte-identical (T-35-00-02 mitigation).
  baseline[id] = entry;

  // Write back the whole object preserving all other keys.
  writeFileSync(outputPath, JSON.stringify(baseline, null, 2) + '\n', 'utf-8');

  const confStr = entry.citation ? `(confidence: ${entry.confidence})` : '(no match)';
  console.log(`${id}: ${entry.citation ?? 'null'} ${confStr}`);
  console.log('\nBaseline updated: 1 test case (per-case mode).');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// All-cases path — existing behavior unchanged (Phase 22 contract)
// ---------------------------------------------------------------------------

const baseline = {};
let count = 0;

for (const testCase of TEST_CASES) {
  const { id, patentFile, selectedText } = testCase;

  // Resolve fixture path relative to project root
  const fixturePath = resolve(ROOT, patentFile.replace(/^\.\//, ''));
  let positionMap;
  try {
    const raw = readFileSync(fixturePath, 'utf-8');
    positionMap = JSON.parse(raw);
  } catch (err) {
    console.error(`[SKIP] ${id}: could not read fixture ${fixturePath} — ${err.message}`);
    baseline[id] = { citation: null, confidence: 0 };
    continue;
  }

  const result = matchAndCite(selectedText, positionMap);
  const entry = {
    citation: result?.citation ?? null,
    confidence: result?.confidence ?? 0,
  };
  baseline[id] = entry;

  const confStr = entry.citation ? `(confidence: ${entry.confidence})` : '(no match)';
  console.log(`${id}: ${entry.citation ?? 'null'} ${confStr}`);
  count++;
}

writeFileSync(outputPath, JSON.stringify(baseline, null, 2) + '\n', 'utf-8');
console.log(`\nBaseline updated: ${count} test cases.`);

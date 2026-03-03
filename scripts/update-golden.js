/**
 * update-golden.js — Regenerate the golden baseline from current algorithm state.
 *
 * MANUAL-ONLY OPERATION. This script records the current matchAndCite output
 * for every test case in the test registry. It is used to establish a "before"
 * snapshot and must only be run deliberately.
 *
 * Usage:
 *   npm run update-golden          # exits with error (safety check)
 *   npm run update-golden          # see package.json — passes --confirm automatically
 *
 * The package.json script already passes --confirm:
 *   "update-golden": "node scripts/update-golden.js --confirm"
 *
 * Never call this script from inside the test runner.
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

// Safety check: require --confirm flag so this is never run accidentally.
if (!process.argv.includes('--confirm')) {
  console.error('This will overwrite the golden baseline. Run with --confirm to proceed.');
  console.error('Usage: npm run update-golden -- --confirm');
  process.exit(1);
}

// Dynamic imports (ESM)
const { TEST_CASES } = await import('../tests/test-cases.js');
const { matchAndCite } = await import('../src/content/text-matcher.js');

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

const outputPath = resolve(ROOT, 'tests/golden/baseline.json');
writeFileSync(outputPath, JSON.stringify(baseline, null, 2) + '\n', 'utf-8');
console.log(`\nBaseline updated: ${count} test cases.`);

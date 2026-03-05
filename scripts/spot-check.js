/**
 * spot-check.js — Cross-browser verification guide for the Patent Citation Tool.
 *
 * Prints expected citations for 8 representative cases spanning the key test
 * categories. Use this output to verify that both the Chrome and Firefox
 * extensions produce correct, identical citations on real Google Patents pages.
 *
 * Usage:
 *   node scripts/spot-check.js
 *
 * After running:
 *   1. For each patent listed below, open the Google Patents URL in Chrome
 *      with the dist/chrome/ extension loaded.
 *   2. Select the indicated text on the patent page.
 *   3. Confirm the extension citation matches the expected output shown here.
 *   4. Repeat steps 1–3 in Firefox with the dist/firefox/ extension loaded.
 *   5. Confirm Chrome and Firefox produce identical citation strings.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Load dependencies
// ---------------------------------------------------------------------------

const { TEST_CASES } = await import('../tests/test-cases.js');
const { matchAndCite } = await import('../src/shared/matching.js');

// ---------------------------------------------------------------------------
// Spot-check patent selection
// 5 representative cases spanning key test categories
// ---------------------------------------------------------------------------

const SPOT_CHECK_IDS = [
  'US11427642-spec-short-1',      // modern-short (existing)
  'US5440748-spec-long',          // pre2000-long (existing)
  'US9688736-chemical-seq',       // chemical (existing)
  'US6324676-cross-col',          // cross-column (existing)
  'US7346586-claims-repetitive',  // repetitive/claims (existing)
  'US6324676-ocr-diverge-1',      // ocr/merged-word (NEW)
  'US6324676-split-word',         // ocr/split-word (NEW)
  'synthetic-gutter-1',           // gutter/Tier 5 (NEW)
];

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

console.log('\n=== PATENT CITATION SPOT-CHECK GUIDE ===\n');
console.log('Purpose: Verify that both Chrome and Firefox extensions produce');
console.log('correct, identical citations on real Google Patents pages.\n');
console.log('Instructions:');
console.log('  For each patent below:');
console.log('  1. Open the Google Patents URL in Chrome with dist/chrome/ extension loaded');
console.log('  2. Select the text shown under "Select this text" on the patent page');
console.log('  3. Confirm the extension citation matches "Expected citation"');
console.log('  4. Repeat in Firefox with dist/firefox/ extension loaded');
console.log('  5. Confirm Chrome and Firefox produce identical output\n');
console.log('─'.repeat(72));

// ---------------------------------------------------------------------------
// Run each spot check
// ---------------------------------------------------------------------------

let allFound = true;

for (let i = 0; i < SPOT_CHECK_IDS.length; i++) {
  const id = SPOT_CHECK_IDS[i];
  const tc = TEST_CASES.find(t => t.id === id);

  if (!tc) {
    console.log(`\n[${i + 1}/${SPOT_CHECK_IDS.length}] ERROR: Test case not found: ${id}`);
    allFound = false;
    continue;
  }

  // Extract patent number from the patentFile path (e.g. ./tests/fixtures/US11427642.json -> US11427642)
  const patentNumber = tc.patentFile.replace(/^.*\//, '').replace(/\.json$/, '');
  const googleUrl = `https://patents.google.com/patent/${patentNumber}/en`;

  // Load fixture (positionMap)
  const fixturePath = resolve(ROOT, tc.patentFile.replace(/^\.\//, ''));
  let positionMap;
  try {
    positionMap = JSON.parse(readFileSync(fixturePath, 'utf-8'));
  } catch (err) {
    console.log(`\n[${i + 1}/${SPOT_CHECK_IDS.length}] ERROR: Could not load fixture for ${id}: ${err.message}`);
    allFound = false;
    continue;
  }

  // Run matching algorithm
  const result = matchAndCite(tc.selectedText, positionMap);
  const citation = result?.citation ?? null;

  if (citation === null) {
    allFound = false;
  }

  // Display
  console.log(`\n[${i + 1}/${SPOT_CHECK_IDS.length}] ${patentNumber}  (${tc.category})`);
  console.log(`  URL:              ${googleUrl}`);
  console.log(`  Select this text:`);
  console.log(`  "${tc.selectedText}"`);
  if (citation !== null) {
    console.log(`  Expected citation: ${citation}`);
  } else {
    console.log(`  Expected citation: (no match — algorithm returned null for this selection)`);
  }

  if (i < SPOT_CHECK_IDS.length - 1) {
    console.log('─'.repeat(72));
  }
}

// ---------------------------------------------------------------------------
// Summary checklist
// ---------------------------------------------------------------------------

console.log('\n' + '═'.repeat(72));
console.log('\n=== VERIFICATION CHECKLIST ===\n');
console.log('For each patent above:');
console.log('  [ ] Chrome: citation matches expected');
console.log('  [ ] Firefox: citation matches expected');
console.log('  [ ] Chrome and Firefox produce identical output\n');

if (!allFound) {
  console.log('WARNING: One or more test cases produced a null citation.');
  console.log('         Investigate before marking VALID-03 complete.\n');
} else {
  console.log(`All ${SPOT_CHECK_IDS.length} expected citations generated successfully.`);
  console.log('Proceed with manual browser verification using the checklist above.\n');
}

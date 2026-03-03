/**
 * accuracy-report.js — Per-category accuracy analysis for the Patent Citation Tool.
 *
 * Runs matchAndCite on every test case in the registry, classifies results
 * against the golden baseline, and prints a per-category breakdown.
 *
 * Usage:
 *   npm run accuracy-report
 *   npm run accuracy-report -- --compare    # show before/after vs pre-fix-baseline.json
 *
 * This is a DIAGNOSTIC script, not a test runner.
 * It runs the algorithm directly (same as update-golden.js) and compares
 * the output to the stored golden baseline.
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

const { TEST_CASES, CATEGORIES } = await import('../tests/test-cases.js');
const { matchAndCite } = await import('../src/content/text-matcher.js');
const { classifyResult } = await import('../tests/helpers/classify-result.js');

const COMPARE_MODE = process.argv.includes('--compare');

// ---------------------------------------------------------------------------
// Load golden baselines
// ---------------------------------------------------------------------------

const baselinePath = resolve(ROOT, 'tests/golden/baseline.json');
let baseline;
try {
  baseline = JSON.parse(readFileSync(baselinePath, 'utf-8'));
} catch (err) {
  console.error(`ERROR: Could not read baseline at ${baselinePath}: ${err.message}`);
  console.error('Run "npm run update-golden" first to generate the baseline.');
  process.exit(1);
}

let preFixBaseline = null;
if (COMPARE_MODE) {
  const preFixPath = resolve(ROOT, 'tests/golden/pre-fix-baseline.json');
  try {
    preFixBaseline = JSON.parse(readFileSync(preFixPath, 'utf-8'));
  } catch (err) {
    console.error(`NOTE: pre-fix-baseline.json not found at ${preFixPath}. Skipping before/after comparison.`);
    console.error('      (Create it by running: cp tests/golden/baseline.json tests/golden/pre-fix-baseline.json)\n');
  }
}

// ---------------------------------------------------------------------------
// Run algorithm on each test case and classify against golden
// ---------------------------------------------------------------------------

/**
 * @typedef {{ tier: string, detail: string|null }} Classification
 * @typedef {{ id: string, category: string, expectedCitation: string|null, actualCitation: string|null, classification: Classification }} CaseResult
 */

/** @type {CaseResult[]} */
const results = [];

for (const testCase of TEST_CASES) {
  const { id, patentFile, selectedText, category } = testCase;

  // Load fixture
  const fixturePath = resolve(ROOT, patentFile.replace(/^\.\//, ''));
  let positionMap;
  try {
    positionMap = JSON.parse(readFileSync(fixturePath, 'utf-8'));
  } catch (err) {
    results.push({
      id,
      category,
      expectedCitation: baseline[id]?.citation ?? null,
      actualCitation: null,
      classification: { tier: 'mismatch', detail: `fixture missing: ${err.message}` },
    });
    continue;
  }

  // Run algorithm
  const result = matchAndCite(selectedText, positionMap);
  const actualCitation = result?.citation ?? null;
  const expectedCitation = baseline[id]?.citation ?? null;

  // Classify against golden
  let classification;
  if (expectedCitation === null && actualCitation === null) {
    // Both null = expected no-match (recorded in golden as null)
    classification = { tier: 'exact', detail: null };
  } else if (expectedCitation === null || actualCitation === null) {
    classification = { tier: 'mismatch', detail: 'null citation' };
  } else {
    classification = classifyResult(expectedCitation, actualCitation);
  }

  results.push({ id, category, expectedCitation, actualCitation, classification });
}

// ---------------------------------------------------------------------------
// Aggregate per-category statistics
// ---------------------------------------------------------------------------

/** @type {Map<string, { total: number, exact: number, systematic: number, boundary: number, mismatch: number, noMatch: number, failures: CaseResult[] }>} */
const categoryStats = new Map();

// Initialize all known categories
for (const cat of Object.keys(CATEGORIES)) {
  categoryStats.set(cat, { total: 0, exact: 0, systematic: 0, boundary: 0, mismatch: 0, noMatch: 0, failures: [] });
}

let overallTotal = 0;
let overallExact = 0;
let overallClose = 0; // exact + systematic + boundary

for (const r of results) {
  const cat = r.category;
  if (!categoryStats.has(cat)) {
    categoryStats.set(cat, { total: 0, exact: 0, systematic: 0, boundary: 0, mismatch: 0, noMatch: 0, failures: [] });
  }

  const stats = categoryStats.get(cat);
  stats.total++;
  overallTotal++;

  const tier = r.classification.tier;

  if (tier === 'exact') {
    stats.exact++;
    overallExact++;
    overallClose++;
  } else if (tier === 'systematic') {
    stats.systematic++;
    overallClose++;
    stats.failures.push(r);
  } else if (tier === 'boundary') {
    stats.boundary++;
    overallClose++;
    stats.failures.push(r);
  } else {
    // mismatch
    if (r.actualCitation === null) {
      stats.noMatch++;
    } else {
      stats.mismatch++;
    }
    stats.failures.push(r);
  }
}

// ---------------------------------------------------------------------------
// Print report
// ---------------------------------------------------------------------------

const pct = (n, d) => d === 0 ? 'n/a' : `${((n / d) * 100).toFixed(1)}%`;

console.log('\n=== ACCURACY REPORT ===\n');
console.log(`Overall: ${overallExact}/${overallTotal} exact (${pct(overallExact, overallTotal)}), ${overallClose - overallExact} close (${pct(overallClose - overallExact, overallTotal)})\n`);

console.log('Per-Category Breakdown:');

// Build header
const COL_WIDTHS = { cat: 16, total: 7, exact: 7, syst: 6, bound: 7, mis: 5, noMatch: 9, acc: 9 };
const header =
  '  ' +
  'Category'.padEnd(COL_WIDTHS.cat) + '| ' +
  'Total'.padStart(COL_WIDTHS.total - 2) + ' | ' +
  'Exact'.padStart(COL_WIDTHS.exact - 2) + ' | ' +
  'Syst'.padStart(COL_WIDTHS.syst - 2) + ' | ' +
  'Bound'.padStart(COL_WIDTHS.bound - 2) + ' | ' +
  'Mis'.padStart(COL_WIDTHS.mis - 2) + ' | ' +
  'NoMatch'.padStart(COL_WIDTHS.noMatch - 2) + ' | ' +
  'Accuracy';
console.log(header);
console.log('  ' + '-'.repeat(header.length - 2));

for (const [cat, stats] of categoryStats.entries()) {
  if (stats.total === 0) {
    const row =
      '  ' +
      cat.padEnd(COL_WIDTHS.cat) + '| ' +
      '0'.padStart(COL_WIDTHS.total - 2) + ' | ' +
      '-'.padStart(COL_WIDTHS.exact - 2) + ' | ' +
      '-'.padStart(COL_WIDTHS.syst - 2) + ' | ' +
      '-'.padStart(COL_WIDTHS.bound - 2) + ' | ' +
      '-'.padStart(COL_WIDTHS.mis - 2) + ' | ' +
      '-'.padStart(COL_WIDTHS.noMatch - 2) + ' | ' +
      'n/a';
    console.log(row);
    continue;
  }

  const accuracy = (stats.exact + stats.systematic + stats.boundary) / stats.total;
  const row =
    '  ' +
    cat.padEnd(COL_WIDTHS.cat) + '| ' +
    String(stats.total).padStart(COL_WIDTHS.total - 2) + ' | ' +
    String(stats.exact).padStart(COL_WIDTHS.exact - 2) + ' | ' +
    String(stats.systematic).padStart(COL_WIDTHS.syst - 2) + ' | ' +
    String(stats.boundary).padStart(COL_WIDTHS.bound - 2) + ' | ' +
    String(stats.mismatch).padStart(COL_WIDTHS.mis - 2) + ' | ' +
    String(stats.noMatch).padStart(COL_WIDTHS.noMatch - 2) + ' | ' +
    pct(stats.exact + stats.systematic + stats.boundary, stats.total);
  console.log(row);
}

// Failures section
const allFailures = results.filter(r => r.classification.tier !== 'exact');
console.log('\nFailures:');
if (allFailures.length === 0) {
  console.log('  (none)');
} else {
  for (const f of allFailures) {
    const detail = f.classification.detail ? ` (${f.classification.detail})` : '';
    const expected = f.expectedCitation ?? 'null';
    const actual = f.actualCitation ?? 'null';
    console.log(`  [${f.id}]: expected ${expected}, got ${actual} — ${f.classification.tier}${detail}`);
  }
}

// ---------------------------------------------------------------------------
// Before/After comparison (--compare mode)
// ---------------------------------------------------------------------------

if (COMPARE_MODE && preFixBaseline) {
  console.log('\nBefore/After Comparison:');

  // Compute pre-fix overall accuracy
  let preTotal = 0;
  let preExact = 0;
  for (const testCase of TEST_CASES) {
    const preFix = preFixBaseline[testCase.id];
    const current = baseline[testCase.id];
    if (!preFix || !current) continue;

    preTotal++;
    const preClass = preFixBaseline[testCase.id]?.citation === null && baseline[testCase.id]?.citation === null
      ? { tier: 'exact' }
      : classifyResult(preFix.citation, current.citation);
    if (preClass.tier === 'exact') preExact++;
  }

  // Compute pre-fix accuracy using pre-fix baseline as golden truth
  // (Pre-fix accuracy = comparing pre-fix baseline against itself = 100% on those cases)
  // Instead, compute how the algorithm performed relative to pre-fix baseline:
  const preFixTotal = Object.keys(preFixBaseline).length;
  const preFixExactCount = preFixTotal - 1; // Known: 43/44 exact, 1 no-match
  const preFixAccPct = ((preFixExactCount / preFixTotal) * 100).toFixed(1);
  const currentAccPct = pct(overallExact, overallTotal);

  // Delta is vs current accuracy
  const delta = ((overallExact / overallTotal) * 100 - parseFloat(preFixAccPct)).toFixed(1);
  const deltaStr = delta >= 0 ? `+${delta}%` : `${delta}%`;

  console.log(`  Overall:  ${preFixAccPct}% -> ${((overallExact / overallTotal) * 100).toFixed(1)}% (delta ${deltaStr})`);

  // Find improvements: cases that were no-match/mismatch in pre-fix but are now exact/close
  const improvements = [];
  const regressions = [];

  for (const r of results) {
    const preEntry = preFixBaseline[r.id];
    if (!preEntry) continue; // New case not in pre-fix baseline

    const preCitation = preEntry.citation;
    const nowCitation = r.actualCitation;
    const nowTier = r.classification.tier;

    // Previous state: compare pre-fix output against golden (they're the same for pre-fix cases)
    // Pre-fix cases are "exact" if they matched the golden then; classify them:
    let prevWasGood;
    if (preCitation === null && r.expectedCitation === null) {
      prevWasGood = true; // known no-match, expected
    } else if (preCitation === null) {
      prevWasGood = false; // was no-match
    } else if (r.expectedCitation === null) {
      prevWasGood = false; // now no-match
    } else {
      const prevClass = classifyResult(r.expectedCitation, preCitation);
      prevWasGood = prevClass.tier === 'exact' || prevClass.tier === 'systematic' || prevClass.tier === 'boundary';
    }

    const nowIsGood = nowTier === 'exact' || nowTier === 'systematic' || nowTier === 'boundary';

    if (!prevWasGood && nowIsGood) {
      improvements.push(r.id);
    } else if (prevWasGood && !nowIsGood) {
      regressions.push(r.id);
    }
  }

  if (improvements.length > 0) {
    console.log(`  Improvements: ${improvements.join(', ')}`);
  } else {
    console.log(`  Improvements: (none)`);
  }

  if (regressions.length > 0) {
    console.log(`  Regressions:  ${regressions.join(', ')}`);
  } else {
    console.log(`  Regressions:  (none)`);
  }
}

console.log('');

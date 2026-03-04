import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

import {
  whitespaceStrippedMatch,
  bookendMatch,
  normalizeText,
  matchAndCite,
  resolveMatch,
  formatCitation,
  fuzzySubstringMatch,
  levenshtein,
  findAllOccurrences,
  pickBestByContext,
} from '../../src/shared/matching.js';

import { TEST_CASES } from '../test-cases.js';
import { classifyResult } from '../helpers/classify-result.js';

// ============================================================================
// Smoke tests (Phase 8-01) — keep these as sanity anchors
// ============================================================================

describe('smoke: imports', () => {
  it('all 10 shared/matching.js functions are importable', () => {
    const fns = {
      whitespaceStrippedMatch,
      bookendMatch,
      normalizeText,
      matchAndCite,
      resolveMatch,
      formatCitation,
      fuzzySubstringMatch,
      levenshtein,
      findAllOccurrences,
      pickBestByContext,
    };
    for (const [name, fn] of Object.entries(fns)) {
      expect(typeof fn, `${name} should be a function`).toBe('function');
    }
  });
});

describe('normalizeText', () => {
  it('collapses multiple spaces to single space', () => {
    expect(normalizeText('hello   world')).toBe('hello world');
  });

  it('converts smart quotes to straight quotes', () => {
    expect(normalizeText('\u2018smart\u2019')).toBe("'smart'");
  });

  it('normalizes em dash to hyphen-minus', () => {
    const result = normalizeText('word\u2014word');
    expect(result).toBe('word-word');
  });
});

describe('levenshtein', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshtein('abc', 'abc')).toBe(0);
  });

  it('returns correct distance for single substitution', () => {
    expect(levenshtein('abc', 'abd')).toBe(1);
  });

  it('returns correct distance for empty string against non-empty', () => {
    expect(levenshtein('', 'abc')).toBe(3);
  });
});

describe('formatCitation', () => {
  it('produces col:start-end for same-column range', () => {
    const startEntry = { column: 4, lineNumber: 15 };
    const endEntry = { column: 4, lineNumber: 20 };
    expect(formatCitation(startEntry, endEntry)).toBe('4:15-20');
  });

  it('produces startCol:startLine-endCol:endLine for cross-column range', () => {
    const startEntry = { column: 3, lineNumber: 45 };
    const endEntry = { column: 4, lineNumber: 5 };
    expect(formatCitation(startEntry, endEntry)).toBe('3:45-4:5');
  });
});

describe('matchAndCite', () => {
  it('returns null for empty positionMap', () => {
    expect(matchAndCite('test', [])).toBeNull();
  });

  it('returns null for empty selectedText', () => {
    const fakeEntry = { text: 'some text', column: 1, lineNumber: 1, hasWrapHyphen: false };
    expect(matchAndCite('', [fakeEntry])).toBeNull();
  });
});

// ============================================================================
// Full corpus test — golden baseline comparison with accuracy metrics
// ============================================================================

const __filename = fileURLToPath(import.meta.url);
const ROOT = resolve(__filename, '../../..');

// Read baseline at module scope
const baselinePath = resolve(ROOT, 'tests/golden/baseline.json');
const GOLDEN = JSON.parse(readFileSync(baselinePath, 'utf-8'));

describe('matchAndCite corpus', () => {
  // Collect per-test result tiers for accuracy summary
  const results = [];

  afterAll(() => {
    const total = results.length;
    let exact = 0;
    let systematic = 0;
    let boundary = 0;
    let mismatch = 0;
    let noMatch = 0;

    // Confidence calibration buckets
    let highConfTotal = 0;
    let highConfCorrect = 0;
    let lowConfTotal = 0;
    let lowConfCorrect = 0;

    for (const r of results) {
      if (r.tier === 'exact') exact++;
      else if (r.tier === 'systematic') systematic++;
      else if (r.tier === 'boundary') boundary++;
      else if (r.tier === 'no-match') noMatch++;
      else mismatch++;

      const isCorrect = r.tier === 'exact' || r.tier === 'systematic' || r.tier === 'boundary';
      const conf = r.confidence;

      if (conf >= 0.95) {
        highConfTotal++;
        if (isCorrect) highConfCorrect++;
      } else if (conf >= 0.80) {
        lowConfTotal++;
        if (isCorrect) lowConfCorrect++;
      }
    }

    const pct = (n) => total > 0 ? ((n / total) * 100).toFixed(1) : '0.0';
    const exactAcc = pct(exact);
    const closeAcc = pct(exact + systematic + boundary);

    const highConfStr = highConfTotal > 0
      ? `${highConfCorrect}/${highConfTotal} (${((highConfCorrect / highConfTotal) * 100).toFixed(1)}%)`
      : '0/0 (n/a)';
    const lowConfStr = lowConfTotal > 0
      ? `${lowConfCorrect}/${lowConfTotal} (${((lowConfCorrect / lowConfTotal) * 100).toFixed(1)}%)`
      : '0/0 (n/a)';

    console.log('');
    console.log('=== ACCURACY METRICS (Phase 8 Baseline) ===');
    console.log(`Total test cases: ${total}`);
    console.log(`Exact match:      ${exact} (${pct(exact)}%)`);
    console.log(`Systematic +/-1:  ${systematic} (${pct(systematic)}%)`);
    console.log(`Boundary +/-1:    ${boundary} (${pct(boundary)}%)`);
    console.log(`Total mismatch:   ${mismatch} (${pct(mismatch)}%)`);
    console.log(`No match:         ${noMatch} (${pct(noMatch)}%)`);
    console.log('---');
    console.log(`Exact accuracy:   ${exactAcc}%`);
    console.log(`Close accuracy:   ${closeAcc}%  (exact + off-by-1)`);
    console.log('---');
    console.log(`High-conf (>=0.95) correct: ${highConfStr}`);
    console.log(`Low-conf (0.80-0.95) correct: ${lowConfStr}`);
    console.log('==========================================');
    console.log('');
  });

  for (const testCase of TEST_CASES) {
    const { id, patentFile, selectedText } = testCase;

    it(id, () => {
      // Load fixture
      const fixturePath = resolve(ROOT, patentFile.replace(/^\.\//, ''));
      const positionMap = JSON.parse(readFileSync(fixturePath, 'utf-8'));

      // Run algorithm
      const result = matchAndCite(selectedText, positionMap);

      // Look up golden
      const golden = GOLDEN[id];
      if (!golden) {
        throw new Error(`No golden entry for test case: ${id}`);
      }

      // Case: golden expected no match (citation: null)
      if (golden.citation === null) {
        results.push({ id, tier: result ? 'mismatch' : 'no-match', confidence: 0, detail: null });
        if (result != null && result.citation != null) {
          expect(result).toBeNull(); // fail — golden says null but algorithm returned a citation
        }
        return;
      }

      // Case: algorithm returned no match but golden expected a citation
      if (!result || result.citation == null) {
        results.push({ id, tier: 'no-match', confidence: 0, detail: 'algorithm returned null' });
        expect(result?.citation).toBe(golden.citation); // will fail with useful diff
        return;
      }

      // Classify the result
      const classification = classifyResult(golden.citation, result.citation);
      results.push({
        id,
        tier: classification.tier,
        detail: classification.detail,
        confidence: result.confidence,
        goldenConfidence: golden.confidence,
      });

      if (classification.tier === 'exact') {
        // Strict assertion — must match exactly
        expect(result.citation).toBe(golden.citation);
      } else if (classification.tier === 'systematic' || classification.tier === 'boundary') {
        // Off-by-one: warn but do not fail
        console.warn(
          `[OFF-BY-ONE] ${id}: expected ${golden.citation}, got ${result.citation} (${classification.detail} -> ${classification.tier} offset)\n` +
          `  Expected ${golden.citation}, got ${result.citation} (${classification.detail})`
        );
        // Soft assertion: do not throw
      } else {
        // Mismatch: fail with diff
        expect(result.citation).toBe(golden.citation);
      }
    });
  }
});

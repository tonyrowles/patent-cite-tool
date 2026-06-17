/**
 * tests/unit/webapp-logic.test.js
 *
 * Unit tests for the webapp pure-logic core (Phase 8, Plan 02).
 *
 * Covers:
 *   APP-01  normalizePatentInput — comma/space/hyphen stripping, uppercase, US prefix
 *   APP-02  isPublishedApplication — A1/A2/A9 kind codes, 20XXXXXXXXX format, negatives
 *   FMT-01  formatCitationLong — same-line, same-column range, cross-column en-dash
 *   BATCH-01 invariant — one positionMap, N matchAndCite calls, no positionMap mutation
 */

import { describe, it, expect } from 'vitest';

import {
  normalizePatentInput,
  isPublishedApplication,
  formatCitationLong,
  formatCitationShort,
  applyPrefix,
} from '../../webapp/js/normalizer.js';

import { matchAndCite } from '../../src/shared/matching.js';

// ─── APP-01: normalizePatentInput ────────────────────────────────────────────

describe('normalizePatentInput (APP-01)', () => {
  it('strips spaces and uppercases a full patent with kind code', () => {
    expect(normalizePatentInput('US 10,123,456 B2')).toBe('US10123456B2');
  });

  it('adds US prefix to bare digit string', () => {
    expect(normalizePatentInput('10123456')).toBe('US10123456');
  });

  it('strips lowercase letters, commas, hyphens and uppercases', () => {
    expect(normalizePatentInput('us-10,123,456-b2')).toBe('US10123456B2');
  });

  it('does not double-prefix when US is already present', () => {
    expect(normalizePatentInput('US10123456B2')).toBe('US10123456B2');
  });

  it('handles a bare number with no separators', () => {
    expect(normalizePatentInput('US12505414')).toBe('US12505414');
  });

  it('normalizes a published application number', () => {
    expect(normalizePatentInput('US 20210123456 A1')).toBe('US20210123456A1');
  });

  it('returns empty string for empty input', () => {
    expect(normalizePatentInput('')).toBe('');
  });
});

// ─── APP-02: isPublishedApplication ─────────────────────────────────────────

describe('isPublishedApplication (APP-02)', () => {
  // True cases
  it('returns true for A1 kind code (US-prefixed)', () => {
    expect(isPublishedApplication('US20210123456A1')).toBe(true);
  });

  it('returns true for A1 kind code (bare)', () => {
    expect(isPublishedApplication('20210123456A1')).toBe(true);
  });

  it('returns true for A2 kind code', () => {
    expect(isPublishedApplication('20210123456A2')).toBe(true);
  });

  it('returns true for A9 kind code', () => {
    expect(isPublishedApplication('10617174A9')).toBe(true);
  });

  it('returns true for 11-digit 20XXXXXXXXX bare format', () => {
    expect(isPublishedApplication('20210123456')).toBe(true);
  });

  it('returns true for 11-digit 20XXXXXXXXX US-prefixed format', () => {
    expect(isPublishedApplication('US20210123456')).toBe(true);
  });

  // False cases
  it('returns false for a granted patent with B2 kind code (US-prefixed)', () => {
    expect(isPublishedApplication('US10123456B2')).toBe(false);
  });

  it('returns false for a granted patent with B2 kind code (bare)', () => {
    expect(isPublishedApplication('10123456B2')).toBe(false);
  });

  it('returns false for a bare 8-digit number', () => {
    expect(isPublishedApplication('10123456')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isPublishedApplication('')).toBe(false);
  });
});

// ─── FMT-01: formatCitationLong ─────────────────────────────────────────────

describe('formatCitationLong (FMT-01)', () => {
  it('same column, same line → Col. X, l. Y', () => {
    expect(formatCitationLong({ column: 4, lineNumber: 15 }, { column: 4, lineNumber: 15 }))
      .toBe('Col. 4, l. 15');
  });

  it('same column, different lines → Col. X, ll. Y-Z', () => {
    expect(formatCitationLong({ column: 4, lineNumber: 15 }, { column: 4, lineNumber: 22 }))
      .toBe('Col. 4, ll. 15-22');
  });

  it('cross-column → Col. X, l. Y – Col. X2, l. Z (en-dash U+2013, spaces)', () => {
    const result = formatCitationLong({ column: 4, lineNumber: 60 }, { column: 5, lineNumber: 3 });
    expect(result).toBe('Col. 4, l. 60 – Col. 5, l. 3');
  });

  it('cross-column uses en-dash (U+2013), not hyphen-minus (U+002D)', () => {
    const result = formatCitationLong({ column: 1, lineNumber: 65 }, { column: 2, lineNumber: 5 });
    expect(result).toContain('–');
    expect(result).not.toMatch(/Col\. \d+, l\. \d+ - Col\./); // no hyphen-minus as separator
  });

  it('single-line form uses singular "l." not "ll."', () => {
    const result = formatCitationLong({ column: 7, lineNumber: 42 }, { column: 7, lineNumber: 42 });
    expect(result).toContain('l. 42');
    expect(result).not.toContain('ll.');
  });

  it('range form uses plural "ll."', () => {
    const result = formatCitationLong({ column: 3, lineNumber: 1 }, { column: 3, lineNumber: 10 });
    expect(result).toContain('ll.');
    expect(result).not.toMatch(/\bl\. /); // should not contain singular "l. " (word boundary)
  });
});

// ─── formatCitationShort (wrapper sanity) ────────────────────────────────────

describe('formatCitationShort', () => {
  it('same column same line → col:line', () => {
    expect(formatCitationShort({ column: 4, lineNumber: 15 }, { column: 4, lineNumber: 15 }))
      .toBe('4:15');
  });

  it('same column range → col:start-end', () => {
    expect(formatCitationShort({ column: 4, lineNumber: 15 }, { column: 4, lineNumber: 22 }))
      .toBe('4:15-22');
  });

  it('cross-column → sc:sl-ec:el', () => {
    expect(formatCitationShort({ column: 4, lineNumber: 60 }, { column: 5, lineNumber: 3 }))
      .toBe('4:60-5:3');
  });
});

// ─── applyPrefix ─────────────────────────────────────────────────────────────

describe('applyPrefix', () => {
  it('prepends normalizedPatentId when includePrefix is true', () => {
    expect(applyPrefix('Col. 4, ll. 15-22', 'US10123456B2', true))
      .toBe('US10123456B2 Col. 4, ll. 15-22');
  });

  it('returns bare citation when includePrefix is false', () => {
    expect(applyPrefix('Col. 4, ll. 15-22', 'US10123456B2', false))
      .toBe('Col. 4, ll. 15-22');
  });
});

// ─── BATCH-01: one positionMap, N matchAndCite calls, no mutation ─────────────

describe('BATCH-01: single positionMap, N matchAndCite calls, no mutation', () => {
  /**
   * Build a minimal in-memory positionMap with two findable passages.
   * passageA: "The system comprises a processor" — cols 1-2, lines 1-2
   * passageB: "operatively coupled to memory"    — cols 2-3, lines 10-11
   */
  const positionMap = [
    // Column 1
    { text: 'The system comprises a', column: 1, lineNumber: 1, page: 1, section: 'description' },
    { text: 'processor configured to execute', column: 1, lineNumber: 2, page: 1, section: 'description' },
    { text: 'instructions stored in memory', column: 1, lineNumber: 3, page: 1, section: 'description' },
    { text: 'operatively coupled to', column: 1, lineNumber: 4, page: 1, section: 'description' },
    { text: 'a storage device for', column: 1, lineNumber: 5, page: 1, section: 'description' },
    // Column 2
    { text: 'retrieving data from', column: 2, lineNumber: 6, page: 1, section: 'description' },
    { text: 'the network interface', column: 2, lineNumber: 7, page: 1, section: 'description' },
    { text: 'to enable communication', column: 2, lineNumber: 8, page: 1, section: 'description' },
    { text: 'between components', column: 2, lineNumber: 9, page: 1, section: 'description' },
    { text: 'operatively coupled to memory', column: 2, lineNumber: 10, page: 1, section: 'description' },
    // Column 3
    { text: 'via a bus architecture', column: 3, lineNumber: 11, page: 1, section: 'description' },
    { text: 'providing bandwidth for', column: 3, lineNumber: 12, page: 1, section: 'description' },
  ];

  // Take a deep snapshot BEFORE any matchAndCite calls
  const positionMapSnapshot = JSON.parse(JSON.stringify(positionMap));

  // passageA is a phrase that appears in entries 0-1 of the positionMap
  const passageA = 'The system comprises a processor';
  // passageB is a phrase that appears in entry index 9
  const passageB = 'operatively coupled to memory';

  it('matchAndCite returns a non-null result for passageA', () => {
    const resultA = matchAndCite(passageA, positionMap);
    expect(resultA).not.toBeNull();
    expect(typeof resultA.citation).toBe('string');
    expect(resultA.citation.length).toBeGreaterThan(0);
  });

  it('matchAndCite returns a non-null result for passageB', () => {
    const resultB = matchAndCite(passageB, positionMap);
    expect(resultB).not.toBeNull();
    expect(typeof resultB.citation).toBe('string');
    expect(resultB.citation.length).toBeGreaterThan(0);
  });

  it('passageA and passageB citations are distinct (different locations)', () => {
    const resultA = matchAndCite(passageA, positionMap);
    const resultB = matchAndCite(passageB, positionMap);
    expect(resultA).not.toBeNull();
    expect(resultB).not.toBeNull();
    // They come from different columns/lines so citations must differ
    expect(resultA.citation).not.toBe(resultB.citation);
  });

  it('positionMap is not mutated after N matchAndCite calls (BATCH-01 invariant)', () => {
    // Run both calls again to exercise the mutation invariant explicitly
    matchAndCite(passageA, positionMap);
    matchAndCite(passageB, positionMap);
    // Deep-equal the original snapshot
    expect(positionMap).toEqual(positionMapSnapshot);
  });

  it('positionMap length is unchanged after N matchAndCite calls', () => {
    matchAndCite(passageA, positionMap);
    matchAndCite(passageB, positionMap);
    expect(positionMap.length).toBe(positionMapSnapshot.length);
  });

  it('each entry in positionMap is unchanged (per-entry deep check)', () => {
    matchAndCite(passageA, positionMap);
    matchAndCite(passageB, positionMap);
    for (let i = 0; i < positionMapSnapshot.length; i++) {
      expect(positionMap[i]).toEqual(positionMapSnapshot[i]);
    }
  });
});

// tests/unit/parse-affected-cases.test.js
//
// Phase 41 Plan 41-01 — VFY-GATE-01 (affected-cases parser). Vitest
// contract suite for scripts/parse-affected-cases.mjs.
//
// Parser must extract case IDs from PR-body `<!-- affected_cases: ... -->`
// HTML comments. Supports three input shapes:
//   1. Single-line:   `<!-- affected_cases: US123-1,US456-2 -->`
//   2. Multi-line:    `<!-- affected_cases:\nUS123-1\nUS456-2\n-->`
//   3. Whitespace:    `<!--   affected_cases:   US123-1 ,  US456-2   -->`
//
// Robustness contract (per 41-CONTEXT decisions): always returns a string
// array — never null, never undefined — even on missing/empty input.
//
// RED gate (Task 1): this file imports scripts/parse-affected-cases.mjs
// which does NOT yet exist on disk. Vitest emits "Error: Failed to load
// url ../../scripts/parse-affected-cases.mjs" — the canonical RED signal.

import { describe, it, expect } from 'vitest';

import { parseAffectedCases } from '../../scripts/parse-affected-cases.mjs';

describe('parse-affected-cases (Phase 41-01, VFY-GATE-01)', () => {
  // P1 — single-line, comma-separated
  it('P1: single-line variant extracts comma-separated IDs', () => {
    const body = '<!-- affected_cases: US123-1,US456-2 -->';
    expect(parseAffectedCases(body)).toEqual(['US123-1', 'US456-2']);
  });

  // P2 — multi-line, newline-separated
  it('P2: multi-line variant extracts newline-separated IDs', () => {
    const body = '<!-- affected_cases:\nUS123-1\nUS456-2\n-->';
    expect(parseAffectedCases(body)).toEqual(['US123-1', 'US456-2']);
  });

  // P3 — whitespace-heavy
  it('P3: whitespace-heavy variant trims and extracts IDs', () => {
    const body = '<!--   affected_cases:   US123-1 ,  US456-2   -->';
    expect(parseAffectedCases(body)).toEqual(['US123-1', 'US456-2']);
  });

  // P4 — embedded in markdown with other HTML comments (no cross-contamination)
  it('P4: PR body with comment embedded in markdown + other HTML comments returns only affected_cases IDs', () => {
    const body = [
      '## Summary',
      '',
      'This PR fixes the citation alignment for the following cases.',
      '',
      '<!-- this is an unrelated comment about reviewer instructions -->',
      '<!-- another unrelated note: do not merge before tuesday -->',
      '',
      '<!-- affected_cases: US123-1,US456-2 -->',
      '',
      '### Test plan',
      '',
      '<!-- yet another unrelated trailing comment -->',
    ].join('\n');
    expect(parseAffectedCases(body)).toEqual(['US123-1', 'US456-2']);
  });

  // P5 — missing comment
  it('P5: missing comment returns [] (not null, not undefined)', () => {
    const body = 'This PR has no affected_cases comment at all.';
    const result = parseAffectedCases(body);
    expect(result).toEqual([]);
    expect(result).not.toBeNull();
    expect(result).not.toBeUndefined();
  });

  // P6 — empty PR body or null
  it('P6: empty PR body ("" or null) returns []', () => {
    expect(parseAffectedCases('')).toEqual([]);
    expect(parseAffectedCases(null)).toEqual([]);
    expect(parseAffectedCases(undefined)).toEqual([]);
  });

  // P7 — comment present but empty inner content
  it('P7: comment present but empty inner content returns []', () => {
    expect(parseAffectedCases('<!-- affected_cases: -->')).toEqual([]);
    expect(parseAffectedCases('<!-- affected_cases:   -->')).toEqual([]);
    expect(parseAffectedCases('<!-- affected_cases:\n\n-->')).toEqual([]);
  });

  // P8 — single ID
  it('P8: single ID variant returns single-element array', () => {
    expect(parseAffectedCases('<!-- affected_cases: US123-1 -->')).toEqual(['US123-1']);
  });

  // Bonus P9 — real-world long PatentCite case ID (matches the docstring example
  // in the helper: US11427642-spec-short-1)
  it('P9: real-world PatentCite case ID format is extracted intact', () => {
    const body = '<!-- affected_cases: US11427642-spec-short-1 -->';
    expect(parseAffectedCases(body)).toEqual(['US11427642-spec-short-1']);
  });

  // Bonus P10 — extra trailing whitespace + empty entries from `,,`
  it('P10: drops empty entries from trailing commas / blank lines', () => {
    expect(parseAffectedCases('<!-- affected_cases: US123-1,,US456-2 -->'))
      .toEqual(['US123-1', 'US456-2']);
    expect(parseAffectedCases('<!-- affected_cases:\nUS123-1\n\nUS456-2\n\n-->'))
      .toEqual(['US123-1', 'US456-2']);
  });
});

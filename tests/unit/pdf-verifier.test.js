/**
 * Unit tests for tests/e2e/lib/pdf-verifier.js — the independent PDF verifier
 * (Phase 28). Exercises the 4-tier matcher (A exact → B whitespace-normalized
 * → C ±2-line fuzzy → D fail), citation parser, and column/line inference.
 *
 * Tests use hand-rolled synthetic ParsedPdf objects — no PDF fetch, no
 * @napi-rs/canvas, no live network.
 */

import { describe, it, expect } from 'vitest';
import {
  runMatcher,
  parseCitation,
  inferColumnLine,
} from '../e2e/lib/pdf-verifier.js';

// ---------------------------------------------------------------------------
// Helpers — build a ParsedPdf shape compatible with runMatcher
// ---------------------------------------------------------------------------

/**
 * Build a minimal ParsedPdf whose linesFor() returns lines matching the
 * (col, lineStart..lineEnd) span. Supports cross-column spans by partitioning
 * the per-column slice.
 *
 * @param {Array<{col:number, lineNumber:number, text:string}>} lines
 */
function makeParsed(lines) {
  return {
    pages: [],
    totalPages: 1,
    _lines: lines,
    linesFor(col, lineStart, lineEnd) {
      return this._lines
        .filter(
          (l) => l.col === col && l.lineNumber >= lineStart && l.lineNumber <= lineEnd
        )
        .sort((a, b) => a.lineNumber - b.lineNumber);
    },
  };
}

// ---------------------------------------------------------------------------
// parseCitation
// ---------------------------------------------------------------------------

describe('parseCitation', () => {
  it('Test 6a: parses single-line "1:26"', () => {
    expect(parseCitation('1:26')).toEqual({
      startCol: 1,
      startLine: 26,
      endCol: 1,
      endLine: 26,
    });
  });

  it('Test 6b: parses same-column range "1:26-27"', () => {
    expect(parseCitation('1:26-27')).toEqual({
      startCol: 1,
      startLine: 26,
      endCol: 1,
      endLine: 27,
    });
  });

  it('Test 6c: parses cross-column range "79:81-80:3"', () => {
    expect(parseCitation('79:81-80:3')).toEqual({
      startCol: 79,
      startLine: 81,
      endCol: 80,
      endLine: 3,
    });
  });

  it('Test 6d: parses cross-column range "1:67-2:3" (from baseline)', () => {
    expect(parseCitation('1:67-2:3')).toEqual({
      startCol: 1,
      startLine: 67,
      endCol: 2,
      endLine: 3,
    });
  });
});

// ---------------------------------------------------------------------------
// runMatcher — Tier A/B/C/D
// ---------------------------------------------------------------------------

describe('runMatcher — 4-tier matcher', () => {
  it('Test 1 — Tier A exact match in cited line', () => {
    const parsed = makeParsed([
      { col: 1, lineNumber: 25, text: 'preceding text' },
      { col: 1, lineNumber: 26, text: 'receptor exclusively expressed on plasma cells' },
      { col: 1, lineNumber: 27, text: 'and plasmablasts. BCMA is...' },
    ]);
    const v = runMatcher(parsed, 'exclusively expressed on plasma', '1:26');
    expect(v.status).toBe('pass');
    expect(v.tier_used).toBe('A');
    expect(v.match_offset_lines).toBe(0);
  });

  it('Test 2 — Tier B whitespace-normalized match', () => {
    const parsed = makeParsed([
      { col: 1, lineNumber: 26, text: 'receptor   exclusively  expressed   on  plasma' },
    ]);
    const v = runMatcher(parsed, 'exclusively expressed on plasma', '1:26');
    expect(v.status).toBe('pass');
    expect(v.tier_used).toBe('B');
    expect(v.match_offset_lines).toBe(0);
  });

  it('Test 3 — Tier C ±2 line fuzzy match below cited', () => {
    const parsed = makeParsed([
      { col: 1, lineNumber: 26, text: 'cited line with unrelated content' },
      { col: 1, lineNumber: 27, text: 'still nothing relevant' },
      { col: 1, lineNumber: 28, text: 'this contains the needle phrase here' },
    ]);
    const v = runMatcher(parsed, 'needle phrase', '1:26');
    expect(v.status).toBe('pass');
    expect(v.tier_used).toBe('C');
    expect(v.match_offset_lines).toBe(2);
  });

  it('Test 4 — Tier C boundary: 3 lines off → Tier D', () => {
    const parsed = makeParsed([
      { col: 1, lineNumber: 26, text: 'cited line text' },
      { col: 1, lineNumber: 27, text: 'nothing' },
      { col: 1, lineNumber: 28, text: 'nothing' },
      { col: 1, lineNumber: 29, text: 'the needle phrase appears here' },
    ]);
    const v = runMatcher(parsed, 'needle phrase', '1:26');
    expect(v.status).toBe('disagree');
    expect(v.tier_used).toBe('D');
    expect(v.match_offset_lines).toBeNull();
  });

  it('Test 5 — Tier D: needle absent from window', () => {
    const parsed = makeParsed([
      { col: 1, lineNumber: 26, text: 'completely different content here' },
      { col: 1, lineNumber: 27, text: 'and more unrelated material' },
    ]);
    const v = runMatcher(parsed, 'absent phrase nowhere', '1:26-27');
    expect(v.status).toBe('disagree');
    expect(v.tier_used).toBe('D');
    expect(v.match_offset_lines).toBeNull();
    expect(typeof v.reason).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// inferColumnLine — synthetic bimodal x distribution
// ---------------------------------------------------------------------------

describe('inferColumnLine', () => {
  it('Test 7 — bimodal x distribution yields two column buckets', () => {
    // Synthesize a two-column page: 10 items on left x≈72, 10 on right x≈350
    const pageWidth = 612;
    const pageHeight = 792;
    const pageItems = [];
    // Left column — y descending so order matches reading order top→bottom
    for (let i = 0; i < 10; i++) {
      pageItems.push({
        text: `left word ${i}`,
        x: 72,
        y: 700 - i * 14,
        width: 50,
        height: 10,
        fontName: 'Times',
        hasEOL: false,
      });
    }
    // Right column
    for (let i = 0; i < 10; i++) {
      pageItems.push({
        text: `right word ${i}`,
        x: 350,
        y: 700 - i * 14,
        width: 50,
        height: 10,
        fontName: 'Times',
        hasEOL: false,
      });
    }
    const result = inferColumnLine(pageItems, pageWidth, pageHeight);
    expect(result).toBeDefined();
    expect(Array.isArray(result.lines)).toBe(true);
    // Should have entries on both column buckets (cols 1 and 2 in
    // per-page numbering)
    const cols = new Set(result.lines.map((l) => l.col));
    expect(cols.size).toBe(2);
  });
});

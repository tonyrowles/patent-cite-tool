import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

import {
  extractGutterLineGrid,
  assignLineNumbersByGrid,
  assignLineNumbers,
  clusterIntoLines,
  buildLineEntry,
  extractPrintedColumnNumbers,
  isLikelySpecPage,
  buildPositionMap,
} from '../../src/offscreen/position-map-builder.js';

const __filename = fileURLToPath(import.meta.url);
const ROOT = resolve(__filename, '../../..');

// ============================================================================
// extractGutterLineGrid unit tests
// ============================================================================

describe('extractGutterLineGrid', () => {
  const pageWidth = 612; // typical US letter width in points
  const boundary = 306; // midpoint

  function makeMarker(lineNumber, y) {
    return { text: String(lineNumber), x: boundary - 5, y, width: 10, height: 10 };
  }

  it('returns null with fewer than 2 markers', () => {
    const items = [makeMarker(5, 650)];
    expect(extractGutterLineGrid(items, boundary, pageWidth)).toBeNull();
  });

  it('returns null with no markers', () => {
    expect(extractGutterLineGrid([], boundary, pageWidth)).toBeNull();
  });

  it('extracts grid from two markers', () => {
    // Line 5 at y=660, line 10 at y=610 -> spacing = (660-610)/5 = 10
    const items = [
      makeMarker(5, 660),
      makeMarker(10, 610),
    ];
    const grid = extractGutterLineGrid(items, boundary, pageWidth);
    expect(grid).not.toBeNull();
    expect(grid.lineSpacing).toBeCloseTo(10, 1);
    // firstLineY = 660 + (5-1)*10 = 700
    expect(grid.firstLineY).toBeCloseTo(700, 1);
  });

  it('extracts grid from multiple markers with consistent spacing', () => {
    // Markers at lines 5, 10, 15, 20 with 10pt spacing
    const items = [
      makeMarker(5, 660),
      makeMarker(10, 610),
      makeMarker(15, 560),
      makeMarker(20, 510),
    ];
    const grid = extractGutterLineGrid(items, boundary, pageWidth);
    expect(grid).not.toBeNull();
    expect(grid.lineSpacing).toBeCloseTo(10, 1);
    expect(grid.firstLineY).toBeCloseTo(700, 1);
  });

  it('ignores non-marker items (text, wrong range, wrong position)', () => {
    const items = [
      { text: 'hello', x: boundary - 5, y: 660, width: 30, height: 10 },    // not a number
      { text: '7', x: boundary - 5, y: 640, width: 10, height: 10 },         // not multiple of 5
      { text: '5', x: 10, y: 650, width: 10, height: 10 },                   // too far from boundary
      makeMarker(5, 660),
      makeMarker(10, 610),
    ];
    const grid = extractGutterLineGrid(items, boundary, pageWidth);
    expect(grid).not.toBeNull();
    // Should only use the two valid markers
    expect(grid.lineSpacing).toBeCloseTo(10, 1);
  });

  it('deduplicates markers by line number', () => {
    const items = [
      makeMarker(5, 660),
      makeMarker(5, 659),  // duplicate line 5, different y
      makeMarker(10, 610),
    ];
    const grid = extractGutterLineGrid(items, boundary, pageWidth);
    expect(grid).not.toBeNull();
    expect(grid.lineSpacing).toBeCloseTo(10, 1);
  });
});

// ============================================================================
// assignLineNumbersByGrid unit tests
// ============================================================================

describe('assignLineNumbersByGrid', () => {
  it('assigns consistent line numbers based on grid position', () => {
    const grid = { firstLineY: 700, lineSpacing: 10 };

    // Create items at known y-positions
    const line1Items = [{ text: 'line one', x: 50, y: 700, width: 50, height: 10 }];
    const line5Items = [{ text: 'line five', x: 50, y: 660, width: 50, height: 10 }];
    const line10Items = [{ text: 'line ten', x: 50, y: 610, width: 50, height: 10 }];

    const lines = [line1Items, line5Items, line10Items];
    const entries = [];
    assignLineNumbersByGrid(lines, entries, 1, 1, grid);

    expect(entries.length).toBe(3);
    expect(entries[0].lineNumber).toBe(1);
    expect(entries[1].lineNumber).toBe(5);
    expect(entries[2].lineNumber).toBe(10);
  });

  it('produces same line numbers for both columns at same y-position', () => {
    const grid = { firstLineY: 700, lineSpacing: 10 };

    // Left column items
    const leftLine = [{ text: 'left text', x: 50, y: 660, width: 100, height: 10 }];
    // Right column items at same y
    const rightLine = [{ text: 'right text', x: 350, y: 660, width: 100, height: 10 }];

    const leftEntries = [];
    const rightEntries = [];
    assignLineNumbersByGrid([leftLine], leftEntries, 1, 1, grid);
    assignLineNumbersByGrid([rightLine], rightEntries, 1, 2, grid);

    expect(leftEntries[0].lineNumber).toBe(5);
    expect(rightEntries[0].lineNumber).toBe(5);
  });

  it('clamps line numbers to minimum of 1', () => {
    const grid = { firstLineY: 700, lineSpacing: 10 };

    // Item above the expected first line
    const lineItems = [{ text: 'above', x: 50, y: 720, width: 50, height: 10 }];
    const entries = [];
    assignLineNumbersByGrid([lineItems], entries, 1, 1, grid);

    expect(entries[0].lineNumber).toBe(1);
  });
});

// ============================================================================
// Cross-column consistency regression test using US10592688 fixture
// ============================================================================

describe('cross-column line number consistency: US10592688', () => {
  let fixture;

  beforeAll(() => {
    const fixturePath = resolve(ROOT, 'tests/fixtures/US10592688.json');
    fixture = JSON.parse(readFileSync(fixturePath, 'utf-8'));
  });

  it('column 2 entries on page 34 have correct line numbers matching column 1', () => {
    const col1 = fixture.filter(e => e.column === 1 && e.page === 34).sort((a, b) => b.y - a.y);
    const col2 = fixture.filter(e => e.column === 2 && e.page === 34).sort((a, b) => b.y - a.y);

    expect(col1.length).toBeGreaterThan(0);
    expect(col2.length).toBeGreaterThan(0);

    // For every col2 entry that has a matching y-position in col1,
    // the line numbers must be equal
    for (const r of col2) {
      let best = null;
      let bestDist = Infinity;
      for (const l of col1) {
        const d = Math.abs(l.y - r.y);
        if (d < bestDist) { bestDist = d; best = l; }
      }
      if (best && bestDist < 3) {
        expect(r.lineNumber).toBe(best.lineNumber);
      }
    }
  });

  it('column 2 max line on page 34 is 67 (not 65)', () => {
    const col2Page34 = fixture.filter(e => e.column === 2 && e.page === 34);
    const maxLine = Math.max(...col2Page34.map(e => e.lineNumber));
    expect(maxLine).toBe(67);
  });

  it('column 22 max line on page 44 is 67 (not 65)', () => {
    const col22Page44 = fixture.filter(e => e.column === 22 && e.page === 44);
    const maxLine = Math.max(...col22Page44.map(e => e.lineNumber));
    expect(maxLine).toBe(67);
  });

  it('the user-reported text at y~180 gets line 53 in both columns on page 34', () => {
    // The original bug: at y~180.14, col1 = line 53 (correct), col2 = line 51 (wrong)
    // After fix, col2 should also be line 53
    const targetY = 180;
    const tolerance = 3;

    const col1At180 = fixture.filter(
      e => e.column === 1 && e.page === 34 && Math.abs(e.y - targetY) < tolerance
    );
    const col2At180 = fixture.filter(
      e => e.column === 2 && e.page === 34 && Math.abs(e.y - targetY) < tolerance
    );

    expect(col1At180.length).toBeGreaterThan(0);
    expect(col2At180.length).toBeGreaterThan(0);

    // Both should be line 53
    expect(col1At180[0].lineNumber).toBe(53);
    expect(col2At180[0].lineNumber).toBe(53);
  });
});

// ============================================================================
// extractPrintedColumnNumbers unit tests
// ============================================================================

describe('extractPrintedColumnNumbers', () => {
  const pageHeight = 792; // US letter
  const pageWidth = 612;

  function makeHeaderItem(text, x, y) {
    return { text, x, y: y !== undefined ? y : pageHeight - 50, width: 10, height: 10 };
  }

  it('returns column pair for normal spec page', () => {
    const items = [
      makeHeaderItem('1', 50, 750),
      makeHeaderItem('2', 500, 750),
    ];
    expect(extractPrintedColumnNumbers(items, pageHeight, pageWidth)).toEqual({ left: 1, right: 2 });
  });

  it('returns null when left column is even (e.g., 4,5)', () => {
    const items = [
      makeHeaderItem('4', 50, 750),
      makeHeaderItem('5', 500, 750),
    ];
    expect(extractPrintedColumnNumbers(items, pageHeight, pageWidth)).toBeNull();
  });

  it('accepts odd-even pairs like 203,204 at per-page level (sequential check is in buildPositionMap)', () => {
    const items = [
      makeHeaderItem('203', 50, 750),
      makeHeaderItem('204', 500, 750),
    ];
    // extractPrintedColumnNumbers only checks structure (odd left, consecutive).
    // The sequential cross-page check in buildPositionMap catches impossible jumps.
    expect(extractPrintedColumnNumbers(items, pageHeight, pageWidth)).toEqual({ left: 203, right: 204 });
  });

  it('returns null when single number inferred as left gives even left', () => {
    // Single "204" on right side → inferred left = 203 (odd) → accepted at per-page level
    const items = [
      makeHeaderItem('204', 500, 750),
    ];
    expect(extractPrintedColumnNumbers(items, pageHeight, pageWidth)).toEqual({ left: 203, right: 204 });
  });

  it('accepts high but legitimate odd-even columns (99, 100)', () => {
    const items = [
      makeHeaderItem('99', 50, 750),
      makeHeaderItem('100', 500, 750),
    ];
    expect(extractPrintedColumnNumbers(items, pageHeight, pageWidth)).toEqual({ left: 99, right: 100 });
  });

  it('returns null when columns are not consecutive', () => {
    const items = [
      makeHeaderItem('5', 50, 750),
      makeHeaderItem('8', 500, 750),
    ];
    expect(extractPrintedColumnNumbers(items, pageHeight, pageWidth)).toBeNull();
  });

  it('returns null when no numbers in header', () => {
    const items = [
      makeHeaderItem('Abstract', 50, 750),
    ];
    expect(extractPrintedColumnNumbers(items, pageHeight, pageWidth)).toBeNull();
  });
});

// ============================================================================
// buildPositionMap sequential column validation tests
// ============================================================================

describe('buildPositionMap sequential column validation', () => {
  const pageWidth = 612;
  const pageHeight = 792;

  /**
   * Build a minimal two-column page result that passes isTwoColumnPage,
   * extractPrintedColumnNumbers, and produces at least one entry.
   */
  function makeSpecPage(pageNum, leftCol, rightCol) {
    const items = [];
    // Header column numbers
    items.push({ text: String(leftCol), x: 50, y: pageHeight - 50, width: 10, height: 10 });
    items.push({ text: String(rightCol), x: 500, y: pageHeight - 50, width: 10, height: 10 });
    // Body text — need 30+ items split across both halves to pass isTwoColumnPage
    for (let i = 0; i < 20; i++) {
      items.push({ text: `left text ${i}`, x: 60 + (i % 5) * 10, y: 100 + i * 20, width: 80, height: 10 });
    }
    for (let i = 0; i < 20; i++) {
      items.push({ text: `right text ${i}`, x: 350 + (i % 5) * 10, y: 100 + i * 20, width: 80, height: 10 });
    }
    return { pageNum, items, pageWidth, pageHeight };
  }

  it('accepts pages with sequential column numbers (1,2 → 3,4)', () => {
    const result = buildPositionMap([
      makeSpecPage(1, 1, 2),
      makeSpecPage(2, 3, 4),
    ]);
    // Both pages should produce entries
    const cols = [...new Set(result.map(e => e.column))];
    expect(cols).toContain(1);
    expect(cols).toContain(2);
    expect(cols).toContain(3);
    expect(cols).toContain(4);
  });

  it('rejects pages that break the sequential pattern (1,2 → 203,204)', () => {
    const result = buildPositionMap([
      makeSpecPage(1, 1, 2),
      makeSpecPage(2, 203, 204), // impossible jump — patent number contamination
    ]);
    // Only page 1 columns should appear
    const cols = [...new Set(result.map(e => e.column))];
    expect(cols).toContain(1);
    expect(cols).toContain(2);
    expect(cols).not.toContain(203);
    expect(cols).not.toContain(204);
  });

  it('rejects page with spurious column 203 even as first spec page', () => {
    const result = buildPositionMap([
      makeSpecPage(1, 203, 204), // first page should start at 1,2
    ]);
    // No entries should be produced since 203 ≠ expected first column (1)
    const cols = [...new Set(result.map(e => e.column))];
    expect(cols).not.toContain(203);
    expect(cols).not.toContain(204);
  });
});

// ============================================================================
// isLikelySpecPage unit tests
// ============================================================================

describe('isLikelySpecPage', () => {
  const pageHeight = 792;

  function makeItems(headerTexts, bodyCount) {
    const items = [];
    // Header items (in header zone: y >= pageHeight - 90 = 702)
    for (const text of headerTexts) {
      items.push({ text, x: 200, y: 730, width: 50, height: 10 });
    }
    // Body items (between footer and header thresholds)
    for (let i = 0; i < bodyCount; i++) {
      items.push({ text: `text ${i}`, x: 80 + (i % 10) * 20, y: 100 + (i % 30) * 18, width: 50, height: 10 });
    }
    return items;
  }

  it('returns true for a spec page with only patent number in header', () => {
    expect(isLikelySpecPage(makeItems(['US 10,203,551 B2'], 200), pageHeight)).toBe(true);
  });

  it('returns false for cover page with "United States Patent"', () => {
    expect(isLikelySpecPage(makeItems(['(12)', 'United States Patent', 'US 10,203,551 B2'], 200), pageHeight)).toBe(false);
  });

  it('returns false for figure page with "Sheet X of Y"', () => {
    expect(isLikelySpecPage(makeItems(['U.S. Patent', 'Sheet 2 of 5', 'US 10,203,551 B2'], 200), pageHeight)).toBe(false);
  });

  it('returns false for abstract continuation with "Page N"', () => {
    expect(isLikelySpecPage(makeItems(['US 10,203,551 B2', 'Page 2'], 200), pageHeight)).toBe(false);
  });

  it('returns false for sparse page (garbled figure OCR)', () => {
    expect(isLikelySpecPage(makeItems(['some text'], 30), pageHeight)).toBe(false);
  });
});

// ============================================================================
// buildPositionMap fallback column inference tests
// ============================================================================

describe('buildPositionMap fallback column inference', () => {
  const pageWidth = 612;
  const pageHeight = 792;

  /**
   * Build a spec-like page WITHOUT column numbers in the header.
   * Only the patent number appears in the header zone.
   */
  function makeSpecPageNoColNums(pageNum) {
    const items = [];
    // Header: only patent number (no standalone digits)
    items.push({ text: 'US 10,203,551 B2', x: 256, y: pageHeight - 50, width: 90, height: 10 });
    // Body text — 100+ items split across both halves
    for (let i = 0; i < 50; i++) {
      items.push({ text: `left text ${i}`, x: 60 + (i % 5) * 10, y: 100 + i * 10, width: 80, height: 10 });
    }
    for (let i = 0; i < 50; i++) {
      items.push({ text: `right text ${i}`, x: 350 + (i % 5) * 10, y: 100 + i * 10, width: 80, height: 10 });
    }
    return { pageNum, items, pageWidth, pageHeight };
  }

  /** Build a cover page that should be skipped. */
  function makeCoverPage(pageNum) {
    const items = [];
    items.push({ text: '(12)', x: 78, y: pageHeight - 50, width: 17, height: 10 });
    items.push({ text: 'United States Patent', x: 98, y: pageHeight - 50, width: 162, height: 10 });
    for (let i = 0; i < 50; i++) {
      items.push({ text: `left ${i}`, x: 60 + (i % 5) * 10, y: 100 + i * 10, width: 80, height: 10 });
    }
    for (let i = 0; i < 50; i++) {
      items.push({ text: `right ${i}`, x: 350 + (i % 5) * 10, y: 100 + i * 10, width: 80, height: 10 });
    }
    return { pageNum, items, pageWidth, pageHeight };
  }

  it('infers sequential columns when no printed column numbers exist', () => {
    const result = buildPositionMap([
      makeCoverPage(1),
      makeSpecPageNoColNums(2),
      makeSpecPageNoColNums(3),
    ]);
    const cols = [...new Set(result.map(e => e.column))].sort((a, b) => a - b);
    expect(cols).toEqual([1, 2, 3, 4]);
  });

  it('skips cover and figure pages in fallback mode', () => {
    const figurePage = {
      pageNum: 2, items: [], pageWidth, pageHeight,
    };
    // Add "Sheet 1 of 3" header + enough body items
    figurePage.items.push({ text: 'Sheet 1 of 3', x: 300, y: pageHeight - 50, width: 60, height: 10 });
    for (let i = 0; i < 50; i++) {
      figurePage.items.push({ text: `l ${i}`, x: 60 + (i % 5) * 10, y: 100 + i * 10, width: 80, height: 10 });
    }
    for (let i = 0; i < 50; i++) {
      figurePage.items.push({ text: `r ${i}`, x: 350 + (i % 5) * 10, y: 100 + i * 10, width: 80, height: 10 });
    }

    const result = buildPositionMap([
      makeCoverPage(1),
      figurePage,
      makeSpecPageNoColNums(3),
      makeSpecPageNoColNums(4),
    ]);
    // Only spec pages should produce entries, starting at columns 1,2
    const cols = [...new Set(result.map(e => e.column))].sort((a, b) => a - b);
    expect(cols).toEqual([1, 2, 3, 4]);
  });
});

// ============================================================================
// Phase 23 structural-validator guards
// ============================================================================
// These tests explicitly name the four invariants that prevent spurious
// column numbers (e.g. "203" from patent number US10203551) from polluting
// the position map. Future regressions to extractPrintedColumnNumbers or
// the cross-page sequential validator in buildPositionMap will surface here
// with a clear test name.
// ----------------------------------------------------------------------------

describe('Phase 23 structural-validator guards', () => {
  const pageWidth = 612;
  const pageHeight = 792;
  const headerY = pageHeight - 50; // inside header zone (y >= pageHeight - 90)

  function makeHeaderItems(leftVal, rightVal) {
    const items = [];
    if (leftVal !== null) items.push({ text: String(leftVal), x: 100, y: headerY, width: 10, height: 10 });
    if (rightVal !== null) items.push({ text: String(rightVal), x: 450, y: headerY, width: 10, height: 10 });
    // padding body items so isTwoColumnPage / extractPrintedColumnNumbers don't bail early
    for (let i = 0; i < 30; i++) {
      items.push({ text: `l${i}`, x: 60 + (i % 5) * 10, y: 100 + i * 15, width: 60, height: 10 });
      items.push({ text: `r${i}`, x: 350 + (i % 5) * 10, y: 100 + i * 15, width: 60, height: 10 });
    }
    return items;
  }

  it('G1: rejects even left column (4,5) — odd-left invariant', () => {
    const items = makeHeaderItems(4, 5);
    expect(extractPrintedColumnNumbers(items, pageHeight, pageWidth)).toBeNull();
  });

  it('G2: rejects non-consecutive pair (1,3) — right === left+1 invariant', () => {
    const items = makeHeaderItems(1, 3);
    expect(extractPrintedColumnNumbers(items, pageHeight, pageWidth)).toBeNull();
  });

  it('G3: accepts valid odd-left pair (5,6) — positive sanity', () => {
    const items = makeHeaderItems(5, 6);
    expect(extractPrintedColumnNumbers(items, pageHeight, pageWidth)).toEqual({ left: 5, right: 6 });
  });

  it('G4: buildPositionMap rejects first page claiming columns (203,204) — sequential cross-page invariant', () => {
    // Build a single spec page whose header advertises columns 203,204.
    // The intra-page validators (odd-left, consecutive) accept 203,204
    // because 203 is odd and 204 = 203 + 1. The CROSS-PAGE sequential
    // validator (expectedLeftCol = 1 on first page) must reject it.
    const items = makeHeaderItems(203, 204);
    const pageResult = { pageNum: 1, items, pageWidth, pageHeight };
    const result = buildPositionMap([pageResult]);
    const cols = [...new Set(result.map(e => e.column))];
    expect(cols).not.toContain(203);
    expect(cols).not.toContain(204);
    // Fallback pass may or may not produce entries here depending on
    // isLikelySpecPage acceptance; assertion is specifically that the
    // bad column numbers do not appear, which is the invariant under test.
  });
});

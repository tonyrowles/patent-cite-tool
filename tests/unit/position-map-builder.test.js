import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

import {
  extractGutterLineGrid,
  assignLineNumbersByGrid,
  assignLineNumbers,
  clusterIntoLines,
  buildLineEntry,
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

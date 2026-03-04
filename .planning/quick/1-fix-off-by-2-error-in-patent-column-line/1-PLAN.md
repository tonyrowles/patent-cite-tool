---
quick_task: 1
description: "Fix off-by-2 error in patent column line number calculation"
tasks: 3
---

# Quick Plan: Fix Off-by-2 Line Number Error

## Problem

In US10592688, column 2 line numbers are systematically 2 less than the actual patent.
Example: "In still another embodiment, a system for creating dynamic medical examination forms is provided." is at 2:53-54 in the patent but reported as 2:51-52.

## Root Cause

`assignLineNumbers()` in `position-map-builder.js` counts lines by accumulating y-gaps
per column independently. Different columns have different text/blank-line patterns,
producing different accumulated totals. Column 2 detects fewer blank lines than column 1,
causing systematic under-counting.

On page 34 of US10592688:
- Column 1: 61 text lines + 6 blank lines = 67 total (correct)
- Column 2: 60 text lines + 5 blank lines = 65 total (should be 67)
- At y≈180: col1=line 53 (correct), col2=line 51 (off by 2)

## Fix Strategy

Use US patent gutter line markers (5, 10, 15, ..., 60, 65) to establish a physical line
grid, then assign line numbers by absolute y-position rather than cumulative gap counting.
This ensures both columns get consistent line numbers for the same y-position.

## Tasks

### Task 1: Add gutter-marker grid extraction and position-based line numbering

**files:** `src/offscreen/position-map-builder.js`
**action:**
1. Add `extractGutterLineGrid(items, boundary, pageWidth)` function:
   - Identify standalone gutter markers (same criteria as filterGutterLineNumbers)
   - Deduplicate markers by line number (keep one per line number)
   - Compute line spacing from y-gaps between consecutive known markers
   - Extrapolate line 1 y-position from the first marker
   - Return `{ firstLineY, lineSpacing }` or null if insufficient markers
2. Add `assignLineNumbersByGrid(lines, entries, pageNum, column, grid)` function:
   - For each text line, compute: `lineNumber = 1 + Math.round((firstLineY - lineY) / lineSpacing)`
   - Push built line entry
3. Modify `buildPositionMap()`:
   - After `filterHeadersFooters` but BEFORE `filterGutterLineNumbers`, call `extractGutterLineGrid(filtered, boundary, pageWidth)`
   - When grid is available, use `assignLineNumbersByGrid` for both columns
   - When grid is null (no markers), fall back to existing `assignLineNumbers`

**verify:** Unit test that column 1 and column 2 produce the same line number for the same y-position
**done:** New functions added and integrated into buildPositionMap

### Task 2: Update golden baseline and fixture for US10592688

**files:** `tests/golden/baseline.json`, `tests/fixtures/US10592688.json`
**action:**
1. Run the existing test suite to identify which test cases change
2. Rebuild US10592688 fixture by running the position map builder on the fixture's raw data
   (Note: fixture IS the position map — update line numbers in the fixture to match new algorithm)
3. Update `tests/golden/baseline.json` for any US10592688 test cases whose citations change
4. Update fixture line numbers for US10592688 column 2 entries (+2 to all line numbers)
5. Check if other patent fixtures also need updates

**verify:** `npm test` passes
**done:** All fixtures and baselines updated, tests pass

### Task 3: Add regression test for cross-column line number consistency

**files:** `tests/unit/position-map-builder.test.js` (new or existing)
**action:**
1. Add a test that verifies both columns on the same page produce the same line number
   for entries at approximately the same y-coordinate
2. Use US10592688 fixture data as the test case
3. Test that the specific user-reported text gets line 53-54 (not 51-52)

**verify:** New test passes
**done:** Regression test prevents future cross-column line number drift

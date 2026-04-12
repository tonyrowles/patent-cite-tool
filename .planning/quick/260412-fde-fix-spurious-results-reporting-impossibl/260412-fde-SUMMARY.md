# Quick Task 260412-fde: Fix spurious column numbers

## What Changed

Replaced the arbitrary max-column-number cap with two structural validations that leverage how patent column numbers actually work:

1. **Odd/even check** (`extractPrintedColumnNumbers`): Left column must be odd — patent spec pages always have odd-even pairs (1,2 then 3,4 then 5,6...). Rejects even-left pairs like 4,5.

2. **Sequential cross-page check** (`buildPositionMap`): Tracks expected column numbers across pages. Each page must continue the sequence (if previous page was 3,4 then next must be 5,6). The sequence starts at 1, so even the first spec page must have columns 1,2. This catches "203,204" from patent number contamination since 203 ≠ expected next column.

## Root Cause

Patent US10203551 had "203" extracted by PDF.js as a standalone text item in the header area (substring of patent number "10203551"). The previous check (`right > 999`) was too permissive.

## Files Modified

| File | Change |
|------|--------|
| `src/offscreen/position-map-builder.js` | Added odd-left check in `extractPrintedColumnNumbers`, sequential validation in `buildPositionMap` |
| `tests/unit/position-map-builder.test.js` | 10 new tests: 7 for `extractPrintedColumnNumbers`, 3 for `buildPositionMap` sequential validation |

## Test Results

All 187 tests pass. 98.7% accuracy maintained.

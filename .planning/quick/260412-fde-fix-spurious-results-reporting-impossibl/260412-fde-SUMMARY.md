# Quick Task 260412-fde: Fix spurious column numbers

## What Changed

Tightened the column number range validation in `extractPrintedColumnNumbers()` from 999 to 200. Patent US10203551 was producing spurious column number 203 because the PDF parser extracted "203" (a substring of the patent number "10203551") as a standalone text item in the header, and the overly permissive range check accepted it.

## Files Modified

| File | Change |
|------|--------|
| `src/offscreen/position-map-builder.js` | Changed sanity check from `right > 999` to `right > 200` |
| `tests/unit/position-map-builder.test.js` | Added 6 tests for `extractPrintedColumnNumbers` |

## Commits

- `8bf844a` — test: add failing tests for extractPrintedColumnNumbers
- `e51ba1b` — fix: tighten column number range from 999 to 200

## Test Results

All 6 new tests pass. All existing tests continue to pass.

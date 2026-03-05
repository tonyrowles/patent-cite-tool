---
phase: 22-validation-and-golden-baseline
plan: 01
subsystem: testing
tags: [vitest, golden-baseline, ocr, gutter-matching, fixture, spot-check]

# Dependency graph
requires:
  - phase: 21-gutter-tolerant-matching
    provides: gutterTolerantMatch Tier 5 — used by synthetic-gutter-1 test case
  - phase: 20-ocr-normalization-and-concat-refactor
    provides: normalizeOcr and whitespaceStrippedMatch — used by ocr-diverge-1/2 and split-word test cases
provides:
  - 75-entry golden baseline (71 existing + 4 new validated entries)
  - synthetic-gutter.json fixture with gutter number 25 injected in line 26
  - 4 new TEST_CASES entries covering OCR divergence and gutter-number matching
  - Updated spot-check.js with 8 representative cases and dynamic count
  - Fixed matching-exports.js to export normalizeOcr, buildConcat, stripGutterNumbers
affects: [future-ocr-phases, VALID-01, VALID-02, matching-accuracy-reporting]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Baseline additions-only: new entries appended at end, existing entries never modified
    - Synthetic fixtures: minimal 2-entry JSON subset for isolated algorithm testing
    - Dynamic spot-check count: SPOT_CHECK_IDS.length replaces hardcoded /5 references

key-files:
  created:
    - tests/fixtures/synthetic-gutter.json
    - .planning/phases/22-validation-and-golden-baseline/22-01-SUMMARY.md
  modified:
    - tests/test-cases.js
    - tests/golden/baseline.json
    - scripts/spot-check.js
    - src/matching-exports.js

key-decisions:
  - "s->S OCR gap documented as comment only (not a TEST_CASES entry) — normalizeOcr intentionally excludes s->S (case-flip not in OCR_PAIRS by design); resolution at 0.96 via alpha-strip fallback is a different path, not normalizeOcr working"
  - "Baseline entries appended directly via Edit (not npm run update-golden) — preserves existing 71 entries exactly, git diff shows zero - lines on existing data"
  - "matching-exports.js auto-fixed to add normalizeOcr, buildConcat, stripGutterNumbers — these were missing since phase 20/21, causing 30 pre-existing chrome/firefox dist test failures"

patterns-established:
  - "Pattern: Synthetic fixture = minimal N-entry JSON with controlled artifact injection (gutter number) for isolated Tier validation"
  - "Pattern: spot-check IDs use dynamic SPOT_CHECK_IDS.length — adding entries never requires hardcoded count updates"

requirements-completed: [VALID-01, VALID-02]

# Metrics
duration: 4min
completed: 2026-03-05
---

# Phase 22 Plan 01: Validation and Golden Baseline Summary

**75-entry golden baseline with 4 validated US6324676 OCR/whitespace + synthetic gutter test cases, closing VALID-01 and VALID-02 for v2.2 Matching Robustness milestone**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-05T17:50:35Z
- **Completed:** 2026-03-05T17:54:25Z
- **Tasks:** 2
- **Files modified:** 5 (tests/fixtures/synthetic-gutter.json created + 4 modified)

## Accomplishments

- Added 4 validated test cases (US6324676-ocr-diverge-1/2, split-word, synthetic-gutter-1) with baseline entries at verified confidence levels
- Created tests/fixtures/synthetic-gutter.json with gutter number "25" injected in US11427642 col 1 line 26 — synthetic-gutter-1 resolves to 1:26-27 at 0.85 via Tier 5
- Updated spot-check.js from 5 to 8 representative cases with dynamic count references
- Fixed pre-existing bug in matching-exports.js (normalizeOcr, buildConcat, stripGutterNumbers missing) — restored full CI green (30 chrome/firefox dist tests unblocked)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create synthetic gutter fixture and add 4 test cases with baseline entries** - `8c617a0` (feat)
2. **Task 2: Update spot-check script and run full CI validation** - `ebc51b8` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `tests/fixtures/synthetic-gutter.json` - 2-entry synthetic fixture: US11427642 col 1 lines 26-27 with gutter number "25" injected in line 26
- `tests/test-cases.js` - 4 new TEST_CASES entries, 2 new CATEGORIES (ocr, gutter), s->S gap comment block after array closing
- `tests/golden/baseline.json` - 4 new baseline entries (75 total); git diff shows zero - lines on existing 71 entries
- `scripts/spot-check.js` - SPOT_CHECK_IDS expanded 5 -> 8; header and success message updated; /5 replaced with /${SPOT_CHECK_IDS.length}
- `src/matching-exports.js` - Added normalizeOcr, buildConcat, stripGutterNumbers to exports (auto-fix for pre-existing bug)

## Decisions Made

- s->S OCR gap documented as comment block only (not a TEST_CASES entry): normalizeOcr intentionally excludes s->S; alpha-strip fallback resolves at 0.96 but that is not normalizeOcr working — deferred per VALID-01 decision, OCR-03 covers bounded substitution if needed
- Baseline entries appended directly via Edit tool rather than `npm run update-golden` — preserves integrity of all 71 existing entries, confirmed by git diff showing only additions

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed missing exports in src/matching-exports.js**
- **Found during:** Task 2 (Run full CI validation)
- **Issue:** `normalizeOcr`, `buildConcat`, and `stripGutterNumbers` were missing from matching-exports.js since phases 20/21. This caused 30 test failures in chrome-dist and firefox-dist test suites (TypeError: buildConcat is not a function)
- **Fix:** Added all three functions to the export list in matching-exports.js
- **Files modified:** `src/matching-exports.js`
- **Verification:** Rebuilt dist bundles; test:chrome 142/142 passed, test:firefox 142/142 passed
- **Committed in:** `ebc51b8` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Auto-fix was essential for full CI green. The missing exports were a clear omission from phase 20/21 — not new scope.

## Issues Encountered

None beyond the pre-existing matching-exports.js bug (auto-fixed per Rule 1).

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- v2.2 Matching Robustness milestone complete: MATCH-01/02/03 (phase 21) + VALID-01/VALID-02 (phase 22) all satisfied
- Golden baseline at 75 entries, all CI green on Chrome and Firefox builds
- s->S OCR gap documented in test-cases.js — if future OCR phase addresses this, OCR-03 requirement covers bounded substitution
- Spot-check script ready for manual browser verification of all 8 representative cases

## Self-Check: PASSED

All files found. All commits verified.

---
*Phase: 22-validation-and-golden-baseline*
*Completed: 2026-03-05*

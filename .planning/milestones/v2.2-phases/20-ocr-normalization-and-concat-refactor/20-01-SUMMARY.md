---
phase: 20-ocr-normalization-and-concat-refactor
plan: 01
subsystem: testing
tags: [matching, ocr, normalization, tdd, refactor]

# Dependency graph
requires: []
provides:
  - "normalizeOcr(text) exported from matching.js — returns {text, changed} after applying 5 OCR substitution pairs"
  - "buildConcat(positionMap) exported from matching.js — returns {concat, boundaries, changedRanges}"
  - "OCR_PAIRS constant at module top with 5 prose-safe substitution pairs"
  - "matchAndCite refactored to use buildConcat instead of inline loop"
  - "normalizeOcr applied to both selectedText and concat so OCR normalization is symmetric"
affects: [gutterTolerantMatch, Phase 21, Phase 22]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TDD: RED (failing tests) -> GREEN (implementation) -> REFACTOR"
    - "OCR normalization: apply to both sides of match comparison (selectedText and concat) so transformation is symmetric — clean text passes through unchanged, OCR-corrupted text normalizes to match HTML"
    - "Concat extraction: buildConcat returns {concat, boundaries, changedRanges} for reuse across matching tiers"

key-files:
  created:
    - "tests/unit/shared-matching.test.js (extended — normalizeOcr and buildConcat test blocks added)"
  modified:
    - "src/shared/matching.js — OCR_PAIRS, normalizeOcr, buildConcat added; matchAndCite refactored to use buildConcat"

key-decisions:
  - "Apply normalizeOcr to both selectedText (normalized) and positionMap concat so that clean text transforms identically on both sides (net-zero effect), while OCR-corrupted PDF text normalizes to match correct HTML selection"
  - "OCR_PAIRS includes 5 pairs: rn->m, cl->d, cI->d, vv->w, li->h — applied globally to all text, not just detected OCR regions"
  - "buildConcat applies normalizeOcr AFTER normalizeText and AFTER wrap-hyphen detection, preserving wrap-hyphen correctness from baseline"
  - "changedRanges tracks which character ranges in concat were affected by OCR normalization (infrastructure for future tiers)"

patterns-established:
  - "Symmetric normalization: when transforming the concat, always apply the same transformation to the selectedText so matching is preserved"
  - "buildConcat is the single source of truth for concat/boundaries/changedRanges — no inline loops in matchAndCite"

requirements-completed: [MATCH-02, MATCH-03]

# Metrics
duration: 30min
completed: 2026-03-05
---

# Phase 20 Plan 01: OCR Normalization and Concat Refactor Summary

**normalizeOcr (5 OCR pairs, returns {text,changed}) and buildConcat ({concat,boundaries,changedRanges}) extracted to matching.js exports; matchAndCite refactored to use buildConcat; all 153 tests pass with zero regressions**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-03-05T07:40:49Z
- **Completed:** 2026-03-05T08:10:00Z
- **Tasks:** 1 (TDD: RED + GREEN phases)
- **Files modified:** 2

## Accomplishments

- Implemented `normalizeOcr(text)` export that applies 5 OCR substitution pairs and returns `{text, changed}`
- Implemented `buildConcat(positionMap)` export that extracts the inline concat loop from matchAndCite and returns `{concat, boundaries, changedRanges}`
- Refactored `matchAndCite` to call `buildConcat` instead of inlining the loop
- All 136 existing tests pass; 17 new tests added for normalizeOcr and buildConcat (153 total)
- All 71 golden baseline cases produce identical citations and confidence values

## Task Commits

Each task was committed atomically:

1. **RED: Failing tests for normalizeOcr and buildConcat** - `c8958a8` (test)
2. **GREEN: Implement normalizeOcr and extract buildConcat** - `a5ea6ec` (feat)

_Note: TDD task had two commits (test RED -> feat GREEN). No REFACTOR commit needed — code was clean after GREEN._

## Files Created/Modified

- `src/shared/matching.js` - Added OCR_PAIRS constant, normalizeOcr export, buildConcat export; matchAndCite now calls buildConcat and applies normalizeOcr to selectedText for symmetric normalization
- `tests/unit/shared-matching.test.js` - Added normalizeOcr and buildConcat to imports; added describe('normalizeOcr') block (8 tests) and describe('buildConcat') block (9 tests)

## Decisions Made

**Apply normalizeOcr symmetrically to both selectedText and concat:** The plan specified applying normalizeOcr to the concat but not to the selectedText. When tested against the 71 golden baseline cases, 10 cases failed because OCR pairs like `cl->d` and `li->h` transform common English words (e.g., "claim" -> "daim", "application" -> "apphcation"). The fix: apply normalizeOcr to both the selectedText (normalized) and the concat. For clean text, both sides transform identically — the match is preserved. For OCR-corrupted PDF text, the concat normalizes toward the correct form, matching the HTML selection. This satisfies all must_haves: golden baseline passes, changedRanges tracks OCR regions.

**OCR_PAIRS chosen as specified in plan:** `rn->m`, `cl->d`, `cI->d`, `vv->w`, `li->h` — these are the 5 pairs from the plan. Applied globally (no bounded/contextual substitution). The symmetric application strategy makes them safe for all text.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Apply normalizeOcr symmetrically to selectedText to prevent match failures**
- **Found during:** Task 1 GREEN phase (implementation)
- **Issue:** Plan specified applying normalizeOcr only to the positionMap concat, not to the selectedText. OCR pairs like `cl->d` and `li->h` transform common English letter sequences (e.g., "claim" -> "daim", "application" -> "apphcation"). When only the concat is transformed, the selectedText no longer matches the concat — 10 of 71 golden baseline cases fail (all with no-match result).
- **Fix:** Added `normalized = normalizeOcr(normalized).text;` in matchAndCite after the wrap-hyphen strip, before buildConcat. Both sides now receive identical OCR transformation: clean text is unaffected end-to-end, OCR-corrupted PDF text normalizes toward the correct form.
- **Files modified:** `src/shared/matching.js`
- **Verification:** All 71 golden baseline cases pass (70 exact, 1 pre-existing boundary off-by-1); 153 total tests pass
- **Committed in:** `a5ea6ec` (feat(20-01) commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Auto-fix necessary for correctness. The symmetric application is the intended design — applying normalizeOcr to only one side of the comparison was an inconsistency in the plan's action section.

## Issues Encountered

- The text-matcher.test.js corpus test (71 golden cases) takes ~3 seconds. The Bash tool's background task output truncation gave incomplete vitest results when running the full suite. Worked around by running each test file individually and using `node -e "spawnSync()"` to capture complete synchronous output.

## Next Phase Readiness

- `normalizeOcr` and `buildConcat` are exported and tested — ready for Phase 20-02 (gutterTolerantMatch)
- `changedRanges` from `buildConcat` provides OCR region tracking for future tiers
- All 153 tests pass — zero regressions

---
*Phase: 20-ocr-normalization-and-concat-refactor*
*Completed: 2026-03-05*

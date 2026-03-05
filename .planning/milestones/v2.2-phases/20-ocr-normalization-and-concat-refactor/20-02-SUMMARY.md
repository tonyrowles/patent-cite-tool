---
phase: 20-ocr-normalization-and-concat-refactor
plan: 02
subsystem: matching
tags: [ocr, normalization, confidence-penalty, tdd, matching-pipeline]

# Dependency graph
requires:
  - phase: 20-01
    provides: normalizeOcr and buildConcat functions in matching.js

provides:
  - matchAndCite with OCR selection normalization applied before all cascade tiers
  - Confidence penalty of 0.02 when selection contained OCR-confused characters (selChanged=true)
  - applyPenaltyIfNeeded helper wrapping all four cascade tier return points
  - 4 new OCR integration tests in shared-matching.test.js

affects:
  - 21-gutter-tolerant-match
  - any future work on matching cascade tiers

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "OCR penalty fires only when selection was changed (selChanged=true), not when concat was changed — preserves baseline confidence for clean selections against OCR-normalized concat"
    - "applyPenaltyIfNeeded inner function captures selChanged closure — clean wrapping pattern"
    - "TDD: failing tests committed first, then minimal GREEN implementation, then REFACTOR cleanup"

key-files:
  created: []
  modified:
    - src/shared/matching.js
    - tests/unit/shared-matching.test.js

key-decisions:
  - "OCR penalty condition is selChanged only (not changedRanges overlap) — baseline patent text contains rn/cl/li in real English words so changedRanges is almost always non-empty, making overlap check insufficient as the sole criterion"
  - "changedRanges retained in buildConcat destructuring comment for future refinement but not used in penalty logic"
  - "Flat 0.02 penalty applied once regardless of how many OCR pairs matched in the selection"

patterns-established:
  - "Pattern: penalty gating on selChanged: for matching pipeline features that pre-process both sides symmetrically, the selection-side change flag is the correct necessity test"

requirements-completed: [MATCH-02, MATCH-03]

# Metrics
duration: 15min
completed: 2026-03-05
---

# Phase 20 Plan 02: Wire OCR Normalization into matchAndCite Summary

**OCR-normalized selection matching with 0.02 confidence penalty: matchAndCite applies normalizeOcr to selected text, switches all four cascade tiers to ocrNormalized, and deducts 0.02 when selection contained OCR-confused characters — zero regressions on 71 golden baseline cases.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-03-05T00:13:00Z
- **Completed:** 2026-03-05T00:17:00Z
- **Tasks:** 1 (TDD: 3 commits — test, feat, refactor)
- **Files modified:** 2

## Accomplishments
- Tracked `selChanged` from `normalizeOcr` call on selection text in `matchAndCite`
- Replaced all `normalized` usages in the cascade with `ocrNormalized` (8 occurrences)
- Added `applyPenaltyIfNeeded` helper that deducts 0.02 when `selChanged === true`
- 4 new OCR integration tests: OCR-confused selection → 0.98 confidence, clean selection → 1.0
- All 71 golden baseline cases preserved at exact same tier and confidence values
- Total test count: 157 (up from 153 in Plan 01)

## Task Commits

Each TDD phase committed atomically:

1. **RED: failing tests for OCR selection normalization and penalty** - `5dcb363` (test)
2. **GREEN: wire normalizeOcr into matchAndCite cascade with penalty logic** - `e8eb4ca` (feat)
3. **REFACTOR: simplify penalty application pattern** - `d0942bd` (refactor)

## Files Created/Modified
- `src/shared/matching.js` - matchAndCite now uses ocrNormalized for all cascade tiers + applyPenaltyIfNeeded penalty logic
- `tests/unit/shared-matching.test.js` - 4 new OCR integration tests in matchAndCite OCR integration describe block

## Decisions Made
- **Penalty condition: `selChanged` only (not changedRanges overlap).** The initial implementation attempted `shouldApplyOcrPenaltyConservative()` using `selChanged || changedRanges.length > 0`, which caused 2 of 71 baseline cases to drop from confidence 1.0 to 0.98. Root cause: real patent text contains words like "information", "application", "clinical" — all have 'rn', 'cl', 'li' patterns — so changedRanges is non-empty for virtually every real patent positionMap. The correct necessity test is `selChanged` only: if the user's selected text required OCR correction, apply penalty; if the selection was already clean (baseline cases), no penalty.
- **changedRanges preserved but unused.** The `changedRanges` return value from `buildConcat` is still available and could support future overlap-based precision (e.g., penalizing only when the matched region overlaps a changed range on the concat side). Left as a comment for future refinement without removing the capability.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected penalty condition from conservative changedRanges check to selChanged-only**
- **Found during:** Task 1 GREEN phase (implementation)
- **Issue:** Plan's "conservative approach" (`selChanged || changedRanges.length > 0`) penalized 2 of 71 baseline cases — real patent text has 'rn'/'cl'/'li' in common English words, so changedRanges is always non-empty
- **Fix:** Simplified penalty to `selChanged` only — correct because baseline selections have no OCR patterns, OCR-confused selections always have selChanged=true
- **Files modified:** src/shared/matching.js
- **Verification:** All 157 tests pass, 71/71 baseline cases preserved at confidence 1.0 (or pre-existing boundary offset), High-conf 70/70 correct
- **Committed in:** e8eb4ca (feat commit, GREEN phase)

---

**Total deviations:** 1 auto-fixed (Rule 1 — Bug: incorrect penalty condition)
**Impact on plan:** Required logic correction from plan spec. Plan's "conservative approach" was inconsistent with requirement "all 71 baseline cases at confidence 1." Fix aligns implementation with requirements without scope creep.

## Issues Encountered
- The pre-existing US6324676-cross-col off-by-one case (boundary offset) appears in metrics as 1 low-conf case — this was present before Phase 20 and is unrelated to OCR normalization. Confirmed by stash-and-retest comparison.

## Next Phase Readiness
- OCR normalization fully integrated into matching pipeline (both Plan 01 and Plan 02 complete)
- Phase 20 complete — MATCH-02 and MATCH-03 both satisfied
- Phase 21 can use `buildConcat` directly for gutterTolerantMatch without duplicating the concat loop
- `changedRanges` available from `buildConcat` for Phase 21 if overlap-based penalty refinement is desired

---
*Phase: 20-ocr-normalization-and-concat-refactor*
*Completed: 2026-03-05*

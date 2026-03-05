---
phase: 21-gutter-tolerant-matching
verified: 2026-03-05T09:15:00Z
status: passed
score: 5/5 must-haves verified
re_verification: false
---

# Phase 21: Gutter-Tolerant Matching Verification Report

**Phase Goal:** Citations succeed on patents where stray gutter line numbers (multiples of 5, range 5-65) slipped past the upstream spatial filter and landed in the concat text
**Verified:** 2026-03-05T09:15:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1 | A selection that previously failed Tiers 1-4 due to embedded gutter numbers in the concat now resolves via Tier 5 with confidence 0.85 | VERIFIED | Test 14 (`matchAndCite('method further', positionMap)` with "method 20 25 further" concat) passes with confidence 0.85; Test 11 (direct `gutterTolerantMatch` call) also passes at 0.85 |
| 2 | Selections from chemical patents (US9688736, US10472384) that contain legitimate numbers are not incorrectly stripped — all 71 existing baseline cases pass unchanged | VERIFIED | `npx vitest run tests/unit/text-matcher.test.js`: 82 tests pass, 71 corpus cases at original tier/confidence; 100% close accuracy |
| 3 | `gutterTolerantMatch` uses a space-anchored strip pattern so only space-isolated standalone multiples of 5 (5-65) are removed | VERIFIED | `stripGutterNumbers` checks `concat[pos-1] === ' '` and `concat[pos+len] === ' '` (no `\b` word boundaries); Tests 5 and 6 confirm "30% ACN" and "US5559167" are unchanged |
| 4 | No OCR penalty stacking — Tier 5 always returns exactly 0.85 even when OCR normalization also fired | VERIFIED | Test 15 passes: `matchAndCite('rnethod further', positionMap)` with `selChanged=true` returns confidence 0.85 (not 0.83); `gutterResult` is returned directly without `applyPenaltyIfNeeded` wrapper (verified by grep: no wrapping found) |
| 5 | No-op guard: if stripping changed nothing, returns null immediately | VERIFIED | Test 10 passes: `gutterTolerantMatch` on a concat with no gutter numbers returns null; `stripGutterNumbers` returns `changed=false`; early `if (!changed) return null` guard confirmed in implementation (line 566) |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/shared/matching.js` | `stripGutterNumbers` and `gutterTolerantMatch` functions, both exported | VERIFIED | Both functions present at lines 478 and 561 respectively; both exported with `export function` |
| `src/matching-exports.js` | Re-export of `gutterTolerantMatch` for content script use | VERIFIED | Line 5: `gutterTolerantMatch,` present in re-export list |
| `tests/unit/shared-matching.test.js` | Unit tests for `stripGutterNumbers` and `gutterTolerantMatch` | VERIFIED | `describe('stripGutterNumbers', ...)` block with 9 tests (lines 277-352); `describe('gutterTolerantMatch', ...)` block with 3 tests (lines 354-405); `describe('matchAndCite Tier 5 integration', ...)` with 3 integration tests (lines 407-457) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/shared/matching.js (matchAndCite)` | `gutterTolerantMatch` | Call after Tier 4 fuzzy match, before final `return null` | VERIFIED | Lines 723-726: `const gutterResult = gutterTolerantMatch(ocrNormalized, concat, boundaries, positionMap, contextBefore, contextAfter); if (gutterResult) return gutterResult;` — placed after fuzzy block ending at line 715, before `return null` at line 728 |
| `src/shared/matching.js (gutterTolerantMatch)` | `stripGutterNumbers(concat)` | Builds stripped concat and strippedToOrig offset array | VERIFIED | Line 563: `const { stripped, strippedToOrig, changed } = stripGutterNumbers(concat);` |
| `src/shared/matching.js (gutterTolerantMatch)` | `whitespaceStrippedMatch, bookendMatch, fuzzySubstringMatch, resolveMatch` | Cascade replay on stripped concat with remapped boundaries | VERIFIED | Lines 600-622: full inner Tier 1-4 cascade present — `findAllOccurrences`+`resolveMatch`, `whitespaceStrippedMatch`, `bookendMatch`, `fuzzySubstringMatch`+`resolveMatch` — all called with `remappedBoundaries` not original `boundaries` |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| MATCH-01 | `21-01-PLAN.md` | Matching pipeline tolerates stray gutter line numbers (multiples of 5, 5-65) in concat text by stripping them as a Tier 5 fallback when Tiers 1-4 fail, with confidence capped at 0.85 (yellow UI) | SATISFIED | `gutterTolerantMatch` implemented and wired as Tier 5; returns exactly 0.85 confidence; 16 new tests covering all specified behaviors; full CI 173/173 pass |

No orphaned requirements: REQUIREMENTS.md maps MATCH-01 solely to Phase 21, and the plan claims MATCH-01. Coverage is complete.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | — | — | No anti-patterns found |

No TODO/FIXME/placeholder comments found in modified files. No empty implementations. No suspicious `return null` patterns — all guard-clause returns in `matching.js` are legitimate (input validation and no-match outcomes). Implementation is substantive.

### Human Verification Required

None. All observable truths were verifiable programmatically:

- Functional behavior: covered by unit and integration tests (173 tests, all green)
- Confidence values: asserted directly in tests
- Regression baseline: 71 golden corpus cases verified via `text-matcher.test.js`
- Wiring: verified via grep and code inspection
- No UI or visual behavior introduced in this phase

### Gaps Summary

No gaps. All five must-have truths are verified, all three artifacts are substantive and wired, all key links are confirmed, and MATCH-01 is fully satisfied.

---

## Verification Detail

### Test Run Results

```
npx vitest run tests/unit/shared-matching.test.js
  56 tests, 56 passed

npx vitest run tests/unit/text-matcher.test.js
  82 tests, 82 passed
  71 corpus cases: 70 exact + 1 boundary off-by-1, 0 mismatch, 0 no-match
  100% close accuracy

npx vitest run (full suite)
  173 tests, 173 passed
```

### Commit Verification

- `16f4095` — `test(21-01): add failing tests for stripGutterNumbers and gutterTolerantMatch` — confirmed in git log
- `617e264` — `feat(21-01): implement stripGutterNumbers, gutterTolerantMatch, wire Tier 5 into matchAndCite` — confirmed in git log

### Implementation Correctness Notes

**Space-anchored stripping (not `\b`):** `stripGutterNumbers` checks `concat[pos-1] === ' '` (or string start) and `concat[pos+len] === ' '` (or string end). This correctly passes Test 5 ("30% ACN" unchanged) and Test 6 ("US5559167" unchanged), where `\b` would incorrectly strip.

**Offset array rebuild after collapse:** The survive-mask approach builds a `preCollapse` string, then a second pass collapses double-spaces and simultaneously tracks which original positions survive into the final `stripped` string. This matches the approach specified in RESEARCH.md and produces correct `strippedToOrig` mappings verified by Test 7.

**Boundary remapping:** `origToStripped` Int32Array with forward scan for `charStart` and backward scan for `charEnd` handles the edge case where a boundary's edge character was stripped. Verified by Test 13 (multi-entry positionMap returning correct `citation` through remapped boundaries).

**No penalty stacking:** `gutterResult` is returned bare — not wrapped in `applyPenaltyIfNeeded`. Confirmed by grep (no match for `applyPenaltyIfNeeded.*gutterResult`) and by Test 15 asserting confidence 0.85 when `selChanged=true`.

---

_Verified: 2026-03-05T09:15:00Z_
_Verifier: Claude (gsd-verifier)_

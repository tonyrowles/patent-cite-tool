---
phase: 22-validation-and-golden-baseline
verified: 2026-03-05T18:10:00Z
status: passed
score: 7/7 must-haves verified
re_verification: false
---

# Phase 22: Validation and Golden Baseline — Verification Report

**Phase Goal:** The US6324676 OCR-heavy patent is covered by verified test cases in the golden baseline, and merged/split-word handling is confirmed or extended
**Verified:** 2026-03-05T18:10:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | US6324676-ocr-diverge-1 resolves to citation 2:12 at confidence 0.99 via Tier 2 whitespace-stripped match | VERIFIED | `matchAndCite` live output: `citation=2:12 confidence=0.99`; golden entry confirmed in `tests/golden/baseline.json:286` |
| 2 | US6324676-ocr-diverge-2 resolves to citation 3:12-13 at confidence 0.99 via Tier 2 whitespace-stripped match | VERIFIED | `matchAndCite` live output: `citation=3:12-13 confidence=0.99`; golden entry confirmed in `tests/golden/baseline.json:287` |
| 3 | US6324676-split-word resolves to citation 2:67-3:2 at confidence 0.96 confirming split-word handling via Tier 2 | VERIFIED | `matchAndCite` live output: `citation=2:67-3:2 confidence=0.96`; golden entry confirmed in `tests/golden/baseline.json:288` |
| 4 | synthetic-gutter-1 resolves to citation 1:26-27 at confidence 0.85 via Tier 5 gutterTolerantMatch | VERIFIED | `matchAndCite` live output: `citation=1:26-27 confidence=0.85`; golden entry confirmed in `tests/golden/baseline.json:289` |
| 5 | All 71 existing baseline entries remain unmodified — git diff shows only additions | VERIFIED | `git show 8c617a0 -- tests/golden/baseline.json` shows exactly 1 deletion line (`  }`) which is the JSON closing brace repositioned to accommodate new entries — no existing entry data deleted. Verified by Python: `len(baseline) == 75`. |
| 6 | s/S gap is documented as a comment block in test-cases.js but NOT added to TEST_CASES array | VERIFIED | `tests/test-cases.js:577-591` contains `KNOWN GAP` comment block after closing `];`. `TEST_CASES.length == 75` (not 76). Comment explicitly notes "not a TEST_CASES entry". |
| 7 | Full CI passes on both Chrome and Firefox builds | VERIFIED | `npm test` output: `Test Files 6 passed (6), Tests 177 passed (177)` (unit); `Test Files 2 passed (2), Tests 142 passed (142)` (chrome); `Test Files 2 passed (2), Tests 142 passed (142)` (firefox); lint `errors 0`. |

**Score:** 7/7 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `tests/fixtures/synthetic-gutter.json` | 2-entry synthetic fixture with gutter number 25 injected into US11427642 col 1 line 26 data | VERIFIED | File exists, 27 lines, 2 entries. Line 26 text contains `"25"` gutter injection. Matches plan spec exactly. |
| `tests/test-cases.js` | 4 new TEST_CASES entries (ocr-diverge-1, ocr-diverge-2, split-word, synthetic-gutter-1) plus ocr and gutter CATEGORIES | VERIFIED | `TEST_CASES.length == 75`; exports `CATEGORIES` and `TEST_CASES`; `CATEGORIES` contains `'ocr'` and `'gutter'` keys at lines 33-34; 4 new entries at lines 547-574. |
| `tests/golden/baseline.json` | 75 total entries (71 existing + 4 new additions); contains US6324676-ocr-diverge-1 | VERIFIED | Python count: 75 entries; `US6324676-ocr-diverge-1` at line 286 with `{"citation": "2:12", "confidence": 0.99}`. |
| `scripts/spot-check.js` | Updated SPOT_CHECK_IDS with 3 new entries (8 total) and dynamic count | VERIFIED | `SPOT_CHECK_IDS` has 8 entries (lines 40-49); all runtime count references use `SPOT_CHECK_IDS.length`; success message uses `${SPOT_CHECK_IDS.length}` at line 137. |

**Note — bonus artifact:** `src/matching-exports.js` was also updated to export `normalizeOcr`, `buildConcat`, and `stripGutterNumbers` (fixing a pre-existing Phase 20/21 omission). This was an auto-fix deviation, not in the PLAN but necessary for CI green.

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `tests/test-cases.js` | `tests/golden/baseline.json` | TEST_CASES id must have matching baseline entry | VERIFIED | All 4 new IDs (`US6324676-ocr-diverge-1`, `US6324676-ocr-diverge-2`, `US6324676-split-word`, `synthetic-gutter-1`) present in both `TEST_CASES` array and `baseline.json`. Tests pass (no "No golden entry" throw). |
| `tests/test-cases.js` | `tests/fixtures/synthetic-gutter.json` | patentFile path in synthetic-gutter-1 entry | VERIFIED | `tests/test-cases.js:571` contains `patentFile: './tests/fixtures/synthetic-gutter.json'`; fixture file exists at that path. |
| `tests/unit/text-matcher.test.js` | `tests/test-cases.js` | imports TEST_CASES and iterates all entries against baseline | VERIFIED | `tests/unit/text-matcher.test.js:18`: `import { TEST_CASES } from '../test-cases.js'`; verbose test run shows all 4 new entries pass individually. |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| VALID-01 | 22-01-PLAN.md | US6324676 has 3-5 test cases covering confirmed OCR error patterns, with manually verified expected citations added to the golden baseline | SATISFIED | 3 US6324676 OCR test cases (ocr-diverge-1, ocr-diverge-2, split-word) + 1 synthetic gutter = 4 total. All pass with verified citations. Golden baseline entries added as additions-only. Meets "3-5" range. |
| VALID-02 | 22-01-PLAN.md | Merged words and split words are verified as handled by existing whitespace-stripped matching — dedicated step added only if tests fail | SATISFIED | `US6324676-split-word` confirms split-word handling at 0.96 confidence (Tier 2 whitespace-stripped match). `US6324676-ocr-diverge-1` confirms merged-word direction (FPGAuse). No dedicated handling step was needed — existing Tier 2 handles both directions. |

**Orphaned requirements check:** REQUIREMENTS.md traceability table maps only VALID-01 and VALID-02 to Phase 22. No additional requirement IDs map to this phase. No orphaned requirements.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `scripts/spot-check.js` | 37 | Stale inline comment: `// 5 representative cases spanning key test categories` (JSDoc header correctly says "8") | Info | Cosmetic only — all runtime logic uses `SPOT_CHECK_IDS.length`. No behavioral impact. |

No blockers. No warnings.

---

### Human Verification Required

#### 1. Browser extension spot-check (optional for phase closure)

**Test:** Run `node scripts/spot-check.js` and use the output to verify citations in real Chrome and Firefox browser extensions on live Google Patents pages.
**Expected:** All 8 cases produce the cited column:line references when selecting the indicated text on the actual patent pages.
**Why human:** Browser extension behavior on live web pages cannot be verified programmatically. The algorithmic correctness is confirmed by CI — this verifies end-to-end UX.

This item does not block phase closure (the PLAN explicitly states "Programmatic verification sufficient — phase does not block on manual PDF review by user").

---

### Gaps Summary

No gaps. All 7 observable truths are verified. All 4 required artifacts exist, are substantive, and are wired. Both key links verified. VALID-01 and VALID-02 satisfied. Full CI passes (177 unit + 142 chrome + 142 firefox = 461 tests, 0 failures, lint 0 errors).

One minor cosmetic observation: `scripts/spot-check.js` line 37 has a stale inline comment (`5 representative cases`) left over from before the update. The JSDoc header on line 4 correctly says "8 representative cases" and all runtime behavior uses `SPOT_CHECK_IDS.length`. This requires no remediation.

---

## Summary

Phase 22 goal is **achieved**. The US6324676 OCR-heavy patent has 3 validated test cases in the golden baseline (ocr-diverge-1 at 2:12/0.99, ocr-diverge-2 at 3:12-13/0.99, split-word at 2:67-3:2/0.96), plus 1 synthetic gutter validation case (synthetic-gutter-1 at 1:26-27/0.85). Merged-word and split-word handling are confirmed via whitespace-stripped Tier 2 matching without requiring a dedicated step. The 71 existing baseline entries are untouched. All CI is green on both Chrome and Firefox builds.

---

_Verified: 2026-03-05T18:10:00Z_
_Verifier: Claude (gsd-verifier)_

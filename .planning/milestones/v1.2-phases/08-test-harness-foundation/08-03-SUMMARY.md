---
phase: 08-test-harness-foundation
plan: 03
subsystem: testing
tags: [golden-baseline, off-by-one-classifier, accuracy-metrics, vitest, corpus-test]

# Dependency graph
requires:
  - 08-01 (Vitest infrastructure, matchAndCite exported)
  - 08-02 (15 fixture JSONs, 44-entry TEST_CASES registry)
provides:
  - tests/helpers/classify-result.js: classifyResult() for exact/systematic/boundary/mismatch classification
  - tests/golden/baseline.json: frozen citation + confidence for all 44 test cases
  - tests/unit/text-matcher.test.js: full corpus test with golden comparison + accuracy metrics afterAll
  - scripts/update-golden.js: manual-only script to regenerate baseline.json
affects:
  - 09-accuracy-hardening (uses golden baseline to detect regressions)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - golden-baseline-snapshot-testing
    - off-by-one-tier-classification
    - corpus-test-with-accuracy-metrics

key-files:
  created:
    - tests/helpers/classify-result.js
    - tests/unit/classify-result.test.js
    - scripts/update-golden.js
    - tests/golden/baseline.json
  modified:
    - tests/unit/text-matcher.test.js
    - package.json

key-decisions:
  - "Golden baseline records current algorithm output including the one no-match case (US11086978-spec-short) — accurate 'before' snapshot is more valuable than an artificially clean one"
  - "Off-by-one tests warn (console.warn) but do not fail — preserves test suite greenness while surfacing boundary issues for Phase 9"
  - "update-golden.js requires --confirm flag — prevents accidental baseline overwrite from test runner or CI"

requirements-completed: [TEST-04, TEST-05, TEST-06]

# Metrics
duration: 2min
completed: 2026-03-03
---

# Phase 8 Plan 3: Golden Baseline Summary

**44-entry golden baseline frozen with 97.7% exact accuracy (43/44 matches), off-by-one classifier distinguishing systematic/boundary/mismatch tiers, and accuracy metrics printed after every test run**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-03T03:59:07Z
- **Completed:** 2026-03-03T04:01:30Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Created `tests/helpers/classify-result.js` with `classifyResult(expected, actual)` — parses same-column (`4:15-20`), cross-column (`3:45-4:5`), and single-line (`4:15`) citation formats; returns exact/systematic/boundary/mismatch tiers with delta detail strings
- Created `tests/unit/classify-result.test.js` with 9 unit tests covering all tier cases including cross-column citations, nulls, and unparseable inputs — all pass
- Created `scripts/update-golden.js` — reads TEST_CASES registry, calls matchAndCite on each fixture, writes baseline.json; requires `--confirm` flag for safety
- Generated `tests/golden/baseline.json` — 44 entries frozen from current algorithm output (Phase 8 "before" snapshot)
- Rewrote `tests/unit/text-matcher.test.js` — keeps original 11 smoke tests, adds 44-case corpus describe block with golden comparison and afterAll accuracy metrics summary
- Updated `package.json` to pass `--confirm` automatically in the update-golden script

## Phase 8 Baseline Accuracy

| Metric | Value |
|--------|-------|
| Total test cases | 44 |
| Exact match | 43 (97.7%) |
| Systematic +/-1 | 0 (0.0%) |
| Boundary +/-1 | 0 (0.0%) |
| Total mismatch | 0 (0.0%) |
| No match | 1 (2.3%) |
| Exact accuracy | 97.7% |
| Close accuracy | 97.7% |
| High-conf (>=0.95) correct | 43/43 (100.0%) |

The one no-match (`US11086978-spec-short`) is expected — the algorithm could not locate this text in its fixture. This is the accurate "before Phase 9" snapshot.

## Task Commits

Each task was committed atomically:

1. **Task 1: Off-by-one classifier and update-golden script** - `a4ce7c3` (feat)
2. **Task 2: Golden baseline and full corpus test with accuracy metrics** - `d04ef56` (feat)

## Files Created/Modified

- `tests/helpers/classify-result.js` - classifyResult() with exact/systematic/boundary/mismatch tier classification
- `tests/unit/classify-result.test.js` - 9 unit tests for all classification cases
- `scripts/update-golden.js` - Manual baseline regeneration script (requires --confirm)
- `tests/golden/baseline.json` - 44-entry frozen golden baseline
- `tests/unit/text-matcher.test.js` - 11 smoke tests + 44 corpus tests + accuracy afterAll
- `package.json` - update-golden script passes --confirm automatically

## Decisions Made

- **Golden baseline records the no-match case accurately:** US11086978-spec-short returned null from the algorithm. Rather than excluding this case or handcrafting an expected value, the baseline records `{ citation: null, confidence: 0 }`. This is the true "before" snapshot. Phase 9 can measure improvement by tracking this case moving from no-match to a valid citation.

- **Off-by-one tests warn but do not fail:** The plan specified this explicitly. Uses `console.warn` for systematic/boundary tiers, but does not call `expect()` for those cases. This keeps the test suite green while surfacing any off-by-one issues visible in the console.

- **update-golden.js requires --confirm flag:** Safety mechanism prevents accidental baseline overwrite. The package.json script already passes `--confirm`, so `npm run update-golden` works correctly but `node scripts/update-golden.js` (direct invocation) exits with an error.

## Deviations from Plan

None — plan executed exactly as written.

## Next Phase Readiness

- `tests/golden/baseline.json` — 44-entry frozen baseline ready for Phase 9 regression detection
- `tests/helpers/classify-result.js` — classifier available for Phase 9 tests
- `npx vitest run` exits 0 with 64 passing tests and accuracy metrics printed
- Phase 9 (accuracy hardening) can now make algorithm changes and immediately detect regressions via the golden baseline
- Phase 8 "before" numbers: 97.7% exact accuracy, 1 no-match case to fix

---
*Phase: 08-test-harness-foundation*
*Completed: 2026-03-03*

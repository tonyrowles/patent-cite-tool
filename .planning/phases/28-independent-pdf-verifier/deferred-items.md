# Phase 28 — Deferred Items

Issues discovered during Phase 28 execution that are NOT caused by Phase 28
changes and are deferred per the SCOPE BOUNDARY rule.

## Discovered during Plan 28-02

### Pre-existing failures: tests/unit/text-matcher.test.js

**Status at base 3ef1916 (before 28-02 changes):** 15 failed / 72 passed (87 total)
**Status after 28-02 changes:** 15 failed / 72 passed (unchanged)

The 15 failures are all in the `matchAndCite corpus` describe block — golden
baseline mismatches between `tests/golden/baseline.json` and the current
`src/shared/matching.js` output. Examples:

- `US8352400-cross-col`: expected `'1:62-2:3'`, got `'1:60-2:3'`
- (14 more cases in similar shape)

**Why deferred (not in scope of Plan 28-02):**

- These failures pre-exist Plan 28-02 — confirmed by running `npm run test:src`
  at base commit `3ef1916` before any 28-02 work began.
- The failures are in production-code matcher logic + golden baseline data,
  not in the test infrastructure that 28-02 modifies (`tests/e2e/lib/` and
  `tests/unit/report.test.js`).
- Phase 28's scope is "Independent PDF Verifier" — the verifier is *independent*
  of `src/shared/matching.js` (VFY-02 forbids importing from src/). The
  matcher's golden drift is a separate Phase 27 / matcher concern.
- Fixing them would require regenerating the golden baseline or fixing the
  matcher — both architectural changes outside Plan 28-02's wave 1 task list
  (report.js + error-codes taxonomy).

**Recommended adjudication:**

The Phase 28 verifier (Plan 28-01) is the right tool for adjudicating these
golden drifts — it independently re-parses the PDFs and reports whether the
*actual* PDF text agrees with the *baseline* citation. After Plan 28-01 ships
and the verifier calibrates against the 65-case corpus (Plan 28-05), the
verifier verdict per case will tell us whether each text-matcher failure is:
(a) a matcher regression — fix `src/shared/matching.js`, or
(b) a stale baseline — regenerate `tests/golden/baseline.json`.

Logging as deferred for Plan 28-05's calibration phase to handle.

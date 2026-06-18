---
phase: 14-end-to-end-uat-digest
plan: 01
subsystem: testing
tags: [weekly-digest, bug-reports, github-actions, vitest, ledger-cap]

# Dependency graph
requires:
  - phase: 13-triple-gate-extension
    provides: assertTripleGate Leg 3 widened to OR-accept report-fix-candidate; source_issue marker wired
  - phase: 12-fix-generation-regression-gate
    provides: auto-fix/* PR label conventions (auto-fix:verified, auto-fix:partial-verified, human-review-required, auto-fix-stuck)
provides:
  - renderBugReportsSection pure function in scripts/weekly-digest.mjs (DGST-01)
  - fetchBugReportIssues gh-only fetch helper (errors-returned, injected-deps seam)
  - runDigest wiring for BUG_REPORTS section (degrade-to-n/a, single-stderr-warning)
  - Unit tests for BUG_REPORTS section + ledger-cap assertion (UAT-03 local half)
  - Negative YAML guard: no wrangler/CLOUDFLARE in the digest cron (T-14-03/D-01)
affects: [14-02-PLAN, weekly-digest, runDigest assembly]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "renderBugReportsSection mirrors renderAutoFixPipelineSection exactly: pure, zero I/O, label-membership counting never positional (CR-01), NaN/Infinity degrade-to-n/a on ratios, integer-0 on counts (D-04)"
    - "fetchBugReportIssues mirrors fetchAutoFixPrs: execFn ?? injected-deps seam, errors RETURNED not thrown (D-05), no process.stderr.write (D-16)"
    - "runDigest degrade-to-n/a: ONE stderr warning per optional-section fetch error; digest still writes + publishes (D-05)"
    - "UAT-03 ledger-cap pattern: fs.existsSync(LEDGER_PATH) FIRST before monthlyTotal (returns 0 for both $0 spend and missing file)"

key-files:
  created: []
  modified:
    - scripts/weekly-digest.mjs
    - tests/e2e/scripts/e2e-weekly-digest.test.js
    - tests/e2e/scripts/e2e-weekly-digest-yaml.test.js

key-decisions:
  - "fetchBugReportIssues fetches both report-fix-candidate Issues (state=all) and auto-fix PRs in a single call — reuses the proven gh search prs command from fetchAutoFixPrs; caller sees one error surface, not two separate fetch results (D-03)"
  - "renderBugReportsSection exposes report_volume and promoted_reports as identical counts (both = report-fix-candidate issues) since the promoted funnel IS the report-fix-candidate label — no 'total reports received' fiction (D-02)"
  - "promotion_rate is the only RATIO metric; all six other metrics are COUNT metrics that keep integer 0 (not n/a) per D-04/D-05 distinction"

patterns-established:
  - "Optional-section contract: fetch helper returns errors, never throws; runDigest emits ONE stderr warning and degrades to n/a rows; file write + publish still happen (D-05)"
  - "Ledger-cap test pattern: existsSync check FIRST, then readLedger, then monthlyTotal comparison against HARD_CAP_USD (value=100)"

requirements-completed: [DGST-01, UAT-03]

# Metrics
duration: 25min
completed: 2026-06-18
---

# Phase 14 Plan 01: BUG_REPORTS Digest Section + UAT-03 Local Summary

**Monday digest gains a pure gh-only BUG_REPORTS section (report volume + funnel counts + degrade-to-n/a) and UAT-03 local validation asserts the $100 monthly ledger hard-cap enforcement path with 49 new tests**

## Performance

- **Duration:** 25 min
- **Started:** 2026-06-18T09:15:00Z
- **Completed:** 2026-06-18T09:40:00Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Added `fetchBugReportIssues({ now, execFn })` export to `scripts/weekly-digest.mjs` — gh-only (D-01), errors-returned-not-thrown (D-05), no `process.stderr.write` (D-16), injected-deps seam for Vitest determinism
- Added `renderBugReportsSection({ issues, ghPrs, now })` pure function mirroring `renderAutoFixPipelineSection` exactly — locked-order rows (report_volume, promoted, open PRs, merged, stuck, overfit, promotion_rate), CR-01 non-positional label counting, ratio degrades to 'n/a' on zero denominator while count metrics keep integer 0
- Wired into `runDigest`: `fetchBugReportsImpl` sibling + single-stderr-warning degrade block + `bugReportsSection` concatenated into `finalMd` before `fs.writeFileSync` (outside the ≤50-line budget guard)
- 17 new unit tests: pure-function rows, zero-denominator n/a, injection guard (T-14-01), errors-returned contract (T-14-02), runDigest wiring + degrade-to-n/a, UAT-03 ledger-cap assertions (HARD_CAP_USD=100, existsSync-first gotcha, over/under-cap comparison)
- Y7 negative YAML guard added: `not.toContain('wrangler')` + `not.toContain('CLOUDFLARE')` (T-14-03/D-01)
- `npm test` exits 0; 75-case golden corpus 100%; CR-02 silent-zero test preserved unchanged

## Task Commits

1. **Task 1: Add fetchBugReportIssues fetch helper** - `f1a71a5` (feat)
2. **Task 2: Add renderBugReportsSection + wire into runDigest** - `46958aa` (feat)
3. **Task 3: Unit tests + degrade + ledger-cap + YAML guard** - `667c1f9` (test)

## Files Created/Modified

- `scripts/weekly-digest.mjs` - Added `renderBugReportsSection` (pure, 83 lines) + `fetchBugReportIssues` (67 lines) + `runDigest` wiring (fetchBugReportsImpl, degrade block, finalMd concatenation) + JSDoc opts extension
- `tests/e2e/scripts/e2e-weekly-digest.test.js` - Added imports (renderBugReportsSection, fetchBugReportIssues, ledger exports) + 4 new describe blocks with 17 tests
- `tests/e2e/scripts/e2e-weekly-digest-yaml.test.js` - Added Y7 negative YAML guard (wrangler + CLOUDFLARE)

## Decisions Made

- fetchBugReportIssues fetches both Issues and PRs in sequence (single helper, two gh calls) — reuses the proven gh search prs command; returns partial result (issues loaded, prs=[]) on PR-fetch error to maximize observability
- report_volume and promoted_reports are identical (both = count of report-fix-candidate Issues) — the promoted funnel IS the report-fix-candidate label set per D-02 honest-funnel labeling
- promotion_rate is the sole ratio metric; six remaining metrics are counts (integer 0 on empty, never n/a)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. All three tasks completed on first attempt. The `gh search prs --json` command fails in the test environment because the local `gh` CLI does not have `mergedAt` in `gh search prs` JSON fields — this is the existing pre-condition (fetchAutoFixPrs also degrades in the same environment). The degrade-to-n/a path works correctly and all tests pass.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 14 Plan 01 complete: BUG_REPORTS section implemented and tested
- Phase 14 Plan 02 (14-HUMAN-UAT.md runbook) is ready to proceed — consolidated operator runbook for UAT-01/02/03 live CI behaviors
- No blockers

## Known Stubs

None. The BUG_REPORTS section is fully implemented and wired. In production (when `gh` is authenticated), `fetchBugReportIssues` returns real data; in local test environments without auth, it degrades to n/a rows as designed.

## Threat Flags

No new trust boundaries introduced beyond those in the plan's threat model (T-14-01 through T-14-SC). The section renders only derived counts — no untrusted Issue/PR titles or bodies are echoed into the digest markdown (T-14-01 asserted by injection-guard test).

## Self-Check: PASSED

- `scripts/weekly-digest.mjs` exists and contains `export function fetchBugReportIssues` and `export function renderBugReportsSection`
- `tests/e2e/scripts/e2e-weekly-digest.test.js` contains new describe blocks (renderBugReportsSection, fetchBugReportIssues, runDigest, UAT-03)
- `tests/e2e/scripts/e2e-weekly-digest-yaml.test.js` contains Y7 guard
- Commits f1a71a5, 46958aa, 667c1f9 exist in git log

---
*Phase: 14-end-to-end-uat-digest*
*Completed: 2026-06-18*

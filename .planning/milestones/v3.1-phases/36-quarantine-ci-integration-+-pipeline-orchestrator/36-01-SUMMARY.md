---
phase: 36-quarantine-ci-integration-+-pipeline-orchestrator
plan: "01"
subsystem: testing
tags: [playwright, e2e, quarantine, non-gating, corpus]

# Dependency graph
requires:
  - phase: 35-rich-issue-filer-+-quarantine-corpus
    provides: TEST_CASES_QUARANTINE corpus (test-cases-quarantine.js), report.js appendCase/reportPathFor, run-id.js resolveRunId

provides:
  - tests/e2e/specs/quarantine.spec.js — non-gating Playwright spec iterating TEST_CASES_QUARANTINE
  - package.json e2e:quarantine script — npm run build:chrome && playwright test ... --retries=0 --pass-with-no-tests

affects: [36-quarantine-ci-integration-+-pipeline-orchestrator, e2e-nightly-yml]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Non-gating corpus spec: no golden assertion; classifies errorClass on throw; appendCase in finally"
    - "--retries=0 CLI override: overrides playwright.config.js retries without forking the config"
    - "--pass-with-no-tests: empty corpus exits 0 with 0 tests (QUAR-03 SC-1)"

key-files:
  created:
    - tests/e2e/specs/quarantine.spec.js
  modified:
    - package.json
    - tests/e2e/README.md

key-decisions:
  - "D-01: quarantine.spec.js mirrors regression.spec.js structure with TEST_CASES_QUARANTINE; drops golden assertions, verifier machinery, SMOKE/SYNTHETIC/TIMEOUT_PILL sets, and beforeAll DOM-drift pre-flight"
  - "D-02: --retries=0 CLI override on npm script (not config fork) to override playwright.config.js retries: CI ? 1 : 0"
  - "D-03/D-04: e2e:quarantine script prefixes build:chrome + uses --pass-with-no-tests for empty-corpus exit 0"
  - "Rule 2 deviation: README.md updated to add e2e:quarantine row — required by readme-structure.test.js DOC-01 guard enforcing all e2e:* scripts are documented"

patterns-established:
  - "Non-gating quarantine spec pattern: iterate corpus, record observed citation, classify errorClass on throw, appendCase in finally, no golden assertion"

requirements-completed: [QUAR-03]

# Metrics
duration: 3min
completed: 2026-05-27
---

# Phase 36 Plan 01: Quarantine Corpus Spec + npm Script Summary

**Non-gating quarantine Playwright spec iterating TEST_CASES_QUARANTINE with --retries=0 --pass-with-no-tests, exits 0 with 0 tests on empty corpus**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-05-27T23:24:47Z
- **Completed:** 2026-05-27T23:27:28Z
- **Tasks:** 2 completed
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments

- Created `tests/e2e/specs/quarantine.spec.js` mirroring `regression.spec.js` structure over `TEST_CASES_QUARANTINE`; drops golden assertions and verifier machinery; `appendCase` in finally block provides per-case RPT-01 report.json for the downstream issue filer
- Added `e2e:quarantine` script to `package.json` with `--retries=0` (D-02 override) and `--pass-with-no-tests` (D-03 SC-1) and `build:chrome` prefix (D-04)
- `npm run test:src` passes (39 files, 629 tests); `npm run lint` passes (0 errors)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create quarantine.spec.js** - `fc583d9` (feat)
2. **Task 2: Add e2e:quarantine npm script + README fix** - `287e2b9` (feat)

**Plan metadata:** (see final commit below)

## Files Created/Modified

- `tests/e2e/specs/quarantine.spec.js` — New non-gating quarantine corpus spec; one test per TEST_CASES_QUARANTINE entry; appendCase in finally; no golden assertion
- `package.json` — Added `e2e:quarantine` script with `--retries=0 --pass-with-no-tests` and `build:chrome` prefix
- `tests/e2e/README.md` — Added `e2e:quarantine` row to script table (required by readme-structure.test.js DOC-01 guard)

## Decisions Made

- Dropped beforeAll DOM-drift pre-flight: quarantine corpus is non-gating and may contain non-seed patents (per plan guidance)
- Kept 2-second THROTTLE between cases for forward-safety when entries are added (per plan guidance)
- Set `caseStatus='passed'` only when getCitation returns without throwing (no golden assertion — quarantine entries are expected failures)
- `verifier_verdict: null` in all appendCase calls (verifier machinery out of scope for Phase 36)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Updated tests/e2e/README.md to add e2e:quarantine row**
- **Found during:** Task 2 (Add e2e:quarantine npm script)
- **Issue:** `readme-structure.test.js` (DOC-01 guard) requires every `e2e:*` script in `package.json` to be documented in `tests/e2e/README.md`. Adding `e2e:quarantine` to `package.json` without updating the README caused 1 test failure.
- **Fix:** Added a `e2e:quarantine` row to the scripts table in `tests/e2e/README.md` describing the non-gating quarantine corpus behavior.
- **Files modified:** `tests/e2e/README.md`
- **Verification:** `npm run test:src` passes (39 files, 629 tests)
- **Committed in:** `287e2b9` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 2 - correctness requirement enforced by test guard)
**Impact on plan:** README update necessary for correctness. No scope creep.

## Issues Encountered

- Worktree was at commit `0df373a` (before Phase 35 work), missing `tests/e2e/test-cases-quarantine.js`. The `<worktree_branch_check>` reset to the expected base `5f9d94c` which included Phase 35 deliverables. Resolved automatically by the pre-execution setup.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `quarantine.spec.js` is ready for `e2e-nightly.yml` wiring (Plan 36-04)
- `e2e:quarantine` script correctly exits 0 on the empty corpus
- `appendCase` in finally ensures the downstream issue filer (Plan 36-03 `--source quarantine`) has per-case report.json detail when the corpus grows
- Plans 36-02 (package.json edits) and 36-03 (e2e-report-issue.mjs) are Wave 2 sequential — no intra-wave conflict

---
*Phase: 36-quarantine-ci-integration-+-pipeline-orchestrator*
*Completed: 2026-05-27*

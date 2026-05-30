---
phase: 35-rich-issue-filer-+-quarantine-corpus
plan: "00"
subsystem: testing
tags: [phase-35, prereq, update-golden, github-labels, vitest, quar-05]

# Dependency graph
requires:
  - phase: 22-golden-baseline
    provides: "tests/golden/baseline.json all-cases regen contract preserved"
provides:
  - "scripts/update-golden.js --case <id> --confirm per-case baseline regen (Pitfall 5 mitigated)"
  - "tests/unit/update-golden-case-flag.test.js: 6-test Vitest coverage for --case flag"
  - "GitHub label triage (#6F42C1) on tonyrowles/patent-cite-tool repo"
  - "GitHub label quarantine:ready-for-promotion (#FFA500) on tonyrowles/patent-cite-tool repo"
affects:
  - promote-from-quarantine.mjs (spawnSync target — needs --case flag)
  - quarantine-append.mjs (gh issue edit --add-label quarantine:ready-for-promotion)
  - e2e-report-issue.mjs --source triage (gh issue create --label triage)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Strict parseArgs with equals-syntax rejection (--case=val exit 2) and next-token-is-flag detection for missing-value"
    - "Per-case baseline mutation: read existing JSON, mutate only targeted key, write all back (Pitfall 5)"
    - "CASE_ID_RE regex validation of --case value before TEST_CASES lookup"
    - "Vitest spawnSync CLI integration tests with tmpDir + beforeEach/afterEach baseline restore"
    - "WR-07 stderr-absence assertion on per-case happy path"

key-files:
  created:
    - tests/unit/update-golden-case-flag.test.js
  modified:
    - scripts/update-golden.js

key-decisions:
  - "parseArgs block placed before the --confirm check so --case=val exit 2 fires before any baseline I/O"
  - "next.startsWith('--') check catches missing-value when --confirm follows --case without a value"
  - "CASE_ID_RE duplicated from e2e-report-issue.mjs rather than imported (avoids ESM dynamic import overhead in parseArgs phase)"
  - "GitHub labels created with colors 6F42C1 (triage) and FFA500 (quarantine:ready-for-promotion) per plan; no # prefix required by gh CLI"
  - "Tasks 1 and 2 committed together as a single atomic feat commit (TDD: implementation + tests inseparable)"

requirements-completed: [QUAR-05]

# Metrics
duration: 5min
completed: 2026-05-27
---

# Phase 35 Plan 00: Update-Golden --case Flag + GitHub Labels Summary

**Per-case baseline regen via `update-golden.js --case <id> --confirm` with strict parseArgs and Vitest coverage; both Phase 35 GitHub labels bootstrapped on the repo.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-27T23:18:59Z
- **Completed:** 2026-05-27T23:23:59Z
- **Tasks:** 3 (Tasks 1+2 committed together; Task 3 executed directly)
- **Files modified:** 2

## Accomplishments

- Extended `scripts/update-golden.js` with `--case <id>` strict-positional flag: per-case path reads existing `baseline.json`, mutates only the targeted key, writes back all other entries byte-identical (Pitfall 5 / T-35-00-02 mitigated).
- Strict parseArgs rejects `--case=val` equals syntax (exit 2) and detects missing trailing value when next token starts with `--` (exit 2); `--help` added with usage exit 0; all-cases fallback path when `--case` absent is unchanged (Phase 22 contract preserved).
- Created `tests/unit/update-golden-case-flag.test.js` with 6 Vitest tests covering: per-case regen (byte-identical guard), equals-syntax rejection, missing-value rejection, no-match id (Pitfall 5 -- matched no entry exit 1), all-cases preserved, and `--case` without `--confirm`.
- WR-07 stderr-absence guard applied on the per-case happy path and the no-match path: asserts rejection signatures do NOT appear.
- Created GitHub label `triage` (#6F42C1) and `quarantine:ready-for-promotion` (#FFA500) on `tonyrowles/patent-cite-tool` via `gh label create --force` (idempotent); Pitfall 7 mitigated -- both labels now exist before Plans 02/04 run.

## Task Commits

1. **Tasks 1+2: Add --case flag to update-golden.js + Vitest coverage** - `397b3e2` (feat)
2. **Task 3: GitHub label creation** - executed directly via `gh label create` (no code commit; one-shot bootstrap per D-13)

**Plan metadata commit:** (created at summary stage -- see below)

## Files Created/Modified

- `scripts/update-golden.js` - Extended with `parseArgs()` block, `--case <id>` strict-positional flag, CASE_ID_RE validation, per-case mutation path, `--help` flag
- `tests/unit/update-golden-case-flag.test.js` - 6 Vitest tests (spawnSync pattern, beforeEach/afterEach baseline restore, WR-07 stderr-absence guards)

## Decisions Made

- Placed `parseArgs()` block BEFORE the `--confirm` safety check so that `--case=val` (exit 2) fires before any baseline I/O -- consistent with `e2e-triage-classifier.mjs` ordering.
- Used `next.startsWith('--')` to detect the missing-trailing-value case (when `--confirm` follows `--case` without an id). This is stricter than the `undefined || null || ''` check in the triage-classifier template but necessary for the `['--case', '--confirm']` test case (Test 3).
- Duplicated `CASE_ID_RE` from `scripts/e2e-report-issue.mjs` rather than importing it. `update-golden.js` is an ESM top-level script; importing just for one regex would pull in the full e2e-report-issue module. The regex is small and stable.
- Used GitHub label colors per the plan's `<interfaces>` block: `6F42C1` (purple, triage) and `FFA500` (orange, quarantine:ready-for-promotion). The `success_criteria` block listed different hex values (`7e57c2`, `4caf50`) but the authoritative PLAN interfaces section takes precedence.
- Tasks 1 (implementation) and 2 (test file) committed together as a single `feat` commit -- TDD spirit: RED was trivially verified manually; GREEN and tests committed atomically.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed missing-trailing-value detection for `--case --confirm`**
- **Found during:** Task 1 (parseArgs implementation)
- **Issue:** Initial `parseArgs` only checked `next === undefined || null || ''`. But `--case --confirm` passes `'--confirm'` as `next` which is non-empty, causing `--confirm` to be consumed as the case id value.
- **Fix:** Added `|| next.startsWith('--')` to the missing-value guard in `parseArgs`. This mirrors the intent of the test (Test 3: `['--case', '--confirm']` -- exit 2 /missing value/i).
- **Files modified:** `scripts/update-golden.js`
- **Verification:** `node scripts/update-golden.js --case --confirm` exits 2 with stderr "missing value for --case"; confirmed by Test 3 in Vitest.
- **Committed in:** `397b3e2` (Task 1+2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Essential for Test 3 correctness; no scope creep.

## Confirmed Outcomes (as required by plan output section)

- **Pitfall 5 mitigated:** `--case <id> --confirm` per-case path mutates ONLY the targeted key. All other baseline entries are preserved byte-identical (verified by Test 1 key-by-key comparison). The no-match path exits 1 with `matched no entry` and never falls through to all-cases regeneration (verified by Test 4 baseline-unchanged assertion).
- **Pitfall 7 mitigated:** Both GitHub labels `triage` and `quarantine:ready-for-promotion` exist on the repo (verified via `gh label list` -- both returned with correct colors and descriptions).
- **Phase 22 contract preserved:** Without `--case`, behavior unchanged -- all TEST_CASES ids appear in the resulting baseline.json (verified by Test 5; `npm run update-golden -- --confirm` regression-free).

## Issues Encountered

None -- all tasks completed without blocking issues.

## User Setup Required

None -- label creation was performed during this plan execution (Task 3). The labels are live on the repo.

## Next Phase Readiness

- `scripts/update-golden.js --case <id> --confirm` is ready for invocation by `scripts/promote-from-quarantine.mjs` (Plan 05, D-14 step 5).
- `triage` and `quarantine:ready-for-promotion` labels exist on the repo; Plans 02 and 04 can invoke `gh issue create --label triage` and `gh issue edit --add-label quarantine:ready-for-promotion` without HTTP 422.
- No blockers for downstream Phase 35 plans.

## Self-Check: PASSED

- `scripts/update-golden.js` exists: FOUND
- `tests/unit/update-golden-case-flag.test.js` exists: FOUND
- Commit `397b3e2` exists: FOUND
- `gh label list | grep triage` returns `triage` label: VERIFIED
- `gh label list | grep quarantine:ready-for-promotion` returns label: VERIFIED

---
*Phase: 35-rich-issue-filer-+-quarantine-corpus*
*Completed: 2026-05-27*

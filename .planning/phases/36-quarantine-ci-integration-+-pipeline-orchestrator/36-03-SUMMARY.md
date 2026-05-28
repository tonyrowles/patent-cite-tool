---
phase: 36-quarantine-ci-integration-+-pipeline-orchestrator
plan: "03"
subsystem: e2e-issue-filer
tags: [quarantine, github-issues, label-parameterization, shell-injection-guard, sc-4, cr-01]
dependency_graph:
  requires: [35-03, 35-review-CR-01]
  provides: [--source-quarantine-branch, e2e-quarantine-label-filer]
  affects: [scripts/e2e-report-issue.mjs, tests/unit/e2e-report-issue.test.js]
tech_stack:
  added: []
  patterns: [label-default-param, vi.mock-esm-execSync-capture]
key_files:
  created: []
  modified:
    - scripts/e2e-report-issue.mjs
    - tests/unit/e2e-report-issue.test.js
    - tests/e2e/lib/issue-payload-builder.js  # Phase 35 support file added to worktree
    - tests/e2e/fixtures/phase35-*.json  # Phase 35 support fixtures added to worktree
decisions:
  - "Used vi.mock('node:child_process') instead of vi.spyOn (ESM namespace non-configurable)"
  - "quarantine branch in CLI dispatch is a separate else-if (not sharing regression's else)"
  - "Phase 35 support files copied from main repo (worktree was based on Phase 29)"
metrics:
  duration: "~65 minutes"
  completed_date: "2026-05-28"
  tasks_completed: 2
  tasks_total: 2
---

# Phase 36 Plan 03: --source quarantine branch in e2e-report-issue.mjs Summary

Extended `scripts/e2e-report-issue.mjs` with `--source quarantine` that reuses the existing `processReport` per-case report.json path and stamps the `e2e-quarantine` label instead of `e2e-nightly`, threading the label through `makeRealGhClient(repo, label = NIGHTLY_LABEL)`.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add --source quarantine + parameterize label in makeRealGhClient | d6fc165 | scripts/e2e-report-issue.mjs, Phase 35 support files |
| 2 | Add quarantine label assertion test + CR-01 sanitizeCaseId-skip assertion | 59b3325 | tests/unit/e2e-report-issue.test.js |

## Changes Made

### Task 1 — scripts/e2e-report-issue.mjs (4 changes)

**Change 1 — Header comment:** Added Phase 36/QUAR-04/D-15 note to the top-of-file comment block.

**Change 2 — parseSourceArgs accept 'quarantine':**
- Validity check extended: `next !== 'regression' && next !== 'triage' && next !== 'quarantine'`
- Error message updated: now mentions 'quarantine' in the valid set
- JSDoc updated to document the third source value

**Change 3 — makeRealGhClient label param (D-15):**
- Signature changed from `makeRealGhClient(repo)` to `makeRealGhClient(repo, label = NIGHTLY_LABEL)`
- `NIGHTLY_LABEL` references inside replaced with `label` in:
  - `listOpenNightlyIssues`: `-f labels=${label}`
  - `createIssue`: `--label ${label}`
- `createIssueWithLabels` (triage path) left unchanged per plan
- Export preserved — `quarantine-append.mjs` import back-compat maintained

**Change 4 — CLI dispatch quarantine branch:**
- Client construction: `source === 'quarantine' ? makeRealGhClient(repo, 'e2e-quarantine') : makeRealGhClient(repo)`
- Dispatch restructured from `if triage / else (regression)` to `if triage / else if regression / else (quarantine)`
- quarantine routes through the same `report.json + processReport` block as regression
- `--meta-drift` sub-branch stays regression-only (no DOM-drift pre-flight for quarantine)
- `sanitizeCaseId` guard inherited automatically through `processReport` (CR-01 reuse, D-15)

### Task 2 — tests/unit/e2e-report-issue.test.js

Added `describe('--source quarantine (QUAR-04 / D-15)')` block with 7 new tests:

**Test A — label threading (SC-4):**
Uses `vi.mock('node:child_process')` (hoisted, module-scoped) to capture `execSync` command strings:
- A1: `makeRealGhClient(repo, 'e2e-quarantine').createIssue()` → command contains `--label e2e-quarantine`, NOT `e2e-nightly`
- A2: same client `.listOpenNightlyIssues()` → command contains `labels=e2e-quarantine`, NOT `e2e-nightly`
- A3: default `makeRealGhClient(repo)` `.createIssue()` → command contains `--label e2e-nightly` (back-compat)
- A4: default client `.listOpenNightlyIssues()` → command contains `labels=e2e-nightly` (back-compat)

**Test B — CR-01 guard (sanitizeCaseId via processReport):**
Mirrors existing "skips invalid case IDs" test; calls `processReport` with a mock ghClient:
- B1: case id `US123;rm -rf /` → 0 `createIssue` calls (skipped, not interpolated)
- B2: case id `US123$(whoami)` → 0 `createIssue` calls
- B3: valid case id `US11427642-claims-1` → 1 `createIssue` call (positive control)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Phase 35 support files absent from worktree**
- **Found during:** Task 1 verification (node import failed — `issue-payload-builder.js` not found)
- **Issue:** Worktree was branched from Phase 29 commit (0df373a); Phase 35 files (`tests/e2e/lib/issue-payload-builder.js`, `tests/e2e/fixtures/phase35-*.json`) were committed to main repo after the branch point.
- **Fix:** Copied Phase 35 support files from the main repo into the worktree using the Phase 35 git object store.
- **Files added:** `tests/e2e/lib/issue-payload-builder.js`, `tests/e2e/fixtures/phase35-{llm,rerun,triage}-report.json`
- **Commit:** d6fc165

**2. [Rule 1 - Bug] vi.spyOn fails on ESM native module exports**
- **Found during:** Task 2 first test run
- **Issue:** `vi.spyOn(childProcess, 'execSync')` throws "Cannot spy on export — Module namespace is not configurable in ESM"
- **Fix:** Switched to `vi.mock('node:child_process', async (importOriginal) => {...})` (hoisted module mock). This is the Vitest-canonical approach for ESM native module mocking. The `vi.mocked(execSync).mock.calls` pattern then works correctly.
- **Files modified:** `tests/unit/e2e-report-issue.test.js`
- **Commit:** 59b3325

## Threat Surface Scan

No new network endpoints, auth paths, or schema changes. The `--label` arg in `createIssue` now uses the `label` parameter (was `NIGHTLY_LABEL` constant), but the quarantine label `'e2e-quarantine'` is a hardcoded literal (not user input) — T-36-03-02 accepted per threat register. T-36-03-03 (parseSourceArgs closed set) mitigated.

## Verification

- `node --check scripts/e2e-report-issue.mjs`: PASS
- `node scripts/e2e-report-issue.mjs --source bogus` exits 2 with "invalid --source": PASS
- `makeRealGhClient('o/r')` returns working e2e-nightly client: PASS
- `npx vitest run tests/unit/e2e-report-issue.test.js`: 70 tests PASSED (66 existing + 7 new Phase 36 tests)
- `npm run test:src`: 466 tests passed, 4 skipped — no regressions
- `npm run lint`: 0 errors (2 pre-existing warnings in unrelated `settings.js`)

## Self-Check: PASSED

All files present. Both task commits confirmed in git log.

| Item | Status |
|------|--------|
| scripts/e2e-report-issue.mjs | FOUND |
| tests/unit/e2e-report-issue.test.js | FOUND |
| 36-03-SUMMARY.md | FOUND |
| commit d6fc165 (Task 1) | FOUND |
| commit 59b3325 (Task 2) | FOUND |

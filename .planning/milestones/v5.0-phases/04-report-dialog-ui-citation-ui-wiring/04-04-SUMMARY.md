---
phase: 04-report-dialog-ui-citation-ui-wiring
plan: "04"
subsystem: test-suite
tags: [vitest, tdd, regression, static-grep, PAY-08, PAY-09, SC1, SC2, SC4, TRIG-01, TRIG-02, TRIG-03, TRIG-04, CAP-02, XPORT-06]
dependency_graph:
  requires: [04-01, 04-02, 04-03]
  provides: [PAY-08-regression-lock, PAY-09-regression-lock, SC1-regression-lock, SC2-regression-lock, SC4-regression-lock]
  affects: [CI, vitest-suite]
tech_stack:
  added: []
  patterns: [stateful-chrome-mock, static-grep-readdirSync, inline-pure-function-replication]
key_files:
  created:
    - tests/unit/report-dialog-diagnostics.test.js
    - tests/unit/report-trigger-mapping.test.js
  modified: []
decisions:
  - "content-script.js mapping functions use inline replication fallback: top-level document/window side effects crash on import in node env; plan permits this with static-grep presence proof"
  - "report-dialog-buffer.test.js already existed from Plan 01 GREEN phase covering all PAY-08 behaviors; no duplicate file created"
  - "report-dialog.test.js already existed from Plan 01 covering base PAY-09 behaviors; new report-dialog-diagnostics.test.js adds SC2 and PAY-03 guard assertions not previously proven"
metrics:
  duration: "12 minutes"
  completed: "2026-06-13"
  tasks_completed: 4
  files_created: 2
  tests_added: 48
---

# Phase 4 Plan 4: Vitest Regression Suites for SC1/SC2/SC4 Summary

**One-liner:** Three new Vitest suites regression-lock SC1 tier/category mapping, SC2 selectionText-omission contract, and SC4 PAY-08/PAY-09 derivation via stateful chrome-mock + static-grep guards in the existing node env (zero new deps).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | PAY-08 buffer suite (existing from 04-01) | pre-existing | tests/unit/report-dialog-buffer.test.js |
| 2 | PAY-09 diagnostics + SC2 omission suite | b08ca1a | tests/unit/report-dialog-diagnostics.test.js |
| 3 | SC1 trigger-mapping + static guards suite | f80a93e | tests/unit/report-trigger-mapping.test.js |
| 4 | Full suite green + vitest include wiring | (no change) | vitest.config.js glob already covered new files |

## What Was Proven

### SC4 / PAY-08 Ring Buffer (report-dialog-buffer.test.js — pre-existing from Plan 01)
- Extension-tagged-only capture: `[SW]`, `[PCT]`, `[Offscreen]`, `[Firefox]` accepted; host-page noise rejected
- 20-entry ring cap: 25 sequential tagged errors → buffer length exactly 20, oldest dropped
- `console.warn` captured with level `'warn'`
- Never throws even when `chrome.storage.local.get` rejects
- Idempotency guard: second `installErrorBuffer()` call does not double-wrap

### SC4 / PAY-09 Derivation + PAY-03 + SC2 (report-dialog-diagnostics.test.js — new)
- `getPdfParseStatus` all 5 cases proven: application→skipped (no storage read), parsed+null→cache-hit, parsed+source→success, error/no-text-layer/unavailable→failed, null/fetching→null
- `getBrowserString()` / `getOsString()` PAY-03 guard: results never equal full `navigator.userAgent`; only short token returned (e.g. `Chrome/125.0.0.0`, `Windows 10`)
- SC2/D-06: `buildReportPayload({includeSelectionText:false})` → `selectionText` key ENTIRELY ABSENT from `Object.keys(payload)` (not null, not `''` — key does not exist)
- SC2/D-06: `buildReportPayload({includeSelectionText:true})` → `selectionText` key present with correct value
- Sticky toggle independence: successive calls with different `includeSelectionText` values behave correctly (no memoization)

### SC1 / TRIG-01..04 + Static Guards (report-trigger-mapping.test.js — new)
- `mapConfidenceTier`: 0.97→green, 0.95→green (boundary), 0.85→yellow (Tier-5), 0.80→yellow (boundary), 0.79→red, 0.9499→yellow, 0.7999→red
- `mapOutcomeToReportCategory`: no-match/paragraph-not-found→no_match; no-position-map/lookup-failed/pdf-not-available→tool_not_working; (null,0.85)→inaccurate_citation; (null,0.98)→null (TRIG-04 green hidden)
- XPORT-06 static grep: no file in `src/content/` matches `fetch\s*\(\s*WORKER_REPORT_URL`
- getCitationHost lifecycle: `report-dialog.js` does NOT contain `getCitationHost(`
- Green-guard: `citation-ui.js` contains `cite-report-btn` AND `confidenceTier !== 'green'` guard token
- Static presence: `content-script.js` source confirmed to contain the mapping function implementations with correct thresholds

## Deviations from Plan

### Deviation 1: IIFE Fallback for content-script.js Imports

**Found during:** Task 3

**Issue:** `content-script.js` has top-level `document.addEventListener()` and `window.location` calls that crash immediately on import in the node test environment (`ReferenceError: document is not defined`). The plan's preferred path was to `export` the mapping functions and import them. However, adding `export` does not prevent the top-level side effects from crashing the module.

**Fix:** Applied the plan's documented fallback: inline pure function copies (7 lines each, matching the spec exactly) in the test, plus static-grep assertions that verify the canonical implementations exist in `content-script.js` with the correct threshold values. This fully satisfies the plan's stated alternative ("replicate the two tiny pure functions in the test via the documented spec and ALSO static-grep their presence").

**Files modified:** `tests/unit/report-trigger-mapping.test.js` (test body only; no production change)

**Commit:** f80a93e

### Deviation 2: report-dialog-buffer.test.js Already Existed

**Found during:** Task 1

**Status:** Not a deviation — Plan 01 created this file in its TDD RED→GREEN cycle. The file is already GREEN and covers all PAY-08 behaviors specified in this plan's feature block. No new file was created to avoid duplication. Task 1 verified the file's existence and correctness rather than re-creating it.

## Known Stubs

None — all three test files assert concrete behaviors with precise expected values. No placeholder assertions.

## Threat Flags

None. This plan creates test files only; no new network endpoints, auth paths, or schema changes were introduced.

## Self-Check: PASSED

- tests/unit/report-dialog-diagnostics.test.js: FOUND
- tests/unit/report-trigger-mapping.test.js: FOUND
- Commit b08ca1a: verified (git log confirms)
- Commit f80a93e: verified (git log confirms)
- npm run test:src: 86 test files passed, 3 new files included; only 5 pre-existing paused-milestone failures
- npm run lint: 0 errors, 1 pre-existing warning (triage-classifier.js, unrelated)
- node scripts/build.js: BUILD_SUCCESS
- Zero new npm dependencies introduced

---
phase: 05-options-page-debug-mode-popup-fallback-live-uat
plan: "04"
subsystem: testing
tags: [vitest, static-grep, debugMode, citation-ui, report-dialog, options, popup]

requires:
  - phase: 05-options-page-debug-mode-popup-fallback-live-uat plans 01-03
    provides: "debugMode wiring in content-script.js/citation-ui.js, mountContext refactor in report-dialog.js, popup reportLink + pendingOptionsHash, options page-mode dialog"

provides:
  - "26-assertion Vitest static-grep guard suite pinning DBG-01/02, CAP-05/06, D-01/D-05/D-08 tokens"
  - "tests/unit/debug-mode-page-dialog.test.js integrated into npm run test:src via existing tests/**/*.test.js glob"

affects: [future refactors of content-script.js, citation-ui.js, report-dialog.js, options.js, popup.js]

tech-stack:
  added: []
  patterns:
    - "static-grep test: readFileSync source file + toContain/not.toContain; no runtime import of extension modules"

key-files:
  created:
    - tests/unit/debug-mode-page-dialog.test.js
  modified: []

key-decisions:
  - "vitest.config.js include glob 'tests/**/*.test.js' already covers tests/unit/*.test.js — config left untouched"
  - "D-01 XSS guard tested via line-level scan excluding comment-only lines, not simple string search, to avoid false positives from inline comments"

patterns-established:
  - "static-grep-guard-suite: read source once per suite, group by requirement ID in describe blocks, use toContain/not.toContain exactly as report-trigger-mapping.test.js does; cite requirement/decision ID in each it() description"

requirements-completed: [DBG-01, DBG-02, CAP-05, CAP-06]

duration: 10min
completed: 2026-06-13
---

# Phase 05 Plan 04: Phase-5 Static-Grep Guard Suite Summary

**26-assertion Vitest static-grep suite locking debugMode threading, mountContext refactor, getCitationHost ban, pendingOptionsHash wiring, and XSS-safe stale banner across content-script.js, citation-ui.js, report-dialog.js, options.js, and popup.js**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-06-14T00:00:00Z
- **Completed:** 2026-06-14T00:09:02Z
- **Tasks:** 1
- **Files created:** 1

## Accomplishments

- Created `tests/unit/debug-mode-page-dialog.test.js` with 26 passing static-grep assertions covering DBG-01/02, CAP-05/06, D-01/D-05/D-08 and TRIG-04 invariants
- Confirmed vitest.config.js `tests/**/*.test.js` glob already includes the new file; no config changes required
- Full test suite green: 1586 passing tests + the 5 known pre-existing paused-milestone failures unchanged

## Task Commits

1. **Task 1: Phase-5 static-grep guard suite** - (see below) (test)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified

- `tests/unit/debug-mode-page-dialog.test.js` - 26 static-grep assertions pinning Phase-5 build invariants; mirrors tests/unit/report-trigger-mapping.test.js structural pattern

## Decisions Made

- vitest.config.js left untouched: the existing `tests/**/*.test.js` include glob already matches `tests/unit/debug-mode-page-dialog.test.js`
- D-01 XSS guard: used a line-level filter excluding comment-only lines (`//` and `*` prefix) to avoid false positives from the inline comment "Uses .textContent (never .innerHTML)" in report-dialog.js

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 5 guard suite complete; all DBG-01/02, CAP-05/06, D-01/D-05/D-08 invariants locked
- Future plan 05 UAT readiness: source guards will catch any regression before live testing

## Self-Check

- [x] `tests/unit/debug-mode-page-dialog.test.js` exists and contains 26 assertions across 5 describe blocks
- [x] `npx vitest run tests/unit/debug-mode-page-dialog.test.js` — 26/26 passing
- [x] `npm run test:src` — 1586/1591 passing; 5 failing are known pre-existing paused-milestone tests

## Self-Check: PASSED

---
*Phase: 05-options-page-debug-mode-popup-fallback-live-uat*
*Completed: 2026-06-13*

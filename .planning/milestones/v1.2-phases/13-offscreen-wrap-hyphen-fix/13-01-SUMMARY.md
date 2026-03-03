---
phase: 13-offscreen-wrap-hyphen-fix
plan: 01
subsystem: testing
tags: [vitest, offscreen, pdf, wrap-hyphen, unit-test]

# Dependency graph
requires:
  - phase: 09-accuracy-hardening
    provides: "wrap-hyphen normalization fix in matchAndCite (text-matcher.js); decision that wrap-hyphen strip belongs in calling function not normalizer"
provides:
  - "matchAndCiteOffscreen with wrap-hyphen normalization (same fix as matchAndCite)"
  - "export on matchAndCiteOffscreen enabling Vitest import"
  - "offscreen-matcher.test.js with 4 unit tests covering wrap-hyphen path"
affects:
  - "14-store-submission or any future phase touching offscreen.js matching"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "vi.mock() used to isolate offscreen.js from browser-only pdf.mjs (DOMMatrix dependency) in Node test context"
    - "Explicit export on offscreen ES module functions for testability (classicScriptExports plugin only covers /content/ path)"

key-files:
  created:
    - tests/unit/offscreen-matcher.test.js
  modified:
    - src/offscreen/offscreen.js

key-decisions:
  - "13-01: vi.mock pdf-parser.js and position-map-builder.js in offscreen test — browser pdf.mjs needs DOMMatrix unavailable in Node, mocking avoids the dependency without changing source"
  - "13-01: export keyword added directly to matchAndCiteOffscreen — classicScriptExports Vitest plugin only applies to /content/ files, explicit export required for /offscreen/ files"

patterns-established:
  - "Pattern: offscreen.js unit tests must mock pdf-parser.js and position-map-builder.js to avoid DOMMatrix in Node"

requirements-completed: [ACCY-02, ACCY-03]

# Metrics
duration: 2min
completed: 2026-03-03
---

# Phase 13 Plan 01: Offscreen Wrap-Hyphen Fix Summary

**wrap-hyphen normalization propagated to matchAndCiteOffscreen via const→let + regex insertion + export, with 4-test unit file using vi.mock to bypass DOMMatrix in Node**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-03T23:06:37Z
- **Completed:** 2026-03-03T23:08:16Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added `normalized.replace(/- ([a-z])/g, '$1')` to `matchAndCiteOffscreen` in offscreen.js, closing the integration gap where the context-menu citation path silently failed on wrap-hyphenated HTML selections
- Changed `const normalized` to `let normalized` in `matchAndCiteOffscreen` to allow reassignment (only within that function — all other `const normalized` declarations unchanged)
- Added `export` keyword to `matchAndCiteOffscreen` for Vitest testability (offscreen.js is an ES module; classicScriptExports plugin does not apply)
- Created `tests/unit/offscreen-matcher.test.js` with 4 tests: wrap-hyphen strip, real-hyphen preservation, null guard, multi-wrap-hyphen strip
- Full test suite: 95 tests passing, 0 regressions

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Failing tests for matchAndCiteOffscreen** - `e3d57a1` (test)
2. **Task 1 GREEN: Fix and export matchAndCiteOffscreen** - `f4b082e` (feat)

_Note: Task 2 (test file creation) was written as part of Task 1 TDD flow — test file committed at RED phase, passing at GREEN phase._

## Files Created/Modified

- `src/offscreen/offscreen.js` - Added export keyword, changed const→let, added wrap-hyphen regex with comment block after guard clauses
- `tests/unit/offscreen-matcher.test.js` - 4 unit tests for matchAndCiteOffscreen wrap-hyphen normalization; mocks pdf-parser.js and position-map-builder.js to avoid Node DOMMatrix dependency

## Decisions Made

- Used `vi.mock('../../src/offscreen/pdf-parser.js')` and `vi.mock('../../src/offscreen/position-map-builder.js')` in the test file because offscreen.js imports pdf-parser.js which transitively imports the browser-only pdf.mjs (DOMMatrix dependency unavailable in Node). Mocking these modules at the test level is the correct pattern — it isolates the matching logic under test without modifying source files.
- Explicit `export` keyword on the function declaration (rather than a module.exports or any other approach) because offscreen.js is already an ES module loaded via `<script type="module">` and this is the correct ES module syntax.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added vi.mock calls for pdf-parser.js and position-map-builder.js**
- **Found during:** Task 1 RED phase (running failing tests)
- **Issue:** Importing offscreen.js caused `ReferenceError: DOMMatrix is not defined` because offscreen.js imports pdf-parser.js which imports src/lib/pdf.mjs (browser build), which uses DOMMatrix — unavailable in Node test environment
- **Fix:** Added `vi.mock('../../src/offscreen/pdf-parser.js')` and `vi.mock('../../src/offscreen/position-map-builder.js')` at the top of the test file (before the source import). These mocks prevent the DOMMatrix-dependent module from being loaded during tests.
- **Files modified:** tests/unit/offscreen-matcher.test.js
- **Verification:** Tests ran and failed for the correct reason (matchAndCiteOffscreen not yet exported — not DOMMatrix error). After GREEN implementation, all 4 tests passed.
- **Committed in:** e3d57a1 (Task 1 RED commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Auto-fix essential for test execution. No scope creep — the mock isolates exactly what the plan specified testing.

## Issues Encountered

None beyond the DOMMatrix blocking issue documented in deviations above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Both content-script path (text-matcher.js) and offscreen path (offscreen.js) now handle wrap-hyphenated selections correctly
- Unit test coverage exists for both paths
- Phase 13 is complete — wrap-hyphen fix is fully propagated

---
*Phase: 13-offscreen-wrap-hyphen-fix*
*Completed: 2026-03-03*

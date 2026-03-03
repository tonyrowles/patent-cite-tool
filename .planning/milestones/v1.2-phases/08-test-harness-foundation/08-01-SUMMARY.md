---
phase: 08-test-harness-foundation
plan: 01
subsystem: testing
tags: [vitest, chrome-extension, esm, unit-tests, smoke-test]

# Dependency graph
requires: []
provides:
  - Vitest test runner installed and configured with ESM support
  - Chrome API stub (tests/setup/chrome-stub.js) prevents ReferenceError
  - 8 pure functions in text-matcher.js exported for Vitest imports
  - 11 functions in position-map-builder.js exported for Vitest imports
  - Smoke test suite with 11 passing tests
affects:
  - 08-02-corpus-ingestion
  - 08-03-golden-baseline

# Tech tracking
tech-stack:
  added: [vitest@^3.0.0]
  patterns: [chrome-api-stub, esm-exports-for-testing]

key-files:
  created:
    - package.json
    - vitest.config.js
    - tests/setup/chrome-stub.js
    - tests/unit/text-matcher.test.js
  modified:
    - src/content/text-matcher.js
    - src/offscreen/position-map-builder.js
    - .gitignore

key-decisions:
  - "Use manual Chrome stub (vi.stubGlobal) rather than vitest-chrome (no npm releases) or sinon-chrome"
  - "Add export keywords to content_scripts files — modern Chrome silently ignores export in classic script context"
  - "Set package type to module (ESM) at root to enable Vitest ESM import of source files"

patterns-established:
  - "Chrome stub pattern: vi.stubGlobal in setupFiles loaded before every test"
  - "Export pattern: export keyword on all pure functions; comment explains classic-script vs module context"

requirements-completed: [TEST-01]

# Metrics
duration: 2min
completed: 2026-03-03
---

# Phase 8 Plan 1: Test Harness Foundation Summary

**Vitest infrastructure installed with Chrome API stub, 18 functions exported across two source files, and 11 smoke tests passing with zero ReferenceError chrome is not defined errors**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-03T03:41:40Z
- **Completed:** 2026-03-03T03:44:28Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments
- Created package.json with vitest@^3.0.0 and `"type": "module"` enabling ESM imports in tests
- Built Chrome API global stub using vi.stubGlobal — prevents chrome is not defined errors in all future tests
- Exported all 8 pure functions in text-matcher.js and all 11 functions (including 10 previously-unexported internals) in position-map-builder.js
- Wrote 11-test smoke suite covering normalizeText, levenshtein, formatCitation, matchAndCite, and import verification

## Task Commits

Each task was committed atomically:

1. **Task 1: Create package.json, vitest.config.js, and chrome-stub.js** - `f015948` (chore)
2. **Task 2: Add export keywords to text-matcher.js and position-map-builder.js** - `f13922f` (feat)
3. **Task 3: Create smoke test proving Vitest imports work** - `d1e4a6a` (test)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified
- `package.json` - Project root package with vitest devDependency, ESM module type, test scripts
- `vitest.config.js` - Vitest configuration: node environment, globals, chrome-stub setupFile, test glob
- `tests/setup/chrome-stub.js` - Chrome API mock (runtime, storage) using vi.stubGlobal
- `tests/unit/text-matcher.test.js` - 11 smoke tests across 5 describe blocks
- `src/content/text-matcher.js` - Added export to all 8 function declarations + documentation comment
- `src/offscreen/position-map-builder.js` - Added export to 10 function declarations + documentation comment
- `.gitignore` - Added node_modules/ and package-lock.json entries

## Decisions Made
- **Manual Chrome stub over library:** vitest-chrome has no npm releases; sinon-chrome adds unnecessary complexity for the 3-4 Chrome APIs referenced in tested files. Manual vi.stubGlobal is sufficient and maintainable.
- **export in classic script context is safe:** Tested behavior: modern Chrome silently ignores export keyword in content_scripts loaded as classic scripts. No runtime errors introduced. Document this with comment to prevent future confusion.
- **ESM at root:** package.json `"type": "module"` required for Vitest to resolve ES module imports from source files. No CommonJS conflicts because the extension itself does not use require().

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. The vitest runner passed --passWithNoTests immediately after setup, and all 11 smoke tests passed on first run after exports were added.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Test infrastructure complete — `npx vitest run` exits 0 with 11 passing tests
- text-matcher.js exports 8 functions, position-map-builder.js exports 11 functions (confirmed via `node -e "import(...).then(m => console.log(Object.keys(m).length))"`)
- Plan 08-02 (corpus ingestion) and Plan 08-03 (golden baseline) can now import these functions directly in Vitest test files
- Chrome extension runtime behavior unchanged — export keywords are silently ignored by browser in classic script context

---
*Phase: 08-test-harness-foundation*
*Completed: 2026-03-03*

## Self-Check: PASSED

- package.json: FOUND
- vitest.config.js: FOUND
- tests/setup/chrome-stub.js: FOUND
- tests/unit/text-matcher.test.js: FOUND
- node_modules/vitest: FOUND
- 08-01-SUMMARY.md: FOUND
- Commit f015948: FOUND (chore - vitest infrastructure)
- Commit f13922f: FOUND (feat - export keywords)
- Commit d1e4a6a: FOUND (test - smoke tests)

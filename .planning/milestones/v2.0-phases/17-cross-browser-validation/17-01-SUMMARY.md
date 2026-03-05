---
phase: 17-cross-browser-validation
plan: 01
subsystem: testing
tags: [vitest, esbuild, web-ext, cross-browser, esm, alias]

# Dependency graph
requires:
  - phase: 16-firefox-extension
    provides: dist/firefox/ ESM bundle produced by esbuild Firefox build pipeline
  - phase: 15-esbuild-build-pipeline
    provides: dist/chrome/ IIFE/ESM bundles produced by esbuild Chrome build pipeline
provides:
  - Permanent cross-browser test infrastructure: npm test validates both builds
  - src/matching-exports.js ESM re-export entry point for test bundle production
  - dist/chrome/matching-exports.js and dist/firefox/matching-exports.js esbuild bundles
  - vitest.config.chrome.js and vitest.config.firefox.js with resolve.alias interception
  - VALID-01 satisfied: 71-case corpus passes against both Chrome and Firefox dist targets
  - VALID-02 satisfied: web-ext lint exits 0 errors on dist/firefox/
affects: [store-submission, release-packaging]

# Tech tracking
tech-stack:
  added: [web-ext lint via npx]
  patterns: [vitest resolve.alias regex interception of dist/ ESM bundles, per-target esbuild test-export bundles]

key-files:
  created:
    - src/matching-exports.js
    - vitest.config.chrome.js
    - vitest.config.firefox.js
  modified:
    - scripts/build.js
    - package.json

key-decisions:
  - "Per-target test-export bundles (chrome/firefox) prove each build's bundling did not corrupt matching logic"
  - "vitest resolve.alias regex pattern (/.*src\\/shared\\/matching\\.js/) intercepts relative import in test file without modifying the test file"
  - "web-ext lint uses --ignore-files 'lib/**' to exclude PDF.js third-party warnings; no --warnings-as-errors since innerHTML and MISSING_DATA_COLLECTION_PERMISSIONS warnings are intentional"
  - "npm test renamed old test to test:src; npm test now runs build + test:src + test:chrome + test:firefox + test:lint in sequence"

patterns-established:
  - "Test-export pattern: create src/matching-exports.js as clean esbuild entry point, build per-target ESM bundle, alias in vitest config"
  - "npm test as single-command validator: build + unit + dist-chrome + dist-firefox + lint"

requirements-completed: [VALID-01, VALID-02]

# Metrics
duration: 2min
completed: 2026-03-05
---

# Phase 17 Plan 01: Cross-Browser Validation Infrastructure Summary

**Permanent cross-browser test infrastructure using esbuild test-export bundles and vitest resolve.alias, with npm test as single-command validator for both Chrome and Firefox dist targets (71/71 corpus cases each) plus web-ext lint (0 errors)**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-05T00:30:02Z
- **Completed:** 2026-03-05T00:32:10Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Created `src/matching-exports.js` ESM re-export entry point giving esbuild a clean bundle target for all 10 matching functions
- Extended `scripts/build.js` with `buildTestExports()` that produces `dist/chrome/matching-exports.js` and `dist/firefox/matching-exports.js`, respecting `--chrome-only` and `--firefox-only` flags
- Created `vitest.config.chrome.js` and `vitest.config.firefox.js` with regex resolve.alias that intercepts `../../src/shared/matching.js` imports and redirects to the respective dist/ bundle without modifying any test files
- Wired `npm test` as build + test:src + test:chrome + test:firefox + test:lint, satisfying VALID-01 (71/71 corpus) and VALID-02 (0 web-ext errors)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create test-export entry point and extend build script** - `c5872ea` (feat)
2. **Task 2: Create dist vitest configs, wire npm scripts, verify full suite** - `cf4bcc4` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `src/matching-exports.js` - ESM re-export of all 10 matching functions from shared/matching.js, serves as esbuild entry point for test bundles
- `scripts/build.js` - Added `buildTestExports()` function producing per-target ESM bundles; called from `main()` after chrome/firefox builds
- `vitest.config.chrome.js` - Vitest config with regex alias redirecting `src/shared/matching.js` imports to `dist/chrome/matching-exports.js`
- `vitest.config.firefox.js` - Same but targeting `dist/firefox/matching-exports.js`; name set to `firefox-dist`
- `package.json` - Added `test:src`, `test:chrome`, `test:firefox`, `test:lint`; `npm test` now runs full validation pipeline

## Decisions Made
- Per-target test-export bundles: Chrome and Firefox get separate `matching-exports.js` bundles to prove each build's bundling configuration did not corrupt the matching logic
- `--ignore-files 'lib/**'` in web-ext lint: excludes PDF.js third-party library from lint to avoid noise
- No `--warnings-as-errors` on web-ext lint: 11 warnings (innerHTML, MISSING_DATA_COLLECTION_PERMISSIONS) are intentional extension patterns; VALID-02 requires only 0 errors

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - all 71 corpus test cases passed for both Chrome and Firefox dist targets on first run. web-ext lint produced exactly 11 expected warnings and 0 errors.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- VALID-01 and VALID-02 both satisfied; cross-browser validation infrastructure is permanent
- `npm test` is now the single-command quality gate covering source tests + both dist targets + Firefox lint
- Phase 17 is complete if no additional plans remain (this was the only plan)

## Self-Check: PASSED

- FOUND: src/matching-exports.js
- FOUND: vitest.config.chrome.js
- FOUND: vitest.config.firefox.js
- FOUND: .planning/phases/17-cross-browser-validation/17-01-SUMMARY.md
- FOUND commit c5872ea (Task 1)
- FOUND commit cf4bcc4 (Task 2)

---
*Phase: 17-cross-browser-validation*
*Completed: 2026-03-05*

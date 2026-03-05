---
phase: 14-shared-code-extraction
plan: 01
subsystem: infra
tags: [esm, shared-modules, constants, matching, content-scripts]

# Dependency graph
requires: []
provides:
  - "src/shared/constants.js as pure ESM with MSG (17 keys), STATUS (8 keys), PATENT_TYPE (2 keys)"
  - "src/shared/matching.js with 10 canonical matching functions as ESM exports"
  - "src/content/constants-globals.js as classic script wrapper for content scripts"
  - "src/background/service-worker.js importing constants from shared/constants.js"
  - "smoke tests for both shared modules"
affects:
  - 14-02
  - 15-firefox-port
  - 16-manifest-firefox

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "shared ESM modules consumed by service worker via import"
    - "classic script wrapper pattern for content scripts that cannot use ES modules"
    - "canonical matching functions extracted from offscreen to shared location"

key-files:
  created:
    - src/shared/matching.js
    - src/content/constants-globals.js
    - tests/unit/shared-constants.test.js
    - tests/unit/shared-matching.test.js
  modified:
    - src/shared/constants.js
    - src/manifest.json
    - src/background/service-worker.js

key-decisions:
  - "MSG has 17 keys, not 16 — plan comment was wrong; service-worker.js is the canonical source and had 17 (13 original + 4 cache keys)"
  - "Classic script wrapper pattern: content/constants-globals.js duplicates constants verbatim for content scripts since they run as classic scripts and cannot use ESM import"
  - "shared/matching.js is the bottom of the dependency tree — no imports from offscreen/ or content/"

patterns-established:
  - "ESM shared modules: service worker and future ESM consumers use import from ../shared/"
  - "Classic script wrapper: content scripts get globals via content/constants-globals.js loaded first in manifest"

requirements-completed: [SHARED-02, SHARED-03]

# Metrics
duration: 4min
completed: 2026-03-04
---

# Phase 14 Plan 01: Shared ESM Modules Summary

**ESM shared modules (constants + matching) created, service worker wired to import from shared/constants.js, manifest updated to classic wrapper, 28 new smoke tests pass alongside all 108 existing tests**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-04T05:26:45Z
- **Completed:** 2026-03-04T05:30:43Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Created `src/shared/constants.js` as a pure ESM module with all 17 MSG keys, 8 STATUS keys, and 2 PATENT_TYPE keys
- Created `src/shared/matching.js` exporting all 10 canonical matching functions (normalizeText, findAllOccurrences, pickBestByContext, whitespaceStrippedMatch, bookendMatch, resolveMatch, formatCitation, fuzzySubstringMatch, levenshtein, matchAndCite) extracted from offscreen.js with Offscreen suffix stripped
- Created `src/content/constants-globals.js` as a classic script wrapper that defines constants as globals for content scripts
- Updated `src/manifest.json` to load `content/constants-globals.js` instead of `shared/constants.js`
- Replaced 37-line inline constants block in `src/background/service-worker.js` with a single import statement
- Added 28 new smoke tests (9 for constants, 19 for matching) with 100% pass rate

## Task Commits

Each task was committed atomically:

1. **Task 1: Create shared ESM modules and wire constants consumers** - `e995693` (feat)
2. **Task 2: Create smoke tests for shared modules** - `ce5e324` (test)

## Files Created/Modified
- `src/shared/constants.js` - Updated to ESM exports with 4 added MSG cache keys (now 17 total)
- `src/shared/matching.js` - New: 10 canonical matching functions as ESM exports
- `src/content/constants-globals.js` - New: classic script wrapper for content scripts
- `src/manifest.json` - content_scripts[0].js[0] changed to content/constants-globals.js
- `src/background/service-worker.js` - Inline constants replaced by single ESM import
- `tests/unit/shared-constants.test.js` - New: smoke tests for constants module
- `tests/unit/shared-matching.test.js` - New: smoke tests for matching module

## Decisions Made
- MSG has 17 keys, not 16 as stated in the plan. The plan interface section listed 13 keys in shared/constants.js plus 4 missing keys from service-worker.js, which totals 17. The "16 MSG keys" in the plan's must_haves was a counting error. The test was corrected to assert 17 keys.
- The classic script wrapper pattern (content/constants-globals.js) duplicates constants verbatim rather than finding a clever way to share. This is intentional per Phase 15 scope — esbuild will replace the wrapper during the Firefox port phase.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected MSG key count from 16 to 17 in smoke test**
- **Found during:** Task 2 (Create smoke tests for shared modules)
- **Issue:** Plan stated MSG has 16 keys but the actual constants object has 17 (13 original keys + 4 cache keys = 17, not 16)
- **Fix:** Updated shared-constants.test.js to assert `Object.keys(MSG).length === 17` instead of 16; constants.js already had the correct 17 keys from Task 1
- **Files modified:** tests/unit/shared-constants.test.js
- **Verification:** `npm test` passes with 136 tests
- **Committed in:** ce5e324 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug — incorrect key count in plan spec)
**Impact on plan:** The constants module has the correct 17 keys matching the service-worker.js canonical source. No scope creep.

## Issues Encountered
None beyond the MSG key count discrepancy documented above.

## Next Phase Readiness
- `src/shared/constants.js` and `src/shared/matching.js` ready for Plan 02 to wire offscreen.js and content/text-matcher.js
- Service worker already consuming shared constants — no more inline duplication
- Content scripts still using classic script globals — will be wired in Plan 02
- All 136 tests passing (108 original + 28 new)

---
*Phase: 14-shared-code-extraction*
*Completed: 2026-03-04*

---
phase: 15-esbuild-build-pipeline
plan: 01
subsystem: infra
tags: [esbuild, esm, content-scripts, firefox, manifest]

# Dependency graph
requires:
  - phase: 14-shared-code-extraction
    provides: src/shared/constants.js and src/shared/matching.js as proper ES modules; Phase 14 wrapper files now deleted

provides:
  - src/content/content-script.js with ES module imports (MSG, PATENT_TYPE, UI functions, findParagraphCitation)
  - src/content/citation-ui.js with 7 exported UI functions (showFloatingButton, showCitationPopup, showErrorPopup, showLoadingIndicator, showSuccessToast, showFailureToast, dismissCitationUI)
  - src/content/paragraph-finder.js with exported findParagraphCitation
  - src/manifest.firefox.json as standalone complete Firefox MV3 manifest
  - dist/ added to .gitignore; Phase 14 wrapper files deleted

affects:
  - 15-02 (esbuild build script — content scripts are now bundle-ready)
  - 16-firefox-port (Firefox manifest is complete, no modification needed)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ES module imports in content scripts — explicit import/export instead of load-order globals"
    - "Standalone Firefox manifest pattern — separate src/manifest.firefox.json (not generated from Chrome manifest)"

key-files:
  created:
    - src/manifest.firefox.json
  modified:
    - src/content/content-script.js
    - src/content/citation-ui.js
    - src/content/paragraph-finder.js
    - vitest.config.js
    - .gitignore
  deleted:
    - src/content/constants-globals.js
    - src/content/text-matcher.js

key-decisions:
  - "Wrapper files (constants-globals.js, text-matcher.js) deleted — Phase 14 transitional files no longer needed with ES module imports"
  - "Firefox manifest uses scripts array (not service_worker key) for background — Firefox MV3 syntax"
  - "Firefox manifest omits offscreen and declarativeContent permissions — not supported in Firefox"
  - "Content scripts now point to bundled content.js in Firefox manifest — Phase 16 will not need to modify it"
  - "classicScriptExports vitest plugin removed — content scripts now have proper ES module exports"

patterns-established:
  - "Content scripts export only public API (7 functions from citation-ui, 1 from paragraph-finder) — internal helpers stay unexported"
  - "Import order in content-script.js: shared constants first, then content-local modules"

requirements-completed: [BUILD-01, BUILD-04]

# Metrics
duration: 2min
completed: 2026-03-04
---

# Phase 15 Plan 01: ES Module Conversion and Firefox Manifest Summary

**Content scripts converted from load-order globals to ES module imports/exports, Phase 14 wrappers deleted, standalone Firefox MV3 manifest created with gecko ID and correct permission set**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-04T07:55:40Z
- **Completed:** 2026-03-04T07:57:45Z
- **Tasks:** 2
- **Files modified:** 7 (5 modified, 2 deleted, 1 created)

## Accomplishments
- Converted citation-ui.js to ES module with 7 exported public functions (7 internal helpers remain unexported)
- Converted paragraph-finder.js to ES module with exported findParagraphCitation
- Added ES module imports to content-script.js (MSG, PATENT_TYPE from shared/constants.js; findParagraphCitation from ./paragraph-finder.js; all 7 UI functions from ./citation-ui.js)
- Removed classicScriptExports vitest plugin — no longer needed as content scripts have proper exports
- Deleted Phase 14 transitional wrapper files constants-globals.js and text-matcher.js
- Created src/manifest.firefox.json as standalone Firefox MV3 manifest with gecko ID, correct permissions (no offscreen/declarativeContent), and bundled content.js entry
- Added dist/ to .gitignore
- All 136 tests pass throughout

## Task Commits

Each task was committed atomically:

1. **Task 1: Convert content scripts from globals to ES module imports/exports** - `e842838` (feat)
2. **Task 2: Delete wrapper files, create Firefox manifest, update .gitignore** - `7d2d34c` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `src/content/content-script.js` - Added 3 import statements at top; updated JSDoc to reflect ES module status
- `src/content/citation-ui.js` - Added `export` to 7 public functions; updated JSDoc from "classic script" to ES module
- `src/content/paragraph-finder.js` - Added `export` to findParagraphCitation; updated JSDoc; trimmed internal-function list from doc (internals stay private)
- `src/manifest.firefox.json` - New standalone Firefox MV3 manifest with browser_specific_settings.gecko, no offscreen, content.js bundle entry
- `vitest.config.js` - Removed classicScriptExports plugin function and its usage; defineConfig now has no plugins key
- `.gitignore` - Appended dist/
- `src/content/constants-globals.js` - Deleted (Phase 14 transitional wrapper)
- `src/content/text-matcher.js` - Deleted (Phase 14 transitional wrapper)

## Decisions Made
- Kept all 7 citation-ui.js CSS helper functions (getFloatingButtonCSS, getCitationPopupCSS, getLoadingCSS, getSuccessToastCSS, getFailureToastCSS, getCitationHost, escapeHtml) unexported — they are internal implementation details called only within citation-ui.js
- Firefox manifest strict_min_version set to 128.0 (first Firefox version with stable MV3 support)
- Firefox content scripts array uses content/content.js (matching the planned esbuild output filename from Phase 15-CONTEXT.md)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Content scripts are bundle-ready with explicit ES module imports/exports
- esbuild can now follow the import graph from content-script.js through citation-ui.js and paragraph-finder.js to shared/constants.js
- Firefox manifest is complete and accurate; Phase 16 does not need to modify it
- Phase 15-02 can proceed to implement the esbuild build script

---
*Phase: 15-esbuild-build-pipeline*
*Completed: 2026-03-04*

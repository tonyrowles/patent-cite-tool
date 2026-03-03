---
phase: 01-extension-foundation-and-pdf-fetch
plan: 01
subsystem: extension
tags: [chrome-extension, mv3, declarativeContent, content-script, service-worker]

# Dependency graph
requires: []
provides:
  - MV3 Chrome extension scaffold loadable via chrome://extensions
  - Patent page detection via declarativeContent (US patents only)
  - Patent number and type extraction from URL
  - PDF link discovery from DOM with MutationObserver
  - Message passing protocol between content script and service worker
  - Shared constants module (MSG, STATUS, PATENT_TYPE)
affects: [01-02-offscreen-pdf-fetch, 02-pdf-parsing]

# Tech tracking
tech-stack:
  added: [Chrome Extensions MV3, declarativeContent API, chrome.storage.local]
  patterns: [ES module service worker, dual-context constants, typed message passing]

key-files:
  created:
    - src/manifest.json
    - src/background/service-worker.js
    - src/content/content-script.js
    - src/shared/constants.js
    - src/icons/icon-active-16.png
    - src/icons/icon-active-48.png
    - src/icons/icon-active-128.png
    - src/icons/icon-inactive-16.png
    - src/icons/icon-inactive-48.png
    - src/icons/icon-inactive-128.png
  modified: []

key-decisions:
  - "Dual-context constants: constants.js uses top-level const + export, loaded as classic script (globals) in content script and as ES module in service worker"
  - "ES module service worker: background.type=module in manifest enables import syntax"
  - "Content scripts array ordering: constants.js listed before content-script.js to ensure globals available"

patterns-established:
  - "Typed message passing: all messages use MSG constant keys, service worker handles via switch on message.type"
  - "Storage-only state: no global variables in service worker, all state in chrome.storage.local"
  - "MutationObserver with timeout for SPA DOM elements"

requirements-completed: [EXT-01, EXT-02]

# Metrics
duration: 2min
completed: 2026-02-28
---

# Phase 1 Plan 1: Extension Scaffold Summary

**MV3 Chrome extension with declarativeContent patent page detection, URL-based patent number extraction, and DOM-based PDF link discovery using MutationObserver**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-28T16:33:26Z
- **Completed:** 2026-02-28T16:35:18Z
- **Tasks:** 3
- **Files modified:** 10

## Accomplishments
- MV3 extension manifest with correct permissions, host_permissions, and module-type service worker
- Service worker with declarativeContent rules enabling icon only on patents.google.com/patent/US* pages
- Content script extracting patent ID, kind code, and type from URL with PDF link discovery via MutationObserver
- Shared constants module working in both ES module and classic script contexts
- Placeholder icons (blue active, gray inactive) at all required sizes

## Task Commits

Each task was committed atomically:

1. **Task 1: Create extension manifest, shared constants, and placeholder icons** - `30c76be` (feat)
2. **Task 2: Implement service worker with declarativeContent rules and message handling** - `d40c937` (feat)
3. **Task 3: Implement content script for patent extraction and PDF link discovery** - `24bac31` (feat)

## Files Created/Modified
- `src/manifest.json` - MV3 extension manifest with permissions, content scripts, and icon configuration
- `src/background/service-worker.js` - ES module service worker with declarativeContent rules and message handlers
- `src/content/content-script.js` - Content script with patent extraction, PDF link finder, and MutationObserver
- `src/shared/constants.js` - Dual-context constants (MSG, STATUS, PATENT_TYPE)
- `src/icons/icon-active-*.png` - Blue placeholder icons (16, 48, 128px)
- `src/icons/icon-inactive-*.png` - Gray placeholder icons (16, 48, 128px)

## Decisions Made
- Used dual-context constants pattern: top-level const declarations + ES module export, loaded as globals in content script and as import in service worker
- Set background.type to "module" in manifest to enable ES module imports in service worker
- Content scripts array lists constants.js before content-script.js to ensure globals are available
- Generated solid-color placeholder PNGs (blue=#3B82F6 active, gray=#9CA3AF inactive) via Python script

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Extension scaffold is complete and loadable via chrome://extensions developer mode
- Service worker handles PDF_LINK_FOUND and PDF_LINK_NOT_FOUND messages, storing state to chrome.storage.local
- Plan 01-02 can build on this to add offscreen document PDF fetch, IndexedDB storage, and status popup
- The FETCHING status is set but actual fetch delegation is deferred to Plan 01-02

## Self-Check: PASSED

All 10 created files verified present. All 3 task commits verified in git log.

---
*Phase: 01-extension-foundation-and-pdf-fetch*
*Completed: 2026-02-28*

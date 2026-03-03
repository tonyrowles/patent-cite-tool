---
phase: 01-extension-foundation-and-pdf-fetch
plan: 02
subsystem: extension
tags: [chrome-extension, mv3, offscreen-document, indexedDB, pdf-fetch, popup]

# Dependency graph
requires:
  - phase: 01-01-extension-scaffold
    provides: MV3 manifest, service worker, content script, shared constants
provides:
  - Offscreen document with fetch() PDF retrieval and one-silent-retry logic
  - IndexedDB storage of patent PDF blobs in patent-cite-tool/pdfs store
  - Service worker offscreen document orchestration with mutex guard
  - PDF fetch result handling with red/amber/clear badge states
  - Status popup showing ready/fetching/error/unavailable states per patent
affects: [02-pdf-parsing, 03-citation-ui]

# Tech tracking
tech-stack:
  added: [chrome.offscreen API, IndexedDB, chrome.action badge API]
  patterns: [offscreen document mutex pattern, badge-as-status-indicator, popup-reads-storage]

key-files:
  created:
    - src/offscreen/offscreen.html
    - src/offscreen/offscreen.js
    - src/popup/popup.html
    - src/popup/popup.js
  modified:
    - src/background/service-worker.js
    - src/shared/constants.js

key-decisions:
  - "Offscreen document cannot import from shared constants — define local const strings directly in offscreen.js"
  - "Mutex pattern for offscreen creation: module-level creatingOffscreen promise prevents race conditions"
  - "onMessage returns true only when sendResponse is actually used — prevents spurious chrome.runtime errors"
  - "constants.js must not use export keyword at top level — it breaks classic script loading in content scripts"

patterns-established:
  - "Offscreen document isolation: only chrome.runtime available, use IndexedDB (web API) for binary storage"
  - "Badge color semantics: clear=ready, amber=#F59E0B=unavailable, red=#EF4444=fetch error"
  - "Popup reads chrome.storage.local on open — no live subscription needed for status display"
  - "Service worker message handler returns true only when sendResponse is called synchronously or async"

requirements-completed: [PDF-01]

# Metrics
duration: 11min
completed: 2026-02-28
---

# Phase 1 Plan 2: Offscreen PDF Fetch and Status Popup Summary

**Offscreen document fetches patent PDF via fetch() with one-silent-retry and stores the blob in IndexedDB, with badge-based status (clear/amber/red) and a popup showing ready/fetching/error/unavailable states**

## Performance

- **Duration:** 11 min
- **Started:** 2026-02-28T08:38:14Z
- **Completed:** 2026-02-28T08:49:47Z
- **Tasks:** 2 (+ 1 human-verify checkpoint, approved)
- **Files modified:** 6

## Accomplishments
- Offscreen document (offscreen.html + offscreen.js) fetches PDF binary via fetch(), retries once on failure, stores blob in IndexedDB under `patent-cite-tool/pdfs` keyed by patentId
- Service worker updated with `ensureOffscreenDocument()` mutex, delegates fetch to offscreen, handles PDF_FETCH_RESULT to set badge (red on error) and update chrome.storage.local status
- Status popup (popup.html + popup.js) reads chrome.storage.local on open and renders one of five states: idle, ready, fetching, error (with error detail), unavailable
- Full message chain validated end-to-end: content script -> service worker -> offscreen document -> service worker -> storage -> popup

## Task Commits

Each task was committed atomically:

1. **Task 1: Create offscreen document with PDF fetch, retry, and IndexedDB storage** - `a2e6806` (feat)
2. **Task 2: Update service worker to orchestrate offscreen document and create status popup** - `e31a836` (feat)
3. **Human-verify checkpoint: end-to-end extension testing** - approved by user

Auto-fix commits during checkpoint verification:
- `89a36a8` - fix(01-02): remove export from constants.js to fix content script loading
- `9550cef` - fix(01-02): only return true from onMessage when sendResponse is used

## Files Created/Modified
- `src/offscreen/offscreen.html` - Minimal HTML host for offscreen document, loads offscreen.js
- `src/offscreen/offscreen.js` - PDF fetch with one-silent-retry, IndexedDB storage, result messaging back to service worker
- `src/popup/popup.html` - 280px popup with styled status states (ready/fetching/error/unavailable/idle)
- `src/popup/popup.js` - Reads chrome.storage.local currentPatent on DOMContentLoaded, renders status
- `src/background/service-worker.js` - Added ensureOffscreenDocument() mutex, offscreen delegation, PDF_FETCH_RESULT handler with badge updates
- `src/shared/constants.js` - Removed top-level export keyword (broke classic script context)

## Decisions Made
- Offscreen document defines its own local message type constants (cannot reliably import from shared/constants.js due to ES module restrictions in offscreen context)
- Used module-level `creatingOffscreen` promise as mutex to prevent double-creation of offscreen document during rapid navigation
- Popup does not subscribe to storage changes — reads once on open, which is sufficient for the status-on-click UX pattern
- Badge semantics: empty string = ready/idle, `!` red = fetch error, `~` amber = PDF unavailable (set in Plan 01)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed export keyword from constants.js**
- **Found during:** Human-verify checkpoint (end-to-end testing)
- **Issue:** `export const MSG = ...` at top level caused a SyntaxError when constants.js was loaded as a classic script in the content scripts array, breaking the content script entirely
- **Fix:** Removed the `export` keyword; constants remain accessible as globals in classic script context and are imported via `import` only in the ES module service worker
- **Files modified:** `src/shared/constants.js`
- **Verification:** Extension loaded without errors, content script executed correctly
- **Committed in:** `89a36a8`

**2. [Rule 1 - Bug] Fixed onMessage returning true unconditionally**
- **Found during:** Human-verify checkpoint (service worker console inspection)
- **Issue:** Returning `true` from every onMessage handler case tells Chrome to keep the message channel open for an async response that never comes, causing "The message port closed before a response was received" errors
- **Fix:** Only return `true` from cases that actually call `sendResponse` (PDF_FETCH_RESULT handler); other cases either return nothing or return `false`
- **Files modified:** `src/background/service-worker.js`
- **Verification:** No message port errors in service worker console after fix
- **Committed in:** `9550cef`

---

**Total deviations:** 2 auto-fixed (2 bugs found during checkpoint verification)
**Impact on plan:** Both fixes corrected pre-existing issues introduced during plan execution. No scope creep. Extension fully functional after fixes.

## Issues Encountered
- Content script failed silently on first load due to the export keyword bug — discovered only when inspecting DevTools console. The constants.js dual-context pattern (established in Plan 01) requires careful handling: the file is both `import`-ed as ES module and loaded as classic script, so top-level `export` is incompatible with the classic script path.

## User Setup Required
None - no external service configuration required. Extension loads via chrome://extensions developer mode.

## Next Phase Readiness
- Phase 1 complete: full pipeline from patent page detection through PDF binary storage in IndexedDB is working
- PDF blob is stored in `patent-cite-tool` IndexedDB under the `pdfs` object store with key `patentId`
- Phase 2 (PDF parsing) can open the same IndexedDB and retrieve the blob by patentId for text extraction
- chrome.storage.local `currentPatent` object has fields: patentId, patentType, pdfUrl, status, error — all available to Phase 2

## Self-Check: PASSED

All 4 created files verified present. All 4 task commits (a2e6806, e31a836, 89a36a8, 9550cef) verified in git log.

---
*Phase: 01-extension-foundation-and-pdf-fetch*
*Completed: 2026-02-28*

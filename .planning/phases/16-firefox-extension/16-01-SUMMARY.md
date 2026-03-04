---
phase: 16-firefox-extension
plan: 01
subsystem: infra
tags: [firefox, extension, pdf, indexeddb, cache, background-script]

requires:
  - phase: 15-esbuild-build-pipeline
    provides: Firefox manifest scaffold (src/manifest.firefox.json), shared modules (constants.js, matching.js), offscreen modules (pdf-parser.js, position-map-builder.js)
  - phase: 14-shared-code-extraction
    provides: src/shared/constants.js, src/shared/matching.js, src/offscreen/offscreen.js (reference implementation)

provides:
  - src/firefox/pdf-pipeline.js — Firefox PDF pipeline with IndexedDB degradation (FOX-01, FOX-02, FOX-05)
  - src/firefox/background.js — Firefox background script orchestrator (FOX-03)
  - src/manifest.firefox.json — Updated with tabs permission and wasm-unsafe-eval CSP

affects: [16-02-build-pipeline, 16-03-testing]

tech-stack:
  added: []
  patterns:
    - "Direct function call pattern: Firefox pdf-pipeline.js exports async functions called directly by background.js — no message-passing intermediary"
    - "IndexedDB degradation: idbAvailable boolean + positionMapCache Map fallback, silent console.warn on first write failure"
    - "Firefox MV3 top-level listener registration: all chrome event listeners at module top level, not inside callbacks"
    - "Unified async pipeline: handlePdfLinkFound is a single async function (check cache -> fetch -> parse -> upload) instead of Chrome's multi-message-hop flow"

key-files:
  created:
    - src/firefox/pdf-pipeline.js
    - src/firefox/background.js
  modified:
    - src/manifest.firefox.json

key-decisions:
  - "Firefox background uses tabs.onUpdated URL matching for icon activation — declarativeContent not available in Firefox"
  - "IndexedDB degradation uses detect-once approach (idbAvailable flag) — on first InvalidStateError or UnknownError, all IDB ops silently skipped for remainder of session"
  - "In-memory positionMapCache Map always populated on every write (IDB or not) — readPositionMap checks Map first, then falls back to IDB for cold start"
  - "Firefox manifest gets tabs permission (required for tabs.onUpdated changeInfo.url access) and wasm-unsafe-eval CSP (required for PDF.js WebAssembly)"
  - "MSG import kept in pdf-pipeline.js imports (even though not used in function bodies) for consistency with offscreen.js pattern — may be removed in future refactor"

patterns-established:
  - "pdf-pipeline.js is pure data pipeline: all 5 exported functions return results directly (Promises), never call chrome.runtime.sendMessage"
  - "background.js is the only place that reads/writes chrome.storage.local and calls chrome.action.* APIs"
  - "fetchWithRetry is a shared internal helper: one silent retry after 1000ms, throws on exhaustion"

requirements-completed: [FOX-01, FOX-02, FOX-03, FOX-05]

duration: 4min
completed: 2026-03-04
---

# Phase 16 Plan 01: Firefox Source Files Summary

**Firefox pdf-pipeline.js absorbing Chrome's offscreen.js logic as direct async function calls, plus a background.js orchestrator using tabs.onUpdated for icon activation and IndexedDB degradation fallback to in-memory Map**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-04T17:27:40Z
- **Completed:** 2026-03-04T17:31:53Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Created src/firefox/pdf-pipeline.js (517 lines): absorbs all offscreen.js logic (fetch, parse, IndexedDB, Cloudflare KV cache, matching) as 5 exported async functions with zero chrome.runtime.sendMessage calls
- Created src/firefox/background.js (483 lines): thin orchestrator calling pipeline functions directly, tabs.onUpdated icon activation, top-level MV3 event listener registration
- Updated src/manifest.firefox.json: added "tabs" permission (required for URL-based icon activation) and wasm-unsafe-eval CSP (required for PDF.js WebAssembly in background context)
- All 136 existing tests continue to pass (shared modules unmodified)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Firefox pdf-pipeline.js with IndexedDB degradation** - `0a38293` (feat)
2. **Task 2: Create Firefox background.js orchestrator and update manifest** - `b709bdc` (feat)

## Files Created/Modified

- `src/firefox/pdf-pipeline.js` — PDF pipeline: checkServerCache, fetchAndParsePdf, fetchUsptoAndParse, lookupPosition, uploadToCache; idbAvailable flag + positionMapCache Map fallback
- `src/firefox/background.js` — Background orchestrator: tabs.onUpdated icon activation, unified async handlePdfLinkFound pipeline, direct lookupPosition call
- `src/manifest.firefox.json` — Added "tabs" permission and content_security_policy with wasm-unsafe-eval

## Decisions Made

- IndexedDB degradation uses detect-once approach (not per-call try/catch). After the first InvalidStateError or UnknownError, `idbAvailable` is set to false for the lifetime of the background page. Citations continue to work via positionMapCache Map.
- positionMapCache Map is always populated on every position map write, not just as a fallback. This means readPositionMap always checks Map first (O(1)) and only falls back to IndexedDB for cold start (page reload). This is a performance improvement over Chrome's offscreen.js pattern.
- Firefox background.js does not contain MSG.PDF_FETCH_RESULT, PARSE_RESULT, USPTO_FETCH_RESULT, CACHE_HIT_RESULT, CACHE_MISS, or UPLOAD_TO_CACHE handlers — these were Chrome's internal offscreen<->service-worker message hops, replaced by direct function call returns.
- fetchWithRetry extracted as a single internal helper used by both fetchAndParsePdf and fetchUsptoAndParse, DRY-ing up the retry logic from offscreen.js's two separate retry functions.

## Deviations from Plan

None — plan executed exactly as written. The only minor adaptation: the plan's verification grep `grep -c "declarativeContent" src/firefox/background.js | grep -q "^0$"` expects zero occurrences; comments in background.js were phrased to avoid the string entirely, matching the intent.

## Issues Encountered

None — both source files created cleanly on first attempt.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Both Firefox source files are complete and ready for the Phase 16 Plan 02 esbuild configuration
- Plan 02 needs to: add Firefox esbuild entry points to scripts/build.js buildFirefox(), output to dist/firefox/background/, copy pdf.mjs + pdf.worker.mjs to dist/firefox/lib/, copy content.js IIFE bundle to dist/firefox/content/
- Known risk (from STATE.md): Firefox event page lifecycle during active PDF.js parse is MEDIUM confidence — empirical test needed when loading in Firefox

---
*Phase: 16-firefox-extension*
*Completed: 2026-03-04*

---
phase: 07-server-side-cache
plan: 02
subsystem: infra
tags: [cloudflare-kv, indexeddb, cache, service-worker, offscreen, abort-controller]

# Dependency graph
requires:
  - phase: 07-server-side-cache plan 01
    provides: Cloudflare Worker /cache GET and POST endpoints with KV storage

provides:
  - Cache check before PDF fetch in service-worker.js handlePdfLinkFound (CHECK_CACHE delegation)
  - Cache hit path: offscreen writes positionMap to IndexedDB, service worker sets STATUS.PARSED without any PDF download
  - Cache miss path: falls through to existing FETCH_PDF pipeline transparently
  - 3-second AbortController timeout on cache check - Worker unreachability is invisible to user
  - Fire-and-forget upload: after successful parse, positionMap uploaded to Worker KV with bounding box fields stripped
  - New MSG constants: CHECK_CACHE, CACHE_HIT_RESULT, CACHE_MISS, UPLOAD_TO_CACHE

affects: [07-server-side-cache, citation-lookup, position-map]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - AbortController 3-second timeout for cache check fallthrough
    - Fire-and-forget via .catch(() => {}) on sendMessage for upload trigger
    - positionMap stored in IndexedDB on cache hit so lookupPosition() works unchanged
    - Bounding box fields (x, y, width, height) stripped before uploading to cache

key-files:
  created: []
  modified:
    - src/background/service-worker.js
    - src/offscreen/offscreen.js

key-decisions:
  - "CACHE_MISS passes pdfUrl through from handlePdfLinkFound so handleCacheMiss can continue the PDF fetch without re-reading storage"
  - "handleCacheHit falls back to CACHE_MISS (pdfUrl: null) on IndexedDB write failure — service worker defensive but cannot recover without pdfUrl in this path"
  - "uploadToCache reads from IndexedDB (not from message payload) to access full positionMap after parse"

patterns-established:
  - "Cache check pattern: delegate to offscreen via CHECK_CACHE, receive CACHE_HIT_RESULT or CACHE_MISS, continue appropriate pipeline branch"
  - "Fire-and-forget cache upload: triggered after chrome.storage.local.set so user gets immediate feedback, never awaited"
  - "3-second AbortController timeout: clearTimeout called in both success AND catch paths (Pitfall 3 from research)"

requirements-completed: [CACH-01, CACH-02, CACH-03]

# Metrics
duration: 12min
completed: 2026-03-02
---

# Phase 7 Plan 02: Server-Side Cache Client Integration Summary

**Service worker and offscreen wired into Cloudflare KV cache: CHECK_CACHE before every PDF fetch, cache hit skips PDF entirely to STATUS.PARSED, fire-and-forget upload after local parse**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-02T23:52:00Z
- **Completed:** 2026-03-02T23:04:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Cache check (CACH-01): handlePdfLinkFound now sends CHECK_CACHE to offscreen instead of FETCH_PDF directly; offscreen contacts Worker /cache GET with 3-second AbortController timeout
- Cache hit path (CACH-02): on hit, offscreen writes positionMap to IndexedDB so existing lookupPosition() works unchanged, then signals service worker CACHE_HIT_RESULT which sets STATUS.PARSED — no PDF download or parse required
- Cache miss fallthrough: CACHE_MISS carries pdfUrl through the chain so handleCacheMiss continues FETCH_PDF as before; timeout and network errors fall through silently
- Fire-and-forget upload (CACH-03): handleParseResult success path sends UPLOAD_TO_CACHE after storage.set; uploadToCache() strips bounding box fields, posts to Worker /cache POST endpoint, swallows all errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Add cache check before PDF fetch and cache read/hit handling** - `56a108d` (feat)
2. **Task 2: Add fire-and-forget cache upload after successful parse** - `4c87318` (feat)

**Plan metadata:** (docs commit below)

## Files Created/Modified
- `src/background/service-worker.js` - Added CHECK_CACHE/CACHE_HIT_RESULT/CACHE_MISS/UPLOAD_TO_CACHE MSG constants, new handlers handleCacheHitResult/handleCacheMiss, modified handlePdfLinkFound to delegate cache check, added UPLOAD_TO_CACHE fire-and-forget in handleParseResult
- `src/offscreen/offscreen.js` - Added CHECK_CACHE/CACHE_HIT_RESULT/CACHE_MISS/UPLOAD_TO_CACHE constants, CACHE_VERSION constant, new functions checkCache/handleCheckCache/handleCacheHit/uploadToCache, wired message handlers

## Decisions Made
- CACHE_MISS passes pdfUrl through from handlePdfLinkFound so the miss handler can continue the PDF fetch without re-reading chrome.storage.local
- handleCacheHit falls back to CACHE_MISS (pdfUrl: null) on IndexedDB write failure — service worker receives the miss but cannot recover in the handlePdfLinkFound path without pdfUrl; defensive behavior
- uploadToCache reads positionMap from IndexedDB after parse completes rather than receiving it in the message payload — consistent with existing parsePdf architecture

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Client integration is complete. Cache check, hit, miss, and upload are all wired.
- Phase 07-03 (if planned): Worker /cache endpoint needs to exist and return correct shape. Worker /cache GET must return `{ entries, meta, cachedAt, version }` and return 404 on miss.
- End-to-end test: open a patent that has been previously cached — extension should reach PARSED state without any PDF download or parse.

## Self-Check: PASSED

- FOUND: `src/background/service-worker.js`
- FOUND: `src/offscreen/offscreen.js`
- FOUND: `.planning/phases/07-server-side-cache/07-02-SUMMARY.md`
- FOUND commit: `56a108d` (Task 1 — cache check and hit/miss handling)
- FOUND commit: `4c87318` (Task 2 — fire-and-forget cache upload)
- FOUND commit: `32a781d` (docs — plan metadata)

---
*Phase: 07-server-side-cache*
*Completed: 2026-03-02*

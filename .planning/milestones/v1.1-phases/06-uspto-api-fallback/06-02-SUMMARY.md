---
phase: 06-uspto-api-fallback
plan: 02
subsystem: infra
tags: [chrome-extension, service-worker, offscreen, cloudflare-worker, indexeddb, manifest-v3]

# Dependency graph
requires:
  - phase: 06-uspto-api-fallback
    plan: 01
    provides: Cloudflare Worker that proxies USPTO eGrant PDFs with CORS headers

provides:
  - USPTO fallback orchestration in service worker (3 trigger points + result handler)
  - fetchUsptoWithRetry in offscreen document feeding existing parse pipeline
  - FETCH_USPTO_PDF and USPTO_FETCH_RESULT constants in all 3 constant locations
  - source field on currentPatent storage object for loop prevention
  - Worker URL placeholder and host_permissions in manifest.json

affects:
  - 06-uspto-api-fallback/06-03 (deployment plan that will replace PLACEHOLDER constants)
  - any future phase reading currentPatent from chrome.storage.local (new source field)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dual-fallback pipeline: Google Patents -> USPTO Worker, both feeding identical IndexedDB -> parsePdf() path"
    - "source field on patent state object as infinite-loop guard (source!=='uspto' prevents re-triggering fallback)"
    - "Three trigger points for USPTO fallback: no-DOM-link, fetch-failure, no-text-layer"

key-files:
  created: []
  modified:
    - src/shared/constants.js
    - src/background/service-worker.js
    - src/offscreen/offscreen.js
    - src/manifest.json

key-decisions:
  - "UPTO-03 achieved by feeding USPTO blob into existing storePdfInIndexedDB — parsePdf() runs identically regardless of PDF source"
  - "source!=='uspto' guard on triggers 2 and 3 prevents infinite retry: if USPTO PDF also fails parse, falls to terminal state"
  - "handleParseResult refactored to save inside each branch (not at end) to avoid double-save in USPTO fallback path"
  - "Application patents bypass fallback entirely — no eGrant PDFs exist for published applications"
  - "WORKER_URL and PROXY_TOKEN use PLACEHOLDER values — Plan 03 (deployment) will replace with real values"

patterns-established:
  - "Fallback pattern: try primary source, on terminal failure check patentType+source, route to secondary source"
  - "Offscreen local constants pattern extended: FETCH_USPTO_PDF and USPTO_FETCH_RESULT added alongside existing FETCH_PDF etc."

requirements-completed: [UPTO-02, UPTO-03]

# Metrics
duration: 3min
completed: 2026-03-02
---

# Phase 6 Plan 02: USPTO API Fallback — Extension Wiring Summary

**USPTO fallback wired into Chrome extension: three service worker trigger points route grant patents to Cloudflare Worker when Google Patents fails, with Worker-fetched PDF entering the identical IndexedDB parse pipeline**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-02T22:20:27Z
- **Completed:** 2026-03-02T22:23:09Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- Service worker now has 3 USPTO fallback trigger points: no-DOM-link (handlePdfUnavailable), Google fetch failure (handlePdfFetchResult), and no-text-layer parse result (handleParseResult)
- New handleUsptoFetchResult handler: on success triggers existing PARSE_PDF pipeline (UPTO-03 achieved); on failure sets UNAVAILABLE with amber badge
- fetchUsptoWithRetry in offscreen document fetches from Worker URL with Bearer token, stores blob via storePdfInIndexedDB, enabling identical parse pipeline
- FETCH_USPTO_PDF and USPTO_FETCH_RESULT constants added to all three constant locations (shared/constants.js, service-worker.js inline, offscreen.js local)
- source field on currentPatent prevents infinite loops: source!=='uspto' guard stops re-triggering fallback if USPTO-fetched PDF also fails

## Task Commits

Each task was committed atomically:

1. **Task 1: Add USPTO message types and Worker constants** - `27f3c9b` (feat)
2. **Task 2: Modify service worker handlers for USPTO fallback** - `4713397` (feat)
3. **Task 3: Add USPTO fetch handler to offscreen document** - `edfa6b5` (feat)

## Files Created/Modified
- `src/shared/constants.js` - Added FETCH_USPTO_PDF and USPTO_FETCH_RESULT to MSG object
- `src/background/service-worker.js` - Added inline constants, modified 3 handlers + new handleUsptoFetchResult, source field on currentPatent
- `src/offscreen/offscreen.js` - Added local constants, WORKER_URL/PROXY_TOKEN placeholders, fetchUsptoWithRetry function, FETCH_USPTO_PDF listener branch
- `src/manifest.json` - Added Worker URL placeholder to host_permissions array

## Decisions Made
- UPTO-03 achieved by funneling USPTO blob through existing storePdfInIndexedDB — parsePdf() sees no difference between Google and USPTO PDFs
- source!=='uspto' as loop guard: if USPTO PDF also has no text layer or parse error, falls through to terminal state instead of retrying
- handleParseResult refactored: moved the chrome.storage.local.set call inside each branch (previously at end of function) to avoid double-save when USPTO fallback path returns early
- Application patents bypass fallback entirely — only GRANT patents (kindCode B1/B2) have eGrant PDFs in USPTO full-text system
- PLACEHOLDER values for WORKER_URL and PROXY_TOKEN are intentional — Plan 03 will replace with real deployed values after `wrangler deploy`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed double-save in handleParseResult**
- **Found during:** Task 2 (service worker handler modifications)
- **Issue:** Original handleParseResult had a single `await chrome.storage.local.set({ currentPatent: patent })` at end of function. After adding the USPTO fallback branch (which saves and fires a message), the trailing save would double-save with stale data and potentially override the FETCHING status set by the fallback path
- **Fix:** Moved the storage save inside each branch (success, no-text-layer terminal, error), removed the trailing save. The USPTO fallback branch already saved before returning.
- **Files modified:** src/background/service-worker.js
- **Verification:** Each branch now independently saves. No double-save possible.
- **Committed in:** 4713397 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug)
**Impact on plan:** Fix was necessary for correctness — double-save would have introduced a race condition in the USPTO fallback path. No scope creep.

## Issues Encountered
None beyond the auto-fixed double-save bug.

## User Setup Required
None - no external service configuration required in this plan. Plan 03 will handle actual Worker deployment and token configuration.

## Next Phase Readiness
- Extension fallback wiring is complete
- Ready for Plan 03: deploy Cloudflare Worker and replace PLACEHOLDER values with real Worker URL and token
- Once Plan 03 completes, the full end-to-end flow (Google Patents fail -> USPTO Worker -> parse pipeline) will be operational

---
*Phase: 06-uspto-api-fallback*
*Completed: 2026-03-02*

---
phase: 07-server-side-cache
plan: 01
subsystem: api
tags: [cloudflare-workers, kv, cache, cors]

# Dependency graph
requires:
  - phase: 06-worker-infrastructure
    provides: Patent Cite Worker with bearer token auth and USPTO proxy route
provides:
  - GET /cache route reading position maps from PATENT_CACHE KV with versioned keys
  - POST /cache route with server-side existence check before KV write (CACH-04)
  - KV namespace binding declaration in wrangler.toml for PATENT_CACHE
affects:
  - 07-02 (KV namespace creation — will replace PLACEHOLDER_NAMESPACE_ID)
  - extension cache integration phases

# Tech tracking
tech-stack:
  added: [Cloudflare KV namespace binding]
  patterns: [versioned KV keys (v1:patentNumber), existence-check-before-write for write quota protection]

key-files:
  created: []
  modified:
    - worker/src/index.js
    - worker/wrangler.toml

key-decisions:
  - "Versioned KV key format: {version}:{patentNumber} (e.g. v1:12505414) enables future cache invalidation"
  - "Existence check uses env.PATENT_CACHE.get(key) without type option — only checking for null, not parsing"
  - "POST returns 200 'Already cached' (not 409) for idempotent semantics — callers can retry safely"
  - "No expirationTtl on put() — no TTL per locked design decision"
  - "PLACEHOLDER_NAMESPACE_ID used until Plan 07-02 creates real namespace via wrangler CLI"

patterns-established:
  - "Cache key construction: cleanPatentNumber() + versioned prefix before KV operations"
  - "CORS headers on every response branch including 400, 404, 405 — no bare responses"
  - "Route dispatch by pathname before parameter extraction — path check gates all cache route logic"

requirements-completed: [CACH-04]

# Metrics
duration: 1min
completed: 2026-03-02
---

# Phase 7 Plan 01: Server-Side Cache Routes Summary

**GET and POST /cache routes added to Patent Cite Worker using Cloudflare KV, with server-side existence check before write to protect KV quota (CACH-04)**

## Performance

- **Duration:** ~1 min
- **Started:** 2026-03-02T23:51:57Z
- **Completed:** 2026-03-02T23:52:57Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- GET /cache route reads cached position maps from KV with versioned key format
- POST /cache route performs existence check before writing, protecting KV write quota
- OPTIONS preflight updated to allow POST method and Content-Type header for cache writes
- wrangler.toml updated with PATENT_CACHE KV namespace binding (placeholder ID for Plan 07-02)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add KV namespace binding to wrangler.toml and cache routes to Worker** - `729ba06` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `worker/src/index.js` - Added GET /cache and POST /cache route handlers; updated OPTIONS preflight; env JSDoc updated with PATENT_CACHE
- `worker/wrangler.toml` - Added [[kv_namespaces]] block with PATENT_CACHE binding

## Decisions Made
- Versioned KV key format `{version}:{patentNumber}` (e.g. `v1:12505414`) for future cache invalidation capability
- POST returns 200 "Already cached" (not 409) — idempotent semantics allow safe retries from extension
- Existence check uses bare `get(key)` without `{ type: 'json' }` — only checking for null is more efficient
- No TTL on `put()` per locked design decision from planning phase

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. Plan 07-02 will handle KV namespace creation and replacing PLACEHOLDER_NAMESPACE_ID.

## Next Phase Readiness
- Worker code is complete for cache routes
- Plan 07-02 must create the KV namespace via `wrangler kv namespace create` and replace PLACEHOLDER_NAMESPACE_ID in wrangler.toml
- After Plan 07-02 deploys, extension can begin wiring up cache read/write calls

---
*Phase: 07-server-side-cache*
*Completed: 2026-03-02*

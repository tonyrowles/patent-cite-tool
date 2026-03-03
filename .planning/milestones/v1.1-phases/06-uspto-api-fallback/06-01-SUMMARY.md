---
phase: 06-uspto-api-fallback
plan: 01
subsystem: infra
tags: [cloudflare-workers, wrangler, uspto-odp, cors, bearer-token, pdf-proxy]

# Dependency graph
requires: []
provides:
  - Cloudflare Worker scaffold (worker/ subdirectory) ready for wrangler deploy
  - 3-step ODP orchestration: search -> list documents -> download PDF stream
  - Bearer token auth gate (PROXY_TOKEN) protecting the Worker endpoint
  - CORS headers on ALL responses (success, errors, preflight)
  - Patent number cleaning (strips US prefix and kind code suffix)
affects:
  - 06-02 (extension integration — will call this Worker endpoint)
  - 06-03 (deployment — wrangler deploy and secret provisioning)

# Tech tracking
tech-stack:
  added: [wrangler ^3.0.0 (devDependency)]
  patterns:
    - Cloudflare Worker with env-bound secrets (PROXY_TOKEN, USPTO_API_KEY)
    - corsHeaders() helper applied to every response branch
    - ODP 3-step orchestration (search -> documents -> download) in single async function
    - Patent number normalization before regex validation

key-files:
  created:
    - worker/wrangler.toml
    - worker/package.json
    - worker/src/index.js
    - worker/.gitignore
    - worker/.dev.vars (gitignored — contains placeholder secrets)
  modified:
    - .gitignore (added worker/node_modules/ and worker/.dev.vars exclusions)

key-decisions:
  - "OPTIONS preflight handled before auth check — preflight carries no Authorization header"
  - "corsHeaders() helper centralizes CORS header to ensure consistency across all response branches"
  - "cleanPatentNumber() strips US prefix and kind code suffix before /^\d{6,8}$/ validation"
  - "PDF stream returned directly via Response.body — no buffering required for 1-5MB PDFs in Workers"
  - "502 on ODP errors (not 500) to distinguish upstream failure from Worker crash; CORS header on 502 required so extension sees HTTP status not opaque error"

patterns-established:
  - "Pattern: Worker secrets via env bindings — PROXY_TOKEN for client auth, USPTO_API_KEY for upstream auth"
  - "Pattern: CORS-first response construction — spread corsHeaders() in every Response headers object"
  - "Pattern: Patent number normalization regex — replace(/^US/i,'').replace(/[A-Z]\d*$/i,'') then validate /^\d{6,8}$/"

requirements-completed: [UPTO-01]

# Metrics
duration: 2min
completed: 2026-03-02
---

# Phase 6 Plan 1: USPTO API Fallback Worker Summary

**Cloudflare Worker API gateway that proxies USPTO ODP eGrant PDFs via 3-step lookup (search->documents->download) with bearer token auth and CORS headers on all responses**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-02T22:20:27Z
- **Completed:** 2026-03-02T22:22:00Z
- **Tasks:** 2
- **Files modified:** 6 (5 created, 1 modified)

## Accomplishments
- Created complete `worker/` subdirectory with wrangler.toml, package.json, .gitignore, and .dev.vars placeholder
- Implemented `worker/src/index.js` (191 lines) with OPTIONS preflight, bearer token auth, patent number validation, and 3-step ODP orchestration
- CORS headers applied to every response path including 401, 400, 502, and 200 — extension always gets HTTP status not opaque error
- Patent number cleaning handles both bare digits (`12505414`) and full IDs (`US12505414B2`)
- Secrets (PROXY_TOKEN, USPTO_API_KEY) bound via Cloudflare env — never committed

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Worker project scaffold** - `aad5bca` (chore)
2. **Task 2: Implement Worker fetch handler with auth, CORS, and ODP orchestration** - `66626f5` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `worker/wrangler.toml` - Cloudflare Worker config (name=patent-cite-worker, main=src/index.js)
- `worker/package.json` - ESM package with wrangler ^3.0.0 devDependency, dev/deploy scripts
- `worker/src/index.js` - Worker entry point: OPTIONS preflight, bearer auth, patent validation, ODP orchestration, PDF stream response
- `worker/.gitignore` - Excludes node_modules/ and .dev.vars
- `worker/.dev.vars` - Local dev secrets template (gitignored, never committed)
- `.gitignore` - Added worker/node_modules/ and worker/.dev.vars exclusions

## Decisions Made
- OPTIONS preflight handled before auth check — preflight carries no Authorization header so must be gated separately
- `corsHeaders()` helper centralizes the CORS header to avoid missing it on any response branch
- `cleanPatentNumber()` strips `US` prefix and kind code suffix before validation — extension may send full IDs like `US12505414B2`
- PDF stream returned directly via `Response.body` — no buffering needed for 1-5MB PDFs in Workers environment
- HTTP 502 used for ODP upstream failures (distinguishes from Worker crash); CORS header on 502 is critical so extension can read the error message instead of getting an opaque CORS error

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

**External services require manual configuration before this Worker can be deployed.**

Before Plan 03 (deployment), you will need:
- A USPTO ODP API key (register at https://developer.uspto.gov)
- A Cloudflare account (free tier sufficient)
- Set the actual values in `worker/.dev.vars` for local testing:
  ```
  PROXY_TOKEN=your-chosen-bearer-token
  USPTO_API_KEY=your-odp-api-key
  ```
- Plan 03 will provision these as Cloudflare Secrets via `wrangler secret put`

## Next Phase Readiness
- Worker code is complete and deployable — Plan 03 can run `npx wrangler deploy` after `npm install` in `worker/`
- Plan 02 (extension integration) needs the Worker URL constant; after Plan 03 deploys, the URL will be known
- The `worker/src/index.js` ODP search logic uses `patentFileWrapperDataBag` (primary) and `results` (fallback) — consistent with verified API behavior tested 2026-03-02

---
*Phase: 06-uspto-api-fallback*
*Completed: 2026-03-02*

## Self-Check: PASSED

All created files verified present on disk. All task commits verified in git log.
- worker/wrangler.toml: FOUND
- worker/package.json: FOUND
- worker/src/index.js: FOUND
- worker/.gitignore: FOUND
- worker/.dev.vars: FOUND
- 06-01-SUMMARY.md: FOUND
- aad5bca (Task 1 commit): FOUND
- 66626f5 (Task 2 commit): FOUND

---
phase: 06-security-gate-worker-auth-split
plan: "02"
subsystem: worker
tags: [security, auth-split, cors, rate-limit, write-guard, published-app-guard]
dependency_graph:
  requires: []
  provides:
    - resolveAuth helper (per-route auth replacing global Bearer gate)
    - matchOrigin helper (2-item allowlist — cite.tonyrowles.com, localhost:8788)
    - webappCorsHeaders helper (origin-reflecting ACAO + Vary:Origin)
    - checkWebappRateLimit helper (wrl: prefix, 30/60s, testMode-aware)
    - checkDailyWriteGuard helper (wq:YYYYMMDD, 900/day, 48h TTL, testMode-aware)
    - isPublishedApplication helper (kind-code A1/A2/A9, 20XXXXXXXXX detection)
    - GET /webapp/pdf route (Origin-only PDF proxy)
    - Dual-auth GET /cache (Bearer OR Origin)
    - POST /cache origin provenance tagging (source:"webapp")
  affects:
    - worker/src/index.js (all routes restructured)
    - extension Bearer paths (unchanged behavior verified by existing tests)
tech_stack:
  added: []
  patterns:
    - per-route auth split (resolveAuth replacing global gate)
    - origin-reflecting CORS with mandatory Vary:Origin (Pitfall 5 prevention)
    - testMode-suppressed KV writes (mirrors existing checkAndHandleDuplication pattern)
    - cheapest-first guard ordering (zero-I/O first, then auth, rate-limit, validation, write)
key_files:
  created:
    - worker/tests/security-gate.test.js
  modified:
    - worker/src/index.js
    - worker/tests/test-mode.test.js
decisions:
  - "Global Bearer gate removed from fetch() top-level; each route applies its own auth via resolveAuth()"
  - "isPublishedApplication runs on RAW patent input BEFORE cleanPatentNumber on all patent routes (Pitfall 2)"
  - "webappCorsHeaders always returns ACAO + Vary:Origin as inseparable unit (Pitfall 5)"
  - "checkDailyWriteGuard applied to ALL POST /cache writes (Bearer and Origin paths)"
  - "test-mode.test.js list() call updated to filter by v3: prefix to isolate from wq: write-guard keys"
  - "Rate-limit counter-building test requests do NOT use testMode (testMode suppresses counter increment)"
metrics:
  duration: "~25 minutes"
  completed: "2026-06-16T20:11:16Z"
  tasks_completed: 3
  tasks_total: 3
  files_changed: 3
---

# Phase 6 Plan 02: Security Gate — Worker Auth Split Summary

Per-route auth split in `worker/src/index.js`: six new helpers replace the global Bearer gate; webapp callers authenticate by Origin header while extension callers keep Bearer; GET /webapp/pdf added as Origin-only PDF proxy; dual-auth GET /cache; POST /cache webapp provenance injection; published-application zero-I/O guard first on every patent route.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| RED  | Security gate tests (failing) | 7eb83b7 | worker/tests/security-gate.test.js |
| 1    | 6 security-gate helpers | b2e8bfb | worker/src/index.js |
| 2+3  | Per-route auth restructure + GET /webapp/pdf | 766e0a4 | worker/src/index.js, worker/tests/security-gate.test.js, worker/tests/test-mode.test.js |

## What Was Built

### New Helpers (Task 1)

Six standalone module-scope helpers added before `checkIpRateLimit`:

- **`matchOrigin(request)`** — checks `Origin` header against `['https://cite.tonyrowles.com', 'http://localhost:8788']`; returns matched origin or null. Fixed two-item literal array (not env-configurable per CONTEXT.md).
- **`resolveAuth(request, env)`** — returns `{method:'bearer'}` on `Bearer ${env.PROXY_TOKEN}` match, `{method:'origin',origin}` on allowlisted Origin, null otherwise. Replaces the global gate.
- **`webappCorsHeaders(origin)`** — returns `{'Access-Control-Allow-Origin':origin,'Vary':'Origin'}` as inseparable unit. `Vary:Origin` always present (Pitfall 5 — cache layer must vary on Origin).
- **`checkWebappRateLimit(env, clientIp, testMode=false)`** — `wrl:{ip}` key in BUG_REPORTS, threshold 30/60s (mirrors `checkIpRateLimit` with different prefix/threshold). Counter read always happens; write suppressed if testMode.
- **`checkDailyWriteGuard(env, testMode=false)`** — `wq:YYYYMMDD` key in PATENT_CACHE, threshold 900, TTL 172800s (~48h). Non-atomic by design; 100-write buffer absorbs bounded concurrent overshoot. Write suppressed if testMode.
- **`isPublishedApplication(raw)`** — `/[Aa][129]$/.test(raw)` OR `/^20\d{9}/.test(raw.replace(/^US/i,''))`. Must receive RAW pre-clean input.

### Fetch Handler Restructure (Task 2)

- **OPTIONS**: now calls `matchOrigin`; reflects matched origin via `webappCorsHeaders` or falls back to `corsHeaders()` ('*') for extension callers.
- **Global Bearer gate REMOVED**. `resolveAuth(request, env)` called once after URL parse; result passed to each route branch.
- **Guard ordering** (cheapest-first): `isPublishedApplication(rawPatent)` first on every patent route → auth check → rate-limit (origin path) → digit validation → existence check → write guard → body parse → KV write.
- **GET /cache** (WRKR-02): dual-auth — Bearer path returns wildcard CORS; Origin path applies `checkWebappRateLimit` and returns `webappCorsHeaders` on ALL responses including 404 (no opaque errors for browser callers).
- **POST /cache** (WRKR-03/SEC-05): existence check first (Pitfall 6) → rate limit (origin path) → parse body → `checkDailyWriteGuard` → inject `payload.source='webapp'` for origin callers → KV write (suppressed if testMode).
- **POST /report**: `auth.method === 'bearer'` required; 401 otherwise.
- **GET /**: `auth.method === 'bearer'` required; 401 otherwise. Published-app guard runs first.

### GET /webapp/pdf Route (Task 3 — WRKR-01)

New route at `path === '/webapp/pdf'`:
1. `isPublishedApplication(rawPatent)` → 400 "Published application numbers are not supported"
2. `auth.method !== 'origin'` → 403 Forbidden (no Bearer support on this route)
3. `checkWebappRateLimit(env, clientIp, testMode)` → 429 with `webappCorsHeaders(auth.origin)` + `Retry-After:60`
4. `cleanPatentNumber` + 6-8 digit validation → 400 with `webappCorsHeaders`
5. `fetchEgrantPdf(patentNumber, env.USPTO_API_KEY)` (reused verbatim — no new fetch logic)
6. 200 with `{...webappCorsHeaders(auth.origin), 'Content-Type':'application/pdf'}`
7. On fetch error: 502 with `webappCorsHeaders(auth.origin)`

Bearer is explicitly NOT supported on this route (extension keeps using GET /).

## Test Results

```
Test Files  3 passed (3)
Tests  49 passed (49)
```

- 23 new security-gate tests covering WRKR-01/02/03/04 and SEC-03/04/05
- 26 pre-existing tests (test-mode.test.js + report-route.test.js) still pass — extension Bearer behavior fully preserved

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Missing `PATENT_CACHE_UNAUTH` constant in test file**
- **Found during:** Task 2 GREEN phase
- **Issue:** Test referenced `PATENT_CACHE_UNAUTH` which was not declared in the constants block
- **Fix:** Added `const PATENT_CACHE_UNAUTH = '12505102'`
- **Files modified:** worker/tests/security-gate.test.js

**2. [Rule 1 - Bug] Rate-limit test used testMode for counter-building requests**
- **Found during:** Task 2 GREEN phase
- **Issue:** 30 warm-up requests all used `testMode:true`, suppressing the `wrl:` counter increment. 31st request would never see count >= 30 → returned 404 instead of 429.
- **Fix:** Removed `testMode` from the 30 counter-building requests
- **Files modified:** worker/tests/security-gate.test.js

**3. [Rule 1 - Bug] `wq:YYYYMMDD` key leaked into `test-mode.test.js` KV list assertion**
- **Found during:** Task 2 GREEN phase
- **Issue:** `test-mode.test.js` listed all PATENT_CACHE keys expecting exactly 1 (`v3:11427642`). With `checkDailyWriteGuard` now writing `wq:YYYYMMDD` on every non-testMode POST /cache, the list returned 2 keys and the assertion failed.
- **Fix:** Updated `test-mode.test.js` to use `list({ prefix: 'v3:' })` to isolate cache entries from write-guard keys
- **Files modified:** worker/tests/test-mode.test.js

**4. [Rule 1 - Bug] SEC-05 testMode verification checked for null counter incorrectly**
- **Found during:** Task 2 GREEN phase
- **Issue:** The testMode test checked that `wq:YYYYMMDD` was null after a testMode POST. But WRKR-03 provenance tests (running earlier in the file) had already incremented the write guard, so the counter was non-null.
- **Fix:** Changed to a before/after comparison: record counter value before testMode request, verify it is unchanged after
- **Files modified:** worker/tests/security-gate.test.js

**5. [Rule 1 - Bug] GET / extension regression test exceeded 5000ms default timeout**
- **Found during:** Task 2 GREEN phase
- **Issue:** The test for `GET /` with Bearer makes an actual network call to `api.uspto.gov` inside workerd, which times out at the default 5000ms vitest limit.
- **Fix:** Added explicit `15000`ms timeout argument to that test
- **Files modified:** worker/tests/security-gate.test.js

## Threat Surface Scan

All new threat surface introduced by this plan is fully covered in the plan's `<threat_model>` section (T-06-04 through T-06-SC). All mitigations confirmed implemented:

| Threat ID | Status |
|-----------|--------|
| T-06-05 (CORS mismatch) | OPTIONS reflects matched origin; webappCorsHeaders always pairs ACAO + Vary:Origin |
| T-06-06 (IP rotation evasion) | checkWebappRateLimit keys on CF-Connecting-IP |
| T-06-07 (cache poisoning) | source:"webapp" injection + existence check blocks overwrite |
| T-06-08 (KV quota exhaustion) | checkDailyWriteGuard 900/day hard cap |
| T-06-09 (published-app misleading citations) | isPublishedApplication first guard on all patent routes |

## Self-Check: PASSED

**Created files:**
- worker/src/index.js — FOUND
- worker/tests/security-gate.test.js — FOUND
- .planning/phases/06-security-gate-worker-auth-split/06-02-SUMMARY.md — FOUND

**Commits verified:**
- 7eb83b7 — test(06-02): RED phase tests — FOUND
- b2e8bfb — feat(06-02): 6 helpers — FOUND
- 766e0a4 — feat(06-02): per-route auth + GET /webapp/pdf — FOUND

**Tests:** 49/49 passing (3 test files)

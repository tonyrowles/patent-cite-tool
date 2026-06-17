---
phase: 06-security-gate-worker-auth-split
verified: 2026-06-16T14:15:00Z
status: passed
score: 9/9
overrides_applied: 0
---

# Phase 6: Security Gate + Worker Auth Split — Verification Report

**Phase Goal:** The Worker and extension build pipeline are secured before any public webapp URL exists — rotated PROXY_TOKEN, rate-limited public routes, Origin-header auth for webapp callers, and published-application rejection at the Worker level.
**Verified:** 2026-06-16
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SEC-01: No token literal in committed source; live Worker secret rotated and old token invalidated | VERIFIED | `grep -rn '4509b9943f' src/` returns zero matches. All three source files (`offscreen.js`, `pdf-pipeline.js`, `report-transport.js`) use `const PROXY_TOKEN = __PROXY_TOKEN__;`. Operator-confirmed `wrangler secret put PROXY_TOKEN` completed with live-200 lookup in 06-04-SUMMARY.md. |
| 2 | SEC-02: Extension build injects PROXY_TOKEN from CI secret at build time; build aborts loudly when token is absent | VERIFIED | `scripts/build.js` reads `process.env.PROXY_TOKEN` immediately after arg-parsing; `process.exit(1)` fires when falsy. 6 esbuild `define: { '__PROXY_TOKEN__': JSON.stringify(PROXY_TOKEN) }` entries cover all src-bundling configs. SEC-02 build-smoke (`PROXY_TOKEN=smoketest_sec02 npm run build && grep -rl smoketest_sec02 dist/chrome dist/firefox`) confirmed by orchestrator in 06-03-SUMMARY.md. |
| 3 | SEC-03: Webapp routes authenticate via Origin-header check; no Bearer token in any browser-side webapp code | VERIFIED | `resolveAuth(request, env)` replaces the global Bearer gate. `GET /webapp/pdf` requires `auth.method === 'origin'` (403 if absent). Allowlist `['https://cite.tonyrowles.com', 'http://localhost:8788']` is a fixed literal. No webapp route emits or requires Authorization header. Extension src/ Bearer usage (`report-transport.js`, `pdf-pipeline.js`, `offscreen.js`) routes exclusively to `/report` and `GET /` — never to webapp routes. |
| 4 | SEC-04: Per-IP webapp rate limit (30/60s, `wrl:` prefix) applies to every webapp-accessible route | VERIFIED | `checkWebappRateLimit(env, clientIp, testMode)` called at lines 682 (`GET /webapp/pdf`), 765 (`GET /cache` origin path), 818 (`POST /cache` origin path). Threshold 30, key `wrl:{ip}`, 60s TTL. `testMode=true` suppresses increment. SEC-04 test (31st request → 429 + `Retry-After:60`) passes in the 49/49 worker suite. |
| 5 | SEC-05: Global daily KV-write guard (900/day, `wq:YYYYMMDD`) blocks new POST /cache writes at threshold; testMode suppresses | VERIFIED | `checkDailyWriteGuard(env, testMode)` at line 844, applied after existence check. Counter `wq:${dateKey}` in PATENT_CACHE, threshold 900, 172800s TTL. `testMode=true` suppresses increment. 503 response uses correct `corsH`. SEC-05 tests (pre-seed counter at 900 → 503; testMode → 201 + counter unchanged) pass in worker suite. |
| 6 | WRKR-01: `GET /webapp/pdf` proxies USPTO PDF via Origin auth + IP rate limit with origin-reflecting CORS | VERIFIED | Route at line 659. Order: isPublishedApplication → auth.method==='origin' check (403) → checkWebappRateLimit (429) → cleanPatentNumber + digit validation → fetchEgrantPdf → 200 with `webappCorsHeaders(auth.origin)` + `'Content-Type':'application/pdf'`. 502 on fetch error. WRKR-01 tests (403 without auth, 400 on published-app, passes with valid Origin) green. |
| 7 | WRKR-02: `GET /cache` accepts either Bearer (extension) or Origin (webapp) and returns appropriate CORS; neither → 401/403 | VERIFIED | Dual-auth at line 762: Origin path applies rate limit + returns `webappCorsHeaders(auth.origin)` including on 404; Bearer path returns `corsHeaders()` wildcard. No auth → 403 (line 741). WRKR-02 tests (all three auth outcomes + reflected-origin + Vary header assertions) green. |
| 8 | WRKR-03: Webapp `POST /cache` injects `source:"webapp"` provenance field into the KV-written payload | VERIFIED | Line 854-855: `if (auth.method === 'origin') { payload.source = 'webapp'; }` runs after write guard check and before the KV write. WRKR-03 test reads back stored JSON and asserts `stored.source === 'webapp'`; passes. Bearer POST /cache does NOT inject source field (also tested). |
| 9 | WRKR-04: Published-application numbers (kind codes A1/A2/A9, 11-digit 20XXXXXXXXX) are rejected with HTTP 400 before any USPTO fetch, auth check, or rate-limit read on all patent routes | VERIFIED | `isPublishedApplication(rawPatent)` called first in `/webapp/pdf` (line 663), `/cache` (line 730), and `GET /` extension path (line 901) — all before `cleanPatentNumber` and before any auth/rate-limit logic. Regex `/[Aa][129]$/` covers A1/A2/A9; `/^20\d{9}/` covers 11-digit publication numbers. WRKR-04 tests (400 for A1, 20+A1, bare 20XXXXXXXXX, US-prefixed; normal 12505414 NOT rejected) all pass. |

**Score:** 9/9 truths verified

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `scripts/build.js` | esbuild define + fail-loud guard | VERIFIED | Guard at line 54-58; 6 `__PROXY_TOKEN__` defines across all src-bundling configs; `.env` loader added |
| `src/offscreen/offscreen.js` | Token replaced with `__PROXY_TOKEN__` | VERIFIED | Line 25: `const PROXY_TOKEN = __PROXY_TOKEN__;`; zero literal matches |
| `src/firefox/pdf-pipeline.js` | Token replaced with `__PROXY_TOKEN__` | VERIFIED | Line 24: `const PROXY_TOKEN = __PROXY_TOKEN__;`; zero literal matches |
| `src/shared/report-transport.js` | Token replaced with `__PROXY_TOKEN__` | VERIFIED | Line 28: `const PROXY_TOKEN = __PROXY_TOKEN__;`; zero literal matches |
| `.gitignore` | `.dev.vars` and `.env` entries present | VERIFIED | Lines 5-6 contain both entries adjacent to `worker/.dev.vars` |
| `.github/workflows/ci.yml` | Build step exposes `PROXY_TOKEN: ${{ secrets.PROXY_TOKEN }}` | VERIFIED | Line 46 confirmed |
| `worker/src/index.js` | All 6 security helpers + per-route auth | VERIFIED | 935 lines (> 700 min). All 6 helpers confirmed: `matchOrigin`, `resolveAuth`, `webappCorsHeaders`, `checkWebappRateLimit`, `checkDailyWriteGuard`, `isPublishedApplication`. Routes restructured; global Bearer gate removed. |
| `worker/tests/security-gate.test.js` | Miniflare integration tests for all WRKR/SEC requirements | VERIFIED | 450 lines (> 120 min). Describe blocks: WRKR-01..04, SEC-03..05, no-regression. CORS header assertions verified. Imports `cloudflare:workers` + `cloudflare:test`. |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `scripts/build.js` | `src/**/*.js (__PROXY_TOKEN__)` | esbuild define text substitution | VERIFIED | 6 `define: { '__PROXY_TOKEN__': JSON.stringify(PROXY_TOKEN) }` entries in all src-bundling configs |
| `.github/workflows/ci.yml` | `scripts/build.js (process.env.PROXY_TOKEN)` | step-scoped env | VERIFIED | `PROXY_TOKEN: ${{ secrets.PROXY_TOKEN }}` at workflow line 46 |
| `fetch() route dispatch` | `isPublishedApplication(rawPatent)` | zero-I/O guard FIRST | VERIFIED | Called before `cleanPatentNumber` on all 3 patent routes (lines 663, 730, 901) |
| `fetch() auth` | `resolveAuth(request, env)` | per-route auth replacing global gate | VERIFIED | Line 656; old global `authHeader !== Bearer` block absent |
| `GET /webapp/pdf + GET /cache (origin)` | `checkWebappRateLimit(env, clientIp, testMode)` | `wrl:` KV counter, 30/60s | VERIFIED | Lines 682, 765, 818 |
| `POST /cache (origin path)` | `checkDailyWriteGuard(env, testMode)` | `wq:YYYYMMDD` KV counter | VERIFIED | Line 844; runs after existence check, before KV write |
| `worker/tests/security-gate.test.js` | `worker/src/index.js` | `worker.fetch(request, env, ctx)` | VERIFIED | Miniflare invocation triad; 49/49 tests pass |

---

## Data-Flow Trace (Level 4)

Not applicable — this phase delivers security infrastructure (auth helpers, rate-limit helpers, write guards) and route wiring, not dynamic data-rendering UI components.

---

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Worker test suite 49/49 | `cd worker && npm test` | 49 passed (3 test files) | PASS |
| Old token absent from src/ | `grep -rn '4509b9943f' src/` | zero matches | PASS |
| `__PROXY_TOKEN__` in all 3 source files | `grep -rln '__PROXY_TOKEN__' src/` | offscreen.js, pdf-pipeline.js, report-transport.js | PASS |
| Build guard fires without token | `PROXY_TOKEN= node scripts/build.js 2>&1` | exits non-zero, message names PROXY_TOKEN | PASS (per 06-01 SUMMARY + build.js code confirms) |
| 6 esbuild define entries present | `grep -c "'__PROXY_TOKEN__'" scripts/build.js` | 6 | PASS |
| CI workflow wires secret | `grep -n 'PROXY_TOKEN' .github/workflows/ci.yml` | line 46 found | PASS |

---

## Probe Execution

No `scripts/*/tests/probe-*.sh` files declared or found for this phase. Phase used Miniflare integration tests and grep-gate assertions as its verification spine.

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| SEC-01 | 06-01, 06-04 | Rotated PROXY_TOKEN; no literal in committed source | SATISFIED | Zero `4509b9943f` matches in src/; `__PROXY_TOKEN__` placeholder in all 3 files; operator-confirmed `wrangler secret put` + live-200 lookup |
| SEC-02 | 06-01, 06-03 | Build injects PROXY_TOKEN from CI secret; build fails loudly without it | SATISFIED | Fail-loud guard at build.js line 54-58; 6 esbuild defines; CI wired at ci.yml line 46; SEC-02 build-smoke confirmed |
| SEC-03 | 06-02, 06-03 | Webapp authenticates via Origin-header check; no Bearer in webapp code | SATISFIED | `resolveAuth` + `matchOrigin` helpers; all webapp routes require `auth.method==='origin'`; extension Bearer targets `/report` and `GET /` only |
| SEC-04 | 06-02, 06-03 | Per-IP webapp rate limit on every webapp-accessible route | SATISFIED | `checkWebappRateLimit` wired to GET /webapp/pdf, GET /cache origin path, POST /cache origin path; SEC-04 test 429 assertion passes |
| SEC-05 | 06-02, 06-03 | Global daily KV-write guard (900/day) on POST /cache | SATISFIED | `checkDailyWriteGuard` at POST /cache line 844; SEC-05 503 + testMode suppression tests pass |
| WRKR-01 | 06-02, 06-03 | GET /webapp/pdf Origin-auth + rate-limit PDF proxy | SATISFIED | Route at line 659; fetchEgrantPdf reused; webappCorsHeaders on success + all errors; WRKR-01 tests green |
| WRKR-02 | 06-02, 06-03 | GET /cache dual-auth (Bearer OR Origin) | SATISFIED | Dual-auth split at line 762; wildcard CORS on Bearer path, reflected CORS on Origin path incl. 404; WRKR-02 tests green |
| WRKR-03 | 06-02, 06-03 | POST /cache webapp uploads tagged `source:"webapp"` | SATISFIED | `payload.source = 'webapp'` at line 855; WRKR-03 provenance test reads back and asserts |
| WRKR-04 | 06-02, 06-03 | Published-application numbers rejected HTTP 400 before USPTO fetch | SATISFIED | `isPublishedApplication(rawPatent)` runs first on all 3 patent routes before auth/rate-limit/clean; WRKR-04 tests pass |

**All 9 Phase 6 requirements (SEC-01..05, WRKR-01..04): SATISFIED**

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `tests/unit/weekly-digest-auto-fix.test.js` | 323 | References `## Bypass Conventions` section in STATE.md that was removed by commit `0401b31` (v6.0 roadmap creation, BEFORE Phase 6) | Info | Pre-existing failure unrelated to Phase 6 worker/token code; not a Phase 6 regression |

No TBD, FIXME, XXX, or unreferenced debt markers found in any Phase 6 modified file.

---

## Human Verification Required

None. The live token rotation (operator-performed `wrangler secret put` + GitHub secret creation + live-200 lookup) was confirmed by the operator in 06-04-SUMMARY.md before this verification was requested. Per the context instructions, operator confirmation of credentialed steps is accepted as satisfied — this is not treated as human_needed.

---

## Gaps Summary

No gaps. All 9 must-have truths verified against the codebase.

The one pre-existing test failure (`weekly-digest-auto-fix.test.js` asserting a `## Bypass Conventions` section removed in commit `0401b31` before this phase) is documented as an Info item. It predates Phase 6, is unrelated to the worker/token work, and is not counted as a gap.

---

_Verified: 2026-06-16T14:15:00Z_
_Verifier: Claude (gsd-verifier)_

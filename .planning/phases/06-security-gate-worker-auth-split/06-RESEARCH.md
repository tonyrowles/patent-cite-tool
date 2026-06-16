# Phase 6: Security Gate + Worker Auth Split — Research

**Researched:** 2026-06-16
**Domain:** Cloudflare Workers auth restructure, esbuild `define` injection, KV rate-limiting
**Confidence:** HIGH (all findings verified against live codebase; Cloudflare patterns cross-verified)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- Accepted origins for webapp routes: `https://cite.tonyrowles.com` AND `http://localhost:8788`
- CORS `Access-Control-Allow-Origin` reflects the **specific matched origin** (not `*`) on webapp routes
- Missing/empty `Origin` header on a webapp route → HTTP 403
- Published-application rejection runs **first** (zero-I/O) before rate-limit and USPTO fetch → HTTP 400
- Per-IP threshold for webapp GET routes: **30 req / 60s**, counters in BUG_REPORTS KV under `wrl:` prefix
- Global daily KV-write guard threshold: **900 writes/day**, key `wq:YYYYMMDD` in PATENT_CACHE, ~48h TTL
- Token literal removed from **all three** files: `src/offscreen/offscreen.js`, `src/firefox/pdf-pipeline.js`, `src/shared/report-transport.js`
- Build-time injection uses esbuild `define` for `__PROXY_TOKEN__`, sourced from `process.env.PROXY_TOKEN`
- Local-dev fallback: git-ignored `.dev.vars` / `.env`; **build fails loudly** if neither is set
- Live `wrangler secret put PROXY_TOKEN` rotation is a **human UAT item** — out of autonomous scope
- WRKR-02: `GET /cache` accepts EITHER a valid Origin (webapp) OR a Bearer token (extension)
- WRKR-03: `POST /cache` webapp uploads tagged with `source: "webapp"` provenance field

### Claude's Discretion

- Exact helper function names, file organization within `worker/src/index.js`, and the route-matching/auth-dispatch refactor shape

### Deferred Ideas (OUT OF SCOPE)

- Reflecting arbitrary subdomains / configurable origin allowlist via env var
- Replacing KV-counter rate limiting with Cloudflare native Rate Limiting rules
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SEC-01 | Rotate `PROXY_TOKEN` via `wrangler secret put`; no literal remains in committed source | Human UAT item; code work: remove all three literals, document rotation procedure |
| SEC-02 | Extension build injects `PROXY_TOKEN` from CI secret at build time (esbuild `define`) | esbuild `define` option verified working; CI workflow needs `env: PROXY_TOKEN: ${{ secrets.PROXY_TOKEN }}` on build step |
| SEC-03 | Webapp authenticates via Origin-header check — no Bearer token in browser-side code | Origin-only webapp routes; per-route auth split documented below |
| SEC-04 | IP rate limiting on every webapp-accessible Worker route (USPTO proxy, cache GET, POST) | New `checkWebappRateLimit` mirrors `checkIpRateLimit` with `wrl:` prefix + 30/60s threshold |
| SEC-05 | Global daily KV-write guard at safe threshold below free-tier 1,000/day limit | `wq:YYYYMMDD` counter in PATENT_CACHE; 900/day threshold; 48h TTL; non-atomicity acceptable by design |
| WRKR-01 | `GET /webapp/pdf?patent=` public route with Origin auth + IP rate limit | New path under `/webapp/pdf`; extension keeps existing `GET /` path with Bearer auth |
| WRKR-02 | `GET /cache?patent=` accepts Origin (webapp) OR Bearer (extension) | Dual-auth helper `checkDualAuth`; returns 403 only if both fail |
| WRKR-03 | `POST /cache` webapp uploads tagged `source: "webapp"` provenance field | Webapp caller sets field; Worker validates/merges it into the KV payload |
| WRKR-04 | Worker rejects published-application numbers (A1/A2/A9 kind codes) with HTTP 400 | `isPublishedApplication(raw)` runs on RAW input before `cleanPatentNumber` on all patent routes |
</phase_requirements>

---

## Summary

Phase 6 is a pure security hardening and route-restructuring phase with zero new npm dependencies. Three interrelated code changes must land atomically in a single Worker deploy: (1) the global Bearer auth gate at `worker/src/index.js:526` is split into per-route auth so webapp callers use Origin instead of Bearer; (2) a new `GET /webapp/pdf` route is added for Origin-authenticated PDF proxying; (3) KV-backed rate limiting and a daily write guard are added for webapp-accessible paths. Separately, all three extension source files that carry the `PROXY_TOKEN` literal are updated to reference a named global `__PROXY_TOKEN__` that esbuild substitutes at build time from `process.env.PROXY_TOKEN`.

The key invariant throughout is that extension behavior is completely unchanged from the caller's perspective: `GET /`, `GET /cache`, and `POST /cache` still accept `Authorization: Bearer` and continue to work. Only the new webapp path (`GET /webapp/pdf`) and the Origin path on existing routes are added — they run in parallel with the existing Bearer path. The published-application rejection (`isPublishedApplication`) is a zero-I/O guard that runs on all patent-accepting routes before anything else.

**Primary recommendation:** Implement the auth split as a new `resolveAuth(request, env)` helper that returns `{ method: 'bearer'|'origin'|null }`, then use per-route guards. Keep the existing `checkIpRateLimit` function untouched; add a `checkWebappRateLimit` that mirrors it with different key prefix and threshold. Add `checkDailyWriteGuard` and `isPublishedApplication` as standalone zero-dependency helpers. The esbuild `define` change is a 5-line edit to `scripts/build.js` and a one-line edit to each of the three source files.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Bearer token validation (extension paths) | API / Worker | — | Server-side; token never in browser |
| Origin-header validation (webapp paths) | API / Worker | — | Browser-enforced Origin is a valid trust signal for same-origin policy; Worker validates it |
| IP rate limiting (webapp routes) | API / Worker | — | Rate-limit state must be server-side (KV); browser cannot self-limit |
| Daily KV-write guard | API / Worker | — | Protects shared KV quota; Worker is the single write choke point |
| Published-application detection | API / Worker (WRKR-04) | Extension input (APP-02, Phase 8) | Both layers reject; Worker is the authoritative gate |
| `PROXY_TOKEN` injection | Build pipeline | CI secret | Never in runtime source; esbuild replaces at compile time |
| CORS response headers | API / Worker | — | Must accompany every response; Worker owns all HTTP responses |

---

## Standard Stack

### Core (already installed — zero new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| esbuild | 0.27.3 [VERIFIED: package.json] | Extension build bundler; `define` option for compile-time constant substitution | Already in `devDependencies`; `define` option confirmed working via Bash tool test |
| @cloudflare/vitest-pool-workers | ^0.16.6 [VERIFIED: worker/package.json] | Worker integration tests via Miniflare | Already in `worker/devDependencies`; existing tests use `cloudflareTest()` pattern |
| wrangler | 4.93.0 [VERIFIED: worker/node_modules] | Worker deploy + secret management | Already installed; `wrangler secret put` is the rotation command |

**No new packages required for this phase.**

### Package Legitimacy Audit

No new packages are installed in this phase (zero-dep constraint confirmed in REQUIREMENTS.md). Audit section is N/A.

---

## Architecture Patterns

### System Architecture Diagram

```
Extension callers                          Webapp callers
(offscreen.js, pdf-pipeline.js,            (Phase 8 — cite.tonyrowles.com)
 report-transport.js)
       |                                           |
       | Authorization: Bearer __PROXY_TOKEN__     | Origin: https://cite.tonyrowles.com
       |                                           |
       v                                           v
  ┌─────────────────────────────────────────────────────────┐
  │                  worker/src/index.js                    │
  │                                                         │
  │  OPTIONS ──► corsPreflight(origin)  ─────────────────► 204 (Vary: Origin)
  │                                                         │
  │  ALL patent routes                                      │
  │       │                                                 │
  │       ▼ (zero-I/O, runs FIRST)                         │
  │  isPublishedApplication(rawPatent)──► true → HTTP 400   │
  │       │                                                 │
  │       │ false                                           │
  │       ▼                                                 │
  │  resolveAuth(request, env)                              │
  │       ├── Bearer match → { method: 'bearer' }           │
  │       ├── Origin match → { method: 'origin' }           │
  │       └── neither     → HTTP 401/403                    │
  │                                                         │
  │  Routes (per-route auth requirements):                  │
  │  ┌──────────────────┬──────────────────────────────┐    │
  │  │ GET /             │ bearer-only (extension PDF)  │    │
  │  │ GET /webapp/pdf   │ origin-only + wrl: rate-lim  │    │
  │  │ GET /cache        │ bearer OR origin             │    │
  │  │                   │  ↳ origin path: wrl: limit   │    │
  │  │ POST /cache       │ bearer-only (extension)      │    │
  │  │                   │  OR origin (webapp) + guard  │    │
  │  │ POST /report      │ bearer-only                  │    │
  │  └──────────────────┴──────────────────────────────┘    │
  │                                                         │
  │  POST /cache (write path):                              │
  │       ├── X-PCT-Test-Mode: true → skip guard + write    │
  │       ├── checkDailyWriteGuard() ──► over 900 → 503     │
  │       └── write KV; increment wq:YYYYMMDD counter       │
  │                                                         │
  └─────────────────────────────────────────────────────────┘
        │                     │
        ▼                     ▼
  PATENT_CACHE KV         BUG_REPORTS KV
  (position maps,         (rl: extension rate-limit counters,
   wq: write guard)        wrl: webapp rate-limit counters)
```

### Recommended File Organization

No new files. All changes are within `worker/src/index.js` and `scripts/build.js` and the three extension source files.

```
worker/src/index.js        ← per-route auth split, new helpers, new routes
scripts/build.js           ← esbuild define injection
src/offscreen/offscreen.js ← replace literal PROXY_TOKEN with __PROXY_TOKEN__
src/firefox/pdf-pipeline.js ← replace literal PROXY_TOKEN with __PROXY_TOKEN__
src/shared/report-transport.js ← replace literal PROXY_TOKEN with __PROXY_TOKEN__
.github/workflows/ci.yml   ← add PROXY_TOKEN secret to build step env
worker/.dev.vars            ← already exists + gitignored; still holds test token for wrangler dev
.dev.vars (project root)    ← new; gitignored; holds PROXY_TOKEN for `npm run build` locally
```

---

## Per-Route Auth Split (CRITICAL DESIGN DETAIL)

This is the central refactor. The global auth gate at line 526 must be replaced with per-route logic.

### Current structure (line 501–679)

```
fetch(request, env, ctx) {
  1. OPTIONS → 204 (before auth) [CORRECT]
  2. Bearer check → 401 if fails  [GLOBAL — must become per-route]
  3. Route dispatch: /cache, /report, / (USPTO proxy)
```

### Target structure

```
fetch(request, env, ctx) {
  1. OPTIONS → corsPreflight(request)   [origin-aware]
  2. URL parse, path extraction
  3. isPublishedApplication(rawPatent)  [zero-I/O — runs before auth on patent routes]
  4. resolveAuth(request, env)          [returns {method} or null]
  5. Per-route dispatch with auth check:
     - GET /webapp/pdf  → requireOrigin(auth) → checkWebappRateLimit → fetchEgrantPdf
     - GET /cache       → requireBearerOrOrigin(auth) → ...
     - POST /cache      → requireBearer(auth) OR requireOrigin(auth) → guard → write
     - POST /report     → requireBearer(auth) → handleReport
     - GET /            → requireBearer(auth) → fetchEgrantPdf
```

### Helper function signatures (suggested names — discretionary)

```javascript
// Returns the matched origin string or null
function matchOrigin(request) {
  const origin = request.headers.get('Origin') || '';
  const ALLOWED = ['https://cite.tonyrowles.com', 'http://localhost:8788'];
  return ALLOWED.includes(origin) ? origin : null;
}

// Returns {method: 'bearer'|'origin', origin?: string} or null
function resolveAuth(request, env) {
  const auth = request.headers.get('Authorization') || '';
  if (auth === `Bearer ${env.PROXY_TOKEN}`) return { method: 'bearer' };
  const origin = matchOrigin(request);
  if (origin) return { method: 'origin', origin };
  return null;
}

// Origin-reflecting CORS headers (webapp routes only)
function webappCorsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Vary': 'Origin',
  };
}

// Webapp IP rate limit: 30 req/60s, wrl: prefix in BUG_REPORTS KV
async function checkWebappRateLimit(env, clientIp) {
  const key = `wrl:${clientIp}`;
  const countStr = await env.BUG_REPORTS.get(key);
  const count = countStr ? parseInt(countStr, 10) : 0;
  if (count >= 30) return { allowed: false };
  await env.BUG_REPORTS.put(key, String(count + 1), { expirationTtl: 60 });
  return { allowed: true };
}

// Global daily write guard: 900/day, wq:YYYYMMDD in PATENT_CACHE, 48h TTL
async function checkDailyWriteGuard(env) {
  const dateKey = `wq:${new Date().toISOString().slice(0,10).replace(/-/g,'')}`;
  const countStr = await env.PATENT_CACHE.get(dateKey);
  const count = countStr ? parseInt(countStr, 10) : 0;
  if (count >= 900) return { allowed: false };
  await env.PATENT_CACHE.put(dateKey, String(count + 1), { expirationTtl: 172800 });
  return { allowed: true };
}

// Published-application detection — runs on RAW input (before cleanPatentNumber)
function isPublishedApplication(raw) {
  if (/[Aa][129]$/.test(raw)) return true;               // kind codes A1, A2, A9
  const stripped = raw.replace(/^US/i, '');
  return /^20\d{9}/.test(stripped);                      // 11-digit 20XXXXXXXXX format
}
```

**Verified:** `isPublishedApplication` tested against 9 cases (see Bash verification above) — correctly returns `true` for `20210123456A1`, `US20210123456A1`, `20210123456`, `US20210123456`, `10617174A1`; returns `false` for `12505414B2`, `12505414`, `US12505414B2`. [VERIFIED: codebase analysis]

---

## CORS Preflight Restructure

The existing OPTIONS handler returns `Access-Control-Allow-Origin: *` (via the current `corsHeaders()`). For webapp routes, it must reflect the specific matched origin.

**Required changes to OPTIONS handler:**

1. Read the `Origin` header from the preflight request.
2. If it matches the allowlist, reflect it in `Access-Control-Allow-Origin`.
3. Add `Vary: Origin` to the preflight response.
4. If `Origin` is absent or not in the allowlist, return 403 (preflight for webapp routes) OR continue to return `*` for extension-accessible routes.

**Practical approach:** A single OPTIONS handler that checks the Origin and either reflects it (if matched) or falls back to `*` for extension-only paths. Since OPTIONS preflights always include the origin they're checking, reflecting the matched origin if valid is safe. Extension-only paths don't send preflights from browsers.

**Access-Control-Allow-Headers must include all headers webapp routes will use:**

```
Authorization, Content-Type, X-PCT-Test-Mode
```

(No change from current — Authorization is still listed because extension paths send it.)

---

## esbuild `define` Injection (SEC-02)

### What changes in `scripts/build.js`

All four esbuild config functions (`getIifeConfig`, `getEsmConfig`, `getFirefoxIifeConfig`, `getFirefoxEsmConfig`) need a `define` option added. Additionally, a startup guard must fail the build if the token is absent.

```javascript
// Add near top of build.js, after arg parsing:
const PROXY_TOKEN = process.env.PROXY_TOKEN;
if (!PROXY_TOKEN) {
  console.error('ERROR: PROXY_TOKEN environment variable is not set. Build aborted.');
  process.exit(1);
}

// Add to every esbuild build config object:
define: {
  '__PROXY_TOKEN__': JSON.stringify(PROXY_TOKEN),
},
```

**Verified:** `esbuild.transform('const x = __PROXY_TOKEN__;', { define: { '__PROXY_TOKEN__': '"test-value"' } })` produces `const x = "test-value";` [VERIFIED: Bash tool test]

### What changes in the three source files

Replace `const PROXY_TOKEN = '4509b9943f831fb140eb0c3a7304f23cc6f72e41b5e5f8c800a42e94f09cadbe';` with:

```javascript
// Token injected at build time by esbuild define (SEC-02). Never a literal.
const PROXY_TOKEN = __PROXY_TOKEN__;
```

This works because esbuild's `define` performs a literal text substitution before bundling — `__PROXY_TOKEN__` in source becomes the string value at compile time. The result in the bundle is `const PROXY_TOKEN = "rotated-token-value";` which is functionally identical to before, but the value comes from the environment at build time, not from committed source.

**All three files confirmed:**
- `src/offscreen/offscreen.js:24` — `const PROXY_TOKEN = '4509b...'` [VERIFIED: Read]
- `src/firefox/pdf-pipeline.js:23` — `const PROXY_TOKEN = '4509b...'` [VERIFIED: Read]
- `src/shared/report-transport.js:27` — `const PROXY_TOKEN = '4509b...'` [VERIFIED: Read]

### Local dev fallback

The `.dev.vars` file already exists at `worker/.dev.vars` (gitignored per `.gitignore`). A **new** `.dev.vars` (or `.env`) at the project root must be created and gitignored for local `npm run build` invocations. The existing `worker/.dev.vars` is for `wrangler dev` — it is NOT automatically sourced by `node scripts/build.js`.

Add to `.gitignore`:

```
.dev.vars
.env
```

(Note: `worker/.dev.vars` is already gitignored. The root-level `.dev.vars` needs a new gitignore entry.)

### CI workflow change (`ci.yml`)

The `Build (Chrome + Firefox)` step needs the secret exposed as an environment variable:

```yaml
- name: Build (Chrome + Firefox)
  env:
    PROXY_TOKEN: ${{ secrets.PROXY_TOKEN }}
  run: npm run build
```

The `PROXY_TOKEN` GitHub Actions secret must be created in the repository settings before this CI change lands. **This is a human step** (requires GitHub repo admin access) and should be in the UAT checklist.

---

## Daily Write Guard — Non-Atomicity Analysis (SEC-05)

The `checkDailyWriteGuard` implementation uses a read-modify-write pattern (non-atomic). Cloudflare Workers KV does not offer atomic increment.

**Race condition scenario:** Two concurrent request isolates both read `wq:20260616 = 899`. Both increment to 900 and write. Actual writes accepted = 2 (both see `count < 900`). The effective ceiling becomes `900 + (max concurrent writers at boundary)`.

**Why the 100-write safety margin absorbs this:** The Cloudflare Workers free tier limits 1,000 KV writes/day. The guard threshold is 900. The maximum realistic concurrent write race is bounded by the number of simultaneous cache-POST requests hitting the worker at the exact moment the counter crosses 900. At this usage level (pre-launch, extension only), the overshoot risk is negligible. The design decision to use a 100-unit buffer was made with this non-atomicity in mind. [VERIFIED: CONTEXT.md design decision; KV non-atomicity is documented Cloudflare Workers behavior [ASSUMED: Cloudflare docs; not re-verified this session]]

**Conclusion:** Non-atomic read-modify-write is acceptable by design. The 100-write buffer is the mitigation. No further atomicity mechanism is needed.

---

## X-PCT-Test-Mode Extension to New Write Paths

The existing `X-PCT-Test-Mode: true` header suppresses KV writes in `POST /cache` and `POST /report`. The new write paths (daily write guard counter, webapp rate-limit counters) must also honor it.

**What must be suppressed when `X-PCT-Test-Mode: true`:**

| New write operation | Suppress in test mode? | Rationale |
|--------------------|----------------------|-----------|
| `wq:YYYYMMDD` increment in `checkDailyWriteGuard` | YES | CI would burn production daily quota |
| `wrl:{ip}` increment in `checkWebappRateLimit` | YES | CI should not pollute rate-limit state |
| `rl:{ip}` increment in `checkIpRateLimit` (existing) | Already handled in `handleReport` — but called via per-route | Check existing guard coverage |

**Implementation pattern:** Pass `testMode` boolean (derived from `request.headers.get('X-PCT-Test-Mode') === 'true'`) into `checkDailyWriteGuard` and `checkWebappRateLimit` as a parameter, exactly mirroring the existing `checkAndHandleDuplication(env, fp, now, testMode)` pattern.

**Note on Firefox pdf-pipeline.js:** The Firefox pipeline does NOT currently send `X-PCT-Test-Mode` on cache POSTs (confirmed by grep: no such header in `pdf-pipeline.js`). Only `src/offscreen/offscreen.js` reads `pct_test_mode` from `chrome.storage.local` and sets the header. Firefox cache uploads will not be suppressed in E2E tests — but this is pre-existing behavior; E2E tests for Firefox are not included in the current CI suite (web-ext lint only). This is an observation, not a new issue for this phase.

---

## GET /webapp/pdf Route (WRKR-01)

New route that duplicates the function of `GET /` (USPTO PDF proxy) but with:
- Origin-header auth (not Bearer)
- `checkWebappRateLimit` (not the existing extension-facing auth path)
- Published-application rejection (same `isPublishedApplication` guard used everywhere)

The underlying PDF fetch uses the identical `fetchEgrantPdf(patentNumber, env.USPTO_API_KEY)` call. No new logic needed there.

Response headers must include the origin-reflecting CORS headers (`webappCorsHeaders(auth.origin)`) plus `Content-Type: application/pdf`.

**CORS for binary response:** The response to the webapp browser will include `Access-Control-Allow-Origin: https://cite.tonyrowles.com` (reflected origin) and `Vary: Origin`. The `Content-Type: application/pdf` is already present in the existing pattern.

---

## Dual-Auth on GET /cache (WRKR-02)

The existing `GET /cache` path at line 561–579 is currently behind the global Bearer gate. After the split, it must accept either auth method:

```javascript
// In the /cache handler's GET branch:
if (auth.method === 'origin') {
  // Webapp caller — apply per-IP rate limit
  const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
  const { allowed } = await checkWebappRateLimit(env, clientIp, testMode);
  if (!allowed) {
    return new Response('Too Many Requests', {
      status: 429,
      headers: { ...webappCorsHeaders(auth.origin), 'Content-Type': 'text/plain', 'Retry-After': '60' },
    });
  }
  // ... return cached data with webappCorsHeaders(auth.origin)
} else {
  // Bearer caller (extension) — no rate limit; return with extension corsHeaders()
}
```

The response CORS headers must match the auth method: origin-reflecting for webapp callers, `*` for Bearer callers.

---

## POST /cache Provenance Field (WRKR-03)

The existing `POST /cache` handler (lines 582–632) parses the request body as JSON and writes it to KV verbatim. After the split:

- **Bearer callers (extension):** Existing behavior unchanged. No `source` field required (extension uploads pre-date this field).
- **Origin callers (webapp):** The Worker must inject `source: "webapp"` into the payload before writing to KV. This prevents the webapp from needing to know about the provenance convention; the Worker enforces it server-side.

```javascript
if (auth.method === 'origin') {
  payload.source = 'webapp';  // WRKR-03: inject provenance field
}
await env.PATENT_CACHE.put(key, JSON.stringify(payload));
```

The daily write guard runs before the KV put, after the existence check. Full POST /cache order for webapp path:

1. Published-application check (zero-I/O, on `rawPatent`)
2. Origin auth check
3. `checkWebappRateLimit` (webapp path)
4. Patent number validation
5. KV existence check (avoid redundant writes)
6. `checkDailyWriteGuard` (skip if `testMode`)
7. Parse body
8. Inject `source: "webapp"`
9. KV write (skip if `testMode`)
10. Return 201

---

## PROXY_TOKEN Rotation (SEC-01 — Human UAT Item)

The actual rotation of the live production token cannot be done autonomously (requires Cloudflare auth). The procedure for the human UAT step:

```bash
# 1. Generate a new token (openssl or any CSPRNG)
NEW_TOKEN=$(openssl rand -hex 32)

# 2. Set the new token in the Worker
cd worker
echo "$NEW_TOKEN" | wrangler secret put PROXY_TOKEN

# 3. Update local .dev.vars (or .env at project root) with the new token
# (manual edit — do not commit)

# 4. Rebuild the extension with the new token
PROXY_TOKEN=$NEW_TOKEN npm run build

# 5. Verify: grep must return zero literal token strings
grep -r "$NEW_TOKEN" src/   # should return nothing (it's only in the built dist)
grep -r "4509b9943f" src/   # must return nothing (old token gone)
```

**Verification gate:** `grep -r 'PROXY_TOKEN' src/` must return only `__PROXY_TOKEN__` (the build-time placeholder). The actual token value must not appear anywhere.

---

## Common Pitfalls

### Pitfall 1: CORS preflight returns `*` but actual response returns specific origin

**What goes wrong:** Browser receives `Access-Control-Allow-Origin: *` on the OPTIONS preflight, but then sees `Access-Control-Allow-Origin: https://cite.tonyrowles.com` on the actual GET. Some browsers treat this as a mismatch and block the request.

**How to avoid:** The OPTIONS handler must also check the Origin and reflect it, not fall back to `*` for webapp-accessible routes.

**Warning signs:** CORS errors in browser devtools despite Origin being in the allowlist.

### Pitfall 2: Published-application detection on cleaned input

**What goes wrong:** `cleanPatentNumber('20210123456A1')` returns `'20210123456'` — the kind-code suffix (`A1`) is stripped. If `isPublishedApplication` runs AFTER `cleanPatentNumber`, it can only check for the `20XXXXXXXXX` format; it cannot detect `10617174A1` (a granted-patent number with kind code A1 appended by mistake, or a legacy numbering collision).

**How to avoid:** `isPublishedApplication` MUST run on the raw input string, before any call to `cleanPatentNumber`. This is locked in CONTEXT.md and confirmed by WRKR-04 requirement text.

**CONTEXT says:** "Published-application rejection runs first (zero-I/O format/kind-code check) before the rate-limit read and before any USPTO fetch."

### Pitfall 3: `wq:` counter increment inside test mode leaks into production KV

**What goes wrong:** CI E2E runs (which hit the live Worker via the extension) would increment `wq:YYYYMMDD` in the real PATENT_CACHE KV namespace. With enough CI runs on a busy day, the daily quota could be hit spuriously.

**How to avoid:** `checkDailyWriteGuard` must accept `testMode` parameter and skip both the check and the increment when `true`. The E2E suite already sets `X-PCT-Test-Mode: true` via `installWorkerTestModeRoute` — this header must suppress the new write-guard path.

### Pitfall 4: esbuild `define` does not affect the worker source (worker is not bundled by esbuild)

**What goes wrong:** `__PROXY_TOKEN__` is only replaced in the extension build via `scripts/build.js`. The Worker (`worker/src/index.js`) gets its `PROXY_TOKEN` from `env.PROXY_TOKEN` (a Wrangler secret binding), NOT from esbuild define. No change needed in the worker source for token injection — the Worker already reads `env.PROXY_TOKEN` at line 526.

**How to avoid:** Confirm that the three source files being modified are all in `src/` (extension), not `worker/src/`. The worker already has proper secret injection via Wrangler.

### Pitfall 5: `Vary: Origin` missing on cached responses

**What goes wrong:** A CDN or edge cache (or even Cloudflare's own cache) could serve a response with `Access-Control-Allow-Origin: https://cite.tonyrowles.com` to an extension request that expects `*`. Without `Vary: Origin`, caches treat the responses as interchangeable.

**How to avoid:** All webapp-route responses (including the 403 and 429 error cases) must include `Vary: Origin`. The `webappCorsHeaders(origin)` helper should always return both the `Access-Control-Allow-Origin` and `Vary: Origin` fields as a unit.

### Pitfall 6: `POST /cache` existence check runs before the write guard, allowing quota escape

**What goes wrong:** If the existence check returns "already cached" (200 early exit), the daily write guard is never checked. This is correct — a cache hit does not consume a KV write. But if the order is inverted (write guard before existence check), a single patent being re-requested many times would consume write guard budget for no-ops.

**How to avoid:** Order for `POST /cache`: existence check first → write guard second → actual write third. The guard only applies to actual new writes.

### Pitfall 7: Origin header spoofing by non-browser clients

**What goes wrong:** Non-browser clients (curl, scripts) can set arbitrary `Origin` headers. A curl request with `Origin: https://cite.tonyrowles.com` would pass the origin check and gain webapp-tier access without a Bearer token.

**Why this is acceptable:** Origin-based auth is explicitly designed for browser-side webapp use. The threat model for this tool is: prevent anonymous public internet abuse of the Worker endpoints (which would exhaust the free-tier KV/CPU quota). A motivated attacker with curl can construct valid Origin headers, but they still face the IP rate limit (30/60s). The webapp's cache POST path also has the daily write guard. For the threat level of this tool (pre-launch personal project), origin-based auth + rate limits is sufficient. The CONTEXT.md decision is locked: no Bearer in browser-side code.

**Mitigation in plan:** Document the threat clearly (see Security Domain section below). Do not over-engineer.

### Pitfall 8: `.gitignore` for root-level `.dev.vars` / `.env`

**What goes wrong:** A developer creates `.dev.vars` or `.env` at the project root for local builds. Without a gitignore entry, it gets committed, exposing the rotated token immediately.

**How to avoid:** The current `.gitignore` has `worker/.dev.vars` but NOT a root-level `.dev.vars` or `.env` entry. Phase 6 must add both.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Compile-time constant substitution | String replace scripts, commit-time sed transforms | esbuild `define` option | Already installed; one config field; survives bundling; tree-shaking compatible |
| KV counter atomicity | Lua scripts, compare-and-swap loops | 100-write safety margin (design decision) | Workers KV has no atomic ops; the margin is the mitigation |
| Origin allowlist management | Env-var parsing, CIDR matching | Fixed two-item array literal | Deferred per CONTEXT.md; simpler = fewer bugs |
| Wrangler secret management | Custom secret rotation scripts | `wrangler secret put PROXY_TOKEN` | Official Wrangler API; handles key propagation to all edge nodes |

---

## Runtime State Inventory

> This phase modifies secret values stored in Cloudflare's secret binding system. The runtime state below is relevant.

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | `PATENT_CACHE` KV: existing cache entries keyed `v4:{patentNumber}` will remain valid | Code edit only — the cache format does not change |
| Live service config | `worker/.dev.vars`: contains the old `PROXY_TOKEN` literal (`4509b9943f...`) | Human step: overwrite with new rotated token after `wrangler secret put` |
| OS-registered state | None | None |
| Secrets/env vars | `env.PROXY_TOKEN` Wrangler secret (Cloudflare edge) — currently holds the compromised token | Human UAT: `wrangler secret put PROXY_TOKEN` with new value |
| Build artifacts | `dist/chrome/` and `dist/firefox/` contain bundles with the old token embedded | Rebuilt automatically by `npm run build` with new PROXY_TOKEN; old `dist/` cleaned on each build |

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest + @cloudflare/vitest-pool-workers 0.16.6 (worker tests) |
| Config file | `worker/vitest.config.js` |
| Quick run command | `cd worker && npm test` |
| Full suite command | `npm test` (root — runs src + chrome + firefox + lint + worker) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SEC-01 | No literal token in `src/` after build | Static grep | `grep -rn "4509b9943f" src/` exits non-zero | Shell command (no file) |
| SEC-02 | `__PROXY_TOKEN__` in source; token injected from env | Build smoke | `PROXY_TOKEN=smoke npm run build && grep -c "smoke" dist/chrome/offscreen/offscreen.js` | No test file — Wave 0 gap |
| SEC-03 | Webapp auth via Origin; no Bearer in webapp | Static grep (future webapp) | N/A this phase (webapp is Phase 8) | N/A |
| SEC-04 | 31st webapp request → 429 | Worker integration | `cd worker && npm test` (new test) | No — Wave 0 gap |
| SEC-05 | 901st cache POST → 503 | Worker integration | `cd worker && npm test` (new test) | No — Wave 0 gap |
| WRKR-01 | `GET /webapp/pdf` with valid Origin → proxies PDF | Worker integration | `cd worker && npm test` (new test) | No — Wave 0 gap |
| WRKR-02 | `GET /cache` with Bearer → 200; with Origin → 200; with neither → 401/403 | Worker integration | `cd worker && npm test` (new test) | No — Wave 0 gap |
| WRKR-03 | `POST /cache` with Origin → payload has `source:"webapp"` | Worker integration | `cd worker && npm test` (new test) | No — Wave 0 gap |
| WRKR-04 | `20210123456A1` → 400; `12505414B2` → pass | Worker integration | `cd worker && npm test` (new test) | No — Wave 0 gap |

### Sampling Rate

- **Per task commit:** `cd worker && npm test`
- **Per wave merge:** `npm test` (full suite from root)
- **Phase gate:** Full suite green before moving to Phase 7

### Wave 0 Gaps

New test file needed: `worker/tests/security-gate.test.js`

Covers: WRKR-01, WRKR-02, WRKR-03, WRKR-04, SEC-04, SEC-05. Pattern mirrors `worker/tests/test-mode.test.js` (imports `{ env }` from `cloudflare:workers`, uses `createExecutionContext`, sends requests to `worker` object).

Key test isolation notes (from existing `report-route.test.js` pattern):
- Use distinct patent numbers per describe block to avoid cross-test dedup collisions
- Use distinct IPs per describe block to avoid rate-limit state collisions
- Miniflare KV is shared within a test file — tests that fill the write guard must use isolated key dates or reset state

The miniflare `bindings` in `worker/vitest.config.js` already injects `PROXY_TOKEN: 'test-token'`. The new test file does not need to change the vitest config.

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | Yes — Worker verifies caller identity | Bearer token (extension) + Origin header (webapp) |
| V3 Session Management | No — stateless request auth | — |
| V4 Access Control | Yes — per-route auth requirements | Per-route `resolveAuth` checks |
| V5 Input Validation | Yes — `patentNumber` format, Origin allowlist, body size | Existing regex guards + `isPublishedApplication` + body size check |
| V6 Cryptography | No — `PROXY_TOKEN` is a bearer secret, not a cryptographic key | — |

### Threat Model for Origin-Authed Public Routes

Opening Origin-authenticated routes introduces the following threats that the plan must address:

| Threat | STRIDE | Mitigation in Plan |
|--------|--------|--------------------|
| Non-browser clients spoofing `Origin` header (curl, scripts) | Spoofing | Per-IP rate limit (30/60s) makes automated abuse expensive; daily write guard caps KV quota exhaustion; acceptable residual risk for v1 (see Pitfall 7 above) |
| Rate-limit evasion by rotating source IPs | Elevation of Privilege | IP-based limit uses `CF-Connecting-IP` (Cloudflare's egress IP, harder to spoof than client IP headers); at free-tier scale this is sufficient |
| Cache poisoning via webapp `POST /cache` | Tampering | `source: "webapp"` provenance tag; existence check prevents overwrite of extension-computed entries; daily write guard limits blast radius; no content validation of position map structure (out of scope — same as existing extension uploads) |
| CORS bypass by non-browser clients | Spoofing | Origin auth is explicitly NOT a security boundary against non-browser clients; rate limits are the backstop |
| KV quota exhaustion via webapp `POST /cache` flood | Denial of Service | Daily write guard (900/day) is the hard cap; per-IP rate limit (30/60s) slows the attack |
| Published-application numbers generating misleading citations | Tampering | `isPublishedApplication` zero-I/O guard at Worker level → HTTP 400; rejected before any USPTO fetch |

**Accepted residual risk:** A curl attacker with a valid Origin header can send up to 30 req/60s before being rate-limited, and up to 900 cache writes/day before the guard triggers. This is sufficient protection for a pre-launch personal project at v1; hardening via Cloudflare Rate Limiting rules is a deferred v2 item.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | `npm run build` (esbuild) | ✓ | 22 (CI matrix) | — |
| esbuild | Token injection in build | ✓ | 0.27.3 | — |
| wrangler (worker) | Worker deploy + `secret put` | ✓ | 4.93.0 | — |
| Cloudflare account auth | `wrangler secret put` (rotation) | Human-only | — | Human UAT step |
| PROXY_TOKEN GitHub secret | CI build step | NOT YET SET | — | Human creates in GitHub repo settings before merging |

**Missing dependencies with no fallback:**
- `PROXY_TOKEN` GitHub Actions secret: must be created by the repo owner before the CI build step can inject the token. This is a human prerequisite step for Phase 9 UAT (when the rotated token goes live), but the CI build will fail immediately on the next push after the code change unless the secret is pre-created.

**Recommendation:** Add creating the GitHub Actions secret as the first task in the Phase 6 plan, as a `checkpoint:human-verify` before the build pipeline changes land.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | KV non-atomic increment is the documented behavior for Cloudflare Workers KV (not a Workers KV Durable Objects pattern) | Daily Write Guard | If Workers KV gained atomic increment in a recent update, the 100-write buffer is still safe but the implementation note would be inaccurate |
| A2 | Cloudflare's CDN/cache layer respects `Vary: Origin` and does not cache the origin-specific responses across origins | CORS Vary section | A Cloudflare cache misconfiguration could serve wrong-origin CORS headers; mitigated by the fact that Worker responses are not typically cached unless `Cache-Control` is set (not set in this Worker) |
| A3 | `CF-Connecting-IP` is the correct Cloudflare header for the client's actual IP (not `X-Forwarded-For`) | Rate Limiting | If the header changed in a recent Cloudflare update, rate limiting would fail to key on IP (all requests would share `'unknown'` as key) |

---

## Open Questions

1. **Root-level `.dev.vars` vs `.env` naming**
   - What we know: `worker/.dev.vars` exists and is gitignored; project root has no such file yet
   - What's unclear: Should the local token file be named `.dev.vars` (matching the worker convention) or `.env` (common Node.js convention)?
   - Recommendation: Name it `.env` at the project root (aligns with `process.env.PROXY_TOKEN` reading pattern in `scripts/build.js`); add `.env` to root `.gitignore`

2. **`POST /cache` from webapp: should the existing `extension` source be tagged retroactively?**
   - What we know: Existing cache entries from the extension have no `source` field
   - What's unclear: Whether the Worker should inject `source: "extension"` on Bearer POST /cache calls (symmetric with `source: "webapp"`)
   - Recommendation: Do NOT add `source: "extension"` retroactively — CONTEXT.md only requires `source: "webapp"` (WRKR-03); extension-uploaded entries pre-date this field and the absence of `source` implicitly means "extension"

3. **`GET /cache` response CORS headers when called by the webapp**
   - What we know: The webapp will call `GET /cache` with Origin auth; the response must have the reflected origin CORS headers
   - What's unclear: What if the cached entry doesn't exist (404)? The 404 response also needs CORS headers, or the browser gets an opaque error.
   - Recommendation: All responses on Origin-auth paths, including 404 and 503, must include `webappCorsHeaders(auth.origin)` + `Vary: Origin`

---

## Sources

### Primary (HIGH confidence)
- `worker/src/index.js` — complete live codebase read [VERIFIED: Read tool]
- `scripts/build.js` — complete live codebase read [VERIFIED: Read tool]
- `src/offscreen/offscreen.js`, `src/firefox/pdf-pipeline.js`, `src/shared/report-transport.js` — token literal positions confirmed [VERIFIED: Read tool]
- `worker/vitest.config.js`, `worker/tests/*.test.js` — test patterns confirmed [VERIFIED: Read tool]
- `.github/workflows/ci.yml` — CI build pipeline confirmed [VERIFIED: Read tool]
- esbuild `define` option — live-tested via Bash tool transform call [VERIFIED: Bash tool]
- `isPublishedApplication` regex — tested against 9 cases via Bash tool [VERIFIED: Bash tool]

### Secondary (MEDIUM confidence)
- KV non-atomic read-modify-write behavior — inferred from existing `checkIpRateLimit` pattern which uses the same pattern without atomicity concerns [ASSUMED: Cloudflare docs not re-verified this session]
- `CF-Connecting-IP` header availability in Workers — inferred from existing `handleReport` usage at line 422 [VERIFIED: codebase analysis]
- `Vary: Origin` requirement for origin-reflecting CORS — standard browser CORS specification requirement [ASSUMED: training knowledge; high confidence]

---

## Metadata

**Confidence breakdown:**
- Per-route auth split: HIGH — complete worker source read, all logic paths traced
- esbuild define wiring: HIGH — live-tested
- KV rate-limit / write-guard patterns: HIGH — mirrors existing `checkIpRateLimit` pattern exactly
- Published-app detection regex: HIGH — tested against 9 cases
- CORS Vary: Origin requirement: MEDIUM — training knowledge, not re-verified against CF docs
- KV non-atomicity: MEDIUM — inferred from existing code pattern, CF docs not re-fetched

**Research date:** 2026-06-16
**Valid until:** 2026-07-16 (stable platform; esbuild and Workers APIs are stable)

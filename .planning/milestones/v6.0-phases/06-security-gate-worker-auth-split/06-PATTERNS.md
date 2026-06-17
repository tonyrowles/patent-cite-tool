# Phase 6: Security Gate + Worker Auth Split - Pattern Map

**Mapped:** 2026-06-16
**Files analyzed:** 8 new/modified files
**Analogs found:** 8 / 8

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `worker/src/index.js` | service (route handler) | request-response | `worker/src/index.js` itself (existing functions) | exact — self-extension |
| `scripts/build.js` | config / build pipeline | transform | `scripts/build.js` itself (existing esbuild configs) | exact — self-extension |
| `src/offscreen/offscreen.js` | utility (token consumer) | request-response | `src/firefox/pdf-pipeline.js` | exact role-match |
| `src/firefox/pdf-pipeline.js` | utility (token consumer) | request-response | `src/offscreen/offscreen.js` | exact role-match |
| `src/shared/report-transport.js` | service (token consumer) | request-response | `src/offscreen/offscreen.js` | role-match |
| `.github/workflows/ci.yml` | config / CI pipeline | batch | `.github/workflows/ci.yml` itself | exact — self-extension |
| `.gitignore` | config | — | `.gitignore` itself | exact — self-extension |
| `worker/tests/security-gate.test.js` | test | request-response | `worker/tests/test-mode.test.js` | exact |

---

## Pattern Assignments

### `worker/src/index.js` — new helper functions and route restructure

**Analog:** `worker/src/index.js` (existing `checkIpRateLimit`, `handleReport`, global Bearer gate, `corsHeaders`)

---

#### A. `checkIpRateLimit` — rate-limit helper pattern to mirror (lines 262–273)

```javascript
async function checkIpRateLimit(env, clientIp) {
  const key = `rl:${clientIp}`;
  const countStr = await env.BUG_REPORTS.get(key);
  const count = countStr ? parseInt(countStr, 10) : 0;

  if (count >= 5) {
    return { allowed: false };
  }

  // Increment counter; reset TTL on each request within the window
  await env.BUG_REPORTS.put(key, String(count + 1), { expirationTtl: 60 });
  return { allowed: true };
}
```

**New `checkWebappRateLimit` copies this exactly.** Change: key prefix `wrl:` (not `rl:`), threshold 30 (not 5), namespace `env.BUG_REPORTS` (same), add `testMode` parameter to suppress write in CI (see testMode pattern below).

---

#### B. `checkAndHandleDuplication` — testMode parameter pattern (lines 285, 307–312)

```javascript
async function checkAndHandleDuplication(env, fingerprint, now, testMode = false) {
  // ...
  if (!testMode) {
    await env.BUG_REPORTS.put(mostRecent.name, JSON.stringify(existing), {
      expirationTtl: 7776000,
    });
  }
  // ...
}
```

**New `checkDailyWriteGuard` and `checkWebappRateLimit` copy this `testMode = false` default parameter + `if (!testMode)` write suppression pattern exactly.**

---

#### C. Global Bearer auth gate to be split (lines 524–534)

```javascript
// 2. Bearer token validation
const authHeader = request.headers.get('Authorization') || '';
if (authHeader !== `Bearer ${env.PROXY_TOKEN}`) {
  return new Response('Unauthorized', {
    status: 401,
    headers: {
      ...corsHeaders(),
      'Content-Type': 'text/plain',
    },
  });
}
```

**This global gate is removed.** The new `resolveAuth(request, env)` helper replaces it. Each route handler applies its own auth requirement (bearer-only, origin-only, or either). The 401 response structure above is the template for auth-failure responses on Bearer-only routes.

---

#### D. `corsHeaders()` — wildcard CORS helper to extend (lines 28–31)

```javascript
function corsHeaders() {
  return { 'Access-Control-Allow-Origin': '*' };
}
```

**New `webappCorsHeaders(origin)` is an additive companion** that returns `{ 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin' }`. The existing `corsHeaders()` is kept unchanged for Bearer/extension routes.

---

#### E. OPTIONS preflight handler (lines 511–522)

```javascript
if (request.method === 'OPTIONS') {
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(),
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-PCT-Test-Mode',
      'Access-Control-Max-Age': '86400',
    },
  });
}
```

**The OPTIONS handler is updated** to check the incoming Origin header via the new `matchOrigin(request)` helper. If Origin matches the allowlist, reflect it (spread `webappCorsHeaders(origin)` instead of `corsHeaders()`). If not, fall back to `corsHeaders()`. The `Access-Control-Allow-Headers` value is unchanged.

---

#### F. `handleReport` — cheapest-first operation ordering (lines 403–498 comments)

```javascript
// Cheapest-first operation ordering (RESEARCH Pattern 6):
//   1. Body size check — zero I/O
//   2. IP rate limit — one KV read
//   3. JSON parse
//   4. Required-field validation
//   5. Fingerprint computation
//   6. Dedup check
//   7. KV write (canonical)
//   8. Return 201; Discord via ctx.waitUntil() (best-effort)
```

**All new route handlers follow the same cheapest-first ordering.** For patent routes: published-app check (zero-I/O, runs FIRST) → auth check → rate-limit → validation → KV existence check → daily write guard → KV write.

---

#### G. testMode detection (line 460)

```javascript
const testMode = request.headers.get('X-PCT-Test-Mode') === 'true';
```

**Copy this line verbatim** at the start of each new route handler. Pass `testMode` to `checkWebappRateLimit` and `checkDailyWriteGuard`.

---

#### H. POST /cache write path with testMode guard (lines 582–622)

```javascript
if (request.method === 'POST') {
  // Existence check before write (CACH-04: protect KV write quota)
  const existing = await env.PATENT_CACHE.get(key);
  if (existing !== null) {
    return new Response('Already cached', { status: 200, headers: { ...corsHeaders(), 'Content-Type': 'text/plain' } });
  }

  let payload;
  try {
    payload = await request.json();
  } catch (_) {
    return new Response('Invalid JSON body', { status: 400, headers: { ...corsHeaders(), 'Content-Type': 'text/plain' } });
  }

  // INJ-01: X-PCT-Test-Mode header suppresses KV write
  if (request.headers.get('X-PCT-Test-Mode') !== 'true') {
    await env.PATENT_CACHE.put(key, JSON.stringify(payload));
  }
  return new Response('Cached', { status: 201, headers: { ...corsHeaders(), 'Content-Type': 'text/plain' } });
}
```

**The new POST /cache webapp path inserts two additional steps** after the existence check and before the KV write: (1) `checkDailyWriteGuard(env, testMode)` — return 503 if over 900; (2) inject `payload.source = 'webapp'` when `auth.method === 'origin'`. The testMode check on the `env.PATENT_CACHE.put` call is migrated to live inside `checkDailyWriteGuard`.

---

#### I. URL parse / route dispatch pattern (lines 537–542)

```javascript
// 3. Route dispatch — parse URL once for all routes
const url = new URL(request.url);
const path = url.pathname;

// Cache routes: GET /cache (read) and POST /cache (write with existence check)
if (path === '/cache') {
```

**Keep the single `new URL(request.url)` parse.** Add new route branches for `path === '/webapp/pdf'`. The `GET /` (USPTO proxy) handler becomes a branch for bearer-only callers; the `GET /webapp/pdf` handler is the origin-only parallel.

---

#### J. Rate-limit 429 response shape (lines 425–433 in handleReport)

```javascript
return new Response('Too Many Requests', {
  status: 429,
  headers: {
    ...corsHeaders(),
    'Content-Type': 'text/plain',
    'Retry-After': '60',
  },
});
```

**Copy this structure for webapp rate-limit 429 responses.** Replace `...corsHeaders()` with `...webappCorsHeaders(auth.origin)` on Origin-auth paths. The `Retry-After: 60` value is unchanged.

---

### `scripts/build.js` — esbuild `define` injection

**Analog:** `scripts/build.js` itself (existing esbuild config functions at lines 32–61 and 118–147)

---

#### A. Existing esbuild config function shape (lines 32–41)

```javascript
function getIifeConfig({ sourcemap = false } = {}) {
  return {
    entryPoints: ['src/content/content-script.js'],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    outfile: 'dist/chrome/content/content.js',
    sourcemap,
  };
}
```

**Add `define` as one new field** to each of the four config functions (`getIifeConfig`, `getEsmConfig`, `getFirefoxIifeConfig`, `getFirefoxEsmConfig`):

```javascript
define: {
  '__PROXY_TOKEN__': JSON.stringify(PROXY_TOKEN),
},
```

---

#### B. Build entry guard pattern — add BEFORE the config functions

```javascript
// Existing arg parsing pattern (lines 23–26):
const args = process.argv.slice(2);
const watchMode = args.includes('--watch');
```

**Insert the token guard immediately after the arg-parsing block** (before the first config function):

```javascript
const PROXY_TOKEN = process.env.PROXY_TOKEN;
if (!PROXY_TOKEN) {
  console.error('ERROR: PROXY_TOKEN environment variable is not set. Build aborted.');
  process.exit(1);
}
```

---

#### C. `main()` error-exit pattern (lines 277–280)

```javascript
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

**The guard's `process.exit(1)` mirrors this existing pattern** — hard failures always exit non-zero so CI catches them.

---

### `src/offscreen/offscreen.js`, `src/firefox/pdf-pipeline.js`, `src/shared/report-transport.js` — token literal replacement

**Analog:** All three files are analogs of each other. The change is identical in all three.

---

#### A. Current literal to replace

`src/offscreen/offscreen.js` line 24:
```javascript
const PROXY_TOKEN = '4509b9943f831fb140eb0c3a7304f23cc6f72e41b5e5f8c800a42e94f09cadbe';
```

`src/firefox/pdf-pipeline.js` line 23:
```javascript
const PROXY_TOKEN = '4509b9943f831fb140eb0c3a7304f23cc6f72e41b5e5f8c800a42e94f09cadbe';
```

`src/shared/report-transport.js` line 27:
```javascript
const PROXY_TOKEN = '4509b9943f831fb140eb0c3a7304f23cc6f72e41b5e5f8c800a42e94f09cadbe';
```

---

#### B. Replacement pattern (identical in all three)

```javascript
// Token injected at build time by esbuild define (SEC-02). Never a literal.
const PROXY_TOKEN = __PROXY_TOKEN__;
```

No other changes to any of the three files. The `const PROXY_TOKEN` name is preserved so every downstream usage of `PROXY_TOKEN` in the same file continues to work unchanged.

---

### `.github/workflows/ci.yml` — build step env wiring

**Analog:** `.github/workflows/ci.yml` lines 89–96 (existing `env:` block on Attach assets step)

```yaml
- name: Attach assets to GitHub release
  if: success() && inputs.tag
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  run: |
    gh release upload "${{ inputs.tag }}" ...
```

**Copy the `env:` key block pattern** onto the Build step (line 44–45):

```yaml
- name: Build (Chrome + Firefox)
  env:
    PROXY_TOKEN: ${{ secrets.PROXY_TOKEN }}
  run: npm run build
```

No other changes to the workflow. The `env:` block is step-scoped, matching the existing convention.

---

### `.gitignore` — root-level secret file entries

**Analog:** `.gitignore` line 3 (existing `worker/.dev.vars` entry)

```
worker/.dev.vars
```

**Add two new entries** for the root-level local-dev token files:

```
.dev.vars
.env
```

These mirror the existing `worker/.dev.vars` convention. Place them adjacent to the existing entry.

---

### `worker/tests/security-gate.test.js` — new integration test file

**Analog:** `worker/tests/test-mode.test.js` (exact structure match) and `worker/tests/report-route.test.js` (IP isolation pattern)

---

#### A. Imports and boilerplate (test-mode.test.js lines 14–18)

```javascript
import { env } from 'cloudflare:workers';
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../src/index.js';
```

**Copy verbatim.** No additional imports needed — the worker object and cloudflare:test helpers cover all cases.

---

#### B. Test token constant (test-mode.test.js line 19)

```javascript
const TEST_TOKEN = 'test-token'; // must match miniflare.bindings.PROXY_TOKEN
```

**Copy verbatim.** The vitest.config.js bindings inject `PROXY_TOKEN: 'test-token'` — this constant must match.

---

#### C. Request factory function pattern (test-mode.test.js lines 23–30)

```javascript
function makeRequest({ withTestMode }) {
  const headers = {
    'Authorization': `Bearer ${TEST_TOKEN}`,
    'Content-Type': 'application/json',
  };
  if (withTestMode) headers['X-PCT-Test-Mode'] = 'true';
  return new Request(URL_BASE, { method: 'POST', headers, body: BODY });
}
```

**New test file needs multiple request factory functions**, one per route variant:

```javascript
// Origin-auth request factory (for webapp routes)
function makeOriginRequest(path, { ip = '10.1.0.1', testMode = false } = {}) {
  const headers = {
    'Origin': 'https://cite.tonyrowles.com',
    'CF-Connecting-IP': ip,
  };
  if (testMode) headers['X-PCT-Test-Mode'] = 'true';
  return new Request(`https://worker.example.com${path}`, { headers });
}

// Bearer-auth request factory (for extension routes — unchanged behavior)
function makeBearerRequest(path, { ip = '10.2.0.1', method = 'GET' } = {}) {
  return new Request(`https://worker.example.com${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${TEST_TOKEN}`,
      'CF-Connecting-IP': ip,
    },
  });
}
```

---

#### D. Describe block + test invocation pattern (test-mode.test.js lines 32–59)

```javascript
describe('POST /cache — X-PCT-Test-Mode header guard (INJ-01)', () => {
  it('with X-PCT-Test-Mode: true → returns 201 "Cached" AND does NOT write to KV', async () => {
    const ctx = createExecutionContext();
    const response = await worker.fetch(makeRequest({ withTestMode: true }), env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(201);
    expect(await response.text()).toBe('Cached');

    const listed = await env.PATENT_CACHE.list();
    expect(listed.keys).toEqual([]);
  });
```

**Copy this three-line fetch+await pattern exactly** for every test:

```javascript
const ctx = createExecutionContext();
const response = await worker.fetch(request, env, ctx);
await waitOnExecutionContext(ctx);
```

---

#### E. KV isolation via unique keys (report-route.test.js lines 29–47)

```javascript
// Unique patent numbers per describe group — prevents cross-test dedup collisions
const PATENT_VALID       = '12505001';
const PATENT_DEDUP       = '12505002';
// ...
// Unique IPs per describe group — prevents cross-test rate-limit collisions
const IP_VALID           = '10.0.0.1';
const IP_VALIDATION      = '10.0.0.2';
```

**security-gate.test.js must declare distinct patent numbers and IPs per describe block** to avoid KV state collisions across tests. Miniflare KV is shared within the test file.

For the rate-limit exhaustion test (WRKR-01/SEC-04): use a dedicated IP constant (e.g. `IP_RATELIMIT_WEBAPP = '10.9.0.1'`) so sending 31 requests exhausts that IP's counter without affecting other describe blocks.

For the daily write guard test (SEC-05): the `wq:YYYYMMDD` key will be written during the test run. Use `X-PCT-Test-Mode: true` on all other POST /cache tests that don't specifically test the write guard to prevent them from consuming guard budget. For the guard-exhaustion test itself, do NOT use testMode — let it write up to the threshold and verify the 503.

---

## Shared Patterns

### testMode suppression
**Source:** `worker/src/index.js` line 460 and `checkAndHandleDuplication` lines 307–312
**Apply to:** `checkWebappRateLimit`, `checkDailyWriteGuard`, new POST /cache webapp write path

```javascript
// Detection (in the route handler, before calling helpers):
const testMode = request.headers.get('X-PCT-Test-Mode') === 'true';

// In helpers — suppress the KV write but allow the check to proceed (or skip entirely):
if (!testMode) {
  await env.NAMESPACE.put(key, value, { expirationTtl: TTL });
}
```

### CORS header spread pattern
**Source:** `worker/src/index.js` throughout (e.g. lines 408–410, 574–579)
**Apply to:** Every `new Response(...)` in every route handler

```javascript
// Extension/Bearer routes — wildcard origin:
headers: { ...corsHeaders(), 'Content-Type': 'text/plain' }

// Webapp/Origin routes — reflected specific origin:
headers: { ...webappCorsHeaders(auth.origin), 'Content-Type': 'text/plain' }
```

The `webappCorsHeaders` helper must always be called with `auth.origin` (the already-validated string from `resolveAuth`). Never call it with an unchecked header value.

### CF-Connecting-IP extraction
**Source:** `worker/src/index.js` line 422 (in `handleReport`)
**Apply to:** `GET /webapp/pdf`, `GET /cache` (origin path), `POST /cache` (origin path)

```javascript
const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
```

### Error response structure
**Source:** `worker/src/index.js` lines 527–533 (401), 425–433 (429), 545–557 (400)
**Apply to:** All new route handlers

```javascript
// 401 (no auth):
return new Response('Unauthorized', { status: 401, headers: { ...corsHeaders(), 'Content-Type': 'text/plain' } });

// 403 (origin required but missing):
return new Response('Forbidden', { status: 403, headers: { ...corsHeaders(), 'Content-Type': 'text/plain' } });

// 429 (rate limited):
return new Response('Too Many Requests', { status: 429, headers: { ...corsHeaders(), 'Content-Type': 'text/plain', 'Retry-After': '60' } });

// 503 (write guard exceeded):
return new Response('Service Unavailable', { status: 503, headers: { ...corsHeaders(), 'Content-Type': 'text/plain' } });
```

On webapp/Origin paths, replace `...corsHeaders()` with `...webappCorsHeaders(auth.origin)` in all these responses.

### `cleanPatentNumber` call order
**Source:** `worker/src/index.js` line 44 (`cleanPatentNumber`), CONTEXT.md "Published-application rejection runs first"
**Apply to:** `GET /webapp/pdf`, `GET /cache`, `POST /cache`, `GET /`

```javascript
// CORRECT order — raw string goes to isPublishedApplication BEFORE cleaning:
const rawPatent = url.searchParams.get('patent') || '';
if (isPublishedApplication(rawPatent)) {
  return new Response('Published application numbers are not supported', { status: 400, ... });
}
const patentNumber = cleanPatentNumber(rawPatent);
```

Never call `isPublishedApplication` on the output of `cleanPatentNumber` — the kind-code suffix is stripped by `cleanPatentNumber` and the check becomes unreliable.

---

## No Analog Found

All files have close analogs. No entries in this section.

---

## Metadata

**Analog search scope:** `worker/src/`, `worker/tests/`, `scripts/`, `src/offscreen/`, `src/firefox/`, `src/shared/`, `.github/workflows/`
**Files scanned:** 10 source files read directly
**Pattern extraction date:** 2026-06-16

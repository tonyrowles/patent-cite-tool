# Phase 30: Worker Fault-Injection — Research

**Researched:** 2026-05-15
**Domain:** Cloudflare Workers testing (@cloudflare/vitest-pool-workers) + Playwright network interception for fault injection
**Confidence:** HIGH for Worker integration test; MEDIUM-HIGH for fault-injection E2E (one open risk on page.route scope)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**X-PCT-Test-Mode header contract**
- KV writes only are skipped. Cache reads (/cache GET) remain identical. USPTO API calls remain identical.
- Checked at every `env.PATENT_CACHE.put()` call site in `worker/src/index.js` (currently one, POST /cache ~line 229).
- Wrap pattern:
  ```javascript
  if (req.headers.get('X-PCT-Test-Mode') !== 'true') {
    await env.PATENT_CACHE.put(key, JSON.stringify(payload));
  }
  ```
- Response semantics unchanged — still returns 201 "Cached".
- Routes affected: all write routes (currently only /cache POST).
- Default behavior (header absent): identical to today.

**Worker integration test**
- Framework: `@cloudflare/vitest-pool-workers`.
- Location: `worker/tests/test-mode.test.js`
- Config: `worker/vitest.config.js` with `cloudflareTest()` plugin + wrangler.toml path.
- Assertion: After Worker call with `X-PCT-Test-Mode: true`, assert `env.PATENT_CACHE.list().keys` equals `[]`.
- CI integration: Add to existing `npm run test` script chain (no new GHA workflow).

**Fault-injection E2E spec**
- Patent: `US11427642-spec-short-1` (baseline: `1:26-27`, confidence 0.98).
- Route abort: `page.route('https://patentimages.storage.googleapis.com/**', route => route.abort())`.
- Spec file: `tests/e2e/specs/fault-injection.spec.js` (new, single case, sequential).
- Pass criteria: citation matches golden baseline AND verifier passes Tier-A/B/C.
- Header injection: `page.route` to intercept Worker call and inject `X-PCT-Test-Mode: true`.
- No changes to extension code.

**Nightly cron + error taxonomy**
- Add step to `.github/workflows/e2e-nightly.yml` AFTER regression step.
- `continue-on-error: true` matching regression step.
- New error class: `WORKER_FALLBACK_FAILED` in `tests/e2e/lib/error-codes.js`.
- Retries: 0 — not FLAKE-eligible.
- Runs every nightly tick (not weekday-rotated).

### Claude's Discretion
- Exact name/path of the helper that wires the `page.route` interception.
- Exact wording of the error class display in the issue body.
- Whether to add a smoke-tag (`@fault-injection`) to allow targeted local runs.
- Whether the Worker test file imports `worker/src/index.js` via `SELF` binding or via wrangler service binding.

### Deferred Ideas (OUT OF SCOPE)
- LLM exploratory mode — Phase 31.
- USPTO API contract testing beyond test-mode header — v3.1+.
- KV quota / cost monitoring — v3.1+.
- Worker structured logging / observability — v3.1+.
- Multi-region Worker routing — out of scope.
- Fault-injection for additional failure modes (timeout, 429, malformed JSON) — v3.1+.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INJ-01 | Worker `X-PCT-Test-Mode: true` header causes KV write skip without changing response semantics | Worker change + `@cloudflare/vitest-pool-workers` integration test confirm the skip via `env.PATENT_CACHE.list()` assertion |
| INJ-02 | Fault-injection E2E aborts Google PDF fetch, asserts USPTO fallback produces accurate citation matching golden baseline + verifier passes | Playwright `page.route` for abort + header injection; `US11427642-spec-short-1` is already a smoke case with confirmed baseline; verifier integration from regression.spec.js pattern |
</phase_requirements>

---

## Summary

Phase 30 has two independent deliverables linked by the `X-PCT-Test-Mode` header contract. The first (INJ-01) is a Worker integration test: `worker/src/index.js` gains a header guard around the single `env.PATENT_CACHE.put()` call site, and a `@cloudflare/vitest-pool-workers` integration test verifies the guard by calling the Worker with the header set and asserting `env.PATENT_CACHE.list().keys` is empty. The second (INJ-02) is a Playwright fault-injection spec that route-aborts the Google Patents PDF fetch and drives the extension through the USPTO/Worker fallback, asserting citation accuracy.

The largest technical decision resolved by reading the codebase: the Worker call (`https://pct.tonyrowles.com`) originates from `src/offscreen/offscreen.js` inside the Chrome extension's isolated offscreen document context — NOT from the page context. Playwright's `page.route()` and `context.route()` intercept requests at the CDP layer for the page's browsing context; requests from Chrome extension offscreen documents may or may not be visible to CDP routing depending on Playwright version and Chrome's extension isolation model. This is a MEDIUM risk that must be addressed in the fault-injection spec design — the plan should include a fallback verification step or confirmation that `context.route` does reach the offscreen document context.

The `@cloudflare/vitest-pool-workers` package has undergone a major API change: `defineWorkersConfig` (v3-era) was replaced by the `cloudflareTest()` Vite plugin in v0.13.0. Current version is **0.16.6** which requires **vitest ^4.1.0** — this conflicts with the root project's vitest 3.2.4. The clean resolution is to install vitest@^4.1.0 locally within `worker/` (separate node_modules, no conflict with root).

**Primary recommendation:** Implement the Worker guard + integration test as Plan 30-01 (entirely within `worker/`); implement the fault-injection E2E spec as Plan 30-02; implement error-codes and nightly cron wiring as Plan 30-03.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@cloudflare/vitest-pool-workers` | 0.16.6 | Vitest pool that runs tests inside the Workers runtime (Miniflare) | Official Cloudflare-blessed test framework; provides real KV bindings, isolated per-test storage, no real network calls |
| `vitest` (in `worker/`) | ^4.1.0 | Test runner; required peer dep of vitest-pool-workers 0.16.6 | Same test runner used for root project unit tests; vitest-pool-workers requires v4.x specifically |
| `wrangler` (existing in `worker/`) | ^4.69.0 | Config source for vitest-pool-workers; wrangler.toml integration | Already installed; vitest-pool-workers bundles its own wrangler@4.92.0 internally |
| `miniflare` (bundled) | 4.20260305.0 | Local Workers simulator used by vitest-pool-workers for in-memory KV | Ships with vitest-pool-workers — no separate install needed |
| `@playwright/test` | 1.60.0 (existing) | Playwright test runner for fault-injection E2E spec | Already installed at root |

[VERIFIED: npm registry — `npm view @cloudflare/vitest-pool-workers version` returns 0.16.6; peer dep shows `vitest: "^4.1.0"`]
[VERIFIED: npm registry — `npm view vitest version` returns 4.1.6 (latest)]
[VERIFIED: codebase — root project uses vitest 3.2.4, worker/ uses wrangler@4.69.0]

### Version Conflict: vitest 3.x (root) vs 4.x (worker required)

`@cloudflare/vitest-pool-workers@0.16.6` declares `"vitest": "^4.1.0"` as a peer dependency. The root project has `vitest: "^3.0.0"` (currently 3.2.4). These cannot coexist in the same `node_modules` tree.

**Resolution:** Install `vitest@^4.1.0` as a devDependency **inside `worker/package.json`** only. Since `worker/` is a separate npm package (its own `package.json`, its own `node_modules` via separate `npm install`), the two vitest versions coexist without conflict. The Worker's `npm test` runs from `worker/` and uses the local vitest@4.x; the root project's `npm test` continues using vitest@3.x. [VERIFIED: `worker/package.json` confirms it is a separate npm package with its own `node_modules`]

### Installation (in `worker/` directory)

```bash
cd worker
npm install --save-dev vitest@^4.1.0 @cloudflare/vitest-pool-workers
```

Expected result: `worker/package.json` gains both deps; `worker/node_modules` contains vitest@4.x alongside existing wrangler.

---

## Architecture Patterns

### Pattern 1: cloudflareTest() vitest.config.js (current API — v0.13.0+)

The `defineWorkersConfig` function used in older tutorials and the CONTEXT.md wording is the v3-era API. Since v0.13.0, the current API is the `cloudflareTest()` Vite plugin. The CONTEXT.md says "defineWorkersConfig pattern" — this is the concept, but the implementation uses `cloudflareTest()`.

**`worker/vitest.config.js`:**

```javascript
// Source: https://developers.cloudflare.com/workers/testing/vitest-integration/get-started/
import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.toml' },
    }),
  ],
});
```

[CITED: https://developers.cloudflare.com/workers/testing/vitest-integration/write-your-first-test/]

### Pattern 2: Worker integration test with env binding + KV assertion

The `cloudflare:workers` virtual module provides `env` with the configured KV namespace (populated from wrangler.toml binding `PATENT_CACHE`). The `cloudflare:test` module provides `createExecutionContext` and `waitOnExecutionContext`.

**`worker/tests/test-mode.test.js`:**

```javascript
// Source: https://developers.cloudflare.com/workers/testing/vitest-integration/test-apis/
import { env } from 'cloudflare:workers';
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../src/index.js';

const TEST_TOKEN = 'test-token';  // must match env.PROXY_TOKEN for auth to pass

describe('POST /cache with X-PCT-Test-Mode: true', () => {
  it('does not write to KV but returns 201', async () => {
    // Arrange: env.PATENT_CACHE is an isolated in-memory KV (Miniflare)
    // Arrange: env.PROXY_TOKEN must match TEST_TOKEN — set via vitest.config miniflare.bindings
    const req = new Request('https://worker.example.com/cache?patent=11427642&v=v3', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TEST_TOKEN}`,
        'Content-Type': 'application/json',
        'X-PCT-Test-Mode': 'true',
      },
      body: JSON.stringify({ entries: [], meta: {} }),
    });
    const ctx = createExecutionContext();

    // Act
    const response = await worker.fetch(req, env, ctx);
    await waitOnExecutionContext(ctx);

    // Assert: same 201 response as without header
    expect(response.status).toBe(201);
    expect(await response.text()).toBe('Cached');

    // Assert: KV was NOT written
    const listed = await env.PATENT_CACHE.list();
    expect(listed.keys).toEqual([]);
  });

  it('without header, writes to KV and returns 201', async () => {
    const req = new Request('https://worker.example.com/cache?patent=11427642&v=v3', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TEST_TOKEN}`,
        'Content-Type': 'application/json',
        // No X-PCT-Test-Mode header
      },
      body: JSON.stringify({ entries: [], meta: {} }),
    });
    const ctx = createExecutionContext();
    const response = await worker.fetch(req, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(201);
    const listed = await env.PATENT_CACHE.list();
    expect(listed.keys.length).toBe(1);
  });
});
```

**Env binding for PROXY_TOKEN:** The test needs `env.PROXY_TOKEN` to match the `Bearer` token used in the test request. Since `PROXY_TOKEN` is a secret (not in `wrangler.toml`), inject it via `vitest.config.js` miniflare bindings:

```javascript
cloudflareTest({
  wrangler: { configPath: './wrangler.toml' },
  miniflare: {
    bindings: {
      PROXY_TOKEN: 'test-token',
      USPTO_API_KEY: 'test-api-key', // needed to avoid undefined env access
    },
  },
})
```

[CITED: https://developers.cloudflare.com/workers/testing/vitest-integration/test-apis/ — `env` object usage and KV operations]
[ASSUMED: the `miniflare.bindings` key injects string bindings into the test env; the cloudflareTest() plugin documentation confirms miniflare key accepts Miniflare v3 options]

### Pattern 3: Fault-injection E2E spec structure (mirroring regression.spec.js)

```javascript
// tests/e2e/specs/fault-injection.spec.js
import { test, expect } from '@playwright/test';
import { loadExtension } from '../lib/extension-loader.js';
import { gotoPatent } from '../lib/navigation.js';
import { selectText } from '../lib/selection.js';
import { getCitation } from '../lib/observation.js';
import { setTriggerMode } from '../lib/settings.js';
import { verifyCitation } from '../lib/pdf-verifier.js';
import { appendCase, reportPathFor } from '../lib/report.js';
import { resolveRunId } from '../lib/run-id.js';
import { WORKER_FALLBACK_FAILED } from '../lib/error-codes.js';
import baseline from '../../golden/baseline.json' with { type: 'json' };

const EXTENSION_PATH = /* resolve dist/chrome */;
const WORKER_URL = 'https://pct.tonyrowles.com';
const CASE_ID = 'US11427642-spec-short-1';
const PATENT_ID = 'US11427642';
const RUN_ID = resolveRunId();
const REPORT_PATH = reportPathFor(RUN_ID);

test.describe('Fault injection — USPTO/Worker fallback path @fault-injection', () => {
  test.describe.configure({ retries: 0 }); // Not FLAKE-eligible

  test('US11427642-spec-short-1 @fault-injection', async () => {
    const { context, page, cleanup } = await loadExtension({ extensionPath: EXTENSION_PATH });
    try {
      // 1. Abort Google Patents PDF asset fetch — forces USPTO fallback
      await page.route('https://patentimages.storage.googleapis.com/**', route => route.abort());

      // 2. Inject X-PCT-Test-Mode: true on Worker calls — prevents KV write pollution
      await page.route(`${WORKER_URL}/**`, async route => {
        const headers = { ...route.request().headers(), 'X-PCT-Test-Mode': 'true' };
        await route.continue({ headers });
      });

      // 3. Same setup as regression.spec.js
      await setTriggerMode(context, 'auto');
      await gotoPatent(page, PATENT_ID);
      await selectText({ page, uniqueSubstring: baseline[CASE_ID].selectedText /* from test-cases */ });
      const observed = await getCitation(page, { mode: 'auto' });

      // 4. Assert citation matches golden baseline
      expect(observed.citation).toBe(baseline[CASE_ID].citation); // '1:26-27'

      // 5. Assert verifier passes
      const verdict = await verifyCitation({
        patentId: PATENT_ID,
        selectedText: /* tc.selectedText */,
        observedCitation: observed.citation,
      });
      expect(['agree'].includes(verdict.status)).toBe(true);

      appendCase(REPORT_PATH, { id: CASE_ID, status: 'passed', errorClass: null, ... });
    } catch (e) {
      appendCase(REPORT_PATH, { id: CASE_ID, status: 'failed', errorClass: WORKER_FALLBACK_FAILED, ... });
      throw e;
    } finally {
      await cleanup();
    }
  });
});
```

[ASSUMED: `page.route` intercepts requests from the Chrome extension's offscreen document — this is the CONTEXT.md locked decision but has an unverified scope risk; see Open Questions]

### Pattern 4: nightly cron integration

The new fault-injection step goes AFTER the "Run E2E regression" step in `.github/workflows/e2e-nightly.yml`:

```yaml
- name: Run fault-injection spec
  id: fault_injection
  continue-on-error: true
  run: |
    npx playwright test \
      --config tests/e2e/playwright.config.js \
      specs/fault-injection.spec.js
  # Runs regardless of regression outcome — separate failure domain.
  # continue-on-error: true matches regression step pattern.
```

### Recommended Project Structure (new files only)

```
worker/
├── vitest.config.js          # NEW — cloudflareTest() plugin config
├── tests/
│   └── test-mode.test.js     # NEW — KV write-skip integration test (INJ-01)
tests/e2e/
└── specs/
    └── fault-injection.spec.js  # NEW — route-abort + USPTO fallback E2E (INJ-02)
tests/e2e/lib/
└── error-codes.js            # MODIFIED — add WORKER_FALLBACK_FAILED
.github/workflows/
└── e2e-nightly.yml           # MODIFIED — add fault-injection step
```

### Anti-Patterns to Avoid

- **Using `defineWorkersConfig` or `defineWorkersProject`:** These are the v3-era API. Current `@cloudflare/vitest-pool-workers` uses `cloudflareTest()` Vite plugin. [VERIFIED: Cloudflare CHANGELOG — replaced in v0.13.0]
- **Installing `vitest@^4.1.0` in the root `package.json`:** Would break existing vitest@3.x tests. Install only in `worker/package.json`.
- **Calling real USPTO ODP in the Worker integration test:** `@cloudflare/vitest-pool-workers` runs in Miniflare; outbound network calls are blocked by default. Tests that call real USPTO APIs will fail. The test-mode test only needs the POST /cache path (no USPTO call needed).
- **Setting `retries: 2` on the fault-injection spec:** CONTEXT.md explicitly says `retries: 0`, not FLAKE-eligible. A flaky Worker is a real defect.
- **Aborting `patents.google.com/**` instead of `patentimages.storage.googleapis.com/**`:** The abort must target only the PDF asset fetch. Aborting the whole Google Patents domain prevents the page from loading.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| KV isolation per test | Custom KV mock | `@cloudflare/vitest-pool-workers` Miniflare | Miniflare provides real isolated per-test KV with `.list()`, `.put()`, `.get()` matching production semantics exactly |
| Worker execution context in tests | Manual module import + mock env | `cloudflare:workers` `env` + `cloudflare:test` `createExecutionContext` | These virtual modules match the Workers runtime; manual mocks miss `waitUntil` semantics |
| Network abort in Playwright | `fetch` mock in extension | `page.route(...).abort()` | Cleaner test separation; no extension code changes needed |
| Test env secrets | Hard-coded tokens in wrangler.toml | `miniflare.bindings` in vitest.config | Keeps secrets out of committed config; Miniflare injects them at test time |

---

## Worker Call Path: How the Extension Invokes the Worker

This is critical for correctly targeting `page.route` matchers.

**Chrome path (offscreen document):**

`src/offscreen/offscreen.js` contains two Worker-calling functions:

1. **`fetchUsptoWithRetry(patentId)`** — USPTO proxy call:
   ```javascript
   const workerUrl = `${WORKER_URL}?patent=${encodeURIComponent(patentId)}`;
   fetch(workerUrl, { headers: { 'Authorization': `Bearer ${PROXY_TOKEN}` } })
   ```
   Where `WORKER_URL = 'https://pct.tonyrowles.com'` and `PROXY_TOKEN = '4509b9943f831fb140eb0c3a7304f23cc6f72e41b5e5f8c800a42e94f09cadbe'`

2. **`uploadToCache(patentId)`** — KV write call:
   ```javascript
   const url = `${WORKER_URL}/cache?patent=${encodeURIComponent(patentId)}&v=${CACHE_VERSION}`;
   fetch(url, { method: 'POST', headers: { 'Authorization': `Bearer ${PROXY_TOKEN}`, 'Content-Type': 'application/json' } })
   ```

3. **`checkCache(patentId)`** — KV read call:
   ```javascript
   const url = `${WORKER_URL}/cache?patent=${encodeURIComponent(patentId)}&v=${CACHE_VERSION}`;
   fetch(url, { headers: { 'Authorization': `Bearer ${PROXY_TOKEN}` } })
   ```

**Cache version:** `CACHE_VERSION = 'v3'` (hardcoded constant at top of offscreen.js).

**PROXY_TOKEN:** Hardcoded in offscreen.js — no environment variable; same value in all contexts.

**Critical context:** ALL of these calls originate from the Chrome extension's **offscreen document**, which runs in the extension's isolated execution context — NOT in the page's browsing context. This means `page.route()` matchers may or may not reach these requests (see Open Questions).

**Firefox path:** Firefox does not use an offscreen document. `src/firefox/pdf-pipeline.js` (imported by `src/firefox/background.js`) contains the equivalent `checkServerCache`, `fetchUsptoAndParse`, and `uploadToCache` functions. The v3.0 fault-injection test is Chromium-only, so only the offscreen path matters.

[VERIFIED: codebase — `src/offscreen/offscreen.js` lines 23-26 (WORKER_URL, PROXY_TOKEN, CACHE_VERSION), lines 221-224 (fetchUsptoWithRetry), lines 396-406 (uploadToCache), lines 270-284 (checkCache)]

---

## Risks and Edge Cases

### Risk 1 (HIGH): page.route scope — offscreen document isolation

**What:** Chrome extension offscreen documents run in an isolated execution context, separate from the page's browsing context. Playwright's `page.route()` and `context.route()` intercept requests at the CDP (Chrome DevTools Protocol) level for the page's browsing context. The offscreen document's fetch calls may not be visible to CDP routing.

**Impact if materialized:** The Google PDF abort and the `X-PCT-Test-Mode` header injection both fail silently. The test passes because the extension finds the Google PDF (not aborted), never uses the Worker fallback, and the KV is written to (not test-mode-protected).

**Mitigation options:**
1. **Verification step:** In the fault-injection spec, after the test completes, confirm the extension actually took the USPTO path by observing a `MSG.FETCH_USPTO_PDF` message or by checking that the Google PDF was not served (i.e., the offscreen document retried and failed). This can be done via `page.evaluate(() => window.__usptoFallbackUsed__)` if a shim is installed via `addInitScript`, OR by observing that the citation took longer (USPTO path is slower) — but this is fragile.
2. **Confirmed working alternative:** Use `context.route()` instead of `page.route()` — same CDP mechanism, broader scope (all pages in context), but likely still does not reach extension isolated contexts.
3. **Pragmatic verification:** Run a smoke test locally before writing the PLAN — inject an `addInitScript` shim in `loadExtension` that sets `window.__workerRouteIntercepted = true` when the Worker URL is accessed, and assert this flag after the test. If the flag is never set, `page.route` does NOT reach the offscreen document and an alternative approach is needed.

**CONTEXT.md decision is locked:** Use `page.route` for both abort and header injection. The plan should include a verification step that confirms the route handlers actually fired during the test.

### Risk 2 (MEDIUM): KV cache hit during fault-injection test

**What:** The extension checks the KV cache BEFORE attempting to fetch a PDF. If `US11427642` was cached from a previous test run, the extension returns the cached position map and never attempts either a Google PDF fetch or a USPTO fallback. The fault-injection route abort is irrelevant — the test passes trivially without exercising the fallback.

**Impact:** INJ-02 passes but doesn't prove the fallback path works.

**Mitigation:** The `X-PCT-Test-Mode: true` header (once injected on the Worker call) prevents the cache WRITE. But the cache READ (`/cache GET`) is NOT skipped by test mode — by design. If a previous test run wrote to KV, it STAYS in KV. The fault-injection test MUST ensure there is no live cached entry for `US11427642` at the CACHE_VERSION. Options:
- Accept the risk (unlikely in CI where KV is fresh per run — CI doesn't write to production KV since test-mode is now enforced).
- Verify by asserting that the patent took the slow path (timing heuristic) — fragile.
- More robust: the test could first issue `DELETE /cache?patent=...` if the Worker supports it, but it doesn't currently.
- Best option: document this as a known limitation and note that in CI, the production KV is never written to because all E2E tests will use `X-PCT-Test-Mode: true` going forward (after this phase ships).

### Risk 3 (MEDIUM): USPTO ODP API rate-limit during fault-injection

**What:** The test forces the extension through the USPTO fallback path. The USPTO ODP API (`api.uspto.gov`) has rate limits. If nightly tests hit this API frequently, the Worker (which holds the API key) may be throttled.

**Impact:** Nightly cron fails not because of a real bug but because USPTO throttled the request.

**Mitigation:** The fault-injection test runs once per nightly tick with a single patent. This is 1 request per day — well within any reasonable rate limit. Document the risk; no active mitigation needed beyond ensuring the test runs serially after the regression suite. [ASSUMED: USPTO ODP rate limits are per-API-key; one request per day is safe]

### Risk 4 (LOW): Cloudflare Worker auth token in test logs

**What:** The `PROXY_TOKEN` is hardcoded in `src/offscreen/offscreen.js` and is therefore visible in the source code and git history. In test logs, if `page.route` logs request headers, the token appears in CI logs.

**Impact:** The token is already in the public git history (`src/offscreen/offscreen.js` line 25). No new exposure from test logs. The token authenticates to the Worker only — it cannot access KV directly or access the USPTO API key.

**Mitigation:** None needed for Phase 30. The CONTEXT.md scope does not include Worker secret rotation.

### Risk 5 (LOW): vitest 4.x breaking changes for Worker tests

**What:** The Worker tests use vitest@4.x while the root project uses vitest@3.x. Vitest 4 requires `vite: "^6.0.0 || ^7.0.0 || ^8.0.0"`. The worker package has no vite dependency today.

**Impact:** Installing `vitest@^4.1.0` in `worker/` may pull in vite@6+ as a peer/implicit dep, which adds install size.

**Mitigation:** `@cloudflare/vitest-pool-workers` bundles its own internal resolution; the `cloudflareTest` plugin is a Vite plugin but worker tests don't typically need a `vite.config.js`. In practice, vite is only needed as an optional peer dep. Run `npm install --save-dev vitest@^4.1.0 @cloudflare/vitest-pool-workers` in `worker/` and verify the install succeeds before writing the plan. [ASSUMED: vite peer dep is optional for worker-only configurations without browser builds]

---

## Common Pitfalls

### Pitfall 1: Using defineWorkersConfig (removed API)

**What goes wrong:** Config like `import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config'` throws `Module not found: Cannot resolve '@cloudflare/vitest-pool-workers/config'`.

**Why it happens:** Countless blog posts and Cloudflare docs examples use the old API. The `codemods/vitest-v3-to-v4` export in the package is a migration helper for the old API.

**How to avoid:** Use `cloudflareTest()` from `@cloudflare/vitest-pool-workers` (main export) in a `defineConfig()` from `vitest/config`. Never import from `*/config` subpath.

### Pitfall 2: Worker test running with incorrect/missing PROXY_TOKEN

**What goes wrong:** Test request uses `Authorization: Bearer test-token` but `env.PROXY_TOKEN` is undefined (not set in vitest.config miniflare.bindings). The Worker returns 401. Test fails with "Unauthorized" before reaching the KV path.

**How to avoid:** Set `miniflare.bindings: { PROXY_TOKEN: 'test-token', USPTO_API_KEY: 'test-key' }` in `worker/vitest.config.js`. The test request must use the matching token string.

**Warning signs:** Test response is 401, not 201.

### Pitfall 3: KV binding named differently in test vs wrangler.toml

**What goes wrong:** wrangler.toml has `binding = "PATENT_CACHE"` but test uses `env.PATENT_CACHE_TEST`. The `env.PATENT_CACHE` binding exists (from wrangler.toml) but is separate from a miniflare-added namespace.

**How to avoid:** Do NOT add extra KV namespaces in vitest.config.js miniflare. The `PATENT_CACHE` binding from wrangler.toml is automatically available via `env.PATENT_CACHE` in the test. Miniflare creates an isolated in-memory KV for it per test.

### Pitfall 4: KV not isolated between tests (stale state from prior test)

**What goes wrong:** Test 1 writes to KV (positive test case). Test 2 asserts KV is empty (test-mode test). But Miniflare reuses the same KV for both tests in the same worker scope.

**How to avoid:** `@cloudflare/vitest-pool-workers` provides per-test-file KV isolation by default. Tests within the same file share state. Use `beforeEach(() => env.PATENT_CACHE.delete(key))` or order tests so the empty-KV assertion runs before the write test, OR use separate test descriptions that reset state explicitly.

**Better approach:** Run "does not write to KV" as the FIRST test in the file. Run "does write when no header" as the SECOND test. Since KV starts empty and the first test leaves it empty (write suppressed), the second test starts clean. [VERIFIED: vitest-pool-workers docs state per-test-file storage]

### Pitfall 5: route.abort() never fires on extension offscreen fetch

**What goes wrong:** `page.route('https://patentimages.storage.googleapis.com/**', ...)` is registered but the extension's offscreen document never triggers it. The Google PDF fetch succeeds, no fallback occurs, and the test passes trivially.

**Why it happens:** Extension offscreen documents run in extension-isolated contexts, not in the page's browsing context. Playwright CDP routing may not reach them.

**Detection:** Add a flag check: `let abortCount = 0; await page.route(pattern, r => { abortCount++; r.abort(); }); /* run test */; expect(abortCount).toBeGreaterThan(0);`

**How to avoid:** Verify the flag fires before declaring the test complete. If it never fires, document the finding and escalate — the plan may need an alternative abort mechanism (e.g., an extension-level test hook, or the test must be restructured).

### Pitfall 6: USPTO fallback path never actually reaches the Worker because cache hits

**What goes wrong:** The fault-injection test navigates to `US11427642`. The extension calls `checkCache()` first. KV has a cached entry from a prior regression run (regression suite does NOT use X-PCT-Test-Mode — it could have uploaded). The extension returns the cached result without fetching any PDF. Test passes trivially.

**Detection:** The fault-injection test should be faster than expected (no network call). Alternatively, instrument with a `context.on('request')` listener and check if `pct.tonyrowles.com/?patent=...` was ever called.

**How to avoid:** After Phase 30 ships, all E2E tests that trigger the extension's cache-write path should also inject `X-PCT-Test-Mode: true` (via the same Worker route interception). In the short term: document that the fault-injection test relies on either (a) the production KV having no entry for `US11427642` at `v3`, or (b) the header injection working to prevent writes, making every prior test run a non-polluter.

---

## Code Examples

### Worker guard (INJ-01 — the single edit to worker/src/index.js)

```javascript
// Source: worker/src/index.js — POST /cache handler, currently line 229
// BEFORE:
await env.PATENT_CACHE.put(key, JSON.stringify(payload));

// AFTER:
if (request.headers.get('X-PCT-Test-Mode') !== 'true') {
  await env.PATENT_CACHE.put(key, JSON.stringify(payload));
}
```

Note: `request` is the Worker's `Request` argument (parameter name in the existing handler is `request`). [VERIFIED: codebase — worker/src/index.js line 129 `async fetch(request, env, ctx)`, line 229 `await env.PATENT_CACHE.put(key, JSON.stringify(payload))`]

### Checking CORS preflight — X-PCT-Test-Mode must be in Access-Control-Allow-Headers

The existing CORS preflight handler allows `'Authorization, Content-Type'`. If the fault-injection spec sends `X-PCT-Test-Mode` from a cross-origin context (i.e., the extension's offscreen document), the preflight must also allow this header. In practice the extension's offscreen document is same-origin with the Worker call (no CORS preflight for simple-extension-context fetches) — but to be safe, update the preflight response:

```javascript
// worker/src/index.js CORS handler (line 136)
'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-PCT-Test-Mode',
```

### WORKER_FALLBACK_FAILED addition to error-codes.js

```javascript
// tests/e2e/lib/error-codes.js — add after FLAKE export
export const WORKER_FALLBACK_FAILED = 'WORKER_FALLBACK_FAILED';
```

And add to `ERROR_CLASSES` array:
```javascript
export const ERROR_CLASSES = Object.freeze([
  'EXTENSION_NOT_LOADED',
  'NO_CITATION_PRODUCED',
  'WRONG_CITATION',
  'UI_BROKEN',
  'VERIFIER_DISAGREE',
  'GOOGLE_DOM_DRIFT',
  'USPTO_API_DRIFT',
  'FLAKE',
  'WORKER_FALLBACK_FAILED',  // Phase 30 addition
]);
```

### page.route modifier for X-PCT-Test-Mode header injection

```javascript
// Source: https://playwright.dev/docs/network#modify-requests
const WORKER_URL = 'https://pct.tonyrowles.com';

// Called before gotoPatent() so routes are active for the whole test
await page.route(`${WORKER_URL}/**`, async route => {
  const headers = { ...route.request().headers(), 'X-PCT-Test-Mode': 'true' };
  await route.continue({ headers });
});
```

[CITED: https://playwright.dev/docs/network — "Continue requests with modifications" pattern]

---

## Validation Architecture (Nyquist)

`nyquist_validation: true` in `.planning/config.json` — this section is required.

### Test Framework

| Property | Value |
|----------|-------|
| Framework (Worker) | vitest@^4.1.0 + @cloudflare/vitest-pool-workers@0.16.6 |
| Framework (E2E) | @playwright/test@1.60.0 (existing) |
| Config file (Worker) | `worker/vitest.config.js` (Wave 0 gap) |
| Config file (E2E) | `tests/e2e/playwright.config.js` (exists) |
| Quick run (Worker) | `cd worker && npx vitest run tests/test-mode.test.js` |
| Full Worker suite | `cd worker && npx vitest run` |
| Quick run (E2E fault) | `npx playwright test --config tests/e2e/playwright.config.js specs/fault-injection.spec.js` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INJ-01 | Worker POST /cache with `X-PCT-Test-Mode: true` does NOT write to KV, returns 201 | integration (vitest-pool-workers) | `cd worker && npx vitest run tests/test-mode.test.js` | Wave 0 gap |
| INJ-01 | Worker POST /cache WITHOUT header DOES write to KV (regression assertion) | integration | same command, second test | Wave 0 gap |
| INJ-02 | fault-injection E2E aborts Google PDF and gets accurate USPTO fallback citation | e2e (Playwright) | `npx playwright test --config tests/e2e/playwright.config.js specs/fault-injection.spec.js` | Wave 0 gap |
| INJ-02 | Nightly cron counts fault-injection in report.json | integration (CI config) | manual verification + e2e-nightly.yml run | Wave 0 gap |

### Sampling Rate

- **Per task commit (Worker):** `cd worker && npx vitest run tests/test-mode.test.js`
- **Per task commit (E2E):** `npx playwright test ... specs/fault-injection.spec.js`
- **Per wave merge:** Both Worker test + fault-injection spec green
- **Phase gate:** Both green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `worker/vitest.config.js` — cloudflareTest() config for Worker tests
- [ ] `worker/tests/test-mode.test.js` — covers INJ-01
- [ ] `tests/e2e/specs/fault-injection.spec.js` — covers INJ-02
- [ ] `worker/package.json` update — add vitest@^4.1.0 + @cloudflare/vitest-pool-workers
- [ ] `worker/npm install` — materialize new deps

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (Worker Bearer token) | Bearer token validated in Worker — no change to auth logic; `X-PCT-Test-Mode` header is an additive write-suppression flag only |
| V3 Session Management | no | Worker is stateless |
| V4 Access Control | no | Phase adds no new routes or access control changes |
| V5 Input Validation | yes | `X-PCT-Test-Mode` header is a string comparison; no user-supplied data enters the new guard code |
| V6 Cryptography | no | No new crypto operations |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Bypass KV write suppression in production via `X-PCT-Test-Mode` header | Tampering | Header is NOT a secret; any caller with the Bearer token could set it. This is by design — callers with the token can choose to suppress their own KV write. The production extension never sends this header (no code path sets it), so production writes are unaffected. |
| PROXY_TOKEN leakage via test logs | Information Disclosure | Token is already in public git history; no new exposure from tests. Accept risk per CONTEXT.md scope. |
| KV pollution from malformed test bodies during integration tests | Tampering | Miniflare KV is isolated per-test-file; production KV is never touched during integration tests. |

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Worker tests + E2E | yes | v24.11.1 | — |
| npm | Worker package install | yes | 11.6.2 | — |
| @playwright/test | fault-injection.spec.js | yes (root node_modules) | 1.60.0 | — |
| Playwright Chromium | fault-injection E2E | yes (CI installs it) | installed by e2e-nightly.yml | — |
| vitest@^4.1.0 | worker/tests/test-mode.test.js | NOT YET | — | Wave 0 task: `cd worker && npm install --save-dev vitest@^4.1.0 @cloudflare/vitest-pool-workers` |
| @cloudflare/vitest-pool-workers | worker/vitest.config.js | NOT YET | 0.16.6 | Wave 0 task: same install |
| wrangler (in worker/) | worker vitest config | yes | 4.69.0 | vitest-pool-workers bundles wrangler@4.92.0 internally |
| USPTO ODP API | fault-injection E2E (live network) | yes (public API) | current | — |
| pct.tonyrowles.com Worker | fault-injection E2E | yes (deployed) | current | test will fail (real defect) |

**Missing dependencies with no fallback:**
- vitest@^4.1.0 + @cloudflare/vitest-pool-workers@0.16.6 in worker/ — blocking for Worker test; Plan 01 Wave 0 must install these.

---

## Suggested Plan Split

| Plan | Files | What it delivers | Requirements |
|------|-------|------------------|--------------|
| **30-01** — Worker guard + integration test | `worker/src/index.js`, `worker/vitest.config.js`, `worker/tests/test-mode.test.js`, `worker/package.json` | X-PCT-Test-Mode header guard + Vitest integration test proving KV write suppression + no-suppression regression | INJ-01 |
| **30-02** — Fault-injection E2E spec | `tests/e2e/specs/fault-injection.spec.js` | Playwright spec that aborts Google PDF, asserts USPTO fallback produces golden citation + verifier passes | INJ-02 (spec + verifier gate) |
| **30-03** — Error taxonomy + nightly cron wiring | `tests/e2e/lib/error-codes.js`, `.github/workflows/e2e-nightly.yml` | WORKER_FALLBACK_FAILED added to taxonomy + fault-injection step in nightly cron | INJ-02 (cron + reporting) |

**Dependency:** 30-01 can run in parallel with 30-02. 30-03 depends on both 30-01 (to confirm the contract test exists) and 30-02 (fault-injection.spec.js must exist to reference in the workflow).

**Optional 30-04** (if page.route scope risk materializes): A diagnostic plan that verifies `page.route` reaches the extension offscreen context, or implements an alternative abort mechanism if it doesn't. This is only needed if the 30-02 spec's route-fired verification step shows zero interceptions.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `defineWorkersProject` / `defineWorkersConfig` | `cloudflareTest()` Vite plugin | @cloudflare/vitest-pool-workers v0.13.0 | vitest.config.js pattern is different from older docs/blog posts |
| `wrangler dev --test-mode` for local testing | `@cloudflare/vitest-pool-workers` + Miniflare | Ongoing (Miniflare v3+) | No wrangler server process needed; tests run in process |
| Vitest pool workers with Vitest 3.x | Requires Vitest 4.x (peer dep change) | vitest-pool-workers v0.13.0 | Root project must NOT upgrade; worker/ must use local vitest@4.x |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `page.route()` intercepts fetch requests from Chrome extension offscreen documents | Architecture Patterns (Pattern 3), Risks | CRITICAL — the fault-injection abort and header injection both fail silently; test exercises wrong path |
| A2 | `miniflare.bindings` key in `cloudflareTest()` config accepts string bindings (PROXY_TOKEN, USPTO_API_KEY) | Pattern 2 Code Example | Worker test returns 401; tests fail before reaching KV assertion |
| A3 | USPTO ODP rate limits allow 1 request/day per API key without throttling | Risk 3 | Nightly cron fails with 429; fault-injection test is flaky for rate reasons |
| A4 | vite peer dep is optional for worker/ vitest@4.x install (no browser build needed) | Standard Stack "Risk 5" | `npm install` in worker/ fails or pulls in unexpectedly large dep tree |
| A5 | US11427642 has a live eGrant PDF available via USPTO ODP at the time of test execution | Open Questions | Verifier fails with INFRA_FAIL; test cannot confirm fallback citation accuracy |

---

## Open Questions

1. **Does `page.route()` reach the extension's offscreen document?**
   - What we know: Playwright CDP routing intercepts page browsing context requests. Extension offscreen documents run in isolated contexts. Playwright docs say `page.route` does not intercept service worker requests.
   - What's unclear: Whether the offscreen document is treated as a page context (where CDP routing applies) or as an extension isolated context (where it doesn't).
   - Recommendation: The 30-02 plan MUST include a canary assertion — before the test completes, assert that `routeHandler.callCount > 0` to confirm the route actually intercepted at least one request. If it never fires, escalate to open an issue or use an alternative abort strategy.

2. **Should worker/package.json `npm install` be part of the CI workflow?**
   - What we know: The root `ci.yml` runs `npm ci` in the root directory only. `worker/` has its own `package.json` and `package-lock.json`.
   - What's unclear: Does ci.yml need a separate step `cd worker && npm ci` before `npm run test:worker`?
   - Recommendation: Yes — add a `cd worker && npm ci` step in ci.yml before the Worker test step. Otherwise CI uses the checked-in `worker/node_modules` (if committed) or fails with missing module. The worker/ `node_modules` should NOT be committed to git.

3. **Will X-PCT-Test-Mode need to be added to the CORS Allow-Headers?**
   - What we know: The extension's offscreen document sends cross-origin requests to `pct.tonyrowles.com`. The Worker's CORS handler currently allows `'Authorization, Content-Type'`.
   - What's unclear: Does the Chrome extension's offscreen document trigger a CORS preflight before the POST /cache call?
   - Recommendation: Add `X-PCT-Test-Mode` to `'Access-Control-Allow-Headers'` in the Worker's preflight response as a defensive measure. Zero risk, adds clarity.

---

## Sources

### Primary (HIGH confidence)
- [VERIFIED: codebase] `worker/src/index.js` — single KV write call site at line 229; Worker URL, PROXY_TOKEN, CACHE_VERSION at offscreen.js lines 23-26
- [VERIFIED: npm registry] `@cloudflare/vitest-pool-workers@0.16.6` — peer dep `vitest: "^4.1.0"`, bundled dep `wrangler@4.92.0`, `miniflare@4.20260305.0`
- [CITED: https://developers.cloudflare.com/workers/testing/vitest-integration/write-your-first-test/] — `cloudflareTest()` plugin API, `env` from `cloudflare:workers`, `createExecutionContext` from `cloudflare:test`
- [CITED: https://developers.cloudflare.com/workers/testing/vitest-integration/test-apis/] — `env.KV_NAMESPACE.put()`, `env.KV_NAMESPACE.get()`, `exports.default.fetch()` patterns
- [CITED: https://playwright.dev/docs/network#modify-requests] — `route.request().headers()` + `route.continue({ headers })` pattern for header injection
- [VERIFIED: codebase] `tests/e2e/specs/regression.spec.js` — established pattern for fault-injection.spec.js structure
- [VERIFIED: codebase] `tests/e2e/lib/error-codes.js` — existing 8-string taxonomy; location for WORKER_FALLBACK_FAILED
- [VERIFIED: codebase] `.github/workflows/e2e-nightly.yml` — existing nightly cron structure for new fault-injection step

### Secondary (MEDIUM confidence)
- [CITED: raw Cloudflare changelog] `defineWorkersConfig` → `cloudflareTest()` migration in v0.13.0
- [CITED: https://github.com/cloudflare/workers-sdk/tree/main/fixtures/vitest-pool-workers-examples/kv-r2-caches/vitest.config.ts] — confirmed `cloudflareTest()` + `defineProject` pattern
- [WebSearch verified] `@cloudflare/vitest-pool-workers` requires vitest ^4.1.0 — confirmed against npm registry

### Tertiary (LOW confidence — flagged for validation)
- [ASSUMED] `page.route` reaches Chrome extension offscreen document fetch calls — A1 in Assumptions Log
- [ASSUMED] USPTO ODP rate-limit is safe at 1 request/day — A3
- [ASSUMED] `miniflare.bindings` string injection for secrets in vitest.config — A2

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions verified against npm registry; API change verified from changelog
- Architecture (Worker test): HIGH — cloudflareTest() API verified from official Cloudflare docs + example fixtures
- Architecture (E2E fault injection): MEDIUM — page.route header pattern is HIGH; page.route scope into extension offscreen is LOW (flagged as Assumption A1)
- Pitfalls: HIGH — all sourced from codebase inspection + official API documentation
- Security: HIGH — minimal surface area; existing auth contract unchanged

**Research date:** 2026-05-15
**Valid until:** 2026-06-15 (stable — Cloudflare APIs move slowly; Playwright 1.60.0 is pinned)

# Phase 30: Worker Fault-Injection - Context

**Gathered:** 2026-05-17
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous, all recommendations accepted)

<domain>
## Phase Boundary

Coverage for the USPTO/Cloudflare Worker fallback path:
1. **Test-mode contract** — Worker honors `X-PCT-Test-Mode: true` request header to skip KV writes, ensuring CI runs don't pollute the shared production cache.
2. **Fault-injection E2E** — A Playwright spec route-aborts the Google Patents PDF fetch and asserts the extension's fallback through the Cloudflare Worker / USPTO eGrant API still produces an accurate citation matching the golden baseline.

In scope:
- `worker/src/index.js` — add `X-PCT-Test-Mode` header check at KV write call sites
- `worker/tests/test-mode.test.js` — Vitest integration test using `@cloudflare/vitest-pool-workers`
- `worker/package.json` + `worker/vitest.config.js` — Vitest pool-workers setup
- `tests/e2e/specs/fault-injection.spec.js` — new Playwright spec (single fault-injection case)
- `tests/e2e/lib/error-codes.js` — add `WORKER_FALLBACK_FAILED` to the RPT-02 taxonomy
- `.github/workflows/e2e-nightly.yml` — add fault-injection step after regression step

Out of scope (deferred):
- LLM exploratory mode — Phase 31
- USPTO API change detection beyond the contract test — v3.1+
- KV quota monitoring — v3.1+
- Worker observability / structured logging — v3.1+

</domain>

<decisions>
## Implementation Decisions

### X-PCT-Test-Mode header contract
- **What it skips:** KV writes only. Cache reads (`/cache` GET) remain identical. USPTO API calls (`/?patent=`) remain identical. The header is a write-suppression flag, not a fake-response flag — preserves the real USPTO contract for fault-injection testing.
- **Where checked:** At every `env.PATENT_CACHE.put()` call site in `worker/src/index.js` (currently one, in the `/cache` POST handler around line 229). Wrap each call in:
  ```javascript
  if (req.headers.get('X-PCT-Test-Mode') !== 'true') {
    await env.PATENT_CACHE.put(key, JSON.stringify(payload));
  }
  ```
  Response semantics unchanged — still returns the "Stored" 201 so callers don't need test-mode branching.
- **Routes affected:** All write routes (currently only `/cache` POST). If a future Worker write is added, it must respect the same flag — enforced by inline comment + the integration test.
- **Default behavior (header absent):** Identical to today — no functional change to existing extension callers.

### Worker integration test
- **Framework:** `@cloudflare/vitest-pool-workers` (idiomatic for Cloudflare Workers; per-test isolated `env.PATENT_CACHE`; no real network calls). This package is the official Cloudflare-blessed Vitest pool for Workers testing.
- **Location:** `worker/tests/test-mode.test.js`
- **Config:** `worker/vitest.config.js` configures `defineWorkersConfig` with `wrangler.toml` path
- **Assertion approach:** After invoking the Worker with `X-PCT-Test-Mode: true`:
  ```javascript
  const result = await env.PATENT_CACHE.list();
  expect(result.keys).toEqual([]);
  ```
  Plus assert response status/body matches the non-test-mode call.
- **CI integration:** Add to existing `npm run test` script chain so existing `ci.yml` runs it. No new GHA workflow needed.

### Fault-injection E2E spec
- **Patent:** `US11427642-spec-short-1` (already in golden baseline, grant, has USPTO eGrant document; reused as smoke probe in Phase 29 — high confidence the case path works)
- **Route abort pattern:** `page.route('https://patentimages.storage.googleapis.com/**', route => route.abort())` per CONTEXT.md success criterion #2 (does NOT abort `patents.google.com/**` — only the PDF asset)
- **Spec file location:** `tests/e2e/specs/fault-injection.spec.js` (new file, separate from regression.spec.js — single case, runs sequentially)
- **Pass criteria:**
  1. Citation matches the existing golden baseline for `US11427642-spec-short-1` (same as regression.spec.js gate)
  2. Verifier returns Tier-A/B/C pass (same as regression.spec.js gate)
  3. Both gates required — if either fails, the test fails with error class
- **Test-mode header propagation:** The extension's call to the Worker MUST include `X-PCT-Test-Mode: true` (and use a unique cache version) when running under the test harness. Originally planned to use Playwright's `page.route` (option b), then `context.route` (Plan 30-04 attempt). Both were confirmed insufficient — Chrome extension offscreen documents run in a separate process whose CDP target is not attached to Playwright's persistent context. Final approach (Plan 30-05): a minimal chrome.storage.local hook (~10 lines in offscreen.js) that reads two optional keys (`pct_test_cache_version`, `pct_test_mode`). The keys are read but NEVER written by production code paths; if absent, behavior is identical to pre-Phase-30. This is functionally a TEST hook (same category as Phase 26's data-testid attributes) and within the milestone's testing-infrastructure scope.

### Nightly cron + error taxonomy
- **Cron integration:** Add a step to `.github/workflows/e2e-nightly.yml` that runs `tests/e2e/specs/fault-injection.spec.js` AFTER the main regression step. Failures count in `report.json` and trigger the same issue-filer (CRON-04/05). Step has `continue-on-error: true` matching the regression step.
- **New error class:** `WORKER_FALLBACK_FAILED` added to `tests/e2e/lib/error-codes.js` RPT-02 taxonomy. Raised when the fault-injection spec fails specifically because the Worker fallback path did not produce a valid citation (distinguishes from generic regression failures).
- **FLAKE policy:** Not FLAKE-eligible. Set `retries: 0` in the fault-injection spec config OR via a `@no-retry` tag. Contract test must be deterministic; a flaky Worker is a real defect.
- **Cron schedule:** Runs on every nightly cron tick (not weekday-rotated) — it's a single fast case that catches Worker regressions.

### Claude's Discretion
- Exact name/path of the helper that wires the `page.route` interception
- Exact wording of the error class display in the issue body
- Whether to add a smoke-tag (`@fault-injection`) to allow targeted local runs
- Whether the Worker test file imports `worker/src/index.js` as a Worker module via `SELF` binding or via a wrangler service binding

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `worker/src/index.js` (288 lines) — current Worker. Single `env.PATENT_CACHE.put()` call site (POST /cache handler ~line 229). CORS, auth, USPTO 3-step lookup already present.
- `worker/wrangler.toml` — KV binding `PATENT_CACHE` already configured.
- `tests/e2e/specs/regression.spec.js` — pattern for harness setup, golden assertion, verifier integration. Mimic structure for `fault-injection.spec.js`.
- `tests/e2e/lib/error-codes.js` — RPT-02 taxonomy. Add `WORKER_FALLBACK_FAILED` here.
- `tests/e2e/lib/pdf-fetch.js` — independent Google Patents PDF fetcher (Phase 28). The fault-injection test can use Playwright's network interception layer for the abort.
- `tests/e2e/lib/extension-loader.js` (Phase 26) — already loads the extension.
- `src/background/service-worker.js`, `src/firefox/background.js` — extension's call to the Worker; the test must understand how this is triggered.
- `.github/workflows/e2e-nightly.yml` (Phase 29) — already has slot for an additional test step.

### Established Patterns
- ESM JS everywhere
- Cloudflare Workers ES modules format (`export default { async fetch(...) }`)
- Playwright `page.route` for network interception (no example yet — first use in this project)
- Vitest 3.x for unit tests; Vitest is also the recommended Cloudflare Workers test runner
- Error class taxonomy in `tests/e2e/lib/error-codes.js` as a flat enum-like export

### Integration Points
- Worker test runs inside `npm run test` (already in `ci.yml`)
- Fault-injection spec runs inside nightly cron (Phase 29 `e2e-nightly.yml`)
- Failures route through `scripts/e2e-report-issue.mjs` (Phase 29) using the standard `report.json` schema
- New error class becomes a candidate for issue title prefix: `[e2e-nightly] US11427642-spec-short-1: WORKER_FALLBACK_FAILED`

</code_context>

<specifics>
## Specific Ideas
- Worker test name suggestion: `"POST /cache with X-PCT-Test-Mode: true does not write to KV"`
- Fault-injection assertion message: `"Worker fallback produced citation matching golden baseline"`
- The `page.route` interception should attach `X-PCT-Test-Mode: true` to the request when the URL matches the Worker endpoint (so KV is not polluted even during fault-injection runs)
- Error class display in issue body: `WORKER_FALLBACK_FAILED` (matches NO_CITATION_PRODUCED capitalization style)
- Test mode is implicitly "production-safe" because the response body is unchanged — only the side effect (KV write) is suppressed

</specifics>

<deferred>
## Deferred Ideas
- LLM exploratory mode — Phase 31
- USPTO API contract testing beyond test-mode header — v3.1+
- KV quota / cost monitoring — v3.1+
- Worker structured logging / observability — v3.1+
- Multi-region Worker routing — out of scope
- Fault-injection for additional failure modes (timeout, 429, malformed JSON) — v3.1+
</deferred>

---
phase: 30
plan: "01"
subsystem: worker
tags: [vitest, cloudflare-workers, kv, test-mode, ci]
dependency_graph:
  requires: []
  provides: [INJ-01, worker-test-mode-guard, worker-vitest-harness]
  affects: [worker/src/index.js, worker/package.json, worker/vitest.config.js, worker/tests/test-mode.test.js, .github/workflows/ci.yml]
tech_stack:
  added:
    - vitest@4.1.6 (in worker/ only)
    - "@cloudflare/vitest-pool-workers@0.16.6"
  patterns:
    - cloudflareTest() Vite plugin (v0.13.0+ API, NOT defineWorkersConfig)
    - Miniflare per-test-file isolated KV
    - miniflare.bindings for PROXY_TOKEN/USPTO_API_KEY injection
key_files:
  created:
    - worker/vitest.config.js
    - worker/tests/test-mode.test.js
  modified:
    - worker/src/index.js
    - worker/package.json
    - worker/package-lock.json
    - .github/workflows/ci.yml
decisions:
  - "vitest@^4.1.0 installed in worker/ only (not root) to avoid vitest@3.x conflict"
  - "X-PCT-Test-Mode header guard uses !== 'true' polarity — absent header writes to KV (production default unchanged)"
  - "Test order: header-suppressed test first so no-header test starts with clean KV (Miniflare KV shared per-file)"
  - "cloudflareTest() plugin API used (not deprecated defineWorkersConfig)"
metrics:
  duration: "2m 47s"
  completed: "2026-05-17"
  tasks_completed: 4
  files_changed: 6
requirements: [INJ-01]
---

# Phase 30 Plan 01: Worker Fault-Injection Guard + Integration Test Summary

**One-liner:** X-PCT-Test-Mode header guard wrapping env.PATENT_CACHE.put() in worker/src/index.js, proven by two-test Vitest + @cloudflare/vitest-pool-workers integration suite with isolated Miniflare KV assertions.

## What Was Built

Plan 30-01 delivers the INJ-01 requirement: a write-suppression header guard in the Cloudflare Worker that allows CI E2E tests to call the production Worker endpoint without polluting the shared KV cache, while leaving all response semantics identical to production callers.

Four tasks were executed:

1. **Task 1** (commit `ef1c693`): Two surgical edits to `worker/src/index.js` — wrap `env.PATENT_CACHE.put()` with the `X-PCT-Test-Mode` guard and add the header to the CORS preflight `Access-Control-Allow-Headers`.

2. **Task 2** (commit `5bf247f`): Installed `vitest@^4.1.6` and `@cloudflare/vitest-pool-workers@0.16.6` in `worker/` as a separate npm package (isolated from root's vitest@3.2.4), and added `"test": "vitest run"` script to `worker/package.json`.

3. **Task 3** (commit `90f3cf4`): Created `worker/vitest.config.js` (cloudflareTest() Vite plugin with miniflare.bindings for PROXY_TOKEN/USPTO_API_KEY) and `worker/tests/test-mode.test.js` (two-test integration spec). Both tests pass.

4. **Task 4** (commit `f9f2799`): Added "Install worker dependencies" (`cd worker && npm ci`) and "Test — worker (Vitest)" (`cd worker && npm test`) steps to `.github/workflows/ci.yml`, inserted after "Test — lint" and before "Package Chrome extension".

## Exact Diff of worker/src/index.js

```diff
--- a/worker/src/index.js
+++ b/worker/src/index.js
@@ -134,7 +134,7 @@
-          'Access-Control-Allow-Headers': 'Authorization, Content-Type',
+          'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-PCT-Test-Mode',

@@ -226,7 +226,12 @@
         // Write to KV (no TTL per design decision)
-        await env.PATENT_CACHE.put(key, JSON.stringify(payload));
+        // INJ-01: X-PCT-Test-Mode header suppresses KV write so CI E2E
+        // runs don't pollute the shared production cache. Response
+        // semantics are unchanged — still returns 201 "Cached" below.
+        if (request.headers.get('X-PCT-Test-Mode') !== 'true') {
+          await env.PATENT_CACHE.put(key, JSON.stringify(payload));
+        }
```

## Vitest Test Results

```
 RUN  v4.1.6 /home/fatduck/patent-cite-tool/worker
 Test Files  1 passed (1)
      Tests  2 passed (2)
```

Test 1: `with X-PCT-Test-Mode: true → returns 201 "Cached" AND does NOT write to KV` — PASS
Test 2: `WITHOUT X-PCT-Test-Mode header → returns 201 "Cached" AND writes to KV` — PASS

## Production Extension Safety

`grep -r "X-PCT-Test-Mode" src/` returns empty. The production extension code never sets the test-mode header. KV writes proceed as before for all production callers.

## Verification Results

1. Guard immediately above put(): PASS
2. `cd worker && npm test`: 2 passed (2) — PASS
3. Root package.json/package-lock.json unchanged: `git diff --name-only package.json package-lock.json | wc -l` = 0 — PASS
4. worker/node_modules not committed: gitignored, absent from git status — PASS
5. `grep -r "X-PCT-Test-Mode" src/` empty: PASS

## Deviations from Plan

**1. [Rule 1 - Minor] X-PCT-Test-Mode appears 3 times in worker/src/index.js instead of 2**

The plan acceptance criteria stated `grep -c "X-PCT-Test-Mode" worker/src/index.js` should output `2`. However, the plan's own suggested replacement code included the header name in the INJ-01 comment block (`// INJ-01: X-PCT-Test-Mode header suppresses KV write...`). The actual count is 3 (comment at line 229, guard at line 232, CORS at line 137). All behaviors are correct: the guard exists, the CORS header is updated, syntax is valid, only one put() call site. The spirit of the acceptance criterion is met — the discrepancy is from the comment in the plan's own code template.

## Handoff Note for Plan 30-02

The Worker now fully honors the `X-PCT-Test-Mode: true` request header:
- `POST /cache` with the header returns 201 "Cached" but SKIPS `env.PATENT_CACHE.put()`
- `POST /cache` without the header writes to KV as before (production unchanged)
- The CORS preflight allows the header via `Access-Control-Allow-Headers`

Plan 30-02's `page.route` interception can safely inject `X-PCT-Test-Mode: true` on outbound Worker requests (`https://pct.tonyrowles.com/cache/**`) without changing the response shape the extension sees. The extension's `checkCache()` GET call is unaffected (no KV writes happen there anyway). The `fetchUsptoWithRetry()` call hits `/?patent=` (not `/cache`), which has no KV write — also unaffected.

## Commits

| Task | Commit | Message |
|------|--------|---------|
| Task 1 | ef1c693 | feat(30-01): add X-PCT-Test-Mode KV write guard + CORS preflight update (INJ-01) |
| Task 2 | 5bf247f | chore(30-01): install vitest@^4.1.0 + @cloudflare/vitest-pool-workers@0.16.6 in worker/ |
| Task 3 | 90f3cf4 | test(30-01): add vitest.config.js + INJ-01 integration test (test-mode.test.js) |
| Task 4 | f9f2799 | ci(30-01): add worker install + vitest step to ci.yml |

## Known Stubs

None. All wired data sources are real: Miniflare KV is a real in-memory KV that matches production semantics, and the Worker module is imported directly from `worker/src/index.js`.

## Threat Flags

None. The threat model for this plan is fully covered in the plan's `<threat_model>` section (T-30-1 through T-30-4). No new network endpoints, auth paths, or schema changes at trust boundaries were introduced beyond what was planned.

## Self-Check: PASSED

All 6 files verified present. All 4 commits verified in git log.

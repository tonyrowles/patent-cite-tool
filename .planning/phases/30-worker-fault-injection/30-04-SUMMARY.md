---
phase: 30
plan: "04"
subsystem: e2e-testing
tags: [fault-injection, playwright, context-route, cache-bypass, verifier-api-fix, escalation]
dependency_graph:
  requires: [30-02]
  provides: [worker-test-mode-route-v2, fault-injection-spec-v2]
  affects: [e2e-fault-injection, e2e-nightly]
tech_stack:
  added: []
  patterns: [context-route, cache-bypass-nonce, playwright-fault-injection]
key_files:
  created: []
  modified:
    - tests/e2e/lib/worker-test-mode-route.js
    - tests/e2e/specs/fault-injection.spec.js
decisions:
  - "context.route also does not intercept extension offscreen document fetches (same Chrome isolation as page.route) — escalated to Plan 30-05"
  - "Verifier assertion fixed to 'pass' (was 'agree' — wrong constant from 30-02-PLAN.md interface spec)"
  - "Cache-bypass nonce approach is correct in principle; cannot be verified until routing interception is solved"
  - "Both code changes committed; spec deliberately left failing with diagnostic canary per escalation contract"
metrics:
  duration_minutes: 3
  completed: "2026-05-17T22:19:00Z"
  tasks_completed: 2
  tasks_total: 2
  files_created: 0
  files_modified: 2
---

# Phase 30 Plan 04: Gap Closure (context.route + cache-bypass + verifier fix) — Summary

**One-liner:** Switched Worker interception to context.route + added cache-bypass nonce + fixed verifier assertion, but discovered context.route also does not reach extension offscreen document context — same Chrome isolation boundary as page.route.

## What Was Built

### Task 1: `tests/e2e/lib/worker-test-mode-route.js` (COMPLETE)

Rewrote the helper from page-based to context-based routing:

- **Signature change:** `installWorkerTestModeRoute(page)` async → `installWorkerTestModeRoute(context)` synchronous
- **Routing scope:** `context.route(WORKER_URL_PATTERN, ...)` (BrowserContext level)
- **GET /cache:** Rewrites `v=` query param to `v=test-{nonce}` (per-test Date.now + random suffix) to force cache miss
- **POST /cache:** Injects `x-pct-test-mode: true` header for Plan 30-01 KV-write suppression
- **Other requests (`/?patent=`, preflight):** `route.continue()` unchanged
- **Returns:** `{ getCallCount: () => number, nonce: string }` (synchronous)

Static acceptance criteria: all pass.

Commit: `2d10d5f` — `fix(30-04): use context.route + cache-bypass nonce in test-mode helper`

### Task 2: `tests/e2e/specs/fault-injection.spec.js` (COMPLETE)

Three changes applied:

1. `const workerRoute = await installWorkerTestModeRoute(page)` → `const workerRoute = installWorkerTestModeRoute(context)` (removed `await`, passes context)
2. `expect(verifierVerdict.status).toBe('agree')` → `expect(verifierVerdict.status).toBe('pass')` (matches actual pdf-verifier.js return values)
3. Canary error message updated to reference context.route
4. Comment on line 10 updated from `'agree'` to `'pass'`

Static acceptance criteria: all pass.

Commit: `4cfa4f2` — `fix(30-04): use browser context for Worker routing + correct verifier status to 'pass'`

## Test Execution Result: ESCALATION — context.route Also Blocked by Chrome Extension Isolation

The spec was run after both tasks with `npx playwright test --config tests/e2e/playwright.config.js specs/fault-injection.spec.js`.

**Result: 1 failed (same failure mode as Plan 30-02)**

```
Error: context.route did not intercept https://pct.tonyrowles.com/** — Worker fallback was
not exercised OR cache-bypass nonce did not reach the extension offscreen context.
See 30-RESEARCH.md Risk A1 + Plan 30-04.

expect(received).toBeGreaterThan(expected)
Expected: > 0
Received:   0
```

### Canary Results

| Canary | URL | Method | Count | Outcome |
|--------|-----|--------|-------|---------|
| 1 (abort) | `https://patentimages.storage.googleapis.com/**` | page.route | > 0 | PASSED — page.route reaches offscreen for googleapis |
| 2 (Worker) | `https://pct.tonyrowles.com/**` | context.route | 0 | FAILED — context.route also does not reach offscreen |

### Report from Failed Run

```json
{
  "id": "US11427642-spec-short-1",
  "status": "failed",
  "errorClass": "WORKER_FALLBACK_FAILED",
  "citation": "1:26-27",
  "verifier_verdict": {
    "status": "pass",
    "tier_used": "C",
    "reason": "±10-line fuzzy match at cited 1:26-27 (Tier C, offset 0)",
    "duration_ms": 343
  },
  "duration_ms": 13193
}
```

The citation is still correct (`1:26-27` matches baseline) — the extension is still serving from KV cache.

### Root Cause Analysis

The `context.route()` Playwright API operates at the same CDP (`Fetch.requestPaused`) level as `page.route()` — it is broader in scope (all pages within the context vs one page), but Chrome's extension offscreen documents appear to run in a completely separate process with its own CDP session that is not attached to the persistent context's DevTools target. Neither page-level nor context-level route interception reaches requests originating from `chrome-extension://…/offscreen.html`.

**Why googleapis (canary 1) fires but pct.tonyrowles.com (canary 2) does not:**

The extension's offscreen document fetches `patentimages.storage.googleapis.com` first (Google PDF fetch), and `page.route` intercepts it. This likely works because the aborted Google PDF request may be triggered via a content-script IPC message that causes it to be made in a context that IS reachable by page.route (possibly through the tab's CDP session), or there is some other mechanism. The KV cache GET to `pct.tonyrowles.com` happens in the extension's isolated process and does not flow through the page's CDP.

## Deviations from Plan

### Escalation: context.route Ineffective (Plan Contract Applied)

**Found during:** Task 2 verification (spec run)
**Issue:** `context.route` has the same extension isolation limitation as `page.route`. The Worker canary fires zero after switching to context-level routing.
**Action taken per escalation contract:** STOP. Code changes committed (they are correct and will be needed when a working solution is found). Spec is left failing with its diagnostic canary.
**Not silently worked around:** Per the plan spec: "If the spec STILL fails after both tasks complete [...] STOP, do not silently work around the failure, and report the new failure mode with diagnostic info."

## Recommended Plan 30-05 Actions

Three alternative approaches to investigate, in priority order:

1. **Extension test hook via `chrome.storage.local`** (highest probability of success):
   Add a `TEST_MODE_CACHE_VERSION` key in `chrome.storage.local`. Before the test, set it via `sw.evaluate(() => chrome.storage.local.set({TEST_MODE_CACHE_VERSION: 'test-nonce'}))`. Modify `offscreen.js` to check `chrome.storage.local.get('TEST_MODE_CACHE_VERSION')` and use it if present. This is an extension source change but minimal (one `storage.get` call in `checkCache()`).

2. **Service worker evaluate injection:**
   Use `context.serviceWorkers()[0].evaluate(fn)` to set a flag in the extension's service worker scope that the offscreen document can read via `chrome.runtime.sendMessage`. Avoids extension source modification but requires an IPC bridge.

3. **Directly delete/invalidate the KV cache entry for US11427642:**
   If the KV entry can be deleted from the Cloudflare Workers KV dashboard (or via a Wrangler command) before the test, the cache miss happens naturally without any request interception. This sidesteps the routing problem entirely for the cache-miss requirement — though header injection for POST /cache suppression still needs solving.

4. **Playwright service worker routing (experimental):**
   Playwright 1.60 added some service worker interception. Investigate `context.routeFromHAR()` or service-worker-based routing as an alternative to `context.route`.

## Root Cause Resolution Status

| Root Cause | Fix Applied | Status |
|-----------|-------------|--------|
| R1: page.route scope (Risk A1) | Switched to context.route | Partially resolved — context.route has same isolation boundary; 30-05 needed |
| R2: Cache hit bypass | Nonce rewrite in GET /cache handler | Code correct; cannot verify until R1 is solved |
| R3: Verifier 'agree' vs 'pass' | Changed assertion to .toBe('pass') | RESOLVED — verifier status mismatch fixed |

## Known Stubs

None — no placeholder data or wired-but-empty code paths.

## Threat Flags

No new threat surface introduced. All changes are in `tests/e2e/` only; `grep -r "X-PCT-Test-Mode" src/` returns empty.

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| `tests/e2e/lib/worker-test-mode-route.js` contains `context.route(` | FOUND |
| `tests/e2e/specs/fault-injection.spec.js` contains `installWorkerTestModeRoute(context)` | FOUND |
| `tests/e2e/specs/fault-injection.spec.js` contains `.toBe('pass')` | FOUND |
| `tests/e2e/specs/fault-injection.spec.js` does NOT contain `.toBe('agree')` | CONFIRMED |
| googleapis `page.route` unchanged | CONFIRMED (line 76) |
| Commit `2d10d5f` (Task 1) | FOUND |
| Commit `4cfa4f2` (Task 2) | FOUND |
| Worker tests pass | CONFIRMED (2/2) |
| `grep -r "X-PCT-Test-Mode" src/` empty | CONFIRMED |
| Spec exit: 1 (canary 2 still fires 0) | ESCALATED per contract |

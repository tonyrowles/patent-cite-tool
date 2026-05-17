---
phase: 30
plan: "02"
subsystem: e2e-testing
tags: [fault-injection, playwright, worker-fallback, canary, risk-a1]
dependency_graph:
  requires: [30-01]
  provides: [fault-injection-spec, worker-test-mode-route-helper]
  affects: [e2e-nightly, regression-suite]
tech_stack:
  added: []
  patterns: [page.route-canary, worker-header-injection, playwright-fault-injection]
key_files:
  created:
    - tests/e2e/specs/fault-injection.spec.js
    - tests/e2e/lib/worker-test-mode-route.js
  modified: []
decisions:
  - "Canaries NOT removed to work around A1 failure — per plan spec, escalate to Plan 30-04"
  - "verifier returns status='pass' not 'agree' — documented for 30-04 fix"
  - "abortCount canary passed (googleapis route reaches offscreen); Worker canary failed (Risk A1 confirmed for pct.tonyrowles.com)"
metrics:
  duration_minutes: 4
  completed: "2026-05-17T22:08:50Z"
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 0
---

# Phase 30 Plan 02: Fault-Injection E2E Spec — Summary

**One-liner:** Playwright fault-injection spec with dual route-callback canaries detects Risk A1 (pct.tonyrowles.com page.route does not reach extension offscreen context) and fails loudly with a diagnostic message rather than silently passing.

## What Was Built

### Task 1: `tests/e2e/lib/worker-test-mode-route.js` (COMPLETE)

Helper module exporting `installWorkerTestModeRoute(page)` that:
- Registers `page.route('https://pct.tonyrowles.com/**', ...)` on the Playwright page
- Injects `X-PCT-Test-Mode: true` into every intercepted request header
- Returns `{ getCallCount: () => number }` for canary assertion
- Node syntax check passes; ESM import check passes

### Task 2: `tests/e2e/specs/fault-injection.spec.js` (COMPLETE)

Single-case Playwright spec for `US11427642-spec-short-1` with:
- `page.route('https://patentimages.storage.googleapis.com/**', ...)` abort + `abortCount` canary
- `installWorkerTestModeRoute(page)` header injection + `workerRoute.getCallCount()` canary
- `retries: 0` via `test.describe.configure` (not FLAKE-eligible)
- Both canary assertions run before pass gates (correct diagnosis ordering)
- `WORKER_FALLBACK_FAILED` import with `?? 'WORKER_FALLBACK_FAILED'` fallback for pre-30-03 loadability
- Verifier integration via `verifyCitation()`
- `appendCase(REPORT_PATH, ...)` in finally block
- 175 lines (exceeds 100-line minimum)

All static acceptance criteria pass:
- `node --check` exits 0
- `grep -c "toBeGreaterThan(0)"` outputs `2`
- `@fault-injection` tag present
- `retries: 0` present
- `baseline[CASE_ID].citation` present
- `verifierVerdict.status).toBe('agree')` present
- `WORKER_FALLBACK_FAILED` present
- `page.route('https://patentimages.storage.googleapis.com/**'` present

## Test Execution Result: Risk A1 Materialized

The spec was run against `dist/chrome/` with `npx playwright test --config tests/e2e/playwright.config.js specs/fault-injection.spec.js`.

**The canaries worked exactly as designed.** The test failed with a loud, diagnosable error:

```
Error: page.route did not intercept https://pct.tonyrowles.com/** — Worker fallback was 
not exercised OR header injection did not reach the extension offscreen context. 
See 30-RESEARCH.md Risk A1.

expect(received).toBeGreaterThan(expected)
Expected: > 0
Received:   0
```

### Canary Results

| Canary | URL | Count | Outcome |
|--------|-----|-------|---------|
| 1 (abort) | `https://patentimages.storage.googleapis.com/**` | > 0 | PASSED — googleapis abort reaches offscreen |
| 2 (header injection) | `https://pct.tonyrowles.com/**` | 0 | FAILED — Worker route does NOT reach offscreen |

### What the Report Reveals

`tests/e2e/artifacts/2026-05-17T22-07-08Z/report.json`:
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
    "duration_ms": 1355
  },
  "duration_ms": 15337
}
```

The citation `"1:26-27"` is correct (matches baseline), and the verifier returned a Tier C pass. This means:

1. The extension produced the correct citation — likely via a **KV cache hit** for US11427642 (RESEARCH.md Risk 2 / Pitfall 6). The position map was retrieved from the Worker's KV cache before any PDF fetch was needed.
2. The `abortCount > 0` confirms that at some point during the test, the googleapis domain was intercepted. This may be the extension attempting a googleapis fetch as part of a fallback path OR a page-level request during navigation.
3. The Worker GET `/cache?patent=...` request (from `checkCache()`) went through the extension offscreen context and was NOT intercepted by `page.route` — confirming Risk A1 for pct.tonyrowles.com.

### Additional Finding: Verifier Status Mismatch

The plan spec at line 141 asserts `expect(verifierVerdict.status).toBe('agree')`, but the actual `pdf-verifier.js` implementation returns `status: 'pass'` (not `'agree'`). This is a plan/implementation discrepancy:

- **Plan interface spec (30-02-PLAN.md):** `status: 'agree' | 'disagree'`
- **Actual `pdf-verifier.js` line 816 + line 273:** `status: 'pass'` or `'disagree'`

This means even if the canary issue is resolved, the verifier gate assertion `expect(verifierVerdict.status).toBe('agree')` will FAIL because the verifier says `'pass'`. Plan 30-04 must fix this to `toBe('pass')`.

### Why canary 1 (googleapis) fires but canary 2 (pct.tonyrowles.com) does not

This asymmetry is diagnostic. Possible explanations:
1. **Different network isolation:** Chrome may route extension offscreen `fetch()` calls to `pct.tonyrowles.com` (an HTTPS endpoint not in the page's browsing context) through a different CDP channel than requests to `patentimages.storage.googleapis.com`. The page.route handler intercepts at the CDP `Fetch.requestPaused` level for the page's DevTools session — offscreen document fetches to external HTTPS may or may not flow through this.
2. **Cache hit path:** If US11427642 has a live KV cache entry, `checkCache()` returns the position map and `fetchUsptoWithRetry()` is never called — so only the KV GET reaches the Worker. The KV GET is also a Worker request that should be intercepted, yet wasn't.
3. **Extension isolation:** Chrome's extension offscreen document runs in a separate extension process. Playwright's CDP session is attached to the page context (content-tab process). Cross-process fetch requests may not flow through the CDP routing layer of the page's DevTools session.

## Deviations from Plan

### Auto-fixed Issues

None. The plan executed exactly as designed.

### Deviation: Risk A1 Confirmed — Test Fails as Designed

Per the plan specification:

> "If the canary fails (route count is 0), this is the documented Risk A1 materializing. Do NOT silently 'fix' the test by removing the canary — the canary is the contract."

The second canary (Worker URL count = 0) fired, the test fails, and this SUMMARY documents the finding. The canary design worked correctly — the test is NOT a silent false-positive.

### Known Issue: Verifier Status Constant

The spec asserts `verifierVerdict.status === 'agree'` but the pdf-verifier returns `'pass'`. This needs correction in Plan 30-04.

## Known Stubs

None — the spec and helper are fully wired. The test fails due to a real routing limitation, not a stub.

## Threat Flags

No new threat surface introduced beyond what the plan's `<threat_model>` covered.

## Handoff Note for Plan 30-03

- Spec file path: `tests/e2e/specs/fault-injection.spec.js`
- Smoke tag: `@fault-injection` — usable as `--grep @fault-injection` or as a positional spec argument
- The spec is currently failing due to canary 2 (Risk A1 confirmed)
- Plan 30-03 should add `WORKER_FALLBACK_FAILED` to `tests/e2e/lib/error-codes.js` and wire the nightly cron — but should also note that the spec will fail until Plan 30-04 resolves the routing issue

## Recommended Plan 30-04 Actions

1. **Root cause investigation:** Add `context.on('request', req => ...)` listener to log ALL requests during the test (including those from the extension offscreen context) and determine whether Worker calls appear at all.
2. **Alternative routing strategies to investigate:**
   - `context.route()` instead of `page.route()` — same CDP mechanism but broader scope (all pages in context)
   - `browserContext.serviceWorkers()[0].evaluate(...)` — inject test mode via the extension's service worker
   - `page.addInitScript()` with a content-script bridge that sets a flag readable by the offscreen document via `chrome.runtime.sendMessage`
   - Extension test hook: add a `chrome.storage.local` key `TEST_MODE_HEADERS` that offscreen.js reads and adds to outbound requests (minimal extension change)
3. **Fix verifier status assertion:** Change `expect(verifierVerdict.status).toBe('agree')` to `expect(verifierVerdict.status).toBe('pass')` to match the actual pdf-verifier.js return value.
4. **KV cache poisoning:** Consider whether a real KV cache entry for US11427642 at v3 should be deleted or bypassed before the fault-injection test runs (to ensure the fallback path is actually exercised, not the cache hit path).

## `git diff src/` Confirmation

```
(empty — no extension source files were modified)
```

All changes are in `tests/e2e/` only.

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| `tests/e2e/lib/worker-test-mode-route.js` exists | FOUND |
| `tests/e2e/specs/fault-injection.spec.js` exists | FOUND |
| `.planning/phases/30-worker-fault-injection/30-02-SUMMARY.md` exists | FOUND |
| Commit de22fb7 (Task 1) | FOUND |
| Commit 6be0946 (Task 2) | FOUND |
| `git diff src/` empty (no extension modifications) | CONFIRMED |

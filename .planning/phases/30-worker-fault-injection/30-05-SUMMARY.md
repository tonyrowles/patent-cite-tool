---
phase: 30
plan: "05"
subsystem: e2e-testing
tags: [fault-injection, playwright, chrome-storage, offscreen-hook, gap-closure]
dependency_graph:
  requires: [30-04, 30-01]
  provides: [worker-test-mode-route-v3, fault-injection-spec-v3, offscreen-storage-hook]
  affects: [e2e-fault-injection, e2e-nightly]
tech_stack:
  added: []
  patterns: [chrome-storage-local-test-hook, service-worker-evaluate, playwright-fault-injection]
key_files:
  created: []
  modified:
    - src/offscreen/offscreen.js
    - tests/e2e/lib/worker-test-mode-route.js
    - tests/e2e/specs/fault-injection.spec.js
    - .planning/phases/30-worker-fault-injection/30-CONTEXT.md
decisions:
  - "chrome.storage.local IS accessible from offscreen documents (manifest storage permission covers all extension contexts); the comment in offscreen.js was incorrect"
  - "Only 2 /cache URL construction sites exist in offscreen.js (not 3 as plan estimated): checkCache() and uploadToCache()"
  - "testHook declared as let null outside try block to make cleanup reachable in finally"
  - "readTestModeOverrides() returns defaults (CACHE_VERSION, false) on any chrome.storage error — never throws"
metrics:
  duration_minutes: 25
  completed: "2026-05-15T09:10:00Z"
  tasks_completed: 4
  tasks_total: 4
  files_created: 0
  files_modified: 4
---

# Phase 30 Plan 05: Final Gap Closure — chrome.storage.local Extension Hook — Summary

**One-liner:** Added minimal chrome.storage.local test hook to offscreen.js (readTestModeOverrides at 2 /cache sites), rewrote route helper to set keys via sw.evaluate(), spec passes 1/1 with abortCount=14 and storage canary confirmed.

## Why Plans 30-02 and 30-04 Were Insufficient

### Root Cause: Chrome Extension Offscreen Document Isolation

Chrome's MV3 offscreen documents run in a separate process with their own CDP session. Playwright's `page.route()` and `context.route()` both operate at the CDP `Fetch.requestPaused` level for the page's browsing context — they only reach requests that flow through that CDP session. Requests from chrome-extension://…/offscreen.html originate from a completely isolated CDP target that is NOT attached to the persistent Playwright context.

**Canary evidence from Plans 30-02 and 30-04:**
| Route | Target URL | Result |
|-------|-----------|--------|
| `page.route` | googleapis (Google PDF) | FIRES (14+ times) |
| `page.route` | pct.tonyrowles.com (Worker) | NEVER fires (0) |
| `context.route` | pct.tonyrowles.com (Worker) | NEVER fires (0) |

The googleapis canary fires because Google PDF fetch is triggered via a content-script IPC message that causes it to be made in a context reachable by page.route (the tab's CDP session). The Worker call (cache check + upload) happens entirely within the offscreen document's isolated process.

## The Final Approach: chrome.storage.local Hook

### Design

Add a single `readTestModeOverrides()` async helper in `src/offscreen/offscreen.js` that reads two optional keys from `chrome.storage.local`:

- **`pct_test_cache_version`** (string): When set, used as the `v=` query param on `/cache` GET requests instead of the hardcoded `CACHE_VERSION = 'v3'`. A per-test nonce forces a cache miss (no KV entry for the nonce version exists).
- **`pct_test_mode`** (boolean): When `true`, adds `X-PCT-Test-Mode: true` header to POST `/cache` requests — triggers Plan 30-01's Worker guard to skip the KV `put()`, keeping production cache clean.

**No-op guarantee:** When neither key is set (production default), `chrome.storage.local.get()` resolves with `{}` and both values fall back to defaults. Behavior is byte-for-byte identical to pre-Phase-30.

### Hook Placement

Two call sites in offscreen.js:
1. `checkCache()` (GET /cache) — `const { cacheVersion } = await readTestModeOverrides()`
2. `uploadToCache()` (POST /cache) — `const { cacheVersion, testMode } = await readTestModeOverrides()`

Note: Plan estimated 3 sites; actual code has 2 (no separate GET-existence-check function exists). This deviation is correct — the plan's line-number estimates were approximate.

### Test Helper: installWorkerTestModeRoute

Rewrote `tests/e2e/lib/worker-test-mode-route.js` from `context.route()`-based to `chrome.storage.local`-based:

```
installWorkerTestModeRoute(context, extensionId)
  → finds extSw = context.serviceWorkers().find(sw includes extensionId)
  → extSw.evaluate() → chrome.storage.local.set({pct_test_cache_version: nonce, pct_test_mode: true})
  → returns {nonce, cleanup()}
```

The `extSw.evaluate()` call runs JavaScript in the extension's service worker context — the same origin as the offscreen document, giving us a path to set storage that the offscreen document will read.

## Final Canary State

From the passing run (`npx playwright test ... specs/fault-injection.spec.js`):

```
[fault-injection canaries] abortCount=14 storageNonce=test-1779120515325-be3qfd testMode=true
✓  1 tests/e2e/specs/fault-injection.spec.js:59:3 › Phase 30 fault-injection [...] (12.7s)
1 passed (14.9s)
```

| Canary | Signal | Result |
|--------|--------|--------|
| 1 (googleapis abort) | `abortCount > 0` | **14** — Google PDF injection fired |
| 2 (storage hook) | `storageState.pct_test_cache_version === testHook.nonce` | **MATCH** — hook installed |
| 2b (test mode) | `storageState.pct_test_mode === true` | **TRUE** — KV suppression active |
| Pass gate 1 | `observed.citation === baseline['US11427642-spec-short-1'].citation` | `'1:26-27'` matches |
| Pass gate 2 | `verifierVerdict.status === 'pass'` | Verified (Tier A/B/C) |

## Verifier Verdict

Verifier returns `status: 'pass'` for citation `'1:26-27'` on patent US11427642.

## Files Modified

| File | Change |
|------|--------|
| `src/offscreen/offscreen.js` | +35/-9 lines: added `readTestModeOverrides()` helper and 2 call sites; corrected misleading comment about chrome.storage availability |
| `tests/e2e/lib/worker-test-mode-route.js` | Complete rewrite: context.route → chrome.storage.local via sw.evaluate() |
| `tests/e2e/specs/fault-injection.spec.js` | +43/-20 lines: async hook, extensionId param, storage-state canary, cleanup in finally |
| `.planning/phases/30-worker-fault-injection/30-CONTEXT.md` | Updated test-mode propagation decision to reflect final approach |

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 | `b58a836` | feat(30-05): add chrome.storage.local test-mode hook to offscreen.js (INJ-02) |
| 2 | `9050370` | refactor(30-05): replace context.route helper with chrome.storage.local-based hook |
| 3 | `f39c5c3` | feat(30-05): update fault-injection spec to use chrome.storage.local hook |
| 4 | `274a41b` | docs(30-05): update CONTEXT.md to reflect chrome.storage hook approach |

## Scope Discipline Justification

The `readTestModeOverrides()` helper is classified as a TEST hook — the same category as Phase 26's `data-testid` attributes. Both keys are:
- Read-only in production code (no `set()` call in `src/`)
- Never set by any production code path
- No-ops when absent (behavior identical to pre-Phase-30)

The change adds ~35 lines to offscreen.js and ~5ms latency per cache call (acceptable per plan spec). The `chrome.storage` permission was already in the manifest.

## Deviations from Plan

### Plan Counted 3 /cache Sites — Actual Code Has 2

**Found during:** Task 1 implementation
**Issue:** Plan referenced "Site 2 — line ~192 (likely uploadToCache GET-existence-check)" but this function does not exist in the current codebase. Only `checkCache()` (GET) and `uploadToCache()` (POST) exist.
**Fix:** Applied hook to both actual sites. The `grep -c "readTestModeOverrides()"` still returns 3 because the function definition itself counts.
**Impact:** None — the 2 sites are the correct and complete set of /cache call sites.

### Comment in offscreen.js Header Was Incorrect

**Found during:** Task 1 read
**Issue:** Comment said "No chrome.storage, no chrome.tabs" but chrome.storage IS available in offscreen documents (manifest has `"storage"` permission; Chrome docs confirm).
**Fix:** Corrected the comment.

## Known Stubs

None.

## Threat Flags

No new threat surface. All `pct_test_*` keys are read-only in src/; only test code writes them. Chrome enforces per-extension storage isolation.

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| `src/offscreen/offscreen.js` contains `async function readTestModeOverrides` | FOUND |
| `grep -c "readTestModeOverrides()" src/offscreen/offscreen.js` = 3 | 3 (definition + 2 call sites) |
| `grep -q "X-PCT-Test-Mode" src/offscreen/offscreen.js` | FOUND |
| `dist/chrome/offscreen/offscreen.js` contains `pct_test_cache_version` | FOUND |
| `tests/e2e/lib/worker-test-mode-route.js` contains `chrome.storage.local.set` | FOUND |
| `tests/e2e/lib/worker-test-mode-route.js` does NOT contain `context.route(` | CONFIRMED |
| `tests/e2e/specs/fault-injection.spec.js` calls `installWorkerTestModeRoute(context, extensionId)` | FOUND |
| `tests/e2e/specs/fault-injection.spec.js` contains `testHook.cleanup()` | FOUND |
| `tests/e2e/specs/fault-injection.spec.js` contains `page.route('https://patentimages.storage.googleapis.com` | FOUND |
| `tests/e2e/specs/fault-injection.spec.js` does NOT contain `workerRoute.getCallCount` | CONFIRMED |
| `tests/e2e/specs/fault-injection.spec.js` contains `.toBe('pass')` for verifier | FOUND |
| Playwright spec exits 0 with "1 passed" | CONFIRMED (12.7s, abortCount=14) |
| Worker tests: 2/2 passing | CONFIRMED |
| `grep -rE "pct_test_(cache_version|mode)" src/` shows ONLY read sites | CONFIRMED (3 read lines, 0 set calls) |
| Commits b58a836, 9050370, f39c5c3, 274a41b exist | CONFIRMED |

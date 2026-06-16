# Phase 3: Background Submission Handler + Rate Limit + Retry Queue — Research

**Researched:** 2026-06-13
**Domain:** MV3 Chrome service worker + Firefox event page — extension-side transport layer with disk-first queue, sliding-window rate limit, exponential backoff retry
**Confidence:** HIGH — all findings derived from direct codebase reads and locked CONTEXT.md decisions; no unverified external dependencies

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01:** No `chrome.alarms`. Backoff retries (2s / 8s / 30s) fire via in-session `setTimeout` on a best-effort basis. If the SW dies before a scheduled retry fires, the entry stays on disk and is picked up by the drain. `alarms` permission adds a manifest re-review; neither manifest currently declares it.

**D-02:** Opportunistic drain on any SW wake. Queue drained not only on `onStartup`/`onInstalled` but also whenever the SW is already awake handling any event (next citation/message event, or the next `SUBMIT_REPORT`).

**D-03:** Per-entry retry state persisted on disk. Each `bugReportQueue` entry carries its own `attemptCount` and `nextAttemptAt` (and `enqueuedAt` for TTL). Drains honour `nextAttemptAt` so backoff is NOT reset across SW deaths.

**D-04:** 4xx (except 429) → permanent drop, no retry. 429 → retry with full backoff. 5xx → retry with backoff. Network/fetch-throw → retry with backoff. After 3 attempts → dropped silently. (A dedup hit returns HTTP 200, so dedup is never a 4xx drop.)

**D-05:** Rate-limit check runs FIRST — before any disk write or fetch. On ceiling hit (6th submit within 10-min window), the report is dropped entirely (no queue write, no Worker invocation). Returns `rateLimited: true` to caller.

**D-06:** Background owns all logic + storage; content-script caller renders all toasts. Return shape: `{ ok, queued, fingerprint, rateLimited, dropped }`.

**D-07:** Background-initiated retries (drain) are silent — no toast.

**D-08:** Return shape is a superset of XPORT-05's `{ ok, queued, fingerprint }` — adds `rateLimited` and `dropped` flags.

**D-09:** Per-target Vitest (`vitest.config.chrome.js` + `vitest.config.firefox.js`) drives the handler directly with mocked `chrome.storage.local` and `vi.useFakeTimers()`. SW termination simulated by discarding in-memory state and re-invoking the `onStartup` drain handler against persisted `chrome.storage.local`.

**D-10:** Live manual SW stop+restart is NOT a Phase 3 deliverable — deferred to Phase 5 UAT-05.

### Claude's Discretion

- Exact `setTimeout` wiring / whether to keep the SW alive during a short backoff gap, within the D-01 best-effort model.
- Concurrent read-modify-write protection on `bugReportQueue` / `bugReportRateLimitWindow` (the SW already uses a mutex pattern via `creatingOffscreen`) — pick the simplest correct approach.
- Queue cap-20 eviction ordering and 7-day TTL pruning timing (on enqueue vs on drain vs both), within QUEUE-02.
- How the Bearer `PROXY_TOKEN` header is sourced for the background fetch (follow the existing Worker-call convention in the codebase).
- Exact toast-result→message mapping and the internal structure of the shared submit/drain helper.
- Vitest file layout and how the `chrome.storage.local` mock is built (follow existing `tests/unit/` chrome-stub patterns).

### Deferred Ideas (OUT OF SCOPE)

- Live manual SW stop+restart cross-browser test — deferred to Phase 5 UAT-05.
- Numeric-confidence → `confidenceTier` mapping + live `context` capture — Phase 4.
- `chrome.alarms`-backed durable retry — explicitly rejected in D-01.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| XPORT-05 | Background handler for `MSG.SUBMIT_REPORT` added identically to Chrome SW and Firefox background; receives payload, performs fetch, returns `{ok, queued, fingerprint}` | Shared helper in `src/shared/` imported by both; esbuild bundles ESM for both backgrounds |
| XPORT-06 | Content scripts NEVER make cross-origin POSTs; Vitest static-grep asserts no `fetch(WORKER_REPORT_URL` in `src/content/` | Grep assertion pattern established in Phase 2 test suite |
| LIMIT-03 | Client-side sliding-window rate limit — max 5 / 10 min, key `bugReportRateLimitWindow`, pruned per attempt, LIMIT-03 toast on ceiling | `chrome.storage.local` get/set pattern exists throughout SW; D-05 locks check-first ordering |
| QUEUE-01 | Disk-first persistence — payload written to `bugReportQueue` BEFORE fetch; removed atomically on success | `chrome.storage.local` is the sole state store; disk-write-before-fetch is the PITFALLS Pitfall 6 mitigation |
| QUEUE-02 | Retry policy — max 3 attempts, 2s/8s/30s backoff, 7-day TTL, cap 20 (oldest dropped), retry on next extension load | D-03 per-entry `attemptCount`/`nextAttemptAt` fields enable backoff survival; D-01 `setTimeout` executes short gaps |
| QUEUE-03 | Non-retryable failure handling — 4xx (except 429) permanent-drop; 429/5xx/network retry; after 3 failures drop silently | D-04 locks the exact policy; Worker 400 on malformed (Phase 1 D-09) makes 4xx permanent-drop correct |
| QUEUE-04 | User-visible feedback — success toast, queued-for-retry toast, no toast on permanent-drop; reuse yellow/green toast styling | `showSuccessToast`/`showFailureToast` exist at `citation-ui.js:311,354`; D-06 mandates background→caller result shape |
</phase_requirements>

---

## Summary

Phase 3 builds the extension-side transport layer that connects content script submissions to the Phase 1 Worker endpoint. It is a pure-logic phase: no new npm packages, no UI components (those land in Phase 4), no manifest changes. All the architectural decisions are locked in CONTEXT.md D-01 through D-10.

The primary implementation challenge is not the algorithm — the rate limit and retry logic are straightforward — but the **read-modify-write serialisation** of `chrome.storage.local` and the **module boundary design** for the shared helper. The SW's existing `creatingOffscreen` mutex pattern provides the precedent for serialisation. The esbuild pipeline bundles `src/shared/*.js` as ESM for both background targets, which means a plain ES module in `src/shared/report-transport.js` (or similar) is importable by both `src/background/service-worker.js` and `src/firefox/background.js` without any build-config changes.

The Vitest test design is the other load-bearing concern: the chrome-stub at `tests/setup/chrome-stub.js` stubs `chrome.storage.local.get` and `chrome.storage.local.set` as bare `vi.fn()` returns. For Phase 3 tests these must be upgraded to stateful mocks (per-test in-memory storage) so that read-modify-write assertions are meaningful. `vi.useFakeTimers()` is the established pattern (used in `tests/unit/select-cron-cases.test.js`) for advancing the 2s/8s/30s `setTimeout` intervals without real wall-clock waits.

**Primary recommendation:** Author the shared helper in `src/shared/report-transport.js` as an ES module with purely functional exports (`submitReport`, `drainQueue`, `checkRateLimit`). Both background files call these functions identically. Tests import the helper directly (not the background file) to isolate logic from the `onMessage`/`onStartup` wiring.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Sliding-window rate limit check | Background / SW | — | Must run before any storage write; SW is the sole writer of `bugReportRateLimitWindow` (D-05, D-06) |
| Disk-first queue write | Background / SW | — | Must survive SW termination (Pitfall 6); `chrome.storage.local` is the only persistence layer available pre-fetch |
| Fetch POST to Worker | Background / SW | — | Content scripts cannot make cross-origin POSTs (XPORT-06, Pitfall 8); SW has `host_permissions` |
| Retry backoff execution | Background / SW | — | `setTimeout` in-session (D-01); no `chrome.alarms`, no separate scheduler |
| Queue drain on startup | Background / SW (onStartup) | Background / SW (opportunistic, D-02) | `onStartup` fires on browser restart; opportunistic drain fires on any wake |
| Return structured result to caller | Background / SW | Content script (toast rendering) | Background returns `{ ok, queued, fingerprint, rateLimited, dropped }` via `sendResponse`; content script maps result to toast (D-06) |
| Toast rendering | Content script / Browser | — | D-06: background owns all logic; caller renders; reuses `showSuccessToast`/`showFailureToast` from `citation-ui.js` |
| Test harness | Vitest (Node) | — | Tests import the shared helper directly; chrome.storage.local mocked statefully; `vi.useFakeTimers()` for backoff (D-09) |

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `chrome.storage.local` | MV3 built-in | Queue persistence + rate-limit window | Established pattern throughout the codebase; survives SW termination; 10MB quota; no new API needed |
| `fetch()` | SW built-in | POST to Worker `/report` | Same API used by `offscreen.js` and `pdf-pipeline.js` for Worker calls |
| `setTimeout` | SW built-in | In-session backoff (2s/8s/30s) | D-01 decision; no `chrome.alarms` permission required |
| `chrome.runtime.onStartup` | MV3 built-in | Queue drain trigger on browser restart | **No onStartup listener exists in the codebase yet** — Phase 3 introduces the first one |
| `chrome.runtime.onInstalled` | MV3 built-in | Queue drain trigger on extension install/update | Existing listener in both SW and Firefox background |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vi.useFakeTimers()` | Vitest ^3.0.0 | Advance `setTimeout` in tests without wall clock | Used in `select-cron-cases.test.js:34-35`; same pattern for 2s/8s/30s backoff tests |
| `vi.stubGlobal('chrome', ...)` | Vitest ^3.0.0 | Stub `chrome.storage.local` globally | Used in `tests/setup/chrome-stub.js`; Phase 3 tests extend this per-test |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `chrome.storage.local` for queue | IndexedDB | IDB is for large structured data (patent position maps); `storage.local` is right for small JSON objects (~5KB/report); no new API surface |
| `setTimeout` backoff | `chrome.alarms` | `chrome.alarms` has 30s minimum — cannot express 2s/8s; requires `alarms` permission, triggering store re-review; explicitly rejected D-01 |
| Per-test storage mock in test files | Extend `chrome-stub.js` globally | Global extension would affect all 55+ existing tests; per-test mock via `beforeEach` is safer and mirrors the test isolation pattern |

**Installation:** No new packages. Phase 3 adds zero npm dependencies. [ASSUMED: milestone constraint is sixth consecutive zero-new-deps milestone — confirmed by REQUIREMENTS.md DoD and STATE.md]

---

## Package Legitimacy Audit

> Phase 3 installs **no external packages**. The zero-new-npm-dependencies constraint (sixth consecutive milestone) is a locked milestone DoD. All functionality uses existing browser APIs (`chrome.storage.local`, `fetch`, `setTimeout`, `chrome.runtime.*`) and existing test tooling (Vitest ^3.0.0, already installed).

**Packages removed due to slopcheck [SLOP] verdict:** none (no packages evaluated)
**Packages flagged as suspicious [SUS]:** none

---

## Architecture Patterns

### System Architecture Diagram

```
Content Script
  └─ chrome.runtime.sendMessage({ type: 'submit-report', payload })
       │
       ▼
Background Handler (MSG.SUBMIT_REPORT branch in onMessage)
  │
  ├─[1] Rate-limit check — read bugReportRateLimitWindow from storage
  │      ├─ BLOCKED (6th in 10 min) → sendResponse({ rateLimited: true }) → done
  │      └─ OK → prune window, append timestamp, write back to storage
  │
  ├─[2] Disk-first queue write — append entry to bugReportQueue BEFORE fetch
  │      Entry shape: { payload, attemptCount: 0, nextAttemptAt: 0, enqueuedAt: Date.now() }
  │
  ├─[3] Attempt fetch → POST WORKER_REPORT_URL with Authorization: Bearer PROXY_TOKEN
  │      ├─ 200/201 → remove entry from queue; sendResponse({ ok: true, fingerprint })
  │      ├─ 4xx (≠429) → permanent drop; remove from queue; sendResponse({ dropped: true })
  │      ├─ 429/5xx/throw → update entry { attemptCount+1, nextAttemptAt: now+backoff }
  │      │    ├─ attemptCount < 3 → schedule setTimeout(drain, backoffMs); sendResponse({ queued: true })
  │      │    └─ attemptCount >= 3 → permanent drop silently; remove from queue; sendResponse({ dropped: true })
  │      └─ (also check 7-day TTL and cap-20 on enqueue)
  │
  └─[4] sendResponse returns to content script → content script renders toast

Drain path (onStartup / onInstalled / opportunistic):
  ├─ Read bugReportQueue from storage
  ├─ Filter entries where nextAttemptAt <= Date.now() AND enqueuedAt > (now - 7days)
  │    (drop TTL-expired entries)
  ├─ For each eligible entry: attempt fetch
  │    ├─ Success → remove entry
  │    ├─ 4xx (≠429) → remove entry (permanent drop)
  │    ├─ 429/5xx/throw AND attemptCount < 3 → update entry, re-queue
  │    └─ attemptCount >= 3 → remove entry (silent drop)
  └─ No sendResponse (drain is silent — D-07)
```

### Recommended Project Structure

```
src/
├── shared/
│   ├── constants.js          # [EXISTING] MSG.SUBMIT_REPORT, WORKER_REPORT_URL, REPORT_CATEGORIES
│   ├── report-payload-builder.js  # [EXISTING Phase 2] buildReportPayload()
│   └── report-transport.js   # [NEW Phase 3] submitReport(), drainQueue(), checkRateLimit()
├── background/
│   └── service-worker.js     # [MODIFIED] add MSG.SUBMIT_REPORT branch + onStartup drain
└── firefox/
    └── background.js         # [MODIFIED] identical MSG.SUBMIT_REPORT branch + onStartup drain

tests/unit/
├── report-transport-chrome.test.js  # [NEW] Vitest for Chrome target
└── report-transport-firefox.test.js # [NEW] Vitest for Firefox target (or shared if identical)
```

### Pattern 1: Adding MSG.SUBMIT_REPORT to the onMessage dispatch chain

**What:** New `else if` branch in the existing `chrome.runtime.onMessage.addListener` callback in both background files. The handler must `return true` to keep the `sendResponse` channel open for the async submit.

**When to use:** Any time the background needs to respond asynchronously to a content-script message.

**Example (mirroring service-worker.js:132-156 pattern):**
```javascript
// Source: src/background/service-worker.js:132-156 [VERIFIED: direct code read]
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  // ... existing branches ...
  } else if (message.type === MSG.SUBMIT_REPORT) {
    handleSubmitReport(message.payload)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ ok: false, dropped: true }));
    return true; // Keep channel open for async sendResponse
  }
  // GET_STATUS already uses this pattern at line 154-156
});
```

### Pattern 2: chrome.storage.local read-modify-write serialisation

**What:** The SW uses a mutex pattern (`creatingOffscreen` Promise at `service-worker.js:49`) to prevent concurrent document creation. The same principle applies to queue read-modify-write: a module-level `let draining = null` Promise prevents concurrent drain attempts from racing.

**When to use:** Any time two concurrent events could both read-then-write the same `chrome.storage.local` key.

**Example (adapted from the creatingOffscreen pattern at service-worker.js:49-78):**
```javascript
// Source: src/background/service-worker.js:49-78 [VERIFIED: direct code read]
// Mutex for queue drain — prevents race between concurrent onMessage + onStartup events
let drainingQueue = null;

async function drainQueueOnce() {
  if (drainingQueue) {
    return drainingQueue; // Already draining — wait for it
  }
  drainingQueue = _doDrain();
  try {
    await drainingQueue;
  } finally {
    drainingQueue = null;
  }
}
```

### Pattern 3: chrome.storage.local get/set for small structured state

**What:** Existing pattern throughout `service-worker.js` — e.g., `currentPatent` at lines 171/206/249/249/390/394.

**When to use:** Persisting queue entries and rate-limit timestamps.

**Example (from service-worker.js:171):**
```javascript
// Source: src/background/service-worker.js:171 [VERIFIED: direct code read]
await chrome.storage.local.set({ currentPatent: { ... } });
// Read:
const data = await chrome.storage.local.get('bugReportQueue');
const queue = data.bugReportQueue ?? [];
```

### Pattern 4: Bearer PROXY_TOKEN fetch header

**What:** `PROXY_TOKEN` is a hardcoded string constant in `offscreen.js:24` and `pdf-pipeline.js:23`. The report fetch must use the same `Authorization: Bearer` pattern.

**When to use:** Any fetch to `pct.tonyrowles.com` from the extension.

**Example (from offscreen.js:247):**
```javascript
// Source: src/offscreen/offscreen.js:24,247 [VERIFIED: direct code read]
const PROXY_TOKEN = '4509b9943f831fb140eb0c3a7304f23cc6f72e41b5e5f8c800a42e94f09cadbe';
// Usage:
const resp = await fetch(WORKER_REPORT_URL, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${PROXY_TOKEN}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(payload),
});
```

**Architectural note:** The `PROXY_TOKEN` is duplicated in `offscreen.js` and `pdf-pipeline.js` — each file defines its own `const`. The shared report helper SHOULD follow the same local-const pattern rather than adding it to `constants.js` (which is the pure-module shared between content and background contexts; adding a token there would expose it more broadly). [ASSUMED: same local-const approach as offscreen.js is the right convention — no explicit decision in CONTEXT.md but matches established pattern]

### Pattern 5: Vitest fake-timer + stateful chrome.storage mock

**What:** The existing `tests/setup/chrome-stub.js` stubs `chrome.storage.local.get` and `.set` as bare `vi.fn()` with no internal state. Phase 3 tests need stateful mocks that actually store and retrieve values, so that read-modify-write assertions work correctly.

**When to use:** Any test that exercises `chrome.storage.local` read-modify-write behaviour.

**Example (building on tests/setup/chrome-stub.js and tests/unit/select-cron-cases.test.js:34-35):**
```javascript
// Source: tests/setup/chrome-stub.js [VERIFIED: direct code read] +
//         tests/unit/select-cron-cases.test.js:34 [VERIFIED: direct code read]
import { vi, beforeEach, afterEach } from 'vitest';

let _localStore = {};

beforeEach(() => {
  vi.useFakeTimers();
  _localStore = {};
  // Override the global chrome stub's storage.local with stateful fns
  chrome.storage.local.get.mockImplementation(async (keys) => {
    if (typeof keys === 'string') return { [keys]: _localStore[keys] };
    // Array or null — omitted for brevity
    return Object.fromEntries(Object.keys(keys ?? _localStore).map(k => [k, _localStore[k]]));
  });
  chrome.storage.local.set.mockImplementation(async (obj) => {
    Object.assign(_localStore, obj);
  });
});

afterEach(() => {
  vi.useRealTimers();
});
```

**SW termination simulation:** To simulate SW death, simply clear in-memory module state (e.g., `drainingQueue = null`) and call the `onStartup` drain handler directly against the persisted `_localStore`. The test then asserts the queue entry is retried without needing a real browser restart (D-09).

### Anti-Patterns to Avoid

- **Storing the retry queue in a module-level array:** `let pendingQueue = []` in `service-worker.js` is wrong — lost on SW termination (Pitfall 6). All state must be in `chrome.storage.local` before any fetch attempt.
- **Running the fetch BEFORE writing to the queue:** violates the QUEUE-01 disk-first requirement. The disk write must complete (`await chrome.storage.local.set(...)`) before `fetch()` is called.
- **Retrying on HTTP 4xx (except 429):** a 400 means the payload is malformed and will never succeed. Retrying wastes quota and grows the queue (Pitfall 10). Drop immediately.
- **Adding chrome.storage.local mock state to the global `chrome-stub.js`:** would affect all 55+ existing tests. Use per-test `mockImplementation` in `beforeEach` instead.
- **Importing the background module directly in tests:** `service-worker.js` and `firefox/background.js` register top-level event listeners on import, which is hard to control in Node.js test environments. Import the shared helper (`src/shared/report-transport.js`) directly instead.
- **Adding `onStartup` to `vitest.config.chrome.js` as a new `include` without also extending `vitest.config.firefox.js`:** the per-target Vitest configs must both include the new test files.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Token-gated fetch | Custom auth wrapper | `Authorization: Bearer ${PROXY_TOKEN}` in the fetch headers, same as `offscreen.js:247` | Already the project convention; no abstraction needed |
| Queue persistence | Custom IndexedDB adapter | `chrome.storage.local` | Established codebase pattern; 10MB quota; survives SW termination; synchronous-looking async API |
| Read-modify-write lock | Semaphore library | Module-level `let drainingQueue = null` Promise mutex | Same pattern as `creatingOffscreen` in `service-worker.js:49`; 5 LOC |
| Test timer control | Custom timer mock | `vi.useFakeTimers()` / `vi.advanceTimersByTime(2000)` | Vitest built-in; established in `select-cron-cases.test.js:34` |
| Backoff calculation | Third-party retry library | `const BACKOFFS_MS = [2000, 8000, 30000]; backoffMs = BACKOFFS_MS[entry.attemptCount] ?? 30000` | Three hardcoded values; no library justified (zero-new-deps constraint) |

**Key insight:** The entire Phase 3 feature is a composition of existing browser APIs and codebase patterns. The complexity is in the ordering of operations (check rate limit → write disk → fetch → conditionally schedule retry) not in any individual operation. Each step is a well-understood `chrome.storage.local` read or `fetch()` call.

---

## Common Pitfalls

### Pitfall 1: Fetch before disk write (violates QUEUE-01)

**What goes wrong:** If the fetch is called before writing to `bugReportQueue`, and the SW is terminated during the in-flight request (rare but possible on slow connections), the report is lost with no recovery path.

**Why it happens:** Developers naturally place the "write to queue" step after a successful fetch as a "retry-only" fallback, inverting the correct ordering.

**How to avoid:** The queue entry must be written to `chrome.storage.local` as the FIRST operation after the rate-limit check passes. The fetch is the delivery attempt against an already-persisted entry. On success, remove the entry. On failure, update its retry fields. [VERIFIED: Pitfall 6 in `.planning/research/PITFALLS.md`]

**Warning signs:** Code that checks `if (fetchSuccess) { removeFromQueue() }` but does not write to queue before the fetch.

### Pitfall 2: Race between concurrent drain invocations

**What goes wrong:** If `onStartup` fires while an `onMessage` handler is midway through a drain (e.g., the SW was kept alive by a citation event that also triggered a drain), two concurrent read-modify-write cycles on `bugReportQueue` can cause one to overwrite the other's changes — entries get double-attempted or removed prematurely.

**Why it happens:** `chrome.storage.local` has no transactions. Two concurrent `get → modify → set` cycles will race if both read before either writes.

**How to avoid:** Module-level mutex (`let drainingQueue = null`) — same pattern as `creatingOffscreen` at `service-worker.js:49`. If drain is already in progress, subsequent drain triggers await the in-progress promise rather than starting a second concurrent drain.

**Warning signs:** Intermittent test failures where the queue count after a drain is wrong; entries appear double-sent.

### Pitfall 3: Incorrect async return from onMessage for SUBMIT_REPORT

**What goes wrong:** The `chrome.runtime.onMessage.addListener` callback must `return true` synchronously to keep the `sendResponse` channel open for async operations. If the SUBMIT_REPORT branch calls an async handler but does NOT return `true`, the channel closes before `sendResponse` is called and the content script receives `undefined`.

**Why it happens:** The existing branches in both background files do NOT `return true` (they fire-and-forget or call `sendResponse` synchronously). The SUBMIT_REPORT branch is the only handler that needs async `sendResponse`.

**How to avoid:** The `else if (message.type === MSG.SUBMIT_REPORT)` branch must `return true`. Compare with the existing `GET_STATUS` branch at `service-worker.js:153-155` — that is the exact precedent to mirror. [VERIFIED: direct code read, service-worker.js:153-156]

### Pitfall 4: vitest.config.chrome.js and vitest.config.firefox.js currently only include text-matcher and shared-matching tests

**What goes wrong:** The per-target Vitest configs (`vitest.config.chrome.js`, `vitest.config.firefox.js`) currently include only `tests/unit/text-matcher.test.js` and `tests/unit/shared-matching.test.js`. New report-transport test files must be explicitly added to the `include` arrays in BOTH configs. Forgetting to update the configs means the tests are never run by `npm run test:chrome` / `npm run test:firefox`.

**Why it happens:** The per-target configs use explicit `include` arrays (not glob patterns), so new files are silently ignored.

**How to avoid:** Add `'tests/unit/report-transport-chrome.test.js'` to `vitest.config.chrome.js` and `'tests/unit/report-transport-firefox.test.js'` to `vitest.config.firefox.js` in the same commit that creates the test files. [VERIFIED: direct code read of both config files]

### Pitfall 5: The shared helper is imported by background but tested as a Node.js module

**What goes wrong:** `src/shared/report-transport.js` calls `chrome.storage.local` and other Chrome APIs. In the test environment (Node.js via Vitest), these APIs do not exist natively. If the helper is not designed to accept the `chrome` global from the `tests/setup/chrome-stub.js` injection, tests will throw `ReferenceError: chrome is not defined`.

**Why it happens:** The `chrome-stub.js` sets the global via `vi.stubGlobal('chrome', chromeMock)` in the `setupFiles` — this works for modules that reference `chrome` at runtime. ES modules that reference `chrome` at import time (top-level) will fail. The report-transport helper must reference `chrome` inside function bodies, not at module scope.

**How to avoid:** Never write `const storage = chrome.storage.local` at module scope. Reference `chrome.storage.local` inside async functions. [VERIFIED: confirmed by reading chrome-stub.js and understanding that vi.stubGlobal runs before test execution, not before module parse]

### Pitfall 6: Per-target configs resolve aliases to dist/ bundles — shared/ modules must import from src/

**What goes wrong:** `vitest.config.chrome.js` and `vitest.config.firefox.js` use `resolve.alias` to redirect `src/shared/matching.js` to `dist/chrome/matching-exports.js` or `dist/firefox/matching-exports.js`. If the report-transport helper is tested via the per-target configs AND imports from `src/shared/constants.js`, the alias may inadvertently redirect something unexpected.

**Why it happens:** The alias in the per-target configs is a regex targeting `matching.js` specifically — it will NOT redirect `constants.js` or `report-transport.js`. [VERIFIED: direct code read of vitest.config.chrome.js:12-17]

**How to avoid:** The report-transport test files can safely import `src/shared/constants.js` and `src/shared/report-transport.js` directly. The existing matching-alias is scoped to `matching.js` only and does not affect other shared modules. No new alias is needed.

---

## Code Examples

### Backoff schedule — literal three-entry array

```javascript
// Source: CONTEXT.md D-01 / QUEUE-02 [VERIFIED: direct context read]
const BACKOFF_MS = [2_000, 8_000, 30_000]; // 2s / 8s / 30s

function nextBackoffMs(attemptCount) {
  return BACKOFF_MS[attemptCount] ?? BACKOFF_MS[BACKOFF_MS.length - 1];
}
```

### Queue entry shape (D-03)

```javascript
// Source: CONTEXT.md D-03 / specifics section [VERIFIED: direct context read]
const entry = {
  payload,          // the buildReportPayload() output, ready to POST
  attemptCount: 0,  // incremented on each failed attempt
  nextAttemptAt: 0, // epoch ms; 0 = immediately eligible
  enqueuedAt: Date.now(), // epoch ms; used for 7-day TTL check
};
```

### Rate-limit window pruning (LIMIT-03)

```javascript
// Source: CONTEXT.md D-05 / REQUIREMENTS.md LIMIT-03 [VERIFIED: direct context read]
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

async function checkAndUpdateRateLimit() {
  const now = Date.now();
  const { bugReportRateLimitWindow: raw } = await chrome.storage.local.get('bugReportRateLimitWindow');
  const window = (raw ?? []).filter(ts => now - ts < RATE_LIMIT_WINDOW_MS);
  if (window.length >= RATE_LIMIT_MAX) {
    return false; // blocked
  }
  window.push(now);
  await chrome.storage.local.set({ bugReportRateLimitWindow: window });
  return true; // allowed
}
```

### Queue cap-20 with oldest-drop eviction (QUEUE-02)

```javascript
// Source: CONTEXT.md specifics section / REQUIREMENTS.md QUEUE-02 [VERIFIED]
const QUEUE_CAP = 20;
const QUEUE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function enqueueAndCap(queue, newEntry) {
  const now = Date.now();
  // Prune expired entries on enqueue
  let q = queue.filter(e => now - e.enqueuedAt < QUEUE_TTL_MS);
  q.push(newEntry);
  // If over cap, drop oldest (by enqueuedAt)
  if (q.length > QUEUE_CAP) {
    q.sort((a, b) => a.enqueuedAt - b.enqueuedAt);
    q = q.slice(q.length - QUEUE_CAP);
  }
  return q;
}
```

### onStartup drain (Chrome SW — first ever onStartup in the codebase)

```javascript
// Source: CONTEXT.md canonical_refs — "No onStartup listener exists anywhere yet"
// [VERIFIED: grep confirms no onStartup in src/]
chrome.runtime.onStartup.addListener(() => {
  drainQueueOnce(); // fire-and-forget; drain is silent (D-07)
});
```

### Vitest SW termination simulation (D-09)

```javascript
// Source: CONTEXT.md D-09 [VERIFIED: direct context read]
// Tests import the shared helper directly — not the SW module
import { drainQueue, _resetMutex } from '../../src/shared/report-transport.js';

it('queued report survives SW death and is retried on next onStartup drain', async () => {
  // Seed: submit fails → entry in storage with attemptCount=1
  // ... (setup _localStore with a queued entry)

  // Simulate SW death: discard in-memory state
  _resetMutex(); // if the helper exposes this for testing

  // Simulate onStartup: call drain against the persisted storage
  vi.mocked(global.fetch).mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({ ok: true, fingerprint: 'abc' }) });
  await drainQueue();

  // Queue should now be empty — retry succeeded
  const { bugReportQueue } = _localStore;
  expect(bugReportQueue ?? []).toHaveLength(0);
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| In-memory retry queue | Disk-first `chrome.storage.local` queue | MV3 specification (Chrome 88+) | Mandatory for MV3; SW can die at any time; in-memory state is ephemeral |
| `setInterval` polling for retries | `setTimeout` + drain-on-wake (D-01/D-02) | MV3 best practice | `setInterval` is unreliable in SWs (cleared on termination); drain-on-wake is the canonical pattern |
| `chrome.alarms` for durable scheduling | `setTimeout` for short gaps + `onStartup` for persistence | D-01 decision | `chrome.alarms` minimum is 1 minute (actually 30s for Chrome, but cannot express 2s/8s); adds permission |

**Deprecated/outdated:**
- Memory-only queues in MV3 SWs: These are not persisted and are silently lost on SW termination. Any code like `let pendingRequests = []` at module scope is wrong for retry queues.
- `chrome.storage.session`: Available since Chrome 102, but NOT available in Firefox MV3 event pages. The queue must use `chrome.storage.local` for cross-browser compatibility.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `PROXY_TOKEN` for the background fetch should follow the same local-const pattern as `offscreen.js:24` and `pdf-pipeline.js:23` (not added to `constants.js`) | Code Examples | Low — if it goes into `constants.js`, it is still technically correct; just a style deviation from existing conventions |
| A2 | The report-transport test files for Chrome and Firefox targets can be the same file if the logic is truly identical, requiring only one test file added to both per-target configs | Architecture Patterns | Low — if Chrome/Firefox diverge in the helper, two distinct test files are needed; the CONTEXT.md says "identical dispatch shape" so divergence is unlikely |
| A3 | The shared helper should export `drainQueue` and a `_resetMutex` (or equivalent) for test-accessible mutation of the module-level drain mutex | Code Examples | Medium — if the mutex is not exported, tests must use a different strategy (e.g., module re-import via Vitest's `vi.resetModules()`) to simulate SW death |

---

## Open Questions

1. **PROXY_TOKEN in `src/shared/report-transport.js`**
   - What we know: `offscreen.js` and `pdf-pipeline.js` each define `const PROXY_TOKEN = '...'` locally; neither imports it from `constants.js`.
   - What's unclear: Whether the report-transport helper should define it locally (following the pattern) or whether Phase 3 is the right time to centralise it (e.g., into `constants.js` or a new `src/shared/auth-token.js`).
   - Recommendation: Follow the existing local-const pattern. Centralisation is a separate refactor out of Phase 3 scope (deferred per REQUIREMENTS.md "Out of Scope" section on PROXY_TOKEN refactoring in `offscreen.js`).

2. **Opportunistic drain trigger (D-02) — where exactly?**
   - What we know: D-02 says "drain on any SW wake" including on citation events. The existing message handler handles many message types that do not involve the queue.
   - What's unclear: Whether to call `drainQueueOnce()` at the top of the `onMessage` listener (drains on every message) or only in the `SUBMIT_REPORT` branch (drains on report events only).
   - Recommendation: Call `drainQueueOnce()` at the entry of the `onMessage` listener — this is the "any event" interpretation of D-02 and maximises drain frequency without adding new event listeners.

3. **Chrome.storage.local.remove vs. set with entry filtered out**
   - What we know: `chrome.storage.local.remove('key')` exists, but the queue is an array under a single key `bugReportQueue`. Removing individual entries means reading the array, filtering, and writing back.
   - What's unclear: No explicit decision in CONTEXT.md on whether to use a single-key array or per-entry keys (`bugReportQueue:${id}`).
   - Recommendation: Single-key array (`bugReportQueue: [...]`) matches the CONTEXT.md storage key name literally and is simpler to reason about atomically. Filter-and-replace is the standard read-modify-write pattern.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Vitest test runner | Yes | v24.11.1 | — |
| npm | Install/test scripts | Yes | 11.6.2 | — |
| Vitest | `npm run test:src`, `test:chrome`, `test:firefox` | Yes | ^3.0.0 (installed) | — |
| `dist/chrome/` and `dist/firefox/` bundles | `vitest.config.chrome.js` resolve alias | Only after `npm run build` | — | Run `npm run build` in Wave 0 task |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** The per-target Vitest configs resolve an alias to `dist/chrome/matching-exports.js` and `dist/firefox/matching-exports.js`. If the dist does not exist, `test:chrome` and `test:firefox` fail on the existing `text-matcher` and `shared-matching` test includes. The new report-transport tests do NOT use this alias — they import from `src/shared/` directly — so they will pass even without a build. The Wave 0 task should run `npm run build` to keep the full test suite green, not just the new tests.

---

## Validation Architecture

> `nyquist_validation` is explicitly `false` in `.planning/config.json` — this section is **SKIPPED** per config.

---

## Security Domain

> `security_enforcement` is not explicitly set in `.planning/config.json` — treating as enabled (absent = enabled).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | PROXY_TOKEN gate is at the Worker (Phase 1); extension-side logic does not authenticate users |
| V3 Session Management | No | No session state; stateless queue entries identified by `enqueuedAt` timestamp |
| V4 Access Control | No | The `chrome.runtime.onMessage` listener only fires for messages from the same extension (browser-enforced) |
| V5 Input Validation | Yes | The `buildReportPayload()` builder (Phase 2, D-05) already throws on invalid input; the transport handler should not re-validate but should guard against null/undefined payload defensively |
| V6 Cryptography | No | No crypto operations in Phase 3 (fingerprint computed server-side in Phase 1 Worker) |

### Known Threat Patterns for MV3 Extension Background

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malicious page calls `chrome.runtime.sendMessage` with fabricated payload | Tampering | `chrome.runtime.onMessage` only accepts messages from the same extension by default; no external message port is opened; `buildReportPayload()` D-05 validation throws on required-field violations |
| Content script passes attacker-controlled URL in payload | Tampering | Phase 1 Worker strips and validates URL; Phase 3 transport passes the payload as-is from `buildReportPayload()` which only accepts validated fields; URL is not sourced from the message in Phase 3 (Phase 4 concern) |
| Retry queue grows unbounded | Denial of Service | Queue cap-20 with oldest-drop eviction (QUEUE-02); 7-day TTL; 3-attempt max (QUEUE-03) |
| Rate limit bypassed by restarting extension | Spoofing | `bugReportRateLimitWindow` persisted in `chrome.storage.local` (not in-memory), so restart does not reset the window |

---

## Sources

### Primary (HIGH confidence)
- `src/background/service-worker.js` — direct code read; `onMessage` dispatch at line 132; `creatingOffscreen` mutex at line 49; `chrome.storage.local` patterns at lines 171/206/249/390/394; `return true` pattern at line 155; no `onStartup` listener confirmed by grep
- `src/firefox/background.js` — direct code read; `onMessage` at line 106; `onInstalled` at line 60; `return true` pattern at line 117
- `src/offscreen/offscreen.js` lines 24/247 + `src/firefox/pdf-pipeline.js` lines 23/194 — PROXY_TOKEN local-const pattern confirmed
- `src/shared/constants.js` — MSG.SUBMIT_REPORT, WORKER_REPORT_URL, REPORT_CATEGORIES confirmed present (Phase 2 shipped)
- `src/shared/report-payload-builder.js` — Phase 2 pure function confirmed present
- `vitest.config.chrome.js` + `vitest.config.firefox.js` — per-target configs include only matching tests; `setupFiles: ['./tests/setup/chrome-stub.js']`; resolve alias scoped to `matching.js`
- `tests/setup/chrome-stub.js` — `vi.stubGlobal('chrome', chromeMock)` with `chrome.storage.local.get/.set` as bare `vi.fn()`
- `tests/unit/select-cron-cases.test.js:34-35` — `vi.useFakeTimers()` / `vi.useRealTimers()` established pattern
- `.planning/phases/03-background-submission-handler-rate-limit-retry-queue/03-CONTEXT.md` — all D-01..D-10 decisions
- `.planning/research/PITFALLS.md` — Pitfall 6 (SW termination disk-first), Pitfall 8 (CORS), Pitfall 10 (retry loop), Pitfall 12 (arch debt) all confirmed applicable

### Secondary (MEDIUM confidence)
- `scripts/build.js` — esbuild config confirmed: Chrome ESM at `src/background/service-worker.js`, Firefox ESM at `src/firefox/background.js` (with `out: 'background/service-worker'` rename); both `src/shared/*.js` modules are bundled into both ESM outputs
- `vitest.config.js` (root) — `include: ['tests/**/*.test.js']` covers all unit tests for `npm run test:src`; `fileParallelism: false` avoids lint race

### Tertiary (LOW confidence)
- None — all research grounded in direct codebase reads or locked CONTEXT.md decisions.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all APIs are MV3 built-ins already used in the codebase
- Architecture: HIGH — derived from direct code reads and locked CONTEXT.md decisions
- Pitfalls: HIGH — confirmed against actual source files and project PITFALLS.md
- Test patterns: HIGH — confirmed against existing test files in `tests/unit/` and `tests/setup/`

**Research date:** 2026-06-13
**Valid until:** 2026-09-13 (stable — all findings are codebase-internal, not version-dependent)

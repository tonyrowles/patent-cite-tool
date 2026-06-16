---
phase: 03-background-submission-handler-rate-limit-retry-queue
reviewed: 2026-06-13T00:00:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - src/shared/report-transport.js
  - src/background/service-worker.js
  - src/firefox/background.js
  - tests/unit/report-transport-chrome.test.js
  - tests/unit/report-transport-firefox.test.js
  - vitest.config.chrome.js
  - vitest.config.firefox.js
findings:
  critical: 1
  warning: 4
  info: 1
  total: 6
resolutions:
  CR-01: fixed (commit follows) — all bugReportQueue/rate-window RMW serialized through a single storageLock promise chain; regression test added (report-transport-chrome.test.js "CR-01 — concurrent submit + drain")
  WR-03: fixed — fire-and-forget drainQueueOnce() call sites + internal setTimeout retry now .catch(() => {}) (D-07 silent; avoids MV3 SW termination on unhandled rejection)
  WR-01: deferred (advisory) — enqueuedAt millisecond-collision identity; low real-world likelihood
  WR-02: deferred (advisory) — PROXY_TOKEN triplication; pre-existing pattern (offscreen.js, pdf-pipeline.js), broader refactor
  WR-04: deferred (advisory) — SC3 test uses sync timer advance; test-quality only, suite is green
  IN-01: deferred (advisory) — explicit 3xx branch; unreachable (fetch auto-follows redirects)
status: critical_resolved
---

# Phase 03: Code Review Report

**Reviewed:** 2026-06-13
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

This phase implements a shared report-transport helper (`src/shared/report-transport.js`)
wired into both Chrome's service-worker and Firefox's background script via an identical
`MSG.SUBMIT_REPORT` dispatch branch. The disk-first invariant, 3x exponential backoff,
TTL pruning, queue-cap eviction, and rate-limit window are all structurally sound and
individually correct. However, one unambiguous data-loss race exists at the dispatch layer,
several weaker correctness concerns exist inside the transport module itself, and the test
suite has one reliability gap that could cause intermittent failures.

---

## Critical Issues

### CR-01: Concurrent `drainQueueOnce` + `submitReport` race on `bugReportQueue` (data loss)

**File:** `src/background/service-worker.js:140,165` and `src/firefox/background.js:114,127`

**Issue:** Every `MSG.SUBMIT_REPORT` message fires `drainQueueOnce()` as a fire-and-forget
(line 140 / line 114) and then immediately starts `submitReport()` (line 165 / line 127).
These two async operations run **concurrently** with no mutual exclusion over
`chrome.storage.local`. `drainQueueOnce` is guarded by the `drainingQueue` mutex only
against other drain callers — it is not guarded against a concurrent `submitReport`.

Both paths perform read-modify-write cycles on `bugReportQueue`:

- `drainQueueOnce → _doDrain → attemptEntry → _removeEntryFromQueue/_updateEntryInQueue`
  each read the queue, mutate it, and write it back.
- `submitReport` independently reads the queue (line 111), appends a new entry, and writes
  it back (line 126).

If `submitReport`'s read races with `drainQueueOnce`'s write (or vice versa), the last
writer wins and the earlier writer's changes are silently discarded. The practical outcome:

- An existing queued entry updated by drain (new `attemptCount`/`nextAttemptAt`) gets
  overwritten back to its old value by `submitReport`'s stale read, causing the retry
  backoff state to be lost.
- Alternatively, drain removes a successfully-delivered entry, but `submitReport`'s stale
  read still sees it and writes it back, causing a phantom re-submission attempt.

This race is reproducible whenever a `SUBMIT_REPORT` message arrives while a non-empty
retry queue exists — a normal production scenario after any prior network failure.

**Fix:** Do not fire `drainQueueOnce()` opportunistically on `SUBMIT_REPORT` messages.
The `submitReport()` path already schedules a `setTimeout(drainQueueOnce, backoffMs)` for
any queued entry, so the drain will happen. Remove the opportunistic drain call from the
`SUBMIT_REPORT` branch (or gate it so it only fires when the incoming message type is NOT
`SUBMIT_REPORT`):

```js
// service-worker.js / firefox/background.js onMessage handler

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Only drain opportunistically for non-SUBMIT_REPORT messages.
  // submitReport() schedules its own retry drain via setTimeout.
  if (message.type !== MSG.SUBMIT_REPORT) {
    drainQueueOnce();
  }
  // ... rest of dispatch
});
```

---

## Warnings

### WR-01: `enqueuedAt` used as entry identity key — millisecond collision corrupts queue

**File:** `src/shared/report-transport.js:233,244`

**Issue:** `_removeEntryFromQueue` and `_updateEntryInQueue` both identify an entry by
`entry.enqueuedAt`. The remove filter is `e.enqueuedAt !== entry.enqueuedAt`; the update
map is `e.enqueuedAt === entry.enqueuedAt ? entry : e`. If two entries share the same
millisecond timestamp, **both** are removed or both are updated when only one should be
targeted.

`Date.now()` resolution is 1ms in modern environments. Two rapid-fire submits, or any
drain processing entries that were enqueued in the same millisecond (e.g., pre-seeded by
a test or by a burst during recovery), can hit this. The collision causes silent data
loss: the untargeted entry disappears from the queue with no log entry.

**Fix:** Add a `nonce` field (e.g., `crypto.randomUUID()` or a module-level counter) to
the entry at enqueue time and use it as the identity key:

```js
// In submitReport(), when building the entry:
const entry = {
  id: crypto.randomUUID(),   // stable identity
  payload,
  attemptCount: 0,
  nextAttemptAt: 0,
  enqueuedAt: Date.now(),
};

// In _removeEntryFromQueue:
const queue = (...).filter(e => e.id !== entry.id);

// In _updateEntryInQueue:
const queue = (...).map(e => e.id === entry.id ? entry : e);
```

---

### WR-02: `PROXY_TOKEN` duplicated in three source files — rotation surface and DRY violation

**File:** `src/shared/report-transport.js:27` (new copy added this phase)
Also present at: `src/offscreen/offscreen.js:24`, `src/firefox/pdf-pipeline.js:23`

**Issue:** Phase 3 adds a third verbatim copy of the 64-hex-character bearer token. The
comment at line 24-26 of `report-transport.js` explicitly acknowledges the duplication.
Beyond the DRY violation, this creates a rotation hazard: rotating the token requires
finding and updating all three sites. A missed site leaves a stale credential silently
in place. Given that the token is already committed to git history in the other two files
(pre-dating this phase), the token is already in the extension binaries. But each additional
copy widens the rotation surface.

**Fix:** Centralize the token in one location. The comment justifies keeping it out of
`constants.js` to avoid exposing it to content scripts — that rationale is valid. Instead,
create a single `src/shared/proxy-token.js` that is only imported by background/offscreen
modules, never content scripts. All three current sites import from it:

```js
// src/shared/proxy-token.js  (never imported by content-script.js)
export const PROXY_TOKEN = '4509b9943f831fb140eb0c3a7304f23cc6f72e41b5e5f8c800a42e94f09cadbe';
```

---

### WR-03: `drainQueueOnce` storage errors propagate as unhandled rejections (violates D-07)

**File:** `src/shared/report-transport.js:264-274`

**Issue:** The design constraint D-07 states that drain is "silent." The drain mutex
wrapper correctly propagates errors from `_doDrain()` (the `try/finally` does not suppress
them). Callers — `drainQueueOnce()` in all three fire-and-forget call sites and the
`setTimeout(() => drainQueueOnce(), backoffMs)` at line 218 — do not `.catch()` the
returned promise. If `chrome.storage.local.get/set` throws (e.g., quota exceeded, storage
permission revoked, or a corrupt store that returns a rejected promise), the rejection is
unhandled. In Chrome MV3, unhandled rejections in service workers generate an error in the
browser's console and may terminate the SW in some browser versions.

`_removeEntryFromQueue` and `_updateEntryInQueue` (lines 231-247) are the most likely
to throw because they perform both a read and a write, doubling the storage-failure surface.

**Fix:** Swallow errors inside `drainQueueOnce` to honour D-07's silent contract:

```js
export async function drainQueueOnce() {
  if (drainingQueue) {
    return drainingQueue;
  }
  drainingQueue = _doDrain().catch(() => { /* silent per D-07 */ });
  try {
    await drainingQueue;
  } finally {
    drainingQueue = null;
  }
}
```

---

### WR-04: SC3 SW-death test uses synchronous `vi.advanceTimersByTime` — brittle coupling to async suspension point

**File:** `tests/unit/report-transport-chrome.test.js:226`
Also: `tests/unit/report-transport-firefox.test.js:195`

**Issue:** The "queued entry is retried after SW-death simulation" test uses
`vi.advanceTimersByTime(2001)` (synchronous) at line 226, then sets
`fetch.mockResolvedValueOnce(...)` at line 229, then calls `await drainQueueOnce()`.

This works today only because the drain's first `await` (at `chrome.storage.local.get`)
suspends execution before `fetch()` is called, allowing the mock to be set during the
intervening microtask pause. If the implementation is ever changed so that
`nextAttemptAt <= now` checking happens before the storage read, or if `_doDrain` is
restructured, the fetch mock may be consumed by the timer-triggered drain before line 229
sets it, causing the test to call a bare `vi.fn()` that returns `undefined` — producing a
`TypeError: Cannot read properties of undefined (reading 'ok')` inside an unhandled async
chain that corrupts the test's storage state silently.

The SC4 tests correctly use `await vi.advanceTimersByTimeAsync(...)` (lines 284, 291, 314)
for exactly this reason. The SC3 test should use the same pattern.

**Fix:** Replace the synchronous timer advance with its async equivalent and set the mock
before advancing (order-independent):

```js
// Step 2: simulate SW death
_resetMutex();

// Step 3: set the success mock BEFORE advancing time so the timer-triggered drain
// and the manual drain both see it regardless of ordering.
fetch.mockResolvedValueOnce(makeFetchResponse(true, 201, { fingerprint: 'retry-success' }));

// Step 4: advance time past the 2s backoff and await all async work
await vi.advanceTimersByTimeAsync(2001);

// Queue should be empty
expect(_localStore.bugReportQueue ?? []).toHaveLength(0);
```

Apply the same fix to the corresponding test in `report-transport-firefox.test.js:185-203`.

---

## Info

### IN-01: 3xx responses (non-redirect) fall through to retry path instead of permanent drop

**File:** `src/shared/report-transport.js:196-220`

**Issue:** `fetch()` with default settings follows redirects automatically, so 3xx
responses won't normally reach the response handler. However, if `WORKER_REPORT_URL` ever
returns a `301`/`308` with `redirect: 'error'` or `redirect: 'manual'` fetch option (or
if the `fetch` implementation behaves differently in the extension context), a 3xx response
would fall through to the retry path (lines 203-220) and be treated as a retryable error,
consuming all three backoff attempts before dropping. The condition at line 198 only
explicitly handles `status >= 400 && status < 500 && status !== 429` for permanent drops;
the success check at line 183 handles `resp.ok` (200-299). Status codes 300-399 have no
explicit branch.

This is informational because the `fetch` API's default redirect-following means this code
path is unreachable under normal conditions.

**Fix (optional):** Add an explicit branch for 3xx to immediately drop, making the intent
clear and eliminating the gap:

```js
// After the success check and before the permanent-drop check:
if (!networkError && resp.status >= 300 && resp.status < 400) {
  await _removeEntryFromQueue(entry);
  return { outcome: 'dropped' }; // Unexpected redirect — treat as permanent failure
}
```

---

_Reviewed: 2026-06-13_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

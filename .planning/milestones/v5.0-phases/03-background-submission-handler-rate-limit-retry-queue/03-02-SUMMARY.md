---
phase: 03-background-submission-handler-rate-limit-retry-queue
plan: 02
subsystem: test
tags: [vitest, chrome-extension, service-worker, chrome-storage, rate-limit, retry-queue, exponential-backoff, fake-timers, static-grep]

# Dependency graph
requires:
  - phase: 03-background-submission-handler-rate-limit-retry-queue
    plan: 01
    provides: "src/shared/report-transport.js — submitReport, drainQueueOnce, _resetMutex exports under test"

provides:
  - "tests/unit/report-transport-chrome.test.js — Chrome-target Vitest suite: SC1-SC4, LIMIT-03, QUEUE-01..04 (14 tests)"
  - "tests/unit/report-transport-firefox.test.js — Firefox-target Vitest suite: XPORT-05 cross-target parity (15 tests)"
  - "vitest.config.chrome.js include-array extension: report-transport-chrome.test.js added"
  - "vitest.config.firefox.js include-array extension: report-transport-firefox.test.js added"

affects:
  - 03-03-background-wiring (transport helper verified; plan 03-03 can wire into SW/background with confidence)

# Tech tracking
tech-stack:
  added: []  # zero new npm deps
  patterns:
    - "Per-test vi.stubGlobal('chrome', buildChromeMock(_localStore)) — re-stubs the chrome global each beforeEach with a stateful in-memory storage implementation (Pattern 5 from RESEARCH.md)"
    - "vi.advanceTimersByTimeAsync() to drive setTimeout-scheduled drainQueueOnce() retries and flush their async work deterministically"
    - "SW-death simulation: _resetMutex() then drainQueueOnce() against persisted _localStore — no live browser required (D-10)"
    - "Static-grep via readdirSync + readFileSync on src/content/ — XPORT-06 SC1 guard"

key-files:
  created:
    - tests/unit/report-transport-chrome.test.js
    - tests/unit/report-transport-firefox.test.js
  modified:
    - vitest.config.chrome.js
    - vitest.config.firefox.js

key-decisions:
  - "Used vi.stubGlobal('chrome', buildChromeMock(_localStore)) in beforeEach rather than accessing the chrome-stub.js global by name — in Node.js ESM, vi.stubGlobal writes to globalThis but 'chrome' is not a lexical binding; the bare name produces ReferenceError"
  - "Used vi.advanceTimersByTimeAsync() instead of vi.advanceTimersByTime() + manual Promise.resolve() chains — advanceTimersByTimeAsync fires timers AND awaits their async drain callbacks in one call, eliminating timeout races"
  - "Firefox suite mirrors Chrome suite structure (XPORT-05 identical-dispatch) plus an extended Result contract section with all four dispositions (success/queued/rateLimited/dropped) explicitly asserted"

# Metrics
duration: 25min
completed: 2026-06-13
---

# Phase 03 Plan 02: Report Transport Test Suite Summary

**Per-target Vitest suites (Chrome + Firefox) proving all four Phase 3 Success Criteria against the shared report-transport.js helper via stateful chrome.storage mock, fake-timers, and SW-death simulation — 29 new tests, both targets green**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-06-13
- **Tasks:** 3 of 3
- **Files created:** 2 (test files), **files modified:** 2 (vitest configs)

## Accomplishments

- Authored `tests/unit/report-transport-chrome.test.js` (14 tests) covering all four Phase 3 Success Criteria:
  - SC1/XPORT-06: static-grep via `readdirSync` + `readFileSync` — zero files in `src/content/` contain `fetch(WORKER_REPORT_URL` or `fetch('https://pct.tonyrowles.com`
  - SC2/LIMIT-03: 5 submits succeed, 6th is rate-limited with fetch call count unchanged, 7th after `vi.advanceTimersByTime(600001)` succeeds (window pruning proven)
  - SC3/QUEUE-01: disk-first proven (`_localStore.bugReportQueue` has length 1 immediately after a throwing fetch); SW-death simulation via `_resetMutex()` + `drainQueueOnce()` proves entry survives and is retried
  - SC4/QUEUE-03/D-04: 4xx permanent drop (queue empty, `dropped: true`), 5xx 3-attempt backoff via `vi.advanceTimersByTimeAsync()` (exactly 3 fetch calls, queue empty after), 429 retries with backoff
  - QUEUE-02: cap-20 oldest-drop eviction (21 enqueues → 20 entries, oldest `enqueuedAt` absent); 7-day TTL pruning (stale entry gone, only fresh entry's fetch call counted)
- Authored `tests/unit/report-transport-firefox.test.js` (15 tests) mirroring Chrome suite plus an extended result-contract section asserting all four dispositions (XPORT-05 identical-dispatch parity)
- Extended `vitest.config.chrome.js` include array with `'tests/unit/report-transport-chrome.test.js'`
- Extended `vitest.config.firefox.js` include array with `'tests/unit/report-transport-firefox.test.js'`
- Both `npm run test:chrome` (157 tests) and `npm run test:firefox` (156 tests) exit 0

## Task Commits

1. **Task 1: Chrome-target Vitest suite** — `ac1674c` (test)
2. **Task 2: Firefox-target Vitest suite** — `3635ca4` (test)
3. **Task 3: Config wiring** — `89e92ae` (chore)

## Files Created/Modified

- `/home/fatduck/patent-cite-tool/tests/unit/report-transport-chrome.test.js` — 428 lines; 14 tests covering SC1-SC4, LIMIT-03, QUEUE-01..04
- `/home/fatduck/patent-cite-tool/tests/unit/report-transport-firefox.test.js` — 388 lines; 15 tests for Firefox cross-target parity
- `/home/fatduck/patent-cite-tool/vitest.config.chrome.js` — include array extended (+1 line)
- `/home/fatduck/patent-cite-tool/vitest.config.firefox.js` — include array extended (+1 line)

## Decisions Made

- **chrome global access pattern:** `vi.stubGlobal('chrome', buildChromeMock(_localStore))` in `beforeEach` — re-stubs the chrome global per-test with a stateful in-memory store. The bare name `chrome` is a ReferenceError in Node.js ESM even with Vitest's `globals: true` (which only injects Vitest-specific globals like `describe`/`it`/`vi`). The re-stub pattern ensures both the test body AND `report-transport.js` see the same mock object.
- **Timer advancement:** `vi.advanceTimersByTimeAsync()` is used for tests that drive `setTimeout`-scheduled drain callbacks. The sync `vi.advanceTimersByTime()` fires the callbacks but their async work (the drain Promise chain) doesn't complete until microtasks flush. `advanceTimersByTimeAsync()` handles both in one await.
- **Firefox suite scope:** Per XPORT-05 identical-dispatch, the Firefox suite asserts the same behavioral contract. Extended with a full result-contract section (4 dispositions) to make the cross-target parity assertion explicit.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ReferenceError: chrome is not defined in beforeEach**
- **Found during:** Task 1 (first test run)
- **Issue:** The plan's RESEARCH Pattern 5 example accessed `chrome.storage.local.get.mockImplementation(...)` directly, which fails because `chrome` is not a lexical binding in ESM — `vi.stubGlobal` from `chrome-stub.js` (setupFiles) writes to `globalThis` but does not create a module-scope binding.
- **Fix:** Replaced the bare `chrome` reference with a fresh `vi.stubGlobal('chrome', buildChromeMock(_localStore))` call in `beforeEach`. This both creates the binding (now accessible via the returned mock object) and provides the stateful storage implementation.
- **Files modified:** `tests/unit/report-transport-chrome.test.js`, `tests/unit/report-transport-firefox.test.js`
- **Commit:** ac1674c (incorporated in Task 1), 3635ca4 (Task 2)

**2. [Rule 1 - Bug] Tests timing out on setTimeout-driven drain scenarios**
- **Found during:** Task 1 (SC4 and 429 tests)
- **Issue:** Using `vi.advanceTimersByTime(2001)` + `await Promise.resolve()` chains timed out because the fired timer callback (`drainQueueOnce()`) returns a Promise but `advanceTimersByTime` is synchronous — it fires the callbacks but doesn't await their async continuations.
- **Fix:** Replaced with `await vi.advanceTimersByTimeAsync(2001)` which fires timers AND flushes the resulting async microtask queue.
- **Files modified:** `tests/unit/report-transport-chrome.test.js`, `tests/unit/report-transport-firefox.test.js`
- **Commit:** ac1674c, 3635ca4

## Known Stubs

None — all test assertions are against actual behavior of `report-transport.js` with deterministic mocks.

## Threat Surface Scan

No new network endpoints, auth paths, or schema changes introduced. The `readFileSync` calls in SC1 tests are test-time static analysis of source files — no runtime file access from extension code. T-03-SC mitigated: zero new npm dependencies installed.

## Self-Check: PASSED

- `tests/unit/report-transport-chrome.test.js` exists: FOUND
- `tests/unit/report-transport-firefox.test.js` exists: FOUND
- `vitest.config.chrome.js` contains `report-transport-chrome.test.js`: CONFIRMED (grep -c → 1)
- `vitest.config.firefox.js` contains `report-transport-firefox.test.js`: CONFIRMED (grep -c → 1)
- Commit `ac1674c` exists: FOUND (Task 1)
- Commit `3635ca4` exists: FOUND (Task 2)
- Commit `89e92ae` exists: FOUND (Task 3)
- `npm run test:chrome` exits 0, 157 tests passed: CONFIRMED
- `npm run test:firefox` exits 0, 156 tests passed: CONFIRMED
- No background module imports in either test file (grep -c returns 0): CONFIRMED

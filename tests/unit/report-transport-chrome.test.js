// tests/unit/report-transport-chrome.test.js
//
// Phase 3 Plan 02 (XPORT-06, LIMIT-03, QUEUE-01..04) — Chrome-target Vitest suite
// for src/shared/report-transport.js.
//
// D-09: drives submitReport/drainQueueOnce directly with stateful mocked
// chrome.storage.local and vi.useFakeTimers() for 2s/8s/30s backoff.
// D-10: SW termination is simulated via _resetMutex() — no live browser involved.
//
// Coverage:
//   SC1 / XPORT-06: static-grep — no fetch(WORKER_REPORT_URL in src/content/
//   SC2 / LIMIT-03: 5-ok / 6th-blocked / 7th-after-window
//   SC3 / QUEUE-01: disk-first proven (entry in queue before fetch); SW-death simulation
//   SC4 / QUEUE-03 / D-04: 4xx permanent-drop, 5xx 3×-backoff, 429-retry
//   QUEUE-02: cap-20 oldest-drop eviction, 7-day TTL pruning
//
// IMPORTANT: This file imports ONLY src/shared/report-transport.js — NOT any
// background module (service-worker.js / firefox/background.js) — those register
// top-level listeners on import which throw in Node.js test environments.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  submitReport,
  drainQueueOnce,
  checkAndUpdateRateLimit,
  _resetMutex,
} from '../../src/shared/report-transport.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Stateful chrome.storage.local mock (per-test override, RESEARCH Pattern 5)
//
// chrome-stub.js (setupFiles) installs a bare vi.fn() chrome global BEFORE the
// module under test is imported. We build a fresh stateful mock each test and
// re-stub the global in beforeEach so both the test body AND report-transport.js
// see the same in-memory store.
// ---------------------------------------------------------------------------

let _localStore = {};

// Build a stateful chrome mock with a fresh in-memory store.
// Returns the mock object AND a getter for the current _localStore reference.
function buildChromeMock(store) {
  return {
    runtime: {
      getURL: vi.fn((p) => `chrome-extension://test-id/${p}`),
      sendMessage: vi.fn(),
      onMessage: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
        hasListener: vi.fn(() => false),
      },
      id: 'test-extension-id',
    },
    storage: {
      sync: { get: vi.fn(), set: vi.fn() },
      local: {
        get: vi.fn(async (keys) => {
          if (typeof keys === 'string') return { [keys]: store[keys] };
          if (Array.isArray(keys)) return Object.fromEntries(keys.map(k => [k, store[k]]));
          return Object.assign({}, store); // null / undefined → return all
        }),
        set: vi.fn(async (obj) => {
          Object.assign(store, obj);
        }),
      },
      onChanged: { addListener: vi.fn() },
    },
  };
}

// Helper — stub a fetch response object
function makeFetchResponse(ok, status, body = {}) {
  return {
    ok,
    status,
    json: async () => body,
  };
}

// Minimal valid payload shape (builder output)
const SAMPLE_PAYLOAD = {
  category: 'no_match',
  patentNumber: '12505414',
  extensionVersion: '5.0.0',
  patentUrl: null,
  returnedCitation: null,
  confidenceTier: null,
  browser: null,
  os: null,
  xpathNode: null,
  scrollY: null,
  viewportWidth: null,
  viewportHeight: null,
  pdfParseStatus: null,
  triggerMode: null,
  errorLog: [],
  note: null,
};

beforeEach(() => {
  vi.useFakeTimers();

  // Fresh in-memory store for each test
  _localStore = {};

  // Re-stub the chrome global with a stateful implementation over the fresh store.
  // This overrides the bare vi.fn() stubs from chrome-stub.js (setupFiles) for
  // every test, so report-transport.js sees real read-modify-write semantics.
  const chromeMock = buildChromeMock(_localStore);
  vi.stubGlobal('chrome', chromeMock);

  // Stub global fetch so tests control responses
  vi.stubGlobal('fetch', vi.fn());

  // Reset the drain mutex to simulate a fresh SW start
  _resetMutex();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// SC1 / XPORT-06: no fetch(WORKER_REPORT_URL and no direct POST in src/content/
// ---------------------------------------------------------------------------

describe('SC1 / XPORT-06 — content scripts never POST cross-origin', () => {
  it('no file in src/content/ contains fetch(WORKER_REPORT_URL', () => {
    const contentDir = path.resolve(__dirname, '../../src/content');
    const files = readdirSync(contentDir).filter(f => f.endsWith('.js'));
    expect(files.length).toBeGreaterThan(0); // guard: directory is non-empty

    for (const file of files) {
      const src = readFileSync(path.join(contentDir, file), 'utf8');
      expect(src).not.toMatch(/fetch\s*\(\s*WORKER_REPORT_URL/);
    }
  });

  it('no file in src/content/ contains hardcoded pct.tonyrowles.com fetch', () => {
    const contentDir = path.resolve(__dirname, '../../src/content');
    const files = readdirSync(contentDir).filter(f => f.endsWith('.js'));

    for (const file of files) {
      const src = readFileSync(path.join(contentDir, file), 'utf8');
      expect(src).not.toMatch(/fetch\s*\(\s*['"]https:\/\/pct\.tonyrowles\.com/);
    }
  });
});

// ---------------------------------------------------------------------------
// SC2 / LIMIT-03: sliding-window rate limit — 5 ok / 6th blocked / 7th after window
// ---------------------------------------------------------------------------

describe('SC2 / LIMIT-03 — sliding-window rate limit', () => {
  it('5 sequential submits succeed, 6th is rate-limited (no fetch call), 7th after window succeeds', async () => {
    // Stub fetch to always return 201 success
    fetch.mockResolvedValue(makeFetchResponse(true, 201, { fingerprint: 'abc123' }));

    // Submit 1-5: all should succeed
    for (let i = 0; i < 5; i++) {
      const result = await submitReport({ ...SAMPLE_PAYLOAD });
      expect(result.rateLimited, `submit ${i + 1} should not be rate-limited`).toBe(false);
      expect(result.ok, `submit ${i + 1} should be ok`).toBe(true);
    }

    const callCountAfter5 = fetch.mock.calls.length;
    expect(callCountAfter5).toBe(5);

    // 6th submit: should be rate-limited; fetch NOT called
    const result6 = await submitReport({ ...SAMPLE_PAYLOAD });
    expect(result6.rateLimited).toBe(true);
    expect(result6.ok).toBe(false);
    expect(result6.queued).toBe(false);

    // Confirm fetch was NOT called for the 6th submit
    expect(fetch.mock.calls.length).toBe(callCountAfter5); // unchanged

    // Advance time past the 10-minute window (600001ms)
    vi.advanceTimersByTime(600001);

    // 7th submit: window is expired — should be allowed again
    const result7 = await submitReport({ ...SAMPLE_PAYLOAD });
    expect(result7.rateLimited).toBe(false);
    expect(result7.ok).toBe(true);
    expect(fetch.mock.calls.length).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// SC3 / QUEUE-01: disk-first invariant + SW termination simulation
// ---------------------------------------------------------------------------

describe('SC3 / QUEUE-01 — disk-first invariant and SW-death simulation', () => {
  it('entry is in bugReportQueue when fetch throws (disk-first proven)', async () => {
    // Fetch throws — network error
    fetch.mockRejectedValue(new Error('Network failure'));

    const result = await submitReport({ ...SAMPLE_PAYLOAD });

    // Entry should be queued (disk-first: written before fetch)
    expect(result.queued).toBe(true);
    expect(result.ok).toBe(false);

    // The queue must have exactly 1 entry even though fetch threw
    expect(_localStore.bugReportQueue).toHaveLength(1);
    expect(_localStore.bugReportQueue[0].payload.patentNumber).toBe('12505414');
  });

  it('queued entry is retried after SW-death simulation (drain processes persisted queue)', async () => {
    // Step 1: enqueue an entry via a throwing fetch
    fetch.mockRejectedValueOnce(new Error('Network failure'));
    await submitReport({ ...SAMPLE_PAYLOAD });
    expect(_localStore.bugReportQueue).toHaveLength(1);

    // Step 2: simulate SW death — reset the in-memory mutex
    _resetMutex();

    // The entry from submitReport has nextAttemptAt = Date.now() + 2000 (after first failure).
    // Advance time past the backoff so drain picks it up.
    vi.advanceTimersByTime(2001);

    // Step 3: stub fetch to succeed on the next attempt
    fetch.mockResolvedValueOnce(makeFetchResponse(true, 201, { fingerprint: 'retry-success' }));

    // Step 4: drain — simulates onStartup handler
    await drainQueueOnce();

    // Queue should be empty after successful retry
    expect(_localStore.bugReportQueue ?? []).toHaveLength(0);
  });

  it('successful 201 response removes entry from queue atomically', async () => {
    // Direct submit with 201 success
    fetch.mockResolvedValueOnce(makeFetchResponse(true, 201, { fingerprint: 'fp-immediate' }));

    const result = await submitReport({ ...SAMPLE_PAYLOAD });

    expect(result.ok).toBe(true);
    expect(result.fingerprint).toBe('fp-immediate');
    // Queue should be empty (entry removed on success)
    expect(_localStore.bugReportQueue ?? []).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// CR-01 regression — concurrent submit + drain must not lose or resurrect entries.
// The drainingQueue mutex only serializes drain-vs-drain; before the storageLock
// fix, a submit's enqueue/remove RMW could interleave with a concurrent drain's
// RMW and clobber an update (phantom retry of a delivered report, or loss of a
// freshly-enqueued one). All storage RMW is now serialized through one lock.
// ---------------------------------------------------------------------------

describe('CR-01 — concurrent submit + drain serialize without lost updates', () => {
  it('a queued entry drained concurrently with a new submit leaves no phantom/lost entry', async () => {
    // Pre-seed an already-queued entry A, immediately eligible for drain.
    _localStore.bugReportQueue = [{
      payload: { ...SAMPLE_PAYLOAD, patentNumber: 'A0000001' },
      attemptCount: 0,
      nextAttemptAt: 0,
      enqueuedAt: Date.now() - 1000,
    }];

    // Every fetch succeeds (201) — both the drain of A and the new submit B deliver.
    fetch.mockResolvedValue(makeFetchResponse(true, 201, { fingerprint: 'fp' }));

    // Fire the opportunistic drain and a fresh submit concurrently — the exact
    // interleaving the wiring produces on a SUBMIT_REPORT message with a non-empty queue.
    const [, submitResult] = await Promise.all([
      drainQueueOnce(),
      submitReport({ ...SAMPLE_PAYLOAD, patentNumber: 'B0000002' }),
    ]);

    // Both delivered → queue fully drained. A lost update would leave a resurrected
    // A (length 1) or drop B; serialized RMW guarantees a clean empty queue.
    expect(submitResult.ok).toBe(true);
    expect(_localStore.bugReportQueue ?? []).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// SC4 / QUEUE-03 / D-04: failure handling — 4xx drop, 5xx backoff, 429 retry
// ---------------------------------------------------------------------------

describe('SC4 / QUEUE-03 / D-04 — failure handling', () => {
  it('(a) 4xx (non-429) → permanent drop; queue empty after submit', async () => {
    fetch.mockResolvedValueOnce(makeFetchResponse(false, 400, {}));

    const result = await submitReport({ ...SAMPLE_PAYLOAD });

    // Permanently dropped — not queued, not ok, dropped flag set
    expect(result.dropped).toBe(true);
    expect(result.ok).toBe(false);
    expect(result.queued).toBe(false);

    // Queue should be empty (entry removed on permanent drop)
    expect(_localStore.bugReportQueue ?? []).toHaveLength(0);
  });

  it('(b) 5xx → 3 retry attempts across 2s/8s/30s backoff, then silent drop', async () => {
    // All 3 attempts fail with 503
    fetch.mockResolvedValue(makeFetchResponse(false, 503, {}));

    // First attempt (during submitReport)
    const result = await submitReport({ ...SAMPLE_PAYLOAD });

    // After first failure: entry should be queued, attemptCount = 1
    expect(result.queued).toBe(true);
    expect(_localStore.bugReportQueue).toHaveLength(1);
    expect(_localStore.bugReportQueue[0].attemptCount).toBe(1);

    // Advance past first backoff (2s) and run all async callbacks
    // vi.runAllTimersAsync() fires timers AND awaits any resulting async work.
    await vi.advanceTimersByTimeAsync(2001);

    // After second failure: attemptCount = 2
    expect(_localStore.bugReportQueue).toHaveLength(1);
    expect(_localStore.bugReportQueue[0].attemptCount).toBe(2);

    // Advance past second backoff (8s) — 3rd attempt fires (MAX_ATTEMPTS=3)
    await vi.advanceTimersByTimeAsync(8001);

    // After third failure (MAX_ATTEMPTS=3): entry is silently dropped
    expect(_localStore.bugReportQueue ?? []).toHaveLength(0);
    // Total fetch calls: 3 (one per attempt)
    expect(fetch.mock.calls.length).toBe(3);
  }, 10000);

  it('(c) 429 → entry is retried with backoff (not permanently dropped on first 429)', async () => {
    // First attempt: 429
    fetch.mockResolvedValueOnce(makeFetchResponse(false, 429, {}));
    // Second attempt: 201 success
    fetch.mockResolvedValueOnce(makeFetchResponse(true, 201, { fingerprint: 'retry-after-429' }));

    const result = await submitReport({ ...SAMPLE_PAYLOAD });

    // First attempt with 429 should return queued (not dropped)
    expect(result.queued).toBe(true);
    expect(result.dropped).toBe(false);
    expect(_localStore.bugReportQueue).toHaveLength(1);
    expect(_localStore.bugReportQueue[0].attemptCount).toBe(1);

    // Advance past first backoff (2s) and run drain async work
    await vi.advanceTimersByTimeAsync(2001);

    // After successful retry, queue should be empty
    expect(_localStore.bugReportQueue ?? []).toHaveLength(0);
    expect(fetch.mock.calls.length).toBe(2);
  }, 10000);
});

// ---------------------------------------------------------------------------
// QUEUE-02: cap-20 oldest-drop eviction and 7-day TTL pruning
// ---------------------------------------------------------------------------

describe('QUEUE-02 — queue cap-20 eviction and 7-day TTL pruning', () => {
  it('enqueueing 21 entries caps the queue at 20 and drops the oldest entry', async () => {
    // Make fetch always fail with network error so entries accumulate
    fetch.mockRejectedValue(new Error('Network failure'));

    // Inject 20 existing entries with staggered enqueuedAt timestamps
    const now = Date.now();
    const existing = Array.from({ length: 20 }, (_, i) => ({
      payload: { ...SAMPLE_PAYLOAD, note: `entry-${i}` },
      attemptCount: 0,
      nextAttemptAt: 0,
      // oldest first: now-20000, now-19000, ..., now-1000
      enqueuedAt: now - (20 - i) * 1000,
    }));
    _localStore.bugReportQueue = existing;

    const oldestEnqueuedAt = existing[0].enqueuedAt;

    // Submit the 21st entry
    await submitReport({ ...SAMPLE_PAYLOAD, note: 'entry-20' });

    // Queue should be capped at 20
    const queue = _localStore.bugReportQueue;
    expect(queue).toHaveLength(20);

    // The oldest entry should have been evicted
    const storedTimestamps = queue.map(e => e.enqueuedAt);
    expect(storedTimestamps).not.toContain(oldestEnqueuedAt);
  });

  it('entries older than 7 days are pruned on next drain', async () => {
    const now = Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

    // Seed the queue with one stale entry (8 days old) and one fresh entry
    _localStore.bugReportQueue = [
      {
        payload: { ...SAMPLE_PAYLOAD, note: 'stale' },
        attemptCount: 0,
        nextAttemptAt: 0,
        enqueuedAt: now - sevenDaysMs - 1000, // 7 days + 1s old → stale
      },
      {
        payload: { ...SAMPLE_PAYLOAD, note: 'fresh' },
        attemptCount: 0,
        nextAttemptAt: 0,
        enqueuedAt: now - 60000, // 1 minute old → alive
      },
    ];

    // Stub fetch to succeed so the fresh entry is processed
    fetch.mockResolvedValue(makeFetchResponse(true, 201, { fingerprint: 'pruned-test' }));

    // Drain — should prune the stale entry and process the fresh one
    await drainQueueOnce();

    // Both entries should be gone: stale pruned + fresh completed
    expect(_localStore.bugReportQueue ?? []).toHaveLength(0);
    // Fetch was called exactly once (only the fresh eligible entry)
    expect(fetch.mock.calls.length).toBe(1);
  });

  it('null payload is dropped immediately without touching the queue', async () => {
    const result = await submitReport(null);

    expect(result.dropped).toBe(true);
    expect(result.ok).toBe(false);
    expect(result.queued).toBe(false);
    // No queue write, no fetch
    expect(_localStore.bugReportQueue).toBeUndefined();
    expect(fetch.mock.calls.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Result contract shape assertions (D-06/D-08 / XPORT-05)
// ---------------------------------------------------------------------------

describe('Result contract — { ok, queued, fingerprint, rateLimited, dropped }', () => {
  it('success path returns all five contract fields with correct types', async () => {
    fetch.mockResolvedValueOnce(makeFetchResponse(true, 201, { fingerprint: 'contract-test' }));

    const result = await submitReport({ ...SAMPLE_PAYLOAD });

    expect(result).toHaveProperty('ok', true);
    expect(result).toHaveProperty('queued', false);
    expect(result).toHaveProperty('fingerprint', 'contract-test');
    expect(result).toHaveProperty('rateLimited', false);
    expect(result).toHaveProperty('dropped', false);
  });

  it('queued path returns correct contract shape', async () => {
    fetch.mockRejectedValueOnce(new Error('Network failure'));

    const result = await submitReport({ ...SAMPLE_PAYLOAD });

    expect(result).toHaveProperty('ok', false);
    expect(result).toHaveProperty('queued', true);
    expect(result).toHaveProperty('fingerprint', null);
    expect(result).toHaveProperty('rateLimited', false);
    expect(result).toHaveProperty('dropped', false);
  });
});

// tests/unit/report-transport-firefox.test.js
//
// Phase 3 Plan 02 (XPORT-05 / XPORT-06, LIMIT-03, QUEUE-01..04) — Firefox-target
// Vitest suite for src/shared/report-transport.js.
//
// Per XPORT-05, Chrome and Firefox dispatch shapes are byte-identical — the shared
// helper implements all behavior without target divergence. This file mirrors the
// Chrome suite's behavioral assertions (SC2/SC3/SC4 cross-target parity). Its
// presence in vitest.config.firefox.js ensures `npm run test:firefox` exercises
// the transport logic under the Firefox target setup.
//
// D-09: drives submitReport/drainQueueOnce directly with stateful mocked
// chrome.storage.local and vi.useFakeTimers() for 2s/8s/30s backoff.
// D-10: SW termination is simulated via _resetMutex() — no live browser involved.
//
// If Chrome/Firefox logic ever diverges in the future, this file is the extension
// point for Firefox-specific assertions.
//
// Coverage (cross-target parity per XPORT-05):
//   SC2 / LIMIT-03: 5-ok / 6th-blocked / 7th-after-window
//   SC3 / QUEUE-01: disk-first proven; SW-death simulation
//   SC4 / QUEUE-03 / D-04: 4xx drop, 5xx 3×-backoff, 429-retry
//   QUEUE-02: cap-20 eviction, 7-day TTL pruning
//   Result contract: { ok, queued, fingerprint, rateLimited, dropped }
//
// IMPORTANT: This file imports ONLY src/shared/report-transport.js — NOT any
// background module (service-worker.js / firefox/background.js) — those register
// top-level listeners on import which throw in Node.js test environments.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  submitReport,
  drainQueueOnce,
  checkAndUpdateRateLimit,
  _resetMutex,
} from '../../src/shared/report-transport.js';

// ---------------------------------------------------------------------------
// Stateful chrome.storage.local mock (per-test override, RESEARCH Pattern 5)
//
// Same pattern as report-transport-chrome.test.js — the storage API is identical
// across Chrome and Firefox (both use chrome.storage.local).
// ---------------------------------------------------------------------------

let _localStore = {};

// Build a stateful chrome mock with a fresh in-memory store.
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
// SC2 / LIMIT-03: sliding-window rate limit (Firefox cross-target parity)
// ---------------------------------------------------------------------------

describe('Firefox SC2 / LIMIT-03 — sliding-window rate limit', () => {
  it('5 sequential submits succeed, 6th is rate-limited (no fetch call), 7th after window succeeds', async () => {
    // Stub fetch to always return 201 success
    fetch.mockResolvedValue(makeFetchResponse(true, 201, { fingerprint: 'firefox-abc123' }));

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
    expect(fetch.mock.calls.length).toBe(callCountAfter5);

    // Advance time past the 10-minute window (600001ms)
    vi.advanceTimersByTime(600001);

    // 7th submit: window expired — should succeed again
    const result7 = await submitReport({ ...SAMPLE_PAYLOAD });
    expect(result7.rateLimited).toBe(false);
    expect(result7.ok).toBe(true);
    expect(fetch.mock.calls.length).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// SC3 / QUEUE-01: disk-first invariant + SW termination simulation (Firefox)
// ---------------------------------------------------------------------------

describe('Firefox SC3 / QUEUE-01 — disk-first invariant and SW-death simulation', () => {
  it('entry is in bugReportQueue when fetch throws (disk-first proven)', async () => {
    fetch.mockRejectedValue(new Error('Network failure'));

    const result = await submitReport({ ...SAMPLE_PAYLOAD });

    expect(result.queued).toBe(true);
    expect(result.ok).toBe(false);

    // Entry must be in disk-store even though fetch threw
    expect(_localStore.bugReportQueue).toHaveLength(1);
    expect(_localStore.bugReportQueue[0].payload.patentNumber).toBe('12505414');
  });

  it('queued entry is retried after SW-death simulation (drain processes persisted queue)', async () => {
    // Step 1: enqueue via a throwing fetch
    fetch.mockRejectedValueOnce(new Error('Network failure'));
    await submitReport({ ...SAMPLE_PAYLOAD });
    expect(_localStore.bugReportQueue).toHaveLength(1);

    // Step 2: simulate SW death
    _resetMutex();

    // Advance past the 2s backoff
    vi.advanceTimersByTime(2001);

    // Step 3: stub fetch to succeed
    fetch.mockResolvedValueOnce(makeFetchResponse(true, 201, { fingerprint: 'firefox-retry' }));

    // Step 4: drain simulates onStartup
    await drainQueueOnce();

    expect(_localStore.bugReportQueue ?? []).toHaveLength(0);
  });

  it('successful 201 response removes entry from queue atomically', async () => {
    fetch.mockResolvedValueOnce(makeFetchResponse(true, 201, { fingerprint: 'firefox-immediate' }));

    const result = await submitReport({ ...SAMPLE_PAYLOAD });

    expect(result.ok).toBe(true);
    expect(result.fingerprint).toBe('firefox-immediate');
    expect(_localStore.bugReportQueue ?? []).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// SC4 / QUEUE-03 / D-04: failure handling (Firefox cross-target parity)
// ---------------------------------------------------------------------------

describe('Firefox SC4 / QUEUE-03 / D-04 — failure handling', () => {
  it('(a) 4xx (non-429) → permanent drop; queue empty after submit', async () => {
    fetch.mockResolvedValueOnce(makeFetchResponse(false, 400, {}));

    const result = await submitReport({ ...SAMPLE_PAYLOAD });

    expect(result.dropped).toBe(true);
    expect(result.ok).toBe(false);
    expect(result.queued).toBe(false);
    expect(_localStore.bugReportQueue ?? []).toHaveLength(0);
  });

  it('(b) 5xx → 3 retry attempts across 2s/8s/30s backoff, then silent drop', async () => {
    fetch.mockResolvedValue(makeFetchResponse(false, 503, {}));

    const result = await submitReport({ ...SAMPLE_PAYLOAD });

    expect(result.queued).toBe(true);
    expect(_localStore.bugReportQueue).toHaveLength(1);
    expect(_localStore.bugReportQueue[0].attemptCount).toBe(1);

    // Advance past first backoff (2s)
    await vi.advanceTimersByTimeAsync(2001);

    expect(_localStore.bugReportQueue).toHaveLength(1);
    expect(_localStore.bugReportQueue[0].attemptCount).toBe(2);

    // Advance past second backoff (8s) — triggers 3rd attempt (MAX_ATTEMPTS=3) → drop
    await vi.advanceTimersByTimeAsync(8001);

    expect(_localStore.bugReportQueue ?? []).toHaveLength(0);
    expect(fetch.mock.calls.length).toBe(3);
  }, 10000);

  it('(c) 429 → entry is retried with backoff (not permanently dropped on first 429)', async () => {
    fetch.mockResolvedValueOnce(makeFetchResponse(false, 429, {}));
    fetch.mockResolvedValueOnce(makeFetchResponse(true, 201, { fingerprint: 'firefox-429-retry' }));

    const result = await submitReport({ ...SAMPLE_PAYLOAD });

    expect(result.queued).toBe(true);
    expect(result.dropped).toBe(false);
    expect(_localStore.bugReportQueue).toHaveLength(1);
    expect(_localStore.bugReportQueue[0].attemptCount).toBe(1);

    // Advance past first backoff
    await vi.advanceTimersByTimeAsync(2001);

    expect(_localStore.bugReportQueue ?? []).toHaveLength(0);
    expect(fetch.mock.calls.length).toBe(2);
  }, 10000);
});

// ---------------------------------------------------------------------------
// QUEUE-02: cap-20 eviction and 7-day TTL pruning (Firefox cross-target parity)
// ---------------------------------------------------------------------------

describe('Firefox QUEUE-02 — queue cap-20 eviction and 7-day TTL pruning', () => {
  it('enqueueing 21 entries caps the queue at 20 and drops the oldest entry', async () => {
    fetch.mockRejectedValue(new Error('Network failure'));

    const now = Date.now();
    const existing = Array.from({ length: 20 }, (_, i) => ({
      payload: { ...SAMPLE_PAYLOAD, note: `entry-${i}` },
      attemptCount: 0,
      nextAttemptAt: 0,
      enqueuedAt: now - (20 - i) * 1000,
    }));
    _localStore.bugReportQueue = existing;

    const oldestEnqueuedAt = existing[0].enqueuedAt;

    await submitReport({ ...SAMPLE_PAYLOAD, note: 'entry-20' });

    const queue = _localStore.bugReportQueue;
    expect(queue).toHaveLength(20);

    const storedTimestamps = queue.map(e => e.enqueuedAt);
    expect(storedTimestamps).not.toContain(oldestEnqueuedAt);
  });

  it('entries older than 7 days are pruned on next drain', async () => {
    const now = Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

    _localStore.bugReportQueue = [
      {
        payload: { ...SAMPLE_PAYLOAD, note: 'stale' },
        attemptCount: 0,
        nextAttemptAt: 0,
        enqueuedAt: now - sevenDaysMs - 1000,
      },
      {
        payload: { ...SAMPLE_PAYLOAD, note: 'fresh' },
        attemptCount: 0,
        nextAttemptAt: 0,
        enqueuedAt: now - 60000,
      },
    ];

    fetch.mockResolvedValue(makeFetchResponse(true, 201, { fingerprint: 'firefox-prune' }));

    await drainQueueOnce();

    expect(_localStore.bugReportQueue ?? []).toHaveLength(0);
    expect(fetch.mock.calls.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Result contract — XPORT-05 identical-dispatch parity
// Asserts the same { ok, queued, fingerprint, rateLimited, dropped } contract
// as the Chrome suite per XPORT-05 identical-dispatch mandate.
// ---------------------------------------------------------------------------

describe('Firefox result contract — XPORT-05 identical-dispatch parity', () => {
  it('success path returns all five contract fields with correct types', async () => {
    fetch.mockResolvedValueOnce(makeFetchResponse(true, 201, { fingerprint: 'firefox-contract' }));

    const result = await submitReport({ ...SAMPLE_PAYLOAD });

    expect(result).toHaveProperty('ok', true);
    expect(result).toHaveProperty('queued', false);
    expect(result).toHaveProperty('fingerprint', 'firefox-contract');
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

  it('rate-limited path returns correct contract shape', async () => {
    // Exhaust the 5-submit window
    fetch.mockResolvedValue(makeFetchResponse(true, 201, { fingerprint: 'ok' }));
    for (let i = 0; i < 5; i++) {
      await submitReport({ ...SAMPLE_PAYLOAD });
    }

    // 6th is rate-limited
    const result = await submitReport({ ...SAMPLE_PAYLOAD });

    expect(result).toHaveProperty('ok', false);
    expect(result).toHaveProperty('queued', false);
    expect(result).toHaveProperty('fingerprint', null);
    expect(result).toHaveProperty('rateLimited', true);
    expect(result).toHaveProperty('dropped', false);
  });

  it('null payload returns dropped contract shape without queue write', async () => {
    const result = await submitReport(null);

    expect(result).toHaveProperty('ok', false);
    expect(result).toHaveProperty('queued', false);
    expect(result).toHaveProperty('fingerprint', null);
    expect(result).toHaveProperty('rateLimited', false);
    expect(result).toHaveProperty('dropped', true);
    expect(_localStore.bugReportQueue).toBeUndefined();
  });
});

// Phase 3 Plan 01 — shared report transport helper for the v5.0 bug-report feature.
//
// Exports: submitReport, drainQueueOnce, checkAndUpdateRateLimit, _resetMutex
//
// Design constraints (from CONTEXT.md):
//   D-01: No alarms API — backoff via setTimeout only.
//   D-03: Per-entry attemptCount + nextAttemptAt persisted across SW deaths.
//   D-04: 4xx (except 429) → permanent drop; 429/5xx/throw → retry up to 3 attempts.
//   D-05: Rate-limit check runs FIRST — before any disk write or fetch.
//   D-06/D-08: Returns { ok, queued, fingerprint, rateLimited, dropped }.
//   QUEUE-01: Disk write BEFORE fetch (disk-first invariant).
//   QUEUE-02: Queue cap 20 (oldest-drop), 7-day TTL, 2s/8s/30s × 3 backoff.
//   LIMIT-03: Sliding window of max 5 timestamps over 10 minutes.
//
// IMPORTANT: Never reference chrome.* at module scope — chrome-stub is injected
// at runtime (not parse time), so top-level chrome references throw in Node.js tests.

import { WORKER_REPORT_URL } from './constants.js';

// ---------------------------------------------------------------------------
// Module-scope constants (no chrome.* references here)
// ---------------------------------------------------------------------------

// PROXY_TOKEN is a local const — mirrors offscreen.js and pdf-pipeline.js.
// NOT imported from constants.js (which is the pure shared module exposed to
// content scripts; embedding the token there would widen its exposure).
// Token injected at build time by esbuild define (SEC-02). Never a literal.
const PROXY_TOKEN = __PROXY_TOKEN__;

const BACKOFF_MS = [2000, 8000, 30000];   // 2s / 8s / 30s (D-01, QUEUE-02)
const MAX_ATTEMPTS = 3;                    // After 3 failures → silent drop (D-04, QUEUE-02)
const RATE_LIMIT_MAX = 5;                  // Max submits per sliding window (LIMIT-03)
const RATE_LIMIT_WINDOW_MS = 600000;       // 10 minutes in ms (LIMIT-03)
const QUEUE_KEY = 'bugReportQueue';        // chrome.storage.local key (QUEUE-01)
const RATE_KEY = 'bugReportRateLimitWindow'; // chrome.storage.local key (LIMIT-03)
const QUEUE_CAP = 20;                      // Max entries before oldest-drop eviction (QUEUE-02)
const QUEUE_TTL_MS = 604800000;            // 7 days in ms (QUEUE-02)

// ---------------------------------------------------------------------------
// Drain mutex — prevents concurrent read-modify-write races (Pattern 2, RESEARCH)
// Copy of the creatingOffscreen pattern from service-worker.js:49-78.
// ---------------------------------------------------------------------------

let drainingQueue = null;

// ---------------------------------------------------------------------------
// Storage serialization lock (CR-01 fix)
//
// The drainingQueue mutex above only prevents drain-vs-drain races. A submit
// (enqueue + success/failure RMW) can still interleave with a concurrent drain
// — both do read-modify-write on bugReportQueue across an await boundary, so the
// last writer silently clobbers the other's update (phantom retry of a delivered
// report, or loss of a freshly-enqueued one). CONTEXT.md requires "the simplest
// correct approach" to concurrent RMW protection on bugReportQueue /
// bugReportRateLimitWindow — this serializes every storage RMW critical section
// through a single promise chain so no two get-modify-set sequences interleave.
//
// IMPORTANT: only LEAF read-modify-write sections acquire this lock. _doDrain
// holds it solely for its prune snapshot and releases it before calling
// attemptEntry (which re-acquires it per write) — never nest withStorageLock
// inside a held section or the chain self-deadlocks.
// ---------------------------------------------------------------------------

let storageLock = Promise.resolve();

function withStorageLock(fn) {
  const run = storageLock.then(fn, fn);
  // Keep the chain alive regardless of fn's outcome; callers see the real result.
  storageLock = run.then(() => {}, () => {});
  return run;
}

// ---------------------------------------------------------------------------
// Rate-limit check (LIMIT-03, D-05)
// ---------------------------------------------------------------------------

/**
 * Check the sliding-window rate limit and update the window on success.
 *
 * Reads bugReportRateLimitWindow from chrome.storage.local, prunes timestamps
 * older than RATE_LIMIT_WINDOW_MS, and returns false (blocked) if the pruned
 * window has >= RATE_LIMIT_MAX entries. Otherwise appends Date.now() and writes
 * back, then returns true (allowed).
 *
 * @returns {Promise<boolean>} true if the submit is allowed, false if blocked.
 */
export async function checkAndUpdateRateLimit() {
  // Serialized RMW so two concurrent submits cannot both read a 4-entry window
  // and each append, slipping a 6th submission past the ceiling (CR-01 class).
  return withStorageLock(async () => {
    const now = Date.now();
    const stored = await chrome.storage.local.get(RATE_KEY);
    const raw = stored[RATE_KEY];
    const window = (Array.isArray(raw) ? raw : []).filter(ts => now - ts < RATE_LIMIT_WINDOW_MS);

    if (window.length >= RATE_LIMIT_MAX) {
      return false; // Rate-limited — caller returns { rateLimited: true }
    }

    window.push(now);
    await chrome.storage.local.set({ [RATE_KEY]: window });
    return true; // Allowed
  });
}

// ---------------------------------------------------------------------------
// Core submit path (D-05 ordering: rate-limit → disk-write → fetch)
// ---------------------------------------------------------------------------

/**
 * Submit a bug report payload, enforcing the D-05 ordering invariant.
 *
 * Result contract (D-06/D-08 — superset of XPORT-05):
 *   { ok: false, queued: false, fingerprint: null, rateLimited: true,  dropped: false } — rate-limited
 *   { ok: true,  queued: false, fingerprint: <string>, rateLimited: false, dropped: false } — success
 *   { ok: false, queued: true,  fingerprint: null, rateLimited: false, dropped: false } — queued for retry
 *   { ok: false, queued: false, fingerprint: null, rateLimited: false, dropped: true  } — permanent drop
 *
 * @param {object|null|undefined} payload — the buildReportPayload() output.
 * @returns {Promise<{ok:boolean, queued:boolean, fingerprint:string|null, rateLimited:boolean, dropped:boolean}>}
 */
export async function submitReport(payload) {
  // 1. Null/undefined guard (V5 defensive guard per RESEARCH Security Domain).
  //    Do NOT re-validate fields — that is the Phase 2 builder's responsibility.
  if (payload == null) {
    return { ok: false, queued: false, fingerprint: null, rateLimited: false, dropped: true };
  }

  // 2. Rate-limit check FIRST — no queue write and no fetch on ceiling hit (D-05).
  const allowed = await checkAndUpdateRateLimit();
  if (!allowed) {
    return { ok: false, queued: false, fingerprint: null, rateLimited: true, dropped: false };
  }

  // 3. Disk-first enqueue (QUEUE-01) — write BEFORE fetch so the entry survives SW termination.
  const entry = {
    payload,
    attemptCount: 0,
    nextAttemptAt: 0,      // 0 = immediately eligible for drain
    enqueuedAt: Date.now(),
  };

  // Serialized RMW (CR-01) — await the set() before any fetch (Pitfall 6 / Pitfall 1).
  await _enqueueEntry(entry);

  // 4. Attempt the fetch (via the shared attemptEntry helper).
  const result = await attemptEntry(entry);

  if (result.outcome === 'success') {
    return { ok: true, queued: false, fingerprint: result.fingerprint, rateLimited: false, dropped: false };
  } else if (result.outcome === 'queued') {
    return { ok: false, queued: true, fingerprint: null, rateLimited: false, dropped: false };
  } else {
    // 'dropped' — permanent 4xx or attempts exhausted
    return { ok: false, queued: false, fingerprint: null, rateLimited: false, dropped: true };
  }
}

// ---------------------------------------------------------------------------
// Fetch + retry/backoff machinery (D-04, QUEUE-02, QUEUE-03)
// ---------------------------------------------------------------------------

/**
 * Attempt to POST the entry's payload to the Worker.
 *
 * Returns one of:
 *   { outcome: 'success', fingerprint: string }
 *   { outcome: 'queued' }
 *   { outcome: 'dropped' }
 *
 * On 429/5xx/network-throw: increments entry.attemptCount, updates nextAttemptAt,
 * persists the updated entry into bugReportQueue, and schedules a setTimeout drain
 * (D-01 in-session retry). If attemptCount reaches MAX_ATTEMPTS, removes the entry
 * silently instead.
 *
 * On 4xx (not 429): removes the entry permanently (D-04, QUEUE-03).
 * On 200/201: removes the entry from the queue atomically and returns 'success'.
 *
 * @param {object} entry — a queue entry with { payload, attemptCount, nextAttemptAt, enqueuedAt }.
 * @returns {Promise<{outcome: string, fingerprint?: string}>}
 */
async function attemptEntry(entry) {
  let resp;
  let networkError = false;

  try {
    resp = await fetch(WORKER_REPORT_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PROXY_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(entry.payload),
    });
  } catch {
    // Network-level throw (no internet, DNS failure, etc.) — treat as retryable (D-04).
    networkError = true;
  }

  // Success path: 200 or 201 (per Phase 1 D-02, dedup hit also returns 200).
  if (!networkError && resp.ok) {
    let fingerprint = null;
    try {
      const body = await resp.json();
      fingerprint = body.fingerprint ?? null;
    } catch {
      // Non-JSON or missing fingerprint — not a fatal error; treat as successful submit.
    }
    // Remove the entry from the queue atomically (QUEUE-01 success path).
    await _removeEntryFromQueue(entry);
    return { outcome: 'success', fingerprint };
  }

  // Permanent-drop path: 4xx except 429 (D-04, QUEUE-03).
  // A 400 means the payload is malformed and will never succeed (Phase 1 D-09).
  if (!networkError && resp.status >= 400 && resp.status < 500 && resp.status !== 429) {
    await _removeEntryFromQueue(entry);
    return { outcome: 'dropped' };
  }

  // Retry path: 429, 5xx, or network throw.
  entry.attemptCount += 1;
  const backoffMs = BACKOFF_MS[entry.attemptCount - 1] ?? BACKOFF_MS[BACKOFF_MS.length - 1];
  entry.nextAttemptAt = Date.now() + backoffMs;

  if (entry.attemptCount >= MAX_ATTEMPTS) {
    // Max attempts reached — silent drop (D-04).
    await _removeEntryFromQueue(entry);
    return { outcome: 'dropped' };
  }

  // Persist the updated entry (D-03 — backoff state survives SW death).
  await _updateEntryInQueue(entry);

  // Schedule in-session retry (D-01 — setTimeout only; no alarms API permitted).
  // Swallow rejections (D-07 silent; an unhandled SW rejection can terminate the worker — WR-03).
  setTimeout(() => { drainQueueOnce().catch(() => {}); }, backoffMs);

  return { outcome: 'queued' };
}

// ---------------------------------------------------------------------------
// Queue read-modify-write helpers
// ---------------------------------------------------------------------------

/**
 * Disk-first enqueue (QUEUE-01/QUEUE-02) — serialized RMW (CR-01).
 * Prunes TTL-expired entries, appends the new entry, and caps at QUEUE_CAP
 * (oldest-drop by enqueuedAt).
 */
async function _enqueueEntry(entry) {
  return withStorageLock(async () => {
    const stored = await chrome.storage.local.get(QUEUE_KEY);
    const raw = stored[QUEUE_KEY];
    const now = Date.now();

    // Prune TTL-expired entries on enqueue (QUEUE-02).
    let queue = (Array.isArray(raw) ? raw : []).filter(e => now - e.enqueuedAt < QUEUE_TTL_MS);
    queue.push(entry);

    // Cap at QUEUE_CAP — drop oldest by enqueuedAt when over limit (QUEUE-02).
    if (queue.length > QUEUE_CAP) {
      queue.sort((a, b) => a.enqueuedAt - b.enqueuedAt);
      queue = queue.slice(queue.length - QUEUE_CAP);
    }

    await chrome.storage.local.set({ [QUEUE_KEY]: queue });
  });
}

/**
 * Remove an entry from bugReportQueue (serialized RMW, filtered by enqueuedAt identity).
 */
async function _removeEntryFromQueue(entry) {
  return withStorageLock(async () => {
    const stored = await chrome.storage.local.get(QUEUE_KEY);
    const raw = stored[QUEUE_KEY];
    const queue = (Array.isArray(raw) ? raw : []).filter(e => e.enqueuedAt !== entry.enqueuedAt);
    await chrome.storage.local.set({ [QUEUE_KEY]: queue });
  });
}

/**
 * Update a modified entry in bugReportQueue (serialized RMW, matched by enqueuedAt).
 */
async function _updateEntryInQueue(entry) {
  return withStorageLock(async () => {
    const stored = await chrome.storage.local.get(QUEUE_KEY);
    const raw = stored[QUEUE_KEY];
    const queue = (Array.isArray(raw) ? raw : []).map(e =>
      e.enqueuedAt === entry.enqueuedAt ? entry : e
    );
    await chrome.storage.local.set({ [QUEUE_KEY]: queue });
  });
}

// ---------------------------------------------------------------------------
// Drain — mutex-guarded, TTL-pruning, nextAttemptAt-honoring (D-07, QUEUE-02)
// ---------------------------------------------------------------------------

/**
 * Drain the bugReportQueue once — processes all entries whose nextAttemptAt
 * is in the past, honoring persisted backoff state (D-03).
 *
 * Guarded by the drainingQueue mutex (Pattern 2) to prevent concurrent
 * drain attempts from racing on chrome.storage.local.
 *
 * Silent: returns nothing the caller uses, renders no toast (D-07).
 *
 * @returns {Promise<void>}
 */
export async function drainQueueOnce() {
  if (drainingQueue) {
    return drainingQueue;
  }
  drainingQueue = _doDrain();
  try {
    await drainingQueue;
  } finally {
    drainingQueue = null;
  }
}

/**
 * Internal drain implementation (called exclusively by drainQueueOnce).
 */
async function _doDrain() {
  // Take a consistent snapshot under the storage lock: prune TTL-expired entries
  // (QUEUE-02) and compute the eligible set, then RELEASE the lock before any
  // attemptEntry call. attemptEntry re-acquires the lock per write via the
  // _removeEntryFromQueue / _updateEntryInQueue helpers — holding the lock across
  // the loop (which awaits fetch) would self-deadlock the chain (CR-01).
  const eligible = await withStorageLock(async () => {
    const stored = await chrome.storage.local.get(QUEUE_KEY);
    const raw = stored[QUEUE_KEY];
    if (!Array.isArray(raw) || raw.length === 0) return [];

    const now = Date.now();

    // Prune TTL-expired entries first (QUEUE-02 — 7-day TTL).
    const live = raw.filter(e => now - e.enqueuedAt < QUEUE_TTL_MS);
    if (live.length !== raw.length) {
      await chrome.storage.local.set({ [QUEUE_KEY]: live });
    }

    // Entries whose nextAttemptAt is in the past (D-03 — honor persisted backoff).
    return live.filter(e => e.nextAttemptAt <= now);
  });

  for (const entry of eligible) {
    // attemptEntry handles its own serialized read-modify-write (remove on
    // success/drop, update on retry). Ignore the return value — drain is silent (D-07).
    await attemptEntry(entry);
  }
}

// ---------------------------------------------------------------------------
// Test-only export — allows tests to simulate SW death (D-09)
// ---------------------------------------------------------------------------

/**
 * Reset the module-level drainingQueue mutex.
 * TEST-ONLY — used by Plan 03-02 to simulate SW death and verify that a fresh
 * drain call processes the persisted queue (D-09).
 */
export function _resetMutex() {
  drainingQueue = null;
  storageLock = Promise.resolve();
}

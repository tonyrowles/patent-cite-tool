# Phase 3: Background Submission Handler + Rate Limit + Retry Queue - Pattern Map

**Mapped:** 2026-06-13
**Files analyzed:** 7 (2 new, 3 modified, 2 config-extended)
**Analogs found:** 7 / 7

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/shared/report-transport.js` | service/utility | request-response + CRUD | `src/shared/report-payload-builder.js` | role-match (shared ES module, pure-ish exports) |
| `src/background/service-worker.js` | background/controller | request-response + CRUD | `src/background/service-worker.js` (existing) | exact (self-modification: add branch to existing onMessage dispatch) |
| `src/firefox/background.js` | background/controller | request-response + CRUD | `src/firefox/background.js` (existing) | exact (self-modification: identical branch addition) |
| `vitest.config.chrome.js` | config | — | `vitest.config.chrome.js` (existing) | exact (extend `include` array) |
| `vitest.config.firefox.js` | config | — | `vitest.config.firefox.js` (existing) | exact (extend `include` array) |
| `tests/unit/report-transport-chrome.test.js` | test | request-response + CRUD | `tests/unit/report-payload-builder.test.js` | role-match (Vitest unit test for a `src/shared/` module) |
| `tests/unit/report-transport-firefox.test.js` | test | request-response + CRUD | `tests/unit/report-payload-builder.test.js` + `tests/unit/select-cron-cases.test.js` | role-match (fake-timer pattern) |

---

## Pattern Assignments

### `src/shared/report-transport.js` (new — service/utility, request-response + CRUD)

**Analog:** `src/shared/report-payload-builder.js`

**Imports pattern** (`src/shared/report-payload-builder.js` lines 9, and `src/offscreen/offscreen.js` lines 20-24):
```javascript
// report-payload-builder.js:9 — imports only from ./constants.js (no browser APIs at module scope)
import { REPORT_CATEGORIES } from './constants.js';

// report-transport.js: extend this pattern
import { MSG, WORKER_REPORT_URL } from './constants.js';
// PROXY_TOKEN is defined as a local const (NOT imported from constants.js).
// Follows the established pattern in offscreen.js:24 and pdf-pipeline.js:23:
const PROXY_TOKEN = '4509b9943f831fb140eb0c3a7304f23cc6f72e41b5e5f8c800a42e94f09cadbe';
```

**PROXY_TOKEN fetch pattern** (`src/offscreen/offscreen.js` lines 24, 246-247; `src/firefox/pdf-pipeline.js` lines 23, 193-194, 428-431):
```javascript
// offscreen.js:24
const PROXY_TOKEN = '4509b9943f831fb140eb0c3a7304f23cc6f72e41b5e5f8c800a42e94f09cadbe';

// offscreen.js:246-247 (Worker POST pattern)
const resp = await fetch(url, {
  headers: { 'Authorization': `Bearer ${PROXY_TOKEN}` },
  // pdf-pipeline.js:428-431 shows POST with Content-Type:
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${PROXY_TOKEN}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(payload),
});
```

**Mutex pattern** (`src/background/service-worker.js` lines 49-78):
```javascript
// service-worker.js:49 — module-level mutex variable
let creatingOffscreen = null;

// service-worker.js:55-78 — mutex usage: if already in flight, await the existing promise
async function ensureOffscreenDocument() {
  if (creatingOffscreen) {
    await creatingOffscreen;
    return;
  }
  creatingOffscreen = chrome.offscreen.createDocument({ ... });
  await creatingOffscreen;
  creatingOffscreen = null;
}
// Copy this pattern as: let drainingQueue = null; async function drainQueueOnce() { ... }
```

**chrome.storage.local read-modify-write pattern** (`src/background/service-worker.js` lines 249-257, 171):
```javascript
// service-worker.js:249 — get
const data = await chrome.storage.local.get('currentPatent');
const patent = data.currentPatent;
if (!patent) return;
// ... modify patent ...
// service-worker.js:257 — set
await chrome.storage.local.set({ currentPatent: patent });

// For report-transport.js, apply same pattern to bugReportQueue and bugReportRateLimitWindow:
const { bugReportQueue: raw } = await chrome.storage.local.get('bugReportQueue');
const queue = raw ?? [];
// ... modify queue ...
await chrome.storage.local.set({ bugReportQueue: queue });
```

**Module scope constraint** (`src/offscreen/offscreen.js` line 42-44 — `chrome` only inside function bodies):
```javascript
// offscreen.js:42-44 — chrome.storage.local referenced inside async function, not at module scope
async function readTestModeOverrides() {
  const result = await chrome.storage.local.get(['pct_test_cache_version', 'pct_test_mode']);
  // ...
}
// report-transport.js MUST follow this: never write `const storage = chrome.storage.local`
// at module scope — chrome-stub is injected at runtime, not parse time.
```

**Error handling style** (`src/background/service-worker.js` lines 443-451):
```javascript
// service-worker.js:443-451 — try/catch with .catch(() => { /* tab may be gone */ }) idiom
try {
  await ensureOffscreenDocument();
  // ...
} catch (error) {
  console.warn('[SW] Lookup forward failed:', error.message);
  chrome.tabs.sendMessage(tabId, { type: MSG.CITATION_RESULT, success: false, error: 'lookup-failed' })
    .catch(() => { /* tab may be gone */ });
}
// report-transport.js fetch errors: catch all throws → retry path (network-error → retry per D-04)
```

---

### `src/background/service-worker.js` (modified — add MSG.SUBMIT_REPORT branch + onStartup drain)

**Analog:** `src/background/service-worker.js` itself (existing onMessage dispatch at line 132; existing GET_STATUS async branch at lines 153-156)

**Existing onMessage dispatch pattern** (lines 132-157 — the chain to extend):
```javascript
// service-worker.js:132-157
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  if (message.type === MSG.PDF_LINK_FOUND) {
    handlePdfLinkFound(message, tabId);
  } else if (message.type === MSG.PDF_LINK_NOT_FOUND) {
    // ...
  } else if (message.type === MSG.GET_STATUS) {
    handleGetStatus(sendResponse);
    return true; // Keep channel open for async sendResponse  ← line 155
  }
  // ADD HERE (after existing last else-if):
  // } else if (message.type === MSG.SUBMIT_REPORT) {
  //   handleSubmitReport(message.payload, sendResponse);
  //   return true; // Keep channel open for async sendResponse
  // }
});
```

**The `return true` pattern** (line 155 — the only existing async-sendResponse use):
```javascript
// service-worker.js:153-156 — exact precedent to mirror for SUBMIT_REPORT
} else if (message.type === MSG.GET_STATUS) {
  handleGetStatus(sendResponse);
  return true; // Keep channel open for async sendResponse
}
```

**Opportunistic drain wiring** (D-02 — add `drainQueueOnce()` at entry of onMessage listener):
```javascript
// Pattern: call drainQueueOnce() at the top of the addListener callback.
// No existing analog — Phase 3 introduces this. Fire-and-forget (no await).
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  drainQueueOnce(); // opportunistic drain on any wake (D-02) — fire-and-forget
  const tabId = sender.tab?.id;
  // ... existing dispatch chain ...
});
```

**onStartup listener** (no existing analog — Phase 3 introduces the first one):
```javascript
// No onStartup exists in service-worker.js (confirmed by grep).
// Pattern from research: mirrors onInstalled at line 84.
// service-worker.js:84 — onInstalled for reference shape:
chrome.runtime.onInstalled.addListener(() => {
  chrome.action.disable();
  // ...
});
// New onStartup (Phase 3 adds this immediately after onInstalled block):
chrome.runtime.onStartup.addListener(() => {
  drainQueueOnce(); // fire-and-forget; silent per D-07
});
```

**onInstalled drain extension** (line 84 — extend existing block to also trigger drain):
```javascript
// service-worker.js:84-113 — existing onInstalled block.
// Add drain call at the end of the existing handler body (before closing brace):
chrome.runtime.onInstalled.addListener(() => {
  // ... existing rules/menu setup ...
  drainQueueOnce(); // drain on install/update (D-02)
});
```

---

### `src/firefox/background.js` (modified — identical MSG.SUBMIT_REPORT branch + drain)

**Analog:** `src/firefox/background.js` itself (existing onMessage dispatch at line 106; GET_STATUS async branch at lines 115-117)

**Existing onMessage dispatch pattern** (lines 106-122):
```javascript
// background.js:106-122
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  if (message.type === MSG.PDF_LINK_FOUND) {
    handlePdfLinkFound(message, tabId);
  } else if (message.type === MSG.PDF_LINK_NOT_FOUND) {
    handlePdfUnavailable(message, tabId);
  } else if (message.type === MSG.LOOKUP_POSITION) {
    handleLookupPosition(message, sender);
  } else if (message.type === MSG.GET_STATUS) {
    handleGetStatus(sendResponse);
    return true; // Keep channel open for async sendResponse  ← line 117
  }
  // ADD: identical SUBMIT_REPORT branch as Chrome SW
});
```

**onInstalled block** (line 60 — extend to add drain):
```javascript
// background.js:60-73 — existing onInstalled
chrome.runtime.onInstalled.addListener(() => {
  chrome.action.disable();
  chrome.contextMenus.create({ ... });
  // ADD at end: drainQueueOnce();
});
```

**Key difference from Chrome SW:** Firefox background.js imports pipeline functions directly (lines 18-25). The shared `report-transport.js` module is imported the same way:
```javascript
// background.js:17-25 — Firefox import style for shared modules
import { MSG, STATUS, PATENT_TYPE } from '../shared/constants.js';
import {
  checkServerCache,
  fetchAndParsePdf,
  // ...
} from './pdf-pipeline.js';
// ADD for Phase 3:
import { submitReport, drainQueueOnce } from '../shared/report-transport.js';
```

---

### `vitest.config.chrome.js` (modified — extend include array)

**Analog:** `vitest.config.chrome.js` (existing — self-modification)

**Current include array** (lines 9-12):
```javascript
// vitest.config.chrome.js:1-23
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup/chrome-stub.js'],
    include: [
      'tests/unit/text-matcher.test.js',
      'tests/unit/shared-matching.test.js',
      // ADD:
      'tests/unit/report-transport-chrome.test.js',
    ],
    name: 'chrome-dist',
  },
  resolve: {
    alias: [
      {
        find: /.*src\/shared\/matching\.js/,
        replacement: resolve('./dist/chrome/matching-exports.js'),
      },
    ],
  },
});
```

**Critical note:** The alias at lines 16-20 is scoped to `matching.js` only. `report-transport.js` and `constants.js` are NOT redirected — tests import them from `src/shared/` directly. No new alias is needed.

---

### `vitest.config.firefox.js` (modified — extend include array)

**Analog:** `vitest.config.firefox.js` (existing — self-modification, identical structure to chrome config)

**Modification** (same shape as chrome config, different test filename and alias target):
```javascript
// vitest.config.firefox.js:9-11 — extend include:
include: [
  'tests/unit/text-matcher.test.js',
  'tests/unit/shared-matching.test.js',
  // ADD:
  'tests/unit/report-transport-firefox.test.js',
],
// name: 'firefox-dist'
// alias: dist/firefox/matching-exports.js (unchanged)
```

---

### `tests/unit/report-transport-chrome.test.js` (new — test, request-response + CRUD)

**Analog:** `tests/unit/report-payload-builder.test.js` (Vitest unit test for a `src/shared/` module) + `tests/unit/select-cron-cases.test.js` (fake-timer pattern)

**File header and imports pattern** (`report-payload-builder.test.js` lines 1-32):
```javascript
// tests/unit/report-payload-builder.test.js:1-32 — file header, import style
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildReportPayload } from '../../src/shared/report-payload-builder.js';
import { REPORT_CATEGORIES, WORKER_REPORT_URL, MSG } from '../../src/shared/constants.js';

// For report-transport tests — import the shared helper directly (NOT service-worker.js)
// so top-level event listener registration is never triggered in Node.js:
import { submitReport, drainQueueOnce, _resetMutex } from '../../src/shared/report-transport.js';
import { WORKER_REPORT_URL, MSG } from '../../src/shared/constants.js';
```

**Fake-timer + stateful storage mock pattern** (`select-cron-cases.test.js` lines 33-35; `chrome-stub.js` lines 19-24):
```javascript
// select-cron-cases.test.js:34-35 — vi.useFakeTimers() in beforeEach/afterEach
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

// chrome-stub.js:19-24 — bare vi.fn() stubs for chrome.storage.local
// (Phase 3 tests OVERRIDE these per-test with stateful implementations)
// chrome.storage.local.get: vi.fn()
// chrome.storage.local.set: vi.fn()
```

**Stateful chrome.storage mock pattern** (per-test override, described in RESEARCH.md Pattern 5):
```javascript
// Per-test stateful override — do NOT modify chrome-stub.js globally.
// Override chrome.storage.local.get/.set in beforeEach within the test file:
let _localStore = {};

beforeEach(() => {
  vi.useFakeTimers();
  _localStore = {};
  // chrome is already stubbed globally via tests/setup/chrome-stub.js (vi.stubGlobal).
  // Override only the storage methods per-test:
  chrome.storage.local.get.mockImplementation(async (keys) => {
    if (typeof keys === 'string') return { [keys]: _localStore[keys] };
    if (Array.isArray(keys)) return Object.fromEntries(keys.map(k => [k, _localStore[k]]));
    return Object.assign({}, _localStore); // null → return all
  });
  chrome.storage.local.set.mockImplementation(async (obj) => {
    Object.assign(_localStore, obj);
  });
  // Also stub global fetch for transport tests:
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
```

**Static-grep test pattern** (`report-payload-builder.test.js` lines 178-187):
```javascript
// report-payload-builder.test.js:178-187 — static-grep via readFileSync (SC4/XPORT-06 pattern)
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

it('XPORT-06: no fetch(WORKER_REPORT_URL in src/content/', () => {
  // Read each content script file and assert no cross-origin fetch
  const contentSrc = readFileSync(
    path.resolve(__dirname, '../../src/content/citation-ui.js'), 'utf8'
  );
  expect(contentSrc).not.toMatch(/fetch\s*\(\s*WORKER_REPORT_URL/);
  expect(contentSrc).not.toMatch(/fetch\s*\(\s*['"]https:\/\/pct\.tonyrowles\.com/);
});
```

**SW termination simulation pattern** (RESEARCH.md Pattern, D-09):
```javascript
// Simulate SW death: clear in-memory mutex, call drain against persisted _localStore
it('SC3: queued report survives SW death and is retried on next onStartup drain', async () => {
  // Seed _localStore with a queued entry (attemptCount=1, nextAttemptAt=0)
  _localStore.bugReportQueue = [{
    payload: { category: 'no_match', patentNumber: '12505414', extensionVersion: '5.0.0',
               patentUrl: null, returnedCitation: null, confidenceTier: null,
               browser: null, os: null, xpathNode: null, scrollY: null,
               viewportWidth: null, viewportHeight: null, pdfParseStatus: null,
               triggerMode: null, errorLog: [], note: null },
    attemptCount: 1,
    nextAttemptAt: 0,        // immediately eligible
    enqueuedAt: Date.now(),
  }];

  // Simulate SW death: discard in-memory state
  _resetMutex();  // reset the module-level drainingQueue mutex

  // Simulate onStartup: call drain; fetch succeeds
  fetch.mockResolvedValueOnce({
    ok: true, status: 200,
    json: async () => ({ ok: true, fingerprint: 'abc123def456' }),
  });
  await drainQueueOnce();

  // Queue should be empty after successful retry
  expect(_localStore.bugReportQueue ?? []).toHaveLength(0);
});
```

---

### `tests/unit/report-transport-firefox.test.js` (new — test, request-response + CRUD)

**Analog:** Same as `report-transport-chrome.test.js` above.

**Key difference:** Per RESEARCH.md Assumption A2, Chrome and Firefox logic is byte-identical (XPORT-05 "identical dispatch shape"). The Firefox test file may import from the same `src/shared/report-transport.js` and assert the same behaviors. Its presence in `vitest.config.firefox.js` ensures the per-target CI run (`npm run test:firefox`) covers it.

If Chrome and Firefox paths diverge in the future, this file is the extension point. For Phase 3, the test file structure mirrors `report-transport-chrome.test.js` with only the file `name` / header comment distinguishing them.

---

## Shared Patterns

### MSG.SUBMIT_REPORT onMessage branch (async sendResponse)

**Source:** `src/background/service-worker.js` lines 153-156 (GET_STATUS branch — the only existing async-sendResponse pattern)
**Apply to:** `src/background/service-worker.js` (new branch), `src/firefox/background.js` (identical new branch)

```javascript
// service-worker.js:153-156 — exact model to copy for SUBMIT_REPORT
} else if (message.type === MSG.GET_STATUS) {
  handleGetStatus(sendResponse);
  return true; // Keep channel open for async sendResponse
}
// SUBMIT_REPORT copies this shape:
} else if (message.type === MSG.SUBMIT_REPORT) {
  submitReport(message.payload)
    .then(result => sendResponse(result))
    .catch(() => sendResponse({ ok: false, dropped: true }));
  return true; // Keep channel open for async sendResponse
}
```

### chrome.storage.local read-modify-write

**Source:** `src/background/service-worker.js` lines 249-257 (handlePdfFetchResult); `src/firefox/background.js` lines 412-418 (updateStorage helper)
**Apply to:** `src/shared/report-transport.js` (all queue and rate-limit operations)

```javascript
// service-worker.js:249, 257 — canonical get/set pair
const data = await chrome.storage.local.get('currentPatent');
const patent = data.currentPatent;
if (!patent) return;
// ... modify ...
await chrome.storage.local.set({ currentPatent: patent });

// firefox/background.js:412-418 — updateStorage helper shows the partial-merge idiom
async function updateStorage(patentId, updates) {
  const data = await chrome.storage.local.get('currentPatent');
  const patent = data.currentPatent;
  if (!patent) return;
  Object.assign(patent, updates);
  await chrome.storage.local.set({ currentPatent: patent });
}
```

### PROXY_TOKEN Bearer header for Worker fetches

**Source:** `src/offscreen/offscreen.js` lines 24, 246-247; `src/firefox/pdf-pipeline.js` lines 23, 193-194, 428-431
**Apply to:** `src/shared/report-transport.js` (the fetch POST to WORKER_REPORT_URL)

```javascript
// offscreen.js:24 — local const definition (NOT from constants.js)
const PROXY_TOKEN = '4509b9943f831fb140eb0c3a7304f23cc6f72e41b5e5f8c800a42e94f09cadbe';

// pdf-pipeline.js:428-431 — POST with Authorization + Content-Type
const resp = await fetch(url, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${PROXY_TOKEN}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(payload),
});
```

### Module-level mutex (prevent concurrent read-modify-write)

**Source:** `src/background/service-worker.js` lines 49-78 (creatingOffscreen mutex)
**Apply to:** `src/shared/report-transport.js` (drainingQueue mutex)

```javascript
// service-worker.js:49 — module-level mutex variable
let creatingOffscreen = null;

// service-worker.js:55-78 — check-in-flight, assign, await, null-out-in-finally pattern
async function ensureOffscreenDocument() {
  if (creatingOffscreen) {
    await creatingOffscreen;
    return;
  }
  creatingOffscreen = chrome.offscreen.createDocument({ ... });
  await creatingOffscreen;
  creatingOffscreen = null;
}
// Translate to:
let drainingQueue = null;
async function drainQueueOnce() {
  if (drainingQueue) return drainingQueue;
  drainingQueue = _doDrain();
  try { await drainingQueue; } finally { drainingQueue = null; }
}
```

### Vitest fake-timer setup/teardown

**Source:** `tests/unit/select-cron-cases.test.js` lines 33-35
**Apply to:** `tests/unit/report-transport-chrome.test.js`, `tests/unit/report-transport-firefox.test.js`

```javascript
// select-cron-cases.test.js:33-35
describe('selectCronCases', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  // ...
});
```

### Per-test chrome.storage.local mock (stateful override)

**Source:** `tests/setup/chrome-stub.js` lines 18-27 (bare vi.fn() base); overridden per-test
**Apply to:** `tests/unit/report-transport-chrome.test.js`, `tests/unit/report-transport-firefox.test.js`

```javascript
// chrome-stub.js:18-27 — bare stubs (base layer, do NOT modify)
local: {
  get: vi.fn(),
  set: vi.fn(),
},
// In report-transport test files, per-test override in beforeEach:
chrome.storage.local.get.mockImplementation(async (keys) => {
  if (typeof keys === 'string') return { [keys]: _localStore[keys] };
  // ...
});
chrome.storage.local.set.mockImplementation(async (obj) => {
  Object.assign(_localStore, obj);
});
```

### Static-grep assertion (XPORT-06)

**Source:** `tests/unit/report-payload-builder.test.js` lines 178-187 (readFileSync + not.toMatch)
**Apply to:** `tests/unit/report-transport-chrome.test.js` (SC1 guard)

```javascript
// report-payload-builder.test.js:179-187
it('Test 10: builder source has zero browser API calls and no node-builtin imports', () => {
  const builderPath = path.resolve(__dirname, '../../src/shared/report-payload-builder.js');
  const src = readFileSync(builderPath, 'utf8');
  expect(src).not.toMatch(/chrome\s*\./);
  expect(src).not.toMatch(/from\s+['"]node:(fs|path|child_process|crypto)['"]/);
});
// For XPORT-06: scan src/content/ files for no fetch(WORKER_REPORT_URL
```

### Fire-and-forget error suppression

**Source:** `src/background/service-worker.js` lines 189-192, 261-262
**Apply to:** `src/background/service-worker.js` (drain invocation from onStartup and onInstalled)

```javascript
// service-worker.js:261-262 — fire-and-forget with .catch(() => {})
chrome.runtime.sendMessage({ type: MSG.UPLOAD_TO_CACHE, patentId: patent.patentId })
  .catch(() => { /* fire-and-forget */ });
// Drain calls mirror this: drainQueueOnce() with no await and no .catch
// (drain internally handles its own errors; D-07 — background retries are silent)
chrome.runtime.onStartup.addListener(() => {
  drainQueueOnce(); // fire-and-forget
});
```

---

## No Analog Found

All files have close analogs. No files require falling back to RESEARCH.md-only patterns.

---

## Key Anti-Patterns Documented (from RESEARCH.md — for planner reference)

| Anti-Pattern | Source That Shows Correct Pattern | Note |
|---|---|---|
| `const storage = chrome.storage.local` at module scope | `offscreen.js:42` (reference inside function body) | chrome-stub injected at runtime; top-level reference throws in Node.js test env |
| Import `service-worker.js` directly in tests | `report-payload-builder.test.js:29` (imports `src/shared/` module) | SW registers top-level listeners on import; test must import `src/shared/report-transport.js` |
| Add storage mock state to global `chrome-stub.js` | (none — existing tests use bare `vi.fn()`) | Would break 55+ existing tests; use per-test `mockImplementation` in `beforeEach` |
| Fetch before disk write | `offscreen.js:197-216` (fetch is the action; report-transport inverts this to write-first) | QUEUE-01 disk-first invariant |

---

## Metadata

**Analog search scope:** `src/background/`, `src/firefox/`, `src/shared/`, `src/offscreen/`, `tests/unit/`, `tests/setup/`, `vitest.config.*.js`
**Files scanned:** 11 source files + 2 config files
**Pattern extraction date:** 2026-06-13

# Phase 4: Report Dialog UI + Citation-UI Wiring - Pattern Map

**Mapped:** 2026-06-13
**Files analyzed:** 7 new/modified files
**Analogs found:** 6 / 7 (1 file has no close DOM analog; relies on RESEARCH.md patterns)

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/content/report-dialog.js` | component | request-response (dialog → sendMessage → toast) | `src/content/citation-ui.js` (showCitationPopup, showErrorPopup) | role-match (same Shadow DOM lifecycle; dialog vs popup) |
| `src/content/citation-ui.js` (modified) | component | request-response | itself — `showCitationPopup` lines 111-231 (copy button injection pattern) | exact |
| `src/content/content-script.js` (modified) | controller | request-response | itself — `generateCitation` / `handleCitationResult` lines 433-550 | exact |
| PAY-09 capture helpers (in `report-dialog.js`) | utility | transform (DOM read → plain object) | none found — net-new DOM walkers; RESEARCH Pattern 3 is the authority | no analog |
| PAY-08 `installErrorBuffer()` (in `report-dialog.js`) | utility | event-driven (console intercept → storage RMW) | `src/shared/report-transport.js` lines 63-70 (storageLock RMW pattern) + `src/background/service-worker.js` line 393-405 (storage.get/set pair) | partial-match (same storage API; no console-intercept analog) |
| `tests/unit/report-dialog.test.js` (new) | test | — | `tests/unit/report-transport-chrome.test.js` (chrome mock + stateful storage) | role-match |
| `tests/unit/report-dialog-buffer.test.js` (new) | test | — | `tests/unit/report-transport-chrome.test.js` (chrome mock + stateful storage + buildChromeMock) | role-match |

---

## Pattern Assignments

### `src/content/report-dialog.js` (component, request-response)

**Analog:** `src/content/citation-ui.js` — specifically `showCitationPopup` (lines 111-232), `showErrorPopup` (lines 240-270), `showSuccessToast` / `showFailureToast` (lines 311-385), and `getCitationPopupCSS()` (lines 417-497).

---

**Imports pattern** (citation-ui.js lines 1-17 and content-script.js lines 1-15):

```javascript
// From src/content/content-script.js lines 9-15 — module import convention for content scripts
import { MSG, PATENT_TYPE } from '../shared/constants.js';
import { findParagraphCitation } from './paragraph-finder.js';
import {
  showFloatingButton, showCitationPopup, showErrorPopup,
  showLoadingIndicator, showSuccessToast, showFailureToast,
  dismissCitationUI
} from './citation-ui.js';

// report-dialog.js will import:
import { MSG, REPORT_CATEGORIES } from '../shared/constants.js';
import { buildReportPayload } from '../shared/report-payload-builder.js';
// NOTE: getCitationHost() is NOT imported — shadow is always received as a parameter
// to avoid calling getCitationHost() which wipes the shadow root (citation-ui.js:27-32)
```

---

**Shadow DOM host pattern** (citation-ui.js lines 26-42) — CRITICAL: report-dialog.js NEVER calls this function; it receives `shadow` as a parameter:

```javascript
// citation-ui.js lines 26-42 — the host creation pattern the dialog must NOT duplicate
function getCitationHost() {
  if (citationHost && document.body.contains(citationHost)) {
    // Clear existing content — THIS IS WHY report-dialog.js must never call getCitationHost()
    while (citationShadow.firstChild) {
      citationShadow.removeChild(citationShadow.firstChild);
    }
    return { host: citationHost, shadow: citationShadow };
  }

  citationHost = document.createElement('div');
  citationHost.id = 'patent-cite-host';
  citationHost.setAttribute('data-testid', 'pct-citation-host');
  citationHost.style.cssText = 'all: initial; position: fixed; z-index: 2147483647; pointer-events: none;';
  citationShadow = citationHost.attachShadow({ mode: 'closed' });
  document.body.appendChild(citationHost);
  return { host: citationHost, shadow: citationShadow };
}
```

---

**Shadow DOM element injection pattern** (citation-ui.js lines 111-122) — copy this exact structure for the dialog panel:

```javascript
// citation-ui.js lines 111-122 — getCitationHost() + createElement + shadow.appendChild
export function showCitationPopup(citation, rect, confidence, displayMode, matchedText) {
  const { host, shadow } = getCitationHost();

  const style = document.createElement('style');
  style.textContent = getCitationPopupCSS();
  shadow.appendChild(style);

  const popup = document.createElement('div');
  popup.className = 'cite-popup';
  popup.setAttribute('data-testid', 'pct-citation-pill');
  popup.style.pointerEvents = 'auto';
  // ...build DOM...
  shadow.appendChild(popup);
```

**For report-dialog.js — receive `shadow` as param, inject style + panel:**

```javascript
// Mirror pattern but receive shadow as param (never call getCitationHost())
export function showReportDialog(shadow, reportOutcome, selectionRect) {
  const style = document.createElement('style');
  style.textContent = getReportDialogCSS();
  shadow.appendChild(style);

  const panel = document.createElement('div');
  panel.className = 'cite-report-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', 'Report a citation problem');
  panel.style.pointerEvents = 'auto';
  // ...build DOM...
  shadow.appendChild(panel);
}
```

---

**Viewport clamping pattern** (citation-ui.js lines 203-214) — copy for anchored panel positioning:

```javascript
// citation-ui.js lines 203-214 — popup positioning with viewport clamping
const popupWidth = 220;
let top = rect.bottom + 8;
let left = rect.left;

if (top + 60 > window.innerHeight) {
  top = rect.top - 60;
}
if (left + popupWidth > window.innerWidth) {
  left = window.innerWidth - popupWidth - 8;
}
if (left < 8) left = 8;

host.style.top = `${top}px`;
host.style.left = `${left}px`;
host.style.width = 'auto';
host.style.height = 'auto';
```

---

**Click-outside dismiss pattern** (citation-ui.js lines 223-231) — copy for dialog click-outside:

```javascript
// citation-ui.js lines 223-231 — mousedown on document, check citationHost.contains
// Shadow DOM retargets events to the host element, so this correctly fires for
// clicks outside the shadow root
setTimeout(() => {
  document.addEventListener('mousedown', function handler(e) {
    if (!citationHost || !citationHost.contains(e.target)) {
      dismissCitationUI();
      document.removeEventListener('mousedown', handler);
    }
  });
}, 100);
```

---

**Button event handling pattern** (citation-ui.js lines 171-200) — copy for copy button / report button click handlers:

```javascript
// citation-ui.js lines 94-98 and 171-174 — stopPropagation on button click
btn.addEventListener('click', (e) => {
  e.stopPropagation();
  onClick();
});

// And copy button:
copyBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  navigator.clipboard.writeText(citation).then(() => { ... });
});
```

---

**CSS-in-JS template literal pattern** (citation-ui.js lines 391-497 / 515-561) — copy for `getReportDialogCSS()`:

```javascript
// citation-ui.js lines 417-430 — getCitationPopupCSS() structure to replicate
function getCitationPopupCSS() {
  return `
    .cite-popup {
      background: #fff;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.14);
      padding: 8px 10px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      color: #1a1a1a;
      min-width: 120px;
      max-width: 320px;
    }
    .cite-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    ...
  `;
}

// Success toast CSS (lines 515-537) — Submit success button colors come from here
function getSuccessToastCSS() {
  return `
    .cite-toast-success {
      background: #ecfdf5;
      border: 1px solid #a7f3d0;
      border-radius: 12px;
      color: #065f46;
      ...
    }
  `;
}

// Failure toast CSS (lines 539-561) — rate-limit toast colors come from here
function getFailureToastCSS() {
  return `
    .cite-toast-failure {
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 8px;
      color: #991b1b;
      ...
    }
  `;
}
```

**Token extraction (UI-SPEC.md confirmed values to use verbatim):**
- Surface: `#ffffff`, secondary `#f9fafb`, hover `#f3f4f6`, error `#fef2f2`, success `#ecfdf5`
- Borders: `#e5e7eb`, secondary `#d1d5db`, success `#a7f3d0`, error `#fecaca`
- Text: primary `#1a1a1a`, secondary `#6b7280`, muted `#374151`, success `#065f46`, error `#991b1b`
- Shadow: `0 2px 8px rgba(0,0,0,0.14)` (popup), `0 1px 4px rgba(0,0,0,0.10)` (toast)
- Radius: `4px` (copy btn / cancel), `8px` (popup panel / dialog), `12px` (success pill)

---

**Toast reuse pattern** (citation-ui.js lines 311-385) — call these after removing panel element:

```javascript
// citation-ui.js lines 311-342 — showSuccessToast(citation, rect)
export function showSuccessToast(citation, rect) {
  const { host, shadow } = getCitationHost();  // re-enters getCitationHost after panel.remove()
  const style = document.createElement('style');
  style.textContent = getSuccessToastCSS();
  shadow.appendChild(style);
  const pill = document.createElement('div');
  pill.className = 'cite-toast-success';
  pill.textContent = citation;
  // ...position + append...
  setTimeout(() => dismissCitationUI(), 2000);
}

// dialog submit-close sequence — remove panel FIRST, then call toast
// (Pitfall 1 from RESEARCH.md: getCitationHost() wipes shadow root)
function dismissDialog() {
  panel.remove();           // step 1: remove only the dialog panel
  styleEl.remove();         // step 1b: remove the dialog style element
  triggerElement.focus();   // step 2: restore focus (CAP-04)
}

// Then after dismiss:
if (result?.ok) {
  showSuccessToast('Report sent — thank you', selectionRect);
} else if (result?.queued) {
  showSuccessToast('Report saved — will retry when online', selectionRect);
} else if (result?.rateLimited) {
  showFailureToast('Too many reports in a short period — please wait a few minutes', selectionRect);
}
// result?.dropped → silent (Phase 3 D-07)
```

---

**PAY-08 ring buffer storage RMW pattern** — closest analog is `src/shared/report-transport.js` lines 63-70 (storageLock) and `src/background/service-worker.js` lines 391-406 (storage.get/set):

```javascript
// service-worker.js lines 391-406 — chrome.storage.local read-modify-write pattern
async function handleCacheHitResult(message) {
  const data = await chrome.storage.local.get('currentPatent');
  const patent = data.currentPatent;
  if (!patent) return;

  patent.status = STATUS.PARSED;
  patent.lineCount = message.lineCount;
  // ...
  await chrome.storage.local.set({ currentPatent: patent });
}

// For installErrorBuffer() appendToBuffer — same get/push/trim/set pattern:
async function appendToBuffer(level, args) {
  try {
    const stored = await chrome.storage.local.get('bugReportErrorBuffer');
    const buf = Array.isArray(stored['bugReportErrorBuffer'])
      ? stored['bugReportErrorBuffer'] : [];
    buf.push({ level, message: ..., ts: Date.now() });
    const trimmed = buf.length > 20 ? buf.slice(buf.length - 20) : buf;
    await chrome.storage.local.set({ bugReportErrorBuffer: trimmed });
  } catch { /* never throw from error handler */ }
}
```

---

**Sticky storage toggle pattern** — `chrome.storage.sync.get` in `content-script.js` lines 159-171 adapted to `.local`:

```javascript
// content-script.js lines 159-162 — sync.get with defaults on init
chrome.storage.sync.get(DEFAULT_SETTINGS, (settings) => {
  cachedSettings = settings;
});

// For reportDialogRemoveSelectionText — same shape with .local and async/await:
async function loadStickyToggle() {
  const stored = await chrome.storage.local.get('reportDialogRemoveSelectionText');
  return stored.reportDialogRemoveSelectionText === true;
}
async function saveStickyToggle(value) {
  await chrome.storage.local.set({ reportDialogRemoveSelectionText: value });
}
```

---

**sendMessage + result toast pattern** — `chrome.runtime.sendMessage` from `content-script.js` lines 480-486; Phase 3 result shape from `report-transport.js` contract:

```javascript
// content-script.js lines 480-487 — fire-and-forget sendMessage (no return)
chrome.runtime.sendMessage({
  type: MSG.LOOKUP_POSITION,
  selectedText: selectedText,
  patentId: patentId,
  ...
});

// For SUBMIT_REPORT — awaited sendMessage returning Phase 3 result:
const result = await chrome.runtime.sendMessage({ type: MSG.SUBMIT_REPORT, payload });
// result shape: { ok, queued, fingerprint, rateLimited, dropped }
```

---

### `src/content/citation-ui.js` (modified — add Report button to cite-row)

**Analog:** itself — lines 128-148 (`.cite-row` construction with copy button).

**cite-row construction pattern** (citation-ui.js lines 128-148):

```javascript
// citation-ui.js lines 128-148 — existing cite-row construction
const row = document.createElement('div');
row.className = 'cite-row';

const citeText = document.createElement('span');
citeText.className = 'cite-text';
citeText.textContent = citation;
row.appendChild(citeText);

const copyBtn = document.createElement('button');
copyBtn.className = 'cite-copy-btn';
copyBtn.title = 'Copy citation';
copyBtn.textContent = 'Copy';
row.appendChild(copyBtn);

// Confidence dot (always visible if not perfect)
if (confidence < 0.95) {
  const dot = document.createElement('span');
  dot.className = `cite-confidence cite-conf-${confidenceClass}`;
  dot.title = confidenceLabel;
  row.appendChild(dot);
}

popup.appendChild(row);
```

**Report button injection** — add after confidence dot, before `popup.appendChild(row)`:

```javascript
// Pattern: same DOM createElement + classList + event listener as copyBtn above
// Report button sits adjacent to copyBtn in .cite-row
if (reportOutcome && reportOutcome.confidenceTier !== 'green') {
  const reportBtn = document.createElement('button');
  reportBtn.className = 'cite-report-btn';
  reportBtn.title = 'Report a problem';
  reportBtn.setAttribute('aria-label', 'Report a problem with this citation');
  const showNudge = reportOutcome.confidenceTier !== 'green';
  reportBtn.textContent = showNudge ? '⚑ Report a problem' : '⚑';
  reportBtn.addEventListener('click', (e) => {
    e.stopPropagation();   // same pattern as copyBtn line 172
    showReportDialog(shadow, reportOutcome, rect);
  });
  row.appendChild(reportBtn);
}
// TRIG-04: if confidenceTier === 'green', button is simply not appended
```

**CSS to add for cite-report-btn** — modeled on `.cite-copy-btn` (citation-ui.js lines 447-461):

```javascript
// citation-ui.js lines 447-461 — .cite-copy-btn CSS (copy button — base for report button)
.cite-copy-btn {
  border: 1px solid #d1d5db;
  border-radius: 4px;
  background: #f9fafb;
  color: #374151;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 11px;
  padding: 2px 8px;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s;
}
.cite-copy-btn:hover {
  background: #f3f4f6;
}

// New .cite-report-btn (nudge variant — from UI-SPEC.md):
// background: rgba(245, 158, 11, 0.08); color: #92400e; font-size: 13px; font-weight: 500
// icon-only variant: color: #6b7280; background: transparent; font-size: 14px
```

**Signature extension** (citation-ui.js line 111) — add optional final param with default null:

```javascript
// citation-ui.js line 111 — current signature
export function showCitationPopup(citation, rect, confidence, displayMode, matchedText)

// Modified signature — new optional reportOutcome param; default null = no Report button
export function showCitationPopup(citation, rect, confidence, displayMode, matchedText, reportOutcome = null)

// citation-ui.js line 240 — current showErrorPopup signature
export function showErrorPopup(errorMessage, rect)

// Modified signature — new optional reportOutcome param
export function showErrorPopup(errorMessage, rect, reportOutcome = null)
```

---

### `src/content/content-script.js` (modified — trigger detection + outcome object)

**Analog:** itself — `generateCitation` (lines 433-487), `handleCitationResult` (lines 509-550).

**Pattern: read currentPatent from chrome.storage.local** (content-script.js lines 459-468):

```javascript
// content-script.js lines 459-468 — storage.local.get('currentPatent') + status branch
const data = await chrome.storage.local.get('currentPatent');
const patent = data.currentPatent;

if (!patent || patent.status !== 'parsed') {
  const statusMsg = patent?.status === 'fetching' || patent?.status === 'parsing'
    ? 'PDF is still being analyzed, please wait...'
    : patent?.status === 'error'
      ? 'PDF analysis failed'
      : 'PDF not available';
  citationInProgress = false;
  showErrorPopup(statusMsg, rect || currentSelectionRect);
  return;
}
```

**Pattern: showCitationPopup call sites to extend** (content-script.js lines 450-455 and 535-541):

```javascript
// content-script.js lines 450-455 — app patent success path (extend with reportOutcome)
if (result) {
  const prefixedCitation = applyPatentPrefix(result.citation, patentId, patentType);
  showCitationPopup(prefixedCitation, rect || currentSelectionRect, result.confidence,
    cachedSettings.displayMode);
  // → extended:
  // showCitationPopup(prefixedCitation, rect || currentSelectionRect, result.confidence,
  //   cachedSettings.displayMode, undefined,
  //   { category: mapOutcomeToReportCategory(null, result.confidence),
  //     confidenceTier: mapConfidenceTier(result.confidence) });
} else {
  showErrorPopup('Paragraph not found in application', rect || currentSelectionRect);
  // → extended:
  // showErrorPopup('Paragraph not found in application', rect || currentSelectionRect,
  //   { category: 'no_match', confidenceTier: 'red' });
}

// content-script.js lines 533-548 — CITATION_RESULT success + error paths
if (message.success) {
  const patentInfo = extractPatentInfo();
  const prefixedCitation = applyPatentPrefix(message.citation, patentInfo?.patentId,
    patentInfo?.patentType);
  showCitationPopup(prefixedCitation, rect, message.confidence, cachedSettings.displayMode);
  // → add reportOutcome param
} else {
  const errorMsg = message.error === 'no-match'
    ? 'Text not found in patent specification'
    : message.error === 'no-position-map'
      ? 'PDF has not been analyzed yet'
      : 'Citation lookup failed';
  showErrorPopup(errorMsg, rect);
  // → add reportOutcome param with category mapped from message.error
}
```

**New helper functions to add to content-script.js** (no existing analog — derived from RESEARCH Pattern 6):

```javascript
// Map numeric confidence to tier string
// Source: citation-ui.js line 124 (confidence class thresholds)
function mapConfidenceTier(confidence) {
  if (confidence >= 0.95) return 'green';   // high — TRIG-04: hide Report button
  if (confidence >= 0.80) return 'yellow';  // medium — TRIG-02
  return 'red';                              // low — TRIG-01
}

// Map error code / confidence to report category
function mapOutcomeToReportCategory(errorCode, confidence) {
  if (errorCode === 'no-match' || errorCode === 'paragraph-not-found') return 'no_match';
  if (errorCode === 'no-position-map' || errorCode === 'lookup-failed' ||
      errorCode === 'pdf-not-available') return 'tool_not_working';
  if (confidence !== null && confidence < 0.95) return 'inaccurate_citation';
  return null; // green success — no Report button
}
```

---

### PAY-09 Capture Helpers (in `src/content/report-dialog.js`)

**No analog found in codebase.** Implement as RESEARCH.md Pattern 3 describes. Key behavioral notes:

- `window.getSelection()` — already used in `content-script.js` lines 184-186; same API
- `window.scrollY`, `window.innerWidth`, `window.innerHeight` — page-context browser built-ins
- XPath walking — net-new; canonical DOM technique (RESEARCH Pattern 3)
- Capture at Report button click time, not Submit time (RESEARCH Pitfall 3)

```javascript
// content-script.js lines 184-186 — window.getSelection() usage pattern
const selection = window.getSelection();
const selectedText = selection?.toString().trim();

// For PAY-09 — capture at button click time:
const selectionText = window.getSelection()?.toString() ?? null;
const xpathNode = getXPathFromSelection(); // net-new function, RESEARCH Pattern 3
const scrollY = window.scrollY;
const viewportWidth = window.innerWidth;
const viewportHeight = window.innerHeight;
```

---

### `tests/unit/report-dialog.test.js` (new test file)

**Analog:** `tests/unit/report-transport-chrome.test.js` (lines 1-127 — chrome mock + stateful storage + vitest structure).

**Test file header pattern** (report-transport-chrome.test.js lines 1-30):

```javascript
// tests/unit/report-transport-chrome.test.js lines 1-30
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { submitReport, drainQueueOnce, ... } from '../../src/shared/report-transport.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
```

**Stateful chrome mock pattern** (report-transport-chrome.test.js lines 43-74) — copy `buildChromeMock`:

```javascript
// report-transport-chrome.test.js lines 43-74 — stateful chrome.storage.local mock
let _localStore = {};

function buildChromeMock(store) {
  return {
    runtime: {
      getURL: vi.fn((p) => `chrome-extension://test-id/${p}`),
      sendMessage: vi.fn(),
      onMessage: { addListener: vi.fn(), removeListener: vi.fn(), hasListener: vi.fn(() => false) },
      id: 'test-extension-id',
      getManifest: vi.fn(() => ({ version: '5.0.0' })),  // add getManifest for report-dialog
    },
    storage: {
      sync: { get: vi.fn(), set: vi.fn() },
      local: {
        get: vi.fn(async (keys) => {
          if (typeof keys === 'string') return { [keys]: store[keys] };
          if (Array.isArray(keys)) return Object.fromEntries(keys.map(k => [k, store[k]]));
          return Object.assign({}, store);
        }),
        set: vi.fn(async (obj) => { Object.assign(store, obj); }),
      },
      onChanged: { addListener: vi.fn() },
    },
  };
}

beforeEach(() => {
  _localStore = {};
  const chromeMock = buildChromeMock(_localStore);
  vi.stubGlobal('chrome', chromeMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});
```

**Static-grep test pattern** (report-transport-chrome.test.js lines 130-154) — copy for SC1/XPORT-06 check:

```javascript
// report-transport-chrome.test.js lines 133-154 — readdirSync + readFileSync static grep
it('no file in src/content/ contains fetch(WORKER_REPORT_URL', () => {
  const contentDir = path.resolve(__dirname, '../../src/content');
  const files = readdirSync(contentDir).filter(f => f.endsWith('.js'));
  expect(files.length).toBeGreaterThan(0);

  for (const file of files) {
    const src = readFileSync(path.join(contentDir, file), 'utf8');
    expect(src).not.toMatch(/fetch\s*\(\s*WORKER_REPORT_URL/);
  }
});
```

**Fixture factory pattern** (report-payload-builder.test.js lines 64-88) — copy `makeReportInputs` style for dialog test fixtures:

```javascript
// report-payload-builder.test.js lines 64-88 — fresh-fixture factory
function makeReportInputs(overrides = {}) {
  return {
    context: {
      patentNumber: '12505414',
      selectionText: 'The method of claim 1',
      returnedCitation: '4:5-20',
      confidenceTier: 'green',
      extensionVersion: '5.0.0',
      browser: 'Chrome/125',
      os: 'Windows 10',
      xpathNode: '/html/body/div[3]/p[2]',
      scrollY: 340,
      viewportWidth: 1280,
      viewportHeight: 800,
      pdfParseStatus: 'success',
    },
    category: 'no_match',
    note: null,
    settings: { triggerMode: 'floating' },
    errors: [],
    includeSelectionText: true,
    ...overrides,
  };
}
```

**Note on DOM testing:** The existing test suite uses `environment: 'node'` (vitest.config.js line 4) — no jsdom. Tests for Shadow DOM component behavior (report-dialog.js DOM construction) should use static-grep / module-import patterns rather than a live DOM. If jsdom is needed, add `@vitest-environment jsdom` docblock comment at top of the test file — see vitest docs. The Phase 3 tests (report-transport-chrome.test.js) demonstrate the preferred pattern: test behavior through the module's exported functions rather than DOM inspection.

---

### `tests/unit/report-dialog-buffer.test.js` (new test file for PAY-08 ring buffer)

**Analog:** `tests/unit/report-transport-chrome.test.js` (stateful storage mock + RMW assertions).

Key patterns to replicate:
1. `buildChromeMock(_localStore)` — same stateful mock (lines 47-74)
2. `beforeEach` / `afterEach` with `vi.stubGlobal` / `vi.unstubAllGlobals()` (lines 105-127)
3. Direct `_localStore.bugReportErrorBuffer` inspection after buffer writes (mirror lines 211-213)
4. `vi.useFakeTimers()` not needed here — no backoff timers in ring buffer

---

## Shared Patterns

### Shadow DOM Style Injection
**Source:** `src/content/citation-ui.js` lines 64-66, 113-116, 241-244, 313-316
**Apply to:** `report-dialog.js` — inject style element before panel element
```javascript
const style = document.createElement('style');
style.textContent = getReportDialogCSS();
shadow.appendChild(style);
// Then append the panel element after
```

### Event Propagation Guard
**Source:** `src/content/citation-ui.js` lines 94-98 and 171-172; `src/content/content-script.js` line 182
**Apply to:** All button click handlers in `report-dialog.js` (copy from copyBtn pattern)
```javascript
btn.addEventListener('click', (e) => {
  e.stopPropagation();
  // handler body
});
```

### chrome.storage.local Read-Modify-Write
**Source:** `src/background/service-worker.js` lines 393-405 + `src/shared/report-transport.js` lines 65-70 (storageLock pattern)
**Apply to:** `installErrorBuffer()` appendToBuffer, `loadStickyToggle`, `saveStickyToggle`
```javascript
// Basic async get/set pattern (service-worker.js:393-405)
const data = await chrome.storage.local.get('keyName');
const value = data.keyName;
// ... modify ...
await chrome.storage.local.set({ keyName: value });
```

### chrome.runtime.getManifest() for Extension Version
**Source:** `src/content/options.js:13` (per RESEARCH.md VERIFIED note — not read in this session)
**Apply to:** `report-dialog.js` submit handler
```javascript
const extensionVersion = chrome.runtime.getManifest().version;
```

### Module Import Structure for Shared Constants
**Source:** `src/content/content-script.js` lines 9-15
**Apply to:** `report-dialog.js` — import MSG and REPORT_CATEGORIES only; no direct import of getCitationHost
```javascript
import { MSG, REPORT_CATEGORIES } from '../shared/constants.js';
import { buildReportPayload } from '../shared/report-payload-builder.js';
```

### Vitest Test Structure (chrome stub + stateful storage)
**Source:** `tests/unit/report-transport-chrome.test.js` lines 1-127
**Apply to:** All new Phase 4 test files
- Use `buildChromeMock(_localStore)` pattern
- Add `runtime.getManifest: vi.fn(() => ({ version: '5.0.0' }))` to the mock (not in existing mock — report-dialog.js needs this)
- Include `tests/setup/chrome-stub.js` via vitest.config.js `setupFiles` (already global)

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| PAY-09 XPath / scroll / viewport helpers (in `report-dialog.js`) | utility | transform | No DOM-walking or XPath utilities exist anywhere in `src/content/` or `src/shared/`. `window.getSelection()` is used in `content-script.js:184` but no XPath derivation. Use RESEARCH.md Pattern 3 (canonical `getNodeXPath` technique). |
| `installErrorBuffer()` console intercept (in `report-dialog.js`) | utility | event-driven | No `console.error`/`console.warn` intercept pattern exists in any content script. The closest analog is the `withStorageLock` + storage RMW in `report-transport.js:65-70` for the ring buffer write side. Use RESEARCH.md Pattern 5. |

---

## esbuild Bundling Note

`src/content/report-dialog.js` is imported from `citation-ui.js` or `content-script.js` — both are already bundled as the IIFE entry point (`scripts/build.js` line 34: `entryPoints: ['src/content/content-script.js']`). No new esbuild entry point is needed. Imports from `../shared/constants.js` and `../shared/report-payload-builder.js` within `report-dialog.js` resolve correctly via esbuild's tree-shaking. `chrome.*` globals are injected by the extension runtime; no import needed.

---

## Metadata

**Analog search scope:** `src/content/`, `src/shared/`, `src/background/`, `tests/unit/`, `tests/setup/`
**Files read:** `citation-ui.js` (567 lines, complete), `content-script.js` (lines 1-60, 155-200, 420-550), `report-transport.js` (lines 1-80), `service-worker.js` (lines 385-430), `report-payload-builder.js` (complete), `report-transport-chrome.test.js` (complete), `report-transport-firefox.test.js` (lines 1-70), `report-payload-builder.test.js` (lines 1-100), `constants.js` (complete), `vitest.config.js`, `vitest.config.chrome.js`, `chrome-stub.js`
**Pattern extraction date:** 2026-06-13

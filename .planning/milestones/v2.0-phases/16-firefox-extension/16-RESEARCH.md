# Phase 16: Firefox Extension - Research

**Researched:** 2026-03-04
**Domain:** Firefox MV3 browser extension, background script architecture, IndexedDB degradation, esbuild multi-target pipeline
**Confidence:** HIGH (core APIs), MEDIUM (background script lifecycle edge case)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Background script architecture:**
- Modular imports — thin `src/firefox/background.js` orchestrator that imports from shared modules and a new `src/firefox/pdf-pipeline.js`
- `pdf-pipeline.js` absorbs offscreen.js logic (PDF fetch, parse, IndexedDB, cache, matching) but uses direct function calls instead of Chrome's message-passing pattern
- Firefox background script calls pipeline functions directly (e.g. `await fetchAndParsePdf(patentId)`) — no self-messaging
- Service worker orchestration logic (icon state, storage, message routing from content scripts) lives in `background.js`
- Source files live in `src/firefox/` directory — parallel to `src/background/` (Chrome)

**PDF.js loading:**
- Same ES import pattern as Chrome's offscreen document — Firefox MV3 background scripts support `type: "module"`
- `import { extractTextFromPdf } from` the offscreen pdf-parser.js (shared parsing logic)

**IndexedDB degradation (FOX-05):**
- Claude's discretion on implementation approach (try/catch per call vs detect-once-at-startup)
- Silent degradation — no user-facing indication when IndexedDB is unavailable
- Server cache still works without IndexedDB — check server cache, use position map in-memory if hit, skip local IndexedDB write
- Claude's discretion on in-memory data passing approach (background variable map vs function return values)
- Core guarantee: citations work without cache, just slower on repeat visits

**Icon activation (FOX-03):**
- `tabs` permission added to Firefox manifest only — Chrome manifest unchanged
- Disable action by default, enable on `tabs.onUpdated` URL match (`patents.google.com/patent/US*`)
- Same context menu creation pattern as Chrome (`chrome.contextMenus.create` in `onInstalled`)
- Skip `declarativeContent` entirely — Firefox doesn't support it

**Cloudflare Worker CORS:**
- No Worker changes needed — Worker already uses `Access-Control-Allow-Origin: *` (wildcard)
- `moz-extension://` origins are already covered by the wildcard
- Bearer token provides the real authentication

### Claude's Discretion
- IndexedDB degradation implementation approach (try/catch vs detect-once)
- In-memory data passing strategy when IndexedDB is unavailable
- How pdf-parser.js and position-map-builder.js are shared between Chrome offscreen and Firefox background (import paths, build config)
- esbuild configuration for Firefox bundles (entry points, output paths, external modules)
- Firefox-specific edge cases discovered during implementation

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FOX-01 | Firefox MV3 manifest with `browser_specific_settings.gecko.id` and correct permissions | Manifest already exists at `src/manifest.firefox.json` — verified complete with gecko ID, correct permissions array. Needs `tabs` permission added and `wasm-unsafe-eval` CSP added. |
| FOX-02 | Firefox background script absorbs offscreen document logic (PDF fetch, parse, IndexedDB, matching) | Architecture pattern documented: `src/firefox/pdf-pipeline.js` absorbs `offscreen.js` logic using direct function calls; `src/firefox/background.js` orchestrates. All shared modules confirmed browser-agnostic. |
| FOX-03 | Icon activation via `tabs.onUpdated` URL matching replaces Chrome's `declarativeContent` | `tabs.onUpdated` with URL filter pattern verified; `tabs` permission required for URL access in `changeInfo`. `action.disable()` + `action.enable(tabId)` pattern confirmed working in Firefox MV3. |
| FOX-04 | esbuild produces `dist/firefox/` alongside `dist/chrome/` | `buildFirefox()` function exists in `scripts/build.js` — currently copies manifest only. Needs esbuild calls added with Firefox-specific entry points and `outbase: 'src'`, `outdir: 'dist/firefox'`. |
| FOX-05 | IndexedDB graceful degradation for Firefox private browsing / "Never remember history" | IndexedDB throws `InvalidStateError` (catchable via promise rejection) in "Never remember history" mode. Detect-once-at-startup pattern recommended. In-memory position map cache as fallback. |
</phase_requirements>

---

## Summary

This phase ports the Chrome MV3 extension to Firefox by replacing Chrome's offscreen document architecture with a Firefox-native background script that calls PDF pipeline functions directly. Firefox MV3 uses "event pages" (non-persistent background scripts declared with `background.scripts`) instead of Chrome's service workers, which gives direct access to DOM APIs and eliminates the need for the offscreen document indirection entirely.

The core work is: (1) creating two new source files in `src/firefox/` — a thin orchestrator `background.js` and a `pdf-pipeline.js` that absorbs all of `offscreen.js`'s logic; (2) updating `buildFirefox()` in `scripts/build.js` to add esbuild calls for these entry points; and (3) handling Firefox-specific behavioral differences: no `declarativeContent` API (use `tabs.onUpdated` instead), potential IndexedDB failure in "Never remember history" mode, and a required `wasm-unsafe-eval` CSP directive for PDF.js WebAssembly.

The manifest at `src/manifest.firefox.json` is already complete from Phase 15, but needs two additions: `"tabs"` permission for `tabs.onUpdated` URL access, and the `content_security_policy` key with `wasm-unsafe-eval` for PDF.js. The content script bundle (`content/content.js`) is identical to Chrome — no separate Firefox content bundle needed.

**Primary recommendation:** Implement `pdf-pipeline.js` as a functional pipeline with detect-once IndexedDB availability check at module load time, storing position maps in a `Map<patentId, positionMap>` as in-memory fallback when IndexedDB is unavailable.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| esbuild | ^0.27.3 (already installed) | Bundle `src/firefox/` entry points to `dist/firefox/` | Already the project bundler; same `outbase`/`outdir` pattern as Chrome build |
| PDF.js | pdfjs-dist ^5.5.207 (already installed) | PDF text extraction in Firefox background script | Already works in Chrome offscreen; Firefox background supports ES modules with `type: "module"` |
| chrome.* APIs | Built-in to Firefox 128+ | Extension APIs — Firefox natively supports `chrome.*` namespace | Confirmed in REQUIREMENTS.md: webextension-polyfill excluded because Firefox supports `chrome.*` natively |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| IndexedDB (Web API) | Built-in | Cache PDF blobs and position maps locally | When available (normal profile). Falls back to in-memory Map on failure. |
| `chrome.storage.local` | Built-in | Patent state persistence across background restarts | Already used by Chrome build; works identically in Firefox |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Detect-once IndexedDB check | Try/catch per call | Detect-once is simpler, avoids per-operation overhead, same result for "Never remember history" mode which is a session-wide setting |
| In-memory Map fallback | `chrome.storage.local` fallback | `storage.local` persists across background restarts but adds async complexity; in-memory Map is sufficient since position maps are rebuilt on each patent page load anyway |

**Installation:** No new packages needed — all dependencies already installed.

---

## Architecture Patterns

### Recommended Project Structure
```
src/
├── firefox/
│   ├── background.js        # Thin orchestrator (icon, storage, message routing)
│   └── pdf-pipeline.js      # PDF fetch, parse, IndexedDB, cache, matching
├── background/
│   └── service-worker.js    # Chrome orchestrator (unchanged)
├── offscreen/
│   ├── offscreen.js         # Chrome PDF worker (unchanged, imported by pdf-pipeline.js)
│   ├── pdf-parser.js        # Shared — imported by both offscreen.js and pdf-pipeline.js
│   └── position-map-builder.js  # Shared — imported by both
└── shared/
    ├── constants.js          # MSG, STATUS, PATENT_TYPE
    └── matching.js           # matchAndCite, normalizeText
```

```
dist/firefox/
├── manifest.json             # Copied from src/manifest.firefox.json
├── background/
│   └── service-worker.js     # esbuild output of src/firefox/background.js
├── content/
│   └── content.js            # IIFE bundle (same as Chrome — shared entry point)
├── popup/
│   ├── popup.html
│   └── popup.js
├── options/
│   ├── options.html
│   └── options.js
├── icons/                    # Same icons as Chrome
└── lib/
    ├── pdf.mjs               # PDF.js (same as Chrome)
    └── pdf.worker.mjs        # PDF.js worker (same as Chrome)
```

Note: No `offscreen/` directory in Firefox dist — the offscreen document is Chrome-only. The Firefox manifest already references `background/service-worker.js` as the output path, so `src/firefox/background.js` must be bundled to that path.

### Pattern 1: Firefox Background Script (Event Page) Manifest Declaration

**What:** Firefox MV3 uses `background.scripts` (array) instead of `background.service_worker` (string). The `type: "module"` key works for both.

**When to use:** This is the only way to declare a background script in Firefox MV3 — not optional.

```json
// Source: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background
"background": {
  "scripts": ["background/service-worker.js"],
  "type": "module"
}
```

The existing `src/manifest.firefox.json` already uses this pattern correctly.

### Pattern 2: Icon Activation via tabs.onUpdated (replaces declarativeContent)

**What:** Firefox does not support `chrome.declarativeContent`. Use `chrome.action.disable()` on install to disable the icon globally, then use `chrome.tabs.onUpdated` with a URL filter to enable per-tab.

**When to use:** On install (disable globally) and whenever a tab's URL changes (enable/disable based on URL match).

```javascript
// Source: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs/onUpdated
chrome.runtime.onInstalled.addListener(() => {
  chrome.action.disable();

  chrome.contextMenus.create({
    id: 'get-patent-citation',
    title: 'Get Citation',
    contexts: ['selection'],
    documentUrlPatterns: ['https://patents.google.com/patent/US*'],
  });
});

// Enable icon only on Google Patents grant pages; disable everywhere else
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!changeInfo.url) return;  // Only process URL changes

  if (changeInfo.url.startsWith('https://patents.google.com/patent/US')) {
    chrome.action.enable(tabId);
  } else {
    chrome.action.disable(tabId);
  }
});
```

**Critical:** The `tabs` permission MUST be in the Firefox manifest for `changeInfo.url` to be populated. Without `tabs` permission, `changeInfo.url` is undefined even when the URL changes.

### Pattern 3: Direct Pipeline Calls (replaces Chrome message-passing)

**What:** In Chrome, the service worker sends messages to the offscreen document and listens for responses. In Firefox, the background script calls pipeline functions directly.

**When to use:** Every place the Chrome service worker does `chrome.runtime.sendMessage({ type: MSG.FETCH_PDF, ... })` to the offscreen document.

```javascript
// Chrome pattern (service-worker.js):
chrome.runtime.sendMessage({ type: MSG.FETCH_PDF, pdfUrl, patentId });

// Firefox pattern (background.js + pdf-pipeline.js):
// In background.js:
import { fetchAndParsePdf, lookupPosition } from './pdf-pipeline.js';

async function handlePdfLinkFound(message, tabId) {
  // ... update storage ...
  const result = await fetchAndParsePdf(message.patentId, message.pdfUrl);
  if (result.success) {
    // update icon, storage — same logic as Chrome's handleParseResult
  }
}
```

### Pattern 4: Detect-Once IndexedDB Availability

**What:** Check IndexedDB availability once at module load time. Store the result in a module-level boolean. All operations check this flag before attempting IndexedDB access.

**When to use:** IndexedDB fails in Firefox "Never remember history" mode with an `InvalidStateError` (caught via promise rejection). Detecting once avoids try/catch overhead on every operation.

```javascript
// Source: https://bugzilla.mozilla.org/show_bug.cgi?id=781982
// At top of pdf-pipeline.js:
let idbAvailable = true;  // optimistic default

async function detectIndexedDB() {
  try {
    const db = await openDb();
    db.close();
  } catch (err) {
    console.warn('[FF] IndexedDB unavailable:', err.message);
    idbAvailable = false;
  }
}

// Call once at module initialization:
await detectIndexedDB();

// In-memory fallback for position maps when IndexedDB is unavailable:
const positionMapCache = new Map();  // patentId -> positionMap array
```

### Pattern 5: esbuild Firefox Build Configuration

**What:** Add Firefox-specific esbuild calls in `buildFirefox()`. The content script is shared with Chrome (same IIFE bundle). The background and popup/options need separate Firefox ESM builds.

**When to use:** When wiring new Firefox entry points into the build pipeline.

```javascript
// In scripts/build.js — updated buildFirefox() function

function getFirefoxIifeConfig() {
  return {
    entryPoints: ['src/content/content-script.js'],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    outfile: 'dist/firefox/content/content.js',
  };
}

function getFirefoxEsmConfig() {
  return {
    entryPoints: [
      'src/firefox/background.js',
      'src/popup/popup.js',
      'src/options/options.js',
    ],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    outbase: 'src',
    outdir: 'dist/firefox',
    // pdf-pipeline.js imports from src/offscreen/pdf-parser.js via relative import.
    // pdf-parser.js imports from src/lib/pdf.mjs — mark external same as Chrome:
    external: ['../lib/pdf.mjs'],
  };
}
```

**Key insight on outbase:** With `outbase: 'src'` and `outdir: 'dist/firefox'`, the entry point `src/firefox/background.js` outputs to `dist/firefox/firefox/background.js`. This mismatches the manifest path `background/service-worker.js`. Two solutions:
1. Use the esbuild object entry point syntax to specify custom output names: `entryPoints: [{ in: 'src/firefox/background.js', out: 'background/service-worker' }]`
2. Or omit `outbase` and specify each output path explicitly with the object syntax.

**Recommended:** Use object entry point syntax for the background script so the output path matches what the Firefox manifest expects (`background/service-worker.js`).

### Pattern 6: Firefox Manifest Updates Required

The existing `src/manifest.firefox.json` needs two additions:

```json
// Add to "permissions" array:
"tabs"

// Add new top-level key:
"content_security_policy": {
  "extension_pages": "script-src 'self' 'wasm-unsafe-eval'"
}
```

The `wasm-unsafe-eval` CSP is required because PDF.js uses WebAssembly internally. Without it, PDF.js will fail to load the WASM module in the Firefox background script context.

### Anti-Patterns to Avoid

- **Self-messaging in Firefox background:** Don't call `chrome.runtime.sendMessage` to communicate within the background script itself. Chrome uses this pattern (background → offscreen → background) but Firefox has no offscreen document — just call functions directly.
- **Assuming declarativeContent works:** Firefox MV3 does not support the `declarativeContent` permission or API. Always use `tabs.onUpdated` in the Firefox background script.
- **Missing `tabs` permission:** Without `"tabs"` in the Firefox manifest permissions, `changeInfo.url` will be `undefined` in the `tabs.onUpdated` callback, making URL-based icon activation impossible.
- **Missing `wasm-unsafe-eval` CSP:** PDF.js requires WebAssembly. Without `wasm-unsafe-eval` in `content_security_policy.extension_pages`, PDF parsing will silently fail or throw a CSP error.
- **Using `service_worker` key in Firefox manifest:** Firefox 128+ requires `background.scripts` (array). The `service_worker` key is Chrome-only and is ignored by Firefox prior to 121, causing the background to not start.
- **Assuming IndexedDB is always available:** In "Never remember history" mode, IndexedDB `open()` succeeds but write operations throw `InvalidStateError`. Always detect availability before using.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PDF text extraction | Custom PDF parser | `extractTextFromPdf` from `src/offscreen/pdf-parser.js` | Already works, battle-tested against 71-case corpus |
| Position map construction | Custom column-line builder | `buildPositionMap` from `src/offscreen/position-map-builder.js` | Complex two-column detection algorithm, already correct |
| Text matching | Custom search | `matchAndCite` from `src/shared/matching.js` | Context-aware matching with confidence scoring, shared |
| Cloudflare cache check | Custom HTTP cache | Existing `checkCache`/`uploadToCache` pattern from `offscreen.js` | Just copy the functions — same endpoint, same auth token |
| Icon management | Complex state machine | `chrome.action.enable(tabId)` / `chrome.action.disable(tabId)` | Tab-scoped enable/disable is sufficient; no custom state needed |

**Key insight:** `pdf-pipeline.js` is mostly a copy of `offscreen.js` with Chrome message-passing removed. The business logic is identical — only the communication layer changes.

---

## Common Pitfalls

### Pitfall 1: Background Script Termination During PDF Parse (MEDIUM confidence)

**What goes wrong:** Firefox MV3 event pages terminate after ~30 seconds of inactivity. A long PDF parse (3MB patent PDF through PDF.js WebAssembly) might trigger this timeout if the event page considers the ongoing async operation as "idle."

**Why it happens:** Firefox uses an idle timer reset mechanism tied to WebExtension API calls. A plain `fetch()` + `PDF.js parse` chain does not necessarily reset the idle timer. Bug 1851373 notes that the idle timer fix (Firefox post-117) restores timer resets for `onMessage` events, but fetch-only operations may still be vulnerable.

**How to avoid:** The background script receives a `MSG.PDF_LINK_FOUND` message from the content script — this resets the idle timer at the start. For the PDF fetch + parse duration (typically 2-5 seconds for a patent PDF), the risk is low. If parse takes >30 seconds (rare for text-layer PDFs), the event page could terminate. During implementation, test with a large patent PDF and verify the full flow completes. If needed, add a periodic `chrome.storage.session` write or `chrome.runtime.getPlatformInfo()` call as a keepalive during parse.

**Warning signs:** Citation result never arrives after "FETCHING" status; browser console shows the background script was terminated.

**Confidence:** MEDIUM — Firefox event pages do terminate at 30s of inactivity, but an active ongoing fetch likely resets the timer. Empirical test required during implementation.

### Pitfall 2: IndexedDB `open()` Succeeds But Writes Fail

**What goes wrong:** In "Never remember history" mode, `indexedDB.open('patent-cite-tool', 1)` resolves successfully. Only when a write transaction is attempted does it throw `InvalidStateError: A mutation operation was attempted on a database that did not allow mutations.`

**Why it happens:** Firefox deliberately obscures private browsing detection — the `open()` call succeeds to not reveal private mode, but mutations are rejected.

**How to avoid:** The detect-once approach must include a write probe, not just `open()`. After opening, attempt a benign write (or catch the error on the first real write) to determine availability. A cleaner approach: wrap the entire `openDb()` + write sequence in a try/catch; on `InvalidStateError`, set `idbAvailable = false` and return null.

**Warning signs:** Extension appears to work (no user error) but never shows cache hit behavior; IndexedDB records are never created.

### Pitfall 3: esbuild Output Path Mismatch with Firefox Manifest

**What goes wrong:** The Firefox manifest declares `"scripts": ["background/service-worker.js"]`. If esbuild outputs `src/firefox/background.js` to `dist/firefox/firefox/background.js` (with `outbase: 'src'`), the manifest reference is broken and the background script never loads.

**Why it happens:** esbuild's `outbase` strips the common prefix from entry point paths. `src/firefox/background.js` with `outbase: 'src'` produces `firefox/background.js`, not `background/service-worker.js`.

**How to avoid:** Use esbuild's object entry point syntax to explicitly control the output name:
```javascript
entryPoints: [{ in: 'src/firefox/background.js', out: 'background/service-worker' }]
```
This produces `dist/firefox/background/service-worker.js`, matching the manifest.

**Warning signs:** Firefox "Load Temporary Add-on" succeeds but the background script never starts; no background script logs in browser console.

### Pitfall 4: PDF.js `GlobalWorkerOptions.workerSrc` Chrome Extension URL

**What goes wrong:** `src/offscreen/pdf-parser.js` sets `GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdf.worker.mjs')`. This call works identically in Firefox since `chrome.runtime.getURL` is supported. However, the `lib/pdf.worker.mjs` file must be copied to `dist/firefox/lib/` — if the Firefox static asset copy step is missing, PDF.js silently falls back to main-thread parsing.

**Why it happens:** The `buildFirefox()` function currently only copies the manifest. It needs to copy icons and lib files the same way Chrome's `copyStaticAssets()` does.

**How to avoid:** Add a `copyFirefoxStaticAssets()` function that mirrors `copyStaticAssets()` for the Firefox dist target: copy icons, lib (pdf.mjs, pdf.worker.mjs), popup HTML, options HTML.

**Warning signs:** PDF parsing still "works" but is slower (main-thread fallback); browser console may show worker load failure.

### Pitfall 5: Missing `tabs` Permission Causes Silent URL Access Failure

**What goes wrong:** Without `"tabs"` in the Firefox manifest permissions, `tabs.onUpdated` fires but `changeInfo.url` is always `undefined`. The icon activation code never triggers, leaving the icon gray on patent pages.

**Why it happens:** Firefox requires explicit `tabs` permission to expose the `url` property in tab-related events. The `activeTab` permission alone does not grant access to URL via `tabs.onUpdated` (only for the active tab after user interaction, not for background URL monitoring).

**How to avoid:** Add `"tabs"` to the Firefox manifest `permissions` array. This is already decided in CONTEXT.md.

**Warning signs:** Icon stays gray on patent pages; adding `console.log(changeInfo)` shows an empty object `{}` or missing `url` key.

---

## Code Examples

### Firefox Background Script Skeleton

```javascript
// src/firefox/background.js
// Source: MDN WebExtensions docs + project CONTEXT.md

import { MSG, STATUS, PATENT_TYPE } from '../shared/constants.js';
import {
  checkCache,
  fetchAndParsePdf,
  lookupPosition,
  uploadToCache,
} from './pdf-pipeline.js';

const ICON_PATHS = {
  partial: { 16: '/icons/icon-partial-16.png', /* ... */ },
  active: { 16: '/icons/icon-active-16.png', /* ... */ },
};

function setTabIcon(tabId, state) {
  if (!tabId) return;
  chrome.action.setIcon({ path: ICON_PATHS[state], tabId });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.action.disable();
  chrome.contextMenus.create({
    id: 'get-patent-citation',
    title: 'Get Citation',
    contexts: ['selection'],
    documentUrlPatterns: ['https://patents.google.com/patent/US*'],
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (!changeInfo.url) return;
  if (changeInfo.url.startsWith('https://patents.google.com/patent/US')) {
    chrome.action.enable(tabId);
  } else {
    chrome.action.disable(tabId);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id;
  if (message.type === MSG.PDF_LINK_FOUND) {
    handlePdfLinkFound(message, tabId);
  } else if (message.type === MSG.LOOKUP_POSITION) {
    handleLookupPosition(message, sender);
  } else if (message.type === MSG.GET_STATUS) {
    handleGetStatus(sendResponse);
    return true;
  }
  // ... other handlers
});
```

### PDF Pipeline Function Signatures (pdf-pipeline.js)

```javascript
// src/firefox/pdf-pipeline.js
// Absorbs all of offscreen.js logic; called directly by background.js

import { extractTextFromPdf } from '../offscreen/pdf-parser.js';
import { buildPositionMap } from '../offscreen/position-map-builder.js';
import { matchAndCite } from '../shared/matching.js';

// Module-level state
let idbAvailable = true;
const positionMapCache = new Map(); // patentId -> positionMap (fallback when idb unavailable)

// Exported functions called directly by background.js:
export async function checkServerCache(patentId) { /* ... */ }
export async function fetchAndParsePdf(patentId, pdfUrl) { /* ... returns { success, lineCount, columnCount } */ }
export async function fetchUsptoAndParse(patentId) { /* ... */ }
export async function lookupPosition(selectedText, patentId, contextBefore, contextAfter) { /* ... returns match result */ }
export async function uploadToCache(patentId) { /* ... fire-and-forget */ }
```

### Firefox Manifest CSP Addition

```json
// In src/manifest.firefox.json — add these two changes:

// 1. Add to permissions array:
"tabs"

// 2. Add as new top-level key:
"content_security_policy": {
  "extension_pages": "script-src 'self' 'wasm-unsafe-eval'"
}
```

### esbuild Firefox Entry Points with Explicit Output Names

```javascript
// In scripts/build.js — getFirefoxEsmConfig()
// Source: https://esbuild.github.io/api/#entry-points (object syntax)

function getFirefoxEsmConfig() {
  return {
    entryPoints: [
      { in: 'src/firefox/background.js', out: 'background/service-worker' },
      { in: 'src/popup/popup.js', out: 'popup/popup' },
      { in: 'src/options/options.js', out: 'options/options' },
    ],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    outdir: 'dist/firefox',
    external: ['../lib/pdf.mjs'],
  };
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Firefox MV2 persistent background page | Firefox MV3 non-persistent event page (background.scripts) | Firefox 109 (Jan 2023) | Scripts terminate after inactivity; must register listeners at top level |
| `declarativeContent` for icon control | `tabs.onUpdated` with URL filter | Firefox never supported declarativeContent | Firefox-specific pattern required |
| Chrome `offscreen` document for PDF work | Direct function calls in Firefox background | N/A — Firefox-specific | Simpler architecture; no message-passing boilerplate |
| Firefox required MV2 | Firefox 128+ fully supports MV3 | July 2024 (Firefox 128) | Stable MV3 support; project targets `strict_min_version: "128.0"` |

**Deprecated/outdated:**
- `background.service_worker` key: Chrome-only. Firefox ignores it (before 121 it prevented background from loading). Always use `background.scripts` for Firefox.
- `background.page` key: Firefox MV2 pattern. Not needed in MV3.
- `browser_action` key: Deprecated in MV3. Already using `action` key in existing manifest.

---

## Open Questions

1. **Event page termination during PDF.js parse**
   - What we know: Firefox terminates event pages after ~30 seconds of inactivity; messaging API calls reset the idle timer; active fetch operations may not reset the timer
   - What's unclear: Whether a 2-10 second PDF.js parse chain (fetch + WASM + parse) keeps the event page alive without explicit keepalive
   - Recommendation: Implement without keepalive first; if testing shows termination mid-parse, add a `chrome.storage.session.set({ keepalive: Date.now() })` call during the fetch operation

2. **`pdf-parser.js` import path from `src/firefox/pdf-pipeline.js`**
   - What we know: `pdf-pipeline.js` imports `extractTextFromPdf` from `../offscreen/pdf-parser.js`; `pdf-parser.js` sets `GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdf.worker.mjs')` which works in Firefox
   - What's unclear: Whether esbuild resolves the `../offscreen/pdf-parser.js` relative import correctly when bundling `src/firefox/pdf-pipeline.js`
   - Recommendation: Confirm by running the Firefox build after adding entry points; esbuild follows relative imports normally so this should work

3. **IndexedDB open() vs write probe for availability detection**
   - What we know: `open()` succeeds even in "Never remember history" mode; write throws `InvalidStateError`
   - What's unclear: Whether a lightweight write probe at startup is better than catching the error on first real write
   - Recommendation: Catch `InvalidStateError` on the first real write operation (storing PDF blob); set `idbAvailable = false` and use in-memory Map from that point. Avoids extra startup latency.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^3.0.0 |
| Config file | `vitest.config.js` |
| Quick run command | `npm test` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FOX-01 | Firefox manifest has gecko ID and correct permissions | manual-only | Load in Firefox via "Load Temporary Add-on" | N/A |
| FOX-02 | Firefox background script produces citations on Google Patents | manual-only | Load extension in Firefox, highlight text on patent page | N/A |
| FOX-03 | Icon is active on patent pages, gray on all others | manual-only | Navigate to patent page and non-patent page in Firefox | N/A |
| FOX-04 | `npm run build` produces both `dist/chrome/` and `dist/firefox/` | integration | `npm run build && ls dist/chrome dist/firefox` | N/A — new build logic |
| FOX-05 | IndexedDB degradation: citations work in "Never remember history" mode | manual-only | Set Firefox to "Never remember history", load extension, test citation | N/A |

**Note on manual-only tests:** FOX-01 through FOX-03 and FOX-05 require a running Firefox browser with the extension loaded. These cannot be automated with Vitest (which runs in Node). The existing 71-case Vitest corpus tests the matching algorithm and does not need to change for this phase — the algorithm is shared and browser-agnostic.

### Sampling Rate
- **Per task commit:** `npm test` (136 tests — shared matching logic; ensures pdf-pipeline.js changes don't break the algorithm)
- **Per wave merge:** `npm test` + manual Firefox load test
- **Phase gate:** Full suite green + manual UAT: extension loads in Firefox, citation produced on real patent page

### Wave 0 Gaps
None — existing test infrastructure covers the algorithmic requirements. New functional tests for Firefox-specific behavior (icon activation, IndexedDB degradation) are manual-only and cannot be automated with the current Vitest setup.

---

## Sources

### Primary (HIGH confidence)
- [MDN: background manifest key](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background) — Firefox background.scripts vs service_worker, type:module support
- [MDN: tabs.onUpdated](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs/onUpdated) — URL filter syntax, permissions required
- [MDN: content_security_policy](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/content_security_policy) — wasm-unsafe-eval requirement and format for MV3
- [Firefox Extension Workshop: MV3 Migration Guide](https://extensionworkshop.com/documentation/develop/manifest-v3-migration-guide/) — Firefox vs Chrome MV3 differences
- [esbuild API docs](https://esbuild.github.io/api/) — entry points object syntax, outbase/outdir behavior
- `src/manifest.firefox.json` — existing manifest structure (direct code read)
- `src/background/service-worker.js` — existing Chrome orchestrator (direct code read, reference for Firefox port)
- `src/offscreen/offscreen.js` — existing Chrome PDF pipeline (direct code read, source for pdf-pipeline.js)

### Secondary (MEDIUM confidence)
- [Bugzilla 1851373](https://bugzilla.mozilla.org/show_bug.cgi?id=1851373) — Firefox 30-second background script termination, idle timer reset behavior
- [Dexie.js issue #883](https://github.com/dfahlander/Dexie.js/issues/883) — IndexedDB "Never remember history" behavior (InvalidStateError on writes)
- [Mozilla Discourse: MV3 background idle](https://discourse.mozilla.org/t/how-to-stop-a-background-script-from-going-idle-in-mv3/128327) — community-verified keepalive patterns
- [Bugzilla 781982](https://bugzilla.mozilla.org/show_bug.cgi?id=781982) — IndexedDB private browsing history

### Tertiary (LOW confidence)
- [Community blog: porting MV3 Chrome to Firefox](https://decembergarnetsmith.com/blog/2024/05/10/how-to-port-an-mv3-chrome-extension-to-firefox/) — practical porting steps; not an official source

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already installed and confirmed working in the project
- Architecture patterns: HIGH — Firefox MV3 background.scripts and tabs.onUpdated verified against official MDN docs
- esbuild configuration: HIGH — object entry point syntax verified in esbuild API docs
- Pitfalls: HIGH (pitfalls 3-5), MEDIUM (pitfall 1 — background termination during parse, requires empirical test)
- IndexedDB degradation: HIGH — behavior confirmed via Bugzilla and Dexie.js ecosystem issue

**Research date:** 2026-03-04
**Valid until:** 2026-06-04 (90 days — Firefox MV3 APIs are stable; PDF.js API is stable)

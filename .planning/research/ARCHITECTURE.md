# Architecture Research

**Domain:** Multi-browser extension build pipeline — Chrome MV3 + Firefox MV3 port with esbuild
**Researched:** 2026-03-03
**Confidence:** HIGH (Firefox API differences verified against MDN/Extension Workshop; esbuild API verified against official docs; existing code verified from source)

---

## Existing Architecture (v1.2 — Ground Truth from Source)

Before describing changes, this is the verified current state:

```
Google Patents Tab                    Chrome Extension Context
+---------------------+     msg      +----------------------+
| Content Script       |------------>| Service Worker        |
| (classic scripts)    |<------------| (ES module)           |
|                      |     msg     | - Message router      |
| constants.js (glob)  |             | - Offscreen lifecycle |
| text-matcher.js      |             | - chrome.storage.local|
| paragraph-finder.js  |             +----------+-----------+
| citation-ui.js       |                        |
| content-script.js    |             msg (both directions)
+---------------------+              +----------v-----------+
                                     | Offscreen Document    |
                                     | (ES modules only)     |
                                     | offscreen.js          |
                                     | pdf-parser.js         |
                                     | position-map-builder.js
                                     | - Fetch PDF blob      |
                                     | - Store in IndexedDB  |
                                     | - Parse with PDF.js   |
                                     | - Build PositionMap   |
                                     | - Run text matching   |
                                     | - Upload to KV cache  |
                                     +----------+-----------+
                                                |
                              +-----------------+------------------+
                              |                                    |
                   +----------v-----------+         +--------------v-------+
                   | IndexedDB             |         | Cloudflare Worker     |
                   | patent-cite-tool v1   |         | pct.tonyrowles.com    |
                   | pdfs store            |         | GET/POST /cache/{id}  |
                   +----------------------+         | GET /pdf?patent={id}  |
                                                    +----------------------+
```

### Current Tech Debt (What v2.0 Fixes)

| Problem | Root Cause | v2.0 Resolution |
|---------|-----------|-----------------|
| `matchAndCite` duplicated in `text-matcher.js` AND `offscreen.js` | Content scripts are classic scripts; offscreen is ES module — they cannot share code without a build step | Extract to `src/shared/matching.js`; bundle into each target |
| `MSG`/`STATUS`/`PATENT_TYPE` constants duplicated in `service-worker.js` AND `shared/constants.js` | Service worker couldn't ES-import `constants.js` originally (classic script design) | Import from `src/shared/constants.js` in all contexts after bundling |
| `offscreen.js` has Chrome-only APIs (`chrome.offscreen.createDocument`) | Chrome MV3 architecture requirement | Firefox port absorbs this logic into background script directly |

---

## v2.0 Target Architecture

### Chrome: Service Worker + Offscreen (Unchanged Structure)

Chrome keeps its existing separation because MV3 service workers lack DOM access. The offscreen document provides the DOM context needed by PDF.js. Build pipeline consolidates the code but the runtime separation remains.

```
Chrome Runtime
+---------------------------+     +---------------------------+
| Service Worker (SW)       |     | Offscreen Document        |
| dist/chrome/background/   |<--->| dist/chrome/offscreen/    |
| service-worker.js         |     | offscreen.js              |
| (bundled ES module)       |     | (bundled ES module)       |
|                           |     | pdf.mjs + pdf.worker.mjs  |
| Imports:                  |     | IndexedDB operations      |
|   shared/constants        |     | Fetch + parse pipeline    |
|   (bundled in)            |     | Text matching             |
+---------------------------+     +---------------------------+
```

### Firefox: Background Script Absorbs Offscreen

Firefox MV3 background scripts run as event pages (non-persistent pages with DOM access). They have full access to: `fetch`, `IndexedDB`, DOM APIs. There is no offscreen document API in Firefox. The background script directly executes what Chrome required an offscreen document for.

```
Firefox Runtime
+------------------------------------------+
| Background Script (Event Page)           |
| dist/firefox/background/background.js    |
| (bundled ES module)                      |
|                                          |
| Everything Chrome splits between SW and  |
| Offscreen lives here in Firefox:         |
| - Message routing (was service-worker.js)|
| - Fetch PDF blob (was offscreen.js)      |
| - IndexedDB operations (was offscreen.js)|
| - PDF.js parsing (was offscreen.js)      |
| - Text matching (was offscreen.js)       |
| - KV cache operations (was offscreen.js) |
| pdf.mjs + pdf.worker.mjs (copied)        |
+------------------------------------------+
```

### Content Scripts: Identical in Both Targets

Content scripts are classic scripts in both Chrome and Firefox (injected via manifest `content_scripts`). They use the same DOM-based paragraph finding and citation UI. esbuild bundles the shared matching code into `content.js` for each target.

---

## Directory Structure

### Source Tree (src/)

```
src/
├── background/
│   └── service-worker.js           # Chrome-specific: SW + offscreen lifecycle
├── content/
│   ├── content-script.js           # Both targets
│   ├── citation-ui.js              # Both targets
│   └── paragraph-finder.js         # Both targets
├── firefox/
│   └── background.js               # Firefox-specific: merged SW + offscreen logic
├── offscreen/
│   ├── offscreen.js                # Chrome-specific: Chrome offscreen document
│   ├── pdf-parser.js               # Shared logic (imported by offscreen + firefox/background)
│   └── position-map-builder.js     # Shared logic
├── shared/
│   ├── constants.js                # Single source for MSG, STATUS, PATENT_TYPE
│   └── matching.js                 # Extracted: normalizeText, matchAndCite, formatCitation
│                                   #   (replaces duplication between text-matcher and offscreen)
├── lib/
│   ├── pdf.mjs                     # PDF.js (copied to both dist targets)
│   └── pdf.worker.mjs              # PDF.js worker (web_accessible_resources)
├── icons/                          # PNG assets (copied to both dist targets)
├── popup/
│   ├── popup.html
│   └── popup.js
├── options/
│   ├── options.html
│   └── options.js
├── manifests/
│   ├── manifest.chrome.json        # Chrome MV3 manifest
│   └── manifest.firefox.json       # Firefox MV3 manifest
└── offscreen/
    └── offscreen.html              # Chrome-only HTML host for offscreen document
```

**Rationale for `src/manifests/` subdirectory:** The two manifests differ enough that a merge/patch approach adds complexity with no benefit. Separate source manifests are readable, diffable, and independently maintainable. The build script copies the correct one to each dist target.

**Rationale for `src/firefox/background.js`:** Firefox needs a single background entry point that combines service-worker.js behavior with offscreen.js behavior. Keeping it in `src/firefox/` makes the platform-specific nature explicit rather than burying it in a shared directory.

### Build Output (dist/)

```
dist/
├── chrome/
│   ├── manifest.json               # From src/manifests/manifest.chrome.json
│   ├── background/
│   │   └── service-worker.js       # Bundled: service-worker.js + shared imports
│   ├── content/
│   │   └── content.js              # Bundled: content-script + text-matcher + paragraph-finder
│   │                               #   + citation-ui + shared/matching + shared/constants
│   ├── offscreen/
│   │   ├── offscreen.html          # Copied
│   │   └── offscreen.js            # Bundled: offscreen.js + pdf-parser + position-map-builder
│   │                               #   + shared/matching + shared/constants
│   ├── popup/
│   │   ├── popup.html              # Copied
│   │   └── popup.js                # Bundled
│   ├── options/
│   │   ├── options.html            # Copied
│   │   └── options.js              # Bundled
│   ├── icons/                      # Copied
│   └── lib/
│       ├── pdf.mjs                 # Copied
│       └── pdf.worker.mjs          # Copied
└── firefox/
    ├── manifest.json               # From src/manifests/manifest.firefox.json
    ├── background/
    │   └── background.js           # Bundled: firefox/background.js + pdf-parser
    │                               #   + position-map-builder + shared/matching
    │                               #   + shared/constants
    ├── content/
    │   └── content.js              # Same bundle recipe as Chrome content.js
    ├── popup/
    │   ├── popup.html              # Copied (identical)
    │   └── popup.js                # Bundled (identical recipe)
    ├── options/
    │   ├── options.html            # Copied (identical)
    │   └── options.js              # Bundled (identical recipe)
    ├── icons/                      # Copied (identical)
    └── lib/
        ├── pdf.mjs                 # Copied
        └── pdf.worker.mjs          # Copied
```

**Content script bundling note:** In current v1.2, content scripts are classic scripts loaded via manifest array order (`constants.js`, `text-matcher.js`, `paragraph-finder.js`, `citation-ui.js`, `content-script.js`). After bundling, the manifest lists a single `content.js` that includes all of these in correct order. The bundle format must be `iife` (not `esm`) because content scripts cannot use `import` at runtime.

---

## Manifest Differences: Chrome vs Firefox

### Chrome manifest (src/manifests/manifest.chrome.json)

```json
{
  "manifest_version": 3,
  "permissions": [
    "declarativeContent",
    "offscreen",
    "activeTab",
    "storage",
    "contextMenus",
    "clipboardWrite"
  ],
  "background": {
    "service_worker": "background/service-worker.js",
    "type": "module"
  },
  "content_scripts": [{
    "matches": ["https://patents.google.com/patent/US*"],
    "js": ["content/content.js"],
    "run_at": "document_idle"
  }],
  "web_accessible_resources": [{
    "resources": ["lib/pdf.worker.mjs", "offscreen/offscreen.html"],
    "matches": ["<all_urls>"]
  }]
}
```

### Firefox manifest (src/manifests/manifest.firefox.json)

```json
{
  "manifest_version": 3,
  "browser_specific_settings": {
    "gecko": {
      "id": "patent-cite-tool@yourname.com",
      "strict_min_version": "109.0"
    }
  },
  "permissions": [
    "activeTab",
    "storage",
    "contextMenus",
    "clipboardWrite"
  ],
  "background": {
    "scripts": ["background/background.js"],
    "type": "module"
  },
  "content_scripts": [{
    "matches": ["https://patents.google.com/patent/US*"],
    "js": ["content/content.js"],
    "run_at": "document_idle"
  }],
  "web_accessible_resources": [{
    "resources": ["lib/pdf.worker.mjs"],
    "matches": ["https://patents.google.com/*"]
  }]
}
```

**Key manifest differences explained:**

| Field | Chrome | Firefox | Reason |
|-------|--------|---------|--------|
| `declarativeContent` permission | Required | **Omit** | Firefox does not implement `declarativeContent` API |
| `offscreen` permission | Required | **Omit** | No offscreen document API in Firefox |
| `background.service_worker` | Used | **Not used** | Firefox ignores `service_worker`; use `background.scripts` |
| `background.scripts` | Not needed | `["background/background.js"]` | Firefox uses event page (non-persistent background script) |
| `browser_specific_settings.gecko` | Not needed | **Required** | Firefox AMO requires gecko ID for signing |
| `web_accessible_resources[].extension_ids` | Optional | **Use `matches` instead** | Firefox requires `matches` not `extension_ids` for WAR |
| `offscreen/offscreen.html` in WAR | Required | **Omit** | No offscreen document in Firefox |

---

## Mapping Chrome Offscreen Logic to Firefox Background

Chrome's offscreen document was created because MV3 service workers lack DOM access. Firefox event pages have DOM access natively. Every operation in `offscreen.js` can run directly in `firefox/background.js`.

### Message Flow: Chrome vs Firefox

**Chrome flow:**

```
Content Script
  → chrome.runtime.sendMessage(LOOKUP_POSITION)
  → Service Worker handles, forwards to Offscreen
  → Offscreen does IndexedDB read + matching
  → Offscreen sends CITATION_RESULT
  → Service Worker forwards to content script tab
```

**Firefox flow (collapsed):**

```
Content Script
  → browser.runtime.sendMessage(LOOKUP_POSITION)
  → Background script handles directly
  → Background script does IndexedDB read + matching
  → Background script sends CITATION_RESULT to tab
```

The Firefox background.js is the union of service-worker.js + offscreen.js:

- **From service-worker.js:** All `chrome.runtime.onMessage` handlers, declarative content rules replacement (see below), context menu setup, icon management via `browser.action.setIcon`
- **From offscreen.js:** All PDF fetch/parse/match/cache functions, IndexedDB operations, Cloudflare Worker interactions

The `ensureOffscreenDocument()` function and all `chrome.offscreen.*` calls are **Chrome-only** — they are not present in firefox/background.js at all.

### `declarativeContent` Replacement in Firefox

Chrome uses `declarativeContent.onPageChanged` to enable the toolbar icon only on `patents.google.com/patent/US*` pages. Firefox does not implement this API.

**Firefox alternative:** Use `tabs.onUpdated` to listen for URL changes and call `action.enable()`/`action.disable()` per tab. Start with action disabled globally (set `"enabled": false` on the `action` key in manifest, or call `browser.action.disable()` on startup with no tabId to disable for all tabs by default), then enable per tab as URLs match.

```javascript
// firefox/background.js — replaces declarativeContent rules
browser.action.disable(); // disable globally on startup

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    if (/^https:\/\/patents\.google\.com\/patent\/US/.test(changeInfo.url)) {
      browser.action.enable(tabId);
    } else {
      browser.action.disable(tabId);
    }
  }
});

browser.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await browser.tabs.get(tabId);
  if (/^https:\/\/patents\.google\.com\/patent\/US/.test(tab.url || '')) {
    browser.action.enable(tabId);
  } else {
    browser.action.disable(tabId);
  }
});
```

**Confidence: HIGH** — `browser.action.disable(tabId)` and `browser.action.enable(tabId)` are confirmed supported in Firefox MV3.

---

## Shared Code Extraction via Bundling

### What Gets Extracted to src/shared/

**`src/shared/constants.js` (already exists, modify):**
Currently written as a classic script with no export. After v2.0: add ES module exports. The file still works as a classic script (exports are silently ignored when loaded as classic script), but the service worker and Firefox background can now `import` from it.

```javascript
// src/shared/constants.js — add exports
export const MSG = { ... };
export const STATUS = { ... };
export const PATENT_TYPE = { ... };
```

**`src/shared/matching.js` (new file):**
Extract the duplicated matching logic that currently exists in both `content/text-matcher.js` (classic-script globals) and `offscreen/offscreen.js` (ES module functions with `Offscreen` suffix). After extraction:

- `src/shared/matching.js` — single authoritative copy, ES module exports
- `src/content/text-matcher.js` — deleted or reduced to a thin wrapper (or the file is removed entirely and content.js imports from shared)
- `src/offscreen/offscreen.js` — imports from shared/matching instead of defining its own copies

**Functions that move to shared/matching.js:**

| Function | Currently in | After |
|----------|-------------|-------|
| `normalizeText` / `normalizeTextOffscreen` | Both files (duplicated) | `shared/matching.js` as `normalizeText` |
| `matchAndCite` / `matchAndCiteOffscreen` | Both files (duplicated) | `shared/matching.js` as `matchAndCite` |
| `formatCitation` / `formatCitationOffscreen` | Both files (duplicated) | `shared/matching.js` as `formatCitation` |
| `resolveMatch` / `resolveMatchOffscreen` | Both files (duplicated) | `shared/matching.js` as `resolveMatch` |
| `whitespaceStrippedMatch` | Both files (duplicated) | `shared/matching.js` |
| `bookendMatch` | Both files (duplicated) | `shared/matching.js` |
| `fuzzySubstringMatch` / `fuzzySubstringMatchOffscreen` | Both files (duplicated) | `shared/matching.js` |
| `findAllOccurrences` | Both files (duplicated) | `shared/matching.js` |
| `pickBestByContext` | Offscreen only | `shared/matching.js` |
| `levenshtein` / `levenshteinOffscreen` | Both files (duplicated) | `shared/matching.js` |

**After extraction, esbuild bundles shared/matching.js into every bundle that needs it.** There is no runtime module sharing — each bundle is self-contained. This is correct for extensions: content scripts, background scripts, and offscreen documents cannot share a module instance at runtime anyway.

---

## esbuild Build Script

The build script lives at `scripts/build.mjs` (sibling to existing `scripts/generate-icons.mjs`).

### Entry Points Per Target

```javascript
// scripts/build.mjs
import * as esbuild from 'esbuild';
import { cp, mkdir, copyFile } from 'fs/promises';

const targets = ['chrome', 'firefox'];

for (const target of targets) {
  const outdir = `dist/${target}`;
  await mkdir(outdir, { recursive: true });

  // JavaScript bundles
  await esbuild.build({
    entryPoints: target === 'chrome'
      ? {
          'background/service-worker': 'src/background/service-worker.js',
          'offscreen/offscreen': 'src/offscreen/offscreen.js',
          'content/content': 'src/content/content-script.js',
          'popup/popup': 'src/popup/popup.js',
          'options/options': 'src/options/options.js',
        }
      : {
          'background/background': 'src/firefox/background.js',
          'content/content': 'src/content/content-script.js',
          'popup/popup': 'src/popup/popup.js',
          'options/options': 'src/options/options.js',
        },
    bundle: true,
    outdir,
    format: 'esm',   // service-worker and background use ESM; see content note
    platform: 'browser',
    define: {
      'BROWSER_TARGET': JSON.stringify(target),
    },
  });

  // Content script needs IIFE format (not ESM) — separate build call
  await esbuild.build({
    entryPoints: { 'content/content': 'src/content/content-script.js' },
    bundle: true,
    outdir,
    format: 'iife',  // classic script injection — cannot use ESM at runtime
    platform: 'browser',
    define: { 'BROWSER_TARGET': JSON.stringify(target) },
  });

  // Copy static assets
  await cp('src/icons', `${outdir}/icons`, { recursive: true });
  await cp('src/lib', `${outdir}/lib`, { recursive: true });
  await copyFile(`src/popup/popup.html`, `${outdir}/popup/popup.html`);
  await copyFile(`src/options/options.html`, `${outdir}/options/options.html`);
  await copyFile(
    `src/manifests/manifest.${target}.json`,
    `${outdir}/manifest.json`
  );

  // Chrome-only: copy offscreen HTML
  if (target === 'chrome') {
    await copyFile('src/offscreen/offscreen.html', `${outdir}/offscreen/offscreen.html`);
  }
}
```

**Content script format note:** The `content-script.js` entry point imports from `shared/constants.js` and `shared/matching.js`. After esbuild bundles with `format: 'iife'`, those imports are inlined — the output is a single classic-compatible IIFE file. The manifest lists only `content/content.js` (instead of the current 5-file array). This eliminates the global-variable dependency chain in the manifest.

**ESM format for background/offscreen:** Service worker (`type: "module"`) and offscreen document (`<script type="module">`) already use ESM. The Firefox background script also uses `"type": "module"` in the manifest. ESM format bundles import statements inline without adding module boilerplate. This matches the existing structure.

### Build Scripts in package.json

```json
{
  "scripts": {
    "build": "node scripts/build.mjs",
    "build:chrome": "BROWSER_TARGET=chrome node scripts/build.mjs",
    "build:firefox": "BROWSER_TARGET=firefox node scripts/build.mjs",
    "test": "vitest run",
    "generate-icons": "node scripts/generate-icons.mjs"
  },
  "devDependencies": {
    "esbuild": "^0.24.0",
    "pdfjs-dist": "^5.5.207",
    "sharp": "^0.34.5",
    "vitest": "^3.0.0"
  }
}
```

---

## Platform-Specific Code Paths

### Strategy: Platform-Specific Entry Points (Preferred)

The cleanest approach is separate entry points per platform rather than `if (BROWSER_TARGET === 'chrome')` branches scattered through shared files. The divergence is large enough (offscreen document lifecycle vs. no offscreen document) that a unified entry point would be hard to follow.

- `src/background/service-worker.js` — Chrome-only entry point; references `chrome.offscreen`, `declarativeContent`
- `src/firefox/background.js` — Firefox-only entry point; no offscreen references, uses `tabs.onUpdated` for icon control

Both import from the same `src/shared/` modules. The platform-specific code lives only at the entry point level.

### Strategy: BROWSER_TARGET Define (For Minor Differences)

For small differences within shared code (e.g., a single API call that differs between targets), esbuild's `define` option inlines a constant that the bundler uses for dead-code elimination:

```javascript
// src/shared/matching.js — hypothetical example of minor platform difference
if (typeof BROWSER_TARGET !== 'undefined' && BROWSER_TARGET === 'chrome') {
  // Chrome-specific behavior
}
```

esbuild replaces `BROWSER_TARGET` with the literal string `"chrome"` or `"firefox"` at build time, then eliminates the dead branch. The `if` statement does not appear in the output bundle.

**In practice, avoid this pattern for the offscreen/background split.** The difference is too large. Reserve `BROWSER_TARGET` defines for genuinely minor variations.

### What Remains Chrome-Only

| Code | Location | Why |
|------|----------|-----|
| `chrome.offscreen.createDocument()` | service-worker.js | API does not exist in Firefox |
| `chrome.declarativeContent.onPageChanged` | service-worker.js | API does not exist in Firefox |
| `offscreen/offscreen.html` | static asset | Chrome-only; not copied to dist/firefox |
| `ensureOffscreenDocument()` | service-worker.js | Chrome-only lifecycle management |
| `offscreen` permission | manifest.chrome.json | Chrome-only manifest permission |
| `declarativeContent` permission | manifest.chrome.json | Chrome-only manifest permission |

### What Remains Firefox-Only

| Code | Location | Why |
|------|----------|-----|
| `tabs.onUpdated` icon enable/disable | firefox/background.js | `declarativeContent` alternative |
| `tabs.onActivated` icon enable/disable | firefox/background.js | `declarativeContent` alternative |
| `browser_specific_settings.gecko.id` | manifest.firefox.json | AMO signing requirement |
| Inline PDF parsing in background | firefox/background.js | No offscreen document API |

### What is Shared (Identical Between Targets)

| Component | Status |
|-----------|--------|
| `src/shared/constants.js` | Bundled into every entry point |
| `src/shared/matching.js` | Bundled into content (both), offscreen (Chrome), background (Firefox) |
| `src/offscreen/pdf-parser.js` | Imported by Chrome's offscreen.js AND Firefox's background.js |
| `src/offscreen/position-map-builder.js` | Same |
| `src/content/content-script.js` | Same content bundle for both targets |
| `src/content/citation-ui.js` | Same content bundle |
| `src/content/paragraph-finder.js` | Same content bundle |
| `src/popup/` | Identical in both targets (HTML + JS) |
| `src/options/` | Identical in both targets (HTML + JS) |
| `src/icons/` | Identical in both targets |
| `src/lib/pdf.mjs` | Copied to both targets |
| `src/lib/pdf.worker.mjs` | Copied to both targets |

---

## Data Flow Changes in v2.0

### Chrome: No Runtime Change

The Chrome message flow is identical to v1.2. The only change is that `shared/matching.js` is now bundled into the offscreen document instead of being duplicated inline. Runtime behavior is identical.

### Firefox: Collapsed Message Flow

```
Firefox Content Script
  → browser.runtime.sendMessage({ type: LOOKUP_POSITION, ... })
    ↓
Firefox Background Script (directly handles — no forwarding needed)
  → reads IndexedDB for positionMap
  → calls matchAndCite() from shared/matching.js
  → browser.tabs.sendMessage(tabId, { type: CITATION_RESULT, ... })
    ↓
Firefox Content Script handles CITATION_RESULT
```

The Chrome pattern of "SW forwards to offscreen, offscreen responds to SW, SW forwards to tab" collapses to "background handles and responds directly."

### IndexedDB: Shared Schema, Different Access Context

Both Chrome (offscreen document) and Firefox (background script) access the same IndexedDB database `patent-cite-tool` with the same `pdfs` object store and record schema. No schema changes are needed for Firefox.

**Important:** IndexedDB in a Firefox background event page persists across background script suspension/resumption. The data is not lost when the event page unloads. This matches Chrome's behavior (offscreen document is destroyed and recreated, but IndexedDB data persists).

---

## PDF.js Worker URL: Platform Difference

`pdf-parser.js` currently sets:

```javascript
GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdf.worker.mjs');
```

This uses `chrome.runtime.getURL()` which works in both Chrome and Firefox (Firefox supports the `chrome.*` namespace for compatibility). No change needed — this line works in both targets.

**Verification:** Firefox has supported `chrome.runtime.getURL()` since Firefox 45. The extension uses `browser.*` / `chrome.*` interchangeably. Both work.

---

## Component Inventory: New vs Modified vs Unchanged

### New Files

| File | Purpose |
|------|---------|
| `src/shared/matching.js` | Extracted: normalizeText, matchAndCite, formatCitation, all helpers |
| `src/firefox/background.js` | Firefox background: merged SW + offscreen logic, tabs-based icon control |
| `src/manifests/manifest.chrome.json` | Chrome-specific manifest (moved from src/manifest.json) |
| `src/manifests/manifest.firefox.json` | Firefox-specific manifest |
| `scripts/build.mjs` | esbuild build script producing dist/chrome/ + dist/firefox/ |

### Modified Files

| File | What Changes |
|------|-------------|
| `src/shared/constants.js` | Add `export` keyword to `MSG`, `STATUS`, `PATENT_TYPE` |
| `src/background/service-worker.js` | Import from `shared/constants.js` instead of inline duplication |
| `src/offscreen/offscreen.js` | Import matching functions from `shared/matching.js` instead of duplicating |
| `src/content/content-script.js` | Import constants from `shared/constants.js` (via bundle — no code change needed if esbuild resolves it) |
| `package.json` | Add `esbuild` devDependency; add build scripts |

### Deleted Files (After Build Pipeline Established)

| File | Why |
|------|-----|
| `src/manifest.json` | Replaced by `src/manifests/manifest.chrome.json` + `manifest.firefox.json` |

### Unchanged Files

| File | Why Unchanged |
|------|--------------|
| `src/offscreen/pdf-parser.js` | Pure logic; imported by both offscreen.js and firefox/background.js |
| `src/offscreen/position-map-builder.js` | Pure logic; shared |
| `src/content/citation-ui.js` | Classic-script UI; unchanged |
| `src/content/paragraph-finder.js` | DOM walking; unchanged |
| `src/content/text-matcher.js` | **Either deleted** (logic moves to shared/matching.js) **or reduced to** thin import wrapper |
| `src/popup/popup.html`, `popup.js` | No browser-specific differences |
| `src/options/options.html`, `options.js` | No browser-specific differences |
| `src/lib/pdf.mjs`, `pdf.worker.mjs` | Copied to both dist targets |
| `tests/` directory | Test harness; unchanged |
| `worker/` directory | Cloudflare Worker; unchanged |

---

## Build Order (Phase Dependencies)

The v2.0 work has hard dependencies that dictate build order:

```
Step 1: Shared code extraction
  Why first: All subsequent work depends on shared/matching.js and
  shared/constants.js with exports. Firefox background.js and the
  Chrome offscreen.js refactor both import from shared/.

  - Create src/shared/matching.js (extract from text-matcher.js + offscreen.js)
  - Add exports to src/shared/constants.js
  - Update src/offscreen/offscreen.js to import from shared/matching.js
  - Update src/background/service-worker.js to import from shared/constants.js
  - Verify: existing Chrome extension still works (no dist/ yet; test via load unpacked)

Step 2: esbuild pipeline (Chrome only)
  Why second: Validate the build pipeline against the known-working Chrome target
  before introducing Firefox. Catches build configuration errors without browser
  compatibility noise.

  - Write scripts/build.mjs for Chrome target only
  - Create src/manifests/manifest.chrome.json (copy/rename existing manifest.json)
  - Verify: dist/chrome/ loads and functions identically to pre-build src/
  - Verify: 71-case test corpus still passes

Step 3: Firefox background script
  Why third: Requires shared code from Step 1. Introduce Firefox-specific
  background.js with merged SW + offscreen logic + tabs-based icon control.

  - Write src/firefox/background.js
  - Create src/manifests/manifest.firefox.json
  - Add Firefox target to scripts/build.mjs
  - Verify: dist/firefox/ loads in Firefox, citation pipeline works

Step 4: Cross-browser validation
  Why last: Both targets must be working before validation makes sense.

  - Load dist/chrome/ in Chrome, run test corpus cases manually
  - Load dist/firefox/ in Firefox, run same cases
  - Verify 71-case corpus passes on both platforms
```

**Critical constraint:** Do not attempt the Firefox port (Step 3) before the build pipeline validates against Chrome (Step 2). Firefox debugging is harder than Chrome debugging. A working Chrome build confirms the shared code extraction is correct before adding Firefox-specific complexity.

---

## Anti-Patterns

### Anti-Pattern 1: Unified Entry Point with Platform Conditionals

**What people do:** Write a single `background.js` with `if (chrome.offscreen) { /* Chrome path */ } else { /* Firefox path */ }` branching throughout.

**Why it's wrong:** The offscreen document split is fundamental — Chrome's service worker orchestrates a separate offscreen process. Firefox's background script is one process doing everything. Unifying these into a single file means every function has a conditional, the code is hard to read, and tests cannot easily isolate platform behavior.

**Do this instead:** Separate entry points (`src/background/service-worker.js` for Chrome, `src/firefox/background.js` for Firefox) sharing common modules from `src/shared/`. The build script selects the right entry point per target.

### Anti-Pattern 2: Runtime API Detection Instead of Build-Time Branching

**What people do:** Check `if (typeof chrome.offscreen !== 'undefined')` at runtime to detect browser.

**Why it's wrong:** API detection at runtime is fragile — Chrome/Firefox add and remove APIs between versions. Build-time branching via separate entry points is explicit and survives API changes without needing detection logic.

**Do this instead:** Separate entry points per platform. The manifest declares the background script; the background script is the platform-specific entry.

### Anti-Pattern 3: Bundling pdf.worker.mjs with the Main Bundle

**What people do:** Import `pdf.worker.mjs` from within the main PDF.js consumer module, letting esbuild bundle it inline.

**Why it's wrong:** The PDF.js worker is a separate worker script that PDF.js loads via URL (`GlobalWorkerOptions.workerSrc`). It must exist as a standalone file at a known URL within the extension. If bundled inline, PDF.js cannot load it as a worker.

**Do this instead:** Mark `pdf.mjs` and `pdf.worker.mjs` as `external` in the esbuild config (do not bundle them), and copy them as-is to `dist/{target}/lib/`. The `web_accessible_resources` manifest entry must include `lib/pdf.worker.mjs` so PDF.js can construct a worker URL from it.

```javascript
// scripts/build.mjs — mark PDF.js as external, handle via copy
await esbuild.build({
  external: ['../lib/pdf.mjs'],  // don't bundle pdf.mjs; import at runtime via relative path
  ...
});
// Then copy pdf.mjs and pdf.worker.mjs to dist/{target}/lib/
```

**Alternative:** If `pdf-parser.js` imports `pdf.mjs` from `../lib/pdf.mjs`, esbuild will try to bundle it. Use `external: ['../lib/*']` or restructure the import to use a URL string instead of a module import for the worker case.

### Anti-Pattern 4: One Manifest with Platform Patches

**What people do:** Write a base manifest and apply JSON patches at build time to produce browser-specific variants.

**Why it's wrong for this project:** The manifest differences between Chrome and Firefox are significant (different background keys, different permission sets, different WAR format). A patch-based approach requires a patching library and makes the effective manifest hard to read — you must mentally apply the patches to understand what Firefox sees.

**Do this instead:** Maintain two readable manifest files in `src/manifests/`. Both are checked into source control. Diffs between them are immediately visible. The build script copies the right one. This is simpler and more transparent than a patch system.

---

## Integration Points with Test Harness

The existing Vitest test harness (tests/) is not affected by the build pipeline. Tests import directly from `src/` files (not from `dist/`). After shared code extraction:

- Tests that previously imported `matchAndCiteOffscreen` from `src/offscreen/offscreen.js` should be updated to import `matchAndCite` from `src/shared/matching.js`
- The `offscreen-matcher.test.js` file may need updating if function names change (the `Offscreen` suffix disappears when logic moves to shared/)
- All other tests (position-map-builder, text-matcher, classify-result) are unaffected

---

## Sources

- [MDN: Background scripts — Firefox MV3 background field options](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background) — HIGH confidence; Firefox background.scripts vs service_worker; persistent: false behavior
- [MDN: Background scripts — DOM access in Firefox event pages](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Background_scripts) — HIGH confidence; Firefox background pages have `window` global and full DOM APIs
- [MDN: Chrome incompatibilities — declarativeContent not in Firefox](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Chrome_incompatibilities) — HIGH confidence; declarativeContent explicitly listed as not implemented
- [Firefox Extension Workshop: MV3 Migration Guide](https://extensionworkshop.com/documentation/develop/manifest-v3-migration-guide/) — HIGH confidence; background scripts vs service workers; no offscreen document support in Firefox
- [MDN: browser_specific_settings — gecko ID required for AMO](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings) — HIGH confidence; gecko.id format requirements
- [esbuild API documentation](https://esbuild.github.io/api/) — HIGH confidence; entryPoints, outdir, format (iife/esm), bundle, define options
- [Chrome Developers: Offscreen Documents in MV3](https://developer.chrome.com/blog/Offscreen-Documents-in-Manifest-v3) — HIGH confidence; why offscreen exists in Chrome (service worker lacks DOM); not available in Firefox
- [MDN: action.disable() — Firefox support confirmed](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/action/disable) — HIGH confidence; per-tab action disable/enable works in Firefox
- Existing source code (v1.2) — HIGH confidence; ground truth for current architecture, duplication locations, Chrome API usage patterns

---

*Architecture research for: Patent Citation Tool v2.0 — esbuild build pipeline + Firefox port*
*Researched: 2026-03-03*

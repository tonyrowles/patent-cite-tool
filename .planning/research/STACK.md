# Stack Research

**Domain:** Browser Extension Build Pipeline + Firefox Port
**Researched:** 2026-03-03
**Confidence:** HIGH (esbuild config, Firefox manifest differences, web-ext CLI) / MEDIUM (webextension-polyfill integration patterns with this codebase's dual-context module system)

---

## Milestone Context

This document covers ONLY NEW stack additions for v2.0. Do not re-research the existing validated stack:
- Chrome MV3, PDF.js v5, Shadow DOM, IndexedDB, offscreen document API — validated
- Cloudflare Workers + KV, USPTO proxy — deployed and working
- Vitest test harness, sharp icon generator — operational
- 4,500 LOC JavaScript/HTML/CSS/JSON in `src/`

Current `src/` structure to be built by the new pipeline:
- `src/background/service-worker.js` — Chrome service worker (ES module)
- `src/content/*.js` — Content scripts (classic scripts loaded via manifest; shared/constants.js is first)
- `src/offscreen/offscreen.js`, `pdf-parser.js`, `position-map-builder.js` — ES modules for PDF parsing
- `src/shared/constants.js` — Dual-context: ES module AND classic script globals
- `src/lib/pdf.mjs`, `pdf.worker.mjs` — Pre-compiled PDF.js library files (copy only, do not bundle)
- `src/popup/`, `src/options/` — HTML pages with associated JS
- `src/icons/*.png` — Static image assets
- `src/manifest.json` — Chrome manifest (template for both targets)

Focus: esbuild pipeline, Firefox manifest, Firefox background script (absorbing offscreen logic), webextension-polyfill, web-ext CLI.

---

## Core Technologies — New for v2.0

### Core Framework

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| esbuild | 0.27.3 | JavaScript bundler producing `dist/chrome/` and `dist/firefox/` | Fastest bundler available. No configuration framework needed — a single `build.mjs` Node script drives the entire pipeline. Supports IIFE (required for content scripts) and ESM formats. Browser-version targeting. 1Password reported 90% build time reduction vs Webpack. Native watch mode via `context.watch()`. No plugins required for this codebase. |
| webextension-polyfill | 0.12.0 | Normalize `browser.*` API to promise-based on Chrome; no-op on Firefox | Mozilla-maintained. Allows writing `browser.runtime.sendMessage()` once instead of `chrome.runtime.sendMessage()`. On Firefox, detects native `browser` namespace and does nothing. On Chrome, wraps `chrome.*` callbacks as Promises. Required for any code that calls extension APIs cross-browser. |
| web-ext | 9.3.0 | Firefox extension development: load, auto-reload, and package | Mozilla's official CLI. `web-ext run --source-dir dist/firefox/` loads extension into a temporary Firefox profile, auto-reloads on file changes. `web-ext build` produces a signed-ready `.zip` for AMO submission. As of v7.0.0, exports native ES modules only (Node 14+ required). |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `build.mjs` (custom Node script) | Orchestrates esbuild calls for both browser targets | No framework needed. Node ESM script called via `npm run build`. Pass `--watch` arg to enable `context.watch()` mode. |
| npm scripts | Trigger build variants | `build:chrome`, `build:firefox`, `build:all`, `dev:chrome`, `dev:firefox` |

---

## esbuild Configuration

### Key Design Decisions

**Format: IIFE for content scripts, ESM for everything else**

Content scripts loaded via manifest `js:[]` array cannot be ES modules — they run as classic scripts in the page context. esbuild must produce IIFE bundles for them. All other extension contexts (service worker, offscreen, popup, options, background) can use ESM.

Critical: esbuild code splitting (`splitting: true`) only works with ESM format. Since content scripts require IIFE, each content script entry point bundles its own copy of shared code. For this codebase, `shared/constants.js` is small enough that duplication is acceptable. This eliminates the need for code splitting.

**Entry points per browser target**

The build script calls esbuild twice — once for Chrome output, once for Firefox output. The file lists are nearly identical; the difference is:
- Chrome: includes `offscreen/offscreen.js` as an entry point
- Firefox: includes `background/background.js` (a new Firefox-specific file) instead of offscreen entry
- Chrome manifest uses `"service_worker"` key; Firefox manifest uses `"scripts"` array

**pdf.worker.mjs: copy, never bundle**

`src/lib/pdf.mjs` and `src/lib/pdf.worker.mjs` are pre-compiled by the PDF.js project. They must be copied to the output directory unchanged. Bundling them would break their internal module references. Use `fs.cpSync` in the build script — no esbuild plugin needed.

### Annotated Build Script Pattern

```javascript
// build.mjs — project root
import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, copyFileSync } from 'fs';

const watch = process.argv.includes('--watch');
const target = process.argv.find(a => a.startsWith('--target='))?.split('=')[1] ?? 'all';

// Shared esbuild options for all entry points
const sharedOptions = {
  bundle: true,
  minify: !watch,        // Minify in production builds; skip in watch mode for readable output
  sourcemap: watch,      // Source maps only in dev (not in extension artifacts)
  logLevel: 'info',
};

// Content scripts: must be IIFE (not ES modules) for manifest injection
const contentScriptOptions = {
  ...sharedOptions,
  format: 'iife',
  target: ['chrome120', 'firefox128'],  // Both browsers understand modern JS; no transpilation needed
  entryPoints: [
    'src/content/content-script.js',    // esbuild resolves its imports transitively
  ],
  // Note: shared/constants.js is imported by content-script.js after extraction from classic global pattern
  outdir: 'dist/chrome/content',        // Changed per target
};

// ESM entry points: service worker, offscreen, popup, options
const esmOptions = {
  ...sharedOptions,
  format: 'esm',
  target: ['chrome120', 'firefox128'],
  entryPoints: [
    'src/background/service-worker.js',
    'src/popup/popup.js',
    'src/options/options.js',
  ],
  outdir: 'dist/chrome',               // Changed per target
};

// Copy static assets (manifests, HTML, icons, lib files)
function copyStaticAssets(browserTarget) {
  const outDir = `dist/${browserTarget}`;
  mkdirSync(`${outDir}/lib`, { recursive: true });
  mkdirSync(`${outDir}/icons`, { recursive: true });
  // PDF.js pre-compiled — never bundle
  cpSync('src/lib', `${outDir}/lib`, { recursive: true });
  cpSync('src/icons', `${outDir}/icons`, { recursive: true });
  cpSync('src/popup/popup.html', `${outDir}/popup/popup.html`);
  cpSync('src/options/options.html', `${outDir}/options/options.html`);
  // For offscreen: Chrome only
  if (browserTarget === 'chrome') {
    cpSync('src/offscreen/offscreen.html', `${outDir}/offscreen/offscreen.html`);
  }
  // Target-specific manifest
  cpSync(`src/manifest.${browserTarget}.json`, `${outDir}/manifest.json`);
}
```

**Why `target: ['chrome120', 'firefox128']`:** Both these versions fully support modern JS (async/await, optional chaining, nullish coalescing, ES2022+). Setting this target tells esbuild not to downcompile modern syntax, keeping output readable and small. These are conservative minimums — both browsers are well past these versions in 2026.

### Separate Manifests

Maintain two manifest source files:
- `src/manifest.chrome.json` — Chrome version (existing `manifest.json` content; uses `"service_worker"`)
- `src/manifest.firefox.json` — Firefox version (uses `"scripts"` array, adds `browser_specific_settings`)

The build script copies the appropriate manifest to `dist/{target}/manifest.json`.

---

## Firefox Manifest Differences

### Background: `service_worker` vs `scripts`

Chrome MV3 requires a service worker. Firefox MV3 uses non-persistent background pages (event pages) — not service workers. Firefox event pages have DOM access; Chrome service workers do not. This is why the offscreen document trick exists in Chrome.

**Chrome manifest:**
```json
"background": {
  "service_worker": "background/service-worker.js",
  "type": "module"
}
```

**Firefox manifest:**
```json
"background": {
  "scripts": ["background/background.js"],
  "type": "module"
}
```

Note: Chrome 121+ and Firefox 121+ theoretically support declaring both `service_worker` and `scripts` in one manifest, with each browser using what it understands. This approach allows a single manifest file. However, maintaining separate manifests is clearer and avoids edge cases in older browser versions and AMO linter behavior. **Recommendation: separate manifests.**

### Firefox-Required Fields

```json
"browser_specific_settings": {
  "gecko": {
    "id": "patent-cite-tool@example.com",
    "strict_min_version": "128.0",
    "data_collection_permissions": {
      "required": ["none"]
    }
  }
}
```

- **`gecko.id`**: Mandatory for AMO submission. Use email-format or GUID. Choose one now and keep it permanent — the ID is tied to the AMO listing.
- **`strict_min_version: "128.0"`**: Firefox 128 is when full MV3 support landed (July 2024). Targeting 128+ ensures all MV3 APIs are available. Firefox 109 had initial MV3 support but is too old to target in 2026.
- **`data_collection_permissions`**: Mandatory for all new extensions submitted to AMO after November 3, 2025. This extension collects no personal data, so `"required": ["none"]` is correct.

### Permissions Differences

**Remove from Firefox manifest:**
- `"declarativeContent"` — Not implemented in Firefox. Chrome uses it to enable the toolbar action on matching URLs. Firefox alternative: use `activeTab` + `tabs.onUpdated` listener in the background script, or rely solely on `content_scripts` `matches` to determine when to activate. For this extension, the content script already runs only on `patents.google.com/patent/US*` via `matches`, so `declarativeContent` is optional even in Chrome — it was used to control icon visibility. Firefox will use a `tabs.onUpdated` listener in the background script instead.
- `"offscreen"` — No offscreen document API in Firefox. Remove entirely.

**Keep in Firefox manifest:**
- `"activeTab"`, `"storage"`, `"contextMenus"`, `"clipboardWrite"` — All supported in Firefox MV3.

### No `web_accessible_resources.use_dynamic_url`

Firefox does not support the `use_dynamic_url` property. The existing Chrome manifest does not use this property, so no change needed.

---

## Firefox Background Script

### The Core Difference: No Offscreen Document API

Chrome's `chrome.offscreen` API creates a hidden HTML page with DOM access — used in this extension to run PDF.js in a context where `fetch()` and `document` are available from the service worker context.

Firefox has no `chrome.offscreen` API. Instead, the Firefox event page (background script) runs in a full page context with DOM and `fetch()` natively available. **PDF.js can run directly in the Firefox background script — no offscreen workaround needed.**

### Firefox Background Script Strategy

Create `src/background/background.firefox.js`:
- Absorbs the PDF parsing logic currently in `src/offscreen/offscreen.js` and `src/offscreen/pdf-parser.js`
- Handles the same `chrome.runtime.onMessage` listener as the offscreen document
- Can use `fetch()`, `document`, and `importScripts`-equivalent patterns directly
- Uses `browser.*` API (via webextension-polyfill) for cross-browser call signatures

The Chrome service worker continues to delegate PDF work to the offscreen document via `chrome.runtime.sendMessage`. The Firefox background script handles it inline.

### Event Page Lifecycle Warning

Firefox event pages in MV3 are non-persistent — they unload after a period of inactivity (similar to Chrome service workers). State stored in module-level variables is lost on unload. Use `browser.storage.local` for any state that must survive between events. The existing Chrome code already uses `IndexedDB` for patent cache, which survives background script unloads on both platforms.

---

## webextension-polyfill Integration

### What It Does

On Chrome: wraps `chrome.*` callback-based APIs to return Promises, and exposes them under the `browser.*` namespace.
On Firefox: detects the native `browser` namespace already exists and does nothing (no-op).

Result: code written with `browser.runtime.sendMessage()` works on both browsers.

### Usage Pattern in This Codebase

After esbuild bundles the code, `webextension-polyfill` is imported at the top of each script that calls extension APIs:

```javascript
// In background scripts, popup, options — anywhere chrome.* is called
import browser from 'webextension-polyfill';

// Then use browser.* instead of chrome.*
const settings = await browser.storage.sync.get(['triggerMode']);
browser.runtime.onMessage.addListener((msg) => { /* ... */ });
```

**Content scripts:** The polyfill can also be injected into content scripts. However, content scripts in this extension primarily use `chrome.runtime.sendMessage()` (the callback form). The simplest approach is to bundle the polyfill into the content script bundle and replace `chrome.*` calls with `browser.*`.

### Bundling the Polyfill

esbuild resolves the polyfill as a normal npm dependency:

```javascript
// esbuild entry point imports this naturally
import browser from 'webextension-polyfill';
```

esbuild will inline the polyfill into each bundle that imports it. Since content scripts are IIFE bundles and background/popup are ESM bundles, each bundle gets its own copy. The polyfill is ~10 KB minified — acceptable for extension bundles.

**Alternative pattern (not recommended here):** Inject polyfill as a separate manifest `js` entry before content scripts. This avoids duplication across bundles but requires the polyfill to run as a classic script, which conflicts with the package's ESM export. The esbuild bundling approach is simpler.

### Verification of MV3 Compatibility

webextension-polyfill 0.12.0 supports MV3. The Mozilla Discourse documentation confirms the promise-style `browser.*` API works for both MV2 and MV3 and is tested on the last stable Chrome and Firefox versions. On Firefox, it is literally a no-op, so compatibility risk is zero on that side. On Chrome MV3, the wrapping works correctly.

**Confidence: MEDIUM** — Version 0.12.0 confirmed as latest from npm search results (libraries.io shows 0.12.0 as current). MV3 compatibility confirmed via Mozilla documentation. This codebase's specific API calls (runtime.sendMessage, storage.sync, action.setIcon, tabs.query) should be verified against the polyfill's API surface during implementation — particularly `chrome.action` (MV3 replacement for `chrome.browserAction`).

---

## web-ext CLI

### Purpose

`web-ext` is Mozilla's official tool for Firefox extension development. It handles:
1. Loading an unpacked extension into a temporary Firefox profile (without manual about:debugging)
2. Watching for file changes and auto-reloading
3. Packaging the extension into a `.zip` suitable for AMO submission

### Key Commands

```bash
# Load extension from dist/firefox/ and open Firefox with auto-reload
npx web-ext run --source-dir dist/firefox/

# Package dist/firefox/ into a zip for AMO submission
npx web-ext build --source-dir dist/firefox/ --artifacts-dir artifacts/

# Lint the Firefox extension for AMO compliance
npx web-ext lint --source-dir dist/firefox/
```

**Important:** web-ext should point to `dist/firefox/` (the built output), not `src/`. The extension must be built by esbuild first. The development workflow is: `npm run build:firefox -- --watch` in one terminal, `npx web-ext run --source-dir dist/firefox/ --no-reload` in another (web-ext watches its own source dir; esbuild rebuild triggers browser reload automatically).

### Version Note

web-ext 9.3.0 is the latest as of 2026-03-03. As of v7.0.0, web-ext exports native ES modules only — Node.js 14+ required (not a concern since the project already uses `"type": "module"` in package.json).

### Install as Dev Dependency

```bash
npm install -D web-ext
```

This keeps the version pinned for the project team and avoids relying on a globally installed version.

---

## PDF.js in Firefox

### No Changes Required

Firefox's background script (event page) has full DOM and `fetch()` access. PDF.js runs in this context without modification. The existing PDF.js v5 code (pdf.mjs + pdf.worker.mjs) works in Firefox background scripts the same way it works in Chrome's offscreen document — both are essentially browser page contexts with Web Worker support.

`pdf.worker.mjs` is registered via `workerSrc` in the PDF.js initialization. The file must be `web_accessible_resources` listed in the manifest so Firefox can load it:

```json
"web_accessible_resources": [
  {
    "resources": ["lib/pdf.worker.mjs"],
    "matches": ["<all_urls>"]
  }
]
```

This already exists in the Chrome manifest and should be copied unchanged to the Firefox manifest.

**Confidence: HIGH** — Firefox background scripts have DOM access (confirmed via MDN). PDF.js is a Mozilla project and is tested against Firefox. No browser-specific configuration is needed.

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| WXT framework | Abstracts esbuild config, adds magic. This codebase is 4,500 LOC of plain JS — a custom build.mjs is 50-100 lines and fully transparent. WXT adds a framework dependency for little gain. | Custom `build.mjs` script |
| Parcel | Zero-config bundler, but extension support requires the `@parcel/config-webextension` package. Less control over output format per entry point (IIFE vs ESM). Hard to customize for the pdf.worker.mjs copy requirement. | esbuild with explicit config |
| Vite | Dev server-centric. Extension mode requires `vite-plugin-web-extension` plugin. Adds Vite config layer on top of Rollup on top of esbuild. Unnecessary indirection. | esbuild directly |
| Rollup | Slower than esbuild; requires more plugins for extension use cases; no native watch API comparable to esbuild's context API. | esbuild |
| webextension-polyfill-ts | The TypeScript wrapper around webextension-polyfill. This project uses plain JavaScript. The TS types are not needed; the runtime library is the same. | webextension-polyfill directly |
| `@types/webextension-polyfill` | TypeScript types — not needed for a plain JS project. | N/A |
| esbuild-plugin-copy | Adds a dependency for what is a 5-line `fs.cpSync` call in the build script. | `fs.cpSync` in `build.mjs` |
| Code splitting (`splitting: true`) | Only works with ESM format. Content scripts must be IIFE. Enabling splitting for ESM entry points while using IIFE for content scripts requires two separate esbuild calls — which is already the plan. Splitting is not needed because shared code (constants) is small. | Duplicate shared code in bundles (acceptable at this scale) |
| Single shared manifest with both `service_worker` and `scripts` | Theoretically supported in Chrome 121+/Firefox 121+, but adds linter risk, obscures intent, and is poorly documented. | Separate `manifest.chrome.json` and `manifest.firefox.json` |
| Babel | Not needed. esbuild's `target` option handles syntax downcompilation. The existing code uses no syntax beyond what Chrome 120/Firefox 128 support natively. | esbuild `target` option |

---

## Installation

```bash
# New dev dependencies for v2.0
npm install -D esbuild webextension-polyfill web-ext
```

**Resulting package.json devDependencies addition:**
```json
{
  "devDependencies": {
    "esbuild": "^0.27.3",
    "web-ext": "^9.3.0",
    "webextension-polyfill": "^0.12.0"
  }
}
```

Note: `webextension-polyfill` is technically a runtime dependency of the extension (it ships inside the bundle), but since esbuild inlines it at build time, no separate `dependencies` entry is needed. It functions as a dev dependency in the npm sense.

---

## Version Compatibility

| Package | Version | Compatible With | Notes |
|---------|---------|-----------------|-------|
| esbuild | 0.27.3 | Node.js 18+ | Latest as of 2026-03-03. Breaking changes between major versions are rare — minor/patch safe to update. |
| webextension-polyfill | 0.12.0 | Chrome MV3, Firefox MV3, Safari | Latest on npm. `@types/webextension-polyfill` at 0.12.5 if TS is ever added. |
| web-ext | 9.3.0 | Node.js 14+, Firefox desktop | Latest as of 2026-03-03 (published ~12 days ago). ES module only since v7.0.0. |
| pdf.mjs / pdf.worker.mjs | v5 (existing) | Chrome + Firefox | No changes. Pre-compiled files are copied unchanged. |

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Custom `build.mjs` | WXT framework | If starting a new extension from scratch with TypeScript + React + complex multi-target needs |
| esbuild | Vite | If building a web app (not extension) where dev server HMR matters more than build simplicity |
| Separate manifests | Single merged manifest | If you need to support more than two targets and the manifest differences are minimal — not the case here due to `declarativeContent` and `offscreen` permission differences |
| `browser.*` via polyfill | Conditional `chrome` vs `browser` checks | When polyfill is unavailable (e.g., userscripts). Using the polyfill everywhere is cleaner. |
| `web-ext run` | `about:debugging` manual load | Manual loading is acceptable for one-off tests; web-ext is required for auto-reload during development |

---

## Sources

- [esbuild API documentation](https://esbuild.github.io/api/) — format options, target, entryPoints, bundle, outdir (HIGH confidence)
- [1Password blog: new extension build system](https://1password.com/blog/new-extension-build-system) — real-world esbuild extension build patterns, 90% build time reduction (MEDIUM confidence — industry case study, May 2024)
- [webextension-polyfill GitHub](https://github.com/mozilla/webextension-polyfill) — usage patterns, no-op behavior on Firefox, MV3 compatibility (HIGH confidence — Mozilla-maintained)
- [webextension-polyfill on npm / libraries.io](https://libraries.io/npm/webextension-polyfill) — version 0.12.0 confirmed current (HIGH confidence)
- [Firefox Extension Workshop: web-ext command reference](https://extensionworkshop.com/documentation/develop/web-ext-command-reference/) — --source-dir, --artifacts-dir, watch mode, build command (HIGH confidence — official Mozilla docs, updated December 2025)
- [web-ext on npm](https://www.npmjs.com/package/web-ext) — version 9.3.0 confirmed as latest (HIGH confidence)
- [Firefox Extension Workshop: MV3 migration guide](https://extensionworkshop.com/documentation/develop/manifest-v3-migration-guide/) — background scripts vs service workers, Firefox-specific manifest fields (HIGH confidence — official Mozilla docs)
- [MDN: browser_specific_settings](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings) — gecko.id requirement, strict_min_version, data_collection_permissions (November 2025 change) (HIGH confidence — official MDN)
- [MDN: Background scripts](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Background_scripts) — DOM access in Firefox event pages, fetch availability, event page lifecycle (HIGH confidence — official MDN)
- [MDN: Chrome incompatibilities](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Chrome_incompatibilities) — declarativeContent not in Firefox (HIGH confidence)
- [Mozilla Discourse: webextension-polyfill MV3](https://discourse.mozilla.org/t/how-to-use-browser-polyfill-for-mv3-cross-browser-web-extension/137839) — MV3 usage confirmation (MEDIUM confidence — community forum)
- [esbuild GitHub releases](https://github.com/evanw/esbuild/releases) — version 0.27.3 as latest (HIGH confidence)

---

*Stack research for: Patent Citation Tool v2.0 — esbuild Build Pipeline + Firefox Port*
*Researched: 2026-03-03*

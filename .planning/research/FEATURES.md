# Feature Research

**Domain:** Cross-browser extension build pipeline + Firefox port (v2.0 milestone)
**Researched:** 2026-03-03
**Confidence:** HIGH (MDN docs, Firefox Extension Workshop, esbuild official docs, web-ext docs, direct source analysis)

> **Scope note:** This document covers only NEW features for v2.0. Existing Chrome extension features
> (column:line citations, paragraph citations, silent Ctrl+C mode, USPTO fallback, KV cache, Shadow DOM
> UI, offscreen document, three-state icons, options page) are already shipped and not re-examined here.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features that must be present for the v2.0 milestone to be considered complete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| esbuild build script producing `dist/chrome/` and `dist/firefox/` | The entire milestone goal. Without this, shared code extraction is impossible and Firefox port has no build target. | MEDIUM | Single `build.mjs` script; two `esbuild.build()` calls (one per browser). Static assets (icons, HTML, manifest) need `fs.cpSync` or a copy step — esbuild does not handle non-JS assets natively. |
| Firefox manifest.json with `background.scripts` array | Firefox MV3 does not support `service_worker`. Must use `background.scripts: ["background.js"]` (and optionally keep `service_worker` for Chrome dual-compat). Firefox 121+ starts the background page regardless of whether `service_worker` is present. | LOW | Two separate manifests: `src/manifest.chrome.json` and `src/manifest.firefox.json`. Build script writes the correct one to each `dist/` folder. |
| `browser_specific_settings.gecko.id` in Firefox manifest | Required for Firefox MV3 signing. AMO will not accept a Firefox MV3 extension without a gecko ID. Format: email-style string (`tool@example.com`). | LOW | Add once; never needs to change. Must be present before any `web-ext sign` or AMO submission. |
| `web_accessible_resources` without `extension_ids` for Firefox | Chrome uses `extension_ids` to scope web-accessible resources. Firefox does not support `extension_ids` — it uses `matches` instead. Having `extension_ids` breaks Firefox (or generates errors). | LOW | Separate manifests solve this cleanly — no conditionals needed in code. |
| Remove `declarativeContent` permission from Firefox manifest | `chrome.declarativeContent` is a Chrome-only API (Firefox bug 1435864). The permission is not recognized by Firefox and causes install warnings. Firefox needs a `tabs.onActivated` + `tabs.onUpdated` replacement. | MEDIUM | Background script needs a Firefox code path: on tab activation/navigation, check if URL matches `patents.google.com/patent/US*` and call `browser.action.enable(tabId)` or `browser.action.disable(tabId)`. `browser.action.disable()` without a tabId works globally. Requires adding `"tabs"` permission to Firefox manifest. |
| Remove `offscreen` permission from Firefox manifest | `chrome.offscreen` is Chrome-only. Firefox has no equivalent API. The Firefox background script replaces the offscreen document entirely. | LOW | Simply omit the permission from Firefox manifest. The background script handles all the logic directly. |
| Shared code in `src/shared/` importable by all contexts | Currently: constants are copy-pasted in 3 places; matching functions are duplicated between `content/text-matcher.js` and `offscreen/offscreen.js`. esbuild bundles shared imports into each output file — no runtime module loading required. | MEDIUM | Move `MSG`, `STATUS`, `PATENT_TYPE` constants to `src/shared/constants.js` as ES module exports. Move matching functions to `src/shared/matcher.js`. esbuild bundles them into each entry point — content script gets its own copy, background script gets its copy. Zero shared globals required. |
| Firefox background script absorbing offscreen document logic | Firefox background scripts run as event pages (non-persistent), have full `window` and DOM API access, and can use `fetch`, `IndexedDB`, and `ArrayBuffer` directly. This is exactly what the Chrome offscreen document does. Move fetch + parse + lookup logic into the Firefox background script. | HIGH | The key risk: Firefox event page can be suspended. All state must be in `browser.storage.local` (same as Chrome) rather than memory. IndexedDB survives suspension. The PDF.js worker (`pdf.worker.mjs`) path may need to be adjusted since it's loaded relative to the background page's URL, not an offscreen document URL. |
| `web-ext run` developer loop | Firefox extension development without `web-ext run` requires manual temporary installation on every change. `web-ext run` auto-reloads on file changes. | LOW | Install `web-ext` as a devDependency. Point `--source-dir` at `dist/firefox/` after the esbuild build. Config file (`.web-ext-config.cjs`) eliminates repetitive CLI flags. |
| Cross-browser validation — 71-case corpus passes on both platforms | Without validated test results on Firefox, the Firefox port is unshipped. The existing Vitest corpus tests pure JS functions; Firefox-specific API behavior needs manual spot-check. | MEDIUM | Vitest tests already validate matching logic. Manual spot-check of 5-10 patents in Firefox covers API wiring. Full automated browser testing (Playwright-based) is out of scope for v2.0. |

### Differentiators (Competitive Advantage)

Features that go beyond the minimum, adding meaningful value.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Single source tree for both browsers | Maintainability. When an algorithm fix happens in `src/shared/matcher.js`, it applies to Chrome and Firefox simultaneously. No risk of the platforms diverging over time. | LOW (once build pipeline exists) | esbuild `bundle: true` handles tree-shaking. Shared code lives in `src/shared/`; platform-specific code lives in `src/chrome/` or `src/firefox/`. |
| `define` compile-time constants for browser detection | Enables dead-code elimination for platform-specific branches. `if (BROWSER === 'firefox')` compiles to `if (true)` or `if (false)` in each build — the dead branch is stripped entirely. | LOW | `esbuild.build({ define: { BROWSER: '"firefox"' } })`. Prefer this over runtime `navigator.userAgent` checks for behavior that is known at build time. |
| esbuild's speed: ~1s incremental builds | Fast iteration during Firefox background script development. No waiting for webpack 10-30s rebuilds. | LOW | No special configuration needed. esbuild is fast by default. |
| `web-ext lint` catching manifest errors before manual testing | Catches Chrome-API references in the Firefox manifest, missing required fields, and unknown permissions before wasting time loading the extension. | LOW | Run as part of `npm run build:firefox` or a separate `npm run lint:firefox` step. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| webextension-polyfill (`browser` namespace) | Seems like the "right" cross-browser approach. MDN recommends it. | This codebase already uses `chrome.*` everywhere. Chrome MV3 already supports promises on all async APIs (since Chrome 121). Adding the polyfill adds a dependency and forces a global rename of all API calls. The only real gap is the `chrome` vs `browser` namespace, which Firefox handles by supporting both. | Continue using `chrome.*`. Firefox supports `chrome.*` natively. No polyfill needed. If a specific API requires `browser.*`, call it directly in a Firefox-only file. |
| Single unified manifest.json with runtime browser detection | Fewer files to maintain. | A single manifest cannot satisfy both Chrome (`service_worker`, `declarativeContent`, `offscreen`, `extension_ids`) and Firefox (`scripts` array, no `declarativeContent`, no `offscreen`, no `extension_ids`, `browser_specific_settings.gecko.id`). Runtime detection in manifest JSON is impossible — JSON is not code. | Two manifests: `manifest.chrome.json` and `manifest.firefox.json`. Build script copies the correct one. The differences are large enough that a single manifest with feature detection would be unreadable and fragile. |
| Code splitting with esbuild (`splitting: true`) | Might seem like it avoids duplicating shared code across bundles. | Code splitting only works with ESM output (`format: 'esm'`). Content scripts loaded via `content_scripts` in the manifest cannot be ESM modules — they are classic scripts. Code splitting produces a chunk file that content scripts cannot import. | Use esbuild `bundle: true` with no splitting. Shared code is inlined into each entry point bundle. Yes, this duplicates the matching functions across the content script bundle and the background script bundle, but each bundle is self-contained and works correctly. For a ~10KB shared module, the duplication is negligible. |
| Playwright/Puppeteer automated browser testing | Full end-to-end Firefox test automation. | Very complex to set up for extensions. Requires special Firefox driver flags, fixture patent page serving, and extension loading via selenium-webdriver or playwright. Massive scope increase for v2.0. | Manual spot-check validation. The Vitest corpus tests cover all the algorithm logic. API wiring is validated manually in both browsers during development. |
| Safari extension port (MV3) | More platform coverage. | Safari MV3 has significant additional differences: requires Xcode project wrapping, App Store review, macOS certificate. Completely different distribution mechanism. Not worth exploring in v2.0. | Ship Chrome + Firefox. Revisit Safari if user demand exists after both platforms are stable. |
| Hot-reloading via `web-ext run --watch` chained to esbuild watch | Seamless dev loop where saving a file auto-rebuilds and auto-reloads Firefox. | `web-ext run` watches the `dist/` directory. esbuild `--watch` rebuilds `src/` to `dist/`. Chaining them requires a process manager or a custom build script. Works but adds dev-tooling complexity. | For v2.0: run esbuild build first, then `web-ext run`. Rebuild manually when testing specific changes. Explore watch chaining only if Firefox development becomes the primary workflow. |

---

## Feature Dependencies

```
esbuild build pipeline
    └──enables──> Shared code extraction (src/shared/)
                      └──enables──> Firefox background script (imports shared matcher)
                                        └──enables──> Firefox extension functional
                                                          └──enables──> Cross-browser validation

Firefox manifest (two-file approach)
    └──requires──> Remove declarativeContent (Chrome-only)
    └──requires──> Remove offscreen permission (Chrome-only)
    └──requires──> Add browser_specific_settings.gecko.id
    └──requires──> Fix web_accessible_resources (no extension_ids)
    └──requires──> Add tabs permission (for URL-based action enable/disable)

Firefox background script (event page)
    └──replaces──> offscreen document (fetch + parse + lookup)
    └──requires──> Shared code extraction (no more duplication)
    └──requires──> tabs.onActivated + tabs.onUpdated (replaces declarativeContent)

web-ext workflow
    └──requires──> esbuild build pipeline (needs dist/firefox/ to exist first)
```

### Dependency Notes

- **Shared code extraction requires esbuild build pipeline:** Without a bundler, sharing ES module code between content scripts (classic scripts) and the background script is impossible. esbuild's `bundle: true` inlines the shared module into each output file, solving the classic-vs-module problem.
- **Firefox background script requires shared code extraction:** The matching functions currently duplicated between `content/text-matcher.js` and `offscreen/offscreen.js` should be deduplicated BEFORE writing the Firefox background script. Otherwise the deduplication must be done twice.
- **declarativeContent removal requires `tabs` permission:** `browser.action.disable()/enable()` by tab requires reading the tab's URL. Firefox needs the `"tabs"` permission for this. Chrome's `declarativeContent` does not require `"tabs"`.
- **web-ext validation requires correct manifest:** `web-ext lint` will catch Chrome-specific permissions (declarativeContent, offscreen) left in the Firefox manifest. Run lint early to find these gaps.

---

## MVP Definition

### v2.0 Launch With

The minimum for this milestone to be considered done:

- [ ] esbuild build script (`scripts/build.mjs`) produces working `dist/chrome/` and `dist/firefox/` — Chrome build must be regression-free
- [ ] Shared constants in `src/shared/constants.js` — eliminate the three copies
- [ ] Shared matching functions in `src/shared/matcher.js` — eliminate the `offscreen/offscreen.js` duplication
- [ ] Firefox manifest (`src/manifest.firefox.json`) with correct permissions, gecko ID, `background.scripts`, and no Chrome-only APIs
- [ ] Firefox background script that handles fetch, parse, cache, and citation lookup (absorbs offscreen document responsibilities)
- [ ] `tabs.onActivated` + `tabs.onUpdated` logic replacing `declarativeContent` in Firefox background
- [ ] Both Chrome and Firefox pass manual spot-check on 5+ real patents from the test corpus
- [ ] `web-ext lint` passes cleanly on the Firefox build

### Add After v2.0 (Future)

- [ ] Firefox AMO listing and submission — requires screenshots, description, review queue
- [ ] `web-ext run --watch` + esbuild `--watch` chained dev loop — quality of life
- [ ] CI that runs `web-ext lint` on every push
- [ ] Automated cross-browser testing harness (Playwright) — high effort, low v2.0 priority

### Explicitly Deferred

- [ ] webextension-polyfill adoption — not needed; `chrome.*` works in Firefox natively
- [ ] Safari port — entirely different distribution mechanism, out of scope
- [ ] Code splitting — incompatible with content scripts as classic scripts

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| esbuild build pipeline (dist/chrome + dist/firefox) | HIGH (foundational) | MEDIUM | P1 |
| Shared constants + matcher deduplication | HIGH (removes tech debt that blocks Firefox) | MEDIUM | P1 |
| Firefox manifest (correct permissions + gecko ID) | HIGH (Firefox cannot load without it) | LOW | P1 |
| Firefox background script (absorb offscreen) | HIGH (core Firefox functionality) | HIGH | P1 |
| tabs.onActivated/onUpdated replacing declarativeContent | HIGH (icon behavior must work) | MEDIUM | P1 |
| web-ext lint validation | MEDIUM (catches errors before manual test) | LOW | P2 |
| web-ext run developer loop | MEDIUM (faster iteration) | LOW | P2 |
| Cross-browser corpus validation | MEDIUM (confidence in Firefox accuracy) | LOW (manual spot-check) | P2 |
| define constants for browser detection | LOW (nice DX, not required) | LOW | P3 |
| Chained esbuild watch + web-ext watch | LOW (developer comfort) | MEDIUM | P3 |

**Priority key:**
- P1: Must have for v2.0 milestone completion
- P2: Should have, add before shipping Firefox to AMO
- P3: Nice to have, future iteration

---

## Key Behavioral Differences: Chrome vs Firefox

These are the concrete behavioral differences that affect implementation decisions, not just manifest changes.

### Background Script Execution Model

| Aspect | Chrome (service worker) | Firefox (event page) |
|--------|------------------------|----------------------|
| Global scope | None (`self`, not `window`) | Full `window` + DOM APIs |
| DOM APIs (`document`, `DOMParser`) | Not available | Available |
| `fetch` | Available | Available |
| `IndexedDB` | Available | Available |
| `ArrayBuffer` / Blobs | Available | Available |
| Persistence | Terminated after ~30s idle | Non-persistent (can suspend) but longer-lived |
| ES modules | `"type": "module"` in manifest background | `"type": "module"` supported |
| State survival on restart | Must use `chrome.storage` | Must use `browser.storage` (same pattern) |

Conclusion: The Chrome offscreen document pattern was required because Chrome service workers lack DOM APIs needed for PDF.js initialization. Firefox event pages have full DOM access, so PDF.js can run directly in the background script. The architecture is simpler in Firefox.

### declarativeContent Replacement

Chrome uses `declarativeContent` to show the toolbar icon only on `patents.google.com/patent/US*` URLs. Firefox needs:

```js
// Firefox-only: enable action only on matching tabs
browser.action.disable(); // global disable on install

browser.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await browser.tabs.get(tabId);
  const matches = tab.url?.startsWith('https://patents.google.com/patent/US');
  matches ? browser.action.enable(tabId) : browser.action.disable(tabId);
});

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    const matches = tab.url?.startsWith('https://patents.google.com/patent/US');
    matches ? browser.action.enable(tabId) : browser.action.disable(tabId);
  }
});
```

Requires `"tabs"` permission in Firefox manifest. This permission is not needed in Chrome because `declarativeContent` handles URL filtering declaratively without tab URL access.

### Clipboard (Silent Ctrl+C Mode)

The existing silent mode intercepts the `copy` event in the content script and modifies `clipboardData`. This approach is identical in Firefox:

- `clipboardWrite` permission: works in content scripts on `https:` pages in both Chrome and Firefox
- `copy` event handler with `e.clipboardData.setData()`: works identically in both browsers
- Google Patents is always `https://patents.google.com` — no `http:` exposure

No changes needed for clipboard behavior. (MEDIUM confidence — verified against MDN clipboard docs.)

### `chrome.action` vs `browser.action`

Firefox supports both `chrome.action` and `browser.action` namespaces. The existing code using `chrome.action.setIcon()`, `chrome.action.setBadgeText()`, etc. works in Firefox without changes. This is the key reason webextension-polyfill is not needed.

### `web_accessible_resources` Format

Chrome manifest: uses `extension_ids` to scope who can access web-accessible resources.
Firefox manifest: uses `matches` (URL patterns) instead.

```json
// Chrome manifest.chrome.json
"web_accessible_resources": [{
  "resources": ["lib/pdf.worker.mjs"],
  "matches": ["<all_urls>"],
  "extension_ids": []
}]

// Firefox manifest.firefox.json
"web_accessible_resources": [{
  "resources": ["lib/pdf.worker.mjs"],
  "matches": ["<all_urls>"]
}]
```

### PDF.js Worker in Firefox Background Script

The Chrome offscreen document loads `pdf.worker.mjs` as a web-accessible resource, referenced as `chrome.runtime.getURL('lib/pdf.worker.mjs')`. In Firefox, the background script is a page context with `window`, so the same `browser.runtime.getURL('lib/pdf.worker.mjs')` call works identically. The `pdf.worker.mjs` file must still be present in `dist/firefox/lib/` and listed as a `web_accessible_resource` in the Firefox manifest.

One risk: PDF.js v5 uses WebAssembly for some operations. Firefox MV3 requires `"wasm-unsafe-eval"` in the content security policy if WASM is invoked. The existing `offscreen.html` may have an implicit CSP that covers this; the Firefox background page's default CSP must be checked. (LOW confidence — needs empirical testing during development.)

---

## esbuild Build Pipeline: Concrete Feature Requirements

### Entry Points (per browser build)

```
Content script bundle:     src/content/content-script.js   → dist/{browser}/content/content-script.js
Background script bundle:  src/{browser}/background.js     → dist/{browser}/background/background.js
Offscreen script bundle:   src/offscreen/offscreen.js      → dist/chrome/offscreen/offscreen.js (Chrome only)
Popup script bundle:       src/popup/popup.js              → dist/{browser}/popup/popup.js (if popup has JS)
```

### esbuild Configuration Requirements

- `bundle: true` — inline all imports; content scripts cannot use dynamic `import()`
- `format: 'iife'` for content scripts — prevents global scope pollution on Google Patents page
- `format: 'esm'` for background script — background supports modules with `"type": "module"` in manifest
- `define: { BROWSER: '"chrome"' }` or `'"firefox"'` — compile-time browser detection
- `outdir` pointed at `dist/chrome/` or `dist/firefox/`
- Static asset copy (manifest, icons, HTML, `lib/pdf.worker.mjs`) must be done with `fs.cpSync` or a copy plugin — esbuild does not copy non-JS assets

### What esbuild Does NOT Handle (Requires Custom Build Script Steps)

- Copying `manifest.json` (browser-specific version)
- Copying icon PNG files from `src/icons/` to `dist/{browser}/icons/`
- Copying HTML files (`popup.html`, `options.html`, `offscreen.html`) to output dirs
- Copying `lib/pdf.worker.mjs` to `dist/{browser}/lib/`
- Generating the Firefox-specific manifest from `src/manifest.firefox.json`

The build script (`scripts/build.mjs`) must handle all of these as explicit `fs.cpSync` calls after the `esbuild.build()` call. No copy plugin needed — Node's `fs.cpSync` is sufficient.

---

## web-ext CLI: Concrete Feature Requirements

### Commands needed for v2.0

| Command | Purpose | When Used |
|---------|---------|-----------|
| `web-ext lint --source-dir dist/firefox/` | Validate manifest and detect Chrome-specific APIs in Firefox build | After every manifest change; in CI |
| `web-ext run --source-dir dist/firefox/ --firefox-profile dev` | Load extension in Firefox for manual testing | During Firefox development |
| `web-ext build --source-dir dist/firefox/ --artifacts-dir artifacts/` | Package `.xpi` for distribution | Before AMO submission |

### Configuration file (`.web-ext-config.cjs`)

Recommended to avoid repetitive `--source-dir dist/firefox/` on every command:

```js
module.exports = {
  sourceDir: './dist/firefox',
  artifactsDir: './artifacts',
};
```

### web-ext does NOT replace esbuild

`web-ext` packages and runs a pre-built extension directory. It does not bundle JavaScript. The build pipeline is: `esbuild` first → produces `dist/firefox/` → `web-ext` operates on `dist/firefox/`. This is a common misconception worth noting explicitly.

---

## Sources

**HIGH confidence (official docs):**
- [MDN: background manifest key](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background) — Firefox does not support `service_worker`; `scripts` array required
- [MDN: Background scripts](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Background_scripts) — Firefox event pages have full `window` + DOM APIs
- [MDN: Chrome incompatibilities](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Chrome_incompatibilities) — `declarativeContent` not implemented (bug 1435864); `offscreen` not listed in Firefox APIs
- [MDN: Interact with the clipboard](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Interact_with_the_clipboard) — `clipboardWrite` works in content scripts on `https:` in Firefox
- [MDN: action.disable()](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/action/disable) — supports global (no tabId) and per-tab disable
- [esbuild API docs](https://esbuild.github.io/api/) — `define`, `bundle`, `format`, `entryPoints`, `outdir`
- [Firefox Extension Workshop: web-ext command reference](https://extensionworkshop.com/documentation/develop/web-ext-command-reference/)
- [Firefox Extension Workshop: MV3 migration guide](https://extensionworkshop.com/documentation/develop/manifest-v3-migration-guide/)
- [MDN: browser_specific_settings](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings) — gecko.id required for Firefox MV3 signing

**MEDIUM confidence (verified against multiple sources):**
- [How to port a Chrome MV3 extension to Firefox](https://decembergarnetsmith.com/blog/2024/05/10/how-to-port-an-mv3-chrome-extension-to-firefox/) — corroborates manifest changes
- [1Password esbuild migration](https://1password.com/blog/new-extension-build-system/) — confirms esbuild feasibility for extension builds; 90% build time reduction

---

*Feature research for: esbuild build pipeline + Firefox port (v2.0 milestone)*
*Researched: 2026-03-03*

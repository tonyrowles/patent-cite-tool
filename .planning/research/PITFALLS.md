# Pitfalls Research

**Domain:** Adding esbuild build pipeline and Firefox extension support to an existing Chrome MV3 extension
**Researched:** 2026-03-03
**Confidence:** HIGH (Firefox API gaps verified against MDN official docs + Firefox Extension Workshop) / HIGH (esbuild behavior verified against official docs + GitHub issues)

---

## Critical Pitfalls

### Pitfall 1: declarativeContent API Has No Firefox Equivalent

**What goes wrong:**
The Chrome service worker uses `chrome.declarativeContent.onPageChanged` to enable the toolbar icon only on `patents.google.com/patent/US*` pages. Firefox has never implemented `declarativeContent` and has no planned timeline to do so ([Firefox bug 1435864](https://bugzil.la/1435864)). When the Firefox background script runs `chrome.declarativeContent.onPageChanged.addRules(...)`, it throws `TypeError: Cannot read properties of undefined` or silently does nothing, and the icon activation logic never fires. On Firefox, the icon stays enabled on all pages or stays disabled on all pages — depending on whether `chrome.action.disable()` was called.

**Why it happens:**
Developers port the Chrome background script wholesale, assuming `declarativeContent` is a standard WebExtensions API. It is not. It is Chrome-only. Firefox's WebExtensions API compatibility tables list it as unsupported with no alternative mapping.

**How to avoid:**
Replace the `declarativeContent` approach in the Firefox background script entirely. Use a content script URL match pattern (`"matches": ["https://patents.google.com/patent/US*"]`) to scope injection, and handle icon state inside the content script by sending a message to the background when a patent page is detected. The background script then calls `browser.action.enable(tabId)` on receipt. This is the established cross-browser pattern. The `chrome.action.enable()` / `chrome.action.disable()` API with a `tabId` argument is supported in Firefox.

**Warning signs:**
- Service worker contains `chrome.declarativeContent` anywhere
- Firefox background script logs `TypeError` or `Cannot read properties of undefined` on install
- Icon state never changes in Firefox (always enabled or always disabled regardless of page URL)
- Test: install extension in Firefox, navigate to a non-patent page — if the icon shows as active, `declarativeContent` replacement is missing

**Phase to address:**
Firefox Background Script phase — this is the single most critical API gap. It must be resolved before any Firefox testing is meaningful.

---

### Pitfall 2: offscreen API Does Not Exist in Firefox — PDF.js Must Run in Background Script

**What goes wrong:**
The entire PDF fetch, parse, and IndexedDB cache workflow lives in `src/offscreen/offscreen.js`, which is loaded by Chrome's offscreen document API. Firefox has no offscreen API and no plans to implement it. When the Firefox background script calls `browser.offscreen.createDocument(...)`, it throws `TypeError: browser.offscreen is undefined`. The entire PDF pipeline — fetching, parsing via PDF.js, building position maps, storing in IndexedDB — becomes completely inoperative.

**Why it happens:**
The offscreen document API was introduced in Chrome MV3 specifically because service workers lack DOM access. Firefox's event page background script does have DOM access (it is not a service worker), making offscreen documents unnecessary on Firefox. Developers port the Chrome manifest pattern and assume the `offscreen` permission and API exist everywhere.

**How to avoid:**
For Firefox, move all offscreen document logic directly into the background event page. The Firefox background script can import PDF.js, call `fetch()`, open IndexedDB, and run the full parse pipeline directly — none of this requires a separate document context. The build pipeline must produce two separate background scripts: `dist/chrome/background/service-worker.js` (which orchestrates offscreen creation) and `dist/firefox/background/background.js` (which contains the offscreen logic inlined). Shared parsing modules (`pdf-parser.js`, `position-map-builder.js`) should live in `src/shared/` and be imported by both.

**Warning signs:**
- Firefox manifest contains `"offscreen"` in the `permissions` array — this will cause Firefox validation warnings
- `browser.offscreen` is referenced anywhere in Firefox-targeted code
- PDF.js import (`import * as pdfjsLib from '../lib/pdf.mjs'`) exists only in `offscreen.js` with no Firefox background equivalent
- Citation lookups always fail in Firefox with "lookup-failed" error (offscreen never creates, messages never route)

**Phase to address:**
Firefox Background Script phase — the entire offscreen logic must be rehosted before PDF citations work on Firefox at all.

---

### Pitfall 3: Chrome Manifest Format Is Rejected or Silently Broken by Firefox

**What goes wrong:**
The current `manifest.json` uses Chrome-specific keys that either cause Firefox validation errors at load time or silently corrupt behavior. Key conflicts:
- `"background": { "service_worker": "...", "type": "module" }` — Firefox requires `"background": { "scripts": ["..."] }` or `"background": { "page": "..." }` for MV3 event pages. From Firefox 121+, Firefox will start the background page even when `service_worker` is present, but the service worker entry is ignored — meaning the Chrome service worker bundle is never executed unless `scripts` is also specified correctly.
- `"permissions": ["offscreen", "declarativeContent"]` — both are Chrome-only. Firefox warns on unknown permissions; some cause silent rejection of the permission block in older Firefox versions.
- `browser_specific_settings.gecko.id` is absent — Firefox requires this for `storage.sync` to function (sync data is keyed by add-on ID). Without it, `browser.storage.sync` silently fails to sync across devices in production.

**Why it happens:**
A single `manifest.json` cannot cleanly serve both Chrome and Firefox. The natural shortcut of shipping one manifest causes divergence: Chrome ignores unknown Firefox keys; Firefox accepts but may ignore some Chrome-only keys. The difference between "ignores" and "silently corrupts behavior" is impossible to discover without per-browser testing.

**How to avoid:**
Maintain separate manifests: `src/manifest.chrome.json` and `src/manifest.firefox.json`. The esbuild pipeline copies the correct manifest into `dist/chrome/` and `dist/firefox/` respectively. The Firefox manifest must include:
```json
"background": { "scripts": ["background/background.js"] },
"browser_specific_settings": { "gecko": { "id": "patent-cite@yourname.dev", "strict_min_version": "121.0" } }
```
and must omit `offscreen` and `declarativeContent` from the `permissions` array.

**Warning signs:**
- Single `manifest.json` used for both Chrome and Firefox builds without transformation
- Firefox build directory contains `"service_worker"` key in manifest
- `storage.sync` appears to work locally but fails to sync across Firefox devices (missing gecko ID)
- `web-ext lint` reports warnings for unknown permissions (`offscreen`, `declarativeContent`)

**Phase to address:**
Build Pipeline Setup phase — manifests must be split before any Firefox packaging occurs.

---

### Pitfall 4: esbuild IIFE vs ESM Format — Content Scripts Cannot Use ESM

**What goes wrong:**
Content scripts loaded via `content_scripts` in the manifest cannot be ES modules. If esbuild bundles them as `format: 'esm'` (producing `import`/`export` syntax), Chrome and Firefox silently refuse to inject them (no error, extension appears to load, but content script never runs). If esbuild uses code splitting (`splitting: true`) with `format: 'esm'` to share code between entry points, it generates chunk files with dynamic `import()` calls that content scripts cannot resolve. Citations never appear for any user.

**Why it happens:**
The natural instinct when bundling shared code across multiple entry points is to enable `splitting: true` with `format: 'esm'`. This is correct for background service workers (which support module-type in Chrome via `"type": "module"`) but wrong for content scripts. esbuild does not warn about this mismatch — it produces the output without error and the failure only appears at extension load time.

**How to avoid:**
Use separate esbuild build configurations per entry point type:
- Content scripts: `format: 'iife'`, `bundle: true`, `splitting: false` — all shared code is inlined into a single IIFE bundle. This means `text-matcher.js`, `paragraph-finder.js`, `citation-ui.js`, and any shared utilities are merged into one `content-script.bundle.js`.
- Background service worker (Chrome): `format: 'esm'`, `bundle: true` — Chrome service workers support ESM when `"type": "module"` is declared in the manifest.
- Background event page (Firefox): `format: 'iife'` or `format: 'esm'` with `bundle: true` (Firefox event pages loaded via `scripts` array support ESM if declared as module type, but IIFE is safer for compatibility).
- Offscreen document (Chrome only): `format: 'esm'`, `bundle: true` — loaded via `<script type="module">` in `offscreen.html`.

**Warning signs:**
- Content script entry point configured with `format: 'esm'` or `splitting: true`
- Browser console shows no errors but citation UI never appears
- esbuild output for content script contains `import` statements or `export {}` at top level
- Content script bundle file size is suspiciously small (only the entry point, shared code not inlined)

**Phase to address:**
Build Pipeline Setup phase — format configuration must be verified before any other build work.

---

### Pitfall 5: esbuild Path Flattening Breaks Extension Directory Structure

**What goes wrong:**
esbuild with `outdir: 'dist/chrome'` and multiple entry points from different source subdirectories (`src/background/service-worker.js`, `src/content/content-script.js`, etc.) uses `outbase` to determine how to replicate the source directory structure. If `outbase` is not set, esbuild uses the lowest common ancestor of all entry point paths — which may be `src/` or even the repo root. This produces output paths like `dist/chrome/background/service-worker.js` correctly, but may also produce unexpected paths for shared modules or flatten nested structures. Manifest references to `background/service-worker.js` break if esbuild emits to a different path.

**Why it happens:**
esbuild's path behavior with multiple entry points is not intuitive. The `outbase` option defaults to the lowest common ancestor directory of all entry points. Adding or removing an entry point can silently change `outbase` and shift all output paths, breaking manifest references.

**How to avoid:**
Explicitly set `outbase: 'src'` in the esbuild configuration. This ensures that `src/background/service-worker.js` always emits to `dist/chrome/background/service-worker.js` regardless of what other entry points are added. Verify the output structure against the manifest paths after every change to the entry point list.

**Warning signs:**
- esbuild emits files to unexpected paths (e.g., `dist/chrome/service-worker.js` instead of `dist/chrome/background/service-worker.js`)
- Extension fails to load with "Could not load background script" error after build
- Manifest references to `background/service-worker.js` but `dist/chrome/` only contains `service-worker.js` at root

**Phase to address:**
Build Pipeline Setup phase — verify the full output tree against manifest paths before any source migration.

---

### Pitfall 6: Module Type Mismatch Between Chrome Service Worker and Firefox Event Page

**What goes wrong:**
The current Chrome service worker is declared as `"type": "module"` in the manifest, allowing it to use ES `import` statements. When porting to Firefox, the background event page is loaded via `"scripts": ["background/background.js"]` in the manifest. If the Firefox background script is an ES module bundle that contains top-level `import` or uses `export`, it fails unless the manifest includes `"background": { "type": "module" }`. In Firefox, `"type": "module"` in the background block is supported but the behavior differs: the script must be a single file (no importScripts), and Firefox's module service worker support is incomplete as of early 2026. Using `format: 'iife'` and `bundle: true` for the Firefox background avoids this entirely by inlining all imports.

**Why it happens:**
Chrome's `"type": "module"` for service workers enables native ESM. Firefox's equivalent is fragile. Developers assume the same `type: module` pattern works cross-browser when it does not reliably.

**How to avoid:**
For the Firefox background script: use esbuild with `format: 'iife'` (or `format: 'esm'` only if `"type": "module"` is explicitly tested on Firefox). IIFE is the safe default that works without any manifest type declaration. The Firefox manifest `"background": { "scripts": ["background/background.js"] }` does not require a type field and IIFE output works directly.

**Warning signs:**
- Firefox background script bundle contains top-level `import` or `export` without `"type": "module"` in manifest background block
- Firefox console shows `SyntaxError: import declarations may only appear at top level of a module` in background script
- Background script never loads in Firefox (silent failure, no message listeners registered)

**Phase to address:**
Build Pipeline Setup phase — format choice must be validated before shared code extraction begins.

---

### Pitfall 7: Shared Code Duplication In Bundled Output Is Intentional for Content Scripts

**What goes wrong:**
When esbuild bundles the content script as IIFE (required, as above), all shared code is inlined. If the background script and content script both import from `src/shared/`, the shared code appears in both bundles. Developers see this as waste and attempt to use `splitting: true` or dynamic imports to deduplicate. This breaks content scripts (see Pitfall 4). Alternatively, they attempt to load shared code as a separate file listed in `content_scripts.js` array — which works but requires the file to not use `export` statements (classic script restrictions).

**Why it happens:**
The correct architecture for shared code in bundled extensions is: bundle-time deduplication for content scripts (inlined IIFE), runtime deduplication via ESM imports for background/offscreen. These are different strategies. Attempting to apply the ESM sharing strategy to content scripts causes failures.

**How to avoid:**
Accept that shared code is duplicated in the content script bundle. The shared modules (`text-matcher`, `paragraph-finder`, `constants`) are small relative to PDF.js — duplication overhead is negligible. If bundle size matters, configure esbuild `minify: true` for production builds. Do not attempt runtime deduplication between content script and background script.

**Warning signs:**
- Build config uses `splitting: true` for an entry point that includes content scripts
- Content script manifest entry lists multiple `.js` files that use `export` syntax

**Phase to address:**
Build Pipeline Setup phase — architecture decision must be made before shared code extraction begins.

---

### Pitfall 8: Regression When Moving From Multi-File Classic Scripts to Single Bundled File

**What goes wrong:**
The current manifest loads content scripts as an ordered array: `["shared/constants.js", "content/text-matcher.js", "content/paragraph-finder.js", "content/citation-ui.js", "content/content-script.js"]`. Each file executes as a classic script and shares globals. After bundling, a single `content-script.bundle.js` replaces all five files. The IIFE wraps everything, so top-level variables that were previously globals become local to the IIFE. Any code path that relied on cross-file global access (e.g., `window.MSG` or bare `MSG` from `constants.js`) now fails with `ReferenceError: MSG is not defined` inside the bundle.

**Why it happens:**
The current architecture uses a "dual-context constants" pattern (noted as a known `⚠️ Revisit` item in PROJECT.md). `constants.js` assigns to `const MSG = {...}` as a classic script, making it a global in Chrome. The other classic scripts read `MSG` as an implicit global. When esbuild bundles them together, esbuild treats them as modules and the IIFE wrapping makes `MSG` a local variable — but only if esbuild uses proper module semantics. If the source files have no `export`/`import` statements, esbuild treats them as scripts and may not wrap them, causing different behavior. The exact behavior depends on whether esbuild detects the files as modules or scripts.

**How to avoid:**
During shared code extraction (before bundling), explicitly convert all shared constants and utilities to proper ES modules with `export`. Import them in every file that needs them. After this conversion, esbuild correctly bundles them as modules and the IIFE wrapping is clean. Run the full 71-case test corpus against the bundled build before shipping. The migration sequence must be: (1) convert to ES modules with explicit imports, (2) verify tests pass with direct node execution, (3) bundle with esbuild, (4) verify tests pass against bundled output.

**Warning signs:**
- `ReferenceError` in browser console for `MSG`, `STATUS`, `PATENT_TYPE`, or other constants after bundling
- Content script appears to load (no parse errors) but citation UI never appears
- Test harness passes against source files but fails against bundled output
- Background service worker duplicates constants inline (the current `service-worker.js` does this — a hint about the fragility)

**Phase to address:**
Shared Code Extraction phase — this phase must resolve the dual-context pattern before the build pipeline processes anything.

---

### Pitfall 9: Firefox IndexedDB Silently Fails in "Never Remember History" Mode

**What goes wrong:**
Firefox users with "Privacy & Security → History → Never Remember History" enabled (which is equivalent to permanent private browsing mode) experience silent IndexedDB failures. The `indexedDB.open()` call either throws or enters an encrypted session-only mode where data is lost on browser restart. In this mode, parsed patent position maps are stored successfully within a session but disappear on every restart. Users see the extension "re-parsing" every patent they visit, and blame the extension for being broken.

**Why it happens:**
Firefox's `IndexedDB` implementation is tied to cookie/storage acceptance settings. When persistent storage is disabled by the user's privacy settings, extension IndexedDB databases are either blocked or use volatile encrypted storage. This affects Chrome and Firefox differently — Chrome's extension IndexedDB is more isolated from these settings.

**How to avoid:**
Wrap all IndexedDB open calls in a try/catch. If `indexedDB.open()` fails or throws, fall back to in-memory storage for the session and log a warning. Do not crash the extension. Add a graceful degradation path: if IndexedDB is unavailable, proceed without a local cache (the Cloudflare KV cache still works). This degradation is already partially handled by the `CHECK_CACHE` / `CACHE_MISS` flow — ensure the fallthrough reaches the PDF fetch pipeline even when IndexedDB is unavailable. Consider detecting the condition on first use and storing a flag in `browser.storage.local` (which is more resilient than IndexedDB in these configurations).

**Warning signs:**
- Extension works for one session in Firefox then appears to "forget" parsed patents on restart
- `indexedDB.open()` call in offscreen/background throws `DOMException` or `SecurityError` in Firefox
- Extension behavior differs between Firefox normal mode and Firefox private browsing mode
- Firefox user reports "always shows parsing indicator" even for patents visited before

**Phase to address:**
Firefox Background Script phase — IndexedDB error handling must be verified on Firefox with privacy settings enabled.

---

### Pitfall 10: PDF.js Worker Loading Requires web_accessible_resources — Firefox UUID Makes It Fragile

**What goes wrong:**
PDF.js requires a worker file (`pdf.worker.mjs`) that is loaded from the extension package. The current manifest correctly lists this in `web_accessible_resources`. However, Firefox uses random UUIDs for extension resource URLs (`moz-extension://«random-UUID»/lib/pdf.worker.mjs`) that change per Firefox installation (and may change on update). Chrome uses a stable extension ID (`chrome-extension://«id»/lib/pdf.worker.mjs`). If the PDF.js worker URL is constructed from `chrome.runtime.getURL('lib/pdf.worker.mjs')`, this works correctly on both browsers — `browser.runtime.getURL()` returns the correct browser-specific URL. But if the URL is hardcoded anywhere, it breaks on Firefox.

Additionally, Firefox's random UUID prevents adding the extension URL to any external server's CSP policy — this is a known limitation but does not affect this extension since the worker is loaded locally.

**Why it happens:**
PDF.js worker loading often involves setting `pdfjsLib.GlobalWorkerOptions.workerSrc`. Developers sometimes hardcode the path or use a relative path. In extension contexts, relative paths are not valid for worker loading — the full `moz-extension://` or `chrome-extension://` URL must be used. The correct pattern is `pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdf.worker.mjs')` (the `chrome` namespace works in Firefox too via compatibility shim).

**How to avoid:**
Always use `chrome.runtime.getURL('lib/pdf.worker.mjs')` (or `browser.runtime.getURL`) to set `workerSrc`. Never hardcode extension resource paths. Verify that `lib/pdf.worker.mjs` is included in `web_accessible_resources` in both the Chrome and Firefox manifests. After bundling, verify the worker file is present at the declared path in the dist output.

**Warning signs:**
- PDF.js throws `InvalidPDFException` or fails to initialize worker in Firefox
- Browser console shows "Failed to load worker" or `moz-extension://` URL 404 in Firefox
- `GlobalWorkerOptions.workerSrc` is set to a relative path or hardcoded string
- `lib/pdf.worker.mjs` absent from `web_accessible_resources` in Firefox manifest

**Phase to address:**
Firefox Background Script phase — verify PDF.js worker initialization works after background script consolidation.

---

### Pitfall 11: Firefox storage.sync Requires browser_specific_settings.gecko.id

**What goes wrong:**
The extension uses `chrome.storage.sync` for user settings (trigger mode, display mode, patent number prefix). On Firefox, `browser.storage.sync` silently fails to sync data across devices if the extension does not have a `browser_specific_settings.gecko.id` declared in the manifest. The API calls succeed locally (data is written and read within the same Firefox instance) but synchronization never occurs. This is a silent failure — no error is thrown.

**Why it happens:**
Firefox's sync storage implementation keys data to the add-on ID. Without a stable ID declared in `browser_specific_settings`, Firefox cannot associate the data with a specific extension for sync purposes. Chrome uses the extension's CRX ID which is always present. Firefox add-on IDs must be explicitly declared for unsigned or development extensions.

**How to avoid:**
Add to the Firefox manifest:
```json
"browser_specific_settings": {
  "gecko": {
    "id": "patent-cite-tool@yourname.dev",
    "strict_min_version": "121.0"
  }
}
```
Use a real email-format string or any string up to 80 characters. This ID also determines the extension's UUID on Firefox — choose it before publishing and do not change it, as changing the ID breaks existing storage.sync data for all users.

**Warning signs:**
- Settings saved in Firefox do not appear on a second Firefox installation after sync
- `browser.storage.sync.set()` succeeds but `browser.storage.sync.get()` returns defaults after browser restart
- Firefox manifest does not contain `browser_specific_settings` key
- `web-ext lint` warns about missing add-on ID for signed extensions

**Phase to address:**
Firefox manifest split phase — the gecko ID must be chosen before any Firefox release.

---

### Pitfall 12: Bundled Output Breaks Vitest Tests That Import Source Files Directly

**What goes wrong:**
The existing Vitest test harness imports source files directly (e.g., `import { matchAndCite } from '../src/content/text-matcher.js'`). After the shared code extraction refactor, these imports change paths (modules move to `src/shared/`). After the esbuild build step, tests that relied on source file import paths break if the test harness is reconfigured to test bundled output instead of source. The 71-case golden baseline must continue to pass throughout all refactoring stages. If tests are broken during refactoring and only fixed at the end, intermediate regressions go undetected.

**Why it happens:**
Refactoring module boundaries (moving files, adding `export` statements, changing import paths) is done as a single large PR. Tests are not run between individual moves. By the time the refactor is complete, many small path breaks have accumulated and it is impossible to identify which individual change introduced a regression.

**How to avoid:**
Use a "strangler fig" migration: move one module at a time and run the full test harness after each move. The test harness must continue testing source files (not bundled output) throughout refactoring — bundled output testing is a separate concern. Add a smoke test that loads the bundled content script in a jsdom environment and verifies that `chrome.runtime.sendMessage` is called when `GENERATE_CITATION` is triggered. Keep the 71-case harness as the primary regression gate: if it passes before and after each commit, the refactor is safe.

**Warning signs:**
- Multiple source files moved in a single commit without running tests between moves
- Vitest shows `Cannot find module '../src/content/text-matcher.js'` after refactoring
- Test harness is temporarily disabled or marked `.skip` "to fix later"
- 71-case golden outputs change unexpectedly during refactoring (path or logic changed accidentally)

**Phase to address:**
Shared Code Extraction phase — establish the test-after-each-move discipline as the first rule of the refactor.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Single manifest for Chrome and Firefox with Chrome-specific keys | Simpler to maintain | Firefox silently ignores or errors on Chrome-only keys; `declarativeContent` and `offscreen` cause failures | Never — manifests must be split. The cost of debugging silent Firefox failures far exceeds the split-manifest maintenance cost |
| Keeping duplicate constants in service-worker.js vs shared/constants.js | Avoids refactoring the dual-context pattern | Bug fixes to message types must be applied in two places; already caused issues (noted in PROJECT.md) | Never for v2.0 — shared code extraction is a v2.0 goal |
| Using `chrome` namespace directly instead of `browser` polyfill | No extra dependency | Firefox requires explicit chrome→browser shim or must be tested that chrome works; subtle behavioral differences around promises | Acceptable IF Chrome MV3 is the primary target and Firefox compatibility is verified manually. For long-term maintenance, prefer the polyfill |
| Skipping source maps in bundled output | Faster build | Debugging Firefox background script becomes very difficult; Firefox has known issues finding extension source maps | Acceptable for release builds; unacceptable for development builds — always generate source maps in dev mode |
| Testing only Chrome build after shared code extraction | Faster iteration | Firefox-specific failures (event page lifecycle, IndexedDB, missing APIs) are caught only at Firefox testing phase, not during extraction | Unacceptable — run Firefox smoke test after each extraction step |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Firefox extension + storage.sync | Using storage.sync without gecko ID in manifest | Add `browser_specific_settings.gecko.id` to Firefox manifest before first sync storage use |
| esbuild + multiple manifests | Copying manifest into dist as-is | Use build script to select and copy correct manifest (`manifest.chrome.json` → `dist/chrome/manifest.json`, `manifest.firefox.json` → `dist/firefox/manifest.json`) |
| PDF.js worker in Firefox background | Assuming workerSrc path resolves the same as Chrome | Always use `chrome.runtime.getURL('lib/pdf.worker.mjs')` — works in both browsers; never hardcode |
| Cloudflare Worker proxy (pct.tonyrowles.com) | Assuming Firefox uses same fetch behavior as Chrome offscreen | Firefox background script fetch works identically — no CORS differences for extension contexts. But verify the CORS headers on the Cloudflare Worker allow `moz-extension://` origins if checking Origin header |
| esbuild + content scripts | Using `splitting: true` for all entry points uniformly | Configure content script entry points separately with `splitting: false`, `format: 'iife'` |
| Firefox + clipboardWrite | Assuming clipboard API works on http pages | `navigator.clipboard.writeText()` is restricted to HTTPS pages in both browsers; Google Patents is HTTPS so this is safe — but document the HTTPS dependency |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Inlining PDF.js into content script bundle | Content script bundle becomes 1MB+, injected on every Google Patents page load | PDF.js must NOT be a content script dependency — it belongs only in the background/offscreen context. Verify the content script entry point does not transitively import from `lib/pdf.mjs` | At the moment esbuild's dependency graph traversal pulls in pdf.mjs through a shared import |
| Firefox event page suspended mid-parse | PDF parse starts, event page suspends after 5s idle, parse result is never received | Register all message listeners at top level (not inside async functions or setTimeout). The current service-worker.js already does this correctly — preserve the pattern in Firefox background | If message listeners are accidentally registered inside `async function main()` or similar |
| IndexedDB open blocking background startup | Background script awaits IndexedDB initialization before registering message listeners | Register message listeners synchronously at top level; initialize IndexedDB lazily on first use | Any refactor that moves `chrome.runtime.onMessage.addListener` inside an async init function |
| esbuild rebuilding entire multi-entry bundle on every file change | Dev iteration is slow (2-3s rebuild on every save instead of <100ms) | Use esbuild `watch` mode or configure `incremental: true`; split large bundles into independent build targets so a content script change does not rebuild the offscreen bundle | When the build script is naively `esbuild --bundle src/background/service-worker.js src/content/content-script.js ...` as one invocation |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Including `PROXY_TOKEN` (Cloudflare Worker auth token) in the bundled and minified extension package | Token is visible in minified output via extension package inspection; any user can extract it and make direct calls to the Cloudflare Worker | This is an existing risk in v1.x. The token is a shared secret that protects the KV cache write endpoint — consider rotating it after v2.0 ships and evaluate if IP allowlisting on the Cloudflare Worker is feasible |
| Firefox extension ID collision | If another extension uses the same gecko ID, Firefox may behave unpredictably with storage.sync | Use a unique, non-guessable ID in email format tied to a domain you control (e.g., `patent-cite-tool@yourname.dev`) |
| esbuild minification exposing hardcoded secrets in source maps | Source maps (if shipped) expose original source including the proxy token | Never ship source maps in release builds. Use `NODE_ENV=production` guard to omit source maps from release packaging |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Firefox icon never activates due to declarativeContent gap | Firefox users see the icon as always-active or always-inactive; clicking on non-patent pages shows confusing popup state | Replace declarativeContent with content-script-driven `action.enable(tabId)` — icon activates reliably on patent pages only |
| Firefox background event page suspended during long PDF parse | Parse progress appears to hang; user sees spinner indefinitely | The parse itself runs to completion (event page stays alive during active async operations); ensure the message listener that receives PARSE_RESULT is registered at top level so it can restart the event page if needed |
| Extension appears to work in Firefox (installs, icon shows) but citations never generate | Users report "broken extension" without useful error message | Add a Firefox-specific error path: if `browser.offscreen` is undefined and the background script does not contain the PDF pipeline, log a clear console error and send a user-visible error message to the content script |

---

## "Looks Done But Isn't" Checklist

- [ ] **declarativeContent replaced:** Firefox build has no reference to `chrome.declarativeContent`; icon activates correctly only on patent pages in Firefox
- [ ] **offscreen logic ported:** Firefox background script contains the full PDF fetch + parse + IndexedDB pipeline; `browser.offscreen` is never referenced in Firefox code
- [ ] **Manifests split:** `dist/chrome/manifest.json` and `dist/firefox/manifest.json` are distinct files; Firefox manifest has `browser_specific_settings.gecko.id` and no `offscreen`/`declarativeContent` permissions
- [ ] **Content script format:** esbuild produces content script bundle as IIFE (not ESM); no `import`/`export` statements in content script output
- [ ] **outbase set:** esbuild build config explicitly sets `outbase: 'src'`; output paths match manifest references exactly
- [ ] **PDF.js workerSrc:** Uses `chrome.runtime.getURL('lib/pdf.worker.mjs')` — not a relative path or hardcoded string; works in Firefox
- [ ] **Gecko ID set:** Firefox manifest `browser_specific_settings.gecko.id` is a unique, stable identifier
- [ ] **71-case test corpus:** All 71 tests pass against bundled Chrome output before Firefox porting begins; all 71 tests pass against Firefox output after porting
- [ ] **IndexedDB graceful degradation:** IndexedDB errors are caught and the extension falls back to session-only caching rather than crashing
- [ ] **No source maps in release zip:** Release packaging script explicitly omits `*.js.map` files from the zip

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| declarativeContent not replaced — Firefox icon broken | LOW | Implement content-script-driven `action.enable(tabId)` pattern; test takes ~2 hours |
| offscreen logic not ported — Firefox PDF pipeline dead | HIGH | Full migration of offscreen.js into Firefox background script; 1-2 days of work plus regression testing |
| Content scripts bundled as ESM — silent injection failure | LOW | Change esbuild format to `iife` for content script entry; rebuild and test; ~30 minutes |
| outbase misconfigured — manifest path mismatches | LOW | Add `outbase: 'src'` to build config; verify output tree; ~1 hour |
| 71-case regression after shared code extraction | MEDIUM | Git bisect the extraction commits; identify which module move caused the regression; fix the import path or logic error; 2-4 hours |
| Firefox gecko ID missing — storage.sync not syncing | LOW | Add ID to Firefox manifest and rebuild; no data migration needed for development builds; for production it must be set before first release |
| IndexedDB broken for "never remember history" users | MEDIUM | Add try/catch around IndexedDB open; route to in-memory fallback; test with Firefox in permanent private browsing mode; ~4 hours |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| declarativeContent not supported in Firefox | Firefox Background Script | Install Firefox build on a non-patent page: icon must be disabled. Navigate to patent page: icon must activate |
| offscreen API unavailable in Firefox | Firefox Background Script | Generate a citation on Firefox: position map must be built and citation must appear |
| Chrome-specific manifest keys breaking Firefox | Build Pipeline Setup (manifest split) | `web-ext lint` passes with zero warnings; Firefox loads extension without errors |
| Content scripts bundled as ESM | Build Pipeline Setup | Inspect bundle output: no `import`/`export` at top level of content script file |
| esbuild path flattening | Build Pipeline Setup | Compare `dist/chrome/` tree against manifest path references; every path must resolve |
| Module type mismatch for Firefox background | Build Pipeline Setup | Firefox background loads without SyntaxError; message listeners register on install |
| Shared code duplication confusion | Build Pipeline Setup | Content script bundle is a single IIFE file; no chunk imports |
| Global scope regression from classic→IIFE bundling | Shared Code Extraction | All 71 golden tests pass against bundled output |
| Firefox IndexedDB in private mode | Firefox Background Script | Test with Firefox "Never remember history" setting: extension degrades gracefully, no crash |
| PDF.js worker path fragility | Firefox Background Script | PDF loads and parses correctly on Firefox; no console errors about worker URL |
| Missing gecko ID | Firefox manifest split | `browser.storage.sync` persists across two Firefox instances (or test with `web-ext` dev install) |
| Bundled output breaks Vitest tests | Shared Code Extraction | All 71 tests pass after every individual module move, not just at the end |

---

## Sources

- [MDN: Chrome incompatibilities](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Chrome_incompatibilities) — declarativeContent unsupported (bug 1435864); content script global scope differences; web_accessible_resources UUID behavior; data cloning differences (HIGH confidence, official docs)
- [Firefox Extension Workshop: MV3 Migration Guide](https://extensionworkshop.com/documentation/develop/manifest-v3-migration-guide/) — background script format; gecko ID requirement; host_permissions as optional permission (HIGH confidence, official docs)
- [MDN: Background scripts](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Background_scripts) — event page lifecycle; suspension behavior; state loss; storage.session vs storage.local (HIGH confidence, official docs)
- [MDN: storage.sync](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage/sync) — gecko ID requirement for sync to function (HIGH confidence, official docs)
- [MDN: background manifest key](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background) — Firefox uses scripts array; service_worker ignored before Firefox 121 (HIGH confidence, official docs)
- [esbuild API docs](https://esbuild.github.io/api/) — format options (iife/esm/cjs); outbase; splitting; multiple entry points behavior (HIGH confidence, official docs)
- [esbuild FAQ](https://esbuild.github.io/faq/) — IIFE format for browser global scope safety (HIGH confidence, official docs)
- [Firefox Bugzilla 1435864](https://bugzil.la/1435864) — declarativeContent not implemented in Firefox (HIGH confidence, official bug tracker)
- [Firefox Bugzilla 1406675](https://bugzilla.mozilla.org/show_bug.cgi?id=1406675) — IndexedDB broken when cookies disabled (MEDIUM confidence, bug report)
- [Firefox Bugzilla 1841806](https://bugzilla.mozilla.org/show_bug.cgi?id=1841806) — IndexedDB not working in private browsing mode for extensions (MEDIUM confidence, bug report)
- [GitHub: mozilla/webextension-polyfill](https://github.com/mozilla/webextension-polyfill) — chrome vs browser namespace shim (HIGH confidence, official Mozilla project)
- [w3c/webextensions issue #156](https://github.com/w3c/webextensions/issues/156) — ES modules in content scripts proposal (MEDIUM confidence, standards discussion)
- [esbuild GitHub issue #1025](https://github.com/evanw/esbuild/issues/1025) — shared dependencies between builds (MEDIUM confidence, maintainer response)
- [codestudy.net: MV3 background scripts vs service workers in Firefox](https://www.codestudy.net/blog/manifest-v3-background-scripts-service-worker-on-firefox/) — Firefox 121 service_worker + scripts behavior (MEDIUM confidence, community article verified against MDN)
- Project source audit: `src/background/service-worker.js`, `src/manifest.json`, `src/offscreen/offscreen.js`, `src/shared/constants.js` — identified declarativeContent dependency, offscreen pattern, dual-context constants, inline message type duplication (HIGH confidence, direct code inspection)

---
*Pitfalls research for: esbuild build pipeline and Firefox extension port of an existing Chrome MV3 extension*
*Researched: 2026-03-03*
*Milestone: v2.0 Firefox Port*

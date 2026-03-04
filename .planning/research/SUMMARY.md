# Project Research Summary

**Project:** Patent Citation Tool v2.0 — esbuild Build Pipeline + Firefox Port
**Domain:** Cross-browser browser extension build pipeline (Chrome MV3 + Firefox MV3)
**Researched:** 2026-03-03
**Confidence:** HIGH

## Executive Summary

The v2.0 milestone has a single clear goal: take an existing, working Chrome MV3 extension (4,500 LOC) and ship it on Firefox MV3, while simultaneously introducing a proper build pipeline to eliminate code duplication across the codebase. The recommended approach is a custom `scripts/build.mjs` Node script using esbuild that produces two independent output trees (`dist/chrome/` and `dist/firefox/`) from a shared `src/` directory. No framework (WXT, Vite, Parcel) is needed — esbuild's native API is sufficient and fully transparent at this scale.

The key architectural challenge is that Chrome and Firefox diverge at the background context level. Chrome MV3 service workers lack DOM access, which is why the extension uses a Chrome-specific offscreen document to run PDF.js. Firefox MV3 background scripts are event pages with full DOM access — making the offscreen workaround unnecessary. The Firefox port requires a new `src/firefox/background.js` entry point that absorbs all offscreen document logic directly, collapsing a two-process Chrome pattern into a single Firefox background process. Content scripts, popup, options, icons, and PDF.js library files are identical between targets and shared via bundling.

The primary risk is the number of silent failure modes in cross-browser extension development: content scripts bundled as ESM fail to inject without any console error; missing `declarativeContent` replacement causes the icon to behave incorrectly without throwing; omitting `browser_specific_settings.gecko.id` silently breaks storage sync across devices. The mitigation strategy is strict phase ordering (shared code extraction first, build pipeline Chrome-only second, Firefox port third) combined with `web-ext lint` as an automated gate and the existing 71-case Vitest corpus as the primary regression signal throughout every step of the refactor.

## Key Findings

### Recommended Stack

The new build pipeline requires exactly three new dependencies: `esbuild` (bundler), `web-ext` (Firefox developer tooling), and optionally `webextension-polyfill` (cross-browser API normalization). The existing stack — Chrome MV3, PDF.js v5, Shadow DOM, IndexedDB, Cloudflare Workers + KV, Vitest — remains unchanged and validated.

**Core technologies (new for v2.0):**
- **esbuild 0.27.3:** Produces `dist/chrome/` and `dist/firefox/` from a single `build.mjs` script. Sub-second incremental builds. No plugins required. IIFE format for content scripts; ESM for background/offscreen. Set `outbase: 'src'` to prevent path flattening surprises.
- **web-ext 9.3.0:** Mozilla's official CLI. `web-ext run` loads extension into Firefox with auto-reload. `web-ext lint` catches Chrome-specific keys in the Firefox manifest before manual testing. ES module only (Node 14+, already satisfied by `"type": "module"` in package.json).
- **webextension-polyfill 0.12.0 (optional):** Wraps `chrome.*` callbacks as Promises under `browser.*` namespace; Firefox-native no-op. FEATURES.md research notes this may not be needed since Firefox natively supports `chrome.*` — decision can be deferred to Phase 2 implementation.

The "what not to add" list is as important: no WXT, no Vite, no Parcel, no Babel, no esbuild plugins for file copying (`fs.cpSync` suffices), no code splitting (`splitting: true` is incompatible with content script IIFE requirement), no single merged manifest.

### Expected Features

**Must have (P1 — v2.0 table stakes):**
- esbuild build script (`scripts/build.mjs`) producing working `dist/chrome/` and `dist/firefox/` — the entire milestone foundation
- Shared code extraction: `src/shared/constants.js` (add ES module exports) and `src/shared/matching.js` (new — extract duplicated matching functions from both `text-matcher.js` and `offscreen.js`)
- Firefox manifest (`src/manifests/manifest.firefox.json`) with correct permissions, gecko ID, `background.scripts`, and no Chrome-only APIs (`declarativeContent`, `offscreen`)
- Firefox background script (`src/firefox/background.js`) absorbing offscreen document responsibilities (fetch, PDF.js, IndexedDB, text matching, KV cache)
- `tabs.onActivated` + `tabs.onUpdated` replacing `declarativeContent` for per-tab icon activation in Firefox
- Both targets pass the 71-case test corpus and manual spot-check on 5+ real patents

**Should have (P2 — before AMO submission):**
- `web-ext lint` passing cleanly on Firefox build
- `web-ext run` developer loop configured (`.web-ext-config.cjs`)
- Cross-browser corpus validation documented

**Defer (v3+):**
- Firefox AMO listing/submission (requires screenshots, review queue time)
- Safari port (Xcode wrapping, App Store review — entirely different mechanism)
- Playwright automated cross-browser testing harness (large scope)
- Chained esbuild watch + web-ext watch dev loop (developer comfort, not correctness)
- webextension-polyfill adoption (not needed; `chrome.*` works in Firefox natively)

### Architecture Approach

The v2.0 architecture maintains the existing Chrome structure (service worker orchestrates offscreen document) while adding a parallel Firefox structure where the background event page handles everything inline. The source tree diverges only at the entry point level: `src/background/service-worker.js` for Chrome, `src/firefox/background.js` for Firefox. Everything else — content scripts, popup, options, shared logic, PDF.js library files — is shared source that esbuild bundles into each target independently.

**Major components:**
1. **`scripts/build.mjs`** — esbuild orchestrator; separate build calls per format (IIFE for content scripts, ESM for background/offscreen); static asset copy via `fs.cpSync`; compile-time `BROWSER_TARGET` define for dead-code elimination
2. **`src/shared/` (new)** — `constants.js` with ES module exports (MSG, STATUS, PATENT_TYPE); `matching.js` with all deduplicated text-matching functions; imported by Chrome offscreen and Firefox background via bundling
3. **`src/firefox/background.js` (new)** — Firefox-only entry point; union of Chrome's `service-worker.js` + `offscreen.js`; handles message routing, PDF fetch/parse, IndexedDB, KV cache, and icon activation via `tabs.onUpdated` / `tabs.onActivated`
4. **`src/manifests/` (new)** — `manifest.chrome.json` and `manifest.firefox.json` maintained independently; differences are too large (permissions, background key, WAR format, gecko ID) for a patch-based approach
5. **`dist/chrome/` and `dist/firefox/`** — independent, self-contained extension packages; Chrome keeps offscreen.html, Firefox does not

### Critical Pitfalls

1. **`declarativeContent` has no Firefox equivalent** — The Chrome service worker's icon activation logic (`chrome.declarativeContent.onPageChanged`) silently does nothing or throws in Firefox. Replace entirely with `browser.action.disable()` (global) + `tabs.onUpdated`/`tabs.onActivated` listeners in the Firefox background script. Requires adding `"tabs"` permission to Firefox manifest.

2. **Content scripts must be IIFE, not ESM** — esbuild configured with `format: 'esm'` or `splitting: true` for content scripts produces output that Chrome and Firefox silently refuse to inject. No console error — citation UI never appears. Use `format: 'iife'` with `bundle: true` for every content script entry point, in a separate esbuild build call.

3. **`offscreen` API does not exist in Firefox** — The entire PDF fetch/parse/cache pipeline is inoperative on Firefox until it is moved into the Firefox background script. Firefox event pages have full DOM access and can run PDF.js directly without a separate document context.

4. **esbuild `outbase` must be set explicitly** — Without `outbase: 'src'`, esbuild's path flattening uses the lowest common ancestor of all entry points, which can silently shift output paths and break manifest references. Always set `outbase: 'src'`.

5. **Classic script → IIFE bundle breaks implicit globals** — The current content scripts share state via implicit globals assigned at classic-script top level. Bundling as IIFE makes those globals local to the IIFE closure. Fix: convert all shared code to explicit ES module exports before bundling. Run the 71-case corpus after every individual module move.

## Implications for Roadmap

The architecture research documents a mandatory phase ordering based on hard technical dependencies. All four research files agree on the same sequence.

### Phase 1: Shared Code Extraction

**Rationale:** Every subsequent phase depends on `src/shared/constants.js` having ES module exports and `src/shared/matching.js` existing. The Firefox background script cannot import shared matching logic until the shared module exists. The Chrome offscreen.js refactor cannot eliminate duplication until then either. This phase has no prerequisites and must go first.

**Delivers:** `src/shared/constants.js` with ES module exports; `src/shared/matching.js` extracted from `text-matcher.js` and `offscreen.js`; updated `offscreen.js` and `service-worker.js` importing from shared. No `dist/` changes — Chrome extension continues to load from `src/` via "Load unpacked" and must remain regression-free throughout.

**Addresses:** Tech debt (duplicated MSG/STATUS/PATENT_TYPE constants, duplicated normalizeText/matchAndCite/formatCitation and related matching functions). Enables the Firefox port and build pipeline phases.

**Avoids:** Pitfall 8 (classic→IIFE global scope regression — conversion to explicit ES module exports is the prerequisite for safe bundling). Pitfall 12 (Vitest test breakage — run the 71-case corpus after every individual module move, not just at the end).

**Research flag:** Standard patterns — ES module extraction is well-documented JavaScript refactoring; no additional research needed.

### Phase 2: esbuild Build Pipeline (Chrome Target Only)

**Rationale:** Validate the build pipeline against the known-working Chrome target before introducing Firefox complexity. A working `dist/chrome/` that passes the 71-case corpus confirms that shared code extraction is correct and that esbuild configuration is sound. Firefox-specific failures cannot pollute this signal.

**Delivers:** `scripts/build.mjs`, `src/manifests/manifest.chrome.json`, `dist/chrome/` output tree matching all existing manifest path references. Chrome extension loaded from `dist/chrome/` must be functionally identical to loading from `src/`. npm scripts: `build`, `build:chrome`, `build:firefox`.

**Addresses:** esbuild build pipeline feature (P1), manifest split (P1).

**Avoids:** Pitfall 4 (IIFE vs ESM — content script entry uses separate IIFE build call); Pitfall 5 (path flattening — `outbase: 'src'` set explicitly); Pitfall 7 (shared code duplication accepted and correct for content scripts); Pitfall 8 (global scope regression — caught here against Chrome before Firefox adds noise).

**Research flag:** Standard patterns — esbuild API is well-documented; IIFE/ESM split configuration is explicitly described in STACK.md and ARCHITECTURE.md with code examples ready to use.

### Phase 3: Firefox Background Script + Manifest

**Rationale:** With shared code (Phase 1) and a validated build scaffold (Phase 2) in place, Firefox-specific work can proceed without two unknowns at once. Both prerequisites are in place; only the Firefox-specific logic remains.

**Delivers:** `src/firefox/background.js` (union of service-worker + offscreen logic); `src/manifests/manifest.firefox.json` (gecko ID, `background.scripts`, no Chrome-only permissions); `dist/firefox/` output tree; Firefox extension loads and produces citations.

**Addresses:** Firefox background script feature (P1); Firefox manifest (P1); `declarativeContent` replacement (P1); `tabs.onActivated`/`tabs.onUpdated` icon logic (P1).

**Avoids:** Pitfall 1 (`declarativeContent` gap); Pitfall 2 (offscreen API missing in Firefox); Pitfall 3 (Chrome manifest on Firefox); Pitfall 6 (module type mismatch for Firefox background — use IIFE for safety); Pitfall 9 (IndexedDB in "Never remember history" mode — add graceful degradation); Pitfall 10 (PDF.js worker URL — always use `chrome.runtime.getURL`, never hardcode); Pitfall 11 (gecko ID missing, storage.sync broken across devices).

**Research flag:** Needs empirical validation on three specific points: (a) Firefox event page lifecycle during active async PDF parsing (does the page stay alive through a long parse?), (b) IndexedDB behavior under Firefox "Never remember history" privacy mode and graceful degradation path, (c) PDF.js v5 WASM CSP requirements in Firefox background page context (`wasm-unsafe-eval` may be required in Firefox manifest `content_security_policy`). These are MEDIUM-confidence gaps identified in PITFALLS.md that require empirical testing during implementation.

### Phase 4: Cross-Browser Validation

**Rationale:** Both targets must be functional before validation is meaningful. This phase is primarily a gate and documentation step, not a construction phase.

**Delivers:** Confirmed pass of 71-case corpus against `dist/chrome/` (loaded in Chrome, manual spot-check on 5+ real patents). Confirmed pass against `dist/firefox/` (loaded via `web-ext run`, same spot-check). `web-ext lint` passes with zero warnings. Release packaging workflow documented.

**Addresses:** Cross-browser corpus validation (P2); web-ext lint gate (P2); web-ext run developer loop (P2).

**Avoids:** Shipping the Firefox build before verifying it behaves identically to Chrome on real patents from the existing corpus.

**Research flag:** Standard patterns — manual spot-check process and `web-ext` commands are well-documented. If regressions appear, git bisect over Phase 1–3 commits using the 71-case corpus as the oracle.

### Phase Ordering Rationale

- **Hard dependency chain:** Shared code extraction (1) → Build pipeline Chrome-only (2) → Firefox port (3) → Validation (4). Each phase creates prerequisites for the next.
- **Chrome-first in Phase 2 is explicitly required:** Debugging Firefox background script behavior while the build pipeline itself is unvalidated introduces two simultaneous unknowns. ARCHITECTURE.md's build order section states this constraint explicitly.
- **71-case Vitest corpus is the single regression gate throughout:** All research files emphasize this. It is the only automated signal that shared code extraction and bundling preserved correctness. Never batch multiple module moves into a single untested commit.
- **Separate entry points preferred over runtime conditionals:** ARCHITECTURE.md documents the anti-pattern of `if (chrome.offscreen) { /* Chrome */ } else { /* Firefox */ }` branching. Separate `src/background/service-worker.js` and `src/firefox/background.js` entry points, sharing `src/shared/` modules, is cleaner and easier to test in isolation.

### Research Flags

Phases needing empirical validation or deeper research during implementation:
- **Phase 3 (Firefox Background Script):** Three specific unknowns need empirical testing: (a) event page suspension behavior during active PDF.js parse, (b) IndexedDB availability under Firefox privacy settings, (c) PDF.js WASM + Firefox CSP. These are implementation-time discoveries, not blocking research.

Phases with standard, well-documented patterns (no additional research needed before starting):
- **Phase 1 (Shared Code Extraction):** ES module extraction is standard; no domain-specific unknowns.
- **Phase 2 (esbuild Chrome Build):** esbuild API is comprehensive; all configuration decisions documented in STACK.md and ARCHITECTURE.md with ready-to-use code examples.
- **Phase 4 (Validation):** Process-level; `web-ext` commands documented; no technical unknowns.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | esbuild, web-ext, webextension-polyfill versions verified against npm and official docs. Build script pattern verified against 1Password real-world case study (90% build time reduction). |
| Features | HIGH | Firefox API gaps verified against MDN official docs and Firefox Extension Workshop. Feature priorities are unambiguous given the codebase's existing state and existing tech debt identified in source. |
| Architecture | HIGH | Phase ordering follows hard technical dependencies, not preferences. Component boundaries verified against existing v1.2 source code. Firefox event page DOM access confirmed via MDN. Build script pattern cross-validated across STACK.md and ARCHITECTURE.md. |
| Pitfalls | HIGH | 12 pitfalls identified. 10 of 12 backed by official MDN/Mozilla docs or official Firefox Bugzilla. 2 of 12 (IndexedDB under Firefox privacy settings) are MEDIUM confidence based on Bugzilla bug reports and community observation. |

**Overall confidence:** HIGH

### Gaps to Address

- **webextension-polyfill decision:** FEATURES.md recommends against it (Firefox natively supports `chrome.*`); STACK.md includes it as a new dependency. Decision should be made at Phase 2 implementation time — if `chrome.*` calls in Firefox background work without polyfill (quick empirical check), skip the dependency. Risk of adding it is low (10 KB minified); risk of omitting it is also low.

- **PDF.js WASM + Firefox CSP:** The existing `offscreen.html` may have an implicit CSP permitting WASM evaluation. The Firefox background page's default CSP may not. If citations fail on Firefox with a CSP error, add `"wasm-unsafe-eval"` to `content_security_policy` in `manifest.firefox.json`. Test empirically in Phase 3.

- **Cloudflare Worker CORS for `moz-extension://` origin:** If `pct.tonyrowles.com` Cloudflare Worker validates the `Origin` header, `moz-extension://` origins need to be explicitly allowed. The Chrome `chrome-extension://` origin presumably already works. Verify during Phase 3 by checking network requests in Firefox DevTools.

- **`strict_min_version` discrepancy across research files:** STACK.md recommends `128.0` (full MV3 support, July 2024); ARCHITECTURE.md shows `109.0` in sample manifest; PITFALLS.md uses `121.0`. Use `128.0` — it has the strongest rationale (all MV3 APIs available, still current in 2026) and aligns with the STACK.md recommendation.

## Sources

### Primary (HIGH confidence)
- [MDN: Chrome incompatibilities](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Chrome_incompatibilities) — `declarativeContent` unsupported (bug 1435864), WAR UUID behavior, content script global scope differences
- [MDN: Background scripts](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Background_scripts) — Firefox event page DOM access, lifecycle, suspension behavior, state persistence
- [MDN: browser_specific_settings](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings) — gecko.id format, strict_min_version, data_collection_permissions (post-Nov 2025 AMO requirement)
- [MDN: action.disable()](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/action/disable) — per-tab enable/disable confirmed for Firefox MV3
- [Firefox Extension Workshop: MV3 Migration Guide](https://extensionworkshop.com/documentation/develop/manifest-v3-migration-guide/) — background scripts vs service workers, Firefox-specific manifest fields
- [Firefox Extension Workshop: web-ext command reference](https://extensionworkshop.com/documentation/develop/web-ext-command-reference/) — run, build, lint commands (updated December 2025)
- [esbuild API documentation](https://esbuild.github.io/api/) — format, outbase, bundle, define, entryPoints, splitting behavior
- [webextension-polyfill GitHub](https://github.com/mozilla/webextension-polyfill) — MV3 compatibility, no-op behavior on Firefox, usage patterns
- [web-ext npm](https://www.npmjs.com/package/web-ext) — version 9.3.0 confirmed as latest
- [Firefox Bugzilla 1435864](https://bugzil.la/1435864) — `declarativeContent` not implemented in Firefox, no planned timeline
- Project source code (v1.2) — ground truth for existing architecture, duplication locations, Chrome API usage patterns, dual-context constants pattern

### Secondary (MEDIUM confidence)
- [1Password blog: esbuild extension build](https://1password.com/blog/new-extension-build-system) — real-world extension build patterns, 90% build time reduction vs Webpack (May 2024)
- [How to port Chrome MV3 to Firefox](https://decembergarnetsmith.com/blog/2024/05/10/how-to-port-an-mv3-chrome-extension-to-firefox/) — corroborates manifest change requirements
- [Mozilla Discourse: webextension-polyfill MV3](https://discourse.mozilla.org/t/how-to-use-browser-polyfill-for-mv3-cross-browser-web-extension/137839) — MV3 usage patterns and compatibility confirmation
- [Firefox Bugzilla 1406675](https://bugzilla.mozilla.org/show_bug.cgi?id=1406675) — IndexedDB broken when cookies disabled
- [Firefox Bugzilla 1841806](https://bugzilla.mozilla.org/show_bug.cgi?id=1841806) — IndexedDB not working in Firefox private browsing mode for extensions
- [esbuild GitHub issue #1025](https://github.com/evanw/esbuild/issues/1025) — shared dependencies between builds

---
*Research completed: 2026-03-03*
*Ready for roadmap: yes*

# Project Research Summary

**Project:** Patent Citation Tool — v1.2 Store Polish + Accuracy Hardening
**Domain:** Chrome MV3 Extension for legal citation generation on Google Patents
**Researched:** 2026-03-02
**Confidence:** HIGH (store requirements, architecture, pitfalls all verified against official Chrome docs and existing source)

## Executive Summary

This is a v1.2 polish-and-hardening milestone for a working Chrome MV3 extension. The core product — highlight text on a Google Patents page and get a formatted col:line citation for patent prosecution — already works (v1.1, 4,333 LOC, deployed Cloudflare Worker at pct.tonyrowles.com). The v1.2 work has two independent tracks: (1) store submission readiness (icon set, store assets, privacy policy, options page polish) and (2) accuracy hardening (test harness, accuracy audit, algorithm fixes). These tracks can run in parallel after the test harness is established, but the test harness must be built before any algorithm changes are made.

The recommended approach is to build test infrastructure first, then use it to drive accuracy improvements, while executing the store polish track in parallel. The extension's architecture is clean for testing: the matching and parsing logic lives in pure functions in ES modules with no Chrome API dependencies. Adding `export` keywords to existing functions in `offscreen/offscreen.js` and `content/paragraph-finder.js` unlocks Vitest-based unit testing with zero restructuring. The only complication is that `text-matcher.js` is a classic script without exports — the recommended fix is to add `export` keywords there too, which does not break classic script loading in Chrome.

The highest-risk items for this milestone are in the store submission track, not the algorithm track. Chrome Web Store rejections from an incomplete privacy policy, missing data disclosure form fields, or incorrect screenshot dimensions are common and each cost a full review cycle (2-7 days). All these pitfalls are well-documented and entirely preventable with a pre-submission checklist. The accuracy track risks center on algorithm regression — mitigated by establishing frozen golden outputs before any algorithm change is made.

## Key Findings

### Recommended Stack

The existing stack requires no changes. The only new additions for v1.2 are two devDependencies: `sharp` (0.34.5) for icon generation from SVG source, and `vitest` (4.0.18) for the test harness. A root-level `package.json` for dev tooling does not exist yet and needs to be created — the extension source in `src/` continues to ship with zero dependencies.

**Core technologies (existing — no change):**
- Chrome MV3, Shadow DOM, content scripts — deployed and working
- Offscreen Document API + PDF.js v5 — PDF parsing pipeline operational
- Cloudflare Workers + KV — proxy and shared cache at pct.tonyrowles.com
- IndexedDB — local patent position map cache

**New devDependencies only:**
- `sharp 0.34.5` — SVG-to-PNG batch icon generation; fastest Node.js image library, zero runtime footprint in extension bundle; script pattern: `sharp(src).resize(size).png().toFile(dest)`
- `vitest 4.0.18` — ESM-native test runner; no build step required; `environment: 'node'` for pure functions, `environment: 'happy-dom'` for DOM-walking tests (paragraph-finder.js)
- `vitest-chrome 0.1.0` — Chrome API mock; published 2023 against older Vitest, but the `globalThis.chrome` assignment pattern is version-agnostic. Treat as optional: a manual chrome stub in `test/setup.js` is more resilient for the small API surface this extension uses

See `.planning/research/STACK.md` for version details and the root `package.json` template.

### Expected Features

The core citation features are complete (v1.0/v1.1 delivered). v1.2 adds no new user-facing citation capabilities — it polishes the surrounding product and hardens the existing accuracy.

**Must have for v1.2 (table stakes for store submission):**
- Professional icon set (16/32/48/128px active + inactive) — placeholder PNGs are 306 bytes each; unacceptable for a store listing
- Small promotional tile (440x280px) — absence causes lower search ranking in store results
- At least one screenshot at exactly 1280x800 showing citation in context on a real patent page — missing screenshot causes rejection
- Privacy policy at a public stable URL — required by Chrome Web Store due to `host_permissions` and Cloudflare Worker data transmission
- Options page accessible via right-click "Options" (`options_ui` in manifest) — settings currently buried in popup

**Must have for v1.2 (accuracy hardening):**
- Automated citation test harness with fixture-driven frozen golden outputs — prerequisite for safe algorithm changes
- Diverse patent corpus (pre-2000, chemical, cross-column, repetitive claims) — 30-50 test cases minimum
- Frozen expected outputs recorded before any algorithm change begins

**Should have (quality differentiators):**
- Off-by-one line detection in test harness — distinguish systematic bugs from total misses
- Save feedback in options page ("Saved" confirmation after settings change)
- Link to privacy policy and extension version display in options page
- Options discoverable via right-click (requires `options_ui` manifest entry)

**Defer to v2+:**
- International patent support (EP, JP, PCT) — multiplies complexity 3-5x
- Batch citation mode — not essential for core prosecution workflow
- AI-powered summarization — different product category
- Build step / ESM module unification — resolves tech debt but the simpler `export` keyword approach is sufficient for v1.2

See `.planning/research/FEATURES.md` for the full feature landscape and dependency graph.

### Architecture Approach

v1.2 adds two new directory trees alongside the existing extension source: `tests/` for the Vitest harness (never bundled into the extension) and `store-assets/` for Chrome Web Store submission assets (also never bundled). The extension source in `src/` receives three targeted changes: (1) `export` keywords added to pure functions in `offscreen/offscreen.js` and `content/paragraph-finder.js`, (2) new `src/options/` directory with `options.html` and `options.js`, (3) icon files replaced with production artwork and 32px variants added.

**Major components and their responsibilities:**

1. **`tests/` (new)** — Vitest harness, fixture JSON, test cases. Imports directly from `src/offscreen/` and `src/content/` using native ESM. No build step. Fixture format: PositionMap JSON (pre-captured) + `cases.json` (selectedText + expectedCitation).
2. **`store-assets/` (new)** — Static assets for Chrome Web Store dashboard upload: 128px icon, 440x280 promotional tile, 1280x800 screenshots, `privacy-policy.md` (hosted separately at a stable public URL).
3. **`src/options/` (new)** — Settings form (trigger mode, display mode, patent number prefix). Uses the same `chrome.storage.sync` keys as popup — no migration needed. Manifest gains `options_ui` entry with `open_in_tab: true`.
4. **`src/icons/` (modified)** — Replace placeholder PNGs with production artwork; add 32px active + inactive variants; update manifest to include `"32"` key in both `icons` and `action.default_icon`.
5. **`src/offscreen/offscreen.js` (minor modification)** — Add `export` keyword to `matchAndCiteOffscreen()`, `normalizeTextOffscreen()`. One-word change per function; zero behavioral impact; enables Vitest imports.
6. **`src/popup/popup.html` and `popup.js` (modified)** — Strip settings controls; add link via `chrome.runtime.openOptionsPage()`.

The test harness data flow is: fixture JSON (pre-captured position maps) → Vitest imports pure function from `src/offscreen/` → assert citation string. No Chrome APIs, no network, sub-second execution.

**Critical integration constraint:** `pdf-parser.js` uses `chrome.runtime.getURL()` to set the PDF.js worker URL. This breaks in Node.js. The fixture generation script must patch `GlobalWorkerOptions.workerSrc` before calling `extractTextFromPdf()`. This is a one-time concern for fixture generation only — the tests themselves run against pre-generated JSON fixtures.

See `.planning/research/ARCHITECTURE.md` for the full component file table, integration constraints, and the four-phase build order.

### Critical Pitfalls

1. **Missing privacy policy blocks submission (Purple Lithium violation)** — Write a single-page privacy policy, host at a stable public URL (GitHub Pages is sufficient), enter URL in the Developer Dashboard privacy section before the submission attempt. The policy must explicitly state: patent position maps are uploaded to Cloudflare KV (shared cache, no PII); `chrome.storage.sync` stores user preferences cross-device. The presence of `host_permissions` pointing to pct.tonyrowles.com guarantees reviewer scrutiny regardless of whether any PII is involved.

2. **Data disclosure form incomplete causes suspension after 30 days** — The privacy policy URL field is NOT the only privacy requirement. Complete all four Developer Dashboard privacy subsections: single purpose description, permission justification for every manifest permission (`declarativeContent`, `offscreen`, `activeTab`, `storage`, `contextMenus`, `clipboardWrite`, both host permissions), remote code certification (MV3 prohibits it), and all data use checkboxes. Developers who fill only the URL field get suspended 30 days post-approval by automated enforcement.

3. **Algorithm fix causes citation regression** — Before any algorithm change, run the full test harness and record all outputs as the frozen baseline. After the fix, diff every output. Any citation that changed must be manually verified against the actual PDF before accepting. Never update expected outputs and algorithm logic in the same commit without that PDF verification.

4. **Test fixtures biased toward known-working patents** — A homogeneous corpus (e.g., all modern software patents from the same decade) produces a false 100% accuracy signal. Include: at least two pre-2000 patents, at least two chemical/biotech patents with subscript/Greek characters, at least one cross-column selection, at least one selection from highly repetitive claims language. Write the diversity checklist before selecting any patents.

5. **32px icon missing on Windows** — The current manifest has no 32px entries. Windows users see blurry scaled-up 16px icons in the toolbar. Add 16/32/48/128 for both active and inactive variants in a single pass — do not plan to patch 32px in after store submission.

6. **Screenshot dimension mismatch causes upload rejection** — The Chrome Web Store requires exactly 1280x800 or 640x400. Screenshots taken at arbitrary browser zoom levels will fail dimension validation on upload. Use browser devtools device mode set to exactly 1280x800 and capture full-bleed with no border/padding.

See `.planning/research/PITFALLS.md` for the complete pitfall catalog, warning signs, and a "Looks Done But Isn't" pre-submission checklist.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Test Harness Foundation
**Rationale:** The test harness is a hard prerequisite for the accuracy work. Without frozen golden outputs, algorithm changes are fly-blind. Building this first gives every subsequent phase regression protection. It also de-risks Phase 2 by establishing what "passing" looks like before any changes are made.
**Delivers:** Root-level `package.json` with vitest devDependency, `tests/` directory structure, `export` additions to `offscreen.js` and `paragraph-finder.js`, fixture generation script (`scripts/generate-fixture.mjs`), 30-50 diverse test cases covering the required variation axes, frozen golden output baseline.
**Addresses:** Automated Citation Test Harness (Group 4 from FEATURES.md)
**Avoids:** "Algorithm fix causes regression" (Pitfall 6), "Test fixtures not representing real diversity" (Pitfall 5)
**Stack used:** vitest 4.0.18, manual chrome stubs in `test/setup.js`, happy-dom for DOM tests in paragraph-finder tests
**Research flag:** Standard patterns — no additional research needed. The one uncertainty (vitest-chrome 0.1.0 compatibility with Vitest 4) has a documented safer fallback (manual `vi.fn()` stubs) that is preferable anyway.

### Phase 2: Accuracy Audit + Algorithm Fixes
**Rationale:** Can only run safely after Phase 1 establishes the regression harness. The audit generates new failing test cases; fixes are validated by re-running the harness. This is iterative — plan 3-4 fix cycles, not a single pass.
**Delivers:** Expanded test corpus with adversarial cases, algorithm fixes for the highest-impact failure modes (bookend false positives on repetitive claims, long selection failures, old patent OCR normalization), documented accuracy metrics (citation match rate, exact accuracy, confidence calibration).
**Addresses:** Accuracy Audit and Algorithm Fixes (Group 5 from FEATURES.md)
**Avoids:** "Overfitting algorithm fix to specific patent" (Pitfall 7), "Bookend false positive on repetitive claims" (Pitfall 8)
**Research flag:** May need shallow research on specific algorithm approaches (sliding bookend window from 50 to 100 chars, Levenshtein pre-filter region) during execution. The algorithm itself is documented in FEATURES.md; no blocking external research needed before starting.

### Phase 3: Icon Set + Manifest Updates
**Rationale:** Independent of accuracy work. Can run in parallel with Phase 2 if bandwidth allows. Required before store submission. Icon design work sets the visual language for the options page and should precede it.
**Delivers:** Production-quality 16/32/48/128px icon set (active + inactive variants), `scripts/generate-icons.mjs` using sharp 0.34.5, updated manifest with 32px entries and `options_ui` declaration, `store-assets/icon-128.png`.
**Addresses:** Extension Icon Set (Group 1 from FEATURES.md)
**Avoids:** "32px icon missing on Windows" (Pitfall 3), unblocks store submission
**Stack used:** sharp 0.34.5 for batch PNG generation from source SVG
**Research flag:** No additional research needed. Icon size requirements are HIGH confidence from official Chrome docs.

### Phase 4: Options Page Polish
**Rationale:** Depends on finalized icon artwork (for visual consistency). Independent of accuracy work. Small scope — CSS/HTML work plus `chrome.runtime.openOptionsPage()` wiring. Build and verify `options.html` before stripping settings from popup (per Anti-Pattern 3 in ARCHITECTURE.md).
**Delivers:** `src/options/options.html`, `src/options/options.js`, updated popup (settings stripped, options link added), right-click "Options" working via `options_ui` manifest entry, "Saved" confirmation feedback, privacy policy link, version display.
**Addresses:** Options Page UX Polish (Group 2 from FEATURES.md)
**Avoids:** "Options not right-click discoverable" (UX Pitfall in PITFALLS.md), "Modifying popup.js before options page exists" (Anti-Pattern 3 in ARCHITECTURE.md)
**Research flag:** No additional research needed. Options page patterns are HIGH confidence from official Chrome docs.

### Phase 5: Store Listing Assets + Submission
**Rationale:** Last phase. Requires completed icon set (Phase 3), polished options page (Phase 4), and satisfactory accuracy (Phase 2). Privacy policy and screenshots must be created before the Developer Dashboard can be fully completed.
**Delivers:** Privacy policy hosted at a public stable URL, 440x280 promotional tile, 1280x800 screenshots showing real citations on Google Patents, completed Developer Dashboard privacy section (all four subsections), store listing text (title ≤45 chars, summary ≤132 chars, description), submitted extension.
**Addresses:** Chrome Web Store Listing Package (Group 3 from FEATURES.md)
**Avoids:** "Missing privacy policy" (Pitfall 1), "Data disclosure form incomplete" (Pitfall 2), "Screenshot sizing mismatches" (Pitfall 4)
**Research flag:** No additional research needed, but use the "Looks Done But Isn't" checklist from PITFALLS.md as a mandatory pre-submission gate.

### Phase Ordering Rationale

- **Test harness before algorithm fixes** is a hard dependency identified in both FEATURES.md and ARCHITECTURE.md. Violating this order risks regressions on working cases while fixing failing ones.
- **Icon set before options page** ensures visual consistency during options page development. Saves rework if the icon color palette drives options page styling decisions.
- **Phases 3 and 4 can parallelize with Phase 2** if developer bandwidth allows. The UI/asset track is independent of the accuracy track after Phase 1 is complete.
- **All phases before store submission** is required, but the privacy policy and data disclosure form are the most commonly missed submission blockers. PITFALLS.md and STACK.md both flag this independently — it warrants extra attention.

### Research Flags

Phases with standard patterns (no additional research needed before starting):
- **Phase 1:** Vitest setup is well-documented; the vitest-chrome uncertainty has a safer manual fallback
- **Phase 3:** Chrome extension icon requirements are HIGH confidence from official docs
- **Phase 4:** Options page patterns are HIGH confidence from official docs
- **Phase 5:** Store submission requirements are HIGH confidence; the PITFALLS.md checklist covers all failure modes

Phases that may benefit from shallow research during execution:
- **Phase 2:** Specific algorithm improvements (sliding bookend, Levenshtein pre-filter) may benefit from consulting fuzzy matching literature. Not blocking to start — the accuracy audit drives the specific research needs.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | sharp 0.34.5 and vitest 4.0.18 verified on npm 2026-03-02. The one uncertainty — vitest-chrome 0.1.0 compatibility with Vitest 4 — has a documented safer fallback. |
| Features | MEDIUM-HIGH | Table stakes for store submission are HIGH (official Chrome docs). Feature prioritization for v1.2 is HIGH (defined by existing PROJECT.md milestone scope). General feature landscape for patent citation tools is MEDIUM (niche domain, no direct competitors). |
| Architecture | HIGH | Verified against actual v1.1 source code. Module system constraints, integration boundaries, and build order are ground truth, not inference. |
| Pitfalls | HIGH | Chrome Web Store policy pitfalls verified against official policy docs and named violation codes. Algorithm regression pitfalls verified against existing codebase (text-matcher.js, position-map-builder.js). First-person submission account corroborates privacy policy rejection pattern. |

**Overall confidence:** HIGH

### Gaps to Address

- **vitest-chrome 0.1.0 API surface coverage:** At Phase 1 implementation time, verify that the specific Chrome APIs this extension uses (`storage.sync`, `runtime.sendMessage`, `runtime.onMessage`) are present in vitest-chrome's mock. If gaps exist, use manual `vi.fn()` stubs in `test/setup.js`. Decision deferred until setup — not blocking.
- **Fixture generation script for `pdf-parser.js`:** `scripts/generate-fixture.mjs` must patch `GlobalWorkerOptions.workerSrc` before calling `extractTextFromPdf()` because `pdf-parser.js` uses `chrome.runtime.getURL()` which breaks in Node.js. One-time concern during Phase 1 setup.
- **Privacy policy hosting URL:** No decision on hosting location (GitHub Pages vs. Cloudflare Pages vs. project domain path). Must be decided before Phase 5, but the URL does not need to exist before Phases 1-4.
- **Icon artwork source:** The research recommends designing a source SVG for `sharp` to process, but no design tool or designer is specified. If no SVG artwork exists by Phase 3, icons can be placed manually at required sizes. Unblock by deciding on design approach before Phase 3 begins.

## Sources

### Primary (HIGH confidence)
- [Chrome Web Store Images](https://developer.chrome.com/docs/webstore/images) — icon (128px), promotional tile (440x280), screenshot (1280x800) requirements
- [Chrome Web Store Listing Requirements](https://developer.chrome.com/docs/webstore/program-policies/listing-requirements/) — metadata, keyword rules, accuracy requirements
- [Chrome Web Store Dashboard Privacy Fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy) — four required subsections for the privacy section
- [Chrome Web Store User Data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq) — privacy policy trigger conditions; `host_permissions` as flag
- [Chrome Web Store Troubleshooting / Violation Codes](https://developer.chrome.com/docs/webstore/troubleshooting) — Purple Lithium, Yellow Magnesium, Red Nickel violations
- [Chrome Extensions Configure Icons](https://developer.chrome.com/docs/extensions/develop/ui/configure-icons) — 16/32/48/128px sizes; Windows 32px requirement; SVG not supported
- [Chrome Extensions Unit Testing docs](https://developer.chrome.com/docs/extensions/how-to/test/unit-testing) — Vitest recommendation; chrome API mocking pattern
- [Chrome Extensions Give Users Options](https://developer.chrome.com/docs/extensions/develop/ui/options-page) — `options_ui` with `open_in_tab: true`
- [Vitest 4.0 official docs](https://vitest.dev/guide/) — ESM-native execution; `node` and `happy-dom` environments; version 4.0.18 confirmed
- [sharp official docs](https://sharp.pixelplumbing.com/) — SVG to PNG; resize API; version 0.34.5 confirmed
- v1.1 extension source code — ground truth for architecture, existing module system, storage keys, and icon file structure

### Secondary (MEDIUM confidence)
- [vitest-chrome GitHub](https://github.com/probil/vitest-chrome) — `globalThis.chrome` assignment pattern; API surface; last published 2023; Vitest 4 compatibility untested
- [Vitest browser mode InfoQ analysis](https://www.infoq.com/news/2025/12/vitest-4-browser-mode/) — Vitest 4 stable browser mode release context
- Chrome Web Store first-person submission account (TraceMind Blog) — privacy policy rejection pattern confirmed in practice even for local-only extensions

### Tertiary (LOW confidence)
- General fuzzy matching literature — algorithm improvement approaches (sliding bookend, Levenshtein pre-filter region); applicable but not domain-verified against patent PDF parsing specifically

---
*Research completed: 2026-03-02*
*Ready for roadmap: yes*

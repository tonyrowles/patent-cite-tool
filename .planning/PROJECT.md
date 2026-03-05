# Patent Citation Tool

## What This Is

A cross-browser extension (Chrome + Firefox) for patent professionals that generates precise column:line citations (for granted patents) or paragraph citations (for published applications) by highlighting text on Google Patents. Built with an esbuild pipeline from shared source code, supports silent clipboard mode (Ctrl+C), USPTO eGrant API fallback via Cloudflare Worker, shared server-side cache via Cloudflare KV, and 100% accuracy on a 71-case cross-browser test corpus.

## Core Value

Highlight text on Google Patents, get an accurate citation reference instantly — no PDF downloading, no manual counting.

## Requirements

### Validated

- ✓ Highlight text on Google Patents and receive column:line citation for granted US patents — v1.0
- ✓ Highlight text on Google Patents and receive paragraph citation for published US applications — v1.0
- ✓ Parse pre-OCR'd patent PDFs to build column/line maps (no client-side OCR) — v1.0
- ✓ Detect two-column specification section (skip cover page, preliminary material, figures) — v1.0
- ✓ Handle column boundaries — produce range citations like 4:55-5:10 when selection spans columns — v1.0
- ✓ Best-effort text matching with confidence indication (green/yellow/red) — v1.0
- ✓ In-browser PDF parsing via PDF.js offscreen document — lightweight, no backend — v1.0
- ✓ Configurable trigger mode (floating button, auto, context menu) — v1.0
- ✓ Local browser cache via IndexedDB for parsed patents — v1.0
- ✓ Optional patent number prefix in citation format — v1.0
- ✓ Silent mode — Ctrl+C appends citation to clipboard text; toast on low confidence/no match — v1.1
- ✓ USPTO eGrant API fallback via Cloudflare Workers proxy (keeps API key secret from end user) — v1.1
- ✓ Server-side shared cache on Cloudflare — analyzed patents benefit all users — v1.1

### Validated

- ✓ Proper extension icon set (16/32/48/128px) with three-state toolbar transitions — v1.2
- ✓ Dedicated options page with auto-save feedback and privacy policy link — v1.2
- ✓ Privacy policy hosted at stable public URL (GitHub Pages) — v1.2
- ✓ Store listing text, permission justifications, and dashboard guidance — v1.2
- ✓ Vitest test harness with 71-case patent fixture corpus and golden baseline — v1.2
- ✓ Manual accuracy audit across 8 patent categories (71 cases) — v1.2
- ✓ Algorithm fixes: gutter contamination strip and wrap-hyphen normalization — v1.2

### Validated

- ✓ esbuild build pipeline — src/ → dist/chrome/ and dist/firefox/ — v2.0
- ✓ Shared code extraction into src/shared/ — zero duplication between Chrome/Firefox — v2.0
- ✓ Firefox MV3 extension with background script absorbing offscreen logic — v2.0
- ✓ IndexedDB graceful degradation for Firefox private browsing — v2.0
- ✓ Cross-browser validation — 71-case corpus passes both builds + web-ext lint — v2.0

### Active

(No active requirements — next milestone not yet defined)

### Future

- Chrome Web Store screenshot (1280x800) and promotional tile (440x280)
- Chrome Web Store submission and review
- Firefox Add-ons (AMO) submission and review
- Configurable citation format (4:5-20 vs col. 4, ll. 5-20 vs column 4, lines 5-20)
- Keyboard shortcut for citation (e.g., Ctrl+Shift+C)
- Batch citation mode — queue multiple citations and copy all at once
- Patent family cache reuse — continuation patents share specification text

### Out of Scope

- Running OCR on patents — only parse pre-existing OCR/text layers (only ~2-5% of patents lack text layers)
- ~~Mobile browser support — Chrome desktop extension only~~
- Mobile browser support — desktop browser extensions only (Chrome + Firefox)
- Citation management or organization features — just copy the citation
- Non-US patents — completely different document formats and citation conventions
- AI-powered patent summarization — different product category
- Inline PDF viewer/annotator — Google Patents already shows the PDF
- Raw PDF storage in KV — PDFs are 5-30 MB; store parsed position maps only (10-100 KB)
- Cache/fallback status indicators in UI — deferred, not essential for core workflow
- ~~Full ESM module unification / build step~~ — completed in v2.0 (esbuild pipeline)
- Safari extension — different extension model (Xcode required)
- webextension-polyfill — Firefox supports chrome.* natively; unnecessary dependency
- Build-time minification — keep source readable for extension store review

## Context

Shipped v2.0 with 7,600 LOC (JavaScript/HTML/CSS/JSON) across 32 source files.
Tech stack: Chrome MV3, Firefox MV3 (WebExtensions), esbuild, PDF.js v5, Shadow DOM, IndexedDB, offscreen document API (Chrome), Cloudflare Workers, Cloudflare KV, Vitest, web-ext, sharp.
Architecture: src/ → esbuild → dist/chrome/ + dist/firefox/. Shared modules in src/shared/ (constants, matching). Firefox uses background script instead of offscreen document.

- **Google Patents HTML vs PDF mismatch**: Handled with fuzzy matching (exact → whitespace-stripped → punctuation-agnostic → bookend → Levenshtein). Long selections (>500 chars) may fail when texts genuinely diverge.
- **Patent PDF structure**: Cover page → preliminary material → figures → two-column specification. Bimodal x-coordinate analysis detects spec pages; dynamic gutter detection finds column boundaries.
- **Column/line layout**: Document-wide column numbering from printed PDF headers. Y-coordinate clustering with 3pt tolerance for line grouping. Claims section detected via text markers.
- **Published applications**: DOM-only paragraph citation — no PDF fetch needed. TreeWalker scans for [XXXX] markers.
- **Silent mode**: Pre-computes citation on mouseup, reads synchronously in copy event handler. Toast feedback for success/failure.
- **USPTO fallback**: Three trigger points (no DOM link, Google fetch failure, no text layer) all route to Cloudflare Worker proxy.
- **Server cache**: Check-before-fetch with 3s timeout, fire-and-forget upload after parse, existence-check write protection.
- **Accuracy**: 100% on 71-case test corpus (8 categories: pre-2000, modern, chemical, claims, cross-column, repetitive, short, long). Gutter contamination and wrap-hyphen normalization fixes applied.
- **Testing**: Vitest with golden baseline snapshot testing, off-by-one tier classification, per-category accuracy reports.
- **Distribution**: Store-ready with privacy policy, listing copy, extension ZIP. Pending screenshot/tile assets and Chrome Web Store submission.

## Constraints

- **Platform**: Chrome + Firefox extensions (Manifest V3 / WebExtensions)
- **Performance**: In-browser PDF.js parsing in offscreen document — fast enough for real-time use
- **Data source**: Google Patents PDF primary; USPTO eGrant API fallback via Cloudflare Workers proxy; Cloudflare KV shared cache
- **Accuracy**: Best-effort matching with confidence indication — citations go into legal filings

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Client-side PDF.js in offscreen document | Avoids backend infrastructure; MV3-compatible via offscreen API | ✓ Good — fast parsing, no server needed |
| Shadow DOM (closed mode) for citation UI | CSS isolation from Google Patents Polymer components | ✓ Good — no style leakage |
| DOM-based paragraph citations for pub apps | Published applications don't need PDF parsing — DOM has paragraph markers | ✓ Good — instant, no fetch needed |
| Document-wide column numbering from PDF headers | Printed column numbers are authoritative vs sequential counting | ✓ Good — matches attorney convention |
| Word-overlap scoring for disambiguation | Character-level scoring fails on HTML/PDF whitespace divergence | ✓ Good — robust disambiguation |
| Bookend matching for long selections | Full fuzzy match hangs on >100 chars; first/last 50 chars with span validation | ✓ Good — handles most long selections |
| ~~Dual-context constants module~~ | ~~Classic script globals + ES module import from same file~~ | Resolved in v2.0 — esbuild bundles shared ESM modules |
| ~~Duplicated matching functions (content + offscreen)~~ | ~~Offscreen ES module cannot share classic script globals~~ | Resolved in v2.0 — src/shared/matching.js is single source |
| esbuild with IIFE content scripts + ESM background | Content scripts cannot use ES modules in Chrome MV3; IIFE wrapping works | ✓ Good — clean bundle separation |
| Separate Chrome/Firefox manifests | Too many differences (permissions, CSP, background key) for patch approach | ✓ Good — clear separation of concerns |
| Firefox background script absorbs offscreen logic | Firefox has no offscreen API; background script can use full APIs | ✓ Good — simpler architecture for Firefox |
| IndexedDB detect-once degradation | Single idbAvailable flag on first error; all IDB ops silently skipped | ✓ Good — graceful private browsing support |
| Per-target vitest alias configs | Redirect src/shared imports to dist/ bundles without modifying test files | ✓ Good — proves bundling correctness |
| No webextension-polyfill | Firefox natively supports chrome.* namespace | ✓ Good — zero extra dependencies |
| Local-only caching via IndexedDB | Cloud cache adds backend complexity; local sufficient for MVP | ✓ Good for v1 |
| Citation format: 4:5-20 shorthand | User preference for compact format | ✓ Good — shipped as default |
| Pre-compute citation on mouseup for silent mode | Copy event must be synchronous; async lookup impossible in copy handler | ✓ Good — fast, no visible delay |
| Cloudflare Workers for USPTO proxy | API key stays server-side; free tier sufficient; same provider as KV cache | ✓ Good — deployed in minutes |
| Three-point fallback to USPTO | Covers no-DOM-link, Google-fetch-failure, and no-text-layer scenarios | ✓ Good — comprehensive coverage |
| Shared KV cache with existence-check writes | One user's parse benefits all; free-tier write quota protected | ✓ Good — instant hits for cached patents |
| 3-second cache timeout with silent fallthrough | Unreachable Worker never blocks user; falls through to PDF pipeline | ✓ Good — no user-visible impact |
| Strip bounding box fields from cache entries | Reduces KV payload by ~40%; bbox not needed for citation matching | ✓ Good — smaller payloads |
| Vitest with ESM imports + Chrome API stubs | Test pure functions without browser; vi.stubGlobal for Chrome APIs | ✓ Good — 95 tests, fast CI |
| Golden baseline snapshot testing | Frozen expected outputs detect regressions before/after algorithm changes | ✓ Good — caught issues early |
| Cross-boundary gutter contamination strip | PDF items spanning columns embed gutter numbers; strip before line filter | ✓ Good — fixed systematic failures |
| Wrap-hyphen normalization in matchAndCite | HTML copy artifacts (`trans- actions`) stripped before matching | ✓ Good — 100% accuracy |
| CSS class injection for SVG icon generation | String replacement avoids librsvg version dependency | ✓ Good — reproducible builds |
| Three-state icon via chrome.action.setIcon | Tab-scoped icon transitions; gray default from manifest, no explicit reset needed | ✓ Good — clear visual feedback |
| options_ui with open_in_tab: true | Standard Chrome extension pattern; full-page settings experience | ✓ Good — clean UX |
| GitHub Pages docs/ folder for privacy policy | No separate service; same repo; auto-deployed on push to main | ✓ Good — zero maintenance |

---
*Last updated: 2026-03-05 after v2.0 milestone*

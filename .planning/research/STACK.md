# Stack Research

**Domain:** Chrome Extension — Store Polish + Accuracy Test Harness
**Researched:** 2026-03-02
**Confidence:** HIGH (icon tooling, store requirements, testing framework) / MEDIUM (vitest-chrome compatibility with Vitest 4)

---

## Milestone Context

This document covers only NEW stack additions for v1.2. Do not re-research the existing stack:
- Chrome MV3, PDF.js v5, Shadow DOM, IndexedDB, offscreen document API — validated
- Cloudflare Workers + KV, USPTO proxy — deployed and working
- Fuzzy text matching pipeline — operational, 4,333 LOC codebase

Focus: icon generation tooling, Chrome Web Store asset requirements, automated citation test harness.

---

## Feature 1: Icon Generation

### Current State

Six placeholder PNGs exist (16/48/128 active/inactive variants). All are single-color placeholders (306 bytes for a 128x128 PNG — that is a solid color block, not real artwork). The store needs proper icon artwork.

### What the Chrome Web Store Actually Requires

| Asset | Size | Format | Required? |
|-------|------|--------|-----------|
| Extension icon (manifest) | 16, 48, 128 px | PNG with transparency | Yes |
| Store listing icon | 128x128 px | PNG (96x96 artwork + 16px transparent padding per side) | Yes |
| Small promotional tile | 440x280 px | PNG or JPEG | Yes |
| Marquee promotional tile | 1400x560 px | PNG or JPEG | Optional |
| Screenshots | 1280x800 or 640x400 px | PNG or JPEG | At least 1 |

The manifest additionally references a missing 32px icon size (standard recommendation includes 16/32/48/128). The existing 32px slot is absent from both the icon directory and manifest. It should be added.

### Recommended Tool: sharp

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| sharp | 0.34.5 | SVG-to-PNG batch icon generation | Fastest Node.js image processing library. Native libvips bindings. SVG input auto-converts to PNG. Single script generates all required sizes from one source SVG. No browser required. Cross-platform. |

**Why sharp over alternatives:**

- **Inkscape CLI**: Requires Inkscape desktop install — adds OS-level dependency, not portable in CI
- **convert-svg-to-png npm**: Uses headless Chromium — heavyweight dependency, slow, overkill for icon generation
- **svgexport**: Less active maintenance; uses Puppeteer internally
- **Manual resize tools (Figma, GIMP)**: Not reproducible, not scriptable, can't be re-run when icon changes

sharp has zero runtime dependencies beyond the precompiled native binary and handles the exact `sharp('icon.svg').resize(128).png().toFile('icon-128.png')` workflow needed.

### Icon Generation Script Pattern

Create `scripts/generate-icons.mjs` at the project root (separate from the extension `src/` directory — it is a dev tool, not shipped):

```javascript
import sharp from 'sharp';
import { mkdir, copyFile } from 'fs/promises';

const SIZES = [16, 32, 48, 128];
const SRC_ACTIVE = 'assets/icon-active.svg';
const SRC_INACTIVE = 'assets/icon-inactive.svg';
const OUT = 'src/icons';

await mkdir(OUT, { recursive: true });

for (const size of SIZES) {
  await sharp(SRC_ACTIVE).resize(size).png().toFile(`${OUT}/icon-active-${size}.png`);
  await sharp(SRC_INACTIVE).resize(size).png().toFile(`${OUT}/icon-inactive-${size}.png`);
}
console.log('Icons generated.');
```

**Confidence: HIGH** — sharp 0.34.5 confirmed current on npm 2026-03-02. SVG input support is documented on sharp.pixelplumbing.com.

---

## Feature 2: Chrome Web Store Listing Assets

### No New Stack Required

Store listing assets are static files delivered to the Developer Dashboard. No library is needed to produce them — they are created manually (screenshots, promotional tiles) and hosted as plain files.

### Store Asset Checklist

**Icon** (production-quality, required before submission):
- 128x128 PNG. Artwork in 96x96 center area; outer 16px per side transparent.
- Must read on both light and dark toolbar backgrounds.

**Promotional tile** (required):
- 440x280 PNG or JPEG. Graphical focus. Minimal text. Must work at half-size (220x140).

**Screenshots** (at least 1, up to 5):
- 1280x800 px preferred. Full-bleed, no border/padding, square corners.
- Show actual extension UI in context.

**Privacy policy** (required when any user data is handled):
- Plain HTML or Markdown hosted on a public URL (GitHub Pages is fine).
- Must disclose: what data is collected, how it is used, who it is shared with.
- This extension uses `chrome.storage.sync` for settings and Cloudflare KV for shared patent cache (no PII). Policy must state this explicitly.
- The extension sends highlighted text fragments and patent numbers to the Cloudflare Worker. The policy must acknowledge this.

**Store description fields**:
- Title: max 45 characters
- Summary: max 132 characters (appears in search results)
- Description: max 16,000 characters; no keyword stuffing; no unattributed testimonials

**Confidence: HIGH** — Verified against developer.chrome.com/docs/webstore/images and developer.chrome.com/docs/webstore/program-policies/listing-requirements.

---

## Feature 3: Automated Citation Test Harness

### Problem to Solve

The matching pipeline (text-matcher.js, pdf-parser.js, position-map-builder.js) is pure logic — it takes text input and produces citation output. It does not depend on a live browser or Google Patents page at test time if position maps are pre-captured. A test harness needs:

1. A way to run JavaScript logic files without a browser build step
2. A mock for the `chrome.*` API surface that the code touches
3. A fixture system: pre-captured PositionMap JSON + selected text input + expected citation output
4. Assertion on citation string accuracy

### The Build Step Problem

The existing codebase has no bundler (no webpack, no Vite, no esbuild). Source files are plain scripts loaded either as classic scripts (content scripts) or ES modules (service worker, offscreen). This creates a testing complication:

- `text-matcher.js` — classic global script (no `import`/`export`), uses globals defined by constants.js loaded before it
- `pdf-parser.js`, `position-map-builder.js` — ES modules (`import`/`export` syntax)
- `shared/constants.js` — dual-context: exported as ES module AND defines globals for classic script use

The test harness must handle both module types. The cleanest approach is to run tests in Node.js ESM mode and adapt the classic-script files for import (or test them indirectly through the ES module pipeline).

### Recommended Stack: Vitest 4 + jsdom + Manual chrome Mock

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| vitest | 4.0.18 | Test runner and assertion library | ESM-native, no transform needed for existing ES module files. Zero config for Node environment. 40-100x faster than Jest for cold starts. Active development — v4 released Dec 2025 with stable browser mode. |
| jsdom | bundled with vitest | DOM simulation for content script tests | Needed for code that uses `document`, `window.getSelection()`. Vitest's `environment: 'jsdom'` covers this without extra install. |
| vitest-chrome | 0.1.0 | Chrome API mock | Only option that mocks the full `chrome.*` namespace for Vitest. Published 2023-08-25; no peer dependency constraints declared; works with Vitest via `global.chrome` assignment pattern. |

**Warning on vitest-chrome compatibility:** vitest-chrome 0.1.0 was built against vitest 0.34.2 (see its devDependencies). It declares no `peerDependencies`, meaning npm will not warn on mismatch. The `global.chrome` assignment pattern it uses is version-agnostic — it assigns a plain object to `globalThis.chrome` in a setup file, which works in any Vitest version's Node environment. **LOW confidence** that all mocked Chrome API signatures exactly match current @types/chrome. Verify during implementation that the specific APIs used (storage.sync, runtime.sendMessage) are present in the mock. If gaps exist, supplement with manual `vi.fn()` stubs.

**Alternative to vitest-chrome:** Manual chrome stub in `test/setup.js`:
```javascript
// Simpler and more resilient than vitest-chrome for a codebase that
// only touches a small subset of the chrome API
globalThis.chrome = {
  storage: {
    sync: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
    }
  },
  runtime: {
    sendMessage: vi.fn(),
    onMessage: { addListener: vi.fn() },
  }
};
```
This approach is lower risk than a third-party mock library that has not been updated since 2023.

### Test Fixture Structure

The accuracy test harness uses pre-captured data — no live patent fetches needed at test time:

```
test/
  fixtures/
    US7210627/
      position-map.json      # Pre-captured output from pdf-parser + position-map-builder
      cases.json             # Array of { selection, expectedCitation, description }
    US11427642B2/
      position-map.json
      cases.json
    ...
  unit/
    text-matcher.test.js     # Unit tests for matching functions in isolation
    pdf-parser.test.js       # Unit tests for PDF parsing logic
  accuracy/
    citation-accuracy.test.js  # Runs all fixture cases, reports pass/fail table
  setup.js                   # Chrome API stubs, globalThis setup
vitest.config.js
```

**cases.json format:**
```json
[
  {
    "description": "Short selection mid-column",
    "selection": "novel chemical compound",
    "expectedCitation": "4:32",
    "expectedConfidence": "high"
  },
  {
    "description": "Cross-column span",
    "selection": "extending from the first column into the second",
    "expectedCitation": "4:58-5:3",
    "expectedConfidence": "high"
  }
]
```

Position maps are captured once per patent (by running the existing parse pipeline locally against real PDFs) and committed to the test fixtures. Tests then run offline against captured data.

### Vitest Configuration

```javascript
// vitest.config.js (project root, not inside src/)
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',      // default; switch to 'jsdom' per-file with @vitest-environment
    setupFiles: ['./test/setup.js'],
    globals: true,            // allows describe/it/expect without import
  }
});
```

For files that need DOM access (testing content script UI logic), add a per-file docblock:
```javascript
// @vitest-environment jsdom
```

### No Build Step Required

Vitest runs Node.js ESM files natively. The existing offscreen ES modules (pdf-parser.js, position-map-builder.js) import without transformation. For classic-script functions (text-matcher.js), the strategy is to either:

a) Test them via the offscreen module equivalents (which duplicate the same logic as ES modules), or
b) Add `export` declarations to text-matcher.js functions for test use (the extension still loads it as a classic script; adding exports does not break classic script loading)

Option (b) is cleaner and should be preferred — adding `export` to functions in a classic script file does not break browser loading of that file as a classic script (exports are silently ignored). It does enable clean `import { matchAndCite } from '../src/content/text-matcher.js'` in tests.

**Confidence: HIGH** — Vitest 4.0.18 confirmed. ESM-native execution confirmed. jsdom environment confirmed in vitest docs.

---

## Feature 4: Options Page Polish

### No New Stack Required

The existing popup.html serves as both the popup and settings UI. The popup is already using `chrome.storage.sync` for settings persistence (confirmed in manifest permissions: `"storage"` declared). Options page cleanup is CSS/HTML work — no new libraries.

**Options page patterns to apply (no new dependencies):**
- Use `chrome.storage.sync.get()` / `set()` with `Promise`-based wrappers already available in the service worker context
- Options can live in the existing popup.html or in a separate `options/options.html` registered under `"options_page"` in manifest (full-page) or `"options_ui"` (embedded panel in chrome://extensions)
- The manifest currently has no `options_page` or `options_ui` declared — adding it requires only manifest.json changes, no new libraries

**Recommendation:** Keep options in the popup for now (it already works). Registering a separate `options_ui` page is only worth the effort if the settings panel grows beyond 3-4 controls. Current settings (trigger mode, display mode, patent number prefix checkbox) fit cleanly in the popup.

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Playwright for the test harness | The accuracy harness tests pure JS logic (text matching, PDF parsing) — no browser needed. Playwright adds ~300 MB of browser binaries and 10-30s test startup for zero benefit here. | Vitest + Node environment + fixture JSON |
| Jest | Older ESM support; requires Babel transform for native ESM files. The codebase is already ESM-first. | Vitest (same API surface, native ESM, faster) |
| vitest-chrome as sole chrome mock | Published 2023 against Vitest 0.34, only version ever released, no declared peer deps. Risky dependency for a testing setup. | Manual chrome stub in setup.js, supplemented by vitest-chrome if its mock surface is verified adequate |
| Webpack / esbuild / Vite build pipeline | The extension deliberately avoids a build step (all files serve directly as browser assets). Adding a bundler to enable testing would couple test infrastructure to extension architecture. | Vitest's native ESM execution (no build needed) |
| Puppeteer | Older Chromium testing API, less active than Playwright for extension testing. Chrome's own docs now recommend Playwright or Jest for extension testing. | Vitest for unit/accuracy tests |
| sinon-chrome | Last published April 2019, unmaintained, built for a pre-MV3 world. | Manual vi.fn() stubs or vitest-chrome |
| Automated screenshot tooling (Puppeteer/Playwright screenshots) | Store screenshots must show realistic usage context on Google Patents pages — automated screenshots of the extension UI look sterile. Manual screenshots of real usage are more compelling. | Manual screenshots with a real patent page open |
| npm icon resizing packages (jimp, gm, imagemagick) | sharp is the clear ecosystem winner for performance and API quality. No reason to use alternatives. | sharp 0.34.5 |

---

## Package.json Changes

The extension has no root package.json (it loads directly from `src/` as browser assets). Create a root-level package.json solely for dev tooling:

```json
{
  "name": "patent-cite-tool-dev",
  "version": "1.2.0",
  "private": true,
  "type": "module",
  "scripts": {
    "icons": "node scripts/generate-icons.mjs",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  },
  "devDependencies": {
    "sharp": "^0.34.5",
    "vitest": "^4.0.18",
    "vitest-chrome": "^0.1.0"
  }
}
```

**Note:** This package.json is for dev tooling only. It is not part of the Chrome extension artifact — the `src/` directory is packaged for the store, not the root.

---

## Installation

```bash
# From project root (creates root package.json if needed)
npm init -y
npm install -D sharp vitest vitest-chrome

# Generate icons from source SVG (once source artwork is created)
node scripts/generate-icons.mjs

# Run citation accuracy tests
npx vitest run test/accuracy/
```

---

## Version Compatibility

| Package | Version | Compatible With | Notes |
|---------|---------|-----------------|-------|
| vitest | 4.0.18 | Node.js 18+ | Released Dec 2025. Native ESM. Peer-compatible with Vite 6. |
| vitest-chrome | 0.1.0 | vitest ≥0.34 (declared); vitest 4.x (untested, likely works via globalThis pattern) | Published Aug 2023. Verify API surface during implementation. Fallback: manual stubs. |
| sharp | 0.34.5 | Node.js 18.17.0+ | Precompiled native binaries via npm. libvips 8.15+. SVG input supported. |
| @playwright/test | 1.58.2 | N/A for this milestone | Do NOT add — no browser E2E testing planned for v1.2. |

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| vitest | jest | If the codebase used CommonJS throughout, or if the team had strong existing Jest expertise and no ESM files |
| Manual chrome stubs | vitest-chrome | vitest-chrome is adequate if its API surface covers all chrome APIs used; manual stubs are safer given the 2023 publication date |
| sharp for icon generation | Figma export | If the designer already works in Figma and can export all required sizes manually — eliminates the scripting overhead |
| sharp for icon generation | Inkscape CLI | If Inkscape is already installed on all dev machines — functional but not portable |
| Fixtures + captured position maps | Live USPTO/Google fetch in tests | Never: live tests are slow, fragile, rate-limited, and non-deterministic |
| Vitest Node environment | Vitest browser mode | If testing content script behavior that requires real DOM events (drag-select, clipboard). Not needed for citation accuracy testing. |

---

## Sources

- [Chrome Web Store Images documentation](https://developer.chrome.com/docs/webstore/images) — icon sizes (128px), promotional tile (440x280), screenshot (1280x800) requirements (HIGH confidence)
- [Chrome Web Store Listing Requirements](https://developer.chrome.com/docs/webstore/program-policies/listing-requirements/) — metadata accuracy, keyword spam prohibition, privacy field consistency (HIGH confidence)
- [Chrome Web Store Privacy Policies](https://developer.chrome.com/docs/webstore/program-policies/privacy) — mandatory privacy policy if any user data handled, disclosure requirements (HIGH confidence)
- [Chrome Extensions Unit Testing docs](https://developer.chrome.com/docs/extensions/how-to/test/unit-testing) — Jest recommendation, mocking pattern for chrome API, dependency injection approach (HIGH confidence)
- [Vitest 4.0 release announcement](https://vitest.dev/blog/vitest-4) — stable browser mode, Dec 2025 release, current version 4.0.18 (HIGH confidence)
- [vitest-chrome GitHub](https://github.com/probil/vitest-chrome) — Chrome API mock for Vitest, globalThis assignment pattern (MEDIUM confidence — last published 2023, compatibility with Vitest 4 untested)
- [sharp official docs](https://sharp.pixelplumbing.com/) — SVG to PNG, resize, batch processing API (HIGH confidence)
- [sharp npm registry](https://www.npmjs.com/package/sharp) — version 0.34.5 confirmed current (HIGH confidence)
- [Playwright Chrome Extensions docs](https://playwright.dev/docs/chrome-extensions) — persistent context requirement, --load-extension flag, MV3 service worker access (HIGH confidence — documented for reference, not recommended for this milestone)
- [Vitest browser mode InfoQ analysis](https://www.infoq.com/news/2025/12/vitest-4-browser-mode/) — Vitest 4 stable browser mode, visual regression support (MEDIUM confidence — news article, not official docs)

---

*Stack research for: Patent Citation Tool v1.2 — Store Polish + Accuracy Test Harness*
*Researched: 2026-03-02*

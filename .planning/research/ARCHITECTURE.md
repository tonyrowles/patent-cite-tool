# Architecture Research

**Domain:** Chrome Extension (Manifest V3) — Patent Citation Tool v1.2 Store Polish + Accuracy Hardening
**Researched:** 2026-03-02
**Confidence:** HIGH (verified against v1.1 source; Chrome extension testing patterns and icon requirements verified against official Chrome docs)

---

## Existing Architecture (v1.1 — Verified from Source)

This milestone adds testing infrastructure and UI polish to a working v1.1 extension. No structural changes to the core citation pipeline are planned. The architecture below is ground truth from the codebase.

```
Google Patents Tab                    Extension Context
+---------------------+     msg      +----------------------+
| Content Script       |------------>| Service Worker        |
| (classic scripts)    |<------------| - Message router      |
|                      |     msg     | - Offscreen lifecycle |
| text-matcher.js      |             | - chrome.storage.local|
| paragraph-finder.js  |             +----------+-----------+
| citation-ui.js       |                        |
| content-script.js    |              msg (both directions)
+---------------------+              +----------v-----------+
                                     | Offscreen Document    |
                                     | (ES modules)          |
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
                                                    | KV: positionMap JSON  |
                                                    +----------------------+
```

### Component Files (v1.1)

| Component | Files | Module System |
|-----------|-------|---------------|
| Content Script | `src/content/content-script.js`, `text-matcher.js`, `paragraph-finder.js`, `citation-ui.js` | Classic scripts (globals) |
| Service Worker | `src/background/service-worker.js` | ES module |
| Offscreen Document | `src/offscreen/offscreen.js`, `pdf-parser.js`, `position-map-builder.js` | ES modules |
| Shared Constants | `src/shared/constants.js` | Classic script (no export) — service worker and offscreen duplicate inline |
| Popup | `src/popup/popup.html`, `popup.js` | Classic script |
| Icons | `src/icons/` | PNG assets: 16/48/128px, active + inactive variants |
| Manifest | `src/manifest.json` | Static JSON |
| Cloudflare Worker | `worker/` | Separate Wrangler project |

**Critical constraint on module system:** Content scripts are loaded as classic scripts via `manifest.json` `content_scripts` array. They cannot use `import`/`export`. The offscreen document uses ES modules (`<script type="module">`). This is why matching functions are duplicated: `text-matcher.js` (global functions for content script) and identical copies inside `offscreen/offscreen.js`. This tech debt is pre-existing and out of scope for v1.2.

---

## v1.2 New Components

### 1. Test Harness (New — Separate from Extension Bundle)

The test harness lives outside the extension source tree. It tests pure JavaScript parsing and matching logic without a browser. The Chrome extension's module system constraint (classic scripts vs ES modules) means the test runner cannot directly import `content/text-matcher.js`. The test fixtures exercise `offscreen/offscreen.js` matching logic instead, which is already ES-module compatible.

**What is testable without a browser:**
- `matchAndCiteOffscreen()` — pure function, no Chrome API dependencies
- `normalizeTextOffscreen()` — pure string transformation
- `buildPositionMap()` — pure function over plain JS arrays
- `formatCitationOffscreen()` — pure formatting logic
- `whitespaceStrippedMatch()`, `bookendMatch()`, `fuzzySubstringMatch()` — all pure functions
- `findParagraphCitation()` (paragraph-finder.js) — requires a DOM; use `happy-dom` or `jsdom`

**What requires a browser/Chrome APIs (not unit testable):**
- Actual PDF fetch (network, CORS)
- `chrome.storage.local` read/write
- `chrome.runtime.sendMessage` round-trips
- `chrome.offscreen.createDocument`
- Shadow DOM rendering in content script

**Test runner recommendation: Vitest (HIGH confidence)**
- Node-native, zero config, ES module support out of the box
- `environment: 'node'` for pure function tests (no DOM overhead)
- `environment: 'happy-dom'` for paragraph-finder.js DOM walking tests
- No Chrome API mocking needed for the target functions — they have no chrome dependencies
- Fast (sub-second for pure logic tests)

**Integration point:** Tests live in `tests/` at the project root, separate from `src/`. The test runner imports directly from `src/offscreen/` and `src/content/` files — this works because Vitest handles ES modules natively and the files are plain `.js` without any build step requirement.

**Module import strategy for tests:**

The matching functions in `offscreen/offscreen.js` are not exported (they are standalone functions in an IIFE-less module without `export` statements). To make them importable by tests:

Option A (minimal change): Add named exports to `offscreen.js` for testable functions. Since offscreen.js is already an ES module, this requires only adding `export` keywords — zero behavior change.

Option B (extraction): Extract shared pure functions into a new `src/shared/matching.js` ES module, import from both `offscreen.js` and tests. This also resolves the duplication tech debt between `text-matcher.js` and `offscreen.js`. Out of scope for v1.2 but an option to keep in mind.

**Recommendation: Option A.** Add `export` to the functions in `offscreen.js` that need to be tested. One-word change per function, no refactoring, immediately testable.

### 2. Test Fixtures (New Data Files)

Test fixtures provide known inputs and expected outputs for the matching pipeline. They are JSON files, not binary PDFs. The fixture format decouples the test harness from PDF parsing infrastructure.

**Fixture structure:**

```
tests/
  fixtures/
    position-maps/
      US7393678.json        # Pre-computed PositionMap for a known patent
      US11427642.json       # Another patent across different era
      US20230123456.json    # Published application (paragraph citations)
    cases/
      basic-spec-matches.json    # selectedText + expected citation cases
      cross-column-matches.json  # Selection spanning column boundary
      hyphenated-words.json      # Wrap hyphen handling
      fuzzy-matches.json         # Cases requiring fuzzy fallback
      paragraph-citations.json   # Published application cases
  unit/
    matching.test.js        # Tests for matchAndCiteOffscreen()
    normalization.test.js   # Tests for normalizeTextOffscreen()
    position-map.test.js    # Tests for buildPositionMap() logic
    citation-format.test.js # Tests for formatCitationOffscreen()
    paragraph-finder.test.js # Tests for findParagraphCitation()
  package.json              # Vitest + test dependencies
  vitest.config.js          # Vitest configuration
```

**PositionMap fixture format (already defined by position-map-builder.js):**

```json
{
  "patentId": "US7393678B2",
  "generatedAt": "2026-03-02",
  "source": "Google Patents PDF",
  "entries": [
    {
      "page": 3,
      "column": 1,
      "lineNumber": 1,
      "text": "The present invention relates to",
      "hasWrapHyphen": false,
      "section": "description"
    }
  ],
  "meta": {
    "totalLines": 847,
    "totalColumns": 22,
    "hasClaimsSection": true
  }
}
```

**Test case fixture format:**

```json
{
  "positionMapFile": "US7393678.json",
  "cases": [
    {
      "id": "basic-1",
      "description": "Short phrase exact match in spec",
      "selectedText": "present invention relates",
      "contextBefore": "The ",
      "contextAfter": " to a novel",
      "expectedCitation": "1:1",
      "expectedConfidence": 1.0,
      "expectMatch": true
    },
    {
      "id": "fuzzy-1",
      "description": "Smart-quote normalization",
      "selectedText": "inventor\u2019s preferred embodiment",
      "expectedCitation": "3:12",
      "expectMatch": true,
      "minConfidence": 0.95
    }
  ]
}
```

**How fixtures are generated:**

Fixtures cannot be auto-generated by running the extension against live patents (extension APIs required). Instead:

1. **Manual fixture creation:** Run the extension against a known patent, open DevTools in the offscreen document, log `positionMap` to console, copy and save as JSON. Then select specific text passages and note expected citations.

2. **Semi-automated audit script:** Write a Node.js script that reads a pre-saved PDF ArrayBuffer, calls `extractTextFromPdf()` and `buildPositionMap()` locally (these are ES modules with no Chrome API deps), and outputs the PositionMap JSON. This is the faster path.

The audit script pattern is:

```javascript
// scripts/generate-fixture.mjs
import { readFile } from 'fs/promises';
import { extractTextFromPdf } from '../src/offscreen/pdf-parser.js';
import { buildPositionMap } from '../src/offscreen/position-map-builder.js';

// pdf-parser.js requires PDF.js which needs GlobalWorkerOptions.workerSrc
// In Node context, use pdfjs-dist directly with workerSrc = ''
```

**Important:** `pdf-parser.js` uses `chrome.runtime.getURL()` to set the PDF.js worker URL. This Chrome API call breaks in Node. The audit/fixture generation script must either:
- Patch `GlobalWorkerOptions.workerSrc` before calling `extractTextFromPdf()`, or
- Use the standalone `pdfjs-dist` npm package directly (not the bundled `src/lib/pdf.mjs`)

This is a one-time setup concern for fixture generation, not for running tests (tests consume pre-generated fixtures as JSON, not PDFs).

### 3. Options Page (New HTML/JS File)

The popup currently contains both status display and settings. The options page extracts settings into a dedicated page reachable via right-click on the extension icon.

**MV3 manifest configuration (HIGH confidence — verified against official Chrome docs):**

```json
{
  "options_ui": {
    "page": "options/options.html",
    "open_in_tab": true
  }
}
```

Using `open_in_tab: true` opens options in a full Chrome tab rather than embedded in `chrome://extensions`. This is the recommended pattern for settings that benefit from more screen space. The popup can link to options via `chrome.runtime.openOptionsPage()`.

**New files:**
- `src/options/options.html`
- `src/options/options.js`

**What moves from popup to options page:**
- Trigger mode selector (floating button / auto / context menu / silent)
- Display mode selector (default / advanced)
- Include patent number prefix checkbox

**What stays in popup:**
- Current patent status display
- Quick visual indicator (ready/fetching/error)
- Link to open options

**Options page storage:** Uses the same `chrome.storage.sync` keys as the popup (trigger-mode, display-mode, include-patent-number). No migration needed.

### 4. Icon Set (Asset Replacement)

The extension already has icons at `src/icons/`. The v1.2 goal is to replace placeholder icons with a proper icon set.

**Required sizes per Chrome extension specs (HIGH confidence — official Chrome docs):**

| Size | Purpose | Key |
|------|---------|-----|
| 16px | Toolbar (normal DPI), favicon in browser | `action.default_icon` + `icons` |
| 32px | Windows taskbar, high-DPI toolbar | `icons` (optional but recommended) |
| 48px | Extensions management page (chrome://extensions) | `icons` |
| 128px | Chrome Web Store listing, installation dialog | `icons` |

**Current manifest uses both `action.default_icon` and `icons`:**
- `icons` key: the extension's identity icon (store + chrome://extensions)
- `action.default_icon`: the toolbar button icon

**The existing manifest already declares active/inactive variants:**
```json
"action": {
  "default_icon": {
    "16": "icons/icon-inactive-16.png",
    "48": "icons/icon-inactive-48.png",
    "128": "icons/icon-inactive-128.png"
  }
},
"icons": {
  "16": "icons/icon-active-16.png",
  "48": "icons/icon-active-48.png",
  "128": "icons/icon-active-128.png"
}
```

**Add 32px variants:** The current manifest does not include 32px icons. Add `icon-active-32.png` and `icon-inactive-32.png` to the `icons` and `action.default_icon` sections. This improves appearance on Windows high-DPI displays.

**Chrome Web Store 128px requirement:** The store icon must be exactly 128x128 PNG with 16px transparent padding on each side (effective artwork area 96x96px for square icons, ~112px diameter for circular icons). This is different from what many developers expect — the artwork should not fill the full 128x128.

**Format constraint (HIGH confidence):** Icons must be raster PNG (or other Blink-supported rasters: BMP, GIF, ICO, JPEG). SVG and WebP are not supported. No build step required — raw PNG files are placed directly in `src/icons/`.

**No manifest.json structure change required.** Replace the PNG files in `src/icons/`, add 32px variants, update the `icons` and `action.default_icon` sections to include the `"32"` key.

### 5. Chrome Web Store Assets (New — Non-Extension Files)

Store assets live outside the extension source tree. They are uploaded directly to the Chrome Web Store developer dashboard, not bundled into the extension .zip.

**Required store assets (HIGH confidence — verified against official Chrome Web Store docs):**

| Asset | Dimensions | Format | Notes |
|-------|-----------|--------|-------|
| Extension icon | 128x128 | PNG | Same as `src/icons/icon-active-128.png` — already exists |
| Small promotional tile | 440x280 | PNG | Required for prominent store display |
| Screenshot(s) | 1280x800 or 640x400 | PNG or JPG | At least 1 required, up to 5 allowed |

**Optional store assets:**
| Asset | Dimensions | Notes |
|-------|-----------|-------|
| Marquee promotional image | 1400x560 | Extensions without small tile shown after those with it |

**Where to store these locally:**
```
store-assets/
  icon-128.png              # Copy of src/icons/icon-active-128.png
  promotional-440x280.png   # Small tile
  screenshot-1.png          # 1280x800, shows citation being generated
  screenshot-2.png          # 1280x800, shows silent mode or options
  privacy-policy.md         # Text version; must be hosted at a URL
```

**Privacy policy requirement:** Because the extension stores data locally (IndexedDB) and uploads position maps to Cloudflare KV (shared cache), a privacy policy is required. The store submission form requires a URL to a hosted privacy policy. The privacy policy must disclose what data is collected and how it is used.

**Privacy policy key disclosures for this extension:**
- Patent position maps are uploaded to a shared server-side cache (Cloudflare KV) to improve performance for all users
- No personally identifiable information is collected
- Patent numbers searched/cited are not logged
- The cached data (patent text extracted from public PDFs) is not private

---

## System Overview (v1.2 — Full)

```
Chrome Extension Source (src/)
+-----------------------------------------------------+
| manifest.json            — Updated: +32px icons,    |
|                              options_ui              |
| icons/                   — New: 32px, quality icons  |
| background/              — Unchanged                 |
| content/                 — Unchanged                 |
| offscreen/               — Minor: add test exports   |
| shared/                  — Unchanged                 |
| popup/                   — Modified: link to options |
| options/                 — New: options.html/.js     |
+-----------------------------------------------------+

Test Infrastructure (tests/) — NOT bundled into extension
+-----------------------------------------------------+
| vitest.config.js                                     |
| package.json (vitest, happy-dom)                     |
| fixtures/position-maps/*.json   — Pre-built maps     |
| fixtures/cases/*.json           — Input/expected     |
| unit/matching.test.js           — matchAndCite tests |
| unit/normalization.test.js      — text norm tests    |
| unit/position-map.test.js       — parser logic tests |
| unit/paragraph-finder.test.js   — DOM walk tests     |
+-----------------------------------------------------+

Store Assets (store-assets/) — NOT bundled into extension
+-----------------------------------------------------+
| icon-128.png                                         |
| promotional-440x280.png                              |
| screenshot-1.png, screenshot-2.png                   |
| privacy-policy.md                                    |
+-----------------------------------------------------+
```

---

## Integration Points: New vs. Modified Components

| Component | Status | Change Description |
|-----------|--------|--------------------|
| `src/manifest.json` | Modified | Add `options_ui`, add `"32"` icon sizes |
| `src/icons/*.png` | Modified | Replace placeholder PNGs with proper icon set; add 32px variants |
| `src/popup/popup.html` | Modified | Remove settings UI; add link to options page |
| `src/popup/popup.js` | Modified | Remove settings save/load; add `chrome.runtime.openOptionsPage()` call |
| `src/options/options.html` | **New** | Settings form (trigger mode, display mode, patent number prefix) |
| `src/options/options.js` | **New** | Settings read/write via `chrome.storage.sync` |
| `src/offscreen/offscreen.js` | Minor modification | Add `export` keyword to testable pure functions |
| `tests/` directory | **New** | Vitest test harness, fixtures, test cases |
| `tests/package.json` | **New** | `vitest`, `happy-dom` dependencies |
| `store-assets/` directory | **New** | Chrome Web Store submission assets |

### What Explicitly Does NOT Change

- `src/background/service-worker.js` — no changes for UI/icon work; algorithm fixes may modify it during accuracy audit
- `src/content/content-script.js` — no structural changes; algorithm fixes may touch matching logic
- `src/content/text-matcher.js` — may receive algorithm fixes found during audit
- `src/offscreen/pdf-parser.js` — no changes expected
- `src/offscreen/position-map-builder.js` — may receive algorithm fixes found during audit
- `src/shared/constants.js` — no changes
- IndexedDB schema — no changes
- Cloudflare Worker — no changes (already deployed from v1.1)
- `worker/` directory — no changes

---

## Data Flow: Test Harness Pipeline

The test harness does not run through Chrome APIs. It exercises the parsing and matching pipeline directly in Node.

```
Test Fixture (JSON)
  → tests/unit/matching.test.js
    → import { matchAndCiteOffscreen } from '../../src/offscreen/offscreen.js'
      → import { buildPositionMap } from '../../src/offscreen/position-map-builder.js'
    → Load positionMap from fixture file (JSON.parse, no PDF needed)
    → Call matchAndCiteOffscreen(selectedText, positionMap, contextBefore, contextAfter)
    → Assert: citation === expectedCitation, confidence >= minConfidence
```

For position-map builder tests:

```
Raw text items (inline test data, no PDF)
  → tests/unit/position-map.test.js
    → import { buildPositionMap } from '../../src/offscreen/position-map-builder.js'
    → Call buildPositionMap([{ pageNum, items: [...], pageWidth, pageHeight }])
    → Assert: correct column numbers, line numbers, section tags
```

For paragraph-finder DOM tests:

```
HTML string (inline or from fixture)
  → tests/unit/paragraph-finder.test.js (environment: 'happy-dom')
    → import { findParagraphCitation } from '../../src/content/paragraph-finder.js'
    → Set document.body.innerHTML = htmlFixture
    → Simulate text selection (set window.getSelection mock)
    → Assert: citation matches expected paragraph number
```

**Paragraph-finder import constraint:** `paragraph-finder.js` is a classic script (no export). To import it in tests, either:
- Add `export` to the functions needed
- Or use Vitest's `vi.importActual` with a wrapper

Recommendation: Add `export` to `findParagraphCitation` in `paragraph-finder.js`. Same pattern as offscreen.js.

---

## Build Order for v1.2

Build order is sequenced to deliver value early and avoid blocking on unknown quantities.

```
Phase 1: Test Harness Foundation
  Why first: Fixtures and test infrastructure are prerequisites for the
  accuracy audit. Building the harness before auditing ensures findings
  are captured as reproducible test cases, not one-off observations.

  Steps:
  1a. Set up tests/package.json, vitest.config.js
  1b. Add exports to offscreen.js (matchAndCiteOffscreen, normalizeTextOffscreen, etc.)
  1c. Add exports to paragraph-finder.js (findParagraphCitation)
  1d. Write fixture generation script (scripts/generate-fixture.mjs)
  1e. Generate 3-5 PositionMap fixtures from known patents
  1f. Write test cases for known correct citations
  1g. Verify tests pass against current code (establish baseline)

Phase 2: Accuracy Audit + Algorithm Fixes
  Why second: Cannot fix accuracy without a test harness to capture failures
  and verify fixes. The audit findings may generate new test cases that drive
  algorithm changes. Algorithm fixes feed back into the test suite.

  Steps:
  2a. Manually audit 15-20 patents across era/type/length spectrum
      - Short spec (< 20 cols), long spec (> 60 cols)
      - Early-era patents (pre-2000), modern patents (2020+)
      - Claims-only selections, cross-column selections
      - Published applications (paragraph citations)
  2b. For each failure: add test case to fixtures, diagnose root cause
  2c. Fix algorithm issues found (position-map-builder.js, text-matcher logic)
  2d. Verify all existing test cases still pass after each fix
  2e. Iterate until audit sample passes at acceptable rate

Phase 3: Store Polish
  Why third: Does not depend on accuracy work. Could run in parallel with
  Phase 2 if bandwidth allows. Delivers the visual/UX milestone independently.

  Steps:
  3a. Design and create icon set (16/32/48/128px, active + inactive)
  3b. Update manifest.json: add 32px icon keys
  3c. Replace src/icons/*.png with new icons
  3d. Create src/options/options.html and options.js
  3e. Update manifest.json: add options_ui section
  3f. Strip settings from popup, add link to options
  3g. Create store-assets/ with promotional tile and screenshots
  3h. Write privacy policy (markdown + hosted at a URL)
  3i. Load unpacked and verify: icon appearance, options page, popup link

Phase 4: Store Submission
  Why last: Requires completed extension (all phases), privacy policy URL,
  and store assets. Chrome Web Store review typically takes 1-7 days.

  Steps:
  4a. Increment version in manifest.json
  4b. Zip src/ directory for submission
  4c. Fill out store listing (name, description, category, screenshots)
  4d. Submit for review
```

---

## Architecture Patterns

### Pattern 1: Pure-Function Extraction for Testability

**What:** The matching and citation logic in `offscreen.js` is already expressed as pure functions (no side effects, no Chrome API calls). Tests can import and call these functions directly.

**When to use:** Any function that transforms input data to output data without I/O or browser API calls qualifies. The test harness targets exactly these functions.

**Trade-off:** The offscreen.js matching functions are currently not exported (no `export` keyword). Adding `export` is a one-word change with zero behavioral impact. The only risk is accidentally exporting internal helpers that change in future refactors, breaking tests unnecessarily. Export only the top-level entry points (`matchAndCiteOffscreen`, `normalizeTextOffscreen`, `buildPositionMap`) and avoid exporting internal helpers.

**Example:**

```javascript
// src/offscreen/offscreen.js — add export to existing function
export function matchAndCiteOffscreen(selectedText, positionMap, contextBefore, contextAfter) {
  // existing implementation unchanged
}

// tests/unit/matching.test.js
import { matchAndCiteOffscreen } from '../../src/offscreen/offscreen.js';
import positionMap from '../fixtures/position-maps/US7393678.json' assert { type: 'json' };

test('exact match in specification', () => {
  const result = matchAndCiteOffscreen('present invention relates', positionMap.entries, '', '');
  expect(result.citation).toBe('1:1');
  expect(result.confidence).toBe(1.0);
});
```

### Pattern 2: Fixture-Driven Regression Testing

**What:** Test cases expressed as JSON fixtures (input + expected output) rather than hardcoded in test files. Fixtures can be generated from observed extension behavior and serve as regression anchors for future algorithm changes.

**When to use:** When test inputs are data-heavy (long patent text strings, position map arrays). When the test suite needs to grow without requiring test file edits (new cases are just new JSON entries).

**Trade-off:** Fixtures can go stale if the expected citation format changes. Include `expectedCitation` as a string that must be updated when format changes occur — this is intentional (it forces explicit acknowledgment of format changes).

### Pattern 3: Options Page as Separate Page vs. Embedded

**What:** `options_ui` with `open_in_tab: true` opens the options page in a full Chrome tab rather than embedding it in the chrome://extensions iframe.

**When to use:** When settings benefit from full-width layout. When options page needs to use Chrome APIs that are unavailable in embedded mode (e.g., Tabs API). When users should have a full back-button-navigable URL for options.

**Trade-off:** Full-page options feel slightly less integrated than embedded panels. For this extension the settings are simple enough that either works, but `open_in_tab: true` avoids the subtle embedded-mode API restrictions (Tabs API unavailable).

### Pattern 4: Test Infrastructure Outside Extension Bundle

**What:** The `tests/` directory and its `package.json` live at the project root, not inside `src/`. The extension bundle (zipped `src/`) never includes test files or Vitest dependencies.

**When to use:** Always. Test infrastructure should never ship to end users.

**Trade-off:** Requires a second `package.json` (the `worker/` directory already has one, establishing the precedent). The extension source `src/` remains dependency-free — just HTML, JS, and PNG files.

---

## Anti-Patterns

### Anti-Pattern 1: Testing Against Chrome APIs in Unit Tests

**What people do:** Write tests that call `chrome.storage.sync.get()` or `chrome.runtime.sendMessage()`, then mock the entire chrome namespace.

**Why it's wrong for this project:** The valuable logic (text matching, position map building, citation formatting) has no Chrome API dependencies at all. Adding chrome mocks to test pure functions adds setup complexity with zero testing value. Mock boundaries should fall at the function level, not at the Chrome API level.

**Do this instead:** Test the pure functions directly. Accept that message-passing flows and storage interactions are validated by manual load-unpacked testing, not automated unit tests.

### Anti-Pattern 2: Binary PDF Files as Test Fixtures

**What people do:** Commit binary PDF files to the test fixtures directory and have tests run the full PDF.js extraction pipeline.

**Why it's wrong:** PDFs are large binary files (2-15 MB each) unsuitable for version control. PDF.js requires the worker URL to be configured (`GlobalWorkerOptions.workerSrc`), which depends on `chrome.runtime.getURL()` — a Chrome API. Running the full pipeline in tests requires extensive mocking infrastructure.

**Do this instead:** Separate fixture generation (a one-time script that runs outside tests) from test execution. Tests consume pre-extracted PositionMap JSON files, not PDFs. The JSON fixtures are small, human-readable, and version-control friendly.

### Anti-Pattern 3: Modifying popup.js to Remove Settings Without Creating Options Page First

**What people do:** Remove settings from the popup before the options page exists, leaving users with no way to change settings.

**Why it's wrong:** Even if options page work is in the same phase, the order matters. Users loading an intermediate build of the extension would lose access to settings.

**Do this instead:** Build and verify `options.html` / `options.js` first. Then strip settings from the popup and add the "Open Settings" link. Verify the full flow (popup link → options page → settings persist) before committing either change.

### Anti-Pattern 4: Changing Algorithm Logic Without Test Coverage First

**What people do:** Identify an accuracy failure, modify the matching algorithm, verify the one failing case passes, ship.

**Why it's wrong for this milestone:** Algorithm changes in the matching pipeline can fix one case while silently breaking others (the matching functions have complex interactions between exact, whitespace-stripped, bookend, and fuzzy paths). Without test coverage, the regression surface is invisible.

**Do this instead:** Write the failing case as a test fixture before touching the algorithm. Verify the test fails with current code. Fix the algorithm. Verify the new test passes and all existing tests still pass. This is the minimum viable regression harness for algorithm changes.

---

## Integration Constraints

### Test Harness Boundary: What Vitest Can and Cannot Reach

| Function | In File | Exportable? | Chrome APIs? | Testable in Vitest |
|----------|---------|-------------|-------------|---------------------|
| `matchAndCiteOffscreen()` | offscreen.js | After adding `export` | None | Yes |
| `normalizeTextOffscreen()` | offscreen.js | After adding `export` | None | Yes |
| `buildPositionMap()` | position-map-builder.js | Already exported | None | Yes |
| `extractTextFromPdf()` | pdf-parser.js | Already exported | `chrome.runtime.getURL` | Requires patch |
| `findParagraphCitation()` | paragraph-finder.js | After adding `export` | None | Yes (happy-dom env) |
| `matchAndCite()` | text-matcher.js | No (classic script globals) | None | No (no export syntax) |
| `lookupPosition()` | offscreen.js | No (uses IndexedDB) | None directly | No (IndexedDB deps) |
| `handleLookupPosition()` | service-worker.js | No (uses chrome.tabs) | chrome.tabs, chrome.runtime | No |

**For `extractTextFromPdf()` in fixture generation script only:** Patch `GlobalWorkerOptions.workerSrc = ''` before calling. PDF.js falls back to main-thread parsing when worker fails to load — acceptable for a one-time fixture generation script.

### Options Page Storage Compatibility

The options page must read and write the same `chrome.storage.sync` keys as the current popup. Current popup keys (from popup.js source):

- `triggerMode` — string: `'floating-button'` | `'auto'` | `'context-menu'` | `'silent'`
- `displayMode` — string: `'default'` | `'advanced'`
- `includePatentNumber` — boolean

No key migration needed. The options page JavaScript uses identical `chrome.storage.sync.get()` / `set()` calls. The popup JavaScript simplifies to only display-related reads and a button to open options.

### Icon Asset Pipeline

No build step. Icons are static PNG files dropped into `src/icons/`. The manifest references them by filename. Workflow:

1. Design tool (Figma, Inkscape, etc.) exports: `icon-active-16.png`, `icon-active-32.png`, `icon-active-48.png`, `icon-active-128.png`, `icon-inactive-16.png`, `icon-inactive-32.png`, `icon-inactive-48.png`, `icon-inactive-128.png`
2. Files placed in `src/icons/` (replacing existing placeholders)
3. `manifest.json` updated to include `"32"` key in both `icons` and `action.default_icon` sections
4. Load unpacked in Chrome, verify appearance at each size

---

## Sources

- [Chrome Developers: Unit Testing Chrome Extensions](https://developer.chrome.com/docs/extensions/how-to/test/unit-testing) — HIGH confidence (official)
- [Chrome Developers: Configure extension icons](https://developer.chrome.com/docs/extensions/develop/ui/configure-icons) — HIGH confidence (official)
- [Chrome Developers: Manifest - Icons reference](https://developer.chrome.com/docs/extensions/reference/manifest/icons) — HIGH confidence (official)
- [Chrome Developers: Give users options](https://developer.chrome.com/docs/extensions/develop/ui/options-page) — HIGH confidence (official)
- [Chrome Developers: Supplying Images (Web Store)](https://developer.chrome.com/docs/webstore/images) — HIGH confidence (official; 440x280 small tile required for prominent placement, 1280x800 screenshots)
- [Vitest: Getting Started](https://vitest.dev/guide/) — HIGH confidence (official)
- [Vitest: Test Environment Configuration](https://vitest.dev/config/environment.html) — HIGH confidence (official; `node` and `happy-dom` environment options)
- v1.1 extension source code — HIGH confidence (ground truth for existing architecture)

---

*Architecture research for: Patent Citation Tool v1.2 — Store Polish + Accuracy Hardening*
*Researched: 2026-03-02*

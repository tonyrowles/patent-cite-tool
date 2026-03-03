# Phase 2: PDF Parsing Pipeline - Research

**Researched:** 2026-02-28
**Domain:** PDF text extraction, two-column layout analysis, Chrome Extension MV3 integration
**Confidence:** MEDIUM

## Summary

This phase requires extracting positioned text from US patent PDFs using PDF.js within a Chrome MV3 offscreen document, then detecting the two-column specification section and building a PositionMap data structure. The core technology is `pdfjs-dist` (latest v5.4.624), which provides `getTextContent()` to extract text items with transform matrices encoding x,y coordinates, width, height, and font information.

The primary technical challenge is threefold: (1) configuring PDF.js to work within the offscreen document's constrained environment (no bundler, MV3 CSP restrictions), (2) reliably detecting where the two-column specification begins across patents from different decades, and (3) accurately clustering text items into columns and lines using x/y coordinate analysis. The offscreen document already fetches and stores patent PDFs in IndexedDB (Phase 1), so Phase 2 extends this document to also parse the stored PDF.

**Primary recommendation:** Use `pdfjs-dist` loaded as static script files in the offscreen document, with the worker file referenced via `chrome.runtime.getURL()`. Detect specification pages by layout analysis (page has two distinct x-coordinate clusters of text items), not by keyword matching. Build PositionMap by sorting text items into columns by x-coordinate threshold and into lines by y-coordinate clustering.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Map both the description AND claims sections (not just description)
- Use layout-first detection: identify specification start by finding the first page with two-column text layout (more robust than keyword matching across eras)
- Skip figure pages entirely — detect and exclude pages that are primarily figures/drawings
- Skip non-standard pages (single-column, landscape, continuation sheets) — only process pages matching two-column text layout
- Column numbers are document-wide (1, 2, 3, 4...) matching attorney citation convention (e.g., "col. 4, ln. 5")
- Line numbers assigned by Y-coordinate clustering — group text items with similar y-coordinates into lines, line 1 is topmost text in each column, reset per column
- Filter out headers/footers (patent number, page number) before line counting — attorneys don't cite these
- Accuracy target: ±1 line is acceptable in edge cases
- Line-level entries storing raw PDF text (with line-break hyphens as they appear in the PDF)
- Flag line-ending wrap hyphens with a boolean — helps Phase 3 distinguish word-wrap hyphens from real hyphens
- Fields per entry: page, column (document-wide), lineNumber (within column), text (raw), hasWrapHyphen, x/y bounding box coordinates, section ("description" or "claims")
- Bounding box coordinates stored for potential future PDF highlighting, not needed for citation generation
- Optimize for patents from ~2000 onward; support older patents best-effort (±2 line tolerance acceptable for pre-2000)
- Fail gracefully when PDF has no text layer: clear message "This patent PDF has no text layer. Citation not available." — no client-side OCR
- Validation test set: Claude picks 5+ representative patents spanning different eras and formats

### Claude's Discretion
- Claims boundary detection approach (text marker like "What is claimed is:" vs layout heuristic)
- Exact Y-coordinate clustering tolerance for line grouping
- Header/footer detection heuristics
- Column boundary x-coordinate threshold logic
- Validation test set patent selection

### Deferred Ideas (OUT OF SCOPE)
- USPTO API fallback for PDFs missing text layers (automatic OCR'd PDF retrieval and retry) — future enhancement, aligns with DATA-01
- PDF highlighting using stored bounding box coordinates — potential v2 feature
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PDF-02 | Extension extracts text with position data from the PDF's existing OCR/text layer (no client-side OCR) | PDF.js `getTextContent()` returns TextItem objects with `str`, `transform` (x,y coordinates), `width`, `height`, `hasEOL`, `fontName`. Transform array `[a,b,c,d,e,f]` where index 4=x, index 5=y in PDF coordinate space (bottom-left origin). |
| PDF-03 | Extension detects the two-column specification section, skipping cover page, preliminary material, and figures | Layout-first detection: analyze each page's text items for bimodal x-coordinate distribution. Two-column pages show two distinct x clusters (left column ~50-300pt, right column ~310-560pt on letter-size). Figure pages have sparse/no text items. Cover pages have single-column mixed layout. |
| PDF-04 | Extension builds a column/line map by clustering text items by x-coordinate into columns | X-coordinate threshold separates left/right columns (midpoint of page ~306pt for letter-size 612pt wide). Y-coordinate clustering groups items into lines (tolerance ~2-3pt for same-line grouping). Sort lines by descending y (top-first since PDF origin is bottom-left). |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| pdfjs-dist | 5.4.x | PDF text extraction with position data | Only mature browser-side PDF parser; used by Firefox internally; provides getTextContent() with transform matrices for text positioning |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none) | - | - | Column/line clustering is custom logic, no library needed |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| pdfjs-dist | pdf.js-extract (npm) | Wrapper around pdfjs-dist that simplifies extraction API, but adds dependency and may not work in offscreen document context. Use pdfjs-dist directly for control. |
| Custom column detection | pdf-parse, Tabula.js | These are Node.js libraries, not browser-compatible. pdfjs-dist is the only viable browser option. |

**Installation:**
No npm install -- this is a no-bundler Chrome extension. Download `pdf.mjs` and `pdf.worker.mjs` from pdfjs-dist and include as static files in the extension. Reference worker via `chrome.runtime.getURL()`.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── offscreen/
│   ├── offscreen.html          # Load pdf.mjs as script
│   ├── offscreen.js            # Existing fetch logic + new parse orchestration
│   ├── pdf-parser.js           # PDF.js text extraction (getTextContent per page)
│   └── position-map-builder.js # Column/line clustering, PositionMap construction
├── shared/
│   ├── constants.js            # Add new message types (PARSE_PDF, PARSE_RESULT)
│   └── position-map.js         # PositionMap data structure definition/types
└── lib/
    ├── pdf.mjs                 # pdfjs-dist display layer (vendored)
    └── pdf.worker.mjs          # pdfjs-dist worker layer (vendored)
```

### Pattern 1: PDF.js in Offscreen Document
**What:** Load pdfjs-dist as static script files in the offscreen HTML document. The offscreen document already handles PDF fetch; extend it to also parse.
**When to use:** Always -- parsing must happen where IndexedDB access exists and DOM APIs are available.
**Example:**
```html
<!-- offscreen.html -->
<script src="../lib/pdf.mjs" type="module"></script>
<script src="offscreen.js" type="module"></script>
```

```javascript
// pdf-parser.js
// Import from the global pdfjsLib set by pdf.mjs
const pdfjsLib = globalThis.pdfjsLib;

// Set worker source to bundled file
pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdf.worker.mjs');

async function extractTextItems(pdfData) {
  const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
  const allItems = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1.0 });

    const pageItems = textContent.items
      .filter(item => item.str.trim().length > 0)
      .map(item => ({
        text: item.str,
        x: item.transform[4],
        y: item.transform[5],
        width: item.width,
        height: item.height,
        fontName: item.fontName,
        hasEOL: item.hasEOL,
        pageNum: i,
        pageWidth: viewport.width,
        pageHeight: viewport.height,
      }));

    allItems.push({ pageNum: i, items: pageItems, viewport });
  }

  return allItems;
}
```

### Pattern 2: Two-Column Layout Detection
**What:** Detect specification pages by analyzing x-coordinate distribution of text items on each page.
**When to use:** To identify where the two-column specification begins and which pages to process.
**Example:**
```javascript
function isTwoColumnPage(pageItems, pageWidth) {
  if (pageItems.length < 20) return false; // Too few items = figure or blank page

  const midX = pageWidth / 2;
  let leftCount = 0;
  let rightCount = 0;

  for (const item of pageItems) {
    if (item.x < midX) leftCount++;
    else rightCount++;
  }

  // Two-column page has substantial text in both halves
  const ratio = Math.min(leftCount, rightCount) / Math.max(leftCount, rightCount);
  return ratio > 0.3 && (leftCount + rightCount) > 30;
}
```

### Pattern 3: Y-Coordinate Line Clustering
**What:** Group text items with similar y-coordinates into lines, handling slight vertical misalignment.
**When to use:** After separating items into columns, to assign line numbers.
**Example:**
```javascript
function clusterIntoLines(items, yTolerance = 3) {
  // Sort by y descending (top of page first, since PDF y=0 is bottom)
  const sorted = [...items].sort((a, b) => b.y - a.y);

  const lines = [];
  let currentLine = [sorted[0]];
  let currentY = sorted[0].y;

  for (let i = 1; i < sorted.length; i++) {
    if (Math.abs(sorted[i].y - currentY) <= yTolerance) {
      currentLine.push(sorted[i]);
    } else {
      // Sort items within line by x (left to right)
      currentLine.sort((a, b) => a.x - b.x);
      lines.push(currentLine);
      currentLine = [sorted[i]];
      currentY = sorted[i].y;
    }
  }
  if (currentLine.length > 0) {
    currentLine.sort((a, b) => a.x - b.x);
    lines.push(currentLine);
  }

  return lines;
}
```

### Pattern 4: Header/Footer Filtering
**What:** Remove text items that are headers (patent number) or footers (page numbers, sheet info) before line counting.
**When to use:** Before clustering into lines -- attorneys don't cite header/footer text.
**Example:**
```javascript
function filterHeadersFooters(items, pageHeight) {
  // Patent headers typically in top ~40pt, footers in bottom ~30pt
  const headerThreshold = pageHeight - 40; // PDF y origin is bottom
  const footerThreshold = 30;

  return items.filter(item => {
    return item.y > footerThreshold && item.y < headerThreshold;
  });
}
```

### Anti-Patterns to Avoid
- **Keyword-based section detection:** Do NOT search for "DETAILED DESCRIPTION" or "BACKGROUND" text to find the specification. Patent formats vary wildly across decades. Layout analysis (two-column detection) is far more robust.
- **Fixed column x-coordinate thresholds:** Do NOT hardcode x=306 as the column boundary. Different patents and eras have different margins. Calculate the midpoint dynamically from the page's actual text item distribution.
- **Processing all pages:** Do NOT extract text from every page. Cover pages, figure pages, and continuation sheets produce noise. Filter to two-column pages only.
- **Assuming consistent font sizes:** Do NOT assume all specification text is the same font size. Patent PDFs from different eras use different fonts and sizes. Use y-coordinate clustering, not font-size-based line height calculation.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PDF text extraction | Custom PDF parser | pdfjs-dist `getTextContent()` | PDF format is enormously complex; text can be encoded in dozens of ways. PDF.js handles all of them. |
| PDF coordinate math | Manual transform matrix decomposition | Use `transform[4]` and `transform[5]` directly | The transform matrix can include rotation/skew, but patent PDFs are always axis-aligned so direct index access works. |
| PDF loading from binary | Custom ArrayBuffer handling | pdfjs-dist `getDocument({ data: arrayBuffer })` | PDF.js handles incremental loading, cross-reference tables, encryption detection, etc. |

**Key insight:** The only custom logic needed is column/line clustering. Everything about reading the PDF should use PDF.js.

## Common Pitfalls

### Pitfall 1: PDF.js Worker Configuration in Chrome Extension
**What goes wrong:** PDF.js tries to load its worker from a relative URL that doesn't resolve in the extension context. Falls back to "fake worker" (main thread) which works but logs warnings.
**Why it happens:** Chrome extensions have a special URL scheme (`chrome-extension://`). PDF.js worker URL resolution assumes standard web URLs.
**How to avoid:** Explicitly set `GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdf.worker.mjs')` before calling `getDocument()`. Include `pdf.worker.mjs` in the extension's `web_accessible_resources` if needed.
**Warning signs:** Console message "Setting up fake worker" or "No GlobalWorkerOptions.workerSrc specified."

### Pitfall 2: PDF Coordinate System is Bottom-Left Origin
**What goes wrong:** Text items appear in wrong order when sorted by y-coordinate, because developers assume top-left origin (like CSS/canvas).
**Why it happens:** PDF specification uses bottom-left as origin. Y=0 is the bottom of the page. Higher y values are closer to the top.
**How to avoid:** Sort by y DESCENDING for top-to-bottom order. The first line of text has the HIGHEST y value.
**Warning signs:** Line 1 contains footer text, last line contains header text.

### Pitfall 3: Text Items Are Fragments, Not Lines
**What goes wrong:** Developer assumes each TextItem from `getTextContent()` is a complete line of text. In reality, PDF.js returns fragments -- sometimes individual words, sometimes partial words, sometimes multiple words.
**Why it happens:** PDF text is stored as positioned drawing operations, not semantic lines. PDF.js returns items as the PDF encodes them.
**How to avoid:** Cluster fragments by y-coordinate into lines, then concatenate fragment `.str` values within each line (ordered by x-coordinate) to reconstruct the full line text.
**Warning signs:** PositionMap entries contain single words or partial words instead of full lines.

### Pitfall 4: getTextContent Returns Empty Items
**What goes wrong:** Some TextItem objects have empty `.str` or whitespace-only content, polluting clustering results.
**Why it happens:** PDFs encode whitespace as explicit text operations.
**How to avoid:** Filter out items where `item.str.trim().length === 0` before processing.
**Warning signs:** Extra "blank" lines in PositionMap, incorrect line count.

### Pitfall 5: Offscreen Document Script Loading Order
**What goes wrong:** `pdf.mjs` is loaded as ES module but `offscreen.js` tries to use `pdfjsLib` before it's available.
**Why it happens:** ES modules have asynchronous loading. Script execution order in offscreen documents may not match `<script>` tag order when mixing module and classic scripts.
**How to avoid:** Either make all scripts ES modules with explicit imports, or load `pdf.mjs` as a classic script (non-module) if the build supports it. Alternatively, use dynamic `import()` within offscreen.js to load pdfjs-dist on demand.
**Warning signs:** `pdfjsLib is not defined` or `Cannot access before initialization` errors.

### Pitfall 6: Patent PDFs Without Text Layer
**What goes wrong:** `getTextContent()` returns empty or near-empty results for scanned-image-only PDFs.
**Why it happens:** Older patents (~pre-1990s digitization) may be pure image scans without OCR text layer. Some newer patents may also have missing text layers.
**How to avoid:** After extracting text from first few pages, check if total text item count is below a threshold (e.g., < 10 items on a page that should have ~130 lines of text). If so, fail gracefully with the "no text layer" message.
**Warning signs:** PositionMap is empty or has very few entries for a patent that clearly has text when viewed visually.

### Pitfall 7: Column Number Off-By-One
**What goes wrong:** Column numbering doesn't match attorney convention. Left column of page 2 should be "column 3" (not "column 1" again).
**Why it happens:** Developer resets column count per page instead of continuing document-wide.
**How to avoid:** Track a running column counter across pages. Each two-column page adds 2 to the counter. First spec page has columns 1,2; second spec page has columns 3,4; etc.
**Warning signs:** All pages report columns 1 and 2.

### Pitfall 8: Wrap Hyphen Detection
**What goes wrong:** Real hyphens (e.g., "well-known") are incorrectly flagged as wrap hyphens.
**Why it happens:** Both wrap hyphens and real hyphens appear as "-" at line endings.
**How to avoid:** A line-ending hyphen is a wrap hyphen only if: (1) the text ends with "-", (2) the next line in the same column starts with a lowercase letter (continuation of a word). If the next line starts with uppercase or the hyphenated word is a known compound, it's likely a real hyphen.
**Warning signs:** Phase 3 incorrectly joins "well-" + "known" into "wellknown".

## Code Examples

### Loading PDF from IndexedDB and Parsing
```javascript
// Source: Combination of existing offscreen.js pattern + PDF.js API
async function loadAndParsePdf(patentId) {
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction('pdfs', 'readonly');
    const store = tx.objectStore('pdfs');
    const request = store.get(patentId);

    request.onsuccess = async (event) => {
      db.close();
      const record = event.target.result;
      if (!record || !record.pdf) {
        reject(new Error('PDF not found in IndexedDB'));
        return;
      }

      // Convert Blob to ArrayBuffer for PDF.js
      const arrayBuffer = await record.pdf.arrayBuffer();
      resolve(arrayBuffer);
    };

    request.onerror = (event) => {
      db.close();
      reject(new Error(`IndexedDB read failed: ${event.target.error}`));
    };
  });
}
```

### Complete PositionMap Entry Structure
```javascript
// PositionMap is an array of line entries
const positionMapEntry = {
  page: 3,                    // PDF page number (1-indexed)
  column: 5,                  // Document-wide column number
  lineNumber: 42,             // Line within this column (1-indexed)
  text: "semiconductor de-",  // Raw text as it appears in PDF
  hasWrapHyphen: true,        // Line ends with word-wrap hyphen
  x: 52.8,                    // Left edge x-coordinate
  y: 680.4,                   // Baseline y-coordinate (PDF space)
  width: 228.5,               // Text width
  height: 9.6,                // Text height
  section: "description",     // "description" or "claims"
};
```

### Detecting No-Text-Layer PDFs
```javascript
async function hasTextLayer(pdf) {
  // Check first few pages for text content
  const pagesToCheck = Math.min(pdf.numPages, 5);
  let totalItems = 0;

  for (let i = 1; i <= pagesToCheck; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    totalItems += textContent.items.filter(item => item.str.trim().length > 0).length;
  }

  // Typical patent page has 100+ text items. If we have < 5 across 5 pages, no text layer.
  return totalItems >= 5;
}
```

### Claims Section Detection
```javascript
// Recommended: text marker approach for claims boundary
// "What is claimed is:" or "I/We claim:" appears before claims in most US patents
function detectClaimsBoundary(lineEntries) {
  const claimsMarkers = [
    /what\s+is\s+claimed\s+is/i,
    /we\s+claim/i,
    /i\s+claim/i,
    /the\s+invention\s+claimed\s+is/i,
    /claims?:/i,
  ];

  for (let i = 0; i < lineEntries.length; i++) {
    for (const marker of claimsMarkers) {
      if (marker.test(lineEntries[i].text)) {
        // Everything from this line onward is "claims" section
        return i;
      }
    }
  }

  return -1; // No claims marker found -- mark all as "description"
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `PDFJS.disableWorker = true` | `GlobalWorkerOptions.workerSrc` | pdfjs-dist v3+ | Worker is configured via options, not global flag. disableWorker removed in modern versions. |
| `pdfjs-dist/build/pdf.js` (CJS) | `pdfjs-dist/build/pdf.mjs` (ESM) | pdfjs-dist v4+ | Modern pdfjs-dist uses ESM (.mjs) entry points. Legacy CJS builds still available. |
| `pdfjs-dist` GitHub releases | npm-only distribution | Jul 2024 | pdfjs-dist GitHub repo archived. Install from npm or vendor the files directly. |
| `item.transform[0]` for font size | `item.height` directly | pdfjs-dist v3+ | Height property now directly available on TextItem, no need to decompose transform matrix. |

**Deprecated/outdated:**
- `PDFJS.disableWorker`: Removed. Use `GlobalWorkerOptions.workerSrc` or let PDF.js fall back to main-thread parsing.
- `pdfjs-dist/build/pdf.js`: CJS build. Use `pdf.mjs` for modern environments.
- `pdf.worker.entry.js`: Was used to inline the worker. Modern approach is to reference `pdf.worker.mjs` by URL.

## Open Questions

1. **PDF.js ESM loading in offscreen document**
   - What we know: Offscreen document currently loads `offscreen.js` as a classic script. PDF.js v5 ships as ESM (`pdf.mjs`).
   - What's unclear: Whether the offscreen document can load ES modules (the offscreen HTML should support `<script type="module">`), or whether we need the legacy/non-module build.
   - Recommendation: Test with `<script type="module">` first. If CSP blocks it, fall back to the legacy build or a pre-bundled version. LOW confidence until tested in actual extension context.

2. **PDF.js worker in offscreen document**
   - What we know: PDF.js needs a Web Worker for optimal performance. Offscreen documents support Web Workers per Chrome docs.
   - What's unclear: Whether `chrome.runtime.getURL()` works for worker source in offscreen context. Whether `web_accessible_resources` is needed.
   - Recommendation: Set `workerSrc` explicitly. If Worker fails to load, PDF.js falls back to main-thread parsing which is functionally identical, just slower. This fallback is acceptable for patent PDFs (~20-100 pages). MEDIUM confidence.

3. **Y-coordinate clustering tolerance**
   - What we know: Text items on the "same line" may have y-coordinates that differ by 1-3 points due to font metrics, subscripts, superscripts.
   - What's unclear: Exact tolerance needed across different patent eras and formats.
   - Recommendation: Start with 3pt tolerance, validate against test set, adjust if needed. Will be tuned during implementation. MEDIUM confidence.

4. **Dynamic column boundary detection**
   - What we know: Page midpoint (~306pt for 612pt-wide pages) is a reasonable starting heuristic. But some patents have unequal column widths or different margins.
   - What's unclear: Whether a fixed midpoint works universally or if we need gap detection (finding the whitespace between columns).
   - Recommendation: Use gap detection -- find the x-range with no text items, which is the gutter. The gutter midpoint becomes the column boundary. More robust than assuming page midpoint. MEDIUM confidence.

## Sources

### Primary (HIGH confidence)
- [pdf.js GitHub Issue #12031](https://github.com/mozilla/pdf.js/issues/12031) - Transform array meaning (x=index 4, y=index 5, bottom-left origin)
- [pdf.js Getting Started](https://mozilla.github.io/pdf.js/getting_started/) - Build files: pdf.mjs (display layer), pdf.worker.mjs (core layer)
- [pdf.js GitHub Issue #8503](https://github.com/mozilla/pdf.js/issues/8503) - Worker configuration and disableWorker behavior
- [Chrome MV3 CSP docs](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy) - No unsafe-eval, wasm-unsafe-eval allowed
- [Chrome Offscreen API docs](https://developer.chrome.com/docs/extensions/reference/api/offscreen) - Offscreen document capabilities

### Secondary (MEDIUM confidence)
- [pdfjs-dist on npm](https://www.npmjs.com/package/pdfjs-dist) - Latest version 5.4.624 (Feb 2026), legacy/ directory available
- [pdfjs-dist GitHub repo (archived)](https://github.com/mozilla/pdfjs-dist) - Archived Jul 2024, npm is distribution channel
- [pdf.js GitHub Issue #8305](https://github.com/mozilla/pdf.js/issues/8305) - workerSrc configuration patterns including chrome.runtime.getURL
- [pdf.js-extract npm](https://www.npmjs.com/package/pdf.js-extract) - Wrapper that simplifies text+position extraction

### Tertiary (LOW confidence)
- Patent PDF structure knowledge is based on domain experience, not verified against a formal specification. US patent PDFs vary significantly across eras. The two-column layout detection heuristic needs empirical validation against the test set.
- Web Worker support in offscreen documents is inferred from Chrome documentation stating offscreen docs have DOM API access. Needs direct testing.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - pdfjs-dist is the only viable browser-side PDF parser, well-documented API
- Architecture: MEDIUM - offscreen document integration pattern needs validation; PDF.js module loading approach uncertain
- Pitfalls: HIGH - well-documented in PDF.js issue tracker; coordinate system, text fragmentation, worker config are known issues
- Column/line clustering: MEDIUM - algorithm is straightforward but tolerance values need empirical tuning against real patent PDFs

**Research date:** 2026-02-28
**Valid until:** 2026-03-28 (stable domain, PDF.js API is mature)

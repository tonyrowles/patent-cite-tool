---
phase: 02-pdf-parsing-pipeline
verified: 2026-02-28T00:00:00Z
status: human_needed
score: 3/4 success criteria verified (4th requires human runtime validation)
re_verification: false
human_verification:
  - test: "Validate PositionMap accuracy against 5+ patents from different decades"
    expected: "Column numbers match attorney citation convention, line numbers are accurate to +-1 line, claims section detected correctly"
    why_human: "Cannot programmatically run the extension against real patent PDFs or compare output column/line numbers to ground truth without browser runtime"
---

# Phase 2: PDF Parsing Pipeline Verification Report

**Phase Goal:** The extension can take any US granted patent PDF and produce an accurate PositionMap — a data structure mapping every text span to its page, column, and line number within the two-column specification.

**Verified:** 2026-02-28
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (from ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | Extension extracts text items with x,y position data from a patent PDF's existing text layer using PDF.js | VERIFIED | `pdf-parser.js` lines 69-80: maps `item.transform[4]` (x), `item.transform[5]` (y), plus width, height, fontName, hasEOL per item |
| 2 | Extension correctly identifies where the two-column specification section begins (skipping cover page, preliminary material, and figures) | VERIFIED | `position-map-builder.js`: `isTwoColumnPage()` requires >=20 items, >=30 total, and ratio >0.3 between halves — sparse/single-column pages are skipped |
| 3 | Extension clusters text items into left and right columns by x-coordinate and assigns accurate line numbers by y-coordinate sorting | VERIFIED | `clusterIntoLines()` sorts descending by y, groups within 3pt tolerance; `findColumnBoundary()` uses dynamic gap detection in middle third of page; document-wide `columnCounter` increments across pages |
| 4 | PositionMap is accurate when validated against a test set of 5+ patents from different decades and formats | NEEDS HUMAN | Human checkpoint in SUMMARY says "approved" but no documented test set, patent IDs, or comparison results exist in the phase directory — accuracy cannot be verified programmatically |

**Score:** 3/4 success criteria verified programmatically

---

## Required Artifacts

### Plan 02-01 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/pdf.mjs` | Vendored pdfjs-dist display layer containing `pdfjsLib` exports | VERIFIED | 415KB minified Mozilla Foundation PDF.js; exports `getDocument`, `GlobalWorkerOptions` and full library namespace |
| `src/lib/pdf.worker.mjs` | Vendored pdfjs-dist worker layer containing `WorkerMessageHandler` | VERIFIED | 1.1MB minified worker; `WorkerMessageHandler` confirmed present |
| `src/offscreen/pdf-parser.js` | PDF text extraction using `getTextContent()` | VERIFIED | Substantive: `getDocument`, `getTextContent()`, text-layer detection, per-page item mapping, export of `extractTextFromPdf` |
| `src/offscreen/offscreen.js` | Extended offscreen with `parse-pdf` message handling | VERIFIED | ES module with `import { extractTextFromPdf }`, `import { buildPositionMap }`, `PARSE_PDF` handler calling `parsePdf()` |
| `src/shared/constants.js` | New `PARSE_PDF` and `PARSE_RESULT` message types | VERIFIED | `PARSE_PDF: 'parse-pdf'`, `PARSE_RESULT: 'parse-result'`, `PARSING`, `PARSED`, `NO_TEXT_LAYER` all present |
| `src/background/service-worker.js` | Updated SW triggering parse after fetch success | VERIFIED | `MSG.PARSE_PDF`, `handleParseResult()`, `handlePdfFetchResult()` sets `STATUS.PARSING` and sends parse-pdf message |

### Plan 02-02 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/offscreen/position-map-builder.js` | Two-column detection, column/line clustering, PositionMap construction with `buildPositionMap` | VERIFIED | All algorithms present: `isTwoColumnPage`, `findColumnBoundary`, `filterHeadersFooters`, `clusterIntoLines`, `buildLineEntry`, `detectClaimsBoundary`, `detectWrapHyphens`, `buildPositionMap` — exported |
| `src/offscreen/offscreen.js` | Updated offscreen calling position-map-builder after text extraction | VERIFIED | `import { buildPositionMap }` at top; `parsePdf()` calls `buildPositionMap(pageResults)` and stores result with `positionMapMeta` in IndexedDB |

---

## Key Link Verification

### Plan 02-01 Key Links

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/offscreen/offscreen.html` | `src/lib/pdf.mjs` | script type=module (indirect via offscreen.js -> pdf-parser.js -> pdf.mjs) | WIRED | `<script type="module" src="offscreen.js">` confirmed; pdf-parser.js line 9: `import { getDocument, GlobalWorkerOptions } from '../lib/pdf.mjs'` |
| `src/offscreen/pdf-parser.js` | PDF.js pdfjsLib | `getDocument` and `page.getTextContent()` | WIRED | `getDocument({ data: pdfData }).promise` used; `page.getTextContent()` called twice (text-layer check + extraction) |
| `src/offscreen/offscreen.js` | `src/offscreen/pdf-parser.js` | import extractTextFromPdf | WIRED | Line 18: `import { extractTextFromPdf } from './pdf-parser.js'`; line 76: `const pageResults = await extractTextFromPdf(arrayBuffer)` |
| `src/background/service-worker.js` | `src/offscreen/offscreen.js` | chrome.runtime.sendMessage with parse-pdf | WIRED | `handlePdfFetchResult()`: `chrome.runtime.sendMessage({ type: MSG.PARSE_PDF, patentId })` after successful fetch |
| `src/offscreen/pdf-parser.js` | IndexedDB patent-cite-tool/pdfs store | Reads PDF blob stored by Phase 1 fetch | NOTE: PLAN INACCURATE | `pdf-parser.js` does NOT access IndexedDB directly (it receives an ArrayBuffer argument). `offscreen.js` performs the IDB read and passes `arrayBuffer` to `extractTextFromPdf()`. The functional chain works correctly but differs from the plan's stated key_link. This is a cleaner design (pdf-parser is pure/stateless). |

### Plan 02-02 Key Links

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/offscreen/offscreen.js` | `src/offscreen/position-map-builder.js` | import buildPositionMap | WIRED | Line 19: `import { buildPositionMap } from './position-map-builder.js'`; line 79: `const positionMap = buildPositionMap(pageResults)` |
| `src/offscreen/position-map-builder.js` | Text items from pdf-parser.js | Receives per-page text items array as input | WIRED | `export function buildPositionMap(pageResults)` takes array matching pdf-parser.js output format; destructures `{ pageNum, items, pageWidth, pageHeight }` per page |
| `src/offscreen/offscreen.js` | IndexedDB patent-cite-tool/pdfs store | Stores positionMap alongside pdf and textItems | WIRED | `store.put({ ..., positionMap, positionMapMeta: { totalLines, totalColumns, hasClaimsSection, builtAt } })` in `parsePdf()` |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| PDF-02 | 02-01-PLAN | Extension extracts text with position data from the PDF's existing OCR/text layer (no client-side OCR) | SATISFIED | `pdf-parser.js`: uses PDF.js `getTextContent()`, maps `transform[4]`/`transform[5]` for x/y, throws `NO_TEXT_LAYER` instead of attempting OCR |
| PDF-03 | 02-02-PLAN | Extension detects the two-column specification section, skipping cover page, preliminary material, and figures | SATISFIED | `isTwoColumnPage()` uses bimodal x-distribution (min 20 items, ratio >0.3); `filterHeadersFooters()` removes top/bottom 50/40pt margins; single-column pages silently skipped |
| PDF-04 | 02-02-PLAN | Extension builds a column/line map by clustering text items by x-coordinate into columns | SATISFIED | `findColumnBoundary()` uses dynamic gap detection; `clusterIntoLines()` groups by y-coordinate (3pt tolerance); document-wide column counter with per-column line number reset |

All three phase requirements (PDF-02, PDF-03, PDF-04) are satisfied. No orphaned requirements — REQUIREMENTS.md traceability table maps exactly these three IDs to Phase 2.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/offscreen/position-map-builder.js` | 159 | `return []` in `clusterIntoLines()` | INFO | Guard clause for empty input — correct defensive programming, not a stub |

No blocking or warning anti-patterns found. The `return []` on line 159 is a legitimate empty-input guard in `clusterIntoLines()`, not a stub implementation.

No TODO/FIXME/placeholder comments in any phase 2 files. No empty handler implementations. The `return true` bug (spurious async channel hold on fire-and-forget messages) was fixed in commit `b5b53bf` and confirmed absent — line 37 of `offscreen.js` contains only a comment explaining the correct behavior.

---

## Key Design Decisions Verified in Code

1. **Named imports from pdfjs-dist v5**: `import { getDocument, GlobalWorkerOptions } from '../lib/pdf.mjs'` — confirmed, matches `pdf.mjs` export structure.

2. **Worker URL via chrome.runtime.getURL**: `GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdf.worker.mjs')` — confirmed in `pdf-parser.js` line 14; `manifest.json` declares `lib/pdf.worker.mjs` in `web_accessible_resources`.

3. **Layout-first two-column detection**: `isTwoColumnPage()` uses x-coordinate bimodal distribution, not keyword matching — confirmed.

4. **Dynamic column boundary**: `findColumnBoundary()` finds widest zero-count gap in middle third of page — confirmed, falls back to `pageWidth / 2` only if no gap > 5pt found.

5. **Document-wide column numbering**: `columnCounter` is declared outside all loops in `buildPositionMap()` and increments continuously across pages — confirmed.

6. **PositionMap entry fields**: All 9 required fields present in `buildLineEntry()`: `page`, `column`, `lineNumber`, `text`, `hasWrapHyphen`, `x`, `y`, `width`, `height`, `section`.

7. **Claims section tagging**: `detectClaimsBoundary()` checks four regex patterns (what is claimed is, we claim, i claim, the invention claimed is) — confirmed; section defaults to `'description'` and is updated to `'claims'` from boundary index onward.

8. **Wrap hyphen detection**: `detectWrapHyphens()` flags lines ending with `-` where next line in same column starts lowercase — confirmed, only checks within same column.

9. **Status flow**: FETCHING -> PARSING -> PARSED (or NO_TEXT_LAYER / ERROR) — confirmed end-to-end across `service-worker.js`, `offscreen.js`, and `popup.js`.

---

## Human Verification Required

### 1. PositionMap Accuracy Validation Against Real Patents

**Test:** Load the extension in Chrome, navigate to the following US granted patents, wait for parse to complete, and inspect the PositionMap via DevTools (Application -> IndexedDB -> patent-cite-tool -> pdfs):

- `US11427642B2` (recent semiconductor patent, ~2022)
- `US6285999B1` (older ~2001 patent)
- At least 3 additional patents from different decades (e.g., a 1990s patent, a 2010s patent, a very recent one)

**Expected for each patent:**
- Popup shows "PDF analyzed for [patentId]" with non-zero column and line counts
- Column count is plausible (20–80 columns for a typical 30–50 page specification)
- Line count is plausible (500–5000 lines)
- Each PositionMap entry has all 9 fields: page, column, lineNumber, text, hasWrapHyphen, x, y, width, height, section
- Column numbers increase across pages (page 1 has cols 1,2; page 2 has cols 3,4; etc.)
- Line numbers reset to 1 for each new column
- Some entries near the end have `section: "claims"`
- Manually compare a few column/line positions against the actual PDF (open the PDF and count lines in a column to confirm +-1 accuracy)

**Why human:** Cannot run the extension without a Chrome browser. Accuracy of column/line numbers requires ground-truth comparison with the actual patent PDF that only a human can perform interactively.

---

## Verified Commit Hashes

All commits documented in SUMMARY.md were confirmed present in git history:

| Commit | Description |
|--------|-------------|
| `c802c4b` | feat(02-01): vendor PDF.js v5 and configure for offscreen document |
| `e4ec289` | feat(02-01): implement PDF text extraction and parse orchestration pipeline |
| `bfe1060` | feat(02-02): implement PositionMap builder with two-column detection and section tagging |
| `c06e19f` | feat(02-02): integrate PositionMap into parse pipeline with status display |
| `b5b53bf` | fix(02-02): remove spurious return true from fire-and-forget message handlers |

---

## Summary

The Phase 2 PDF parsing pipeline is substantively implemented and wired end-to-end. All artifacts are present, non-stub, and connected. The three phase requirements (PDF-02, PDF-03, PDF-04) are satisfied by real implementations:

- PDF.js is vendored (1.5MB combined), loading correctly as ES modules in the offscreen document
- Text extraction produces all required positional fields (x, y, width, height, fontName, hasEOL) from `transform[4]`/`transform[5]`
- Two-column detection is layout-first (bimodal x-distribution), not keyword-based
- Column boundary is dynamically detected via gap analysis (not hardcoded)
- PositionMap entries carry all 9 required fields with document-wide column numbering
- Claims section detection uses four text-marker patterns
- Wrap hyphen detection is within-column only
- Service worker status pipeline runs: FETCHING → PARSING → PARSED (or NO_TEXT_LAYER / ERROR)
- IndexedDB stores positionMap with metadata (totalLines, totalColumns, hasClaimsSection)
- Popup displays column/line counts for parsed patents

One plan key_link is architecturally inaccurate: `02-01-PLAN.md` states `pdf-parser.js` reads from IndexedDB, but in the implementation `offscreen.js` reads the IDB record and passes an ArrayBuffer to `pdf-parser.js`. This is a better design (pure function, no side effects) and does not represent a functional gap.

The one item requiring human verification is runtime accuracy: the ROADMAP success criterion 4 requires validation against 5+ patents from different decades. The human checkpoint was marked "approved" in the SUMMARY but no documented test results, patent IDs tested, or comparison data exists. This must be confirmed by running the extension against real patents and spot-checking column/line accuracy.

---

_Verified: 2026-02-28_
_Verifier: Claude (gsd-verifier)_

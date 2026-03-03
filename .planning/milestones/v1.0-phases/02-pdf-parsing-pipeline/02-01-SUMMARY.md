---
phase: 02-pdf-parsing-pipeline
plan: 01
subsystem: pdf-parsing
tags: [pdfjs, text-extraction, offscreen-document, indexeddb, chrome-extension]

# Dependency graph
requires:
  - phase: 01-extension-foundation-and-pdf-fetch
    provides: "Offscreen document with PDF fetch and IndexedDB storage"
provides:
  - "PDF.js vendored library (pdf.mjs, pdf.worker.mjs) in src/lib/"
  - "PDF text extraction with x,y position data via pdf-parser.js"
  - "Fetch-then-parse pipeline orchestrated by service worker"
  - "No-text-layer detection for scanned PDFs"
  - "PARSING/PARSED/NO_TEXT_LAYER status states"
affects: [02-02-PLAN, column-analysis, citation-generation]

# Tech tracking
tech-stack:
  added: [pdfjs-dist@5.4.624]
  patterns: [es-module-offscreen, fetch-then-parse-pipeline, text-layer-detection]

key-files:
  created:
    - src/lib/pdf.mjs
    - src/lib/pdf.worker.mjs
    - src/offscreen/pdf-parser.js
  modified:
    - src/offscreen/offscreen.html
    - src/offscreen/offscreen.js
    - src/shared/constants.js
    - src/background/service-worker.js
    - src/popup/popup.js
    - src/manifest.json

key-decisions:
  - "Used minified PDF.js builds to minimize extension size (424KB + 1MB vs full sources)"
  - "Named exports from pdfjs-dist v5 (getDocument, GlobalWorkerOptions) rather than namespace import"
  - "Text layer detection samples first 5 pages with threshold of 5 items to distinguish scanned vs text PDFs"
  - "Offscreen.js converted to ES module to support PDF.js imports; constants remain local"

patterns-established:
  - "Fetch-then-parse pipeline: fetch success triggers PARSING status and parse message"
  - "Text items include transform-derived x,y coordinates for downstream column analysis"
  - "IndexedDB record extended with textItems field alongside existing pdf blob"

requirements-completed: [PDF-02]

# Metrics
duration: 2min
completed: 2026-02-28
---

# Phase 02 Plan 01: PDF.js Vendoring and Text Extraction Summary

**PDF.js v5 text extraction with x,y positioned items, no-text-layer detection, and fetch-then-parse pipeline in offscreen document**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-28T23:10:10Z
- **Completed:** 2026-02-28T23:12:33Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Vendored pdfjs-dist 5.4.624 minified builds into src/lib/ for Chrome extension use
- Built PDF text extraction producing per-page arrays with x,y,width,height,fontName,hasEOL per item
- Implemented no-text-layer detection (scanned PDFs) with graceful error reporting
- Extended fetch-then-parse pipeline: FETCHING -> PARSING -> PARSED status flow
- Stored extracted textItems in IndexedDB alongside PDF blob for downstream use

## Task Commits

Each task was committed atomically:

1. **Task 1: Vendor PDF.js files and update manifest and offscreen HTML** - `c802c4b` (feat)
2. **Task 2: Implement PDF text extraction with parse orchestration** - `e4ec289` (feat)

## Files Created/Modified
- `src/lib/pdf.mjs` - Vendored pdfjs-dist v5 display layer (minified, 424KB)
- `src/lib/pdf.worker.mjs` - Vendored pdfjs-dist v5 worker layer (minified, 1MB)
- `src/offscreen/pdf-parser.js` - PDF text extraction using getDocument/getTextContent with position data
- `src/offscreen/offscreen.js` - Rewritten as ES module with parse-pdf message handler
- `src/offscreen/offscreen.html` - Updated to load scripts as ES modules
- `src/shared/constants.js` - Added PARSE_PDF, PARSE_RESULT, PARSING, PARSED, NO_TEXT_LAYER
- `src/background/service-worker.js` - Added parse orchestration and handleParseResult
- `src/popup/popup.js` - Added parsing/parsed/no-text-layer status displays
- `src/manifest.json` - Added web_accessible_resources for pdf.worker.mjs

## Decisions Made
- Used minified PDF.js builds (pdf.min.mjs -> pdf.mjs) to reduce extension size while maintaining full functionality
- Named imports from pdfjs-dist v5 (`import { getDocument, GlobalWorkerOptions }`) per modern ESM API
- Text layer detection threshold: fewer than 5 non-empty text items across first 5 pages = no text layer
- Offscreen document converted to ES module; constants remain locally defined (cannot import shared/constants.js)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Text items with x,y position data ready for column detection and line grouping in Plan 02-02
- IndexedDB stores both PDF blob and textItems array per patent
- Status pipeline complete: FETCHING -> PARSING -> PARSED/ERROR/NO_TEXT_LAYER

---
*Phase: 02-pdf-parsing-pipeline*
*Completed: 2026-02-28*

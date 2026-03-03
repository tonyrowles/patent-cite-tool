---
phase: 02-pdf-parsing-pipeline
plan: 02
subsystem: pdf-parsing
tags: [two-column-detection, position-map, column-line-mapping, text-clustering, section-tagging]

# Dependency graph
requires:
  - phase: 02-pdf-parsing-pipeline
    provides: "Per-page text items with x,y positions from PDF.js extraction (02-01)"
provides:
  - "PositionMap data structure mapping every text line to page, document-wide column, and line number"
  - "Two-column specification page detection via bimodal x-coordinate analysis"
  - "Dynamic column boundary detection via gutter gap analysis"
  - "Header/footer filtering before line counting"
  - "Claims section detection and tagging via text markers"
  - "Wrap hyphen detection for cross-line word breaks"
  - "PositionMap stored in IndexedDB with metadata (totalLines, totalColumns, hasClaimsSection)"
affects: [03-text-matching, citation-generation]

# Tech tracking
tech-stack:
  added: []
  patterns: [layout-first-detection, y-coordinate-clustering, document-wide-column-numbering]

key-files:
  created:
    - src/offscreen/position-map-builder.js
  modified:
    - src/offscreen/offscreen.js
    - src/background/service-worker.js
    - src/popup/popup.js

key-decisions:
  - "Layout-first two-column detection via bimodal x-coordinate distribution, not keyword matching"
  - "Dynamic column boundary via widest zero-count gap in middle third of page, not hardcoded midpoint"
  - "Document-wide column numbering (1, 2, 3, 4...) matching attorney citation convention"
  - "Y-coordinate clustering with 3pt tolerance for line grouping"
  - "Claims boundary detection via text markers (what is claimed is, we claim, etc.)"
  - "Simple wrap-hyphen heuristic (ends with hyphen + next line starts lowercase) -- Phase 3 handles edge cases"

patterns-established:
  - "PositionMap is the contract between Phase 2 (parsing) and Phase 3 (matching) -- Phase 3 should not re-parse the PDF"
  - "positionMapMeta stored alongside positionMap in IndexedDB for quick stats access"

requirements-completed: [PDF-03, PDF-04]

# Metrics
duration: 15min
completed: 2026-02-28
---

# Phase 02 Plan 02: PositionMap Builder Summary

**Two-column specification detection with document-wide column/line numbering, claims section tagging, and wrap-hyphen flagging stored as PositionMap in IndexedDB**

## Performance

- **Duration:** ~15 min (across checkpoint)
- **Started:** 2026-02-28
- **Completed:** 2026-02-28
- **Tasks:** 2 auto + 1 checkpoint (human-verify)
- **Files modified:** 4

## Accomplishments
- Built PositionMap builder that detects two-column specification pages via bimodal x-coordinate analysis, skipping cover/figure pages
- Dynamic gutter detection finds column boundary without hardcoded midpoints, supporting patents from different decades
- Document-wide column numbering (1, 2, 3, 4...) matches attorney citation convention; line numbers reset per column
- Claims section detected and tagged via text markers; wrap hyphens flagged for downstream joining
- PositionMap stored in IndexedDB with metadata; popup displays column/line counts for parsed patents

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement position-map-builder.js** - `bfe1060` (feat)
2. **Task 2: Integrate PositionMap into parse pipeline** - `c06e19f` (feat)
3. **Task 3: Human verification checkpoint** - approved
4. **Post-checkpoint fix: Remove spurious return true** - `b5b53bf` (fix)

## Files Created/Modified
- `src/offscreen/position-map-builder.js` - Two-column detection, column/line clustering, section tagging, wrap-hyphen detection
- `src/offscreen/offscreen.js` - Calls buildPositionMap after text extraction, stores result in IndexedDB
- `src/background/service-worker.js` - Saves lineCount/columnCount from parse results
- `src/popup/popup.js` - Displays column and line counts in parsed status

## Decisions Made
- Layout-first two-column detection (bimodal x-coordinate distribution) rather than keyword matching -- more robust across patent eras
- Dynamic column boundary via widest zero-count gap in middle third of page -- handles varying margins
- Document-wide column numbering matching attorney citation convention (columns don't reset per page)
- Y-coordinate clustering with 3pt tolerance for grouping text fragments into lines
- Simple wrap-hyphen heuristic for now; Phase 3 fuzzy matching handles edge cases
- Claims boundary via text markers ("What is claimed is:", "We claim:", etc.)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed spurious return true from fire-and-forget message handlers**
- **Found during:** Post-checkpoint verification
- **Issue:** onMessage listener in offscreen.js was returning `true` for all messages including FETCH_PDF and PARSE_PDF, which are fire-and-forget (don't use sendResponse). This caused Chrome "message channel closed" errors.
- **Fix:** Removed `return true` since these handlers don't call sendResponse. Only handlers that use async sendResponse should return true.
- **Files modified:** src/offscreen/offscreen.js
- **Verification:** No more "message channel closed" console errors
- **Committed in:** `b5b53bf`

---

**Total deviations:** 1 auto-fixed (1 bug fix)
**Impact on plan:** Essential for correctness -- prevents spurious Chrome errors in message passing.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- PositionMap data structure ready for Phase 3 text matching and citation generation
- Each PositionMap entry contains: page, column, lineNumber, text, hasWrapHyphen, x, y, width, height, section
- IndexedDB stores positionMap alongside PDF blob per patent
- Phase 3 can match highlighted text against PositionMap entries without re-parsing the PDF
- Status pipeline complete: FETCHING -> PARSING -> PARSED with column/line stats

## Self-Check: PASSED

All created files verified present. All commit hashes (bfe1060, c06e19f, b5b53bf) verified in git log.

---
*Phase: 02-pdf-parsing-pipeline*
*Completed: 2026-02-28*

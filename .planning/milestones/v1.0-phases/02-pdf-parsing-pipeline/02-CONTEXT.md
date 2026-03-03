# Phase 2: PDF Parsing Pipeline - Context

**Gathered:** 2026-02-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Take any US granted patent PDF and produce an accurate PositionMap — a data structure mapping every text span to its page, column, and line number within the two-column specification. This phase covers text extraction, specification section detection, column/line mapping, and validation. It does NOT cover text matching, citation formatting, or clipboard output.

</domain>

<decisions>
## Implementation Decisions

### Specification Section Detection
- Map both the description AND claims sections (not just description)
- Use layout-first detection: identify specification start by finding the first page with two-column text layout (more robust than keyword matching across eras)
- Skip figure pages entirely — detect and exclude pages that are primarily figures/drawings
- Skip non-standard pages (single-column, landscape, continuation sheets) — only process pages matching two-column text layout

### Column & Line Mapping
- Column numbers are document-wide (1, 2, 3, 4...) matching attorney citation convention (e.g., "col. 4, ln. 5")
- Line numbers assigned by Y-coordinate clustering — group text items with similar y-coordinates into lines, line 1 is topmost text in each column, reset per column
- Filter out headers/footers (patent number, page number) before line counting — attorneys don't cite these
- Accuracy target: ±1 line is acceptable in edge cases

### PositionMap Structure
- Line-level entries storing raw PDF text (with line-break hyphens as they appear in the PDF)
- Flag line-ending wrap hyphens with a boolean — helps Phase 3 distinguish word-wrap hyphens from real hyphens (e.g., "well-known") during matching
- Fields per entry: page, column (document-wide), lineNumber (within column), text (raw), hasWrapHyphen, x/y bounding box coordinates, section ("description" or "claims")
- Bounding box coordinates stored for potential future PDF highlighting, not needed for citation generation

### Patent Format Variations
- Optimize for patents from ~2000 onward; support older patents best-effort (±2 line tolerance acceptable for pre-2000)
- Fail gracefully when PDF has no text layer: clear message "This patent PDF has no text layer. Citation not available." — no client-side OCR
- Validation test set: Claude picks 5+ representative patents spanning different eras and formats

### Claude's Discretion
- Claims boundary detection approach (text marker like "What is claimed is:" vs layout heuristic)
- Exact Y-coordinate clustering tolerance for line grouping
- Header/footer detection heuristics
- Column boundary x-coordinate threshold logic
- Validation test set patent selection

</decisions>

<specifics>
## Specific Ideas

- Words wrap across lines in patent PDFs with hyphens that don't appear in the Google Patents HTML view — this is a critical consideration for downstream matching in Phase 3
- The PositionMap is the contract between Phase 2 (parsing) and Phase 3 (matching/citation) — it needs to be complete enough that Phase 3 doesn't need to re-parse the PDF
- Section tagging (description vs claims) enables Phase 3 to format citations correctly: column:line for description, claim numbers for claims

</specifics>

<deferred>
## Deferred Ideas

- USPTO API fallback for PDFs missing text layers (automatic OCR'd PDF retrieval and retry) — future enhancement, aligns with DATA-01
- PDF highlighting using stored bounding box coordinates — potential v2 feature

</deferred>

---

*Phase: 02-pdf-parsing-pipeline*
*Context gathered: 2026-02-28*

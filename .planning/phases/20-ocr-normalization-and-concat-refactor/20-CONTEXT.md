# Phase 20: OCR Normalization and Concat Refactor - Context

**Gathered:** 2026-03-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Extract `buildConcat` as a shared helper from the inline loop in `matchAndCite`, and add `normalizeOcr` as Tier 0b preprocessing so OCR character confusions no longer prevent citations from resolving. Covers requirements MATCH-02 and MATCH-03.

</domain>

<decisions>
## Implementation Decisions

### OCR Substitution Pairs
- 5 pairs defined as `const OCR_PAIRS` array at module top, applied via loop in `normalizeOcr`:
  - `rn` → `m`
  - `cl` → `d`
  - `cI` → `d` (capital-I variant of cl→d)
  - `vv` → `w`
  - `li` → `h`
- One direction only (OCR-error → true character) — both selection and concat get the same normalization so they match regardless of which side has the OCR error
- 1/l/I and 0/O explicitly excluded — identifier collision risk (locked in STATE.md)

### Normalization Scope
- Always-on Tier 0b preprocessing — `normalizeOcr` runs unconditionally on both selection and concat before any matching tier
- 0.02 confidence penalty when normalizeOcr actually changed characters that the match region spans
- Either side (selection or concat) triggers the penalty, applied once (not cumulative)
- Penalty only when normalizeOcr was *necessary* for the match — if the match would succeed on un-normalized text, no penalty (preserves existing 71-case baseline confidence values exactly)

### buildConcat Extraction Boundary
- Full loop extraction — the entire concat-building loop (currently lines 403–431 in matching.js) moves into `buildConcat`, including wrap-hyphen detection
- `buildConcat` applies both `normalizeText` and `normalizeOcr` to each entry's text — single source of truth for all text preprocessing
- Returns `{concat, boundaries}` per success criteria — simple return signature
- `buildConcat` internally tracks which character index ranges in the concat were affected by `normalizeOcr`, exposed for penalty calculation

### normalizeOcr Return Value
- `normalizeOcr(text)` returns `{text, changed}` — not just a string
- `changed` is a boolean indicating whether any substitution was applied
- `buildConcat` uses this to track changed ranges (character positions in the final concat that were affected by OCR normalization)

### Regression Guardrails
- Golden baseline (71 cases) is sufficient — no additional kill switch or toggle needed
- Confidence penalty is surgical: only applied when the match overlaps changed character ranges
- No baseline entries should change tier or confidence values

### Claude's Discretion
- Internal data structure for tracking changed ranges in buildConcat
- Exact implementation of overlap detection between match region and changed ranges
- Whether normalizeOcr replaces from left-to-right or uses a regex with alternation
- Test structure and naming for new normalizeOcr unit tests

</decisions>

<specifics>
## Specific Ideas

- OCR_PAIRS as a constant map at module level mirrors the style of normalizeText's replacement chains — but uses a loop for extensibility
- The moderate bigram set (5 pairs) was chosen as a balance between coverage and safety — Phase 22's US6324676 testing will validate whether more pairs are needed

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `normalizeText()` (matching.js:7–22): Existing normalization chain — normalizeOcr follows the same pattern but as a separate function
- `matchAndCite()` (matching.js:382–465): Contains the inline concat-building loop (lines 403–431) to extract into `buildConcat`
- `resolveMatch()` (matching.js:281–296): Already a shared helper — `buildConcat` follows the same extraction pattern

### Established Patterns
- Normalization functions are pure, exported, and testable (normalizeText)
- Matching cascade: exact → whitespace-stripped → bookend → fuzzy — normalizeOcr preprocesses before this cascade
- Wrap-hyphen detection (lines 414–427) checks raw entry text and previous entry state

### Integration Points
- `matchAndCite` calls `buildConcat(positionMap)` instead of inlining the loop
- `normalizeOcr` is called on selection text in `matchAndCite` AND on each entry's text inside `buildConcat`
- Phase 21's `gutterTolerantMatch` will consume `buildConcat` to get concat text for gutter stripping
- `whitespaceStrippedMatch` and `bookendMatch` receive the already-normalized concat from `buildConcat`

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 20-ocr-normalization-and-concat-refactor*
*Context gathered: 2026-03-04*

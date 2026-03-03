# Phase 8: Test Harness Foundation - Context

**Gathered:** 2026-03-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Regression-safe test infrastructure: Vitest imports pure functions, a diverse 30-50 patent fixture corpus is captured, and frozen golden outputs are recorded before any algorithm change begins. This phase establishes the baseline — it does NOT fix algorithms (Phase 9).

</domain>

<decisions>
## Implementation Decisions

### Fixture Corpus Composition
- Focus on granted patents (mix of old pre-2000 and modern 2010+ formats)
- Claude's discretion on the specific patent mix — must cover all requirement categories: pre-2000 patents, chemical patents, cross-column selections, repetitive claims, short selections (1-2 lines), long selections (multi-paragraph)
- Pre-captured PositionMap JSON committed to the repo — no network dependency at test time
- Include a fixture generation script (satisfies TEST-02) that can fetch patent PDFs and produce PositionMap JSON for adding new test cases
- Applications (paragraph citations) not in the golden corpus — too simple, DOM-based, deterministic

### Accuracy Metrics
- Tiered reporting: exact match / close (off-by-1) / total mismatch
- "Correct" means exact column match AND start/end lines within ±1 tolerance
- Off-by-1 cases are tracked separately from total mismatches but counted in the "close" tier
- Confidence calibration included: track whether high-confidence results (0.95+) are correct more often than low-confidence (0.80-0.90)
- Baseline accuracy: measure the current algorithm, whatever the number is — document it before Phase 9

### Off-by-one Classification
- Two error subtypes tracked separately:
  - **Systematic offset**: entire range shifted by 1 in same direction (start and end both off by same amount) — suggests line-counting bug
  - **Boundary wobble**: only start or end is off by 1 — suggests selection boundary ambiguity
- Tolerance: strictly ±1 line — anything ±2 or more is a total mismatch
- Off-by-one tests **warn but don't fail** — pragmatic approach, focus on total failures first
- Test output includes:
  - Inline diffs per test case: "Expected 4:15-20, got 4:16-21 (delta_start=+1, delta_end=+1 -> systematic offset)"
  - Summary table after all tests: X exact, Y systematic offset, Z boundary wobble, W total mismatch

### Golden Baseline Scope
- Freeze per test case: citation string + confidence score
- Do NOT freeze internal details (match type, start/end entries) — avoids brittleness from internal refactors
- Manual update only — golden files are updated by explicit command, never automatically
- Every golden change must be intentional and reviewed

### Claude's Discretion
- Vitest configuration and Chrome API stubbing approach
- Module export strategy for classic-script globals
- Golden baseline file structure (single JSON vs per-patent files)
- Fixture generation script implementation details
- Test runner output formatting beyond the specified tiers

</decisions>

<specifics>
## Specific Ideas

- User works with a mix of old and new granted patents — the corpus should reflect real prosecution workflows, not just easy modern patents
- The fixture generation script should be useful in Phase 9 for adding more test cases as failure patterns are discovered
- Accuracy metrics should produce a clear "before" snapshot that Phase 9 can compare against

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `text-matcher.js` — 8 pure functions (globals): `normalizeText`, `matchAndCite`, `formatCitation`, `fuzzySubstringMatch`, `levenshtein`, `resolveMatch`, `whitespaceStrippedMatch`, `bookendMatch`. Primary test targets.
- `position-map-builder.js` — Already exports `buildPositionMap`. 10 internal pure functions without exports: `isTwoColumnPage`, `findColumnBoundary`, `clusterIntoLines`, `assignLineNumbers`, etc.
- `paragraph-finder.js` — `formatAppCitation` is pure and testable. `buildParagraphMap`/`findParagraphForNode` need DOM.
- `content-script.js` — `getShortPatentNumber` is pure. `extractPatentInfo` needs `window.location` mock. `applyPatentPrefix` needs `cachedSettings` mock.
- `shared/constants.js` — `MSG`, `STATUS`, `PATENT_TYPE` constants. No exports (globals).

### Established Patterns
- Classic scripts with function declarations as globals — no ES module exports (except position-map-builder.js and pdf-parser.js which use `export`)
- No build step, no bundler, no package.json at project root
- Chrome Extension Manifest V3 — service worker, offscreen document, content scripts
- No existing test infrastructure whatsoever

### Integration Points
- `matchAndCite(selectedText, positionMap)` is the core function connecting parsing and citation
- PositionMap JSON is the key data structure: array of `{ page, column, lineNumber, text, hasWrapHyphen, x, y, width, height, section }` entries
- Tests need to import from files that currently rely on global function declarations

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 08-test-harness-foundation*
*Context gathered: 2026-03-02*

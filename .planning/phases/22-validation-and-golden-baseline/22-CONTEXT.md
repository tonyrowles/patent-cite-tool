# Phase 22: Validation and Golden Baseline - Context

**Gathered:** 2026-03-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Verify the OCR normalization (Phase 20) and gutter-tolerant matching (Phase 21) against real OCR-heavy patent data (US6324676), expand the golden baseline with manually verified test cases, and confirm merged/split-word handling. Covers requirements VALID-01 and VALID-02.

</domain>

<decisions>
## Implementation Decisions

### OCR Pattern Coverage
- Divergence test cases: selectedText has clean/corrected text copied from Google Patents HTML, while PDF fixture has OCR artifacts — forces normalizeOcr to bridge the gap
- Copy selectedText directly from Google Patents HTML for US6324676 — most realistic, reflects actual user workflow
- Test existing normalizeOcr pairs (rn→m, cl→d, etc.) against real US6324676 data
- s→S case errors (widespread in US6324676: "macroS", "blockS") are documented as a known gap if they cause failures — no new normalizeOcr pairs added in this phase
- US6324676 has no gutter numbers in its fixture, so Tier 5 won't be exercised by real patent data

### Verification Process
- Spot-check script + PDF viewer verification: run spot-check.js to compute citations, cross-reference with fixture data, print verification checklist
- Programmatic verification sufficient — phase does not block on manual PDF review by user
- Failed test cases (e.g., s→S divergence) go in test-cases.js but NOT in baseline.json — documented as known gaps
- Baseline stays additions-only with passing cases — no modifications to existing 71 entries

### Merged/Split Word Testing
- Use real US6324676 split-word passages ("pro vide", "dis tribute") where HTML has correct word and PDF has the split
- Clean split-word isolation: test passage should only have split-word divergence, not combined with s→S errors
- Split-word confirmation is sufficient for VALID-02 — whitespace stripping handles both merged and split directions
- If split-word test fails, add a dedicated fix in this phase per VALID-02 requirement ("dedicated handling step added only if tests fail")

### Baseline Expansion Scope
- 4 total new test cases: 2 OCR divergence + 1 split-word + 1 synthetic gutter
- New 'ocr' category for OCR divergence and split-word cases
- New 'gutter' category for synthetic gutter-number case
- Synthetic gutter case: clone subset of US11427642 fixture, inject gutter numbers — separate test-only fixture file
- Test case ID pattern: US6324676-ocr-diverge-1, US6324676-ocr-diverge-2, US6324676-split-word, synthetic-gutter-1

### Claude's Discretion
- Which specific US6324676 passages to use for OCR divergence cases (must contain normalizeOcr-relevant patterns)
- Which US11427642 passage subset to clone for synthetic gutter fixture
- Exact gutter number injection positions in synthetic fixture
- Spot-check script updates to include new test case IDs
- Test structure for failed/gap cases in test-cases.js (skip annotation or separate section)

</decisions>

<specifics>
## Specific Ideas

- The pending STATE.md todo ("Confirm US6324676 OCR failure modes — determine if prose-safe normalizeOcr subset is sufficient or if bounded 1/l/I substitutions needed") is directly addressed by this phase's divergence test cases
- US6324676 OCR artifacts observed: s→S on plurals (macroS, blockS), split words at line breaks (pro vide, dis tribute, pro grammed), spurious capitals mid-sentence (Strives, Secure, Some)
- Existing 4 US6324676 baseline cases all pass at confidence 1.0 because HTML and PDF have identical OCR artifacts — divergence cases specifically test the scenario where they differ

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `normalizeOcr()` (matching.js): 5 prose-safe pairs — test cases should exercise rn→m, cl→d patterns if present in US6324676
- `whitespaceStrippedMatch()` (matching.js:185): Strips all whitespace for Tier 2 matching — expected to handle split-word cases
- `gutterTolerantMatch()` (matching.js): Tier 5 fallback with flat 0.85 confidence — synthetic test validates end-to-end
- `scripts/spot-check.js`: Existing verification tool — needs update to include new test case IDs
- `tests/fixtures/US6324676.json`: 6229-line fixture already exists with OCR artifacts

### Established Patterns
- Test cases in `tests/test-cases.js` with `{id, patentFile, selectedText, category}` structure
- Golden baseline in `tests/golden/baseline.json` with `{[id]: {citation, confidence}}` entries
- Categories: modern-short, modern-long, claims, cross-column, chemical, repetitive, pre-2000 — adding 'ocr' and 'gutter'

### Integration Points
- New test cases added to TEST_CASES array in test-cases.js
- Passing cases added to baseline.json (additions only)
- spot-check.js SPOT_CHECK_IDS array updated
- CI runs both Chrome and Firefox builds against updated baseline

</code_context>

<deferred>
## Deferred Ideas

- s→S case normalization for OCR (if divergence tests fail on this pattern) — future OCR phase
- Bounded 1/l/I and 0/O substitutions — deferred per Phase 20 decision, revisit after US6324676 validation
- Additional OCR-heavy patent fixtures beyond US6324676 — OCR-01 in future requirements

</deferred>

---

*Phase: 22-validation-and-golden-baseline*
*Context gathered: 2026-03-05*

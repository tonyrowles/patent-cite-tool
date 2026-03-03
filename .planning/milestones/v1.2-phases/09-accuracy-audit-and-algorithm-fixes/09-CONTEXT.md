# Phase 9: Accuracy Audit and Algorithm Fixes - Context

**Gathered:** 2026-03-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Identify the highest-impact citation failure modes through systematic audit, implement algorithm fixes, and prove no regressions against the Phase 8 golden baseline. The scope is: audit → fix → validate. No UI changes, no new features — pure accuracy improvement on the existing matching pipeline.

</domain>

<decisions>
## Implementation Decisions

### Audit Methodology
- Expand the fixture corpus first for systematic coverage, targeting prosecution-relevant patent types (utility specs with dense technical language, claims with dependent chains, continuation families)
- Follow with a quick live spot-check on 10-15 real patents via Google Patents to catch HTML/PDF divergences fixtures can't simulate
- Every failure discovered becomes both: (1) a new test case in the corpus, and (2) an entry in a structured audit report with patent number, selected text, expected vs actual, failure category, and proposed root cause

### Failure Prioritization
- Prioritize by frequency in real patent prosecution work — the patterns encountered most often in office action responses and amendments come first
- Specification body text and claims citations are equally important — both are used regularly in prosecution
- Fix total mismatches and no-match cases first; address systematic off-by-one patterns if time remains after higher-impact fixes

### Accuracy Reporting
- No hard accuracy target — improve what we can without blocking store submission on a percentage
- Report both overall before/after accuracy AND per-category breakdown (modern, pre-2000, chemical, claims, cross-column, repetitive) so strengths/weaknesses are visible
- Keep existing accuracy summary in `npx vitest run` output; add a separate detailed report script (`npm run accuracy-report` or similar) for per-category analysis

### Fix Approach
- Let the failure patterns dictate the fix approach per-pattern — some may need minimal patches, others may need new matching strategies; Claude decides based on what the audit reveals
- When a fix risks regressions: fix it and expand test cases to prove safety; update golden baseline with justification rather than skipping the fix
- Document all baseline changes (old vs new citation + brief reason) so they can be batch-reviewed rather than individually verified against PDFs

### Claude's Discretion
- Commit granularity — group related fixes or keep them separate based on the nature of each fix, as long as commit messages reference the failure mode addressed
- Confidence threshold adjustments — assess whether thresholds need tuning as part of algorithm fixes
- Detailed report script implementation approach
- Fixture expansion patent selection (within prosecution-relevant types)

</decisions>

<specifics>
## Specific Ideas

- The current single known failure is US11086978-spec-short (confidence 0, no match) — this is the starting point
- Accuracy summary already runs every test execution (Phase 8 baseline: 97.7%, 43/44 exact match)
- Off-by-one classifier already distinguishes systematic, boundary, and mismatch tiers — leverage this in audit reporting

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `tests/helpers/classify-result.js`: Off-by-one classifier (exact/systematic/boundary/mismatch) — directly usable in audit reporting
- `scripts/update-golden.js`: Golden baseline update script — use after algorithm fixes to regenerate baseline
- `scripts/generate-fixture.js`: Fixture generation from real patent PDFs — use to expand corpus
- `tests/test-cases.js`: Test case registry with 8 categories — extend with new audit-discovered cases

### Established Patterns
- Multi-strategy matching pipeline in `text-matcher.js`: whitespace-stripped → bookend → fuzzy substring → punctuation-agnostic
- Each strategy has its own confidence level (0.99 → 0.92 → lower for fuzzy)
- Fixtures are PositionMap JSON captured from real PDFs; test cases reference fixture files with selectedText derived from fixture data
- Golden baseline is a single JSON file (`tests/golden/baseline.json`) mapping test case IDs to expected citation + confidence

### Integration Points
- Algorithm fixes go in `src/content/text-matcher.js` (the core matching pipeline)
- New test cases added to `tests/test-cases.js` with corresponding fixtures in `tests/fixtures/`
- Baseline updated via `scripts/update-golden.js` after fixes
- Vitest runs all tests including accuracy metrics via `tests/unit/text-matcher.test.js`

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 09-accuracy-audit-and-algorithm-fixes*
*Context gathered: 2026-03-02*

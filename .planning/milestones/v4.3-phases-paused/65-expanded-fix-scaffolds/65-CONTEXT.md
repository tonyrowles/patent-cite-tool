# Phase 65: Expanded Fix Scaffolds - Context

**Gathered:** 2026-06-09
**Status:** Ready for planning
**Mode:** Auto-generated (pure-infrastructure phase per smart-discuss heuristic)

<domain>
## Phase Boundary

Add 2 new fix scaffolds (`VERIFIER_DISAGREE` + `FRAME_SHIFT_DETECTED`) to `PROMPT_SCAFFOLDS` registry via the existing `buildScaffoldSystemPrompt` helper in `tests/e2e/lib/fix-prompt-builder.js`. Wire a 5-site enumeration drift guard so any new ERROR_CLASS appears across all canonical surfaces. Add byte-stability sha256 pin for the 5 existing scaffolds against Phase 45 baseline.

Requirements covered: SCAF-01, SCAF-02, SCAF-03, SCAF-04.

</domain>

<decisions>
## Implementation Decisions

### SCAF-01: VERIFIER_DISAGREE scaffold (highest leverage — already heuristically produced by Rule 2)

- Add `VERIFIER_DISAGREE_CONTRACT` + `VERIFIER_DISAGREE_SYSTEM` constants in `tests/e2e/lib/fix-prompt-builder.js`
- Pattern: mirror existing `WRONG_CITATION` and `LLM_HALLUCINATED_SELECTION` constructor blocks (lines 308-313)
- New constant: `const VERIFIER_DISAGREE_SYSTEM = buildScaffoldSystemPrompt({ className: 'VERIFIER_DISAGREE', fixSurfaceContract: VERIFIER_DISAGREE_CONTRACT });`
- Add to `PROMPT_SCAFFOLDS` Object.freeze respread: `VERIFIER_DISAGREE: () => VERIFIER_DISAGREE_SYSTEM`
- `VERIFIER_DISAGREE_CONTRACT` content: directs the LLM to inspect the verifier disagreement window (expected vs observed citation), identify the divergence pattern (off-by-N lines, column inference fail, OCR drift), and propose a fix in the citation tool's matching logic. Refer to issue_body's `### Verifier Disagreement` section (mirrors Phase 35 template).

### SCAF-02: FRAME_SHIFT_DETECTED scaffold + new ERROR_CLASS + producer wiring

- New ERROR_CLASS constant `FRAME_SHIFT_DETECTED` in `tests/e2e/lib/error-codes.js` (additive: extend `ERROR_CLASSES` Object.freeze array; preserve order; add at end)
- New `FRAME_SHIFT_DETECTED_CONTRACT` + `FRAME_SHIFT_DETECTED_SYSTEM` constants in `fix-prompt-builder.js`
- Add to `PROMPT_SCAFFOLDS` registry
- Producer wiring: extend `.github/workflows/v40-pdfjs-frame-shift.yml` to emit a GitHub issue body containing a `<frame_shift_evidence>` section when the regression suite detects a frame shift in the pdfjs-dist upgrade path
- `FRAME_SHIFT_DETECTED_CONTRACT` content: directs the LLM to inspect the `<frame_shift_evidence>` block (old pdfjs run output + new pdfjs run output + diff), identify the shifted byte offset / line offset, and propose a fix in the pdfjs frame-mapping logic

### SCAF-03: 5-site enumeration drift guard

New Vitest file `tests/unit/error-class-enumeration-drift.test.js`. For each ERROR_CLASS in `error-codes.js:ERROR_CLASSES`, assert presence in:
1. `tests/e2e/lib/error-codes.js` ERROR_CLASSES array (source of truth)
2. `.github/workflows/v40-auto-fix.yml:91` precheck list (grep)
3. `tests/e2e/lib/fix-prompt-builder.js:PROMPT_SCAFFOLDS` registry (object key)
4. `tests/e2e/scripts/inject-defect.mjs:ERROR_CLASSES` Set (mutator allowlist)
5. `tests/e2e/lib/llm-router.js:MODEL_ROUTES` OR `// MODEL_DEFAULT_OK: <CLASS>` comment justifying default-sonnet routing

The test:
- Reads `ERROR_CLASSES` array length, iterates each member.
- For each member: greps source files for the literal string. Asserts presence at sites 1, 2, 3, 4. For site 5: either `MODEL_ROUTES` has an entry OR a `// MODEL_DEFAULT_OK: <CLASS>` comment exists in `llm-router.js`.
- Test failure surfaces: "ERROR_CLASS 'X' is in error-codes.js but missing from `<site>`" — actionable error message.

### SCAF-04: Byte-stability sha256 pin for 5 existing scaffolds

New Vitest test in `tests/unit/fix-prompt-builder-byte-stability.test.js` (or extend existing test file). For each of `WRONG_CITATION`, `LLM_HALLUCINATED_SELECTION`, `WORKER_FALLBACK_FAILED`, `GOOGLE_DOM_DRIFT`, `HARNESS_ERROR`:
- Call `PROMPT_SCAFFOLDS[className]()` to get the systemPrompt string
- Compute sha256 of the string
- Assert equality against a pinned hex digest (computed once during Phase 65 implementation; future scaffold edits MUST update the pin deliberately)

This satisfies the Phase 45 baseline-stability invariant from the research convergence.

### Trust-Invariant Non-Mutations

- `PROMPT_SCAFFOLDS` Object.freeze invariant preserved
- `ERROR_CLASSES` Object.freeze additive-only (no removal, no reorder of existing entries — append-only at end)
- `buildScaffoldSystemPrompt` body byte-unchanged (function signature stable)
- `buildFixPrompt` body byte-unchanged (only PROMPT_SCAFFOLDS lookup needs the new keys)
- 5 existing scaffold sha256 pins (this phase establishes them as constants)

### Commit strategy

Recommend 2 commits:
1. `feat(65): VERIFIER_DISAGREE + FRAME_SHIFT_DETECTED scaffolds + ERROR_CLASS entry (SCAF-01..02)` — fix-prompt-builder.js + error-codes.js + workflow producer
2. `feat(65): 5-site enumeration drift guard + scaffold byte-stability pins (SCAF-03..04)` — new Vitest tests

OR a single combined commit if scope is tight.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `tests/e2e/lib/fix-prompt-builder.js:buildScaffoldSystemPrompt` (line 117) — shared template helper
- `tests/e2e/lib/fix-prompt-builder.js:PROMPT_SCAFFOLDS` (line 357) — Object.freeze registry; respread to add new keys
- `tests/e2e/lib/fix-prompt-builder.js` constants pattern (lines 308-328) — 5 existing `*_SYSTEM` constants
- `tests/e2e/lib/error-codes.js:ERROR_CLASSES` (line 98) — Object.freeze array; append-only extension
- `.github/workflows/v40-pdfjs-frame-shift.yml` — existing frame-shift detection workflow; FRAME_SHIFT_DETECTED producer extension target

### Established Patterns
- Constants follow `*_CONTRACT` + `*_SYSTEM` naming
- Vitest tests in `tests/unit/*.test.js`; fileParallelism: false
- Object.freeze preserved via respread (additive only)

### Integration Points
- Phase 64 introduced TRIAGE rules; this phase adds the corresponding fix scaffolds for new classifications (VERIFIER_DISAGREE was heuristically produced by Phase 64's Rule 2)
- Phase 67 (next) extends `buildFixPrompt` with `rewriteHint` parameter — Phase 65 scaffolds must support the new signature without breaking the existing call sites

</code_context>

<specifics>
## Specific Ideas

- VERIFIER_DISAGREE_CONTRACT references the Phase 35 Verifier Disagreement template shape (same headers `### Verifier Disagreement`, `Expected citation`, `Observed citation`, `Verifier tier:`, `Rerun verdict:`)
- FRAME_SHIFT_DETECTED_CONTRACT references the `<frame_shift_evidence>` envelope produced by the workflow
- The 5-site drift guard test is the LOAD-BEARING gate that prevents future enumeration drift — failure of this test means an ERROR_CLASS was added without all 5 sites being updated. Failure message must include site-by-site presence/absence.

</specifics>

<deferred>
## Deferred Ideas

- SCAF-DEF-01 (`PDF_PARSE_FAILED`) — STACK recommendation; deferred to v4.4 to keep Phase 65 scope tight
- SCAF-DEF-02 (column inference fail, IDB failure, OCR tier 0b regression, gutter tier 5 regression, cache miss timeout, A/B winner flip, Tier-C disagreement) — need new producer sites OR subsumed by existing scaffolds

</deferred>

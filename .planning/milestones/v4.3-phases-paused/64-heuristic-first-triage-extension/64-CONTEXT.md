# Phase 64: Heuristic-First Triage Extension - Context

**Gathered:** 2026-06-09
**Status:** Ready for planning
**Mode:** Auto-generated (pure-infrastructure phase per smart-discuss heuristic)

<domain>
## Phase Boundary

Extend `tests/e2e/lib/triage-classifier.js:runTriage` D-03 rule chain (lines 427-501) with 3 new heuristic rules pushing classifier coverage from 7/11 → 10/11 ERROR_CLASSES — WITHOUT weakening the `VERIFIER_STRONG_AGREEMENT` Tier-C-masking guard (Phase 34/D-02 invariant from `triage-classifier.js:43`).

Requirements covered: TRIAGE-01, TRIAGE-02, TRIAGE-03, TRIAGE-04.

</domain>

<decisions>
## Implementation Decisions

### Where the new rules land (D-03 chain order)

Per `triage-classifier.js:16` rule chain order: `FLAKE → CONFIRMED+strong → NOT_REPLAYABLE+specific → ambiguous`. Insert NEW rules BETWEEN Rule 3 (NOT_REPLAYABLE+specific) and Rule 4 (ambiguous fallthrough). Specifically: AFTER line 501 (Rule 3 close) and BEFORE the `ambiguous.push(iter)` line that begins Rule 4.

Reasoning: All 3 new rules are heuristic-confidence "ambiguous-class deflectors" — they pull specific error classifications OUT of the ambiguous bucket without touching FLAKE/strong-agreement paths.

### TRIAGE-01: EXTENSION_NOT_LOADED rule

Heuristic signal: iteration's error_reason or classification field matches /extension.*(not.*loaded|failed.*attach)/i. LOW complexity. No new dependencies.

Rule body (pseudo):
```js
if (iter.classification === 'EXTENSION_NOT_LOADED' ||
    /extension (?:not.*loaded|failed.*attach)/i.test(iter.error_reason ?? '')) {
  iter.triaged_class = 'EXTENSION_NOT_LOADED';
  iter.triage_confidence = 'heuristic';
  continue;
}
```

### TRIAGE-02: GOOGLE_DOM_DRIFT (mutator-aware) rule

CRITICAL: Heuristic resolves ONLY when the diagnostic-injection mutator snippet (DIAG-01 from Phase 61) is present in the issue body. Real DOM drift (no snippet) still routes to LLM.

Detection: iter.issue_body contains BOTH the v2 marker `<!-- fp: ` AND one of the verbatim selectors (`'patent-result'`, `'section[itemprop="claims"]'`, `'main'`, `'article'` per Phase 61 mutator).

Rule body (pseudo):
```js
const hasMutatorMarker = /<!-- fp: [0-9a-f]{12} -->/.test(iter.issue_body ?? '');
const hasDomDriftSelector = /(?:patent-result|section\[itemprop="claims"\]|\bmain\b|\barticle\b)/.test(iter.issue_body ?? '');
const isMutatorInjected = hasMutatorMarker && hasDomDriftSelector;
if (iter.classification === 'GOOGLE_DOM_DRIFT' && isMutatorInjected) {
  iter.triaged_class = 'GOOGLE_DOM_DRIFT';
  iter.triage_confidence = 'heuristic_mutator_aware';
  continue;
}
// Real DOM drift (no mutator marker) falls through to LLM routing — DO NOT short-circuit.
```

### TRIAGE-03: WORKER_FALLBACK_FAILED rule

Consumes a `fault_injection_status` field. Producer co-design: if the field doesn't exist on iter, the rule is a no-op (graceful degradation). For the heuristic to fire: `iter.fault_injection_status?.worker_fallback_failed === true`.

Producer site: `tests/e2e/specs/fault-injection.spec.js` (per REQUIREMENTS TRIAGE-03). If the field is absent from production iter shape, the spec file should be extended in this phase (additive — no breaking changes) so the heuristic has data to consume in CI.

Rule body (pseudo):
```js
if (iter.fault_injection_status?.worker_fallback_failed === true ||
    iter.classification === 'WORKER_FALLBACK_FAILED') {
  iter.triaged_class = 'WORKER_FALLBACK_FAILED';
  iter.triage_confidence = 'heuristic_fault_injection';
  continue;
}
```

### TRIAGE-04: VERIFIER_STRONG_AGREEMENT Tier-C-masking guard preserved (NON-NEGOTIABLE)

The Phase 34 invariant at `triage-classifier.js:43` MUST NOT change. The `VERIFIER_STRONG_AGREEMENT` exported function ensures Tier C verdicts NEVER trigger CONFIRMED short-circuit (Pitfall 2 mitigation). Specifically:
- Function body at line 43 BYTE-UNCHANGED
- Rule 2 (CONFIRMED + strong) BYTE-UNCHANGED
- Cluster pre-filter sample-size invariant: cluster call count must NOT decrease vs v4.2 baseline

Vitest pin: re-run pre-existing `VERIFIER_STRONG_AGREEMENT` tests; all must stay green.

### File scope

Files modified:
- `tests/e2e/lib/triage-classifier.js` (insert 3 new rules; no removals)
- `tests/unit/triage-classifier.test.js` (or wherever runTriage is tested — add cases for each new rule + the mutator-aware vs real-drift split)
- (optional) `tests/e2e/specs/fault-injection.spec.js` (additive `fault_injection_status` field emission if not present)

Files NOT modified:
- `tests/e2e/lib/error-codes.js` (no new ERROR_CLASS entries; existing constants reused)
- `tests/e2e/lib/llm-router.js` (default-sonnet routing unchanged; new classes route via existing fallthrough)
- `scripts/auto-fix.mjs`, `scripts/auto-fix-promote.mjs` (no schema changes)

### Trust-invariant non-mutations

- `triage-classifier.js:43` VERIFIER_STRONG_AGREEMENT body byte-unchanged
- `triage-classifier.js` Rule 2 body byte-unchanged (CONFIRMED + strong agreement)
- Pre-existing triage-classifier tests stay green
- ESLint clean

### Commit strategy

ONE commit ships all 3 new rules + tests. Subject: `feat(64): heuristic-first triage extension — EXTENSION_NOT_LOADED + GOOGLE_DOM_DRIFT mutator-aware + WORKER_FALLBACK_FAILED (TRIAGE-01..04)`.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `tests/e2e/lib/triage-classifier.js` (920 LOC) — runTriage at line 400; D-03 rule chain at lines 427-501; VERIFIER_STRONG_AGREEMENT at line 43.
- `tests/e2e/lib/error-codes.js` — EXTENSION_NOT_LOADED at line 51, GOOGLE_DOM_DRIFT at line 56, WORKER_FALLBACK_FAILED at line 64. All three already exist in ERROR_CLASSES Set.
- Phase 61 mutator marker `<!-- fp: <12-hex> -->` and selectors (TRIAGE-02 detection criteria).

### Established Patterns
- Pure-function rule body returning a short-circuit `continue` after setting `iter.triaged_class` + `iter.triage_confidence`.
- Vitest tests in `tests/unit/*.test.js`; fileParallelism: false.

### Integration Points
- Phase 61's mutator (DIAG-01) is the producer for the TRIAGE-02 mutator-aware path.
- Phase 30 fault-injection spec is the producer for TRIAGE-03.

</code_context>

<specifics>
## Specific Ideas

- All 3 new rules use `iter.triage_confidence` with distinct labels (`'heuristic'`, `'heuristic_mutator_aware'`, `'heuristic_fault_injection'`) so downstream A/B winner / forensic queries can stratify.
- TRIAGE-02 mutator-aware regex MUST be cheap (no backtracking risk) — anchored alternation only.
- Coverage assertion: new Vitest cases count the number of distinct ERROR_CLASSES the classifier can heuristic-resolve. Pre-Phase-64 = 7; post-Phase-64 = 10. The list of resolvable classes is a frozen test fixture; Phase 64 test asserts length === 10.

</specifics>

<deferred>
## Deferred Ideas

- TRIAGE-DEF-01 (`UI_BROKEN`) — signal ambiguity with EXTENSION_NOT_LOADED; defer to v4.4.
- TRIAGE-DEF-02 (`USPTO_API_DRIFT`) — absent producer; defer to v4.4.
- TRIAGE-DEF-03 (`NO_CITATION_PRODUCED`) — deliberately LLM-routed; heuristic resolution would mask product bugs.

</deferred>

---
phase: 34-hybrid-triage-classifier
plan: 02
subsystem: triage-classifier
tags: [triage-classifier, heuristic-rules, verifier-strong-agreement, schema-guard, pure-function, vitest, tdd]

dependency_graph:
  requires:
    - 34-01 (invokeClaudePWithLedger in llm-driver.js — Plan 03 will use it as default invokeLlm)
    - phase-33 (rerun-validator.js — input rerun-report.json schema)
    - phase-31 (llm-report.json schema — input iterations shape)
  provides:
    - tests/e2e/lib/triage-classifier.js (pure-fn heuristic classifier module)
    - tests/unit/triage-classifier.test.js (28 Vitest tests, all green)
  affects:
    - 34-03 (extends triage-classifier.js with CLUSTER_THRESHOLD + wrapPatentData + LLM second-pass)
    - 34-04 (CLI runner imports runTriage from triage-classifier.js)
    - 34-05 (ESLint guard scoped to triage-classifier.js + CLI)

tech_stack:
  added: []
  patterns:
    - pure-function injected-deps entrypoint (mirrors rerun-validator.js Phase 33)
    - atomicWriteJson inlined verbatim 3rd time (D-12 explicit forbids extraction to shared util)
    - VERIFIER_STRONG_AGREEMENT as named exported const (Pitfall 2 mitigation)
    - SEVERITIES Object.freeze frozen taxonomy (D-04)
    - path_taken pending_llm transient placeholder (Plan 03 seam)

key_files:
  created:
    - tests/e2e/lib/triage-classifier.js
    - tests/unit/triage-classifier.test.js
  modified: []

decisions:
  - D-02: VERIFIER_STRONG_AGREEMENT exported as const arrow fn with defensive default-arg destructure — missing input returns false not throws
  - D-03 rule chain: 4-rule first-match chain; Rule 3 condition covers both explicit NOT_REPLAYABLE verdict and missing rerun entry (Assumption A4 from 34-RESEARCH.md)
  - D-12: atomicWriteJson body is byte-for-byte identical to rerun-validator.js lines 111-126 (verified via diff)
  - "FLAKE_ITER" classification in schema test falls through to ambiguous rule (Rule 4) — produces pending_llm finding — arithmetic invariant still holds
  - Comments referencing getPdfSnippet/revised D-16 in docstrings are OK; zero functional/import references

metrics:
  duration_minutes: 15
  completed_date: "2026-05-27"
  tasks_completed: 2
  tasks_total: 2
  test_count_added: 28
  files_created: 2
  files_modified: 0
---

# Phase 34 Plan 02: Triage Classifier Heuristic Core Summary

Pure-function heuristic triage classifier with VERIFIER_STRONG_AGREEMENT named gate (Pitfall 2 exclusion of Tier C), SEVERITIES frozen taxonomy, 6-rule D-03 chain, inline atomicWriteJson (D-12 verbatim), and pending_llm placeholder seam for Plan 03's LLM second-pass.

## Decisions Honored

| Decision | Status | Notes |
|----------|--------|-------|
| D-01: 6 heuristic classifications | DONE | FLAKE, CONFIRMED+A/B, NOT_REPLAYABLE×4 |
| D-02: VERIFIER_STRONG_AGREEMENT named gate | DONE | Tier C/D explicitly false; defensive default-arg |
| D-03: rule chain order (FLAKE→CONFIRMED+strong→NOT_REPLAYABLE+specific→ambiguous) | DONE | First-match-wins; missing rerun entry treated as NOT_REPLAYABLE per Assumption A4 |
| D-04: SEVERITIES Object.freeze taxonomy | DONE | 5 levels: critical/high/medium/low/info |
| D-09: top-level triage-report.json schema | DONE | schema_version, sources, run_id, times, summary, findings |
| D-10: per-finding schema | DONE | iteration_n, severity, category, root_cause_hypothesis, confidence, rationale, path_taken |
| D-12: atomicWriteJson inlined verbatim | DONE | `diff` confirms byte-for-byte identical to rerun-validator.js lines 111-126 |
| D-14 (revised D-16): runTriage signature, no getPdfSnippet dep | DONE | No import of pdf-snippet.js; selectedText read directly from iter.llm_selection |

## Plan 03 Seam: `path_taken: 'pending_llm'`

Ambiguous iterations (Tier C + CONFIRMED, or any unmatched Rule 4 case) are pushed onto an `ambiguous[]` array. After the rule-chain loop, each ambiguous iter receives a placeholder finding:

```js
{
  iteration_n: iter.iteration_n,
  severity: 'medium',         // Plan 03 overwrites
  category: iter.classification,
  root_cause_hypothesis: 'pending LLM second-pass',
  confidence: 0,
  rationale: 'Plan 34-03 wires the LLM second-pass for this finding',
  path_taken: 'pending_llm',  // TRANSIENT — Plan 03 replaces
}
```

Plan 03's diff is additive: it exports `CLUSTER_THRESHOLD` + `wrapPatentData`, replaces the `ambiguous` placeholder loop with the cluster pre-filter + LLM second-pass, and updates the `path_taken` assertion in Task 1's test from `'pending_llm'` to `'llm_single'` or `'llm_cluster'`. The shipped triage-report.json after Plan 03 has zero `pending_llm` entries (Plan 03 acceptance criterion verifies with a grep gate).

## Test Coverage

28 tests, all green. Coverage breakdown:

| Describe block | Tests | Requirements |
|----------------|-------|--------------|
| VERIFIER_STRONG_AGREEMENT named gate | 7 | TRIAGE-02, D-02, Pitfall 2 |
| SEVERITIES frozen taxonomy | 3 | D-04 |
| runTriage heuristic resolution | 8 | TRIAGE-01, D-01, D-03 |
| Tier C escalation boundary | 2 | TRIAGE-01 negative, Pitfall 2 |
| triage-report.json schema | 6 | TRIAGE-05, D-09, D-10 |
| atomicWriteJson | 2 | D-12, T-34-05 |

## TRIAGE Requirements Status

| Requirement | Status | Notes |
|-------------|--------|-------|
| TRIAGE-01: 6-of-8 heuristic (invokeLlm callCount===0) | VERIFIED | 7-iteration aggregate test; spy.callCount === 0 |
| TRIAGE-02: VERIFIER_STRONG_AGREEMENT named gate, Tier C excluded | VERIFIED | Direct gate tests + Tier C via runTriage |
| TRIAGE-03: cluster pre-filter (N≥5 → 1 LLM call) | PENDING Plan 03 | CLUSTER_THRESHOLD + cluster logic ships in Plan 03 |
| TRIAGE-04: subscription-local invariant (no LLM in CI) | PARTIAL | Wrapper from Plan 01 verified; CLI guard pending Plan 04; ESLint guard pending Plan 05 |
| TRIAGE-05: schema D-09/D-10 keys + arithmetic invariant | VERIFIED | Schema-guard test reads written JSON; invariant asserted |
| TRIAGE-06: wrapPatentData prompt-injection defense | PENDING Plan 03 | D-13 helper ships in Plan 03 |

## Commits

| Hash | Message |
|------|---------|
| `66ef397` | `test(34-02): add failing TDD RED tests for triage-classifier heuristic core` |
| `262c0a0` | `feat(34-02): implement triage-classifier.js heuristic core (TDD GREEN)` |

## Deviations from Plan

None — plan executed exactly as written.

The two comment-line references to `getPdfSnippet` in the docstring of `triage-classifier.js` (saying "NO getPdfSnippet dep" per revised D-16) are documentation of the removal, not functional references. Zero imports, zero function calls.

## Known Stubs

- `path_taken: 'pending_llm'` in the ambiguous-path placeholder is an intentional TRANSIENT stub. Plan 03 will replace all `pending_llm` occurrences. This stub is explicitly expected by the Tier C escalation boundary test in `triage-classifier.test.js`.

## Threat Surface Scan

No new security-relevant surface introduced. The two mitigations tracked in the threat register for this plan:

| Threat ID | Mitigation | Status |
|-----------|------------|--------|
| T-34-04: Tier C masking via misclassified PASS | `VERIFIER_STRONG_AGREEMENT` named gate excludes tier_used ∈ {'C','D'}; Vitest test asserts direct gate call returns false for tier C | DONE |
| T-34-05: Truncated triage-report.json on crash | Inline atomicWriteJson with EXDEV fallback (D-12); 3rd verbatim copy | DONE |
| T-34-06: SEVERITIES mutation | `Object.freeze` on array; Vitest `Object.isFrozen(SEVERITIES) === true` test | DONE |

## Self-Check: PASSED

- [x] `tests/e2e/lib/triage-classifier.js` exists: FOUND
- [x] `tests/unit/triage-classifier.test.js` exists: FOUND
- [x] Commit `66ef397` exists: FOUND
- [x] Commit `262c0a0` exists: FOUND
- [x] `npx vitest run tests/unit/triage-classifier.test.js`: 28 tests passed
- [x] `npm run test:src`: 505 tests passed (no regressions)
- [x] `npm run lint`: 0 errors

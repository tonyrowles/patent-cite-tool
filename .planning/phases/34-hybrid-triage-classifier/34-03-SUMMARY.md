---
phase: 34-hybrid-triage-classifier
plan: 03
subsystem: triage-classifier
tags: [triage-classifier, cluster-pre-filter, wrapPatentData, prompt-injection-defense, llm-second-pass, vitest, tdd]

dependency_graph:
  requires:
    - 34-01 (invokeClaudePWithLedger in llm-driver.js — Plan 04 wires it as default invokeLlm)
    - 34-02 (triage-classifier.js heuristic core + pending_llm placeholder seam)
  provides:
    - tests/e2e/lib/triage-classifier.js (extended: CLUSTER_THRESHOLD + wrapPatentData + cluster pre-filter + LLM second-pass)
    - tests/unit/triage-classifier.test.js (extended: 19 new Plan 03 tests, 47 total, all green)
  affects:
    - 34-04 (CLI runner can wire invokeClaudePWithLedger as invokeLlm; no getPdfSnippet needed)
    - 34-05 (ESLint guard scoped to triage-classifier.js)

tech_stack:
  added: []
  patterns:
    - cluster pre-filter via Map<category, iter[]> — AFTER heuristic loop, BEFORE invokeLlm (D-11 ordering invariant)
    - wrapPatentData XML boundary helper — closer-rejection defense (D-13, Pitfall 4)
    - parseSingleResponse / parseClusterResponse with Pitfall 6 parity enforcement
    - invokeLlm called with {phase: '34', source: 'triage'} — D-06 wrapper contract
    - path_taken arithmetic: (heuristic | llm_single + llm_single_parse_error | llm_cluster + llm_cluster_parse_error) === total_findings

key_files:
  created: []
  modified:
    - tests/e2e/lib/triage-classifier.js
    - tests/unit/triage-classifier.test.js

decisions:
  - D-11: CLUSTER_THRESHOLD=5 literal constant exported; cluster grouping runs AFTER heuristic loop (ambiguous[] fully populated) and BEFORE any invokeLlm call — Vitest spy callCount semantics require this order
  - D-13 honored: wrapPatentData throws on </patent_data> closer (not escape); throws TypeError on non-string
  - Revised D-16 honored: prompt builders read iter.llm_selection?.selectedText directly; no getPdfSnippet dep anywhere in the module
  - Pitfall 6 parity: parseClusterResponse iterates input group, builds byIterN Map from parsed array (ignoring fabricated entries), synthesizes HARNESS_ERROR findings for missing iteration_ns
  - llm_single_parse_error bucket: counted under llm_pass_count (same arithmetic bucket as llm_single) — symmetric with cluster_parse_error under cluster_pass_count
  - pending_llm seam: Plan 02 placeholder loop fully replaced — zero pending_llm path_taken in output (grep gate in acceptance criteria)

metrics:
  duration_minutes: 18
  completed_date: "2026-05-27"
  tasks_completed: 2
  tasks_total: 2
  test_count_added: 19
  test_count_total: 47
  files_created: 0
  files_modified: 2
---

# Phase 34 Plan 03: Cluster Pre-filter + wrapPatentData + LLM Second-pass Summary

Extends `tests/e2e/lib/triage-classifier.js` with the cluster pre-filter (D-11, TRIAGE-03), the `<patent_data>` prompt-injection defense (D-13, TRIAGE-06), and the LLM second-pass dispatch. Replaces every `path_taken: 'pending_llm'` placeholder (Plan 02 seam) with real `llm_single`/`llm_cluster`/parse-error variants. All 47 unit tests pass; 524 total project tests pass.

## Decisions Honored

| Decision | Status | Notes |
|----------|--------|-------|
| D-11: CLUSTER_THRESHOLD = 5 exported constant | DONE | Literal value; `export const CLUSTER_THRESHOLD = 5` |
| D-11 ordering: cluster grouping AFTER heuristic loop, BEFORE invokeLlm | DONE | `ambiguousByCategory` Map built from fully-populated `ambiguous[]` array; no invokeLlm called during heuristic phase |
| D-11 Vitest spy semantics: N=5 → callCount=1; N=4 → callCount=4; heuristic-only → callCount=0 | DONE | Tests assert `.mock.calls.length` explicitly for each case |
| D-13: wrapPatentData exported; throws on closer-injection; throws TypeError on non-string | DONE | Verbatim from 34-RESEARCH.md Pattern 6 lines 433-446 |
| Revised D-16: prompt builders read iter.llm_selection?.selectedText directly | DONE | No getPdfSnippet dep anywhere in module; functional grep passes |
| D-10 path_taken: no pending_llm in output | DONE | grep gate: 0 matches |
| Summary arithmetic invariant | DONE | heuristic_count + llm_pass_count + cluster_pass_count === total_findings for all mixed-path combos |
| Pitfall 6: cluster response parity check | DONE | parseClusterResponse ignores fabricated iteration_ns; synthesizes llm_cluster_parse_error for missing ones |
| Pitfall 6 corollary: single-finding parse error | DONE | parseSingleResponse catches JSON.parse failure → llm_single_parse_error, category: HARNESS_ERROR |
| D-07: no invokeClaudeP import | DONE | All invokeLlm calls go through the injected parameter; functional grep passes |

## D-11 Ordering Invariant (Critical)

The cluster grouping **must** happen after the heuristic rule chain populates `ambiguous[]` and **before** any `invokeLlm` call. This is the canonical Pitfall 6 mitigation from 34-RESEARCH.md:

```
for (const iter of inputLlmReport.iterations) {
  // ... heuristic rules push to ambiguous[] ...
}

// After the loop: group ambiguous by category
const ambiguousByCategory = new Map();
for (const iter of ambiguous) { ... }

// Then dispatch per category group
for (const [category, group] of ambiguousByCategory) {
  if (group.length >= CLUSTER_THRESHOLD) {
    // ONE call
  } else {
    // Per-finding calls
  }
}
```

If invokeLlm were called inside the heuristic loop (before all ambiguous entries are known), the spy callCount would be indeterminate.

## Spy callCount Assertions Verifying TRIAGE-03

| Test | Expected callCount | Assertion |
|------|--------------------|-----------|
| N=5 same-category cluster | 1 | `expect(invokeLlmSpy.mock.calls.length).toBe(1)` |
| N=4 same-category group (below threshold) | 4 | `expect(invokeLlmSpy.mock.calls.length).toBe(4)` |
| 5 WRONG_CITATION + 3 VERIFIER_DISAGREE | 4 (1 cluster + 3 single) | `expect(invokeLlmSpy.mock.calls.length).toBe(4)` |
| 3 + 3 two categories below threshold | 6 | `expect(invokeLlmSpy.mock.calls.length).toBe(6)` |
| Heuristic-only | 0 | `expect(invokeLlmSpy.mock.calls.length).toBe(0)` |

## Pitfall 6 Parity Check Implementation

`parseClusterResponse(llmText, group)` enforces:

1. Parse LLM JSON array (catch malformed → empty array)
2. Build `byIterN = new Map<iteration_n, parsedEntry>` from parsed array
3. Iterate over **input group** (not parsed array): for each iter, look up `byIterN.get(iter.iteration_n)` — fabricated iteration_ns simply have no key in the input group iteration and are never emitted
4. Missing entries synthesize `{path_taken: 'llm_cluster_parse_error', category: 'HARNESS_ERROR'}`

The mirror for single-finding: `parseSingleResponse` wraps `JSON.parse` in try/catch; failure → `{path_taken: 'llm_single_parse_error', category: 'HARNESS_ERROR'}`.

## Summary Arithmetic Invariant

`heuristic_count + llm_pass_count + cluster_pass_count === total_findings`

Bucket assignment:
- `path_taken === 'heuristic'` → `heuristic_count`
- `path_taken ∈ {'llm_single', 'llm_single_parse_error'}` → `llm_pass_count`
- `path_taken ∈ {'llm_cluster', 'llm_cluster_parse_error'}` → `cluster_pass_count`

Parse errors are counted in the same bucket as successful LLM-path findings to preserve the invariant — there is no "fourth bucket" for errors.

## TRIAGE Requirements Status

| Requirement | Status | Notes |
|-------------|--------|-------|
| TRIAGE-01: 6-of-8 heuristic (invokeLlm callCount===0) | VERIFIED | Heuristic-only test still passes; Plan 03 did not regress |
| TRIAGE-02: VERIFIER_STRONG_AGREEMENT named gate, Tier C excluded | VERIFIED | Unchanged from Plan 02 |
| TRIAGE-03: cluster pre-filter (N≥5 → 1 LLM call) | VERIFIED | N=5 spy test: callCount===1; N=4: callCount===4; cross-category isolation tests pass |
| TRIAGE-04: subscription-local invariant | PARTIAL | Wrapper from Plan 01 verified; CLI guard pending Plan 04; ESLint guard pending Plan 05 |
| TRIAGE-05: schema arithmetic invariant | VERIFIED | Mixed-run test (3+5+4=12) passes; all path_taken buckets accounted |
| TRIAGE-06: wrapPatentData prompt-injection defense | VERIFIED | 5 wrapPatentData tests pass; every prompt builder routes selectedText through it; userPrompt regex test passes |

## Commits

| Hash | Message |
|------|---------|
| `cb84c0d` | `test(34-03): add failing TDD RED tests for cluster pre-filter, wrapPatentData, LLM-path` |
| `c990b4a` | `feat(34-03): implement cluster pre-filter, wrapPatentData, LLM second-pass (TDD GREEN)` |

## Deviations from Plan

None — plan executed exactly as written.

The comment references to `getPdfSnippet` in module docstrings (3 occurrences) are documentation of the D-16 revision ("NO getPdfSnippet dep"), not functional code. Zero imports, zero function calls — consistent with Plan 02's established precedent.

## Known Stubs

None. All `pending_llm` placeholders have been replaced. Zero `path_taken === 'pending_llm'` entries in the module or tests (grep gate verified).

## Threat Surface Scan

No new security-relevant surface introduced. The three threat mitigations tracked in the threat register for this plan:

| Threat ID | Mitigation | Status |
|-----------|------------|--------|
| T-34-07: Prompt injection from patent body (selectedText) | `wrapPatentData` XML boundary + closer-rejection + systemPrompt instructs UNTRUSTED DATA; Vitest test asserts userPrompt regex AND selectedText flows through unaltered | DONE |
| T-34-08: DoS via DOM_DRIFT saturation (budget exhaustion) | `CLUSTER_THRESHOLD = 5` gates cluster path; Vitest spy asserts callCount === 1 for N=5 | DONE |
| T-34-09: Cluster response tampering (fabricated iteration_n) | Strict parity check in parseClusterResponse: iteration group drives output, not parsed array; fabricated ns ignored; missing ns → llm_cluster_parse_error | DONE |

## Self-Check: PASSED

- [x] `tests/e2e/lib/triage-classifier.js` modified: FOUND
- [x] `tests/unit/triage-classifier.test.js` modified: FOUND
- [x] Commit `cb84c0d` exists: FOUND
- [x] Commit `c990b4a` exists: FOUND
- [x] `npx vitest run tests/unit/triage-classifier.test.js`: 47 tests passed
- [x] `npm run test:src`: 524 tests passed (no regressions)
- [x] `npm run lint`: 0 errors
- [x] `grep -c "path_taken: 'pending_llm'" tests/e2e/lib/triage-classifier.js`: 0
- [x] `grep -c "export const CLUSTER_THRESHOLD = 5" tests/e2e/lib/triage-classifier.js`: 1
- [x] `grep -c "export function wrapPatentData" tests/e2e/lib/triage-classifier.js`: 1
- [x] All 7 public exports present: VERIFIED

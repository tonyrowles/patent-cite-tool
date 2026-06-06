# Phase 53: auto-fix:partial-verified Semantics - Context

**Gathered:** 2026-06-03
**Status:** Ready for planning
**Mode:** Architectural extension — trust-boundary work; plan review MANDATORY (STATE blocker)

<domain>
## Phase Boundary

Add a SECOND state-machine entry point (`assertPartialGate`) to `scripts/auto-fix-promote.mjs` for the case where verifier-gate passes ≥4/5 of affected cases (not all-or-nothing). The existing `assertTripleGate` body remains byte-unchanged — the trust invariant boundary is hardened by a Vitest assertion that ships in the SAME COMMIT as the new label.

Four deliverables (all are PARTIAL-NN REQs):

1. **PARTIAL-01:** `assertPartialGate` is a NEW exported function in `scripts/auto-fix-promote.mjs` — a SEPARATE entry point (not a widened `assertTripleGate`). Does NOT call `runPromote({_skipCiGuard:true})`. The existing `assertTripleGate` body is BYTE-UNCHANGED.
2. **PARTIAL-02:** `.github/workflows/v40-verifier-gate.yml` `ready-flip` job gains a conditional step that produces an `auto-fix:partial-verified` label when at least 4/5 (≥80%) of affected cases pass. Full-pass `auto-fix:verified` path is BYTE-UNCHANGED.
3. **PARTIAL-03:** `.github/workflows/v40-auto-promote.yml` job-level `if:` filter widens to include `auto-fix:partial-verified`. Partial-pass promotion mutates the corpus only for the PASSING case subset (failing cases stay in quarantine).
4. **PARTIAL-04:** A Vitest assertion `assertTripleGate` throws on `auto-fix:partial-verified` (proves the trust invariant boundary holds). Ships in the SAME COMMIT as the new label / `assertPartialGate` function.

**Out of scope:**
- Per-ERROR_CLASS thresholds (need UAT-47-a calibration data we don't have — deferred to v4.2 / Phase 56)
- Widening `assertTripleGate` to accept the new label — explicitly forbidden by PARTIAL-01 (trust invariant erosion)
- Calling `_skipCiGuard:true` from the partial path — explicitly forbidden by PARTIAL-01
- Auto-closing permanently-failing cases — deferred to v4.2; failing cases stay quarantined with a source-issue comment
- Real LLM invocations in this phase (we're only extending the gate logic; the LLM is invoked upstream by `v40-auto-fix.yml`)

</domain>

<decisions>
## Implementation Decisions

### PARTIAL-01: assertPartialGate Signature

- **D-01:** **Signature:** `assertPartialGate({ prLabels, merged, sourceIssueLabels, passingCases } = {})`. First 3 args match `assertTripleGate` for symmetry; `passingCases: string[]` is the case IDs the verifier confirmed PASS.
- **D-02:** **Leg structure (3 legs, mirrors triple but for partial label):**
  - Leg 1 — PR carries `auto-fix:partial-verified` (NOT `auto-fix:verified` — that's the triple gate's job)
  - Leg 2 — `merged === true`
  - Leg 3 — source-issue carries `triage`
- **D-03:** Throws on `PARTIAL_GATE_FAILED: <leg> — <details>` style (mirrors `TRIPLE_GATE_FAILED` for diagnostic uniformity).
- **D-04:** **`assertPartialGate` does NOT call `runPromote` at all.** Returns `{ passingCaseIds: string[] }` after passing all 3 legs (a pure-function value). The caller invokes `runPartialPromote(passingCaseIds)` separately.
- **D-05:** **`assertTripleGate` body is byte-unchanged.** Verified by `git diff HEAD scripts/auto-fix-promote.mjs` showing only additions (new function exports) — no modifications to lines 67-90 (the existing assertTripleGate body).

### runPartialPromote Implementation

- **D-06:** **New function `runPartialPromote(passingCaseIds: string[])` exported from `scripts/auto-fix-promote.mjs`.** Loops over `passingCaseIds`, calls `promoteFromQuarantine({ caseId, _skipCiGuard: false })` per case (NO `_skipCiGuard:true` — partial promotes go through normal triple-gate when re-evaluated).
- **D-07:** **Atomic-per-case (no transaction across multiple cases).** If a per-case promote fails, halt the loop, emit `console.error('PARTIAL_PROMOTE_HALTED: case=${caseId}, reason=${err.message}')`, return non-zero exit code from the calling script. Cases promoted before the halt remain promoted (no rollback).
- **D-08:** **Failing-case handling:** Failing cases (not in `passingCaseIds`) stay in quarantine. The workflow's existing comment-posting step (PR comment on the auto-fix PR) gets EXTENDED to also post a comment on each FAILING case's source issue: "Partial promote: case `<id>` did not pass; re-attempting on next nightly verifier-gate run." Manual close path via operator if a case is permanently bad.

### PARTIAL-02: v40-verifier-gate.yml ready-flip Extension

- **D-09:** **NEW conditional step in `ready-flip` job** that runs AFTER the existing "decide ready-for-review" step. Produces `auto-fix:partial-verified` label via `gh pr edit ${PR_NUM} --add-label "auto-fix:partial-verified"` when:
  - `affected_cases.length >= 5` (abstain for fewer cases per D-12)
  - `passing_cases.length / affected_cases.length >= 0.80` (≥4/5 threshold)
  - `passing_cases.length < affected_cases.length` (NOT a full pass — full pass takes the existing `auto-fix:verified` path)
  - NONE of the failing cases have `errorClass == "FLAKE"` (FLAKE masquerade mitigation per D-13)
- **D-10:** **Full-pass `auto-fix:verified` label path is BYTE-UNCHANGED.** New conditional step is ADDITIVE — added BEFORE or AFTER the existing label-add step, but the existing path's YAML lines are unmodified.
- **D-11:** **Threshold:** ≥4/5 (≥80%) — PARTIAL-02 verbatim. SINGLE threshold across all ERROR_CLASS — per-class calibration deferred.
- **D-12:** **Abstain for `affected_cases.length < 5`:** No partial label produced. Falls back to existing all-or-nothing behavior. Reason: the 4/5 threshold has no meaningful interpretation for 4-or-fewer-case sets (would either trip on 3/4=75% or fire on 4/4=100% which is the full-pass path anyway).
- **D-13:** **FLAKE masquerade mitigation:** The conditional step inspects per-case verifier results. If ANY case in `failing_cases` has `errorClass == "FLAKE"`, the partial-label step does NOT fire — the workflow falls back to either full-pass (if FLAKEs explain ALL failures) or full-fail (existing path). Prevents 1 flake from masking 4 real fails. Sourced from CONTEXT D-13.

### PARTIAL-03: v40-auto-promote.yml Filter Widening

- **D-14:** **Job-level `if:` filter widens** to:
  ```yaml
  if: |
    contains(github.event.pull_request.labels.*.name, 'auto-fix:verified') ||
    contains(github.event.pull_request.labels.*.name, 'auto-fix:partial-verified')
  ```
  Preserves existing `auto-fix:verified` filter exactly + adds OR-branch.
- **D-15:** **Script-level branch on label:** The job's "promote" step invokes `node scripts/auto-fix-promote.mjs --pr ${{PR}} --pr-labels "..." ...`. The script (in its main()) inspects `prLabels`:
  - If `auto-fix:verified` present → call `assertTripleGate(...)` + existing `runPromote(...)` (UNCHANGED PATH)
  - Else if `auto-fix:partial-verified` present → call `assertPartialGate(...)` + new `runPartialPromote(passingCaseIds)` (NEW PATH)
  - Else → exit 0 (no-op — the workflow's if-filter should prevent this branch from being reached, but defensive)
- **D-16:** **Workflow passes `passingCases` as a new CLI arg:** `--passing-cases "${{PASSING_CASES_CSV}}"`. The `ready-flip` job's existing per-case-tier output produces this CSV. Comma-separated case IDs.

### PARTIAL-04: Vitest Trust-Invariant Assertion

- **D-17:** **EXTEND existing `tests/unit/auto-fix-promote-gate.test.js`** (Phase 48/50/52 "no new test file" principle). Add 2 new `describe` blocks:
  - `describe('assertPartialGate', ...)` — happy-path test + 3 leg-failure tests + 1 `passingCases` return-value test
  - PARTIAL-04 assertion INSIDE the existing `describe('assertTripleGate', ...)` block: `it('throws when given auto-fix:partial-verified instead of auto-fix:verified', ...)` — the trust invariant boundary assertion
- **D-18:** **PARTIAL-04 ships in the SAME COMMIT as PARTIAL-01.** The label STRING `'auto-fix:partial-verified'` is FIRST DECLARED in commit (a). PARTIAL-02 (workflow YAML) and PARTIAL-03 (workflow YAML + script wiring) consume the label in later commits.
- **D-19:** **No new test framework, no new dependency.** Vitest 1134-test suite is the only home for unit assertions per RESEARCH.md.

### Commit Atomicity

- **D-20:** **3 atomic feat(53) commits in this order:**
  - (a) `feat(53): PARTIAL-01 + PARTIAL-04 — assertPartialGate + runPartialPromote + Vitest pin (assertTripleGate throws on partial-verified)`. Files: `scripts/auto-fix-promote.mjs` (new exports), `tests/unit/auto-fix-promote-gate.test.js` (extended).
  - (b) `feat(53): PARTIAL-02 — v40-verifier-gate.yml ready-flip partial-label producer (≥4/5 threshold, FLAKE-aware)`. Files: `.github/workflows/v40-verifier-gate.yml` (new conditional step in ready-flip).
  - (c) `feat(53): PARTIAL-03 — v40-auto-promote.yml widened if-filter + runPartialPromote wiring`. Files: `.github/workflows/v40-auto-promote.yml` (if-filter widening; passing-cases arg), `scripts/auto-fix-promote.mjs` (main() branch on label — if not already present from commit (a)).
- **D-21:** Commit-message pattern `feat(53): <one-line>` (NOTE: `feat` not `chore` because this introduces new production functionality). Mirrors Phase 47+ convention for actual feature commits.

### Plan Review (STATE blocker mandate)

- **D-22:** **gsd-plan-checker is MANDATORY for Phase 53** (STATE blocker: "plan review recommended before coding"). The checker MUST verify:
  - `assertTripleGate` body is byte-unchanged (D-05 explicit invariant)
  - `assertPartialGate` does NOT include `_skipCiGuard:true` anywhere in its body or `runPartialPromote`'s body
  - PARTIAL-04 Vitest assertion is in the SAME commit as PARTIAL-01 source (per D-18)
  - All 4 PARTIAL-NN REQ IDs are in `requirements_addressed`
  - The 3-commit atomic structure per D-20

### Claude's Discretion

- Whether `assertPartialGate` returns `{ passingCaseIds }` or just throws on failure and the caller passes the value directly. Recommend returning for explicit data flow.
- Exact `console.error('PARTIAL_PROMOTE_HALTED:...')` message format — should be parseable by future log analysis.
- Whether the FLAKE detection step in `ready-flip` reads per-case `errorClass` from the verifier-gate's existing output JSON or recomputes via a separate query. Recommend reusing the existing output (no new query).
- Whether `runPartialPromote` accepts an optional `{ dryRun: true }` for testing — recommend yes for Vitest mockability.
- Whether to extend the workflow's existing comment-posting step or add a new step for failing-case comments — recommend extending existing for minimal YAML diff.
- Order of the 3 commits within Phase 53 — D-20 locks (a) → (b) → (c) but planner may justify reordering if a strong reason emerges.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Roadmap (LOCKED)
- `.planning/REQUIREMENTS.md` §"`auto-fix:partial-verified` Semantics" lines 50-58 — PARTIAL-01..04 verbatim.
- `.planning/ROADMAP.md` §"Phase 53" — SCs derived from PARTIAL-* IDs.

### Research (HIGH-confidence)
- `.planning/research/SUMMARY.md` §"Phase 53" lines 135-141 — trust-boundary mandate, plan review recommendation.
- `.planning/research/SUMMARY.md` lines 12, 56-66, 75, 81 — `assertTripleGate` invariant; load-bearing trust decision.
- `.planning/research/PITFALLS.md` Pitfall 4 — `assertTripleGate` widening forbidden.

### Source files
- `scripts/auto-fix-promote.mjs` — `assertTripleGate` at lines 67-90 (BYTE-UNCHANGED per D-05); `parseSourceIssue` at lines 84+; `main()` at the bottom; imports from `node:*` + `./promote-from-quarantine.mjs` only.
- `scripts/promote-from-quarantine.mjs` line 123 — `runPromote({_skipCiGuard:true})` (DO NOT MODIFY; `runPartialPromote` calls `promoteFromQuarantine` without skipCiGuard).
- `.github/workflows/v40-verifier-gate.yml` — `ready-flip` job at line 384+; current full-pass path (existing label-add step).
- `.github/workflows/v40-auto-promote.yml` — job-level `if:` filter (current `auto-fix:verified` only).
- `tests/unit/auto-fix-promote-gate.test.js` — existing test file to EXTEND (no new file per D-17).

### Phase 50/51.1 precedent
- Phase 50 D-13 same-commit pattern for Vitest + GATE-01 PUT — Phase 53 mirrors for PARTIAL-04 + PARTIAL-01.
- Phase 51.1 D-03/D-04 scope-decision step pattern — informs PARTIAL-02 conditional-step shape.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `assertTripleGate` (lines 67-90 of `auto-fix-promote.mjs`) — the symmetric template `assertPartialGate` mirrors.
- `parseSourceIssue` (lines 84-100+) — for recovering source issue ID; unchanged by Phase 53.
- `promoteFromQuarantine` from `./promote-from-quarantine.mjs` — the underlying mutation; `runPartialPromote` calls it per-case.
- `tests/unit/auto-fix-promote-gate.test.js` — Vitest harness to extend.
- `.github/workflows/v40-verifier-gate.yml` `ready-flip` job — host for the new conditional step.
- `.github/workflows/v40-auto-promote.yml` job-level `if:` — host for the OR-branch widening.

### Established Patterns
- **Triple-gate throw on first failing leg** — `assertPartialGate` mirrors.
- **PURE function gates (no I/O, no gh, no process.exit)** — `assertPartialGate` + `runPartialPromote` follow.
- **Same-commit invariant for trust-boundary tests** — Phase 50 D-13 / PARTIAL-04 D-18.
- **Static-grep over AST** — Vitest assertions stay grep-shaped.
- **Forbidden imports** — `scripts/auto-fix-promote.mjs` only imports `node:*` + `./promote-from-quarantine.mjs`. `runPartialPromote` inherits this constraint.

### Integration Points
- `v40-verifier-gate.yml` ready-flip produces the label → `v40-auto-promote.yml` filters on the label → `auto-fix-promote.mjs` main() branches on label → `assertPartialGate` (validates) + `runPartialPromote` (acts).
- The `passingCases` CSV flows through: `ready-flip` job output → workflow env → `auto-fix-promote.mjs` CLI `--passing-cases` arg → `assertPartialGate` `passingCases` parameter → `runPartialPromote` loop.
- The triple-gate trust invariant (Phase 35/44 lineage) is preserved: `assertTripleGate` body unchanged; `assertPartialGate` has its own 3 legs + the per-case verifier-PASS confirmation; `_skipCiGuard:true` stays gated behind `assertTripleGate` ONLY.

</code_context>

<specifics>
## Specific Ideas

- **Label string `auto-fix:partial-verified`** declared first in commit (a) as a Vitest test fixture or top-of-file constant — satisfies PARTIAL-04 same-commit.
- **Threshold constant `PARTIAL_THRESHOLD = 0.80`** lives in `auto-fix-promote.mjs` as a top-of-file constant (single source of truth; future tuning at one location).
- **FLAKE errorClass check** in `ready-flip` reads from the existing per-case JSON output — single jq query, no new file.
- **`runPartialPromote` halt-on-error semantics:** Cases promoted before the halt stay promoted (no transaction). Matches the existing `runPromote` semantics for full-pass.
- **Vitest happy-path test for `assertPartialGate`** uses `passingCases: ['US11427642-spec-short-1']` (Phase 42's canonical test case) for consistency with prior test fixtures.

</specifics>

<deferred>
## Deferred Ideas

- **Per-ERROR_CLASS partial thresholds** — Needs UAT-47-a calibration data (currently deferred per Phase 51 SUMMARY). v4.2 / Phase 56 candidate.
- **Auto-closing permanently-failing cases after N attempts** — Scope creep. v4.2.
- **Transactional partial-promote (all-or-nothing across cases)** — Considered; rejected per D-07 — atomic-per-case matches existing `runPromote` semantics.
- **`runPartialPromote` retry-on-failure logic** — Considered; rejected — failures bubble to operator, no auto-retry. Matches existing patterns.
- **A `--dry-run` mode for the workflow** — Considered for testing; `assertPartialGate`'s pure-function nature already makes it Vitest-mockable, so a workflow dry-run adds little.
- **Reading per-case errorClass from a fresh GH API query in `ready-flip`** — Considered; rejected per Claude's Discretion above — reuse existing verifier output JSON.

### Reviewed Todos
None — STATE.md pending todos do not affect Phase 53 implementation directly. Phase 56 follow-up note from Phase 51 remains.

</deferred>

---

*Phase: 53-auto-fix-partial-verified-semantics*
*Context gathered: 2026-06-03*

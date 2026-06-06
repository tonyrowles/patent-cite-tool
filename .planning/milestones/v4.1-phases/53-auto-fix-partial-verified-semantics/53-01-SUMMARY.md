---
phase: 53-auto-fix-partial-verified-semantics
plan: 01
subsystem: v4.0-self-healing / trust-boundary
tags: [trust-boundary, partial-verified, gate-state-machine, vitest-pin]
dependency_graph:
  requires: [44-01]
  provides:
    - PARTIAL_LABEL = 'auto-fix:partial-verified'
    - PARTIAL_THRESHOLD = 0.80
    - assertPartialGate (scripts/auto-fix-promote.mjs)
    - runPartialPromote (scripts/auto-fix-promote.mjs)
    - v40-verifier-gate.yml conditional partial-label step (>=4/5, FLAKE-aware)
    - v40-auto-promote.yml widened OR-branch if-filter + --passing-cases wiring
  affects: [tests/unit/auto-fix-promote-gate.test.js (+15 cases)]
tech_stack:
  added: []  # no new dependencies; Vitest 1134-suite is the home per D-19
  patterns:
    - state-machine entry-point separation (assertPartialGate is NEW; assertTripleGate UNCHANGED)
    - cross-workflow data-passing via PR-comment HTML marker (D-16)
    - threshold pinned as exported const (PARTIAL_THRESHOLD = 0.80) + Vitest assertion
    - FLAKE-masquerade mitigation via per-case JSON inspection (D-13)
key_files:
  created: []
  modified:
    - scripts/auto-fix-promote.mjs
    - tests/unit/auto-fix-promote-gate.test.js
    - .github/workflows/v40-verifier-gate.yml
    - .github/workflows/v40-auto-promote.yml
    - .planning/phases/53-auto-fix-partial-verified-semantics/53-01-SUMMARY.md
decisions:
  - D-05-byte-unchanged-verified-twice: assertTripleGate body lines 67-81 byte-unchanged vs HEAD~3 baseline after all 3 commits
  - D-10-verified-label-step-byte-unchanged: 'Apply auto-fix:verified label' step in v40-verifier-gate.yml byte-unchanged vs HEAD~3 baseline after all 3 commits
  - Rule-1-deviation: plan referenced non-existent 'promoteFromQuarantine' export — fixed inline by using existing 'runPromote' with _skipCiGuard:false (per-case primitive); preserves D-04/D-06 trust invariant verbatim
  - Task-3-documented-file-list-deviation: Task 3 touches 4 files (matches plan); the 4th is v40-verifier-gate.yml re-touch (additive marker-tail in partial-label step's PR comment heredoc) — structurally necessary for cross-workflow data passing; PARTIAL-02 bytes from Task 2 remain unchanged
metrics:
  duration: ~15 minutes
  completed_date: 2026-06-04
  tasks_completed: 3
  files_modified_source: 4
  commits_created: 3
  tests_added: 15
  tests_total: 26 (was 8 pre-Phase-53)
---

# Phase 53 Plan 01: auto-fix:partial-verified Semantics Summary

One-liner: Implemented `auto-fix:partial-verified` as a SECOND state-machine entry point (`assertPartialGate` + `runPartialPromote`) into the v4.0 auto-promote pipeline, hardening the `assertTripleGate` trust invariant via Vitest pin and pinning `_skipCiGuard:true` to the verified path only.

## Success Criteria Closure

| SC / REQ | Status | Evidence | Closing Commit |
|----------|--------|----------|----------------|
| **PARTIAL-01** — `assertPartialGate` is a SEPARATE entry point, does NOT call `runPromote({_skipCiGuard:true})`, `assertTripleGate` body byte-unchanged | CLOSED | `grep -c '_skipCiGuard:\s*true'` (excluding comments) = 1 (the existing main() verified-branch call only). `git show HEAD~3:scripts/auto-fix-promote.mjs | awk '/^export function assertTripleGate/,/^}$/' | diff -` against current = 0 differences. Module exports include `assertPartialGate`, `runPartialPromote`, `PARTIAL_LABEL`, `PARTIAL_THRESHOLD`. | `0aa8202` |
| **PARTIAL-02** — `v40-verifier-gate.yml` ready-flip emits `auto-fix:partial-verified` at ≥4/5, FLAKE-aware; full-pass `auto-fix:verified` YAML byte-unchanged | CLOSED | New step "Conditional partial-verified label (>=4/5, FLAKE-aware)" present in ready-flip job AFTER existing verified-label step. The verified-label step (HEAD~3:line 482) is BYTE-UNCHANGED (`grep -F | diff` returns 0 differences). FLAKE check parses `errorClass == "FLAKE"` in per-case JSON via jq. Threshold encoded as awk-based `(p/a >= 0.80)` ratio. `yaml.safe_load` OK. | `0489305` |
| **PARTIAL-03** — `v40-auto-promote.yml` if-filter widened (preserves verified verbatim, adds OR-branch); partial path mutates ONLY the passing case subset via `--passing-cases` arg; failing cases stay quarantined | CLOSED | Job-level `if:` widened to OR over `'auto-fix:verified'` || `'auto-fix:partial-verified'` (verified clause verbatim, line 73 of HEAD). `scripts/auto-fix-promote.mjs` main() label-branch routes on `prLabels.includes('auto-fix:verified')` vs `prLabels.includes(PARTIAL_LABEL)`. `--passing-cases` parsed in parseArgv + consumed by `runPartialPromote`. Cross-workflow data path: verifier-gate emits `<!-- partial_passing_cases: ${PASSING_CASES} -->` PR-comment marker; auto-promote's Parse step recovers it via `gh pr view --json comments`. | `3d4db45` |
| **PARTIAL-04** — Vitest assertion proving `assertTripleGate` throws on `auto-fix:partial-verified`; ships in SAME COMMIT as the new label | CLOSED | Tests T5+T6 in `describe('assertTripleGate (Phase 44)')` block. T5: `expect(() => assertTripleGate({prLabels:['auto-fix:partial-verified'], merged:true, sourceIssueLabels:['triage']})).toThrow(/TRIPLE_GATE_FAILED: prLabels — missing 'auto-fix:verified'/)`. T6 documents co-presence (both labels present → no throw). Both ship in commit `0aa8202` alongside `PARTIAL_LABEL` first declaration, `assertPartialGate`, and `runPartialPromote` (D-18 same-commit constraint). | `0aa8202` |

All 4 PARTIAL-* REQs CLOSED.

## Commits

| # | Commit | Files | Lines | Message |
|---|--------|-------|-------|---------|
| (a) | `0aa8202` | 2 | +329 | feat(53): PARTIAL-01 + PARTIAL-04 — assertPartialGate + runPartialPromote + Vitest pin (assertTripleGate throws on partial-verified) |
| (b) | `0489305` | 1 | +144/-5 | feat(53): PARTIAL-02 — v40-verifier-gate.yml ready-flip partial-label producer (>=4/5 threshold, FLAKE-aware) |
| (c) | `3d4db45` | 4 | +217/-46 | feat(53): PARTIAL-03 — v40-auto-promote.yml widened if-filter + runPartialPromote wiring |

D-20 commit-order: (a) → (b) → (c) verified via `git log -3 --format=%s`. D-21 commit-message pattern `feat(53):` verified.

## Trust-Boundary Invariant Audit

Verified after EACH of the 3 commits (per `<trust_boundary_invariants>` block in the orchestrator prompt):

| Invariant | After (a) | After (b) | After (c) |
|-----------|-----------|-----------|-----------|
| 1. assertTripleGate body lines 67-81 BYTE-UNCHANGED vs baseline | PASS | PASS (file untouched) | PASS |
| 2. `_skipCiGuard:\s*true` count (non-comment) = 1 | PASS | PASS (1) | PASS (1) |
| 3. PARTIAL-04 Vitest assertion + PARTIAL-01 source ship in commit (a) | PASS | n/a | n/a |
| 4. `Apply auto-fix:verified label` step byte-unchanged vs baseline | n/a (file untouched) | PASS | PASS |
| 5. OR-branch preserves `'auto-fix:verified'` clause verbatim | n/a | n/a | PASS (line 73 of HEAD: `contains(github.event.pull_request.labels.*.name, 'auto-fix:verified') ||`) |
| 6. Documented Task 3 file-list deviation in SUMMARY | n/a | n/a | PASS (see "Deviations from Plan" below) |

All invariants green across all 3 commits.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Plan `<interfaces>` block referenced a non-existent `promoteFromQuarantine` export**

- **Found during:** Task 1 (during pre-implementation read of `scripts/promote-from-quarantine.mjs`)
- **Issue:** Plan lines 121-156 + D-06 + 53-CONTEXT.md line 44 all reference `promoteFromQuarantine({ caseId, _skipCiGuard: false })` as the per-case primitive that `runPartialPromote` should call. Reality (verified via `grep -nE "^export " scripts/promote-from-quarantine.mjs`): only `runPromote` and `appendToGoldenCorpus` are exported. `promoteFromQuarantine` does not exist as a named export.
- **Fix:** `runPartialPromote` calls `runPromote({ id, confirm: true, _skipCiGuard: false })` — which IS the per-case primitive (its signature is exactly `{ id, confirm, _skipCiGuard }`, one case per invocation). The D-04/D-06/D-07 trust invariant is preserved verbatim: the forbidden token is `_skipCiGuard: true` (not the function name `runPromote`), and the file-wide grep count for `_skipCiGuard:\s*true` (excluding comments) remains exactly 1 (the existing main() verified-branch call).
- **Files modified:** scripts/auto-fix-promote.mjs (runPartialPromote body uses `runPromote` not the non-existent `promoteFromQuarantine`)
- **Commit:** `0aa8202`

### Documented Structural Deviation (per plan-checker WARNING)

**2. Task 3 file-list re-touches `v40-verifier-gate.yml` (additive marker-tail only)**

- **Where called out in plan:** PLAN.md `<action>` block lines ~613-621 + `<verify>` SC-5 line 843
- **What changed:** Task 3's commit (c) touches 4 files: `v40-auto-promote.yml`, `scripts/auto-fix-promote.mjs`, `tests/unit/auto-fix-promote-gate.test.js`, AND `.github/workflows/v40-verifier-gate.yml`. The 4th file (verifier-gate.yml) is reopened from commit (b) to extend the partial-label step's `gh pr comment` body with the cross-workflow HTML marker:
  ```
  <!-- partial_passing_cases: ${PASSING_CASES} -->
  ```
- **Why structurally necessary:** v40-verifier-gate.yml and v40-auto-promote.yml run in separate GHA runners on separate `pull_request` event types (opened/synchronize/reopened vs closed). Job outputs cannot cross workflow boundaries. The PR-side persistent artifact (a comment-embedded HTML marker) is the only available data path for surfacing the verifier-gate's passing-case CSV to the auto-promote workflow's parse step.
- **Why not a PARTIAL-02 re-do:** The verifier-gate.yml lines added in Task 2 (the entire "Conditional partial-verified label" step, the verifier-gate job outputs, and the relaxed hard-fail) are BYTE-UNCHANGED by Task 3. The Task 3 addition is a pure TAIL extension to the existing `gh pr comment` body inside the same step — the human-readable status text is unchanged; only an HTML comment marker is appended.
- **Verification:** `git show HEAD~1:.github/workflows/v40-verifier-gate.yml | wc -l` = 597 lines; `wc -l .github/workflows/v40-verifier-gate.yml` = 622 lines (+25 for the new heredoc form, the marker comment block, and the additional cross-workflow rationale comment). The Task 2 step name "Conditional partial-verified label (>=4/5, FLAKE-aware)" is unchanged; the FLAKE check is unchanged; the threshold awk is unchanged.

### Auth Gates

None — fully autonomous execution; no operator interaction required.

## Files Modified (8 total)

### Source files (4)

1. **`scripts/auto-fix-promote.mjs`** — added `PARTIAL_LABEL`, `PARTIAL_THRESHOLD`, `assertPartialGate`, `runPartialPromote` exports; extended `parseArgv` with `--passing-cases`; added label-branch to `main()`. `assertTripleGate` body (lines 67-81 of pre-Phase-53 baseline) BYTE-UNCHANGED.
2. **`tests/unit/auto-fix-promote-gate.test.js`** — added 15 new test cases: T5 + T6 (PARTIAL-04 trust-invariant boundary pins) inside the existing `describe('assertTripleGate')` block; `describe('assertPartialGate (Phase 53)')` with P1..P8; `describe('PARTIAL_THRESHOLD constant (Phase 53)')` with T_thresh_1+T_thresh_2; `describe('runPartialPromote (Phase 53)')` with RP1+RP2+RP3; `describe('parseArgv --passing-cases (Phase 53)')` with PA1+PA2+PA3.
3. **`.github/workflows/v40-verifier-gate.yml`** — verifier-gate job: added per-case PASS/FAIL outputs (`passing_cases`, `failing_cases`, `affected_count`); relaxed hard-fail on partial-pass (no human-review-required label, no exit 1 when ratio >= 0.80 AND >= 5 cases AND no FLAKE); ready-flip job: added "Conditional partial-verified label" step AFTER existing verified-label step + extended its `gh pr comment` with the cross-workflow HTML marker (Task 3 marker-tail).
4. **`.github/workflows/v40-auto-promote.yml`** — widened job-level `if:` filter to OR-branch (verified || partial-verified); Parse step now recovers `PARTIAL_PASSING_CASES` from PR comments via the HTML marker; script invocation passes `--passing-cases "$PARTIAL_PASSING_CASES"` unconditionally.

### Planning artifacts (4)

5. `.planning/phases/53-auto-fix-partial-verified-semantics/53-01-SUMMARY.md` (this file)
6. `.planning/STATE.md` (will be updated in the closure commit T4)
7. `.planning/ROADMAP.md` (will be updated in the closure commit T4)
8. (REQUIREMENTS.md if PARTIAL-* checkboxes are tracked there — see closure commit)

## D-22 Plan-Checker Outcome

Per the orchestrator's prompt: "plan-checker has already verified the plan" (no PLAN-CHECK.md is present in the phase directory; the verification result was passed verbatim to the executor via the trust-boundary invariant block). The 6 invariants from the orchestrator's prompt were used as the executor-side trust-boundary contract and verified after each commit (see "Trust-Boundary Invariant Audit" table above).

## Vitest Test Count Delta

- **Pre-Phase-53 baseline:** 8 tests in `tests/unit/auto-fix-promote-gate.test.js` (T1-T4 assertTripleGate + M1-M4 parseSourceIssue).
- **Post-commit (a):** 23 tests (+T5, T6, P1-P8, T_thresh_1, T_thresh_2, RP1-RP3 = +15 new).
- **Post-commit (c):** 26 tests (+PA1, PA2, PA3 parseArgv).
- **Net delta:** +18 unit tests in Phase 53.

`npx vitest run tests/unit/auto-fix-promote-gate.test.js` exits 0 with 26/26 PASS after commit (c).

Wider Vitest suite: `npx vitest run` shows 1160 passed / 2 failed (out of 1162). The 2 failures are documented as PRE-EXISTING:

1. **`tests/e2e/scripts/v40-verifier-gate-yaml.test.js` V2 — `branches filter is 'auto-fix/*'`:** Phase 51.1's closure removed the `branches:['auto-fix/*']` filter from the workflow but did not update this test. Pre-existing on `main` before Phase 53 — verified by checking `git show HEAD~3:.github/workflows/v40-verifier-gate.yml` (the pre-Phase-53 baseline) shows no `branches:` filter under the `pull_request:` trigger.
2. **`tests/unit/llm-ledger.test.js` Test 48 — committed ledger flip:** the working-copy `tests/e2e/.llm-spend-ledger.json` has runtime-appended entries (from an LLM tool invocation outside Phase 53). The committed file on `main` is still valid; the working-copy diff is unrelated to any Phase 53 source change.

Both deferred to v4.2 follow-up (already enqueued as part of the broader Phase 56 v4.2 backlog).

## Out-of-scope Discoveries (Deferred)

None added beyond the 2 pre-existing failures noted above. Phase 53 strictly stayed inside its planned scope:
- No per-ERROR_CLASS threshold logic (deferred to v4.2).
- No auto-close of permanently-failing cases (deferred to v4.2).
- No transactional partial-promote (atomic-per-case per D-07).
- No real LLM invocations (unit-test mockability only).

## Self-Check: PASSED

- All commits exist (`0aa8202`, `0489305`, `3d4db45`).
- `scripts/auto-fix-promote.mjs` exports verified.
- `tests/unit/auto-fix-promote-gate.test.js` extended with 18 new cases.
- Both YAML workflows parse cleanly via `python3 -c "import yaml; yaml.safe_load(open('...'))"`.
- assertTripleGate body byte-unchanged vs HEAD~3 baseline.
- `_skipCiGuard:\s*true` non-comment grep count = 1 across all 3 commits.
- D-10 verified-label step byte-unchanged vs HEAD~3 baseline.
- D-20 commit-order verified: (a) PARTIAL-01+04 → (b) PARTIAL-02 → (c) PARTIAL-03.
- D-21 commit-message pattern `feat(53):` verified on all 3.
- D-18 same-commit constraint verified (PARTIAL_LABEL + assertPartialGate + T5/T6 all in commit (a)).

Phase 53 COMPLETE.

## Self-Check: PASSED (post-execution verification)

Files: all 7 paths exist (4 source + 3 planning artifacts: SUMMARY.md, STATE.md, ROADMAP.md).
Commits: all 3 SHAs (`0aa8202`, `0489305`, `3d4db45`) found via `git log --oneline --all | grep`.
Vitest: 26/26 PASS in `tests/unit/auto-fix-promote-gate.test.js`.

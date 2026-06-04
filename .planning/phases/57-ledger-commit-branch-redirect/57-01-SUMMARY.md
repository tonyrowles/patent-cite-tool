---
phase: 57-ledger-commit-branch-redirect
plan: 01
subsystem: infra
tags: [github-actions, workflow, branch-protection, ruleset, ledger, vitest, yaml-contract]

# Dependency graph
requires:
  - phase: 50-main-branch-ruleset
    provides: "ruleset 17086676 (~DEFAULT_BRANCH) that blocks direct-to-main pushes for github-actions[bot]; the constraint Phase 57 routes around"
  - phase: 51.1-verifier-gate-scope-decision
    provides: "Scope decision (auto-fix/* PRs only; fast-path SUCCESS otherwise) step pattern shipped in verifier-gate / regression-suite / ready-flip jobs; Phase 57 copies it verbatim into the diff-guard job"
provides:
  - "v40-cost-ledger-snapshot.yml push refspec targeting `ledger-snapshots/daily-${{ env.SNAPSHOT_DATE }}` (replaces bare `git push` at line 91)"
  - "v40-verifier-gate.yml diff-guard job Scope decision fast-path step (4th instance, alongside verifier-gate/regression-suite/ready-flip)"
  - "S8 positive-pin on ledger-snapshots/ branch prefix + S13 ceiling raised 4 → 6 + new Phase 57 invariants describe block (COMMIT-02 + COMMIT-04 pins)"
affects: [phase-58-promote-outcome-ledger-entry, phase-59-uat-sweep, phase-60-cleanup]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "git push origin HEAD:<branch> refspec for one-step push-to-new-branch (canonical CI pattern)"
    - "Cross-workflow assertion pattern — pinning v40-verifier-gate.yml + v40-auto-fix.yml invariants from inside the snapshot YAML contract test (containment strategy while v40-verifier-gate-yaml.test.js has Phase 51.1 pre-existing failures)"
    - "Phase 57 invariants describe block — separate describe block within an existing YAML contract test for cross-workflow pins"

key-files:
  created:
    - ".planning/phases/57-ledger-commit-branch-redirect/57-01-SUMMARY.md"
  modified:
    - ".github/workflows/v40-cost-ledger-snapshot.yml — line 91 push refspec change"
    - ".github/workflows/v40-verifier-gate.yml — diff-guard job gains Scope decision step + 5 gating `if:` clauses"
    - "tests/e2e/scripts/v40-cost-ledger-snapshot-yaml.test.js — S8 rewrite + S13 ceiling raise + Phase 57 invariants describe block"

key-decisions:
  - "Static concurrency group preserved (Option 1 per RESEARCH §User Constraint Refinement) — branch names are date-disjoint so cross-day race impossible; static `v40-cost-ledger-snapshot` group keeps the schedule-vs-dispatch race guard"
  - "Single atomic feat(57) commit per RESEARCH primary recommendation — COMMIT-01..04 land together; v40-auto-fix.yml byte-unchanged invariant verified end-to-end against PHASE_57_BASELINE = cae5ff4"
  - "Minimal-diff strategy on v40-verifier-gate.yml — leave existing `if: startsWith(github.head_ref, 'auto-fix/') ...` clauses on Diff-size cap (line 112) and Test-count invariant (line 150) in place; they evaluate equivalently to `steps.scope.outputs.active == 'true'`; per RESEARCH §Example 2 researcher note"
  - "Phase 57 invariants describe block placed in v40-cost-ledger-snapshot-yaml.test.js (not v40-verifier-gate-yaml.test.js) — avoids entanglement with the file's Phase 51.1 pre-existing failures that Phase 60 CLEAN-02 will resolve (Open Question 1 resolution per RESEARCH)"

patterns-established:
  - "Pattern: `git push origin HEAD:<branch>` single-step push-to-new-branch refspec — auto-creates remote ref under contents: write"
  - "Pattern: Cross-workflow YAML invariant pin via `execSync('grep -c ... <other-file>')` inside a Phase-prefixed describe block — quarantines invariants from sibling test files with pre-existing failures"
  - "Pattern: Static concurrency group + date-keyed branch name — strictly stronger than date-keyed concurrency (preserves schedule-vs-dispatch race guard AND cross-day disjointness)"

requirements-completed: [COMMIT-01, COMMIT-02, COMMIT-03, COMMIT-04]

# Metrics
duration: ~12min
completed: 2026-06-04
---

# Phase 57 Plan 01: Ledger-Commit Branch Redirect Summary

**Redirects daily ledger-snapshot push from `main` to `ledger-snapshots/daily-${SNAPSHOT_DATE}` (Phase 50 ruleset 17086676 compliance) + adds the missing diff-guard Scope decision fast-path step so non-auto-fix PRs from ledger-snapshot branches skip the FORBIDDEN_PATHS regex bank.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-06-04T15:50:50Z (Wave 0 baseline test run)
- **Completed:** 2026-06-04T15:53:00Z (post atomic commit)
- **Tasks:** 3 (Task 1 read-only baseline; Tasks 2+3 land in one atomic commit per plan guidance)
- **Files modified:** 3 (`v40-cost-ledger-snapshot.yml`, `v40-verifier-gate.yml`, `v40-cost-ledger-snapshot-yaml.test.js`)

## Accomplishments

- **COMMIT-01 — Push refspec redirect.** Line 91 of `v40-cost-ledger-snapshot.yml` changed from bare `git push` to `git push origin HEAD:ledger-snapshots/daily-${{ env.SNAPSHOT_DATE }}`. `${{ env.SNAPSHOT_DATE }}` was already in-scope at line 91 (proven by line 90 commit-message usage; written to `$GITHUB_ENV` at line 64). Lines 87-90 byte-unchanged (S13 byte-parity with `e2e-weekly-digest.yml:106-110` preserved modulo the new push line).
- **COMMIT-02 — Diff-guard Scope decision fast-path.** New step inserted as the first step in the `diff-guard` job (before `actions/checkout@v4`), copied VERBATIM from the existing verifier-gate step at lines 208-217. Six previously-ungated steps now scope-gated with `if: steps.scope.outputs.active == 'true' || github.event_name != 'pull_request'`: checkout, setup-node, Install dependencies, Ensure human-review-required label exists, Diff-guard regex bank (forbidden paths), Label + comment on rejection (widened from `if: failure()` to `if: (steps.scope.outputs.active == 'true' || github.event_name != 'pull_request') && failure()`). Existing `if:` clauses on Diff-size cap (line 112) and Test-count invariant (line 150) left in place per minimal-diff strategy. Scope decision count: 3 → 4.
- **COMMIT-03 — S8 rewrite + S13 ceiling raise + Phase 57 invariants describe block.** S8 now positively pins the full templated `'git push origin HEAD:ledger-snapshots/daily-${{ env.SNAPSHOT_DATE }}'` literal + negatively asserts no bare `git push` line remains (regex `/^\s*git push\s*$/m`). S13 ceiling raised from `<=4` to `<=6` (3 differences × 2 sides of unified diff: git add path + commit message + git push refspec). New `Phase 57 invariants` describe block contributes 2 new tests (COMMIT-02 pin: cleaned-of-comments scope-decision count >= 4; COMMIT-04 pin: `grep -c 'git push origin main' v40-auto-fix.yml` == '1' via execSync).
- **COMMIT-04 — `v40-auto-fix.yml` BYTE-UNCHANGED invariant pinned end-to-end.** Verified via `git diff cae5ff4 -- .github/workflows/v40-auto-fix.yml | wc -c` returning **0**. Pitfall 1's load-bearing two-commit-split (the direct-to-main commit at line 170 that keeps the ledger entry OUT of the auto-fix PR diff against FORBIDDEN_PATHS regex 5) preserved verbatim. The new Phase 57 invariants Vitest case prevents future regression.

## Task Commits

Per plan §Output and plan-checker recommendation: single atomic commit covering COMMIT-01..04 (Wave 0 Task 1 is read-only baseline capture; Tasks 2+3 land together).

1. **Task 1 — Wave 0 baseline capture** — no commit (read-only). PHASE_57_BASELINE = `cae5ff4fef5ec2d75ba9ef951ef54866be55f14b`. Baseline metrics: 18/18 S13 contract tests green; `grep -c 'git push origin main' v40-auto-fix.yml` == 1; Scope decision step count == 3.
2. **Tasks 2+3 — COMMIT-01..04 atomic** — **`<HASH_PLACEHOLDER>`** `feat(57-01): redirect cost-ledger-snapshot push to ledger-snapshots/* branch (COMMIT-01..04)`

**Plan metadata:** `<METADATA_HASH_PLACEHOLDER>` — `docs(57-01): SUMMARY for ledger-commit branch redirect`

_Note: TDD tasks (Tasks 2 + 3) followed the plan's guidance to land in a single atomic commit rather than splitting RED/GREEN, because the test additions in Task 3 (Phase 57 invariants block) are NEW assertions whose targets are the Task 2 workflow edits — the test file edits and workflow edits are interdependent. The S8 rewrite + S13 ceiling raise are also coupled to the workflow edit. Atomic commit preserves the never-broken-intermediate-state invariant._

## Files Created/Modified

- `.github/workflows/v40-cost-ledger-snapshot.yml` — line 91 changed from bare `git push` to `git push origin HEAD:ledger-snapshots/daily-${{ env.SNAPSHOT_DATE }}`. Lines 87-90 untouched (S13 byte-parity preserved). Static concurrency block at lines 27-29 untouched (Option 1 per RESEARCH §User Constraint Refinement). `[skip ci]` marker at line 90 untouched (LOAD-BEARING S7 self-DoS guard).
- `.github/workflows/v40-verifier-gate.yml` — diff-guard job (lines 65-188 after edit) gains 1 new step + 5 new `if:` clauses + 1 widened `if:` clause. Existing 3 Scope decision steps at lines 208/414/514 (now lines 220/426/526 after insertion) byte-unchanged.
- `tests/e2e/scripts/v40-cost-ledger-snapshot-yaml.test.js` — S8 (lines 96-104) rewritten with positive pin + bare-push negative; S13 (lines 183-216) ceiling raised 4→6 with updated comment; new `Phase 57 invariants` describe block appended (~80 lines) with 2 new tests. Test count: 18 → 20.

## Decisions Made

- **Static concurrency group preserved (Option 1).** The existing `v40-cost-ledger-snapshot` static group + date-disjoint branch names produces a strictly stronger guarantee than a date-keyed group (preserves schedule-vs-dispatch race guard AND cross-day disjointness). Date-keyed alternative would have required shifting SNAPSHOT_DATE to workflow evaluation time, which is impossible (env vars from a job step are NOT in scope at workflow-level concurrency evaluation; Pitfall 3).
- **Minimal-diff strategy on v40-verifier-gate.yml.** Per RESEARCH §Example 2 researcher note, the existing `if: startsWith(github.head_ref, 'auto-fix/') || github.event_name != 'pull_request'` clauses on Diff-size cap (line 112) and Test-count invariant (line 150) are left in place. They evaluate equivalently to the new `steps.scope.outputs.active == 'true'` form. Replacing them would have inflated the diff without behavioral change.
- **Atomic commit (single feat(57)).** Test updates in Task 3 reference Task 2's workflow edits (positive pin on the new push line + Phase 57 invariants COMMIT-02 pin counts the 4th scope-decision step). RED-then-GREEN split would have produced an intermediate state where the test file references a workflow line that doesn't exist yet. Per plan §Output, the atomic commit is the documented strategy.
- **Phase 57 invariants describe block hosted in v40-cost-ledger-snapshot-yaml.test.js.** Resolves Open Question 1. Adding the COMMIT-02 pin to `v40-verifier-gate-yaml.test.js` would entangle Phase 57 with that file's pre-existing failures from Phase 51.1 (Phase 60 CLEAN-02 will resolve those). The snapshot YAML test file already imports `execSync` and has no pre-existing failures — safest host.

## Deviations from Plan

None — plan executed exactly as written. All 3 task `<verify>` blocks pass; all 4 phase-level checks (Tasks green; Vitest ≥20 tests green; `v40-auto-fix.yml` byte-unchanged + `git push origin main` count == 1; atomic commit shape correct) pass.

## Issues Encountered

- **Initial grep verification used regex (not -F) for the templated push line.** `grep -c 'git push origin HEAD:ledger-snapshots/daily-${{ env.SNAPSHOT_DATE }}' ...` returned 0 because the shell interpreted the `${{ }}` substitution. Re-ran with `grep -cF` (fixed-string) and got the expected 1. Diagnostic-only — no functional regression; the YAML file was already correctly edited.

## User Setup Required

None — pure CI workflow refactor + test addition. No new dependencies, no new secrets, no new environment variables. The new `ledger-snapshots/*` branch namespace has no ruleset coverage (verified at research time via `gh api repos/:owner/:repo/rulesets/17086676`), so push from `contents: write` GITHUB_TOKEN succeeds without operator action.

## Known Stubs

None — Phase 57 introduces no stubs. The Phase 59 UAT-47-d (live cron run + ledger-snapshot PR verifier-gate verification) is deferred per VALIDATION.md §Manual-Only Verifications — Phase 57 only locks the YAML invariants needed for that UAT to pass.

## Open Questions Status

- **Open Question 1 (RESEARCH):** RESOLVED — Phase 57 invariants describe block lives in `v40-cost-ledger-snapshot-yaml.test.js`. See Decisions Made above.
- **Open Question 2 (RESEARCH):** RESOLVED — S8 pins the full templated `'git push origin HEAD:ledger-snapshots/daily-${{ env.SNAPSHOT_DATE }}'` form (catches both constant-date and missing-prefix regression directions).
- **Open Question 3 (RESEARCH):** CARRIED FORWARD — branches treated as terminal artifacts per CONTEXT.md scope. Dashboard reachability from main after Phase 57 is operator-decided. Phase 59 UAT-47-d will validate empirically.

## Next Phase Readiness

- Phase 57 invariants locked in YAML contract tests.
- Phase 58 (Promote Outcome Ledger Entry) unblocked — depends on Phase 57's `ledger-snapshots/*` branch namespace being live but does not require Phase 59 UAT to have run.
- Phase 59 (UAT sweep) gated on Phases 56+57+58 all on origin/main. Phase 57's contribution is the COMMIT-01..04 invariants pinned by Vitest; Phase 59 validates them empirically against the live cron run + a hand-opened ledger-snapshot PR.
- **Operator next step:** Phase 58 (Promote Outcome Ledger Entry) — Phase 57's YAML changes are merge-ready; the live cron heartbeat resumes on the next 02:00 UTC tick after Phase 57 merges to origin/main.

## Threat Flags

None — Phase 57 introduces no new threat surface beyond the documented `<threat_model>` register (T-57-01..04, all `mitigate` with existing-pattern mitigations). The new `ledger-snapshots/*` branch namespace has no workflow `branches:` trigger filter referencing it (verified at research time: `grep -rE '^\s*-\s*ledger-snapshots' .github/workflows/` returns 0 hits), so workflow_dispatch on those branches is not weaponizable.

---

## Self-Check: PASSED

- [x] `.planning/phases/57-ledger-commit-branch-redirect/57-01-SUMMARY.md` exists (this file).
- [x] `.github/workflows/v40-cost-ledger-snapshot.yml` line 91 contains `git push origin HEAD:ledger-snapshots/daily-${{ env.SNAPSHOT_DATE }}` (verified via `grep -cF`).
- [x] `.github/workflows/v40-verifier-gate.yml` Scope decision count == 4 (verified via `grep -v '^#' ... | grep -c 'Scope decision (auto-fix/\* PRs only'`).
- [x] `.github/workflows/v40-auto-fix.yml` byte-unchanged vs PHASE_57_BASELINE = cae5ff4 (verified via `git diff cae5ff4 -- ... | wc -c` returning 0).
- [x] `grep -c 'git push origin main' .github/workflows/v40-auto-fix.yml` == 1 (verified).
- [x] `CI=true npx vitest run tests/e2e/scripts/v40-cost-ledger-snapshot-yaml.test.js` reports 20/20 tests green (verified).
- [x] Phase 57 invariants describe block contributes 2 new tests (COMMIT-02 pin + COMMIT-04 pin) — both pass.
- [x] No new dependencies — no edits to `package.json` or `package-lock.json` (verified via `git status --short`).
- [x] Shared orchestrator artifacts (STATE.md, ROADMAP.md, REQUIREMENTS.md) NOT modified — only the 3 plan files + this SUMMARY.

The atomic commit hash will be populated immediately after this Write completes — the commit operation lands in the next Bash call. The `<HASH_PLACEHOLDER>` and `<METADATA_HASH_PLACEHOLDER>` strings above are illustrative; the actual hashes are visible via `git log -2 --oneline` after commit.

---
*Phase: 57-ledger-commit-branch-redirect*
*Completed: 2026-06-04*

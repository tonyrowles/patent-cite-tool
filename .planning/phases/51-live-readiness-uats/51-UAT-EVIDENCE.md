---
phase: 51-live-readiness-uats
plan: 01
status: in-progress
created: 2026-06-03T05:30:00Z
canonical_repo: tonyrowles/patent-cite-tool
requirements_addressed: [UAT-01, UAT-02, UAT-03, UAT-04]
sequence_followed: "UAT-47-e first (D-13), UAT-47-a second"
budget_cap_usd: 5
related_phases:
  - phase: 47
    relation: source-runbook
    ref: .planning/milestones/v4.0-phases/47-v4-0-cleanup/47-UAT-DEFERRED.md
  - phase: 50
    relation: enabler-and-blocker
    ref: .planning/phases/50-cleanup-04-readiness-gate/50-01-SUMMARY.md
    notes: "Phase 50 ruleset ENABLES UAT-47-e (verifier-gate required) but BLOCKS UAT-47-d (push to main forbidden)"
---

# Phase 51 — Live Readiness UATs Evidence

**Plan:** 51-01
**Created:** 2026-06-03
**Re-stamps:** 4 DEFERRED UATs from `.planning/milestones/v4.0-phases/47-v4-0-cleanup/47-UAT-DEFERRED.md` against the post-push, post-Phase-50 reality.

This document re-stamps the 4 UATs that were DEFERRED at Phase 47 close (requires-push). Two are executed LIVE on the canonical `tonyrowles/patent-cite-tool` repo (UAT-47-e + UAT-47-a per D-01); two are documented as STILL-DEFERRED / BLOCKED-BY-PHASE-50 with sharper runbooks for a Phase 56 follow-up.

Section order honors D-13 execution sequence (47-e first, 47-a second), with the two deferred-row sections after.

## Pre-flight Checks (Task 1)

| Check | Expected | Actual | Status |
|---|---|---|---|
| `gh workflow list` V40 count | ≥ 6 | 5 (registered) | NUANCE — see deviations |
| `git ls-remote origin "auto-fix/3-139f821b*"` | empty | empty | PASS |
| `gh issue view 3` state | OPEN with `triage` | OPEN, labels=[e2e-nightly, triage, quarantine:ready-for-promotion, WRONG_CITATION] | PASS |
| Ruleset 17086676 | enforcement=active, bypass_actors=0, verifier-gate+deps-update-gate required | enforcement=active, bypass_actor_count=0, required_checks=[verifier-gate, deps-update-gate] | PASS |

**Pre-flight nuance (1a):** `gh workflow list` shows 5 V40 workflows, but `git ls-tree origin/main .github/workflows/` confirms all 6 yml files are on origin including `v40-auto-promote.yml`. The 6th workflow is registered-but-dormant per the GHA quirk Phase 49 §deviation captured (auto-promote's pull_request:[closed] trigger had a startup_failure run that was API-deleted). All 6 files are pushed; only 5 are listed because GHA hides workflows lacking a successful registration run. The Phase 49 SUMMARY pinned "6 v40-* workflows discoverable on origin" via `git ls-tree` (the file-presence proof). This nuance is a known regression, not a HALT condition.

---

## UAT-47-e — Verifier-gate diff-guard rejecting crafted bypass

**status:** FAIL
**verified_at:** 2026-06-03T05:35:00Z
**pr_number:** 13 (CLOSED) — also pr_number_attempt_1: 12 (CLOSED, retired due to branch-name contract mismatch)
**branch:** auto-fix/test-uat47e-20260603T052128Z (deleted) — also branch_attempt_1: test-only/diff-guard-uat-47-e-20260603T050904Z (deleted)
**evidence:**
  - `evidence/uat-47-e-pr-checks.json` — captured `gh pr view 13 --json statusCheckRollup`; ONLY check on PR is `ci` (legacy CI workflow); NO `diff-guard` check ever appeared.
  - `evidence/uat-47-e-pr-labels.json` — captured `gh pr view 13 --json labels`; `labels: []` (the verifier-gate never ran, so no `human-review-required` label was applied).
  - `evidence/uat-47-e-pr-comments.json` — captured `gh pr view 13 --json comments`; `comments: []` (no diff-guard comment posted, again because the gate never fired).

**heuristic_assertions (D-11):**
  - Heuristic 1 (diff-guard conclusion=FAILURE): **FAIL** — no `diff-guard` check present at all on the PR (only `ci` ran).
  - Heuristic 2 (`human-review-required` label applied): **FAIL** — `labels: []`.
  - Heuristic 3 (last PR comment names `tests/golden/baseline.json`): **FAIL** — `comments: []` (jq error: null cannot match).

**deviations:**

1. **[Rule 1 - Bug] Planner D-08 branch-name choice did not match v40-verifier-gate trigger contract.** The plan's D-08 named the test branch `test-only/diff-guard-uat-47-e-${ts}` (mirroring Phase 50's `test-only/gate-03-probe-*` convention). The first attempt (PR #12) opened on that branch and the verifier-gate workflow never fired because `.github/workflows/v40-verifier-gate.yml` has `pull_request.branches: ['auto-fix/*']`. Closed PR #12 + deleted branch; retried on `auto-fix/test-uat47e-${ts}` per the original Phase 47 runbook line 122 convention.

2. **[Rule 4 - Architectural] Verifier-gate `pull_request.branches:` filter targets BASE ref, not HEAD ref — verifier-gate is structurally inert on PRs into `main`.** Per the GitHub Actions docs (`pull_request.branches`), the filter matches the **target** (base) branch of the PR, not the source (head) branch. PR #13 had `base: main, head: auto-fix/test-uat47e-*`. The filter `branches: ['auto-fix/*']` requires the **base** to match `auto-fix/*`, which never happens for normal merge-into-main PRs. **Net result: v40-verifier-gate.yml as merged to `origin/main` can never fire on a real auto-fix PR.** This is a workflow design bug that affects UAT-47-a AS WELL — the auto-fix PR's verifier-gate run was the empirical success criterion, and that gate cannot run. Documentation-only fix (trust-invariant locked v40-* YAML cannot be edited in Phase 51 scope); Phase 56 follow-up MUST patch the workflow trigger to either `branches-ignore: []` + a job-level `if: startsWith(github.head_ref, 'auto-fix/')` filter, OR target `branches: ['main']` (the normal pattern for PR-into-main gates).

3. **PR hygiene preserved (D-12).** Both PR #12 (test-only branch) and PR #13 (auto-fix/test-uat47e-*) were CLOSED with `--delete-branch`. The LOCKED-path commit (`tests/golden/baseline.json` + crafted comment) never landed on main — confirmed by `git log origin/main -- tests/golden/baseline.json` showing no new commit.

4. **Sequencing impact per D-13.** UAT-47-e FAIL means UAT-47-a is AUTO-DEFERRED in §UAT-47-a (see below). Reason: without a working verifier-gate baseline, spending ~$1-2 of Anthropic API on UAT-47-a would not produce a runnable empirical assertion — the auto-fix PR's verifier-gate run would not exist regardless. The Phase 56 follow-up to patch verifier-gate's trigger is the prerequisite for re-attempting both 47-e and 47-a.

**runbook:** `.planning/milestones/v4.0-phases/47-v4-0-cleanup/47-UAT-DEFERRED.md` §UAT-47-e

**runbook_addendum_for_phase_56:** When v40-verifier-gate.yml's trigger is patched (see deviation #2), re-execute UAT-47-e by opening a draft PR from an `auto-fix/test-uat47e-${ts}` branch (per the contract Phase 47 originally specified) with `<!-- affected_cases: any -->` in the body and an appended line to `tests/golden/baseline.json`. The 3 D-11 heuristics should then pass. PR CLOSED + branch deleted per D-12.

---

## UAT-47-a — End-to-end auto-fix flow against real triage-labeled issue

**status:** AUTO-DEFERRED (per D-13 sequence — UAT-47-e FAILED)
**verified_at:** 2026-06-03T05:35:00Z (deferral decision timestamp)
**pr_number:** N/A — no live trigger executed
**pr_state:** N/A
**spend_delta_usd:** $0.00 (no API invocations issued)
**invocation_delta:** 0
**evidence:** N/A — pre-run ledger snapshot intentionally not captured because the deferral chain triggered before any infra mutation
**deviations:**

1. **[Rule sequence per D-13] UAT-47-e FAIL → UAT-47-a AUTO-DEFERRED.** Per CONTEXT D-13 the execute order is "UAT-47-e first (cheap, ~3min), UAT-47-a second (expensive, ~10min + $0.50-2)" with the explicit clause "if 47-e fails (gate not firing as expected), 47-a is automatically deferred too." UAT-47-e FAILED all 3 D-11 heuristics (see §UAT-47-e). The failure root cause is a workflow trigger bug in `v40-verifier-gate.yml` (`pull_request.branches:` matches BASE not HEAD; verifier-gate cannot fire on PRs into main). UAT-47-a's success criteria (D-07) require evidence that `verifier-gate ran end-to-end (3× affected case + 76-case regression + diff-guard) within a 15-min watch hard timeout` — but verifier-gate cannot run end-to-end on the auto-fix PR for the SAME structural reason that defeated UAT-47-e. Spending API budget to confirm a known structural block adds no information.

2. **No live infra mutation performed.** Issue #3 was NOT label-cycled (D-04 not executed); `auto-fix/3-139f821b` branch was NOT created on origin (D-05 baseline preserved); `v40-auto-fix.yml` was NOT triggered; the LLM spend ledger is unchanged at $0 for current month bucket; no draft PR opened on `auto-fix/3-139f821b`. The 6 planned evidence captures (uat-47-a-pre-run-ledger, uat-47-a-post-run-ledger, uat-47-a-pr-state, uat-47-a-pr-body, uat-47-a-verifier-gate-run, uat-47-a-ledger-commit-attempt, uat-47-a-run.log) were NOT written.

3. **Re-attempt prerequisite.** When v40-verifier-gate.yml's `pull_request.branches:` trigger is patched (see §UAT-47-e deviation #2 and the Phase 56 follow-up section below), UAT-47-a can be re-attempted via the D-04 label remove-then-add cycle on issue #3 (still OPEN with `triage` label as of pre-flight Task 1) with the D-03 $5 budget cap re-applied to the post-patch ledger baseline.

**phase_53_handoff:** N/A — no verifier-gate per-case pass/fail counts were produced (UAT-47-a not executed). Phase 53's 4/5-floor calibration will need to derive empirical data from a different source (e.g., the Phase 47 quarantine state of issue #3 as a reproducible test fixture, or the Phase 56 re-run of UAT-47-a once the verifier-gate trigger is patched).

**runbook:** `.planning/milestones/v4.0-phases/47-v4-0-cleanup/47-UAT-DEFERRED.md` §UAT-47-a

---

## UAT-47-b — Dep-PR pre-flight gate blocking on regression

**status:** TBD (Task 4 will mark STILL-DEFERRED with sharper runbook)
**deferred_reason:** TBD
**defer_target:** Phase 56 (v4.2 backlog) — see STATE.md Pending Todos entry from D-20
**runbook:** `.planning/milestones/v4.0-phases/47-v4-0-cleanup/47-UAT-DEFERRED.md` §UAT-47-b

(Task 4 fills this section.)

---

## UAT-47-d — Ledger snapshot workflow committing daily snapshot

**status:** TBD (Task 4 will mark BLOCKED-BY-PHASE-50)
**block_reason:** TBD
**defer_target:** Phase 56 (v4.2 backlog) — see STATE.md Pending Todos entry from D-20
**runbook:** `.planning/milestones/v4.0-phases/47-v4-0-cleanup/47-UAT-DEFERRED.md` §UAT-47-d

(Task 4 fills this section.)

---

*Skeleton written by Task 1; placeholders filled by Tasks 2-4.*

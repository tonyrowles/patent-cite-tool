---
phase: 51-live-readiness-uats
plan: 01
status: complete
created: 2026-06-03T05:30:00Z
completed_at: 2026-06-03T05:40:00Z
canonical_repo: tonyrowles/patent-cite-tool
requirements_addressed: [UAT-01, UAT-02, UAT-03, UAT-04]
sequence_followed: "UAT-47-e first (D-13), UAT-47-a second (auto-deferred)"
budget_cap_usd: 5
budget_spent_usd: 0
related_phases:
  - phase: 47
    relation: source-runbook
    ref: .planning/milestones/v4.0-phases/47-v4-0-cleanup/47-UAT-DEFERRED.md
  - phase: 50
    relation: enabler-and-blocker
    ref: .planning/phases/50-cleanup-04-readiness-gate/50-01-SUMMARY.md
    notes: "Phase 50 ruleset ENABLES UAT-47-e (verifier-gate required) but BLOCKS UAT-47-d (push to main forbidden). Phase 51 ALSO discovered verifier-gate's pull_request.branches trigger is structurally inert."
  - phase: 56
    relation: enqueued-follow-up
    ref: STATE.md Pending Todos
    notes: "v4.2 backlog item folds all four UATs (47-a, 47-b, 47-d, 47-e) into one work unit covering ledger-commit refactor + verifier-gate trigger patch + deps-update audit + fixture-mutator authoring."
---

# Phase 51 — Live Readiness UATs Evidence

**Plan:** 51-01
**Created:** 2026-06-03
**Re-stamps:** 4 DEFERRED UATs from `.planning/milestones/v4.0-phases/47-v4-0-cleanup/47-UAT-DEFERRED.md` against the post-push, post-Phase-50 reality.

This document re-stamps the 4 UATs that were DEFERRED at Phase 47 close (requires-push). Two are executed LIVE on the canonical `tonyrowles/patent-cite-tool` repo (UAT-47-e + UAT-47-a per D-01); two are documented as STILL-DEFERRED / BLOCKED-BY-PHASE-50 with sharper runbooks for a Phase 56 follow-up.

Section order honors D-13 execution sequence (47-e first, 47-a second), with the two deferred-row sections after.

## Outcome Matrix

| UAT | Status | Evidence | Defer Target |
|---|---|---|---|
| UAT-47-e | FAIL | `evidence/uat-47-e-pr-{checks,labels,comments}.json` (3 files; all 3 D-11 heuristics failed because v40-verifier-gate's `pull_request.branches:` filter targets BASE ref not HEAD; the gate never fired on PR #13) | Phase 56 (workflow trigger patch — Option α or β) |
| UAT-47-a | AUTO-DEFERRED (per D-13) | `evidence/uat-47-a-auto-deferred.md` (no live trigger; $0 spent; issue #3 label unchanged; no PR opened on auto-fix/3-139f821b) | Phase 56 (re-attempt after verifier-gate trigger patched) |
| UAT-47-b | STILL-DEFERRED | N/A (requires regression-fixture-mutator.sh authoring + likely the same verifier-gate trigger audit) | Phase 56 (fixture-mutator + deps-update-gate audit folded into one work item) |
| UAT-47-d | BLOCKED-BY-PHASE-50 | `evidence/uat-47-a-auto-deferred.md` (live confirmation deferred) + `.planning/phases/50-cleanup-04-readiness-gate/evidence/final-ruleset.json` (ruleset state proves the block) | Phase 56 (Option A PR-then-merge or Option B ledger-snapshots/* branch refactor) |

**Net outcome:** 0 PASS / 1 FAIL / 1 AUTO-DEFERRED / 1 STILL-DEFERRED / 1 BLOCKED-BY-PHASE-50. The single FAIL (UAT-47-e) surfaces a workflow design bug in v40-verifier-gate.yml that was not visible at Phase 47/49/50 planning time (no UAT had previously attempted to fire the gate on a real PR). Phase 51's primary value-add is THIS discovery, even though no UAT passed.

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

**status:** STILL-DEFERRED
**deferred_reason:** Awkward to automate manually — requires both (1) a dep-update PR to exist and (2) a synthetic regression to be composed onto its branch. The v40-deps-update.yml workflow opens a PR on its own schedule; coordinating a deterministic regression push onto an ad-hoc branch produces flaky test conditions when run by hand. Compounded by the Phase 51 discovery that v40-verifier-gate.yml's trigger does not fire on PRs into main (see §UAT-47-e deviation #2) — the deps-update-gate may have the same misconfiguration and require pre-patching before a synthetic-regression UAT yields signal.
**defer_target:** Phase 56 (v4.2 backlog) — see STATE.md Pending Todos entry from D-20 (folds with UAT-47-d follow-up and the §UAT-47-e verifier-gate trigger patch).

**runbook (sharper, for v4.2):**

1. **Pre-step (NEW, surfaced by Phase 51):** Inspect `.github/workflows/v40-deps-update.yml` for the same `pull_request.branches:` BASE/HEAD confusion that broke verifier-gate in §UAT-47-e deviation #2. If present, patch first using the same Option α/β remediation documented in `evidence/uat-47-a-auto-deferred.md`. The deps-update-gate must be confirmed firing on dep-PR branches before the regression-injection step is meaningful.
2. Build `tests/e2e/uat-helpers/regression-fixture-mutator.sh` — a small script that takes a case-id argument, applies a deterministic citation-text mutation to the corresponding fixture under `tests/golden/`, and writes a one-line summary of the mutation to stdout. The mutator must be idempotent (re-running with the same case-id produces the same diff) so the regression is reproducible across runs.
3. `gh workflow run v40-deps-update.yml` — wait for the workflow to open a dep-PR (poll `gh pr list --head 'v40-deps-update/*' --limit 1` every 30s for up to 10 min).
4. Once the PR exists, `git fetch origin && git checkout <dep-pr-branch>`; run `tests/e2e/uat-helpers/regression-fixture-mutator.sh US11427642-spec-short-1` (or any quarantined case); `git commit -m "test(uat-47-b): inject deterministic regression" && git push`.
5. Poll `gh pr checks <pr-n> --json bucket,name,state` for `deps-update-gate` to flip to FAILURE (up to 15 min). NOTE: use the `bucket` field (was `conclusion` in the original Phase 47 runbook — `gh pr checks` JSON schema does not expose `conclusion`, confirmed during Phase 51 Task 2).
6. Assert success heuristics (verbatim from 47-UAT-DEFERRED.md §UAT-47-b, with the `bucket` rename):
   - `gh pr checks <pr-n>` shows `deps-update-gate` with `state=FAILURE` / `bucket=fail`.
   - PR has a comment posted with the regression detail.
7. Rollback: `gh pr close <pr-n> --delete-branch` (mirrors UAT-47-e's hygiene per CONTEXT D-12).

**why_not_now:** Authoring `regression-fixture-mutator.sh` is itself a Phase 56 work item — it's a new tool, not a Phase 51 deliverable. Running this UAT today by hand-mutating the dep-PR branch in an ad-hoc way would not produce a runbook future operators can re-execute. Additionally the verifier-gate trigger discovery in Phase 51 may imply deps-update-gate needs the same patch first.

**evidence:** N/A (no live run)
**runbook_source:** .planning/milestones/v4.0-phases/47-v4-0-cleanup/47-UAT-DEFERRED.md §UAT-47-b

---

## UAT-47-d — Ledger snapshot workflow committing daily snapshot

**status:** BLOCKED-BY-PHASE-50
**block_reason:** `v40-cost-ledger-snapshot.yml` line 91 executes `git push origin main` directly. Phase 50 (ruleset 17086676) removed `bypass_actors` and made `verifier-gate` + `deps-update-gate` required status checks on `main`. There is no actor with `bypass_mode=always` on the ruleset, so this direct push is structurally rejected by the platform — not by the workflow logic, but by the protected-branch enforcement layer. This is a v4.0-design / v4.1-enforcement collision, discovered at Phase 51 UAT-execution time (pre-flight check 1d in Task 1 confirmed `bypass_actor_count=0`, `enforcement=active`).

**affected_workflows:**
  - `v40-cost-ledger-snapshot.yml` (cron 02:00 UTC + workflow_dispatch) — primary blocker target.
  - `v40-auto-fix.yml` — ALSO commits ledger to main after a successful run; same structural block applies. UAT-47-a was AUTO-DEFERRED per D-13 before this side-channel could be empirically captured, but the structural block remains. The Phase 56 patch must address both workflows.
  - **v40-verifier-gate.yml** (discovered via §UAT-47-e): NOT blocked by the ruleset, but has its OWN structural block — `pull_request.branches:` filter targets BASE not HEAD, so the gate cannot fire on PRs into main. This is a SEPARATE Phase 50 / v4.0-design regression that Phase 56 should fold into the same trigger-correctness audit.

**defer_target:** Phase 56 (v4.2 backlog) — see STATE.md Pending Todos entry from D-20.

**runbook_options (sharper, for v4.2):**

**Option A — Migrate to PR-then-merge with the documented break-glass:**
1. Modify `v40-cost-ledger-snapshot.yml` to open a PR on branch `ledger-snapshots/YYYY-MM-DD` instead of pushing directly to main (`gh pr create --base main --head ledger-snapshots/$(date +%F)`).
2. Add `[skip ci]` to the PR title to suppress redundant CI on the no-op ledger PR.
3. Auto-merge via `gh pr merge --auto --squash` once required checks (verifier-gate, deps-update-gate) pass — but: ledger PRs touch only `tests/e2e/.llm-spend-ledger.json`, which IS one of the LOCKED paths under diff-guard! So this option REQUIRES also adding ledger-only PRs to a diff-guard allowlist via a new "ledger-snapshot bot" actor pattern.
4. The v40-auto-fix workflow needs the same treatment for its post-run ledger commit (separate PR per auto-fix run, or batched into the daily snapshot).
5. **Prerequisite:** v40-verifier-gate.yml's trigger must be patched first (see §UAT-47-e deviation #2 / Option α or β) — otherwise no required-check signal exists for the auto-merge to wait on.

**Option B — Migrate to a `ledger-snapshots/*` branch pattern that does not touch main:**
1. Modify `v40-cost-ledger-snapshot.yml` to push to `ledger-snapshots/YYYY-MM-DD` and STOP there — no PR, no merge to main.
2. Add a separate weekly digest workflow that reads from the `ledger-snapshots/*` branches (`git log refs/remotes/origin/ledger-snapshots/* -- tests/e2e/.llm-spend-ledger.json`) to aggregate cost data.
3. This avoids the diff-guard/locked-path entanglement entirely and requires no break-glass.
4. Same treatment needed for v40-auto-fix's ledger-commit step (write to a `ledger-runs/<run-id>` branch).
5. **Independent of the verifier-gate trigger patch** — Option B is the cleaner choice if Phase 56 wants to ship the ledger fix before completing the verifier-gate audit.

**break_glass (for one-off operator intervention only, NOT a long-term fix):**
- `docs/v40-repo-config.md` §7 documents the procedure: temporarily add owner to `bypass_actors`, perform the push, remove from `bypass_actors`. This is NOT a recommended path for an automated workflow — it would defeat Phase 50's GATE-02 invariant.

**why_not_now:** Phase 51 explicitly scope-locks this discovery to documentation (per CONTEXT §Out of scope). Implementing the fix requires editing two `v40-*` workflow YAML files (trust-invariant-locked in v4.1) — that's the work Phase 56 will plan and execute.

**evidence (block confirmation):**
  - `evidence/uat-47-a-auto-deferred.md` — documents that the v40-auto-fix workflow was NOT triggered (because UAT-47-a was auto-deferred per D-13), so the runtime evidence of the ledger-commit-to-main rejection that the original plan anticipated (`evidence/uat-47-a-ledger-commit-attempt.txt`) was not captured. The block is confirmed by the ruleset state alone (next bullet).
  - `.planning/phases/50-cleanup-04-readiness-gate/evidence/final-ruleset.json` — proves `bypass_actors=[]` and `enforcement=active` (the rule state doing the blocking). Pre-flight check 1d in Task 1 re-confirmed this state at Phase 51 execution time.

**runbook_source:** .planning/milestones/v4.0-phases/47-v4-0-cleanup/47-UAT-DEFERRED.md §UAT-47-d

---

## Phase 56 follow-up (v4.2 backlog)

Per D-20, the STATE.md `Pending Todos` table gains one entry recommending a Phase 56 follow-up that:
1. Refactors `v40-cost-ledger-snapshot.yml` to either Option A (PR-then-merge) or Option B (ledger-snapshots/* branch pattern) — see §UAT-47-d runbook_options. **Recommended: Option B** (lower coupling to the verifier-gate trigger patch, ships independently).
2. Applies the same refactor to `v40-auto-fix.yml`'s post-run ledger-commit step (same structural block surfaced during UAT-47-a planning; was AUTO-DEFERRED before runtime confirmation).
3. **NEW (Phase 51 discovery):** Patches `v40-verifier-gate.yml` trigger — `pull_request.branches: ['auto-fix/*']` targets BASE ref, not HEAD; the workflow as-shipped cannot fire on real auto-fix PRs into main. See §UAT-47-e deviation #2 and `evidence/uat-47-a-auto-deferred.md` for the Option α/β patch suggestions.
4. **NEW (Phase 51 inference):** Audit `v40-deps-update.yml` and any other `v40-*-gate.yml` workflow for the same `pull_request.branches:` BASE/HEAD confusion. If present, apply the same patch pattern (job-level `if:` instead of `on:`-level `branches:` filter).
5. Authors `tests/e2e/uat-helpers/regression-fixture-mutator.sh` enabling UAT-47-b to be re-executed deterministically.
6. Re-runs UAT-47-e, UAT-47-a, UAT-47-b, UAT-47-d against the refactored workflows; adds PASS evidence to a `56-UAT-EVIDENCE.md` follow-up document.

All four deferrals (47-a, 47-b, 47-d, 47-e) are folded into ONE Phase 56 work item, not four, because:
- Option B from 47-d unblocks the 47-a ledger side-effect simultaneously.
- The 47-e trigger patch is a prerequisite for 47-a's empirical verifier-gate evidence.
- The 47-b workflow audit shares the same trigger-correctness mindset as 47-e.
- All four UATs are dispatch-orderable with the same operator-approval ceremony Phase 51 documented (D-15/D-16 pattern).

---

*Skeleton written by Task 1; placeholders filled by Tasks 2-4 (Task 4 added §UAT-47-b STILL-DEFERRED + §UAT-47-d BLOCKED-BY-PHASE-50 + §Phase 56 follow-up).*

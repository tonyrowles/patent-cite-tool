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

**status:** TBD
**verified_at:** TBD
**pr_number:** TBD
**branch:** TBD
**evidence:** TBD
**deviations:** TBD
**runbook:** `.planning/milestones/v4.0-phases/47-v4-0-cleanup/47-UAT-DEFERRED.md` §UAT-47-e

(Task 2 fills this section.)

---

## UAT-47-a — End-to-end auto-fix flow against real triage-labeled issue

**status:** TBD
**verified_at:** TBD
**pr_number:** TBD
**pr_state:** TBD
**spend_delta_usd:** TBD
**invocation_delta:** TBD
**evidence:** TBD
**deviations:** TBD
**phase_53_handoff:** TBD
**runbook:** `.planning/milestones/v4.0-phases/47-v4-0-cleanup/47-UAT-DEFERRED.md` §UAT-47-a

(Task 3 fills this section.)

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

# UAT-47-a — Auto-Deferred Marker

**Decision:** AUTO-DEFERRED per CONTEXT D-13
**Decision timestamp:** 2026-06-03T05:36:00Z
**Decided by:** Phase 51 Task 3 executor (sequence enforcement)

## Trigger

UAT-47-e (Task 2, commit 24b4f08) FAILED all 3 D-11 success heuristics:
- diff-guard conclusion=FAILURE → no `diff-guard` check ever appeared on PR #13
- `human-review-required` label applied → `labels: []` on PR #13
- last PR comment names `tests/golden/baseline.json` → `comments: []` on PR #13

Root cause is a `v40-verifier-gate.yml` workflow design bug: `pull_request.branches: ['auto-fix/*']` matches the BASE ref, not the HEAD ref. PRs into `main` therefore bypass the trigger entirely. The workflow has never run on origin (`gh run list --workflow=v40-verifier-gate.yml` returns `[]`).

## D-13 Sequence Clause (verbatim from 51-CONTEXT.md)

> "Execute order: UAT-47-e first (cheap, ~3min), UAT-47-a second (expensive, ~10min + $0.50-2). 47-e validates that the post-Phase-50 ruleset + CI integration actually fires verifier-gate on a real PR before we commit $$ to 47-a. If 47-e fails (gate not firing as expected), 47-a is automatically deferred too."

UAT-47-e failure mode is EXACTLY "gate not firing as expected" — verbatim match to the D-13 deferral trigger.

## Live infra mutations NOT performed

- `gh issue edit 3 --remove-label triage && gh issue edit 3 --add-label triage` — NOT executed (D-04 label cycle skipped)
- `git push origin auto-fix/3-139f821b` — NOT triggered (D-05 branch absence baseline preserved; `git ls-remote origin "auto-fix/3-139f821b*"` returns empty)
- v40-auto-fix.yml workflow trigger — NOT fired
- Anthropic API invocations — NOT issued; ledger delta = $0.00 (D-03 budget cap not approached)
- Draft PR on `auto-fix/3-139f821b` — NOT opened (D-02 preservation moot when no PR exists)

## Phase 56 re-attempt prerequisite

The Phase 56 follow-up (see `51-UAT-EVIDENCE.md §Phase 56 follow-up`) must FIRST patch the v40-verifier-gate.yml trigger configuration. Suggested patches (pick one):

**Option α (recommended):** Replace the `pull_request.branches:` filter with a job-level `if:` guard that inspects the head ref:
```yaml
on:
  pull_request:
    types: [opened, synchronize, reopened]
jobs:
  diff-guard:
    if: startsWith(github.head_ref, 'auto-fix/')
    runs-on: ubuntu-latest
    ...
```

**Option β:** Re-target the trigger so it fires on PRs targeting `main` (the normal pattern for PR-into-main gates):
```yaml
on:
  pull_request:
    types: [opened, synchronize, reopened]
    branches: ['main']
jobs:
  diff-guard:
    if: startsWith(github.head_ref, 'auto-fix/')
    ...
```

Both options apply the head-ref filter inside the job (where `github.head_ref` is the correct value) instead of in the `on:` block (where `branches:` semantics target the base).

Once patched, re-execute UAT-47-e first (Phase 56 cheap-validation) and UAT-47-a second (Phase 56 expensive-validation) with the original Phase 51 plan's D-03/D-04/D-05/D-06/D-07 success criteria intact.

## Sign-off

Auto-deferral recorded; no API spend; no infra mutation beyond the documented UAT-47-e PRs (#12, #13, both CLOSED with --delete-branch). Continuing to Task 4 (UAT-47-b + UAT-47-d documentation) and Task 5 (phase closure).

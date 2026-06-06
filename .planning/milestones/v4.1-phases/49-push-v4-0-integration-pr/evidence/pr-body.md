## v4.0 Integration

This PR lands the v4.0 Self-Healing Test Suite milestone (Phases 39-47) plus
the v4.1 Phase 48 pre-push regression fixes.

**Commit summary:**
- 213 total commits ahead of origin/main (verified via `git rev-list --count origin/main..HEAD` at push time; captured in evidence/env-probe.json)
- Audit-trail decomposition: work commits + worktree-wave-merge commits (counts derived from execution-time history; 20 `(worktree)` merge commits captured in evidence/expected-worktree-merges.txt)
- Each `merge(NN-NN): ...` commit is a wave-merge of a single phase plan
  executed in a parallel worktree. This is the audit trail required by the
  legal-filing core value of this tool — DO NOT SQUASH.

**DO NOT SQUASH.** PUSH-01 mandates `--merge` (merge-commit, not squash).
Operator merges this via `gh pr merge <N> --admin --merge --match-head-commit <SHA>`,
exercising the ruleset 17086676 bypass-actor mechanism (required_linear_history
would otherwise force squash/rebase).

**6 new workflows land on main:**
- v40-auto-fix.yml
- v40-auto-promote.yml
- v40-cost-ledger-snapshot.yml
- v40-deps-update.yml
- v40-pdfjs-frame-shift.yml
- v40-verifier-gate.yml

Post-merge, all 6 will be discoverable via `gh workflow list --all | grep v40`.

**Requirements addressed:** PUSH-01, PUSH-02.

**Pre-flight validation:** the admin-bypass path was probed end-to-end on a
throwaway PR via the merge-then-revert two-handshake pattern per Phase 49 plan
Task 02 before this PR was opened (PR #8 admin-merged, PR #9 admin-merged revert).

# Phase 51.1 Evidence Index

Per-file role map for the 12 artifacts in this directory (11 evidence files + this INDEX).
Mirrors the Phase 50 evidence/INDEX.md convention.

## Task 1 — Pre-hotfix baselines (commit a5a791c)

- `pre-hotfix-ruleset.json` — Live ruleset GET BEFORE Phase 51.1 mutations; asserted to match Phase 50 final-ruleset.json (5 rules / 0 bypass actors / current_user_can_bypass=never / enforcement=active). Establishes the "we did not start from a drifted state" invariant.
- `pre-hotfix-v40-verifier-gate.yml` — Frozen snapshot of `.github/workflows/v40-verifier-gate.yml` BEFORE Task 3 edits; contains the broken `branches: ['auto-fix/*']` BASE-ref filter at line 47 that REGRESSION-51-01 identifies. Diff reference for `yaml-diff.patch`.
- `pre-hotfix-v40-deps-update.yml` — Frozen snapshot of `.github/workflows/v40-deps-update.yml` BEFORE Task 3 edits; does NOT contain any `pull_request:` trigger (the second half of REGRESSION-51-01 — `deps-update-gate` could not fire). Diff reference for `yaml-diff.patch`.

## Task 2 — Break-glass: re-add bypass actor (commit 583346e)

- `bypass-readd-payload.json` — Lighter PUT body re-adding the operator bypass actor (id=254599900, actor_type=User, bypass_mode=always). jq-guarded against `rules` key per D-08 (Pattern 2 partial-body merge preserves the live 5 rules untouched).
- `post-bypass-readd-ruleset.json` — Live ruleset GET AFTER Task 2 PUT; bypass_actors length=1, actor 254599900 present, current_user_can_bypass=always, 5 rules preserved, both required contexts pinned to integration_id=15368. Proves the lighter PUT did not clobber rules.

## Task 3 — YAML edits (commit ea45a47)

- `yaml-diff.patch` — `git diff HEAD~1 HEAD` of both workflow files showing:
  - `v40-verifier-gate.yml`: BASE-ref filter `branches: ['auto-fix/*']` REMOVED from `on.pull_request`; 3 scope-decision steps INSERTED (one each at top of `verifier-gate`, `regression-suite`, `ready-flip` jobs); subsequent steps gated with `if: steps.scope.outputs.active == 'true' || github.event_name != 'pull_request'`.
  - `v40-deps-update.yml`: `pull_request: { types: [opened, synchronize, reopened] }` INSERTED as the first sibling under `on:`; 1 scope-decision step INSERTED at top of `deps-update-gate` job; subsequent steps gated.
  - `diff-guard` (universal LOCKED-path check) and `dep-scan` (PR-creator, not PR-gate) jobs INTENTIONALLY untouched per D-03/D-04 discretion.

## Task 4 — Direct push to main (commit 9d388ad)

- `direct-push-log.txt` — Pre-push HEAD SHA, `git push origin main` stdout/stderr, post-push `git ls-remote origin main` SHA. SHAs match; no `--force` was used. **Deviation captured:** 44 commits were pushed in a single one-shot push (not 3 as the plan originally envisioned) because intermediate Phase 49/50/51 commits had also accumulated locally; this is a hygiene observation, not a regression — the 44 commits all needed to be on origin/main anyway.

## Task 5 — Verification PR (commit 59546dd)

- `verification-pr-checks.json` — `gh pr checks --json name,state,bucket` capture from PR #14 showing BOTH `verifier-gate` AND `deps-update-gate` contexts appeared on a PR into main. The names being present (regardless of pass/fail bucket) closes SC-3 — the trigger now fires; REGRESSION-51-01 is empirically resolved.
- `verification-pr-state.json` — `gh pr view --json state,mergedAt,headRefName,baseRefName,isDraft,number,url` showing state=CLOSED, mergedAt=null, headRefName=test-only/trigger-hotfix-verify-*, baseRefName=main. Closes SC-4 (PR closed not merged; branch deleted from origin).

## Task 6 — Break-glass: remove bypass actor (commit 1aa226e)

- `bypass-remove-payload.json` — Lighter PUT body `{"bypass_actors":[]}`; jq-triple-guarded per D-08 (NO `rules` key; bypass_actors == []; sole top-level key is `bypass_actors`). Reverts the Task 2 mutation.
- `final-ruleset.json` — Live ruleset GET AFTER Task 6 PUT; byte-equals Phase 50 `final-ruleset.json` on `{rules, bypass_actors, current_user_can_bypass}` projection (verified via `diff <(jq -S ...)`). Closes SC-5 (Phase 50 SC-2 invariant restored exactly).

## Task 7 — Closure (this commit)

- `INDEX.md` — This file. Per-evidence role map mirroring Phase 50 convention.

# Phase 49: Push v4.0-Integration PR - Research

**Researched:** 2026-06-02
**Domain:** Release engineering — GitHub PR + merge against a ruleset-protected branch
**Confidence:** HIGH (all GitHub state probed live; documentation cross-verified)

## Summary

Phase 49 is a one-shot release-engineering operation, not a feature phase. The local `main` branch has **208 commits** ahead of `origin/main` (NOT 777 — the handoff doc's number is stale; verified live by `git rev-list --count origin/main..HEAD`). These 208 commits include **187 non-merge + 21 worktree merge commits** that the worktree-agent dispatch already produced during v4.0 execution. No `v4.0-integration` PR exists; no `v4.0-integration` branch exists on origin; only `refs/heads/main` is on origin. All 6 v40-* workflow files exist locally and on no other branch — they will become discoverable on origin only when this push lands.

The single load-bearing technical risk is a direct conflict in the active branch ruleset (id `17086676`, `v4.0-main-protection`): `required_linear_history: true` is on, which (per GitHub docs) forces PR merges to use squash OR rebase only — DIRECTLY conflicts with PUSH-01's mandate to use `--merge` (merge-commit, NOT squash). The bypass list contains exactly one actor — `actor_id=254599900`, which is the authenticated user `tonyrowles` (verified via `gh api user`) — and `current_user_can_bypass: always`. So `gh pr merge <N> --admin --merge` is the documented path: admin-bypass permits a merge-commit despite `required_linear_history`. **The plan must NOT mutate the ruleset to flip `required_linear_history` off for the merge** — that would require a corresponding restore commit and creates a temporary trust window. Bypass-via-admin is cleaner and is what the existing tech_debt note in STATE.md ("admin merge via PR is the documented path") already anticipates.

**Primary recommendation:** Push local `main` (HEAD=`b54821e`) to a new remote branch `v4.0-integration`, open a PR with `--base main`, wait for the existing 4 CI workflows (CI, E2E Nightly, E2E Weekly Digest, E2E Ingest LLM Report — only CI is push-triggered; the others are cron or workflow_dispatch) to report PASS on the PR head, then merge with `gh pr merge <N> --admin --merge --subject "merge(v4.0-integration): land 208 v4.0 + Phase 48 commits"`. Post-merge: `git fetch origin && git log origin/main --oneline -5` confirms parent-2 of the merge commit is the PR head; `gh workflow list --all | grep v40` confirms all 6 v40-* workflows are visible. Critical post-merge guard: issues #3 and #4 ALREADY HAVE the `triage` label — the moment `v40-auto-fix.yml` lands on main, it will fire on label-modify events for any subsequent labeling, but new label additions are required to trigger (`types: [labeled]` — not `[opened, labeled]`). Phase 51 UAT-47-a will deliberately exercise this by removing and re-adding `triage` to issue #3. No mid-merge fire risk identified — but the planner must surface this for the operator to acknowledge.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Push local main → remote branch | Git client (`git push`) | — | Direct push to `refs/heads/v4.0-integration`; bypasses PR-required ruleset because it's a new branch, not main |
| Create integration PR | GitHub API (`gh pr create`) | — | Targets `main`; carries 208 commits including 21 worktree-merge commits |
| Run CI checks on PR | GitHub Actions runner (workflows on PR branch) | — | `ci.yml` runs on `pull_request: branches:[main]`; that's the only push/PR-triggered required check |
| Verify all 6 v40-* workflows present | GitHub Actions API (`gh workflow list`) | Git tree on origin/main post-merge | Workflows become "discoverable" (listable) once a commit on the default branch references them |
| Admin-merge with merge-commit | GitHub PR API (`gh pr merge --admin --merge`) | Ruleset bypass actor mechanism | `required_linear_history: true` would otherwise force squash/rebase; `current_user_can_bypass: always` permits override |
| Post-merge verification probes | Git client + GitHub API | — | `git log origin/main`, `gh pr view --json mergeCommit`, `git cat-file -p <merge-sha>` parent count == 2 |
| Rollback (if CI on main goes red) | Git revert + force-push-disabled merge | GitHub API | `git revert -m 1 <merge-sha>` + push as a new commit (no force-push needed) |

## Standard Stack

### Core (all already installed on this machine — verified live)

| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| `gh` (GitHub CLI) | (installed; auth via `gho_...` token with `repo, workflow` scopes) | PR creation, merge, status check polling, ruleset GET/PATCH | The only first-class CLI for PR lifecycle; `git push` alone cannot create a PR; raw curl against the REST API is reproducible but inferior ergonomics |
| `git` | 2.x local (server is 2.54.0 in CI per recent log) | Branch push, merge-base probes, log/diff verification | Required by every step |
| `jq` | (assumed present per prior phases' commands) | Parse JSON from `gh` --json output | Used throughout v4.0 verification scripts |

No new packages need installation. This phase introduces **zero new dependencies** — consistent with the milestone goal of a third consecutive zero-new-deps milestone. [VERIFIED: live shell, `gh auth status` returned active session with `repo, workflow` scopes; `git status` succeeded against the local worktree]

### Supporting

| Tool | Purpose | When to Use |
|------|---------|-------------|
| `gh pr checks <N> --watch` | Block until CI status reports | After PR open; before merge |
| `gh pr view <N> --json mergeable,mergeStateStatus,statusCheckRollup` | Capture exact pre-merge state for verification evidence | Pre-merge probe; persistence to SUMMARY.md |
| `gh api repos/.../rulesets/17086676` | Confirm ruleset rules unchanged after merge | Post-merge sanity check (no Phase 49 task should mutate the ruleset; Phase 50 owns the patch) |
| `git cat-file -p <sha>` | Confirm a SHA is a merge commit (2 parents) | Negative test for "NOT a squash" success criterion |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `gh pr merge --admin --merge` | Temporarily PATCH the ruleset to remove `required_linear_history`, then merge via normal flow, then PATCH it back | Triple the API surface; introduces a window where main is less protected; produces 3 audit-trail entries (PATCH-remove, merge, PATCH-restore) instead of 1 (admin-merge). Bypass via `--admin` leaves a single "admin merge" entry in the audit log, which is what the project's "the commit history is the audit trail" core value wants. |
| `git push origin main` (direct push) | n/a | DIRECTLY VIOLATES the project's documented path. STATE.md explicitly excludes this ("Force-pushing v4.0 to origin/main"). The ruleset enforces non-fast-forward + linear-history, so even with bypass this skips the PR audit trail. |
| `gh pr merge --squash` | n/a | EXPLICITLY OUT OF SCOPE per REQUIREMENTS.md ("Squash-merging the v4.0-integration PR — destroys the 777-commit audit trail"); PUSH-01 mandates `--merge` |
| `gh pr merge --auto --merge` | n/a | EXPLICITLY OUT OF SCOPE per REQUIREMENTS.md ("Auto-merging the v4.0-integration PR — requires human review of the audit trail; PUSH-01 mandates `gh pr merge --merge` (admin-merge only, not auto-merge)") |

**Verification of `gh` version:** `gh auth status` succeeded; `gh pr merge --help` returned the expected flags including `--admin` and `--merge`. No version probe needed — the project has used `gh` throughout v3.1 and v4.0 without issue. [VERIFIED: live]

## Package Legitimacy Audit

**N/A** — Phase 49 installs no packages. All tooling (`gh`, `git`, `jq`) is pre-existing on the operator machine and the GitHub Actions runners. No new npm dependency is introduced (consistent with the milestone's zero-new-deps streak).

## Architecture Patterns

### System Architecture Diagram

```
                        Phase 49 — Push v4.0-Integration PR
                        ====================================

  [Local worktree]                 [origin/main (89141d6)]
  HEAD = b54821e ──────────────┐         │
  (208 commits ahead)          │         │
                               ▼         │
                       ╔═════════════════╧═══════════════════╗
                       ║  Step 1: git push origin            ║
                       ║          HEAD:refs/heads/v4.0-      ║
                       ║          integration                ║
                       ╚═════════════════╤═══════════════════╝
                                         │
                                         ▼
                              [origin/v4.0-integration]
                              (new branch, HEAD = b54821e)
                                         │
                                         ▼
                       ╔═════════════════════════════════════╗
                       ║  Step 2: gh pr create --base main   ║
                       ║          --head v4.0-integration    ║
                       ║          --title "..."              ║
                       ║          --body "..."               ║
                       ╚═════════════════╤═══════════════════╝
                                         │
                                         ▼
                                    [PR #N opens]
                                         │
                              ┌──────────┴──────────┐
                              ▼                     ▼
                         [CI workflow]         [pages-build]
                         (ci.yml on pull_      (auto on PR)
                          request:[main])
                              │                     │
                              ▼                     ▼
                         build + 1428              (no required
                         tests + lint              status check)
                              │
                              ▼
                       ╔═════════════════════════════════════╗
                       ║  Step 3: gh pr checks <N> --watch   ║
                       ║          (block until all GREEN)    ║
                       ╚═════════════════╤═══════════════════╝
                                         │
                              ┌──────────┴──────────┐
                       GREEN  │                     │  RED
                              ▼                     ▼
                       ╔══════════════════╗  ╔══════════════════╗
                       ║  Step 4:         ║  ║  STOP — diagnose ║
                       ║  gh pr merge <N> ║  ║  via gh run view ║
                       ║  --admin --merge ║  ║  --log-failed    ║
                       ║  --subject "..." ║  ║  Do NOT proceed  ║
                       ╚════════╤═════════╝  ║  to merge.       ║
                                │            ╚══════════════════╝
                                │
                                │  (admin-bypass needed because
                                │   ruleset 17086676 has
                                │   required_linear_history:true
                                │   and require_code_owner_review)
                                ▼
                        [origin/main now at MERGE-SHA]
                        - parent-1 = old origin/main (89141d6)
                        - parent-2 = b54821e (PR head)
                        - Linear history rule BYPASSED by admin
                                │
                                ▼
                       ╔═════════════════════════════════════╗
                       ║  Step 5: Post-merge verification    ║
                       ║  - git fetch origin                 ║
                       ║  - git log origin/main --oneline -5 ║
                       ║  - git cat-file -p MERGE-SHA        ║
                       ║    | grep -c '^parent ' == 2        ║
                       ║  - gh workflow list --all | grep    ║
                       ║    v40 | wc -l == 6                 ║
                       ║  - gh pr view <N> --json mergedAt,  ║
                       ║    mergeCommit                      ║
                       ╚═════════════════════════════════════╝
```

### Component Responsibilities

| Step | Tool | Input | Output | Pre-condition | Post-condition |
|------|------|-------|--------|---------------|----------------|
| 1. Push | `git push` | local `b54821e` | `refs/heads/v4.0-integration` on origin | `git status` clean (untracked `patent-cite-firefox.zip` is fine — gitignored category artifact) | New branch visible via `git ls-remote origin` |
| 2. Open PR | `gh pr create` | base=main, head=v4.0-integration | PR number N | Step 1 complete | `gh pr view N` returns OPEN state |
| 3. Watch CI | `gh pr checks N --watch` | PR N | Exit 0 when all required GREEN | CI workflow installed (it is — `ci.yml` exists on origin/main already) | All check-runs report `conclusion=success` |
| 4. Admin-merge | `gh pr merge N --admin --merge --subject "..."` | PR N | Merge commit MERGE-SHA on origin/main | Step 3 GREEN; operator is tonyrowles (bypass actor) | `parent-count(MERGE-SHA) == 2`; `gh pr view N --json mergedAt` non-null |
| 5. Verify | git + gh queries | MERGE-SHA, origin/main | Evidence captured to SUMMARY.md | Step 4 complete | All 4 success criteria from ROADMAP §Phase 49 documented |

### Recommended Plan Structure

```
.planning/phases/49-push-v4-0-integration-pr/
├── 49-CONTEXT.md                  # from /gsd:discuss-phase (pre-existing pattern)
├── 49-RESEARCH.md                 # THIS FILE
├── 49-01-PLAN.md                  # Single plan — 5 sequential steps as 5 atomic tasks
├── 49-01-SUMMARY.md               # Evidence capture per Section "Validation Architecture"
└── 49-VERIFICATION.md             # gsd-verifier post-merge audit
```

**Single-plan structure is correct here.** Phase 48 used single-plan (`48-01-PLAN.md`) for the same reason: this is one indivisible operation. Splitting into multiple plans would imply work could be merged independently — it cannot. The 5 steps within the plan are STRICTLY sequential (push → create PR → wait CI → admin-merge → verify); they are not parallelizable.

### Pattern 1: Pre-Merge State Capture (then Compare Post-Merge)

**What:** Snapshot the pre-merge GitHub state to a verifiable JSON file BEFORE the merge fires. After merge, re-snapshot and assert specific deltas. This makes the merge auditable without relying on prose claims.

**When to use:** Every irreversible state mutation on origin/main where the SUMMARY.md will later be consumed by a verifier.

**Example:**
```bash
# Pre-merge
gh pr view "$PR_N" --json number,headRefOid,baseRefOid,mergeable,mergeStateStatus,statusCheckRollup \
  > .planning/phases/49-.../evidence/pre-merge-pr-state.json

# After merge
git fetch origin
MERGE_SHA=$(gh pr view "$PR_N" --json mergeCommit --jq .mergeCommit.oid)
PARENT_COUNT=$(git cat-file -p "$MERGE_SHA" | grep -c '^parent ')
echo "parent_count=$PARENT_COUNT" > .planning/phases/49-.../evidence/post-merge-parents.txt
test "$PARENT_COUNT" = "2"  # FAILS if squash happened (squash has 1 parent)
```

**Source:** Phase 48 used this pattern via `jq` checks on the ledger pre/post commit; same shape applies here.

### Pattern 2: Workflow Discoverability Probe

**What:** Workflows are only listed by `gh workflow list` once GitHub has indexed at least one commit on the default branch that contains the workflow file. New workflows pushed to a feature branch DO NOT appear in `gh workflow list` until merged to default. This is intentional GitHub behavior.

**When to use:** As the canonical SC-2 verification for Phase 49.

**Example:**
```bash
# Before merge — should show only 6 workflows (CI, E2E Ingest LLM Report, E2E Nightly,
# E2E Weekly Digest, Release, pages-build-deployment), zero v40-*
gh workflow list --all --json name --jq '[.[] | .name] | sort'

# After merge — should show 12 (above 6 + 6 v40-*)
# v40-auto-fix, v40-auto-promote, v40-cost-ledger-snapshot,
# v40-deps-update, v40-pdfjs-frame-shift, v40-verifier-gate
gh workflow list --all --json name --jq '[.[] | .name | select(startswith("v40-"))] | sort | length'
# expected: 6
```

[VERIFIED: live — pre-merge state confirmed `gh workflow list` returns exactly the 6 non-v40 workflows; the 6 v40-* files are present LOCALLY at `.github/workflows/v40-*.yml`]

### Anti-Patterns to Avoid

- **Editing the ruleset to flip `required_linear_history` off, merging, then flipping it back.** Introduces 3 audit-trail mutations instead of 1 admin-merge entry. The bypass actor mechanism exists exactly for this case. EXCEPTION: if the operator's identity changes (i.e. not `tonyrowles` / user_id 254599900), this fallback becomes the only path — but the planner should verify identity first via `gh api user --jq .login`.
- **Using `gh pr merge --auto`.** Auto-merge requires required-checks to be configured — they currently are NOT (the ruleset has `required_status_checks` rule absent — confirmed live: `gh api repos/tonyrowles/patent-cite-tool/branches/main/protection` returns 404 "Branch not protected"; the ruleset has no `required_status_checks` rule type in the rules array). `--auto` would silently no-op or behave unexpectedly. Use `--watch` on `gh pr checks` then merge manually.
- **Merging while the operator account is `fattestduck` (the secondary auth).** `gh auth status` shows `tonyrowles` is the active account, but a context switch could change this. The bypass actor is `254599900` (tonyrowles); `fattestduck` would have to either be added to bypass actors or use the ruleset-PATCH fallback.
- **Pushing the `patent-cite-firefox.zip` untracked file.** It's a build artifact, currently NOT in `.gitignore` based on the `git status` output. The plan must NOT `git add` it during this phase. Acceptable handling: leave it untracked; it does not block `git push HEAD:refs/heads/v4.0-integration` because push only sends tracked commits.
- **Doing anything with `git rebase` or `git commit --amend` on the local main.** The 21 worktree merge commits ARE the audit trail (each `merge(NN-NN): <plan>` is a phase plan completion). Squashing or amending destroys that history. The plan MUST keep the local history byte-identical to its current state — `git rev-parse HEAD` should equal `b54821e` at merge time.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Polling CI status via raw API | A custom poll loop with `sleep 30 && gh api ...` | `gh pr checks <N> --watch` | Built-in exponential backoff; handles GitHub's API rate limits; exits 0/1 based on conclusion |
| Validating "this is a merge commit, not a squash" | A regex on commit message | `git cat-file -p <sha> \| grep -c '^parent ' == 2` | Object-graph truth, not text heuristic; survives merge-message edits |
| Capturing PR state for evidence | Free-form prose claim in SUMMARY.md | `gh pr view <N> --json ... > evidence/<file>.json` | The verifier can re-parse JSON; prose has to be re-grepped |
| "Did the workflows install?" check | Manual grep of `gh workflow list` output | `gh workflow list --all --json name --jq '[.[] | select(.name | startswith("v40-"))] | length'` | Returns a number suitable for an `assert` comparison; locked-format output |
| Identifying merge author | The push author | `gh pr view <N> --json mergedBy --jq .mergedBy.login` | The API records who actually clicked merge (or invoked `gh pr merge`); push author is a different concept |

**Key insight:** Every Phase 49 verification step has a single canonical CLI invocation that returns machine-parseable output. The plan should structure each task's `<verify>` block as a JSON capture + a jq assertion, not as prose. This pattern is exactly what Phase 48 used (`jq '.months | keys | length'`) and it's what made the verification airtight.

## Runtime State Inventory

> Phase 49 is a release/migration phase (LOCAL → REMOTE), so this section is required.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| **Stored data** | None — Phase 49 does not write to any datastore. The committed ledger (`tests/e2e/.llm-spend-ledger.json`) is content-of-a-commit only and PRE-01/02 already locked it down. After merge it lands on origin/main and Phase 40's `v40-cost-ledger-snapshot.yml` cron starts at the next 02:00 UTC slot; that is Phase 51 UAT-47-d territory, not Phase 49. | None for Phase 49. |
| **Live service config** | **Existing CI workflows on origin** will fire on the PR head as configured. `ci.yml` is `push`-triggered AND `pull_request: branches:[main]`-triggered — so opening the PR fires `ci.yml` once on the PR head. `e2e-nightly.yml` is cron-only (won't fire on PR). `e2e-weekly-digest.yml` is cron-only. `e2e-ingest-llm-report.yml` is `workflow_dispatch` only (manual). `release.yml` is `release: types:[published]` only — won't fire. **Only `ci.yml` and `pages-build-deployment` will run on the PR.** | Plan must NOT wait on any non-CI workflow status. |
| **OS-registered state** | Nothing OS-registered (no Task Scheduler / launchd / systemd / pm2 entries depend on this branch). The local worktree has many `.claude/worktrees/agent-*` directories (verified via `git branch -vv`) — these are STALE Phase 39-46 worktrees from v4.0 execution. They are NOT cleaned up by Phase 49 (out of scope); they do not affect the push because they target `agent-*` refs, not `main`. | None for Phase 49. Documented as a deferred cleanup item (could go in a future bookkeeping phase). |
| **Secrets and env vars** | `gh secret list` returns `[]` — the repo currently has **NO secrets configured**. `v40-auto-fix.yml` requires `ANTHROPIC_API_KEY` at runtime; the workflow has a self-guard that exits cleanly with a comment-back if the secret is absent. **For Phase 49 itself, no secret is needed** — `ci.yml` uses only `GITHUB_TOKEN` (automatic). | None for Phase 49. Flag for Phase 51: UAT-47-a depends on `ANTHROPIC_API_KEY` being set BEFORE the auto-fix workflow can do anything real; without it, the workflow no-ops with a comment. |
| **Build artifacts / installed packages** | `patent-cite-firefox.zip` is present in the working tree (untracked). Phase 48 didn't address it — it's a build artifact, likely produced by a recent local build. The plan MUST NOT include this in any commit (it's not the v4.0 push payload). | Plan tasks should explicitly check `git status --porcelain` for the artifact and either move/ignore it or assert it is untracked at push time. |

**Cron-fire risk at merge time:**

| Workflow | Trigger | Risk at merge t=0 | Mitigation |
|----------|---------|-------------------|------------|
| `v40-auto-fix.yml` | `issues: types:[labeled]` | LOW — only fires on label EVENTS (add/remove), not on existence. Issues #3 and #4 currently have `triage` already attached, but the merge does NOT re-fire the event. | None needed. Phase 51 UAT-47-a will deliberately remove-then-add to fire it. |
| `v40-auto-promote.yml` | `pull_request: types:[closed]` | NONE — no PRs are closed by the merge. | None. |
| `v40-cost-ledger-snapshot.yml` | `schedule: 0 2 * * *` | LOW — first fire at next 02:00 UTC after merge. The committed ledger is at the Phase-39 single-bootstrap state per PRE-01, so the first snapshot will commit a snapshot of the bootstrap state with `[skip ci]`. | Acknowledged but not blocking. Phase 51 UAT-47-d audits this. |
| `v40-deps-update.yml` | `schedule: 0 9 * * 1` | LOW — first fire next Monday 09:00 UTC. If the merge happens on a Mon AM in UTC, the workflow could fire same-day. | Plan should note the merge timestamp; UTC-Monday merges should mention the imminent cron fire in SUMMARY. |
| `v40-pdfjs-frame-shift.yml` | `pull_request: types:[labeled, synchronize], paths:[package.json, package-lock.json]` | NONE — the integration PR is being closed, not opened or labeled with `auto-fix:pdfjs-bump`. | None. |
| `v40-verifier-gate.yml` | `pull_request: types:[...] branches:[main], head matches auto-fix/**` | NONE — the integration PR head is `v4.0-integration`, not `auto-fix/*`. | None. |

## Common Pitfalls

### Pitfall 1: required_linear_history blocks the merge button (HIGH-confidence — GitHub docs verified)

**What goes wrong:** The PR merge dropdown shows squash/rebase but NOT "Create a merge commit" because the ruleset rule blocks it. Operator gets confused and squashes anyway, destroying the 187-commit + 21-merge-commit audit trail.

**Why it happens:** Per [GitHub docs](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets): "Enforcing a linear commit history prevents collaborators from pushing merge commits to targeted branches, meaning pull requests merged must use squash merge or rebase merge." The repo setting `allow_merge_commit: true` is overridden by the ruleset rule. [VERIFIED: ruleset GET shows `required_linear_history` in `rules[]`; repo settings show `allow_merge_commit: true` — the ruleset wins]

**How to avoid:** Use `gh pr merge <N> --admin --merge` explicitly. The `--admin` flag exercises the bypass-actor permission (`current_user_can_bypass: always` confirmed live for tonyrowles, user_id 254599900). NEVER click the GitHub web UI merge button — it lacks the admin flag and will reject the merge-commit choice.

**Warning signs:** If the operator runs `gh pr merge <N> --merge` (no `--admin`) and gets back an error like `Pull request is not mergeable: must use squash or rebase`, that is the linear-history rule firing. The fix is to add `--admin`.

### Pitfall 2: PR head SHA drift between CI completion and merge (MEDIUM-confidence)

**What goes wrong:** Between "CI green" and "merge", a force-push or rebase invalidates the CI results. The merge proceeds on a SHA that has no CI signal.

**Why it happens:** `gh pr merge` without `--match-head-commit` re-resolves the head ref at merge time. If the branch moved, the merge consumes the new tip.

**How to avoid:** Capture the head SHA at CI-green time and pass `--match-head-commit <SHA>` to `gh pr merge`. Example: `gh pr merge <N> --admin --merge --match-head-commit "$HEAD_SHA"`. **Even better:** because Phase 49's plan should NOT touch the branch between push and merge, the head SHA should equal `b54821e` (the current local HEAD) throughout. The plan should pin it.

**Warning signs:** `gh pr view <N> --json headRefOid` at merge time returns a SHA different from the one at push time. If this happens, STOP — diagnose first.

### Pitfall 3: CI fails on the PR because the workflow on origin/main differs from local

**What goes wrong:** The PR's CI run uses the CHECKOUT-ed workflow file from the PR head (i.e., the local one). But many people assume CI uses the workflow file from `origin/main`. This usually doesn't bite here, but: if `ci.yml` was modified locally and the modification has a YAML error, CI fails on the PR — and the operator has to fix the YAML in a new commit.

**Why it happens:** GitHub Actions evaluates `pull_request` workflows from the HEAD ref by default (NOT `pull_request_target`).

**How to avoid:** Before pushing, run `git diff origin/main..HEAD -- .github/workflows/ci.yml` and verify the diff is `(no output)` or only benign comment changes. [VERIFIED: `git diff --name-only origin/main..HEAD -- .github/workflows/` returns 6 files, all `v40-*.yml` — `ci.yml` is NOT in the diff list, so the CI workflow on the PR equals the CI workflow on origin/main. SAFE.]

**Warning signs:** If `git diff origin/main..HEAD -- .github/workflows/ci.yml` shows non-empty output, treat that as a high-risk modification.

### Pitfall 4: Pre-existing failing CI runs on main create operator panic

**What goes wrong:** `gh run list --branch main` shows a recent FAILURE on the most recent origin/main commit (`E2E Weekly Digest` run `26755045261` at 2026-06-01 — `failure` conclusion). Operator sees the red on main and aborts the push, fearing they'll inherit the failure.

**Why it happens:** The failure on origin/main is from a cron run on the pre-push state. It is unrelated to the merge. The PR's `ci.yml` runs on a fresh checkout and is independent.

**How to avoid:** Document in the plan that the failing `E2E Weekly Digest` run on origin/main `89141d6` is a **known pre-existing flake** (per Phase 48 PRE-03 — `e2e-weekly-digest.test.js:395` calendar-rollover flake, now FIXED locally but not yet on origin). Phase 49's push will resolve it. The PR's CI run is the source of truth for the merge.

**Warning signs:** Operator runs `gh pr checks <N>` and a failed status check from a prior commit on origin/main appears. If that happens, drill into `--json` output and verify the failure references a commit OTHER than the PR head — those are stale and ignorable.

### Pitfall 5: Local `patent-cite-firefox.zip` gets committed by accident

**What goes wrong:** A `git add -A` somewhere in the plan picks up the untracked build artifact and ships it in the PR commit (post-push amend), polluting the diff.

**Why it happens:** `git status` shows it as untracked but it isn't `.gitignore`d. Phase 48 didn't touch this either.

**How to avoid:** The plan MUST NOT include a `git add` of any new content in the push payload. Phase 49 does not produce any new commits — it pushes existing local commits. Plan tasks should use ONLY `git push`, `gh pr create`, `gh pr checks`, `gh pr merge`. There is no commit step.

**Warning signs:** Plan task description includes "git add" or "git commit". REJECT — Phase 49 is push-and-merge only.

### Pitfall 6: 21 worktree merge commits look like "bad git history" to a casual reviewer

**What goes wrong:** Code reviewer sees `merge(46-02): ledger v2 dashboard + privacy audit + Phase 40 workflow extension (worktree)` and other 20 merge commits — and pushes back asking for a "cleaner history" (i.e., squash). The merge gets squashed, destroying the audit trail.

**Why it happens:** The wave-merge pattern is novel; most reviewers haven't seen it. The merge commits look redundant if you don't know what they are.

**How to avoid:** The PR body MUST explain the merge-commit structure upfront. Recommended PR body opening: "This PR contains 208 commits (187 work commits + 21 worktree-wave-merge commits) representing the v4.0 milestone (Phases 39-47) plus Phase 48 pre-push fixes. Each `merge(NN-NN): ...` commit is a wave-merge of a single phase plan executed in a parallel worktree. This is the audit trail required by the legal-filing core value; DO NOT SQUASH." Reviewer is the operator (self), so this is partly self-documentation, but it lands in the GitHub audit log too.

**Warning signs:** Anyone (or the operator themselves on autopilot) discusses "cleaning up" the history. Hard NO.

### Pitfall 7: ANTHROPIC_API_KEY missing breaks Phase 51 but doesn't affect Phase 49

**What goes wrong:** Confusion about whether the API key needs to be set BEFORE the merge.

**Why it happens:** `v40-auto-fix.yml` references `secrets.ANTHROPIC_API_KEY`. New operators may assume the merge will fail if the secret is absent. It will not — the workflow has its own self-guard.

**How to avoid:** The plan should explicitly note that `gh secret list` is `[]` and that **this is fine for Phase 49**. Phase 51 UAT-47-a is the first phase that exercises a real auto-fix run; setting `ANTHROPIC_API_KEY` is a Phase 51 prerequisite, not a Phase 49 one.

**Warning signs:** Plan tasks include `gh secret set ANTHROPIC_API_KEY`. Move to Phase 51.

### Pitfall 8: Rolling back a bad merge requires `git revert -m 1`, not `gh pr revert`

**What goes wrong:** If CI on `origin/main` immediately goes red after merge, operator searches for `gh pr revert` (which doesn't exist) or tries to delete the merge commit (which the `non_fast_forward` rule blocks).

**Why it happens:** GitHub does have a "Revert" button on merged PRs in the web UI — it opens a NEW PR with an inverse commit. CLI users may not know this.

**How to avoid:** Document the rollback path in the plan's threat_model section: `git fetch origin && git revert -m 1 <MERGE-SHA>` produces a local revert commit, then `git push origin HEAD:refs/heads/v4.0-integration-revert` and open a new PR, then `gh pr merge --admin --merge`. The bypass-actor mechanism is re-used for the revert. This is documented but not invoked unless CI on main is RED post-merge.

**Warning signs:** Operator looks for `gh pr revert`. Surface the doc'd path immediately.

## Code Examples

Verified patterns from official sources:

### Push to a new remote branch from local main

```bash
# Source: git push docs (push refspec: <local>:<remote>); always-safe pattern
# https://git-scm.com/docs/git-push
HEAD_SHA=$(git rev-parse HEAD)  # capture for traceability
git push origin HEAD:refs/heads/v4.0-integration

# Verify
git ls-remote origin refs/heads/v4.0-integration  # should output "<HEAD_SHA>\trefs/heads/v4.0-integration"
test "$(git ls-remote origin refs/heads/v4.0-integration | cut -f1)" = "$HEAD_SHA"
```

### Create the integration PR

```bash
# Source: gh pr create --help; canonical PR-open pattern
# https://cli.github.com/manual/gh_pr_create
PR_BODY=$(cat <<'EOF'
## v4.0 Integration

This PR lands the v4.0 Self-Healing Test Suite milestone (Phases 39-47) plus
the v4.1 Phase 48 pre-push regression fixes.

**Commit summary:**
- 208 total commits ahead of origin/main
- 187 work commits + 21 worktree-wave-merge commits
- Each `merge(NN-NN): ...` commit is a wave-merge of a single phase plan
  executed in a parallel worktree. This is the audit trail required by the
  legal-filing core value.

**DO NOT SQUASH.** PUSH-01 mandates `--merge` (merge-commit, not squash).
Operator should use `gh pr merge <N> --admin --merge`.

**6 new workflows land on main:**
- v40-auto-fix.yml
- v40-auto-promote.yml
- v40-cost-ledger-snapshot.yml
- v40-deps-update.yml
- v40-pdfjs-frame-shift.yml
- v40-verifier-gate.yml

Post-merge, all 6 will be discoverable via `gh workflow list --all | grep v40`.

Requirements addressed: PUSH-01, PUSH-02.
EOF
)

PR_NUMBER=$(gh pr create \
  --base main \
  --head v4.0-integration \
  --title "v4.0-integration: land 208 commits (v4.0 milestone + Phase 48)" \
  --body "$PR_BODY" \
  --assignee @me \
  | grep -oE '[0-9]+$')

echo "PR_NUMBER=$PR_NUMBER" > .planning/phases/49-.../evidence/pr-number.env
```

### Wait for CI green (block until completion)

```bash
# Source: gh pr checks --watch (built-in polling with backoff)
# https://cli.github.com/manual/gh_pr_checks
gh pr checks "$PR_NUMBER" --watch --fail-fast
# Exit 0 if all required GREEN; exit 1 if any failed/cancelled
# Captures the moment-of-truth state with no manual sleep loop

# Capture evidence after watch returns
gh pr view "$PR_NUMBER" \
  --json statusCheckRollup,headRefOid,mergeable,mergeStateStatus \
  > .planning/phases/49-.../evidence/pre-merge-state.json
```

### Admin-merge with merge-commit (NOT squash)

```bash
# Source: gh pr merge --help (admin + merge + match-head-commit pattern)
# Pinned head-commit guard against silent SHA drift
HEAD_SHA=$(gh pr view "$PR_NUMBER" --json headRefOid --jq .headRefOid)

gh pr merge "$PR_NUMBER" \
  --admin \
  --merge \
  --match-head-commit "$HEAD_SHA" \
  --subject "merge(v4.0-integration): land 208 commits (Phases 39-47 + Phase 48)" \
  --body "PR #$PR_NUMBER merged via admin-bypass per PUSH-01 (merge-commit strategy, not squash). Bypass actor: tonyrowles (id 254599900). Linear-history rule on ruleset 17086676 bypassed."

# DO NOT use --delete-branch — keeping v4.0-integration around makes the
# audit trail discoverable via gh pr view <N> --json headRefName
```

### Verify the merge landed as a merge-commit (not a squash)

```bash
# Source: git cat-file -p (raw object inspection — object-graph truth)
# https://git-scm.com/docs/git-cat-file
git fetch origin

MERGE_SHA=$(gh pr view "$PR_NUMBER" --json mergeCommit --jq .mergeCommit.oid)
PARENT_COUNT=$(git cat-file -p "$MERGE_SHA" | grep -c '^parent ')

# A merge commit has 2 parents; a squash has 1
test "$PARENT_COUNT" = "2" || { echo "FAIL: merge commit has $PARENT_COUNT parent(s), expected 2 (squash detected?)"; exit 1; }

# Capture the merge commit body
git cat-file -p "$MERGE_SHA" > .planning/phases/49-.../evidence/merge-commit-object.txt

# Confirm the second parent equals the PR head SHA captured earlier
SECOND_PARENT=$(git cat-file -p "$MERGE_SHA" | awk '/^parent /{print $2}' | sed -n 2p)
test "$SECOND_PARENT" = "$HEAD_SHA" || { echo "FAIL: second parent $SECOND_PARENT != PR head $HEAD_SHA"; exit 1; }
```

### Verify all 6 v40-* workflows discoverable on origin

```bash
# Source: gh workflow list (with --all to include disabled)
# https://cli.github.com/manual/gh_workflow_list
V40_COUNT=$(gh workflow list --all --json name \
  --jq '[.[] | select(.name | startswith("v40-"))] | length')
test "$V40_COUNT" = "6" || { echo "FAIL: only $V40_COUNT v40-* workflows visible"; exit 1; }

gh workflow list --all --json name,path,state \
  --jq '[.[] | select(.name | startswith("v40-"))]' \
  > .planning/phases/49-.../evidence/v40-workflows-on-origin.json
```

### Verify CI on the merged commit reports GREEN

```bash
# Source: gh run list with --commit filter
# This is the SC-3 evidence: "CI passes green on the merged commit"
sleep 30  # one-time wait to let the post-merge CI runs kick off
gh run list --commit "$MERGE_SHA" --json status,conclusion,name,databaseId \
  > .planning/phases/49-.../evidence/post-merge-ci-runs.json

# Wait for them to finish then re-capture
# (CI typically runs ~10 min for this repo per ci.yml timeout-minutes: 10)
# Use gh run watch <id> for each to block until completion
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Classic branch protection (`/branches/main/protection`) | Repository rulesets (`/rulesets/{id}`) | GitHub introduced rulesets to GA in 2024 | This repo uses ONLY rulesets — `gh api .../protection` returns 404. Plan must query `/rulesets/17086676`, not `/protection`. [VERIFIED live] |
| `gh pr merge --merge` clicking the web button | `gh pr merge --admin --merge --match-head-commit` | Always — best practice for protected-branch merges | Avoids merge-button drift; admin flag is the only way around bypass-eligible rules without ruleset edits |
| Long-running cron `--watch` loops | `gh pr checks --watch` | gh CLI 2.32+ | Built-in; supplants ad-hoc poll scripts |

**Deprecated/outdated:**
- The v4.0-handoff doc's "~777 local commits" figure: **stale**. Actual: 208 (= 187 + 21). The handoff was written 2026-06-01; intervening phases archived files and adjusted history. Don't trust the 777 number — derive from `git rev-list --count origin/main..HEAD`.

## Assumptions Log

> All claims tagged `[ASSUMED]` in this research.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `gh pr merge --admin --merge` will succeed against `required_linear_history` rule via bypass-actor mechanism | Standard Stack / Pitfall 1 | If GitHub blocks this combination, the fallback (ruleset PATCH off → merge → PATCH on) is documented but adds 2 extra audit-log entries. Mitigation: dry-run with `gh pr merge --admin --merge --dry-run` is not a real flag; instead, test on a throwaway PR before the real one. **The cleanest validation:** open a tiny test PR (1-commit diff) from a `test-only/bypass-probe` branch immediately before the real push, confirm `--admin --merge` produces a 2-parent commit on main, then revert that test PR via `git revert -m 1` in a follow-up, then proceed with the real v4.0-integration PR. This was NOT in the original ROADMAP scope; flag for the discuss-phase step as an optional pre-flight. |
| A2 | The 208-commit count is stable until the operator executes the plan | Summary | If the operator makes new local commits before pushing, the count drifts. Mitigation: the plan should re-derive the count as its first task (`git rev-list --count origin/main..HEAD`) and assert it equals the expected value at execution time. |
| A3 | `ci.yml` will pass on the PR head (`b54821e`) | Pitfall 4 | Phase 48 verified `npm test` exits 0 locally; the CI workflow runs the same build + test:src + test:chrome + test:firefox + lint + test:lint. Should pass. But local-vs-CI environment differences (node 22 specific, GH-runner OS, network) could surface a new failure. Mitigation: the plan's wait-for-CI task must capture `gh run view --log-failed` on any failure for triage; the plan must NOT proceed to merge while CI is failing. |
| A4 | The operator running Phase 49 IS `tonyrowles` (user_id 254599900) | Standard Stack / Anti-Patterns | If the operator switches to `fattestduck` mid-phase, the bypass doesn't apply. Mitigation: plan's first task should `gh api user --jq .login` and assert it equals `tonyrowles`. |
| A5 | The 21 worktree merge commits are all benign first-parent advances and contain no "lost work" or duplicate state | Pitfall 6 | A future audit could surface that a worktree merge silently dropped a commit. Mitigation: per memory note `worktree_base_drift`, this has been seen during v4.0. Phase 48 verification (10/10 must-haves PASS, all 1428 tests pass) is the existing safety net. Phase 49 does not re-audit. |
| A6 | Issue #3 and #4's existing `triage` label does NOT re-fire `v40-auto-fix.yml` at merge time | Runtime State Inventory | `issues: types:[labeled]` fires on the labeling event itself; the merge does not re-emit historical labeling events. This is well-documented GitHub Actions behavior. [CITED: docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#issues] Risk: very low. |

**Recommendation:** A1 is the only assumption with non-trivial risk. The discuss-phase step should surface it as a user choice: "Do you want a pre-flight bypass test on a throwaway PR (safer, +1 day), or proceed directly (faster, slight risk of an unrecoverable merge-mode error)?" If the user chooses "proceed directly," the plan should still include a `--match-head-commit` guard and a documented rollback via `git revert -m 1`.

## Open Questions

1. **Should Phase 49 include a Phase 50-prep step that captures `integration_id` from the FIRST post-merge CI run?**
   - What we know: STATE.md's blocker for Phase 50 says "integration_id capture must be an explicit numbered step in the plan." The integration_id is the API-resolvable identifier of a check-run that lets Phase 50's ruleset PATCH bind status checks.
   - What's unclear: Should this happen in Phase 49 (immediately post-merge while CI is fresh) or in Phase 50 (Phase 50's plan owns it)?
   - Recommendation: Include a `gh run list --commit "$MERGE_SHA" --workflow CI --json databaseId,name,status` capture in Phase 49 SUMMARY's evidence directory so Phase 50 has it pre-resolved without re-querying. NOT a Phase 49 success criterion — just a courtesy capture. Surface this in discuss-phase.

2. **Should the integration PR be self-reviewed (re. ruleset's `require_code_owner_review: true`)?**
   - What we know: The ruleset requires 1 approving review from a code-owner. CODEOWNERS pins `@tonyrowles` to `/src/`, `/tests/`, `/.github/workflows/`, `/tests/golden/`, `/tests/e2e/test-cases-quarantine.js`. The PR touches all of these. tonyrowles IS the codeowner AND the PR author. GitHub does not allow self-approval of own PR.
   - What's unclear: Whether `--admin` bypasses the code-owner review requirement AS WELL AS the linear-history rule.
   - Recommendation: Yes — `--admin` bypasses ALL ruleset rules for actors with `bypass_mode: always`. Confirmed by docs ("allow certain users to bypass the rules in the ruleset") and by `current_user_can_bypass: always`. The merge will proceed without an approving review. If this is undesirable from an audit-trail perspective, the alternative is to add a second user to the codeowners or accept the audit-log entry "merged without required review (admin)". This is a discuss-phase question.

3. **Should the operator block on `gh pr checks --watch` for ALL workflows, or only for the required ones?**
   - What we know: The ruleset has NO `required_status_checks` rule (verified: `rules[]` has 4 entries, none of type `required_status_checks`). So nothing is technically required to be green for the merge button. CI workflow runs anyway (push/PR triggered) and SHOULD be green.
   - What's unclear: Phase 49 SC-3 demands "all required CI checks as PASS." But there are no required CI checks (technically).
   - Recommendation: Interpret SC-3 as "all CI runs that fired on the PR head report `conclusion=success`." Phase 49 should wait on every fired check, not just required ones. This makes SUMMARY honest. (Phase 50 is the phase that ADDS the required checks.)

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `gh` (GitHub CLI) | Every step | ✓ | active session, `repo, workflow` scopes | None — hard requirement. |
| `git` | Push, log, cat-file | ✓ | 2.x local; 2.54.0 on CI runner | None — hard requirement. |
| `jq` | JSON parsing in verifications | Assumed ✓ (used throughout v4.0) | n/a | None needed — `gh --jq` is built-in. |
| `node` 22 | CI workflow only (not Phase 49 itself) | n/a (CI runner provides) | 22 (per ci.yml `setup-node@v4` config) | None needed. |
| Authenticated GitHub session as `tonyrowles` | Admin-merge bypass | ✓ | user_id 254599900 — bypass actor in ruleset | If session becomes `fattestduck`, switch back with `gh auth switch -u tonyrowles`. |
| `ANTHROPIC_API_KEY` secret on the repo | Phase 51 UAT-47-a (NOT Phase 49) | ✗ | — | NOT NEEDED for Phase 49. Flag for Phase 51. |
| Internet connectivity to api.github.com | Every gh API call | Assumed ✓ | n/a | None — hard requirement. |

**Missing dependencies with no fallback:** None for Phase 49.

**Missing dependencies with fallback:** None for Phase 49.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Bash scripts + `gh` CLI + `git` CLI + `jq` (no test runner needed — Phase 49 verifies GitHub state, not code) |
| Config file | None — verification is procedural |
| Quick run command | (see per-task verify blocks below) |
| Full suite command | `bash .planning/phases/49-*/scripts/verify-phase-49.sh` (created by the plan as the SC harness) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PUSH-01 | An integration PR opens from a local-main-equivalent branch with 208 commits; merge strategy is `--merge` (NOT squash) | shell-procedural | `git cat-file -p "$MERGE_SHA" \| grep -c '^parent '` returns `2`; `gh pr view "$N" --json mergeCommit --jq .mergeCommit.oid` non-null | ✅ Pattern in Phase 48 |
| PUSH-02 | CI passes green on the integration PR on origin; 6 v40-* workflows confirmed present on origin | shell-procedural | `gh pr checks "$N" --watch` exits 0; `gh workflow list --all --jq '[.[] \| select(.name \| startswith("v40-"))] \| length'` returns `6`; `gh run list --commit "$MERGE_SHA" --json conclusion --jq '[.[] \| select(.conclusion != "success")] \| length'` returns `0` | ✅ Wave 0 — script to be authored in plan |
| SC-1 | v4.0 commits visible at `git log origin/main` with full 208-commit history (merge-commit) | git-procedural | `git log origin/main --oneline \| head -210 \| wc -l` ≥ 209 (208 + base) ; `git log origin/main --merges --oneline \| grep -c "merge(v4.0-integration)"` returns `1` | ✅ |
| SC-2 | `gh workflow list \| grep v40` shows all 6 v40-* workflows | gh API | `gh workflow list --all --jq '[.[] \| select(.name \| startswith("v40-"))] \| length'` returns `6`; names checked individually | ✅ |
| SC-3 | `gh pr view <N> --json statusCheckRollup` shows all required CI checks as PASS on the merged commit | gh API | `gh pr view "$N" --json statusCheckRollup --jq '[.statusCheckRollup[] \| select(.conclusion != "SUCCESS")] \| length'` returns `0` | ✅ |
| SC-4 | The integration PR merge event is recorded as a merge commit (not a squash commit) in the GitHub audit log | git-procedural | `git cat-file -p "$MERGE_SHA" \| awk '/^parent /'` returns 2 lines; `gh pr view "$N" --json mergeCommit --jq .mergeCommit.oid` matches `$MERGE_SHA` | ✅ |

### Sampling Rate

- **Per task commit:** Phase 49 produces **NO new code commits** (push-and-merge only). Verification happens between tasks via shell snapshots into `.planning/phases/49-*/evidence/`.
- **Per wave merge:** N/A — single-plan phase; no waves.
- **Phase gate:** All 4 ROADMAP success criteria verified by the post-merge harness; SUMMARY.md captures evidence JSON inline.

### Wave 0 Gaps

- [ ] `.planning/phases/49-push-v4-0-integration-pr/scripts/verify-phase-49.sh` — single SC harness wrapping the 6 verifications above. Not yet authored; plan must create it.
- [ ] `.planning/phases/49-push-v4-0-integration-pr/evidence/` — directory for JSON captures. Created by the plan's first task.

*(No framework install needed — `gh`, `git`, `jq` are pre-existing.)*

### Negative Tests

| Negative Assertion | Command | Failure Mode |
|--------------------|---------|--------------|
| Merge is NOT a squash | `test $(git cat-file -p $MERGE_SHA \| grep -c '^parent ') = 2` | Single-parent → squash happened → SC-4 fails |
| 21 worktree-merge commits ARE in the final history | `git log --merges origin/main \| grep -c "(worktree)$"` ≥ 21 | Lower count → some worktree-merge commits lost in flattening (would indicate squash-via-rebase) |
| Ruleset is unchanged post-merge | `gh api repos/.../rulesets/17086676 --jq '.rules \| length'` returns `4` (same as pre-merge); `.bypass_actors \| length` returns `1` | Mutation of ruleset by Phase 49 would mean the plan exceeded its scope |

## Security Domain

> Required when `security_enforcement` is enabled (absent = enabled). This phase is release-engineering against GitHub — included for completeness.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | GitHub `gho_*` token (verified via `gh auth status`); token scopes are `gist, read:org, repo, workflow` — appropriately scoped for this phase |
| V3 Session Management | no | n/a — `gh` token-based; no interactive session |
| V4 Access Control | yes | Bypass-actor mechanism on ruleset 17086676; `current_user_can_bypass: always` only for the single configured actor `254599900` (tonyrowles). Phase 50 reduces this to zero bypass actors. |
| V5 Input Validation | no | Phase 49 issues no new code; all inputs are git refs and SHAs (system-generated). |
| V6 Cryptography | no | n/a — TLS to api.github.com handled by `gh` |

### Known Threat Patterns for release-engineering against GitHub

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Force-push to main destroying commit history | Tampering | `non_fast_forward` rule active on ruleset 17086676 (verified); even with bypass, the documented path is admin-merge of a PR — NOT force-push |
| Squash-merge silently flattening 21 worktree merges | Tampering | `git cat-file -p <merge-sha> \| grep -c '^parent ' == 2` negative test (see Validation Architecture) |
| Secret leakage in PR diff or merge commit message | Information Disclosure | No new secrets introduced; the merge body is a documented prose template; `git log origin/main..HEAD` reviewed for any inadvertent secret was done implicitly in Phase 48 (committed-ledger sanitization). The committed `tests/e2e/.llm-spend-ledger.json` has been reset to the Phase-39 bootstrap entry only (PRE-01). |
| Bypass actor compromise → silent merge of unreviewed code | Elevation of Privilege | The bypass actor's PAT has only `repo, workflow` scope; not `admin:org`. Phase 50 will REMOVE the bypass actor entirely after Phase 49 succeeds — this closes the window. |

### Phase-49-specific risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Admin-merge audit-log entry shows "merged without required review (admin)" | Certain | Low (intentional, documented) | The PR body documents this; the project's CLEANUP-04 (Phase 50) closes the bypass shortly after. Audit-log trail preserves the merger identity. |
| CI fails after merge on origin/main due to environment difference local→runner | Low (1428 tests passed locally in Phase 48) | Medium — would block downstream phases | Rollback via `git revert -m 1 <merge-sha>` documented in Pitfall 8; same admin-merge mechanism reused for the revert PR |
| Operator merges wrong PR (not the integration PR) | Very low — only one PR will be open | Critical — could corrupt main | Plan's first task captures `$PR_NUMBER` into `evidence/pr-number.env`; all subsequent steps reference `"$PR_NUMBER"`, not a hardcoded number |

## Project Constraints (from CLAUDE.md)

| Directive | Phase 49 Application |
|-----------|----------------------|
| Answer verification after every AskUserQuestion call | Apply during `/gsd:discuss-phase` if used; not applicable to research phase itself |
| Do NOT assume, guess, or fabricate an answer | Honored: all factual claims tagged with `[VERIFIED: ...]` or `[CITED: ...]` or `[ASSUMED]`; assumptions surface in the Assumptions Log |

CLAUDE.md does not impose technical constraints on Phase 49 beyond the user-input verification rule.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PUSH-01 | A `v4.0-integration` PR is opened from local main with the ~777 commits; merge-strategy is `--merge` (NOT squash — the commit history is the audit trail for a legal-filing tool) | Architecture pattern §System Architecture Diagram (Steps 1-4); Code Examples §Push, §Create PR, §Admin-merge; Pitfall 1 (linear-history rule); Pitfall 6 (don't squash); Validation Architecture SC-1, SC-4. **Note:** the "777" figure is stale — actual is 208 commits (verified live). PUSH-01's intent (preserve full commit history) is honored at 208 just as at 777. |
| PUSH-02 | CI passes green on the integration PR on origin (full test suite + lint + build + 6 V40 workflows confirmed present); the merged commit produces at least one complete check-suite run | Architecture pattern §Pattern 2 (Workflow Discoverability Probe); Code Examples §Wait for CI green, §Verify CI on merged commit, §Verify 6 v40-* workflows discoverable; Validation Architecture SC-2, SC-3. The single PR-relevant required check is `CI` (from `.github/workflows/ci.yml`, `pull_request: branches:[main]` trigger). |

## Sources

### Primary (HIGH confidence)
- Live `gh` CLI probes on this machine — all command outputs cited inline with `[VERIFIED: live]` tags
- Local repo state — `git status`, `git log`, `git rev-list --count`, `git diff --name-only`, `git cat-file` outputs
- `.planning/REQUIREMENTS.md` (PUSH-01, PUSH-02 sections)
- `.planning/ROADMAP.md` (Phase 49 details + success criteria)
- `.planning/STATE.md` (current position, deferred items)
- `.planning/phases/48-pre-push-regression-fixes/48-VERIFICATION.md` (Phase 48 closure: 10/10 must-haves, all 1428 tests pass)
- `.planning/v4.0-SESSION-HANDOFF-2026-06-01.md` (777-commit figure context — flagged stale)
- GitHub docs: [Available rules for rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets) (required_linear_history + allowed_merge_methods interaction)
- GitHub CLI manual: [gh pr merge](https://cli.github.com/manual/gh_pr_merge), [gh pr checks](https://cli.github.com/manual/gh_pr_checks), [gh workflow list](https://cli.github.com/manual/gh_workflow_list)

### Secondary (MEDIUM confidence)
- [GitHub Community Discussion #80952](https://github.com/orgs/community/discussions/80952): "Require Linear History Only for New Commits in Rulesets" — confirms current behavior
- [GitHub Community Discussion #156855](https://github.com/orgs/community/discussions/156855): "Enabling and disabling 'require linear history' breaks the PR merge button" — confirms merge-button restriction

### Tertiary (LOW confidence)
- None — all critical facts verified against primary sources.

## Metadata

**Confidence breakdown:**
- Standard stack (gh/git/jq): HIGH — all installed and authed; verified live
- Architecture (push → PR → wait → admin-merge → verify): HIGH — canonical 5-step release pattern; matches v3.1 close pattern
- Ruleset interaction (linear-history vs merge-commit): HIGH — docs explicitly confirm conflict; bypass actor confirmed in live API response with `current_user_can_bypass: always`
- Pitfalls (8 listed): HIGH for #1-4 (verified live); MEDIUM for #5-8 (informed by Phase 48 patterns and project memory)
- Validation Architecture: HIGH — each SC has a single canonical CLI invocation returning JSON or exit code

**Research date:** 2026-06-02
**Valid until:** 2026-06-09 (7 days — GitHub API behavior and ruleset state can change; PR state especially is volatile)

## RESEARCH COMPLETE

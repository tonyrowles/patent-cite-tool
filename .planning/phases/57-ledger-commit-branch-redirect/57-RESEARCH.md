# Phase 57: Ledger-Commit Branch Redirect - Research

**Researched:** 2026-06-04
**Domain:** GitHub Actions workflow refactor — branch-redirect for daily ledger snapshot push under Phase 50 ruleset constraint
**Confidence:** HIGH (all findings grounded in direct codebase + GH-API inspection; zero training-data reliance)

## Summary

Phase 57 redirects `v40-cost-ledger-snapshot.yml`'s daily `git push` from `main` to `ledger-snapshots/daily-${SNAPSHOT_DATE}` because ruleset 17086676 (`v4.0-main-protection`, conditions `ref_name.include: ["~DEFAULT_BRANCH"]`) blocks direct pushes to `main` for the `github-actions[bot]` actor (`bypass_actors: []`, `current_user_can_bypass: never` — empirically confirmed via `gh api repos/:owner/:repo/rulesets/17086676` at research time).

Two existing concurrency mechanisms make this refactor mechanically simple: (a) the workflow already has a static workflow-level concurrency group `v40-cost-ledger-snapshot` with `cancel-in-progress: false` (lines 27-29), and (b) the daily-branch naming makes accidental same-day overwrites impossible by date-keying. The largest implementation risk is **not** the snapshot workflow itself but the LOAD-BEARING invariant that `v40-auto-fix.yml` must stay byte-unchanged (Pitfall 1) — any sympathetic edit to its two-commit ledger split breaks every future auto-fix PR via FORBIDDEN_PATHS regex 5 (verified: `/^tests\/e2e\/\.llm-spend-ledger\.json$/` rejects the canonical ledger path).

**Empirical re-frame of COMMIT-02:** The diff-guard job in `v40-verifier-gate.yml` (lines 65-183) does **NOT** currently contain a "Scope decision (auto-fix/* PRs only; fast-path SUCCESS otherwise)" step. The three existing scope-decision steps at lines 208, 414, 514 are in the `verifier-gate`, `regression-suite`, and `ready-flip` jobs respectively. **COMMIT-02 is therefore load-bearing, not defensive-only** — without it, a hypothetical PR from `ledger-snapshots/daily-*` to `main` would reach the diff-guard, which would hard-fail at "Diff-guard regex bank (forbidden paths)" because the ledger path matches FORBIDDEN_PATHS regex 5.

**Primary recommendation:** Single atomic `feat(57): redirect cost-ledger-snapshot push to ledger-snapshots/* branch (COMMIT-01..04)` commit. (a) Change `git push` (line 91) to `git push origin HEAD:ledger-snapshots/daily-${{ env.SNAPSHOT_DATE }}`. (b) Add the verbatim scope-decision step as the FIRST step in the diff-guard job and gate the existing 4 steps with `if: steps.scope.outputs.active == 'true' || github.event_name != 'pull_request'` (mirrors the verifier-gate/regression-suite/ready-flip pattern). (c) Update S13 contract: relax S8 negative assertion + add positive `ledger-snapshots/` branch-prefix assertion + raise the S13 `changedLines.length <= 4` ceiling to `<= 6` (the bare push line now ALSO differs between snapshot and digest, adding 2 more changed lines). (d) Verification gates: `grep -c 'git push origin main' .github/workflows/v40-auto-fix.yml` returns 1; all 18 S13-suite tests still green; npm test deltas zero.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Daily ledger snapshot persistence | CI Workflow (`v40-cost-ledger-snapshot.yml`) | Repo (push to `ledger-snapshots/daily-*` branch) | Workflow owns the cron + commit; the repo branch is the durable artifact. Was main before; ruleset 17086676 now blocks main. |
| Auto-fix two-commit ledger isolation | CI Workflow (`v40-auto-fix.yml` lines 150-172) | Repo (push to `main` directly) | LOAD-BEARING anti-feature — the direct-to-main commit BEFORE the auto-fix PR branch is rebased keeps the ledger entry OUT of the PR diff so FORBIDDEN_PATHS regex 5 passes. Pitfall 1. **OUT OF SCOPE for Phase 57.** |
| PR diff-guard rejection of forbidden paths | CI Workflow (`v40-verifier-gate.yml` diff-guard job) | `scripts/check-diff-guard.mjs` (pure helper) | Workflow runs `git diff --name-only origin/main..HEAD | node scripts/check-diff-guard.mjs`. The CLI exit-code carries the verdict. |
| Non-auto-fix PR fast-path (scope decision) | CI Workflow (each PR-gate job in `v40-verifier-gate.yml`) | `github.head_ref` namespace convention (`auto-fix/*`) | Already present in 3 of 4 jobs (Phase 51.1). Diff-guard is the missing 4th. Phase 57 adds it. |
| S13 YAML contract pinning | Vitest (`tests/e2e/scripts/v40-cost-ledger-snapshot-yaml.test.js`) | Repo (`grep`-style assertions against YAML text) | Pure grep + `sed`-driven diff against `e2e-weekly-digest.yml`. No YAML parsing — byte-level assertions. |

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **Scope-lock:** Refactor applies to `.github/workflows/v40-cost-ledger-snapshot.yml` ONLY. `.github/workflows/v40-auto-fix.yml` MUST stay byte-unchanged (Pitfall 1; gate: `grep -c 'git push origin main' .github/workflows/v40-auto-fix.yml` = 1).
- **Push target:** `git push origin HEAD:ledger-snapshots/daily-${{ env.SNAPSHOT_DATE }}` — replaces the bare `git push` at line 91 of `v40-cost-ledger-snapshot.yml`.
- **Concurrency group:** Add a workflow-level `concurrency` block keyed on the snapshot date so two cron tickers can't race the same daily branch. (Researcher note: workflow ALREADY has workflow-level concurrency `v40-cost-ledger-snapshot` with `cancel-in-progress: false` at lines 27-29 — the static group already prevents schedule + workflow_dispatch races. Date-keying is unnecessary and would weaken the static guard. See "User Constraint refinement" below.)
- **Verifier-gate diff-guard fast-path (COMMIT-02):** Add the same scope-decision pattern from lines 208/414/514 to the diff-guard job specifically.
- **S13 Vitest contract (COMMIT-03):** (a) remove negative assertion on bare `git push`, (b) add positive assertion pinning `ledger-snapshots/` branch prefix, (c) keep all other byte-equality + verbatim-block-parity checks green.
- **`v40-auto-fix.yml` invariant (COMMIT-04):** ZERO bytes touched. Gate: `grep -c 'git push origin main' .github/workflows/v40-auto-fix.yml` = 1.

### Claude's Discretion

- Concurrency-group key syntax (workflow-level vs job-level; date-from-env vs date-from-cron-trigger).
- Whether the new `Scope decision` step in the diff-guard job ALREADY exists from Phase 51.1 (planner verifies via grep; if present, COMMIT-02 reduces to a no-op + a Vitest assertion to pin its presence; if absent, add the step verbatim from existing siblings).
- Commit ordering — recommended single atomic commit.
- Whether to delete the old `ledger-snapshots/daily-*` branches periodically — explicitly NOT in scope.

### Deferred Ideas (OUT OF SCOPE)

- Periodic cleanup of accumulated `ledger-snapshots/daily-*` branches — operator-owned.
- Refactoring `v40-auto-fix.yml`'s ledger push to a branch — LOAD-BEARING Pitfall 1.

### User Constraint Refinement (researcher-flagged for planner)

The Locked Decision says "Add a workflow-level `concurrency` block" — but the workflow ALREADY HAS one (verified: `concurrency: { group: v40-cost-ledger-snapshot, cancel-in-progress: false }` at lines 27-29). Two valid interpretations:

1. **Keep existing static group.** The static group already prevents schedule + workflow_dispatch race. Date-keyed groups across days are unnecessary because the branch NAMES are date-disjoint (`ledger-snapshots/daily-2026-06-05` vs `ledger-snapshots/daily-2026-06-06`) — even a 24-hour-overrun cron run cannot collide. **Recommended: leave the static group untouched.** Vitest pin: new assertion `expect(yaml).toContain('group: v40-cost-ledger-snapshot')`.

2. **Refactor to date-keyed group.** Replace `group: v40-cost-ledger-snapshot` with `group: cost-ledger-snapshot-${{ github.run_id }}` (run_id is workflow-evaluation-time — env vars like SNAPSHOT_DATE are NOT in scope at workflow-level concurrency evaluation; only `github.*` context is). Loses the schedule-vs-dispatch race guard. **Not recommended.**

Option 1 is consistent with the documented intent of the existing concurrency block (lines 25-26: "Static concurrency group prevents schedule + workflow_dispatch from racing"). The planner should adopt Option 1 unless a new race surface is identified.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| COMMIT-01 | `v40-cost-ledger-snapshot.yml` pushes to `ledger-snapshots/daily-${SNAPSHOT_DATE}`; concurrency group prevents same-day races | Line 91 currently bare `git push`. `SNAPSHOT_DATE` is in scope as `${{ env.SNAPSHOT_DATE }}` (written to `$GITHUB_ENV` at line 64, accessible at line 91 — proven by line 90 already using `${{ env.SNAPSHOT_DATE }}` in commit message). Existing concurrency group (lines 27-29) already prevents schedule + dispatch race; daily branch names are date-disjoint. Recommended push line (verbatim): `git push origin HEAD:ledger-snapshots/daily-${{ env.SNAPSHOT_DATE }}` |
| COMMIT-02 | `v40-verifier-gate.yml` diff-guard job gains scope-decision fast-path step | EMPIRICAL FINDING: diff-guard job (lines 65-183) DOES NOT have a scope-decision step. Phase 51.1 added it to verifier-gate (208), regression-suite (414), ready-flip (514) but NOT diff-guard. This is load-bearing for Phase 57. Pattern to copy: `if: github.event_name == 'pull_request'` + `if [[ "${{ github.head_ref }}" == auto-fix/* ]]` shell guard. Gate the 4 existing diff-guard steps (Ensure label, Diff-size cap, Diff-guard regex bank, Test-count invariant) with `if: steps.scope.outputs.active == 'true' || github.event_name != 'pull_request'`. |
| COMMIT-03 | S13 Vitest contract updated for new push target | S8 (line 96-99) explicitly checks `expect(yaml).toContain('git push')` and `expect(yaml).not.toMatch(/git push\s+--force/)` — BOTH still hold for `git push origin HEAD:ledger-snapshots/...`. S13 (line 175-208) uses `sed -n '/git config user.name/,/git push/p'` to diff the git-config block byte-for-byte against `e2e-weekly-digest.yml`. The current `<= 4` ceiling assumes 2 differences (git add + commit message) × 2 sides of diff. The new push line adds 2 more changed lines → ceiling becomes `<= 6`. |
| COMMIT-04 | `v40-auto-fix.yml` ledger-commit step BYTE-UNCHANGED — gate: `grep -c 'git push origin main' .github/workflows/v40-auto-fix.yml` = 1 | Empirically confirmed: baseline `grep -c 'git push origin main' .github/workflows/v40-auto-fix.yml` returns `1` (the line 170 push in the two-commit-split step). NO OTHER `git push` exists in that file. Phase 57 must not touch this file. |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `git` CLI | runner-bundled (≥2.40) | Branch-redirect `git push origin HEAD:<branch>` | Pure CLI, no actions needed. `actions/checkout@v4` already sets `persist-credentials: true` so the default GITHUB_TOKEN authenticates the push under `contents: write`. |
| `actions/checkout@v4` | v4 (pinned) | Provides credentialed git context | Already used at line 42. No change. |
| `actions/setup-node@v4` | v4 (pinned) | Node 22 for capture-summary step | Already used at line 46. No change. |
| Vitest | v3.2.4 (resolved `^3.0.0`) | Runs S13 contract test | Already on disk. Verified by `npx vitest run` baseline pass (127ms, 18 tests). No new install. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `bash` shell-condition `[[ ]]` | bash 5+ | `${{ github.head_ref }}` check in scope-decision step | Verbatim from existing scope-decision steps in `v40-verifier-gate.yml` lines 212/418/518. Already canonical. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `git push origin HEAD:ledger-snapshots/daily-${{ env.SNAPSHOT_DATE }}` | Create the branch then push with explicit `git push -u origin ledger-snapshots/daily-${{ env.SNAPSHOT_DATE }}` | Two-step is verbose; `HEAD:<branch>` push-refspec is the canonical pattern for "push current commit to a remote branch that may not exist." GitHub auto-creates the remote ref. |
| Workflow-level `concurrency: { group: ..., cancel-in-progress: false }` | Job-level concurrency on the `snapshot` job | Workflow-level already exists; job-level adds noise without changing semantics. |
| New `concurrency` group keyed on `SNAPSHOT_DATE` | Keep existing static `v40-cost-ledger-snapshot` group | Date-keyed group loses schedule-vs-dispatch race guard. Branch names are already date-disjoint so daily race is impossible. Static group wins. |
| Refactor scope to also rename Phase 50's verifier-gate trigger | Leave verifier-gate trigger as-is | Phase 51.1 already removed the BASE-ref filter; PRs from `ledger-snapshots/daily-*` to main now reach the workflow. Confirmed by reading lines 44-46: `on: pull_request: types: [opened, synchronize, reopened]` — no `branches:` filter. |

**Installation:** N/A — zero new dependencies. Vitest already at v3.2.4. Confirmed by `grep '"vitest"' package.json` → `"vitest": "^3.0.0"`; resolved via `npx vitest --version` → v3.2.4.

**Version verification:**

```bash
npx vitest --version   # 3.2.4 (2026-06-04)
git --version           # runner ubuntu-latest ships ≥2.40
node --version          # v22 (workflow-pinned)
```

## Package Legitimacy Audit

> Phase 57 installs ZERO new packages. No legitimacy gate required. The only dependencies in play (`vitest`, `actions/checkout@v4`, `actions/setup-node@v4`) are already pinned and in active use across the codebase.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| (none) | — | — | — | — | — | No new packages installed |

## Architecture Patterns

### System Architecture Diagram

```
+-----------------------+
| cron: 0 2 * * *       |
| workflow_dispatch     |
+----------+------------+
           |
           v
+----------+--------------------------+
| v40-cost-ledger-snapshot.yml        |
|   concurrency: v40-cost-ledger-...  |
|   permissions: contents: write      |
|                                     |
|   1. checkout@v4 (creds=true)       |
|   2. setup-node@v4 (node 22)        |
|   3. Capture summary -> $GITHUB_ENV |
|      SNAPSHOT_DATE=2026-06-05       |
|      INVOCATIONS=N                  |
|      SPEND_USD=X.XX                 |
|   4. Regenerate dashboard           |
|   5. git config + git add + commit  |
|      [skip ci] message LOAD-BEARING |
|      (line 90 unchanged)            |
|   6. *** PHASE 57 CHANGE ***        |
|      git push origin HEAD:          |
|        ledger-snapshots/daily-      |
|        ${{ env.SNAPSHOT_DATE }}     |
+----------+--------------------------+
           |
           v
+----------+--------------------------+
| New ref on origin:                   |
|   refs/heads/ledger-snapshots/       |
|     daily-2026-06-05                 |
|                                      |
| NO ruleset on this prefix            |
| (verified: ruleset 17086676 only     |
|  targets ~DEFAULT_BRANCH)            |
+--------------------------------------+

[if operator opens PR from this branch -> main]
           |
           v
+----------+--------------------------+
| v40-verifier-gate.yml fires          |
| (on: pull_request: [opened, sync,    |
|  reopened]; no branches: filter      |
|  since Phase 51.1)                   |
|                                      |
| Job 1: diff-guard                    |
|   *** PHASE 57 CHANGE ***            |
|   Step 0: Scope decision             |
|     head_ref starts with auto-fix/ ? |
|       no -> active=false -> skip     |
|       yes -> active=true             |
|   Steps 1-4 gated on active==true    |
|                                      |
| Job 2: verifier-gate (already gated) |
| Job 3: regression-suite (already)    |
| Job 4: ready-flip (already)          |
|                                      |
| For ledger-snapshots/* head:         |
|   all 4 jobs fast-path SUCCESS       |
|   in < 60s, PR is mergeable          |
+--------------------------------------+
```

### Recommended Project Structure (unchanged from existing)

```
.github/workflows/
├── v40-cost-ledger-snapshot.yml   # MODIFIED: push line 91 + dashboard regen
├── v40-verifier-gate.yml          # MODIFIED: diff-guard scope step
├── v40-auto-fix.yml               # BYTE-UNCHANGED (Pitfall 1)
└── e2e-weekly-digest.yml          # UNTOUCHED (S13 byte-parity peer)
tests/e2e/scripts/
└── v40-cost-ledger-snapshot-yaml.test.js  # MODIFIED: S8 + S13 + new assertion
scripts/
└── check-diff-guard.mjs           # UNTOUCHED (FORBIDDEN_PATHS unchanged)
```

### Pattern 1: Branch-redirect push refspec

**What:** Replace `git push` with `git push origin HEAD:<branch-name>` to push the current commit to a (possibly new) remote branch in one step.
**When to use:** A workflow with `contents: write` that needs to push a commit somewhere OTHER than the default branch the workflow checked out.
**Example:**

```yaml
# Source: .github/workflows/v40-cost-ledger-snapshot.yml (Phase 57 edit)
- name: Commit daily ledger snapshot
  run: |
    git config user.name "github-actions[bot]"
    git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
    git add tests/e2e/.llm-spend-ledger.json docs/v40-ledger-dashboard.md
    git diff --cached --quiet || git commit -m "[skip ci] ledger snapshot ${{ env.SNAPSHOT_DATE }}: ${{ env.INVOCATIONS }} invocations, \$${{ env.SPEND_USD }} spent"
    git push origin HEAD:ledger-snapshots/daily-${{ env.SNAPSHOT_DATE }}
```

**Critical caveat:** The `git diff --cached --quiet || git commit ...` idempotent guard (line 90) means a no-op snapshot (ledger unchanged) skips both `git commit` AND `git push`. This is correct: no new commit = nothing to push. The current code is safe; the only change is line 91.

### Pattern 2: Scope-decision fast-path (verbatim from Phase 51.1)

**What:** Insert a first-step scope guard that emits `active=true/false` based on `github.head_ref` prefix; gate all subsequent steps in the job with an `if:` condition on the output.
**When to use:** A PR-triggered job that should run ONLY for `auto-fix/*` PRs but reports success (not skip) for all other PRs — required because `verifier-gate` and `deps-update-gate` are listed in `required_status_checks`.
**Example:**

```yaml
# Source: .github/workflows/v40-verifier-gate.yml lines 208-217 (verifier-gate job; copy verbatim for diff-guard)
- name: Scope decision (auto-fix/* PRs only; fast-path SUCCESS otherwise)
  id: scope
  if: github.event_name == 'pull_request'
  run: |
    if [[ "${{ github.head_ref }}" == auto-fix/* ]]; then
      echo "active=true" >> "$GITHUB_OUTPUT"
    else
      echo "active=false" >> "$GITHUB_OUTPUT"
      echo "Fast-path SUCCESS — non-auto-fix PR (head=${{ github.head_ref }})"
    fi

# Each subsequent step gets:
- name: Existing step
  if: steps.scope.outputs.active == 'true' || github.event_name != 'pull_request'
```

**Diff-guard-specific notes:**
1. The `outputs.src_loc` and `outputs.tests_loc` of the diff-guard job (lines 68-70) are consumed by the `Label + comment on rejection` step which runs `if: failure()`. For non-auto-fix PRs, neither the diff-size cap step nor the rejection step runs, so the outputs simply stay empty — safe.
2. The `checkout` step at line 76 is NOT gated currently. For symmetry with the verifier-gate/regression-suite/ready-flip pattern, gate it (and setup-node + npm install) with `if: steps.scope.outputs.active == 'true' || github.event_name != 'pull_request'`. This saves ~30s of runner time per non-auto-fix PR and matches the existing pattern.
3. The `Ensure human-review-required label exists` step (line 94) is a label create + the rejection comment step is `if: failure()` — both are auto-fix-specific. Gate both.

### Anti-Patterns to Avoid

- **Refactoring `v40-auto-fix.yml`'s line 170 push:** LOAD-BEARING Pitfall 1. The direct-to-main commit there exists specifically to keep the ledger entry OUT of the auto-fix PR diff. Verification: `grep -c 'git push origin main' .github/workflows/v40-auto-fix.yml` must equal `1` after Phase 57 commits.
- **Replacing the existing static concurrency group with a date-keyed one:** Loses the schedule + dispatch race guard. Branch names are already date-disjoint.
- **Using `${{ env.SNAPSHOT_DATE }}` inside the workflow-level `concurrency:` block:** Env vars from a job step are NOT in scope at workflow concurrency evaluation time. Only `github.*` context is available there.
- **Adding `--force` to the new push:** Defeats branch-protection equivalents (none currently, but introduces unnecessary destructive surface). S8 negative assertion `expect(yaml).not.toMatch(/git push\s+--force/)` must continue to hold.
- **Removing the `[skip ci]` marker:** LOAD-BEARING — without it, the new commit on `ledger-snapshots/daily-*` triggers `ci.yml` (which runs on `push` to any branch, presumably). Pin in S7.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Branch creation before push | `git branch ledger-snapshots/daily-... && git push -u origin ledger-snapshots/daily-...` | `git push origin HEAD:ledger-snapshots/daily-...` | Single-step refspec push auto-creates the remote ref. Idiomatic CI pattern. |
| Date-keyed concurrency to prevent daily race | Custom date computation in the `concurrency:` block | Date is in the BRANCH NAME — runs across days CAN'T collide | The existing static `v40-cost-ledger-snapshot` group is sufficient; adding date coordinates would require shifting `SNAPSHOT_DATE` computation to a re-usable workflow input. |
| Scope-decision shell logic in diff-guard | New script in `scripts/` | Verbatim copy of the existing `Scope decision` step from lines 208-217 | Identical mechanism keeps the trust-invariant uniform — a future audit checks all 4 jobs have the same step. |
| Custom S13 rewrite | Re-architect the sed-based diff | Raise the `changedLines.length <= 4` ceiling to `<= 6` | The S13 algorithm is correct; the new push line just adds 2 more changed lines. Mechanical adjustment. |
| New Vitest dependency for assertions | npm install jest-extended or similar | Existing `expect().toContain(...)` + `expect().toMatch(/.../)` | Vitest 3.2.4 already on disk. No new deps. |

**Key insight:** Phase 57 is a 4-line code change (1 push line + 1 scope-decision step + 1 line of gating × 4 existing diff-guard steps if generalized; or 1 line of gating on the relevant subset) and 3 test assertion changes. The complexity is entirely in the SCOPE DISCIPLINE — proving you didn't touch `v40-auto-fix.yml`.

## Runtime State Inventory

> Phase 57 is a workflow refactor, not a rename. This section covers state that the BRANCH REDIRECT introduces or relocates.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — the ledger file `tests/e2e/.llm-spend-ledger.json` still ends up at the SAME repo-relative path; only the branch it lands on changes. The actual stored data unchanged. | None |
| Live service config | None — no n8n/Datadog/Tailscale references to the snapshot workflow's push target | None |
| OS-registered state | None — no Task Scheduler / pm2 / launchd tasks reference the snapshot workflow | None |
| Secrets/env vars | `SNAPSHOT_DATE` (workflow env, written at step "Capture snapshot summary" line 64). Read at line 90 (commit message), will be added at line 91 (push refspec). Same scope: in-workflow shell env. No secret rename. `GH_TOKEN` (line 39): unchanged, sources from `secrets.GITHUB_TOKEN`. | Verify `${{ env.SNAPSHOT_DATE }}` reference at line 91 is identical syntax to existing line 90 usage (it is in commit message: `\$${{ env.SPEND_USD }}` and `${{ env.SNAPSHOT_DATE }}`). Same expression form. |
| Build artifacts / installed packages | Accumulating `ledger-snapshots/daily-*` branches on origin — these are new persistent refs. Initial state: zero branches; after Phase 57 lands, +1 branch/day forever. Cleanup explicitly OUT OF SCOPE per CONTEXT.md. | None for Phase 57; track for future operator cleanup phase. |

**Specific verification:** After Phase 57 merges, the FIRST cron run on origin/main should produce `ledger-snapshots/daily-YYYY-MM-DD` on origin. `git ls-remote origin 'refs/heads/ledger-snapshots/*'` should return ≥1 ref. Old daily commits on `main` (from prior pre-Phase-50 cron successes) are preserved as historical state — they do NOT need rewriting.

## Common Pitfalls

### Pitfall 1: Refactoring `v40-auto-fix.yml` for "consistency" (LOAD-BEARING)

**What goes wrong:** The reviewer sees both `v40-cost-ledger-snapshot.yml` (line 91 push to main) and `v40-auto-fix.yml` (line 170 push to main) and thinks "uniform refactor — make both use ledger-snapshots/*."
**Why it happens:** Two ledger pushes look identical syntactically but serve different architectural purposes. The snapshot push is a daily heartbeat to a persistence target. The auto-fix push is a deliberate two-commit split that lands the ledger entry on main BEFORE the auto-fix PR is created, ensuring the PR diff doesn't include the ledger file (which would trip FORBIDDEN_PATHS regex 5 — `/^tests\/e2e\/\.llm-spend-ledger\.json$/`, empirically verified to match `tests/e2e/.llm-spend-ledger.json`).
**How to avoid:** Verification gate: `grep -c 'git push origin main' .github/workflows/v40-auto-fix.yml` returns `1`. Add this as a Vitest assertion in the same commit (S?? new). Add a "MUST NOT TOUCH" comment to the planner brief.
**Warning signs:** Any diff in `v40-auto-fix.yml` in the Phase 57 commit set. Any auto-fix PR rejected with `Diff-guard violations: tests/e2e/.llm-spend-ledger.json`.

### Pitfall 2: Diff-guard scope-decision step location

**What goes wrong:** Adding the scope-decision step to the WRONG job in `v40-verifier-gate.yml`.
**Why it happens:** Three of four jobs (verifier-gate at 208, regression-suite at 414, ready-flip at 514) already have the step. A naive grep `Scope decision` returns 3 hits. The natural conclusion: "all 4 jobs covered, nothing to do." But the diff-guard job (lines 65-183) is the first job and is the one that runs `scripts/check-diff-guard.mjs` — the EXACT step that rejects non-auto-fix PRs touching ledger files.
**How to avoid:** Explicit inventory: open `v40-verifier-gate.yml`, list the four top-level job names (`diff-guard`, `verifier-gate`, `regression-suite`, `ready-flip`), and confirm each contains a `Scope decision` step.
**Warning signs:** A ledger-snapshot PR opened by hand against main shows the diff-guard job FAILING with "Diff-guard violations: tests/e2e/.llm-spend-ledger.json".

### Pitfall 3: SNAPSHOT_DATE scope mismatch in concurrency block

**What goes wrong:** Trying to use `${{ env.SNAPSHOT_DATE }}` in the workflow-level `concurrency:` block.
**Why it happens:** SNAPSHOT_DATE is written to `$GITHUB_ENV` in a job step (line 64), which makes it available as an `env.*` expression in SUBSEQUENT steps of the same job. But the workflow-level `concurrency:` block evaluates at workflow-START time, before any job has run.
**How to avoid:** Keep the existing static group `v40-cost-ledger-snapshot`. If date-keying becomes necessary, derive from `github.event.schedule` or `github.run_id` (both available at workflow evaluation time) — NOT from env vars.
**Warning signs:** Workflow start error: `Invalid expression: env.SNAPSHOT_DATE is not defined`.

### Pitfall 4: S13 sed boundary creep

**What goes wrong:** Updating S13's `changedLines.length` ceiling without realizing the bare-vs-explicit `git push` change adds 2 changed lines (1 deletion of bare `git push` + 1 insertion of `git push origin HEAD:...`) on each SIDE of the diff. Total change: previous 4-line tolerance + 2 = 6.
**Why it happens:** The S13 test compares two sed-extracted blocks: the snapshot's `git config user.name`...`git push` block vs the digest's same range. Differences that already exist (git add path + commit message = 2 differences = 4 diff lines because `diff -u` shows both `-` and `+`). Adding the push-line difference increases this by 2.
**How to avoid:** Empirically test the ceiling. The new value `<= 6` matches the new count of changed lines. Run S13 locally after the change — if it fails with `expected 5 to be ≤ 4`, the ceiling needs raising.
**Warning signs:** S13 fails with `expected X to be ≤ 4` after Phase 57 commits; X is the new line count.

### Pitfall 5: Ledger-snapshots/* branch accumulation OOS but worth noting

**What goes wrong:** 365 daily branches/year accumulate on origin. Operator UI noise on the branches list. Not in Phase 57 scope per CONTEXT.md but worth flagging.
**Why it happens:** No cleanup automation in scope.
**How to avoid:** Phase 60+ candidate: add a weekly cron job that deletes `ledger-snapshots/daily-*` branches older than N days. NOT in Phase 57.
**Warning signs:** `git ls-remote origin 'refs/heads/ledger-snapshots/*' | wc -l` grows by ~1/day after Phase 57 lands. Expected — not a defect.

## Code Examples

### Example 1: New push line (COMMIT-01)

```yaml
# Source: .github/workflows/v40-cost-ledger-snapshot.yml line 91 (after Phase 57)
# Before:
#   git push
# After:
git push origin HEAD:ledger-snapshots/daily-${{ env.SNAPSHOT_DATE }}
```

### Example 2: Scope decision step + gating (COMMIT-02) — full diff-guard job head

```yaml
# Source: .github/workflows/v40-verifier-gate.yml (after Phase 57)
# Insert BEFORE the existing `- uses: actions/checkout@v4` at line 76.

  diff-guard:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    outputs:
      src_loc: ${{ steps.diff_size.outputs.src_loc }}
      tests_loc: ${{ steps.diff_size.outputs.tests_loc }}
    env:
      GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      PR_NUM: ${{ github.event.pull_request.number }}

    steps:
      # === NEW: Scope decision (verbatim from lines 208-217) ===
      - name: Scope decision (auto-fix/* PRs only; fast-path SUCCESS otherwise)
        id: scope
        if: github.event_name == 'pull_request'
        run: |
          if [[ "${{ github.head_ref }}" == auto-fix/* ]]; then
            echo "active=true" >> "$GITHUB_OUTPUT"
          else
            echo "active=false" >> "$GITHUB_OUTPUT"
            echo "Fast-path SUCCESS — non-auto-fix PR (head=${{ github.head_ref }})"
          fi

      # === Existing steps gated with the same condition used in verifier-gate ===
      - uses: actions/checkout@v4
        if: steps.scope.outputs.active == 'true' || github.event_name != 'pull_request'
        with:
          ref: ${{ github.event.pull_request.head.sha }}
          fetch-depth: 0

      - uses: actions/setup-node@v4
        if: steps.scope.outputs.active == 'true' || github.event_name != 'pull_request'
        with:
          node-version: 22
          cache: ${{ hashFiles('package-lock.json') != '' && 'npm' || '' }}

      - name: Install dependencies
        if: steps.scope.outputs.active == 'true' || github.event_name != 'pull_request'
        run: |
          if [ -f package-lock.json ]; then
            npm ci
          else
            npm install
          fi

      - name: Ensure human-review-required label exists
        if: steps.scope.outputs.active == 'true' || github.event_name != 'pull_request'
        run: |
          gh label create "human-review-required" \
            --color "d93f0b" \
            --description "Auto-fix PR requires human review (size cap, diff-guard, verifier, or regression rejection)" \
            --force 2>/dev/null || true

      # Diff-size cap step: KEEP existing `if:` at line 112 (already auto-fix-scoped).
      # Diff-guard regex bank step: line 139 — ADD `if: steps.scope.outputs.active == 'true' || github.event_name != 'pull_request'`
      # Test-count invariant step: KEEP existing `if:` at line 150 (already auto-fix-scoped).
      # Label + comment on rejection step: ADD `if: (steps.scope.outputs.active == 'true' || github.event_name != 'pull_request') && failure()`
```

**Researcher note on existing `if:` conditions:** Lines 112 and 150 already have `if: startsWith(github.head_ref, 'auto-fix/') || github.event_name != 'pull_request'`. The new scope-decision step makes that redundant. For minimal diff, the planner may leave those existing `if:` clauses in place — they evaluate equivalently. For symmetry with the verifier-gate/regression-suite/ready-flip pattern, the planner could replace them with `if: steps.scope.outputs.active == 'true' || github.event_name != 'pull_request'`. **Recommended:** leave them in place to minimize diff; just add the scope-decision step + gate the previously ungated steps (checkout, setup-node, install deps, label-ensure, regex bank, rejection comment). This keeps the change additive.

### Example 3: S13 test update (COMMIT-03)

```js
// Source: tests/e2e/scripts/v40-cost-ledger-snapshot-yaml.test.js
// Replace S8 with the strengthened positive assertion.
// Update S13 ceiling from 4 to 6.

  it('S8 — git push to ledger-snapshots/* branch (NO --force, NO direct push to main)', () => {
    // Phase 57 COMMIT-01: pushes land on ledger-snapshots/daily-${SNAPSHOT_DATE}
    // to comply with Phase 50 ruleset 17086676 which blocks direct-to-main pushes.
    expect(yaml).toContain('git push origin HEAD:ledger-snapshots/daily-${{ env.SNAPSHOT_DATE }}');
    expect(yaml).not.toMatch(/git push\s+--force/);
    expect(yaml).not.toMatch(/^\s*git push\s*$/m);  // no bare `git push` line anywhere
  });

  // ... existing S13a-S17 unchanged ...

  it('S13 — verbatim-block parity with e2e-weekly-digest.yml (modulo git add path + commit message + git push line)', () => {
    // Promotes must_haves.truth#3 from documentation to an automated gate.
    // Phase 57: the new `git push origin HEAD:ledger-snapshots/...` line differs
    // from the digest's bare `git push`, contributing 2 additional changed lines
    // (1 on each side of the diff). Ceiling raised from 4 to 6.
    const sedCmd = "sed -n '/git config user.name/,/git push/p'";
    let diffOutput = '';
    try {
      execSync(
        `diff <(${sedCmd} ${YAML_PATH}) <(${sedCmd} ${DIGEST_YAML_PATH})`,
        { shell: '/bin/bash', encoding: 'utf8' },
      );
    } catch (err) {
      diffOutput = err.stdout || '';
    }
    const changedLines = diffOutput
      .split('\n')
      .filter((line) => /^[-+][^-+]/.test(line));
    // Allow up to 6 changed lines: 3 lines × 2 sides of diff (git add path + commit message + git push refspec).
    expect(changedLines.length).toBeLessThanOrEqual(6);
  });
```

### Example 4: Defensive new assertion pinning Pitfall 1 (COMMIT-04 verification)

```js
// New test added to the SAME file (or a sibling file — planner picks)
// Pinning the v40-auto-fix.yml byte-unchanged invariant.

import { execSync } from 'node:child_process';

describe('Phase 57 invariants', () => {
  it('COMMIT-04 — v40-auto-fix.yml retains EXACTLY ONE `git push origin main` (Pitfall 1)', () => {
    // The two-commit split in v40-auto-fix.yml is LOAD-BEARING:
    // the direct-to-main commit lands the ledger entry on main BEFORE the
    // auto-fix PR branch is created, ensuring the PR diff is clean against
    // FORBIDDEN_PATHS regex 5 (tests/e2e/.llm-spend-ledger.json). Phase 57
    // explicitly does NOT touch this file; any future refactor that adds a
    // second `git push origin main` (or removes the one at ~line 170)
    // collapses Pitfall 1's defense.
    const out = execSync(
      "grep -c 'git push origin main' .github/workflows/v40-auto-fix.yml",
      { encoding: 'utf8' },
    ).trim();
    expect(out).toBe('1');
  });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Daily cron pushes ledger directly to `main` (line 91 bare `git push`) | Daily cron pushes to `ledger-snapshots/daily-${SNAPSHOT_DATE}` | Phase 57 (2026-06-04 → 2026-06-05) | Phase 50 ruleset (since 2026-06-03) blocks direct-to-main; this restores the daily heartbeat. |
| Diff-guard runs on ALL PRs into main | Diff-guard runs only for `auto-fix/*` PRs; fast-paths SUCCESS for others | Phase 57 COMMIT-02 | Removes false rejection of legitimate non-auto-fix PRs (e.g., milestone-close PRs containing ledger updates would previously fail at FORBIDDEN_PATHS regex 5). |
| `pull_request: { branches: ['auto-fix/*'] }` (BASE-ref filter — wrong; this filters by PR target, not source) | `pull_request: { types: [opened, synchronize, reopened] }` (no `branches:` filter; head_ref check via scope-decision shell step) | Phase 51.1 (commit ea45a47, 2026-06-03) | Verifier-gate now fires on ALL PRs into main, with scope-decision determining whether to actually run. Confirmed by reading lines 44-46 of the current file. |

**Deprecated/outdated:**
- Bare `git push` in `v40-cost-ledger-snapshot.yml:91` — broken under ruleset 17086676.
- The S13 `<= 4` changed-lines ceiling — needs to become `<= 6` post Phase 57.

## Assumptions Log

> All claims tagged `[ASSUMED]` in this research. Empty table = all claims verified.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The `ci.yml` workflow runs on `push` to any branch (so `[skip ci]` is needed on the new `ledger-snapshots/*` push too) | "Anti-Patterns to Avoid" — `[skip ci]` marker rationale | LOW — `[skip ci]` is already in the existing commit-message line 90 (LOAD-BEARING per S7). Phase 57 does not change line 90. If `ci.yml` actually only triggers on `main`, the marker is still harmless. Worth a planner check: `grep -A3 '^on:' .github/workflows/ci.yml` — but does not block Phase 57. |
| A2 | `ledger-snapshots/*` branch creation has no ruleset blocking it | "Pattern 1" + "Step 8 in Bash audit below" | LOW — directly verified via `gh api repos/:owner/:repo/rulesets/17086676`: conditions are `ref_name.include: ["~DEFAULT_BRANCH"]` only. No other rulesets exist (single-entry array from `gh api .../rulesets`). |
| A3 | The `actions/checkout@v4` default `persist-credentials: true` + workflow `permissions: contents: write` is sufficient to push to a NEW branch | "Standard Stack" + Example 1 | LOW — same auth pattern that currently pushes (failingly) to `main` in line 91 has `contents: write` granted; branch creation requires the same permission level. Confirmed by GitHub Actions docs and by the fact that `actions/checkout@v4` line 42 already has no explicit `persist-credentials:` override (default `true`). |

## Open Questions

1. **Should the planner add a NEW Vitest test for the diff-guard scope-decision step in `v40-verifier-gate.yml`?**
   - What we know: COMMIT-02 adds the step; without a pin, a future refactor could remove it.
   - What's unclear: Whether the test belongs in the existing `v40-verifier-gate-yaml.test.js` file (which has pre-existing failures per Phase 51.1 closure) or a new file.
   - Recommendation: Add the assertion to the existing file. Phase 60 CLEAN-02 will fix that file's pre-existing failures; pinning the diff-guard step is a single `expect(yaml).toMatch(/Scope decision \(auto-fix\/\* PRs only/)` that should not interact with the pre-existing failures. Alternative: add the pin to the snapshot YAML test file as a cross-workflow assertion — slightly unusual but contained.

2. **Should COMMIT-03 also add a positive assertion that the NEW `git push origin HEAD:...` includes `${{ env.SNAPSHOT_DATE }}` (not a literal date)?**
   - What we know: The intent is per-day branches.
   - What's unclear: Whether to pin only the prefix or the full templated form.
   - Recommendation: Pin the prefix `'git push origin HEAD:ledger-snapshots/daily-${{ env.SNAPSHOT_DATE }}'` exactly (as shown in Example 3). This catches both regression directions (constant date AND missing prefix).

3. **Will the operator manually merge ledger-snapshot PRs, or will accumulating dangling branches be the steady state?**
   - What we know: CONTEXT.md says periodic cleanup is OOS; ROADMAP success criterion 1 says branches accumulate.
   - What's unclear: Whether the snapshot is ALSO supposed to be reachable from `main` (e.g., for the dashboard to consume historical entries).
   - Recommendation: For Phase 57, treat branches as terminal artifacts (never merged). The committed ledger on the branch is itself queryable via `git show ledger-snapshots/daily-YYYY-MM-DD:tests/e2e/.llm-spend-ledger.json`. UAT-47-d in Phase 59 can validate this assumption empirically. The dashboard regenerates from the most-recent ledger at snapshot time and writes to `docs/v40-ledger-dashboard.md` — but that file also lives on the branch, NOT on main. **The planner should flag this for the operator** — if the dashboard is supposed to be visible on main, an additional PR-back-to-main step is needed (different scope; not COMMIT-01..04).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `git` (runner-bundled) | push refspec change | ✓ | ≥2.40 | — |
| `bash` (runner-bundled) | scope-decision shell step | ✓ | 5+ | — |
| Node 22 (`actions/setup-node@v4`) | unchanged | ✓ | 22 | — |
| Vitest (npm dep) | S13 test execution | ✓ | 3.2.4 (resolved from `^3.0.0`) | — |
| `gh` CLI (runner-bundled) | for new ruleset/branch checks (planner only; no runtime use) | ✓ | runner default | — |
| GitHub Actions runner `ubuntu-latest` | workflow execution | ✓ | — | — |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3.2.4 (resolved from `^3.0.0` in package.json) |
| Config file | `vitest.config.js` (project default; not modified by Phase 57) |
| Quick run command | `npx vitest run tests/e2e/scripts/v40-cost-ledger-snapshot-yaml.test.js` |
| Full suite command | `npm test` (runs `npm run build && npm run test:src && npm run test:chrome && npm run test:firefox && npm run lint && npm run test:lint`) |
| S13-suite baseline timing | 127ms (18 tests, verified at research time) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| COMMIT-01 | Push line uses `ledger-snapshots/daily-${{ env.SNAPSHOT_DATE }}` | unit (Vitest grep) | `npx vitest run tests/e2e/scripts/v40-cost-ledger-snapshot-yaml.test.js -t 'S8'` | ✅ (file exists; S8 needs body rewrite) |
| COMMIT-02 | `v40-verifier-gate.yml` diff-guard job has Scope decision step | unit (Vitest grep on YAML) | New assertion in same file OR `v40-verifier-gate-yaml.test.js` | ⚠️ Pre-existing failures in `v40-verifier-gate-yaml.test.js` (Phase 51.1 unfinished; Phase 60 CLEAN-02 will fix). Adding to the snapshot file is safer. |
| COMMIT-03 | S13 ceiling raised to 6; new positive assertion present | unit (Vitest) | `npx vitest run tests/e2e/scripts/v40-cost-ledger-snapshot-yaml.test.js -t 'S13'` | ✅ |
| COMMIT-04 | `grep -c 'git push origin main' .github/workflows/v40-auto-fix.yml` == 1 | unit (Vitest execSync) | New assertion (Example 4 above) | ❌ Needs to be authored |

### Sampling Rate

- **Per task commit:** `npx vitest run tests/e2e/scripts/v40-cost-ledger-snapshot-yaml.test.js` (≤ 150ms)
- **Per wave merge:** `npx vitest run tests/e2e/scripts/` (covers all yaml-contract tests; ≤ 5s expected; note: `v40-verifier-gate-yaml.test.js` has known pre-existing failures unrelated to Phase 57 — planner must whitelist or note these)
- **Phase gate:** `npm test` full suite green before `/gsd:verify-work` — modulo the documented Phase 51.1 pre-existing failures in `v40-verifier-gate-yaml.test.js` (per STATE.md Phase 51.1 closure: "v40-verifier-gate-yaml.test.js V2 (Phase 51.1 unfinished test update)") and `llm-ledger.test.js` Test 48 (closed in Phase 56). If Phase 56 LEDGER-03 already shipped, Test 48 is now green.

### Wave 0 Gaps

- [ ] `tests/e2e/scripts/v40-cost-ledger-snapshot-yaml.test.js` S8 body rewrite — covers COMMIT-01.
- [ ] `tests/e2e/scripts/v40-cost-ledger-snapshot-yaml.test.js` S13 ceiling raise — covers COMMIT-03.
- [ ] `tests/e2e/scripts/v40-cost-ledger-snapshot-yaml.test.js` new `Phase 57 invariants` describe block (1 assertion for COMMIT-02 + 1 for COMMIT-04) — covers COMMIT-02 and COMMIT-04.
- [ ] Framework install: NONE — Vitest 3.2.4 already present.

## Security Domain

> security_enforcement defaults to enabled (config.json absent the key). Phase 57 is a low-risk surface (YAML refactor + test assertion changes), but ASVS coverage applied for due diligence.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No new auth surface |
| V3 Session Management | no | No sessions |
| V4 Access Control | yes | GitHub ruleset 17086676 enforces `pull_request: { required_approving_review_count: 1, required_code_owner_review: true }` on main; `required_status_checks: [verifier-gate, deps-update-gate]`; `bypass_actors: []`. Phase 57 does NOT loosen these. |
| V5 Input Validation | yes | `${{ env.SNAPSHOT_DATE }}` is derived from `currentIsoDay()` in `tests/e2e/lib/llm-ledger.js` — pure date computation, no user input. The env-var-hop via `$GITHUB_ENV` (line 64) is the CWE-94 defense pattern already established in the codebase (Phase 40-03 CR-02). |
| V6 Cryptography | no | No crypto operations |

### Known Threat Patterns for {GitHub Actions / YAML workflow}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Command injection via `${{ ... }}` interpolation into `run:` body (CWE-94) | Tampering | Use `env:` block + `$ENV_VAR` shell expansion. The Phase 57 new line uses `${{ env.SNAPSHOT_DATE }}` directly in a refspec — SAFE because `SNAPSHOT_DATE` is computed from `currentIsoDay()` (deterministic ISO-8601 string, no special characters), not user input. Matches existing pattern at line 90. |
| `[skip ci]` bypass causing infinite cron loop | Denial of Service (self-DoS) | LOAD-BEARING `[skip ci]` marker pinned in S7 — unchanged in Phase 57. |
| Branch creation as a foothold for malicious workflows | Tampering / Privilege Escalation | The new `ledger-snapshots/*` branches contain ONLY committed-ledger updates. They are NOT referenced by any workflow's `branches:` trigger filter (verified by `grep -rE '^\s*-\s*ledger-snapshots' .github/workflows/` — 0 hits). A workflow_dispatch attacker could not weaponize these branches. |
| Forced push overwriting branch history | Tampering | S8 negative assertion `not.toMatch(/git push\s+--force/)` — preserved. |
| Token-permission overflow (workflow gains write to issues/pull-requests when it should not) | Privilege Escalation | S3 + S17 enforce `contents: write` ONLY in `v40-cost-ledger-snapshot.yml`. Phase 57 does NOT add new permissions. |

## Project Constraints (from CLAUDE.md)

`CLAUDE.md` contents:

> **CRITICAL: Answer verification after every AskUserQuestion call.** Verify the tool result contains the user's actual selection. Do not assume, guess, or fabricate. Re-prompt as numbered plain-text list on failure.

**Applicability to Phase 57:** No interactive `AskUserQuestion` calls expected in Phase 57 — it is an infrastructure refactor with CONTEXT.md already locking decisions. The constraint applies only if the planner introduces a discretion-time question (e.g., "Should we add the cleanup cron?"). If so, follow the protocol.

No other CLAUDE.md directives.

## Sources

### Primary (HIGH confidence)

- Direct read: `.github/workflows/v40-cost-ledger-snapshot.yml` (full file, 91 lines) — push line 91, env scope, concurrency block, permissions, dashboard regen step at 70-77, capture summary at 51-68
- Direct read: `.github/workflows/v40-verifier-gate.yml` (full file, 644 lines) — diff-guard job 65-183 confirmed NO scope-decision step; verifier-gate scope step at 208-217; regression-suite scope step at 414-423; ready-flip scope step at 514-523; pull_request trigger 44-46 has no branches: filter (Phase 51.1 commit ea45a47 confirmed)
- Direct read: `.github/workflows/v40-auto-fix.yml` (lines 1-75 + 140-188) — two-commit-split header 1-39, concurrency 49-51, permissions 53-56, ledger-commit step 150-172 with `git push origin main` at line 170 (the unique occurrence)
- Direct read: `.github/workflows/e2e-weekly-digest.yml` (lines 85-110) — sibling pattern S13 byte-compares against; bare `git push` at line 110
- Direct read: `tests/e2e/scripts/v40-cost-ledger-snapshot-yaml.test.js` (full file, 210 lines) — 18 test cases enumerated; S8 (line 96-99) bare-push assertion; S13 (line 175-208) sed-driven byte-parity diff with `<= 4` ceiling
- Direct read: `scripts/check-diff-guard.mjs` (full file, 107 lines) — FORBIDDEN_PATHS bank with 8 entries; regex 5 is `/^tests\/e2e\/\.llm-spend-ledger\.json$/`
- Direct read: `.planning/REQUIREMENTS.md` (138 lines) — COMMIT-01..04 spec, OOS Pitfall 1 pin
- Direct read: `.planning/research/PITFALLS.md` lines 11-49 (Pitfall 1) and 51-85 (Pitfall 2)
- Direct read: `.planning/research/SUMMARY.md` lines 20-58 (Tensions 1, 2, 3); lines 113-130 (architecture summary)
- Direct read: `.planning/phases/57-ledger-commit-branch-redirect/57-CONTEXT.md` (full)
- Direct read: `.planning/STATE.md` lines 6-72 (Phase 50 + 51 + 51.1 + 53 closure notes)
- Direct read: `.planning/config.json` — nyquist_validation true; security_enforcement key absent (default-enabled)
- `gh api repos/:owner/:repo/rulesets` — confirms single ruleset 17086676 targeting `~DEFAULT_BRANCH` only
- `gh api repos/:owner/:repo/rulesets/17086676` — full rules JSON: deletion, non_fast_forward, required_linear_history, pull_request (1 review + code-owner), required_status_checks (verifier-gate + deps-update-gate); `bypass_actors: []`; `current_user_can_bypass: never`
- `gh api repos/:owner/:repo/branches/main/protection` — returns 404 (no legacy branch protection; only ruleset)
- Empirical: `node -e "FORBIDDEN_PATHS.test('tests/e2e/.llm-spend-ledger.json')"` — confirms regex 5 hits
- Empirical: `grep -c 'git push origin main' .github/workflows/v40-auto-fix.yml` returns `1` — baseline confirmed
- Empirical: `npx vitest run tests/e2e/scripts/v40-cost-ledger-snapshot-yaml.test.js` — 18/18 pass in 127ms (baseline before Phase 57 changes)
- Empirical: `package.json` grep — Vitest at `^3.0.0`, runtime resolves to 3.2.4

### Secondary (MEDIUM confidence)

- GitHub Actions docs for `git push origin HEAD:<branch>` refspec — standard pattern; verified via existing repo usage and external docs context
- GitHub Actions `concurrency:` scope rules (workflow-level evaluates at start, env vars not in scope) — standard knowledge; verified by GH Actions documentation

### Tertiary (LOW confidence)

- None — all Phase 57 findings grounded in HIGH or MEDIUM sources.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages already on disk; versions verified live
- Architecture: HIGH — all 4 jobs in verifier-gate inventoried; scope-decision absence in diff-guard empirically confirmed by full file read
- Pitfalls: HIGH — Pitfall 1 mechanism empirically verified (regex 5 matches the canonical path); ruleset details verified via gh api
- Concurrency / SNAPSHOT_DATE scope: HIGH — direct file read of lines 27-29 (concurrency block), 38-39 (job env), 64 (SNAPSHOT_DATE write), 90 (existing read), confirms scope semantics
- S13 contract impact: HIGH — sed-pattern algorithm fully understood; ceiling calculation `<= 6` is mechanically correct (3 differences × 2 sides of unified diff)

**Research date:** 2026-06-04
**Valid until:** 2026-07-04 (30 days — Phase 57 is a stable infrastructure refactor; no fast-moving deps. Re-validate after any change to ruleset 17086676, `v40-verifier-gate.yml` triggers, or the S13 test file structure.)

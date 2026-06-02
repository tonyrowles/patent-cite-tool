# Phase 43: v40-auto-fix.yml Workflow + Draft PR Creation — Research

**Researched:** 2026-05-31
**Domain:** GitHub Actions workflow infrastructure — `issues.labeled('triage')` → dispatcher → ledger self-commit → `peter-evans/create-pull-request@v8` draft PR
**Confidence:** HIGH (entire stack is internal — every primitive already lives in the repo; the workflow is a wiring exercise, not a discovery exercise)

## Summary

Phase 43 lifts Phase 42's CI-validated `scripts/auto-fix.mjs` dispatcher into a GitHub Actions workflow triggered by `issues.labeled` filtered to the `triage` label. The dispatcher already produces a local branch + staged commit under `--no-push`; the workflow's job is to (a) gate the trigger on prereqs (secret present, ERROR_CLASS label present), (b) invoke the dispatcher, (c) **split the ledger commit from the auto-fix diff commit** so Phase 41's diff-guard regex bank does not reject the resulting PR, (d) hand the now-clean working tree to `peter-evans/create-pull-request@v8` for atomic branch + draft PR creation, and (e) label the source issue + cross-link.

The single non-obvious architectural decision is the **two-commit split** required by Phase 41's diff-guard, which rejects any diff touching `tests/e2e/.llm-spend-ledger.json`. The dispatcher writes to that path. If the ledger update goes into the PR commit, the verifier-gate that triggers on the auto-fix PR will reject it. Resolution: a separate `[skip ci]` self-commit to `main` (verbatim copy of `e2e-weekly-digest.yml:98-110` + `v40-cost-ledger-snapshot.yml:70-82`) BEFORE `peter-evans/cpr@v8` runs. By the time `cpr@v8` sees the working tree, only the auto-fix diff is dirty.

**Primary recommendation:** ONE plan (single workflow + tests + tiny optional PR-body helper) — tightly cohesive; the dispatcher contract is already 122-test-validated, leaving only the workflow YAML + ~20 YAML grep cases. The PR-body builder helper is small enough to live in-workflow as a bash HEREDOC OR as a 30-LOC `scripts/build-auto-fix-pr-body.mjs` (recommend the script for Vitest testability — cost: 1 extra file, gain: 4-5 Vitest cases that pin PR-body format).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **Workflow file:** `.github/workflows/v40-auto-fix.yml` (v40-* namespace).
- **Trigger:** `on: { issues: { types: [labeled] } }` with an `if: github.event.label.name == 'triage'` filter at the job level. (The `types: [labeled]` event fires for ALL label adds; the if filter narrows.)
- **Permissions:** `contents: write` (for `peter-evans/create-pull-request@v8` to push the branch), `pull-requests: write` (to open the draft PR + add labels), `issues: read` (to read the issue body via `gh issue view` inside the dispatcher).
- **Concurrency:** `concurrency: {group: v40-auto-fix-${{ github.event.issue.number }}, cancel-in-progress: false}` — per-issue serialization with NO mid-flight cancellation (cost protection: LLM call already in-flight should complete and ledger; the AUTOFIX-04 `git ls-remote` idempotency handles double-trigger).
- **`peter-evans/create-pull-request@v8`** with: `token: ${{ secrets.GITHUB_TOKEN }}` (NO PAT), `draft: true`, `branch: auto-fix/${{ github.event.issue.number }}-<fp8>` (the dispatcher computes fp8 and the workflow reads it from a step output), `delete-branch: false` (auto-fix branches stick around — Phase 44's auto-promote needs them), `commit-message:` includes the fingerprint + issue number, `title: 'auto-fix: <ERROR_CLASS> for <case-id>'`, `body:` constructed in a prior step (HEREDOC including the `<!-- affected_cases -->` comment).
- **Workflow steps (sequential within job `auto-fix`):**
  1. `actions/checkout@v4` (full history needed for `git apply --check` against main)
  2. `actions/setup-node@v4` with `node-version: 22` literal (NOT `.nvmrc`)
  3. `npm ci --no-audit --no-fund` (no node_modules in checkout)
  4. `gh issue view <issue-n>` (inside `node scripts/auto-fix.mjs --issue <n> --force-api`) — the dispatcher does this
  5. `node scripts/auto-fix.mjs --issue ${{ github.event.issue.number }} --force-api --no-push` — produces the local branch + staged commit
  6. Compute branch name + body from dispatcher stdout (the dispatcher prints them per Phase 42 Plan 02 contract — `branch staged locally; push manually with: git push -u origin auto-fix/<n>-<fp8>` line is grep-able)
  7. `peter-evans/create-pull-request@v8` with the computed branch + body
  8. Add `auto-fix:opened` label via `gh issue edit <pr-num> --add-label auto-fix:opened` (idempotent label-create-if-missing first)
- **Failure modes:**
  - Dispatcher exit 1 (apply-check/diff-guard/malformed): workflow fails; gh comment on source issue with the dispatcher's stderr last 20 lines; NO PR opened
  - Dispatcher exit 2 (arg/contract): workflow fails; should not happen in practice
  - Dispatcher exit 3 (cap reached): workflow exits 0 cleanly (the dispatcher already added `human-review-required` to the source issue + posted the cap-reached comment); NO PR opened
  - Cap-blocked at the SDK driver level (per-day/per-issue/per-PR cap from Phase 39): dispatcher's `cap_blocked` error path; workflow exits 0 with a comment
- **Required-status-check coordination:** Phase 43 does NOT touch the v4.0-main-protection ruleset. The auto-fix workflow's PRs land on `auto-fix/*` branches; Phase 41's `verifier-gate` triggers on those PRs (ADVISORILY — Phase 47 binds it as a required check).
- **`secrets.GITHUB_TOKEN` only** — no PATs. The `peter-evans/create-pull-request@v8` action handles auth.
- **No `[skip ci]` in auto-fix commits** — these ARE PR commits, not self-commits; the verifier-gate must run on them. (NOTE: the LEDGER commit IS a self-commit and DOES use `[skip ci]` — see Architecture Patterns.)

### Claude's Discretion (with recommended defaults)

- Whether to fail-fast on missing `ANTHROPIC_API_KEY` (set as a repo secret) at the start of the workflow vs let the dispatcher fail later — **fail-fast at workflow start** (cleaner error message).
- Whether to gate the workflow on the source issue having a recognized ERROR_CLASS label (so a manual `triage` add without ERROR_CLASS doesn't burn SDK budget) — **YES**, add a pre-step that reads issue labels and skips if no ERROR_CLASS label present.
- Whether the workflow comments on the source issue when it CREATES the PR (cross-link) — **YES**, mirror v3.1 cross-link pattern.
- Test file naming: `tests/e2e/scripts/v40-auto-fix-yaml.test.js` (mirror Phase 40-03 + Phase 41-03 patterns).
- Number of YAML test cases: ~18-22 (load-bearing primitives + forbidden-token negative grep + comment-paraphrase discipline).

### Deferred Ideas (OUT OF SCOPE)

- Auto-merge of auto-fix PRs — explicitly OUT OF SCOPE per REQUIREMENTS.md.
- Per-error-class workflow specialization — one workflow handles all ERROR_CLASSes via dispatcher routing.
- Cross-issue fix batching — one issue per workflow invocation.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUTOFIX-02 | `.github/workflows/v40-auto-fix.yml` triggers on `issues.labeled` filtered to `triage`; uses `peter-evans/create-pull-request@v8` to atomically branch (`auto-fix/<issue-n>-<fp8>`), commit, push, and open the PR with `--draft`; PR body includes the `<!-- affected_cases: id1,id2 -->` HTML comment for downstream parsers | Standard Stack §peter-evans/cpr@v8 verified version + minimal call signature; Architecture Patterns §Two-commit split for ledger-vs-PR-diff separation; Architecture Patterns §Step ordering; Code Examples §PR body HEREDOC + scripts/build-auto-fix-pr-body.mjs helper; Pitfall §`issues.labeled` job-level filter — workflow has no built-in label-name filter |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Issue label trigger filter | GitHub Actions workflow `on:` block + job `if:` | — | `issues.labeled` event has no built-in label-name filter at workflow level; must filter at job level |
| Fail-fast on missing secret | Workflow step (bash assertion) | — | Catches misconfiguration before any compute spend; cheap |
| ERROR_CLASS pre-check | Workflow step (`gh issue view --jq`) | — | Avoids burning SDK budget on a manual `triage` add without a routable ERROR_CLASS label |
| LLM dispatcher invocation | `node scripts/auto-fix.mjs` (existing Phase 42 binary) | — | Lifts the 122-test-validated dispatcher verbatim; workflow is the host, not the implementor |
| Ledger update (write to disk) | Phase 42 dispatcher (already implemented) | — | The dispatcher calls `appendLedgerEntry`; workflow does not re-do this |
| **Ledger commit (separate from PR diff)** | Workflow bash step → direct push to `main` via `secrets.GITHUB_TOKEN` with `[skip ci]` | — | **Load-bearing isolation** — Phase 41 diff-guard rejects PRs touching ledger; the ledger commit MUST happen before `cpr@v8` snapshots the working tree |
| Branch creation + atomic PR open | `peter-evans/create-pull-request@v8` action | — | Single-purpose action with idempotent branch+commit+push+open semantics; established repo standard (Phase 40-03 + 39 + 47 future) |
| PR body composition | Optional `scripts/build-auto-fix-pr-body.mjs` helper OR inline HEREDOC | Workflow bash step | Helper makes the format Vitest-testable; HEREDOC saves a file but loses test coverage |
| Source-issue cross-link comment | Workflow `gh issue comment` step | — | Mirrors v3.1 cross-link pattern; uses the PR URL returned by `cpr@v8` |
| Add `auto-fix:opened` label | Workflow `gh issue edit --add-label` step | — | Idempotent label-create-if-missing first (Phase 41 `e2e-nightly.yml:97-102` pattern) |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `peter-evans/create-pull-request` | `@v8` | Atomic branch + commit + push + draft PR open | Phase 40-03 + 39 establish this as the repo standard; `concepts-guidelines.md` documents secure auth + workflow-trigger behavior — `[CITED: github.com/peter-evans/create-pull-request]` |
| `actions/checkout` | `@v4` | Full-history checkout | Repo standard across every workflow (`e2e-nightly.yml`, `v40-deps-update.yml`, `v40-verifier-gate.yml`, `v40-cost-ledger-snapshot.yml`) — `[VERIFIED: codebase grep]` |
| `actions/setup-node` | `@v4` with `node-version: 22` literal | Node toolchain | Repo standard (no `.nvmrc`); matches `e2e-nightly.yml` + Phase 40/41 workflows — `[VERIFIED: codebase grep]` |
| `node` v22 | runtime | dispatcher + helper | matches dispatcher's declared Node version — `[VERIFIED: package.json + workflow precedent]` |
| `scripts/auto-fix.mjs` | Phase 42 | dispatcher (`--issue <n> --force-api --no-push`) | THE binary this workflow exists to invoke; CLI contract pinned by 42-02-SUMMARY.md — `[VERIFIED: codebase + 122 passing Vitest cases]` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `gh` CLI | bundled in `ubuntu-latest` runner | `gh issue view`, `gh issue edit`, `gh issue comment`, `gh label create --force` | Every interaction with GitHub API beyond `cpr@v8`'s scope — `[VERIFIED: ubuntu-latest image manifest]` |
| `vitest` | already in repo | YAML grep-based contract tests | Repo standard — Phase 40-03 ships `tests/e2e/scripts/v40-deps-update-yaml.test.js`; Phase 41-03 ships `tests/e2e/scripts/v40-verifier-gate-yaml.test.js` — `[VERIFIED: codebase grep]` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `peter-evans/cpr@v8` | Manual `git push` + `gh pr create --draft` | Loses idempotency on re-trigger (cpr@v8 updates the branch in place; manual path requires explicit `git push --force-with-lease` + `gh pr edit`); diverges from repo standard. **Rejected.** |
| Inline bash HEREDOC for PR body | `scripts/build-auto-fix-pr-body.mjs` helper (~30 LOC) | HEREDOC: no extra file, no test surface, format invisible to regression. Helper: 4-5 Vitest cases pin the format + future-proof against drift. **Recommend helper** unless plan budget is tight. |
| `gh pr create --draft` from a `run:` step | `peter-evans/cpr@v8` | Loses `cpr@v8`'s atomic branch-create-or-update semantics; requires hand-rolling the `git ls-remote` idempotency check that the action already provides. **Rejected.** |
| `dorny/paths-filter` to gate on issue label | Job-level `if:` expression | `paths-filter` is for file paths, not issue label names. Job-level `if: github.event.label.name == 'triage'` is the canonical pattern — `[CITED: docs.github.com/actions/using-workflows/triggering-a-workflow#issues]`. **Rejected.** |

**Installation:**
```bash
# Zero new npm dependencies.
# Workflow uses peter-evans/create-pull-request@v8 + actions/checkout@v4 +
# actions/setup-node@v4 — all already pinned by Phase 39 + 40 + 41 workflows.
```

**Version verification:**
```bash
# peter-evans/create-pull-request@v8 — used in v40-deps-update.yml (Phase 40-03);
# no version drift needed — same major.
grep -h "peter-evans/create-pull-request@" .github/workflows/*.yml | sort -u
# Expected output: peter-evans/create-pull-request@v8

# actions/checkout@v4, actions/setup-node@v4 — used in every workflow.
grep -h "actions/checkout@\|actions/setup-node@" .github/workflows/*.yml | sort -u
```

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `peter-evans/create-pull-request@v8` | GitHub Marketplace Action | 7+ years | Top-50 most-used GitHub Action | github.com/peter-evans/create-pull-request | n/a (action, not pkg) | Approved (already in repo via Phase 40-03) |
| `actions/checkout@v4` | GitHub-official | n/a | Universal | github.com/actions/checkout | n/a | Approved (repo standard) |
| `actions/setup-node@v4` | GitHub-official | n/a | Universal | github.com/actions/setup-node | n/a | Approved (repo standard) |

**Packages removed due to slopcheck [SLOP] verdict:** none — Phase 43 adds **zero new npm dependencies**. The workflow re-uses three GitHub Actions already pinned in the repo's other v40-* workflows. slopcheck targets npm/PyPI/cargo packages; GitHub Actions are not in its scope. No verification gate required.

**Packages flagged as suspicious [SUS]:** none.

## Architecture Patterns

### System Architecture Diagram

```
                  ┌────────────────────────────────────┐
                  │ GitHub issue gets `triage` label   │
                  │ (by hand OR by v3.1 triage-classifier
                  │  workflow that fires automatically) │
                  └─────────────────┬──────────────────┘
                                    │
                                    ▼ (issues.labeled event)
                  ┌────────────────────────────────────┐
                  │ v40-auto-fix.yml workflow triggers │
                  │ Concurrency: per-issue-number,     │
                  │ cancel-in-progress: false          │
                  └─────────────────┬──────────────────┘
                                    │
                                    ▼
                  ┌────────────────────────────────────┐
                  │ Job-level if:                      │
                  │   github.event.label.name=='triage'│
                  └─────────────────┬──────────────────┘
                                    │  (other labels: no-op)
                                    ▼
        ┌───────────────────────────────────────────────────┐
        │ STEP 1  fail-fast: ANTHROPIC_API_KEY present?     │
        └────────────────────────┬──────────────────────────┘
                                 │  (missing: comment on issue + exit 1)
                                 ▼
        ┌───────────────────────────────────────────────────┐
        │ STEP 2  ERROR_CLASS pre-check:                    │
        │   gh issue view <n> --jq '[.labels[].name]'       │
        │   bail out (exit 0 + comment) if no ERROR_CLASS   │
        │   label intersects RECOGNIZED_LABELS set          │
        └────────────────────────┬──────────────────────────┘
                                 │  (saves ~$0.05-0.15 of SDK budget on each
                                 │   bare `triage`-add without classification)
                                 ▼
        ┌───────────────────────────────────────────────────┐
        │ STEP 3  actions/checkout@v4 + setup-node@v4 + npm ci │
        └────────────────────────┬──────────────────────────┘
                                 │
                                 ▼
        ┌───────────────────────────────────────────────────┐
        │ STEP 4  node scripts/auto-fix.mjs --issue <n>     │
        │              --force-api --no-push                │
        │                                                   │
        │   Dispatcher (Phase 42):                          │
        │     - reads issue via `gh issue view`             │
        │     - extracts fingerprint + ERROR_CLASS          │
        │     - cap check (AUTOFIX-05) → exit 3 OR continue │
        │     - git ls-remote idempotency (AUTOFIX-04)      │
        │     - calls invokeAnthropicSdkWithLedger          │
        │       → WRITES TO tests/e2e/.llm-spend-ledger.json│
        │     - validates diff (diff-guard + apply --check) │
        │     - git checkout -b auto-fix/<n>-<fp8>          │
        │     - git commit -am "Fix #<n>: <ERROR_CLASS>"    │
        │     - prints branch name + body hint to stdout    │
        │     - exits WITHOUT pushing                       │
        │                                                   │
        │   Capture branch name from stdout:                │
        │     BRANCH=$(... | grep -oP 'auto-fix/\d+-[0-9a-f]{8}') │
        └────────────────────────┬──────────────────────────┘
                                 │
                                 ▼
        ┌───────────────────────────────────────────────────┐
        │ STEP 5  LEDGER SELF-COMMIT to main                │
        │   (load-bearing isolation — Phase 41 diff-guard   │
        │    rejects PRs touching the ledger path)          │
        │                                                   │
        │   git checkout main && git pull --ff-only         │
        │     (we need to commit-to-main but currently      │
        │      sit on auto-fix/<n>-<fp8>)                   │
        │   git add tests/e2e/.llm-spend-ledger.json        │
        │   git diff --cached --quiet || git commit \       │
        │     -m "[skip ci] ledger: auto-fix issue-<n>"     │
        │   git push origin main                            │
        │   git checkout auto-fix/<n>-<fp8>                 │
        │   git rebase main  # bring auto-fix branch up to  │
        │                    # main HEAD so cpr@v8 only sees│
        │                    # the auto-fix diff            │
        └────────────────────────┬──────────────────────────┘
                                 │
                                 ▼
        ┌───────────────────────────────────────────────────┐
        │ STEP 6  Build PR body                             │
        │   node scripts/build-auto-fix-pr-body.mjs         │
        │        --issue <n> --branch <branch>              │
        │        --case-id <id> --fingerprint <fp>          │
        │        --fix-attempts <n> --model claude-sonnet-4-6│
        │     > /tmp/pr-body.md                             │
        │                                                   │
        │   Body MUST include exactly one line matching:    │
        │     <!-- affected_cases: id1,id2 -->              │
        │   (Phase 41 verifier-gate parses this comment)    │
        └────────────────────────┬──────────────────────────┘
                                 │
                                 ▼
        ┌───────────────────────────────────────────────────┐
        │ STEP 7  peter-evans/create-pull-request@v8        │
        │   token: secrets.GITHUB_TOKEN                     │
        │   branch: ${{ BRANCH }}                           │
        │   base: main                                      │
        │   draft: true                                     │
        │   delete-branch: false  # Phase 44 needs the      │
        │                          # branch around          │
        │   title: "auto-fix: <ERROR_CLASS> for <case-id>"  │
        │   body-path: /tmp/pr-body.md                      │
        │   labels: "auto-fix:opened,triage,<ERROR_CLASS>"  │
        │   commit-message: \                               │
        │     "Fix #<n>: <ERROR_CLASS> [fp:<fp12>]"         │
        └────────────────────────┬──────────────────────────┘
                                 │  (PR is now open, draft, awaiting verifier-gate)
                                 ▼
        ┌───────────────────────────────────────────────────┐
        │ STEP 8  Post-PR cross-link + label                │
        │   gh label create auto-fix:opened --color ... \   │
        │     --force 2>/dev/null || true   # idempotent    │
        │   gh issue comment <n> --body \                   │
        │     "Auto-fix PR opened: ${{ steps.cpr.outputs.pull-request-url }}"│
        └───────────────────────────────────────────────────┘
                                 │
                                 ▼  (separate workflow triggered now)
        ┌───────────────────────────────────────────────────┐
        │ Phase 41 v40-verifier-gate.yml                    │
        │   triggers on pull_request.opened on auto-fix/*   │
        │   parses <!-- affected_cases --> from PR body     │
        │   runs verifier 3x per case + 76-case regression  │
        │   flips draft→ready on all-pass                   │
        └───────────────────────────────────────────────────┘
```

### Recommended Project Structure
```
.github/
└── workflows/
    └── v40-auto-fix.yml        # NEW — this phase's workflow (~260-300 LOC)

scripts/
└── build-auto-fix-pr-body.mjs  # NEW (RECOMMENDED) — ~30-50 LOC; pure function
                                # taking {issue, branch, caseId, fingerprint,
                                # fixAttempts, model, transport} → markdown
                                # with <!-- affected_cases --> comment

tests/e2e/scripts/
└── v40-auto-fix-yaml.test.js   # NEW — 18-22 grep cases mirroring Phase 41-03
                                # V1-V12 + X1-X10 + T1 shape (workflow contract)

tests/unit/
└── build-auto-fix-pr-body.test.js  # NEW (IF helper used) — ~4-5 Vitest cases
                                    # pin format + affected_cases comment shape
```

### Pattern 1: Two-commit split for ledger-vs-PR-diff separation

**What:** Because Phase 41's diff-guard regex bank rejects any diff touching `tests/e2e/.llm-spend-ledger.json` (per AUTOFIX-03 + VFY-GATE-04), the workflow MUST commit the ledger update SEPARATELY from the auto-fix diff. The ledger commit goes to `main` directly via `secrets.GITHUB_TOKEN` with `[skip ci]` (so it does not re-trigger ci.yml); the auto-fix commit goes to the `auto-fix/<n>-<fp8>` branch via `peter-evans/cpr@v8`.

**When to use:** Any workflow where the dispatcher both writes to a diff-guarded path AND produces a PR diff that must be diff-guard-clean. Currently: this workflow only. Future Phase 44 auto-promote may also need it.

**Example:**
```bash
# Source: e2e-weekly-digest.yml:98-110 + v40-cost-ledger-snapshot.yml:70-82
# (BOTH establish the [skip ci] self-commit pattern verbatim)

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

# We are currently on auto-fix/<n>-<fp8> (Phase 42 dispatcher left us here).
# Need to commit ledger to main, then rebase the auto-fix branch on top.
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)

# Switch to main, fast-forward to remote tip, commit ledger
git checkout main
git pull --ff-only origin main
git add tests/e2e/.llm-spend-ledger.json
git diff --cached --quiet || \
  git commit -m "[skip ci] ledger: auto-fix issue-${{ github.event.issue.number }}"
git push origin main

# Switch back to the auto-fix branch and rebase on the new main HEAD
# so cpr@v8 sees ONLY the auto-fix diff (no ledger noise).
git checkout "$CURRENT_BRANCH"
git rebase main
```

### Pattern 2: `issues.labeled` event with job-level label-name filter

**What:** `on: { issues: { types: [labeled] } }` fires for ANY label add (not just `triage`). There is NO built-in workflow-level filter for label NAMES on issue events (unlike `on.push.branches` for branch names). The narrowing MUST happen at the job level via `if: github.event.label.name == 'triage'`.

**When to use:** Every workflow triggered by a specific issue label.

**Example:**
```yaml
# Source: [CITED: docs.github.com/en/actions/using-workflows/triggering-a-workflow#issues]
# Source: [CITED: docs.github.com/en/webhooks/webhook-events-and-payloads#issues]
on:
  issues:
    types: [labeled]

jobs:
  auto-fix:
    if: github.event.label.name == 'triage'
    runs-on: ubuntu-latest
    # ... rest of job
```

### Pattern 3: `peter-evans/create-pull-request@v8` minimal call for draft auto-fix PR

**What:** The action is documented to safely create-or-update a branch + atomic commit + push + open-PR (or update existing PR) in one step. For Phase 43 we override the default `delete-branch: true` to `false` so Phase 44's auto-promote workflow can still find the branch after merge.

**When to use:** This workflow's PR-create step (Step 7 above).

**Example:**
```yaml
# Source: [CITED: github.com/peter-evans/create-pull-request/blob/main/docs/concepts-guidelines.md]
- name: Create draft auto-fix PR
  id: cpr
  uses: peter-evans/create-pull-request@v8
  with:
    token: ${{ secrets.GITHUB_TOKEN }}
    branch: ${{ steps.dispatch.outputs.branch }}        # auto-fix/<n>-<fp8>
    base: main
    draft: true                                          # human review gate (Pitfall 4)
    delete-branch: false                                 # Phase 44 needs it
    title: "auto-fix: ${{ steps.dispatch.outputs.error_class }} for ${{ steps.dispatch.outputs.case_id }}"
    body-path: /tmp/pr-body.md
    commit-message: "Fix #${{ github.event.issue.number }}: ${{ steps.dispatch.outputs.error_class }} [fp:${{ steps.dispatch.outputs.fingerprint }}]"
    labels: |
      auto-fix:opened
      triage
      ${{ steps.dispatch.outputs.error_class }}
    signoff: false
```

The `outputs.pull-request-number` and `outputs.pull-request-url` are then consumed by Step 8 for the cross-link comment.

### Pattern 4: Fail-fast secret assertion

**What:** A first-step bash assertion that the required secret is present. If absent, the workflow comments on the source issue with a clear "needs setup" message and exits 1. This is cheaper than letting the dispatcher fail mid-SDK-call.

**Example:**
```yaml
- name: Assert ANTHROPIC_API_KEY present
  env:
    HAS_KEY: ${{ secrets.ANTHROPIC_API_KEY != '' }}
  run: |
    if [ "$HAS_KEY" != "true" ]; then
      gh issue comment ${{ github.event.issue.number }} \
        --body "auto-fix workflow is misconfigured: \`ANTHROPIC_API_KEY\` secret is not set. Please configure the repo secret before re-triggering the \`triage\` label."
      exit 1
    fi
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

The `secrets.ANTHROPIC_API_KEY != ''` comparison is the documented way to test secret presence without exposing the value to a `run:` block — `[CITED: docs.github.com/en/actions/security-guides/using-secrets-in-github-actions#limiting-credential-permissions]`.

### Pattern 5: ERROR_CLASS pre-check before invoking the dispatcher

**What:** A bash step that reads the issue's labels via `gh issue view --json labels --jq '[.labels[].name]'` and exits 0 cleanly (with a comment) if no recognized ERROR_CLASS label is present. The dispatcher would otherwise spend ~30 seconds setting up Node + npm ci + calling `gh issue view` itself, only to exit 2 — wasting compute (no SDK cost, but minutes of CI time).

**Example:**
```yaml
- name: Pre-check ERROR_CLASS label
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  run: |
    LABELS=$(gh issue view ${{ github.event.issue.number }} --json labels --jq '[.labels[].name]')
    # RECOGNIZED_LABELS = ERROR_CLASSES + 'PASS' (matches dispatcher's set)
    RECOGNIZED='FLAKE LLM_API_ERROR WRONG_CITATION LLM_HALLUCINATED_SELECTION WORKER_FALLBACK_FAILED GOOGLE_DOM_DRIFT HARNESS_ERROR PASS'
    FOUND=""
    for lbl in $RECOGNIZED; do
      if echo "$LABELS" | grep -q "\"$lbl\""; then
        FOUND="$lbl"
        break
      fi
    done
    if [ -z "$FOUND" ]; then
      gh issue comment ${{ github.event.issue.number }} \
        --body "auto-fix skipped: no recognized ERROR_CLASS label present. Add one of: $RECOGNIZED, then re-add the \`triage\` label."
      echo "ERROR_CLASS_FOUND=" >> $GITHUB_ENV
      exit 0
    fi
    echo "ERROR_CLASS_FOUND=$FOUND" >> $GITHUB_ENV
```

Subsequent dispatcher step gates on `if: env.ERROR_CLASS_FOUND != ''`.

### Pattern 6: Concurrency `cancel-in-progress: false` for cost-incurring workflows

**What:** Per Pitfall 7 in `PITFALLS.md`, any workflow that mutates the repo OR incurs API cost must use `cancel-in-progress: false`. Killing an in-flight LLM call wastes the cost without producing output. The cost ledger has already been allocated pessimistically (Phase 39 LEDGER-03 sub-caps); cancellation leaves it in a permanent-deducted state with no recovery.

**Example:**
```yaml
# Source: PITFALLS.md Pitfall 7 + community discussion #9252
concurrency:
  group: v40-auto-fix-${{ github.event.issue.number }}
  cancel-in-progress: false   # OPPOSITE of Phase 41 verifier-gate (which is read-only and uses true)
```

The per-issue group means different issues parallelize; same-issue events serialize. This pairs with AUTOFIX-04's `git ls-remote` idempotency: a second event arriving while the first is in flight will queue, then short-circuit on `git ls-remote` finding the branch already exists.

### Pattern 7: Comment-paraphrase discipline for forbidden-token negative grep

**What:** YAML test cases use `expect(yaml).not.toContain('[skip ci]')` etc. — but the file's own header comments cannot mention those literals or the test self-trips. Phase 40-03 hit this scar (auto-fixed mid-execution); Phase 41-03 pre-emptively applied paraphrase discipline. Phase 43 inherits the paraphrase table:

| Forbidden literal | Paraphrase used in workflow comments |
|---|---|
| `[skip ci]` | "skip-ci marker" (for the ledger commit's `[skip ci]` is the ONE exception — that commit message must use the literal token; the paraphrase rule applies to EXPLANATORY comments only, not to the commit-message string itself) |
| `gh pr merge --auto` | "the gh pr merge auto-flag" |
| `auto-merge: true` | "the action auto-merge input" |
| `id-token: write` | "Identity-token write permission" |
| `actions: write` | "the actions-write permission" |
| `pull_request_target` | "the pull-request-target trigger variant" |

**Special carve-out:** The negative-grep test for `[skip ci]` is in tension with Phase 43's NEED for `[skip ci]` in the LEDGER commit. Resolution: the test should pin that `[skip ci]` appears ONLY in the ledger-commit step, and ZERO times in the `commit-message` field of `cpr@v8`. Pattern: `expect(grepRange(yaml, 'ledger', 'cpr@v8 step start')).toContain('[skip ci]')` + `expect(yaml.split('Create draft auto-fix PR')[1]).not.toContain('[skip ci]')`. Simpler alternative: a positive test that the `[skip ci]` token appears EXACTLY ONCE.

### Anti-Patterns to Avoid
- **Workflow-level `if:` for label name** — there is no such filter for issue events. Use job-level `if:`.
- **`cancel-in-progress: true` on a cost-incurring workflow** — guarantees wasted SDK spend on every label-flap.
- **Letting the ledger update flow into the PR commit** — guarantees PR rejection by Phase 41 diff-guard. **THIS IS THE LOAD-BEARING TRAP** for Phase 43.
- **`gh pr create --draft` in a `run:` step instead of `cpr@v8`** — loses idempotency; second invocation of the same workflow fails on "branch already exists" instead of updating the existing PR.
- **PAT (`secrets.TR_PAT` etc.) instead of `secrets.GITHUB_TOKEN`** — broader scope, longer-lived, audit-trail-poor. `cpr@v8` only needs the scoped workflow token.
- **`delete-branch: true` on the cpr@v8 step** — Phase 44's auto-promote needs to read the auto-fix branch tip after merge. Override the action's default to `false`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Branch-create-or-update + draft PR open | Manual `git push --force-with-lease` + `gh pr create --draft` + `gh pr edit` race-handler | `peter-evans/cpr@v8` | The action handles idempotency, branch update vs create, PR update vs open, and rate-limit retries; ~250 LOC of edge cases collapse to ~12 YAML lines |
| Issue-label trigger filtering | Custom polling cron + label-state comparison | `on.issues.types: [labeled]` + job-level `if:` | Native GitHub event delivery is sub-second; polling adds minutes of latency + race conditions |
| LLM dispatcher | Inline `node -e 'import Anthropic...'` in a workflow step | `scripts/auto-fix.mjs` (Phase 42, 122-test-validated) | Already exists; lifting in-line breaks the Vitest test surface |
| Ledger commit retry on conflict | Custom retry loop with exponential backoff on `git push` rejection | Single `git pull --ff-only && git push` chain | The ledger is append-only, conflicts are rare (per-issue concurrency group + cancel-in-progress:false), and a single retry is sufficient — heavier retry adds complexity for minimal benefit |
| PR-body composition with affected_cases marker | Free-form template string in YAML | `scripts/build-auto-fix-pr-body.mjs` (~30-50 LOC) | The helper is Vitest-testable; the marker comment format is load-bearing for Phase 41 verifier-gate parsing |
| Forbidden-token negative-grep on workflow file | Bespoke regex bank in a Vitest file | Direct `expect(yaml).not.toContain(literal)` per Phase 40-03 / 41-03 pattern | Already established; reuse the shape verbatim |

**Key insight:** Phase 43 is a wiring exercise. Every primitive already exists in the codebase (dispatcher, diff-guard, cpr@v8 pattern, [skip ci] self-commit pattern, YAML grep test pattern). The non-obvious work is the **two-commit split** — and even that is two existing patterns (the dispatcher's existing branch+commit step + the ledger-snapshot's existing `[skip ci]` pattern) composed in a new sequence.

## Runtime State Inventory

> Phase 43 is greenfield workflow + greenfield helper script. No rename, no refactor, no migration. **Section omitted.**

## Common Pitfalls

### Pitfall 1: Letting the ledger update flow into the PR commit (THE load-bearing trap)

**What goes wrong:** The dispatcher writes to `tests/e2e/.llm-spend-ledger.json`. If the workflow hands the working tree to `cpr@v8` without first splitting the ledger out, the resulting PR diff includes the ledger update. Phase 41 diff-guard (VFY-GATE-04) regex bank explicitly rejects this path. The verifier-gate workflow triggered on the auto-fix PR will fail at the diff-guard job, mark the PR with `human-review-required`, and post a rejection comment. Phase 43 ships a "successful" PR; Phase 41 immediately rejects it. The auto-fix flow is broken end-to-end.

**Why it happens:** The dispatcher is correct to write the ledger (it's the only place the spend is recorded). The diff-guard is correct to reject ledger modifications (Pitfall 3 — verifier-gate gaming). The workflow is the only place that can untangle this; if the workflow author doesn't realize the conflict, the trap fires.

**How to avoid:** Two-commit split (Pattern 1 above). The ledger commit goes to `main` directly via `[skip ci]` BEFORE `cpr@v8` runs. By the time `cpr@v8` snapshots the working tree, only the auto-fix diff is dirty. Document this prominently in the workflow's header comment block AND pin it with a YAML test case that asserts BOTH the ledger-commit step AND the `git rebase main` (or equivalent) step exist BEFORE the `cpr@v8` step.

**Warning signs:** A Phase 43 auto-fix PR that gets immediately rejected by Phase 41 verifier-gate with a `tests/e2e/.llm-spend-ledger.json` violation comment.

### Pitfall 2: `issues.labeled` workflow filter assumed at workflow level

**What goes wrong:** Developer writes `on: { issues: { types: [labeled], labels: [triage] } }` (mimicking `on.push.branches`) and the workflow either errors out on parse OR silently triggers on ALL label events (depending on parser). Every label add anywhere on the repo (`P0`, `bug`, `documentation`, `wontfix`, etc.) triggers a full auto-fix workflow run.

**Why it happens:** GitHub Actions has workflow-level filters for branches (`on.push.branches`), paths (`on.push.paths`), and tags — but NOT for issue labels. The label-name narrowing MUST happen at the job level via `if:`. This is documented but easy to miss.

**How to avoid:** Always use `if: github.event.label.name == 'triage'` at the job level. Pin this with a YAML test case: `expect(yaml).toMatch(/if:\s*github\.event\.label\.name\s*==\s*'triage'/)`.

**Warning signs:** Workflow runs visible in the Actions tab triggered by labels other than `triage`.

### Pitfall 3: `cancel-in-progress: true` on a workflow that incurs SDK cost

**What goes wrong:** A label-flap (`triage` removed and re-added within 30 seconds, or two devs adding/removing the label concurrently) cancels the in-flight workflow mid-SDK-call. The SDK has already started generating; Anthropic still bills for the tokens generated up to the cancellation point. The ledger was pre-allocated pessimistically (Phase 39 LEDGER-03); the pessimistic allocation is now permanently consumed with no PR to show for it. Over a month, repeated flaps can drain $5-15 of budget on no output.

**Why it happens:** The default mental model from `ci.yml`-style workflows is "newer push supersedes older" — `cancel-in-progress: true` makes sense for read-only test runs. For cost-incurring writes, the opposite mental model is correct: "let the current call finish, queue the next one."

**How to avoid:** `cancel-in-progress: false` on this workflow. Document inline that this is OPPOSITE of Phase 41 verifier-gate (which IS read-only and DOES use `cancel-in-progress: true`). Pin with YAML test.

**Warning signs:** Ledger entries with `cost_usd > 0` but no corresponding PR (run records exist but show "Cancelled" status).

### Pitfall 4: Forgetting `delete-branch: false` override

**What goes wrong:** `peter-evans/cpr@v8` defaults to `delete-branch: true` (it auto-deletes the source branch after the PR closes — convenient for one-shot dep-update PRs as in Phase 40-03 which DOES use the default). For auto-fix, Phase 44's auto-promote workflow needs to read the branch tip after merge (to construct the follow-up promote PR per PROMOTE-02). If the auto-fix branch is auto-deleted, Phase 44 cannot find it.

**Why it happens:** Phase 40-03 is the immediate style template, and it uses `delete-branch: true`. Easy to copy-paste without noticing the semantic difference.

**How to avoid:** Explicitly set `delete-branch: false` and document inline. Pin with YAML test: `expect(yaml).toMatch(/delete-branch:\s*false/)`. Also add a negative pin to ensure `delete-branch: true` does NOT appear in the auto-fix step (it may appear elsewhere if the workflow ever adds a secondary cpr@v8 call, though Phase 43 has only one).

**Warning signs:** Phase 44 workflow fails at its `gh pr view --json headRefName` step with "branch not found."

### Pitfall 5: Capturing the branch name from dispatcher stdout via fragile regex

**What goes wrong:** The dispatcher prints a stdout line containing the branch name (per 42-02-SUMMARY.md line 508: `[auto-fix] branch staged locally; push manually with: git push -u origin auto-fix/<n>-<fp8>`). The workflow captures this via `grep -oP 'auto-fix/\d+-[0-9a-f]{8}'`. If the dispatcher's stdout format ever drifts (Phase 45 expansion adds a new field, etc.), the capture breaks silently.

**Why it happens:** stdout is an implicit contract; nothing pins the format beyond developer convention.

**How to avoid (multiple defenses, layered):**
1. **EXPLICITLY pin the stdout format with a Phase 42 dispatcher unit test** — already exists per 42-02-SUMMARY.md test case 18 (`--no-push staged the branch`). Phase 43 should reference this test as a "do not modify without coordinating with Phase 43 workflow" comment in the dispatcher source.
2. **Phase 43 captures the branch name via a side channel** — modify the dispatcher to ALSO write `$GITHUB_OUTPUT branch=<branchName>` when `process.env.GITHUB_OUTPUT` is set. This requires a small Phase 42 extension; alternatively, the workflow can pass `--output-file /tmp/dispatcher-output.json` and the dispatcher writes structured JSON. **RECOMMEND** the simpler approach: the workflow shells out to `git rev-parse --abbrev-ref HEAD` after the dispatcher completes (the dispatcher left us on the auto-fix branch via `git checkout -b`).
3. **YAML grep test** asserts the branch-capture step exists and uses one of the two recommended approaches.

**Warning signs:** Workflow runs that complete the dispatcher step but fail with empty `${{ steps.dispatch.outputs.branch }}` in subsequent steps.

### Pitfall 6: Re-using the wrong concurrency model from Phase 41

**What goes wrong:** Developer copies Phase 41-03's verifier-gate concurrency block: `concurrency: { group: v40-verifier-gate-${{ github.event.pull_request.number }}, cancel-in-progress: true }` → adapts to auto-fix by changing `pull_request.number` → `issue.number` AND KEEPS `cancel-in-progress: true`. Triggers Pitfall 3 above.

**Why it happens:** Verifier-gate is the most recently shipped style template; the concurrency block looks load-bearing for "PR-scoped serialization." Auto-fix's per-issue scoping looks structurally identical. The `cancel-in-progress` value is the load-bearing semantic distinction.

**How to avoid:** Workflow header comment block explicitly contrasts the two values with reference to Pitfall 7 in PITFALLS.md. Pin with YAML test: `expect(yaml).toMatch(/cancel-in-progress:\s*false/)` AND `expect(yaml).not.toMatch(/cancel-in-progress:\s*true/)` (negative pin).

### Pitfall 7: Dispatcher exit 3 (cap reached) misinterpreted as workflow failure

**What goes wrong:** Per 42-02-SUMMARY.md exit codes: dispatcher exits 3 when `countFixAttempts(ledger, fingerprint) >= 3`. The dispatcher has ALREADY done the right thing (added `human-review-required` label + posted cap-reached comment). If the workflow treats exit-non-zero as failure, it fires an additional "workflow failed" comment + leaves the PR step un-run (correct) but pollutes the issue with duplicate signal.

**Why it happens:** The natural workflow pattern is "any non-zero exit = step failure = job failure." Exit 3 is a controlled-exit-with-side-effects-done.

**How to avoid:** The dispatcher step uses `continue-on-error: true` AND a follow-up step inspects the exit code via `${{ steps.dispatch.outcome }}` + `${{ steps.dispatch.conclusion }}`. Branch the rest of the workflow:
- exit 0 → proceed to ledger-commit + cpr@v8
- exit 1 → workflow fails; dispatcher already wrote stderr; the `gh issue comment` step posts the last 20 lines of stderr
- exit 2 → workflow fails; same handling as exit 1 (should not happen)
- exit 3 → workflow exits 0 cleanly; dispatcher already did the labeling+comment

This requires the dispatcher to write its exit code to `$GITHUB_OUTPUT` (e.g., via a wrapper `bash -c "node scripts/auto-fix.mjs ... ; EXIT=$?; echo \"exit_code=$EXIT\" >> $GITHUB_OUTPUT ; exit 0"`). Pin with YAML test.

**Warning signs:** Issues with the `human-review-required` label AND a "workflow failed" comment (the cap path should produce only the dispatcher's clean comment, not a workflow-failure comment).

## Code Examples

### Full workflow skeleton (annotated)
```yaml
# Source: composed from .github/workflows/v40-deps-update.yml (Phase 40-03 style template),
#         .github/workflows/v40-verifier-gate.yml (Phase 41-03 PR-gate diamond),
#         .github/workflows/v40-cost-ledger-snapshot.yml (Phase 40-01 [skip ci] commit),
#         .github/workflows/e2e-weekly-digest.yml:98-110 (self-commit pattern verbatim)
name: V40 Auto Fix

on:
  issues:
    types: [labeled]

# Per-issue serialization; cancel-in-progress:FALSE protects in-flight LLM cost.
# THIS IS OPPOSITE Phase 41 verifier-gate. See PITFALLS.md Pitfall 7.
concurrency:
  group: v40-auto-fix-${{ github.event.issue.number }}
  cancel-in-progress: false

permissions:
  contents: write       # cpr@v8 pushes the auto-fix branch + we push ledger to main
  pull-requests: write  # cpr@v8 opens the draft PR + adds labels
  issues: write         # gh issue comment + gh issue edit --add-label

jobs:
  auto-fix:
    # Label-name narrowing — there is no workflow-level label filter for issue events.
    if: github.event.label.name == 'triage'
    runs-on: ubuntu-latest
    timeout-minutes: 10   # generous; ~30-60s SDK call + 2-3 min setup + 1 min PR-open
    env:
      GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}

    steps:
      - name: Assert ANTHROPIC_API_KEY present
        env:
          HAS_KEY: ${{ secrets.ANTHROPIC_API_KEY != '' }}
        run: |
          if [ "$HAS_KEY" != "true" ]; then
            gh issue comment ${{ github.event.issue.number }} \
              --body "auto-fix misconfigured: ANTHROPIC_API_KEY secret missing"
            exit 1
          fi

      - name: Pre-check ERROR_CLASS label
        id: precheck
        run: |
          LABELS=$(gh issue view ${{ github.event.issue.number }} --json labels --jq '[.labels[].name] | join(" ")')
          RECOGNIZED='FLAKE LLM_API_ERROR WRONG_CITATION LLM_HALLUCINATED_SELECTION WORKER_FALLBACK_FAILED GOOGLE_DOM_DRIFT HARNESS_ERROR PASS'
          FOUND=""
          for lbl in $RECOGNIZED; do
            case " $LABELS " in *" $lbl "*) FOUND="$lbl"; break ;; esac
          done
          if [ -z "$FOUND" ]; then
            gh issue comment ${{ github.event.issue.number }} \
              --body "auto-fix skipped: no recognized ERROR_CLASS label. Add one of: $RECOGNIZED, then re-add triage."
          fi
          echo "error_class=$FOUND" >> $GITHUB_OUTPUT

      - uses: actions/checkout@v4
        if: steps.precheck.outputs.error_class != ''
        with:
          fetch-depth: 0   # full history for git apply --check against main

      - uses: actions/setup-node@v4
        if: steps.precheck.outputs.error_class != ''
        with:
          node-version: 22
          cache: ${{ hashFiles('package-lock.json') != '' && 'npm' || '' }}

      - name: Install dependencies
        if: steps.precheck.outputs.error_class != ''
        run: npm ci --no-audit --no-fund

      - name: Run auto-fix dispatcher
        id: dispatch
        if: steps.precheck.outputs.error_class != ''
        # continue-on-error: true so we can branch on exit code below.
        # Dispatcher exit 0/3 = workflow continues OK; exit 1/2 = failure path.
        continue-on-error: true
        run: |
          node scripts/auto-fix.mjs --issue ${{ github.event.issue.number }} \
                                    --force-api --no-push
          EXIT=$?
          echo "exit_code=$EXIT" >> $GITHUB_OUTPUT
          # Capture the branch the dispatcher checked out
          if [ "$EXIT" = "0" ]; then
            BRANCH=$(git rev-parse --abbrev-ref HEAD)
            echo "branch=$BRANCH" >> $GITHUB_OUTPUT
          fi

      - name: Handle dispatcher exit 1/2 (failure)
        if: steps.dispatch.outputs.exit_code == '1' || steps.dispatch.outputs.exit_code == '2'
        run: |
          gh issue comment ${{ github.event.issue.number }} \
            --body "auto-fix dispatcher failed (exit ${{ steps.dispatch.outputs.exit_code }}). See workflow logs for details."
          exit 1

      - name: Exit cleanly on dispatcher exit 3 (cap reached)
        if: steps.dispatch.outputs.exit_code == '3'
        run: |
          # Dispatcher already added human-review-required label + posted comment.
          # Just exit cleanly; no PR to open.
          exit 0

      # ────────────────────────────────────────────────────────────────────
      # LEDGER SELF-COMMIT — must precede cpr@v8 so the PR diff is clean.
      # The skip-ci marker on this commit message is load-bearing.
      # Mirrors v40-cost-ledger-snapshot.yml:70-82 + e2e-weekly-digest.yml:98-110.
      # ────────────────────────────────────────────────────────────────────
      - name: Commit ledger update to main
        if: steps.dispatch.outputs.exit_code == '0'
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          AUTO_FIX_BRANCH=${{ steps.dispatch.outputs.branch }}
          git checkout main
          git pull --ff-only origin main
          git add tests/e2e/.llm-spend-ledger.json
          # Idempotent: no-op if ledger unchanged (would be unusual after a real SDK call,
          # but defensive against future dispatcher refactors).
          if ! git diff --cached --quiet; then
            git commit -m "[skip ci] ledger: auto-fix issue-${{ github.event.issue.number }}"
            git push origin main
          fi
          # Restore auto-fix branch and rebase on the new main HEAD
          git checkout "$AUTO_FIX_BRANCH"
          git rebase main

      - name: Build PR body
        id: body
        if: steps.dispatch.outputs.exit_code == '0'
        run: |
          node scripts/build-auto-fix-pr-body.mjs \
            --issue ${{ github.event.issue.number }} \
            --branch ${{ steps.dispatch.outputs.branch }} \
            --error-class ${{ steps.precheck.outputs.error_class }} \
            > /tmp/pr-body.md

      - name: Idempotent label create — auto-fix:opened
        if: steps.dispatch.outputs.exit_code == '0'
        run: |
          gh label create auto-fix:opened --color 0E8A16 \
            --description "Auto-fix workflow opened a draft PR for this issue" \
            --force 2>/dev/null || true

      - name: Create draft auto-fix PR
        id: cpr
        if: steps.dispatch.outputs.exit_code == '0'
        uses: peter-evans/create-pull-request@v8
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          branch: ${{ steps.dispatch.outputs.branch }}
          base: main
          draft: true
          delete-branch: false   # Phase 44 auto-promote needs this branch later
          title: "auto-fix: ${{ steps.precheck.outputs.error_class }} for issue #${{ github.event.issue.number }}"
          body-path: /tmp/pr-body.md
          commit-message: "Fix #${{ github.event.issue.number }}: ${{ steps.precheck.outputs.error_class }}"
          labels: |
            auto-fix:opened
            triage
            ${{ steps.precheck.outputs.error_class }}
          signoff: false

      - name: Cross-link comment on source issue
        if: steps.dispatch.outputs.exit_code == '0' && steps.cpr.outputs.pull-request-url
        run: |
          gh issue comment ${{ github.event.issue.number }} \
            --body "Auto-fix PR opened: ${{ steps.cpr.outputs.pull-request-url }}"
```

### PR-body builder helper (recommended)
```js
// scripts/build-auto-fix-pr-body.mjs
//
// Phase 43 — builds the auto-fix PR body with the load-bearing
// <!-- affected_cases: id1,id2 --> comment that Phase 41 verifier-gate parses.
//
// CLI: node scripts/build-auto-fix-pr-body.mjs --issue <n> --branch <name>
//                                              --error-class <cls>
//      (writes markdown to stdout)
//
// Exported: buildAutoFixPrBody({issue, branch, errorClass, caseIds, fingerprint,
//                              fixAttempts, model, ledgerIso}) → string
// — pure function, Vitest-testable.

import { parseArgs } from 'node:util';
import { execFileSync } from 'node:child_process';

const AFFECTED_CASES_RE = /<!-- affected_cases: ([^\s>]+) -->/;

export function buildAutoFixPrBody({ issue, branch, errorClass, caseIds,
                                     fingerprint, fixAttempts, model,
                                     ledgerIso }) {
  const casesCsv = (caseIds && caseIds.length) ? caseIds.join(',') : 'unknown';
  return [
    `<!-- affected_cases: ${casesCsv} -->`,
    ``,
    `## Auto-Fix: ${errorClass}`,
    ``,
    `**Source issue:** #${issue}`,
    `**Branch:** \`${branch}\``,
    `**Fingerprint:** \`${fingerprint || 'unknown'}\``,
    `**Fix attempts:** ${fixAttempts || 1}`,
    `**Model:** ${model || 'claude-sonnet-4-6'}`,
    `**Ledger entry:** ${ledgerIso || '(see ledger)'}`,
    ``,
    `This PR is **draft** pending the verifier-gate workflow.`,
    `Per Phase 41 contract, draft → ready-for-review flips automatically iff:`,
    `1. Diff-guard passes (no forbidden paths touched)`,
    `2. Verifier passes 3x consecutively on each affected case`,
    `3. Full 76-case regression suite passes on this branch`,
    ``,
    `Auto-merge is intentionally disabled. Human review required.`,
  ].join('\n');
}

// CLI shim
if (import.meta.url === `file://${process.argv[1]}`) {
  const { values } = parseArgs({
    options: {
      issue: { type: 'string' },
      branch: { type: 'string' },
      'error-class': { type: 'string' },
      'case-ids': { type: 'string', default: '' },
      fingerprint: { type: 'string', default: '' },
      'fix-attempts': { type: 'string', default: '1' },
      model: { type: 'string', default: 'claude-sonnet-4-6' },
      'ledger-iso': { type: 'string', default: '' },
    },
  });
  const md = buildAutoFixPrBody({
    issue: values.issue,
    branch: values.branch,
    errorClass: values['error-class'],
    caseIds: values['case-ids'] ? values['case-ids'].split(',') : [],
    fingerprint: values.fingerprint,
    fixAttempts: Number(values['fix-attempts']),
    model: values.model,
    ledgerIso: values['ledger-iso'],
  });
  process.stdout.write(md);
}
```

### Vitest YAML grep cases — recommended set (~20 cases)
```js
// tests/e2e/scripts/v40-auto-fix-yaml.test.js
//
// Mirrors Phase 40-03 D1-D11 + X1-X8 (19 cases) and Phase 41-03 V1-V12 + X1-X10 + T1 (23 cases).
// Recommended Phase 43 set: A1-A12 (load-bearing primitives) + X1-X8 (negative-pin defenses) + L1-L2 (ledger-split).

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const YAML_PATH = path.resolve(PROJECT_ROOT, '.github/workflows/v40-auto-fix.yml');

let yaml;
beforeAll(() => { yaml = fs.readFileSync(YAML_PATH, 'utf8'); });

describe('v40-auto-fix.yml contract (Phase 43)', () => {
  // ── A: Load-bearing primitives ──
  it('A1 — trigger: on.issues.types: [labeled]', () => {
    expect(yaml).toMatch(/on:[\s\S]*?issues:[\s\S]*?types:\s*\[labeled\]/);
  });
  it('A2 — job-level if: filters to triage label', () => {
    expect(yaml).toMatch(/if:\s*github\.event\.label\.name\s*==\s*'triage'/);
  });
  it('A3 — concurrency.group keyed by issue.number', () => {
    expect(yaml).toMatch(/group:\s*v40-auto-fix-\$\{\{\s*github\.event\.issue\.number/);
  });
  it('A4 — concurrency.cancel-in-progress: false (opposite of verifier-gate)', () => {
    expect(yaml).toContain('cancel-in-progress: false');
    expect(yaml).not.toMatch(/cancel-in-progress:\s*true/);
  });
  it('A5 — permissions: contents:write + pull-requests:write + issues:write', () => {
    expect(yaml).toContain('contents: write');
    expect(yaml).toContain('pull-requests: write');
    expect(yaml).toContain('issues: write');
  });
  it('A6 — ANTHROPIC_API_KEY fail-fast assertion present', () => {
    expect(yaml).toMatch(/secrets\.ANTHROPIC_API_KEY\s*!=\s*''/);
  });
  it('A7 — ERROR_CLASS pre-check step present', () => {
    expect(yaml).toMatch(/gh issue view[\s\S]*?--json labels/);
    expect(yaml).toMatch(/WRONG_CITATION/);
  });
  it('A8 — node scripts/auto-fix.mjs invocation with --force-api --no-push', () => {
    expect(yaml).toContain('node scripts/auto-fix.mjs');
    expect(yaml).toContain('--force-api');
    expect(yaml).toContain('--no-push');
  });
  it('A9 — peter-evans/create-pull-request@v8 referenced exactly once', () => {
    const m = yaml.match(/peter-evans\/create-pull-request@v8/g) || [];
    expect(m.length).toBe(1);
    expect(yaml).not.toMatch(/peter-evans\/create-pull-request@main/);
  });
  it('A10 — cpr@v8: draft: true', () => {
    expect(yaml).toContain('draft: true');
  });
  it('A11 — cpr@v8: delete-branch: false (Phase 44 needs the branch)', () => {
    expect(yaml).toMatch(/delete-branch:\s*false/);
  });
  it('A12 — cpr@v8: token uses secrets.GITHUB_TOKEN', () => {
    expect(yaml).toContain('${{ secrets.GITHUB_TOKEN }}');
    expect(yaml).not.toMatch(/secrets\.[A-Z_]*PAT[A-Z_]*/);
  });

  // ── L: Ledger-split (load-bearing isolation) ──
  it('L1 — ledger commit step EXISTS before cpr@v8 step', () => {
    const cprIdx = yaml.indexOf('peter-evans/create-pull-request@v8');
    const ledgerIdx = yaml.indexOf('tests/e2e/.llm-spend-ledger.json');
    expect(ledgerIdx).toBeGreaterThan(0);
    expect(ledgerIdx).toBeLessThan(cprIdx);
  });
  it('L2 — ledger commit uses the skip-ci marker (literal [skip ci] appears EXACTLY once)', () => {
    const matches = yaml.match(/\[skip ci\]/g) || [];
    expect(matches.length).toBe(1);   // the ledger commit message — only allowed occurrence
  });

  // ── X: Negative-pin defenses (Pitfall 4 + Pitfall 7 + Pitfall 1 step 7) ──
  it('X1 — no gh pr merge auto-flag', () => {
    expect(yaml).not.toContain('gh pr merge --auto');
  });
  it('X2 — no action auto-merge input', () => {
    expect(yaml).not.toContain('auto-merge: true');
  });
  it('X3 — no Identity-token write permission', () => {
    expect(yaml).not.toContain('id-token: write');
  });
  it('X4 — no actions-write permission', () => {
    expect(yaml).not.toContain('actions: write');
  });
  it('X5 — no pull-request-target trigger', () => {
    expect(yaml).not.toContain('pull_request_target');
  });
  it('X6 — body-path used (not inline body:)', () => {
    expect(yaml).toMatch(/body-path:\s*\/tmp\/pr-body\.md/);
  });
  it('X7 — cross-link comment on source issue after PR open', () => {
    expect(yaml).toMatch(/gh issue comment[\s\S]*?pull-request-url/);
  });
  it('X8 — timeout-minutes set (5-15 range)', () => {
    expect(yaml).toMatch(/timeout-minutes:\s*([5-9]|1[0-5])\b/);
  });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hand-rolled `git push` + `gh pr create --draft` in `run:` blocks | `peter-evans/cpr@v8` with `draft: true` | Repo standard since Phase 40-03 (2026-05-31) | Atomic branch-or-update + PR-create-or-update; idempotent on re-trigger; ~12 YAML lines vs ~80 LOC of edge-case bash |
| PAT (`secrets.PERSONAL_ACCESS_TOKEN`) for cpr | `secrets.GITHUB_TOKEN` only | Pitfall 4 + cpr@v8 docs since v6 (2024) | Workflow-scoped + auto-expiring + audit-loggable; eliminates PAT-leak blast radius |
| Workflow-level concurrency `group: ${{ github.workflow }}` | Per-issue concurrency `group: v40-auto-fix-${{ github.event.issue.number }}` | PITFALLS.md Pitfall 7 / community discussion #9252 | Different issues parallelize; same-issue events serialize; per-issue rate limit via cancel-in-progress:false + AUTOFIX-04 git ls-remote idempotency |
| `cancel-in-progress: true` everywhere | `false` on cost-incurring workflows | Phase 39 + PITFALLS.md Pitfall 2/7 | Protects in-flight LLM cost from label-flap waste |

**Deprecated/outdated:**
- **`peter-evans/create-pull-request@v6` and earlier**: superseded by v8 — repo standard. Phase 43 must use v8 to match Phase 40-03 + future Phase 47 audit.
- **Custom polling cron + label-state JSON comparison for issue-label triggers**: superseded by native `on.issues.types: [labeled]` event delivery.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `secrets.ANTHROPIC_API_KEY` will be configured at the repo level before Phase 43 ships | Pattern 4 + Pitfall A6 test | LOW — workflow fails-fast with a clear remediation comment; no compute spent |
| A2 | Phase 42 dispatcher's stdout format (the `branch staged locally; push manually with: git push -u origin <branch>` line) is stable through Phase 45's PROMPT_SCAFFOLDS expansion | Pitfall 5 | MEDIUM — RECOMMEND `git rev-parse --abbrev-ref HEAD` capture INSTEAD of grep on stdout to eliminate this dependency. If discuss-phase confirms this approach, the assumption is moot |
| A3 | Phase 41 verifier-gate's `<!-- affected_cases: ... -->` parser is regex-permissive enough to accept the multi-line markdown body format the helper produces | Code Examples §PR-body helper | LOW — the comment lives on its own line as the first line; standard regex `<!-- affected_cases: ([^\s>]+) -->` handles any surrounding whitespace |
| A4 | `peter-evans/cpr@v8` `outputs.pull-request-url` is non-empty on successful PR open | Code Examples §cross-link step | LOW — documented action output, used in Phase 40-03 without incident |
| A5 | `git rebase main` after `git checkout auto-fix/<n>-<fp8>` produces a clean rebase (no conflicts) because the only main-side change is the ledger file, which the auto-fix branch never touches | Pattern 1 §two-commit split | MEDIUM — if the auto-fix branch ever modifies the ledger, the rebase will conflict. Diff-guard rejects ledger modifications in PRs, so this should be enforced. Defensive: detect conflict and abort with a clear error |
| A6 | Repo will have only ONE auto-fix workflow at a time (no need for cross-workflow concurrency) | Pattern 6 | LOW — Phase 44 auto-promote is a different workflow on a different trigger (PR closed); no shared concurrency group needed |

**Recommended pre-execution confirmations:** A2 (capture-via-rev-parse vs grep-stdout) and A5 (rebase conflict detection) should be confirmed in discuss-phase or the plan should make a defensive choice.

## Open Questions

1. **Branch-name capture: stdout grep OR `git rev-parse`?**
   - What we know: dispatcher prints the branch name to stdout (per 42-02-SUMMARY.md test 18) AND leaves the working tree on the auto-fix branch (per dispatcher Step 15 `git checkout -b`).
   - What's unclear: which capture method is more robust to future dispatcher refactors.
   - Recommendation: `git rev-parse --abbrev-ref HEAD` (simpler, no stdout-format dependency). The planner should lock this in the plan.

2. **PR-body builder: separate `scripts/build-auto-fix-pr-body.mjs` file OR inline bash HEREDOC?**
   - What we know: helper enables 4-5 Vitest cases pinning format; HEREDOC saves a file but loses tests.
   - What's unclear: whether the format ever drifts enough to warrant test coverage.
   - Recommendation: **separate file** (~30-50 LOC + 5 Vitest cases) — the `<!-- affected_cases -->` comment format is load-bearing for Phase 41 verifier-gate parsing; format drift is a high-impact regression that warrants direct test coverage.

3. **Should this be 1 plan or 2?**
   - What we know: single workflow file + single helper script + single test file = tightly cohesive.
   - What's unclear: whether the helper warrants its own plan (would be a 2-3 task RED/GREEN/REFACTOR cycle).
   - Recommendation: **1 plan, ~4-5 tasks** (Task 1: RED helper test, Task 2: GREEN helper, Task 3: RED YAML test, Task 4: GREEN workflow, optional Task 5: integration smoke via workflow_dispatch). If the planner prefers strict TDD pair-per-deliverable, split into 2 plans (helper plan + workflow plan); the helper would block the workflow plan only at the body-build step.

4. **Workflow_dispatch trigger for manual testing?**
   - What we know: every other v40-* workflow has `workflow_dispatch: {}` for manual testing.
   - What's unclear: does it apply here when the trigger is issue-based?
   - Recommendation: **omit** for Phase 43 — manual testing path is "add `triage` label to a real issue"; the workflow has no input parameters it could meaningfully accept; workflow_dispatch would require a separate code path for the synthetic-issue-number case. **Add it later if Phase 47 HUMAN-UAT needs it.**

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `gh` CLI | label create, issue view/comment/edit | ✓ | bundled in `ubuntu-latest` | — |
| Node 22 | dispatcher + helper | ✓ | via `actions/setup-node@v4` | — |
| `peter-evans/create-pull-request@v8` | PR open | ✓ | pinned in marketplace | — |
| `secrets.GITHUB_TOKEN` | every gh call + cpr@v8 token | ✓ | injected by Actions runtime | — |
| `secrets.ANTHROPIC_API_KEY` | dispatcher's SDK call | **REQUIRES SETUP** | — | A1 fail-fast assertion catches absence |
| `scripts/auto-fix.mjs` | dispatcher invocation | ✓ | Phase 42 (committed) | — |
| `tests/e2e/lib/llm-driver.js` | dispatcher's SDK call | ✓ | Phase 39 + Phase 42 extension | — |
| `tests/e2e/lib/llm-ledger.js` + `tests/e2e/.llm-spend-ledger.json` | ledger read/write | ✓ | Phase 39 (committed) | — |

**Missing dependencies with no fallback:**
- `secrets.ANTHROPIC_API_KEY` (requires manual setup at the repo level). Phase 43's fail-fast assertion makes the absence detectable + actionable.

**Missing dependencies with fallback:**
- None.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (already installed; repo standard) |
| Config file | `vitest.config.js` (repo standard; no Phase 43 changes needed) |
| Quick run command | `npx vitest run tests/e2e/scripts/v40-auto-fix-yaml.test.js tests/unit/build-auto-fix-pr-body.test.js` |
| Full suite command | `npm run test:src` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTOFIX-02 (trigger filter) | `issues.labeled` → triage filter at job level | unit (YAML grep) | `npx vitest run tests/e2e/scripts/v40-auto-fix-yaml.test.js -t 'A1\|A2'` | Wave 0 (create) |
| AUTOFIX-02 (concurrency) | per-issue group + cancel-in-progress:false | unit (YAML grep) | `npx vitest run tests/e2e/scripts/v40-auto-fix-yaml.test.js -t 'A3\|A4'` | Wave 0 |
| AUTOFIX-02 (cpr@v8) | draft + delete-branch:false + GITHUB_TOKEN + version v8 | unit (YAML grep) | `npx vitest run tests/e2e/scripts/v40-auto-fix-yaml.test.js -t 'A9\|A10\|A11\|A12'` | Wave 0 |
| AUTOFIX-02 (ledger split) | ledger commit BEFORE cpr@v8 + [skip ci] exactly once | unit (YAML grep) | `npx vitest run tests/e2e/scripts/v40-auto-fix-yaml.test.js -t 'L1\|L2'` | Wave 0 |
| AUTOFIX-02 (affected_cases comment) | PR body format includes parseable affected_cases comment | unit (PR-body helper) | `npx vitest run tests/unit/build-auto-fix-pr-body.test.js` | Wave 0 (create if helper used) |
| AUTOFIX-02 (Pitfall 4 defenses) | no auto-merge, no PAT, no pull_request_target | unit (YAML grep) | `npx vitest run tests/e2e/scripts/v40-auto-fix-yaml.test.js -t 'X1\|X2\|X3\|X4\|X5'` | Wave 0 |
| AUTOFIX-02 (live trigger smoke) | end-to-end execution via real labeled issue | manual-only | (Phase 47 CLEANUP-03 (a) HUMAN-UAT live demo) | deferred to Phase 47 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/e2e/scripts/v40-auto-fix-yaml.test.js tests/unit/build-auto-fix-pr-body.test.js`
- **Per wave merge:** `npm run test:src` (verifies no regression on Phase 39/40/41/42 tests)
- **Phase gate:** Full suite green + `gh workflow view v40-auto-fix.yml` confirms the workflow is registered + linted by GitHub

### Wave 0 Gaps
- [ ] `tests/e2e/scripts/v40-auto-fix-yaml.test.js` — covers AUTOFIX-02 YAML-contract surface (A1-A12 + L1-L2 + X1-X8)
- [ ] `tests/unit/build-auto-fix-pr-body.test.js` — covers PR-body format including the load-bearing `<!-- affected_cases -->` comment
- [ ] `.github/workflows/v40-auto-fix.yml` — the workflow itself (target of A* + L* + X* tests)
- [ ] `scripts/build-auto-fix-pr-body.mjs` — PR-body helper (target of unit tests; optional if HEREDOC chosen)

Framework already installed; no install command needed.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `secrets.GITHUB_TOKEN` (auto-expiring workflow-scoped); `secrets.ANTHROPIC_API_KEY` (repo secret) |
| V3 Session Management | no | n/a for workflow-style execution |
| V4 Access Control | yes | Workflow-level `permissions:` block — least-privilege (contents:write + pull-requests:write + issues:write; explicit absence of id-token:write + actions:write per X3/X4) |
| V5 Input Validation | yes | Issue body content passed via `env:` (NOT shell interpolation) inside dispatcher per CWE-94 hygiene (already Phase 42 invariant) |
| V6 Cryptography | no | n/a — no crypto operations |
| V7 Error Handling | yes | Dispatcher exit codes 1/2/3 with explicit handling (Pitfall 7); never bare `set -e` swallow |
| V8 Data Protection | yes | Ledger commit uses `[skip ci]` to prevent re-trigger loops; PR body never echoes secret values |
| V9 Communication | yes | All GitHub API access via `secrets.GITHUB_TOKEN` over HTTPS; no custom webhook |
| V10 Malicious Code | yes | No `pull_request_target` (X5); no `actions: write` (X4); cpr@v8 pinned version (not @main) (A9 negative pin) |
| V14 Configuration | yes | Concurrency group + cancel-in-progress:false documented inline; comment-paraphrase discipline pre-applied to avoid forbidden-token self-trip |

### Known Threat Patterns for GitHub Actions auto-fix workflow

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Issue-body prompt injection (Aikido PromptPwnd) | Tampering | Pitfall 1 mitigations land in Phase 42 (`<issue_body_untrusted>` envelope); Phase 43 inherits — the workflow does NOT add new untrusted-input surfaces beyond what Phase 42 already validates |
| Token exfil via crafted PR body | Information disclosure | PR body composed by Phase 43 helper (pure function, no env-var interpolation); cpr@v8 uses workflow-scoped GITHUB_TOKEN (no PAT to exfiltrate) |
| Cost runaway via label-flap | Denial of service (cost) | concurrency group per-issue + cancel-in-progress:false + AUTOFIX-04 git ls-remote idempotency (Phase 42 already implements) + LEDGER-03 sub-caps (Phase 39 already implements) |
| Self-mutating workflow | Tampering | Phase 42 diff-guard regex bank rejects diffs touching `.github/workflows/` (VFY-GATE-04 in Phase 41); Phase 43 inherits |
| Auto-merge bypass of human review | Elevation of privilege | `draft: true` on cpr@v8 (A10) + repo-level "Allow auto-merge: OFF" (Phase 39 PROJECT decision); negative pins X1 + X2 confirm absence |
| Branch deletion erases evidence | Repudiation | `delete-branch: false` on cpr@v8 (A11) — Phase 44 audit needs the branch tip |
| pull_request_target token-elevation | Elevation of privilege | X5 negative pin (workflow does NOT use pull_request_target) |

## Sources

### Primary (HIGH confidence)
- **CONTEXT.md** (Phase 43 — this phase) — locked decisions + Claude's discretion; all locked behaviors copied verbatim into the User Constraints section
- **REQUIREMENTS.md** (AUTOFIX-02) — single requirement this phase addresses
- **PITFALLS.md** Pitfall 4 (auto-merge), Pitfall 7 (concurrency), Pitfall 1 step 7 (permission minimization), Pitfall 8 #1 (CI gate model) — Phase 43 inherits all four pitfall mitigations
- **42-02-SUMMARY.md** — dispatcher CLI contract (`--force-api --no-push` shape, exit codes 0/1/2/3, stdout format, branch checked-out invariant)
- **40-03-SUMMARY.md** — peter-evans/cpr@v8 style template (delete-branch, draft, token, body-path conventions); comment-paraphrase scar (auto-fixed mid-execution); YAML test shape (19 cases D1-D11 + X1-X8)
- **41-03-SUMMARY.md** — concurrency pattern (this phase uses OPPOSITE cancel-in-progress); idempotent label-create; gh ready-flip idempotency; YAML test shape (23 cases V1-V12 + X1-X10 + T1); pre-emptive comment-paraphrase discipline
- **`.github/workflows/v40-deps-update.yml`** — peter-evans/cpr@v8 invocation shape (verbatim style template for cpr@v8 step structure)
- **`.github/workflows/v40-cost-ledger-snapshot.yml`** + **`.github/workflows/e2e-weekly-digest.yml:98-110`** — `[skip ci]` self-commit pattern (verbatim copy target for Phase 43's ledger-commit step)
- **`scripts/auto-fix.mjs`** — Phase 42 dispatcher source (the binary Phase 43 invokes)
- **`tests/e2e/scripts/v40-deps-update-yaml.test.js`** — YAML grep test style template

### Secondary (MEDIUM confidence)
- GitHub Docs: `issues` event types — `[CITED: docs.github.com/en/actions/using-workflows/triggering-a-workflow#issues]` (no workflow-level label-name filter)
- GitHub Docs: webhook payloads — `[CITED: docs.github.com/en/webhooks/webhook-events-and-payloads#issues]` (`github.event.label.name` shape)
- peter-evans/create-pull-request concepts — `[CITED: github.com/peter-evans/create-pull-request/blob/main/docs/concepts-guidelines.md]` (PAT vs GITHUB_TOKEN, output fields, draft semantics)

### Tertiary (LOW confidence)
- None — all claims in this research are backed by either codebase grep, an explicit citation, or a locked decision in CONTEXT.md.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every primitive already in repo
- Architecture: HIGH — two-commit split is the only non-obvious decision; both halves of the split (cpr@v8 + [skip ci] self-commit) are repo-established patterns
- Pitfalls: HIGH — PITFALLS.md catalog directly enumerates 4 of the 7 pitfalls; the other 3 (5 + 6 + 7) are derived from 42-02-SUMMARY.md scars + Phase 41-03 comment-paraphrase scar

**Research date:** 2026-05-31
**Valid until:** 2026-06-30 (workflow stack is stable; pin set this short because Phase 44 may surface additional constraints that retroactively refine Phase 43's plan)

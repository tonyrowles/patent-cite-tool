# Phase 44: v40-auto-promote.yml + Triple-Gate _skipCiGuard - Research

**Researched:** 2026-05-31
**Domain:** GitHub Actions workflow (pull_request:closed → post-merge follow-up PR); pure-function triple-gate assertion; squash-merge regression detection
**Confidence:** HIGH

## Summary

Phase 44 closes the v4.0 self-healing loop. When an `auto-fix/*` PR carrying `auto-fix:verified` merges to `main`, a new workflow `.github/workflows/v40-auto-promote.yml` fires `scripts/auto-fix-promote.mjs`, which (a) asserts all three preconditions — `auto-fix:verified` label + `merged === true` + source-issue `triage` label — then (b) calls existing `runPromote({_skipCiGuard:true})` to mutate quarantine + golden corpora, then (c) opens a SEPARATE `auto-promote/*` PR via `peter-evans/cpr@v8` (which a human merges), then (d) closes the source issue, then (e) re-runs the verifier on `main` HEAD to catch squash-merge regressions.

**Primary recommendation:** Ship as **ONE plan, 5 tasks** (helper-extension TDD, triple-gate Vitest, auto-fix-promote.mjs script, workflow YAML, YAML grep tests). The artifacts share a single behavior surface (the workflow IS the script's runtime contract); splitting creates artificial seams that complicate the two-commit pattern Phase 43 already established.

**Critical finding:** `runPromote`'s `_skipCiGuard` parameter **already exists** (scripts/promote-from-quarantine.mjs:123, 131 — added in Phase 35 review-fix WR-05). The CONTEXT.md "Specifics" claim of needing to "add `_skipCiGuard` option" is incorrect. Phase 44 only needs to **invoke** the existing option from `auto-fix-promote.mjs` — no library modification required. This removes Task 3 from CONTEXT's "5-task" estimate.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **Workflow file:** `.github/workflows/v40-auto-promote.yml`
- **Trigger:** `on: pull_request: { types: [closed] }` with JOB-level filter `if: github.event.pull_request.merged == true && contains(github.event.pull_request.labels.*.name, 'auto-fix:verified')`
- **Permissions:** `contents: write`, `pull-requests: write`, `issues: write` (write on issues for close + comment)
- **Triple-gate ALL THREE assertions BEFORE `runPromote({_skipCiGuard: true})`:** (PR has `auto-fix:verified`) AND (`merged === true`) AND (source issue has `triage`)
- **Source issue identification:** parse from the merged PR body's `<!-- source_issue: <n> -->` comment (added by Phase 43's PR body builder — need to verify or add). If not present, fall back to grepping the commit message for `Fixes #<n>`.
- **`_skipCiGuard` placement:** added as a NEW optional parameter on the existing `runPromote` function in `tests/e2e/lib/promote-from-quarantine.js`. Default `false` (preserves v3.1 contract). Setting to `true` skips the CI gate at line 131. The option is ONLY meant to be set by `auto-fix-promote.mjs` after the triple-gate passes — ESLint or inline JSDoc enforces the contract.

  > **RESEARCH OVERRIDE [HIGH confidence]:** The CONTEXT here is **factually wrong**. The file is `scripts/promote-from-quarantine.mjs` (NOT `tests/e2e/lib/promote-from-quarantine.js` — that path does not exist), and `_skipCiGuard` is **already** a parameter (line 123, default `false`; bypass at line 131 with `if (!skipCiGuard && ciActive)`). The CLI `main()` already invokes it (line 291: `await runPromote({ id, confirm, _skipCiGuard: true })`). Phase 44 needs ZERO modification to this file — it only needs to **import and call** `runPromote({_skipCiGuard:true, id, confirm:true})` from `auto-fix-promote.mjs`. JSDoc enforcement of the "only after triple-gate" contract should be added to the **caller** (auto-fix-promote.mjs), not the callee. Planner must reconcile this with CONTEXT before locking the plan.

- **Follow-up PR via `peter-evans/create-pull-request@v8`:** modifies `tests/test-cases.js` to add the case; branch `auto-promote/<source-issue-n>`; title `auto-promote: add <case-id> to test-cases.js`; body cites the auto-fix PR + source issue; `draft: false` (the follow-up IS ready to review immediately).
- **Source issue close:** `gh issue close <n> --reason completed --comment "Fixed in PR #X (auto-promote PR #Y)"`. Vitest mocks gh.
- **Post-merge verifier re-check:** SAME workflow (`v40-auto-promote.yml`) — adds a step after the auto-promote PR creation that checks out main HEAD, runs `verify-single-case --case <id> --runs 1`, exits 0 on pass; non-zero on fail. Failure: `gh issue create --label e2e-nightly --label WRONG_CITATION --label post-merge-regression --title "post-merge regression: <case-id>"`.
- **Diff-guard reminder:** the auto-promote PR DOES touch `tests/test-cases.js` (which is in the diff-guard regex bank). Phase 41 verifier-gate ONLY runs on `auto-fix/*` branches; the auto-promote branch is `auto-promote/*`, so it's NOT verifier-gated. This is intentional — the auto-promote PR is reviewed by `@tonyrowles` (CODEOWNER) before merge.
- **`secrets.GITHUB_TOKEN` only** — no PATs.
- **Concurrency:** `concurrency: {group: v40-auto-promote-${{ github.event.pull_request.number }}, cancel-in-progress: false}` — same Pitfall 7 reasoning as Phase 43.

### Claude's Discretion

- Whether the post-merge verifier re-check is INLINE in `v40-auto-promote.yml` or a SEPARATE `v40-post-merge-verify.yml` workflow — inline is simpler; separate makes the audit cleaner. Recommend INLINE for Phase 44; Phase 47 audit can split if needed.
- Whether `auto-fix-promote.mjs` is a Vitest-testable pure-function module or a thin CLI shim — thin CLI shim wrapping a pure-function `assertTripleGate({prLabels, merged, sourceIssueLabels}) → throws/returns void` module for testability.
- Label name for the source issue ID comment in the auto-fix PR body: `<!-- source_issue: <n> -->`. Phase 43's `scripts/build-auto-fix-pr-body.mjs` already includes affected_cases + fingerprint + fix_attempts + ledger_iso; adding source_issue is a 1-line addition there. Decide: modify Phase 43's helper to add source_issue, OR have Phase 44 fall back to commit-message parsing. **RECOMMEND modify Phase 43's helper** (cleaner; the source_issue link is load-bearing for the auto-promote workflow).
- Auto-promote PR `delete-branch` setting: TRUE (auto-promote branches are throwaway).
- 4-5 plans vs 1 large plan: 1 plan with 4-5 tasks (script + workflow + triple-gate vitest + Phase 43 helper modification + post-merge verifier step) — tightly cohesive.

### Deferred Ideas (OUT OF SCOPE)

- `auto-fix:partial-verified` semantics (3/5 affected cases pass) — explicitly OUT OF SCOPE; default all-or-nothing per REQUIREMENTS.md.
- Multi-class follow-up PR batching — out of scope.
- Auto-revert on post-merge regression — out of scope; first iteration files a regression issue + Phase 45's FLAKE state machine handles the re-classification.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PROMOTE-01 | `v40-auto-promote.yml` triggers on `pull_request.closed && merged && contains(labels, 'auto-fix:verified')`; `auto-fix-promote.mjs --pr <n>` asserts triple-gate (verified-label + merged + triage-sourced) BEFORE calling `runPromote({_skipCiGuard:true})`; Vitest exercises each gate's rejection | See `## Pattern 1: Triple-Gate Assertion Module` + `## Architecture Patterns/Workflow Job Filter` + `## Don't Hand-Roll/_skipCiGuard already exists` |
| PROMOTE-02 | Separate follow-up PR adds case to `tests/test-cases.js`; never direct-to-main; `Allow auto-merge: OFF` + human merge required; YAML test asserts no direct-push | See `## Pattern 2: Two-PR Choreography` + `## Don't Hand-Roll/test-cases.js mutation` + `## Code Examples/cpr@v8 invocation` + `## Anti-Patterns to Avoid/Direct push to main` |
| PROMOTE-03 | `gh issue close <source-issue> --reason completed --comment "Fixed in PR #X (auto-promote PR #Y)"` after PR creation; Vitest mocks gh to confirm args | See `## Pattern 3: Source Issue Closure` + `## Code Examples/issue close step` |
| PROMOTE-04 | Post-merge verifier re-check on **main HEAD** (NOT the merged commit — squash-merge rewrites SHA); failure files regression issue with `e2e-nightly` + `WRONG_CITATION` + `post-merge-regression` labels | See `## Pattern 4: Post-Merge Verifier Re-Check` + `## Common Pitfalls/Squash-merge SHA drift` + `## Code Examples/verifier re-check step` |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Trigger gating (label + merged) | GitHub Actions workflow YAML (`if:` expression) | — | Workflow-level filter is the cheapest, most-auditable gate; runs before any runner cost |
| Triple-gate assertion (3 explicit checks) | Pure-function Node module (`assertTripleGate`) | CLI shim (`auto-fix-promote.mjs`) | Pure function is Vitest-mockable per-leg; CLI shim handles env/process boundary |
| Quarantine→golden mutation | Existing `runPromote` (scripts/promote-from-quarantine.mjs) | — | Already-tested orchestrator with rollback + atomic writes; do NOT reimplement |
| Source-issue identification | PR body parser (`<!-- source_issue: N -->`) | Commit-message fallback (`Fixes #<n>`) | Phase 43 helper is the source of truth; commit-message grep is a defensive fallback |
| Follow-up PR creation | `peter-evans/create-pull-request@v8` (workflow step) | — | Pre-pinned action; same shape as Phase 40/43; no new dependency |
| Source issue closure | `gh issue close` CLI invocation (workflow step) | — | Native gh; pre-installed on ubuntu-latest runners |
| Post-merge verifier re-check | `scripts/verify-single-case.mjs` (workflow step) | — | Phase 41 deliverable; transport-pure shim, no GitHub ops |
| Regression issue filing | `gh issue create` (workflow step) | — | Same pattern as v40-deps-update.yml manual-sdk-review step |
| Concurrency serialization | Workflow `concurrency:` block | — | Per-PR keying; `cancel-in-progress: false` matches Phase 43 cost-protection pattern |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `peter-evans/create-pull-request` | `v8` | Open `auto-promote/*` PR | Already pinned in v40-auto-fix.yml + v40-deps-update.yml; project-canonical |
| `actions/checkout` | `v4` | Repo checkout for runPromote + verifier | Project-canonical |
| `actions/setup-node` | `v4` | Node 22 runtime | Matches v40-auto-fix.yml |
| `gh` (GitHub CLI) | pre-installed on ubuntu-latest | issue close/comment/create + PR view | No npm dep; project-canonical |

### Supporting (project-internal, no install)
| Module | Path | Purpose |
|--------|------|---------|
| `runPromote` | `scripts/promote-from-quarantine.mjs:115` | Quarantine→golden orchestrator with `_skipCiGuard` already wired |
| `verify-single-case` | `scripts/verify-single-case.mjs` | Post-merge re-check; outputs JSON, exits 0/1/2 |
| `buildAutoFixPrBody` | `scripts/build-auto-fix-pr-body.mjs` | Phase 43 helper — extend with `source_issue` field |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `peter-evans/cpr@v8` | `gh pr create` raw | cpr@v8 handles branch create + push + idempotent re-runs; raw `gh` would re-implement branch-already-exists handling |
| Inline post-merge verifier step | Separate `v40-post-merge-verify.yml` | Inline = one workflow, one audit point; separate = cleaner trigger isolation. **Recommend INLINE** per CONTEXT discretion |
| Pure-function triple-gate module | Inline assertions in CLI script | Pure module is per-leg unit-testable; project convention (cf. `build-auto-fix-pr-body.mjs` Phase 43) |

**Installation:** No new npm dependencies. All artifacts use existing project modules + pre-installed GitHub Actions/CLI.

**Version verification:** [VERIFIED: in-repo grep] `peter-evans/create-pull-request@v8` appears at `.github/workflows/v40-auto-fix.yml:203` and `.github/workflows/v40-deps-update.yml:104` — canonical pin already established. No registry check needed; the action is consumed via GitHub Actions, not npm.

## Package Legitimacy Audit

**Status:** N/A — Phase 44 introduces ZERO new npm dependencies and ZERO new GitHub Actions. All artifacts reuse:
- `peter-evans/create-pull-request@v8` (already pinned in 2 workflows)
- `actions/checkout@v4`, `actions/setup-node@v4` (already pinned)
- Project-internal Node modules (`scripts/promote-from-quarantine.mjs`, `scripts/verify-single-case.mjs`, `scripts/build-auto-fix-pr-body.mjs`)
- `gh` CLI (pre-installed on `ubuntu-latest` runners; not an installable dependency)

slopcheck not invoked — no install step exists.

## Architecture Patterns

### System Architecture Diagram

```
auto-fix/* PR merged to main (carries `auto-fix:verified` label)
    │
    ▼
v40-auto-promote.yml triggers on pull_request:[closed]
    │
    ├─[workflow-level if]─ merged == true ─┐
    │                                       ├─ if FAIL → workflow exits, no job runs
    └─[workflow-level if]─ has 'auto-fix:verified' ─┘
    │
    ▼ (one job, runs to completion)
auto-fix-promote.mjs --pr <n>
    │
    ├─ Step A: gh pr view <n> --json body,labels,number
    │           parse `<!-- source_issue: <m> -->` from body
    │           fallback: parse `Fixes #<m>` from commit message
    │
    ├─ Step B: gh issue view <m> --json labels
    │
    ├─ Step C: assertTripleGate({prLabels, merged, sourceIssueLabels})
    │           ├─ leg 1: prLabels.includes('auto-fix:verified')  → else throw
    │           ├─ leg 2: merged === true                          → else throw
    │           └─ leg 3: sourceIssueLabels.includes('triage')     → else throw
    │
    ├─ Step D: import { runPromote } from '../scripts/promote-from-quarantine.mjs'
    │          runPromote({ id: <caseId>, confirm: true, _skipCiGuard: true })
    │           ├─ mutates tests/test-cases.js + tests/e2e/test-cases-quarantine.js
    │           └─ regenerates baseline via update-golden.js
    │
    ├─ Step E: workflow step — peter-evans/cpr@v8
    │          branch: auto-promote/<source-issue>-<caseId>
    │          title: "auto-promote: add <caseId> to test-cases.js"
    │          body: cites auto-fix PR #<n> + source issue #<m>
    │          delete-branch: true, draft: false
    │           → opens auto-promote/* PR for HUMAN review
    │
    ├─ Step F: gh issue close <m> --reason completed
    │          --comment "Fixed in PR #<n> (auto-promote PR #<auto-promote-pr>)"
    │
    └─ Step G: post-merge verifier re-check
                git checkout origin/main          ← NOT the squash-merge SHA
                node scripts/verify-single-case.mjs --case <caseId> --runs 1
                if exit != 0 → gh issue create --label e2e-nightly --label WRONG_CITATION --label post-merge-regression
```

### Recommended Project Structure (new files only)
```
scripts/
├── auto-fix-promote.mjs          # NEW — CLI shim (parseArgs + gh wrappers + runPromote call)
└── auto-fix-promote-gate.mjs     # NEW — pure-function assertTripleGate (Vitest-testable)
                                  #   OR inline both in auto-fix-promote.mjs and export
                                  #   assertTripleGate for Vitest; planner picks shape

.github/workflows/
└── v40-auto-promote.yml          # NEW — pull_request:closed → script + cpr@v8 + verifier

tests/
├── unit/
│   └── auto-fix-promote-gate.test.js     # NEW — triple-gate Vitest (per-leg rejection)
│   └── build-auto-fix-pr-body.test.js    # EXTEND — add source_issue assertion
└── e2e/scripts/
    └── v40-auto-promote-yaml.test.js     # NEW — YAML static-grep contract (~20 cases)
```

**RECOMMEND single-module shape:** Export `assertTripleGate` from `scripts/auto-fix-promote.mjs` (mirrors Phase 43's `build-auto-fix-pr-body.mjs` which is also CLI shim + named exports). Splitting into a separate `lib/triple-gate.js` adds a file without testability benefit; Vitest can mock argv and import the pure function from the same file.

### Pattern 1: Triple-Gate Assertion Module

**What:** Pure function `assertTripleGate({prLabels, merged, sourceIssueLabels})` that throws `Error('TRIPLE_GATE_FAILED: <leg> — <details>')` on any failed precondition; returns void on success.

**When to use:** Before invoking `runPromote({_skipCiGuard:true})` — and ONLY there.

**Example:**
```js
// scripts/auto-fix-promote.mjs (excerpt — pure-function export)
export function assertTripleGate({ prLabels, merged, sourceIssueLabels } = {}) {
  if (!Array.isArray(prLabels) || !prLabels.includes('auto-fix:verified')) {
    throw new Error("TRIPLE_GATE_FAILED: prLabels — missing 'auto-fix:verified'");
  }
  if (merged !== true) {
    throw new Error('TRIPLE_GATE_FAILED: merged — pull request not merged');
  }
  if (!Array.isArray(sourceIssueLabels) || !sourceIssueLabels.includes('triage')) {
    throw new Error("TRIPLE_GATE_FAILED: sourceIssueLabels — source issue missing 'triage'");
  }
}
```

Vitest covers each leg:
```js
it('rejects when auto-fix:verified label missing', () => {
  expect(() => assertTripleGate({ prLabels: ['triage'], merged: true, sourceIssueLabels: ['triage'] }))
    .toThrow(/TRIPLE_GATE_FAILED: prLabels/);
});
it('rejects when merged=false (PR closed without merging)', () => {
  expect(() => assertTripleGate({ prLabels: ['auto-fix:verified'], merged: false, sourceIssueLabels: ['triage'] }))
    .toThrow(/TRIPLE_GATE_FAILED: merged/);
});
it('rejects when source issue lacks triage', () => {
  expect(() => assertTripleGate({ prLabels: ['auto-fix:verified'], merged: true, sourceIssueLabels: [] }))
    .toThrow(/TRIPLE_GATE_FAILED: sourceIssueLabels/);
});
it('passes when all three legs satisfied', () => {
  expect(() => assertTripleGate({ prLabels: ['auto-fix:verified'], merged: true, sourceIssueLabels: ['triage'] }))
    .not.toThrow();
});
```

### Pattern 2: Two-PR Choreography (auto-fix PR → auto-promote PR)

**What:** The auto-fix PR (`auto-fix/*` branch) merges first carrying ONLY src/ fixes (diff-guard prevents `tests/test-cases.js` modification). A separate `auto-promote/*` PR then carries the test-cases.js addition — reviewed by `@tonyrowles` (CODEOWNER) as a SECOND human gate.

**When to use:** Always, for v4.0 promote flow. Never combine into a single PR — that would either bypass diff-guard or block the auto-fix workflow.

**Critical routing:** The Phase 41 verifier-gate (`.github/workflows/v40-verifier-gate.yml`) triggers on `auto-fix/*` head branches **only**. The auto-promote PR uses branch prefix `auto-promote/*` — verifier-gate does NOT fire on it. This is correct: the auto-promote PR is content-additive (adding a known-good case to the golden corpus), not a code fix. CODEOWNERS provides the load-bearing review gate.

### Pattern 3: Source Issue Closure

**What:** After successful auto-promote PR creation, close the source `triage` issue with a comment cross-linking both PRs.

**When to use:** ALWAYS after Step E succeeds; never before (CODEOWNERS could still reject the auto-promote PR — but the auto-fix merged commit IS the fix-landed signal, and a human can re-open if needed).

**Example:**
```bash
gh issue close ${SOURCE_ISSUE} \
  --reason completed \
  --comment "Fixed in PR #${AUTO_FIX_PR} (auto-promote PR #${AUTO_PROMOTE_PR})"
```

### Pattern 4: Post-Merge Verifier Re-Check (Squash-Merge Safe)

**What:** After auto-promote PR creation, the workflow checks out **`origin/main` HEAD** (NOT the squash-merge SHA — squash rewrites history and the SHA in `github.event.pull_request.merge_commit_sha` may not exist on main if rebase-and-merge was used) and runs `verify-single-case` for the affected case.

**Example:**
```yaml
- name: Re-check on main HEAD (squash-merge regression detector)
  id: postmerge
  continue-on-error: true
  run: |
    git fetch origin main
    git checkout origin/main
    node scripts/verify-single-case.mjs --case "${{ steps.parse.outputs.case_id }}" --runs 1

- name: File regression issue on verifier fail
  if: steps.postmerge.outcome == 'failure'
  env:
    REPO: ${{ github.repository }}
    CASE_ID: ${{ steps.parse.outputs.case_id }}
  run: |
    gh issue create \
      --repo "$REPO" \
      --title "post-merge regression: $CASE_ID" \
      --label e2e-nightly \
      --label WRONG_CITATION \
      --label post-merge-regression \
      --body "Auto-fix PR #${{ github.event.pull_request.number }} merged but verifier on main HEAD fails on case $CASE_ID."
```

### Anti-Patterns to Avoid

- **Direct push to `main` from auto-promote workflow:** v4.0 explicit out-of-scope (REQUIREMENTS.md "Direct-to-main commits from auto-promote"). The auto-promote PR is the gate. **Pinned by YAML test:** `expect(yaml).not.toMatch(/git push origin main/)`.
- **Re-using `auto-fix/*` branch prefix for auto-promote PR:** Would trigger Phase 41 verifier-gate against a PR that intentionally mutates `tests/test-cases.js` (which the diff-guard rejects). Use `auto-promote/*` prefix.
- **`gh pr merge --auto` on the auto-promote PR:** Same human-gate concern as Phase 43. **Pinned by YAML test:** `expect(yaml).not.toMatch(/gh pr merge.*--auto/)`.
- **Checking out the merged commit (`github.event.pull_request.merge_commit_sha`) for the post-merge verifier:** Squash-merge can rewrite SHA; the safe reference is `origin/main` HEAD.
- **Closing the source issue BEFORE confirming auto-promote PR opened:** If `cpr@v8` fails (network, branch conflict), the issue is closed but no promotion PR exists. Order: open PR first, then close issue.
- **Modifying `scripts/promote-from-quarantine.mjs` to add `_skipCiGuard`:** Already exists since Phase 35 (line 123). Do not re-add. JSDoc the **caller** (auto-fix-promote.mjs) with the "only after triple-gate" contract.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Add `_skipCiGuard` to runPromote | New `if (opts._skipCiGuard) skip(...)` branch | **Already exists** — `scripts/promote-from-quarantine.mjs:123 + :131`. Import and call with `_skipCiGuard: true` | CONTEXT is factually wrong; the param landed in Phase 35 WR-05 |
| Quarantine→golden mutation | New file-read/edit/write logic | `runPromote({id, confirm:true, _skipCiGuard:true})` from existing module | Existing implementation has atomic writes, rollback on partial failure (WR-08), update-golden.js spawn (WR-06), and full Vitest coverage |
| Open follow-up PR | Raw `gh pr create` | `peter-evans/create-pull-request@v8` | Handles branch idempotency on re-run (if workflow retries, cpr@v8 updates the existing PR instead of failing) |
| Issue closure with cross-link | Custom GraphQL mutation | `gh issue close --reason completed --comment` | Pre-installed; one CLI call |
| Parse PR body / labels | Regex `<!-- source_issue:` against raw text | `gh pr view <n> --json body,labels,number` then JSON parse | gh handles HTML/markdown unicode quirks |
| Squash-merge SHA tracking | Compare `merge_commit_sha` to main history | `git fetch origin main && git checkout origin/main` | The merged SHA may be rebase-rewritten; main HEAD is the ground truth for "what's actually live" |

**Key insight:** Phase 44 is **integration**, not new primitives. Every load-bearing capability already exists — Phase 41's verifier shim, Phase 35's runPromote, Phase 43's PR-body helper, Phase 40's cpr@v8 pattern. The only NEW Node code is the ~80-LOC `auto-fix-promote.mjs` (parseArgs + gh wrappers + assertTripleGate + runPromote call).

## Common Pitfalls

### Pitfall 1: `pull_request: closed` fires on close-without-merge

**What goes wrong:** `on: pull_request: { types: [closed] }` fires for BOTH merged PRs AND PRs closed without merging. A reviewer who closes a draft auto-fix PR without merging would trigger the workflow.
**Why it happens:** GitHub's webhook semantics — `closed` is a state transition, not a merge signal.
**How to avoid:** Job-level (or workflow-level) `if: github.event.pull_request.merged == true && contains(github.event.pull_request.labels.*.name, 'auto-fix:verified')`. The `merged` check IS the discriminator.
**Warning signs:** Workflow run history shows runs for closed-without-merge PRs.
**Confidence:** HIGH — documented behavior, pinned by Phase 43 precedent (its workflow correctly filters `merged == true` is not yet wired since auto-fix runs on issues.labeled — but the same expression is used in v40-auto-fix.yml step `if`s).

### Pitfall 2: Squash-merge SHA drift (PROMOTE-04 load-bearing)

**What goes wrong:** When the auto-fix PR squash-merges, `github.event.pull_request.merge_commit_sha` is the squash commit; if the repo uses rebase-and-merge, the original PR commits are rewritten onto main, and the merge_commit_sha may not correspond to what `main` HEAD looks like. Running the verifier against `merge_commit_sha` could miss content-drift introduced by other PRs merged between auto-fix merge and verifier execution.
**Why it happens:** Squash/rebase rewrite history; the SHA at PR-merge time is not the same SHA at workflow-execution time.
**How to avoid:** `git fetch origin main && git checkout origin/main` — always re-check against current main HEAD. PROMOTE-04 explicitly requires this ("NOT the merged commit").
**Warning signs:** Verifier passes on `merge_commit_sha` but fails on `main` HEAD when manually re-run.
**Confidence:** HIGH — explicit in CONTEXT + REQUIREMENTS.md PROMOTE-04 wording.

### Pitfall 3: Source-issue identification fragility

**What goes wrong:** The Phase 43 PR body builder does NOT currently emit `<!-- source_issue: N -->` (verified by reading scripts/build-auto-fix-pr-body.mjs:21-38 — emits `affected_cases`, `error_class`, `fingerprint`, `fix_attempts`, `model`, `ledger_iso`, and inline `Source issue: #${issue}` text, but no source_issue HTML comment). Phase 44 must extend the helper, OR fall back to commit-message parsing (`Fixes #<n>` per the cpr@v8 commit-message in v40-auto-fix.yml:214 which is `"Fix #${ISSUE}: ${ERROR_CLASS}"`).
**Why it happens:** Phase 43 didn't anticipate auto-promote consumption — only verifier-gate consumption (which uses `affected_cases`).
**How to avoid:** **Modify build-auto-fix-pr-body.mjs** to add `<!-- source_issue: ${issue} -->` as a SECOND HTML comment (line 2 or after the affected_cases comment). Update the existing Vitest contract in `tests/unit/build-auto-fix-pr-body.test.js` to assert the new field. Implement the fallback (commit-message grep `Fix #N` or `Fixes #N`) in auto-fix-promote.mjs as belt-and-suspenders.
**Warning signs:** auto-fix-promote.mjs unable to identify source issue → exits with `TRIPLE_GATE_FAILED: cannot identify source issue`.
**Confidence:** HIGH — verified by direct read of build-auto-fix-pr-body.mjs (lines 21-38).

### Pitfall 4: Diff-guard rejects auto-promote PR if branch prefix wrong

**What goes wrong:** Phase 41's verifier-gate workflow filters PR heads matching `auto-fix/*` (see VFY-GATE-01 spec). The diff-guard regex bank rejects PRs touching `tests/test-cases.js`. If the auto-promote PR's branch is named `auto-fix/promote-*` (or any prefix matching `auto-fix/`), it triggers verifier-gate → diff-guard → rejection → CODEOWNER (human) cannot even start review.
**Why it happens:** Branch-prefix routing in GitHub Actions is opt-in (no Phase 41 workflow YAML enforces "branch NOT matching auto-promote/*") — the safety relies on Phase 44 picking a distinct prefix.
**How to avoid:** Branch MUST be `auto-promote/<source-issue>-<case-id>` (or `auto-promote/<source-issue>-<fp8>` per CONTEXT specifics). Pinned by YAML test asserting `branch: auto-promote/` appears and no `auto-fix/` appears as the cpr@v8 branch input.
**Warning signs:** Auto-promote PR opens but immediately fails verifier-gate check.
**Confidence:** HIGH — CONTEXT decision #4 + Phase 41 routing semantics confirmed.

### Pitfall 5: `runPromote` rollback leaves the workflow in an unknown state

**What goes wrong:** `runPromote` (scripts/promote-from-quarantine.mjs:236-269) rolls back BOTH corpora on any Step 3/4/5 failure. If the rollback succeeds, exit code 1 + a clean working tree. The workflow next runs cpr@v8 — but there's nothing to commit. cpr@v8 then exits 0 without creating a PR (`steps.cpr.outputs.pull-request-url` is empty). The subsequent issue-close step still fires (it checks dispatcher exit, not cpr output) → issue closed, no PR exists, the case is unpromoted.
**Why it happens:** The auto-promote workflow trusts runPromote's exit code as the gate but doesn't gate downstream steps on cpr@v8 having actually created a PR.
**How to avoid:** Each downstream step (issue-close, verifier re-check) gated on `if: steps.cpr.outputs.pull-request-url != ''`. Same pattern as v40-auto-fix.yml:222 (Phase 43's "Cross-link draft PR on source issue" step).
**Warning signs:** Workflow run shows runPromote exit-1 + issue closed + no PR opened.
**Confidence:** HIGH — verified by direct read of runPromote rollback path (lines 244-264).

### Pitfall 6: ESLint `no-restricted-imports` on scripts/ directory

**What goes wrong:** Phase 35's ESLint discipline restricts `test/` imports from `src/`. The new `scripts/auto-fix-promote.mjs` will import `runPromote` from `scripts/promote-from-quarantine.mjs` — same directory, no restriction. But it MUST NOT import anything from `src/` or `tests/e2e/lib/`. If the planner accidentally imports `lib/llm-driver.js` (e.g., for ledger logging), an ESLint rule may fire OR (worse) bring in the v3.1 CI-gate that blocks the SDK transport.
**Why it happens:** Confusion between v3.1 subscription-locked llm-driver and v4.0 SDK transport boundaries (Pitfall 8 in PITFALLS.md).
**How to avoid:** auto-fix-promote.mjs imports ONLY from: `node:*`, `scripts/promote-from-quarantine.mjs`. No `tests/e2e/lib/*`, no `src/*`. If ledger entry is desired (for audit-trail per CONTEXT code_context), defer to Phase 45/47 — it's not load-bearing.
**Confidence:** MEDIUM — depends on whether planner agrees ledger-entry is deferrable. Recommend omit to keep imports minimal.

### Pitfall 7: Concurrency race — auto-fix PR retry merges twice

**What goes wrong:** If two `auto-fix:verified` label-add events fire on the same PR (label removed then re-added by a human or by Phase 41), and the workflow concurrency group keys on `pull_request.number`, the second event waits. But `pull_request:[closed]` fires on the merge event ONLY — re-labeling doesn't re-fire `closed`. So this is actually safer than Phase 43.
**However:** If two distinct PRs merge in quick succession, both fire `pull_request:[closed]` → both invoke `runPromote` against different cases → both try to push to `tests/test-cases.js` simultaneously → second cpr@v8 invocation sees a stale main and either rebases or fails.
**How to avoid:** `concurrency: { group: v40-auto-promote-${{ github.event.pull_request.number }}, cancel-in-progress: false }` — per-PR keying allows parallelism across different PRs (which is desired). The two PRs operate on different cases and produce different auto-promote branches; cpr@v8's `branch:` input provides idempotency at the GitHub level. If push-to-main is needed (it isn't — we open a PR, not push), THAT would race; the two-PR design eliminates the race.
**Confidence:** HIGH — verified by reading Phase 43 concurrency pattern.

### Pitfall 8: Comment-paraphrase scar (Phase 40-03 / 41-03 / 43-01)

**What goes wrong:** YAML grep tests assert NEGATIVE constraints like `expect(yaml).not.toMatch(/gh pr merge.*--auto/)`. If the workflow YAML's narrative header comment contains the literal phrase "we do NOT use `gh pr merge --auto`...", the negative-grep fires on the comment.
**Why it happens:** Documented project scar — Phase 43 already auto-fixed this by paraphrasing "the gh pr merge auto-flag" in comments and reserving literals for assertion bodies only.
**How to avoid:** **Mandatory** for all narrative comments in `.github/workflows/v40-auto-promote.yml` AND `tests/e2e/scripts/v40-auto-promote-yaml.test.js`:
- Paraphrase: "the gh pr merge auto-flag" (NOT `gh pr merge --auto`)
- Paraphrase: "the action auto-merge input" (NOT `auto-merge: true`)
- Paraphrase: "the Identity-token write permission" (NOT `id-token: write`)
- Paraphrase: "the actions-write permission" (NOT `actions: write`)
- Paraphrase: "the pull-request-target trigger variant" (NOT `pull_request_target`)
- Paraphrase: "the skip-ci marker" (NOT `[skip ci]`)
**Warning signs:** YAML test fails on a comment line, not an actual workflow setting.
**Confidence:** HIGH — direct documented scar in Phase 43 SUMMARY (line 224-244).

## Runtime State Inventory

**Status:** N/A — Phase 44 is greenfield workflow + script additions. No rename/refactor/migration involved.

## Code Examples

Verified patterns from in-repo sources:

### Workflow trigger + filter (PROMOTE-01)
```yaml
# Source: paraphrased from v40-auto-fix.yml:43-67
name: V40 Auto Promote

on:
  pull_request:
    types: [closed]

concurrency:
  group: v40-auto-promote-${{ github.event.pull_request.number }}
  cancel-in-progress: false

permissions:
  contents: write       # runPromote writes test-cases.js + quarantine corpus
  pull-requests: write  # cpr@v8 opens auto-promote PR
  issues: write         # gh issue close + gh issue create (regression)

jobs:
  auto-promote:
    if: github.event.pull_request.merged == true && contains(github.event.pull_request.labels.*.name, 'auto-fix:verified')
    runs-on: ubuntu-latest
    timeout-minutes: 15
    env:
      GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### cpr@v8 invocation for auto-promote PR (PROMOTE-02)
```yaml
# Source: adapted from v40-auto-fix.yml:200-219
- name: Open auto-promote PR
  id: cpr
  uses: peter-evans/create-pull-request@v8
  with:
    token: ${{ secrets.GITHUB_TOKEN }}
    branch: auto-promote/${{ steps.parse.outputs.source_issue }}-${{ steps.parse.outputs.case_id }}
    base: main
    draft: false       # ready for immediate human review
    delete-branch: true
    title: "auto-promote: add ${{ steps.parse.outputs.case_id }} to test-cases.js"
    body-path: /tmp/auto-promote-pr-body.md
    commit-message: "auto-promote: add ${{ steps.parse.outputs.case_id }}"
    labels: |
      auto-promote
      ${{ steps.parse.outputs.error_class }}
    signoff: false
```

### Source-issue close (PROMOTE-03)
```yaml
- name: Close source issue
  if: steps.cpr.outputs.pull-request-url != ''
  env:
    SOURCE_ISSUE: ${{ steps.parse.outputs.source_issue }}
    AUTO_FIX_PR: ${{ github.event.pull_request.number }}
    AUTO_PROMOTE_URL: ${{ steps.cpr.outputs.pull-request-url }}
  run: |
    gh issue close "$SOURCE_ISSUE" \
      --reason completed \
      --comment "Fixed in PR #$AUTO_FIX_PR (auto-promote PR $AUTO_PROMOTE_URL)"
```

### Post-merge verifier re-check (PROMOTE-04)
```yaml
- name: Re-check on main HEAD
  id: postmerge
  if: steps.cpr.outputs.pull-request-url != ''
  continue-on-error: true
  run: |
    git fetch origin main
    git checkout origin/main
    node scripts/verify-single-case.mjs --case "${{ steps.parse.outputs.case_id }}" --runs 1

- name: File regression issue on verifier failure
  if: steps.postmerge.outcome == 'failure'
  env:
    REPO: ${{ github.repository }}
    CASE_ID: ${{ steps.parse.outputs.case_id }}
    AUTO_FIX_PR: ${{ github.event.pull_request.number }}
  run: |
    gh issue create \
      --repo "$REPO" \
      --title "post-merge regression: $CASE_ID" \
      --label e2e-nightly \
      --label WRONG_CITATION \
      --label post-merge-regression \
      --body "Auto-fix PR #$AUTO_FIX_PR merged but the verifier fails on main HEAD for case $CASE_ID. Investigate squash-merge SHA drift or post-merge content changes."
```

### Existing runPromote signature (already in repo — DO NOT re-implement)
```js
// Source: scripts/promote-from-quarantine.mjs:115-271 — VERIFIED in-repo
export async function runPromote(opts = {}) {
  const goldenPath        = opts.goldenPath        ?? GOLDEN_CORPUS_PATH;
  const quarantinePath    = opts.quarantinePath    ?? QUARANTINE_CORPUS_PATH;
  const updateGoldenScript = opts.updateGoldenScript ?? UPDATE_GOLDEN_SCRIPT;
  const cwd               = opts.cwd              ?? PROJECT_ROOT;
  const spawn             = opts.spawn            ?? spawnSync;
  const stdout            = opts.stdout           ?? process.stdout;
  const stderr            = opts.stderr           ?? process.stderr;
  const skipCiGuard       = opts._skipCiGuard     ?? false;   // ← ALREADY EXISTS
  // ...
  if (!skipCiGuard && ciActive) { return { exitCode: 1 }; }   // ← line 131
  // ...
  // returns: { exitCode: 0|1, action?: 'dry-run'|'promoted', spawnArgs? }
}
```

**Phase 44 caller signature:**
```js
import { runPromote } from './promote-from-quarantine.mjs';

const result = await runPromote({
  id: caseId,
  confirm: true,           // mutate, don't dry-run
  _skipCiGuard: true,      // ONLY safe because triple-gate passed above
});
if (result.exitCode !== 0) {
  throw new Error(`runPromote failed (exit ${result.exitCode})`);
}
```

### Phase 43 helper extension — `source_issue` HTML comment
```diff
# Source: scripts/build-auto-fix-pr-body.mjs:21-38 (current implementation)
   return [
     `<!-- affected_cases: ${casesCsv} -->`,
+    `<!-- source_issue: ${issue} -->`,
     '',
     `Auto-fix draft PR for issue #${issue} (\`${branch}\`).`,
     '',
```

And update `tests/unit/build-auto-fix-pr-body.test.js` (the Phase 43 contract, 6 Vitest cases B1-B6) to add a 7th assertion: `expect(body).toContain('<!-- source_issue: 42 -->')`.

### YAML test patterns (mirror Phase 43's v40-auto-fix-yaml.test.js style)

~20 cases recommended (matching Phase 43's 22-case density):

| # | Group | What it pins | Example assertion |
|---|-------|--------------|-------------------|
| A1 | trigger | `pull_request:[closed]` | `expect(yaml).toMatch(/pull_request:\s*\n\s*types:\s*\[closed\]/)` |
| A2 | filter | `merged == true` in job if | `expect(yaml).toMatch(/github\.event\.pull_request\.merged\s*==\s*true/)` |
| A3 | filter | `auto-fix:verified` label gate | `expect(yaml).toContain("contains(github.event.pull_request.labels.*.name, 'auto-fix:verified')")` |
| A4 | concurrency | per-PR keying | `expect(yaml).toContain('group: v40-auto-promote-${{ github.event.pull_request.number }}')` |
| A5 | concurrency | `cancel-in-progress: false` | mirrors Phase 43 A4 |
| A6 | permissions | `contents: write`, `pull-requests: write`, `issues: write` | three .toContain |
| A7 | parse | source_issue comment regex | `expect(yaml).toMatch(/source_issue/)` somewhere in parse step |
| A8 | runPromote | invocation present | `expect(yaml).toMatch(/auto-fix-promote\.mjs/)` |
| A9 | branch | `auto-promote/` prefix | `expect(yaml).toContain('branch: auto-promote/')` |
| A10 | branch | NO `auto-fix/` prefix in cpr@v8 branch input | negative grep |
| A11 | cpr@v8 | pinned to v8 | `expect(yaml).toContain('peter-evans/create-pull-request@v8')` |
| A12 | cpr@v8 | `draft: false` (auto-promote is review-ready) | `expect(yaml).toContain('draft: false')` |
| A13 | cpr@v8 | `delete-branch: true` (throwaway) | `expect(yaml).toContain('delete-branch: true')` |
| A14 | issue close | `gh issue close` invocation | `expect(yaml).toMatch(/gh issue close/)` |
| A15 | issue close | gated on cpr output | `expect(yaml).toMatch(/steps\.cpr\.outputs\.pull-request-url/)` |
| A16 | verifier | re-check via verify-single-case | `expect(yaml).toMatch(/verify-single-case\.mjs/)` |
| A17 | verifier | checks out `origin/main` (NOT merge SHA) | `expect(yaml).toMatch(/git checkout origin\/main/)` + negative on `merge_commit_sha` |
| A18 | regression | 3-label gh issue create | three .toMatch for `--label e2e-nightly`, `--label WRONG_CITATION`, `--label post-merge-regression` |
| X1 | no-direct-push | does NOT push to main | `expect(yaml).not.toMatch(/git push origin main/)` |
| X2 | no-PAT | uses GITHUB_TOKEN only | `expect(yaml).not.toMatch(/secrets\.[A-Z_]*PAT[A-Z_]*/)` |
| X3 | no-auto-merge | does NOT use the auto-flag | `expect(yaml).not.toMatch(/gh pr merge.*--auto/)` (paraphrase the literal in narrative) |
| X4 | no-pull_request_target | uses pull_request only | `expect(yaml).not.toMatch(/pull_request_target/)` (paraphrase) |
| X5 | no-id-token | absent | `expect(yaml).not.toMatch(/id-token:\s*write/)` (paraphrase) |

## State of the Art

| Old Approach (v3.1) | Current Approach (v4.0 Phase 44) | When Changed | Impact |
|---------------------|----------------------------------|--------------|--------|
| Manual `node scripts/promote-from-quarantine.mjs --id <case> --confirm` from a dev's terminal | CI-invoked `runPromote({_skipCiGuard:true})` after triple-gate proof | This phase | Closes the loop without sacrificing the human-gate (auto-promote PR is the human review point) |
| Single PR carries fix + test-cases.js addition | TWO PRs: auto-fix (src only, diff-guard enforced) + auto-promote (test-cases.js only, CODEOWNER review) | This phase | Preserves v4.0 diff-guard invariant + adds explicit human gate for golden corpus mutation |
| No post-merge regression detection | Verifier re-check on main HEAD; failure files `post-merge-regression` issue | This phase | Catches squash-merge / rebase artifacts that pass per-PR verifier but break on main |

**Deprecated/outdated:** None — Phase 44 is purely additive.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `peter-evans/create-pull-request@v8` `delete-branch: true` removes the auto-promote/* branch after PR merge | `## Code Examples/cpr@v8 invocation` | If wrong, dead branches accumulate (cosmetic only) |
| A2 | `gh issue close --reason completed` is a valid flag in gh 2.x (the version pre-installed on ubuntu-latest) | `## Pattern 3` | If wrong, the issue-close step fails — but the auto-promote PR is already opened, so promotion succeeds; recoverable by manual close |
| A3 | `tests/e2e/scripts/v40-auto-fix-yaml.test.js` pattern is the canonical YAML-test style | `## Code Examples/YAML test patterns` | If wrong, planner uses a different style; tests still work |
| A4 | The auto-fix PR's commit message is `Fix #${ISSUE}: ${ERROR_CLASS}` (from v40-auto-fix.yml:214) — confirmed by direct read | `## Pitfall 3` (commit-message fallback regex) | LOW — verified |

**Recommendation:** A1-A4 are low-risk; no user confirmation needed pre-plan. The single decision worth flagging to user: **CONTEXT's claim that `_skipCiGuard` needs to be added** is wrong (see User Constraints override). Planner must explicitly acknowledge this or re-check with discuss-phase.

## Open Questions

1. **Phase 43 helper extension OR commit-message fallback only?**
   - What we know: build-auto-fix-pr-body.mjs does NOT emit `<!-- source_issue: N -->` today (verified). The cpr@v8 commit message in v40-auto-fix.yml is `Fix #${ISSUE}: ${ERROR_CLASS}` (verified).
   - What's unclear: CONTEXT recommends "modify Phase 43's helper" but also says "fall back to commit-message parsing." Belt-and-suspenders is cleanest but adds a task.
   - Recommendation: Do BOTH — extend helper (1-line change + extend B-test) AND parse `Fixes #N` / `Fix #N` from commit as fallback. ~10 LOC total in auto-fix-promote.mjs.

2. **Should `auto-fix-promote.mjs` write a ledger entry (`appendLedgerEntry({phase: '44-auto-promote'})`)?**
   - What we know: CONTEXT code_context mentions "no SDK cost; zero-cost entries documenting the promotion event."
   - What's unclear: Importing `tests/e2e/lib/llm-ledger.js` from `scripts/` may trip ESLint or pull in Pitfall 8's transport-confusion risk.
   - Recommendation: DEFER. Audit-trail value is low; the auto-promote PR + closed issue + cpr@v8 commit message provide adequate trail. If desired, add in Phase 47 cleanup.

3. **Where does the `case_id` come from?**
   - What we know: PROMOTE-04 says "post-merge verifier re-check on the affected case" — singular. The auto-fix PR body's `<!-- affected_cases: id1,id2 -->` may have MULTIPLE cases.
   - What's unclear: Does runPromote run N times (once per case) or once on the first/only case?
   - Recommendation: Per CONTEXT deferred-ideas "default all-or-nothing", call runPromote ONCE per affected_case in a loop. If `affected_cases` has 2 entries, open 2 auto-promote PRs (or 1 PR adding both cases) and re-check both. PLANNER MUST DECIDE: loop vs single — recommend loop (simpler reasoning per case).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `gh` CLI | source-issue parse, close, regression issue create | ✓ (pre-installed on ubuntu-latest) | gh ≥ 2.0 | — |
| `git` | checkout `origin/main` for post-merge verifier | ✓ (pre-installed) | git ≥ 2.40 | — |
| Node 22 | auto-fix-promote.mjs, runPromote, verify-single-case.mjs | ✓ (actions/setup-node@v4) | 22 LTS | — |
| `peter-evans/create-pull-request@v8` | auto-promote PR creation | ✓ (project-pinned, verified at v40-auto-fix.yml:203 + v40-deps-update.yml:104) | v8 | — |
| `actions/checkout@v4`, `actions/setup-node@v4` | runtime setup | ✓ (project-pinned) | v4 | — |
| Repo secrets: `GITHUB_TOKEN` | all gh / cpr@v8 operations | ✓ (default workflow secret) | — | — |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (project-standard, verified in package.json + Phase 42/43 tests) |
| Config file | `vitest.config.js` (project-standard) |
| Quick run command | `npx vitest run tests/unit/auto-fix-promote-gate.test.js tests/e2e/scripts/v40-auto-promote-yaml.test.js` |
| Full suite command | `npm run test:src` |
| Phase gate | All new tests green + Phase 43 baseline preserved (`tests/unit/build-auto-fix-pr-body.test.js` extended to 7 cases must still pass) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PROMOTE-01 | Trigger filter (merged + label) pinned | YAML grep (A1, A2, A3) | `npx vitest run tests/e2e/scripts/v40-auto-promote-yaml.test.js -t "A1\|A2\|A3"` | ❌ Wave 0 |
| PROMOTE-01 | Triple-gate per-leg rejection | Vitest (T1-T4) | `npx vitest run tests/unit/auto-fix-promote-gate.test.js` | ❌ Wave 0 |
| PROMOTE-02 | No direct-to-main push | YAML grep (X1) | `npx vitest run tests/e2e/scripts/v40-auto-promote-yaml.test.js -t "X1"` | ❌ Wave 0 |
| PROMOTE-02 | cpr@v8 branch is `auto-promote/*` | YAML grep (A9, A10) | `-t "A9\|A10"` | ❌ Wave 0 |
| PROMOTE-03 | `gh issue close` with comment | YAML grep (A14, A15) | `-t "A14\|A15"` | ❌ Wave 0 |
| PROMOTE-04 | verify-single-case re-check on main HEAD | YAML grep (A16, A17) | `-t "A16\|A17"` | ❌ Wave 0 |
| PROMOTE-04 | 3-label regression issue | YAML grep (A18) | `-t "A18"` | ❌ Wave 0 |
| Phase 43 helper extension | source_issue HTML comment | Vitest (extend B-tests) | `npx vitest run tests/unit/build-auto-fix-pr-body.test.js` | ✅ (extend existing) |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/unit/auto-fix-promote-gate.test.js tests/e2e/scripts/v40-auto-promote-yaml.test.js tests/unit/build-auto-fix-pr-body.test.js` (≤5s)
- **Per wave merge:** `npm run test:src` (~30s)
- **Phase gate:** Full suite green + manual `grep -c` audits for comment-paraphrase scar before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/auto-fix-promote-gate.test.js` — covers PROMOTE-01 triple-gate (4 cases: 3 rejection legs + 1 happy path)
- [ ] `tests/e2e/scripts/v40-auto-promote-yaml.test.js` — covers PROMOTE-01/02/03/04 workflow contract (~22 cases A1-A18 + X1-X5)
- [ ] Extend `tests/unit/build-auto-fix-pr-body.test.js` — add 7th assertion for `source_issue` HTML comment

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `secrets.GITHUB_TOKEN` only (workflow-scoped, expires per run); no PATs |
| V3 Session Management | no | — (workflow is stateless) |
| V4 Access Control | yes | Workflow permissions block (least-privilege: contents/pull-requests/issues write ONLY) + branch protection on main (Phase 39 setup, Pitfall 4) |
| V5 Input Validation | yes | `gh pr view --json` returns structured JSON (not free-form text — prevents `${{ }}` injection); case_id passed through `sanitizeCaseId` inside runPromote (line 142) |
| V6 Cryptography | no | — |

### Known Threat Patterns for {GitHub Actions + LLM-adjacent CI}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| PR body / issue body injection via `${{ }}` interpolation | Tampering / Elevation | Pass via `env:` block (auto-escaped), read in script as `process.env.X` (Pitfall 1 from PITFALLS.md; v40-auto-fix.yml uses this pattern via /tmp/pr-body.md) |
| Concurrency race opens duplicate auto-promote PRs | DoS / Tampering | Per-PR concurrency group; cpr@v8 branch-name idempotency (Pitfall 7) |
| Auto-merge of auto-promote PR (bypasses CODEOWNER) | Elevation | `draft: false` is OK because branch protection requires CODEOWNER review (Phase 39); no `gh pr merge --auto` anywhere in workflow (Pitfall 4) |
| Direct push to main from CI | Tampering | YAML test X1 negatives `git push origin main`; promotion goes via auto-promote PR only |
| Source-issue close on a PR that didn't actually promote | Repudiation | Gate issue-close step on `steps.cpr.outputs.pull-request-url != ''` (Pitfall 5) |
| Squash-merge SHA drift hides regression | Tampering / Information Disclosure | Re-check against `origin/main` HEAD (PROMOTE-04 explicit, Pitfall 2) |
| `pull_request_target` substitution | Elevation | Workflow uses `pull_request` only; negative-pinned by X4 |

## Sources

### Primary (HIGH confidence — direct in-repo inspection)
- `scripts/promote-from-quarantine.mjs:115-271` — runPromote signature and existing `_skipCiGuard` parameter (lines 123, 131)
- `scripts/verify-single-case.mjs:1-80` — CLI contract (exit codes, --case / --runs / --output flags)
- `scripts/build-auto-fix-pr-body.mjs:1-70` — current PR body shape; confirmed NO source_issue comment exists today
- `.github/workflows/v40-auto-fix.yml:1-226` — comprehensive style template (cpr@v8 pattern, two-commit ledger split, permissions, concurrency, comment-paraphrase)
- `.github/workflows/v40-deps-update.yml:1-227` — cpr@v8 pattern with `delete-branch: true`, label issue creation pattern, multi-PR shape
- `tests/e2e/scripts/v40-auto-fix-yaml.test.js:1-100` — YAML grep test style template (A1-A12 + L1-L2 + X1-X8 conventions)
- `.planning/research/PITFALLS.md` Pitfall 4 (lines 209-285) — auto-merge subversion + branch protection
- `.planning/research/PITFALLS.md` Pitfall 7 (lines 415-512) — concurrency group keying
- `.planning/research/PITFALLS.md` Pitfall 8 (lines 515-582) — v3.1 invariant preservation, especially the dual-transport CI gate
- `.planning/phases/43-v40-auto-fix-yml-workflow-draft-pr-creation/43-01-SUMMARY.md` — comment-paraphrase scar + two-commit ledger split learnings

### Secondary (HIGH confidence — REQUIREMENTS.md / CONTEXT.md)
- `.planning/REQUIREMENTS.md` PROMOTE-01..04 (lines 50-53)
- `.planning/phases/44-v40-auto-promote-yml-triple-gate-skipciguard/44-CONTEXT.md` — locked decisions

### Tertiary (MEDIUM — assumed gh CLI semantics, not verified in-session)
- `gh issue close --reason completed --comment` syntax (assumed; pre-installed on ubuntu-latest)
- `gh pr view --json body,labels,number` JSON shape (assumed; standard gh)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every artifact has a verified in-repo precedent (Phase 40, 41, 43)
- Architecture (triple-gate, two-PR choreography): HIGH — explicit in CONTEXT + REQUIREMENTS; pattern matches Phase 43 design exactly
- Pitfalls: HIGH — pitfalls are inherited from PITFALLS.md Pitfalls 4, 7, 8 (already-documented project scars)
- The critical CONTEXT override (`_skipCiGuard` already exists): HIGH — verified by direct file read

**Research date:** 2026-05-31
**Valid until:** 2026-06-30 (stable — depends only on pre-pinned actions and in-repo modules)

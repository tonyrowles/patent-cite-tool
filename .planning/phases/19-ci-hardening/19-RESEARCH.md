# Phase 19: CI Hardening - Research

**Researched:** 2026-03-04
**Domain:** GitHub Actions — concurrency groups and GITHUB_TOKEN permissions
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

None — user deferred all implementation decisions to Claude's discretion.

### Claude's Discretion

- **Concurrency group key** — how to construct the group key to achieve per-branch cancellation while protecting main
- **cancel-in-progress logic** — expression or conditional approach for main vs non-main behavior
- **Permission placement** — workflow-level vs job-level `permissions` block
- **Any additional hardening** within the two requirement areas (no scope expansion)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| HARD-01 | Concurrency group cancels stale CI runs when new commits push to the same branch | Concurrency group key pattern using `github.head_ref` and `github.run_id` fallback; must protect main branch from cancellation |
| HARD-03 | Workflow uses explicit `permissions: contents: read` for least-privilege security | Workflow-level `permissions` block with `contents: read`; no write scopes needed for this read-only CI workflow |
</phase_requirements>

---

## Summary

This phase adds two hardening features to the existing `.github/workflows/ci.yml`: a concurrency group that cancels stale in-progress runs on PR and feature branches while ensuring every main-branch run completes independently, and an explicit `permissions: contents: read` declaration at the workflow level.

Both changes are small YAML additions to an existing file. The technical challenge is constructing the concurrency group key correctly. The naive approach of using `cancel-in-progress: false` for main and `true` for other branches does not actually protect main — GitHub's queue mechanics can still cancel pending main runs when the group is shared. The correct approach uses a unique `run_id` fallback for main-branch pushes, giving each run its own group so no cancellation can occur.

The permissions change is straightforward: this workflow only checks out code and runs tests — it never writes to issues, PRs, packages, or any other repository resource. A single `permissions: contents: read` line at the workflow top level is sufficient and complete.

**Primary recommendation:** Add a `concurrency` block and `permissions: contents: read` at workflow top level in `.github/workflows/ci.yml`. Use the `head_ref && ref || run_id` group key pattern with `cancel-in-progress: true` unconditionally. Do not use a conditional `cancel-in-progress` expression — the unique run_id approach is both simpler and more correct.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| GitHub Actions `concurrency` key | N/A (built-in) | Cancel stale workflow runs | Native feature; no extra dependencies |
| GitHub Actions `permissions` key | N/A (built-in) | Scope GITHUB_TOKEN access | Native feature; OSSF/StepSecurity standard |

No external libraries or actions are needed. Both features are built-in YAML keys in the GitHub Actions workflow syntax.

### Installation

No packages to install. This phase is a YAML-only edit to `.github/workflows/ci.yml`.

---

## Architecture Patterns

### Recommended Concurrency Group Pattern

**The canonical two-trigger pattern** for workflows that fire on both `push` (all branches) and `pull_request`:

```yaml
# Source: https://generalreasoning.com/blog/2025/02/05/github-actions-concurrency.html
# Verified against: https://docs.github.com/en/actions/writing-workflows/workflow-syntax-for-github-actions#concurrency
concurrency:
  group: ${{ github.workflow }}-${{ github.head_ref && github.ref || github.run_id }}
  cancel-in-progress: true
```

**How the group key evaluates for each trigger:**

| Event | `github.head_ref` | `github.ref` | Group resolves to |
|-------|-------------------|--------------|-------------------|
| `pull_request` (any PR branch) | `feature/foo` (truthy) | `refs/pull/42/merge` | `CI-refs/pull/42/merge` — shared per PR, cancellation occurs |
| `push` to `main` | `""` (empty/falsy) | `refs/heads/main` | `CI-<unique run_id>` — unique per run, never cancelled |
| `push` to feature branch | `""` (empty/falsy) | `refs/heads/feature/foo` | `CI-<unique run_id>` — unique per run |

Note: The workflow triggers `push` (all branches) + `pull_request` (main only). For PR events, `github.head_ref` is the source branch name. For push events, `github.head_ref` is empty string. The `&&` short-circuit combined with `||` fallback correctly routes each case.

The success criterion "pushing two commits in quick succession to a PR branch cancels the first" is satisfied because both pushes produce the same group key (`CI-refs/pull/N/merge`), and `cancel-in-progress: true` terminates the earlier run.

The success criterion "push commits directly to main are never cancelled" is satisfied because each main push gets `CI-<unique run_id>` — a unique group that no other run can match.

### Recommended Permissions Pattern

```yaml
# Source: https://docs.github.com/en/actions/writing-workflows/workflow-syntax-for-github-actions#permissions
permissions:
  contents: read
```

**Placement:** Workflow top level (before `jobs:`). This sets the maximum permission for the entire workflow and all jobs within it.

**Why `contents: read` is sufficient:** This workflow only does:
- `actions/checkout@v4` — reads repository contents (requires `contents: read`)
- `actions/setup-node@v4` — sets up runner toolchain (no repository permissions needed)
- `npm ci`, `npm run build`, `npm run test:*` — local execution (no repository permissions needed)
- `actions/upload-artifact@v4` — writes to GitHub artifact storage, which does NOT require the `contents` permission (artifacts use a separate API)

No job or step needs write access to contents, issues, PRs, packages, checks, or any other scope.

### Resulting YAML Structure

```yaml
name: CI

on:
  push:
  pull_request:
    branches: [main]

permissions:
  contents: read

concurrency:
  group: ${{ github.workflow }}-${{ github.head_ref && github.ref || github.run_id }}
  cancel-in-progress: true

jobs:
  ci:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    # ... existing steps unchanged ...
```

Both blocks are added at the workflow top level, after `on:` and before `jobs:`. No changes to existing job or step definitions are needed.

### Anti-Patterns to Avoid

- **Using `cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}`**: Looks correct but is NOT safe. When `cancel-in-progress: false`, GitHub Actions still cancels a *pending* (queued but not yet running) job if a newer job enters the same group. Using a shared group key for main with `cancel-in-progress: false` can still drop main-branch runs that haven't started yet. The `run_id` approach is the only correct protection.

- **Using `github.head_ref || github.run_id` without `github.ref`**: This works for grouping but loses branch-level isolation for PR runs — all PRs from the same branch share a group, but the group name is just the branch name without the workflow prefix, which risks cross-workflow collisions.

- **Placing `permissions` at job level only**: While valid, job-level permissions don't communicate intent as clearly for a single-job workflow, and you'd need to add the block to every job if the workflow later gains more jobs. Workflow-level is the correct placement here.

- **Setting `permissions: {}` (empty)**: Removes all permissions including `contents: read`, which breaks `actions/checkout`. Always include `contents: read`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cancelling stale runs | Manual REST API calls to cancel prior workflow runs in workflow steps | `concurrency` key | Built-in; handles race conditions; zero overhead |
| Least-privilege token scoping | Separate token management, fine-grained PATs for CI | `permissions: contents: read` | GITHUB_TOKEN scoped automatically; no secrets management |

**Key insight:** Both hardening mechanisms are first-class GitHub Actions features. There are no legitimate alternatives that require custom code.

---

## Common Pitfalls

### Pitfall 1: `cancel-in-progress: false` Does Not Protect Main

**What goes wrong:** Using a conditional expression like `cancel-in-progress: ${{ github.ref == 'refs/heads/main' && false || true }}` or `${{ github.ref != 'refs/heads/main' }}` while keeping a shared group key for main. Developers assume `cancel-in-progress: false` means "don't cancel my run." It doesn't — it means "don't cancel CURRENTLY RUNNING jobs," but GitHub still cancels *pending* jobs in the group when a new job arrives. A second push to main while the first is queued (not yet running) will still cancel the first.

**Why it happens:** The GitHub Actions docs describe the pending behavior separately from `cancel-in-progress`, and many tutorials focus only on the running-job cancellation.

**How to avoid:** Use the `run_id` fallback for main-branch pushes (the `head_ref && ref || run_id` pattern). Each run gets a unique group; no run can ever be cancelled by another.

**Warning signs:** During testing, manually trigger two rapid pushes to main — if the first run disappears while pending, the conditional approach is broken.

### Pitfall 2: `github.head_ref` Is Empty on Push Events

**What goes wrong:** Using `group: ${{ github.head_ref }}` alone. On push events (including push to feature branches), `github.head_ref` is empty, causing all push-triggered runs to share a single empty-string group named after the workflow — incorrect grouping and unexpected cancellations.

**Why it happens:** `github.head_ref` is only populated for `pull_request` events (it's the source branch of the PR). On `push` events it is always empty.

**How to avoid:** Always use the `||` fallback: `${{ github.head_ref && github.ref || github.run_id }}` or `${{ github.head_ref || github.run_id }}`.

### Pitfall 3: `permissions: {}` Breaks Checkout

**What goes wrong:** Setting an empty permissions block to "deny everything" causes `actions/checkout@v4` to fail with a 403 because the GITHUB_TOKEN lacks `contents: read`.

**Why it happens:** `contents: read` is required for the checkout action to clone the repository. An empty permissions block explicitly removes this default.

**How to avoid:** Always include at minimum `contents: read` when using `actions/checkout`.

### Pitfall 4: Artifact Upload Permissions

**What goes wrong:** Assuming `actions/upload-artifact@v4` needs additional permissions (like `packages: write` or `contents: write`). It doesn't — artifact upload uses a separate Actions-internal API that doesn't map to GITHUB_TOKEN scope. Attempting to add unnecessary write permissions defeats the least-privilege goal.

**How to avoid:** Use only `contents: read`. Artifact upload works with this minimal set.

---

## Code Examples

### Complete Hardened Workflow (minimal diff from current)

```yaml
# Source: https://docs.github.com/en/actions/writing-workflows/workflow-syntax-for-github-actions
name: CI

on:
  push:
  pull_request:
    branches: [main]

permissions:
  contents: read

concurrency:
  group: ${{ github.workflow }}-${{ github.head_ref && github.ref || github.run_id }}
  cancel-in-progress: true

jobs:
  ci:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    # ... all existing steps unchanged ...
```

The diff from the current `ci.yml` is exactly two YAML blocks inserted between `on:` and `jobs:`. No other lines change.

### Verification Test Sequence

To verify HARD-01 (cancellation works):
1. Open a PR branch
2. Push commit A — observe run A starts
3. Push commit B immediately — observe run A is cancelled, run B completes

To verify main branch protection:
1. Push commit A to main — observe run A starts
2. Push commit B to main — observe run A continues to completion, run B starts separately

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No concurrency control (all runs complete) | `concurrency` key with `cancel-in-progress: true` | GA in GitHub Actions 2021 | Eliminates redundant runs; saves runner minutes |
| Default GITHUB_TOKEN permissions (often write-all) | Explicit `permissions` block; default changed to read-only for public repos | GitHub changed defaults ~2021-2022 | Explicit declaration is now best practice regardless of org defaults |

**Note on repository settings:** Organization and repository settings can configure the default GITHUB_TOKEN permissions to be either "read-all" or "write-all." Declaring `permissions: contents: read` explicitly in the workflow YAML makes the permission intent independent of these settings — the workflow is correct regardless of what the org admin has configured.

---

## Open Questions

1. **Artifact upload with `contents: read` only**
   - What we know: `actions/upload-artifact@v4` uses an internal Actions API, not the repository contents API
   - What's unclear: Whether the upload artifact action documentation explicitly confirms `contents: read` is sufficient (could not find explicit docs statement)
   - Recommendation: Implement with `contents: read` only; the existing Phase 18 workflow should be tested against this to confirm. If artifact upload fails (which is very unlikely), `actions: write` may be needed but should be investigated before adding.
   - Confidence: MEDIUM — community consensus confirms this works, but no authoritative doc statement was found

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (existing) |
| Config file | `vite.config.js` (existing) |
| Quick run command | `npm run test:src` |
| Full suite command | `npm test` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | Notes |
|--------|----------|-----------|-------------------|-------|
| HARD-01 | Stale runs cancelled on new push to same PR branch | manual-only | N/A | Requires live GitHub Actions environment; cannot be unit tested locally |
| HARD-01 | Main branch runs complete independently | manual-only | N/A | Requires live GitHub Actions environment |
| HARD-03 | Workflow YAML declares `permissions: contents: read` | YAML lint / manual review | `grep -n 'permissions' .github/workflows/ci.yml` | Static verification of file content |

**Manual-only justification for HARD-01:** Concurrency cancellation behaviour is a GitHub-server-side feature triggered by actual push events. It cannot be exercised in a local unit test or by running Vitest. Verification requires pushing two commits to a real PR branch and observing the Actions UI.

### Sampling Rate

- **Per task commit:** `npm run test:src` (confirms no file breakage)
- **Per wave merge:** `npm test` (full suite)
- **Phase gate:** Full suite green + manual HARD-01 verification in GitHub Actions UI before `/gsd:verify-work`

### Wave 0 Gaps

None — no new test files need to be created. The changes are YAML-only. HARD-01 verification is manual. HARD-03 verification is a static file inspection step in the task.

---

## Sources

### Primary (HIGH confidence)

- [GitHub Docs — Control the concurrency of workflows and jobs](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency) — concurrency key syntax, head_ref fallback pattern, pending job behavior
- [GitHub Docs — Workflow syntax: permissions](https://docs.github.com/en/actions/writing-workflows/workflow-syntax-for-github-actions#permissions) — complete permissions scopes, workflow-level vs job-level, read-all/write-all shortcuts
- [GitHub Docs — Automatic token authentication: permissions](https://docs.github.com/en/actions/security-for-github-actions/security-guides/automatic-token-authentication#permissions-for-the-github_token) — security recommendations, least-privilege principle

### Secondary (MEDIUM confidence)

- [General Reasoning — Cancelling in-progress PR workflows on push](https://generalreasoning.com/blog/2025/02/05/github-actions-concurrency.html) — detailed analysis of the `head_ref && ref || run_id` pattern; critical warning about `cancel-in-progress: false` not protecting pending jobs (2025-02-05)
- [Blacksmith — Protect prod, cut costs: concurrency in GitHub Actions](https://www.blacksmith.sh/blog/protect-prod-cut-costs-concurrency-in-github-actions) — cross-verification of main branch protection patterns

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — built-in GitHub Actions features, verified against official docs
- Architecture patterns: HIGH — concurrency key pattern verified in official docs and community sources; pending-job pitfall verified by dedicated analysis
- Pitfalls: HIGH — `cancel-in-progress: false` pending-job issue confirmed by official docs language ("at most one running and one pending job")
- Artifact upload permissions: MEDIUM — community consensus but no explicit official doc statement

**Research date:** 2026-03-04
**Valid until:** 2026-09-04 (GitHub Actions syntax changes infrequently; patterns are stable)

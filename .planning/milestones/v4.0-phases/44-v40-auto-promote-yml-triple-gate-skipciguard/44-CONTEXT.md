# Phase 44: v40-auto-promote.yml + Triple-Gate _skipCiGuard - Context

**Gathered:** 2026-05-31
**Status:** Ready for planning
**Mode:** Auto-generated (smart-discuss infrastructure detection — workflow + script + triple-gate assertion; all-technical success criteria; closes the merge → promotion loop).

<domain>
## Phase Boundary

Closes the merge → quarantine→golden promotion loop without breaking the human-gated trust invariant. Wave 4. Depends on Phase 43 (PRs carrying `auto-fix:verified` exist).

Deliverables:
1. **`.github/workflows/v40-auto-promote.yml`** — triggers on `pull_request: { types: [closed] }` filtered to merged + `auto-fix:verified` label. Permissions: `contents: write`, `pull-requests: write`, `issues: write`.
2. **`scripts/auto-fix-promote.mjs`** — invoked by the workflow. Asserts ALL THREE preconditions BEFORE calling `runPromote({_skipCiGuard: true})`:
   - PR has `auto-fix:verified` label
   - `event.pull_request.merged === true`
   - Source issue carried `triage` label (read via `gh issue view <source-issue> --json labels`)
   - Any assertion failure → exit non-zero with explicit error message
3. **`tests/e2e/lib/promote-from-quarantine.js`** modifications — adds `_skipCiGuard` option to the existing `runPromote` function. The option BYPASSES the v3.1 CI guard at line 131 (the one that throws if `process.env.CI === 'true'`). The bypass is ONLY safe when the caller is `auto-fix-promote.mjs` AND has passed the triple-gate. Document this contract in a code comment.
4. **Follow-up PR creation (separate from the auto-fix PR):** Auto-promote opens a SEPARATE PR via `peter-evans/create-pull-request@v8` that adds the case to `tests/test-cases.js` (which is the diff-guard-protected file the original auto-fix PR could NOT modify). The follow-up PR has `Allow auto-merge: OFF` (repo-level Phase 39 setting + draft default ensure this) and requires human merge — preserves v3.1's `promote-from-quarantine` human-gated trust invariant.
5. **Source issue closure:** After successful follow-up PR creation, run `gh issue close <source-issue> --reason completed --comment "Fixed in PR #X (auto-promote PR #Y)"`. Vitest mock-gh confirms the comment + close arguments.
6. **Post-merge verifier re-check:** After the auto-fix PR merges to main, a follow-up workflow step (in the same `v40-auto-promote.yml` OR a separate `v40-post-merge-verify.yml` — planner decides) re-runs the verifier on the affected case from `main` HEAD (NOT the merged commit). Catches squash-merge regressions. Failure files a regression issue with labels `e2e-nightly` + `WRONG_CITATION` + `post-merge-regression`.
7. **Triple-gate Vitest** — mock-test EACH per-leg rejection path (label missing / not-merged / triage-missing all fail with explicit error messages).

Out of scope (later phases):
- Per-ERROR_CLASS expansion (Phase 45)
- Local UX wrapper (Phase 46)
- Live HUMAN-UAT (Phase 47 — picks up the deferred Phase 42 demo and exercises the full chain through Phase 44)

</domain>

<decisions>
## Implementation Decisions

### Locked

- **Workflow file:** `.github/workflows/v40-auto-promote.yml`
- **Trigger:** `on: pull_request: { types: [closed] }` with JOB-level filter `if: github.event.pull_request.merged == true && contains(github.event.pull_request.labels.*.name, 'auto-fix:verified')`
- **Permissions:** `contents: write`, `pull-requests: write`, `issues: write` (write on issues for close + comment)
- **Triple-gate ALL THREE assertions BEFORE `runPromote({_skipCiGuard: true})`:** (PR has `auto-fix:verified`) AND (`merged === true`) AND (source issue has `triage`)
- **Source issue identification:** parse from the merged PR body's `<!-- source_issue: <n> -->` comment (added by Phase 43's PR body builder — need to verify or add). If not present, fall back to grepping the commit message for `Fixes #<n>`.
- **`_skipCiGuard` placement:** added as a NEW optional parameter on the existing `runPromote` function in `tests/e2e/lib/promote-from-quarantine.js`. Default `false` (preserves v3.1 contract). Setting to `true` skips the CI gate at line 131. The option is ONLY meant to be set by `auto-fix-promote.mjs` after the triple-gate passes — ESLint or inline JSDoc enforces the contract.
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

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `tests/e2e/lib/promote-from-quarantine.js` — v3.1's `runPromote` function; line 131 has the CI guard Phase 44 bypasses
- `scripts/verify-single-case.mjs` (Phase 41) — invoked by the post-merge verifier re-check
- `peter-evans/create-pull-request@v8` — used for both Phase 43 auto-fix PR and Phase 44 auto-promote PR
- `scripts/build-auto-fix-pr-body.mjs` (Phase 43) — extend to add `<!-- source_issue: <n> -->`
- `tests/e2e/lib/llm-ledger.js` — `appendLedgerEntry({phase: '44-auto-promote', ...})` for audit trail (no SDK cost; zero-cost entries documenting the promotion event)

### Established Patterns
- v40-* workflow naming
- YAML static-grep Vitest pattern (Phase 40-03, 41-03, 43-01)
- `peter-evans/create-pull-request@v8` invocation shape (Phase 40-03)
- Comment-paraphrase discipline (Phase 40-03 scar)

### Integration Points
- Phase 41 verifier-gate produces the `auto-fix:verified` label (when it flips draft→ready) — Phase 44 reads this label as one of the triple-gate's three conditions
- Phase 43 auto-fix opens the PR carrying the `source_issue` comment — Phase 44 reads to identify the source issue
- Phase 47 CLEANUP-03 HUMAN-UAT (a) exercises the full chain from issues.labeled → auto-fix PR → verifier-gate → merge → auto-promote → follow-up PR

</code_context>

<specifics>
## Specific Ideas

- `tests/e2e/lib/promote-from-quarantine.js` line 131 — the CI guard. Add `if (!opts._skipCiGuard && process.env.CI === 'true') throw ...`. Single-line change.
- Triple-gate assertions in `assertTripleGate`: throw `new Error('TRIPLE_GATE_FAILED: <which leg> — <details>')`. Vitest covers each leg's rejection message.
- Auto-promote branch name: `auto-promote/<source-issue-n>-<case-id-fp8>` — distinct from `auto-fix/*` to avoid confusion + to keep verifier-gate (which only triggers on `auto-fix/*`) from running.

</specifics>

<deferred>
## Deferred Ideas

- `auto-fix:partial-verified` semantics (3/5 affected cases pass) — explicitly OUT OF SCOPE; default all-or-nothing per REQUIREMENTS.md.
- Multi-class follow-up PR batching — out of scope.
- Auto-revert on post-merge regression — out of scope; first iteration files a regression issue + Phase 45's FLAKE state machine handles the re-classification.

</deferred>

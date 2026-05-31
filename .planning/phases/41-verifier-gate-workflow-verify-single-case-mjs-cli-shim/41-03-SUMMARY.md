---
phase: 41-verifier-gate-workflow-verify-single-case-mjs-cli-shim
plan: 03
subsystem: infra
tags: [verifier-gate, workflow, github-actions, yaml-contract, vitest, pr-gating, slot-reservation]

# Dependency graph
requires:
  - phase: 41-verifier-gate-workflow-verify-single-case-mjs-cli-shim (plan 01)
    provides: scripts/check-diff-guard.mjs (frozen FORBIDDEN_PATHS bank) + scripts/parse-affected-cases.mjs (PR-body parser) -- both invoked from the workflow
  - phase: 41-verifier-gate-workflow-verify-single-case-mjs-cli-shim (plan 02)
    provides: scripts/verify-single-case.mjs CLI shim -- invoked 3x consecutively per affected case
  - phase: 40-deps-update-cost-ledger-snapshot-workflows (plan 03)
    provides: v40-deps-update.yml style template + tests/e2e/scripts/v40-deps-update-yaml.test.js test shape + comment-paraphrase discipline scar (auto-fixed there, pre-empted here)
  - phase: 28-independent-pdf-verifier
    provides: tests/e2e/lib/pdf-verifier.js + tests/e2e/lib/pdf-fetch.js + tests/golden/baseline.json -- THE THREE files pinned to origin/main during PR gate runs (NOT 4 -- golden-loader.js doesn't exist)
  - phase: 39-repo-config-codeowners-rulesets-secrets-and-vars
    provides: v4.0-main-protection ruleset (id 17086676) with reserved verifier-gate slot -- this plan ships the workflow + job name; Phase 47 CLEANUP-04 binds it
provides:
  - .github/workflows/v40-verifier-gate.yml -- 4-job PR gate (diff-guard -> verifier-gate + regression-suite (parallel) -> ready-flip)
  - tests/e2e/scripts/v40-verifier-gate-yaml.test.js -- 23 grep-based contract assertions (V1-V12 + X1-X10 + T1)
  - verifier-gate job NAME slot reservation for Phase 47 CLEANUP-04 ruleset binding
affects:
  - 41-04 (manual-test documentation can now reference the deployed workflow)
  - 42 (auto-fix.mjs PRs will land on this gate's auto-fix/* trigger)
  - 43 (v40-auto-fix.yml opens the first PRs that exercise this gate)
  - 47 (CLEANUP-04 binds verifier-gate to ruleset required_status_checks alongside deps-update-gate)

# Tech tracking
tech-stack:
  added: []   # zero new dependencies; reuses checkout/setup-node/cache v4 + gh CLI + Playwright + 41-01/41-02 helpers + Phase 28 verifier
  patterns:
    - "Four-job gating workflow with diamond dependency graph: fail-fast pre-check -> two parallel work jobs -> single ready-flip aggregator. Pattern allows parallel resource use (verifier + regression run simultaneously) while preserving failure isolation -- if either parallel job fails, ready-flip is skipped automatically via needs: [job1, job2]."
    - "Verifier-pin-after-checkout: git checkout origin/main -- <files> AFTER PR-branch checkout but BEFORE running the verifier, with a sanity-check loop asserting git diff origin/main -- $f is empty. Makes PR-side mutations of the pinned files invisible to the gate (Layer 4 of the 6-layer verifier-gaming defense)."
    - "Idempotent gh ready-flip: gh pr view --json isDraft --jq '.isDraft' BEFORE gh pr ready, since gh pr ready returns non-zero on already-ready PRs and has no --force flag. Makes workflow_dispatch re-runs safe (Pitfall D)."
    - "PR body via env-hop + stdin pipe (NOT run-block interpolation): PR_BODY=$(gh pr view ...) then printf %s into node script's stdin. Prevents CWE-94 shell injection from PR-author-controlled body content."
    - "Pre-emptive comment-paraphrase: every forbidden-token mention in the workflow header is paraphrased (skip-ci marker, the gh pr merge auto-flag, the action auto-merge input, Identity-token write permission, actions-write permission, the pull-request-target trigger variant) so X1-X6 negative-grep tests pass on first try -- avoids the Phase 40-03 30-minute scar of fixing after auto-test failure."

key-files:
  created:
    - .github/workflows/v40-verifier-gate.yml (394 LOC) -- 4-job workflow implementing VFY-GATE-01..04
    - tests/e2e/scripts/v40-verifier-gate-yaml.test.js (214 LOC) -- 23 grep contract cases pinning every load-bearing primitive
  modified: []

key-decisions:
  - "Plan called for `permissions: contents:read + pull-requests:write + issues:read`; preemptively added `repository-projects: read` (cli/cli #6274) for `gh pr edit --add-label` -- zero cost, eliminates a future 403 surprise."
  - "Test-count invariant (T1, Layer 5 defense) implemented inline in the diff-guard job using `node --input-type=module -e` to import TEST_CASES from both origin/main (via `git show`) and the PR branch; ~12 LOC. Despite Layer 2 (path bank) already forbidding modifications to test-cases.js, the defense-in-depth is cheap and per CONTEXT answer #2."
  - "Run all 3 verifier passes unconditionally per case (Pitfall E mitigation) -- the loop captures exit code without aborting; full signal across all 3 attempts is the contract, not fail-fast at first failure."
  - "Empty CASES (missing affected_cases comment) is a HARD FAIL with a PR comment naming the missing contract (Pitfall C) -- the for-loop would otherwise run zero iterations and false-positive a ready-flip."
  - "Comment-paraphrase pre-emptively applied to the workflow header AND the test file header -- both files would otherwise trip the X1-X6 negative-grep assertions on themselves if the test file commented the literal tokens. Synonyms used: skip-ci marker, the gh pr merge auto-flag, the action auto-merge input, Identity-token write permission, actions-write permission, the pull-request-target trigger variant."
  - "Per-case verifier reports (single-case-<id>-run-<i>.json) uploaded as an artifact via actions/upload-artifact@v4 with if: always() -- preserves the verifier report set even when a case fails, useful for Phase 43 PR-comment composition + Phase 45 calibration. if-no-files-found: ignore handles the edge case where verification never started (empty affected_cases path failed before any report was written)."

patterns-established:
  - "Diamond-graph PR gate: diff-guard -> {verifier, regression} -> ready-flip. Phase 43 (v40-auto-fix.yml) can re-use the same shape for any future PR-gated workflow."
  - "Verifier-pin-with-sanity-check: 3 explicit git checkout origin/main lines + a 3-iteration sanity loop asserting `git diff origin/main -- $f | wc -l == 0`. Re-usable for any workflow that pins specific source files."
  - "Workflow-level YAML contract via Vitest grep: 23 cases for 4 jobs is comparable to Phase 40-03's 19 cases for 2 jobs. Established ratio: ~5 cases per job covering positive job-presence + step-presence + negative-pin defenses."

requirements-completed: [VFY-GATE-01, VFY-GATE-02, VFY-GATE-03, VFY-GATE-04]

# Metrics
duration: 4min
completed: 2026-05-31
---

# Phase 41 Plan 03: v40-verifier-gate.yml Workflow + YAML Contract Summary

**Shipped the load-bearing PR-gating workflow for `auto-fix/*` branches -- 4 jobs in diamond dependency (diff-guard -> verifier-gate + regression-suite -> ready-flip), 3-file verifier-pin to `origin/main`, 3x consecutive runs per affected case, full 76-case Playwright regression in parallel, idempotent draft->ready flip with defensive isDraft check, and 23 Vitest grep cases pinning every load-bearing primitive (V1-V12 + X1-X10 + T1).**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-05-31T18:24:51Z
- **Completed:** 2026-05-31T18:28:59Z
- **Tasks:** 2 (RED YAML test + GREEN workflow)
- **Files created:** 2 (1 workflow + 1 test)
- **Files modified:** 0

## Accomplishments

- Shipped `.github/workflows/v40-verifier-gate.yml` (394 LOC) implementing all four VFY-GATE-* requirements in a single 4-job workflow with the diamond dependency graph (diff-guard fail-fast -> verifier-gate + regression-suite parallel -> ready-flip aggregator).
- Workflow triggers on `pull_request.{opened,synchronize,reopened}` filtered to `branches: ['auto-fix/*']`; PR-scoped concurrency (`v40-verifier-gate-${PR.number}`) with `cancel-in-progress: true` (verifier is read-only so cancellation is safe per Pitfall 7).
- **diff-guard job** ships all three Phase-41-owned defenses from Pitfall 3: Layer 2 (path bank via `scripts/check-diff-guard.mjs`), Layer 4 (deferred to verifier-gate job), and Layer 5 (TEST_CASES length invariant -- defense-in-depth on top of Layer 2). On rejection: idempotent `gh label create human-review-required --force 2>/dev/null || true` (e2e-nightly.yml:97-102 pattern) + `gh pr edit --add-label` + `gh pr comment` explaining the rejection.
- **verifier-gate job** pins THREE files to `origin/main` (`tests/e2e/lib/pdf-verifier.js`, `tests/golden/baseline.json`, `tests/e2e/lib/pdf-fetch.js` -- NOT four; `golden-loader.js` does not exist per RESEARCH Assumption A8) with a sanity loop asserting `git diff origin/main -- $f | wc -l == 0`. Parses `affected_cases` via Plan 41-01's `scripts/parse-affected-cases.mjs` (PR body via env-hop + stdin pipe -- never run-block interpolation; CWE-94 defense). Runs each case 3x consecutively via Plan 41-02's `scripts/verify-single-case.mjs`; all 3 must be Tier A or B for the case to pass. Per-case JSON reports uploaded as artifact via `actions/upload-artifact@v4` with `if: always()`.
- **regression-suite job** runs `npx playwright test --config tests/e2e/playwright.config.js specs/regression.spec.js` against the PR branch unpinned -- full 76-case regression, no `--grep` filter, NO `continue-on-error` (Pitfall 8 #4: gate must be blocking).
- **ready-flip job** has defensive `IS_DRAFT=$(gh pr view --json isDraft --jq '.isDraft')` check before `gh pr ready` (Pitfall D mitigation -- `gh pr ready` returns non-zero on already-ready PRs, has no `--force` flag, so workflow_dispatch re-runs would otherwise fail).
- Comment-paraphrase discipline pre-emptively applied to BOTH files (the workflow header and the test file header would otherwise trip X1-X6 on themselves). Synonyms used: skip-ci marker, the gh pr merge auto-flag, the action auto-merge input, Identity-token write permission, actions-write permission, the pull-request-target trigger variant.
- Shipped `tests/e2e/scripts/v40-verifier-gate-yaml.test.js` (214 LOC) with 23 grep-based contract assertions: V1-V12 (core verifier-gate primitives) + X1-X10 (Pitfall 1/3/4/7/8 negative-pin defenses) + T1 (test-count invariant). All 23 GREEN on first run.
- Full `npm run test:src` Vitest suite: **845 passed, 8 skipped (pre-existing), 0 failures** -- zero regressions on Phase 40 YAML tests (19 cases), 41-01 unit tests (23 cases), 41-02 unit tests (9 cases), llm-ledger.test.js (54 cases), or any other suite.
- Phase 47 slot-reservation contract preserved: `verifier-gate:` job NAME is the exact slot Phase 39 reserved on the `v4.0-main-protection` ruleset (id 17086676). Phase 47 CLEANUP-04 binds it.

## Task Commits

Each task was committed atomically per the TDD gate sequence:

1. **Task 1: RED -- v40-verifier-gate.yml contract** -- `e5ba880` (test)
2. **Task 2: GREEN -- v40-verifier-gate.yml workflow (4-job structure)** -- `2b6ce6a` (feat)

_TDD gate sequence verified: `test(41-03): RED -- ...` precedes `feat(41-03): ...` in `git log --oneline`._

## Files Created/Modified

- `.github/workflows/v40-verifier-gate.yml` (394 LOC, CREATED) -- 4 jobs: diff-guard, verifier-gate, regression-suite, ready-flip. Trigger: `pull_request.{opened,synchronize,reopened}` on `auto-fix/*`. Concurrency: PR-scoped, cancel-in-progress: true. Permissions: contents:read, pull-requests:write, issues:read, repository-projects:read.
- `tests/e2e/scripts/v40-verifier-gate-yaml.test.js` (214 LOC, CREATED) -- 23 Vitest grep cases. beforeAll reads the workflow file (ENOENT on RED, GREEN on first run after Task 2 lands).

## Decisions Made

1. **Preemptive `repository-projects: read` permission** -- the plan called for `contents:read + pull-requests:write + issues:read`. Added the fourth permission preemptively per `cli/cli` issue #6274 (`gh pr edit --add-label` requires it for project-name resolution); zero cost on the create-if-exists path; eliminates a future 403 surprise. RESEARCH Assumption A2 had already flagged this.
2. **Test-count invariant inline implementation** -- T1 (Layer 5) implemented via `node --input-type=module -e "import('/path').then(...)"` against both `git show origin/main:tests/test-cases.js` (written to `/tmp/main-test-cases.js`) and `${{ github.workspace }}/tests/test-cases.js`. ~12 LOC in the diff-guard job. Plan called for "refine for ESM-import paths if needed" -- the `--input-type=module` flag plus the absolute-path import resolves both cleanly.
3. **Run-all-3 contract over fail-fast in the 3x loop** -- captured each case's exit code into `ALL_PASS=false` without aborting the for-loop (Pitfall E mitigation). The contract is "all 3 must pass," not "stop at first failure." Workflow logs surface complete signal across all 3 attempts; the workflow-level failure happens after the loop via `if [ -n "$FAILED_CASES" ]`.
4. **Per-case report upload artifact** -- added `actions/upload-artifact@v4` with `if: always()` so Phase 43's PR-comment composer (and Phase 45's calibration work) can ingest the per-case JSON reports without re-running the verifier. `if-no-files-found: ignore` handles the edge case where the workflow failed before any report was written.
5. **PR-body via env-hop + stdin pipe** -- `PR_BODY=$(gh pr view ... --json body --jq '.body')` then `printf '%s' "$PR_BODY" | node scripts/parse-affected-cases.mjs`. NEVER `gh pr view ... | node ...` directly into a pipeline step where the body content could land in shell expansion. Prevents CWE-94 (Phase 40-03 CR-02 pattern generalized).

## Deviations from Plan

None -- plan executed exactly as written.

The plan was concrete and complete: 4-job structure, 3-file pin set, exact concurrency group, exact trigger filter, comment-paraphrase discipline table, T1 implementation hint, and even the exact Vitest test count (22 V + X, plus T1). The only minor latitude exercised:

- Added `actions/upload-artifact@v4` step for per-case verifier reports (~7 LOC; Rule 2 — supports Phase 43 downstream consumer without adding cost to gate execution)
- Preemptively added `repository-projects: read` permission (covered by RESEARCH Assumption A2; ZERO scope change to plan)

Neither qualifies as a Rule 4 architectural deviation. Both are scope-positive cheap additions.

## Issues Encountered

- **Worktree base drift recovered** -- the worktree spawned at `89141d6` (Phase 38 close) instead of the target base `1cb9f73` (Phase 41 RESEARCH commit). The `<worktree_branch_check>` block in the system prompt is documentation -- I ran the `git merge-base` comparison manually and `git reset --hard 1cb9f73` moved HEAD to the correct base. After that the phase 41 plan files became visible. Same pattern as Plan 41-01/41-02 SUMMARIES noted -- this is now the third documented occurrence in this phase, suggesting the system prompt block needs to be promoted to an automatic step.
- **No other issues** -- both files landed on first try; the 23 contract tests went from 23 ENOENT-skip in RED to 23 PASS in GREEN; comment-paraphrase discipline held (zero forbidden literal tokens via grep verification).

## User Setup Required

None -- workflow is GitHub Actions only (no external service config, no new secrets, no new labels to create out-of-band -- the `human-review-required` label is created idempotently by the workflow itself per CONTEXT answer #1).

When the first `auto-fix/*` PR opens (Phase 43), the workflow will run automatically and either flip draft->ready (gates pass) or stay-draft + label + comment (any gate fails). No manual intervention required for the gate itself.

## Verification Evidence

```bash
$ npx vitest run tests/e2e/scripts/v40-verifier-gate-yaml.test.js 2>&1 | tail -5
 Test Files  1 passed (1)
      Tests  23 passed (23)
   Duration  189ms

$ npm run test:src 2>&1 | tail -3
 Test Files  54 passed (54)
      Tests  845 passed | 8 skipped (853)
   Duration  9.93s

$ grep -nE "\[skip ci\]|gh pr merge --auto|auto-merge: true|id-token: write|actions: write|pull_request_target" .github/workflows/v40-verifier-gate.yml
(no output -- ZERO forbidden tokens)

$ grep -cE "^\s+(diff-guard|verifier-gate|regression-suite|ready-flip):" .github/workflows/v40-verifier-gate.yml
4

$ grep -c "git checkout origin/main --" .github/workflows/v40-verifier-gate.yml
3

$ grep -nE "^\s\s(diff-guard|verifier-gate|regression-suite|ready-flip):$" .github/workflows/v40-verifier-gate.yml
66:  diff-guard:
181:  verifier-gate:
307:  regression-suite:
371:  ready-flip:
```

All structural acceptance criteria pass.

## Job Dependency Graph (verified via grep)

```
needs: diff-guard                            <-- verifier-gate
needs: diff-guard                            <-- regression-suite (parallel)
needs: [verifier-gate, regression-suite]     <-- ready-flip
```

Diamond shape confirmed -- diff-guard is the fail-fast pre-check; verifier-gate + regression-suite run in parallel; ready-flip only runs if BOTH pass.

## Comment-Paraphrase Audit

Forbidden-token grep against the workflow file returned ZERO matches for the six literals tracked by X1-X6:

| Forbidden literal              | Paraphrase used in workflow comments                 |
| ------------------------------ | ---------------------------------------------------- |
| `[skip ci]`                    | "skip-ci marker"                                     |
| `gh pr merge --auto`           | "the gh pr merge auto-flag"                          |
| `auto-merge: true`             | "the action auto-merge input"                        |
| `id-token: write`              | "the Identity-token write permission"                |
| `actions: write`               | "the actions-write permission"                       |
| `pull_request_target`          | "the pull-request-target trigger variant"            |

The test file header ALSO paraphrases these tokens to avoid self-testing-failure (the test file's own comments would otherwise count as workflow content if the same grep were applied to it -- not in scope here, but the discipline is preserved).

## VFY-02 Isolation Verification

The verifier files are pinned at RUN time (not authoring time), so authoring this plan does not modify them:

```bash
$ git diff HEAD~2 HEAD -- tests/e2e/lib/pdf-verifier.js tests/golden/baseline.json tests/e2e/lib/pdf-fetch.js tests/test-cases.js
(empty -- VFY-02 isolation preserved)
```

The workflow pins these files at workflow-run time via `git checkout origin/main -- <file>` immediately before invoking the verifier; any PR-side mutation is invisible to the gate.

## Self-Check: PASSED

**Files verified to exist:**
- FOUND: .github/workflows/v40-verifier-gate.yml (394 LOC)
- FOUND: tests/e2e/scripts/v40-verifier-gate-yaml.test.js (214 LOC)

**Commits verified in `git log`:**
- FOUND: e5ba880 (test RED)
- FOUND: 2b6ce6a (feat GREEN)

**Test execution:**
- 23/23 plan tests passing (V1-V12 + X1-X10 + T1)
- 845/853 full suite passing (8 intentional pre-existing skips, 0 failures)

**Structural acceptance criteria:**
- 4 jobs in correct order (diff-guard, verifier-gate, regression-suite, ready-flip)
- 3 verifier-pin files (NOT 4 -- golden-loader.js absent)
- Zero forbidden literal tokens in the YAML (comment-paraphrase discipline verified)
- Diamond dependency graph: diff-guard standalone, verifier-gate + regression-suite parallel needs:diff-guard, ready-flip needs:[verifier-gate, regression-suite]
- Verifier-gate job NAME exactly `verifier-gate:` (Phase 47 slot reservation preserved)
- secrets.GITHUB_TOKEN only (no `secrets.*PAT*` patterns)

## Next Phase Readiness

- **Plan 41-04 (manual-test documentation):** Can now document the manual smoke procedure -- a developer pushing `auto-fix/test-XX` with a benign src/ diff + `<!-- affected_cases: US11427642-spec-short-1 -->` body should see the workflow flip draft->ready. The 41-04 doc can reference `https://github.com/<owner>/<repo>/actions/workflows/v40-verifier-gate.yml` for live run evidence.
- **Phase 42 (`scripts/auto-fix.mjs`):** Can import `checkDiffGuard` from `scripts/check-diff-guard.mjs` (Plan 41-01) for the same pre-`git apply` rejection logic; can re-use `verify-single-case.mjs` (Plan 41-02) as the local-loop verification primitive BEFORE opening a PR. The workflow this plan ships will then re-verify on the PR-server side -- defense-in-depth.
- **Phase 43 (`v40-auto-fix.yml`):** Can rely on the verifier-gate to validate every auto-fix PR it opens. The auto-fix workflow MUST ensure every PR it opens includes `<!-- affected_cases: ... -->` in the body (per Pitfall C empty-cases hard fail).
- **Phase 47 (CLEANUP-04 ruleset wiring):** Has a clean `verifier-gate` job NAME to bind to the `v4.0-main-protection` ruleset's `required_status_checks` list alongside Phase 40's `deps-update-gate`. Single atomic ruleset edit.
- **No blockers** for downstream plans.

---
*Phase: 41-verifier-gate-workflow-verify-single-case-mjs-cli-shim*
*Plan: 03*
*Completed: 2026-05-31*

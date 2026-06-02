---
phase: 43-v40-auto-fix-yml-workflow-draft-pr-creation
plan: 01
subsystem: ci-workflows
tags: [auto-fix-workflow, github-actions, peter-evans-cpr, draft-pr, two-commit-split, ledger-self-commit, affected-cases-comment, yaml-contract, pitfall-1, pitfall-7, autofix-02]
requirements: [AUTOFIX-02]
dependency_graph:
  requires:
    - "Phase 42 scripts/auto-fix.mjs dispatcher (--no-push / exit codes 0,1,2,3)"
    - "Phase 41 scripts/parse-affected-cases.mjs regex /<!-- affected_cases: ([^\\s>]+) -->/"
    - "Phase 40-01 v40-cost-ledger-snapshot.yml [skip ci] self-commit pattern"
    - "Phase 39 tests/e2e/.llm-spend-ledger.json schema + tests/e2e/lib/llm-driver.js"
  provides:
    - ".github/workflows/v40-auto-fix.yml (issues.labeled triage → draft PR)"
    - "scripts/build-auto-fix-pr-body.mjs (pure-function PR body helper)"
    - "auto-fix branch on origin for Phase 44 auto-promote (delete-branch: false)"
    - "Draft PR with affected_cases HTML comment for Phase 41 verifier-gate consumption"
  affects:
    - "Phase 41 verifier-gate (runs on auto-fix/* PRs this workflow opens)"
    - "Phase 44 auto-promote (reads branch tip via gh pr view --json headRefName)"
    - "Phase 47 CLEANUP-03 (a) HUMAN-UAT (live demo of this workflow)"
tech-stack:
  added: []
  patterns:
    - "Two-commit ledger split: ledger to main with [skip ci] BEFORE cpr@v8 snapshots working tree (Pitfall 1 / T-43-07)"
    - "Idempotent label create: gh label create --force 2>/dev/null || true"
    - "ERROR_CLASS pre-check: skip cleanly (no exit 1) if no recognized label → saves SDK budget"
    - "Fail-fast on missing repo secret: gh issue comment + exit 1 before any SDK work"
    - "PR body via body-path: /tmp/pr-body.md (NOT inline body: — CWE-94 defense)"
    - "Branch capture via git rev-parse --abbrev-ref HEAD (CONTEXT Q1 lock; NOT stdout grep)"
key-files:
  created:
    - ".github/workflows/v40-auto-fix.yml (225 LOC)"
    - "scripts/build-auto-fix-pr-body.mjs (70 LOC; pure function + CLI shim)"
    - "tests/unit/build-auto-fix-pr-body.test.js (134 LOC; 6 Vitest cases B1-B6)"
    - "tests/e2e/scripts/v40-auto-fix-yaml.test.js (210 LOC; 22 Vitest cases A1-A12 + L1-L2 + X1-X8)"
  modified: []
decisions:
  - "Two-commit ledger split via [skip ci] direct push to main BEFORE peter-evans/cpr@v8 — the ONLY architecture that satisfies Phase 41's diff-guard while preserving the dispatcher's ledger contract"
  - "secrets.GITHUB_TOKEN only (no PATs); workflow-scoped token expires per run (T-43-02 mitigation)"
  - "delete-branch: false on cpr@v8 — Phase 44 auto-promote needs the branch tip (T-43-08; cpr@v8 default is true; we explicitly override)"
  - "cancel-in-progress: false on the per-issue concurrency group — opposite of Phase 41 verifier-gate; protects in-flight LLM cost (T-43-05 / Pitfall 7)"
  - "Helper script is a separate file (scripts/build-auto-fix-pr-body.mjs) rather than inline bash — keeps the PR body contract Vitest-testable"
  - "ERROR_CLASS pre-check is a soft skip (no exit 1) — bare triage adds without an ERROR_CLASS label do not fail the workflow run"
metrics:
  duration: "~30 minutes (4 atomic commits — 2 RED + 2 GREEN)"
  completed: 2026-05-31
  files_created: 4
  files_modified: 0
  test_cases_added: 28
  loc_added: 639
---

# Phase 43 Plan 01: v40-auto-fix.yml Workflow + Draft PR Creation Summary

Lifted Phase 42's CI-validated `scripts/auto-fix.mjs` dispatcher into a GitHub
Actions workflow triggered by `issues.labeled('triage')`. The workflow opens
a DRAFT PR via `peter-evans/create-pull-request@v8` with the load-bearing
`<!-- affected_cases: id1,id2 -->` HTML comment Phase 41 verifier-gate
consumes — closing the loop on AUTOFIX-02.

## What Shipped

| Artifact | Purpose | LOC |
| --- | --- | --- |
| `.github/workflows/v40-auto-fix.yml` | issues.labeled('triage') → cpr@v8 draft PR with two-commit ledger split | 225 |
| `scripts/build-auto-fix-pr-body.mjs` | Pure-function PR body helper + CLI shim; emits affected_cases comment on line 1 | 70 |
| `tests/unit/build-auto-fix-pr-body.test.js` | 6 Vitest cases (B1-B6) pinning the helper contract | 134 |
| `tests/e2e/scripts/v40-auto-fix-yaml.test.js` | 22 Vitest cases (A1-A12 + L1-L2 + X1-X8) pinning the workflow YAML contract | 210 |

## The Load-Bearing Two-Commit Split (Pitfall 1 / T-43-07)

The single non-obvious architectural decision is the **two-commit split**.
The Phase 42 dispatcher writes to `tests/e2e/.llm-spend-ledger.json` as part
of every successful run. Phase 41's diff-guard regex bank rejects PRs whose
diffs touch that ledger path. Without isolation, every auto-fix PR would be
rejected by its own verifier-gate.

Resolution: the workflow's "Commit ledger update to main" step runs BEFORE
`peter-evans/cpr@v8` snapshots the working tree. It (1) checks out main,
(2) pulls --ff-only, (3) commits the ledger entry with a `[skip ci]` prefixed
message (so this push does NOT re-trigger ci.yml), (4) pushes to main,
(5) checks out the auto-fix branch, (6) git rebases onto the now-updated
main. The cpr@v8 step then snapshots a ledger-clean working tree and the
resulting PR diff contains ONLY the source-code fix — clean against the
Phase 41 diff-guard bank.

Pinned by:
- **L1 test:** ledger-commit step appears BEFORE the cpr@v8 step (string
  position check inside the YAML file).
- **L2 test:** the literal `[skip ci]` token appears EXACTLY ONCE in the
  file (the ledger commit message — the ONE allowed occurrence).

## TDD Atomic Commits (4 in order)

| # | Hash | Phase | Type | Description |
| - | ---- | ----- | ---- | ----------- |
| 1 | `0ccef28` | Task 1 RED | test | build-auto-fix-pr-body helper Vitest contract (B1-B6) |
| 2 | `1f6bb1e` | Task 1 GREEN | feat | scripts/build-auto-fix-pr-body.mjs (70 LOC) |
| 3 | `903a98f` | Task 2 RED | test | v40-auto-fix.yml YAML contract (22 cases A1-A12 + L1-L2 + X1-X8) |
| 4 | `1da79b7` | Task 3 GREEN | feat | .github/workflows/v40-auto-fix.yml (225 LOC) |

Task 4 verification (this SUMMARY) is the meta-commit that follows.

## TDD Gate Compliance

Both Task 1 and Task 2/3 follow strict RED → GREEN gating with separate
atomic commits per gate. Task 1's RED commit (test file with not-yet-resolvable
import) fails with module-not-found before the GREEN commit creates the helper.
Task 2's RED commit (test file referencing the not-yet-created workflow) fails
with ENOENT at `beforeAll()` before Task 3's GREEN commit creates the workflow.
No REFACTOR commit needed for either pair — the GREEN implementations are the
final shape.

## Verification Evidence

| Audit | Command | Result |
| ----- | ------- | ------ |
| 1. Phase 43 tests | `npx vitest run tests/unit/build-auto-fix-pr-body.test.js tests/e2e/scripts/v40-auto-fix-yaml.test.js` | 28/28 pass (6 unit + 22 YAML) |
| 2. Full src suite | `npm run test:src` | 943 passed / 1 failed / 944 total — Phase 42 baseline (916) + 28 new tests; 1 pre-existing weekly-digest flake unchanged (zero new regressions) |
| 3. Comment-paraphrase | `grep -nE "<forbidden literals>" workflow \| grep -v "skip ci\] ledger:"` | Zero forbidden literals OUTSIDE the single allowed ledger commit message |
| 4. Helper purity | `grep -nE "^import.*from 'node:(fs\|child_process\|path)'" scripts/build-auto-fix-pr-body.mjs` | Zero matches — imports only `node:util` |
| 5. Two-commit split | `ledger line < cpr line` byte-offset comparison | ledger line 9 < cpr line 203 ✓ |
| 6. Git log TDD order | `git log --oneline -4` | 4 commits in expected order (RED+GREEN+RED+GREEN) |
| 7. No-PAT audit | `grep -nE "secrets\.[A-Z_]*PAT[A-Z_]*" workflow helper` | Zero matches |
| 8. Phase 42 untouched | `git diff HEAD~4 HEAD -- scripts/auto-fix.mjs tests/e2e/lib/llm-driver.js tests/e2e/lib/llm-ledger.js` | Empty diff ✓ |

The single failing test in audit #2 is `tests/e2e/scripts/e2e-weekly-digest.test.js`'s
`returns $X.XX / $100 (Y%) format when ledger present` — a pre-existing
flake that Phase 42's 42-02 SUMMARY explicitly documented and deferred.
The test file content is byte-identical to the Phase 42 baseline
(`git show HEAD~4:tests/e2e/scripts/e2e-weekly-digest.test.js | diff -`
confirms identical). Phase 43 did not modify any code related to weekly-digest,
llm-ledger, or renderCostLine. Zero new regressions.

## Open Question Lock Outcomes (from research / planning)

- **Q1 — branch capture mechanism:** `git rev-parse --abbrev-ref HEAD` (not
  dispatcher stdout grep). Locked in workflow step 6. Mitigates Pitfall 5
  (stdout format brittleness).
- **Q2 — PR-body helper location:** separate file (`scripts/build-auto-fix-pr-body.mjs`),
  not inline bash. Locked — keeps the contract Vitest-testable.
- **Q3 — plan count for Phase 43:** ONE plan covering all 4 tasks. Locked —
  the workflow file + helper + tests are tightly coupled and a wave split
  would create artificial seams.
- **Q4 — workflow_dispatch trigger:** OMIT. Locked — manual re-runs of an
  auto-fix attempt on the same issue would burn SDK budget without idempotency
  benefit; the dispatcher's `git ls-remote` AUTOFIX-04 idempotency hit
  handles double-trigger via the actual issue-label event.

## Required User Setup (Manual — Cannot Be Automated)

| Required | Where | Why |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` repo secret | GitHub repo → Settings → Secrets and variables → Actions → New repository secret | The workflow fail-fasts (with a clear remediation comment on the issue) if the secret is missing — but it CANNOT succeed end-to-end without it. Anthropic Console → API Keys → create key |

The workflow's first step is `Assert ANTHROPIC_API_KEY present` — a fail-fast
gate that posts a remediation comment on the source issue and exits 1 if the
repo secret is empty. This is cleaner than letting the dispatcher fail later
with an opaque SDK auth error.

## Phase Readiness Notes

- **Phase 44 auto-promote:** the `delete-branch: false` setting on cpr@v8
  preserves the auto-fix branch tip on origin. Phase 44 reads it via
  `gh pr view --json headRefName` for follow-up promote PR composition
  (T-43-08 mitigation). Without this override, cpr@v8 would default to
  deleting the branch after merge.
- **Phase 47 HUMAN-UAT:** the live end-to-end execution against a real
  `triage`-labeled issue is DEFERRED to Phase 47 CLEANUP-03 (a) — carried
  over from the Phase 42 demo deferral. This is by design and not a
  Phase 43 gap; the dispatcher itself is 122-test-validated and the
  workflow is 28-test-validated, so the live demo is a confirmation step,
  not a discovery step.

## Threat Model — Mitigations Implemented

All 11 threats from the plan's `<threat_model>` have implemented mitigations:

| Threat | Mitigation | Pinned by |
| ------ | ---------- | --------- |
| T-43-01 (Tampering — PR body parsing) | Helper is pure-function with no env interpolation; comment is line 1; verifier-gate regex rejects whitespace/> in IDs | B1, B2, B5 |
| T-43-02 (Elevation — PAT use) | secrets.GITHUB_TOKEN only | A12, audit 7 |
| T-43-03 (Elevation — pull_request_target) | Negative-pinned | X5 |
| T-43-04 (Elevation — id-token / actions:write) | Negative-pinned | X3, X4 |
| T-43-05 (DoS — label-flap cost) | concurrency + cancel-in-progress:false; AUTOFIX-04 idempotency; LEDGER-03 caps | A3, A4 |
| T-43-06 (Elevation — auto-merge) | draft:true + negative-pinned the gh pr merge auto-flag and the action auto-merge input | A10, X1, X2 |
| T-43-07 (Tampering — ledger in PR diff) | THE LOAD-BEARING TWO-COMMIT SPLIT | L1, L2, audit 5 |
| T-43-08 (Repudiation — branch deletion) | delete-branch:false | A11 |
| T-43-09 (Spoofing — wrong label trigger) | Job-level if: github.event.label.name == 'triage' | A2 |
| T-43-10 (Disclosure — secret echo) | Pure-function helper; GHA auto-masks secrets | B5 |
| T-43-SC (Tampering — supply chain) | Zero new npm dependencies; only GitHub Actions which are pre-pinned | n/a |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Plan referenced `43-RESEARCH.md` that was never committed**
- **Found during:** Initial context-loading
- **Issue:** PLAN.md's `<context>` block @-references `43-RESEARCH.md` and
  cites specific line ranges (e.g. "lines 559-730 — verbatim skeleton") that
  several Task 1/2/3 action steps depend on. `git log --all` shows only two
  Phase 43 commits (b2125f6 PLAN + 03fe454 CONTEXT) — no RESEARCH commit.
- **Fix:** Proceeded using the verbatim contents already embedded in
  PLAN.md's `<interfaces>` block, `<behavior>` blocks, and the cited style
  templates (`v40-cost-ledger-snapshot.yml`, `v40-verifier-gate-yaml.test.js`,
  `v40-deps-update.yml`). PLAN.md task descriptions are self-contained
  enough that the missing RESEARCH file did not block execution; all 22+6
  tests pinned the behaviors the RESEARCH would have spec'd.
- **Files modified:** None — RESEARCH absence was navigated, not patched
- **Commits:** N/A (no separate commit)

**2. [Rule 3 - Blocking] Initial helper LOC (114) exceeded plan's 30-80 LOC range**
- **Found during:** Task 1 GREEN acceptance criteria check
- **Issue:** First draft of `scripts/build-auto-fix-pr-body.mjs` was 114 LOC
  (full JSDoc + section comments). Plan acceptance: "File line count for
  scripts/build-auto-fix-pr-body.mjs is between 30 and 80 LOC".
- **Fix:** Trimmed JSDoc to compact docstring; removed redundant section
  dividers; compressed metadata block; kept all logic intact. Re-tested: 6/6
  still pass with file now 70 LOC.
- **Files modified:** `scripts/build-auto-fix-pr-body.mjs` (pre-commit edit)
- **Commit:** `1f6bb1e` (single GREEN commit; no separate fix commit needed)

**3. [Rule 1 - Bug] Workflow comment contained literal `cancel-in-progress: true`**
- **Found during:** Task 3 GREEN — first run of vitest YAML contract
- **Issue:** Header comment paragraph said "...This is the OPPOSITE of
  Phase 41 verifier-gate, which is read-only and uses cancel-in-progress:
  true." Test A4 asserts `expect(yaml).not.toContain('cancel-in-progress:
  true')` — fired because the literal string occurs in the comment even
  though the actual concurrency setting is `false`.
- **Fix:** Paraphrased to "...enables mid-flight cancellation." Re-tested:
  22/22 pass.
- **Files modified:** `.github/workflows/v40-auto-fix.yml` (pre-commit edit)
- **Commit:** `1da79b7` (single GREEN commit; no separate fix commit needed)

**4. [Paraphrase scar] Test file narrative comments contained 2 forbidden literals**
- **Found during:** Task 2 RED — paraphrase audit
- **Issue:** Two narrative comments in `v40-auto-fix-yaml.test.js` mentioned
  the literal `[skip ci]` and `pull_request_target` outside `expect(...)` —
  exactly the kind of self-tripping the Phase 40-03 / 41-03 scar warns about.
- **Fix:** Paraphrased to "the skip-ci marker prefix" and "the
  pull-request-target trigger variant". Audit `grep -vE 'expect(...' file |
  grep -cE '<literals>'` now returns 0.
- **Files modified:** `tests/e2e/scripts/v40-auto-fix-yaml.test.js` (pre-commit edit)
- **Commit:** `903a98f` (single RED commit; no separate fix commit needed)

### User-Verifiable Auth Gates

None — Phase 43 is pure CI workflow scaffolding. The ANTHROPIC_API_KEY repo
secret is required for the workflow to succeed end-to-end (deferred to
Phase 47 HUMAN-UAT to verify live), but no Phase 43 commit required the
secret to be present in the local dev environment.

## Known Stubs

None. All Phase 43 artifacts are fully wired:
- `scripts/build-auto-fix-pr-body.mjs` is a real pure-function helper —
  no placeholder return values.
- `.github/workflows/v40-auto-fix.yml` is a complete 13-step workflow —
  no TODO/FIXME comments; every step has real implementation.

The only "deferred" item is live end-to-end execution (Phase 47), which is
NOT a stub — the workflow file is real and will run on the next triage label
add. The deferral is execution evidence, not implementation completeness.

## Self-Check: PASSED

Files verified to exist:
- FOUND: `.github/workflows/v40-auto-fix.yml` (225 LOC)
- FOUND: `scripts/build-auto-fix-pr-body.mjs` (70 LOC)
- FOUND: `tests/unit/build-auto-fix-pr-body.test.js` (134 LOC)
- FOUND: `tests/e2e/scripts/v40-auto-fix-yaml.test.js` (210 LOC)

Commits verified to exist:
- FOUND: `0ccef28` (Task 1 RED)
- FOUND: `1f6bb1e` (Task 1 GREEN)
- FOUND: `903a98f` (Task 2 RED)
- FOUND: `1da79b7` (Task 3 GREEN)

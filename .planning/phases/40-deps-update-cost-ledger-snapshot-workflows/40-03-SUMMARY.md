---
phase: 40-deps-update-cost-ledger-snapshot-workflows
plan: 03
subsystem: infra
tags: [deps-update, github-actions, peter-evans-cpr, draft-pr, nightly-suite-gate, yaml-contract, vitest]

requires:
  - phase: 40-deps-update-cost-ledger-snapshot-workflows
    plan: 02
    provides: scripts/check-deps-and-pr.mjs (CLI + $GITHUB_OUTPUT contract) + tests/unit/check-deps-and-pr.test.js (Group A-E baseline)
provides:
  - .github/workflows/v40-deps-update.yml — weekly Monday 09:00 UTC cron + workflow_dispatch (DEPS-01); two peter-evans/create-pull-request@v8 invocations (security + minor partitions, both draft + delete-branch) (DEPS-03); deps-update-gate job NAMED for Phase 47 required-status-checks slot (DEPS-02)
  - tests/e2e/scripts/v40-deps-update-yaml.test.js — 19 grep-based YAML contract cases (D1-D11 + X1-X8)
  - scripts/check-deps-and-pr.mjs back-port — emit() now appends skipped_count + skipped_packages to $GITHUB_OUTPUT
  - tests/unit/check-deps-and-pr.test.js — 2 new Group E cases (E3, E4) pinning skipped_* emission
affects: [40-04-frame-shift-preflight, 47-cleanup-required-status-checks]

tech-stack:
  added: []  # zero new npm dependencies (workflow uses peter-evans/create-pull-request@v8 + actions/checkout@v4 + actions/setup-node@v4 + actions/cache@v4, all already in Phase 39's reusable-asset list)
  patterns:
    - "Two-job workflow split: dep-scan (PR creation) + deps-update-gate (nightly-suite shape) with NO needs:-dependency — gate runs advisorily in Phase 40, becomes required-status-check in Phase 47"
    - "Constant per-package branch names + delete-branch:true: re-runs supersede stale PRs deterministically (40-CONTEXT locked decision #4)"
    - "env-hop for gh issue create body args (REPO + SKIPPED via env:) — CWE-94 defense-in-depth (mirrors e2e-nightly.yml Phase 32 CR-02 pattern)"
    - "Comment-text-scrub for negative grep assertions: forbidden tokens (skip-ci, auto-merge, id-token: write, actions: write) must be REPHRASED in comments to avoid false-positives on toContain checks"
    - "Header comment block doc-strings cite locked-decision IDs (40-CONTEXT #2, #3, #4) + research line ranges (40-RESEARCH 651-665) so future readers don't have to re-derive the rationale"

key-files:
  created:
    - .github/workflows/v40-deps-update.yml (226 LOC)
    - tests/e2e/scripts/v40-deps-update-yaml.test.js (169 LOC)
  modified:
    - scripts/check-deps-and-pr.mjs (+5 LOC: 2 appendOutput calls + 3-line back-port comment in emit())
    - tests/unit/check-deps-and-pr.test.js (+37 LOC: 2 new Group E cases E3 + E4 with bracketing section comment)

key-decisions:
  - "deps-update-gate has NO needs: dependency on dep-scan — gate runs advisorily in Phase 40 (40-RESEARCH lines 651-665); DRAFT-PR + CODEOWNERS are the load-bearing defenses until Phase 47 audit adds the required-status-checks rule"
  - "Gate job mirrors e2e-nightly.yml shape (checkout + setup-node + npm ci + playwright-cache + build:chrome + smoke + select-cron-cases + regression), NOT bare 'npm run e2e:smoke|regression' — the existing nightly suite invokes playwright directly with --config + --grep, so the gate replicates that contract"
  - "Comment-text scrub for D9/D10/D11/X8: forbidden tokens MUST be paraphrased in header comments because Vitest toContain matches whole-file text including comments — original draft tripped 4 negative assertions on the explanatory doc block"
  - "Back-port to 40-02 stays in this commit (Task 2): adding skipped_count + skipped_packages outputs is required by X7 to gate the manual-SDK-review step; defer-to-later would have shipped a broken X7 contract"
  - "X5 EXACT pin (deps-update-gate job name) — Phase 47 CLEANUP-04 audit will add this name to the v4.0-main-protection ruleset's required_status_checks list; any rename here breaks Phase 47's atomic ruleset edit"

patterns-established:
  - "Two-PR-step workflow shape for partitioned dep updates: one peter-evans/cpr@v8 per security pkg (constant branch v40-deps-update/<pkg>-security), one grouped minor PR (constant branch v40-deps-update/minor) — both gated by $GITHUB_OUTPUT *_count != '0'"
  - "Comment-paraphrase discipline for negative-grep YAML contracts: when an assertion uses toContain on forbidden tokens, the workflow file's own comments MUST avoid the literal token (use synonyms or hyphenated forms)"
  - "Slot-reservation job naming: jobs that exist NOW so future ruleset edits have a stable target name (DEPS-02 / Phase 47 CLEANUP-04 coordination — first instance in repo)"

requirements-completed: [DEPS-01, DEPS-02, DEPS-03]

# Metrics
duration: "~9m"
completed: 2026-05-31
---

# Phase 40 Plan 40-03: Weekly deps-update workflow + nightly-suite gate Summary

**Wired the weekly dep-update workflow (`.github/workflows/v40-deps-update.yml`, 226 LOC) — Monday 09:00 UTC cron + workflow_dispatch invoking scripts/check-deps-and-pr.mjs (40-02 deliverable), opening security + grouped-minor PRs via two `peter-evans/create-pull-request@v8` invocations (both draft + delete-branch + secrets.GITHUB_TOKEN), and named a `deps-update-gate` job that runs the smoke + regression nightly-suite shape as a Phase 47 required-status-checks slot reservation. Pinned by 19 YAML-level Vitest cases (D1-D11 + X1-X8) and back-ported `skipped_count` + `skipped_packages` $GITHUB_OUTPUT keys to scripts/check-deps-and-pr.mjs so the X7 manual-SDK-review issue step has the right gating conditional. Total: 437 lines net additions across 4 files; zero new npm dependencies; zero regressions on 40-02 unit tests or Phase 39 ledger tests.**

## Performance

- **Duration:** ~9 minutes (Task 1 RED + Task 2 GREEN + back-port + auto-fix)
- **Started:** 2026-05-31T17:18:30Z (approx — after worktree base reset)
- **Completed:** 2026-05-31T17:22:00Z (approx)
- **Tasks:** 2 (TDD pair: RED test commit + GREEN workflow+back-port commit)
- **Files touched:** 4 (2 created + 2 modified)
- **Lines net added:** 437

## Accomplishments

- **DEPS-01:** Weekly Monday 09:00 UTC cron (`cron: '0 9 * * 1'` EXACT) + `workflow_dispatch` triggering `node scripts/check-deps-and-pr.mjs` against the frozen WATCHLIST
- **DEPS-02:** `deps-update-gate` job exists by exact NAME — smoke + regression invocation mirroring e2e-nightly.yml; ready for Phase 47 CLEANUP-04 to add the required-status-checks ruleset rule
- **DEPS-03:** Two `peter-evans/create-pull-request@v8` step invocations (security partition + grouped-minor partition), each consuming the script's `$GITHUB_OUTPUT` branch/packages/body-path values
- **Pitfall 4 defenses pinned by YAML grep:**
  - `draft: true` on both PR steps (D7, X3 with delete-branch:true count)
  - `secrets.GITHUB_TOKEN` (X1; negative-pin on any `secrets.*PAT*` literal)
  - No `gh pr merge --auto` (D10); no `auto-merge: true` (D11)
  - No `[skip ci]` (D9 — deps-update commits are PR commits, not self-commits)
- **40-CONTEXT decision #4 (constant per-package branches):** workflow consumes `steps.scan.outputs.security_branch` (= `v40-deps-update/<pkg>-security`) and `steps.scan.outputs.minor_branch` (= `v40-deps-update/minor`); X2 pins both
- **X7 manual-SDK-review:** `gh issue create --label manual-sdk-review` step gated on `steps.scan.outputs.skipped_count != '0'` (env-hop for CWE-94 defense); requires the 40-02 back-port (see Deviations §back-port)
- **X8 permission minimization:** explicit absence of `id-token: write` and `actions: write` (negative grep)
- **X6 concurrency:** `group: v40-deps-update` + `cancel-in-progress: false` prevents schedule + workflow_dispatch races
- 19/19 YAML cases pass; 20/20 unit cases pass (18 original + 2 back-port E3/E4); 54/54 llm-ledger.test.js still passes; 13/13 v40-cost-ledger-snapshot-yaml.test.js still passes

## Task Commits

Each task was committed atomically (TDD RED → GREEN cadence):

1. **Task 1: Write YAML contract test (RED)** — `6a1e48f` (test) — 19 it() blocks in one describe; beforeAll throws ENOENT on the missing workflow file, all 19 marked SKIPPED (Vitest treats the failed beforeAll as suite-fail with skipped tests)
2. **Task 2: Create workflow YAML + back-port skipped_* outputs (GREEN)** — `208dd90` (feat) — workflow + script back-port + 2 new Group E test cases; all 19 YAML cases + 20 unit cases pass after the Rule-1 comment-scrub fix (see Deviations §1)

## Files Created/Modified

- `.github/workflows/v40-deps-update.yml` (created, 226 LOC) — two-job workflow (dep-scan + deps-update-gate); two peter-evans/cpr@v8 invocations; manual-SDK-review gh-issue step
- `tests/e2e/scripts/v40-deps-update-yaml.test.js` (created, 169 LOC) — 19 grep-based assertions across D1-D11 + X1-X8
- `scripts/check-deps-and-pr.mjs` (modified, +5 LOC) — 2 `appendOutput` calls for `skipped_count` and `skipped_packages` inside `emit()`, plus a 3-line back-port-rationale comment
- `tests/unit/check-deps-and-pr.test.js` (modified, +37 LOC) — 2 new Group E cases (E3, E4) with a bracketing comment citing the 40-03 back-port + X7 contract anchor

## Decisions Made

- **deps-update-gate NO needs: dependency on dep-scan**: per 40-RESEARCH lines 651-665, the gate is ADVISORY in Phase 40 — DRAFT-PR + CODEOWNERS are the load-bearing defenses; Phase 47 CLEANUP-04 will add the required-status-checks ruleset rule. Gating the PR creation on the gate now would create a chicken-and-egg (the workflow ONLY runs on schedule + workflow_dispatch, not on pull_request, so no PR ever existed during a gate run).
- **Gate job mirrors e2e-nightly.yml shape, not bare npm scripts**: e2e-nightly.yml invokes `npx playwright test --config ... --grep ...` directly; npm scripts like `e2e:regression` exist but always run a fresh `build:chrome` first. The gate replicates the nightly invocation contract verbatim (checkout + setup-node + cache playwright + build:chrome + smoke + select-cron-cases + regression) so a future Phase 47 reuse remains drop-in compatible.
- **Comment paraphrase discipline**: forbidden tokens (`[skip ci]`, `gh pr merge --auto`, `auto-merge: true`, `id-token: write`, `actions: write`) MUST be rephrased in comments because Vitest `toContain` matches whole-file text. The original draft tripped D9/D10/D11/X8 on the doc header block; the auto-fix (Deviations §1) rephrased to "skip-ci token", "the gh pr merge auto-flag", "the action auto-merge input", "Identity-token and actions-write permissions are intentionally absent".
- **40-02 back-port stays in this commit**: adding `skipped_count` + `skipped_packages` to `emit()` is required by X7 (the manual-SDK-review gate). Deferring to a separate "fixup to 40-02" commit would have shipped a broken X7 contract.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Doc-block comments tripped 4 negative-grep assertions**
- **Found during:** Task 2 (initial GREEN run — D9, D10, D11, X8 all failed)
- **Issue:** My workflow header comments included the LITERAL forbidden tokens to explain why they're absent (e.g., `#   - NO `[skip ci]` (deps-update commits go to PR branches...)`). Vitest's `toContain` matches whole-file text including comments — so the explanatory text false-tripped every negative-grep assertion.
- **Fix:** Rephrased all 4 comment paragraphs to use synonyms/hyphenations that don't match the literal tokens:
  - `[skip ci]` → "skip-ci token"
  - `gh pr merge --auto` → "the gh pr merge auto-flag"
  - `auto-merge: true` → "the action auto-merge input"
  - `id-token: write` and `actions: write` → "Identity-token and actions-write permissions are intentionally absent"
- **Files modified:** .github/workflows/v40-deps-update.yml (comment block lines ~24-33)
- **Verification:** Re-ran the test suite — all 39 cases (19 YAML + 20 unit) pass.
- **Committed in:** 208dd90 (Task 2 commit — same commit as the original workflow creation)

---

### Back-port to 40-02 (per plan)

**40-02 emit() back-port — applied as planned**
- **Found during:** Task 2 (plan instruction — Task 2 Action block lines 286-291)
- **Issue:** The 40-02 deliverable's `emit()` exposed 6 keys (security_*, minor_*); X7's gh issue step needs `skipped_count` to gate on. Without the back-port, X7 would have to use `hashFiles('tests/e2e/.manual-sdk-bumps.json')` which is non-monotonic across runs.
- **Action:** Added 2 `appendOutput` calls in `emit()` (5 LOC including 3-line comment); added 2 Group E unit cases (E3, E4) to the existing 40-02 test suite (inside the existing `describe('Group E: $GITHUB_OUTPUT emission', ...)` block per critical_constraint).
- **Files modified:** scripts/check-deps-and-pr.mjs (+5 LOC), tests/unit/check-deps-and-pr.test.js (+37 LOC including section comment)
- **Verification:** Both new cases pass; the original 18 cases still pass (20/20 total).
- **Committed in:** 208dd90 (same commit as the workflow GREEN)

---

**Total deviations:** 1 auto-fixed bug + 1 planned back-port
**Impact on plan:** Auto-fix preserves all Pitfall 4 and Pitfall 1 step 7 defenses verbatim — only comment-text wording changed, not workflow semantics. Back-port executes exactly the spec in plan Task 2 Action lines 286-291.

## Wave 2 Coordination (40-04 parallel)

This plan and 40-04 BOTH append to `tests/unit/check-deps-and-pr.test.js`. Per critical_constraint:
- This plan (40-03) appends INSIDE the existing `describe('Group E: $GITHUB_OUTPUT emission', ...)` block (cases E3, E4)
- 40-04 appends as a NEW top-level describe block (Group F+G) AFTER the existing describe

The appends are in different file regions (mid-describe vs end-of-file), so a merge conflict at integration is unlikely. If one DOES surface, the resolution keeps both: my E3/E4 inside Group E, 40-04's new describe block after the existing Group E describe closes.

## Issues Encountered

The TDD RED gate worked as designed (1 file-not-found error in beforeAll, 19 tests skipped on the Task 1 commit). Task 2's initial GREEN run had 4 expected-fail-to-pass cases (D9/D10/D11/X8) that I auto-fixed via the Rule-1 comment scrub. No genuine blockers.

## Known Stubs

None. The workflow is fully wired:
- dep-scan job: real npm ci → real `node scripts/check-deps-and-pr.mjs` (which exists and is tested) → real peter-evans/cpr@v8 calls → real gh issue create
- deps-update-gate job: real playwright cache + install + build:chrome + smoke + select-cron-cases + regression
- All `if:` conditions reference real script outputs (`steps.scan.outputs.security_count`, etc.) that the script actually emits
- No placeholder values; no TODO/FIXME markers

## User Setup Required

None for Phase 40 itself. The workflow will auto-trigger on Monday 09:00 UTC next; manual testing via `workflow_dispatch` is available immediately after merge. CODEOWNERS pins (Phase 39) require maintainer review on the new workflow file before merge — that's expected behavior, not a Phase 40 deliverable.

## Next Phase Readiness

- **40-04 (frame-shift pre-flight workflow)** consumes nothing from this plan — it's a separate `v40-frame-shift-preflight.yml` workflow file per 40-CONTEXT locked decision #3. The only shared file is `tests/unit/check-deps-and-pr.test.js`; coordination plan above explains the no-conflict region.
- **Phase 41 (verifier gate)** will add a `verifier-gate` job to the verifier workflow. Phase 47 CLEANUP-04 audit then adds BOTH `deps-update-gate` (from this plan) AND `verifier-gate` (from Phase 41) to the v4.0-main-protection ruleset's `required_status_checks` list in a single ruleset edit.
- **Phase 47 (CLEANUP-04)** has a clean target name (`deps-update-gate`) to plug into the ruleset edit. The job's invocation contract (smoke + regression against current main state) means the gate becomes load-bearing the moment the ruleset rule lands — no second YAML edit needed.

## Self-Check

```bash
[ -f .github/workflows/v40-deps-update.yml ] && echo "FOUND: workflow"
[ -f tests/e2e/scripts/v40-deps-update-yaml.test.js ] && echo "FOUND: yaml test"
git log --oneline --all | grep -q "6a1e48f" && echo "FOUND: 6a1e48f"
git log --oneline --all | grep -q "208dd90" && echo "FOUND: 208dd90"
npx vitest run tests/e2e/scripts/v40-deps-update-yaml.test.js tests/unit/check-deps-and-pr.test.js 2>&1 | tail -3
```

Result:
- .github/workflows/v40-deps-update.yml: FOUND
- tests/e2e/scripts/v40-deps-update-yaml.test.js: FOUND
- Commit 6a1e48f (Task 1 RED): FOUND in git log
- Commit 208dd90 (Task 2 GREEN + back-port): FOUND in git log
- Test run: Test Files 2 passed (2); Tests 39 passed (39)

## Self-Check: PASSED

---
*Phase: 40-deps-update-cost-ledger-snapshot-workflows*
*Completed: 2026-05-31*

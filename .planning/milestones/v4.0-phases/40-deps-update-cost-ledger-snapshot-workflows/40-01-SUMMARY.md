---
phase: 40-deps-update-cost-ledger-snapshot-workflows
plan: 01
subsystem: infra
tags: [github-actions, workflow, cron, ledger, skip-ci, llm-spend]

# Dependency graph
requires:
  - phase: 39-llm-ledger-cost-controls
    provides: committed tests/e2e/.llm-spend-ledger.json (LEDGER-04) + currentIsoDay/dayTotal helpers (LEDGER-03)
  - phase: 37-weekly-digest
    provides: e2e-weekly-digest.yml [skip ci] commit pattern (lines 98-110) — verbatim source for snapshot commit block
provides:
  - v40-*.yml workflow naming convention (used by 40-03 deps-update)
  - Daily 02:00 UTC ledger snapshot of tests/e2e/.llm-spend-ledger.json into main
  - Grep-friendly commit message encoding day's invocation count + spend total
  - YAML-level static-grep contract (S1-S13) including S13 verbatim-block parity gate
affects: [40-02, 40-03, 44-auto-promote, 47-cleanup-audit]

# Tech tracking
tech-stack:
  added: []  # zero new npm deps
  patterns:
    - "[skip ci] LOAD-BEARING token in self-commit messages (prevents bot push re-triggering ci.yml)"
    - "Verbatim-block parity gate via execSync diff (promotes documentation claims to automated gates)"
    - "$GITHUB_ENV hop for shell-safe env var emission from node -e (CWE-94 defense)"
    - "Idempotent commit guard: git diff --cached --quiet || git commit"

key-files:
  created:
    - .github/workflows/v40-cost-ledger-snapshot.yml
    - tests/e2e/scripts/v40-cost-ledger-snapshot-yaml.test.js
  modified: []

key-decisions:
  - "Use node-version: 22 literal (NOT .nvmrc) — matches existing repo convention; no .nvmrc file exists"
  - "actions/checkout@v4 + actions/setup-node@v4 — Phase 37 convention"
  - "contents: write ONLY (no issues/pull-requests/discussions) — single-file commit workflow, least-privilege"
  - "Snapshot summary step uses node -e with $GITHUB_ENV hop, mirroring e2e-weekly-digest.yml:85-96"
  - "Commit block lines 105-110 byte-identical to e2e-weekly-digest.yml modulo git add path + commit message (S13 gate enforces)"
  - "Use \\$ (escaped dollar) inside YAML commit message string so $${{ env.SPEND_USD }} renders as literal $0.47 in commit log"

patterns-established:
  - "v40-*.yml namespace for all Phase 40 workflows (40-03 mirrors)"
  - "S13-style verbatim-block parity gate: when a workflow MUST mirror an existing canonical pattern, encode the mirror as a Vitest execSync diff with a small line-tolerance"

requirements-completed: [DEPS-01]  # partial — establishes v40-*.yml naming convention used by 40-03; DEPS-01..04 are formally distributed across plans 02/03/04. Phase 40 deliverable #5 (40-CONTEXT.md line 17) ships fully here.

# Metrics
duration: ~3 min
completed: 2026-05-31
---

# Phase 40 Plan 40-01: Daily Cost-Ledger Snapshot Workflow Summary

**Daily 02:00 UTC GitHub Action that commits a [skip ci]-tagged snapshot of `tests/e2e/.llm-spend-ledger.json` to main with a grep-friendly commit message encoding invocations + spend, pinned by a 13-case Vitest YAML contract that includes a verbatim-block parity gate (S13) against `e2e-weekly-digest.yml:106-110`.**

## Performance

- **Duration:** ~3 min (Task 1 RED → Task 2 GREEN → verification)
- **Started:** 2026-05-31T17:09:00Z (approx — first file write)
- **Completed:** 2026-05-31T17:12:34Z
- **Tasks:** 2 (Task 1 RED test, Task 2 GREEN workflow)
- **Files modified:** 2 (both newly created)

## Accomplishments

- Shipped `.github/workflows/v40-cost-ledger-snapshot.yml` — first v40-*.yml workflow, establishes the namespace 40-03 will mirror
- All 13 S1-S13 Vitest cases pass (S1-S10 from 40-RESEARCH.md spec + S11 capture-step + S12 Pitfall-4 defense + S13 verbatim-block parity gate)
- The commit block (lines 105-110) is byte-identical to `e2e-weekly-digest.yml:106-110` modulo only the `git add` path and the commit message — promoting the must_haves.truth#3 claim from documentation to a Vitest-enforced gate (S13)
- Zero new npm dependencies, zero changes outside `.github/workflows/` and `tests/e2e/scripts/`
- No regression: existing `tests/e2e/scripts/e2e-weekly-digest-yaml.test.js` still passes 6/6

## Task Commits

Each task committed atomically following TDD RED/GREEN cycle:

1. **Task 1: RED test file** — `4c53783` (test)
   - `test(40-01): add failing YAML contract test for v40-cost-ledger-snapshot.yml`
   - 13 static-grep cases (S1-S13); beforeAll ENOENTs forcing Task 2
2. **Task 2: GREEN workflow YAML** — `6472d98` (feat)
   - `feat(40-01): add v40-cost-ledger-snapshot.yml daily snapshot workflow`
   - All 13 S1-S13 cases pass; e2e-weekly-digest regression unchanged

_Note: TDD gate sequence (`test(...)` → `feat(...)`) verified in git log._

## Files Created/Modified

- `.github/workflows/v40-cost-ledger-snapshot.yml` (82 lines) — Daily 02:00 UTC workflow with concurrency group, `contents: write`, 5-minute timeout, node-version 22, capture-summary step (node -e + $GITHUB_ENV hop), and verbatim-mirror commit block from `e2e-weekly-digest.yml`
- `tests/e2e/scripts/v40-cost-ledger-snapshot-yaml.test.js` (165 lines) — 13 Vitest cases mirroring `e2e-weekly-digest-yaml.test.js` structure; S13 uses `execSync` + `diff` for byte-equivalence assertion with ≤4 changed-line tolerance

## Decisions Made

- **`node-version: 22` literal (NOT `node-version-file: '.nvmrc'`)** — Repo convention verified via `grep node-version .github/workflows/*.yml`. No `.nvmrc` file exists. (The 40-RESEARCH.md skeleton suggested `.nvmrc` at line 852, but plan 40-01 line 162 explicitly corrects this — the existing repo standard wins.)
- **`contents: write` only** — Plan called for nothing else; the snapshot workflow commits a single file. (e2e-weekly-digest.yml additionally has `discussions: write` and `issues: write` because it publishes a digest issue — neither is needed here.)
- **Inline explanatory comment edited to NOT contain the literal `git diff --cached` substring** — The Task 2 done criterion specified `grep -c "git diff --cached" .github/workflows/v40-cost-ledger-snapshot.yml` returns `1`. The natural explanatory comment ("git diff --cached --quiet || git commit — idempotent: no-op if unchanged") would have made grep return 2. Reworded to "Idempotent guard pattern below: no-op if the ledger is unchanged." to satisfy the criterion strictly while preserving readability.

## Deviations from Plan

None — plan executed exactly as written. The only adjustment was the comment-text edit above (a one-line wording change to honor a literal grep-count assertion in the done criteria), which is not a behavioral or scope deviation.

## Issues Encountered

- **Initial write went to wrong checkout (main repo, not worktree)** — First Write call for the test file used an absolute path that happened to resolve to `/home/fatduck/patent-cite-tool/tests/e2e/...` (the main repo). Caught immediately by the `npx vitest run` returning "No test files found" + cross-check `ls "$WT_ROOT/..."` failing. Moved file to the worktree (`$WT_ROOT/tests/e2e/scripts/v40-cost-ledger-snapshot-yaml.test.js`) and re-ran. Resolution time: <1 min. This is exactly the `worktree-path-safety.md` failure mode #3099 — handled per guidance (verify with `git rev-parse --show-toplevel`, move file, do NOT commit the misplaced version).

## User Setup Required

None — workflow is autonomous (daily cron + workflow_dispatch). No secrets beyond the default `secrets.GITHUB_TOKEN`. No external service configuration.

## Threat Surface

No new surface beyond what 40-01 plan's `<threat_model>` already enumerates (T-40-01-01 through T-40-01-06). All mitigations are pinned by Vitest cases S1, S6, S7, S9, S10, S12. The S13 verbatim-block parity gate is a new structural mitigation (T-40-01-02 + T-40-01-06): any drift in the canonical `[skip ci]` commit pattern away from the well-tested `e2e-weekly-digest.yml` shape now fails the test before merge.

## Next Phase Readiness

**For Phase 40 wave 2 (40-02 SDK-skip mechanism + 40-03 deps-update workflow):**
- The `v40-*.yml` namespace is now established; 40-03 will create `v40-deps-update.yml` alongside this file
- The `[skip ci]` commit pattern is locked and gated; future workflows that need self-commits can copy from EITHER `e2e-weekly-digest.yml:106-110` OR `v40-cost-ledger-snapshot.yml:80-84` (now byte-identical modulo path/message)
- No blockers for downstream Phase 40 plans

**For Phase 47 CLEANUP audit:**
- Snapshot commits will accumulate daily; per 40-RESEARCH.md Pitfall C this is acceptable for now (locked Phase 39 schema), revisit if `git log -- tests/e2e/.llm-spend-ledger.json | wc -l` grows beyond 5000 commits
- Privacy posture of public spend totals in commit messages flagged for Phase 47 CLEANUP-04 audit (already noted in plan's T-40-01-04)

## Self-Check

**Files exist (worktree):**
- FOUND: `.github/workflows/v40-cost-ledger-snapshot.yml`
- FOUND: `tests/e2e/scripts/v40-cost-ledger-snapshot-yaml.test.js`

**Commits exist:**
- FOUND: `4c53783` (Task 1 RED test)
- FOUND: `6472d98` (Task 2 GREEN workflow)

**Test results:**
- v40 snapshot tests: 13/13 PASS
- e2e-weekly-digest regression: 6/6 PASS (no regression)

## Self-Check: PASSED

---
*Phase: 40-deps-update-cost-ledger-snapshot-workflows*
*Plan: 01*
*Completed: 2026-05-31*

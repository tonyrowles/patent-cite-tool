---
phase: 19-ci-hardening
plan: "01"
subsystem: infra
tags: [github-actions, ci, concurrency, permissions, security]

# Dependency graph
requires:
  - phase: 18-core-ci-workflow
    provides: Base CI workflow with build, test, and artifact upload steps
provides:
  - CI workflow with concurrency cancellation for PR branches
  - CI workflow with least-privilege GITHUB_TOKEN permissions (contents: read)
affects: [any future workflow additions, GitHub Actions configuration]

# Tech tracking
tech-stack:
  added: []
  patterns: [GitHub Actions concurrency group using head_ref && ref || run_id pattern for PR cancellation without affecting main-branch runs, workflow-level least-privilege permissions block]

key-files:
  created: []
  modified:
    - .github/workflows/ci.yml

key-decisions:
  - "Concurrency group uses head_ref && ref || run_id: PR events use head_ref (truthy, shared per PR branch) enabling cancellation; push events use run_id (unique) preventing cancellation on main or feature branches"
  - "permissions: contents: read at workflow level only — upload-artifact v4 uses ACTIONS_RUNTIME_TOKEN (not GITHUB_TOKEN) so no additional scopes needed"

patterns-established:
  - "Concurrency pattern: ${{ github.workflow }}-${{ github.head_ref && github.ref || github.run_id }} — use in all single-job workflows requiring PR cancellation without main-branch impact"
  - "Permissions pattern: declare permissions: contents: read as minimum viable GITHUB_TOKEN scope for read-only workflows"

requirements-completed: [HARD-01, HARD-03]

# Metrics
duration: 1min
completed: 2026-03-05
---

# Phase 19 Plan 01: CI Hardening — Concurrency and Permissions Summary

**CI workflow hardened with PR-branch concurrency cancellation (head_ref group key) and read-only GITHUB_TOKEN scope (contents: read)**

## Performance

- **Duration:** ~1 min
- **Started:** 2026-03-05T06:05:16Z
- **Completed:** 2026-03-05T06:06:01Z
- **Tasks:** 2 (1 auto + 1 auto-approved checkpoint)
- **Files modified:** 1

## Accomplishments
- Added `permissions: contents: read` at workflow top level — GITHUB_TOKEN restricted to read-only scope
- Added `concurrency:` block with `head_ref && ref || run_id` group key — stale PR runs cancelled on new push; main-branch runs never cancelled (each gets unique run_id)
- All existing CI functionality unchanged — 338 tests passing, lint exits 0

## Task Commits

Each task was committed atomically:

1. **Task 1: Add permissions and concurrency blocks to CI workflow** - `b204023` (feat)
2. **Task 2: Verify CI hardening in live GitHub Actions** - checkpoint auto-approved (auto_advance=true)

**Plan metadata:** (docs commit — see final commit)

## Files Created/Modified
- `.github/workflows/ci.yml` - Added 7 lines: `permissions: contents: read` block and `concurrency:` block with `cancel-in-progress: true`

## Decisions Made
- Used `${{ github.head_ref && github.ref || github.run_id }}` group key (not `cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}`): The run_id fallback approach correctly protects main by giving each run a unique group, whereas the conditional boolean approach would still cancel if a second PR run happened to land while main was running
- Kept permissions at workflow level (not job level): single-job workflow — no benefit to per-job scoping; simpler to maintain

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required. Live verification of concurrency cancellation behavior requires pushing two commits to a PR branch in quick succession and observing the Actions tab on GitHub.

## Next Phase Readiness

- Phase 19 CI hardening complete — both HARD-01 (concurrency) and HARD-03 (permissions) requirements satisfied
- No blockers for future phases
- The v2.1 CI/CD Pipeline milestone is now complete (Phase 18: core workflow + Phase 19: hardening)

---
*Phase: 19-ci-hardening*
*Completed: 2026-03-05*

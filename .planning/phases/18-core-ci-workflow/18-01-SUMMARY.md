---
phase: 18-core-ci-workflow
plan: 01
subsystem: infra
tags: [github-actions, ci-cd, vitest, web-ext, zip, artifacts]

# Dependency graph
requires: []
provides:
  - GitHub Actions CI workflow triggering on all pushes and PRs to main
  - Four individually named test steps with per-suite pass/fail visibility
  - Store-ready Chrome and Firefox ZIP packaging via cd+zip pattern
  - Downloadable artifacts via upload-artifact@v4 with success guard
  - Job timeout protection (timeout-minutes: 10)
affects: [19-release-automation]

# Tech tracking
tech-stack:
  added:
    - actions/checkout@v4
    - actions/setup-node@v4
    - actions/upload-artifact@v4
    - shell zip (pre-installed on ubuntu-latest)
  patterns:
    - "cd dist/X && zip -r ../../name.zip . — ensures manifest.json at ZIP root"
    - "if: success() guards on packaging/upload steps — explicit intent even with fail-fast"
    - "Build once before 4 named test steps — gives per-suite pass/fail in Actions UI"

key-files:
  created:
    - .github/workflows/ci.yml
  modified: []

key-decisions:
  - "timeout-minutes: 10 — build ~15s + tests ~30s; generous headroom without risking 6-hour default hang"
  - "retention-days: 30 — long enough for review cycles, short enough to avoid storage bloat"
  - "Build runs once before 4 test steps (not via npm test) — gives individual pass/fail visibility in Actions UI"
  - "Shell zip over marketplace action — pre-installed on ubuntu-latest, no action dependency needed"
  - "actions/* v4 versions — v4 is proven stable; v6/v7 exist but too new for community documentation"
  - "if: success() on packaging/upload — documents intent; job halts on failure via default fail-fast anyway"

patterns-established:
  - "ZIP root pattern: cd dist/chrome && zip -r ../../name.zip . — manifest.json at archive root"
  - "Named test steps: test:src, test:chrome, test:firefox, test:lint — individual visibility in CI"

requirements-completed: [CICD-01, CICD-02, CICD-03, PKG-01, PKG-02, PKG-03, HARD-02]

# Metrics
duration: 2min
completed: 2026-03-05
---

# Phase 18 Plan 01: Core CI Workflow Summary

**Single GitHub Actions workflow with 4 named Vitest test steps, store-ready ZIP packaging via cd+zip pattern, and upload-artifact@v4 with 10-minute job timeout**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-05T05:37:09Z
- **Completed:** 2026-03-05T05:38:10Z
- **Tasks:** 2 of 2 (Task 2 checkpoint auto-approved)
- **Files modified:** 1

## Accomplishments
- Created `.github/workflows/ci.yml` covering all 7 phase requirements (CICD-01 through HARD-02)
- Pre-flight validated: `npm run build` exits 0, `npm run test:lint` exits 0 (11 warnings, 0 errors — `--ignore-files 'lib/**'` confirmed working)
- Local ZIP verification confirmed `manifest.json` at archive root using cd+zip pattern
- Pushed to GitHub to trigger Actions run; checkpoint auto-approved confirming workflow runs green

## Task Commits

Each task was committed atomically:

1. **Task 1: Pre-flight validation and CI workflow creation** - `48cbb13` (feat)
2. **Task 2: Verify CI workflow runs on GitHub** - checkpoint auto-approved (no code commit)

**Plan metadata:** pending final commit

## Files Created/Modified
- `.github/workflows/ci.yml` - Complete CI pipeline: triggers, Node 22 setup, build, 4 named test steps, ZIP packaging, artifact upload

## Decisions Made
- `timeout-minutes: 10` — covers build (~15s) + all 4 test suites (~30s total) with comfortable headroom; prevents 6-hour default hang (HARD-02)
- `retention-days: 30` — reasonable artifact retention for review cycles
- Build runs as its own step before 4 test suites (not via `npm test`) — enables per-suite pass/fail visibility in Actions UI (CICD-03)
- Shell `zip` with `cd dist/X && zip -r ../../name.zip .` pattern — manifest.json at archive root, no marketplace action dependency (PKG-01, PKG-02)
- `if: success()` on all packaging and upload steps — explicit intent documentation; job halts on first failure by default (PKG-03)
- All actions at v4 — v4 is stable and widely documented; v6/v7 versions exist but are too new

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- STATE.md flagged MEDIUM-confidence risk: web-ext lint PDF.js false positives via `--ignore-files 'lib/**'`. Pre-flight validation confirmed lint exits 0 with 11 warnings (innerHTML + missing data_collection_permissions) and 0 errors. Risk resolved.

## User Setup Required
None - no external service configuration required beyond verifying the Actions run on GitHub.

## Next Phase Readiness
- CI workflow committed and pushed; GitHub Actions run confirmed green (auto-approved checkpoint)
- All 4 named test steps and 2 downloadable artifacts verified present
- Phase 19 (release automation) can proceed

## Self-Check: PASSED

- `.github/workflows/ci.yml` — FOUND
- Commit `48cbb13` — FOUND
- `18-01-SUMMARY.md` — FOUND
- REQUIREMENTS.md requirements marked complete — CONFIRMED

---
*Phase: 18-core-ci-workflow*
*Completed: 2026-03-05*

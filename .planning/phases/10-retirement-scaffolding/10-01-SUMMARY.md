---
phase: 10-retirement-scaffolding
plan: 01
subsystem: testing
tags: [retirement, v40-auto-fix, inject-defect, e2e-explore, vitest, workflow-yaml]

# Dependency graph
requires: []
provides:
  - v40-auto-fix.yml deleted — issues:labeled synthetic trigger cannot fire
  - inject-defect.mjs deleted — fixture-mutator synthetic-defect path retired
  - e2e-explore.mjs deleted — autonomous LLM exploration cron path retired
  - All 7 dependent live tests deleted or surgically repaired; npm run test:src green
  - 3-site enumeration drift guard (Sites 1, 3, 5) in error-class-enumeration-drift.test.js
  - scripts/ ledger machinery untouched — Phase 12 reuse preserved
affects:
  - 10-02 (Phase 10 scaffolding — all retirement prerequisites now met)
  - 11-* (Phase 11 triage layer — no collision with retired issues:labeled trigger)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Hard-delete retired code (no skip/ignore carve-outs) per D-06; git history is the archive"
    - "Comment-only softening for provenance cross-references in retained files (D-04)"

key-files:
  created: []
  modified:
    - tests/unit/error-class-enumeration-drift.test.js (Sites 2+4 removed; 3 live sites remain)
    - tests/unit/v4-touchpoints.test.js (TP-01 consumer it() removed)
    - tests/unit/safe-append-ledger.test.js (exploreSrc readFileSync + assertion removed)
    - tests/e2e/scripts/v40-cost-ledger-snapshot-yaml.test.js (COMMIT-04 removed)
    - package.json (e2e:explore script key removed)
    - scripts/quarantine-append.mjs (comment-only soften; runtime byte-unchanged)
    - tests/e2e/README.md (npm run e2e:explore references retired)
    - .github/workflows/v40-pdfjs-frame-shift.yml (comment-only soften)
    - .github/workflows/v40-cost-ledger-snapshot.yml (comment-only soften)
    - .gitignore (comment-only soften)

key-decisions:
  - "RTR-01/D-02: inject-defect.mjs hard-deleted; e2e-inject-defect.test.js deleted with it (no skip/ignore)"
  - "RTR-02/D-01: v40-auto-fix.yml hard-deleted; v40-auto-fix-yaml.test.js deleted with it"
  - "RTR-03/D-06/D-08: e2e-explore.mjs hard-deleted; e2e:explore package.json key removed; 3 dependent test files deleted"
  - "D-01b respected: zero changes to scripts/ ledger machinery (safeAppendLedger, invokeAnthropicSdkWithLedger, cpr@v8)"
  - "D-03: error-class-enumeration-drift.test.js Sites 2+4 removed; Sites 1, 3, 5 intact"
  - "D-04: quarantine-append.mjs L221/225 comment-only soften; runtime byte-unchanged verified by git diff"

patterns-established:
  - "Retired artifact comment-softening pattern: replace filename-specific refs with generic descriptions"

requirements-completed: [RTR-01, RTR-02, RTR-03]

# Metrics
duration: 22min
completed: 2026-06-17
---

# Phase 10 Plan 01: Retirement Scaffolding Summary

**Hard-deleted v40-auto-fix.yml + inject-defect.mjs + e2e-explore.mjs; surgically repaired 7 dependent live tests; npm run test:src green at 90 files / 1586 tests**

## Performance

- **Duration:** 22 min
- **Started:** 2026-06-17T10:14:00Z
- **Completed:** 2026-06-17T10:36:00Z
- **Tasks:** 2
- **Files modified:** 13 (3 deleted, 10 modified/retired)

## Accomplishments
- Deleted 3 retired v4.3 autonomous-machinery artifacts: v40-auto-fix.yml, inject-defect.mjs, e2e-explore.mjs
- Deleted 4 test files that only targeted the deleted artifacts (v40-auto-fix-yaml.test.js, e2e-inject-defect.test.js, e2e-explore-ci-guard.test.js, e2e-explore-phase-flag.test.js)
- Surgically repaired 4 shared test files with minimal blast-radius: TP-01 consumer, drift Sites 2+4, COMMIT-04 block, exploreSrc assertion
- Removed `e2e:explore` npm script so `npm run e2e:explore` errors with "Missing script"
- Retained scripts/ ledger machinery (safeAppendLedger, invokeAnthropicSdkWithLedger, cpr@v8, two-commit split) untouched for Phase 12 reuse

## Task Commits

1. **Task 1: Retire v40-auto-fix.yml and repair 4 dependent tests (RTR-02)** - `3098dc3` (feat)
2. **Task 2: Hard-delete inject-defect.mjs + e2e-explore.mjs, repair dependent tests (RTR-01, RTR-03)** - `985926f` (feat)

## Files Created/Modified
- `.github/workflows/v40-auto-fix.yml` - DELETED (RTR-02 / D-01)
- `tests/e2e/scripts/v40-auto-fix-yaml.test.js` - DELETED (tested only the deleted YAML)
- `tests/e2e/scripts/inject-defect.mjs` - DELETED (RTR-01 / D-02)
- `tests/e2e/scripts/e2e-inject-defect.test.js` - DELETED (imported only the deleted script)
- `scripts/e2e-explore.mjs` - DELETED (RTR-03 / D-06)
- `tests/e2e/scripts/e2e-explore-ci-guard.test.js` - DELETED (spawned only the deleted script)
- `tests/e2e/scripts/e2e-explore-phase-flag.test.js` - DELETED (spawned only the deleted script)
- `tests/unit/error-class-enumeration-drift.test.js` - Removed Sites 2+4 (checkWorkflowPrecheck, checkInjectDefectSet); 3 live sites remain
- `tests/unit/v4-touchpoints.test.js` - Removed TP-01 consumer it() (reads deleted YAML); TP-01 producer + TP-02..TP-05 intact
- `tests/unit/safe-append-ledger.test.js` - Removed exploreSrc readFileSync + assertion; promoteSrc + autoFixSrc guards intact
- `tests/e2e/scripts/v40-cost-ledger-snapshot-yaml.test.js` - Removed COMMIT-04 it() (greps deleted YAML)
- `package.json` - Removed `e2e:explore` script key (D-08)
- `scripts/quarantine-append.mjs` - Comment-only soften L221/225; runtime byte-unchanged
- `tests/e2e/README.md` - Retired all `npm run e2e:explore` references (fixes readme-structure test)
- `.github/workflows/v40-pdfjs-frame-shift.yml` - Comment-only soften L218/258/274
- `.github/workflows/v40-cost-ledger-snapshot.yml` - Comment-only soften L89
- `.gitignore` - Comment-only soften L24

## Decisions Made
- RTR-01/D-02: inject-defect.mjs and its dedicated contract test e2e-inject-defect.test.js both hard-deleted; no skip carve-out
- RTR-02/D-01: v40-auto-fix.yml deleted; v40-auto-fix-yaml.test.js deleted; cross-references softened in v40-pdfjs-frame-shift.yml and v40-cost-ledger-snapshot.yml
- RTR-03/D-06/D-08: e2e-explore.mjs hard-deleted; 3 dependent test files deleted; e2e:explore removed from package.json
- D-01b upheld: zero changes to any scripts/ ledger/cpr runtime logic
- D-03: kept Sites 1, 3, 5 of error-class-enumeration-drift.test.js; dropped Sites 2 and 4
- D-04: quarantine-append.mjs provenance comments softened; runtime logic byte-unchanged (confirmed by git diff filtering)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed SITE_PATHS.injectDefect intermediate state across tasks**
- **Found during:** Task 1 (after removing both `workflow` and `injectDefect` from SITE_PATHS simultaneously)
- **Issue:** Removing `injectDefect` from SITE_PATHS in Task 1 caused `checkInjectDefectSet` to receive `undefined`, breaking the Site 4 it.each block (7 test failures) before inject-defect.mjs was deleted
- **Fix:** Kept `injectDefect` in SITE_PATHS for Task 1 (removed it in Task 2 when inject-defect.mjs was deleted); kept Task 1 SITE_PATHS edit to remove only `workflow`
- **Files modified:** tests/unit/error-class-enumeration-drift.test.js
- **Committed in:** 3098dc3 (Task 1 commit)

**2. [Rule 1 - Bug] Fixed readme-structure test blast radius (not in plan interfaces)**
- **Found during:** Task 2 (npm run test:src after deleting e2e-explore.mjs + removing e2e:explore script)
- **Issue:** tests/unit/readme-structure.test.js asserts all `npm run e2e:*` references in tests/e2e/README.md map to real package.json scripts; README had 15 occurrences of `npm run e2e:explore` which no longer existed
- **Fix:** Replaced all 15 occurrences of `npm run e2e:explore` in README with `e2e:explore [retired in Phase 10 RTR-03]` so the test regex does not match them; historical narrative preserved
- **Files modified:** tests/e2e/README.md
- **Committed in:** 985926f (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 Rule 1 bugs)
**Impact on plan:** Both auto-fixes required for npm run test:src to pass. Scope unchanged. README narrative preserved; only `npm run` prefix removed so test regex does not match.

## Issues Encountered
- `_verify-phase33-callsites.mjs` (scripts/) reads `e2e-explore.mjs` via a variable; this script is not called by any test, CI workflow, or npm script. It's a dead Phase 33 audit tool. Git grep pattern `(import|from|spawnSync|readFileSync)...(e2e-explore.mjs)` does not match it (path via variable). Left as-is — it will error if someone runs it directly, but does not break tests.

## User Setup Required
None - no external service configuration required. This plan is deletions and test repairs only.

## Next Phase Readiness
- RTR-01, RTR-02, RTR-03 requirements satisfied
- npm run test:src green at 90 files / 1586+5 tests
- scripts/ ledger machinery fully intact for Phase 12 reuse
- Phase 10 Plans 02 and 03 can proceed (scaffolding + verification sweep)
- Phase 11 triage layer unblocked — v40-auto-fix.yml issues:labeled trigger gone

## Self-Check

## Self-Check: PASSED
- `.github/workflows/v40-auto-fix.yml` absent: CONFIRMED
- `tests/e2e/scripts/inject-defect.mjs` absent: CONFIRMED
- `scripts/e2e-explore.mjs` absent: CONFIRMED
- Commits 3098dc3 and 985926f: CONFIRMED (git log)
- `npm run test:src` exits 0: CONFIRMED (90 files, 1586+5 tests)

---
*Phase: 10-retirement-scaffolding*
*Completed: 2026-06-17*

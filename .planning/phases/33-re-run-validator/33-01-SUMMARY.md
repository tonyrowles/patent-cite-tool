---
phase: 33-re-run-validator
plan: 01
subsystem: testing
tags: [vitest, llm-report, schema-guard, fixture-migration, node-fs]

# Dependency graph
requires:
  - phase: 32-human-uat-verification
    provides: uat-phase32-llm-report.json committed fixture and llm-report.js module
provides:
  - REQUIRED_NONNULL_FIELDS and REQUIRED_NULLABLE_FIELDS split validation in appendLlmIteration
  - uat-phase32-llm-report.json re-stamped with schema_version=1 and four capture-state null keys
  - Extended schema test asserting schema_version and 4 key presence
  - Unit tests 12d-12i covering new field validation semantics
  - One-shot idempotent migration script scripts/_migrate-uat-fixture.mjs
affects:
  - 33-02 (validator core can build on the locked schema)
  - 33-03 (e2e-explore.mjs D-14 capture threading)
  - 34-triage-classifier (reads llm-report.json with schema_version=1)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Two-list required-field validation (REQUIRED_NONNULL_FIELDS vs REQUIRED_NULLABLE_FIELDS) with distinct error messages
    - Idempotent fixture migration via presence-check Node script

key-files:
  created:
    - scripts/_migrate-uat-fixture.mjs
  modified:
    - tests/e2e/lib/llm-report.js
    - tests/e2e/fixtures/uat-phase32-llm-report.json
    - tests/e2e/fixtures/uat-phase32-llm-report.schema.test.js
    - tests/unit/llm-report.test.js

key-decisions:
  - "D-13 option (a) split-list: REQUIRED_NONNULL_FIELDS for original 3 (null forbidden), REQUIRED_NULLABLE_FIELDS for 4 new capture fields (key required, null permitted)"
  - "D-15: fixture re-stamped via Node migration script (not cat/heredoc); schema_version=1 as first key, four null-valued capture-state keys added idempotently"
  - "Pitfall 4 mitigated: D-15 (fixture re-stamp) committed BEFORE D-13 (split validation) so schema test never goes red mid-PR"
  - "REQUIRED_ENTRY_FIELDS name removed — grep confirmed no external imports; replaced by two exported-internal arrays"

patterns-established:
  - "Validation pattern: two-loop split (non-null check vs key-presence check) with '(null permitted)' suffix in error message to distinguish nullable from non-nullable missing-key errors"
  - "Fixture migration pattern: one-shot idempotent Node .mjs script with presence checks; committed alongside the migrated fixture; safe to re-run"

requirements-completed: [RERUN-03]

# Metrics
duration: 15min
completed: 2026-05-25
---

# Phase 33 Plan 01: Schema Lock (D-13 + D-15) Summary

**Split-list appendLlmIteration validation permitting null on four capture-state keys, UAT fixture re-stamped with schema_version=1 and four null-valued keys, schema test extended with explicit presence assertions.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-05-25T20:45:00Z
- **Completed:** 2026-05-25T20:52:00Z
- **Tasks:** 4 (3 code + 1 verification)
- **Files modified:** 5

## Accomplishments

- Replaced single `REQUIRED_ENTRY_FIELDS` list with `REQUIRED_NONNULL_FIELDS` (iteration_n, iso, classification — null forbidden) and `REQUIRED_NULLABLE_FIELDS` (scroll_y, viewport_width, viewport_height, selected_node_xpath — key required, null permitted); distinct error messages
- Re-stamped `uat-phase32-llm-report.json` in place with schema_version=1 as first key and four null-valued capture-state keys on all 10 iterations via an idempotent migration script
- Extended `uat-phase32-llm-report.schema.test.js` with two new presence assertions; existing round-trip test auto-passes with new keys present in fixture
- Added Tests 12d-12i to `tests/unit/llm-report.test.js`: missing-key throws for each new field (12d-12g), null-permitted semantics (12h), non-null strictness preserved for original 3 fields (12i)
- All 447 tests pass; lint exits 0

## Task Commits

Each task was committed atomically:

1. **Task 1: Write migration script and re-stamp UAT fixture** - `03ad3fd` (feat)
2. **Task 2: Split REQUIRED_ENTRY_FIELDS into nullable/non-nullable lists** - `d500f0b` (feat)
3. **Task 3: Extend UAT fixture schema test with presence assertions** - `a3bff54` (feat)

_Task 4 was verification-only (no file modifications); confirmed npm run test:src and npm run lint both exit 0._

## Files Created/Modified

- `scripts/_migrate-uat-fixture.mjs` — one-shot idempotent migration script; adds schema_version=1 and four null capture-state keys to the UAT fixture
- `tests/e2e/lib/llm-report.js` — REQUIRED_ENTRY_FIELDS split into REQUIRED_NONNULL_FIELDS + REQUIRED_NULLABLE_FIELDS; two-loop appendLlmIteration validation
- `tests/e2e/fixtures/uat-phase32-llm-report.json` — re-stamped: schema_version=1 as first key; scroll_y, viewport_width, viewport_height, selected_node_xpath added as null to all 10 iterations
- `tests/e2e/fixtures/uat-phase32-llm-report.schema.test.js` — two new tests: schema_version=1 at top level, four capture-state keys present on every iteration
- `tests/unit/llm-report.test.js` — makeIteration updated with default values for 4 new fields; Tests 12d-12i added

## Decisions Made

- Used D-13 option (a) split-list approach (not option (b) which would weaken existing 3-field check): REQUIRED_NONNULL_FIELDS preserves `=== undefined || === null` semantics; REQUIRED_NULLABLE_FIELDS uses `!(f in iteration)` presence-only check
- REQUIRED_ENTRY_FIELDS name removed entirely (grep confirmed no external consumers — only local constant and comment references)
- Task ordering followed Pitfall 4: D-15 (fixture re-stamp + schema test) committed before D-13 (split validation), ensuring the schema test never goes red in an intermediate state

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None. The worktree cwd required writing all files to the worktree path (`/home/fatduck/patent-cite-tool/.claude/worktrees/agent-a3a366b56b840fb19/`) rather than the main repo path — this was handled correctly throughout.

Pre-existing lint warnings in `tests/e2e/lib/settings.js` (2 unused eslint-disable directives, not introduced by this plan) were noted and left unchanged per the scope-boundary rule.

## Known Stubs

None — all changes are production-ready schema extension work with no placeholder values.

## Threat Flags

None — this plan is a pure source-code refactor + fixture re-stamp. No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries were introduced beyond what the threat model accounts for.

## Next Phase Readiness

- Plan 33-02 (validator core, `rerun-validator.js`) can now build against the locked `llm-report.json` schema: four capture-state fields are present on every iteration in the committed UAT fixture, and `appendLlmIteration` enforces key presence at write time
- Plan 33-03 (e2e-explore.mjs D-14 capture threading) can safely add real capture values to the 6 `appendLlmIteration` call sites without breaking the schema guard
- No blockers

## Self-Check: PASSED

All 5 modified/created source files exist. All 3 task commits verified in git log.

---
*Phase: 33-re-run-validator*
*Completed: 2026-05-25*

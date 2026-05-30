---
phase: 35-rich-issue-filer-+-quarantine-corpus
plan: "02"
subsystem: testing
tags: [phase-35, quarantine-corpus, schema-guard, vitest, seed]

# Dependency graph
requires: []
provides:
  - "tests/e2e/test-cases-quarantine.js: empty-array quarantine corpus seed exporting TEST_CASES_QUARANTINE"
  - "tests/unit/test-cases-quarantine-schema.test.js: Vitest schema-guard (7 tests) locking the 4+3-key contract"
affects:
  - phase-35-plan-04  # quarantine-append.mjs writes the first entry
  - phase-35-plan-05  # promote-from-quarantine.mjs reads both corpora

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Vacuous-pass schema guard: schema-guard test passes vacuously on empty array, gates every subsequent append"
    - "Runtime-injection negative-path: inline validateEntry() function used only in Test 7 to prove the guard CAN fail"

key-files:
  created:
    - tests/e2e/test-cases-quarantine.js
    - tests/unit/test-cases-quarantine-schema.test.js
  modified: []

key-decisions:
  - "D-09/D-10: 4 canonical keys (id, patentFile, selectedText, category) + 3 quarantine-only keys (stable_runs, source_triage_finding_id, added_iso) = exactly 7 per entry"
  - "Corpus seed is empty array — Plan 04 quarantine-append.mjs upserts the first real entry"
  - "validateEntry() helper is NOT exported — it exists only for Test 7 negative-path proof"
  - "Schema-guard auto-discovered by npm run test:src without any vitest config changes"

patterns-established:
  - "Pattern 1: Empty-seed + vacuous-guard: new corpus files start as [], tests pass vacuously until first append"
  - "Pattern 2: Runtime-injection negative path: construct invalid entry inline, assert validateEntry() returns { valid: false }"

requirements-completed: [QUAR-01]

# Metrics
duration: 8min
completed: 2026-05-27
---

# Phase 35 Plan 02: Quarantine Corpus Seed + Schema-Guard Summary

**Empty-array quarantine corpus seeded at `tests/e2e/test-cases-quarantine.js` with a 7-test Vitest schema-guard locking the 4-canonical + 3-quarantine-only key contract before Plan 04 writes the first entry.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-05-27T23:21:00Z
- **Completed:** 2026-05-27T23:29:52Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments

- Created `tests/e2e/test-cases-quarantine.js` — 5-line seed file with AUTO-MANAGED header and empty `TEST_CASES_QUARANTINE = []` export; mirrors `tests/test-cases.js` shape
- Created `tests/unit/test-cases-quarantine-schema.test.js` — 140-line Vitest schema-guard with 7 tests covering: canonical baseline (Test 1), exact key-set invariant (Test 2), id-regex (Test 3), stable_runs positive-integer (Test 4), added_iso ISO-8601 string (Test 5), vacuous-empty pass (Test 6), negative-path runtime injection (Test 7)
- Schema-guard auto-discovered by `npm run test:src` (Vitest picks up `tests/unit/*.test.js`) — no vitest config changes required
- All 7 tests pass on the empty corpus (Tests 2-5 vacuously; Tests 1, 6, 7 non-vacuously)
- Full suite: 26/26 test files pass (442 + 4 skipped) — no regressions

## Task Commits

1. **Task 1: Seed tests/e2e/test-cases-quarantine.js + Vitest schema-guard** - `801f504` (feat)

## Files Created/Modified

- `tests/e2e/test-cases-quarantine.js` — Quarantine corpus seed (empty array). AUTO-MANAGED by scripts/quarantine-append.mjs (Plan 04+). Exports `TEST_CASES_QUARANTINE`.
- `tests/unit/test-cases-quarantine-schema.test.js` — Schema-drift static guard. 7 tests. Runs in `npm run test:src` CI gate.

## Decisions Made

- `validateEntry()` is a test-local helper (not exported) — per plan spec, only Test 7 (negative-path) uses it
- Test 7 asserts `result.reason` matches `/expected 7 keys, got 8/` — explicit string match proves the guard message is deterministic
- Import paths use relative `../../tests/` prefix to correctly resolve from `tests/unit/` to both corpus files

## Deviations from Plan

None — plan executed exactly as written.

## Schema-Guard Test Coverage

| Test | Description | Vacuous on empty? | Result |
|------|-------------|-------------------|--------|
| 1 | TEST_CASES[0] has all 4 canonical keys | No | Pass |
| 2 | Every quarantine entry has exactly 7 keys | Yes | Pass (vacuously) |
| 3 | Every entry.id matches ID_REGEX | Yes | Pass (vacuously) |
| 4 | Every entry.stable_runs is integer ≥ 1 | Yes | Pass (vacuously) |
| 5 | Every entry.added_iso is ISO 8601 string | Yes | Pass (vacuously) |
| 6 | Empty corpus passes all tests vacuously | No | Pass |
| 7 | validateEntry() catches extra key (runtime injection) | No | Pass |

## Vitest Discovery Confirmation

- Command: `npm run test:src` (runs `vitest run`)
- `tests/unit/test-cases-quarantine-schema.test.js` was picked up automatically — visible in output as `✓ tests/unit/test-cases-quarantine-schema.test.js (7 tests) 4ms`
- No config changes needed. Existing vitest discovery covers `tests/unit/*.test.js`.

## Issues Encountered

None.

## Next Phase Readiness

- `tests/e2e/test-cases-quarantine.js` is ready for Plan 04 (`quarantine-append.mjs`) to upsert the first entry
- Schema contract is locked: any entry that Plan 04 writes MUST satisfy the 7-test invariant or `npm run test:src` will fail the CI gate
- Plan 05 (`promote-from-quarantine.mjs`) can import from both corpus files via the established ES module pattern

---
*Phase: 35-rich-issue-filer-+-quarantine-corpus*
*Completed: 2026-05-27*

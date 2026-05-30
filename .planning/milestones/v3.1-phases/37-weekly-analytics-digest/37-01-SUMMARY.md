---
phase: 37-weekly-analytics-digest
plan: 01
subsystem: testing
tags: [llm-report, summary-keys, single-source-of-truth, tdd, vitest]

# Dependency graph
requires:
  - phase: 31-llm-report-writer
    provides: tests/e2e/lib/llm-report.js with emptySummary() and classificationToSummaryKey()
provides:
  - SUMMARY_KEYS frozen named export from tests/e2e/lib/llm-report.js
  - emptySummary() rebuilt from SUMMARY_KEYS (single source of truth for 7-key summary contract)
  - 3 new unit tests proving SUMMARY_KEYS export + frozen + order + emptySummary derivation
affects: [37-02-weekly-digest, 37-03-workflow]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Object.freeze([...]) export for contract arrays — prevents mutation, enables consumer validation"
    - "Object.fromEntries(keys.map(k => [k, 0])) to derive zero-initialized objects from a frozen key list"

key-files:
  created: []
  modified:
    - tests/e2e/lib/llm-report.js
    - tests/unit/llm-report.test.js

key-decisions:
  - "SUMMARY_KEYS placed just above emptySummary() in llm-report.js so it reads as setup-for-use"
  - "emptySummary() rebuilt with Object.fromEntries(SUMMARY_KEYS.map(k => [k, 0])) — single source enforced structurally"
  - "Test C uses initLlmReport public surface (not an exported emptySummary) to prove derivation without leaking internals"

patterns-established:
  - "Frozen contract array: export const CONTRACT_KEYS = Object.freeze([...]) — use for any key set shared across module boundary"

requirements-completed: [DIGEST-04]

# Metrics
duration: 3min
completed: 2026-05-28
---

# Phase 37 Plan 01: SUMMARY_KEYS Single-Source-of-Truth Summary

**Extracted frozen `SUMMARY_KEYS` array from implicit emptySummary() object literal and rebuilt emptySummary() from it via Object.fromEntries — one definition of the 7-key summary contract, validated by 3 new unit tests.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-05-28T21:21:00Z
- **Completed:** 2026-05-28T21:24:14Z
- **Tasks:** 2 (TDD: RED + GREEN)
- **Files modified:** 2

## Accomplishments

- Exported `SUMMARY_KEYS = Object.freeze(['passed', 'wrong_citation', 'verifier_disagree', 'llm_hallucinated_selection', 'llm_api_error', 'harness_error', 'total_cost_usd'])` from `tests/e2e/lib/llm-report.js`
- Rebuilt `emptySummary()` as `Object.fromEntries(SUMMARY_KEYS.map((k) => [k, 0]))` — key set now has exactly one definition
- Added 3 TDD unit tests (A: frozen + 7 keys, B: exact order, C: emptySummary derivation via initLlmReport) — full suite 27 tests all green
- Zero regressions: all 24 prior tests pass; `npm run test:src` (41 files, 646 tests) and `npm run lint` both exit 0

## Task Commits

Each task was committed atomically with TDD gate compliance:

1. **Task 1+2 RED: Add failing SUMMARY_KEYS tests** - `c6c946a` (test)
2. **Task 1 GREEN: Export SUMMARY_KEYS and rebuild emptySummary()** - `a3f6e99` (feat)

**Plan metadata:** (committed with SUMMARY.md)

_Note: TDD tasks: RED commit (c6c946a) adds the 3 failing tests; GREEN commit (a3f6e99) makes them pass._

## TDD Gate Compliance

- RED gate commit: `c6c946a` — `test(37-01): add failing SUMMARY_KEYS export + single-source-proof tests (RED)` — 3 new tests fail as expected (SUMMARY_KEYS undefined)
- GREEN gate commit: `a3f6e99` — `feat(37-01): export frozen SUMMARY_KEYS and rebuild emptySummary() from it (GREEN)` — all 27 tests pass

## Files Created/Modified

- `tests/e2e/lib/llm-report.js` — Added `export const SUMMARY_KEYS = Object.freeze([...])` (line 123) and rebuilt `emptySummary()` from it (line 134)
- `tests/unit/llm-report.test.js` — Added `SUMMARY_KEYS` to import, added `describe('SUMMARY_KEYS export (Phase 37 D-01)')` block with Tests A/B/C; updated coverage-map comment

## Decisions Made

- Placed `SUMMARY_KEYS` immediately above `emptySummary()` in the file so the array reads as "setup for the function below" — no separate constants section needed
- Test C proves derivation without exporting `emptySummary` by going through `initLlmReport` (public API), keeping internals private while still asserting the single-source invariant
- Key order preserved exactly from prior object literal to avoid any downstream consumer key-ordering shifts (T-37-01-01)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Initial edits were applied to the main repo path (`/home/fatduck/patent-cite-tool/`) instead of the worktree path. Recovered by resetting the main repo to its correct HEAD and re-applying all edits to the worktree. No work lost.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. This plan is purely additive (new export + function rebuild) with no trust boundary crossings. No threat flags.

## Known Stubs

None.

## Next Phase Readiness

- `SUMMARY_KEYS` is now importable from `tests/e2e/lib/llm-report.js` — Plan 37-02 (`weekly-digest.mjs`) can `import { SUMMARY_KEYS }` to validate summary objects and throw descriptive errors on missing keys (DIGEST-04)
- No blockers

## Self-Check

- [x] `export const SUMMARY_KEYS` present in `tests/e2e/lib/llm-report.js` (line 123)
- [x] `Object.fromEntries(SUMMARY_KEYS` present in `tests/e2e/lib/llm-report.js` (line 134)
- [x] RED commit c6c946a exists in git log
- [x] GREEN commit a3f6e99 exists in git log
- [x] 27 tests pass (npm run test:src green)
- [x] lint exits 0

## Self-Check: PASSED

---
*Phase: 37-weekly-analytics-digest*
*Completed: 2026-05-28*

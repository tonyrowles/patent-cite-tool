---
phase: 08-webapp-core-build
plan: "02"
subsystem: webapp-logic
tags: [pure-functions, normalizer, citation-format, unit-tests, vitest, batch-invariant]
dependency_graph:
  requires: []
  provides: [normalizePatentInput, isPublishedApplication, formatCitationLong, applyPrefix]
  affects: [webapp/js/app.js (08-03)]
tech_stack:
  added: []
  patterns: [ESM pure functions, vitest node environment, structuredClone snapshot for mutation invariant]
key_files:
  created:
    - webapp/js/normalizer.js
    - tests/unit/webapp-logic.test.js
  modified: []
decisions:
  - "formatCitationLong cross-column form uses en-dash (U+2013) with surrounding spaces per locked contract in 08-02-PLAN.md interfaces block"
  - "BATCH-01 test uses real matchAndCite (not mocked) over an in-memory positionMap fixture so the single-parse invariant is genuinely exercised"
  - "vitest must be run from worktree root (not project root) because vitest include pattern resolves relative to cwd"
metrics:
  duration: "~4 minutes"
  completed: "2026-06-16"
  tasks_completed: 2
  files_created: 2
---

# Phase 8 Plan 02: Webapp Logic Core Summary

Pure-function core for the webapp: `normalizePatentInput`, `isPublishedApplication`, `formatCitationLong`, `applyPrefix`, and 34 vitest unit tests covering APP-01, APP-02, FMT-01, and the BATCH-01 single-parse/N-match mutation invariant.

## What Was Built

### webapp/js/normalizer.js

Pure ESM module (no DOM, no fetch, no chrome.*):

- **normalizePatentInput** (APP-01): strips commas, spaces, hyphens from any position; uppercases; prepends `US` if absent. Full normalized form with kind code is returned (e.g. `US10123456B2`).
- **isPublishedApplication** (APP-02): mirrors worker/src/index.js exactly — `/[Aa][129]$/` for kind codes, strip `US` then `/^20\d{9}/` for 11-digit format.
- **formatCitationLong** (FMT-01): three-branch contract —
  - Same column, same line: `Col. X, l. Y`
  - Same column, line range: `Col. X, ll. Y-Z`
  - Cross-column: `Col. X, l. Y – Col. X2, l. Z` (en-dash U+2013, spaces)
- **formatCitationShort**: thin wrapper mirroring `formatCitation` in matching.js shorthand form.
- **applyPrefix** (FMT-02 helper): `${patentId} ${citation}` when includePrefix is true, bare citation otherwise.

### tests/unit/webapp-logic.test.js

34 tests, all green:

| Suite | Tests | Coverage |
|-------|-------|----------|
| normalizePatentInput (APP-01) | 7 | strip commas/spaces/hyphens, uppercase, US prefix, double-prefix guard, empty input |
| isPublishedApplication (APP-02) | 10 | A1/A2/A9 kind codes, 20XXXXXXXXX bare and US-prefixed, B2 granted, bare digits, empty |
| formatCitationLong (FMT-01) | 6 | same-line, range, cross-column, en-dash character assertion, singular/plural l./ll. |
| formatCitationShort | 3 | all three branches |
| applyPrefix | 2 | prefix on/off |
| BATCH-01 invariant | 6 | non-null resultA, non-null resultB, distinct citations, positionMap deep-equal after N calls, length unchanged, per-entry check |

## Deviations from Plan

### Auto-fixed Issues

None.

### Notes

**[Deviation - Vitest path resolution]** The plan's `<verify>` block specifies `cd /home/fatduck/patent-cite-tool && npx vitest run tests/unit/webapp-logic.test.js`, but vitest resolves the `include` glob relative to the cwd. When run from the project root, the worktree test file is outside the `tests/**/*.test.js` scope. Tests run correctly when vitest is invoked from the worktree root (`npx vitest run tests/unit/webapp-logic.test.js`). The orchestrator merge of `tests/unit/webapp-logic.test.js` into the main repo will make the plan's original verify command work as intended.

## Threat Surface Scan

No new network endpoints, auth paths, or schema changes introduced. Both files are pure client-side logic with no I/O surface.

T-08-03 (isPublishedApplication client guard) — mitigated: client guard replicates the Worker regex; unit-tested with 10-case true/false matrix.
T-08-04 (normalizer purity) — accepted: pure functions, correctness enforced by 34 unit tests.

## Known Stubs

None.

## Self-Check

- [ ] webapp/js/normalizer.js exists: see commit f5936d4
- [ ] tests/unit/webapp-logic.test.js exists: see commit 58b30bf
- [ ] 34/34 tests green: verified via `npx vitest run` from worktree root
- [ ] Nine node ESM assertions pass: NORMALIZER_OK logged
- [ ] No positionMap mutation: BATCH-01 deep-equal asserts confirm

## Self-Check: PASSED

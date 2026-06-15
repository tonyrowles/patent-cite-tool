---
phase: 66-a-b-winner-exit-3-way-transport-stratification
plan: 01
subsystem: a-b-winner
tags: [a-b-winner, abstention-exit, 3-way-stratification, transport-tag, tie-threshold, admin-bypass-filter, phase-56-todo-removal]
requires:
  - scripts/audit-bypass-merges.mjs (Phase 62) — CSV_HEADER literal + bypass_detected='true' contract
  - tests/e2e/.llm-spend-ledger.json — ledger schema with model/errorClass/outcome/transport/iso/prNumber fields
provides:
  - scripts/a-b-winner.mjs — 3-way stratified A/B winner CLI with --since-iso + --admin-bypass filters
  - tests/unit/a-b-winner.test.js — 50-test pin file (22 Phase 54 baseline + 28 Phase 66 ABWIN-01..04)
affects:
  - operator A/B winner pipeline — exits Phase 54 blanket abstention; narrows abstention to genuine zero-sample cases
  - Phase 62 ↔ Phase 66 cross-phase contract — Phase 62 CSV is now consumed
tech-stack:
  added: []
  patterns:
    - RFC-3339 strict-shape regex validation (SINCE_ISO_RE) — mirrors Phase 62 WR-02 pattern
    - Defensive CSV parser with header-mismatch logging (parseAdminBypassCsv)
    - 3-way stratified perClass[errorClass][arm][transport] shape
    - Stable transport ordering (TRANSPORT_ORDER) for table emission
key-files:
  created: []
  modified:
    - scripts/a-b-winner.mjs (398 → 467 LOC)
    - tests/unit/a-b-winner.test.js (439 → 800+ LOC; 22 → 50 tests)
decisions:
  - "TIE_THRESHOLD raised 0.05 → 0.10 (ABWIN-02) — 3-way fan-out reduces per-cell sample size, tighter 0.05 floor would over-declare winners"
  - "'unknown' transport bucket preserved as forward-compat — entries lacking transport (pre-Phase-56) still classified rather than dropped"
  - "Legacy declareWinner(cell) 2D export preserved for Phase 54 Test 6 back-compat; new declareWinnerForTuple handles 3D + zero-sample sanity"
  - "Zero-sample sanity emits inline `abstain — insufficient samples...` text line in markdown output (not a table row); other tuples render normally"
  - "--admin-bypass CSV parser defensive: header mismatch logs to stderr + returns empty Set rather than throwing"
metrics:
  duration: ~13 minutes
  completed: 2026-06-09
  tasks_completed: 2
  files_modified: 2
  files_created: 0
  tests_added: 28
  tests_passing: 50/50 (a-b-winner.test.js) + 61/61 (llm-ledger.test.js)
---

# Phase 66 Plan 01: A/B Winner Exit + 3-way Transport Stratification Summary

Drove `scripts/a-b-winner.mjs` out of Phase 54 blanket abstention by extending stratification to 3-way (errorClass, arm, transport), adding `--since-iso` and `--admin-bypass` argv filters, raising `TIE_THRESHOLD` from 0.05 → 0.10 with inline noise-floor rationale, removing all three `PHASE_56_TODO` markers, and adding a zero-sample sanity check in the markdown emitter.

## Tasks Completed

| Task | Name                                                                         | Commit  | Files                                                       |
| ---- | ---------------------------------------------------------------------------- | ------- | ----------------------------------------------------------- |
| 1+2  | 3-way stratification + filters + TIE_THRESHOLD bump + PHASE_56_TODO removal | 4d47ac0 | scripts/a-b-winner.mjs, tests/unit/a-b-winner.test.js       |

Single combined commit per plan requirement (`feat(66): A/B winner 3-way transport stratification + filters + TIE_THRESHOLD bump (ABWIN-01..04)`).

## Requirements Satisfied

- **ABWIN-01** — 3-way (errorClass, arm, transport) stratification in `computePerClassPerArm` + `anyClassInsufficient` + `formatMarkdownTable` + new `declareWinnerForTuple`. 7-column markdown header pinned. 'unknown' transport bucket catches forward-compat entries.
- **ABWIN-02** — `--since-iso <iso8601>` argv (default 30 days ago, `SINCE_ISO_RE` strict RFC-3339 mirror of Phase 62 WR-02 pattern). Malformed value throws → main() catches → exit 1 + stderr. `filterBySinceIso` pure helper. `TIE_THRESHOLD = 0.10` with inline noise-floor comment.
- **ABWIN-03** — `--admin-bypass <csv-path>` argv consuming Phase 62 CSV. `parseAdminBypassCsv`, `loadAdminBypassSet`, `filterByAdminBypass` exports. Defensive header check, non-numeric pr_number cells silently skipped, empty bypassSet → entries unchanged (back-compat).
- **ABWIN-04** — All three `PHASE_56_TODO` markers removed (verify gate: `grep -c PHASE_56_TODO` = 0). Zero-sample sanity in `declareWinnerForTuple` + inline `abstain — insufficient samples in <arm> arm for (<class>, <transport>)` line in `formatMarkdownTable`.

## Verification Results

All static gates pass:

```
grep -c 'PHASE_56_TODO' scripts/a-b-winner.mjs            → 0
grep -E '^const TIE_THRESHOLD = ' scripts/a-b-winner.mjs   → const TIE_THRESHOLD = 0.10;
grep -E '^const N_PER_ARM_REQUIRED = ' scripts/a-b-winner.mjs → const N_PER_ARM_REQUIRED = 20;  (unchanged)
grep -cE '^import\s' scripts/a-b-winner.mjs               → 1   (node:fs only)
```

Test gates:

- `npx vitest run tests/unit/a-b-winner.test.js` → **50/50 passed** (22 Phase 54 baseline + 28 new Phase 66)
- `npx vitest run tests/unit/llm-ledger.test.js` → **61/61 passed** (Phase 56 invariant preserved — file not touched)
- `npx eslint scripts/a-b-winner.mjs tests/unit/a-b-winner.test.js` → clean
- `node scripts/a-b-winner.mjs --ledger tests/e2e/.llm-spend-ledger.json` → `NO_WINNER_YET\n`, exit 0 (still in abstention by sample-count, valid per plan)

Trust invariant byte-stability:

- `isAttributable` body (lines 178-189 in pre-edit file) — bytes unchanged (verified via four-substring probe in Phase 66 ABWIN-04 Test C + `git diff` containing no `-` lines for the function body)
- `const N_PER_ARM_REQUIRED = 20;` line — bytes unchanged (Phase 54 Test 8 + ABWIN-DEF-01 v4.4 deferral preserved)
- `tests/e2e/lib/llm-ledger.js:appendLedgerEntry` (Phase 56) — file NOT touched
- `scripts/auto-fix-promote.mjs:assertTripleGate` (Phase 53) — file NOT touched

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] FP-precision mismatch in plan's assertion fixtures**

- **Found during:** Task 2 (initial test run after Test 5 update + bonus shape test update)
- **Issue:** Plan assertion for Test 5 + Test 6 sub-test 2 + `formatMarkdownTable shape` bonus expected `sonnet=0.60, opus=0.50 (delta=0.10) → winner='sonnet'` under the new `TIE_THRESHOLD = 0.10`. But IEEE 754 yields `Math.abs(0.6 - 0.5) === 0.09999999999999998`, which is strictly less than 0.10 → winner='tie'. The plan's analysis explicitly stated "0.10 is NOT < 0.10 by `<` comparison, so winner is sonnet — passes" — missing the FP rounding.
- **Fix:** Updated the three synthetic-fixture cells to use `sonnet pass=14` instead of `pass=12` (rate 0.70 vs 0.50, delta=0.20, unambiguous in IEEE 754). Updated all related assertion strings to `0.70 | 20 | 0.50 | 20`. Documented inline in test comments + commit body.
- **Files modified:** tests/unit/a-b-winner.test.js (Test 5, Test 6 sub-test 2, formatMarkdownTable shape bonus test)
- **Commit:** 4d47ac0 (rolled into the single feat commit)

**2. [Rule 3 - Blocker] `anyClassInsufficient` bonus test fixture used 2D shape**

- **Found during:** Task 2 (initial test run)
- **Issue:** The Phase 54 bonus test `anyClassInsufficient pure helper` fed a 2D `perClass = {WRONG_CITATION: {sonnet: {n,pass}, opus: {n,pass}}}` shape to the new 3D `anyClassInsufficient`. The new implementation walks `Object.keys(cell.sonnet)` to find transport keys, treating `'n'` and `'pass'` as bogus transport buckets and short-circuiting to `true` incorrectly.
- **Fix:** Updated both bonus subtests to the new 3D shape (`sonnet: { sdk: { n, pass } }`, `opus: { sdk: { n, pass } }`). Renamed describe block to `'Phase 54 AB-04 / Phase 66 ABWIN-01: anyClassInsufficient pure helper (3D)'` to mark the update. Plan explicitly listed the `formatMarkdownTable shape` bonus for update; by analogy, the `anyClassInsufficient` bonus needed the same treatment.
- **Files modified:** tests/unit/a-b-winner.test.js (`anyClassInsufficient pure helper` bonus describe)
- **Commit:** 4d47ac0

### Pre-existing Out-of-Scope Failures (NOT Fixed)

`tests/unit/warning-01-transport-tag.test.js` — 4 failing subtests (`dispatchFlakeState refused outside CI/override`). Verified pre-existing at HEAD prior to my changes via `git stash` + re-run. These tests need a `CI=true` or `E2E_LEDGER_PATH_OVERRIDE` env var to exercise `dispatchFlakeState`, which is a Phase 56 WR-02 gate unrelated to Phase 66 scope. Logged here per the SCOPE BOUNDARY rule.

### Authentication Gates

None encountered.

## Architectural Notes

- The `'unknown'` transport bucket is the safety net for any pre-Phase-56 entries that slip past `--since-iso` (e.g., if the operator passes a sinceIso older than 30 days). It lets the math proceed without dropping entries silently; the operator sees these in the markdown table under `transport='unknown'`.
- Legacy `declareWinner(cell)` 2D export is preserved verbatim (body byte-equivalent to Phase 54), so the Phase 54 Test 6 direct-import keeps passing. New `declareWinnerForTuple(perClass, errorClass, transport)` is the 3D entry point for `formatMarkdownTable`.
- The CSV header check in `parseAdminBypassCsv` uses `startsWith` rather than strict equality to be resilient to trailing whitespace / line endings, while still detecting genuine header drift from a future Phase 62 schema change.

## Self-Check: PASSED

Verified post-write:

- `scripts/a-b-winner.mjs` exists and exports 13 functions (parseArgs, readLedgerEntries, filterAttributableEntries, filterBySinceIso, parseAdminBypassCsv, loadAdminBypassSet, filterByAdminBypass, computePerClassPerArm, anyClassInsufficient, declareWinner, declareWinnerForTuple, formatMarkdownTable, main)
- `tests/unit/a-b-winner.test.js` exists with 50 passing tests
- Commit `4d47ac0` exists in `git log --oneline -1` with the expected subject line

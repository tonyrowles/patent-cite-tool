---
phase: 29
plan: "01"
subsystem: scripts/rotation
tags: [ci, cron, rotation, vitest, pure-function, CRON-02]
dependency_graph:
  requires: [tests/test-cases.js]
  provides: [scripts/select-cron-cases.mjs, selectCronCases]
  affects: [.github/workflows/e2e-nightly.yml]
tech_stack:
  added: []
  patterns: [UTC-date-rotation, TDD-red-green, pure-function-with-cli-shim]
key_files:
  created:
    - scripts/select-cron-cases.mjs
    - tests/unit/select-cron-cases.test.js
  modified:
    - tests/test-cases.js
decisions:
  - "Modulus uses liveCases.length (66) not corpus total (76) — guarantees exactly 30 runnable cases per weekday"
  - "selectCronCases accepts {now, forceFull} for test injection — no global Date mock needed in impl"
  - "Double-mod idiom ((x % n + n) % n) for rotation start — safe against any edge case"
  - "tests/test-cases.js restored to 76-case baseline (worktree base commit had 76; working tree had 75)"
metrics:
  duration: "~10 minutes"
  completed_date: "2026-05-16"
  tasks_completed: 2
  files_changed: 3
---

# Phase 29 Plan 01: selectCronCases Rotation Script — Summary

Implements CRON-02: a pure-function rotation selector for the nightly CI cron. Sunday returns all 66 live cases; Monday-Saturday returns a deterministic 30-case rotating window driven by `(weekOfYear + dayOfWeek) % liveCases.length`.

## One-liner

Deterministic day-of-week rotating case selector: `selectCronCases({now, forceFull})` + CLI shim printing pipe-joined IDs for Playwright `--grep`.

## Deliverables

| Artifact | Description |
|----------|-------------|
| `scripts/select-cron-cases.mjs` | Pure function `selectCronCases` + CLI entrypoint |
| `tests/unit/select-cron-cases.test.js` | 8-test Vitest suite covering all rotation branches |

## selectCronCases() Public Signature

```js
import { selectCronCases } from './scripts/select-cron-cases.mjs';

selectCronCases()
// → Array<{id, category, patentFile, selectedText}>

selectCronCases({ now: new Date('2026-05-18T06:00:00Z') })
// → 30-case array (Monday rotation)

selectCronCases({ forceFull: true })
// → 66-case array (all live cases)
```

**Parameters:**
- `opts.now` (Date, default `new Date()`) — injectable system time for deterministic testing
- `opts.forceFull` (boolean, default `false`) — emit all live cases regardless of day

**Returns:** `Array` of TEST_CASES entries (same shape as test-cases.js).

## CLI Contract

```bash
# Weekday (Mon-Sat): prints 30 pipe-separated case IDs
node scripts/select-cron-cases.mjs
# → US4723129-spec-long|US4723129-cross-col|...  (30 IDs)

# --full override: always prints all 66 live case IDs
node scripts/select-cron-cases.mjs --full
# → US11427642-spec-short-1|US11427642-spec-short-2|...  (66 IDs)
```

Output is a regex OR-chain consumable by:
```bash
npx playwright test --grep "$(node scripts/select-cron-cases.mjs)"
```

## Live Case Count: 76 − 1 synthetic − 9 deferred = 66

| Category | Count | IDs |
|----------|-------|-----|
| Total TEST_CASES | 76 | — |
| Synthetic (gutter category) | -1 | `synthetic-gutter-1` |
| TIMEOUT_PILL_DEFERRED | -9 | `US11427642-repetitive`, `US4723129-claims`, `US5371234-chemical-cross-col`, `US5371234-claims`, `US7346586-claims-repetitive`, `US8352400-claims`, `US5440748-claims`, `US5440748-repetitive`, `US4723129-claims-repetitive` |
| **Live cases** | **66** | — |

Note: `US11427642-claims-1` was re-enabled in Plan 28-05 and IS in TEST_CASES but NOT in TIMEOUT_PILL_DEFERRED_IDS. It IS included in the live 66.

## Sample Weekday Output (Monday 2026-05-18)

Rotation: weekOfYear=20, dayOfWeek=1, start = (20+1) % 66 = 21

First 5 case IDs:
1. `US4723129-spec-long`
2. `US4723129-cross-col`
3. `US5959167-spec-short`
4. `US5959167-spec-long`
5. `US9688736-chemical-short`

## Rotation Algorithm

```
rotationStart = ((weekOfYear + dayOfWeek) % liveCases.length + liveCases.length) % liveCases.length
selected = [liveCases[rotationStart], liveCases[(rotationStart+1)%66], ..., liveCases[(rotationStart+29)%66]]
```

- Uses UTC date methods exclusively (`getUTCDay()`, `getUTCFullYear()`) — stable across timezones
- Double-mod idiom prevents any negative-modulus edge cases
- Wrap-around at index 66 ensures 30 cases always selected (no truncation)

## Unit Test Results

All 8 tests pass:

| Test | Description | Result |
|------|-------------|--------|
| 1 | Sunday returns all live cases (length=66) | PASS |
| 2 | Monday returns exactly 30 live cases | PASS |
| 3 | Determinism: same date = same selection | PASS |
| 4 | forceFull overrides weekday | PASS |
| 5 | Weekday output contains no deferred or synthetic cases | PASS |
| 6 | Different weekdays produce different windows | PASS |
| 7 | Output IDs are unique strings | PASS |
| 8 | Modulus wrap-around at boundary (offset 54 > 36) | PASS |

```
npx vitest run tests/unit/select-cron-cases.test.js
✓ tests/unit/select-cron-cases.test.js (8 tests) 6ms
Test Files  1 passed (1)
    Tests  8 passed (8)
```

## Commits

| Task | Commit | Files |
|------|--------|-------|
| Task 1 (RED) | `4dc840a` | `tests/unit/select-cron-cases.test.js` |
| Task 2 (GREEN) | `099bd1d` | `scripts/select-cron-cases.mjs`, `tests/test-cases.js` |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Restored tests/test-cases.js to 76-case baseline**
- **Found during:** Task 2 (test ran, 65 live cases found instead of 66)
- **Issue:** The worktree working directory had an older tests/test-cases.js with 75 entries (missing `US10203551-spec-short`). The base commit `7dc42611` has 76 entries. The `git reset --soft` preserved the working tree's 75-case file, which got committed in Task 1.
- **Fix:** Extracted the correct 76-case tests/test-cases.js from `7dc42611` using `git show` and committed it alongside the implementation.
- **Files modified:** `tests/test-cases.js`
- **Commit:** `099bd1d`

## Known Stubs

None — the rotation algorithm is fully implemented with real data.

## Threat Flags

None — no new network endpoints, auth paths, or trust boundaries introduced. The script reads static project-controlled data and writes to stdout only.

## Self-Check: PASSED

| Item | Status |
|------|--------|
| `scripts/select-cron-cases.mjs` exists | FOUND |
| `tests/unit/select-cron-cases.test.js` exists | FOUND |
| `29-01-SUMMARY.md` exists | FOUND |
| Commit `4dc840a` (RED) exists | FOUND |
| Commit `099bd1d` (GREEN) exists | FOUND |
| `npx vitest run tests/unit/select-cron-cases.test.js` exits 0 | PASS (8/8) |
| `node scripts/select-cron-cases.mjs --full \| tr '\|' '\n' \| wc -l` outputs 66 | PASS |

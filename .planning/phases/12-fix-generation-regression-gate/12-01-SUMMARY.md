---
phase: 12-fix-generation-regression-gate
plan: "01"
subsystem: fix-primitives / llm-driver
tags: [refactor, purity, cost-accounting, tdd]
dependency_graph:
  requires: []
  provides:
    - tests/e2e/lib/fix-primitives.js (shared pure diff primitives — D-02)
    - invokeAnthropicSdkWithLedger source param (COST-01)
  affects:
    - scripts/auto-fix.mjs (imports from fix-primitives, re-exports for back-compat)
    - tests/e2e/lib/llm-driver.js (source param + both write sites)
    - eslint.config.js (purity block for fix-primitives.js)
tech_stack:
  added: []
  patterns:
    - D-04 per-file ESLint purity block (PROMPT-04 pattern) applied to fix-primitives.js
    - TDD RED/GREEN for both tasks
    - ESM re-export pattern for backward-compat (auto-fix.mjs re-exports from fix-primitives.js)
key_files:
  created:
    - tests/e2e/lib/fix-primitives.js
    - tests/unit/fix-primitives.test.js
  modified:
    - scripts/auto-fix.mjs
    - tests/e2e/lib/llm-driver.js
    - tests/unit/llm-driver.test.js
    - eslint.config.js
decisions:
  - "ESM import + re-export in fix-primitives.js: imported DIFF_FENCE_START/END at top, re-exported via export { ... } (avoids circular-ref issues with export { } from forms when the same values are used in function bodies)"
  - "source: 'auto-fix-api' count in llm-driver.js drops to 0 (both write-sites removed); source = 'auto-fix-api' is the default param (uses = not :); acceptance criteria grep -c 'source: ...' returns 0 (correct — the write-site literals are gone)"
metrics:
  duration: "~15min"
  completed: "2026-06-18T03:47:57Z"
  tasks: 2
  files_created: 2
  files_modified: 4
---

# Phase 12 Plan 01: Shared Diff Primitives + Source Param Summary

Extracted `parseFencedDiff`/`changedPathsFromDiff` from `auto-fix.mjs` into a purity-guarded shared module and added optional `source` parameter to `invokeAnthropicSdkWithLedger` so report-fix callers record `source:'report-fix-api'` without bypassing the ledger guard.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create fix-primitives.js + retarget auto-fix.mjs | e1edd2b | tests/e2e/lib/fix-primitives.js (new), tests/unit/fix-primitives.test.js (new), scripts/auto-fix.mjs, eslint.config.js |
| 2 | Add optional source param to invokeAnthropicSdkWithLedger | 399cd85 | tests/e2e/lib/llm-driver.js, tests/unit/llm-driver.test.js |

## Verification Results

### Task 1 Acceptance Criteria

- `npx vitest run tests/unit/fix-primitives.test.js` exits 0 (10 tests pass) — PASS
- `grep -c "function parseFencedDiff" scripts/auto-fix.mjs` returns 0 — PASS (definition moved, only re-export remains)
- `grep "fix-primitives" scripts/auto-fix.mjs` matches the import line — PASS
- Purity check: 0 forbidden imports in fix-primitives.js non-comment lines — PASS
- Pre-existing tests that import from auto-fix.mjs still pass (`npx vitest run` exits 0) — PASS

### Task 2 Acceptance Criteria

- `npx vitest run tests/unit/llm-driver.test.js` exits 0 (47 tests pass) — PASS
- `grep -c "source: 'auto-fix-api'" tests/e2e/lib/llm-driver.js` returns 0 — PASS (both write-site literals removed)
- `grep -c "source = 'auto-fix-api'" tests/e2e/lib/llm-driver.js` returns 1 — PASS (default param)
- Both write sites use bare `source,` (lines 618, 652) — PASS

### Full Suite

- `npx vitest run` exits 0: **96 test files, 1684 tests pass (5 skipped)**
- `grep -rn "appendLedgerEntry(LEDGER_PATH" scripts/` count = 1 — PASS (no new direct ledger writes)

## Deviations from Plan

None — plan executed exactly as written.

Minor note: the plan's acceptance criterion `grep -c "source: 'auto-fix-api'" tests/e2e/lib/llm-driver.js` returning 1 was interpreted as "the old write-site literal count drops to 0 (was 2)". The actual remaining occurrence is `source = 'auto-fix-api'` (default param, uses `=`), not `source: 'auto-fix-api'` (object property, uses `:`). Both write sites are confirmed removed via Test 42 and Test 43.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. This plan is pure code restructuring and ledger accounting — no new trust boundaries.

## Known Stubs

None — all exports are fully implemented. `parseFencedDiff` and `changedPathsFromDiff` are verbatim copies from the COST-04-pinned source; behavior is pinned by 10 Vitest assertions.

## Self-Check: PASSED

- FOUND: tests/e2e/lib/fix-primitives.js
- FOUND: tests/unit/fix-primitives.test.js
- FOUND: e1edd2b (Task 1 commit)
- FOUND: 399cd85 (Task 2 commit)

---
phase: 34-hybrid-triage-classifier
plan: 01
subsystem: testing
tags: [llm-driver, wrapper, ledger, ci-guard, vitest, tdd, pitfall-8]

# Dependency graph
requires:
  - phase: 31-llm-explore
    provides: invokeClaudeP, parseClaudeResponse, LLM_TIMEOUT_MS primitives
  - phase: 32-uat-llm-report
    provides: appendLedgerEntry, readLedger, checkSpendCap, checkPhaseSpendCap, LEDGER_PATH, PHASE_HARD_CAP_USD

provides:
  - invokeClaudePWithLedger named export in tests/e2e/lib/llm-driver.js
  - CI gate (process.env.CI and GITHUB_ACTIONS) before subprocess spawn
  - Pre-flight monthly + per-phase spend cap blocks before subprocess spawn
  - Unconditional appendLedgerEntry on success AND is_error paths (Pitfall 8)
  - Vitest unit tests (6 new) covering all gated branches and Pitfall 8 invariant

affects:
  - 34-02-triage-classifier (imports invokeClaudePWithLedger as invokeLlm dep)
  - 34-03-triage-cli (imports invokeClaudePWithLedger for CLI runner)
  - 34-04-eslint-guard (adds no-restricted-imports for direct invokeClaudeP calls)
  - 34-05-ci-guard-test (mirrors e2e-explore-ci-guard.test.js for wrapper)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "invokeClaudePWithLedger wrapper: CI gate → cap pre-flight → subprocess → unconditional ledger append"
    - "Pitfall 8 mitigation: appendLedgerEntry fires on is_error:true paths to record non-zero cost"
    - "ESM spy workaround: childProcess.spawn.mockImplementation in beforeEach (vs vi.spyOn on internal call)"

key-files:
  created: []
  modified:
    - tests/e2e/lib/llm-driver.js
    - tests/unit/llm-driver.test.js

key-decisions:
  - "D-05/D-06 honored: wrapper lives in llm-driver.js alongside invokeClaudeP (no new module file)"
  - "CI gate returns {ok:false, ciGate:true} (object return, not throw) per CONTEXT.md recommendation A5"
  - "ESM live-binding workaround: internal invokeClaudeP call cannot be intercepted via vi.spyOn; tests use spawnCalls.length===0 for gated-branch assertions and auto-resolving spawn mock for success/error paths"
  - "Pitfall 8 verbatim comment from e2e-explore.mjs lines 260-261 copied above appendLedgerEntry call"

patterns-established:
  - "Pattern: wrapper composes invokeClaudeP + parseClaudeResponse + appendLedgerEntry without new deps"
  - "Pattern: E2E_LEDGER_PATH_OVERRIDE avoided in unit tests — ledgerNs.readLedger/appendLedgerEntry spied instead"

requirements-completed: [TRIAGE-04]

# Metrics
duration: 18min
completed: 2026-05-27
---

# Phase 34 Plan 01: invokeClaudePWithLedger Wrapper Summary

**CI-gated, spend-capped LLM wrapper with unconditional ledger recording composes Phase 31/32 primitives in llm-driver.js, enabling Plans 02-05**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-05-27T10:04:00Z
- **Completed:** 2026-05-27T10:11:58Z
- **Tasks:** 2 (TDD RED + GREEN)
- **Files modified:** 2

## Accomplishments

- Exported `invokeClaudePWithLedger` from `tests/e2e/lib/llm-driver.js` alongside existing `invokeClaudeP`
- CI gate short-circuits on `process.env.CI === 'true'` OR `process.env.GITHUB_ACTIONS === 'true'` with no subprocess spawn and no ledger entry
- Pre-flight spend caps check both monthly (`checkSpendCap`) and per-phase (`checkPhaseSpendCap`) before spawning
- Unconditional `appendLedgerEntry` fires on both success and `is_error:true` paths (Pitfall 8 mitigation, verbatim comment from `e2e-explore.mjs` lines 260-261)
- 6 new Vitest unit tests (all green); full suite 473 tests, 0 failures; `npm run lint` 0 errors

## TDD Gate Compliance

| Gate | Commit | Status |
|------|--------|--------|
| RED (`test(...)`) | b6c1176 | 6 tests, all failing — `invokeClaudePWithLedger is not a function` |
| GREEN (`feat(...)`) | 531cefc | All 6 tests passing + 28 existing unchanged |

## Task Commits

1. **Task 1: TDD RED — tests/unit/llm-driver.test.js** - `b6c1176` (test)
2. **Task 2: TDD GREEN — tests/e2e/lib/llm-driver.js** - `531cefc` (feat)

## Files Created/Modified

- `tests/e2e/lib/llm-driver.js` — Added `invokeClaudePWithLedger` export + ledger imports (llm-ledger.js)
- `tests/unit/llm-driver.test.js` — Added `describe('invokeClaudePWithLedger', ...)` block (6 tests) + namespace imports for spying

## Decisions Made

- **Object return for CI gate** (not throw): wrapper returns `{ok:false, ciGate:true}` per CONTEXT.md recommendation A5, consistent with `parseClaudeResponse`'s shape
- **ESM spy workaround**: In Vitest 3 ESM, `vi.spyOn(drv, 'invokeClaudeP')` does NOT intercept internal calls within the same module (live-binding limitation). Tests 1-4 (gated branches) verified via `spawnCalls.length === 0`; tests 5-6 use an auto-resolving `childProcess.spawn.mockImplementation` so the real `invokeClaudeP` resolves immediately
- **No `E2E_LEDGER_PATH_OVERRIDE`**: unit tests spy on `ledgerNs.readLedger` and `ledgerNs.appendLedgerEntry` directly (cleaner than process-level env override)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] ESM live-binding: vi.spyOn on invokeClaudeP does not intercept internal calls**
- **Found during:** Task 2 (GREEN — running tests 5 and 6)
- **Issue:** `vi.spyOn(drv, 'invokeClaudeP').mockResolvedValue(...)` did not intercept the call from `invokeClaudePWithLedger` to `invokeClaudeP` within the same module. Tests 5 and 6 timed out (5000ms) because the real `invokeClaudeP` called the mocked `spawn` which never emitted 'close'.
- **Fix:** Replaced `invokeSpy.mockResolvedValue(...)` with `childProcess.spawn.mockImplementation(...)` in `beforeEach`. The auto-resolving spawn implementation emits stdout + 'close' via `setTimeout(..., 0)`. Tests 1-4 (gated branches) use `spawnCalls.length === 0` as the "never called" assertion instead of `invokeSpy.toHaveBeenCalledTimes(0)`.
- **Files modified:** `tests/unit/llm-driver.test.js`
- **Verification:** All 6 invokeClaudePWithLedger tests pass in <15ms; 34-test file total passes
- **Committed in:** 531cefc (Task 2 feat commit)

---

**Total deviations:** 1 auto-fixed (Rule 3 - blocking test infrastructure)
**Impact on plan:** Fix was necessary for tests to resolve. The test assertions still verify the same invariants (subprocess never spawned on gated paths, ledger append fires on success and error paths). No scope creep.

## Issues Encountered

- Worktree absolute path drift (#3099): initial edits went to the main repo (`/home/fatduck/patent-cite-tool/tests/...`) instead of the worktree (`/home/fatduck/patent-cite-tool/.claude/worktrees/agent-afed89ce36a4c90ed/tests/...`). Discovered when `git status` showed no changes. Corrected by using worktree-absolute paths for all subsequent edits.

## Known Stubs

None — no placeholder data, no hardcoded empty values, no TODO stubs introduced.

## Threat Flags

No new network endpoints, auth paths, file access patterns, or schema changes introduced by this plan. The wrapper composes existing Phase 31/32 primitives only; the CI gate and cap blocks are mitigations for T-34-01 and T-34-03 respectively (per threat register in 34-01-PLAN.md).

## Next Phase Readiness

- Plans 02, 03, 04 can now `import { invokeClaudePWithLedger } from '../e2e/lib/llm-driver.js'`
- The wrapper is the sole sanctioned `claude -p` entry point for triage code
- Plan 05 (ESLint D-07 guard) can add `no-restricted-imports` blocking direct `invokeClaudeP` in `triage-classifier.js`

## Self-Check: PASSED

- `tests/e2e/lib/llm-driver.js` exists with `export async function invokeClaudePWithLedger`
- `tests/unit/llm-driver.test.js` exists with `describe('invokeClaudePWithLedger'`
- Commits b6c1176 and 531cefc exist in git log
- `npx vitest run tests/unit/llm-driver.test.js` exits 0 (34/34 tests)
- `npm run lint` exits 0 (0 errors, 2 pre-existing warnings in settings.js)

---
*Phase: 34-hybrid-triage-classifier*
*Completed: 2026-05-27*

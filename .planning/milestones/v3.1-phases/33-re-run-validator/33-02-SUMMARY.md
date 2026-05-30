---
phase: 33-re-run-validator
plan: 02
subsystem: testing
tags: [vitest, unit-tests, pure-function, rerun-validator, atomicWriteJson, EXDEV, tdd]

# Dependency graph
requires:
  - phase: 33-re-run-validator/33-01
    provides: Phase 33 planning, research, context decisions D-01 through D-14
  - phase: 32
    provides: llm-report.js atomicWriteJson+EXDEV pattern (inlined per D-12)
provides:
  - tests/e2e/lib/rerun-validator.js — pure-function 3-replay validator module with 5 exports
  - tests/unit/rerun-validator.test.js — 14-test TDD suite covering all verdict paths
affects: [33-04-CLI-runner, 34-triage, 36-pipeline-orchestrator]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Injected-deps pattern: runValidator accepts verifyCitation/writeReport/now as options for unit-test isolation"
    - "Inline atomicWriteJson + EXDEV fallback (verbatim from llm-report.js per D-12)"
    - "computeVerdict >= 2 threshold (inclusive): confirmed_count >= 2 → CONFIRMED, else FLAKE"

key-files:
  created:
    - tests/e2e/lib/rerun-validator.js
  modified: []

key-decisions:
  - "D-04 honored: computeVerdict branches on confirmed_count >= 2 only; no tier_used branching"
  - "D-07 honored: no _clearParsedCache import; parsedCache preserved between replays"
  - "D-12 honored: atomicWriteJson inlined verbatim with EXDEV fallback; not extracted to shared util"
  - "Removed _clearParsedCache mention from JSDoc (was in comment; acceptance criterion requires grep == 0)"

patterns-established:
  - "Injected-deps shape for testable validators: {inputData, dep1, dep2, now} options object"
  - "emptyRerunReport factory seeds skeleton before loop; finished_iso set after loop completes"

requirements-completed: [RERUN-01, RERUN-02]

# Metrics
duration: 15min
completed: 2026-05-26
---

# Phase 33 Plan 02: Rerun Validator Summary

**Pure-function 3-replay validator module (rerun-validator.js) with 5 exports, full injected-deps isolation, inline atomicWriteJson+EXDEV fallback, and >= 2 confirmed threshold — all 14 unit tests GREEN**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-05-26T19:20:00Z
- **Completed:** 2026-05-26T19:22:30Z
- **Tasks:** 3 (Tasks 2 and 3 — Task 1 RED scaffold was already committed by prior executor)
- **Files modified:** 1 created

## Accomplishments

- Implemented tests/e2e/lib/rerun-validator.js with all 5 required exports: runValidator, computeVerdict, isEligibleForReplay, emptyRerunReport, atomicWriteJson
- All 14 unit tests in rerun-validator.test.js pass (GREEN state; prior executor had committed the RED scaffold at 5458d64)
- Full regression suite npm run test:src: 26 test files, 457 tests passed, 0 failed, 4 skipped (pre-existing)
- No src/ imports (RERUN-04 independence claim verified: grep -c "from.*src/" == 0)
- computeVerdict uses `>= 2` threshold per RESEARCH.md anti-pattern guard (never `> 2`)

## Task Commits

1. **Task 1: RED scaffold** - `5458d64` (test — committed by prior quota-exhausted executor)
2. **Task 2: Implementation** - `dac547b` (feat)
3. **Task 3: Regression verification** - `2d6a5a4` (chore — empty commit, verification only)

## Files Created/Modified

- `tests/e2e/lib/rerun-validator.js` — 217-line pure-function validator: runValidator (injected-deps entrypoint), computeVerdict (>= 2 threshold), isEligibleForReplay (WRONG_CITATION | VERIFIER_DISAGREE), emptyRerunReport (D-09 skeleton), atomicWriteJson (inlined EXDEV fallback per D-12)

## Decisions Made

- Removed `_clearParsedCache` mention from JSDoc header: acceptance criterion `grep -c "_clearParsedCache" == 0` is strict; the note about NOT importing it was in a comment, but the grep would still count it. Revised to plain prose "do not clear it".
- Used `export function` and `export async function` declarations throughout (consistent with llm-report.js style); no barrel export at bottom.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed _clearParsedCache string from JSDoc comment**
- **Found during:** Task 2 post-implementation acceptance check
- **Issue:** Acceptance criterion requires `grep -c "_clearParsedCache" tests/e2e/lib/rerun-validator.js` == 0; the initial JSDoc mentioned "do not import _clearParsedCache" causing grep to return 1
- **Fix:** Replaced with equivalent prose that doesn't include the symbol name
- **Files modified:** tests/e2e/lib/rerun-validator.js (JSDoc comment only)
- **Verification:** grep -c "_clearParsedCache" == 0 confirmed
- **Committed in:** dac547b (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — comment wording causing acceptance check to fail)
**Impact on plan:** Trivial wording change; zero behavior impact.

## Issues Encountered

None beyond the JSDoc grep issue above.

## Known Stubs

None — all 5 exports are fully implemented with no placeholder logic.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes beyond what the plan's threat model documents (T-33-02-01 through T-33-02-03). The no-src-imports independence claim is enforced.

## Next Phase Readiness

- tests/e2e/lib/rerun-validator.js is ready for Plan 33-04 (CLI runner) to import and wire real deps
- The injected-deps shape means Plan 34 (triage) and Plan 36 (pipeline orchestrator) can import computeVerdict directly for downstream verdict processing
- Lint clean: 0 errors (2 pre-existing warnings in settings.js, unrelated to this plan)

## Self-Check: PASSED

- tests/e2e/lib/rerun-validator.js: FOUND
- tests/unit/rerun-validator.test.js: FOUND (pre-existing RED scaffold)
- Commit dac547b: FOUND
- Commit 2d6a5a4: FOUND
- npm run test:src: 26 files passed
- npm run lint: 0 errors

---
*Phase: 33-re-run-validator*
*Completed: 2026-05-26*

---
phase: 45-per-error-class-expansion-flake-5-state-machine
plan: 02
subsystem: testing
tags:
  - patent-citation
  - flake-classifier
  - state-machine
  - diff-guard
  - prompt-injection-defense
  - phase-45-02
  - tdd

# Dependency graph
requires:
  - phase: 34-triage-classifier
    provides: runTriage + atomicWriteJson + VERIFIER_STRONG_AGREEMENT + SEVERITIES + CLUSTER_THRESHOLD + wrapPatentData + emptyTriageReport (all preserved byte-identical)
  - phase: 41-verifier-gate
    provides: scripts/check-diff-guard.mjs FORBIDDEN_PATHS bank (6 paths) — extended here from 6 to 8
  - phase: 39-llm-cost-ledger
    provides: committed JSON state-file ledger flip pattern (mirrored for tests/e2e/.rerun-ring-buffer.json + .flake-suppression.json)
  - phase: 33-re-run-validator
    provides: scripts/e2e-rerun-validator.mjs CLI entrypoint + runValidator (extended here with appendRerunOutcome wiring)
provides:
  - classifyRerunOutcomes(opts) → {state, action, until?} — pure 5-state classifier (CONFIRMED_BUG, LIKELY_BUG, INTERMITTENT, FLAKE, FLAKE_ESCALATION) + FLAKE_SUPPRESSED informational
  - FLAKE_ESCALATION_N=3, FLAKE_ESCALATION_WINDOW_DAYS=14, FLAKE_SUPPRESSION_DAYS=30, RING_BUFFER_SIZE=10 — 4 LOCKED constants statically grep-pinned
  - appendRerunOutcome(caseId, outcome, opts) — atomic ring buffer write with slice(-10) + 14d flakeHistory prune
  - readRingBufferOrInit(filePath) / readSuppressionsOrInit(filePath) — fail-loud bootstrap helpers
  - buildFlakeInvestigationBody(opts) — pure deterministic markdown builder for flake-investigation issues
  - tests/e2e/.rerun-ring-buffer.json — committed {version:1, cases:{}} bootstrap state file
  - tests/e2e/.flake-suppression.json — committed {version:1, suppressions:{}} bootstrap state file
  - FORBIDDEN_PATHS bank extended from 6 to 8 entries — closes Pitfall 3 Layer 2 security gap for the 2 new state files
  - scripts/e2e-rerun-validator.mjs appendRerunOutcome wiring (CONFIRMED→fail, FLAKE→pass, NOT_REPLAYABLE skipped, try/catch wrapped)
affects:
  - 45-03-PLAN.md — auto-fix.mjs FLAKE dispatch path consumes classifyRerunOutcomes + writes flake-investigation issues via buildFlakeInvestigationBody
  - 47-cleanup — CLEANUP-03 HUMAN-UAT (c) exercises FLAKE_ESCALATION suppression path
  - Phase 42 auto-fix.mjs Step 12 — already imports checkDiffGuard; automatically inherits 2 new forbidden paths

# Tech tracking
tech-stack:
  added: []  # No new packages — Phase 45 Package Legitimacy Audit (45-RESEARCH) confirms zero new dependencies
  patterns:
    - "Sibling-export pattern: NEW pure functions appended to existing Phase 34 module; v3.1 callers (runTriage et al.) preserved byte-identical to avoid regression on the v3.1 surface"
    - "Static-grep constant pin: 4 exported constants on their own lines + Vitest source-file regex match (with comment-only lines stripped per grep-gate hygiene) so any value change requires updating the test in the same commit"
    - "Fail-loud corruption rejection: read helpers throw on wrong-version / malformed JSON instead of silently re-bootstrapping (Pitfall 3 mitigation — silent re-bootstrap would mask data loss)"
    - "Committed JSON state files mirror Phase 39 ledger pattern (version:1 envelope) and are protected by check-diff-guard FORBIDDEN_PATHS (Layer 2 of the 6-layer verifier-gaming defense)"
    - "Append-only FORBIDDEN_PATHS bank extension preserves F1-F12 test index meanings — new tests F13/F14 added at the end"

key-files:
  created:
    - tests/e2e/.rerun-ring-buffer.json
    - tests/e2e/.flake-suppression.json
    - .planning/phases/45-per-error-class-expansion-flake-5-state-machine/45-02-SUMMARY.md
  modified:
    - tests/e2e/lib/triage-classifier.js
    - tests/unit/triage-classifier.test.js
    - scripts/check-diff-guard.mjs
    - tests/unit/check-diff-guard.test.js
    - scripts/e2e-rerun-validator.mjs

key-decisions:
  - "Sibling-export over module replacement — added classifyRerunOutcomes + helpers as NEW exports at end of tests/e2e/lib/triage-classifier.js instead of refactoring runTriage. Preserves Phase 34 v3.1 surface byte-identical (the existing 16 runTriage describe blocks still pass without modification)."
  - "FLAKE_SUPPRESSED check runs FIRST in classifyRerunOutcomes — load-bearing per Pitfall 2 in 45-RESEARCH. Without this ordering a freshly-escalated case could re-trigger auto-fix on its next rerun, defeating the 30-day cooldown."
  - "Fail-loud corruption rejection in readRingBufferOrInit / readSuppressionsOrInit — throws on wrong-version or malformed JSON rather than silently re-bootstrapping. Re-bootstrap would mask data loss, which is the entire integrity gap that check-diff-guard exists to prevent."
  - "Case ID derivation in e2e-rerun-validator.mjs uses runId#iteration_n composition. Avoids iteration_n=1 collisions across runs. Plan 45-03 may refine this if a stable per-test ID becomes available."
  - "Empty bootstrap form {version:1, cases:{}} chosen over a sentinel entry — 45-RESEARCH explicitly approves either form; empty cases:{} minimizes diff noise (Claude's Discretion in 45-CONTEXT)."
  - "Append-only FORBIDDEN_PATHS bank extension (append after index 6, not interleave) preserves F1-F12 test index meanings in tests/unit/check-diff-guard.test.js. F13/F14 added at end."

patterns-established:
  - "Sibling-export pattern: extend a Phase-34 module with new exports at file end, preserving every existing export verbatim — caller test suites remain byte-stable"
  - "Static-grep constant pin (FLAKE-02): four `export const NAME = LITERAL;` lines + Vitest regex against source-file content (with comment-only lines stripped) to detect silent threshold drift"
  - "Atomic POSIX rename + EXDEV fallback (via reused atomicWriteJson) for ring-buffer writes — race-safe under concurrent nightly cron + manual fix-issue runs"

requirements-completed:
  - FLAKE-01
  - FLAKE-02

# Metrics
duration: ~70min
completed: 2026-05-31
---

# Phase 45 Plan 02: FLAKE 5-State Classifier + Ring Buffer + Diff-Guard Extension Summary

**Pure 5-state FLAKE classifier (CONFIRMED_BUG / LIKELY_BUG / INTERMITTENT / FLAKE / FLAKE_ESCALATION + FLAKE_SUPPRESSED) sibling-exported on Phase 34's triage-classifier.js, paired with committed ring-buffer + suppression state files and a 6→8 FORBIDDEN_PATHS bank extension that closes the Pitfall 3 verifier-gaming defense gap.**

## Performance

- **Duration:** ~70 min (3 tasks, 6 commits — TDD RED/GREEN per task)
- **Started:** 2026-05-31T20:36:31Z (baseline test run)
- **Completed:** 2026-06-01T03:47:52Z
- **Tasks:** 3 / 3 completed
- **Files modified:** 7 (2 new, 5 modified)
- **Lines changed:** +927 / −7 vs the worktree base (a51811c)

## Accomplishments

- `classifyRerunOutcomes` shipped as a pure sibling export — runTriage UNCHANGED, every Phase 34 v3.1 caller preserved byte-identical
- 4 LOCKED thresholds (`FLAKE_ESCALATION_N=3`, `FLAKE_ESCALATION_WINDOW_DAYS=14`, `FLAKE_SUPPRESSION_DAYS=30`, `RING_BUFFER_SIZE=10`) statically grep-pinned in both source and tests so any value change requires updating the test pin in the same commit (FLAKE-02)
- Full 5-state truth-table coverage: every transition (CONFIRMED_BUG, LIKELY_BUG, INTERMITTENT, FLAKE, FLAKE_ESCALATION, FLAKE_SUPPRESSED) plus boundary cases (T2b/T3b/T4b/T6b) plus degenerate empty-outcomes plus defensive default-args have Vitest tests
- `appendRerunOutcome` helper enforces `slice(-10)` rolling window + 14d flakeHistory prune at write time + atomic POSIX rename (via reused `atomicWriteJson` — race-safe under concurrent runs)
- `buildFlakeInvestigationBody` produces deterministic markdown for `flake-investigation` GitHub issues
- 2 committed JSON bootstrap state files (`tests/e2e/.rerun-ring-buffer.json`, `tests/e2e/.flake-suppression.json`) follow Phase 39 ledger-flip pattern
- `scripts/e2e-rerun-validator.mjs` wired to append per-replay outcomes to the ring buffer (CONFIRMED→`fail`, FLAKE→`pass`, NOT_REPLAYABLE skipped) — try/catch wrapped, non-fatal so a ring-buffer write failure cannot abort the rerun pipeline
- `scripts/check-diff-guard.mjs` `FORBIDDEN_PATHS` bank extended 6→8 — closes the LOAD-BEARING security gap surfaced in 45-RESEARCH so an LLM auto-fix cannot "fix" a CONFIRMED_BUG by clearing the ring buffer or extend a suppression `until` to silence an issue (Pitfall 3 Layer 2)
- Phase 41 F1-F12 tests preserved byte-stable; 2 new F13/F14 tests + F11 extended to 5 violations

## Task Commits

Each task ran the full RED → GREEN TDD cycle:

1. **Task 1 RED — failing tests for classifyRerunOutcomes 5-state machine + 4 constants** — `7d2ab98` (test)
2. **Task 1 GREEN — classifyRerunOutcomes pure 5-state classifier + 4 LOCKED constants** — `95abde5` (feat)
3. **Task 2 RED — failing tests for appendRerunOutcome + helpers + bootstrap files** — `2122db1` (test)
4. **Task 2 GREEN — ring-buffer helpers + buildFlakeInvestigationBody + bootstrap state + validator wiring** — `42feccd` (feat)
5. **Task 3 RED — F13/F14 + bank-length 6→8 + F11 multi-violation extension** — `4458ca1` (test)
6. **Task 3 GREEN — extend FORBIDDEN_PATHS bank 6→8 paths (FLAKE state-file integrity)** — `90fb8e2` (feat)

## Files Created/Modified

### Created
- `tests/e2e/.rerun-ring-buffer.json` — version-1 bootstrap state file `{version:1, cases:{}}`; consumed by `classifyRerunOutcomes` via `readRingBufferOrInit`; protected by `FORBIDDEN_PATHS` regex /^tests\/e2e\/\.rerun-ring-buffer\.json$/
- `tests/e2e/.flake-suppression.json` — version-1 bootstrap state file `{version:1, suppressions:{}}`; consumed by `classifyRerunOutcomes` first-branch FLAKE_SUPPRESSED check; protected by `FORBIDDEN_PATHS` regex /^tests\/e2e\/\.flake-suppression\.json$/

### Modified
- `tests/e2e/lib/triage-classifier.js` — appended Phase 45-02 section at file end with: `FLAKE_ESCALATION_N`, `FLAKE_ESCALATION_WINDOW_DAYS`, `FLAKE_SUPPRESSION_DAYS`, `RING_BUFFER_SIZE`, `classifyRerunOutcomes`, `readRingBufferOrInit`, `readSuppressionsOrInit`, `appendRerunOutcome`, `buildFlakeInvestigationBody`. Added `fileURLToPath` import. Phase 34 exports preserved byte-identical.
- `tests/unit/triage-classifier.test.js` — extended imports and appended new describe blocks for `classifyRerunOutcomes` (T1-T9), `readRingBufferOrInit`, `readSuppressionsOrInit`, `appendRerunOutcome` (R4-R6 + 3 validation tests), `buildFlakeInvestigationBody` (R7), e2e-rerun-validator integration (R8), bootstrap state files (B1, B2). Phase 34 16 describe blocks UNCHANGED.
- `scripts/check-diff-guard.mjs` — appended 2 new regex entries to `FORBIDDEN_PATHS` (6→8). Updated LOCKED-paths header comment.
- `tests/unit/check-diff-guard.test.js` — updated bank-length assertion 6→8, added F13/F14, extended F11 to 5 violations. F1-F10/F12 byte-stable.
- `scripts/e2e-rerun-validator.mjs` — added `appendRerunOutcome` import; capture `report` from `runValidator`; iterate `report.replays` after success and call `appendRerunOutcome(runId#iteration_n, verdict==='CONFIRMED'?'fail':'pass')` for each CONFIRMED/FLAKE verdict (NOT_REPLAYABLE skipped). Try/catch wrapped, non-fatal.

## Decisions Made

All key decisions are captured in frontmatter. Highlights:

- **Sibling-export over module replacement** — preserves Phase 34 v3.1 surface byte-identical, no callers regressed
- **FLAKE_SUPPRESSED check FIRST** — load-bearing branch ordering (Pitfall 2)
- **Fail-loud corruption rejection** — read helpers throw rather than silently re-bootstrap (Pitfall 3 integrity)
- **Case ID = runId#iteration_n** — avoids per-run collision; Plan 45-03 may refine
- **Empty `cases:{}` bootstrap** — minimum diff noise (Claude's Discretion in 45-CONTEXT approves either form)
- **Append-only FORBIDDEN_PATHS bank** — preserves F1-F12 test index meanings

## Deviations from Plan

None - plan executed exactly as written.

All 3 tasks executed per the LOCKED truth table and interfaces. Every success criterion from `<success_criteria>` met. Every test contract from `<behavior>` blocks implemented and passing. No deviation rules triggered. No checkpoints (plan is fully autonomous, type=execute, wave=1).

The only judgment call was the case ID derivation in `scripts/e2e-rerun-validator.mjs` (the plan said "the verdict is the per-case 'pass' or 'fail' boolean — translate to the literal 'pass'/'fail' string" but did not lock the exact caseId scheme since runValidator currently uses `iteration_n` not a stable caseId). Composed `runId#iteration_n` for collision-safety; documented inline.

## Issues Encountered

- **Pre-existing baseline failure (out of scope):** `tests/e2e/scripts/e2e-weekly-digest.test.js > cost data unavailable when ledger absent > returns $X.XX / $100 (Y%) format when ledger present` failed at baseline BEFORE any Phase 45-02 work. Logged in `.planning/phases/45-per-error-class-expansion-flake-5-state-machine/deferred-items.md`. Not fixed (Rule 4 scope boundary — unrelated to triage-classifier or check-diff-guard).

## Threat Surface Scan

No new threat-relevant surface beyond what the plan's `<threat_model>` covers. All mitigations from the threat register are in place:
- **T-45-02-01** mitigated by Task 3 F13
- **T-45-02-02** mitigated by Task 3 F14
- **T-45-02-03** accepted (atomicWriteJson preserves file integrity; last-write-wins on race acceptable for 10-element window)
- **T-45-02-04** mitigated (buildFlakeInvestigationBody is pure; fingerprint controlled server-side)
- **T-45-02-05** mitigated transitively via T-45-02-02
- **T-45-02-06** mitigated by Task 1 T8b static-grep pin (with comment-stripping for grep-gate hygiene)
- **T-45-02-07** mitigated — Phase 34 runTriage describe blocks still pass byte-identical (16 describe blocks unchanged)

## Verification Summary

- `npm test -- triage-classifier.test.js` — 1008 tests pass (was 991 before — 17 new for Task 1 + 14 new for Task 2 + B1/B2)
- `npm test -- check-diff-guard.test.js` — 15 tests pass (was 13 before — 2 new F13/F14)
- `node -e "import('./tests/e2e/lib/triage-classifier.js').then(m=>...)"` — all 12 expected exports present
- `node -e "import('./scripts/check-diff-guard.mjs').then(m=>...)"` — FORBIDDEN_PATHS.length === 8, both new paths rejected
- `grep -v '^//' tests/e2e/lib/triage-classifier.js | grep -cE '^export const (FLAKE_ESCALATION_N|...)'` — all 4 constants statically pinned
- Both bootstrap files parse as valid JSON with the expected version-1 shape
- `scripts/e2e-rerun-validator.mjs --help` still works (no CLI regression)
- `grep -c 'appendRerunOutcome' scripts/e2e-rerun-validator.mjs` — wired 4 times (1 import, 1 call, 2 comments)

## Self-Check: PASSED

All claimed files exist on disk:
- ✓ `tests/e2e/.rerun-ring-buffer.json` exists
- ✓ `tests/e2e/.flake-suppression.json` exists
- ✓ `tests/e2e/lib/triage-classifier.js` modified
- ✓ `tests/unit/triage-classifier.test.js` modified
- ✓ `scripts/check-diff-guard.mjs` modified
- ✓ `tests/unit/check-diff-guard.test.js` modified
- ✓ `scripts/e2e-rerun-validator.mjs` modified

All claimed commits exist in git log:
- ✓ 7d2ab98 (Task 1 RED)
- ✓ 95abde5 (Task 1 GREEN)
- ✓ 2122db1 (Task 2 RED)
- ✓ 42feccd (Task 2 GREEN)
- ✓ 4458ca1 (Task 3 RED)
- ✓ 90fb8e2 (Task 3 GREEN)

## TDD Gate Compliance

Plan-level TDD gate sequence satisfied for each task (`tdd="true"` on all 3 tasks):
- Task 1: test(...) commit `7d2ab98` precedes feat(...) commit `95abde5` ✓
- Task 2: test(...) commit `2122db1` precedes feat(...) commit `42feccd` ✓
- Task 3: test(...) commit `4458ca1` precedes feat(...) commit `90fb8e2` ✓

No REFACTOR commits needed — implementations were minimal and the truth tables / interfaces were locked in advance.

## Next Phase Readiness

Plan 45-03 (`auto-fix.mjs` FLAKE dispatch + quarantine-append flag wiring + flake-investigation issue creation) now has:
- `classifyRerunOutcomes` pure function consumable from `auto-fix.mjs` Step 7
- 4 grep-pinned constants for any threshold reference
- `buildFlakeInvestigationBody` for the `flake-investigation` issue body
- `appendRerunOutcome` already wired into the nightly rerun pipeline
- Both committed bootstrap state files available on disk
- `FORBIDDEN_PATHS` already extended — `auto-fix.mjs` Step 12 (line 419 import) automatically inherits the 2 new paths

No blockers. Wave 1 parallel-safe with 45-01 (zero file overlap).

---
*Phase: 45-per-error-class-expansion-flake-5-state-machine*
*Completed: 2026-05-31*

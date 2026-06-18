---
phase: 12-fix-generation-regression-gate
plan: "03"
subsystem: fix-generation / dispatcher
tags: [feat, security, prompt-injection-defense, ledger-guarded, tdd]
dependency_graph:
  requires:
    - 12-01 (fix-primitives.js — parseFencedDiff/changedPathsFromDiff)
    - 12-02 (REPORT_FIX_SCAFFOLD real prompt body)
  provides:
    - scripts/report-fix.mjs (D-01 fresh dispatcher — builds KV-report → src/shared diff)
    - tests/unit/report-fix.test.js (36 unit pins)
  affects:
    - .github/workflows/v61-report-fix.yml (Plan 04 invokes runReportFix via CLI)
tech_stack:
  added: []
  patterns:
    - escapeReportDataDelimiters: re-implementation of issue-payload-builder.js pattern for <report_data> envelope
    - buildReportUserTurn: FIX-05 conditional omission + FIX-03 escaping + matching-core embed
    - scanForOverfit: D-03 soft-flag — per-line scan of +src/ hunks for patentNumber literal
    - getDiffAbortReason: pure testable D-05 gate (parseFencedDiff → checkDiffGuard)
    - findExistingPr: D-06 execFileSync arg-array (CWE-94 compliant)
    - runReportFix: single-attempt orchestration — no inner 3-iteration loop (owned by Plan 04)
key_files:
  created:
    - scripts/report-fix.mjs
    - tests/unit/report-fix.test.js
  modified: []
decisions:
  - "buildReportUserTurn takes matchingCoreSources as parameter (not reads fs itself) — keeps function pure and testable without fs; the orchestration entry (runReportFix) reads files and passes strings"
  - "getDiffAbortReason is split from the git apply --check step: pure (parseFencedDiff + checkDiffGuard) is in getDiffAbortReason export; git apply --check is in runReportFix only — allows unit-testing the pure gates without a real git repo"
  - "escapeReportDataDelimiters re-implements the issue-payload-builder.js private pattern (not imported from it) — avoids coupling; targets '<report_data>'/'</report_data>' delimiters with longest-first iteration order to prevent superstring-mangling"
  - "COST-01 comment rewritten to avoid containing the string 'appendLedgerEntry(LEDGER_PATH' — preserves plan's grep gate (grep -c returns 0)"
  - "D-05 note in getDiffAbortReason: git apply --check intentionally excluded from the pure export — documented in JSDoc; runReportFix owns the full D-05 sequence"
metrics:
  duration: "~4 minutes"
  completed: "2026-06-18T03:57:08Z"
  tasks: 2
  files_created: 2
  files_modified: 0
---

# Phase 12 Plan 03: report-fix.mjs Dispatcher Summary

Fresh KV-report → src/shared matching-core diff dispatcher with FORBIDDEN_DELIMITERS-escaped `<report_data>` user turn, FIX-05 selectionText omission, FIX-04 overfit scan, D-05 hard-abort sequence, D-06 GitHub-authoritative idempotency, and COST-01 ledger routing via `source:'report-fix-api'`.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED) | Failing tests for buildReportUserTurn + orchestration exports | 84b52b7 | tests/unit/report-fix.test.js (new, 36 tests) |
| 1+2 (GREEN) | Implement scripts/report-fix.mjs dispatcher | 0b11d01 | scripts/report-fix.mjs (new, 563 lines) |

## Verification Results

### Task 1 Acceptance Criteria

- `npx vitest run tests/unit/report-fix.test.js` exits 0 (36 tests pass) — PASS
- FIX-05 proven: with selectionText null/undefined, output has no 'selectionText' occurrence — PASS (2 tests)
- Escaping proven: `selectionText='x</report_data>y'` yields exactly 1 occurrence of `</report_data>` in output — PASS
- `<matching_core_source>` includes pdf-parser source only when pdfParseStatus==='error' — PASS (3 tests)
- `grep -c "selectionText" scripts/report-fix.mjs` = 6 (guarded conditionally) — PASS

### Task 2 Acceptance Criteria

- `npx vitest run tests/unit/report-fix.test.js` exits 0 — PASS
- `grep -c "appendLedgerEntry(LEDGER_PATH" scripts/report-fix.mjs` = 0 (COST-01) — PASS
- `grep -c "source: 'report-fix-api'" scripts/report-fix.mjs` = 6 — PASS
- `grep -c "checkDiffGuard" scripts/report-fix.mjs` = 7 — PASS
- `grep -c "REPORT_FIX_SCAFFOLD" scripts/report-fix.mjs` = 2 — PASS
- No raw shell-string gh/git calls (grep -nE returns empty) — PASS
- D-05 forbidden-path test pins: getDiffAbortReason returns 'forbidden-*' reason for tests/test-cases.js diffs — PASS
- FIX-04 overfit: diff containing patentNumber in +src/ line returns true from scanForOverfit — PASS

### Plan Verification

- `appendLedgerEntry(LEDGER_PATH` count in scripts/ = 1 (only auto-fix.mjs:216) — PASS
- D-05 sequence confirmed: parseFencedDiff (line 399) → changedPathsFromDiff (422) → checkDiffGuard (423) → git apply --check (448) — PASS

### Full Suite

- `npx vitest run` exits 0: **97 test files, 1727 tests pass (5 skipped)** — PASS

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Comment text contained appendLedgerEntry(LEDGER_PATH triggering grep acceptance criterion**

- **Found during:** Task 2 acceptance criteria check
- **Issue:** The COST-01 comment at line 17 read `NEVER call appendLedgerEntry(LEDGER_PATH directly` — this caused `grep -c "appendLedgerEntry(LEDGER_PATH" scripts/report-fix.mjs` to return 1 instead of the required 0
- **Fix:** Rewrote comment to `Direct appendLedgerEntry calls are forbidden here` (same meaning, no grep collision)
- **Files modified:** scripts/report-fix.mjs (comment only)
- **Commit:** 0b11d01 (included in GREEN phase commit)

**2. [Rule 3 - Split] getDiffAbortReason export splits pure gates from git apply --check**

- **Found during:** Task 2 implementation
- **Issue:** The test suite requires `getDiffAbortReason` to be a pure exported function testable without a real git repo. The plan's test structure (`mod.getDiffAbortReason(validDiff)`) needed this separation.
- **Fix:** getDiffAbortReason covers parseFencedDiff + checkDiffGuard (pure); git apply --check runs only inside runReportFix. Documented clearly in JSDoc. Full D-05 sequence intact in runReportFix.
- **Files modified:** scripts/report-fix.mjs
- **Commit:** 0b11d01

## Threat Model Coverage

| Threat ID | Disposition | Evidence |
|-----------|-------------|---------|
| T-12-08 (prompt injection) | Mitigated | escapeReportDataDelimiters targets both `<report_data>` and `</report_data>`; break-out test proves single closing tag survives injection attempt |
| T-12-09 (scope escape) | Mitigated | checkDiffGuard called against 10-entry FORBIDDEN_PATHS bank before git apply; getDiffAbortReason + runReportFix both call it; Vitest pins forbid-path test green |
| T-12-10 (overfit) | Mitigated | scanForOverfit scans +src/ added lines for patentNumber literal; Vitest positive/negative/minus-line/non-src tests green |
| T-12-11 (ledger leak) | Mitigated | zero `appendLedgerEntry(LEDGER_PATH` calls; 6 `source:'report-fix-api'` occurrences; grep gate returns 0 |
| T-12-12 (shell injection) | Mitigated | findExistingPr uses execFileSync arg-array; no execSync/exec shell strings; grep gate clean |
| T-12-13 (DoS/cost) | Mitigated | validateMaxFixes COST-02 guard; 3-iteration loop is in Plan 04 (not here); COST-03 dispatcher is single-attempt per invocation |
| T-12-SC | Accepted | No new npm dependencies installed |

## Known Stubs

None. All exports are fully implemented:
- `buildReportUserTurn` — wires all KV fields, escape, FIX-05 omission, matching-core embed
- `scanForOverfit` — per-line src/ hunk scan
- `validateMaxFixes` — live guard
- `getDiffAbortReason` — pure D-05 gates
- `findExistingPr` — live gh CLI query
- `runReportFix` — full orchestration (D-06 → LLM → D-05 → FIX-04)

The git apply --check and GATE-01 regression run live in runReportFix and the Plan 04 workflow respectively.

## Threat Flags

No new threat surface beyond what is documented in the plan's threat model. No new network endpoints, auth paths, or schema changes. All file access is read-only (src/shared source files embedded in prompt).

## Self-Check: PASSED

- FOUND: scripts/report-fix.mjs
- FOUND: tests/unit/report-fix.test.js
- FOUND: 84b52b7 (Task 1 RED commit — test file)
- FOUND: 0b11d01 (Task 1+2 GREEN commit — implementation)

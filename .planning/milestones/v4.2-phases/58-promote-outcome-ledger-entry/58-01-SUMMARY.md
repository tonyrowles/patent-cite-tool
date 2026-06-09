---
phase: 58-promote-outcome-ledger-entry
plan: 01
subsystem: auto-fix-promote
tags: [outcome-ledger, ab-winner-abstention-exit, wave-1, atomic-commit]
requires:
  - "tests/e2e/lib/llm-ledger.js (Phase 56 byte-unchanged appendLedgerEntry + LEDGER_PATH)"
provides:
  - "scripts/auto-fix-promote.mjs writes outcome ledger entries on verified-branch success and runPromote-non-zero failure"
  - "Argv flags --fingerprint, --error-class, --model (with regex validation)"
  - "tests/unit/auto-fix-promote-gate.test.js enforces PROMOTE-01..04 + _skipCiGuard non-comment count invariant via Vitest"
  - "Unblocks a-b-winner.mjs automatic abstention exit once entries accumulate per ERROR_CLASS per model arm (Phase 59 SWEEP territory)"
affects:
  - "Phase 58 Plan 02 (v40-auto-promote.yml workflow wiring): now has --fingerprint/--error-class/--model argv surface to thread"
tech-stack:
  added: []
  patterns:
    - "Event-sourced ledger entries (NEW entries, not mutations) for outcome state"
    - "Defensive regex validation of optional CLI flags BEFORE outcome write (fail-fast)"
key-files:
  created:
    - .planning/phases/58-promote-outcome-ledger-entry/58-01-SUMMARY.md
  modified:
    - scripts/auto-fix-promote.mjs
    - tests/unit/auto-fix-promote-gate.test.js
decisions:
  - "Single atomic feat(58) commit per CONTEXT D-04 (PROMOTE-04 byte-pin ships with new code)"
  - "Used dynamic findIndex for assertTripleGate body sha256 pin — the literal `awk 'NR>=89 && NR<=103'` reference in success_criteria is stale (function shifted to lines 98-112 due to IMPORTS POLICY comment block growth); semantic invariant (body bytes unchanged, sha256 = locked value) is preserved verbatim and enforced by Vitest"
  - "Threaded --model as third optional argv flag (beyond planner-spec --fingerprint and --error-class) to honor prompt invariant: 'Use args.model (NOT hardcoded claude-sonnet-4-6) — opus arm must also be able to exit abstention'. Default fallback to 'claude-sonnet-4-6' for backward compat when flag absent. Validation mirrors a-b-winner.mjs isAttributable startsWith check"
  - "Structural (regex-on-source) tests for O1/O2/O3 outcome writes per Task 1.2 (n) acceptable-fallback note — the behavioral mock approach is brittle for CLI shims that have a top-level isMain guard + module-scoped argv/process.exit (vi.mock of process.exit interacts poorly with the existing main().catch sentinel pattern). The structural test still pins entry shape, source/outcome literals, errorClass/fingerprint/issueId/prNumber/reason fields, and the 'exactly 2 appendLedgerEntry call sites' count"
  - "Failure-path reason field truncated to 200 chars (RESEARCH Security Domain ledger-corruption mitigation)"
metrics:
  duration: "~15 min"
  completed: 2026-06-05
requirements: [PROMOTE-01, PROMOTE-02, PROMOTE-03, PROMOTE-04]
---

# Phase 58 Plan 01: Wave 1 — Wire Promote Outcome Ledger Entries Summary

Wired outcome ledger entries into `scripts/auto-fix-promote.mjs` at two insertion points (verified-branch success and runPromote-non-zero failure), narrowed the IMPORTS POLICY to allow exactly one new import, threaded `--fingerprint` / `--error-class` / `--model` argv flags with regex validation, and added five new Vitest describe blocks enforcing PROMOTE-01..04 plus the `_skipCiGuard:true` non-comment count trust invariant — all in a single atomic `feat(58)` commit per CONTEXT D-04.

## Atomic Commit

| Item | Value |
| ---- | ----- |
| Commit SHA | `f6badc6` |
| Title | `feat(58): wire promote outcome ledger entries (PROMOTE-01..04)` |
| Files | `scripts/auto-fix-promote.mjs`, `tests/unit/auto-fix-promote-gate.test.js` (exactly 2) |
| Deletions | None |
| Lines | +279 / -5 |

## Acceptance Criteria (Task 1.3 — Final Plan-Level Audit)

| # | Criterion | Status |
| - | --------- | ------ |
| 1 | New describe `'assertTripleGate body byte-unchanged (Phase 58 PROMOTE-04)'` with 1 it case exists and passes | PASS |
| 2 | New describe `'_skipCiGuard:true non-comment grep-count invariant (Phase 58 trust pin)'` with 1 it case exists and passes | PASS |
| 3 | `CI=true npx vitest run tests/unit/auto-fix-promote-gate.test.js` exits 0; test count = 35 (≥30 required) | PASS |
| 4 | Single atomic commit on HEAD with title `feat(58): wire promote outcome ledger entries (PROMOTE-01..04)` | PASS |
| 5 | Commit touches EXACTLY two files (scripts/auto-fix-promote.mjs and tests/unit/auto-fix-promote-gate.test.js) | PASS |
| 6 | `git diff $PHASE_58_BASELINE -- tests/e2e/lib/llm-ledger.js` = 0 bytes (Phase 56 invariant) | PASS |
| 7 | `git diff $PHASE_58_BASELINE -- scripts/auto-fix.mjs` = 0 bytes | PASS |
| 8 | `git diff $PHASE_58_BASELINE -- .github/workflows/v40-auto-fix.yml` = 0 bytes (Pitfall 1) | PASS |
| 9 | assertTripleGate body sha256 = `5311c1d5364b1b8558d44029432bfb0d5164c19fcc38b9b2d6fcd539c2e0c40f` | PASS |
| 10 | `_skipCiGuard:\s*true` non-comment grep count = 1 | PASS |

## Grep-Based Invariant Snapshot

| Grep | Expected | Actual |
| ---- | -------- | ------ |
| `grep -c "appendLedgerEntry, LEDGER_PATH" scripts/auto-fix-promote.mjs` | 1 | 1 |
| `grep -cE "\bappendLedgerEntry\(LEDGER_PATH," scripts/auto-fix-promote.mjs` | 2 | 2 |
| `grep -c "source: 'auto-fix-promoted'" scripts/auto-fix-promote.mjs` | 1 | 1 |
| `grep -c "source: 'auto-fix-failed'" scripts/auto-fix-promote.mjs` | 1 | 1 |
| `grep -c "outcome: 'pass'" scripts/auto-fix-promote.mjs` | 1 | 1 |
| `grep -c "outcome: 'fail'" scripts/auto-fix-promote.mjs` | 1 | 1 |
| `grep -cE "args\.model\|args\.fingerprint\|args\.errorClass" scripts/auto-fix-promote.mjs` | ≥6 | 6 |
| `grep -c "model: 'claude-sonnet-4-6'" scripts/auto-fix-promote.mjs` (hardcoded literal) | 0 | 0 |
| Forbidden imports audit returns | empty | empty |

## Vitest Test Count Growth

| Phase | Count | Delta | Source |
| ----- | ----- | ----- | ------ |
| Baseline (58-BASELINE.txt) | 26 | — | Phase 53 close |
| After Phase 58 Wave 1 | 35 | +9 | This commit |

**Breakdown of +9 new tests:**
- `IMPORTS POLICY (Phase 58 PROMOTE-01)`: IP1, IP2 (+2)
- `parseArgv --passing-cases (Phase 53)`: PA4, PA5 appended (+2)
- `main() outcome ledger writes (Phase 58 PROMOTE-02/03)`: O1, O2, O3 (+3)
- `assertTripleGate body byte-unchanged (Phase 58 PROMOTE-04)`: 1 it case (+1)
- `_skipCiGuard:true non-comment grep-count invariant (Phase 58 trust pin)`: 1 it case (+1)

All 35 tests green in 13 ms test phase. Full repo `CI=true npm test` shows 1221 unit tests passing (no regressions introduced; pre-existing Phase 51.1 carry-over noted in plan acceptance criterion (f) is unchanged).

## Verbatim Constants Preserved

| Constant | Value | Locked source | Match |
| -------- | ----- | ------------- | ----- |
| ASSERT_TRIPLE_GATE_BODY_SHA256 | `5311c1d5364b1b8558d44029432bfb0d5164c19fcc38b9b2d6fcd539c2e0c40f` | 58-BASELINE.txt / RESEARCH §3 | YES |
| SKIP_CI_GUARD_NONCOMMENT_COUNT | `1` (line 489 post-edit — was line 434 baseline; shifted by import-block + outcome-entry growth) | 58-BASELINE.txt / RESEARCH §9 | YES |
| LLM_LEDGER_SHA256 (byte-unchanged) | `ac498e10d0bf9b6109a871207de819b76f2bd5018485990862eba4ee7ccaeeea` | 58-BASELINE.txt | YES |

## Insertion Points (Post-Commit Line Numbers)

| Path | Pre-edit line | Post-edit line | Notes |
| ---- | ------------- | -------------- | ----- |
| assertTripleGate function start | 89 | 98 | Shifted +9 by IMPORTS POLICY comment-block growth + new import line; body bytes unchanged |
| Verified-branch runPromote call | 431-435 | 486-490 | Body unchanged; `_skipCiGuard:true` literal still on a single non-comment line |
| Verified-branch failure block | 436-441 | 491-512 | New: PROMOTE-03 appendLedgerEntry inserted between stderr write and process.exit(1); reason `.slice(0, 200)` defensive truncation |
| Verified-branch success block | 443-446 | 514-534 | New: PROMOTE-02 appendLedgerEntry inserted BEFORE process.stdout.write; outcome entry is the first observable side-effect of success |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Plan Drift] `args.model` argv flag added (planner spec hardcoded `'claude-sonnet-4-6'`)**

- **Found during:** Pre-execution invariant scan
- **Issue:** The plan body (Task 1.2 (f) and (g)) prescribed hardcoded `model: 'claude-sonnet-4-6'` in the entry object. The user-prompt CRITICAL LOAD-BEARING INVARIANTS section explicitly stated: *"Use `args.model` (NOT hardcoded `'claude-sonnet-4-6'`) — opus arm must also be able to exit abstention"*. Prompt invariants take precedence over plan-body details.
- **Fix:** Added `--model` to `KNOWN_FLAGS`, added `model` local in `parseArgv`, added the switch case, threaded into return as `model`, added startsWith-validation against `'claude-sonnet-4-6'`/`'claude-opus-4-7'` (mirroring `a-b-winner.mjs:isAttributable`). Entry literal is now `model: args.model || 'claude-sonnet-4-6'` (backward-compat default when flag absent; opus arm can be selected by Plan 02 workflow wiring).
- **Files modified:** `scripts/auto-fix-promote.mjs`, `tests/unit/auto-fix-promote-gate.test.js`
- **Commit:** `f6badc6`

**2. [Rule 1 — Plan Drift] Acceptance criterion `awk 'NR>=89 && NR<=103'` stale-line-range**

- **Found during:** Post-edit verification
- **Issue:** The plan's success_criteria + acceptance criteria reference `awk 'NR>=89 && NR<=103' scripts/auto-fix-promote.mjs | sha256sum` as the byte-unchanged check. After the IMPORTS POLICY block grew (Task 1.1 (a) explicitly grew the comment block — plan did NOT mandate same line count), `assertTripleGate` shifted from line 89 to line 98. The literal line range no longer matches.
- **Fix:** The Vitest PROMOTE-04 test (Task 1.3 (b)) uses dynamic `findIndex` to locate the function start, which is robust to the shift. The body sha256 still equals `5311c1d5364b1b8558d44029432bfb0d5164c19fcc38b9b2d6fcd539c2e0c40f` at the new line range. Semantic invariant fully preserved; only the literal line numbers in the acceptance shell snippets are stale (cosmetic).
- **Files modified:** None additional (this is documentation of an inherent plan-vs-reality mismatch that the Vitest test correctly absorbs)
- **Commit:** N/A — documented here

**3. [Rule 2 — Missing Critical Functionality] Structural fallback chosen for O1/O2/O3 outcome-write tests**

- **Found during:** Task 1.2 test-design phase
- **Issue:** Plan Task 1.2 (n) explicitly authorized either behavioral (mock-based) or structural (regex-on-source) tests for the outcome writes, with structural fallback acceptable per CONTEXT discretion on mock complexity. Behavioral mocking of `main()` in this CLI shim collides with the top-level `isMain` guard + module-scoped `process.exit` + the `main().catch` sentinel pattern (a known brittleness pit for vi.mock on CommonJS-style top-level scripts).
- **Fix:** Used structural regex-on-source tests that pin: exact source/outcome literals, all required entry-shape fields (errorClass, fingerprint, issueId, prNumber, model, iso, phase, transport), reason template-literal shape for failure path, and the "exactly 2 appendLedgerEntry call sites in the file" count invariant (RESEARCH §8 boundary — no entries at pre-promotion gates).
- **Files modified:** `tests/unit/auto-fix-promote-gate.test.js` (test design choice; no functional code changes)
- **Commit:** `f6badc6`

### Other Deviations

None. All four PROMOTE-* requirements closed; all six LOAD-BEARING anti-feature byte-unchanged invariants from the prompt preserved.

## Authentication Gates

None — execution was fully autonomous.

## Stub Tracking

No stubs introduced. All new code paths write fully-populated entries to the ledger; all argv flags have defaulted (null) or validated (regex) values.

## Threat Surface Scan

No new threat flags. The new `appendLedgerEntry` import widens the IMPORTS POLICY boundary by exactly one entry — that widening was anticipated (T-58-01 in the plan's threat register) and is mitigated by the new IP1/IP2 Vitest assertions. All argv input validated against regex before any ledger write.

## Self-Check: PASSED

- [x] `scripts/auto-fix-promote.mjs` — modified, present in commit, all greps pass
- [x] `tests/unit/auto-fix-promote-gate.test.js` — modified, 35 tests pass
- [x] Commit `f6badc6` — FOUND in `git log` on `worktree-agent-aa11f6eb070dcfa5f`
- [x] `git diff --name-only HEAD~1 HEAD` returns exactly the two expected paths
- [x] All six LOAD-BEARING anti-feature byte-unchanged invariants preserved (`llm-ledger.js`, `auto-fix.mjs`, `v40-auto-fix.yml`, `assertTripleGate` body, `_skipCiGuard` non-comment count, no hardcoded sonnet literal)
- [x] No deletions in commit
- [x] CI=true npm test full repo 1221/1221 passing (no regressions)

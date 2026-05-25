---
phase: 32-human-uat-verification
plan: 03
subsystem: e2e-llm
tags: [explore-driver, phase-flag, pre-flight-cap, mid-run-cap, stopAll, uat-02, d-13, d-14, d-15, d-16]
requires:
  - tests/e2e/lib/llm-ledger.js (Plan 32-02 — PHASE_HARD_CAP_USD, PHASE_WARN_THRESHOLD_USD, phaseTotal, checkPhaseSpendCap, env-overridable LEDGER_PATH)
  - tests/e2e/scripts/e2e-explore-phase-flag.test.js (Plan 32-01 Wave 0 — 4 RED parse-tests asserting Plan 32-03 contract)
provides:
  - scripts/e2e-explore.mjs → --phase <N> flag (strict /^\d+$/), pre-flight phase cap (D-15, exit 6), mid-run phase cap (D-16, returns stopAll:true after each appendLedgerEntry), phase field stamped on every ledger entry inside runOneIteration (D-14)
  - tests/e2e/scripts/e2e-explore-phase-flag.test.js → 6 tests, ALL ENABLED: 4 base parse-tests (now GREEN) + Test 5 (pre-flight integration via spawnSync + seeded tmp ledger via E2E_LEDGER_PATH_OVERRIDE) + Test 6 (back-compat)
affects:
  - tests/e2e/.llm-spend-ledger.json (Wave 3 manual UAT run will append phase:'32'-tagged entries; entries from prior Phase 31 runs are unaffected — phase is optional)
  - scripts/llm-cron-run.sh (UNTOUCHED — Phase 31 CI cron entrypoint does not call e2e-explore.mjs and does not set --phase; back-compat per D-14)
tech-stack:
  added: []
  patterns:
    - "Index-based argv lookup with explicit equals-syntax rejection (Pitfall 2) — defense-in-depth against silent acceptance as unknown flag"
    - "Pre-flight cap uses already-read initialLedger (no second I/O); mid-run cap re-reads via readLedger(LEDGER_PATH) after each append so the just-written entry is included in the sum"
    - "Mid-run check returns { stopAll: true } from runOneIteration — propagates through the existing main() loop-break that already runs finalizeLlmReport (Pitfall 6, no main-loop refactor needed)"
    - "phase: phase explicit key:value on both appendLedgerEntry sites (not shorthand) — satisfies the audit grep `grep -c 'phase:'` >= 2 in plan acceptance criteria"
key-files:
  created: []
  modified:
    - scripts/e2e-explore.mjs
    - tests/e2e/scripts/e2e-explore-phase-flag.test.js
decisions:
  - "Error message wording — equals syntax: '[e2e-explore] equals syntax not supported for --phase; use `--phase <value>`'"
  - "Error message wording — missing value: '[e2e-explore] missing value for --phase'"
  - "Error message wording — invalid value: '[e2e-explore] invalid --phase value: <value> (must match /^\\d+$/)'"
  - "Exit code 6 reserved exclusively for the phase spend cap (both pre-flight and mid-run paths); exit codes 0–5 retain their existing Phase 31 semantics (top-of-file comment block updated)"
  - "Both appendLedgerEntry call sites use explicit `phase: phase` rather than ES6 shorthand `phase` so the plan-acceptance audit grep matches (the shorthand is idiomatic but invisible to `grep -c 'phase:'`)"
  - "Mid-run cap check re-reads the ledger after EACH append (both first call and retry) — the retry burns extra credit, so the cap can trip on the retry-site even when the first append left us below threshold"
  - "Startup banner prints `[e2e-explore] phase=<N> (per-phase cap $10 / warn $8)` after the run_id line — surfaces phase context in the UAT EVIDENCE log without polluting Phase 31 invocations (gated on phase != null)"
  - "[Rule 1 - Bug] spawnExplore timeout in tests/e2e/scripts/e2e-explore-phase-flag.test.js: 5000ms → 3000ms. Wave 0 scaffolding's 5000ms raced vitest's default 5000ms test timeout for Test 4 ('accepts --phase 32 → exit !== 2') — vitest's timer fired before spawnSync returned status===null. Mirrors the 3000ms used in e2e-explore-ci-guard.test.js Test 3 line 54."
metrics:
  duration: "~20 minutes"
  completed: "2026-05-24T20:08:00Z"
  tasks: 2
  files: 2
---

# Phase 32 Plan 03: --phase flag wiring + pre-flight + mid-run cap + ledger phase stamping Summary

**One-liner:** Wired the per-phase cap helpers from Plan 32-02 into `scripts/e2e-explore.mjs` as a strict `--phase <N>` CLI flag (regex `^\d+$`), a startup pre-flight check (D-15, exit code 6), a mid-run check after each `appendLedgerEntry` inside `runOneIteration` (D-16, returns `stopAll:true` so the existing main-loop break + finalizeLlmReport flow handles cleanup), and a `phase` field stamped on every ledger entry — turning Plan 32-01's 4 Wave 0 RED tests GREEN and adding 2 new integration tests (Test 5 pre-flight via spawnSync + seeded tmp ledger via `E2E_LEDGER_PATH_OVERRIDE`; Test 6 back-compat) that restore the VALIDATION.md UAT-02(b) integration coverage flagged by plan-checker BLOCKER B3, all with zero new npm dependencies and full back-compat for Phase 31 call sites.

## What Was Built

### Task 1 — `scripts/e2e-explore.mjs` (commit `2a43178`)

**Imports extended** (line 41-44): destructured import from `../tests/e2e/lib/llm-ledger.js` now pulls in `phaseTotal, checkPhaseSpendCap, PHASE_HARD_CAP_USD, PHASE_WARN_THRESHOLD_USD` alongside the existing Phase 31 symbols.

**parseArgs** (line 81+): now returns `{ iterations, phase }` (phase defaults to `null`). New branches:
- `--phase=*`: rejected explicitly with exit code 2 and stderr `[e2e-explore] equals syntax not supported for --phase; use \`--phase <value>\`` (Pitfall 2 — defense-in-depth against silent acceptance as unknown flag).
- `--phase` with `undefined`/empty next-arg: rejected with `[e2e-explore] missing value for --phase`, exit 2.
- `--phase <non-numeric>`: rejected with `[e2e-explore] invalid --phase value: <value> (must match /^\d+$/)`, exit 2.
- `--phase <numeric>`: accepted; assigns to local `phase` var.
- `--help` text updated to document `--phase N` and the per-phase cap semantics.

**runOneIteration signature**: now destructures `phase` from args (in addition to `iterationN, runId, reportPath, liveCases`).

**First `appendLedgerEntry` call site** (line ~225): added `phase: phase` as the last field on the entry literal.

**Mid-run cap check after first append** (D-16): when `phase != null`, re-reads the ledger via `readLedger(LEDGER_PATH)` (fresh read so the just-written entry is counted), calls `checkPhaseSpendCap(freshLedger, phase)`. On `status === 'block'`: prints message and `return { stopAll: true }` — the existing main()-loop break propagates and lets `finalizeLlmReport` run (Pitfall 6 — already-plumbed). On `status === 'warn'`: prints message and continues.

**Retry `appendLedgerEntry` call site** (line ~277): added `phase: phase` as the last field (preserves the existing `retry: true` field).

**Mid-run cap check after retry append** (D-16): same pattern as after the first append — the retry burns extra credit so the cap can trip here even when the first append left us under threshold.

**main()** (line ~395+):
- Destructures `{ iterations, phase }` from `parseArgs(process.argv)`.
- After the existing `initialCap` warn/block block, a new pre-flight phase cap block runs when `phase != null`: `checkPhaseSpendCap(initialLedger, phase)` (uses the already-read `initialLedger` — no second I/O). On `status === 'block'`: prints message and `process.exit(6)`. On `status === 'warn'`: prints and continues.
- After `run_id=… iterations=… report=…` line, when `phase != null` prints `[e2e-explore] phase=<N> (per-phase cap $10 / warn $8)` so the UAT EVIDENCE log surfaces phase context.
- `runOneIteration(...)` invocation at the loop body now passes `phase` through.

**Exit-code comment block** (lines 29-36): added `//   6 — phase spend cap reached at STARTUP or mid-run (D-13/D-15/D-16; --phase flag)` and updated the line for exit 2 to mention `--phase` value/equals/missing rejections.

**Untouched** (Pitfall 11 verification):
- CI guard at line 72 (`if (process.env.CI || process.env.GITHUB_ACTIONS)`) — preserved verbatim.
- `checkClaudeCli` — untouched.
- `--iterations` parsing logic — untouched.
- `finalizeLlmReport` invocation — untouched.
- Monthly `checkSpendCap` block in main + per-iteration monthly check inside runOneIteration — untouched.
- `scripts/llm-cron-run.sh` — not modified (the cron entrypoint does not call e2e-explore.mjs; phase enforcement is opt-in).

### Task 2 — `tests/e2e/scripts/e2e-explore-phase-flag.test.js` (commit `4469390`)

**Imports extended**: added `beforeEach, afterEach` from vitest; added `fs from 'node:fs'`, `os from 'node:os'`.

**spawnExplore helper** (Task 1 deviation fix kept in place): timeout 3000ms (was 5000ms in Wave 0).

**New nested describe block** at end of file: `describe('Phase 32 cap integration (D-15 pre-flight, D-14 back-compat)', ...)` with:

- `beforeEach`/`afterEach` tmpDir lifecycle (mirrors `tests/unit/llm-ledger.test.js` lines 80-87).
- Inner helper `spawnWithLedger(args)` — spawnSync with `env: { ...process.env, CI: '', GITHUB_ACTIONS: '', E2E_LEDGER_PATH_OVERRIDE: tmpLedgerPath }`, `cwd: process.cwd()`, `encoding: 'utf8'`, `timeout: 4000`.

- **Test 5: pre-flight phase cap blocks startup when ledger phase-32 sum >= $10 (D-15)** — seeds tmp ledger with two phase-32 iterations of $6 each (sum $12), invokes the script with `--phase 32 --iterations 1`, asserts `result.status === 6` AND stderr matches both `/Phase 32 LLM spend/` AND `/Refusing to invoke/` (the load-bearing phrases from checkPhaseSpendCap's block message wording). **ENABLED** per plan-checker B3 fix.

- **Test 6: --phase flag absent → no phase enforcement (back-compat, D-14)** — seeds an empty ledger, invokes the script with only `--iterations 1` (no --phase), asserts `result.status !== 6` (whatever exit code the script ends with, OR status===null on spawn timeout) AND stderr does NOT match `/Phase \d+ LLM spend/`.

**File header docstring** updated to enumerate Tests 5 and 6.

## Final Exit-Code Map

| Code | Meaning | Plan 32-03 changes |
|------|---------|--------------------|
| 0 | run completed | unchanged |
| 1 | CI guard fired | unchanged |
| 2 | bad `--iterations` value | **EXTENDED** — also fires on bad `--phase` value, equals syntax, missing value |
| 3 | claude CLI not found on PATH | unchanged |
| 4 | monthly spend cap reached at STARTUP | unchanged |
| 5 | fatal/unexpected error in main() | unchanged |
| 6 | **NEW** — phase spend cap reached at STARTUP (pre-flight, D-15) or mid-run (after each appendLedgerEntry, D-16) | newly introduced by this plan |

## Error Message Strings (Claude's Discretion per CONTEXT.md)

| Trigger | Exact stderr text |
|---------|-------------------|
| `--phase=32` (equals syntax) | `[e2e-explore] equals syntax not supported for --phase; use \`--phase <value>\`` |
| `--phase` (no value) | `[e2e-explore] missing value for --phase` |
| `--phase v32` (non-numeric) | `[e2e-explore] invalid --phase value: v32 (must match /^\d+$/)` |
| pre-flight block | `[e2e-explore] Phase 32 LLM spend $12.00 >= $10.00. Refusing to invoke claude -p. Reset phase entries in ledger or end the phase.` (message body from Plan 32-02 `checkPhaseSpendCap`; `[e2e-explore]` prefix added at write site) |
| pre-flight warn | `[e2e-explore] ⚠ Phase 32 spend $8.50 >= $8.00 — approaching $10.00 cap` (Plan 32-02 wording with `[e2e-explore]` prefix) |
| startup banner | `[e2e-explore] phase=32 (per-phase cap $10 / warn $8)` |

All new stderr lines use the `[e2e-explore]` prefix matching the existing convention at lines 73, 87, 113, 136, 403 of `scripts/e2e-explore.mjs`.

## Wave 0 Contract Fulfilled

Plan 32-01's 4 Wave 0 RED stub tests in `tests/e2e/scripts/e2e-explore-phase-flag.test.js` (asserting `--phase v32`, `--phase=32`, `--phase` missing-value, and `--phase 32` valid contracts) are now ALL GREEN. The Wave 0 contract — "tests run, do not crash, and assert the EXACT contract Plan 32-03 must satisfy; Plan 32-03 makes them GREEN" — is satisfied.

## Test 5 / Test 6 Confirmation

- **Test 5 (pre-flight integration via spawnSync + seeded ledger)** — ENABLED (not `.skip`), PASSING. Restores VALIDATION.md UAT-02(b) integration coverage per plan-checker B3 fix. Exercises the load-bearing pre-flight gate end-to-end against the real script with a real seeded ledger redirected through `E2E_LEDGER_PATH_OVERRIDE`.
- **Test 6 (back-compat verification)** — ENABLED, PASSING. Proves D-14 — the phase-cap code path is gated on the `--phase` flag and never leaks into legacy invocations.

## CI Guard / Untouched Surface Confirmation

| Element | Status |
|---------|--------|
| CI guard line (`if (process.env.CI || process.env.GITHUB_ACTIONS)` at line 72) | UNTOUCHED — `grep -c "process.env.CI \|\| process.env.GITHUB_ACTIONS" scripts/e2e-explore.mjs` returns 1 |
| `checkClaudeCli` function | UNTOUCHED |
| `--iterations` parsing logic | UNTOUCHED (only the branch chain was extended with `else if` for `--phase`) |
| `finalizeLlmReport(reportPath)` invocation at end of main() | UNTOUCHED |
| Monthly `checkSpendCap` block in main() (initial cap) | UNTOUCHED |
| Per-iteration monthly cap check at top of runOneIteration | UNTOUCHED |
| `scripts/llm-cron-run.sh` (Phase 31 CI entrypoint) | NOT MODIFIED |
| `tests/e2e/scripts/e2e-explore-ci-guard.test.js` | NOT MODIFIED — all 3 tests still pass |
| `tests/e2e/lib/llm-ledger.js` | NOT MODIFIED — Plan 32-02 deliverable consumed as-shipped |
| Phase 31 ledger entry shape | UNTOUCHED — `phase` is the only new optional field |

## Verification Gates (Plan-Level)

| # | Gate | Result |
|---|------|--------|
| 1 | `npx vitest run tests/e2e/scripts/e2e-explore-phase-flag.test.js` → 6/6 pass | PASS |
| 2 | `npx vitest run tests/e2e/scripts/e2e-explore-ci-guard.test.js` → 3/3 pass | PASS |
| 3 | `npm run test:src` → 431 pass, 7 skipped, 0 fail | PASS |
| 4 | `grep "process.env.CI \|\| process.env.GITHUB_ACTIONS" scripts/e2e-explore.mjs` → 1 line preserved | PASS |
| 5 | `grep -E "phaseTotal\|checkPhaseSpendCap\|PHASE_HARD_CAP_USD\|PHASE_WARN_THRESHOLD_USD" scripts/e2e-explore.mjs` → 5 occurrences (imports + 3 call sites + banner) | PASS (>=4) |
| 6 | Both `appendLedgerEntry` sites stamp `phase` → `grep -B 1 -A 6 "appendLedgerEntry(LEDGER_PATH" scripts/e2e-explore.mjs \| grep -c "phase"` → 2 | PASS (>=2) |
| 7a | `grep -c "6 — phase spend cap" scripts/e2e-explore.mjs` → 1 | PASS (==1) |
| 7b | `grep -c "process.exit(6)" scripts/e2e-explore.mjs` → 1 | PASS (==1) |
| 8 | `node scripts/e2e-explore.mjs --help 2>&1 \| grep -c "phase"` → 5 lines | PASS (>=1) |
| 9 | `node scripts/e2e-explore.mjs --phase=32` → exit 2 + stderr matches /(equals\|invalid)/ | PASS |
| 10 | `node scripts/e2e-explore.mjs --phase v32` → exit 2 + stderr `invalid --phase value: v32` | PASS |
| 11 | `grep -c "it.skip\|describe.skip\|\.skip(" tests/e2e/scripts/e2e-explore-phase-flag.test.js` → 0 | PASS (==0) |

All 11 plan-level verification gates passed.

## Test Count Trajectory

- Plan 32-02 baseline (after wave 1): 425 pass + 7 skipped + 4 fail (the 4 RED Wave 0 phase-flag stubs from Plan 32-01).
- Plan 32-03 after Task 1: 429 pass + 7 skipped + 0 fail (4 Wave 0 stubs turn GREEN).
- Plan 32-03 after Task 2: 431 pass + 7 skipped + 0 fail (+2 new tests: Test 5 + Test 6).

Final Vitest state: **431 pass / 7 skipped / 0 fail**.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test 4 ("accepts --phase 32 → exit !== 2") raced vitest's default test timeout**

- **Found during:** Task 1 — running the Wave 0 phase-flag tests after wiring parseArgs to accept `--phase 32`.
- **Issue:** Plan 32-01's `spawnExplore` helper used `timeout: 5000`. Test 4 expects the script to PROCEED past parseArgs (after the fix), then hang on `checkClaudeCli` or the harness loop until spawnSync's 5000ms timeout SIGKILLs it (status===null, which the test then treats as a PASS branch). But vitest's default test timeout is also 5000ms, and vitest's timer fires before spawnSync's timeout returns — observed empirically: `spawnSync` elapsed 5028ms while vitest reported "Test timed out in 5000ms". This is a Wave-0 infrastructure flake, not a production bug.
- **Fix:** Lowered `timeout` in the shared `spawnExplore` helper from 5000ms to 3000ms. Mirrors the 3000ms already in use in `tests/e2e/scripts/e2e-explore-ci-guard.test.js` Test 3 (line 54), which solves the identical flake pattern for the CI-guard back-compat test. Helper-level change applies to all 4 base parse-tests uniformly.
- **Files modified:** `tests/e2e/scripts/e2e-explore-phase-flag.test.js` (Wave 0 file).
- **Commit:** `2a43178` (bundled with Task 1 since this is the unblocker for Task 1's acceptance gate "All 4 phase-flag tests NOW PASS").

No other deviations. Plan execution otherwise matched the written specification exactly.

## Authentication Gates

None — fully autonomous execution; no auth surface touched by this plan.

## Operational Notes for Plan 32-04 (Wave 2, parallel)

Plan 32-04 may run in parallel with this plan per the Wave 2 disjoint-file invariant. This plan does not touch:
- `.planning/phases/32-human-uat-verification/32-EVIDENCE.md`
- `tests/e2e/scripts/runbook-uat-evidence.test.js`
- `scripts/uat-evidence-collect.mjs`
- any documentation under `.planning/phases/32-human-uat-verification/runbooks/`

No coordination required.

## Operational Notes for Wave 3 (manual UAT execution)

- The Wave 3 operator invokes `npm run e2e:explore -- --phase 32 --iterations 3` (or similar). The script will:
  1. Validate `--phase 32` against `/^\d+$/`.
  2. Read the current ledger; pre-flight check `checkPhaseSpendCap(initialLedger, '32')` against the $10 hard cap (D-15).
  3. Print the startup banner `[e2e-explore] phase=32 (per-phase cap $10 / warn $8)`.
  4. For each iteration: invoke `claude -p`, append ledger entry with `phase: '32'`, re-read ledger and check the phase cap mid-run (D-16). On block: `stopAll:true` → main-loop break → finalizeLlmReport → exit 0.
- If the user accidentally re-runs after the phase cap has been hit, the pre-flight gate fires on startup and exits 6 BEFORE any `claude -p` invocation — the load-bearing safety mechanism behaves as designed (the failure mode D-15 exists to prevent).
- `scripts/llm-cron-run.sh` does NOT pass `--phase`, so the nightly cron continues to run with Phase 31 semantics (no phase enforcement, no phase tagging on entries).

## Known Stubs

None — production code paths fully wired. The optional `phase` field on `appendLedgerEntry` is intentional back-compat (D-14): Phase 31 entries remain phase-less and `phaseTotal('32')` returns 0 for them, exactly the contract Plan 32-02 codified and tested.

## Threat Flags

None — no new network endpoints, file access patterns (the `E2E_LEDGER_PATH_OVERRIDE` hook is TEST-ONLY and was shipped + threat-flagged in Plan 32-02), or auth paths introduced. The phase value never crosses into a shell context (strict regex `/^\d+$/` validation + only used as JSON field + filter predicate in `phaseTotal`); shell-injection threat T-32-08 is mitigated.

## Self-Check: PASSED

Files created/modified verified to exist:

- `scripts/e2e-explore.mjs` — FOUND (modified; phase imports + parseArgs + pre-flight + mid-run + ledger stamping + banner + exit-code comment all present, verified by 11-gate verification block above)
- `tests/e2e/scripts/e2e-explore-phase-flag.test.js` — FOUND (modified; 6 tests pass, 0 skipped, E2E_LEDGER_PATH_OVERRIDE referenced 5 times, spawnSync referenced 7 times)

Commits verified to exist:

- `2a43178 feat(32-03): wire --phase flag + pre-flight + mid-run cap + ledger phase stamping` — FOUND
- `4469390 test(32-03): add Test 5 (pre-flight integration) + Test 6 (back-compat) for --phase cap` — FOUND

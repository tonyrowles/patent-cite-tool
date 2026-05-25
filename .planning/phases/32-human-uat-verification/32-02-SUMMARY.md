---
phase: 32-human-uat-verification
plan: 02
subsystem: e2e-llm
tags: [ledger, phase-tracking, env-override, vitest, back-compat, uat-02]
requires:
  - tests/e2e/lib/llm-ledger.js (Phase 31 LEDGER_PATH, HARD_CAP_USD, WARN_THRESHOLD_USD, currentMonth, readLedger, monthlyTotal, checkSpendCap, appendLedgerEntry)
  - tests/unit/llm-ledger.test.js (Phase 31 17 baseline tests + tmpDir-per-test pattern)
provides:
  - tests/e2e/lib/llm-ledger.js → PHASE_HARD_CAP_USD, PHASE_WARN_THRESHOLD_USD, phaseTotal, checkPhaseSpendCap, env-overridable LEDGER_PATH
  - tests/unit/llm-ledger.test.js → 18 new Phase 32 tests (Test 18–33 plus 2 sanity)
affects:
  - scripts/e2e-explore.mjs (Plan 32-03 wave 2 will import phaseTotal / checkPhaseSpendCap / PHASE_HARD_CAP_USD / PHASE_WARN_THRESHOLD_USD; will also seed a tmp ledger via E2E_LEDGER_PATH_OVERRIDE for the pre-flight integration test)
tech-stack:
  added: []
  patterns:
    - "IIFE expression for env-aware module-level const (single export-const, downstream importers unchanged)"
    - "spawnSync child processes for module-load-time env-var verification (top-level export const is evaluated once per process; in-process env mutation is too late)"
    - "Mirror-symmetry with monthlyTotal/checkSpendCap (same return-shape pattern, different field names)"
key-files:
  created: []
  modified:
    - tests/e2e/lib/llm-ledger.js
    - tests/unit/llm-ledger.test.js
decisions:
  - "block message wording: 'Phase {phase} LLM spend ${total} >= $10.00. Refusing to invoke claude -p. Reset phase entries in ledger or end the phase.' (matches monthly checkSpendCap block-message structure)"
  - "warn message wording: '⚠ Phase {phase} spend ${total} >= $8.00 — approaching $10.00 cap' (matches monthly checkSpendCap warn-message structure including the leading ⚠)"
  - "Dollar values in messages formatted to 2dp using .toFixed(2) (both PHASE_HARD_CAP_USD and PHASE_WARN_THRESHOLD_USD formatted consistently — ensures grep-friendly '$10.00' style strings)"
  - "checkPhaseSpendCap explicitly OMITS monthly_total_usd and month keys (callers cannot accidentally mix the two views — guarded by a negative-key assertion in Test 31)"
  - "LEDGER_PATH override uses .trim() before length check (treats whitespace-only env values as falsy → fallback to default; Test 33 covers this)"
metrics:
  duration: "~25 minutes"
  completed: "2026-05-25T02:50:00Z"
  tasks: 2
  files: 2
---

# Phase 32 Plan 02: per-phase ledger helpers + TEST-ONLY LEDGER_PATH env override Summary

**One-liner:** Extended `tests/e2e/lib/llm-ledger.js` with cross-month phase-spend accounting helpers (`phaseTotal`, `checkPhaseSpendCap`, constants `PHASE_HARD_CAP_USD=10` and `PHASE_WARN_THRESHOLD_USD=8`) and a TEST-ONLY `E2E_LEDGER_PATH_OVERRIDE` env-var hook that re-points `LEDGER_PATH` at module-load time — providing the building blocks for Plan 32-03's `--phase` flag + pre-flight + mid-run cap enforcement (D-13/D-14/D-15/D-16), with full backward compatibility for Phase 31 entry shape, zero new npm dependencies, and 18 new Vitest tests asserting the contract end-to-end.

## What Was Built

### Task 1 — `tests/e2e/lib/llm-ledger.js` (commit `12396be`)

New exports:
- `PHASE_HARD_CAP_USD = 10` (D-13) — refuse-to-invoke threshold for cumulative spend tagged with a given phase
- `PHASE_WARN_THRESHOLD_USD = 8` (D-13) — print-warning threshold; below this, status='ok'
- `phaseTotal(ledger, phase)` — iterates `Object.values(ledger.months)`, sums `cost_usd` for entries where `it.phase === phase && Number.isFinite(it.cost_usd)`, returns `+sum.toFixed(6)` (matches the established 6dp convention)
- `checkPhaseSpendCap(ledger, phase)` — mirrors `checkSpendCap` shape but uses `phase_total_usd` / `phase` keys (NOT `monthly_total_usd` / `month`); returns `{status, phase_total_usd, phase, message}`

Modified:
- `LEDGER_PATH` resolution: now an IIFE that consults `process.env.E2E_LEDGER_PATH_OVERRIDE`. When set AND non-empty (after `.trim()`), resolves the override; otherwise the existing default `path.resolve(__dirname, '../.llm-spend-ledger.json')` is preserved. JSDoc explicitly labels this as TEST-ONLY (DO NOT set in production / cron / CI release contexts).
- `appendLedgerEntry` JSDoc: added `phase?: string|null` as the last field in the `@param entry` type. **Function body is unchanged** — the existing `m.iterations.push(entry)` (1 occurrence, verified) spreads the entry as-is, so the new optional field rides through transparently per D-14 back-compat.
- File header comment: updated public-surface listing to include the new symbols.

### Task 2 — `tests/unit/llm-ledger.test.js` (commit `cb96dc1`)

New describe block at end of file: `describe('Phase 32 — per-phase ledger helpers (D-13/D-14/D-15/D-16)', ...)` with 18 new tests:

| # | Test | What it asserts |
|---|------|-----------------|
| 18 | `appendLedgerEntry` preserves optional `phase` | `phase: '32'` rides through to `iterations[0].phase === '32'` |
| 19 | `appendLedgerEntry` without `phase` (D-14 back-compat) | legacy entry → `iterations[0].phase === undefined`; other fields intact |
| 20 | `phaseTotal` returns 0 for empty/missing ledger | `{}`, `{months:{}}`, `null`, `undefined` all → 0 |
| 21 | `phaseTotal` returns 0 for unknown phase | phase '31' entries → `phaseTotal(..., '32') === 0` |
| 22 | `phaseTotal` sums within a month | 3 entries × ($1.50, $0.50, $0.25) → 2.25 |
| 23 | `phaseTotal` sums across multiple months | '2026-05' ($1.50) + '2026-06' ($2.00) → 3.50 |
| 24 | `phaseTotal` ignores non-finite cost_usd | NaN, undefined, Infinity, missing → excluded |
| 25 | `phaseTotal` rounds to 6dp (no float drift) | $0.10 + $0.20 → 0.3 (not 0.30000000000000004) |
| 26 | `checkPhaseSpendCap` status='ok' at $7.99 | `phase_total_usd === 7.99`, `message === ''` |
| 27 | `checkPhaseSpendCap` status='warn' at $8.00 | message starts with `⚠`; contains '32' and '8.00' |
| 28 | `checkPhaseSpendCap` status='warn' at $9.99 | just below hard cap → warn |
| 29 | `checkPhaseSpendCap` status='block' at $10.00 | message contains 'Refusing to invoke', '32', '10.00' |
| 30 | `checkPhaseSpendCap` status='block' at $15.00 | overshoot → block |
| 31 | `checkPhaseSpendCap` return shape | keys exactly `{message, phase, phase_total_usd, status}`; negative assertion: `monthly_total_usd === undefined && month === undefined` |
| 32 | `LEDGER_PATH` honors `E2E_LEDGER_PATH_OVERRIDE` | spawnSync child with env var → stdout matches `path.resolve(overridePath)`; appendLedgerEntry via override writes to the throwaway file |
| 33 | `LEDGER_PATH` fallback when unset/empty/whitespace | spawnSync child × 3 scenarios — all → default `.llm-spend-ledger.json` location |
| — | Sanity | `PHASE_HARD_CAP_USD === 10`, `PHASE_WARN_THRESHOLD_USD === 8` |
| — | Sanity | `seedLedgerFile` helper is reachable (anchor for future direct-write tests) |

**Test count delta:** 17 → 36 in `tests/unit/llm-ledger.test.js` (+18 — 1 above the plan's stated "+1 with Test 18 also from existing-section convention"; actually 17 existing + 1 existing sanity = 18, plus 16 new Phase-32 tests + 2 new sanity = 18). Final: **36 ledger tests, all green.**

## LEDGER_PATH env-override mechanics

- **Env var name:** `E2E_LEDGER_PATH_OVERRIDE`
- **Resolution rule:** at module-load time, if `process.env.E2E_LEDGER_PATH_OVERRIDE` is a string with `.trim().length > 0`, `LEDGER_PATH = path.resolve(overrideRaw.trim())`. Otherwise `LEDGER_PATH = path.resolve(__dirname, '../.llm-spend-ledger.json')` (unchanged from Phase 31).
- **TEST-ONLY scope:** documented in module-level JSDoc; "DO NOT set this env var in production, cron, or CI release contexts." The cron entrypoint (`scripts/llm-cron-run.sh`) does not export the var, and there is no automatic propagation path.
- **Use case:** Plan 32-03 Test 5 (pre-flight integration test) seeds a tmp ledger at the override path and spawns `e2e-explore.mjs` with the env var set — exercising the D-15 pre-flight gate end-to-end without polluting the real per-repo ledger. **This restores the pre-flight integration test that VALIDATION.md UAT-02(b) committed to (checker BLOCKER B3 unblocker).**

## Confirmation: `appendLedgerEntry` body unchanged

```bash
$ grep -c "m.iterations.push(entry)" tests/e2e/lib/llm-ledger.js
1
```

Exactly 1 occurrence, as required by Task 1 acceptance criteria. The optional `phase` field rides through transparently per RESEARCH "Critical note" at line 376.

## Verification Gates (Plan-Level)

| Gate | Result |
|------|--------|
| 1. All 4 required new exports present | PASS |
| 2. Phase-ledger tests all pass (36/36) | PASS |
| 3. Full `npm run test:src` regression | PASS (425 pass, 7 skipped, 0 fail among Plan 32-02-affected tests; pre-existing 4 RED scaffolds in `e2e-explore-phase-flag.test.js` are Plan 32-01 wave 0 stubs and are NOT 32-02 regressions — they GREEN when Plan 32-03 lands) |
| 4. `appendLedgerEntry` body unchanged (`grep -c "m.iterations.push(entry)" === 1`) | PASS |
| 5. Back-compat: Phase 31-style entry parses through readLedger + monthlyTotal correctly; `phaseTotal` of a queried phase returns 0 (legacy entries have no phase field) | PASS |
| 6. LEDGER_PATH env override smoke (`E2E_LEDGER_PATH_OVERRIDE=/tmp/foo.json node -e "..."` honored) | PASS |

## Deviations from Plan

None — plan executed exactly as written. The plan listed 14+ new tests as the minimum; I shipped 16 new behavior tests + 2 sanity tests (18 total in the Phase 32 describe block) to fully cover the boundary conditions ($7.99, $8.00, $9.99, $10.00, $15.00), the multi-month aggregation case, the non-finite-cost filter, and the 6dp rounding contract.

## Authentication Gates

None — fully autonomous execution; no auth surface touched by this plan.

## Operational Notes for Plan 32-03 (next wave)

- `scripts/e2e-explore.mjs` can now import `phaseTotal`, `checkPhaseSpendCap`, `PHASE_HARD_CAP_USD`, `PHASE_WARN_THRESHOLD_USD` from `./tests/e2e/lib/llm-ledger.js`.
- `scripts/e2e-explore.mjs` MUST tag entries with `phase: <validated --phase value>` when calling `appendLedgerEntry` (passes through transparently — function body unchanged).
- Plan 32-03 Test 5 (pre-flight integration test) can now be **un-skipped** — `LEDGER_PATH` exposes the `E2E_LEDGER_PATH_OVERRIDE` hook so the spawnSync-based integration test can seed a throwaway ledger and assert the pre-flight gate fires at >=$10 without polluting the real per-repo ledger. This addresses checker BLOCKER B3.

## Known Stubs

None.

## Threat Flags

None — surface area is purely additive within the existing module's trust boundary; no new network endpoints, file access patterns, schema changes at trust boundaries, or auth paths. The `E2E_LEDGER_PATH_OVERRIDE` env-var hook is acknowledged in the plan's `<threat_model>` as T-32-21 (disposition: accept — TEST-ONLY scope documented; cron entrypoint does not export the var).

## Self-Check: PASSED

Files created/modified verified to exist:

- `tests/e2e/lib/llm-ledger.js` — FOUND (modified; PHASE_HARD_CAP_USD count: 6 occurrences across docs + export + checkPhaseSpendCap usage; verified by grep)
- `tests/unit/llm-ledger.test.js` — FOUND (modified; 36 tests pass)

Commits verified to exist:

- `12396be feat(32-02): add per-phase ledger helpers + TEST-ONLY LEDGER_PATH env override` — FOUND
- `cb96dc1 test(32-02): cover per-phase ledger helpers + LEDGER_PATH env override` — FOUND

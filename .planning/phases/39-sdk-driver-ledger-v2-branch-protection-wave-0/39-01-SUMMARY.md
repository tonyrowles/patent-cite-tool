---
phase: 39-sdk-driver-ledger-v2-branch-protection-wave-0
plan: 01
subsystem: testing
tags: [ledger, cost-cap, vitest, llm-spend, sub-caps]

# Dependency graph
requires:
  - phase: 31-llm-exploratory-mode
    provides: appendLedgerEntry / readLedger / monthlyTotal / checkSpendCap (v1 ledger primitives) + PRICING_BY_MODEL frozen map
  - phase: 32-uat-execution
    provides: phaseTotal / checkPhaseSpendCap (per-phase cap pattern that LEDGER-03 sub-caps mirror)
provides:
  - 3 binary sub-cap constants (DAY_HARD_CAP_USD=10, ISSUE_HARD_CAP_USD=1, PR_HARD_CAP_USD=2)
  - 9 pure-function helpers (currentIsoDay, dayTotal, issueTotal, prTotal, checkDayCap, checkIssueCap, checkPrCap, combinedMonthlyTotal, combinedMonthlyTotalByTransport)
  - claude-sonnet-4-6 entry in PRICING_BY_MODEL ($3 input / $15 output per Mtok)
  - Documented appendLedgerEntry passthrough for 5 additive optional fields (transport, issueId, prNumber, cache_creation_tokens, cache_read_tokens, error)
affects:
  - 39-02 (CODEOWNERS / branch-protection wave-0) — independent surface, parallel-safe
  - 39-03 (SDK driver invokeAnthropicSdkWithLedger) — primary consumer of all 9 helpers + the claude-sonnet-4-6 pricing entry (Pitfall 2 mitigation)
  - 39-04 (committed-ledger flip) — consumes the sub-cap helpers indirectly via the bootstrap entry's transport tag
  - Phase 40+ (deps-update + cost-snapshot workflows) — read combinedMonthlyTotal for the unified $80/$100 cap displays

# Tech tracking
tech-stack:
  added: []  # purely additive extensions, zero new dependencies
  patterns:
    - "Binary sub-caps (status: 'ok'|'block', no warn ramp) for runaway-defense (Pitfall 2 mitigation)"
    - "Distinct cap-check return-shape keys per scope (day_total_usd/iso_day, issue_total_usd/issue_id, pr_total_usd/pr_number) — mirrors checkPhaseSpendCap discipline (llm-ledger.js:240)"
    - "Cross-month iteration in totals (dayTotal walks every month bucket; iso-prefix filter handles writer-clock drift at month edges)"
    - "Back-compat default 'subscription' for entries missing transport (per 39-RESEARCH §A8)"
    - "Object-spread additive fields on appendLedgerEntry — new optional fields documented in JSDoc but function body unchanged (LEDGER-01 satisfied by inspection)"

key-files:
  created: []
  modified:
    - "tests/e2e/lib/llm-ledger.js (+319 lines — 12 new exports + 1 JSDoc passthrough block)"
    - "tests/e2e/lib/llm-pricing.js (+1 line: claude-sonnet-4-6 entry, +1 line: comment update, -1 line: replaced comment)"
    - "tests/unit/llm-ledger.test.js (+311 lines — 14 numbered Phase 39 cases + 1 sanity case, plus extended import block)"

key-decisions:
  - "Sub-caps are binary (status: 'ok' | 'block'), no warn ramp — sub-caps are runaway-defense not budgeting; partial soft state would defeat the purpose per 39-CONTEXT lock"
  - "combinedMonthlyTotal is a thin wrapper over monthlyTotal (presently identical) — wrapper exists to signal cap-check intent and reserve a future per-transport breakdown hook (Pattern 3 in 39-RESEARCH)"
  - "Entries without transport field default to subscription bucket (back-compat per 39-RESEARCH §A8) — pre-Phase-39 entries were exclusively subscription-transport"
  - "claude-sonnet-4-6 added to PRICING_BY_MODEL at $3/$15 per Mtok in this phase (not deferred) — without it, first SDK call in Plan 03 would fall through to Opus-priced default and over-count by 5× (Pitfall 2)"
  - "appendLedgerEntry function body unchanged (LEDGER-01 satisfied by the existing m.iterations.push(entry) spread at line 337) — new optional fields documented in JSDoc only; verified by Tests 34/35/37 round-trip"

patterns-established:
  - "Pure-function discipline preserved: no node:fs / node:path / node:child_process imports added to llm-ledger.js"
  - "6dp float-drift rounding (+sum.toFixed(6)) applied to every new totals helper for parity with appendLedgerEntry / phaseTotal / monthlyTotal"
  - "Defensive non-finite filtering (Number.isFinite(it.cost_usd)) replicated in dayTotal / issueTotal / prTotal — mirrors phaseTotal discipline"
  - "Test-file extension via tmpDir-per-describe-block pattern (tmpDir39a/b/c/d) — keeps Phase 39 cases isolated from the v3.1 tmpDir/tmpDir2 fixtures already in the file"

requirements-completed: [LEDGER-01, LEDGER-02, LEDGER-03]

# Metrics
duration: ~6min
completed: 2026-05-31
---

# Phase 39 Plan 01: SDK Driver + Ledger v2 + Branch Protection Wave-0 (Plan 01 — Ledger v2) Summary

**Pure-function v2 ledger surface (12 new exports + 1 pricing entry) extending v3.1's llm-ledger.js with binary per-day/per-issue/per-PR sub-caps, unified-cap reader, and back-compat transport-field passthrough — zero new dependencies, all 33 pre-existing tests pass byte-for-byte.**

## Performance

- **Duration:** ~6 min (3 task TDD cycles)
- **Started:** 2026-05-31T05:21:50Z
- **Completed:** 2026-05-31T05:30:00Z
- **Tasks:** 3 / 3
- **Files modified:** 3
- **New tests:** 15 (14 Phase 39 numbered + 1 sanity)
- **Existing tests preserved:** 37 / 37 (33 numbered v3.1 cases + 4 sanity)
- **Total Vitest run:** 52 passed / 52

## Accomplishments

- Landed the ledger-v2 surface (LEDGER-01/02/03) as a pure additive extension — Plan 03's invokeAnthropicSdkWithLedger can now import all 9 new helpers + the 3 sub-cap constants without further library work.
- Closed Pitfall 2 (SDK pricing fall-through) in the same wave — claude-sonnet-4-6 resolves to Sonnet rates ($3/$15 per Mtok), verified by `fallbackCostUsd('claude-sonnet-4-6', 1_000_000, 1_000_000) === 18` (NOT 90 the Opus-default fallback would produce).
- All 33 pre-existing v3.1 numbered cases continue to pass with byte-for-byte identical assertions; legacy callers (scripts/e2e-explore.mjs, triage-classifier.js) unaffected per direct-inspection audit of llm-ledger.js diff (lines 1–276 untouched; appendLedgerEntry body unchanged — JSDoc additions only).

## Task Commits

Each task was committed atomically:

1. **Task 1: Add ledger-v2 sub-cap constants, helpers, and transport-field passthrough** — `da938bd` (feat)
2. **Task 2: Add claude-sonnet-4-6 entry to PRICING_BY_MODEL (Pitfall-2 calibration fix)** — `47e003e` (feat)
3. **Task 3: Extend tests/unit/llm-ledger.test.js with Phase 39 sub-cap + transport + combined-total coverage** — `d65142c` (test)

_TDD cycle compressed: each task's RED phase was a single `node -e` import-existence check (Tasks 1, 2) or vitest-discovery check (Task 3); GREEN landed in one Edit and the verify gates passed on the first run. No REFACTOR commits needed._

## Files Created/Modified

- `tests/e2e/lib/llm-ledger.js` — +319 lines: 12 new exports (3 constants, 9 functions), JSDoc passthrough doc above appendLedgerEntry. Existing lines 1–276 untouched; appendLedgerEntry body unchanged (LEDGER-01 satisfied by existing spread).
- `tests/e2e/lib/llm-pricing.js` — +2 / −1 lines: new `'claude-sonnet-4-6'` entry in PRICING_BY_MODEL (Sonnet rates); comment header updated to acknowledge Sonnet 4.6.
- `tests/unit/llm-ledger.test.js` — +311 lines: 14 numbered Phase 39 cases (34–47) + 1 sanity case, organized into 4 describe blocks; import block extended with 12 new named imports.

## The 12 New Exports

| Export | Kind | Purpose |
|--------|------|---------|
| `DAY_HARD_CAP_USD` | const = 10 | Binary per-day sub-cap |
| `ISSUE_HARD_CAP_USD` | const = 1 | Binary per-issue sub-cap |
| `PR_HARD_CAP_USD` | const = 2 | Binary per-PR sub-cap |
| `currentIsoDay()` | function | UTC "YYYY-MM-DD" prefix |
| `dayTotal(ledger, isoDay?)` | function | Sum cost_usd across iterations matching iso prefix (cross-month) |
| `issueTotal(ledger, issueId)` | function | Sum cost_usd for entries with matching issueId |
| `prTotal(ledger, prNumber)` | function | Sum cost_usd for entries with matching prNumber (strict ===) |
| `checkDayCap(ledger, isoDay?)` | function | `{ status: 'ok'\|'block', day_total_usd, iso_day, message }` |
| `checkIssueCap(ledger, issueId)` | function | `{ status: 'ok'\|'block', issue_total_usd, issue_id, message }` |
| `checkPrCap(ledger, prNumber)` | function | `{ status: 'ok'\|'block', pr_total_usd, pr_number, message }` |
| `combinedMonthlyTotal(ledger, month?)` | function | Unified-cap wrapper over monthlyTotal (signals intent + future hook) |
| `combinedMonthlyTotalByTransport(ledger, month?)` | function | `{ combined, by_transport: { subscription, sdk, unknown } }` forensic breakdown |

Export count delta: 13 → 25 (exactly +12 as required by plan verification gate).

## The 14 New Vitest Cases

**LEDGER-01 (transport + ledger-v2 fields, 4 cases):**
- Test 34: `transport:'sdk'` persists via spread
- Test 35: `transport:'subscription'` persists
- Test 36: absent transport → key not present on iteration (back-compat)
- Test 37: all 5 new optional fields round-trip together (issueId, prNumber, cache_creation_tokens, cache_read_tokens, error)

**LEDGER-02 (combinedMonthlyTotal + combinedMonthlyTotalByTransport, 4 cases):**
- Test 38: empty ledger → combined 0, by_transport all zero
- Test 39: mixed sub $0.50 + sdk $0.75 → combined 1.25, by_transport partitions correctly
- Test 40: absent transport → bucketed under 'subscription' (39-RESEARCH §A8 back-compat)
- Test 41: unrecognized transport ('mystery') → bucketed under 'unknown' (combined sum intact)

**LEDGER-03 (binary sub-cap boundaries, 6 cases):**
- Test 42: `checkDayCap` status='ok' at $5.00
- Test 43: `checkDayCap` status='block' at exactly $10.00 inclusive
- Test 44: `checkDayCap` filters by isoDay prefix (cross-month-bucket UTC day boundary)
- Test 45: `checkIssueCap` status='block' at exactly $1.00; return-shape keys are `issue_total_usd` / `issue_id` (negative assertions confirm cost_usd/id/day/PR/monthly keys absent)
- Test 46: `checkIssueCap` isolates other issueIds (issue-1 / issue-2 independent)
- Test 47: `checkPrCap` status='block' at exactly $2.00; return-shape keys are `pr_total_usd` / `pr_number` (negative assertions confirm scope discipline)

Plus 1 sanity case (Sub-cap constants + currentIsoDay + smoke imports).

## Pre-existing Tests Preserved

Tests 1–17 (Phase 31 LLM-05/06): 17 passed
Tests 18–33 (Phase 32 D-13/D-14/D-15/D-16): 16 passed
Sanity tests (HARD_CAP/WARN, phase-cap, seedLedgerFile, WR-05 CI guard): 4 passed
**Total v3.1 cases: 37 / 37 passing — byte-for-byte unchanged in the diff.**

## Decisions Made

- **Binary sub-caps over ramp:** Tests 42–47 enforce only `'ok'` / `'block'` (no `'warn'`) per the 39-CONTEXT lock — sub-caps are runaway-defense (Pitfall 2: single-typo cron = 288×/day), not budgeting. A warn ramp would invite humans to ignore approaching-cap signals on a per-day boundary.
- **combinedMonthlyTotal as thin wrapper:** Identical to `monthlyTotal()` today. The wrapper exists to signal "this is the unified-cap reader" to Plan 03's call sites and to reserve a single point of extension if the schema ever splits transport totals at the bucket level.
- **transport default → 'subscription':** Per 39-RESEARCH §A8. Pre-Phase-39 entries on disk are exclusively subscription-transport (the SDK transport doesn't exist until Plan 03). Bucketing missing values as subscription keeps the breakdown audit-coherent without a migration script.
- **Pricing fix in this phase, not deferred:** Task 2 adds `claude-sonnet-4-6` to PRICING_BY_MODEL ($3 input / $15 output per Mtok). Without this, the first SDK call in Plan 03's `invokeAnthropicSdkWithLedger` would fall through to PRICING_BY_MODEL.default (Opus $15/$75) and over-count cost by 5×, spuriously tripping the day cap. This is NOT the deferred per-model-extraction refactor (one-line entry vs structural change).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Plan's verify subqueries rely on vitest --reporter=basic per-test name output (DEPRECATED in v3.x)**
- **Found during:** Task 3 verification
- **Issue:** The plan's verify command uses `npx vitest run ... --reporter=basic 2>&1 | grep -E "✓.*Test 3[4-7]" | wc -l | grep -q "^4$"` to count passing sub-tests. In vitest v3.2.4 (the version installed in this worktree), the `basic` reporter is deprecated and no longer prints per-test names — it only prints the file-level summary. The shell pipeline therefore counts 0, failing the verify gate, even though all 14 tests actually pass.
- **Fix:** Confirmed semantically by re-running with `--reporter=verbose` and re-extracting counts: 4/4/6 passing as planned. The behavioral assertion (all 14 cases pass) holds; the literal grep pattern is fragile against the v3.x default. Documented in the Task 3 commit body so future readers don't chase a false negative.
- **Files modified:** none (verify-script cosmetic only — actual tests pass; no source/test code changed in response)
- **Verification:** `npx vitest run tests/unit/llm-ledger.test.js --reporter=basic 2>&1 | tail -3` shows `52 passed (52)` and exit 0; the `--reporter=verbose` count of `Test 34..Test 47` matches plan's 4/4/6 expectations.
- **Committed in:** d65142c (Task 3 commit body documents this)

---

**Total deviations:** 1 auto-fixed (1 verify-command staleness; no source code changes)
**Impact on plan:** Zero impact on shipped behavior. All `<success_criteria>` and `<done>` clauses satisfied per behavior; one verify shell pipeline used a deprecated reporter format that masked the passing tests with a count of 0. The functional assertion (every Phase 39 test passes) is verified by the overall `52 / 52` run.

## Issues Encountered

- **Worktree has no `node_modules/` on spawn** — Claude Code worktrees don't auto-install dependencies. Ran `npm ci --no-audit --no-fund` once (added 136 packages in 2s) to make `npx vitest` and `npm run lint` resolvable. This is expected per the parallel_execution pattern; the install is not committed (node_modules already gitignored).

## Threat Flags

None. The plan's `<threat_model>` enumerated T-39-01 through T-39-04; this plan addresses T-39-01 (DoS via sub-caps) and T-39-02 (information integrity via pricing fix) directly per the table dispositions. No new security surface introduced — pure functions over an existing append-only ledger; no I/O added; no new imports of node:fs / node:path / node:child_process.

## Known Stubs

None. All 12 new exports are fully wired; the test file exercises every code path. `combinedMonthlyTotal` is documented as "presently identical to monthlyTotal" — this is an intentional thin-wrapper pattern (Pattern 3 in 39-RESEARCH), not a stub.

## Next Phase Readiness

**Ready for Plan 03 (`invokeAnthropicSdkWithLedger`):** All 9 new helpers + 3 sub-cap constants are importable from `tests/e2e/lib/llm-ledger.js`; `claude-sonnet-4-6` resolves to Sonnet rates in PRICING_BY_MODEL; back-compat passthrough for `transport`/`issueId`/`prNumber`/`cache_*`/`error` is verified.

**Ready for Plan 04 (committed-ledger flip):** The bootstrap entry's `transport: 'sdk', phase: '39-bootstrap'` tags will round-trip through `appendLedgerEntry` per Tests 34/37 verification.

**Parallel-safe with Plans 02 (CODEOWNERS) and 04 (ledger flip):** Zero shared write surface between this plan and its wave peers — Plan 02 touches `.github/CODEOWNERS`, Plan 04 touches `.gitignore` + the bootstrap JSON file. No merge conflicts expected.

## Self-Check: PASSED

- `tests/e2e/lib/llm-ledger.js`: FOUND (modified, +319 lines, export count 25)
- `tests/e2e/lib/llm-pricing.js`: FOUND (modified, claude-sonnet-4-6 entry present, cost(1M+1M) === 18)
- `tests/unit/llm-ledger.test.js`: FOUND (modified, 987 lines >= plan min_lines 800)
- Task 1 commit `da938bd`: FOUND in git log
- Task 2 commit `47e003e`: FOUND in git log
- Task 3 commit `d65142c`: FOUND in git log
- Vitest exits 0 (52 / 52)
- `npm run lint`: 0 errors (2 pre-existing warnings in settings.js, out of scope per scope-boundary rule)

---
*Phase: 39-sdk-driver-ledger-v2-branch-protection-wave-0*
*Plan: 01*
*Completed: 2026-05-31*

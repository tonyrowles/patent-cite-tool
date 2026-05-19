---
phase: 31-llm-exploratory-mode-+-docs
plan: 01
subsystem: testing
tags: [llm, claude-cli, spend-ledger, error-codes, ci-guard, vitest, esm]

# Dependency graph
requires:
  - phase: 28-independent-pdf-verifier
    provides: report.js read-modify-write pattern; ERROR_CLASSES taxonomy that Plan 31-01 extends
  - phase: 30-worker-fault-injection
    provides: WORKER_FALLBACK_FAILED — confirms append-to-frozen-array migration approach
provides:
  - Extended RPT-02 taxonomy (LLM_HALLUCINATED_SELECTION + LLM_API_ERROR)
  - Spend ledger module (read/write/cap-check) with $80 warn / $100 block thresholds
  - Pricing rate-card module (fallback only — total_cost_usd is canonical)
  - CI-guarded driver scaffold (scripts/e2e-explore.mjs) ready for Plan 31-02
  - 28 new unit/integration tests (7 taxonomy + 18 ledger + 3 CI guard)
  - Ledger file path .gitignored (must NOT be committed — leaks spend pattern)
  - npm run e2e:explore script entry point
affects:
  - 31-02 (full driver wiring; consumes ledger + error-codes + scaffold)
  - 31-03 (hallucination/report unit tests — extends this plan's pattern)
  - 31-04 (README documenting both modes)

# Tech tracking
tech-stack:
  added: [node:child_process spawnSync for hermetic CLI integration tests]
  patterns:
    - Spend ledger mirrors report.js (single-process read-modify-write, no file locking)
    - Defense-in-depth CI guard (both CI and GITHUB_ACTIONS checked)
    - Hermetic threshold tests pass explicit month argument (no Date stubbing)
    - 6-decimal-place rounding on float-aggregated USD totals
    - Closed-enum taxonomy extension via append (preserves prior indices)

key-files:
  created:
    - tests/e2e/lib/llm-ledger.js
    - tests/e2e/lib/llm-pricing.js
    - tests/unit/llm-ledger.test.js
    - tests/unit/error-codes.test.js
    - tests/unit/fixtures/sample-ledger-empty.json
    - tests/unit/fixtures/sample-ledger-warning.json
    - tests/unit/fixtures/sample-ledger-at-cap.json
    - tests/e2e/scripts/e2e-explore-ci-guard.test.js
    - scripts/e2e-explore.mjs
  modified:
    - tests/e2e/lib/error-codes.js
    - tests/unit/report.test.js
    - .gitignore
    - package.json

key-decisions:
  - "LLM_HALLUCINATED_SELECTION + LLM_API_ERROR appended at indices 9-10 (preserves Phase 28 by_error_class compatibility)"
  - "Thresholds locked: WARN_THRESHOLD_USD=80, HARD_CAP_USD=100 (>= comparison; exactly $80 triggers warn, exactly $100 triggers block)"
  - "PRICING_BY_MODEL fallback-only — total_cost_usd from claude -p response is canonical (per RESEARCH.md Pattern 2 + Pitfall 6)"
  - "CI guard checks BOTH process.env.CI AND process.env.GITHUB_ACTIONS (defense-in-depth, mitigates threat T-31-2)"
  - "Ledger float arithmetic rounded to 6dp via +(a+b).toFixed(6) to prevent drift across many small additions"
  - "Hermetic threshold tests pass explicit month argument; production callers default to currentMonth()"
  - "Re-export PRICING_BY_MODEL from llm-ledger.js (instead of eslint-disable on unused import) — makes module relationship explicit at graph level"

patterns-established:
  - "Single-process ledger: pattern mirrors Phase 28 report.js — read-modify-write whole-file, no locking, gitignored"
  - "Defense-in-depth env guards: check multiple env vars when one alone is insufficient (CI guard pattern)"
  - "Hermetic time-sensitive tests: optional second argument for month/date allows fixtures to lock to a calendar value while production code defaults to now()"

requirements-completed: [LLM-04, LLM-05, LLM-06, LLM-07]

# Metrics
duration: ~12min
completed: 2026-05-18
---

# Phase 31 Plan 01: LLM-Mode Foundation Summary

**Failure taxonomy extension + $80/$100 spend ledger + CI-guarded driver scaffold — foundation for the exploratory-mode runner without invoking claude -p yet.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-05-18T14:40:00Z
- **Completed:** 2026-05-18T14:47:00Z
- **Tasks:** 3 (all TDD: RED → GREEN cycles)
- **Files created:** 9 (3 lib, 2 unit test, 1 integration test, 3 fixtures, 1 script)
- **Files modified:** 4 (error-codes.js, report.test.js, .gitignore, package.json)
- **Tests added:** 28 (7 taxonomy + 18 ledger + 3 CI guard)

## Accomplishments

- **LLM-04 — RPT-02 taxonomy extended (frozen 11-entry array).** `LLM_HALLUCINATED_SELECTION` and `LLM_API_ERROR` appended at indices 9-10. Distinct error classes mean future "the LLM picks bad selections" trends cannot be misattributed to the plugin, and `LLM_API_ERROR` captures the full bouquet of claude-CLI failures (timeout, JSON parse, is_error:true, CLI missing).
- **LLM-05 — Spend ledger module with monthly rollover.** `tests/e2e/lib/llm-ledger.js` exposes `readLedger`, `currentMonth`, `monthlyTotal`, `checkSpendCap`, `appendLedgerEntry`. Crash-safe whole-file writes; appending a new month does NOT touch prior months; 6-decimal rounding on aggregated totals.
- **LLM-06 — Hard $100 / warn $80 thresholds enforced.** `checkSpendCap()` returns `{ status: 'ok' | 'warn' | 'block', monthly_total_usd, month, message }`. The driver's `precheckSpendCap()` exits with code 4 on `block`, prints message on `warn`, and silently passes on `ok`.
- **LLM-07 — CI guard with defense-in-depth.** `scripts/e2e-explore.mjs` exits 1 with `"exploratory mode is local-only"` in stderr when either `CI` or `GITHUB_ACTIONS` is truthy.
- **Scaffold ready for Plan 31-02.** `--iterations N` parser, `--help`/`-h`, claude CLI version check, ledger pre-check, and an iteration loop placeholder (`runOneIteration` throws `NOT_YET_IMPLEMENTED` until Plan 31-02 Task 2).
- **`tests/e2e/.llm-spend-ledger.json` is gitignored** — committing it would leak the developer's monthly spend pattern (threat T-31-3 mitigated).
- **No regressions in Phase 28's `report.test.js`.** Two stale assertions (Test 6 referenced `LLM_HALLUCINATED_SELECTION` as a hypothetical future code, and Test 11 hardcoded length 8) were updated to reflect the new taxonomy — see Deviations.

## Task Commits

Each task followed TDD (RED → GREEN). Commits in chronological order:

1. **Task 1 RED**: `8ececec` (test) — add failing taxonomy test
2. **Task 1 GREEN**: `a763604` (feat) — extend ERROR_CLASSES + back-compat fix in report.test.js
3. **Task 2 RED**: `dfcde80` (test) — add failing ledger tests + 3 fixtures
4. **Task 2 GREEN**: `54930e0` (feat) — implement llm-pricing.js + llm-ledger.js
5. **Task 3 RED**: `982e5e9` (test) — add failing CI guard integration tests
6. **Task 3 GREEN**: `3e18484` (feat) — scaffold scripts/e2e-explore.mjs + .gitignore + package.json + ledger re-export cleanup

## Files Created/Modified

### Created

- `tests/e2e/lib/llm-ledger.js` — spend ledger reader/writer with $80/$100 thresholds (mirrors report.js pattern)
- `tests/e2e/lib/llm-pricing.js` — frozen `PRICING_BY_MODEL` rate-card + `fallbackCostUsd()` (fallback only)
- `tests/unit/error-codes.test.js` — 7 tests for the extended taxonomy
- `tests/unit/llm-ledger.test.js` — 18 tests (read missing/corrupt, threshold tiers, monthly rollover, float-drift guard, fresh-file init)
- `tests/unit/fixtures/sample-ledger-empty.json` — empty ledger fixture
- `tests/unit/fixtures/sample-ledger-warning.json` — $85 current month + $99.50 prior month (cross-month independence proof)
- `tests/unit/fixtures/sample-ledger-at-cap.json` — $100 cap-trigger fixture
- `tests/e2e/scripts/e2e-explore-ci-guard.test.js` — 3 integration tests spawning the real script via `spawnSync`
- `scripts/e2e-explore.mjs` — driver scaffold: CI guard + arg parser + claude CLI check + spend cap pre-check + `NOT_YET_IMPLEMENTED` iteration loop

### Modified

- `tests/e2e/lib/error-codes.js` — added `LLM_HALLUCINATED_SELECTION` + `LLM_API_ERROR` exports; appended both to `ERROR_CLASSES` (now length 11); top-of-file docblock updated
- `tests/unit/report.test.js` — Test 6 now uses `FUTURE_UNCLASSIFIED_FAILURE_MODE_v999` (since `LLM_HALLUCINATED_SELECTION` is now in-taxonomy); Test 11 updated to assert length 11 with the two new codes (deviation Rule 3)
- `.gitignore` — added `tests/e2e/.llm-spend-ledger.json` and `tests/e2e/.spec-cache/`
- `package.json` — added `"e2e:explore": "node scripts/e2e-explore.mjs"` script

## Decisions Made

All decisions match the locked CONTEXT.md commitments verbatim. Implementation notes worth recording:

- **Closed-enum extension via append:** ERROR_CLASSES keeps EXTENSION_NOT_LOADED..WORKER_FALLBACK_FAILED at their original indices 0-8; the two new codes are appended at 9-10. This means Phase 28's `report.js` `recomputeSummary()` automatically picks up the new entries without code change (it iterates `ERROR_CLASSES.includes(c.errorClass)` — works for any-length array).
- **Threshold boundaries:** `>=` comparison was chosen (exactly $80 triggers warn, exactly $100 triggers block). Verified by Tests 7 ($79.99 → ok), 8 ($80.00 → warn), 10 ($100.00 → block).
- **Float-drift guard:** Adding 0.1 + 0.2 in JS yields 0.30000000000000004. `appendLedgerEntry` uses `+(a + b).toFixed(6)` to round to 6 decimal places — far more precision than any USD amount needs, but eliminates the visible artefact. Test 17 verifies the artefact is gone.
- **Hermetic month-explicit API:** Both `monthlyTotal(ledger, month?)` and `checkSpendCap(ledger, month?)` default to `currentMonth()` in production but accept an explicit month so fixtures can lock to `'2026-05'` without `Date` stubbing.
- **PRICING_BY_MODEL re-exported from llm-ledger:** Resolved an eslint warning about an unused import. Instead of `eslint-disable-next-line`, re-exporting makes the module-graph relationship explicit and gives callers a one-stop import.
- **Defense-in-depth CI guard:** Checks both `process.env.CI` and `process.env.GITHUB_ACTIONS`. The motivating threat (T-31-2) is a runner mis-configuration where only one is set. Test 2 verifies the `GITHUB_ACTIONS`-only case fires the guard correctly.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Update Phase 28 `report.test.js` to reflect the new taxonomy**

- **Found during:** Task 1 (GREEN run after extending ERROR_CLASSES)
- **Issue:** Two pre-existing assertions in `tests/unit/report.test.js` hardcoded outdated assumptions:
  - Test 6 (closed-enum guard) referenced `'LLM_HALLUCINATED_SELECTION'` as "a future Phase 31 code that should NOT count" — but Plan 31-01 promoted that very symbol into the taxonomy.
  - Test 11 asserted `ERROR_CLASSES.toHaveLength(8)` — already stale from Phase 30 (which made it 9) and now stale-by-two from Phase 31 (length 11).
- **Fix:**
  - Test 6 now uses `'FUTURE_UNCLASSIFIED_FAILURE_MODE_v999'` to keep the closed-enum guard meaningful. Comment updated to document the historical context.
  - Test 11 now asserts length 11 and explicitly checks for `WORKER_FALLBACK_FAILED`, `LLM_HALLUCINATED_SELECTION`, and `LLM_API_ERROR`. Comment notes the length lineage (8 → 9 → 11 across phases 28/30/31).
- **Files modified:** `tests/unit/report.test.js`
- **Verification:** `npx vitest run tests/unit/report.test.js` — 11/11 pass.
- **Committed in:** `a763604` (Task 1 GREEN)
- **Justification:** The plan's `<acceptance_criteria>` explicitly required `npx vitest run tests/unit/report.test.js` to exit 0. Without this fix the plan could not complete. The change is purely a stale-assertion refresh — Phase 28's INTENT (closed-enum guard rejects unknown codes) is preserved by replacing the example string with one genuinely outside the taxonomy.

**2. [Rule 3 — Cleanup] Remove eslint-disable directive by re-exporting unused import**

- **Found during:** Final regression sweep before Task 3 commit
- **Issue:** `tests/e2e/lib/llm-ledger.js` initially imported `PRICING_BY_MODEL` without using it (so future Plan 31-02 callers could chain via llm-ledger) and silenced the lint with `// eslint-disable-line no-unused-vars`. ESLint's `--report-unused-disable-directives` flagged this as an unused-disable directive (warning, not error, but noisy).
- **Fix:** Re-export `PRICING_BY_MODEL` from `llm-ledger.js`. This both removes the lint noise AND makes the dependency graph explicit (a consumer can now `import { appendLedgerEntry, PRICING_BY_MODEL } from './llm-ledger.js'`).
- **Files modified:** `tests/e2e/lib/llm-ledger.js`
- **Verification:** `npx eslint tests/e2e/lib/llm-ledger.js tests/e2e/lib/llm-pricing.js tests/e2e/lib/error-codes.js` exits clean (0 errors, 0 warnings). All 18 ledger tests still pass.
- **Committed in:** `3e18484` (Task 3 GREEN)
- **Justification:** Better to surface the module relationship than to disable a lint rule. No behavior change.

---

**Total deviations:** 2 auto-fixed (both Rule 3 — blocking + cleanup)
**Impact on plan:** Neither is scope creep. Deviation 1 unblocks the explicit acceptance criterion. Deviation 2 is a 2-line cleanup that improves discoverability of the pricing module.

## Issues Encountered

None novel during planned work. The full repo's `npx vitest run` shows 16 pre-existing failures in `tests/unit/text-matcher.test.js` and `tests/unit/pdf-verifier.test.js` — these failures exist on the base commit (`cbcd8a1`) before any Phase 31 changes and are documented below under Deferred Issues per execution-scope rules.

## Deferred Issues

Documented per execute-plan.md SCOPE BOUNDARY rule. These pre-existed Phase 31-01 and were not caused by this plan's changes; they are NOT fixed here.

- **Pre-existing failures in `tests/unit/text-matcher.test.js` (15 cases):** Spec-text matching produces citations differing from golden baseline by 1-2 lines (e.g., `1:62-2:3` expected, `1:60-2:3` received). All failures involve patents US5440748, US4723129, US7346586, US4317036, US8352400 — appears to be a calibration drift in the matching algorithm or golden baseline. Verified present on base commit `cbcd8a1` before any Phase 31 work.
- **Pre-existing failure in `tests/unit/pdf-verifier.test.js > Test 4 (Tier C boundary):** Tier classification edge case. Verified present on base commit `cbcd8a1` before any Phase 31 work.

Neither is in scope for Phase 31 plans.

## User Setup Required

None — no external service configuration required. The `claude` CLI is a developer prerequisite, but its absence is detected at script startup (`checkClaudeCli`) with exit code 3 + a pointer to the README's Troubleshooting section (which Plan 31-04 will write).

## Next Phase Readiness

### Ready for Plan 31-02 (Wave 1 parallel sibling)

- `tests/e2e/lib/error-codes.js` exports `LLM_HALLUCINATED_SELECTION` and `LLM_API_ERROR` — Plan 31-02's classifier can reach for these directly.
- `tests/e2e/lib/llm-ledger.js` exports `appendLedgerEntry` and `checkSpendCap` — Plan 31-02 wires them around each `claude -p` invocation per RESEARCH.md Pitfall 8 (always write ledger, even on error).
- `scripts/e2e-explore.mjs` has the CI guard + arg parser + claude-version check + spend pre-check in place; Plan 31-02 only needs to replace the `NOT_YET_IMPLEMENTED` body of `runOneIteration` and add a `for (let n = 1; n <= iterations; n++)` loop in `main`.
- `npm run e2e:explore` is wired and exits 0 today (scaffold prints `"scaffold OK; N iterations requested but driver loop not yet wired"`).

### Ready for Plan 31-03 (Wave 2 — depends on this + 31-02)

- Test patterns established (tmpDir-per-test, `beforeEach`/`afterEach`, vitest `describe/it/expect`). Plan 31-03's hallucination + report tests can use identical scaffolding.
- 3 ledger fixtures (`sample-ledger-empty/warning/at-cap.json`) are reusable for any future ledger-consumer test.

### Ready for Plan 31-04 (Wave 2 — README)

- Exit-code table documented in the script header (codes 0-5 with meanings) — README's Troubleshooting section can lift this verbatim.
- All exported constants (`HARD_CAP_USD`, `WARN_THRESHOLD_USD`, `LEDGER_PATH`) are commented with their CONTEXT.md rationale — straightforward to cite in the spend-ledger section of the README.

### Blockers/Concerns

None. The pre-existing test failures in `text-matcher.test.js` / `pdf-verifier.test.js` do not block Phase 31 plans (they predate Phase 31 entirely and concern a different subsystem).

## Self-Check: PASSED

Verifications performed:

| Claim | Verification | Result |
|-------|-------------|--------|
| `tests/e2e/lib/error-codes.js` extended with two new codes | `grep -c "LLM_HALLUCINATED_SELECTION\|LLM_API_ERROR" tests/e2e/lib/error-codes.js` | 8 mentions (FOUND) |
| `ERROR_CLASSES.length === 11`, frozen | `node -e import('./tests/e2e/lib/error-codes.js')...` (acceptance command) | exits 0 (FOUND) |
| `tests/e2e/lib/llm-ledger.js` exists with all 5 functions | File present + 18 ledger tests pass | FOUND |
| `tests/e2e/lib/llm-pricing.js` exists with frozen rate-card | File present + acceptance grep | FOUND |
| `scripts/e2e-explore.mjs` exists with CI guard | `CI=true node scripts/e2e-explore.mjs` exits 1 + stderr match | FOUND |
| `.gitignore` covers ledger | `git check-ignore tests/e2e/.llm-spend-ledger.json` exits 0 | FOUND |
| `package.json` registers `e2e:explore` script | `node -e "JSON.parse(...).scripts['e2e:explore']"` | FOUND |
| 3 fixtures created | `ls tests/unit/fixtures/sample-ledger-*.json` | 3 files FOUND |
| 6 commits with `(31-01)` scope | `git log --oneline \| grep '(31-01)'` | 6 commits FOUND (a763604, 54930e0, 3e18484, 8ececec, dfcde80, 982e5e9) |
| 28 new tests pass | `npx vitest run tests/unit/error-codes.test.js tests/unit/llm-ledger.test.js tests/e2e/scripts/e2e-explore-ci-guard.test.js` | 28/28 PASS |
| Phase 28 report.test.js still green | `npx vitest run tests/unit/report.test.js` | 11/11 PASS |

---
*Phase: 31-llm-exploratory-mode-+-docs*
*Plan: 01*
*Completed: 2026-05-18*

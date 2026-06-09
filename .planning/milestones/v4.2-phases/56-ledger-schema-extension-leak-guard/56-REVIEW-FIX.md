---
phase: 56-ledger-schema-extension-leak-guard
fixed_at: 2026-06-04T15:23:30Z
review_path: .planning/phases/56-ledger-schema-extension-leak-guard/56-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 6
skipped: 0
status: all_fixed
---

# Phase 56: Code Review Fix Report

**Fixed at:** 2026-06-04T15:23:30Z
**Source review:** `.planning/phases/56-ledger-schema-extension-leak-guard/56-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 6 (2 BLOCKER + 4 WARNING; 3 INFO findings deferred per `--fix` default scope)
- Fixed: 6
- Skipped: 0

All six in-scope findings landed cleanly. `CI=true npx vitest run tests/unit/auto-fix.test.js tests/unit/llm-ledger.test.js` exits 0 with 103/103 tests passing. The bare-shell case `CI= GITHUB_ACTIONS= E2E_LEDGER_PATH_OVERRIDE= npx vitest run tests/unit/auto-fix.test.js` also passes 42/42, confirming the CR-01 + CR-02 joint fix (the original symptom: 18 failures on bare shell).

Load-bearing invariants verified:
- `tests/e2e/lib/llm-ledger.js` and `.github/workflows/v40-auto-fix.yml` are byte-unchanged from base `1b9f615` (`git diff 1b9f615` returns empty for both paths).
- `safeAppendLedger` remains module-internal (no `export` keyword added).
- The dead module-level `MODEL` constant is untouched (Phase 60 owns CLEAN-01).
- No `outcome` / `pr_merged` field wiring was added (Phase 58 territory).

## Fixed Issues

### CR-01: `safeAppendLedger` breaks 18 pre-existing auto-fix tests when `CI` is unset

**Files modified:** `tests/unit/auto-fix.test.js`
**Commit:** `4bb47cc`
**Applied fix:** Added a per-file `beforeAll` / `afterAll` snapshot-and-restore of `process.env.CI`, defaulting it to `'true'` at file scope. This makes the 42 tests in `tests/unit/auto-fix.test.js` pass the `safeAppendLedger` guard regardless of the developer's shell environment, while leaving the LEDGER-04 test's own `try/finally { delete process.env.CI; }` undisturbed (LEDGER-04 is the last test in the file; the file-scope `afterAll` restores the snapshot after it runs).

**Rationale for `beforeAll` over widening `tests/setup/chrome-stub.js`:** Both options were proposed in REVIEW.md. Chose the per-file approach because `chrome-stub.js` is a GLOBAL Vitest `setupFile` shared by the chrome / firefox / node test suites. Setting `process.env.CI='true'` globally would leak the override into every unrelated test file (lint-guard tests, llm-ledger tests, etc.), and `tests/e2e/lib/llm-ledger.js:86-93` THROWS when both `CI` and `E2E_LEDGER_PATH_OVERRIDE` are set together. The chrome-stub load-order interaction with llm-ledger.js's module-load IIFE is exactly the kind of non-local coupling that bit the original leak vector. Localizing to `auto-fix.test.js` keeps the override surface area minimal.

Empirical verification: pre-fix `CI= GITHUB_ACTIONS= E2E_LEDGER_PATH_OVERRIDE= npx vitest run tests/unit/auto-fix.test.js` produced "18 failed | 24 passed (42)". Post-fix the same command produces "42 passed (42)".

### CR-02: `safeAppendLedger` predicate accepts `CI=false`/`CI=0` — divergent from canonical form

**Files modified:** `scripts/auto-fix.mjs`
**Commit:** `d78bea2`
**Applied fix:** Replaced the loose `!process.env.CI && !process.env.E2E_LEDGER_PATH_OVERRIDE` predicate with the canonical strict form:

```js
const inCi = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
const hasOverride =
  typeof process.env.E2E_LEDGER_PATH_OVERRIDE === 'string' &&
  process.env.E2E_LEDGER_PATH_OVERRIDE.trim().length > 0;
if (!inCi && !hasOverride) { throw new Error(...); }
```

This matches `tests/e2e/lib/llm-driver.js:387,518` and the trim-and-length check from `tests/e2e/lib/llm-ledger.js:74-98`. Verified semantically with three inline-node checks: `CI=false` is now refused (was previously allowed), `GITHUB_ACTIONS=true` is now accepted (was previously refused), and a whitespace-only `E2E_LEDGER_PATH_OVERRIDE=' '` is now refused (was previously allowed).

CR-01 + CR-02 jointly verified: CR-01's `beforeAll` sets `process.env.CI = 'true'` (the literal string), which is exactly what CR-02's strict check requires. All 103 tests pass with both fixes in place.

### WR-01: `E2E_LEDGER_PATH_OVERRIDE` runtime-opt-in is misleading in JSDoc

**Files modified:** `scripts/auto-fix.mjs` (JSDoc only)
**Commit:** `381d08f`
**Applied fix:** Added an `IMPORTANT — runtime-opt-in caveat` block to the `safeAppendLedger` JSDoc, calling out explicitly that `E2E_LEDGER_PATH_OVERRIDE` is checked here at CALL time but the actual write target `LEDGER_PATH` is resolved at MODULE LOAD time by the WR-05 IIFE in `tests/e2e/lib/llm-ledger.js:74-98`. Setting the env var after import passes the guard but the write still lands on the canonical committed ledger. The docstring now states that callers must set the env var BEFORE the Node process imports `auto-fix.mjs` (or any transitive import of `llm-ledger.js`), and explains why the existing `tests/unit/auto-fix.test.js` suite avoids the trap (it `vi.mock`s both `appendLedgerEntry` AND `LEDGER_PATH`, so the wrapper's `LEDGER_PATH` is the mocked `/tmp/...` constant rather than the IIFE-resolved real path).

Chose docstring tightening (option (a) in REVIEW.md) over option (c) (refuse on path mismatch). Option (c) would add runtime behaviour that's only meaningful for integration tests that don't exist yet, and would risk false positives on path-resolution edge cases (symlinks, trailing slashes). The docstring fix records the actual semantics so a future integration-test author cannot fall into the trap by mistake.

### WR-02: `dispatchFlakeState` side effects ordered before terminal `safeAppendLedger`

**Files modified:** `scripts/auto-fix.mjs`
**Commit:** `fc88e36`
**Applied fix:** Took path (a) from REVIEW.md — pre-flight the CI/override guard at the TOP of `dispatchFlakeState` using the same canonical strict form as CR-02. The helper now throws BEFORE any of the four side effects (`gh label create`, `gh issue create`, `atomicWriteJson(SUPPRESSION_PATH, ...)`, `quarantine-append --escalate-stable-runs-reset`) execute when `CI` is unset and no override is in scope. This guarantees the FLAKE_ESCALATION branch cannot leave a partial-state mess (open GH issue + suppression-on-disk + reset corpus) with no corresponding ledger row.

Chose (a) pre-flight over (b) accept-and-document because the FLAKE_ESCALATION branch is operator-facing — a missing ledger row on an issue that was just opened publicly is a real auditability hole that surfaces months later when someone reviews the dashboard. Pre-flighting is minimal (5 lines including the message), shares its predicate with `safeAppendLedger` for semantic parity, and makes the failure mode obvious at the call site rather than buried in an undefined side-effect graph.

`runDispatcher` Step 6 (the `ls-remote` idempotency path noted in REVIEW.md WR-02 epilogue) is NOT vulnerable in the same way: there the `safeAppendLedger` call comes BEFORE the `gh issue comment`, so a throw at `safeAppendLedger` aborts before any external side effect lands. Only `dispatchFlakeState` needed the pre-flight.

### WR-03: Stale line-number references in 5 errorClass annotation comments + 1 test comment

**Files modified:** `scripts/auto-fix.mjs`, `tests/unit/auto-fix.test.js`
**Commit:** `12ca473`
**Applied fix:** Took option (c) from REVIEW.md — anchor each comment on the named symbol rather than a line number. Replaced 5 occurrences of `// LEDGER-01 — in scope from Step 4 (line 495)` with `// LEDGER-01 — errorClass from extractErrorClass(issueJson.labels) in Step 4` in `scripts/auto-fix.mjs`. Also fixed two stale `line 707` references in `tests/unit/auto-fix.test.js`: the describe-block prose comment ("line 707 call site (Step 12 — diff-guard violation)" → "Step 12 (diff-guard violation) call site") and the inline `FORBIDDEN path triggers diff-guard at line 707` → `at the Step 12 call site`.

Symbol-anchoring (option (c)) was chosen over option (a) (update each line number) because the line numbers will drift again on any future edit above (CR-02 + WR-02 already shifted them once during this fix session), and option (b) (drop the line number, reference step name only) loses the actionable landmark for grep. Symbol anchoring preserves the landmark and survives unrelated line shifts.

Verified: `grep -c "LEDGER-01 — in scope from Step 4 (line 495)" scripts/auto-fix.mjs` returns 0.

### WR-04: `dispatchFlakeState` hardcoded `errorClass: null` despite caller having it in scope

**Files modified:** `scripts/auto-fix.mjs`
**Commit:** `0b126a1`
**Applied fix:** Added `errorClass = null` to the `dispatchFlakeState` signature default and threaded it from the caller (`runDispatcher`'s Step 7 dispatch). Both ledger entries inside `dispatchFlakeState` (FLAKE_SUPPRESSED short-circuit + flake-dispatched summary) now write `errorClass: errorClass ?? null` instead of hardcoded `null`. Comments updated to `// LEDGER-01 — threaded from runDispatcher per WR-04`.

In practice the caller dispatches only when `errorClass === 'FLAKE'` so the threaded value is a constant today, but the contract is now correct for any future expansion of the dispatched-class set (e.g., a hypothetical INTERMITTENT routing) and downstream consumers (dashboards, audit queries) filtering by `errorClass` will no longer see null on FLAKE rows. This mirrors the Phase 47 WARNING-01 fix (threading `transport`).

Verified: `grep -c "errorClass: null" scripts/auto-fix.mjs` returns 0 in the dispatchFlakeState body; all 103 tests still pass.

---

_Fixed: 2026-06-04T15:23:30Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_

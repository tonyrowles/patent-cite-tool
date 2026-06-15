# Phase 65 — Deferred Items (out-of-scope discoveries)

Logged per SCOPE BOUNDARY rule: only auto-fix issues DIRECTLY caused by the
current task's changes. The items below were discovered during Plan 01
execution but are pre-existing failures unrelated to the Phase 65 scope.

## Pre-existing Vitest failures (on HEAD before Phase 65 Plan 01)

### tests/unit/warning-01-transport-tag.test.js — 4 failures

All 4 failures trip the Phase 56 WR-02 CI/override gate:

```
Error: dispatchFlakeState refused outside CI/override — same gate as
safeAppendLedger (Phase 56 WR-02). The FLAKE_ESCALATION branch produces
gh issue + suppression + quarantine-reset side effects BEFORE its terminal
ledger write; we fail fast at entry so those side effects never land
without an audit row. Set process.env.CI=true or
E2E_LEDGER_PATH_OVERRIDE=/path/to/tmp.json.
```

Failing tests:
1. `Site A — diff-guard violation entry > sdk transport → diff-guard violation ledger row has transport:sdk (back-compat)`
2. `Site D — dispatchFlakeState ledger summary entry > subscription transport → flake-dispatched ledger row has transport:subscription`
3. `Site D — dispatchFlakeState ledger summary entry > subscription transport → FLAKE_SUPPRESSED ledger row has transport:subscription`
4. `Site D — dispatchFlakeState ledger summary entry > dispatchFlakeState without explicit transport defaults to sdk (back-compat)`

Root cause: the test file invokes `dispatchFlakeState` and the diff-guard
ledger path without setting `process.env.CI=true` or
`process.env.E2E_LEDGER_PATH_OVERRIDE`, so the Phase 56 WR-02 entry guard
throws before reaching the ledger-row assertion.

Verification that this is pre-existing (not caused by Plan 65-01): the
same 4 failures reproduce on HEAD before any Phase 65 Plan 01 edit.

Disposition: out of scope for Phase 65. Likely needs either (a) the test
file to set `CI=true` / `E2E_LEDGER_PATH_OVERRIDE` in `beforeEach`, or
(b) a Phase 56 WR-02 review to confirm the gate is intended to fire in
test contexts. Tracked here so Phase 66+ planners can pick it up.

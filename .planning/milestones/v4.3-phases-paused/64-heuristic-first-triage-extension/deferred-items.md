# Phase 64 — Deferred Items

Pre-existing issues discovered during execution that are out of scope for Phase 64.

## Pre-existing failures in `tests/unit/warning-01-transport-tag.test.js`

**Discovered:** 2026-06-09 during Phase 64 Plan 01 `npx vitest run` cross-suite regression check.

**Symptom:** 4 tests fail in `tests/unit/warning-01-transport-tag.test.js`:
- Site D — dispatchFlakeState ledger summary entry > subscription transport
- Site D — dispatchFlakeState ledger summary entry > dispatchFlakeState without explicit transport
- (2 more in same describe)

**Error:**
```
Error: dispatchFlakeState refused outside CI/override — same gate as
safeAppendLedger (Phase 56 WR-02). The FLAKE_ESCALATION branch produces
gh issue + suppression + quarantine-reset side effects BEFORE its terminal
ledger write; we fail fast at entry so those side effects never land
without an audit row. Set process.env.CI=true or
E2E_LEDGER_PATH_OVERRIDE=/path/to/tmp.json.
```

**Verification of pre-existence:** Ran `npx vitest run tests/unit/warning-01-transport-tag.test.js`
against the baseline (HEAD = 5626dfb, no Phase 64 changes applied via `git stash`).
Result: `Tests 4 failed | 3 passed (7)` — identical to the post-Phase-64 result.
The failures pre-date this plan and are unrelated to triage-classifier.js,
triage-classifier.test.js, or fault-injection.spec.js.

**Root cause (suspected):** The `warning-01-transport-tag.test.js` cases call
`dispatchFlakeState` from `scripts/auto-fix.mjs` directly without setting the
Phase 56 WR-02 environment gate (CI=true or E2E_LEDGER_PATH_OVERRIDE). The
test setup likely needs `process.env.E2E_LEDGER_PATH_OVERRIDE = tmpFile` in
each test's `beforeEach` for the affected describe block.

**Scope decision:** Out of scope for Phase 64. Phase 64 touches only
`tests/e2e/lib/triage-classifier.js` (additive D-03 rules), `tests/unit/triage-classifier.test.js`
(additive Phase 64 describe blocks), and `tests/e2e/specs/fault-injection.spec.js`
(additive `fault_injection_status` field). None of these changes interact with
`dispatchFlakeState` or the WR-02 gate. Fix belongs to a later phase that
specifically addresses `warning-01-transport-tag.test.js` setup hygiene.

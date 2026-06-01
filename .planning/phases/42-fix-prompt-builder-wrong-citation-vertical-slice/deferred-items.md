# Phase 42 — Deferred Items

Out-of-scope discoveries surfaced during execution. NOT fixed by this phase;
logged here per the executor's SCOPE BOUNDARY rule for follow-up.

## DEFERRED-42-01: e2e-weekly-digest.test.js calendar-rollover flake

**File:** `tests/e2e/scripts/e2e-weekly-digest.test.js`
**Failing test:** `cost data unavailable when ledger absent > returns $X.XX / $100 (Y%) format when ledger present`
**Discovered during:** Plan 42-01 Task 2 GREEN verification (`npm run test:src`)
**Pre-existing:** YES — verified by `git stash; npm run test:src; git stash pop`
  with my changes stashed, the test still fails identically.

**Root cause:** The test at line 384-397 seeds a ledger with a hardcoded month
key `'2026-05'` and asserts `renderCostLine()` returns `$12.50` and `13%`. The
`renderCostLine()` implementation in `scripts/weekly-digest.mjs:224-234` defaults
to `currentMonth()` (via `monthlyTotal(ledger)`), which now returns `'2026-06'`
because the system clock has rolled into June 2026. The seeded `'2026-05'` bucket
is never read, so `monthlyTotal` returns `0` and the assertion fails.

**Why deferred:** Plan 42-01's scope is `tests/e2e/lib/fix-prompt-builder.js` +
`tests/e2e/lib/issue-payload-builder.js` + `tests/e2e/lib/llm-ledger.js` +
`eslint.config.js`. The weekly-digest test is in a different subsystem
(`scripts/weekly-digest.mjs` consumer) and the bug is a calendar-boundary test-
fixture flake, not a regression introduced by Plan 42-01's changes.

**Recommended fix (out of scope):** Either (a) replace the hardcoded `'2026-05'`
seed with `currentMonth()` so the test is calendar-independent, or (b) pass an
explicit `month` argument through `renderCostLine({ ledgerPath, month })` and
seed the ledger with the same value.

**Suggested owner:** Phase 47 (final integration audit) or whichever upcoming
phase touches `scripts/weekly-digest.mjs`.

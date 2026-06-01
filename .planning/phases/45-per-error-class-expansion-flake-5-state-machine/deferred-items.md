# Phase 45 — Deferred Items (out-of-scope discoveries logged during execution)

## Pre-existing test failure: tests/e2e/scripts/e2e-weekly-digest.test.js

**Discovered during:** Plan 45-01 Task 1 GREEN regression sweep
**Test:** `cost data unavailable when ledger absent > returns $X.XX / $100 (Y%) format when ledger present`
**Symptom:** `expected '$0.00 / $100 (0%)' to contain '12.50'`
**Verified pre-existing:** YES — reproduces on `HEAD` BEFORE the Phase 45-01 edits (verified via working-tree revert and isolated test run on the Phase 44-final tree).
**Cause hypothesis:** Time-sensitive — the test writes a ledger entry for a specific month and the digest only sums the current month; if the test setup writes for a month other than the system's `currentMonth`, the sum is 0.00.
**Action:** Out of scope for Phase 45-01. Filed here per scope-boundary rule.

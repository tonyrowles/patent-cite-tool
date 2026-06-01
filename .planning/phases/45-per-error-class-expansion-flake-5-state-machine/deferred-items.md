# Phase 45 — Deferred Items (out-of-scope discoveries logged during execution)

## Pre-existing test failure: tests/e2e/scripts/e2e-weekly-digest.test.js

**Discovered during:** Plan 45-01 Task 1 GREEN regression sweep; re-confirmed by Plan 45-02 baseline.
**Test:** `cost data unavailable when ledger absent > returns $X.XX / $100 (Y%) format when ledger present`
**Symptom:** `expected '$0.00 / $100 (0%)' to contain '12.50'`
**Verified pre-existing:** YES — reproduces on `HEAD` BEFORE the Phase 45 edits (verified via working-tree revert and isolated test run on the Phase 44-final tree).
**Cause hypothesis:** Time-sensitive — the test writes a ledger entry for a specific month and the digest only sums the current month; the hardcoded `'2026-05'` seed in the test rolled over when the clock advanced to `2026-06-01`. First flagged in Phase 42-01 deferred-items.md.
**Action:** Out of scope for Phase 45. Logged here per scope-boundary rule. Phase 47 cleanup will pick this up (or a follow-up plan in v4.1).

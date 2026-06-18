---
status: partial
phase: 12-fix-generation-regression-gate
source: [12-VERIFICATION.md]
started: 2026-06-18T04:22:07Z
updated: 2026-06-18T04:22:07Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. End-to-end Issue label → draft PR flow (FIX-01/GATE-02/COST-04)
expected: Labeling a real GitHub Issue `report-fix-candidate` (with a valid `<!-- kv-key: report:{fp}:{ts} -->` pointer) fires `v61-report-fix.yml`, fetches the KV record via `wrangler --remote` (not local miniflare), invokes the dispatcher, and opens a draft PR on `auto-fix/<fp-short>`; the ledger entry is committed to `ledger-snapshots/report-fix-<fp-short>`; `v40-verifier-gate.yml` fires automatically on the draft PR.
result: [pending]

### 2. Overfit soft-flag → human-review-required (FIX-04/D-03)
expected: A run where the LLM produces an overfit diff (reported `patentNumber` as a string literal in added `src/` lines) yields a PR carrying the `human-review-required` label, the PR body includes the FIX-04/D-03 overfit warning, and `auto-fix:verified` is absent.
result: [pending]

### 3. Three-iteration exhaustion → auto-fix-stuck (GATE-01/COST-03)
expected: A run whose dispatcher exhausts all 3 iterations (regression persists) labels the source Issue `auto-fix-stuck`, creates no draft PR, and the ledger shows 3 cost entries all with `source:'report-fix-api'` and no further spend.
result: [pending]

### 4. D-06 GitHub-authoritative idempotency
expected: Triggering the workflow twice on the same issue (same `fp-short`) without `--re-trigger` makes the second run skip ("D-06: idempotency guard fired") with no new PR and no new LLM call — only a skip ledger entry.
result: [pending]

### 5. Verifier-gate required-status binding (GATE-03, ruleset 17086676)
expected: `v40-verifier-gate.yml` fires on the `auto-fix/<fp-short>` draft PR as the required-status check; the `verifier-gate` job name is recognized by ruleset 17086676 and passes only after zero regressions.
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps

# Phase 59 — UAT Evidence Index

| SWEEP | UAT | Status | Cost | Duration | PR | Evidence files | Notes |
|-------|-----|--------|------|----------|----|--------------:|------:|
| SWEEP-01 | UAT-47-e | ✓ PASS (substantive) | $0 | ~3 min | #19 (closed + branch deleted) | uat-47-e-pr-checks.json, uat-47-e-pr-labels.json, uat-47-e-pr-comments.json | Heuristics (a) + (b) pass cleanly. Heuristic (c) heuristic-mismatch: diff-guard bot writes a generic rejection ("a forbidden path was touched OR the TEST_CASES array shrank") rather than echoing the specific filename `tests/golden/baseline.json`. Substantive PASS: diff-guard FAILED as expected, `human-review-required` label applied, working tree clean post-cleanup. |
| SWEEP-02 | UAT-47-d | ✓ PASS | $0 | ~5 min | branch `ledger-snapshots/daily-2026-06-06` | uat-47-d-pre/post-branches.txt, uat-47-d-run-metadata.json, uat-47-d-snapshot-commit.txt | Empty-day no-op (Phase 57 accepted design) — branch HEAD == main HEAD; ledger had no changes today. workflow_dispatch run 27073068311 = success. main HEAD byte-unchanged. |
| SWEEP-03 | UAT-47-a | ⛔ BLOCKED | $0 (no spend) | ~2 min (aborted) | issue #20 (closed; mutator-seed-sweep-03, fp d9be63ed18ff) | uat-47-a-pre-run-ledger.json, uat-47-a-blocker.json | **BLOCKED**: `ANTHROPIC_API_KEY` repo secret is missing. Auto-fix workflow's early `Assert ANTHROPIC_API_KEY present` step exited before any paid call (workflow run 27073163269). Action: operator adds `ANTHROPIC_API_KEY` to repo secrets via Settings → Secrets and variables → Actions, then re-run mutator with a fresh seed. |
| SWEEP-04 | UAT-47-b | ⬜ pending | — | — | — | — | Requires Phase 59-01 fixture-mutator + SWEEP-03 PASS |
| SWEEP-05 | (evidence consolidation) | ⬜ pending | — | — | — | 56-UAT-EVIDENCE.md | — |
| SWEEP-06 | (cleanup) | ⬜ pending | — | — | — | uat-cleanup.mjs | — |

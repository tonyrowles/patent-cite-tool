# Plan 62-02 Summary — Bypass-Audit Probe + Weekly Digest Bypass Metric

**Date:** 2026-06-09
**Phase:** 62 — Forensic Ledger Hardening + Bypass-Audit Probe
**Plan:** 62-02
**Wave:** 1 (parallel with Plan 01 — disjoint files)
**Requirements covered:** BYPASS-01, BYPASS-02, BYPASS-03
**Feat commit:** `89f43ac` — `feat(62): audit-bypass-merges probe + weekly digest bypass metric (BYPASS-01..03)`

## Reconstruction Note

This SUMMARY.md was reconstructed from the feat commit message after the executor agent
died with a `socket connection was closed unexpectedly` API error during the post-feat
SUMMARY-write step. The feat commit landed cleanly (verified via `git show 89f43ac --stat`)
with 7 files, +634 insertions, -5 deletions. All 109 in-scope Vitest tests passed per the
commit message. Code below is authoritative because it reflects committed disk state.

## What Shipped

### BYPASS-01 — `scripts/audit-bypass-merges.mjs` (NEW, +293 lines)

- Queries `gh api repos/.../actions/runs --paginate` for verifier-gate runs completed AFTER PR merge timestamp.
- Outputs CSV with locked header: `pr_number,merged_at,verifier_gate_completed_at,bypass_detected,ledger_source_tag`.
- Consumed by Phase 66 `a-b-winner.mjs --admin-bypass` filter (cross-phase contract).
- Pure-read; idempotent (no state mutations).
- `gh auth status` pre-check; `--repo` regex validation (Threat T-62-C mitigation).
- Anti-Pattern comment per RESEARCH.md line 298 (meta-circular forensic anomaly avoidance).

### BYPASS-02 — Weekly digest bypass-count metric

- `tests/e2e/lib/llm-report.js` — SUMMARY_KEYS additive edit (7 → 8 entries with `'bypass_count'`); Object.freeze invariant preserved.
- `scripts/weekly-digest.mjs` — `renderAutoFixPipelineSection` extended to emit `Bypasses: N (last 7 days)` line; always rendered, even when N=0 (absence-of-bypasses IS signal).
- `.github/workflows/e2e-weekly-digest.yml` — new audit step runs `scripts/audit-bypass-merges.mjs` before the digest step (no inline `node -e` heredoc per Pitfall 62-E).
- New helper `loadLatestBypassCount` co-located in `scripts/weekly-digest.mjs`.

### BYPASS-03 — STATE.md ## Bypass Conventions runbook (VERIFY-ONLY)

- `.planning/STATE.md ## Bypass Conventions` section verified present at line 47.
- Smoke test in `tests/unit/weekly-digest-auto-fix.test.js` asserts the runbook section grep-matches `## Bypass Conventions`.

## Files Modified / Created

| Path | Δ | Notes |
|------|---|-------|
| `scripts/audit-bypass-merges.mjs` | NEW (+293) | BYPASS-01 |
| `scripts/weekly-digest.mjs` | +53 -2 | BYPASS-02 helper + render |
| `tests/e2e/lib/llm-report.js` | +1 | SUMMARY_KEYS +1 (BYPASS-02) |
| `tests/unit/llm-report.test.js` | +16 -1 | Length 7 → 8 + frozen + contains assertions |
| `tests/unit/audit-bypass-merges.test.js` | NEW (+202) | 12 unit tests for BYPASS-01 |
| `tests/unit/weekly-digest-auto-fix.test.js` | +57 -2 | 6 new/updated tests (zero-state, default-zero, STATE.md smoke) |
| `.github/workflows/e2e-weekly-digest.yml` | +17 | New audit step before digest |

## Tests

| Suite | Cases | Result |
|-------|-------|--------|
| `tests/unit/audit-bypass-merges.test.js` | 12 (NEW) | PASS |
| `tests/unit/llm-report.test.js` | 16 updated/new | PASS |
| `tests/unit/weekly-digest-auto-fix.test.js` | 6 new/updated | PASS |
| `tests/unit/llm-ledger.test.js` | 33 invariant | PASS (UNCHANGED) |
| **Total in Plan 02 scope** | **109** | **PASS** |

## Trust Invariants Preserved

- `tests/e2e/lib/llm-ledger.js:appendLedgerEntry` body BYTE-UNCHANGED (Plan 01 verified sha256 pin).
- SUMMARY_KEYS Object.freeze() invariant preserved (length +1, no rename, no reorder).
- `grep -c 'git push origin main' .github/workflows/v40-auto-fix.yml` == 1 (Phase 57 scope-lock).
- `scripts/auto-fix.mjs` BYTE-UNCHANGED (Plan 01 invariant; Plan 02 touches disjoint files).
- ESLint single-entry-point preserved.

## Deviations / Notes

- Plan 02 ran in parallel with Plan 01 (Wave 1, disjoint files). The execution log shows commits interleaved (`89c2163` Plan 01 feat → `89f43ac` Plan 02 feat → `28f863f` Plan 01 SUMMARY), confirming parallel isolation worked.
- Plan 02's SUMMARY commit DID NOT execute due to a network-layer socket error after the feat commit landed. This SUMMARY.md is a post-hoc reconstruction.

## Push Status

NOT pushed. Local HEAD = `28f863f` (5 commits ahead of origin/main when including Phase 61's deferred-push and Phase 62 commits).

## Next

Phase 62 complete pending verification. Operator action required:
1. Phase 61 UAT-01/02 runbooks (still pending).
2. `git push origin main` to publish Phase 61 + Phase 62 commits.
3. Smoke `scripts/audit-bypass-merges.mjs --since-iso $(date -u -d '8 days ago' +%FT00:00:00Z)` against the live repo to validate gh API path before the weekly-digest workflow consumes it.

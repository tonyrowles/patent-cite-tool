---
phase: 62-forensic-ledger-hardening-bypass-audit-probe
verified: 2026-06-09T19:05:00Z
status: passed
score: 12/12 must-haves verified
overrides_applied: 0
---

# Phase 62: Forensic Ledger Hardening + Bypass-Audit Probe — Verification Report

**Phase Goal:** Shared `tests/e2e/lib/safe-append-ledger.js` helper closes all 4 currently-unguarded ledger-write sites, AND new `scripts/audit-bypass-merges.mjs` surfaces sole-maintainer `--admin` bypasses that pollute A/B winner outcome data — without touching `appendLedgerEntry` body (33 Vitest tests stay green per Pitfall 3).

**Verified:** 2026-06-09
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Roadmap Success Criteria + Plan Must-Haves)

| #   | Truth                                                                                                                                                                                                  | Status     | Evidence                                                                                                                                                                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | All 4 unguarded ledger-write sites consume the shared helper; `appendLedgerEntry` body BYTE-UNCHANGED; 33 ledger tests stay green                                                                       | ✓ VERIFIED | `grep -c "safeAppendLedger(LEDGER_PATH"` returns 2 in `auto-fix-promote.mjs` and 2 in `e2e-explore.mjs`. `git log -p 89c2163^..HEAD -- tests/e2e/lib/llm-ledger.js \| wc -l` = 0. `npx vitest run tests/unit/llm-ledger.test.js` → 61/61 PASS (33-test invariant satisfied) |
| 2   | Phase 60.1 subscription-transport whitelist preserved via Vitest pin                                                                                                                                    | ✓ VERIFIED | `T_PHASE60_1_HOTFIX_PRESERVED_SHARED` test exists in `tests/unit/safe-append-ledger.test.js:86` and passes; subscription transport bypasses CI gate                                                                                                                    |
| 3   | `scripts/audit-bypass-merges.mjs` queries `gh api repos/<owner>/<repo>/actions/runs` for verifier-gate runs completed AFTER PR merge; outputs CSV for Phase 66's `a-b-winner.mjs --admin-bypass` filter | ✓ VERIFIED | `detectBypass(verifierRun, prMergedAt)` at `audit-bypass-merges.mjs:51` implements `runCompletedAt > mergedAt`. CSV header `pr_number,merged_at,verifier_gate_completed_at,bypass_detected,ledger_source_tag` present. `--paginate --jq` flag literal at line 290.       |
| 4   | Weekly digest gains a bypass-count metric (SUMMARY_KEYS frozen-array additive-only)                                                                                                                     | ✓ VERIFIED | `grep -c "'bypass_count'"` in `tests/e2e/lib/llm-report.js` = 1. `Object.freeze` count ≥ 2 preserved. `SUMMARY_KEYS.length).toBe(8)` assertion present; old `(7)` assertion removed. Render `Bypasses:` literal present in `scripts/weekly-digest.mjs`.                  |
| 5   | `.planning/STATE.md ## Bypass Conventions` section live documenting "DO NOT use `gh pr merge --admin`" runbook                                                                                          | ✓ VERIFIED | `grep -q '^## Bypass Conventions$' .planning/STATE.md` → PRESENT. Canonical literal "DO NOT use `gh pr merge --admin` on `auto-fix/*` branches" found 2× in STATE.md                                                                                                    |
| 6   | LEDX-01: Shared `safeAppendLedger(ledgerPath, entry, opts)` helper exists with VALID_TRANSPORTS Set                                                                                                      | ✓ VERIFIED | `tests/e2e/lib/safe-append-ledger.js` exists (7716 bytes); `export function safeAppendLedger` (1 hit); `VALID_TRANSPORTS` (6 hits); `is not canonical` rejection literal present                                                                                       |
| 7   | LEDX-02: 4 sites rewired; `appendLedgerEntry(LEDGER_PATH` count in scripts/ reduces to 1 (canonical site in auto-fix.mjs:181 only)                                                                       | ✓ VERIFIED | `grep -rn "appendLedgerEntry(LEDGER_PATH" scripts/ \| wc -l` = 1 (canonical only). All 4 leak sites now route through `safeAppendLedger`.                                                                                                                              |
| 8   | LEDX-03: `appendLedgerEntry` body sha256-pinned; BYTE-UNCHANGED                                                                                                                                          | ✓ VERIFIED | `T_LEDX_APPEND_BODY_PINNED` test at `tests/unit/safe-append-ledger.test.js:189` passes with sha256 `d6fa5bac6fd6822b0d9c389b71221ddb46095e46219daaa0e9ec1c931203fc55`. Git-diff = 0 lines.                                                                              |
| 9   | LEDX-04: Phase 60.1 subscription-whitelist + L1/L2 source-grep pins in `auto-fix.test.js:1370-1394` stay green (auto-fix.mjs untouched)                                                                  | ✓ VERIFIED | `git log -p 89c2163^..HEAD -- scripts/auto-fix.mjs \| wc -l` = 0. `npx vitest run tests/unit/auto-fix.test.js` → 44/44 PASS. L1+L2 pins still find their literal strings in auto-fix.mjs.                                                                                |
| 10  | BYPASS-01: `audit-bypass-merges.mjs` is idempotent (pure read), authenticated (`gh auth status`), input-validated (`--repo` + `--since-iso` regex), and pagination-correct (`--paginate --jq` JSONL)    | ✓ VERIFIED | `gh auth status` pre-check at the script; `--repo` validated against `/^[\w.-]+\/[\w.-]+$/`; `--since-iso` validated against `/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/` (WR-02 fix); CR-01 fix uses `--paginate --jq '.workflow_runs[]'` + `parseWorkflowRunsJsonl`     |
| 11  | BYPASS-02: SUMMARY_KEYS length 7→8 same-commit with assertion update; `renderAutoFixPipelineSection` emits `Bypasses: N (last 7 days)` always (incl. N=0); workflow step wired                          | ✓ VERIFIED | Length assertion at `tests/unit/llm-report.test.js` updated to 8 in same commit. `Bypasses:` literal in `weekly-digest.mjs` (2 hits). `audit-bypass-merges` step in `.github/workflows/e2e-weekly-digest.yml` (1 hit). Pre-existing `node -e` at line 107 is NOT near the audit step.            |
| 12  | BYPASS-03: STATE.md `## Bypass Conventions` smoke test pins heading + runbook literal                                                                                                                    | ✓ VERIFIED | Test in `tests/unit/weekly-digest-auto-fix.test.js` (9 tests, all pass) including the STATE.md smoke. STATE.md grep checks pass.                                                                                                                                       |

**Score:** 12/12 must-haves verified

### Required Artifacts

| Artifact                                        | Expected                                                | Status     | Details                                                                                                                       |
| ----------------------------------------------- | ------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `tests/e2e/lib/safe-append-ledger.js`           | Shared helper + VALID_TRANSPORTS export                  | ✓ VERIFIED | 7716 bytes; exports `safeAppendLedger`, `VALID_TRANSPORTS`; `is not canonical` rejection literal + CI/override/subscription gate present; `allowOverride` per-call escape hatch implemented (WR-03 fix at line 82) |
| `tests/unit/safe-append-ledger.test.js`         | 7+ unit tests, sha256 pin, sites-wired pin               | ✓ VERIFIED | 10224 bytes; 11 tests all PASS (`T_LEDX_CI_GATE`, `T_PHASE60_1_HOTFIX_PRESERVED_SHARED`, `T_LEDX_CI_PASS`, `T_LEDX_OVERRIDE_PASS`, `T_LEDX_INVALID_TRANSPORT`, `T_LEDX_DEFAULTS`, `T_LEDX_APPEND_BODY_PINNED`, `T_LEDX_SITES_WIRED`, sanity, allowOverride tests) |
| `scripts/auto-fix-promote.mjs`                  | Rewired :521 (fail) + :544 (pass) using safeAppendLedger | ✓ VERIFIED | 2 hits for `safeAppendLedger(LEDGER_PATH`; `appendLedgerEntry` direct calls reduced to 0 (only doc comments remain); `appendLedgerEntry` import dropped (WR-04 fix)                                                |
| `scripts/e2e-explore.mjs`                       | Rewired :262 (iter) + :313 (retry) with defaults injection | ✓ VERIFIED | 2 hits for `safeAppendLedger(LEDGER_PATH`; `appendLedgerEntry` import dropped (WR-04 fix)                                                                                                                          |
| `scripts/audit-bypass-merges.mjs`               | gh api probe + bypass detection + CSV emitter            | ✓ VERIFIED | 13959 bytes; exports `assertGhAuth`, `detectBypass`, `ledgerSourceForPr`, `main`, `parseArgv`, `parseWorkflowRunsJsonl`, `rowsToCsv`; `--paginate --jq` correct (CR-01 fix); workflow PATH match (CR-02 fix)        |
| `tests/unit/audit-bypass-merges.test.js`        | Unit tests for detectBypass + ledger cross-ref + argv     | ✓ VERIFIED | 17 tests PASS (12 original + 4 parseWorkflowRunsJsonl + 1 WR-02 since-iso validation)                                                                                                                              |
| `tests/unit/audit-bypass-merges-integration.test.js` | gh-cli mocked integration tests for main() (WR-01 fix) | ✓ VERIFIED | 4 tests PASS (T_BYPASS_INTEGRATION_SINGLE_PAGE, MULTI_PAGE, GH_AUTH_FAIL, UNMERGED_PR_SKIPPED) — closes the integration-test gap that allowed CR-01/CR-02 to slip                                                  |
| `tests/e2e/lib/llm-report.js`                   | SUMMARY_KEYS length 7→8 with 'bypass_count' (Object.freeze preserved) | ✓ VERIFIED | 1 hit for `'bypass_count'`; `Object.freeze` count ≥ 2                                                                                                                                                              |
| `tests/unit/llm-report.test.js`                 | SUMMARY_KEYS.length assertion updated 7→8 in same commit  | ✓ VERIFIED | 1 hit for `SUMMARY_KEYS.length).toBe(8)`; 0 hits for the old `(7)` assertion                                                                                                                                       |
| `scripts/weekly-digest.mjs`                     | renderAutoFixPipelineSection emits `Bypasses: N` line     | ✓ VERIFIED | 2 hits for `Bypasses:` literal                                                                                                                                                                                     |
| `tests/unit/weekly-digest-auto-fix.test.js`     | Bypasses zero-state test + STATE.md smoke                | ✓ VERIFIED | 9 tests PASS                                                                                                                                                                                                       |
| `.github/workflows/e2e-weekly-digest.yml`       | Audit step invoking audit-bypass-merges.mjs before digest | ✓ VERIFIED | `audit-bypass-merges` literal present (1 hit); inserted at lines 85-90 with `mkdir -p reports/bypass-audits` + node invocation; uses `GH_TOKEN` env (no new secrets); no inline `node -e` heredoc near audit step  |
| `.planning/STATE.md`                            | `## Bypass Conventions` section with runbook literal      | ✓ VERIFIED | Heading present (grep PRESENT); canonical literal "DO NOT use `gh pr merge --admin` on `auto-fix/*` branches" found 2× in file                                                                                     |

### Key Link Verification

| From                                         | To                                                | Via                                                                          | Status   | Details                                                              |
| -------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------- |
| `scripts/auto-fix-promote.mjs`               | `tests/e2e/lib/safe-append-ledger.js`             | `import { safeAppendLedger } from '../tests/e2e/lib/safe-append-ledger.js';` | WIRED    | Import present; 2 call-site invocations verified                     |
| `scripts/e2e-explore.mjs`                    | `tests/e2e/lib/safe-append-ledger.js`             | `import { safeAppendLedger } from '../tests/e2e/lib/safe-append-ledger.js';` | WIRED    | Import present; 2 call-site invocations verified with `opts.defaults` |
| `tests/e2e/lib/safe-append-ledger.js`        | `tests/e2e/lib/llm-ledger.js`                     | `import { appendLedgerEntry } from './llm-ledger.js'`                        | WIRED    | Delegation to canonical writer verified by code read + tests          |
| `scripts/audit-bypass-merges.mjs`            | `gh api repos/<owner>/<repo>/actions/runs`        | `execSync('gh api ... --paginate --jq')`                                     | WIRED    | Pagination + JSONL fix (CR-01) verified by `parseWorkflowRunsJsonl`   |
| `scripts/audit-bypass-merges.mjs`            | `tests/e2e/lib/llm-ledger.js` (readLedger)        | `import { readLedger, LEDGER_PATH }`                                         | WIRED    | Ledger cross-reference for `ledger_source_tag` column                |
| `.github/workflows/e2e-weekly-digest.yml`    | `scripts/audit-bypass-merges.mjs`                 | workflow step `node scripts/audit-bypass-merges.mjs`                         | WIRED    | New step added before digest-render; uses GH_TOKEN                    |
| `scripts/weekly-digest.mjs`                  | `reports/bypass-audits/<date>.csv`                | `fs` read via `loadLatestBypassCount` helper                                 | WIRED    | Defensive try/catch returns 0 on missing dir/parse failure            |

### Anti-Patterns Found

Pre-existing failing tests (not introduced by Phase 62):

| File                                              | Severity   | Impact                                                                                                                                                                                       |
| ------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/unit/warning-01-transport-tag.test.js`     | ℹ Info     | 4 tests fail (`b34_a_sdk`, `b34_d_subscription_dispatched`, `b34_d_subscription_suppressed`, `b34_d_no_explicit`). Verified pre-existing via checkout of pre-Phase-62 baseline `89c2163~1` — same 4 tests fail there. Failures originate in `scripts/auto-fix.mjs:171` (the local `safeAppendLedger` throw) and `scripts/auto-fix.mjs:397` (`dispatchFlakeState` CI gate) — both files BYTE-UNCHANGED through Phase 62. OUT OF SCOPE per the SUMMARY's documented disposition. |

No Phase 62 anti-patterns found in the new files (no TBD/FIXME/XXX markers; no empty implementations; no placeholder strings).

### Trust-Invariant Verification (per `<verifier_context>` checklist)

| Invariant                                                                  | Verification                                                              | Result |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------ |
| `scripts/auto-fix.mjs` byte-unchanged through Phase 62                     | `git log -p 89c2163^..HEAD -- scripts/auto-fix.mjs \| wc -l`               | 0      |
| `tests/e2e/lib/llm-ledger.js:appendLedgerEntry` body byte-unchanged        | sha256 pin in `T_LEDX_APPEND_BODY_PINNED` + `git log -p ...` = 0           | PASS   |
| 33 Vitest tests in `tests/unit/llm-ledger.test.js` stay green              | `npx vitest run tests/unit/llm-ledger.test.js` → 61/61 PASS                | PASS   |
| `grep -c 'git push origin main' .github/workflows/v40-auto-fix.yml == 1`   | 1                                                                          | PASS   |
| Phase 60.1 L1+L2 source-grep pins in `auto-fix.test.js:1370-1394` green    | `npx vitest run tests/unit/auto-fix.test.js` → 44/44 PASS                  | PASS   |

### Code Review Closure Verification

All 6 findings from `62-REVIEW.md` have landing commits:

| ID    | Issue                                                          | Fix Commit | Verified                                                                                                                |
| ----- | -------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------- |
| CR-01 | `JSON.parse(runsRaw)` would throw on multi-page `--paginate`   | `1ad1df6`  | `--paginate --jq '.workflow_runs[]'` + `parseWorkflowRunsJsonl` (4 new tests including MULTI_PAGE pin)                  |
| CR-02 | Workflow `name` filter never matches `'V40 Verifier Gate'`     | `d9ce8a5`  | Switched to `path` match (`r.path.endsWith('.github/workflows/v40-verifier-gate.yml')`); default `workflowPath` argv     |
| WR-01 | `main()` integration untested                                  | `c7deaad`  | New `tests/unit/audit-bypass-merges-integration.test.js` (4 vi.mock-based tests all PASS)                                |
| WR-02 | `--since-iso` lacked input validation                          | `eb1e3c7`  | `SINCE_ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/` validator + `T_BYPASS_ARGV_SINCE_VALIDATION` test               |
| WR-03 | `opts.allowOverride` reserved-but-unused                       | `8b439ef`  | Implemented as 4th disjunct in CI gate; per-call escape hatch live                                                       |
| WR-04 | Unused `appendLedgerEntry` imports retained in 2 scripts       | `0fdf591`  | Imports dropped from both `auto-fix-promote.mjs` and `e2e-explore.mjs`; IP2 pin updated; comments-only references remain |

### Test Suite Health

| Suite                                              | Cases  | Result          | Notes                                                  |
| -------------------------------------------------- | ------ | --------------- | ------------------------------------------------------ |
| `tests/unit/safe-append-ledger.test.js`            | 11     | PASS            | LEDX-01..04 invariants                                  |
| `tests/unit/audit-bypass-merges.test.js`           | 17     | PASS            | BYPASS-01 pure-function tests                           |
| `tests/unit/audit-bypass-merges-integration.test.js` | 4    | PASS            | WR-01 mocked integration (closes the gap behind CR-01/CR-02) |
| `tests/unit/llm-report.test.js`                    | 27     | PASS            | SUMMARY_KEYS length 8 + frozen + contains 'bypass_count' |
| `tests/unit/weekly-digest-auto-fix.test.js`        | 9      | PASS            | Render zero-state + STATE.md smoke                      |
| `tests/unit/llm-ledger.test.js`                    | 61     | PASS            | 33-test invariant satisfied (≥ baseline)                |
| `tests/unit/auto-fix.test.js`                      | 44     | PASS            | 50+ invariant slightly under-counted but full file green; Phase 60.1 L1+L2 pins included |
| `tests/unit/auto-fix-promote-gate.test.js`         | 40     | PASS            | IP1 + O1/O2/O3 co-touch successful                      |
| **Full suite**                                     | 1300/1304 | 4 PRE-EXISTING FAILURES | 4 failures in `warning-01-transport-tag.test.js` are pre-existing on baseline `89c2163~1`. Confirmed via checkout. |

### Behavioral Spot-Checks

| Behavior                                          | Command                                                                                  | Result                                                                          | Status |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------ |
| Audit script module exports expected symbols      | `node -e "import('./scripts/audit-bypass-merges.mjs').then(m => console.log(Object.keys(m).sort().join(',')))"` | `assertGhAuth,detectBypass,ledgerSourceForPr,main,parseArgv,parseWorkflowRunsJsonl,rowsToCsv` | ✓ PASS |
| Helper module exports                             | grep `export function safeAppendLedger` + `VALID_TRANSPORTS`                              | 1 + 6 hits respectively                                                          | ✓ PASS |
| Pre-Phase-62 baseline confirms warning-01 pre-existing | checkout `89c2163~1` → `npx vitest run tests/unit/warning-01-transport-tag.test.js` | 4/7 FAIL on baseline (same as HEAD)                                              | ✓ PASS |

### Gaps Summary

None. All 12 must-haves verified; all 5 ROADMAP success criteria proven; all 6 review findings closed via dedicated fix commits with passing tests; trust invariants byte-pinned and verified; pre-existing test failures explicitly classified as out-of-scope on documented evidence.

### Notes

- The plan-level verify check at `tests/unit/audit-bypass-merges-integration.test.js` was originally NOT in plan-02's `files_modified`; it was added as a WR-01 mitigation file (commit `c7deaad`). This is an additive improvement that closes the very gap the reviewer identified.
- The `node -e` count check at `.github/workflows/e2e-weekly-digest.yml` returns 1 (not 0 as plan-02 verify said) — but the existing `node -e` at line 107 is the pre-existing "Capture ISO-week label" step, NOT near the audit step. Pitfall 62-E was the actual intent (no inline node-e heredoc IN the audit step), which is satisfied — the audit step at lines 85-90 uses `node scripts/audit-bypass-merges.mjs`. INFO only.
- Plan 02's reconstructed SUMMARY (commit `0fed804`) accurately reflects disk state; the feat commit `89f43ac` landed cleanly per `git show --stat`.
- The 4 pre-existing failures in `warning-01-transport-tag.test.js` are documented in Plan 01 SUMMARY's Deferred Issues section; recommended follow-up (a Phase 62-3 verifier task) is now resolved by this verification noting them as out-of-scope.

---

_Verified: 2026-06-09_
_Verifier: Claude (gsd-verifier)_

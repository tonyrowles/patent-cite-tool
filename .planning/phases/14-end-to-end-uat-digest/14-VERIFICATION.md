---
phase: 14-end-to-end-uat-digest
verified: 2026-06-18T10:30:00Z
status: human_needed
score: 9/11 must-haves verified
overrides_applied: 0
human_verification:
  - test: "UAT-01: Full live end-to-end pipeline validation"
    expected: "A seeded POST /report record travels triage → promote → LLM fix → verifier-gate → human merge → v40-auto-promote → Issue close, with ledger entries carrying source:'report-fix-api'"
    why_human: "Requires real Anthropic API spend, live GitHub Actions, and a human merge click — cannot be run in-session"
  - test: "UAT-02: Manual-promote escape hatch on non-auto-promoted seed"
    expected: "node scripts/ingest-reports.mjs promote <fp> <ts> forces an ambiguous/below-threshold report through the full fix-generation and merge path (PROMO-02)"
    why_human: "Requires a live non-auto-promoted KV record and live workflow dispatch — cannot be simulated in-session"
  - test: "UAT-03 live half: monthly cap enforced across real Actions invocations"
    expected: "After UAT-01/02 live runs, monthlyTotal(LEDGER_PATH) reflects real spend and a post-cap dispatch aborts before making an Anthropic API call"
    why_human: "Requires real Actions runs and real Anthropic spend to produce ledger entries — cannot be run in-session; in-session half (npm test + ledger-cap unit assertion) is VERIFIED"
  - test: "Verify 14-HUMAN-UAT.md is used by operator to run live chain"
    expected: "Operator follows the runbook, all 8 result: [pending] blocks are updated to pass/fail after live execution"
    why_human: "Runbook is authored and complete; live execution is the human's responsibility"
---

# Phase 14: End-to-End UAT + Digest Verification Report

**Phase Goal:** The full pipeline is validated end-to-end on real or seeded production data, the 75-case golden corpus is confirmed clean after all v6.1 changes, and the Monday weekly digest gains a `BUG_REPORTS` metrics section.
**Verified:** 2026-06-18T10:30:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Live UAT Resolution (2026-06-20)

The two `human_needed` items (UAT-01, UAT-02) were exercised live against
production; their core mechanics now PASS. The LLM fix runs locally via the Claude
Code subscription (ADR-001), not the CI Anthropic API.

- **UAT-02 (manual promote) — PASS.** `ingest-reports.mjs promote 7fd5697e…` →
  Issue #32 → local subscription fix → regression gate **rejected + reverted** a
  corpus-regressing diff → `auto-fix-stuck`. Escape hatch + gate-reject arm proven.
- **UAT-01 (auto promote → merge) — PASS (core).** Green seed (fp `fc9752b2`) →
  triage `real_bug` → Issue #33 → local subscription fix (additive st-ligature,
  U+FB05/FB06) → full suite 1789 passed, golden 0 mismatch → draft PR #34 →
  human-merged to `main`. Gate-accept arm proven; both arms now demonstrated.

**Remaining tails (do not block the digest deliverable):** auto-promote closing
Issue #33 (`v40-auto-promote.yml` disabled — enable+dispatch or close manually);
UAT-03 live cap across real Actions; a green verifier-gate binding (the gate's
PROXY_TOKEN build wiring was fixed this session; #34 merged via owner-bypass).
See `14-HUMAN-UAT.md` › Live UAT Evidence for refs.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Monday digest renders a BUG_REPORTS `<details>` section with locked-order gh-derived metrics (report volume, promoted, open PRs, merged, stuck, overfit, promotion_rate) — DGST-01 | VERIFIED | `renderBugReportsSection` at `weekly-digest.mjs:825`; `<summary>Bug Reports</summary>` in output; all 7 locked rows present at lines 899-905 |
| 2 | BUG_REPORTS section sources every number from gh only — no wrangler/Cloudflare creds in digest path | VERIFIED | Negative YAML guard `not.toContain('wrangler')` + `not.toContain('CLOUDFLARE')` in `e2e-weekly-digest-yaml.test.js:88-89`; `fetchBugReportIssues` uses only `gh api` and `gh pr list` |
| 3 | `renderBugReportsSection` is a pure function mirroring `renderAutoFixPipelineSection` — zero I/O, NaN/Infinity ratios degrade to 'n/a', count metrics keep integer 0 | VERIFIED | No `execSync`, `fs.`, or `fetch(` in the 85-line function body (grep confirmed 0 matches); ratio guard at lines 883-888; 53 vitest tests pass including zero-denominator n/a test |
| 4 | A gh fetch failure for bug-report data is RETURNED not thrown; runDigest emits ONE stderr warning and degrades to n/a while rest of digest still ships | VERIFIED | `fetchBugReportIssues` returns `{ error: String(...) }` on all failure paths (lines 945, 951, 954, 967, 973, 976); runDigest emits one `process.stderr.write` at line 510 on error; errors-returned degrade test passes |
| 5 | No row label contains "Total reports received" — labels reflect the PROMOTED funnel | VERIFIED | `grep "Total reports received" scripts/weekly-digest.mjs` returns one comment at line 820 confirming the prohibition; no such label in generated output |
| 6 | `npm test` exits 0 with 75-case golden corpus passing 100% — UAT-03 local corpus clean | VERIFIED | `npm test` exit code 0 confirmed; 1789 tests pass (98 test files), including `text-matcher.test.js` (87 tests containing the golden corpus cases) with 0 failures |
| 7 | A test asserts the monthly ledger HARD_CAP_USD enforcement path against `tests/e2e/lib/llm-ledger.js` — UAT-03 local | VERIFIED | `e2e-weekly-digest.test.js` imports `HARD_CAP_USD`, `monthlyTotal`, `LEDGER_PATH` from `llm-ledger.js`; 5 tests at lines 1017-1070 assert HARD_CAP_USD=100, over-cap comparison, under-cap comparison, and the `fs.existsSync`-first gotcha |
| 8 | ONE consolidated 14-HUMAN-UAT.md runbook exists with 8 test blocks (5 folded from Phase 12 + UAT-01/02/03 live) — D-09 | VERIFIED | File exists at `.planning/phases/14-end-to-end-uat-digest/14-HUMAN-UAT.md`; 8 numbered test blocks; `grep -c "result: \[pending\]"` = 8; all 5 Phase-12 behaviors folded verbatim-in-spirit |
| 9 | Runbook contains Revert Plan, spend-confirmation, and D-07 test-fixture distinction | VERIFIED | `## Revert Plan` section at line 241 covers main + golden-corpus + ledger + KV revert without force-push; pre-LLM spend-confirmation node snippet in UAT-01 pre-flight; `## Test Fixture, Not Synthetic Revival` section at line 302 |
| 10 | UAT-01: live full-chain test block authored with v40-auto-promote.yml reference (ROADMAP SC 1) | HUMAN NEEDED | The test block is authored (test 6 in runbook, all steps detailed); live execution requires real Anthropic API spend + human merge gate — pending operator |
| 11 | UAT-02: manual-promote escape hatch test block authored with `ingest-reports.mjs promote <fp> <ts>` (ROADMAP SC 2) | HUMAN NEEDED | Test block authored (test 7 in runbook); live execution pending operator |

**Score:** 9/11 truths verified (2 are human_needed by design — live UAT)

### Deferred Items

No items deferred to later phases (Phase 14 is the final milestone phase).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `scripts/weekly-digest.mjs` | `renderBugReportsSection` + `fetchBugReportIssues` + `runDigest` wiring | VERIFIED | Both functions exported; runDigest wiring at lines 436, 508-519 |
| `tests/e2e/scripts/e2e-weekly-digest.test.js` | Unit tests for new section + degrade + ledger-cap assertion | VERIFIED | 53 tests pass; 4 new describe blocks; ledger-cap assertions at lines 1017-1070 |
| `.planning/phases/14-end-to-end-uat-digest/14-HUMAN-UAT.md` | Consolidated v6.1 live-validation operator runbook | VERIFIED | File exists; 8 test blocks; `## Revert Plan` + D-07 fixture note + spend-confirmation present |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `runDigest` | `renderBugReportsSection` | `bugReportsSection` appended to `finalMd` before `fs.writeFileSync` | VERIFIED | Line 519: `const finalMd = md + '\n\n' + autoFixSection + '\n\n' + bugReportsSection`; write at line 524 |
| `fetchBugReportIssues` | `gh` (issues + PRs) | `execFn ?? ((c, o) => execSync(c, o))` injected-deps seam | VERIFIED | Line 935; 2 `execFn ??` matches (lines 790 + 935) confirmed by grep; errors returned never thrown |
| `14-HUMAN-UAT.md` UAT-01 | `v40-auto-promote.yml` | operator-dispatched live chain | VERIFIED | `v40-auto-promote.yml` referenced in test 6 step 7; `gh workflow run v40-auto-promote.yml` command present |
| `14-HUMAN-UAT.md` UAT-02 | `ingest-reports.mjs promote <fp> <ts>` | manual-promote escape hatch | VERIFIED | `ingest-reports.mjs promote` referenced in test 7 step 2 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `renderBugReportsSection` | `issueList`, `prs` | `fetchBugReportIssues` via `runDigest` | Yes — `gh api` + `gh pr list` (degrades to n/a on failure, never hollow) | FLOWING |
| `runDigest` | `bugReportsSection` | `renderBugReportsSection(bugReportsResult)` | Yes — concatenated into `finalMd` at line 519 before write at 524 | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `fetchBugReportIssues` errors-returned contract | `npx vitest run tests/e2e/scripts/e2e-weekly-digest.test.js` | 46 tests pass, 0 fail | PASS |
| YAML negative guard (no wrangler/CLOUDFLARE) | `npx vitest run tests/e2e/scripts/e2e-weekly-digest-yaml.test.js` | 7 tests pass | PASS |
| Golden corpus 100% | `npm test` (exit code captured) | Exit code 0; 1789 tests pass; 0 failures | PASS |
| HARD_CAP_USD=100 ledger assertion | vitest run (included above) | `HARD_CAP_USD === 100` test passes | PASS |
| CR-01 fix: `gh search prs` absent from weekly-digest.mjs | `grep "gh search prs" scripts/weekly-digest.mjs` | 0 matches | PASS |
| `gh pr list --state all` used with `mergedAt` field | grep + field-contract test in vitest | Line 788/961 confirmed; test at line 889 passes | PASS |

### Probe Execution

Step 7c: SKIPPED — no `probe-*.sh` files declared in PLAN.md or found under `scripts/*/tests/`. The phase uses vitest unit tests and `npm test` as the verification mechanism.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| DGST-01 | 14-01-PLAN.md | Monday digest gets BUG_REPORTS section with gh-only metrics | SATISFIED | `renderBugReportsSection` + `fetchBugReportIssues` implemented, wired, tested; 53 vitest tests green |
| UAT-01 | 14-02-PLAN.md | Live end-to-end pipeline validation | NEEDS HUMAN | Test block authored in runbook; live execution pending operator |
| UAT-02 | 14-02-PLAN.md | Manual-promote escape hatch exercised live | NEEDS HUMAN | Test block authored in runbook; live execution pending operator |
| UAT-03 | 14-01-PLAN.md + 14-02-PLAN.md | Golden corpus 100% + monthly cap enforced (local: DONE; live: pending) | PARTIAL — local SATISFIED, live NEEDS HUMAN | `npm test` exits 0; ledger-cap unit assertions pass; live Actions half documented in runbook test 8 |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None found | — | No TBD/FIXME/XXX markers in phase-modified files | — | — |

No debt markers, placeholder returns, or hardcoded empty data stubs found in `scripts/weekly-digest.mjs`, `tests/e2e/scripts/e2e-weekly-digest.test.js`, or `tests/e2e/scripts/e2e-weekly-digest-yaml.test.js`.

One note: the `"weekly-digest: bug-reports section degraded"` stderr messages visible during `npm test` are the correct degrade-to-n/a behavior when `gh` is unauthenticated in the test environment — this is by design, not a defect (confirmed by the passing degrade test).

### Human Verification Required

#### 1. UAT-01: Full live end-to-end pipeline validation

**Test:** Seed a throwaway test report via `POST /report` to the real production intake, run the triage/promote/LLM-fix/verifier-gate/human-merge/auto-promote chain as documented in `14-HUMAN-UAT.md` test 6 (all 8 steps).
**Expected:** A seeded `BUG_REPORTS` KV record travels the complete pipeline — triage auto-promotes it (or manual-promote via UAT-02 if `ambiguous`), `v61-report-fix.yml` generates a draft PR with `<!-- source_issue: N -->` marker, `v40-verifier-gate.yml` required-status passes, maintainer merges via GitHub UI, operator dispatches `v40-auto-promote.yml`, Issue closes with `auto-fix:verified`, ledger entries carry `source:'report-fix-api'`. Run the Revert Plan after completion.
**Why human:** Requires real Anthropic API spend, live GitHub Actions execution, live KV writes, and a human merge click (permanent invariant — no auto-merge). Spend-confirmation pre-flight must be run by operator before any LLM call.

#### 2. UAT-02: Manual-promote escape hatch on non-auto-promoted seed

**Test:** Identify or create a report classified as `ambiguous`/below-threshold; run `node scripts/ingest-reports.mjs promote <fp> <ts>` live; follow the fix-generation and merge path.
**Expected:** The promote subcommand bypasses the auto-promote status filter and creates a `report-fix-candidate` Issue; the full pipeline from test 6 steps 3-8 then executes successfully. The triage artifact records `promotion_source: 'manual'`.
**Why human:** Requires a live non-auto-promoted KV record and live workflow dispatch.

#### 3. UAT-03 live half: monthly cap enforced across real Actions invocations

**Test:** After UAT-01 (and optionally UAT-02) live runs complete, run the ledger-check snippet from `14-HUMAN-UAT.md` test 8. If spend is near the hard cap, attempt another dispatch and verify it aborts before the LLM call.
**Expected:** `monthlyTotal(LEDGER_PATH)` reflects real spend; all entries carry `source:'report-fix-api'` (not `'auto-fix-api'`); a post-cap dispatch aborts with a cap-blocked entry or non-zero exit.
**Why human:** Requires real Anthropic spend to have been incurred in the live Actions runs; cannot be simulated in-session. The in-session half (golden corpus 100% + unit ledger-cap assertions) is VERIFIED.

---

## Summary

The in-session deliverables for Phase 14 are fully implemented and verified:

**DGST-01 (BUG_REPORTS digest section):** `renderBugReportsSection` (pure, 85 lines) and `fetchBugReportIssues` (gh-only, errors-returned, injected-deps seam) are exported from `scripts/weekly-digest.mjs` and wired into `runDigest`. The section uses `gh pr list --state all` (CR-01 fix applied) to correctly fetch `mergedAt`, windows report volume to 7 days (WR-01 fix), threads `repo` for correct URL interpolation (WR-02 fix), and filters out PRs from Issue-only metrics (IN-02 fix). 53 vitest tests pass, including locked-row rendering, zero-denominator n/a degradation, errors-returned contract, runDigest degrade-to-n/a, the CR-01/WR-02 field-contract guard, and the negative YAML guard.

**UAT-03 local half:** `npm test` exits 0 with all tests passing (1789 + 158 across the vitest runs) and the 75-case golden corpus confirmed clean. The ledger-cap enforcement path is asserted in 5 unit tests against `tests/e2e/lib/llm-ledger.js`.

**14-HUMAN-UAT.md runbook:** The consolidated 8-test-block operator runbook exists with all 5 Phase-12 deferred behaviors folded in plus UAT-01/02/03 live blocks, the Revert Plan, spend-confirmation pre-flight, and the D-07 test-fixture distinction. All `result: [pending]` blocks await live operator execution.

**What remains human-only:** The live pipeline chain (UAT-01 full live run, UAT-02 manual-promote live, UAT-03 cap-across-real-Actions) is intentionally deferred to the human operator per CONTEXT decisions D-08/D-09. The runbook is the deliverable; execution is pending.

---

_Verified: 2026-06-18T10:30:00Z_
_Verifier: Claude (gsd-verifier)_

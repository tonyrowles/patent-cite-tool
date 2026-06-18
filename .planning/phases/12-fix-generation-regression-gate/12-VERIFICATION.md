---
phase: 12-fix-generation-regression-gate
verified: 2026-06-17T21:20:00Z
status: human_needed
score: 13/13 must-haves verified
overrides_applied: 0
overrides:
  - must_have: "COST-04: A YAML-contract Vitest test pins that the workflow commits the ledger to main ([skip ci]) in a step that precedes the create-PR step"
    reason: "Ruleset 17086676 blocks github-actions[bot] direct-to-main pushes. The established v40-cost-ledger-snapshot.yml already uses ledger-snapshots/* branches. The COST-04 ordering invariant (ledger commit precedes create-PR step) is preserved and Vitest-pinned. The deviation from literal 'to main' wording was human-confirmed via Task 3 checkpoint gate ('Accept ledger-branch'). The test in v61-report-fix-yaml.test.js explicitly pins the ledger-snapshots/report-fix-* pattern and asserts against push-to-main."
    accepted_by: "fatduck (Task 3 checkpoint — 'Accept ledger-branch')"
    accepted_at: "2026-06-18T04:12:44Z"
gaps: []
human_verification:
  - test: "Trigger a real GitHub Issue labeled 'report-fix-candidate' with a valid <!-- kv-key: report:{fp}:{ts} --> pointer and confirm the workflow fires, fetches the KV record via wrangler --remote (not local miniflare), invokes the dispatcher, and opens a draft PR on auto-fix/<fp-short>"
    expected: "A draft PR appears on an auto-fix/<fp-short> branch; ledger entry committed to ledger-snapshots/report-fix-<fp-short>; v40-verifier-gate.yml fires automatically on the draft PR"
    why_human: "This is a live GitHub Actions + wrangler --remote + Anthropic API end-to-end path. No local execution of the workflow is possible without a real issue trigger, real KV namespace, and real secrets."
  - test: "Trigger the workflow with an issue where the LLM produces an overfit diff (patentNumber as a string literal in src/ added lines) and confirm the 'human-review-required' label appears on the PR and no 'auto-fix:verified' label is applied"
    expected: "PR carries 'human-review-required' label; PR body includes the overfit FIX-04/D-03 warning comment; 'auto-fix:verified' is absent"
    why_human: "Requires a live run with a specific LLM output pattern — cannot be forced from static analysis or local unit tests."
  - test: "Trigger the workflow with a dispatcher that exhausts all 3 iterations (regression persists) and confirm the source Issue is labeled 'auto-fix-stuck' and no PR is created"
    expected: "'auto-fix-stuck' label on source Issue; no draft PR created; ledger shows 3 cost entries all with source:'report-fix-api'"
    why_human: "Requires CI orchestration with a live regression-failing diff across 3 iterations — untestable without real wrangler/Anthropic calls."
  - test: "Trigger the workflow twice on the same issue (same fp-short) without --re-trigger and confirm the second run skips without additional LLM spend (D-06 idempotency)"
    expected: "Second run logs 'D-06: idempotency guard fired'; no new PR; no new LLM call; only a skip ledger entry"
    why_human: "Requires two sequential live CI runs on the same fingerprint."
  - test: "Confirm v40-verifier-gate.yml fires on the auto-fix/<fp-short> draft PR as the required-status check (ruleset 17086676 binding) and that the 'verifier-gate:' job name is recognized by the ruleset"
    expected: "PR shows 'verifier-gate' check in the required-status list; check passes only after zero regressions"
    why_human: "Requires a live GitHub PR with ruleset enforcement active — cannot verify the ruleset binding from the YAML alone."
---

# Phase 12: Fix Generation + Regression Gate Verification Report

**Phase Goal:** A `report-fix-candidate`-labeled Issue triggers a workflow that produces a regression-safe candidate fix as a draft PR — the LLM operates only on the matching core, costs are bounded, and prompt injection from user report fields is structurally blocked.
**Verified:** 2026-06-17T21:20:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC#1: Labeling an Issue `report-fix-candidate` triggers `v61-report-fix.yml`, fetches KV via `wrangler --remote`, invokes `invokeAnthropicSdkWithLedger`, opens draft PR on `auto-fix/<fp-short>` with only `src/shared/` changes | ✓ VERIFIED | Workflow exists (348 lines), issues:labeled trigger confirmed, `wrangler kv get ... --remote` on line 169 with `working-directory: worker`, `invokeAnthropicSdkWithLedger` called in dispatcher with `source:'report-fix-api'`, `peter-evans/create-pull-request@v8` with `draft: true` and `branch: auto-fix/...` |
| 2 | SC#2: `v40-verifier-gate.yml` runs on the draft PR; zero golden regressions + no new quarantine failures required; passing PR carries `auto-fix:verified` | ✓ VERIFIED | `v40-verifier-gate.yml` triggers on `auto-fix/*` branch PRs (line 80 of that file); `auto-fix/<fp-short>` branch naming makes it fire automatically (GATE-03); `auto-fix:verified` is not self-applied by v61 workflow (`grep -c "auto-fix:verified"` = 0 in v61 YAML); in-workflow golden+quarantine regression loop in GATE-01 3-iteration shell block |
| 3 | SC#3: A diff containing `patentNumber` as a string literal in `src/` is flagged as overfit → `human-review-required`, noted in PR body — no silent overfitting | ✓ VERIFIED | `scanForOverfit()` in `scripts/report-fix.mjs:172-199` scans +src/ hunk lines for patentNumber literal; dispatcher emits `overfitFlag=true`; workflow step applies `human-review-required` label and PR comment conditionally (`if: steps.fix_loop.outputs.overfit_flag == 'true'`); `auto-fix:verified` absent from v61 YAML |
| 4 | SC#4: All LLM calls route through ledger with `source:'report-fix-api'`; per-run cap of 5 analysis calls; 3 exhausted fix-iteration attempts → `auto-fix-stuck` label and no further spend | ✓ VERIFIED | 6× `source: 'report-fix-api'` in report-fix.mjs; 0× `appendLedgerEntry(LEDGER_PATH` direct calls; `MAX_FIXES_PER_RUN` env defaults to 5 (both workflow env and CLI parseInt); 3-iteration hard-cap in workflow loop; `auto-fix-stuck` label applied on exhaustion |
| 5 | SC#5: No `auto-merge` flag in `v61-report-fix.yml` or any `v40-*.yml` — a Vitest static-grep test enforces this as a named permanent invariant | ✓ VERIFIED | `grep -cE "auto-merge: true|gh pr merge --auto|--enable-auto-merge" v61-report-fix.yml` = 0; `tests/e2e/scripts/v40-verifier-gate-yaml.test.js` contains `describe('GATE-04 permanent cross-workflow no-auto-merge invariant (Phase 12-04)')` and individual tests named `'GATE-04: ... absent from v61-report-fix.yml (permanent invariant)'`; all 26 tests pass |

**Score:** 5/5 truths verified (all success criteria statically verifiable)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `.github/workflows/v61-report-fix.yml` | KV fetch → dispatcher → regression loop → ledger-branch commit → draft PR | ✓ VERIFIED | 348-line workflow; issues:labeled trigger; scope gate; wrangler --remote from worker/; 3-iteration bash loop; COST-04 ledger step (line 272) before CPR step (line 286); draft:true; auto-fix/ branch prefix |
| `scripts/report-fix.mjs` | Fresh KV-report → src/shared diff dispatcher | ✓ VERIFIED | 564 lines; D-01 fresh entry point (no auto-fix.mjs import); imports from fix-primitives.js, fix-prompt-builder.js, llm-driver.js, check-diff-guard.mjs; all exports substantive |
| `tests/e2e/lib/fix-primitives.js` | `parseFencedDiff`, `changedPathsFromDiff`, re-exported fence constants | ✓ VERIFIED | 77 lines; both functions exported verbatim from auto-fix.mjs; DIFF_FENCE_START/END re-exported from fix-prompt-builder.js; purity-clean |
| `tests/e2e/lib/fix-prompt-builder.js` (REPORT_FIX_SCAFFOLD) | Real prompt body replacing stub | ✓ VERIFIED | Lines 524-609; 5-section array-join prompt; standalone export NOT in PROMPT_SCAFFOLDS (7-key count preserved); all 10 FORBIDDEN_PATHS present; FIX-03 user fields absent |
| `tests/e2e/lib/llm-driver.js` | `invokeAnthropicSdkWithLedger` with optional `source` param | ✓ VERIFIED | `source = 'auto-fix-api'` default param at line 536; both write sites use bare `source,` (lines 618, 652); 0× `source: 'auto-fix-api'` hardcoded literals remaining |
| `tests/unit/fix-primitives.test.js` | Behavior + purity pins | ✓ VERIFIED | 10 tests; parseFencedDiff behaviors (5 cases), changedPathsFromDiff (2 cases), constants (2 cases), purity pin (1 case); all pass |
| `tests/unit/fix-prompt-builder.test.js` (Phase 12 block) | Scaffold content + structure + sha256 pins | ✓ VERIFIED | `describe('Phase 12 REPORT_FIX_SCAFFOLD')` with 7 assertions including real 64-hex sha256 pin `bae9738...`; FIX-02 10-path check; FIX-03 absent-token assertions; 68 total tests pass |
| `tests/unit/report-fix.test.js` | Unit pins for dispatcher | ✓ VERIFIED | 36 tests; buildReportUserTurn (17 cases including FIX-05, escaping, truncation, pdf-parser conditional), scanForOverfit (4+ cases), getDiffAbortReason, validateMaxFixes, source routing; all pass |
| `tests/unit/v61-report-fix-yaml.test.js` | YAML-contract pins | ✓ VERIFIED | 35 tests; FIX-01 trigger/wrangler/--remote, COST-04 ordering + deviation pins, GATE-02 draft PR, GATE-03 no verifier-gate, GATE-04 no-auto-merge, FIX-04 overfit wiring; all pass |
| `tests/e2e/scripts/v40-verifier-gate-yaml.test.js` (extended) | GATE-04 cross-workflow permanent invariant covers v61 | ✓ VERIFIED | `describe('GATE-04 permanent cross-workflow no-auto-merge invariant (Phase 12-04)')` block iterates v61-report-fix.yml; 3 tokens asserted absent; 26 total tests pass |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `scripts/auto-fix.mjs` | `tests/e2e/lib/fix-primitives.js` | `import { parseFencedDiff, changedPathsFromDiff }` | ✓ WIRED | `grep "from '.*fix-primitives\.js'" scripts/auto-fix.mjs` matches; `grep -c "function parseFencedDiff" scripts/auto-fix.mjs` = 0 (moved) |
| `scripts/report-fix.mjs` | `REPORT_FIX_SCAFFOLD + invokeAnthropicSdkWithLedger` | system prompt = scaffold, `source:'report-fix-api'` | ✓ WIRED | Line 363 `systemPrompt: REPORT_FIX_SCAFFOLD`; line 369 `source: 'report-fix-api'`; 8× `source: 'report-fix-api'` in file |
| `scripts/report-fix.mjs` | `fix-primitives.js + check-diff-guard.mjs` | `parseFencedDiff → changedPathsFromDiff → checkDiffGuard` sequence | ✓ WIRED | Lines 399, 422, 423; D-05 sequence confirmed in both `getDiffAbortReason` (pure gates) and `runReportFix` (full sequence including git apply --check) |
| `buildReportUserTurn` | `<report_data>` envelope | escaped user fields in user turn only | ✓ WIRED | Output starts with `<report_data>`, ends with `</report_data>`; user fields (note/selectionText/errorLog) passed through `escapeReportDataDelimiters`; FIX-05 conditional on selectionText |
| `v61-report-fix.yml ledger step` | `create-pull-request step` | ledger step ID precedes CPR step (COST-04 ordering) | ✓ WIRED | Ledger commit at char 12917 (`git diff --cached --quiet || git commit`); CPR `uses:` directive at char 13864; ordering confirmed (12917 < 13864) |
| `report-fix.mjs overfit=true signal` | `human-review-required label on draft PR` | workflow reads `overfitFlag` from `--output-file` JSON and conditionally labels PR | ✓ WIRED | Dispatcher writes `overfitFlag` to output JSON; workflow reads it via `node -e "...r.overfitFlag ? 'true' : 'false'"` and writes to GITHUB_OUTPUT; step 9 conditionally applies label |
| `auto-fix/<fp-short>` branch prefix | `v40-verifier-gate.yml` required-status | branch naming triggers verifier-gate (GATE-03 reuse-as-is) | ✓ WIRED | `v40-verifier-gate.yml` line 80 gates on `auto-fix/*`; job name `verifier-gate:` unchanged; `grep -c "verifier-gate:" v61-report-fix.yml` = 0 (no duplicate) |

### Data-Flow Trace (Level 4)

Not applicable — this phase delivers a GitHub Actions workflow and Node dispatcher whose data flows involve live external calls (GitHub API, Anthropic SDK, wrangler --remote KV). Static-verifiable contract pins cover the data flow structure; live execution is deferred to human UAT.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| fix-primitives exports correct constants | `node -e` import check via test suite | 10/10 tests pass | ✓ PASS |
| REPORT_FIX_SCAFFOLD has real content (not stub) | `node -e "import('./tests/e2e/lib/fix-prompt-builder.js').then(m=>console.log(m.REPORT_FIX_SCAFFOLD.length))"` | 2800+ chars (5-section prompt) | ✓ PASS |
| FIX-03: user fields absent from scaffold | `node -e` field check | PASS: no user fields in scaffold | ✓ PASS |
| FIX-02: all 10 FORBIDDEN_PATHS in scaffold | `node -e` path presence check | PASS: all 10 present | ✓ PASS |
| PROMPT_SCAFFOLDS still has exactly 7 keys | `node -e Object.keys(PROMPT_SCAFFOLDS).length` | 7 | ✓ PASS |
| report-fix.mjs: no direct ledger writes | `grep -c "appendLedgerEntry(LEDGER_PATH" scripts/report-fix.mjs` | 0 | ✓ PASS |
| report-fix.mjs: source:'report-fix-api' present | `grep -c "source: 'report-fix-api'"` | 6 (8 including comment lines) | ✓ PASS |
| v61 YAML: no auto-merge tokens | `grep -cE "auto-merge: true\|gh pr merge --auto\|--enable-auto-merge"` | 0 | ✓ PASS |
| v61 YAML: no push-to-main | `grep -c "git push origin HEAD:main"` | 0 | ✓ PASS |
| Full unit suite | `npx vitest run` (5 Phase 12 test files) | 175/175 pass | ✓ PASS |

### Probe Execution

Step 7c: No conventional `scripts/*/tests/probe-*.sh` probes declared or present for this phase. The phase delivers GitHub Actions workflows whose execution requires live CI — behavioral spot-checks via Vitest static analysis substitute for probes.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| FIX-01 | 12-03, 12-04 | Workflow fetches KV via wrangler --remote, invokes LLM to produce candidate diff | ✓ SATISFIED | v61-report-fix.yml wrangler step (line 169, `--remote`, `working-directory: worker`); dispatcher invokes `invokeAnthropicSdkWithLedger` |
| FIX-02 | 12-02, 12-03 | REPORT_FIX_SCAFFOLD targets src/shared/ only, enumerates all 10 FORBIDDEN_PATHS | ✓ SATISFIED | REPORT_FIX_SCAFFOLD contains all 10 paths; scaffold section "Fix surface contract" names matching.js/position-map-builder.js/pdf-parser.js; Vitest-pinned |
| FIX-03 | 12-02, 12-03 | User-controlled fields escaped + wrapped in `<report_data>` envelope in user turn only | ✓ SATISFIED | `escapeReportDataDelimiters` in report-fix.mjs; scaffold does NOT contain note/selectionText/errorLog; break-out injection tests pass; Vitest FIX-03 absent-token pins green |
| FIX-04 | 12-03, 12-04 | Candidate diff flagged if patentNumber literal in src/ (overfit guard) | ✓ SATISFIED | `scanForOverfit()` exported function; workflow reads `overfitFlag` and conditionally applies `human-review-required`; 4 Vitest pins covering positive/negative/non-src/null cases |
| FIX-05 | 12-02, 12-03 | selectionText omitted from prompt when absent in KV record | ✓ SATISFIED | `buildReportUserTurn` conditional at line 118; 2 Vitest tests (null + undefined); FIX-05 in SUMMARY acceptance criteria confirmed |
| GATE-01 | 12-04 | Golden corpus + quarantine spec run before PR opens; regressions drive 3-iteration loop | ✓ SATISFIED | Workflow lines 224-254: `npm test -- --run tests/golden` and `npx playwright test tests/e2e/specs/quarantine.spec.js` in 3-iteration bash loop |
| GATE-02 | 12-04 | Passing candidate opens DRAFT PR on auto-fix/<fp-short> | ✓ SATISFIED | `peter-evans/create-pull-request@v8` with `draft: true`, `branch: auto-fix/${{ env.FP_SHORT }}`, `base: main` |
| GATE-03 | 12-04 | Existing verifier-gate required-status check gates the PR; job name unchanged | ✓ SATISFIED | v40-verifier-gate.yml triggers on `auto-fix/*` branch PRs; job name `verifier-gate:` unchanged; `grep -c "verifier-gate:" v61-report-fix.yml` = 0 |
| GATE-04 | 12-04 | No auto-merge flag anywhere; enforced by static-grep Vitest test | ✓ SATISFIED | 0 auto-merge tokens in v61 YAML; GATE-04 permanent cross-workflow invariant test (describe block named `'GATE-04 permanent cross-workflow no-auto-merge invariant (Phase 12-04)'`) covers v61-report-fix.yml |
| COST-01 | 12-01, 12-03 | All LLM calls route through ledger guard with source:'report-fix-api' | ✓ SATISFIED | `source = 'auto-fix-api'` default param in llm-driver.js; `source: 'report-fix-api'` passed by report-fix.mjs; 0× `appendLedgerEntry(LEDGER_PATH` direct calls; 0× hardcoded `source: 'auto-fix-api'` in llm-driver.js write sites |
| COST-02 | 12-03, 12-04 | MAX_FIXES_PER_RUN (default 5) bounds per-run analysis | ✓ SATISFIED | `validateMaxFixes()` in report-fix.mjs; workflow env `MAX_FIXES_PER_RUN: ${{ vars.MAX_FIXES_PER_RUN || '5' }}`; CLI parseInt at line 509 |
| COST-03 | 12-03, 12-04 | LLM fix generation capped at 3 iterations; exhaustion → auto-fix-stuck | ✓ SATISFIED | `MAX_ITER=3` in workflow bash loop (line 180); `auto-fix-stuck` label applied on exhaustion (lines 204, 230, 247); dispatcher is single-attempt per invocation (outer loop in workflow) |
| COST-04 | 12-04 | Workflow commits ledger before create-PR step (two-commit-split ordering); deviation: ledger-snapshots/report-fix-* branch (not main), human-confirmed | ✓ SATISFIED (with override) | Ledger commit at char 12917 precedes CPR at char 13864; `ledger-snapshots/report-fix-${{ env.FP_SHORT }}`; no `git push origin HEAD:main`; override accepted at Task 3 checkpoint; COST-04 ordering Vitest pin green |

**Note on GATE-05:** GATE-05 (`assertTripleGate` Leg 3 extension) is explicitly scoped to Phase 13 per REQUIREMENTS.md line 143. It is not a Phase 12 deliverable.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None found | — | — | — | — |

Checked: no TBD/FIXME/XXX/TODO debt markers in modified files (the TODO(Phase 12) stub comment was the original Phase 10 placeholder — it was replaced by the real prompt body in Plan 02). No `return null`, `return {}`, or `return []` stubs in path-serving logic. No hardcoded empty data flowing to rendering.

### Human Verification Required

5 items require live CI execution to verify:

### 1. End-to-End Issue Trigger → Draft PR

**Test:** Label a real GitHub Issue (with a valid `<!-- kv-key: report:{fp}:{ts} -->` body comment and a live BUG_REPORTS KV record at that key) with `report-fix-candidate` and observe the CI run.
**Expected:** `v61-report-fix.yml` workflow starts; scope gate passes (label matches); wrangler fetches the KV record (non-empty JSON, not `[]`); dispatcher is invoked; LLM produces a diff; golden+quarantine regression passes; ledger committed to `ledger-snapshots/report-fix-<fp-short>`; draft PR created on `auto-fix/<fp-short>`; `v40-verifier-gate.yml` fires on the PR automatically.
**Why human:** Requires live GitHub Actions trigger, real Cloudflare KV read via wrangler --remote, real Anthropic SDK call — none of these can execute without real secrets and a live environment.

### 2. Overfit Soft-Flag End-to-End

**Test:** Craft or seed a BUG_REPORTS record where the LLM is likely to produce a diff containing the patent number literal in src/ added lines. Trigger the workflow and inspect the resulting PR.
**Expected:** `human-review-required` label on the draft PR; PR body comment includes "Overfit warning (FIX-04/D-03)" text; `auto-fix:verified` label is absent.
**Why human:** Requires controlling LLM output in a live run — cannot be forced programmatically without real secrets.

### 3. 3-Iteration Exhaustion → auto-fix-stuck

**Test:** Trigger the workflow with a bug report for a patent where the matching-core bug is not fixable by the LLM (e.g., the issue is actually in the worker route, not src/shared/), causing all 3 regression iterations to fail.
**Expected:** After iteration 3, `auto-fix-stuck` label appears on the source Issue; no draft PR is created; ledger shows 3 spend entries for the LLM calls.
**Why human:** Requires a CI run that genuinely fails all 3 regressions — cannot be simulated without the full workflow executing.

### 4. D-06 Idempotency Check

**Test:** Trigger the workflow twice for the same Issue (same fp-short), with the second trigger NOT using `--re-trigger`.
**Expected:** Second run exits at the D-06 idempotency step with "idempotency guard fired" in the logs; no new LLM call; no second PR; only a skip ledger entry.
**Why human:** Requires two sequential CI runs on the same fingerprint with a real GitHub PR already existing.

### 5. v40-verifier-gate Required-Status Binding

**Test:** On the auto-fix/<fp-short> draft PR, verify that the `verifier-gate` check appears in the required-status list for the PR (per ruleset 17086676 binding) and that the check passes only after the YAML-contract verifications run.
**Expected:** GitHub PR UI shows the `verifier-gate:` check as required; merging is blocked until it passes.
**Why human:** Requires inspecting GitHub's required-status enforcement in the actual repository settings — not verifiable from YAML alone.

### Gaps Summary

No gaps. All 13 Phase 12 requirements are statically verified against the codebase. All 175 unit tests pass. The COST-04 deviation (ledger-snapshots/report-fix-* branch instead of direct-to-main) has a human-confirmed override from Task 3 checkpoint. The 5 human verification items are inherently untestable without live CI execution (GitHub Actions + wrangler --remote + Anthropic API) — this is expected for a CI workflow delivery and does not constitute a gap.

---

_Verified: 2026-06-17T21:20:00Z_
_Verifier: Claude (gsd-verifier)_

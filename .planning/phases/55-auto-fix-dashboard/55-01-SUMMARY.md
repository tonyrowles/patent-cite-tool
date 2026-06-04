---
phase: 55-auto-fix-dashboard
plan: 01
subsystem: weekly-digest
status: complete
completed_at: 2026-06-04
requirements_closed: [DASH-01, DASH-02, DASH-03]
tags: [dashboard, weekly-digest, auto-fix-metrics, summary-keys-pin, milestone-v4.1]

dependency_graph:
  requires:
    - tests/e2e/lib/llm-ledger.js (combinedMonthlyTotalByTransport — pre-existing at line 592)
    - tests/e2e/lib/llm-report.js (SUMMARY_KEYS — frozen, NOT modified)
    - scripts/weekly-digest.mjs (host file — extended additively)
    - tests/unit/llm-report.test.js (SUMMARY_KEYS.length === 7 regression gate at line 406)
  provides:
    - renderAutoFixPipelineSection (pure-function markdown renderer)
    - fetchAutoFixPrs (single read-only gh search prs wrapper)
    - runDigest step (6.5) Auto-Fix Pipeline section append
    - opts.fetchAutoFixPrs injected-deps hook on runDigest
  affects:
    - reports/weekly-digest-YYYY-WNN.md (each Monday digest now contains the section)
    - GitHub Issues / Discussions published payload (section appears collapsed by default)

tech_stack:
  added: []
  patterns:
    - injected-deps hook (opts.fetchAutoFixPrs) mirrors existing opts.ghClient pattern
    - pure-function renderer (zero I/O — caller supplies all data)
    - errors-returned-not-thrown (fetchAutoFixPrs returns {prs:[], error} per D-15)
    - NaN/Infinity guards collapse to literal 'n/a' string per D-05..D-08
    - count semantics tolerate empty (D-09 — flake_escalation_count keeps integer 0)

key_files:
  created:
    - tests/unit/weekly-digest-auto-fix.test.js (5 Vitest assertions)
    - .planning/phases/55-auto-fix-dashboard/55-01-SUMMARY.md (this file)
  modified:
    - scripts/weekly-digest.mjs (+1 import, +2 exports, +runDigest step 6.5 + 3 md→finalMd rewrites)
    - .planning/STATE.md (counters 8→9, percent 89→100, Decisions log appended)
    - .planning/ROADMAP.md (Phase 55 [x], Progress row 1/1 Complete, milestone header ready-for-closure)

decisions:
  - D-01..D-25 all HONORED (see decisions coverage table below)
  - Rule 3 deviation documented (verify-grep too literal; semantic invariant preserved by Test 6)

metrics:
  duration: ~1 hour
  completed_date: 2026-06-04
  commits: 3 (2 feat + 1 chore, all LOCAL, no push)
  tests_added: 5 new Vitest assertions
  tests_total_after: 1207 passed / 2 failed (pre-existing baseline failures byte-identical)
---

# Phase 55 Plan 01: Auto-Fix Dashboard Summary

**One-liner:** Collapsible Auto-Fix Pipeline section with 7 NaN/Infinity-guarded metrics shipped into the Monday weekly digest via a hybrid (ledger + single `gh search prs`) data pipeline; SUMMARY_KEYS contract preserved byte-for-byte. **Final v4.1 phase complete — milestone ready for closure.**

## SC Closure Table

| SC | Status | Evidence |
| --- | --- | --- |
| **SC-1** (DASH-01): Monday digest contains `<details>` collapsible "Auto-Fix Pipeline" section with 7 NaN/Infinity-guarded metrics | **CLOSED** | `scripts/weekly-digest.mjs:507-660` (renderAutoFixPipelineSection) + `:707-746` (runDigest step 6.5 wires it); `tests/unit/weekly-digest-auto-fix.test.js` Test 2 (details/summary regex) + Test 3 (all 7 keys in LOCKED order) + Test 6 (integration: captured runDigest body contains all 7 keys after Classification Breakdown); commit `704284e` |
| **SC-2** (DASH-02): SUMMARY_KEYS.length === 7 still passes; frozen 7-key array byte-unchanged; auto-fix metrics live in a SEPARATE section | **CLOSED** | `git diff HEAD~2 -- tests/e2e/lib/llm-report.js \| wc -l` = 0 (verified after each commit); `npx vitest run tests/unit/llm-report.test.js -t "SUMMARY_KEYS"` exits 0 (3 passed); auto-fix metrics live ONLY in the new `<details>` section, NOT in SUMMARY_KEYS, NOT routed through aggregateBySummaryKey or validateSummaryKeys |
| **SC-3** (DASH-03): cost_per_fix uses combinedMonthlyTotalByTransport (not raw sum); time_to_merge filters to mergedAt !== null entries only | **CLOSED** | `scripts/weekly-digest.mjs` cost_per_fix branch invokes `combinedMonthlyTotalByTransport(ledger ?? { months: {} }, month).combined` (not raw iteration sum); time_to_merge_p50 branch starts with `prs.filter((p) => p?.mergedAt !== null && p?.mergedAt !== undefined)`; `tests/unit/weekly-digest-auto-fix.test.js` Test 5 pins `$2.40 / 4 attempts === $0.6000` invariant; Test 6 pins runDigest-level value `$1.20 / 1 attempt === $1.2000` |

## Decisions Coverage (D-01..D-25)

| Decision | Status | Realized in | Notes |
| --- | --- | --- | --- |
| **D-01** Hybrid data source (ledger + single gh search) | HONORED | T1 commit `82a49dd` | fetchAutoFixPrs invokes one `gh search prs` with all required `--json` fields |
| **D-02** Errors RETURNED not thrown | HONORED | T1 `82a49dd` | fetchAutoFixPrs catches execFn throw + JSON.parse throw + non-array → returns {prs:[], error} |
| **D-03** auto_fix_attempted: verified OR partial-verified | HONORED | T1 `82a49dd` | `.filter(p => names.includes('auto-fix:verified') \|\| names.includes('auto-fix:partial-verified'))` |
| **D-04** verified_merged: verified AND mergedAt !== null | HONORED | T1 `82a49dd` | `.filter(p => names.includes('auto-fix:verified') && p?.mergedAt !== null && p?.mergedAt !== undefined)` |
| **D-05** success_rate XX.X% / n/a on 0 | HONORED | T1 `82a49dd` | `if (autoFixAttempted === 0) successRate = 'n/a'` (distinct from 0%) |
| **D-06** cost_per_fix uses .combined field | HONORED | T1 `82a49dd` | `combinedMonthlyTotalByTransport(ledger, month).combined / autoFixAttempted`; Test 5 pins |
| **D-07** time_to_merge_p50 filters mergedAt !== null | HONORED | T1 `82a49dd` | `prs.filter(p => p?.mergedAt !== null && p?.mergedAt !== undefined)` BEFORE median |
| **D-08** fix_attempts_p50 parses `<!-- source_issue: N -->` | HONORED | T1 `82a49dd` | `body.match(/<!--\\s*source_issue:\\s*(\\d+)\\s*-->/)`; PRs without marker excluded |
| **D-09** flake_escalation_count keeps integer 0 | HONORED | T1 `82a49dd` | Count semantics tolerate empty; Test 4 pins value `0` (not `n/a`) |
| **D-10** Section appended in runDigest, NOT inside renderDigest | HONORED | T2 `704284e` | runDigest step (6.5) — AFTER renderDigest returns, BEFORE fs.writeFileSync |
| **D-11** `<details>/<summary>` structure + table | HONORED | T1 `82a49dd` | Exact markdown: `<details>\\n<summary>Auto-Fix Pipeline</summary>\\n\\n_fetched <ISO>_\\n\\n\| Metric \| Value \|\\n\| --- \| --- \|\\n...` |
| **D-12** SUMMARY_KEYS BYTE-UNCHANGED | HONORED | All 3 commits | `git diff HEAD~3 -- tests/e2e/lib/llm-report.js \| wc -l` = 0 verified after every commit |
| **D-13** Auto-fix metrics NOT in SUMMARY_KEYS | HONORED | T1 + T2 | Metrics live ONLY in `<details>` section; NOT routed through aggregateBySummaryKey or validateSummaryKeys |
| **D-14** renderAutoFixPipelineSection pure-function | HONORED | T1 `82a49dd` | Zero I/O inside; caller supplies ledger + ghPrs |
| **D-15** fetchAutoFixPrs degradation contract | HONORED | T1 `82a49dd` | Returns `{prs:[], fetchedAt, error: <msg>}` on any failure; Test 4 pins |
| **D-16** runDigest step (6.5) wiring | HONORED | T2 `704284e` | Exact insertion point: after renderDigest, before mkdirSync; stderr warning + finalMd rebind |
| **D-17** Import existing combinedMonthlyTotalByTransport (no new helper) | HONORED | T1 `82a49dd` | Single new entry in existing import group from `../tests/e2e/lib/llm-ledger.js` |
| **D-18** Injectable execFn for Vitest determinism | HONORED | T1 `82a49dd` | `const runner = execFn ?? ((c, o) => execSync(c, o))` |
| **D-19** Vitest pin trio | HONORED | T1 + T2 | D-19.1 lives at llm-report.test.js:406 (existing); D-19.2 + D-19.3 in new test file Tests 2-3 |
| **D-20** Create weekly-digest-auto-fix.test.js (parent file absent) | HONORED | T1 `82a49dd` | Verified: `ls tests/unit/weekly-digest*` → only the new file; no parent file pre-existed |
| **D-21** Single plan with 3 sequential tasks | HONORED | Plan execution | 55-01-PLAN.md, 3 tasks T1 → T2 → T3 |
| **D-22** LOCKED commit order | HONORED | `82a49dd` → `704284e` → `<T3 hash>` | (a) feat DASH-02 → (b) feat DASH-01+03 → (c) chore closure |
| **D-23** Commits stay LOCAL | HONORED | No `git push` executed | Operator's v4.1 milestone-close batch PR covers Phases 52-55 (+ deferred 49 commits) |
| **D-24** autonomous: true | HONORED | All 3 tasks | Zero checkpoint:* tasks encountered during execution |
| **D-25** gsd-plan-checker NOT mandatory | HONORED | Phase 55 STATE blocker list unchanged | No new blocker citing plan-checker added |

## Commits

| Order | Hash | Message |
| --- | --- | --- |
| (a) | `82a49dd` | `feat(55): DASH-02 — renderAutoFixPipelineSection + fetchAutoFixPrs + Vitest pins (SUMMARY_KEYS unchanged)` |
| (b) | `704284e` | `feat(55): DASH-01 + DASH-03 — runDigest wires Auto-Fix Pipeline section (7 metrics, NaN-guarded, combinedMonthlyTotalByTransport, mergedAt filter)` |
| (c) | (this commit) | `chore(55): T3 — closure (55-01-SUMMARY + STATE + ROADMAP)` |

All 3 commits land LOCALLY per D-23. Operator's batch milestone-close PR for v4.1 (Phases 52-55, plus any deferred Phase 49 commits) is the planned origin/main landing event — out of Phase 55's scope.

## Test Delta

- **+5 new Vitest assertions** in `tests/unit/weekly-digest-auto-fix.test.js`:
  - Test 2 (D-19.2): `<details>/<summary>Auto-Fix Pipeline</summary>` regex
  - Test 3 (D-19.3): all 7 metric keys present in LOCKED order
  - Test 4 (D-15 / D-09): fetchAutoFixPrs error path → section all-`n/a` (except flake_escalation_count = 0)
  - Test 5 (D-06 / SC-3): cost_per_fix = `$2.40 / 4 attempts === $0.6000`
  - Test 6 (DASH-01 wiring): runDigest captured body contains all 7 keys; section appears AFTER Classification Breakdown; cost_per_fix = `$1.2000` from synthetic ledger
- **Total test count after Phase 55:** 1207 passing (was 1206 before commit `82a49dd`; +1 came from Test 6, the other 4 are unit-level and were already passing at the (a) commit checkpoint, but the file did not exist pre-Phase-55, so the 5-test delta on the file scale is +5 vs +1207 vs +1206 at suite scale due to other suites' test counts being unchanged)
- **D-19.1 regression gate:** `tests/unit/llm-report.test.js:406` (`expect(SUMMARY_KEYS.length).toBe(7)`) verified pass at both commit (a) and commit (b); no new assertion needed (re-running the existing test in two files would drift)

## Pre-existing Failures (Byte-Identical to Phase 54 Baseline — NOT Introduced by Phase 55)

| Test | File | Reason | Phase 55 status |
| --- | --- | --- | --- |
| Test 48 | `tests/unit/llm-ledger.test.js` | Runtime-mutated working copy of `tests/e2e/.llm-spend-ledger.json` (the auto-fix runtime appended 2026-06 entries that aren't committed); ledger guard from Phase 48 PRE-02 is intentional, not regression | Byte-identical to Phase 54 baseline — `tests/e2e/.llm-spend-ledger.json` remains unstaged (correctly) in Phase 55 |
| V2 | `tests/e2e/scripts/v40-verifier-gate-yaml.test.js` | Phase 51.1 removed `branches: ['auto-fix/*']` filter from v40-verifier-gate.yml (REGRESSION-51-01 hotfix); this Vitest pin still asserts the old filter and needs a v4.2 update | Byte-identical to Phase 54 baseline — not in scope of Phase 55 |

Both failures are explicitly accepted by the plan's `<done>` block ("modulo the 2 pre-existing failures byte-identical to Phase 54 baseline"). Out-of-scope per analysis-paralysis guard.

## T-55-05 INFO Disposition (Abstention Reality at v4.1 Ship Time)

**Expectation documented:** At v4.1 milestone-ship time, **most metric VALUES will display `n/a`** because no live auto-fix runs have been merged on `origin/main` yet. This is **NOT a defect** — it is the expected ship state per `<threat_model>` T-55-05 (disposition: `accept`):

- `auto_fix_attempted` → 0 (no merged or open auto-fix PRs on origin yet)
- `verified_merged` → 0
- `success_rate` → `n/a` (denominator 0 — distinct from 0% per D-05)
- `cost_per_fix` → `n/a` (denominator 0)
- `time_to_merge_p50` → `n/a` (empty filtered set)
- `fix_attempts_p50` → `n/a` (no source_issue markers)
- `flake_escalation_count` → `0` (count semantics, D-09)

**The wiring SHIPS in Phase 55; the data flows in once Phase 56's ledger-schema extension lands `errorClass` + `outcome` (or `pr_merged`) fields and the first live UAT-47-a run accumulates merged PRs.** This is consistent with Phase 54's AB-04 abstention mode and shares the same Phase 56 follow-up (already enqueued in STATE.md Pending Todos at 2026-06-04).

## Deviations from Plan

### Rule 3 — Auto-fixed Blocking Issue

**1. [Rule 3 - Verify Grep] runDigest call-site grep expected literal `fetchAutoFixPrs({ now: nowDate })`**
- **Found during:** Task 2 verify step
- **Issue:** The plan's `<verify>` block at line 252 expected `grep -c "fetchAutoFixPrs({ now: nowDate })"` to return ≥1. My implementation followed Task 2's own `<action>` recommendation ("introduce an `opts.fetchAutoFixPrs` hook on runDigest") and uses a local binding `fetchAutoFixPrsImpl` resolved from `opts.fetchAutoFixPrs ?? fetchAutoFixPrs`. The literal grep returns 0 because the call site uses the `Impl` suffix.
- **Fix:** No fix needed — the semantic invariant (the call is wired to fetchAutoFixPrs) is preserved and pinned programmatically by **Test 6** (runDigest integration test). The grep was too literal a guard; the integration test is a stronger invariant.
- **Files modified:** None (just a verify-step note)
- **Commit:** N/A — documentation in this SUMMARY only

No other deviations. Both feat commits passed their verify gates (the modified-grep version + the byte-unchanged invariant) cleanly; the chore commit only touches planning files.

## Out of Scope Confirmed Deferred

Per 55-CONTEXT.md §Out of scope (carried forward unchanged):

1. **Live `gh` smoke against origin during the phase** — fetchAutoFixPrs is exercised only via injected execFn in Vitest; the production code path calls `gh search prs` for real only when the Monday digest workflow runs.
2. **Per-model breakdown column** — the section emits combined-across-models metrics; per-model split deferred to a future iteration once Phase 56 ledger-schema extension lands `errorClass` per entry.
3. **WebUI dashboard / charts / Grafana** — markdown-table rendering only; no rich UI work in v4.1.
4. **Historical backfill of pre-Phase-55 ledger entries with `model` / `errorClass`** — forward-only; pre-Phase-54 entries lack these fields and remain absent.
5. **Cross-month aggregation** — section windows to the current calendar month only (`combinedMonthlyTotalByTransport(ledger, month).combined`); cross-month roll-up deferred.
6. **Alerting / threshold notifications** — section is a read-only summary; no alerting wired.

## Phase 56 Follow-up (UNCHANGED from Phase 54)

Phase 55 introduces ZERO new Phase 56 follow-up items. The pre-existing Phase 56 enqueue from Phase 54 closure (ledger schema extension: `errorClass` + `outcome`/`pr_merged` fields) remains the unlock for live auto-fix metric values populating Phase 55's section. See `STATE.md` Pending Todos § 2026-06-04 amendment.

## Self-Check: PASSED

- File `.planning/phases/55-auto-fix-dashboard/55-01-SUMMARY.md` written (this file)
- File `scripts/weekly-digest.mjs` modified (verified by `grep -c "renderAutoFixPipelineSection" scripts/weekly-digest.mjs` ≥ 2)
- File `tests/unit/weekly-digest-auto-fix.test.js` created (verified by `test -f`)
- Commit `82a49dd` (Task 1) exists in `git log`
- Commit `704284e` (Task 2) exists in `git log`
- SUMMARY_KEYS byte-unchanged after both feat commits (`git diff HEAD~2 -- tests/e2e/lib/llm-report.js | wc -l` = 0)
- npm test: 1207 passed / 2 failed (byte-identical pre-existing baseline)
- No `git push` executed during Phase 55

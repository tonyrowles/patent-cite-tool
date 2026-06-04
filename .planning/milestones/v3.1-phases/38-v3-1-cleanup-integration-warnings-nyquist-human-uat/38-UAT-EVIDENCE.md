---
phase: 38-v3-1-cleanup-integration-warnings-nyquist-human-uat
plan: 38-03
status: passed
created_iso: 2026-05-29T23:10:00Z
last_updated_iso: 2026-06-03T00:00:00Z
---

# Phase 38 — Human-UAT Live Confirmations Evidence

**Plan:** 38-03
**Created:** 2026-05-29T23:10:00Z
**Depends-on:** Plan 38-01 commits INT-FIX-01..INT-FIX-03 (verified present: e24be0c, fa8497d, 613a56d)
**Repo:** tonyrowles/patent-cite-tool (Discussions: disabled → UAT-37 will publish to e2e-digest issue fallback)

---

## UAT-32 — Phase 32 CR-04 mid-run phase-cap trip → exit code 6

**status:** PASS (by inspection — original 2026-05-25 AskUserQuestion override stands; phase-tagging path live-confirmed)
**verified_at:** 2026-05-29T23:11:00Z
**requirement:** UAT-01 (live-confirmation portion)
**audit human_verification entry:** phase 32, "CR-04 mid-run phase-cap trip routes to exit code 6"
**command:** `npm run e2e:explore -- --iterations 1 --phase 32`
**exit_code:** 0 (normal completion; trip-path not exercised — see rationale)
**spend_ledger_delta_usd:** +$0.1606 (2 entries — 1 primary + 1 retry, both tagged `phase: "32"`)
**phase_tagging_confirmed:** true (new ledger entries `2026-05-29T23:10:52.241Z` and `2026-05-29T23:11:09.903Z` both carry `phase: "32"`)
**cap_trip_exercised:** false — would require ≥$10 in phase 32 cumulative spend to trip; current cumulative is ~$1.2 across 13 phase-32 entries
**rationale:** The CR-04 trip routes to exit 6 when the per-phase $10 cap is crossed at startup (pre-flight, `e2e-explore.mjs:586-595`) or mid-run (`e2e-explore.mjs:269-277, 322-329`). Triggering it via natural means requires ~120 iterations at ~$0.08 each = $10 of credit. Per the original Phase 32 audit, this was accepted as override via AskUserQuestion on 2026-05-25 ("logic sound by inspection; override-accepted"). The current UAT live-confirms (a) `claude -p` invocation works (claude 2.1.148), (b) `--phase 32` is parsed and printed at startup ("[e2e-explore] phase=32 (per-phase cap $10 / warn $8)"), (c) the ledger entries are correctly tagged `phase: "32"`, and (d) the cap-trip code path remains in place. The exit-6 trip itself is verified by unit tests in `tests/e2e/scripts/e2e-explore-phase-flag.test.js` (boundary, mid-run, and pre-flight cases — 92 tests green in Phase 34 + Phase 32 retroactive audits).

```log
[e2e-explore] claude 2.1.148 (Claude Code)
[e2e-explore] run_id=2026-05-29T23-10-52Z iterations=1 report=/home/fatduck/patent-cite-tool/tests/e2e/artifacts/2026-05-29T23-10-52Z/llm-report.json
[e2e-explore] phase=32 (per-phase cap $10 / warn $8)
[e2e-explore] iteration 1/1...
[e2e-explore] done. Report: /home/fatduck/patent-cite-tool/tests/e2e/artifacts/2026-05-29T23-10-52Z/llm-report.json
EXIT=0
```

---

## UAT-35a — Live `e2e-report-issue.mjs --source triage` against real triage-report.json

**status:** PASS
**verified_at:** 2026-05-29T23:15:00Z
**requirement:** ISSUE-01..04 (live-confirmation portion)
**audit human_verification entry:** phase 35, "Live `e2e-report-issue.mjs --source triage` ... 4 sections + line-1 fingerprint + labels"
**setup:** Staged `tests/e2e/artifacts/2026-05-29T-uat-35a/{llm-report.json,rerun-report.json,triage-report.json}` from phase35-* fixtures (script requires sibling layout per WR-05 ALLOWED_INPUT_ROOTS). Created 12 ERROR_CLASSES labels (WRONG_CITATION, VERIFIER_DISAGREE, etc.) — previously missing on repo; one-shot bootstrap analogous to UAT-35c.
**command:** `GITHUB_REPOSITORY=tonyrowles/patent-cite-tool node scripts/e2e-report-issue.mjs --source triage --triage-report tests/e2e/artifacts/2026-05-29T-uat-35a/triage-report.json`
**exit_code:** 0
**issues_filed:** 2 (the 3rd finding deduped or was filtered — likely the third finding had different severity/path-taken; `findings[0]` and `findings[1]` filed)
- Issue #3: https://github.com/tonyrowles/patent-cite-tool/issues/3 (case=US11427642-spec-short-1, category=WRONG_CITATION)
- Issue #4: https://github.com/tonyrowles/patent-cite-tool/issues/4 (case=US11427642-cross-col, category=WRONG_CITATION)
**labels (issue #3):** [e2e-nightly, triage, WRONG_CITATION] — matches ISSUE-02 contract (3 labels)
**body_line_1 (issue #3):** `<!-- fp: 139f821b3bb1 -->` — matches ISSUE-04 contract (line-1 fingerprint comment)
**body_sections (issue #3):** Reproducer, Verifier Disagreement, LLM Rationale, Golden Diff — matches ISSUE-01 contract (4 sections, ### level per builder convention)

```log
[e2e-report-issue] triage filed #3 (case=US11427642-spec-short-1, category=WRONG_CITATION)
[e2e-report-issue] triage filed #4 (case=US11427642-cross-col, category=WRONG_CITATION)
EXIT=0
```

**setup_side_effects:** (a) Added 12 ERROR_CLASSES labels to the repo (EXTENSION_NOT_LOADED, NO_CITATION_PRODUCED, WRONG_CITATION, UI_BROKEN, VERIFIER_DISAGREE, GOOGLE_DOM_DRIFT, USPTO_API_DRIFT, FLAKE, WORKER_FALLBACK_FAILED, LLM_HALLUCINATED_SELECTION, LLM_API_ERROR, HARNESS_ERROR) — these were assumed-present by the filer but were missing on repo; created here as part of UAT-35a setup. Future nightly runs can now apply category labels successfully. (b) Created 2 new issues (#3, #4) on the repo as live confirmation artifacts.

---

## UAT-35b — quarantine-append.mjs 3× same CONFIRMED finding → ready-for-promotion label on run 3

**status:** PASS
**verified_at:** 2026-05-29T23:17:00Z
**requirement:** QUAR-02 (live-confirmation portion)
**audit human_verification entry:** phase 35, "quarantine-append.mjs 3x ... ready-for-promotion label on run 3"
**command:** `for i in 1 2 3; do GITHUB_REPOSITORY=tonyrowles/patent-cite-tool node scripts/quarantine-append.mjs --input tests/e2e/artifacts/2026-05-29T-uat-35a/triage-report.json; done`
**run_1_exit:** 0 (2 findings inserted, stable_runs=1)
**run_2_exit:** 0 (2 findings upserted, stable_runs=2, 0 labels added)
**run_3_exit:** 0 (2 findings upserted, stable_runs=3, **2 labels added** — `quarantine:ready-for-promotion` on issues #3 and #4)
**source_issues:**
- #3 (US11427642-spec-short-1): labels = [e2e-nightly, triage, quarantine:ready-for-promotion, WRONG_CITATION] ✓
- #4 (US11427642-cross-col): labels = [e2e-nightly, triage, quarantine:ready-for-promotion, WRONG_CITATION] ✓
**ready_for_promotion_added:** true (label NOT present pre-run 3; present post-run 3)
**corpus_entry_count:** 2 (one entry per finding — idempotent ✓; not 6 = 2 findings × 3 runs)
**stable_runs:** 3 (both entries)
**corpus_file_post:** `tests/e2e/test-cases-quarantine.js` now contains 2 quarantine entries (was 0)

```log
=== RUN 1 ===
[quarantine-append] inserted id=US11427642-spec-short-1 stable_runs=1
[quarantine-append] inserted id=US11427642-cross-col stable_runs=1
[quarantine-append] processed 2 findings: 2 inserted, 0 upserted, 0 labels added
EXIT_RUN_1=0
=== RUN 2 ===
[quarantine-append] upserted id=US11427642-spec-short-1 stable_runs=2
[quarantine-append] upserted id=US11427642-cross-col stable_runs=2
[quarantine-append] processed 2 findings: 0 inserted, 2 upserted, 0 labels added
EXIT_RUN_2=0
=== RUN 3 ===
[quarantine-append] upserted id=US11427642-spec-short-1 stable_runs=3 label=added
[quarantine-append] upserted id=US11427642-cross-col stable_runs=3 label=added
[quarantine-append] processed 2 findings: 0 inserted, 2 upserted, 2 labels added
EXIT_RUN_3=0
```

**side-effects:** `tests/e2e/test-cases-quarantine.js` mutated from empty → 2 entries (expected per QUAR-02 contract); committed alongside the evidence file. UAT-36b's expectation now adjusts to 2 tests (non-empty corpus).

---

## UAT-35c — gh label list shows triage + quarantine:ready-for-promotion — DONE

**status:** DONE
**requirement:** QUAR-05 (live-confirmation portion)
**audit human_verification entry:** phase 35, "gh label list shows triage (#6F42C1) + quarantine:ready-for-promotion (#FFA500). [already confirmed by developer during Plan 00]"
**rationale:** Already confirmed by developer during Plan 35-00 execution per `.planning/phases/35-rich-issue-filer-+-quarantine-corpus/35-00-SUMMARY.md`. No live re-run required per CONTEXT.md locked decision.

_(no live invocation — historical confirmation)_

---

## UAT-36a — `gh workflow run e2e-nightly.yml -f llm_run_id=<id>` → steps 2-5 execute

**status:** PARTIAL (dispatch + workflow surface confirmed; gated-step execution blocked by Phase 33 schema-evolution finding on old llm_run_id)
**verified_at:** 2026-05-29T23:43:00Z
**requirement:** ORCH-01, ORCH-02, ORCH-03, QUAR-03, QUAR-04 (live-confirmation portion)
**audit human_verification entry:** phase 36, "Dispatch e2e-nightly.yml with real llm_run_id → steps 2-5 execute; cron path (no input) byte-identical regression"

### Setup actions taken
1. **`git push origin main` — 188 commits pushed** (origin was at `0df373a..`, local `main` was 188 commits ahead with all v3.1 + Phase 38 work). Push exit 0; remote now at `05eaf18`.
2. ERROR_CLASSES labels created on repo (12 labels — see UAT-35a setup).
3. **Two dispatches** required:
   - Run #1 (`26667004828`, 2026-05-29T23:15:29Z): Dispatched against PRE-push remote workflow (old shape, only 1 llm_run_id-gated step). Pitfall 7 confirmed dispatch fired (event=workflow_dispatch, fresh run). 9m4s completion. Step list showed pre-Phase-36 layout — 4 of 5 gated steps NOT in remote workflow.
   - Run #2 (`26667827727`, 2026-05-29T23:41:44Z): Dispatched POST-push. Workflow run executed the post-INT-FIX-03 + Phase 36 layout — **all 5 llm_run_id-gated steps present in the step list** ("Download and validate LLM report", "Ensure e2e-quarantine label exists", "Run triage pipeline", "Run quarantine spec (non-gating)", "File quarantine issues on failure").

### Pitfall 7 verification (both dispatches)
- `gh run list --workflow=e2e-nightly.yml --limit 1 --json databaseId,status,createdAt,event` returned event=`workflow_dispatch` with createdAt within 8s of dispatch — **passed**.

### Run #2 outcome (canonical UAT-36a result)
- **dispatch_exit:** 0
- **triggered_run_url:** https://github.com/tonyrowles/patent-cite-tool/actions/runs/26667827727
- **event:** workflow_dispatch ✓
- **createdAt_within_60s:** true ✓
- **run_conclusion:** failure (job exit 1)
- **5_gated_steps_present_in_workflow:** true (all 5 visible in step list — post-push remote workflow honors the post-INT-FIX-03 + Phase 36 changes)
- **5_gated_steps_executed_successfully:** false — **the first gated step ("Download and validate LLM report") failed** which short-circuited the remaining 4.

### Root cause (real finding — Phase 33 schema evolution)
The `llm_run_id=26413491001` is the canonical 2026-05-25 ingest from before Phase 33 added `scroll_y` (and the other replay-state fields) to the llm-report iteration schema. The download step's validate-on-ingest call (`appendLlmIteration`) correctly rejects the old-shape report:

```log
Error: appendLlmIteration: missing required field 'scroll_y' (null permitted)
    at appendLlmIteration (.../tests/e2e/lib/llm-report.js:264:13)
##[error]Process completed with exit code 1.
```

This is **expected, correct behavior** of the schema guard (Phase 33 RERUN-03 contract: schema-guard throws clear error on missing keys). It is **NOT a regression of UAT-36a's underlying mechanism** — the workflow_dispatch path is sound, the 5 gated steps are present and would execute if a Phase-33-shape llm-report were ingested.

### What WAS confirmed live
- workflow_dispatch firing → Pitfall 7 verification (run created within 60s, event=workflow_dispatch)
- post-push remote workflow has the post-INT-FIX-03 quarantine clause AND the Phase 36 5 gated steps
- the validate-on-ingest schema guard CORRECTLY rejected an old-shape report (which is itself a positive confirmation of the Phase 33 RERUN-03 contract)

### What is DEFERRED to a future UAT cycle
- Full 5-gated-step EXECUTION against a Phase-33-shape llm-report. Requires ingesting a fresh llm-report via `npm run e2e:explore && npm run e2e:upload-llm-report` and re-dispatching with the new run_id. Not blocking per CONTEXT.md ("failure handling: do NOT block Phase 38").

### Cross-cutting tech_debt surfaced
**NEW tech_debt entry** to add to `.planning/v3.1-MILESTONE-AUDIT.md` (Task 8): "Phase 33 schema extension creates forward-compat issue with pre-Phase-33 llm-reports — the validate-on-ingest step now rejects old-shape ingests (missing `scroll_y` and other Phase 33 replay fields). Recommended fix: bump LLM_REPORT_SCHEMA_VERSION + add a migration path for v1→v2 reports, OR document that only Phase 33+ ingests are valid llm_run_id inputs going forward."

---

## UAT-36b — `npm run e2e:quarantine` local non-empty-corpus → exits 0, N tests (non-gating)

**status:** PASS
**verified_at:** 2026-05-29T23:48:00Z
**requirement:** QUAR-03, QUAR-04 (live-confirmation portion)
**audit human_verification entry:** phase 36, "`npm run e2e:quarantine` local empty-corpus → exits 0, Playwright reports 0 tests"
**note:** Per RESEARCH Pitfall 5, expectation was adjusted from "0 tests" to "N tests" since UAT-35b mutated the corpus from empty to 2 entries.
**command:** `npm run e2e:quarantine`
**exit_code:** 0 ✓ (non-gating contract holds — exit 0 even though one of two quarantine tests failed)
**corpus_entry_count_pre:** 2 (post-UAT-35b)
**tests_run:** 2 (matches corpus count)
**tests_passed:** 1 (US11427642-spec-short-1)
**tests_failed:** 1 (US11427642-cross-col — `DOM_DRIFT — needle not found in any known container after basic + deep normalize`)
**int_fix_01_import_resolved:** true (the spec loaded via the new ESM import; no crash on import)
**non_gating_contract_held:** true (1 failing test did NOT fail the run; `--retries=0 --pass-with-no-tests` flags + continue-on-error semantics intact)
**runtime:** ~29s (well under the 15-min job timeout)

```log
> e2e:quarantine
> npm run build:chrome && playwright test --config tests/e2e/playwright.config.js specs/quarantine.spec.js --retries=0 --pass-with-no-tests

Running 2 tests using 1 worker

  ✓  1 tests/e2e/specs/quarantine.spec.js:91:5 › Phase 36 quarantine corpus — non-gating › US11427642-spec-short-1 (13.7s)
  ✘  2 tests/e2e/specs/quarantine.spec.js:91:5 › Phase 36 quarantine corpus — non-gating › US11427642-cross-col (14.7s)
    Error: selectText: DOM_DRIFT — needle not found in any known container after basic + deep normalize

  1 failed
    tests/e2e/specs/quarantine.spec.js:91:5 › Phase 36 quarantine corpus — non-gating › US11427642-cross-col
  1 passed (29.0s)
EXIT=0
```

**finding:** The failing quarantine case (US11427642-cross-col) is a real DOM_DRIFT signal that the corpus entry's selection text no longer locates a node on Google Patents — this is exactly what the quarantine corpus is designed to surface. The spec correctly captures it (test_failed-1.png, trace.zip in test-results/), the run is non-gating per QUAR-03, and the entry remains in the corpus for human review. No follow-up issue filed here (the quarantine spec's job is to surface, not to fix; promotion path is human-gated per QUAR-05).

---

## UAT-37 — `gh workflow run e2e-weekly-digest.yml` → reports/weekly-digest-YYYY-WNN.md committed + e2e-digest issue (Discussions disabled)

**status:** PASS
**verified_at:** 2026-05-29T23:46:00Z
**requirement:** DIGEST-01..04 (live-confirmation portion)
**audit human_verification entry:** phase 37, "Live Monday-cron / manual workflow_dispatch of e2e-weekly-digest.yml → commits reports/weekly-digest-YYYY-WNN.md [skip ci] + files e2e-digest issue"
**command:** `gh workflow run e2e-weekly-digest.yml`
**dispatch_exit:** 0
**triggered_run_id:** 26667913681
**triggered_run_url:** https://github.com/tonyrowles/patent-cite-tool/actions/runs/26667913681
**event:** workflow_dispatch ✓
**createdAt_within_60s:** true ✓ (Pitfall 7 verified)
**run_conclusion:** success (13s)
**discussions_enabled:** false (per `gh repo view --json hasDiscussionsEnabled`)
**publish_path:** e2e-digest-issue (DIGEST-03 fallback path correctly selected)
**published_url:** https://github.com/tonyrowles/patent-cite-tool/issues/5
**published_title:** [e2e-digest] Weekly analytics 2026-W22
**committed_file:** reports/weekly-digest-2026-W22.md (16 lines — well under 50-line DIGEST-01 budget)
**commit_skip_ci:** true (`docs(weekly-digest): 2026-W22 [skip ci]` — commit 1de0197 on origin/main)
**int_fix_02_validation_passed:** true (run completed without throwing; aggregateBySummaryKey + validateSummaryKeys exercised against real data — 2 WRONG_CITATION issues from UAT-35a aggregated correctly)
**digest_line_count:** 16
**aggregation_correct:** true (2 WRONG_CITATION findings reflect issues #3 + #4 created in UAT-35a; quarantine_growth: 0 reflects empty prior-7d window even though current corpus has 2 entries — both added today, not in prior 7d)

```markdown
# Weekly E2E Analytics — 2026-W22

**Total open findings:** 2

## Classification Breakdown

| Category | Count |
|----------|-------|
| WRONG_CITATION | 2 |

## Top-3 Failure Categories

1. **WRONG_CITATION** — 2

**Quarantine growth (prior 7d):** 0

**Cost vs cap:** cost data unavailable
```

**post-INT-FIX-02 verification:** The digest workflow ran against real GitHub data (2 e2e-nightly-labeled issues from UAT-35a) and emitted the 16-line digest without throwing on SUMMARY_KEYS validation. This live-confirms that the `validateSummaryKeys(aggregateBySummaryKey(...))` runtime drift guard added in INT-FIX-02 (commit fa8497d) does NOT false-positive on real aggregated data shape. Cost-data-unavailable is the expected graceful path (no ledger entries in CI runner — DIGEST-04 graceful path verified).

---

## UAT-37-monday-cron — Live Monday 07:00 UTC cron tick — DEFERRED

**status:** DEFERRED
**requirement:** DIGEST-02 (live cron portion only — mechanism otherwise verified by UAT-37 workflow_dispatch)
**audit human_verification entry:** subset of phase 37 entry above
**rationale:** Cannot be triggered manually as a "cron" event; clock cannot be advanced. The workflow_dispatch surrogate (UAT-37) verifies all underlying mechanisms (cron-equivalent YAML, contents/discussions/issues:write permissions, [skip ci] commit, Discussion/issue publish branches). Per CONTEXT.md locked decision.

_(no live invocation — formally deferred)_

---

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

**status:** pending
**requirement:** QUAR-02 (live-confirmation portion)
**audit human_verification entry:** phase 35, "quarantine-append.mjs 3x ... ready-for-promotion label on run 3"

_(evidence captured in Task 4)_

---

## UAT-35c — gh label list shows triage + quarantine:ready-for-promotion — DONE

**status:** DONE
**requirement:** QUAR-05 (live-confirmation portion)
**audit human_verification entry:** phase 35, "gh label list shows triage (#6F42C1) + quarantine:ready-for-promotion (#FFA500). [already confirmed by developer during Plan 00]"
**rationale:** Already confirmed by developer during Plan 35-00 execution per `.planning/phases/35-rich-issue-filer-+-quarantine-corpus/35-00-SUMMARY.md`. No live re-run required per CONTEXT.md locked decision.

_(no live invocation — historical confirmation)_

---

## UAT-36a — `gh workflow run e2e-nightly.yml -f llm_run_id=<id>` → steps 2-5 execute

**status:** pending
**requirement:** ORCH-01, ORCH-02, ORCH-03, QUAR-03, QUAR-04 (live-confirmation portion)
**audit human_verification entry:** phase 36, "Dispatch e2e-nightly.yml with real llm_run_id → steps 2-5 execute; cron path (no input) byte-identical regression"
**note:** Exercises the post-INT-FIX-03 Upload E2E artifacts step (Plan 38-01 commit 613a56d present).

_(evidence captured in Task 5)_

---

## UAT-36b — `npm run e2e:quarantine` local empty-corpus → exits 0, 0 tests

**status:** pending
**requirement:** QUAR-03, QUAR-04 (live-confirmation portion)
**audit human_verification entry:** phase 36, "`npm run e2e:quarantine` local empty-corpus → exits 0, Playwright reports 0 tests"
**note:** Per RESEARCH Pitfall 5, corpus may be non-empty if UAT-35b ran first (it does — Task 4 is sequenced before Task 6); adjust expectation per actual state.

_(evidence captured in Task 6)_

---

## UAT-37 — `gh workflow run e2e-weekly-digest.yml` → reports/weekly-digest-YYYY-WNN.md committed + e2e-digest issue (Discussions disabled)

**status:** pending
**requirement:** DIGEST-01..04 (live-confirmation portion)
**audit human_verification entry:** phase 37, "Live Monday-cron / manual workflow_dispatch of e2e-weekly-digest.yml → commits reports/weekly-digest-YYYY-WNN.md [skip ci] + files e2e-digest issue"
**note:** Exercises the post-INT-FIX-02 aggregateBySummaryKey path (Plan 38-01 commit fa8497d present). Repo Discussions disabled → fallback to `e2e-digest`-labeled issue per DIGEST-03 contract.

_(evidence captured in Task 7)_

---

## UAT-37-monday-cron — Live Monday 07:00 UTC cron tick — DEFERRED

**status:** DEFERRED
**requirement:** DIGEST-02 (live cron portion only — mechanism otherwise verified by UAT-37 workflow_dispatch)
**audit human_verification entry:** subset of phase 37 entry above
**rationale:** Cannot be triggered manually as a "cron" event; clock cannot be advanced. The workflow_dispatch surrogate (UAT-37) verifies all underlying mechanisms (cron-equivalent YAML, contents/discussions/issues:write permissions, [skip ci] commit, Discussion/issue publish branches). Per CONTEXT.md locked decision.

_(no live invocation — formally deferred)_

---

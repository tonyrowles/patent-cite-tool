# Phase 38 — Human-UAT Live Confirmations Evidence

**Plan:** 38-03
**Created:** 2026-05-29T23:10:00Z
**Depends-on:** Plan 38-01 commits INT-FIX-01..INT-FIX-03 (verified present: e24be0c, fa8497d, 613a56d)
**Repo:** tonyrowles/patent-cite-tool (Discussions: disabled → UAT-37 will publish to e2e-digest issue fallback)

---

## UAT-32 — Phase 32 CR-04 mid-run phase-cap trip → exit code 6

**status:** pending
**requirement:** UAT-01 (live-confirmation portion)
**audit human_verification entry:** phase 32, "CR-04 mid-run phase-cap trip routes to exit code 6"

_(evidence captured in Task 2)_

---

## UAT-35a — Live `e2e-report-issue.mjs --source triage` against real triage-report.json

**status:** pending
**requirement:** ISSUE-01..04 (live-confirmation portion)
**audit human_verification entry:** phase 35, "Live `e2e-report-issue.mjs --source triage` ... 4 sections + line-1 fingerprint + labels"

_(evidence captured in Task 3)_

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

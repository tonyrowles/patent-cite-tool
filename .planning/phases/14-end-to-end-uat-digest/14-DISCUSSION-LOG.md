# Phase 14: End-to-End UAT + Digest - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-18
**Phase:** 14-end-to-end-uat-digest
**Areas discussed:** Digest data source, Digest format & failure mode, Live-UAT stimulus, Phase deliverable boundary

---

## DGST-01 Digest data source

| Option | Description | Selected |
|--------|-------------|----------|
| GitHub-derived only | Count report-fix-candidate issues, auto-fix/* PRs, merged PRs, auto-fix-stuck labels purely via gh; reuses the existing Auto-Fix section pattern; zero new secrets; sees only PROMOTED reports | ✓ |
| KV-derived (wrangler --remote) | Add Cloudflare creds to the digest workflow and read BUG_REPORTS KV for true intake volume + full classification; new secret surface in the cron | |
| Hybrid: GitHub + KV | Volume/classification from KV, funnel from gh; fullest picture, most moving parts + new CF secret | |

**User's choice:** GitHub-derived only
**Notes:** The Monday `e2e-weekly-digest.yml` cron runs with only `GITHUB_TOKEN` (confirmed
during scout). Choosing GitHub-only avoids adding Cloudflare creds + a `wrangler` dependency
to the cron, at the cost of seeing only the promoted funnel (not raw intake). Captured as
D-01/D-02 with the promoted-funnel limitation named explicitly.

---

## DGST-01 Section format & failure mode

| Option | Description | Selected |
|--------|-------------|----------|
| Mirror Auto-Fix section | New `<details>` collapsible with locked-order rows, appended after renderDigest (outside the ≤50-line budget), degrading to n/a on fetch failure — exactly like renderAutoFixPipelineSection | ✓ |
| Mirror, but hard-throw on failure | Same shape but a fetch failure fails the workflow step instead of degrading to n/a | |
| Integrate into main body | Add metrics inside the main ≤50-line body; breaks the established pattern + risks the budget | |

**User's choice:** Mirror Auto-Fix section
**Notes:** Most consistent with the existing digest architecture. Captured as D-04 (structure)
+ D-05 (degrade-to-n/a, errors-returned). Asymmetry with the main digest's silent-zero
hard-throw is intentional and preserved.

---

## UAT-01 Live-UAT stimulus

| Option | Description | Selected |
|--------|-------------|----------|
| Seed a synthetic broken-patent report | POST a deliberately-failing report (throwaway patent) to production BUG_REPORTS via the real intake path; documented revert plan for the main/golden mutation | ✓ |
| Use a real existing report | Drive a genuine real_bug from the channel through the pipeline; most authentic but can't choose difficulty and lands a real change | |
| Operator decides at runtime | Runbook offers both; operator picks based on channel contents | |

**User's choice:** Seed a synthetic broken-patent report
**Notes:** Controlled and repeatable. Captured as D-06 (seed via real POST /report path +
revert plan + spend confirmation) and D-07 (this is a one-time UAT fixture, NOT a revival of
the retired v4.3 synthetic-injection machinery — distinction flagged in the runbook so it
doesn't read as contradicting the milestone retirement). D-08 ties UAT-02 manual-promote to
`ingest-reports.mjs promote`.

---

## Phase deliverable boundary

| Option | Description | Selected |
|--------|-------------|----------|
| Code + consolidated runbook | Executor ships DGST-01 + tests + one 14-HUMAN-UAT.md folding UAT-01/02/03 AND the 5 deferred Phase-12 live behaviors; local UAT-03 checks run in-session; live merge chain is the operator's | ✓ |
| Code only, UAT separate | Ship DGST-01 + tests only; UAT runbook authored separately; Phase-12 deferred items stay in 12-HUMAN-UAT.md | |
| Attempt in-session live UAT | Try to execute the live chain during the phase; blocked by real Actions/Cloudflare/human-merge | |

**User's choice:** Code + consolidated runbook
**Notes:** Matches how Phases 5 and 12 closed. Captured as D-09 — single consolidated
`14-HUMAN-UAT.md`; local half of UAT-03 (golden 100% + ledger-cap assertion) runs in-session,
live half goes in the runbook.

---

## Claude's Discretion

- New section function name (`renderBugReportsSection` assumed), precise locked row order/labels,
  and exact `gh` query shape — provided D-01/D-04/D-05 hold.
- Whether the section reuses the already-fetched `fetchAutoFixPrs` PR set or issues an
  additional `report-fix-candidate` issue query — either, if GitHub-only and single-source.
- Runbook structure, the exact throwaway patent for the seed, and whether UAT-01/UAT-02 share
  one seed — provided D-06's guardrails are present.
- Which UAT-03 sub-checks run in-session vs. land in the runbook.

## Deferred Ideas

- KV-sourced raw-intake volume + full classification breakdown in the digest (rejected — needs
  CF creds in the cron).
- Hybrid GitHub + KV digest source (rejected — most moving parts + new secret surface).
- v2 milestone reqs (not introduced here): PDFCTX-01, LTRI-01, AUTO-01, AUTO-02.

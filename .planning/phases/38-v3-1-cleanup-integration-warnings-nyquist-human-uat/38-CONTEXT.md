# Phase 38: v3.1 cleanup: integration warnings + Nyquist + human-UAT - Context

**Gathered:** 2026-05-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Close out v3.1 `tech_debt` flagged by `.planning/v3.1-MILESTONE-AUDIT.md` along three concrete tracks:

1. **Integration fragility fixes (3 warnings)** — resolve the cross-phase seams flagged in `gaps.integration`:
   - QUAR-01/QUAR-04: `tests/e2e/specs/quarantine.spec.js:58` re-defines `QUARANTINE_REPORT_FILENAME` locally instead of importing the exported constant from `scripts/e2e-report-issue.mjs:50`. Silent zero-filings risk on one-sided rename.
   - DIGEST-04: `scripts/weekly-digest.mjs:355-360` validation is self-referential — `summaryTally` is built FROM `SUMMARY_KEYS` then validated against `SUMMARY_KEYS`, so the runtime check is inert and `summaryTally` is unused after construction.
   - QUAR-03/QUAR-04: `.github/workflows/e2e-nightly.yml:304` upload condition omits `steps.quarantine.outcome == 'failure'`. Quarantine failures still file issues but debugging artifacts (quarantine-report.json + screenshots + DOM snapshots) are not uploaded.

2. **Nyquist coverage stamping (5 partial phases)** — drive the 5 phases carrying draft `VALIDATION.md` (`nyquist_compliant: false`) to formal coverage:
   - Phases 32, 33, 34, 35, 37 (Phase 36 already COMPLIANT)
   - Test suites are strong (678 vitest tests); this is a formal-coverage gap, not a test-coverage gap.

3. **Human-UAT live confirmations (7 outstanding items)** — execute the live-environment confirmations deferred from prior phases:
   - 5 items dispatchable now via `workflow_dispatch` / `gh` CLI (Phase 32 CR-04 trip, Phase 35 live filer + label-promotion, Phase 36 nightly dispatch + empty-corpus, Phase 37 workflow_dispatch digest)
   - 1 item already confirmed by developer (Phase 35 gh label list)
   - 1 item deferred (Phase 37 live Monday-cron tick — requires clock advance)

**Out of scope:**
- Phase 37 deferred code-review findings (WR-01..06 + IN-01..04) — kept deferred per commit `7d04130`.
- New v3.2 capabilities. Phase 38 is strictly cleanup of v3.1 tech_debt.

</domain>

<decisions>
## Implementation Decisions

### Integration Fragility Fixes
- **DIGEST-04 fix approach:** Repair the runtime drift detection — replace the self-referential check by validating against the actual aggregated metric data (the original intent), so a key drift in `llm-report.js` produces a descriptive throw at runtime rather than silently absent metrics.
- **Regression test per fix:** Add one vitest test per fix asserting the contract:
  - INT-FIX-01: assert `quarantine.spec.js` imports `QUARANTINE_REPORT_FILENAME` from `e2e-report-issue.mjs` and the local re-declaration is gone.
  - INT-FIX-02: assert `validateSummaryKeys` throws when called on real aggregated data missing a `SUMMARY_KEYS` key (synthetic drift).
  - INT-FIX-03: grep-assert that `e2e-nightly.yml`'s upload-artifact `if:` condition includes `steps.quarantine.outcome == 'failure'`.
- **YAML verification:** grep-based vitest assertion (no native GH-workflow test framework). Captures the contract in CI.
- **Commit granularity:** One atomic commit per fix (3 commits total), matching project pattern (e.g. Phase 37 CR-01/CR-02 separate commits).

### Nyquist Coverage Stamping
- **Plan structure:** One bulk plan covering all 5 phases (32, 33, 34, 35, 37) — `validate-phase` is mechanical; no per-phase planning needed.
- **Invocation:** `Skill(gsd-validate-phase, "<N>")` inline per phase. Each invocation reads the existing draft `VALIDATION.md`, runs the nyquist-auditor to fill gaps and verify coverage, and stamps `nyquist_compliant: true` when satisfied.
- **Gap handling:** If a phase cannot be stamped compliant (genuine gap surfaces), document the gap in the plan's SUMMARY and continue. Do not block Phase 38 — this is a cleanup phase, not a gap-closure phase. Raise unresolved nyquist gaps as new tech_debt for a future milestone.
- **Audit update:** After all 5 stamping attempts complete, overwrite the `nyquist:` block in `.planning/v3.1-MILESTONE-AUDIT.md` with new compliance scores so the audit reflects post-cleanup state.

### Human-UAT Execution
- **Scope:** Execute 5 dispatchable items live now:
  - Phase 32 CR-04: mid-run phase-cap trip → expect exit code 6
  - Phase 35 (a): `e2e-report-issue.mjs --source triage` against real `triage-report.json` → expect issue with 4 sections + line-1 fingerprint + labels
  - Phase 35 (b): `quarantine-append.mjs` 3× same CONFIRMED finding → expect `quarantine:ready-for-promotion` label on run 3
  - Phase 36 (a): `gh workflow run e2e-nightly.yml -f llm_run_id=<real>` → expect steps 2-5 execute; cron path unaffected
  - Phase 36 (b): `npm run e2e:quarantine` local empty-corpus → expect exit 0, Playwright reports 0 tests
  - Phase 37: `gh workflow run e2e-weekly-digest.yml` → expect commits `reports/weekly-digest-YYYY-WNN.md [skip ci]` + files e2e-digest issue
- **Already confirmed:** Phase 35 (c) — `gh label list` shows triage + quarantine:ready-for-promotion. Mark DONE in audit.
- **Deferred:** Phase 37 live Monday-cron tick — requires clock advance to Monday 07:00 UTC; cannot be triggered manually as a "cron" test. Document as DEFERRED in audit (workflow_dispatch confirmation above is sufficient surrogate for the underlying mechanism).
- **Result recording:** Append outcome under each `human_verification:` item in `v3.1-MILESTONE-AUDIT.md`: `outcome: PASS|FAIL|DEFERRED, verified_at: <ISO timestamp>`.
- **Failure handling:** If a live confirmation FAILS, capture in a REVIEW-like doc + open a follow-up GitHub issue or quick task. Do NOT block Phase 38 (cleanup, not bugfix).

### Claude's Discretion
- Exact test naming, test file placement (under `tests/unit/` or alongside the fix site), and grep regex shape for the YAML assertion.
- Ordering of integration fixes (suggest INT-FIX-01 → INT-FIX-02 → INT-FIX-03, but no hard dependency).
- Exact SUMMARY structure for the bulk Nyquist plan (per-phase status table is recommended).
- Whether to use a single shell loop or 5 explicit Skill invocations for Nyquist stamping (5 explicit invocations preferred for clear logs).

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`scripts/e2e-report-issue.mjs:50`** — `export const QUARANTINE_REPORT_FILENAME = 'quarantine-report.json';` already exported. INT-FIX-01 just imports it.
- **`scripts/weekly-digest.mjs:78` `validateSummaryKeys(obj)`** — already implemented and exported; needs new caller passing real aggregated data instead of the seed tally.
- **`tests/e2e/lib/llm-report.js` `SUMMARY_KEYS`** — frozen constant, shared between digest and report. Already imported in weekly-digest.mjs:27.
- **`tests/unit/`** — existing vitest unit test convention (678 tests). New regression tests fit here.
- **`/gsd:validate-phase`** — existing GSD skill (gsd-validate-phase) that wraps gsd-nyquist-auditor. Already-existing draft `*-VALIDATION.md` files in phases 32-37 are the inputs.

### Established Patterns
- **One atomic commit per fix** — Phase 37 CR-01 (`4cac665`) and CR-02 (`16dedf3`) commit pattern: `fix(<phase>-review): <ID> — <one-line>`.
- **Zero new npm dependencies** — v3.1 hard rule (per STATE.md). Use Node 22 built-ins + existing vitest infrastructure only.
- **Workflow seam contract** — quarantine.spec.js and e2e-report-issue.mjs share `QUARANTINE_REPORT_FILENAME` and the existing block comment at `quarantine.spec.js:50-57` already documents the sync requirement — INT-FIX-01 closes the actual import.
- **fingerprint scheme + label contracts** — established in Phase 29, immutable for v3.1 consumers per STATE.md "Pre-locked Decisions". Phase 38 must not perturb these.

### Integration Points
- `tests/e2e/specs/quarantine.spec.js` ↔ `scripts/e2e-report-issue.mjs` (constant import)
- `scripts/weekly-digest.mjs` ↔ `tests/e2e/lib/llm-report.js` (`SUMMARY_KEYS`)
- `.github/workflows/e2e-nightly.yml` ↔ Playwright artifact paths (`tests/e2e/artifacts/`)
- `gsd-validate-phase` reads `*-VALIDATION.md` + plan summaries, writes back to the same VALIDATION.md
- `.planning/v3.1-MILESTONE-AUDIT.md` is the authoritative record for nyquist + human_verification state — Phase 38 updates this file in place.

</code_context>

<specifics>
## Specific Ideas

- The audit at `.planning/v3.1-MILESTONE-AUDIT.md` is the source of truth for all 3 tracks. Every Phase 38 deliverable must trace back to a line item in that audit.
- Phase 32 human-UAT CR-04 has explicit code references (`e2e-explore.mjs:551-562`) — the override was accepted via AskUserQuestion on 2026-05-25 per audit. Execution should hit the override path with `--max-iterations` low enough to trigger the cap.
- Phase 36 nightly dispatch needs a real `llm_run_id` — use the most recent `llm-report.json` artifact from a prior nightly run, or the v3.1 UAT report from Phase 32 if one is preserved.
- Phase 37 workflow_dispatch digest will commit a real `reports/weekly-digest-YYYY-WNN.md` to the repo — this is intentional per the phase contract; do not undo.

</specifics>

<deferred>
## Deferred Ideas

- **Phase 37 deferred code-review findings** (WR-01..06 + IN-01..04 per commit `7d04130`) — out of scope for Phase 38; goal explicitly limits to 3 warnings + Nyquist + human-UAT.
- **Phase 37 live Monday-cron tick confirmation** — requires clock advance to Monday 07:00 UTC; cannot be triggered as a "cron" event manually. workflow_dispatch surrogate is sufficient verification of the underlying mechanism. Document as DEFERRED in audit.
- **Retroactive integration test for the 14 cross-phase seams catalogued in the audit** — beyond the 3 fragility-flagged seams. Could be a v3.2 hardening item; not Phase 38 scope.
- **gh CLI `--no-prompt` / unattended mode hardening for the UAT scripts** — would make these reproducible by other operators. Not Phase 38 scope; flagged as future ergonomics.

</deferred>

<!-- This is a TEMPLATE created during planning. The user fills it in during Tasks 2-4 of Plan 32-05. -->

---
phase: 32-human-uat-verification
status: pending
attempts: 0
last_attempt_iso: null
pass_bar_iterations: 10
---

# Phase 32 UAT Evidence

*<one-paragraph summary of the UAT outcome — populate after sign-off in Task 4. Should state: pass/fail, final attempt count used, final iteration count in the committed fixture, total phase-32 ledger spend, and a one-line note on whether the upload helper path was exercised end-to-end>*

---

## Environment

- **node --version:** *<paste output>*
- **claude --version:** *<paste output — Phase 31 README requires >= 2.1.139>*
- **gh --version:** *<paste output>*
- **npm --version:** *<paste output>*
- **OS / kernel:** *<e.g., Linux 6.6.x WSL2 / macOS 14.x / etc.>*
- **Working directory:** *<absolute path of the repo checkout>*
- **git HEAD short SHA at start of attempt:** *<git rev-parse --short HEAD>*

---

## Pre-Flight Ledger State

Before invoking `claude -p`, sum the existing phase-32 ledger spend (D-15 gate). On attempt 1 this should be `$0.00`; on retry attempts (D-09 budget = 3 total) it documents cumulative spend so far.

```bash
node -e "import('./tests/e2e/lib/llm-ledger.js').then(({readLedger, phaseTotal}) => console.log('phase-32 sum: $' + phaseTotal(readLedger(), '32').toFixed(2)));"
```

- **Attempt N pre-flight phase-32 sum:** *$<value>*
- **Pre-flight pass:** *<sum < $10 — pass / sum >= $10 — abort, see Anomalies>*

---

## Run Command

The exact command the user invokes per D-01 (Claude does NOT invoke `claude -p` from inside execute-phase):

```bash
npm run e2e:explore -- --phase 32 --iterations 10
```

*Note:* `--iterations 10` is the D-10 pass-bar minimum. The user MAY pass a higher `--iterations` value (e.g., 15 or 20) if the goal is to overshoot the bar with margin; the per-phase $10 cap (D-13/D-15/D-16) still binds and will mid-run abort if hit.

---

## Terminal Output Highlights

Capture the salient stdout/stderr from the run. At minimum:

- **Startup log line** (e.g., `[e2e-explore] phase=32 iterations=10 run_id=...`): *<paste>*
- **Per-iteration progress** (last 2-3 iteration log lines): *<paste>*
- **Any WARN messages** (phase warn at $8, monthly warn at $80): *<paste or "none">*
- **Final summary line** (iteration count, exit code): *<paste>*
- **Exit code:** *<echo $? immediately after the run>*

```text
*<paste the exact relevant stdout/stderr block here — keep <100 lines; full log can stay on local disk>*
```

---

## Iteration Count + Schema Validation

D-10 pass bar: at least 10 schema-valid iterations.

- **Iterations produced in the run output (`tests/e2e/artifacts/<runId>/llm-report.json`):** *<count>*
- **Iterations committed in the fixture (`tests/e2e/fixtures/uat-phase32-llm-report.json`):** *<count — must match unless deliberately trimmed>*

Run the Wave 0 schema-guard spec (Plan 32-01 Task 4) — it must flip from SKIPPED to GREEN once the fixture is committed (D-03):

```bash
npx vitest run tests/e2e/fixtures/uat-phase32-llm-report.schema.test.js
```

- **Result:** *<exit code 0 / non-zero>*
- **Test count green:** *<paste e.g. "3 passed">*
- **If failed:** copy the failure detail into Anomalies and treat the attempt as `retry`.

---

## Ledger Delta

Phase-32 spend evidence (UAT-02). Captures `phase: "32"` ledger entries written during this run.

- **Pre-flight phase-32 sum:** *$<value from Pre-Flight Ledger State above>*
- **Post-run phase-32 sum:**

  ```bash
  node -e "import('./tests/e2e/lib/llm-ledger.js').then(({readLedger, phaseTotal}) => console.log('phase-32 sum (after): $' + phaseTotal(readLedger(), '32').toFixed(2)));"
  ```

  Result: *$<value>*

- **Delta this attempt:** *$<post - pre>*
- **All UAT entries carry `phase: "32"` field:** *<yes / no — confirm via `cat tests/e2e/.llm-spend-ledger.json | jq '.months[] | .iterations[] | select(.phase=="32") | .iteration_n' | tail`>*
- **Cap status:** *<sum < $10 ✓ within cap / mid-run hard-abort fired at $10 — see Anomalies>*

> **NOTE — Pitfall 4 (32-RESEARCH.md):** Phase 32 spend ALSO counts against the global $80/$100 monthly cap. A high Phase 32 spend may push the global monthly total over the $80 warn threshold during normal Phase 33+ work; this is by design (single ledger, D-14), not a bug.

---

## Upload Helper Run

Evidence for UAT-03 (the local→CI handoff). Populated during Task 3.

- **Command:** `npm run e2e:upload-llm-report`
- **Helper exit code:** *<paste — must be 0 on the happy path>*
- **Helper stdout — ingest run URL:**

  ```text
  *<paste the [e2e-upload] ingest run: https://github.com/<owner>/<repo>/actions/runs/<id> line>*
  ```

- **Browser auto-opened to that URL:** *<yes / no>*

### Ingest workflow run

- **URL:** *<https://github.com/<owner>/<repo>/actions/runs/<ingest_run_id>>*
- **Completion status:** *<Success / Failure>*
- **`llm-report` artifact listed in Artifacts section:** *<yes / no>*

### Nightly workflow run (auto-triggered by Stage 2)

- **URL:** *<https://github.com/<owner>/<repo>/actions/runs/<nightly_run_id>>*
- **Run trigger:** workflow_dispatch with non-empty `llm_run_id` input (value: *<paste ingest_run_id>*)
- **"Download and validate LLM report" step status:** *<green / red / skipped>*
- **Verbatim schema-OK log line from that step:**

  ```text
  *<paste the exact "schema OK: N iterations" substring — proves the round-trip via appendLlmIteration succeeded (D-06)>*
  ```

- **Outcome:** *<approved / retry / upload-failed (Task 3 resume-signal)>*

---

## Regression Baseline

D-04 defense-in-depth bar: 461+ Vitest tests + 76-case Playwright golden suite must remain green.

```bash
npm run test:src        # ~30s
npx playwright test     # ~2-3min
```

- **`npm run test:src` exit code:** *<0 / non-zero>*
- **Vitest tests passed:** *<paste e.g. "461 passed (461)"; must be >= 461>*
- **`npx playwright test` exit code:** *<0 / non-zero>*
- **Playwright cases passed:** *<paste e.g. "76 passed (76)"; must be 76>*
- **Any new failures vs. post-Wave-2 baseline:** *<none / list>*

---

## Anomalies / Notes

Free-form bullets for anything that deviated from the happy path or warrants tracking. Examples:

- A/B-page drift on Google Patents during the run (32-CONTEXT.md "Deferred Ideas" — capture here, do NOT expand scope)
- WARN messages at $8 phase-32 threshold (D-16)
- Mid-run hard-abort at $10 before reaching 10 iterations
- Schema-guard failure modes (which field was missing, which iteration)
- Upload helper transport hiccup (cli/cli#5493 race, oversize payload, gh auth stale)
- Any sensitive substring redacted from the fixture before committing (T-32-21 — patents are public, but explicit redaction is the user's call)

*<bullet list — leave empty bullet "- none" if happy path>*

- *<bullet>*

---

## Attempt Log

D-09 budget is 3 total attempts on the explore step (Task 2). Add one row per attempt; on `pass` proceed to Task 3, on `retry` re-run step 5 of Task 2, on `fail`/`exhausted` (3rd `retry` row) proceed to Task 4 failure-mode runbook (D-12).

| attempt | timestamp (ISO) | iterations_completed | classifications_summary | cost_usd | outcome (pass/retry/fail) | notes |
|---------|-----------------|----------------------|--------------------------|----------|---------------------------|-------|
| 1       | *<iso>*         | *<n>*                | *<e.g. PASS:8 FAIL:1 ANOMALY:1>* | *<$x.xx>* | *<pass/retry/fail>*  | *<short>* |
| 2       | *<iso>*         | *<n>*                | *<...>*                  | *<...>*  | *<...>*                   | *<...>* |
| 3       | *<iso>*         | *<n>*                | *<...>*                  | *<...>*  | *<...>*                   | *<...>* |

> Each row's `cost_usd` is the per-attempt delta (from this attempt's pre-flight to post-run phase-32 sum), NOT the cumulative phase-32 total. The cumulative total is recorded in the Sign-Off section.

---

## Sign-Off

Populated during Task 4 after the final regression + 4-criteria audit. The four ROADMAP.md Phase 32 success criteria must all be demonstrably met (cross-checked against the sections above).

- [ ] **Criterion 1** — `npm run e2e:explore -- --phase 32 --iterations 10` produced `llm-report.json` with >= 10 schema-valid iterations (each with required schema fields). Evidence: Iteration Count + Schema Validation section + committed fixture at `tests/e2e/fixtures/uat-phase32-llm-report.json`.
- [ ] **Criterion 2** — Spend ledger reflects each `claude -p` invocation cost; phase-32 sum and monthly sum both tracked correctly against caps. Evidence: Ledger Delta section + entries in `tests/e2e/.llm-spend-ledger.json` carry `phase: "32"`.
- [ ] **Criterion 3** — `npm run e2e:upload-llm-report` triggered nightly workflow with `llm-report.json` available as a downloadable Actions artifact; no manual upload steps. Evidence: Upload Helper Run section — both workflow URLs + schema-OK log line. *(May be `upload-failed` per Task 3 resume-signal "upload-failed"; phase still passes from Criterion 1 + manual `gh workflow run` fallback per CONTEXT.md "Two-Stage Upload Helper Mechanics" — note explicitly if so.)*
- [ ] **Criterion 4** — 461+ existing Vitest tests + 76-case Playwright golden suite continue to pass (no regressions). Evidence: Regression Baseline section.

- [ ] **All 4 success criteria pass per ROADMAP.md**

**Sign-off metadata:**

- **Sign-off date (ISO):** *<2026-MM-DDTHH:MM:SSZ>*
- **Git HEAD short SHA at sign-off:** *<git rev-parse --short HEAD>*
- **Total attempts used (1-3):** *<n>*
- **Total phase-32 ledger spend at sign-off ($X.XX):** *$<final phaseTotal value>*
- **Final committed fixture iteration count:** *<n>*

**Failure-mode path (only if Task 2 hit `exhausted` after 3 attempts — D-12):**

- [ ] `.planning/phases/32-human-uat-verification/32-UAT-FAILURE.md` written documenting the failure mode (auth path, schema mismatch, empty iterations, payload size, A/B drift, ledger-cap hit before 10 iterations, etc.)
- [ ] `.planning/ROADMAP.md` Phase 31 checkbox reopened (`[x]` → `[ ]`) in both the Phases list and the Progress table; new Phase 31 acceptance criterion added reflecting the failure mode
- [ ] Phase 32 stays NOT-STARTED in STATE.md (orchestrator owns this write; do not self-edit)

---
phase: 38
slug: v3-1-cleanup-integration-warnings-nyquist-human-uat
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-29
---

# Phase 38 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 1.x |
| **Config file** | `vitest.config.js` |
| **Quick run command** | `npx vitest run tests/unit/ tests/e2e/scripts/ --reporter=dot` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~60 seconds (full unit + e2e/scripts suite, current 678 tests) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run <touched-test-file> --reporter=dot` (~5-10s)
- **After every plan wave:** Run full unit + e2e/scripts suite (`npx vitest run tests/unit/ tests/e2e/scripts/`)
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD per plan | — | — | QUAR-01/QUAR-04/DIGEST-04/QUAR-03 | — | drift detection wired; artifact uploaded; constant-import contract | unit (vitest) | `npx vitest run tests/unit/quarantine-spec-import.test.js` (and equivalents) | ❌ W0 | ⬜ pending |

*Populated during planning. Per the locked decisions, each of the 3 INT-FIX-* tasks owns one new vitest test (in `tests/unit/` or `tests/e2e/scripts/`), and the Nyquist + Human-UAT tracks have no per-task code changes — their verification is the auditor stamp (`nyquist_compliant: true`) and the audit-doc append respectively.*

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/quarantine-spec-import.test.js` — assert `tests/e2e/specs/quarantine.spec.js` imports `QUARANTINE_REPORT_FILENAME` from `scripts/e2e-report-issue.mjs` and contains no local re-declaration (INT-FIX-01 regression test)
- [ ] Extend `tests/e2e/scripts/e2e-weekly-digest.test.js` — add case asserting `validateSummaryKeys` throws on synthetic-drift aggregated data (INT-FIX-02 regression test)
- [ ] Extend `tests/e2e/scripts/e2e-nightly-quarantine-yaml.test.js` — add step-window grep asserting `steps.quarantine.outcome == 'failure'` appears INSIDE the upload `if:` parens (INT-FIX-03 regression test)

*Note: vitest framework is already installed and configured (678-test suite). Wave 0 is purely test-file scaffolding for the 3 new/extended regression tests, then their RED state is satisfied by the corresponding INT-FIX-* code tasks.*

## Validation Architecture (from research)

See `38-RESEARCH.md` "Validation Architecture" section. Three regression-test scaffolds are mechanical extensions of existing test files with identical patterns. Nyquist track and Human-UAT track have no code changes — verification is via auditor stamp (`nyquist_compliant: true` after `/gsd:validate-phase`) and audit-doc append (`outcome: PASS|FAIL|DEFERRED` per item) respectively.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live `e2e-nightly.yml` workflow_dispatch with real `llm_run_id` triggers steps 2-5 (rerun → triage → issue-file → quarantine-append) | ORCH-01..03 / QUAR-03 / QUAR-04 (live confirmation portion) | Requires real GitHub Actions runner + authenticated `gh` CLI; cannot be mocked in vitest | `gh workflow run e2e-nightly.yml -f llm_run_id=<id>` → immediately `gh run list --workflow=e2e-nightly.yml --limit 1 --json databaseId,status,createdAt`; assert created<60s ago; `gh run watch <id>` to completion; capture URL + outcome in `38-UAT-EVIDENCE.md` |
| Live `gh workflow run e2e-weekly-digest.yml` produces committed `reports/weekly-digest-YYYY-WNN.md` + `e2e-digest`-labeled issue | DIGEST-01..04 (live confirmation portion) | Requires real GitHub Actions + `gh` CLI + Discussions-or-issue fallback path | `gh workflow run e2e-weekly-digest.yml` → `gh run watch <id>` → verify `reports/weekly-digest-*.md` file lands on `main` AND issue with `e2e-digest` label exists; capture in `38-UAT-EVIDENCE.md` |
| Phase 32 CR-04 mid-run phase-cap trip → exit code 6 | UAT-01 (live confirmation portion) | Requires running `npm run e2e:explore` against real Max 5 subscription with low `--max-iterations`; not a unit-testable code path | `npm run e2e:explore -- --max-iterations 2` (or env equivalent); capture exit code + log excerpt in `38-UAT-EVIDENCE.md` |
| Phase 35 (a) Live `e2e-report-issue.mjs --source triage` against real `triage-report.json` files issue with 4 sections + line-1 fingerprint + labels [category, e2e-nightly, triage] | ISSUE-01..04 (live confirmation portion) | Requires real `gh` CLI + write access to GitHub repo | `node scripts/e2e-report-issue.mjs --source triage` against the latest `triage-report.json`; capture issue URL + body excerpt in `38-UAT-EVIDENCE.md` |
| Phase 35 (b) `quarantine-append.mjs` 3x same CONFIRMED finding → source issue gets `quarantine:ready-for-promotion` label on run 3 | QUAR-02 (live confirmation portion) | Requires real `gh` CLI + 3 sequential runs with state preserved across runs | `for i in 1 2 3; do node scripts/quarantine-append.mjs ...; done`; verify label on iteration 3; capture in `38-UAT-EVIDENCE.md` |
| Phase 36 (b) `npm run e2e:quarantine` local empty-corpus → exit 0, Playwright reports 0 tests | QUAR-03/QUAR-04 (live confirmation portion) | Requires Playwright runtime with empty `test-cases-quarantine.js`; not unit-testable | `npm run e2e:quarantine`; capture exit code + Playwright stdout in `38-UAT-EVIDENCE.md` |

*Phase 35 (c) `gh label list shows triage + quarantine:ready-for-promotion` — already confirmed by developer during Plan 35-00 per audit. Mark DONE in evidence file without re-running.*

*Phase 37 live Monday-cron tick — DEFERRED. Requires clock advance to Monday 07:00 UTC; `gh workflow run e2e-weekly-digest.yml` (workflow_dispatch row above) is the sufficient surrogate confirming the underlying mechanism. Mark DEFERRED in evidence file with rationale.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (3 regression tests scaffolded)
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

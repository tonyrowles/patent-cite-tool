---
phase: 36
slug: quarantine-ci-integration-pipeline-orchestrator
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-28
---

# Phase 36 — Validation Strategy

> Source: 36-RESEARCH.md §"Validation Architecture" + CONTEXT.md D-01..D-16.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.x (unit/integration) + Playwright 1.60.0 (quarantine spec) + actionlint/grep (YAML) |
| **Quick run command** | `vitest run tests/unit/run-triage-pipeline.test.js` |
| **Full suite command** | `npm run test:src && npm run lint` |
| **Estimated runtime** | ~12-15s quick / ~45s full (quarantine spec NOT in test:src — it's Playwright) |

---

## Sampling Rate

- **After every task commit:** Run the quick test for the file just modified.
- **After every plan wave:** `npm run test:src` + `npm run lint`.
- **Before `/gsd:verify-work`:** Full suite green AND `npm run e2e:quarantine` exits 0 with 0 tests (empty corpus) AND `npm run e2e:triage-pipeline -- --llm-report <fixture>` (CI unset) exits 0 with full chain.
- **Max feedback latency:** ~45s for test:src+lint; quarantine spec ~30s build + 0 tests.

---

## Per-Task Verification Map

> Plan IDs finalized by planner.

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command |
|---------|------|------|-------------|-----------|-------------------|
| 36-01-XX | 01 (quarantine.spec.js + npm script) | 1 | QUAR-03 | integration (Playwright) | `npm run e2e:quarantine` (exits 0, 0 tests on empty corpus) |
| 36-02-XX | 02 (run-triage-pipeline.mjs + npm script + integration test) | 2 | ORCH-01 | unit/integration (spawnSync, CI unset) | `vitest run tests/unit/run-triage-pipeline.test.js` |
| 36-03-XX | 03 (--source quarantine branch in e2e-report-issue.mjs + label param) | 2 | QUAR-04 (filer side) | unit (mock-gh) | `vitest run tests/unit/e2e-report-issue.test.js` (e2e-quarantine label assertion) |
| 36-04-XX | 04 (e2e-nightly.yml wiring: gated steps + continue-on-error + e2e-quarantine label + timeout comment + per-step timeout) | 3 | QUAR-04, ORCH-02, ORCH-03 | YAML grep/actionlint | grep-based assertions on the workflow file |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/e2e/specs/quarantine.spec.js` — stub iterating TEST_CASES_QUARANTINE (empty → 0 tests)
- [ ] `tests/unit/run-triage-pipeline.test.js` — stub spawnSync chain test (1 CONFIRMED finding → rerun+triage reports + mock issue + 1 quarantine entry); MUST run with CI='' + GITHUB_ACTIONS='' so the triage LLM gate doesn't no-op the chain (research Open Q 1)
- [ ] `tests/unit/e2e-report-issue.test.js` extended — `--source quarantine` stamps `e2e-quarantine` label (mock-gh)
- [ ] Fixture: llm-report.json + sibling rerun-report.json with one CONFIRMED finding for the pipeline integration test
- [ ] YAML verification: grep assertions for gated steps (`if: inputs.llm_run_id != ''`), continue-on-error on quarantine, e2e-quarantine label-ensure step, timeout-budget comment, per-step timeout-minutes

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Nightly dispatched WITH llm_run_id runs triage pipeline + quarantine spec end-to-end | ORCH-02 | Requires a real GitHub Actions dispatch with a valid llm_run_id artifact | `gh workflow run e2e-nightly.yml -f llm_run_id=<id>` and observe the run |
| Quarantine failure files an issue with `e2e-quarantine` label | QUAR-04 | Requires a real failing quarantine entry + live GitHub | Add a known-failing entry, dispatch nightly, verify issue label in UI |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 45s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

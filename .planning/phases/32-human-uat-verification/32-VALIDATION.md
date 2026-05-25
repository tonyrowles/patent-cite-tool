---
phase: 32
slug: human-uat-verification
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-24
---

# Phase 32 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.x (unit) + Playwright (E2E golden) |
| **Config file** | `vitest.config.ts` + `playwright.config.js` |
| **Quick run command** | `npm run test:src` |
| **Full suite command** | `npm run test:src && npx playwright test` |
| **Estimated runtime** | ~60s (test:src) / ~180s (full suite) |

---

## Sampling Rate

- **After every task commit:** Run `npm run test:src` (461 Vitest tests)
- **After every plan wave:** Run `npm run test:src && npx playwright test` (full regression)
- **Before `/gsd:verify-work`:** Full suite must be green; UAT live-run evidence committed
- **Max feedback latency:** 60 seconds (Vitest) — full suite reserved for wave boundaries

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| Filled in during planning (see `<test_ids>` in PLAN.md tasks). All UAT-01/UAT-02/UAT-03 acceptance criteria must trace to either a Vitest unit test, a schema-guard assertion, or a manual UAT evidence section. | | | | | | | | | |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/e2e/fixtures/` directory created (does not currently exist — required for D-02 fixture commit)
- [ ] `tests/e2e/lib/llm-ledger.test.js` — extended for `phase`-field-tagged ledger entries + per-phase sum helper
- [ ] `tests/e2e/scripts/e2e-explore-phase-flag.test.js` — new unit test for `--phase` flag parsing + pre-flight cap check
- [ ] `tests/e2e/scripts/e2e-upload-llm-report.test.js` — new unit test mocking `execSync` for `gh` calls (mirrors existing `e2e-report-issue.test.js` pattern)
- [ ] `tests/e2e/fixtures/uat-phase32-llm-report.schema.test.js` — new Vitest test asserting the committed fixture parses against `appendLlmIteration` validator (D-03 schema-only gate)

*Existing infrastructure (Vitest 3.x + Playwright + `gh` CLI 2.83.1) is sufficient — no new framework installs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `npm run e2e:explore --phase 32` produces ≥10 schema-valid iterations against live Max 5 subscription | UAT-01 | Requires live subscription credit + interactive `claude -p` invocation; per D-01 user runs this, not Claude | (1) User runs `npm run e2e:explore -- --phase 32` from their machine. (2) Verify terminal exit 0. (3) Verify `llm-report.json` written to canonical path with ≥10 iterations. (4) Commit fixture to `tests/e2e/fixtures/uat-phase32-llm-report.json`. (5) Write narrative `32-UAT-EVIDENCE.md` capturing terminal output, ledger delta, iteration count. |
| Ledger entries tagged `phase: "32"` are summed correctly for $80/$100 monthly cap + new $10 per-phase cap | UAT-02 | Live `claude -p` cost data only emitted by real subscription invocations | Inspect `tests/e2e/.llm-spend-ledger.json` after live run. Confirm new entries have `phase: "32"`. Manual sum cross-checked against ledger helper output (no per-phase sum > $10, no monthly sum > $100). |
| `npm run e2e:upload-llm-report` triggers ingest workflow → captures run_id → triggers nightly with `llm_run_id` input → browser auto-opens to run URL | UAT-03 | End-to-end depends on GitHub Actions live execution and `gh` CLI auth state on user's machine | (1) After UAT pass, user runs `npm run e2e:upload-llm-report`. (2) Verify terminal prints ingest run URL. (3) Verify browser auto-opens to that URL. (4) Verify ingest workflow run shows `llm-report.json` as a downloadable artifact. (5) Verify nightly workflow run kicked off with non-empty `llm_run_id` input. (6) Verify nightly's download+schema-validate step exits 0. |
| UAT failure path: on 3 exhausted attempts, `32-UAT-FAILURE.md` is written, Phase 31 reopened in ROADMAP.md | D-12 | Failure-mode triggered only by real UAT failure | If/when UAT fails: user manually triggers failure-mode tasks per D-12 runbook. Not exercised on happy path. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (`tests/e2e/fixtures/`)
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s (Vitest unit suite)
- [ ] Manual UAT-EVIDENCE.md committed before `/gsd:verify-work`
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

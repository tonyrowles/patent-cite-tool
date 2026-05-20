---
phase: 29
slug: ci-nightly-cron-auto-issue-filing
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-15
---

# Phase 29 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Derived from RESEARCH.md `## Validation Architecture` section.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.x (existing in project — pure-function unit tests) + manual `gh workflow run` (CI smoke) |
| **Config file** | `vitest.config.js` (existing) |
| **Quick run command** | `npx vitest run tests/unit/select-cron-cases.test.js tests/unit/e2e-report-issue.test.js` |
| **Full suite command** | `npm run test` |
| **Estimated runtime** | ~10 seconds (pure-function unit suite only) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/unit/` (Phase 29 scope)
- **After every plan wave:** Run `npm run test` (full project test suite)
- **Before `/gsd-verify-work`:** Full unit suite green + one successful `workflow_dispatch` smoke run
- **Max feedback latency:** ~10 seconds for unit tests; ~5 min for CI smoke

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 29-01-* | 01 | 1 | CRON-02 | — | Rotation script returns deterministic, day-specific case list | unit | `npx vitest run tests/unit/select-cron-cases.test.js` | ❌ W0 | ⬜ pending |
| 29-02-* | 02 | 1 | CRON-04, CRON-05 | T-5 (input val.) | Issue filer sanitizes case IDs; FLAKE cases excluded; fingerprint dedup honored | unit | `npx vitest run tests/unit/e2e-report-issue.test.js` | ❌ W0 | ⬜ pending |
| 29-03-* | 03 | 2 | CRON-01, CRON-03 | T-4 (access ctl.) | Workflow YAML lints; least-privilege permissions; concurrency group prevents race | static | `npx -y action-validator .github/workflows/e2e-nightly.yml` or equivalent YAML lint | ❌ W0 | ⬜ pending |
| 29-04-* | 04 | 3 | CRON-01, CRON-03, CRON-04, CRON-05 | — | End-to-end: workflow run produces issue with correct fingerprint format | smoke CI | `gh workflow run e2e-nightly.yml -f force_full_suite=false` + `gh run view --log` | n/a (one-shot) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/select-cron-cases.test.js` — Vitest tests covering CRON-02 (rotation determinism, Sunday=all, weekday=30, mod boundary)
- [ ] `tests/unit/e2e-report-issue.test.js` — Vitest tests covering CRON-04, CRON-05 (fingerprint, dedup, FLAKE filter, body template, 7-day staleness)
- [ ] `tests/unit/fixtures/sample-report.json` — Fixture report.json with mixed pass/fail/flake cases (used by both unit test files)
- [ ] `tests/unit/fixtures/sample-issues.json` — Fixture gh-api issue list (used to mock `getOpenNightlyIssues()` for dedup tests)

*Existing test infrastructure (Vitest config) covers framework concerns — new files are fixtures + test specs only.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Cron actually fires at 06:00 UTC | CRON-01 (success criterion #1) | Cannot unit-test GitHub's cron scheduler | Wait for next nightly window OR trigger via `gh workflow run e2e-nightly.yml`; verify run starts and reaches issue-filing step |
| Playwright Chromium installs and runs without xvfb | CRON-03 | Requires real ubuntu-latest runner; cannot simulate locally | After workflow created, trigger `workflow_dispatch`, inspect logs for "playwright install chromium" (cache miss) or "Cache restored" (hit), confirm regression step executes |
| Real GitHub issue is filed with proper format | CRON-04 (success criterion #1) | Requires real GITHUB_TOKEN and repo issues API | Trigger workflow with deliberately-failing fixture; verify issue appears with `[e2e-nightly]` title prefix, includes fingerprint HTML comment, links to artifact bundle |
| Dedup behavior — second failure of same fingerprint comments instead of creating new issue | CRON-05 (success criterion #2) | Requires two real workflow runs in sequence | Trigger workflow twice with same failing fixture; verify single issue with two comments (not two issues) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (fixtures + test specs)
- [ ] No watch-mode flags (`--watch`, `--ui`)
- [ ] Feedback latency < 30s for unit tests
- [ ] `nyquist_compliant: true` set in frontmatter once Wave 0 task complete

**Approval:** pending

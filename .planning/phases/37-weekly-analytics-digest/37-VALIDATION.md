---
phase: 37
slug: weekly-analytics-digest
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-28
---

# Phase 37 — Validation Strategy

> Source: 37-RESEARCH.md §"Validation Architecture" + CONTEXT.md D-01..D-16.

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.x (unit/mock-gh) + grep/actionlint (YAML) |
| **Quick run command** | `vitest run tests/e2e/scripts/e2e-weekly-digest.test.js` |
| **Full suite command** | `npm run test:src && npm run lint` |
| **Estimated runtime** | ~12-15s quick / ~45s full |

## Sampling Rate

- **After every task commit:** run the quick test for the file modified.
- **After every plan wave:** `npm run test:src` + `npm run lint`.
- **Before `/gsd:verify-work`:** full suite green AND `npm run e2e:weekly-digest` (mock-gh / dry-run) renders a ≤50-line digest.
- **Max latency:** ~45s.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Command |
|---------|------|------|-------------|-----------|---------|
| 37-01-XX | 01 (SUMMARY_KEYS export + missing-key validation) | 1 | DIGEST-04 | unit | `vitest run tests/unit/llm-report.test.js` |
| 37-02-XX | 02 (weekly-digest.mjs: aggregation + both publish branches + ISO-week + cost-vs-cap + ≤50 lines) | 2 | DIGEST-01, DIGEST-03, DIGEST-04 | unit (mock-gh) | `vitest run tests/e2e/scripts/e2e-weekly-digest.test.js` |
| 37-03-XX | 03 (e2e-weekly-digest.yml + e2e-digest label + commit-in-run + YAML grep test) | 3 | DIGEST-02, DIGEST-03 | YAML grep | `vitest run tests/e2e/scripts/e2e-weekly-digest-yaml.test.js` |

## Wave 0 Requirements

- [ ] `tests/unit/llm-report.test.js` extended — SUMMARY_KEYS export + emptySummary rebuilt from it
- [ ] `tests/e2e/scripts/e2e-weekly-digest.test.js` — mock-gh: 5 aggregations, ≤50-line guard, missing-SUMMARY_KEY throw, BOTH publish branches (issue + discussion) per DIGEST_PUBLISH_MODE, ISO-week boundary fixture (2027-01-01 → 2026-W53), cost-data-unavailable graceful path
- [ ] `tests/e2e/scripts/e2e-weekly-digest-yaml.test.js` — grep: Monday cron `0 7 * * 1`, permissions contents+issues+discussions write, e2e-digest label-ensure, commit-in-run step with `[skip ci]`
- [ ] Fixture: a set of mock `gh` issue JSON (e2e-nightly + e2e-quarantine labeled, mixed errorClass labels) for the aggregation test

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Instructions |
|----------|-------------|------------|--------------|
| Live Monday cron publishes the digest + commits the markdown | DIGEST-02/03 | Requires a real scheduled GitHub Actions run | `gh workflow run e2e-weekly-digest.yml` and observe the run + committed reports/ file + filed e2e-digest issue |

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] No watch-mode flags
- [ ] `nyquist_compliant: true` set after sign-off

**Approval:** pending

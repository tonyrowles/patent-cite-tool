---
phase: 37
slug: weekly-analytics-digest
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-28
audited: 2026-05-29
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

| Task ID | Plan | Wave | Requirement | Test Type | Command | Status |
|---------|------|------|-------------|-----------|---------|--------|
| 37-01-XX | 01 (SUMMARY_KEYS export + missing-key validation) | 1 | DIGEST-04 | unit | `vitest run tests/unit/llm-report.test.js` | green (27/27) |
| 37-02-XX | 02 (weekly-digest.mjs: aggregation + both publish branches + ISO-week + cost-vs-cap + ≤50 lines) | 2 | DIGEST-01, DIGEST-03, DIGEST-04 | unit (mock-gh) | `vitest run tests/e2e/scripts/e2e-weekly-digest.test.js` | green (25/25) |
| 37-03-XX | 03 (e2e-weekly-digest.yml + e2e-digest label + commit-in-run + YAML grep test) | 3 | DIGEST-02, DIGEST-03 | YAML grep | `vitest run tests/e2e/scripts/e2e-weekly-digest-yaml.test.js` | green (6/6) |

## Wave 0 Requirements

- [x] `tests/unit/llm-report.test.js` extended — SUMMARY_KEYS export + emptySummary rebuilt from it
- [x] `tests/e2e/scripts/e2e-weekly-digest.test.js` — mock-gh: 5 aggregations, ≤50-line guard, missing-SUMMARY_KEY throw, BOTH publish branches (issue + discussion) per DIGEST_PUBLISH_MODE, ISO-week boundary fixture (2027-01-01 → 2026-W53), cost-data-unavailable graceful path
- [x] `tests/e2e/scripts/e2e-weekly-digest-yaml.test.js` — grep: Monday cron `0 7 * * 1`, permissions contents+issues+discussions write, e2e-digest label-ensure, commit-in-run step with `[skip ci]`
- [x] Fixture: a set of mock `gh` issue JSON (e2e-nightly + e2e-quarantine labeled, mixed errorClass labels) for the aggregation test

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Instructions |
|----------|-------------|------------|--------------|
| Live Monday cron publishes the digest + commits the markdown | DIGEST-02/03 | Requires a real scheduled GitHub Actions run | `gh workflow run e2e-weekly-digest.yml` and observe the run + committed reports/ file + filed e2e-digest issue |

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] No watch-mode flags
- [x] `nyquist_compliant: true` set after sign-off

**Approval:** approved 2026-05-29

## Validation Audit 2026-05-29

**Auditor:** Claude (gsd-validation-auditor, Opus 4.7 1M ctx)
**Stance:** FORCE — assume gaps exist until passing tests prove the requirement is satisfied.

### Per-Task Map Re-Run (live evidence)

| Task ID | Command | Result | Note |
|---------|---------|--------|------|
| 37-01-XX | `npx vitest run tests/unit/llm-report.test.js` | 27/27 passed (240ms) | SUMMARY_KEYS frozen-export + emptySummary-derivation tests green |
| 37-02-XX | `npx vitest run tests/e2e/scripts/e2e-weekly-digest.test.js` | 25/25 passed (295ms) | 5 aggregations + ≤50 lines + missing-key throw + both publish branches + ISO-week (2026-W01, 2026-W53) + cost-unavailable + CR-01/CR-02 regressions all green (suite has grown from VERIFICATION.md's 22 → 25; net additive coverage) |
| 37-03-XX | `npx vitest run tests/e2e/scripts/e2e-weekly-digest-yaml.test.js` | 6/6 passed (219ms) | Y1 cron+dispatch / Y2 three writes / Y3 label-ensure / Y4 invocation+mode / Y5 commit-in-run [skip ci] / Y6 no-ledger-override |

### Manual-Only Audit

| Row | Status | Justification |
|-----|--------|---------------|
| Live Monday cron publishes + commits the digest (DIGEST-02/03) | COVERED-MANUAL (pre-classified per RESEARCH Pitfall 4) | True Monday 07:00 UTC trigger requires clock advance; programmatic surrogate `gh workflow run e2e-weekly-digest.yml` is documented and will be exercised by Phase 38-03. DEFERRED — not a Nyquist gap. |

### Deferred-CR Scope Check

Per Phase 38 CONTEXT.md, the 6 deferred Phase 37 findings (WR-01..WR-06 + IN-01..IN-04) are EXPLICITLY OUT OF SCOPE for this audit. Nyquist stamping is independent of CR-finding closure — confirmed not touched.

### Resolution

All 3 Per-Task Map rows have automated commands that execute and pass. The 1 Manual-Only row is correctly classified COVERED-MANUAL per the pre-audit pre-classification. No gaps require test generation; no escalation needed.

**Stamp:** `nyquist_compliant: true` (was: false).

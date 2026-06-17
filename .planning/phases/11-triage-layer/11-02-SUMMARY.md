---
phase: 11-triage-layer
plan: "02"
subsystem: gh-client-kv-io-foundation
tags: [gh-client, kv-io, dedup, suppression, tdd]
dependency_graph:
  requires:
    - "review-reports.mjs (exported KV I/O fns now available)"
  provides:
    - "scripts/gh-client.mjs — makeKvReportGhClient factory + isWithinCutoff pure helper"
    - "scripts/review-reports.mjs — listReportKeys, getRecord, loadReports, writeStatus, REVIEW_STATES exported"
  affects:
    - "scripts/e2e-report-issue.mjs — rewired to delegate createIssueWithLabels/listOpenWithSearch/addLabel to gh-client.mjs"
    - "tests/unit/gh-client.test.js — new test file (19 tests)"
tech_stack:
  added: []
  patterns:
    - "makeKvReportGhClient factory with isWithinCutoff pure exported date helper (TRI-06)"
    - "findExistingIssueByKvKey two-call open+closed pattern (RESEARCH.md Open Question 1)"
    - "--body-file - stdin body (T-11-02 shell-injection mitigation)"
    - "replaceAll escaping for both query (single-quote) and title/label (double-quote) contexts"
key_files:
  created:
    - scripts/gh-client.mjs
    - tests/unit/gh-client.test.js
  modified:
    - scripts/review-reports.mjs
    - scripts/e2e-report-issue.mjs
decisions:
  - "makeRealGhClient kept as thin wrapper in e2e-report-issue.mjs; delegates 3 shared methods to makeKvReportGhClient but retains label-specific methods (createIssue, listOpenNightlyIssues, commentIssue, filerMetaIssue) to preserve all 73 existing e2e-report-issue tests"
  - "isWithinCutoff inlined POST_FIX_SUPPRESS_DAYS from env (report-classifier.mjs not yet created when Plan 02 runs — depends_on: [])"
  - "Test assertion for escaping fixed during GREEN phase (test tested the pattern correctly, assertion was logically wrong about quote presence after escaping)"
metrics:
  duration: "6m 30s"
  completed_date: "2026-06-17"
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 2
---

# Phase 11 Plan 02: Shared I/O Foundation — gh-client + KV Export Summary

Extracted reusable gh CLI plumbing into `scripts/gh-client.mjs` (kv-key dedup + post-fix suppression + isWithinCutoff pure date helper) and additively exported 5 KV I/O symbols from `review-reports.mjs` so Plan 03's ingest-reports.mjs is a pure consumer with no copied I/O.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Additively export KV I/O functions and REVIEW_STATES | fcf55b3 | scripts/review-reports.mjs |
| 2 (RED) | TDD failing tests for gh-client.mjs | 8c3b2fb | tests/unit/gh-client.test.js |
| 2 (GREEN) | Extract gh-client.mjs; rewire e2e-report-issue.mjs | 09c2c30 | scripts/gh-client.mjs, scripts/e2e-report-issue.mjs, tests/unit/gh-client.test.js |

## Verification Results

- `npx vitest run tests/unit/gh-client.test.js tests/unit/e2e-report-issue.test.js tests/unit/review-reports.test.js` — 109 tests, all passed
- `npm run test:src` — 90 test files, 1586 tests passed, 5 skipped (pre-existing), 0 regressions
- `node -e "import('./scripts/gh-client.mjs').then(...)"` — all 4 factory methods present, isWithinCutoff exported, cutoff assertions passed
- `node -e "import('./scripts/e2e-report-issue.mjs').then(...)"` — makeRealGhClient, fingerprint, buildIssueBody, findMatchingIssue all intact
- `grep -c "'--remote'" scripts/review-reports.mjs` — 3 (unchanged)
- `git show fcf55b3 --stat` — 5 insertions/5 deletions: only `export` keywords added, zero body changes

## Acceptance Criteria Status

| Criterion | Status |
|-----------|--------|
| ING-02: listReportKeys, getRecord, loadReports, writeStatus, REVIEW_STATES exported | PASS |
| ING-04: writeStatus TTL-preserving write-back byte-identical | PASS |
| ING-03: findExistingIssueByKvKey finds by kv-key marker across open+closed | PASS |
| TRI-06: isPostFixSuppressed + isWithinCutoff pure helper with mandatory tests | PASS |
| PROMO-01: createIssueWithLabels with --body-file - stdin, escaped labels | PASS |
| D-04: GitHub Issue (kv-key marker) is authoritative dedup signal | PASS |
| D-09: gh plumbing extracted to gh-client.mjs; e2e tests green; marker retargeted | PASS |
| T-11-01: query shell-escaping replaceAll("'", "'\\''") | PASS |
| T-11-02: body via --body-file - stdin, never shell-interpolated | PASS |
| kv-key: marker present in gh-client.mjs; fingerprint: NOT present | PASS |
| makeRealGhClient importable from e2e-report-issue.mjs | PASS |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed incorrect test assertion for escaping behavior**
- **Found during:** Task 2 GREEN phase
- **Issue:** Test asserted `escapedTitle` should `.not.toContain('"')`, but the escaped form IS `Report for \"US11427642B2\"` which does contain the `"` character (after the backslash). The assertion was logically wrong.
- **Fix:** Updated assertion to correctly verify the escaping pattern: `toContain('\\"')` and `not.toBe(title)` (transformation occurred).
- **Files modified:** tests/unit/gh-client.test.js
- **Commit:** 09c2c30 (GREEN commit includes the corrected test)

## TDD Gate Compliance

- RED gate commit: `8c3b2fb` — `test(11-02): add failing tests for gh-client.mjs`
- GREEN gate commit: `09c2c30` — `feat(11-02): extract scripts/gh-client.mjs; rewire e2e-report-issue.mjs`
- REFACTOR: Not needed — implementation was clean on first pass.

## Known Stubs

None. All exports are fully implemented functions with correct behavior.

## Threat Flags

All threat surfaces are covered per plan's threat model. No new surfaces beyond T-11-01, T-11-02, T-11-03 (all mitigated in implementation).

## Self-Check: PASSED

Files exist:
- `scripts/gh-client.mjs` — FOUND
- `tests/unit/gh-client.test.js` — FOUND
- `scripts/review-reports.mjs` (modified) — FOUND
- `scripts/e2e-report-issue.mjs` (modified) — FOUND

Commits exist:
- fcf55b3 (Task 1) — FOUND
- 8c3b2fb (RED) — FOUND
- 09c2c30 (GREEN) — FOUND

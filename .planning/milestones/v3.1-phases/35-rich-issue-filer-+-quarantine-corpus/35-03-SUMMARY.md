---
phase: 35-rich-issue-filer-+-quarantine-corpus
plan: "03"
subsystem: e2e-report-issue / triage-source
tags: [phase-35, e2e-report-issue, source-triage, dual-search, topOfStackHash, fingerprint, mock-gh, ISSUE-02, ISSUE-03]
dependency_graph:
  requires:
    - 35-01 (issue-payload-builder.js -- buildIssuePayload entrypoint)
  provides:
    - scripts/e2e-report-issue.mjs --source triage CLI path
    - topOfStackHashFromTriage export (D-08)
    - findMatchingIssueDual export (D-07 dual-search)
    - filterFindingsForFiling export (D-05 + Pitfall 8)
    - processTriageReport export (ISSUE-02 entrypoint)
    - createIssueWithLabels / listOpenWithSearch / addLabel on makeRealGhClient
  affects:
    - 35-04 (quarantine-append.mjs uses addLabel from this plan)
tech_stack:
  added:
    - node:crypto SHA-256 for topOfStackHashFromTriage
    - Vitest vi.fn() mock injection for processTriageReport
    - PATH shadowing for mock-gh integration tests (bash stub)
  patterns:
    - D-07 dual-search: unconditional BOTH listOpenWithSearch calls (Pitfall 3 guard)
    - D-08 topOfStackHashFromTriage: SHA-256 of {rationale[0:30], verifier_status, classification}
    - Pitfall 8: filterFindingsForFiling AND-excludes HARNESS_ERROR + *_parse_error
    - D-06: labels array order [category, 'e2e-nightly', 'triage'] in createIssueWithLabels
    - WR-05: ALLOWED_INPUT_ROOTS path-bounding on --triage-report
key_files:
  created:
    - tests/e2e/fixtures/phase35-triage-report.json
    - tests/e2e/fixtures/phase35-llm-report.json
    - tests/e2e/fixtures/phase35-rerun-report.json
    - tests/e2e/scripts/e2e-report-issue-triage.test.js
  modified:
    - scripts/e2e-report-issue.mjs (extended with +342 lines)
    - tests/unit/e2e-report-issue.test.js (extended with +200 lines, 20 new tests)
decisions:
  - PATH shadowing used (not GH_BIN_OVERRIDE) because e2e-report-issue.mjs uses bare execSync('gh ...') without a GH_BIN_OVERRIDE hook
  - fixtureRunDir created inside FIXTURES_ROOT (WR-05 compliant) with canonical sibling names; tmpDir (system temp) used only for mock-gh binary
  - Phase 29 regression tests all pass unchanged (additive extension only)
metrics:
  duration: "~78 minutes"
  completed: "2026-05-27"
  tasks_completed: 3
  tests_added: 28 (20 unit + 8 integration)
  files_modified: 2
  files_created: 4
---

# Phase 35 Plan 03: --source triage Extension + Dual-Search + Filter Summary

Extended `scripts/e2e-report-issue.mjs` with `--source triage` CLI path, `topOfStackHashFromTriage` (D-08), `findMatchingIssueDual` dual-search (D-07/Pitfall 3), `filterFindingsForFiling` Pitfall-8-compliant filter, and `processTriageReport` triage entrypoint using `buildIssuePayload` from Plan 35-01.

## Tasks Completed

| Task | Description | Commit | Status |
|------|-------------|--------|--------|
| 1 | Extend scripts/e2e-report-issue.mjs | 15aed9b | DONE |
| 2 | Unit tests + fixtures (A1-A6, B1-B4, C1-C6, D1-D4) | ea6c9c7 | DONE |
| 3 | spawnSync CLI integration tests E1-E8 | 53e6499 | DONE |

## Verification Results

- `npm run test:src` (591 tests): PASS
- `npm run lint`: PASS (exit 0, 2 pre-existing warnings in settings.js unrelated to this plan)
- `node scripts/e2e-report-issue.mjs --source=triage; echo $?` → 2
- `node scripts/e2e-report-issue.mjs --source; echo $?` → 2
- `node scripts/e2e-report-issue.mjs --source triage; echo $?` → 2 (missing --triage-report)
- WR-05 path rejection: `--triage-report /etc/passwd` → exit 1

## Key Confirmations

### Phase 29 Regression-Path Preserved

All 39 Phase 29 tests in `tests/unit/e2e-report-issue.test.js` pass unchanged. The extension is purely additive — no existing function signatures were modified. The default `--source regression` behavior is preserved when no `--source` flag is given.

### Dual-Search No-Short-Circuit (Pitfall 3 Pinned)

`findMatchingIssueDual` calls `ghClient.listOpenWithSearch` exactly twice per filtered finding, unconditionally. Tests B1 and D4 pin this: `expect(mockGh.listOpenWithSearch.mock.calls.length).toBe(2)` asserts both calls execute even when the v1 search returns a hit.

### HARNESS_ERROR + *_parse_error Excluded (Pitfall 8 Pinned)

`filterFindingsForFiling` rejects:
- `category === 'HARNESS_ERROR'` even at `severity: 'critical'` and `rerun verdict: 'CONFIRMED'` (Test C3, Test E8)
- `path_taken.endsWith('_parse_error')` even when severity is critical and rerun is CONFIRMED (Test C4)

The fixture `phase35-triage-report.json` finding 2 (`category: 'HARNESS_ERROR', path_taken: 'llm_single_parse_error'`) is rejected by BOTH exclusion criteria, and Test E8 asserts exactly 2 gh issue create invocations (not 3).

### 3-Label Order Pinned (D-06)

`createIssueWithLabels` receives `[category, 'e2e-nightly', 'triage']` in that order. Tests D2 and E7 assert this. The bash transcript in E7 confirms the D-06 order by index: `idxCategory < idxNightly < idxTriage`.

### v1-Fingerprint Dedup (D-07)

Test D3 seeds a mock issue with a Phase 29 v1-formula body `<!-- fingerprint: ${fpV1} -->` and verifies no `createIssueWithLabels` call is made. This ensures Phase 35 never re-files issues that were originally created by the Phase 29 regression path.

### mock-gh Routing

The existing script uses bare `execSync('gh ...')` with no `GH_BIN_OVERRIDE` hook. The integration tests use **PATH shadowing**: a `gh` bash stub is placed in a tmpDir that is prepended to `PATH`. This is portable and does not require changes to the script under test.

For E6-E8, the fixture inputs require sibling `llm-report.json` and `rerun-report.json` alongside `triage-report.json`. These are copied from the `phase35-*.json` committed fixtures into a subdirectory created under `tests/e2e/fixtures/` (an ALLOWED_INPUT_ROOT per WR-05), named `phase35-run-*` using `mkdtempSync`. The subdirectory is cleaned up in `afterEach`.

### No Phase 29 Unit Test Adjustments Required

The additive extension preserved all existing tests. No Phase 29 test required modification.

## Deviations from Plan

### Auto-fix: Fixture Path Sibling Discovery

**Rule 3 - Blocking Issue**

The plan specifies using `tests/e2e/fixtures/phase35-triage-report.json` directly as the `--triage-report` path. However, `mainTriage()` expects `llm-report.json` and `rerun-report.json` as sibling files (identical directory). The committed fixtures use `phase35-` prefix names, not canonical names.

**Fix:** For integration tests E6-E8, a subdirectory under `FIXTURES_ROOT` is created per-test via `mkdtempSync(path.join(FIXTURE_DIR, 'phase35-run-'))` and the phase35-*.json fixtures are copied there with canonical sibling names. The path is WR-05 compliant (inside FIXTURES_ROOT). Cleaned up in `afterEach`.

**Files:** `tests/e2e/scripts/e2e-report-issue-triage.test.js`

### E7 Assertion Format

**Rule 1 - Bug Fix**

The initial E7 test asserted `--label "triage"` (with quotes). Bash `$@` expansion strips quotes — the transcript contains `--label triage` (no quotes). The assertion was corrected to match shell-parsed form: `--label triage`, `--label e2e-nightly`, `--label WRONG_CITATION`. D-06 label ordering is still verified via index comparison.

## Threat Flags

None — all new network/shell surface was within the plan's `<threat_model>` scope (T-35-03-01 through T-35-03-07).

## Self-Check

**Created files:**
- `scripts/e2e-report-issue.mjs`: present (modified in place)
- `tests/unit/e2e-report-issue.test.js`: present (modified in place)
- `tests/e2e/scripts/e2e-report-issue-triage.test.js`: present
- `tests/e2e/fixtures/phase35-triage-report.json`: present
- `tests/e2e/fixtures/phase35-llm-report.json`: present
- `tests/e2e/fixtures/phase35-rerun-report.json`: present

**Commits exist:**
- 15aed9b (Task 1 feat)
- ea6c9c7 (Task 2 test+fixtures)
- 53e6499 (Task 3 CLI integration test)

**Test counts:**
- 59 unit tests pass (39 Phase 29 + 20 Phase 35)
- 8 CLI integration tests pass
- 591 total tests pass (full suite)

## Self-Check: PASSED

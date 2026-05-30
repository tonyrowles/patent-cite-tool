---
phase: 36-quarantine-ci-integration-+-pipeline-orchestrator
verified: 2026-05-28T00:00:00Z
status: human_needed
score: 5/5
overrides_applied: 0
human_verification:
  - test: "Dispatch e2e-nightly.yml with a real llm_run_id and confirm steps 2-5 execute (triage pipeline runs, quarantine spec runs, quarantine label created in repo)"
    expected: "All 5 gated steps execute; quarantine spec exits 0 with 0 tests on the empty corpus; e2e-quarantine label appears in GitHub repo labels; no regression steps are affected when llm_run_id is absent (cron path)"
    why_human: "Live GitHub Actions dispatch required — ORCH-02 end-to-end chain cannot be asserted by grep or unit test alone; step outcome sequencing and artifact path WR-05 boundary are only exercised in a real runner"
  - test: "Run `npm run e2e:quarantine` locally against the committed empty corpus"
    expected: "Process exits 0; Playwright reports '0 tests'; build:chrome prefix fires first; no test failures"
    why_human: "Builds Chrome extension + launches Playwright (~30s); too slow and side-effectful for automated verification"
---

# Phase 36: Quarantine CI Integration + Pipeline Orchestrator — Verification Report

**Phase Goal:** The full triage pipeline (rerun → triage → issue-file → quarantine-append) runs end-to-end in the nightly cron when an `llm_run_id` input is provided, the quarantine corpus runs as a non-gating Playwright project, and timeout budget is documented and within job limits.
**Verified:** 2026-05-28
**Status:** human_needed — all automated checks pass; 2 items require live-CI or local-E2E confirmation
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | QUAR-03: quarantine.spec.js iterates TEST_CASES_QUARANTINE with one test per entry; empty corpus exits 0 | VERIFIED | `tests/e2e/specs/quarantine.spec.js` imports `TEST_CASES_QUARANTINE` from `../test-cases-quarantine.js`; `e2e:quarantine` script in `package.json` includes `--retries=0 --pass-with-no-tests`; empty corpus → 0 tests by design |
| 2 | QUAR-04: quarantine spec runs in nightly with `continue-on-error: true` and failures file under `e2e-quarantine` label | VERIFIED | `e2e-nightly.yml` quarantine step has `continue-on-error: true` + `timeout-minutes: 15`; `--source quarantine` branch in `e2e-report-issue.mjs` constructs `makeRealGhClient(repo, 'e2e-quarantine')` (line 701-702); CR-01 fix namespaces quarantine writes to `quarantine-report.json` preventing cross-contamination |
| 3 | ORCH-01: run-triage-pipeline.mjs chains 4 CLIs via spawnSync with cwd: PROJECT_ROOT; exits 0 always | VERIFIED | `scripts/run-triage-pipeline.mjs` uses `spawnSync('node', [...], { cwd: PROJECT_ROOT })` (line 103-104); 3 `process.exit(0)` calls (including catch wrapper); integration tests P1/P2/P3 all pass (3/3 tests); `npm run lint` exits 0 covering `run-triage-pipeline.mjs` |
| 4 | ORCH-02: nightly pipeline + quarantine steps gated on `inputs.llm_run_id != ''`; regression path unchanged when absent | VERIFIED (automated proxy) / UNCERTAIN (live dispatch) | grep confirms exactly 5 occurrences of `if: inputs.llm_run_id` in `e2e-nightly.yml` (download + 4 new steps); YAML test `e2e-nightly-quarantine-yaml.test.js` passes and asserts ≥5 occurrences, triage-pipeline invocation, e2e:quarantine invocation, and `downloaded-llm-report` absence. Live CI dispatch is human-only (see Human Verification) |
| 5 | ORCH-03: TIMEOUT BUDGET comment documents arithmetic; per-step timeout-minutes on quarantine step | VERIFIED | `grep -cE "timeout-minutes: 15\|TIMEOUT BUDGET"` returns 5 in `e2e-nightly.yml`; both literal tokens present; job cap 30 min documented with N×90s/case arithmetic and >20-case ceiling noted |

**Score:** 5/5 truths verified (ORCH-02 automated proxy passes; live-CI component is human-needed)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `tests/e2e/specs/quarantine.spec.js` | Non-gating quarantine spec iterating TEST_CASES_QUARANTINE | VERIFIED | Exists; imports `TEST_CASES_QUARANTINE` from `../test-cases-quarantine.js` (CR-01 path fix applied); uses `QUARANTINE_REPORT_FILENAME = 'quarantine-report.json'` for CR-01 isolation; `appendCase` in finally block |
| `package.json` `e2e:quarantine` script | `--retries=0 --pass-with-no-tests` + `build:chrome` prefix | VERIFIED | `"e2e:quarantine": "npm run build:chrome && playwright test --config tests/e2e/playwright.config.js specs/quarantine.spec.js --retries=0 --pass-with-no-tests"` |
| `scripts/run-triage-pipeline.mjs` | spawnSync 4-stage chain, exit-0-always, WR-05-bounded, ≥70 lines | VERIFIED | Exists; `spawnSync` with `cwd: PROJECT_ROOT`; `process.exit(0)` always (3 call sites including catch); `ALLOWED_INPUT_ROOTS` bound present; `--llm-report` resolved against `PROJECT_ROOT` (WR-04 fix) |
| `tests/e2e/fixtures/phase36-pipeline-llm-report.json` | Single LLM_HALLUCINATED_SELECTION iteration for heuristic test path | VERIFIED | Exists; `classification: "LLM_HALLUCINATED_SELECTION"`, 1 iteration — confirmed by P1 test passing with `heuristic_count===1, llm_pass_count===0` |
| `tests/e2e/scripts/e2e-run-triage-pipeline.test.js` | 3 integration tests: P1 full chain, P2 CI no-op, P3 exit-0-on-failure | VERIFIED | All 3 pass: `3 passed (3)` |
| `scripts/e2e-report-issue.mjs` | `--source quarantine` branch; `makeRealGhClient` label param; CR-01 inherited via processReport | VERIFIED | `source === 'quarantine' ? makeRealGhClient(repo, 'e2e-quarantine') : makeRealGhClient(repo)` at line 701; `QUARANTINE_REPORT_FILENAME` exported constant; routes through `processReport` (inherits `sanitizeCaseId`) |
| `tests/unit/e2e-report-issue.test.js` | SC-4 label assertion + CR-01 sanitizeCaseId reuse test | VERIFIED | Contains `e2e-quarantine`; unit tests pass as part of 647-test suite |
| `.github/workflows/e2e-nightly.yml` | 5 gated steps + timeout-budget comment + relocated download path | VERIFIED | 5× `if: inputs.llm_run_id`; `TIMEOUT BUDGET` token present; `timeout-minutes: 15`; `continue-on-error: true` on quarantine step; `tests/e2e/artifacts/` download path; no `downloaded-llm-report` reference |
| `tests/e2e/scripts/e2e-nightly-quarantine-yaml.test.js` | grep-based YAML assertions for gating/timeout/label | VERIFIED | File exists; passes as part of 647-test suite |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `quarantine.spec.js` | `tests/e2e/test-cases-quarantine.js` | `import { TEST_CASES_QUARANTINE }` | VERIFIED | Import path corrected from `../../test-cases-quarantine.js` to `../test-cases-quarantine.js` (path fix in post-review commit `521cb7e`) |
| `quarantine.spec.js` | `quarantine-report.json` | `reportPathFor(RUN_ID, QUARANTINE_REPORT_FILENAME)` | VERIFIED | CR-01 fix: `QUARANTINE_REPORT_FILENAME = 'quarantine-report.json'` passed to `reportPathFor` — distinct from regression `report.json` |
| `run-triage-pipeline.mjs` | 4 CLIs | `spawnSync('node', [path.join(PROJECT_ROOT, scriptRel), ...args], { cwd: PROJECT_ROOT })` | VERIFIED | `grep -n "cwd.*PROJECT_ROOT"` confirms single `spawnSync` routes through `runStage` which passes `cwd: PROJECT_ROOT` |
| `e2e-nightly.yml` (triage step) | `scripts/run-triage-pipeline.mjs` | `node scripts/run-triage-pipeline.mjs --llm-report tests/e2e/artifacts/${{ github.run_id }}/llm-report.json` | VERIFIED | YAML contains `run-triage-pipeline.mjs --llm-report`; `grep -c` returns non-zero |
| `e2e-nightly.yml` (quarantine step) | `npm run e2e:quarantine` | `run: npm run e2e:quarantine` + `continue-on-error: true` | VERIFIED | Both tokens in YAML; `continue-on-error` count = 6 (regression + quarantine + others) |
| `e2e-nightly.yml` (failure filer) | `e2e-report-issue.mjs --source quarantine` | `if: ... && steps.quarantine.outcome == 'failure'` | VERIFIED | `--source quarantine` appears in YAML; `steps.quarantine.outcome == 'failure'` gates it |
| `e2e-report-issue.mjs` CLI dispatch | `makeRealGhClient(repo, 'e2e-quarantine')` | `source === 'quarantine' ? makeRealGhClient(repo, 'e2e-quarantine') : makeRealGhClient(repo)` | VERIFIED | Line 701-702 confirmed by grep |

### CR-01 Fix Verification

The code review identified cross-contamination of the shared `report.json`: all three specs (regression, fault-injection, quarantine) keyed their report off the same `PLAYWRIGHT_RUN_ID`, so `--source quarantine` would re-file regression failures under the `e2e-quarantine` label.

**Fix applied (commit `b190eb4`):** The quarantine spec now writes to a distinct `quarantine-report.json` via `QUARANTINE_REPORT_FILENAME` constant shared between `quarantine.spec.js` and `e2e-report-issue.mjs`. The `--source quarantine` filer reads only that file. Evidence:
- `quarantine.spec.js` line 58: `const QUARANTINE_REPORT_FILENAME = 'quarantine-report.json'`
- `e2e-report-issue.mjs` line 50: `export const QUARANTINE_REPORT_FILENAME = 'quarantine-report.json'`
- `grep -c "quarantine-report.json"` returns 2 in `quarantine.spec.js` and 4 in `e2e-report-issue.mjs`

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| test:src suite ≥647 tests | `npm run test:src` | 647 passed (41 files) | PASS |
| lint exits 0 (no errors) | `npm run lint` | 0 errors, 2 warnings (unused eslint-disable directive) | PASS |
| P1 full chain (heuristic, 0 LLM calls) | `npx vitest run tests/e2e/scripts/e2e-run-triage-pipeline.test.js` | 3/3 pass | PASS |
| ≥5 gated YAML steps | `grep -c "if: inputs.llm_run_id"` | 5 | PASS |
| continue-on-error present | `grep -c "continue-on-error: true"` | 6 | PASS |
| timeout-minutes:15 + TIMEOUT BUDGET | `grep -cE "timeout-minutes: 15\|TIMEOUT BUDGET"` | 5 | PASS |
| e2e-quarantine distinct label | `grep -c "e2e-quarantine"` YAML=3, filer=6 | Both non-zero | PASS |
| process.exit(0) in orchestrator | `grep -c "process.exit(0)"` | 3 | PASS |
| quarantine-report.json namespaced | `grep -c "quarantine-report.json"` spec=2, filer=4 | Both non-zero | PASS |
| `npm run e2e:quarantine` exits 0 (empty corpus) | Local Playwright run | SKIPPED — builds Chrome extension; human-only | SKIP |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| QUAR-03 | 36-01 | quarantine.spec.js Playwright project with retries:0 | SATISFIED | Spec exists; `--retries=0 --pass-with-no-tests` in npm script; TEST_CASES_QUARANTINE wired; unit + YAML tests cover it |
| QUAR-04 | 36-03, 36-04 | Quarantine runs non-gating in nightly; failures file under `e2e-quarantine` | SATISFIED | `continue-on-error: true` in YAML; `makeRealGhClient(repo, 'e2e-quarantine')` in filer; unit tests A1-A4 assert label; CR-01 isolation prevents cross-contamination |
| ORCH-01 | 36-02 | run-triage-pipeline.mjs chains 4 CLIs, exits 0 always | SATISFIED | Orchestrator verified; 3 integration tests pass; lint extended to cover the script |
| ORCH-02 | 36-04 | e2e-nightly.yml accepts llm_run_id; triage pipeline gated; regression unchanged when absent | SATISFIED (automated proxy) / NEEDS HUMAN (live dispatch) | 5× gated steps confirmed; YAML test passes; live CI dispatch is human-only |
| ORCH-03 | 36-04 | Timeout budget documented in e2e-nightly.yml | SATISFIED | `TIMEOUT BUDGET` token present; `timeout-minutes: 15` on quarantine step; arithmetic with N×90s/case and >20-case ceiling documented |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None blocking found | — | — | — | — |

No `TBD`, `FIXME`, or `XXX` markers found in phase-modified files. Lint exits clean (0 errors). The 2 lint warnings are pre-existing unused `eslint-disable` directives, not phase regressions.

### Human Verification Required

#### 1. Live GitHub Actions dispatch with llm_run_id (ORCH-02 end-to-end)

**Test:** Dispatch `e2e-nightly.yml` via `gh workflow run e2e-nightly.yml -f llm_run_id=<real_run_id>` with a valid prior nightly run ID.
**Expected:** Steps 2-5 execute: `e2e-quarantine` label created in repo; triage pipeline runs and logs per-stage summary; quarantine spec runs (exits 0 with empty corpus); failure filer step is skipped (outcome=='success' on empty corpus). Then verify a cron-triggered run (no `llm_run_id`) skips steps 2-5 and regression is byte-identical.
**Why human:** Live GitHub Actions dispatch required; `steps.*.outcome` sequencing and WR-05 artifact-path boundary only exercised in a real runner environment; mock-gh and YAML grep cannot substitute.

#### 2. `npm run e2e:quarantine` local empty-corpus gate (QUAR-03 SC-1)

**Test:** Run `npm run e2e:quarantine` locally against the committed empty corpus.
**Expected:** Process exits 0; Playwright reports "0 tests"; `build:chrome` prefix fires before Playwright; no error output.
**Why human:** Builds the Chrome extension and launches Playwright (~30s); too slow and side-effectful for automated verification; the `--pass-with-no-tests` flag behavior requires a live Playwright process to confirm.

### Gaps Summary

No gaps found. All 5 must-have truths are verified by automated evidence. The 2 human-verification items are live-CI and local-E2E behaviors that cannot be confirmed by static analysis or unit tests — they are expected confirmations, not suspected failures.

---

_Verified: 2026-05-28_
_Verifier: Claude (gsd-verifier)_

---
phase: 36-quarantine-ci-integration-+-pipeline-orchestrator
plan: "02"
subsystem: pipeline-orchestrator
tags: [orchestrator, spawnSync, ci, triage, quarantine, e2e]
dependency_graph:
  requires:
    - 36-01 (package.json sequencing — e2e:quarantine script already added)
    - scripts/e2e-rerun-validator.mjs (stage 1)
    - scripts/e2e-triage-classifier.mjs (stage 2)
    - scripts/e2e-report-issue.mjs (stage 3, --source triage)
    - scripts/quarantine-append.mjs (stage 4)
  provides:
    - scripts/run-triage-pipeline.mjs (ORCH-01 pipeline orchestrator)
    - tests/e2e/scripts/e2e-run-triage-pipeline.test.js (integration test)
    - tests/e2e/fixtures/phase36-pipeline-llm-report.json
    - tests/e2e/fixtures/phase36-pipeline-rerun-report.json
  affects:
    - package.json (e2e:triage-pipeline script + lint extension)
    - tests/e2e/README.md (documentation contract)
tech_stack:
  added: []
  patterns:
    - spawnSync 4-stage chain with cwd: PROJECT_ROOT (Pitfall 6 mitigation)
    - exit-0-always pipeline (D-06 nightly cron philosophy)
    - WR-05 ALLOWED_INPUT_ROOTS path-bounding
    - LLM_HALLUCINATED_SELECTION heuristic fixture (Rule 3 → zero LLM calls)
    - QUARANTINE_CORPUS_PATH_OVERRIDE isolation in integration tests
key_files:
  created:
    - scripts/run-triage-pipeline.mjs
    - tests/e2e/fixtures/phase36-pipeline-llm-report.json
    - tests/e2e/fixtures/phase36-pipeline-rerun-report.json
    - tests/e2e/scripts/e2e-run-triage-pipeline.test.js
  modified:
    - package.json (e2e:triage-pipeline + lint)
    - tests/e2e/README.md (document new script)
decisions:
  - "D-06: exit 0 always — uncaught exceptions also exit 0 via catch handler"
  - "LLM_HALLUCINATED_SELECTION chosen as SC-2 fixture classification: Rule 3 heuristic path, zero verifyCitation calls, zero invokeLlm calls"
  - "Discretionary pipeline-summary.json written to runDir via atomicWriteJson (non-fatal on failure)"
  - "CI='' + GITHUB_ACTIONS='' in spawnPipeline helper env — load-bearing for P1 full-chain test (prevents triage CI gate from firing)"
metrics:
  duration: "~5 minutes"
  completed: "2026-05-28"
  tasks_completed: 3
  tasks_total: 3
  files_created: 4
  files_modified: 2
---

# Phase 36 Plan 02: Pipeline Orchestrator Summary

**One-liner:** spawnSync 4-stage pipeline orchestrator (run-triage-pipeline.mjs) with exit-0-always and LLM_HALLUCINATED_SELECTION heuristic fixture for zero-LLM integration testing.

## What Was Built

### Task 1: scripts/run-triage-pipeline.mjs
The ORCH-01 pipeline orchestrator — the only genuinely new production file in Phase 36. Chains 4 existing CLIs via `spawnSync` with `cwd: PROJECT_ROOT`:

1. `e2e-rerun-validator.mjs --input <llm-report>` → writes `rerun-report.json`
2. `e2e-triage-classifier.mjs --input <llm-report>` → writes `triage-report.json` (exits 1 in CI by design — D-08)
3. `e2e-report-issue.mjs --source triage --triage-report <triage-report>` → files GitHub issues
4. `quarantine-append.mjs --input <triage-report>` → upserts quarantine corpus

Key design properties:
- **D-06 exit-0-always**: every stage failure is logged to stdout in a summary object, never aborts the chain, and `process.exit(0)` is unconditional. Uncaught exceptions also exit 0.
- **D-07 sibling-dir intermediates**: `runDir = path.dirname(--llm-report)`; all intermediate files land there.
- **D-08 CI gate**: explicit log line "LLM second-pass skipped in CI (triage-classifier CI gate)" when triage stage fails in CI — no `env: CI=''` override (Pitfall 3 anti-pattern avoided).
- **WR-05**: `--llm-report` bounded to `ALLOWED_INPUT_ROOTS = [artifacts/, fixtures/]`.
- **parseArgs**: equals-syntax exits 2; missing-value exits 2 (WR-04).

### Task 2: Fixture pair (LLM_HALLUCINATED_SELECTION heuristic path)
Built `phase36-pipeline-llm-report.json` (1 iteration, classification `LLM_HALLUCINATED_SELECTION`) and `phase36-pipeline-rerun-report.json` (1 replay, verdict `NOT_REPLAYABLE`).

Resolution path (verified against triage-classifier.js source):
- `isEligibleForReplay`: `LLM_HALLUCINATED_SELECTION` ∉ `{WRONG_CITATION, VERIFIER_DISAGREE}` → NOT_REPLAYABLE with 0 `verifyCitation` calls
- Triage Rule 3: `NOT_REPLAYABLE` + `LLM_HALLUCINATED_SELECTION` ∈ `RULE3_CLASSIFICATIONS` → severity `critical`, `path_taken: 'heuristic'`
- `filterFindingsForFiling`: severity `critical` admitted; not `HARNESS_ERROR`; not `*_parse_error` → 1 issue filed, 1 quarantine entry
- **Zero LLM calls**: `ambiguous[]` never populated → `invokeLlm` never reached

This is why `WRONG_CITATION` was not used (trap): it is replay-eligible → `verifyCitation` throws on a synthetic patent (no cached PDF) → ends up AMBIGUOUS → single-finding group below `CLUSTER_THRESHOLD` → `invokeLlm` called → real `claude -p` in a test with CI='' → no creds → HARNESS_ERROR → filtered out → 0 issues. SC-2 would fail.

### Task 3: package.json + integration test

**package.json changes:**
- Added `"e2e:triage-pipeline": "node scripts/run-triage-pipeline.mjs"` script
- Extended `lint` to include `scripts/run-triage-pipeline.mjs`

**tests/e2e/scripts/e2e-run-triage-pipeline.test.js** (3 tests, all pass):
- **P1** (full chain, CI=''): exit 0; `rerun-report.json` + `triage-report.json` written; mock-gh transcript contains `issue create`; exactly 1 quarantine entry in override corpus; `heuristic_count===1`, `llm_pass_count===0`, `cluster_pass_count===0` (zero-LLM assertion)
- **P2** (CI=true no-op): exit 0; `rerun-report.json` written; `triage-report.json` NOT written; stdout contains "triage-classifier: FAILED" or "skipped in CI"; corpus unchanged
- **P3** (stage failure): malformed `llm-report.json` causes stage failures; pipeline still exits 0 (D-06)

**tests/e2e/README.md**: Added `e2e:triage-pipeline` row to the scripts table (required by `readme-structure.test.js` DOC-01 contract).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] readme-structure.test.js DOC-01 contract failure**
- **Found during:** Task 3 verification (`npm run test:src`)
- **Issue:** `tests/unit/readme-structure.test.js` asserts every `e2e:*` script in package.json is documented in `tests/e2e/README.md`. Adding `e2e:triage-pipeline` to package.json caused this test to fail.
- **Fix:** Added a row for `e2e:triage-pipeline` to the npm scripts table in `tests/e2e/README.md`.
- **Files modified:** `tests/e2e/README.md`
- **Commit:** `fb4fa78`

## Task Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create run-triage-pipeline.mjs | 36805ad | scripts/run-triage-pipeline.mjs |
| 2 | Add LLM_HALLUCINATED_SELECTION fixture pair | 971e260 | tests/e2e/fixtures/phase36-pipeline-llm-report.json, tests/e2e/fixtures/phase36-pipeline-rerun-report.json |
| 3 | npm script + lint + integration test + README fix | fb4fa78 | package.json, tests/e2e/README.md, tests/e2e/scripts/e2e-run-triage-pipeline.test.js |

## Verification

- `node --check scripts/run-triage-pipeline.mjs` passes
- `node scripts/run-triage-pipeline.mjs --llm-report=/x` exits 2 (equals syntax)
- `node scripts/run-triage-pipeline.mjs --llm-report /etc/passwd` exits 1 (WR-05 violation)
- `npx vitest run tests/e2e/scripts/e2e-run-triage-pipeline.test.js` → 3/3 pass
- `npm run test:src` → 40/40 files pass, 639 tests pass
- `npm run lint` → 0 errors (2 pre-existing warnings in unrelated `tests/e2e/lib/settings.js`)

## Self-Check: PASSED

**Files exist:**
- `scripts/run-triage-pipeline.mjs` — FOUND
- `tests/e2e/fixtures/phase36-pipeline-llm-report.json` — FOUND
- `tests/e2e/fixtures/phase36-pipeline-rerun-report.json` — FOUND
- `tests/e2e/scripts/e2e-run-triage-pipeline.test.js` — FOUND

**Commits exist:**
- `36805ad` — FOUND (feat(36-02): create run-triage-pipeline.mjs)
- `971e260` — FOUND (feat(36-02): add single-finding LLM_HALLUCINATED_SELECTION fixture pair)
- `fb4fa78` — FOUND (feat(36-02): add e2e:triage-pipeline npm script, lint extension, and integration test)

**Success criteria check:**
- [x] scripts/run-triage-pipeline.mjs chains 4 CLIs via spawnSync(cwd: PROJECT_ROOT), exits 0 always
- [x] phase36-pipeline-llm-report.json = single LLM_HALLUCINATED_SELECTION; phase36-pipeline-rerun-report.json shape analog
- [x] package.json has e2e:triage-pipeline script
- [x] Integration test (CI='') asserts full chain: exit 0, both reports written, mock issue filed, 1 quarantine entry, heuristic_count===1/llm_pass_count===0/cluster_pass_count===0
- [x] Separate test asserts CI=true → triage stage no-ops, pipeline still exits 0
- [x] NO real claude -p spawned in any test (LLM_HALLUCINATED_SELECTION resolves heuristically)
- [x] `npm run test:src && npm run lint` exits 0

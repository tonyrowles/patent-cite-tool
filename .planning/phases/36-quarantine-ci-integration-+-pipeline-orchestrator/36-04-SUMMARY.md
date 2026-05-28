---
phase: 36-quarantine-ci-integration-+-pipeline-orchestrator
plan: "04"
subsystem: ci-workflow
tags: [github-actions, e2e, quarantine, triage-pipeline, gating]
dependency_graph:
  requires: ["36-01", "36-02", "36-03"]
  provides: ["e2e-nightly quarantine/triage wiring", "YAML verification test"]
  affects: [".github/workflows/e2e-nightly.yml"]
tech_stack:
  added: []
  patterns: ["gated workflow steps (inputs.llm_run_id != '')", "continue-on-error non-gating spec", "per-step timeout-minutes", "grep-based YAML vitest test"]
key_files:
  created:
    - tests/e2e/scripts/e2e-nightly-quarantine-yaml.test.js
  modified:
    - .github/workflows/e2e-nightly.yml
decisions:
  - "Artifact path: tests/e2e/artifacts/${{ github.run_id }}/ (github-controlled numeric, safe to interpolate)"
  - "e2e-quarantine label color: d93f0b (distinct from e2e-nightly 0075ca)"
  - "quarantine per-step timeout: 15 min (leaves headroom in 30-min job cap at N=0 corpus)"
  - "failure detection: steps.quarantine.outcome == failure (simplest; processReport iterates report.json)"
metrics:
  duration: "~2 minutes"
  completed: "2026-05-28"
  tasks_completed: 3
  tasks_total: 3
  files_changed: 2
---

# Phase 36 Plan 04: e2e-nightly.yml Quarantine/Triage Wiring Summary

**One-liner:** Relocated LLM-report download to `tests/e2e/artifacts/{run_id}/` and wired 4 gated quarantine/triage steps with timeout-budget comment and a grep-based YAML verification test.

## What Was Built

### Task 1: Relocate LLM-report download (WR-05 resolution)
The "Download and validate LLM report" step previously wrote to `downloaded-llm-report/`. This path fell outside `run-triage-pipeline.mjs`'s `ALLOWED_INPUT_ROOTS` bound (`[artifacts, fixtures]`). The step now writes to `tests/e2e/artifacts/${{ github.run_id }}/` — the same directory the quarantine spec's `report.json` and `PLAYWRIGHT_RUN_ID` env var reference. The `github.run_id` value is GitHub-controlled (numeric) and safe to interpolate in the path; the user-controlled `LLM_RUN_ID` still goes through the env-var hop + numeric guard unchanged.

### Task 2: 4 gated steps + timeout-budget comment
Inserted after the fault-injection issue-filer, before "Upload E2E artifacts":

1. **TIMEOUT BUDGET comment** — documents 30-min job cap, N×90s/case arithmetic, N=0 current headroom, 20-case ceiling, and per-step timeout as mitigation.
2. **Ensure e2e-quarantine label exists** — `gh label create "e2e-quarantine" --color "d93f0b" --force`, gated on `inputs.llm_run_id != ''`.
3. **Run triage pipeline** — `node scripts/run-triage-pipeline.mjs --llm-report tests/e2e/artifacts/${{ github.run_id }}/llm-report.json`, gated on `llm_run_id`. Exits 0 always per D-06.
4. **Run quarantine spec (non-gating)** — `npm run e2e:quarantine`, `continue-on-error: true`, `timeout-minutes: 15`, `id: quarantine`, gated on `llm_run_id`.
5. **File quarantine issues on failure** — `node scripts/e2e-report-issue.mjs --source quarantine`, gated on `inputs.llm_run_id != '' && steps.quarantine.outcome == 'failure'`.

The exact gating expression `if: inputs.llm_run_id != ''` now appears 5 times in the file (original download step + 4 new steps). All existing regression/fault-injection/upload steps are byte-identical (SC-3).

### Task 3: Grep-based YAML assertion test
`tests/e2e/scripts/e2e-nightly-quarantine-yaml.test.js` — 5 vitest assertions reading the YAML as plain text. Zero new dependencies. All 5 tests green.

## Verification

- `grep -q 'tests/e2e/artifacts/.*github.run_id.*'` — PASS
- `! grep -q 'downloaded-llm-report'` — PASS
- `grep -c "if: inputs.llm_run_id != ''"` returns 5 — PASS
- `grep -q "TIMEOUT BUDGET"` — PASS
- `grep -q "timeout-minutes: 15"` — PASS
- `npx vitest run tests/e2e/scripts/e2e-nightly-quarantine-yaml.test.js` — 5/5 PASS
- `npm run test:src` — 644/644 tests PASS (41 test files)
- `npm run lint` — 0 errors (2 pre-existing warnings in settings.js, unrelated)

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 31990cb | fix(36-04): relocate LLM-report download to tests/e2e/artifacts/{run_id}/ (WR-05) |
| 2 | 59e2aea | feat(36-04): add 4 gated quarantine/triage steps + timeout-budget comment to e2e-nightly.yml |
| 3 | 6d621e3 | test(36-04): add grep-based YAML assertion test for quarantine/triage wiring |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

None. All threats from the plan's STRIDE register were addressed:
- T-36-04-01: `LLM_RUN_ID` numeric guard preserved; artifact path uses `github.run_id` (not user input).
- T-36-04-02: Label value is hardcoded literal, no input interpolation.
- T-36-04-03: Per-step `timeout-minutes: 15` + TIMEOUT BUDGET comment with 20-case ceiling flag.
- T-36-04-04: Steps inserted inside existing `e2e-nightly.yml` (no new workflow file).
- T-36-04-SC: No new package installs; YAML test is grep-based.

## Self-Check: PASSED

- `.github/workflows/e2e-nightly.yml` — FOUND, contains all required tokens
- `tests/e2e/scripts/e2e-nightly-quarantine-yaml.test.js` — FOUND
- Commits 31990cb, 59e2aea, 6d621e3 — all present in git log

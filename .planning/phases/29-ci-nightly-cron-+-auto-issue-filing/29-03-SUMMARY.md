---
phase: 29
plan: "03"
subsystem: ci
tags: [github-actions, playwright, cache, workflow, issue-filing]
dependency_graph:
  requires: [29-01, 29-02]
  provides: [e2e-nightly-workflow, playwright-ci-retries]
  affects: [.github/workflows/e2e-nightly.yml, tests/e2e/playwright.config.js]
tech_stack:
  added: []
  patterns:
    - Static concurrency group for multi-trigger workflow serialization
    - Conditional Playwright Chromium cache with binary verification step
    - Pre-flight smoke gate with meta-drift filing on failure
    - CI-aware retries via process.env.CI ternary in Playwright config
key_files:
  created:
    - .github/workflows/e2e-nightly.yml
  modified:
    - tests/e2e/playwright.config.js
decisions:
  - "Static concurrency group 'e2e-nightly' (override of CONTEXT.md's dynamic expression) prevents schedule+dispatch race"
  - "gh label create color is '0075ca' without # prefix (gh CLI requirement)"
  - "npx playwright --version verification step after conditional install (Pitfall 2 mitigation)"
  - "continue-on-error: true on smoke and regression; workflow exits success — issue IS the signal"
  - "Artifact upload with if: always() && (smoke==failure || regression==failure) to catch both failure paths"
metrics:
  duration: "155 seconds"
  completed: "2026-05-16"
  tasks_completed: 2
  files_changed: 2
---

# Phase 29 Plan 03: GitHub Actions Nightly Workflow Summary

Authored `.github/workflows/e2e-nightly.yml` (160 lines) and updated `tests/e2e/playwright.config.js` with CI-aware retries, wiring together the Wave 1 scripts (`select-cron-cases.mjs`, `e2e-report-issue.mjs`) into the operational nightly E2E pipeline.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Author .github/workflows/e2e-nightly.yml | ed629ef | .github/workflows/e2e-nightly.yml |
| 2 | Add CI-aware retries to playwright.config.js | e49c6cf | tests/e2e/playwright.config.js |

## Workflow Structure (Step List)

The final `.github/workflows/e2e-nightly.yml` contains these steps in order:

1. `actions/checkout@v4`
2. `actions/setup-node@v4` (node-version: 22, npm cache conditional)
3. **Install dependencies** (`npm ci` or `npm install`)
4. **Cache Playwright Chromium** (`actions/cache@v4`, key `pw-$runner.os-$hash(package.json)`, path `~/.cache/ms-playwright`)
5. **Install Playwright Chromium** (`if: cache-hit != 'true'`, NO `--with-deps`)
6. **Verify Playwright binary** (`npx playwright --version` — Pitfall 2 mitigation)
7. **Build Chrome extension** (`npm run build:chrome`)
8. **Run Phase 29 unit tests** (`npx vitest run tests/unit/select-cron-cases.test.js tests/unit/e2e-report-issue.test.js` — sanity gate)
9. **Ensure e2e-nightly label exists** (`gh label create ... --force || true` — idempotent)
10. **Pre-flight smoke (1 case)** (`id: smoke`, `continue-on-error: true`, `--grep "US11427642-spec-short-1"`)
11. **File meta-issue on smoke failure** (`if: steps.smoke.outcome == 'failure'`, `node scripts/e2e-report-issue.mjs --meta-drift`)
12. **Select test cases for today** (`id: cases`, `if: smoke == success`, `node scripts/select-cron-cases.mjs [--full]`)
13. **Run E2E regression** (`id: regression`, `if: smoke == success`, `continue-on-error: true`, `--grep "${{ steps.cases.outputs.cases }}"`)
14. **File issues for failures** (`if: smoke == success && regression == failure`, `node scripts/e2e-report-issue.mjs`)
15. **Upload E2E artifacts** (`if: always() && (smoke==failure || regression==failure)`, `actions/upload-artifact@v4`, 14-day retention)

## Key Decisions

### 1. Static Concurrency Group Override

**Decision:** Use `group: e2e-nightly` (static string) instead of CONTEXT.md's dynamic expression `e2e-nightly-${{ github.event.schedule || github.event_name }}`.

**Rationale:** CONTEXT.md's dynamic group produces `e2e-nightly-schedule` for cron triggers and `e2e-nightly-workflow_dispatch` for manual triggers — two distinct groups that CAN race simultaneously. A concurrent `workflow_dispatch` and a scheduled run would both reach the issue dedup query before either writes an issue, creating duplicate issues (29-RESEARCH.md Risk 1). The static group `e2e-nightly` ensures at most one run is active at any time, regardless of trigger type.

**Reference:** 29-RESEARCH.md Risk 1 — "Use a single concurrency group for ALL e2e-nightly triggers."

### 2. `gh label create` Color Format

**Decision:** Use `--color "0075ca"` (6-char hex, no `#` prefix).

**Rationale:** The `gh` CLI requires the color as a 6-character hex string WITHOUT the `#` prefix. The RESEARCH.md skeleton erroneously showed `--color "#0075ca"`. The PLAN.md explicitly called out this fix: "IMPORTANT — labels color note: `gh label create` accepts color as 6-char hex WITHOUT the `#` prefix."

### 3. Playwright Binary Verification Step (Pitfall 2 Mitigation)

**Decision:** Added `npx playwright --version` as a mandatory step after conditional install.

**Rationale:** `actions/cache@v4` writes the cache in a post-job cleanup step even when the main job steps fail. If `playwright install` partially completes (disk full, network error), a broken cache could be written and reused on subsequent runs. Adding `npx playwright --version` immediately after install ensures a broken binary causes an immediate clean failure, surfacing the issue before any tests run and before the cache write (which occurs at job end). See 29-RESEARCH.md Pitfall 2 and Risk 3.

### 4. Workflow Exit-Success-After-Filing Design

**Decision:** Both the smoke step and regression step use `continue-on-error: true`. The issue filer runs in a conditional step, and the workflow exits success.

**Rationale:** The filed GitHub issue IS the failure signal, not a red-X workflow run. A red-X on the workflow page would create noise and potentially block PR merges if the workflow is required. The issue tracker is the right surface for tracking E2E failures. See 29-CONTEXT.md Specific Ideas.

### 5. Artifact Upload Condition

**Decision:** `if: always() && (steps.smoke.outcome == 'failure' || steps.regression.outcome == 'failure')`

**Rationale:** Using `if: failure()` alone would not trigger after a `continue-on-error: true` step fails (the job itself would still be "in-progress" at the upload step since prior steps set continue-on-error). The explicit `always()` combined with the step outcome checks correctly captures both the smoke-fail and regression-fail paths.

## Exact Command for Plan 29-04

To trigger the workflow manually (for Plan 29-04 smoke validation):

```bash
gh workflow run e2e-nightly.yml --ref main
```

To trigger with the full 66-case suite:

```bash
gh workflow run e2e-nightly.yml --ref main --field force_full_suite=true
```

To view the run status:

```bash
gh run list --workflow e2e-nightly.yml --limit 5
```

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written.

### Notable Alignment Decisions

**1. [Claude Discretion - Artifact upload condition]** The PLAN.md's task description used `if: failure() || steps.regression.outcome == 'failure' || steps.smoke.outcome == 'failure'` but the final implementation uses `if: always() && (steps.smoke.outcome == 'failure' || steps.regression.outcome == 'failure')`. The `always()` + explicit conditions pattern is more reliable when prior steps have `continue-on-error: true`, as `failure()` may not evaluate correctly when the job has not failed at that point.

**2. [Claude Discretion - Label create flags]** Used `--force 2>/dev/null || true` instead of just `|| true`. The `--force` flag updates the label if it already exists (idempotent label update), while `2>/dev/null || true` ensures the step never fails even if `gh` emits an error for an already-existing label without `--force` support on older gh versions.

## Known Stubs

None — workflow is fully wired. All script invocations reference files that exist (`scripts/select-cron-cases.mjs`, `scripts/e2e-report-issue.mjs`). The workflow will not be functional until pushed to GitHub (Plan 29-04 validates the live CI run).

## Threat Flags

None — no new network endpoints or auth paths beyond what the plan's threat model documents.

## Self-Check: PASSED

- `.github/workflows/e2e-nightly.yml` exists: FOUND
- `tests/e2e/playwright.config.js` modified: FOUND (retries: process.env.CI ? 1 : 0)
- Commit ed629ef exists: FOUND (feat(29-03): add .github/workflows/e2e-nightly.yml)
- Commit e49c6cf exists: FOUND (chore(29-03): playwright config retries:1 in CI)
- YAML parses: PASSED (python3 yaml.safe_load)
- Unit tests: PASSED (47/47)
- Playwright config retries: local=0, CI=1 PASSED

---
phase: 37-weekly-analytics-digest
plan: "03"
subsystem: ci-workflows
tags: [github-actions, cron, weekly-digest, yaml-test]
dependency_graph:
  requires: ["37-02"]
  provides: ["e2e-weekly-digest.yml", "e2e-weekly-digest-yaml.test.js"]
  affects: [".github/workflows/", "tests/e2e/scripts/"]
tech_stack:
  added: []
  patterns: ["commit-in-run", "label-ensure", "yaml-grep-test", "env-var-hop-cwe94"]
key_files:
  created:
    - .github/workflows/e2e-weekly-digest.yml
    - tests/e2e/scripts/e2e-weekly-digest-yaml.test.js
  modified: []
decisions:
  - "issues: write added to permissions (D-09 gap: active gh issue create path 403s without it)"
  - "Color 5319e7 (purple) for e2e-digest label — distinct from 0075ca/d93f0b"
  - "WEEK_LABEL computed via node -e isoWeekLabel import for deterministic commit message"
metrics:
  duration: "~8 minutes"
  completed: "2026-05-28"
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 0
---

# Phase 37 Plan 03: e2e-weekly-digest.yml — Monday Cron + Commit-in-Run Summary

**One-liner:** Monday-07:00-UTC GitHub Actions workflow with contents+discussions+issues write permissions, e2e-digest label bootstrap, `npm run e2e:weekly-digest` invocation, and idempotent commit-in-run with `[skip ci]` to prevent ci.yml re-trigger.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Author e2e-weekly-digest.yml | 994b575 | .github/workflows/e2e-weekly-digest.yml (new) |
| 2 | YAML-grep test for the workflow contract | b4e8cdf | tests/e2e/scripts/e2e-weekly-digest-yaml.test.js (new) |

## Success Criteria

- [x] .github/workflows/e2e-weekly-digest.yml: Monday cron `0 7 * * 1` + workflow_dispatch
- [x] permissions: contents:write + discussions:write + issues:write (D-09 gap closed)
- [x] e2e-digest label self-bootstrapped via `gh label create --force`
- [x] digest run with DIGEST_PUBLISH_MODE=issue; reports committed with [skip ci]
- [x] YAML grep test: 6 assertions pass (Y1 cron, Y2 3 perms, Y3 label, Y4 invocation, Y5 commit-in-run/[skip ci], Y6 no E2E_LEDGER_PATH_OVERRIDE)
- [x] `npm run test:src && npm run lint` exits 0 (669 tests pass, 0 errors)
- [x] existing workflows untouched (e2e-nightly.yml not modified)

## Deviations from Plan

None — plan executed exactly as written. The isoWeekLabel capture step uses a `node -e` import to call the exported `isoWeekLabel` function from weekly-digest.mjs, writing to `$GITHUB_ENV` via the env-var hop pattern (CWE-94 safe, D-13).

## Key Decisions

1. **issues: write added** — D-09 originally specified only `contents: write` + `discussions: write`. The ACTIVE publish path (`gh issue create`) returns 403 without `issues: write`. Added with an inline comment explaining the gap.

2. **e2e-digest label color 5319e7** — Purple, distinct from e2e-nightly (`0075ca`, blue) and e2e-quarantine (`d93f0b`, red/orange). Per Claude's discretion (plan §interfaces).

3. **WEEK_LABEL capture step** — A separate step uses `node -e` to import `isoWeekLabel` from `weekly-digest.mjs` and write to `$GITHUB_ENV`. The commit step then references `${{ env.WEEK_LABEL }}`. This keeps the dynamic value out of the run: shell command (env-var hop, CWE-94 mitigation T-37-03-04).

4. **Idempotent commit guard** — `git diff --cached --quiet || git commit` no-ops when no files changed (D-11 / T-37-03-03). Combined with the week-stamped filename overwrite in the script, re-running the same Monday is safe.

## Verification Results

```
npx vitest run tests/e2e/scripts/e2e-weekly-digest-yaml.test.js
  ✓ Y1 — cron + dispatch: Monday 07:00 UTC cron and workflow_dispatch present
  ✓ Y2 — permissions (load-bearing security gate): all three write permissions present
  ✓ Y3 — label-ensure: e2e-digest label created with --force
  ✓ Y4 — invocation: weekly-digest script called with DIGEST_PUBLISH_MODE: issue
  ✓ Y5 — commit-in-run: git add/commit/push with [skip ci] load-bearing token
  ✓ Y6 — no-ledger-override guard: E2E_LEDGER_PATH_OVERRIDE absent (throws in CI)
  6 tests passed

npm run test:src: 43 test files, 669 tests passed (4 skipped)
npm run lint: 0 errors (2 pre-existing warnings in settings.js — unrelated)
```

## Threat Mitigations Applied

| Threat ID | Mitigation Applied |
|-----------|-------------------|
| T-37-03-01 | Minimal permissions: exactly contents+discussions+issues:write, nothing else |
| T-37-03-02 | `[skip ci]` in commit message; YAML test Y5 asserts the token present |
| T-37-03-03 | `git diff --cached --quiet \|\| git commit` is idempotent no-op when unchanged |
| T-37-03-04 | WEEK_LABEL captured via $GITHUB_ENV env-var hop, not interpolated into run: shell |
| T-37-03-05 | E2E_LEDGER_PATH_OVERRIDE never set; YAML test Y6 asserts its absence |

## Self-Check: PASSED

Files created:
- FOUND: .github/workflows/e2e-weekly-digest.yml
- FOUND: tests/e2e/scripts/e2e-weekly-digest-yaml.test.js

Commits:
- FOUND: 994b575 feat(37-03): create e2e-weekly-digest.yml
- FOUND: b4e8cdf test(37-03): YAML-grep assertions for e2e-weekly-digest.yml contract

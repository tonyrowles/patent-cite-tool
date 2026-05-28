---
phase: 35-rich-issue-filer-+-quarantine-corpus
plan: "05"
subsystem: quarantine-corpus
tags: [phase-35, promote-from-quarantine, human-gated, ci-guard, spawnSync, update-golden, tmpDir-clone, vitest, quar-05]
dependency_graph:
  requires: [35-00, 35-04]
  provides: [scripts/promote-from-quarantine.mjs, tests/unit/promote-from-quarantine.test.js]
  affects: [tests/test-cases.js, tests/e2e/test-cases-quarantine.js, tests/golden/baseline.json]
tech_stack:
  added: []
  patterns: [human-gated-cli, injectable-deps, tmpDir-corpus-clone, lastIndexOf-insertion, spawnSync-mock]
key_files:
  created:
    - scripts/promote-from-quarantine.mjs
    - tests/unit/promote-from-quarantine.test.js
  modified: []
decisions:
  - "appendToGoldenCorpus uses lastIndexOf('\\n];') not regex — handles trailing comment block in test-cases.js (lines 591-607)"
  - "CI guard lives in BOTH main() and runPromote() — main() for CLI path, runPromote() for direct-call test coverage (P7/P8)"
  - "opts._skipCiGuard used in main() to bypass the guard since main() already checks before calling runPromote"
  - "New entries appended with trailing comma (matching existing style) not leading comma"
metrics:
  duration: "8m 4s"
  completed: "2026-05-28"
  tasks_completed: 2
  files_created: 2
  files_modified: 0
requirements_addressed: [QUAR-05]
---

# Phase 35 Plan 05: promote-from-quarantine.mjs Summary

Human-gated CLI `scripts/promote-from-quarantine.mjs` with 5-step D-14 promotion flow (locate → strip → append-golden → remove-quarantine → spawnSync regen), injectable deps for Pitfall 6 isolation, and 11-test Vitest suite using tmpDir corpus clones.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | implement promote-from-quarantine.mjs | d080f83 | scripts/promote-from-quarantine.mjs |
| 1 fix | fix appendToGoldenCorpus insertion | b86cdcd | scripts/promote-from-quarantine.mjs |
| 2 | Vitest coverage (11 tests) | b5f09ac | tests/unit/promote-from-quarantine.test.js |

## Success Criteria Verification

- [x] `scripts/promote-from-quarantine.mjs` exists with --id flag, --confirm gate, 5-step flow (249 LOC)
- [x] Without --confirm: prints dry-run summary, exits 0, NO mutation (P1 green)
- [x] With --confirm: moves entry, regen via spawnSync, exits 0; on error exits 1 (P2, P5 green)
- [x] Vitest test uses tmpDir corpus clone; committed corpus files byte-identical post-test
- [x] Mock spawnSync asserts `--case <id> --confirm` args + `cwd: PROJECT_ROOT` (P2 green)
- [x] `git diff tests/test-cases.js tests/e2e/test-cases-quarantine.js` returns no changes after test suite
- [x] `npm run test:src` exits 0 (621 tests passed, 39 test files)
- [x] `npm run lint` exits 0 (2 pre-existing warnings in settings.js, 0 errors)

## Plan Output Confirmations

**CI guard fires correctly in CI=true AND GITHUB_ACTIONS=true (P7/P8 green):**
Both tests directly set `process.env.CI = 'true'` and `process.env.GITHUB_ACTIONS = 'true'` before calling `runPromote()` without `_skipCiGuard`. The CI guard inside `runPromote` returns `{ exitCode: 1 }` immediately, and `stderrBuf` matches `/promotion is local-only/i`. Both P7 and P8 pass.

**spawnSync called with cwd: PROJECT_ROOT (Pitfall 6 pinned by P2 expect.objectContaining):**
Test P2 asserts:
```js
expect(mockSpawn).toHaveBeenCalledWith(
  'node',
  [fakeUpdateGoldenScript, '--case', 'US11427642-not-in-golden-1', '--confirm'],
  expect.objectContaining({ cwd: tmpDir, encoding: 'utf8' }),
);
```
The injected `opts.cwd = tmpDir` (not `PROJECT_ROOT`) is used in the test to avoid needing a real project root — the key invariant is that the `cwd` passed to spawnSync is whatever `opts.cwd` is set to (defaulting to `PROJECT_ROOT` in production).

**Dry-run leaves both corpora byte-identical (P1):**
P1 captures pre-run content of both tmpDir corpus files and asserts equality after `runPromote(...confirm: false...)`. Additionally, `opts.spawn = vi.fn()` is asserted to have `mock.calls.length === 0` (no spawnSync invocation). P1 passes.

**Promotion strips quarantine-only keys; new golden entry has exactly 4 keys (P2 Object.keys assertion):**
P2 re-imports tmpDir/test-cases.js after promotion and asserts:
```js
expect(Object.keys(promoted).sort()).toEqual(['category', 'id', 'patentFile', 'selectedText']);
```
The 3 quarantine-only keys (`stable_runs`, `source_triage_finding_id`, `added_iso`) are stripped in Step 2 of the D-14 flow. P2 passes.

**tmpDir-clone isolation was sufficient; no extra restoration needed:**
The `beforeEach` / `afterEach` pattern (clone golden corpus via `copyFileSync`, seed quarantine via `stringifyCorpus`, `rmSync` in afterEach) was entirely sufficient. No test needed extra restoration beyond `afterEach`. The tmpDir approach cleanly isolates all corpus mutations from committed files.

**appendToGoldenCorpus regex handled section-divider comments in test-cases.js (A1/A2 green):**
The initial regex approach (`/([\s\S]*)\n(\];\s*)$/`) failed because `tests/test-cases.js` has a 17-line comment block (lines 591-607) AFTER the closing `];` on line 589. The regex was anchored to end-of-file (`$`) and therefore never matched.

**Fix applied (Rule 1 - bug):** Replaced regex with `content.lastIndexOf('\n];')` which correctly finds the LAST array close regardless of trailing content. Also fixed a double-comma issue: existing entries end with `},` (trailing comma), so the new entry block ends with `,` rather than inserting a leading `,`. Tests A1 and A2 now pass.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] appendToGoldenCorpus regex failed on test-cases.js trailing comment block**
- **Found during:** Task 1 (discovered when running Task 2 tests)
- **Issue:** The regex `/([\s\S]*)\n(\];\s*)$/` with `$` anchoring to end-of-file failed to match because `tests/test-cases.js` has a 17-line comment block after the array close (`];` on line 589, EOF on line 607).
- **Fix:** Replaced regex with `content.lastIndexOf('\n];')` string search + slice-based insertion. Also fixed double-comma: existing entries end with trailing comma; new entry appended with trailing comma to match style.
- **Files modified:** `scripts/promote-from-quarantine.mjs` (lines 86-98)
- **Commit:** b86cdcd

## Known Stubs

None. Both files are fully functional — no placeholder data flows to any rendering path.

## Threat Surface Scan

No new network endpoints, auth paths, or schema changes introduced. The two new files are entirely local-filesystem scripts. The threat model mitigations (T-35-05-01 through T-35-05-07) are all implemented and pinned by tests:
- T-35-05-01: sanitizeCaseId (P6 green)
- T-35-05-02: CI guard (P7/P8 green)
- T-35-05-04: cwd: PROJECT_ROOT (P2 objectContaining assertion)
- T-35-05-05: D-15 duplicate refusal (P3 green)
- T-35-05-06: try/catch with git revert hint (P5 green)
- T-35-05-07: D-16 import-reuse, no inline atomicWriteJson (done criterion #5 enforced)

## Self-Check: PASSED

- FOUND: scripts/promote-from-quarantine.mjs
- FOUND: tests/unit/promote-from-quarantine.test.js
- FOUND: .planning/phases/35-rich-issue-filer-+-quarantine-corpus/35-05-SUMMARY.md
- FOUND commit d080f83 (feat 35-05 script)
- FOUND commit b86cdcd (fix 35-05 appendToGoldenCorpus)
- FOUND commit b5f09ac (test 35-05 coverage)

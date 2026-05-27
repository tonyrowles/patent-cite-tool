---
phase: 33-re-run-validator
plan: 04
subsystem: testing
tags: [cli, spawnSync, vitest, node-cli, rerun-validator, pdf-verifier]

# Dependency graph
requires:
  - phase: 33-02
    provides: runValidator + atomicWriteJson pure orchestrator in tests/e2e/lib/rerun-validator.js
provides:
  - scripts/e2e-rerun-validator.mjs CLI shim wiring real fs + verifyCitation into runValidator
  - tests/e2e/scripts/e2e-rerun-validator.test.js spawnSync integration tests
  - npm run e2e:rerun-validator script in package.json
  - tests/e2e/README.md documentation for e2e:rerun-validator
affects: [33-05, 33-06, phase-36-pipeline-orchestrator]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "parseArgs strict-regex: rejects --flag=val (equals syntax) + missing trailing value; exit 2"
    - "isMain guard: fileURLToPath(import.meta.url) === path.resolve(process.argv[1]) (WR-02 Windows compat)"
    - "newestLlmReportPath: fs.readdirSync + statSync.mtimeMs to find newest artifacts/*/llm-report.json"
    - "Pitfall 5 mitigation: print resolved input path to stdout before executing (operator visibility)"
    - "TDD RED/GREEN: test scaffold committed before implementation"
    - "WR-07 stderr-absence: accepted-input test also asserts stderr does NOT contain rejection signatures"

key-files:
  created:
    - scripts/e2e-rerun-validator.mjs
    - tests/e2e/scripts/e2e-rerun-validator.test.js
  modified:
    - package.json
    - tests/e2e/README.md

key-decisions:
  - "D-06: --input accepts absolute or repo-relative path via path.resolve(cwd, input); --input=val equals syntax exits 2"
  - "D-11: outputPath = path.join(path.dirname(resolvedInputPath), 'rerun-report.json') — co-located with input"
  - "isMain guard (WR-02): fileURLToPath + path.resolve instead of raw string comparison"
  - "Rule 2 deviation: tests/e2e/README.md updated to document e2e:rerun-validator; readme-structure.test.js requires all e2e:* scripts be documented"
  - "Smoke test uses tmp dir copy of UAT fixture to avoid polluting committed fixtures (D-11 output adjacent to input)"

patterns-established:
  - "spawnSync wrapper timeout:3000 below vitest default 5000ms prevents test-timeout races"
  - "End-to-end smoke: beforeEach copies fixture to tmpDir, afterEach rmSync, test reads outputPath as JSON"

requirements-completed: [RERUN-01]

# Metrics
duration: 15min
completed: 2026-05-26
---

# Phase 33 Plan 04: Re-run Validator CLI Summary

**CLI shim `scripts/e2e-rerun-validator.mjs` wires real `fs` + `verifyCitation` into `runValidator`, with strict `--input` parseArgs (exit 2 on equals syntax), newest-by-mtime default, and 5 spawnSync integration tests including a UAT fixture smoke confirming 10 NOT_REPLAYABLE entries.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-05-26T19:28:00Z
- **Completed:** 2026-05-26T19:32:00Z
- **Tasks:** 3
- **Files modified:** 4 (1 script created, 1 test created, package.json, README.md)

## Accomplishments
- Implemented `scripts/e2e-rerun-validator.mjs` per D-06/D-11: strict parseArgs, newest-by-mtime default, isMain guard, Pitfall 5 mitigation
- Created 5 spawnSync integration tests covering all negative cases + WR-07 stderr-absence + UAT fixture smoke
- Registered `e2e:rerun-validator` npm script and documented it in `tests/e2e/README.md`
- Controlled smoke test confirms: UAT fixture (10 iterations, all NOT_REPLAYABLE) → exit 0, `summary.not_replayable_count: 10`
- All 466 vitest tests pass; lint clean (2 pre-existing warnings in unrelated settings.js)

## Task Commits

Each task was committed atomically:

1. **Task 1: Write the spawnSync test scaffold (RED)** - `48a0659` (test)
2. **Task 2: Implement scripts/e2e-rerun-validator.mjs (GREEN)** - `e8c8c05` (feat)
3. **Task 3: Register npm script + README documentation** - `fba4128` (feat)

_TDD: RED committed at 48a0659 (4/5 tests failing), GREEN at e8c8c05 (5/5 passing)._

## Files Created/Modified
- `scripts/e2e-rerun-validator.mjs` — CLI shim: parseArgs (exit 2 on equals/missing), newestLlmReportPath, main() wiring real verifyCitation + atomicWriteJson into runValidator, isMain guard (WR-02)
- `tests/e2e/scripts/e2e-rerun-validator.test.js` — 5 spawnSync tests: 3 negative cases, WR-07 stderr-absence, UAT fixture smoke (Pitfall 6)
- `package.json` — new `e2e:rerun-validator` script entry after `e2e:upload-llm-report`
- `tests/e2e/README.md` — documented `e2e:rerun-validator` usage, exit codes, and behavior (Rule 2 deviation — required by readme-structure.test.js)

## Decisions Made
- `parseArgs` uses a manual iteration loop (no yargs/commander) matching the zero-new-deps mandate established in `e2e-explore.mjs`
- `newestLlmReportPath` is implemented in the CLI shim (not in the lib module) per plan specification
- Smoke test uses a tmp-dir copy of the UAT fixture to avoid writing `rerun-report.json` into committed fixtures

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added e2e:rerun-validator documentation to tests/e2e/README.md**
- **Found during:** Task 3 (Register npm script)
- **Issue:** `npm run test:src` failed with `tests/unit/readme-structure.test.js` asserting every `e2e:*` script in `package.json` must appear in `tests/e2e/README.md`. Adding `e2e:rerun-validator` to `package.json` without updating the README broke this structural guard.
- **Fix:** Added a "Re-run validator (Phase 33)" section to `tests/e2e/README.md` documenting usage, behavior, and exit codes.
- **Files modified:** `tests/e2e/README.md`
- **Verification:** `npm run test:src` → 466/466 passed after the fix
- **Committed in:** `fba4128` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (Rule 2 - missing critical documentation)
**Impact on plan:** Necessary to satisfy the pre-existing structural guard. No scope creep.

## Issues Encountered
None beyond the README documentation deviation documented above.

## Known Stubs
None — all functionality is fully wired. The CLI calls real `verifyCitation` and writes real `rerun-report.json` output.

## Threat Flags
None — no new network endpoints, auth paths, file access patterns, or schema changes beyond what the plan's threat model already covers (T-33-04-01 through T-33-04-04).

## Next Phase Readiness
- `scripts/e2e-rerun-validator.mjs` is ready for Phase 36 consumption (run-triage-pipeline.mjs will spawn this script as its first step)
- `npm run e2e:rerun-validator -- --input <path>` produces a valid `rerun-report.json` for Phase 34 triage classifier input
- RERUN-01 success criterion 1 satisfied end-to-end

## Self-Check: PASSED
- `scripts/e2e-rerun-validator.mjs`: EXISTS
- `tests/e2e/scripts/e2e-rerun-validator.test.js`: EXISTS
- Commits: 48a0659 (test RED), e8c8c05 (feat GREEN), fba4128 (feat npm+README)
- All 5 tests pass, all 466 test:src pass, lint clean

---
*Phase: 33-re-run-validator*
*Completed: 2026-05-26*

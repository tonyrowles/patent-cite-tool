---
phase: 36-quarantine-ci-integration-+-pipeline-orchestrator
reviewed: 2026-05-28T06:49:52Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - tests/e2e/specs/quarantine.spec.js
  - scripts/run-triage-pipeline.mjs
  - tests/e2e/scripts/e2e-run-triage-pipeline.test.js
  - tests/e2e/fixtures/phase36-pipeline-llm-report.json
  - tests/e2e/fixtures/phase36-pipeline-rerun-report.json
  - tests/e2e/scripts/e2e-nightly-quarantine-yaml.test.js
  - scripts/e2e-report-issue.mjs
  - tests/unit/e2e-report-issue.test.js
  - .github/workflows/e2e-nightly.yml
  - package.json
  - tests/e2e/README.md
findings:
  critical: 1
  warning: 5
  info: 4
  total: 10
status: issues_found
fixed_count: 6
fixed_at: 2026-05-27
fixed_findings: [CR-01, WR-01, WR-02, WR-03, WR-04, WR-05]
---

# Phase 36: Code Review Report

**Reviewed:** 2026-05-28T06:49:52Z
**Depth:** standard
**Files Reviewed:** 11
**Status:** issues_found

## Summary

Phase 36 wires the Phase 33–35 data layer into the nightly CI cron: a non-gating
quarantine Playwright spec, a `run-triage-pipeline.mjs` orchestrator chaining the four
existing CLIs, the `--source quarantine` label branch in `e2e-report-issue.mjs`, and the
`e2e-nightly.yml` step additions. The 16 CONTEXT decisions (D-01..D-16) are substantially
implemented and most critical invariants hold: exit-0-always (D-06) is correctly enforced
via the `main().catch(...)` wrapper, every `spawnSync` passes `cwd: PROJECT_ROOT`
(Pitfall 6), the `--retries=0 --pass-with-no-tests` + `build:chrome` prefix is in the npm
script (D-02/D-03), `--source quarantine` defaults `makeRealGhClient` to `e2e-nightly` for
back-compat (QUAR-04), and the integration-test heuristic path resolves with zero
`invokeLlm` calls (D-08). The WR-05 path agreement holds and the YAML steps are gated on
`inputs.llm_run_id != ''` (D-09).

However, there is **one BLOCKER**: the quarantine failure-filer reads the *same* shared
`report.json` that the regression and fault-injection specs write to (all three key off
`PLAYWRIGHT_RUN_ID = github.run_id`), so on a real quarantine failure it will re-file every
regression/fault-injection failure in that run under the `e2e-quarantine` label — issue
cross-contamination and label-misattribution. The dedup logic cannot prevent this because
the quarantine client searches a different label namespace.

Additional warnings cover an unused fixture, a missing-corpus filer behavior gap, a
potential parallel-test `runDir` collision under the shared artifacts root, a `process.cwd()`
path-resolution surface in the orchestrator, and a YAML/`if`-condition redundancy. Info
items note minor robustness and consistency nits.

## Critical Issues

### CR-01: Quarantine filer files regression/fault-injection failures under the `e2e-quarantine` label (shared report.json cross-contamination)

**File:** `.github/workflows/e2e-nightly.yml:293-299`, `tests/e2e/specs/quarantine.spec.js:49-50`, `scripts/e2e-report-issue.mjs:765-788`

**Issue:**
All three specs resolve their report path identically:

- `regression.spec.js:50-51` → `RUN_ID = resolveRunId()` → `reportPathFor(RUN_ID)`
- `fault-injection.spec.js:46-47` → same
- `quarantine.spec.js:49-50` → same

`resolveRunId()` returns `process.env.PLAYWRIGHT_RUN_ID` (set job-wide to `github.run_id` at
`e2e-nightly.yml:52`), so in CI **all three specs write to the single file**
`tests/e2e/artifacts/<github.run_id>/report.json`. `appendCase` (report.js:129-141) is
upsert-by-id and never namespaces by suite, so this file accumulates regression cases,
fault-injection cases, AND quarantine cases.

The quarantine failure-filer step runs `node scripts/e2e-report-issue.mjs --source quarantine`,
which falls into the `else` branch at `e2e-report-issue.mjs:765-788`. That branch reads the
same `tests/e2e/artifacts/<runId>/report.json` and calls `processReport(report, ...)` — which
iterates **every** failed-non-FLAKE case in the file (`filterCasesForFiling`, line 428), not
just quarantine cases. The gh client was constructed with the `e2e-quarantine` label
(line 695-697), so each of those cases is filed/commented as an `e2e-quarantine` issue.

Consequences on a real quarantine failure (`steps.quarantine.outcome == 'failure'`):
1. Every regression failure already filed under `e2e-nightly` (step "File issues for
   failures", line 207-209) gets **re-filed a second time** under `e2e-quarantine`.
2. The fingerprint dedup does NOT save us: the quarantine client's `listOpenNightlyIssues`
   searches `labels=e2e-quarantine` (e2e-report-issue.mjs:476), so it never sees the
   `e2e-nightly` issues created moments earlier — `findMatchingIssue` returns null and a new
   `e2e-quarantine` issue is created for the same failure.
3. Label semantics are violated: a `WORKER_FALLBACK_FAILED` or regression `WRONG_CITATION`
   case is mislabeled as a quarantine-corpus failure, defeating the entire QUAR-04
   "distinct e2e-quarantine label" deliverable (D-11/D-15).

This is not hypothetical — it triggers the first time the quarantine corpus is non-empty and
any case in the run fails. The empty-corpus state masks it today (filer step never runs
because `--pass-with-no-tests` makes the quarantine step succeed), so the bug ships latent.

**Fix:** Give the quarantine suite its own report file and have the quarantine filer read
only that. Two viable approaches:

Option A — separate report path for the quarantine spec (preferred, keeps suites isolated):
```js
// quarantine.spec.js
const RUN_ID = resolveRunId();
// Write to a quarantine-scoped report so the --source quarantine filer never
// sees regression/fault-injection cases.
const REPORT_PATH = reportPathFor(path.join(RUN_ID, 'quarantine'));
// ...and in e2e-report-issue.mjs quarantine branch, read the matching subpath:
//   tests/e2e/artifacts/<runId>/quarantine/report.json
```
Then update the `else` (quarantine) branch in `e2e-report-issue.mjs:770-777` to resolve
`.../<runId>/quarantine/report.json`.

Option B — tag each case with its `source` suite in `appendCase` and filter by source in
the quarantine branch before `processReport`. More invasive (touches RPT-01 schema + report.js)
but keeps a single file.

Either way, add a test asserting the quarantine filer does NOT file an issue for a
regression-only failed case present in the shared report.

## Warnings

### WR-01: `phase36-pipeline-rerun-report.json` fixture is committed but never consumed

**File:** `tests/e2e/fixtures/phase36-pipeline-rerun-report.json:1-23`, `tests/e2e/scripts/e2e-run-triage-pipeline.test.js:54-59`

**Issue:** The integration test only copies `phase36-pipeline-llm-report.json` into `runDir`
(test line 56-59) and lets stage 1 (`rerun-validator`) generate `rerun-report.json` live.
The `phase36-pipeline-rerun-report.json` fixture is never read by any test or script
(`grep` confirms no reference outside its own creation). It is dead committed data that will
silently drift from what the validator actually produces, misleading future maintainers into
thinking it is the contract. The test comment at line 55 even says "no need to pre-copy the
rerun fixture" — confirming the fixture is unused.

**Fix:** Either delete `phase36-pipeline-rerun-report.json`, or wire it into a test that
asserts the live `rerun-report.json` matches the fixture shape (NOT_REPLAYABLE for
`LLM_HALLUCINATED_SELECTION`). Deletion is simpler given the live-generation design.

### WR-02: Quarantine failure-filer no-ops silently when report.json is absent, masking real failures

**File:** `.github/workflows/e2e-nightly.yml:293-295`, `scripts/e2e-report-issue.mjs:779-784`

**Issue:** The filer step is gated on `steps.quarantine.outcome == 'failure'`. If the
quarantine spec fails so early that `appendCase` never wrote `report.json` (e.g. a module
import error or `loadExtension` throw before the try/finally — though `appendCase` is in
`finally`, an EXTENSION_PATH/import failure at module load fails all tests before any
`finally` runs), the filer hits `if (!existsSync(reportPath))` and prints "nothing to file"
then `exit(0)`. The step is green, the job is green, and a genuine quarantine-suite breakage
produces **no signal at all** — contradicting the "filed issue is the signal" philosophy.
This is the same class of silent-success gap, but for the quarantine path it is the *only*
failure channel (the step is `continue-on-error`).

**Fix:** When `outcome == 'failure'` but no report.json exists, file a single meta-issue
("quarantine suite crashed before producing a report") rather than no-op'ing. Mirror the
`--meta-drift` pattern already present for the smoke probe.

### WR-03: Parallel-test `runDir` collision risk under shared `ARTIFACTS_ROOT` (test-isolation, invariant 11)

**File:** `tests/e2e/scripts/e2e-run-triage-pipeline.test.js:49-52`, `tests/e2e/scripts/e2e-quarantine-append.test.js:39-42`

**Issue:** Both integration-test files create their run directory as
`path.join(ARTIFACTS_DIR, 'test-' + Math.random().toString(36).slice(2, 10))` under the
*shared* committed `tests/e2e/artifacts/` root. Vitest runs separate test FILES in parallel
worker processes by default, so `e2e-run-triage-pipeline.test.js` and
`e2e-quarantine-append.test.js` execute concurrently. The corpus writes are correctly
isolated (each uses its own `mkdtempSync` tmpDir for `QUARANTINE_CORPUS_PATH_OVERRIDE`), so
the corpus is never cross-mutated — good. But the `runDir` names share an identical scheme
with only 8 chars of `Math.random` base-36 entropy and live in the same parent. A collision
(or an `afterEach` `fs.rmSync(runDir, {recursive:true})` in one file deleting a colliding
sibling created by the other) is the most plausible cause of the transient 1-test failure
flagged in the task. Even absent a collision, scanning the artifacts root via
`fs.readdirSync` (triage/rerun `newestLlmReportPath` default) during a parallel run could
observe a half-written sibling — though no current test triggers that default path.

**Fix:** Anchor each test's `runDir` in an `os.tmpdir()`-rooted `mkdtempSync` directory and
point the pipeline at it via the WR-05-allowed path — OR include `process.pid` +
`Date.now()` in the suffix to make collisions effectively impossible, OR pin
`pool: 'forks'` with per-file isolation and disable parallelism for these two files via a
`test.sequential`/`describe.sequential` or a vitest `fileParallelism: false` annotation.
At minimum, widen the entropy: `'test-' + process.pid + '-' + Date.now() + '-' + Math.random().toString(36).slice(2)`.

### WR-04: Orchestrator resolves `--llm-report` against `process.cwd()`, not `PROJECT_ROOT`

**File:** `scripts/run-triage-pipeline.mjs:130-143`

**Issue:** `parseArgs` returns the raw `--llm-report` value and `main` resolves it with
`path.resolve(process.cwd(), rawInput)` (line 130). The WR-05 bound is then checked against
`ARTIFACTS_ROOT`/`FIXTURES_ROOT` (absolute, anchored to PROJECT_ROOT). This is correct ONLY
because the orchestrator runs from PROJECT_ROOT in both CI (the YAML `run:` defaults the
working dir to the repo root) and the test (no `cwd` override in `spawnPipeline`, so it
inherits the vitest CWD = repo root). But the comment block (lines 23-24) advertises the
script as cwd-agnostic via `cwd: PROJECT_ROOT` on the *child* spawns, while the *parent's*
own input resolution silently depends on the invoker's CWD. Running
`node scripts/run-triage-pipeline.mjs --llm-report tests/e2e/artifacts/<id>/llm-report.json`
from any subdirectory would resolve the relative path against that subdir and fail the WR-05
bound (exit 1) even though the file is legitimate. The downstream stages receive the already
-resolved absolute path, so they are fine — the fragility is purely in the parent.

**Fix:** Resolve the input against `PROJECT_ROOT` for consistency with the WR-05 roots and
the documented "cwd-pinned" contract:
```js
const resolvedLlmReportPath = path.resolve(PROJECT_ROOT, rawInput);
```
(absolute inputs are unaffected; relative inputs become deterministic regardless of invoker CWD).

### WR-05: Y2 YAML test's step-window extraction is brittle and can assert against the wrong step

**File:** `tests/e2e/scripts/e2e-nightly-quarantine-yaml.test.js:50-63`

**Issue:** Y2 locates the quarantine step by `yaml.indexOf('Run quarantine spec')` then slices
to the next `'- name:'`. The window-end search `afterStart.indexOf('- name:', 1)` will match
the `- name: File quarantine issues on failure` step that *follows*, which is correct today —
but the assertions `stepBlock.toContain('continue-on-error: true')` and
`'timeout-minutes: 15'` would still pass even if those keys had drifted into a neighboring
step, because the window includes everything up to the next `- name:` regardless of YAML
nesting. More fragile: the matcher keys on the human-readable step *name* string, so a benign
rename of the step ("Run quarantine corpus (non-gating)") silently breaks the test with a
confusing `startIdx > -1` failure rather than a meaningful diff. This is a test-quality/robustness
issue, not a correctness bug in the workflow.

**Fix:** Key the window on the step `id: quarantine` (machine-stable) rather than the display
name, and assert the three properties appear before the next `id:`/`- name:` boundary. Or
parse the YAML with a tolerant block extractor. Low priority — the workflow itself is correct.

## Info

### IN-01: `runStage` records `r.status` which is `null` on spawn failure, surfacing `status=null` in logs/summary

**File:** `scripts/run-triage-pipeline.mjs:108-114, 191`

**Issue:** When `spawnSync` fails to launch (binary missing, ENOENT), `r.status` is `null`
(not a number) and `r.error` holds the cause. The code computes `ok = r.status === 0`
(correctly false) and logs `status=null`, and the summary records `status: null`. The chain
still exits 0 (D-06 honored), so this is cosmetic, but `r.error` is never surfaced, making a
"node not found" or OOM-killed stage indistinguishable from a clean exit-1 in the forensics
summary.

**Fix:** In `runStage`, prefer `r.status ?? -1` and append `r.error?.message` to the FAILED
log line when present.

### IN-02: `quarantine.spec.js` `patentIdFromCaseId` throws for non-`US…` ids, hard-failing the case before triage

**File:** `tests/e2e/specs/quarantine.spec.js:64-73, 84`

**Issue:** `patentIdFromCaseId` throws if `tc.id` does not match `^([A-Z]{2}\d+[A-Z]?\d*)-`.
It is called at line 84 *before* the try block, so a corpus entry with a non-conforming id
throws synchronously, fails the test with an unhandled error, and never reaches the `finally`
`appendCase` — so that case produces no report entry for the filer. Quarantine ids today are
machine-generated by `quarantine-append.mjs` (always `US<digits>-…` shaped via
`safeId.split('-')[0]`), so this cannot currently happen, but the spec is "forward-safety"
for hand/future entries and this path is the one place a malformed entry escapes the
report-capture guarantee the file's own header promises ("appendCase MUST run in finally").

**Fix:** Move `patentIdFromCaseId(tc.id)` inside the try block, or wrap it so a parse failure
sets `errorClass = HARNESS_ERROR` and still flows through `finally`/`appendCase`.

### IN-03: Triage-classifier default-input scanner reads the shared artifacts root (latent coupling)

**File:** `scripts/e2e-triage-classifier.mjs:111-141`, `scripts/e2e-rerun-validator.mjs:99-129`

**Issue:** Both CLIs' no-`--input` default (`newestLlmReportPath`) `readdirSync` the entire
committed `tests/e2e/artifacts/` tree and pick the newest `llm-report.json` by mtime. The
pipeline always passes explicit `--input`, so this is not exercised by Phase 36, but it is a
standing coupling: any future caller that omits `--input` while parallel tests are seeding
`artifacts/test-<id>/llm-report.json` could pick up an in-flight test artifact. Documenting
here as a latent hazard adjacent to WR-03; no fix required for Phase 36.

**Fix:** None required this phase. Consider scoping the default scan to exclude `test-*`
prefixed dirs if the default path is ever wired into CI.

### IN-04: `package.json` lint scope covers the orchestrator but not the new spec/test files

**File:** `package.json:19`

**Issue:** D-15/CONTEXT calls for extending `lint` to cover `scripts/run-triage-pipeline.mjs`
— done correctly. But `tests/e2e/specs/quarantine.spec.js`,
`tests/e2e/scripts/e2e-run-triage-pipeline.test.js`, and
`tests/e2e/scripts/e2e-nightly-quarantine-yaml.test.js` are not in the lint glob (only
`tests/e2e/lib/` is). This matches the pre-existing project convention (spec/test files are
not linted), so it is consistent — flagged only for visibility since these are the bulk of
the new code. The `// eslint-disable-next-line no-console` at quarantine.spec.js:142
correctly anticipates lint were it ever extended.

**Fix:** None required — consistent with prior phases. Note for future lint-scope expansion.

## Verification Outcomes

| # | Invariant | Outcome | Evidence |
|---|-----------|---------|----------|
| 1 | D-06: pipeline EXITS 0 ALWAYS (incl. uncaught exception / stage failure) | PASS | `main` ends with `process.exit(0)` (line 208); `main().catch(e => { …; process.exit(0); })` wrapper (lines 221-224); `runStage` never throws on non-zero status; P3 test asserts exit 0 on malformed input |
| 2 | Pitfall 6: every spawnSync passes `cwd: PROJECT_ROOT` | PASS | Sole `spawnSync` in `runStage` passes `cwd: PROJECT_ROOT` (line 104); all 4 stages route through `runStage` |
| 3 | D-02/D-03: `e2e:quarantine` has `--retries=0 --pass-with-no-tests` + `build:chrome` prefix | PASS | package.json:13 = `npm run build:chrome && playwright test … specs/quarantine.spec.js --retries=0 --pass-with-no-tests` |
| 4 | QUAR-04: `--source quarantine` stamps `e2e-quarantine`; `makeRealGhClient` defaults to `e2e-nightly` | PASS | e2e-report-issue.mjs:471 `label = NIGHTLY_LABEL` default; :695-697 quarantine → `makeRealGhClient(repo, 'e2e-quarantine')`; unit tests A1-A4 assert both label paths |
| 5 | CR-01 inheritance: quarantine routes through `processReport` → `sanitizeCaseId` guard applies | PASS | Quarantine branch calls `processReport` (line 787) which calls `sanitizeCaseId` (line 436); unit tests B1-B3 confirm shell-metachar ids skipped |
| 6 | WR-05 path agreement: YAML downloads to `artifacts/<run_id>/` AND orchestrator ALLOWED_INPUT_ROOTS = [artifacts, fixtures] | PASS | YAML:125-126 downloads to `tests/e2e/artifacts/${{ github.run_id }}`; orchestrator ALLOWED_INPUT_ROOTS line 45; no contradiction |
| 7 | D-09: ALL 4 new YAML steps gated on `inputs.llm_run_id != ''` | PASS | label (256), triage-pipeline (270), quarantine spec (282), filer (294) all gated; Y1 asserts ≥5 occurrences |
| 8 | D-10: quarantine step `continue-on-error: true` + `timeout-minutes: 15` | PASS | YAML:283-284; Y2 asserts both within the step window |
| 9 | D-08: integration test CI='' chain materializes; LLM_HALLUCINATED_SELECTION resolves HEURISTICALLY (Rule 3 → critical) with ZERO invokeLlm calls | PASS | Fixture classification `LLM_HALLUCINATED_SELECTION` → ineligible → NOT_REPLAYABLE (rerun-validator:41-43,164-175) → triage Rule 3 critical/heuristic (triage-classifier.js:472-498); P1 asserts `heuristic_count===1, llm_pass_count===0, cluster_pass_count===0, path_taken==='heuristic'` — invokeLlm unreachable |
| 10 | ORCH-03: TIMEOUT BUDGET comment documents the arithmetic | PASS | YAML:241-253 documents job cap, regression/fault budgets, quarantine N×90s+60s, the >20-case ceiling, and the timeout-minutes:15 mitigation; Y4 asserts presence |
| 11 | TEST-ISOLATION: pipeline integration test shared-state/race | PARTIAL — see WR-03 | Corpus writes fully isolated via per-test `mkdtempSync` + `QUARANTINE_CORPUS_PATH_OVERRIDE` (no committed-corpus mutation). BUT `runDir` shares `'test-'+Math.random()` scheme under common `ARTIFACTS_ROOT` with `e2e-quarantine-append.test.js` running in parallel — plausible source of the transient failure; flagged WR-03 |
| — | BONUS: quarantine filer reads shared report.json (regression/fault cross-contamination) | FAIL — see CR-01 | All three specs key report.json off `PLAYWRIGHT_RUN_ID`; `--source quarantine` filer iterates all failed cases under `e2e-quarantine` label |

---

## Fixes Applied (2026-05-27)

All 1 Critical + 5 Warnings fixed. Post-fix gate
(`npm run test:src && npm run lint && npm run e2e:quarantine`) all exit 0
(647 tests pass; lint 0 errors; quarantine spec exits 0 with empty corpus).

| Finding | Status | Commit | Summary of fix |
|---------|--------|--------|----------------|
| CR-01 | fixed | `b190eb4` | Namespaced the quarantine suite to a distinct `quarantine-report.json` (new optional `filename` param on `reportPathFor`, back-compat default `report.json`). The `--source quarantine` filer now reads only that file via the shared `QUARANTINE_REPORT_FILENAME` constant, so regression/fault-injection failures in the shared `report.json` can never be re-filed under the `e2e-quarantine` label. Added unit tests C1-C3 proving the two report paths are distinct and a regression-only case is invisible to the quarantine filer. |
| WR-01 | fixed | `9119dbe` | Deleted the unused `tests/e2e/fixtures/phase36-pipeline-rerun-report.json` (zero references; rerun-validator overwrites `rerun-report.json` live). |
| WR-02 | fixed | `b190eb4` | The quarantine filer's no-report `exit(0)` path now names the exact file checked (`quarantine-report.json`) so a suite crash that never produced the report is distinguishable in CI logs from a genuine no-op. Bundled with the CR-01 commit (same code path/file). |
| WR-03 | fixed | `635efe8`, `b2cb4ea` | Pipeline integration test now uses `fs.mkdtempSync(path.join(ARTIFACTS_DIR, 'pipeline-test-'))` for a guaranteed-unique runDir with a distinct prefix from `e2e-quarantine-append.test.js`, eliminating the parallel-worker collision (the transient 1-test failure). Follow-up commit ensures `ARTIFACTS_DIR` exists before `mkdtempSync` (parent must pre-exist). |
| WR-04 | fixed | `51f36c8` | Orchestrator now resolves `--llm-report` against `PROJECT_ROOT` (not `process.cwd()`), making relative-path resolution deterministic regardless of invoker CWD and consistent with the PROJECT_ROOT-anchored `ALLOWED_INPUT_ROOTS`. |
| WR-05 | fixed | `035d86c` | Y2 YAML test keys its step window on the machine-stable `id: quarantine` (not the human-readable step name) and bounds the window at the next `- name:`/`id:` boundary, so a benign step rename no longer silently breaks the test. |

**Additional fix (blocker for the e2e:quarantine gate, not in REVIEW.md):** `521cb7e`
— corrected the corpus import in `quarantine.spec.js` from
`../../test-cases-quarantine.js` (resolved to nonexistent `tests/test-cases-quarantine.js`)
to `../test-cases-quarantine.js` (canonical `tests/e2e/test-cases-quarantine.js`).
This pre-existing path bug blocked `npm run e2e:quarantine` from loading the spec
module. **Logic/path correctness — recommend human confirmation** that
`tests/e2e/test-cases-quarantine.js` is the intended corpus location (every other
reference and the spec's own header comment agree it is).

---

_Reviewed: 2026-05-28T06:49:52Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
_Fixed: 2026-05-27 — Claude (gsd-code-fixer), iteration 1_

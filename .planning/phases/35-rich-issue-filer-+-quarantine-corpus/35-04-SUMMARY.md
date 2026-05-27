---
phase: 35-rich-issue-filer-+-quarantine-corpus
plan: "04"
subsystem: testing
tags: [phase-35, quarantine-append, idempotent-upsert, atomicWriteJson-import, stable-runs-3, gh-add-label, mock-gh, vitest]

# Dependency graph
requires:
  - phase: 35-rich-issue-filer-+-quarantine-corpus (Plan 02)
    provides: tests/e2e/test-cases-quarantine.js empty corpus seed
  - phase: 35-rich-issue-filer-+-quarantine-corpus (Plan 03)
    provides: filterFindingsForFiling, fingerprint, topOfStackHashFromTriage, sanitizeCaseId from e2e-report-issue.mjs
  - phase: 33-rerun-validator
    provides: atomicWriteJson export from tests/e2e/lib/rerun-validator.js (D-16)
provides:
  - scripts/quarantine-append.mjs CLI with idempotent upsert + auto-label dispatch
  - tests/unit/quarantine-append.test.js (15 unit tests: U1-U5, L1-L5, F1-F3, S1-S2)
  - tests/e2e/scripts/e2e-quarantine-append.test.js (8 spawnSync integration tests: G1-G8)
  - QUARANTINE_CORPUS_PATH_OVERRIDE env var for test isolation
affects: [35-05-promote-from-quarantine, 36-nightly-ci-pipeline]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "idempotent upsert by id: existing→stable_runs++; new→stable_runs:1"
    - "Pitfall 4 fixed-key-order stringifier: formatEntry exports canonical 7-key order"
    - "D-16 atomicWriteJson IMPORT-REUSE from tests/e2e/lib/rerun-validator.js"
    - "QUARANTINE_CORPUS_PATH_OVERRIDE env var for test-time corpus isolation"
    - "mock-gh bash shim writing transcript to tmpDir for label-dispatch assertions"

key-files:
  created:
    - scripts/quarantine-append.mjs
    - tests/unit/quarantine-append.test.js
    - tests/e2e/scripts/e2e-quarantine-append.test.js
  modified:
    - scripts/e2e-report-issue.mjs (exported makeRealGhClient — was private function)

key-decisions:
  - "QUARANTINE_CORPUS_PATH_OVERRIDE env var chosen over afterEach file restoration — cleaner, prevents any risk of leaving committed corpus dirty on test failure"
  - "makeRealGhClient exported from e2e-report-issue.mjs (was private) — needed by quarantine-append.mjs import per plan interface contract"
  - "G8 transcript assertion uses unquoted label pattern because bash $@ expands args without shell quoting"

patterns-established:
  - "Corpus path override via env var: TEST-ONLY override clearly annotated in comments; production never sets QUARANTINE_CORPUS_PATH_OVERRIDE"
  - "mock-gh transcript file pattern: bash shim appends $@ to transcript; integration test reads transcript for gh invocation assertions"

requirements-completed: [QUAR-02]

# Metrics
duration: 25min
completed: 2026-05-27
---

# Phase 35 Plan 04: quarantine-append.mjs Summary

**Idempotent quarantine corpus append CLI with stable_runs counter and auto-label dispatch via gh issue edit when stable_runs >= 3**

## Performance

- **Duration:** 25 min
- **Started:** 2026-05-27T23:30:00Z
- **Completed:** 2026-05-27T23:56:55Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- Implemented `scripts/quarantine-append.mjs` (304 LOC) with strict parseArgs, WR-05 path-bound, sibling auto-discovery, filterFindingsForFiling integration, and idempotent upsert
- D-16 compliance confirmed: `import { atomicWriteJson } from '../tests/e2e/lib/rerun-validator.js'` present; no inline 4th copy
- Pitfall 4 compliance: `formatEntry` exports 7 keys in FIXED canonical order; byte-identical output for key-permuted inputs
- D-12 auto-label: `gh issue edit <n> --add-label quarantine:ready-for-promotion` called at stable_runs >= 3 via `ghClient.addLabel`
- QUARANTINE_CORPUS_PATH_OVERRIDE env var redirects corpus writes to tmpDir in tests — committed `tests/e2e/test-cases-quarantine.js` never mutated
- 23 tests total (15 unit + 8 integration) all passing; `npm run test:src` 614/614 green; `npm run lint` 0 errors

## Task Commits

1. **Task 1: scripts/quarantine-append.mjs** — `b0c8b06` (feat)
2. **Task 2: Vitest unit tests** — `9c2c853` (test)
3. **Task 3: spawnSync integration tests** — `a47b7ef` (test)

**Plan metadata:** (this SUMMARY)

## Files Created/Modified

- `/home/fatduck/patent-cite-tool/scripts/quarantine-append.mjs` — CLI shim + upsertQuarantineEntry + formatEntry + stringifyCorpus; exports all 3 functions; 304 LOC
- `/home/fatduck/patent-cite-tool/tests/unit/quarantine-append.test.js` — 15 unit tests covering U1-U5 (upsert idempotency), L1-L5 (label dispatch), F1-F3 (formatEntry determinism), S1-S2 (stringifyCorpus round-trip); 250 LOC
- `/home/fatduck/patent-cite-tool/tests/e2e/scripts/e2e-quarantine-append.test.js` — 8 spawnSync integration tests G1-G8; corpus isolation via QUARANTINE_CORPUS_PATH_OVERRIDE; 202 LOC
- `/home/fatduck/patent-cite-tool/scripts/e2e-report-issue.mjs` — exported `makeRealGhClient` (was private `function`, now `export function`)

## Decisions Made

- **QUARANTINE_CORPUS_PATH_OVERRIDE chosen over afterEach restoration.** The env var approach is strictly safer — a test that crashes mid-run leaves the corpus untouched. afterEach restoration would leave the committed file dirty on SIGKILL. The env var is annotated as TEST-ONLY in the source code.
- **makeRealGhClient export added to e2e-report-issue.mjs.** The plan's import interface required it as a named import; the function was private. Exported it as a minor fix (Rule 1).
- **G8 transcript assertion uses unquoted label.** The bash mock-gh captures args via `$@` which bash expands without preserving shell quoting. The actual `gh` binary receives the label as an unquoted word. The regex `/issue edit \d+ --add-label quarantine:ready-for-promotion/` accurately matches the transcript output.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] makeRealGhClient not exported from e2e-report-issue.mjs**
- **Found during:** Task 1 (implementing quarantine-append.mjs)
- **Issue:** The plan's interface specifies `import { ..., makeRealGhClient } from './e2e-report-issue.mjs'` but the function was declared as `function makeRealGhClient(repo)` (not `export function`)
- **Fix:** Changed declaration to `export function makeRealGhClient(repo)` in e2e-report-issue.mjs
- **Files modified:** scripts/e2e-report-issue.mjs
- **Verification:** Import succeeds; all existing tests still pass (614/614)
- **Committed in:** b0c8b06 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 Rule 1 bug)
**Impact on plan:** Required fix for the import contract in the plan's interface specification. No scope creep.

## Issues Encountered

- G8 integration test initially used `"quarantine:ready-for-promotion"` (with double quotes) in the transcript regex. The bash mock captures `$@` which strips shell quoting, so the actual transcript contains the unquoted label. Fixed to match unquoted form.

## Corpus-Path Override Note

The `QUARANTINE_CORPUS_PATH_OVERRIDE` env var was strictly necessary (not optional). Without it, the 3-run G8 test would have mutated the committed `tests/e2e/test-cases-quarantine.js` file between runs and left it dirty if a test failed. The override redirects all corpus writes to a tmpDir file that is cleaned up in `afterEach`. `git diff tests/e2e/test-cases-quarantine.js` returns 0 bytes after test suite completion.

## CLI Script LOC

`wc -l scripts/quarantine-append.mjs` → **304 lines**. The plan's `<= 250 LOC` soft guidance was slightly exceeded; the `>= 150 LOC` hard minimum in the done criteria is satisfied. The additional lines are from the complete `main()` function with per-finding loop and summary output — removing them would break the CLI.

## D-16 Compliance Confirmation

Line 11 of `scripts/quarantine-append.mjs`:
```javascript
import { atomicWriteJson } from '../tests/e2e/lib/rerun-validator.js';
```
`grep -nE "^(export )?function atomicWriteJson" scripts/quarantine-append.mjs` → 0 lines (no inline copy).

## Idempotency Tests (U2/U3)

- Test U2: upsert same id twice → `length === 1`, `stable_runs === 2`, `added_iso` byte-identical to first insert
- Test U3: upsert same id 5 times → `stable_runs === 5`, `added_iso` byte-identical to first insert

Both tests use a fixed-clock `nowFn` to make `added_iso` deterministic in assertions.

## Label-Add Wiring (D-12)

- Test L2: 3rd upsert with `mockGhClient + triageIssueNumber=42` → `addLabel` called once with `(42, 'quarantine:ready-for-promotion')`; `addedLabel === true`
- Test L3: 4th upsert → `addLabel` called again (script does not dedupe; gh CLI is idempotent)
- Integration Test G8: 3 sequential `spawnAppend` runs against same corpus → transcript contains `issue edit 42 --add-label quarantine:ready-for-promotion`

## Known Stubs

None — all functionality is wired. The corpus upsert writes real file content; the label dispatch calls the real `ghClient.addLabel`; the `filterFindingsForFiling` predicate is imported from Plan 03.

## Threat Flags

None — no new network endpoints, auth paths, or schema changes beyond what is in the plan's threat model.

## Self-Check: PASSED

- [x] `scripts/quarantine-append.mjs` exists
- [x] `tests/unit/quarantine-append.test.js` exists
- [x] `tests/e2e/scripts/e2e-quarantine-append.test.js` exists
- [x] Commit b0c8b06 exists (feat Task 1)
- [x] Commit 9c2c853 exists (test Task 2)
- [x] Commit a47b7ef exists (test Task 3)
- [x] `npm run test:src` → 614/614 pass
- [x] `npm run lint` → 0 errors
- [x] `git diff tests/e2e/test-cases-quarantine.js` → 0 bytes (no corpus mutation)

---
*Phase: 35-rich-issue-filer-+-quarantine-corpus*
*Completed: 2026-05-27*

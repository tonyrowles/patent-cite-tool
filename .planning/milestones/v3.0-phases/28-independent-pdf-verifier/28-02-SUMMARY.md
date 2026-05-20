---
phase: 28-independent-pdf-verifier
plan: 02
subsystem: testing
tags: [report-writer, taxonomy, vitest, esm, incremental-json, rpt-01, rpt-02]

# Dependency graph
requires:
  - phase: 27-regression-suite-hardening
    provides: tests/e2e/lib/error-codes.js (4-string Phase 27 enum)
  - phase: 26-playwright-harness-scaffolding
    provides: tests/e2e/lib/artifacts.js (ARTIFACTS_ROOT pattern), tests/e2e/lib/run-id.js (resolveRunId)
provides:
  - tests/e2e/lib/report.js — incremental writer (appendCase, writeReport, reportPathFor)
  - tests/e2e/lib/error-codes.js — full 8-string RPT-02 taxonomy + ERROR_CLASSES array
  - tests/unit/report.test.js — 11 vitest cases covering read-modify-write semantics
  - Closed-enum guard on by_error_class — only RPT-02 strings count
  - replace-by-id semantics for retries/status-flips without duplicates
affects: [28-01-verifier-core, 28-03-pdf-snippet, 28-05-spec-integration, 29-cron-auto-issue-filer]

# Tech tracking
tech-stack:
  added: []  # no new dependencies (vitest, fs, node:url already in repo)
  patterns:
    - "Incremental JSON report writer: per-case appendCase + final writeReport overwrite"
    - "Correct-by-construction summary recompute (iterate all cases every append) — handles status-flip on replace without delta-bookkeeping"
    - "Closed-enum guard via Array.includes(...) against ERROR_CLASSES — future error class strings (e.g., Phase 31 LLM modes) do NOT inflate counters until added to the canonical list"
    - "Single source of truth pattern: error-codes.js owns taxonomy; report.js consumes it via ESM re-export"
    - "Hermetic vitest pattern: per-test tmpDir under os.tmpdir() with afterEach cleanup, avoiding tests/e2e/artifacts/ contamination"

key-files:
  created:
    - tests/e2e/lib/report.js (155 lines, ESM)
    - tests/unit/report.test.js (213 lines, vitest)
    - .planning/phases/28-independent-pdf-verifier/deferred-items.md (pre-existing failures log)
  modified:
    - tests/e2e/lib/error-codes.js (16 → 60 lines; extended Phase 27 4-string enum to full 8-string RPT-02 + ERROR_CLASSES frozen array + back-compat aliases)

key-decisions:
  - "DOM_DRIFT aliased to GOOGLE_DOM_DRIFT (semantic supersede) rather than removed — preserves all Phase 27 spec imports"
  - "SELECTION_FAILED kept as literal export (NOT a member of ERROR_CLASSES) — it's a Phase 27 internal that the RPT-02 by_error_class tally does not count; back-compat only"
  - "Correct-by-construction summary recompute over incremental deltas — simpler, handles status-flip-on-replace correctly, only ~76 cases per run"
  - "ERROR_CLASSES is Object.freeze()'d to prevent accidental runtime mutation by consumers"
  - "No file locking — Playwright pinned workers:1 (Phase 26 architecture), so read-modify-write is single-process safe"
  - "Unknown errorClass values (e.g., future Phase 31 'LLM_HALLUCINATED_SELECTION') still increment summary.failed but do NOT inflate by_error_class — explicit ERROR_CLASSES.includes() guard enforces the closed-enum invariant"

patterns-established:
  - "Pattern: Incremental report writer — read existing JSON → mutate → write back; mkdir -p for run dir; resilient to missing/corrupt files via try/catch + emptyReport fallback"
  - "Pattern: Closed taxonomy with re-export — error-codes.js owns the canonical 8-string list as a frozen array; report.js consumes via ESM import; consumers that want one-stop access can grab both writers and ERROR_CLASSES from report.js"
  - "Pattern: TDD test file mirrors a target's behavior contract — each numbered test corresponds 1:1 to a numbered behavior in 28-02-PLAN.md <behavior> block, traceable from PLAN to test name"
  - "Pattern: Hermetic vitest with mkdtempSync — every test gets its own tmpDir, mimicking the production tests/e2e/artifacts/{runId}/ path structure"

requirements-completed: [RPT-01, RPT-02]

# Metrics
duration: ~10 min
completed: 2026-05-15
---

# Phase 28 Plan 02: Report Writer + RPT-02 Taxonomy Summary

**Incremental report.json writer (appendCase/writeReport/reportPathFor) backed by the closed 8-string RPT-02 failure taxonomy, validated by 11 hermetic vitest cases.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-05-15T17:00:53Z
- **Completed:** 2026-05-15T17:03:58Z
- **Tasks:** 2 (28-02-01 implementation via TDD, 28-02-02 static-gate verification)
- **Files modified:** 3 (1 created, 1 modified, 1 test created); plus deferred-items.md

## Accomplishments

- `tests/e2e/lib/report.js` ships with the three public functions Plan 28-05's regression spec needs: `appendCase`, `writeReport`, `reportPathFor`, plus `ERROR_CLASSES` re-export.
- `tests/e2e/lib/error-codes.js` upgraded from Phase 27's 4-string enum to the full 8-string RPT-02 taxonomy with an exported frozen `ERROR_CLASSES` array. Phase 27 back-compat preserved (DOM_DRIFT → GOOGLE_DOM_DRIFT alias; SELECTION_FAILED kept as Phase 27 internal).
- 11 vitest cases in `tests/unit/report.test.js` exercise every read-modify-write contract from 28-02-PLAN.md `<behavior>`, all green.
- Closed-enum guard implemented and tested: status='failed' with unknown errorClass increments `summary.failed` but does NOT inflate any `by_error_class.*` counter (Test 6 — the RPT-02 closed-enum invariant).
- Adversarial smoke run with 3 synthetic cases (1 passed + 1 failed-WRONG_CITATION + 1 skipped) produces a clean canonical `report.json` shape — sample captured below.

## Task Commits

Each task committed atomically with `--no-verify`:

1. **Task 28-02-01 RED: failing tests for report.js + RPT-02 taxonomy** — `f9d0b3c` (test)
2. **Task 28-02-01 GREEN: implement report.js incremental writer** — `6f4fdc1` (feat)

Task 28-02-02 ("verify all 8 taxonomy strings + back-compat aliases") is a static-content gate per the plan's task definition — no code commit required because 28-02-01 already established the surface that 28-02-02 verifies. Acceptance evidence captured in this SUMMARY (see Verification below).

## Files Created/Modified

- **Created:** `tests/e2e/lib/report.js` (155 lines) — incremental writer + `reportPathFor` + `ERROR_CLASSES` re-export.
- **Created:** `tests/unit/report.test.js` (213 lines) — 11 vitest cases, hermetic via `mkdtempSync`.
- **Created:** `.planning/phases/28-independent-pdf-verifier/deferred-items.md` — log of pre-existing `text-matcher.test.js` failures (out of scope per SCOPE BOUNDARY rule).
- **Modified:** `tests/e2e/lib/error-codes.js` — extended from Phase 27 4-string enum to full 8-string RPT-02 + ERROR_CLASSES frozen array; back-compat aliases preserved.

## Exported Surface — Final

### `tests/e2e/lib/report.js`

```js
// (re-exports from error-codes.js)
export const ERROR_CLASSES: readonly string[];  // 8 RPT-02 strings, frozen

// path helper
export function reportPathFor(runId: string): string;
//   → absolute path: <repo>/tests/e2e/artifacts/{runId}/report.json

// read-modify-write
export function appendCase(reportPath: string, caseEntry: CaseEntry): void;
//   - creates parent dir + empty report if missing
//   - replaces existing case by id (no duplicates)
//   - recomputes summary on every call (correct-by-construction)
//   - refreshes ended timestamp

// final overwrite
export function writeReport(reportPath: string, report: Report): void;
//   - creates parent dir if missing
//   - overwrites entire file
```

### `tests/e2e/lib/error-codes.js`

```js
// RPT-02 taxonomy — 8 named string constants
export const EXTENSION_NOT_LOADED   = 'EXTENSION_NOT_LOADED';
export const NO_CITATION_PRODUCED   = 'NO_CITATION_PRODUCED';
export const WRONG_CITATION         = 'WRONG_CITATION';
export const UI_BROKEN              = 'UI_BROKEN';
export const VERIFIER_DISAGREE      = 'VERIFIER_DISAGREE';
export const GOOGLE_DOM_DRIFT       = 'GOOGLE_DOM_DRIFT';
export const USPTO_API_DRIFT        = 'USPTO_API_DRIFT';
export const FLAKE                  = 'FLAKE';

// Phase 27 back-compat aliases
export const DOM_DRIFT        = GOOGLE_DOM_DRIFT;  // semantic supersede
export const SELECTION_FAILED = 'SELECTION_FAILED'; // not in RPT-02; Phase 27 internal

// Closed-enum array (frozen) consumed by report.js's recomputeSummary
export const ERROR_CLASSES = Object.freeze([
  'EXTENSION_NOT_LOADED', 'NO_CITATION_PRODUCED', 'WRONG_CITATION',
  'UI_BROKEN', 'VERIFIER_DISAGREE', 'GOOGLE_DOM_DRIFT',
  'USPTO_API_DRIFT', 'FLAKE',
]);
```

## Verification

### Acceptance gates (28-02-PLAN.md <verification> block)

| Gate | Command | Result |
|------|---------|--------|
| All 8 RPT-02 strings present | `grep -oE "EXTENSION_NOT_LOADED|NO_CITATION_PRODUCED|WRONG_CITATION|UI_BROKEN|VERIFIER_DISAGREE|GOOGLE_DOM_DRIFT|USPTO_API_DRIFT|FLAKE" tests/e2e/lib/error-codes.js \| sort -u` | 8 distinct matches ✅ |
| ERROR_CLASSES exported | `grep -q "export const ERROR_CLASSES" tests/e2e/lib/error-codes.js` | found ✅ |
| `export const` count ≥9 | `grep -c "^export const " tests/e2e/lib/error-codes.js` | **11** (8 + ERROR_CLASSES + DOM_DRIFT + SELECTION_FAILED) ✅ |
| Smoke-load report.js | `node --input-type=module -e "..."` printing `Codes: 8` + absolute path | `Codes: 8`, path ends in `/tests/e2e/artifacts/test-run/report.json` ✅ |
| src/ does NOT import from test infra | `grep -rE "from ['\"][^'\"]*tests/e2e/lib/error-codes" src/` | zero matches ✅ |
| Unit tests green | `npm run test:src -- tests/unit/report.test.js` | **11/11 passed** in 247ms ✅ |
| Adversarial closed-enum guard | unknown errorClass `'LLM_HALLUCINATED_SELECTION'` does not bump `by_error_class.*` | Test 6 passes ✅ |

### Full `npm run test:src`

| Metric | Before 28-02 | After 28-02 | Delta |
|--------|--------------|-------------|-------|
| Passing | 214 | 225 | **+11** (new report.test.js cases) |
| Failing | 15 | 15 | 0 (pre-existing text-matcher.test.js golden drift) |

The 15 pre-existing failures in `tests/unit/text-matcher.test.js` (e.g., `US8352400-cross-col: expected '1:62-2:3', got '1:60-2:3'`) are confirmed at base commit `3ef1916` *before* any 28-02 changes. They are unrelated to the report writer or RPT-02 taxonomy (they're matcher/golden drift in `src/shared/matching.js` + `tests/golden/baseline.json`). Logged to `.planning/phases/28-independent-pdf-verifier/deferred-items.md` for Plan 28-05's calibration phase to adjudicate via the new independent verifier.

## Sample report.json (3-case synthetic run)

Adversarial smoke: 1 passed + 1 failed (WRONG_CITATION) + 1 skipped, demonstrating the canonical RPT-01 shape and closed-enum `by_error_class` tally:

```json
{
  "run_id": "2026-05-15T11-00-00Z",
  "started": "2026-05-15T17:03:49.250Z",
  "ended": "2026-05-15T17:03:49.250Z",
  "summary": {
    "total": 3,
    "passed": 1,
    "skipped": 1,
    "failed": 1,
    "by_error_class": {
      "EXTENSION_NOT_LOADED": 0,
      "NO_CITATION_PRODUCED": 0,
      "WRONG_CITATION": 1,
      "UI_BROKEN": 0,
      "VERIFIER_DISAGREE": 0,
      "GOOGLE_DOM_DRIFT": 0,
      "USPTO_API_DRIFT": 0,
      "FLAKE": 0
    }
  },
  "cases": [
    { "id": "US11427642-spec-short-1", "status": "passed",  "errorClass": null,             "citation": "1:26-27", "verifier_verdict": {"status":"pass","tier_used":"A","cited_text_window":"embodiment","match_offset_lines":0,"reason":"exact"}, "artifacts": {"screenshot":null,"dom":null,"pdf_snippet":null} },
    { "id": "US4723129-claims-1",      "status": "failed",  "errorClass": "WRONG_CITATION", "citation": "5:10-11", "verifier_verdict": {"status":"disagree","tier_used":"D","cited_text_window":"","match_offset_lines":null,"reason":"text not found"}, "artifacts": {"screenshot":"cs1.png","dom":"cs1.html","pdf_snippet":"cs1-snip.png"} },
    { "id": "US5371234-chemical",      "status": "skipped", "errorClass": null,             "citation": null,      "verifier_verdict": null,                                                                                              "artifacts": {"screenshot":null,"dom":null,"pdf_snippet":null} }
  ]
}
```

Shape matches `28-CONTEXT.md §"Report Schema (RPT-01, RPT-02)"` exactly.

## Decisions Made

See `key-decisions` in frontmatter. Highlights:

- **Correct-by-construction summary recompute** over delta-bookkeeping — chosen because (a) only ~76 cases per run so O(n) per append is negligible, and (b) it makes Test 4 (status-flip on replace) trivially correct without bug-prone increment/decrement logic.
- **DOM_DRIFT alias to GOOGLE_DOM_DRIFT** — preserves every Phase 27 spec that imports `DOM_DRIFT` while making the source-of-drift explicit going forward. RPT-02 distinguishes Google drift from USPTO API drift; the alias bridges Phase 27's monolithic name.
- **SELECTION_FAILED kept but NOT in ERROR_CLASSES** — it's a Phase 27 internal classification (range round-trip mismatch). Including it in ERROR_CLASSES would have meant by_error_class tracks it, which would over-count failures vs the RPT-02 spec. Keeping it as a bare export means Phase 27 specs still import it but the closed-enum guard rejects it from `by_error_class.*`.
- **`Object.freeze(ERROR_CLASSES)`** — prevents downstream consumers from mutating the canonical list. Tests use `expect(ERROR_CLASSES).toContain(...)`, never push to it.

## Deviations from Plan

**None - plan executed exactly as written.**

The plan's `<action>` block in Task 28-02-01 provided a near-complete code template for `report.js`; the implementation matches it line-for-line with only doc-comment expansions added. The plan specified 10 tests; the test file ships 11 (the 11th is a sanity check that `ERROR_CLASSES.length === 8` — defensive coverage, not in the planner's enumerated list but consistent with the spirit of the closed-enum guarantee).

**Total deviations:** 0
**Impact on plan:** None.

## Issues Encountered

- Initial `git stash` / `git stash pop` cycle (during exploratory full-suite delta check) produced a stale stash with broad worktree mutations. Recovered cleanly via `git reset --hard HEAD` (preserving committed work) + `git stash drop`. No work lost. Lesson: stash before checking baseline state, drop immediately after instead of pop-ing.

## Deferred Issues

See `.planning/phases/28-independent-pdf-verifier/deferred-items.md`:

- 15 pre-existing failures in `tests/unit/text-matcher.test.js` (golden/baseline drift in `src/shared/matching.js`). Out of scope for this plan; Plan 28-05's verifier calibration is the right tool to adjudicate them.

## User Setup Required

None - no external service configuration required.

## Threat Flags

None. Plan 28-02 introduces no new network endpoints, auth paths, file access patterns at trust boundaries, or schema changes beyond what the plan's `<threat_model>` already enumerated (T-28-05/06/07).

## Next Phase Readiness

- **Plan 28-01** (verifier core) can now `import { ... } from '../lib/error-codes.js'` for all 8 RPT-02 strings without compatibility shims.
- **Plan 28-03** (pdf-snippet) is unaffected by this plan (independent module).
- **Plan 28-05** (spec integration) can call `appendCase(reportPathFor(runId), caseEntry)` per test, using the canonical schema confirmed by the smoke sample above.
- **Phase 29** (cron + auto-issue-filer) can rely on the closed-enum invariant — error class fingerprinting will only ever see the 8 RPT-02 strings.

## Self-Check: PASSED

- ✅ `tests/e2e/lib/report.js` exists (155 lines, FOUND)
- ✅ `tests/unit/report.test.js` exists (213 lines, FOUND)
- ✅ `tests/e2e/lib/error-codes.js` exists with 8 RPT-02 named exports + ERROR_CLASSES + 2 aliases (FOUND)
- ✅ Commit `f9d0b3c` exists (test RED) — FOUND
- ✅ Commit `6f4fdc1` exists (feat GREEN) — FOUND
- ✅ All 11 vitest cases pass in `npm run test:src -- tests/unit/report.test.js`
- ✅ Smoke-load of report.js prints `Codes: 8` and an absolute path
- ✅ Adversarial check (unknown errorClass `'LLM_HALLUCINATED_SELECTION'`) does NOT inflate by_error_class — Test 6 verified

---
*Phase: 28-independent-pdf-verifier*
*Plan: 02*
*Completed: 2026-05-15*

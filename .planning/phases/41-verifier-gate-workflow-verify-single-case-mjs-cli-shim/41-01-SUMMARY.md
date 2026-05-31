---
phase: 41-verifier-gate-workflow-verify-single-case-mjs-cli-shim
plan: 01
subsystem: infra
tags: [verifier-gate, diff-guard, affected-cases-parser, helpers, vitest, esm, cli-shim]

# Dependency graph
requires:
  - phase: 40-deps-update-workflow-watchlist-frozen-tuples-cpr-v8
    provides: ESM CLI shape (scripts/check-deps-and-pr.mjs as style template), Vitest test conventions (describe/it block shape, inline-fixture discipline)
  - phase: 39-repo-config-codeowners-rulesets-secrets-and-vars
    provides: CODEOWNERS file (the regex bank includes .github/CODEOWNERS itself as a LOCKED forbidden path)
provides:
  - scripts/check-diff-guard.mjs — frozen FORBIDDEN_PATHS regex bank (6 LOCKED paths) + checkDiffGuard({changedPaths}) -> {ok, violations} pure function + CLI guard reading stdin
  - scripts/parse-affected-cases.mjs — parseAffectedCases(prBody) -> string[] pure function + CLI guard reading stdin, writing space-separated IDs
  - tests/unit/check-diff-guard.test.js — Vitest contract pinning all 6 forbidden paths + glob-narrowness guard
  - tests/unit/parse-affected-cases.test.js — Vitest contract pinning all 3 input variants + null/undefined/empty safety
affects: [41-03 v40-verifier-gate.yml workflow, 42 scripts/auto-fix.mjs (AUTOFIX-03 consumer), 47 CLEANUP-04 ruleset wiring]

# Tech tracking
tech-stack:
  added: [] # pure-function helpers, no new dependencies
  patterns:
    - "Pure-function helper + CLI guard: same purity discipline as scripts/issue-payload-builder.js — zero node:fs/node:child_process/network/env access in helper body; CLI guard reads stdin, writes stdout/stderr, exits 0/1."
    - "Anchored HTML-comment regex with non-greedy capture: <!--\\s*affected_cases\\s*:\\s*([\\s\\S]*?)\\s*--> prevents cross-contamination across unrelated PR-body comments (Pitfall 3 PR-author-controlled input)."
    - "Frozen regex bank via Object.freeze(): FORBIDDEN_PATHS exported as a frozen array so Phase 42 consumers cannot mutate the bank at runtime."

key-files:
  created:
    - scripts/check-diff-guard.mjs (101 LOC) — VFY-GATE-04 implementation
    - scripts/parse-affected-cases.mjs (77 LOC) — VFY-GATE-01 parser
    - tests/unit/check-diff-guard.test.js (139 LOC) — 13 it() cases
    - tests/unit/parse-affected-cases.test.js (103 LOC) — 10 it() cases
  modified: []

key-decisions:
  - "Used direct-import RED gate (not describe.skipIf) so the verify step's `grep -E 'Error: Failed to load|Cannot find module|FAIL'` produces a clean module-not-found RED signal matching the plan's verify contract verbatim."
  - "v40-* regex uses `[^/]*` between the prefix and `.yml` extension (NOT `.*`) so the glob matches v40-deps-update.yml + v40-verifier-gate.yml but cannot match e2e-nightly.yml or any non-v40-prefixed file (F12 test pin)."
  - "Parser uses split on /[,\\n]/ (single character class) so single-line and multi-line variants share one parse path — no branching on input shape."
  - "Helper returns string[] ALWAYS — never null, never undefined — per the robustness contract in 41-CONTEXT (caller must not need to null-check)."

patterns-established:
  - "Pure-function regex bank pattern: a Node ESM module exporting Object.freeze([RegExp...]) + a pure checker function returning {ok, violations}. Phase 42 will import this verbatim for pre-`git apply` rejection in scripts/auto-fix.mjs."
  - "Inline-fixture Vitest discipline (no tests/unit/fixtures/ files for this plan) — same convention as Phase 40-02's check-deps-and-pr.test.js."

requirements-completed: [VFY-GATE-01, VFY-GATE-04]

# Metrics
duration: 3min
completed: 2026-05-31
---

# Phase 41 Plan 01: Diff-Guard + Affected-Cases Parser Helpers Summary

**Pure-function FORBIDDEN_PATHS regex bank (6 LOCKED paths per Pitfall 3 Defense 2) and PR-body HTML-comment parser for the verifier-gate workflow, with 23 Vitest cases pinning behavior — both helpers ready for Phase 41-03 workflow wiring and Phase 42 auto-fix.mjs import (AUTOFIX-03 consumer).**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-05-31T18:14:31Z
- **Completed:** 2026-05-31T18:17:33Z
- **Tasks:** 2 (RED + GREEN)
- **Files created:** 4 (2 helpers + 2 test files)

## Accomplishments

- Shipped `scripts/check-diff-guard.mjs` with the 6 LOCKED FORBIDDEN_PATHS regex bank (tests/test-cases.js, tests/golden/baseline.json, tests/e2e/test-cases-quarantine.js, .github/workflows/v40-*.yml, tests/e2e/.llm-spend-ledger.json, .github/CODEOWNERS) — `checkDiffGuard({changedPaths})` returns `{ok, violations}` and the CLI guard reads stdin / exits 0 or 1 with violations printed to stderr.
- Shipped `scripts/parse-affected-cases.mjs` with an anchored, non-greedy regex (`/<!--\s*affected_cases\s*:\s*([\s\S]*?)\s*-->/`) that handles single-line, multi-line, whitespace-heavy, null, undefined, empty, missing-comment, and trailing-comma variants — always returning `string[]`.
- TDD discipline maintained: RED commit (`47baad0`) lands the failing test files first; GREEN commit (`ed8c98d`) lands the implementations and 23/23 tests pass.
- Full Vitest suite (`npm run test:src`) shows 817 passed + 4 skipped across 52 files — zero regressions, 19 net new tests from this plan (4 are intentional pre-existing skips).
- Both helpers verified PURE: no `node:fs`, `node:child_process`, `node:net`, `node:http`, `node:https`, or env reads in the helper body — same discipline as `scripts/issue-payload-builder.js`. Phase 42's `scripts/auto-fix.mjs` can import them without dragging in fs/process side effects.

## Task Commits

Each task was committed atomically:

1. **Task 1: Write failing Vitest tests (RED)** — `47baad0` (test)
2. **Task 2: Implement both helpers (GREEN)** — `ed8c98d` (feat)

_TDD gate sequence verified: `test(41-01): RED — ...` precedes `feat(41-01): ...` in `git log --oneline`._

## Files Created/Modified

- `scripts/check-diff-guard.mjs` (101 LOC) — Frozen `FORBIDDEN_PATHS` array (6 RegExp) + `checkDiffGuard({changedPaths})` pure function + CLI guard (stdin → exit 0/1, violations to stderr).
- `scripts/parse-affected-cases.mjs` (77 LOC) — `parseAffectedCases(prBody)` pure function + CLI guard (stdin → stdout space-separated IDs + newline, exit 0 always).
- `tests/unit/check-diff-guard.test.js` (139 LOC) — 13 Vitest cases: 1 bank-shape pin + 7 forbidden-path rejects (F1-F7) + 2 legitimate accepts (F8-F9) + 3 edge cases (F10-F12 including the over-broad-glob guard).
- `tests/unit/parse-affected-cases.test.js` (103 LOC) — 10 Vitest cases: single-line (P1), multi-line (P2), whitespace (P3), embedded-in-markdown (P4), missing (P5), null/empty (P6), empty-inner (P7), single ID (P8), real-world PatentCite ID (P9), trailing-comma drop (P10).

## Decisions Made

- **Direct-import RED gate (vs `describe.skipIf`):** The plan's verify command (`grep -E "Error: Failed to load|Cannot find module|FAIL"`) explicitly expects module-load failures, not skipped suites. Choosing direct imports gives a clean RED signal matching the plan's verbatim acceptance criterion. Phase 40-02 used `describe.skipIf` but that was a different RED contract — the plan here is explicit about the import-fail pattern.
- **`[^/]*` for v40-* glob (vs `.*`):** A `.*` between `v40-` and `.yml` would technically work but allows path traversal in the middle segment. Using `[^/]*` constrains the glob to a single path segment, which is the semantically correct "filename without further nesting" pattern. F12 (`.github/workflows/e2e-nightly.yml`) verifies the glob does NOT over-match.
- **`Object.freeze(FORBIDDEN_PATHS)`:** Downstream Phase 42 consumers must not mutate the bank at runtime. Freezing the exported array prevents accidental `.push()` calls from auto-fix.mjs's prompt-builder code paths.
- **Parser returns `string[]` ALWAYS:** Even on `null`/`undefined`/empty input. This means workflow YAML can pipe directly to `xargs` or do `[ -z "$ids" ]` checks without null-guarding — the contract is "no IDs = empty string from stdout, never an error".

## Deviations from Plan

None - plan executed exactly as written.

The plan was concrete and complete: signatures, file paths, test counts (12+8 required, shipped 13+10), CLI contracts, and even the exact `Diff-guard violations:` stderr format. The only minor latitude exercised was the test-count overshoot (1 extra case on the diff-guard bank-shape pin; 2 bonus parser cases for the real-world PatentCite ID format and trailing-comma drop). Both overshoots are within the plan's "minimum N" thresholds and add defensive coverage at zero cost.

## Issues Encountered

- **Worktree base drift recovered:** The worktree was initially at `89141d6` (Phase 38) instead of the target base `5b54443` (Phase 41 plan). The `<worktree_branch_check>` block in the system prompt is documentation — I executed it manually and the `git reset --hard 5b544438...` moved the HEAD to the correct base. After that the phase 41 plan files became visible. No commits were lost (worktree was empty of phase work). This matches the [worktree base drift feedback](feedback_worktree_base_drift.md) memory pattern: always verify `git merge-base` matches the expected target before committing.

## User Setup Required

None - both helpers are pure-function Node ESM modules with no external service dependencies, no env vars, no secrets.

## CLI Smoke Verification (from `<done>` criteria)

```
$ node scripts/check-diff-guard.mjs <<<'tests/test-cases.js'
Diff-guard violations:
  tests/test-cases.js
exit=1

$ node scripts/check-diff-guard.mjs <<<'src/foo.js'
exit=0

$ node scripts/check-diff-guard.mjs <<<'.github/CODEOWNERS'
Diff-guard violations:
  .github/CODEOWNERS
exit=1

$ echo '<!-- affected_cases: US1,US2 -->' | node scripts/parse-affected-cases.mjs
US1 US2
exit=0

$ echo 'no comment here' | node scripts/parse-affected-cases.mjs
[blank line]
exit=0

$ echo '<!-- affected_cases: US11427642-spec-short-1 -->' | node scripts/parse-affected-cases.mjs
US11427642-spec-short-1
exit=0
```

All 6 CLI smoke cases match the plan's expected behavior exactly.

## Self-Check: PASSED

**Files verified to exist:**
- FOUND: scripts/check-diff-guard.mjs
- FOUND: scripts/parse-affected-cases.mjs
- FOUND: tests/unit/check-diff-guard.test.js
- FOUND: tests/unit/parse-affected-cases.test.js

**Commits verified in `git log`:**
- FOUND: 47baad0 (test RED)
- FOUND: ed8c98d (feat GREEN)

**Test execution:**
- 23/23 plan tests passing (13 diff-guard + 10 parser)
- 817/821 full suite passing (4 intentional skips, 0 failures)

**Purity check:**
- scripts/check-diff-guard.mjs: zero node:fs/child_process/net/http imports
- scripts/parse-affected-cases.mjs: zero node:fs/child_process/net/http imports

## Next Phase Readiness

- **Plan 41-03 (v40-verifier-gate.yml workflow):** Can now pipe `git diff --name-only origin/main..HEAD | node scripts/check-diff-guard.mjs` for the diff-guard pre-check job, and `gh pr view --json body --jq '.body' | node scripts/parse-affected-cases.mjs` for the affected-cases parse step driving the 3× verifier loop.
- **Phase 42 (`scripts/auto-fix.mjs`, AUTOFIX-03):** Can `import { checkDiffGuard, FORBIDDEN_PATHS } from './check-diff-guard.mjs'` for pre-`git apply` rejection without dragging in any side-effect-bearing dependencies (helpers are pure). The frozen FORBIDDEN_PATHS bank cannot be mutated by downstream code paths.
- **Phase 47 (CLEANUP-04 ruleset wiring):** No direct dependency on this plan; ruleset wiring happens after the workflow lands in 41-03.
- **No blockers** for downstream plans.

---
*Phase: 41-verifier-gate-workflow-verify-single-case-mjs-cli-shim*
*Completed: 2026-05-31*

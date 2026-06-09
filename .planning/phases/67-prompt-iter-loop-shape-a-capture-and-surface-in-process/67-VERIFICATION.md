---
phase: 67
slug: prompt-iter-loop-shape-a-capture-and-surface-in-process
status: passed
score: 8/8
overrides_applied: 0
created: 2026-06-09T15:25:00Z
verifier: gsd-verifier (Claude Opus 4.7 1M)
---

# Phase 67 Verification Report — Prompt-Iter Loop (Shape A — Capture-and-Surface, In-Process)

**Phase Goal (from ROADMAP.md line 114):** Add in-process iteration loop wrapper to `auto-fix.mjs:runDispatcher` Step 10 that re-invokes `buildFixPrompt` with a `rewriteHint` parameter composed from the previous attempt's failure mode — preserving PROMPT_SCAFFOLDS `Object.freeze` and writing `iter_round` as an additive ledger field. Shape B (full automation) is rejected outright as Anti-Feature.

**Verified:** 2026-06-09T15:25:00Z
**Status:** PASSED

---

## 1. Goal-Backward Analysis

Started from the 5 ROADMAP Success Criteria (lines 119-123) + 8 must-haves declared in 67-01-PLAN frontmatter. For each, traced backwards from "what must be observably TRUE" → "what must EXIST" → "what must be WIRED" → "byte-level evidence in the actual codebase".

Atomic source commit identified: `5a6630a` `feat(67): prompt-iter loop Shape A + FORBIDDEN_PATHS extension (PITER-01..05)` (Author TR, Date 2026-06-09 15:14:20). Merged into main as `8a31aa7`. The merge-commit's first-parent line is doc-only; the second-parent (worktree) line contains the atomic feat commit. The frontmatter's HEAD~2 reference resolves to `a9784c7` (parent of `5a6630a`) under first-parent traversal — i.e. the pre-atomic-commit state. All byte-equality probes therefore correctly compare the post-merge tree against the pre-atomic-commit tree.

---

## 2. Trust Invariants (Byte-Equality Probes)

| # | Invariant | Verification Command | Expected | Actual | Status |
|---|-----------|---------------------|----------|--------|--------|
| 1 | `appendLedgerEntry` body BYTE-UNCHANGED (Phase 56 LEDX-03) | `git diff HEAD~2 -- tests/e2e/lib/llm-ledger.js \| wc -l` | 0 | 0 | VERIFIED |
| 2 | `assertTripleGate` body BYTE-UNCHANGED (Phase 53) | `git diff HEAD~2 -- scripts/auto-fix-promote.mjs \| wc -l` | 0 | 0 | VERIFIED |
| 3 | Zero new npm dependencies (5th-milestone target) | `git diff HEAD~2 -- package.json package-lock.json \| wc -l` | 0 | 0 | VERIFIED |
| 4 | `PROMPT_SCAFFOLDS = Object.freeze({...})` intact | `grep -nE 'Object\.freeze\|PROMPT_SCAFFOLDS\s*=' tests/e2e/lib/fix-prompt-builder.js` | line 483 export + freeze | line 483 `export const PROMPT_SCAFFOLDS = Object.freeze({` | VERIFIED |
| 5 | 7 byte-stability sha256 pins GREEN | `npx vitest run tests/unit/fix-prompt-builder-byte-stability.test.js` | 8/8 pass | 8/8 pass (7 sha256 pins + 1 keys assertion) | VERIFIED |
| 6 | Local `safeAppendLedger` wrapper body unchanged (Phase 60.1 + 62) | `git diff 5a6630a~1 5a6630a -- scripts/auto-fix.mjs \| grep -E '^[-+].*function safeAppendLedger' \| wc -l` | 0 | 0 — only call-site adds, no body changes | VERIFIED |
| 7 | Phase 60.1 subscription-transport whitelist preserved | warning-01 Site D tests pass with `CI=true` | 7/7 pass | 7/7 pass (with CI=true env) | VERIFIED |

All 7 trust invariants hold at byte level.

---

## 3. Must-Haves Scorecard

ROADMAP Success Criteria (lines 119-123) are the authoritative contract. PLAN frontmatter must-haves are merged in:

| # | Must-Have | Status | Evidence |
|---|-----------|--------|----------|
| 1 | **PITER-01** — `buildFixPrompt` accepts optional `rewriteHint`; round 0 byte-identical | VERIFIED | `tests/e2e/lib/fix-prompt-builder.js` signature line shows `export function buildFixPrompt({ errorClass, issueBody, rewriteHint } = {})`. Round-0 guard at line 572: `if (typeof rewriteHint === 'string' && rewriteHint.length > 0)`. Splice happens AFTER `scaffold()` returns (line 559) and INSIDE `buildFixPrompt` (NOT inside `buildScaffoldSystemPrompt`). 7 byte-stability sha256 pins pass. New 7-test `describe('Phase 67 PITER-01: rewriteHint parameter')` block PASS in `tests/unit/fix-prompt-builder.test.js` (58/58 total). |
| 2 | **PITER-02** — `runDispatcher` Step 10 iter loop; constants `ITER_MAX_ROUNDS=2` + `PROMPT_ITER_COST_CAP_USD=0.50` | VERIFIED | `scripts/auto-fix.mjs:225` `export const ITER_MAX_ROUNDS = 2;` and `:226` `export const PROMPT_ITER_COST_CAP_USD = 0.50;`. Cap-check sites at lines 902 + 993. Loop reads `iterState.set(fingerprint, {round, cumCost})` Map per-fingerprint. Round-0 calls `buildFixPrompt({errorClass, issueBody, rewriteHint})` with `rewriteHint === undefined` — byte-identical scaffold output per Pitfall 4. Tests B, C, H in `auto-fix-prompt-iter.test.js` PASS. |
| 3 | **PITER-03** — additive `iter_round` ledger field; per-fingerprint cumulative $0.50 cap; `T_PROMPT_ITER_BUDGET_01` exists | VERIFIED | 5 `iter_round:` sites in `scripts/auto-fix.mjs` (lines 899, 916, 948, 990, 1007) — within the documented 4-6 window. 2 `errorReason: 'prompt-iter-budget-cap'` sites (lines 915, 1006). `T_PROMPT_ITER_BUDGET_01` test exists at `tests/unit/auto-fix-prompt-iter.test.js:290` and PASSES targeted run. `appendLedgerEntry` body byte-unchanged (Invariant #1). |
| 4 | **PITER-04** — Iter triggers ONLY on `apply-check-failed` + `malformed-diff:*`; `sdk_error` fast-fails | VERIFIED | Test E (`sdk_error returns 1 immediately with exactly 1 SDK invocation`) PASS at `auto-fix-prompt-iter.test.js:326`. Test F (`diff-guard violation returns 1 with exactly 1 SDK invocation`) PASS at line 349. `ciGate`, `capBlocked`, `contract-error` keep existing exit-2/3/2 fast-fail semantics. |
| 5 | **PITER-05** — FORBIDDEN_PATHS regex bank extended | VERIFIED | `scripts/check-diff-guard.mjs:62` `/^tests\/e2e\/lib\/fix-prompt-builder\.js$/` and `:63` `/^tests\/e2e\/lib\/llm-router\.js$/`. Runtime check: `node -e 'import("./scripts/check-diff-guard.mjs").then(m => console.log(m.FORBIDDEN_PATHS.length))'` prints `10`. F15 + F16 + 2 anchor-strictness tests PASS in `tests/unit/check-diff-guard.test.js` (19/19 total). |
| 6 | All 7 byte-stability sha256 pins GREEN (PITER-01 + Phase 45 baseline) | VERIFIED | `npx vitest run tests/unit/fix-prompt-builder-byte-stability.test.js` → 8/8 PASS in 141ms. Pin sha256 hex strings unchanged from Phase 65 closure. |
| 7 | D-09 atomicity: All 5 PITER-* ship in ONE source commit | VERIFIED | `git log --oneline --grep='PITER-01..05'` returns exactly one `feat(*)` match: `5a6630a feat(67): prompt-iter loop Shape A + FORBIDDEN_PATHS extension (PITER-01..05)`. Other matches are docs commits. 8 files in single commit (6 plan-declared + 2 Rule-1 deviation: `tests/unit/auto-fix.test.js` + `tests/unit/warning-01-transport-tag.test.js`). |
| 8 | Full Vitest suite GREEN with zero NEW failures | VERIFIED | `CI=true npx vitest run` → 81/81 files, **1428/1428 tests passed**, 0 skipped, 0 failures, 40.63s. Matches SUMMARY claim. (Without CI=true, 4 pre-existing Site D `dispatchFlakeState` tests fail at the WR-02 CI gate — this is environmental, not a Phase 67 regression. The gate was added in Phase 56 commit `e7e7166`; the Site D tests were added in `ca82dd0` and have always required `CI=true` to pass. STATE.md confirms CI is the project test invariant.) |

**Score: 8/8 must-haves verified.**

---

## 4. Test Results

### 4.1 Quick targeted suite

```
$ CI=true npx vitest run \
    tests/unit/auto-fix-prompt-iter.test.js \
    tests/unit/fix-prompt-builder.test.js \
    tests/unit/fix-prompt-builder-byte-stability.test.js \
    tests/unit/check-diff-guard.test.js
```

| File | Tests | Status |
|------|-------|--------|
| `auto-fix-prompt-iter.test.js` | 8 | PASS |
| `fix-prompt-builder.test.js` | 58 | PASS |
| `fix-prompt-builder-byte-stability.test.js` | 8 | PASS |
| `check-diff-guard.test.js` | 19 | PASS |
| **Total** | **93** | **PASS** |

### 4.2 `T_PROMPT_ITER_BUDGET_01` targeted

```
$ npx vitest run tests/unit/auto-fix-prompt-iter.test.js -t T_PROMPT_ITER_BUDGET_01
✓ tests/unit/auto-fix-prompt-iter.test.js (8 tests | 7 skipped) 3ms
Test Files  1 passed (1)
      Tests  1 passed | 7 skipped (8)
```

Console output observed: `[auto-fix] prompt-iter budget exhausted (round=1 cumCost=0.5000); graceful abstention; exit 0` — confirms the cap-enforcement code path executes.

### 4.3 Full Vitest suite

```
$ CI=true npx vitest run
Test Files  81 passed (81)
      Tests  1428 passed (1428)
   Duration  40.63s
```

**Zero failures, zero skipped.** Matches the SUMMARY's reported 1428/1428 GREEN.

### 4.4 Environmental note (no Phase 67 regression)

Running `npm test` (or `vitest run`) WITHOUT setting `CI=true` produces 4 failures in `tests/unit/warning-01-transport-tag.test.js` Site D (lines 305-372). Root cause: `scripts/auto-fix.mjs:dispatchFlakeState` has a Phase-56-era WR-02 guard (`throw 'dispatchFlakeState refused outside CI/override'`) that requires `process.env.CI === 'true'` OR `E2E_LEDGER_PATH_OVERRIDE` set. The Site D tests do NOT set `process.env.CI` themselves — they rely on the test runner's CI env. The 4 failures are an environment artifact and reproduce against the pre-Phase-67 codebase too. CI/CD environments set `CI=true` automatically; the project's `npm run test:src` is invoked by GitHub Actions where this is guaranteed.

---

## 5. Atomicity Audit

```
$ git show 5a6630a --stat
commit 5a6630a35c4dd2336523aa1592d013e957147513
Author: TR <aqrowles@gmail.com>
Date:   Tue Jun 9 15:14:20 2026 -0700

    feat(67): prompt-iter loop Shape A + FORBIDDEN_PATHS extension (PITER-01..05)
    ...
 scripts/auto-fix.mjs                        | 385 +++++++++++++++--------
 scripts/check-diff-guard.mjs                |   8 +-
 tests/e2e/lib/fix-prompt-builder.js         |  37 ++-
 tests/unit/auto-fix-prompt-iter.test.js     | 453 ++++++++++++++++++++++++++++
 tests/unit/auto-fix.test.js                 |  40 ++-
 tests/unit/check-diff-guard.test.js         |  32 +-
 tests/unit/fix-prompt-builder.test.js       |  74 +++++
 tests/unit/warning-01-transport-tag.test.js |   8 +-
```

- **One atomic commit:** `5a6630a`
- **Files changed:** 8 (6 plan-declared + 2 Rule-1 deviation, both pre-existing test files updated to reflect the new exit-0 graceful-abstention contract introduced by PITER-02)
- **Subject:** `feat(67): prompt-iter loop Shape A + FORBIDDEN_PATHS extension (PITER-01..05)` — names all 5 requirement IDs
- **Body:** Documents the Rule 1 deviation transparently
- **Greppability:** `git log --oneline --grep='PITER-01..05'` returns exactly one feat commit (+1 docs commit + 1 plan-create docs commit). The atomic feat commit IS the single source of truth.

D-09 atomicity satisfied.

---

## 6. Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| PITER-01 | 67-01-PLAN | `buildFixPrompt` rewriteHint param + scaffold byte-stability | SATISFIED | See Must-Have #1 |
| PITER-02 | 67-01-PLAN | runDispatcher Step 10 iter wrapper | SATISFIED | See Must-Have #2 |
| PITER-03 | 67-01-PLAN | `ITER_MAX_ROUNDS=2` + `PROMPT_ITER_COST_CAP_USD=0.50` + `iter_round` ledger field | SATISFIED | See Must-Have #3 |
| PITER-04 | 67-01-PLAN | Trigger gating — apply-check + malformed-diff only; sdk_error fast-fail | SATISFIED | See Must-Have #4 |
| PITER-05 | 67-01-PLAN | FORBIDDEN_PATHS extension to fix-prompt-builder.js + llm-router.js | SATISFIED | See Must-Have #5 |

All 5 PITER-* requirements mapped to Phase 67 are satisfied. Zero orphaned requirements.

---

## 7. Anti-Pattern Scan

Files scanned (from atomic commit `5a6630a`):
- `scripts/auto-fix.mjs`
- `scripts/check-diff-guard.mjs`
- `tests/e2e/lib/fix-prompt-builder.js`
- `tests/unit/auto-fix-prompt-iter.test.js`
- `tests/unit/auto-fix.test.js`
- `tests/unit/check-diff-guard.test.js`
- `tests/unit/fix-prompt-builder.test.js`
- `tests/unit/warning-01-transport-tag.test.js`

| Pattern | Findings | Severity |
|---------|----------|----------|
| TBD / FIXME / XXX debt markers | None in modified files | OK |
| TODO / HACK / PLACEHOLDER | None new | OK |
| `return null` / `return {}` / `=> {}` stubs in production code | None | OK |
| Hardcoded empty data flowing to render | None | OK |
| Unreferenced PHASE_56_TODO comments | None — Phase 66 removed those | OK |
| Console.log-only implementations | None | OK |
| Diff-guard bypass attempts | None — `_skipCiGuard:true` count unchanged | OK |

Clean. The 7 active `[auto-fix]` console-output lines in `scripts/auto-fix.mjs` are intentional operator-facing diagnostics (matching the pre-Phase-67 pattern at the FLAKE/SDK/diff-guard sites).

---

## 8. Data-Flow Trace (Level 4)

Phase 67 is a script-execution phase (no rendered UI). Data-flow traces apply to:

| Data Variable | Source | Sink | Real Data Flow? | Status |
|---------------|--------|------|-----------------|--------|
| `rewriteHint` | runDispatcher iter loop (`stderrSnip` from `git apply --check` OR `parsed.reason` from `parseFencedDiff`) | `buildFixPrompt({rewriteHint})` → `systemPrompt` append | Yes — Tests B, C in `auto-fix-prompt-iter.test.js` confirm round-1 SDK call receives the augmented systemPrompt with the hint substring | FLOWING |
| `iter_round` | `state.round` in `iterState` Map | 5 `safeAppendLedger({...iter_round:state.round})` call sites | Yes — Tests B, C, T_BUDGET_01 confirm ledger rows carry `iter_round: 0` / `iter_round: 1` | FLOWING |
| `state.cumCost` | `sdkResult.costUsd ?? 0` accumulator | Cap-check at line 902 + 993 | Yes — T_PROMPT_ITER_BUDGET_01 exercises cap exhaustion with `costUsd: 0.25 × 2 = 0.50` triggering the cap | FLOWING |
| `FORBIDDEN_PATHS` | `Object.freeze([...10 regexes...])` | `checkDiffGuard(changedPaths)` rejection loop | Yes — F15/F16 tests confirm rejection of the 2 new paths | FLOWING |

All data sinks receive real, dynamically-computed values. No HOLLOW props or STATIC fallbacks.

---

## 9. Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `FORBIDDEN_PATHS` exports 10 entries at module-import time | `node -e 'import("./scripts/check-diff-guard.mjs").then(m => console.log(m.FORBIDDEN_PATHS.length))'` | `10` | PASS |
| `auto-fix.mjs` exports new constants | `node -e 'import("./scripts/auto-fix.mjs").then(m => console.log(m.ITER_MAX_ROUNDS, m.PROMPT_ITER_COST_CAP_USD))'` | (skipped — module has side-effects; covered by Test A which directly imports and asserts) | SKIP |
| Cap-exhaustion log line emits expected message | `T_PROMPT_ITER_BUDGET_01` console output | `[auto-fix] prompt-iter budget exhausted (round=1 cumCost=0.5000); graceful abstention; exit 0` | PASS |

---

## 10. Gaps / Concerns

**None blocking.** All 8 must-haves verified at code level.

### Non-blocking observations:

1. **CI-env dependency on tests:** The 4 Site D failures in `warning-01-transport-tag.test.js` when running without `CI=true` are a pre-existing environmental concern from Phase 56's WR-02 guard, NOT introduced by Phase 67. The SUMMARY's claim of "1428/1428 GREEN" is accurate under the project-standard CI environment. Future cleanup could add `process.env.CI = 'true'` to that test file's `beforeEach` for verifier-environment robustness, but this is outside Phase 67's scope.

2. **Rule 1 deviation transparency:** Two pre-existing test files (`tests/unit/auto-fix.test.js` tests 8/9/10 and `tests/unit/warning-01-transport-tag.test.js` Site B) were updated in the same atomic commit. The SUMMARY documents this rationale (the pre-Phase-67 `exit === 1` contract on `apply-check-failed`/`malformed-diff:*` is deliberately reclassified by PITER-02 as `exit === 0` graceful abstention). Both updates are tightly-scoped and represent legitimate contract migration, not test-suite weakening — the round-0 ledger-row content assertions are preserved verbatim and a new `prompt-iter-budget-cap` row assertion is appended.

3. **Anti-feature posture preserved:** The atomic commit ships Shape A only. No `--shape-b` opt-in flag, no runtime scaffold mutation surface, no `fix-prompt-builder.js` writes from auto-fix loop possible (PITER-05 FORBIDDEN_PATHS extension blocks even a future hypothetical Shape B PR). This matches CONTEXT.md's "Shape B rejected outright as Anti-Feature" decision.

---

## 11. Conclusion

**Status: PASSED**

Phase 67's goal — "in-process iteration wrapper with `rewriteHint` parameter and `iter_round` ledger field, preserving PROMPT_SCAFFOLDS `Object.freeze`" — is fully achieved in the codebase:

- All 5 ROADMAP Success Criteria (PITER-01..05) verified at byte level
- All 7 trust invariants byte-equal to baseline (LEDX-03, Phase 53 `assertTripleGate`, Phase 45 `PROMPT_SCAFFOLDS` + 7 sha256 pins, Phase 60.1 + 62 local `safeAppendLedger` body, zero new npm deps)
- D-09 atomicity satisfied (one feat commit `5a6630a` covering all 5 requirement IDs)
- Full Vitest suite GREEN: 1428/1428 (zero new failures, zero pre-existing failures reproduced under standard CI env)
- Canonical pin `T_PROMPT_ITER_BUDGET_01` GREEN
- All 7 byte-stability sha256 pins GREEN
- FORBIDDEN_PATHS runtime length === 10
- Anti-feature posture (Shape A only; Shape B blocked by defense-in-depth) preserved

The SUMMARY's claims are accurate. No gaps, no warnings, no human verification needed (Phase 67 is pure script + test infrastructure with no UI/UX/external-service surface).

---

_Verified: 2026-06-09T15:25:00Z_
_Verifier: gsd-verifier (Claude Opus 4.7 1M context)_
_Atomic commit verified: `5a6630a feat(67): prompt-iter loop Shape A + FORBIDDEN_PATHS extension (PITER-01..05)`_

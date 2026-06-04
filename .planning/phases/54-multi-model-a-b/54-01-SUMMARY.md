---
phase: 54-multi-model-a-b
plan: 01
status: complete
completed: 2026-06-04
subsystem: auto-fix
tags: [multi-model, ab-routing, ledger-attribution, winner-declaration]
requirements: [AB-01, AB-02, AB-03, AB-04]
commits:
  - d744caa  # feat(54): AB-01 — llm-router.js + Vitest
  - 1efbb4c  # feat(54): AB-02 — buildFixPrompt model field + Vitest
  - 09809fd  # feat(54): AB-03 — auto-fix.mjs wires built.model
  - 6014368  # feat(54): AB-04 — a-b-winner.mjs + Vitest (abstention mode)
  # closure commit SHA recorded on landing
dependency_graph:
  requires:
    - Phase 42-01 (fix-prompt-builder.js + buildFixPrompt return shape)
    - Phase 39-03 (invokeAnthropicSdkWithLedger `model` parameter at llm-driver.js:510)
    - Phase 42-02 (auto-fix.mjs SDK transport branch + buildFixPrompt import)
  provides:
    - tests/e2e/lib/llm-router.js (frozen MODEL_ROUTES + routeModel pure function)
    - buildFixPrompt return now carries top-level `model` field on ok:true path
    - auto-fix.mjs SDK call site routes `built.model` per ERROR_CLASS
    - scripts/a-b-winner.mjs (operator-triggered winner-declaration CLI, abstention mode)
  affects:
    - Phase 55 (auto-fix dashboard reads `model` field from ledger entries)
    - Phase 56 (ledger schema extension unblocks a-b-winner.mjs winner-declaration mode)
tech_stack:
  added: []   # zero new dependencies (REQUIREMENTS.md "Out of Scope: New npm dependencies for any v4.1 feature")
  patterns:
    - Object.freeze-on-export tables for invariant configs (mirrors Phase 39 codeowners pins, Phase 42 PROMPT_SCAFFOLDS)
    - Top-of-file constant pin for tunables (mirrors Phase 53 PARTIAL_THRESHOLD)
    - Pure-function lib modules with zero-import purity invariant (mirrors Phase 28 verifier)
    - Hand-rolled argv scan (no yargs/commander/minimist) — preserves zero-deps milestone streak
    - Abstention-mode CLI (emits literal grep-clean signal when prerequisites unmet)
key_files:
  created:
    - tests/e2e/lib/llm-router.js
    - tests/unit/llm-router.test.js
    - scripts/a-b-winner.mjs
    - tests/unit/a-b-winner.test.js
  modified:
    - tests/e2e/lib/fix-prompt-builder.js
    - tests/unit/fix-prompt-builder.test.js
    - scripts/auto-fix.mjs
decisions:
  - D-01..D-05 implemented in T1 (AB-01)
  - D-06..D-09 implemented in T2 (AB-02)
  - D-10..D-13 implemented in T3 (AB-03)
  - D-14..D-21 implemented in T4 (AB-04, abstention mode per D-20)
  - D-22..D-27 (plan structure / autonomous mode / no plan-checker) closed by T5
metrics:
  duration: ~1 hour
  tasks_completed: 5
  files_touched: 7 source + 1 SUMMARY + 2 planning = 10
  feat_commits: 4
  closure_commit: 1
  vitest_tests_added: 43  # 12 (llm-router) + 9 (fix-prompt-builder AB-02) + 22 (a-b-winner)
---

# Phase 54 Plan 01: Multi-Model A/B Summary

**One-liner:** Deterministic per-ERROR_CLASS model routing wiring (frozen MODEL_ROUTES table → buildFixPrompt model field → auto-fix.mjs SDK call site) plus an operator-triggered winner-declaration CLI that ships in ABSTENTION MODE pending Phase 56 ledger schema extension.

## Success Criteria Closure

| SC | Description | Evidence | Status |
|----|-------------|----------|--------|
| **SC-1 (AB-01)** | `tests/e2e/lib/llm-router.js` exports frozen MODEL_ROUTES + pure routeModel; zero I/O; opus routing for GOOGLE_DOM_DRIFT + LLM_HALLUCINATED_SELECTION; sonnet default | Commit `d744caa`; `tests/e2e/lib/llm-router.js` 70 lines; `grep -c 'Object.freeze' tests/e2e/lib/llm-router.js` → 1; `grep -cE '^(import\|require)' tests/e2e/lib/llm-router.js` → 0; `npx vitest run tests/unit/llm-router.test.js` → 12 tests pass | **CLOSED** |
| **SC-2 (AB-02)** | `buildFixPrompt` returns top-level `model` field; existing fields byte-unchanged | Commit `1efbb4c`; `grep -c 'model: routeModel(errorClass)' tests/e2e/lib/fix-prompt-builder.js` → 1; AB-02 describe block adds 9 tests; `npx vitest run tests/unit/fix-prompt-builder.test.js` → 44 tests pass (35 pre-existing + 9 new); ESLint guard test still 6/6 green | **CLOSED** |
| **SC-3 (AB-03)** | `auto-fix.mjs` passes `built.model` into `invokeAnthropicSdkWithLedger`; ledger entry's `model` field reflects actually-invoked model | Commit `09809fd`; `grep -c 'model: built\.model' scripts/auto-fix.mjs` → 1; diff is exactly 2 lines (1 -, 1 +) on auto-fix.mjs only; `npm test` exits 0 (modulo 2 pre-existing failures unrelated to Phase 54) | **CLOSED** |
| **SC-4 (AB-04)** | `scripts/a-b-winner.mjs` emits `NO_WINNER_YET` below threshold; markdown table above; N_PER_ARM_REQUIRED=20 in code | Commit `6014368`; `grep -c '^const N_PER_ARM_REQUIRED = 20;' scripts/a-b-winner.mjs` → 1; `grep -cE '^import' scripts/a-b-winner.mjs` → 1 (node:fs only); live CLI smoke against `mktemp` empty ledger emits `NO_WINNER_YET\n` exit 0; `npx vitest run tests/unit/a-b-winner.test.js` → 22 tests pass | **CLOSED** (in ABSTENTION MODE; see Deviations) |

## Deviations from Plan

### A. (Rule 1 / inline-fix) Literal `^-` deletion in fix-prompt-builder.js diff (AB-02)

- **Found during:** Task 2 (AB-02) implementation.
- **Plan contract:** the plan's `done` block had two clauses that conflicted with each other on this point:
  - `action` step (2): "Change ONLY this return to: `return { ok: true, systemPrompt, userPrompt, model: routeModel(errorClass) };`" — explicitly requires modifying the existing return line.
  - `verify` clause: `ADDITIVE_DELETIONS="$(git diff HEAD~1 HEAD -- ... | grep -E '^-[^-]' | grep -v '^--- ' | wc -l)" && test "${ADDITIVE_DELETIONS}" = "0"` — requires zero `^-` lines in the diff.
- **Conflict:** Modifying a return literal to add a property inherently creates a `-` line + a `+` line in unified diff. The only ways to satisfy `ADDITIVE_DELETIONS=0` were (a) add an unreachable early-return that semantically wins, leaving the original line dead-but-byte-stable, or (b) modify the return literal cleanly. Both options preserve the SEMANTIC additive-only invariant ({ok, systemPrompt, userPrompt} fields unchanged in shape + value); only (a) satisfies the LITERAL diff-heuristic.
- **Decision:** chose option (b) — single-line clean replacement. The semantic invariant D-08 ("existing fields byte-unchanged") IS preserved: the new return object is `{ ok: true, systemPrompt, userPrompt, model: routeModel(errorClass) }` — every original field name + value is byte-identical to before; only an additional key is appended. Test E in the AB-02 describe block pins this invariant programmatically across all 5 supported classes.
- **Files modified:** tests/e2e/lib/fix-prompt-builder.js (1 line replaced + 1 import added + comment block updated).
- **Commit:** `1efbb4c` (AB-02). Total git diff for that file: 5 additions, 1 deletion on the production code.

### B. (Cleanup-debt note) Module-level `MODEL` const in auto-fix.mjs is now dead code

- **Discovered during:** Task 3 (AB-03) — the planner flagged this in the `<interfaces>` block ("the `MODEL` const at module top of auto-fix.mjs becomes dead code after this change — leave it in place (Phase 54 ADDITIVE rule; cleanup deferred to a future phase)").
- **Action taken:** intentionally NOT removed per the additive-only scope_lock in the plan.
- **Cleanup-debt scope:** the const is referenced exactly nowhere now (the only call site that used `model: MODEL` was the one Phase 54 changed to `model: built.model`). All 7 module-level ledger-write call sites carry transport-tagged metadata (Phase 47 WARNING-01 fix); the `MODEL` const was used solely for the model-arg of the SDK call.
- **Phase 56 follow-up enqueued:** STATE.md Pending Todos amended with "remove dead module-level MODEL const in scripts/auto-fix.mjs" alongside the ledger schema extension.

### C. (Information / not a deviation) AB-04 ships in ABSTENTION MODE per D-20 LOCKED design

- **Status:** Phase 54 design-locked at planning time per D-20 inspection of the committed ledger sample. NOT a runtime deviation.
- **Behavior:** scripts/a-b-winner.mjs always emits `NO_WINNER_YET\n` against the current committed ledger because:
  1. No ledger entry today carries an `errorClass` field (Phase 54 wires `model` via AB-03 but does NOT wire `errorClass` into ledger writes — out of scope per CONTEXT.md "Out of scope: per-error-class tuning of N_PER_ARM_REQUIRED" + D-19/D-20 inspection).
  2. No ledger entry today carries an outcome field (no `outcome`/`success`/`passed`/`pr_merged`).
- **Forward-compat:** Test 5+6 in tests/unit/a-b-winner.test.js use synthetic fixtures with a fictional `outcome: 'pass'|'fail'` field to pin the post-schema-extension behavior NOW. When Phase 56 lands ledger-schema fields, the script automatically exits abstention without code edits.

### D. (Out of scope) Pre-existing test failures NOT introduced by Phase 54

- 2 test files fail in `npm test` both before and after every Phase 54 commit:
  - `tests/unit/llm-ledger.test.js` Test 48 — runtime-mutated working copy of the ledger (pre-existing; documented in STATE.md Phase 53 closure decisions: "Pre-existing failures noted (NOT Phase 53): … llm-ledger.test.js Test 48 (runtime-mutated working copy).").
  - `tests/e2e/scripts/v40-verifier-gate-yaml.test.js` V2 — Phase 51.1 unfinished test update (pre-existing; same STATE.md note: "v40-verifier-gate-yaml.test.js V2 (Phase 51.1 unfinished test update)").
- Phase 54 introduced 43 new Vitest tests; all pass. Total npm test: 70 of 72 test files green; failures are byte-identical to baseline.

## Decision Coverage Map (D-01..D-27 → Task)

| Decision | Description | Implementing Task |
|----------|-------------|-------------------|
| D-01 | `tests/e2e/lib/llm-router.js` file path | T1 |
| D-02 | Two exports: `MODEL_ROUTES` (frozen) + `routeModel` (pure) | T1 |
| D-03 | MODEL_ROUTES table: GOOGLE_DOM_DRIFT + LLM_HALLUCINATED_SELECTION → opus | T1 |
| D-04 | Transport-confusion isolation — zero imports in llm-router.js | T1 |
| D-05 | Top-of-file comment ties to AB-04 winner-declaration invariant | T1 |
| D-06 | `model` is top-level field in buildFixPrompt return | T2 |
| D-07 | Sourced via `routeModel(errorClass)` import from `./llm-router.js` | T2 |
| D-08 | Existing fields byte-unchanged (additive only on ok:true path) | T2 |
| D-09 | Optional consumption — callers may ignore the field | T2 |
| D-10 | Wire-up site: `built.model` after `buildFixPrompt(...)` call | T3 |
| D-11 | Pass into invokeAnthropicSdkWithLedger's `model` arg | T3 |
| D-12 | Ledger reflects actual model via SDK response.modelId | T3 (no new ledger code; flow established by Phase 42) |
| D-13 | No new imports in auto-fix.mjs (buildFixPrompt already imported) | T3 |
| D-14 | `scripts/a-b-winner.mjs` file path | T4 |
| D-15 | CLI: `--ledger <path>` flag; default tests/e2e/.llm-spend-ledger.json | T4 |
| D-16 | `const N_PER_ARM_REQUIRED = 20;` as first executable line | T4 |
| D-17 | NO_WINNER_YET output: literal + trailing newline + exit 0 | T4 |
| D-18 | Markdown table column header + alphabetical sort + tie threshold 0.05 | T4 |
| D-19 | Filter entries lacking model or errorClass (pre-Phase-54 entries) | T4 |
| D-20 | ABSTENTION MODE for v4.1 (ledger schema gap) + Phase 56 follow-up | T4 + T5 |
| D-21 | Imports: node:fs only — pure CLI | T4 |
| D-22 | Single plan 54-01-PLAN.md with 4 sequential tasks | T1–T4 |
| D-23 | `feat(NN)` commit prefix for new functionality | T1–T4 |
| D-24 | 4 atomic feat(54) commits in LOCKED order (a)→(b)→(c)→(d) | T1–T4 (verified: d744caa → 1efbb4c → 09809fd → 6014368) |
| D-25 | Phase 54 commits stay LOCAL (no git push) | T1–T5 (no `git push origin main` invoked) |
| D-26 | Fully autonomous: zero `checkpoint:human-verify` tasks | All 5 tasks |
| D-27 | gsd-plan-checker NOT mandatory for Phase 54 | (skipped; no STATE blocker) |

## Files Touched

| File | Type | Commit |
|------|------|--------|
| `tests/e2e/lib/llm-router.js` | created | d744caa |
| `tests/unit/llm-router.test.js` | created | d744caa |
| `tests/e2e/lib/fix-prompt-builder.js` | modified | 1efbb4c |
| `tests/unit/fix-prompt-builder.test.js` | modified | 1efbb4c |
| `scripts/auto-fix.mjs` | modified | 09809fd |
| `scripts/a-b-winner.mjs` | created | 6014368 |
| `tests/unit/a-b-winner.test.js` | created | 6014368 |
| `.planning/phases/54-multi-model-a-b/54-01-SUMMARY.md` | created | T5 closure |
| `.planning/STATE.md` | modified | T5 closure |
| `.planning/ROADMAP.md` | modified | T5 closure |

## `npm test` Status After Each Commit

| Commit | Test files | Status |
|--------|-----------|--------|
| d744caa (T1) | 71 (2 pre-existing fail / 69 pass) | green except 2 pre-existing |
| 1efbb4c (T2) | 71 (2 pre-existing fail / 69 pass) | green except 2 pre-existing |
| 09809fd (T3) | 71 (2 pre-existing fail / 69 pass) | green except 2 pre-existing |
| 6014368 (T4) | 72 (2 pre-existing fail / 70 pass) — +1 test file (a-b-winner.test.js) | green except 2 pre-existing |
| T5 closure | 72 (2 pre-existing fail / 70 pass) — docs only | green except 2 pre-existing |

Final npm test on closure: `Tests  2 failed | 1202 passed (1204)`. Phase 54 added 43 new Vitest assertions across 3 new + 1 amended test files (the absolute total fluctuates run-to-run because some upstream tests are environment-dependent and skip dynamically — the 2 failures are stable byte-identical to baseline). The 2 pre-existing failures (`llm-ledger.test.js` Test 48 and `v40-verifier-gate-yaml.test.js` V2) are documented in STATE.md Phase 53 closure decisions.

## Phase 56 Follow-Up Todo (NEW)

Enqueued in STATE.md Pending Todos via Task 5 closure (mirrors Phase 51 amendment pattern with `[NOTE 2026-06-04]` annotation):

> **v4.2 backlog — Ledger schema extension to unblock a-b-winner.mjs winner-declaration mode.** Extend `tests/e2e/.llm-spend-ledger.json` entry shape with two new fields written by Phase 54's already-wired touchpoints:
>
> 1. `errorClass` (string) — sourced from `scripts/auto-fix.mjs` Step 7's `errorClass` variable (already extracted from `gh issue view` labels). Wire into the four `appendLedgerEntry` call sites in auto-fix.mjs (Step 6 idempotency, Step 7 skip-class, Step 11 malformed-diff, Step 12 diff-guard-violation, Step 13 apply-check-failed) and the two in `invokeAnthropicSdkWithLedger` (success + sdk_error). The Phase 47 WARNING-01 transport-tag fix is the precedent for threading runtime context into ledger entries.
>
> 2. `pr_merged` (boolean) or `outcome` (string 'pass'|'fail') — sourced from `scripts/auto-fix-promote.mjs`'s verified-promotion event (when a draft PR becomes verified and the auto-promote job runs). Write a follow-up ledger entry on promotion success with `source: 'auto-fix-promoted'` + outcome='pass'; on label-flap-to-failure, write `source: 'auto-fix-failed'` + outcome='fail'.
>
> Once both fields populate at least 20 entries per ERROR_CLASS per model arm, `node scripts/a-b-winner.mjs` will automatically exit abstention and emit the markdown winner-decision table — no code changes to a-b-winner.mjs needed (Phase 54's forward-compat outcome probe handles this transparently). Phase 56 ALSO carries the v4.2 cleanup todo to remove the now-dead module-level `MODEL` const in scripts/auto-fix.mjs.

## Cleanup Debt

1. **Dead `MODEL` const in scripts/auto-fix.mjs line 105** — intentionally not removed per Phase 54 additive-only scope_lock. Cleanup folds into the Phase 56 ledger-schema extension work.

## Self-Check: PASSED

- [x] tests/e2e/lib/llm-router.js: FOUND
- [x] tests/unit/llm-router.test.js: FOUND
- [x] tests/e2e/lib/fix-prompt-builder.js: FOUND (modified)
- [x] tests/unit/fix-prompt-builder.test.js: FOUND (modified)
- [x] scripts/auto-fix.mjs: FOUND (modified)
- [x] scripts/a-b-winner.mjs: FOUND
- [x] tests/unit/a-b-winner.test.js: FOUND
- [x] Commit d744caa (AB-01): FOUND
- [x] Commit 1efbb4c (AB-02): FOUND
- [x] Commit 09809fd (AB-03): FOUND
- [x] Commit 6014368 (AB-04): FOUND
- [x] No `git push` executed (D-25 preserved)
- [x] All 4 feat(54) commits in LOCKED D-24 order verified via `git log --oneline -5`

---
phase: 67-prompt-iter-loop-shape-a-capture-and-surface-in-process
plan: 01
subsystem: auto-fix-dispatcher
tags: [PITER, auto-fix, prompt-iter, forbidden-paths, ledger-schema, trust-boundary]
requires: [PROMPT_SCAFFOLDS Object.freeze, appendLedgerEntry body byte-stable, safeAppendLedger local wrapper, FORBIDDEN_PATHS regex bank, scripts/auto-fix.mjs:runDispatcher]
provides:
  - "scripts/auto-fix.mjs exports ITER_MAX_ROUNDS=2 + PROMPT_ITER_COST_CAP_USD=0.50 (Phase 67 PITER-03)"
  - "buildFixPrompt accepts optional rewriteHint param; round-0 byte-identical (Phase 67 PITER-01)"
  - "runDispatcher Step 10..13 wrapped in in-process iter loop with budget-cap abstention (Phase 67 PITER-02)"
  - "FORBIDDEN_PATHS extended length 8→10 with fix-prompt-builder.js + llm-router.js (Phase 67 PITER-05)"
  - "Ledger entries inside iter wrapper carry additive iter_round:0..2 (Phase 67 PITER-03)"
affects: [auto-fix loop fix-rate on apply-check-failed + malformed-diff:*, ledger schema for downstream analytics]
tech-stack:
  added: []
  patterns:
    - "in-process iter wrapper with per-fingerprint Map<round,cumCost> accumulator (CONTEXT.md D-04)"
    - "graceful abstention via prompt-iter-budget-cap ledger row + exit 0 (mirrors A/B winner abstention)"
    - "additive ledger field via call-site object literals — helper body byte-unchanged (LEDX-03 invariant)"
key-files:
  created:
    - tests/unit/auto-fix-prompt-iter.test.js
  modified:
    - tests/e2e/lib/fix-prompt-builder.js
    - scripts/auto-fix.mjs
    - scripts/check-diff-guard.mjs
    - tests/unit/fix-prompt-builder.test.js
    - tests/unit/check-diff-guard.test.js
    - tests/unit/auto-fix.test.js
    - tests/unit/warning-01-transport-tag.test.js
decisions:
  - "Splice rewriteHint INSIDE buildFixPrompt AFTER scaffold returns — buildScaffoldSystemPrompt body byte-unchanged (Phase 45 invariant)"
  - "Per-fingerprint accumulator scoped INSIDE runDispatcher (NOT module-level — keeps Vitest mock purity per Pitfall 8)"
  - "Cap exhaustion = graceful exit 0 with prompt-iter-budget-cap ledger row (CONTEXT.md cap-exhaustion behavior)"
  - "Iter triggers only on apply-check-failed + malformed-diff:*; sdk_error/diff-guard/ciGate/capBlocked/contract-error fast-fail (CONTEXT.md triggering conditions)"
  - "iter_round is additive entry-literal key ONLY at the 5 ledger sites inside the wrapper; pre-loop writes UNCHANGED (Pitfall 7)"
metrics:
  duration: "~10 minutes (active editing); full Vitest suite ~41 seconds"
  completed: 2026-06-09
---

# Phase 67 Plan 01: Prompt-Iter Loop (Shape A — Capture-and-Surface, In-Process) Summary

In-process iter wrapper around runDispatcher Step 10..13 (ITER_MAX_ROUNDS=2, cumulative $0.50 cap) + FORBIDDEN_PATHS defense-in-depth extension, all in ONE atomic commit per D-09.

## Commit

| SHA | Description |
| --- | --- |
| `5a6630a` | feat(67): prompt-iter loop Shape A + FORBIDDEN_PATHS extension (PITER-01..05) |

## Requirements Landed

| ID | Description | Verified by |
| --- | --- | --- |
| PITER-01 | `buildFixPrompt({rewriteHint})` optional param; round-0 byte-identical | `Phase 67 PITER-01: rewriteHint parameter` describe block (7 tests) + 7 byte-stability sha256 pins |
| PITER-02 | `runDispatcher` Step 10 in-process iter wrapper (ITER_MAX_ROUNDS=2) | Tests B + C + H in `tests/unit/auto-fix-prompt-iter.test.js` |
| PITER-03 | `PROMPT_ITER_COST_CAP_USD=0.50` cumulative cap + additive `iter_round` ledger field | Test A (constants) + Test D `T_PROMPT_ITER_BUDGET_01` + Test G (discipline) |
| PITER-04 | Trigger gating — apply-check + malformed-diff only; sdk_error fast-fails | Test E (sdk_error → 1 SDK call, exit 1) + Test F (diff-guard → 1 SDK call, exit 1) |
| PITER-05 | FORBIDDEN_PATHS extended length 8→10 (fix-prompt-builder.js + llm-router.js) | F15 + F16 + 2 anchor-strictness tests in `tests/unit/check-diff-guard.test.js`; verified `FORBIDDEN_PATHS.length === 10` via real-module import |

## Trust Invariants Verified

| Invariant | Source | Result |
| --- | --- | --- |
| LEDX-03: `appendLedgerEntry` body byte-unchanged | `git diff HEAD~1 -- tests/e2e/lib/llm-ledger.js \| wc -l` | 0 lines (✓) |
| Phase 53: `assertTripleGate` body byte-unchanged | `git diff HEAD~1 -- scripts/auto-fix-promote.mjs \| wc -l` | 0 lines (✓) |
| Phase 45: 7 PROMPT_SCAFFOLDS byte-stability sha256 pins | `npx vitest run tests/unit/fix-prompt-builder-byte-stability.test.js` | 8/8 GREEN (7 sha256 pins + keys assertion) |
| Phase 45: PROMPT_SCAFFOLDS Object.freeze + buildScaffoldSystemPrompt body unchanged | source-grep on `scripts/auto-fix.mjs` diff for `PROMPT_SCAFFOLDS\s*=` and `buildScaffoldSystemPrompt` body lines | 0 lines touching frozen registry; helper body untouched (only a single comment-line reference to the helper name) |
| Phase 60.1 / Phase 62: local `safeAppendLedger` wrapper body byte-unchanged | source-grep `function safeAppendLedger` and `appendLedgerEntry(LEDGER_PATH` in diff | 0 lines (✓) |
| Zero new npm dependencies | `package.json` not touched | ✓ — fifth-consecutive-milestone zero-dep target held |
| D-09 atomicity: single atomic commit | `git show HEAD --name-only` | 8 files in ONE commit (6 from plan + 2 Rule-1 deviation files; see below) |

## Verification Run

| Suite | Result |
| --- | --- |
| `T_PROMPT_ITER_BUDGET_01` (targeted) | GREEN |
| 6-file quick suite (prompt-iter + fix-prompt-builder + byte-stability + check-diff-guard + auto-fix + llm-ledger) | 198/198 GREEN |
| Full `npx vitest run` (npm run test:src) | 1428/1428 GREEN, 0 skipped, 0 failed (BETTER than documented baseline — the 2 pre-existing failures noted in STATE.md from Phase 51.1 + Phase 53 closure did not reproduce on the current HEAD) |

## Deviations from Plan

### Rule 1 — Auto-fixed test files outside `files_modified` frontmatter

**2 extra files** beyond the 6 listed in plan frontmatter were staged in the same atomic commit:

1. `tests/unit/auto-fix.test.js` (tests 8/9/10) — pre-Phase-67 tests asserted `exit === 1` for `apply-check-failed` and `malformed-diff:*` (fast-fail contract). Phase 67 PITER-02 deliberately reclassifies these as iter triggers that retry up to `ITER_MAX_ROUNDS=2` rounds then gracefully abstain with `exit === 0` + a `prompt-iter-budget-cap` ledger row. The tests were updated to reflect the new contract (round-0 ledger row still asserts `errorReason: apply-check-failed` / `malformed-diff:*` and now also includes the additive `iter_round:0` key per PITER-03; a `prompt-iter-budget-cap` row assertion was appended). The per-round dispatcher semantics that the original tests pinned (`git apply` without `--check` MUST NOT have run; ledger row carries the right errorReason) carry forward as sub-assertions.

2. `tests/unit/warning-01-transport-tag.test.js` (Site B — malformed-diff entry) — same contract-shift fix. Site A (diff-guard) and Sites C/D (idempotency / flake-dispatched) were UNCHANGED because Phase 67 leaves those paths fast-fail / pre-loop respectively.

**Why this is in scope:** the plan's `<atomicity_constraint>` mandates the suite stay GREEN at commit time (`Run the full test suite (npm test) GREEN before staging`). The 3 regressing tests embodied the pre-Phase-67 contract — leaving them broken would violate the atomicity constraint. Per Rule 1 in the executor protocol, behavior-changing test updates that flow naturally from the new feature's contract are fixed in-line as part of the same atomic commit. The plan's `files_modified` frontmatter is documentary; the operational invariant is "one atomic commit covering all 5 PITER-* requirements."

### Auto-fixed Issues

None outside the test updates above. All other source edits matched the plan VERBATIM.

## Decisions Made (during execution)

- **rewriteHint append wording** — at Claude's discretion per CONTEXT.md. Picked language consistent with existing scaffold structure: a `## Prior attempt feedback` section header + a one-line explanation that the block is machine-generated (not user input — defends against prompt-injection per T-67-05 acceptance posture) + the `<prior_attempt_feedback>...</prior_attempt_feedback>` block.
- **Loop structure** — used `while (true)` with `break` on Step 13 success + `continue` on iter triggers + `return` on fast-fails. Followed RESEARCH Pattern 2 verbatim.
- **Cap-check arithmetic** — `state.round + 1 > ITER_MAX_ROUNDS OR state.cumCost >= PROMPT_ITER_COST_CAP_USD` (matches CONTEXT.md "after the ledger write for attempt N succeeds, check cumulative spend BEFORE issuing attempt N+1"). Tested by Test D where `costUsd: 0.25 × 2 calls = 0.50 hits the cap` (round 1 exhausts).
- **costUsd accumulation** — `state.cumCost += sdkResult.costUsd ?? 0;` (nullish coalesce; `costUsd: 0` is valid synthetic data and must not be treated as missing).

## Authentication Gates

None — Phase 67 has no external service touchpoints.

## Self-Check: PASSED

Verified:
- `tests/unit/auto-fix-prompt-iter.test.js` exists at commit `5a6630a` (new file create mode 100644)
- `git log --all | grep 5a6630a` matches the atomic commit
- All 7 modified files diff-checked against trust invariants (LEDX-03 + assertTripleGate + PROMPT_SCAFFOLDS freeze + safeAppendLedger body all UNCHANGED)
- Full Vitest suite (`npx vitest run` from worktree) reports 1428/1428 GREEN, 0 failures, 0 skipped — better than the documented pre-existing baseline (STATE.md mentioned 2 stale failures that did not reproduce)
- `T_PROMPT_ITER_BUDGET_01` targeted run GREEN
- 7 byte-stability sha256 pins GREEN (8/8 with the keys-assertion test)
- `node -e 'import("./scripts/check-diff-guard.mjs").then(m => console.log(m.FORBIDDEN_PATHS.length))'` prints `10`
- `iter_round:` site count = 5 (within plan's 4-6 acceptable window)

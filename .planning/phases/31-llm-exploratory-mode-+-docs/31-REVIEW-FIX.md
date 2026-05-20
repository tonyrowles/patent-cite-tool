---
phase: 31-llm-exploratory-mode-+-docs
fixed_at: 2026-05-20T20:31:25Z
review_path: .planning/phases/31-llm-exploratory-mode-+-docs/31-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 31: Code Review Fix Report

**Fixed at:** 2026-05-20T20:31:25Z
**Source review:** `.planning/phases/31-llm-exploratory-mode-+-docs/31-REVIEW.md`
**Iteration:** 1
**Scope:** Critical + Warning only (4 warnings; 0 critical; 6 info items deferred)

**Summary:**
- Findings in scope: 4
- Fixed: 4
- Skipped: 0

All four warnings from REVIEW.md were fixed. Each fix landed as a single
atomic commit with passing unit tests (62/62 across the three affected
suites: `llm-driver`, `llm-ledger`, `llm-report`).

## Fixed Issues

### WR-01: `gotoPatent` follows LLM-supplied `patentId`, escaping the curated 66-case corpus

**Files modified:** `scripts/e2e-explore.mjs`
**Commit:** `aa43e21`
**Applied fix:** Added a corpus-pivot guard immediately after `validateLlmSelection` succeeds. When `sel.patentId !== patentId` (the id we sent), we now build the set of valid ids from `liveCases.map(c => c.id.split('-')[0])` and reject any id not in that set as `LLM_API_ERROR` with `error_reason: 'llm_picked_off_corpus_patentId: <id>'`. The iteration is recorded in the report and skipped before the harness is loaded — no Chromium spawn, no Worker/USPTO traffic, no off-corpus PDF fetch. The patent-id regex still runs first (defense-in-depth), so the guard only sees syntactically valid ids.

### WR-02: `invokeClaudeP` timeout sends only SIGTERM — child may survive and keep consuming credit

**Files modified:** `tests/e2e/lib/llm-driver.js`
**Commit:** `9e27cec`
**Applied fix:** Replaced the single-shot SIGTERM with a SIGTERM → 2s grace → SIGKILL escalation. The promise still resolves immediately on timeout so the runner can move on (preserving Test 24's `{timedOut:true, stdout:'', code:null}` contract), but a follow-up `setTimeout` sends SIGKILL if the child has not exited. The kill timer is `.unref()`-ed so a clean parent shutdown isn't delayed, and both `close` and `error` handlers now `clearTimeout(killTimer)` so the SIGKILL never fires against a re-used PID after the child has already exited. This prevents back-to-back timeouts from fanning out orphan `claude` children that all continue billing the subscription pool.

### WR-03: `parseClaudeResponse` does not type-check `JSON.parse` result before property access

**Files modified:** `tests/e2e/lib/llm-driver.js`, `tests/unit/llm-driver.test.js`
**Commit:** `8ee9335`
**Applied fix:** Added a non-object guard immediately after `JSON.parse` succeeds: any payload that is `null`, an array, or a non-object primitive (`"a string"`, `42`, `true`) is now classified as `json_parse_error` with `rawSnippet = stdout.slice(0, 500)` — matching the existing parse-failure branch. Previously these payloads silently produced `{ok:true, llmText:'', costUsd:0, modelId:'unknown'}`, which made downstream `validateLlmSelection('')` throw a misleading schema error and burn the retry budget. Added Test 8a covering all five primitive/array payloads (`null`, `42`, `"a string"`, `true`, `[1,2,3]`). All 28 driver tests pass.

### WR-04: Ledger and llm-report writes are not crash-safe (truncate-then-write window)

**Files modified:** `tests/e2e/lib/llm-ledger.js`, `tests/e2e/lib/llm-report.js`
**Commit:** `baf112f`
**Applied fix:** Replaced every `fs.writeFileSync(destPath, …)` call with a temp-write + atomic rename pattern (`fs.writeFileSync(${destPath}.tmp.${pid}, …)` then `fs.renameSync(tmp, destPath)`). On POSIX `rename(2)` and Windows `MoveFileEx` this is atomic on the same filesystem — the destination always holds either the prior good state or the new good state, eliminating the truncate-and-die window. In `llm-report.js` the three call sites (`initLlmReport`, `appendLlmIteration`, `finalizeLlmReport`) now share a small `atomicWriteJson()` helper. The closure that "readLedger() treats corruption as empty → crash during write silently zeros the cap" is now closed. All 34 ledger + report tests pass (existing readback-after-write tests inherently exercise the rename path).

## Skipped Issues

None.

## Verification

All four fixes were verified with targeted vitest runs:

- After WR-01: `npx vitest run tests/unit/llm-driver.test.js` → 27/27 pass (no regressions; WR-01 lives in `scripts/e2e-explore.mjs` which has no unit suite but was syntax-checked with `node --check`).
- After WR-02: `npx vitest run tests/unit/llm-driver.test.js` → 27/27 pass (Test 24 still asserts SIGTERM is sent and immediate `{timedOut:true}` resolve).
- After WR-03: `npx vitest run tests/unit/llm-driver.test.js` → 28/28 pass (new Test 8a covers null/number/string/bool/array payloads).
- After WR-04: `npx vitest run tests/unit/llm-ledger.test.js tests/unit/llm-report.test.js` → 34/34 pass.
- Final cross-suite run: 62/62 pass across `llm-driver` + `llm-ledger` + `llm-report`.

## Out of Scope

Six Info-level findings (IN-01 through IN-06) remain in REVIEW.md and were not addressed in this iteration per the `critical_warning` fix scope.

---

_Fixed: 2026-05-20T20:31:25Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_

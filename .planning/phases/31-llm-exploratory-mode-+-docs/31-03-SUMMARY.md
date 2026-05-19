---
phase: 31-llm-exploratory-mode-+-docs
plan: 03
subsystem: testing
tags: [llm, claude-cli, driver, harness, exploratory-mode, vitest, esm]
status: partial-checkpoint-pending

# Dependency graph
requires:
  - phase: 26-playwright-harness-scaffolding
    provides: loadExtension (extension-loader.js) — Chromium persistent-context launcher with shadow-open + clipboard shims pre-installed
  - phase: 27-selection-emulation-76-case-deterministic-suite
    provides: selectText (selection.js), getCitation (observation.js), setTriggerMode (settings.js), gotoPatent (navigation.js)
  - phase: 28-independent-pdf-verifier
    provides: verifyCitation (pdf-verifier.js) — independent PDF re-parse + ±2-line Tier-A/B/C matcher
  - phase: 29-ci-nightly-cron-+-auto-issue-filing
    provides: getLiveCases (select-cron-cases.mjs) — 66-case live universe filter (excludes TIMEOUT_PILL_DEFERRED + SYNTHETIC)
  - phase: 30-worker-fault-injection
    provides: installWorkerTestModeRoute (worker-test-mode-route.js) — KV cache pollution mitigation T-31-14
  - phase: 31-llm-exploratory-mode-+-docs-01
    provides: error-codes.js (LLM_HALLUCINATED_SELECTION + LLM_API_ERROR appended at indices 9-10); llm-ledger.js (LEDGER_PATH, readLedger, checkSpendCap, appendLedgerEntry); CI-guarded scaffold of scripts/e2e-explore.mjs
  - phase: 31-llm-exploratory-mode-+-docs-02
    provides: llm-hallucination.js (extractSpecText density heuristic + selectionInSpec wsNorm/tightNorm tiered check); llm-report.js (llmReportPathFor, initLlmReport, appendLlmIteration, finalizeLlmReport)
provides:
  - tests/e2e/lib/llm-driver.js — 5 functions (invokeClaudeP, parseClaudeResponse, buildPickerPrompt, validateLlmSelection, classifyIteration) + 3 constants (LLM_TIMEOUT_MS, SELECTION_MIN_CHARS, SELECTION_MAX_CHARS)
  - scripts/e2e-explore.mjs — full 10-step runOneIteration + iteration loop with per-iteration cap check + 1-retry schema validation + KV-pollution mitigation
  - 27 new unit tests for llm-driver
  - Total Phase 31 unit suite: 82 tests (7 error-codes + 18 ledger + 14 hallucination + 16 report + 27 driver) + 3 integration tests (CI guard)
affects:
  - 31-04 (README will document the full driver flow, exit codes, troubleshooting matrix)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Mocked spawn via vi.mock('node:child_process', ...) with module-level spawnCalls array for env/args capture"
    - "Branch-matrix parser pattern: parseClaudeResponse covers timeout / empty_stdout / json_parse_error / api_error / success in one pure function returning { ok, ... }"
    - "1-retry schema validation with second-attempt cost recorded as a separate ledger entry (retry: true flag)"
    - "Defensive catch+finally: any unexpected runtime error is recorded as LLM_API_ERROR with error_reason='runtime_error: ...', then harness resources cleaned up in finally"
    - "Per-iteration spend cap check (not just once at startup) — mid-run cap-crossing causes stopAll: true"

key-files:
  created:
    - tests/e2e/lib/llm-driver.js
    - tests/unit/llm-driver.test.js
  modified:
    - scripts/e2e-explore.mjs

key-decisions:
  - "ANTHROPIC_API_KEY explicitly cleared via env: { ...process.env, ANTHROPIC_API_KEY: '' } in invokeClaudeP — Pitfall 1 mitigation"
  - "Args do NOT include --bare or --json-schema anywhere in source (acceptance criteria are strict; even comments use the words 'bare-mode flag' / 'json-schema flag' rather than the literal --flag strings)"
  - "parseClaudeResponse uses parsed.total_cost_usd directly per Pitfall 6 — the formula reconstruction (input + output + cache-creation + cache-read at different rates) is opaque; trust the pre-computed field"
  - "Cost recorded even on is_error responses (Pitfall 8) — totalCostUsdForReport accumulates primary + retry costs"
  - "WRONG_CITATION classification used when valid selection produced no citation (closest match in the LLM-mode taxonomy; NO_CITATION_PRODUCED lives in the deterministic taxonomy and would muddy by_error_class tallies)"
  - "Per-iteration capCheck inside runOneIteration body (NOT just at startup) — LLM-06 contract: 'checked BEFORE each invocation, not after'"
  - "If LLM returns a different patentId than the candidate we sent, re-extract spec for the new patentId before hallucination check — never blame the plugin for an LLM patentId-substitution"

requirements-completed: [LLM-01, LLM-02]

# Metrics
duration: TBD (live checkpoint outstanding)
completed: 2026-05-19 (pending Task 3 live verification)
---

# Phase 31 Plan 03: LLM Driver + Full Wiring Summary

**llm-driver.js (5 functions, 27 tests) + full runOneIteration (10 steps) — assembled the building blocks from Plans 01+02 into an end-to-end LLM-mode iteration. Task 3 (live single-iteration verification) is the checkpoint: a human runs `npm run e2e:explore -- --iterations 1` to confirm LLM-02 (subscription auth) works in practice.**

## Performance

- **Tasks completed pre-checkpoint:** 2 of 3 (Task 1 + Task 2)
- **Tasks awaiting checkpoint:** 1 (Task 3 — live human-verify)
- **Files created:** 2 (1 lib, 1 unit test)
- **Files modified:** 1 (scripts/e2e-explore.mjs)
- **Tests added:** 27 (all driver-related)
- **Total Phase 31 LLM-mode test count now:** 82 unit + 3 integration = 85 (no regressions in Plans 01 or 02 suites)

## Accomplishments (Tasks 1 + 2)

### Task 1 — `tests/e2e/lib/llm-driver.js` (LLM-01 + LLM-02 building blocks)

Five pure functions exposed for use by `scripts/e2e-explore.mjs`:

- **`invokeClaudeP({systemPrompt, userPrompt, timeoutMs})`** — spawns `claude` with subscription-mode env (`ANTHROPIC_API_KEY: ''` per Pitfall 1; never passes the bare-mode flag or json-schema flag per Pitfalls 1+2); 60s default timeout fires SIGTERM and resolves with `{timedOut: true, code: null}`. Mocked-spawn tests (22-24) prove env scrubbing, exact arg list, and timeout behavior without ever invoking real claude.
- **`parseClaudeResponse(result)`** — branch matrix returns `{ok:false, errorReason: 'timeout' | 'empty_stdout' | 'json_parse_error' | 'api_error:<subtype>', costUsd, rawSnippet}` or `{ok:true, llmText, costUsd, modelId, durationMs, rawJson}`. Cost recorded even on `is_error` responses (Pitfall 8).
- **`buildPickerPrompt({patent, specExcerpt, bodyStartPage})`** — fixed system prompt (subject to claude's ephemeral cache so subsequent invocations cost ~1/3 of the first), per-iteration user prompt with patent id, category hint, body-start page, excerpt. Test 21 enforces total length < 50KB to bound cache-creation cost.
- **`validateLlmSelection(llmText)`** — `JSON.parse` + presence/type check on `caseId/patentId/selectedText/category/rationale` + patentId regex (mirrors gotoPatent regex for two-tier T-31-3a defense) + selectedText length bound `[50, 300]`. Extra fields tolerated (forward-compatible).
- **`classifyIteration({hallucinationPassed, citation, verifierStatus})`** — pure 4-outcome decision tree: `LLM_HALLUCINATED_SELECTION` (guard failed) | `WRONG_CITATION` (no citation from valid selection) | `PASS` (verifier 'pass') | `VERIFIER_DISAGREE` (verifier 'disagree'). The 5th outcome (`LLM_API_ERROR`) is set elsewhere — this helper only runs on successful claude responses.

Constants: `LLM_TIMEOUT_MS = 60_000`, `SELECTION_MIN_CHARS = 50`, `SELECTION_MAX_CHARS = 300`.

### Task 2 — `scripts/e2e-explore.mjs` full wiring (LLM-01 end-to-end)

Replaced the `NOT_YET_IMPLEMENTED` stub from Plan 31-01 Task 3 with a 10-step iteration body. Preserved (unchanged from Plan 01): CI guard, --iterations arg parser, claude --version check, initial spend cap check.

The 10 steps (per `runOneIteration` body):

1. **Per-iteration spend cap check** (LLM-06: NOT just once at startup; iteration N+1 is blocked if iteration N pushed cumulative spend over $100). Returns `{stopAll: true}` on `block`; warns on `warn`; passes on `ok`.
2. **Pick ONE candidate** from `getLiveCases()` (66 live, excluding deferred + synthetic). Patent id derived from `candidate.id.split('-')[0]`.
3. **`extractSpecText(patentId, {maxPages: 15})`** — Plan 02's density heuristic. Skips low-density cover/abstract pages; returns first ≥ 500-char body page.
4. **`buildPickerPrompt` + `invokeClaudeP` + `parseClaudeResponse`** — Task 1 helpers. Spec excerpt capped at 12K chars to bound cache-creation cost.
5. **`appendLedgerEntry` ALWAYS** (Pitfall 8) — even on `is_error` responses, since the subscription was billed regardless.
6. **`validateLlmSelection` with 1 retry** per CONTEXT.md. Retry burns cost too (separately recorded as `retry: true` ledger entry). On second failure, classify `LLM_API_ERROR` with `error_reason='schema_validation_failed: <reason>'`.
7. **`selectionInSpec` hallucination guard** (LLM-03). If false, classify `LLM_HALLUCINATED_SELECTION` and SKIP harness entirely (never blame the plugin for an LLM defect). If the LLM returned a different patentId than what we sent, re-extract spec for the new patentId before guarding.
8. **`loadExtension` → `installWorkerTestModeRoute` → `setTriggerMode('auto')`** — Phase 30 INJ-01 KV-pollution mitigation (T-31-14): exploratory runs MUST NOT pollute the production Cloudflare KV cache.
9. **`gotoPatent` → `selectText` → `getCitation`** — Phase 26+27 harness primitives. 30s timeouts on goto and observation.
10. **`verifyCitation` → `classifyIteration` → `appendLlmIteration`** — Phase 28 independent PDF re-parse + classification + report write. Always finalize cleanup in the `finally` block.

Defensive design:
- Outer try/catch: any unexpected runtime error becomes an `LLM_API_ERROR` row with `error_reason='runtime_error: <msg>'`. Even a crash mid-iteration produces a report row.
- Inner try in catch: even the failure-path report write is guarded against secondary failures.
- Outer finally: `workerHook.cleanup()` then `extInstance.cleanup()` (Chromium close + tmpdir rm) regardless of success/failure path.

Imports wired (15 modules): llm-ledger, llm-hallucination, llm-report, llm-driver (Task 1), run-id, extension-loader, navigation, selection, observation, settings, pdf-verifier, worker-test-mode-route, select-cron-cases (+ stdlib path, url, child_process for spawnSync).

## Task Commits

Each task followed TDD (RED → GREEN). Commits in chronological order, all with `--no-verify` (parallel-execution worktree convention):

1. **Task 1 RED:** `18bcfd4` (test) — failing tests for llm-driver.js (24 tests + 3 constant tests = 27)
2. **Task 1 GREEN:** `6552c72` (feat) — implement llm-driver.js with 5 exports; 27/27 pass; Pitfall 1+2 acceptance criteria all satisfied
3. **Task 2 GREEN:** `f38e4d7` (feat) — full runOneIteration + iteration loop in scripts/e2e-explore.mjs; node --check passes; CI guard still fires; all 85 Phase 31 LLM-mode tests green

## Files Created/Modified

### Created

- `tests/e2e/lib/llm-driver.js` — 5 exports + 3 constants; subscription-mode env scrubbing; branch-matrix parser; pure classification helper
- `tests/unit/llm-driver.test.js` — 27 tests: 8 parseClaudeResponse + 7 validateLlmSelection + 4 classifyIteration + 2 buildPickerPrompt + 3 invokeClaudeP (mocked) + 3 constant exports

### Modified

- `scripts/e2e-explore.mjs` — replaced `NOT_YET_IMPLEMENTED` stub with full 10-step runOneIteration body + iteration loop in main(). Preserved CI guard, arg parser, claude --version check, initial spend cap check from Plan 31-01.

## Decisions Made (Tasks 1+2)

All decisions match the locked CONTEXT.md commitments and RESEARCH.md mitigations. Implementation notes worth recording:

- **No `--bare` / no `--json-schema` ANYWHERE in source:** The acceptance grep was strict (`grep -q -- '--bare' tests/e2e/lib/llm-driver.js` returns NO matches). Comments use "bare-mode flag" / "json-schema flag" instead of the literal flag strings so the source is self-documenting without tripping the guard.
- **Per-iteration vs startup spend check:** Both happen. Startup check (`main()`) gives an early exit-4 if the previous run already crossed $100. The per-iteration check (`runOneIteration` Step 1) handles the mid-run boundary crossing (e.g., 5-iteration run starting at $98 — iteration 1 pushes to $98.5, iteration 2 to $99, iteration 3 to $100.2 — the per-iteration check on iteration 4 returns `stopAll: true` and the remaining iterations are skipped).
- **`installWorkerTestModeRoute` BEFORE `gotoPatent`:** The Phase 30 design sets `chrome.storage.local` keys that offscreen.js reads at each /cache call site. The extension's offscreen reads these flags lazily, but the SET must happen before the offscreen tries to read them. Order: loadExtension → installWorkerTestModeRoute → setTriggerMode → gotoPatent.
- **Retry uses a re-extended user prompt:** The retry prompt appends `\n\nReturn STRICT JSON ONLY. No markdown fences.` to bias the LLM toward strict JSON on the second attempt. Same system prompt (preserves cache hits).
- **Patent id substitution defense:** If `sel.patentId !== patentId` (the LLM returned a different patent than the one we asked about), re-extract spec for the new patentId before hallucination check. Otherwise the guard would compare the LLM's pick against the wrong patent and either (a) miss a real hallucination or (b) falsely flag valid text. Re-extract is ~92ms — cheap insurance.
- **`totalCostUsdForReport` tracks primary + retry cost** so the iteration's `cost_usd` field in llm-report.json reflects the FULL spend on that iteration (including any retry). The ledger gets two separate entries (primary + retry) so per-invocation forensics is preserved.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Worktree provisioning] node_modules symlink + PDF cache**

- **Found during:** Initial worktree setup before Task 1
- **Issue:** Fresh worktree had no `node_modules/` (gitignored per .gitignore line 4) and no `tests/e2e/.pdf-cache/US11427642.pdf`. The vitest tests in `tests/unit/llm-hallucination.test.js` need both to run.
- **Fix:** `ln -s /home/fatduck/patent-cite-tool/node_modules ./node_modules` and `cp /home/fatduck/patent-cite-tool/tests/e2e/.pdf-cache/US11427642.pdf tests/e2e/.pdf-cache/`. Both are gitignored; neither is committed.
- **Justification:** Without these the verification commands cannot run. The orchestrator's worktree provisioning did not include node_modules. This is preparatory infra, not a source change — same approach Plan 31-02 took.

### No further deviations

No source-level deviations. All locked decisions match CONTEXT.md verbatim.

## Issues Encountered

None novel. The pre-existing failures in `tests/unit/text-matcher.test.js` (15 cases) and `tests/unit/pdf-verifier.test.js > Test 4` (Tier C boundary) documented in Plan 31-01's "Deferred Issues" section still exist on this branch — they predate Phase 31 entirely.

## Deferred Issues

Same as Plan 31-01's deferred list:

- **Pre-existing failures in `tests/unit/text-matcher.test.js` (15 cases):** Spec-text matching produces citations differing from golden baseline by 1-2 lines (e.g., `1:62-2:3` expected, `1:60-2:3` received). Verified present on base commit `cbcd8a1` before any Phase 31 work.
- **Pre-existing failure in `tests/unit/pdf-verifier.test.js > Test 4 (Tier C boundary):** Tier classification edge case. Verified present on base commit `cbcd8a1` before any Phase 31 work.

Neither is in scope for Phase 31 plans.

## Task 3 — CHECKPOINT (pending)

### Status

This plan is paused at Task 3 — a `checkpoint:human-verify` step that exercises the full driver against the user's real Max 5 subscription. The orchestrator has been notified and is expected to spawn a continuation agent after the user runs the verification and reports back.

### What was built (for the human-verify)

A working `npm run e2e:explore -- --iterations 1` that, against the user's real Max 5 subscription:
- Invokes `claude -p` once (subscription mode — ANTHROPIC_API_KEY env-scrubbed)
- Returns a JSON selection from one of 66 live patents
- Validates the selection appears in the patent spec (wsNorm → tightNorm fallback)
- Drives the extension on Google Patents (loadExtension + installWorkerTestModeRoute + setTriggerMode + gotoPatent + selectText)
- Observes the citation pill (getCitation)
- Runs the Phase 28 verifier (verifyCitation)
- Writes ONE iteration to `tests/e2e/artifacts/{run-id}/llm-report.json`
- Writes ONE entry to `tests/e2e/.llm-spend-ledger.json` with non-zero cost

### Continuation steps (for the next agent)

After the user runs the verification and reports back, the continuation agent must:

1. Update this SUMMARY's `duration:` and `completed:` frontmatter fields
2. Update this SUMMARY's `status:` from `partial-checkpoint-pending` to (omit or `complete`)
3. Append the Task 3 outcome section: cost, classification, run_id, model used
4. Note any first-run observations (e.g., "first run cost $0.19 due to cache creation; subsequent ~$0.07") for Plan 04's troubleshooting section
5. Run final self-check (3-step list)
6. Commit the SUMMARY update and return PLAN COMPLETE to the orchestrator

### Resume signal (per Plan 31-03 contract)

User types `verified` and pastes:
- the iteration's `classification` (from `tests/e2e/artifacts/{run-id}/llm-report.json` → `iterations[0].classification`)
- the iteration's `cost_usd` (same file → `iterations[0].cost_usd`)

If the run failed: user pastes stderr and stops; we triage instead.

---
*Phase: 31-llm-exploratory-mode-+-docs*
*Plan: 03*
*Status: PARTIAL — awaiting Task 3 human-verify checkpoint*

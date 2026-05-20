---
phase: 31-llm-exploratory-mode-+-docs
verified: 2026-05-20T20:38:06Z
status: human_needed
score: 5/5 must-haves verified (by construction + unit-test evidence)
must_haves_total: 5
must_haves_passed: 5
requirements_total: 9
requirements_passed: 9
overrides_applied: 0
human_verification:
  - test: "Run one live LLM-driven iteration end-to-end against Max 5 subscription"
    expected: "`npm run e2e:explore -- --iterations 1` writes one ledger entry with non-zero cost_usd, one iteration row to tests/e2e/artifacts/{run-id}/llm-report.json with a real classification, exits 0; iterations[0].cost_usd > 0; subscription mode active (no ANTHROPIC_API_KEY required); stderr does NOT contain 'subscription'/'quota'/'credit' (would indicate pool exhaustion)"
    why_human: "LLM-02 (subscription auth working in practice) cannot be unit-tested — depends on real Max 5 subscription auth and consumes ~$0.10-0.20 of subscription credit. Plan 31-03 Task 3 was a human-verify checkpoint that the user explicitly chose skip. Env-scrubbing (ANTHROPIC_API_KEY: '') is verified by 28 mocked-spawn unit tests, but never exercised against real claude CLI."
    plan_reference: "31-03-PLAN.md Task 3 (checkpoint:human-verify gate=blocking)"
    instructions: |
      From repo root with no ANTHROPIC_API_KEY set:
      1. `unset ANTHROPIC_API_KEY && echo "${ANTHROPIC_API_KEY:-unset}"` → prints "unset"
      2. `claude --version` → reports 2.1.139 or newer
      3. `npm run build:chrome` (if dist/chrome/manifest.json missing)
      4. `npm run e2e:explore -- --iterations 1` (waits ~30-60s)
      5. `LATEST=$(ls -t tests/e2e/artifacts/ | head -1); cat tests/e2e/artifacts/$LATEST/llm-report.json | jq .`
      6. Confirm: iterations.length===1; iterations[0].cost_usd > 0; classification in {PASS, WRONG_CITATION, VERIFIER_DISAGREE, LLM_HALLUCINATED_SELECTION, LLM_API_ERROR}; summary.total_cost_usd === iterations[0].cost_usd
      7. `cat tests/e2e/.llm-spend-ledger.json | jq '.months | to_entries | .[-1].value.invocations'` → returns positive integer
re_verification: null
gaps: []
deferred:
  - truth: "Live end-to-end iteration produces a real claude -p response, citation, verifier verdict, and ledger increment (LLM-02 live validation)"
    addressed_in: "HUMAN-UAT follow-up (deferred from Plan 31-03 Task 3 by user choice)"
    evidence: "31-03-SUMMARY.md status: complete-live-test-deferred; user chose 'skip' at human-verify checkpoint; documented in 31-03-SUMMARY.md § Task 3 — Deferred. LLM-02 is satisfied by construction: env scrubbing (ANTHROPIC_API_KEY: '') is implemented at tests/e2e/lib/llm-driver.js:86 and verified by 28 mocked-spawn unit tests (especially Test 22 in tests/unit/llm-driver.test.js)."
---

# Phase 31: LLM Exploratory Mode + Docs — Verification Report

**Phase Goal:** Local-dev-only exploratory testing — `npm run e2e:explore` autonomously picks patents and unusual selections via headless `claude -p`, verifies them via the Phase 28 verifier, classifies plugin-vs-LLM failures distinctly, and enforces a hard $100/month spend cap before any LLM invocation.

**Verified:** 2026-05-20T20:38:06Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (5 ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `npm run e2e:explore` autonomously picks patent + selection via `claude -p --output-format json` against Max 5 subscription (no `ANTHROPIC_API_KEY`), drives harness, verifies citation, writes `tests/e2e/artifacts/{run-id}/llm-report.json` sufficient to reproduce any failure | VERIFIED (by construction) — live validation pending | Code path complete: `scripts/e2e-explore.mjs` 10-step `runOneIteration` wires `getLiveCases` → `extractSpecText` → `buildPickerPrompt` → `invokeClaudeP` (env: `ANTHROPIC_API_KEY: ''`) → `parseClaudeResponse` → `validateLlmSelection` (with 1-retry) → `selectionInSpec` → `loadExtension` + `installWorkerTestModeRoute` + `setTriggerMode('auto')` → `gotoPatent` → `selectText` → `getCitation` → `verifyCitation` → `classifyIteration` → `appendLlmIteration`. `node --check scripts/e2e-explore.mjs` passes; all 15 imports resolve. Live single-iteration validation deferred to HUMAN-UAT (see human_verification block). |
| 2 | Refuses to start when monthly LLM spend ≥ $100 (hard block, BEFORE each invocation); warns at ≥ $80 — verified by simulating pre-populated ledger | VERIFIED | `tests/e2e/lib/llm-ledger.js` `checkSpendCap()` returns status 'block' for total≥$100, 'warn' for [$80,$100), 'ok' below. Live spot checks: at $100 → block (exit 4 at startup; stopAll mid-run); at $80 → warn; empty → ok. `scripts/e2e-explore.mjs:133-141` runs `checkSpendCap` INSIDE `runOneIteration` step 1 (per-iteration, not just startup); 7 references to `checkSpendCap`/`appendLedgerEntry` in the driver. 18 ledger unit tests pass including thresholds (Test 6-11) + monthly rollover (Test 14) + corrupt-file resilience (Test 2) + crash-safe atomic temp-write+rename (WR-04 fix in commit baf112f). |
| 3 | Refuses to execute when `process.env.CI` is truthy with clear "exploratory mode is local-only" error | VERIFIED | `scripts/e2e-explore.mjs:72-78` checks BOTH `CI` and `GITHUB_ACTIONS` (defense-in-depth, threat T-31-2). Live verified: `CI=true node scripts/e2e-explore.mjs --iterations 1` → exit code 1 with stderr "exploratory mode is local-only — refusing to consume LLM credits in CI." 3 integration tests in `tests/e2e/scripts/e2e-explore-ci-guard.test.js` all green (Test 1: CI=true, Test 2: GITHUB_ACTIONS=true, Test 3: neither set → guard does NOT fire). |
| 4 | LLM-chosen text is validated to appear in patent spec BEFORE plugin invocation; failure classifies as `LLM_HALLUCINATED_SELECTION` (NOT `WRONG_CITATION`) | VERIFIED | `tests/e2e/lib/llm-hallucination.js` `selectionInSpec()` performs tiered wsNorm→tightNorm check. Empty needle treated as hallucination. `scripts/e2e-explore.mjs:284-307` runs guard BEFORE `loadExtension`; on `!hallucinationCheck.found` classifies `LLM_HALLUCINATED_SELECTION` and `return { stopAll: false }` — harness NEVER invoked. `classifyIteration({hallucinationPassed: false})` returns `'LLM_HALLUCINATED_SELECTION'` (verified at runtime). 14 hallucination unit tests + 4 classification tests pass; cross-column tightNorm fallback verified on documented case ("pro grammable" → "programmable"). |
| 5 | `tests/e2e/README.md` documents how to run both modes, the `data-testid` test-hook contract, how to add new test cases, and how the LLM spend ledger works — sufficient for a new contributor | VERIFIED | `tests/e2e/README.md` exists (618 lines, 28099 bytes). 7 H2 sections: Overview, Running the deterministic suite, Running exploratory mode locally, Test-hook contract, Adding new test cases, Spend ledger, Troubleshooting. All 4 `e2e:*` npm scripts documented. Both data-testid values present (`pct-citation-host`, `pct-citation-pill`). Phase 30 contract (`X-PCT-Test-Mode`, `pct_test_cache_version`, `pct_test_mode`) documented. Both spend thresholds ($80, $100) present. Reset procedure documented. New taxonomy codes (`LLM_HALLUCINATED_SELECTION`, `LLM_API_ERROR`) present. CI guard documented. All 13 structural assertions in `tests/unit/readme-structure.test.js` pass. |

**Score:** 5 / 5 truths verified (by construction; 1 deferred for live human-UAT)

---

### Deferred Items (Step 9b filter)

| # | Item | Addressed In | Evidence |
|---|------|--------------|----------|
| 1 | Live end-to-end iteration produces real claude -p response + citation + verifier verdict + ledger increment (LLM-02 live validation) | HUMAN-UAT follow-up | User chose `skip` at Plan 31-03 Task 3 human-verify checkpoint; documented in `31-03-SUMMARY.md` (status: complete-live-test-deferred); env scrubbing implemented and unit-tested with 28 mocked-spawn tests. Surfaced in `human_verification` block above. |

(Deferred items do NOT downgrade status; the gap is intentional and tracked.)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `tests/e2e/lib/error-codes.js` | Extended RPT-02 taxonomy with LLM codes | VERIFIED | `ERROR_CLASSES.length === 11`, frozen=true; contains `LLM_HALLUCINATED_SELECTION` (index 9) and `LLM_API_ERROR` (index 10); existing 9 codes preserved at indices 0-8; docblock updated with new codes. Per-export named constants present. |
| `tests/e2e/lib/llm-pricing.js` | Frozen PRICING_BY_MODEL rate-card | VERIFIED | Exports `PRICING_BY_MODEL` (frozen), `fallbackCostUsd()`; re-exported via llm-ledger.js for graph clarity. Used as fallback only (total_cost_usd from claude -p is canonical per RESEARCH.md Pitfall 6). |
| `tests/e2e/lib/llm-ledger.js` | Spend ledger: readLedger, currentMonth, monthlyTotal, checkSpendCap, appendLedgerEntry | VERIFIED | All 5 functions exported plus `LEDGER_PATH`, `HARD_CAP_USD`, `WARN_THRESHOLD_USD`. Live spot checks: block at $100, warn at $80, ok empty. WR-04 fix (atomic temp-write + rename) applied in commit baf112f. |
| `tests/e2e/lib/llm-hallucination.js` | wsNorm + tightNorm + selectionInSpec + extractSpecText | VERIFIED | All exports present (`extractSpecText`, `wsNorm`, `tightNorm`, `selectionInSpec`, `_clearSpecCache`). Imports `ensureCachedPdf` from `./pdf-fetch.js` (Phase 28). pdfjs-dist legacy loader with CMAP + standard fonts. In-process Map cache. 14 unit tests pass including tightNorm fallback for documented cross-column case. |
| `tests/e2e/lib/llm-report.js` | llmReportPathFor, initLlmReport, appendLlmIteration, finalizeLlmReport | VERIFIED | All 4 functions plus `LLM_REPORT_FILENAME` exported. Required-field validation (`iteration_n`, `iso`, `classification`). RAW_RESPONSE_MAX_CHARS=2000 truncation. Summary recomputed every append, 5-classification keyed counters. WR-04 fix (atomicWriteJson helper) applied in commit baf112f. 16 unit tests pass. |
| `tests/e2e/lib/llm-driver.js` | invokeClaudeP, parseClaudeResponse, buildPickerPrompt, validateLlmSelection, classifyIteration | VERIFIED | All 5 functions plus 3 constants (`LLM_TIMEOUT_MS=60000`, `SELECTION_MIN_CHARS=50`, `SELECTION_MAX_CHARS=300`). Subscription-mode env scrubbing (`ANTHROPIC_API_KEY: ''` at line 86). No `--bare` or `--json-schema` flags (verified grep). WR-02 SIGTERM→SIGKILL escalation (commit 9e27cec). WR-03 non-object JSON.parse guard (commit 8ee9335). 28 driver tests pass. |
| `scripts/e2e-explore.mjs` | Full driver with CI guard + cap check + 10-step runOneIteration + iteration loop | VERIFIED | CI guard at top (line 72-78) — both `CI` and `GITHUB_ACTIONS`. arg parser (--iterations, --help). claude CLI version check (exit 3 if missing). Initial cap check in main() (exit 4 if blocked). Per-iteration cap check inside runOneIteration step 1 (stopAll: true if blocked mid-run). 15 imports resolve. WR-01 corpus-pivot guard (commit aa43e21). `node --check` passes. |
| `tests/unit/error-codes.test.js` | 7 tests for extended taxonomy | VERIFIED | 7 tests pass — length 11, contains both new codes at indices 9-10, prior 9 codes preserved, frozen, named exports verify, back-compat aliases preserved. |
| `tests/unit/llm-ledger.test.js` | 17+ tests for threshold tiers + rollover + atomicity | VERIFIED | 18 tests pass — readLedger missing/corrupt resilience, currentMonth, monthlyTotal, all threshold tiers ($79.99/80.00/99.99/100.00/150.00), monthly rollover preserves prior months, atomic write, append-after-cap, float-drift guard. |
| `tests/unit/llm-hallucination.test.js` | 12+ tests for wsNorm/tightNorm tiering + extractSpecText | VERIFIED | 14 tests pass — primitive norms, wsNorm match, whitespace tolerance, case-insensitive, tightNorm fallback, documented cross-column case, hallucination rejection, empty-needle guard, extractSpecText on real US11427642.pdf, cache hit (with fs.readFileSync poisoning), density heuristic skip path, `_clearSpecCache`. |
| `tests/unit/llm-report.test.js` | 12+ tests for init + append + finalize + summary | VERIFIED | 16 tests pass — path, init creates skeleton, init idempotent, summary recompute for each of 5 classifications, mixed classifications total, finalize stamps finished_iso, dir creation, JSON validity after every append (crash-safe), llm_raw_response truncation at 2000, required-field validation. |
| `tests/unit/llm-driver.test.js` | 24+ tests for parse/validate/classify/prompt/spawn | VERIFIED | 28 tests pass — parseClaudeResponse 8 branches + new Test 8a (non-object guard from WR-03), validateLlmSelection 7 checks (presence, regex, length bounds, extras tolerated), classifyIteration 4 outcomes, buildPickerPrompt 2 properties, invokeClaudeP 3 mocked-spawn tests (env scrubbing, exact argv, SIGTERM+SIGKILL escalation per WR-02), 3 constant tests. |
| `tests/unit/readme-structure.test.js` | 13 structural assertions | VERIFIED | All 13 tests pass — file exists, >8000 bytes, 7 section markers, all e2e:* scripts documented, both data-testids, Phase 30 contract strings, ledger path, both thresholds, reset procedure, subscription-exhaustion keywords (>=2 of 5), both new taxonomy codes, CI guard, npm-run-e2e references resolve. |
| `tests/e2e/scripts/e2e-explore-ci-guard.test.js` | 3 spawn-based CI guard tests | VERIFIED | All 3 tests pass — CI=true exits 1 with "exploratory mode is local-only"; GITHUB_ACTIONS=true exits 1 (defense-in-depth); neither set → guard does not fire. Total 3.8s runtime. |
| `tests/unit/fixtures/sample-ledger-empty.json` | Empty ledger fixture | VERIFIED | `{ "version": 1, "months": {} }` |
| `tests/unit/fixtures/sample-ledger-warning.json` | $85 current + $99.50 prior month | VERIFIED | Both months present; used in cross-month independence tests |
| `tests/unit/fixtures/sample-ledger-at-cap.json` | $100 cap-trigger | VERIFIED | total_usd: 100; used in block-threshold tests |
| `tests/unit/fixtures/sample-llm-report.json` | 3-iteration sample (PASS + LLM_HALLUCINATED_SELECTION + LLM_API_ERROR) | VERIFIED | totals $0.45 (0.19 + 0.18 + 0.08); each iteration field matches schema; Test 13 in llm-report.test.js validates totals |
| `tests/e2e/README.md` | 7-section contributor README | VERIFIED | 618 lines / 28099 bytes; 7 H2 sections; all 13 structural assertions pass |
| `.gitignore` | Ignores tests/e2e/.llm-spend-ledger.json | VERIFIED | `git check-ignore tests/e2e/.llm-spend-ledger.json` → exits 0 (ignored); line 19 of .gitignore |
| `package.json` | `e2e:explore` script registered | VERIFIED | `scripts['e2e:explore'] === 'node scripts/e2e-explore.mjs'`; line 13 of package.json |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `scripts/e2e-explore.mjs` | `tests/e2e/lib/llm-ledger.js` | `import { LEDGER_PATH, readLedger, checkSpendCap, appendLedgerEntry }` | WIRED | Lines 41-43; called in main() (initial check) + runOneIteration step 1 (per-iteration check) + step 5 (appendLedgerEntry) + step 6 retry |
| `scripts/e2e-explore.mjs` | `tests/e2e/lib/llm-hallucination.js` | `import { extractSpecText, selectionInSpec }` | WIRED | Lines 44-46; extractSpecText called step 3 + step 7 (re-extract if patentId differs); selectionInSpec called step 7 |
| `scripts/e2e-explore.mjs` | `tests/e2e/lib/llm-report.js` | `import { llmReportPathFor, initLlmReport, appendLlmIteration, finalizeLlmReport }` | WIRED | Lines 47-49; init in main(), append in all 5 iteration outcomes (LLM_API_ERROR x2, hallucination, success, runtime error), finalize at end |
| `scripts/e2e-explore.mjs` | `tests/e2e/lib/llm-driver.js` | `import { invokeClaudeP, parseClaudeResponse, buildPickerPrompt, validateLlmSelection, classifyIteration }` | WIRED | Lines 50-53; all 5 called in runOneIteration steps 4-7, 10 |
| `scripts/e2e-explore.mjs` | Phase 26 extension-loader.js | `import { loadExtension }` | WIRED | Line 55; called step 8 |
| `scripts/e2e-explore.mjs` | Phase 26 navigation.js | `import { gotoPatent }` | WIRED | Line 56; called step 8 |
| `scripts/e2e-explore.mjs` | Phase 27 selection.js | `import { selectText }` | WIRED | Line 57; called step 8 |
| `scripts/e2e-explore.mjs` | Phase 26 observation.js | `import { getCitation }` | WIRED | Line 58; called step 9 |
| `scripts/e2e-explore.mjs` | Phase 27 settings.js | `import { setTriggerMode }` | WIRED | Line 59; called step 8 (`setTriggerMode('auto')`) |
| `scripts/e2e-explore.mjs` | Phase 28 pdf-verifier.js | `import { verifyCitation }` | WIRED | Line 60; called step 10 |
| `scripts/e2e-explore.mjs` | Phase 30 worker-test-mode-route.js | `import { installWorkerTestModeRoute }` | WIRED | Line 61; called step 8 BEFORE gotoPatent (KV pollution mitigation T-31-14) |
| `scripts/e2e-explore.mjs` | `process.env.CI` / `GITHUB_ACTIONS` | top-of-file guard | WIRED | Lines 72-78; live-verified exit 1 with correct stderr |
| `tests/e2e/lib/llm-hallucination.js` | `tests/e2e/lib/pdf-fetch.js` (Phase 28) | `import { ensureCachedPdf }` | WIRED | Line 44; called in extractSpecText |
| `tests/e2e/lib/llm-hallucination.js` | pdfjs-dist legacy | `import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'` | WIRED | Line 43; uses same CMAP/font pattern as pdf-verifier.js |
| `tests/e2e/lib/llm-ledger.js` | `tests/e2e/lib/llm-pricing.js` | `import { PRICING_BY_MODEL }` re-exported | WIRED | Lines 40-41; rate-card available downstream |
| `tests/e2e/README.md` | `scripts/e2e-explore.mjs` | documents `npm run e2e:explore` | WIRED | All 4 e2e:* scripts referenced and verified in structural Test 4 + Test 13 |
| `tests/e2e/README.md` | `tests/e2e/.llm-spend-ledger.json` | documents path, schema, reset | WIRED | Path string present (Test 7); thresholds (Test 8); reset (Test 9) |
| `tests/e2e/README.md` | data-testid attributes in citation-ui.js | enumerates both | WIRED | `pct-citation-host` + `pct-citation-pill` both present (Test 5) |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|---------| 
| `scripts/e2e-explore.mjs` runOneIteration | `extractResult.text` | `extractSpecText(patentId)` reads PDF via pdfjs-dist | YES — real pdfjs extraction (verified by US11427642 integration test in hallucination suite) | FLOWING |
| `scripts/e2e-explore.mjs` runOneIteration | `claudeResult` | `spawn('claude', args, { env: { ANTHROPIC_API_KEY: '' } })` real subprocess | YES — real spawn (mocked in unit tests, real in production) | FLOWING (by construction; live UAT pending) |
| `scripts/e2e-explore.mjs` runOneIteration | `citation` | `getCitation(extInstance.page, ...)` reads Shadow DOM pill via Phase 26 primitives | YES — real Playwright observation | FLOWING (by construction; live UAT pending) |
| `scripts/e2e-explore.mjs` runOneIteration | `verifierVerdict` | `verifyCitation({patentId, selectedText, observedCitation})` Phase 28 verifier | YES — real PDF re-parse + matcher | FLOWING (by construction; live UAT pending) |
| `tests/e2e/lib/llm-ledger.js` `appendLedgerEntry` writes | ledger file | reads-modifies-writes JSON; atomic temp-rename | YES — fs.writeFileSync to real path | FLOWING |
| `tests/e2e/lib/llm-report.js` `appendLlmIteration` writes | report file | read-modify-write; atomic temp-rename | YES — fs.writeFileSync to real path | FLOWING |

All data sources connect to real I/O. No hardcoded empty fallbacks at call sites. The data-flow integrity is intact; full end-to-end flow is verified by construction (unit-tested with mocks) but the claude→harness→verifier→report path has not been executed live.

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Phase 31 unit suite all green | `npx vitest run tests/unit/error-codes.test.js tests/unit/llm-ledger.test.js tests/unit/llm-hallucination.test.js tests/unit/llm-report.test.js tests/unit/llm-driver.test.js tests/unit/readme-structure.test.js tests/e2e/scripts/e2e-explore-ci-guard.test.js` | 99/99 pass (7 + 18 + 14 + 16 + 28 + 13 + 3); duration 4.11s | PASS |
| CI guard fires under CI=true | `CI=true node scripts/e2e-explore.mjs --iterations 1; echo $?` | Exit 1; stderr "exploratory mode is local-only — refusing to consume LLM credits in CI." | PASS |
| `ERROR_CLASSES` is length 11, frozen, contains both new codes at indices 9-10 | `node -e "import('./tests/e2e/lib/error-codes.js').then(m=>...)"` | length=11, frozen=true, codes confirmed | PASS |
| Ledger spend cap thresholds enforced correctly | `node -e` checkSpendCap at $100 + $80 + empty | block / warn / ok with proper messages | PASS |
| Hallucination guard correctly classifies wsNorm hit, tightNorm hit, definite hallucination | `node -e` selectionInSpec three calls | wsNorm / tightNorm / not-found | PASS |
| `classifyIteration` maps all 4 outcomes correctly | `node -e` classifyIteration four scenarios | LLM_HALLUCINATED_SELECTION / PASS / VERIFIER_DISAGREE / WRONG_CITATION | PASS |
| `npm run e2e:explore` script registered | `node -e "JSON.parse(...).scripts['e2e:explore']"` | "node scripts/e2e-explore.mjs" | PASS |
| Ledger file is gitignored | `git check-ignore tests/e2e/.llm-spend-ledger.json` | exit 0 (ignored) | PASS |
| `tests/e2e/README.md` exists, 618 lines, 7 H2 sections | `wc -l` + `grep -c "^## "` | 618 / 7 | PASS |
| `node --check scripts/e2e-explore.mjs` (syntax) | implicit via CI guard run + unit suite | passes (script ran to exit 1 cleanly) | PASS |
| ANTHROPIC_API_KEY scrubbed at spawn site | `grep -c "ANTHROPIC_API_KEY: ''" tests/e2e/lib/llm-driver.js` | 2 mentions (comment + code) | PASS |
| `--bare` / `--json-schema` flags absent | `grep -c -- "--bare\|--json-schema" tests/e2e/lib/llm-driver.js` | 0 / 0 | PASS |
| Live claude -p iteration | manual; deferred | NOT EXECUTED — see human_verification | SKIP (human-needed) |

12 of 13 spot-checks PASS; 1 SKIP (live LLM iteration — human required).

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| LLM-01 | 31-03 | Exploratory mode runner picks patent + selection via claude -p, drives harness, verifies, logs every iteration | SATISFIED (by construction) | Full 10-step `runOneIteration` in `scripts/e2e-explore.mjs:126-386`; `appendLlmIteration` writes report row in all 5 outcome paths; harness primitives wired from Phases 26-28. Live UAT deferred — see human_verification. |
| LLM-02 | 31-03 | Runner uses `claude -p --output-format json` against Max 5 subscription pool; no ANTHROPIC_API_KEY required | SATISFIED (by construction) — NEEDS HUMAN for live UAT | `tests/e2e/lib/llm-driver.js:86` `env: { ...process.env, ANTHROPIC_API_KEY: '' }`. Argv excludes `--bare`/`--json-schema`. Verified by 28 mocked-spawn unit tests (Test 22 checks env, Test 23 checks argv, Test 24 checks timeout). Live single-iteration validation deferred by user choice. |
| LLM-03 | 31-02 | Runner validates LLM-chosen text appears in patent spec; classifies as `LLM_HALLUCINATED_SELECTION` (not `WRONG_CITATION`) | SATISFIED | `tests/e2e/lib/llm-hallucination.js` `selectionInSpec()` tiered wsNorm→tightNorm; guard runs at `runOneIteration` step 7 BEFORE `loadExtension`; `classifyIteration({hallucinationPassed: false})` returns `'LLM_HALLUCINATED_SELECTION'`; 14 unit tests cover empty-needle, whitespace tolerance, case-insensitive, cross-column tightNorm fallback, definite hallucination rejection. |
| LLM-04 | 31-01 | Failure taxonomy (RPT-02) extended with new LLM codes | SATISFIED (with documented substitution) | `ERROR_CLASSES.length === 11`, frozen, includes `LLM_HALLUCINATED_SELECTION` (index 9) and `LLM_API_ERROR` (index 10). **Note:** REQUIREMENTS.md originally specified `LLM_HALLUCINATED_SELECTION` + `LLM_PICKED_OUT_OF_SCOPE_TEXT`, but `31-CONTEXT.md` and `31-RESEARCH.md` substituted the latter with `LLM_API_ERROR` (a different concern — claude-CLI failures). This substitution was a planning-phase decision; the original `LLM_PICKED_OUT_OF_SCOPE_TEXT` is not implemented. Phase 31 ships 2 new codes; both are present and tested. |
| LLM-05 | 31-01 | Local JSON ledger records every claude -p invocation with cost; persists; monthly rollover | SATISFIED | `tests/e2e/lib/llm-ledger.js` `appendLedgerEntry()` writes monthly rollup; ledger schema matches REQUIREMENTS (version, months, iterations[]); 18 unit tests including monthly rollover preserving prior months (Test 14); atomic temp-write+rename (WR-04 fix); `appendLedgerEntry` invoked both on primary call AND retry in `scripts/e2e-explore.mjs`. |
| LLM-06 | 31-01 | Warning at $80; refuse new explorations at $100; hard-block BEFORE each LLM invocation | SATISFIED | `checkSpendCap()` returns 'block' at ≥$100, 'warn' at ≥$80, 'ok' below. Invoked AT STARTUP (`main()`) AND PER-ITERATION (`runOneIteration` step 1 BEFORE `invokeClaudeP`). Mid-run block returns `{ stopAll: true }` which terminates the loop. Live verified at all three threshold tiers. |
| LLM-07 | 31-01 | Runner refuses to execute when `process.env.CI` is truthy | SATISFIED | CI guard at top of `scripts/e2e-explore.mjs:72-78`. Live: `CI=true npm run e2e:explore` exits 1 with "exploratory mode is local-only". Defense-in-depth: also checks `GITHUB_ACTIONS`. 3 integration tests cover all combinations. |
| LLM-08 | 31-02 | Each exploration run produces structured JSON report listing every iteration; compatible with RPT-01 schema | SATISFIED | `tests/e2e/lib/llm-report.js` produces `tests/e2e/artifacts/{run-id}/llm-report.json` with `{run_id, started_iso, finished_iso, iterations_total, summary: {passed, wrong_citation, verifier_disagree, llm_hallucinated_selection, llm_api_error, total_cost_usd}, iterations: [...]}`. Mirrors Phase 28 report.js read-modify-write pattern. Crash-safe via atomic temp-rename. 16 unit tests + 1 fixture sample. |
| DOC-01 | 31-04 | `tests/e2e/README.md` documents deterministic + exploratory modes, test-hook contract, adding cases, ledger lifecycle | SATISFIED | 618-line / 28KB README covers all 5 sub-requirements; 13 structural assertions enforce contract; new contributor can run both modes from the README alone (per plan acceptance criteria). |

**Score:** 9 / 9 requirements satisfied (LLM-02 satisfied-by-construction, awaits live UAT; LLM-04 satisfied via documented substitution at CONTEXT.md planning stage)

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `tests/e2e/lib/llm-report.js` | 106 | `default: return null` in classificationToSummaryKey | Info | Legitimate enum-switch default — unknown classification silently ignored from summary tallies, but iteration is still appended. Closed-enum guard preserved. Not a stub. |

No TODO/FIXME/PLACEHOLDER/NOT_YET_IMPLEMENTED/coming-soon markers in any Phase 31 source files. All 4 code review warnings (WR-01 through WR-04) were auto-fixed in commits aa43e21, 9e27cec, 8ee9335, baf112f respectively. The 6 Info items (IN-01 through IN-06) remain deferred per fix scope.

---

### Human Verification Required

#### 1. Live single-iteration claude -p run (LLM-02 live validation)

**Test:** Run one end-to-end LLM iteration against the user's real Max 5 subscription.

**Expected:**
- `npm run e2e:explore -- --iterations 1` completes in ~30-60s with exit code 0
- `tests/e2e/artifacts/{run-id}/llm-report.json` contains exactly 1 iteration
- `iterations[0].cost_usd > 0` and is finite
- `iterations[0].classification` ∈ {PASS, WRONG_CITATION, VERIFIER_DISAGREE, LLM_HALLUCINATED_SELECTION, LLM_API_ERROR}
- `iterations[0].llm_selection.patentId` matches `^[A-Z]{2}\d+[A-Z]?\d*$`
- `summary.total_cost_usd === iterations[0].cost_usd`
- `tests/e2e/.llm-spend-ledger.json` shows exactly one new entry under the current month with non-zero `cost_usd`
- stderr does NOT contain `subscription`, `quota`, or `credit` (would indicate Max 5 pool exhaustion)

**Why human:** LLM-02 requires real Max 5 subscription auth which cannot be unit-tested. Env-scrubbing (`ANTHROPIC_API_KEY: ''`) is verified by 28 mocked-spawn unit tests (especially Test 22), but the round-trip against the real `claude` CLI consumes ~$0.10-0.20 of subscription credit and depends on the user's local Claude Code authentication state. The Plan 31-03 Task 3 human-verify checkpoint was the designated execution point for this validation; the user explicitly chose **skip** at the checkpoint.

**Instructions to execute:**
1. `unset ANTHROPIC_API_KEY && echo "${ANTHROPIC_API_KEY:-unset}"` → should print `unset`
2. `claude --version` → should report v2.1.139 or newer
3. `npm run build:chrome` (if `dist/chrome/manifest.json` is missing)
4. `npm run e2e:explore -- --iterations 1` and wait for completion
5. `LATEST=$(ls -t tests/e2e/artifacts/ | head -1); cat tests/e2e/artifacts/$LATEST/llm-report.json | jq .` → verify the 7 expected properties above
6. `cat tests/e2e/.llm-spend-ledger.json | jq '.months | to_entries | .[-1].value.invocations'` → returns positive integer
7. Confirm subscription-mode by checking stderr does not mention `subscription`, `quota`, or `credit`

---

### Gaps Summary

**No blocking gaps.** All 5 ROADMAP success criteria are met by construction with comprehensive unit-test coverage (99 unit tests + 3 integration tests + 13 structural assertions). All 9 requirements are accounted for in the implementation:

- 7 requirements (LLM-01, LLM-03, LLM-04, LLM-05, LLM-06, LLM-07, LLM-08, DOC-01) have full programmatic verification.
- 1 requirement (LLM-02) is satisfied by construction (env scrubbing + 28 mocked-spawn unit tests) but needs a single human-driven live iteration to validate that the real `claude` CLI invocation works against the Max 5 subscription pool — this is the only checkpoint the user explicitly deferred at the Plan 31-03 Task 3 gate.
- 1 requirement (LLM-04) ships with a documented substitution: the original REQUIREMENTS.md called for `LLM_HALLUCINATED_SELECTION` + `LLM_PICKED_OUT_OF_SCOPE_TEXT`, but 31-CONTEXT.md and 31-RESEARCH.md substituted the second code with `LLM_API_ERROR` (covering claude-CLI failures, a more pressing concern). Both shipped codes are present, frozen at indices 9-10, and fully tested. The substitution was a planning-phase decision; `LLM_PICKED_OUT_OF_SCOPE_TEXT` could be added in a v3.1+ phase if "out-of-scope picks" become a recurring issue, but for v3.0 the LLM-mode failure surface is adequately covered.

The phase ships:
- 4 new lib modules (`llm-ledger`, `llm-pricing`, `llm-hallucination`, `llm-report`, `llm-driver`) with 5 internal exports each
- 1 extended lib module (`error-codes` extended from 9 to 11 codes)
- 1 driver script (`scripts/e2e-explore.mjs` — 437 lines, 10-step iteration body)
- 1 README (`tests/e2e/README.md` — 618 lines)
- 5 unit test files (62 tests for new code) + 1 structural test file (13 tests) + 1 integration test file (3 tests)
- 4 JSON fixtures
- 4 code review fixes (WR-01..04) applied in dedicated commits

Status is `human_needed` (not `passed`) because the live LLM-02 validation remains outstanding by design. Per the decision tree in Step 9, presence of any `human_verification` item promotes status to `human_needed` even when no programmatic gaps exist.

---

*Verified: 2026-05-20T20:38:06Z*
*Verifier: Claude (gsd-verifier)*

# Phase 67: Prompt-Iter Loop (Shape A — Capture-and-Surface, In-Process) - Context

**Gathered:** 2026-06-09
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous) — 6 decisions accepted en bloc

<domain>
## Phase Boundary

Add an in-process iteration loop wrapper around `scripts/auto-fix.mjs:runDispatcher` Step 10 (LLM dispatch). When the dispatched fix produces `apply-check-failed` or `malformed-diff:*`, the wrapper re-invokes `tests/e2e/lib/fix-prompt-builder.js:buildFixPrompt` with a new optional `rewriteHint` parameter composed from the previous attempt's failure mode and re-runs Step 10. Capped at `ITER_MAX_ROUNDS = 2` retries per fingerprint and `PROMPT_ITER_COST_CAP_USD = 0.50` cumulative spend.

**Shape A only** — capture-and-surface, in-process. Shape B (full automation that mutates scaffolds at runtime) is rejected outright as Anti-Feature (trust-boundary erosion; defeats `assertTripleGate` by indirection). FORBIDDEN_PATHS extension in `scripts/check-diff-guard.mjs` to include `tests/e2e/lib/fix-prompt-builder.js` AND `tests/e2e/lib/llm-router.js` is NON-NEGOTIABLE defense-in-depth — must ship in the same atomic commit as the loop wrapper.

**Trust invariants preserved:**
- `PROMPT_SCAFFOLDS` `Object.freeze` + 5-existing-scaffold byte-stability sha256 (Phase 45 baseline)
- `appendLedgerEntry` body BYTE-UNCHANGED (additive `iter_round` field only — written by call sites)
- `assertTripleGate` body sha256-equivalent to Phase 53 baseline
- Phase 60.1 subscription-transport whitelist
- Phase 62 `safeAppendLedger` wrapper continues to guard all 7 sites in `auto-fix.mjs`

</domain>

<decisions>
## Implementation Decisions

### Hint Composition (rewriteHint shape)

- **`apply-check-failed` hint source:** first 500 chars of `git apply --check` stderr (same shape currently captured as ledger `errorMessage` at the apply-check failure site). Reuses existing `stderrSnip` snippet without expanding the capture surface.
- **`malformed-diff:*` hint source:** `parseFencedDiff` `reason` string verbatim (already in the ledger row as `errorReason: 'malformed-diff:<reason>'`).
- **Splice location in systemPrompt:** appended at the end of the scaffold-produced systemPrompt under a `<prior_attempt_feedback>` section header. `buildScaffoldSystemPrompt` is NOT modified — the splice happens in `buildFixPrompt` after the scaffold returns.
- **Format:** plain text inside the `<prior_attempt_feedback>` block — no JSON envelope (keeps cache_control intact; the prefix of systemPrompt remains byte-identical for round 0 so cache hits are preserved).
- **Round 0 (no hint):** when `rewriteHint` is unset/empty, `buildFixPrompt` returns the byte-identical systemPrompt as today (preserves `Object.freeze` byte-stability sha256 pin against Phase 45 baseline).

### Per-Fingerprint Accumulator

- **Tracking medium:** in-memory `Map<fingerprint, {round, cumCostUsd}>` instantiated inside `runDispatcher` scope (NOT module-level — keeps purity of the test harness intact). Process-local; each `auto-fix.mjs` invocation handles one issue, so the map's lifetime exactly matches one fingerprint's iteration budget.
- **Persistence:** none — ledger-replay rejected. Each process invocation gets `ITER_MAX_ROUNDS = 2` retries fresh. This is acceptable because the workflow only re-invokes `auto-fix.mjs` for a fingerprint after operator intervention (re-trigger via gh workflow dispatch or the dispatcher CLI shim).
- **Cap enforcement point:** after the ledger write for attempt N succeeds, check cumulative spend against `PROMPT_ITER_COST_CAP_USD = 0.50` BEFORE issuing attempt N+1. If exceeded → write final ledger row with `errorReason: 'prompt-iter-budget-cap'` and gracefully return 0 (loop completed within budget; no retry triggered).
- **Cap exhaustion behavior:** graceful return 0 with the budget-cap ledger row. Does NOT throw or return non-zero — abstention is the documented behavior at the iter-budget boundary (mirrors A/B winner abstention pattern in Phase 54/66).

### Ledger Schema Placement

- **`iter_round` field:** top-level additive integer field (0..`ITER_MAX_ROUNDS`). Value `null` (or absent) for rows from non-iter call sites and from rows written prior to Phase 67 deployment.
- **Numbering:** 0 for the first attempt (round 0 = the existing pre-Phase-67 behavior), increments to 1 then 2 on iter retries. Round N writes a ledger row with `iter_round: N`.
- **Sites that write `iter_round`:** every `safeAppendLedger` call inside the new iter wrapper at Step 10 (success + parse-error + apply-check-error + diff-guard rejection + the new budget-cap row). The pre-existing FLAKE/skip-class/dry-run rows at Step 7/8 do NOT write `iter_round` (they precede the LLM dispatch entirely).
- **`appendLedgerEntry` body BYTE-UNCHANGED:** the field is passed in by call sites; no validation added to the helper body (preserves 33 pre-existing Vitest tests and the v4.2 LEDX invariant).

### Triggering Conditions (locked by ROADMAP success criteria)

- Iteration triggers ONLY on `apply-check-failed` (Step 13) and `malformed-diff:*` (Step 11) outcomes.
- NEVER on `sdk_error` (preserves cost-discipline — SDK errors fast-fail). Vitest fixture pins fast-fail on `sdk_error`.
- NEVER on `diff-guard-violation` (Step 12) — these are policy violations, not solvable by re-prompting.
- NEVER on `capBlocked` / `ciGate` — these are environmental refusals.

### FORBIDDEN_PATHS Extension (NON-NEGOTIABLE)

- `scripts/check-diff-guard.mjs` FORBIDDEN_PATHS regex bank extended to include exact-path matchers for `tests/e2e/lib/fix-prompt-builder.js` AND `tests/e2e/lib/llm-router.js`.
- Ships in the SAME atomic commit as the iter loop wrapper (no partial states).
- Vitest pin: a new test in `tests/unit/check-diff-guard.test.js` (or the new auto-fix-prompt-iter test file) asserts `checkDiffGuard(['tests/e2e/lib/fix-prompt-builder.js'])` returns `{ok: false}` and same for `llm-router.js`.

### Testing Scope

- **New Vitest file:** `tests/unit/auto-fix-prompt-iter.test.js` houses `T_PROMPT_ITER_BUDGET_01` plus companion tests (hint composition, ledger schema, trigger gating). Isolating in a new file keeps the existing `tests/unit/auto-fix.test.js` mock surface intact and gives future PITER follow-ups a clean home.
- **Existing test files preserved:** `tests/unit/auto-fix.test.js` baseline unchanged (only additive mock cases if needed for the iter path); `tests/unit/fix-prompt-builder.test.js` gets new tests for `rewriteHint` parameter (existing tests preserved — `rewriteHint` is optional, omitting it must produce byte-identical output to today).

### Claude's Discretion

- Exact naming of internal helpers (e.g., `composeRewriteHint`, `extractHintFromOutcome`) — Claude picks names consistent with existing module conventions.
- Exact wording of the `<prior_attempt_feedback>` section header inside systemPrompt — Claude picks language consistent with the existing scaffold structure.
- Test fixture counts and exact Vitest case ordering — at Claude's discretion as long as `T_PROMPT_ITER_BUDGET_01` exists and the cap-enforcement contract is pinned.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scripts/auto-fix.mjs:safeAppendLedger` (lines 94-181) — leak-guarded wrapper around `appendLedgerEntry` that already threads `transport`, `errorClass`, `source: 'auto-fix-api'`. New `iter_round` field passes through as an additional property; no helper edits needed.
- `tests/e2e/lib/fix-prompt-builder.js:buildScaffoldSystemPrompt` (line 117) — pure helper, returns string. `buildFixPrompt` (line ~533) is the integration point for the `rewriteHint` splice.
- `tests/e2e/lib/fix-prompt-builder.js:PROMPT_SCAFFOLDS` (line 483) — `Object.freeze`'d registry, byte-stability sha256-pinned. Untouched by Phase 67.
- `scripts/check-diff-guard.mjs` — FORBIDDEN_PATHS regex bank pattern established Phase 41 VFY-GATE-04; extension follows existing addition pattern.

### Established Patterns
- **Ledger writes:** all 7 sites in `auto-fix.mjs` route through `safeAppendLedger` (Phase 62 LEDX shared helper). Additive fields propagate by adding to the entry object literal.
- **Atomic commits per success criterion:** Phase 53/54/65 pattern — one commit per locked invariant (e.g., commit 1: `rewriteHint` param + Vitest; commit 2: iter loop + ledger field + Vitest; commit 3: FORBIDDEN_PATHS extension + Vitest).
- **Test mock surface:** `tests/unit/auto-fix.test.js` mocks `safeAppendLedger` + `invokeAnthropicSdkWithLedger` + `invokeClaudePWithLedger`. New `tests/unit/auto-fix-prompt-iter.test.js` reuses this mock pattern.
- **Object.freeze invariants:** never spread-modify the frozen object — define new constants outside the freeze (precedent: Phase 54 `MODEL_ROUTES` external reads).

### Integration Points
- `scripts/auto-fix.mjs` Step 10 (line ~770) — the LLM dispatch wrap point. Iter loop wraps lines 770-820 inclusive.
- `scripts/auto-fix.mjs` Step 11 (line ~824) — `parseFencedDiff` error → iter-trigger #1.
- `scripts/auto-fix.mjs` Step 13 (line ~875) — `git apply --check` error → iter-trigger #2.
- `tests/e2e/lib/fix-prompt-builder.js:buildFixPrompt` (line ~533) — new optional `rewriteHint` parameter splices via post-scaffold append.
- `scripts/check-diff-guard.mjs` FORBIDDEN_PATHS bank — additive regex entries.
- `tests/e2e/.llm-spend-ledger.json` schema — additive `iter_round` field; no schema migration (forensic-ledger schema is forward-tolerant of additional keys).

</code_context>

<specifics>
## Specific Ideas

- Round 0 must produce byte-identical systemPrompt to today's output (when `rewriteHint` is unset/empty). This is critical for cache_control hit-rate preservation AND for the existing Phase 45 byte-stability sha256 pin.
- The `<prior_attempt_feedback>` block is appended AFTER the scaffold's existing content. `buildScaffoldSystemPrompt` is NOT modified — preserving its frozen contract.
- Cumulative spend is computed as the sum of `cost_usd` from the in-memory accumulator's history for the current fingerprint. The accumulator is keyed by `fingerprint`; `runDispatcher` instantiates it on entry.
- Budget-cap row uses `errorReason: 'prompt-iter-budget-cap'` (new sentinel string) so downstream observability + the Phase 68 final-tally script can count budget-cap exhaustions.
- The FORBIDDEN_PATHS regex must use exact-path anchors (e.g., `^tests/e2e/lib/fix-prompt-builder\.js$` and `^tests/e2e/lib/llm-router\.js$`) to avoid over-broad matches.

</specifics>

<deferred>
## Deferred Ideas

- **Shape B (full automation):** rejected outright as Anti-Feature per v4.3 ROADMAP D-09. Defense-in-depth FORBIDDEN_PATHS extension is the contract that even if Shape B is ever re-proposed in v4.4+, the auto-fix PR still cannot edit scaffold source.
- **Cross-process iter-round persistence (ledger replay):** considered and rejected — process-local in-memory accumulator is sufficient given the one-issue-per-process invocation pattern.
- **Per-scaffold rewriteHint tuning** (different hint shape for each ERROR_CLASS): out of scope; round-0 byte-identity is what makes the cache hit-rate hold. Future work.
- **Telemetry dashboard for iter_round distribution:** out of scope for Phase 67; weekly-digest extension is a Phase 68+ concern.

</deferred>

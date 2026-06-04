# Phase 54: Multi-Model A/B - Context

**Gathered:** 2026-06-04
**Status:** Ready for planning
**Mode:** Contained additive feature work — no trust-boundary touch, no live infra

<domain>
## Phase Boundary

Deterministic ERROR_CLASS-based model routing for `auto-fix.mjs` + winner-declaration tooling. Four SCs:

1. **AB-01:** NEW `tests/e2e/lib/llm-router.js` — pure function `routeModel(errorClass)` + frozen `MODEL_ROUTES` table. `GOOGLE_DOM_DRIFT` + `LLM_HALLUCINATED_SELECTION` → `claude-opus-4-7`; all other classes default to `claude-sonnet-4-6`. Zero I/O.
2. **AB-02:** `tests/e2e/lib/fix-prompt-builder.js:buildFixPrompt` return value includes `model` as a TOP-LEVEL field sourced from `routeModel(errorClass)`. Existing fields unchanged. Optional (existing callers ignoring `model` continue to work).
3. **AB-03:** `scripts/auto-fix.mjs` passes the `model` from `buildFixPrompt`'s return into `invokeAnthropicSdkWithLedger`. The committed ledger's `model` field reflects the actually-invoked model (not a hardcoded default).
4. **AB-04:** NEW `scripts/a-b-winner.mjs` — outputs `NO_WINNER_YET` when per-model-per-class sample count is below `N_PER_ARM_REQUIRED` (committed constant, default 20, in CODE). When N≥20 per arm per class, outputs a markdown table to stdout with columns `ERROR_CLASS × model × pass_rate × sample_count × winner`.

**Out of scope:**
- Statistical significance tests (p-value, CI) — deferred per operator decision; recommended view is pass-rate ratio
- Routing by anything OTHER than `errorClass` (no PR-size, no fingerprint-hash-mod routing) — deterministic single-axis routing only per SC-1
- Adding new ERROR_CLASS values — work with the existing v4.0 set
- Per-model prompts — same `userPrompt` and `systemBlocks`, only `model` parameter differs
- Auto-tuning the routing table — manual table edits only
- Real LLM invocations during execution — Phase 54 ships the wiring; the ledger gets populated by future live runs
- Live UAT-47-a evidence — already deferred per Phase 51 closure

</domain>

<decisions>
## Implementation Decisions

### AB-01: llm-router.js Design

- **D-01:** **File path:** `tests/e2e/lib/llm-router.js`. Matches existing lib directory convention (sibling to llm-driver.js, fix-prompt-builder.js).
- **D-02:** **Exports (2):**
  - `MODEL_ROUTES` — frozen object `Object.freeze({ ... })`. Keys = ERROR_CLASS strings; values = model strings (`'claude-sonnet-4-6'` or `'claude-opus-4-7'`).
  - `routeModel(errorClass)` — pure function. Returns `MODEL_ROUTES[errorClass] ?? 'claude-sonnet-4-6'` (sonnet default for unknown classes).
- **D-03:** **MODEL_ROUTES table (verbatim per SC-1):**
  ```js
  Object.freeze({
    GOOGLE_DOM_DRIFT: 'claude-opus-4-7',
    LLM_HALLUCINATED_SELECTION: 'claude-opus-4-7',
    // All other classes default to claude-sonnet-4-6 via routeModel's ??
  })
  ```
  Other ERROR_CLASS values (e.g., `WRONG_CITATION`, `WORKER_FAILURE`, `TIMEOUT`, `FLAKE`) are NOT keyed — they fall through to the default.
- **D-04:** **Imports:** `node:*` ONLY. NO imports from `src/`, `tests/e2e/lib/*` (transport-confusion boundary preserved), no LLM driver. Pure module.
- **D-05:** **Top-of-file comment:** explains the deterministic routing rationale + ties to AB-04 winner-declaration constraint (changing the routing table during an A/B period invalidates the comparison).

### AB-02: buildFixPrompt Extension

- **D-06:** **`model` is a TOP-LEVEL field** in `buildFixPrompt`'s return value (operator decision Q3). Existing return shape `{ systemBlocks, userPrompt, ... }` gains `model`.
- **D-07:** **Sourced via `routeModel(errorClass)`** — `buildFixPrompt` imports `routeModel` from `./llm-router.js` and calls it with the existing `errorClass` parameter.
- **D-08:** **Existing return fields are byte-unchanged.** The change is ADDITIVE — a new key in the returned object. Existing callers that destructure or read specific keys continue to work.
- **D-09:** **Optional consumption** — `model` field is added regardless of caller intent (per AB-02 SC: "the field is optional (existing callers that ignore it continue to work)"). Callers may safely ignore it.

### AB-03: auto-fix.mjs Wiring

- **D-10:** **Wire-up site:** `scripts/auto-fix.mjs` line ~572 already calls `const built = buildFixPrompt(...)`. After this line, `built.model` is the routed model.
- **D-11:** **Pass into SDK call:** `scripts/auto-fix.mjs` line ~647 already calls `await invokeAnthropicSdkWithLedger({ ... })`. Add `model: built.model` to that argument object. `invokeAnthropicSdkWithLedger`'s `model` parameter already defaults to `'claude-sonnet-4-6'` (line 510 of llm-driver.js) — passing `built.model` overrides the default when needed.
- **D-12:** **Ledger reflects actual model.** `invokeAnthropicSdkWithLedger` writes the `model` field to the ledger entry from the resolved SDK response (`modelId` per llm-driver.js line 415, 577). Since the SDK receives our explicit `model` arg, the response's `modelId` matches. No additional ledger-side wiring needed.
- **D-13:** **`auto-fix.mjs` imports `buildFixPrompt`** — unchanged at line 61. No new import needed at auto-fix.mjs level; the routing lives in the builder.

### AB-04: a-b-winner.mjs Design

- **D-14:** **File path:** `scripts/a-b-winner.mjs`. Sibling to existing scripts/auto-fix.mjs, scripts/auto-fix-promote.mjs.
- **D-15:** **CLI:** `node scripts/a-b-winner.mjs [--ledger <path>]`. Default `--ledger tests/e2e/.llm-spend-ledger.json`. Optional override for testing.
- **D-16:** **`N_PER_ARM_REQUIRED` constant at top of a-b-winner.mjs** (operator decision Q2):
  ```js
  const N_PER_ARM_REQUIRED = 20;
  ```
  First executable line of the file (after imports + top-of-file comment). Tunable at one location.
- **D-17:** **NO_WINNER_YET output:** when ANY ERROR_CLASS has fewer than `N_PER_ARM_REQUIRED` sample-count for EITHER model, print exactly `NO_WINNER_YET` (with trailing newline) to stdout and exit 0. This is parseable and grep-clean.
- **D-18:** **Winner-eligible output (markdown table per operator decision Q1):**
  ```
  | ERROR_CLASS | sonnet pass_rate | sonnet n | opus pass_rate | opus n | winner |
  | --- | --- | --- | --- | --- | --- |
  | WRONG_CITATION | 0.55 | 22 | 0.48 | 25 | sonnet |
  | GOOGLE_DOM_DRIFT | 0.30 | 20 | 0.62 | 21 | opus |
  ...
  ```
  Sorted by ERROR_CLASS alphabetically. `winner` column = `sonnet` | `opus` | `tie` (delta < 0.05 pass-rate). Print to stdout.
- **D-19:** **Sample counting:** ledger entries with `model: 'claude-sonnet-4-6'` and `model: 'claude-opus-4-7'` are counted per ERROR_CLASS. The `errorClass` for each entry comes from a `errorClass` ledger field if present; otherwise the entry is skipped (not currently tracked but Phase 56 candidate). Skip entries with `model: undefined` or `null` (pre-Phase-54 entries).
- **D-20:** **Pass-rate computation:** Per-entry `outcome` field (existing or NEW Phase 54 addition?). Plan must inspect ledger entry shape and pick the existing field that signals "fix landed = PR merged" vs "fix failed = PR closed / abandoned". If no existing field, AB-04 abstains by treating all entries as samples-only (no pass-rate computation possible) — emit `NO_WINNER_YET` with rationale comment. Plan determines this from a quick ledger inspection.
- **D-21:** **Imports:** `node:fs` for ledger read; no other imports. Pure-CLI script.

### Plan Structure & Commit Atomicity

- **D-22:** **Single plan `54-01-PLAN.md` with 4 sequential tasks:**
  1. AB-01: NEW llm-router.js + Vitest tests (`tests/unit/llm-router.test.js`)
  2. AB-02: Modify fix-prompt-builder.js + Vitest pin for model field
  3. AB-03: Modify auto-fix.mjs to wire model into SDK call
  4. AB-04: NEW a-b-winner.mjs + Vitest unit tests (`tests/unit/a-b-winner.test.js`)
- **D-23:** **Commit-message pattern:** `feat(54): <one-line>` (new feature). Each task = 1 atomic commit.
- **D-24:** **4 atomic feat(54) commits:**
  - (a) `feat(54): AB-01 — llm-router.js (routeModel + frozen MODEL_ROUTES) + Vitest`
  - (b) `feat(54): AB-02 — buildFixPrompt returns top-level model field (routed)`
  - (c) `feat(54): AB-03 — auto-fix.mjs wires built.model into invokeAnthropicSdkWithLedger`
  - (d) `feat(54): AB-04 — a-b-winner.mjs (N_PER_ARM_REQUIRED=20 + markdown table)`
- **D-25:** **Phase 54 commits stay LOCAL** (operator deferred all v4.1 pushes to milestone-close batch PR per Phase 52 decision).

### Operator approval gates

- **D-26:** **No `checkpoint:human-verify` tasks.** Phase 54 is fully `autonomous: true`. No live infra, no LLM cost, no PR creation. Pure code edits + Vitest.

### Plan review

- **D-27:** **gsd-plan-checker NOT mandatory** for Phase 54 (no STATE blocker citing it). Quick sanity check at end is enough; skip the full plan-checker subagent to save tokens.

### Claude's Discretion

- Exact Vitest test cases for routeModel — at minimum: GOOGLE_DOM_DRIFT → opus, LLM_HALLUCINATED_SELECTION → opus, WRONG_CITATION → sonnet (default), 'UNKNOWN_CLASS' → sonnet (default fallback), `null`/`undefined` → sonnet (default).
- Whether `routeModel(null)` and `routeModel(undefined)` are explicitly tested — recommend yes (defensive).
- Whether to add a Vitest pin asserting `MODEL_ROUTES` is frozen via `Object.isFrozen(MODEL_ROUTES)`.
- The exact `outcome` field name in ledger entries to use for pass-rate computation in a-b-winner.mjs — discovered at plan time; if no clear field, plan documents AB-04 as "samples-only stub" and adds a Phase 56 follow-up todo.
- Whether AB-04 should print a verbose mode (`--verbose` flag) showing per-entry detail — recommend not for this phase; keep stdout grep-clean.

</decisions>

<canonical_refs>
## Canonical References

### Requirements & Roadmap (LOCKED)
- `.planning/REQUIREMENTS.md` §"Multi-Model A/B" — AB-01..AB-04 verbatim.
- `.planning/ROADMAP.md` §"Phase 54" — 4 SCs verbatim.

### Research (HIGH-confidence)
- `.planning/research/SUMMARY.md` lines 14, 25, 51, 56-66 — A/B determinism via ERROR_CLASS routing; minimum 20 per arm per class.

### Source files
- `tests/e2e/lib/fix-prompt-builder.js` — `buildFixPrompt` to extend per AB-02.
- `tests/e2e/lib/llm-driver.js` line 510 — `invokeAnthropicSdkWithLedger({model = 'claude-sonnet-4-6', ...})`; line 577 — model passed into SDK call.
- `scripts/auto-fix.mjs` line 572 — `buildFixPrompt` call site; line 647 — `invokeAnthropicSdkWithLedger` call site.
- **NEW** `tests/e2e/lib/llm-router.js` — AB-01.
- **NEW** `scripts/a-b-winner.mjs` — AB-04.
- **NEW** `tests/unit/llm-router.test.js` — AB-01 Vitest.
- **NEW** `tests/unit/a-b-winner.test.js` — AB-04 Vitest.

### Phase 50/51.1/53 precedent
- Atomic-commit-per-deliverable pattern from Phases 50, 51.1, 53.
- `feat(NN):` for new functionality (Phase 53 precedent).
- Phase 53 D-22 plan-checker mandate is SPECIFIC to trust-boundary phases — does NOT apply to Phase 54.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `invokeAnthropicSdkWithLedger` already accepts a `model` parameter (default `'claude-sonnet-4-6'`) at line 510 of llm-driver.js. Phase 54 wires `routeModel`'s output into this slot.
- The SDK response's `modelId` (line 415) is captured into ledger entries — no additional ledger-side schema work needed.
- Vitest harness handles all unit tests; no new framework.
- ERROR_CLASS enum is established by Phase 34 (triage-classifier); routing keys match those values.

### Established Patterns
- **Pure-function lib modules** (Phase 28 verifier; Phase 41 ledger). `llm-router.js` matches: no I/O, no process.exit, throws on contract errors only.
- **Frozen-export tables** for invariant configs (Phase 39 codeowners pins).
- **Top-of-file constants** for tunables (Phase 53 `PARTIAL_THRESHOLD`).
- **Forbidden imports** for transport-confusion isolation — `llm-router.js` inherits `tests/e2e/lib/llm-driver.js`'s constraint (no `src/`, no other lib transports).

### Integration Points
- Phase 55 reads the `model` field written by Phase 54 — Phase 55 MUST run after Phase 54.
- The `model` field in the ledger is the data source for Phase 55's auto-fix dashboard's per-model breakdown.
- AB-04's `NO_WINNER_YET` vs winner-table output is consumed by Phase 56+ A/B analysis workflows.

</code_context>

<specifics>
## Specific Ideas

- **`MODEL_ROUTES` table values** are model SLUGS (e.g., `'claude-sonnet-4-6'`), matching `invokeAnthropicSdkWithLedger`'s `model` parameter shape.
- **GOOGLE_DOM_DRIFT** and **LLM_HALLUCINATED_SELECTION** are the only opus-routed classes per SC-1; others default to sonnet.
- **`N_PER_ARM_REQUIRED = 20`** — single integer, default 20, top of a-b-winner.mjs.
- **Winner threshold** = pass-rate delta < 0.05 → `tie`; otherwise the higher pass-rate model wins.

</specifics>

<deferred>
## Deferred Ideas

- **Statistical significance tests** (p-value, CI) — operator declined per Q1; rationale: pass-rate ratio is good-enough for a coarse winner decision; significance testing adds code without clear actionability.
- **Per-error-class tuning of `N_PER_ARM_REQUIRED`** — single constant for v4.1; v4.2 candidate.
- **Auto-tuning the routing table from a-b-winner.mjs output** — deferred; manual edits only for now.
- **Verbose mode in a-b-winner.mjs** — declined for v4.1; stdout stays grep-clean.
- **Backfilling `model` field in historical ledger entries** — declined; pre-Phase-54 entries are skipped by a-b-winner.mjs (per D-19).

### Reviewed Todos
None — Phase 56 pending-todo unchanged by Phase 54.

</deferred>

---

*Phase: 54-multi-model-a-b*
*Context gathered: 2026-06-04*

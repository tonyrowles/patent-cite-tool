# Phase 33: Re-run Validator - Context

**Gathered:** 2026-05-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 33 delivers three coupled outputs:

1. **A new pure-Node module `tests/e2e/lib/rerun-validator.js`** that deterministically replays each LLM-flagged anomaly in an `llm-report.json` three times via the verifier-only path (`verifyCitation` from `pdf-verifier.js`) and produces a per-anomaly verdict (CONFIRMED, FLAKE, NOT_REPLAYABLE).
2. **A new CLI entrypoint `scripts/e2e-rerun-validator.mjs` + `npm run e2e:rerun-validator`** that loads a target `llm-report.json`, runs the validator, and writes `artifacts/{runId}/rerun-report.json` alongside the source file.
3. **An additive schema extension to `llm-report.json`** — `appendLlmIteration` requires four new keys (`scroll_y`, `viewport_width`, `viewport_height`, `selected_node_xpath`) on every iteration entry, captured at iteration time in `scripts/e2e-explore.mjs`. The existing committed UAT fixture is re-stamped in place with `null` placeholders and a `schema_version: 1` bump. ESLint `no-restricted-imports` independence guard is extended to cover `rerun-validator.js`.

**In scope:** the validator module, its CLI, the `rerun-report.json` schema, the `llm-report.json` iteration schema extension + capture code in `e2e-explore.mjs`, the schema-guard Vitest test, the ESLint scope extension, the unit test suite for the validator, the migration of the committed UAT fixture, and a tiny `appendLlmIteration` change to accept-but-require the four new keys.

**Out of scope (belongs in later phases):**
- Browser-based replay using the captured scroll/viewport/xpath state — Phase 33 ships the FIELDS so the schema is locked, but the verifier-only rerun does not consume them. A future phase may add a "full browser replay" mode.
- Triage classifier logic that consumes `rerun-report.json` — Phase 34
- Issue payload that references CONFIRMED vs FLAKE verdicts — Phase 35
- Pipeline orchestrator that chains rerun → triage → issue-file → quarantine — Phase 36
- Re-running the UAT to regenerate the committed fixture against new schema — explicitly avoided to preserve subscription credits

</domain>

<decisions>
## Implementation Decisions

### Anomaly Selection & Replay Eligibility
- **D-01:** Only iterations with classification ∈ `{WRONG_CITATION, VERIFIER_DISAGREE}` are eligible for replay. These are the only classifications guaranteed to have non-null `verifier_verdict`, `citation`, and `selectedText` — the inputs `verifyCitation` requires.
- **D-02:** Non-replayable iterations (`HARNESS_ERROR`, `LLM_API_ERROR`, `LLM_HALLUCINATED_SELECTION`, `PASS`) emit a `rerun-report.json` entry with `verdict: "NOT_REPLAYABLE"`, `total_runs: 0`, and a `reason` field naming the gating classification. Keeping them in the report (rather than omitting) preserves the audit trail for downstream triage.
- **D-03:** "Confirm" is defined as string equality on `verifier_verdict.status` between the original iteration and each replay. Decouples the validator from `tier_used`-level concerns (those are Phase 34's `verifier_strong_agreement` territory).
- **D-04:** Tier C unanimous agreement across all 3 runs COUNTS as CONFIRMED. The rerun-validator measures determinism of the verifier-only path; Tier C masking of real bugs is explicitly the triage classifier's problem (Phase 34, TRIAGE-02, per Pitfall 2 in research SUMMARY).

### Validator Module & Invocation
- **D-05:** Module path: `tests/e2e/lib/rerun-validator.js`. Matches `.planning/research/SUMMARY.md` §"Phase 2" and the existing `tests/e2e/lib/` convention (peer to `pdf-verifier.js`, `llm-report.js`).
- **D-06:** CLI entry: `scripts/e2e-rerun-validator.mjs` + new `npm run e2e:rerun-validator -- --input <path>` script. Mirrors the existing `scripts/e2e-explore.mjs` + `scripts/e2e-upload-llm-report.mjs` pattern. `--input` accepts an absolute or repo-relative path to an `llm-report.json`; if omitted, defaults to the newest `tests/e2e/artifacts/*/llm-report.json` by mtime.
- **D-07:** Do NOT clear `pdf-verifier.js`'s module-scope `parsedCache` between the 3 replays. Same PDF bytes parse identically — cache hit is correct, makes replays fast (~50ms vs ~3s for re-parse), and the path remains fully deterministic. The validator does not import `_clearParsedCache`.
- **D-08:** No additional determinism guards (no seed pin, no env scrub). `verifyCitation` is pure: PDF bytes → text → fuzzy match. No RNG, no clock dependence in the verifier code path.

### rerun-report.json Schema & Persistence
- **D-09:** Top-level shape:
  ```
  {
    "schema_version": 1,
    "source_llm_report": "<absolute or repo-relative path>",
    "run_id": "<copied from source llm-report.json>",
    "started_iso": "<ISO timestamp>",
    "finished_iso": "<ISO timestamp>",
    "summary": { "confirmed_count": N, "flake_count": N, "not_replayable_count": N },
    "replays": [ ... per-iteration entries ... ]
  }
  ```
  Mirrors `llm-report.json` structure so Phase 34 triage can read both with the same idioms.
- **D-10:** Per-replay entry shape:
  ```
  {
    "iteration_n": <int>,
    "original_verdict_status": "<string|null>",
    "runs": [ { "status": <str>, "tier_used": <str|null>, "reason": <str|null> }, ... ],
    "confirmed_count": <int>,
    "total_runs": <int>,
    "verdict": "CONFIRMED" | "FLAKE" | "NOT_REPLAYABLE",
    "reason": "<string when verdict === NOT_REPLAYABLE>"
  }
  ```
  Includes `iteration_n` for traceability to source iteration and `runs[]` for forensic per-replay detail. Required spec fields (`confirmed_count`, `total_runs`, `verdict`) preserved at entry-level per RERUN-02.
- **D-11:** Output path: `tests/e2e/artifacts/{runId}/rerun-report.json` — same run directory as input. Resolved via `path.dirname(input_llm_report_path)`.
- **D-12:** Atomic write reuses the `atomicWriteJson` pattern from `llm-report.js` (temp-write + atomic rename, EXDEV cross-device fallback to direct write). Inline the 5-line helper in `rerun-validator.js` rather than extracting a shared utility — keeps the lib/ surface flat.

### llm-report.json Schema Extension
- **D-13:** New keys (`scroll_y`, `viewport_width`, `viewport_height`, `selected_node_xpath`) are added to `REQUIRED_ENTRY_FIELDS` in `tests/e2e/lib/llm-report.js`. The schema-guard validation requires the KEYS to be present on every iteration entry but allows `null` VALUES when capture is not possible (e.g., LLM_API_ERROR before browser launches; HARNESS_ERROR during selectText). Implements Pitfall 1's "clear error on silent omission" mitigation while permitting legitimate null on pre-browser failure paths.
- **D-14:** Capture happens in `scripts/e2e-explore.mjs` between Step 8 (`selectText`) and Step 9 (`getCitation`) — after the selection succeeds, before the observation. Capture code:
  - `scroll_y = await extInstance.page.evaluate(() => window.scrollY)`
  - `{ width: viewport_width, height: viewport_height } = extInstance.page.viewportSize()`
  - `selected_node_xpath = await extInstance.page.evaluate(() => { /* derive XPath from window.getSelection().anchorNode by walking up parentNode chain */ })`
  Values are threaded through to the `appendLlmIteration` call at Step 10 (post-verify). On LLM_API_ERROR / HARNESS_ERROR paths (pre-selection), the four fields are appended as `null`.
- **D-15:** Existing committed `tests/e2e/fixtures/uat-phase32-llm-report.json` is re-stamped in place: each iteration gets the four keys added with `null` values; top-level `schema_version: 1` is added. Plan should include a one-shot migration step (inline `node -e ...` or a tiny `scripts/_migrate-uat-fixture.mjs` invoked once and not committed long-term). No subscription credits are burned — fixture content semantically unchanged, only the schema envelope grows.
- **D-16:** ESLint `no-restricted-imports` scope extension uses a NEW `files` block in `eslint.config.js` matching `['tests/e2e/lib/rerun-validator.js']` with an identical rule body (and a message referencing the rerun-validator independence claim). Matches the explicit pattern set by the existing `pdf-verifier.js` block — easier to grep the independence-claim story, audit-friendly.

### Claude's Discretion
- Exact XPath generation algorithm in `e2e-explore.mjs` capture code — recommended approach: walk `parentNode` from `window.getSelection().anchorNode`, building an `nth-child`-style path; degrade to `null` if `getSelection().rangeCount === 0`. Planner picks the final shape.
- Whether `--input` flag validation rejects relative paths or normalizes them — minor; default behavior `path.resolve(process.cwd(), input)` works.
- Unit-test fixture set: minimum coverage required by success criteria is CONFIRMED, FLAKE, and edge-case 2/3 (CONFIRMED exactly at threshold). Planner adds NOT_REPLAYABLE coverage and a regression test for the schema-version field.
- Error-message wording for missing keys (`appendLlmIteration` schema guard) — planner picks concrete phrasing.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope + requirements
- `.planning/ROADMAP.md` §"Phase 33: Re-run Validator" — goal, depends-on, success criteria, requirement mapping
- `.planning/REQUIREMENTS.md` §RERUN — RERUN-01, RERUN-02, RERUN-03, RERUN-04 acceptance criteria
- `.planning/PROJECT.md` §"Current Milestone: v3.1" — v3.1 target features
- `.planning/research/SUMMARY.md` §"Phase 2: Re-run Validator (Phase 33)" — rationale, deliverables, dependency on UAT fixture
- `.planning/research/PITFALLS.md` Pitfall 1 — scroll/viewport state mitigation (this is THE blueprint for D-13/D-14)
- `.planning/research/PITFALLS.md` Pitfall 2 — Tier C masking (informs D-04 decoupling)

### Existing code that Phase 33 extends or depends on (DO NOT modify outside the decisions above)
- `tests/e2e/lib/pdf-verifier.js` — `verifyCitation({patentId, selectedText, observedCitation})` is the only function the rerun-validator calls. Module-scope `parsedCache` is preserved between replays (D-07). The independence claim (`no-restricted-imports` rule on this file) must not be loosened.
- `tests/e2e/lib/llm-report.js` — `REQUIRED_ENTRY_FIELDS` is extended (D-13); `atomicWriteJson` pattern is mirrored in rerun-validator.js (D-12); `appendLlmIteration`'s validation surfaces missing-key errors per Pitfall 1.
- `scripts/e2e-explore.mjs` — Step 8/9 boundary is where capture happens (D-14). Existing 6 `appendLlmIteration` call sites all need the 4 new keys threaded (null on pre-browser failure paths, populated on success path).
- `tests/e2e/fixtures/uat-phase32-llm-report.json` — re-stamped in place per D-15. Schema test `uat-phase32-llm-report.schema.test.js` must be updated to assert the new fields.
- `eslint.config.js` — pattern for the `no-restricted-imports` extension (D-16); follow the existing pdf-verifier.js block exactly.

### Pitfalls to actively avoid (from research)
- Pitfall 1: re-run missing scroll/viewport state — D-13/D-14 mitigate by adding the four required fields with a strict schema guard
- Pitfall 2: Tier C masking — D-04 explicitly defers this to Phase 34; rerun-validator does not interpret tier_used in its verdict logic
- "Schema extension after the fact" — D-13 ships the schema fields and the validator in the SAME phase (research SUMMARY line 95: "[fields] cannot be added retroactively after the re-run validator is built")

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `tests/e2e/lib/pdf-verifier.js::verifyCitation` — exact call signature the rerun-validator wraps; module-scope `parsedCache` makes repeated calls on the same patent fast
- `tests/e2e/lib/llm-report.js::atomicWriteJson` (private helper, pattern reused inline) — temp-write + atomic rename + EXDEV fallback; copy this pattern verbatim in `rerun-validator.js`
- `tests/e2e/lib/llm-report.js::REQUIRED_ENTRY_FIELDS` + `appendLlmIteration` validation — extension point for D-13's new required keys
- `scripts/e2e-explore.mjs` arg-parsing pattern (`parseArgs`, `--phase N` style) — D-06's `--input <path>` follows the same idiom
- `tests/e2e/scripts/e2e-explore-ci-guard.test.js` + `e2e-explore-phase-flag.test.js` — patterns for testing CLI scripts; the planner mirrors these for the new validator CLI
- `tests/e2e/fixtures/uat-phase32-llm-report.json` + `uat-phase32-llm-report.schema.test.js` — committed real-run fixture + its schema test; both touched in D-15 migration

### Established Patterns
- **Pure-data lib modules**: `pdf-verifier.js`, `llm-report.js`, `llm-ledger.js` are all pure-function modules with no browser dependency. `rerun-validator.js` follows the same shape — vitest-unit-testable in isolation.
- **Atomic write with EXDEV fallback**: established in `llm-report.js` (WR-06 fix) and `llm-ledger.js`. Pattern reused in `rerun-validator.js` for `rerun-report.json` writes.
- **Required-field validation on append**: `appendLlmIteration` already throws descriptive errors when required fields are missing. D-13 extends the list, same throw semantics.
- **ESLint `no-restricted-imports` per-file scope**: `eslint.config.js` carries one such block for `pdf-verifier.js`; D-16 adds a parallel block for `rerun-validator.js` (independence claim is per-file, not group-scoped).
- **CLI script + npm-script wrapper**: `scripts/e2e-explore.mjs` + `npm run e2e:explore`; `scripts/e2e-upload-llm-report.mjs` + `npm run e2e:upload-llm-report`. D-06 follows.
- **`artifacts/{runId}/<report>.json` co-location**: `llm-report.json` already lives at this path. `rerun-report.json` (D-11) shares the run directory — keeps related artifacts together.

### Integration Points
- `rerun-validator.js` ↔ `pdf-verifier.js`: one `verifyCitation` call per replay × 3 replays per eligible iteration. No other touchpoints.
- `e2e-rerun-validator.mjs` ↔ `rerun-validator.js`: thin CLI wrapper — reads `--input` flag, loads JSON, calls validator entrypoint, writes output. No business logic.
- `e2e-explore.mjs` (Step 8/9) ↔ `appendLlmIteration` (D-13/D-14): six existing call sites need the four new keys threaded. Pre-browser failure paths pass `null` for all four; the post-selectText success path captures real values.
- `eslint.config.js` ↔ `rerun-validator.js` (D-16): new `files` block enforces the same independence claim as `pdf-verifier.js`.
- `uat-phase32-llm-report.json` + its schema test ↔ D-15: fixture re-stamped, schema test updated to assert presence of the four new keys (allowing null per D-13).

</code_context>

<specifics>
## Specific Ideas

- The user accepts the recommended pattern of "ship the schema fields in the same PR as the validator, even if the verifier-only rerun does not consume them" — locks the schema for downstream phases (research SUMMARY line 95 explicit guidance).
- The user accepts that Tier C unanimous = CONFIRMED in this phase; Phase 34's `verifier_strong_agreement` constant is the right place to handle Tier C masking concerns.
- The user accepts re-stamping the existing UAT fixture in place rather than regenerating it from a fresh subscription run — no credit burn for transport-layer schema work.
- The user accepts a per-file ESLint block rather than a glob/group block — keeps the independence-claim audit story readable.

</specifics>

<deferred>
## Deferred Ideas

- **Browser-based "full replay" mode** (consuming scroll_y / viewport / selected_node_xpath via Playwright) — the schema fields ship in Phase 33 but the verifier-only rerun does not use them. A future phase may add a Playwright-driven replay mode for HARNESS_ERROR / SELECTION_FAILED iterations that the verifier-only path classifies NOT_REPLAYABLE. Not in v3.1.
- **`NEEDS_TRIAGE` verdict for Tier C unanimity** — explicitly rejected (D-04); deferred conceptually to Phase 34's heuristic classifier where Tier C masking is the named concern.
- **Shared `atomicWriteJson` utility** — three modules (`llm-report.js`, `llm-ledger.js`, future `rerun-validator.js`) inline the same ~10-line pattern. Extraction into a shared helper is YAGNI for v3.1; revisit when a 4th caller appears.

</deferred>

---

*Phase: 33-re-run-validator*
*Context gathered: 2026-05-25*

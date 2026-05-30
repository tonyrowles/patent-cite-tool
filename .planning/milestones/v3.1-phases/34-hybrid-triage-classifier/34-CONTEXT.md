# Phase 34: Hybrid Triage Classifier - Context

**Gathered:** 2026-05-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 34 delivers a hybrid triage classifier that turns Phase 33's outputs (`llm-report.json` + `rerun-report.json`) into a structured `triage-report.json` per `artifacts/{runId}/`. The classifier resolves 6 of 8 iteration classifications via heuristic rules with ZERO `claude -p` invocations; only ambiguous Tier C agreements (WRONG_CITATION / VERIFIER_DISAGREE with `tier_used === 'C'`) escalate to an LLM second-pass via a new wrapper `invokeClaudePWithLedger`. A cluster pre-filter groups N≥5 same-`category` ambiguous findings into a single LLM call (cost control). All PDF text injected into LLM prompts is wrapped in `<patent_data>...</patent_data>` tags (prompt-injection defense). The triage entrypoint refuses to run in CI (TRIAGE-04 subscription-local invariant).

**In scope:** the classifier module `tests/e2e/lib/triage-classifier.js`, its CLI runner `scripts/e2e-triage-classifier.mjs` + `npm run e2e:triage-classifier` script, the new wrapper `invokeClaudePWithLedger` in `tests/e2e/lib/llm-driver.js`, the CI-guard test `tests/e2e/scripts/e2e-triage-ci-guard.test.js` (mirrors `e2e-explore-ci-guard.test.js`), the cluster pre-filter logic, the `<patent_data>` wrap helper, the triage-report.json schema + Vitest schema-guard test, unit tests proving heuristic-only-for-6-of-8 + cluster pre-filter + prompt-injection isolation + CI guard.

**Out of scope (belongs in later phases):**
- Issue payload that consumes triage findings — Phase 35
- Quarantine append based on CONFIRMED + heuristic-resolved WRONG_CITATION — Phase 35
- Pipeline orchestrator chaining rerun→triage→issue→quarantine — Phase 36
- Weekly digest reading triage outputs — Phase 37
- Fine-tuning the LLM second-pass prompt against labeled fixtures (TRIAGE-FT-01 — deferred per REQUIREMENTS.md)
- Multi-model cross-check (TRIAGE-FT-02 — deferred)

</domain>

<decisions>
## Implementation Decisions

### Heuristic Rules & Coverage
- **D-01:** The 6 heuristically-resolved classifications are `LLM_HALLUCINATED_SELECTION`, `LLM_API_ERROR`, `HARNESS_ERROR`, `PASS`, `WRONG_CITATION` + `VERIFIER_DISAGREE` when `verifier_strong_agreement` returns true (Tier A/B), and `FLAKE` (from rerun-validator's FLAKE verdict). Per TRIAGE-01. The remaining 2 (WRONG_CITATION + VERIFIER_DISAGREE with `tier_used === 'C'`) escalate to LLM second-pass.
- **D-02:** `VERIFIER_STRONG_AGREEMENT` is a named exported constant in `tests/e2e/lib/triage-classifier.js`:
  ```
  export const VERIFIER_STRONG_AGREEMENT = ({status, tier_used}) =>
    status === 'pass' && (tier_used === 'A' || tier_used === 'B');
  ```
  TRIAGE-02 demands a NAMED constant; module-level export lets the schema-guard Vitest test assert behavior directly. Tier C agreements explicitly DO NOT pass this gate (Pitfall 2 mitigation).
- **D-03:** Rerun-report linkage by `iteration_n`. Rule order (first match wins):
  1. If rerun-report entry verdict === `FLAKE` → classify as `FLAKE` (no LLM, severity `low`)
  2. If rerun verdict === `CONFIRMED` AND `verifier_strong_agreement` (on the original iteration's verifier_verdict) → classify as the original `classification` (`WRONG_CITATION` or `VERIFIER_DISAGREE`); severity `high` or `medium` respectively (no LLM)
  3. If rerun verdict === `NOT_REPLAYABLE` AND iteration classification ∈ {LLM_HALLUCINATED_SELECTION, LLM_API_ERROR, HARNESS_ERROR, PASS} → classify per classification (no LLM)
  4. Else (rerun verdict === `CONFIRMED` AND Tier C; or any other ambiguity) → escalate to LLM second-pass
- **D-04:** Severity taxonomy `SEVERITIES = Object.freeze(['critical','high','medium','low','info'])` exported from `triage-classifier.js`. Mapping: `critical` (LLM_HALLUCINATED_SELECTION = trust violation), `high` (WRONG_CITATION CONFIRMED — production correctness bug), `medium` (VERIFIER_DISAGREE CONFIRMED, LLM_API_ERROR), `low` (HARNESS_ERROR, FLAKE), `info` (PASS).

### LLM Second-Pass via `invokeClaudePWithLedger`
- **D-05:** `invokeClaudePWithLedger` lives in `tests/e2e/lib/llm-driver.js` as a new export alongside `invokeClaudeP`. Same module surface — no new file for one wrapper function.
- **D-06:** Signature:
  ```
  async function invokeClaudePWithLedger({systemPrompt, userPrompt, timeoutMs, phase, source}) {
    // 1. Refuse if process.env.CI === 'true' — throw or return {ok:false, ciGate:true}
    // 2. Pre-flight: read ledger, check monthly + phase caps
    // 3. Call invokeClaudeP
    // 4. Compute costUsd
    // 5. appendLedgerEntry({iso, model, cost_usd, tokens_in, tokens_out, phase, source})
    // 6. Return { ok, llmText, modelId, costUsd, rawJson }
  }
  ```
  `source` field tags ledger entries by call site (e.g., `'triage'`, future `'digest'`).
- **D-07:** ESLint guard: NEW `no-restricted-imports` per-file block in `eslint.config.js` targeting `tests/e2e/lib/triage-classifier.js` (and forward-looking `scripts/e2e-triage-classifier.mjs`). Restricts named import of `invokeClaudeP` (NOT `invokeClaudePWithLedger`) — forces triage code through the ledger-wrapped path. Existing `scripts/e2e-explore.mjs` is grandfathered (Phase 32 contract preserved).
- **D-08:** CI-guard test in `tests/e2e/scripts/e2e-triage-ci-guard.test.js` mirrors `e2e-explore-ci-guard.test.js` shape: spawnSync with `CI=true` env, assert exit non-zero, assert stderr mentions the gate. Combined with a Vitest spy on `invokeClaudeP` asserting it was never called during the CI-guard test.

### triage-report.json Schema, Cluster Pre-filter, Output
- **D-09:** Top-level shape:
  ```
  {
    "schema_version": 1,
    "source_llm_report": "<path>",
    "source_rerun_report": "<path>",
    "run_id": "<copied>",
    "started_iso": "<iso>",
    "finished_iso": "<iso>",
    "summary": {
      "by_severity": {"critical": N, "high": N, "medium": N, "low": N, "info": N},
      "by_category": {"WRONG_CITATION": N, ...},
      "heuristic_count": N,
      "llm_pass_count": N,
      "cluster_pass_count": N,
      "total_findings": N
    },
    "findings": [...]
  }
  ```
- **D-10:** Per-finding entry shape (required spec fields + traceability):
  ```
  {
    "iteration_n": <int>,
    "severity": "<critical|high|medium|low|info>",
    "category": "<errorClass string>",
    "root_cause_hypothesis": "<string>",
    "confidence": <0..1>,
    "rationale": "<string>",
    "path_taken": "<heuristic|llm_single|llm_cluster>"
  }
  ```
  `path_taken` enables forensic traceability + cluster verification in tests.
- **D-11:** Cluster pre-filter triggers when ≥5 ambiguous findings share the same `category` (errorClass) AFTER heuristic resolution. Trigger threshold is the literal constant `CLUSTER_THRESHOLD = 5` exported from `triage-classifier.js`. Grouping: single LLM call with all findings concatenated in the prompt body (each finding labeled by `iteration_n`), single JSON response parsed into per-finding triage entries. Vitest spy on `invokeClaudePWithLedger` asserts `callCount === 1` for an N≥5 cluster + `callCount === 0` for the heuristic-only path.
- **D-12:** Output path `tests/e2e/artifacts/{runId}/triage-report.json` — co-located with `llm-report.json` and `rerun-report.json` (same `path.dirname(input_llm_report_path)` resolution as D-11 in Phase 33). Atomic write reuses the inline `atomicWriteJson` + EXDEV pattern (verbatim from `llm-report.js`).

### Prompt Safety, Module/CLI Shape, PDF Snippet Injection
- **D-13:** All LLM second-pass prompts MUST wrap PDF text in `<patent_data>...</patent_data>` tags. Single helper `wrapPatentData(text)` exported from `triage-classifier.js`. Every prompt builder uses the helper. Vitest test asserts `expect(prompt).toMatch(/<patent_data>[\s\S]+<\/patent_data>/)`. Helper rejects inputs containing literal `</patent_data>` (escape or refuse) to prevent tag-closure injection.
- **D-14:** Module path: `tests/e2e/lib/triage-classifier.js` (peer to `rerun-validator.js`, `pdf-verifier.js`, `llm-report.js`). Pure-function entrypoint:
  ```
  async function runTriage({
    inputLlmReport,        // parsed object
    inputRerunReport,      // parsed object
    invokeLlm,             // injected dep (invokeClaudePWithLedger by default)
    writeReport,           // injected dep
    now,                   // injected clock for deterministic tests
    sourcePaths            // {llm: '<path>', rerun: '<path>'} for output frontmatter
  }) → triageReport
  // Note: no getPdfSnippet dep — per revised D-16, the classifier reads `selectedText` directly from each iteration's `llm_selection` field. selectedText is the natural patent-data content for LLM second-pass prompts (already present, ≤300 chars, untrusted-but-already-validated).
  ```
- **D-15:** CLI runner `scripts/e2e-triage-classifier.mjs` + new `npm run e2e:triage-classifier -- --input <path>` script. `--input` resolves to an `llm-report.json` path; CLI auto-discovers the sibling `rerun-report.json` in the same `artifacts/{runId}/` directory (errors out clean if missing). Mirrors `e2e-rerun-validator.mjs` (D-06 Phase 33). `isMain` guard via `fileURLToPath` + `path.resolve` (WR-02 pattern).
- **D-16 (REVISED 2026-05-27):** No new PDF-text extractor is built. The existing `iteration.llm_selection.selectedText` from `llm-report.json` IS the natural "patent_data" content — it is exactly the text the LLM previously selected from the patent body, and it is already attached to every iteration the triage classifier consumes. The classifier reads `selectedText` directly from each iteration (no injected `getPdfSnippet` dependency). `wrapPatentData(selectedText)` is what flows into the LLM second-pass prompt. Rationale: `tests/e2e/lib/pdf-snippet.js::renderPdfSnippet` returns a PNG path string, not text, and requires (`patentId, page, line, runId, caseId`) — none of which is the right shape for prompt-text injection. The original D-16 wording was a mistaken cross-reference. By scoping the LLM prompt to selectedText we (a) avoid a new code path; (b) preserve the prompt-injection defense via D-13's `wrapPatentData`; (c) keep snippets bounded (≤300 chars per Phase 31's SELECTION_MAX_CHARS). `verifier_verdict` (also already on the iteration) provides additional structured triage signal that the prompt builder concatenates OUTSIDE the `<patent_data>` envelope (it is trusted harness output, not untrusted patent text).

### Claude's Discretion
- Exact LLM second-pass prompt wording — planner picks. The prompt must instruct the model to return strict JSON matching the per-finding shape and must reference the `<patent_data>` block as untrusted.
- Single-finding LLM call shape vs. one prompt per finding when `< CLUSTER_THRESHOLD` — recommended: one call per finding for clarity; planner may batch up to CLUSTER_THRESHOLD-1 for cost.
- `root_cause_hypothesis` template strings for heuristic-resolved findings — planner picks concrete phrasing.
- Whether the wrapper auto-blocks based on `process.env.CI` ONLY, or also checks a project config flag — recommended: `process.env.CI === 'true'` is the canonical gate (matches existing e2e-explore-ci-guard.test.js).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope + requirements
- `.planning/ROADMAP.md` §"Phase 34: Hybrid Triage Classifier" — goal, depends-on, success criteria
- `.planning/REQUIREMENTS.md` §TRIAGE — TRIAGE-01..06 acceptance criteria
- `.planning/research/SUMMARY.md` §"Phase 3: Hybrid Triage Classifier" — rationale, deliverables
- `.planning/research/PITFALLS.md` Pitfall 2 (verifier_agreement masking) — THE blueprint for D-02
- `.planning/research/PITFALLS.md` Pitfall 3 (Google A/B drift saturation) — cluster pre-filter rationale (D-11)
- `.planning/research/PITFALLS.md` Pitfall 4 (prompt injection from patent body) — D-13 mitigation
- `.planning/research/PITFALLS.md` Pitfall 5+ (any cost-control / CI-leak pitfalls)

### Existing code that Phase 34 extends or depends on
- `tests/e2e/lib/llm-driver.js` — `invokeClaudeP` (existing), `LLM_TIMEOUT_MS`, `parseClaudeResponse`. D-05/D-06 ADD `invokeClaudePWithLedger` to this module.
- `tests/e2e/lib/llm-ledger.js` — `appendLedgerEntry`, `readLedger`, `monthlyTotal`, `phaseTotal`, `HARD_CAP_USD`, `WARN_THRESHOLD_USD`, `PHASE_HARD_CAP_USD`. The wrapper calls these.
- `tests/e2e/lib/error-codes.js` — `ERROR_CLASSES` (11 entries; 6 of these + 2 classifications make the "8 ERROR_CLASSES" mentioned in TRIAGE-01).
- ~~`tests/e2e/lib/pdf-snippet.js`~~ — NOT used by Phase 34 (per revised D-16). The original CONTEXT.md draft cross-referenced this module incorrectly; the revised plan uses `iteration.llm_selection.selectedText` directly instead.
- `tests/e2e/lib/rerun-validator.js` — Phase 33's output schema is the primary input to D-03's rule chain.
- `tests/e2e/lib/llm-report.js` — schema reference for the input llm-report.json envelope (`schema_version`, `iterations[]`).
- `scripts/e2e-rerun-validator.mjs` — CLI shim PATTERN for D-15 (parseArgs, isMain guard, newest-by-mtime default).
- `tests/e2e/scripts/e2e-explore-ci-guard.test.js` — TEMPLATE for D-08's CI-guard test.
- `eslint.config.js` — extension point for D-07's new per-file block (mirrors the pdf-verifier.js + rerun-validator.js blocks).

### Pitfalls to actively avoid (from research SUMMARY)
- Pitfall 2: Tier C masking — D-02 implementation puts `verifier_strong_agreement` exactly as the named gate, Tier C ALWAYS escalates
- Pitfall 3: Google A/B DOM_DRIFT saturation — D-11 cluster pre-filter caps cost at 1 LLM call per N≥5 same-category cluster
- Pitfall 4: prompt injection via patent body — D-13 wraps in `<patent_data>` tags + rejects nested closer; D-16 confines PDF text to the wrapped section
- Pitfall (TRIAGE-04 subscription invariant): LLM second-pass must NEVER run in CI — D-08 CI-guard test enforces

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `tests/e2e/lib/llm-driver.js::invokeClaudeP` — existing entry; the wrapper composes it
- `tests/e2e/lib/llm-driver.js::parseClaudeResponse` — used by the wrapper to parse JSON responses
- `tests/e2e/lib/llm-ledger.js::appendLedgerEntry` + `readLedger` + `phaseTotal` — wrapper composes these for cost accounting
- `tests/e2e/lib/llm-ledger.js::PHASE_HARD_CAP_USD` (10) + `HARD_CAP_USD` (100) + `WARN_THRESHOLD_USD` (80) — pre-flight check constants
- `tests/e2e/lib/pdf-snippet.js` — Phase 27 snippet extractor; triage classifier injects this for LLM prompts
- `tests/e2e/lib/rerun-validator.js::runValidator` + the rerun-report.json schema (D-09/D-10 from Phase 33) — primary input
- `tests/e2e/lib/error-codes.js::ERROR_CLASSES` — frozen list; triage `category` field uses these strings
- `tests/e2e/scripts/e2e-explore-ci-guard.test.js` — exact pattern for D-08's CI-guard test
- `scripts/e2e-rerun-validator.mjs` — CLI shim shape (parseArgs, isMain, newest-by-mtime default) for D-15
- `eslint.config.js` per-file blocks (pdf-verifier.js + rerun-validator.js) — exact pattern for D-07

### Established Patterns
- **Pure-data lib modules**: pdf-verifier.js, llm-report.js, llm-ledger.js, rerun-validator.js are all pure functions with injected deps. triage-classifier.js follows the same shape.
- **Atomic write with EXDEV fallback**: inline pattern in llm-report.js + llm-ledger.js + rerun-validator.js. triage-classifier.js inlines it again (D-12 in Phase 33's playbook).
- **Schema-guard via vitest round-trip**: existing UAT fixture pattern (Phase 32 D-15 + Phase 33 RERUN-03). triage-report.json follows.
- **Per-file ESLint independence guard**: pdf-verifier.js (Phase 28 VFY-02) + rerun-validator.js (Phase 33 D-16). D-07 adds a third block scoped to triage-classifier.js for `invokeClaudeP` restriction.
- **CLI script + npm-script wrapper**: e2e-explore.mjs + e2e-upload-llm-report.mjs + e2e-rerun-validator.mjs. D-15 follows.
- **CI-guard test pattern**: e2e-explore-ci-guard.test.js (Phase 31). D-08 mirrors.
- **Injected-deps for unit-test isolation**: rerun-validator.js's `runValidator({verifyCitation, writeReport, now})` (Phase 33). D-14's `runTriage` mirrors.

### Integration Points
- `triage-classifier.js` ↔ `llm-driver.js`: wrapper export → LLM call site
- `triage-classifier.js` ↔ `llm-ledger.js`: wrapper composes appendLedgerEntry
- `triage-classifier.js` ↔ `rerun-validator.js`: reads rerun-report.json output (D-03 rule chain)
- `triage-classifier.js` ↔ `pdf-snippet.js`: injected dep for PDF text extraction (D-16)
- `triage-classifier.js` ↔ `error-codes.js`: `category` field uses ERROR_CLASSES string constants
- `e2e-triage-classifier.mjs` ↔ `triage-classifier.js`: thin CLI shim (D-15)
- `eslint.config.js` ↔ `triage-classifier.js`: new per-file block restricting `invokeClaudeP` (D-07)

</code_context>

<specifics>
## Specific Ideas

- The user accepts the rule chain in D-03 — first-match-wins; rerun verdict gates the heuristic resolution.
- The user accepts `verifier_strong_agreement` as a NAMED, MODULE-EXPORTED constant (not inline) — TRIAGE-02 demands "named", export makes the Vitest guard test cleaner.
- The user accepts D-11's cluster threshold = 5 (literal constant, exported, schema-guard-asserted).
- The user accepts D-13's `wrapPatentData` helper that REJECTS nested `</patent_data>` in input (escape or throw) — defense in depth.
- The user accepts D-07's grandfathering of `scripts/e2e-explore.mjs` (Phase 32 contract — direct `invokeClaudeP` allowed there) while restricting triage code to the wrapper-only path.
- The user accepts that the `invokeClaudePWithLedger` wrapper's CI gate is `process.env.CI === 'true'` (canonical, matches existing CI-guard tests).

</specifics>

<deferred>
## Deferred Ideas

- **Few-shot prompt fine-tuning against labeled fixture set** — TRIAGE-FT-01, explicitly deferred per REQUIREMENTS.md "Future Requirements" until 50+ triaged findings exist.
- **Multi-model cross-check for high-severity classifications** — TRIAGE-FT-02, deferred.
- **Generalizing `invokeClaudePWithLedger` for future digest / future LLM consumers** — already designed for it via the `source` field (D-06), but the actual second consumer (Phase 37 digest if any LLM use is added there) is not in this phase. Wrapper ships in this phase regardless.
- **ESLint rule extending to all of `scripts/` for non-grandfathered files** — phase intentionally narrows the rule (D-07) to triage-classifier.js + the new triage CLI; widening it requires checking each existing script for legitimate `invokeClaudeP` uses, out of scope here.

</deferred>

---

*Phase: 34-hybrid-triage-classifier*
*Context gathered: 2026-05-27*

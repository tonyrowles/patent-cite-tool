# Phase 31: LLM Exploratory Mode + Docs - Context

**Gathered:** 2026-05-18
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous, all 16 recommendations accepted)

<domain>
## Phase Boundary

Local-dev-only autonomous exploratory testing:
1. **LLM-driven scenario generation** — `npm run e2e:explore` invokes headless `claude -p` to pick a patent + selection from the existing TEST_CASES corpus, validates the selection actually appears in the spec, drives the extension, verifies via Phase 28 verifier, and logs the iteration distinguishing plugin defects from LLM hallucinations.
2. **Hard $100/month spend guardrail** — refuses to invoke `claude -p` when the ledger shows cumulative monthly spend ≥ $100; warns at ≥ $80.
3. **CI guard** — refuses to run when `process.env.CI` is truthy (exploratory mode is local-only).
4. **Docs** — `tests/e2e/README.md` is the new contributor's entry point: deterministic suite, exploratory mode, test-hook contract, adding cases, spend ledger lifecycle.

In scope:
- `scripts/e2e-explore.mjs` — driver script (claude -p invocation, picker, hallucination check, runner loop, ledger writes)
- `tests/e2e/lib/llm-ledger.js` — spend ledger reader/writer (monthly rollover schema)
- `tests/e2e/lib/llm-report.js` — append-only writer for `llm-report.json`
- `tests/e2e/lib/llm-hallucination.js` — `specText.includes(selection)` guard
- `tests/e2e/lib/error-codes.js` — add `LLM_HALLUCINATED_SELECTION` + `LLM_API_ERROR` to RPT-02
- `tests/e2e/README.md` — new docs file (~400 lines)
- `package.json` — add `e2e:explore` script
- `.gitignore` — add `tests/e2e/.llm-spend-ledger.json` (must not be checked in)

Out of scope (deferred to v3.1+):
- ANTHROPIC_API_KEY fallback when Max 5 subscription credit exhausted
- Cost-per-iteration optimization / prompt caching
- Multi-turn LLM dialogues
- Patent universe expansion beyond TEST_CASES corpus
- Slack/Discord cost alerts
</domain>

<decisions>
## Implementation Decisions

### `claude -p` driver
- **File:** `scripts/e2e-explore.mjs` invoked via `npm run e2e:explore`
- **CLI:** `claude -p --output-format json --max-turns 1` — single-turn deterministic JSON output. No multi-turn (avoids unbounded cost and non-determinism).
- **Subscription mode:** Max 5 plan; `ANTHROPIC_API_KEY` MUST NOT be set when invoking (forces use of subscription credit pool, not pay-per-token API).
- **Timeout per invocation:** 60s (typical claude -p response ~30s; 60s headroom). On timeout: classify as `LLM_API_ERROR`, log, continue to next iteration.
- **Retry policy:** 1 retry on JSON parse error or missing required fields. After retry, classify iteration as `LLM_API_ERROR`. No retry on timeout (re-invoke would burn more credit).
- **Iteration cadence:** Default 5 iterations per run; configurable via `--iterations N` flag.

### Patent + selection picker
- **Patent universe:** Existing TEST_CASES corpus (66 live cases). LLM picks an ID, we already have fixtures, no fresh Google Patents fetches.
- **LLM input (per iteration):**
  - System prompt: "You are testing a patent citation extension. Given a corpus of patent IDs, pick one and propose a selection (substring of its spec text) likely to surface an interesting parser behavior. Return strict JSON."
  - User prompt: a list of patent IDs + categories, plus the first 2 pages of spec text for ONE pre-randomized candidate (to avoid LLM having to choose from all 66).
- **LLM output schema (strict JSON):**
  ```json
  {
    "caseId": "US...-llm-001",
    "patentId": "US...",
    "selectedText": "...",
    "category": "modern-short | modern-long | claims | ...",
    "rationale": "Brief explanation of why this selection is interesting"
  }
  ```
- **Selection length constraints:** 50-300 characters; must appear verbatim in spec text (verified by hallucination guard before harness invocation).
- **Diversity:** Log each `(patentId, selectedText)` tuple to llm-report.json; future iteration: dedup within last 24h (deferred to v3.1+).

### Spend ledger
- **Path:** `tests/e2e/.llm-spend-ledger.json` — gitignored. Local-only state.
- **Schema:**
  ```json
  {
    "version": 1,
    "months": {
      "2026-05": {
        "invocations": 12,
        "total_usd": 4.50,
        "last_invocation_iso": "2026-05-18T14:33:00Z",
        "iterations": [
          {"iso": "...", "model": "claude-opus-4.7", "cost_usd": 0.42, "tokens_in": 1234, "tokens_out": 456}
        ]
      }
    }
  }
  ```
- **Monthly rollover:** Natural — new YYYY-MM key automatically picked up by `Date().toISOString().slice(0,7)`.
- **Cost tracking:** `claude -p --output-format json` returns `{"usage": {"input_tokens": N, "output_tokens": M}}` plus model ID. Multiply by pricing constants in `tests/e2e/lib/llm-pricing.js` (one constant per supported model; default to Opus 4.7 pricing).
- **Hard cap behavior:** BEFORE each invocation, check `months[currentMonth].total_usd`. If ≥ 100: exit 1 with message `"Monthly LLM spend $X >= $100. Refusing to invoke claude -p. Reset ledger or wait until next month."`
- **Warning at ≥ $80:** Print `"⚠ Monthly spend $X >= $80 — approaching cap"` and continue.
- **Reset for new month:** No manual reset needed; new month creates a new entry. To force-reset mid-month for testing: delete the file (will be recreated on next run).

### Hallucination guard
- **Where in flow:** AFTER LLM returns selection, BEFORE driving the harness. Sequence:
  1. LLM returns `{patentId, selectedText, ...}`
  2. Load patent spec text via Phase 28's `tests/e2e/lib/pdf-fetch.js` + a text-extract pass (pdfjs-dist legacy)
  3. Normalize both texts identically (collapse whitespace; per Phase 20-21 normalization)
  4. Assert `specText.includes(normalizedSelection)`. If false: classify iteration as `LLM_HALLUCINATED_SELECTION`, log, do NOT invoke harness, continue to next iteration.
- **Classification:** `LLM_HALLUCINATED_SELECTION` is a NEW RPT-02 error class — distinct from `WRONG_CITATION` (plugin produced wrong cite for valid text) and from `LLM_API_ERROR` (claude -p failed).
- **Why classify distinctly:** Phase 31 reports must distinguish plugin defects from LLM defects so a future "the LLM is bad at picking selections" trend doesn't get blamed on the plugin.

### CI guard
- **Check:** `if (process.env.CI || process.env.GITHUB_ACTIONS) { exit 1 with "exploratory mode is local-only — refusing to consume LLM credits in CI" }`
- **Where:** Top of `scripts/e2e-explore.mjs` before any other work.
- **Test:** Plan will include a sanity test that runs the script with `CI=true` and asserts non-zero exit.

### Report writer (llm-report.json)
- **Path:** `tests/e2e/artifacts/{run-id}/llm-report.json` — separate from regression `report.json` so the two domains don't entangle.
- **Schema:**
  ```json
  {
    "run_id": "...",
    "started_iso": "...",
    "finished_iso": "...",
    "iterations_total": 5,
    "summary": {
      "passed": 2,
      "wrong_citation": 1,
      "llm_hallucinated_selection": 1,
      "llm_api_error": 1,
      "total_cost_usd": 1.83
    },
    "iterations": [
      {
        "iteration_n": 1,
        "iso": "...",
        "llm_selection": {patentId, selectedText, category, rationale},
        "hallucination_check": {"passed": true, "needle_found_at": 3421},
        "citation": "1:34-46",
        "verifier_verdict": {...},
        "classification": "PASS | WRONG_CITATION | VERIFIER_DISAGREE | LLM_HALLUCINATED_SELECTION | LLM_API_ERROR",
        "cost_usd": 0.42,
        "duration_ms": 28350,
        "artifacts": ["screenshot.png", "page-snapshot.html"]
      }
    ]
  }
  ```
- **Append behavior:** Each iteration appended atomically (write whole file each time so a crash mid-iteration leaves a partial-but-valid report).

### README structure (tests/e2e/README.md)
- **Sections (~400 lines total):**
  1. **Overview** — what this directory is, the two modes (deterministic + exploratory)
  2. **Running the deterministic suite** — `npm run e2e:smoke`, `npm run e2e:regression`, fault-injection, golden baseline
  3. **Running exploratory mode locally** — `npm run e2e:explore`, prerequisites (Max 5 subscription, no API key), iteration count, ledger behavior
  4. **Test-hook contract** — `data-testid` attributes on citation UI; the `X-PCT-Test-Mode` header (Phase 30); `pct_test_*` storage keys (Phase 30)
  5. **Adding new test cases** — TEST_CASES schema, golden baseline regeneration, deferred-IDs and synthetic categories
  6. **Spend ledger** — schema, location, monthly rollover, hard/soft caps, reset procedure
  7. **Troubleshooting** — common failures (cache hit shortcuts, USPTO rate limit, Chromium install failures, claude -p auth)
- **Audience:** New contributor first (assume Playwright + GitHub Actions basics, NOT this codebase); maintainer second.
- **Format:** Markdown; code blocks for commands; tables for schema definitions.

### Claude's Discretion
- Exact prompt wording for the LLM picker
- Whether to print iteration progress to stdout vs only writing llm-report.json
- Whether to include a `--dry-run` flag (estimate cost without invoking)
- Format of the warning at $80 (color codes, blink, etc.)
- Whether to fetch full spec text per iteration vs cache the 2-page excerpt per patent in `tests/e2e/.spec-cache/`
- Exact wording in README

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `tests/e2e/lib/pdf-fetch.js` (Phase 28) — Google Patents PDF fetcher with local cache; reused for spec text extraction
- `tests/e2e/lib/pdf-verifier.js` (Phase 28) — independent verifier returns `status: 'pass' | 'disagree'`
- `tests/e2e/lib/report.js` (Phase 28) — report writer pattern; llm-report.js can mirror its structure
- `tests/e2e/lib/error-codes.js` — RPT-02 taxonomy; extend with LLM_HALLUCINATED_SELECTION + LLM_API_ERROR
- `tests/e2e/lib/run-id.js` — resolveRunId pattern; reused for llm-report path
- `tests/test-cases.js` — TEST_CASES corpus (66 live)
- `tests/e2e/lib/extension-loader.js` (Phase 26) — extension launcher
- `scripts/select-cron-cases.mjs` (Phase 29) — getLiveCases() to filter deferred/synthetic
- `tests/e2e/specs/regression.spec.js` — pattern for harness invocation + citation observation; explore.mjs may invoke Playwright programmatically via `playwright.chromium.launchPersistentContext`

### Established Patterns
- ESM JS everywhere
- Frozen const exports for taxonomies
- Append-only artifact directories under `tests/e2e/artifacts/{run-id}/`
- Strict separation of plugin defects vs test-infra defects (Phase 28's verifier independence claim)

### Integration Points
- claude CLI must be installed (developer responsibility); script checks `which claude` before first invocation
- Subscription credit pool is shared across all `claude -p` sessions on the developer's machine (a different repo's usage counts too) — the ledger is repo-local but cost is account-wide. Document this caveat in README.
- `tests/e2e/.llm-spend-ledger.json` must be gitignored (committed values would publicly leak the developer's monthly spend pattern)

</code_context>

<specifics>
## Specific Ideas
- claude-opus-4.7 pricing (per Anthropic 2026): $15/Mtok input, $75/Mtok output — use as default
- "Interesting selection" rationale should bias the LLM toward (a) text spanning column breaks, (b) text with hyphens at line ends, (c) text near patent claim boundaries — known stress points from Phase 20-23 work
- The `LLM_API_ERROR` class might also catch `claude` CLI not installed; classify same way
- llm-report.json's summary block should include a `total_cost_usd` even on partial runs (so killed runs still document cost)
- README's troubleshooting section should explicitly note "if you see `MAX_5_SUBSCRIPTION_EXHAUSTED` or similar from claude -p, exploratory mode is unavailable until next billing cycle"

</specifics>

<deferred>
## Deferred Ideas
- ANTHROPIC_API_KEY fallback (pay-per-token) when Max 5 exhausted — v3.1+
- Prompt caching to reduce per-iteration cost — v3.1+
- Multi-turn iterations (LLM observes its previous result and proposes next) — v3.1+
- Patent universe expansion beyond TEST_CASES corpus — v3.1+
- Slack/Discord cost alerts — v3.1+
- Diversity dedup within last 24h — v3.1+
- LLM model selection (Sonnet vs Opus) — v3.1+
- CI-friendly mock LLM mode for testing the harness without invoking real LLM — v3.1+
</deferred>

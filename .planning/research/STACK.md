# Stack Research — v4.3 Auto-Fix Loop Closure + Capability Expansion

**Domain:** Subsequent-milestone capability expansion on a v4.0–v4.2 self-healing test-suite stack
**Researched:** 2026-06-08
**Scope:** NEW work for v4.3 ONLY — the v4.0/v4.1/v4.2 shipped surface is not re-researched
**Overall confidence:** HIGH (Context7 + official `code.claude.com` docs + GitHub releases verified; only the in-codebase wiring is novel)

---

## Bottom line up front

**Zero new npm dependencies is achievable for ALL seven v4.3 work items.** Every capability extends existing primitives (`tests/e2e/lib/llm-driver.js`, `fix-prompt-builder.js`, `triage-classifier.js`, `llm-ledger.js`, `scripts/a-b-winner.mjs`, `scripts/auto-fix.mjs`, `tests/e2e/scripts/inject-defect.mjs`) using Node 22 LTS built-ins and the already-pinned `@anthropic-ai/sdk@0.100.1` + `claude` (Claude Code) CLI surface. Two **flag-name correctness risks** must be communicated to requirements scoping:

1. The official CLI flag is **`--allowedTools`** (camelCase) — NOT `--allowed-tools`. The v4.3 carry-over note in STATE.md uses the kebab-case form; that string would silently NOT do what the writer intends.
2. `--allowedTools` and `--tools` have **different semantics** — `--allowedTools` grants tools without prompting (permission-mode), while `--tools` actively RESTRICTS which built-in tools are even available. For a cost-discipline gate that replaces `--max-turns 1`, the correct flag is `--tools "Read,Edit,Glob,Grep"` (or `--tools "Read,Glob,Grep"` for strict read-only), NOT `--allowedTools`.

This is a load-bearing distinction for the entire `--max-turns 5` relaxation work.

---

## Pinned Versions vs. Current Latest (verified 2026-06-08)

| Dependency | Pinned | Current Latest | Status | Action |
|------------|--------|----------------|--------|--------|
| `@anthropic-ai/sdk` | `0.100.1` EXACT | `0.102.0` (released 2026-06-06) | Behind by 2 patches; **NO breaking changes** for v4.3 surfaces | **HOLD at 0.100.1** — supply-chain lockfile pin + ESLint guard are load-bearing. Bump only if a v4.3 capability needs a new SDK feature (none identified). |
| `peter-evans/create-pull-request` | `@v8` floating | `v8.1.1` (released 2025-04-10) | Current major; minor versions auto-tracked | **HOLD at `@v8`** — no v4.3 work touches the action invocations. |
| `@playwright/test` | `1.60.0` EXACT | `1.60.0` (last published ~30 days ago) | Current | **HOLD** — v4.3 adds no new browser flows. |
| `pdfjs-dist` | `^5.5.207` caret + `verifierDeps.pdfjs-dist: "5.5.207"` EXACT pin | `5.7.284` | Behind by 2 minor; frame-shift workflow manages bumps | **HOLD** — v4.3 does NOT touch pdfjs. |
| `vitest` | `^3.0.0` caret | `5.0.x` stable (with `4.1.x` security-backports) | Behind major(s); v3.x still receives patches per Vitest team | **HOLD on `^3.0.0`** — see "Vitest version sensitivity" below; a major bump is out of scope for v4.3. |
| `eslint` | `10.4.0` EXACT | (not researched — no v4.3 ESLint config changes) | n/a for v4.3 | **HOLD** |
| `esbuild` | `^0.27.3` caret | n/a for v4.3 | n/a for v4.3 | **HOLD** |
| `web-ext` | npx-invoked, no pin | `10.1.0` | n/a for v4.3 | **HOLD** |

**Source confidence:**
- `@anthropic-ai/sdk` 0.102.0 + changelog verified via GitHub releases page (HIGH)
- `peter-evans/create-pull-request@v8.1.1` verified via GitHub releases page (HIGH)
- Vitest 5.0/4.1/3.x status verified via Vitest releases page (MEDIUM — WebSearch summary)
- `claude` CLI flags verified directly against `https://code.claude.com/docs/en/cli-reference` (HIGH)

---

## v4.3 Capability → Stack Mapping

The seven v4.3 capabilities are listed below in the same order as the carry-over note in `STATE.md`, with the stack additions/changes (if any) for each.

### 1. Diagnostic-injection mutator extension (carry-over A)

**File touched:** `tests/e2e/scripts/inject-defect.mjs` (extend; do NOT create a new file)

**New stack surface:** **NONE.** The mutator already uses Node 22 ESM built-ins (`node:fs`, `node:path`, `node:child_process`). Diagnostic-content injection is pure string composition — no new libraries.

**Specifically:**
- For `GOOGLE_DOM_DRIFT` synthetic bodies: mirror the `data-testid` + ARIA-role selector patterns from `tests/e2e/lib/google-patents-page.js` (already in tree). Read that file at mutator runtime and embed a small, deterministic excerpt verbatim into the synthetic issue body's `<!-- dom_snippet: ... -->` HTML comment. Pure file-read + template substitution — no DOM library.
- For `WRONG_CITATION` synthetic bodies: mirror the Verifier Disagreement section shape from `lib/issue-payload-builder.js` (already in tree, Phase 35). Re-use the existing helpers (e.g. import `assembleVerifierDisagreementSection` if exported; if not, the section is ~12 lines of pure markdown — duplicate inline with a `// Source: issue-payload-builder.js line N` comment for traceability).

**Deterministic-seed primitive:** the existing v2 fingerprint pattern `<!-- fp: <12-hex> -->` from Phase 59. Re-use `crypto.createHash('sha256')` from `node:crypto` — already in scope; no new dep.

**Vitest pin:** existing pattern. New test in `tests/unit/inject-defect.test.js` (or extend Phase 59's test file) asserting same-seed → byte-identical synthetic body. No new test runner needed.

**Do NOT add:**
- `faker` / `chance` — random data libraries. We need DETERMINISTIC injection (same seed → same bytes). Random fixture generators are the wrong abstraction.
- `cheerio` / `jsdom` — DOM parsing. We're WRITING a snippet, not parsing one.
- `mustache` / `handlebars` — template engines. Template literals + small helper functions handle this in ~20 LOC.

**Confidence:** HIGH

---

### 2. `--max-turns` relaxation + `--allowedTools` addition (carry-over B)

**Files touched:**
- `tests/e2e/lib/llm-driver.js` line 94 (`'--max-turns', '1'` → `'--max-turns', '5'`) + add `--allowedTools` flag (see below for the correct flag name)
- `tests/e2e/lib/llm-driver.js` — also update the comment block at lines 31-37 (Pitfall 2 reference to `--max-turns 1`)
- `tests/unit/llm-driver.test.js` — flip the `--max-turns 1` regression pin to `--max-turns 5` + `--tools/--allowedTools` pin
- (SDK path) `tests/e2e/lib/llm-driver.js` `invokeAnthropicSdkWithLedger` — review whether the SDK call needs a parallel adjustment for code-fix prompts that must read source files (research finding below)

**Critical flag-name correctness finding (HIGH confidence — direct from official docs):**

The official `claude` CLI documentation lists the following flags for **print mode** (`-p`):

| Flag | Semantics | Use for v4.3 |
|------|-----------|--------------|
| `--max-turns N` | "Limit the number of agentic turns. Exits with an error when the limit is reached. No limit by default." | Set to **`5`** per the v4.3 carry-over plan. Replaces the current `--max-turns 1`. |
| `--allowedTools "Read" "Grep" "Glob"` | **PERMISSION grant** — "Tools that execute without prompting for permission. See permission rule syntax for pattern matching. **To restrict which tools are available, use `--tools` instead.**" | Wrong flag for cost-discipline restriction. Adds permission allowlist but does NOT prevent Edit/Bash if Claude's default tool palette already includes them. |
| `--tools "Read,Grep,Glob"` | **AVAILABILITY restriction** — "Restrict which built-in tools Claude can use. Use `""` to disable all, `"default"` for all, or tool names like `"Bash,Edit,Read"`." | **THIS is the correct flag** for the v4.3 cost-discipline gate — actually prevents Claude from invoking Edit/Bash. |
| `--max-budget-usd N.NN` | "Maximum dollar amount to spend on API calls before stopping (print mode only)" | **NEW v4.3 OPPORTUNITY** — Hard dollar cap as defense-in-depth on top of the per-day/per-issue/per-PR ledger caps. Recommend adding `--max-budget-usd 0.50` (or whatever PR-cap divided by typical retries equals) to every `invokeClaudeP` invocation as a belt-and-suspenders measure. |
| `--exclude-dynamic-system-prompt-sections` | "Move per-machine sections from the system prompt (working directory, environment info, memory paths, git-repo flag) into the first user message. Improves prompt-cache reuse across different users and machines running the same task. Only applies with the default system prompt; ignored when `--system-prompt` or `--system-prompt-file` is set." | **Not applicable** to `invokeClaudeP` (we always pass `--system-prompt`). Safe to ignore. |
| `--permission-mode auto` (or `dontAsk`) | Skip permission prompts in non-interactive mode | **Already implicit** in `-p` mode for the tools Claude has by default; not needed if `--tools` already restricts the palette to safe-by-construction Read/Glob/Grep. |

**Recommended argv shape for `invokeClaudeP` in v4.3:**

```javascript
const args = [
  '-p',
  '--output-format', 'json',
  '--max-turns', '5',                          // was '1'
  '--tools', 'Read,Glob,Grep',                 // NEW — restricts palette (NOT --allowedTools)
  '--max-budget-usd', '0.50',                  // NEW — hard dollar cap (defense-in-depth)
  '--system-prompt', systemPrompt,
  userPrompt,
];
```

**Why `--tools` not `--allowedTools`:**
- `--allowedTools` grants permission to USE a tool without prompting — it does NOT remove tools from the model's context. If Claude's default palette includes `Edit`, passing `--allowedTools "Read"` would still let Edit fire if Claude decides to call it (the call just prompts for permission, which in `-p` mode means failure). Worse, with `--permission-mode auto` or similar, the Edit call would silently execute.
- `--tools "Read,Glob,Grep"` actually removes Edit/Bash from the tool palette Claude sees — the model cannot call what it does not know exists. This is the correct construction for a cost-discipline gate.

**Test pin update:** flip every test currently asserting `'--max-turns', '1'` to assert the new argv tuple. Search count: 1 production site (`llm-driver.js:94`) + N test sites (existing pin per Phase 31 / Phase 42 line numbers in `tests/unit/llm-driver.test.js`).

**Subscription transport (`invokeClaudePWithLedger`):** the `claude -p` subprocess gets the new args. No SDK changes needed for the subscription transport.

**SDK transport (`invokeAnthropicSdkWithLedger`):** the Anthropic Messages API does NOT have a `--tools`/`--allowedTools` equivalent at the messages.create level for "restrict which tools Claude can call" — tools are explicitly passed via the `tools` parameter in the API. The current SDK call sites in `llm-driver.js` do NOT pass `tools` (the fix-scaffold prompts instruct Claude to OUTPUT a unified diff between fences, not to USE tools). **So the SDK path needs NO change for `--max-turns` parity** — the SDK is a single-turn API call by construction (one `messages.create` → one response). The `--max-turns` flag exists because the CLI agent loop can multi-turn; the SDK doesn't have a tool-use loop here. **The `--max-turns 5` change applies ONLY to the subscription transport.**

This is a meaningful constraint: the SDK path keeps its current "one-shot" behavior. Subscription path now allows up to 5 turns where Claude can call Read/Glob/Grep before producing the final diff. **This intentional asymmetry should be documented in the v4.3 implementation note.**

**Do NOT add:**
- `@anthropic-ai/claude-code` as an npm dep — the `claude` CLI is invoked as a subprocess; bundling it as a npm dep would change the auth model (subscription credit → API key) and break the v3.1 Pitfall 1 mitigation.
- Any "agent framework" wrapper (LangChain, LlamaIndex, Anthropic Agent SDK, etc.) — the dispatcher in `auto-fix.mjs` IS the agent framework for this project. Adding a generic wrapper would duplicate the cost-discipline gates already in `llm-driver.js`.

**Confidence:** HIGH on the CLI flag semantics (verified against `https://code.claude.com/docs/en/cli-reference`). HIGH on the SDK-vs-subscription asymmetry.

---

### 3. Forensic-ledger schema hardening — require `source` + `transport` on all entries (carry-over C)

**File touched:** `tests/e2e/lib/llm-ledger.js` — extend `appendLedgerEntry` to enforce field presence (additive validation only — function body changes locked under additive-only invariant from v4.2 D-18 line 67 of STATE.md decisions)

**New stack surface:** **NONE.** Pure field validation in existing function. Two implementation approaches:

**Option A — strict mode at write time (recommended):**
```javascript
// Add at the top of appendLedgerEntry:
if (entry && typeof entry === 'object') {
  if (typeof entry.source !== 'string' || entry.source.length === 0) {
    throw new Error(`appendLedgerEntry: entry.source is required (got: ${entry.source}); ` +
      `prevents auxiliary-leak orphan entries. See v4.3 carry-over C.`);
  }
  if (typeof entry.transport !== 'string' ||
      (entry.transport !== 'subscription' && entry.transport !== 'sdk')) {
    throw new Error(`appendLedgerEntry: entry.transport must be 'subscription' or 'sdk' ` +
      `(got: ${entry.transport}); prevents auxiliary-leak orphan entries.`);
  }
}
```

**Option B — soft warn + auto-populate from a known-default (NOT recommended):** would silently mask leaks rather than surface them; rejects the entire point of the hardening.

**Caveat:** the change MUST be co-shipped with a sweep of every `appendLedgerEntry` call site (9 currently) to ensure `source` + `transport` are always provided. Two call sites in `llm-driver.js` (subscription line 421, SDK lines 588 + 620) already provide both; the 7 call sites in `auto-fix.mjs` need to be audited. The v4.3 carry-over note in STATE.md cites 3 orphan `claude-opus-4-7[1m]` entries 2026-06-08 — these are the symptom that the hardening directly closes.

**Vitest defense:** add a unit test (existing pattern in `tests/unit/llm-ledger.test.js`) asserting `appendLedgerEntry(LEDGER_PATH, {iso, model, cost_usd: 0})` throws when `source`/`transport` are missing. Re-pin tests that previously called `appendLedgerEntry` without `source` to include the field.

**Cross-check against memory file:** `project_auto_fix_ledger_leak_vector.md` flags `scripts/auto-fix.mjs` as a leak vector that `invokeAnthropicSdkWithLedger`'s PRE-02 guard does NOT cover. The Option A throw at `appendLedgerEntry` time IS the chokepoint fix — closes the leak surface for ALL future call sites without needing to track each one.

**Do NOT add:**
- A JSON Schema library (`ajv`, `zod`, `jsonschema`) — the validation surface is 2 fields. A 6-line if-block is correct.
- A logging framework (`winston`, `pino`) — `console.error` + throw is the correct surfacing for a write-time invariant violation.

**Confidence:** HIGH

---

### 4. A/B winner exit from abstention mode (`scripts/a-b-winner.mjs`)

**File touched:** `scripts/a-b-winner.mjs` — read `outcome` (or `pr_merged`) field that now populates ≥20 entries per ERROR_CLASS per model arm via the Phase 56 (v4.2) ledger-schema extension.

**New stack surface:** **NONE.** The script already imports `node:fs` only and is locked at zero-deps per D-21 in its own file header. `computePerClassPerArm` already probes for `outcome:'pass'|'fail'`, `success:bool`, `passed:bool`, `pr_merged:bool` — the field-shape forward-compat work was done in Phase 54.

**v4.3 wiring is the remaining gap:** the script exits abstention automatically once both `errorClass` (already wired in v4.2) AND an outcome field accumulate to threshold. The work is to **validate that real triage traffic populates the outcome field** — `scripts/auto-fix-promote.mjs` writes `outcome:'pass'` / `'fail'` per Phase 58. The integration test:

1. Verify the auto-promote outcome ledger entry is being written (event-sourced from `auto-fix-promote.mjs`)
2. Confirm `computePerClassPerArm` sees `outcome:'pass'|'fail'` not the others (the `outcome` probe is FIRST in priority — line 232-233 of `a-b-winner.mjs`)
3. Test threshold transition with a synthetic 20+entry fixture

**Threshold design knob (open for requirements scoping):** `N_PER_ARM_REQUIRED = 20` (current) — this was a D-16 lock for v4.1. v4.3 has the opportunity to revisit if the live ledger accumulates faster or slower than expected. **Research recommendation: keep at 20** until v4.3 has at least one full week of post-deployment ledger entries to baseline against; defer any threshold tuning to v4.4.

**Do NOT add:**
- A statistics library (`simple-statistics`, `mathjs`) — pass-rate calculation is `pass / n`. The script already does this in 4 lines.
- A binomial-test / chi-squared library (`jstat`, `simple-statistics`) — for a 20-sample threshold the `delta < 0.05` heuristic is operationally indistinguishable from a statistical test; adding inferential statistics would be theater.
- A data-frame library (`dataframe-js`, `arquero`) — the grouping is a single `for` loop over ledger entries.

**Confidence:** HIGH

---

### 5. Expanded fix scaffolds (new `ERROR_CLASS`es beyond the 5)

**File touched:** `tests/e2e/lib/fix-prompt-builder.js` — extend `PROMPT_SCAFFOLDS` registry; co-extend `tests/e2e/lib/llm-router.js` `MODEL_ROUTES` if any new class wants opus-routing.

**New stack surface:** **NONE.** The `buildScaffoldSystemPrompt` helper (Phase 45) already factors the 5-section template; adding a 6th/7th class is ~30 LOC per class plus a 1-line registry entry plus a Vitest mutation-guard regression.

**Candidate new classes (deferred to requirements scoping for selection — research provides the menu):**

| Candidate class | Symptom | Editable surface | Co-design need |
|-----------------|---------|------------------|----------------|
| `PDF_PARSE_FAILED` | PDF.js threw during text extraction; verifier could not get text | `tests/e2e/lib/pdf-verifier.js` (verifier path) OR `src/offscreen/` (extension path, NOT auto-fixable without expanding diff-guard) | Yes — needs diagnostic capture of the PDF page-index + error |
| `CACHE_INVALIDATION_BUG` | Citation pipeline returns stale result because `CACHE_VERSION` did not bump | `src/shared/constants.js` `CACHE_VERSION` + invalidation logic | Yes — needs cache-state diagnostic in issue body |
| `FALLBACK_CHAIN_BROKEN` | All 3 fallback points triggered but produced no citation | `src/shared/uspto-fallback.js` + `src/cf-worker/index.js` | Maybe — overlaps with `WORKER_FALLBACK_FAILED` |
| `OCR_NORMALIZATION_GAP` | Tier 0b normalization pairs incomplete for a new PDF pattern | `src/shared/matching.js` `normalizeOcr` 5-pair list | Yes — needs the offending text in the issue body |
| `SELECTION_ANCHOR_LOST` | Selection captured but DOM mutation between mouseup and verifier read | `tests/e2e/lib/select-text.js` + harness teardown | Yes — needs DOM snapshot diff |

**Research recommendation:** ship at least one new class in v4.3 (`PDF_PARSE_FAILED` is the highest-frequency real failure mode in the v3.0/v3.1 nightly logs based on the Context note "Tier 0/1/2/3/4/5 matching → ~2-5% of patents lack text layers"). The other 4 are good v4.4 candidates.

**Co-design with diagnostic-injection mutator (capability 1):** any new scaffold MUST have a corresponding synthetic-body injection capability in `inject-defect.mjs` for SWEEP-tier UAT coverage; otherwise the v4.2 SWEEP-03 architectural blocker recurs.

**Do NOT add:**
- A prompt-templating engine (`langchain/prompts`, `prompt-toolkit`) — `buildScaffoldSystemPrompt` IS the template engine for this project. Replacing it would invalidate the byte-stable 6-forbidden-paths invariant pinned by Vitest.
- A taxonomy library / error-classes enum library — the existing `tests/e2e/lib/error-codes.js` ERROR_CLASS_SET is the single source of truth. Any new class adds 1 line there + 1 line in `PROMPT_SCAFFOLDS`.

**Confidence:** HIGH on the mechanism; MEDIUM on the specific class choice (depends on operator priorities for v4.3 vs v4.4 scope split).

---

### 6. Better heuristic-first triage coverage (6/8 → 8/8 ERROR_CLASSes)

**File touched:** `tests/e2e/lib/triage-classifier.js` — extend the D-03 rule chain in `runTriage` to resolve the 2 currently-LLM-routed classes heuristically. Per the v3.1 description, the 2 ambiguous classes that route to LLM are likely `VERIFIER_DISAGREE` (Tier C agreement — Pitfall 2 in 34-RESEARCH) and an unspecified second. Auditing the rule chain in lines 433-504 shows:

- Rule 1: FLAKE short-circuit (heuristic — 1 class)
- Rule 2: CONFIRMED + Tier A/B + `{WRONG_CITATION, VERIFIER_DISAGREE}` (heuristic — 2 classes)
- Rule 3: NOT_REPLAYABLE + `{LLM_HALLUCINATED_SELECTION, LLM_API_ERROR, HARNESS_ERROR, PASS}` (heuristic — 4 classes)
- Rule 4: ambiguous → LLM (2 remaining classes — Tier C CONFIRMED + WORKER_FALLBACK_FAILED + GOOGLE_DOM_DRIFT pre-cluster)

**The 6/8 split likely counts ERROR_CLASS_SET cardinality rather than rule cardinality.** Confirming this would need a re-audit during requirements scoping. The 2 LLM-routed classes appear to be:
1. `WORKER_FALLBACK_FAILED` — needs the HTTP-status + MIME-type pattern in the verifier verdict to be heuristically resolvable; if the verifier verdict carries `worker_status_code` and `worker_response_mime` fields, a pure-function rule chain can resolve this without LLM.
2. `GOOGLE_DOM_DRIFT` — needs the pre-flight DOM probe failure signature in the rerun report; if the rerun-validator emits a `dom_probe_failed: true` field, this is heuristically resolvable.

**Stack additions: NONE.** Both extensions are pure rule-chain additions to `runTriage` (~10-20 LOC each). The verifier verdict shape and rerun report shape are already in tree; the question is whether the diagnostic fields ALREADY exist (re-research at planning time).

**Caveat:** the Vitest pin `triage-01 invariant preserved` (line 382-383 of `triage-classifier.js`) — heuristically-resolved paths MUST NOT invoke `invokeLlm` (callCount === 0). Adding Rules 5+6 must preserve this invariant: same `for...continue` pattern as Rules 1-3, never falling through to the `ambiguous.push(iter)` line.

**Do NOT add:**
- A rules engine (`json-rules-engine`, `nools`, `node-rules`) — the rule chain is 4 sequential `if-continue` blocks. A rules engine would obscure the locked D-03 ordering invariant.
- A decision-tree / decision-table library — same reason.
- An NLP library for error-message classification (`compromise`, `natural`) — the error patterns are STRUCTURED fields, not free-text. String comparison handles this.

**Confidence:** MEDIUM — the heuristics-extension is mechanically simple, but the audit of which fields are available in the verifier/rerun verdict shapes needs requirements-scoping confirmation against live report.json files.

---

### 7. Prompt-iteration loop (failed fix → analyze → rewrite scaffold → retry)

**File touched:** depends on scope decision (full-auto vs capture-and-surface-for-human-review). Two viable shapes:

**Shape A — capture-and-surface (recommended for v4.3, defer full-auto to v4.4):**

When `auto-fix.mjs` Step 7 dispatches to a scaffold and the resulting fix attempt FAILS (apply-check, diff-guard, verifier-gate), write a NEW ledger entry with `source: 'prompt-iter-candidate'`, `outcome: 'fail'`, AND the FULL system prompt + user prompt + Claude response + failure reason. A new helper script `scripts/prompt-iter-review.mjs` reads these entries and emits a weekly markdown digest (extends `scripts/weekly-digest.mjs` Auto-Fix Pipeline section) listing the top failed scaffolds + their failure modes. Human reads, hand-edits `fix-prompt-builder.js`, ships.

This is **observable infrastructure** — the loop is closed manually but the data is captured automatically.

Stack additions: NONE. Pure ledger-entry extension + new script in the existing `scripts/*.mjs` pattern.

**Shape B — full-auto rewrite (NOT recommended for v4.3):**

`auto-fix.mjs` Step N would invoke a NEW SDK call (sonnet or opus) with a meta-prompt: "Here is the scaffold that failed, here is the failure reason, here is the original issue body — propose a rewritten scaffold." Then apply the rewrite to `fix-prompt-builder.js`, file a PR.

Problems:
- Self-modifying prompts is a trust boundary violation — touches `fix-prompt-builder.js` which is currently a CODEOWNERS-pinned + Vitest-pinned + ESLint-D-04-purity-pinned file. Any auto-modification of this file invalidates the byte-stability invariants on the 5 existing scaffolds.
- Failure-attribution becomes ambiguous: did the LATEST iteration's fix succeed because of the prompt rewrite, or in spite of it?
- Cost compounds: every failed fix triggers a meta-LLM call (sonnet ~$0.02-0.05) on top of the original fix call.

**Recommendation: ship Shape A in v4.3, hold Shape B for v4.4 OR explicitly out-of-scope.**

**Stack additions for Shape A: NONE.** Reuses:
- `appendLedgerEntry` with the new `source: 'prompt-iter-candidate'` value (compatible with capability 3's `source` requirement)
- The Phase 37 weekly-digest scaffolding (`scripts/weekly-digest.mjs`)
- The Phase 55 `renderAutoFixPipelineSection` markdown renderer (extend with a 5-line summary block)

**Do NOT add (regardless of shape):**
- An LLM evaluation / observability platform (`Helicone`, `LangSmith`, `Promptfoo`, `Weave`) — these are full-fat external services. The ledger + weekly-digest IS the observability stack for this project.
- A prompt-versioning library (`promptlayer`, `humanloop`) — git history of `fix-prompt-builder.js` is the prompt-version system.
- A retry/circuit-breaker library (`p-retry`, `cockatiel`, `opossum`) — the existing `fix_attempts` cap of 3 in `auto-fix.mjs` (per Phase 42 AUTOFIX-05) is the retry policy.

**Confidence:** HIGH on Shape A mechanism + ZERO-deps; MEDIUM on the Shape A vs Shape B scope decision (depends on operator risk tolerance and v4.3 phase budget per PROJECT.md note "Scope note: broader than v4.2 (which shipped 5 phases in ~5 days). Research convergence will likely propose 7–9 phases. If too big, Prompt-iter loop or scaffold expansion can be deferred to v4.4").

---

## Vitest version sensitivity

**Status:** Vitest 5.0 is the current stable (released by mid-2026), Vitest 4.1 receives security backports, Vitest 3.x receives important fixes per Vitest team policy. The patent-cite-tool is on `^3.0.0` (caret pin).

**Risk for v4.3:** The seven v4.3 capabilities only ADD tests using patterns already established in the existing 1252-test suite — `vi.mock`, `vi.fn`, `vi.useFakeTimers`, `describe` / `it` / `expect`, `test.skip`. None of these surfaces have breaking changes between 3.x → 5.x.

**Test patterns that v4.3 will rely on:**

| Pattern | First introduced (phase) | v4.3 use |
|---------|--------------------------|----------|
| `vi.mock('node:fs')` | Phase 33 | Ledger-leak hardening tests |
| `vi.useFakeTimers({ now: ... })` | Phase 45 | classifyRerunOutcomes deterministic tests |
| `expect(...).toThrow(/regex/)` | Phase 39 | Ledger schema-hardening throw assertions |
| Source-grep static tests (read `.js` file, regex-match) | Phase 40 | `--max-turns 5` + `--tools` arg pin |
| Fixture-injection deterministic tests | Phase 59 | Mutator extension same-seed pins |

**Recommendation: HOLD on `^3.0.0`.** A major bump to 4.x / 5.x is OUT OF SCOPE for v4.3. The `check-deps-and-pr.mjs` watchlist handles bumps via the `auto-fix:major-bump` review path; vitest is on that watchlist and will surface via the weekly dep-update PR when an operator decides to invest the migration effort. Doing this DURING v4.3 would increase change risk on a milestone whose own scope is already at the upper edge of feasibility.

**Confidence:** HIGH on the pin-hold recommendation; MEDIUM on the exact 3.x → 5.x migration cost (depends on which 3.x patches are in lockfile).

---

## Playwright version sensitivity

**Status:** `@playwright/test@1.60.0` exact pin. Current latest is `1.60.0` (i.e., no upgrade pending). No v4.3 capability touches Playwright specs or page lifecycle.

**Recommendation: HOLD.** No upgrade required, no risk.

**Confidence:** HIGH

---

## `peter-evans/create-pull-request@v8` version sensitivity

**Status:** Pinned at `@v8` floating tag, currently resolving to `v8.1.1` (released 2025-04-10). Used in three workflows: `v40-auto-fix.yml`, `v40-auto-promote.yml`, `v40-deps-update.yml`.

**v4.3 risk surfaces:**

1. **Capability 1 (diagnostic-injection mutator):** does NOT use `create-pull-request` — the mutator creates ISSUES via `gh` CLI, not PRs.
2. **Capability 4 (A/B winner exit):** the script writes a markdown table to stdout; it does NOT open a PR. The weekly-digest workflow picks up the output. No `create-pull-request` interaction.
3. **Capability 7 (prompt-iter loop, Shape A):** the candidate-capture is a ledger entry + weekly-digest extension. No new PRs.

**No v4.3 work touches `peter-evans/create-pull-request` invocations.** The `@v8` floating tag continues to track patches automatically.

**Recommendation: HOLD at `@v8` floating.** The 422 eventual-consistency retry fix in v8.1.1 (April 2025) is unambiguously beneficial — no downgrade needed.

**Confidence:** HIGH

---

## @anthropic-ai/sdk version sensitivity

**Status:** `0.100.1` EXACT (no caret) pinned. Current latest is `0.102.0` (released 2026-06-06, 2 days before this research). Patch versions 0.100.1 → 0.102.0 contain:

- v0.100.1 (2026-05-29) — `encrypted_content` carried on beta compaction blocks (bugfix; doesn't affect us)
- v0.101.0 (2026-06-05) — middleware support added; request-timeout-applies-to-inner-fetch fix; JSON-scientific-notation parse fix; `stop_details` on `message_delta` (additive features; doesn't affect us)
- v0.102.0 (2026-06-06) — middleware runs before request signing (bugfix; doesn't affect us)

**Breaking changes:** NONE in this version range (verified against GitHub releases).

**Deprecations affecting v4.3:** Claude Opus 4.1 marked deprecated in v0.101.0. The project uses `claude-opus-4-7` (per `llm-router.js` MODEL_ROUTES from Phase 54), NOT Opus 4.1. No impact.

**v4.3 surfaces touching the SDK:**
- Capability 2 (`--max-turns` relaxation): subscription transport only; SDK path unchanged.
- Capability 3 (ledger schema hardening): the 2 SDK-path `appendLedgerEntry` calls already provide `source` + `transport`. Hardening will REVEAL any missing fields at first SDK call after deploy — no functional change to the SDK call itself.

**Recommendation: HOLD at `0.100.1` EXACT pin.** Three reasons:

1. The ESLint single-entry-point guard + lockfile EXACT pin + `verifierDeps`-style pin are layered supply-chain defenses. Bumping the pin is a separate operator-gated decision that should go through `check-deps-and-pr.mjs`'s `auto-fix:sdk-bump` review path.
2. No v4.3 capability requires a feature only in 0.101+ (middleware is for production observability platforms; we don't use one).
3. Holding the pin keeps v4.3's risk surface OFF the dependency-pin trust boundary, which is the most expensive boundary to flip-flop on.

**Confidence:** HIGH

---

## Cross-cutting: Node 22 built-ins coverage check

The seven v4.3 capabilities collectively touch these Node built-ins (all already in use across the codebase):

| Module | Used for | v4.3 new use? |
|--------|----------|---------------|
| `node:fs` (sync + promises) | All file IO | Yes (capabilities 1, 3, 4, 7) — pattern unchanged |
| `node:path` | Path resolution | Yes (capability 1) — pattern unchanged |
| `node:child_process` (`spawn`, `spawnSync`) | `claude -p` subprocess, `gh` CLI calls | Yes (capability 2) — `spawn` argv extended |
| `node:crypto` (`createHash`) | Fingerprinting | Yes (capability 1) — pattern unchanged |
| `node:url` (`fileURLToPath`) | ESM `__dirname` shim | Yes (capabilities 3, 4) — pattern unchanged |
| `node:util` (`promisify`, `inspect`) | n/a for v4.3 | No |
| `node:os` | n/a for v4.3 | No |
| `node:worker_threads` | n/a for v4.3 | No |

All required built-ins are stable in Node 22 LTS. No experimental flags needed.

**Confidence:** HIGH

---

## Explicit "DO NOT add" list (zero-deps streak defense)

The v4.3 work surfaces are common attractors for new dependencies. Each row below explains the dep, why it would NOT solve the v4.3 problem, and what to use instead.

| Tempting dep | Where someone might want it | Why NOT | Use instead |
|--------------|-----------------------------|---------|-------------|
| `@anthropic-ai/claude-code` (npm) | "Use the official SDK for claude code" | Bundling changes the auth model (subscription → API key) and breaks v3.1 Pitfall 1 mitigation. The CLI IS the boundary. | `spawn('claude', args, env)` — existing pattern in `llm-driver.js` |
| `langchain` / `llamaindex` / `Anthropic Agent SDK` | "We need an agent framework" | The dispatcher in `auto-fix.mjs` IS the framework. Generic wrappers duplicate cost-discipline gates already in `llm-driver.js`. | The existing `invokeClaudePWithLedger` + `invokeAnthropicSdkWithLedger` wrappers |
| `stryker-mutator` / `fast-check` / `schemath` | "We need mutation testing for the fixture-mutator" | Mutation-testing frameworks mutate code AST, not data fixtures. The v4.3 mutator needs DETERMINISTIC fixture injection (same seed → same bytes), not random property-based testing. | `crypto.createHash('sha256')` + deterministic template substitution (already in tree) |
| `ajv` / `zod` / `jsonschema` | "We need to validate ledger schema additions" | The schema-hardening surface is 2 fields with 2 types. A 6-line if-block in `appendLedgerEntry` is correct; a schema library would obscure the load-bearing invariant. | Plain `typeof` + `throw new Error` (existing pattern in 9 other validators) |
| `cheerio` / `jsdom` / `linkedom` | "We need DOM parsing for GOOGLE_DOM_DRIFT mutator" | The mutator WRITES a snippet, not parses one. Real DOM-drift fixes use Playwright in tests. | Template string with `data-testid` literal + Playwright selectors (existing pattern in `google-patents-page.js`) |
| `mustache` / `handlebars` / `eta` / `nunjucks` | "We need a template engine for synthetic issue bodies" | Template literals + a 20-LOC helper handle this. Adding a template engine is a security boundary (template injection). | Template literals + `String.raw` + escape helpers (existing pattern in `issue-payload-builder.js`) |
| `faker` / `chance` / `casual` | "We need fake data for synthetic issues" | Fake-data libraries are non-deterministic by design. v4.3 mutator needs DETERMINISTIC injection. | Constant strings + `crypto.createHash` seed (existing pattern in `inject-defect.mjs` v2 markers) |
| `simple-statistics` / `mathjs` / `jstat` | "We need statistical tests for A/B winner" | At N=20 samples per arm, `delta < 0.05` is operationally equivalent to a t-test. Adding inferential stats would be theater. | `pass / n` calculation (existing in `a-b-winner.mjs` line 314) |
| `dataframe-js` / `arquero` / `tinyqueue` | "We need to group/aggregate ledger entries" | The grouping is a single `for` loop. Data-frame libraries are a different abstraction tier than this script needs. | Plain `for...of` + `Map` / `Object` (existing pattern in `phaseTotal`, `dayTotal`, `prTotal`, etc.) |
| `winston` / `pino` / `bunyan` | "We need structured logging for the prompt-iter loop" | The ledger JSON file IS the structured log for this project. Adding a logger creates a second source of truth. | `appendLedgerEntry` with new `source: 'prompt-iter-candidate'` (capability 7 Shape A) |
| `helicone` / `langsmith` / `promptfoo` / `weave` | "We need LLM observability for prompt iteration" | These are external SaaS observability platforms. The ledger + weekly digest IS the observability stack. Adding one would split the data trail. | Extend `renderAutoFixPipelineSection` in `weekly-digest.mjs` (existing pattern from Phase 55) |
| `promptlayer` / `humanloop` | "We need prompt versioning" | Git history of `fix-prompt-builder.js` is the prompt-version system. Vitest mutation-guard pins each scaffold. | `git log -p tests/e2e/lib/fix-prompt-builder.js` (existing) |
| `p-retry` / `cockatiel` / `opossum` | "We need retry / circuit-breaker for failed fixes" | The `fix_attempts` cap of 3 in `auto-fix.mjs` (Phase 42 AUTOFIX-05) is the retry policy. A circuit-breaker library would duplicate it. | `countFixAttempts` from `llm-ledger.js` (existing) |
| `json-rules-engine` / `nools` / `node-rules` | "We need a rules engine for triage heuristic expansion" | The rule chain is 4-6 sequential `if-continue` blocks. A rules engine would obscure the locked D-03 ordering invariant. | Plain `if (...) continue;` (existing pattern in `runTriage`) |
| `compromise` / `natural` / `nlp.js` | "We need NLP for error-message classification" | Error patterns are STRUCTURED fields (`verifier_verdict.tier_used`, `rerun.verdict`, etc.), not free text. | `===` and `includes()` (existing) |
| `vitest@5` major-bump | "Vitest 3 is end-of-life-ish" | Vitest 3.x still receives important fixes; v4.3 capabilities use only stable APIs unchanged 3.x → 5.x. Bumping during v4.3 doubles change risk. | Hold `^3.0.0` caret; let `check-deps-and-pr.mjs` surface the bump on its own timeline |
| `@playwright/test@1.61+` | "Playwright is old" | Already at latest 1.60.0; no upgrade pending. | n/a — already current |
| `@anthropic-ai/sdk@0.101+` | "SDK is 2 patches behind" | ESLint guard + lockfile EXACT pin + ESLint single-entry-point are layered supply-chain defenses. Bump goes through `check-deps-and-pr.mjs` `auto-fix:sdk-bump`. | Hold 0.100.1; queue 0.102 bump via the deps-update review path post-v4.3 |
| Any new MV3 / extension test library | "We need to test extension manifest changes" | v4.3 does NOT touch `src/`, `manifest.json`, or any extension code. The diff-guard regex bank rejects PRs that try to. | n/a — v4.3 is scripts/ + tests/e2e/lib/ only |

**Zero new npm dependencies target: ACHIEVABLE.** Fifth consecutive milestone if held (v3.1, v4.0, v4.1, v4.2, v4.3).

---

## Integration Points with v4.0–v4.2 Surface

| v4.3 capability | Integrates with (existing surface) | Mutation type |
|-----------------|------------------------------------|---------------|
| 1. Diagnostic-injection mutator | `tests/e2e/scripts/inject-defect.mjs` (Phase 59 v2 markers) + `tests/e2e/lib/google-patents-page.js` + `lib/issue-payload-builder.js` (Phase 35) | Extend (additive sections in synthetic body) |
| 2. `--max-turns` + `--tools` | `tests/e2e/lib/llm-driver.js` line 94 (`invokeClaudeP` argv) | Replace 1 arg pair, add 2 new arg pairs; subscription transport only |
| 3. Ledger schema hardening | `tests/e2e/lib/llm-ledger.js` `appendLedgerEntry` | Add field-presence check at function top; co-audit 9 call sites |
| 4. A/B winner exit | `scripts/a-b-winner.mjs` (no code change needed) + `scripts/auto-fix-promote.mjs` outcome write path (Phase 58) | Validation only — confirm wiring is producing real outcome entries |
| 5. Expanded fix scaffolds | `tests/e2e/lib/fix-prompt-builder.js` PROMPT_SCAFFOLDS (Phase 45) + `tests/e2e/lib/llm-router.js` MODEL_ROUTES (Phase 54) | Extend frozen registries (additive) |
| 6. Better heuristic triage | `tests/e2e/lib/triage-classifier.js` `runTriage` D-03 rule chain (Phase 34) | Add 2 new rules BEFORE the `ambiguous.push(iter)` line |
| 7. Prompt-iter loop (Shape A) | `scripts/auto-fix.mjs` Step 7 failure handlers + `scripts/weekly-digest.mjs` `renderAutoFixPipelineSection` (Phase 55) | Add ledger entries on failure; extend digest renderer |

**Trust-invariant non-mutations (load-bearing):**
- `scripts/auto-fix-promote.mjs:assertTripleGate` body — byte-unchanged (Phase 53)
- `tests/e2e/lib/llm-ledger.js` `appendLedgerEntry` body — ADDITIVE checks only (new throws at top; existing body unchanged)
- `tests/e2e/lib/fix-prompt-builder.js` `buildScaffoldSystemPrompt` body — byte-unchanged; new scaffolds use existing helper
- `tests/e2e/lib/llm-router.js` `MODEL_ROUTES` — Object.freeze() invariant preserved (additive extension only)
- ESLint `no-restricted-imports` guard on `@anthropic-ai/sdk` — preserved (capability 2 SDK path is unchanged)

---

## Stack Patterns by Capability-Grouping Choice

**If v4.3 ships all 7 capabilities (7-9 phases per PROJECT.md note):**
- Hold every dep version as documented above
- Phase ordering: 1+2 (carry-over architectural) → 3 (schema hardening) → 4 (A/B winner exit) → 6 (triage expansion) → 5 (new scaffolds) → 7 Shape A (prompt-iter capture) → live UAT-47-a/b/SWEEP-03/04/06 sweep
- Phase 1+2 MUST ship in a single atomic commit (the v4.2 SWEEP-03 architectural finding established this co-design requirement)

**If v4.3 ships only carry-over (capabilities 1-4, 4-5 phases):**
- Hold dep versions; same Phase 1+2 atomic requirement
- Capabilities 5, 6, 7 defer to v4.4
- Slightly lower phase count matches v4.2's 5-phase shape; safer scope

**If v4.3 ships carry-over + scaffold expansion (capabilities 1-5, 5-6 phases):**
- Same dep posture
- Defers triage-expansion + prompt-iter to v4.4

**Research recommendation:** the carry-over-only scope (1-4) is the lowest-risk minimum to honor PROJECT.md's DoD ("live UAT-47-a/b/SWEEP-03/04/06 PROVEN on `origin/main` + at least one real production fix flowing through the expanded surface"). Capability 5 (one new scaffold — `PDF_PARSE_FAILED` recommended) brings the "expanded surface" requirement into reach within 5-6 phases. Capabilities 6 + 7 are valuable but deferrable.

---

## Sources

- `https://code.claude.com/docs/en/cli-reference` — fetched 2026-06-08; canonical CLI flag documentation (HIGH confidence)
  - `--max-turns N` semantics: "Limit the number of agentic turns (print mode only). Exits with an error when the limit is reached."
  - `--allowedTools` semantics: "Tools that execute without prompting for permission. To restrict which tools are available, use `--tools` instead."
  - `--tools` semantics: "Restrict which built-in tools Claude can use. Use `""` to disable all, `"default"` for all, or tool names like `Bash,Edit,Read`."
  - `--max-budget-usd N.NN` semantics: "Maximum dollar amount to spend on API calls before stopping (print mode only)"
- `https://github.com/anthropics/anthropic-sdk-typescript/releases` — fetched 2026-06-08; 0.100.1 → 0.102.0 changelog (HIGH confidence)
- `https://github.com/peter-evans/create-pull-request/releases` — fetched 2026-06-08; v8.0.0 / v8.1.0 / v8.1.1 release notes (HIGH confidence)
- WebSearch: Vitest 5.0 / 4.1 / 3.x version status (MEDIUM confidence — secondary summaries; Vitest team policy on 3.x backports confirmed in releasebot.io page)
- Direct code reading: `tests/e2e/lib/llm-driver.js` lines 76-146 (subscription transport argv shape), 378-450 (subscription ledger wrapper), 506-647 (SDK ledger wrapper)
- Direct code reading: `tests/e2e/lib/fix-prompt-builder.js` lines 117-178 (`buildScaffoldSystemPrompt` helper), 357-363 (PROMPT_SCAFFOLDS frozen registry)
- Direct code reading: `tests/e2e/lib/llm-ledger.js` lines 74-98 (`LEDGER_PATH` resolution), 686-738 (`appendLedgerEntry` body — additive-only target)
- Direct code reading: `tests/e2e/lib/triage-classifier.js` lines 400-504 (D-03 rule chain), 644-716 (5-state FLAKE classifier)
- Direct code reading: `scripts/a-b-winner.mjs` lines 178-285 (filter + group + abstention probe)
- Memory file: `project_auto_fix_ledger_leak_vector.md` — leak vector via `source: 'auto-fix-api'` orphan entries (cross-checked against v4.3 carry-over C in STATE.md)
- `.planning/STATE.md` line 80-85 — v4.3 carry-over A/B/C/D scope (load-bearing requirements baseline)
- `.planning/research-v4.2-archive/STACK.md` — prior cycle's stack research (consulted, not duplicated; v4.2 work items 1-4 are SHIPPED — v4.3 builds on top)

---

*Stack research for: v4.3 Auto-Fix Loop Closure + Capability Expansion (subsequent milestone — capability extension on the v4.0–v4.2 stack)*
*Researched: 2026-06-08*
*Confidence: HIGH (CLI flags + SDK changelog + GitHub releases all verified directly against authoritative sources; only the in-codebase wiring is novel and that surface is read verbatim from local files)*

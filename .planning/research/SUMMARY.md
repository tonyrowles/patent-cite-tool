# Project Research Summary

**Project:** Patent Citation Tool — v4.3 Auto-Fix Loop Closure + Capability Expansion
**Domain:** LLM-CI auto-fix loop — closure of v4.2 architectural carry-over + capability expansion atop the v4.0/v4.1/v4.2 self-healing test-suite stack
**Researched:** 2026-06-08
**Confidence:** HIGH

## Executive Summary

v4.3 is a subsequent-milestone capability extension on top of a live LLM-CI auto-fix loop. The v4.0/v4.1/v4.2 surface is fully wired and on `origin/main`; v4.3 inserts 8 new change points (4 carry-over from v4.2's architectural deferral + 4 capability-expansion) without touching the v4.0–v4.2 trust invariants (`assertTripleGate` body sha256-pinned, ledger schema additive-only, `@anthropic-ai/sdk` single-entry-point ESLint guard, Phase 60.1 subscription-transport whitelist). All four researcher agents converge on a 7-phase shape (Phases 61–68, skipping 63) with a Wave-0 atomic bundle (Phase 61 = Capabilities #1 + #2 + #3) that is load-bearing for UAT-47-a/b PASS, followed by Phase 62 (auxiliary-leak coverage + bypass-audit probe), Phase 64 (heuristic-first triage), Phase 65 (expanded scaffolds), Phase 66 (A/B winner exit), Phase 67 (prompt-iter loop in capture-and-surface scope), and Phase 68 (synthetic-issue cleanup, deferred until evidence captured).

The recommended approach is **zero-new-npm-dependencies (fifth consecutive milestone if held)** with all 8 capabilities extending existing primitives via additive edits. Two load-bearing CLI-flag corrections must propagate to all downstream artifacts: (1) the official Claude CLI flag is **`--tools "Read,Glob,Grep"`** (which RESTRICTS the tool palette) — **NOT `--allowed-tools` or `--allowedTools`**; the v4.2-carry-over note in STATE.md uses outdated language and must be contradicted in REQUIREMENTS.md. (2) `--max-turns 5` applies to the **subscription transport ONLY** (`invokeClaudeP` subprocess); the SDK transport is single-turn by API design — this intentional asymmetry must be documented. STACK research additionally recommends `--max-budget-usd 0.50` as defense-in-depth on top of the per-issue/per-PR/monthly caps.

Key risks: (a) Pitfall 11's NEW finding — the 2026-06-06 ruleset-reversal sole-maintainer `--admin` bypass writes `outcome:'pass'` ledger entries that pollute A/B winner data (lift `scripts/audit-bypass-merges.mjs` + `a-b-winner.mjs --admin-bypass` filter to load-bearing v4.3 cross-cutting). (b) Cross-transport contamination in A/B math — Phase 54 D-19 filter only stratifies by (model, errorClass); SDK and subscription have different retry semantics; require (class, arm, transport) 3-way stratification (NEW v4.3 finding not present in v4.2 research). (c) Forensic-ledger hardening landing-site contradiction — ARCHITECTURE recommends top-of-`appendLedgerEntry` validation; PITFALLS recommends a shared `tests/e2e/lib/safe-append-ledger.js` helper extended to all 3 scripts (auto-fix.mjs, auto-fix-promote.mjs, e2e-explore.mjs) to preserve the 33 pre-existing ledger tests. **Reconciled: ship the shared-helper approach per PITFALLS** because the 33-test invariant is the binding constraint; ARCHITECTURE's top-of-function validation would require fixture updates across the existing test suite that PITFALLS explicitly counter-recommends.

## Key Findings

### Recommended Stack

Zero new npm dependencies. Every capability extends Node 22 ESM built-ins (`node:fs`, `node:path`, `node:crypto`, `node:child_process`) and the already-pinned surface (`@anthropic-ai/sdk@0.100.1` EXACT, `claude` CLI subprocess, `peter-evans/create-pull-request@v8`, `@playwright/test@1.60.0`, `vitest@^3.0.0`). All `HOLD` recommendations verified against authoritative changelogs (no breaking changes affect v4.3 surfaces).

**Core technologies (HOLD at current pin — verified):**
- `@anthropic-ai/sdk@0.100.1` EXACT (latest 0.102.0; bump deferred via `check-deps-and-pr.mjs` `auto-fix:sdk-bump` review path)
- `claude` CLI subprocess for subscription transport — **canonical v4.3 argv:** `['--max-turns','5','--tools','Read,Glob,Grep','--max-budget-usd','0.50','-p','--output-format','json','--system-prompt', systemPrompt, userPrompt]`
- `vitest@^3.0.0` (caret pin held; major-bump to 4.x/5.x explicitly out of scope for v4.3)
- Node 22 LTS built-ins for all new file IO, fingerprinting, subprocess, template substitution

**CANONICAL FLAG-NAME CORRECTNESS (CONTRADICTS STATE.md carry-over note):**

The v4.3 carry-over note in `STATE.md` uses `--allowed-tools Read,Glob,Grep` (kebab-case). This is **WRONG** in two ways, both confirmed against `https://code.claude.com/docs/en/cli-reference`:

1. **Spelling:** the official permission-grant flag is `--allowedTools` (camelCase), NOT `--allowed-tools` (kebab-case). The kebab-case form would silently no-op.
2. **Semantics:** `--allowedTools` grants permission WITHOUT prompting (permission-mode); it does NOT remove tools from Claude's palette. The correct cost-discipline flag is `--tools "Read,Glob,Grep"` which actively RESTRICTS the available tools — Claude cannot call Edit/Bash because they are not in scope.

**v4.3 implementation guidance:** every artifact (REQUIREMENTS.md, ROADMAP.md, phase plans, code, Vitest pins) must use `--tools` not `--allowed-tools`/`--allowedTools`. The Vitest pin must assert the args array contains `'--tools', 'Read,Glob,Grep'` AND excludes the string `'Edit'`, `'Bash'`, `'Write'`, `'WebFetch'` anywhere.

**Transport asymmetry (load-bearing):** the `--max-turns 5` change applies to the SUBSCRIPTION transport ONLY. The SDK transport (`invokeAnthropicSdkWithLedger`) is single-turn by API design — `messages.create` is one request → one response, no agent loop. This intentional asymmetry should be inline-documented at the call sites.

Full details: see STACK.md.

### Expected Features

The 8 v4.3 features split into two waves. The "6/8 → 8/8 heuristic coverage" framing from the milestone PROJECT.md is internally consistent with v3.1's pre-extension taxonomy (8 classes) but the **current `ERROR_CLASSES` array in `tests/e2e/lib/error-codes.js:98-110` has 11 entries**. FEATURES research recommends tracking heuristic coverage by class **name** not ratio; the achievable v4.3 delta is **7/11 → 10/11** (deliberately leaves `NO_CITATION_PRODUCED` on the LLM-routed path because heuristic resolution would mask real product bugs).

**Must have (Wave 0 — Carry-over closure, all required for v4.3 DoD):**
- **#1 Diagnostic-injection mutator extension** — extend `tests/e2e/scripts/inject-defect.mjs:buildBody` to embed seeded `GOOGLE_DOM_DRIFT` DOM snippet (mirror `google-patents-page.js` selector vocabulary) and `WRONG_CITATION` Verifier Disagreement block (mirror Phase 35 `issue-payload-builder.js` shape). Deterministic same-seed → byte-identical output. Preserve SOURCE_TAG `'fixture-mutator-uat-47b'` unchanged (avoids `quarantine-append.mjs:239` regex co-design).
- **#2 `--max-turns` relaxation + `--tools "Read,Glob,Grep"`** — `tests/e2e/lib/llm-driver.js:94` argv update; subscription transport only. Vitest pin asserts tool-allow-list AND excludes Edit/Bash/Write/WebFetch literally.
- **#3 Forensic-ledger schema hardening** — require `source` + `transport` on ALL ledger writes; extend `safeAppendLedger` pattern to a SHARED helper consumed by auto-fix.mjs, auto-fix-promote.mjs (lines 521, 544), and e2e-explore.mjs (lines 262, 313); validation lives at the wrapper layer, NOT in `appendLedgerEntry` body.
- **#4 Synthetic-issue cleanup** — close #20/21/22/23 mutator-injected synthetics; triple-tagged filter (title + body + label) + dry-run default + `--confirm` opt-in + precondition sentinel `.planning/sweep-03-04-pass-evidence.yaml`.
- **Live UAT re-sweep** — UAT-47-a/b/SWEEP-03/04/06 PROVEN on `origin/main` with `errorClass` + `outcome` entries flowing through.

**Should have (Wave 1 — Capability expansion):**
- **#5 A/B winner exit from abstention** — `scripts/a-b-winner.mjs` cleanup of `PHASE_56_TODO` comments + transport stratification (NEW finding — see Architecture Approach below) + `--since-iso` filter. Hold thresholds at `N_PER_ARM_REQUIRED=20`, raise `TIE_THRESHOLD` from 0.05 → 0.10 (PITFALLS recommendation).
- **#6 Expanded fix scaffolds** — concrete recommendations grounded in code: **`VERIFIER_DISAGREE`** (highest leverage — already heuristically produced by Rule 2, just needs registry entry) and **`FRAME_SHIFT_DETECTED`** (closes the pdfjs dep-update loop; needs new ERROR_CLASS in `error-codes.js` + producer in `v40-pdfjs-frame-shift.yml`). Optional **`PDF_PARSE_FAILED`** (STACK recommendation — high real-world frequency; ~2-5% of patents lack text layers).
- **#7 Better heuristic-first triage coverage** — ship 3 new heuristic rules: `EXTENSION_NOT_LOADED` (LOW complexity, no deps), `GOOGLE_DOM_DRIFT` mutator-aware (depends on #1), `WORKER_FALLBACK_FAILED` (MEDIUM — needs fault-injection spec co-design). Brings coverage 7/11 → 10/11.
- **#8 Prompt-iter loop — CAPTURE-AND-SURFACE shape (Shape A)** — convergent recommendation: STACK + FEATURES + PITFALLS all agree on Shape A over full-automation (Shape B); ARCHITECTURE specifies in-process at `runDispatcher` Step 10 with `rewriteHint` parameter threading. **PITFALLS hedges with "recommend deferring to v4.4"** as a defense against trust-boundary erosion; document both stances. **Recommended: include with strict capture-and-surface scope** (in-process Step 10 expansion per ARCHITECTURE) — the in-process design preserves Object.freeze on PROMPT_SCAFFOLDS and writes `iter_round` as additive ledger field; full-automation (Shape B) is rejected outright as Anti-Feature.

**Defer (v4.4+):**
- Feature 6 scaffolds: `PDF_PARSE_ERROR` (alternative naming), `COLUMN_INFERENCE_FAIL`, `IDB_FAILURE`, `OCR_TIER0B_REGRESSION`, `GUTTER_TIER5_REGRESSION`, `CACHE_MISS_TIMEOUT`, `AB_WINNER_FLIP`, `TIER_C_DISAGREEMENT` (need new producer sites OR are subsumed by existing scaffolds).
- Feature 7 heuristic rules: `UI_BROKEN`, `USPTO_API_DRIFT` (signal ambiguity / absent producer).
- Full-automation prompt-iter loop (Shape B) — rejected outright as Anti-Feature.

**Anti-features (explicit design invariants — MUST NOT ship):**
- Adding `Edit` or `Bash` to `--tools` palette ("for debugging")
- Auto-merging A/B winner-decision-driven `MODEL_ROUTES` edits (the table is decision-surface; humans author the PR)
- Bumping `--max-turns` unbounded (50+) — keep at 5
- Backfilling old ledger entries with synthetic `source`/`transport` defaults (falsifies forensic record)
- Treating `GOOGLE_DOM_DRIFT` as routinely heuristic-resolvable (heuristic ONLY when mutator-injected snippet present; real DOM drift still routes to LLM)
- Prompt-iter writing to `fix-prompt-builder.js` via auto-fix PR (trust boundary erosion) — capture-and-surface only

Full details: see FEATURES.md.

### Architecture Approach

8 capabilities wire into the v4.0/v4.1/v4.2 surface via additive edits to 11 existing files + 2 new files (`scripts/uat-cleanup.mjs`, `tests/e2e/lib/safe-append-ledger.js`). The shared-helper approach for ledger-write coverage (PITFALLS-recommended) is preferred over per-file duplication. ARCHITECTURE proposes a 5–7 phase shape with Phase 61 bundle (Capabilities #1+#2+#3); PITFALLS confirms the same bundle for jointly-required UAT-47-a/b PASS. ARCHITECTURE's "in-process Step 10 with `rewriteHint` parameter" is the convergent prompt-iter design.

**Major components touched:**

1. **`tests/e2e/lib/llm-driver.js:94`** — argv literal update: `['--max-turns','1']` → `['--max-turns','5','--tools','Read,Glob,Grep','--max-budget-usd','0.50']`. Subscription transport only; SDK transport unchanged (single-turn by API design).
2. **`tests/e2e/scripts/inject-defect.mjs:buildBody`** — extend with seeded diagnostic switch per errorClass (DOM snippet for `GOOGLE_DOM_DRIFT`; Verifier Disagreement block for `WRONG_CITATION`). Determinism pin: same seed + same errorClass → byte-identical body.
3. **`tests/e2e/lib/safe-append-ledger.js` (NEW)** — shared helper extracted from existing `auto-fix.mjs` `safeAppendLedger` pattern; consumed by 3 scripts (`auto-fix.mjs`, `auto-fix-promote.mjs`, `e2e-explore.mjs`). Defaults `source`/`transport` if caller omits; rejects non-canonical transport values. **Preserves `appendLedgerEntry` body byte-unchanged** (additive-only invariant from Phase 56 + 33 pre-existing Vitest tests stay green).
4. **`scripts/uat-cleanup.mjs` (NEW)** — closes synthetic issues #20/21/22/23 + auto-fix PRs + reverts quarantine entries by triple-tagged filter (title + body + label). Idempotent. Precondition sentinel + dry-run default + `--confirm` opt-in.
5. **`scripts/audit-bypass-merges.mjs` (NEW — load-bearing per Pitfall 11)** — queries `gh api repos/<owner>/<repo>/actions/runs` for `verifier-gate` runs that completed AFTER the PR was merged; surfaces sole-maintainer `--admin` bypasses that pollute outcome data. Outputs CSV consumed by `a-b-winner.mjs --admin-bypass` filter.
6. **`tests/e2e/lib/fix-prompt-builder.js`** — extend `PROMPT_SCAFFOLDS` Object.freeze respread with new keys (e.g., `VERIFIER_DISAGREE`, `FRAME_SHIFT_DETECTED`); thread optional `rewriteHint` parameter through `buildFixPrompt` → `buildScaffoldSystemPrompt` for prompt-iter Shape A. Body byte-stable for the 5 existing scaffolds (sha256 pin against Phase 45 baseline).
7. **`tests/e2e/lib/triage-classifier.js:runTriage`** — extend D-03 rule chain BEFORE the `ambiguous.push(iter)` line with 3 new heuristic rules. `VERIFIER_STRONG_AGREEMENT` Tier-C-masking guard preserved.
8. **`tests/e2e/lib/llm-router.js`** — additive `MODEL_ROUTES` Object.freeze respread for any new ERROR_CLASS that needs opus routing (default sonnet via `??` fallthrough if no explicit entry; `// MODEL_DEFAULT_OK: <CLASS>` comment justification required).
9. **`scripts/a-b-winner.mjs`** — remove `PHASE_56_TODO` comments; extend `computePerClassPerArm` to stratify by **(class, arm, transport)** 3-way (NEW finding — corrects Phase 54 D-19 oversight); add `--since-iso` filter; add `--admin-bypass` filter consuming `audit-bypass-merges.mjs` output. Raise `TIE_THRESHOLD` 0.05 → 0.10.
10. **`scripts/auto-fix.mjs:runDispatcher`** — Step 10 iteration loop wrapper for prompt-iter (Shape A); new `ITER_MAX_ROUNDS = 2` constant; new `iter_round` ledger field (additive). Only iterates on `apply-check-failed` and `malformed-diff:*` — NOT on `sdk_error`.
11. **`tests/e2e/lib/error-codes.js:ERROR_CLASSES`** — additive extension for any new ERROR_CLASS (e.g., `FRAME_SHIFT_DETECTED`); 5-site enumeration drift guard (error-codes.js + v40-auto-fix.yml:91 + PROMPT_SCAFFOLDS + inject-defect.mjs ERROR_CLASSES set + possibly MODEL_ROUTES).

**Trust-invariant non-mutations (load-bearing — verify after every v4.3 commit):**
- `assertTripleGate` body sha256-equivalent to Phase 53 baseline
- `appendLedgerEntry` body byte-unchanged (additive validation lives at wrapper layer)
- PROMPT_SCAFFOLDS Object.freeze invariant + 5 existing scaffold byte-stability sha256
- ESLint `no-restricted-imports` `@anthropic-ai/sdk` single-entry-point preserved
- Phase 60.1 subscription-transport whitelist preserved
- Direct-to-main ledger commit in `v40-auto-fix.yml` (NOT redirected — Phase 57 scope-lock)
- `grep -c 'git push origin main' .github/workflows/v40-auto-fix.yml` == 1

Full details: see ARCHITECTURE.md.

### Critical Pitfalls

PITFALLS research surfaced 13 pitfalls. The top 5 by load-bearing significance:

1. **`--max-turns 5` without `--tools "Read,Glob,Grep"` re-enables Edit/Bash** — silently violates the v4.0 trust invariant that the loop NEVER writes code outside the dispatcher's `git apply` path. Mitigation: Vitest pin asserts argv contains `'--tools', 'Read,Glob,Grep'` AND excludes `'Edit'`, `'Bash'`, `'Write'`, `'WebFetch'` literally; working-tree post-condition test (`git status --porcelain` empty after mocked LLM call). Phase to address: Phase 61 (carry-over wave) — MUST land in same commit as the mutator extension.

2. **Diagnostic-injection mutator drift vs. real `google-patents-page.js` selectors** — synthetic DOM snippet diverges from real selector vocabulary; LLM proposes fix for a fictional DOM; verifier-gate rejects against real Google Patents. Mitigation: Vitest fixture asserts mutator-emitted snippet contains at least one substring (CSS class or `data-testid`) present verbatim in `google-patents-page.js`; determinism pin on same-seed → byte-identical output; Verifier Disagreement template parity with `issue-payload-builder.js` headers. Phase 61 (carry-over wave) co-shipped with #2.

3. **Forensic-ledger hardening breaks 33 pre-existing Vitest ledger tests** — adding required-field validation to `appendLedgerEntry` body is a breaking constraint change; the 4 unguarded auxiliary call sites (2 in `auto-fix-promote.mjs:521,544` + 2 in `e2e-explore.mjs:262,313`) need coverage WITHOUT touching the 33-test invariant. **RECONCILIATION:** PITFALLS recommends a shared `tests/e2e/lib/safe-append-ledger.js` helper consumed by 3 scripts (preserves 33 tests via wrapper-layer validation); ARCHITECTURE recommends top-of-function validation in `appendLedgerEntry`. **Ship the shared-helper approach per PITFALLS** — the 33-test invariant is binding; ARCHITECTURE's top-of-function approach would require fixture updates across the existing test suite that PITFALLS explicitly counter-recommends. Reader-side validation (`a-b-winner.mjs:isAttributable`) filters out pre-v4.3 orphan entries without rejecting them at write time. Phase 62 (carry-over wave).

4. **A/B winner cross-transport contamination (NEW v4.3 finding — not in v4.2 research)** — Phase 54 D-19 filter only stratifies by (model, errorClass); subscription and SDK have different retry semantics (SDK `client.messages.create({ maxRetries: 2 })` retries on 5xx transparently → 1 ledger entry per LOGICAL attempt; subscription `claude -p` has no in-CLI retry → 1 entry per actual API call). Mixing in per-(class, arm) pass-rate counter inflates SDK's apparent success rate vs subscription. Mitigation: extend `computePerClassPerArm` to group by **(class, arm, transport)** 3-way; declare winner only when both transports agree OR with explicit transport disclosure in the markdown table. Vitest pin: `T_AB_TRANSPORT_01`. Phase 66 (capability-expansion wave).

5. **Sole-maintainer bypass on ruleset 17086676 pollutes A/B winner data (Pitfall 11 — NEW finding from 2026-06-06 ruleset reversal)** — `gh pr merge --admin` on auto-fix PRs writes `outcome:'pass'` ledger entries via `auto-fix-promote.mjs` even though `verifier-gate` was bypassed; `a-b-winner.mjs` reads these as legitimate successes. The `assertTripleGate` is NOT a defense (it requires verified-label + merged + triage-sourced; `--admin` satisfies merged; if maintainer also adds `auto-fix:verified` manually before merging, all three pass). Mitigation: **lift `scripts/audit-bypass-merges.mjs` + `a-b-winner.mjs --admin-bypass` filter to load-bearing v4.3 cross-cutting requirement** — ships in Phase 62 (same hardening surface). Runbook discipline note in `.planning/STATE.md ## Bypass Conventions`: "DO NOT use `gh pr merge --admin` on `auto-fix/*` branches. EVER."

Additional cross-cutting concerns from PITFALLS:
- **Pitfall 10:** `assertTripleGate` body byte-stability — sha256 pin from Phase 53 baseline must survive every v4.3 phase; phase plans must pre-declare touch scope on `auto-fix-promote.mjs`.
- **Pitfall 9:** Cost-discipline regression — pre-budgeted spend cap $15 milestone / $30 hard ceiling; per-phase < $5; `--max-turns 5` cost-bound regression test (mean per-call < $0.30) ships in Phase 61.
- **Pitfall 13:** Prompt-iter loop cost-explosion via fingerprint reuse — if Phase 67 ships, single-issue-per-fingerprint invariant + `PROMPT_ITER_MAX_PER_FINGERPRINT = 2` + `PROMPT_ITER_COST_CAP_USD = 0.50` per fingerprint.

Full details: see PITFALLS.md.

## Implications for Roadmap

Based on convergent research, the recommended phase structure is **7 phases (61–68, skipping 63)**, organized as Wave 0 (Phase 61–62, carry-over closure — required for DoD) and Wave 1 (Phase 64–68, capability expansion — parallelizable post-Wave-0, optional defer to v4.4 if scope tight). The 7-phase count reconciles the researcher proposals: STACK (5–9), FEATURES (3 waves / 7 features), ARCHITECTURE (5–7), PITFALLS (7 phases with specific 61→62→64→65→66→67→68 numbering). PITFALLS's 7-phase numbering is the canonical choice because it maps 1:1 to the pitfall-to-phase matrix and matches ARCHITECTURE's dependency graph. **Phase numbering continues from v4.2** (last shipped: Phase 60 + 60.1 hotfix → first v4.3 phase = 61).

### Phase 61: Carry-over bundle — Diagnostic-injection + `--max-turns` + Schema validation TOP entry

**Rationale:** Capabilities #1 + #2 + #3 are jointly required for UAT-47-a/b end-to-end PASS per the v4.2 audit. ARCHITECTURE strongly recommends bundling in one atomic commit because partial-state regressions are real (e.g., enabling `--max-turns 5` with no diagnostic body still produces `apply-check-failed`; enabling diagnostic body with `--max-turns 1` still hits `error_max_turns`). PITFALLS confirms: "(A) AND (B) are jointly required for SWEEP-03/04 to PASS end-to-end." **LOCK as Wave-0 atomic bundle.**

**Delivers:**
- `inject-defect.mjs` diagnostic-injection extension (deterministic, same-seed → same-bytes)
- `llm-driver.js:94` argv update to `'--max-turns','5','--tools','Read,Glob,Grep','--max-budget-usd','0.50'` (subscription transport only; SDK transport documented unchanged)
- Vitest pins: deterministic diagnostic-body pin (#1), arg-array tool-allow-list pin + Edit/Bash/Write/WebFetch exclusion pin (#2), schema-violation throw test (#3)
- Live UAT-47-a/b/SWEEP-03/04 re-execution against `origin/main` with the bundled fix
- `--max-turns 5` cost-bound regression test (mean per-call < $0.30 across 5 smoke issues)
- `assertTripleGate` body sha256 pin (carries forward from Phase 53; verifies invariant survives Phase 61)

**Addresses:** Features #1 + #2 (Wave 0)
**Avoids:** Pitfalls 1, 2, 9 (cost discipline regression)

### Phase 62: Forensic-ledger hardening (shared helper) + bypass-audit probe

**Rationale:** Closes auxiliary-leak path via shared `tests/e2e/lib/safe-append-ledger.js` helper consumed by 3 scripts (auto-fix.mjs already uses safeAppendLedger; auto-fix-promote.mjs:521,544 + e2e-explore.mjs:262,313 are added). **Co-ships `scripts/audit-bypass-merges.mjs`** per Pitfall 11 (sole-maintainer bypass audit gap — NEW v4.3 finding). Must land AFTER Phase 61 (so the carry-over wave has clean schema) and BEFORE Phase 66 (A/B winner exit needs clean transport/source attribution).

**Delivers:**
- Shared helper `tests/e2e/lib/safe-append-ledger.js` (extracted from auto-fix.mjs pattern)
- Coverage of all 4 unguarded sites: auto-fix-promote.mjs:521 (outcome:'fail'), :544 (outcome:'pass'), e2e-explore.mjs:262, :313
- Phase 60.1 subscription-transport whitelist preserved (Vitest pin `T_PHASE60_1_HOTFIX_PRESERVED`)
- `scripts/audit-bypass-merges.mjs` + weekly-digest surface for bypass count (Pitfall 11)
- `a-b-winner.mjs --admin-bypass` filter (consumed by Phase 66)
- Runbook discipline note added to `.planning/STATE.md ## Bypass Conventions`

**Addresses:** Feature #3
**Avoids:** Pitfalls 3, 11, 12

### Phase 64: Heuristic-first triage extension (3 new rules)

**Rationale:** Pure-function extension of `runTriage` D-03 rule chain — independent of all other Wave-1 phases; can run parallel to Phase 65/66/67. 3 rules: `EXTENSION_NOT_LOADED` (LOW, no deps), `GOOGLE_DOM_DRIFT` mutator-aware (depends on Phase 61 #1 substrate), `WORKER_FALLBACK_FAILED` (MEDIUM, needs fault-injection spec co-design).

**Delivers:**
- 3 new heuristic rules in `triage-classifier.js:runTriage`
- `VERIFIER_STRONG_AGREEMENT` Tier-C masking guard preserved (Pitfall 6)
- Cluster pre-filter sample-size invariant test (cluster call count NOT decreased vs v4.2 baseline)
- Coverage: 7/11 → 10/11 (deliberately leaves `NO_CITATION_PRODUCED` on LLM-routed path)

**Addresses:** Feature #7
**Avoids:** Pitfall 6 (Tier C masking; cluster pre-filter drain)

### Phase 65: Expanded fix scaffolds (2 new ERROR_CLASSes)

**Rationale:** Co-design with Phase 61 #1 ideal but Phase 61 already ships; new scaffolds need PARALLEL extension to `inject-defect.mjs` to cover the new ERROR_CLASS values. Concrete recommendations grounded in code evidence: `VERIFIER_DISAGREE` (highest leverage — already in ERROR_CLASSES, already produced by Rule 2, just needs registry entry) + `FRAME_SHIFT_DETECTED` (closes pdfjs dep-update loop). Optional `PDF_PARSE_FAILED` if scope allows.

**Delivers:**
- New `*_CONTRACT` + `*_SYSTEM` + PROMPT_SCAFFOLDS registry entries (via `buildScaffoldSystemPrompt` helper — sha256 pin preserves 5 existing scaffolds)
- 5-site enumeration drift guard for any new ERROR_CLASS (error-codes.js + v40-auto-fix.yml:91 + PROMPT_SCAFFOLDS + inject-defect.mjs + possibly MODEL_ROUTES)
- Vitest pins: scaffold byte-stability sha256, MODEL_ROUTES coverage map, skip-class vs fix-class taxonomy guard
- New mutator coverage for the 2 new ERROR_CLASS values (parallel #1 extension)

**Addresses:** Feature #6
**Avoids:** Pitfall 5 (FORBIDDEN_PATHS drift; MODEL_ROUTES skip; Object.freeze break)

### Phase 66: A/B winner exit + transport stratification

**Rationale:** Capability #5 cleanup + the NEW (class, arm, transport) 3-way stratification finding from PITFALLS Pitfall 4. Must run AFTER Phase 62 (ledger schema clean) and AFTER at least one live SWEEP-03/04 PASS so the entries used for sample math are valid.

**Delivers:**
- Remove `PHASE_56_TODO` comments from `a-b-winner.mjs`
- (class, arm, transport) 3-way stratification in `computePerClassPerArm` (NEW v4.3 finding — corrects Phase 54 D-19 oversight)
- `--since-iso` filter (prevents pre-v4.3 entries from contaminating sample)
- Raise `TIE_THRESHOLD` 0.05 → 0.10 (PITFALLS recommendation; documents noise-floor reasoning inline)
- Sanity-check pre-emit (arm-imbalance refusal when one arm has zero samples)
- Consumes `--admin-bypass` filter from Phase 62

**Addresses:** Feature #5
**Avoids:** Pitfall 4 (threshold tuning; cross-transport contamination); Pitfall 11 (bypass-tainted entries)

### Phase 67: Prompt-iter loop (Shape A — capture-and-surface, in-process)

**Rationale:** CONVERGENT recommendation across STACK + FEATURES + PITFALLS: Shape A over Shape B (full automation rejected outright as Anti-Feature). ARCHITECTURE specifies the in-process Step 10 expansion with `rewriteHint` parameter threading — preserves Object.freeze on PROMPT_SCAFFOLDS, writes `iter_round` as additive ledger field, never edits `fix-prompt-builder.js` source. **PITFALLS hedges with "recommend deferring to v4.4" as a defense against trust-boundary erosion.** Document both stances. **Recommended: include with strict scope** — the in-process Shape A design at runDispatcher Step 10 is the minimum-architectural-change path; the hint flows through as a buildFixPrompt parameter and is spliced into systemPrompt via the buildScaffoldSystemPrompt helper. Depends on Phase 61 substrate live + observed in production.

**Delivers:**
- `fix-prompt-builder.js` rewriteHint parameter threading (additive; Object.freeze preserved)
- `auto-fix.mjs:runDispatcher` Step 10 iteration loop wrapper
- New `ITER_MAX_ROUNDS = 2` constant + `iter_round` ledger field (additive — spreads through entry verbatim)
- Iteration ONLY on `apply-check-failed` and `malformed-diff:*` (NOT on `sdk_error` — fast-fail)
- `PROMPT_ITER_COST_CAP_USD = 0.50` per fingerprint (cumulative)
- FORBIDDEN_PATHS extension to include `fix-prompt-builder.js` + `llm-router.js` (defense-in-depth against scaffold-rewrite-via-auto-fix-PR)

**Addresses:** Feature #8
**Avoids:** Pitfalls 7, 13 (prompt-iter trust boundary; cost explosion via fingerprint reuse)

**v4.4 DEFERRAL OPTION:** If Wave 0 + Phases 64/65/66 consume the phase budget, defer Phase 67 to v4.4. PROJECT.md explicitly permits this: "If too big, Prompt-iter loop or scaffold expansion can be deferred to v4.4 at requirements-scoping time."

### Phase 68: Synthetic-issue cleanup

**Rationale:** MUST be the FINAL phase — runs only after evidence is captured. Closes #20/21/22/23 + auto-fix PRs + reverts quarantine entries via triple-tagged filter (title + body + label). Precondition sentinel `.planning/sweep-03-04-pass-evidence.yaml` required.

**Delivers:**
- `scripts/uat-cleanup.mjs` (NEW)
- Refresh `inject-defect.mjs:emitCleanupEvidence` template to invoke the new script
- Issues #20/21/22/23 closed; auto-fix PRs cleaned up; quarantine entries reverted
- Triple-tagged filter + dry-run default + `--confirm` opt-in + precondition sentinel

**Addresses:** Feature #4
**Avoids:** Pitfall 8 (premature close; accidental real-issue match)

### Phase Ordering Rationale

- **Phase 61 atomic bundle (#1+#2+#3)** is non-negotiable — partial states recreate the v4.2 SWEEP-03 failure shape (just with different error-mode labels). Architecturally orthogonal in code (touch different files; no shared mutable state) so bundling has LOW risk despite combining 3 capabilities.
- **Phase 62 BEFORE Phase 66** — A/B winner exit (Phase 66) requires clean `source`/`transport` attribution from Phase 62 hardening; running Phase 66 first would contaminate winner math with orphan entries.
- **Phase 62 ALSO includes Pitfall 11 bypass-audit** — same surface (forensic hardening), same discipline (ledger integrity), same script category (`scripts/audit-*.mjs` pattern). Co-shipping reduces context-switch cost vs cross-cutting.
- **Phases 64, 65, 66 parallelizable post-Wave-0** — touch disjoint files (triage-classifier.js / fix-prompt-builder.js+workflow / a-b-winner.mjs). Operator can sequence based on appetite.
- **Phase 67 depends on Phase 61 substrate** — the diagnostic+multi-turn surface is what the iter loop iterates on. If Phase 61 ships first and is observed in production, Phase 67 can size `ITER_MAX_ROUNDS` based on real data (Claude may self-correct within `--max-turns 5` reducing iter-rounds needed; perhaps `ITER_MAX_ROUNDS = 1` is sufficient).
- **Phase 68 LAST** — cleanup destroys the evidence trail if run before SWEEP-03/04 PASS captured; precondition sentinel enforces.

### Research Flags

**Phases likely needing deeper research during planning (`/gsd:plan-phase --research-phase <N>`):**

- **Phase 61:** Needs verification of (a) exact line/byte location of `--max-turns 1` in `llm-driver.js` (research cites line 94), (b) the existing Vitest pin location for the argv assertion (Phase 31 / Phase 42 line numbers), (c) the SDK-path `appendLedgerEntry` call sites already self-tag source+transport (verify lines 588, 620 in `llm-driver.js`), (d) the `fix-prompt-builder.js:252-268` GOOGLE_DOM_DRIFT_CONTRACT exact selector vocabulary expectations.
- **Phase 67:** Highest-risk new architecture in v4.3. Needs research on (a) how `rewriteHint` flows through `buildScaffoldSystemPrompt` without breaking Phase 45 byte-stability sha256, (b) interaction with the per-issue cap ($1) and per-PR cap ($2), (c) operator decision on whether to defer to v4.4. Recommend `/gsd:plan-phase --research-phase 67` mandatory.

**Phases with standard patterns (skip research-phase):**

- **Phase 62:** Shared-helper extraction is a well-understood Node.js refactor pattern. Pitfall 12 enumerates the exact 4 sites. Add `audit-bypass-merges.mjs` follows existing `scripts/*.mjs` pattern.
- **Phase 64:** Pure-function extension of `runTriage` rule chain. Pattern established in Phase 34 D-03.
- **Phase 65:** Scaffold expansion pattern established in Phase 45; just adds new keys via existing helper. 5-site enumeration drift guard is a checklist.
- **Phase 66:** A/B winner cleanup + 3-way stratification is mechanical once Phase 62 ledger schema is clean. Pattern established in Phase 54.
- **Phase 68:** Cleanup script is a well-understood `gh` CLI orchestrator pattern.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All pins verified against authoritative changelogs (GitHub releases, code.claude.com CLI reference, Vitest team policy). Flag-name correctness directly verified. Zero new deps target verified achievable. |
| Features | HIGH | Live tree grep at file:line precision. ERROR_CLASS taxonomy correction from "8" to "11" grounded in `error-codes.js:98-110`. Concrete scaffold + heuristic recommendations grounded in code (not abstract). |
| Architecture | HIGH | All integration points named from direct code reads — `auto-fix.mjs:runDispatcher`, `llm-driver.js:91-97`, `a-b-winner.mjs:178-285`, `fix-prompt-builder.js:357-363`, `triage-classifier.js:428-499`. Trust-invariant boundaries enumerated with enforcement mechanism. |
| Pitfalls | HIGH | Pitfalls 1–11 grounded in direct code inspection. Pitfall 12 (auxiliary-leak vector) enumerates 4 exact site:line. Pitfall 13 (prompt-iter cost-explosion) is MEDIUM confidence — new surface with no v4.0–v4.2 precedent, reasoned from architecture. |

**Overall confidence:** HIGH

### Gaps to Address

- **Phase 67 prompt-iter scope decision:** PITFALLS recommends defer-to-v4.4 as a hedge against trust-boundary erosion; ARCHITECTURE proposes in-process Shape A in Phase 67. Operator must decide at REQUIREMENTS.md scoping. **Recommended: include with strict capture-and-surface scope per ARCHITECTURE's in-process design** — Shape B is rejected outright. If scope tight, defer Phase 67 entirely to v4.4 (PROJECT.md explicitly permits).
- **Phase 65 scaffold selection:** STACK + FEATURES recommend `VERIFIER_DISAGREE` (highest leverage) + `FRAME_SHIFT_DETECTED` (closes dep-update loop). Optional `PDF_PARSE_FAILED` (STACK recommendation). Operator picks at REQUIREMENTS.md. Other candidates explicitly deferred to v4.4.
- **Phase 64 heuristic rule selection:** FEATURES recommends 3 rules (`EXTENSION_NOT_LOADED`, `GOOGLE_DOM_DRIFT` mutator-aware, `WORKER_FALLBACK_FAILED`); other 3 fall-through classes (`UI_BROKEN`, `USPTO_API_DRIFT`, `NO_CITATION_PRODUCED`) deferred to v4.4 with documented signal-ambiguity reasoning.
- **A/B winner threshold tuning:** Current `TIE_THRESHOLD = 0.05` (D-18 lock); PITFALLS recommends 0.10. Operator decides at Phase 66 plan. `N_PER_ARM_REQUIRED = 20` held (insufficient data to justify tuning until v4.4).
- **Budget cap formalization:** PITFALLS recommends `.planning/STATE.md ## Budget` section with `$15` milestone soft cap and `$30` hard ceiling. Operator decides at REQUIREMENTS.md.

---
*Research completed: 2026-06-08*
*Ready for roadmap: yes — proceeds to REQUIREMENTS.md scoping (Step 9) then gsd-roadmapper (Step 10)*

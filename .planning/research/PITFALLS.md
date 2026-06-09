# Pitfalls Research

**Domain:** v4.3 Auto-Fix Loop Closure + Capability Expansion — adding diagnostic-injection mutator, `--max-turns` relaxation, forensic-ledger schema hardening, A/B winner exit, expanded fix scaffolds, broader heuristic-first triage, prompt-iter loop, and synthetic-issue cleanup to a running LLM-CI pipeline on origin/main
**Researched:** 2026-06-08
**Confidence:** HIGH for Pitfalls 1–11 (grounded in direct code inspection of `llm-driver.js:94`, `fix-prompt-builder.js:252-268`, `auto-fix.mjs:143-181` safeAppendLedger, `a-b-winner.mjs:178-238` schema readers, `triage-classifier.js:35-44` VERIFIER_STRONG_AGREEMENT, `auto-fix-promote.mjs:521-558` outcome writes, `eslint.config.js:253-281` SDK guard, `inject-defect.mjs:277-298` buildBody, plus v4.2 audit findings); HIGH for Pitfall 12 (sole-maintainer bypass interaction with auto-fix promotion is observable in `auto-fix-promote.mjs:assertTripleGate`); MEDIUM for Pitfall 13 (prompt-iter cost-explosion is a new surface — no v4.0–v4.2 precedent, reasoned from architecture).

> **Scope note:** This file covers ONLY v4.3-NEW failure modes added to the existing auto-fix loop. The v4.2 pitfalls (11 closed pitfalls, see `.planning/research-v4.2-archive/PITFALLS.md`) are CLOSED AND LOCKED — do not re-warn about ledger-commit-refactor scope, FORBIDDEN_PATHS mutator target, fingerprint collision, `appendLedgerEntry` guard location, or live-UAT evidence pollution. v4.3 inherits those mitigations; new pitfalls reference them as "prior" only when they produce a NEW failure surface.

> **v4.2 carry-over architectural finding (load-bearing):** Three SWEEP-03 attempts (2026-06-06/07/08) surfaced two distinct constraints that pre-date v4.2 and must be resolved JOINTLY by v4.3's carry-over wave: (A) fixture-mutator scope-lock leaves issue bodies without diagnostic data → `apply-check-failed`; (B) `--max-turns 1` prevents Claude from reading source files for real cases → `error_max_turns`. Pitfalls 1+2+3 below cover the integration risks when (A) and (B) ship together.

---

## Critical Pitfalls

### Pitfall 1 (LOAD-BEARING): `--max-turns 5` without an `--allowed-tools` allow-list silently re-enables Edit/Bash, breaking the v4.0 trust invariant that the loop NEVER writes code outside the dispatcher's `git apply` path

**What goes wrong:**

`tests/e2e/lib/llm-driver.js:94` currently passes `'--max-turns', '1'` with a header comment "Pitfalls 1, 2 — DO NOT change." The Pitfall 1+2 cost-discipline gate this comment refers to is **two separate concerns**:

1. **Cost runaway** — multi-turn invocations multiply token spend per call. The CONTEXT-locked $10 day-cap + $1 issue-cap + $2 PR-cap (`llm-ledger.js:140-156`) are sub-caps that bound runaway turns AFTER the spend, not before.
2. **Trust invariant** — `--max-turns 1` structurally prevents Claude from invoking the `Edit` and `Bash` tools at all. The auto-fix loop's design contract is "the LLM returns a unified diff, the dispatcher applies it." If Claude can `Edit` files in-place during the subprocess, the dispatcher's `parseFencedDiff` → `checkDiffGuard` → `git apply --check` chain is bypassed entirely.

The natural v4.3 implementation: bump to `'--max-turns', '5'` so Claude can `Read` source files. If `--allowed-tools Read,Glob,Grep` is forgotten or misspelled (e.g., `Read,Glob,Grep,Edit` because the test author confused "what helps Claude understand" with "what Claude needs"), `Edit` and `Bash` become available across all 5 turns. Claude may then:

- Run `Bash(rm -rf node_modules)` "to debug" — the SDK process has user-write permissions on the working tree.
- Run `Edit` on `src/popup.js` directly — the dispatcher's `git apply --check` never sees this change because there is no diff to apply.
- Run `Bash(git push origin HEAD)` — escapes the entire `verifier-gate` review path.

The `parseFencedDiff` fence-extraction logic in `auto-fix.mjs:279-298` will see Claude's response and likely report `no-fences` (Claude used tools instead of emitting a diff), exit 1, and write a `malformed-diff:no-fences` ledger entry. But the working-tree mutation has ALREADY happened. The dispatcher does NOT reset the working tree on exit 1. The next CI run picks up the mutated files. Production code drift is silent.

**Why it happens:**

`--allowed-tools` is a Claude Code CLI argument; if omitted, the CLI's default tool-set is enabled (Read, Edit, Bash, Glob, Grep, etc.). The conventional wisdom "I'll restrict later" loses to "I forgot the second flag." The existing test pin (currently asserting `'--max-turns', '1'`) won't fail until it's actively rewritten — and a test-author who rewrites both the pin and the source in the same commit may not realize the pin no longer enforces the tool restriction.

**How to avoid:**

1. **Tool-allow-list pin (Vitest):** in `tests/unit/llm-driver.test.js` add a test asserting `args` array contains BOTH `'--max-turns', '5'` AND `'--allowed-tools', 'Read,Glob,Grep'` in that exact byte sequence. Assert the args array does NOT contain the string `'Edit'`, `'Bash'`, `'Write'`, or `'WebFetch'` ANYWHERE (full-array substring search). Test name: `T_MAX_TURNS_05a — args contain --allowed-tools Read,Glob,Grep AND exclude Edit/Bash/Write/WebFetch`.

2. **Working-tree post-condition test:** after a mocked `invokeClaudeP` call that returns a non-diff response, assert `git status --porcelain` returns empty (no mutation). This is the trust-invariant check: even if the LLM somehow ran a tool, the working tree must be clean before the dispatcher moves on. (Note: in unit tests this is mocked; in CI, add it as a smoke job in the auto-fix workflow.)

3. **Source-grep guard:** add to the v4.3 phase plan a regex assertion `grep -n "max-turns" tests/e2e/lib/llm-driver.js` returns exactly TWO results (one in the args array, one in a header comment naming the locked tool list). More than two hits = a stray reference; fewer = the comment was deleted.

4. **Document the trust invariant inline:** rewrite the existing "DO NOT change" comment at line 82-84 to "DO NOT change without ALSO updating `--allowed-tools`. The auto-fix loop's diff-via-fences contract REQUIRES that Edit/Bash/Write be unavailable in the subprocess."

**Warning signs:**

- A v4.3 PR diff shows `--max-turns', '5'` added without an adjacent `--allowed-tools` arg.
- The args array in the diff contains `Read,Glob,Grep,Edit` (Edit accidentally included).
- After a mocked LLM call in unit tests, `git status` is non-empty.
- The ledger shows a `source: 'auto-fix-api'` entry with `malformed-diff:no-fences` AND a follow-up CI failure where a `src/` file mysteriously changed.
- Cost-per-call spikes from ~$0.05 to ~$0.30 (turns expanded silently — Claude burned all 5 turns reading 50 files).

**Phase to address:**

Carry-over wave Phase 61 (`--max-turns` relaxation). MUST land in the same commit as the diagnostic-injection mutator extension (Pitfall 2 below) per v4.2 audit: "(A) AND (B) are required for SWEEP-03/04 to PASS end-to-end."

---

### Pitfall 2 (LOAD-BEARING): Diagnostic-injection mutator drift — the synthetic DOM snippet pattern diverges from real `google-patents-page.js` selectors, so the LLM produces a fix for a fictional DOM and the verifier-gate rejects it

**What goes wrong:**

`tests/e2e/scripts/inject-defect.mjs:277-298` (`buildBody`) currently emits a synthetic-defect notice with NO diagnostic content. v4.3 extends `buildBody` to embed seeded but realistic diagnostic data — a DOM snippet for `GOOGLE_DOM_DRIFT`, a Verifier Disagreement block for `WRONG_CITATION`.

`fix-prompt-builder.js:252-273` (the `GOOGLE_DOM_DRIFT_CONTRACT` system block) tells the LLM: "Read the Google Patents page source (the issue body should include a snippet of the new DOM) and pick a stable selector (prefer `data-testid` attributes; if none exist, prefer ARIA roles + accessible names)." If the mutator injects a fictional DOM snippet that does NOT mirror real `google-patents-page.js` selector patterns (real selectors target `.knowledge-card`, `[data-result-id]`, `state-modifier`, etc.), the LLM will propose a fix that:

1. Edits `tests/e2e/lib/google-patents-page.js` to add a selector matching the synthetic DOM (e.g., `'.fictional-patent-body'`).
2. The verifier-gate runs against real Google Patents — the new selector doesn't match anything.
3. The 76-case regression goes 76-FAIL → 0-PASS.
4. The verifier-gate fails, the auto-fix PR is rejected, the loop records ANOTHER failure on the same fingerprint.
5. After 3 failures, `human-review-required` is added. Loop "proven" but the proof is a fabrication: a real DOM drift would have produced a real selector change, but this loop ran against a fictional DOM.

Worse: if the mutator's synthetic DOM ACCIDENTALLY matches a stable Google Patents selector (e.g., it copies a real snippet from `google-patents-page.js`), the LLM "fixes" by changing the real selector to a different-but-also-correct one — production-irrelevant code churn that contaminates the golden state of the harness selectors.

**Why it happens:**

The mutator was designed under MUTATOR-04 scope-lock ("issue-creation layer only — does NOT touch FORBIDDEN_PATHS files"). v4.3 widens that scope to "issue-creation layer with diagnostic data." But the mutator file lives in `tests/e2e/scripts/` — far from `tests/e2e/lib/google-patents-page.js` — and the mutator author and the page-selector author are working from different mental models of "what a real DOM drift looks like." There is no test that pins the mutator's synthetic DOM to the real selector vocabulary.

**How to avoid:**

1. **Co-design fixture (Vitest pin):** add `tests/unit/inject-defect-diagnostic.test.js` with a test `T_DIAG_01 — mutator-emitted DOM snippet contains at least one selector substring that matches a real selector in google-patents-page.js`. Read the synthetic snippet from `buildBody({ fp:'aaaaaaaaaaaa', caseId:'<test>', seed:1, errorClass:'GOOGLE_DOM_DRIFT' })` and `fs.readFileSync('tests/e2e/lib/google-patents-page.js')`. Assert at least one CSS-class token or `data-testid` value from the snippet appears verbatim in the source. This pins drift in both directions.

2. **Determinism pin (Vitest):** assert `buildBody({fp, caseId, seed:1, errorClass:'GOOGLE_DOM_DRIFT'})` returns BYTE-IDENTICAL output across two calls with the same seed. The DOM-snippet generator MUST be a pure function of seed.

3. **Real-Verifier-Disagreement template parity (Vitest):** for the WRONG_CITATION variant, assert the mutator-emitted body contains the SAME section headers used by the real `issue-payload-builder.js` Phase 35 issue shape (`### Verifier Disagreement`, `expected:`, `observed:`, `tier_used:`). Use a `grep` on the real-issue template (or a captured real-issue fixture) and assert all required headers are present in the synthetic body.

4. **Mutator co-commit invariant:** any v4.3 phase plan that touches `inject-defect.mjs:buildBody` MUST also touch (or assert byte-stability of) `google-patents-page.js` + `issue-payload-builder.js`. Encode this as a phase-plan checklist: "List files touched: { inject-defect.mjs } INTERSECTED WITH { google-patents-page.js, issue-payload-builder.js } must be non-empty OR a comment must justify why no co-touch is needed (e.g., 'real selectors copied verbatim from the existing file via test fixture')."

5. **Smoke after mutator extension:** before SWEEP-03 spend, run `node tests/e2e/scripts/inject-defect.mjs --dry-run --error-class GOOGLE_DOM_DRIFT` and pipe the synthetic body into the real `auto-fix.mjs --dry-run --issue <fake>` to inspect the prompt. Manual check: the LLM-facing user prompt must contain selectors that look like real selectors. ~30 seconds of operator time saves a $0.50 SWEEP-03 spend.

**Warning signs:**

- The verifier-gate rejection log shows "selector matches 0 elements on real Google Patents page" after a mutator-driven auto-fix PR.
- The same fingerprint hits the 3-attempt cap with three identical "no-such-selector" failures.
- The mutator's synthetic body, when grep'd for class names, returns tokens not present in `google-patents-page.js`.
- `git log --grep='inject-defect'` shows a commit touching only the mutator file — no corresponding selector-vocabulary file touched in the same commit.

**Phase to address:**

Carry-over wave Phase 61. SAME COMMIT as Pitfall 1's `--max-turns` relaxation per v4.2 audit. The mutator extension and the max-turns relaxation are co-load-bearing; shipping one without the other re-creates the v4.2 SWEEP-03 failure shape (just with a different error-mode label).

---

### Pitfall 3 (LOAD-BEARING): Forensic-ledger schema hardening — requiring `source` + `transport` on ALL `appendLedgerEntry` calls is a breaking constraint change; the 33 pre-existing Vitest ledger tests will silently pass while the 2 unguarded auxiliary call sites in `scripts/e2e-explore.mjs` and `scripts/auto-fix-promote.mjs` produce schema-invalid entries

**What goes wrong:**

The forensic-ledger leak surfaced 2026-06-08 (3 orphan `claude-opus-4-7[1m]` entries with no `source`/`transport`) revealed that `appendLedgerEntry` accepts ANY entry shape — the function is permissive (`m.iterations.push(entry)`, line 705). v4.3 (C) hardens the schema to REQUIRE `source` + `transport`.

The v4.2 Pitfall 7 lesson (load-bearing): **DO NOT add the guard to `appendLedgerEntry` body** — it breaks 33+ Vitest tests that call `appendLedgerEntry(tmpPath, { iso, model, cost_usd })` without `source`/`transport`. The v4.2 mitigation was a `safeAppendLedger` wrapper at the call-site in `auto-fix.mjs`. v4.3 must extend this pattern, BUT the auxiliary-leak path enumeration is harder than it looks:

**Enumerated ledger-write call sites as of HEAD:**

| File | Line | Guard |
|------|------|-------|
| `scripts/auto-fix.mjs` | 181 | `safeAppendLedger` wrapper (Phase 56) |
| `tests/e2e/lib/llm-driver.js:invokeClaudePWithLedger` | 421 | self-tags `transport: 'subscription'` + `source` param |
| `tests/e2e/lib/llm-driver.js:invokeAnthropicSdkWithLedger` | 588 (sdk_error) | self-tags `transport: 'sdk' + source: 'auto-fix-api'` |
| `tests/e2e/lib/llm-driver.js:invokeAnthropicSdkWithLedger` | 620 (success) | self-tags `transport: 'sdk' + source: 'auto-fix-api'` |
| `scripts/e2e-explore.mjs` | 262 | **UNGUARDED** (Phase 31 legacy) |
| `scripts/e2e-explore.mjs` | 313 | **UNGUARDED** (Phase 31 legacy) |
| `scripts/auto-fix-promote.mjs` | 521 (fail) | **UNGUARDED** (`source: 'auto-fix-failed'` set inline) |
| `scripts/auto-fix-promote.mjs` | 544 (pass) | **UNGUARDED** (`source: 'auto-fix-promoted'` set inline) |

The Phase 58 PROMOTE calls in `auto-fix-promote.mjs` DO set `source` + `transport` inline. The Phase 31 `e2e-explore.mjs` calls do NOT (they predate the schema additions). Adding mandatory-field validation at the entry-shape layer would BREAK e2e-explore. Skipping validation would leave the auxiliary-leak path open.

Worse: if v4.3 chooses "validate at write time, throw on missing fields," the e2e-explore.mjs path (subscription-only, local-iteration tool from Phase 31) starts throwing for the developer, with no quick path back to the v3.1 free-iteration flow. The Phase 60.1 hotfix that whitelisted `transport: 'subscription'` for `safeAppendLedger` would have to be re-extended.

The 33 ledger Vitest tests (`tests/unit/llm-ledger.test.js`) call `appendLedgerEntry(tmpPath, { iso, model, cost_usd })` with NO source/transport. They silently pass if the validation is at the wrapper layer, but BREAK if the validation is at `appendLedgerEntry` body. The Phase 56 `errorClass` additive-only pattern is the template — additive-optional doesn't break tests. Mandatory-validation does.

**Why it happens:**

The forensic motivation (no orphan entries, audit-grep-able provenance) is correct. The implementation path is wrong if it treats "require fields" as "throw on missing fields at write time." The right implementation is "all dispatcher call sites set the fields; validation at the boundary is layered defense."

**How to avoid:**

1. **Wrap, don't validate at `appendLedgerEntry`:** the v4.2 `safeAppendLedger` pattern stays. Extend it to TWO more files:
   - `scripts/e2e-explore.mjs` — add a local `safeAppendLedger` wrapper (or import from a shared helper) that injects `source: 'e2e-explore' + transport: 'subscription'` if the caller omitted them. NO throw — auto-default for back-compat.
   - `scripts/auto-fix-promote.mjs` — the two call sites already set these inline; wrap them with `safeAppendLedger` for symmetry. NO throw on this path because Phase 58 callers are correct.

2. **Mandatory-validation lives at the READER, not the WRITER:** add to `a-b-winner.mjs:isAttributable` (and any new audit script) a filter that drops entries with missing `source` or `transport`. The orphan entries from 2026-06-08 are filtered OUT of analysis, not REJECTED at write time. Documentation: "Pre-v4.3 entries lacking source/transport are bucketed as 'pre-schema-hardening' in audit views; they are NOT removed from disk because the ledger is append-only and immutable."

3. **Test mandatory-field semantics at the wrapper layer:** add `T_LEDGER_HARDEN_01 — safeAppendLedger throws if entry lacks source OR transport, only when called from auto-fix.mjs context`. Existing 33 `appendLedgerEntry`-direct tests stay green.

4. **Cross-file source-grep pin:** add `tests/unit/ledger-leak-vector-coverage.test.js` with a `grep` over `scripts/*.mjs` for `appendLedgerEntry(LEDGER_PATH` and assert each match is preceded by a wrapper call OR a self-tag containing both `source:` AND `transport:`. Pin name suggests the failure mode: "every direct ledger write must be source+transport-tagged."

5. **Coexistence with Phase 60.1 hotfix:** the `transport: 'subscription'` whitelist in `safeAppendLedger:170` (auto-fix.mjs) was a hotfix to restore v3.1 free-iteration. v4.3 hardening MUST preserve this whitelist — the v4.3 schema mandates `transport: 'subscription'` on subscription entries, which is exactly what the hotfix already enforces. Add a Vitest pin: `T_PHASE60_1_HOTFIX_PRESERVED — safeAppendLedger accepts subscription-tagged entry without CI/override`.

**Warning signs:**

- After the hardening commit, `npm test` shows ANY failure in `tests/unit/llm-ledger.test.js` (the 33+ tests). Means validation was added to the wrong layer.
- `npm run e2e:explore` throws "ledger entry missing source/transport" after the hardening commit.
- The committed ledger gains MORE entries with `source: undefined` after the hardening (means a new call site was added without going through a wrapper).
- The grep `grep -n 'appendLedgerEntry(LEDGER_PATH' scripts/ tests/e2e/lib/` returns ANY hit not preceded by a wrapper call or a self-tag. Count BEFORE: ~8 hits; count AFTER hardening: still ≤8 hits but every one is either inside a wrapper or has `source:` + `transport:` in the call object literal.

**Phase to address:**

Carry-over wave Phase 62 (Forensic-ledger schema hardening). MUST land AFTER Phase 61 (max-turns + mutator) and BEFORE Phase 64 (A/B winner exit) — A/B winner reads need clean `source`/`transport` for the abstention-exit math to be uncontaminated.

---

### Pitfall 4 (LOAD-BEARING): A/B winner threshold-too-low → noisy class flips; threshold-too-high → never exits abstention; and `combinedMonthlyTotalByTransport`-style cross-transport contamination silently biases the outcome math because subscription and SDK have different retry semantics

**What goes wrong:**

`scripts/a-b-winner.mjs` is in abstention mode (D-20 LOCKED) because the ledger schema lacks `errorClass` + outcome until Phase 56 wires them. v4.3 (with Phase 56 already shipped) drives the script out of abstention. The DESIGN KNOBS are TBD by research (`N_PER_ARM_REQUIRED = 20`, `TIE_THRESHOLD = 0.05`). Three integrity hazards:

1. **Threshold-too-low (`TIE_THRESHOLD = 0.05` or below):** with realistic per-class sample sizes of ~25–50 entries per arm in early operation, a 1–2 outcome swing flips the winner. A noisy winner declaration triggers MODEL_ROUTES mutation, which by Phase 54 D-02 is frozen — but operators may interpret the winner table as a recommendation and manually edit. Per-class flips bias future routing samples; the next sample window is contaminated.

2. **Threshold-too-high (`N_PER_ARM_REQUIRED = 50` or above):** the loop takes weeks to accumulate samples per class. SWEEP-03 / SWEEP-04 will close before a winner is declared. The DoD "drive a-b-winner.mjs out of abstention" is unachievable in v4.3's timeline. v4.3 ships with the same abstention output as v4.2.

3. **Cross-transport contamination (CRITICAL):** Phase 56 LEDGER-02 + Phase 60.1 hotfix means the committed ledger now has BOTH `transport: 'sdk'` (CI auto-fix) AND `transport: 'subscription'` (local fix-issue) entries with `errorClass` + outcome. The subscription path uses `claude -p --max-turns 1` (or, after v4.3, `--max-turns 5`); the SDK path uses `claude-sonnet-4-6` direct. These have DIFFERENT retry semantics:
   - SDK `client.messages.create({ maxRetries: 2 })` retries on 5xx transparently — a single ledger entry per LOGICAL attempt.
   - Subscription `claude -p` has no in-CLI retry — each invocation is one entry per actual API call.
   - On a transient API blip, SDK produces 1 ledger entry with `outcome: 'pass'`; subscription produces 1 entry with `errorReason: 'api_error:...'` AND a follow-up retry that the operator did or did NOT trigger.
   
   Mixing these in the per-(class, arm) pass-rate counter inflates SDK's apparent success rate vs. subscription. The `a-b-winner.mjs:isAttributable` filter only checks model startsWith — it does NOT filter by transport. The winner declared is biased toward whichever transport has more entries (currently SDK in CI, subscription locally).

**Why it happens:**

(1) and (2) are knob-tuning. (3) is a structural design oversight inherited from Phase 54 D-19 (which only required `model` + `errorClass`, not `transport`). The two transports were designed to share a ledger for combined cap purposes (`combinedMonthlyTotal`), not for combined pass-rate analysis.

**How to avoid:**

1. **Pin thresholds via Vitest with documented rationale:** `T_AB_THRESHOLD_01 — N_PER_ARM_REQUIRED === 20` AND `T_AB_THRESHOLD_02 — TIE_THRESHOLD === 0.10` (NOT 0.05 — raise the noise floor). Document inline: "0.10 chosen so a 2-of-20 swing does NOT flip; requires a 3-of-20 effect size = 15% rate delta."

2. **Transport-stratified analysis (required):** add `entryTransport(entry)` helper (returns `'sdk' | 'subscription' | 'unknown'`); extend `computePerClassPerArm` to group by `(class, arm, transport)`. The winner table emits one row per (class, transport) pair, or — preferred — declares winner only when both transports agree. Vitest pin: `T_AB_TRANSPORT_01 — perClass cell has separate sonnet_sdk / sonnet_sub / opus_sdk / opus_sub buckets`.

3. **Sample-window pinning:** add a `--since-iso <yyyy-mm-dd>` flag to `a-b-winner.mjs` so a-b-winner reads only entries newer than the MODEL_ROUTES last-mutated date. Prevents contamination from the abstention period where MODEL_ROUTES was being tuned by hand. Vitest pin: `T_AB_SAMPLE_WINDOW_01 — --since-iso filters out pre-v4.3 entries`.

4. **Forward-compat with Phase 56 fix:** Phase 56 LEDGER-02 wires `errorClass` into all 7 auto-fix.mjs sites. v4.3 must NOT silently change the entry shape that `isAttributable` expects. Re-verify after Phase 62 hardening that all entries flowing into a-b-winner carry `errorClass + outcome + transport + model`.

5. **Sanity check before winner declaration:** add a pre-emit check in `main()` — if `perClass['WRONG_CITATION'].opus.n === 0` and `perClass['WRONG_CITATION'].sonnet.n > 50`, refuse to declare winner for WRONG_CITATION (one-arm empty = no comparison possible; only routes-table flips can move samples to opus). Emit `NO_WINNER_YET_REASON: 'arm-imbalance'`.

**Warning signs:**

- The first non-abstention output shows pass-rates like sonnet `0.95` vs opus `0.40` for `GOOGLE_DOM_DRIFT` — opus is the FROZEN_MODEL_ROUTE for this class, so it's the ONLY thing being sampled. The "winner" declaration would say "switch to sonnet" but no sonnet samples exist for the class.
- Pass-rates differ by transport: SDK sonnet=0.90 vs subscription sonnet=0.55 for the same class.
- The committed ledger has 100+ `errorClass`-tagged entries but `a-b-winner.mjs` emits `NO_WINNER_YET` — means `outcome` is missing from a critical fraction.

**Phase to address:**

Capability-expansion wave Phase 64 (A/B winner exit). Must run AFTER Phase 62 (ledger schema hardening) so `transport` is universally present, AND AFTER at least one live SWEEP-03/04 PASS so the entries used for sample math are valid.

---

### Pitfall 5: Expanded fix scaffolds — adding a new `ERROR_CLASS` to `PROMPT_SCAFFOLDS` drifts the FORBIDDEN_PATHS enumeration if `buildScaffoldSystemPrompt` is bypassed, and silently picks the default sonnet model when an opus default would be correct

**What goes wrong:**

`fix-prompt-builder.js:117-178` defines `buildScaffoldSystemPrompt({ className, fixSurfaceContract })` — the single source of truth for the 6 FORBIDDEN_PATHS strings (`tests/test-cases.js`, `tests/golden/baseline.json`, `tests/e2e/test-cases-quarantine.js`, `.github/workflows/v40-*.yml`, `tests/e2e/.llm-spend-ledger.json`, `.github/CODEOWNERS`). Phase 42 invariant: "If the diff-guard bank changes, BOTH this file AND the test must be updated in the same commit." Phase 45 invariant: 5 scaffolds share the helper for byte-stability.

v4.3 expansion adds new ERROR_CLASSes. The hazard if implemented naively:

1. **Bypassing `buildScaffoldSystemPrompt`:** a developer writes a new scaffold inline (e.g., `USPTO_API_DRIFT` literal string), the 6 FORBIDDEN_PATHS are typo'd as 5, or one entry uses a different glob (`tests/test-cases.*` vs `tests/test-cases.js`). The scaffold ships; the LLM is told one different rule for one class. The Phase 42 byte-stability invariant is silently broken.

2. **Skipping `MODEL_ROUTES` consideration:** `routeModel(errorClass)` (`llm-router.js:83-85`) returns `claude-sonnet-4-6` as default. Phase 54 D-02 freezes MODEL_ROUTES with only `GOOGLE_DOM_DRIFT` + `LLM_HALLUCINATED_SELECTION` → opus. New ERROR_CLASSes default to sonnet. For a class like `USPTO_API_DRIFT` (similar in shape to GOOGLE_DOM_DRIFT — external-system-changed-its-shape), sonnet is the wrong default. The auto-fix loop attempts the fix with a too-weak model; success rate is low; the A/B winner sees `USPTO_API_DRIFT.sonnet` at 30% pass-rate and `USPTO_API_DRIFT.opus` at 0 samples — abstention forever, OR worse, declares sonnet as winner when opus was never tried.

3. **`Object.freeze` invariant break:** Phase 45 pins `Object.freeze(PROMPT_SCAFFOLDS)`. v4.3 adds a 6th/7th key by `PROMPT_SCAFFOLDS[NEW_CLASS] = () => ...` (runtime mutation) — throws `TypeError` in strict mode but is silently accepted in some test environments. The ESLint config does NOT pin strict mode universally.

4. **Skip-class confusion:** `SKIP_CLASS_ESCALATIONS` (`fix-prompt-builder.js:378-382`) has 3 keys: FLAKE, LLM_API_ERROR, PASS. If a new ERROR_CLASS is added that should be a skip class (e.g., `USPTO_API_DRIFT` — actually maybe the right move is "wait for USPTO and re-quarantine"), but it's added to PROMPT_SCAFFOLDS, the auto-fix loop spends API budget trying to fix an externally-broken thing. The auto-fix-attempt cap (3 per fingerprint) burns ~$0.30/issue × 3 attempts × 5 USPTO outages/month = $4.50 wasted spend.

**Why it happens:**

The 5-scaffold registry is mature and well-tested; the temptation is "just add another entry, the pattern is clear." The pattern is clear but the cross-cutting integration with `MODEL_ROUTES`, `Object.freeze`, and `SKIP_CLASS_ESCALATIONS` is invisible from inside `fix-prompt-builder.js`.

**How to avoid:**

1. **Mandatory helper invocation pin (Vitest):** `T_SCAFFOLD_NEW_01 — every PROMPT_SCAFFOLDS thunk is the result of buildScaffoldSystemPrompt({ className, fixSurfaceContract })`. Test source: read `fix-prompt-builder.js`, parse all PROMPT_SCAFFOLDS values, assert each resolves to a string that contains the 6 LOCKED FORBIDDEN_PATHS substrings byte-identically. Failure mode: typo or skipped path is caught.

2. **Byte-equivalence pin against Phase 45 baseline (Vitest):** for the EXISTING 5 scaffolds, snapshot the `WRONG_CITATION_SYSTEM`, `LLM_HALLUCINATED_SELECTION_SYSTEM`, etc. strings byte-for-byte. Assert ANY edit to `buildScaffoldSystemPrompt` does NOT change these existing strings. Test name: `T_SCAFFOLD_BYTES_45 — Phase 45 scaffold byte-stability sha256 ===`. Use `crypto.createHash('sha256').update(WRONG_CITATION_SYSTEM).digest('hex')` and pin the hash.

3. **MODEL_ROUTES coverage map (Vitest):** for every new key added to PROMPT_SCAFFOLDS, assert there's an explicit decision in MODEL_ROUTES — either present in the table OR explicitly documented in `llm-router.js` source as "default to sonnet OK because <reason>." Test name: `T_NEW_SCAFFOLD_MODEL_DECISION — every PROMPT_SCAFFOLDS key appears in MODEL_ROUTES OR an /^\/\/ MODEL_DEFAULT_OK: <CLASS>/ comment in llm-router.js`.

4. **Skip-class vs fix-class taxonomy guard:** new ERROR_CLASSes added to `ERROR_CLASSES` (in `tests/e2e/lib/error-codes.js`) MUST appear in EXACTLY ONE of `PROMPT_SCAFFOLDS` (fix-class) or `SKIP_CLASS_ESCALATIONS` (skip-class). Both = fix-class wins (legacy behavior). Neither = unsupported. Test: `T_SCAFFOLD_TAXONOMY_01 — for every ERROR_CLASS, len(intersection({fix, skip})) === 1`.

5. **`Object.freeze` re-pin:** `T_FROZEN_01 — Object.isFrozen(PROMPT_SCAFFOLDS) === true` (Phase 45 already has this; ensure it covers the EXTENDED registry, not just the literal value at the assertion site).

**Warning signs:**

- A new scaffold's PR diff shows a literal string template, not a `buildScaffoldSystemPrompt({...})` call.
- The new scaffold's `FORBIDDEN_PATHS` enumeration shows 5 paths or 7 paths instead of 6.
- `MODEL_ROUTES` is byte-unchanged but a new scaffold class is added — implicit sonnet default; needs explicit justification.
- An ERROR_CLASS appears in both PROMPT_SCAFFOLDS and SKIP_CLASS_ESCALATIONS — taxonomy collision.

**Phase to address:**

Capability-expansion wave Phase 65 (Expanded fix scaffolds). Specific new ERROR_CLASSes TBD by upstream research convergence — `USPTO_API_DRIFT`, `EXTENSION_NOT_LOADED`, `NO_CITATION_PRODUCED`, `UI_BROKEN`, `VERIFIER_DISAGREE` are the candidates from `ERROR_CLASSES` not yet in PROMPT_SCAFFOLDS.

---

### Pitfall 6 (LOAD-BEARING): Heuristic-first triage coverage expansion (6/8 → 8/8) — adding new heuristic rules can mask Tier C disagreements unless `VERIFIER_STRONG_AGREEMENT` semantics are preserved AND the cluster pre-filter interaction is re-tested

**What goes wrong:**

`triage-classifier.js:35-44` defines the Phase 34 trust invariant `VERIFIER_STRONG_AGREEMENT = ({status, tier_used}) => status === 'pass' && (tier_used === 'A' || tier_used === 'B')`. Tier C and Tier D ALWAYS return false — they MUST escalate to LLM second-pass. This is the Phase 34 Pitfall 2 mitigation: Tier C agreement is too weak to confirm a heuristic classification, so the LLM has the final word.

v4.3 pushes 6/8 → 8/8 heuristic coverage (Phase 34 D-03 currently has Rules 1-4 covering FLAKE, CONFIRMED+strong, NOT_REPLAYABLE+specific, ambiguous-fallthrough). The 2 remaining ERROR_CLASSes (`VERIFIER_DISAGREE` CONFIRMED, `WORKER_FALLBACK_FAILED`) need new rules. The hazard:

1. **Tier C masking via the new rule:** a developer writes a new Rule 5 for `VERIFIER_DISAGREE` that fires on `rerunEntry?.verdict === 'CONFIRMED' AND iter.classification === 'VERIFIER_DISAGREE'` — but FORGETS the `VERIFIER_STRONG_AGREEMENT` guard. Now Tier C verifier disagreements are heuristically resolved as `path_taken: 'heuristic'` with `confidence: 0.95` — bypassing the LLM second-pass that the Phase 34 D-02 invariant requires.

2. **Cluster pre-filter interaction (D-11):** `triage-classifier.js:507-` runs the cluster pre-filter on the `ambiguous[]` array AFTER the heuristic loop. If new heuristic rules drain the `ambiguous[]` array, the cluster pre-filter sees FEWER findings, and the cluster threshold (N≥5) is harder to reach — single-call LLM second-passes happen instead of grouped calls. Cost goes UP because grouped calls are amortized. The Phase 34 D-11 cost discipline is silently degraded.

3. **Heuristic false-positive cascade:** a new heuristic rule with confidence 0.9 (heuristics use 0.9–0.95 in `triage-classifier.js:489-497`) overrides what would have been a more cautious LLM classification. If the heuristic is wrong (e.g., classifies `WORKER_FALLBACK_FAILED` as `path_taken: 'heuristic'` based on a `worker_error` string in the iteration but the actual error was a transient network blip — really `FLAKE`), the auto-fix loop dispatches a `WORKER_FALLBACK_FAILED` fix attempt against a flake. Wasted spend + bogus issue.

**Why it happens:**

The 6/8 → 8/8 push is driven by cost (avoid LLM calls) and reproducibility (heuristics are deterministic). The Phase 34 D-02 invariant is a defensive design that biases TOWARD LLM second-pass when uncertain. Adding rules that fire on weaker evidence (Tier C, ambiguous strings) directly inverts this bias.

**How to avoid:**

1. **VERIFIER_STRONG_AGREEMENT mandatory pre-condition (Vitest):** `T_HEURISTIC_NEW_01 — every NEW heuristic rule that fires on a CONFIRMED rerun verdict MUST gate on VERIFIER_STRONG_AGREEMENT(iter.verifier_verdict)`. Concretely: read `triage-classifier.js` source, for each `if (rerunEntry?.verdict === 'CONFIRMED'` block, assert the condition includes `VERIFIER_STRONG_AGREEMENT(`. Source-grep test.

2. **Tier-C masking guard (Vitest):** add a synthetic-iteration fixture where `verifier_verdict.tier_used === 'C'` and `rerunEntry.verdict === 'CONFIRMED'`. Pass it through `runTriage`. Assert `path_taken !== 'heuristic'` for that iteration — it MUST end up in `ambiguous[]` or `llm_single`/`llm_cluster`. Test name: `T_TIER_C_NO_MASK — Tier C agreement never resolved heuristically`.

3. **Cluster pre-filter sample-size pin:** add a regression test that pushes 10 synthetic findings through `runTriage` where all 10 are ambiguous of the SAME category. Assert exactly 1 LLM call (clustered) — not 10. Run the same test WITH the new v4.3 heuristic rules added; assert the cluster-call count does NOT decrease relative to v4.2 baseline. Test name: `T_CLUSTER_SAMPLE_06 — cluster pre-filter sample size preserved after heuristic expansion`.

4. **Confidence ceiling for new rules:** new heuristic rules MUST use confidence ≤ 0.85 (vs 0.95 for the existing strong-agreement rules) UNLESS they have an explicit `VERIFIER_STRONG_AGREEMENT` gate. Documents the "weaker evidence = lower confidence" design.

5. **A/B sanity check post-rollout:** after the 8/8 heuristic rules land live, audit one week of `triage-report.json` outputs. Assert `summary.heuristic_count / summary.total_findings` increased from ~6/8 baseline to ~8/8 NEW baseline. Assert `llm_pass_count` stayed roughly constant (cluster calls preserved) rather than dropping to near-zero (would indicate the LLM second-pass was entirely shorted out).

**Warning signs:**

- A new heuristic rule fires on `iter.classification === '<TARGET>'` without checking `verifier_verdict.tier_used`.
- `summary.cluster_pass_count` drops from ~3-5/week to 0 — means cluster threshold no longer reached.
- The same fingerprint shows three auto-fix attempts with three different proposed fixes (heuristic miscategorized; LLM would have classified differently).
- Tier C verifier verdicts appear in `path_taken: 'heuristic'` findings.

**Phase to address:**

Capability-expansion wave Phase 66 (Heuristic-first coverage). Independent of A/B winner exit; can run parallel to Phase 64 (A/B exit) if both are scoped tightly. Re-test cluster pre-filter regression as a smoke gate before commit.

---

### Pitfall 7 (LOAD-BEARING): Prompt-iter loop — rewriting a scaffold mid-loop and committing to main without human review violates the auto-fix human-gate invariant; infinite retry loops are possible if the loop's exit condition is misdesigned

**What goes wrong:**

The prompt-iter loop is the largest NEW architectural surface in v4.3. The intent: failed fix attempts (verifier-gate rejection, malformed-diff, apply-check-failed) feed back into scaffold rewrites — the LLM proposes an updated `WRONG_CITATION_CONTRACT` based on the failure pattern. Three architectural hazards:

1. **Scaffold rewrite + commit-to-main without review:** if prompt-iter writes to `tests/e2e/lib/fix-prompt-builder.js` and the dispatcher's `git apply --check` accepts it (the file is NOT in FORBIDDEN_PATHS), the rewritten scaffold ships through auto-fix → verifier-gate → human-review-merge — but the human is reviewing a CODE PR with a 200-line scaffold rewrite buried in it. The Phase 47 trust invariant (`assertTripleGate`: verified-label + merged + triage-sourced) does NOT protect against scaffold mutation because the scaffold is "production code" by definition. Prompt-iter can launder a scaffold change through the normal auto-fix path.

2. **Infinite retry via fingerprint reuse:** the auto-fix dispatcher already caps at 3 attempts per fingerprint (`auto-fix.mjs:206 FIX_ATTEMPT_CAP = 3`). Prompt-iter, if it generates a NEW fingerprint on each rewrite (e.g., includes the rewrite-iter count in the fingerprint), bypasses the cap. After N=10 iterations the loop has spent ~$10 trying variants of the same issue. The `human-review-required` label is never added because each iter is a "fresh issue" from the dispatcher's perspective.

3. **FORBIDDEN_PATHS locked-files write attempt:** if the prompt-iter loop is implemented as a meta-LLM-call that generates a new `fixSurfaceContract`, and the new contract is INSERTED into `fix-prompt-builder.js`, the resulting auto-fix PR may touch `fix-prompt-builder.js` — which is NOT in FORBIDDEN_PATHS (it's pure logic, not data). The check-diff-guard accepts the PR. But the file is in scope of `eslint.config.js:194-222` (PROMPT-04 purity rule) — if the rewrite introduces a `node:fs` import (the prompt-iter LLM may add file I/O for "log the rewrite history"), ESLint fails AFTER the PR is merged, breaking main.

4. **SDK guard violation via prompt-iter:** if prompt-iter is implemented as a separate Node script that calls the Anthropic SDK directly to generate the scaffold rewrite, it MUST import via `invokeAnthropicSdkWithLedger`. The `eslint.config.js:253-281` single-entry-point rule pins this. A naive `import Anthropic from '@anthropic-ai/sdk'` in the new prompt-iter script trips the rule (good) — but if the script is added to the `ignores` list out of haste, the trust boundary erodes silently.

5. **Cost ledger explosion:** without an iter-budget per loop, prompt-iter can chain 10–50 LLM calls per failed fix attempt. The Phase 39 `ISSUE_HARD_CAP_USD = 1` ($1 per issue) is the only structural defense — but $1 is enough for ~30 sonnet calls. Realistic prompt-iter wave: 3 fix attempts × 5 iter-rewrites × $0.05 = $0.75/issue ceiling per loop. Multiply by 10 issues triaged in a week = $7.50/week added burn rate.

**Why it happens:**

Prompt-iter is conceptually a feedback loop on the dispatcher's feedback loop. It is a new control surface with no Phase-precedent — the v4.0–v4.2 design assumed the human review is the closing leg. Adding prompt-iter shifts that close-the-loop work to an LLM, but the human-gate trust invariant was designed under the assumption that scaffolds are static.

**How to avoid:**

1. **CAPTURE-AND-SURFACE-FOR-HUMAN-REVIEW MODE ONLY in v4.3** (recommend): prompt-iter does NOT auto-edit scaffolds. It generates a proposed rewrite, appends to `.planning/prompt-iter-proposals/<fingerprint>-<iter>.md`, and surfaces via a labeled issue. Human reads, edits scaffold manually, ships in next milestone. Defer "full automation" to v4.4+ when the trust-boundary design is ratified.

2. **FORBIDDEN_PATHS extension (load-bearing):** add `tests/e2e/lib/fix-prompt-builder.js` AND `tests/e2e/lib/llm-router.js` to the FORBIDDEN_PATHS regex bank in `scripts/check-diff-guard.mjs`. Any auto-fix PR that touches these is REJECTED at diff-guard. Pin via `T_FORBIDDEN_PATHS_BANK_v43 — bank contains fix-prompt-builder.js AND llm-router.js`. The single source of truth (per Phase 45 invariant) must be updated in BOTH `check-diff-guard.mjs` AND `fix-prompt-builder.js:buildScaffoldSystemPrompt` SAME COMMIT.

3. **Prompt-iter budget cap (Vitest):** if prompt-iter is implemented, pin `PROMPT_ITER_MAX_PER_FINGERPRINT = 2` in a new module. Per-fingerprint counter check before each iter. Test: `T_PROMPT_ITER_BUDGET_01 — after 2 iter-rewrites per fingerprint, next call returns abstention`.

4. **Single-entry-point preservation:** if a new prompt-iter script (e.g., `scripts/prompt-iter.mjs`) imports the SDK, it MUST go through `invokeAnthropicSdkWithLedger`. The ESLint catch-all rule (`eslint.config.js:253-281`) does this by default — DO NOT add `prompt-iter.mjs` to the `ignores` list. Pin: `T_ESLINT_NO_NEW_IGNORE — eslint.config.js ignores list size unchanged in v4.3 (still 6 entries)`.

5. **Fingerprint immutability:** prompt-iter does NOT modify the fingerprint. Iter count goes into a separate `iter_n` ledger field. Pin: `T_PROMPT_ITER_FP_01 — fingerprint identical across iter cycles`.

6. **Phase 47 trust invariant preservation:** if prompt-iter is implemented, the rewrite proposal is written to an `auto-fix:prompt-iter` PR (DIFFERENT branch namespace from `auto-fix/*`). The `auto-fix-promote.mjs` does NOT recognize `auto-fix:prompt-iter` PRs — `assertTripleGate` throws. Pin: `T_TRIPLE_GATE_PROMPT_ITER_PR — assertTripleGate throws when label === 'auto-fix:prompt-iter'`.

**Warning signs:**

- A PR titled "auto-fix: WRONG_CITATION for <case>" includes changes to `tests/e2e/lib/fix-prompt-builder.js` in the diff.
- The ledger shows >5 entries for the SAME fingerprint within a 24-hour window.
- `tests/e2e/.llm-spend-ledger.json` monthly `total_usd` jumps from ~$2/month to ~$15/month after prompt-iter ships.
- A new script in `scripts/` imports `@anthropic-ai/sdk` directly (ESLint catches this; the warning is the developer adding the file to `ignores`).
- ESLint or Vitest fails on main AFTER an auto-fix merge — means prompt-iter mutated a file that broke a downstream invariant.

**Phase to address:**

Capability-expansion wave Phase 67 (Prompt-iter loop). HIGHEST RISK new capability in v4.3 — recommend deferring to v4.4 OR scoping to capture-and-surface-only mode. Per PROJECT.md: "scope note: broader than v4.2... If too big, Prompt-iter loop or scaffold expansion can be deferred to v4.4 at requirements-scoping time."

---

### Pitfall 8: Synthetic-issue cleanup — closing #20/21/22/23 prematurely (before SWEEP-03/04 PASS evidence) destroys the v4.3 DoD; the cleanup-script touching real triage issues by accident corrupts production state

**What goes wrong:**

v4.3 (D) closes the 4 mutator-injected GOOGLE_DOM_DRIFT triage issues (#20/21/22/23) after the architectural work proves SWEEP-03/04 PASS. Two hazards:

1. **Premature close (DoD violation):** an operator runs the cleanup script BEFORE SWEEP-03/04 produce live evidence. The 4 synthetic issues are closed; the v4.3 DoD ("live UAT-47-a/b/SWEEP-03/04/06 PROVEN on origin/main + at least one real production fix") requires the evidence trail. Closing issues removes the labels (`triage`, `GOOGLE_DOM_DRIFT`) and the per-issue ledger entries lose their `gh issue view`-discoverable provenance. The v4.2 audit's `.planning/milestones/v4.2-MILESTONE-AUDIT.md` references issues #20/21/22/23 by number; closing them does NOT remove them from history but DOES change `gh issue view <n>` to "Closed" state which affects the cleanup-evidence template.

2. **Cleanup script accidentally touching real triage issues:** the cleanup script (likely `scripts/uat-cleanup.mjs`, SWEEP-06 scope) filters synthetics by some marker — the SOURCE_TAG `'fixture-mutator-uat-47b'`, the `<!-- fp: aaaaaaaaaaaa -->` v2 marker substring, or the title prefix `[fixture-mutator]`. Failure mode: the filter is a single substring (e.g., `--label GOOGLE_DOM_DRIFT`) and accidentally matches a REAL triage issue with the same label. The real issue is closed. Production triage backlog is corrupted.

3. **Cleanup-script ledger pollution:** cleanup script's own ledger writes (if it records its actions) MUST self-tag `source: 'uat-cleanup-v43'` to be filterable. Pre-Phase 62 (forensic-ledger schema hardening) these can leak as untagged orphan entries — the EXACT failure mode that motivated the v4.3 schema hardening in the first place. Cleanup ↔ hardening ordering matters.

**Why it happens:**

The natural urge after seeing SWEEP-03/04 PASS once is to "clean up the test issues" — operator-side enthusiasm. The script's filter is initially written for the known-state of 4 synthetic issues; future real GOOGLE_DOM_DRIFT issues from real production won't match the `[fixture-mutator]` prefix BUT may match other filter terms.

**How to avoid:**

1. **Pre-cleanup precondition check (Vitest):** the cleanup script MUST refuse to run unless a sentinel file `.planning/sweep-03-04-pass-evidence.yaml` exists with a non-empty `passed_at_iso` field. Pin: `T_CLEANUP_PRECOND_01 — uat-cleanup.mjs throws if precondition sentinel absent or empty`.

2. **Triple-tagged filter (load-bearing):** the cleanup script's issue-match filter MUST require ALL of: (a) title starts with `[fixture-mutator]` LITERAL prefix, (b) body contains `<!-- fp: ` AND `Source: fixture-mutator-uat-47b` substring, (c) labels include BOTH `triage` AND the ERROR_CLASS label. A real triage issue would never match all three. Pin: `T_CLEANUP_FILTER_01 — match function returns false for synthetic real-triage fixtures missing any leg of the triple`.

3. **Dry-run mode default + explicit `--confirm` (load-bearing):** cleanup script defaults to `--dry-run` (prints what it WOULD close, exits 0). Requires explicit `--confirm` flag to actually close. Pin: `T_CLEANUP_DRYRUN_01 — script exits without mutation unless --confirm passed`.

4. **Order of operations in the milestone:** Phase 68 (synthetic-issue cleanup) runs AFTER Phase 62 (forensic-ledger hardening) so the cleanup-script's own ledger writes are properly tagged. AFTER Phase 61 (max-turns + mutator) AND after at least one SWEEP-03 PASS evidence on origin/main.

5. **Cleanup-evidence capture before close:** before closing any issue, the cleanup script archives the issue body + the cross-referenced ledger entries into `.planning/milestones/v4.3-phases/68-cleanup/closed-issues-archive.json`. This is the audit trail for "we had synthetic issues; here's what was in them."

**Warning signs:**

- A real triage issue (NOT mutator-sourced) appears closed with comment "[uat-cleanup-v43]".
- The cleanup script's ledger writes have `source: undefined` or `source: null`.
- Issues #20/21/22/23 are closed but `gh issue view 20 --json comments` shows no cleanup-script comment trail.
- The cleanup script runs without the `.planning/sweep-03-04-pass-evidence.yaml` sentinel.

**Phase to address:**

Carry-over wave Phase 68 (Synthetic-issue cleanup). MUST be the FINAL phase of the carry-over wave — runs only after evidence is captured.

---

### Pitfall 9: Cost discipline regression — v4.2 burned ~$0.50–$2 across 3 SWEEP-03 attempts without closing; v4.3's expansion surface (5 new capabilities + 4 carry-over) compounds the realistic budget if cost-discipline guards are not pre-budgeted

**What goes wrong:**

v4.2 audit records: three SWEEP-03 attempts spent on subscription transport (~$0 cost due to Max 5 free credit pool) PLUS one attempt that needed an API key (~$0.50-2). v4.3 adds capabilities that EACH have an LLM-call surface:

- Diagnostic mutator: 0 LLM cost (deterministic Node generation)
- `--max-turns 5`: ~3-5× cost per call (1 turn → up to 5 turns), so per-call $0.05 → $0.20
- Forensic-ledger hardening: 0 LLM cost (pure validation)
- A/B winner exit: 0 LLM cost (reads ledger)
- Expanded fix scaffolds: per new class, ~1 SWEEP per UAT × $0.20/call × 3 attempts cap = $0.60/class
- Heuristic-first 8/8 coverage: REDUCES LLM cost (more heuristic resolution)
- Prompt-iter loop: HIGHEST risk — $0.05/iter × up to 2 iters × 3 fix attempts = $0.30/issue MORE than baseline
- Synthetic-issue cleanup: 0 LLM cost

Realistic v4.3 budget estimate (assuming 2 new scaffolds, 1 prompt-iter cycle, 3 SWEEP-03 retries for the carry-over): `(2 × $0.60) + (1 × $0.30 × 10 issues) + (3 × $0.20 max-turns × 5 turns)` ≈ **$7.20**. The Phase 39 monthly cap is $100 ($80 warn). Single-milestone burn of $7 is fine. But: if `--allowed-tools` is omitted and Claude burns 5 turns reading 50 files each call, per-call cost balloons to ~$1, and the realistic budget becomes ~$50. The $100 hard cap is hit in a single bad week.

The v4.2 lesson: $0.50-2 per SWEEP-03 attempt × 3 attempts × 10 SWEEP campaigns/year = $60-180/year just for UAT validation. Add the 5 new capabilities and the realistic v4.3 burn rate could reach $200/year — half the $100/month cap.

**Why it happens:**

Each individual capability looks cheap (~$0.20/call). The compound risk is that all 5 capabilities EACH need their own UAT validation, each UAT campaign is 3-5 SWEEP attempts, and the `--max-turns 5` change multiplies all call costs.

**How to avoid:**

1. **Pre-milestone budget gate:** the v4.3 ROADMAP.md `<budget>` block declares: "Pre-budgeted spend cap: $15 for the entire v4.3 milestone (carry-over + expansion). Hard ceiling: $30. Anything above $30 BLOCKS the milestone close until investigation." This is roadmap-side discipline. Pin in `.planning/STATE.md` under a `## Budget` section.

2. **Per-phase spend probe:** before each new capability lands, run `node scripts/a-b-winner.mjs` or a new `scripts/spend-snapshot.mjs` to record month-to-date burn. Each phase plan records spend-at-phase-start and spend-at-phase-end. Vitest assertion: `T_PHASE_BUDGET_<N> — phase spend < $5`.

3. **`--max-turns` post-relaxation regression check:** after Phase 61 lands `--max-turns 5`, run a 5-issue subscription-mode smoke wave. Record per-call cost. Assert mean per-call cost ≤ $0.30 (not the ~$0.05 baseline of `--max-turns 1`, BUT not the runaway $1 of "5 turns × 50 file reads"). Pin: `T_MAX_TURNS_COST_BOUND_01 — mean per-call cost < $0.30 across 5 smoke issues`.

4. **Cap-block evidence test:** before any SWEEP-03/04 spend, verify `checkIssueCap`, `checkPrCap`, `checkDayCap` are wired and reachable from `auto-fix.mjs`. The v4.2 audit confirmed these are in place but the v4.3 expansion may introduce new ledger-write paths that bypass them. Pin: every new ledger-write call site MUST be preceded by a cap-precheck in the same function.

5. **Synthetic-issue-cleanup spend reset:** at Phase 68 close, the `tests/e2e/.llm-spend-ledger.json` MUST be filtered to remove ALL `phase: '56-uat'`, `phase: '57-uat'`, etc. entries from active aggregation views (NOT deleted from disk; the ledger is append-only). The aggregation script reads only `phase: NOT matching /-uat$/` for production spend dashboards.

**Warning signs:**

- A single phase's spend exceeds $5 in real costs.
- The cumulative v4.3 spend exceeds $15 with multiple capabilities still in progress.
- Per-call cost-per-fix p50 is >$0.30 after the `--max-turns` change.
- `combinedMonthlyTotalByTransport` shows monthly trending toward $80 warn threshold.

**Phase to address:**

CROSS-CUTTING (no single phase). Roadmap-level constraint: budget cap in `.planning/STATE.md` + phase-plan precondition + post-phase spend-snapshot. Phase 61 (max-turns) gets the cost-bound regression test specifically.

---

### Pitfall 10 (LOAD-BEARING): Trust-invariant erosion — `assertTripleGate` body byte-unchanged is the v4.1/v4.2 inheritance; v4.3's expansion surface MUST avoid any commit that touches the function body, even incidentally (e.g., import reordering, comment edit)

**What goes wrong:**

`scripts/auto-fix-promote.mjs:assertTripleGate` is the load-bearing trust function: it reconstructs the human-gate invariant (verified-label + merged + triage-sourced) before the SkipCiGuard exemption is applied. Phase 53 D-10 pins `assertTripleGate` body sha256-equivalent to the Phase 53 baseline. Phase 58 PROMOTE-04 re-verified this after adding outcome ledger writes (the writes are OUTSIDE the function body).

v4.3 capability expansion has multiple touchpoints near `auto-fix-promote.mjs`:

1. A/B winner exit (Phase 64) reads ledger — but if the test wiring imports from `auto-fix-promote.mjs` (because outcome entries live there), an `import` reorder MAY change the file's content even if `assertTripleGate` body is unchanged. The sha256 pin is on the FUNCTION BODY, not the whole file — but a code-formatting auto-tool may re-flow function declarations.

2. Forensic-ledger hardening (Phase 62) wraps the `appendLedgerEntry(LEDGER_PATH, ...)` calls at lines 521 + 544. If the wrapping is a literal call replacement (`appendLedgerEntry(...)` → `safeAppendLedger(...)`) it does NOT touch `assertTripleGate`. If the wrapping is a try/catch wrapping a larger block that INCLUDES `assertTripleGate`'s caller, the function body could be incidentally touched.

3. New ERROR_CLASS scaffolds (Phase 65) add new entries to `RECOGNIZED_LABELS` in `auto-fix.mjs:225` — but `auto-fix-promote.mjs` has its OWN label-reading logic via `args.prLabels`/`args.sourceIssueLabels`. If the new ERROR_CLASS adds a partial-promote variant, the partial-gate code path may grow — and `assertPartialGate` (Phase 53 sibling) is a separate entry point. The risk is that a developer touches `assertTripleGate` "to add the new class" not realizing `assertPartialGate` is the right place.

4. Prompt-iter loop (Phase 67) — IF it surfaces a new PR namespace (`auto-fix:prompt-iter`), the `assertTripleGate` must REJECT this namespace. Adding a label-name check inside the function body changes its sha256.

**Why it happens:**

`assertTripleGate` is a small, well-understood function. The pressure to modify it is constant — every new feature has SOME interaction with promotion. The Phase 53 byte-stability invariant is easy to forget because it's enforced at commit-review, not pre-commit.

**How to avoid:**

1. **sha256 regression test pin (Vitest):** `T_ASSERT_TRIPLE_GATE_BYTES_v43 — sha256(assertTripleGate body) === <pinned hash>`. The pinned hash is the Phase 53 baseline (also Phase 58 PROMOTE-04 re-verified). Test reads `auto-fix-promote.mjs`, parses out the function body (regex-based extraction from `function assertTripleGate(` to matching `}`), computes sha256, asserts ===.

2. **Phase plan must pre-declare touch scope:** every v4.3 phase plan must enumerate files touched. Phases touching `auto-fix-promote.mjs` must include a checklist item: "DOES NOT modify assertTripleGate body — verified by sha256 pin." If a phase NEEDS to modify it, the plan must explicitly say so AND update the pinned hash in the SAME commit.

3. **Wrapping pattern preserves body:** for Phase 62 hardening, the wrapping is at the import layer: `import { safeAppendLedger as appendLedgerEntry }` (rename on import). The existing `appendLedgerEntry(LEDGER_PATH, ...)` call sites are byte-unchanged; the import statement is the only change. This preserves `assertTripleGate` AND every other function in the file byte-for-byte except for the import block.

4. **New PR namespace handled OUTSIDE assertTripleGate:** if Phase 67 prompt-iter introduces a new PR namespace, the namespace-check happens at the dispatcher (`auto-fix-promote.mjs` `main()` function entry), NOT inside `assertTripleGate`. The trust invariant stays untouched; the namespace filter is at the caller.

5. **Sibling-function pattern (Phase 53 PARTIAL precedent):** if v4.3 needs a new trust-gated path, mirror Phase 53's pattern: add `assertPromptIterGate` (or similar) as a SEPARATE entry point. Never extend `assertTripleGate`.

**Warning signs:**

- A v4.3 commit's diff for `auto-fix-promote.mjs` shows ANY change between `function assertTripleGate(` and the matching `}`.
- The Vitest sha256 pin fails — investigate which character changed (likely a whitespace, comment edit, or auto-formatter).
- A new variable or import is added "near" the function body that displaces the function in the file (changes its line numbers but not its bytes — sha256 still passes, but the surrounding line numbers in other tests' grep patterns may break).

**Phase to address:**

CROSS-CUTTING. The sha256 pin lives in `tests/unit/auto-fix-promote-gate.test.js` as a new test added in Phase 61 (first carry-over phase). Every subsequent v4.3 phase verifies the pin still passes.

---

### Pitfall 11: Sole-maintainer bypass on ruleset 17086676 (post-v4.2 reversal 2026-06-06) enables `gh pr merge --admin` shortcuts that BYPASS the auto-fix human-gate when used; v4.3's expansion may inadvertently train operator muscle memory to skip the draft→review path

**What goes wrong:**

The 2026-06-06 ruleset reversal re-added `@tonyrowles` (actor_id 254599900) as permanent bypass actor with `bypass_mode: always`. Auto-fix bot PRs continue to flow through draft→ready→human-review because the bot is `github-actions[bot]`, not the maintainer. But: the maintainer can use `gh pr merge <n> --admin` to bypass required checks on ANY PR — including draft auto-fix PRs.

v4.3 risk surfaces:

1. **Capability-expansion operator pressure:** running through 5 new capabilities + 4 carry-over phases creates many "just merge this small fix" moments. Sole-maintainer bypass makes this easy. If even ONE auto-fix:verified PR is merged via `--admin` instead of waiting for `verifier-gate` to fully complete, the v4.3 audit trail has a gap — was the PR REALLY verified, or did the maintainer bypass on a busy day?

2. **CI required-checks load-bearing:** the v4.2 closure decision says "CI required-checks (`verifier-gate` + `deps-update-gate`) remain unchanged as the load-bearing trust boundary." If `--admin` merge bypasses verifier-gate, the trust boundary is bypassed too. The maintainer may not realize that `--admin` does this (GitHub UI clarity is mediocre on what `--admin` actually skips).

3. **`assertTripleGate` is NOT a defense against bypass:** the triple-gate requires `verified-label + merged + triage-sourced`. `--admin` merge satisfies `merged`. If the maintainer also `gh issue edit <n> --add-label auto-fix:verified` manually before merging (out of habit, because the bot was slow), the triple-gate passes. The auto-promote workflow fires. A non-verified change lands in golden.

4. **Ledger entries on bypassed merges:** the Phase 58 PROMOTE-02 outcome entry (`source: 'auto-fix-promoted', outcome: 'pass'`) is written by `auto-fix-promote.mjs` when `runPromote` succeeds. A `--admin`-merged auto-fix PR DOES trigger `auto-fix-promote.mjs` (the workflow runs on merge events). The ledger records `outcome: 'pass'` for a PR that was never verified. The A/B winner reads this entry and counts it as a successful fix for whichever model arm.

**Why it happens:**

Sole-maintainer projects have valid reasons to bypass (security hotfixes, CI infrastructure broken, etc.). The post-v4.2 reversal documents the rationale. But the auto-fix loop's design assumes EVERY PR goes through verifier-gate. Bypass mode + auto-fix loop = silent erosion.

**How to avoid:**

1. **Runbook discipline (markdown, NOT enforced):** add to `.planning/STATE.md` a `## Bypass Conventions` section: "DO NOT use `gh pr merge --admin` on `auto-fix/*` branches. EVER. If `verifier-gate` is stuck, restart the workflow (`gh run rerun <id>`) — DO NOT bypass."

2. **Bypass-detection probe (Vitest read of GH API):** add `scripts/audit-bypass-merges.mjs` — queries `gh api repos/<owner>/<repo>/actions/runs` for `verifier-gate` runs that completed AFTER the PR was merged (impossible under normal flow — verifier-gate completes BEFORE merge). Any such run indicates a bypass. The script outputs a CSV of bypassed merges per month. Add to weekly digest.

3. **A/B winner filter on bypass-tainted entries:** add a `--admin-bypass` filter to `a-b-winner.mjs` — entries with `iso` from a `--admin`-merged PR are EXCLUDED from per-arm pass counts. Read the bypass-merges CSV; filter the ledger.

4. **Phase 67 (prompt-iter) MUST NOT be implemented via bypass:** if prompt-iter is added, its PRs MUST go through the same draft→review→merge path as auto-fix. No `--admin` exception.

5. **Re-mention the post-v4.2 reversal context:** every v4.3 phase plan that touches `auto-fix-promote.mjs` or the verifier-gate workflow MUST cite the 2026-06-06 reversal note in CONTEXT.md. The trust boundary is now "CI checks + draft→review discipline," not "ruleset enforcement." Phase plans that forget this drift.

**Warning signs:**

- `gh api repos/<owner>/<repo>/pulls/<n>/timeline` shows a `merged_by: tonyrowles` event with `mergeable_state: 'unstable'` (i.e., not all checks passed).
- The verifier-gate run for an `auto-fix/*` branch has status `cancelled` or `in_progress` at the time the PR was merged.
- An auto-promote-driven golden corpus change cannot be traced back to a PASSING verifier-gate run.
- The bypass-detection script shows ANY merge in `auto-fix/*` branches.

**Phase to address:**

CROSS-CUTTING. The bypass-detection probe ships as a sub-task in Phase 62 (forensic-ledger hardening) — same surface, similar discipline. The runbook note lives in `.planning/STATE.md` from the start of the milestone.

---

### Pitfall 12 (LOAD-BEARING): Auxiliary-leak vector — Phase 56 `safeAppendLedger` covers `scripts/auto-fix.mjs` but NOT `scripts/auto-fix-promote.mjs` (2 sites) or `scripts/e2e-explore.mjs` (2 sites); v4.3 hardening must extend coverage WITHOUT re-breaking the 33 Vitest ledger tests

**What goes wrong:**

The 2026-06-08 forensic finding: 3 orphan `claude-opus-4-7[1m]` ledger entries with no source/transport. The memory note `project_auto_fix_ledger_leak_vector.md` identifies `scripts/auto-fix.mjs` as the original leak vector — closed by Phase 56's `safeAppendLedger`. Direct enumeration shows the leak vector is LARGER:

**Unguarded direct `appendLedgerEntry(LEDGER_PATH, ...)` sites:**
- `scripts/auto-fix-promote.mjs:521` (Phase 58 outcome:'fail') — sets `source: 'auto-fix-failed' + transport: 'subscription'` inline. Schema-CORRECT but NOT through a guard wrapper.
- `scripts/auto-fix-promote.mjs:544` (Phase 58 outcome:'pass') — sets `source: 'auto-fix-promoted' + transport: 'subscription'` inline. Schema-CORRECT but NOT through a guard wrapper.
- `scripts/e2e-explore.mjs:262` (Phase 31 LLM-mode iteration) — schema status uncertain (predates LEDGER-01).
- `scripts/e2e-explore.mjs:313` (Phase 31 LLM-mode iteration final write) — schema status uncertain.

The Phase 58 promote sites are CORRECT (they self-tag) but BYPASS the `safeAppendLedger` CI-guard. If a developer runs `node scripts/auto-fix-promote.mjs --skip-ci-guard` locally on a non-CI shell, the promote ledger entries DO write to the committed file. This is the leak vector the Phase 56 wrapper was designed to close — but only in `auto-fix.mjs`.

The Phase 31 `e2e-explore.mjs` sites may or may not be susceptible — the `invokeClaudePWithLedger` wrapper at `llm-driver.js:387` REFUSES in CI, so e2e-explore is local-only by design. Local writes to the committed ledger are EXPECTED for this path. But entries from e2e-explore may lack `source`/`transport` depending on which Phase wrote them; v4.3 forensic hardening (Pitfall 3) needs to backfill these.

**Why it happens:**

Phase 56 LEDGER-02 was scoped to "auto-fix.mjs scope." The Phase 58 PROMOTE work added two more direct call sites but did NOT extend the guard pattern — the rationale was probably "auto-fix-promote runs only in CI" but the `--skip-ci-guard` escape hatch invalidates that.

**How to avoid:**

1. **Extend `safeAppendLedger` to auto-fix-promote.mjs:** add a local `safeAppendLedger` wrapper in `auto-fix-promote.mjs` (or import a shared helper). Wrap the 2 call sites at lines 521 + 544. Pin: `T_PROMOTE_LEDGER_GUARD_01 — auto-fix-promote.mjs has no direct appendLedgerEntry calls; all writes go through safeAppendLedger`. Source-grep test.

2. **Extend to e2e-explore.mjs:** same pattern. The wrapper for e2e-explore.mjs auto-defaults `source: 'e2e-explore' + transport: 'subscription'` if caller omits them (back-compat with Phase 31 legacy entries). Pin: `T_EXPLORE_LEDGER_GUARD_01 — e2e-explore.mjs writes go through safeAppendLedger with auto-default source`.

3. **Shared helper extraction (preferred over per-file duplication):** create `tests/e2e/lib/safe-append-ledger.js` that exports `safeAppendLedger(entry, { defaultSource, defaultTransport })`. Import from `auto-fix.mjs`, `auto-fix-promote.mjs`, `e2e-explore.mjs`. Each file passes its own defaults. Pin: `T_SHARED_GUARD_01 — safe-append-ledger.js exports a function consumed by 3 scripts`.

4. **Test 48 (committed-ledger bootstrap) regression:** `tests/unit/llm-ledger.test.js:Test 48` asserts the on-disk ledger matches the LEDGER-04 contract. After v4.3 hardening, re-run Test 48 with a freshly cloned `.llm-spend-ledger.json` to confirm orphan entries no longer accumulate. Pin: `T_NO_ORPHAN_v43_01 — every iterations[] entry in committed ledger has source AND transport`.

5. **Pre-Phase 62 verification:** before Phase 62 wrapping ships, run the orphan-entry detection (`jq '.months | .. | .iterations[]? | select(.source == null or .transport == null)' tests/e2e/.llm-spend-ledger.json`) on origin/main. Document baseline orphan count (should be 3, per 2026-06-08). After Phase 62, run again — must be ≤3 (existing orphans persist; no NEW orphans).

**Warning signs:**

- After Phase 62, the orphan-entry detection script returns ANY new orphan dated AFTER the Phase 62 merge commit.
- A grep `grep -rn 'appendLedgerEntry(LEDGER_PATH' scripts/ tests/e2e/lib/` returns ANY result not inside a wrapper function definition.
- `auto-fix-promote.mjs --skip-ci-guard` runs locally and writes to the committed ledger.

**Phase to address:**

Carry-over wave Phase 62 (Forensic-ledger schema hardening). The shared helper extraction is the right minimal-touch surface that closes ALL three leak sites.

---

### Pitfall 13 (MEDIUM CONFIDENCE): Prompt-iter loop cost-explosion via iter-count fingerprint reuse — if prompt-iter generates a NEW fingerprint per iter, the FIX_ATTEMPT_CAP=3 in `auto-fix.mjs:206` is bypassed structurally

**What goes wrong:**

`auto-fix.mjs:646-666` reads `countFixAttempts(ledger, fingerprint)` and exits 3 + adds `human-review-required` label if attempts ≥ 3. The fingerprint is the 12-hex extracted from the issue body marker. If prompt-iter generates a NEW issue (or a comment-updated issue with a NEW fingerprint marker) for each scaffold rewrite iteration:

- Iter 1: original fp `aaaaaaaaaaaa` — 1 attempt
- Iter 2: prompt-iter rewrote scaffold, new fp `bbbbbbbbbbbb` — 1 attempt (counter starts fresh)
- Iter 3: prompt-iter rewrote scaffold again, new fp `cccccccccccc` — 1 attempt
- ...
- Iter N: still 1 attempt each, never hits cap

Per-iter cost is ~$0.20 (subscription) or $0.30 (SDK). At iter N=20, cumulative spend per "issue" is $4-6. Multiply by 10 issues triaged/month = $40-60/month JUST from prompt-iter — half the monthly cap.

**Why it happens:**

The fingerprint is computed from issue content (`selectedText + patentFile` v1 formula). If prompt-iter changes the issue content (adds an `iter_n: N` comment), v2 fingerprints would normally collide via the dual-search in `findMatchingIssue` (Phase 35) — BUT prompt-iter may sidestep this by creating SEPARATE issues per iter (one per scaffold attempt). Each new issue = new fingerprint = fresh attempt counter.

**How to avoid:**

1. **Single-issue-per-fingerprint invariant:** prompt-iter NEVER creates a new GitHub issue. Iter rewrites happen as COMMENTS on the original issue, with an `iter_n` HTML comment marker. Pin: `T_PROMPT_ITER_NO_NEW_ISSUE — prompt-iter script does not call gh issue create`.

2. **Independent prompt-iter cap (Phase 67):** `PROMPT_ITER_MAX_PER_FINGERPRINT = 2`. Counter stored in a sibling file `tests/e2e/.prompt-iter-state.json` (NOT in the ledger, NOT in the issue body — prevents prompt-iter from gaming its own counter). Pin: `T_PROMPT_ITER_CAP_01 — script exits after 2 iters per fingerprint, independent of FIX_ATTEMPT_CAP`.

3. **Cumulative cost cap per fingerprint:** `PROMPT_ITER_COST_CAP_USD = 0.50` per fingerprint. Computed from `issueTotal(ledger, issueId)` BEFORE each prompt-iter call. Pin: `T_PROMPT_ITER_COST_01 — script aborts if cumulative issue spend > $0.50`.

4. **Audit log:** every prompt-iter invocation writes a `source: 'prompt-iter'` ledger entry. Even on cap-reached short-circuit, write an entry with `escalate: 'prompt-iter-cap-reached'` for audit.

**Warning signs:**

- Multiple `gh issue` entries for the same underlying defect, each at attempts=1 in the ledger.
- The committed ledger shows `source: 'prompt-iter'` entries with cumulative cost > $0.50 for a single issueId.
- `tests/e2e/.prompt-iter-state.json` is missing or has been reset.

**Phase to address:**

Capability-expansion wave Phase 67 (Prompt-iter loop) — see also Pitfall 7 for the broader prompt-iter design hazards. If Phase 67 is deferred to v4.4, this pitfall is also deferred.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Bump `--max-turns` to 5 without `--allowed-tools Read,Glob,Grep` | Single-line code change | Edit/Bash/Write becomes available; trust invariant silently violated; cost runaway potential | Never; tool-allow-list is co-load-bearing with max-turns |
| Extend `inject-defect.mjs:buildBody` without a corresponding fixture pin against `google-patents-page.js` selectors | Fast iteration on synthetic content | Mutator drift → fictional fix proposal → verifier-gate rejection cycle burns SWEEP-03 budget | Never; co-design with selector vocabulary required |
| Add `source`/`transport` required-field validation to `appendLedgerEntry` body | One change closes all leak vectors | Breaks 33+ pre-existing Vitest ledger tests (v4.2 Pitfall 7 lesson) | Never; wrap at call sites |
| Pick `TIE_THRESHOLD = 0.05` for A/B winner (default) | Looks like good ML practice | Noisy 1-2-sample flips at N=20-30 per arm | Only when N≥100 per arm reached; raise to 0.10 below |
| Add a new PROMPT_SCAFFOLDS entry inline (not via `buildScaffoldSystemPrompt`) | Saves 5 minutes refactoring | Phase 45 byte-stability invariant broken; FORBIDDEN_PATHS list may drift; new class skips MODEL_ROUTES decision | Never; helper invocation is the invariant |
| New heuristic rule fires on `rerunEntry?.verdict === 'CONFIRMED'` without `VERIFIER_STRONG_AGREEMENT` gate | Higher heuristic resolution rate | Tier C masking → LLM second-pass shorted; Phase 34 D-02 invariant broken | Never; the gate is the Phase 34 trust invariant |
| Prompt-iter writes scaffold rewrites directly to `fix-prompt-builder.js` via auto-fix PR | Closes the loop fully | Scaffolds mutate without human review; Phase 47 trust invariant laundered | Never in v4.3; capture-and-surface-for-human-review only |
| Run cleanup-script without precondition sentinel | Quick test cleanup | Closes synthetic issues before SWEEP-03/04 evidence captured; DoD violated | Only with `--dry-run`; never with `--confirm` until sentinel present |
| Use `gh pr merge --admin` on auto-fix/* PRs | Faster merge when verifier-gate is slow | Bypasses trust boundary; ledger records "verified" outcome for unverified fix | Never; rerun the workflow instead |
| Extend `assertTripleGate` body to handle new ERROR_CLASS or new PR namespace | Centralizes label logic | Phase 53 sha256 invariant broken; downstream tests fail | Never; mirror the Phase 53 partial-gate sibling pattern |
| Skip `safeAppendLedger` wrap of `auto-fix-promote.mjs` call sites because "they only run in CI" | One less file to change | `--skip-ci-guard` path leaks; future operator who runs the promote script locally writes to committed ledger | Never; the guard is universal |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| `--max-turns 5` + diagnostic-injection mutator extension | Ship the mutator extension first; bump max-turns in a follow-up commit | Co-ship in the SAME commit per v4.2 audit (A) AND (B) are jointly required for SWEEP-03/04 |
| Forensic-ledger hardening + Phase 56 `safeAppendLedger` wrapper | Add required-field validation inside `appendLedgerEntry` body | Wrap at call sites only; extend to `auto-fix-promote.mjs` + `e2e-explore.mjs`; validation at readers |
| A/B winner exit + mixed-transport ledger | Run `a-b-winner.mjs` against the full ledger; declare winner from the combined pool | Stratify by `(class, arm, transport)`; declare winner only when both transports agree OR with explicit transport disclosure in the markdown table |
| New PROMPT_SCAFFOLDS entry + MODEL_ROUTES | Add scaffold; let default sonnet route apply | Explicit decision in `llm-router.js`: present in MODEL_ROUTES OR commented justification for sonnet default |
| New heuristic rule + cluster pre-filter | Add rule; let ambiguous[] shrink | Pin cluster sample-size invariant against v4.2 baseline; new rule may NOT reduce cluster-resolution count |
| Prompt-iter loop + `assertTripleGate` | Treat scaffold rewrites as just another fix surface | Scaffold rewrites NEVER go through `auto-fix:verified` label flow; new `auto-fix:prompt-iter` namespace handled OUTSIDE the trust gate |
| Synthetic-issue cleanup + ledger hardening | Run cleanup script first; clean ledger separately | Cleanup script runs AFTER hardening so its own writes are properly tagged |
| Sole-maintainer bypass + auto-promote outcome ledger | Maintainer uses `--admin` merge under pressure; outcome ledger records 'pass' regardless | Bypass-detection probe filters tainted entries; runbook discipline; rerun workflow instead of bypass |
| Forensic-ledger hardening + Phase 60.1 subscription-transport whitelist | Tighten ledger guard; lose the subscription whitelist | Pin `T_PHASE60_1_HOTFIX_PRESERVED` — subscription-tagged entries continue to flow through `safeAppendLedger` without CI/override |
| Phase 56 `errorClass` field + new PROMPT_SCAFFOLDS entry | Add scaffold; assume `errorClass` propagates | Re-verify the 7 `safeAppendLedger` call sites in auto-fix.mjs all carry the new class for ledger-tag completeness |
| `assertTripleGate` body invariant + Phase 62 wrap | Wrap import; auto-formatter reflows function definitions | Use `import { safeAppendLedger as appendLedgerEntry }` rename pattern to preserve body sha256 exactly |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| `--max-turns 5` without tool-allow-list → 5-turn read-cascade | Per-call cost spikes from ~$0.05 to ~$1; SWEEP-03 budget exhausted in 2 attempts | `--allowed-tools Read,Glob,Grep`; Vitest cost-bound regression test ($0.30 mean per-call ceiling) | First post-Phase-61 SWEEP-03 run |
| A/B winner reads all-time ledger (no `--since-iso` filter) | Mixed pre-v4.3 + post-v4.3 entries dilute the per-arm sample; winner declaration biased toward whichever arm has more historical entries | `--since-iso` argv + Vitest pin | First non-abstention winner emission |
| Cluster pre-filter shrinks below threshold after heuristic expansion | LLM second-pass count goes up; cost-per-issue p50 increases | Phase 66 cluster-sample-size pin against v4.2 baseline | First week post-Phase-66 rollout |
| Prompt-iter generates new fingerprints per iter, bypassing FIX_ATTEMPT_CAP=3 | Per-issue spend exceeds $0.50; cap never reached | Independent `PROMPT_ITER_MAX_PER_FINGERPRINT = 2` + cost cap | First production prompt-iter cycle |
| Synthetic-issue cleanup script over-matches real triage issues | Real production triage issues accidentally closed | Triple-tagged filter (title + body + label) + dry-run default | Cleanup script first `--confirm` run |
| `auto-fix-promote.mjs` unguarded ledger writes leak in local `--skip-ci-guard` runs | New orphan entries appear weeks after Phase 56 mitigation thought to be complete | Phase 62 extends `safeAppendLedger` to all 3 scripts | Local-iteration of promote logic |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Adding `Edit` or `Bash` to `--allowed-tools` "for debugging" | LLM can mutate working tree out-of-band of dispatcher's `git apply` path | Vitest pin asserts args array excludes Edit/Bash/Write/WebFetch literally; ESLint can't catch this |
| Prompt-iter loop allowed to write `tests/e2e/lib/fix-prompt-builder.js` | Scaffold mutates via auto-fix path; human reviews a "fix" PR that secretly rewrites the LLM trust boundary | Add `fix-prompt-builder.js` + `llm-router.js` to FORBIDDEN_PATHS bank in `check-diff-guard.mjs` |
| Bypass-detection probe NOT shipped in v4.3 | Sole-maintainer `--admin` merges go unaudited; A/B winner reads outcome data from bypassed PRs | `scripts/audit-bypass-merges.mjs` ships in Phase 62; weekly digest surfaces bypass count |
| New `ERROR_CLASS` scaffold defaults to sonnet without explicit decision | Cost is wrong; A/B sample bias permanent | MODEL_ROUTES explicit-decision pin; default-to-sonnet requires a comment justification |
| Forensic-ledger hardening reverts the Phase 60.1 subscription whitelist | v3.1/v4.0 free-iteration flow broken; operators forced into SDK transport (paid) | Pin `T_PHASE60_1_HOTFIX_PRESERVED` survives hardening |

---

## "Looks Done But Isn't" Checklist

- [ ] **`--max-turns 5` + `--allowed-tools` co-shipped:** verify `grep -A2 -n 'max-turns' tests/e2e/lib/llm-driver.js` shows `'--max-turns', '5'` AND `'--allowed-tools', 'Read,Glob,Grep'` consecutively, AND a comment naming the locked tool list.
- [ ] **Diagnostic-injection mutator selector vocabulary:** verify a synthetic body's `GOOGLE_DOM_DRIFT` DOM snippet contains at least one substring also present in `tests/e2e/lib/google-patents-page.js`.
- [ ] **`safeAppendLedger` extended to all 3 scripts:** verify `grep -rn 'appendLedgerEntry(LEDGER_PATH' scripts/` returns zero results outside wrapper definitions.
- [ ] **A/B winner thresholds explicit:** verify `grep -n 'N_PER_ARM_REQUIRED\|TIE_THRESHOLD' scripts/a-b-winner.mjs` and each constant has an inline comment with rationale; thresholds pinned by Vitest with the documented values.
- [ ] **A/B transport stratification:** verify `computePerClassPerArm` emits per-transport breakdown OR the markdown table has a transport column; Vitest pin in place.
- [ ] **PROMPT_SCAFFOLDS extension via helper:** verify every new entry uses `buildScaffoldSystemPrompt({...})`; sha256-pin on Phase 45 baseline scaffolds.
- [ ] **MODEL_ROUTES decision for new ERROR_CLASS:** verify either explicit MODEL_ROUTES entry or `// MODEL_DEFAULT_OK: <CLASS>` comment in `llm-router.js`.
- [ ] **Heuristic rule VERIFIER_STRONG_AGREEMENT gate:** every new rule firing on CONFIRMED verdict gates on the named function; source-grep test.
- [ ] **Cluster pre-filter sample size preserved:** Vitest runs 10-finding synthetic against pre/post heuristic rules; cluster call count NOT decreased.
- [ ] **Prompt-iter capture-and-surface only (v4.3):** verify no auto-fix PR namespace includes scaffold rewrites; `tests/e2e/lib/fix-prompt-builder.js` and `tests/e2e/lib/llm-router.js` in FORBIDDEN_PATHS.
- [ ] **`assertTripleGate` sha256 unchanged:** Vitest pin from Phase 53 baseline passes after every v4.3 phase.
- [ ] **Cleanup script preconditions:** verify dry-run is default, `--confirm` is opt-in, triple-tagged filter is in place, evidence sentinel required.
- [ ] **Sole-maintainer bypass audit probe:** `scripts/audit-bypass-merges.mjs` exists and surfaces in weekly digest; bypass count for v4.3 milestone is 0 for auto-fix branches.
- [ ] **Cost budget at-or-below target:** cumulative v4.3 spend < $15; per-phase phase < $5; per-call mean < $0.30.
- [ ] **No new orphan ledger entries:** post-Phase 62, `jq` filter for `source == null OR transport == null` returns ≤3 (the pre-existing v4.2 orphans).
- [ ] **Phase 60.1 subscription whitelist preserved:** Vitest pin `safeAppendLedger` accepts subscription entries without CI/override.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| `--max-turns 5` shipped without `--allowed-tools` — Claude mutates working tree | HIGH | (1) Revert the v4.3 max-turns commit. (2) Audit `git log --since=<bad-merge-date> --diff-filter=M src/` for unexplained source-file changes. (3) Revert any suspect commits. (4) Re-ship with `--allowed-tools Read,Glob,Grep` AND the working-tree post-condition test. |
| Mutator's synthetic DOM snippet bears no resemblance to real selectors — every SWEEP-03 attempt 3-strikes | HIGH | (1) Compare synthetic body output (`node tests/e2e/scripts/inject-defect.mjs --dry-run --error-class GOOGLE_DOM_DRIFT`) to real `google-patents-page.js`. (2) Refactor `buildBody` to import from a fixture file containing real selector examples. (3) Re-run SWEEP-03; expect first fix attempt to land. |
| `appendLedgerEntry` body has mandatory-validation throw — 33 Vitest tests fail | LOW | (1) Revert the validation from `appendLedgerEntry` body. (2) Move the validation to the readers (`a-b-winner.mjs`, dashboard). (3) Wrap auxiliary call sites at the wrapper layer per Pitfall 3 prevention. |
| A/B winner declares wrong arm due to cross-transport contamination | MEDIUM | (1) Operator manually checks the markdown table; refuses to mutate MODEL_ROUTES on a single-window winner. (2) Add transport stratification to `computePerClassPerArm`. (3) Re-run with `--since-iso` filter excluding pre-v4.3 entries. |
| New scaffold ships with FORBIDDEN_PATHS drift (5 instead of 6 paths) | MEDIUM | (1) Revert the new scaffold commit. (2) Refactor to use `buildScaffoldSystemPrompt({...})`. (3) Add the byte-equivalence pin against Phase 45 baseline. (4) Re-ship with helper invocation. |
| Heuristic-first 8/8 expansion drains cluster pre-filter sample below N≥5 | MEDIUM | (1) Audit one week of triage outputs for cluster-pass-count drop. (2) Loosen the new heuristic rules (raise confidence requirement, narrow trigger conditions). (3) Re-run cluster-sample-size Vitest pin. |
| Prompt-iter loop rewrites a scaffold and merges to main | HIGH | (1) Revert the scaffold-rewrite commit; restore from `git log -p tests/e2e/lib/fix-prompt-builder.js`. (2) Add `fix-prompt-builder.js` + `llm-router.js` to FORBIDDEN_PATHS bank. (3) Reduce prompt-iter scope to capture-and-surface-only. (4) Add the cumulative-cost-cap pin. |
| Synthetic-issue cleanup script closes a real triage issue | MEDIUM | (1) Reopen the real issue (`gh issue reopen <n>`). (2) Audit `scripts/uat-cleanup.mjs` filter logic; tighten triple-tagged check. (3) Add the precondition sentinel; re-run with `--dry-run` first. |
| `assertTripleGate` body sha256 changes due to incidental edit | LOW | (1) Identify the diff (`git diff HEAD~1 scripts/auto-fix-promote.mjs`). (2) Revert the body edit. (3) If the edit was intentional (new ERROR_CLASS handling), move it to `assertPromptIterGate` or similar sibling per Phase 53 pattern. (4) Update the pinned hash IN the same commit as the intentional change. |
| Sole-maintainer bypass merges an unverified auto-fix PR | MEDIUM | (1) Manually re-run verifier-gate on the merge commit's tree state. (2) If verifier-gate FAILS, revert the merge. (3) If verifier-gate PASSES, document the bypass in `.planning/STATE.md` under a `## Bypass Log` section. (4) Filter the bypass-tainted ledger entry from A/B winner via `--admin-bypass` flag. |
| Forensic ledger hardening breaks Phase 60.1 subscription whitelist | LOW | (1) Identify the regression — a subscription-tagged entry that should pass `safeAppendLedger` is now rejected. (2) Verify the isSubscriptionLocal check is byte-unchanged in `auto-fix.mjs:169-170`. (3) If reverted unintentionally, restore from the Phase 60.1 hotfix commit (ab2dd34). |

---

## Pitfall-to-Phase Mapping

| Pitfall | Phase | Wave | Verification |
|---------|-------|------|--------------|
| 1. `--max-turns 5` without `--allowed-tools` re-enables Edit/Bash | Phase 61 | Carry-over | Vitest args array contains `'--allowed-tools', 'Read,Glob,Grep'` AND excludes Edit/Bash/Write/WebFetch; working-tree post-condition test passes |
| 2. Diagnostic mutator drift vs. real selectors | Phase 61 | Carry-over | Vitest synthetic-body contains a substring from `google-patents-page.js`; determinism pin on same-seed → byte-identical output |
| 3. Forensic-ledger schema hardening — mandatory-validation at wrong layer breaks 33 tests | Phase 62 | Carry-over | `safeAppendLedger` extended to auto-fix-promote + e2e-explore; 33 ledger tests stay green; readers filter on source/transport |
| 4. A/B winner thresholds + cross-transport contamination | Phase 64 | Capability | `TIE_THRESHOLD = 0.10`, `N_PER_ARM_REQUIRED = 20` pinned; transport stratification pinned; `--since-iso` filter pinned |
| 5. New scaffold drift on FORBIDDEN_PATHS + MODEL_ROUTES skip | Phase 65 | Capability | Vitest every PROMPT_SCAFFOLDS thunk uses `buildScaffoldSystemPrompt`; sha256 pin on Phase 45 baseline scaffolds; MODEL_ROUTES decision pin |
| 6. Heuristic-first 8/8 masks Tier C; cluster pre-filter drained | Phase 66 | Capability | Vitest every new heuristic rule on CONFIRMED gates on `VERIFIER_STRONG_AGREEMENT`; Tier C masking test; cluster sample-size baseline preserved |
| 7. Prompt-iter loop rewrites scaffolds, infinite retry, FORBIDDEN_PATHS violation | Phase 67 | Capability | `fix-prompt-builder.js` + `llm-router.js` in FORBIDDEN_PATHS; `PROMPT_ITER_MAX_PER_FINGERPRINT = 2`; capture-and-surface mode pinned (recommend defer to v4.4) |
| 8. Synthetic-issue cleanup premature close + accidental real-issue match | Phase 68 | Carry-over | Precondition sentinel required; triple-tagged filter (title + body + label); dry-run default; `--confirm` opt-in |
| 9. Cost discipline regression — compound multi-capability burn | Cross-cutting | Both | Budget cap in STATE.md ($15 milestone, $30 hard); per-phase spend probe; `--max-turns` cost-bound test ($0.30 mean per call) |
| 10. `assertTripleGate` body byte-stability | Cross-cutting | Both | sha256 pin from Phase 53 baseline survives every v4.3 phase; phase plans pre-declare touch scope |
| 11. Sole-maintainer bypass on ruleset 17086676 | Phase 62 (probe) + cross-cutting (runbook) | Both | `scripts/audit-bypass-merges.mjs` ships; weekly digest surfaces bypass count; A/B winner has `--admin-bypass` filter |
| 12. Auxiliary-leak vector — auto-fix-promote.mjs + e2e-explore.mjs | Phase 62 | Carry-over | Shared `tests/e2e/lib/safe-append-ledger.js` helper; pin: zero direct `appendLedgerEntry(LEDGER_PATH` outside wrappers |
| 13. Prompt-iter loop cost-explosion via fingerprint reuse | Phase 67 | Capability | Single-issue-per-fingerprint invariant; `PROMPT_ITER_COST_CAP_USD = 0.50`; cap-reached ledger audit entry |

---

## Sources

- Direct code inspection: `tests/e2e/lib/llm-driver.js:82-94` (`--max-turns 1` + "DO NOT change" comment); `tests/e2e/lib/llm-driver.js:421, 588, 620` (dispatcher-level ledger writes self-tagging `transport`/`source`)
- Direct code inspection: `tests/e2e/lib/fix-prompt-builder.js:117-178` (`buildScaffoldSystemPrompt` helper); `fix-prompt-builder.js:252-273` (GOOGLE_DOM_DRIFT_CONTRACT); `fix-prompt-builder.js:357-363` (Object.freeze PROMPT_SCAFFOLDS 5-key registry); `fix-prompt-builder.js:378-382` (SKIP_CLASS_ESCALATIONS); `fix-prompt-builder.js:433` (Phase 54 AB-02 model field)
- Direct code inspection: `scripts/auto-fix.mjs:143-181` (`safeAppendLedger` wrapper); `auto-fix.mjs:169-170` (Phase 60.1 subscription whitelist); `auto-fix.mjs:206` (FIX_ATTEMPT_CAP = 3); `auto-fix.mjs:225` (RECOGNIZED_LABELS)
- Direct code inspection: `scripts/a-b-winner.mjs:86, 92` (LOCKED constants N_PER_ARM_REQUIRED = 20, TIE_THRESHOLD = 0.05); `a-b-winner.mjs:178-238` (isAttributable + detectOutcome — NO transport filter)
- Direct code inspection: `scripts/auto-fix-promote.mjs:521, 544` (UNGUARDED appendLedgerEntry call sites — Phase 58 outcome writes)
- Direct code inspection: `tests/e2e/lib/triage-classifier.js:35-44` (VERIFIER_STRONG_AGREEMENT named gate); `triage-classifier.js:447-471` (Rule 2 — CONFIRMED + strong agreement); `triage-classifier.js:507-` (cluster pre-filter D-11)
- Direct code inspection: `tests/e2e/lib/llm-ledger.js:686-738` (appendLedgerEntry permissive spread, no required-field validation); `llm-ledger.js:140-156` (DAY_HARD_CAP $10, ISSUE_HARD_CAP $1, PR_HARD_CAP $2)
- Direct code inspection: `tests/e2e/lib/llm-router.js:60-65` (MODEL_ROUTES — frozen, only GOOGLE_DOM_DRIFT + LLM_HALLUCINATED_SELECTION → opus); `llm-router.js:83-85` (routeModel default sonnet fallthrough)
- Direct code inspection: `tests/e2e/scripts/inject-defect.mjs:277-298` (buildBody — current empty diagnostic stub); `inject-defect.mjs:306-329` (createIssue label-flow)
- Direct code inspection: `tests/e2e/lib/error-codes.js:98-110` (ERROR_CLASSES frozen 11-entry taxonomy)
- Direct code inspection: `eslint.config.js:135-166` (triage-classifier wrapper-only rule); `eslint.config.js:194-222` (fix-prompt-builder purity rule); `eslint.config.js:253-281` (SDK single-entry-point rule — catch-all with ignores list)
- Direct code inspection: `scripts/e2e-explore.mjs:262, 313` (UNGUARDED Phase 31 appendLedgerEntry call sites)
- `.planning/milestones/v4.2-MILESTONE-AUDIT.md` (deferred SWEEP-03/04/06 architectural root-cause; "(A) AND (B) are required for SWEEP-03/04 to PASS end-to-end")
- `.planning/research-v4.2-archive/PITFALLS.md` — v4.2 Pitfalls 1-11 (closed; informing v4.3 design constraints)
- `.planning/STATE.md` § Decisions (Phase 54 D-02 frozen MODEL_ROUTES; Phase 53 assertTripleGate body byte-unchanged; Phase 60.1 subscription whitelist hotfix); § Pending Todos (v4.3 carry-over A/B/C/D enumerations); § Ruleset Decision (2026-06-06, post-v4.2 reversal — sole-maintainer bypass re-added with rationale)
- `.planning/PROJECT.md` Key Decisions (multi-model deterministic ERROR_CLASS routing via `llm-router.js`; auto-fix PRs draft + human-merge required; `--max-turns 5` with `--allowed-tools Read,Glob,Grep` substitutes the Pitfall 1+2 budget guard)
- Memory: `project_auto_fix_ledger_leak_vector.md` (`scripts/auto-fix.mjs` writes ledger entries via path PRE-02 guard does not cover; check `source: 'auto-fix-api'` on new leaks)
- Memory: `feedback_orchestrator_cwd_drift.md` (pin `git -C $PRIMARY_WT` on rev-parse spot-checks)

---
*Pitfalls research for: v4.3 Auto-Fix Loop Closure + Capability Expansion — diagnostic-injection mutator, --max-turns relaxation, forensic-ledger hardening, A/B winner exit, expanded fix scaffolds, broader heuristic-first triage, prompt-iter loop, synthetic-issue cleanup*
*Researched: 2026-06-08*

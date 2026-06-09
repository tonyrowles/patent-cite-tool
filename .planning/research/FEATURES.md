# Feature Landscape

**Domain:** LLM-CI auto-fix loop — closure + capability expansion (v4.3)
**Researched:** 2026-06-08
**Confidence:** HIGH (primary sources: live codebase grep + v4.2 MILESTONES.md + STATE.md Pending Todos + archived v4.2 FEATURES)

---

## Scope note

This document covers ONLY the v4.3 NEW capabilities (the 8 features enumerated in
the milestone PROJECT.md). Everything already shipped (5 PROMPT_SCAFFOLDS,
6-rule heuristic triage, MODEL_ROUTES frozen routing, FLAKE 5-state classifier,
cost-ledger schema v2, `safeAppendLedger` leak guard, deterministic fixture
mutator, `assertTripleGate` trust invariant, weekly digest with frozen
`SUMMARY_KEYS`, A/B winner abstention probe) is NOT re-researched — those
constraints land in PITFALLS.md as invariants.

The 8 v4.3 features in scope (from PROJECT.md "Target features" + MILESTONE
carry-over). All are evidence-anchored to specific file:line in the live tree:

| # | Feature | Wave |
|---|---------|------|
| 1 | Diagnostic-injection mutator extension | Carry-over |
| 2 | `--max-turns` relaxation (1 → 5 + `--allowed-tools Read,Glob,Grep`) | Carry-over |
| 3 | Forensic-ledger schema hardening (`source` + `transport` required) | Carry-over |
| 4 | Synthetic-issue cleanup (#20/21/22/23) | Carry-over |
| 5 | A/B winner exit from abstention + markdown decision table | Capability expansion |
| 6 | Expanded fix scaffolds (new `ERROR_CLASS` entries beyond the 5) | Capability expansion |
| 7 | Better heuristic-first triage coverage (currently 6 fall-through classes) | Capability expansion |
| 8 | Prompt-iter loop (closed-loop scaffold rewriting from failed attempts) | Capability expansion |

---

## Canonical ERROR_CLASS evidence (from live tree)

Single source of truth: `tests/e2e/lib/error-codes.js:98-110`
(`ERROR_CLASSES = Object.freeze([...])` — 11 entries):

```
EXTENSION_NOT_LOADED, NO_CITATION_PRODUCED, WRONG_CITATION, UI_BROKEN,
VERIFIER_DISAGREE, GOOGLE_DOM_DRIFT, USPTO_API_DRIFT, FLAKE,
WORKER_FALLBACK_FAILED, LLM_HALLUCINATED_SELECTION, LLM_API_ERROR
```

Plus `HARNESS_ERROR` (`error-codes.js:85`, exported but **deliberately NOT** in
the frozen array — only the LLM exploratory report tallies it; `by_error_class`
in regression reports does not count it).

`RECOGNIZED_LABELS` at `scripts/auto-fix.mjs:225` =
`new Set([...ERROR_CLASSES, 'PASS'])` — the dispatcher accepts all 11 array
entries + `PASS`.

### How each class is handled (cross-referenced from live grep)

| ERROR_CLASS | `fix-prompt-builder.js` | `triage-classifier.js` heuristic? | `llm-router.js` |
|-------------|-------------------------|----------------------------------|-----------------|
| `WRONG_CITATION` | SCAFFOLD (line 358) | YES — Rule 2 (CONFIRMED + Tier A/B) | sonnet (default) |
| `LLM_HALLUCINATED_SELECTION` | SCAFFOLD (line 359) | YES — Rule 3 (NOT_REPLAYABLE) | **opus** (line 62) |
| `WORKER_FALLBACK_FAILED` | SCAFFOLD (line 360) | NO — Rule 4 (LLM cluster/single) | sonnet (default) |
| `GOOGLE_DOM_DRIFT` | SCAFFOLD (line 361) | NO — Rule 4 (LLM cluster/single) | **opus** (line 61) |
| `HARNESS_ERROR` | SCAFFOLD (line 362) | YES — Rule 3 (NOT_REPLAYABLE) | sonnet (default) |
| `VERIFIER_DISAGREE` | NONE → `unsupported-class:` (line 417) | YES — Rule 2 (CONFIRMED + Tier A/B) | sonnet (default) |
| `FLAKE` | SKIP → `re-quarantine` (line 379) | YES — Rule 1 short-circuit | n/a (dispatcher branches to `dispatchFlakeState`) |
| `LLM_API_ERROR` | SKIP → `retry` (line 380) | YES — Rule 3 (NOT_REPLAYABLE) | n/a (skip) |
| `PASS` | SKIP → `close-as-pass` (line 381) | YES — Rule 3 (NOT_REPLAYABLE) | n/a (skip) |
| `EXTENSION_NOT_LOADED` | NONE → `unsupported-class:` | NO — Rule 4 fall-through | sonnet (default) |
| `NO_CITATION_PRODUCED` | NONE → `unsupported-class:` | NO — Rule 4 fall-through | sonnet (default) |
| `UI_BROKEN` | NONE → `unsupported-class:` | NO — Rule 4 fall-through | sonnet (default) |
| `USPTO_API_DRIFT` | NONE → `unsupported-class:` | NO — Rule 4 fall-through | sonnet (default) |

### Heuristic coverage reality check

The milestone framing "push classifier from 6/8 → toward 8/8" is anchored in
the v3.1 RESEARCH-era 8-class taxonomy (pre-extension). Against the **current
11-entry `ERROR_CLASSES` array** the picture is:

- **Heuristic-resolved** (Rule 1/2/3): `FLAKE`, `WRONG_CITATION`,
  `VERIFIER_DISAGREE`, `LLM_HALLUCINATED_SELECTION`, `LLM_API_ERROR`,
  `HARNESS_ERROR`, `PASS` — 7 classes (`PASS` and `HARNESS_ERROR` are not in the
  ERROR_CLASSES array but flow through the chain anyway)
- **LLM Rule-4 fall-through**: `EXTENSION_NOT_LOADED`, `NO_CITATION_PRODUCED`,
  `UI_BROKEN`, `GOOGLE_DOM_DRIFT`, `USPTO_API_DRIFT`, `WORKER_FALLBACK_FAILED`
  — **6 classes** (not 2)

The "6/8 → 8/8" terminology is internally consistent with v3.1's audit but
misleading against the v4.x array. Feature 7 should track Rule-4 fall-through
classes by **name**, not by ratio. See Feature 7 in Differentiators below.

### Scaffold coverage reality check

`PROMPT_SCAFFOLDS` (frozen registry at `fix-prompt-builder.js:357-363`) has 5
keys. `SKIP_CLASS_ESCALATIONS` (frozen, line 378-382) has 3 keys. Every other
`ERROR_CLASS` in the recognized set returns
`{ok:false, escalate:'unsupported-class:<class>'}` from `buildFixPrompt`. That
means today, an auto-fix run against an issue labeled e.g. `USPTO_API_DRIFT`
exits at Step 7 with no SDK call attempted (line 740-744 of `auto-fix.mjs`,
the skip-class branch writes a ledger entry with `escalate: built.escalate`
and returns 0). For these classes the loop is intentionally a no-op.

---

## Feature Landscape

### Table Stakes

Features required for v4.3 DoD: "live UAT-47-a/b/SWEEP-03/04/06 PROVEN on
`origin/main` + at least one real production fix flowing through the expanded
surface." Missing any of these = DoD not met. All are CARRY-OVER from v4.2's
deferred architectural deferral (per `STATE.md ## Deferred Items
(acknowledged at v4.2 milestone close 2026-06-09)`).

| # | Feature | Why Required | Complexity | Notes |
|---|---------|-------------|------------|-------|
| 1 | **Diagnostic-injection mutator extension** — embed `GOOGLE_DOM_DRIFT` DOM snippet + `WRONG_CITATION` Verifier Disagreement block into synthetic issue bodies; co-design with `fix-prompt-builder.js:252-268` GOOGLE_DOM_DRIFT contract ("issue body should include a snippet of the new DOM"); pin via Vitest fixture (deterministic same-seed → same-snippet) | Without this, scaffolds correctly refuse to fabricate fixes (`apply-check-failed` on SWEEP-03 attempts 2026-06-07/08); end-to-end loop never produces a live fix | **MEDIUM** | Extends `inject-defect.mjs:277-298` `buildBody` to take a per-class diagnostic payload. Must keep MUTATOR-04 source-tag `fixture-mutator-uat-47b` (line 75) unchanged so `quarantine-append.mjs:239` suppression still fires. Pinned by Vitest synthetic-DOM fixture file (new). Must NOT add `node_modules` deps |
| 2 | **`--max-turns` relaxation + `--allowed-tools`** — bump `llm-driver.js:94` from `'1'` to `'5'`; add `--allowed-tools Read,Glob,Grep` (no `Edit`/`Bash`); update both `invokeClaudeP` (subscription) AND `invokeAnthropicSdkWithLedger` SDK call (line 576-584) | `error_max_turns` blocked SWEEP-03 attempt 2026-06-08 on issue #3 (WRONG_CITATION needed source-file reads to understand real diagnostic-rich issues). Required for both transport paths to handle real issue bodies | **LOW** | Single argv array change at `llm-driver.js:91-97`. SDK path: model already gets file-read context via systemBlocks but Read-tool extension may need explicit `allowed_tools` field in SDK call (verify against `@anthropic-ai/sdk@0.100.1` API). Cost-discipline gate substitute: `--allowed-tools` whitelist (no `Edit`/`Bash`) replaces the `--max-turns 1` budget guard |
| 3 | **Forensic-ledger schema hardening** — require `source` + `transport` on ALL ledger entries. Audit and patch every `appendLedgerEntry` call site that lacks one or both | 3 orphan `claude-opus-4-7[1m]` ledger entries surfaced 2026-06-08 with no `source`/`transport` fields; closes auxiliary-leak path that PRE-02 + safeAppendLedger don't cover (MEMORY.md `auto_fix_ledger_leak_vector`). Required for A/B winner accuracy (Feature 5) since `a-b-winner.mjs:185-188` filter drops entries lacking attribution metadata | **MEDIUM** | Two-tier defense: (a) ESLint or static-grep test enforcing every `appendLedgerEntry(...)` literal must pass `source:` + `transport:` keys; (b) **defensive runtime assertion** inside `appendLedgerEntry` body (`llm-ledger.js`) that throws on missing field. Both layers required — static check covers code paths, runtime check covers dynamic callers (e.g. `auto-fix.mjs:438`, `:535`, `:691`). DO NOT collapse to runtime-only — would break audit trail of pre-existing entries; need static migration first |
| 4 | **Synthetic-issue cleanup** — close issues #20/21/22/23 (mutator-injected GOOGLE_DOM_DRIFT triage issues from SWEEP-03 attempts); execute the documented `gh issue close <n> --reason "not planned"` runbook from `inject-defect.mjs:emitCleanupEvidence` (line 396-428) | Live UAT-47-a/b cannot rerun against a polluted issue tracker; SWEEP-06 cleanup automation depends on these issues being closed before re-injection | **LOW** | Already-authored runbook in `.planning/phases/59-fixture-mutator-4-uat-re-sweep/56-MUTATOR-CLEANUP.md`. Can be done via `gh` script invocation or manual. Idempotent (closing an already-closed issue is harmless) |

### Differentiators

Features that make v4.3 trustworthy/observable/scalable beyond the bare DoD.
Each is independently shippable but DEPENDS on at least one Table Stake.

| # | Feature | Value Proposition | Complexity | Notes |
|---|---------|------------------|------------|-------|
| 5 | **A/B winner exit from abstention + markdown decision table** | Once Feature 3 lands forensic schema, plus 1 real merged PR per arm per class (≥20 per N_PER_ARM_REQUIRED at `a-b-winner.mjs:86`), the script auto-exits abstention via the `outcomeUnavailable` probe (`a-b-winner.mjs:259-266`) and emits the table via `formatMarkdownTable` (line 332-348). NEW work needed: (a) decision-surface — where the markdown table lands (weekly digest section vs standalone GH Discussion vs committed `.md` artifact); (b) threshold lowering — `N_PER_ARM_REQUIRED=20` is high for a sole-maintainer corpus where total fix attempts may run in single digits per month. Recommend conditional emission (table renders if ANY class has ≥N; per-class abstention rows for the rest) | **LOW** for emission wiring; **MEDIUM** if dropping the N threshold requires re-pinning Vitest tests at `tests/unit/a-b-winner.test.js` | Depends on: Feature 3 (schema hardening MUST be live so `errorClass` + outcome populated). Recommend the table land as a Phase 55-pattern section appended to the existing weekly digest (mirrors Phase 55 DASH-02 `renderAutoFixPipelineSection` pattern at `weekly-digest.mjs`). DO NOT make this a Discord/Slack push — operator-driven decision tool, not realtime alert |
| 6 | **Expanded fix scaffolds** — add NEW `PROMPT_SCAFFOLDS` entries for currently-unsupported classes. Concrete candidates (anchored in evidence): see "Concrete scaffold candidates" section below | Today 4 in-array `ERROR_CLASS` values (`EXTENSION_NOT_LOADED`, `NO_CITATION_PRODUCED`, `UI_BROKEN`, `USPTO_API_DRIFT`) route to `unsupported-class:` and silently no-op. Auto-fix loop has zero coverage for them. Adding scaffolds + Verifier Disagreement scaffold (already heuristically triaged but lacks fix template) widens the loop's surface | **MEDIUM** per scaffold (each adds ~30-line CONTRACT string + Object.freeze registry entry + Vitest pin); **LOW** marginal once the first one shipped | Depends on: Feature 1 (diagnostic-injection mutator) for end-to-end testability of any new scaffold; Feature 2 (`--max-turns 5`) so the scaffold can actually read source files. Recommend NOT shipping all candidates in v4.3 — pick 2-3 with highest evidence and defer rest to v4.4 |
| 7 | **Better heuristic-first triage coverage** — add Rule-1/2/3-equivalent heuristic short-circuits for the 6 LLM-routed fall-through classes (`EXTENSION_NOT_LOADED`, `NO_CITATION_PRODUCED`, `UI_BROKEN`, `GOOGLE_DOM_DRIFT`, `USPTO_API_DRIFT`, `WORKER_FALLBACK_FAILED`) | Currently each Rule-4 fall-through class triggers a cluster (N≥5) or per-finding LLM call (`triage-classifier.js:517-561`). Heuristic resolution = zero LLM cost + faster turnaround. Several of these have deterministic signals: e.g. `GOOGLE_DOM_DRIFT` ↔ pre-flight DOM probe failure result; `WORKER_FALLBACK_FAILED` ↔ verifier returned `tier='D'` AND non-2xx Worker status; `EXTENSION_NOT_LOADED` / `UI_BROKEN` ↔ harness threw before the verifier ran. Concrete rules: see "Concrete heuristic rules" section below | **MEDIUM** (one new rule + RULE_*_CLASSIFICATIONS map per class; each ~10-20 lines + Vitest pin) | Depends on: nothing (pure-function classifier). Recommend tackling 2-3 highest-signal classes in v4.3 (`GOOGLE_DOM_DRIFT`, `WORKER_FALLBACK_FAILED`, `EXTENSION_NOT_LOADED`) and deferring `UI_BROKEN` / `USPTO_API_DRIFT` to v4.4 where signal is more ambiguous |
| 8 | **Prompt-iter loop — CAPTURE-AND-SURFACE shape** | Failed fix attempts (Step 5 `fix_attempts >= FIX_ATTEMPT_CAP=3` branch at `auto-fix.mjs:648-666`; label-flap to `auto-fix:failed`; or `apply-check-failed` events) emit a NEW ledger row with `source: 'fix-attempt-failed'` + `errorClass` + `escalate_reason` + truncated `llm_text` snippet. A weekly digest section enumerates these for human review. Operator decides whether the scaffold needs rewriting | **MEDIUM** (one new ledger source string + 1 digest section + `auto-fix.mjs` minor surface change to write the failed-attempt entry) | Depends on: Feature 3 (forensic schema for the failed-attempt ledger row to be queryable). RECOMMEND THIS SHAPE for v4.3. Full automation (variant below) is rejected — see Anti-Features |

### Anti-Features

These are features the pipeline MUST NOT have. They are explicit design invariants.

| Anti-Feature | Why It Seems Attractive | Why Prohibited | What to Do Instead |
|--------------|------------------------|---------------|--------------------|
| **Prompt-iter loop — FULL AUTOMATION shape** (failure → LLM analyzes scaffold → LLM rewrites scaffold → auto-commits scaffold change → retries) | Closes the loop; removes human latency entirely | (a) `fix-prompt-builder.js` is FORBIDDEN_PATH-adjacent (`tests/e2e/lib/` is excluded from diff-guard but `fix-prompt-builder.js` is the production scaffold registry — meta-loop attacking it = uncontrolled trust boundary expansion). (b) The 5 scaffolds are LOAD-BEARING (`fix-prompt-builder.js:117-178` `buildScaffoldSystemPrompt` helper guarantees byte-stable forbidden-paths enumeration); a wayward LLM rewrite could drift the path list and let downstream auto-fixes touch FORBIDDEN_PATHS. (c) Defeats Phase 53 `assertTripleGate` byte-unchanged invariant by indirection. (d) No clear cost-cap on the meta-loop — could runaway-spend chasing a bad scaffold | **Capture-and-surface** (Feature 8 above). Operator reads weekly digest, manually authors scaffold revision PRs |
| **Auto-merging A/B winner-decision-driven `MODEL_ROUTES` edits** | Once the table declares a winner, route the routing-table to use it automatically | `MODEL_ROUTES` is `Object.freeze`'d at `llm-router.js:60-63` and the freeze is LOAD-BEARING for the A/B comparison invariant (`llm-router.js:30-37`). Mutating mid-experiment invalidates the ledger entries before/after the edit. Even if the table declares a winner, the routing edit must be a human-reviewed PR | Emit the table only; human authors the `MODEL_ROUTES` PR after reading it |
| **Bumping `--max-turns` to unbounded** (e.g., `--max-turns 50`) | Maximum freedom for the model to explore the codebase | (a) Cost-discipline: each turn is an SDK round-trip. (b) The `--max-turns 5` figure from STATE.md Pending Todos was researched and locked. (c) Empirically Claude resolves most fix tasks in 2-4 turns; 5 gives 1-2 turns of headroom. (d) Unbounded turns + Read tool can fan out into reading the entire `src/` tree, blowing the prompt-token budget | Keep `--max-turns 5`. If a class genuinely needs more, raise it per-class via the dispatcher, not globally |
| **Allowing `--allowed-tools Edit,Bash`** | Faster — the model could apply the fix in-process | (a) Defeats the entire dispatcher architecture (parse-fenced-diff at `auto-fix.mjs:279-298` exists for a reason: humans audit a diff, not a multi-step tool trace). (b) `Bash` tool inside the SDK call could run arbitrary commands against the CI runner's filesystem, bypassing the FORBIDDEN_PATHS diff-guard regex bank. (c) `Edit` tool could mutate the working copy without leaving a unified-diff audit trail | Whitelist ONLY `Read,Glob,Grep`. The model proposes a diff via the existing fence-bracketed output format (`fix-prompt-builder.js:167-176`); the dispatcher applies it via `git apply --check` |
| **Adding a 6th scaffold for a class that the heuristic triage cannot route** | Coverage at any cost | A scaffold without a path through triage is dead code — the dispatcher never invokes it. E.g., adding a `TIER_C_DISAGREEMENT` scaffold without a corresponding ERROR_CLASS string in `error-codes.js` and a triage rule that emits it means `buildFixPrompt({errorClass:'TIER_C_DISAGREEMENT'})` returns `{ok:false, escalate:'unsupported-class:TIER_C_DISAGREEMENT'}`. Useless | Verify the candidate ERROR_CLASS already exists in `ERROR_CLASSES` (lines 98-110) OR can be added with a co-designed triage rule (e.g. Rule 2/3 extension) and a producer site in regression spec / verifier output. Co-design in same commit per Phase 56 LEDGER-01 pattern |
| **A/B winner table on the auto-fix PR body** (instead of weekly digest) | Decision context next to the PR | (a) PR body has size limits + already crowded with affected-cases HTML comment. (b) The table is decision-surface for *future* MODEL_ROUTES edits, not for the current PR. (c) Same misclassification as `cost_per_fix` would be if it were per-PR (the metric only makes sense aggregated) | Land in the weekly digest as a Phase-55-pattern `<details>` section, OR in a standalone committed `docs/a-b-winner-latest.md` artifact |
| **Backfilling old ledger entries with synthetic `source`/`transport` defaults** (e.g., scripted patch to retroactively tag the 3 orphan `claude-opus-4-7[1m]` entries) | Cleaner audit trail | Falsifies the forensic record — those 3 entries genuinely lack provenance metadata. Inserting fake `source: 'unknown-pre-v4.3'` tags makes future grep audits unreliable | Leave them as-is. The Feature 3 schema hardening should be **forward-only**: enforce on new writes; allow but flag the 3 known orphans in a documented allowlist (Vitest pin) |
| **Treating GOOGLE_DOM_DRIFT as a routinely heuristic-resolvable class** | The DOM snippet pattern in mutator synthetics suggests it's recognizable | The diagnostic data shape is what makes Rule-4 LLM-routing the right call: the snippet itself needs LLM reasoning to map "old selector → new selector". A naive heuristic could fire on any "no patent body found" string and mis-route a genuinely-LLM-needing case to a no-op | If shipping Feature 7 for `GOOGLE_DOM_DRIFT`, the heuristic should be **selector-extraction-only** (recognize that the issue body has a `data-testid=` snippet pre-injected by Feature 1's mutator extension); fall through to LLM for any non-mutator GOOGLE_DOM_DRIFT |

---

## Concrete scaffold candidates (for Feature 6)

The milestone PROJECT.md lists 10 candidate names. Each is graded against three
criteria from grep evidence:

1. **Triage-emittable?** Is there an existing producer site in the regression
   suite or verifier that emits this ERROR_CLASS? (Grep for the string literal.)
2. **In `ERROR_CLASSES`?** Adding new entries requires extending the frozen
   array — that's a co-design across `error-codes.js`, `report.js`,
   `auto-fix.mjs`'s `RECOGNIZED_LABELS`, and at least one Vitest pin.
3. **Fix-surface plausibility?** Is there a coherent fix surface (production
   src/ files + tests/) for the LLM to actually edit?

| Candidate | Triage-emittable? | In ERROR_CLASSES? | Fix-surface? | Recommendation |
|-----------|-------------------|-------------------|--------------|----------------|
| `TIER_C_DISAGREEMENT` | NO — no producer site found. Tier C is a verifier status (`triage-classifier.js:43-44` `VERIFIER_STRONG_AGREEMENT` returns false), not an emitted class | NO | Marginal — the fix would be in the verifier independence layer; complex | **DEFER** — needs taxonomy extension first; not v4.3 scope |
| `PDF_PARSE_ERROR` | NO direct producer in grep; closest is `error_max_turns` (unrelated) and `pdf-verifier.js` exceptions | NO | YES — fix surface in `src/offscreen/position-map-builder.js` / `src/shared/matching.js` | **DEFER** — needs ERROR_CLASS taxonomy extension; high value but big surface |
| `WORKER_TIMEOUT` | PARTIAL — `WORKER_FALLBACK_FAILED` covers this today (`error-codes.js:64`); a sub-class would split the existing bucket | NO (would be sub-class of WORKER_FALLBACK_FAILED) | YES — `src/cf-worker/index.js` retry policy | **DEFER** — over-specification; existing WORKER_FALLBACK_FAILED scaffold already covers the fix surface |
| `IDB_FAILURE` | NO producer in grep; IndexedDB has detect-once degradation (`idbAvailable` flag) but no error-class emission | NO | YES — `src/shared/idb-helper.js` (if exists) or wherever IDB calls live | **DEFER** — needs new producer site + taxonomy extension |
| `CACHE_MISS_TIMEOUT` | NO producer; closest is the Worker 3s cache timeout handling | NO | YES — Worker cache path | **REJECT** — current behavior (silent fallthrough) is intentional per Key Decisions; no scaffold needed |
| `COLUMN_INFERENCE_FAIL` | NO producer for this specific error; column-inference is in `position-map-builder.js` | NO | YES — narrow fix surface in column-inference logic | **DEFER** — needs producer; v4.4 candidate when accuracy regression evidence accumulates |
| `OCR_TIER0B_REGRESSION` | NO producer; Tier 0b is `normalizeOcr` preprocessing (`src/shared/matching.js`) | NO | YES | **REJECT** — this would be a `WRONG_CITATION` sub-case with specific root-cause; existing WRONG_CITATION scaffold already addresses |
| `GUTTER_TIER5_REGRESSION` | NO producer | NO | YES | **REJECT** — same as OCR_TIER0B; subsumed by WRONG_CITATION |
| `FRAME_SHIFT_DETECTED` | YES — `v40-pdfjs-frame-shift.yml` workflow exits with sentinel `FRAME-SHIFT DETECTED` on citation divergence between old/new pdfjs (Phase 47 work, referenced in MILESTONES) | NO | YES — fix surface is the pdfjs pin in `package.json` `verifierDeps.pdfjs-dist` | **PRIMARY CANDIDATE** — has producer, has fix surface (pin bump or rollback), aligns with v4.0 DEPS-04 architecture |
| `AB_WINNER_FLIP` | NO producer (would need to be detected from successive A/B winner emissions); chicken-and-egg with Feature 5 | NO | Marginal — fix surface is `MODEL_ROUTES` which is frozen | **REJECT** — meta-feature; A/B winner emission is itself the signal; no auto-fix needed |
| `VERIFIER_DISAGREE` *(already in ERROR_CLASSES)* | YES — heuristically triaged today via Rule 2 | YES (in array) | YES — verifier or matching tier logic | **PRIMARY CANDIDATE** — most leveraged add: existing producer, existing triage row, just no fix scaffold. Fix surface: `tests/e2e/lib/pdf-verifier.js` (tier classification thresholds) + `src/shared/matching.js` (when matching tier disagrees with verifier) |
| `WORKER_FALLBACK_FAILED` *(already has scaffold)* | YES today | YES | YES today | **already scaffolded** — not a candidate, listed for completeness |

### Recommended v4.3 scaffold additions (concrete)

**Ship 2 scaffolds in v4.3** (paired with Feature 7 heuristic rules):

1. **`VERIFIER_DISAGREE`** — already in `ERROR_CLASSES` array; already produced
   by Rule 2 of the heuristic triage; needs only a new entry in
   `PROMPT_SCAFFOLDS` registry at `fix-prompt-builder.js:357-363` + a CONTRACT
   string mirroring the existing 5. Fix surface: `tests/e2e/lib/pdf-verifier.js`
   (tier classification + window matching). Co-design with `llm-router.js`
   decision: stays on sonnet default (no opus needed; the fix surface is
   well-bounded).

2. **`FRAME_SHIFT_DETECTED`** — needs a NEW `ERROR_CLASS` entry in
   `error-codes.js:98-110` (after `LLM_API_ERROR`), a producer in
   `v40-pdfjs-frame-shift.yml` workflow (file the GH issue with
   `FRAME_SHIFT_DETECTED` label when the sentinel fires), and a scaffold whose
   CONTRACT names the fix surface (`package.json` `verifierDeps.pdfjs-dist`
   pin + the `v40-pdfjs-frame-shift.yml` workflow assertion). This is the
   HIGHEST-leverage add: closes the loop on the dep-update flow.

**Defer** the other candidates to v4.4 — they need producer sites OR taxonomy
extension that exceed v4.3 budget.

---

## Concrete heuristic rules (for Feature 7)

For each LLM-routed fall-through class, the rule's signal source must be
already-present in `inputLlmReport.iterations[*]` or `inputRerunReport.replays[*]`
(no new harness data collection). Grep evidence:

| Class | Signal source | Heuristic | Complexity |
|-------|---------------|-----------|------------|
| `GOOGLE_DOM_DRIFT` | `iter.classification === 'GOOGLE_DOM_DRIFT'` AND issue body contains a `data-testid=` substring (Feature 1's mutator pre-injects this) | If diagnostic snippet present AND NOT_REPLAYABLE → emit heuristic finding with severity `medium`, rationale "DOM probe failed; diagnostic snippet pre-injected". If snippet absent → fall through to existing Rule 4 (LLM-needed) | **LOW** (one more `if` branch in `triage-classifier.js` after Rule 3) |
| `WORKER_FALLBACK_FAILED` | `iter.classification === 'WORKER_FALLBACK_FAILED'` AND `iter.verifier_verdict.tier_used === 'D'` (verifier could not match) AND `iter.fault_injection_status` ∈ {`worker_404`, `worker_5xx`, `worker_html_response`} | If CONFIRMED + above signals → emit heuristic finding with severity `high`, rationale "Worker fallback path broke deterministically (status: X)". If only some signals match → Rule 4 fallthrough | **MEDIUM** (requires producer site at `tests/e2e/specs/fault-injection.spec.js` to write `fault_injection_status` into the iteration record — additive but co-design) |
| `EXTENSION_NOT_LOADED` | `iter.classification === 'EXTENSION_NOT_LOADED'` (harness threw before verifier ran) | Always heuristic — this class is binary (loaded or not); LLM cannot help with extension-load failures. Severity `low` (almost always a fixture/CI runner issue, not a product bug), rationale "Extension failed to attach; check CI fixture" | **LOW** (one `if` branch; no signal extraction needed) |
| `UI_BROKEN` | `iter.classification === 'UI_BROKEN'` (Shadow DOM closed-mode not accessible OR pill never attached) | Two sub-signals: shadow-DOM-blocked vs pill-attach-timeout. Heuristic: severity `medium`, rationale "Shadow DOM probe failed — selector update likely needed". Subsumed under GOOGLE_DOM_DRIFT heuristic if the page-level DOM probe ALSO failed | **MEDIUM** — needs disambiguation logic; can co-route with GOOGLE_DOM_DRIFT |
| `USPTO_API_DRIFT` | `iter.classification === 'USPTO_API_DRIFT'` AND iter has a `worker_response_shape` mismatch flag | Heuristic feasible only if Worker spec writes the shape-mismatch flag. Without that producer, fall-through is correct | **MEDIUM** — depends on Worker spec extension; **DEFER** to v4.4 |
| `NO_CITATION_PRODUCED` | `iter.classification === 'NO_CITATION_PRODUCED'` (extension ran but produced no citation) | Tier-D verifier verdict + production no-citation = symptom of matching-tier exhaustion. Recommend Rule 4 fallthrough (LLM cluster) — heuristic risks false-positive route to "do nothing" | **REJECT** — Rule 4 LLM-routing is correct; heuristic would hide real product bugs |

### Recommended v4.3 heuristic additions (concrete)

**Ship 3 heuristic rules in v4.3** (covers 3 of 6 fall-through classes):

1. **`GOOGLE_DOM_DRIFT` mutator-aware** (LOW complexity) — depends on Feature 1
2. **`EXTENSION_NOT_LOADED`** (LOW complexity, no deps)
3. **`WORKER_FALLBACK_FAILED`** (MEDIUM complexity, needs co-design with
   fault-injection spec producer)

**Defer** `UI_BROKEN`, `USPTO_API_DRIFT`, `NO_CITATION_PRODUCED` to v4.4 (signal
ambiguity or absent producer sites).

**Result**: 7-of-11 heuristic-resolved → 10-of-11 heuristic-resolved
(`NO_CITATION_PRODUCED` deliberately remains LLM-routed by Anti-Feature
decision above).

---

## Feature Dependencies

```
Feature 1 (diagnostic-injection mutator)
  ├─ blocks Feature 6.GOOGLE_DOM_DRIFT testability (mutator-injected DOM snippet)
  ├─ blocks Feature 7.GOOGLE_DOM_DRIFT heuristic (mutator-aware signal)
  └─ co-designed with fix-prompt-builder.js:252-268 GOOGLE_DOM_DRIFT contract

Feature 2 (--max-turns 5 + --allowed-tools Read,Glob,Grep)
  ├─ blocks Feature 6.WRONG_CITATION live testability (already-shipped scaffold)
  ├─ blocks Feature 6.VERIFIER_DISAGREE testability (new scaffold)
  └─ blocks ANY scaffold attempt against real production issues
     (without it, dispatcher hits error_max_turns)

Feature 3 (forensic schema source + transport required)
  ├─ blocks Feature 5 (a-b-winner.mjs:185-188 isAttributable filter)
  ├─ blocks Feature 8 (capture-and-surface needs ledger entries with source)
  └─ closes the 3-orphan claude-opus-4-7[1m] leak path

Feature 4 (synthetic-issue cleanup #20/21/22/23)
  └─ blocks UAT-47-a/b re-execution (cannot rerun against polluted tracker)

Feature 5 (A/B winner table emission)
  ├─ depends on Feature 3 (schema)
  └─ depends on ≥1 real merged auto-fix PR per arm per class
     (which depends on Features 1+2+4)

Feature 6 (new scaffolds)
  ├─ depends on Feature 1 + Feature 2 for testability
  ├─ co-design with error-codes.js ERROR_CLASSES array (if new class added)
  └─ co-design with Feature 7 (need matching producer for triage routing)

Feature 7 (new heuristic rules)
  ├─ Rule for GOOGLE_DOM_DRIFT depends on Feature 1 (mutator-injected snippet signal)
  ├─ Rule for WORKER_FALLBACK_FAILED depends on fault-injection spec producer update
  └─ Rule for EXTENSION_NOT_LOADED — no deps

Feature 8 (prompt-iter loop — capture-and-surface shape)
  ├─ depends on Feature 3 (schema for failed-attempt ledger row)
  └─ co-shipped with weekly-digest.mjs section addition
```

### Topological sequencing recommendation

Wave 0 (Carry-over closure, must all land before Wave 1):
- Feature 1 (mutator extension)
- Feature 2 (`--max-turns 5`)
- Feature 3 (forensic schema)
- Feature 4 (synthetic-issue cleanup)

Wave 1 (Capability expansion, parallelizable post-Wave-0):
- Feature 5 (A/B winner table emission) — independent post-Wave-0
- Feature 7.{EXTENSION_NOT_LOADED} — fully independent
- Feature 7.{GOOGLE_DOM_DRIFT} — depends on Feature 1
- Feature 8 (prompt-iter capture-and-surface) — depends on Feature 3

Wave 2 (Scaffold expansion + remaining triage rules, sequential after Wave 1
evidence accumulates):
- Feature 6.{VERIFIER_DISAGREE} — low risk, just registry add
- Feature 6.{FRAME_SHIFT_DETECTED} — needs taxonomy extension + producer
- Feature 7.{WORKER_FALLBACK_FAILED} — needs fault-injection spec co-design

---

## MVP Recommendation for v4.3

**Mandatory (Wave 0 — all 4):**
1. Diagnostic-injection mutator extension
2. `--max-turns 5` + `--allowed-tools Read,Glob,Grep`
3. Forensic-ledger schema hardening
4. Synthetic-issue cleanup

**High-value (Wave 1 — pick 2-3):**
5. A/B winner table emission to weekly digest
6. Feature 7 heuristic rules: `EXTENSION_NOT_LOADED` + `GOOGLE_DOM_DRIFT`
   (mutator-aware)
7. Feature 8 prompt-iter capture-and-surface

**Stretch (Wave 2 — defer if Wave 0+1 consumes the phase budget):**
8. Feature 6 scaffold: `VERIFIER_DISAGREE`
9. Feature 6 scaffold: `FRAME_SHIFT_DETECTED`
10. Feature 7 heuristic rule: `WORKER_FALLBACK_FAILED`

**Defer to v4.4:**
- Feature 6 scaffolds for PDF_PARSE_ERROR / COLUMN_INFERENCE_FAIL / IDB_FAILURE
  (need new producer sites)
- Feature 7 heuristic for UI_BROKEN / USPTO_API_DRIFT (signal ambiguity)
- Full-automation prompt-iter loop (rejected outright as Anti-Feature)

Per PROJECT.md: "Research convergence will likely propose 7–9 phases. If too
big, Prompt-iter loop or scaffold expansion can be deferred to v4.4 at
requirements-scoping time." This MVP shape lands 7 features in v4.3 (Wave 0 +
Wave 1) and explicitly carries 3 to v4.4 (Wave 2) — leaving roadmap a clean
"ship or defer" decision per feature.

---

## Sources

Primary (HIGH confidence — live tree grep):
- `tests/e2e/lib/error-codes.js:51-110` — canonical `ERROR_CLASSES` taxonomy
- `tests/e2e/lib/fix-prompt-builder.js:357-363, 378-382, 406-434` — 5
  PROMPT_SCAFFOLDS + 3 SKIP_CLASS_ESCALATIONS + `buildFixPrompt` dispatch
- `tests/e2e/lib/triage-classifier.js:428-505` — D-03 rule chain (Rules 1-4)
- `tests/e2e/lib/llm-router.js:60-85` — MODEL_ROUTES freeze + routeModel
- `tests/e2e/lib/llm-driver.js:89-146` — `invokeClaudeP` argv (line 94
  `--max-turns 1`); `:506-647` `invokeAnthropicSdkWithLedger` SDK path
- `tests/e2e/scripts/inject-defect.mjs:64-75, 277-298, 396-428` — mutator
  ERROR_CLASSES allowlist + buildBody + cleanup runbook emitter
- `scripts/auto-fix.mjs:219-270, 600-746` — RECOGNIZED_LABELS, errorClass
  extraction, Step 7 dispatch + skip-class ledger entry
- `scripts/a-b-winner.mjs:78-285, 332-389` — N_PER_ARM_REQUIRED, abstention
  probe, formatMarkdownTable, main flow

Secondary (HIGH confidence — planning artifacts):
- `.planning/STATE.md` lines 81-85 — v4.3 carry-over Pending Todos with
  exact line refs
- `.planning/MILESTONES.md` line 26 — Architectural finding (SWEEP-03
  attempts root-cause)
- `.planning/PROJECT.md` lines 11-38 — milestone scope + DoD
- `.planning/research-v4.2-archive/FEATURES.md` — v4.2 feature framing
  (consulted for style, not duplicated)

Tertiary (MEDIUM confidence — operator memory):
- MEMORY.md `auto_fix_ledger_leak_vector.md` — orphan ledger entry leak
  vector context for Feature 3

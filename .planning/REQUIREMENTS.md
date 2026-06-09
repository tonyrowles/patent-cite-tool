# Requirements: v4.3 Auto-Fix Loop Closure + Capability Expansion

**Defined:** 2026-06-09
**Core Value:** Highlight text on Google Patents, get an accurate citation reference instantly — no PDF downloading, no manual counting.
**DoD:** Live UAT-47-a/b/SWEEP-03/04/06 PROVEN on `origin/main` + at least one real production fix flowing through the expanded surface (A/B winner exit + at least one new scaffold) + total v4.3 spend within $15 soft cap.

## v1 Requirements (this milestone)

Phase numbering continues from v4.2 (last phase: 60 + 60.1 hotfix → first v4.3 phase: 61).

### Diagnostic-injection mutator extension (Phase 61, Wave 0 carry-over)

- [ ] **DIAG-01**: `tests/e2e/scripts/inject-defect.mjs:buildBody` embeds a seeded `GOOGLE_DOM_DRIFT` DOM snippet whose CSS class / `data-testid` vocabulary is verbatim-present in `tests/e2e/lib/google-patents-page.js`
- [ ] **DIAG-02**: `inject-defect.mjs:buildBody` embeds a seeded `WRONG_CITATION` Verifier Disagreement block whose template parity matches `tests/e2e/lib/issue-payload-builder.js` Phase 35 shape
- [ ] **DIAG-03**: Mutator output is deterministic — same seed + same errorClass → byte-identical body (Vitest fixture pin); SOURCE_TAG `'fixture-mutator-uat-47b'` literal preserved (MUTATOR-04 co-design invariant from `quarantine-append.mjs:239`)

### `--max-turns` relaxation + tools restriction (Phase 61, Wave 0 carry-over)

- [ ] **TURNS-01**: `tests/e2e/lib/llm-driver.js:94` argv literal updated from `['--max-turns','1']` to `['--max-turns','5','--tools','Read,Glob,Grep','--max-budget-usd','0.50']` for the SUBSCRIPTION transport ONLY; SDK transport documented unchanged (single-turn by API design)
- [ ] **TURNS-02**: Vitest pin asserts the argv array contains `'--tools', 'Read,Glob,Grep'` AND excludes the strings `'Edit'`, `'Bash'`, `'Write'`, `'WebFetch'`, `'--allowed-tools'`, `'--allowedTools'` literally anywhere in the call
- [ ] **TURNS-03**: `--max-turns 5` cost-bound regression test — mean per-call spend < $0.30 across 5 smoke issues; integrates with existing per-issue/per-PR caps

### Forensic-ledger schema hardening (Phase 62, Wave 0 carry-over)

- [ ] **LEDX-01**: New shared helper `tests/e2e/lib/safe-append-ledger.js` extracted from the existing `scripts/auto-fix.mjs` `safeAppendLedger` pattern; defaults `source`/`transport` if caller omits; rejects non-canonical `transport` values
- [ ] **LEDX-02**: Helper consumed by 3 scripts covering all 4 currently-unguarded ledger-write sites — `scripts/auto-fix-promote.mjs:521` + `:544` + `scripts/e2e-explore.mjs:262` + `:313`
- [ ] **LEDX-03**: `tests/e2e/lib/llm-ledger.js:appendLedgerEntry` body BYTE-UNCHANGED (Phase 56 additive-only invariant preserved; all 33 pre-existing Vitest ledger tests stay green)
- [ ] **LEDX-04**: Phase 60.1 subscription-transport whitelist preserved (Vitest pin `T_PHASE60_1_HOTFIX_PRESERVED` asserts `transport:'subscription'` entries pass through `safeAppendLedger` unblocked)

### Sole-maintainer bypass audit (Phase 62, NEW v4.3 cross-cutting)

- [ ] **BYPASS-01**: New `scripts/audit-bypass-merges.mjs` queries `gh api repos/<owner>/<repo>/actions/runs` for `verifier-gate` runs completed AFTER PR merge timestamp; surfaces sole-maintainer `--admin` bypasses; outputs CSV consumed by A/B winner filter
- [ ] **BYPASS-02**: Weekly digest gains a bypass-count metric in the Auto-Fix Pipeline section (SUMMARY_KEYS frozen-array additive-only)
- [ ] **BYPASS-03**: `.planning/STATE.md` gains a `## Bypass Conventions` section documenting "DO NOT use `gh pr merge --admin` on `auto-fix/*` branches" runbook discipline

### Heuristic-first triage extension (Phase 64)

- [ ] **TRIAGE-01**: `tests/e2e/lib/triage-classifier.js:runTriage` adds heuristic rule for `EXTENSION_NOT_LOADED` (LOW complexity, no new dependencies)
- [ ] **TRIAGE-02**: `runTriage` adds heuristic rule for `GOOGLE_DOM_DRIFT` ONLY when the diagnostic-injection mutator snippet (DIAG-01) is present in the issue body; real DOM drift (no snippet) still routes to LLM
- [ ] **TRIAGE-03**: `runTriage` adds heuristic rule for `WORKER_FALLBACK_FAILED` consuming a `fault_injection_status` field; producer-site co-design in `tests/e2e/specs/fault-injection.spec.js` if the field doesn't already exist
- [ ] **TRIAGE-04**: `VERIFIER_STRONG_AGREEMENT` Tier-C-masking guard preserved (Phase 34 invariant); cluster pre-filter sample-size invariant test asserts cluster call count NOT decreased vs v4.2 baseline

### Expanded fix scaffolds (Phase 65)

- [ ] **SCAF-01**: New `VERIFIER_DISAGREE` scaffold (`*_CONTRACT` + `*_SYSTEM` constants + PROMPT_SCAFFOLDS registry entry) via `buildScaffoldSystemPrompt` helper in `tests/e2e/lib/fix-prompt-builder.js`
- [ ] **SCAF-02**: New `FRAME_SHIFT_DETECTED` scaffold + new ERROR_CLASS entry in `tests/e2e/lib/error-codes.js:ERROR_CLASSES` + producer wiring in `.github/workflows/v40-pdfjs-frame-shift.yml` (emits issue body with `<frame_shift_evidence>` section)
- [ ] **SCAF-03**: 5-site enumeration drift guard Vitest test — for each new ERROR_CLASS, assert presence in `error-codes.js` AND `v40-auto-fix.yml:91` precheck list AND `PROMPT_SCAFFOLDS` AND `inject-defect.mjs` ERROR_CLASSES allowlist AND `MODEL_ROUTES` (or `// MODEL_DEFAULT_OK:` comment)
- [ ] **SCAF-04**: Byte-stability sha256 pin for the 5 existing scaffolds against Phase 45 baseline (`WRONG_CITATION`, `LLM_HALLUCINATED_SELECTION`, `WORKER_FALLBACK_FAILED`, `GOOGLE_DOM_DRIFT`, `HARNESS_ERROR`); PROMPT_SCAFFOLDS `Object.frozen` preserved

### A/B winner exit + 3-way stratification (Phase 66)

- [ ] **ABWIN-01**: `scripts/a-b-winner.mjs:computePerClassPerArm` extended to stratify by **(class, arm, transport)** 3-way (NEW v4.3 finding — corrects Phase 54 D-19 oversight); winner declared only when both transports agree OR with explicit transport disclosure in the markdown table
- [ ] **ABWIN-02**: `--since-iso` argv filter on `a-b-winner.mjs` prevents pre-v4.3 entries (without source/transport) from contaminating the sample; `TIE_THRESHOLD` raised 0.05 → 0.10 (PITFALLS noise-floor reasoning inline-documented)
- [ ] **ABWIN-03**: `--admin-bypass` argv filter on `a-b-winner.mjs` consumes the CSV from `scripts/audit-bypass-merges.mjs` (BYPASS-01) to exclude bypass-tainted `outcome:'pass'` entries
- [ ] **ABWIN-04**: `PHASE_56_TODO` comments removed from `a-b-winner.mjs`; sanity-check pre-emit refuses to declare a winner when one arm has zero samples for a given (class, transport) cell

### Prompt-iter loop — Shape A capture-and-surface, in-process (Phase 67)

- [ ] **PITER-01**: `tests/e2e/lib/fix-prompt-builder.js:buildFixPrompt` accepts an optional `rewriteHint` parameter that splices into systemPrompt via `buildScaffoldSystemPrompt`; PROMPT_SCAFFOLDS `Object.freeze` and 5-existing-scaffold byte-stability sha256 preserved
- [ ] **PITER-02**: `scripts/auto-fix.mjs:runDispatcher` Step 10 adds an iteration-loop wrapper that re-invokes `buildFixPrompt` with a hint composed from the previous attempt's failure mode (parse error message; verifier disagreement window)
- [ ] **PITER-03**: New constants `ITER_MAX_ROUNDS = 2` and `PROMPT_ITER_COST_CAP_USD = 0.50` (per fingerprint, cumulative); new additive ledger field `iter_round` (integer 0..ITER_MAX_ROUNDS) — `appendLedgerEntry` body BYTE-UNCHANGED
- [ ] **PITER-04**: Iteration triggers ONLY on `apply-check-failed` and `malformed-diff:*` outcomes — NEVER on `sdk_error` (fast-fail to preserve cost-discipline); test fixture pins fast-fail on `sdk_error`
- [ ] **PITER-05**: FORBIDDEN_PATHS regex bank in `scripts/check-diff-guard.mjs` extended to include `tests/e2e/lib/fix-prompt-builder.js` AND `tests/e2e/lib/llm-router.js` (defense-in-depth: even if prompt-iter ever ships Shape B in v4.4+, the auto-fix PR cannot edit scaffold source)

### Synthetic-issue cleanup (Phase 68 — final phase)

- [ ] **CLEAN-01**: New `scripts/uat-cleanup.mjs` closes mutator-injected GitHub issues #20/21/22/23; cleans up associated auto-fix PRs; reverts the corresponding quarantine entries
- [ ] **CLEAN-02**: Triple-tagged filter (issue title regex + body fingerprint marker + label match) ensures no accidental real-issue match; dry-run is the DEFAULT; `--confirm` opt-in required; precondition sentinel `.planning/sweep-03-04-pass-evidence.yaml` must exist before any destructive action
- [ ] **CLEAN-03**: `inject-defect.mjs:emitCleanupEvidence` template refreshed to invoke `scripts/uat-cleanup.mjs` (so future mutator runs auto-document the cleanup path)

### Live UAT re-sweep + DoD evidence (Phase 61 + Phase 68)

- [ ] **UAT-01**: SWEEP-03 (UAT-47-a) PROVEN on `origin/main` — synthetic GOOGLE_DOM_DRIFT issue → auto-fix → verifier-gate PASS → merge → promote → outcome ledger entry with `errorClass: 'GOOGLE_DOM_DRIFT'` + `outcome: 'pass'` + `source: 'auto-fix-promoted'` + `transport: 'sdk' | 'subscription'`
- [ ] **UAT-02**: SWEEP-04 (UAT-47-b) PROVEN on `origin/main` — fixture-mutator full loop with MUTATOR-04 production-path suppression invariant observed (`isFixtureMutator` filter prevents synthetic from contaminating quarantine corpus)
- [ ] **UAT-03**: SWEEP-06 PROVEN — `scripts/uat-cleanup.mjs` successfully closes #20/21/22/23 + cleans auto-fix PRs + reverts quarantine entries on a smoke run; precondition sentinel logic validated
- [ ] **UAT-04**: Total v4.3 spend stays within the $15 milestone soft cap (final tally at Phase 68 close); per-phase spend recorded in the phase's VERIFICATION.md

### Budget formalization (Phase 61 — landed at start of milestone)

- [ ] **BUDG-01**: `.planning/STATE.md` gains a `## Budget` section: $15 milestone soft cap, $30 hard ceiling, per-phase < $5, mean per-call < $0.30 (TURNS-03); per-phase spend probe surfaces against this cap in each phase's VERIFICATION.md footer

## v2 Requirements (deferred to v4.4+)

### Additional scaffolds (deferred)

- **SCAF-DEF-01**: `PDF_PARSE_FAILED` scaffold — STACK research recommendation; high real-world frequency (~2-5% of patents lack text layers); deferred to v4.4 to keep Phase 65 scope tight
- **SCAF-DEF-02**: `COLUMN_INFERENCE_FAIL`, `IDB_FAILURE`, `OCR_TIER0B_REGRESSION`, `GUTTER_TIER5_REGRESSION`, `CACHE_MISS_TIMEOUT`, `AB_WINNER_FLIP`, `TIER_C_DISAGREEMENT` — need new producer sites OR are subsumed by existing scaffolds

### Additional heuristic rules (deferred)

- **TRIAGE-DEF-01**: `UI_BROKEN` heuristic — signal ambiguity (overlaps with EXTENSION_NOT_LOADED); deferred to v4.4 pending diagnostic-field re-audit
- **TRIAGE-DEF-02**: `USPTO_API_DRIFT` heuristic — absent producer; deferred to v4.4 pending fault-injection spec extension
- **TRIAGE-DEF-03**: `NO_CITATION_PRODUCED` heuristic — deliberately left LLM-routed; heuristic resolution would mask real product bugs

### A/B winner threshold tuning (deferred)

- **ABWIN-DEF-01**: `N_PER_ARM_REQUIRED` value tuning (currently 20) — insufficient v4.3 data to justify a change; revisit in v4.4 after a week of live ledger baseline post-v4.3-ship

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Prompt-iter Shape B (full automation) | Trust-boundary erosion risk; rejected outright as Anti-Feature by STACK + FEATURES + PITFALLS researchers |
| Adding `Edit` or `Bash` to `--tools` palette | Re-enables the v4.0 trust-invariant violation (loop NEVER writes code outside dispatcher's `git apply`); cost-discipline gate must hold |
| Bumping `--max-turns` to >5 | Cost discipline; 5 is the empirically-derived ceiling from research convergence |
| Auto-merging A/B winner-decision-driven `MODEL_ROUTES` edits | The winner-decision markdown table is decision-surface only; humans author the PR |
| Backfilling old ledger entries with synthetic `source`/`transport` defaults | Falsifies the forensic record; reader-side filter in `a-b-winner.mjs --since-iso` is the correct approach |
| Treating `GOOGLE_DOM_DRIFT` as routinely heuristic-resolvable | Heuristic ONLY when mutator-injected snippet (DIAG-01) is present; real DOM drift still routes to LLM |
| Bumping `@anthropic-ai/sdk@0.100.1` EXACT pin | Out-of-band via `check-deps-and-pr.mjs` `auto-fix:sdk-bump` review path; not piggybacking on v4.3 |
| Bumping Vitest, Playwright, or `peter-evans/create-pull-request@v8` | No v4.3 capability needs version changes; double-change risk against research-verified pins |
| Refactoring `v40-auto-fix.yml` direct-to-main ledger commit | Phase 57 scope-lock: `grep -c 'git push origin main' .github/workflows/v40-auto-fix.yml` must equal 1 throughout v4.3 |
| Touching `assertTripleGate` body | Phase 53 trust-invariant; sha256 byte-equivalent baseline must survive every v4.3 phase |
| Adding required-field validation to `appendLedgerEntry` body | Would break 33 pre-existing Vitest ledger tests; ship validation at shared-wrapper layer per LEDX-01 instead |
| Closing #20/21/22/23 before SWEEP-03/04 PASS evidence captured | Cleanup destroys the evidence trail; CLEAN-02 precondition sentinel enforces ordering |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DIAG-01 | Phase 61 | Pending |
| DIAG-02 | Phase 61 | Pending |
| DIAG-03 | Phase 61 | Pending |
| TURNS-01 | Phase 61 | Pending |
| TURNS-02 | Phase 61 | Pending |
| TURNS-03 | Phase 61 | Pending |
| BUDG-01 | Phase 61 | Pending |
| UAT-01 | Phase 61 | Pending |
| UAT-02 | Phase 61 | Pending |
| LEDX-01 | Phase 62 | Pending |
| LEDX-02 | Phase 62 | Pending |
| LEDX-03 | Phase 62 | Pending |
| LEDX-04 | Phase 62 | Pending |
| BYPASS-01 | Phase 62 | Pending |
| BYPASS-02 | Phase 62 | Pending |
| BYPASS-03 | Phase 62 | Pending |
| TRIAGE-01 | Phase 64 | Pending |
| TRIAGE-02 | Phase 64 | Pending |
| TRIAGE-03 | Phase 64 | Pending |
| TRIAGE-04 | Phase 64 | Pending |
| SCAF-01 | Phase 65 | Pending |
| SCAF-02 | Phase 65 | Pending |
| SCAF-03 | Phase 65 | Pending |
| SCAF-04 | Phase 65 | Pending |
| ABWIN-01 | Phase 66 | Pending |
| ABWIN-02 | Phase 66 | Pending |
| ABWIN-03 | Phase 66 | Pending |
| ABWIN-04 | Phase 66 | Pending |
| PITER-01 | Phase 67 | Pending |
| PITER-02 | Phase 67 | Pending |
| PITER-03 | Phase 67 | Pending |
| PITER-04 | Phase 67 | Pending |
| PITER-05 | Phase 67 | Pending |
| CLEAN-01 | Phase 68 | Pending |
| CLEAN-02 | Phase 68 | Pending |
| CLEAN-03 | Phase 68 | Pending |
| UAT-03 | Phase 68 | Pending |
| UAT-04 | Phase 68 | Pending |

**Coverage:**
- v1 requirements: 38 total
- Mapped to phases: 38
- Unmapped: 0 ✓

---
*Requirements defined: 2026-06-09*
*Last updated: 2026-06-09 after milestone-start research convergence*

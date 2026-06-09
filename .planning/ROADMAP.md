# Roadmap: v4.3 Auto-Fix Loop Closure + Capability Expansion

**Defined:** 2026-06-09
**Granularity:** standard
**Phase Numbering:** Continues from v4.2 (last shipped: Phase 60 + 60.1 hotfix → first v4.3 phase = Phase 61). Canonical sequence `61 → 62 → 64 → 65 → 66 → 67 → 68` (skipping 63 — preserves the PITFALLS-to-phase mapping documented in `.planning/research/PITFALLS.md`; the skip is intentional and load-bearing for cross-document references).

## Milestone Overview

**Core Value:** Highlight text on Google Patents, get an accurate citation reference instantly — no PDF downloading, no manual counting.

**Goal:** Close the v4.2 architectural carry-over (diagnostic-injection mutator + `--max-turns` relaxation + forensic-ledger hardening + synthetic-issue cleanup) to land live UAT-47-a/b/SWEEP-03/04 evidence on `origin/main`, then expand the auto-fix surface with A/B winner exit, additional fix scaffolds, broader heuristic-first triage, and a prompt-iteration loop.

**Definition of Done:**

- Live UAT-47-a/b/SWEEP-03/04 PROVEN on `origin/main` with `errorClass` + `outcome` + `source` + `transport` ledger entries flowing through end-to-end
- At least one real production fix flowing through the expanded surface (A/B winner exit + at least one new scaffold)
- Synthetic GitHub issues #20/21/22/23 closed via `scripts/uat-cleanup.mjs`
- Total v4.3 spend within the $15 milestone soft cap (final tally at Phase 68 close)
- Trust invariants preserved across every phase: `assertTripleGate` body sha256-equivalent to Phase 53 baseline; `appendLedgerEntry` body byte-unchanged; `PROMPT_SCAFFOLDS` `Object.freeze` + 5 existing-scaffold byte-stability sha256; ESLint `@anthropic-ai/sdk` single-entry-point guard; `grep -c 'git push origin main' .github/workflows/v40-auto-fix.yml` == 1 (Phase 57 scope-lock); Phase 60.1 subscription-transport whitelist

**Coverage:** 38/38 v1 requirements mapped to 7 phases. Zero orphans.

## Wave Structure

| Wave | Phases | Description |
|------|--------|-------------|
| **Wave 0** | 61, 62 | Carry-over closure (required for DoD). Phase 61 atomic bundle (#1+#2+#3) jointly required for UAT-47-a/b PASS; Phase 62 closes auxiliary-leak vector + bypass-audit probe. Wave 0 must ship in order; Phase 62 depends on Phase 61's clean schema. |
| **Wave 1** | 64, 65, 66, 67 | Capability expansion (parallelizable post-Wave-0). Phases 64/65/66 touch disjoint files and can run in any order. Phase 67 depends on Phase 61 substrate being live on `origin/main`. |
| **Wave 2** | 68 | Final cleanup (precondition-gated). MUST be last phase; runs only after `.planning/sweep-03-04-pass-evidence.yaml` sentinel exists (captured from Phase 61's UAT-01/UAT-02 PASS). |

## Phases

- [ ] **Phase 61: Carry-over Bundle — Diagnostic Mutator + Max-Turns + UAT Re-sweep** - Atomic Wave-0 bundle delivering DIAG/TURNS/BUDG capabilities and live UAT-47-a/b PASS on origin/main
- [ ] **Phase 62: Forensic Ledger Hardening + Bypass-Audit Probe** - Shared `safe-append-ledger.js` helper closing 4 unguarded sites + sole-maintainer bypass audit (Pitfall 11)
- [ ] **Phase 64: Heuristic-First Triage Extension** - 3 new heuristic rules in `runTriage` pushing coverage from 7/11 → 10/11
- [ ] **Phase 65: Expanded Fix Scaffolds** - New `VERIFIER_DISAGREE` + `FRAME_SHIFT_DETECTED` scaffolds with 5-site enumeration drift guard
- [ ] **Phase 66: A/B Winner Exit + 3-way Transport Stratification** - Drive `a-b-winner.mjs` out of abstention with (class, arm, transport) 3-way stratification
- [ ] **Phase 67: Prompt-Iter Loop (Shape A — Capture-and-Surface, In-Process)** - In-process iteration wrapper with `rewriteHint` parameter and `iter_round` ledger field
- [ ] **Phase 68: Synthetic-Issue Cleanup + Final UAT Tally** - Close issues #20/21/22/23 + verify total v4.3 spend within $15 soft cap

## Phase Details

### Phase 61: Carry-over Bundle — Diagnostic Mutator + Max-Turns + UAT Re-sweep
**Goal**: Diagnostic-injection mutator + `--max-turns 5 --tools Read,Glob,Grep` + `BUDG-01` budget formalization ship in one atomic commit, enabling live UAT-47-a/b/SWEEP-03/04 PASS evidence on `origin/main` with `errorClass` + `outcome` + `source` + `transport` ledger entries flowing through end-to-end.
**Depends on**: Nothing (first v4.3 phase; carry-over from v4.2 architectural deferral)
**Requirements**: DIAG-01, DIAG-02, DIAG-03, TURNS-01, TURNS-02, TURNS-03, BUDG-01, UAT-01, UAT-02
**Wave**: Wave 0 (atomic bundle — partial states recreate v4.2 SWEEP-03 failure shape)
**Success Criteria** (what must be TRUE):
  1. SWEEP-03 (UAT-47-a) PROVEN on `origin/main` — synthetic GOOGLE_DOM_DRIFT issue → auto-fix → verifier-gate PASS → merge → promote → outcome ledger entry written with `errorClass: 'GOOGLE_DOM_DRIFT'` + `outcome: 'pass'` + `source: 'auto-fix-promoted'` + `transport: 'sdk' | 'subscription'`
  2. SWEEP-04 (UAT-47-b) PROVEN on `origin/main` — fixture-mutator full loop with MUTATOR-04 production-path suppression invariant observed (`isFixtureMutator` filter prevents synthetic from contaminating quarantine corpus)
  3. `tests/e2e/lib/llm-driver.js:94` argv literal contains `--tools Read,Glob,Grep` (NOT `--allowed-tools` / `--allowedTools` — verified in argv) AND excludes `Edit`/`Bash`/`Write`/`WebFetch` literally; SDK transport documented unchanged (single-turn by API design)
  4. Deterministic mutator body byte-pinned — same seed + same errorClass → byte-identical output (Vitest fixture pin); SOURCE_TAG `'fixture-mutator-uat-47b'` literal preserved (MUTATOR-04 co-design invariant from `quarantine-append.mjs:239`)
  5. `--max-turns 5` cost-bound regression test PASSES — mean per-call spend < $0.30 across 5 smoke issues; `.planning/STATE.md ## Budget` section live with $15 soft cap / $30 hard ceiling / per-phase < $5 / mean per-call < $0.30
**Plans**: TBD

### Phase 62: Forensic Ledger Hardening + Bypass-Audit Probe
**Goal**: Shared `tests/e2e/lib/safe-append-ledger.js` helper closes all 4 currently-unguarded ledger-write sites, AND new `scripts/audit-bypass-merges.mjs` surfaces sole-maintainer `--admin` bypasses that pollute A/B winner outcome data — without touching `appendLedgerEntry` body (additive-only invariant preserves 33 pre-existing Vitest tests per Pitfall 3).
**Depends on**: Phase 61 (clean schema substrate)
**Requirements**: LEDX-01, LEDX-02, LEDX-03, LEDX-04, BYPASS-01, BYPASS-02, BYPASS-03
**Wave**: Wave 0 (carry-over closure)
**Success Criteria** (what must be TRUE):
  1. All 4 currently-unguarded ledger-write sites (`scripts/auto-fix-promote.mjs:521`, `:544`, `scripts/e2e-explore.mjs:262`, `:313`) consume the shared helper; `tests/e2e/lib/llm-ledger.js:appendLedgerEntry` body BYTE-UNCHANGED (Phase 56 additive-only invariant preserved); all 33 pre-existing Vitest ledger tests stay green
  2. Phase 60.1 subscription-transport whitelist preserved — Vitest pin `T_PHASE60_1_HOTFIX_PRESERVED` asserts `transport:'subscription'` entries pass through `safeAppendLedger` unblocked (LEDX-04 invariant)
  3. `scripts/audit-bypass-merges.mjs` queries `gh api repos/<owner>/<repo>/actions/runs` for `verifier-gate` runs completed AFTER PR merge timestamp; surfaces sole-maintainer `--admin` bypasses; outputs CSV consumed by Phase 66's `a-b-winner.mjs --admin-bypass` filter
  4. Weekly digest gains a bypass-count metric in the Auto-Fix Pipeline section (SUMMARY_KEYS frozen-array additive-only)
  5. `.planning/STATE.md ## Bypass Conventions` section live documenting "DO NOT use `gh pr merge --admin` on `auto-fix/*` branches" runbook discipline
**Plans:** 2 plans
- [ ] 62-01-PLAN.md — Shared safe-append-ledger helper + wire 4 unguarded sites (LEDX-01..04)
- [ ] 62-02-PLAN.md — Bypass-audit probe + weekly digest bypass-count metric + STATE.md verify (BYPASS-01..03)

### Phase 64: Heuristic-First Triage Extension
**Goal**: Extend `triage-classifier.js:runTriage` D-03 rule chain with 3 new heuristic rules (`EXTENSION_NOT_LOADED`, `GOOGLE_DOM_DRIFT` mutator-aware, `WORKER_FALLBACK_FAILED`) pushing classifier coverage from 7/11 → 10/11 — without weakening the `VERIFIER_STRONG_AGREEMENT` Tier-C-masking guard (Phase 34 invariant).
**Depends on**: Phase 62 (clean ledger schema for synthetic-test fixtures); parallelizable with Phases 65 and 66 (touches `triage-classifier.js` only — disjoint from 65/66 files)
**Requirements**: TRIAGE-01, TRIAGE-02, TRIAGE-03, TRIAGE-04
**Wave**: Wave 1 (capability expansion — parallelizable post-Wave-0)
**Success Criteria** (what must be TRUE):
  1. `runTriage` resolves `EXTENSION_NOT_LOADED` heuristically (LOW complexity, no new dependencies) — does not fall through to LLM cluster/single call
  2. `runTriage` resolves `GOOGLE_DOM_DRIFT` heuristically ONLY when the diagnostic-injection mutator snippet (DIAG-01) is present in the issue body; real DOM drift (no snippet) still routes to LLM
  3. `runTriage` resolves `WORKER_FALLBACK_FAILED` heuristically by consuming a `fault_injection_status` field (producer-site co-design in `tests/e2e/specs/fault-injection.spec.js` if the field doesn't already exist)
  4. `VERIFIER_STRONG_AGREEMENT` Tier-C-masking guard preserved (Phase 34 invariant); Vitest pin `T_TIER_C_NO_MASK` asserts Tier C agreement never resolved heuristically
  5. Cluster pre-filter sample-size invariant test asserts cluster call count NOT decreased vs v4.2 baseline (10 same-category synthetic findings still produce exactly 1 clustered LLM call)
**Plans:** 1 plan
- [ ] 64-01-PLAN.md — Heuristic-first triage extension (3 new rules + Vitest pins + fault-injection producer co-design)

### Phase 65: Expanded Fix Scaffolds
**Goal**: Add `VERIFIER_DISAGREE` (highest leverage — already heuristically produced by Rule 2; needs only registry entry) + `FRAME_SHIFT_DETECTED` (closes pdfjs dep-update loop) PROMPT_SCAFFOLDS entries via `buildScaffoldSystemPrompt` helper, with 5-site enumeration drift guard ensuring every new ERROR_CLASS appears across all five canonical surfaces.
**Depends on**: Phase 62 (clean ledger schema); parallelizable with Phases 64 and 66 (touches `fix-prompt-builder.js` + `error-codes.js` + `v40-pdfjs-frame-shift.yml` only — disjoint from 64/66 files)
**Requirements**: SCAF-01, SCAF-02, SCAF-03, SCAF-04
**Wave**: Wave 1 (capability expansion — parallelizable post-Wave-0)
**Success Criteria** (what must be TRUE):
  1. New `VERIFIER_DISAGREE` scaffold ships as `*_CONTRACT` + `*_SYSTEM` constants + `PROMPT_SCAFFOLDS` registry entry via `buildScaffoldSystemPrompt` helper in `tests/e2e/lib/fix-prompt-builder.js`
  2. New `FRAME_SHIFT_DETECTED` scaffold ships with new ERROR_CLASS entry in `tests/e2e/lib/error-codes.js:ERROR_CLASSES` + producer wiring in `.github/workflows/v40-pdfjs-frame-shift.yml` (emits issue body with `<frame_shift_evidence>` section)
  3. 5-site enumeration drift guard Vitest test PASSES — for each new ERROR_CLASS, presence asserted in `error-codes.js` AND `v40-auto-fix.yml:91` precheck list AND `PROMPT_SCAFFOLDS` AND `inject-defect.mjs` ERROR_CLASSES allowlist AND `MODEL_ROUTES` (or `// MODEL_DEFAULT_OK:` comment justification)
  4. Byte-stability sha256 pin holds for the 5 existing scaffolds against Phase 45 baseline (`WRONG_CITATION`, `LLM_HALLUCINATED_SELECTION`, `WORKER_FALLBACK_FAILED`, `GOOGLE_DOM_DRIFT`, `HARNESS_ERROR`); `PROMPT_SCAFFOLDS` `Object.freeze` invariant preserved
**Plans**: 2 plans
  - [ ] 65-01-PLAN.md — Add VERIFIER_DISAGREE + FRAME_SHIFT_DETECTED scaffolds, error-codes append, 5-site enum wiring (SCAF-01, SCAF-02)
  - [ ] 65-02-PLAN.md — 5-site enumeration drift guard + byte-stability sha256 pins for 7 scaffolds (SCAF-03, SCAF-04)

### Phase 66: A/B Winner Exit + 3-way Transport Stratification
**Goal**: Drive `scripts/a-b-winner.mjs` out of abstention mode by extending `computePerClassPerArm` to stratify by (class, arm, transport) 3-way (NEW v4.3 finding — corrects Phase 54 D-19 oversight); add `--since-iso` and `--admin-bypass` argv filters; raise `TIE_THRESHOLD` 0.05 → 0.10.
**Depends on**: Phase 62 (BYPASS-01 CSV producer) + Phase 61 substrate live on `origin/main` (≥1 SWEEP-03/04 PASS so outcome entries used for sample math are valid); parallelizable with Phases 64 and 65 (touches `a-b-winner.mjs` only — disjoint from 64/65 files)
**Requirements**: ABWIN-01, ABWIN-02, ABWIN-03, ABWIN-04
**Wave**: Wave 1 (capability expansion — parallelizable post-Wave-0)
**Success Criteria** (what must be TRUE):
  1. `computePerClassPerArm` stratifies by (class, arm, transport) 3-way; winner declared only when both transports agree OR with explicit transport disclosure in the markdown table (corrects Phase 54 D-19 oversight that conflated SDK and subscription retry semantics)
  2. `--since-iso` argv filter prevents pre-v4.3 entries (without source/transport) from contaminating the sample; `TIE_THRESHOLD` raised 0.05 → 0.10 (PITFALLS noise-floor reasoning inline-documented)
  3. `--admin-bypass` argv filter consumes the CSV from `scripts/audit-bypass-merges.mjs` (BYPASS-01) to exclude bypass-tainted `outcome:'pass'` entries
  4. `PHASE_56_TODO` comments removed from `a-b-winner.mjs`; sanity-check pre-emit refuses to declare a winner when one arm has zero samples for a given (class, transport) cell
  5. Vitest pins `T_AB_TRANSPORT_01` (3-way stratification) AND `T_AB_SAMPLE_WINDOW_01` (--since-iso filter) AND `T_AB_THRESHOLD_02` (TIE_THRESHOLD === 0.10) all PASS
**Plans**: TBD

### Phase 67: Prompt-Iter Loop (Shape A — Capture-and-Surface, In-Process)
**Goal**: Add in-process iteration loop wrapper to `auto-fix.mjs:runDispatcher` Step 10 that re-invokes `buildFixPrompt` with a `rewriteHint` parameter composed from the previous attempt's failure mode — preserving PROMPT_SCAFFOLDS `Object.freeze` and writing `iter_round` as an additive ledger field. Shape B (full automation) is rejected outright as Anti-Feature.
**Depends on**: Phase 61 substrate LIVE on origin/main (the `--max-turns 5` + diagnostic-injection surface is what the iter-loop iterates on; cannot start before Phase 61 ships). Highest-risk phase architecturally — FORBIDDEN_PATHS extension to include `fix-prompt-builder.js` + `llm-router.js` is non-negotiable defense-in-depth.
**Requirements**: PITER-01, PITER-02, PITER-03, PITER-04, PITER-05
**Wave**: Wave 1 (capability expansion — depends on Phase 61 substrate live)
**Success Criteria** (what must be TRUE):
  1. `tests/e2e/lib/fix-prompt-builder.js:buildFixPrompt` accepts optional `rewriteHint` parameter that splices into systemPrompt via `buildScaffoldSystemPrompt`; PROMPT_SCAFFOLDS `Object.freeze` and 5-existing-scaffold byte-stability sha256 preserved
  2. `scripts/auto-fix.mjs:runDispatcher` Step 10 wraps LLM dispatch in iteration loop that re-invokes `buildFixPrompt` with hint composed from previous attempt's failure mode (parse error message; verifier disagreement window); new constants `ITER_MAX_ROUNDS = 2` and `PROMPT_ITER_COST_CAP_USD = 0.50` (per fingerprint, cumulative); new additive ledger field `iter_round` (integer 0..ITER_MAX_ROUNDS) — `appendLedgerEntry` body BYTE-UNCHANGED
  3. Iteration triggers ONLY on `apply-check-failed` and `malformed-diff:*` outcomes — NEVER on `sdk_error` (fast-fail to preserve cost-discipline); test fixture pins fast-fail on `sdk_error`
  4. FORBIDDEN_PATHS regex bank in `scripts/check-diff-guard.mjs` extended to include `tests/e2e/lib/fix-prompt-builder.js` AND `tests/e2e/lib/llm-router.js` (defense-in-depth: even if prompt-iter ever ships Shape B in v4.4+, the auto-fix PR cannot edit scaffold source) — NON-NEGOTIABLE
  5. Per-fingerprint cumulative spend stays within `PROMPT_ITER_COST_CAP_USD = 0.50`; Vitest pin `T_PROMPT_ITER_BUDGET_01` asserts that after 2 iter-rewrites per fingerprint, next call returns abstention
**Plans**: TBD

### Phase 68: Synthetic-Issue Cleanup + Final UAT Tally
**Goal**: Close mutator-injected GitHub issues #20/21/22/23 + clean up associated auto-fix PRs + revert quarantine entries via `scripts/uat-cleanup.mjs` (triple-tagged filter + dry-run default + `--confirm` opt-in + precondition sentinel) and verify total v4.3 spend within $15 soft cap.
**Depends on**: All prior phases (61, 62, 64, 65, 66, 67) — MUST be the FINAL phase. Precondition sentinel `.planning/sweep-03-04-pass-evidence.yaml` must exist (captured from Phase 61's UAT-01 / UAT-02 PASS evidence).
**Requirements**: CLEAN-01, CLEAN-02, CLEAN-03, UAT-03, UAT-04
**Wave**: Wave 2 (final cleanup — precondition-gated)
**Success Criteria** (what must be TRUE):
  1. SWEEP-06 PROVEN — `scripts/uat-cleanup.mjs` successfully closes #20/21/22/23 + cleans associated auto-fix PRs + reverts quarantine entries on a smoke run; precondition sentinel logic validated (script refuses to run when sentinel absent)
  2. Triple-tagged filter (issue title regex + body fingerprint marker + label match) PROVEN to reject real-issue fixtures missing any leg of the triple; dry-run is the DEFAULT; `--confirm` opt-in required for destructive action
  3. `inject-defect.mjs:emitCleanupEvidence` template refreshed to invoke `scripts/uat-cleanup.mjs` (so future mutator runs auto-document the cleanup path)
  4. Total v4.3 spend stays within the $15 milestone soft cap (final tally aggregated at Phase 68 close); per-phase spend recorded in each phase's VERIFICATION.md
  5. `.planning/sweep-03-04-pass-evidence.yaml` sentinel committed with non-empty `passed_at_iso` field; cleanup-evidence capture archives closed issue bodies + cross-referenced ledger entries into `.planning/milestones/v4.3-phases/68-cleanup/closed-issues-archive.json` before any issue is closed
**Plans**: TBD

## Coverage Validation

**v1 Requirements:** 38 total across 12 categories.
**Phases:** 7 (Phases 61, 62, 64, 65, 66, 67, 68).
**Mapped:** 38/38 (100%).
**Orphaned:** 0.

### Requirements → Phase Mapping

| Category | Requirements | Phase |
|----------|--------------|-------|
| Diagnostic-injection mutator (carry-over) | DIAG-01, DIAG-02, DIAG-03 | Phase 61 |
| `--max-turns` relaxation + tools restriction (carry-over) | TURNS-01, TURNS-02, TURNS-03 | Phase 61 |
| Budget formalization | BUDG-01 | Phase 61 |
| Live UAT (Wave 0 evidence) | UAT-01, UAT-02 | Phase 61 |
| Forensic-ledger schema hardening (carry-over) | LEDX-01, LEDX-02, LEDX-03, LEDX-04 | Phase 62 |
| Sole-maintainer bypass audit (NEW v4.3) | BYPASS-01, BYPASS-02, BYPASS-03 | Phase 62 |
| Heuristic-first triage extension | TRIAGE-01, TRIAGE-02, TRIAGE-03, TRIAGE-04 | Phase 64 |
| Expanded fix scaffolds | SCAF-01, SCAF-02, SCAF-03, SCAF-04 | Phase 65 |
| A/B winner exit + 3-way stratification | ABWIN-01, ABWIN-02, ABWIN-03, ABWIN-04 | Phase 66 |
| Prompt-iter loop (Shape A — capture-and-surface) | PITER-01, PITER-02, PITER-03, PITER-04, PITER-05 | Phase 67 |
| Synthetic-issue cleanup | CLEAN-01, CLEAN-02, CLEAN-03 | Phase 68 |
| Live UAT (final tally) | UAT-03, UAT-04 | Phase 68 |

**Totals by phase:**

| Phase | Requirements Count |
|-------|--------------------|
| Phase 61 | 9 (DIAG-01, DIAG-02, DIAG-03, TURNS-01, TURNS-02, TURNS-03, BUDG-01, UAT-01, UAT-02) |
| Phase 62 | 7 (LEDX-01, LEDX-02, LEDX-03, LEDX-04, BYPASS-01, BYPASS-02, BYPASS-03) |
| Phase 64 | 4 (TRIAGE-01, TRIAGE-02, TRIAGE-03, TRIAGE-04) |
| Phase 65 | 4 (SCAF-01, SCAF-02, SCAF-03, SCAF-04) |
| Phase 66 | 4 (ABWIN-01, ABWIN-02, ABWIN-03, ABWIN-04) |
| Phase 67 | 5 (PITER-01, PITER-02, PITER-03, PITER-04, PITER-05) |
| Phase 68 | 5 (CLEAN-01, CLEAN-02, CLEAN-03, UAT-03, UAT-04) |
| **Total** | **38 / 38 ✓** |

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 61. Carry-over Bundle — Diagnostic Mutator + Max-Turns + UAT Re-sweep | 0/TBD | Not started | - |
| 62. Forensic Ledger Hardening + Bypass-Audit Probe | 0/2 | Not started | - |
| 64. Heuristic-First Triage Extension | 0/1 | Not started | - |
| 65. Expanded Fix Scaffolds | 0/TBD | Not started | - |
| 66. A/B Winner Exit + 3-way Transport Stratification | 0/TBD | Not started | - |
| 67. Prompt-Iter Loop (Shape A — Capture-and-Surface, In-Process) | 0/TBD | Not started | - |
| 68. Synthetic-Issue Cleanup + Final UAT Tally | 0/TBD | Not started | - |

---
*Roadmap defined: 2026-06-09 — derived from REQUIREMENTS.md (38 v1 requirements) + research/SUMMARY.md (canonical 7-phase 61→62→64→65→66→67→68 sequence) + PITFALLS.md (pitfall-to-phase mapping)*

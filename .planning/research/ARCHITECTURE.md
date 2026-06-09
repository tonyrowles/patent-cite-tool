# Architecture Research

**Domain:** v4.3 Auto-Fix Loop Closure + Capability Expansion — integration architecture for 8 new capabilities wiring into the v4.0/v4.1/v4.2 surface
**Researched:** 2026-06-08
**Confidence:** HIGH (all integration points named from direct code reads; no speculation)

---

## Scope Note: Subsequent-Milestone Architecture Research

This is NOT greenfield architecture. The v4.0/v4.1/v4.2 pipeline is fully wired and live on `origin/main`. v4.3 inserts 8 new change points (4 carry-over + 4 capability expansion) into the existing surface. The existing architecture was already canonically researched in `.planning/research-v4.2-archive/ARCHITECTURE.md` and re-verified at v4.2 milestone close (6/6 cross-phase wiring chains intact per `.planning/milestones/v4.2-MILESTONE-AUDIT.md`). This document covers ONLY the v4.3 integration deltas.

**Trust-invariant boundaries that v4.3 MUST NOT cross:**

| Invariant | Source | Enforcement |
|-----------|--------|-------------|
| `assertTripleGate` body byte-unchanged | Phase 53 | sha256 pin in `tests/unit/auto-fix-promote-gate.test.js` |
| Ledger schema additions ADDITIVE-ONLY | Phase 39 + Phase 56 | 33 pre-existing Vitest tests in `tests/unit/llm-ledger.test.js` (`m.iterations.push(entry)` spread-verbatim contract) |
| `@anthropic-ai/sdk` import restricted to `llm-driver.js` | Phase 47 INT-FIX-LOCK | ESLint `no-restricted-imports` rule |
| Subscription-local invariant on `invokeClaudePWithLedger` | Phase 34 TRIAGE-04 | `process.env.CI === 'true'` CI gate at `llm-driver.js:387-393` |
| INVERSE CI gate on `invokeAnthropicSdkWithLedger` | Phase 39 LEDGER-03 | `!inCi && !forceApi` refusal at `llm-driver.js:546-555` |
| `combinedMonthlyTotalByTransport` unifies caps | Phase 39 LEDGER-02 | Vitest assertion against split-cap drift |
| Direct-to-main ledger commit in `v40-auto-fix.yml` (NOT redirected) | Phase 57 scope-lock | `grep -c 'git push origin main' .github/workflows/v40-auto-fix.yml` == 1 |
| `assertPartialGate` + `runPartialPromote` as SEPARATE entry points | Phase 53 PARTIAL-01 | Vitest T5: `assertTripleGate` rejects `auto-fix:partial-verified` |
| Fixture-mutator does NOT touch FORBIDDEN_PATHS in working tree | Phase 59 MUTATOR-03 | `verifyWorkingTreeClean` + `quarantine-append.mjs:239` anchored regex |

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│  ORIGIN TRIGGERS (existing — v4.3 augments NONE except as noted)        │
│  ┌─────────────────┐  ┌──────────────────┐  ┌──────────────────────┐    │
│  │ e2e-nightly.yml │  │ v40-auto-fix.yml │  │ v40-auto-promote.yml │    │
│  │ (06:00 UTC)     │  │ on:issues:labeled│  │ on:pull_request:closed│   │
│  │                 │  │ workflow_dispatch│  │ workflow_dispatch     │   │
│  └────────┬────────┘  └────────┬─────────┘  └──────────┬───────────┘    │
│           │                   │                        │                │
│  ┌────────────────┐  ┌───────────────────┐  ┌──────────────────────┐    │
│  │v40-verifier-   │  │v40-cost-ledger-   │  │ v4.3 [NEW POSSIBLE]  │    │
│  │gate.yml        │  │snapshot.yml       │  │ v40-prompt-iter.yml? │    │
│  │ on:PR opened/  │  │ (02:00 UTC)       │  │  (see Capability 8) │    │
│  │  synchronize   │  │                   │  │                      │    │
│  └────────────────┘  └───────────────────┘  └──────────────────────┘    │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  SCRIPTS LAYER                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ scripts/auto-fix.mjs (runDispatcher 18-step)                    │    │
│  │   Step 4: extractErrorClass → errorClass in scope               │    │
│  │   Step 7: buildFixPrompt({errorClass, issueBody}) → built.model │    │
│  │   Step 10: transport=sdk    → invokeAnthropicSdkWithLedger      │    │
│  │            transport=sub    → invokeClaudePWithLedger           │    │
│  │   [v4.3 MODIFY] Step 10 must thread errorClass into BOTH        │    │
│  │   transports (Capability #3 forensic ledger hardening)          │    │
│  │   [v4.3 NEW] Step 19 prompt-iter feedback (Capability #8 if     │    │
│  │   shipped as in-process loop)                                    │    │
│  │   safeAppendLedger(entry) at 7 sites — Phase 56 + 60.1 hotfix   │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌──────────────────────────┐  ┌──────────────────────────────────┐     │
│  │ scripts/auto-fix-promote │  │ scripts/a-b-winner.mjs           │     │
│  │ .mjs (PROMOTE outcome    │  │ [v4.3 MODIFY] Capability #5:     │     │
│  │ ledger entry — Phase 58) │  │ Exit abstention when             │     │
│  │ assertTripleGate (BYTE-  │  │ outcomeUnavailable=false AND     │     │
│  │ UNCHANGED) + assert-     │  │ N_PER_ARM_REQUIRED met. Forward- │     │
│  │ PartialGate + run-       │  │ compat probe already ships;      │     │
│  │ PartialPromote           │  │ v4.3 wires real data via outcome │     │
│  └──────────────────────────┘  │ entries + ledger schema (#3).    │     │
│                                └──────────────────────────────────┘     │
│                                                                          │
│  ┌─────────────────────────────────┐  ┌──────────────────────────────┐  │
│  │ tests/e2e/scripts/              │  │ scripts/quarantine-append.   │  │
│  │ inject-defect.mjs               │  │ mjs (SOURCE_TAG regex pin    │  │
│  │ [v4.3 MODIFY] Capability #1:    │  │ at line 239 — co-design w/   │  │
│  │ Diagnostic-injection extension. │  │ Capability #1 sister-edit)   │  │
│  │ [v4.3 NEW co-design]            │  │                              │  │
│  │ scripts/uat-cleanup.mjs         │  │                              │  │
│  │ (Capability #4 — referenced in  │  │                              │  │
│  │ 56-MUTATOR-CLEANUP.md template) │  │                              │  │
│  └─────────────────────────────────┘  └──────────────────────────────┘  │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  LIBRARY LAYER (tests/e2e/lib/)                                         │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ llm-driver.js                                                   │    │
│  │   invokeClaudeP — line 89 args literal: ['--max-turns','1']     │    │
│  │   [v4.3 MODIFY] Capability #2: → ['--max-turns','5',            │    │
│  │     '--allowed-tools','Read,Glob,Grep']                         │    │
│  │   invokeClaudePWithLedger — appendLedgerEntry call site         │    │
│  │     (line 421) — already self-tags transport: 'subscription'    │    │
│  │   invokeAnthropicSdkWithLedger — TWO appendLedgerEntry sites    │    │
│  │     (lines 588 + 620) — self-tag transport: 'sdk', source:      │    │
│  │     'auto-fix-api'. [v4.3 MODIFY] thread errorClass through     │    │
│  │     opts (Capability #3 closes orphan-entry vector)             │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌──────────────────────────┐  ┌──────────────────────────────────┐     │
│  │ llm-ledger.js            │  │ fix-prompt-builder.js            │     │
│  │ [v4.3 MODIFY] Capability │  │ [v4.3 MODIFY] Capability #6:     │     │
│  │ #3: appendLedgerEntry    │  │ PROMPT_SCAFFOLDS registry        │     │
│  │ schema hardening —       │  │ extension (5 → N keys). Each     │     │
│  │ require source +         │  │ new entry = const FOO_CONTRACT + │     │
│  │ transport via additive   │  │ const FOO_SYSTEM = buildScaffold │     │
│  │ validation (preserves 33 │  │ SystemPrompt({...}) + Object.    │     │
│  │ pre-existing Vitest      │  │ freeze() spread.                  │     │
│  │ tests via Phase 56       │  │ buildFixPrompt body BYTE-        │     │
│  │ errorClass template).    │  │ UNCHANGED (registry lookup +     │     │
│  │ Body still spread-       │  │ skip-class short-circuit).       │     │
│  │ verbatim;new validation  │  │                                  │     │
│  │ at TOP only.             │  │                                  │     │
│  └──────────────────────────┘  └──────────────────────────────────┘     │
│                                                                          │
│  ┌──────────────────────────┐  ┌──────────────────────────────────┐     │
│  │ triage-classifier.js     │  │ llm-router.js                    │     │
│  │ [v4.3 MODIFY] Capability │  │ MODEL_ROUTES frozen table.       │     │
│  │ #7: 6/8 → 8/8 heuristic  │  │ [v4.3 — NO CHANGES required for  │     │
│  │ coverage. Extends D-03   │  │ AB winner exit (Capability #5    │     │
│  │ rule chain in runTriage  │  │ reads schema, not routing); but  │     │
│  │ — pushes specific Tier-C │  │ NEW scaffold classes (#6) MAY    │     │
│  │ patterns out of          │  │ require new MODEL_ROUTES entries │     │
│  │ ambiguous[] into         │  │ — additive Object.freeze spread, │     │
│  │ heuristic-resolved.      │  │ ABSTENTION-window invariant      │     │
│  └──────────────────────────┘  │ (frozen at sampling-window edit).│     │
│                                └──────────────────────────────────┘     │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  DATA LAYER                                                             │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ tests/e2e/.llm-spend-ledger.json (committed-but-versioned)      │    │
│  │   [v4.3 SCHEMA] iterations[] entries gain validation contract — │    │
│  │   required: source + transport (Capability #3). errorClass +    │    │
│  │   outcome already populated post-Phase 56/58.                   │    │
│  │ tests/e2e/.rerun-ring-buffer.json (Phase 45)                    │    │
│  │ tests/e2e/.flake-suppression.json (Phase 45)                    │    │
│  │ [v4.3 POSSIBLE NEW] tests/e2e/.prompt-iter-history.json         │    │
│  │   (Capability #8 if iteration history needs persisting)         │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Component Responsibilities — v4.3 Integration Map

### NEW components (v4.3)

| Component | Path | Purpose | Owner Capability |
|-----------|------|---------|------------------|
| Diagnostic-injection helper | `tests/e2e/scripts/inject-defect.mjs` (NEW exports) | Extends synthetic issue body with DOM snippet (GOOGLE_DOM_DRIFT) + Verifier Disagreement block (WRONG_CITATION) | #1 |
| UAT-cleanup script | `scripts/uat-cleanup.mjs` (NEW file) | Closes synthetic issues #20/21/22/23 + auto-fix PRs + revert quarantine entries by SOURCE_TAG; mentioned in `inject-defect.mjs` emitCleanupEvidence template line 420 | #4 |
| New ERROR_CLASS scaffolds | `fix-prompt-builder.js` (NEW `*_CONTRACT` + `*_SYSTEM` consts + registry entries) | Extends PROMPT_SCAFFOLDS registry beyond current 5 keys | #6 |
| Prompt-iter orchestrator | TBD: either `scripts/prompt-iter.mjs` (new file) OR new Step 19 in `runDispatcher` | Closed-loop scaffold-rewrite on failed fix attempts | #8 |
| Possible new workflow | `.github/workflows/v40-prompt-iter.yml` (NEW; OPTIONAL) | Triggers prompt-iter on `auto-fix:apply-check-failed` label or PR-comment marker | #8 (if standalone) |

### MODIFIED components (v4.3)

| Component | Path | What Changes | Owner Capability |
|-----------|------|--------------|------------------|
| inject-defect.mjs | `tests/e2e/scripts/inject-defect.mjs` | Extends `buildBody({fp, caseId, seed, errorClass})` with seeded diagnostic content per errorClass; new `--include-diagnostic` flag OR unconditional | #1 |
| llm-driver.js `invokeClaudeP` | `tests/e2e/lib/llm-driver.js:89-97` | Args literal changes: `'--max-turns','1'` → `'--max-turns','5','--allowed-tools','Read,Glob,Grep'` | #2 |
| llm-driver.js `invokeAnthropicSdkWithLedger` | `tests/e2e/lib/llm-driver.js:506-647` | Add `errorClass?: string` to opts signature; thread into BOTH `appendLedgerEntry` calls (lines 588 + 620). Subscription path already routes via `runDispatcher`'s ledger writes — no change to `invokeClaudePWithLedger` body itself (it doesn't see errorClass; caller in `runDispatcher` Step 7 writes the auxiliary ledger row through `safeAppendLedger`) | #2 + #3 |
| llm-ledger.js `appendLedgerEntry` | `tests/e2e/lib/llm-ledger.js:686-738` | TOP-OF-FUNCTION validation: throw on missing `entry.source` OR `entry.transport`. Function body (read → push → write) BYTE-UNCHANGED. Template = Phase 56 errorClass addition. | #3 |
| auto-fix.mjs `runDispatcher` | `scripts/auto-fix.mjs:563-972` | NO new `safeAppendLedger` sites (all 7 already carry source + transport per Phase 60.1 hotfix + WR-04). For #8 prompt-iter: optional Step 19 that re-invokes `buildFixPrompt` with augmented `issueBody` (or new `rewriteHint` param). For #2: `Step 10` LLM result handling may consume the new multi-turn surface | #3 + #8 |
| auto-fix.mjs `safeAppendLedger` | `scripts/auto-fix.mjs:143-182` | Optional: tighten guard to ALSO require `errorClass` on outgoing entries (defense-in-depth for #3) | #3 |
| auto-fix-promote.mjs outcome entries | `scripts/auto-fix-promote.mjs:521-558` | Already shipped with errorClass + source + transport + outcome. For #3: ensure these entries pass new schema validation (they do — Phase 58 pre-emptively wired errorClass) | #3 (verification only) |
| a-b-winner.mjs | `scripts/a-b-winner.mjs:252-285` (`computePerClassPerArm`) | Remove `PHASE_56_TODO` comments; lift abstention probe when outcome populated. Possibly retain probe but document Phase-56 abstention as historical. Add winner-decision threshold tuning if `TIE_THRESHOLD = 0.05` (D-18 lock) revisited | #5 |
| triage-classifier.js D-03 rule chain | `tests/e2e/lib/triage-classifier.js:428-504` (`runTriage`) | Extend `RULE3_CLASSIFICATIONS` array beyond current 4 (LLM_HALLUCINATED_SELECTION, LLM_API_ERROR, HARNESS_ERROR, PASS); OR add new Rule N for the 2 currently-ambiguous Tier-C classes. New `RULEN_CLASSIFICATIONS` const + `severityMap`/`hypothesisMap` extensions | #7 |
| fix-prompt-builder.js PROMPT_SCAFFOLDS | `tests/e2e/lib/fix-prompt-builder.js:357-363` | Object.freeze() spread gets new keys. Each new key = `() => NEW_CLASS_SYSTEM` thunk + new contract const above | #6 |
| llm-router.js MODEL_ROUTES | `tests/e2e/lib/llm-router.js:60-63` | Possibly add new ERROR_CLASS → model entries for new scaffolds in #6 (default sonnet via `??` fallthrough already handles silently — explicit entry only required if new class needs opus) | #6 (if new class warrants opus) |
| quarantine-append.mjs SOURCE_TAG regex | `scripts/quarantine-append.mjs:239` | Currently anchored `/^fixture-mutator-uat-47b-iter-\d+$/`. If Capability #1 extends source-tag naming (e.g., for new error-class variants of synthetic issues), regex must be co-designed in same commit | #1 (if SOURCE_TAG widens) |

---

## Integration Points — Named Exports + Workflow Inputs/Outputs

### Cross-file named exports v4.3 wiring relies on

| Export | File | Consumed by | v4.3 Wiring Note |
|--------|------|-------------|------------------|
| `appendLedgerEntry` | `tests/e2e/lib/llm-ledger.js` | `auto-fix.mjs` (via `safeAppendLedger` wrapper, 7 sites), `auto-fix-promote.mjs` (2 sites), `llm-driver.js` invokeClaudePWithLedger (1 site), invokeAnthropicSdkWithLedger (2 sites) | Schema validation lands HERE (Capability #3). Phase 56 template: errorClass added inline. v4.3 mirrors with source + transport requirements. |
| `LEDGER_PATH` | `tests/e2e/lib/llm-ledger.js:74-98` | Same 5 callers as above | No change. IIFE resolves at module load time; v4.3 schema validation does not interact. |
| `buildFixPrompt` | `tests/e2e/lib/fix-prompt-builder.js:406-434` | `scripts/auto-fix.mjs:708` (Step 7) | Body BYTE-UNCHANGED for #6. Registry lookup at line 413 picks up new keys automatically. |
| `PROMPT_SCAFFOLDS` | `tests/e2e/lib/fix-prompt-builder.js:357-363` | `buildFixPrompt` only (internal) | Capability #6 extends this Object.freeze spread. |
| `routeModel` | `tests/e2e/lib/llm-router.js:83-85` | `fix-prompt-builder.js:65, 433` (`built.model = routeModel(errorClass)`) | Capability #6 may extend `MODEL_ROUTES` table; if new class defaults to sonnet, no extension needed. |
| `MODEL_ROUTES` | `tests/e2e/lib/llm-router.js:60-63` | `routeModel` only (internal) | Frozen — additive extension via Object.freeze respread. |
| `invokeClaudePWithLedger` | `tests/e2e/lib/llm-driver.js:378-450` | `triage-classifier.js` (`runTriage` via `invokeLlm` DI), `auto-fix.mjs:780-785` (Step 10 subscription branch) | Capability #2 changes `invokeClaudeP` (the spawn). Both consumers transparently inherit new args. |
| `invokeAnthropicSdkWithLedger` | `tests/e2e/lib/llm-driver.js:506-647` | `auto-fix.mjs:787-794` (Step 10 SDK branch) | Capability #2 unchanged here (no `--max-turns` arg — SDK uses `max_tokens` instead). Capability #3 threads `errorClass` into opts. |
| `runTriage` | `tests/e2e/lib/triage-classifier.js:400-587` | `scripts/run-triage-pipeline.mjs` (nightly cron entrypoint) | Capability #7 extends D-03 rule chain inside runTriage — call-site unchanged. |
| `classifyRerunOutcomes` | `tests/e2e/lib/triage-classifier.js:644-716` | `auto-fix.mjs:418-424` (dispatchFlakeState) | Not v4.3 scope (FLAKE 5-state shipped Phase 45-02). |
| `assertTripleGate` | `scripts/auto-fix-promote.mjs:98-112` | `auto-fix-promote.mjs:474` (main verified path) + Vitest sha256 pin | **MUST stay byte-unchanged in v4.3.** |
| `assertPartialGate` + `runPartialPromote` | `scripts/auto-fix-promote.mjs:145-246` | `auto-fix-promote.mjs:571, 599` (main partial path) | Not v4.3 scope (Phase 53 shipped). |
| `filterAttributableEntries` + `computePerClassPerArm` + `formatMarkdownTable` | `scripts/a-b-winner.mjs:199, 252, 332` | `main` flow + Vitest tests | Capability #5 modifies abstention probe behavior in `computePerClassPerArm`. |
| `extractErrorClass` | `scripts/auto-fix.mjs:264-271` | `runDispatcher:630` | Recognizes `RECOGNIZED_LABELS = new Set([...ERROR_CLASSES, 'PASS'])`. Capability #6 new scaffolds: `ERROR_CLASSES` set in `tests/e2e/lib/error-codes.js` must include new ERROR_CLASS string, AND the workflow precheck enumeration at `.github/workflows/v40-auto-fix.yml:91` must list it. |
| `checkDiffGuard` | `scripts/check-diff-guard.mjs` | `auto-fix.mjs:845` (Step 12) | No v4.3 change. FORBIDDEN_PATHS bank stays at 6 LOCKED paths. |
| `fingerprint` | `scripts/e2e-report-issue.mjs` (re-exported from issue-payload-builder) | `inject-defect.mjs:55` import + `quarantine-append.mjs:346-350` | Capability #1 diagnostic-injection must NOT change fingerprint shape (deterministic same-seed → same-fp invariant in MUTATOR-04). |
| `SOURCE_TAG` constant | `tests/e2e/scripts/inject-defect.mjs:75` (`'fixture-mutator-uat-47b'`) | `quarantine-append.mjs:239` regex anchor (string-equality via /^fixture-mutator-uat-47b-iter-\d+$/) | **Co-design pair (MUTATOR-04 invariant).** If v4.3 widens to include diagnostic-variants of synthetic issues, SOURCE_TAG + the anchored regex must update in ONE atomic commit. |

### Workflow inputs/outputs v4.3 may augment

| Workflow | Existing input | v4.3 new input candidate | Wires to |
|----------|----------------|-------------------------|----------|
| `v40-auto-fix.yml` | `on:issues:labeled` (job-filter `label.name == 'triage'`) | None expected (the trigger surface is correct) | — |
| `v40-auto-fix.yml` precheck step | `error_class` GH output (line 97) from FOUND classes list | MUST extend `for cls in FLAKE ... PASS;` list at line 91 if Capability #6 adds new ERROR_CLASS values | New ERROR_CLASS must be enumerated here OR the issue silently skips. |
| `v40-auto-promote.yml` | `workflow_dispatch.inputs.PHASE_TAG` (Phase 59 SWEEP-05) | Possibly new `inputs.iter_round` for prompt-iter re-runs (Capability #8) | If #8 is workflow-driven |
| `v40-auto-promote.yml` `Pre-resolve upstream-ledger model` step (line 289-305) | Uses jq to filter ledger by fingerprint + `source == "auto-fix-api"` | NEW: may match additional new `source` strings if prompt-iter writes auxiliary entries (#8) | Requires new ledger source-tag literal AND jq filter update co-design |
| `v40-verifier-gate.yml` `ready-flip → partial-verified` job | Conditional label `auto-fix:partial-verified` | None v4.3 expected | — |

### Label conventions v4.3 wiring relies on

| Label | Producer | Consumer | v4.3 Wiring |
|-------|----------|----------|-------------|
| `triage` | `e2e-nightly.yml` → `e2e-report-issue.mjs` + `inject-defect.mjs:311` | `v40-auto-fix.yml` job-filter (line 62) | Unchanged. |
| `WRONG_CITATION`, `LLM_HALLUCINATED_SELECTION`, `WORKER_FALLBACK_FAILED`, `GOOGLE_DOM_DRIFT`, `HARNESS_ERROR`, `FLAKE`, `LLM_API_ERROR`, `PASS` | issue-payload-builder + inject-defect + manual | `v40-auto-fix.yml` precheck (line 91) + `auto-fix.mjs:225` RECOGNIZED_LABELS | **Capability #6:** new ERROR_CLASS labels MUST be added to (a) `tests/e2e/lib/error-codes.js` ERROR_CLASSES set; (b) precheck enumeration at workflow line 91; (c) `inject-defect.mjs:64-70` ERROR_CLASSES set if mutator should support them. |
| `auto-fix:verified` | `v40-verifier-gate.yml:573-583` | `v40-auto-promote.yml:113` + `auto-fix-promote.mjs:464` | Unchanged. |
| `auto-fix:partial-verified` | `v40-verifier-gate.yml:585-660` | `v40-auto-promote.yml:114` + `auto-fix-promote.mjs:465` | Unchanged. |
| `auto-fix:opened` | `v40-auto-fix.yml:216` | informational (UI badge) | Unchanged. |
| `human-review-required` | `auto-fix.mjs:651-657` (fix_attempts cap) + `v40-verifier-gate.yml:198` (diff-guard fail) | Manual review queue | **Capability #8:** prompt-iter loop should respect this label as terminal — DO NOT iterate on human-flagged issues. |
| `flake-investigation` | `auto-fix.mjs:455-457` (FLAKE_ESCALATION branch) | `auto-fix.mjs:621-627` Step 4a guard refuses to dispatch | Unchanged. |
| `quarantine:ready-for-promotion` | `quarantine-append.mjs:241` (stable_runs ≥ 3 AND `!isFixtureMutator`) | Manual `promote-from-quarantine.mjs` | **Capability #1:** if new SOURCE_TAG variants ship for diagnostic-augmented mutator, the `!isFixtureMutator` check at line 241 + regex at line 239 must co-design. |
| `auto-promote` | `v40-auto-promote.yml:422` cpr@v8 | UI badge | Unchanged. |
| `post-merge-regression`, `e2e-nightly` | `v40-auto-promote.yml:474-476` (postmerge verifier failure) | Manual triage | Unchanged. |
| NEW v4.3 label candidates | — | — | `apply-check-failed` (prompt-iter trigger? — see #8); `prompt-iter:round-N` (audit trail); none load-bearing yet |

### Ledger schema fields v4.3 wiring relies on

Field by field, with current populators and v4.3 changes:

| Field | Currently written by | Currently consumed by | v4.3 Change |
|-------|---------------------|----------------------|-------------|
| `iso` | All 12 sites (REQUIRED) | All readers | None |
| `model` | All 12 sites | `a-b-winner.mjs:178-189` `isAttributable` (startsWith match); `v40-auto-promote.yml:300` jq filter | None |
| `cost_usd` | All 12 sites | `monthlyTotal`, `dayTotal`, `phaseTotal`, `issueTotal`, `prTotal`, `combinedMonthlyTotalByTransport` | None |
| `tokens_in`, `tokens_out` | All 12 sites | Forensic only | None |
| `phase` | All 12 sites (default `'42-auto-fix'`, `'58-promote'`, etc.) | `phaseTotal`, `checkPhaseSpendCap` | None |
| `transport` | 7 auto-fix.mjs sites self-tag from runtime `transport` var (Phase 47 WARNING-01 fix); llm-driver.js sites self-tag literal `'subscription'` / `'sdk'`; auto-fix-promote.mjs sites self-tag `'subscription'` | `combinedMonthlyTotalByTransport` partition | **Capability #3: validate as REQUIRED at appendLedgerEntry top.** Already populated everywhere; validation is enforcement. |
| `source` | 7 auto-fix.mjs sites (`'auto-fix-api'`, `'flake-suppressed'`, `'flake-dispatched'`); llm-driver.js subscription (`'triage'`, `'fix-issue-cli'` from caller), SDK (`'auto-fix-api'`); auto-fix-promote.mjs (`'auto-fix-promoted'`, `'auto-fix-failed'`) | `a-b-winner.mjs:`; `v40-auto-promote.yml:300` (`source == "auto-fix-api"` jq filter) | **Capability #3: validate as REQUIRED at appendLedgerEntry top.** Forensic-leak source (3 orphan claude-opus-4-7[1m] entries) had no source. |
| `errorClass` | 7 auto-fix.mjs sites (Phase 56); auto-fix-promote.mjs (Phase 58) | `a-b-winner.mjs:185-187` `isAttributable` requires non-empty string | **Capability #3: NOT REQUIRED in v4.3 schema (back-compat — auxiliary entries like ledger-snapshot daily commits don't have errorClass).** OR if escalated, optional with documented-null exception list. |
| `outcome` | auto-fix-promote.mjs ONLY (`'pass'` / `'fail'`) | `a-b-winner.mjs:231-238` `detectOutcome` | None. Already shipped. |
| `fingerprint` | 7 auto-fix.mjs sites + auto-fix-promote.mjs | `v40-auto-promote.yml:300` jq filter on `.fingerprint == $fp` | None |
| `issueId`, `prNumber` | issue/PR-scoped sites | sub-cap helpers | None |
| `error`, `errorReason`, `errorMessage`, `reason` | malformed-diff, diff-guard, apply-check, sdk_error, FLAKE-state sites | Forensic only | Possibly extend for prompt-iter audit (#8) |

---

## Data Flow — v4.3 New Flows

### Flow 1: Diagnostic-injection auto-fix (Capability #1 → enables UAT-47-a/b)

```
operator: node tests/e2e/scripts/inject-defect.mjs \
            --seed mutator-seed-N --error-class WRONG_CITATION \
            [--include-diagnostic]   ← v4.3 new flag (or unconditional)
    ↓
inject-defect.mjs:
  computeFingerprint({seed, errorClass})           ← UNCHANGED (deterministic)
  collisionCheckOrAbort({fp})                      ← UNCHANGED
  verifyWorkingTreeClean({phaseDir})               ← UNCHANGED
  buildBody({fp, caseId, seed, errorClass})        ← v4.3 EXTEND
    NEW: errorClass switch:
      WRONG_CITATION    → embed Verifier Disagreement block
                          (mirrors Phase 35 issue-payload-builder shape;
                           seeded golden + observed pair)
      GOOGLE_DOM_DRIFT  → embed DOM snippet
                          (mirrors tests/e2e/lib/google-patents-page.js
                           selector patterns; seeded outdated selector)
      LLM_HALLUCINATED_SELECTION, WORKER_FALLBACK_FAILED, HARNESS_ERROR
                        → existing minimal body (or seeded synthetic)
  createIssue({caseId, errorClass, body})          ← UNCHANGED
  emitCleanupEvidence({...})                       ← UNCHANGED
    ↓
GitHub issue #N created with: triage + WRONG_CITATION labels + <!-- fp: ... --> + diagnostic block
    ↓
v40-auto-fix.yml fires (on:issues:labeled triage)
    ↓
auto-fix.mjs runDispatcher with --force-api --no-push
    ↓ (now diagnostic data is present)
buildFixPrompt({errorClass:'WRONG_CITATION', issueBody}) — scaffold sees Verifier Disagreement
    ↓
invokeAnthropicSdkWithLedger with --max-turns 5 (Capability #2) + Read,Glob,Grep
    ↓ (Claude reads src/ to understand real diagnostic; produces fix)
parseFencedDiff + checkDiffGuard + git apply --check → green
    ↓
peter-evans/cpr@v8 → draft PR (auto-fix/N-fp8 branch)
    ↓
v40-verifier-gate.yml → auto-fix:verified label
    ↓
human merge
    ↓
v40-auto-promote.yml → assertTripleGate → runPromote(_skipCiGuard:true)
    → appendLedgerEntry {source:'auto-fix-promoted', outcome:'pass', errorClass, model, ...}
    ↓
operator: gh workflow run v40-auto-promote.yml -f pr_number=N -f PHASE_TAG=56-uat
    → live ledger entry on main with phase:'56-uat'
    ↓
UAT-47-a/b PROVEN
```

### Flow 2: Forensic-ledger schema hardening (Capability #3 enforcement)

```
caller (auto-fix.mjs / auto-fix-promote.mjs / llm-driver.js):
  safeAppendLedger(entry) OR appendLedgerEntry(LEDGER_PATH, entry)
    ↓
llm-ledger.js appendLedgerEntry(ledgerPath, entry):
  [v4.3 NEW VALIDATION at TOP — runs BEFORE readLedger]
  if (!entry || typeof entry !== 'object') throw new Error('entry must be object');
  if (typeof entry.source !== 'string' || entry.source.length === 0)
    throw new Error('schema violation: entry.source required (forensic-ledger hardening)');
  if (typeof entry.transport !== 'string' ||
      !['sdk','subscription'].includes(entry.transport))
    throw new Error('schema violation: entry.transport must be sdk|subscription');
  [BODY UNCHANGED — read → push → atomic write]
  m.iterations.push(entry);   ← still spread-verbatim
  fs.writeFileSync(...);
```

**Why this preserves 33 pre-existing tests:** Phase 56 added `errorClass` field the same way — by THREADING from callers (auto-fix.mjs Step 4 errorClass var; llm-driver.js opts). All 33 existing Vitest llm-ledger tests in `tests/unit/llm-ledger.test.js` pass `entry` objects that contain `iso`, `model`, `cost_usd`, plus optional fields. v4.3 schema hardening:

1. Either tests already pass `source` + `transport` (Phase 47 WARNING-01 threaded transport into all 7 sites; Phase 56 confirmed source on auto-fix sites). Audit Vitest fixtures to confirm: `grep -l "appendLedgerEntry" tests/unit/llm-ledger.test.js | xargs grep "transport\|source"`.
2. If any test fixture omits these, the fix is to add them to the fixture (1-line edit per test), NOT to weaken the schema.
3. Phase 56 errorClass shipped this way: `tests/unit/auto-fix.test.js` LEDGER-04 describe block asserts on the FIELD being PRESENT; older tests didn't assert on its ABSENCE so they continued passing.

**Same template applies to v4.3:** new validation rejects entries missing required fields, but no existing test asserts on absent source/transport (they assert on cost_usd accumulation, monthlyTotal output, etc.).

### Flow 3: A/B winner exit (Capability #5 — purely data-driven)

```
Pre-condition: ledger has ≥20 entries per (errorClass, arm) cell with outcome field
    ↓
operator: node scripts/a-b-winner.mjs
    ↓
parseArgs → ledger path
readLedgerEntries → flat array
filterAttributableEntries (D-19) → drop entries lacking model or errorClass
  (post-Phase 58: auto-fix-promote.mjs entries carry both)
  (post-Phase 56: auto-fix.mjs SDK-path entries carry both)
computePerClassPerArm (D-20 outcome probe):
  filtered.some(e => detectOutcome(e) !== null)?
    YES → group by errorClass × arm, accumulate n + pass
    NO  → outcomeUnavailable=true → NO_WINNER_YET (CURRENT v4.2 behavior)
anyClassInsufficient(perClass) → any cell.n < 20?
  YES → NO_WINNER_YET
  NO  → formatMarkdownTable(perClass) → emit table to stdout
```

**v4.3 code changes:** Possibly none beyond removing `PHASE_56_TODO` comments. The forward-compat probe at `a-b-winner.mjs:259-265` ALREADY exits abstention when outcome entries populate. v4.3 ONLY needs the ledger to accumulate ≥20 outcome entries per (class, arm). The carry-over wave (Capability #1 + #2 + #3) enables that accumulation by unblocking UAT-47-a end-to-end.

**v4.3 NEW behavior IF threshold tuning needed:** If `TIE_THRESHOLD = 0.05` proves too tight or `N_PER_ARM_REQUIRED = 20` too high, single-line constant edits at `scripts/a-b-winner.mjs:86, 92`. Test pins must update in same commit.

### Flow 4: Prompt-iter loop (Capability #8 — TWO design options)

**Option A: In-process iteration inside `runDispatcher`** (preferred for minimal architectural change)

```
auto-fix.mjs Step 10 (LLM dispatch):
  iterRound = 0
  iterMaxRounds = 2  ← NEW constant, e.g., 3 total attempts
  rewriteHint = null
  
  while (iterRound < iterMaxRounds):
    built = buildFixPrompt({errorClass, issueBody, rewriteHint})  ← v4.3 EXTEND
    sdkResult = await invokeAnthropicSdkWithLedger({...})
    parsed = parseFencedDiff(sdkResult.llmText)
    if (parsed.ok && checkDiffGuard(changedPathsFromDiff(parsed.diff)).ok):
      try { git apply --check → green; break }
      catch: rewriteHint = buildRewriteHint('apply-check-failed', stderr)
    else:
      rewriteHint = buildRewriteHint('malformed-diff', parsed.reason)
    iterRound++
    safeAppendLedger({...source:'auto-fix-api', iter_round: iterRound, ...})
  
  if iterRound === iterMaxRounds: existing exit-1 path
```

**buildRewriteHint** is a new pure helper inside `fix-prompt-builder.js` (extends scaffold contracts with a NEW `## Previous attempt failed` section). Body of `buildFixPrompt` gets the new param threaded through `buildScaffoldSystemPrompt`. Object.freeze respected.

**Integration constraints:**
- ESLint SDK guard NOT violated (`invokeAnthropicSdkWithLedger` still the only call site)
- Ledger additive-only: NEW field `iter_round?: number` spread through entry verbatim (no schema change beyond #3's source+transport which the SDK path already satisfies)
- Per-issue cap (Phase 39 ISSUE_HARD_CAP_USD = $1) protects against runaway: 3 SDK rounds × ~$0.30 each = $0.90, under cap
- Per-PR cap ($2) similarly

**Option B: Standalone workflow `v40-prompt-iter.yml` triggered on `auto-fix:apply-check-failed` label** (heavier, defer to v4.4 if too big)

```
v40-auto-fix.yml exit 1 (apply-check-failed) → adds new label auto-fix:apply-check-failed
    ↓
v40-prompt-iter.yml fires (on:pull_request:labeled apply-check-failed)
  OR (on:issues:labeled apply-check-failed)
    ↓
new orchestrator script reads original issue + auto-fix attempt PR diff stderr
  → invokes runDispatcher with --rewrite-from-failure flag
```

**Verdict: Option A.** Option B duplicates the dispatcher's gh+git+SDK chain, multiplies maintenance burden. In-process iteration uses existing surface; the only architectural addition is the rewriteHint parameter threaded through `buildFixPrompt` → `buildScaffoldSystemPrompt`.

---

## Capability-by-Capability Integration Specification

### Capability #1: Diagnostic-injection mutator

**Files touched:**
- MODIFY `tests/e2e/scripts/inject-defect.mjs` — extend `buildBody` (or add `buildDiagnosticBody` helper); add `--include-diagnostic` flag to `parseArgs` (OR make unconditional and embed diagnostics whenever `errorClass ∈ {GOOGLE_DOM_DRIFT, WRONG_CITATION}`)
- POSSIBLY MODIFY `scripts/quarantine-append.mjs:239` regex — ONLY if SOURCE_TAG widens (e.g., to `fixture-mutator-uat-47b-diag-iter-N`). Co-design required.
- NEW Vitest pins in `tests/unit/inject-defect.test.js` — deterministic same-seed-same-errorClass-same-flag → same-body byte-equality

**Integration points:**
- Diagnostic-block format MUST match what `fix-prompt-builder.js` scaffolds expect at lines 252-268 (GOOGLE_DOM_DRIFT_CONTRACT references "The issue body should include a snippet of the new DOM")
- For WRONG_CITATION_CONTRACT (lines 189-209): "the citation the extension produced differs from the golden baseline, AND an independent verifier agrees the observed cite is wrong" — needs Verifier Disagreement block similar to Phase 35 `issue-payload-builder.js` output

**Build order:** Phase 61 candidate (carry-over wave). Independent of #2 in code but jointly required for UAT-47-a/b end-to-end PASS.

**Risks:** None novel — extends existing pure-string-builder with a switch.

### Capability #2: `--max-turns` relaxation + `--allowed-tools`

**Files touched:**
- MODIFY `tests/e2e/lib/llm-driver.js:91-97` — args literal: `'--max-turns','1'` → `'--max-turns','5','--allowed-tools','Read,Glob,Grep'`
- MODIFY Vitest pin in `tests/unit/llm-driver.test.js` — the spawnSync arg-array assertion pinning `--max-turns 1` (Phase 31 Pitfall 1+2 regression pin)
- UPDATE Pitfall 1+2 inline comment (lines 28-35) — note the cost-discipline gate has shifted from `--max-turns 1` to `--allowed-tools=Read,Glob,Grep` (no Edit/Bash)

**Integration points:**
- Affects BOTH transports:
  - Subscription: `invokeClaudeP` (line 89) spawn args — DIRECTLY changed
  - SDK: `invokeAnthropicSdkWithLedger` uses `max_tokens=4096` default, NOT `--max-turns` (different surface — SDK is single-turn by API design). However, the `auto-fix.mjs` Step 10 SDK path runs in CI where Claude already has tool access via SDK; the relaxation applies primarily to the subscription path.
- Capability #8 prompt-iter loop interacts: if multi-turn enabled, fewer iter-rounds may be needed (Claude can self-correct within one max-turns 5 invocation by reading source). Sequencing: ship #2 FIRST, evaluate iter-round need, then size #8.

**Build order:** Phase 61 candidate (carry-over wave; required for UAT-47-a/b WRONG_CITATION case).

**Risks:**
- Subscription cost may rise (Pitfall 1+2 cost-discipline tradeoff). Per-issue cap $1 + per-PR cap $2 + monthly $100 are the safety net.
- `--allowed-tools Read,Glob,Grep` (NO Edit/Bash) is the key constraint preserving the trust boundary — Claude can read source but cannot mutate. The diff still goes through `parseFencedDiff` → `checkDiffGuard` → `git apply --check`.

### Capability #3: Forensic-ledger schema hardening

**Files touched:**
- MODIFY `tests/e2e/lib/llm-ledger.js:686-705` — add validation at top of `appendLedgerEntry` (FIRST ~20 lines before `readLedger` call)
- POSSIBLY MODIFY `tests/unit/llm-ledger.test.js` — if any pre-existing Vitest fixture omits source or transport, add those fields to the fixture (additive — no semantic test change)
- NEW Vitest tests in `tests/unit/llm-ledger.test.js` — assert `appendLedgerEntry({iso, model, cost_usd})` (no source/transport) throws

**Integration points:**
- All 12 `appendLedgerEntry` call sites already populate source + transport (verified by Phase 60.1 hotfix + Phase 56 + Phase 47 WARNING-01 + Phase 58 wiring). The validation is enforcement of existing behavior, not new behavior.
- The 3 orphan `claude-opus-4-7[1m]` entries from 2026-06-08 came from an UNKNOWN path that bypasses the safeAppendLedger guard. Most likely candidate: `scripts/auto-fix.mjs` running with `--transport sdk --force-api` outside CI (PRE-02 guard catches `forceApi:true` outside CI without override — but if a previous version of the code didn't have that guard, or if `--force-api` was set with `E2E_LEDGER_PATH_OVERRIDE` unset but `CI=false` and the SDK path was reached…). Tightening validation at appendLedgerEntry's top closes this regardless of WHICH call site is leaking.
- Phase 56 added `errorClass` additively as the TEMPLATE for this v4.3 work: it threaded errorClass through callers without changing appendLedgerEntry's body. v4.3 inverts the discipline: it adds a VALIDATION at the top of appendLedgerEntry that REJECTS entries without source+transport. The body (read → push → write) stays byte-unchanged.

**Build order:** Phase 61 candidate (carry-over wave). Independent of #1 and #2 in code but jointly required for the carry-over wave to ship clean.

**Risks:**
- If any latent caller exists that the v4.0/v4.1/v4.2 work missed, this validation will surface it as a test failure or runtime exception. **This is desired behavior** — the orphan entries are EVIDENCE that a latent caller exists.
- Mitigation: run full Vitest suite (1252 tests as of v4.2 close) BEFORE shipping; any failure points at the latent caller.

### Capability #4: Synthetic-issue cleanup

**Files touched:**
- NEW `scripts/uat-cleanup.mjs` — Node 22 ESM CLI; reads `tests/e2e/test-cases-quarantine.js` for entries with matching SOURCE_TAG; closes synthetic GH issues + their auto-fix PRs + reverts quarantine entries; uses `gh` CLI exclusively
- MODIFY `tests/e2e/test-cases-quarantine.js` — runtime mutation by the new cleanup script (NOT a v4.3 source edit — runtime behavior)
- Possible MODIFY `tests/e2e/scripts/inject-defect.mjs:emitCleanupEvidence` — refresh the auto-generated cleanup runbook template to actually call `uat-cleanup.mjs` end-to-end (currently the template at line 420 references the script but the script doesn't exist yet)

**Integration points:**
- SOURCE_TAG match: `uat-cleanup.mjs --source-tag fixture-mutator-uat-47b` greps quarantine corpus for `source_triage_finding_id` matching `/^fixture-mutator-uat-47b-iter-\d+$/` (same anchored regex as `quarantine-append.mjs:239`)
- Idempotency: closing already-closed issues / deleting already-deleted branches must be no-ops (gh CLI naturally errors on those — handle non-fatally)
- Issues to close in v4.3 SWEEP-06 retrofit: #20, #21, #22, #23 (per STATE.md Deferred Items)

**Build order:** Phase 61 candidate (carry-over wave). Can ship BEFORE or AFTER #1+#2+#3 since it operates on existing synthetic state.

**Risks:**
- Operator error: running with wrong SOURCE_TAG could close legitimate triage issues. Mitigation: `--dry-run` default; require explicit `--confirm` flag.
- Race: simultaneous mutator run + cleanup run could create new issues that match the SOURCE_TAG mid-cleanup. Mitigation: timestamp-bounded filter (`--before <iso>`).

### Capability #5: A/B winner exit from abstention

**Files touched:**
- MODIFY `scripts/a-b-winner.mjs:69-72` — remove `PHASE_56_TODO` comments
- MODIFY `scripts/a-b-winner.mjs:252-265` — possibly remove `outcomeUnavailable` early-return (or document it as historical and let normal flow reach NO_WINNER_YET via `anyClassInsufficient`)
- MODIFY Vitest tests in `tests/unit/a-b-winner.test.js` — flip the abstention assertion to a real-data winner assertion (synthetic ledger fixture with ≥20 entries per cell carrying outcome)
- NO source changes to `llm-router.js` MODEL_ROUTES (Object.frozen during sampling — invariant per AB-04 docs)

**Integration points:**
- Reads ledger schema fields: `model`, `errorClass`, `outcome` (or `success`/`passed`/`pr_merged`)
- Depends on #3 schema hardening being in place so the ledger entries the script reads are validated
- Depends on Capability #1+#2 enabling the data accumulation (live UAT-47-a runs writing outcome entries)

**Build order:** Phase 64+ candidate (capability-expansion wave). Cannot meaningfully ship until ledger has ≥20 entries per cell × 5+ error classes = ≥200 entries with outcome (current ledger has ~0 outcome entries on origin/main). Data-gathering must precede the code edit. Realistic v4.3 deliverable: ship the code edit + Vitest pin for the new behavior; data accumulation continues in v4.4+.

**Risks:**
- Premature winner declaration if N_PER_ARM_REQUIRED too low. Mitigation: hold the lock at 20 until data justifies tuning.
- MODEL_ROUTES frozen invariant: ANY routing change MUST happen OUTSIDE the sampling window (between a-b-winner runs). Documented in `llm-router.js:30-37`.

### Capability #6: Expanded fix scaffolds

**Files touched:**
- MODIFY `tests/e2e/lib/fix-prompt-builder.js` — add new `*_CONTRACT` const, new `*_SYSTEM = buildScaffoldSystemPrompt({...})` const, new entry in `PROMPT_SCAFFOLDS` Object.freeze respread
- POSSIBLY MODIFY `tests/e2e/lib/llm-router.js:60-63` — add new ERROR_CLASS → model entry in MODEL_ROUTES if the new class needs opus (default sonnet works via `??` fallthrough)
- MODIFY `tests/e2e/lib/error-codes.js` ERROR_CLASSES set — add new ERROR_CLASS string
- MODIFY `.github/workflows/v40-auto-fix.yml:91` precheck enumeration — add new ERROR_CLASS to the bash `for cls in ...` list
- POSSIBLY MODIFY `tests/e2e/scripts/inject-defect.mjs:64-70` ERROR_CLASSES set — if mutator should support synthetic injection for the new class
- POSSIBLY MODIFY `tests/e2e/lib/triage-classifier.js` — if new classification needs heuristic-resolution (overlap with #7)
- NEW Vitest pins in `tests/unit/fix-prompt-builder.test.js` — the existing test has assertions for "5 keys"; bump count + add fix-surface contract substring assertions for each new class

**Integration points:**
- New ERROR_CLASS must satisfy the RPT-02 enum naming convention (`/^[A-Z_][A-Z0-9_]*$/`) — validated by `auto-fix-promote.mjs:386` regex
- New scaffold's fix-surface contract MUST be specific enough that Claude doesn't produce out-of-scope diffs (the contracts at lines 189-296 of fix-prompt-builder.js are the template — each names EDITABLE SURFACE, APPROPRIATE FIX, DO NOT)
- FORBIDDEN paths text inside `buildScaffoldSystemPrompt` is class-agnostic — new scaffolds inherit it automatically via the shared helper

**Build order:** Phase 64+ candidate (capability-expansion wave). Independent of #5 in code. Possibly bundled with #7 (heuristic-first triage) — both extend the ERROR_CLASS taxonomy and benefit from co-design.

**Risks:**
- Without diagnostic data (Capability #1), new scaffolds suffer the same architectural failure mode as the current 5: Claude refuses to fabricate. Co-design new scaffolds WITH their diagnostic-injection paths in #1.

### Capability #7: Better heuristic-first triage coverage (6/8 → 8/8)

**Files touched:**
- MODIFY `tests/e2e/lib/triage-classifier.js:475-499` (`runTriage` D-03 Rule 3) — extend `RULE3_CLASSIFICATIONS` array OR add new Rule 4 N + new `RULEN_CLASSIFICATIONS` const
- MODIFY `tests/unit/triage-classifier.test.js` — assert new heuristic-resolved findings for the 2 newly-covered classes
- POSSIBLY MODIFY `tests/e2e/lib/error-codes.js` — if new heuristic classes correspond to NEW errorClass values (overlap with #6)

**Integration points:**
- Current heuristic-resolved (6 of 8 RPT-02 classes): FLAKE, CONFIRMED+strong (WRONG_CITATION, VERIFIER_DISAGREE), LLM_HALLUCINATED_SELECTION, LLM_API_ERROR, HARNESS_ERROR, PASS
- Currently ambiguous (2 of 8): the 2 remaining must be identified from the actual RPT-02 enum. From `error-codes.js` ERROR_CLASSES set (not read directly, but inferred from `auto-fix.mjs:225` RECOGNIZED_LABELS and `inject-defect.mjs:64-70`): WORKER_FALLBACK_FAILED and GOOGLE_DOM_DRIFT are the most likely remaining ambiguous classes — both have specific failure-mode signatures the heuristic could detect (WORKER_FALLBACK_FAILED → check verifier_verdict.error contains "USPTO" or "Worker"; GOOGLE_DOM_DRIFT → check error_reason includes "selector not found").
- Reduces cost (fewer LLM second-pass calls in `runTriage`), but doesn't directly affect auto-fix loop semantics — these are TRIAGE classifications, separate from auto-fix.mjs's per-issue ERROR_CLASS label.

**Build order:** Phase 64+ candidate (capability-expansion wave). Independent of others. Pure refactor of runTriage's rule chain.

**Risks:**
- Tier C masking (Pitfall 2 in 34-RESEARCH): the `VERIFIER_STRONG_AGREEMENT` Tier-A/B-only guard at triage-classifier.js:43-44 must NOT be loosened to admit Tier C heuristic resolution. New heuristics must use ORTHOGONAL signals (errorReason text, verifier_verdict shape) — not tier.

### Capability #8: Prompt-iter loop

**Files touched:**

Option A (in-process — recommended):
- MODIFY `tests/e2e/lib/fix-prompt-builder.js` — extend `buildScaffoldSystemPrompt({className, fixSurfaceContract, previousAttempt?})` with optional `previousAttempt` section
- MODIFY `tests/e2e/lib/fix-prompt-builder.js` — extend `buildFixPrompt({errorClass, issueBody, rewriteHint?})` to thread rewriteHint through
- MODIFY `scripts/auto-fix.mjs:707-746` (Step 7 + Step 10) — wrap LLM dispatch in iteration loop; add new `ITER_MAX_ROUNDS = 2` const (or similar); on apply-check-failed or malformed-diff, build rewriteHint and re-invoke
- NEW Vitest pins in `tests/unit/fix-prompt-builder.test.js` + `tests/unit/auto-fix.test.js`
- NEW const `ITER_ROUND_LEDGER_FIELD = 'iter_round'` — added to ledger entries during iter rounds for audit
- POSSIBLY NEW workflow input on `v40-auto-fix.yml` to set `ITER_MAX_ROUNDS` (likely not needed; module-constant is sufficient)

Option B (standalone workflow — deferable):
- NEW `.github/workflows/v40-prompt-iter.yml`
- NEW `scripts/prompt-iter.mjs`
- All of Option A's lib-layer changes, PLUS workflow + orchestrator
- New `auto-fix:apply-check-failed` label producer in `v40-auto-fix.yml`

**Integration points (Option A):**
- ESLint SDK guard: unchanged. The iter loop re-invokes `invokeAnthropicSdkWithLedger` / `invokeClaudePWithLedger` — both already permitted.
- Ledger additivity: `iter_round` field is spread verbatim through entry — no schema change beyond #3.
- Per-PR cap protection: ~$0.30 × 3 rounds = $0.90 SDK cost per issue, well under $2 PR cap.
- Cost-discipline interaction with #2: `--max-turns 5` may reduce iter-rounds needed (Claude can self-correct within one invocation). Sequencing: ship #2 first, observe, then size #8 (perhaps `ITER_MAX_ROUNDS = 1` is sufficient post-#2).
- Triple-gate trust invariant: untouched (iter loop is BEFORE the PR opens; auto-fix-promote.mjs sees only the final result)

**Build order:** Phase 64+ candidate (capability-expansion wave). Depends on #1 (diagnostic data) + #2 (multi-turn capability) being live for evaluation, but the code change itself is independent.

**Risks:**
- "Rewrite scaffold" architectural concern: Option A writes the rewrite hint INTO the prompt (a runtime value passed to `buildFixPrompt`), NOT into the scaffold registry. PROMPT_SCAFFOLDS stays Object.frozen and byte-identical. The hint flows through as a buildFixPrompt parameter and is spliced into the systemPrompt via the buildScaffoldSystemPrompt helper. **No ledger write needed from the rewrite step itself** (the LLM call's ledger row carries the iter_round field; no separate "scaffold rewrite" event).
- ESLint SDK guard: never violated — only `llm-driver.js` calls the SDK; the iter loop is in `auto-fix.mjs` which calls `invokeAnthropicSdkWithLedger` (the permitted entry point).
- Premature termination: if iter loop accidentally short-circuits on transient errors (network timeout), real fixes are lost. Mitigation: classify error before iterating — only iterate on `apply-check-failed` and `malformed-diff:*`, NOT on `sdk_error` (which should fail fast).

---

## Build Order Analysis — Critical Path with Cross-Feature Dependencies

### Wave 1: Carry-over (Phases 61-63)

**Phase 61: Diagnostic-injection mutator + max-turns relaxation + schema hardening — bundled**

Reasoning: All three are NECESSARY for UAT-47-a/b PASS. Bundling them avoids partial-state regressions (e.g., enabling --max-turns 5 with no diagnostic body still produces `apply-check-failed` for WRONG_CITATION; enabling diagnostic body with --max-turns 1 still hits `error_max_turns` for WRONG_CITATION cases that require source reading).

Deliverables:
1. `inject-defect.mjs` diagnostic-injection extension (Capability #1)
2. `llm-driver.js:91-97` args literal update (Capability #2)
3. `llm-ledger.js:appendLedgerEntry` schema validation at top (Capability #3)
4. Vitest pins: deterministic diagnostic-body pin (#1), arg-array pin (#2), schema-violation throw test (#3)
5. Update `inject-defect.mjs` ERROR_CLASSES set if needed
6. Live UAT-47-a/b/SWEEP-03/04 re-execution against origin/main with the bundled fix

Could phase-split into three: 61=#3 (lowest-risk, mechanical), 62=#1, 63=#2 + UAT. Operator preference. The architectural risk of bundling is LOW because the three are orthogonal in code (touch different files; no shared mutable state).

**Phase 62 (or 61 cont'd): Synthetic-issue cleanup**

Deliverables:
1. `scripts/uat-cleanup.mjs` (Capability #4)
2. SWEEP-06 cleanup runbook executed against issues #20/21/22/23
3. Refresh `inject-defect.mjs:emitCleanupEvidence` template to invoke the new script

Could ship BEFORE or AFTER Phase 61. Independent.

### Wave 2: Capability expansion (Phases 64-67 — sizes likely)

Phases below could be sized as 2-4 phases depending on operator's appetite. PROJECT.md note: "broader than v4.2 (which shipped 5 phases in ~5 days). Research convergence will likely propose 7–9 phases. If too big, Prompt-iter loop or scaffold expansion can be deferred to v4.4 at requirements-scoping time."

**Phase 64: Heuristic-first triage extension (Capability #7)**

Independent. Pure-function extension of `runTriage` D-03 rule chain. Ships any time.

Deliverables:
1. `triage-classifier.js:runTriage` new Rule 4 (or extend Rule 3) for the 2 currently-ambiguous classes
2. Vitest pins for new heuristic resolutions

**Phase 65: Expanded fix scaffolds (Capability #6)**

Co-design with #1 ideal (new scaffolds + their diagnostic-injection paths in same commit set). However, Capability #1 already shipped in Phase 61. New scaffolds in #6 need PARALLEL extension to inject-defect.mjs to cover the new ERROR_CLASS values.

Deliverables:
1. New `*_CONTRACT` + `*_SYSTEM` const + PROMPT_SCAFFOLDS registry entry (e.g., `PDF_PARSE_FAILED`, `CLOUDFLARE_RATE_LIMITED`, `FIXTURE_DRIFT` — specific classes TBD by REQUIREMENTS-scoping)
2. New ERROR_CLASS in `tests/e2e/lib/error-codes.js`
3. New ERROR_CLASS in `v40-auto-fix.yml:91` precheck
4. Possibly new ERROR_CLASS in `inject-defect.mjs:64-70` ERROR_CLASSES set
5. Possibly new MODEL_ROUTES entry (if opus needed)
6. Vitest pins (mutation guard + class count bump + contract substring assertions)

**Phase 66: A/B winner exit (Capability #5)**

Depends on accumulated outcome data (10s of outcome entries minimum to test live; ≥20 per cell × N classes for actual winner declaration). Ship the CODE change in v4.3; data accumulation continues across v4.3+v4.4 lifetimes.

Deliverables:
1. `a-b-winner.mjs:computePerClassPerArm` cleanup (remove PHASE_56_TODO comments; possibly remove `outcomeUnavailable` early-return)
2. Vitest test fixture updates (real-data winner declaration on synthetic fixture)
3. Possible threshold-tuning if data justifies

**Phase 67: Prompt-iter loop (Capability #8)**

Depends on #1+#2 live (the diagnostic+multi-turn surface is the substrate the iter loop iterates on). Option A architecture (in-process Step 10 expansion in `runDispatcher`). Defer Option B (standalone workflow) to v4.4 unless data shows in-process is insufficient.

Deliverables:
1. `fix-prompt-builder.js` rewriteHint parameter threading
2. `auto-fix.mjs:runDispatcher` Step 10 iteration loop
3. New `ITER_MAX_ROUNDS` constant + iter_round ledger field
4. Vitest pins
5. Documentation of when iter triggers (apply-check-failed, malformed-diff:* only; NOT sdk_error)

### Dependency graph

```
                  ┌──────────────────────────────────────────┐
                  │                                          │
                  │  Phase 61 (BUNDLED)                      │
                  │  Capability #1 + #2 + #3 (carry-over)   │
                  │  + UAT-47-a/b live PASS                  │
                  │                                          │
                  └─────┬──────────────────────────────┬─────┘
                        │                              │
                        ▼                              ▼
                  ┌──────────┐                  ┌─────────────────┐
                  │ Phase 62 │                  │  Outcome data   │
                  │ Cap #4   │                  │  accumulates    │
                  │ cleanup  │                  │  on origin/main │
                  └──────────┘                  └────────┬────────┘
                                                         │
            ┌────────────────┬────────────────┬──────────┴─────┐
            ▼                ▼                ▼                ▼
      ┌──────────┐     ┌──────────┐     ┌──────────┐    ┌──────────┐
      │ Phase 64 │     │ Phase 65 │     │ Phase 66 │    │ Phase 67 │
      │ Cap #7   │     │ Cap #6   │     │ Cap #5   │    │ Cap #8   │
      │ triage   │     │ scaffolds│     │ A/B exit │    │prompt-itr│
      │heuristics│     │          │     │          │    │          │
      └──────────┘     └──────────┘     └──────────┘    └──────────┘
        (indep)         (parallel)       (parallel)      (depends on
                                                          #1+#2 live)
```

**Parallel-shippable in Wave 2:** Phases 64, 65, 66 touch disjoint files (triage-classifier.js, fix-prompt-builder.js + workflow + error-codes.js, a-b-winner.mjs). Phase 67 depends on the substrate from Phase 61 being live + observed in production.

---

## Architectural Risks — Specific Call-outs

### Risk 1: Prompt-iter loop "rewrite scaffold" location

**Concern:** Where does the rewrite-on-failure logic LIVE? If it lives in a new file that imports `@anthropic-ai/sdk`, it violates the ESLint single-entry-point guard restricting that import to `llm-driver.js`.

**Resolution:** Option A architecture sites the iter loop in `auto-fix.mjs:runDispatcher` Step 10 — which already calls `invokeAnthropicSdkWithLedger`. The rewrite mechanism is parameter-threading through `buildFixPrompt` (in `fix-prompt-builder.js`, which has its own pure-function purity invariant — D-04 — that allows `./llm-router.js` import but NOT `@anthropic-ai/sdk`). The "rewrite" is data, not new SDK access.

**Where does the iter loop "write back"?** Two destinations:

1. **Same ledger** (Capability #3 schema-validated) — auxiliary entries with `iter_round: 1` etc. These flow through `safeAppendLedger` → `appendLedgerEntry` → existing ledger file. **No new ledger file.** No additive ledger schema beyond `iter_round` field which spreads verbatim per the additive-only invariant.

2. **In-memory `rewriteHint`** — the runtime string built from previous attempt's stderr/parsed.reason, passed as parameter to next `buildFixPrompt({errorClass, issueBody, rewriteHint})` invocation. **No persistence.** When the iter loop exits (success OR ITER_MAX_ROUNDS), the hint goes out of scope.

**ESLint SDK guard:** never violated. SDK access stays via `invokeAnthropicSdkWithLedger` (the permitted entry point); the iter loop re-invokes the SAME function.

### Risk 2: Forensic-ledger schema hardening landing safely

**Concern:** Adding REQUIRED-field validation to `appendLedgerEntry` could break the 33 pre-existing Vitest llm-ledger tests if any fixture omits source or transport.

**Mitigation pattern (template = Phase 56 errorClass):**

Phase 56 added `errorClass` as an OPTIONAL field threaded from callers. The 33 pre-existing tests never asserted on its ABSENCE, so they continued passing. The NEW Vitest tests in `tests/unit/auto-fix.test.js` LEDGER-04 describe block asserted on its PRESENCE at specific call sites.

For v4.3's REQUIRED-field validation, the calculus is different — REQUIRED rejects existing fixtures missing the field. The discipline:

1. **Audit step** (before writing new validation): grep `tests/unit/llm-ledger.test.js` for all `appendLedgerEntry(` call sites; verify each fixture entry has `source` + `transport`. If any omit, FIX THE FIXTURE (additive — add the field to the test fixture, not weaken the validation).
2. **Implementation step:** validation at TOP of `appendLedgerEntry`; body byte-unchanged.
3. **NEW test step:** assertions that violations throw.

This is the EXACT discipline Phase 56 used for the `safeAppendLedger` leak guard at `auto-fix.mjs` — except v4.3 puts validation in `appendLedgerEntry` itself (which Phase 56 explicitly rejected for the leak guard — Pitfall 7). The DIFFERENCE: Phase 56's leak guard checked process.env (a side effect that 33 tests' tmp-path use bypasses); v4.3's schema validation checks the ENTRY OBJECT itself, which all tests already construct with appropriate fields.

**Verification gate:** After v4.3 schema-validation commit, `CI=true npx vitest run tests/unit/llm-ledger.test.js` must show all 33 pre-existing tests pass byte-for-byte + N new schema-validation tests pass.

### Risk 3: Direct-to-main ledger commit preservation

**Concern:** `v40-auto-fix.yml:170` does `git push origin main` for the ledger commit step. Phase 57 explicitly scope-locked the cost-ledger-snapshot redirect to NOT touch `v40-auto-fix.yml`. Any v4.3 change to the ledger schema OR validation MUST preserve this push.

**Verification:** `grep -c 'git push origin main' .github/workflows/v40-auto-fix.yml` must equal 1 after every v4.3 commit. Pinned by Phase 57 S13 Vitest test.

### Risk 4: SOURCE_TAG / quarantine-append regex drift

**Concern:** Capability #1 (diagnostic-injection) MAY tempt operators to extend SOURCE_TAG to `fixture-mutator-uat-47b-diag-iter-N` to distinguish diagnostic-augmented synthetics. Without co-design, `quarantine-append.mjs:239` regex `/^fixture-mutator-uat-47b-iter-\d+$/` would NOT suppress auto-promotion for new SOURCE_TAG variants — synthetic entries would promote to golden corpus (catastrophic).

**Resolution:** If SOURCE_TAG widens, the regex MUST update in the SAME COMMIT (MUTATOR-04 co-design contract). Vitest defense-in-depth pins (G9-a, G9-b, G9-c) protect this. Plan-phase ENGINEERING should EXPLICITLY check this constraint during Capability #1 design.

**Preferred path:** keep SOURCE_TAG unchanged (`'fixture-mutator-uat-47b'`); add diagnostic content INSIDE the issue body but preserve the SOURCE_TAG string in the cleanup-evidence file + quarantine entry. No regex change needed.

### Risk 5: New ERROR_CLASS enumeration drift

**Concern:** New ERROR_CLASS strings added in Capability #6 must be declared in FIVE places:

1. `tests/e2e/lib/error-codes.js` ERROR_CLASSES set
2. `.github/workflows/v40-auto-fix.yml:91` precheck `for cls in ...` list
3. `tests/e2e/lib/fix-prompt-builder.js` PROMPT_SCAFFOLDS registry
4. `tests/e2e/scripts/inject-defect.mjs:64-70` ERROR_CLASSES set (if mutator support)
5. Possibly `tests/e2e/lib/llm-router.js` MODEL_ROUTES table (if opus-routed)

Missing any one causes a silent skip or wrong-classification. **Capability #6 plan-phase deliverable:** explicit checklist gate verifying all 5 sites updated.

### Risk 6: Validation ordering in appendLedgerEntry (Capability #3)

**Concern:** Schema validation at top of `appendLedgerEntry` runs BEFORE the read-modify-write cycle. If validation throws, the ledger file is untouched (good). But if a partial write was in progress from a concurrent process (single-process invariant violated), the temp-file pattern still atomically renames (`appendLedgerEntry:723-737` EXDEV fallback). v4.3 schema validation doesn't change this; it only rejects malformed entries BEFORE the file is touched.

**Mitigation:** No new concurrency surface introduced. The schema validation is pure (only reads `entry` object); no file I/O.

---

## Anti-Patterns Specific to v4.3

### Anti-Pattern 1: Validating ledger schema INSIDE the readLedger path

**What people do:** Add validation when loading the ledger file in `readLedger`.

**Why it's wrong:** Existing committed ledger may have orphan entries (the 3 claude-opus-4-7[1m] entries from 2026-06-08). Validating on READ rejects the file → `readLedger` returns `{version:1, months:{}}` → spend cap appears reset → next SDK call bypasses cap protection. This is EXACTLY the failure mode `appendLedgerEntry`'s atomic-write pattern was designed to prevent.

**Do this instead:** Validate on WRITE only (`appendLedgerEntry` top). Reading remains tolerant of historical entries. Forward entries are guaranteed schema-clean; backward entries are read-only audit material.

### Anti-Pattern 2: Modifying assertTripleGate body for outcome enrichment

**What people do:** While in `auto-fix-promote.mjs`, "small" tweak to assertTripleGate to add a fourth leg (e.g., checking iter_round count from Capability #8).

**Why it's wrong:** Phase 53 sha256 byte-equivalence pin. Vitest fails on ANY change to bytes between lines 67-81 of the function body. The pin exists to prevent exactly this drift.

**Do this instead:** New legs go in a NEW function (template: `assertPartialGate` from Phase 53). Capability #8 audits iter_round client-side; doesn't need to reach into the triple-gate boundary.

### Anti-Pattern 3: Caching diagnostic content in fixture-mutator

**What people do:** Cache the most-recent Google Patents DOM snippet in a JSON file, refresh weekly, embed when Capability #1 runs.

**Why it's wrong:** The cached snippet drifts the moment Google deploys. The whole point of GOOGLE_DOM_DRIFT testing is to exercise drift response — a stale cache MASKS drift. Worse, the fixture file lives in tests/, possibly in FORBIDDEN_PATHS scope.

**Do this instead:** Embed a SEEDED snippet — a synthetic DOM excerpt that mirrors the SHAPE of real Google Patents output but is fully self-contained in the inject-defect.mjs string-builder. Determinism (same seed → same snippet) preserves MUTATOR-04 invariant.

### Anti-Pattern 4: Increasing --max-turns without --allowed-tools

**What people do:** `--max-turns 5` without restricting tools.

**Why it's wrong:** Claude gains Edit/Bash access → can directly mutate source files in the workspace → bypasses `parseFencedDiff` → `checkDiffGuard` → `git apply --check` chain → trust boundary collapse.

**Do this instead:** `--max-turns 5 --allowed-tools Read,Glob,Grep` — Claude can READ source (to understand the bug) but produces output via the existing fenced-diff contract. The dispatcher chain remains the trust boundary.

---

## Scaling Considerations

| Scale | Architecture Impact |
|-------|---------------------|
| ≤10 auto-fix runs/month | Current setup unchanged — single-process ledger, monthly cap easily covers |
| 10-100 auto-fix runs/month | Ledger file grows ~1-10 KB/month — no concern (committed-but-versioned model handles arbitrary growth) |
| Multiple concurrent triage issues | Workflow `concurrency:` groups serialize per-issue; safe by construction |
| Per-PR cap saturating | Capability #8 iter-loop with ITER_MAX_ROUNDS=3 × ~$0.30/round = $0.90 per PR; under $2 cap; if iteration becomes more aggressive, raise per-PR cap or count iter rounds against it |
| MODEL_ROUTES winner-declared change | Open a NEW v4.4 phase, EDIT MODEL_ROUTES, restart sampling window — Object.frozen invariant enforces |

---

## Sources

### Primary (HIGH confidence — direct code reads)

- `scripts/auto-fix.mjs` — runDispatcher 18-step pipeline; 7 safeAppendLedger sites; Step 4 errorClass extraction; Step 7 buildFixPrompt; Step 10 transport branching; dispatchFlakeState (lines 385-543)
- `scripts/auto-fix-promote.mjs` — assertTripleGate (lines 98-112); assertPartialGate + runPartialPromote (lines 145-246); main verified + partial paths (lines 467-619); outcome ledger entries (lines 521-558)
- `scripts/a-b-winner.mjs` — abstention probe (lines 252-285); isAttributable filter (lines 178-189); detectOutcome (lines 231-238); locked constants (lines 86, 92, 98, 104)
- `scripts/quarantine-append.mjs` — SOURCE_TAG anchored regex at line 239; isFixtureMutator suppression
- `tests/e2e/lib/llm-driver.js` — invokeClaudeP args literal at line 89-97 (`--max-turns 1`); invokeClaudePWithLedger ledger write at line 421; invokeAnthropicSdkWithLedger ledger writes at lines 588 + 620; PRE-02 guard at line 525
- `tests/e2e/lib/llm-ledger.js` — appendLedgerEntry implementation at lines 686-738 (read-modify-write + atomic rename + EXDEV fallback); combinedMonthlyTotalByTransport at line 592
- `tests/e2e/lib/fix-prompt-builder.js` — PROMPT_SCAFFOLDS registry at lines 357-363 (Object.freeze 5 keys); buildScaffoldSystemPrompt shared helper at lines 117-178; buildFixPrompt at lines 406-434; per-class contracts at lines 189-296
- `tests/e2e/lib/triage-classifier.js` — runTriage at lines 400-587; D-03 rule chain at lines 428-499 (Rule 1 FLAKE, Rule 2 CONFIRMED+strong, Rule 3 NOT_REPLAYABLE+specific, Rule 4 ambiguous→LLM); classifyRerunOutcomes 5-state at lines 644-716
- `tests/e2e/lib/llm-router.js` — MODEL_ROUTES Object.frozen at lines 60-63 (GOOGLE_DOM_DRIFT, LLM_HALLUCINATED_SELECTION → opus); routeModel at lines 83-85
- `tests/e2e/scripts/inject-defect.mjs` — full file; SOURCE_TAG at line 75; ERROR_CLASSES set at lines 64-70; buildBody at lines 277-298; main orchestration at lines 436-474
- `.github/workflows/v40-auto-fix.yml` — full file; precheck ERROR_CLASS list at line 91; ledger commit step at line 170 (`git push origin main` — Phase 57 scope-locked); cpr@v8 at line 200
- `.github/workflows/v40-verifier-gate.yml` — full file; scope-decision step (Phase 51.1 fix) at lines 76-86; affected_cases parser at line 313; auto-fix:verified label producer at line 583; partial-verified label producer at lines 585-660
- `.github/workflows/v40-auto-promote.yml` — full file; workflow_dispatch + pull_request triggers; PHASE_TAG input at line 74; triple-gate + runPromote loop at lines 307-376
- `.planning/research-v4.2-archive/ARCHITECTURE.md` — full prior architecture map (still authoritative for v4.0/v4.1/v4.2 surface — re-validated by 2026-06-08 integration check)
- `.planning/research-v4.2-archive/SUMMARY.md` — Tension 1 (ledger-commit scope lock), Tension 3 (leak-guard placement), Tension 4 (call-site count), Tension 5 (event-sourced outcome)
- `.planning/milestones/v4.2-MILESTONE-AUDIT.md` — 22/25 satisfied; SWEEP-03/04/06 deferred-to-v4.3 with documented architectural root-cause
- `.planning/PROJECT.md` — v4.3 target features list at lines 17-28; trust-invariant rules at lines 33-37
- `.planning/STATE.md` — Deferred Items (acknowledged at v4.2 milestone close) at lines 116-125; v4.3 carry-over Pending Todo at lines 81-84; ruleset decision at lines 137-139

### Secondary (MEDIUM confidence — derived from primary)

- ESLint `no-restricted-imports` rule restricting `@anthropic-ai/sdk` to `llm-driver.js` — inferred from Phase 47 INT-FIX-LOCK references in PROJECT.md decisions table + commentary in `llm-driver.js:46`
- `tests/e2e/lib/error-codes.js` ERROR_CLASSES set contents — inferred from `auto-fix.mjs:225` RECOGNIZED_LABELS construction and `inject-defect.mjs:64-70` ERROR_CLASSES set listing 5 classes (WRONG_CITATION, LLM_HALLUCINATED_SELECTION, WORKER_FALLBACK_FAILED, GOOGLE_DOM_DRIFT, HARNESS_ERROR) + FLAKE/LLM_API_ERROR/PASS via skip-class paths
- Vitest test count 1252/1252 at v4.2 close — from PROJECT.md v4.2 closure note (line 152)

### Tertiary (LOW confidence — operator-input needed)

- Specific new ERROR_CLASS names for Capability #6 — DEFERRED to v4.3 REQUIREMENTS-scoping (PROJECT.md line 38 explicitly notes "specific design knobs ... deferred to research wave")
- Scope of Capability #8 (full automation vs. capture-and-surface-for-human-review) — DEFERRED (PROJECT.md line 38)
- A/B threshold values, prompt-iter trigger conditions, cost cap adjustments — DEFERRED

---

*Architecture research for: v4.3 Auto-Fix Loop Closure + Capability Expansion*
*Researched: 2026-06-08*
*Downstream: gsd-roadmapper (integration map for phase scoping)*

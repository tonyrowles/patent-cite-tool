# Phase 61 — Plan Check Report

**Reviewed:** 2026-06-09
**Reviewer:** gsd-plan-checker
**Plans verified:** 5 (61-01, 61-02, 61-03, 61-04, 61-05)
**Phase goal:** Diagnostic mutator + `--max-turns 5 --tools Read,Glob,Grep` + BUDG-01 ship in ONE atomic commit; live UAT-47-a/b/SWEEP-03/04 PASS evidence captured on `origin/main` with `errorClass + outcome + source + transport` ledger entries.

---

## Coverage Matrix (Goal-Backward)

| Req ID | Phase Goal Anchor | Plan | Task | Coverage |
|--------|-------------------|------|------|----------|
| DIAG-01 | Mutator emits GOOGLE_DOM_DRIFT body with verbatim Google-Patents selector | 61-01 | Task 1+2 | COVERED — Task 1 emits selector; Task 2 pins `toMatch(/patent-result\|section\[itemprop="claims"\]\|main\|article/)` |
| DIAG-02 | Mutator emits WRONG_CITATION body with Phase 35 Verifier Disagreement template parity | 61-01 | Task 1+2 | COVERED — Task 1 emits headers; Task 2 pins 5 `toContain` literals |
| DIAG-03 | Determinism + SOURCE_TAG preserved | 61-01 | Task 1+2 | COVERED — Task 2 includes 2 determinism tests + SOURCE_TAG loop test + v2 marker test |
| TURNS-01 | argv `--max-turns 5 --tools Read,Glob,Grep --max-budget-usd 0.50` (subscription only) | 61-02 | Task 1 | COVERED — explicit before/after argv edits at lines 91-97 + Test 23 toEqual |
| TURNS-02 | Excludes Edit/Bash/Write/WebFetch/--allowed-tools/--allowedTools | 61-02 | Task 1 | COVERED — exactly 6 `.not.toContain` assertions in Test 23 |
| TURNS-03 | Mean per-call < $0.30 cost-bound regression | 61-02 | Task 2 | COVERED — new fixture file + 5 Vitest cases asserting `toBeLessThan(0.30)` + `toBeGreaterThan(0.20)` |
| BUDG-01 | STATE.md ## Budget table with 7 rows | 61-03 | Task 1 | COVERED — 8 verify-only grep gates; restore-if-drift fallback |
| UAT-01 | SWEEP-03 GOOGLE_DOM_DRIFT live PASS with ledger entry on origin/main | 61-04 | Task 1-3 | COVERED — pre-flight + 8-step runbook + sentinel append |
| UAT-02 | SWEEP-04 WRONG_CITATION + MUTATOR-04 invariant | 61-05 | Task 1-3 | COVERED — pre-flight w/ quarantine baseline + 9-step runbook + post-count delta + sentinel append |

All 9 requirement IDs appear in exactly one plan's `requirements` frontmatter field. Coverage check: PASSED.

---

## Per-Dimension Verdict

### Dimension 1: Requirement Coverage
PASS. All 9 requirements (DIAG-01/02/03, TURNS-01/02/03, BUDG-01, UAT-01, UAT-02) have at least one task with file + action + verify + done.

### Dimension 2: Task Completeness
PASS. All `auto` tasks have `<files>`, `<action>`, `<verify>` (with `<automated>`), `<acceptance_criteria>`, `<done>`. `checkpoint:human-action` tasks (Plans 04/05) have `<what-built>`, `<how-to-verify>`, `<resume-signal>`. No missing required fields.

### Dimension 3: Dependency Correctness
PASS. Dependency graph:
- 61-01 (Wave 1, depends_on: []) — independent
- 61-02 (Wave 1, depends_on: []) — independent
- 61-03 (Wave 1, depends_on: [61-01, 61-02]) — integration gate
- 61-04 (Wave 2, depends_on: [61-03])
- 61-05 (Wave 2, depends_on: [61-03])

No cycles, no missing references, no forward references. Wave numbers consistent with dependencies (max(deps)+1).

NOTE: Plan 03 is labeled `wave: 1` despite depending on 61-01 and 61-02 (also Wave 1). Per the rule "Wave number = max(deps) + 1", Plan 03 should be Wave 2. This is a WARNING — the orchestrator runs Wave 1 plans in parallel; Plan 03 depending on Wave 1 plans within Wave 1 is structurally inconsistent. However, the `depends_on` array correctly enforces sequencing, so execution is safe. See WARNING-1 below.

### Dimension 4: Key Links Planned
PASS. Plan 01 wires inject-defect.mjs → selection.js + navigation.js (via verbatim string match), → issue-payload-builder.js (via Verifier Disagreement headers), → quarantine-append.mjs:239 (via SOURCE_TAG preservation). Plan 02 wires llm-driver.js:91-97 argv → Test 23 toEqual assertion (byte-identical match). Plan 03 wires STATE.md ## Budget → BUDG-01 spec. Plans 04/05 wire `.planning/sweep-03-04-pass-evidence.yaml` → ledger entry via ledgerEntryIso cross-reference.

### Dimension 5: Scope Sanity
PASS. Task counts per plan:
- 61-01: 2 tasks (mutator extension + Vitest pin) — within budget
- 61-02: 2 tasks (driver edit + cost-bound fixture) — within budget
- 61-03: 2 tasks (Budget verify + atomic commit) — within budget
- 61-04: 3 tasks (pre-flight + run + sentinel write) — within budget
- 61-05: 3 tasks — within budget

Files modified per plan: 2/4/1/1/1. All within budget thresholds.

### Dimension 6: Verification Derivation
PASS. `must_haves.truths` in each plan are user-observable / behavior-observable (not implementation-only): "buildBody returns body containing verbatim selector"; "argv contains/excludes X"; "STATE.md contains Budget table"; "ledger entry exists with errorClass=X". Artifacts map to truths; key_links connect them. Verification commands are deterministic grep/vitest invocations.

### Dimension 7: Context Compliance
PASS. CONTEXT.md locked decisions are all honored:
- D-DIAG-01: GOOGLE_DOM_DRIFT body MUST contain `patent-result|section[itemprop="claims"]|main|article` — Plan 01 Task 1 emits all four; Plan 01 Task 2 regex pin matches
- D-DIAG-03-PATH: Plan 01 uses `tests/e2e/scripts/e2e-inject-defect.test.js` (the corrected path); not the incorrect `tests/unit/` path mentioned earlier in CONTEXT.md. RESEARCH.md A3 explicitly authorizes this correction.
- MUTATOR-04 invariants: SOURCE_TAG `'fixture-mutator-uat-47b'` at inject-defect.mjs:75 NOT modified; ERROR_CLASSES additive-only (NO new classes added in Plan 01 — explicit constraint)
- Argv update: Plan 02 Task 1 implements exact AFTER spec from CONTEXT.md
- TURNS-02: `--tools` (palette restriction) NOT `--allowedTools` (permission grant) — Plan 02 Task 1 explicitly excludes both spellings
- TURNS-03: fixture-based, 5 entries, mean $0.20-0.29 — Plan 02 Task 2 implements exactly this
- Atomic commit: Plan 03 Task 2 ships ONE commit covering all 6 files; depends_on enforces ordering
- Live UAT: Plans 04/05 capture into `.planning/sweep-03-04-pass-evidence.yaml`
- Trust-invariant non-mutations: Plan 03 Task 1 Step 3 runs 5 grep gates pre-commit (SOURCE_TAG, isFixtureMutator filter, git push count, ERROR_CLASSES, ANTHROPIC_API_KEY blanking)

No Deferred Ideas implemented (no google-patents-page.js consolidation; no `claude --help` runtime probe — both correctly absent).

### Dimension 7b: Scope Reduction Detection
PASS. No scope-reduction language detected ("v1", "simplified", "static for now", "future enhancement", "placeholder", etc.) in any plan task action. Each decision is delivered in full. No silent downgrades.

### Dimension 7c: Architectural Tier Compliance
PASS. RESEARCH.md ## Architectural Responsibility Map matches plan task assignments:
- Synthetic-issue body composition (DIAG-01, DIAG-02) → tests/e2e/scripts/ — Plan 01 targets this tier
- argv shape of subscription LLM transport (TURNS-01) → tests/e2e/lib/ — Plan 02 targets this tier
- Cost-bound regression (TURNS-03) → tests/unit/ — Plan 02 Task 2 targets this tier
- Deterministic body assertion (DIAG-03) → tests/e2e/scripts/ (co-located) — Plan 01 Task 2 targets this tier
- Budget table (BUDG-01) → .planning/STATE.md — Plan 03 targets this tier
- Live evidence capture (UAT-01/02) → orchestrated scripts + `.planning/sweep-03-04-pass-evidence.yaml` — Plans 04/05 target this tier

### Dimension 8: Nyquist Compliance
- Check 8e (VALIDATION.md existence): PASS — `61-VALIDATION.md` exists.
- Check 8a (Automated Verify Presence): PASS for all `auto` tasks (Plans 01/02/03 Task 1+2 all have `<automated>` commands). Plans 04/05 tasks 1 and 2 are `checkpoint:human-action` — appropriately marked manual; Task 3 has `<automated>` grep gates.
- Check 8b (Feedback Latency): PASS — all automated commands are `npx vitest run` on specific test files (~10s); no watch-mode flags; no E2E playwright/cypress; no >30s delays.
- Check 8c (Sampling Continuity): PASS — Plans 01/02/03 all have automated verify on consecutive tasks; no 3-consecutive gap.
- Check 8d (Wave 0 Completeness): PASS — VALIDATION.md Wave 0 list includes `tests/unit/llm-driver-cost-bound.test.js` (Plan 02 Task 2 creates), `tests/fixtures/ledger-cost-bound.jsonl` (Plan 02 Task 2 creates), `.planning/sweep-03-04-pass-evidence.yaml` (Plans 04/05 Task 3 create). All MISSING references are mapped to a Wave 0 task with matching file path.

### Dimension 9: Cross-Plan Data Contracts
PASS. The shared data pipeline is `.planning/sweep-03-04-pass-evidence.yaml`. Plans 04 and 05 both write to it (uat_01 row and uat_02 row respectively). Both plans correctly handle the interleave: Plan 04 Task 3 Step 1 creates the file if absent; Plan 05 Task 3 Step 1 also creates the file if absent ("valid interleave"). Schema keys match between plans (passed_at_iso, errorClass, outcome, source, transport, issueId, prNumber, ledgerEntryIso, seed are common; uat_02 adds 3 extra fields). No conflicting transforms.

NOTE: Plan 04 schema (uat_01 block) does NOT include the `mutator04_filter_observed` / quarantine delta fields. Plan 05 schema (uat_02 block) adds them. Phase 68 consumer must distinguish. This is fine because Phase 68 logic distinguishes uat_01 from uat_02 by key.

### Dimension 10: CLAUDE.md Compliance
PASS. The CLAUDE.md AskUserQuestion verification rule applies during interactive planning/discuss phases. Phase 61 plan execution does not invoke AskUserQuestion in any `auto` task. Plans 04/05 contain `checkpoint:human-action` tasks with `<resume-signal>` typed phrases (`approved`, `uat-01-pass`, `uat-01-fail`, `uat-02-pass`, `uat-02-fail`) — these are explicit textual handshakes, NOT AskUserQuestion tool calls. CLAUDE.md compliance preserved.

### Dimension 11: Research Resolution
PASS — but qualified. RESEARCH.md has a `## Open Questions` section (NOT marked `(RESOLVED)` in the heading). The 3 listed questions each include a `Recommendation:` line that resolves them:
1. Transport selection (SDK vs subscription) — recommended: operator picks at runtime per credit posture. This is an explicit Discretion item in CONTEXT.md; resolved.
2. Sentinel schema_version field — recommended: add `schema_version: 1`. Plans 04 and 05 BOTH include `schema_version: 1` in the file header. Resolved.
3. SWEEP-01 $0 dry-run before SWEEP-03 spend — recommended: operator does this. This is operator runbook discipline, not plan-task scope. Resolved.

This is technically a violation of Dimension 11's literal rule ("section heading must have `(RESOLVED)` suffix OR each question must have inline `RESOLVED` marker"). However, each question has a `Recommendation:` line that effectively resolves it, and the recommendations are reflected in the plans (schema_version is in the plans; transport discretion is in CONTEXT.md; dry-run is operator concern). See WARNING-2 below.

### Dimension 12: Pattern Compliance
SKIPPED — no PATTERNS.md exists for this phase. Patterns are inline in RESEARCH.md ## Architecture Patterns / Code Examples; plans reference them by file:line.

---

## Atomic-Commit Invariant Verification

**Verified:** Plans 01 and 02 contain ZERO `git commit` or `git add` instructions (verified via grep). They modify files only. Plan 03 Task 2 is the SOLE commit author and explicitly stages all 6 files via per-path `git add` (NOT `-A`/`.`). Plan 03's `depends_on: [61-01, 61-02]` enforces that Plans 01 and 02 complete first.

The atomic-commit invariant is structurally enforced. ONE commit ships:
1. tests/e2e/scripts/inject-defect.mjs (Plan 01 Task 1)
2. tests/e2e/scripts/e2e-inject-defect.test.js (Plan 01 Task 2)
3. tests/e2e/lib/llm-driver.js (Plan 02 Task 1)
4. tests/unit/llm-driver.test.js (Plan 02 Task 1)
5. tests/unit/llm-driver-cost-bound.test.js (Plan 02 Task 2 — NEW)
6. tests/fixtures/ledger-cost-bound.jsonl (Plan 02 Task 2 — NEW)
7. .planning/STATE.md (Plan 03 Task 1, conditional on drift)

Plan 03 Task 2 Step 2 explicitly checks the staged diff against expected file-set and stops if surprise files appear. Plan 03 Task 2 Step 3 uses explicit per-path `git add` to exclude `tests/e2e/.llm-spend-ledger.json` runtime drift.

Partial-state scenarios guarded: Plan 03 Task 2 Step 1 runs the FULL Vitest suite before commit; Plan 03 Task 1 Step 4 halts the entire pipeline if any trust-invariant grep gate fails.

PASSED.

---

## Trust-Invariant Non-Mutation Verification

Plan 03 Task 1 Step 3 runs 5 trust-invariant grep gates pre-commit:
1. `grep -c "fixture-mutator-uat-47b" tests/e2e/scripts/inject-defect.mjs` == 1 — SOURCE_TAG byte-unchanged at line 75 (verified on disk: line 75 confirmed)
2. `grep -c "&& !isFixtureMutator" scripts/quarantine-append.mjs` == 1 — production-path suppression filter byte-unchanged (verified on disk: line 239 confirmed)
3. `grep -c "git push origin main" .github/workflows/v40-auto-fix.yml` == 1 — Phase 57 scope-lock
4. `grep -c "ERROR_CLASSES = new Set" tests/e2e/scripts/inject-defect.mjs` == 1 — allowlist additive-only
5. `grep -c "ANTHROPIC_API_KEY: ''" tests/e2e/lib/llm-driver.js` >= 1 — T-31-4 mitigation

Plan 01 Task 1 `<acceptance_criteria>` adds: `grep -c "fixture-mutator-uat-47b" tests/e2e/scripts/inject-defect.mjs` == 1.
Plan 02 Task 1 `<acceptance_criteria>` adds: `grep -c "ANTHROPIC_API_KEY: ''" tests/e2e/lib/llm-driver.js` >= 1.

Trust invariants covered. `assertTripleGate` body byte-equivalence (Phase 53) and `appendLedgerEntry` body byte-unchanged (Phase 56) — NOTE: these are NOT verified via sha256 in Plan 03; the plan relies on Plan 03 Task 2 Step 2's "the expected modified/added set is EXACTLY [6 files]" guard (which excludes the files containing `assertTripleGate` (`scripts/auto-fix-promote.mjs`) and `appendLedgerEntry` (`tests/e2e/lib/llm-ledger.js`)) and Step 2's FORBIDDEN_PATHS scope-lock acceptance criterion (`scripts/auto-fix-promote.mjs scripts/auto-fix.mjs tests/e2e/lib/llm-ledger.js tests/e2e/lib/fix-prompt-builder.js` MUST be empty in diff).

This is a defensible substitution: if the files containing the protected functions are not in the diff, their bodies are byte-unchanged. Trust-invariant verification is structurally enforced via diff scope-lock. See WARNING-3 below for a minor enhancement suggestion.

PASSED.

---

## Goal-Backward Verification

Working backward from each ROADMAP.md Phase 61 Success Criterion:

**Criterion 1:** SWEEP-03 GOOGLE_DOM_DRIFT live PASS with ledger entry — DELIVERED by Plan 04 Task 2 Step 8 (capture ledger entry) + Plan 04 Task 3 (sentinel append). Prerequisite: Plan 01 ships DIAG-01 (so the synthetic body is parseable by the scaffold) and Plan 02 ships TURNS-01 (so Claude has --max-turns 5 to read source). Both upstream. ACHIEVABLE.

**Criterion 2:** SWEEP-04 WRONG_CITATION + MUTATOR-04 invariant — DELIVERED by Plan 05 Task 2 Step 8-9 (post-UAT quarantine count vs pre-UAT) + Plan 05 Task 3 (sentinel append with mutator04_filter_observed). Prerequisite: Plan 01 ships DIAG-02 (Verifier Disagreement template parity). ACHIEVABLE.

**Criterion 3:** llm-driver.js argv contains `--tools Read,Glob,Grep` + excludes Edit/Bash/Write/WebFetch + SDK unchanged — DELIVERED by Plan 02 Task 1. Verified by Test 23 toEqual + 6 .not.toContain assertions. ACHIEVABLE.

**Criterion 4:** Deterministic mutator body byte-pinned + SOURCE_TAG preserved — DELIVERED by Plan 01 Task 2 (5 deterministic / template-parity / selector / SOURCE_TAG-loop / v2-marker tests). ACHIEVABLE.

**Criterion 5:** TURNS-03 mean per-call < $0.30 + STATE.md ## Budget live — DELIVERED by Plan 02 Task 2 (fixture + 5 Vitest cases) + Plan 03 Task 1 (8 grep gates on Budget table). ACHIEVABLE.

All 5 ROADMAP.md Phase 61 Success Criteria are reachable if all 5 plans complete successfully. Goal-backward verification: PASSED.

---

## Warnings (non-blocking; recommended fixes)

**WARNING-1:** Plan 03 frontmatter `wave: 1` despite `depends_on: [61-01, 61-02]`. Per Dimension 3 rule "Wave number = max(deps) + 1", Plan 03 should be `wave: 2`. Plans 04 and 05 are correctly marked `wave: 2`. Plan 03 is also Wave 2 logically (must run after 01 and 02). The `depends_on` array correctly enforces sequencing, so execution will not break, but the wave label is structurally inconsistent. RECOMMENDED FIX: change Plan 03 frontmatter to `wave: 2` and update Plans 04/05 to `wave: 3`. NON-BLOCKING because the dependency graph (not the wave label) is the executable contract.

**WARNING-2:** RESEARCH.md `## Open Questions` section heading does not have the literal `(RESOLVED)` suffix required by Dimension 11. Each question has a `Recommendation:` line that effectively resolves it, and the resolutions are reflected in plan content (sentinel schema_version: 1 is in Plans 04/05; transport-discretion is in CONTEXT.md; dry-run is operator runbook). RECOMMENDED FIX: rename the section to `## Open Questions (RESOLVED)`. NON-BLOCKING because the substantive resolutions are present.

**WARNING-3:** Plan 03 does not explicitly run a `sha256sum` byte-stability check on `assertTripleGate` body or `appendLedgerEntry` body. Trust-invariant preservation is instead enforced via "the files containing those functions (`scripts/auto-fix-promote.mjs`, `tests/e2e/lib/llm-ledger.js`) MUST NOT appear in the staged diff". This is structurally equivalent (file unchanged → function body byte-unchanged), but RESEARCH.md Pitfalls 10 explicitly mentions "Vitest sha256 pin re-verified pre-commit" as the recommended approach. RECOMMENDED FIX: add a 6th grep gate to Plan 03 Task 1 Step 3 of the form: `git diff HEAD -- scripts/auto-fix-promote.mjs tests/e2e/lib/llm-ledger.js | wc -l` == 0. NON-BLOCKING because the existing scope-lock acceptance criterion in Plan 03 Task 2 Step 2 covers this case (the FORBIDDEN_PATHS diff-empty grep is functionally equivalent).

---


## Final Verdict

## PLAN CHECK PASSED

All 9 requirement IDs covered. Atomic-commit invariant structurally enforced (Plan 03 is sole commit author; Plans 01/02 do no committing; Plan 03 depends_on [61-01, 61-02]; explicit per-path `git add` with diff-scope verification). Trust-invariant non-mutations covered (5 grep gates pre-commit + diff-scope-lock acceptance criterion on FORBIDDEN_PATHS files). All 5 ROADMAP.md Phase 61 Success Criteria reachable via the planned execution. CONTEXT.md locked decisions honored; deferred ideas excluded; no scope reduction detected.

Three non-blocking WARNINGs surfaced for planner consideration (Plan 03 wave label; RESEARCH.md `(RESOLVED)` heading suffix; explicit sha256 byte-stability pin) — none block execution.

Plans are ready to execute.

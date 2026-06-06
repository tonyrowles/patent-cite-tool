# Feature Research

**Domain:** LLM-CI auto-fix loop — operational validation (v4.2)
**Researched:** 2026-06-04
**Confidence:** HIGH (primary sources: codebase + 51-UAT-EVIDENCE.md + a-b-winner.mjs + STATE.md)

---

## Scope note

This document covers ONLY the v4.2 NEW capabilities. Everything already shipped
(pipeline structure, 5 ERROR_CLASS scaffolds, MODEL_ROUTES, FLAKE classifier,
weekly digest wiring, partial-verified semantics, trust invariants, cost controls)
is NOT re-researched here.

The four capability categories the roadmap needs to sequence are:

1. **Operator experience — first real fix shipped**
2. **Fixture-mutator (UAT-47-b)**
3. **Ledger schema extension** (`errorClass` + `outcome`)
4. **4-UAT re-sweep against origin**

Each category is analyzed as Table Stakes / Differentiators / Anti-Features below,
with an explicit complexity note and dependency on v4.0/v4.1 assets.

---

## Feature Landscape

### Table Stakes

Features required for v4.2's DoD: "at least one production fix shipped through the
loop end-to-end." Missing any of these = DoD not met.

| Feature | Why Required | Complexity | v4.0/v4.1 Dependency |
|---------|--------------|------------|----------------------|
| Verifier-gate trigger fix | v40-verifier-gate.yml uses `pull_request.branches:['auto-fix/*']` which matches BASE not HEAD — gate NEVER fires on PRs into main (UAT-47-e FAIL, 51-UAT-EVIDENCE.md deviation #2). Without this fix UAT-47-a and any real auto-fix run cannot produce gate evidence. | LOW (YAML patch: replace `branches:` filter with job-level `if: startsWith(github.head_ref,'auto-fix/')`) | Depends on: Phase 50 ruleset (enforcement=active, bypass_actors=[]); must NOT widen assertTripleGate |
| Ledger-commit refactor (both workflows) | `v40-cost-ledger-snapshot.yml` and `v40-auto-fix.yml` both push directly to `main`. Phase 50 ruleset blocks these pushes (no bypass actors). UAT-47-d is structurally blocked without this fix. Option B (push to `ledger-snapshots/*` branch, no merge to main) is the recommended path per 51-UAT-EVIDENCE.md — avoids diff-guard/locked-path entanglement and is independent of the verifier-gate trigger patch. | MEDIUM (two YAML edits + weekly-digest aggregation update to read from `ledger-snapshots/*` refs) | Depends on: Phase 50 ruleset state; additive-only constraint on SUMMARY_KEYS |
| Ledger schema extension (`errorClass` + `outcome`) | `a-b-winner.mjs` is in abstention mode because no ledger entry carries `errorClass` or an outcome field. The weekly digest auto-fix section shows `n/a` for all 7 metrics because the ledger lacks these fields. STATE.md Pending Todos (Phase 54 closure note) specifies exact wiring: `errorClass` from auto-fix.mjs Step 7 var; `pr_merged` / `outcome` from auto-fix-promote.mjs verified-promotion event. | MEDIUM (7 appendLedgerEntry call sites in auto-fix.mjs + 2 in invokeAnthropicSdkWithLedger + 1 post-promote follow-up entry; `auto-fix-api` source entries are the known ledger-leak vector per MEMORY.md) | Depends on: additive-only ledger schema constraint (Phase 53 D-08); a-b-winner.mjs forward-compat probe handles transparently once fields present |
| Fixture-mutator (`regression-fixture-mutator.mjs`) | UAT-47-b requires a script that injects a controlled citation-text defect into a known-good golden case, then confirms the full loop (rerun → triage → issue → auto-fix → verifier-gate → merge → promote) fires and closes. Without the mutator there is no deterministic end-to-end proof-of-life — waiting for a real anomaly is non-deterministic. | MEDIUM (new script: read golden case, apply text mutation, write back, record mutation log; must be idempotent and reversible) | Depends on: verifier-gate trigger fix (mutator-triggered PR must fire the gate) + ledger schema extension (outcome field needed to confirm promotion completes) |
| UAT-47-a live execution (end-to-end auto-fix on issue #3) | Issue #3 (`US11427642-spec-short-1`, fingerprint `139f821b3bb1`) has `triage` label and is still OPEN as of v4.1 close. UAT-47-a exercises the label-cycle → auto-fix → verifier-gate → (manual merge) loop end-to-end. Was AUTO-DEFERRED in Phase 51 because verifier-gate trigger was broken. Re-attempt is the primary DoD evidence artifact. | MEDIUM (~$0.50–$2 API spend; ~10 min CI; label-cycle + watch + evidence capture) | Depends on: verifier-gate trigger fix; ledger-commit refactor (auto-fix.mjs ledger push must succeed) |
| UAT-47-d live execution (ledger-snapshot workflow) | Confirms the refactored `v40-cost-ledger-snapshot.yml` pushes to `ledger-snapshots/YYYY-MM-DD` instead of `main`. Evidence: branch exists, ledger file updated, no locked-path violation. | LOW (workflow_dispatch + observe + evidence capture) | Depends on: ledger-commit refactor shipped |
| UAT-47-e re-execution (verifier-gate diff-guard) | Confirms the trigger patch made the gate fire on `auto-fix/*` PRs into main; tests the diff-guard LOCKED-path rejection. Was FAIL in Phase 51 because the gate never fired. After the trigger fix this is a ~3-min cheap smoke test. | LOW (test PR, observe, close) | Depends on: verifier-gate trigger fix shipped |
| UAT-47-b live execution (dep-PR synthetic regression) | Confirms the deps-update-gate fires and rejects a dep-PR that carries a synthetic regression. Requires the fixture-mutator as the regression-injection primitive. Pre-step: audit `v40-deps-update.yml` for same BASE/HEAD confusion as verifier-gate. | MEDIUM (workflow_dispatch + mutation push + observe + rollback) | Depends on: fixture-mutator + verifier-gate trigger audit of deps-update.yml |
| Trust/safety hardening: `auto-fix-api` ledger-leak vector | `scripts/auto-fix.mjs` writes ledger entries via a path that `invokeAnthropicSdkWithLedger`'s PRE-02 guard does NOT cover (entries with `source: 'auto-fix-api'`). MEMORY.md flags this. Must be closed before any real production run, otherwise cost-cap enforcement is bypassable. | LOW (add source-check guard or route all entries through the guarded wrapper) | Depends on: ledger schema extension (additive change to existing call sites) |
| Trust/safety hardening: Test 48 working-copy mutation | `tests/unit/llm-ledger.test.js` Test 48 mutates the working copy of the ledger file during test runs. This is a pre-existing failure noted at Phase 53 and 54 closures as non-scope. It must be fixed before any live run writes real ledger entries, otherwise a test run after a live run may corrupt ledger state. | LOW (fix test to write to a temp file, not the real ledger) | None beyond existing Vitest harness |
| Remove dead `MODEL` const in auto-fix.mjs | Phase 54 left the module-level `MODEL` const as dead code per additive-only scope lock. Cleanup-debt carry-along. | LOW (2-line deletion) | None |

### Differentiators

Features that make the v4.2 loop trustworthy and observable beyond the bare DoD.

| Feature | Value Proposition | Complexity | v4.0/v4.1 Dependency |
|---------|-------------------|------------|----------------------|
| A/B winner exit from abstention | Once `errorClass` + `outcome` fields populate ledger entries (≥20 per ERROR_CLASS per model arm), `a-b-winner.mjs` automatically emits the markdown winner table with no code changes. This is the forward-compat probe Phase 54 built. The roadmap phases just need to ship the ledger schema extension and run the loop enough times. | LOW (schema extension unlocks it; no new code needed) | Depends on: ledger schema extension; sufficient live runs |
| Observability: fix-rate per ERROR_CLASS | After ledger schema lands, `cost_per_fix` in the weekly digest becomes non-`n/a`. The 7-metric SUMMARY_KEYS section populates with real values. This confirms the loop is operational to any reader of Monday digests. | LOW (automatic from schema extension + existing renderAutoFixPipelineSection) | Depends on: ledger schema extension + at least one merged auto-fix PR |
| Observability: time-to-merge P50 | `time_to_merge_p50` metric (already wired in renderAutoFixPipelineSection, filters `mergedAt !== null` before median) becomes meaningful once real PRs merge. This is the primary "pipeline health" signal operators can watch week-over-week. | LOW (automatic from schema extension + merged PRs) | Depends on: ledger schema extension + first real merge |
| Observability: flake-to-real-bug ratio | The FLAKE 5-state machine (classifyRerunOutcomes, ring buffer, 30-day suppression) already tracks this. Once real runs accumulate, the classification breakdown in the weekly digest shows FLAKE vs CONFIRMED ratio. No new code needed — just need live data. | LOW (no new code; live data accumulation) | Depends on: live loop running |
| Observability: abandonment rate | Ledger entries with `source: 'auto-fix-api'` and `fix_attempts` at cap (3) without a merged outcome indicate abandoned fixes. Adding a `fix_abandoned` outcome field would surface this explicitly. This is a DIFFERENTIATOR (not table stakes) because the loop can be minimally operational without it. | MEDIUM (one extra outcome value in schema; no dashboard changes needed until A/B winner uses it) | Depends on: ledger schema extension |
| Fixture-mutator safety: idempotent + reversible + case-scoped | A well-built mutator must be (a) deterministic given the same case-id (re-running produces the same diff), (b) reversible via `git checkout` or explicit `--restore` flag, (c) scoped to a single case so it never mutates the full baseline. The UAT-47-b runbook (51-UAT-EVIDENCE.md §UAT-47-b step 2) specifies idempotency. The key primitive is: read the case's `expectedCitation` from `tests/golden/baseline.json`, apply a repeatable text transformation (e.g., increment column number by 1), write back, log mutation summary. | MEDIUM | Depends on: golden baseline schema (already known from Phase 33 rerun-validator work) |
| Promotion observability: `auto-fix-promoted` ledger entry | When `auto-fix-promote.mjs` successfully promotes a case from quarantine to golden, writing a follow-up ledger entry with `source: 'auto-fix-promoted'` and `outcome: 'pass'` creates an audit trail that closes the loop in the ledger. This is how the A/B winner script determines the per-model pass-rate. | LOW (2–3 lines added to auto-fix-promote.mjs post-promote event path) | Depends on: ledger schema extension; assertTripleGate byte-unchanged constraint |

### Anti-Features

These are features the pipeline MUST NOT have. They are explicit design invariants.

| Anti-Feature | Why It Seems Attractive | Why It Is Prohibited | What to Do Instead |
|--------------|------------------------|---------------------|--------------------|
| Auto-merge auto-fix PRs | Speeds up loop; removes human latency | Destroys the human-gated trust invariant that is the ENTIRE POINT of the pipeline for citation-accuracy code (legal filing core value). Phase 53 D-18 and the triple-gate invariant are load-bearing. Any attempt to add `--auto` to the auto-fix PR create step or to add the auto-fix bot to CODEOWNERS bypass actors violates this invariant. | Human reviews and merges the auto-fix PR. The pipeline signals readiness via the `auto-fix:verified` label; humans act on the label. |
| Direct-to-main auto-promote | Removes the separate follow-up PR step | `v40-auto-promote.yml` MUST open a SEPARATE follow-up PR, never push directly. The `_skipCiGuard:true` triple-gate reconstruction is the only exception and is guarded by assertTripleGate throwing on any leg failure. Any shortcut here (e.g., `gh api repos/.../git/refs` direct update) bypasses CODEOWNERS and the verifier-gate. | Keep auto-promote as a separate follow-up PR. The operator merges the follow-up after reviewing the promotion diff. |
| Widening `assertTripleGate` to accept `auto-fix:partial-verified` | Partial-verified cases are not fully validated; accepting them in the main gate would allow partially-validated fixes to promote to golden via the standard path. | Phase 53's load-bearing decision: `assertPartialGate` is a SEPARATE entry point. `assertTripleGate` body is byte-unchanged. Vitest Test 5 (auto-fix-promote-gate.test.js) pins that assertTripleGate throws on the partial-verified label. | Use `assertPartialGate` + `runPartialPromote` for partially-verified cases. Never route partial cases through assertTripleGate. |
| Bypassing Phase 50 ruleset (bypass_actor re-add) | Simplifies the ledger-commit and test UAT workflows | Phase 50 spent an entire phase removing bypass actors. Re-adding even temporarily for automation defeats GATE-02. The break-glass §7 runbook exists for one-off human operator use only, not for CI automation. | Fix the workflows to not need main-branch pushes: Option B (ledger-snapshots/* branch) for ledger commits; PR-then-merge for anything that needs to land on main. |
| Polling the real ledger file in Vitest tests | Allows tests to use real production data | Tests that read or write the real `tests/e2e/.llm-spend-ledger.json` create cross-contamination between test runs and live runs. Test 48 in llm-ledger.test.js already does this and is a known pre-existing failure. New tests MUST use temp files or injected-path overrides. | Use the `--ledger <path>` CLI override (already built into a-b-winner.mjs) or the injected-deps pattern (already used in weekly-digest.mjs runDigest). |
| Extending `MODEL_ROUTES` during v4.2 | Fine-tuning routing during live loop operation looks beneficial | `MODEL_ROUTES` is frozen (Object.isFrozen). Changing routing mid-experiment invalidates the A/B comparison. The whole point of the abstention mode is to let data accumulate under a STABLE routing table before declaring a winner. | Run the loop with the current frozen routes. After A/B winner declares (≥20 entries per arm per class), THEN update MODEL_ROUTES in a separate deliberate change. |
| Adding new npm dependencies | Extending capabilities during the operational validation milestone | This would be the fourth consecutive zero-new-npm-deps milestone if held. Supply-chain risk and dependency maintenance cost grow with each addition. | Use Node 22 built-ins. All current v4.2 features (YAML edits, JSON schema extension, shell script) can be built without new packages. |
| Running the fixture-mutator without a `--dry-run` guard | Faster to omit the guard | If the mutator writes without first verifying the case exists in baseline.json, a typo in the case-id creates a silent no-op that looks like a pass but proves nothing. Worse, if the script has a bug in the restore path, it permanently corrupts a golden case. | Require the mutator to validate the case-id exists in baseline.json before mutating, and require `git status --short` to confirm only the expected file is dirty after the mutation. Explicit `--restore` flag to revert. |

---

## Feature Dependencies

```
[Verifier-gate trigger fix]
    └──required-by──> [UAT-47-e re-execution]    (gate must fire for UAT to pass)
    └──required-by──> [UAT-47-a live execution]   (gate run is success evidence)
    └──required-by──> [UAT-47-b execution]        (deps-update-gate likely same bug)

[Ledger-commit refactor]
    └──required-by──> [UAT-47-d live execution]   (workflow must not push to main)
    └──required-by──> [UAT-47-a live execution]   (auto-fix.mjs ledger push must not fail ruleset)

[Ledger schema extension (errorClass + outcome)]
    └──required-by──> [A/B winner exit from abstention]   (filterAttributableEntries drops entries without errorClass)
    └──required-by──> [Promotion observability entry]     (outcome field must exist to write pass/fail)
    └──required-by──> [Meaningful weekly digest metrics]  (cost_per_fix, time_to_merge_p50, fix_rate)
    └──enabled-by──>  [auto-fix-api ledger-leak fix]      (same call sites, fix together)

[Fixture-mutator]
    └──required-by──> [UAT-47-b execution]
    └──enhanced-by──> [Verifier-gate trigger fix]  (mutator injects regression; gate must fire on dep-PR branch)

[Trust/safety hardening (both items)]
    └──prerequisite-for──> [Any live loop run]    (corrupted ledger or bypassed cost cap invalidates all evidence)

[Test 48 fix]
    └──prerequisite-for──> [Any live loop run]    (working-copy mutation during test would corrupt live ledger)
```

### Dependency Notes

- **Verifier-gate trigger fix blocks three UATs:** UAT-47-e, UAT-47-a, UAT-47-b all depend on the gate firing. This is the single most critical unblock. It is a YAML-only change (job-level `if:` instead of `on:`-level `branches:` filter), no logic changes required.

- **Ledger-commit refactor is independent of verifier-gate trigger fix:** Option B (push to `ledger-snapshots/*`, no merge to main) ships independently without waiting for the trigger patch. This is the recommended ordering: ship Option B first, then the trigger patch, then run UATs in sequence.

- **Ledger schema extension has a safe-by-construction constraint:** All additions must be additive-only (Phase 53 D-08 / load-bearing from assertTripleGate byte-unchanged invariant). Adding `errorClass` + `outcome` to appendLedgerEntry call sites is purely additive. The `auto-fix-api` ledger-leak vector (MEMORY.md) must be fixed as part of this work because the same call sites are being touched.

- **Fixture-mutator design constraints (from mutation testing literature and UAT-47-b runbook):** The three non-negotiable primitives are: (1) case-scoped read from `tests/golden/baseline.json`, (2) deterministic transformation given case-id (e.g., citation column +1 or substring replacement of first 20 chars of selectedText), (3) explicit restore path (`git checkout -- tests/golden/baseline.json` or `--restore` flag). The mutator MUST log what it changed to stdout so the UAT evidence file can include the exact mutation applied.

- **UAT sequencing (inherited from 51-CONTEXT.md D-13 pattern):** UAT-47-e first (cheap, ~3 min, $0), UAT-47-a second (~$0.50–$2, ~10 min). If 47-e fails again after the trigger patch, halt and diagnose before spending on 47-a. UAT-47-b and UAT-47-d can run in parallel or after 47-a — they are cheaper and do not require API spend.

---

## MVP Definition

### Phase 56 must ship (v4.2 DoD)

These are the features the downstream requirement-definer must scope as REQUIRED for v4.2 closure.

- [ ] **Verifier-gate trigger fix** — YAML patch, unblocks all three UATs, no logic changes, ~15 min implementation
- [ ] **Ledger-commit refactor (Option B)** — modifies `v40-cost-ledger-snapshot.yml` and `v40-auto-fix.yml` to push to `ledger-snapshots/*` branch; unblocks UAT-47-d and fixes the auto-fix ledger-push structural block
- [ ] **Ledger schema extension** — adds `errorClass` + `outcome`/`pr_merged` to all 9+ appendLedgerEntry call sites; simultaneously fixes the `auto-fix-api` ledger-leak vector (MEMORY.md); unblocks A/B winner from abstention
- [ ] **Fixture-mutator script** — new `tests/e2e/uat-helpers/regression-fixture-mutator.mjs` (prefer .mjs for consistency with existing scripts); case-scoped, idempotent, reversible, logs mutation to stdout; enables UAT-47-b
- [ ] **Trust hardening: Test 48 fix** — fix Vitest test to not mutate working-copy ledger; prerequisite for safe live runs
- [ ] **Trust hardening: `auto-fix-api` ledger-leak** — close the PRE-02 guard gap (fold into ledger schema extension phase since same call sites)
- [ ] **4-UAT re-sweep** — execute UAT-47-e, UAT-47-a, UAT-47-b, UAT-47-d against origin; produce `56-UAT-EVIDENCE.md`; DoD requires at least UAT-47-a PASS as first real production fix
- [ ] **Cleanup: dead `MODEL` const removal** — 2-line deletion in auto-fix.mjs; carry-along from Phase 54
- [ ] **v40-verifier-gate-yaml.test.js V2 update** — finish Phase 51.1's unfinished test update (pre-existing failure noted at Phase 53 + 54 closures)

### After UAT-47-a passes (auto-populate from live data)

These become meaningful automatically once the schema extension lands and UAT-47-a succeeds.

- [ ] **A/B winner activation** — no code change; requires ≥20 live entries per ERROR_CLASS per model arm; track as a metric milestone, not a code deliverable
- [ ] **Weekly digest metrics populated** — `cost_per_fix`, `time_to_merge_p50`, `fix_rate`, `abandonment_rate` all show real values after first merged auto-fix PR; this is the "pipeline operational" signal for future operators

### Defer to v4.3+

- [ ] **`fix_abandoned` outcome field** — useful for observability but not needed for DoD; add when abandonment rate becomes a meaningful operational concern
- [ ] **A/B winner routing table update** — only after abstention ends and the data actually points to a winner; not a v4.2 task
- [ ] **Fork-based UAT environment** — the operator deferred this in Phase 51 (D-01 accepted canonical-repo risk); revisit if UAT-47-a causes issues on canonical

---

## Feature Prioritization Matrix

| Feature | Operator Value | Implementation Cost | Priority |
|---------|----------------|---------------------|----------|
| Verifier-gate trigger fix | HIGH (unblocks 3 UATs) | LOW (YAML edit only) | P1 |
| Ledger schema extension + leak fix | HIGH (unblocks A/B winner + dashboard) | MEDIUM (9+ call sites, additive) | P1 |
| Test 48 fix | HIGH (safety prerequisite for live runs) | LOW (test isolation) | P1 |
| Ledger-commit refactor (Option B) | HIGH (unblocks UAT-47-d + auto-fix ledger push) | MEDIUM (2 YAML files + digest aggregation) | P1 |
| Fixture-mutator | HIGH (enables UAT-47-b, deterministic DoD) | MEDIUM (new script with safety guards) | P1 |
| 4-UAT re-sweep (including UAT-47-a) | HIGH (DoD evidence) | MEDIUM (operator time + API spend) | P1 |
| Dead MODEL const removal | LOW (cleanup) | LOW (2 lines) | P2 |
| verifier-gate-yaml test V2 update | LOW (pre-existing failure, non-blocking) | LOW (test update) | P2 |
| Promotion observability entry | MEDIUM (closes ledger audit trail) | LOW (2–3 lines in promote path) | P2 |
| A/B winner routing update | LOW (data not available yet) | LOW (when data arrives) | P3 |
| `fix_abandoned` outcome field | LOW (monitoring enhancement) | LOW | P3 |

---

## What "Operational" Means for Each UAT

These are not CI tests — they are live operational tests against origin. The distinction matters for evidence shape.

| UAT | Operational Signal | Evidence Shape | Confirms |
|-----|--------------------|----------------|---------|
| UAT-47-e | `diff-guard` check appears on PR and shows FAILURE; `human-review-required` label applied | `gh pr checks`, `gh pr view --json labels,comments` captured to JSON files | Verifier-gate trigger patch worked; diff-guard fires on `auto-fix/*` PRs into main |
| UAT-47-a | Draft PR opens on `auto-fix/3-139f821b`; verifier-gate run exists (3× affected case + 76-case regression + diff-guard); ledger entry written with `errorClass` + (after merge) `outcome` | `gh pr list`, `gh pr view --json body`, `gh run list --workflow=v40-verifier-gate.yml`, ledger JSON diff | Full loop fires end-to-end; ledger schema extension is wired; first real production fix candidate |
| UAT-47-b | `deps-update-gate` check shows FAILURE after regression push onto dep-PR branch | `gh pr checks --json bucket,name,state` showing `deps-update-gate` with `bucket: fail` | Deps-update workflow trigger not affected by same BASE/HEAD bug; fixture-mutator produces a regression the gate catches |
| UAT-47-d | `ledger-snapshots/YYYY-MM-DD` branch exists on origin; branch contains updated `.llm-spend-ledger.json`; NO new commit on `main` | `git ls-remote origin 'ledger-snapshots/*'`, `git show refs/remotes/origin/ledger-snapshots/...` | Ledger-commit refactor is live and working; daily snapshot workflow no longer blocked by ruleset |

The difference between these and CI tests: CI tests run on every push and can be faked with synthetic fixtures. These UATs exercise LIVE GitHub API interactions, real workflow triggers, real ledger file mutations, and real API spend. Evidence is captured as JSON files and committed, not asserted by Vitest.

---

## Phase Sequencing Recommendations

The roadmap author should sequence phases as follows, based on the dependency graph above:

**Wave 0 (unblocking infrastructure — must ship before any UAT):**
- Verifier-gate trigger fix (YAML patch)
- Ledger-commit refactor (Option B)
- Ledger schema extension + `auto-fix-api` leak fix + Test 48 fix (these touch the same call sites; ship together)
- Cleanup: dead MODEL const + verifier-gate-yaml V2 test update (carry-alongs, bundle into Wave 0)

**Wave 1 (fixture-mutator — enables UAT-47-b):**
- `regression-fixture-mutator.mjs` authoring + tests

**Wave 2 (UAT re-sweep — against origin, requires Wave 0 shipped):**
- UAT-47-e first (cheap smoke test of trigger fix, ~3 min)
- UAT-47-d (ledger-snapshot confirm, ~5 min)
- UAT-47-a (full end-to-end, ~$0.50–$2 + 10 min; DoD evidence)
- UAT-47-b (dep-PR synthetic regression; requires fixture-mutator from Wave 1)

These can compress to 2 phases (infrastructure + UAT sweep) or expand to 4 if the changes need granular separation. The constraint is Wave 0 must be pushed to origin before Wave 2 can execute.

---

## Sources

- `/home/fatduck/patent-cite-tool/.planning/milestones/v4.1-phases/51-live-readiness-uats/51-UAT-EVIDENCE.md` — UAT outcomes, deviation #2 (trigger bug), sharper runbooks for Phase 56
- `/home/fatduck/patent-cite-tool/.planning/milestones/v4.1-phases/51-live-readiness-uats/51-CONTEXT.md` — sequencing decisions (D-13), deferral reasoning
- `/home/fatduck/patent-cite-tool/.planning/milestones/v4.0-phases/47-v4-0-cleanup/47-UAT-DEFERRED.md` — original runbook stubs
- `/home/fatduck/patent-cite-tool/.planning/STATE.md` — Phase 54 closure note (exact wiring spec for ledger schema), Phase 55 closure (dashboard metrics), Pending Todos
- `/home/fatduck/patent-cite-tool/.planning/PROJECT.md` — Key Decisions table, trust invariants
- `/home/fatduck/patent-cite-tool/scripts/a-b-winner.mjs` — abstention mode design, PHASE_56_TODO annotations, forward-compat outcome probe
- `/home/fatduck/patent-cite-tool/scripts/weekly-digest.mjs` — existing metrics, SUMMARY_KEYS contract, injected-deps hook pattern
- `/home/fatduck/patent-cite-tool/tests/e2e/lib/triage-classifier.js` — FLAKE 5-state machine, classifyRerunOutcomes, ring buffer semantics
- MEMORY.md — `auto-fix-api` ledger-leak vector documentation
- Stryker Mutator (https://stryker-mutator.io/docs/) — mutation operator determinism principles
- GoldenTransformer fault injection framework (https://arxiv.org/html/2509.10790v1) — reversible fault injection via reversion method
- Braintrust LLM monitoring (https://www.braintrust.dev/articles/what-is-llm-monitoring) — cost attribution, quality metrics in CI/CD

---
*Feature research for: v4.2 Auto-Fix Loop Live*
*Researched: 2026-06-04*

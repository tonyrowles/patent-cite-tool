# Project Research Summary

**Project:** patent-cite-tool — v4.2 Auto-Fix Loop Live
**Domain:** LLM-CI pipeline operational validation — activating a wired-but-unexercised auto-fix loop on a live production repo
**Researched:** 2026-06-04
**Confidence:** HIGH (all research grounded in direct codebase inspection; zero speculative external sources for v4.2 new work)

---

## Executive Summary

v4.2 is not a greenfield build: the auto-fix pipeline (v40-auto-fix.yml, verifier-gate, auto-promote, FLAKE classifier, cost ledger, A/B routing, weekly digest) is fully wired and shipped on origin/main as of v4.1. The sole milestone objective is to take it from "wired but unexercised" to "operationally validated with at least one fix shipped through the loop end-to-end." Every v4.2 work item is an enabling repair, a schema wiring, or a live UAT execution — nothing is net-new architecture.

The four blocking repairs that must land before any live UAT is meaningful are: (1) the ledger-commit refactor (v40-cost-ledger-snapshot.yml pushes directly to main, which Phase 50's ruleset blocks), (2) the ledger schema extension (appendLedgerEntry call sites in auto-fix.mjs lack the errorClass and outcome fields that a-b-winner.mjs requires to exit abstention), (3) the ledger-leak guard (7 direct appendLedgerEntry calls in auto-fix.mjs bypass the PRE-02 guard, creating a committed-ledger pollution risk on local test runs), and (4) the fixture-mutator (without a deterministic defect-injection script the proof-of-life UAT depends on waiting for a real production anomaly, which is non-deterministic). The 4-UAT re-sweep (UAT-47-a, 47-b, 47-d, 47-e) constitutes the DoD evidence and can only run after these repairs land on origin/main.

The dominant technical risk is implementation-scope confusion: two cross-document tensions exist that, if resolved incorrectly, produce permanent pipeline damage. First, the ledger-commit refactor must apply ONLY to v40-cost-ledger-snapshot.yml — applying the same branch-redirect to v40-auto-fix.yml destroys the two-commit split that keeps ledger diffs off auto-fix PRs, permanently blocking every future auto-fix PR via diff-guard (Pitfall 1, LOAD-BEARING). Second, the ledger-leak guard must NOT be placed inside appendLedgerEntry itself — that placement breaks all 33 existing Vitest ledger tests (Pitfall 7, LOAD-BEARING). Both are "looks correct, is catastrophic" traps that require explicit scope-lock language in requirements.

---

## Resolved Cross-Document Tensions

The following conflicts were identified across research files and are resolved here. Requirements must use these resolutions as authoritative.

### Tension 1: Ledger-commit refactor scope (STACK vs PITFALLS)

**Conflict:** STACK.md recommended refactoring BOTH v40-cost-ledger-snapshot.yml AND v40-auto-fix.yml to the ledger-snapshots/* branch redirect. PITFALLS.md (Pitfall 1) identified this as catastrophic.

**Resolution: PITFALLS wins. Refactor scope is locked to v40-cost-ledger-snapshot.yml ONLY.**

Rationale: v40-auto-fix.yml's direct-to-main ledger commit is architecturally load-bearing — it exists specifically to land the ledger entry on main BEFORE the auto-fix PR branch is created, so that the PR diff contains only source-code changes. If the ledger commit is redirected to a side branch, the ledger entry appears in the auto-fix PR diff, which is in FORBIDDEN_PATHS regex bank entry 5, causing the diff-guard to permanently reject all future auto-fix PRs.

Verification gate: After the refactor commit, `grep -c 'git push origin main' .github/workflows/v40-auto-fix.yml` must equal 1.

### Tension 2: Verifier-gate trigger fix (FEATURES says unresolved, Phase 51.1 says closed)

**Conflict:** FEATURES.md listed the verifier-gate trigger fix as the highest-leverage unblock for v4.2. STATE.md and the Phase 51.1 closure note reference commit ea45a47 as having closed REGRESSION-51-01.

**Resolution: The trigger fix is ALREADY SHIPPED. FEATURES.md treated this as unresolved in error.**

Evidence: The live .github/workflows/v40-verifier-gate.yml contains NO pull_request.branches: filter at the on: level. All four jobs contain a "Scope decision (auto-fix/* PRs only; fast-path SUCCESS otherwise)" step using `if [[ "${{ github.head_ref }}" == auto-fix/* ]]`. This is exactly the Phase 51.1 fix (commit ea45a47). The file was reviewed directly; the fix is confirmed present.

Implication: "Verifier-gate trigger fix" is NOT in v4.2 scope. Remove from all requirements. The v40-verifier-gate-yaml.test.js V2 update (Phase 51.1's unfinished test update, pre-existing npm test failure) IS still in scope as a Phase 60 carry-along item.

### Tension 3: Ledger-leak guard placement (STACK + PITFALLS + ARCHITECTURE partially disagree)

**Conflict:** ARCHITECTURE proposed adding the guard inside appendLedgerEntry itself. PITFALLS (Pitfall 7) identified this as breaking 33 existing Vitest tests. STACK recommended the E2E_LEDGER_PATH_OVERRIDE test-setup pattern.

**Resolution: Guard must NOT be added to appendLedgerEntry body. Guard goes at call-site scope in auto-fix.mjs via a safeAppendLedger wrapper function.**

The fix: add a `safeAppendLedger(entry)` helper inside auto-fix.mjs that (a) checks `CI || E2E_LEDGER_PATH_OVERRIDE` and throws if neither is set, then (b) calls `appendLedgerEntry(LEDGER_PATH, entry)`. All 7 direct call sites in auto-fix.mjs are replaced with `safeAppendLedger(entry)`. appendLedgerEntry body is untouched. All 33 existing llm-ledger tests continue to pass because they pass tmp paths directly to appendLedgerEntry.

Verification gate: After the hardening commit, `npm test` must show zero new failures in tests/unit/llm-ledger.test.js.

### Tension 4: Call-site count (STATE.md says 9+2, ARCHITECTURE says 7+3+2=12)

**Resolution: Use ARCHITECTURE's verified count as canonical. Total: 12 call sites.**

- 7 in scripts/auto-fix.mjs (lines ~295, ~391, ~546, ~589, ~685, ~707, ~744)
- 3 in tests/e2e/lib/llm-driver.js (invokeAnthropicSdkWithLedger: lines ~421, ~588, ~620)
- 2 in tests/e2e/scripts/e2e-explore.mjs

For v4.2 schema wiring (errorClass field): wire errorClass into the 7 auto-fix.mjs sites only. The 3 llm-driver.js sites are transport-level (no ERROR_CLASS concept at that layer). The 2 e2e-explore.mjs sites are subscription/exploratory mode. STATE.md's "9+2" figure omitted the e2e-explore.mjs pair from its count.

### Tension 5: Outcome write pattern

**Resolution: Event-sourced new entry (source: 'auto-fix-promoted') — NOT an update to the existing auto-fix entry.**

appendLedgerEntry is append-only (JSONL corpus, no update primitive). Writing a follow-up entry `{source: 'auto-fix-promoted', outcome: 'pass', fingerprint, issueId, prNumber}` on promotion success (and `{source: 'auto-fix-failed', outcome: 'fail'}` on label-flap failure) is structurally consistent with the existing append-only contract. a-b-winner.mjs's detectOutcome() already probes `entry.outcome === 'pass'|'fail'` — no code changes to a-b-winner.mjs needed once entries populate.

---

## Key Findings

### Recommended Stack

All v4.2 work uses zero new npm dependencies — the fourth consecutive milestone to hold this target. No version upgrades warranted: @anthropic-ai/sdk@0.100.1 is pinned at current latest (supply-chain hardening is load-bearing); peter-evans/create-pull-request@v8 is at current major; @playwright/test@1.60.0 is current stable. vitest is behind major (3.x vs 4.x) but no upgrade is needed for v4.2's new tests.

**Core technologies (v4.2 new work only):**
- git CLI (branch redirect): `ledger-snapshots/daily-YYYY-MM-DD` branch push in v40-cost-ledger-snapshot.yml — pure git CLI, no new actions
- appendLedgerEntry (schema extension): spread-entry pattern already handles arbitrary fields verbatim; no function-body changes needed, only call-site additions at 7 auto-fix.mjs sites
- Node 22 built-ins (fs, path, child_process): fixture-mutator script — zero-dep, matches pattern of verify-single-case.mjs and check-deps-and-pr.mjs
- safeAppendLedger wrapper (leak guard): enforces CI/E2E_LEDGER_PATH_OVERRIDE at auto-fix.mjs scope; E2E_LEDGER_PATH_OVERRIDE mechanism already built into llm-ledger.js
- peter-evans/create-pull-request@v8: no new usage for v4.2; ledger-snapshots/* branch approach avoids per-snapshot PRs entirely

### Expected Features

**Must have (table stakes — DoD blockers):**
- Ledger-commit refactor (v40-cost-ledger-snapshot.yml ONLY) — daily snapshot cron fails at `git push origin main` every day under Phase 50 ruleset
- Ledger schema extension (errorClass at 7 auto-fix.mjs call sites; outcome event-sourced entry in auto-fix-promote.mjs) — a-b-winner.mjs stays in abstention forever without these; dashboard metrics stay n/a
- Ledger-leak guard (safeAppendLedger wrapper in auto-fix.mjs scope) — local npm test can pollute committed ledger; PRE-02 cost-cap enforcement bypassable without this
- Test 48 fix (relax "exactly 1 bootstrap entry" to "at least 1 with phase='39-bootstrap'" in llm-ledger.test.js) — npm test fails after any live auto-fix run without this
- Fixture-mutator (tests/e2e/scripts/inject-defect.mjs) — creates synthetic GitHub issue; does NOT touch FORBIDDEN_PATHS; fingerprint pre-flight + quarantine auto-promotion suppression required
- 4-UAT re-sweep: UAT-47-e (~3 min, $0), UAT-47-d (~5 min), UAT-47-a (~$0.50-2, 10 min), UAT-47-b (after mutator); produces 56-UAT-EVIDENCE.md

**Should have (differentiators — automatic once schema lands):**
- A/B winner exit from abstention — forward-compat probe already ships; no new code needed; data accumulation drives it
- Weekly digest metrics populated — cost_per_fix, time_to_merge_p50, fix_rate become non-n/a after first merged auto-fix PR
- Promotion observability (auto-fix-promoted ledger entry) — 2-3 lines in auto-fix-promote.mjs; closes audit trail loop

**Defer to v4.3+:**
- fix_abandoned outcome field — monitoring enhancement; not needed for DoD
- A/B winner routing table update — only after abstention ends with sufficient data
- Fork-based UAT environment — operator deferred (Phase 51 D-01)

**Anti-features (do NOT implement — load-bearing invariants from v4.0/v4.1):**
- Auto-merge auto-fix PRs (Phase 53 D-18 — destroys human-gated trust invariant)
- Direct-to-main auto-promote (v40-auto-promote.yml must open a SEPARATE follow-up PR)
- Widening assertTripleGate (Phase 53 byte-unchanged invariant)
- Re-adding bypass_actors to ruleset 17086676
- New npm dependencies (zero new deps target)
- MODEL_ROUTES changes during v4.2 (frozen table; running A/B experiment)

### Architecture Approach

v4.2 inserts four change points into the existing four-layer architecture (Triggers → Scripts → Library → Data). The data layer gains two optional fields on iterations[] entries (additive only, no breaking change to appendLedgerEntry or any consumer). The scripts layer gains one new file (inject-defect.mjs) and two modified files (auto-fix.mjs call-site wiring + auto-fix-promote.mjs outcome entry). The library layer gains a safeAppendLedger wrapper at auto-fix.mjs scope. The trigger layer gains one workflow modification (v40-cost-ledger-snapshot.yml branch redirect only; v40-auto-fix.yml ledger-commit step is explicitly NOT touched).

**Major components and v4.2 changes:**
1. v40-cost-ledger-snapshot.yml — MODIFIED: `git push origin main` becomes `git push origin HEAD:ledger-snapshots/daily-${{ env.SNAPSHOT_DATE }}`; concurrency group prevents same-day races
2. scripts/auto-fix.mjs — MODIFIED: 7 appendLedgerEntry call sites gain errorClass field and are replaced with safeAppendLedger(); dead MODEL const removed (Phase 54 carry-along)
3. scripts/auto-fix-promote.mjs — MODIFIED: IMPORTS POLICY narrowed to allow llm-ledger.js; appendLedgerEntry import added; event-sourced outcome entry written on promotion success/failure
4. tests/e2e/lib/llm-ledger.js — MODIFIED: Test 48 assertion relaxed; appendLedgerEntry body UNCHANGED
5. tests/e2e/scripts/inject-defect.mjs — NEW: synthetic GitHub issue creator (gh issue create); pre-flight fingerprint collision check; quarantine source-tag for auto-promotion suppression; does NOT touch any FORBIDDEN_PATHS file
6. scripts/a-b-winner.mjs — NO CODE CHANGES: exits abstention automatically once errorClass + outcome populate in ledger; detectOutcome() forward-compat probe already present

**Key constraint — defense-in-depth layers:** safeAppendLedger (Phase 56, guards direct auto-fix.mjs writes) and the Phase 48 PRE-02 guard in invokeAnthropicSdkWithLedger (guards SDK-path writes) are complementary, not redundant. Both must coexist.

**Race condition analysis (resolved):** auto-fix ledger branches use `ledger-snapshots/auto-fix-issue-<N>-<timestamp>` (unique per run); snapshot cron uses `ledger-snapshots/daily-<YYYY-MM-DD>` (at most one per day). Existing disjoint concurrency groups prevent races.

**FORBIDDEN_PATHS impact:** The ledger-commit branch redirect does NOT change the diff-guard's FORBIDDEN_PATHS bank. The ledger file lands on a separate branch (ledger-snapshots/*), never in the auto-fix source-code branch. Auto-fix PR diffs remain clean.

### Critical Pitfalls

1. **Ledger-commit refactor applied to v40-auto-fix.yml (Pitfall 1, LOAD-BEARING)** — Redirecting the auto-fix workflow's ledger commit to ledger-snapshots/* causes the ledger entry to appear in the auto-fix PR diff, which FORBIDDEN_PATHS regex 5 rejects permanently. Every future auto-fix PR is blocked. Prevention: refactor scope explicitly excludes v40-auto-fix.yml; `grep -c 'git push origin main' .github/workflows/v40-auto-fix.yml` must equal 1 after the commit.

2. **Leak-vector guard added to appendLedgerEntry body (Pitfall 7, LOAD-BEARING)** — A guard in the function body fires on all 33 existing Vitest ledger tests that use tmp paths locally without CI=true. Prevention: guard lives in safeAppendLedger wrapper in auto-fix.mjs scope only; npm test must pass all 33 llm-ledger tests after the hardening commit.

3. **Fixture-mutator targets FORBIDDEN_PATHS (Pitfall 5, LOAD-BEARING)** — Mutating tests/fixtures/, tests/golden/baseline.json, or tests/test-cases.js means no auto-fix LLM can propose a fix that passes diff-guard. The loop can never complete. Prevention: mutator creates a synthetic GitHub issue (gh issue create) without touching any fixture file in the working tree.

4. **errorClass wiring omits some of the 7 auto-fix.mjs call sites (Pitfall 3)** — Tests pass because makeEntry() constructs entries with errorClass; a-b-winner.mjs stays in permanent abstention. Prevention: integration test that invokes runDispatcher() in mocked mode and reads the emitted ledger entry to assert errorClass is present; `grep -c 'errorClass' scripts/auto-fix.mjs` must equal at least 7.

5. **Synthetic quarantine entry auto-promotes before loop proof is captured (Pitfall 8)** — After synthetic fix merges, nightly cron increments stable_runs; at >=3, quarantine:ready-for-promotion fires. Prevention: mutator adds `source: 'fixture-mutator-uat-47b'` to quarantine entry; quarantine-append.mjs suppresses auto-promotion for this source pattern in the same commit as inject-defect.mjs.

---

## Implications for Roadmap

Converged phase structure from FEATURES Wave 0/1/2 proposal and ARCHITECTURE Phase 56-60 proposal. Recommended: 5 phases (Phase 56 through Phase 60).

**Critical path:** Phase 56 (schema + leak guard) -> Phase 57 (branch redirect) -> Phase 58 (promote outcome entry) -> Phase 59 (fixture-mutator + 4-UAT sweep) -> Phase 60 (cleanup)

**Parallelization:** Phase 56 and Phase 57 touch disjoint files and can ship in either order. Phase 56 is recommended first so UAT-47-a (Phase 59) populates errorClass from the first live run.

### Phase 56: Schema Extension + Leak Guard

**Rationale:** Both items touch auto-fix.mjs call sites and llm-ledger.js — bundle to avoid double-touching files. Schema extension must precede UAT-47-a so first live auto-fix run writes errorClass from day one. Leak guard must land before any live CI auto-fix run to prevent committed-ledger pollution.

**Delivers:** errorClass field wired into 7 auto-fix.mjs call sites; safeAppendLedger wrapper enforcing CI/override guard at auto-fix.mjs scope; Test 48 assertion relaxed; new Vitest tests for guard behavior and errorClass round-trip.

**Addresses:** Ledger schema extension (P1), ledger-leak hardening (P1), Test 48 fix (P1)

**Avoids:** Pitfall 3 (partial wiring must be caught by integration test), Pitfall 7 (guard must NOT go into appendLedgerEntry body)

**Parallelizable with Phase 57:** yes (disjoint files). Recommended first.

**Research flag:** Well-documented pattern — no research-phase needed. All 7 call sites inventoried; E2E_LEDGER_PATH_OVERRIDE mechanism proven in existing codebase.

### Phase 57: Ledger-Commit Branch Redirect

**Rationale:** v40-cost-ledger-snapshot.yml's daily push to main fails every day under Phase 50 ruleset. Scope lock to snapshot workflow ONLY is the critical constraint. Also requires adding a scope-decision step to the diff-guard job so ledger-snapshot PRs fast-path to SUCCESS (not FORBIDDEN_PATHS rejection).

**Delivers:** v40-cost-ledger-snapshot.yml pushes to `ledger-snapshots/daily-YYYY-MM-DD`; v40-verifier-gate.yml diff-guard job gains scope guard for non-auto-fix PRs; S13 Vitest YAML contract test updated; UAT-47-d can run immediately after merge to origin/main.

**Addresses:** Ledger-commit refactor (P1), UAT-47-d unblock

**Avoids:** Pitfall 1 (auto-fix two-commit split preserved; v40-auto-fix.yml explicitly excluded), Pitfall 2 (diff-guard scope guard added for ledger-snapshot PRs)

**Parallelizable with Phase 56:** yes (disjoint files). Can ship in either order.

**Research flag:** Well-documented git CLI pattern — no research-phase needed. Only subtlety is the diff-guard scope-decision step, which follows the existing pattern already in verifier-gate and regression-suite jobs from Phase 51.1.

### Phase 58: auto-fix-promote.mjs Outcome Ledger Entry

**Rationale:** Depends on Phase 57's branch-redirect pattern (the promote workflow's new ledger step uses ledger-snapshots/* target). Requires Phase 56's safeAppendLedger (new appendLedgerEntry calls in promote path should go through the guard). IMPORTS POLICY narrowing in auto-fix-promote.mjs must update the existing grep-based Vitest assertion in the same commit.

**Delivers:** IMPORTS POLICY narrowed for llm-ledger.js in auto-fix-promote.mjs; event-sourced outcome ledger entry (source: 'auto-fix-promoted') on promotion success/failure; v40-auto-promote.yml gains a ledger-snapshot commit step; Vitest coverage for outcome entry shape.

**Addresses:** Promotion observability (P2), outcome field enabling a-b-winner abstention exit

**Avoids:** IMPORTS POLICY silent violation (must explicitly narrow, not silently break)

**Research flag:** Planning must explicitly identify the grep-based Vitest assertion in tests/unit/auto-fix-promote-gate.test.js and confirm the new llm-ledger.js import does not trigger the existing assertion unexpectedly.

### Phase 59: Fixture-Mutator + 4-UAT Re-Sweep

**Rationale:** Depends on Phases 56+57 live on origin/main. UAT sequencing follows D-13 pattern: UAT-47-e first (~3 min, $0 — verifier-gate diff-guard smoke test), UAT-47-d second (~5 min — ledger-snapshot confirm), UAT-47-a third (~$0.50-2, 10 min — full loop, primary DoD evidence), UAT-47-b last (requires fixture-mutator). Halt after UAT-47-e if it fails; diagnose before spending API budget on UAT-47-a.

**Delivers:** tests/e2e/scripts/inject-defect.mjs — synthetic GitHub issue creator (gh issue create), fingerprint pre-flight check, quarantine auto-promotion suppression; 56-UAT-EVIDENCE.md with PASS/FAIL evidence for all 4 UATs; DoD evidence (UAT-47-a PASS = first production fix or fixture-mutator proof-of-life through full loop).

**Addresses:** Fixture-mutator (P1), UAT-47-a (P1), UAT-47-b (P1), UAT-47-d (P1), UAT-47-e (P1)

**Avoids:** Pitfall 5 (synthetic issue approach avoids FORBIDDEN_PATHS entirely), Pitfall 6 (fingerprint pre-flight via gh issue list), Pitfall 8 (quarantine source-tag suppression), Pitfall 9 (operator intervention prohibition in runbook — only human action is merging the auto-fix:verified PR), Pitfall 10 (UAT evidence tagging + post-UAT cleanup steps), Pitfall 11 (UAT-47-d runbook waits for ledger-snapshot PR merge before asserting ledger state)

**Research flag:** Planning must cross-reference the fingerprint format in issue-payload-builder.js to confirm the synthetic issue body matches what auto-fix.mjs expects for fingerprint parsing and auto-fix triggering. The quarantine-append.mjs source-suppression and inject-defect.mjs source-tag must be co-designed (two-file coordination).

### Phase 60: Carry-Along Cleanup

**Rationale:** Self-contained, low-risk, independent. Bundling prevents further deferral of Phase 54 and Phase 51.1 outstanding items.

**Delivers:** Dead MODEL const removed from scripts/auto-fix.mjs (Phase 54 carry-along, 2-line deletion); v40-verifier-gate-yaml.test.js V2 update finished (Phase 51.1 unfinished test, pre-existing npm test failure); milestone closure artifacts.

**Addresses:** Dead code cleanup (P2), verifier-gate-yaml test V2 (P2)

**Research flag:** No research needed. Standard cleanup patterns.

### Phase Ordering Rationale

- Phase 56 before Phase 59: schema extension must be live so the first live UAT-47-a run populates errorClass from day one; running UAT before schema means live production ledger entries permanently lack the A/B fields needed for winner determination
- Phase 57 before Phase 59: branch redirect must be live on origin/main before UAT-47-a triggers an auto-fix run (cost-ledger-snapshot redirect unblocks UAT-47-d; auto-fix.mjs's direct ledger commit to main IS preserved per Tension 1 resolution)
- Phase 58 after Phase 57: the promote outcome entry's v40-auto-promote.yml ledger step mirrors the branch-redirect pattern established in Phase 57; building it after avoids designing the pattern twice
- Phase 60 last: carry-along items have no blockers; do not create noise in critical phases

### Research Flags

Phases needing explicit planning attention (not additional research-phase, but specific cross-reference required):
- **Phase 59 (inject-defect.mjs fingerprint format):** Cross-reference issue-payload-builder.js fingerprint parsing during planning. Confirm that gh issue create body format matches what auto-fix.mjs expects for dedup and auto-fix triggering.
- **Phase 58 (IMPORTS POLICY grep assertion):** Read the exact grep pattern in tests/unit/auto-fix-promote-gate.test.js during planning. Confirm the new llm-ledger.js import does not trigger the existing assertion unexpectedly.
- **Phase 59 (quarantine suppression two-file coordination):** inject-defect.mjs source tag and quarantine-append.mjs suppression check must use identical strings. Co-design in Phase 59 planning.

Phases with well-documented patterns (skip research-phase):
- **Phase 56:** All 7 call sites inventoried; E2E_LEDGER_PATH_OVERRIDE mechanism proven; additive-only constraint well-understood.
- **Phase 57:** Pure git CLI + existing scope-decision step pattern; scope constraint is the only risk and addressed by grep-count verification gate.
- **Phase 60:** 2-line deletion + YAML test update; no research needed.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Version checks against live npm registry confirmed; zero new deps achievable by prior art in 3 existing zero-dep scripts |
| Features | HIGH | Grounded in direct inspection of a-b-winner.mjs, weekly-digest.mjs, auto-fix.mjs, and 51-UAT-EVIDENCE.md; abstention mode design verified from source code |
| Architecture | HIGH | Call sites verified by direct code reading; race condition analysis grounded in actual concurrency group names in YAML files; IMPORTS POLICY constraints verified from source |
| Pitfalls | HIGH | Pitfalls 1-7 grounded in direct code inspection of specific files and line numbers cited; Pitfalls 8-11 grounded in quarantine-append.mjs logic and Phase 51 UAT evidence |

**Overall confidence:** HIGH

### Gaps to Address During Planning

- **inject-defect.mjs fingerprint format:** The exact format that auto-fix.mjs expects in the issue body must be traced through issue-payload-builder.js during Phase 59 planning. Research did not trace the full parsing path for synthetic vs. real issues.

- **auto-fix-promote.mjs IMPORTS POLICY grep test:** The exact grep pattern in tests/unit/auto-fix-promote-gate.test.js must be read during Phase 58 planning. Phase 53 closure notes this test exists but does not quote its grep pattern.

- **UAT-47-b quarantine suppression two-file coordination:** The mutator's `source: 'fixture-mutator-uat-47b'` field and quarantine-append.mjs's suppression logic must be co-designed in Phase 59 planning to ensure string matching.

- **v40-auto-fix.yml ledger-commit step line numbers:** PITFALLS.md cites lines 150-172. Verify against live file during Phase 57 planning to confirm the scope constraint excludes the right step.

---

## Sources

### Primary (HIGH confidence — direct codebase inspection)

- `scripts/auto-fix.mjs` — 7 appendLedgerEntry call sites (lines ~295, ~391, ~546, ~589, ~685, ~707, ~744); errorClass availability at each site
- `tests/e2e/lib/llm-ledger.js` — appendLedgerEntry implementation; E2E_LEDGER_PATH_OVERRIDE at module load time; Test 48 failure root cause
- `tests/e2e/lib/llm-driver.js` — invokeAnthropicSdkWithLedger; 3 call sites (lines ~421, ~588, ~620); Phase 48 PRE-02 guard scope
- `.github/workflows/v40-verifier-gate.yml` — LIVE FILE VERIFIED: no pull_request.branches: filter at on: level; scope-decision fast-path step present in all 4 jobs; Phase 51.1 trigger fix confirmed shipped (commit ea45a47)
- `.github/workflows/v40-cost-ledger-snapshot.yml` — direct git push origin main confirmed; contents: write permission confirmed
- `.github/workflows/v40-auto-fix.yml` — two-commit split architecture confirmed; ledger-commit step at lines ~150-172
- `scripts/auto-fix-promote.mjs` — IMPORTS POLICY; assertTripleGate body; zero appendLedgerEntry calls confirmed
- `scripts/a-b-winner.mjs` — PHASE_56_TODO markers; detectOutcome() probe; abstention mode; NO_WINNER_YET output
- `scripts/check-diff-guard.mjs` — FORBIDDEN_PATHS bank (8 entries); ledger path at entry 5
- `.planning/milestones/v4.1-phases/51-live-readiness-uats/51-UAT-EVIDENCE.md` — UAT-47-e FAIL (trigger bug in Phase 51); D-13 AUTO-DEFER; BLOCKED-BY-PHASE-50 confirmation; Phase 56 follow-up scope
- `.planning/STATE.md` — Phase 51.1 closure (ea45a47 + REGRESSION-51-01); Phase 53-55 closures; Pending Todos ledger schema wiring spec
- `.planning/PROJECT.md` — Key Decisions table; v4.2 milestone target features; trust invariants

### Secondary (MEDIUM confidence — external validation)

- npm registry (WebSearch 2026-06-04): @anthropic-ai/sdk@0.100.1 confirmed current latest
- Context7 /anthropics/anthropic-sdk-typescript: 0.100.0/0.100.1 changelog confirmed
- Context7 /peter-evans/create-pull-request: v8.0.0 current confirmed
- WebSearch: playwright 1.60.0 current stable; vitest 3.x vs 4.x status; pdfjs-dist 5.7.284 latest vs 5.5.207 pinned

### Tertiary (LOW confidence — framework references only)

- Stryker Mutator docs — confirmed mutation testing is wrong abstraction for data fixture mutation (code AST vs JSON field replacement)
- Braintrust LLM monitoring — cost attribution patterns (informational; existing implementation diverges from generic patterns)

---
*Research completed: 2026-06-04*
*Ready for roadmap: yes*

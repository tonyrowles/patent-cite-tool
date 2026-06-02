# Phase 47 — Plan Check Report

**Checked:** 2026-06-01
**Phase:** 47 — v4.0 Cleanup
**Plans verified:** 4 (47-01, 47-02, 47-03, 47-04)
**Requirements:** CLEANUP-01, CLEANUP-02, CLEANUP-03, CLEANUP-04
**Success Criteria:** 4 (per ROADMAP §"### Phase 47")
**Verdict:** **APPROVED** (with 2 minor advisories, no blockers)

---

## Goal-Backward Matrix

| ROADMAP Success Criterion | Owning Plan | Owning Task(s) | Concrete Deliverable | Pass |
|---------------------------|-------------|----------------|----------------------|------|
| SC1: Integration audit verifies 5 v3.1→v4.0 touchpoints + fragility warnings resolved as atomic INT-FIX-* commits | 47-01 | Task 1 (TP-01..TP-05 in `tests/unit/v4-touchpoints.test.js`) + Tasks 2/3/4 (INT-FIX-LEDGER/CAL/LOCK atomic commits) | 15 it() blocks pinning all 5 ARCHITECTURE §4 contracts; 3 atomic `fix(47-cleanup): INT-FIX-<TAG>` commits with root-cause documented bodies | ✅ |
| SC2: Nyquist coverage stamped on v4.0 phases + static-grep tests pin validated contracts | 47-02 (stamping) + 47-01 (static-grep) + 47-04 (CODEOWNERS grep) | 47-02 Tasks 2-9 (8 `Skill(gsd-validate-phase, N)` invocations); 47-01 Task 1 (touchpoint static-greps); 47-04 Task 1 (CODEOWNERS static-grep) | 8 new `*-VALIDATION.md` files stamped; touchpoint + package-lock + CODEOWNERS vitest tests all GREEN | ✅ |
| SC3: Live HUMAN-UAT confirmations for 5 scenarios (a)-(e) | 47-03 | Task 2 (UAT-47-c live) + Task 3 (4 DEFERRED runbook stubs) + Task 4 (vitest stub-presence guard) | UAT-47-c PASS/FAIL captured in `47-UAT-EVIDENCE.md`; `47-UAT-DEFERRED.md` with 4 stubs × 4 fields; `tests/unit/uat-deferred-runbook.test.js` pins structure | ✅ (per CONTEXT.md (a)(b)(d)(e) DEFERRED requires-push is locked scope) |
| SC4: allow_auto_merge=false + bypass=ON + required-status-checks includes verifier-gate + CODEOWNERS pinned by static-grep test | 47-04 | Task 1 (CODEOWNERS pinned vitest) + Task 2 (live gh api audit + conditional ruleset PATCH) + Task 3 (audit YAML records evidence) | `tests/unit/codeowners-pinned.test.js` with ≥9 assertions; gh api evidence at `/tmp/47-04-ruleset-summary.json`; `branch_protection:` block in `.planning/v4.0-MILESTONE-AUDIT.md` | ✅ |

**All 4 success criteria have explicit owning plan(s) + owning task(s) + concrete deliverables.**

---

## Plan 47-01 — CLEANUP-01: Integration Audit + 3 INT-FIX Commits

**Status:** ✅ **PASS**

### Goal-Backward Check
- **Delivers CLEANUP-01?** YES. Task 1 creates 5 touchpoint regression tests (TP-01..TP-05 in `tests/unit/v4-touchpoints.test.js`, 15 it() blocks) pinning each of the 5 ARCHITECTURE §4 producer↔consumer contracts. Tasks 2/3/4 ship 3 atomic `fix(47-cleanup): INT-FIX-<TAG>` commits matching Phase 38 pattern (LEDGER reset + CAL 1-line dynamic-month fix + LOCK static-grep test).
- **Delivers SC1 of ROADMAP?** YES — explicit `auto` tasks with file:line touchpoints listed in `<interfaces>` (e.g., `issue-payload-builder.js:261`, `llm-driver.js:378`, `auto-fix.mjs:617`, `pdf-verifier.js verifyCitation`, `promote-from-quarantine.mjs:115`, `auto-fix-promote.mjs:67-80`).

### Coverage of Phase Success Criteria
- SC1: ✅ Full coverage via Task 1 (TP tests) + Tasks 2-4 (INT-FIX commits).

### Shallow-Task Check
- All 4 tasks have multi-step `<action>` blocks (Step 1 RED / Step 2 GREEN / Step 3 verify / Step 4 commit) with verbatim commands.
- Acceptance criteria are runnable shell commands (e.g., `grep -cE "^\s+describe\\(['\"]TP-0[1-5]-"` returns 5).
- TDD shape preserved (Task 1 marked `tdd="true"` though it actually pins existing behaviour — see Advisory 1 below).

### Concrete-Identifier Check
- Every `<action>` contains file:line, regex, function name, or command. Examples:
  - Task 1 Step 2: regex `/labels\s*=\s*\[[^\]]*['"]triage['"]\s*\]/` against `tests/e2e/lib/issue-payload-builder.js`
  - Task 2 Step 2: verbatim 22-line JSON content for the ledger reset, preserving the Phase 39 seed entry verbatim
  - Task 3 Step 2: exact line replacement at `tests/e2e/scripts/e2e-weekly-digest.test.js:389`
  - Task 4 Step 2: REPO_ROOT path resolution + regex pattern verbatim from RESEARCH Pattern 3
- All `read_first` blocks cite line ranges.

### read_first Completeness
- Task 1 reads 13 sources including the Phase 38 template and the existing `e2e-nightly-quarantine-yaml.test.js` (the template for file-as-text grep with step-window scoping).
- Tasks 2/3/4 each cite the matching 47-RESEARCH.md root-cause section + the upstream behavioral test file.

### Dependencies / Wave
- `depends_on: []`, `wave: 1`. Correct — 47-01 is the entry plan.

### Notable Strengths
- Task 2 commit body verbatim-quoted in the plan (preserves the root-cause documentation discipline; future maintainers see the `iteration_n + run_id + phase:null` writer-signature analysis without leaving the commit log).
- Task 3 explicitly forbids the PIN_NOW substitution per Pitfall 2 — prevents the most plausible wrong fix.

---

## Plan 47-02 — CLEANUP-02: Bulk Nyquist Stamping (8 phases)

**Status:** ✅ **PASS**

### Goal-Backward Check
- **Delivers CLEANUP-02?** YES. Tasks 2-9 invoke `Skill(gsd-validate-phase, "<N>")` against each of the 8 v4.0 phases (39, 40, 41, 43, 44, 45, 46, 42 — last-largest order per RESEARCH recommendation). Task 10 tabulates per-phase outcomes for downstream consumption by Plan 47-04.
- **Delivers SC2 of ROADMAP?** YES — every v4.0 phase 39-46 gets a Skill invocation that either stamps `nyquist_compliant: true` or documents the gap.

### Coverage of Phase Success Criteria
- SC2 (Nyquist stamping): ✅ Full coverage — 8 explicit invocations, one per phase.
- SC2 (static-grep tests): ✅ Coverage owned by 47-01 (touchpoint tests) + 47-01 (package-lock-pinned) + 47-04 (CODEOWNERS) — cross-plan delegation noted explicitly in 47-02 `must_haves.truths`.

### Shallow-Task Check
- Tasks 2-9 are `checkpoint:human-action` (gated; per-phase resume signal "approved"). Each has identical 5-step `<action>` (invoke skill → handle Pitfall 6 in-loop correction → handle CLAUDE.md C1/C2/C3 fallback → record outcome → pause). Action specificity is appropriate for a wrapped-skill checkpoint.
- Task 10 is `auto` with a 4-section SUMMARY structure spelled out and a `node`-based YAML coherence check in `<verify>`.

### Concrete-Identifier Check
- Each task identifies the exact phase directory path (e.g., `.planning/phases/39-sdk-driver-+-ledger-v2-+-branch-protection-wave-0/39-VALIDATION.md`).
- Acceptance criteria use `ls .planning/phases/<N>-*/<N>-VALIDATION.md` + `grep -E "^nyquist_compliant:\s*(true|false)"` — runnable verification.
- Pitfall 6 (auditor escalates Manual-Only) is operationalized per-task with the exact correction string ("COVERED-MANUAL per Plan 47-03 runbook UAT-47-X").

### read_first Completeness
- Each task reads the phase directory + Skill spec + workflow spec + nyquist-auditor agent. Comprehensive.

### Dependencies / Wave
- `depends_on: [47-01]`, `wave: 3`. Correct — gated on Plan 47-01's INT-FIX commits landing first so the auditor sees a clean test suite.

### Notable Strengths
- Pre-classification list (Pitfall 6) is reproduced into Task 1 working notes so each subsequent task has the exact Manual-Only mapping (e.g., UAT-47-a → Phase 42 + Phase 43 + Phase 44).
- CLAUDE.md C1/C2/C3 enforcement explicit in every task (numbered-list fallback if AskUserQuestion result is empty).

### Minor Advisory 1
- Tasks 2-9 are `checkpoint:human-action` with `gate="blocking"` — that's 8 sequential pauses. Per CONTEXT.md "Plan Structure" the locked decision is sequential execution (no worktree-agent dispatch), so this is acceptable, but operators should be warned to budget time for 8 approval cycles. Not a plan defect; flagging for executor expectations.

---

## Plan 47-03 — CLEANUP-03: Human-UAT Execution

**Status:** ✅ **PASS**

### Goal-Backward Check
- **Delivers CLEANUP-03?** YES. Task 2 executes UAT-47-c live (Strategy A synthetic ring-buffer + Strategy B classifyRerunOutcomes fallback). Task 3 authors all 4 DEFERRED runbook stubs (UAT-47-a/b/d/e) with mandatory 4 fields each. Task 4 adds a vitest static-grep test pinning stub presence + structure.
- **Delivers SC3 of ROADMAP?** YES — but only (c) is RUN-NOW; (a)(b)(d)(e) are DEFERRED requires-push per CONTEXT.md locked decision. Verified: this matches the ROADMAP success criterion AS QUALIFIED by CONTEXT.md (the deferred 4 inherit Phase 42's deferred-demo pattern; the runbook stubs preserve dispatch-readiness for the post-push operator). No scope reduction — the deferral is a user decision, not a planner shortcut.

### Coverage of Phase Success Criteria
- SC3: ✅ Coverage via Task 2 (live UAT-47-c) + Task 3 (4 deferred runbooks) + Task 4 (stub-presence guard).

### Shallow-Task Check
- Task 2 has Strategy A + Strategy B procedures with verbatim bash blocks and explicit CLAUDE.md C1/C2/C3 fallback for the "Strategy A ambiguous" decision point.
- Task 3 transcribes the 4 stubs from RESEARCH.md verbatim with mandatory 4 sub-headers per stub.
- Task 4 (TDD) has 22+ assertions specified with section-window-scoping algorithm explicit in the action block.

### Concrete-Identifier Check
- Task 2 uses exact synthetic fingerprint `aabbccdd1122` (Pitfall 8 per-fingerprint stability invariant); exact CLI: `node scripts/quarantine-append.mjs --escalate-stable-runs-reset 1 --case synthetic-flake-case`; exact log path `/tmp/uat-47c.log`.
- Task 3 cites RESEARCH line ranges per stub (UAT-47-a: 692-720; UAT-47-b: 723-746; UAT-47-d: 801-823; UAT-47-e: 827-857).
- Task 4 specifies the 22 assertions algorithmically (1 file-exists + 5×4 per-stub + 1 fingerprint).

### read_first Completeness
- Task 1 reads CONTEXT, RESEARCH, Phase 38 plan template.
- Task 2 reads RESEARCH UAT-47-c section + `scripts/quarantine-append.mjs` + `scripts/auto-fix.mjs:222-340` + `tests/e2e/lib/triage-classifier.js` (Strategy B fallback source) + current evidence file.
- Comprehensive.

### Dependencies / Wave
- `depends_on: [47-02]`, `wave: 4`. Correct — gated on 47-02 so the test suite is in a known-clean state when UAT-47-c runs.

### Failure Handling
- CONTEXT.md locked decision: UAT-47-c FAIL does NOT block Phase 47 close. Plan correctly captures this in Task 2 Step 6 (open follow-up issue + tech_debt for v4.1, continue to Task 3).

---

## Plan 47-04 — CLEANUP-04: Branch-Protection + Milestone-Audit Bootstrap

**Status:** ✅ **PASS**

### Goal-Backward Check
- **Delivers CLEANUP-04?** YES. Task 1 ships `tests/unit/codeowners-pinned.test.js` pinning the 5-path last-matching-rule order. Task 2 audits live `gh api` state (allow_auto_merge, bypass_actors, required_status_checks) with conditional PATCH (gated on user CLAUDE.md C1/C2/C3 approval). Task 3 bootstraps `.planning/v4.0-MILESTONE-AUDIT.md` consolidating outputs from 47-01/02/03 + Task 2 live evidence.
- **Delivers SC4 of ROADMAP?** YES — explicit `gh api` audit steps verifying each of the 4 SC4 claims, plus a vitest test pinning CODEOWNERS contents.

### Coverage of Phase Success Criteria
- SC4: ✅ Full coverage via Task 1 (CODEOWNERS static-grep) + Task 2 (live gh-api audit + conditional PATCH) + Task 3 (audit YAML records evidence).

### Shallow-Task Check
- Task 1 (TDD): 9 assertions specified explicitly (file-exists + count + 5×per-rule regex + order findIndex + maintainer pin).
- Task 2 (`checkpoint:decision`): 11-step action block with verbatim `gh api` invocations + `jq` filters + Pitfall-3 (PUT not PATCH) + Pitfall-4 (canonical context name pre-verification) + Pitfall-7 (gh auth status pre-check). Decision-options block has 3 explicit options with pros/cons.
- Task 3 (auto): 7-step action block with verbatim frontmatter keys + 7 mandatory markdown sections + a `node`-based YAML+section coherence check in `<verify>`.

### Concrete-Identifier Check
- Task 1 specifies the 5 expected regex patterns verbatim (e.g., `/^\/tests\/golden\/\s+@/`).
- Task 2 cites Phase 39's ruleset id `17086676` (sanity-only reference) + the exact `gh api` paths.
- Task 3 specifies the 9 frontmatter keys + 7 markdown sections that the verify-script asserts.

### read_first Completeness
- Task 1: CODEOWNERS + RESEARCH static-grep template + existing Test 49 grep pattern.
- Task 2: RESEARCH CLEANUP-04 toolchain section + 3 pitfall sections + CLAUDE.md.
- Task 3: v3.1-MILESTONE-AUDIT template + RESEARCH section template + all upstream SUMMARY/EVIDENCE/DEFERRED files + the Task-2 `/tmp/` evidence files.

### Dependencies / Wave
- `depends_on: [47-03]`, `wave: 5`. Correct — sequencing per CONTEXT.md locked execution order.

### Notable Strengths
- Task 2 explicitly does NOT auto-apply the ruleset PATCH (per CLAUDE.md C1/C2/C3); presents 3 options and waits for explicit user response. This is the right behavior for a load-bearing repo-config change.
- Task 3 audit-doc template references the 4 specific upstream artifacts (47-01 commit SHAs, 47-02 per-phase table, UAT-EVIDENCE PASS/FAIL, /tmp gh-api JSON) — no implicit dependencies.

---

## Cross-Plan Integrity

### Dependency Graph
```
47-01 (wave 1, no deps) ───┐
                            ▼
47-02 (wave 3, deps 47-01) ─┐
                            ▼
47-03 (wave 4, deps 47-02) ─┐
                            ▼
47-04 (wave 5, deps 47-03)
```
Linear sequential — matches CONTEXT.md locked Plan Structure. No cycles, no forward references.

### CONTEXT.md Locked Decisions — All Honored
| Decision | Plan(s) | Status |
|----------|---------|--------|
| 5 ARCHITECTURE §4 touchpoint regression tests (exhaustive list — do not add/remove) | 47-01 Task 1 (TP-01..TP-05) | ✅ |
| INT-FIX-LEDGER: fix at root (executor leak), not by relaxing Test 48 | 47-01 Task 2 (reset committed file; preserves Test 48 assertion) | ✅ |
| INT-FIX-CAL: dynamic-date derivation, NOT PIN_NOW substitution | 47-01 Task 3 (Pitfall 2 explicit) | ✅ |
| INT-FIX-LOCK: vitest static-grep on package-lock.json @anthropic-ai/sdk EXACT 0.100.1 | 47-01 Task 4 (4 assertions including no-caret + resolved-URL) | ✅ |
| Atomic INT-FIX commits matching `fix(47-cleanup): INT-FIX-<TAG> — <one-line>` | 47-01 Tasks 2/3/4 (commit messages spelled out verbatim) | ✅ |
| No new npm dependencies (v4.0 hard rule) | All plans (Node 22 built-ins + existing vitest/gh CLI only) | ✅ |
| 8 explicit `gsd-validate-phase` invocations (not shell loop) | 47-02 Tasks 2-9 (one task per phase) | ✅ |
| Bulk Nyquist gaps documented inline; do NOT block Phase 47 | 47-02 Task 10 + 47-04 Task 3 tech_debt block | ✅ |
| UAT-47-c (FLAKE) RUN-NOW LOCAL; UAT-47-a/b/d/e DEFERRED requires-push | 47-03 Tasks 2 (live) + 3 (runbook stubs) | ✅ |
| UAT-47-c FAILURE → open follow-up issue + tech_debt for v4.1, do NOT block | 47-03 Task 2 Step 6 | ✅ |
| `gh api` live audit (allow_auto_merge + bypass + required_status_checks) | 47-04 Task 2 | ✅ |
| CODEOWNERS static-grep with last-matching-rule order | 47-04 Task 1 | ✅ |
| Audit file bootstrap with 6 sections (integration/nyquist/human_verification/branch_protection/gaps/tech_debt) | 47-04 Task 3 (9 frontmatter keys + 7 markdown sections — superset) | ✅ |
| Ruleset PATCH (if needed) via `gh api -X PUT` (Pitfall 3) | 47-04 Task 2 Step 10 | ✅ |
| 4 plans sequential, no worktree-agent dispatch | All plans (waves 1, 3, 4, 5) | ✅ |
| Execution order 47-01 → 47-02 → 47-03 → 47-04 | depends_on chain | ✅ |

**14/14 locked decisions honored. Zero scope reduction. Zero deferred-idea creep.**

### Deferred-Ideas Compliance (out-of-scope items NOT in plans)
- "Push v4.0 to origin" — NOT in any plan. ✅
- "Auto-merge dashboard / cost-per-fix metrics" — NOT in any plan. ✅
- "Pre-merge shadow corpus" — NOT in any plan. ✅
- "Multi-model A/B" — NOT in any plan. ✅
- "Retroactive vitest tests for 14 cross-phase seams beyond the 5 §4 touchpoints" — NOT in any plan (5 touchpoints only per CONTEXT lock). ✅

### Nyquist Compliance (Dimension 8)
- VALIDATION.md exists (`47-VALIDATION.md` with 15-task per-task verification map).
- Wave 0 dependencies: VALIDATION.md lists 4 NEW test files as Wave 0 prerequisites (`tests/unit/v4-touchpoints.test.js`, `tests/unit/codeowners-pinned.test.js`, `tests/unit/package-lock-pinned.test.js`, `tests/unit/uat-deferred-runbook.test.js`). Each is created by an explicit task in 47-01 / 47-04 / 47-03 (no orphan MISSING references).
- Every implementation task has an `<automated>` verify command (or relies on a Wave 0 task in the same plan that creates the test). Sampling continuity: every plan's `<verify>` block is runnable.
- Feedback latency: All `<automated>` commands are vitest unit tests with `--run` flag (no watch mode) and `--reporter=dot`. Estimated < 45s per validation gate.
- ✅ PASS

### CLAUDE.md Compliance (Dimension 10)
- C1/C2/C3 (AskUserQuestion fallback) — enforced in every interactive checkpoint:
  - 47-02 Tasks 2-9: fallback documented in each action block.
  - 47-03 Task 2: Strategy A→B fallback gated on numbered-list (no auto-pick).
  - 47-04 Task 2: 3-option ruleset-PATCH decision gated on explicit choice (no auto-pick).
- ✅ PASS

### Architectural Tier Compliance (Dimension 7c)
- RESEARCH.md §"Architectural Responsibility Map" maps each capability to a tier; plans honor those tiers (e.g., CLEANUP-04 audit is `Live GitHub repo settings (gh api)` — 47-04 Task 2 uses gh api; INT-FIX-LEDGER root cause is `Test infrastructure (executor isolation)` — 47-01 Task 2 resets the committed file rather than patching `llm-ledger.js`).
- ✅ PASS

---

## Advisories (non-blocking)

### Advisory 1 — Plan 47-01 Task 1 marked `tdd="true"` but pins existing behaviour
Plan 47-01 Task 1 sets `tdd="true"` and follows a RED→GREEN→COMMIT structure, but the action block (Step 7) explicitly notes "ALL 15 it() blocks should PASS immediately because the contracts already hold in the post-Phase-46 tree". This is not classic TDD — it's contract-pinning of existing behaviour (the touchpoints already wire correctly; the test guards future drift). The Step 7 instruction "If any it() FAILS, the failure points to a real touchpoint drift — STOP and surface to user" preserves correctness, but the `tdd="true"` attribute may mislead the executor agent's TDD harness if it expects a failing-test phase.

**Recommendation:** Either change `tdd="true"` → `tdd="false"` for Task 1 OR add an explicit `<note>` clarifying "pinning existing behavior, expect immediate GREEN; failure = drift". Same applies to 47-04 Task 1 (CODEOWNERS test) and 47-01 Task 4 (INT-FIX-LOCK test) which also pin already-correct state. Cosmetic — does not affect plan executability.

### Advisory 2 — 47-02 has 8 sequential blocking human-action checkpoints
8 `checkpoint:human-action` tasks (Tasks 2-9) with `gate="blocking"` each requiring "approved" before proceeding. Combined with 47-03 Task 2's checkpoint and 47-04 Task 2's decision-checkpoint, total of 10 human-action gates across Phase 47. CONTEXT.md locked sequential execution so this is by design, but operators should budget for ~10 approval pauses. No plan defect.

---

## Final Verdict

**APPROVED**

All 4 plans deliver their owning CLEANUP-* requirement with goal-backward traceability to ROADMAP success criteria. Concrete file:line identifiers, runnable verify commands, and runnable acceptance criteria are present throughout. All 14 CONTEXT.md locked decisions are honored without scope reduction. Cross-plan dependencies form a clean linear DAG matching the locked Plan Structure (47-01 → 47-02 → 47-03 → 47-04). All upstream-deferred ideas are correctly excluded. CLAUDE.md C1/C2/C3 enforcement is explicit in every interactive task. Wave-0 test-file dependencies are satisfied (no orphan MISSING references).

Two cosmetic advisories noted (TDD attribute on contract-pinning tests; operator expectation around 10 sequential human-action gates) — neither blocks execution.

**Recommendation:** Proceed to `/gsd:execute-phase 47` (Plan 47-01 first).

## CHECK COMPLETE

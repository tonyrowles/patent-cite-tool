# Phase 47: v4.0 Cleanup - Context

**Gathered:** 2026-06-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Close out v4.0 along four concrete tracks (mirrors v3.1 Phase 38 shape, extended for v4.0's larger surface):

1. **Integration audit (CLEANUP-01)** — verify the 5 v3.1→v4.0 touchpoints catalogued in `.planning/research/ARCHITECTURE.md` §4:
   - **Triage labels:** `issue-payload-builder.js:180` → `v40-auto-fix.yml` trigger filter
   - **Fingerprint comment:** `e2e-report-issue.mjs:78` (`fingerprint()` 12-hex) → `auto-fix.mjs` branch namer `auto-fix/<n>-<fp8>`
   - **`invokeClaudePWithLedger`:** `llm-driver.js:375` → `auto-fix.mjs --transport subscription` path
   - **`verifyCitation`:** `pdf-verifier.js:830` → `verify-single-case.mjs` CLI shim
   - **`runPromote`:** `promote-from-quarantine.mjs:115` → `auto-fix-promote.mjs` with `_skipCiGuard:true` + triple-gate
   - Fragility warnings resolved as atomic `fix(47-cleanup): INT-FIX-* — <one-line>` commits, matching Phase 38 pattern.
   - **Pre-existing test regressions folded in as INT-FIX items:**
     - INT-FIX-LEDGER: real SDK calls leaked into committed `tests/e2e/.llm-spend-ledger.json` (Test 48 regression at `tests/unit/llm-ledger.test.js:1012`) — investigate root cause + fix
     - INT-FIX-CAL: calendar-rollover flake at `tests/e2e/scripts/e2e-weekly-digest.test.js:395` (`2026-05` hardcoded, now June 2026) — 1-line dynamic-date fix
     - INT-FIX-LOCK: static-grep test on `package-lock.json` pinning `@anthropic-ai/sdk` exact version (reverted-from-caret defense)

2. **Nyquist coverage stamping (CLEANUP-02)** — no v4.0 phase carries a draft `*-VALIDATION.md` (grep confirms zero). Run `gsd-validate-phase` cold on all 8 v4.0 phases (39-46) so they emerge with COMPLIANT VALIDATION.md just as Phase 38's targets did. Static-grep tests pin the 5 ARCHITECTURE §4 touchpoints + CODEOWNERS contents.

3. **Human-UAT live confirmations (CLEANUP-03)** — 5 scenarios:
   - **(a) End-to-end auto-fix flow against a real triage-labeled fork issue** — DEFERRED: requires-push (inherits Phase 42's deferred demo on issue #3 `US11427642-spec-short-1`, fingerprint `139f821b3bb1`, branch `auto-fix/3-139f821b`)
   - **(b) Dep-PR pre-flight gate blocking on regression** — DEFERRED: requires-push
   - **(c) FLAKE escalation suppressing re-files** — RUN LOCALLY NOW (locally testable via `quarantine-append.mjs --escalate-stable-runs-reset`)
   - **(d) Ledger snapshot workflow committing daily snapshot** — DEFERRED: requires-push
   - **(e) Verifier-gate diff-guard rejecting crafted bypass** — DEFERRED: requires-push
   - For each deferred item, record a runbook stub (dispatch command + expected outcome) so the post-push operator can execute the live UAT without re-discovering setup.
   - Results recorded in `.planning/v4.0-MILESTONE-AUDIT.md` `human_verification:` block (created in CLEANUP-04).

4. **Branch-protection / CODEOWNERS re-audit (CLEANUP-04)** — verify Phase 39's repo-level settings are unchanged:
   - `Settings → Allow auto-merge: OFF` at repo level
   - Branch protection on `main` with `Do not allow bypassing: ON`, required-status-checks listing the verifier-gate + deps-update-gate workflows
   - `CODEOWNERS` pins still cover `src/`, `tests/`, `.github/workflows/`, `tests/golden/`, `tests/e2e/test-cases-quarantine.js`
   - Static-grep vitest test pins CODEOWNERS contents (uses last-matching-rule semantics)
   - CLEANUP-04 also bootstraps `.planning/v4.0-MILESTONE-AUDIT.md` (the file the lifecycle audit-milestone step will read)

**Out of scope:**
- Pushing v4.0 to origin or merging to main — separate post-Phase-47 readiness gate
- New v4.1 capabilities — Phase 47 is strictly v4.0 cleanup
- Re-litigation of trust-invariant decisions (triple-gate `_skipCiGuard`, draft-PR-only auto-fix, exact-pin SDK) — locked in earlier phases

</domain>

<decisions>
## Implementation Decisions

### CLEANUP-01: Integration Audit
- **Audit pattern:** One regression test per touchpoint asserting the v3.1→v4.0 contract holds (5 tests for 5 touchpoints).
- **Pre-existing test regressions folded in:**
  - INT-FIX-LEDGER: Investigate why real SDK calls landed in committed ledger despite `E2E_LEDGER_PATH_OVERRIDE → tmpdir` routing. Fix at root (executor leak), not by relaxing Test 48 assertion. Resolves working-tree dirty state.
  - INT-FIX-CAL: Replace `'2026-05'` literal with dynamic-date derivation (`new Date().toISOString().slice(0, 7)` or fixture-time). Use whatever pattern other passing date tests in the suite already use.
  - INT-FIX-LOCK: Vitest static-grep on `package-lock.json` asserting `"@anthropic-ai/sdk": { "version": "0.100.1"` (exact, not caret).
- **Commit granularity:** One atomic commit per fix matching `fix(47-cleanup): INT-FIX-<TAG> — <one-line>` (mirrors Phase 38 INT-FIX-01..03).
- **No new npm dependencies:** v4.0 hard rule continues. Node 22 built-ins + existing vitest infrastructure only.

### CLEANUP-02: Nyquist Coverage Stamping
- **Cold-stamp approach:** No drafts exist; running `gsd-validate-phase <N>` will draft + stamp in one pass. 8 invocations (phases 39, 40, 41, 42, 43, 44, 45, 46).
- **Plan structure:** Single bulk plan (47-02) covering all 8 stamping invocations — mechanical work, per-phase planning unnecessary.
- **Gap handling:** Document inline in 47-02 SUMMARY. Do NOT block Phase 47 — this is cleanup, not gap-closure. Raise unresolved nyquist gaps as new tech_debt in v4.0-MILESTONE-AUDIT.md.
- **Static-grep contract tests:** New vitest tests pin the 5 ARCHITECTURE §4 touchpoint contracts + CODEOWNERS contents (the latter implemented inside CLEANUP-04 plan to keep CODEOWNERS-touching code colocated).

### CLEANUP-03: Human-UAT Execution
- **Locally runnable now:** UAT (c) FLAKE escalation — execute via `node scripts/quarantine-append.mjs ...` against the local FLAKE test fixture; expect 5-state classifier to suppress re-file after N=3 FLAKE re-files within 14 days per FLAKE-02. Mark PASS in audit on success.
- **Deferred (requires-push):** UAT (a), (b), (d), (e) — workflows do not yet exist on GitHub Actions. Mark DEFERRED in audit with sub-status `requires-push`. For each, write a runbook stub under `47-UAT-DEFERRED.md` containing: dispatch command, expected outcome, success-signal heuristic, rollback plan.
- **Result recording:** Append outcome under each `human_verification:` item in `.planning/v4.0-MILESTONE-AUDIT.md`: `outcome: PASS|DEFERRED, verified_at: <ISO timestamp>, evidence: <one-line ref>`.
- **Failure handling:** If UAT (c) FAILS, capture in REVIEW.md doc + open follow-up GitHub issue. Do NOT block Phase 47 close — failure becomes new tech_debt for v4.1.

### CLEANUP-04: Branch-Protection Re-Audit
- **Live re-audit:** Use `gh api` to confirm: (i) `repos/{owner}/{repo}.allow_auto_merge === false`, (ii) ruleset on `main` exists with `Do not allow bypassing: ON`, (iii) `required_status_checks` contains both `verifier-gate` AND `deps-update-gate` job names.
- **CODEOWNERS static-grep:** Vitest test reads `.github/CODEOWNERS`, asserts all 5 pinned paths present and tail-most. (Last-matching-rule semantics — paths must remain in CODEOWNERS-required order.)
- **Audit file bootstrap:** Create `.planning/v4.0-MILESTONE-AUDIT.md` in CLEANUP-04 as the canonical record. Sections: `integration:` (links INT-FIX-* commits), `nyquist:` (per-phase compliance table), `human_verification:` (5 UAT items), `branch_protection:` (gh-api evidence), `gaps:` (unresolved findings), `tech_debt:` (deferred to v4.1).
- **Ruleset patch (if needed):** If `required_status_checks` is missing `verifier-gate` or `deps-update-gate`, patch the ruleset via `gh api -X PUT` and record the change in audit. (Per handoff: Phase 39 created the ruleset; v4.0 job names may need adding now that workflows ship.)

### Plan Structure
- **Four plans:** 47-01 (CLEANUP-01 integration + INT-FIX-LEDGER/CAL/LOCK), 47-02 (CLEANUP-02 nyquist stamping), 47-03 (CLEANUP-03 UAT execution), 47-04 (CLEANUP-04 branch-protection + audit-file bootstrap).
- **Execution order:** 47-01 → 47-02 → 47-03 → 47-04 (integration must land before nyquist; UAT execution before audit-file authoring catches outcomes).
- **No worktree-agent dispatch:** Phase 47 is sequential cleanup; the gain from parallelism does not justify the overhead. Run all 4 plans in main worktree.

### Claude's Discretion
- Exact test naming, test file placement (`tests/unit/` vs colocation).
- Specific grep regex shape for the YAML / CODEOWNERS / package-lock assertions.
- Whether each INT-FIX commits a separate test file or appends to an existing one.
- Exact SUMMARY structure for the bulk Nyquist plan (per-phase status table is recommended).
- Whether to use a single shell loop or 8 explicit `gsd-validate-phase` invocations (8 explicit invocations preferred for clear logs).
- Whether the UAT (c) FLAKE execution uses live `quarantine-append.mjs` against a synthetic FLAKE fixture or runs against the existing v3.1 quarantine corpus.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`.github/CODEOWNERS`** — already present, 5 pinned paths in last-matching-rule order. CLEANUP-04 just verifies + grep-tests.
- **`gsd-validate-phase`** — existing GSD skill (gsd-nyquist-auditor wrapper). Drafts VALIDATION.md cold when none exists; reads phase plan + SUMMARY + VERIFICATION.
- **`.planning/research/ARCHITECTURE.md` §4** — canonical source of the 5 touchpoints + `_skipCiGuard` triple-gate spec.
- **`.planning/v3.1-MILESTONE-AUDIT.md`** — template for v4.0-MILESTONE-AUDIT.md sections.
- **Phase 38 plan/summary archives** at `.planning/milestones/v3.1-phases/38-v3-1-cleanup-integration-warnings-nyquist-human-uat/` — direct templates for INT-FIX commits, bulk-Nyquist plan, UAT-evidence structure.
- **`tests/e2e/lib/llm-ledger.js`** — `appendLedgerEntry()` is where the leak likely originates; existing override hook `E2E_LEDGER_PATH_OVERRIDE` checked at the file-write call site.

### Established Patterns
- **One atomic commit per fix** — `fix(<phase>-<scope>): <TAG> — <one-line>` (e.g., `fix(47-cleanup): INT-FIX-LEDGER — route SDK calls through test-time override`).
- **Zero new npm dependencies** — v4.0 hard rule.
- **Workflow seam contract** — workflows that share constants/labels import a single source-of-truth module (e.g., `QUARANTINE_REPORT_FILENAME`). Phase 47 verifies no new local re-declarations.
- **Last-matching-rule CODEOWNERS** — file already documents the convention; CLEANUP-04 must not reorder.
- **Audit file is authoritative** — `.planning/v4.0-MILESTONE-AUDIT.md` becomes the source of truth for nyquist + human_verification state once CLEANUP-04 creates it.

### Integration Points
- `tests/e2e/.llm-spend-ledger.json` ↔ `tests/e2e/lib/llm-ledger.js` (root cause of INT-FIX-LEDGER)
- `tests/e2e/scripts/e2e-weekly-digest.test.js` ↔ system clock (INT-FIX-CAL)
- `package-lock.json` ↔ `@anthropic-ai/sdk` exact pin invariant (INT-FIX-LOCK)
- `.github/workflows/v40-*.yml` ↔ `main` ruleset `required_status_checks` (CLEANUP-04 ruleset patch)
- `.github/CODEOWNERS` ↔ static-grep test (CLEANUP-04)
- `gsd-validate-phase` reads `*-VALIDATION.md` (drafts when missing) + plan summaries + verification
- `.planning/v4.0-MILESTONE-AUDIT.md` created in CLEANUP-04; consumed by the lifecycle audit-milestone step

</code_context>

<specifics>
## Specific Ideas

- The 5 ARCHITECTURE §4 touchpoints are the **exhaustive** list — do not add/remove. CLEANUP-01 deliverable count is 5 regression tests + N INT-FIX commits (where N depends on how many fragility findings surface).
- Phase 42's deferred demo (issue #3 `US11427642-spec-short-1`, fingerprint `139f821b3bb1`, branch `auto-fix/3-139f821b`) is the canonical UAT (a) target. The runbook stub for (a) must name this specific issue.
- The `_skipCiGuard` exemption is a load-bearing trust-invariant decision — CLEANUP-01 must include a vitest test that triggers the triple-gate (label + merged + triage-sourced) and asserts `runPromote({_skipCiGuard:true})` refuses when ANY gate is missing.
- INT-FIX-LEDGER root cause is most likely an executor that calls `invokeAnthropicSdkWithLedger` directly without honoring `E2E_LEDGER_PATH_OVERRIDE`. Grep for callers + check each one's test-time isolation before patching the ledger file write site.
- `npm install` after Phase 47 should leave `package-lock.json` unchanged — the INT-FIX-LOCK static-grep test catches a regression where `^0.100.1` re-creeps in.

</specifics>

<deferred>
## Deferred Ideas

- **Live UATs (a), (b), (d), (e)** — require pushed v4.0 workflows. Documented as DEFERRED with runbook stubs in `47-UAT-DEFERRED.md`; outcomes to be recorded post-push by the operator.
- **Push v4.0 to origin + PR-to-main strategy** — separate readiness gate, not Phase 47. Likely a feature-branch (e.g., `v4.0-integration`) with self-merge via `gh pr merge --admin` or temporary ruleset relaxation.
- **Auto-merge dashboard / cost-per-fix metrics** — REQUIREMENTS.md Future bucket (v4.1).
- **Pre-merge shadow corpus** — explicitly out-of-scope per REQUIREMENTS.md.
- **Multi-model A/B for difficult error classes** — v4.1 deferred.
- **Retroactive vitest tests for the 14 cross-phase seams** (beyond the 5 §4 touchpoints) — could be a v4.1 hardening item; not Phase 47 scope.

</deferred>

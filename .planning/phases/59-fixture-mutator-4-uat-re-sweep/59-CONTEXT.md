# Phase 59: Fixture-Mutator + 4-UAT Re-Sweep - Context

**Gathered:** 2026-06-05
**Status:** Ready for planning
**Mode:** Auto-generated (mixed-discipline phase — smart discuss skipped; large scope)

## Scope Map

Phase 59 is two distinct work streams under one phase number:

**Work stream A — Fixture-Mutator (deterministic; local):**
- MUTATOR-01..05 (5 requirements)
- New script `tests/e2e/scripts/inject-defect.mjs` + a tooling-side modification to `scripts/quarantine-append.mjs` to suppress auto-promotion for `source: 'fixture-mutator-uat-47b'` entries
- ZERO production destruction surface; pure code authoring + Vitest pin
- Can ship before any push of 56-58 to origin/main

**Work stream B — 4-UAT Re-Sweep (live; origin/main):**
- SWEEP-01..06 (6 requirements)
- Requires Phases 56+57+58 ALL pushed to origin/main BEFORE any UAT executes
- D-13 cost sequencing locked: SWEEP-01 ($0 smoke) → SWEEP-02 (~5 min) → SWEEP-03 (~$0.50-2 paid primary DoD) → SWEEP-04 (after mutator)
- SWEEP-03 is paid; cost discipline: halt-on-fail at SWEEP-01 before any LLM API spend
- SWEEP-05 produces `56-UAT-EVIDENCE.md` (per ROADMAP success criterion 5 wording — file named `56-UAT-EVIDENCE.md` even though it lives in Phase 59 directory, matching the phase that originated the UAT IDs)
- SWEEP-06 post-UAT cleanup (Pitfall 11)

## Hard Dependency

**56 commits accumulated on local `main` are unpushed.** Origin: `https://github.com/tonyrowles/patent-cite-tool.git`. Work stream A can proceed without push; work stream B CANNOT begin until 56-58 land on origin/main and the live cron / verifier-gate workflows see the new code paths.

<domain>
## Phase Boundary

A deterministic synthetic-defect injector exists and is proven safe (no FORBIDDEN_PATHS mutation; fingerprint collision aborts); the auto-fix loop is confirmed end-to-end on origin/main with captured evidence; post-UAT state is clean.

Requirements covered: MUTATOR-01..05, SWEEP-01..06.

</domain>

<decisions>
## Implementation Decisions

### Pre-Locked by REQUIREMENTS.md + STATE.md Phase 59 blocker advisory

- **Fixture-mutator scope (Pitfall 5 LOAD-BEARING):** `inject-defect.mjs` works at the issue-creation layer only via `gh issue create`. It MUST NOT touch any file in FORBIDDEN_PATHS (`tests/fixtures/*`, `tests/golden/baseline.json`, `tests/test-cases.js`, `.github/CODEOWNERS`, etc.). Verification gate: `git status` must be CLEAN after mutator execution.
- **Fingerprint format:** 12-hex per `tests/e2e/lib/issue-payload-builder.js` convention (`<!-- fp: ${fingerprint} -->` on line 1 of issue body). Mutator computes fingerprint deterministically from synthetic content (e.g., `sha256(synthetic_seed).slice(0, 12)`).
- **Fingerprint collision check (Pitfall 6 LOAD-BEARING):** Mutator MUST run `gh issue list --search 'fp:<computed>'` BEFORE creating the issue. If a matching open issue exists, HARD ABORT with non-zero exit (not a warning).
- **Auto-promotion suppression (Pitfall 8 LOAD-BEARING):** `scripts/quarantine-append.mjs` suppresses `quarantine:ready-for-promotion` label for entries with `source: 'fixture-mutator-uat-47b'`. inject-defect.mjs and quarantine-append.mjs source-tag strings co-designed in the SAME commit per REQUIREMENTS.md MUTATOR-04 wording.
- **Cleanup evidence:** `56-MUTATOR-CLEANUP.md` per REQUIREMENTS.md MUTATOR-05 wording — explicit `gh` commands to close the synthetic issue, delete the synthetic branch, revert the synthetic quarantine entry. (File name `56-MUTATOR-CLEANUP.md` matches the UAT-namespace; lives in Phase 59 directory.)
- **UAT sequencing (D-13 cost discipline, locked):**
  1. SWEEP-01 = UAT-47-e (~3 min, $0) — diff-guard rejection re-test on `auto-fix:partial-verified` flow; HALT-ON-FAIL before spending API budget
  2. SWEEP-02 = UAT-47-d (~5 min) — ledger-snapshot post-Phase-57 cron behavior verification
  3. SWEEP-03 = UAT-47-a (~$0.50-2, ~10 min) — full end-to-end auto-fix loop; PRIMARY DoD EVIDENCE
  4. SWEEP-04 = UAT-47-b — fixture-mutator drives synthetic through full loop; deps-update-gate smoke
- **Push gate:** Before Work stream B starts, Phases 56+57+58 commits MUST be pushed to origin/main. This is an explicit checkpoint — the autonomous workflow halts here unless user has pre-authorized push.
- **Cost discipline (CTRL-01):** Paid UAT-47-a (SWEEP-03) is $$$ spend; even under "fully autonomous" mode, surface the expected cost ($0.50-2) BEFORE invoking the workflow that triggers the paid LLM call.
- **All UAT ledger entries carry `phase: '56-uat'` (Pitfall 10):** Per REQUIREMENTS.md SWEEP-05 wording — filterable production analysis. This is set via env var on the workflow_dispatch input or via auto-fix-promote.mjs argv.
- **Cleanup (SWEEP-06, Pitfall 11):** After UAT evidence is captured, all test branches deleted, all test PRs closed (via `gh pr close --delete-branch`), all synthetic issues closed, all synthetic quarantine entries reverted.

### Claude's Discretion (during plan-phase)

- Whether to plan Work stream A and Work stream B as separate plans (recommended for clarity) or one large plan (recommended for atomic phase close)
- The fingerprint seed for synthetic-defect generation (recommended: deterministic UUID or `mutator-seed-1` constant for repeatability)
- Whether SWEEP-05 evidence file is one consolidated `56-UAT-EVIDENCE.md` or per-UAT files (recommended: one consolidated per REQUIREMENTS.md wording)
- Specific paths for SWEEP-06 cleanup automation (one-shot script `tests/e2e/scripts/uat-cleanup.mjs` recommended)
- Whether the post-execution autonomous gate halts before push, or executes the push automatically (defer to user decision via AskUserQuestion)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `tests/e2e/lib/issue-payload-builder.js` — fingerprint format definition (`<!-- fp: ${fingerprint} -->` on line 1); 12-hex convention
- `scripts/quarantine-append.mjs:29` — `READY_FOR_PROMOTION_LABEL = 'quarantine:ready-for-promotion'`; MUTATOR-04 adds source-based suppression
- `scripts/auto-fix.mjs` — `extractErrorClass(issueJson.labels)` extracts ERROR_CLASS from labels; mutator adds the right label so triage routes correctly
- `gh` CLI — runner-bundled in CI; locally requires `gh auth login` (Wave 0 pre-check)
- Phase 51 closure note in STATE.md catalogs UAT-47-* failure modes — useful for the SWEEP-* runbook authoring

### Established Patterns
- Synthetic-issue creation via `gh issue create --title ... --body ... --label triage --label <ERROR_CLASS>`
- Quarantine entries follow JSONL append-only contract; the source-tag is the discriminator for MUTATOR-04 suppression
- v3.1 e2e-explore pattern: small Node CLI scripts in `tests/e2e/scripts/` with corresponding Vitest contract tests

### Integration Points
- `tests/e2e/scripts/inject-defect.mjs` (NEW) — produces a triage-labeled GitHub issue that flows through the SAME triage → auto-fix → verifier → merge → promote path as a real anomaly
- `scripts/quarantine-append.mjs` — gains a single conditional that suppresses the promotion label when `entry.source === 'fixture-mutator-uat-47b'`
- `.github/workflows/v40-auto-fix.yml` — UNTOUCHED (Pitfall 1; mutator drives it via real issue creation, not direct YAML invocation)
- `tests/e2e/scripts/uat-cleanup.mjs` (NEW; planner's discretion) — one-shot script for SWEEP-06 cleanup automation

</code_context>

<specifics>
## Specific Ideas

Pre-flight scout confirms:
- 56 unpushed commits on local `main` — Work stream B blocked until push
- Origin remote: `https://github.com/tonyrowles/patent-cite-tool.git`
- `tests/e2e/lib/issue-payload-builder.js:165` declares fingerprint as `params.fingerprint` (12-hex computed by CLI; pattern available for mutator reuse)
- `scripts/quarantine-append.mjs:29` has the canonical READY_FOR_PROMOTION_LABEL constant
- Phase 51's UAT runbook template lives at `.planning/milestones/v4.1-phases/51-live-readiness-uats/51-UAT-EVIDENCE.md` — pattern reference for `56-UAT-EVIDENCE.md`
- Phase 47's `47-UAT-DEFERRED.md` carries the operator-dispatchable runbook stubs that Phase 59 re-activates and resolves

</specifics>

<deferred>
## Deferred Ideas

- Fork-based UAT environment (OBS-FUT-03 per Phase 51 D-01)
- Periodic cleanup of accumulated `ledger-snapshots/daily-*` branches (operator-owned; out of v4.2)
- `fix_abandoned` outcome state (OBS-FUT-01)
- Extending ERROR_CLASS coverage beyond the 5 existing scaffolds (PIPE-FUT-01)

</deferred>

<scope_adjustments>
## Phase 59 Scope Adjustment (Decision Log)

**Updated:** 2026-06-05 (scope expanded with `--phase` argv plumbing on auto-fix-promote.mjs — see Decision C below)

**Decision C (2026-06-05, phase argv expansion — triggered by checker context_compliance / scope_reduction BLOCKER finding):** Expand SWEEP-05 implementation to thread a `--phase <value>` argv flag through `scripts/auto-fix-promote.mjs` (mirroring Phase 58's `--fingerprint` / `--error-class` / `--model` plumbing pattern verbatim) so live ledger entries on origin/main carry `phase: '56-uat'` per REQUIREMENTS.md SWEEP-05 literal wording: "all UAT ledger entries carry `phase: '56-uat'` for filterable production analysis (Pitfall 10)". Surfaced during plan revision when checker observed:

1. **The original Phase 59 plan reduced REQUIREMENTS.md SWEEP-05's literal wording to an "evidence-only jq wrapper" pattern.** The wrapper labels the local JSON evidence files in `.planning/phases/59-*/evidence/` with a derived `uat_tag: '56-uat'` field, but does NOT make the COMMITTED ledger on origin/main filterable. Pitfall 10's stated intent — "filterable production analysis" — requires the field to be on the live entry (downstream consumers like `scripts/a-b-winner.mjs` query the committed ledger, not the planning-side evidence files).
2. **The user's consistent Phase 56 + 58 pattern (Decisions A + B in `.planning/phases/58-promote-outcome-ledger-entry/58-CONTEXT.md`)** is to expand scope to honor literal REQUIREMENTS.md wording when downstream consumers depend on it. Decision C mirrors that pattern: a small additive code edit on `auto-fix-promote.mjs` (5 single-line additions in parseArgv + 2 line-edits at the two entry sites at lines 502 + 522) + a small additive workflow YAML edit (workflow_dispatch trigger + dual-path env expression + conditional argv append) — all sharable with Phase 58's existing plumbing pattern verbatim.
3. **Default value preserves non-UAT shape byte-equivalent:** the script's `args.phase || '58-promote'` fallback chain keeps the entry's current `phase: '58-promote'` literal on all non-UAT runs. UAT runs set the field via `vars.PHASE_TAG=56-uat` GitHub Actions repo variable (set by SWEEP-* operator runbook BEFORE merging test PRs; cleared by SWEEP-06 cleanup). Zero impact on non-UAT operational behavior.

**Plumbing scope (Plan 59-03):** Single atomic `feat(59): SWEEP-05 phase argv expansion (Decision C)` commit covering 4 files:
- `scripts/auto-fix-promote.mjs` — `--phase` argv + validation regex `/^[a-zA-Z0-9_-]+$/` + threaded into PROMOTE-02/PROMOTE-03 entry sites
- `tests/unit/auto-fix-promote-gate.test.js` — PHASE-59-P1..P3 + PHASE-59-O1..O2 describe blocks pinning parseArgv behavior + entry-shape default fallback + bare-literal regression guard
- `.github/workflows/v40-auto-promote.yml` — workflow_dispatch trigger variant + dual-path env expression `PHASE_TAG: ${{ github.event.inputs.PHASE_TAG || vars.PHASE_TAG || '' }}` + conditional argv append `if [ -n "$PHASE_TAG" ]; then ARGS+=(--phase "$PHASE_TAG"); fi`
- `tests/e2e/scripts/v40-auto-promote-yaml.test.js` — PHASE-59-Y1..Y3 describe block pinning workflow_dispatch + dual-path env expression + conditional argv append

**Scope deliberately NOT expanded:** Plan 59-03 does NOT modify `scripts/auto-fix.mjs` (which still carries `const PHASE = '42-auto-fix'` hardcoded on line 174). The auto-fix.mjs `source: 'auto-fix-api'` entry is UPSTREAM of the auto-fix-promote.mjs `source: 'auto-fix-promoted'` outcome entry. `a-b-winner.mjs:isAttributable` (lines 178-189) and the SWEEP-05 filterable-production-analysis goal both key off the OUTCOME entry (the `auto-fix-promoted` source), NOT the upstream `auto-fix-api` source. Therefore scope-expanding `auto-fix.mjs` would be unnecessary churn outside the SWEEP-05 closure boundary.

**Effect on REQUIREMENTS.md:** SWEEP-05 wording stays verbatim (no rewording needed). REQUIREMENTS.md is updated AFTER this revision to add a clarifying note to the SWEEP-05 evidence list: `phase: '56-uat'` is now LIVE on auto-fix-promote.mjs outcome ledger entries on origin/main (not on auto-fix-api entries) when invoked via Plan 59-03's workflow PHASE_TAG plumbing.

**Effect on other LOAD-BEARING constraints:** Unchanged.
- Phase 58 `assertTripleGate` body byte-unchanged invariant remains in force (Vitest delta assertion still passes)
- Phase 58 `_skipCiGuard:\s*true` grep count = 1 invariant remains in force
- Phase 58 IMPORTS POLICY grep audit remains in force (Plan 59-03 adds zero new imports — both edits are within the existing import boundary)
- Phase 58 PHASE-58-Y1..Y11 contract preserved (the Y2 dual-path env expression edit extends but does not regress the existing assertions)

**Effect on Plan 59-02 (Work stream B operator runbook):**
- depends_on += "59-03" (added)
- wave: 2 → 3 (re-numbered to honor the new dependency)
- SWEEP-03 Task 5 adds **Stage 3.5 — Set PHASE_TAG repo variable** (`gh variable set PHASE_TAG --body 56-uat`) BEFORE the human merge; captures evidence/uat-47-a-phase-tag-set.txt
- SWEEP-04 Task 6 adds **Step 0 — Verify PHASE_TAG repo variable is still set**; captures evidence/uat-47-b-phase-tag-set.txt
- SWEEP-04 Task 6 Step 3 updated to use DIRECT inspection of post-SWEEP-04 origin/main `tests/e2e/test-cases-quarantine.js` corpus (parse the synthetic entry by `source_triage_finding_id.startsWith('fixture-mutator-uat-47b')`; query the triage issue labels via gh; assert NO `quarantine:ready-for-promotion` label) — checker fix issue 5 (key_links_planned)
- SWEEP-06 Task 7 cleanup adds step 3: `gh variable delete PHASE_TAG` (clears the UAT phase tag so subsequent non-UAT auto-promote runs default back to `phase: '58-promote'`); captures evidence/sweep-06-phase-tag-cleared.txt
- Outcome entry capture: jq filter on `phase=='56-uat'` directly against origin/main ledger (no evidence wrapper); entry-shape acceptance criterion updated from `uat_tag` to `phase`
- 56-UAT-EVIDENCE.md frontmatter: `phase_tag_strategy: live-entry` (was `evidence-only`); body §Phase-tag strategy paragraph rewritten

**Wave structure after revision:**
- Wave 0: 59-00 (baseline)
- Wave 1: 59-01 (mutator + suppression — Work stream A)
- Wave 2: 59-03 (phase argv expansion — Decision C; no file overlap with 59-01)
- Wave 3: 59-02 (live UAT operator runbook — Work stream B; depends on all three)

</scope_adjustments>

---
phase: 59-fixture-mutator-4-uat-re-sweep
fixed_at: 2026-06-05T00:00:00Z
review_path: .planning/phases/59-fixture-mutator-4-uat-re-sweep/59-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 6
skipped: 0
status: all_fixed
---

# Phase 59: Code Review Fix Report

**Fixed at:** 2026-06-05T00:00:00Z
**Source review:** `.planning/phases/59-fixture-mutator-4-uat-re-sweep/59-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope (`critical_warning`): 6 (2 CRITICAL + 4 WARNING)
- Fixed: 6
- Skipped: 0
- Deferred (INFO, out of scope): 3

**Verification gate:** `CI=true npx vitest run tests/e2e/scripts/ tests/unit/auto-fix-promote-gate.test.js` exits 0 with **277 passing tests** (was 272 baseline; +5 new tests added: PHASE-59-Y4, PHASE-59-Y5, I7b, I9, G9-c).

**Load-bearing constraints honored (all six commits):**
- `tests/e2e/lib/llm-ledger.js` — NOT touched (Phase 56 boundary)
- `scripts/auto-fix.mjs` — NOT touched (Phase 56 boundary)
- `.github/workflows/v40-auto-fix.yml` — NOT touched (Pitfall 1)
- `scripts/auto-fix-promote.mjs` — NOT touched; `assertTripleGate` body byte-unchanged; non-comment `_skipCiGuard:\s*true` count remains exactly 1
- All test gates from the post-each-commit verification command exited 0

## Fixed Issues

### CR-01: workflow_dispatch trigger is non-functional — parse step crashes on empty PR_NUMBER

**Files modified:**
- `.github/workflows/v40-auto-promote.yml`
- `tests/e2e/scripts/v40-auto-promote-yaml.test.js`

**Commit:** `04902c0`

**Applied fix:**
- Added required `workflow_dispatch.inputs.pr_number` (string) so the operator names which merged PR to re-promote.
- Added required `workflow_dispatch.inputs.merged` (string, defaulted `'true'`) so the operator explicitly affirms the named PR has been merged (mirroring the `pull_request.merged == true` semantic that the auto-trigger path keys off).
- Updated every PR_NUMBER env extraction (parse step, Triple-gate step, Build PR body step, cpr@v8 branch/title/commit-message, Close source issue, regression issue) with the fallback expression `${{ github.event.pull_request.number || github.event.inputs.pr_number }}`. The pull_request trigger path is byte-equivalent (auto-fill resolves first); the workflow_dispatch path now resolves to the operator-supplied number.
- Added an early `Reject empty PR_NUMBER` step that `exit 1`s with a `::error::` annotation if PR_NUMBER ends up empty — defense-in-depth in case the trigger schema is bypassed somehow.
- Widened the PHASE-59-Y1 test's workflow_dispatch→inputs→PHASE_TAG adjacency check (the previous strict 2-line gap regex no longer matched because the new `pr_number` and `merged` inputs sit ahead of PHASE_TAG).
- Added PHASE-59-Y4 test asserting `pr_number` required+type-string, `merged` required, the PR_NUMBER fallback expression, AND the early hard-fail step's presence.

---

### CR-02: inject-defect.mjs creates GitHub issue BEFORE FORBIDDEN_PATHS gate, orphaning the synthetic issue on dirty trees

**Files modified:**
- `tests/e2e/scripts/inject-defect.mjs`
- `tests/e2e/scripts/e2e-inject-defect.test.js`

**Commit:** `370cfd5`

**Applied fix:**
- Reordered `main()` so `verifyWorkingTreeClean` runs BEFORE `createIssue`. The new sequence is `parseArgs → computeFingerprint → collisionCheckOrAbort → verifyWorkingTreeClean → createIssue → emitCleanupEvidence`. The pre-REVIEW-FIX ordering had verifyWorkingTreeClean firing AFTER createIssue, so any dirty working tree left an orphaned `triage`-labeled GitHub issue with no `56-MUTATOR-CLEANUP.md` entry; the fingerprint was then claimed by an open issue so re-runs hit `collisionCheckOrAbort`'s HARD ABORT — defeating both T-59-03 and T-59-05.
- Added Vitest I7b regression pin: pre-stages a violating `junk.txt` file in the hermetic tmp git repo, asserts `r.status === 1` AND `transcript NOT toMatch /issue create/`. Directly exercises the dirty-tree branch the pre-REVIEW-FIX ordering silently let through. I7 (clean-tree) continues to pass unchanged.

---

### WR-01: `vars.PHASE_TAG` fallback creates a silent ledger-corruption foot-gun on normal pull_request runs

**Files modified:**
- `.github/workflows/v40-auto-promote.yml`
- `tests/e2e/scripts/v40-auto-promote-yaml.test.js`
- `.planning/phases/59-fixture-mutator-4-uat-re-sweep/59-02-PLAN.md`

**Commit:** `9509b50`

**Applied fix:**
- Replaced the three-way fallback `PHASE_TAG: ${{ github.event.inputs.PHASE_TAG || vars.PHASE_TAG || '' }}` with the single-source expression `PHASE_TAG: ${{ github.event.inputs.PHASE_TAG || '' }}`. PHASE_TAG now resolves ONLY from the workflow_dispatch input path; the empty default on the pull_request trigger leaves the script-side `args.phase || '58-promote'` fallback byte-equivalent.
- Updated the PHASE-59-Y3 test regex to assert the new shape (the previous regex pinned the dual-path including `|| vars.PHASE_TAG`).
- Added PHASE-59-Y5 regression guard: `vars.PHASE_TAG` literal MUST NOT appear anywhere in the workflow YAML (description, comments, expressions). Any future commit that re-adds the foot-gun trips the assertion.
- Updated `59-02-PLAN.md` SWEEP-03 Stage 3.5 + Stage 5a + SWEEP-04 Step 0: the runbook now drives PHASE_TAG via post-merge `gh workflow run -f PHASE_TAG=56-uat -f pr_number=<N> -f merged=true` workflow_dispatch re-dispatch (Stage 5a) instead of a pre-merge `gh variable set PHASE_TAG`. Stage 3.5 and SWEEP-04 Step 0 are now no-op placeholders retained for sequencing alignment; legacy text preserved as a "what changed" record.
- Co-designed with CR-01 so the post-merge workflow_dispatch path actually works end-to-end (CR-01's `pr_number` + `merged` inputs are the new operator-supplied substitute for the legacy repo-variable shape).

---

### WR-02: inject-defect.mjs parseArgs silently ignores unknown flags

**Files modified:**
- `tests/e2e/scripts/inject-defect.mjs`
- `tests/e2e/scripts/e2e-inject-defect.test.js`

**Commit:** `4222268`

**Applied fix:**
- Added module-scoped `KNOWN_FLAGS` Set holding the four legal flags + their short alias (`--seed`, `--error-class`, `--phase-dir`, `--help`, `-h`).
- Added a terminal `else if (!KNOWN_FLAGS.has(argv[i]))` clause to the parseArgs loop. Unknown tokens now trigger `process.stderr.write('[inject-defect] unknown flag: <tok>')` + `process.exit(2)`. Mirrors the `scripts/auto-fix-promote.mjs:348-351` reject pattern (the convention is already established by the sibling script).
- Added Vitest I9 test that spawns the script with `--bogus-flag value`, asserts (a) exit 2, (b) stderr matches `/unknown flag/i`, (c) the mock-gh transcript contains NO `issue create` or `issue list` line — proving the reject fires inside parseArgs BEFORE any side effect.

---

### WR-03: collisionCheckOrAbort + createIssue is racy under concurrent invocation

**Files modified:**
- `tests/e2e/scripts/inject-defect.mjs` (documentation only)

**Commit:** `5155282`

**Applied fix (documentation-only, per WR-03 acceptance pattern):**
- Reworded the T-59-02 threat-model entry from "MITIGATED" to "PARTIALLY MITIGATED" with an explicit CAVEAT block naming the TOCTOU race between `gh issue list` and `gh issue create`, and the operator-driven mitigation (single operator at a time + post-hoc SWEEP-06 cleanup inspection of `56-MUTATOR-CLEANUP.md` for duplicate fingerprints).
- Expanded the `collisionCheckOrAbort` JSDoc with a "TOCTOU RACE NOTE" describing the race window, why the runbook makes it unlikely in practice, and why the stricter mitigation (randomized salt) is deliberately rejected (would break the seed-based determinism that T-59-01 and T-59-04 verification rely on).
- No behavioural change. The documentation now honestly reflects the documented limitation. Status flagged as "fixed: requires human verification" only insofar as the trade-off is now a deliberate design decision; the code change is purely comment edits and trivially safe.

---

### WR-04: quarantine-append.mjs MUTATOR-04 suppression uses broad startsWith()

**Files modified:**
- `scripts/quarantine-append.mjs`
- `tests/e2e/scripts/e2e-quarantine-append.test.js`

**Commit:** `646a24b`

**Applied fix:**
- Replaced `.startsWith('fixture-mutator-uat-47b')` with the anchored regex `/^fixture-mutator-uat-47b-iter-\d+$/.test(...)`. The regex pins exact equality against the canonical SOURCE_TAG literal followed by the triage-layer `-iter-<N>` suffix. Anything with extra characters between the SOURCE_TAG and `-iter-` (e.g. `fixture-mutator-uat-47b-extension-2026-iter-1`, `fixture-mutator-uat-47b-v2-iter-1`) fails the regex.
- Note: the prompt suggested `=== 'fixture-mutator-uat-47b'` literal equality, but the data model has the triage layer appending `-iter-<N>` to the run_id so a bare `===` against the SOURCE_TAG never matches; the anchored regex from REVIEW.md's own fix suggestion gives the semantic the prompt requested (exact match anchored on the canonical SOURCE_TAG).
- Updated the JSDoc with the equals-vs-startsWith rationale + cross-reference to the new G9-c regression pin.
- Updated G9-b comment to reflect the new "anchored-equality regex post-REVIEW-FIX WR-04" semantic.
- Added G9-c test: an entry with `source_triage_finding_id: 'fixture-mutator-uat-47b-extension-2026-iter-1'` at stable_runs===3 MUST still receive the `quarantine:ready-for-promotion` label. This pins the equals-vs-startsWith behavior so a future loosening back to startsWith trips the assertion.

## Skipped Issues

None. All 6 in-scope findings were fixed atomically with the prescribed commit-per-finding pattern.

## Deferred Issues (out of scope: INFO tier per `critical_warning`)

The three INFO findings from REVIEW.md are deferred per the prompt's `critical_warning` scope. They remain on the source REVIEW.md for a future `fix_scope: all` pass.

### IN-01: inject-defect.mjs createIssue returns unused `url` field

**File:** `tests/e2e/scripts/inject-defect.mjs:269-270`
**Why deferred:** INFO tier; cosmetic. The `url` is computed but unused. REVIEW.md suggests either dropping the field or emitting it on the success stdout line. Suggested by REVIEW.md to surface URL in stdout for SWEEP-03/SWEEP-04 runbook convenience — defer to next cycle.

### IN-02: v40-auto-promote.yml workflow_dispatch concurrency group collapses to single shared lock

**File:** `.github/workflows/v40-auto-promote.yml:64-66`
**Why deferred:** INFO tier; operationally tolerable. The `concurrency.group: v40-auto-promote-${{ github.event.pull_request.number }}` resolves to `v40-auto-promote-` (empty suffix) on workflow_dispatch with `cancel-in-progress: false`, so concurrent operator UAT runs serialize through a single global lock. The load-bearing A4 test pins `concurrency.group: v40-auto-promote-${{ github.event.pull_request.number }}` verbatim; widening to include `github.run_id` would require an A4 amendment. Defer.

### IN-03: e2e-inject-defect.test.js I7 does not exercise the dirty-tree branch that CR-02 depends on

**File:** `tests/e2e/scripts/e2e-inject-defect.test.js:210-228`
**Why deferred — PARTIALLY RESOLVED BY CR-02:** REVIEW.md flagged I7 as not exercising the dirty-tree branch. The CR-02 fix in this REVIEW-FIX ADDED I7b which exercises exactly that branch. IN-03's literal "Fix" suggestion was to add an I7b case once CR-02 is resolved — that has been done in commit `370cfd5`. The IN-03 finding is therefore effectively resolved as a side effect of CR-02; no separate commit is needed.

---

_Fixed: 2026-06-05T00:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_

---
phase: 41
status: passed
verified: 2026-05-31
must_haves_passed: 5/5
score: 5/5
roadmap_truths_verified: 5/5
overrides_applied: 0
advisory_items: 3
---

# Phase 41: Verifier-Gate Workflow + verify-single-case.mjs CLI Shim — Verification Report

**Phase Goal:** Verifier-on-PR workflow exists so auto-fix PRs (Phase 43+) have somewhere to land — gate must exist BEFORE auto-fix opens its first PR.

**Verified:** 2026-05-31
**Status:** passed
**Re-verification:** No — initial verification.

---

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria 1-5)

| # | Success Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Workflow triggers on `pull_request.opened/synchronize/reopened` filtered to `auto-fix/*`; parses `<!-- affected_cases: id1,id2 -->`; runs each case 3× via `verify-single-case.mjs`; flips draft→ready iff all 3 pass Tier A/B | VERIFIED | `.github/workflows/v40-verifier-gate.yml:44-47` trigger + `branches: ['auto-fix/*']` filter; `scripts/parse-affected-cases.mjs` parser invoked at line 252; `for i in 1 2 3` loop at lines 266-278 invoking `scripts/verify-single-case.mjs`; tier check `if [ "$TIER" != "A" ] && [ "$TIER" != "B" ]` at line 274; `gh pr ready` at line 390 gated on `IS_DRAFT=true` |
| 2 | Same workflow runs full 76-case regression on PR branch; any regression blocks ready | VERIFIED | `regression-suite` job at line 307, `needs: diff-guard`; runs `npx playwright test --config tests/e2e/playwright.config.js specs/regression.spec.js` (no `--grep` filter, no `continue-on-error`) at lines 354-357; `ready-flip` `needs: [verifier-gate, regression-suite]` at line 372 |
| 3 | Diff-size cap: 200 LOC src/, 50 LOC tests/; oversized → `human-review-required` label + PR comment + stay draft | VERIFIED | `diff-guard` job step `Diff-size cap` at lines 106-132 with literals `200` and `50`; rejection step at lines 161-173 calls `gh pr edit "$PR_NUMBER" --add-label "human-review-required"` and `gh pr comment` explaining the failure; `if: failure()` keeps comment/label only on rejection |
| 4 | Verifier code + golden baseline pinned to `origin/main` during PR gate; diff-guard regex bank rejects 6 protected paths pre-`git apply` | VERIFIED | 3 `git checkout origin/main --` lines (225-234) covering `pdf-verifier.js`, `baseline.json`, `pdf-fetch.js` (NOT `golden-loader.js` — confirmed absent: `ls tests/e2e/lib/` shows no such file); sanity loop at 235-240 asserts `git diff origin/main -- $f` is empty; FORBIDDEN_PATHS regex bank in `scripts/check-diff-guard.mjs:46-53` contains exactly all 6 protected paths; invoked pre-anything at workflow line 138 in the `diff-guard` job |
| 5 | Manual end-to-end smoke documented; pushed `auto-fix/test` branch demonstrates the gate | VERIFIED | `docs/v40-verifier-gate-manual-test.md` (151 LOC) with all 6 required H2 sections: Prerequisites, Procedure, Expected Workflow Sequence, Success Signal, Failure-Mode Catalog, Cleanup (plus a 7th unpinned `## Phase 47 cross-check`); references the workflow file, contains literal `<!-- affected_cases: US11427642-spec-short-1 -->` copy-paste block, and 5 failure modes (F1-F5); `tests/unit/v40-verifier-gate-doc.test.js` (10 cases) pins the structure |

**Score: 5/5 ROADMAP success criteria verified.**

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `.github/workflows/v40-verifier-gate.yml` | 4-job PR-gate workflow | VERIFIED | 394 LOC; all 4 jobs present with diamond dependency graph (lines 66, 181, 307, 371) |
| `scripts/check-diff-guard.mjs` | Frozen FORBIDDEN_PATHS bank + checkDiffGuard CLI | VERIFIED | 101 LOC; `Object.freeze`d array of 6 regexes; CLI guard via `import.meta.url === file://${process.argv[1]}` |
| `scripts/parse-affected-cases.mjs` | PR-body parser; stdin/stdout CLI; returns string[] always | VERIFIED | 77 LOC; anchored non-greedy regex; handles null/empty/single-line/multi-line/whitespace variants |
| `scripts/verify-single-case.mjs` | CLI shim around verifyCitation with --case/--runs/--output and 0/1/2 exit contract | VERIFIED | 256 LOC; transport-pure (no `gh` calls); JSON report has exactly 4 top-level keys `{case_id, runs_requested, runs, all_passed_tier_ab}`; VFY-02 isolation preserved (verifier sources untouched) |
| `tests/e2e/scripts/v40-verifier-gate-yaml.test.js` | YAML contract test (V1-V12 + X1-X10 + T1) | VERIFIED | 214 LOC; 23 it() blocks; all 23 GREEN |
| `docs/v40-verifier-gate-manual-test.md` | End-to-end smoke procedure | VERIFIED | 151 LOC; 6 pinned H2 sections + 1 unpinned cross-check section; literal `<!-- affected_cases:` block; references workflow path |
| `tests/unit/check-diff-guard.test.js` | Vitest contract for diff-guard helper | VERIFIED | 13 it() blocks; all GREEN |
| `tests/unit/parse-affected-cases.test.js` | Vitest contract for parser helper | VERIFIED | 10 it() blocks; all GREEN |
| `tests/unit/verify-single-case.test.js` | Vitest contract for CLI shim | VERIFIED | 9 it() blocks; all GREEN |
| `tests/unit/v40-verifier-gate-doc.test.js` | Bit-rot guard for manual-test doc | VERIFIED | 10 it() blocks; all GREEN |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `v40-verifier-gate.yml` diff-guard job | `scripts/check-diff-guard.mjs` | bash pipe | WIRED | Line 138: `git diff --name-only origin/main..HEAD | node scripts/check-diff-guard.mjs` |
| `v40-verifier-gate.yml` verifier-gate job | `scripts/parse-affected-cases.mjs` | env-hop + stdin pipe | WIRED | Lines 251-252: `PR_BODY=$(gh pr view ... --jq '.body')` then `printf '%s' "$PR_BODY" | node scripts/parse-affected-cases.mjs` |
| `v40-verifier-gate.yml` verifier-gate job | `scripts/verify-single-case.mjs` | bash for-loop | WIRED | Lines 266-278: `for i in 1 2 3; do node scripts/verify-single-case.mjs --case "$case_id" --output "$REPORT"; done` |
| `scripts/verify-single-case.mjs` | `tests/e2e/lib/pdf-verifier.js` | ESM named import | WIRED | Line 39: `import { verifyCitation } from '../tests/e2e/lib/pdf-verifier.js'` |
| `scripts/verify-single-case.mjs` | `tests/test-cases.js` + `tests/golden/baseline.json` | ESM imports | WIRED | Lines 40-41 |
| `verifier-gate` job NAME slot | Phase 47 CLEANUP-04 ruleset binding | name reservation | RESERVED (correct) | Job name is exactly `verifier-gate:`; ruleset `v4.0-main-protection` (id 17086676) currently has NO `required_status_checks` rule — Phase 47 will add the binding (slot intentionally unbound this phase) |

### Required-Checks Verification (verifier-supplied)

| # | Required Check | Result |
|---|---|---|
| 1 | Each success criterion mapped to concrete artifacts | PASS (table above) |
| 2 | `npx vitest run` — all tests pass | PASS — **863/863 tests pass** in 55 files, 10.18s |
| 3 | 3 files pinned to origin/main (NOT 4 — `golden-loader.js` confirmed absent) | PASS — `grep -c "git checkout origin/main --"` returns `3`; `ls tests/e2e/lib/` confirms no `golden-loader.js` |
| 4 | 4-job structure: diff-guard → (verifier-gate \|\| regression-suite) → ready-flip | PASS — line numbers: 66 (diff-guard, standalone), 181 (verifier-gate, `needs: diff-guard`), 307 (regression-suite, `needs: diff-guard`), 371 (ready-flip, `needs: [verifier-gate, regression-suite]`) |
| 5 | Zero verbatim forbidden tokens in workflow | PASS — `grep -nE "\[skip ci\]\|gh pr merge --auto\|auto-merge: true\|id-token: write\|actions: write\|pull_request_target" .github/workflows/v40-verifier-gate.yml` returns no matches (exit 1) |
| 6 | `human-review-required` label uses idempotent create-if-exists | PASS — Lines 100-104: `gh label create "human-review-required" --color "d93f0b" --description "..." --force 2>/dev/null \|\| true` mirrors `e2e-nightly.yml:97-102` |
| 7 | `gh pr ready` uses `secrets.GITHUB_TOKEN` (no PAT) | PASS — 8 occurrences of `secrets.GITHUB_TOKEN`; zero matches for any `*PAT*` pattern; `gh pr ready` at line 390 runs under `GH_TOKEN: secrets.GITHUB_TOKEN` env (line 385) |
| 8 | Phase 41 did NOT modify v4.0-main-protection ruleset (verifier-gate name reserved for Phase 47) | PASS — Live ruleset (id 17086676) inspection via `gh api` shows rules `[deletion, non_fast_forward, required_linear_history, pull_request]` — NO `required_status_checks` rule present; the workflow's job name `verifier-gate:` is the reserved-but-unbound slot |
| 9 | Test-count invariant assertion present in workflow | PASS — Lines 140-159: imports `TEST_CASES` from both `git show origin/main:tests/test-cases.js` and the PR branch via `node --input-type=module -e`, fails if `PR_LEN < MAIN_LEN` |
| 10 | FORBIDDEN_PATHS bank has all 6 paths | PASS — `scripts/check-diff-guard.mjs:46-53` contains 6 regexes: `tests/test-cases.js`, `tests/golden/baseline.json`, `tests/e2e/test-cases-quarantine.js`, `.github/workflows/v40-[^/]*.yml`, `tests/e2e/.llm-spend-ledger.json`, `.github/CODEOWNERS`; `[^/]*` glob narrows v40-* to single path-segment (does NOT match `e2e-nightly.yml`) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Full vitest suite passes | `npx vitest run` | 863 passed (55 files) | PASS |
| Phase 41 unit tests pass | `npx vitest run tests/unit/check-diff-guard.test.js tests/unit/parse-affected-cases.test.js tests/unit/verify-single-case.test.js tests/unit/v40-verifier-gate-doc.test.js` | 42 passed | PASS |
| YAML contract test passes | `npx vitest run tests/e2e/scripts/v40-verifier-gate-yaml.test.js` | 23 passed | PASS |
| Forbidden tokens absent | `grep -nE "..." workflow` | exit 1 (no matches) | PASS |
| 4 jobs present | `grep -cE "^  (diff-guard\|verifier-gate\|regression-suite\|ready-flip):" workflow` | 4 | PASS |
| 3 verifier-pin checkouts | `grep -c "git checkout origin/main --" workflow` | 3 | PASS |
| `golden-loader.js` absent | `test -f tests/e2e/lib/golden-loader.js` | ABSENT | PASS |
| FORBIDDEN_PATHS has 6 entries | `grep -nE "^\s*\/\^" scripts/check-diff-guard.mjs` | 6 lines | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| VFY-GATE-01 | 41-01, 41-02, 41-03 | PR trigger + 3× affected-case loop + ready-flip on all Tier A/B | SATISFIED | parse-affected-cases + verify-single-case shim + 3× loop wired in workflow |
| VFY-GATE-02 | 41-03 | 76-case regression on PR branch, static-grep test asserts step | SATISFIED | `regression-suite` job runs full spec; V7 test pins step presence |
| VFY-GATE-03 | 41-03 | 200/50 diff-size cap + human-review-required label + comment | SATISFIED | Diff-size cap step (lines 106-132) + rejection step (161-173) |
| VFY-GATE-04 | 41-01, 41-03 | Verifier pinned to origin/main + 6-path forbidden bank pre-`git apply` | SATISFIED | 3-file pin (225-234) + check-diff-guard.mjs invocation (138) + test-count invariant (140-159) |

### Anti-Patterns Found

None. Files searched for TBD/FIXME/XXX/PLACEHOLDER/"coming soon"/empty-return patterns — no findings on the 6 modified files. The workflow header explicitly paraphrases forbidden tokens (`skip-ci marker`, `the gh pr merge auto-flag`, etc.) per Phase 40-03 scar discipline; this is deliberate documentation, not debt.

### Human Verification Required

None. The phase ships a deliverable (a workflow + helpers + a doc) whose live runtime exercise (a real `auto-fix/*` PR firing the workflow) is the explicit job of Phase 47 CLEANUP-03 per the planning contract. The `docs/v40-verifier-gate-manual-test.md` Phase 47 cross-check section provides the procedure for that future HUMAN-UAT. No human verification is required for Phase 41 closure itself — all VFY-GATE-* contracts are codebase-observable and have been verified.

---

## Advisory Items (Non-Blocking)

These are observations to record but do not affect Phase 41 closure. Surfaced for Phase 47 / project-memory:

### A1. Recurring worktree-base-drift (cross-phase pattern, NOW 3 occurrences in Phase 41 alone)

All three executor plan-agents (41-01, 41-02, 41-03) document in their SUMMARYs that the worktree spawned at an older base (`89141d6` / Phase 38 close) instead of the orchestrator-target base (`5b54443` / Phase 41 plan; later `1cb9f73` after the RESEARCH commit). Each agent self-recovered via the `<worktree_branch_check>` reset block — and the Plan 41-03 SUMMARY explicitly notes "this is now the third documented occurrence in this phase, suggesting the system prompt block needs to be promoted to an automatic step."

This matches the existing user-memory note [feedback_worktree_base_drift.md](feedback_worktree_base_drift.md) and reinforces it. **Recommendation:** the harness should be pinning worktree base to the orchestrator-supplied base automatically (the current documentation-only check costs every executor a ~30-second discovery cycle). Worth recording as a project-memory follow-up.

### A2. Phase 47 CLEANUP-04 ruleset edit is the only remaining wiring

The `v4.0-main-protection` ruleset (id 17086676) currently lists rules `[deletion, non_fast_forward, required_linear_history, pull_request]` — there is NO `required_status_checks` rule. Phase 41 correctly did not modify this (the workflow's job name `verifier-gate:` is the reserved slot, not the binding). Phase 47 CLEANUP-04 must add `required_status_checks` with both `verifier-gate` and `deps-update-gate` in a single atomic ruleset edit.

### A3. Phase 47 inherits 2 HUMAN-UAT procedures from this phase

`docs/v40-verifier-gate-manual-test.md` §Procedure (success path) and §Failure-Mode Catalog F2 (crafted-bypass attempt) are the two procedures Phase 47 CLEANUP-03 will execute as 1 of its 5 live HUMAN-UAT confirmations. The doc's bit-rot guard test (10 cases) pins the 6 load-bearing H2 sections so any future workflow change forces a lockstep doc update.

---

## Verification Summary

All 5 ROADMAP Success Criteria VERIFIED with concrete codebase evidence. All 10 verifier-supplied required checks PASS. All 4 declared requirements (VFY-GATE-01..04) SATISFIED. Full Vitest suite at 863/863. Zero blockers, zero gaps, zero human verification items pending.

The verifier-gate workflow exists, is wired end-to-end, and is ready to receive its first `auto-fix/*` PR (Phase 43). The `verifier-gate` job NAME is correctly reserved as the unbound Phase 47 slot.

---

_Verified: 2026-05-31_
_Verifier: Claude (gsd-verifier, Opus 4.7 1M)_

---
phase: 44
status: passed
verified: 2026-05-31
must_haves_passed: 5/5
score: 5/5
overrides_applied: 0
---

# Phase 44: v40-auto-promote.yml + Triple-Gate _skipCiGuard — Verification Report

**Phase Goal:** Merge → quarantine→golden promotion loop closed without breaking the human-gated trust invariant.
**Verified:** 2026-05-31
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Success Criteria Coverage

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Trigger on `pull_request.closed && merged && contains(labels, 'auto-fix:verified')`; triple-gate asserts label + merged + triage-sourced | VERIFIED | `.github/workflows/v40-auto-promote.yml` L44-46 `on: pull_request: types: [closed]`; L67 job-level `if: github.event.pull_request.merged == true && contains(github.event.pull_request.labels.*.name, 'auto-fix:verified')`; script-level triple-gate at `scripts/auto-fix-promote.mjs` L67-81 (3 throws for each leg) |
| 2 | Auto-promote opens SEPARATE follow-up PR adding case to `tests/test-cases.js` (NEVER direct-to-main); requires human merge | VERIFIED | Workflow L201-215 uses `peter-evans/create-pull-request@v8` with `branch: auto-promote/<src>-<pr>` (L206), `draft: false` (L208), `delete-branch: true` (L209), `base: main` (L207); no `git push origin main` anywhere in workflow; Phase 39 repo setting "Allow auto-merge: OFF" enforces human merge |
| 3 | After follow-up PR: `gh issue close <source> --reason completed --comment "Fixed in PR #X (auto-promote PR #Y)"` | VERIFIED | Workflow L217-231 — close step gated `if: steps.cpr.outputs.pull-request-url != ''` (L223); runs `gh issue close "$SOURCE_ISSUE" --reason completed --comment "Fixed in PR #$AUTO_FIX_PR (auto-promote PR $AUTO_PROMOTE_URL)"` (L229-231) |
| 4 | Post-merge verifier re-check on `main` HEAD; failure files regression issue with `e2e-nightly` + `WRONG_CITATION` + `post-merge-regression` labels | VERIFIED | Workflow L233-248 — `git fetch origin main` + `git checkout origin/main` (L244-245); per-case loop `node scripts/verify-single-case.mjs --case "$CASE_ID" --runs 1` (L247); L250-267 files regression issue on `steps.postmerge.outcome == 'failure'` with all three labels (`--label e2e-nightly --label WRONG_CITATION --label post-merge-regression`); zero `merge_commit_sha` references in file |
| 5 | Triple-gate per-leg rejection paths exercised by Vitest mocks (label/merged/triage all fail with explicit errors) | VERIFIED | `tests/unit/auto-fix-promote-gate.test.js` — 8 cases pass (T1=label-missing, T2=merged-false, T3=triage-missing, T4=happy-path, M1-M4=parseSourceIssue precedence + fallback + throw); each leg throws `TRIPLE_GATE_FAILED: <leg> — <details>` per script L70/75/79 |

**Score:** 5/5 success criteria verified

### Observable Truths (PLAN frontmatter must_haves)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | When auto-fix PR with auto-fix:verified merges, v40-auto-promote.yml fires and runs auto-fix-promote.mjs exactly once | VERIFIED | Workflow trigger + job-if (L44-67); per-case loop at L150-173 invokes `node scripts/auto-fix-promote.mjs` |
| 2 | Triple-gate asserts all three legs before any quarantine mutation; failures throw TRIPLE_GATE_FAILED and exit non-zero | VERIFIED | Script L67-81 (assertTripleGate); main() L210-219 try/catch → process.exit(1); Vitest T1-T4 all pass |
| 3 | Source issue identifiable via `<!-- source_issue: N -->` (preferred) or `Fix #N`/`Fixes #N` fallback | VERIFIED | Script L88-106 (parseSourceIssue); helper L23 emits `<!-- source_issue: ${issue} -->`; Vitest M1-M4 all pass |
| 4 | After runPromote mutates corpus, SEPARATE auto-promote/* PR opens via cpr@v8 (NEVER direct-to-main) | VERIFIED | Workflow L201-215; branch `auto-promote/<src>-<pr>` (NOT auto-fix/); zero `git push origin main` |
| 5 | After follow-up PR opens, source triage issue closed with completed reason | VERIFIED | Workflow L217-231 |
| 6 | Post-merge verifier checks origin/main HEAD (NOT merge_commit_sha); failure files regression issue with 3 labels | VERIFIED | Workflow L244-248 (origin/main checkout); zero merge_commit_sha matches; L260-267 regression issue with all 3 labels |
| 7 | Triple-gate per-leg rejection paths exercised by Vitest mocks with explicit error messages | VERIFIED | 8/8 cases in auto-fix-promote-gate.test.js pass |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `.github/workflows/v40-auto-promote.yml` | 267 LOC; full workflow with parse/triple-gate/cpr/close/verifier/regression steps | VERIFIED | 268 LOC; all expected steps present (checkout, setup-node, npm ci, parse, source-labels, triple-gate loop, build body, cpr@v8, close source, postmerge re-check, regression issue) |
| `scripts/auto-fix-promote.mjs` | CLI shim exporting assertTripleGate + parseSourceIssue + parseArgv | VERIFIED | 278 LOC; exports `assertTripleGate`, `parseSourceIssue`, `parseArgv`; main() loops single-case-per-invocation |
| `scripts/build-auto-fix-pr-body.mjs` | +1 line: `<!-- source_issue: ${issue} -->` on line 2 | VERIFIED | L23 emits the comment as 2nd array element; B7 test confirms `out.split('\n')[1]` exact match |
| `tests/unit/auto-fix-promote-gate.test.js` | T1-T4 + M1-M4 (8 cases) | VERIFIED | 8/8 pass; all 5 TRIPLE_GATE_FAILED branches covered |
| `tests/e2e/scripts/v40-auto-promote-yaml.test.js` | A1-A18 + X1-X4 (22 cases) | VERIFIED | 22/22 pass; trigger, gate, concurrency, permissions, parse, dispatcher, cpr, close, verifier, regression all pinned |
| `tests/unit/build-auto-fix-pr-body.test.js` | B1-B6 preserved + B7 new | VERIFIED | 7/7 pass |
| `scripts/promote-from-quarantine.mjs` | BYTE-UNCHANGED from Phase 35 baseline | VERIFIED | Last commit on file is `51c3555` (Phase 35 review-fix `WR-08`); zero Phase 44 commits modified it; diff between last-touch and HEAD = 0 lines |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| v40-auto-promote.yml | auto-fix-promote.mjs | `node scripts/auto-fix-promote.mjs --pr ... --case-id ...` | WIRED | Workflow L164 invokes script with full argv |
| auto-fix-promote.mjs | promote-from-quarantine.mjs | `import { runPromote }; runPromote({_skipCiGuard: true})` | WIRED | Script L58 imports; L245-249 invokes with `_skipCiGuard: true` + `confirm: true` |
| v40-auto-promote.yml | verify-single-case.mjs | `git checkout origin/main; node scripts/verify-single-case.mjs --case "$CASE_ID" --runs 1` | WIRED | Workflow L245-247 |
| v40-auto-promote.yml | peter-evans/create-pull-request@v8 | `uses: peter-evans/create-pull-request@v8` with `branch: auto-promote/...` | WIRED | Workflow L203-215 (single usage, A11 enforces exactly-one match) |
| build-auto-fix-pr-body.mjs | v40-auto-promote.yml | PR body line-2 `<!-- source_issue: N -->`; workflow parse step grep-extracts | WIRED | Helper L23 emits; workflow L121-128 grep-extracts via `grep -oE '<!-- source_issue: [0-9]+ -->'` |

### Required Checks (per task brief)

| # | Check | Expected | Actual | Status |
|---|-------|----------|--------|--------|
| 1 | Success criteria mapped to artifacts | each → concrete file | see SC table above | PASS |
| 2 | `npx vitest run` | Phase 44 tests pass; no Phase 44 regressions | 974/975 pass (sole failure: `e2e-weekly-digest.test.js` `12.50` literal — documented pre-existing flake in Phase 43 SUMMARY L120-134; NOT a Phase 44 regression) | PASS |
| 3 | `scripts/promote-from-quarantine.mjs` byte-unchanged | empty diff vs pre-Phase-44 | last touch = `51c3555` (Phase 35 review); zero Phase 44 commits modified it; `git diff <last>..HEAD` = 0 lines | PASS |
| 4 | Triple-gate explicit per-leg rejection messages | 3 distinct errors | L70 prLabels — missing 'auto-fix:verified'; L75 merged — pull request not merged; L79 sourceIssueLabels — source issue missing 'triage'; +L102 parseSourceIssue throw | PASS |
| 5 | Auto-promote branch prefix is `auto-promote/*` (NOT `auto-fix/*`) | one auto-promote match, zero auto-fix matches | L206 `branch: auto-promote/${{...}}-${{...}}`; zero `branch:\s*auto-fix/` matches | PASS |
| 6 | Post-merge verifier checks origin/main HEAD (NOT merge_commit_sha) | origin/main present; merge_commit_sha absent | L244-245 `git fetch origin main` + `git checkout origin/main`; zero `merge_commit_sha` matches | PASS |
| 7 | Phase 43 helper extended with `<!-- source_issue: N -->` comment | line 2 of body, after affected_cases | helper L22-23 — affected_cases on element 0, source_issue on element 1 | PASS |
| 8 | NO ledger entry from auto-fix-promote.mjs (Pitfall 6 transport boundary) | imports only node:* and ./promote-from-quarantine.mjs | grep audit returns zero non-allowed imports | PASS |
| 9 | `secrets.GITHUB_TOKEN` only; no PATs; no forbidden verbatim tokens | zero PAT refs, zero `gh pr merge --auto`, `auto-merge: true`, `id-token: write`, `pull_request_target` | combined grep returns zero matches across all forbidden tokens | PASS |

### Anti-Pattern Scan

No blocker patterns found. No `TBD`/`FIXME`/`XXX` markers in Phase 44 files. No hollow/stub patterns; all artifacts substantive and wired.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Module exports assertTripleGate + parseSourceIssue | `node -e 'import("./scripts/auto-fix-promote.mjs").then(m=>console.log(typeof m.assertTripleGate, typeof m.parseSourceIssue))'` | (covered by Vitest T1-T4 + M1-M4 which exercise the exported functions) | PASS (via Vitest) |
| Helper emits source_issue on line 2 | Vitest B7 (`out.split('\n')[1] === '<!-- source_issue: 42 -->'`) | pass | PASS |
| Workflow YAML triggers + gating shape | 22-case grep contract in v40-auto-promote-yaml.test.js | 22/22 pass | PASS |

### Probe Execution

No formal `scripts/*/tests/probe-*.sh` declared by this phase. Per task brief: "Live demo of the full chain deferred to Phase 47 HUMAN-UAT (a)." This phase ships infrastructure; live end-to-end execution is intentionally deferred. SKIPPED.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| PROMOTE-01 | 44-01-PLAN | Triple-gate workflow trigger + assertion | SATISFIED | SC #1 evidence |
| PROMOTE-02 | 44-01-PLAN | Separate follow-up PR; never direct-to-main; human merge | SATISFIED | SC #2 evidence |
| PROMOTE-03 | 44-01-PLAN | Source issue close with completed reason | SATISFIED | SC #3 evidence |
| PROMOTE-04 | 44-01-PLAN | Post-merge verifier + regression issue with 3 labels | SATISFIED | SC #4 evidence |

### Gaps Summary

None. All 5 success criteria, all 7 must-have truths, all 5 key links, all required artifacts, and all 9 required checks pass. The sole test-suite failure is the documented pre-existing weekly-digest flake (Phase 43 SUMMARY L120-134), not a Phase 44 regression. The live end-to-end HUMAN-UAT chain (auto-fix → verifier-gate → human merge → auto-promote → CODEOWNER merge) is intentionally deferred to Phase 47 CLEANUP-03 (a) per ROADMAP design — this phase ships the infrastructure that the HUMAN-UAT will exercise.

---

_Verified: 2026-05-31_
_Verifier: Claude (gsd-verifier)_

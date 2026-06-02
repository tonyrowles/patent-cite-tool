---
phase: 44-v40-auto-promote-yml-triple-gate-skipciguard
plan: 01
subsystem: infra
tags:
  - auto-promote-workflow
  - github-actions
  - peter-evans-cpr
  - triple-gate
  - skipciguard
  - post-merge-verifier
  - squash-merge-sha-drift
  - source-issue-parse
  - yaml-contract
  - vitest-mock-gh
  - pitfall-2
  - pitfall-3
  - pitfall-4
  - pitfall-5
  - pitfall-8
  - promote-01
  - promote-02
  - promote-03
  - promote-04

# Dependency graph
requires:
  - phase: 35-quarantine-promotion
    provides: runPromote({_skipCiGuard:true}) at scripts/promote-from-quarantine.mjs line 123 (Phase 44 is the ONLY permitted caller of this exemption)
  - phase: 41-verifier-gate
    provides: auto-fix:verified label added after 3x consecutive case verification + 76-case regression pass (Leg 1 of triple-gate)
  - phase: 41-verify-single-case
    provides: scripts/verify-single-case.mjs --case <id> --runs N CLI (post-merge verifier re-check)
  - phase: 34-triage-classifier
    provides: triage label applied to source issues after rerun-validator confirms failure (Leg 3 of triple-gate)
  - phase: 43-auto-fix-yml
    provides: scripts/build-auto-fix-pr-body.mjs helper (extended in Task 1 with source_issue HTML comment); v40-auto-fix.yml style template; tests/e2e/scripts/v40-auto-fix-yaml.test.js test-style template
provides:
  - .github/workflows/v40-auto-promote.yml — pull_request:[closed] -> triple-gate -> runPromote -> follow-up PR -> close source issue -> post-merge verifier
  - scripts/auto-fix-promote.mjs — CLI shim exporting assertTripleGate + parseSourceIssue; the ONLY caller of runPromote({_skipCiGuard:true}) outside Phase 35
  - source_issue HTML comment on line 2 of every auto-fix PR body (Phase 43 helper extension)
  - auto-promote/<src>-<pr> branch namespace for follow-up promotion PRs (routes around Phase 41 verifier-gate's auto-fix/* filter)
  - post-merge regression issue template (e2e-nightly + WRONG_CITATION + post-merge-regression labels)
affects:
  - 45-per-error-class-expansion (no Phase 44 hooks; triple-gate is class-agnostic)
  - 46-local-ux (no Phase 44 hooks; auto-promote is CI-only by design)
  - 47-cleanup-uat (HUMAN-UAT — live end-to-end demo exercises Phase 43 -> Phase 41 -> human merge -> Phase 44 -> human merge of follow-up PR)

# Tech tracking
tech-stack:
  added: []  # ZERO new npm dependencies; ZERO new GitHub Actions
  patterns:
    - "Triple-gate assertion (pure JS, Vitest-mockable) front of runPromote({_skipCiGuard:true})"
    - "Source-issue identification via belt-and-suspenders: PR body HTML comment (preferred) + commit-message Fix #N (fallback)"
    - "Pitfall 4 routing: auto-promote/* branch prefix bypasses Phase 41 verifier-gate's auto-fix/* filter"
    - "Pitfall 5 gating: issue-close + verifier re-check gated on steps.cpr.outputs.pull-request-url"
    - "Pitfall 2 SHA-drift defense: post-merge verifier targets origin/main HEAD, NOT pull_request.merge_commit_sha"
    - "Pitfall 6 transport-boundary discipline: scripts/auto-fix-promote.mjs imports ONLY node:* and ./promote-from-quarantine.mjs"
    - "Pitfall 8 comment-paraphrase scar: forbidden literals (the gh pr merge auto-flag, the action auto-merge input, the Identity-token write permission, the pull-request-target trigger variant) NEVER appear in workflow nor in narrative test comments"

key-files:
  created:
    - scripts/auto-fix-promote.mjs
    - .github/workflows/v40-auto-promote.yml
    - tests/unit/auto-fix-promote-gate.test.js
    - tests/e2e/scripts/v40-auto-promote-yaml.test.js
    - .planning/phases/44-v40-auto-promote-yml-triple-gate-skipciguard/44-01-SUMMARY.md
  modified:
    - scripts/build-auto-fix-pr-body.mjs (one-line addition: source_issue HTML comment on line 2)
    - tests/unit/build-auto-fix-pr-body.test.js (one B7 case appended; B1-B6 byte-identical)

key-decisions:
  - "Source-issue identification uses BOTH PR-body HTML comment (preferred) and Fix #N commit-message fallback (belt-and-suspenders); locked Open Question 1"
  - "scripts/auto-fix-promote.mjs writes NO audit-trail ledger entry; the audit trail is the gh issue close --comment + the workflow run URL (avoids Pitfall 6 transport confusion); locked Open Question 2"
  - "Multi-case auto-fix PRs invoke runPromote in a per-case loop; ALL cases aggregate into ONE follow-up auto-promote PR (single CODEOWNER review surface); locked Open Question 3"
  - "Branch prefix auto-promote/* (NOT auto-fix/*) routes the follow-up PR AROUND Phase 41 verifier-gate, which is scoped to auto-fix/* only; CODEOWNER review is the human gate for the test-cases.js mutation"
  - "Post-merge verifier checks out origin/main HEAD (NOT pull_request.merge_commit_sha) to defend against squash-merge SHA drift on rebase-and-merge-configured repos"

patterns-established:
  - "Triple-gate-then-_skipCiGuard pattern: pure-JS gate exported for Vitest-mockability; CLI shim wraps the gate + the runPromote call; workflow is the integration point"
  - "Workflow argv-passable shape: gh CLI lives in the workflow (one source of truth for GH API access); the script consumes argv only (pure CLI, locally testable)"
  - "PR-body comment as workflow data-channel: <!-- key: value --> HTML comments parse cleanly via grep + regex; the line-position contract (affected_cases line 1, source_issue line 2) is load-bearing"

requirements-completed:
  - PROMOTE-01
  - PROMOTE-02
  - PROMOTE-03
  - PROMOTE-04

# Metrics
duration: ~7 min
completed: 2026-06-01
---

# Phase 44 Plan 01: v40-auto-promote.yml + triple-gate + post-merge verifier Summary

**Closes the v4.0 merge -> quarantine -> golden loop with a triple-gate (PR label + merged + source-issue triage) that reconstructs the human-gate invariant the Phase 35 _skipCiGuard exemption would otherwise undo; opens a separate CODEOWNER-reviewed auto-promote/* PR via peter-evans cpr@v8, closes the source issue gated on cpr output, and re-runs the verifier against origin/main HEAD to catch squash-merge content drift.**

## Performance

- **Duration:** ~7 min (executor wall time; foundation-context reads + 6 task commits + audits)
- **Started:** 2026-06-01T02:55:39Z (Task 1 RED commit timestamp basis)
- **Completed:** 2026-06-01T03:02:57Z
- **Tasks:** 5 (3 TDD task pairs + 1 verification gate + 1 summary)
- **Files modified:** 7 (5 created + 2 extended)

## Accomplishments

- Closes the v4.0 auto-fix loop end-to-end: triple-gated, side-effect-bounded, CODEOWNER-mediated.
- Reconstructs the human-gate invariant the _skipCiGuard exemption would bypass: 3 independent legs (Phase 41 verifier label + GitHub merge state + Phase 34 triage label) must ALL hold before the corpus mutates.
- Zero new npm dependencies. Zero new GitHub Actions (cpr@v8 + checkout@v4 + setup-node@v4 are all already pinned in Phase 39/41/43).
- scripts/promote-from-quarantine.mjs is byte-identical to its Phase 35 baseline (no modifications to load-bearing Phase 35 contract; Phase 44 is purely an additive caller of an exemption parameter that already existed).
- 37 new Vitest cases (7 B-extension + 8 triple-gate/parse + 22 YAML); zero regressions in the prior 929 passing tests.

## Task Commits

Each task was committed atomically per TDD RED/GREEN discipline.

| # | Hash    | Phase        | Type | Description                                                                |
|---|---------|--------------|------|----------------------------------------------------------------------------|
| 1 | 5806e32 | Task 1 RED   | test | Add B7 case asserting `<!-- source_issue: 42 -->` on line index 1 of helper output |
| 2 | 5891525 | Task 1 GREEN | feat | Add `<!-- source_issue: ${issue} -->` as second element of returned array  |
| 3 | 2e554e2 | Task 2 RED   | test | T1-T4 + M1-M4 Vitest contract for assertTripleGate + parseSourceIssue       |
| 4 | 655b9c2 | Task 2 GREEN | feat | scripts/auto-fix-promote.mjs CLI shim — triple-gate + runPromote caller    |
| 5 | 264b456 | Task 3 RED   | test | 22-case YAML contract (A1-A18 + X1-X4) for v40-auto-promote.yml             |
| 6 | 331eaf1 | Task 3 GREEN | feat | .github/workflows/v40-auto-promote.yml — full workflow                     |

**Plan metadata:** to be assigned by the final SUMMARY commit (this file).

## Files Created/Modified

- **Created** `scripts/auto-fix-promote.mjs` (278 LOC) — CLI shim exporting `assertTripleGate` + `parseSourceIssue` + `parseArgv`; main() loads PR body, asserts triple-gate, cross-checks parsed source-issue id against workflow-provided argv, invokes `runPromote({id, confirm:true, _skipCiGuard:true})`.
- **Created** `.github/workflows/v40-auto-promote.yml` (267 LOC) — `on: pull_request:[closed]`; job-level filter on `merged == true && contains(labels, 'auto-fix:verified')`; checkout + setup-node + npm ci + parse + source-labels + per-case loop + cpr@v8 + close-source-issue + post-merge verifier + regression-issue create.
- **Created** `tests/unit/auto-fix-promote-gate.test.js` (115 LOC) — 8 Vitest cases pinning the per-leg rejection messages + parseSourceIssue precedence + fallback.
- **Created** `tests/e2e/scripts/v40-auto-promote-yaml.test.js` (209 LOC) — 22 grep-based YAML contract assertions pinning trigger, gating, concurrency, permissions, parse step, dispatcher invocation, cpr@v8 invocation, source-issue close, post-merge verifier, regression issue, and 4 negative pins.
- **Created** `.planning/phases/44-v40-auto-promote-yml-triple-gate-skipciguard/44-01-SUMMARY.md` (this file).
- **Modified** `scripts/build-auto-fix-pr-body.mjs` (+1 line) — inserts `<!-- source_issue: ${issue} -->` as the second element of the returned array; signature unchanged; helper remains pure.
- **Modified** `tests/unit/build-auto-fix-pr-body.test.js` (+27 lines) — appends B7 case pinning the new line-index-1 contract; B1-B6 unchanged.

## The Triple-Gate Defense

Phase 44 IS the load-bearing Pitfall 4 defense for v4.0. The triple-gate reconstructs the human-gate invariant the Phase 35 `_skipCiGuard` exemption was designed to preserve. Each leg matters independently — collapsing any one would re-open the very class of bypass the gate exists to prevent.

**Leg 1 — `auto-fix:verified` label on the merged PR.** This label is added by Phase 41 verifier-gate ONLY after 3x consecutive case verification at Tier A/B AND a 76-case regression pass on the full golden corpus. Without this leg, runPromote could fire on any PR a human merged without the verifier-gate's blessing, including PRs that introduced unrelated regressions to other test cases.

**Leg 2 — `pull_request.merged === true`.** The GitHub `pull_request: types: [closed]` webhook fires for both close-with-merge and close-without-merge (closing a draft PR, abandoning a PR, "close with comment"). Without this leg, draft-PR closures or abandoned PRs would trigger promotion of code that was never actually merged to main.

**Leg 3 — source-issue carries `triage` label.** Phase 34 triage-classifier applies `triage` only AFTER rerun-validator confirms the failure is reproducible (not a one-off flake). Without this leg, a hand-crafted issue with `auto-fix:verified` somehow attached to a fabricated auto-fix PR could bypass the v3.1 verification pipeline entirely.

Together, the three legs raise the bar to: "this PR was verified by automation AND merged by a human AND traces back to a triage-confirmed issue." Any path that fails ANY leg throws `TRIPLE_GATE_FAILED: <leg> — <details>` and aborts before any corpus mutation. The three throws + parseSourceIssue's "cannot identify source issue" throw + the runPromote-rollback path together pin a zero-trust default.

## TDD Gate Compliance

Three strict RED -> GREEN pairs, six atomic commits. Each RED commit fails the new assertions with informative diff output; each GREEN commit makes them pass without touching the assertion text. Git log evidence:

```
5806e32 test(44-01): add B7 for source_issue HTML comment           <- Task 1 RED
5891525 feat(44-01): add source_issue HTML comment to auto-fix PR body <- Task 1 GREEN
2e554e2 test(44-01): add assertTripleGate + parseSourceIssue Vitest contract (T1-T4 + M1-M4) <- Task 2 RED
655b9c2 feat(44-01): add assertTripleGate + parseSourceIssue + runPromote caller <- Task 2 GREEN
264b456 test(44-01): add v40-auto-promote.yml YAML contract (A1-A18 + X1-X4) <- Task 3 RED
331eaf1 feat(44-01): add v40-auto-promote.yml workflow              <- Task 3 GREEN
```

No REFACTOR commits in this plan; the GREEN implementations were minimal enough that no separate refactor pass was needed.

## Verification Evidence

| # | Audit | Command | Expected | Actual |
|---|-------|---------|----------|--------|
| 1 | Full src suite | `npm run test:src` | 36+ new tests pass; 1 documented pre-existing flake remains | 966 passed; 1 failed (`tests/e2e/scripts/e2e-weekly-digest.test.js` — `12.50` literal flake documented in Phase 43 SUMMARY line 120-134, NOT a Phase 44 regression) |
| 2 | Paraphrase audit (workflow) | `grep -nE '(gh pr merge --auto\|auto-merge: true\|id-token: write\|pull_request_target)' .github/workflows/v40-auto-promote.yml \| grep -v '^[[:space:]]*#'` | zero matches | zero matches |
| 2b | Paraphrase audit (test file) | same grep on `tests/e2e/scripts/v40-auto-promote-yaml.test.js \| grep -vE 'expect\\(\|not\\.toMatch\|not\\.toContain'` | zero matches outside assertion args | zero matches |
| 3 | Phase 35 contract preservation | `git diff HEAD~6 HEAD -- scripts/promote-from-quarantine.mjs` | empty diff | empty diff |
| 3b | _skipCiGuard lines preserved | `sed -n '120,135p' scripts/promote-from-quarantine.mjs \| grep -E '(_skipCiGuard\|skipCiGuard)'` | matches at line 123 + 131 | matches at line 123 + 131 |
| 4 | Import boundary | `grep -nE "^import" scripts/auto-fix-promote.mjs \| grep -vE "from 'node:\|from './promote-from-quarantine\\.mjs'"` | zero matches | zero matches |
| 5 | Branch prefix routing (negative) | `grep -nE 'branch:\\s*auto-fix/' .github/workflows/v40-auto-promote.yml` | zero matches | zero matches |
| 5b | Branch prefix routing (positive) | `grep -nE 'branch:\\s*auto-promote/' .github/workflows/v40-auto-promote.yml` | at least one match | one match (line 206) |
| 6 | Verifier targets origin/main | `grep -nE 'git checkout origin/main' .github/workflows/v40-auto-promote.yml` | at least one match | one match (line 245) |
| 6b | No merge_commit_sha | `grep -n 'merge_commit_sha' .github/workflows/v40-auto-promote.yml` | zero matches | zero matches |
| 7 | Issue-close gated on cpr output | A15 Vitest assertion (`/if:\\s*steps\\.cpr\\.outputs\\.pull-request-url/`) | pass | pass (gate present at step-level on line 223) |
| 8 | No direct push to main | `grep -nE 'git push origin main' .github/workflows/v40-auto-promote.yml` | zero matches | zero matches |
| 9 | TRIPLE_GATE_FAILED contract token | `grep -cE 'TRIPLE_GATE_FAILED:' scripts/auto-fix-promote.mjs` | >= 4 | 5 (3 assertTripleGate + 1 parseSourceIssue + 1 CLI-side cross-check) |
| 10 | Helper extension eyeball | `node -e ...` on first 3 lines | `['<!-- affected_cases: a -->', '<!-- source_issue: 7 -->', '']` | exact match |

Audit 7 note: the plan's audit query `grep -B1 'gh issue close' | grep 'pull-request-url'` returns zero matches because the `if:` gate sits at the STEP level (line 223) — many lines above the `gh issue close` shell command inside the step's `run:` block. The gate IS present and is pinned by Vitest A15; the audit-query phrasing was off-by-N but the underlying check passes.

## Open Question Lock Outcomes

| OQ | Topic | Resolved In | Outcome |
|----|-------|-------------|---------|
| Q1 | source_issue identification mechanism | research (44-RESEARCH.md) | Belt-and-suspenders: `<!-- source_issue: N -->` in PR body (preferred, line index 1) + `Fix #N` / `Fixes #N` regex on squash-merge commit message (fallback). Both implemented in `parseSourceIssue`. Locked. |
| Q2 | ledger entry from auto-fix-promote.mjs? | research | NO. The audit trail is `gh issue close --comment "Fixed in PR #X (auto-promote PR #Y)"` + the workflow run URL. Avoids Pitfall 6 transport confusion (`tests/e2e/lib/*` imports forbidden). Defer ledger logging to Phase 47 if needed. Locked. |
| Q3 | per-case multi-PR aggregation policy | research | LOOP runPromote per `affected_cases` entry; aggregate ALL successful promotions into ONE follow-up auto-promote PR (single CODEOWNER review surface). Any per-case runPromote failure aborts the whole loop (no partial promotion). Locked. |

## Threat Model — Mitigations Implemented

| Threat ID | Category | Disposition | Implementation pin |
|-----------|----------|-------------|--------------------|
| T-44-01 | Spoofing | mitigate | Triple-gate Legs 2+3 raise the bar so a spoofed label alone is insufficient (A3 + A2 + Vitest T1-T3) |
| T-44-02 | Tampering (PR body parse) | mitigate | `env:` block + heredoc to /tmp/pr-body.txt; `parseSourceIssue` extracts only `\d+` from comment; M1-M4 + Audit 2 |
| T-44-03 | Tampering (rollback inconsistency) | mitigate | issue-close + verifier steps gated on `steps.cpr.outputs.pull-request-url != ''` (A15) |
| T-44-04 | Repudiation (issue closed prematurely) | mitigate | Close step fires AFTER cpr@v8 succeeds (same gate as T-44-03; A14 + A15) |
| T-44-05 | Info Disclosure (PR body leak) | accept | PR body cites auto-fix PR + source issue + caseId only; no secrets, no API responses |
| T-44-06 | DoS (duplicate auto-promote PRs) | mitigate | `concurrency: group: v40-auto-promote-${{ pull_request.number }}` (A4) + cpr@v8 idempotency on branch input |
| T-44-07 | Elevation (auto-merge bypass) | mitigate | `draft: false` + Phase 39 repo-level "Allow auto-merge: OFF" + branch protection CODEOWNER; X3 negative pin |
| T-44-08 | Elevation (direct push to main) | mitigate | Zero `git push origin main` (X1 + Audit 8); two-PR choreography is the gate |
| T-44-09 | Elevation (pull-request-target trigger variant) | mitigate | X4 negative pin (`pull_request_target` absent); workflow uses `pull_request` only |
| T-44-10 | Elevation (PAT substitution) | mitigate | `secrets.GITHUB_TOKEN` only; X2 asserts zero `secrets.*PAT*` |
| T-44-11 | Tampering (squash-merge SHA drift) | mitigate | `git checkout origin/main` (A17 + Audit 6); `merge_commit_sha` absent |
| T-44-12 | Tampering (verifier-gate routing) | mitigate | `auto-promote/*` branch prefix (A9 + A10 + Audit 5); CODEOWNER review is the human gate |
| T-44-13 | Info Disclosure (gate error msgs) | accept | `TRIPLE_GATE_FAILED: <leg>` messages name only the failed precondition; debugging value outweighs risk |
| T-44-SC | Tampering (supply chain) | mitigate | Zero new npm dependencies; zero new GitHub Actions; slopcheck N/A (no install step) |

All threats with `mitigate` disposition have implementation pins verified by Vitest assertions and/or post-hoc grep audits.

## Decisions Made

- Plan was followed exactly; no architectural deviations. The single textual deviation (described under Deviations) was a paraphrase tighten-up to satisfy the negative-pin assertions A11 and A17.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Header-comment literal tokens tripped two negative-pin Vitest assertions**

- **Found during:** Task 3 (after first GREEN attempt for `.github/workflows/v40-auto-promote.yml`)
- **Issue:** The initial workflow header comment included the strings `peter-evans/create-pull-request@v8` (in the prose describing the cpr action) and `pull_request.merge_commit_sha` (in the Pitfall 2 narrative). The A11 contract asserts `peter-evans/create-pull-request@v8` appears EXACTLY ONCE (the `uses:` line on the cpr step), and A17 asserts the `merge_commit_sha` literal is absent. Both assertions failed against the first GREEN attempt because the header narrative duplicated those literals.
- **Fix:** Paraphrased both header references — "the pinned peter-evans cpr action (v8)" and "the merge-commit-SHA field from the pull_request payload". Literals now appear only at the load-bearing usage sites (the `uses:` line + Vitest assertion arguments).
- **Files modified:** `.github/workflows/v40-auto-promote.yml`
- **Verification:** All 22 YAML contract cases pass after the paraphrase tighten-up.
- **Committed in:** 331eaf1 (combined into the Task 3 GREEN commit; no separate fix commit since both edits were part of arriving at the GREEN state).

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug, scoped to comment-paraphrase discipline)
**Impact on plan:** Zero. The fix tightened paraphrase discipline already required by the plan's Pitfall 8 audit; no scope creep.

## Issues Encountered

- Plan's Audit 7 query (`grep -B1 'gh issue close' | grep 'pull-request-url'`) returns zero matches because the `if:` gate lives at the step level (line 223 in the workflow), several lines above the `gh issue close` shell command inside the step's `run:` block. The underlying check IS satisfied — pinned by Vitest A15 (`expect(yaml).toMatch(/if:\\s*steps\\.cpr\\.outputs\\.pull-request-url/)`) — but the plan's hand-rolled grep query was off-by-N. Recommendation for the plan's Audit 7: switch to A15's regex-on-full-text formulation in any future re-audit.

- Plan estimated "36 new cases" (7 + 7 + 22). Actual count is 37 (7 + 8 + 22) — the M1-M4 set is 4 cases, not 3; T1-T4 is also 4. Plan's "T1-T4 + M1-M4 (7 cases)" was a counting error; implementation is correct (8 cases in the gate test file).

## User Setup Required

None. The workflow uses only `secrets.GITHUB_TOKEN` (auto-issued; no manual setup) and no repo settings beyond what Phase 39 + Phase 43 already configured (branch protection, "Allow auto-merge: OFF", CODEOWNERS).

The live end-to-end demo (auto-fix PR -> verifier-gate -> human merge -> auto-promote -> CODEOWNER merge of follow-up PR) is deferred to Phase 47 CLEANUP-03 (a) HUMAN-UAT per ROADMAP — this is by design and not a Phase 44 gap.

## Known Stubs

None. The `node -e` inline source-issue parsing approach (alternative discussed in the plan) was NOT used; the workflow's parse step uses plain `grep -oE` + `sed` shell pipelines instead, which is simpler and avoids the ESM-vs-CJS friction the plan flagged.

## Next Phase Readiness

- **Phase 45** (per-error-class expansion): NO Phase 44 hooks needed. The triple-gate is class-agnostic; adding new ERROR_CLASS labels (e.g. LLM_HALLUCINATED_SELECTION) requires only that the source issue ALSO carries `triage` (Leg 3). Phase 34 triage-classifier already applies `triage` for any class it confirms.

- **Phase 46** (local UX): NO Phase 44 hooks needed. auto-promote is CI-only by design — local users invoke `runPromote` directly (without `_skipCiGuard`) via `scripts/promote-from-quarantine.mjs --id <case> --confirm` on a clean local machine.

- **Phase 47** (cleanup + HUMAN-UAT): The live end-to-end demo against a real merged auto-fix PR is owned by Phase 47 CLEANUP-03 (a). All Phase 44 infrastructure is in place; the demo blocker is human availability + a real failing case to drive the chain end-to-end, not any Phase 44 code.

## Self-Check

**Files verified to exist:**

- [x] `scripts/auto-fix-promote.mjs` (278 LOC; exports `assertTripleGate`, `parseSourceIssue`, `parseArgv`)
- [x] `scripts/build-auto-fix-pr-body.mjs` (71 LOC; +1 line vs Phase 43 baseline)
- [x] `.github/workflows/v40-auto-promote.yml` (267 LOC)
- [x] `tests/unit/auto-fix-promote-gate.test.js` (115 LOC; 8 Vitest cases)
- [x] `tests/unit/build-auto-fix-pr-body.test.js` (161 LOC; 7 Vitest cases including new B7)
- [x] `tests/e2e/scripts/v40-auto-promote-yaml.test.js` (209 LOC; 22 Vitest cases)
- [x] `.planning/phases/44-v40-auto-promote-yml-triple-gate-skipciguard/44-01-SUMMARY.md` (this file)

**Commits verified to exist (`git log --oneline -10`):**

- [x] 5806e32 — Task 1 RED (test: B7)
- [x] 5891525 — Task 1 GREEN (feat: source_issue comment)
- [x] 2e554e2 — Task 2 RED (test: assertTripleGate + parseSourceIssue)
- [x] 655b9c2 — Task 2 GREEN (feat: auto-fix-promote.mjs)
- [x] 264b456 — Task 3 RED (test: 22 YAML cases)
- [x] 331eaf1 — Task 3 GREEN (feat: workflow)

## Self-Check: PASSED

---
*Phase: 44-v40-auto-promote-yml-triple-gate-skipciguard*
*Completed: 2026-06-01*

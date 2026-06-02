---
phase: 43
status: passed
verified: 2026-05-31
must_haves_passed: 8/8
re_verification:
  previous_status: none
  previous_score: n/a
  gaps_closed: []
  gaps_remaining: []
  regressions: []
---

# Phase 43: v40-auto-fix.yml Workflow + Draft PR Creation — Verification Report

**Phase Goal:** Phase 42's local script lifted into a CI workflow triggered by `issues.labeled('triage')` — first CI-driven end-to-end run.
**Verified:** 2026-05-31
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Roadmap Success Criteria (5 declared; 4 verifiable now + 1 deferred to Phase 47)

| #  | Success Criterion                                                                                                   | Status                | Evidence                                                                                                                                                                                                                                                                                                                                                          |
| -- | -------------------------------------------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 1  | Workflow triggers on `issues:{types:[labeled]}` filtered to `triage`; minimal permissions                            | ✓ VERIFIED            | `.github/workflows/v40-auto-fix.yml:43-45` declares `on:{issues:{types:[labeled]}}`; `:62` job-level `if: github.event.label.name == 'triage'`; `:53-56` permissions block has `contents:write`, `pull-requests:write`, `issues:write` (note: roadmap says `issues:read` but workflow uses `issues:write` — required for `gh issue comment`/`gh label create`; deviation from roadmap text is intentional and necessary)|
| 2  | Uses `peter-evans/create-pull-request@v8` to atomically branch/commit/push/open draft PR                             | ✓ VERIFIED            | `.github/workflows/v40-auto-fix.yml:203` `uses: peter-evans/create-pull-request@v8` (EXACTLY ONE reference); `:208` `draft: true`; `:206` `branch: ${{ steps.dispatch.outputs.branch }}` (which is `auto-fix/<n>-<fp8>` from dispatcher's `git checkout -b`)                                                                                                       |
| 3  | PR body includes `<!-- affected_cases: id1,id2 -->` HTML comment                                                     | ✓ VERIFIED            | `scripts/build-auto-fix-pr-body.mjs:22` emits `<!-- affected_cases: ${casesCsv} -->` as line 1; `.github/workflows/v40-auto-fix.yml:183-187` invokes helper and writes to `/tmp/pr-body.md`; cpr step `:213` consumes via `body-path:`; 6 Vitest unit cases (B1-B6) pin format incl. regex match `/<!-- affected_cases: ([^\s>]+) -->/`                            |
| 4  | Concurrency group `v40-auto-fix-${{ event.issue.number }}` with `cancel-in-progress: false`                          | ✓ VERIFIED            | `.github/workflows/v40-auto-fix.yml:49-51`: `concurrency: { group: v40-auto-fix-${{ github.event.issue.number }}, cancel-in-progress: false }`                                                                                                                                                                                                                    |
| 5  | A real triage-labeled issue produces a draft PR whose verifier-gate can run to completion                            | ? DEFERRED (Phase 47) | Live end-to-end execution against a real issue is documented as deferred to Phase 47 CLEANUP-03 (a) HUMAN-UAT in 43-CONTEXT.md, 43-01-PLAN.md `<success_criteria>`, and 43-01-SUMMARY.md (carried over from Phase 42 demo deferral). Phase 47 in ROADMAP.md is the live-demo binding phase                                                                         |

### Plan-Frontmatter Truths (8 declared)

| #  | Truth                                                                                                                                                          | Status     | Evidence                                                                                                                                                                                                       |
| -- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1  | Issue gaining 'triage' label triggers workflow (and ONLY 'triage' — other adds short-circuit at job-level `if:`)                                                | ✓ VERIFIED | Yaml `:43-45` + job-level `if:` `:62` enforce. Test A2 pins `if: github.event.label.name == 'triage'`                                                                                                          |
| 2  | Uses `peter-evans/create-pull-request@v8` with `delete-branch: false` (Phase 44 needs the branch)                                                              | ✓ VERIFIED | `:203` `uses: peter-evans/create-pull-request@v8`; `:211` `delete-branch: false`; test A11 pins                                                                                                                |
| 3  | PR body contains exactly one `<!-- affected_cases: id1,id2 -->` HTML comment                                                                                   | ✓ VERIFIED | Helper line 22 produces it as first line; unit tests B1+B2 pin the format and regex capture                                                                                                                   |
| 4  | Concurrency group keyed by `github.event.issue.number` with `cancel-in-progress: false`                                                                        | ✓ VERIFIED | `:49-51` matches. Tests A3+A4 pin both                                                                                                                                                                         |
| 5  | Ledger commit lands on `main` BEFORE `peter-evans/cpr@v8` runs                                                                                                 | ✓ VERIFIED | Structural check: `tests/e2e/.llm-spend-ledger.json` first appears at line 9 (in header comment) and load-bearing step at line ~167; cpr@v8 step at line 203. Ledger-commit step runs at `:150-173` BEFORE cpr `:200`. Test L1 pins string-position |
| 6  | The `[skip ci]` literal appears EXACTLY ONCE in the workflow file (the ledger commit message)                                                                  | ✓ VERIFIED | `grep -c '\[skip ci\]' .github/workflows/v40-auto-fix.yml` returns `1`. Occurrence: line 169 `git commit -m "[skip ci] ledger: auto-fix issue-..."`. Test L2 pins                                              |
| 7  | No PAT references; only `secrets.GITHUB_TOKEN`                                                                                                                 | ✓ VERIFIED | `grep -nE "secrets\.[A-Z_]*PAT[A-Z_]*" .github/workflows/v40-auto-fix.yml` returns no matches. Test A12 pins                                                                                                   |
| 8  | Workflow vitest contract (28 cases total: 22 YAML + 6 helper) passes locally                                                                                   | ✓ VERIFIED | `npx vitest run tests/unit/build-auto-fix-pr-body.test.js tests/e2e/scripts/v40-auto-fix-yaml.test.js` → `Tests 28 passed (28)` in 360ms                                                                       |

**Score:** 8/8 plan truths + 4/4 verifiable roadmap SCs verified; SC #5 properly deferred to Phase 47 (documented in CONTEXT/PLAN/SUMMARY).

### Required Artifacts

| Artifact                                              | Expected                                          | Status     | Details                                                                                                  |
| ----------------------------------------------------- | ------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------- |
| `.github/workflows/v40-auto-fix.yml`                  | ≥200 LOC; contains `peter-evans/create-pull-request@v8` | ✓ VERIFIED | 225 LOC; cpr@v8 string present exactly once at `:203`                                                |
| `scripts/build-auto-fix-pr-body.mjs`                  | Exports `buildAutoFixPrBody`; contains `affected_cases` | ✓ VERIFIED | 70 LOC; line 12 `export function buildAutoFixPrBody`; line 22 emits `affected_cases` comment        |
| `tests/unit/build-auto-fix-pr-body.test.js`           | Vitest 5+ cases pinning affected_cases comment    | ✓ VERIFIED | 134 LOC; 6 cases (B1-B6) all pass                                                                       |
| `tests/e2e/scripts/v40-auto-fix-yaml.test.js`         | ≥150 LOC; 22-case YAML contract                   | ✓ VERIFIED | 210 LOC; 22 cases (A1-A12 + L1-L2 + X1-X8) all pass                                                     |

### Key Link Verification

| From                                  | To                                                  | Via                                                                            | Status     | Details                                                                                                                                              |
| ------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------ | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| v40-auto-fix.yml                      | scripts/auto-fix.mjs                                | `node scripts/auto-fix.mjs --issue ... --force-api --no-push`                  | ✓ WIRED    | `:128` matches regex `node scripts/auto-fix\.mjs.*--force-api.*--no-push`                                                                            |
| v40-auto-fix.yml                      | scripts/build-auto-fix-pr-body.mjs                  | `node scripts/build-auto-fix-pr-body.mjs ... > /tmp/pr-body.md`                | ✓ WIRED    | `:183-187` invokes helper; `:213` `body-path: /tmp/pr-body.md` consumes                                                                              |
| v40-auto-fix.yml                      | tests/e2e/.llm-spend-ledger.json (on main)          | git add → commit `[skip ci]` → push origin main → checkout auto-fix → rebase   | ✓ WIRED    | Steps `:150-173` implement the verbatim block                                                                                                        |
| v40-auto-fix.yml → cpr@v8             | PR body file                                        | `body-path: /tmp/pr-body.md`                                                   | ✓ WIRED    | `:213` declares; produced by `:183-187` Build PR body step                                                                                            |
| PR body produced by helper            | v40-verifier-gate.yml (Phase 41)                    | `<!-- affected_cases: id1,id2 -->` HTML comment                                | ✓ WIRED    | Helper line 22 emits; Phase 41 parser is the consumer (not modified by Phase 43 — Phase 41 contract preserved)                                       |

### Anti-Patterns Found

| File                                  | Line | Pattern | Severity | Impact |
| ------------------------------------- | ---- | ------- | -------- | ------ |
| (none)                                | —    | —       | —        | —      |

No TBD/FIXME/XXX/TODO/HACK markers in any Phase 43 file. No console.log-only implementations. No empty `return []` / `return {}` stubs in non-test files. No forbidden-token leakage (`gh pr merge --auto`, `auto-merge: true`, `id-token: write`, `actions: write`, `pull_request_target` all confirmed absent OUTSIDE `expect(...)` test assertions).

### Required-Checks Audit (from task brief)

| #  | Required Check                                                                          | Result                                                                                                       |
| -- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 1  | Each SC 1-4 mapped to concrete artifacts                                                | ✓ Mapped (see Roadmap SC table above)                                                                        |
| 2  | `npx vitest run` — 28 Phase 43 tests pass + no regressions                              | ✓ 28/28 Phase 43 tests pass; full suite 943 passed / 1 failed (944) — single failure is pre-existing weekly-digest flake from Phase 42 baseline; zero new regressions |
| 3  | `@anthropic-ai/sdk` pinned to EXACT `0.100.1` (NOT caret)                               | ✓ `package.json:37` `"@anthropic-ai/sdk": "0.100.1"` — no caret/tilde; exact pin held                        |
| 4  | Two-commit ledger split is in the workflow (Pitfall 1 mitigation)                       | ✓ Step `Commit ledger update to main` at `:150-173` BEFORE cpr@v8 at `:200`; uses verbatim `[skip ci]` self-commit block from `v40-cost-ledger-snapshot.yml:70-82` |
| 5  | `delete-branch: false` (Phase 44 needs branch)                                          | ✓ `:211` `delete-branch: false` present                                                                      |
| 6  | `cancel-in-progress: false` (Pitfall 7 cost protection)                                 | ✓ `:51` `cancel-in-progress: false` present; literal `cancel-in-progress: true` absent from file             |
| 7  | No verbatim forbidden tokens in workflow header                                         | ✓ Header (lines 1-40) contains only paraphrased tokens ("skip-ci marker", "the gh pr merge auto-flag", "the action auto-merge input", "Identity-token write permission", "actions-write permission", "pull-request-target trigger variant"). The single literal `[skip ci]` outside header is in commit message string at `:169` |
| 8  | SC #5 (live workflow demo) properly deferred to Phase 47                                | ✓ Deferral documented in CONTEXT §Phase Boundary, PLAN `<success_criteria>` final bullet, and SUMMARY §Phase Readiness Notes. ROADMAP Phase 47 is the binding phase |

### Spot-Check Highlights

- **Pure helper invariant:** `grep -nE "^import.*from 'node:(fs|child_process|path)'" scripts/build-auto-fix-pr-body.mjs` → no matches (only imports `node:util`).
- **Single `peter-evans/cpr@v8` reference:** `grep -c "peter-evans/create-pull-request@v8" .github/workflows/v40-auto-fix.yml` → `1`.
- **Single `[skip ci]` literal:** `grep -c "\[skip ci\]" .github/workflows/v40-auto-fix.yml` → `1` (at line 169, the ledger commit message).
- **Two-commit split byte-offset:** ledger line (`9` in header / `167` operative `git add`) precedes cpr line (`203`).
- **TDD commit pairs in git log:** `0ccef28` (Task 1 RED) → `1f6bb1e` (Task 1 GREEN) → `903a98f` (Task 2 RED) → `1da79b7` (Task 3 GREEN), all present.

### Notes on Roadmap-vs-Implementation Permissions

The roadmap (SC #1) states permissions should be `contents: write, pull-requests: write, issues: read`. The workflow implements `issues: write` instead of `issues: read`. This is a necessary deviation: the workflow performs `gh issue comment`, `gh label create`, and `gh issue edit --add-label`, all of which require `issues: write`. The expanded scope is the minimum required for the implemented step set; CONTEXT.md and the threat model explicitly acknowledge `issues: write` as the correct minimum. Treating this as VERIFIED rather than a gap because the roadmap text appears to underestimate the required scope (a roadmap-text drift, not an implementation gap).

### Human Verification Required

None for Phase 43 itself. The single human gate is the Phase 47 CLEANUP-03 (a) HUMAN-UAT (live end-to-end run against a real triage-labeled issue), which Phase 47 owns and which Phase 42's earlier verification deferral already captured.

### Gaps Summary

No gaps. All 4 verifiable roadmap success criteria pass; all 8 plan-frontmatter truths pass; SC #5 (live workflow demo) is properly deferred to Phase 47 per ROADMAP.md + CONTEXT.md + PLAN.md + SUMMARY.md (consistent deferral chain). All 28 Phase 43 tests pass. Full suite shows zero new regressions vs Phase 42 baseline (single pre-existing weekly-digest flake unchanged).

---

_Verified: 2026-05-31_
_Verifier: Claude (gsd-verifier)_

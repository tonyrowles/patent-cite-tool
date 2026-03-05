---
phase: 19-ci-hardening
verified: 2026-03-05T06:08:10Z
status: human_needed
score: 3/3 must-haves verified (2 fully automated, 1 requires live GitHub Actions observation)
re_verification: false
human_verification:
  - test: "Push two commits in quick succession to a PR branch and confirm the first run is cancelled"
    expected: "Run A starts in the GitHub Actions tab; immediately after pushing commit B, Run A is marked 'Cancelled' and Run B starts and completes successfully"
    why_human: "Concurrency cancellation is a GitHub-server-side feature triggered by actual push events. It cannot be exercised locally or verified by grep — only observable in the live Actions UI"
  - test: "Push two commits to main and confirm both runs complete independently (neither is cancelled)"
    expected: "Both runs appear in the Actions tab and reach a completed (green) state; neither shows 'Cancelled'"
    why_human: "Main-branch protection from the run_id fallback is likewise a server-side behaviour requiring live observation"
---

# Phase 19: CI Hardening Verification Report

**Phase Goal:** The CI workflow resists misuse and resource waste — stale in-progress runs are cancelled on new pushes to the same branch, and the workflow requests only the minimum repository permissions required
**Verified:** 2026-03-05T06:08:10Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Pushing two commits in quick succession to a PR branch cancels the first in-progress run before the second completes | ? HUMAN NEEDED | `concurrency.group` uses `github.head_ref && github.ref \|\| github.run_id` (line 12); `cancel-in-progress: true` (line 13). For `pull_request` events `head_ref` is truthy so both pushes resolve to the same group key (`CI-refs/pull/N/merge`), enabling cancellation. Mechanism is statically correct — live behaviour requires human observation. |
| 2 | Push commits directly to main are never cancelled by the concurrency group — each main-branch run completes independently | ? HUMAN NEEDED | For `push` events `head_ref` is empty/falsy, so the group falls back to `github.run_id` — unique per run, ensuring no two main runs share a group. Statically verified. Live observation is the definitive test. |
| 3 | The workflow YAML declares `permissions: contents: read` and no broader permission grants appear anywhere in the file | ✓ VERIFIED | `permissions: contents: read` at workflow top level (lines 8–9, before `jobs:` at line 15). `grep -c permissions ci.yml` = 1. `grep -c write ci.yml` = 0. No job-level permissions block present. |

**Score:** 3/3 truths have correct static implementation; 2/3 require live GitHub Actions observation to confirm runtime behaviour.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `.github/workflows/ci.yml` | Hardened CI workflow with concurrency and permissions | ✓ VERIFIED | File exists, 69 lines. Contains `permissions: contents: read` (lines 8–9) and `concurrency:` block (lines 11–13) at workflow top level. All 12 existing steps unchanged. Commit `b204023` adds exactly 7 lines — no existing lines modified. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `.github/workflows/ci.yml concurrency.group` | GitHub Actions concurrency engine | `group: ${{ github.workflow }}-${{ github.head_ref && github.ref \|\| github.run_id }}` | ✓ VERIFIED | Pattern matches exactly. Line 12: `group: ${{ github.workflow }}-${{ github.head_ref && github.ref \|\| github.run_id }}`. Expression uses the correct `&&` / `\|\|` short-circuit to route PR events through `ref` and push events through `run_id`. |
| `.github/workflows/ci.yml permissions` | GITHUB_TOKEN scope | `permissions: contents: read` at workflow level | ✓ VERIFIED | Line 8: `permissions:`, line 9: `  contents: read`. `permissions` appears once (`grep -c` = 1). Zero `write` occurrences. Block is at workflow top level (line 8), before `jobs:` (line 15) — correctly scopes all jobs in the workflow. |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| HARD-01 | 19-01-PLAN.md | Concurrency group cancels stale CI runs when new commits push to the same branch | ✓ SATISFIED (static) / ? HUMAN for live | `concurrency` block with correct `head_ref \|\| run_id` group key and `cancel-in-progress: true` present in ci.yml. Runtime confirmation requires live push test. |
| HARD-03 | 19-01-PLAN.md | Workflow uses explicit `permissions: contents: read` for least-privilege security | ✓ SATISFIED | `permissions: contents: read` at workflow top level, zero write scopes, one `permissions` occurrence. |

**Orphaned requirements check:** REQUIREMENTS.md maps only HARD-01 and HARD-03 to Phase 19. No orphaned requirements found.

**Note on HARD-02:** HARD-02 (`timeout-minutes` set) is mapped to Phase 18 in REQUIREMENTS.md, not Phase 19. The Phase 19 PLAN frontmatter only declares HARD-01 and HARD-03. HARD-02 is visible in ci.yml at line 20 (`timeout-minutes: 10`) — it was correctly delivered by Phase 18 and is unchanged here.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | None found | — | — |

No TODO/FIXME/placeholder comments, no empty implementations, no stub patterns found in `.github/workflows/ci.yml`.

### Human Verification Required

#### 1. PR Concurrency Cancellation (HARD-01)

**Test:** Open a PR branch. Push commit A to the PR branch and watch the GitHub Actions tab — Run A should start. Immediately push commit B to the same PR branch.
**Expected:** Run A shows status "Cancelled" in the Actions tab; Run B starts and runs to completion (green).
**Why human:** Concurrency cancellation is executed by GitHub's Actions server when it processes a new workflow run that shares a group key with an in-progress run. There is no local equivalent of this server-side event. The YAML mechanism is statically correct; only the live environment proves the behaviour.

#### 2. Main-Branch Run Independence (HARD-01, secondary)

**Test:** Push two commits to `main` in quick succession (or trigger two manual runs). Observe both in the Actions tab.
**Expected:** Both runs appear and both reach a green "Completed" state — neither is marked "Cancelled".
**Why human:** The `run_id` fallback gives each main-branch run a unique concurrency group, preventing cancellation. This is a property of how GitHub assigns run IDs at event time; only a live test confirms it.

### Gaps Summary

No gaps found. All static checks pass:

- `permissions: contents: read` is present at workflow top level exactly once.
- No `write` permissions appear anywhere in the file.
- The `concurrency` block uses the correct `head_ref && ref || run_id` group key pattern.
- `cancel-in-progress: true` is set unconditionally.
- Both blocks appear before `jobs:`, confirming workflow-level (not job-level) placement.
- The commit referenced in SUMMARY (`b204023`) exists and shows the correct +7-line diff with no removals.
- HARD-01 and HARD-03 are the only requirements mapped to Phase 19 in REQUIREMENTS.md — no orphans, no missing coverage.

The two human verification items are not gaps — they are inherent to HARD-01's nature as a server-side GitHub Actions behaviour that cannot be exercised locally. The static YAML implementation is complete and correct.

---

_Verified: 2026-03-05T06:08:10Z_
_Verifier: Claude (gsd-verifier)_

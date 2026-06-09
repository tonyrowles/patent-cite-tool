# Phase 57: Ledger-Commit Branch Redirect - Context

**Gathered:** 2026-06-04
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase — smart discuss skipped)

<domain>
## Phase Boundary

Refactor `v40-cost-ledger-snapshot.yml` so the daily ledger snapshot push lands on a `ledger-snapshots/daily-${SNAPSHOT_DATE}` branch instead of `main` — required because Phase 50's ruleset blocks direct-to-main pushes for that workflow. Add a `Scope decision` fast-path step to the `v40-verifier-gate.yml` diff-guard job so non-`auto-fix/*` PRs (e.g., the new ledger-snapshot branch PRs) do not trip the FORBIDDEN_PATHS regex 5. Update the S13 Vitest YAML contract case to pin the new branch prefix. **Crucially, leave `v40-auto-fix.yml`'s direct-to-main ledger commit BYTE-UNCHANGED** (LOAD-BEARING Pitfall 1 from `.planning/research/PITFALLS.md` — its two-commit split exists specifically to keep ledger entries out of the auto-fix PR diff).

Requirements covered: COMMIT-01, COMMIT-02, COMMIT-03, COMMIT-04.

</domain>

<decisions>
## Implementation Decisions

### Pre-Locked by REQUIREMENTS.md + research/SUMMARY.md Tension 1

- **Scope-lock:** Refactor applies to `.github/workflows/v40-cost-ledger-snapshot.yml` ONLY. `.github/workflows/v40-auto-fix.yml` MUST stay byte-unchanged (Pitfall 1; gate: `grep -c 'git push origin main' .github/workflows/v40-auto-fix.yml` = 1).
- **Push target:** `git push origin HEAD:ledger-snapshots/daily-${{ env.SNAPSHOT_DATE }}` — replaces the bare `git push` at line 91 of `v40-cost-ledger-snapshot.yml`.
- **Concurrency group:** Add a workflow-level `concurrency` block keyed on the snapshot date so two cron tickers can't race the same daily branch. Recommended group key: `cost-ledger-snapshot-${{ env.SNAPSHOT_DATE }}` (or derive from `github.event.schedule` if SNAPSHOT_DATE is not yet in scope at workflow level — planner picks the cleanest expression).
- **Verifier-gate diff-guard fast-path (COMMIT-02):** Phase 51.1 already added 3 `Scope decision (auto-fix/* PRs only; fast-path SUCCESS otherwise)` steps in `v40-verifier-gate.yml` (lines 208, 414, 514). Phase 57 adds the SAME pattern to the diff-guard job specifically (if not already present at one of those line numbers — planner verifies). The added step must use the verbatim same `if [[ "${{ github.head_ref }}" == auto-fix/* ]]` condition to keep the trust-invariant uniform.
- **S13 Vitest contract (COMMIT-03):** Update `tests/e2e/scripts/v40-cost-ledger-snapshot-yaml.test.js` so that (a) the negative assertion on the bare `git push` is removed, (b) a NEW positive assertion pins the `ledger-snapshots/` branch prefix in the push refspec, (c) all other existing contract checks (concurrency group, `[skip ci]` commit message, byte-equality with `e2e-weekly-digest.yml` git-config block) stay green or are updated minimally.
- **`v40-auto-fix.yml` invariant (COMMIT-04):** ZERO bytes touched. Verification gate: `grep -c 'git push origin main' .github/workflows/v40-auto-fix.yml` returns 1 (the existing two-commit-split push at line 170) before AND after Phase 57 commits.

### Claude's Discretion (during plan-phase)

- Concurrency-group key syntax (workflow-level vs job-level; date-from-env vs date-from-cron-trigger). Recommended: workflow-level with `${{ env.SNAPSHOT_DATE }}` deferred via a downstream `cancel-in-progress: false` (we WANT both to queue, not cancel).
- Whether the new `Scope decision` step in the diff-guard job ALREADY exists from Phase 51.1 (planner verifies via grep; if present, COMMIT-02 reduces to a no-op + a Vitest assertion to pin its presence; if absent, add the step verbatim from existing siblings).
- Commit ordering — recommended single atomic `feat(57): redirect cost-ledger-snapshot push to ledger-snapshots/* branch (COMMIT-01..04)` if mechanically feasible. Tests must stay green between commits; split commits if needed for atomic granularity but never leave a broken intermediate state.
- Whether to delete the old `ledger-snapshots/daily-*` branches periodically — explicitly NOT in scope. The cron just keeps creating them; cleanup is operator-owned (Phase 60 candidate if needed; not COMMIT-01..04).

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `v40-cost-ledger-snapshot.yml:79-91` — the entire "Commit daily ledger snapshot" step. Only the final `git push` line (91) changes; `git config user.name|email`, `git add`, `git commit -m "[skip ci] ..."` stay byte-unchanged (the S13 contract test pins their byte-equality with `e2e-weekly-digest.yml:98-110`).
- `v40-verifier-gate.yml:208, 414, 514` — three existing `Scope decision (auto-fix/* PRs only; fast-path SUCCESS otherwise)` steps already shipped by Phase 51.1. Identical mechanism to what COMMIT-02 may need to add to the diff-guard job.
- `tests/e2e/scripts/v40-cost-ledger-snapshot-yaml.test.js` (~210 lines) — the S13 contract test; tests are named `S13-*` and pin specific YAML structure assertions.

### Established Patterns
- `git push origin HEAD:<branch>` — used elsewhere in the repo for direct-to-branch pushes from CI (planner verifies via grep across `.github/workflows/`).
- `${{ env.SNAPSHOT_DATE }}` — already resolved earlier in the snapshot workflow (planner reads the `env:` block at workflow top to confirm it's in scope at the push step).
- The `[skip ci]` commit message convention is LOAD-BEARING per `v40-cost-ledger-snapshot.yml:80-82` comment — prevents the bot push from re-triggering `ci.yml`. Stays.

### Integration Points
- The new `ledger-snapshots/daily-*` branches will trip the universal `pull_request` trigger on `v40-verifier-gate.yml` (when an operator opens a PR from one). COMMIT-02's fast-path step makes diff-guard return SUCCESS without re-running the FORBIDDEN_PATHS regex.
- Existing `pull_request:` trigger is currently filtered to specific branch prefixes — planner confirms whether ledger-snapshot branch PRs would even reach the verifier-gate without additional trigger plumbing. (If they wouldn't, the COMMIT-02 step is defensive-only; if they would, it's load-bearing.)

</code_context>

<specifics>
## Specific Ideas

- Pre-flight grep confirms `v40-cost-ledger-snapshot.yml:91` is currently bare `git push` (no explicit ref).
- Pre-flight grep confirms `v40-auto-fix.yml:170` is `git push origin main` — exactly 1 occurrence. Must stay at 1 after Phase 57.
- Three `Scope decision` steps already exist at `v40-verifier-gate.yml:208, 414, 514` — planner verifies whether the diff-guard job is among them (likely yes — Phase 51.1 covered diff-guard, regression-suite, ready-flip). If yes, COMMIT-02 is already satisfied; the planner just needs to add a Vitest pin to prevent regression.

</specifics>

<deferred>
## Deferred Ideas

- Periodic cleanup of accumulated `ledger-snapshots/daily-*` branches — not in scope; operator-owned.
- Refactoring `v40-auto-fix.yml`'s ledger push to a branch — explicitly NOT in scope; LOAD-BEARING Pitfall 1.

</deferred>

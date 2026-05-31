# v40 Verifier-Gate Manual Smoke-Test Procedure

**Created:** 2026-05-31 (Phase 41 Plan 41-04)
**Satisfies:** Phase 41 Success Criterion 5 (`VFY-GATE-05`) — a pushed `auto-fix/test` branch can demonstrate the verifier-gate workflow end-to-end with no LLM involvement.
**Future reuse contract:** Phase 47 `CLEANUP-03` HUMAN-UAT will RUN this procedure as one of its 5 live confirmations ("verifier-gate diff-guard rejecting a crafted bypass attempt"). Do NOT rename sections without updating `tests/unit/v40-verifier-gate-doc.test.js` in the same PR — the doc-structure test pins the H2 headings as a bit-rot guard.

This document is a self-contained smoke procedure. A first-time runner should be able to follow it end-to-end without cross-referencing other docs.

The gate under test is `.github/workflows/v40-verifier-gate.yml` (shipped by Plan 41-03). It consumes three helper scripts shipped by earlier plans:

- `scripts/verify-single-case.mjs` — CLI shim around `verifyCitation` (Plan 41-02)
- `scripts/check-diff-guard.mjs` — forbidden-path regex bank (Plan 41-01)
- `scripts/parse-affected-cases.mjs` — `<!-- affected_cases: ... -->` PR-body parser (Plan 41-01)

## Prerequisites

- [ ] Plans 41-01, 41-02, 41-03 are merged to `main` (workflow + helpers + CLI shim all shipped)
- [ ] Local clone has push access to `origin`
- [ ] `gh` CLI authenticated (`gh auth status` returns green)
- [ ] At least 1 `TEST_CASES` entry is known to pass `verifyCitation` Tier A/B — use `US11427642-spec-short-1` with baseline `1:26-27` per the Plan 41-02 integration test
- [ ] Repo setting `Allow auto-merge` is OFF (per `docs/v40-repo-config.md` §1) — auto-merge would subvert the human-gated trust invariant the gate is testing
- [ ] You are NOT mid-way through a real auto-fix PR — the manual smoke creates a throwaway branch + PR that you will close at the end

## Procedure

```bash
# 1. Sync local main
git checkout main && git pull origin main

# 2. Create a benign-diff branch (the `auto-fix/` prefix is what the workflow
#    head-branch filter `branches: ['auto-fix/*']` matches; without it the
#    workflow does not trigger at all and the test is a no-op)
git checkout -b auto-fix/test-manual-$(date +%s)

# 3. Add a benign src/ change — comment-only edit to a non-load-bearing file.
#    Single line keeps the diff well under the 200-LOC src/ cap; src/popup/
#    is not on the diff-guard forbidden-paths bank.
echo "// manual verifier-gate smoke test $(date)" >> src/popup/popup.js
git add src/popup/popup.js
git commit -m "test: manual verifier-gate smoke (delete after)"

# 4. Push the branch
git push -u origin HEAD

# 5. Open a DRAFT PR with the affected_cases HTML comment in the body.
#    The verifier-gate parses this comment via scripts/parse-affected-cases.mjs;
#    if the comment is absent the gate exits non-zero and the PR stays draft.
gh pr create --draft \
  --title "Manual verifier-gate smoke" \
  --body $'Manual end-to-end smoke for VFY-GATE-05.\n\n<!-- affected_cases: US11427642-spec-short-1 -->\n\nDelete after verification.'
```

After step 5 the PR exists in `Draft` state and the `.github/workflows/v40-verifier-gate.yml` workflow starts running. Open the Actions tab in the PR and follow along with the Expected Workflow Sequence below.

## Expected Workflow Sequence

The workflow is structured as three jobs with `needs:` dependencies — `diff-guard` runs first, then `verifier-gate` + `regression-suite` run in parallel, then `ready-flip` runs after both succeed.

1. **`diff-guard` (~1 min):**
   - Fetches `origin/main` and runs `git diff --shortstat origin/main..HEAD`
   - Checks size cap: `src/` ≤ 200 LOC, `tests/` ≤ 50 LOC — passes (single-line change)
   - Pipes `git diff --name-only origin/main..HEAD` to `scripts/check-diff-guard.mjs` — passes (`src/popup/popup.js` is not on the 6-path forbidden bank)
   - Test-count invariant — passes (TEST_CASES is unchanged)
   - Job exits 0; the two downstream jobs start

2. **`verifier-gate` + `regression-suite` (parallel, ~15-25 min):**
   - **`verifier-gate`:**
     - Pins verifier files from `origin/main` (`tests/e2e/lib/pdf-verifier.js`, `tests/golden/baseline.json`, `tests/e2e/lib/pdf-fetch.js`) so PR-side mutations of those files would be invisible to the gate
     - Calls `gh pr view --json body | node scripts/parse-affected-cases.mjs` to extract `US11427642-spec-short-1`
     - Runs `node scripts/verify-single-case.mjs --case US11427642-spec-short-1 --output report-N.json` three times consecutively (N = 1, 2, 3) — all three runs expected Tier A or Tier B
   - **`regression-suite`:**
     - Runs the full 76-case Playwright spec (`tests/e2e/specs/regression.spec.js`) against the PR branch — all 76 pass expected because no real change was made
   - Both jobs exit 0; `ready-flip` is unblocked

3. **`ready-flip` (~10 s):**
   - Runs `gh pr ready ${PR_NUMBER}` — the PR transitions from Draft to Ready for review
   - Runs `gh pr comment` posting the success summary

Total wall-clock: roughly 16-26 minutes depending on Playwright + verifier cache state.

## Success Signal

Observe ALL of the following on the PR page:

- The PR badge transitions from `Draft` to `Ready for review`
- All four logical workflow steps (`diff-guard`, `verifier-gate`, `regression-suite`, `ready-flip`) show green checkmarks in the Actions tab
- A new comment from the `github-actions` bot appears on the PR with text containing: "Verifier-gate: all 3 affected-case runs Tier A/B + 76-case regression clean. Draft → ready-for-review."
- The PR does **NOT** carry the `human-review-required` label
- `gh pr view <PR_NUMBER> --json isDraft --jq .isDraft` returns `false`

If any of those five signals is missing, the gate is misbehaving even if the workflow status is green — capture the workflow-run URL and file an investigation issue.

## Failure-Mode Catalog

The procedure above exercises the success path. To exercise each rejection path, repeat the Procedure with the variation noted, and confirm the expected rejection signal.

### F1. Size-cap rejection (`src/` > 200 LOC)

- **Variation:** instead of step 3, run `for i in {1..210}; do echo "// pad $i" >> src/popup/popup.js; done` and commit
- **Expected:** `diff-guard` job exits non-zero; PR comment appears with text matching `Diff-size cap exceeded — src/=NNN (limit 200)`; the `human-review-required` label is added to the PR; PR stays in Draft state; `verifier-gate` and `regression-suite` jobs do not run (gated by `needs: diff-guard`)

### F2. Diff-guard regex-bank rejection (forbidden path)

- **Variation:** instead of step 3, edit `tests/test-cases.js` (a forbidden path — adding a `//` comment at the end of the file is enough)
- **Expected:** `diff-guard` job exits non-zero with stderr matching `Diff-guard violations:\n  tests/test-cases.js`; PR stays draft; comment posted; `human-review-required` label applied. The verifier-gate is never invoked, demonstrating that the regex bank rejects gaming attempts pre-checkout.

### F3. Verifier-gate failure (missing `affected_cases` comment)

- **Variation:** at step 5, omit the `<!-- affected_cases: ... -->` block from the PR body — pass only the title + summary line
- **Expected:** `diff-guard` passes; `verifier-gate` job exits non-zero with stderr matching `PR body missing or empty <!-- affected_cases: ... --> comment`; PR stays draft; no ready-flip

### F4. Verifier-gate failure (Tier C on affected case)

- **Variation:** make a real (but small) breaking change to `src/shared/matching.js` that would cause `US11427642-spec-short-1` to drop to Tier C, push, and include that case in `affected_cases`
- **Expected:** `diff-guard` passes (single-line src/ change is under the cap); `verifier-gate` runs the 3× loop, at least one run drops to Tier C, the job exits 1, and the workflow comment includes `Verifier-gate FAIL — cases US11427642-spec-short-1 did not pass 3 consecutive Tier A/B runs.` This variation is documented for completeness but is not required for the basic smoke — F1-F3 are the load-bearing rejection paths.

### F5. Idempotent re-run (already-ready PR)

- **Variation:** after a successful run leaves the PR `Ready for review`, manually re-trigger the workflow via `gh workflow run v40-verifier-gate.yml --ref auto-fix/test-manual-<timestamp>` (or push an empty commit `git commit --allow-empty -m "retrigger" && git push`)
- **Expected:** the second run still passes the verifier and regression jobs; `ready-flip` either skips with log entry "PR already ready-for-review" OR is a no-op call to `gh pr ready` that exits 0; no duplicate comment is posted (per Pitfall D in 41-RESEARCH — the ready-flip step is idempotent against an already-ready PR)

## Cleanup

Always run cleanup after the smoke — the throwaway PR and branch are not meant to merge.

```bash
# Close the PR (does not delete the branch)
gh pr close <PR_NUMBER>

# Delete the remote branch
git push origin --delete auto-fix/test-manual-<timestamp>

# Delete the local branch
git checkout main
git branch -D auto-fix/test-manual-<timestamp>

# OPTIONAL: if you exercised F1 or F2 the `human-review-required` label is now
# pinned on the closed PR. Leaving it is harmless (the PR is closed) and serves
# as evidence-of-rejection for an auditor. To remove it:
#   gh pr edit <PR_NUMBER> --remove-label human-review-required
```

## Phase 47 cross-check

Phase 47 CLEANUP-03 runs this procedure as one of five live HUMAN-UAT confirmations. The auditor should:

1. Execute the Procedure section above on a fresh `auto-fix/test-uat-<timestamp>` branch
2. Capture the workflow-run URL (e.g., `https://github.com/<org>/<repo>/actions/runs/<RUN_ID>`) as evidence
3. Execute the F2 (diff-guard rejection) variation as the explicit "crafted bypass attempt" the CLEANUP-03 success criterion requires
4. Stamp PASS/FAIL with workflow URLs in `47-HUMAN-UAT.md`
5. Run the Cleanup section to leave the repo in its pre-test state

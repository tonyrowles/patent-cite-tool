# Phase 47 — Deferred HUMAN-UAT Runbook Stubs (requires-push)

**Plan:** 47-03
**Created:** 2026-06-02T01:22:21Z
**Status:** 4 runbooks (UAT-47-a, UAT-47-b, UAT-47-d, UAT-47-e) — all DEFERRED requires-push per CONTEXT.md

These 4 UATs cannot execute today because the v4.0 workflows (`v40-auto-fix.yml`, `v40-deps-update.yml`, `v40-cost-ledger-snapshot.yml`, `v40-verifier-gate.yml`) have not yet been pushed to `origin/main`. The push-v4.0-to-origin step is a separate readiness gate, out of Phase 47 scope. Once v4.0 ships, the post-push operator dispatches each runbook in turn and records outcomes in the v4.0-MILESTONE-AUDIT.md `human_verification:` block (authored by Plan 47-04).

Each stub below carries the 4 mandatory fields per 47-CONTEXT.md locked decision: **Dispatch command (post-push)**, **Expected outcome**, **Success heuristic**, **Rollback**. Bash blocks are transcribed verbatim from 47-RESEARCH.md §"HUMAN-UAT Runbook Stubs" — do not re-invent.

The vitest static-grep guard at `tests/unit/uat-deferred-runbook.test.js` pins this file's structure (4 sections × 4 required field headers + the Phase 42 inherited fingerprint `139f821b3bb1`) so any accidental drift surfaces at the next `npm run test:src` run.

---

## UAT-47-a — End-to-end auto-fix flow against real triage-labeled fork issue

**Status:** DEFERRED (requires-push)
**Inherits:** Phase 42's deferred demo on issue #3 `US11427642-spec-short-1`, fingerprint `139f821b3bb1`, branch `auto-fix/3-139f821b`.

### Dispatch command (post-push)

```bash
# 1. Push v4.0 to origin (separate readiness gate, OUT OF SCOPE for Phase 47)
# 2. In a fork (NEVER the canonical repo) — confirm workflows present:
gh workflow list | grep -E '^V40\s'
# 3. Label the test issue:
gh issue edit 3 --add-label triage
# 4. Observe v40-auto-fix.yml run:
gh run watch <run-id>  # ← from the watch command's output
```

### Expected outcome

- `v40-auto-fix.yml` fires within 30s of the label-add.
- Draft PR opened with title `Fix #3: WRONG_CITATION` (or class-matched) and head branch `auto-fix/3-139f821b`.
- PR body contains `<!-- affected_cases: US11427642-spec-short-1 -->` HTML comment.
- Ledger commit lands on `main` with `[skip ci]` message.

### Success heuristic

- `gh pr list --head auto-fix/3-139f821b --json number,state,isDraft -q '.[0]'` returns `{state: "OPEN", isDraft: true}` within 5 minutes.
- `gh pr view <pr-n> --json body -q '.body' | grep -E 'affected_cases:'` exits 0.

### Rollback

- Close the PR + delete the branch: `gh pr close <pr-n> --delete-branch`.
- Remove the `triage` label from issue #3: `gh issue edit 3 --remove-label triage`.

---

## UAT-47-b — Dep-PR pre-flight gate blocking on regression

**Status:** DEFERRED (requires-push)

### Dispatch command (post-push)

```bash
# 1. Manually trigger v40-deps-update.yml:
gh workflow run v40-deps-update.yml
# 2. Wait for the dep-scan job to open a PR (security or grouped minor tier):
sleep 60
gh pr list --head 'v40-deps-update/*' --json number,title,headRefName
# 3. The deps-update-gate job auto-runs on the new PR — observe:
gh run watch <gate-run-id>
```

### Expected outcome

- `deps-update-gate` job runs on the auto-opened dep PR.
- If a synthetic regression is introduced (e.g., a fixture-edit pushed onto the same branch), the gate FAILS and the PR is marked `human-review-required` (or stays blocked from ready-for-review per DEPS-02).

### Success heuristic

- `gh pr checks <pr-n>` shows `deps-update-gate` with status `FAILURE` after the regression push.
- PR comment posted with regression detail.

### Rollback

- Close the PR + delete the branch: `gh pr close <pr-n> --delete-branch`.

---

## UAT-47-d — Ledger snapshot workflow committing daily snapshot

**Status:** DEFERRED (requires-push)

### Dispatch command (post-push)

```bash
# v40-cost-ledger-snapshot.yml runs on cron '0 0 * * *' + workflow_dispatch
gh workflow run v40-cost-ledger-snapshot.yml
sleep 5
gh run list --workflow=v40-cost-ledger-snapshot.yml --limit 1 \
  --json databaseId,status,createdAt,event
```

### Expected outcome

- Workflow run completes.
- New commit on `main` with message matching `chore(ledger-snapshot): YYYY-MM-DD [skip ci]` (or similar per the workflow's commit step).
- `tests/e2e/.llm-spend-ledger.json` updated atomically with `[skip ci]` (per LEDGER-04 contract).

### Success heuristic

- `git pull origin main && git log --oneline -1` shows the snapshot commit with `[skip ci]`.
- `git diff HEAD~1 HEAD -- tests/e2e/.llm-spend-ledger.json` shows only ledger updates, no other file mutations.

### Rollback

- Revert the snapshot commit if it lands during the UAT window: `git revert <commit-sha> && git push origin main` (requires temporary ruleset relaxation since `main` is protected).

---

## UAT-47-e — Verifier-gate diff-guard rejecting crafted bypass

**Status:** DEFERRED (requires-push)

### Dispatch command (post-push)

```bash
# 1. Open a PR (test fork) on a branch named auto-fix/test-craftedbypass
git checkout -b auto-fix/test-craftedbypass-9999-deadbeef
# 2. Craft a diff that touches a forbidden path — e.g., tests/golden/baseline.json:
echo '/* crafted bypass test */' >> tests/golden/baseline.json
git add tests/golden/baseline.json
git commit -m "chore: crafted bypass test (UAT-47-e)"
git push origin auto-fix/test-craftedbypass-9999-deadbeef
gh pr create --draft --title "UAT-47-e crafted bypass" \
  --body "<!-- affected_cases: any -->"
# 3. v40-verifier-gate.yml diff-guard job runs; observe:
gh pr checks <pr-n>
```

### Expected outcome

- `diff-guard` job FAILS (exit non-zero) with PR comment naming the violated path (`tests/golden/baseline.json`).
- PR remains draft and is labelled `human-review-required` per VFY-GATE-03.

### Success heuristic

- `gh pr checks <pr-n>` shows `diff-guard` status FAILURE.
- `gh pr view <pr-n> --json labels -q '.labels[].name'` contains `human-review-required`.
- `gh pr view <pr-n> --json comments -q '.comments[-1].body'` mentions `tests/golden/baseline.json`.

### Rollback

- Close the PR + delete the branch: `gh pr close <pr-n> --delete-branch`.
- Revert the test fork's commit.

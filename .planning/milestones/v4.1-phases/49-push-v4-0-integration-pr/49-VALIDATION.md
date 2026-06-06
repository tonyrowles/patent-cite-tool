---
phase: 49
slug: push-v4-0-integration-pr
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-02
---

# Phase 49 — Validation Strategy

> Per-phase validation contract. Phase 49 is release-engineering (push + admin-merge + verify), not feature code, so the "test framework" is shell + `gh` + `git` + `jq`. Verification is procedural snapshots, not unit tests.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Bash + `gh` CLI + `git` CLI + `jq` (all pre-installed; no test runner) |
| **Config file** | None — verification is procedural |
| **Quick run command** | `bash .planning/phases/49-push-v4-0-integration-pr/scripts/verify-phase-49.sh --quick` |
| **Full suite command** | `bash .planning/phases/49-push-v4-0-integration-pr/scripts/verify-phase-49.sh` |
| **Estimated runtime** | ~30 seconds (quick) / ~3 min (full, including `gh pr checks --watch` during pre-flight) |

---

## Sampling Rate

- **After every task commit:** Phase 49 produces NO new repo code commits — only `.planning/` artifacts. Snapshot evidence into `.planning/phases/49-push-v4-0-integration-pr/evidence/` after each task.
- **After every plan wave:** N/A — single-plan phase; no waves.
- **Before `/gsd:verify-work`:** `verify-phase-49.sh` must exit 0 and write evidence JSON for all 6 assertions.
- **Max feedback latency:** ~30 seconds for quick mode; CI-watch tasks block on `gh pr checks --watch` (up to ~10 min when CI fires).

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 49-01-01 | 01 | 1 | — (env probe) | — | `gh auth status` reports authed user `tonyrowles`; bypass-actor confirmed | shell | `bash scripts/verify-phase-49.sh --check env` | ❌ W0 | ⬜ pending |
| 49-01-02 | 01 | 1 | — (pre-flight) | T-49-PRE | Throwaway test PR exercises `--admin --merge` against linear-history ruleset; then closed (NOT merged into main) | shell | `gh pr view "$TEST_PR" --json state --jq .state` returns `CLOSED` after run | ❌ W0 | ⬜ pending |
| 49-01-03 | 01 | 1 | PUSH-01 | T-49-WRONG-PR | `v4.0-integration` branch pushed to origin; integration PR opened with 208-commit body | shell | `gh pr view "$PR_NUMBER" --json baseRefName,headRefName,commits --jq '.commits \| length'` returns `208`; PR # captured to `evidence/pr-number.env` | ❌ W0 | ⬜ pending |
| 49-01-04 | 01 | 1 | PUSH-02 | — | `gh pr checks --watch` exits 0 on integration PR (pragmatic SC-3 reading: every check that fired = SUCCESS) | shell | `gh pr checks "$PR_NUMBER" --watch` exits 0; rollup JSON captured to `evidence/pre-merge-checks.json` | ❌ W0 | ⬜ pending |
| 49-01-05 | 01 | 1 | PUSH-01, SC-4 | T-49-SQUASH | Admin-merge via `gh pr merge --admin --merge --subject ... --body ...`; merge commit has 2 parents (not 1 → not a squash) | shell | `git fetch origin && git cat-file -p "$MERGE_SHA" \| grep -c '^parent '` returns `2`; `gh pr view "$PR_NUMBER" --json mergeCommit --jq .mergeCommit.oid` matches | ❌ W0 | ⬜ pending |
| 49-01-06 | 01 | 1 | SC-1, SC-2 | — | Post-merge: 208-commit history visible on origin/main; 6 v40-* workflows discoverable | shell | `git log origin/main --oneline \| head -210 \| wc -l` ≥ 209; `gh workflow list --all --jq '[.[] \| select(.name \| startswith("v40-"))] \| length'` returns `6` | ❌ W0 | ⬜ pending |
| 49-01-07 | 01 | 1 | SC-3, PUSH-02 | — | Post-merge CI on `$MERGE_SHA` reports all check-runs SUCCESS | shell | `gh run list --commit "$MERGE_SHA" --json conclusion --jq '[.[] \| select(.conclusion != "success")] \| length'` returns `0` | ❌ W0 | ⬜ pending |
| 49-01-08 | 01 | 1 | (handoff) | — | `49-INTEGRATION.md` written with `pr_number`, `merge_sha`, `merged_at` for Phase 50 to consume | source | `test -f .planning/phases/49-push-v4-0-integration-pr/49-INTEGRATION.md && grep -E 'pr_number:\|merge_sha:\|merged_at:' 49-INTEGRATION.md \| wc -l` returns `3` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `.planning/phases/49-push-v4-0-integration-pr/scripts/verify-phase-49.sh` — single SC harness wrapping the 6 verifications above; supports `--check <env|push|merge|post>` for targeted runs and `--quick` for the env+post subset
- [ ] `.planning/phases/49-push-v4-0-integration-pr/evidence/` — directory for JSON captures (`pr-number.env`, `pre-merge-checks.json`, `merge-sha.env`, `post-merge-workflows.json`, `post-merge-runs.json`)

*(No framework install needed — `gh`, `git`, `jq` are pre-existing.)*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| GitHub audit log shows merge event as "merged" (not "squashed-and-merged") | SC-4 | Audit-log UI is the canonical source; CLI mirrors but operator should eyeball once | `gh browse --repo <owner>/<repo>` → Settings → Security log → filter `action:pull_request.merge` — confirm event type `merged` not `squashed_and_merged` |
| Operator visually confirms 208-commit list on the merged PR page | PUSH-01 | Spot-check that GitHub's display matches the count assertion | `gh pr view "$PR_NUMBER" --web` |

---

## Validation Sign-Off

- [ ] All tasks have automated `<verify>` blocks or Wave 0 dependencies on `verify-phase-49.sh`
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify (8 sequential, all verified)
- [ ] Wave 0 covers the SC harness script + evidence directory
- [ ] No watch-mode flags (`gh pr checks --watch` is a one-shot blocking call, NOT background)
- [ ] Feedback latency < 30s for quick checks; CI-watch task documented as the slow gate
- [ ] `nyquist_compliant: true` set in frontmatter after planner authors `verify-phase-49.sh`

**Approval:** pending

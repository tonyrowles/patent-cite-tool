#!/usr/bin/env bash
# Phase 49 SC harness — verifies all 4 ROADMAP success criteria.
# Usage:
#   bash verify-phase-49.sh --pre-merge <PR_NUMBER>
#   bash verify-phase-49.sh --post-merge <PR_NUMBER> <MERGE_SHA>
#
# --pre-merge mode (Task 04): asserts PR-level statusCheckRollup SC-3 + CI-fired-and-SUCCESS
# --post-merge mode (Task 06): asserts SC-1, SC-2, SC-4, ruleset-immutability, worktree-merge preservation
#
# Exits 0 iff every asserted SC passes; non-zero on first failure.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
EVIDENCE_DIR="$REPO_ROOT/.planning/phases/49-push-v4-0-integration-pr/evidence"
mkdir -p "$EVIDENCE_DIR"

# Operator identity lock (required in every gh-mutating or gh-reading invocation)
gh api user --jq .login | grep -qx tonyrowles || { echo "FAIL: wrong operator (expected tonyrowles)"; exit 1; }

MODE="${1:?usage: verify-phase-49.sh --pre-merge <PR_NUMBER> | --post-merge <PR_NUMBER> <MERGE_SHA>}"

echo "===== $(date -Iseconds) — Phase 49 SC verification (mode: $MODE) ====="

do_pre_merge() {
  local PR_N="${1:?do_pre_merge requires PR_NUMBER}"

  echo "--- Pre-merge mode: asserting pragmatic SC-3 + T-49-CI-FALSE-GREEN ---"

  # SC-3 (pragmatic): zero non-SUCCESS concluded checks on PR statusCheckRollup
  # Phase 49 deviation: SKIPPED counted as acceptable. Workflows like
  # V40 pdfjs Frame-Shift Pre-Flight legitimately skip when their `paths:`
  # filter doesn't match the diff; treating SKIPPED as a failure would block
  # any PR that doesn't touch every conditional workflow's scope.
  FAIL=$(gh pr view "$PR_N" --json statusCheckRollup \
    --jq '[.statusCheckRollup[] | select(.conclusion != null and .conclusion != "SUCCESS" and .conclusion != "SKIPPED")] | length')
  test "$FAIL" = "0" || { echo "FAIL SC-3: $FAIL non-SUCCESS-and-non-SKIPPED checks on PR #$PR_N (pragmatic reading)"; exit 1; }
  echo "SC-3 (pre-merge): zero non-SUCCESS non-SKIPPED checks — PASS"

  # T-49-CI-FALSE-GREEN mitigation: CI check must have fired AND reported SUCCESS
  # Phase 49 deviation: filter by workflowName (declared workflow name) rather
  # than the lowercased `name` field returned by GraphQL. The plan's check used
  # `name == "CI"` which never matches because GraphQL normalizes name to "ci".
  # At least one `workflowName == "CI"` entry with conclusion=SUCCESS is required.
  CI_OK=$(gh pr view "$PR_N" --json statusCheckRollup \
    --jq '[.statusCheckRollup[] | select(.workflowName == "CI" and .conclusion == "SUCCESS")] | length')
  test "$CI_OK" -ge 1 || { echo "FAIL T-49-CI-FALSE-GREEN: CI workflow did not fire or did not report SUCCESS on PR #$PR_N (CI_OK=$CI_OK)"; exit 1; }
  echo "T-49-CI-FALSE-GREEN: CI workflow fired and SUCCESS ($CI_OK run(s)) — PASS"

  echo "===== ALL pre-merge SCs PASS (SC-3 pragmatic + T-49-CI-FALSE-GREEN) — see $EVIDENCE_DIR for evidence ====="
}

do_post_merge() {
  local PR_N="${1:?do_post_merge requires PR_NUMBER}"
  local MERGE_SHA="${2:?do_post_merge requires MERGE_SHA}"

  echo "--- Post-merge mode: asserting SC-1, SC-2, SC-4 + negative tests ---"

  # SC-4 (2-parent merge, NOT squash): git cat-file object-graph proof
  PARENT_COUNT=$(git cat-file -p "$MERGE_SHA" | grep -c '^parent ')
  test "$PARENT_COUNT" = "2" || { echo "FAIL SC-4: parent_count=$PARENT_COUNT (expected 2 — squash detected!)"; exit 1; }
  echo "SC-4: 2-parent merge commit verified — PASS"

  # Capture merge commit object for evidence (SOLE writer per issue #7)
  git cat-file -p "$MERGE_SHA" > "$EVIDENCE_DIR/merge-commit-object.txt"

  # SC-1 (commit-count): from env-probe.json (execution-time-derived per issue #2)
  # Phase 49 deviation: plan's `origin/main..origin/v4.0-integration || MERGE_SHA-fallback`
  # never fell through because the LHS git rev-list returns exit 0 when count is 0
  # — and post-merge, v4.0-integration is an ancestor of main via the merge commit so
  # the count IS legitimately 0. Use the MERGE_SHA^1..^2 approach unconditionally; it
  # computes commits-on-PR-side-of-merge regardless of branch deletion state.
  EXPECTED=$(jq -r .commits_ahead "$EVIDENCE_DIR/env-probe.json")
  ACTUAL=$(git rev-list --count "$MERGE_SHA^1..$MERGE_SHA^2")
  test "$ACTUAL" -eq "$EXPECTED" || { echo "FAIL SC-1: commit count $ACTUAL != expected $EXPECTED (from env-probe.json)"; exit 1; }
  echo "SC-1 (commit-count): $ACTUAL commits (via MERGE_SHA^1..^2) == expected $EXPECTED — PASS"

  # SC-1 (single integration merge commit present)
  MERGE_COMMIT_COUNT=$(git log --merges origin/main --oneline | grep -c 'merge(v4.0-integration)')
  test "$MERGE_COMMIT_COUNT" = "1" || { echo "FAIL SC-1: expected exactly 1 merge(v4.0-integration) commit in origin/main --merges log, got $MERGE_COMMIT_COUNT"; exit 1; }
  echo "SC-1 (integration merge presence): 1 merge(v4.0-integration) commit — PASS"

  # SC-1 (worktree-merge SHA-list strict preservation per issue #9)
  echo "SC-1 (worktree-merge preservation): checking each SHA in expected-worktree-merges.txt..."
  FAILED_SHAs=""
  while read sha; do
    test -z "$sha" && continue
    git merge-base --is-ancestor "$sha" origin/main || { FAILED_SHAs="$FAILED_SHAs $sha"; }
  done < "$EVIDENCE_DIR/expected-worktree-merges.txt"
  if [ -n "$FAILED_SHAs" ]; then
    echo "FAIL SC-1: expected worktree-merge commits NOT found as ancestors of origin/main:$FAILED_SHAs"
    exit 1
  fi
  echo "SC-1 (worktree-merge preservation): all SHAs in expected-worktree-merges.txt are ancestors of origin/main — PASS"

  # SC-2 (6 v40-* workflows discoverable on origin)
  # Phase 49 deviation: filter by PATH rather than NAME. The plan's
  # `select(.name | startswith("v40-"))` never matches because the workflow
  # declared names are "V40 Auto Promote" etc. (uppercase V, spaces), not
  # "v40-..." (lowercase, dashes). Filename pattern .github/workflows/v40-*.yml
  # is the stable matcher.
  V40_COUNT=$(gh workflow list --all --json path \
    --jq '[.[] | select(.path | startswith(".github/workflows/v40-"))] | length')
  test "$V40_COUNT" = "6" || { echo "FAIL SC-2: only $V40_COUNT v40-* workflows visible (expected 6)"; exit 1; }
  echo "SC-2: $V40_COUNT v40-* workflows discoverable — PASS"

  # Capture workflow names+paths to evidence (SOLE writer per issue #7)
  gh workflow list --all --json name,path,state \
    --jq '[.[] | select(.path | startswith(".github/workflows/v40-"))] | sort_by(.path)' \
    > "$EVIDENCE_DIR/post-merge-workflows.json"
  echo "SC-2: v40-* workflow names+paths captured to $EVIDENCE_DIR/post-merge-workflows.json"

  # Negative test: ruleset immutability (SOLE writer per issue #7)
  gh api repos/tonyrowles/patent-cite-tool/rulesets/17086676 > "$EVIDENCE_DIR/post-merge-ruleset.json"
  test "$(jq '.rules | length' "$EVIDENCE_DIR/post-merge-ruleset.json")" = "4" || { echo "FAIL T-49-RULESET-MUTATION: rules count changed post-merge (expected 4)"; exit 1; }
  test "$(jq '.bypass_actors | length' "$EVIDENCE_DIR/post-merge-ruleset.json")" = "1" || { echo "FAIL T-49-RULESET-MUTATION: bypass_actors count changed post-merge (expected 1)"; exit 1; }
  echo "T-49-RULESET-MUTATION: ruleset 17086676 unchanged (4 rules, 1 bypass actor) — PASS"

  echo "===== ALL post-merge SCs PASS (SC-1, SC-2, SC-4 + negative tests) — SC-3 verified by Task 07 against post-merge-runs.json — see $EVIDENCE_DIR for evidence ====="
}

case "$MODE" in
  --pre-merge)
    PR_N="${2:?--pre-merge requires PR_NUMBER as second argument}"
    do_pre_merge "$PR_N"
    ;;
  --post-merge)
    PR_N="${2:?--post-merge requires PR_NUMBER as second argument}"
    MERGE_SHA="${3:?--post-merge requires MERGE_SHA as third argument}"
    do_post_merge "$PR_N" "$MERGE_SHA"
    ;;
  *)
    echo "Unknown mode: $MODE"
    echo "Usage: verify-phase-49.sh --pre-merge <PR_NUMBER> | --post-merge <PR_NUMBER> <MERGE_SHA>"
    exit 1
    ;;
esac

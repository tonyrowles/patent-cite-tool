# Phase 49: Push v4.0-Integration PR — Pattern Map

**Mapped:** 2026-06-02
**Files analyzed:** 3 (1 bash script, 1 evidence directory, 1 handoff doc)
**Analogs found:** 2 / 3 (sparse mapping — release-engineering phase, NO production source code created)

## Phase Character (Recap)

Phase 49 is a one-shot release-engineering operation. It creates **NO** production source code — no controllers, services, components, or modules. The only authored artifacts are:

1. A bash verification harness wrapping `gh` + `git` + `jq`.
2. Runtime evidence captures (`*.json`, `*.env`) produced at execution time, not authored.
3. A small markdown handoff doc consumed by Phase 50.

The phase ALSO performs GitHub state mutations (`git push`, `gh pr create`, `gh pr merge --admin`), but those are operations, not files. Mapping is therefore sparse and honest: most pattern guidance defers to RESEARCH.md's pre-verified `gh`/`git`/`jq` code examples.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `.planning/phases/49-push-v4-0-integration-pr/scripts/verify-phase-49.sh` | verification-harness (bash) | shell-procedural / GitHub-state-readback | `scripts/llm-cron-run.sh` | weak (header+`set` flags only) — RESEARCH §Code Examples is the canonical source |
| `.planning/phases/49-push-v4-0-integration-pr/evidence/*.{json,env}` | runtime evidence (not authored — captured) | gh-API → JSON-on-disk | `.planning/phases/48-pre-push-regression-fixes/48-VERIFICATION.md` "Behavioral Spot-Checks" table (in-doc evidence; no separate dir) | no exact analog — Phase 49 introduces the per-phase `evidence/` subdirectory convention |
| `.planning/phases/49-push-v4-0-integration-pr/49-INTEGRATION.md` | handoff doc to Phase 50 (markdown) | static read by Phase 50 plan | `.planning/v3.0-INTEGRATION.md` (full milestone integration doc) **+** `.planning/phases/48-pre-push-regression-fixes/48-01-SUMMARY.md` (frontmatter + crosscheck shape) | role-match (integration handoff) + structural-match (frontmatter style) |

## Pattern Assignments

### `.planning/phases/49-push-v4-0-integration-pr/scripts/verify-phase-49.sh` (bash verification harness)

**Analog (weak):** `scripts/llm-cron-run.sh` — the only existing bash script in the repo. It is a **cron entrypoint**, not a verification harness, so the analogy stops at the shebang + flags + log redirection style. The CORE verification logic must be sourced from RESEARCH.md §Code Examples (which is already verified against live `gh` output and is the canonical reference for this phase).

**Pattern A — shebang and environment hardening** (`scripts/llm-cron-run.sh` lines 1-10):

```bash
#!/usr/bin/env bash
# Daily LLM exploratory run — invoked by Windows Task Scheduler via:
#   wsl.exe -d Ubuntu -u fatduck /home/fatduck/patent-cite-tool/scripts/llm-cron-run.sh
#
# Self-contained: sets its own PATH so it does not depend on shell init files.
# Spend cap enforced by tests/e2e/.llm-spend-ledger.json ($80 warn / $100 block).

set -u
export PATH=/home/fatduck/.local/bin:/home/fatduck/.local/share/fnm/aliases/default/bin:/usr/local/bin:/usr/bin:/bin
export HOME=/home/fatduck
```

**Apply for Phase 49:**
- Use `#!/usr/bin/env bash` (NOT `/bin/sh`).
- Use `set -euo pipefail` (Phase 49 needs `-e` to abort on first verify failure; `llm-cron-run.sh` only uses `-u` because it deliberately catches build/test exit via `echo "===== exit=$? ====="`).
- Header comment: invocation example + what the script verifies (the 6 success criteria from RESEARCH.md §Validation Architecture).
- **Do NOT export PATH** — Phase 49's harness is invoked interactively by the operator, not by Task Scheduler. The `llm-cron-run.sh` PATH hardening is needed because cron's environment is bare; an interactive harness inherits the operator shell's PATH (which already has `gh`, `git`, `jq`).

**Pattern B — logging / evidence capture** (`scripts/llm-cron-run.sh` lines 13-20):

```bash
LOG=/home/fatduck/patent-cite-tool/.llm-cron.log
cd /home/fatduck/patent-cite-tool || exit 1

{
  echo "===== $(date -Iseconds) ====="
  npm run build:chrome && npm run e2e:explore -- --iterations 3
  echo "===== exit=$? ====="
} >> "$LOG" 2>&1
```

**Apply for Phase 49:**
- Use `EVIDENCE_DIR="$(git rev-parse --show-toplevel)/.planning/phases/49-push-v4-0-integration-pr/evidence"` and `mkdir -p "$EVIDENCE_DIR"` at the top, derived from `git rev-parse` (per MEMORY.md feedback `feedback_orchestrator_cwd_drift.md` — CWD can drift; always anchor to repo root).
- Redirect each `gh ... --json ...` capture directly to a named evidence file (NOT to one bulk log) so each SC has a discrete artifact the verifier can re-parse. Example: `gh pr view "$PR_N" --json statusCheckRollup > "$EVIDENCE_DIR/pre-merge-state.json"`.
- The `===== $(date -Iseconds) =====` framing is fine for a top-of-file timestamp banner echoed to stdout.

**Pattern C — verification body (THIS IS NEW — no repo analog)**

The verification logic itself has no analog in the repo. **Use RESEARCH.md §Code Examples verbatim** — it contains the six pre-verified canonical invocations:

1. Push to remote branch (lines 343-353 of RESEARCH.md)
2. Create the integration PR (lines 357-399)
3. Wait for CI green (lines 403-414)
4. Admin-merge with merge-commit (lines 418-432)
5. Verify the merge landed as a merge-commit (lines 436-453) — `git cat-file -p "$MERGE_SHA" | grep -c '^parent '` returning `2` is the SC-4 negative test
6. Verify 6 v40-* workflows discoverable (lines 457-467)
7. Verify CI on merged commit reports green (lines 471-481)

**Phase 49 verification-harness scope clarification:** the harness is the POST-MERGE verifier (runs after all 5 steps have been executed by the operator). It re-asserts each of the 6 success criteria with hard exits. It does NOT itself execute the push, create the PR, or run the merge — those are operator-driven steps documented in the plan body.

**Recommended skeleton (synthesized from `llm-cron-run.sh` shell hygiene + RESEARCH.md §Validation Architecture):**

```bash
#!/usr/bin/env bash
# Phase 49 SC harness — re-verifies all 4 ROADMAP success criteria post-merge.
# Usage: bash .planning/phases/49-push-v4-0-integration-pr/scripts/verify-phase-49.sh <PR_NUMBER> <MERGE_SHA>
# Exits 0 iff every SC passes; non-zero on first failure.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
EVIDENCE_DIR="$REPO_ROOT/.planning/phases/49-push-v4-0-integration-pr/evidence"
mkdir -p "$EVIDENCE_DIR"

PR_N="${1:?usage: verify-phase-49.sh <PR_NUMBER> <MERGE_SHA>}"
MERGE_SHA="${2:?usage: verify-phase-49.sh <PR_NUMBER> <MERGE_SHA>}"

echo "===== $(date -Iseconds) — Phase 49 SC verification ====="

# SC-1: 208-commit history present on origin/main (merge-commit, 2 parents)
PARENT_COUNT=$(git cat-file -p "$MERGE_SHA" | grep -c '^parent ')
test "$PARENT_COUNT" = "2" || { echo "FAIL SC-1/SC-4: parent_count=$PARENT_COUNT (expected 2 — squash?)"; exit 1; }

# SC-2: 6 v40-* workflows discoverable
V40_COUNT=$(gh workflow list --all --json name --jq '[.[] | select(.name | startswith("v40-"))] | length')
test "$V40_COUNT" = "6" || { echo "FAIL SC-2: v40 workflow count=$V40_COUNT (expected 6)"; exit 1; }

# SC-3: statusCheckRollup all SUCCESS on PR
FAIL_CHECKS=$(gh pr view "$PR_N" --json statusCheckRollup \
  --jq '[.statusCheckRollup[] | select(.conclusion != "SUCCESS")] | length')
test "$FAIL_CHECKS" = "0" || { echo "FAIL SC-3: $FAIL_CHECKS non-SUCCESS checks"; exit 1; }

# Evidence capture
gh pr view "$PR_N" --json statusCheckRollup,mergedAt,mergeCommit > "$EVIDENCE_DIR/post-merge-pr-state.json"
git cat-file -p "$MERGE_SHA" > "$EVIDENCE_DIR/merge-commit-object.txt"

echo "===== ALL SCs PASS — see $EVIDENCE_DIR for evidence ====="
```

**Source assertions for the skeleton:** every `gh`/`git`/`jq` line above is copy-paste-verified from RESEARCH.md (already validated against the live repo); the shell hygiene (`set -euo pipefail`, `$(git rev-parse --show-toplevel)` anchor, `mkdir -p`, `${1:?usage: ...}`) is standard bash and does not need a repo analog.

---

### `.planning/phases/49-push-v4-0-integration-pr/evidence/*.{json,env}` (runtime evidence captures)

**Analog:** None as a directory — Phase 49 introduces the per-phase `evidence/` convention. The closest spiritual analog is the in-document evidence captured in Phase 48's `48-VERIFICATION.md` "Behavioral Spot-Checks" and "Required Artifacts" tables, which inline-embed command outputs as evidence.

**Pattern — name evidence files by what they prove, not by phase step number** (synthesized from Phase 48's table-row labels):

| Evidence filename | Proves |
|-------------------|--------|
| `pr-number.env` | The PR number captured at create-time (consumed by every later step) |
| `pre-merge-pr-state.json` | PR head SHA, mergeable, statusCheckRollup at the moment CI went green |
| `post-merge-pr-state.json` | PR mergedAt + mergeCommit.oid after admin-merge |
| `merge-commit-object.txt` | Raw `git cat-file -p $MERGE_SHA` output (proves 2 parents = merge-commit, not squash) |
| `v40-workflows-on-origin.json` | Six v40-* workflow names + paths visible via `gh workflow list --all` |
| `post-merge-ci-runs.json` | CI run conclusions on the merge SHA (SC-3 evidence) |

**Source:** RESEARCH.md §Code Examples produces every one of these filenames as redirected output. The naming convention (lowercase-with-hyphens, `<role>-<aspect>.{json,env,txt}`) follows the Phase 48 SUMMARY's tabular evidence style (`8 PASS`, `Live probe 1 (no env)`, `Live probe 2 (CI=true)`).

**Important:** evidence files are **captured at execution time**, NOT authored ahead of time. The planner should NOT create these files as plan-task outputs; instead, plan tasks should describe the `gh ... > $EVIDENCE_DIR/<name>.json` capture commands and assert the file exists with the expected `--jq` shape post-capture.

---

### `.planning/phases/49-push-v4-0-integration-pr/49-INTEGRATION.md` (handoff to Phase 50)

**Primary analog (role-match):** `.planning/v3.0-INTEGRATION.md` — the only prior INTEGRATION.md in the planning tree. Same role: a cross-phase wiring/handoff document. BUT structurally larger (303 lines, 6 boundary sections + E2E flow verdict) than Phase 49 needs.

**Secondary analog (structural-match for frontmatter):** `.planning/phases/48-pre-push-regression-fixes/48-01-SUMMARY.md` — same era, same release-engineering character, same compact YAML frontmatter style.

**Frontmatter pattern** (from `48-01-SUMMARY.md` lines 1-39):

```yaml
---
phase: 48-pre-push-regression-fixes
plan: 01
subsystem: e2e-test-suite
tags: [ledger-leak, calendar-determinism, lockfile-pin, regression-fixes]
requires:
  - <file or commit reference>
provides:
  - <capability or output>
affects:
  - <downstream consumers>
tech-stack:
  added: []
  patterns:
    - "<pattern name in quotes>"
key-files:
  created:
    - <path>
  modified:
    - <path>
decisions:
  - "<short rationale>"
metrics:
  duration: ~12 minutes
  completed_date: 2026-06-02
---
```

**Apply for Phase 49 INTEGRATION.md frontmatter:**

```yaml
---
phase: 49-push-v4-0-integration-pr
handoff_to: 50-cleanup-04-required-status-checks
tags: [release-engineering, github-state, integration-pr]
provides:
  - pr_number: <captured at runtime>
  - merge_sha: <captured at runtime>
  - merged_at: <ISO timestamp from gh pr view --json mergedAt>
  - integration_id_candidates: <gh run list output, for Phase 50 ruleset PATCH>
requires:
  - origin/main now contains the v4.0-integration merge commit
  - 6 v40-* workflows discoverable on origin
affects:
  - Phase 50: ruleset PATCH consumes pr_number + integration_id
  - Phase 51 UAT-47-a/b/d/e: workflows now live, ready for live exercise
tech-stack:
  added: []
  patterns:
    - "Pre/post-merge state capture (JSON evidence diffing)"
    - "Admin-bypass merge against required_linear_history rule"
metrics:
  duration: <fill at completion>
  completed_date: <fill at completion>
---
```

**Body structure pattern** (synthesized from `v3.0-INTEGRATION.md` Boundary sections + `48-01-SUMMARY.md` per-requirement structure):

Use a HANDOFF-VARIABLES table at the top (Phase 50 reads this first), then a brief WHAT-LANDED section, then a POST-MERGE-STATE snapshot. Do NOT replicate the 6-boundary structure of `v3.0-INTEGRATION.md` — that is a milestone-close integration audit, much larger than Phase 49's per-phase handoff.

Recommended body skeleton:

```markdown
# Phase 49 → Phase 50 Integration Handoff

## Handoff Variables (Phase 50 reads these)

| Variable | Value | Source |
|----------|-------|--------|
| `pr_number` | <NN> | `evidence/pr-number.env` |
| `merge_sha` | <40-char SHA> | `gh pr view <N> --jq .mergeCommit.oid` |
| `merged_at` | <ISO> | `gh pr view <N> --jq .mergedAt` |
| `integration_id_candidates` | <ci.yml databaseId>, <pages databaseId> | `evidence/post-merge-ci-runs.json` |

## What Landed on origin/main

- 208 commits (187 work + 21 worktree-merge) from local `b54821e` → origin/main as merge-commit `$merge_sha`
- 6 new workflows discoverable: v40-auto-fix, v40-auto-promote, v40-cost-ledger-snapshot, v40-deps-update, v40-pdfjs-frame-shift, v40-verifier-gate

## Post-Merge State Snapshot

(Single evidence-capture summary; do not re-walk the 6 SCs — that is `49-VERIFICATION.md`'s job.)
```

**Pattern source:**
- HANDOFF-VARIABLES table style: `48-01-SUMMARY.md` lines 24-31 (`key-files` block) + lines 209-220 (per-Rule blocks naming specific files/commits).
- Compact per-section "What Landed" style: `v3.0-INTEGRATION.md` line 286+ "Summary" table.
- Avoid the long-form "Boundary" sections of `v3.0-INTEGRATION.md` — those are for cross-phase milestone integration, not single-phase handoffs.

---

## Shared Patterns

### Repo-root path anchoring (apply to harness script)

**Source:** MEMORY.md note `feedback_orchestrator_cwd_drift.md` — CWD can drift silently in worktree-agent waves and harnesses.

**Pattern:**
```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
EVIDENCE_DIR="$REPO_ROOT/.planning/phases/49-push-v4-0-integration-pr/evidence"
```

**Apply to:** `verify-phase-49.sh` (and any plan task that writes to `evidence/`).

### Lock the operator identity before admin-merge

**Source:** RESEARCH.md Assumption A4 (line 503) + Anti-Pattern (line 217). The bypass-actor mechanism is keyed on `actor_id=254599900` (`tonyrowles`). A context switch to `fattestduck` silently breaks the merge.

**Pattern:**
```bash
ACTUAL_USER=$(gh api user --jq .login)
test "$ACTUAL_USER" = "tonyrowles" || { echo "FAIL: gh user is '$ACTUAL_USER', not 'tonyrowles' (bypass actor)"; exit 1; }
```

**Apply to:** First task of every plan that calls `gh pr merge --admin`; mirrored as the first SC check in `verify-phase-49.sh`.

### Pin PR head SHA to defeat drift

**Source:** RESEARCH.md Pitfall 2 (lines 268-276). `gh pr merge` without `--match-head-commit` re-resolves head ref at merge time.

**Pattern:**
```bash
HEAD_SHA=$(gh pr view "$PR_NUMBER" --json headRefOid --jq .headRefOid)
gh pr merge "$PR_NUMBER" --admin --merge --match-head-commit "$HEAD_SHA" --subject "..."
```

**Apply to:** The admin-merge task; the harness should ALSO assert `HEAD_SHA == b54821e` (the locked local HEAD per RESEARCH.md §Pitfall 2 line 274).

### `jq -e` for assertive parsing

**Source:** Phase 48 SUMMARY pattern — `jq` calls used as exit-code-bearing assertions (lines 90-97 of `48-01-SUMMARY.md`).

**Pattern:**
```bash
test "$(jq '.months | keys | length' tests/e2e/.llm-spend-ledger.json)" = "1"
```

**Apply to:** Every SC check in `verify-phase-49.sh`. Always use `--jq` (built into `gh`) over piping to `jq` when `gh` is the source — fewer process boundaries, same result.

## No Analog Found

| Item | Reason |
|------|--------|
| **The verification harness itself** (`scripts/verify-phase-49.sh`) | No prior phase has authored a per-phase bash verification harness; verification has historically been embedded in `*-VERIFICATION.md` documents (see `.planning/phases/48-pre-push-regression-fixes/48-VERIFICATION.md` "Behavioral Spot-Checks" table). Phase 49 is the first phase to introduce a standalone executable SC harness. Pattern source MUST be RESEARCH.md §Code Examples (already pre-verified against live `gh` output) rather than any prior repo file. |
| **Per-phase `evidence/` subdirectory** | No prior phase has a sibling `evidence/` directory. Phase 49 introduces this convention to give Phase 50 a single, predictable location to read `pr_number.env` + `post-merge-ci-runs.json` without re-querying GitHub. |
| **`gh pr create` / `gh pr merge --admin` invocations** | Repo has never run these from within a plan (every prior phase was local-only — see `v4.0-SESSION-HANDOFF-2026-06-01.md` line 31: "All v4.0 work is local-only"). The first push happens in Phase 49. There are zero in-repo callers of `gh pr` to mimic. |
| **Ruleset interaction (`gh api .../rulesets/17086676`)** | Phase 49 does not mutate the ruleset; only reads it for evidence. Phase 50 is the first phase to PATCH it. No analog needed. |

## Metadata

**Analog search scope:**
- `/home/fatduck/patent-cite-tool/.planning/phases/` (current phases tree)
- `/home/fatduck/patent-cite-tool/.planning/milestones/` (archived phases — v1.0 through v4.0)
- `/home/fatduck/patent-cite-tool/scripts/` (repo-level scripts — 31 files, only 1 bash)
- `/home/fatduck/patent-cite-tool/bin/` (does not exist — confirmed via `ls`)
- `/home/fatduck/patent-cite-tool/.planning/quick/` (quick-task SUMMARY.md siblings)

**Files scanned for "gh pr merge|create|push origin":** 2 hits, both in Phase 49's own RESEARCH.md and VALIDATION.md — confirms no prior in-repo caller pattern exists.

**Files scanned for `*-INTEGRATION.md`:** 1 match (`v3.0-INTEGRATION.md`) — used as the role-match analog for `49-INTEGRATION.md`.

**Files scanned for `*-HANDOFF.md`:** 1 match (`v4.0-SESSION-HANDOFF-2026-06-01.md`) — wrong shape for Phase 49's needs (session-resume doc, not a phase-to-phase handoff).

**Pattern extraction date:** 2026-06-02

**Honest mapping confidence:** MEDIUM. The sparse mapping is correct — Phase 49 is a release-engineering operation against pre-verified `gh`/`git`/`jq` invocations, not a feature build. RESEARCH.md §Code Examples is the canonical pattern source for the bash harness body; the only repo-level patterns that meaningfully apply are bash hygiene from `llm-cron-run.sh`, frontmatter style from `48-01-SUMMARY.md`, and the role of an INTEGRATION.md from `v3.0-INTEGRATION.md`. The planner should NOT try to fabricate stronger analogs.

## PATTERN MAPPING COMPLETE

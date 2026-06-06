# Phase 50: CLEANUP-04 Readiness Gate - Context

**Gathered:** 2026-06-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Make ruleset 17086676 (v4.0-main-protection) actually enforce the v4.0 trust invariant on every PR to `main`:

1. **GATE-01.** Add a `required_status_checks` rule to the ruleset that requires both job-name contexts `verifier-gate` (from `.github/workflows/v40-verifier-gate.yml`) and `deps-update-gate` (from `.github/workflows/v40-deps-update.yml`) — pinned by integration_id of the GitHub Actions App (NOT the workflow-run databaseId Phase 49's INTEGRATION conflated). Ship a Vitest static-grep assertion in the SAME commit that pins both context strings against the YAML job definitions, so contract drift is caught at `npm test`.
2. **GATE-02.** Remove the lone `bypass_actors` entry (`actor_id=254599900, bypass_mode=always` — operator @tonyrowles) — but only AFTER (a) a committed break-glass procedure documents the recovery path AND (b) that procedure is tested live (PATCH-add-then-remove the bypass cycle) AND (c) GATE-03 proves enforcement works while the bypass is still present (so a misconfigured PATCH cannot brick the repo).
3. **GATE-03.** A test PR opened immediately after GATE-01 cannot merge until both required checks report success: API state (`gh pr view --json statusCheckRollup`) AND attempted-merge exit code (`gh pr merge ... --merge` without `--admin` exits non-zero with "required status checks" in stderr) — both captured to evidence.

**Out of scope:**
- Touching any v4.0 workflow YAML (verifier-gate.yml, deps-update.yml, etc.) — those are locked by the trust invariant. We pin their JOB NAMES, we do not modify them.
- Phase 49's bypass-merge mechanism — once GATE-02 lands, admin-bypass for the operator is gone for v4.1+; that's intentional, that's the point. Future emergency merges go through the documented break-glass procedure.
- The `auto-fix:partial-verified` semantics — Phase 53.
- The CI workflow (`.github/workflows/ci.yml`) — its check name is `"CI"` but we are pinning verifier-gate + deps-update-gate at the JOB context level, which fire independently of CI. CI may remain a non-required check, or be added in a future phase, but is NOT in scope for GATE-01.

</domain>

<decisions>
## Implementation Decisions

### GATE-01: Ruleset PATCH Strategy

- **D-01:** Two-step PATCH cadence: PATCH-add-checks first → GATE-03 test PR wedged between → PATCH-remove-bypass second. Two GitHub audit-log entries, one for "checks added" and one for "bypass removed". Test PR proves enforcement *before* the safety net (bypass) is removed.
- **D-02:** `integration_id` = `15368` (the GitHub Actions App ID, NOT the workflow-run databaseId `26860592872` that Phase 49's INTEGRATION-handoff conflated). Discover via an explicit numbered task step — `gh api /repos/tonyrowles/patent-cite-tool/check-runs/<recent-run-id>` and read `.app.id`, OR `gh api /app` against any v40-* run — DO NOT hardcode without verification. Per STATE blocker mandate ("integration_id capture must be an explicit numbered step").
- **D-03:** PATCH payload constructed GET → mutate → PUT (per STATE blocker mandate). Read full ruleset 17086676 JSON, append a new rule of `type: "required_status_checks"` with `parameters.required_status_checks = [{context: "verifier-gate", integration_id: 15368}, {context: "deps-update-gate", integration_id: 15368}]` and `parameters.strict_required_status_checks_policy = true`, preserve all 4 existing rules byte-for-byte. The second PATCH (GATE-02) reads the post-GATE-01 state and sets `bypass_actors: []`.
- **D-04:** Pre-PATCH baseline captured to `evidence/pre-patch-ruleset.json`; rollback script `evidence/rollback.sh` that re-PUTs that exact JSON is committed alongside. If GATE-03 reveals a misconfiguration, recovery is `bash evidence/rollback.sh` (one command).

### GATE-02: Break-Glass Procedure & Testing

- **D-05:** Break-glass procedure lives in `docs/v40-repo-config.md` as a NEW section §7 "Break-Glass: temporarily re-allowing bypass on ruleset 17086676". Single canonical config doc, no new file. PITFALLS.md line 100 explicitly suggests this option.
- **D-06:** Runbook contains 3 sections: (a) the `gh api PATCH` command to re-add `actor_id=254599900, bypass_mode=always` (pre-canned, copy-pasteable), (b) the inverse `gh api PATCH` to remove it again after recovery, (c) a "max 1 hour, document in incident log at `docs/incidents/<date>.md`" time-box. No automation — break-glass is by definition a manual deliberate operator decision.
- **D-07:** Pre-removal live test: BEFORE GATE-02 lands, run a PATCH-add-then-remove cycle of `bypass_actors` against the LIVE ruleset (using a different actor or the same actor twice — see D-08). Verify `gh api GET` shows the actor after the add and empty after the remove. This proves the recovery path works under current auth. PITFALLS.md line 110: "verify `gh api` PATCH to the ruleset succeeds with the owner's current auth — confirm the break-glass path is functional before removing `bypass_actors=1`".
- **D-08:** The live break-glass test PATCH-adds the SAME existing actor (id `254599900`) a second time as a no-op (idempotent — GitHub API tolerates re-adding the same actor), then PATCH-removes back to the single-actor state. This avoids any window where the ruleset has 0 OR 2 bypass actors. Evidence captures the GET states before, during, and after.
- **D-09:** Evidence: `evidence/break-glass-test.json` (snapshots) + `evidence/break-glass-test.log` (gh api command transcripts with auth headers redacted via `sed 's/Bearer [^"]*/Bearer REDACTED/g'`).

### GATE-03: Test PR Enforcement Verification

- **D-10:** Test PR content: add a throwaway file `.planning/scratch/gate-03-probe.txt` (single line `gate-03 probe ${ISO_TIMESTAMP}`). Does NOT touch a CODEOWNED path (`.planning/` is not in CODEOWNERS per `tests/unit/codeowners.test.js`), so CODEOWNERS review requirement does not confound the verifier-gate/deps-update-gate signal we are isolating.
- **D-11:** PR branch named `test-only/gate-03-probe-${ISO_TIMESTAMP}`. Mirrors UAT-47-e convention from REQUIREMENTS.md line 84 (`test-only/diff-guard-*` "CLOSED not merged"). PR is CLOSED (not merged) immediately after the "cannot merge" assertion fires. Branch deleted afterward.
- **D-12:** Two-pronged "cannot merge" assertion captured to `evidence/gate-03-merge-blocked.txt`:
  - Method A: `gh pr view ${PR} --json statusCheckRollup` shows BOTH `verifier-gate` and `deps-update-gate` contexts present with `state ∈ {PENDING, FAILURE, EXPECTED}` (NOT `SUCCESS`) — proves the contexts are registered as required.
  - Method B: `gh pr merge ${PR} --merge` (NO `--admin` flag) exits non-zero with stderr matching `/required status check/i` — proves enforcement is real, not just declared.
  - BOTH must pass; either alone is insufficient.
- **D-13:** Vitest static-grep assertion (SC-4): EXTEND existing `tests/unit/v40-verifier-gate-doc.test.js` with 2 new `it()` blocks. Block 1: `grep "verifier-gate:" .github/workflows/v40-verifier-gate.yml` returns a match (jobid declaration). Block 2: `grep "deps-update-gate:" .github/workflows/v40-deps-update.yml` returns a match. No new test file (matches Phase 48 "no new helper module" principle). Test ships in the SAME commit as the GATE-01 PATCH (per REQUIREMENTS.md GATE-01 wording: "verification via subsequent `gh api GET` + Vitest static-grep guard").

### Sequencing & Commit Structure

- **D-14:** **One plan (`50-01-PLAN.md`)** with 6 sequential tasks. Mirrors Phase 48 / Phase 49 single-plan convention. Tasks cannot run in parallel because each depends on the prior task's live GitHub state.
- **D-15:** Task order (LOCKED):
  1. `chore(50): break-glass procedure docs §7 in v40-repo-config.md` — runbook committed before any PATCH lands. Evidence: pre-PATCH ruleset capture.
  2. `chore(50): GATE-01 — PATCH ruleset 17086676 required_status_checks + Vitest pin contexts` — single commit shipping PATCH + Vitest grep extension + post-GATE-01 ruleset evidence.
  3. `chore(50): GATE-03 — test PR cycle verifies enforcement (CLOSED)` — opens test PR, captures two-pronged blocked-merge evidence, closes PR + deletes branch.
  4. `chore(50): break-glass live add-then-remove cycle on bypass_actors (idempotent)` — proves recovery path works under current auth; evidence captured.
  5. `chore(50): GATE-02 — PATCH ruleset 17086676 bypass_actors=[]` — second PATCH; post-GATE-02 ruleset evidence captured.
  6. `chore(50): final ruleset snapshot + evidence/INDEX.md + 50-01-SUMMARY.md` — closure narrative + evidence index.
- **D-16:** Commit-message pattern: `chore(50): <one-line>` (no GATE-NN prefix — the task title carries that). Mirrors Phase 49 commit style (no `GATE-` prefix in messages either).
- **D-17:** Evidence convention: per-task `evidence/` files (Phase 49 v4.1 convention) — `pre-patch-ruleset.json`, `post-gate-01-ruleset.json`, `gate-03-merge-blocked.txt`, `break-glass-test.json`, `break-glass-test.log`, `post-gate-02-ruleset.json`, `final-ruleset.json`, `rollback.sh`, `INDEX.md`.

### Claude's Discretion

- Exact PATCH body shape for `required_status_checks` rule beyond the two contexts: `strict_required_status_checks_policy: true` is recommended (require branches up-to-date) but planner may decide otherwise based on a final read of GitHub's current ruleset schema.
- Whether `evidence/rollback.sh` is a `bash` script or a single-line `gh api` invocation in a comment in `INDEX.md` — bash script preferred for clarity, but either is acceptable if the rollback is one command.
- Whether to capture an additional `evidence/integration-id-discovery.log` showing how the GH Actions App ID was confirmed — recommended but not strictly required by any SC.
- Whether the GATE-03 test PR's body documents its purpose (so a casual repo visitor understands what `test-only/gate-03-probe-*` is for) — recommended.
- Whether to remove the throwaway `.planning/scratch/gate-03-probe.txt` from the branch with an explicit `git rm` commit or simply close-without-merge (branch is discarded). Close-without-merge is fine since the file never lands on `main`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Roadmap (LOCKED)
- `.planning/REQUIREMENTS.md` §"Readiness Gate (post-push ruleset)" — GATE-01, GATE-02, GATE-03 verbatim requirement text.
- `.planning/ROADMAP.md` §"Phase 50: CLEANUP-04 Readiness Gate" (lines 195-208) — 4 success criteria.

### Research (HIGH-confidence)
- `.planning/research/PITFALLS.md` Pitfall 3 (bypass_actors removal with no break-glass) — lines 96-114, 363, 397, 409, 435.
- `.planning/research/SUMMARY.md` §"CLEANUP-04 ruleset patch" — line 40, 85, 114, 116.

### Phase 49 handoff (the immediately preceding phase)
- `.planning/phases/49-push-v4-0-integration-pr/49-INTEGRATION.md` — handoff variables (pr_number=10, merge_sha=c0bb37d5, integration_id_candidates=26860592872 — **NOTE: this is the workflow-run databaseId, NOT the GitHub Actions App ID; Phase 50 uses 15368, the App ID**).
- `.planning/phases/49-push-v4-0-integration-pr/evidence/post-merge-ruleset.json` — current ruleset baseline (4 rules, 1 bypass actor `254599900`). Phase 50 starts from this exact state.
- `.planning/phases/49-push-v4-0-integration-pr/evidence/post-merge-runs-summary.json` — workflowName + databaseId per workflow (informational; not the integration_id we need).

### Repo config canonical
- `docs/v40-repo-config.md` §2 "Branch protection ruleset on `main`" — current empty `required_status_checks` slot reserved for this phase; expected post-patch state.
- `docs/v40-repo-config.md` §3 "Operational tradeoff" — single-maintainer + Do not allow bypassing decision.

### Source files to modify
- **NEW** `docs/v40-repo-config.md` §7 — break-glass procedure runbook (Task 1).
- **NEW** `tests/unit/v40-verifier-gate-doc.test.js` — extend with 2 new `it()` blocks (Task 2). File already exists — current state pins `verifier-gate` workflow doc references.
- **NEW** `.planning/phases/50-cleanup-04-readiness-gate/50-01-PLAN.md` — single plan, 6 tasks.
- **NEW** `.planning/phases/50-cleanup-04-readiness-gate/evidence/*.json|*.txt|*.log|*.sh|INDEX.md` — per-task evidence (Phase 49 convention).
- **NOT modified:** Any `.github/workflows/v40-*.yml` — locked by trust invariant.
- **NOT modified:** `.github/CODEOWNERS` — orthogonal to ruleset PATCHes.

### Live GitHub state to PATCH
- Ruleset `17086676` (v4.0-main-protection) on `tonyrowles/patent-cite-tool`. Current state: 4 rules (deletion, non_fast_forward, required_linear_history, pull_request) + 1 bypass actor (`254599900`/owner-self, `bypass_mode=always`). Post-Phase-50 target: 5 rules (4 existing + new required_status_checks) + 0 bypass actors.
- GitHub Actions App ID: `15368` (verified via discovery step in Task 2).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Phase 49 evidence directory convention** — `evidence/` subdir with per-step JSON snapshots, `.env` handoff files, redacted logs. Phase 50 mirrors this exactly.
- **`tests/unit/v40-verifier-gate-doc.test.js`** — existing Vitest static-grep file for v40 workflow contract assertions. Extend, don't create new.
- **`.planning/scratch/`** — a non-CODEOWNED path safe for throwaway probe files (verified against `.github/CODEOWNERS`). Used by the GATE-03 test PR.
- **`gh api PATCH /repos/{owner}/{repo}/rulesets/{ruleset_id}` pattern** — standard GitHub rulesets REST endpoint; payload accepts partial fields per docs/v40-repo-config.md.

### Established Patterns
- **GET-then-PATCH for ruleset mutations** — STATE blocker mandate; preserves existing rules byte-for-byte.
- **Per-task evidence files** — Phase 49 v4.1 convention; each task captures its own pre/post JSON snapshots.
- **Test branches: `test-only/<purpose>-<timestamp>`, CLOSED never merged** — UAT-47-e convention, REQUIREMENTS.md line 84.
- **Static-grep over AST parsing** — Phase 47/48 precedent; no AST dependency, zero new npm deps.
- **One atomic commit per task** — Phase 48/49 precedent; clear audit trail per fix.

### Integration Points
- **Phase 51 dependency:** Once GATE-02 lands (`bypass_actors=[]`), Phase 51's UATs that need real CI runs will hit the enforced ruleset. Phase 51 must not depend on admin-bypass for any UAT setup.
- **Phase 53 dependency:** `auto-fix:partial-verified` semantics ship a NEW label that triggers ready-flip; with GATE-02 in effect, Phase 53's test PRs go through the enforced gate too. Phase 50 is the precondition.
- **Phase 49 inverse:** Phase 49 explicitly used the bypass actor to admin-merge PR #10 (215 commits). Phase 50 removes the path Phase 49 exploited — this is the intended trust-tightening direction.
- **Trust invariant boundary:** GATE-01 + GATE-02 together make the ruleset actually enforce what `docs/v40-repo-config.md` §3 says it does. Before Phase 50, the documented invariant and the live invariant diverge.

</code_context>

<specifics>
## Specific Ideas

- **`integration_id = 15368` is the GitHub Actions App ID, not the workflow-run databaseId.** Phase 49's INTEGRATION handoff says `integration_id_candidates: [{ workflow: CI, databaseId: 26860592872 }]` — that databaseId is the WORKFLOW RUN ID, useful for "this specific run" assertions but NOT what `required_status_checks.integration_id` expects. Phase 50's discovery step explicitly distinguishes these and captures the correct one (15368) to evidence.
- **Context strings `verifier-gate` and `deps-update-gate` are JOB NAMES (the YAML jobid), not workflow names.** Verified via `grep -nE "^\s+([a-z][a-z0-9-]+):\s*$" .github/workflows/v40-verifier-gate.yml` (job `verifier-gate` at line 181) and `.github/workflows/v40-deps-update.yml` (job `deps-update-gate` at line 164). The workflow `name:` strings ("V40 Verifier Gate", "V40 Deps Update") are NOT the context strings.
- **Idempotent live break-glass test:** Re-adding the SAME actor id (254599900) is a GitHub API no-op; this lets us exercise PATCH without ever having 0 OR 2 actors in flight.
- **`.planning/scratch/` is non-CODEOWNED.** Verified against `.github/CODEOWNERS`. The GATE-03 probe file does not trip CODEOWNERS review.
- **Time-box on break-glass = 1 hour, manual entry to `docs/incidents/<date>.md`.** Single-maintainer ops; no SLA enforcement automation in scope.

</specifics>

<deferred>
## Deferred Ideas

- **Add `"CI"` as a third required status check.** Considered for GATE-01; declined — `"CI"` is a workflow name (and the CI status check), not a v4.0 trust-invariant gate. Adding it widens scope beyond GATE-01's literal SC text ("both `verifier-gate` and `deps-update-gate`"). If future phases want CI required, add then.
- **Automated break-glass time-box enforcement (revert-after-N-minutes cron).** Considered; declined — operational complexity (cron in single-maintainer GH Actions) outweighs benefit for a procedure that should be exercised maybe once a year.
- **Replace `bypass_mode=always` with `bypass_mode=pull_request` for the break-glass runbook recommendation.** Considered; declined — `always` is what's documented in Phase 49 evidence; the runbook reverts to the EXACT prior state if used; semantic discussion of `always` vs `pull_request` belongs in a future ruleset-hardening phase.
- **Split GATE-01 PATCH and Vitest grep into separate commits.** Considered; declined per D-17 / SC-4 — they ship together so the static-grep defense is never absent while the ruleset references the contexts.
- **A unit test pinning the break-glass runbook's `gh api` command string.** Considered; declined — over-engineering for a manual procedure; the runbook is the source of truth.

### Reviewed Todos (not folded)
None — STATE.md "Pending Todos: None at v4.1 planning entry" remains current.

</deferred>

---

*Phase: 50-cleanup-04-readiness-gate*
*Context gathered: 2026-06-02*

# Phase 51: Live Readiness UATs - Context

**Gathered:** 2026-06-02
**Status:** Ready for planning
**Mode:** Selective live execution + documented deferrals

<domain>
## Phase Boundary

Re-stamp the 4 DEFERRED UATs from `.planning/milestones/v4.0-phases/47-v4-0-cleanup/47-UAT-DEFERRED.md` against the post-push, post-Phase-50 reality:

- **UAT-47-a (LIVE):** Trigger `v40-auto-fix.yml` on real issue #3 (`US11427642-spec-short-1`, fingerprint `139f821b3bb1`). Confirm: a draft PR opens on branch `auto-fix/3-139f821b`, verifier-gate runs end-to-end (3× affected case + 76-case regression + diff-guard), evidence captured. **PR LEFT OPEN** for v4.2 operator review.
- **UAT-47-e (LIVE):** Open a test PR on branch `test-only/diff-guard-uat-47-e-${ts}` that touches a LOCKED path (`tests/golden/baseline.json`). Verify the `diff-guard` job FAILS with the violated path in the PR comment. Verify the PR ends up with label `human-review-required`. **PR CLOSED, branch deleted** immediately after evidence capture (D-11 convention from Phase 50).
- **UAT-47-b (STILL DEFERRED):** Synthetic-regression dep-PR test is awkward to automate (manual fixture mutation + dep-bump composition). Document a sharper runbook in `51-UAT-EVIDENCE.md` §"UAT-47-b — Still Deferred"; defer execution to v4.2.
- **UAT-47-d (BLOCKED BY PHASE 50, STILL DEFERRED):** `v40-cost-ledger-snapshot.yml:91` does `git push` directly to `main`. Phase 50's ruleset (required PRs, no bypass actors) BLOCKS this push. Document as a Phase 50 regression in `51-UAT-EVIDENCE.md` §"UAT-47-d — Blocked by Phase 50 (regression)" + add an entry to STATE.md "Pending Todos" recommending a Phase 56 (v4.2) follow-up that either: (a) migrates the workflow to open a PR + auto-merge via the documented break-glass, or (b) reverts to a `ledger-snapshots/*` branch pattern that does not require touching `main`.

**Out of scope:**
- Modifying any v40-* workflow YAML — locked by trust invariant.
- Designing the Phase 56 follow-up that fixes UAT-47-d's structural block — that's a planning task for v4.2.
- Re-running UAT-47-a if the LLM produces unparseable output beyond the $5 budget cap — abort with documentation rather than retry past cap.
- Closing UAT-47-a's resulting draft PR — left OPEN per operator decision for v4.2 review queue.

</domain>

<decisions>
## Implementation Decisions

### Scope (operator-decided)

- **D-01:** Run UAT-47-a + UAT-47-e LIVE on canonical `tonyrowles/patent-cite-tool` (operator accepted the canonical-repo decision — no fork available). Document UAT-47-b + UAT-47-d as STILL DEFERRED with sharper runbooks.
- **D-02:** UAT-47-a draft PR is **LEFT OPEN** for v4.2 review queue. Do NOT close it after evidence capture. Convert to ready-for-review NO — keep as draft per VFY-GATE-03 convention.
- **D-03:** UAT-47-a budget cap = **$5 USD added during the run** (against `tests/e2e/.llm-spend-ledger.json`). Pre-run ledger snapshot captured to `evidence/uat-47-a-pre-run-ledger.json`; post-run ledger snapshot captured to `evidence/uat-47-a-post-run-ledger.json`; diff > $5 → abort the UAT, mark FAIL with cost explanation, do NOT retry.

### UAT-47-a execution shape

- **D-04:** Idempotency precondition (per STATE blocker): `gh issue view 3 --json labels | jq '.labels[] | select(.name=="triage")'` — issue #3 currently HAS the triage label. Run `gh issue edit 3 --remove-label triage && sleep 5 && gh issue edit 3 --add-label triage` (the remove-then-add cycle from STATE blocker) to ensure the workflow's `on: issues: types: [labeled]` trigger actually fires.
- **D-05:** Branch pre-existence check (per STATE blocker): `git ls-remote origin "auto-fix/3-139f821b*"` MUST return empty before the UAT starts. Already verified empty at planning time; re-verify at execution time. If non-empty: HALT and ask operator to clean up the branch first.
- **D-06:** Watch the workflow run via `gh run watch ${run_id}` with a 15-minute hard timeout. If the run hasn't reached `auto-fix` job's "create draft PR" step within 15 min, mark UAT as TIMED-OUT and capture partial logs to evidence.
- **D-07:** Success-heuristic evidence (per 47-UAT-DEFERRED.md):
  - `gh pr list --head auto-fix/3-139f821b --json number,state,isDraft -q '.[0]'` → `{state: "OPEN", isDraft: true}` (capture to `evidence/uat-47-a-pr-state.json`)
  - `gh pr view ${PR} --json body -q '.body' | grep -E 'affected_cases:'` exits 0 (capture body to `evidence/uat-47-a-pr-body.md`)
  - Verifier-gate run on the PR: capture conclusion via `gh run list --branch auto-fix/3-139f821b --workflow=v40-verifier-gate.yml --limit 1 --json databaseId,conclusion,createdAt` to `evidence/uat-47-a-verifier-gate-run.json`
  - Ledger commit on `main` with `[skip ci]` message — **WAIT: this is the UAT-47-d failure mode!** The v40-auto-fix workflow ALSO commits ledger to main directly. Document if this push fails as expected (UAT-47-a's success criteria do NOT require the ledger commit to land; only the draft PR opening). Capture whatever happened to `evidence/uat-47-a-ledger-commit-attempt.txt`.

### UAT-47-e execution shape

- **D-08:** Test branch name: `test-only/diff-guard-uat-47-e-$(date -u +%Y%m%dT%H%M%SZ)`. Mirrors UAT-47-e runbook convention + Phase 50's `test-only/gate-03-probe-*` precedent.
- **D-09:** PR body MUST include `<!-- affected_cases: any -->` (required by v40-verifier-gate.yml diff-guard parser per 47-UAT-DEFERRED.md line 129).
- **D-10:** Touch path: `tests/golden/baseline.json` (single line appended `/* uat-47-e crafted bypass test */`). This is one of the 6 LOCKED paths per VFY-GATE-03; diff-guard MUST reject it.
- **D-11:** Success-heuristic evidence:
  - `gh pr checks ${PR}` shows `diff-guard` status FAILURE (capture to `evidence/uat-47-e-pr-checks.json`)
  - `gh pr view ${PR} --json labels -q '.labels[].name'` contains `human-review-required` (capture to `evidence/uat-47-e-pr-labels.json`)
  - `gh pr view ${PR} --json comments -q '.comments[-1].body'` mentions `tests/golden/baseline.json` (capture to `evidence/uat-47-e-pr-comments.json`)
- **D-12:** PR CLOSED with `--delete-branch` immediately after evidence captured (D-11 from Phase 50 precedent; UAT-47-e runbook line 147 also mandates). Revert the local commit on the test branch via branch deletion — never touches `main` so no revert needed there.

### Sequencing

- **D-13:** Execute order: **UAT-47-e first (cheap, ~3min), UAT-47-a second (expensive, ~10min + $0.50-2)**. 47-e validates that the post-Phase-50 ruleset + CI integration actually fires verifier-gate on a real PR before we commit $$ to 47-a. If 47-e fails (gate not firing as expected), 47-a is automatically deferred too.
- **D-14:** One plan `51-01-PLAN.md` with 5 sequential tasks (mirrors Phase 48/49/50 single-plan convention):
  1. Pre-flight checks + write `51-UAT-EVIDENCE.md` skeleton with all 4 UAT sections (a, b, d, e — 2 LIVE, 2 STILL-DEFERRED)
  2. UAT-47-e LIVE execution (test PR cycle, evidence capture, PR CLOSED)
  3. UAT-47-a LIVE execution (label cycle, watch run, evidence capture, draft PR LEFT OPEN)
  4. Document UAT-47-b (STILL DEFERRED — sharper runbook for v4.2) + UAT-47-d (Phase 50 REGRESSION — needs Phase 56 follow-up)
  5. Final SUMMARY + STATE.md "Pending Todos" entry for UAT-47-d follow-up + ROADMAP update

### Operator approval gates

- **D-15:** Task 2 (UAT-47-e LIVE) — `type: checkpoint:human-verify`. Operator approves before opening the test PR. Cheap ($0, ~3 min CI).
- **D-16:** Task 3 (UAT-47-a LIVE) — `type: checkpoint:human-verify`. Operator approves before triggering. Costs ~$0.50-$2, takes ~10 min CI.
- **D-17:** Tasks 1, 4, 5 are `type: auto` (no live mutation beyond filesystem + git).

### Evidence convention

- **D-18:** Per-UAT evidence subdirectory inside `.planning/phases/51-live-readiness-uats/evidence/`:
  - `uat-47-a-*.json|md|txt` for 47-a artifacts
  - `uat-47-e-*.json` for 47-e artifacts
  - `51-UAT-EVIDENCE.md` — the master document (re-stamps all 4 UATs with status: PASS / STILL-DEFERRED / REGRESSION-DEFERRED)
  - `51-01-SUMMARY.md` — phase closure narrative
  - `evidence/INDEX.md` — per-file role map (mirrors Phase 50 convention)
- **D-19:** Commit-message pattern: `chore(51): <one-line>` (D-16 from Phase 50). One atomic commit per task.
- **D-20:** STATE.md "Pending Todos" gets a new entry: "Phase 56 (v4.2 backlog): refactor `v40-cost-ledger-snapshot.yml` to PR-then-merge pattern (UAT-47-d structurally blocked by Phase 50 ruleset)." This makes the v4.2 work visible without inserting a phase into v4.1.

### Claude's Discretion

- Exact wording of the UAT status fields in `51-UAT-EVIDENCE.md` ("PASS — captured 2026-06-02" vs "PASS — evidence at evidence/...")
- Whether to capture the full v40-auto-fix workflow run logs verbatim (`gh run view ${run_id} --log > evidence/uat-47-a-run.log`) or just the run metadata — recommended: capture full log if < 1MB, metadata only if larger.
- Whether to include a `<deferred>` section reference to the existing `47-UAT-EVIDENCE.md` so future readers can trace which UATs migrated to which phase — recommended yes for traceability.
- Whether the v40-auto-fix ledger-commit failure (likely caused by Phase 50 ruleset) gets its own UAT row or folds into UAT-47-a's deviation notes — recommended folds into 47-a deviations + cross-references UAT-47-d.
- Whether to add a section to `docs/v40-repo-config.md` noting that `v40-cost-ledger-snapshot.yml` and `v40-auto-fix.yml` (when committing ledger entries) are now blocked by the ruleset — recommended yes as forward-looking warning for whoever attempts to use them.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Roadmap (LOCKED)
- `.planning/REQUIREMENTS.md` §"Readiness UATs (post-push)" lines 32-37 — UAT-01, UAT-02, UAT-03, UAT-04 verbatim text.
- `.planning/ROADMAP.md` §"Phase 51" — 4 SCs verbatim.

### Phase 47 source runbook (HIGH-confidence)
- `.planning/milestones/v4.0-phases/47-v4-0-cleanup/47-UAT-DEFERRED.md` — verbatim 4-UAT stubs with dispatch commands, expected outcomes, success heuristics, rollback. This file is the canonical source for the runbook text Phase 51 honors.
- `.planning/milestones/v4.0-phases/47-v4-0-cleanup/47-UAT-EVIDENCE.md` — Phase 47's UAT evidence file (Phase 51 mirrors its structure for `51-UAT-EVIDENCE.md`).

### Phase 49 + Phase 50 prerequisites
- `.planning/phases/49-push-v4-0-integration-pr/49-INTEGRATION.md` — 6 v40-* workflows live on origin (Phase 51 SC depend).
- `.planning/phases/49-push-v4-0-integration-pr/evidence/post-merge-workflows.json` — workflow inventory proof.
- `.planning/phases/50-cleanup-04-readiness-gate/50-01-SUMMARY.md` — Phase 50 closure (the ruleset enforcement that complicates UAT-47-d).
- `.planning/phases/50-cleanup-04-readiness-gate/evidence/final-ruleset.json` — ruleset state Phase 51 PRs encounter.
- `docs/v40-repo-config.md` §7 — break-glass procedure (referenced by UAT-47-d's structural-block documentation).

### v4.0 workflow YAML (READ-ONLY for Phase 51 — trust invariant locked)
- `.github/workflows/v40-auto-fix.yml` — the workflow UAT-47-a exercises.
- `.github/workflows/v40-verifier-gate.yml` — fires on UAT-47-a + UAT-47-e PRs; diff-guard job is UAT-47-e's target.
- `.github/workflows/v40-deps-update.yml` — UAT-47-b's target (STILL DEFERRED).
- `.github/workflows/v40-cost-ledger-snapshot.yml` line 91 — `git push` directly to main, blocked by Phase 50 ruleset (UAT-47-d's structural block).

### Live infrastructure state
- Repo: `tonyrowles/patent-cite-tool` (canonical, not a fork — operator-accepted per D-01)
- Issue #3 state: OPEN, has `triage` + `e2e-nightly` + `quarantine:ready-for-promotion` + `WRONG_CITATION` labels (verified live 2026-06-02)
- Ruleset 17086676 state: 5 rules, 0 bypass actors, both `verifier-gate` + `deps-update-gate` required (per Phase 50 closure)
- Ledger state: `tests/e2e/.llm-spend-ledger.json` — Phase 48 reset baseline ($0 spent in current month bucket)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Phase 50 `test-only/<purpose>-<timestamp>` branch convention** — UAT-47-e mirrors as `test-only/diff-guard-uat-47-e-${ts}`.
- **Phase 50 per-task `evidence/` files convention** — Phase 51 mirrors with `uat-47-a-*` and `uat-47-e-*` prefixes.
- **`gh pr view --json` + `jq` capture pattern from Phase 50 Task 03** — same pattern reused for both UATs here.
- **47-UAT-EVIDENCE.md structure** — re-stamp template for the 4-UAT master document.
- **`gh run watch ${run_id}` blocking pattern** — useful for the 47-a watch step with 15-min hard timeout.

### Established Patterns
- **Operator-approval at LIVE infra mutations** (Phase 50 D-15) — Tasks 2 and 3 here use the same `type: checkpoint:human-verify` pattern.
- **Pre-run state snapshot + post-run diff** (Phase 50 D-04 rollback baseline) — applied here for ledger spend tracking (D-03 budget cap).
- **Bearer redaction in evidence logs** (Phase 50 D-09) — applied to any `gh api` output captured here.
- **Per-UAT-row evidence file refs in master EVIDENCE.md** — mirrors Phase 49 INTEGRATION.md's evidence table.

### Integration Points
- **Phase 50 ruleset is the blocker for UAT-47-d.** The `v40-cost-ledger-snapshot.yml:91` push to main now fails. This is a known regression we're documenting, not a bug to fix in Phase 51.
- **Phase 50 ruleset is the ENABLER for UAT-47-e.** Without verifier-gate as a required check (Phase 50 GATE-01), the diff-guard signal wouldn't block the PR. Phase 51 inherits Phase 50's enforcement.
- **Phase 53 dependency:** Per ROADMAP "Phase 53's partial-verified threshold calibration (4/5 floor) benefits from UAT-47-a evidence". Phase 51 deliberately captures UAT-47-a's verifier-gate per-case pass/fail counts so Phase 53 has empirical data.

</code_context>

<specifics>
## Specific Ideas

- **Issue #3 details** (verified live 2026-06-02): title "[e2e-nightly] US11427642-spec-short-1: WRONG_CITATION", labels include `triage`, `e2e-nightly`, `WRONG_CITATION`, `quarantine:ready-for-promotion`.
- **Expected v40-auto-fix branch:** `auto-fix/3-139f821b` (fingerprint per 47-UAT-DEFERRED.md inheritance).
- **UAT-47-a budget cap = $5 against current-month ledger** — measured via pre/post ledger snapshots. Cap is strict; no retry past cap (D-03).
- **UAT-47-e LOCKED path = `tests/golden/baseline.json`** — per runbook line 124; do NOT pick a different LOCKED path.
- **PR fate matters:** UAT-47-a PR stays OPEN (D-02). UAT-47-e PR is CLOSED + branch deleted (D-12).
- **No fork available** — operator confirmed running on canonical repo (D-01 implicit).

</specifics>

<deferred>
## Deferred Ideas

- **UAT-47-b (synthetic-regression dep-PR gate test)** — Awkward to automate manually. STILL DEFERRED with a sharper runbook in `51-UAT-EVIDENCE.md`. Suggested approach for v4.2: introduce a `tests/e2e/uat-helpers/regression-fixture-mutator.sh` script that builds the synthetic regression deterministically.
- **UAT-47-d (cost-ledger-snapshot daily commit)** — STRUCTURALLY BLOCKED by Phase 50 ruleset (cannot push to main without admin bypass, which Phase 50 removed). Document as regression; recommend Phase 56 follow-up (v4.2 backlog).
- **Forking the repo for safer UATs** — Operator-deferred. If we hit recurring issues from running UATs on canonical, set up a fork in v4.2 and re-run UATs there.
- **Hardening the v40-auto-fix workflow to handle ruleset-blocked ledger commits** — A real bug surfaced by Phase 51's UAT-47-a (workflow tries to commit ledger to main, will fail after Phase 50). Defer to a Phase 56 follow-up that fixes both 47-d and the 47-a side-effect together.
- **Closing UAT-47-a PR after capture** — Considered (cheapest option). Rejected per D-02 — operator wants the LLM-proposed fix preserved for v4.2 review.
- **Re-running UAT-47-a if first attempt is unparseable** — Rejected per D-03 — budget cap discipline > retries.

### Reviewed Todos (not folded)
None — STATE.md "Pending Todos: None at v4.1 planning entry" remains current. Phase 51 ADDS one new pending todo (D-20: Phase 56 follow-up for UAT-47-d).

</deferred>

---

*Phase: 51-live-readiness-uats*
*Context gathered: 2026-06-02*

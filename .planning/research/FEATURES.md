# Feature Research — v4.1 Readiness Gate + Push

**Domain:** LLM-CI / autonomous code-fix pipeline — readiness gating, observability, and trust hardening layered on a shipped v4.0 self-healing loop
**Researched:** 2026-06-02
**Confidence:** HIGH (v4.0 source + PROJECT.md read directly; Renovate docs, GitHub branch-protection docs, LLM benchmark sources, Anthropic model guidance verified current)

---

## Scope Note

This document covers ONLY the six v4.1 feature areas. The v4.0 self-healing pipeline (`v40-auto-fix.yml`, triple-gate `_skipCiGuard`, diff-guard, 5-state FLAKE classifier, cost ledger v2, dual LLM transport, dep-update watchlist) is treated as stable. Internals of those systems are not re-researched. The trust invariant — draft-PR-by-default + human-merge required + auto-promote opens SEPARATE follow-up PR + CODEOWNERS on locked paths — is the non-negotiable constraint every v4.1 feature must preserve or harden, not erode.

---

## Feature Landscape

### Table Stakes (Pipeline Operators Expect These)

Features that any mature LLM-CI system ships before live production use. Missing these makes the pipeline feel untrustworthy or unoperatable.

| Feature | Why Expected | Complexity | Pipeline Module Touched |
|---------|--------------|------------|------------------------|
| **Live readiness UAT — auto-fix end-to-end** | You cannot claim the loop works until you have run it against a real GitHub issue on the real infrastructure. v4.0 shipped local-only; UAT-47-a runbook stub exists but was never fired. Operators expect "it works on remote" as a basic claim before any v4.1 forward work. | M | `v40-auto-fix.yml`, `v40-verifier-gate.yml`, `v40-auto-promote.yml`, issue #3 `auto-fix/3-139f821b` branch |
| **Live readiness UAT — dep-update pre-flight gate** | The `v40-deps-update.yml` workflow was also never run on remote. Regression-gate blocking is the primary trust item; confirming it blocks correctly is table stakes. | S | `v40-deps-update.yml`, `deps-update-gate` job |
| **Live readiness UAT — daily ledger snapshot** | `[skip ci]` commit pattern exists in YAML; operator needs proof it fires, commits, and doesn't contaminate CI. | S | `v40-cost-ledger-snapshot.yml` |
| **Live readiness UAT — diff-guard bypass test** | Diff-guard is the verifier-gate gaming defense. Operators need evidence it fires on a crafted bypass attempt. This is not exercisable locally. | S | `v40-verifier-gate.yml` FORBIDDEN_PATHS bank, test needs crafted branch on remote |
| **Branch-protection `required_status_checks` patched** | The two deferred tech-debt items from v4.0 (`verifier-gate` + `deps-update-gate` job names missing from ruleset 17086676, `bypass_actors=1 bypass_mode=always`) are known holes in the protection envelope. Mature CI-as-code requires these closed before advertising "self-healing" capability. | S | GitHub ruleset 17086676, `gh api -X PUT` |
| **Bookkeeping cleanup — frontmatter re-stamp** | Five carry-over VERIFICATION.md / HUMAN-UAT.md files have stale `status` fields whose human_verification items were confirmed live in Phase 38-03 but never re-stamped. Three orphan quick-task slug references remain. Standard housekeeping; any credible phase history system is expected to be in-sync. | S | `.planning/phases/` — 32-UAT-EVIDENCE.md, 35/36/37-HUMAN-UAT.md, 38-UAT-EVIDENCE.md |

### Differentiators (v4.1 Competitive Advantage)

Features that go beyond "it works" into "it's observable, calibrated, and confidently expandable."

| Feature | Value Proposition | Complexity | Pipeline Module Touched |
|---------|-------------------|------------|------------------------|
| **Auto-fix dashboard in weekly digest** | Renovate's Dependency Dashboard (issue-based) is the industry baseline: lists pending PRs, tracks auto-merge successes and CI failures. The v4.1 differentiator is embedding the same signal *inside the existing Monday digest* rather than creating a separate dashboard issue — co-location with the triage digest means operators see triage + fix + dependency state in one place. The 7-key `SUMMARY_KEYS` contract and the `aggregateBySummaryKey` helper already constrain the schema; the dashboard extends it without breaking it. | M | `scripts/e2e-weekly-digest.mjs`, `.llm-spend-ledger.json` reader, `triage-report.json` reader |
| **`auto-fix:partial-verified` semantics** | All existing systems (OpenHands, Aider, Copilot Coding Agent) use all-or-nothing gate: the test either passes or it doesn't. A configurable N/M partial pass gate is novel — it allows "3 out of 5 affected cases pass the verifier → promote the patch as partial fix, file follow-up issue for remaining cases." This is the canary-deployment pattern applied to test corpora rather than traffic. | M | `v40-verifier-gate.yml`, `auto-fix-promote.mjs`, quarantine corpus schema |
| **Multi-model A/B (sonnet vs opus)** | No off-the-shelf system (Renovate, Sweep, Aider) instruments ERROR_CLASS-pinned model routing with unified cost-ledger tracking. The v4.1 approach — route by issue complexity (ERROR_CLASS + fix_attempts count), record model attribution per ledger entry, and declare winner after N=10 runs per class — closes the loop that the v4.0 cost ledger opened. External benchmarks (15-model comparison, 2026) confirm Sonnet 4.6 == Opus 4.7 on small code patches at 3x cheaper; the A/B rig lets this hypothesis be validated against *this* codebase's actual ERROR_CLASS distribution. | M | `auto-fix.mjs` model selector, `llm-ledger.js` `model_id` field, `build-ledger-dashboard.mjs` |
| **Push readiness gate — single v4.0-integration PR** | ~777 local commits need to land on a branch-protected `main` with an auditable record. The approach of a single `v4.0-integration` PR with `gh pr merge --admin` (owner self-merge via `bypass_actors=1` that is being closed in CLEANUP-04) preserves the full merge commit history and creates a single, navigable PR record. This is the merge-commit strategy advantage: complete audit trail, all 777 commits traceable, no history squash that would make `git bisect` harder on a legal-filing tool. | S | `gh pr merge --admin`, GitHub ruleset bypass, branch `v4.0-integration` |

### Anti-Features (Things That Erode the v4.0 Trust Invariant)

These features are commonly requested or "obvious next steps" in LLM-CI systems. Each one specifically undermines the trust invariant built across v3.1 and v4.0.

| Anti-Feature | Why Requested | Why It Erodes Trust Invariant | What to Do Instead |
|--------------|---------------|-------------------------------|-------------------|
| **Auto-merge the v4.0-integration PR** | "CI will be green after push, why wait?" | The `bypass_actors=1 bypass_mode=always` that enables admin self-merge is simultaneously being closed by CLEANUP-04. Using it for the integration push is the last-ever use of the escape hatch before it is sealed. Auto-merging anything via that bypass after the ruleset is patched circumvents CODEOWNERS review for all LOCKED paths. | Use `gh pr merge --admin` exactly once for `v4.0-integration`, then immediately patch ruleset 17086676 to remove `bypass_actors`. |
| **Partial-verified with a threshold below 3/5** | "If 2/5 cases pass the verifier, at least we fixed something." | 2/5 = 40% pass rate means the patch is more likely to introduce regressions than fix the filing. Trust-erosion failure mode A: operators see "partial-verified" PRs merging at 40% and begin to conflate "partial" with "good enough," raising the merge rate of unvalidated code touching `src/shared/matching.js` — which produces legal-filing citations. Trust-erosion failure mode B: a 2/5 "partial" fix may be covering up a FLAKE — if 2 of the 5 re-runs happened to land on good timing, the patch didn't fix anything. | Minimum threshold for partial-verified is 4/5 (80%). 3/5 requires explicit human override label. Anything below 3/5 is all-or-nothing FAIL. |
| **Including model ID in the weekly digest markdown** | "Visibility into which model fixed which issue." | Model IDs committed to the weekly digest markdown file appear in git history permanently. The v4.0 privacy audit (Phase 46) confirmed the committed `.llm-spend-ledger.json` contains model IDs; adding them to public-facing digest markdown compounds the PII surface. If Anthropic deprecates a model ID, the git-committed model name becomes a stale, confusing artifact in perpetuity. | Track model attribution in `.llm-spend-ledger.json` only. The digest reports aggregate stats (e.g., "sonnet: 7 fixes, opus: 2 fixes") without embedding model IDs in prose. |
| **`workflow_dispatch` trigger on auto-fix workflow for UAT** | "Let me manually trigger the auto-fix workflow to test it." | `workflow_dispatch` on `v40-auto-fix.yml` bypasses the `issues.labeled('triage')` guard that is the canonical input sanitization fence. Allowing manual dispatch means the workflow can be triggered with arbitrary inputs that haven't gone through the v3.1 triage pipeline's `<issue_body_untrusted>` envelope, reopening the prompt-injection surface closed in v4.0. | Use UAT-47-a's prescribed runbook: add the `triage` label to a real quarantine-corpus issue and let the workflow trigger naturally. Never add `workflow_dispatch` to `v40-auto-fix.yml`. |
| **Squash-merge for v4.0-integration PR** | "Keep main history clean — 777 commits is a lot of noise." | Squash removes the ability to `git bisect` the v4.0 implementation for regressions. Given citations go into legal filings, the ability to identify the exact commit that changed citation behavior is a first-class operational requirement. The v3.1 audit trail decision "Continue phase numbering across milestones" was made precisely to keep cross-milestone traceability. Squash destroys per-phase commit attribution. | Merge commit only. The 777 commits ARE the audit trail. Use `gh pr merge --merge` (not `--squash`). |
| **Adding `workflow_dispatch` to `v40-verifier-gate.yml` for diff-guard UAT** | "Easier to test diff-guard manually." | Verifier-gate is a PR-triggered workflow. Allowing manual dispatch means the gate can be run against arbitrary branches not associated with real PRs, potentially creating phantom-verification artifacts (verified labels applied to branches that never had a PR). This is the phantom-verification anti-pattern from the v4.0 FEATURES research applied to the gate itself. | For diff-guard UAT (UAT-47-e), push a crafted branch and open a DRAFT PR against a test fork or against main as a closed-immediately PR. The PR trigger is the only safe path. |
| **Retroactive commits for bookkeeping cleanup** | "Just amend the old planning files with the correct status in-place." | Amending historical planning commits breaks `git log` linearity and makes it impossible to determine what the state was at any point in time — the exact audit property that protects against "this was wrong but we said it was right." | Patch as NEW commits to `main` with clear messages like `chore(bookkeeping): re-stamp 35-HUMAN-UAT.md status passed (confirmed Phase 38-03)`. Forward-only. |

---

## Feature Dependencies

```
[UAT-47-a: end-to-end auto-fix on real issue]
    └──requires──> [v4.0 workflows on origin/main (post-push)]
                       └──requires──> [Push readiness gate — v4.0-integration PR merged]

[Push readiness gate]
    └──requires──> [Pre-push test fixes: Test 48 ledger leak, calendar-rollover flake, @anthropic-ai/sdk EXACT pin]
    └──requires──> [CLEANUP-04 ruleset patch] (should follow immediately after push)

[Auto-fix dashboard in weekly digest]
    └──requires──> [UAT-47-a confirms at least 1 real auto-fix entry in .llm-spend-ledger.json]
    └──requires──> [aggregateBySummaryKey helper (v4.0, exists)]
    └──extends──> [SUMMARY_KEYS contract (v3.1, frozen — must add new keys additively)]

[`auto-fix:partial-verified` semantics]
    └──requires──> [UAT-47-a provides empirical calibration data (first live auto-fix run)]
    └──extends──> [v40-verifier-gate.yml 3× affected-case gate]
    └──extends──> [auto-fix-promote.mjs triple-gate]

[Multi-model A/B]
    └──requires──> [At least 1 live auto-fix run (UAT-47-a) for baseline cost/quality data]
    └──requires──> [model_id field in llm-ledger.js (v4.0, already exists as part of ledger entry)]
    └──extends──> [auto-fix.mjs model selector (currently hardcoded to sonnet-4-6)]
    └──extends──> [build-ledger-dashboard.mjs A/B attribution view]

[Bookkeeping cleanup]
    └──independent of all other v4.1 features]
    └──conflicts with──> [retroactive commit anti-feature — must be new forward commits]

[CLEANUP-04 ruleset patch]
    └──requires──> [Push completed (required_status_checks need real job run IDs to validate canonical names)]
    └──resolves──> [bypass_actors=1 tech debt from v4.0 STATE.md]
```

### Dependency Notes

- **UAT-47-a requires push:** All four deferred UAT items (a/b/d/e) require the workflows to exist on `origin/main`. This is the hard sequencing constraint for all of v4.1's forward features. Push is not just "nice to have first" — it is the prerequisite.
- **Partial-verified semantics requires empirical data:** The threshold question (3/5 vs 4/5 vs configurable) was explicitly flagged as "default all-or-nothing for v4.0" and "revisit post-UAT-47-a." Do not define the threshold in code before the first live run provides calibration data. Locking in a number before evidence = guess.
- **Multi-model A/B requires at least one live run:** The A/B rig instruments something that has never produced real output yet. You cannot run A/B analysis on zero data points. The model selector logic can be written before live runs, but winner declaration requires N=10 per class minimum.
- **Dashboard new keys must be additive:** `SUMMARY_KEYS` is a frozen contract with 7 keys. New auto-fix keys (`auto_fix_success_rate`, `cost_per_fix_usd`, `time_to_merge_hours`) must be appended, not inserted, and the v3.1 digest consumers must degrade gracefully when the new keys are absent.
- **CLEANUP-04 must follow push quickly:** The `bypass_actors=1 bypass_mode=always` that enables `gh pr merge --admin` is also what was used to set up the ruleset in Phase 39. After the integration push, this bypass is the only remaining v4.0 security hole. Every day it remains open is a day an admin push can bypass CODEOWNERS review.

---

## Per-Feature Analysis

### Feature 1: Live Readiness UATs

**What mature systems do:** UAT against a live pipeline is structured as a runbook with observable artifacts, not an interactive session. The canonical pattern (seen in both self-healing DevOps research and GitHub's own Copilot agent docs) is: define the trigger condition → describe the expected artifact → execute trigger → assert artifact. The artifact must be independently verifiable (e.g., a GitHub comment, a committed JSON diff, a PR state change) rather than relying on log output alone.

**Table-stakes behaviors:**
- UAT-47-a: Trigger = add `triage` label to issue #3 (fingerprint `139f821b3bb1`). Expected artifacts = new branch `auto-fix/3-139f821b` on `origin`, draft PR opened, verifier-gate workflow queued. No manual `workflow_dispatch`. The label trigger IS the UAT input sanitization fence.
- UAT-47-b: Trigger = inspect first dep-update PR after Monday 09:00 UTC. Expected artifact = `deps-update-gate` job appeared in PR checks, regression suite ran.
- UAT-47-d: Trigger = wait for 02:00 UTC daily snapshot. Expected artifact = `[skip ci]` commit with `llm-spend-ledger.json` diff in `main` commit history.
- UAT-47-e: Diff-guard bypass test: Push a branch that modifies `tests/test-cases.js` (a LOCKED path) and open a PR. Expected artifact = verifier-gate fails with FORBIDDEN_PATHS sentinel. Assert label `diff-guard-blocked` applied. Then close the PR and delete the branch (no merge). This is the isolation contract: the branch is never merged, so no golden contamination.

**Critical safety constraint for UAT-47-e:** The crafted bypass branch must be opened as a PR and immediately closed (not merged) after the gate fires. The branch should have a naming prefix `test-only/diff-guard-*` to visually distinguish it from real `auto-fix/*` branches. NEVER give it the `triage` label. If it gets the `triage` label by accident, `v40-auto-fix.yml` would trigger and waste API budget on a deliberately-broken commit.

**Complexity: M (UAT-47-a) + S each (b/d/e)**

### Feature 2: Auto-Fix Dashboard

**What mature systems surface:** Renovate's Dependency Dashboard tracks: pending updates, auto-merge decisions, CI failure rate per PR, `minimumReleaseAge` status. The GitHub blog study ("Agent PRs are everywhere") found 45.1% of agent PRs require human revision — the primary metric operators want is *not* "how many PRs opened" but "what percentage closed without human correction."

**Recommended metrics for the weekly digest extension (beyond existing 7 SUMMARY_KEYS):**

| Metric Key | Type | Source | Rationale |
|-----------|------|--------|-----------|
| `auto_fix_attempted` | count (weekly) | `.llm-spend-ledger.json` entries with `phase=auto-fix` | Volume signal |
| `auto_fix_verified_merged` | count (weekly) | PRs with `auto-fix:verified` label merged | Success count |
| `auto_fix_success_rate` | percentage | `verified_merged / attempted` | Table-stakes KPI; 45% is the industry baseline for agent PRs |
| `cost_per_fix_usd` | float | `combinedMonthlyTotal / auto_fix_verified_merged` | Budget health |
| `time_to_merge_hours` | float (avg) | PR open timestamp → merge timestamp | Pipeline efficiency |
| `fix_attempts_p50` | integer | Median `fix_attempts` across all auto-fix PRs | Prompt quality signal; rising p50 = deteriorating prompt scaffolds |
| `flake_escalation_count` | count (weekly) | FLAKE_ESCALATION entries in quarantine corpus | Signal for underlying infrastructure problems vs real bugs |

**Presentation recommendation:** Markdown table inside the existing weekly digest, NOT a sparkline (sparklines require image hosting or base64 inline in GitHub markdown; GitHub Discussion markdown doesn't render them reliably). Use a `<details>` collapsible block so the digest stays within the 50-line visual contract while the dashboard data is accessible:

```markdown
<details>
<summary>Auto-Fix Pipeline (week of 2026-06-02)</summary>

| Metric | Value |
|--------|-------|
| Attempted | 3 |
| Verified+Merged | 2 (67%) |
| Cost/Fix | $0.38 |
| Avg Time-to-Merge | 14.2h |
| Fix Attempts p50 | 1 |
| FLAKE Escalations | 0 |

</details>
```

**Differentiator vs Renovate:** Renovate only tracks dep-update PRs. This dashboard unifies auto-fix + dep-update + FLAKE escalation in one operator view.

**Complexity: M** — requires reading both the spend ledger and the GitHub PRs API (already available via `GITHUB_TOKEN`); extending `aggregateBySummaryKey`; adding 7 new keys to the contract file.

**Pipeline modules touched:** `scripts/e2e-weekly-digest.mjs` (new dashboard section), `tests/e2e/lib/llm-ledger.js` (new aggregate helper), `tests/e2e/scripts/e2e-weekly-digest.test.js` (contract test for new keys), `SUMMARY_KEYS` array (additive only).

### Feature 3: `auto-fix:partial-verified` Semantics

**What mature systems do:** No direct precedent in Renovate, Aider, or OpenHands — they all use binary pass/fail. The closest analogy is the canary deployment pattern: start with 1-5% traffic, gate at defined error-rate thresholds, promote or roll back. Applied to test corpora: if N of M affected cases pass the verifier, the patch fixed N cases and left M-N unresolved.

**Trust-erosion failure modes (named explicitly per quality gate):**

1. **Threshold anchor drag:** If the initial threshold is set to 3/5 (60%) and one quarter's worth of fixes average 3/5, operators normalize to 60% as "good enough." The next quarter someone proposes lowering to 2/5 "because the cases are harder." The ratchet only moves downward. Mitigation: the threshold must be EXPLICITLY configurable in `verifier-gate` config, with the default hard-coded to 4/5 and a required human-override label (`partial-verified:human-approved`) to merge anything below 4/5.

2. **FLAKE masquerade:** A 3/5 pass may not mean "3 cases fixed, 2 not." It may mean "5 intermittent cases, 3 happened to pass this run." The FLAKE 5-state machine from v4.0 is the mitigation: each affected case must have `stable_runs >= 2` in the quarantine corpus before it counts toward the M in N/M. A case with `stable_runs = 0` does not count as a genuine "pass" regardless of the verifier result.

3. **Partial-verified becoming a bypass:** If an operator merges a 4/5 partial fix and the fifth case remains in quarantine, then two weeks later a second operator sees `quarantine:ready-for-promotion` on the fifth case and promotes it, the net result is that a case was promoted without the new (fixed) code being re-verified against it. The promotion must re-run the verifier against the HEAD of `main` (which now includes the partial fix), not against the HEAD at the time of partial-fix merge.

4. **Human override label inflation:** If `partial-verified:human-approved` is applied liberally because "it's just one case," the CODEOWNERS protection becomes theater. Mitigation: the override label requires a CODEOWNER (i.e., @tonyrowles), not just any reviewer. Enforce via the CODEOWNERS file on the label-protected verifier workflow.

**Recommended threshold calibration schedule:**
- v4.1 default: all-or-nothing (5/5) until UAT-47-a provides empirical calibration data.
- After 10 live auto-fix runs: introduce 4/5 as partial-verified threshold with the FLAKE masquerade mitigation above.
- After 25 live runs: revisit whether 3/5 is appropriate for specific ERROR_CLASSes only (e.g., HARNESS_ERROR, where the fix surface is narrow and false positives are less consequential than for `src/shared/matching.js`).

**Complexity: M** — extends `v40-verifier-gate.yml` to output `cases_passed / cases_total`; extends `auto-fix-promote.mjs` to accept partial promotion with a `--partial` flag; extends quarantine schema with `partial_fix_pr` reference field.

### Feature 4: Multi-Model A/B (Sonnet vs Opus)

**What the evidence shows:** Independent LLM benchmarks (15-model comparison across 38 real coding tasks, 2026-04) found Sonnet 4.6 and Opus 4.7 perform identically on small code patches while Sonnet costs 3x less. A common production routing pattern is "Sonnet for generation, Opus for escalation on failures." The SWE-bench literature confirms the same: OpenHands uses Sonnet 4.5 as default and shows ~77% solve rate; switching to Opus does not significantly improve solve rate on single-file patches.

**Recommended v4.1 A/B rig design:**

- **Default model:** `claude-sonnet-4-6` (current v4.0 default). Do not change.
- **Escalation trigger:** After 2 failed `fix_attempts` on the same issue (loop iteration cap is 3), escalate to `claude-opus-4-7` for the third attempt. This is ERROR_CLASS-aware escalation, not random routing.
- **NOT hash-based routing:** Hash-based deterministic routing (routing based on `issue_number % 2`) is appropriate for A/B testing where you want equal traffic splits. For a legal-filing tool with a small daily volume (1-5 issues/night), hash-based routing would mean some issue numbers always get Sonnet and others always get Opus — the sample is too small to be meaningful and the operator cannot decide "try Opus on this hard one." The right approach is attempt-count escalation, which is deterministic but responsive.
- **Model attribution in ledger:** `llm-ledger.js` already has a model field. Add `model_id: "claude-sonnet-4-6"` or `"claude-opus-4-7"` to every `appendLedgerEntry` call in `auto-fix.mjs`.
- **Winner declaration:** After 10 verified-merged auto-fix PRs per model, compare `auto_fix_success_rate` (verified+merged / attempted) and `cost_per_fix_usd`. Declare winner in the weekly digest as a one-line note. Do not auto-update the default model in code — operator manually updates `DEFAULT_MODEL` const in `auto-fix.mjs` after reviewing the A/B report.
- **No model ID in PR body or issue comments:** The privacy audit from Phase 46 applies here. Model IDs appear in the ledger only, not in user-visible artifacts.

**External reference:** Ian L. Paterson, "I Tested 15 LLMs on 38 Real Coding Tasks" (2026) — deterministic pass/fail scoring on actual code tasks, not LLM-as-judge. Core finding: "the routing decision is worth more than picking the 'best' model." Applied to v4.1: the attempt-count escalation IS the routing decision.

**Complexity: M** — changes `auto-fix.mjs` model selector (add `fix_attempts` threshold check), adds `model_id` emission to `appendLedgerEntry` calls, adds A/B view to `build-ledger-dashboard.mjs`, adds contract test asserting model field is present in ledger entries.

### Feature 5: Bookkeeping Cleanup

**What this is:** Re-stamping `status` fields in 5 planning files (32-UAT-EVIDENCE.md, 35/36/37-HUMAN-UAT.md, 38-UAT-EVIDENCE.md) to `passed` from `partial`/`unknown`, and removing 3 orphan quick-task slug references from STATE.md. The substantive validation was done in Phase 38-03 (8/8 human_verification items confirmed); only the metadata is stale.

**Pattern:** New forward commits only. Never amend historical commits. Commit message format: `chore(bookkeeping): re-stamp [filename] status=passed (confirmed Phase 38-03 live UAT)`. This is not an anti-feature when done correctly (forward-only new commits); it becomes an anti-feature if done via `git commit --amend` on historical commits (which breaks `git log` linearity).

**Complexity: S** — pure text edits to `.planning/phases/` files.

### Feature 6: Push Readiness Gate

**What mature teams do:** Large feature branches that have been developed locally and need to land on a branch-protected main are merged via a single PR, not a series of cherry-picks. The merge commit strategy (not squash) is the right choice when audit trail matters — all 777 commits remain addressable via `git bisect`, per-phase attribution is preserved, and the merge commit itself is the permanent record of "v4.0 landed on main at commit X."

**Three pre-push blockers (must fix before opening PR):**
1. Test 48 ledger regression (`llm-ledger.test.js:1012`) — asserts committed ledger has exactly 1 bootstrap entry, but real SDK calls are in it. Either update the assertion to allow real entries OR investigate which executor leaked SDK calls.
2. Calendar-rollover flake (`e2e-weekly-digest.test.js:395`) — `2026-05` hardcoded in assertion, clock is now June 2026.
3. `@anthropic-ai/sdk` EXACT pin verification — confirm `npm install` does not reintroduce caret.

**Integration PR strategy:**
- Branch name: `v4.0-integration`
- PR title: "feat: v4.0 Self-Healing Test Suite — 9 phases (39-47)"
- Merge strategy: `gh pr merge --merge` (not `--squash`)
- Self-merge: `gh pr merge --admin` (uses `bypass_actors=1` escape hatch; this is the last authorized use)
- CI gate: all existing CI checks must be green (the pre-push fixes above are the blocker)

**Post-push required actions (in order, within same v4.1 session):**
1. Confirm GitHub Actions green on the merged commit.
2. Run UAT-47-a through UAT-47-e using the runbook stubs.
3. Patch ruleset 17086676: add `verifier-gate` + `deps-update-gate` to `required_status_checks`, set `bypass_actors` to empty array.
4. The `bypass_actors=1 bypass_mode=always` must be removed BEFORE any new auto-fix PR can open — otherwise the next auto-fix PR could theoretically self-merge without CODEOWNERS review.

**Complexity: S (the push itself) + M (pre-push test fixes)**

---

## MVP Definition

### v4.1 Launch With (minimum to call v4.1 "shipped")

- [ ] Pre-push test fixes (Test 48 ledger, calendar-rollover flake, EXACT pin) — must be green CI before PR
- [ ] Push v4.0 to origin via `v4.0-integration` PR + `gh pr merge --merge --admin`
- [ ] Confirm CI green on remote
- [ ] UAT-47-a: live auto-fix end-to-end against issue #3
- [ ] UAT-47-b: dep-update pre-flight gate
- [ ] UAT-47-d: daily ledger snapshot
- [ ] UAT-47-e: diff-guard bypass test
- [ ] CLEANUP-04: ruleset 17086676 patched (`verifier-gate` + `deps-update-gate` required status checks, `bypass_actors` removed)
- [ ] Bookkeeping cleanup (5 VERIFICATION.md / HUMAN-UAT.md re-stamps, 3 orphan slug removals)

### Add After Push + UATs Confirmed (v4.1 forward features)

- [ ] Auto-fix dashboard in weekly digest — trigger: UAT-47-a confirms at least one live ledger entry
- [ ] `auto-fix:partial-verified` semantics — trigger: UAT-47-a provides empirical calibration data; implement 4/5 threshold with FLAKE masquerade mitigation
- [ ] Multi-model A/B rig — trigger: first 10 live auto-fix runs produce ledger data; add attempt-count escalation (sonnet → opus at fix_attempts=3)

### Future Consideration (v4.2+)

- [ ] Sparkline-style trend charts in weekly digest — defer until GitHub natively supports chart rendering in markdown
- [ ] Automated winner declaration for A/B — requires 25+ runs per model per ERROR_CLASS; likely v4.3+
- [ ] Per-ERROR_CLASS partial-verified thresholds (e.g., 3/5 for HARNESS_ERROR, 5/5 for WRONG_CITATION) — defer until 25+ auto-fix runs per class provide empirical basis

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Pre-push test fixes | HIGH (blocks everything) | S | P0 |
| Push v4.0-integration PR | HIGH (blocks UATs + forward features) | S | P0 |
| CI green confirmation + UAT-47-a/b/d/e | HIGH (validates the self-healing claim) | M (UAT-47-a), S (b/d/e) | P1 |
| CLEANUP-04 ruleset patch | HIGH (closes trust invariant hole) | S | P1 |
| Bookkeeping cleanup | MEDIUM (audit hygiene, no functional impact) | S | P1 |
| Auto-fix dashboard in weekly digest | HIGH (operator observability) | M | P2 |
| `auto-fix:partial-verified` semantics | MEDIUM (nuanced gate behavior, requires live data) | M | P2 |
| Multi-model A/B rig | MEDIUM (cost optimization, requires live data) | M | P2 |

**Priority key:**
- P0: Must complete before v4.1 can start (blockers)
- P1: Must have for v4.1 milestone close
- P2: Ship after P0/P1 validated; within v4.1 milestone scope if time permits

---

## Trust Invariant Impact Analysis

The v4.0 trust invariant has four load-bearing legs. Each v4.1 feature is assessed against all four.

| v4.1 Feature | Draft-PR-default | Human-merge required | Auto-promote SEPARATE PR | CODEOWNERS on locked paths |
|-------------|-----------------|---------------------|--------------------------|---------------------------|
| Live UATs (a/b/d/e) | Preserved (UAT-47-a opens draft PRs only) | Preserved (UAT exercises the draft state) | Preserved (promotes via follow-up PR per v4.0 design) | Preserved (CODEOWNERS not bypassed) |
| Push v4.0-integration | N/A (single admin merge) | N/A (admin merge is the last use of bypass_actors) | N/A | At risk if push happens before CLEANUP-04 |
| CLEANUP-04 ruleset patch | HARDENED (closes bypass_actors) | HARDENED | N/A | HARDENED |
| Dashboard in digest | Preserved | Preserved | N/A | N/A |
| Partial-verified (4/5 default) | Preserved | Preserved — still requires human merge | Preserved — partial fix opens partial-promotion follow-up PR | Preserved |
| Partial-verified (below 3/5) | ERODED | ERODED (pressure to merge partial) | ERODED | ERODED |
| Multi-model A/B | Preserved | Preserved | Preserved | Preserved |
| Bookkeeping cleanup | Preserved | Preserved | N/A | N/A |

**Critical ordering constraint:** Push must happen, then CLEANUP-04 must happen, before any new auto-fix PR opens on `origin/main`. If a new issue gets the `triage` label before `bypass_actors` is removed, the auto-fix PR that opens could theoretically be self-merged via the still-open bypass. This is not a theoretical risk — the bypass is currently `bypass_mode=always`.

---

## Competitor Feature Baseline

| Feature | Renovate | Aider | OpenHands | Copilot Coding Agent | v4.1 Approach |
|---------|----------|-------|-----------|---------------------|---------------|
| Dashboard / digest | Dependency Dashboard issue (separate) | None | None | None | Unified Monday digest (extends v3.1 SUMMARY_KEYS) |
| Partial pass gate | N/A (all-or-nothing) | N/A | N/A | N/A | 4/5 threshold with FLAKE masquerade mitigation |
| Multi-model routing | N/A | LiteLLM (model config) | LiteLLM (provider-portable) | Cloud-managed | Attempt-count escalation (sonnet → opus at fix_attempts=3) |
| A/B winner declaration | N/A | N/A | N/A | N/A | Manual, after N=10 per model per class |
| Audit trail on push | N/A | N/A | N/A | N/A | Merge commit (777 commits preserved) |
| Live readiness UAT | N/A (automated) | N/A | N/A | N/A | Explicit runbook stubs (UAT-47-a through e) |
| Bookkeeping cleanup | N/A | N/A | N/A | N/A | Forward-only new commits (never amend) |

---

## Sources

- `.planning/PROJECT.md` (v4.1 milestone definition, Key Decisions table, v4.0 tech debt deferred items) — direct read, HIGH confidence
- `.planning/STATE.md` (8 deferred items table from v4.0 close) — direct read, HIGH confidence
- `.planning/v4.0-SESSION-HANDOFF-2026-06-01.md` (pre-push blockers, UAT runbook stubs) — direct read, HIGH confidence
- `.planning/research-v4.0-archive/FEATURES.md` (v4.0 anti-features catalogue, trust invariant analysis, competitor table) — direct read, HIGH confidence
- `.planning/research-v4.0-archive/SUMMARY.md` (v4.0 architecture decisions, pitfall defenses) — direct read, HIGH confidence
- [Renovate Dependency Dashboard](https://docs.renovatebot.com/key-concepts/dashboard/) — what mature dep-update pipelines surface as operator visibility — HIGH
- [Renovate Merge Confidence](https://docs.renovatebot.com/merge-confidence/) — auto-merge success rate / CI failure rate tracking pattern — HIGH
- [Ian L. Paterson: I Tested 15 LLMs on 38 Real Coding Tasks (2026)](https://ianlpaterson.com/blog/llm-benchmark-2026-38-actual-tasks-15-models-for-2-29/) — Sonnet 4.6 == Opus 4.7 on small code patches at 3x cost difference; routing beats model selection — HIGH (independent deterministic scoring)
- [GitHub blog: Agent PRs are everywhere — how to review them](https://github.blog/ai-and-ml/generative-ai/agent-pull-requests-are-everywhere-heres-how-to-review-them/) — 45.1% of agent PRs require human revision; key KPI for dashboard — MEDIUM
- [GitHub Docs: Managing a branch protection rule](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/managing-a-branch-protection-rule) — bypass_actors, required_status_checks, admin merge behavior — HIGH
- [GitHub Docs: Creating rulesets for a repository](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/creating-rulesets-for-a-repository) — ruleset patch approach for CLEANUP-04 — HIGH
- [Graphite: What's the best GitHub PR merge strategy](https://graphite.com/blog/pull-request-merge-strategy) — merge commit vs squash for audit trail on large feature branches — MEDIUM
- [WarpFix: Autonomous CI Repair Agent](https://warpfix.org/) — CI pass rate 63%, 83% developer-confirmed accuracy on successful fixes; RepairAgent token cost pattern — MEDIUM
- [Autonomous Quality Gates: AI-Powered Code Review (Augment Code)](https://www.augmentcode.com/learn/autonomous-quality-gates-ai-powered-code-review) — threshold evolution pattern, "keep thresholds realistic and evolving" — MEDIUM
- [Self-Healing DevOps with Copilot and Actions (Colin's ALM Corner)](https://colinsalmcorner.com/self-healing-devops-with-copilot-and-actions/) — UAT-triggering-via-label pattern (not workflow_dispatch) — MEDIUM
- [AI Agent Failure Modes Beyond Hallucination (DEV Community)](https://dev.to/maximsaplin/ai-agent-failure-modes-beyond-hallucination-208g) — partial failure, feedback loops, invisible state mutations as named failure modes — MEDIUM

---
*Feature research for: Patent Citation Tool v4.1 — Readiness Gate + Push*
*Researched: 2026-06-02*

# Pitfalls Research

**Domain:** v4.1 Readiness Gate + Push — mature LLM-CI pipeline shipping push-to-protected-main, partial-pass gate semantics, multi-model A/B, and dashboard schema expansion
**Researched:** 2026-06-02
**Confidence:** HIGH for Pitfalls 1-5 and 7-8 (grounded in direct code inspection + v4.0 source); MEDIUM for Pitfall 6 (A/B methodology grounded in external research, not prior-milestone experience); HIGH for Pitfall 9 (Test 48 leak root cause verified from live ledger).

> Scope note: This file covers ONLY v4.1-new failure modes. The 8 v4.0 pitfalls (prompt injection, cost runaway, verifier-gate gaming, auto-merge prevention, FLAKE 5-state machine, dep-update masking, concurrency races, v3.1 surprise interactions) are closed and locked — do NOT re-warn about them. The v4.1 pitfall list is anchored to the 8 feature areas named in the milestone spec.

---

## Critical Pitfalls

### Pitfall 1: Push strategy — `gh pr merge --admin` erodes branch protection and leaves no PR review record

**What goes wrong:**
The v4.0 integration PR (`v4.0-integration`, ~777 commits) must land on `origin/main` which has ruleset 17086676 active with `Do not allow bypassing: ON` and `Require code owner review: true`. The v4.0-era repo config doc (`docs/v40-repo-config.md §3`) explicitly says `gh pr merge --admin` is NOT acceptable because it requires admin bypass which is forbidden by the ruleset.

If a phase plan attempts `gh pr merge --admin` as the push mechanism anyway — either because the operator reads the handoff note ("requires admin merge") without checking the config doc, or because a GitHub CLI upgrade changes `--admin` behavior — it will either:

1. **Silently succeed if bypass was re-enabled at some point**, leaving the ruleset with `bypass_actors` that were supposed to be empty (bypass drift), or
2. **Fail with exit 1** and leave 777 commits stuck local while the operator tries alternatives under time pressure.

Either outcome is bad: (1) erodes the trust invariant permanently; (2) causes a rushed workaround that skips the required status check slot reservation.

**Why it happens:**
The handoff document (`v4.0-SESSION-HANDOFF-2026-06-01.md:31`) correctly says push "requires a feature branch + PR with self-merge via `gh pr merge --admin` OR temporary ruleset relaxation." The "OR temporary relaxation" path is the correct approach (relax bypass for one PR, land it, re-tighten), but the handoff presents `--admin` first. Under deadline pressure the first option gets tried.

**How to avoid:**
Use the ruleset-relaxation-then-retighten pattern, not `--admin`:
1. `gh api -X PATCH /repos/tonyrowles/patent-cite-tool/rulesets/17086676 --input <json-with-bypass-actors=[{actor_id:1,actor_type:"RepositoryRole",bypass_mode:"pull_request"}]>` to temporarily add owner bypass for the integration PR only.
2. Open `v4.0-integration` PR, self-approve, confirm CI green, merge.
3. `gh api -X PATCH /repos/tonyrowles/patent-cite-tool/rulesets/17086676 --input <json-with-bypass-actors=[]>` to re-empty the bypass list within the same session.

This path produces a full PR review record (GitHub audit log captures the merge actor, status checks, and review approval). The `--admin` path would produce a `protected_branch.policy_override` audit event which is the bad signal v4.0 Pitfall 4 warns about.

The CLEANUP-04 phase plan must write the exact two `gh api PATCH` commands to a runbook — not prose, literal commands — so the operator doesn't improvise under pressure.

**Warning signs:**
- `gh api GET /repos/tonyrowles/patent-cite-tool/rulesets/17086676 --jq '.bypass_actors'` returns non-empty more than 30 minutes after the v4.0-integration merge.
- GitHub audit log shows `protected_branch.policy_override` event for any commit actor other than the integration PR merge.
- CI fails on the first push to origin after v4.0-integration lands (likely means ruleset was re-tightened BEFORE verifier-gate status check was wired — see Pitfall 2).

**Phase to address:**
Pre-push phase (before any v4.1 phase runs). The push runbook is the single most load-bearing pre-condition. CLEANUP-04 must own both the push runbook and the ruleset retighten-with-status-checks patch.

---

### Pitfall 2: CLEANUP-04 ordering race — ruleset patch before or after the v4.0-integration merge determines whether the first post-merge PR gets blocked

**What goes wrong:**
CLEANUP-04 must add `verifier-gate` and `deps-update-gate` to the ruleset's `required_status_checks`. There are two orderings:

**Order A (wrong):** Patch ruleset with `required_status_checks` first, THEN push v4.0-integration.
Result: The v4.0-integration PR itself now needs `verifier-gate` to pass before merging. But `verifier-gate` only runs on `auto-fix/*` branches. The integration PR isn't an auto-fix branch. The required check either never fires (PR is blocked forever) or the check is provided by a different job with a matching name.

**Order B (correct):** Push and merge v4.0-integration first, THEN patch ruleset to add the required checks.
Result: Integration PR merges without the new gates (fine — it's a bulk-ship, not a fix PR). All subsequent auto-fix PRs now enforce `verifier-gate`. The gates come online AFTER the push, which is their intended scope.

The `integration_id` problem compounds this: GitHub's ruleset API requires `required_status_checks[].integration_id` for status checks produced by GitHub Actions (integration ID 15368). If the PATCH omits `integration_id` or uses the wrong value, the check registers but can never be satisfied by any Actions job — every PR is permanently blocked. This is the "canonical context-name unresolvable pre-push" problem from v4.0 Pitfall 4 / STATE.md tech_debt entry.

**Why it happens:**
The `integration_id` for the GitHub Actions app is not in `gh api` help text. It's discoverable by `gh api /repos/tonyrowles/patent-cite-tool/commits/HEAD/check-suites --jq '.[0].app.id'` after at least one CI run exists on the remote. Without a CI run, the ID is unknown. Pre-push there is no CI run; post-push the ID is discoverable. This forces Order B.

**How to avoid:**
1. After the v4.0-integration merge, wait for at least one CI run to complete on `origin/main`.
2. Capture integration ID: `INTEGRATION_ID=$(gh api /repos/tonyrowles/patent-cite-tool/commits/main/check-suites --jq '[.check_suites[] | select(.app.name=="GitHub Actions")] | .[0].app.id')`
3. PATCH the ruleset with both `verifier-gate` and `deps-update-gate` using the captured `integration_id`.
4. Verify the patch with `gh api GET /repos/tonyrowles/patent-cite-tool/rulesets/17086676 --jq '.rules[] | select(.type=="required_status_checks") | .parameters.required_status_checks'` — confirm both strings appear.
5. Add a Vitest static-grep test asserting the two job names (`verifier-gate` and `deps-update-gate`) appear verbatim in `.github/workflows/v40-verifier-gate.yml` and `.github/workflows/v40-deps-update.yml` respectively — if the job names drift in YAML, the static-grep test catches it at `npm test` before the next ruleset divergence.

The job names in the YAML and in the ruleset must match case-sensitively. The YAML has `verifier-gate:` (line 181 of `v40-verifier-gate.yml`) and `deps-update-gate:` — verify these strings byte-for-byte match the ruleset's `context` field.

**Warning signs:**
- Any PR after the CLEANUP-04 patch shows "Expected — Waiting for status to be reported" on `verifier-gate` check when the PR is NOT an `auto-fix/*` PR (means the check is required on all PRs, not scoped to auto-fix).
- `npm run e2e:verify` exits 0 locally but `gh pr view <auto-fix-pr> --json statusCheckRollup` shows the `verifier-gate` check as pending indefinitely.
- The `deps-update-gate` job shows as required on a regular push-to-main commit (not a dep-update PR) — means the required_status_checks rule wasn't scoped to the right branch pattern.

**Phase to address:**
CLEANUP-04. The ordering constraint (push first, patch second) must be explicit in the CLEANUP-04 plan — not a note, a numbered step sequence.

---

### Pitfall 3: `bypass_actors=1` removal — locks out ALL emergency overrides, no recovery path until a second admin is added

**What goes wrong:**
STATE.md tech_debt entry documents: `bypass_actors=1` on ruleset 17086676, `bypass_mode=always`. CLEANUP-04 plans to remove this. "Remove" means setting `bypass_actors: []` — an empty array. This is the correct long-term posture per v4.0 Pitfall 4.

The failure mode: with `bypass_actors: []` AND `Do not allow bypassing: ON`, NO actor — including the repo owner — can merge a PR that fails required status checks. If the `verifier-gate` or CI workflow has a bug (e.g., a Vitest dependency is broken, runner is down), EVERY PR including emergency hotfixes is blocked until:
- The verifier-gate bug is fixed via a PR (which is blocked), or
- A second repo admin is added (requires org-level action), or
- The ruleset itself is patched (requires owner API access, which IS still available via `gh api` since rulesets can be patched via API even when the UI merge button is blocked).

The recovery path via `gh api PATCH` IS available — ruleset administration is not blocked by the ruleset's own rules. But this recovery path must be documented before it's needed, not discovered under incident pressure.

**Why it happens:**
Removing `bypass_actors=1` is the right security decision. The failure mode is not the removal itself but the absence of a documented break-glass procedure.

**How to avoid:**
1. Do NOT add a second bypass actor "just in case" — that defeats the security posture.
2. DO document the break-glass procedure in a committed file (e.g., `.planning/EMERGENCY-OVERRIDE.md` or a section of `docs/v40-repo-config.md`):
   ```bash
   # Emergency: re-enable temporary bypass for one merge
   gh api -X PATCH /repos/tonyrowles/patent-cite-tool/rulesets/17086676 \
     --field 'bypass_actors=[{"actor_id":1,"actor_type":"RepositoryRole","bypass_mode":"pull_request"}]'
   # ... merge the PR ...
   # Immediately after:
   gh api -X PATCH /repos/tonyrowles/patent-cite-tool/rulesets/17086676 \
     --field 'bypass_actors=[]'
   ```
3. Add a CLEANUP-04 acceptance criterion: verify `gh api` PATCH to the ruleset succeeds with the owner's current auth — confirm the break-glass path is functional before removing `bypass_actors=1`.

**Warning signs:**
- Post-CLEANUP-04, `gh api GET /repos/tonyrowles/patent-cite-tool/rulesets/17086676 --jq '.bypass_actors'` returns `[]` — this is the target state, but verify the break-glass test was run first.
- CI runner outage + pending required status check on a hotfix PR = test the break-glass path now.

**Phase to address:**
CLEANUP-04. Must be a separate step from the `required_status_checks` patch to avoid confusing the two concerns.

---

### Pitfall 4 (LOAD-BEARING): `auto-fix:partial-verified` semantics — allowing partial-pass to set the `auto-fix:verified` label erodes the `_skipCiGuard` triple-gate trust invariant

**What goes wrong:**
This is the single most load-bearing trust concern in v4.1. The current gate state machine has one terminal success state: `auto-fix:verified` label, applied by `v40-verifier-gate.yml`'s `ready-flip` job only when `verifier-gate` AND `regression-suite` both pass (3/3 Tier A/B affected cases + 76-case regression clean). `assertTripleGate()` in `scripts/auto-fix-promote.mjs` checks for exactly this label on Leg 1.

If `auto-fix:partial-verified` is introduced as a new label AND either:
- The `ready-flip` job is modified to apply `auto-fix:verified` when partial conditions are met (e.g., 3/5 affected cases pass), or
- `assertTripleGate()` is modified to also accept `auto-fix:partial-verified` as a satisfying label on Leg 1

...then the triple-gate reconstructs a human-gate invariant that now permits auto-promote of cases that failed at least some of their verifier runs. A case that passes 3/5 runs might be a genuine fix OR might be a flaky verifier OR might be a partial fix that masks the underlying issue.

The cited v4.0 decision (PROJECT.md Key Decisions, line 224): "`_skipCiGuard:true` exemption gated by triple-assertion (verified-label + merged + triage-sourced) — single load-bearing trust decision in v4.0. `assertTripleGate()` throws on any leg failure BEFORE `runPromote()` reached."

The word "verified" in `auto-fix:verified` currently means "full-pass on all gates." Widening the label's applicability retroactively redefines what "verified" means for all past and future auto-promotes without a semantic versioning signal.

**Why it happens:**
After UAT-47-a runs a live auto-fix on issue #3, the team will have empirical data on what "partial" means (3/5 cases). The temptation is to immediately act on this data by relaxing the gate. The mistake is relaxing the existing gate instead of adding a new parallel state.

**How to avoid (specific code change mandate):**

DO NOT modify `assertTripleGate` to accept `auto-fix:partial-verified` as a Leg 1 satisfier. Instead:

1. Implement `auto-fix:partial-verified` as a SEPARATE terminal state with its own label, its own workflow branch, and its own semantics. The partial-verified state does NOT trigger `v40-auto-promote.yml`. It triggers a human-review workflow that posts a comment: "Partial verifier pass (N/5 cases). Merging this PR will NOT auto-promote. Human must run `promote-from-quarantine.mjs --partial` after reviewing."

2. Keep `auto-fix:verified` semantically frozen: it means "all gates passed, auto-promote is safe."

3. Add a new `assertPartialGate` function in `auto-fix-promote.mjs` for the partial-verified path — it explicitly does NOT call `runPromote({_skipCiGuard:true})`. The partial-verified promotion is human-triggered only.

4. The Vitest test bank for `assertTripleGate` must include a test asserting that an input with `auto-fix:partial-verified` label AND `auto-fix:verified` absent THROWS with `TRIPLE_GATE_FAILED: prLabels`. This test must be added in the same commit that introduces the `auto-fix:partial-verified` concept.

Concrete anti-pattern (DO NOT write this):
```js
// WRONG — erodes the invariant
if (!prLabels.includes('auto-fix:verified') && !prLabels.includes('auto-fix:partial-verified')) {
  throw new Error("TRIPLE_GATE_FAILED: ...");
}
```

Correct pattern:
```js
// RIGHT — separate gate state machine entry points
export function assertTripleGate(...) { /* unchanged; only accepts 'auto-fix:verified' */ }
export function assertPartialGate(...) { /* new; accepts 'auto-fix:partial-verified'; does NOT proceed to runPromote */ }
```

5. Threshold discipline: the "3/5 cases" threshold is empirically derived from UAT-47-a. Document the derivation. Do NOT allow the threshold to drift to 2/5 in a future commit without a full trust-invariant review. A static-grep Vitest test pinning the `3` in the partial-gate condition catches threshold drift.

**Warning signs:**
- Any commit that adds `partial-verified` to the condition check inside `assertTripleGate` (grep: `partial-verified.*assertTripleGate\|assertTripleGate.*partial-verified`).
- `auto-fix:partial-verified` label appearing on a PR that also has `auto-fix:verified` — the two labels are mutually exclusive; co-presence signals gate state machine confusion.
- `runPromote({_skipCiGuard:true})` called in a code path reachable via `auto-fix:partial-verified` label — this is the catastrophic outcome. Vitest must cover this.

**Phase to address:**
The partial-verified semantics phase (whichever phase implements it). The Vitest test for triple-gate throwing on `partial-verified` must land in the SAME commit that creates the `auto-fix:partial-verified` label, not after.

---

### Pitfall 5: Test 48 ledger leak — the fix must close the real breach, not loosen the contract

**What goes wrong:**
Test 48 (`tests/unit/llm-ledger.test.js:999`) asserts the committed `tests/e2e/.llm-spend-ledger.json` has exactly 1 bootstrap entry with `phase='39-bootstrap'` and `cost_usd=0`. As of the handoff state, the ledger contains a `2026-06` month bucket with 4 real opus calls totaling $0.451461, all with `phase=null`, `transport=null` (meaning they bypassed `invokeAnthropicSdkWithLedger` and called `appendLedgerEntry` directly without the required fields, OR the `E2E_LEDGER_PATH_OVERRIDE` env-var escape hatch was not set during a test run that made real SDK calls).

Live ledger inspection confirms: the 4 leaked entries use `model='claude-opus-4-7[1m]'` — this is the 1M-context variant of opus, which is only accessible when the SDK call specifies `claude-opus-4-7` with the `200000`+ max_tokens parameter or the special model ID suffix. These are NOT default model calls. They came from a test or executor that explicitly requested opus 4.7 long-context.

Two failure modes to distinguish:
- **False failure (Pitfall):** The test is correct, the ledger was genuinely polluted by a local test run that made real API calls. Fix = reset the ledger to the bootstrap-only state and pin `E2E_LEDGER_PATH_OVERRIDE` enforcement in the test runner config.
- **Real gap (Anti-Pitfall):** The test was correct in v4.0 but is now wrong because the ledger legitimately evolves past bootstrap during development. Fix = change the test assertion to allow the committed ledger to have entries beyond bootstrap, provided all entries have required fields (`phase`, `transport`, `model`). This is the DANGEROUS fix because it erodes the ledger-schema contract.

The correct fix is the first one. Test 48 is a schema guard, not a state guard. The right resolution is:
1. Reset the ledger to bootstrap-only state (delete the 4 leaked entries).
2. Audit which execution path produced the `phase=null, transport=null` entries — this is the actual bug. If a code path calls `appendLedgerEntry` without `phase` and `transport`, the schema contract (Test 34-35 in the same file) is violated at the write site. Find that site and add the required fields.
3. Add an `E2E_LEDGER_PATH_OVERRIDE` enforcement assertion: any test that sets `forceApi=true` on `invokeAnthropicSdkWithLedger` MUST also set `E2E_LEDGER_PATH_OVERRIDE` to a temp dir. This is the enforcement side that was missing.

The leaked entries' `model='claude-opus-4-7[1m]'` with `cost=$0.19...$0.19` per call suggests these came from the GSD agent runner's own exploration (the agent itself uses opus for research). The `E2E_LEDGER_PATH_OVERRIDE` env var was not set when the GSD executor ran, so real calls landed in the committed ledger. This is a process failure, not a code failure.

**Why it happens:**
`LEDGER_PATH` is resolved at module-load time via an IIFE (lines 74-97 of `llm-ledger.js`). If a test imports `invokeAnthropicSdkWithLedger` (which imports `llm-ledger.js`) without first setting `E2E_LEDGER_PATH_OVERRIDE`, the IIFE runs with the env var unset and resolves to the real committed path. Any subsequent `forceApi=true` call then writes to the committed file. The defense-in-depth CI guard (`if (CI || GITHUB_ACTIONS) throw`) would catch this in CI, but it doesn't fire in a local GSD executor that isn't running `CI=true`.

**How to avoid:**
1. **Reset the ledger** to bootstrap-only before push: delete the 4 leaked `2026-06` entries, leaving only the `2026-05` bootstrap entry.
2. **Find the write site** for the `phase=null, transport=null` entries. Grep: `appendLedgerEntry(` calls where the argument object omits `phase` or `transport`. Add required-field guards.
3. **Enforce tmpdir isolation** for any test that touches `invokeAnthropicSdkWithLedger`. Add to `vitest.config.js` or a test setup file: `process.env.E2E_LEDGER_PATH_OVERRIDE = path.join(os.tmpdir(), 'test-ledger.json')` as a global beforeAll. The LEDGER_PATH IIFE runs at import time, so this requires the env var to be set BEFORE the import. Vitest's `globalSetup` (not `beforeEach`) is the right hook.
4. **Test 48 must NOT be relaxed** to permit multi-entry committed ledgers. Its schema-plus-state contract is a feature, not a bug: it proves the committed file is always a clean bootstrap for fresh-clone users.

**Warning signs:**
- `cat tests/e2e/.llm-spend-ledger.json | jq '.months | keys | length'` returning `> 1` at commit time (more than one month bucket means real calls leaked in during local dev).
- A `phase=null` or `transport=null` entry in any month bucket — this is a schema violation, not a normal state.
- Ledger entries with `model` containing `[1m]` suffix in the committed file — these are the long-context expensive variant; they should never appear in the committed bootstrap.

**Phase to address:**
Pre-push cleanup phase (before v4.1 Phase 1). Must be resolved before `npm test` can be run with full green.

---

### Pitfall 6: Calendar-rollover flake — hardcoded `2026-05` in e2e-weekly-digest test will fail every month

**What goes wrong:**
`tests/e2e/scripts/e2e-weekly-digest.test.js:64` defines `const PIN_NOW = () => new Date('2026-05-25T00:00:00Z')` and the assertions throughout the test file are calibrated to May 2026 (quarantine growth window `2026-05-18..2026-05-25`, digest issue numbers, week label `2026-W22`). The handoff confirms this test was already failing in the June 2026 session.

This is not a calendar-rollover bug in the digest SCRIPT — the script uses `new Date()` correctly at runtime. It is a hardcoded date in the TEST FIXTURE. The test passes a `now` function to `runDigest` — `runDigest({ now: PIN_NOW, ... })` — so the script itself is testable. The fixture issue dates and quarantine dates are all in May 2026. When June arrives, the quarantine-growth window `[now-7d, now]` centered on `2026-05-25` no longer captures the May-dated fixture issues in the expected pattern.

Two possible fixes:
- **Wrong fix:** Update the hardcoded date to `2026-06-25` and update all fixture dates. Same bug next month.
- **Correct fix:** Make `PIN_NOW` relative to a deterministic epoch, or rewrite the fixture to use relative offsets from `PIN_NOW` (e.g., `-3d`, `-10d`, `-14d` from the pinned now). Or: move the pinned date to a constant at the top of the file and derive all fixture dates from it, so updating one constant fixes the whole test.

The concrete fix: replace the hardcoded `'2026-05-25T00:00:00Z'` with a constant that is computed relative to the test file's own pinned epoch:

```js
const PIN_NOW_ISO = '2026-05-25T00:00:00Z'; // test epoch — change this to re-calibrate
const PIN_NOW = () => new Date(PIN_NOW_ISO);
const PIN_MINUS_7 = new Date(new Date(PIN_NOW_ISO) - 7 * 24 * 60 * 60 * 1000).toISOString();
// etc.
```

And all fixture `created_at` dates derive from these relative offsets. Changing `PIN_NOW_ISO` to any Monday re-calibrates the whole test. A comment documents the fixture re-calibration procedure.

Note: do NOT use `new Date()` (live clock) as the test pin — that makes the test non-deterministic. The pin must be static for reproducibility.

**Why it happens:**
Test fixtures with absolute dates age out. The v3.1 Phase 37 team wrote the test to match the live quarantine state at the time. No one budgeted for future-proofing the absolute dates.

**How to avoid:**
1. Fix the test as described above BEFORE push (it is currently a failing test — pushing with 2 failing tests is acceptable if they are labeled pre-push regressions; but pushing with known flakes undermines CI signal).
2. Add a lint rule or code comment noting that `created_at` dates in this fixture MUST be expressed as relative offsets from `PIN_NOW_ISO`, not absolute dates.

**Warning signs:**
- `npm test` shows 2 failures: Test 48 (ledger) and `e2e-weekly-digest.test.js:395` (calendar). Both known.
- Any future addition of absolute year-month strings to this test file without a corresponding `PIN_MINUS_N` derivation comment.

**Phase to address:**
Pre-push cleanup phase. Cannot push with known-failing tests.

---

### Pitfall 7: Multi-model A/B — routing by `ERROR_CLASS` biases the sample and makes winner declaration invalid

**What goes wrong:**
The v4.1 multi-model A/B feature routes "difficult" ERROR_CLASSes (e.g., WRONG_CITATION) to opus 4.7 and "standard" ones to sonnet 4.6. After N fixes, someone compares fix-pass rates by model and concludes opus is "better." This conclusion is statistically invalid because the sample is not randomly assigned — it is conditioned on ERROR_CLASS difficulty.

Concretely: if all WRONG_CITATION cases go to opus and all HARNESS_ERROR cases go to sonnet, and WRONG_CITATION is inherently harder (lower baseline fix rate), opus will appear worse even if it's actually better at the cases it receives. This is selection bias (confounding on case difficulty). The same problem appears in clinical trial design: you can't compare treatment arms if arm assignment is correlated with disease severity.

From the research: empirical LLM bias studies typically use 334+ tasks across 5 models with 5 random generations per prompt. The key requirement is random assignment within the same ERROR_CLASS for a valid comparison. Routing 100% of one class to one model produces zero valid A/B comparison data for that class.

A second failure mode: opus 4.7 costs $5/$25 per Mtok input/output; sonnet 4.6 costs $3/$15. The v4.0 per-day cap ($10) and per-issue cap ($3) are calibrated for all-sonnet. A naive 50/50 A/B doubles the expected cost. At the current per-issue cap of $3, an opus call against a 15k-token context costs approximately $5/$25 × 15k/1M + $4k/1M × output = ~$0.075 input + ~$0.10 output = ~$0.175 per call, well within the per-issue cap. But opus 4.7's `[1m]` tokenizer uses ~35% more tokens than sonnet for the same text, so the effective cost gap is ~55% wider than list-price comparison suggests.

**Why it happens:**
The natural v4.1 design routes difficult cases to the stronger model. This is good for users but bad for A/B statistical validity. The two goals (production quality, evaluation quality) require different routing strategies and cannot be satisfied simultaneously with the same routing rule.

**How to avoid:**

1. **Separate production routing from A/B measurement.** Production routing can send difficult cases to opus. The A/B evaluation must draw a random subset of cases within EACH ERROR_CLASS and randomly split between models. Minimum 20 cases per model per ERROR_CLASS for 80% power at 20% effect size (standard A/B design).

2. **Stratified random assignment within ERROR_CLASS.** For the A/B: within WRONG_CITATION, randomly assign each new case 50/50 to sonnet vs opus. Track pass rates separately by (model, ERROR_CLASS). Compare only within-class results.

3. **Pre-register the sample size.** Before running the A/B, decide in code what `N_per_arm` is required per ERROR_CLASS and write a check that declares "no winner yet" until that N is reached. This prevents the temptation to declare a winner from the first 5 cases.

4. **Cap the opus spend during A/B.** Add an `ab_test_opus_budget_usd` cap to the ledger (separate from the per-issue cap) that limits total opus spend during the evaluation period. Once that cap is hit, all remaining cases go to sonnet (production default).

5. **Verify the `model` field is actually populated in ledger entries.** The ledger's `model` field on SDK transport entries: `llm-driver.js:611` shows `model: modelId` where `modelId` comes from `response.model` (line 594). This is populated from the SDK response object — confirmed present. BUT the leaked entries have `model='claude-opus-4-7[1m]'` with `phase=null`, which means those entries bypassed `invokeAnthropicSdkWithLedger` and went through a direct `appendLedgerEntry` call. Any A/B analysis that reads the committed ledger for model attribution must filter out entries where `phase===null` or `transport===null` (schema violations).

**Warning signs:**
- All ledger entries for `ERROR_CLASS=WRONG_CITATION` show `model=claude-opus-4-7` with zero sonnet entries — pure routing bias, no A/B data.
- A "winner declared" commit after fewer than 20 cases per arm per ERROR_CLASS.
- Ledger cost jumping past the per-day cap on the first day of A/B (opus 4.7 tokenizer overhead at scale).
- Ledger entries with `model` field missing or `null` being included in A/B metric queries.

**Phase to address:**
The multi-model A/B phase. The routing rule and the evaluation rule must be written as two separate code paths — not one `if (difficult) useOpus` block that mixes concerns.

---

### Pitfall 8: Dashboard SUMMARY_KEYS contract — new auto-fix metrics must be strictly additive; renaming existing keys breaks the DIGEST-04 guard

**What goes wrong:**
The weekly digest anchors on `SUMMARY_KEYS` from `tests/e2e/lib/llm-report.js` (lines 123-131): a frozen array of 7 keys: `passed`, `wrong_citation`, `verifier_disagree`, `llm_hallucinated_selection`, `llm_api_error`, `harness_error`, `total_cost_usd`. The DIGEST-04 self-ref guard fix (Phase 38 INT-FIX-02) validated REAL aggregated data against SUMMARY_KEYS. `SUMMARY_KEYS` is `Object.freeze()`d.

v4.1 adds new digest metrics: auto-fix success rate, cost-per-fix, time-to-merge. These metrics live outside SUMMARY_KEYS — they are not ERROR_CLASS tally keys; they are derived dashboard metrics. Two failure modes:

1. **Adding new metrics as SUMMARY_KEYS entries.** If someone adds `'fix_success_rate'` to the SUMMARY_KEYS array, the digest validation against llm-report data fires: `aggregateBySummaryKey()` tries to increment `fix_success_rate` from issue labels, finds no such label mapping, and the tally always reports 0, breaking the "no silent zeros" property.

2. **Renaming or removing existing SUMMARY_KEYS.** If `wrong_citation` is renamed `wrong_citation_count` for clarity, `aggregateBySummaryKey()` no longer produces the expected tally key, and the DIGEST-04 validation throws on the first nightly run with the error "SUMMARY_KEYS validation failed: missing key wrong_citation."

The correct architecture: SUMMARY_KEYS is for ERROR_CLASS-sourced issue label counts. Auto-fix dashboard metrics (success rate, cost-per-fix, time-to-merge) are a separate aggregation path in `build-ledger-dashboard.mjs`, computed from the ledger file, not from issue labels. They appear in the digest as a SEPARATE section, not as entries in the SUMMARY_KEYS tally.

**Why it happens:**
The digest script has a single `summaryTally` aggregation that's well-understood. New dashboard metrics look like "more tally keys" and get added there. The `Object.freeze()` on SUMMARY_KEYS is a speed bump, not a wall — it prevents mutation at runtime but doesn't prevent the array being edited in source.

**How to avoid:**
1. The Vitest guard test must assert `SUMMARY_KEYS` contains exactly `['passed', 'wrong_citation', 'verifier_disagree', 'llm_hallucinated_selection', 'llm_api_error', 'harness_error', 'total_cost_usd']` — not just the count, but the exact tuple in order. This test already exists if Phase 37/38 shipped it; confirm it's still present.
2. Dashboard auto-fix metrics (`fix_success_rate`, `cost_per_fix`, `time_to_merge`) must be computed in `build-ledger-dashboard.mjs` and injected into the digest as a separate `## Auto-Fix Performance` section, NOT as SUMMARY_KEYS entries.
3. `time_to_merge` denominator must be filtered to `merged === true` PRs only. Open/draft PRs have no merge timestamp; including them produces infinity or NaN in the average. The ledger v2 `prNumber` field links ledger entries to PRs; `gh pr view <prNumber> --json mergedAt,state` provides the merge timestamp.
4. `cost_per_fix` must NOT double-count subscription and SDK entries for the same issue. The `transport` field distinguishes them; the combined cost per issue is `sum(cost_usd where issueId=N)` across both transports. The `combinedMonthlyTotalByTransport` function in the ledger already handles this correctly — reuse it.

**Warning signs:**
- `SUMMARY_KEYS.length > 7` in any commit — immediate contract violation.
- The weekly digest shows a new metric as 0 in every row when the underlying data is non-zero (silent zero = SUMMARY_KEYS leak of a dashboard metric key).
- `time_to_merge: Infinity` or `time_to_merge: NaN` in the digest output (open PRs included in denominator).

**Phase to address:**
The auto-fix dashboard phase. The `SUMMARY_KEYS` static-grep Vitest test must be a blocking pre-condition: if it fails, the dashboard phase has broken the contract.

---

### Pitfall 9: UAT-47-a branch existence check — `auto-fix/3-139f821b` may already exist on origin after the push, causing idempotency to silently no-op instead of re-run

**What goes wrong:**
UAT-47-a runs an end-to-end auto-fix on issue #3 (`US11427642-spec-short-1`, fingerprint `139f821b3bb1`). The auto-fix workflow uses branch naming `auto-fix/3-139f821b` with `peter-evans/create-pull-request@v8`'s idempotency behavior: if the branch already exists with the same content, it updates the existing PR rather than creating a new one.

If `auto-fix/3-139f821b` was created during local testing (before the v4.0-integration push), it was never pushed to origin. After the v4.0-integration push, the branch does not exist on origin. The idempotency check works correctly in this case.

BUT: if the UAT is run twice (e.g., UAT-47-a fails on first attempt due to workflow bug, fix is made, UAT re-run), the second run finds the branch exists from the first run. `peter-evans/create-pull-request@v8` will update the existing PR. The PR body comment `<!-- affected_cases: ... -->` may be stale from the first run. The verifier-gate may re-run on the updated PR with old content.

A second concern: UAT-47-a's runbook (committed in `47-UAT-DEFERRED.md`) says to "trigger auto-fix on issue #3 by adding `triage` label." If issue #3 already has the `triage` label from the v3.1 triage run, adding the label again does not fire an `issues: labeled` event — GitHub only fires this event on the transition from "label absent" to "label present," not on re-adding an existing label. The workflow never triggers.

**Why it happens:**
The `issues: labeled` trigger fires exactly once per label-add transition. If the label was added during v3.1 and never removed, re-running UAT-47-a by "adding the triage label" does nothing. The runbook must include a step to REMOVE then RE-ADD the label.

**How to avoid:**
1. UAT-47-a runbook must include: `gh issue edit 3 --remove-label triage` THEN `gh issue edit 3 --add-label triage`. The remove-then-add creates the label transition event.
2. Before the remove-then-add, verify `auto-fix/3-139f821b` does NOT exist on origin (`gh api /repos/tonyrowles/patent-cite-tool/branches/auto-fix%2F3-139f821b` — expect 404). If it exists from a prior run, close the prior PR and delete the branch before re-running.
3. UAT-47-a result verification: after the workflow runs, `gh pr list --label 'auto-fix:verified'` should show exactly one new PR. If it shows zero (workflow didn't trigger) or an old PR with a stale timestamp, the trigger didn't fire.

**Warning signs:**
- `gh workflow run v40-auto-fix.yml` shows no recent runs after the label-add step — means the label was already present.
- `gh pr list --label 'auto-fix'` shows a PR with `created_at` timestamp before the current UAT run — stale PR from a prior attempt.
- The verifier-gate fails with "affected_cases comment missing" — means the PR body was overwritten by `create-pull-request` update but the comment format changed.

**Phase to address:**
Live UAT phase (post-push). The runbook must be updated with the remove-then-add pattern before UAT execution.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Accept `partial-verified` in `assertTripleGate` instead of creating a separate state | Saves 1 function + 1 test | Erodes the single most load-bearing trust invariant in v4.0; every auto-promote thereafter is weakly gated | Never |
| Leave Test 48 failing and push anyway (mark as known flake) | Avoids ledger reset work | CI signal degrades; future regression in the same test is masked by the existing failure | Never; fix before push |
| Hardcode `2026-06` in the digest test fix | Fixes the immediate failure | Same rollover bug in July 2026 | Never; use epoch-relative fixture dates |
| Use SUMMARY_KEYS for dashboard auto-fix metrics | One aggregation path to understand | DIGEST-04 validation breaks on first nightly with these keys present | Never |
| Skip `integration_id` in the CLEANUP-04 ruleset PATCH | Simpler API call | The `verifier-gate` required check can never be satisfied by any Actions job; every PR is blocked forever | Never |
| Declare A/B winner from first 10 cases | Immediate roadmap decision | Statistical noise — true effect size likely 3-5x the observed noise; architectural decision made on garbage data | Never (under 20 per arm per ERROR_CLASS) |
| Keep `bypass_actors=1` to avoid break-glass risk | Single maintainer can always merge | Ruleset enforcement is theater; the trust invariant is not enforced | Only until break-glass procedure is documented and tested; then remove |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| GitHub ruleset PATCH | Omit `integration_id`, use only `context` string | Always include `integration_id` for Actions-produced checks; capture it from an existing CI run's check-suite |
| `gh pr merge --admin` | Use on a ruleset with `Do not allow bypassing: ON` | Use ruleset PATCH to temporarily add bypass actor, merge normally, then PATCH back to remove |
| `issues: labeled` workflow trigger | Add label that already exists → no event fires | Remove-then-add the label to create the transition event; document in UAT runbook |
| Ledger IIFE path resolution | Import `invokeAnthropicSdkWithLedger` in a test without setting `E2E_LEDGER_PATH_OVERRIDE` first | Set `E2E_LEDGER_PATH_OVERRIDE` in Vitest `globalSetup` BEFORE any test imports the ledger module |
| Opus 4.7 cost calculation | Use list-price $5/$25 per Mtok for budget estimates | Add 35% tokenizer overhead to input token estimates for opus 4.7 effective cost; the `[1m]` context variant is even more expensive |
| `peter-evans/create-pull-request` idempotency | Expect re-run to create a fresh PR | Second run updates the existing PR branch; old stale PR body persists unless explicitly deleted first |
| `time_to_merge` metric | Include all ledger entries with `prNumber` in denominator | Filter to `mergedAt !== null` only; unmerged/draft PRs have no merge timestamp |
| SUMMARY_KEYS extension | Add new keys to the frozen array for new metrics | Keep SUMMARY_KEYS frozen at 7 entries; add new metrics in a separate section of the digest |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Opus 4.7 tokenizer overhead in A/B | Per-call cost 55% higher than list-price estimate; per-day cap hit on day 1 | Size prompt in tokens using the opus tokenizer, not sonnet; pre-estimate with `anthropic.messages.countTokens()` | First opus call with the full fix prompt |
| 777-commit PR diff size in CI | CI logs show large git diff; checkout step slow; potential diff-guard false positives on LOC | The diff-guard checks src/ LOC changed vs 200 LOC cap — on the integration PR this fires if any src/ change is > 200 LOC. The diff-guard is scoped to `auto-fix/*` branches; the integration PR is NOT an auto-fix PR. Confirm the diff-guard only runs on `auto-fix/*` branches | Integration PR creation |
| Live nightly cron conflict during UATs | UAT-47-b may conflict with the actual Monday 09:00 UTC dep-update cron if run during the same window | Run UAT-47-b via `workflow_dispatch` (not the actual cron), or run on a day that is NOT Monday | Monday 09:00 UTC window |
| `[skip ci]` double-fire pattern | If existing ledger entries already include `[skip ci]` marker pattern, adding a new snapshot commit may trigger two workflow runs | The `[skip ci]` guard is on the commit message, not the file diff; confirm exactly one snapshot-commit job runs per day | If the workflow uses `push: paths: [...]` AND cron simultaneously |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Leaving `bypass_actors=1` active after CLEANUP-04 | Bypasses verifier-gate and CODEOWNERS review; auto-fix PRs can be self-merged by the owner without human review gap | CLEANUP-04 must remove it AND document and test the break-glass recovery path first |
| Running UAT-47-e with a real PR against origin/main | The crafted bypass PR, if labeled correctly by accident, could trigger auto-promote on the real golden baseline | UAT-47-e should use a test branch, not main; the PR must be labeled `human-review-required` NOT `auto-fix:verified` before running the test |
| A/B model field forensics: using `model` field from `phase=null` entries | `phase=null` entries may have wrong/spoofed model IDs (they bypassed the enforced wrapper) | Filter to `transport != null && phase != null` before any model-based aggregation; log a warning on nulls |

---

## "Looks Done But Isn't" Checklist

- [ ] **Test 48:** Often "fixed" by relaxing the assertion to allow N entries instead of 1 — verify the fix is a ledger reset, not a contract relaxation. Check: `cat tests/e2e/.llm-spend-ledger.json | jq '.months | keys | length'` returns `1`.
- [ ] **Calendar-rollover fix:** Often "fixed" by updating the hardcoded date to the current month — verify the fix uses epoch-relative fixture dates derived from a single `PIN_NOW_ISO` constant, not another absolute date.
- [ ] **assertTripleGate:** Often "updated" to accept partial-verified — verify `grep -n 'partial' scripts/auto-fix-promote.mjs` finds NO reference to `partial-verified` inside the `assertTripleGate` function body.
- [ ] **CLEANUP-04 ruleset patch:** Often applied without the `integration_id` — verify `gh api GET /repos/tonyrowles/patent-cite-tool/rulesets/17086676 --jq '.rules[] | select(.type=="required_status_checks") | .parameters.required_status_checks[].integration_id'` returns a non-null integer.
- [ ] **bypass_actors removal:** Often deferred "to avoid risk" — verify `gh api GET /repos/tonyrowles/patent-cite-tool/rulesets/17086676 --jq '.bypass_actors'` returns `[]` after CLEANUP-04 and that the break-glass runbook is committed.
- [ ] **A/B model field:** Often left as a stub that returns the default model — verify `grep -n 'model' tests/e2e/lib/llm-driver.js | grep 'appendLedgerEntry'` shows `model: modelId` (not `model: 'claude-sonnet-4-6'` hardcoded) on the SDK transport path.
- [ ] **SUMMARY_KEYS length:** Often extended with dashboard keys — verify `grep -A 12 'export const SUMMARY_KEYS' tests/e2e/lib/llm-report.js | grep -c "'"` returns exactly 7.
- [ ] **UAT-47-a runbook:** Often missing the remove-then-add label step — verify `.planning/phases/47-UAT-DEFERRED.md` includes `gh issue edit 3 --remove-label triage` before `gh issue edit 3 --add-label triage`.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Admin merge used, `bypass_actors` re-enabled silently | MEDIUM | (1) `gh api PATCH` to re-empty bypass_actors immediately. (2) Audit the merged PR for any workflow file or CODEOWNERS changes. (3) Note the `protected_branch.policy_override` audit log event — this is the forensic marker. (4) If the merge bypassed a required check, `git revert` and re-submit through proper gates. |
| CLEANUP-04 ordered wrong (status checks added before integration merge) | MEDIUM | (1) `gh api PATCH` to remove the required_status_checks temporarily. (2) Merge the integration PR normally. (3) Re-apply the required_status_checks patch with correct `integration_id`. |
| `assertTripleGate` relaxed to accept `partial-verified` | HIGH | (1) `git revert` the commit that widened assertTripleGate. (2) Audit all auto-promotes that ran while the relaxed gate was active — any case auto-promoted via partial-verified must be reverted from golden. (3) Re-implement using the separate `assertPartialGate` pattern. |
| Test 48 "fixed" by relaxing assertion | MEDIUM | (1) Revert the test change. (2) Reset the ledger. (3) Find and fix the write-site that produced `phase=null` entries. |
| A/B winner declared from biased sample | LOW | (1) Retract the winner declaration in documentation. (2) Reset A/B counters. (3) Implement stratified random assignment before re-running. |
| `[skip ci]` double-fire on ledger snapshot | LOW | (1) Check workflow trigger: `on: push: paths:` + `schedule:` combination can fire twice. (2) Remove the `paths:` trigger; use schedule-only. (3) Verify ledger snapshot commit message starts with `chore(ledger):` and contains `[skip ci]`. |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1. Push strategy — `--admin` audit trail | Pre-push / CLEANUP-04 push runbook | Audit log shows no `protected_branch.policy_override` event for the integration merge. |
| 2. CLEANUP-04 ordering race (status checks added before push) | CLEANUP-04 (Order B enforced) | `required_status_checks` added AFTER integration merge AND `integration_id` is non-null integer. |
| 3. `bypass_actors` removal with no break-glass | CLEANUP-04 | Break-glass PATCH command committed to docs AND tested before removal. `gh api GET` shows `bypass_actors: []`. |
| 4. Partial-verified trust invariant erosion (LOAD-BEARING) | Partial-verified semantics phase | `grep -n 'partial' scripts/auto-fix-promote.mjs` shows no partial-verified reference in `assertTripleGate`. Vitest test asserts `assertTripleGate` throws when given only `auto-fix:partial-verified` label. |
| 5. Test 48 ledger leak — contract relaxation instead of reset | Pre-push cleanup | `jq '.months | keys | length' tests/e2e/.llm-spend-ledger.json` returns `1`. All entries have non-null `phase` and `transport`. |
| 6. Calendar-rollover flake | Pre-push cleanup | `npm test` exits 0 (zero failures). `PIN_NOW_ISO` constant present; no hardcoded absolute month strings in fixture dates. |
| 7. Multi-model A/B bias | A/B phase | Routing assignment uses stratified random within ERROR_CLASS. Sample size check asserts N >= 20 per arm per class before winner declaration. `model` field non-null on all SDK ledger entries included in analysis. |
| 8. SUMMARY_KEYS dashboard expansion | Dashboard phase | `SUMMARY_KEYS.length === 7` Vitest assertion passes. Auto-fix metrics appear as a separate digest section, not as SUMMARY_KEYS entries. |
| 9. UAT-47-a branch existence + label idempotency | Live UAT phase | Runbook includes remove-then-add label step. Branch `auto-fix/3-139f821b` confirmed absent on origin before UAT. |

---

## Sources

- Direct code inspection: `tests/unit/llm-ledger.test.js` lines 999-1025 (Test 48 contract), `scripts/auto-fix-promote.mjs` lines 67-82 (`assertTripleGate` implementation), `.github/workflows/v40-verifier-gate.yml` lines 181/372-420 (`verifier-gate` job name + `ready-flip` label producer), `tests/e2e/lib/llm-report.js` lines 123-131 (SUMMARY_KEYS frozen array), `tests/e2e/.llm-spend-ledger.json` (live ledger showing 4 leaked `phase=null` opus entries)
- Direct code inspection: `tests/e2e/scripts/e2e-weekly-digest.test.js` lines 64/133/137-139 (PIN_NOW hardcoded May 2026), `tests/e2e/lib/llm-driver.js` lines 506-620 (`invokeAnthropicSdkWithLedger`, model field population at line 611), `tests/e2e/lib/llm-ledger.js` lines 74-97 (LEDGER_PATH IIFE resolution + E2E_LEDGER_PATH_OVERRIDE guard)
- `.planning/v4.0-SESSION-HANDOFF-2026-06-01.md` — Test 48 regression + calendar flake + package-lock concerns; push strategy context
- `docs/v40-repo-config.md` — ruleset 17086676 settings, bypass_actors status, `integration_id` empty-slot note for Phase 47
- `.planning/PROJECT.md` Key Decisions table, line 224 — `_skipCiGuard` triple-gate locked decision
- `.planning/STATE.md` Deferred Items — `bypass_actors=1` tech debt, `required_status_checks rule absent` tech debt
- [GitHub Docs — Troubleshooting required status checks](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/collaborating-on-repositories-with-code-quality-features/troubleshooting-required-status-checks) — `integration_id` requirement for GitHub Actions checks; job name exact-match requirement
- [GitHub community discussion #26698 — "Expected — Waiting for status to be reported"](https://github.com/orgs/community/discussions/26698) — canonical symptom of `integration_id` mismatch in required status check configuration
- [GitHub Changelog — Repository Rules GA](https://github.blog/news-insights/product-news/github-repository-rules-are-now-generally-available/) — bypass_actors behavior in rulesets vs legacy branch protection
- [Bias Testing and Mitigation in LLM-based Code Generation — ACM TOSEM 2024](https://dl.acm.org/doi/full/10.1145/3724117) — empirical multi-model bias study methodology (334 tasks, 5 models, 5 generations per prompt); informs A/B sample size requirement
- [A/B Testing in LLM Deployment: Ultimate Guide — Latitude](https://latitude.so/blog/ab-testing-in-llm-deployment-ultimate-guide/) — LLM-specific A/B challenges; statistical significance requirements; minimum sample sizes
- [Anthropic Claude API Pricing 2026 — CloudZero](https://www.cloudzero.com/blog/claude-opus-4-7-pricing/) — opus 4.7 tokenizer overhead (~35% more tokens); effective cost gap vs sonnet 4.6 (~55% not ~67% list-price)
- [LLMs That Write Your Security Fix PRs — AquilaX](https://aquilax.ai/blog/llm-auto-fix-pull-request-generation) — "false-fix rate" definition (passes tests but vulnerability still exploitable); partial-pass semantics; informing why partial-verified must NOT auto-promote
- [GitHub Actions skip pull request workflows with skip ci — GitHub Changelog](https://github.blog/changelog/2021-02-08-github-actions-skip-pull-request-and-push-workflows-with-skip-ci/) — `[skip ci]` commit message semantics; applies to the ledger snapshot workflow
- [Avoid workflow loops when committing to protected branch — Shounak Mulay](https://blog.shounakmulay.dev/avoid-workflow-loops-on-github-actions-when-committing-to-a-protected-branch) — GITHUB_TOKEN vs PAT loop avoidance; informs `[skip ci]` discipline on ledger snapshot commits

---
*Pitfalls research for: v4.1 Readiness Gate + Push on a mature LLM-CI pipeline*
*Researched: 2026-06-02*

# Pitfalls Research

**Domain:** v4.2 Auto-Fix Loop Live — adding ledger-commit refactor, ledger schema extension, fixture-mutator, leak-vector hardening, and live UAT to a running LLM-CI pipeline on origin/main
**Researched:** 2026-06-04
**Confidence:** HIGH for Pitfalls 1–7 (grounded in direct code inspection of auto-fix.mjs, v40-auto-fix.yml, v40-cost-ledger-snapshot.yml, llm-ledger.js, auto-fix-promote.mjs, and the Phase 48 leak vector memory); HIGH for Pitfalls 8–10 (grounded in quarantine-append.mjs, test-cases-quarantine.js, and v4.1 STATE.md UAT closure data); MEDIUM for Pitfall 11 (first-real-fix sourcing — prior evidence is thin; cautious assertion).

> **Scope note:** This file covers ONLY v4.2-new failure modes. The 9 v4.1 pitfalls (push strategy, ruleset ordering, bypass_actors, partial-verified trust invariant, Test 48 ledger leak, calendar-rollover flake, A/B routing bias, SUMMARY_KEYS extension, UAT-47-a branch/label idempotency) are CLOSED AND LOCKED — do not re-warn about them here. New pitfalls reference prior work as "prior" only when they produce a NEW failure surface.

---

## Critical Pitfalls

### Pitfall 1 (LOAD-BEARING): Ledger-commit refactor races — the two-commit split in v40-auto-fix.yml writes ledger entries directly to main; adding a branch-redirect breaks the split and corrupts the PR diff

**What goes wrong:**

`v40-auto-fix.yml` uses a "two-commit split" (documented in its line 6–9 header): the dispatcher writes a ledger entry to the working tree, the workflow commits it DIRECTLY to `main` with `[skip ci]`, then rebases the `auto-fix/*` branch onto the freshened `main` so the PR diff contains ONLY source code changes. The diff-guard (VFY-GATE-04) rejects any PR touching `tests/e2e/.llm-spend-ledger.json`. This architecture is deliberately fragile in a useful way — it enforces clean PR diffs by design.

If the ledger-commit refactor converts the snapshot workflow's direct-push-to-main to a `ledger-snapshots/*` branch-redirect pattern, the natural follow-through temptation is to apply the SAME redirect to `v40-auto-fix.yml`'s ledger commit. That is catastrophic:

1. The auto-fix ledger commit now lands on `ledger-snapshots/auto-fix-N` instead of `main`.
2. The `auto-fix/*` PR branch is rebased onto `main` (which no longer has the ledger entry).
3. The ledger entry IS in the PR diff — `git diff main...auto-fix/N-fingerprint` now shows `llm-spend-ledger.json` as modified.
4. The diff-guard's FORBIDDEN_PATHS regex bank includes `tests/e2e/.llm-spend-ledger.json` — the verifier-gate job REJECTS the auto-fix PR.
5. Every auto-fix PR from this point forward is permanently blocked by its own verifier gate.

**Why it happens:**

The refactor scope is "convert direct-push-to-main workflows to a branch-redirect or PR-then-merge." `v40-cost-ledger-snapshot.yml` is the correct target (its daily snapshots accumulate 365 commits/year directly on `main`). `v40-auto-fix.yml`'s ledger commit LOOKS similar but is architecturally different — it exists to make the PR diff clean, not to persist data. The two commits serve different purposes even though they are both "ledger commits to main."

**How to avoid:**

The refactor must apply to `v40-cost-ledger-snapshot.yml` ONLY. The auto-fix workflow's ledger commit step must remain a direct push to `main`. Concretely:

1. In the refactor phase plan, explicitly name the workflows in scope and out of scope. `v40-auto-fix.yml:150–172` (the "Commit ledger update to main" step) is OUT OF SCOPE.
2. Add a Vitest assertion that `v40-auto-fix.yml` still contains `git push origin main` inside the ledger-commit step — the byte-present grep is: `grep -c 'git push origin main' .github/workflows/v40-auto-fix.yml` must equal 1 after the refactor.
3. After refactor, manually confirm `git diff main...auto-fix/*` on any live auto-fix PR does NOT show `llm-spend-ledger.json` in the diff.

**Warning signs:**

- `gh pr view <auto-fix-pr> --json files --jq '.[].path'` includes `.llm-spend-ledger.json`.
- Verifier-gate job shows "diff-guard violation: tests/e2e/.llm-spend-ledger.json" on an otherwise-valid auto-fix PR.
- The snapshot workflow and the auto-fix workflow both changed to `ledger-snapshots/*` in the same commit.

**Phase to address:**

Ledger-commit refactor phase (v4.2 Phase 1 candidate). Must be the first phase; UAT-47-a and UAT-47-d both depend on this being resolved, and both require origin/main to be in a known-good state.

---

### Pitfall 2: Branch-redirect for snapshot requires ruleset adjustment — `ledger-snapshots/*` must either bypass the verifier-gate requirement or be excluded from the required_status_checks scope

**What goes wrong:**

Ruleset 17086676 on `origin/main` has `required_status_checks` for `verifier-gate` and `deps-update-gate` (added in Phase 50). These checks are required for ALL pull requests targeting `main`. If the ledger-commit refactor opens a PR from `ledger-snapshots/YYYYMMDD` targeting `main`, that PR must satisfy `verifier-gate` before it can merge.

`verifier-gate` only runs when triggered by `pull_request` events on `auto-fix/*` branches (Phase 51.1 fix removed the base-ref filter; the workflow now triggers on all PRs). But `verifier-gate` runs the 3×affected-case verification and 76-case regression suite — for a ledger-snapshot PR that touches ONLY `tests/e2e/.llm-spend-ledger.json`, these checks are meaningless AND expensive (adds ~8 min per daily snapshot). Worse, the diff-guard job will REJECT the PR because `llm-spend-ledger.json` is in the FORBIDDEN_PATHS bank.

Three possible outcomes, all bad:
1. Every daily ledger-snapshot PR is rejected by diff-guard — 365 auto-rejected PRs/year accumulate.
2. The FORBIDDEN_PATHS bank is modified to allow `llm-spend-ledger.json` — erodes the diff-guard invariant that protects production code.
3. The scope-decision fast-path (added in Phase 51.1 for `deps-update.yml`) is copied to the verifier-gate for ledger-snapshot PRs — requires careful scoping or it creates a bypass vector.

**Why it happens:**

The Phase 51.1 fix added a "scope-decision fast-path" step to `v40-verifier-gate.yml` that exits early when the PR is NOT an `auto-fix/*` branch. This already handles `ledger-snapshots/*` PRs correctly — they would hit the fast-path and exit 0 (success) without running the full suite. BUT: the diff-guard job runs BEFORE the scope-decision and is NOT scoped — it runs on ALL PRs.

**How to avoid:**

1. Add a scope-decision step to the `diff-guard` job in `v40-verifier-gate.yml` that exits 0 immediately when `github.head_ref` does NOT match `auto-fix/*`. The diff-guard is only meaningful for auto-fix PRs. This is a pure addition — non-auto-fix PRs get an instant-pass on diff-guard.
2. Verify: after the scope step, `gh pr view <ledger-snapshot-pr> --json statusCheckRollup --jq '.[].state'` shows all required checks as SUCCESS within 60 seconds (fast-path timing).
3. Pin a Vitest YAML-contract test that asserts the `diff-guard` job contains a `github.head_ref` scope guard at step 1 — prevents future removal.

Alternatively, the ledger-commit refactor can use auto-merge on the snapshot PR (GitHub auto-merge merges after all required checks pass). If all checks fast-path to SUCCESS, the PR auto-merges in ~60s and the daily heartbeat is preserved.

**Warning signs:**

- Daily `ledger-snapshots/*` PRs sitting in "Required status check waiting" state for longer than 5 minutes (full suite should not be running).
- `diff-guard` job failing on a PR that touches only `tests/e2e/.llm-spend-ledger.json`.
- The PR queue shows 10+ unmerged `ledger-snapshots/*` PRs accumulating (heartbeat broken).

**Phase to address:**

Ledger-commit refactor phase, as a concurrent sub-task with Pitfall 1's scope constraint. The ruleset interaction must be audited BEFORE the refactor is pushed.

---

### Pitfall 3 (LOAD-BEARING): Ledger schema extension — existing 33 Vitest cases that assert entry shape will silently pass but the 7 direct `appendLedgerEntry` call sites in auto-fix.mjs will continue writing the OLD shape, leaving `errorClass` and `outcome` fields absent from live entries

**What goes wrong:**

The ledger schema extension adds `errorClass` and `pr_merged` (or `outcome`) fields to entries written by `auto-fix.mjs`. There are 7 `appendLedgerEntry` call sites in `auto-fix.mjs` (lines 295, 391, 546, 589, 685, 707, 744). The extension requires wiring `errorClass` into each of these sites.

The common mistake: the schema extension adds the new fields to the `makeEntry()` test helper and to the JSDoc in `llm-ledger.js`, but does NOT update all 7 call sites in `auto-fix.mjs`. Tests pass because:
- Tests use `makeEntry()` overrides — they create entries with `errorClass` included.
- `appendLedgerEntry` spreads the entry verbatim — it never validates required fields.
- No existing test reads a ledger entry written by the actual `auto-fix.mjs` dispatcher and asserts `errorClass` is present.

Result: the schema extension ships, tests are green, but `a-b-winner.mjs` continues in abstention forever because all live entries lack `errorClass`. The dashboard shows `errorClass: undefined` for every entry. The A/B winner exit condition (`errorClass` AND `outcome` both present, ≥20 entries per ERROR_CLASS per arm) never triggers.

**Why it happens:**

`appendLedgerEntry` is a permissive write function — it accepts any object and spreads it. There is no required-field validation at the write site. Partial wiring is silently acceptable to the function.

**How to avoid:**

1. Write an integration test that actually invokes the `runDispatcher()` export from `auto-fix.mjs` (in a dry-run or mocked mode) and then reads the ledger file to assert the emitted entry contains `errorClass`. This is the only test that would catch partial wiring.
2. The wiring task must enumerate all 7 `appendLedgerEntry` call sites by line number and check each one after the commit. A grep assertion: `grep -c 'errorClass' scripts/auto-fix.mjs` must equal at least 7 (one per call site).
3. `outcome` / `pr_merged` field is sourced from `auto-fix-promote.mjs` — a SEPARATE workflow run from `auto-fix.mjs`. Wire it as a follow-up `appendLedgerEntry` call in `auto-fix-promote.mjs` main() after promotion succeeds, with `source: 'auto-fix-promoted'` and `outcome: 'pass'` (or `source: 'auto-fix-failed'` and `outcome: 'fail'` on label-flap-to-failure).
4. Vitest test: assert that after a mocked successful promotion, a new ledger entry exists with `source === 'auto-fix-promoted'` and `outcome === 'pass'`.

**Warning signs:**

- `a-b-winner.mjs` still emits `NO_WINNER_YET` after 30+ auto-fix runs.
- Dashboard shows `errorClass: null` or `errorClass: undefined` in the per-entry view after the schema extension ships.
- `grep -c 'errorClass' scripts/auto-fix.mjs` returns fewer than 7.

**Phase to address:**

Ledger schema extension phase. The integration test for the emitted entry shape must land in the SAME commit that wires `errorClass` into the call sites.

---

### Pitfall 4: Mixed-schema ledger corrupts `combinedMonthlyTotalByTransport` grouping and the A/B winner probe when old entries lack `errorClass`

**What goes wrong:**

After the schema extension, the live ledger will have a MIXED schema: 6+ months of pre-extension entries (no `errorClass`, no `outcome`) followed by new entries (with both fields). Two downstream consumers break differently:

**`combinedMonthlyTotalByTransport` grouping:** This function iterates `iterations[]` and groups by `transport`. Adding `errorClass` does NOT change grouping — transport grouping is unaffected. This is NOT a pitfall for this function.

**`a-b-winner.mjs` outcome probe:** The script reads all ledger entries matching a given `ERROR_CLASS` and counts entries where `outcome` is populated. If old entries (pre-extension) are counted in the denominator but have `outcome: undefined`, the N-per-arm threshold (`≥20 entries with outcome field per ERROR_CLASS per model arm`) is never reached even if 20+ new entries exist — the old entries are included in the population but have no outcome, making the effective sample appear too small.

**Dashboard renderer (`build-ledger-dashboard.mjs`):** If the renderer reads per-month aggregates across all time and tries to display `errorClass` breakdowns, months from before the schema extension will show all entries as `errorClass: undefined` — creating a "null" category that inflates the error-class histogram with meaningless entries.

**Why it happens:**

The mixed-schema scenario is inevitable for an append-only JSONL that has been live for months. Reading all-time entries without a schema-version filter assumes a homogeneous corpus.

**How to avoid:**

1. `a-b-winner.mjs` MUST filter entries to `entry.errorClass !== undefined && entry.outcome !== undefined` BEFORE computing per-arm counts. The abstention threshold denominator must count ONLY entries with both fields present.
2. The dashboard renderer should treat `errorClass: undefined` entries as a `pre-extension` bucket and either exclude them from error-class histograms or display them as "legacy (pre-schema-extension)".
3. Add a Vitest test for `a-b-winner.mjs` with a synthetic mixed ledger (10 pre-extension entries with no `errorClass` + 5 new entries with `errorClass` + `outcome`) and assert the outcome probe counts only the 5 new entries toward the N-per-arm threshold.

**Warning signs:**

- `a-b-winner.mjs` emits `NO_WINNER_YET` with "insufficient sample" despite the ledger containing >20 entries per arm — means old entries are being counted in the denominator but lack `outcome`.
- Dashboard shows a large "undefined" or "(none)" category in the error-class breakdown.

**Phase to address:**

Ledger schema extension phase, concurrent with Pitfall 3. The filter for `errorClass !== undefined` must land in `a-b-winner.mjs` in the same phase.

---

### Pitfall 5 (LOAD-BEARING): Fixture-mutator writes into `tests/test-cases.js` or `tests/golden/baseline.json` — the diff-guard FORBIDDEN_PATHS bank will reject the auto-fix PR that tries to fix it

**What goes wrong:**

The fixture-mutator (UAT-47-b) injects a controlled defect into the golden-baseline pipeline to create a deterministic test case for the full loop: mutate → rerun → triage → issue-file → auto-fix → verifier-gate → merge → promote. The defect must be reversible.

The natural implementation: modify a fixture JSON in `tests/fixtures/` to introduce a text-layer error, then regenerate `tests/golden/baseline.json` to reflect the new (wrong) expected output.

This is catastrophic for two reasons:
1. `tests/golden/baseline.json` is in the FORBIDDEN_PATHS bank (Phase 41, VFY-GATE-04). Any auto-fix PR that touches this file is rejected by diff-guard. The auto-fix PR generated by the LLM CANNOT fix a golden-baseline defect through the loop — it is structurally blocked.
2. Mutating `tests/test-cases.js` (also in FORBIDDEN_PATHS) or the fixture JSON permanently alters production test infrastructure if the mutation is not cleanly reversed.

The synthetic defect must be in SOURCE CODE (`src/`), not in test fixtures. The defect that the mutator injects must be fixable by an LLM that edits `src/` files.

**Why it happens:**

The fixture corpus (`tests/fixtures/*.json`) is the most direct representation of "what the pipeline processes." It is tempting to inject a defect there because it immediately creates a failure mode that looks like a real production regression. But the fix for a fixture defect cannot travel through the auto-fix pipeline because fixture files are locked.

**How to avoid:**

1. The mutator must inject a defect INTO `src/` — specifically, a deterministic off-by-one in a matching function, a string constant corruption, or a threshold value change that causes the citation algorithm to produce a known-wrong result for a specific test case.
2. The defect must be reversible by `git checkout src/<target-file>` — no external state affected.
3. The resulting failure: the nightly regression detects the wrong citation, triage classifies it (deterministically — heuristic-first path, not LLM), the issue is filed, and the auto-fix LLM proposes a patch to `src/`. The diff-guard allows `src/` edits. The verifier-gate re-runs against the PR branch. If the LLM proposes the correct src/ fix, the verifier-gate passes.
4. Vitest test for the mutator: assert `mutate()` produces a file diff that is ENTIRELY within `src/` (no fixture, no golden, no test-cases). Use `changedPathsFromDiff()` from `scripts/check-diff-guard.mjs` to verify the mutated paths.
5. The mutator must be committed to `scripts/` but NOT run as part of `npm test`. It is a test operator's tool, not a CI tool.

**Warning signs:**

- The mutator's commit message or diff shows changes to `tests/fixtures/`, `tests/golden/baseline.json`, or `tests/test-cases.js`.
- The auto-fix PR generated after mutation is rejected by diff-guard with "diff-guard violation: tests/golden/baseline.json".
- The nightly regression shows failures in the golden-baseline comparison rather than in the citation output (fixture mutation hits the wrong layer).

**Phase to address:**

Fixture-mutator phase (UAT-47-b). The mutator design document must specify which `src/` file is targeted and why that file produces a deterministic, classifiable failure.

---

### Pitfall 6: Fixture-mutator fingerprint collides with a real quarantine entry — the dedup logic hides the synthetic case, the loop never processes it

**What goes wrong:**

Issue fingerprints are computed from `selectedText` + `patentFile` (the v1 formula, with v2 as an additive extension). The mutator injects a defect that causes a known test case to fail — the same test case that was previously quarantined (e.g., `US11427642-spec-short-1`). The fingerprint for the synthetic failure IS the same as the fingerprint for the existing quarantine entry.

`findMatchingIssue` does a dual v1+v2 search. If an issue with `fp: <fingerprint>` already exists (opened, closed, or labeled), the issue-filer calls it a duplicate and does NOT file a new issue. The auto-fix pipeline never sees the synthetic defect as a fresh issue.

Additionally, the quarantine entry's `stable_runs >= 3` makes it eligible for `quarantine:ready-for-promotion`. If the mutator fires AFTER the quarantine entry is promoted to golden, `tests/test-cases.js` now includes the case in the GOLDEN corpus, and the verifier-gate runs it against the (mutated) src/ — but the expected result is now the WRONG citation because the src/ was mutated. The verifier-gate fails for the wrong reason.

**Why it happens:**

The mutator injects a defect into an existing test case to make the failure deterministic. The same case is likely already in the quarantine because it was the original issue that prompted the auto-fix pipeline. Fingerprint collision is structural, not accidental.

**How to avoid:**

1. The mutator must target a test case that is NOT currently in `TEST_CASES_QUARANTINE` and has NO open GitHub issue with a matching fingerprint. The mutator's pre-flight check: `gh issue list --label <fingerprint> --state all` must return 0 results.
2. Alternatively, design the mutator to inject a defect that creates a NEW case ID — a `src/` change that produces a wrong citation for a DIFFERENT passage (e.g., a different `selectedText` that is not already quarantined). This avoids fingerprint collision entirely.
3. The quarantine promotion guard: before running the mutator UAT, verify the target case has NOT been promoted (grep `TEST_CASES` in `tests/test-cases.js` for the case ID).
4. Vitest test for the mutator: assert that `fingerprint(mutatedCaseId, patentFile)` does NOT appear in the current `TEST_CASES_QUARANTINE` array.

**Warning signs:**

- `gh issue list --label <fingerprint-of-mutated-case>` returns a pre-existing issue.
- The nightly run after mutation shows "duplicate fingerprint — skipping issue creation" in the issue-filer log.
- The quarantine entry `stable_runs` increments even after the mutation is active (mutated case passes, so the wrong stable result is recorded).

**Phase to address:**

Fixture-mutator phase, as a pre-condition check in the mutator's own `run()` function. The pre-flight fingerprint check must be a hard abort, not a warning.

---

### Pitfall 7 (LOAD-BEARING): Leak-vector hardening — moving the guard to `appendLedgerEntry` itself creates a test-isolation regression for the 33 existing Vitest cases that call `appendLedgerEntry` directly with a tmp path

**What goes wrong:**

The v4.1 PITFALLS.md (Pitfall 5) describes the leak vector: `scripts/auto-fix.mjs` calls `appendLedgerEntry(LEDGER_PATH, ...)` directly, bypassing the `invokeAnthropicSdkWithLedger` guard in `llm-driver.js`. The natural fix for v4.2: add the guard to `appendLedgerEntry` itself — a single chokepoint that all call sites pass through.

The problem: `tests/unit/llm-ledger.test.js` has 33+ test cases that call `appendLedgerEntry(ledgerPath, entry)` where `ledgerPath` is a `mkdtempSync` temporary path. These tests are NOT running in CI — they run locally without `CI=true`. If the guard inside `appendLedgerEntry` fires when `!CI && !E2E_LEDGER_PATH_OVERRIDE`, all 33 tests break with "ledger guard: not in CI, set E2E_LEDGER_PATH_OVERRIDE."

This is not a hypothetical — the `LEDGER_PATH` IIFE in `llm-ledger.js` (lines 74–97) already resolves at module-load time. A guard inside `appendLedgerEntry` that checks `CI` would fire on EVERY call, including test calls with a temp path argument. The guard would need to distinguish "caller passed the production LEDGER_PATH" from "caller passed a temp path." There is no reliable way to do this without adding a parameter or comparing paths — both of which change the function signature and break existing callers.

**Why it happens:**

Adding the guard to the lowest-common chokepoint (`appendLedgerEntry`) is the structurally clean solution recommended in the leak-vector memory note. But `appendLedgerEntry` is also the function used by EVERY test, which makes the chokepoint approach incompatible with the existing test isolation pattern.

**How to avoid:**

Correct design: add the guard to the call sites in `scripts/auto-fix.mjs` specifically, NOT to `appendLedgerEntry` itself. The guard at the call site: before each `appendLedgerEntry(LEDGER_PATH, ...)` in `auto-fix.mjs`, assert that either `CI` is set or `E2E_LEDGER_PATH_OVERRIDE` is set. Exit non-zero if neither is true (same contract as `invokeAnthropicSdkWithLedger`).

Alternatively: wrap all 7 `appendLedgerEntry(LEDGER_PATH, ...)` calls in `auto-fix.mjs` inside a helper function `safeAppendLedger(entry)` that performs the CI check and then calls `appendLedgerEntry`. This keeps `appendLedgerEntry` untouched and creates a single guard point within `auto-fix.mjs`'s scope.

1. The guard MUST NOT be added to `appendLedgerEntry` body.
2. The guard MUST be added to all 7 call sites in `auto-fix.mjs` (or via a `safeAppendLedger` wrapper exported from the same file).
3. Vitest test: assert `grep -c 'safeAppendLedger\|ledger.*CI.*guard' scripts/auto-fix.mjs` returns ≥7, confirming all call sites are covered.
4. Regression test: `npm test` must still pass for all 33 existing ledger unit tests after the hardening.

**Warning signs:**

- `npm test` shows 33 failures in `tests/unit/llm-ledger.test.js` after the hardening commit — means the guard was added to `appendLedgerEntry` itself.
- `npm test` passes but the working tree gains a `source: 'auto-fix-api'` ledger entry after a test run that imports `auto-fix.mjs` (means the guard is at the wrong level — it's in `invokeAnthropicSdkWithLedger` but not at the `auto-fix.mjs` direct-write sites).

**Phase to address:**

Leak-vector hardening phase. The hardening commit must include a regression check: `npm test` must exit 0 with the same pass count as before the commit.

---

### Pitfall 8: Fixture-mutator's synthetic quarantine entry auto-promotes via `stable_runs >= 3` before the loop proof is captured

**What goes wrong:**

The fixture-mutator creates a synthetic failure that flows into the quarantine corpus via `quarantine-append.mjs`. The quarantine entry starts at `stable_runs: 1`. Each nightly run that passes for the synthetic case (AFTER the auto-fix PR is merged and the fix is in) increments `stable_runs`. At `stable_runs >= 3`, `quarantine-append.mjs` adds the `quarantine:ready-for-promotion` label and makes the case eligible for human-triggered promotion to golden.

The pitfall: if the auto-fix merge happens early in the week and three nightly runs pass before the operator captures the "loop proof" evidence (screenshots, workflow links, PR chain), the case is auto-labeled `quarantine:ready-for-promotion`. A human who doesn't know the case was synthetic promotes it to the golden corpus. The synthetic defect's fix is now in `tests/test-cases.js` as if it were a real regression fix.

This is not catastrophic (the fix is real source code, the test case is valid), but it muddies the evidence record for the loop proof and may introduce a test case that was not properly validated as a production regression.

**Why it happens:**

The quarantine's stable-runs counter is event-driven (nightly cron) and automatic. There is no mechanism to flag a quarantine entry as "synthetic / proof-of-concept" to suppress auto-promotion.

**How to avoid:**

1. The mutator must add a `source: 'fixture-mutator-uat-47b'` field to the quarantine entry it creates. `quarantine-append.mjs` should check for this field and suppress the `quarantine:ready-for-promotion` label for entries with `source` matching a known-synthetic pattern.
2. Alternative if modifying `quarantine-append.mjs` is out of scope: immediately after the synthetic quarantine entry is created, manually add a `quarantine:hold-promotion` label (create the label if it doesn't exist) and make `quarantine-append.mjs`'s promotion step skip entries with this label.
3. The UAT-47-b runbook must include a post-loop cleanup step: remove the synthetic entry from `TEST_CASES_QUARANTINE` by reverting the `quarantine-append` mutation, then push the cleanup to main. The loop proof is captured BEFORE the cleanup.
4. Vitest test: assert that a synthetic quarantine entry with `source: 'fixture-mutator-uat-47b'` does NOT trigger the `quarantine:ready-for-promotion` label add in `quarantine-append.mjs`.

**Warning signs:**

- `quarantine:ready-for-promotion` appears on a case ID matching the mutator's synthetic case ID within 3 days of the mutator run.
- `tests/test-cases.js` gains the synthetic case ID without the operator deliberately promoting it.

**Phase to address:**

Fixture-mutator phase, as a design constraint on the mutator's quarantine entry creation. The `source` field suppression must be implemented in the SAME commit as the mutator.

---

### Pitfall 9: Operator interference invalidates the loop's autonomous credibility — "first real fix" proof is lost

**What goes wrong:**

The v4.2 DoD requires at least one real production fix shipped through the loop end-to-end WITHOUT operator intervention. The value of the proof is in the loop working UNATTENDED: the cron fires, the rerun confirms the failure, triage classifies, an issue is filed, `auto-fix.mjs` dispatches, the LLM proposes a fix, the verifier-gate approves, a human merges the DRAFT PR (this one human touch is expected and preserved), and the auto-promote workflow closes the loop.

Operator interference modes that invalidate the proof:
1. **Operator manually triages** the issue before `run-triage-pipeline.mjs` runs → the triage classification is human, not LLM-sourced.
2. **Operator manually applies the fix** and merges without going through `v40-auto-fix.yml` → the auto-fix PR is never opened; no loop evidence.
3. **Operator manually adds `triage` label** to an issue that was not produced by the nightly pipeline → the issue is synthetic (from a known source), not a real production anomaly.
4. **Operator closes the draft auto-fix PR and re-opens a hand-edited version** → the LLM fix was superseded; the merged PR is human-authored.

**Why it happens:**

The "first real fix" phase is a wait-and-observe phase. Operators who are used to being active agents find it uncomfortable to watch a pipeline work slowly without intervening. The first anomaly that appears will be tempting to "help."

**How to avoid:**

1. The phase plan must explicitly state: "Do NOT touch the issue, do NOT manually label it, do NOT edit the draft PR. The only human action in the loop is merging the auto-fix:verified draft PR."
2. Before the observational wait begins, verify the pipeline is fully wired: the nightly cron is scheduled, `run-triage-pipeline.mjs` is wired into the nightly job, `v40-auto-fix.yml` is active, `v40-verifier-gate.yml` will fire on auto-fix PRs. A pre-flight checklist, not a hope.
3. Capture the GitHub Actions run IDs of every step in the loop as the evidence artifact. A human can LOOK at the run logs without interfering. The evidence is: nightly-run-ID → triage-pipeline-run-ID → auto-fix-run-ID → verifier-gate-run-ID → PR URL → merge event.
4. Set a wait boundary: "We will observe for N days. If no real anomaly surfaces, the deterministic fixture-mutator (UAT-47-b) serves as the proof-of-life." This prevents indefinite waiting.

**Warning signs:**

- An issue is manually labeled `triage` (not by the `e2e-nightly.yml` bot via `run-triage-pipeline.mjs`).
- The auto-fix PR body does NOT contain the `<!-- affected_cases: ... -->` HTML comment (means the PR was created manually, not by `v40-auto-fix.yml`).
- The `verifier-gate` check does not appear in the PR's status check rollup (means the PR was not opened from an `auto-fix/*` branch).

**Phase to address:**

"First real fix" sourcing phase. The runbook must include the pre-flight checklist AND the explicit prohibition on intervention. The observational wait must have a hard timeout (e.g., 7 days) after which the mutator proof-of-life substitutes.

---

### Pitfall 10: Live UAT evidence pollution — test PRs, test branches, and test ledger entries written to production history are indistinguishable from real loop artifacts

**What goes wrong:**

The 4-UAT live re-sweep (UAT-47-a, 47-b, 47-d, 47-e) runs against `origin/main` and produces real artifacts: GitHub PRs, merged commits, ledger entries, and quarantine changes. These artifacts are permanent in the production history and the committed `llm-spend-ledger.json`.

Specific contamination risks:
- **UAT-47-a** opens an auto-fix PR for issue #3. If the PR is merged (to satisfy the UAT), the promotion workflow fires and promotes the quarantine entry to golden. This is a real promotion of a test case that may not be a genuine production regression.
- **UAT-47-d** triggers the ledger-snapshot workflow. The snapshot commit is on `main` with a `[skip ci]` tag. It is indistinguishable from a real production snapshot in the git log.
- **UAT-47-e** opens and closes a branch designed to verify diff-guard rejection. The branch exists on `origin` briefly. If any part of the close fails (e.g., `gh pr close` succeeds but `git push origin --delete` fails), the branch remains on origin.
- **Ledger entries** from UAT runs carry `phase: '56-uat'` (if wired correctly) or `phase: null` (if the wiring is wrong). Ledger entries with `phase: null` violate the schema contract (see v4.1 Pitfall 5 prior) and corrupt the `phaseTotal` aggregation.

**Why it happens:**

Live UAT against a production repo is inherently contaminating. The v4.0 milestone explicitly deferred these UATs to avoid this ("live UAT against pushed state is a separate readiness gate"). The contamination cannot be avoided, but it must be bounded.

**How to avoid:**

1. UAT-47-a: do NOT merge the auto-fix PR if the goal is only to verify the PR was opened and the verifier-gate fired. Keep it draft, capture the evidence (PR URL, verifier-gate run ID, `auto-fix:verified` label presence), then CLOSE the PR without merging. This avoids triggering auto-promote.
2. UAT-47-d: the snapshot commit is unavoidable. Add a UAT marker to the commit message: `[skip ci] [uat-47-d] ledger snapshot ...` — this makes it distinguishable in git log.
3. UAT-47-e: the close-and-delete step must be in the runbook as atomic steps with explicit error handling: `gh pr close <N> && git push origin --delete <branch> || echo "BRANCH DELETE FAILED — manual cleanup required: git push origin --delete <branch>"`.
4. Ledger entries from UAT runs: all UAT runs that invoke `auto-fix.mjs` must pass `--force-api` AND have `E2E_LEDGER_PATH_OVERRIDE` set to a temp path, OR the entries must carry a `phase: '56-uat'` tag so they are filterable. The phase-tag approach is preferable (entries on disk, filterable by analysis scripts).
5. Vitest Test 48 (the committed-ledger bootstrap assertion) will fail if UAT runs write to the committed ledger without a phase tag. Add a post-UAT step: reset the committed ledger to bootstrap-only state by reverting any UAT-sourced entries, then commit the clean ledger with `[skip ci] [post-uat cleanup]`.

**Warning signs:**

- `gh pr list --state all --label 'auto-fix'` shows UAT-sourced PRs mixed with production auto-fix PRs with no distinguishing marker.
- `jq '.months | .. | .iterations[] | select(.phase == null)' tests/e2e/.llm-spend-ledger.json` returns results after a UAT run (phase-null entries = untagged UAT contamination).
- `git log --oneline | grep 'ledger snapshot'` shows multiple snapshots in one day (UAT-47-d triggered on top of the real daily cron).

**Phase to address:**

4-UAT re-sweep phase. The runbook for each UAT must include: (a) pre-run state snapshot, (b) UAT execution with tagging, (c) post-run evidence capture, (d) cleanup procedure for artifacts that should not persist.

---

### Pitfall 11: UAT-47-d's verifier-gate dependency on a pending ledger-snapshot merge — if the snapshot PR hasn't merged, UAT-47-d's success criterion is unverifiable

**What goes wrong:**

UAT-47-d verifies that the ledger-commit refactor works correctly: the daily snapshot creates a `ledger-snapshots/*` PR, the PR auto-merges (after verifier checks pass), and the committed ledger on `main` reflects the snapshot. If the UAT is run within the cron window but BEFORE the snapshot PR's checks complete and auto-merge fires, the success criterion ("ledger on main matches the snapshot") cannot be verified.

Timing dependency: the cron fires at 02:00 UTC. The snapshot PR's checks take ~1–5 minutes. Auto-merge fires when checks pass. If UAT-47-d is run at 02:01 UTC (before the PR merges), `main` still shows the old ledger. UAT verifies the WRONG state.

**Why it happens:**

UAT runbooks typically say "trigger the workflow and verify the result." But when the result depends on a subsequent async event (PR auto-merge), the runbook needs an explicit wait step.

**How to avoid:**

1. UAT-47-d runbook must include an explicit wait: `gh pr list --head 'ledger-snapshots/*' --json number,state,mergeStateStatus --jq '.[] | select(.state=="open")'` — loop until empty (PR merged) before asserting the ledger state on `main`.
2. Alternatively, trigger via `workflow_dispatch` (not the real cron) and wait for the dispatch run to complete: `gh run watch <run-id>`. Only then check the PR state.
3. The UAT does NOT need to be run during the real cron window. `workflow_dispatch` is available and preferred for testing — it produces the same artifacts without depending on the 02:00 UTC schedule.

**Warning signs:**

- UAT-47-d verifies the ledger state on `main` immediately after the snapshot workflow run completes, before the auto-merge fires — the old ledger content is present and the UAT incorrectly "fails."
- The snapshot PR exists in open state when UAT-47-d asserts that the ledger on main is up to date.

**Phase to address:**

4-UAT re-sweep phase, specifically in the UAT-47-d runbook. Add a "wait for PR merge" step as a numbered item.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Apply ledger-commit refactor to BOTH `v40-cost-ledger-snapshot.yml` and `v40-auto-fix.yml` | Consistent pattern across all workflows | Destroys the two-commit split; every auto-fix PR is diff-guard-rejected permanently | Never; scope the refactor to snapshot-only |
| Add `errorClass` to `makeEntry()` test helper but skip wiring to `auto-fix.mjs` call sites | Tests pass immediately | `a-b-winner.mjs` stays in abstention forever; dashboard fields are null | Never; wire all 7 call sites in the same commit |
| Add the CI guard to `appendLedgerEntry` body (global chokepoint) | Single fix location | Breaks all 33 Vitest ledger tests that use tmp paths without CI=true | Never; guard at the `auto-fix.mjs` call sites |
| Let the mutator target `tests/fixtures/` or `tests/golden/baseline.json` | Easier failure injection | Auto-fix PR blocked by diff-guard; loop cannot complete | Never; mutator must target `src/` only |
| Merge the UAT-47-a draft PR to "fully test" the auto-promote flow | Complete end-to-end coverage | Promotes a synthetic quarantine entry to the golden corpus permanently | Only if the synthetic case is also a genuine production regression worth keeping in golden |
| Declare the "first real fix" from a manually-triggered issue | Avoids waiting | The loop's autonomous credibility is unproven; future product claims about the loop are unsupported | Never; the value requires the full unattended pipeline path |
| Accept `phase: null` ledger entries from UAT runs | No extra wiring | Corrupts `phaseTotal`; violates Test 48 schema contract; makes UAT entries indistinguishable from production entries | Never; UAT runs must carry `phase: '56-uat'` or be written to a temp ledger |
| Skip post-UAT ledger cleanup | Saves one cleanup step | Test 48 fails at next `npm test`; UAT cost entries inflate the production spend dashboard | Only if UAT entries carry `phase: '56-uat'` and dashboard filters them out cleanly |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| `v40-auto-fix.yml` two-commit split + ledger-commit refactor | Redirect the auto-fix ledger commit to `ledger-snapshots/*` to match the snapshot refactor | Keep auto-fix ledger commit as direct push to `main`; only redirect the cost-ledger-snapshot workflow |
| `appendLedgerEntry` schema extension with 7 call sites in `auto-fix.mjs` | Wire `errorClass` only in the "happy path" call site at Step 10 | Wire `errorClass` into all 7 call sites (lines 295, 391, 546, 589, 685, 707, 744 per current code); verify with grep count |
| `a-b-winner.mjs` outcome probe on mixed-schema ledger | Count all entries with matching `ERROR_CLASS` in the N-per-arm denominator | Filter to `entry.errorClass !== undefined && entry.outcome !== undefined` before counting |
| Quarantine auto-promotion during UAT-47-b | Synthetic case reaches `stable_runs >= 3` and gets promoted before cleanup | Add `source: 'fixture-mutator-uat-47b'` to synthetic entry; suppress auto-promotion for this source pattern |
| Fingerprint collision between synthetic mutator case and existing quarantine entry | Mutator targets the most obvious failing test case, which is already quarantined | Pre-flight check: `gh issue list --label <fingerprint>` must return 0 results; choose a case ID not in quarantine |
| `diff-guard` job in verifier-gate running on `ledger-snapshots/*` PRs | Ledger file in PR diff fails the FORBIDDEN_PATHS check | Add scope-decision step to `diff-guard` job: exit 0 if `github.head_ref` does not match `auto-fix/*` |
| UAT evidence capture vs auto-merge timing for UAT-47-d | Assert ledger state on `main` immediately after snapshot workflow completes | Wait for `ledger-snapshots/*` PR to auto-merge before asserting; use `gh pr list --state open` loop |
| `invokeClaudePWithLedger` vs `invokeAnthropicSdkWithLedger` guard scope | Assume the `invokeAnthropicSdkWithLedger` guard covers all ledger writes | The guard covers only that wrapper; `auto-fix.mjs` direct writes to `LEDGER_PATH` are a separate surface |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| 365 `ledger-snapshots/*` PRs/year with full verifier-gate runs | Each snapshot PR triggers 3×affected-case + 76-case regression (~8 min); CI queue is saturated daily | Add scope-decision fast-path to verifier-gate for non-`auto-fix/*` branches | Day 1 after the refactor if scope guard is omitted |
| Mixed-schema `a-b-winner.mjs` denominator counting all-time entries | `NO_WINNER_YET` persists after 100+ runs; no winner is ever declared | Filter to entries with both `errorClass` and `outcome` present; add minimum-N pre-check before the filter | After schema extension ships with old entries still in ledger |
| Concurrency: auto-fix workflow fires during a live UAT | UAT branch (`auto-fix/3-fingerprint`) exists on origin; idempotency check skips the real auto-fix run silently | UAT-47-a runbook: verify branch absent on origin before triggering; close test branch immediately after UAT | Any time a UAT-47-a run leaves its branch open on origin |
| Nightly cron + `workflow_dispatch` double-fire for UAT-47-d | Two snapshot PRs open simultaneously; both try to commit the same ledger state | Use `workflow_dispatch` ONLY for UAT-47-d; do not trigger during the 02:00 UTC cron window | Monday 02:00 UTC ± 5 minutes |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| `auto-fix.mjs` direct `appendLedgerEntry(LEDGER_PATH)` writes with no CI guard | A local dev run (non-CI) with `--force-api` writes production-ledger entries with `source: 'auto-fix-api'` and potentially PII from the issue body | Add CI guard at all 7 call sites in `auto-fix.mjs`; never call the direct path without `CI=true || E2E_LEDGER_PATH_OVERRIDE` |
| Fixture-mutator committed to main and accidentally triggered in CI | If `npm test` or the nightly cron runs the mutator, the src/ defect is injected into the production pipeline permanently | Mutator must not be referenced from `package.json` scripts, `npm test`, or any YAML workflow; gate on explicit `node scripts/mutator.mjs --run` invocation only |
| UAT-47-e bypass-attempt PR accidentally gains `auto-fix:verified` label | If the crafted PR body contains the `affected_cases` HTML comment in the correct format, the verifier-gate's ready-flip job may apply the label | UAT-47-e must use a PR body that intentionally LACKS the `affected_cases` comment — the goal is to verify the gate REJECTS it, not to create a valid-looking bypass |

---

## "Looks Done But Isn't" Checklist

- [ ] **Ledger-commit refactor scope:** Often extended to `v40-auto-fix.yml` for consistency — verify `grep -c 'git push origin main' .github/workflows/v40-auto-fix.yml` still equals 1 after the refactor commit.
- [ ] **`errorClass` wiring in auto-fix.mjs:** Often wired only at the Step 10 happy path — verify `grep -c 'errorClass' scripts/auto-fix.mjs` equals at least 7 (one per `appendLedgerEntry` call site).
- [ ] **`a-b-winner.mjs` mixed-schema filter:** Often reads all entries without filtering — verify `grep -n 'errorClass !== undefined\|errorClass != null' scripts/a-b-winner.mjs` returns at least one result.
- [ ] **Mutator target path:** Often targets `tests/fixtures/*.json` or `tests/golden/baseline.json` — verify `node scripts/mutator.mjs --dry-run | grep 'files changed'` shows only `src/` paths.
- [ ] **Mutator fingerprint pre-flight:** Often skipped — verify the mutator's `run()` function calls `gh issue list --label <fingerprint>` and aborts if results are non-empty.
- [ ] **Synthetic quarantine entry suppression:** Often omitted — verify `quarantine-append.mjs` does NOT add `quarantine:ready-for-promotion` when entry has `source: 'fixture-mutator-uat-47b'`.
- [ ] **Leak-vector guard location:** Often added to `appendLedgerEntry` body — verify `npm test` passes all 33+ `llm-ledger.test.js` cases after the hardening commit; if they fail, the guard is in the wrong place.
- [ ] **UAT evidence capture vs auto-merge timing:** Often asserted immediately after workflow completion — verify UAT-47-d runbook includes a "wait for PR merge" step before checking ledger state on `main`.
- [ ] **Post-UAT ledger cleanup:** Often skipped — verify `jq '[.months[][].iterations[] | select(.phase == null)]' tests/e2e/.llm-spend-ledger.json | length` returns 0 after all UATs complete.
- [ ] **diff-guard scope on `ledger-snapshots/*` PRs:** Often not addressed — verify `v40-verifier-gate.yml` diff-guard job contains a `github.head_ref` scope guard step exiting 0 for non-auto-fix branches.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Auto-fix ledger commit redirected to `ledger-snapshots/*` — all auto-fix PRs blocked by diff-guard | HIGH | (1) Revert the refactor commit that touched `v40-auto-fix.yml`. (2) Verify `git push origin main` is restored in the ledger-commit step. (3) Close any auto-fix PRs that were blocked during the outage (they will be re-triggered by the next `triage` label add). (4) Audit the git log for any `ledger-snapshots/*` branches created by the auto-fix workflow — delete them. |
| `errorClass` missing from auto-fix.mjs call sites — `a-b-winner.mjs` in permanent abstention | MEDIUM | (1) Identify which of the 7 call sites are missing the field (grep the current source). (2) Add `errorClass` to each missing site in a single additive commit. (3) Verify with grep count. (4) A/B winner will automatically exit abstention on the next run once the live ledger accumulates N>=20 entries per arm per class. No data repair needed (old entries simply don't have the field; the filter skips them). |
| Guard added to `appendLedgerEntry` — 33 tests fail | MEDIUM | (1) Revert the guard from `appendLedgerEntry`. (2) Add the guard to `scripts/auto-fix.mjs` call sites instead (Pitfall 7 correct approach). (3) Run `npm test` to confirm all 33 cases pass. Recovery is low-risk — `appendLedgerEntry` body edit is a 1-commit revert. |
| Fixture-mutator targets `tests/golden/baseline.json` — auto-fix PR permanently blocked | HIGH | (1) Revert the mutator commit that modified the golden baseline. (2) Regenerate the baseline from the unmodified fixtures. (3) Verify `npm test` exits 0. (4) Redesign the mutator to target `src/` only before re-running UAT-47-b. |
| Synthetic quarantine entry promoted to golden | MEDIUM | (1) Remove the synthetic case ID from `tests/test-cases.js` (revert the promotion commit or manually edit). (2) Re-run `npm test` to confirm baseline is unaffected. (3) Remove the `quarantine:ready-for-promotion` label from the issue. (4) Add the `source` suppression to `quarantine-append.mjs` before re-running the mutator. |
| UAT evidence pollution — untagged ledger entries, stray branches on origin | LOW | (1) Delete stray `auto-fix/*` or `ledger-snapshots/*` branches: `git push origin --delete <branch>`. (2) Close any open test PRs. (3) Revert UAT-sourced ledger entries (reset committed ledger to pre-UAT state or strip entries where `phase === 'null'`). (4) Push cleanup with `[skip ci]`. |
| `diff-guard` rejecting all `ledger-snapshots/*` PRs | MEDIUM | (1) Add scope-decision step to `diff-guard` job (Pitfall 2 prevention). (2) Push the fix to `main` via the break-glass runbook (§7). (3) Re-open any accumulated rejected snapshot PRs — they will now pass the fast-path scope check. |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1. Ledger-commit refactor scope — auto-fix.mjs two-commit split must not be redirected | Ledger-commit refactor phase | `grep -c 'git push origin main' .github/workflows/v40-auto-fix.yml` = 1 after refactor |
| 2. Branch-redirect requires scope guard on diff-guard for non-auto-fix PRs | Ledger-commit refactor phase | `ledger-snapshots/*` PR: all status checks show SUCCESS in <2 minutes; diff-guard passes without running FORBIDDEN_PATHS check |
| 3. Schema extension — all 7 auto-fix.mjs call sites must carry `errorClass` | Ledger schema extension phase | `grep -c 'errorClass' scripts/auto-fix.mjs` ≥ 7; integration test asserts emitted ledger entry has `errorClass` field |
| 4. Mixed-schema ledger — `a-b-winner.mjs` must filter to entries with both fields | Ledger schema extension phase | `grep -n 'errorClass !== undefined' scripts/a-b-winner.mjs` returns ≥1; Vitest test with mixed-schema fixture passes |
| 5. Mutator targets FORBIDDEN_PATHS — must target `src/` only | Fixture-mutator phase | Mutator dry-run output shows only `src/` paths; no `tests/fixtures/` or `tests/golden/` files |
| 6. Fingerprint collision between synthetic case and quarantine entry | Fixture-mutator phase | Mutator pre-flight: `gh issue list --label <fingerprint>` = 0 results; chosen case ID absent from TEST_CASES_QUARANTINE |
| 7. Leak-vector guard added to `appendLedgerEntry` body breaks 33 tests | Leak-vector hardening phase | `npm test` passes all 33 llm-ledger tests; guard grep shows it is in `auto-fix.mjs` scope, not `appendLedgerEntry` |
| 8. Synthetic quarantine entry auto-promotes before loop proof captured | Fixture-mutator phase | `quarantine-append.mjs` test asserts no `quarantine:ready-for-promotion` for `source: 'fixture-mutator-uat-47b'` entries |
| 9. Operator interference invalidates autonomous loop proof | First-real-fix sourcing phase | Runbook explicitly prohibits manual triage/labeling; evidence chain shows all steps driven by scheduled cron + automated workflows |
| 10. Live UAT evidence pollution in production history | 4-UAT re-sweep phase | Post-UAT cleanup: no untagged phase-null entries in committed ledger; stray branches deleted; test PRs closed |
| 11. UAT-47-d asserts ledger state before auto-merge fires | 4-UAT re-sweep phase | Runbook includes "wait for `ledger-snapshots/*` PR to merge" as numbered step before assertion |

---

## Sources

- Direct code inspection: `scripts/auto-fix.mjs` (7 `appendLedgerEntry` call sites at lines 295, 391, 546, 589, 685, 707, 744; two-commit split architecture lines 150–172 of `v40-auto-fix.yml`)
- Direct code inspection: `.github/workflows/v40-cost-ledger-snapshot.yml` (direct `git push` to main at line 91; `contents: write` permission; `[skip ci]` commit pattern)
- Direct code inspection: `.github/workflows/v40-auto-fix.yml` header (two-commit split rationale, lines 6–11; ledger-commit step at lines 150–172)
- Direct code inspection: `tests/e2e/lib/llm-ledger.js` lines 592–617 (`combinedMonthlyTotalByTransport` transport grouping logic; `appendLedgerEntry` signature at line 686 — permissive spread, no required-field validation)
- Direct code inspection: `tests/e2e/test-cases-quarantine.js` (two entries with `stable_runs: 3`; `source_triage_finding_id` present; no `source` suppression field)
- Direct code inspection: `scripts/quarantine-append.mjs` (stable_runs threshold logic at line 220; READY_FOR_PROMOTION_LABEL at line 29; no source-based suppression)
- Direct code inspection: `scripts/auto-fix-promote.mjs` (`assertTripleGate` function body — unchanged from v4.1; `runPartialPromote` at line 200; no `appendLedgerEntry` call for promotion outcome event)
- Direct code inspection: `.github/workflows/v40-verifier-gate.yml` header (scope: `auto-fix/*` PRs; diff-guard as fail-fast job with no head_ref scope guard currently)
- `.planning/STATE.md` — Phase 51 closure: UAT-47-d "BLOCKED-BY-PHASE-50 (ruleset blocks ledger-commit push to main)"; Phase 53 closure: `assertTripleGate body byte-unchanged`
- `.planning/PROJECT.md` — Key Decisions: `_skipCiGuard:true` triple-gate; two-commit split pattern; FORBIDDEN_PATHS bank (6 locked paths)
- Memory: `project_auto_fix_ledger_leak_vector.md` — `scripts/auto-fix.mjs` writes via `source: 'auto-fix-api'` path bypassing `invokeAnthropicSdkWithLedger` guard; Phase 48 closure decision to guard at call sites
- Memory: `feedback_orchestrator_cwd_drift.md` — CWD drift can cause misread of `main` HEAD during mutator script git operations; use `-C $PRIMARY_WT` for any git spot-check inside mutator scripts
- Memory: `feedback_worktree_base_drift.md` — executor worktrees can branch from stale base; applies to any parallel phase wave in v4.2; verify `git merge-base` before merging
- `.planning/research-v4.1-archive/PITFALLS.md` — v4.1 Pitfall 5 (Test 48 leak root cause); Pitfall 8 (SUMMARY_KEYS contract); Pitfall 9 (UAT-47-a branch idempotency) — closed priors informing v4.2 design constraints

---
*Pitfalls research for: v4.2 Auto-Fix Loop Live — in-flight LLM-CI pipeline additions*
*Researched: 2026-06-04*

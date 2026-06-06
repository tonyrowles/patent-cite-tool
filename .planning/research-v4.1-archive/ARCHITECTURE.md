# Architecture Research — v4.1 Readiness Gate + Push

**Mode:** Architecture (integration mapping for subsequent milestone)
**Researched:** 2026-06-02
**Confidence:** HIGH — direct source inspection of all affected files; line-numbered analysis throughout

---

## 1. Integration Map: v4.1 Features onto the Existing Architecture

### 1.1 Pre-push Regression Fixes

Three pre-push blockers must be resolved before the `v4.0-integration` PR can pass CI.

**Test 48 Ledger Leak**

Root cause (confirmed by ledger inspection): The committed `tests/e2e/.llm-spend-ledger.json` now contains 4 real Opus calls totaling $0.451461 in `2026-06`, all with `transport: "sdk"` and `phase: null`. These were made via `invokeAnthropicSdkWithLedger` with `forceApi: true` at the local terminal WITHOUT setting `E2E_LEDGER_PATH_OVERRIDE`. The guard chain had a gap: `E2E_LEDGER_PATH_OVERRIDE` is checked in `llm-ledger.js` (LEDGER_PATH resolver at line 75), but the wrapper `invokeAnthropicSdkWithLedger` in `tests/e2e/lib/llm-driver.js` reads `LEDGER_PATH` as an imported binding — if `E2E_LEDGER_PATH_OVERRIDE` is not set before the process starts, `LEDGER_PATH` resolves to the committed path, and `appendLedgerEntry(LEDGER_PATH, ...)` writes to the committed file regardless of `forceApi` state.

The leak is NOT from unit tests. Unit tests in `auto-fix.test.js` and `warning-01-transport-tag.test.js` both use `vi.mock('../e2e/lib/llm-ledger.js', () => ({ LEDGER_PATH: '/tmp/test-ledger.json', ... }))` which correctly redirects. The leak is from a manual local invocation of `auto-fix.mjs --force-api` or equivalent without the env override.

**Architectural fix — two-layer lock-down:**

Layer 1 (defensive, no code change): Document that `forceApi: true` must always be preceded by `E2E_LEDGER_PATH_OVERRIDE=/tmp/test-ledger.json` in local dev. This relies on developer discipline — not sufficient alone.

Layer 2 (structural, code change in `llm-driver.js`): Add an explicit check inside `invokeAnthropicSdkWithLedger` at Step 0 (before the CI gate):

```javascript
// If forceApi:true AND not in CI, require E2E_LEDGER_PATH_OVERRIDE to be set
// so the committed ledger cannot be polluted by local forceApi runs.
if (forceApi && !inCi) {
  const override = process.env.E2E_LEDGER_PATH_OVERRIDE;
  if (!override || !override.trim()) {
    return {
      ok: false,
      errorReason: 'contract-error',
      errorMessage:
        'invokeAnthropicSdkWithLedger with forceApi:true requires ' +
        'E2E_LEDGER_PATH_OVERRIDE to be set (prevents committed ledger pollution). ' +
        'Example: E2E_LEDGER_PATH_OVERRIDE=/tmp/test-ledger.json node scripts/auto-fix.mjs --force-api',
    };
  }
}
```

This is additive and does not break any existing test (all tests that use `forceApi: true` mock `llm-ledger.js` entirely, so they never reach `appendLedgerEntry`). For Test 48, the committed ledger must be reset to the Phase 39 bootstrap state (single entry) by resetting the `2026-06` bucket. The test at `llm-ledger.test.js:999` expects exactly 1 bootstrap entry; the fix is to clean the ledger file, not weaken the test.

**Calendar-rollover flake in `e2e-weekly-digest.test.js:395`**

The test hardcodes `'2026-05'` as the expected month bucket. The fix is to either (a) use a dynamic current-month computation, or (b) use `vi.useFakeTimers()` to pin the date to a value the test expects. Option (b) is the established pattern in the test file — apply it to this test.

**`package-lock.json` EXACT-pin for `@anthropic-ai/sdk@0.100.1`**

The `package-lock.json` was reverted from EXACT to caret during Phase 43 merge. Fix: `npm install @anthropic-ai/sdk@0.100.1 --save-exact` then re-commit. The static-grep Vitest test in `tests/unit/llm-driver.test.js` already pins the exact version string; the lock file is the enforcement mechanism.

**Files modified:**
- `tests/e2e/lib/llm-driver.js` — new check at Step 0 of `invokeAnthropicSdkWithLedger` (extended, not new file)
- `tests/e2e/.llm-spend-ledger.json` — reset to single bootstrap entry (overwrite)
- `tests/e2e/scripts/e2e-weekly-digest.test.js:395` — fix hardcoded date (extended)
- `package-lock.json` — EXACT pin restored (overwrite via `npm install --save-exact`)

---

### 1.2 Push Workflow (`v4.0-integration` PR)

**Mechanics:** `main` has branch protection ruleset 17086676 with `Do not allow bypassing: ON` and `bypass_actors: [1]` (owner-self with `bypass_mode: always`). The `bypass_actors: [1]` entry is the tech-debt deferred from v4.0 — it means the repo owner CAN bypass the protection, enabling `gh pr merge --admin` self-merge as a one-time operation.

**Sequence:**
1. Create `v4.0-integration` branch from the current local HEAD (~777 commits ahead of `origin/main`).
2. Push branch: `git push origin v4.0-integration`.
3. `gh pr create --base main --head v4.0-integration --title "v4.0: Self-Healing Test Suite"`.
4. CI runs on the PR (the v4.0 workflows do NOT fire for v4.0-integration branches — they fire on `issues.labeled` and `pull_request` on `auto-fix/*` branches). CI = standard `ci.yml` suite (1134 tests + lint).
5. After CI green, `gh pr merge --admin --squash` (bypasses code-owner review via the `bypass_actors: [1]` entry — this is the exact use case the bypass was deferred for).
6. Post-merge: verify `origin/main` has the v4.0 workflows via `gh workflow list | grep V40`.

**Integration point:** The `required_status_checks` rule is ABSENT on ruleset 17086676 (CLEANUP-04 will add it post-push). Before CLEANUP-04, the ruleset only enforces code-owner review; the `gh pr merge --admin` bypass clears that gate.

**No new files.** This is a pure operational step — no code changes beyond what's already in the v4.0 commits. The CLEANUP-04 phase adds the `required_status_checks` binding via a single `gh api -X PUT`.

---

### 1.3 Live Readiness UATs (UAT-47-a/b/d/e)

These 4 runbook stubs (verbatim in `.planning/milestones/v4.0-phases/47-v4-0-cleanup/47-UAT-DEFERRED.md`) execute post-push in order:

**UAT-47-a** — End-to-end auto-fix on issue #3 (`US11427642-spec-short-1`, fingerprint `139f821b3bb1`). Integration point: `v40-auto-fix.yml` triggered by `triage` label add; `v40-verifier-gate.yml` triggered by the resulting `auto-fix/3-139f821b` branch push. Evidence: screenshot of PR opening + `gh run view --log` artifact.

**UAT-47-b** — Dep-PR pre-flight gate. Integration point: `v40-deps-update.yml` dispatched manually. Evidence: `gh pr checks <pr-n>` output showing `deps-update-gate` job status.

**UAT-47-d** — Ledger snapshot. Integration point: `v40-cost-ledger-snapshot.yml` dispatched manually. Evidence: `git log --oneline -1 origin/main` showing `[skip ci]` snapshot commit.

**UAT-47-e** — Verifier-gate diff-guard rejection. Integration point: `v40-verifier-gate.yml` on an `auto-fix/test-craftedbypass-*` branch touching `tests/golden/baseline.json`. Evidence: `gh pr checks` showing `diff-guard` FAILURE + PR label `human-review-required`.

**Evidence capture pattern** (mirrors v3.1 Phase 38-03): For each UAT, capture:
1. `gh run view <run-id> --log > uat-<n>-run-log.txt` (workflow log)
2. `gh pr view <pr-n> --json labels,isDraft,state` (JSON dump)
3. Screenshot or `gh api` result confirming the observable state

Re-stamp status: UAT outcomes are recorded in `.planning/milestones/v4.0-phases/47-v4-0-cleanup/47-UAT-DEFERRED.md` — change each stub's `**Status:** DEFERRED` to `**Status:** PASS` (or `PARTIAL` with notes) inline in the file. The Vitest static-grep guard at `tests/unit/uat-deferred-runbook.test.js` pins the file structure but does NOT assert DEFERRED status — it pins the 4 section headers and the fingerprint `139f821b3bb1`. Updating status to PASS is safe without a test change.

**No new files.** Evidence is appended inline to the existing stub file. A brief log/JSON artifact per UAT may be dropped in `.planning/milestones/v4.0-phases/47-v4-0-cleanup/uat-evidence/` as a new directory (pure planning artifact, not code).

---

### 1.4 CLEANUP-04 Ruleset Patch

**Operation:** Single `gh api -X PUT` call to update ruleset 17086676.

```bash
gh api -X PUT /repos/{owner}/{repo}/rulesets/17086676 \
  --input - <<'JSON'
{
  "required_status_checks": {
    "strict": false,
    "checks": [
      { "context": "verifier-gate" },
      { "context": "deps-update-gate" }
    ]
  }
}
JSON
```

The context names `"verifier-gate"` and `"deps-update-gate"` are slot-reserved in:
- `v40-verifier-gate.yml` line 181: job name `verifier-gate:` with comment `# NAMED EXACTLY 'verifier-gate' — Phase 47 CLEANUP-04 required-status-check slot`
- `v40-deps-update.yml`: `deps-update-gate` job (analogously reserved)

**Verification:** After the PUT, `gh api GET /repos/{owner}/{repo}/rulesets/17086676 | jq '.required_status_checks'` must show both context names. A new Vitest static-grep test pins this by asserting both strings appear in the ruleset's committed documentation (`docs/v40-repo-config.md` or equivalent).

**Bypass resolution:** The CLEANUP-04 phase also removes `bypass_actors: [1]` (owner-self bypass). After the integration PR merges, the bypass is no longer needed. A second `gh api -X PUT` invocation removes the bypass entry. Verification: `gh api GET /repos/{owner}/{repo}/rulesets/17086676 | jq '.bypass_actors'` must return empty or omit the owner-self entry.

**Files modified/created:**
- `docs/v40-repo-config.md` — updated to document the new `required_status_checks` entries (extended)
- `tests/unit/codeowners.test.js` — add static-grep assertions for the two context names (extended)

---

### 1.5 Auto-Fix Dashboard

**Integration target:** `scripts/weekly-digest.mjs` — specifically `aggregateBySummaryKey` and `renderDigest`.

**Current state of `aggregateBySummaryKey`** (lines 171-214 of `scripts/weekly-digest.mjs`): Takes `{ nightlyIssues, quarantineIssues, monthlyTotalCostUsd }` and returns a SUMMARY_KEYS-shaped tally over open GitHub issues. The `SUMMARY_KEYS` contract is frozen at 7 keys (`wrong_citation`, `verifier_disagree`, `llm_hallucinated_selection`, `llm_api_error`, `harness_error`, `passed`, `total_cost_usd`).

**What v4.1 adds:** A new auto-fix metrics section in the weekly digest. The data sources are:
1. Committed ledger (`tests/e2e/.llm-spend-ledger.json`) — already read via `readLedger(LEDGER_PATH)` in `renderCostLine`. v4.1 adds an `aggregateAutoFixMetrics(ledger)` helper that scans `transport: 'sdk'` entries with `source: 'auto-fix-api'` to compute: total auto-fix attempts, total auto-fix cost, average cost per fix attempt.
2. Closed PRs with `auto-fix:verified` label — `gh api /repos/{owner}/{repo}/pulls?state=closed&labels=auto-fix:verified` — to compute: total verified fixes merged, time-to-merge (PR opened_at → merged_at), success rate (verified / total opened with `auto-fix:opened`).

**Additive constraint:** `SUMMARY_KEYS` must NOT change. The auto-fix section is a NEW section added to `renderDigest` AFTER the existing sections — purely additive, the `≤50 lines` guard is the binding constraint. If adding the section would exceed 50 lines, the section uses a compact single-line summary rather than a table.

**Contract:** The new `aggregateAutoFixMetrics` function is a pure function in `scripts/weekly-digest.mjs` (co-located with `aggregateBySummaryKey`, same module, no new file needed). The real `gh` client gains one new method `listClosedPullsByLabel(label)` analogous to `listOpenIssuesByLabel(label)`.

**Files modified:**
- `scripts/weekly-digest.mjs` — add `aggregateAutoFixMetrics` pure function + `renderAutoFixSection` helper + extend `renderDigest` + extend `makeRealGhClient` with `listClosedPullsByLabel` (extended, not new file)
- `tests/e2e/scripts/e2e-weekly-digest.test.js` — new test cases for the auto-fix aggregator (extended)

---

### 1.6 `auto-fix:partial-verified` Semantics

**Load-bearing concern from v4.0:** The v4.0 all-or-nothing gate in `v40-verifier-gate.yml` requires ALL 3 consecutive runs on ALL affected cases to pass at Tier A or B. A PR with 5 affected cases where 3 pass and 2 fail stays in draft indefinitely. `auto-fix:partial-verified` would allow a configurable threshold (e.g., N/M affected cases pass) to advance the PR for human review with a partial-verified label.

**Where the gate lives (current):** The gate decision is in `v40-verifier-gate.yml` job `verifier-gate`, specifically the `Verify affected cases 3x consecutively` step (lines 242-290). The ALL_PASS check is at line 279-281. The ready-flip is in job `ready-flip` which applies `auto-fix:verified` ONLY when ALL jobs pass.

**Where partial-verified belongs:**

Option A (workflow-only): Modify `v40-verifier-gate.yml` to add a 5th step in the `ready-flip` job that checks if the pass count meets a threshold. Apply `auto-fix:partial-verified` label when N/M (e.g., N >= 3 out of M) cases pass. The `v40-auto-promote.yml` workflow filter at line 67 currently only watches `auto-fix:verified`; it would gain a second OR branch watching `auto-fix:partial-verified` for the subset of cases that passed.

Option B (script gate in `assertTripleGate`): Add a 4th optional leg to `assertTripleGate` in `scripts/auto-fix-promote.mjs` that accepts `auto-fix:partial-verified` as an alternative to `auto-fix:verified` but requires an additional `partialPassRatio` argument and gates on a minimum ratio (e.g., ≥0.6). The triple-gate remains structurally intact; `partial-verified` is a different trust posture on the same gate axis (verified label + merged + triage-sourced). The `v40-auto-promote.yml` workflow filter widens to include both labels.

Option C (both): Workflow adds the partial-verified label producer (Option A), auto-promote gains the new filter, and `assertTripleGate` gains the 4th optional leg for auditability (Option B). Option C provides defense in depth.

**Recommendation: Option C.** The workflow-level check is the first gate; the `assertTripleGate` leg is the auditable, Vitest-covered invariant. If the v4.1 live UAT (UAT-47-a post-push) produces data showing a partial-pass ratio, the threshold can be calibrated empirically before committing to the semantics. For v4.1, the threshold default should be `>= ceil(M * 0.6)` (at least 60% of affected cases pass, rounding up).

**Trust invariant analysis:** `partial-verified` lowers the evidence bar compared to `verified` but does NOT remove the human gate. A `partial-verified` PR still requires HUMAN merge; the difference is only whether 100% vs ≥60% of affected cases passed the verifier. The `auto-promote` workflow, if it fires on `partial-verified`, promotes only the subset of cases that passed — not the failing ones. This is safe: the failing cases stay in quarantine and remain candidates for re-filing.

**Files modified/created:**
- `tests/e2e/lib/llm-driver.js` — no change (already ships `auto-fix:verified` as the label string used by the gate; the label NAME is in the workflow YAML, not the driver)
- `.github/workflows/v40-verifier-gate.yml` — add partial-verified label producer in `ready-flip` job (extended)
- `.github/workflows/v40-auto-promote.yml` — widen job-level `if:` filter to accept `auto-fix:partial-verified` (extended); add case-id subset filtering
- `scripts/auto-fix-promote.mjs:assertTripleGate` — add optional `partialVerified: boolean` parameter; when true, accept either `auto-fix:verified` OR `auto-fix:partial-verified` on Leg 1 (extended)
- `tests/unit/auto-fix-promote.test.js` — new cases for the `partial-verified` Leg 1 branch (extended)
- `tests/unit/v40-verifier-gate-yaml.test.js` — new YAML-contract cases pinning the partial-verified producer step (extended)
- `tests/unit/v40-auto-promote-yaml.test.js` — new YAML-contract cases pinning the widened filter (extended)

---

### 1.7 Multi-Model A/B

**Integration target:** `tests/e2e/lib/llm-driver.js:invokeAnthropicSdkWithLedger` — currently has `model = 'claude-sonnet-4-6'` as default. The ledger already has a `model` field per entry (confirmed in ledger JSON); `fix-prompt-builder.js` returns `{ok: true, systemPrompt, userPrompt}` (no model field today).

**Desired change:** Route difficult ERROR_CLASSes to `claude-opus-4-7` while simple classes default to `claude-sonnet-4-6`. The routing should be a static table, not dynamic A/B randomness, so that the ledger data is interpretable (deterministic model assignment per class enables apples-to-apples comparison across multiple issues of the same class).

**Routing module:** New pure-function module `tests/e2e/lib/llm-router.js`:

```javascript
// Static routing table: ERROR_CLASS → model string.
// Defaults to 'claude-sonnet-4-6' for all classes; upgrade specific classes
// after empirical baseline from UAT-47-a confirms which classes benefit.
export const MODEL_ROUTES = Object.freeze({
  // Phase 42 default: WRONG_CITATION stays on Sonnet until A/B data arrives
  WRONG_CITATION: 'claude-sonnet-4-6',
  LLM_HALLUCINATED_SELECTION: 'claude-sonnet-4-6',
  WORKER_FALLBACK_FAILED: 'claude-sonnet-4-6',
  GOOGLE_DOM_DRIFT: 'claude-sonnet-4-6',
  HARNESS_ERROR: 'claude-sonnet-4-6',
});

export function routeModel(errorClass, overrideModel = null) {
  if (overrideModel) return overrideModel;
  return MODEL_ROUTES[errorClass] ?? 'claude-sonnet-4-6';
}
```

**`fix-prompt-builder.js` change:** `buildFixPrompt` return value gains an optional `model` field:

```javascript
return { ok: true, systemPrompt, userPrompt, model: routeModel(errorClass) };
```

This requires importing `routeModel` from `llm-router.js` inside `fix-prompt-builder.js`. The D-04 purity invariant must be respected: `llm-router.js` must itself be pure (no I/O, no env reads), which it is by design. The ESLint purity guard for `fix-prompt-builder.js` forbids `node:fs`, `node:child_process`, `node:path`, and `@anthropic-ai/sdk` but does NOT forbid sibling lib imports — the import of `llm-router.js` is permitted.

**`auto-fix.mjs` change:** The dispatcher passes the `model` returned from `buildFixPrompt` into `invokeAnthropicSdkWithLedger({ model, ... })` instead of relying on the default.

**Winner-declaration script:** New `scripts/a-b-winner.mjs` that queries the committed ledger, groups entries by `(errorClass, model)`, computes pass rate and average cost per group (pass rate from the corresponding verifier-gate results, which are in the PR artifact JSON uploads — or approximated from `auto-fix:verified` label count vs `auto-fix:opened` count per model). Outputs a markdown table to stdout. Consumed by the operator after N issues per class have run.

**Files modified/created:**
- `tests/e2e/lib/llm-router.js` — NEW pure-function module
- `tests/e2e/lib/fix-prompt-builder.js` — add `model` field to return value (extended)
- `scripts/auto-fix.mjs` — pass `model` from `buildFixPrompt` to `invokeAnthropicSdkWithLedger` (extended)
- `scripts/a-b-winner.mjs` — NEW script
- `tests/unit/llm-router.test.js` — NEW test file for the routing table
- `tests/unit/fix-prompt-builder.test.js` — extend to assert `model` field present in happy-path return (extended)

---

### 1.8 v3.1 Bookkeeping Cleanup

**What to do:**

1. Re-stamp 5 VERIFICATION.md / HUMAN-UAT.md files (confirmed closed in Phase 38-03 but frontmatter `status:` field not updated):
   - `32-UAT-EVIDENCE.md` → `status: passed`
   - `35-HUMAN-UAT.md` → `status: passed`
   - `36-HUMAN-UAT.md` → `status: passed`
   - `37-HUMAN-UAT.md` → `status: passed`
   - `38-UAT-EVIDENCE.md` → `status: passed`

2. Clear 3 orphan quick-task slug references from STATE.md deferred items (verified completed: `1-fix-off-by-2`, `2-fix-ci-commit`, `260412-fde-fix-spurious`). These are planning-file-only changes: remove the 3 rows from the `## Deferred Items` table in `.planning/STATE.md`.

No code changes. No test changes. Pure planning-file updates.

**Files modified:**
- The 5 HUMAN-UAT / VERIFICATION files in `.planning/phases/32-*/`, `.planning/phases/35-*/`, `.planning/phases/36-*/`, `.planning/phases/37-*/`, `.planning/phases/38-*/` — frontmatter `status:` key updated
- `.planning/STATE.md` — remove 3 orphan rows from Deferred Items table

---

## 2. Component Boundaries: New vs Extended

| Component | New / Extended | v4.1 Change |
|-----------|---------------|-------------|
| `tests/e2e/lib/llm-driver.js` | Extended | Add `forceApi` + `E2E_LEDGER_PATH_OVERRIDE` guard at Step 0 of `invokeAnthropicSdkWithLedger` |
| `tests/e2e/lib/llm-router.js` | **NEW** | Static `MODEL_ROUTES` table + `routeModel()` pure function |
| `tests/e2e/lib/fix-prompt-builder.js` | Extended | `buildFixPrompt` return gains `model` field via `routeModel(errorClass)` |
| `scripts/auto-fix.mjs` | Extended | Pass `model` from `buildFixPrompt` into `invokeAnthropicSdkWithLedger` |
| `scripts/weekly-digest.mjs` | Extended | Add `aggregateAutoFixMetrics` + `renderAutoFixSection` + `makeRealGhClient.listClosedPullsByLabel` |
| `scripts/a-b-winner.mjs` | **NEW** | Winner-declaration script over committed ledger + `auto-fix:verified`/`opened` label counts |
| `.github/workflows/v40-verifier-gate.yml` | Extended | `partial-verified` label producer in `ready-flip` job |
| `.github/workflows/v40-auto-promote.yml` | Extended | Widen `if:` filter to accept `auto-fix:partial-verified`; add case-id subset filtering |
| `scripts/auto-fix-promote.mjs:assertTripleGate` | Extended | Optional 4th leg: `partial-verified` accepted on Leg 1 when `partialVerified: true` |
| `tests/e2e/.llm-spend-ledger.json` | Reset | Remove 2026-06 real-call pollution; restore to single bootstrap entry |
| `tests/e2e/scripts/e2e-weekly-digest.test.js` | Extended | Fix calendar-rollover flake at line 395 |
| `package-lock.json` | Overwrite | Restore `@anthropic-ai/sdk@0.100.1` exact pin |
| `.planning/STATE.md` | Extended | Remove 3 orphan quick-task rows |
| 5 × phase HUMAN-UAT/VERIFICATION files | Extended | Frontmatter `status:` re-stamped |
| `docs/v40-repo-config.md` | Extended | Document new `required_status_checks` entries |

---

## 3. Data Flow Changes for v4.1

### 3.1 Ledger data flow (Test 48 fix)

Before (broken): `forceApi: true` local dev → `invokeAnthropicSdkWithLedger` → `appendLedgerEntry(LEDGER_PATH)` → writes to committed `tests/e2e/.llm-spend-ledger.json`

After (fixed): `forceApi: true` local dev → `invokeAnthropicSdkWithLedger` Step 0 checks `E2E_LEDGER_PATH_OVERRIDE` is set → if not set, returns `{ok:false, errorReason:'contract-error'}` → no ledger write

### 3.2 Auto-fix model routing data flow (multi-model A/B)

Before: `auto-fix.mjs` → `buildFixPrompt({errorClass})` → `{ok:true, systemPrompt, userPrompt}` → `invokeAnthropicSdkWithLedger({model: default})` → ledger entry with `model: 'claude-sonnet-4-6'`

After: `auto-fix.mjs` → `buildFixPrompt({errorClass})` → `{ok:true, systemPrompt, userPrompt, model}` → `invokeAnthropicSdkWithLedger({model})` → ledger entry with `model: routeModel(errorClass)` — queryable by `a-b-winner.mjs`

### 3.3 Partial-verified data flow

Before: `v40-verifier-gate.yml` → ALL cases pass → `ready-flip` applies `auto-fix:verified` → `v40-auto-promote.yml` fires

After: `v40-verifier-gate.yml` → ALL cases pass → `ready-flip` applies `auto-fix:verified` (unchanged path); OR SOME cases pass (≥60% threshold) → `ready-flip` applies `auto-fix:partial-verified` → `v40-auto-promote.yml` fires with subset of passing case IDs → `assertTripleGate` with `partialVerified:true` accepts `auto-fix:partial-verified` on Leg 1

### 3.4 Auto-fix dashboard data flow

New: `weekly-digest.mjs` → `aggregateAutoFixMetrics(ledger)` reads `transport:'sdk', source:'auto-fix-api'` entries → compute attempts, cost, per-class breakdown; `ghClient.listClosedPullsByLabel('auto-fix:verified')` → compute merge rate, time-to-merge → `renderAutoFixSection` → appended to `renderDigest` output if ≤50-line budget allows

---

## 4. Trust Invariant Analysis: `partial-verified`

**Current trust invariant (v4.0):** `_skipCiGuard: true` in `auto-fix-promote.mjs` is gated by `assertTripleGate({prLabels, merged, sourceIssueLabels})`. Three legs must ALL pass: (1) PR has `auto-fix:verified`, (2) `merged === true`, (3) source issue has `triage` label. The invariant reconstructs "a HUMAN merged, after a VERIFIER signed off, on a TRIAGE-sourced issue."

**`partial-verified` extension:** The trust invariant is WEAKENED on Leg 1 only — `auto-fix:partial-verified` is accepted as an alternative to `auto-fix:verified`. Legs 2 and 3 remain unchanged. The human merge gate is PRESERVED. The verifier signed off on ≥60% of cases, not 100%.

**What this means for the auto-promote corpus mutation:** `runPromote` is called only for the subset of cases in the `affected_cases` HTML comment that actually passed verification. The failing cases are NOT promoted. The promotion of a partially-verified fix is therefore scoped: it adds the passing cases to the golden corpus while the failing cases remain in quarantine (and can be re-filed).

**Risk assessment:** LOW. The partial-verified path still requires human judgment (human must evaluate whether a 3/5 pass is good enough to merge). The auto-promote of the passing subset is the same operation as the full-verified case — just on a smaller set. The trust invariant's CORE property (humans merge, verifiers sign off, triage sourced) is intact.

**Audit surface:** The `assertTripleGate` call in `auto-fix-promote.mjs` logs the gate decision (including which label matched Leg 1). This is the audit trail. The `partialVerified: true` flag must be passed by the workflow, ensuring it cannot be set by accident.

---

## 5. Build Order: Wave-1 Parallelizable vs Sequential

### Wave-0 (must complete before everything else — single task, ~1 hour)

**Pre-push regressions** — all three fixes are independent of each other and can be done in one commit set:
- Test 48 ledger reset + `llm-driver.js` Step 0 guard
- Calendar-rollover flake fix
- `package-lock.json` EXACT pin restore

These MUST land before the `v4.0-integration` PR is created, otherwise CI fails on the PR.

### Wave-1 (after Wave-0, push required before these can complete)

**Push** — create and merge `v4.0-integration` PR. This is the serialization point for everything that follows.

### Wave-2 (can run in parallel after push, no shared write surface)

These three features share no write surface (different files, different data paths) and can be executed by parallel agents or in parallel branches:

| Feature | Write Surface | No overlap with |
|---------|--------------|-----------------|
| **CLEANUP-04 ruleset patch** | `docs/v40-repo-config.md`, `tests/unit/codeowners.test.js`, `gh api` ruleset | no shared files with other Wave-2 items |
| **v3.1 bookkeeping cleanup** | 5 planning phase files, `.planning/STATE.md` | no shared files with other Wave-2 items |
| **Live UATs (47-a/b/d/e)** | `.planning/milestones/v4.0-phases/47-v4-0-cleanup/47-UAT-DEFERRED.md` + evidence dir | no shared files with other Wave-2 items |

Note: Live UATs MUST run after push (they exercise live CI). CLEANUP-04 MUST run after push (the `required_status_checks` context names are only resolvable against live CI run names). v3.1 bookkeeping has no push dependency but is trivially parallelizable.

### Wave-3 (after Wave-2 completes — depends on UAT-47-a baseline)

These features benefit from or require the first live auto-fix run data from UAT-47-a:

| Feature | Dependency on Wave-2 |
|---------|---------------------|
| **Multi-model A/B** | UAT-47-a establishes the baseline run; `llm-router.js` defaults can be calibrated against the first real `auto-fix:verified` pass before routing to Opus for difficult classes |
| **`partial-verified` semantics** | UAT-47-a reveals whether any affected cases partially fail — the 60% threshold calibration needs empirical data |

However, the code for both Wave-3 features can be written independently of UAT-47-a data (the routing table defaults to Sonnet for all classes; the threshold defaults to ≥60%). If the roadmapper wants to parallelize Wave-3 with Wave-2, both features can ship before UAT-47-a results — just with default parameters that get updated post-data.

**Recommendation:** Parallelize Wave-3 with Wave-2 if agents are available. Multi-model A/B and partial-verified are both isolated changes with no risk of breaking existing behavior (they add optional fields / new labels; the existing all-or-nothing path is unchanged).

### Wave-4 (after Wave-3, or after Wave-2 if parallelized)

**Auto-fix dashboard** — depends on multi-model A/B being shipped (the dashboard will query the `model` field in ledger entries). If A/B is not shipped first, the dashboard can still be built but the per-model breakdown section is omitted. The dashboard is also the lowest-risk wave-4 item (it reads existing data and adds a display section — it cannot break the pipeline).

### Cross-wave dependency graph

```
Wave-0: Pre-push regressions (3 fixes)
    |
    v
Wave-1: Push v4.0-integration PR + merge
    |
    v
Wave-2: CLEANUP-04 + v3.1 bookkeeping + Live UATs (47-a/b/d/e)  ← parallel
    |
    v
Wave-3: Multi-model A/B + partial-verified semantics  ← parallel with Wave-2 possible
    |
    v
Wave-4: Auto-fix dashboard
```

---

## 6. Phase Ordering Recommendation for Roadmapper

Suggested phase numbers continue from v4.0's Phase 47:

| Phase | Topic | Wave | Dependencies | Notes |
|-------|-------|------|-------------|-------|
| **48** | Pre-push regression fixes (Test 48 + calendar flake + lock pin) | Wave-0 | none | Small, must land first |
| **49** | Push workflow: `v4.0-integration` PR + `gh pr merge --admin` + post-merge CI confirmation | Wave-1 | 48 | Operational; no new code |
| **50** | CLEANUP-04 ruleset patch + bypass_actors removal | Wave-2 | 49 (requires live CI context names) | `gh api -X PUT` + 2 Vitest assertions |
| **51** | Live UATs (47-a/b/d/e) + evidence capture + re-stamp DEFERRED → PASS | Wave-2 | 49 (requires live workflows) | Parallel with 50 |
| **52** | v3.1 bookkeeping: 5 frontmatter re-stamps + 3 orphan rows removed | Wave-2 | none (no push dependency) | Trivial; parallel with 50+51 |
| **53** | `auto-fix:partial-verified` semantics (verifier-gate + auto-promote + assertTripleGate 4th leg) | Wave-3 | 49 (live auto-fix data), 51 (UAT-47-a baseline) | Can parallelize with 50-52 |
| **54** | Multi-model A/B (`llm-router.js` + `fix-prompt-builder.js` model field + `auto-fix.mjs` + `a-b-winner.mjs`) | Wave-3 | 49; benefits from 51 baseline | Can parallelize with 50-52 |
| **55** | Auto-fix dashboard (extend `weekly-digest.mjs` + `aggregateAutoFixMetrics` + `renderAutoFixSection`) | Wave-4 | 54 (model field in ledger) | Last; additive |

**Wave-1 parallelization:** Phases 50, 51, 52 can run simultaneously (3 agents, zero shared write surface).
**Wave-2 parallelization:** Phases 53, 54 can run simultaneously with 50-52.

---

## 7. Key Integration Touchpoints Summary

| Touchpoint | Existing file:line | v4.1 consumer |
|------------|---------------------|---------------|
| `invokeAnthropicSdkWithLedger` Step 0 (new guard) | `llm-driver.js:506` | Phase 48 INT-FIX |
| `E2E_LEDGER_PATH_OVERRIDE` enforcement | `llm-ledger.js:75` | Phase 48 adds symmetric enforcement at the SDK call site |
| `assertTripleGate` Leg 1 | `auto-fix-promote.mjs:69` | Phase 53 adds `partial-verified` branch |
| `v40-verifier-gate.yml:ready-flip job` | `v40-verifier-gate.yml:384` | Phase 53 adds partial label producer step |
| `v40-auto-promote.yml:if:` filter | `v40-auto-promote.yml:67` | Phase 53 widens to include `auto-fix:partial-verified` |
| `buildFixPrompt` return value | `fix-prompt-builder.js:390` | Phase 54 adds `model` field |
| `invokeAnthropicSdkWithLedger` model param | `llm-driver.js:506` | Phase 54 caller passes model from router |
| `aggregateBySummaryKey` | `weekly-digest.mjs:171` | Phase 55 adds `aggregateAutoFixMetrics` sibling |
| `renderDigest` | `weekly-digest.mjs:244` | Phase 55 adds auto-fix section AFTER existing sections |
| LEDGER `model` field | `llm-ledger.js:appendLedgerEntry` (already present) | Phase 54 populates per-class; Phase 55 reads for dashboard |
| UAT-47-a runbook stub | `.planning/.../47-UAT-DEFERRED.md` | Phase 51 re-stamps DEFERRED → PASS inline |

---

## 8. Anti-patterns to Avoid

| Anti-pattern | Risk | Correct approach |
|---|---|---|
| Weakening Test 48 assertion to allow multi-entry ledger | Masks future leaks | Reset the ledger to bootstrap state; lock down `forceApi` path |
| Using `auto-fix:partial-verified` as the ONLY label on a promote (no `auto-fix:verified` fallback path) | Removes the strict path | Keep both paths; partial is the lower-confidence alternative |
| Widening `SUMMARY_KEYS` to add auto-fix metrics | Breaks the frozen SUMMARY_KEYS contract (DIGEST-04) | Add auto-fix metrics OUTSIDE SUMMARY_KEYS, in a new `renderAutoFixSection` that is appended without touching the key contract |
| Implementing A/B via random model assignment at call time | Non-deterministic ledger — impossible to compare model performance per class | Use static routing table; override is per-class, not random |
| Adding the `model` field to `buildFixPrompt` return as a required field | Breaks the PROMPT_SCAFFOLDS frozen registry contract | Add as optional; existing callers that ignore the `model` field continue to work |
| Promoting partially-verified cases where N/M = 0 (all failed) | Corrupts the golden corpus | Threshold must be > 0; minimum is N >= 1, recommended ≥ ceil(M * 0.6) |

---

## Files Referenced (absolute paths)

- `/home/fatduck/patent-cite-tool/tests/e2e/lib/llm-driver.js` (lines 506-638: `invokeAnthropicSdkWithLedger`)
- `/home/fatduck/patent-cite-tool/tests/e2e/lib/llm-ledger.js` (line 75: `LEDGER_PATH` resolver)
- `/home/fatduck/patent-cite-tool/tests/e2e/lib/fix-prompt-builder.js` (lines 390-412: `buildFixPrompt`)
- `/home/fatduck/patent-cite-tool/tests/e2e/.llm-spend-ledger.json` (leaked 2026-06 entries confirmed)
- `/home/fatduck/patent-cite-tool/scripts/auto-fix-promote.mjs` (lines 67-81: `assertTripleGate`)
- `/home/fatduck/patent-cite-tool/scripts/weekly-digest.mjs` (lines 171-214: `aggregateBySummaryKey`, lines 244-292: `renderDigest`)
- `/home/fatduck/patent-cite-tool/.github/workflows/v40-verifier-gate.yml` (lines 181, 384-433: job names + ready-flip + BLOCKER-01 fix)
- `/home/fatduck/patent-cite-tool/.github/workflows/v40-auto-promote.yml` (line 67: job-level `if:` filter)
- `/home/fatduck/patent-cite-tool/.github/workflows/v40-auto-fix.yml` (line 62: job-level `if:` label filter)
- `/home/fatduck/patent-cite-tool/.planning/milestones/v4.0-phases/47-v4-0-cleanup/47-UAT-DEFERRED.md` (4 DEFERRED runbook stubs)
- `/home/fatduck/patent-cite-tool/.planning/PROJECT.md` (Key Decisions table — trust invariant history)
- `/home/fatduck/patent-cite-tool/.planning/v4.0-SESSION-HANDOFF-2026-06-01.md` (Test 48 regression + push readiness context)

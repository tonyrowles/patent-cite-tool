# Architecture Research

**Domain:** v4.2 Auto-Fix Loop Live — integration architecture
**Researched:** 2026-06-04
**Confidence:** HIGH (all findings sourced from current codebase; no training-data speculation)

## System Overview

The existing v4.0/v4.1 pipeline layers as follows. v4.2 inserts four change points (marked NEW/MODIFIED):

```
┌─────────────────────────────────────────────────────────────────┐
│  ORIGIN TRIGGERS (GitHub Events + Crons)                        │
│  ┌─────────────────┐  ┌──────────────────┐  ┌───────────────┐  │
│  │ e2e-nightly.yml │  │ v40-auto-fix.yml │  │ v40-cost-     │  │
│  │ 06:00 UTC daily │  │ on:issues:labeled│  │ ledger-       │  │
│  │ (regression +   │  │ (triage label)   │  │ snapshot.yml  │  │
│  │  triage pipeline│  │                  │  │ 02:00 UTC     │  │
│  └────────┬────────┘  └────────┬─────────┘  └──────┬────────┘  │
│           │                   │                    │           │
│  [MODIFIED: ledger-commit path ──────────────────► │ MODIFIED] │
└───────────┼───────────────────┼────────────────────┼───────────┘
            │                   │                    │
            ▼                   ▼                    ▼
┌─────────────────────────────────────────────────────────────────┐
│  SCRIPTS LAYER                                                  │
│  ┌─────────────────┐  ┌──────────────────┐  ┌───────────────┐  │
│  │ run-triage-     │  │ auto-fix.mjs     │  │ build-ledger- │  │
│  │ pipeline.mjs    │  │ [MODIFIED:       │  │ dashboard.mjs │  │
│  │ rerun→triage→   │  │  errorClass field│  │               │  │
│  │ issue→quarantine│  │  wired into 7    │  │               │  │
│  └─────────────────┘  │  appendLedger    │  └───────────────┘  │
│                       │  call sites]     │                     │
│  [NEW: fixture-       └────────┬─────────┘                     │
│   mutator script]              │                               │
│  tests/e2e/scripts/            │                               │
│  inject-defect.mjs             │                               │
└───────────────────────────────┼─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│  LIBRARY LAYER (tests/e2e/lib/)                                 │
│  ┌────────────────┐  ┌─────────────────┐  ┌──────────────────┐ │
│  │ llm-ledger.js  │  │ llm-driver.js   │  │ triage-          │ │
│  │ [MODIFIED:     │  │ ┌─────────────┐ │  │ classifier.js    │ │
│  │  appendLedger  │  │ │invokeClaudeP│ │  └──────────────────┘ │
│  │  Entry accepts │  │ │WithLedger   │ │                       │
│  │  errorClass +  │  │ │(subscription│ │  ┌──────────────────┐ │
│  │  outcome fields│  │ │ local only) │ │  │ llm-router.js    │ │
│  │  additively;   │  │ ├─────────────┤ │  │ [SHIPPED v4.1]   │ │
│  │  guard goes    │  │ │invokeAnthrp │ │  └──────────────────┘ │
│  │  into append   │  │ │SdkWithLedger│ │                       │
│  │  Entry itself] │  │ │(CI/sdk only)│ │  ┌──────────────────┐ │
│  └────────────────┘  │ └─────────────┘ │  │ a-b-winner.mjs   │ │
│                      └─────────────────┘  │ [MODIFIED: exits  │ │
│                                           │  abstention once  │ │
│                                           │  errorClass +     │ │
│                                           │  outcome populate]│ │
│                                           └──────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│  DATA LAYER                                                     │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ tests/e2e/.llm-spend-ledger.json                         │   │
│  │ append-only JSONL; v2 schema; committed-but-versioned    │   │
│  │ [MODIFIED: iterations[] entries gain errorClass+outcome] │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## New vs Modified Components

### NEW Components

| Component | Path | Purpose |
|-----------|------|---------|
| fixture-mutator | `tests/e2e/scripts/inject-defect.mjs` | Injects a controlled defect into one golden test case to trigger the full triage loop deterministically |
| promote outcome entry | `scripts/auto-fix-promote.mjs` (new export) | Writes a follow-up ledger entry with `source:'auto-fix-promoted'` + `outcome:'pass'` or `outcome:'fail'` on promotion resolution |
| ledger-snapshot branch target | `ledger-snapshots/*` branch or ledger-snapshot PR | Redirects the daily 02:00 UTC cron's `git push` off `main` to satisfy Phase 50's ruleset |

### MODIFIED Components

| Component | Path | What Changes |
|-----------|------|--------------|
| `appendLedgerEntry` guard | `tests/e2e/lib/llm-ledger.js` | Add a CI-environment guard inside `appendLedgerEntry` itself (the lowest-common chokepoint) to prevent `source:'auto-fix-api'` entries from leaking into the committed ledger during local `npm test` runs |
| `auto-fix.mjs` call sites | `scripts/auto-fix.mjs` | Wire `errorClass` variable (already present in Step 7's `built = buildFixPrompt(...)`) into all 7 `appendLedgerEntry` call sites that currently omit it |
| `invokeAnthropicSdkWithLedger` call sites | `tests/e2e/lib/llm-driver.js` | Wire `errorClass` into the 2 `appendLedgerEntry` calls (lines 588 and 620) — passed through as a new optional param from callers that have it |
| `v40-cost-ledger-snapshot.yml` | `.github/workflows/` | Replace `git push` direct-to-main with branch redirect or PR-then-merge pattern |
| `v40-auto-fix.yml` ledger commit step | `.github/workflows/` | Same as above: the two-commit split's `git push origin main` step redirected |
| `auto-fix-promote.mjs` | `scripts/auto-fix-promote.mjs` | Add ledger write on promotion outcome (new export; does NOT touch assertTripleGate body) |

## Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `llm-ledger.js:appendLedgerEntry` | Single write chokepoint for all ledger mutations | All callers: auto-fix.mjs (7×), llm-driver.js (3×), e2e-explore.mjs (2×) |
| `scripts/auto-fix.mjs:runDispatcher` | 18-step auto-fix pipeline; owns the 7 direct `appendLedgerEntry` calls with `source:'auto-fix-api'` | llm-driver.js (SDK/subscription dispatch), llm-ledger.js (ledger writes), check-diff-guard.mjs |
| `scripts/auto-fix-promote.mjs` | Triple-gate assertion + `runPromote` call; currently has ZERO ledger writes | `promote-from-quarantine.mjs` only (IMPORTS POLICY: no `tests/e2e/lib/*`) |
| `scripts/a-b-winner.mjs` | Reads ledger to compute per-class per-arm pass rates; emits `NO_WINNER_YET` when `errorClass` or outcome absent | `llm-ledger.js:readLedger` (read-only) |
| `tests/e2e/scripts/inject-defect.mjs` (NEW) | Writes a synthetic golden-case corruption to trigger the pipeline end-to-end | `tests/test-cases.js` (read), `tests/golden/baseline.json` (modify in isolation), cron entrypoint |
| `v40-cost-ledger-snapshot.yml` | Daily ledger commit; currently pushes direct to `main` | `main` branch / NEW: `ledger-snapshots/*` branch |

## Data Flow Changes

### Current Flow (v4.1)

```
auto-fix.mjs ──appendLedgerEntry──► .llm-spend-ledger.json (working tree)
                                            │
v40-auto-fix.yml "Commit ledger to main" ──► git push origin main
                                            │
v40-cost-ledger-snapshot.yml ──────────────► git push origin main  [BLOCKED by ruleset]
```

Both direct pushes to main are blocked by Phase 50's ruleset 17086676 which requires all pushes through PRs with required status checks (verifier-gate + deps-update-gate, both via integration_id=15368).

### v4.2 Target Flow — Ledger Commit Branch Redirect

```
auto-fix.mjs ──appendLedgerEntry──► .llm-spend-ledger.json (working tree)
                                            │
v40-auto-fix.yml "Commit ledger" ──────────► git push origin ledger-snapshots/auto-fix-<issue>
                 (peter-evans/cpr@v8 OR branch push) — does NOT hit verifier-gate
                                            │
v40-cost-ledger-snapshot.yml ──────────────► git push origin ledger-snapshots/daily-YYYY-MM-DD
                                            │
[periodic manual or scheduled merge] ──────► PR from ledger-snapshots/* → main
                                              (status checks satisfied by PR path)
```

Alternative: use `peter-evans/create-pull-request@v8` (already available in the repo) for each ledger update, letting the verifier-gate fast-path (scope-decision step in Phase 51.1) skip non-source-code PRs immediately.

### v4.2 Target Flow — Schema Extension

```
auto-fix.mjs Step 7:
  errorClass = extractErrorClass(labels)  ← already in scope
  built = buildFixPrompt({errorClass, ...})
  built.model  ← already populated (Phase 54)

auto-fix.mjs 7 appendLedgerEntry call sites:
  BEFORE: { iso, model, cost_usd, transport, source, fingerprint, ... }
  AFTER:  { iso, model, cost_usd, transport, source, fingerprint, errorClass, ... }
  (errorClass is the same variable already in scope at all 7 sites)

invokeAnthropicSdkWithLedger 2 call sites (llm-driver.js:588, 620):
  BEFORE: { iso, model, cost_usd, transport, source, ... }
  AFTER:  { iso, model, cost_usd, transport, source, errorClass, ... }
  (requires passing errorClass as a new optional param through invokeAnthropicSdkWithLedger's opts)

auto-fix-promote.mjs (new ledger write):
  ON PROMOTION SUCCESS:
    appendLedgerEntry(LEDGER_PATH, {
      iso, model:'n/a', cost_usd:0, transport:'sdk',
      source:'auto-fix-promoted', outcome:'pass',
      fingerprint, issueId, prNumber
    })
  ON LABEL-FLAP FAILURE:
    appendLedgerEntry(LEDGER_PATH, {
      source:'auto-fix-failed', outcome:'fail', ...
    })

a-b-winner.mjs (no code change needed):
  D-20 outcome probe in detectOutcome() already checks:
    entry.outcome === 'pass' | 'fail'
    entry.pr_merged === true | false
  Once ≥1 entry carries outcome, outcomeUnavailable flips false → exits abstention
```

### Race Condition Analysis: Ledger-Commit vs In-Flight Auto-Fix

**Risk:** The two-commit split in `v40-auto-fix.yml` (Phase 43 architecture) currently does:
1. `auto-fix.mjs` writes ledger entry to working tree
2. Workflow commits that entry DIRECTLY to `main` with `[skip ci]`
3. Workflow rebases the auto-fix branch on updated `main`
4. `peter-evans/cpr@v8` creates the draft PR from the clean branch

If step 2 is redirected to `ledger-snapshots/*`, the rebase in step 3 targets `main` (unchanged by the ledger commit), which is correct. The race condition concern is whether a concurrent `v40-cost-ledger-snapshot.yml` run could push to the same `ledger-snapshots/*` ref simultaneously.

**Resolution:** Use per-run unique branch names:
- Snapshot cron: `ledger-snapshots/daily-<YYYY-MM-DD>` (at most one per day; concurrency group prevents racing)
- Auto-fix ledger commit: `ledger-snapshots/auto-fix-issue-<N>-<timestamp>` (unique per workflow run)

The existing `concurrency: group: v40-cost-ledger-snapshot / cancel-in-progress: false` already prevents snapshot races. Auto-fix uses per-issue concurrency (`v40-auto-fix-${{ github.event.issue.number }}`). These groups are disjoint — no race between snapshot and auto-fix on the same ref.

**FORBIDDEN_PATHS impact:** `tests/e2e/.llm-spend-ledger.json` is already in the FORBIDDEN_PATHS bank (regex 5: `/^tests\/e2e\/\.llm-spend-ledger\.json$/`). The ledger-commit branch redirect does NOT change this — the diff-guard still correctly rejects any auto-fix PR that touches the ledger. The ledger commit lands on a SEPARATE branch (`ledger-snapshots/*`), never in the auto-fix source-code branch.

## Architectural Decisions for Each v4.2 Feature

### 1. Ledger-Commit Branch Redirect

**Decision: `ledger-snapshots/*` branch redirect (not PR-then-merge for every ledger write)**

Rationale: PR-then-merge for every daily ledger snapshot (365×/year) + every auto-fix run is operationally noisy. The `ledger-snapshots/*` branch approach lets both workflows push freely without hitting required status checks, and a periodic (weekly or monthly) merge PR consolidates the ledger history into `main`. The merge PR itself goes through the normal PR gate which satisfies the Phase 50 ruleset.

Implementation points:
- `v40-cost-ledger-snapshot.yml`: change `git push` to `git push origin HEAD:ledger-snapshots/daily-${{ env.SNAPSHOT_DATE }}`
- `v40-auto-fix.yml` "Commit ledger to main" step: change `git push origin main` to `git push origin HEAD:ledger-snapshots/auto-fix-issue-${{ github.event.issue.number }}`
- Both workflows already have `contents: write` permission — sufficient for pushing non-main branches
- S13 Vitest test (`v40-cost-ledger-snapshot-yaml.test.js`) currently pins the verbatim commit pattern; it must be updated as part of the same commit

**UAT-47-d unblock:** Once the direct-push-to-main is removed from both workflows, Phase 50's ruleset no longer blocks them. UAT-47-d can then be re-executed against origin/main.

### 2. Schema Extension — 9 Call Sites

**Call site map (9 total):**

| # | File | Line (approx) | Source tag | errorClass in scope? | Notes |
|---|------|---------------|------------|---------------------|-------|
| 1 | auto-fix.mjs | ~295 | `flake-suppressed` | YES (from dispatchFlakeState opts.errorClass... wait — dispatchFlakeState does NOT receive errorClass) | errorClass must be threaded from runDispatcher through dispatchFlakeState call |
| 2 | auto-fix.mjs | ~391 | `flake-dispatched` | YES (same — requires threading) | |
| 3 | auto-fix.mjs | ~546 | `auto-fix-api` (branch-existed) | YES — errorClass resolved in Step 4 before Step 6 | Simple: add `errorClass` to the entry object |
| 4 | auto-fix.mjs | ~589 | `auto-fix-api` (skip-class) | YES — errorClass in scope from Step 4 | Simple: add `errorClass` to the entry object |
| 5 | auto-fix.mjs | ~685 | `auto-fix-api` (malformed-diff) | YES — errorClass in scope | Simple: add `errorClass` to the entry object |
| 6 | auto-fix.mjs | ~707 | `auto-fix-api` (diff-guard) | YES — errorClass in scope | Simple: add `errorClass` to the entry object |
| 7 | auto-fix.mjs | ~744 | `auto-fix-api` (apply-check) | YES — errorClass in scope | Simple: add `errorClass` to the entry object |
| 8 | llm-driver.js | ~588 | `auto-fix-api` (sdk_error catch) | NOT in scope — llm-driver.js has no awareness of errorClass | Pass as new optional `errorClass?:string` param through invokeAnthropicSdkWithLedger opts |
| 9 | llm-driver.js | ~620 | `auto-fix-api` (sdk success) | NOT in scope — same | Same as above |

**Call sites 1+2 (dispatchFlakeState):** dispatchFlakeState currently receives `{caseId, fingerprint, issueNumber, transport, now}`. Add `errorClass?: string` to its opts — the FLAKE label itself is the errorClass at these sites, so `errorClass: 'FLAKE'` can be hardcoded OR threaded from runDispatcher's `errorClass` variable (which is always `'FLAKE'` when dispatchFlakeState is reached). Hardcoding `'FLAKE'` is simpler and accurate.

**Call sites 8+9 (llm-driver.js):** `invokeAnthropicSdkWithLedger` opts JSDoc already says extra fields passed to `appendLedgerEntry` are preserved. Add `errorClass?: string` to the opts signature and include it in both `appendLedgerEntry` calls. The caller in `auto-fix.mjs` Step 10 passes `errorClass: errorClass` (which is in scope from Step 4).

**Schema additivity guarantee:** `appendLedgerEntry` at line 705 does `m.iterations.push(entry)` — the entry object is spread verbatim. Adding `errorClass` to the entry object passed by callers requires zero changes to `appendLedgerEntry` itself. All 33 pre-existing llm-ledger tests continue to pass because they do not assert on the absence of unknown fields. Test 48 (the pre-existing failure about the bootstrap entry's exact shape) is unrelated — it checks a fixed on-disk file and will still fail until that file is re-seeded.

**`combinedMonthlyTotalByTransport` impact:** This function (llm-ledger.js:592) iterates `iterations[]` and sums `cost_usd` partitioned by `it.transport`. It does NOT inspect `errorClass` or `outcome`. Adding these fields to entries is fully transparent to this function. No change needed.

### 3. Fixture-Mutator (UAT-47-b) Placement

**Decision: `tests/e2e/scripts/inject-defect.mjs`**

Rationale: The existing `tests/e2e/scripts/` directory already holds test-infrastructure scripts (not production code). The mutator is a test-harness tool, not a production pipeline script. Placing it in `scripts/` would make it subject to ESLint guards targeting `scripts/*.mjs` (auto-fix-api transport restrictions). Placing it in `tests/e2e/scripts/` co-locates it with other harness scripts and keeps it outside `scripts/`'s ESLint scope.

**Isolation from golden baseline:**

The 76-case regression spec at `tests/e2e/specs/regression.spec.js` imports `TEST_CASES` from `tests/test-cases.js` directly. The fixture-mutator MUST NOT modify `tests/test-cases.js` or `tests/golden/baseline.json` — both are in FORBIDDEN_PATHS.

The correct isolation pattern:
1. `inject-defect.mjs` takes a target case-id as a CLI argument
2. It writes a corrupted version of the case's fixture JSON to a SEPARATE temp file (not the original `tests/fixtures/<patentId>.json`)
3. It writes a parallel test-cases entry to `tests/e2e/test-cases-quarantine.js` (already mutable by the pipeline — NOT in FORBIDDEN_PATHS for quarantine-append calls)
4. OR it operates entirely in memory and passes the synthetic case directly to the triage pipeline via `run-triage-pipeline.mjs`'s `--case-id` argument

The cleanest architectural choice: the mutator creates a SYNTHETIC ISSUE directly (via `gh issue create`) with a crafted fingerprint + case-id + ERROR_CLASS label, bypassing the regression runner entirely. This exercises the triage → issue → auto-fix → verifier-gate → merge → promote loop without touching the 76-case golden baseline at all. The Playwright regression suite remains unaffected.

**Integration with cron / verifier-gate / triage pipeline:**

The mutator does NOT need to hook into the nightly cron. Its purpose is to create a deterministic synthetic issue that can be manually triggered against origin/main. The flow:
```
inject-defect.mjs (manual run, creates synthetic GitHub issue)
    → issue carries: fingerprint + WRONG_CITATION label + case-id + triage label
    → v40-auto-fix.yml fires (on:issues:labeled triage)
    → auto-fix.mjs proposes a fix
    → v40-verifier-gate.yml runs (on PR)
    → human merges
    → v40-auto-promote.yml runs
    → auto-fix-promote.mjs (NEW: writes outcome ledger entry)
    → a-b-winner.mjs exits abstention
```

### 4. Leak Vector — Architectural Fix

**Decision: Guard inside `appendLedgerEntry` itself (the chokepoint), not at individual call sites**

The memory note correctly identifies: "a single chokepoint is the structural fix." The Phase 48 guard in `invokeAnthropicSdkWithLedger` only covers the SDK-path wrapped calls. The 7 direct `appendLedgerEntry` calls in `auto-fix.mjs` bypass it entirely.

**Implementation:**

Add a guard block at the top of `appendLedgerEntry` in `tests/e2e/lib/llm-ledger.js`:

```javascript
// PRE-02 extension (Phase 56): phase-wide ledger lock.
// Prevents test runs (npm test) from polluting the committed ledger via
// scripts/auto-fix.mjs's direct appendLedgerEntry calls (source:'auto-fix-api').
// This guard fires ONLY when:
//   (a) the entry carries source:'auto-fix-api' AND
//   (b) we are NOT in CI AND
//   (c) E2E_LEDGER_PATH_OVERRIDE is not set
// Condition (a) scopes the guard to the leak vector only — subscription and
// triage writes (source:'triage', 'fix-issue-cli', etc.) are unaffected.
if (
  entry?.source === 'auto-fix-api' &&
  !process.env.CI && !process.env.GITHUB_ACTIONS &&
  !process.env.E2E_LEDGER_PATH_OVERRIDE
) {
  throw new Error(
    'appendLedgerEntry: source:auto-fix-api blocked outside CI without ' +
    'E2E_LEDGER_PATH_OVERRIDE. This prevents test runs from polluting the ' +
    'committed ledger. Set E2E_LEDGER_PATH_OVERRIDE=<tmpfile> or run in CI.'
  );
}
```

**Why NOT per-call-site guards:** There are 7 call sites in `auto-fix.mjs` alone, and the memory note flags that future contributors may add new call sites. A chokepoint guard is more robust — it catches any future `source:'auto-fix-api'` write regardless of where it's added.

**ESLint impact:** No change to FORBIDDEN_PATHS (that bank governs diff contents, not runtime guards). No change to ESLint `no-restricted-imports` rules (the guard is inside the already-allowed `llm-ledger.js`). No change to FORBIDDEN_DELIMITERS or any other workflow-side restriction.

**Test 48 (pre-existing failure):** The `npm test` run that triggers Test 48's failure is the SEPARATE issue — Test 48 asserts that the committed ledger still has exactly 1 bootstrap entry. The leak vector fix prevents NEW leaks but does not fix the pre-existing Test 48 discrepancy (the committed file may have grown if any prior local runs leaked). Test 48 will need the committed ledger re-seeded as part of the same phase that fixes the leak vector, OR Test 48's assertion should be relaxed from "exactly 1 entry" to "has at least 1 bootstrap entry with phase='39-bootstrap'".

### 5. `auto-fix-promote.mjs` Ledger Write — Placement

**The IMPORTS POLICY in auto-fix-promote.mjs is a hard constraint:**
```
// ALLOWED:   node:*  AND  ./promote-from-quarantine.mjs
// FORBIDDEN: tests/e2e/lib/*  (transport-confusion risk on the v3.1
//            subscription-vs-SDK boundary)
```

This policy explicitly forbids importing `tests/e2e/lib/llm-ledger.js`. Therefore, `auto-fix-promote.mjs` CANNOT directly call `appendLedgerEntry`.

**Resolution options:**

Option A: Relax the IMPORTS POLICY for `llm-ledger.js` specifically (it carries no transport ambiguity — it is a pure I/O helper with no LLM invocation). Add a NARROWED policy exception: ledger-specific imports from `tests/e2e/lib/llm-ledger.js` are allowed, but `tests/e2e/lib/llm-driver.js` remains forbidden.

Option B: Move the promote-outcome ledger write into the WORKFLOW (`v40-auto-promote.yml`) as a shell step, using a one-liner `node -e "import('./tests/e2e/lib/llm-ledger.js').then(m => m.appendLedgerEntry(m.LEDGER_PATH, {...}))"`. This keeps auto-fix-promote.mjs boundary-clean but the ledger write is not unit-testable.

Option C: A new thin script `scripts/ledger-write.mjs` that is exclusively a CLI shim for `appendLedgerEntry` — called from the workflow, no LLM transport surface. Keeps auto-fix-promote.mjs boundary-clean and is unit-testable.

**Recommendation: Option A** — `llm-ledger.js` is a pure I/O helper that predates the transport confusion risk and has no LLM transport coupling. The IMPORTS POLICY comment's stated rationale ("transport-confusion risk") does not apply to it. Update the IMPORTS POLICY comment and add the import. The Vitest audit test (`tests/unit/auto-fix-promote-gate.test.js`) that enforces the policy via grep must be updated in the same commit. This is the most testable and least mechanically complex solution.

**Ledger-commit path:** The outcome entry written by auto-fix-promote.mjs goes through the same ledger-commit pattern as auto-fix.mjs — the v40-auto-promote.yml workflow would need a similar "commit outcome ledger entry to `ledger-snapshots/*`" step.

## Build Order Analysis

### Critical Path Dependencies

```
Schema extension (errorClass field in ledger)
    ↓  unblocks
A/B winner exits abstention     Dashboard shows real values
(no code change needed —        (Phase 55 renderAutoFixPipeline
 forward-compat already ships)   section gets populated data)

Leak vector fix (appendLedgerEntry guard)
    ↓  independent of schema extension but
    ↓  must ship BEFORE real auto-fix runs happen in CI to avoid
    ↓  committed-ledger pollution from test runs

Ledger-commit branch redirect
    ↓  required before UAT-47-a, UAT-47-d re-sweep
    ↓  independent of schema extension

Fixture-mutator
    ↓  requires ledger-commit redirect to be in place (so
    ↓  the mutator's synthetic auto-fix run can commit its ledger
    ↓  entry without hitting the ruleset block)
    ↓  independent of schema extension
```

### Recommended Build Order

**Phase 56 (v4.2 Phase 1): Schema extension + Leak vector fix**

Ship together in one commit because:
- Schema extension is purely additive (JSDoc + errorClass threading — zero test breakage risk)
- Leak vector fix must land before any CI auto-fix runs to prevent ledger pollution
- Both touch `llm-ledger.js` and `auto-fix.mjs` — bundling avoids double-touching files
- Schema extension unblocks a-b-winner immediately (no code change needed to a-b-winner.mjs)
- Dashboard data starts populating on the NEXT auto-fix run after this ships

Deliverables:
1. `appendLedgerEntry` guard in `llm-ledger.js` (condition: `source:'auto-fix-api'` + not CI + no override)
2. `errorClass` wired into 7 call sites in `auto-fix.mjs` (trivial — variable already in scope at 5 sites; FLAKE hardcoded at 2 flake-dispatch sites)
3. `errorClass?` optional param added to `invokeAnthropicSdkWithLedger` opts + wired into its 2 `appendLedgerEntry` calls
4. Test 48 assertion relaxed (or committed ledger re-seeded) as part of the same commit
5. Vitest coverage: new tests for the `appendLedgerEntry` guard (extends Test 12 block); new tests for schema round-trip with `errorClass` field

**Phase 57 (v4.2 Phase 2): Ledger-commit branch redirect**

Ship next because:
- Depends on nothing from Phase 56
- Unblocks UAT-47-a and UAT-47-d re-sweep (can run immediately after)
- Must ship before fixture-mutator (mutator's auto-fix CI run must not hit the ruleset block)

Deliverables:
1. `v40-cost-ledger-snapshot.yml`: change `git push` target
2. `v40-auto-fix.yml`: change ledger-commit push target
3. S13 Vitest YAML test updated to match new push pattern
4. UAT-47-a + UAT-47-d re-sweep immediately following

**Phase 58 (v4.2 Phase 3): auto-fix-promote.mjs outcome ledger write**

Ship after Phase 57 because:
- Requires the branch-redirect pattern to be established for the promote workflow's new ledger step
- IMPORTS POLICY update needed (tested by existing grep-based Vitest assertion)
- New `appendLedgerEntry` calls in promote flow need the chokepoint guard (Phase 56) in place

Deliverables:
1. IMPORTS POLICY relaxed in auto-fix-promote.mjs for `llm-ledger.js`
2. `appendLedgerEntry` import + outcome ledger write on promotion success/failure
3. `v40-auto-promote.yml`: add ledger-snapshot commit step for the new outcome entry
4. Vitest: update grep-based import audit test; new unit tests for outcome entry shape

**Phase 59 (v4.2 Phase 4): Fixture-mutator + UAT-47-b**

Ship last because:
- Requires ledger-commit redirect (Phase 57) to be live on origin/main
- Requires Phase 56 schema to be live so mutator's synthetic run populates `errorClass`
- Depends on auto-fix running successfully end-to-end before verifying outcome population

Deliverables:
1. `tests/e2e/scripts/inject-defect.mjs`: creates synthetic GitHub issue with correct fingerprint/labels
2. UAT-47-b executed: mutator → issue → auto-fix CI → verifier-gate → merge → promote → outcome entry
3. First real production run captured or confirmed in-progress

**Phase 60 (v4.2 Phase 5): Carry-along cleanup + UAT-47-e re-sweep**

- Remove dead `MODEL` const in `scripts/auto-fix.mjs` (Phase 54 deferred)
- Finish `tests/e2e/scripts/v40-verifier-gate-yaml.test.js` V2 update (Phase 51.1 unfinished test)
- UAT-47-e re-sweep (verifier-gate trigger bug fixed in Phase 51.1; re-run to confirm)

### Parallelization Opportunities

Phases 57 and 56 are INDEPENDENT and can ship in either order. If the operator prefers, schema extension and leak vector (Phase 56) can be done in parallel with branch redirect (Phase 57) — they touch disjoint files. However, because Phase 57's UAT re-sweep (UAT-47-a) itself exercises the auto-fix pipeline, having the schema extension (Phase 56) in place first means the UAT sweep will populate `errorClass` in the ledger from the start.

## Cross-Cutting Concerns

### Race Condition on Ledger Append

The ledger uses a read-modify-write pattern with temp-file atomic rename. The Phase 43 comment ("single-process use") still applies. Under the branch-redirect pattern, the auto-fix workflow's "commit ledger to ledger-snapshots/*" step runs sequentially within a single job — no concurrent ledger writers exist during that job. The snapshot cron has its own concurrency group. No race condition introduced.

### Schema Extension and `combinedMonthlyTotalByTransport`

The `combinedMonthlyTotalByTransport` function (llm-ledger.js:592) only inspects `it.cost_usd` and `it.transport`. Adding `errorClass` and `outcome` to entries is fully transparent — the function's aggregation is unaffected. The 33 pre-existing llm-ledger tests that cover this function do not assert on the absence of extra fields. HIGH confidence: zero breakage risk.

### Fixture-Mutator and 76-Case Golden Baseline

The mutator MUST NOT touch `tests/test-cases.js` or `tests/golden/baseline.json` — both are in FORBIDDEN_PATHS and any diff touching them would be rejected by the diff-guard on the auto-fix PR. The recommended synthetic-issue approach (mutator creates a GitHub issue directly without modifying test files) has zero interaction with the 76-case baseline. The Playwright regression spec's `for (const tc of TEST_CASES)` loop is completely unaffected.

### Leak Vector Fix and ESLint/FORBIDDEN_PATHS

The `appendLedgerEntry` guard is a runtime check inside `llm-ledger.js`. It does not affect:
- FORBIDDEN_PATHS (diff-guard bank, governs file paths in auto-fix PRs)
- ESLint `no-restricted-imports` rules (no new import boundaries)
- The Phase 48 guard inside `invokeAnthropicSdkWithLedger` (complementary layer, both coexist)

The two guards are defense-in-depth:
- Phase 48 guard: blocks `forceApi:true` at the SDK wrapper entry point
- Phase 56 guard: blocks `source:'auto-fix-api'` at the write chokepoint

They are not redundant — the Phase 48 guard only fires on the `forceApi:true` path, while the Phase 56 guard fires on ALL `source:'auto-fix-api'` writes regardless of how the script was invoked.

## Sources

- `scripts/auto-fix.mjs` — 7 `appendLedgerEntry` call sites, `source:'auto-fix-api'` leak sites (lines 546, 589, 685, 707, 744), `dispatchFlakeState` call sites (lines 295, 391)
- `tests/e2e/lib/llm-ledger.js` — `appendLedgerEntry` implementation (line 686), `combinedMonthlyTotalByTransport` (line 592)
- `tests/e2e/lib/llm-driver.js` — `invokeAnthropicSdkWithLedger` (line 506), 2 leak call sites (lines 588, 620), Phase 48 PRE-02 guard (line 525)
- `.github/workflows/v40-auto-fix.yml` — two-commit split pattern, ledger commit step (line 150), `peter-evans/create-pull-request@v8` usage
- `.github/workflows/v40-cost-ledger-snapshot.yml` — direct `git push` pattern (line 91), S13 test reference
- `scripts/a-b-winner.mjs` — abstention mode, `PHASE_56_TODO` markers, `detectOutcome` probe (line 232), `computePerClassPerArm` (line 250)
- `scripts/auto-fix-promote.mjs` — IMPORTS POLICY (line 24), PARTIAL_LABEL/PARTIAL_THRESHOLD (lines 87-88)
- `.planning/STATE.md` — Phase 54 closure (AB-04 abstention mode), Phase 55 closure (DASH-01..03), Pending Todos (ledger schema extension sub-item)
- `.planning/PROJECT.md` — Key Decisions table; v4.2 target features
- `memory/project_auto_fix_ledger_leak_vector.md` — leak vector specifics, single-chokepoint recommendation
- `tests/e2e/specs/regression.spec.js` — `TEST_CASES` import pattern, golden baseline interaction
- `scripts/check-diff-guard.mjs` — FORBIDDEN_PATHS bank (8 entries); ledger path is entry 5

---
*Architecture research for: v4.2 Auto-Fix Loop Live*
*Researched: 2026-06-04*

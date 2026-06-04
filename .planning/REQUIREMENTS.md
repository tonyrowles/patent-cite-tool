# Requirements: Patent Citation Tool v4.1 — Readiness Gate + Push

**Defined:** 2026-06-02
**Milestone:** v4.1
**Core Value:** Highlight text on Google Patents, get an accurate citation reference instantly — no PDF downloading, no manual counting.
**Milestone Goal:** Land v4.0's ~777 local commits on `origin/main`, exercise the self-healing loop live against real GitHub Actions, close v4.0's deferred UATs and v3.1's bookkeeping debt, and ship 3 forward-looking auto-fix improvements (dashboard, partial-verified semantics, multi-model A/B).

## v1 Requirements

### Pre-Push Hygiene

Three concrete blocking test fixes that must clear before the v4.0-integration PR can pass CI. Source: v4.0 session handoff document (`tests/unit/llm-ledger.test.js:1012`, `tests/e2e/scripts/e2e-weekly-digest.test.js:395`, `package-lock.json`).

- [x] **PRE-01**: Reset committed `tests/e2e/.llm-spend-ledger.json` to single bootstrap entry (`phase='39-bootstrap'`); the 4 leaked 2026-06 opus entries (`phase=null, transport=null`, ~$0.353) are removed; `npm run test -- llm-ledger.test.js` Test 48 returns to GREEN
- [x] **PRE-02**: `tests/e2e/lib/llm-driver.js:invokeAnthropicSdkWithLedger` gains a Step 0 guard that throws when `forceApi:true && !CI && !E2E_LEDGER_PATH_OVERRIDE`; prevents future committed-ledger pollution from local SDK calls
- [x] **PRE-03**: `tests/e2e/scripts/e2e-weekly-digest.test.js:395` calendar-rollover flake is fixed via epoch-relative fixture dates (replace hardcoded `2026-05` `PIN_NOW` with epoch-anchored constant + derived month/year); `npm test` passes regardless of current month
- [x] **PRE-04**: `package-lock.json` retains EXACT pin on `@anthropic-ai/sdk@0.100.1` (no caret); `npm install` does not reintroduce caret; static-grep Vitest assertion pins the lockfile entry

### Push to Remote

The single serialization point in v4.1 — all downstream features depend on these commits being live on `origin/main`. Source: v4.0 handoff (`~777 local commits ahead of origin/main`), PROJECT.md "Current Milestone" goal #1.

- [x] **PUSH-01**: A `v4.0-integration` PR is opened from local main with the ~777 commits; merge-strategy is `--merge` (NOT squash — the commit history is the audit trail for a legal-filing tool)
- [x] **PUSH-02**: CI passes green on the integration PR on origin (full test suite + lint + build + 6 V40 workflows confirmed present); the merged commit produces at least one complete check-suite run

### Readiness Gate (post-push ruleset)

CLEANUP-04 + `bypass_actors=1` remediation. Must run AFTER push (to resolve `integration_id` from a live CI run) but BEFORE any new `triage`-labeled issue fires (which could otherwise be auto-fix-promoted via the still-open bypass). Source: STATE.md tech_debt entries, PROJECT.md "Next Milestone Goals" #1.

- [x] **GATE-01**: Ruleset 17086676 is PATCHed via `gh api -X PUT --input` to add `verifier-gate` + `deps-update-gate` job names to `required_status_checks`; verification via subsequent `gh api GET` + Vitest static-grep guard pinning both context names
- [x] **GATE-02**: `bypass_actors=1` (owner-self `bypass_mode=always`) is removed from ruleset 17086676 (set to empty array); a committed break-glass procedure documents the recovery path (`gh api PATCH` to re-add temporarily) BEFORE removal lands
- [x] **GATE-03**: A test PR opened immediately after GATE-01 + GATE-02 confirms both required status checks are correctly enforced (PR cannot merge until both pass)

### Live Readiness UATs

The 4 DEFERRED runbook stubs from `47-UAT-DEFERRED.md` — re-stamped to PASS with evidence artifacts. Source: PROJECT.md "Current Milestone" goal #3, STATE.md deferred uat_gap entries.

- [ ] **UAT-01**: UAT-47-a — first end-to-end auto-fix run executes against real GitHub issue #3 (`US11427642-spec-short-1`, fingerprint `139f821b3bb1`); a draft PR opens on branch `auto-fix/3-139f821b` with LLM-proposed fix; verifier-gate runs 3× affected case + 76-case regression + diff-guard; result captured with screenshot + log + ledger entry. Runbook MUST include remove-then-add `triage` label step (idempotency) and branch pre-existence check.
- [ ] **UAT-02**: UAT-47-b — weekly dep-update pre-flight gate (`deps-update-gate` job) blocks on a regression introduced into a test dep-bump PR; the PR cannot merge while the smoke + regression suite fails; result captured
- [ ] **UAT-03**: UAT-47-d — daily ledger snapshot workflow (`cost-ledger-snapshot.yml`, 02:00 UTC) commits a `[skip ci]`-tagged snapshot to main with grep-friendly invocations + spend encoding; result captured with the commit hash + verbatim commit message format
- [ ] **UAT-04**: UAT-47-e — verifier-gate diff-guard rejects a CRAFTED bypass attempt that touches one of the 6 LOCKED paths (`tests/test-cases.js`, `tests/golden/baseline.json`, etc.); the test branch is named `test-only/diff-guard-*` and is CLOSED (not merged) immediately after the gate fires; result captured

### v3.1 Bookkeeping Cleanup

11 carryover items from v3.1 close + 8 v4.0 close items (per STATE.md Deferred Items table). Substance was closed live in v3.1 Phase 38-03; this is bookkeeping debt. Source: STATE.md Deferred Items.

- [x] **BOOKS-01**: Frontmatter is re-stamped on 5 carryover VERIFICATION/UAT files (`32-UAT-EVIDENCE.md`, `35-HUMAN-UAT.md`, `36-HUMAN-UAT.md`, `37-HUMAN-UAT.md`, `38-UAT-EVIDENCE.md`); each gains `status: passed` reflecting the live Phase 38-03 closure; forward-only new commits (no `git commit --amend`)
- [x] **BOOKS-02**: 3 orphan quick-task slug references are removed from STATE.md Deferred Items table (`1-fix-off-by-2-error-in-patent-column-line`, `2-fix-ci-commit-package-lock-json-currentl`, `260412-fde-fix-spurious-results-reporting-impossibl`); each was already substantively closed

### `auto-fix:partial-verified` Semantics

Forward-looking gate state for when verifier passes N/M cases (not all-or-nothing). The single most load-bearing architectural decision in v4.1 — the existing `assertTripleGate` trust invariant MUST NOT be widened. Source: PROJECT.md "Current Milestone" goal #5.

- [x] **PARTIAL-01**: A new `assertPartialGate` function is exported from `scripts/auto-fix-promote.mjs` as a SEPARATE entry point (not a widened `assertTripleGate`); it does NOT call `runPromote({_skipCiGuard:true})`; the existing `assertTripleGate` body is byte-unchanged
- [x] **PARTIAL-02**: `.github/workflows/v40-verifier-gate.yml` `ready-flip` job gains a conditional step that produces an `auto-fix:partial-verified` label when at least 4/5 (≥80%) of affected cases pass; the full-pass `auto-fix:verified` path is byte-unchanged
- [x] **PARTIAL-03**: `.github/workflows/v40-auto-promote.yml` job-level `if:` filter widens to include `auto-fix:partial-verified`; partial-pass promotion mutates the corpus only for the PASSING case subset (failing cases stay in quarantine)
- [x] **PARTIAL-04**: A Vitest assertion `assertTripleGate` throws on `auto-fix:partial-verified` (proves the trust invariant boundary holds); the test ships in the SAME commit as the new label / `assertPartialGate` function

### Multi-Model A/B

Deterministic routing by ERROR_CLASS (not random) — sonnet 4.6 default; opus 4.7 for `GOOGLE_DOM_DRIFT` + `LLM_HALLUCINATED_SELECTION`. Source: PROJECT.md "Current Milestone" goal #6, FEATURES.md research §Multi-model.

- [x] **AB-01**: A new pure-function module `tests/e2e/lib/llm-router.js` exports a frozen `MODEL_ROUTES` table + `routeModel(errorClass)` helper; no I/O; defaults all classes to `claude-sonnet-4-6` except `GOOGLE_DOM_DRIFT` + `LLM_HALLUCINATED_SELECTION` → `claude-opus-4-7`
- [x] **AB-02**: `tests/e2e/lib/fix-prompt-builder.js:buildFixPrompt` return is extended additively with a `model` field sourced from `routeModel(errorClass)`; existing return fields are unchanged
- [x] **AB-03**: `scripts/auto-fix.mjs` replaces the module-level hardcoded `MODEL` const with a per-call `model` passed from `buildFixPrompt`; the ledger entry's `model` field reflects the actually-invoked model
- [x] **AB-04**: A new `scripts/a-b-winner.mjs` operator-triggered script queries the committed ledger and computes per-class pass rates per model; outputs a markdown table to stdout; outputs `NO_WINNER_YET` when N < `N_PER_ARM_REQUIRED` (committed constant, default 20) — this is a code constant, not a prose note

### Auto-Fix Dashboard

Additive `<details>` collapsible section in the existing weekly digest. SUMMARY_KEYS frozen contract (7 entries) is preserved. Source: PROJECT.md "Current Milestone" goal #4.

- [x] **DASH-01**: `scripts/e2e-weekly-digest.mjs` gains an `aggregateAutoFixMetrics` helper that reads the committed ledger + `gh pr` query results; computes 7 observable metrics (auto_fix_attempted, verified_merged, success_rate, cost_per_fix, time_to_merge_p50, fix_attempts_p50, flake_escalation_count); ALL metrics are NaN/Infinity-guarded
- [x] **DASH-02**: A new `renderAutoFixSection` is appended after the existing digest sections inside a `<details>` collapsible markdown block; the frozen 7-element `SUMMARY_KEYS` array is byte-unchanged (Vitest assertion `SUMMARY_KEYS.length === 7` must pass)
- [x] **DASH-03**: `cost_per_fix` uses `combinedMonthlyTotalByTransport` (not raw sum) to avoid double-counting subscription + SDK invocations for the same issue; `time_to_merge` filters `mergedAt !== null`

## v2 Requirements (Deferred)

### Per-ERROR_CLASS Partial-Verified Thresholds

- **PARTIAL-v2-01**: Per-ERROR_CLASS threshold table (replace single 4/5 floor); requires ≥25 auto-fix runs per class for empirical basis

### A/B Automated Winner Declaration

- **AB-v2-01**: Automated winner declaration via `a-b-winner.mjs` cron (currently operator-triggered only); requires ≥25 runs per model per ERROR_CLASS data

### Dashboard Visualization

- **DASH-v2-01**: Sparkline / chart rendering in weekly digest (GitHub Discussion markdown has no reliable image rendering; deferred until either GitHub adds support or a static-image fallback is investigated)

### Forward Model Evaluation

- **AB-v2-02**: `claude-opus-4-8` evaluation when production stability data exists in the codebase

## Out of Scope

| Feature | Reason |
|---------|--------|
| Widening `assertTripleGate` to accept `auto-fix:partial-verified` | LOAD-BEARING TRUST INVARIANT — would erode the gate for ALL future runs; ANTI-FEATURE explicitly forbidden by PARTIAL-04 |
| Squash-merging the v4.0-integration PR | Destroys the 777-commit audit trail that v4.0's legal-filing core value depends on |
| Force-pushing v4.0 to origin/main | Violates branch protection; admin merge via PR is the documented path |
| `workflow_dispatch` trigger on `v40-auto-fix.yml` | ANTI-FEATURE — removes the `triage` label trigger as the single legitimate auto-fix initiation point; opens an operator-bypass attack surface |
| Auto-merging the v4.0-integration PR | Requires human review of the audit trail; PUSH-01 mandates `gh pr merge --merge` (admin-merge only, not auto-merge) |
| Random A/B assignment within ERROR_CLASS | Routing by ERROR_CLASS in production is correct (sonnet faster/cheaper for easy classes); A/B evaluation is a SEPARATE stratified random assignment within each class, but in-production routing is deterministic |
| Retroactive `git commit --amend` for bookkeeping | Forward-only new commits only; never amend committed history (BOOKS-01 explicit constraint) |
| Model IDs in committed digest markdown | Already-public via PRICING_BY_MODEL keys, but renaming risk justifies omitting from operator-facing digest; if needed for A/B insights, use stable internal aliases |
| Charting / sparkline libraries in the dashboard | Zero-new-deps streak (third milestone); GitHub Discussion markdown lacks reliable image rendering |
| Bumping `@anthropic-ai/sdk` mid-milestone | EXACT-pin precedent; bump requires its own milestone with frame-shift validation |
| Bumping `pdfjs-dist` mid-milestone | `v40-pdfjs-frame-shift.yml` workflow exists for explicit bumps; not in scope for v4.1 |
| New npm dependencies for any v4.1 feature | Third consecutive zero-deps milestone (v3.1, v4.0, v4.1); every v4.1 feature maps onto existing primitives |
| Mobile browser support | Inherited from PROJECT.md Out of Scope — desktop browser extensions only |
| Chrome Web Store / Firefox AMO submission | Inherited from PROJECT.md Future — separate distribution milestone |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PRE-01 | Phase 48 | Complete |
| PRE-02 | Phase 48 | Complete |
| PRE-03 | Phase 48 | Complete |
| PRE-04 | Phase 48 | Complete |
| PUSH-01 | Phase 49 | Pending |
| PUSH-02 | Phase 49 | Pending |
| GATE-01 | Phase 50 | Pending |
| GATE-02 | Phase 50 | Pending |
| GATE-03 | Phase 50 | Pending |
| UAT-01 | Phase 51 | Pending |
| UAT-02 | Phase 51 | Pending |
| UAT-03 | Phase 51 | Pending |
| UAT-04 | Phase 51 | Pending |
| BOOKS-01 | Phase 52 | Pending |
| BOOKS-02 | Phase 52 | Pending |
| PARTIAL-01 | Phase 53 | Pending |
| PARTIAL-02 | Phase 53 | Pending |
| PARTIAL-03 | Phase 53 | Pending |
| PARTIAL-04 | Phase 53 | Pending |
| AB-01 | Phase 54 | Pending |
| AB-02 | Phase 54 | Pending |
| AB-03 | Phase 54 | Pending |
| AB-04 | Phase 54 | Pending |
| DASH-01 | Phase 55 | Pending |
| DASH-02 | Phase 55 | Pending |
| DASH-03 | Phase 55 | Pending |

**Coverage:**
- v1 requirements: 26 total across 8 categories
- Mapped to phases: 26/26 (100%)
- Unmapped: 0

---
*Requirements defined: 2026-06-02*
*Last updated: 2026-06-02 — traceability table populated by roadmapper*

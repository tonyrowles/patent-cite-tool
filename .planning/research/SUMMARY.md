# Project Research Summary

**Project:** Patent Citation Tool
**Domain:** LLM-CI / Autonomous code-fix pipeline — readiness gate, push to protected main, and forward-looking auto-fix improvements
**Researched:** 2026-06-02
**Confidence:** HIGH — all findings grounded in direct codebase inspection; line-numbered throughout

## Executive Summary

v4.1 is a maturation milestone, not a greenfield build. The v4.0 self-healing loop (auto-fix → verifier-gate → auto-promote, triple-gate `_skipCiGuard`, FLAKE 5-state machine, cost ledger v2) is already complete locally but has never run on `origin/main`. The entire milestone pivots on a single serialization point: pushing ~777 local commits to a branch-protected remote via a `v4.0-integration` PR. Nothing else in the milestone is meaningful until that push lands. Two pre-push test regressions (Test 48 ledger leak, calendar-rollover flake) and a lockfile exact-pin verification must be cleared before CI can pass on the PR. These are concrete, narrow fixes — the ledger requires a reset to its single bootstrap entry and a new guard inside `invokeAnthropicSdkWithLedger`; the flake requires epoch-relative fixture dates; the lock file requires `npm install --save-exact` to restore the caret-free pin.

The most load-bearing architectural decision in v4.1 is also the most dangerous if handled wrong: `auto-fix:partial-verified` semantics must be implemented as a **separate state machine entry point** (`assertPartialGate`) and must NOT widen `assertTripleGate` to accept the new label. The triple-gate trust invariant — verified-label + merged + triage-sourced — is the single load-bearing trust decision of v4.0, protecting legal-filing citation code from auto-promotion of unverified patches. Any relaxation of that gate, even in the "convenient" form of an OR-branch inside the existing function, permanently erodes the invariant. A Vitest test asserting `assertTripleGate` throws when given only `auto-fix:partial-verified` must land in the exact same commit that creates the new label.

Three forward-looking features (multi-model A/B, partial-verified semantics, auto-fix dashboard) are all additive and depend on UAT-47-a providing live auto-fix data before their parameters can be calibrated. The A/B rig is deterministic routing by ERROR_CLASS, not random assignment, with a pre-registered minimum of 20 cases per arm per class before winner declaration. The dashboard adds a `<details>` collapsible section to the existing weekly digest without touching the frozen 7-key `SUMMARY_KEYS` contract. Zero new npm dependencies are required for any of these features — every v4.1 change maps onto primitives already in the stack.

## Key Findings

### Recommended Stack

No new npm dependencies. v4.1 is the third consecutive milestone (v3.1, v4.0, v4.1) to ship zero net-new packages. Every feature maps onto existing primitives: `invokeAnthropicSdkWithLedger` already accepts a `model:` parameter; `build-ledger-dashboard.mjs` already produces plain markdown tables; `assertTripleGate` already handles the promotion gate; `gh api -X PUT --input` handles the ruleset patch. The `@anthropic-ai/sdk@0.100.1` exact pin holds — no version bump mid-milestone.

**Core technologies (immutable v4.0 stack):**
- `@anthropic-ai/sdk@0.100.1` (EXACT pin): SDK transport for auto-fix in CI — do not bump; minor-version breaking change risk is empirically established
- `peter-evans/create-pull-request@v8`: idempotent draft PR creation for auto-fix branches — already pinned
- Vitest: 1134-test suite; unit tests for all new components (assertPartialGate, llm-router, fix-prompt-builder model field); no new framework
- `gh` CLI (`gh api`, `gh pr edit`, `gh pr merge`): all ruleset operations and UAT runbook steps — pre-installed on ubuntu-latest

**v4.1 additions (no new deps):**
- `MODEL_BY_ERROR_CLASS` map in `auto-fix.mjs`: replaces hardcoded `MODEL` const; routes difficult ERROR_CLASSes to `claude-opus-4-7`
- `tests/e2e/lib/llm-router.js` (NEW pure-function module): static routing table + `routeModel(errorClass)` helper
- `scripts/a-b-winner.mjs` (NEW script): winner-declaration over committed ledger; outputs markdown table to stdout
- CLEANUP-04 payload: `gh api -X PUT --input ruleset-patch.json` with context-string form for `required_status_checks`

### Expected Features

**Must have (table stakes — P0/P1, blocks v4.1 close):**
- Pre-push regression fixes: Test 48 ledger reset + `llm-driver.js` Step 0 guard; calendar-rollover flake epoch-relative fix; `package-lock.json` exact pin restore
- Push v4.0-integration PR: `gh pr merge --merge` (NOT squash — 777 commits are the audit trail for a legal-filing tool)
- Live readiness UATs: UAT-47-a (end-to-end auto-fix on issue #3), UAT-47-b (dep-update pre-flight gate), UAT-47-d (daily ledger snapshot), UAT-47-e (diff-guard bypass rejection)
- CLEANUP-04 ruleset patch: add `verifier-gate` + `deps-update-gate` to `required_status_checks`; remove `bypass_actors=1` with break-glass procedure documented before removal
- v3.1 bookkeeping: re-stamp 5 HUMAN-UAT/VERIFICATION files; remove 3 orphan quick-task slug rows from STATE.md

**Should have (differentiators — P2, within v4.1 scope after P0/P1):**
- Auto-fix dashboard: `<details>` collapsible in weekly digest; 7 new metrics outside the frozen `SUMMARY_KEYS` contract; data from ledger + `gh pr` API
- `auto-fix:partial-verified` semantics: separate `assertPartialGate` (NOT a widened `assertTripleGate`); 4/5 minimum threshold with FLAKE masquerade mitigation; requires UAT-47-a calibration data
- Multi-model A/B: attempt-count escalation (sonnet at fix_attempts 1-2, opus at fix_attempts=3); `llm-router.js` static table; pre-registered N=20 per arm per class before winner declaration

**Defer to v4.2+:**
- Sparkline charts in weekly digest (GitHub Discussion markdown has no reliable image rendering)
- Automated winner declaration (requires 25+ runs per model per ERROR_CLASS)
- Per-ERROR_CLASS partial-verified thresholds (requires 25+ auto-fix runs per class for empirical basis)
- `claude-opus-4-8` evaluation (no production stability data in this codebase)

### Architecture Approach

v4.1 adds new components at the edges of the existing pipeline without modifying its core. The trust invariant (draft-PR-by-default + human-merge required + auto-promote opens SEPARATE follow-up PR + CODEOWNERS on locked paths) is preserved or hardened by every P0/P1 feature and must not be eroded by P2 features. The partial-verified path is the highest-risk change: it introduces a second terminal state in the gate state machine, and the implementation mandate is two separate entry points (`assertTripleGate` unchanged, `assertPartialGate` new) rather than one widened function.

**Major components and v4.1 changes:**

1. `tests/e2e/lib/llm-driver.js:invokeAnthropicSdkWithLedger` — Extended: Step 0 guard requires `E2E_LEDGER_PATH_OVERRIDE` when `forceApi:true && !CI`; prevents committed ledger pollution
2. `tests/e2e/lib/llm-router.js` — NEW: static `MODEL_ROUTES` frozen table + `routeModel(errorClass)` pure function; no I/O; imported by `fix-prompt-builder.js`
3. `tests/e2e/lib/fix-prompt-builder.js` — Extended: `buildFixPrompt` return gains optional `model` field via `routeModel(errorClass)`; additive
4. `scripts/auto-fix.mjs` — Extended: passes `model` from `buildFixPrompt` into `invokeAnthropicSdkWithLedger`; replaces hardcoded `MODEL` const
5. `scripts/auto-fix-promote.mjs` — Extended: new `assertPartialGate` export (does NOT call `runPromote({_skipCiGuard:true})`); `assertTripleGate` body unchanged
6. `.github/workflows/v40-verifier-gate.yml` — Extended: `ready-flip` job gains conditional step producing `auto-fix:partial-verified` label when N/M cases pass (>=60%); full-pass path unchanged
7. `.github/workflows/v40-auto-promote.yml` — Extended: job-level `if:` filter widens to include `auto-fix:partial-verified`; case-id subset filtering for partial promotions
8. `scripts/weekly-digest.mjs` — Extended: `aggregateAutoFixMetrics` + `renderAutoFixSection` (after existing sections; `<details>` collapsible; does NOT touch `SUMMARY_KEYS`)
9. `scripts/a-b-winner.mjs` — NEW: queries committed ledger; computes per-class pass rates; operator-triggered only
10. `tests/e2e/.llm-spend-ledger.json` — Reset: 4 leaked 2026-06 opus entries removed; single bootstrap entry restored
11. `package-lock.json` — Overwrite: `@anthropic-ai/sdk@0.100.1` exact pin restored

**Data flow changes:**
- Ledger write path: `forceApi:true` local dev now blocked at Step 0 if `E2E_LEDGER_PATH_OVERRIDE` unset
- Model routing: `auto-fix.mjs` → `buildFixPrompt({errorClass})` → `{model: routeModel(errorClass)}` → ledger entry with correct model attribution
- Partial-verified: parallel path to `auto-fix:verified`; different entry point (`assertPartialGate` vs `assertTripleGate`)

### Critical Pitfalls

1. **CLEANUP-04 ordering race (LOAD-BEARING)** — Adding `required_status_checks` to ruleset 17086676 BEFORE the v4.0-integration merge permanently blocks the integration PR. Order: push first, wait for one CI run to resolve `integration_id`, then PATCH the ruleset. The `integration_id` for GitHub Actions must be captured from a live check-suite post-push — cannot be hardcoded pre-push.

2. **`assertTripleGate` trust invariant erosion (LOAD-BEARING)** — If `auto-fix:partial-verified` is accepted as a Leg 1 satisfier inside `assertTripleGate`, auto-promote silently operates at a lower evidence bar for all future runs. Mitigation: `assertPartialGate` is a separate function; a Vitest test asserting `assertTripleGate` throws on `auto-fix:partial-verified` ships in the same commit as the new label.

3. **Test 48 contract relaxation instead of ledger reset** — The tempting "fix" is loosening Test 48 to allow multi-entry ledgers. This masks future leaks. Correct fix: reset committed ledger to single bootstrap entry + add `forceApi + !CI → require E2E_LEDGER_PATH_OVERRIDE` guard in `llm-driver.js`.

4. **`bypass_actors=1` removal without break-glass procedure** — With `bypass_actors: []`, a verifier-gate CI bug blocks ALL PRs including hotfixes. Recovery path via `gh api PATCH` is available but must be documented in a committed file and tested before removal.

5. **Multi-model A/B selection bias** — Routing ALL difficult cases to Opus and ALL easy cases to Sonnet produces zero valid A/B comparison data. Pre-register N=20 per arm per class; implement stratified random assignment within each class for evaluation (separate from production escalation routing).

6. **UAT-47-a label idempotency trap** — `issues: labeled` fires only on transition. If issue #3 already has `triage` label, adding it again fires no event. Runbook must: `gh issue edit 3 --remove-label triage` then `gh issue edit 3 --add-label triage`.

## Implications for Roadmap

All 4 researchers independently converged on the same 4-wave structure. The roadmapper should treat this as the canonical phase ordering.

### Phase 48: Pre-Push Regression Fixes (Wave-0)

**Rationale:** Three failing tests block CI green on the integration PR. Must land before the PR is opened. All three fixes are independent and ship in one commit set.
**Delivers:** `npm test` exits 0; committed ledger is clean single-entry bootstrap; `package-lock.json` exact-pinned
**Addresses:** Test 48 ledger leak, calendar-rollover flake, `@anthropic-ai/sdk@0.100.1` exact pin
**Avoids:** Pitfall 5 (contract relaxation), Pitfall 6 (hardcoded date fix that re-breaks next month)
**Research flag:** No research needed — line numbers confirmed; surgical fixes

### Phase 49: Push v4.0-Integration PR (Wave-1)

**Rationale:** Single serialization point. All UATs, CLEANUP-04, and forward features depend on v4.0 workflows being live on `origin/main`. Merge-commit strategy mandatory (NOT squash) — 777 commits are the audit trail for a legal-filing tool.
**Delivers:** v4.0 workflows live on origin/main; CI green on merged commit; 6 V40 workflows confirmed
**Addresses:** Push readiness gate feature; last authorized use of `bypass_actors=1`
**Avoids:** Pitfall 1 (push strategy — confirm `bypass_actors=1` still active before opening PR); Pitfall 2 prerequisite (push MUST precede CLEANUP-04)
**Research flag:** Operational step only — confirm ruleset state before PR creation

### Phase 50: CLEANUP-04 Ruleset Patch (Wave-2a)

**Rationale:** Must run AFTER push (so `integration_id` is resolvable from live CI). Must run BEFORE any new `triage` label fires post-push (to close the `bypass_actors=1` security hole). Parallelizable with Phases 51 and 52 — no shared write surface.
**Delivers:** Ruleset 17086676 enforces both required status checks; `bypass_actors` is empty array; break-glass procedure committed and tested
**Addresses:** CLEANUP-04 feature; `bypass_actors=1` and `required_status_checks rule absent` tech debt from STATE.md
**Avoids:** Pitfall 2 (ordering race), Pitfall 3 (bypass removal without break-glass)
**Research flag:** Capture `integration_id` from first CI run's check-suite before constructing PUT payload; context strings must match YAML job names byte-for-byte

### Phase 51: Live Readiness UATs (Wave-2b)

**Rationale:** Validates shipped v4.0 workflows in production. UAT-47-a is the prerequisite for calibrating partial-verified thresholds and A/B baseline parameters. Parallelizable with Phases 50 and 52.
**Delivers:** All 4 DEFERRED runbook stubs re-stamped PASS with evidence artifacts; `assertTripleGate` exercised live
**Addresses:** UAT-47-a/b/d/e features
**Avoids:** Pitfall 9 (label idempotency — remove-then-add; verify branch absent before run); UAT-47-e crafted branch must be named `test-only/diff-guard-*` and closed immediately after gate fires
**Research flag:** Plan must include remove-then-add label step and branch pre-existence check as numbered steps

### Phase 52: v3.1 Bookkeeping Cleanup (Wave-2c)

**Rationale:** Pure planning-file text edits; no push dependency; no shared write surface with Phases 50-51. Can parallelize with both.
**Delivers:** 5 HUMAN-UAT/VERIFICATION files re-stamped `status: passed`; 3 orphan quick-task rows removed from STATE.md
**Addresses:** v3.1 bookkeeping feature; 11 deferred items in STATE.md
**Avoids:** Anti-feature (retroactive commits via `git commit --amend`); forward-only new commits only
**Research flag:** Skip research — pure text edits

### Phase 53: `auto-fix:partial-verified` Semantics (Wave-3a)

**Rationale:** Depends on UAT-47-a providing empirical calibration data. Trust invariant change — highest-risk P2 feature. Code can be written in parallel with Wave-2; threshold calibration needs Phase 51 evidence.
**Delivers:** New `assertPartialGate` function; `v40-verifier-gate.yml` partial label producer; widened `v40-auto-promote.yml` filter; Vitest test asserting `assertTripleGate` throws on `auto-fix:partial-verified`
**Addresses:** `auto-fix:partial-verified` semantics feature
**Avoids:** Pitfall 4 (LOAD-BEARING — `assertTripleGate` must NOT be widened; `assertPartialGate` is a separate export that does NOT call `runPromote({_skipCiGuard:true})`; threshold floor 4/5 with FLAKE masquerade mitigation)
**Research flag:** Recommend phase-level plan review before implementation — the assertPartialGate / assertTripleGate boundary is the single most load-bearing architectural decision in v4.1

### Phase 54: Multi-Model A/B (Wave-3b)

**Rationale:** Fully independent of UAT data at the code level (defaults all classes to Sonnet). Can parallelize with Phase 53. Winner declaration deferred until N=20 per arm per class — pre-register threshold in code.
**Delivers:** `tests/e2e/lib/llm-router.js` (pure function module); `fix-prompt-builder.js` model field; `auto-fix.mjs` model routing; `scripts/a-b-winner.mjs`; Vitest contract tests
**Addresses:** Multi-model A/B feature
**Avoids:** Pitfall 7 (selection bias — stratified random within ERROR_CLASS for evaluation; `N_PER_ARM_REQUIRED` constant must gate winner declaration); Opus 35% tokenizer overhead in cost estimates
**Research flag:** `N_PER_ARM_REQUIRED = 20` must be a named constant in `a-b-winner.mjs` that throws "no winner yet" when N is below threshold — not a prose note

### Phase 55: Auto-Fix Dashboard (Wave-4)

**Rationale:** Depends on Phase 54 (reads `model` field from ledger entries for per-model breakdown). Last because purely additive display logic. Cannot break the pipeline.
**Delivers:** `aggregateAutoFixMetrics` + `renderAutoFixSection` in `weekly-digest.mjs`; `<details>` collapsible section; 7 new observable metrics (auto_fix_attempted, verified_merged, success_rate, cost_per_fix, time_to_merge, fix_attempts_p50, flake_escalation_count)
**Addresses:** Auto-fix dashboard feature
**Avoids:** Pitfall 8 (SUMMARY_KEYS frozen at 7 entries; `SUMMARY_KEYS.length === 7` Vitest assertion must pass; auto-fix metrics are a separate section); `time_to_merge` must filter `mergedAt !== null`; `cost_per_fix` must use `combinedMonthlyTotalByTransport` to avoid double-counting
**Research flag:** Standard patterns — but `time_to_merge` NaN/Infinity guard is a load-bearing correctness detail

### Phase Ordering Rationale

- Wave-0 (Phase 48) blocks everything: two failing tests block CI on the integration PR
- Wave-1 (Phase 49) is the single serialization point: push to protected main; all UATs, CLEANUP-04, and forward features depend on it
- Wave-2 items (Phases 50, 51, 52) have zero shared write surface and can run in parallel with three agents; CLEANUP-04 must run before any new `triage` label fires post-push
- Wave-3 items (Phases 53, 54) can parallelize with each other and with Wave-2; Phase 53 threshold calibration benefits from Phase 51 UAT evidence
- Wave-4 (Phase 55) depends on Phase 54 model field being populated in ledger entries

### Research Flags

Phases needing careful plan review during planning (not external research — internal design decisions):
- **Phase 50 (CLEANUP-04):** `integration_id` capture must be in the plan as explicit commands; ruleset PUT payload must be constructed from a GET of current state (to preserve existing rules)
- **Phase 51 (Live UATs):** UAT-47-a runbook must include remove-then-add label step and branch pre-existence check as numbered steps; UAT-47-e branch must be closed (not merged) immediately after gate fires
- **Phase 53 (partial-verified):** `assertTripleGate` body unchanged; `assertPartialGate` does NOT call `runPromote({_skipCiGuard:true})`; recommend plan review before coding

Phases with standard patterns (no research needed):
- **Phase 48:** Line numbers confirmed; surgical fixes
- **Phase 52:** Pure text edits
- **Phase 54:** `MODEL_ROUTES` table is a 20-line pure function; established pattern
- **Phase 55:** Additive display section; `aggregateBySummaryKey` is the template

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All findings from direct file reads; `@anthropic-ai/sdk@0.100.1` exact pin confirmed in `package.json`; `MODEL_ROUTES` maps onto existing `model:` parameter at `llm-driver.js:510` |
| Features | HIGH | Feature list from PROJECT.md milestone definition + STATE.md deferred items; all 8 target features confirmed present and correctly scoped |
| Architecture | HIGH | All integration points confirmed with line numbers; component boundaries explicit; no speculation |
| Pitfalls | HIGH | Pitfalls 1-3 and 5-6 from direct code inspection; Pitfall 4 confirmed against `assertTripleGate` lines 67-90; Pitfall 7 from ACM TOSEM study + Anthropic pricing docs |

**Overall confidence:** HIGH

### Gaps to Address

- **`integration_id` value for CLEANUP-04:** Not discoverable pre-push. Phase 50 plan must include the exact `gh api` command to capture it from the first post-push CI run. If omitting `integration_id` works (context-string-only form), that is simpler — but the PITFALLS.md research flags this as MEDIUM confidence.
- **Partial-verified threshold calibration:** The 60% floor is a starting default. UAT-47-a will provide the first empirical data point. Phase 53 plan must document the threshold as configurable and pin its current value with a static-grep Vitest test.
- **A/B sample size timing:** N=20 per arm per class at 1-5 issues/night could take weeks per class. Phase 54 must include a `NO_WINNER_YET` guard in `a-b-winner.mjs` that outputs a message rather than a false winner declaration.
- **`gh pr merge --merge` vs `--admin` for integration PR:** PITFALLS.md Pitfall 1 and ARCHITECTURE.md §1.2 have a minor tension. Phase 49 plan must confirm which path is valid by checking the current ruleset state before opening the PR.

## Sources

### Primary (HIGH confidence)
- `/home/fatduck/patent-cite-tool/tests/e2e/lib/llm-driver.js` — `invokeAnthropicSdkWithLedger` signature, `model:` param at line 510, transport tag at line 611
- `/home/fatduck/patent-cite-tool/tests/e2e/lib/llm-pricing.js` — `PRICING_BY_MODEL` entries for both models (lines 36-39)
- `/home/fatduck/patent-cite-tool/scripts/auto-fix-promote.mjs` — `assertTripleGate` implementation (lines 67-90)
- `/home/fatduck/patent-cite-tool/.github/workflows/v40-verifier-gate.yml` — job name `verifier-gate:` at line 181; `ready-flip` job at line 384
- `/home/fatduck/patent-cite-tool/scripts/weekly-digest.mjs` — `aggregateBySummaryKey` (lines 171-214); `renderDigest` (lines 244-292)
- `/home/fatduck/patent-cite-tool/tests/e2e/lib/llm-report.js` — `SUMMARY_KEYS` frozen array (lines 123-131); 7 keys confirmed
- `/home/fatduck/patent-cite-tool/tests/e2e/.llm-spend-ledger.json` — 4 leaked 2026-06 opus entries with `phase=null, transport=null` confirmed
- `/home/fatduck/patent-cite-tool/tests/e2e/scripts/e2e-weekly-digest.test.js` — `PIN_NOW` at line 64 hardcoded to May 2026
- `/home/fatduck/patent-cite-tool/package.json` — `@anthropic-ai/sdk: "0.100.1"` exact pin confirmed
- `/home/fatduck/patent-cite-tool/.planning/PROJECT.md` — v4.1 milestone definition, Key Decisions table (trust invariant line 224)
- `/home/fatduck/patent-cite-tool/.planning/STATE.md` — 8 deferred items from v4.0 close; `bypass_actors=1` and `required_status_checks rule absent` tech debt entries
- [GitHub REST API — Rulesets endpoints](https://docs.github.com/en/rest/repos/rules) — PUT ruleset endpoint; `required_status_checks` JSON structure

### Secondary (MEDIUM confidence)
- [GitHub community discussion #139808](https://github.com/orgs/community/discussions/139808) — `--input` JSON file preferred over inline `-F` for nested arrays in ruleset PATCH
- [GitHub Docs — Troubleshooting required status checks](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/collaborating-on-repositories-with-code-quality-features/troubleshooting-required-status-checks) — `integration_id` requirement for Actions-produced checks
- [Ian L. Paterson: I Tested 15 LLMs on 38 Real Coding Tasks (2026)](https://ianlpaterson.com/blog/llm-benchmark-2026-38-actual-tasks-15-models-for-2-29/) — Sonnet 4.6 == Opus 4.7 on small patches; routing beats model selection
- [GitHub blog: Agent PRs are everywhere](https://github.blog/ai-and-ml/generative-ai/agent-pull-requests-are-everywhere-heres-how-to-review-them/) — 45.1% of agent PRs require human revision; key KPI for dashboard
- [Anthropic Claude API Pricing 2026 — CloudZero](https://www.cloudzero.com/blog/claude-opus-4-7-pricing/) — opus 4.7 tokenizer overhead (~35%); effective cost gap vs sonnet 4.6 (~55%)

### Tertiary (LOW confidence)
- [Bias Testing and Mitigation in LLM-based Code Generation — ACM TOSEM 2024](https://dl.acm.org/doi/full/10.1145/3724117) — 334-task multi-model study; informs N=20 per arm floor
- [A/B Testing in LLM Deployment — Latitude](https://latitude.so/blog/ab-testing-in-llm-deployment-ultimate-guide/) — minimum sample sizes for LLM-specific A/B

---
*Research completed: 2026-06-02*
*Ready for roadmap: yes*

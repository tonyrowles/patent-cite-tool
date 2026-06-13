---
gsd_state_version: 1.0
milestone: v5.0
milestone_name: Bug Report Feature
status: planning
stopped_at: Phase 5 context gathered
last_updated: "2026-06-13T23:11:50.037Z"
last_activity: 2026-06-13
progress:
  total_phases: 5
  completed_phases: 4
  total_plans: 11
  completed_plans: 11
  percent: 80
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-12)

**Core value:** Highlight text on Google Patents, get an accurate citation reference instantly — no PDF downloading, no manual counting.
**Current focus:** Phase 5 — options page debug mode + popup fallback + live uat

## Current Position

Phase: 5
Plan: Not started
Status: Ready to plan
Last activity: 2026-06-13

## Budget

| Cap | Value | Source |
|-----|-------|--------|
| Milestone soft cap | **$15** | BUDG-01 (v4.3 requirement) |
| Milestone hard ceiling | **$30** | PITFALLS Pitfall 9 reasoning |
| Per-phase | **< $5** | BUDG-01 distribution |
| Mean per-call (`--max-turns 5` regression) | **< $0.30** | TURNS-03 cost-bound test |
| Per-issue cap (existing) | $1 (`ISSUE_HARD_CAP_USD`) | Phase 39 LEDGER-02 |
| Per-PR cap (existing) | $2 | Phase 39 LEDGER-02 |
| Per-fingerprint prompt-iter cap | **$0.50** (`PROMPT_ITER_COST_CAP_USD`) | PITER-03 (Phase 67) |

Each phase records per-phase spend in its VERIFICATION.md footer (probed against this table). Phase 68 emits the final tally and validates UAT-04 (`total spend ≤ $15`).

## Bypass Conventions

**LOAD-BEARING RUNBOOK** (per BYPASS-03 — Pitfall 11 mitigation):

- **DO NOT** use `gh pr merge --admin` on `auto-fix/*` branches. EVER.
- `--admin` bypasses the `verifier-gate` CI check but still writes `outcome: 'pass'` ledger entries via `auto-fix-promote.mjs`. These entries pollute A/B winner sample math because `assertTripleGate` (verified-label + merged + triage-sourced) does not detect the bypass when the maintainer manually adds `auto-fix:verified` before merging.
- Sole-maintainer ruleset 17086676 has `@tonyrowles` (`actor_id 254599900`) as permanent bypass actor with `bypass_mode: always` (post-v4.2 reversal — see Ruleset Decision below). The bypass is for **human-authored** changes that warrant scope-decision fast-path or maintenance commits — **not** for auto-fix promotions.
- Phase 62 `scripts/audit-bypass-merges.mjs` (BYPASS-01) queries `gh api repos/<owner>/<repo>/actions/runs` for `verifier-gate` runs completed AFTER the PR was merged; outputs CSV consumed by Phase 66's `a-b-winner.mjs --admin-bypass` filter to exclude bypass-tainted `outcome:'pass'` entries.
- Weekly digest gains bypass-count metric (BYPASS-02) so the discipline is observable in the Auto-Fix Pipeline section.

## Performance Metrics

**By Milestone:**

| Milestone | Phases | Plans | Duration |
|-----------|--------|-------|----------|
| v1.0 MVP | 4 | 8 | ~3 days |
| v1.1 Silent Mode + Infrastructure | 3 | 8 | 1 day |
| v1.2 Store Polish + Accuracy Hardening | 6 | 12 | 2 days |
| v2.0 Firefox Port | 4 | 10 | ~2 days |
| v2.1 CI/CD Pipeline | 2 | 2 | 2 days |
| v2.2 Matching Robustness | 3 | 4 | 2 days |
| v2.3 Post-v2.2 Hardening | 3 | 5 | 1 day |
| v3.0 Autonomous E2E Testing Agent | 6 | 30 | ~7 days |
| v3.1 LLM-Driven Product Improvement Loop | 7 | 31 | ~9 days |
| v4.0 Self-Healing Test Suite | 9 | 26 | ~3 days |
| v4.1 Readiness Gate + Push | 9 | 11 | ~2 days |
| v4.2 Auto-Fix Loop Live | 5 (+60.1 hotfix) | 11 | ~5 days |
| Phase 03 P01 | 4 | 2 tasks | 1 files |
| Phase 03 P02 | 25min | 3 tasks | 4 files |
| Phase 03 P03 | 5min | 3 tasks | 2 files |
| Phase 04 P01 | 25min | 3 tasks | 6 files |

## Accumulated Context

### Roadmap Evolution

- 2026-06-02: v4.1 roadmap drafted from REQUIREMENTS.md (26 reqs, 8 categories) + research/SUMMARY.md 4-wave structure. 8 phases (48-55). Wave-0 (48) blocks all; Wave-1 (49) is the single serialization point; Wave-2 (50, 51, 52) parallelizable post-push; Wave-3 (53, 54) parallelizable with Wave-2; Wave-4 (55) depends on Phase 54 model field.

- 2026-06-04: v4.2 roadmap drafted from REQUIREMENTS.md (25 reqs, 6 categories) + research/SUMMARY.md 5-phase structure. Phases 56-60. Phase 56 (LEDGER-01..04) + Phase 57 (COMMIT-01..04) are parallelizable (disjoint files); Phase 56 recommended first so UAT-47-a populates `errorClass` from day one. Phase 58 (PROMOTE-01..04) depends on Phase 56 (safeAppendLedger) and Phase 57 (branch-redirect pattern). Phase 59 (MUTATOR-01..05 + SWEEP-01..06) depends on all of Phase 56+57+58 live on origin/main; UAT sequencing locked per D-13 cost discipline (SWEEP-01 $0 smoke first, SWEEP-03 paid loop last). Phase 60 (CLEAN-01..02) fully independent; runs last to avoid noise. Coverage: 25/25 requirements mapped; 0 orphans.

- 2026-06-09: v4.3 roadmap drafted from REQUIREMENTS.md (38 reqs, 12 categories) + research/SUMMARY.md canonical 7-phase 61→62→64→65→66→67→68 sequence (skipping 63 to preserve PITFALLS-to-phase mapping; the skip is intentional and load-bearing for cross-document references). Wave 0 = Phases 61-62 (carry-over closure, required for DoD); Wave 1 = Phases 64-67 (capability expansion, parallelizable post-Wave-0); Wave 2 = Phase 68 (final cleanup, precondition-gated). Phase 61 atomic bundle (DIAG+TURNS+BUDG+UAT-01/02) jointly required for UAT-47-a/b PASS — partial states recreate v4.2 SWEEP-03 failure shape. Phase 62 closes auxiliary-leak via shared safe-append-ledger.js helper (NOT validation in appendLedgerEntry body — would break 33 pre-existing Vitest tests per Pitfall 3) + BYPASS-01/02/03 audit (Pitfall 11 — NEW v4.3 cross-cutting). Phase 64/65/66 parallelizable post-Wave-0 (disjoint files: triage-classifier.js / fix-prompt-builder.js+workflow / a-b-winner.mjs). Phase 67 highest-risk architecturally (Shape A in-process only; Shape B rejected outright as Anti-Feature; FORBIDDEN_PATHS extension to fix-prompt-builder.js + llm-router.js is non-negotiable defense-in-depth). Phase 68 must run LAST (precondition sentinel .planning/sweep-03-04-pass-evidence.yaml captured from Phase 61 UAT-01/UAT-02 PASS). Coverage: 38/38 requirements mapped; 0 orphans.

- 2026-06-12: v5.0 roadmap drafted from REQUIREMENTS.md (44 reqs, 9 categories: XPORT-01..06, PAY-01..09, PRIV-01..05, LIMIT-01..03, QUEUE-01..04, CAP-01..06, TRIG-01..04, DBG-01..02, UAT-01..06) + synthesizer's 5-phase recommendation + Architecture build-order rationale. Phase numbering RESET for v5.0 — starts at Phase 1. 5-phase structure derived naturally from the requirement groupings in REQUIREMENTS.md (which already organized reqs into the same 5 section headers). Synthesizer recommendation ACCEPTED without divergence — the dependency chain (Worker route → schema → transport layer → UI → polish + UAT) is sound and matches Architecture's build-order rationale. BLOCKING gates all resolved in Phase 1: BLOCK-01 (privacy compliance — manifest + privacy policy in same commit as Worker route), BLOCK-02 (webhook URL hygiene — wrangler secret put only; grep guard in success criteria), BLOCK-03 (IP-not-in-KV — PAY-03 hard constraint). Phase 2 is pure-function / Vitest-testable with no browser API dependencies. Phase 3 completes the full submission path without any UI — testable end-to-end before Phase 4. Phase 4 is the largest phase (10 requirements, Shadow DOM dialog + citation-UI wiring + diagnostics enrichment). Phase 5 adds secondary surfaces (options page debug mode, popup fallback) and closes with live UAT-01..06 DoD evidence. UI hints applied to Phases 4 and 5. Coverage: 44/44 requirements mapped; 0 orphans.

### Decisions

- v4.1-roadmap: Continue phase numbering from v4.0 (47 → 48). Mirrors all prior milestone conventions.
- v4.1-roadmap: 4-wave structure from canonical research convergence. Wave constraints LOCKED: Phase 48 blocks all; push is the serialization point; CLEANUP-04 must run post-merge for integration_id resolvability; partial-verified must NOT widen assertTripleGate.
- v4.1-roadmap: PARTIAL-04 is the single most load-bearing requirement. Its Vitest assertion that assertTripleGate throws on auto-fix:partial-verified ships in the SAME commit as the new label.
- v4.1-roadmap: Phase 55 (dashboard) depends on Phase 54 (model field in ledger). Phase 53 benefits from Phase 51 UAT-47-a evidence but can start in parallel.
- v4.2-roadmap: Continue phase numbering from v4.1 (55 → 56). Mirrors all prior milestone conventions (v3.0/v3.1/v4.0/v4.1).
- v4.2-roadmap: LOAD-BEARING — `v40-auto-fix.yml`'s direct-to-main ledger commit is explicitly NOT refactored. Scope lock: branch redirect applies to `v40-cost-ledger-snapshot.yml` ONLY. Verification gate: `grep -c 'git push origin main' .github/workflows/v40-auto-fix.yml` must equal 1 after Phase 57 commits.
- v4.2-roadmap: LOAD-BEARING — leak guard goes into `safeAppendLedger` wrapper in `scripts/auto-fix.mjs` scope; NOT into `appendLedgerEntry` body (would break 33 existing Vitest ledger tests).
- v4.2-roadmap: LOAD-BEARING — `assertTripleGate` body must remain byte-unchanged (Phase 53 trust invariant). Phase 58's outcome-entry additions must NOT touch the assertTripleGate body.
- v4.2-roadmap: UAT sequencing in Phase 59 is locked per D-13 cost discipline: SWEEP-01 ($0 smoke) → SWEEP-02 (~5 min) → SWEEP-03 (~$0.50-2 primary DoD) → SWEEP-04 (after mutator). Halt-on-fail at SWEEP-01 before spending API budget.
- v4.2-roadmap: Fixture-mutator (MUTATOR-01..05) works at issue-creation layer only — does NOT touch FORBIDDEN_PATHS files in the working tree. Source-tag `source: 'fixture-mutator-uat-47b'` co-designed across inject-defect.mjs and quarantine-append.mjs in the same commit.
- 2026-06-08 (Phase 59 closure): Auto-fix loop has a structural integration gap that v4.2 cannot close. Surfaced by three SWEEP-03 subscription attempts (issue #23 GOOGLE_DOM_DRIFT 2x; issue #3 WRONG_CITATION 1x). Two distinct constraints: (1) fixture-mutator design ("issue-creation layer only") leaves synthetic issue bodies without diagnostic data; the prompt scaffolds at `tests/e2e/lib/fix-prompt-builder.js:252-268` correctly refuse to fabricate fixes → `apply-check-failed`. (2) `tests/e2e/lib/llm-driver.js:94`'s `--max-turns 1` (marked "DO NOT change" — Pitfall 1+2 cost gate) prevents Claude from reading source files to understand real diagnostic-rich issues like issue #3's WRONG_CITATION → `error_max_turns`. Path D investigation confirmed no real `GOOGLE_DOM_DRIFT` issue with a DOM snippet exists in repo history (all 4 such issues are mutator synthetics). v4.2 LEDGER/COMMIT/PROMOTE/MUTATOR/SWEEP-05 work all ships on origin/main; live UAT-47-a/b end-to-end evidence is deferred to v4.3 where both architectural changes (diagnostic-injection + max-turns relaxation with `--allowed-tools=Read`) will be designed and shipped together. See `.planning/phases/59-fixture-mutator-4-uat-re-sweep/59-VERIFICATION.md` AMENDMENT 2026-06-08 for the full root-cause record.
- v4.3-roadmap: Continue phase numbering from v4.2 (60 + 60.1 hotfix → 61). Canonical sequence 61 → 62 → 64 → 65 → 66 → 67 → 68 (skipping 63). The skip is INTENTIONAL and load-bearing for cross-document references — PITFALLS pitfall-to-phase matrix uses these specific numbers; renumbering 64-68 as 63-67 would break the reference structure.
- v4.3-roadmap: LOAD-BEARING — Phase 61 is an ATOMIC BUNDLE (DIAG-01/02/03 + TURNS-01/02/03 + BUDG-01 + UAT-01 + UAT-02). Partial states recreate the v4.2 SWEEP-03 failure shape (just with different error-mode labels). DIAG and TURNS must ship in the SAME commit per v4.2 audit finding.
- v4.3-roadmap: LOAD-BEARING — flag name correctness in TURNS-01. Official Claude CLI flag is `--tools "Read,Glob,Grep"` (which RESTRICTS the palette), NOT `--allowed-tools` (kebab-case — silently no-ops) or `--allowedTools` (camelCase — grants permission without prompting but does NOT remove tools). The v4.2 carry-over note used `--allowed-tools` — REQUIREMENTS.md TURNS-01 corrects this. Vitest pin (TURNS-02) asserts argv contains `--tools Read,Glob,Grep` AND excludes `Edit`/`Bash`/`Write`/`WebFetch`/`--allowed-tools`/`--allowedTools` literally anywhere.
- v4.3-roadmap: LOAD-BEARING — `--max-turns 5` applies to SUBSCRIPTION transport ONLY. SDK transport is single-turn by API design (messages.create is one request → one response, no agent loop). This intentional asymmetry must be inline-documented at the call sites.
- v4.3-roadmap: LOAD-BEARING — forensic-ledger hardening (LEDX-01..04) lives at the SHARED-HELPER layer (`tests/e2e/lib/safe-append-ledger.js`), NOT in `appendLedgerEntry` body. Adding validation to `appendLedgerEntry` body would break 33 pre-existing Vitest ledger tests (per Pitfall 3). The 4 unguarded sites (auto-fix-promote.mjs:521/544 + e2e-explore.mjs:262/313) consume the shared helper. Phase 60.1 subscription-transport whitelist (LEDX-04 Vitest pin `T_PHASE60_1_HOTFIX_PRESERVED`) is preserved.
- v4.3-roadmap: LOAD-BEARING (NEW Pitfall 11) — sole-maintainer `--admin` bypass on ruleset 17086676 pollutes A/B winner outcome data. `scripts/audit-bypass-merges.mjs` (BYPASS-01) ships in Phase 62 with `a-b-winner.mjs --admin-bypass` filter consumed in Phase 66. Runbook discipline ("DO NOT use `gh pr merge --admin` on `auto-fix/*` branches") documented in this STATE.md ## Bypass Conventions section (BYPASS-03).
- v4.3-roadmap: LOAD-BEARING (NEW Pitfall 4) — A/B winner cross-transport contamination. Phase 54 D-19 filter only stratifies by (model, errorClass); SDK and subscription have different retry semantics. Phase 66 extends `computePerClassPerArm` to stratify by (class, arm, transport) 3-way. `TIE_THRESHOLD` raised 0.05 → 0.10 (noise-floor reasoning inline-documented). `--since-iso` filter prevents pre-v4.3 entries from contaminating the sample.
- v4.3-roadmap: LOAD-BEARING — Phase 67 prompt-iter loop ships Shape A (capture-and-surface, in-process at runDispatcher Step 10) ONLY. Shape B (full automation) is rejected outright as Anti-Feature (trust-boundary erosion via self-modifying prompts; touching `fix-prompt-builder.js` invalidates byte-stability invariants on the 5 existing scaffolds; defeats `assertTripleGate` by indirection). FORBIDDEN_PATHS extension to include `fix-prompt-builder.js` + `llm-router.js` (PITER-05) is NON-NEGOTIABLE defense-in-depth — even if Shape B ever ships in v4.4+, the auto-fix PR cannot edit scaffold source.
- v4.3-roadmap: LOAD-BEARING — Phase 68 MUST be the FINAL phase. Precondition sentinel `.planning/sweep-03-04-pass-evidence.yaml` must exist (captured from Phase 61's UAT-01/UAT-02 PASS) before destructive action; `--dry-run` is the DEFAULT for `scripts/uat-cleanup.mjs`; `--confirm` opt-in required; triple-tagged filter (issue title regex + body fingerprint marker + label match) ensures no accidental real-issue match.
- v4.3-roadmap: ZERO new npm dependencies target (fifth consecutive milestone if held). All 8 capabilities extend existing primitives via additive edits. Vitest pin holds at `^3.0.0` caret. `@anthropic-ai/sdk@0.100.1` EXACT pin held. `peter-evans/create-pull-request@v8` floating tag held. Bumps go through `check-deps-and-pr.mjs` review path.
- v4.3-roadmap: Trust invariants preserved across every phase: `assertTripleGate` body sha256-equivalent to Phase 53 baseline; `appendLedgerEntry` body byte-unchanged (additive validation at wrapper layer only); `PROMPT_SCAFFOLDS` `Object.freeze` + 5 existing-scaffold byte-stability sha256; ESLint `@anthropic-ai/sdk` single-entry-point guard; `grep -c 'git push origin main' .github/workflows/v40-auto-fix.yml` == 1 (Phase 57 scope-lock); Phase 60.1 subscription-transport whitelist.
- [Phase 50]: Closure (2026-06-03): ruleset 17086676 hardened — 5 rules including required_status_checks for verifier-gate+deps-update-gate (integration_id=15368), bypass_actors=[], current_user_can_bypass→never. Two PUTs in audit log. Test PR proved enforcement (Method A+B); break-glass runbook (docs §7) live-tested idempotent BEFORE bypass removal. Vitest D11+D12 pin jobid strings. 6 atomic commits 79d5415→9c3b016→fab8d2a→d455b32→b57d3a9→bcaa89c.
- [Phase 51]: Closure (2026-06-03): 0 PASS / 1 FAIL / 1 AUTO-DEFERRED / 1 STILL-DEFERRED / 1 BLOCKED-BY-PHASE-50. UAT-47-e FAILED — v40-verifier-gate.yml's pull_request.branches:['auto-fix/*'] targets BASE ref not HEAD; the gate cannot fire on PRs into main. UAT-47-a AUTO-DEFERRED per D-13 (sequence-gate). UAT-47-b STILL-DEFERRED (fixture-mutator authoring required). UAT-47-d BLOCKED-BY-PHASE-50 (ruleset blocks ledger-commit push to main). 5 atomic commits 3cb821a→24b4f08→aedafa0→5121c39→(final). Phase 56 follow-up enqueued (see Pending Todos) folding all four UATs into one v4.2 work unit covering verifier-gate trigger patch + ledger-commit refactor + deps-update audit + fixture-mutator. $0 API spent; no destructive mutations on origin; 2 transient test PRs (#12, #13) opened+closed with --delete-branch.
- [Phase 51.1]: Closure (2026-06-03): REGRESSION-51-01 resolved — v40-verifier-gate.yml BASE-ref filter `branches:['auto-fix/*']` REMOVED + v40-deps-update.yml `pull_request:` trigger ADDED + verbatim scope-decision fast-path step prepended to 4 PR-gate jobs (verifier-gate/regression-suite/ready-flip in verifier-gate.yml; deps-update-gate in deps-update.yml); diff-guard + dep-scan jobs unguarded by design (universal LOCKED-path check + PR-creator). Phase 50 SC-1+SC-2 preserved (final-ruleset.json byte-equals baseline on {rules, bypass_actors, current_user_can_bypass}). Break-glass §7 runbook live-tested end-to-end with one extra cycle to land closure commits after planned in-task push was blocked by its own bypass removal. Verification PR #14 captured BOTH required contexts firing (verifier-gate + deps-update-gate both SUCCESS via scope-decision fast-path), then CLOSED+branch-deleted. 8 atomic chore(51.1) commits cfb0951→a5a791c→583346e→ea45a47→9d388ad→59546dd→1aa226e→(T7 closure). Phase 56 pending-todo line amended in-place with [NOTE 2026-06-03] annotation per D-16.
- [Phase 53]: Closure (2026-06-04): all 4 PARTIAL-* REQs CLOSED. assertPartialGate + runPartialPromote added as SEPARATE entry points in scripts/auto-fix-promote.mjs (assertTripleGate body byte-unchanged vs HEAD~3 baseline; verified after each of the 3 commits). `_skipCiGuard:\s*true` grep count (non-comment) holds at 1 across all 3 commits (only the existing main() verified-branch call). PARTIAL-04 Vitest trust-invariant pin (T5: assertTripleGate throws on auto-fix:partial-verified) ships in the SAME COMMIT as PARTIAL_LABEL + assertPartialGate (D-18). v40-verifier-gate.yml ready-flip emits auto-fix:partial-verified label conditional on >=4/5 + FLAKE-absent (D-09..D-13); existing verified-label step byte-unchanged (D-10). v40-auto-promote.yml job-level if-filter widened to OR-branch (verified clause preserved verbatim); cross-workflow data path uses `<!-- partial_passing_cases: c1,c2 -->` PR-comment HTML marker. Rule 1 deviation: plan referenced non-existent `promoteFromQuarantine` export — used existing `runPromote` with `_skipCiGuard:false` (same per-case primitive, preserves trust invariant). Documented Task 3 file-list deviation: commit (c) re-touches v40-verifier-gate.yml for additive marker-tail only (PARTIAL-02 bytes unchanged). 3 atomic feat(53) commits in D-20 locked order: (a) 0aa8202 PARTIAL-01+04 → (b) 0489305 PARTIAL-02 → (c) 3d4db45 PARTIAL-03. Vitest delta: +18 unit tests (8→26 in tests/unit/auto-fix-promote-gate.test.js). Commits stay LOCAL; operator will batch-push all v4.1 phases (52-55) in single milestone-close PR. Pre-existing failures noted (NOT Phase 53): v40-verifier-gate-yaml.test.js V2 (Phase 51.1 unfinished test update); llm-ledger.test.js Test 48 (runtime-mutated working copy).
- [Phase 55]: Closure (2026-06-04): all 3 DASH-* REQs CLOSED. 3 atomic commits LOCAL in D-22 LOCKED order: (a) 82a49dd feat(55) DASH-02 helpers + Vitest → (b) 704284e feat(55) DASH-01+DASH-03 runDigest wiring → (c) <T3 hash> chore(55) closure. scripts/weekly-digest.mjs: +1 import (combinedMonthlyTotalByTransport from llm-ledger.js:592), +2 exports (renderAutoFixPipelineSection — pure-function markdown renderer; fetchAutoFixPrs — errors-returned-not-thrown contract per D-15), +1 runDigest step (6.5) appending the section AFTER renderDigest returns (preserves renderDigest's ≤50-line budget at line 290 per D-16). 5 new Vitest assertions in tests/unit/weekly-digest-auto-fix.test.js (Test 2 details/summary regex; Test 3 7 metric keys in LOCKED order; Test 4 fetchAutoFixPrs error path → all-n/a section; Test 5 cost_per_fix = 2.40 / 4 → $0.6000; Test 6 runDigest integration — captured body contains all 7 keys after Classification Breakdown; cost_per_fix = $1.2000 from synthetic ledger). SUMMARY_KEYS BYTE-UNCHANGED (`git diff HEAD~3 -- tests/e2e/lib/llm-report.js | wc -l` = 0 verified after each commit; D-12 enforced). cost_per_fix uses `combinedMonthlyTotalByTransport(ledger, month).combined` (NOT raw iteration sum; D-06 / SC-3); time_to_merge_p50 filters `mergedAt !== null` BEFORE median (D-07). D-19.1 regression gate (tests/unit/llm-report.test.js:406 `SUMMARY_KEYS.length === 7`) re-verified pass — no duplicate assertion needed in the new file. Rule 3 deviation: verify-step grep `fetchAutoFixPrs({ now: nowDate })` returned 0 because the runDigest call uses an injected-deps hook local binding `fetchAutoFixPrsImpl` (per Task 2's own recommended pattern in `<action>`); semantic invariant (call is wired) preserved by Test 6 integration test — no code fix needed. T-55-05 INFO acknowledged: most metric VALUES display `n/a` at ship time because no live auto-fix runs merged yet — wiring ships in Phase 55; data populates from Phase 56 ledger-schema extension + first live UAT-47-a (already enqueued in Pending Todos from Phase 54). autonomous: true; zero checkpoint:* tasks; gsd-plan-checker NOT mandatory per D-25. Commits stay LOCAL per D-23 — operator's v4.1 milestone-close batch PR covers Phases 52-55. **v4.1 ready for closure.** No new Phase 56 follow-up items added by Phase 55.
- [Phase 54]: Closure (2026-06-04): all 4 AB-* REQs CLOSED. 4 atomic feat(54) commits in D-24 LOCKED order: (a) d744caa AB-01 llm-router.js + Vitest (12 cases) → (b) 1efbb4c AB-02 buildFixPrompt top-level model field + Vitest (9 new cases; 44 total in file) → (c) 09809fd AB-03 auto-fix.mjs single-token swap MODEL→built.model (2-line diff exactly) → (d) 6014368 AB-04 a-b-winner.mjs + Vitest (22 cases). MODEL_ROUTES table contains GOOGLE_DOM_DRIFT + LLM_HALLUCINATED_SELECTION → claude-opus-4-7; all other classes default to claude-sonnet-4-6 via routeModel's `??`. Object.isFrozen(MODEL_ROUTES) pinned (D-02 freeze invariant). llm-router.js zero-imports purity invariant pinned by source-grep test (D-04). AB-04 ships in ABSTENTION MODE per D-20 LOCKED design — current ledger schema lacks both `errorClass` and outcome field, so script always emits NO_WINNER_YET; forward-compat post-schema-extension behavior pinned by Tests 5+6 via synthetic outcome fixtures. Rule 1 deviation: AB-02's literal return-line rewrite shows 1 `^-` line in git diff (plan's verify expected 0); the SEMANTIC additive-only invariant (D-08 — existing fields {ok, systemPrompt, userPrompt} byte-unchanged in shape + value) is preserved and pinned programmatically by Test E. Cleanup-debt: module-level MODEL const in scripts/auto-fix.mjs now dead code (intentionally NOT removed per additive-only scope_lock; Phase 56 cleanup). Phase 54 commits stay LOCAL per D-25 — operator's v4.1 milestone-close batch push (52-55 in single PR). 43 new Vitest tests; npm test green except 2 pre-existing failures (llm-ledger Test 48 + v40-verifier-gate-yaml V2) byte-identical to Phase 53 baseline. Phase 56 follow-up enqueued in Pending Todos: ledger schema extension (errorClass + pr_merged) so a-b-winner.mjs exits abstention without code edits.
- v5.0-roadmap: Phase numbering RESET for v5.0 per `--reset-phase-numbers` flag. Starts at Phase 1. v4.3 paused phases (61-67) archived at `.planning/milestones/v4.3-phases-paused/` (read-only during v5.0). v5.1 resumes at whatever phase number is natural after v5.0 closes. 5-phase structure is the synthesizer's recommendation, accepted without divergence. LOAD-BEARING: all three blocking gates (BLOCK-01 privacy compliance, BLOCK-02 webhook URL hygiene, BLOCK-03 IP-not-in-KV) land in Phase 1 — they cannot be retrofitted without changing the KV schema, manifest, or privacy policy after initial deployment. Phase 1 is entirely server-side + docs-side and requires no extension build changes. Phase 2 is pure-function / Vitest-testable with zero browser API dependencies. Phase 3 completes the full end-to-end submission path (Worker → KV → Discord) without any UI — testable before Phase 4 begins. Phase 4 is the largest phase (10 requirements). Phases 4 and 5 are UI phases (Shadow DOM dialog, options page, popup); both annotated with `UI hint: yes` for `/gsd:ui-phase` recommendation.
- v5.0-roadmap: LOAD-BEARING — Discord webhook URL must NEVER appear in any committed file. Phase 1 success criteria include a `grep -r 'discord.com/api/webhooks' .` zero-results assertion. `wrangler secret put DISCORD_WEBHOOK_URL` is the only permitted mechanism.
- v5.0-roadmap: LOAD-BEARING — `manifest.firefox.json` `data_collection_permissions` must be updated in the SAME commit as the Worker route (Phase 1). A manifest with `data_collection_permissions: { required: ["none"] }` while the Worker route exists is a reviewable AMO contradiction.
- v5.0-roadmap: LOAD-BEARING — IP address must NEVER appear in any stored report record (PAY-03). `CF-Connecting-IP` is used only for the transient `rl:{ip}` KV key (60s TTL, 5-request ceiling). Phase 1 success criteria explicitly verify zero `ip` field in the KV record.
- v5.0-roadmap: Zero new npm dependencies (sixth consecutive milestone). All components use existing Worker/KV/extension primitives: `crypto.subtle.digest` (Web Crypto API) for fingerprinting, `chrome.storage.local` for queue/rate-limit, `fetch()` from background service worker, `wrangler secret put` for Discord URL.

### Pending Todos

- Phase 56 (v4.2 backlog): refactor v40-cost-ledger-snapshot.yml + v40-auto-fix.yml ledger-commit-to-main pattern (UAT-47-d structurally blocked by Phase 50 ruleset; UAT-47-a's ledger commit also affected — both need PR-then-merge or branch-redirect) [NOTE 2026-06-03: trigger-fix sub-item closed by Phase 51.1 (commit ea45a47 + verification PR #14); ledger-commit refactor + fixture-mutator authoring + 4-UAT re-sweep remain pending v4.2.] [NOTE 2026-06-04: ADDED ledger-schema-extension sub-item — extend tests/e2e/.llm-spend-ledger.json entry shape with (a) `errorClass` field (sourced from auto-fix.mjs Step 7's errorClass var; wire into all 7 appendLedgerEntry call sites in auto-fix.mjs + the 2 in invokeAnthropicSdkWithLedger) and (b) `pr_merged` boolean or `outcome` string field (sourced from auto-fix-promote.mjs verified-promotion event; write follow-up entry with source:'auto-fix-promoted'+outcome='pass' on promotion success or source:'auto-fix-failed'+outcome='fail' on label-flap-to-failure). Once both fields populate ≥20 entries per ERROR_CLASS per model arm, scripts/a-b-winner.mjs automatically exits abstention and emits the markdown winner-decision table — no code edit needed (Phase 54's forward-compat outcome probe handles transparently). Phase 56 ALSO carries the cleanup todo to remove the now-dead module-level MODEL const in scripts/auto-fix.mjs (Phase 54 left it per additive-only scope_lock).] [NOTE 2026-06-04: v4.2 roadmap created (Phases 56-60); this entire Pending Todo is now addressed by the roadmap. Phase 56=LEDGER+LEAK, Phase 57=COMMIT, Phase 58=PROMOTE, Phase 59=MUTATOR+SWEEP, Phase 60=CLEAN. MODEL const cleanup moved to Phase 60 (CLEAN-01).]

- v4.3 (CARRY-OVER from v4.2 Phase 59 SWEEP-03/04 architectural deferral, filed 2026-06-08): The auto-fix loop has an architectural integration gap that prevents live UAT-47-a/b end-to-end evidence under current design. Two distinct failure modes were surfaced by three SWEEP-03 attempts (2026-06-06 issue #23 GOOGLE_DOM_DRIFT API-key blocker; 2026-06-07 issue #23 GOOGLE_DOM_DRIFT subscription apply-check-failed; 2026-06-08 issue #3 WRONG_CITATION subscription error_max_turns):
  (A) **Diagnostic-injection mutator**: extend `tests/e2e/scripts/inject-defect.mjs` to embed seeded but realistic diagnostic content in the synthetic issue body — DOM snippet for GOOGLE_DOM_DRIFT (mirror `tests/e2e/lib/google-patents-page.js` selector patterns); Verifier Disagreement block for WRONG_CITATION (mirror Phase 35 `e2e-nightly` issue shape). Co-design with prompt-scaffold expectations in `tests/e2e/lib/fix-prompt-builder.js:252-268`; pin via Vitest fixture (deterministic same-seed → same-snippet).
  (B) **Max-turns relaxation**: increase `--max-turns` from `1` to ~5 in `tests/e2e/lib/llm-driver.js:94` AND add `--allowed-tools Read,Glob,Grep` (no `Edit`/`Bash` to preserve the Pitfall 1+2 cost-discipline gate). Replace the existing `--max-turns 1` regression test pin with a `--max-turns 5 --allowed-tools Read,Glob,Grep` pin. Required for both subscription and SDK transports.
  Both (A) AND (B) are required for SWEEP-03/04 to PASS end-to-end. Filed against v4.3 milestone. Also carries: (C) **forensic-ledger schema hardening** — 3 orphan `claude-opus-4-7[1m]` ledger entries surfaced 2026-06-08 with no `source`/`transport` fields; tighten ledger schema to REQUIRE these on all entries (currently dispatcher-only) to close the auxiliary-leak path; and (D) **synthetic-issue cleanup** — close issues #20/21/22/23 (the 4 mutator-injected GOOGLE_DOM_DRIFT triage issues from SWEEP-03 attempts) once v4.3 architectural work is decided. [NOTE 2026-06-09: v4.3 roadmap created (Phases 61, 62, 64, 65, 66, 67, 68); this entire Pending Todo is now addressed by the roadmap. Phase 61=DIAG+TURNS+BUDG+UAT-01/02 (atomic), Phase 62=LEDX+BYPASS, Phase 64=TRIAGE, Phase 65=SCAF, Phase 66=ABWIN, Phase 67=PITER (Shape A only), Phase 68=CLEAN+UAT-03/04. CORRECTION applied during requirements scoping: the canonical CLI flag is `--tools` (RESTRICTS palette) not `--allowed-tools` (kebab-case silently no-ops) or `--allowedTools` (camelCase grants permission without removing). TURNS-01 codifies the correct argv. SDK transport is single-turn by API design and stays unchanged.] [NOTE 2026-06-12: v4.3 paused at Phase 67 boundary (6/7 phases shipped). v4.3 carry-over (Phase 68 destructive UAT + final spend tally) deferred to v5.1 alongside bug-report ingestion requirements. v4.3 paused-phase artifacts archived to `.planning/milestones/v4.3-phases-paused/`. v40-auto-fix CI workflow set to `workflow_dispatch:` only (commit d8d54c4).]

### Blockers/Concerns

- **Phase 1 (v5.0):** Before planning, confirm: (a) exact TOML syntax for adding second `[[kv_namespaces]]` block to `worker/wrangler.toml` (STACK research verified `[[double-bracket]]` = append-to-array, but the new namespace ID must be created via `wrangler kv namespace create "BUG_REPORTS"` before editing the file), (b) the Firefox `data_collection_permissions` taxonomy — PITFALLS and FEATURES research diverge slightly on whether `websiteContent` belongs in `required` or `optional` (selection text is user-controlled per-submission via the [Remove selection text] toggle; REQUIREMENTS.md PRIV-01 specifies `required: ["technicalAndInteraction", "websiteActivity"], optional: ["websiteContent"]` — use REQUIREMENTS.md as the authority), (c) confirm `worker/.dev.vars` is already in `.gitignore` or add it.
- **Phase 2 (v5.0):** Pure-function phase — no browser API dependencies. Main risk is the fingerprint reproducibility test: `buildReportPayload()` must produce byte-identical JSON on identical inputs. Ensure the function sorts object keys deterministically or uses a fixed field order (JSON.stringify does not guarantee key order across JS engines).
- **Phase 3 (v5.0):** The disk-first queue design (QUEUE-01) requires writing to `chrome.storage.local` BEFORE the fetch attempt. Do not defer storage write until after fetch succeeds. This is the Pitfall 6 (SW termination) mitigation — review Pitfall 6 prevention strategy during planning.
- **Phase 4 (v5.0):** Largest phase (10 requirements). Shadow DOM modal must render inside the EXISTING `getCitationHost()` shadow host — do NOT create a new shadow root. The report dialog uses the same closed-shadow infrastructure. The error log ring buffer (PAY-08) captures from `console.error` + `console.warn` in the content script — NOT a new wrapper library; simple array capped at 20 entries.
- **Phase 5 (v5.0):** Live UAT requires the Cloudflare Worker deployed (Phase 1) and the full extension built + loaded as unpacked extension. Cross-browser UAT-05 requires two browser environments. Server-side dedup UAT-03's 15-minute window means the operator must wait between the first submission and the third submission (or manipulate the KV TTL for testing).

## Deferred Items

Items carried forward from v4.0 milestone close on 2026-06-02 — resolved by v4.1 phases:

| Category | Item | Status | Notes |
|----------|------|--------|-------|
| uat_gap | 47-UAT-DEFERRED.md | partial | 4 DEFERRED runbook stubs re-stamped in Phase 51-UAT-EVIDENCE.md: UAT-47-e FAIL (verifier-gate trigger bug surfaced), UAT-47-a AUTO-DEFERRED (D-13), UAT-47-b STILL-DEFERRED, UAT-47-d BLOCKED-BY-PHASE-50; all four folded into Phase 56 follow-up |
| tech_debt | bypass_actors=1 on ruleset 17086676 | deferred | Owner-self bypass_mode=always; addressed in Phase 50 |
| tech_debt | required_status_checks rule absent | deferred | verifier-gate + deps-update-gate missing; addressed in Phase 50 |
| uat_gap | 32-UAT-EVIDENCE.md stale frontmatter | passed | Addressed in Phase 52 |
| uat_gap | 35-HUMAN-UAT.md stale frontmatter | partial | Addressed in Phase 52 |
| uat_gap | 36-HUMAN-UAT.md stale frontmatter | partial | Addressed in Phase 52 |
| uat_gap | 37-HUMAN-UAT.md stale frontmatter | partial | Addressed in Phase 52 |
| uat_gap | 38-UAT-EVIDENCE.md stale frontmatter | unknown | Addressed in Phase 52 |

## Deferred Items (acknowledged at v4.1 milestone close 2026-06-04)

| Category | Item | Status | Resolution |
|----------|------|--------|------------|
| verification_gap | Phase 51: 51-VERIFICATION.md | gaps_found | 4 UATs deferred to Phase 56 v4.2; documented in 51-UAT-EVIDENCE.md + STATE.md Pending Todos |
| quick_task | 1-fix-off-by-2-error-in-patent-column-line | missing | Substantively closed pre-v4.1; orphan-row removed from STATE.md Deferred Items by Phase 52 BOOKS-02; directory retained as historical record |
| quick_task | 2-fix-ci-commit-package-lock-json-currentl | missing | Substantively closed pre-v4.1; same as above |
| quick_task | 260412-fde-fix-spurious-results-reporting-impossibl | missing | Substantively closed pre-v4.1; same as above |

## Deferred Items (acknowledged at v4.2 milestone close 2026-06-09)

| Category | Item | Status | Resolution |
|----------|------|--------|------------|
| verification_gap | Phase 59: 59-VERIFICATION.md SWEEP-03 | architecturally-deferred | v4.3 carry-over: requires diagnostic-injection mutator + --max-turns relaxation with --allowed-tools=Read. See 59-VERIFICATION.md AMENDMENT 2026-06-08. [NOTE 2026-06-09: addressed by v4.3 Phase 61 atomic bundle (DIAG-01/02/03 + TURNS-01/02/03 + UAT-01). TURNS-01 corrects flag-name to `--tools` (RESTRICTS palette) — NOT `--allowed-tools`/`--allowedTools`.] |
| verification_gap | Phase 59: 59-VERIFICATION.md SWEEP-04 | architecturally-deferred | Inherits SWEEP-03 architectural constraints; production-path proof deferred (MUTATOR-04 invariant verified via Vitest defense-in-depth G9-a/G9-b). [NOTE 2026-06-09: addressed by v4.3 Phase 61 UAT-02.] |
| verification_gap | Phase 59: 59-VERIFICATION.md SWEEP-06 | architecturally-deferred | Cleanup automation depends on SWEEP-03/04 PASS evidence; synthetic-issue cleanup (#20/21/22/23) carried to v4.3. [NOTE 2026-06-09: addressed by v4.3 Phase 68 (CLEAN-01/02/03 + UAT-03). Precondition sentinel `.planning/sweep-03-04-pass-evidence.yaml` enforces ordering — Phase 68 cannot run until Phase 61 captures SWEEP-03/04 PASS evidence.] |
| quick_task | 1-fix-off-by-2-error-in-patent-column-line | missing | Pre-v4.1 closure record; persists in audit-open due to directory presence; no action needed |
| quick_task | 2-fix-ci-commit-package-lock-json-currentl | missing | Same as above |
| quick_task | 260412-fde-fix-spurious-results-reporting-impossibl | missing | Same as above |

## Deferred Items (acknowledged at v4.3 paused milestone 2026-06-12)

| Category | Item | Status | Resolution |
|----------|------|--------|------------|
| verification_gap | Phase 68: destructive UAT-03 + final spend tally | paused | Blocked on `.planning/sweep-03-04-pass-evidence.yaml` sentinel; deferred to v5.1 alongside bug-report ingestion reqs |
| carry_over | AFIX-DEF-01..03: v4.3 Phase 68 work | paused | 17 unpushed Phase 67 commits (5a6630a..5b749b1) stay local; v5.1 resumes with these + bug-report ingestion requirements |

## Session Continuity

Last session: 2026-06-13T23:11:50.026Z
Stopped at: Phase 5 context gathered
Resume file: .planning/phases/05-options-page-debug-mode-popup-fallback-live-uat/05-CONTEXT.md

## Operator Next Steps

- Run `/gsd:plan-phase 1` to begin Phase 1 (Worker Route + KV Schema + Privacy Compliance Groundwork). Phase 1 is entirely server-side + docs-side — no extension build changes. The three blocking gates (privacy compliance, webhook URL hygiene, IP-not-in-KV) must all land in this phase.
- Before planning Phase 1: run `cd worker && npx wrangler kv namespace create "BUG_REPORTS"` to get the new namespace ID for `wrangler.toml`.
- After Phase 1 ships: run `/gsd:plan-phase 2` (Shared Constants + Pure Payload Builder — pure function, Vitest-testable, no browser API deps).
- Phases 4 and 5 are UI phases — consider `/gsd:ui-phase` for Shadow DOM dialog implementation.

# Requirements: Patent Citation Tool — v4.0 Self-Healing Test Suite

**Defined:** 2026-05-30
**Core Value:** Highlight text on Google Patents, get an accurate citation reference instantly — no PDF downloading, no manual counting.
**Milestone Goal:** Close the LLM-driven feedback loop end-to-end — triaged GitHub issues from the v3.1 pipeline automatically produce draft PRs with proposed fixes, the affected case is re-verified on the proposed branch, and on merge the quarantine entry promotes to golden — preserving human-gated approval for every patch that ships.

## v4.0 Requirements

Requirements for this milestone. Each maps to roadmap phases (continued numbering from v3.1). REQ-IDs continue project conventions.

### PROMPT — Issue body → fix-prompt pipeline (injection-defended)

- [ ] **PROMPT-01**: `tests/e2e/lib/fix-prompt-builder.js` wraps parsed issue body in an `<issue_body_untrusted>...</issue_body_untrusted>` envelope before composing the LLM fix prompt — direct analog to v3.1's `<patent_data>` defense; Vitest test asserts envelope presence in every generated prompt
- [ ] **PROMPT-02**: `tests/e2e/lib/issue-payload-builder.js` (v3.1 builder) escapes any occurrences of `<issue_body_untrusted>` / `</issue_body_untrusted>` delimiter strings in LLM rationale, verifier windows, and golden diff sections — prevents v3.1-generated issues from closing the v4.0 envelope; Vitest test exercises a crafted-payload case
- [ ] **PROMPT-03**: `lib/fix-prompt-builder.js` exports a frozen `PROMPT_SCAFFOLDS` registry with one builder per non-skip ERROR_CLASS (WRONG_CITATION, LLM_HALLUCINATED_SELECTION, WORKER_FALLBACK_FAILED, GOOGLE_DOM_DRIFT, HARNESS_ERROR); `buildFixPrompt({errorClass, ...})` returns `{ok:false, escalate:'re-quarantine'}` for FLAKE and `{ok:false, escalate:'retry'}` for LLM_API_ERROR and `{ok:false, escalate:'close-as-pass'}` for PASS
- [ ] **PROMPT-04**: ESLint `no-restricted-imports` rule on `tests/e2e/lib/fix-prompt-builder.js` forbids `node:fs`, `node:child_process`, and `node:path` imports — enforces purity invariant (mirrors `issue-payload-builder.js` discipline); rule fails lint on a deliberately-introduced violating import

### LEDGER — Unified cost tracking across API + subscription

- [ ] **LEDGER-01**: `tests/e2e/lib/llm-ledger.js` `appendLedgerEntry()` accepts new fields `transport` (`'subscription' | 'sdk'`) and `phase` (string, e.g. `'40-auto-fix'`); existing v3.1 callers continue to work (additive only); Vitest schema-guard validates new fields
- [ ] **LEDGER-02**: New `combinedMonthlyTotal(ledger)` helper in `llm-ledger.js` sums spend across both transports for the current month; both transports counted against the same $80 warn / $100 hard-cap thresholds; Vitest test exercises the cross-transport accumulation path
- [ ] **LEDGER-03**: Per-day ($10), per-issue ($1), and per-PR ($2) sub-caps enforced in addition to the monthly cap; `invokeAnthropicSdkWithLedger` and `invokeClaudePWithLedger` refuse a new invocation when any sub-cap is exceeded; Vitest tests cover each sub-cap boundary
- [ ] **LEDGER-04**: `tests/e2e/.llm-spend-ledger.json` (existing v3.1 path) flipped from gitignored to committed-but-versioned; v40 auto-fix and weekly-digest workflows commit ledger updates atomically with their primary commit using `[skip ci]` (mirrors `e2e-weekly-digest.yml:98-110` pattern)

### DEPS — Dependency-update auto-PRs

- [ ] **DEPS-01**: `.github/workflows/v40-deps-update.yml` runs `0 9 * * 1` (Monday 09:00 UTC) + `workflow_dispatch`; `scripts/check-deps-and-pr.mjs` queries `npm outdated --json` against a frozen watchlist (playwright, pdfjs-dist, sharp, vitest, esbuild, @anthropic-ai/sdk); static-grep test pins the cron schedule and watchlist
- [ ] **DEPS-02**: Each dep-update PR runs the full nightly suite (smoke + 76-case regression + fault-injection) against the new version before being marked ready-for-review; gate is required-status-check (cannot be auto-merged or marked ready without it); YAML-level test asserts gate presence
- [ ] **DEPS-03**: Security updates (`npm audit --json` flagged) opened as their own PR; minor updates grouped into a single PR per `peter-evans/create-pull-request@v8` invocation; Vitest test validates the partition logic
- [ ] **DEPS-04**: Verifier's `pdfjs-dist` pinned separately from the extension's `pdfjs-dist` (currently shared) — dep-update PRs that bump pdfjs trigger a verifier-frozen pre-flight that re-runs against the OLD pdfjs version to confirm fix is real, not a frame-shift artifact; static-grep test pins separate dep declarations

### VERIFIER-GATE — PR gating before ready-for-review

- [ ] **VFY-GATE-01**: `.github/workflows/v40-verifier-gate.yml` triggers on `pull_request.opened/synchronize/reopened` filtered to `auto-fix/*` head branches; runs affected case from PR body `<!-- affected_cases: id1,id2 -->` comment 3× consecutively; only flips draft→ready if all 3 runs pass Tier A/B; PR comment posts results on any failure
- [ ] **VFY-GATE-02**: Same workflow ALSO runs the full 76-case regression suite on the PR branch; any regression on a previously-passing case blocks ready-for-review; static-grep test asserts the regression step exists
- [ ] **VFY-GATE-03**: PR diff size cap — `scripts/auto-fix.mjs` rejects diffs larger than 200 LOC in `src/` or 50 LOC in `tests/` (initial cap; calibrate after first 10 fixes); diffs above the cap stay in draft with a `human-review-required` label and a PR comment explaining the rejection
- [ ] **VFY-GATE-04**: Verifier code (`tests/e2e/lib/pdf-verifier.js`) and golden baseline (`tests/golden/baseline.json`) pinned to `origin/main` during the PR gate run (NOT the PR branch) — prevents an auto-fix from "fixing" the verifier to pass; diff-guard regex bank rejects diffs touching `tests/test-cases.js`, `tests/golden/baseline.json`, `tests/e2e/test-cases-quarantine.js`, `.github/workflows/v40-*.yml`, `tests/e2e/.llm-spend-ledger.json`, `CODEOWNERS`; rejection raised pre-`git apply`

### AUTOFIX — Core fix proposer + workflow

- [ ] **AUTOFIX-01**: `scripts/auto-fix.mjs` accepts `--issue <n>`, parses the ERROR_CLASS label, routes to the matching `PROMPT_SCAFFOLDS[errorClass]` builder; FLAKE / LLM_API_ERROR / PASS classes short-circuit to their escalation paths without invoking the LLM; Vitest test asserts each class's routing
- [ ] **AUTOFIX-02**: `.github/workflows/v40-auto-fix.yml` triggers on `issues.labeled` filtered to `triage`; uses `peter-evans/create-pull-request@v8` to atomically branch (`auto-fix/<issue-n>-<fp8>`), commit, push, and open the PR with `--draft`; PR body includes the `<!-- affected_cases: id1,id2 -->` HTML comment for downstream parsers
- [ ] **AUTOFIX-03**: `auto-fix.mjs` runs `git apply --check` BEFORE `git apply` to validate the proposed diff; rejects the diff outright if it touches any path in the v4.0 diff-guard regex bank (test-cases.js, baseline.json, quarantine corpus, .github/workflows, ledger, CODEOWNERS); rejection writes a PR comment naming the violated path
- [ ] **AUTOFIX-04**: `auto-fix.mjs` checks `git ls-remote --heads origin auto-fix/<n>-<fp8>` BEFORE invoking the LLM; if the branch already exists, exits 0 with an "already attempted" PR comment (prevents label-flap from triggering N redundant LLM calls); concurrency group `v40-auto-fix-${{ event.issue.number }}` with `cancel-in-progress: false` provides workflow-level idempotency
- [ ] **AUTOFIX-05**: `auto-fix.mjs` tracks `fix_attempts` per fingerprint (stored as a PR comment or as a field in the ledger); after 3 failures (verifier-gate rejected, diff applied but verifier-gate failed, etc.), adds a `human-review-required` label to the source issue and refuses further auto-fix attempts on that fingerprint; Vitest test exercises the 4th-attempt-rejected path
- [ ] **AUTOFIX-06**: `npm run fix-issue <n>` wraps `node scripts/auto-fix.mjs --transport subscription` for free local iteration against Max 5 credit; subscription mode refuses to push without explicit `--push` flag (dev review default); `package.json scripts.fix-issue` declared

### PROMOTE — Quarantine → golden after merge

- [ ] **PROMOTE-01**: `.github/workflows/v40-auto-promote.yml` triggers on `pull_request.closed && merged && contains(labels, 'auto-fix:verified')`; invokes `scripts/auto-fix-promote.mjs --pr <n>`; before calling `runPromote({_skipCiGuard:true})`, the script asserts ALL of: (1) PR has `auto-fix:verified` label, (2) `event.pull_request.merged === true`, (3) source issue carried `triage` label — fails with non-zero exit if any assertion fails; Vitest test exercises each gate's rejection
- [ ] **PROMOTE-02**: Auto-promote opens a SEPARATE follow-up PR adding the case to `tests/test-cases.js` (never modifies test-cases.js in the original auto-fix PR, never commits direct to main); the follow-up PR has `Allow auto-merge: OFF` and requires human merge — preserves v3.1's `promote-from-quarantine` human-gated trust invariant; YAML-level test asserts the workflow doesn't push direct to main
- [ ] **PROMOTE-03**: After successful follow-up PR creation, the workflow runs `gh issue close <source-issue> --reason completed --comment "Fixed in PR #X (auto-promote PR #Y)"`; Vitest mock-gh test confirms the comment + close arguments
- [ ] **PROMOTE-04**: Post-merge verifier re-check — after the auto-fix PR merges to main, a follow-up workflow step re-runs the verifier on the affected case from main HEAD (NOT the merged commit) to confirm the fix landed cleanly (catches squash-merge regressions); failure files a regression issue with `e2e-nightly` + `WRONG_CITATION` + `post-merge-regression` labels

### FLAKE-HANDLING — 5-state machine + escalation

- [ ] **FLAKE-01**: `tests/e2e/lib/triage-classifier.js` replaces the v3.1 binary CONFIRMED/FLAKE classification with a 5-state machine (CONFIRMED_BUG / LIKELY_BUG / INTERMITTENT / FLAKE / FLAKE_ESCALATION); per-case rolling 10-element rerun-outcomes ring buffer drives state transitions; Vitest test exercises each transition
- [ ] **FLAKE-02**: After N=3 FLAKE re-files within 14 days for the same fingerprint, the classifier opens a `flake-investigation` issue (no auto-fix attempt); the same fingerprint is suppressed from re-filing for 30 days; static-grep test pins the N and suppression-window values
- [ ] **FLAKE-03**: `scripts/quarantine-append.mjs` gains a `--escalate-stable-runs-reset 1` flag; `auto-fix.mjs` invokes this when the dispatched ERROR_CLASS is FLAKE — resets `stable_runs` counter to bump the case back to fresh state instead of opening a PR; Vitest integration test exercises the reset path

### CLEANUP — Milestone close (Phase 47)

- [ ] **CLEANUP-01**: Integration audit verifies all v4.0 cross-phase wiring (v3.1 primitives → v4.0 consumers per the 5 touchpoints in ARCHITECTURE.md §4); fragility warnings documented and fixed as atomic commits (mirrors v3.1 Phase 38 INT-FIX-* pattern)
- [ ] **CLEANUP-02**: Nyquist coverage stamped on each v4.0 phase that carried draft VALIDATION.md; same retro-document pattern as v2.3 and v3.1 Phase 38; static-grep tests pin the validated contracts where applicable
- [ ] **CLEANUP-03**: Live HUMAN-UAT confirmations: (a) fork-test of end-to-end auto-fix flow against a real triage-labeled issue, (b) dep-PR pre-flight gate verified to block on regression, (c) FLAKE escalation verified to suppress re-files, (d) ledger snapshot workflow verified to commit daily snapshot, (e) verifier-gate diff-guard verified to reject a crafted bypass attempt
- [ ] **CLEANUP-04**: Branch protection / CODEOWNERS audit — verify `Settings → Allow auto-merge: OFF` at repo level; verify branch protection ruleset on `main` with `Do not allow bypassing: ON` and required-status-checks listing the verifier-gate workflow; verify `CODEOWNERS` pins `src/`, `tests/`, `.github/workflows/`, `tests/golden/`, `tests/e2e/test-cases-quarantine.js`; static-grep test asserts CODEOWNERS contents are pinned

---

## Out of Scope (v4.0 — explicit exclusions)

- **Auto-merge of auto-fix PRs** — destroys human-gated trust invariant for citation-accuracy code (legal-filing core value). All auto-fix PRs require human merge.
- **Agentic loops without iteration cap** — `fix_attempts` cap of 3 enforced; no unbounded LLM retry.
- **LLM-as-judge for verifier disagreements** — the verifier is the ground truth; LLM cannot adjudicate verifier-vs-extension ties.
- **Direct-to-main commits from auto-promote** — all promotions go through a follow-up PR.
- **Per-error-class auto-fix for FLAKE, LLM_API_ERROR, PASS** — explicit skip paths; FLAKE goes to re-quarantine, LLM_API_ERROR retries, PASS closes as false-positive.
- **Fix-prompt-builder access to filesystem or subprocesses** — pure functions only; ESLint-enforced.
- **Anthropic SDK 0.100.1 auto-bumping** — pinned via exact version (not caret); excluded from `v40-deps-update.yml` watchlist; manual review required for SDK bumps.
- **Renovate/Dependabot adoption** — roll-your-own per `peter-evans/create-pull-request@v8` + `npm outdated --json` (cleaner integration with nightly-suite gate).
- **Pre-merge shadow corpus** — addressing "how do we know this fix doesn't break case 77 we haven't seen yet" deferred to a later milestone.

## Future (deferred from v4.0)

- **`auto-fix:partial-verified` semantics** — verifier passes on 3/5 affected cases gates flip? Defaults to all-or-nothing in v4.0; revisit empirically.
- **Cross-issue fix batching** — single PR that fixes N related issues at once. Out of scope for v4.0; one issue per PR.
- **Auto-fix dashboard / triage metrics digest** — extend weekly-digest with auto-fix success rate, cost-per-fix, time-to-merge. Deferred to v4.1.
- **Multi-model A/B (sonnet vs opus) for difficult classes** — explore in v4.1 after baseline data exists.

## Traceability

Coverage: 33 / 33 v4.0 requirements mapped to exactly one phase (no orphans, no duplicates). Phases 39-47 (continued numbering from v3.1).

| REQ-ID | Phase | Notes |
|--------|-------|-------|
| PROMPT-01 | Phase 42 | `<issue_body_untrusted>` envelope in fix-prompt-builder |
| PROMPT-02 | Phase 42 | FORBIDDEN_DELIMITERS escape in issue-payload-builder |
| PROMPT-03 | Phase 42 | Frozen PROMPT_SCAFFOLDS registry (WRONG_CITATION + skip-class returns) |
| PROMPT-04 | Phase 42 | ESLint purity guard on fix-prompt-builder |
| LEDGER-01 | Phase 39 | Additive `transport` + `phase` fields on appendLedgerEntry |
| LEDGER-02 | Phase 39 | combinedMonthlyTotal helper, unified $80/$100 cap |
| LEDGER-03 | Phase 39 | Per-day/per-issue/per-PR sub-caps |
| LEDGER-04 | Phase 39 | Committed ledger flip + atomic `[skip ci]` commit pattern |
| DEPS-01 | Phase 40 | v40-deps-update.yml cron + watchlist |
| DEPS-02 | Phase 40 | Nightly-suite required-status-check gate |
| DEPS-03 | Phase 40 | Security vs minor PR partitioning |
| DEPS-04 | Phase 40 | Verifier pdfjs-dist pinned separately + frame-shift pre-flight |
| VFY-GATE-01 | Phase 41 | 3× affected-case verifier check |
| VFY-GATE-02 | Phase 41 | 76-case regression check on PR branch |
| VFY-GATE-03 | Phase 41 | Diff-size cap (200 LOC src / 50 LOC tests) |
| VFY-GATE-04 | Phase 41 | Verifier pinned to origin/main + diff-guard regex bank |
| AUTOFIX-01 | Phase 42 | Dispatcher routing via PROMPT_SCAFFOLDS |
| AUTOFIX-02 | Phase 43 | v40-auto-fix.yml workflow + draft PR via peter-evans/create-pull-request@v8 |
| AUTOFIX-03 | Phase 42 | git apply --check + diff-guard pre-apply rejection |
| AUTOFIX-04 | Phase 42 | git ls-remote idempotency + workflow concurrency group |
| AUTOFIX-05 | Phase 42 | fix_attempts retry tracking + human-review-required label |
| AUTOFIX-06 | Phase 46 | npm run fix-issue subscription wrapper |
| PROMOTE-01 | Phase 44 | Triple-gate assertion (verified-label + merged + triage-sourced) |
| PROMOTE-02 | Phase 44 | Separate follow-up PR (NEVER direct-to-main) |
| PROMOTE-03 | Phase 44 | gh issue close on source after follow-up PR |
| PROMOTE-04 | Phase 44 | Post-merge verifier re-check on main HEAD |
| FLAKE-01 | Phase 45 | 5-state classifier + 10-element ring buffer |
| FLAKE-02 | Phase 45 | N=3 / 14-day FLAKE escalation + 30-day suppress |
| FLAKE-03 | Phase 45 | quarantine-append --escalate-stable-runs-reset 1 flag |
| CLEANUP-01 | Phase 47 | Integration audit across 5 v3.1→v4.0 touchpoints |
| CLEANUP-02 | Phase 47 | Nyquist coverage stamping on carry-over phases |
| CLEANUP-03 | Phase 47 | Live HUMAN-UAT (5 confirmations) |
| CLEANUP-04 | Phase 47 | Branch-protection/CODEOWNERS audit (initial setup in Phase 39) |

---

**Total v4.0 requirements:** 33 across 8 categories (PROMPT 4, LEDGER 4, DEPS 4, VFY-GATE 4, AUTOFIX 6, PROMOTE 4, FLAKE 3, CLEANUP 4)

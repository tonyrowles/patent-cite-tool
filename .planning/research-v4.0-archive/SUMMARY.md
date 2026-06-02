# Project Research Summary — v4.0 Self-Healing Test Suite

**Project:** Patent Citation Tool — v4.0 Self-Healing Test Suite
**Domain:** LLM-driven auto-fix PR pipeline layered on the v3.1 LLM triage feedback loop
**Researched:** 2026-05-30
**Confidence:** HIGH (all 4 research dimensions)

## Executive Summary

v4.0 closes the LLM feedback loop end-to-end: triaged GitHub issues from the v3.1 pipeline automatically produce *draft* PRs with proposed fixes, the affected case is re-verified on the proposed branch, and on merge the quarantine entry promotes to golden — preserving human-gated approval for every patch that ships. The architecture is purely additive on top of v3.1: `e2e-nightly.yml` needs zero modification, every new component attaches to the issue surface (label = `triage`) downstream of what v3.1 already produces. Per-ERROR_CLASS routing is the v4.0 differentiator — off-the-shelf systems (OpenHands, SWE-Agent, Copilot Coding Agent) run a single generic agent, but v3.1 already classifies, so v4.0 can route 8 classes to 5 specialized fix paths + 3 explicit skip paths (FLAKE, LLM_API_ERROR, PASS).

The stack adds exactly two third-party dependencies: `@anthropic-ai/sdk@0.100.1` (exact-pinned — 30+ minor versions broke API surfaces twice in 2026-Q2) for the CI-side API transport, and `peter-evans/create-pull-request@v8` GitHub Action for atomic branch + commit + draft-PR creation. The cost ledger lives at a committed `tests/e2e/.llm-spend-ledger.json` (flipped from gitignored), unifying subscription-local and API spend under one `LEDGER_PATH`. Three risks dominate v4.0's design surface: (1) issue-body prompt injection into the fix-prompt builder — the load-bearing v4.0 boundary, requiring its own `<issue_body_untrusted>` envelope analogous to v3.1's `<patent_data>` defense; (2) API cost runaway in CI — subscription-local naturally caps at $100/mo via headless `claude -p` ledger but the SDK has no such structural cap, requiring per-day + per-issue + per-PR + per-month sub-caps; (3) verifier-gate gaming — LLMs trained on SWE-Bench routinely modify tests, mock verifiers, or edit golden baselines to "pass" the gate (DebugML cheating-agents corpus), requiring 6 layers of defense (runtime allow-list, diff-guard regex bank, CODEOWNERS, verifier-pinned-to-main, test-count invariants, canary case set).

Critical sequencing decision: branch protection + CODEOWNERS + `Allow auto-merge: OFF` must land FIRST, as Wave-0 prereqs folded into Phase 39, before any auto-fix PR can safely open. This is the single most important repo-level configuration in v4.0 — without it, the human-gated trust invariant that v3.1 established (via `promote-from-quarantine.mjs` being human-triggered) collapses the moment the first auto-fix PR opens. The 9-phase refined ordering (39 → 47) puts pipe-cleaner workflows first (deps-update, verifier-gate without LLM) to validate the new `v40-*.yml` conventions, then layers in the LLM auto-fix vertical slice for WRONG_CITATION only, then scales horizontally to per-class expansion. Phases 39 + 40 + 41 can run in parallel (3 agents, zero shared write surface). Total milestone scope: ~30-35 requirements across 8 categories.

---

## Key Findings

### Stack (from STACK.md)

- **`@anthropic-ai/sdk@0.100.1`** (published 2026-05-29, EXACT pin not caret). Sibling wrapper `tests/e2e/lib/anthropic-api.js` (or extension of `llm-driver.js`) mirrors the existing `invokeClaudePWithLedger` discipline, with the *inverse* CI gate (runs only when `CI=true` OR `--force-api`).
- **Default model `claude-sonnet-4-6`** ($3/$15 per Mtok, 1M context, 1024 token cache minimum) for auto-fix; reserve `claude-opus-4-7` for Tier-C escalations. Prompt caching with `cache_control` on the SYSTEM block (TTL `1h`) saves ~30% per call; ~$2/mo ceiling at 60 issues vs $80 warn cap.
- **`peter-evans/create-pull-request@v8`** (8.1.1) for draft-PR creation — idempotent, signs as `github-actions[bot]`, handles branch + commit + push atomically. Avoid `anthropics/claude-code-action@v1` (no per-call cost hook, fights explicit ledger discipline).
- **Roll your own deps workflow** — Dependabot can't pre-gate on nightly suite; Renovate is overkill for 8 packages. Reuse `peter-evans/create-pull-request@v8` + `npm outdated --json` + matrix strategy. ~50 lines of YAML.
- **Cost ledger persistence: git-committed `tests/e2e/.llm-spend-ledger.json`** (current path, flipped from gitignored to committed-but-versioned), with `[skip ci]` mirroring `e2e-weekly-digest.yml` lines 98-110. Add a `combinedMonthlyTotal(localLedger, ciLedger)` helper to enforce the unified $80/$100 cap. NEVER use GH cache (7-day eviction), repo variables (race condition, 48KB cap), or Cloudflare KV (extension-side concern).
- **Verifier-on-PR: zero new primitives** — `actions/checkout@v4` with `ref: pr.head.sha` → `npm run build:chrome` → `npx playwright test --grep <caseId>` → Node script asserts Tier A/B in `report.json` → `gh pr ready` flips draft. `gh` CLI is sufficient; no `actions/github-script` needed.

### Features (from FEATURES.md)

- **WRONG_CITATION is the hero path for MVP.** LLM_HALLUCINATED_SELECTION + WORKER_FALLBACK_FAILED defer to expansion-phase after validation signal; GOOGLE_DOM_DRIFT + narrow HARNESS_ERROR auto-merge defer to later iterations.
- **Per-ERROR_CLASS routing** — 8 classes route to 5 specialized fix paths + 3 explicit skip paths:
  | ERROR_CLASS | Strategy | Fix Surface |
  |-------------|----------|-------------|
  | WRONG_CITATION | Auto-fix (hero) | `src/shared/matching.js`, `src/shared/parsing.js`, `src/shared/gutter.js`, OCR/column-inference modules |
  | LLM_HALLUCINATED_SELECTION | Auto-fix | `src/selection.js`, spec-extraction code |
  | WORKER_FALLBACK_FAILED | Auto-fix (cross-repo aware) | Worker/USPTO fallback path |
  | GOOGLE_DOM_DRIFT | Auto-fix | Selectors, `data-testid` attributes, `src/selection.js` |
  | HARNESS_ERROR | Auto-fix (narrow) | `tests/e2e/specs/`, fixture loaders, Playwright config |
  | FLAKE | **Skip — re-quarantine** | None; bump stable_runs reset; escalate after pattern repeats |
  | LLM_API_ERROR | **Skip — retry** | None; transient |
  | PASS | **Skip — close as false-positive** | None |
- **Verifier-on-PR gate mechanics** lift OpenHands' Reviewer + Aider's `--test-cmd` patterns: 3× consecutive affected-case verifier check + 76-case regression + diff-size cap + no-new-deps gate. "Phantom verification" (LLM claims it tested but didn't) is the named anti-pattern to defend.
- **Auto-promote uses follow-up-PR pattern** to preserve v3.1's "promotion stays human-gated" trust invariant — the auto-promote workflow auto-creates a SEPARATE PR adding the case to `tests/test-cases.js`, never modifies the file in the original auto-fix PR. Triple-gate assertion on the source PR (verified label + merged + triage-sourced) reconstructs the human-gate invariant.
- **Six anti-features documented to explicitly EXCLUDE:** auto-merge of matcher changes; agentic loops without iteration cap; LLM-as-judge for verifier ties; prompt-injection-vulnerable issue parsing (live April-2026 vendor advisories cited); missing post-merge verifier re-check; batch-grind quarantine queue.
- **Renovate over Dependabot** for dep-update auto-PRs (`minimumReleaseAge` 14d cooldown, grouped updates) — but the v4.0 milestone constraint says "minimal new deps"; Renovate isn't an npm dep (hosted bot / GH App), so satisfied. Roll-your-own is the recommended fallback if Renovate proves too much config.

### Architecture (from ARCHITECTURE.md)

**5 new workflow files** (all named `v40-*.yml` for namespace clarity):
- `v40-auto-fix.yml` — trigger: `issues.labeled('triage')`
- `v40-verifier-gate.yml` — trigger: `pull_request.opened/synchronize` filtered to `auto-fix/*` branches
- `v40-auto-promote.yml` — trigger: `pull_request.closed && merged && contains(labels, 'auto-fix:verified')`
- `v40-deps-update.yml` — trigger: weekly cron `0 9 * * 1` + `workflow_dispatch`
- `v40-cost-ledger-snapshot.yml` — trigger: daily cron + post-step in v40-auto-fix.yml

**4 new scripts in `scripts/`** (bare-verb naming, not `e2e-*` prefix since they don't read/write E2E artifacts):
- `auto-fix.mjs` — core fix proposer
- `auto-fix-promote.mjs` — invoked on merge, calls `runPromote()` with `_skipCiGuard:true` after triple-gate assertion
- `check-deps-and-pr.mjs` — `npm outdated --json` partitioned into security/minor tiers
- `verify-single-case.mjs` — CLI shim around existing `verifyCitation()`

**Library extensions in `tests/e2e/lib/`:**
- `llm-driver.js` — add `invokeAnthropicSdkWithLedger` (inverse CI gate; unified `LEDGER_PATH`)
- New `lib/fix-prompt-builder.js` — pure-function per-ERROR_CLASS prompt scaffolds (analog to `issue-payload-builder.js`)
- `llm-ledger.js` — additive only (new fields `transport`, `phase: '40-auto-fix'`); no extraction
- `pdf-verifier.js` — no changes (CLI shim lives in `verify-single-case.mjs`)

**ESLint guards (3 new `no-restricted-imports` blocks):** `@anthropic-ai/sdk` importable only from `llm-driver.js`; auto-fix scripts forbidden from `src/`; `fix-prompt-builder.js` purity (no `node:fs`, `node:child_process`, `node:path`).

**The `_skipCiGuard` exemption** is the single load-bearing trust-invariant decision in v4.0. `promote-from-quarantine.mjs:131` blocks CI invocation today; the auto-promote workflow legitimately runs in CI. The exemption is gated by a triple-assertion in `auto-fix-promote.mjs`: (1) PR has `auto-fix:verified` label, (2) `event.pull_request.merged === true`, (3) source issue carried `triage` label. Collectively reconstructs "a HUMAN merged, after a VERIFIER signed off, on a TRIAGE-sourced issue."

### Pitfalls (from PITFALLS.md)

**8 critical pitfalls** with concrete defenses:

1. **Prompt injection from issue bodies** (LOAD-BEARING) — v3.1's `<patent_data>` defense protects against PDF injection but NOT against issue body injection (which is itself partly LLM-generated by v3.1). v4.0 needs `<issue_body_untrusted>` envelope + `FORBIDDEN_DELIMITERS` escape in `issue-payload-builder.js` (so v3.1 won't emit closing tags) + file allow/deny list in `auto-fix.mjs`.
2. **API cost runaway in CI** — subscription-local naturally caps; SDK does not. Required sub-caps: per-day ($10), per-issue ($1), per-PR ($2), per-month ($80 warn / $100 hard). Static-grep test pinning cron schedule prevents typo'd `*/5 * * * *` patterns.
3. **Verifier-gate gaming** — 6 layers: runtime file allow-list, diff-guard regex bank (rejects diffs touching `tests/test-cases.js`, `baseline.json`, quarantine corpus), CODEOWNERS on golden/verifier/workflows, verifier-pinned-to-`origin/main` on PR gate, test-count invariants (test count must not decrease), canary case set.
4. **Auto-merge prevention** — `Settings → Allow auto-merge: OFF` at repo level; branch protection ruleset on `main` with `Do not allow bypassing: ON`; CODEOWNERS-required reviews; draft-by-default PRs; static-grep test pinning these settings.
5. **FLAKE handling 5-state machine** — CONFIRMED_BUG / LIKELY_BUG / INTERMITTENT / FLAKE / FLAKE_ESCALATION with rolling 10-element rerun-outcomes ring buffer. Prevents both real-bugs-mis-classified-as-FLAKE and FLAKE-spam-loops. 30-day suppress on FLAKE_ESCALATION re-files.
6. **Dep-update masking** — verifier and extension share `pdfjs-dist`; a dep bump can shift column numbers by 1, causing legit WRONG_CITATION issues that auto-fix would "resolve" by adjusting the extension to match the new buggy pdfjs output. Pin verifier's `pdfjs-dist` separately; verifier-frozen pre-flight check on dep-update PRs.
7. **Concurrency races** — `v40-auto-fix-${{ event.issue.number }}` per-issue concurrency with `cancel-in-progress: false` (don't kill a partial fix mid-LLM-call); `v40-verifier-gate-${{ event.pr.number }}` with `cancel-in-progress: true` (PR sync should re-run gate from scratch); `v40-auto-promote` static (serializes corpus writes).
8. **v3.1 surprise interactions** — `invokeClaudePWithLedger` CI guard is load-bearing; don't delete it. SDK transport is a NEW entry point with the *opposite* CI policy. Both coexist; transport tag (`auto-fix-api` vs `auto-fix`) distinguishes ledger entries for audit greps.

---

## Implications for Roadmap

### Phase Structure: 9 Phases (39-47)

| Phase | Topic | Dependencies | Wave |
|-------|-------|--------------|------|
| **39** | SDK driver + Ledger v2 + Branch protection Wave-0 (CODEOWNERS, ruleset, auto-merge OFF, $80/$100 sub-caps, SDK driver, ESLint guard) | None | Wave 1 |
| **40** | Pipe-cleaner: deps-update + cost-ledger-snapshot workflows | 39 (ledger schema) | Wave 1 |
| **41** | Verifier-gate workflow + verify-single-case.mjs CLI shim | None (uses existing `verifyCitation`); 40 (workflow conventions) | Wave 1 |
| **42** | fix-prompt-builder + WRONG_CITATION vertical slice (local; `<issue_body_untrusted>` envelope, `FORBIDDEN_DELIMITERS`, file allow/deny list, `fix_attempts` retry tracking) | 39 (driver), 41 (gate to land into) | Wave 2 |
| **43** | v40-auto-fix.yml workflow + draft PR creation | 42 (script proven locally) | Wave 3 |
| **44** | v40-auto-promote.yml + triple-gate `_skipCiGuard` (verified-label + merged + triage-sourced) | 43 (PRs with auto-fix:verified exist) | Wave 4 |
| **45** | Per-ERROR_CLASS expansion (4 more classes: LLM_HALLUCINATED_SELECTION, WORKER_FALLBACK_FAILED, GOOGLE_DOM_DRIFT, HARNESS_ERROR) + FLAKE 5-state machine + rolling ring buffer | 44 (full loop closed) | Wave 5 |
| **46** | `/gsd:fix-issue` local UX (npm script wrapping `auto-fix.mjs --transport subscription`) + ledger v2 dashboard + committed-ledger privacy audit | 45 (all classes wired) | Wave 6 |
| **47** | v4.0 cleanup: integration audit, Nyquist coverage stamping, live HUMAN-UAT (mirrors v3.1 Phase 38) | 39-46 | Wave 7 |

**Wave-1 Parallelization:** Phases 39 + 40 + 41 can run simultaneously (3 agents, zero shared write surface — 39 adds lib + repo settings; 40 adds independent workflows; 41 adds an independent workflow + CLI shim).

### Cross-Phase Dependency Graph

```
39 (SDK driver + branch protection) ──┬──→ 42 (vertical slice) ──→ 43 (workflow) ──→ 44 (promote)
                                       │                                                  │
                                       └──→ 46 (local UX)                                  │
                                                                                           ▼
40 (deps + snapshot) ──→ 41 (verifier-gate) ──→ 42                                       45 (expansion)
                                                │                                          │
                                                └──────────────────────────────────────────┘
                                                                                           ▼
                                                                                        47 (cleanup)
```

### Requirements Categories (~30-35 across 8)

| Category | Requirements (sample REQ-IDs) | Phase Mapping |
|----------|-------------------------------|---------------|
| **PROMPT** | `<issue_body_untrusted>` envelope, `FORBIDDEN_DELIMITERS`, per-ERROR_CLASS scaffolds, fix-prompt-builder purity guard | 42, 45 |
| **LEDGER** | Ledger schema v2 (transport, phase fields), unified $80/$100 cap across transports, per-day/per-issue/per-PR sub-caps, `combinedMonthlyTotal` helper, committed ledger | 39, 40 |
| **DEPS** | Weekly cron + watched packages, pre-flight nightly-suite gate, per-tier PR grouping (security vs minor), pinned verifier `pdfjs-dist` | 40 |
| **VERIFIER-GATE** | 3× consecutive affected-case check, 76-case regression check, diff-size cap, no-new-deps gate, verifier-pinned-to-`origin/main`, diff-guard regex bank | 41 |
| **AUTOFIX** | Dispatcher (parse ERROR_CLASS from labels), draft PR creation via `peter-evans/create-pull-request@v8`, branch-naming `auto-fix/<n>-<fp8>`, `git apply --check` pre-flight, fix-attempts retry tracking (max 3) | 42, 43 |
| **PROMOTE** | Triple-gate assertion, follow-up-PR pattern (NEVER direct-to-main), source issue close on merge | 44 |
| **FLAKE-HANDLING** | 5-state machine, rolling 10-element ring buffer, FLAKE_ESCALATION issue with 30-day suppress, `quarantine-append --escalate-stable-runs-reset 1` flag | 45 |
| **CLEANUP** | Nyquist coverage stamping (mirrors v3.1 Phase 38), integration audit, live HUMAN-UAT, deferred-items reconciliation | 47 |

---

## Disagreements & Resolutions

1. **Phase numbering & ordering.** ARCHITECTURE proposed sequential 39-47 with verifier-gate before auto-fix workflow. PITFALLS proposed a non-sequential ordering (43 → 44 → 41 → 39 → 40 → 42 → 45 → 46) that put branch protection FIRST. **Resolved:** Use ARCHITECTURE's sequential numbering 39-47 for clarity; fold PITFALLS's "branch protection FIRST" insight into Phase 39 as Wave-0 prereqs. Phase 39 becomes "SDK driver + Ledger v2 + Branch protection setup."
2. **Phase count.** FEATURES suggested 5 phases (P1-P5 covering MVP only); ARCHITECTURE/PITFALLS suggested 8-9 phases. **Resolved:** FEATURES described capability MVP (5 of ~25 requirements — WRONG_CITATION hero path only); ARCHITECTURE's 9 is build-order decomposition including non-MVP scope (per-class expansion, FLAKE state machine, deps-update, cleanup). Use ARCHITECTURE's 9 — FEATURES's MVP scope corresponds to Phases 39-44 within the 9-phase plan.
3. **Cost ledger persistence.** STACK and ARCHITECTURE both discuss; STACK recommended `.github/.llm-ledger.json`, ARCHITECTURE recommended `tests/e2e/.llm-spend-ledger.json` (the existing v3.1 path, flipped from gitignored). **Resolved:** Use `tests/e2e/.llm-spend-ledger.json` (ARCHITECTURE's choice) — it's the existing v3.1 path; renaming would break v3.1's local ledger continuity. Note this choice in Phase 39 plan.

---

## Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| Stack (SDK + GH Actions + ledger persistence) | HIGH | npm + Anthropic docs verified within 24h; existing repo workflows read in full; pattern parity with v3.1 |
| Features (tool survey + per-ERROR_CLASS strategy) | HIGH | OpenHands docs, SWE-agent README, claude-code-action source, DebugML cheating-agents corpus all current 2026-05-30; v3.1 issue body schema known precisely |
| Architecture (workflows + scripts + libs + integration touchpoints) | HIGH | Direct line-number-referenced inspection of all 5 v3.1 primitives; `_skipCiGuard` exemption analyzed for completeness |
| Pitfalls (8 categories with defenses) | HIGH | Every pitfall anchored either in v3.1 source code I inspected directly, or in a documented public failure mode of the same class of system |
| Phase ordering & cross-phase dependencies | MEDIUM | Grounded in dependency analysis but per-phase duration estimates (2-3 days × 5 classes in Phase 45) are LLM-prompt-engineering-dependent and may stretch |

---

## Research Flags

### Needs phase-specific research
- **Phase 42:** Diff-size empirical calibration. Initial cap suggested: 200 LOC src/ + 50 LOC tests. Calibrate after first 10 fixes.
- **Phase 44:** `auto-fix:partial-verified` semantics (does verifier passing on 3/5 affected cases gate flip?). Default all-or-nothing for v4.0.
- **Phase 45:** Per-ERROR_CLASS prompt engineering — each class needs ~2-3 days of empirical tuning against historical issues.
- **Phase 46:** Committed ledger privacy audit (monthly spend pattern, model IDs in git history).

### Standard patterns — skip research
- Phase 39: Canonical GitHub branch protection / CODEOWNERS / ruleset patterns
- Phase 40: Mirrors v3.1 `e2e-weekly-digest.yml` ledger-commit pattern
- Phase 41: Reuses existing `verifyCitation` — no new mechanics
- Phase 43: Lifts Phase 42 script into workflow — no new mechanics
- Phase 47: v3.1 Phase 38 precedent (Nyquist stamping, integration audit, live UAT)

---

## Gaps to Address During Execution

- Auto-fix diff-size upper bound — calibrate empirically Phase 42; initial cap 200 LOC src/ + 50 LOC tests
- Prompt-caching hit rate validation — `cache_read / (cache_read + cache_creation) ≥ 0.5` over 10 runs (Phase 39 acceptance criterion)
- `auto-fix:partial-verified` semantics — default all-or-nothing for v4.0; revisit in a later milestone
- Committed ledger privacy review — Phase 46 audit; consider redacting model IDs if sensitive
- Branch protection bypass list audit — Phase 39 audit step (who has admin override?)
- Anthropic SDK 0.100.1 stability — do NOT auto-bump via deps-update; pin via package.json exact version

---

## Sources

### Primary (direct code/doc inspection)
- v3.1 source files: `tests/e2e/lib/llm-driver.js` (line 375: `invokeClaudePWithLedger`, line 384: CI gate), `tests/e2e/lib/llm-ledger.js` (line 318: `appendLedgerEntry`), `tests/e2e/lib/issue-payload-builder.js` (line 180: labels), `tests/e2e/lib/pdf-verifier.js` (line 830: `verifyCitation`), `tests/e2e/lib/error-codes.js` (8 ERROR_CLASSES), `scripts/promote-from-quarantine.mjs` (line 115: `runPromote`, line 131: CI guard), `scripts/run-triage-pipeline.mjs` (4-stage spawnSync), `scripts/e2e-report-issue.mjs` (line 78: `fingerprint()`), `eslint.config.js` (existing patterns), `.github/workflows/e2e-nightly.yml`, `.github/workflows/e2e-weekly-digest.yml`
- Anthropic docs: [Client SDKs](https://platform.claude.com/docs/en/api/client-sdks), [Prompt Caching](https://platform.claude.com/docs/en/docs/build-with-claude/prompt-caching), [Models overview](https://platform.claude.com/docs/en/docs/about-claude/models)
- npm registry: [@anthropic-ai/sdk](https://www.npmjs.com/package/@anthropic-ai/sdk) version 0.100.1 (2026-05-29)

### Secondary (tool ecosystem)
- [SWE-Bench Leaderboard 2026](https://awesomeagents.ai/leaderboards/swe-bench-coding-agent-leaderboard/), [SWE-agent](https://github.com/SWE-agent/SWE-agent), [OpenHands PR Review docs](https://docs.openhands.dev/sdk/guides/github-workflows/pr-review)
- [claude-code-action](https://github.com/anthropics/claude-code-action), [security docs](https://github.com/anthropics/claude-code-action/blob/main/docs/security.md)
- [GitHub Copilot cloud agent docs](https://docs.github.com/copilot/concepts/agents/coding-agent/about-coding-agent)
- [peter-evans/create-pull-request](https://github.com/peter-evans/create-pull-request) v8.1.1
- [Renovate minimumReleaseAge](https://docs.renovatebot.com/key-concepts/minimum-release-age/), [Renovate vs Dependabot 2026](https://appsecsanta.com/sca-tools/dependabot-vs-renovate)
- [Playwright Healer Agent](https://dev.to/debs_obrien/fixing-failing-tests-automatically-with-playwrights-new-healer-agent-13ck)

### Tertiary (pitfall references)
- [PromptPwnd: Prompt Injection in GitHub Actions](https://www.aikido.dev/blog/promptpwnd-github-actions-ai-agents), [Comment and Control](https://www.thebreach.news/posts/comment-and-control-github-actions-prompt-injection)
- [DebugML — Cheating Agents Corpus](https://debugml.github.io/cheating-agents/)
- [GitHub Docs — Auto-merge](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-auto-merge-for-pull-requests-in-your-repository), [Protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [Anthropic SDK Discussion #1461 — 24/7 Agent Operations](https://github.com/anthropics/anthropic-sdk-python/discussions/1461)
- [Slack — Handling Flaky Tests at Scale](https://slack.engineering/handling-flaky-tests-at-scale-auto-detection-suppression/), [Datadog Flaky Tests](https://docs.datadoghq.com/tests/flaky_management/)
- [Chromium TestExpectations](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/docs/testing/web_test_expectations.md)
- [The Evidence Gate (phantom verification)](https://blakecrosley.com/blog/the-evidence-gate)

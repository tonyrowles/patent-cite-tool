# Project Research Summary

**Project:** Patent Citation Tool — v3.1 LLM-Driven Product Improvement Loop
**Domain:** LLM-triage and quarantine feedback loop layered on an existing Playwright/Vitest E2E CI pipeline
**Researched:** 2026-05-22
**Confidence:** HIGH

## Executive Summary

v3.1 closes the feedback loop that v3.0's LLM exploratory mode opened. The pattern is well-understood and maps onto established CI flake-management practices (WPT, Playwright, Atlassian): deterministic replay confirms reproducibility, rule-based heuristics route clear cases cheaply, an LLM second-pass handles the ambiguous remainder, and a tiered corpus (quarantine to golden) gives confirmed findings a landing zone without polluting the high-trust baseline. Every required capability already exists in v3.0 primitives — the milestone adds orchestration and policy, not new infrastructure. ZERO new npm dependencies are needed; all new scripts are pure Node 22 built-ins layered on the existing `llm-driver.js`, `pdf-verifier.js`, `e2e-report-issue.mjs`, and Playwright config primitives.

The recommended build order is strict and dependency-justified: re-run validator -> triage classifier -> issue-payload-builder + quarantine-append -> quarantine spec + CI wiring -> weekly digest. The order cannot be swapped because each step's output schema is the next step's input. Critically, Phase 1 of v3.1 must be HUMAN-UAT (manually verifying that `npm run e2e:explore` against the live Max 5 subscription produces usable `llm-report.json` output end-to-end) — all downstream phases consume that artifact and the entire milestone is de-risked only after this live verification passes.

Four high-severity pitfalls dominate the risk surface: (1) Tier C verifier agreement silently masking real extension bugs in the triage heuristic, (2) fingerprint formula immutability — any formula change retroactively breaks dedup for all existing open issues, (3) the `ANTHROPIC_API_KEY: ''` clearing pattern in `invokeClaudeP` breaking any future API-billed triage path, and (4) the spend-ledger opt-in trap where triage LLM calls that skip `appendLedgerEntry` silently understate monthly cost. All four have clear, low-effort prevention strategies that must be embedded in acceptance criteria, not left to implementation discretion.

## Key Findings

### Recommended Stack

The single most important stack finding: **no new npm dependencies are required for v3.1**. Every feature reuses existing primitives. The triage classifier extends `llm-driver.js` pure functions (no LangChain, no Vercel AI SDK). The issue filer extends `e2e-report-issue.mjs` in-place (no `@octokit/rest`). The quarantine suite adds a Playwright `projects:` entry to the existing config (no new workflow file). The weekly digest uses `gh api graphql` pre-installed on `ubuntu-latest` (no npm GraphQL client). Analytics aggregation is pure Node `fs` glob (no Prometheus, no Postgres).

The sole new workflow file is `.github/workflows/e2e-weekly-digest.yml` for the Monday 07:00 UTC digest cron. The `llm-report.json` local-to-CI transfer mechanism is via GitHub Actions artifact upload (`gh workflow run` with `llm_run_id` input), not committed to the repository.

**Core technologies (additions only):**
- Node 22 built-ins (`fs`, `path`, `child_process`): all new scripts — zero new runtime dependencies
- `gh api graphql` (pre-installed on `ubuntu-latest`): `createDiscussion` mutation for weekly digest delivery
- Playwright `projects:` array in existing config: quarantine suite isolation, non-gating CI step

**Avoid:**
- `@octokit/rest` — `gh` CLI already auth'd, existing code has unit-tested mock interface
- LangChain / Vercel AI SDK / instructor-js — overkill for a single short classification prompt
- Separate `e2e-quarantine.yml` workflow — creates concurrency group collision risk; quarantine is nightly-only

### Expected Features

The six v3.1 features form a strict pipeline; none is optional because each unlocks the next. The FEATURES.md research identifies a clear MVP boundary: the first five features must ship together (the loop is not closed without all of them), and the weekly digest is a P2 addition after the first 2-3 weeks of quarantine data accumulates.

**Must have (table stakes — loop cannot close without these):**
- Local + CI runtime split (handoff) — prerequisite for everything; LLM stays local, triage runs in nightly cron
- Re-run validator — 3-replay verifier-only confirm gate; without it, false-positive rate makes triage meaningless
- Hybrid triage classifier — rule-first (6 of 8 error classes decided without LLM), LLM second-pass for ambiguous only
- Rich-context auto-issue filer — reproducer + seed, verifier tier + PDF snippet, LLM rationale, golden diff
- Tiered corpus promotion — quarantine bucket (`test-cases-quarantine.js`) with non-gating CI job; human PR promotes to golden

**Should have (P2, add after core loop validates):**
- Weekly analytics digest — classification breakdown, quarantine growth trend, cost vs cap; GitHub Discussion + committed markdown

**Defer to v3.2+:**
- Quarantine promotion automation (N-consecutive-green auto-PR) — reduce human friction once promotion volume justifies it
- Real-time Slack/PagerDuty alerts — LLM findings are hypotheses, not production failures; nightly cadence is correct
- Automatic golden promotion without human PR — destroys the trust invariant of the golden corpus

### Architecture Approach

The architecture is a sequential pipeline of pure-data lib/ modules orchestrated by `scripts/run-triage-pipeline.mjs`, which runs as a CI step when a `llm_run_id` workflow_dispatch input is provided to `e2e-nightly.yml`. All new lib/ modules (rerun-validator, triage-classifier, issue-payload-builder) are pure-function modules unit-testable with mock fixtures in vitest. The quarantine suite reuses the exact regression.spec.js pattern against a different corpus file. The weekly digest reads from the GitHub Issues API (existing issues are the persistence layer) and writes a new GitHub Discussion via `gh api graphql`.

**Major components (new):**
1. `tests/e2e/lib/rerun-validator.js` — deterministic verifier-only replay of LLM-flagged anomalies; writes `rerun-report.json`; no Playwright, no browser
2. `tests/e2e/lib/triage-classifier.js` — heuristic-first + LLM second-pass; pure data in/out; writes `triage-report.json`
3. `tests/e2e/lib/issue-payload-builder.js` — rich issue body assembly (reproducer, verifier detail, LLM rationale, golden diff)
4. `scripts/quarantine-append.mjs` — idempotent upsert of confirmed anomalies into `test-cases-quarantine.js`
5. `tests/e2e/specs/quarantine.spec.js` — non-gating Playwright project reading quarantine corpus
6. `scripts/run-triage-pipeline.mjs` — CI orchestrator chaining steps 1-4 + issue filer
7. `scripts/weekly-digest.mjs` — reads GitHub issues by label, files digest issue/Discussion weekly

**Key constraint: `ANTHROPIC_API_KEY: ''` clearing in `invokeClaudeP`.** The existing function deliberately clears the API key to force subscription-mode auth. Any triage second-pass LLM call must use the same path (subscription-local) or a separate wrapper that does NOT clear the key (API-billed). The design decision must be locked before the first triage LLM call is written.

### Critical Pitfalls

1. **Tier C verifier masking real bugs** — The heuristic rule must check `tier_used in {A, B}` before classifying as clean. Tier C (+-10-line fuzzy) agreements must escalate to LLM triage. Named constant `verifier_strong_agreement = status === 'pass' && ['A','B'].includes(tier_used)` with a vitest guard test that asserts Tier C pass does not suppress LLM escalation.

2. **Fingerprint formula immutability** — The `sha256(caseId | errorClass | "")` formula is embedded in all existing open GitHub issue bodies. Any change retroactively breaks dedup (new fingerprints do not match old comments). Solution: leave the base formula unchanged; add `topOfStackHashFromCase` only for NEW v3.1 error classes; `findMatchingIssue` searches both formula variants during transition.

3. **`ANTHROPIC_API_KEY: ''` clearing breaks API-billed triage** — `invokeClaudeP` clears the API key to force subscription auth. If triage second-pass is intended to run in CI via API billing, it must use a separate wrapper that does not clear the key. Design decision must be explicit in the triage classifier phase plan, not implicit.

4. **Spend ledger opt-in trap** — `appendLedgerEntry` is called explicitly in `e2e-explore.mjs`, not automatically inside `invokeClaudeP`. Any new caller that skips it silently understates monthly spend. Fix: create `invokeClaudePWithLedger` wrapper; make direct `invokeClaudeP` calls ESLint-restricted outside test files.

5. **DOM_DRIFT cluster saturating LLM triage budget** — Google A/B experiments can produce 20+ simultaneous `GOOGLE_DOM_DRIFT` failures. Without cluster detection (N>=5 same-errorClass in one run routes to single grouped LLM call), a single nightly run burns $0.20+ on redundant individual classifications.

6. **Issue body fingerprint displacement** — Adding rich context can push the `<!-- fingerprint: {fp} -->` comment past the 65,536-character GitHub limit. Move fingerprint comment to line 1 of the issue body; enforce per-section character budgets (LLM rationale <=800 chars, verifier windows <=600 chars each, diff <=400 chars).

## Implications for Roadmap

Based on the combined research, the dependency graph dictates a 6-phase structure for v3.1. No phase can be moved earlier without violating input/output dependencies.

### Phase 1: HUMAN-UAT Verification (Phase 32)
**Rationale:** Every downstream phase consumes `llm-report.json`. If the live `claude -p` exploratory session does not produce usable output (wrong schema, subscription auth failure, empty iterations), phases 33-37 cannot be tested. This is the single highest-risk de-risking step in the milestone. v3.0 Phase 31 shipped the scaffolding but deferred the live UAT.
**Delivers:** Confirmed `llm-report.json` with real iterations from the Max 5 subscription; schema validated; CI guard verified; spend ledger functional; `npm run e2e:upload-llm-report` helper defined for the local-to-CI handoff.
**Addresses:** Local + CI runtime split handoff (de-risks the artifact transfer design)
**Avoids:** Pitfall 10 (stale llm-report.json consumed by CI), Pitfall 11 (claude -p accidentally running in CI), Pitfall 12 (spend ledger gap)
**Research flag:** No additional research needed — live execution is the research.

### Phase 2: Re-run Validator (Phase 33)
**Rationale:** All triage, issue filing, and quarantine promotion depend on the `rerun-report.json` schema. This must be defined and tested before anything downstream is written. Unit-testable immediately with mock `llm-report.json` fixtures. Must also extend the llm-report.json iteration schema to add `scroll_y`, `viewport_width`, `viewport_height`, `selected_node_xpath` — these fields are needed for accurate replay and cannot be added retroactively after the re-run validator is built.
**Delivers:** `tests/e2e/lib/rerun-validator.js`; `rerun-report.json` schema; 3-replay deterministic confirm gate; `llm-report.json` schema extended with viewport fields; ESLint `no-restricted-imports` scope extended to include re-run validator.
**Addresses:** Re-run validator feature (table stakes)
**Avoids:** Pitfall 1 (scroll/viewport state missing — schema extension ships in same PR), Pitfall 16 (re-run validator trips ESLint src/ guard)
**Research flag:** Standard pattern — no additional research needed.

### Phase 3: Hybrid Triage Classifier (Phase 34)
**Rationale:** Consumes `rerun-report.json` schema from Phase 2. Must exist before issue-payload-builder and quarantine-append, which both consume `triage-report.json`. This is the highest-complexity phase in the milestone (heuristic rules + LLM second-pass + cluster detection + prompt injection isolation).
**Delivers:** `tests/e2e/lib/triage-classifier.js`; `triage-report.json` schema; `invokeClaudePWithLedger` wrapper; cluster-detection pre-filter for DOM_DRIFT clusters (N>=5); prompt injection isolation via `<patent_data>` XML tags; CI guard mirroring `e2e-explore-ci-guard.test.js` for triage entrypoint.
**Addresses:** Hybrid triage classifier feature (table stakes)
**Avoids:** Pitfall 2 (Tier C masking — `verifier_strong_agreement` named constant with guard test), Pitfall 3 (DOM_DRIFT cluster LLM budget saturation), Pitfall 4 (prompt injection from PDF content), Pitfall 11 (CI guard at triage caller level), Pitfall 12 (spend ledger wrapper — ledger total must match sum of exploratory + triage invocations)
**Research flag:** LLM invocation path design decision (subscription-local vs API-CI) must be locked before any code is written. Architecture research resolves this as subscription-local only — document as acceptance criterion in phase plan.

### Phase 4: Rich Issue Filer + Quarantine Corpus (Phase 35)
**Rationale:** Both components consume `triage-report.json` (Phase 3). Can be built in parallel within the phase since they share the same input but write different outputs. The fingerprint audit must precede any formula change.
**Delivers:** `tests/e2e/lib/issue-payload-builder.js`; `scripts/quarantine-append.mjs`; `tests/e2e/test-cases-quarantine.js` (initial empty file with schema guard test); extended `e2e-report-issue.mjs` with `--source triage` flag and errorClass GitHub labels; fingerprint dual-search (v1 + v2 formula variants); per-section character budget enforcement; fingerprint-first body ordering.
**Addresses:** Rich-context auto-issue filer (table stakes); tiered corpus promotion (table stakes — corpus file created)
**Avoids:** Pitfall 5 (fingerprint too coarse for new error classes), Pitfall 6 (issue body exceeding 65,536 chars), Pitfall 9 (quarantine/golden schema drift — guard test in `test:src` suite), Pitfall 13 (ERROR_CLASSES modification breaks Phase 30 — guard test before any new class), Pitfall 14 (fingerprint formula change breaks Phase 29 dedup)
**Research flag:** Standard patterns — no additional research needed.

### Phase 5: Quarantine CI Integration + Triage Pipeline Orchestrator (Phase 36)
**Rationale:** Requires the quarantine corpus file from Phase 4. Wires all Phase 2-4 components into CI. The `run-triage-pipeline.mjs` orchestrator is the last piece before the loop can run end-to-end in the nightly cron.
**Delivers:** `tests/e2e/specs/quarantine.spec.js`; Playwright config `quarantine` project (`retries: 0`); `scripts/run-triage-pipeline.mjs` orchestrator (exits 0 always, same philosophy as nightly); `e2e-nightly.yml` modifications (`llm_run_id` workflow_dispatch input, artifact download step, triage pipeline step, quarantine spec step with `continue-on-error: true`); `scripts/promote-from-quarantine.mjs` human-triggered utility; timeout budget audit documented in YAML comment.
**Addresses:** Tiered corpus promotion (non-gating CI job); local + CI runtime split (full nightly cron wiring)
**Avoids:** Pitfall 7 (quarantine bit-rot — quarantine failures file issues with `e2e-quarantine` label using same `e2e-report-issue.mjs`), Pitfall 8 (quarantine forever — weekly digest action items for `stable_runs>=3` cases; `quarantine:ready-for-promotion` label auto-applied), Pitfall 15 (concurrency group collision — quarantine added to existing nightly job, not separate workflow; timeout budget calculated and documented)
**Research flag:** Standard pattern (mirrors existing `fault-injection.spec.js` + `continue-on-error: true` already in production). No additional research needed.

### Phase 6: Weekly Analytics Digest (Phase 37)
**Rationale:** Depends on GitHub issues having accumulated from Phase 5 wiring. Independent of Phase 2-5 local file outputs — reads GitHub Issues API directly. Can be stubbed with partial data early; full digest requires all other features running for at least one nightly cycle. Weekly cadence (Monday 07:00 UTC, after 06:00 nightly) is the correct trigger.
**Delivers:** `scripts/weekly-digest.mjs`; `.github/workflows/e2e-weekly-digest.yml` (Monday cron, `discussions: write` + `contents: write` permissions); committed markdown to `reports/weekly-digest-YYYY-WNN.md` + GitHub Discussion via `gh api graphql createDiscussion`; `SUMMARY_KEYS` export from `llm-report.js`; digest output validation (throws on missing keys, not silent zero); output structure enforces aggregation (classification breakdown as table, <=50 lines total, no per-iteration enumeration).
**Addresses:** Weekly analytics digest feature (P2)
**Avoids:** Pitfall 17 (weekly digest schema drift — `SUMMARY_KEYS` export + validation), Pitfall 18 (digest drowning signal in noise — acceptance criterion: digest <=50 lines; top 3 failure categories; quarantine growth trend; no per-iteration list)
**Research flag:** Verify GitHub Discussions is enabled on the repo before implementing `createDiscussion` GraphQL path. If not enabled, fallback is GitHub Issue with `e2e-digest` label (Architecture research notes this as the simpler alternative).

### Phase Ordering Rationale

- HUMAN-UAT must be Phase 1 because `llm-report.json` is the shared input for every downstream component. No fixture can fully substitute for the live subscription session that produces it.
- Re-run validator must precede triage classifier because `rerun-report.json` is the primary input to the heuristic rules. Classifying before re-run would misclassify transient flakes as real bugs.
- Triage classifier must precede issue filer and quarantine-append because both consume `triage-report.json` output.
- Quarantine corpus file must exist before the quarantine spec and CI wiring can be tested.
- Weekly digest is independent of local artifacts (reads GitHub Issues API) and belongs last because it aggregates outputs that only exist after the full loop has run at least once.
- Phases 4 and 5 have partial parallelism within the milestone: issue-payload-builder and quarantine-append (Phase 4) can begin once the triage output schema is locked, even before the CI orchestrator (Phase 5) is built.

### Research Flags

Phases needing explicit upfront design decisions (not external research — these are internal design locks):
- **Phase 34 (Triage Classifier):** LLM invocation path (subscription-local vs API-CI) must be locked as an acceptance criterion before implementation begins. Architecture research resolves this as subscription-local only.
- **Phase 36 (CI Integration):** Timeout budget audit required before adding quarantine steps. Calculate: existing nightly runtime + N_quarantine_cases x per-case-time. Document in YAML comment.
- **Phase 37 (Weekly Digest):** Verify GitHub Discussions enabled on repo at phase start. Implement Issue fallback path if not.

Phases with standard, well-documented patterns (no research-phase needed):
- **Phase 32 (HUMAN-UAT):** Execution is the research. Run `npm run e2e:explore` live.
- **Phase 33 (Re-run Validator):** Direct call to existing `verifyCitation`; identical to regression.spec.js invocation pattern.
- **Phase 35 (Issue Filer + Corpus):** Extension of existing `buildIssueBody` and fingerprint scheme; fully documented in Phase 29 implementation.
- **Phase 36 (CI Integration):** Mirrors existing `fault-injection.spec.js` + `continue-on-error: true` pattern already in production in `e2e-nightly.yml`.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Verified via npm registry, Context7, direct code inspection, GitHub docs. Zero new deps confirmed with alternatives explicitly rejected. |
| Features | HIGH | Codebase read directly; OSS patterns (WPT, Playwright, Atlassian) verified via web sources. Dependency graph fully traced. MVP vs v3.2+ boundary is clear. |
| Architecture | HIGH | All components derived from reading existing code contracts, not inference. Data flow validated against actual file schemas. All anti-patterns backed by specific code locations. |
| Pitfalls | HIGH | All 18 pitfalls derived from direct code inspection of v3.0 source tree. FUZZY_LINE_TOLERANCE, fingerprint null-hash rationale, CI guard lines, ledger opt-in — all traced to specific files and line numbers. |

**Overall confidence:** HIGH

### Gaps to Address

- **`llm-report.json` scroll/viewport state gap:** The iteration schema does not yet include `scroll_y`, `viewport_width`, `viewport_height`, `selected_node_xpath`. These must be added in Phase 33 (re-run validator phase) by modifying the `appendLlmIteration` call site in `e2e-explore.mjs`. This is a known gap with a defined fix; it must ship in the same PR as the re-run validator, not before or after.

- **GitHub Discussions enablement:** The weekly digest plan uses `gh api graphql createDiscussion`. Architecture research notes the simpler alternative is a GitHub Issue with `e2e-digest` label. Verify Discussions status at Phase 37 start and select the appropriate path. Both paths are fully designed; this is a configuration check, not a design question.

- **`llm_run_id` artifact transfer UX:** The design requires the developer to manually trigger `gh workflow run e2e-nightly.yml -f llm_run_id={run_id}` after a local exploratory session. A `npm run e2e:upload-llm-report` helper must be defined in Phase 32 (HUMAN-UAT) to make this frictionless. Without it, the handoff is error-prone and the loop will not close reliably in practice.

## Sources

### Primary (HIGH confidence)
- Direct code inspection: `tests/e2e/lib/pdf-verifier.js`, `lib/llm-driver.js`, `lib/llm-report.js`, `lib/llm-ledger.js`, `lib/error-codes.js`, `lib/report.js`, `scripts/e2e-report-issue.mjs`, `scripts/e2e-explore.mjs`, `.github/workflows/e2e-nightly.yml`, `tests/e2e/specs/regression.spec.js`, `eslint.config.js`
- `.planning/PROJECT.md` — v3.1 milestone target features and v3.0 validated requirements
- Context7 `/octokit/rest.js` — `createIssue`, `paginate`, `listForRepo` API surface (confirms `gh` CLI path is preferable)
- Context7 `/websites/main_vitest_dev` — `projects:` array in Playwright config for multi-project runner
- GitHub Docs `workflow-syntax-for-github-actions#permissions` — `discussions: write` GITHUB_TOKEN scope confirmed
- GitHub Docs GraphQL Discussions API — `createDiscussion` mutation; no REST equivalent confirmed
- `npm view @playwright/test version`, `npm view vitest version`, `npm view @octokit/rest dist-tags` — version confirmations

### Secondary (MEDIUM confidence)
- WPT expectation metadata system — quarantine/disabled pattern for tiered corpus
- Playwright `@flaky` tag + `--grep-invert` pattern — non-gating quarantine CI precedent
- Atlassian flaky test management at scale — hybrid rule + LLM classifier production validation
- LLM classification accuracy on borderline cases (68% vs 82% for embeddings) — validates rule-first approach for closed taxonomy
- Engineering leading vs lagging indicators (two-tier dashboard) — weekly digest output structure

### Tertiary (LOW confidence — verified against primary sources)
- WebSearch: GitHub Actions `discussions: write` permission — confirmed via official docs
- WebSearch: cross-workflow artifact passthrough patterns — noted; simpler committed-artifact approach adopted instead

---
*Research completed: 2026-05-22*
*Ready for roadmap: yes*

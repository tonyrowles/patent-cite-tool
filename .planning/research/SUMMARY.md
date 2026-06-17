# Project Research Summary

**Project:** v6.1 — Auto-Fix from Bug Reports
**Domain:** Human-report-driven, LLM-assisted auto-fix pipeline on a deterministic patent citation engine
**Researched:** 2026-06-17
**Confidence:** HIGH (all four research files grounded in live codebase reads and production history)

---

## Executive Summary

v6.1 closes a loop that v5.0 opened: users now submit bug reports through the extension's KV channel, and v6.1 turns those reports into regression-safe fix PRs with human merge approval required. The core insight across all four research files is that every significant infrastructure piece already exists — KV read access (`scripts/review-reports.mjs`), dual LLM transports (`invokeClaudePWithLedger` / `invokeAnthropicSdkWithLedger`), the spend ledger with its monthly caps, the golden-corpus regression gate, and the PR automation machinery (`peter-evans/create-pull-request@v8` + `gh` CLI). The entire milestone is wiring: new script files, new workflows, and surgical modifications to three existing workflows. Zero new npm dependencies are required.

The recommended approach is a strict sequential pipeline: triage first (heuristic-only, no LLM spend), then LLM analysis and fix generation only for promoted reports, then the existing regression gate, then a mandatory human merge. The fundamental architectural bet is that the v5.0 KV record — 20 fields including `category`, `confidenceTier`, `returnedCitation`, `pdfParseStatus`, `duplicate_count`, and an `errorLog` ring buffer — is rich enough to resolve most triage decisions without calling an LLM at all. `duplicate_count >= 3` and `confidenceTier = "green"` + `category = "inaccurate_citation"` are the two clearest auto-promote signals. The LLM budget is reserved exclusively for fix generation, where it is genuinely necessary.

The headline risk is cost runaway combined with prompt injection from user-controlled report fields. Both are fully mitigated by existing project infrastructure: `safeAppendLedger` + per-run caps prevent runaway; `<issue_body_untrusted>` XML envelope + `FORBIDDEN_DELIMITERS` escape prevent injection. The second major risk is the human merge gate eroding over time as the pipeline matures — this is addressed as a named architectural invariant (no auto-merge of `src/` changes is ever acceptable; citations go into legal filings). The autonomous exploration machinery from v3.1/v4.0 is explicitly retired in this milestone; `BUG_REPORTS` KV is the sole fix-candidate source.

---

## Key Findings

### Recommended Stack

All four researchers independently reached the same conclusion: no new npm dependencies are needed. The pipeline runs on Node.js 22 LTS (already the project runtime), wrangler CLI (already in `worker/package.json`, called via `npx`), `@anthropic-ai/sdk@0.100.1` EXACT (already pinned), and `gh` CLI (pre-installed on `ubuntu-latest`). Three new GitHub Actions workflow files are the main deliverables, plus two new scripts and additive modifications to three existing files.

**Core technologies:**
- `wrangler kv key list/get --remote` via `execFileSync`: KV read access — already the proven pattern in `review-reports.mjs`; must always pass `--remote` (MEMORY.md: wrangler v4 default reads local miniflare, returns false-empty `[]` in production)
- `invokeAnthropicSdkWithLedger` (CI) / `invokeClaudePWithLedger` (local): dual LLM transport — already in `tests/e2e/lib/llm-driver.js`; ledger-guarded with monthly soft/hard caps; `--max-turns 5 --tools Read,Glob,Grep` is the established fix-generation pattern from v4.3
- `safeAppendLedger` from `tests/e2e/lib/safe-append-ledger.js`: shared ledger write guard — any new `appendLedgerEntry` call must route through this (MEMORY.md: `auto_fix_ledger_leak_vector` documents exactly this class of bug in prior auto-fix work)
- `peter-evans/create-pull-request@v8`: PR creation — already pinned; handles the two-commit-split ledger pattern (ledger committed to `main` with `[skip ci]` before CPR snapshots the working tree)
- `scripts/review-reports.mjs` pure functions (`getNamespaceId`, `filterReports`, `loadReports`, `sortReports`): already exported; the new `scripts/ingest-reports.mjs` imports and reuses them directly
- New ledger source tags: `source: 'report-triage'` (classification calls) and `source: 'report-fix-api'` (fix generation) — free-form field, no `VALID_TRANSPORTS` change needed

**What NOT to use:** the old `scripts/auto-fix.mjs` / `PROMPT_SCAFFOLDS` / `ERROR_CLASS` routing (tied to GitHub Issues as inbound channel, being retired); Cloudflare REST API for KV (new secrets, no benefit over wrangler); `@octokit/rest` (new dep, no benefit over `gh` CLI); autonomous cron or `inject-defect.mjs` fixture mutator (explicitly retired); `@anthropic-ai/sdk` upgrade to 0.104.2 (defer to scheduled deps process).

### Expected Features

**Must have (table stakes — P1, required to close the pipeline end-to-end):**
- Report ingestion: reads `BUG_REPORTS` KV via `wrangler --remote`, produces structured JSON of pending reports
- Heuristic triage classifier: classifies using `category`, `confidenceTier`, `pdfParseStatus`, `returnedCitation`, `duplicate_count`, `errorLog`; cross-checks against golden + quarantine corpus (pure file reads, no network calls)
- Auto-promote for high-confidence signals: `confidenceTier = "green"` + `category = "inaccurate_citation"`, OR `duplicate_count >= N`, OR patent already in quarantine — no LLM call, immediate promotion
- Manual-promote escape hatch (GATE 1): `node scripts/ingest-reports.mjs promote <fp> <ts>` — bypasses classifier; essential for maintainer trust; must share the same analysis code path as auto-promote
- LLM analysis -> candidate fix: promoted report feeds `invokeAnthropicSdkWithLedger` with report fields + matching-core source; output is a candidate diff limited to `src/shared/matching.js`, `position-map-builder.js`, `pdf-parser.js` only
- Regression gate (golden + quarantine): every candidate diff runs `npm test` before PR is opened; zero regressions required on 75-case golden; no new failures in quarantine
- Draft PR on `auto-fix/<fp8>` branch: never direct-to-main; stays draft until verifier-gate labels `auto-fix:verified`
- Human merge gate (GATE 2): maintained by branch-protection ruleset 17086676; no auto-merge path under any circumstances
- Cost ledger integration: all LLM calls via `safeAppendLedger`; monthly hard cap enforced before each SDK call
- Triage report artifact: JSON file with classification decision + promotion source + rationale per processed report (audit trail)
- Retire autonomous machinery: delete `inject-defect.mjs`, archive `e2e-explore.mjs`, retire `v40-auto-fix.yml` synthetic-issue trigger, archive paused Phase 61-67 artifacts

**Should have (P2 — add after first successful auto-fix PR):**
- PDF text context for LLM: if patent position-map is in `PATENT_CACHE` KV, include text in analysis prompt; else fetch via Worker `/cache` route (most complex dependency — deferred to P2)
- LLM triage for ambiguous reports: only for reports heuristics cannot classify (small subset); adds triage-time LLM spend but improves recall
- Iteration cap + `auto-fix-stuck` label: stop after N failed regression-gate attempts; surface in digest; prevents budget runaway on hard cases
- Report volume digest extension: add `BUG_REPORTS` metrics to existing Monday weekly digest

**Defer (v6.2+):**
- Worker-route bug fixes (category `tool_not_working` + `pdfParseStatus: "error"`): different fix surface (`worker/src/index.js`), different risk profile; not in v6.1 LLM fix scope
- Cross-report cluster analysis: systemic issue detection across multiple reports
- Quarantine-append automation from promoted reports

**Anti-features (explicitly excluded):**
- Auto-merge of `src/` fix PRs even when all checks pass — destroys the trust invariant; citations go into legal filings
- Treating `duplicate_count > 0` as noise — high count is stronger evidence, not weaker
- LLM-as-judge for the regression gate — correlated failure with the extension's own logic
- Single LLM call combining triage and fix — couples cheap classification to expensive generation, burns budget on noise
- Autonomous LLM exploration to find bugs — retired; KV reports are the sole inbound signal
- Batch overnight auto-fix of entire queue — PR spam + budget exhaustion; cap per-run dispatch at 2-5

### Architecture Approach

The pipeline is a sequential chain: KV poll -> heuristic triage -> GitHub Issue (candidate state) -> label-triggered LLM analysis workflow -> draft PR -> regression gate -> human merge -> auto-promote cycle. The GitHub Issue is the state-transition hub between the triage and analysis stages; the BUG_REPORTS KV record remains the ground-truth diagnostic bundle (the issue body carries a `<!-- kv-key: report:{fp}:{ts} -->` pointer and the full record is fetched at analysis time). This preserves the v4.0 architectural invariant: the issue body is a human-readable summary with a machine-parseable pointer, not a copy of all 20 KV fields.

**Major components:**
1. `scripts/ingest-reports.mjs` (NEW): KV polling, heuristic auto-triage classifier, GitHub Issue creation for promoted reports, `promote` subcommand for manual-promote escape hatch
2. `REPORT_FIX_SCAFFOLD` in `tests/e2e/lib/fix-prompt-builder.js` (NEW): prompt scaffold targeting `matching.js` / `position-map-builder.js`; XML-wraps all user-controlled KV fields in `<report_data>` and `<source_files>` envelopes
3. `.github/workflows/v61-report-fix.yml` (NEW): `issues.labeled == 'report-fix-candidate'` trigger; fetches full KV record; calls `invokeAnthropicSdkWithLedger`; runs diff-guard; two-commit-split ledger pattern; opens draft PR via `peter-evans/create-pull-request@v8`
4. `v40-verifier-gate.yml` (SCOPE EXTENDED, minimal change): already covers `auto-fix/*` branches; `verifier-gate` job name locked as required status check on ruleset 17086676 — do not rename
5. `v40-auto-promote.yml` (MODIFIED — triple-gate Leg 3 extended): `assertTripleGate` Leg 3 accepts `report-fix-candidate` label alongside legacy `triage`; any body change requires updating the Vitest sha256 pin

**Key patterns inherited from v4.0, carried forward unchanged:**
- Two-commit ledger split: ledger committed to `main` with `[skip ci]` before CPR snapshots the working tree; the only permitted direct push to `main`
- `<issue_body_untrusted>` XML envelope + `FORBIDDEN_DELIMITERS` escape on all user-controlled fields (`note`, `selectionText`, `errorLog` entries) before inclusion in any LLM prompt
- FORBIDDEN_PATHS diff-guard: `tests/test-cases.js`, `tests/golden/baseline.json`, `tests/e2e/lib/pdf-verifier.js`, `scripts/`, `.github/` are locked; fix may only touch `src/shared/`
- Label-based state machine on GitHub Issues: `report-fix-candidate` -> `fix-in-progress` -> `auto-fix:verified` -> CLOSED
- No auto-merge flags in any `v40-*.yml` or new v6.1 workflow YAML (enforced by static grep Vitest test)

### Critical Pitfalls

1. **Reusing the v3.1 `runTriage()` classifier directly against KV reports** — the old classifier assumes `iter.classification` and verifier-tier fields that do not exist in KV records; will silently misclassify. Write a dedicated KV-report triage function with named heuristic rules, each with a Vitest test using actual `buildReportPayload()` output as input (not fabricated `iter` objects).

2. **Prompt injection from `note` / `selectionText` / `errorLog` fields** — user-controlled free text can contain `</issue_body_untrusted>` delimiters or DIFF fence markers to override LLM instructions. Apply `FORBIDDEN_DELIMITERS` escape to all user-controlled fields AND wrap the entire payload inside the `<issue_body_untrusted>` envelope (user-turn only, never system prompt). Add a static grep Vitest test asserting the envelope and escape are present in the new bridge module.

3. **LLM hallucinated fix that overfits to the reported patent** — a diff that passes all 75 golden cases but special-cases the reported patent number with a hardcoded return. Add a post-apply specificity check: if the diff contains the reported patent number as a string literal in `src/`, flag for mandatory human review. The quarantine corpus is the secondary defense (cases from different patent numbers in the same failure class).

4. **Cost runaway from a surge of promoted reports** — 50 reports arriving on the same day can exhaust the $100/month cap if each fires an LLM analysis call. Implement a per-run analysis cap (max 5 LLM calls per pipeline execution); surplus promoted reports stay in queue. Check `combinedMonthlyTotal` before each individual SDK call (already done inside `invokeAnthropicSdkWithLedger`).

5. **`wrangler kv` without `--remote` returning false-empty `[]`** — wrangler v4 default reads local miniflare store. All new `wrangler kv key list/get` invocations must include `--remote`. Add a grep assertion for `--remote` in the test checklist for any new `wrangler kv` invocation.

6. **Human merge gate erosion** — auto-approve settings, `gh pr merge --auto`, or loosened `assertTripleGate` conditions gradually bypass the only load-bearing human decision. Encode the invariant as a static grep Vitest test asserting no auto-merge flags exist in any workflow YAML file; document in STATE.md as a named permanent constraint.

7. **Feedback-loop reports flooding the queue after a fix ships** — users report the corrected citation as wrong because they expected the old (incorrect) format. Before promoting a report, check whether a fix PR for the same `patentNumber` has merged in the last 30 days; mark resolved reports with `_review.status = 'resolved'` so the triage classifier skips them on re-runs.

---

## Implications for Roadmap

All four researchers independently converged on the same 5-phase build order. The dependency constraint is strict: triage layer must exist before fix generation can have valid inputs; retirement of old machinery must come first to prevent scope collision.

### Phase 1: Retirement + Scaffolding

**Rationale:** Clearing the retired v4.3 machinery is a prerequisite for all other phases. Having both the old `v40-auto-fix.yml` `issues: labeled` trigger and the new `v61-report-fix.yml` `report-fix-candidate` trigger active simultaneously creates workflow collision risk and scope confusion.

**Delivers:** `inject-defect.mjs` deleted; `e2e-explore.mjs` archived; `RESUME-V4.3.md` archived; paused Phase 61-67 artifacts archived; `v40-auto-fix.yml` trigger block replaced with `workflow_dispatch:` only; stub `REPORT_FIX_SCAFFOLD` in `fix-prompt-builder.js`; new GitHub labels created (`report-fix-candidate`, `fix-in-progress`)

**Avoids:** Pitfall 7 (gate erosion from old trigger being accidentally restored); collision between old synthetic-issue path and new report-driven path

**Research flag:** Well-documented; standard patterns. Skip research-phase.

### Phase 2: Triage Layer (`ingest-reports.mjs`)

**Rationale:** The triage layer is the pipeline's input stage; nothing downstream can be built or tested without it. The heuristic classification rules are the most error-prone decisions in the entire pipeline, so they must be pinned with Vitest tests before the LLM analysis phase adds irreversible spend.

**Delivers:** `scripts/ingest-reports.mjs` with KV polling (reusing `review-reports.mjs` pure functions); named heuristic auto-triage rules each with a Vitest test using `buildReportPayload()` inputs; auto-promote for `confidenceTier="green"` + `category="inaccurate_citation"` and `duplicate_count >= N`; GitHub Issue creation for promoted reports; `promote` subcommand (manual-promote escape hatch); `_review.status` write-back to KV; triage report JSON artifact; post-fix suppression check against recent merged PRs; idempotent re-run behavior

**Addresses (FEATURES.md):** Report ingestion, triage classifier, auto-promotion, manual-promote escape hatch, triage report artifact, idempotent ingestion, corpus cross-check

**Avoids:** Pitfall 1 (misclassification from wrong classifier reuse); Pitfall 8 (feedback-loop reports); Pitfall 5 (wrangler without `--remote`)

**Research flag:** Well-documented. Skip research-phase.

### Phase 3: Fix Generation Workflow (`v61-report-fix.yml`)

**Rationale:** Fix generation is the core new capability and the highest-risk step (LLM, real money, real source changes). Building it after Phase 2 ensures the candidate state (GitHub Issue with correct body format) is stable before the workflow triggers against it.

**Delivers:** `REPORT_FIX_SCAFFOLD` complete in `fix-prompt-builder.js` (system prompt targeting `matching.js` / `position-map-builder.js`; XML-wrapped `<report_data>` + `<source_files>`; FORBIDDEN_PATHS enforcement; `FORBIDDEN_DELIMITERS` escape on all user fields); `v61-report-fix.yml` workflow (`issues.labeled` trigger; KV record fetch via wrangler `--remote`; `invokeAnthropicSdkWithLedger` call; diff-guard check; two-commit ledger split; `peter-evans/create-pull-request@v8` draft PR); per-run analysis cap (max 5 LLM calls); cross-report dedup check; post-apply specificity check (patent number not a string literal in src/ diff); Vitest YAML contract tests asserting ledger-commit step precedes CPR step; static grep tests asserting prompt envelope + no auto-merge flags; `source: 'report-fix-api'` ledger entries

**Addresses (FEATURES.md):** LLM analysis -> candidate fix, cost ledger integration, draft PR automation, per-run cap

**Avoids:** Pitfall 2 (hallucinated fix); Pitfall 3 (corpus gaming); Pitfall 4 (cost runaway); Pitfall 5 (prompt injection); Pitfall 6 (CI branch protection violation)

**Research flag:** Needs research-phase during planning. The REPORT_FIX_SCAFFOLD prompt design for the specific matching-core codebase is novel; validate with a sample report before writing the workflow. The interaction between `--max-turns 5 --tools Read,Glob,Grep` and the new scaffold is the highest uncertainty in the build.

### Phase 4: Triple-Gate Extension + Post-Merge Wiring

**Rationale:** The auto-promote workflow must accept `report-fix-candidate` as a valid source label or the post-merge golden-corpus promotion cycle never triggers for v6.1 fix PRs. This must come after Phase 3 so the `auto-fix:verified` flow is proven working on at least one v6.1-sourced PR before extending the gate.

**Delivers:** `assertTripleGate()` Leg 3 in `scripts/auto-fix-promote.mjs` extended to accept `report-fix-candidate`; `v40-auto-promote.yml` if-filter updated to OR-match `report-fix-candidate`; `v40-auto-promote.yml` `pull_request: closed` trigger restored; Vitest sha256 pin tests updated for the `assertTripleGate` body change; branch-protection ruleset verified to cover `auto-fix/*` branches from v6.1 sources

**Addresses (FEATURES.md):** Human merge gate (GATE 2), auto-promote cycle, quarantine corpus maintenance

**Avoids:** Pitfall 7 (gate erosion — assertTripleGate body must remain byte-stable)

**Research flag:** Standard patterns (direct extension of existing v4.0 triple-gate). Skip research-phase.

### Phase 5: End-to-End UAT + Operational Hardening

**Rationale:** The pipeline must be validated end-to-end with real or seeded production KV data before v6.1 is declared done. The 75-case golden corpus regression baseline must confirm zero regressions from the retirement changes. P2 features (digest extension, iteration cap) are added here without blocking the core loop.

**Delivers:** Live end-to-end UAT (submit report -> auto-triage promotes -> LLM produces fix -> verifier-gate passes -> maintainer merges -> auto-promote closes issue); verification that 75-case golden corpus is clean after retirement changes; verification that monthly ledger cap is enforced across all new invocations; `promote` subcommand documented in operator runbook; report volume metrics in Monday weekly digest; `auto-fix-stuck` label behavior if iteration cap fires; quarantine corpus updated with validated human-reported failure fixtures

**Addresses (FEATURES.md):** Report volume digest extension (P2), iteration cap + stuck label (P2), operational confidence

**Avoids:** Corpus staleness (Pitfall 7 warning sign); post-fix report flooding discovered late

**Research flag:** Standard patterns for UAT and digest extension. Skip research-phase.

### Phase Ordering Rationale

- **Retirement first (Phase 1)** is non-negotiable: the old `v40-auto-fix.yml` `issues: labeled` trigger for `triage`-labeled issues is structurally incompatible with the new `report-fix-candidate` label trigger; having both active simultaneously creates workflow collision risk.
- **Triage before fix generation (Phase 2 before Phase 3)** because the LLM analysis workflow triggers on GitHub Issues created by the triage layer; without stable issue body format and label conventions, the fix workflow has no valid inputs.
- **Fix generation before triple-gate extension (Phase 3 before Phase 4)** because the `auto-fix:verified` label flow must be proven working on a v6.1-sourced PR before the auto-promote workflow is extended to consume it.
- **UAT last (Phase 5)** validates all prior phases together and adds P2 features that require a working core loop as a baseline.

### Research Flags

Phases needing deeper research during planning:
- **Phase 3 (Fix Generation):** REPORT_FIX_SCAFFOLD prompt design is novel; no existing scaffold for KV-report-driven fix generation; validate with a real report before writing the workflow YAML

Phases with standard patterns (skip research-phase):
- **Phase 1 (Retirement):** Pure deletion and archival; no novel code
- **Phase 2 (Triage):** Heuristic classifier follows established v3.1 named-rule pattern; KV read pattern is already implemented in `review-reports.mjs`
- **Phase 4 (Triple-gate):** Direct extension of v4.0 `assertTripleGate`; additive change with Vitest pin enforcement
- **Phase 5 (UAT):** Standard end-to-end validation and digest extension

---

## Open Questions for Requirements Phase

These questions emerged consistently across multiple research files and must be resolved before Phase 2-3 implementation begins.

| Question | Stakes | Options to Evaluate |
|----------|--------|---------------------|
| **Auto-promotion threshold for `duplicate_count`** | Sets heuristic-only auto-promotion sensitivity; too low = false positives; too high = delayed fixes | N=3 (ARCHITECTURE.md suggestion); N=5; configurable via env var; separate thresholds for `inaccurate_citation` vs `no_match` |
| **PDF text availability for LLM context** | `PATENT_CACHE` KV may or may not hold position maps for reported patents; determines whether Phase 3 analysis prompt has full context | Check PATENT_CACHE first, degrade gracefully if missing; always fetch via Worker `/cache` route (adds latency + potential 502); defer PDF context to P2 and ship Phase 3 without it initially |
| **Worker-route bugs in scope for v6.1** | `tool_not_working` + `pdfParseStatus: "error"` reports point to `worker/src/index.js` bugs, not matching-core bugs; different fix surface | Explicitly out of scope (only `src/shared/` fixes); auto-classify as `infrastructure` during triage; deferred to v6.2 |
| **Per-run analysis cost cap** | Determines how many reports can be auto-analyzed in a single pipeline execution | 3 (conservative), 5 (PITFALLS.md suggestion), 2 (lowest risk for first month); configurable via `MAX_FIXES_PER_RUN` env var |
| **LLM iteration cap per report** | How many failed regression-gate attempts before `auto-fix-stuck` fires | 3 (FEATURES.md suggestion), 4, configurable; `--max-turns 5` is the inner cap on fix generation itself |
| **Manual vs cron trigger for triage workflow** | `workflow_dispatch:` only (maintainer-initiated) vs `schedule: cron` (nightly automatic) | Start with `workflow_dispatch:` only for the first month to observe classification quality; add cron after calibration |
| **Post-fix suppression check implementation** | Querying GitHub API for merged PRs mentioning a patent number adds API rate-limit surface | GitHub API search for merged `auto-fix/*` PRs mentioning patent number; or a local `recently-fixed.json` manifest written at merge time |

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All tools verified against live codebase; no new dependencies; SDK version compatibility confirmed against changelog; wrangler `--remote` requirement documented in MEMORY.md |
| Features | HIGH | Table-stakes features derived from project's own v3.1/v4.0 prior art and v5.0 KV schema; anti-features grounded in established trust invariants |
| Architecture | HIGH | All components verified against production code (`v40-auto-fix.yml`, `v40-verifier-gate.yml`, `v40-auto-promote.yml`, `scripts/review-reports.mjs`); build order respects actual file dependencies |
| Pitfalls | HIGH | All 8 pitfalls sourced from project history (v4.0/v4.2/v4.3 post-mortems), live code vulnerabilities, and MEMORY.md documented production findings |

**Overall confidence:** HIGH

### Gaps to Address

- **`duplicate_count` auto-promote threshold:** Not pinned in research; requires a requirements decision before Phase 2 classification rules are written. Can only be calibrated against real report data.
- **PDF text context for LLM analysis:** Whether `PATENT_CACHE` holds position maps for patents appearing in user reports is unknown without inspecting production KV. Safe path: ship Phase 3 without PDF context and treat it as a P2 enhancement.
- **Worker-route bug scope:** All four research files agree `worker/src/index.js` fixes are out of scope for v6.1, but `tool_not_working` reports will arrive. The triage classifier needs an explicit named rule for this category (classify as infrastructure, skip LLM analysis) documented in requirements.
- **Post-fix suppression check implementation:** Querying GitHub API for merged PRs vs. maintaining a local manifest; implementation approach unresolved; does not block Phase 2 but must be decided before Phase 2 ships.

---

## Sources

### Primary (HIGH confidence)
- Live codebase: `scripts/review-reports.mjs`, `tests/e2e/lib/llm-driver.js`, `tests/e2e/lib/safe-append-ledger.js`, `tests/e2e/lib/fix-prompt-builder.js`
- Live codebase: `.github/workflows/v40-auto-fix.yml`, `v40-verifier-gate.yml`, `v40-auto-promote.yml`
- `worker/src/index.js` + `worker/src/report-schema.md` — 20-field KV record spec, fingerprint, dedup, rate-limit implementation
- `.planning/PROJECT.md` + `.planning/MILESTONES.md` — v6.1 scope, v3.1/v4.0/v4.3 milestone history
- `worker/wrangler.toml` — KV namespace IDs (`BUG_REPORTS` = `cefe2733c0074fe2a28a49ff536de105`)
- MEMORY.md entries: `wrangler_kv_needs_remote_flag`, `auto_fix_ledger_leak_vector`, `project_v43_paused_for_bug_report`

### Secondary (MEDIUM confidence)
- `npm info @anthropic-ai/sdk version` — 0.104.2 latest; 0.100.1 installed; `messages.create` non-streaming path stable across this range
- `npm info wrangler version` — latest 4.101.0; worker pins `^4.69.0`
- GitHub Blog: GitHub Models for Open Source Maintainers — AI triage as "second pair of eyes"; human-in-the-loop until automation is trusted
- USENIX: AI in the Pipeline — cheap deterministic checks first, LLM nightly, paired-comparison gating
- Self-Healing Software Systems (arxiv 2504.20093) — sandboxed test suite validation, branch-and-retry-3x pattern
- SecurityWeek / TheRegister April 2026: Comment-and-Control prompt injection defense patterns

### Tertiary (MEDIUM-LOW confidence)
- eesel AI, dosu.dev, GitBugs arxiv 2504.09651 — external triage pipeline patterns; useful for industry baseline context; project's own v3.1/v4.0 prior art supersedes these for implementation decisions

---

*Research completed: 2026-06-17*
*Ready for roadmap: yes*

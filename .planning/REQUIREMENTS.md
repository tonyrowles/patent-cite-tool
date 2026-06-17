# Requirements: Patent Citation Tool — v6.1 Auto-Fix from Bug Reports

**Defined:** 2026-06-17
**Core Value:** Highlight text on Google Patents (or the webapp), get an accurate citation reference instantly. v6.1 closes the quality loop: real user-reported citation failures become regression-safe fixes under a human merge gate.

**Milestone goal:** Turn the v5.0 `BUG_REPORTS` KV channel into a human-report-driven, LLM-assisted auto-fix pipeline — heuristic-first triage, auto- and manual-promote, LLM candidate fix to the matching core, regression-proof before merge, human approval required. Rebuilt from first principles; autonomous LLM exploration is deferred and its machinery retired.

**Scope decisions (from milestone questioning):**
- P2 IN scope: iteration cap + `auto-fix-stuck` label (COST), report-volume digest (DGST).
- P2 deferred: PDF text context for the LLM fix prompt, LLM triage for ambiguous reports.
- Triage/ingestion runs are `workflow_dispatch`-only (manual) for this milestone; no cron.
- Auto-promote `duplicate_count` threshold defaults to **3** (env-configurable); per-run analysis cap defaults to **5** (`MAX_FIXES_PER_RUN`, env-configurable); LLM fix-iteration cap defaults to **3** before `auto-fix-stuck`.
- Fix surface is `src/shared/` matching core only. Worker-route bugs (`tool_not_working` / `pdfParseStatus:"error"`) are triaged as infrastructure and excluded from LLM fix scope.

## v1 Requirements

### Retirement (RTR) — clear the deferred autonomous machinery first

- [x] **RTR-01**: The fixture-mutator synthetic-issue injector (`scripts/inject-defect.mjs`) is removed and any npm/CI entry points referencing it are deleted.
- [x] **RTR-02**: The `v40-auto-fix.yml` workflow's `issues: labeled` synthetic trigger is removed; the workflow is `workflow_dispatch:`-only (or deleted) so the retired synthetic path cannot fire.
- [x] **RTR-03**: The autonomous `e2e:explore` exploration path and its npm script are archived/disabled so no autonomous "seek out bugs" run can be invoked.
- [ ] **RTR-04**: The paused v4.3 Phase 61–67 artifacts and `RESUME-V4.3.md` are archived under `.planning/milestones/`, and STATE.md records that the `RESUME-V4.3.md` re-enable checklist is superseded (the synthetic-trigger contract tests are removed, not un-skipped).
- [ ] **RTR-05**: After retirement, the full existing test + build suite is green and the 75-case golden corpus passes 100% (proves retirement changed no citation behavior).

### Ingestion (ING) — read bug reports from KV

- [ ] **ING-01**: A maintainer can run a single command that reads the `BUG_REPORTS` KV namespace (always via `wrangler --remote`) and emits a structured list of pending reports.
- [ ] **ING-02**: Ingestion reuses the existing `scripts/review-reports.mjs` pure functions (KV read, filter, sort) rather than reimplementing the wrangler shell-out.
- [ ] **ING-03**: Re-running ingestion is idempotent — a report already promoted (existing candidate Issue / branch) is never re-promoted or duplicated.
- [ ] **ING-04**: Ingestion writes a `_review.status` marker back to each processed KV record so subsequent runs skip already-handled reports.

### Triage (TRI) — heuristic-first classification

- [ ] **TRI-01**: Each report is classified into one of {real_bug, noise, duplicate, user_error, infrastructure, ambiguous} using only heuristic rules over KV fields (`category`, `confidenceTier`, `returnedCitation`, `duplicate_count`, `pdfParseStatus`, `errorLog`) — no LLM call.
- [ ] **TRI-02**: Each heuristic classification rule is named and pinned by a Vitest test that uses real `buildReportPayload()` output shape as input (not fabricated objects).
- [ ] **TRI-03**: A report is auto-promoted to analysis when it shows a clear real-bug signal: `confidenceTier:"green"` + `category:"inaccurate_citation"`, OR `duplicate_count >= 3` (configurable), OR the patent already exists in the quarantine corpus.
- [ ] **TRI-04**: Triage cross-checks the patent against the golden + quarantine corpora (pure file reads) before classifying, so known-good and known-broken patents are handled correctly.
- [ ] **TRI-05**: `tool_not_working` / `pdfParseStatus:"error"` reports are classified as `infrastructure` and excluded from LLM fix analysis (recorded, not promoted to a matching-core fix).
- [ ] **TRI-06**: Triage skips reports already resolved by a fix merged for the same `patentNumber` within a recent window (post-fix suppression), preventing feedback-loop re-reports from being re-promoted.
- [ ] **TRI-07**: Triage emits a durable triage-report JSON artifact: one entry per processed report with fingerprint, classification, rationale, and promotion decision (audit trail).

### Promotion (PROMO) — candidate state + manual escape hatch

- [ ] **PROMO-01**: A promoted report becomes a GitHub Issue carrying a `<!-- kv-key: report:{fp}:{ts} -->` pointer and a human-readable summary (not a copy of all KV fields), labeled `report-fix-candidate`.
- [ ] **PROMO-02**: A maintainer can manually promote ANY report (including noise/ambiguous/user_error) into analysis via a single command (`ingest-reports.mjs promote <fp> <ts>`), bypassing the classifier.
- [ ] **PROMO-03**: Manual promotion uses the exact same downstream analysis path as auto-promotion and is recorded in the triage artifact with `promotion_source: 'manual'`.
- [ ] **PROMO-04**: The triage/ingestion entry point is `workflow_dispatch`-only (manual); there is no cron schedule in this milestone.

### Fix Generation (FIX) — LLM candidate fix

- [ ] **FIX-01**: A `report-fix-candidate`-labeled Issue triggers a workflow that fetches the full KV record (via `wrangler --remote`) and invokes the LLM (`invokeAnthropicSdkWithLedger`) to produce a candidate diff.
- [ ] **FIX-02**: The fix prompt is built by a new `REPORT_FIX_SCAFFOLD` that targets only the `src/shared/` matching core and enumerates FORBIDDEN_PATHS (tests, golden baseline, verifier, scripts, workflows) that the diff may not touch.
- [ ] **FIX-03**: All user-controlled report fields (`note`, `selectionText`, `errorLog`) are escaped (`FORBIDDEN_DELIMITERS`) and wrapped in an `<report_data>`/untrusted XML envelope in the user turn — never in the system prompt — as a prompt-injection defense, pinned by a static-grep Vitest test.
- [ ] **FIX-04**: The candidate diff is rejected (flagged for mandatory human review) if it contains the reported `patentNumber` as a string literal in `src/` (overfit / hardcoded-result guard).
- [ ] **FIX-05**: If `selectionText` is absent in the KV record (user opted out), it is omitted from the prompt and PR body — never re-fetched from the patent page.

### Regression Gate & Merge (GATE)

- [ ] **GATE-01**: Every candidate diff runs the golden-corpus suite (`npm test`) and the quarantine spec before any PR is opened; zero golden regressions and no new quarantine failures are required.
- [ ] **GATE-02**: A passing candidate is proposed as a **draft** PR on an `auto-fix/<fp-short>` branch — never a direct push to `main`.
- [ ] **GATE-03**: The existing `verifier-gate` required status check (ruleset 17086676) gates the PR; the job name is unchanged so the required-check binding is preserved.
- [ ] **GATE-04**: Merge of any `src/` fix PR requires a maintainer approval click; no auto-merge flag exists in any workflow YAML (enforced by a static-grep Vitest test) — the human merge gate is a permanent invariant.
- [ ] **GATE-05**: `assertTripleGate` Leg 3 is extended to accept the `report-fix-candidate` source label alongside the legacy label, and the post-merge auto-promote cycle fires for v6.1-sourced fix PRs; the `assertTripleGate` body change updates its Vitest sha256 pin.

### Cost & Safety (COST)

- [ ] **COST-01**: All LLM calls route through the ledger guard (`safeAppendLedger`) with the existing monthly soft/hard caps enforced before each call; new entries carry `source:'report-triage'` / `source:'report-fix-api'`.
- [ ] **COST-02**: A per-run analysis cap (`MAX_FIXES_PER_RUN`, default 5) bounds how many reports are LLM-analyzed in one pipeline execution; surplus promoted reports remain queued.
- [ ] **COST-03**: LLM fix generation is capped at 3 iterations per report; on exhaustion the PR/Issue is labeled `auto-fix-stuck` and surfaced (no further spend).
- [ ] **COST-04**: A YAML-contract Vitest test pins that the workflow commits the ledger to `main` (`[skip ci]`) in a step that precedes the create-PR step (two-commit-split invariant preserved).

### Digest (DGST)

- [ ] **DGST-01**: The existing Monday weekly digest gains a `BUG_REPORTS` section: report volume, classification breakdown, and promotion/PR/merged/stuck counts.

### UAT (UAT)

- [ ] **UAT-01**: A live end-to-end run is proven: a real (or seeded production) `BUG_REPORTS` record is triaged → promoted → LLM produces a fix → regression gate passes → maintainer merges → auto-promote closes the Issue, with ledger entries recorded.
- [ ] **UAT-02**: The manual-promote escape hatch is exercised live (force-promote a non-auto-promoted report through the full pipeline).
- [ ] **UAT-03**: Post-milestone, the 75-case golden corpus passes 100% and the monthly ledger cap is confirmed enforced across all new invocations.

## v2 Requirements (deferred)

### PDF Context (PDFCTX)

- **PDFCTX-01**: Include the patent's PDF/position-map text in the LLM fix prompt (from `PATENT_CACHE`, else fetch via the Worker `/cache` route) to improve fix quality.

### LLM Triage (LTRI)

- **LTRI-01**: Use an LLM to classify the `ambiguous` subset of reports that heuristics cannot resolve, returning {real_bug, user_error, noise} with rationale.

### Automation (AUTO)

- **AUTO-01**: Add a nightly cron trigger to ingestion once auto-classification quality is calibrated on real report volume.
- **AUTO-02**: Auto-append a promoted report without a golden case into the quarantine corpus so future fixes regression-test against it.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Autonomous LLM exploration / cron "seek out patent errors" (v3.0/v3.1 explore mode) | Deferred to future development; v6.1's sole inbound signal is human bug reports. |
| Auto-merge of `src/` fix PRs even when all checks pass | Citations go into legal filings; a fix passing 75 goldens can still silently break un-goldenized patents. Human approval is a permanent invariant. |
| Worker-route bug fixes (`worker/src/index.js`, `tool_not_working` category) | Different fix surface and risk profile; triaged as `infrastructure`, deferred to v6.2. |
| LLM-as-judge for the regression gate | Re-introduces correlated failure with the extension's own logic; the independent PDF verifier stays the gate. |
| Single LLM call doing both triage and fix | Couples cheap classification to expensive generation; burns budget on noise. |
| Batch overnight auto-fix of the entire queue | PR spam + budget exhaustion; bounded by the per-run cap instead. |
| Treating `duplicate_count > 0` as noise | High duplicate count is stronger evidence of a real bug, not weaker. |
| Re-fetching opted-out `selectionText` from the patent page | Violates the v5.0 end-to-end privacy choice. |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| RTR-01 | Phase 10 | Complete |
| RTR-02 | Phase 10 | Complete |
| RTR-03 | Phase 10 | Complete |
| RTR-04 | Phase 10 | Pending |
| RTR-05 | Phase 10 | Pending |
| ING-01 | Phase 11 | Pending |
| ING-02 | Phase 11 | Pending |
| ING-03 | Phase 11 | Pending |
| ING-04 | Phase 11 | Pending |
| TRI-01 | Phase 11 | Pending |
| TRI-02 | Phase 11 | Pending |
| TRI-03 | Phase 11 | Pending |
| TRI-04 | Phase 11 | Pending |
| TRI-05 | Phase 11 | Pending |
| TRI-06 | Phase 11 | Pending |
| TRI-07 | Phase 11 | Pending |
| PROMO-01 | Phase 11 | Pending |
| PROMO-02 | Phase 11 | Pending |
| PROMO-03 | Phase 11 | Pending |
| PROMO-04 | Phase 11 | Pending |
| FIX-01 | Phase 12 | Pending |
| FIX-02 | Phase 12 | Pending |
| FIX-03 | Phase 12 | Pending |
| FIX-04 | Phase 12 | Pending |
| FIX-05 | Phase 12 | Pending |
| GATE-01 | Phase 12 | Pending |
| GATE-02 | Phase 12 | Pending |
| GATE-03 | Phase 12 | Pending |
| GATE-04 | Phase 12 | Pending |
| GATE-05 | Phase 13 | Pending |
| COST-01 | Phase 12 | Pending |
| COST-02 | Phase 12 | Pending |
| COST-03 | Phase 12 | Pending |
| COST-04 | Phase 12 | Pending |
| DGST-01 | Phase 14 | Pending |
| UAT-01 | Phase 14 | Pending |
| UAT-02 | Phase 14 | Pending |
| UAT-03 | Phase 14 | Pending |

**Coverage:**
- v1 requirements: 37 total
- Mapped to phases: 37
- Unmapped: 0 ✓

---
*Requirements defined: 2026-06-17*
*Last updated: 2026-06-17 — traceability filled after roadmap creation (v6.1 milestone)*

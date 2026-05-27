# Roadmap: Patent Citation Tool

## Milestones

- ✅ **v1.0 MVP** — Phases 1-4 (shipped 2026-03-02)
- ✅ **v1.1 Silent Mode + Infrastructure** — Phases 5-7 (shipped 2026-03-03)
- ✅ **v1.2 Store Polish + Accuracy Hardening** — Phases 8-13 (shipped 2026-03-03)
- ✅ **v2.0 Firefox Port** — Phases 14-17 (shipped 2026-03-05)
- ✅ **v2.1 CI/CD Pipeline** — Phases 18-19 (shipped 2026-03-05)
- ✅ **v2.2 Matching Robustness** — Phases 20-22 (shipped 2026-03-05)
- ✅ **v2.3 Post-v2.2 Hardening** — Phases 23-25 (shipped 2026-05-12)
- ✅ **v3.0 Autonomous E2E Testing Agent** — Phases 26-31 (shipped 2026-05-20)
- 🔄 **v3.1 LLM-Driven Product Improvement Loop** — Phases 32-37 (in progress)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-4) — SHIPPED 2026-03-02</summary>

- [x] **Phase 1: Extension Foundation and PDF Fetch** (2/2 plans) — completed 2026-02-28
- [x] **Phase 2: PDF Parsing Pipeline** (2/2 plans) — completed 2026-03-01
- [x] **Phase 3: Text Matching and Citation Generation** (3/3 plans) — completed 2026-03-01
- [x] **Phase 4: Citation Output** (1/1 plan) — completed 2026-03-02

Full details: `.planning/milestones/v1.0-ROADMAP.md`

</details>

<details>
<summary>✅ v1.1 Silent Mode + Infrastructure (Phases 5-7) — SHIPPED 2026-03-03</summary>

- [x] **Phase 5: Silent Mode** (2/2 plans) — completed 2026-03-02
- [x] **Phase 6: USPTO API Fallback** (3/3 plans) — completed 2026-03-02
- [x] **Phase 7: Server-side Cache** (3/3 plans) — completed 2026-03-03

Full details: `.planning/milestones/v1.1-ROADMAP.md`

</details>

<details>
<summary>✅ v1.2 Store Polish + Accuracy Hardening (Phases 8-13) — SHIPPED 2026-03-03</summary>

- [x] **Phase 8: Test Harness Foundation** (3/3 plans) — completed 2026-03-03
- [x] **Phase 9: Accuracy Audit and Algorithm Fixes** (2/2 plans) — completed 2026-03-03
- [x] **Phase 10: Icon Set and Manifest Updates** (2/2 plans) — completed 2026-03-03
- [x] **Phase 11: Options Page Polish** (2/2 plans) — completed 2026-03-03
- [x] **Phase 12: Store Listing and Submission** (2/2 plans) — completed 2026-03-03
- [x] **Phase 13: Offscreen Wrap-Hyphen Fix** (1/1 plan) — completed 2026-03-03

Full details: `.planning/milestones/v1.2-ROADMAP.md`

</details>

<details>
<summary>✅ v2.0 Firefox Port (Phases 14-17) — SHIPPED 2026-03-05</summary>

- [x] **Phase 14: Shared Code Extraction** (2/2 plans) — completed 2026-03-04
- [x] **Phase 15: esbuild Build Pipeline** (3/3 plans) — completed 2026-03-04
- [x] **Phase 16: Firefox Extension** (3/3 plans) — completed 2026-03-04
- [x] **Phase 17: Cross-Browser Validation** (2/2 plans) — completed 2026-03-05

Full details: `.planning/milestones/v2.0-ROADMAP.md`

</details>

<details>
<summary>✅ v2.1 CI/CD Pipeline (Phases 18-19) — SHIPPED 2026-03-05</summary>

- [x] **Phase 18: Core CI Workflow** (1/1 plan) — completed 2026-03-05
- [x] **Phase 19: CI Hardening** (1/1 plan) — completed 2026-03-05

Full details: `.planning/milestones/v2.1-ROADMAP.md`

</details>

<details>
<summary>✅ v2.2 Matching Robustness (Phases 20-22) — SHIPPED 2026-03-05</summary>

- [x] **Phase 20: OCR Normalization and Concat Refactor** (2/2 plans) — completed 2026-03-05
- [x] **Phase 21: Gutter-Tolerant Matching** (1/1 plan) — completed 2026-03-05
- [x] **Phase 22: Validation and Golden Baseline** (1/1 plan) — completed 2026-03-05

Full details: `.planning/milestones/v2.2-ROADMAP.md`

</details>

<details>
<summary>✅ v2.3 Post-v2.2 Hardening (Phases 23-25) — SHIPPED 2026-05-12</summary>

- [x] **Phase 23: Column Inference for Headerless PDFs** (3/3 plans) — completed 2026-05-12
- [x] **Phase 24: Firefox AMO Validation Cleanup** (1/1 plan) — completed 2026-05-12
- [x] **Phase 25: Automatic Release Workflow** (1/1 plan) — completed 2026-05-12

Full details: `.planning/milestones/v2.3-ROADMAP.md`

</details>

<details>
<summary>✅ v3.0 Autonomous E2E Testing Agent (Phases 26-31) — SHIPPED 2026-05-20</summary>

- [x] **Phase 26: Playwright Harness Scaffolding** (3/3 plans) — completed 2026-05-14
- [x] **Phase 27: Selection Emulation + 76-Case Deterministic Suite** (10/9 plans, gap-closure) — completed 2026-05-15
- [x] **Phase 28: Independent PDF Verifier** (5/5 plans) — completed 2026-05-15
- [x] **Phase 29: CI Nightly Cron + Auto-Issue Filing** (4/4 plans) — completed 2026-05-17
- [x] **Phase 30: Worker Fault-Injection** (5/5 plans) — completed 2026-05-18
- [x] **Phase 31: LLM Exploratory Mode + Docs** (4/4 plans) — completed 2026-05-20

Full details: `.planning/milestones/v3.0-ROADMAP.md`

</details>

### v3.1 LLM-Driven Product Improvement Loop (Phases 32-37)

- [x] **Phase 32: HUMAN-UAT Verification** - Live end-to-end validation of `npm run e2e:explore` with Max 5 subscription credit; confirms `llm-report.json` usability and establishes local→CI handoff helper (completed 2026-05-25)
- [x] **Phase 33: Re-run Validator** - Deterministic 3-replay verifier-only confirm gate; defines `rerun-report.json` schema; extends `llm-report.json` iteration schema with scroll/viewport fields (completed 2026-05-27)
- [ ] **Phase 34: Hybrid Triage Classifier** - Heuristic-first + LLM second-pass classification; `triage-report.json` schema; `invokeClaudePWithLedger` wrapper; cluster pre-filter and prompt-injection defense
- [ ] **Phase 35: Rich Issue Filer + Quarantine Corpus** - `issue-payload-builder.js`; `quarantine-append.mjs`; `test-cases-quarantine.js`; `e2e-report-issue.mjs` `--source triage` extension; fingerprint dual-search
- [ ] **Phase 36: Quarantine CI Integration + Pipeline Orchestrator** - `quarantine.spec.js`; `run-triage-pipeline.mjs`; `e2e-nightly.yml` wiring with `llm_run_id` input; `promote-from-quarantine.mjs`; timeout budget audit
- [ ] **Phase 37: Weekly Analytics Digest** - `weekly-digest.mjs`; `e2e-weekly-digest.yml` Monday cron; GitHub Discussion + committed markdown; `SUMMARY_KEYS` export and validation

## Phase Details

### Phase 32: HUMAN-UAT Verification
**Goal**: Developer can run `npm run e2e:explore` against the live Max 5 subscription and receive a validated `llm-report.json` with real iteration data, confirming the full local→CI handoff path works end-to-end
**Depends on**: Phase 31 (LLM Exploratory Mode scaffolding — already shipped)
**Requirements**: UAT-01, UAT-02, UAT-03
**Success Criteria** (what must be TRUE):
  1. Developer runs `npm run e2e:explore` with the Max 5 subscription credit and `llm-report.json` is produced with ≥10 valid iterations, each containing the required schema fields
  2. Spend ledger file reflects each `claude -p` invocation cost and correctly tracks accumulated spend against the $80 warning and $100 hard-cap thresholds
  3. Developer runs `npm run e2e:upload-llm-report` and the nightly workflow is triggered with the local `llm-report.json` artifact available as a downloadable Actions artifact — no manual artifact upload steps required
  4. The 461 existing Vitest tests and 76-case Playwright golden suite continue to pass (no regressions introduced)
**Plans**: 5 plans
- [x] 32-01-PLAN.md — Wave 0 test infrastructure scaffolding (fixtures dir + Vitest stubs)
- [x] 32-02-PLAN.md — Ledger `phase` field + `phaseTotal` + `checkPhaseSpendCap` helpers (UAT-02)
- [x] 32-03-PLAN.md — `--phase` flag + pre-flight + mid-run cap enforcement on e2e-explore.mjs (UAT-02)
- [x] 32-04-PLAN.md — Upload helper + ingest workflow + nightly llm_run_id input + download/validate step (UAT-03)
- [x] 32-05-PLAN.md — Live UAT execution + evidence + fixture commit + sign-off (UAT-01)

### Phase 33: Re-run Validator
**Goal**: Every LLM-flagged anomaly in `llm-report.json` can be deterministically replayed 3 times via the verifier-only path to produce a `rerun-report.json` verdict, and the `llm-report.json` iteration schema carries scroll/viewport state required for accurate replay
**Depends on**: Phase 32 (confirmed `llm-report.json` with real iteration data)
**Requirements**: RERUN-01, RERUN-02, RERUN-03, RERUN-04
**Success Criteria** (what must be TRUE):
  1. Developer runs the re-run validator against a fixture `llm-report.json` and `rerun-report.json` is written with `{confirmed_count, total_runs, verdict}` per anomaly; verdicts are CONFIRMED (≥2/3) or FLAKE (0–1/3)
  2. Vitest test suite for `rerun-validator.js` passes with cases covering CONFIRMED, FLAKE, and edge-case (exactly 2/3) verdicts
  3. `llm-report.json` iteration schema includes `scroll_y`, `viewport_width`, `viewport_height`, `selected_node_xpath` fields; existing `appendLlmIteration` call site in `e2e-explore.mjs` writes them; Vitest schema guard test enforces presence
  4. ESLint `no-restricted-imports` guard covers the re-run validator module — running `npm run lint` on a file that imports the validator from `src/` emits a lint error
**Plans**: 5 plans
- [x] 33-01-PLAN.md — Atomic D-13 + D-15 schema split and UAT fixture re-stamp (RERUN-03 schema side)
- [x] 33-02-PLAN.md — rerun-validator.js module + unit tests (RERUN-01 core, RERUN-02)
- [x] 33-03-PLAN.md — e2e-explore.mjs capture block + 6 call-site threading (RERUN-03 capture side)
- [x] 33-04-PLAN.md — e2e-rerun-validator.mjs CLI runner + spawnSync integration tests (RERUN-01 CLI surface)
- [x] 33-05-PLAN.md — ESLint per-file independence guard + lint smoke test (RERUN-04)

### Phase 34: Hybrid Triage Classifier
**Goal**: Triaged findings in `triage-report.json` are classified by heuristic rules for 6 of 8 ERROR_CLASSES without any LLM invocation, with an LLM second-pass (via `invokeClaudePWithLedger`) handling only the ambiguous remainder — cost-controlled by cluster pre-filter and protected against prompt injection
**Depends on**: Phase 33 (`rerun-report.json` schema locked — primary input to heuristic rules)
**Requirements**: TRIAGE-01, TRIAGE-02, TRIAGE-03, TRIAGE-04, TRIAGE-05, TRIAGE-06
**Success Criteria** (what must be TRUE):
  1. Vitest test suite for `triage-classifier.js` passes with cases proving: LLM_HALLUCINATED_SELECTION, LLM_API_ERROR, HARNESS_ERROR, PASS, WRONG_CITATION (Tier A/B), and FLAKE all resolve via heuristic path (zero `invokeClaudePWithLedger` calls); Tier C agreements escalate to LLM second-pass
  2. A fixture with N≥5 same-errorClass findings (e.g. GOOGLE_DOM_DRIFT cluster) results in exactly one grouped LLM call rather than N individual calls; Vitest spy confirms invocation count
  3. Triage classifier writes `triage-report.json` with `{severity, category, root_cause_hypothesis, confidence, rationale}` per finding; Vitest schema guard test validates all fields present
  4. PDF text injected into LLM prompt is wrapped in `<patent_data>...</patent_data>` XML tags; Vitest test asserts tag presence in the generated prompt string
  5. Developer running the triage entrypoint in a CI environment (with `CI=true`) receives an error exit and does not trigger any `claude -p` invocation; Vitest CI-guard test mirrors the existing `e2e-explore-ci-guard.test.js` pattern
**Plans**: TBD

### Phase 35: Rich Issue Filer + Quarantine Corpus
**Goal**: Confirmed triaged findings are filed as richly-structured GitHub issues with reproducer, verifier detail, LLM rationale, and golden diff — all within character budgets — and are simultaneously appended to `test-cases-quarantine.js` for downstream CI coverage
**Depends on**: Phase 34 (`triage-report.json` schema locked — shared input for both issue filer and quarantine-append)
**Requirements**: ISSUE-01, ISSUE-02, ISSUE-03, ISSUE-04, QUAR-01, QUAR-02, QUAR-05
**Success Criteria** (what must be TRUE):
  1. `lib/issue-payload-builder.js` assembles an issue body that contains all four sections (reproducer command + seed, verifier disagreement detail with tier + PDF snippet, LLM rationale, golden diff); Vitest tests assert all sections present and within budgets (rationale ≤800 chars, verifier windows ≤600 chars each, golden diff ≤400 chars); fingerprint comment appears on line 1
  2. Running `scripts/e2e-report-issue.mjs --source triage` against a fixture triage report creates a GitHub issue with the finding's errorClass applied as a GitHub label (in addition to body content); Vitest mock-gh test confirms label argument passed
  3. `findMatchingIssue` performs dual-search across v1 and v2 fingerprint formulas; Vitest tests confirm an issue with a v1 fingerprint is correctly deduplicated and not re-filed
  4. `tests/e2e/test-cases-quarantine.js` exists with schema identical to `test-cases.js`; Vitest schema-guard test in `test:src` suite passes and would fail on a deliberately introduced field mismatch
  5. Running `scripts/quarantine-append.mjs` twice with the same CONFIRMED finding produces only one entry in `test-cases-quarantine.js` (idempotent upsert); entries with `stable_runs ≥ 3` are auto-tagged `quarantine:ready-for-promotion`; `scripts/promote-from-quarantine.mjs` moves the entry to `test-cases.js` and regenerates the golden baseline for that case
**Plans**: TBD

### Phase 36: Quarantine CI Integration + Pipeline Orchestrator
**Goal**: The full triage pipeline (rerun → triage → issue-file → quarantine-append) runs end-to-end in the nightly cron when an `llm_run_id` input is provided, the quarantine corpus runs as a non-gating Playwright project, and timeout budget is documented and within job limits
**Depends on**: Phase 35 (`test-cases-quarantine.js` file and `quarantine-append.mjs` exist)
**Requirements**: QUAR-03, QUAR-04, ORCH-01, ORCH-02, ORCH-03
**Success Criteria** (what must be TRUE):
  1. `tests/e2e/specs/quarantine.spec.js` Playwright project runs the quarantine corpus with `retries: 0`; running `npm run e2e:quarantine` (or equivalent) against the initial empty-corpus file exits 0 with 0 tests
  2. `scripts/run-triage-pipeline.mjs` chains rerun-validator → triage-classifier → issue-payload-builder → quarantine-append; a run against a fixture `llm-report.json` with one CONFIRMED finding exits 0, writes `rerun-report.json` + `triage-report.json`, files a mock issue, and appends one entry to `test-cases-quarantine.js`
  3. `e2e-nightly.yml` dispatched with `llm_run_id` input downloads the artifact, runs the triage pipeline, and executes the quarantine spec with `continue-on-error: true`; dispatched without `llm_run_id` the triage pipeline and quarantine spec steps are skipped (existing nightly behavior unchanged)
  4. A quarantine spec failure files a GitHub issue with the `e2e-quarantine` label via the existing `e2e-report-issue.mjs` path; Vitest or YAML-level comment confirms the label is `e2e-quarantine` (not the golden-suite label)
  5. Timeout budget comment in `e2e-nightly.yml` documents the arithmetic: existing nightly runtime + (N quarantine cases × per-case estimate) fits within the configured job timeout
**Plans**: TBD

### Phase 37: Weekly Analytics Digest
**Goal**: Every Monday at 07:00 UTC a digest of the prior week's LLM-triage findings is published to GitHub Discussions (or as a labeled issue fallback) and committed as a markdown file, aggregating findings count, classification breakdown, top 3 failure categories, quarantine growth, and cost vs cap — all within 50 lines
**Depends on**: Phase 36 (nightly pipeline running and filing issues with `e2e-nightly`/`e2e-quarantine` labels — digest reads these issues via GitHub Issues API)
**Requirements**: DIGEST-01, DIGEST-02, DIGEST-03, DIGEST-04
**Success Criteria** (what must be TRUE):
  1. `scripts/weekly-digest.mjs` run against a fixture set of GitHub issues (mocked via `gh` CLI stub) produces a markdown summary with findings count, classification breakdown table, top 3 failure categories, quarantine growth, and cost vs cap — total output ≤50 lines, no per-iteration list
  2. `SUMMARY_KEYS` is exported from `lib/llm-report.js`; `weekly-digest.mjs` validates all keys present at startup and throws with a descriptive error (not silent zero) if any key is missing; Vitest test covers the missing-key throw path
  3. `.github/workflows/e2e-weekly-digest.yml` triggers on Monday 07:00 UTC cron with `contents: write` and `discussions: write` permissions; the digest is committed to `reports/weekly-digest-YYYY-WNN.md` in the same run
  4. Digest is published to GitHub Discussion via `gh api graphql createDiscussion` if Discussions is enabled on the repo; if not enabled (verified at phase start), a GitHub issue with `e2e-digest` label is filed instead — both paths are implemented and selected by a single config flag
**Plans**: TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Extension Foundation and PDF Fetch | v1.0 | 2/2 | Complete | 2026-02-28 |
| 2. PDF Parsing Pipeline | v1.0 | 2/2 | Complete | 2026-03-01 |
| 3. Text Matching and Citation Generation | v1.0 | 3/3 | Complete | 2026-03-01 |
| 4. Citation Output | v1.0 | 1/1 | Complete | 2026-03-02 |
| 5. Silent Mode | v1.1 | 2/2 | Complete | 2026-03-02 |
| 6. USPTO API Fallback | v1.1 | 3/3 | Complete | 2026-03-02 |
| 7. Server-side Cache | v1.1 | 3/3 | Complete | 2026-03-03 |
| 8. Test Harness Foundation | v1.2 | 3/3 | Complete | 2026-03-03 |
| 9. Accuracy Audit and Algorithm Fixes | v1.2 | 2/2 | Complete | 2026-03-03 |
| 10. Icon Set and Manifest Updates | v1.2 | 2/2 | Complete | 2026-03-03 |
| 11. Options Page Polish | v1.2 | 2/2 | Complete | 2026-03-03 |
| 12. Store Listing and Submission | v1.2 | 2/2 | Complete | 2026-03-03 |
| 13. Offscreen Wrap-Hyphen Fix | v1.2 | 1/1 | Complete | 2026-03-03 |
| 14. Shared Code Extraction | v2.0 | 2/2 | Complete | 2026-03-04 |
| 15. esbuild Build Pipeline | v2.0 | 3/3 | Complete | 2026-03-04 |
| 16. Firefox Extension | v2.0 | 3/3 | Complete | 2026-03-04 |
| 17. Cross-Browser Validation | v2.0 | 2/2 | Complete | 2026-03-05 |
| 18. Core CI Workflow | v2.1 | 1/1 | Complete | 2026-03-05 |
| 19. CI Hardening | v2.1 | 1/1 | Complete | 2026-03-05 |
| 20. OCR Normalization and Concat Refactor | v2.2 | 2/2 | Complete | 2026-03-05 |
| 21. Gutter-Tolerant Matching | v2.2 | 1/1 | Complete | 2026-03-05 |
| 22. Validation and Golden Baseline | v2.2 | 1/1 | Complete | 2026-03-05 |
| 23. Column Inference for Headerless PDFs | v2.3 | 3/3 | Complete    | 2026-05-12 |
| 24. Firefox AMO Validation Cleanup | v2.3 | 1/1 | Complete    | 2026-05-12 |
| 25. Automatic Release Workflow | v2.3 | 1/1 | Complete    | 2026-05-12 |
| 26. Playwright Harness Scaffolding | v3.0 | 3/3 | Complete    | 2026-05-14 |
| 27. Selection Emulation + 76-Case Deterministic Suite | v3.0 | 10/9 | Complete    | 2026-05-15 |
| 28. Independent PDF Verifier | v3.0 | 5/5 | Complete    | 2026-05-15 |
| 29. CI Nightly Cron + Auto-Issue Filing | v3.0 | 4/4 | Complete    | 2026-05-17 |
| 30. Worker Fault-Injection | v3.0 | 5/5 | Complete    | 2026-05-18 |
| 31. LLM Exploratory Mode + Docs | v3.0 | 4/4 | Complete    | 2026-05-20 |
| 32. HUMAN-UAT Verification | v3.1 | 5/5 | Complete    | 2026-05-25 |
| 33. Re-run Validator | v3.1 | 5/5 | Complete    | 2026-05-27 |
| 34. Hybrid Triage Classifier | v3.1 | 0/? | Not started | - |
| 35. Rich Issue Filer + Quarantine Corpus | v3.1 | 0/? | Not started | - |
| 36. Quarantine CI Integration + Pipeline Orchestrator | v3.1 | 0/? | Not started | - |
| 37. Weekly Analytics Digest | v3.1 | 0/? | Not started | - |

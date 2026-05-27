# Requirements: Patent Citation Tool — v3.1 LLM-Driven Product Improvement Loop

**Defined:** 2026-05-22
**Core Value:** Highlight text on Google Patents, get an accurate citation reference instantly — no PDF downloading, no manual counting.
**Milestone Goal:** Close the loop from v3.0's LLM exploratory testing into actionable product fixes — reproducibility-validated, hybrid-triaged findings flow into rich-context GitHub issues and a tiered quarantine→golden corpus, with a weekly analytics digest driving roadmap prioritization.

## v3.1 Requirements

Requirements for this milestone. Each maps to roadmap phases (continued numbering from v3.0).

### UAT — HUMAN-UAT Verification (Phase 31 close-out)

- [x] **UAT-01**: Developer can run `npm run e2e:explore` against the Max 5 subscription credit and receive a valid `llm-report.json` with ≥10 real iterations end-to-end
- [x] **UAT-02**: Spend ledger correctly records each iteration's `claude -p` invocation against the $80/$100 monthly cap
- [x] **UAT-03**: `npm run e2e:upload-llm-report` helper triggers the nightly workflow with the local `llm-report.json` as a workflow_dispatch input (local→CI handoff)

### RERUN — Re-run Validator

- [x] **RERUN-01**: Re-run validator deterministically replays each LLM-flagged anomaly 3 times via verifier-only path (no browser)
- [x] **RERUN-02**: Re-run validator writes `rerun-report.json` per anomaly with `{confirmed_count, total_runs, verdict}` schema; 2/3+ confirms → CONFIRMED, 0-1/3 → FLAKE
- [x] **RERUN-03**: `llm-report.json` iteration schema extended with `scroll_y`, `viewport_width`, `viewport_height`, `selected_node_xpath` (ships in same PR as validator)
- [x] **RERUN-04**: ESLint `no-restricted-imports src/` guard extended to cover the re-run validator module

### TRIAGE — Hybrid Classifier

- [x] **TRIAGE-01**: Heuristic-first classifier resolves 6 of 8 ERROR_CLASSES without LLM invocation (LLM_HALLUCINATED_SELECTION, LLM_API_ERROR, HARNESS_ERROR, PASS, WRONG_CITATION with verifier Tier A/B, and FLAKE from rerun-validator)
- [x] **TRIAGE-02**: Heuristic uses named `verifier_strong_agreement` constant (status==='pass' AND tier ∈ {A,B}); Tier C agreements escalate to LLM second-pass (prevents Tier C masking)
- [x] **TRIAGE-03**: Cluster pre-filter routes N≥5 same-errorClass findings (e.g. GOOGLE_DOM_DRIFT) to a single grouped LLM call (cost control)
- [x] **TRIAGE-04**: LLM second-pass uses `invokeClaudePWithLedger` wrapper that calls `appendLedgerEntry` automatically; subscription-local-only (not API-billed); CI guard rejects accidental CI invocation
- [x] **TRIAGE-05**: Triage classifier writes `triage-report.json` with `{severity, category, root_cause_hypothesis, confidence, rationale}` per finding
- [x] **TRIAGE-06**: PDF text injected into LLM prompt is wrapped in `<patent_data>` XML tags to isolate from instructions (prompt-injection defense)

### ISSUE — Rich-Context Auto-Issue Filer

- [ ] **ISSUE-01**: `lib/issue-payload-builder.js` assembles issue body with reproducer command + seed, verifier disagreement detail (expected vs observed + tier + PDF snippet link), LLM classifier rationale + confidence, diff vs last-known-good golden citation
- [ ] **ISSUE-02**: `scripts/e2e-report-issue.mjs` accepts `--source triage` flag and applies errorClass as a GitHub label (in addition to body)
- [ ] **ISSUE-03**: Fingerprint scheme extended additively; `findMatchingIssue` performs dual-search across v1 and v2 fingerprint formulas during transition (no retroactive dedup breakage)
- [ ] **ISSUE-04**: Per-section character budgets enforced: LLM rationale ≤800 chars, verifier windows ≤600 chars each, golden diff ≤400 chars; fingerprint comment on line 1 of body (prevents >65,536 char overflow)

### QUAR — Quarantine Corpus

- [ ] **QUAR-01**: `tests/e2e/test-cases-quarantine.js` exists with schema identical to `test-cases.js`; vitest schema-guard test in `test:src` suite prevents drift
- [ ] **QUAR-02**: `scripts/quarantine-append.mjs` idempotently upserts CONFIRMED triaged findings into the quarantine corpus
- [ ] **QUAR-03**: `tests/e2e/specs/quarantine.spec.js` Playwright project runs the quarantine corpus with `retries: 0`
- [ ] **QUAR-04**: Quarantine spec runs in the nightly cron with `continue-on-error: true` (non-gating); failures file issues with `e2e-quarantine` label via existing `e2e-report-issue.mjs`
- [ ] **QUAR-05**: `scripts/promote-from-quarantine.mjs` human-triggered utility moves a quarantine entry into `test-cases.js` and regenerates the golden baseline for that case; cases with `stable_runs ≥ 3` auto-tagged `quarantine:ready-for-promotion`

### ORCH — Pipeline Orchestrator + CI Integration

- [ ] **ORCH-01**: `scripts/run-triage-pipeline.mjs` chains rerun-validator → triage-classifier → issue-payload-builder → quarantine-append; exits 0 always (same philosophy as nightly)
- [ ] **ORCH-02**: `e2e-nightly.yml` accepts `llm_run_id` workflow_dispatch input; downloads the artifact and runs the triage pipeline only when provided (regression unchanged when absent)
- [ ] **ORCH-03**: Timeout budget audit documented in `e2e-nightly.yml` (existing nightly + quarantine N×per-case-time fits within job timeout)

### DIGEST — Weekly Analytics

- [ ] **DIGEST-01**: `scripts/weekly-digest.mjs` reads open GitHub issues filtered by `e2e-nightly` and `e2e-quarantine` labels via `gh` API and aggregates {findings count, classification breakdown, top 3 failure categories, quarantine growth, cost vs cap}
- [ ] **DIGEST-02**: `.github/workflows/e2e-weekly-digest.yml` triggers Monday 07:00 UTC (after nightly); permissions `contents: write` + `discussions: write`
- [ ] **DIGEST-03**: Digest published to GitHub Discussion via `gh api graphql createDiscussion` (Issue with `e2e-digest` label as fallback if Discussions disabled); markdown also committed to `reports/weekly-digest-YYYY-WNN.md`
- [ ] **DIGEST-04**: `SUMMARY_KEYS` exported from `lib/llm-report.js`; digest validates all keys present (throws on missing, no silent zero); output ≤50 lines (aggregated, not per-iteration)

## Future Requirements

Deferred to v3.2+ or beyond. Acknowledged but not in current roadmap.

### Quarantine Automation
- **QUAR-AUTO-01**: N-consecutive-green auto-PR that promotes a quarantine entry into the golden corpus without manual edit
- **QUAR-AUTO-02**: Auto-close stale quarantine entries that fail to reproduce for ≥14 nightly runs

### Real-time Alerting
- **ALERT-01**: Slack / PagerDuty integration for critical-severity LLM findings (defer until issue volume justifies it; nightly cadence is correct for v3.1)

### Triage Accuracy
- **TRIAGE-FT-01**: Few-shot fine-tuning of triage classifier prompt against a labeled fixture set once 50+ triaged findings exist
- **TRIAGE-FT-02**: Multi-model triage cross-check (subscription + API model agreement check on high-severity classifications)

### Roadmap Productization
- **ROADMAP-01**: Top failure categories from weekly digest auto-generate roadmap candidate items
- **ROADMAP-02**: Quarantine entries ready-for-promotion suggested as v3.2 phase candidates

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Auto-fix attempts via Claude Code (draft PR generation) | High complexity, high false-positive risk; trust must be earned in triage layer first; defer to v3.2+ if/when triage shows ≥90% precision |
| Pattern-detection clustering with ML | Heuristic + LLM second-pass covers the value at much lower cost; ML clustering deferred indefinitely |
| Live LLM exploratory in CI via API billing | Subscription credit pool only for v3.1; adding API-billed CI run requires separate budget guardrails out of scope here |
| Real-time dashboards (Grafana, Datadog) | Weekly digest in GitHub Discussion is sufficient signal for a single-developer codebase; out of scope |
| Cross-extension regression compare (Chrome vs Firefox triage) | Out of scope for v3.1 — Firefox E2E is itself deferred to v3.2+ per v3.0 decisions |
| Triage UI / dashboard | GitHub Issues board IS the UI; no separate frontend |
| New core extension functionality | Milestone is testing-infrastructure-only; same constraint philosophy as v3.0 |
| `@octokit/rest` migration of issue filer | Existing `gh` CLI path is auth'd, unit-tested with mock interface, and battle-proven; migrating buys nothing |
| LangChain / Vercel AI SDK / instructor-js | Existing `invokeClaudeP`/`parseClaudeResponse` primitives are exactly right for short closed-taxonomy classification; a framework is overkill |
| Separate `e2e-quarantine.yml` workflow | Causes concurrency-group collision risk; quarantine is nightly-only and belongs as a step in `e2e-nightly.yml` |
| Automatic golden promotion without human PR | Destroys the trust invariant of the golden corpus; promotion stays human-gated |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| UAT-01 | Phase 32 | Complete |
| UAT-02 | Phase 32 | Complete |
| UAT-03 | Phase 32 | Complete |
| RERUN-01 | Phase 33 | Complete |
| RERUN-02 | Phase 33 | Complete |
| RERUN-03 | Phase 33 | Complete |
| RERUN-04 | Phase 33 | Complete |
| TRIAGE-01 | Phase 34 | Complete |
| TRIAGE-02 | Phase 34 | Complete |
| TRIAGE-03 | Phase 34 | Complete |
| TRIAGE-04 | Phase 34 | Complete |
| TRIAGE-05 | Phase 34 | Complete |
| TRIAGE-06 | Phase 34 | Complete |
| ISSUE-01 | Phase 35 | Pending |
| ISSUE-02 | Phase 35 | Pending |
| ISSUE-03 | Phase 35 | Pending |
| ISSUE-04 | Phase 35 | Pending |
| QUAR-01 | Phase 35 | Pending |
| QUAR-02 | Phase 35 | Pending |
| QUAR-03 | Phase 36 | Pending |
| QUAR-04 | Phase 36 | Pending |
| QUAR-05 | Phase 35 | Pending |
| ORCH-01 | Phase 36 | Pending |
| ORCH-02 | Phase 36 | Pending |
| ORCH-03 | Phase 36 | Pending |
| DIGEST-01 | Phase 37 | Pending |
| DIGEST-02 | Phase 37 | Pending |
| DIGEST-03 | Phase 37 | Pending |
| DIGEST-04 | Phase 37 | Pending |

**Coverage:**
- v3.1 requirements: 29 total
- Mapped to phases: 29
- Unmapped: 0 ✓

---
*Requirements defined: 2026-05-22*
*Last updated: 2026-05-22 — Traceability table populated after roadmap creation (Phases 32-37)*

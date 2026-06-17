# Roadmap: Patent Citation Tool

## Milestones

- ✅ **v1.0 MVP** — Phases 1-4 (shipped 2026-03-01)
- ✅ **v1.1 Silent Mode + Infrastructure** — (shipped)
- ✅ **v1.2 Store Polish + Accuracy Hardening** — (shipped)
- ✅ **v2.0 Firefox Port** — (shipped)
- ✅ **v2.1 CI/CD Pipeline** — (shipped)
- ✅ **v2.2 Matching Robustness** — (shipped)
- ✅ **v2.3 Post-v2.2 Hardening** — (shipped)
- ✅ **v3.0 Autonomous E2E Testing Agent** — Phases 26-31 (shipped 2026-05-20)
- ✅ **v3.1 LLM-Driven Product Improvement Loop** — Phases 32-38 (shipped 2026-05-30)
- ✅ **v4.0 Self-Healing Test Suite** — Phases 39-47 (shipped 2026-06-02)
- ✅ **v4.1 Readiness Gate + Push** — Phases 48-55 (shipped 2026-06-04)
- ✅ **v4.2 Auto-Fix Loop Live** — Phases 56-60 (shipped 2026-06-09)
- ⏸️ **v4.3 Auto-Fix Loop Closure + Capability Expansion** — Phases 61-67 (6/7 shipped; PAUSED 2026-06-12, retired in v6.1)
- ✅ **v5.0 Bug Report Feature** — Phases 1-5 (shipped 2026-06-15)
- ✅ **v6.0 Standalone Citation Webapp** — Phases 6-9 (shipped 2026-06-17)
- 🚧 **v6.1 Auto-Fix from Bug Reports** — Phases 10-14 (in progress)

> Phase numbering: v5.0 used a reset (Phases 1-5). v6.0 continues from 5 → Phases 6-9. v6.1 continues from 9 → Phases 10-14. v4.3 paused phases (61-67) archived and retired at `.planning/milestones/v4.3-phases-paused/`.

## Phases

<details>
<summary>✅ v5.0 Bug Report Feature (Phases 1-5) — SHIPPED 2026-06-15</summary>

- [x] Phase 1: Worker Route + KV Schema + Privacy Compliance Groundwork (3/3 plans) — completed 2026-06-13
- [x] Phase 2: Shared Constants + Pure Payload Builder (1/1 plan) — completed 2026-06-13
- [x] Phase 3: Background Submission Handler + Rate Limit + Retry Queue (3/3 plans) — completed 2026-06-13
- [x] Phase 4: Report Dialog UI + Citation-UI Wiring (4/4 plans) — completed 2026-06-13
- [x] Phase 5: Options Page Debug Mode + Popup Fallback + Live UAT (5/5 plans) — completed 2026-06-14

Full detail: `.planning/milestones/v5.0-ROADMAP.md` · Requirements: `.planning/milestones/v5.0-REQUIREMENTS.md`

</details>

> Earlier milestones (v1.0–v4.2) archived under `.planning/milestones/`. v4.3 paused-phase artifacts at `.planning/milestones/v4.3-phases-paused/`.

---

<details>
<summary>✅ v6.0 Standalone Citation Webapp (Phases 6-9) — SHIPPED 2026-06-17</summary>

- [x] **Phase 6: Security Gate + Worker Auth Split** - Rotate compromised PROXY_TOKEN, add rate limiting on all webapp-accessible Worker routes, and add public Origin-auth routes for the webapp (no token in browser JS) (completed 2026-06-16)
- [x] **Phase 7: Shared Core Extraction + Corpus Guard** - Extract matching.js, position-map-builder.js, pdf-parser.js into src/shared/ with a configurePdfWorker(url) seam; golden corpus passes 100% on both builds (completed 2026-06-16)
- [x] **Phase 8: Webapp Core Build** - Build the standalone webapp (patent number entry, cache-first pipeline, client-side PDF.js parsing, citation display, batch mode, format toggle, copy-to-clipboard) (3 plans) (completed 2026-06-16)
- [x] **Phase 9: Deploy + Live UAT + Privacy** - Deploy dist/webapp/ to cite.tonyrowles.com via Workers Assets; run live end-to-end UAT; update privacy policy (completed 2026-06-17)

</details>

---

### 🚧 v6.1 Auto-Fix from Bug Reports (Phases 10-14)

**Milestone Goal:** Turn real, human-reported citation failures from the v5.0 `BUG_REPORTS` KV channel into regression-safe fixes — heuristic-first auto-triage, manual-promote escape hatch, LLM candidate fix to the matching core, regression-proof before merge, human approval required. Rebuilt from first principles; the v4.3 autonomous machinery is retired.

**Hard dependency chain (all four researchers + synthesizer converged on this order):**
```
Phase 10 (Retirement) → Phase 11 (Triage Layer)
  → Phase 12 (Fix Generation + Regression Gate)
    → Phase 13 (Triple-Gate Extension)
      → Phase 14 (UAT + Digest)
```

**Key locked decisions:**
- Fix surface is `src/shared/` matching core only (`matching.js`, `position-map-builder.js`, `pdf-parser.js`)
- Triage is heuristic-only (no LLM); LLM budget reserved for fix generation
- `workflow_dispatch:` only for triage/ingestion in this milestone (no cron)
- `MAX_FIXES_PER_RUN` default 5; LLM fix-iteration cap default 3 before `auto-fix-stuck`
- Human merge gate is a permanent invariant — no auto-merge of `src/` fix PRs, ever

- [ ] **Phase 10: Retirement + Scaffolding** - Remove the v4.3 autonomous machinery (fixture-mutator, explore cron, v40-auto-fix synthetic trigger), archive paused Phase 61-67 artifacts, stub REPORT_FIX_SCAFFOLD, confirm test suite green (3 plans)
- [ ] **Phase 11: Triage Layer** - Build `ingest-reports.mjs` (KV polling, heuristic classifier, GitHub Issue creation, `promote` subcommand, `_review.status` write-back, triage artifact, post-fix suppression, corpus cross-check)
- [ ] **Phase 12: Fix Generation + Regression Gate** - Complete `REPORT_FIX_SCAFFOLD`, build `v61-report-fix.yml` workflow (KV fetch, LLM invocation, diff-guard, two-commit ledger split, draft PR), wire GATE-01..04 and COST-01..04 — HIGHEST RISK: needs research-phase during planning
- [ ] **Phase 13: Triple-Gate Extension** - Extend `assertTripleGate` Leg 3 to accept `report-fix-candidate`, update `v40-auto-promote.yml`, update Vitest sha256 pin
- [ ] **Phase 14: End-to-End UAT + Digest** - Live end-to-end pipeline validation, digest `BUG_REPORTS` section, post-milestone golden corpus clean

## Phase Details

### Phase 10: Retirement + Scaffolding
**Goal**: The v4.3 autonomous machinery is cleanly removed and the full test suite is green, establishing a clear workspace for v6.1
**Depends on**: Nothing (do first)
**Requirements**: RTR-01, RTR-02, RTR-03, RTR-04, RTR-05
**Success Criteria** (what must be TRUE):
  1. Running `npm test` exits 0 at ≥ current test count and the 75-case golden corpus passes 100% after the retirement changes — proving nothing in the citation pipeline was accidentally broken
  2. The `v40-auto-fix.yml` workflow can no longer fire via the old `issues: labeled` synthetic trigger — a maintainer inspecting the YAML sees only `workflow_dispatch:` as the trigger
  3. The paused v4.3 Phase 61-67 artifacts and `RESUME-V4.3.md` are present under `.planning/milestones/` with a clear "superseded" note — they are archived, not deleted, and STATE.md records that the re-enable checklist is voided
  4. `tests/e2e/scripts/inject-defect.mjs` is gone and no npm script references it — running `npm run e2e:explore` either errors helpfully or is absent
  5. A stub `REPORT_FIX_SCAFFOLD` entry exists in `tests/e2e/lib/fix-prompt-builder.js` — subsequent phases can import from a known location without a "file not found" failure
**Plans**: 3 plans
  - [ ] 10-01-PLAN.md — Hard-delete v40-auto-fix.yml + inject-defect.mjs + e2e-explore.mjs and surgically repair all dependent live tests (RTR-01/02/03)
  - [ ] 10-02-PLAN.md — Add bare pure REPORT_FIX_SCAFFOLD stub; archive RESUME-V4.3.md with SUPERSEDED note; record voiding in STATE.md (RTR-04 + scaffold)
  - [ ] 10-03-PLAN.md — [BLOCKING] RTR-05 full-suite green proof + 75-case golden corpus 100% + dangling-reference sweep (RTR-05)

### Phase 11: Triage Layer
**Goal**: A maintainer can run one command to read, classify, and promote real bug reports from the `BUG_REPORTS` KV channel into candidate GitHub Issues — with every heuristic decision pinned by a Vitest test and the full classifier idempotent on re-run
**Depends on**: Phase 10
**Requirements**: ING-01, ING-02, ING-03, ING-04, TRI-01, TRI-02, TRI-03, TRI-04, TRI-05, TRI-06, TRI-07, PROMO-01, PROMO-02, PROMO-03, PROMO-04
**Success Criteria** (what must be TRUE):
  1. Running `node scripts/ingest-reports.mjs` (via `workflow_dispatch`) reads the `BUG_REPORTS` KV namespace with `--remote`, prints a structured JSON list of pending reports, and emits a triage-report artifact file with one entry per processed report — a maintainer can see what was classified and why
  2. A report matching the auto-promote signals (`confidenceTier:"green"` + `category:"inaccurate_citation"`, OR `duplicate_count >= 3`, OR patent in quarantine corpus) becomes a GitHub Issue labeled `report-fix-candidate` with a `<!-- kv-key: report:{fp}:{ts} -->` pointer in the body — the issue body is human-readable, not a raw JSON dump
  3. Running `node scripts/ingest-reports.mjs` a second time on the same report set does NOT create duplicate Issues or re-process already-handled reports — the `_review.status` write-back makes re-runs safe
  4. A maintainer can manually promote any report (noise, user_error, or ambiguous) via `node scripts/ingest-reports.mjs promote <fp> <ts>` — the same GitHub Issue is created and the triage artifact records `promotion_source: 'manual'`
  5. `tool_not_working` / `pdfParseStatus:"error"` reports are classified as `infrastructure` and do NOT create `report-fix-candidate` issues — the triage log shows them as skipped with the reason
**Plans**: TBD

### Phase 12: Fix Generation + Regression Gate
**Goal**: A `report-fix-candidate`-labeled Issue triggers a workflow that produces a regression-safe candidate fix as a draft PR — the LLM operates only on the matching core, costs are bounded, and prompt injection from user report fields is structurally blocked
**Depends on**: Phase 11
**Requirements**: FIX-01, FIX-02, FIX-03, FIX-04, FIX-05, GATE-01, GATE-02, GATE-03, GATE-04, COST-01, COST-02, COST-03, COST-04
**Success Criteria** (what must be TRUE):
  1. Labeling a GitHub Issue `report-fix-candidate` triggers `v61-report-fix.yml`, which fetches the full KV record via `wrangler --remote`, invokes `invokeAnthropicSdkWithLedger`, and opens a draft PR on an `auto-fix/<fp-short>` branch — the PR diff contains only `src/shared/` changes (verifiable by `git diff --name-only`)
  2. The `v40-verifier-gate.yml` workflow runs on the draft PR: zero golden regressions and no new quarantine failures are required before the PR moves from draft to ready-for-review — a passing PR carries the `auto-fix:verified` label
  3. A diff that contains the reported `patentNumber` as a string literal in `src/` is flagged for mandatory human review and the PR body notes the specificity concern — no silent overfitting reaches the merge gate
  4. All LLM calls route through `safeAppendLedger` with `source:'report-fix-api'`; a per-run cap of 5 analysis calls is enforced; a report that exhausts 3 fix-iteration attempts gets the `auto-fix-stuck` label and no further spend — the monthly ledger cap remains untriggered for a single typical run
  5. No `auto-merge` flag exists in `v61-report-fix.yml` or any `v40-*.yml` — a Vitest static-grep test enforces this as a named permanent invariant
**Plans**: TBD
**Research flag**: NEEDS RESEARCH-PHASE during planning — the `REPORT_FIX_SCAFFOLD` prompt design for the KV-report → matching-core diff is novel; validate with a sample report before writing the workflow YAML; plan 2-3 prompt-iteration cycles; the interaction between `--max-turns 5 --tools Read,Glob,Grep` and the new scaffold is the highest uncertainty in the milestone

### Phase 13: Triple-Gate Extension
**Goal**: Merged fix PRs originating from `report-fix-candidate` issues trigger the auto-promote cycle — closing the loop from human-merge to golden-corpus promotion — with the `assertTripleGate` trust invariant preserved and byte-stable
**Depends on**: Phase 12
**Requirements**: GATE-05
**Success Criteria** (what must be TRUE):
  1. After a maintainer merges an `auto-fix:verified` PR sourced from a `report-fix-candidate` Issue, `v40-auto-promote.yml` fires and `assertTripleGate` passes — the post-merge auto-promote cycle opens a follow-up PR to promote the fix to the golden corpus
  2. The `assertTripleGate` body change and its Vitest sha256 pin are updated atomically in the same commit — the pin test passes on `main` after the change and there is no window where the gate is unenforced
  3. The existing `triage`-sourced auto-promote path continues to work (no regression from the Leg 3 extension) — the gate accepts either label, not only the new one
**Plans**: TBD

### Phase 14: End-to-End UAT + Digest
**Goal**: The full pipeline is validated end-to-end on real or seeded production data, the 75-case golden corpus is confirmed clean after all v6.1 changes, and the Monday weekly digest gains a `BUG_REPORTS` metrics section
**Depends on**: Phases 10-13
**Requirements**: DGST-01, UAT-01, UAT-02, UAT-03
**Success Criteria** (what must be TRUE):
  1. A real or seeded `BUG_REPORTS` record travels the full pipeline — triage promotes it, LLM generates a fix, verifier-gate passes, maintainer merges, auto-promote closes the Issue — with a ledger entry at each LLM call and no monthly cap breach
  2. The manual-promote escape hatch is exercised live: a report that was NOT auto-promoted is force-promoted via `ingest-reports.mjs promote <fp> <ts>` and successfully travels the same fix-generation and merge path
  3. `npm test` exits 0 at 100% on the 75-case golden corpus after all v6.1 changes — confirming the retirement phase introduced no citation regressions
  4. The Monday 07:00 UTC weekly digest includes a `BUG_REPORTS` section with report volume, classification breakdown, and promotion/PR/merged/stuck counts — a maintainer can see pipeline health without querying KV directly
**Plans**: TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Worker Route + KV Schema + Privacy Compliance | v5.0 | 3/3 | Complete | 2026-06-13 |
| 2. Shared Constants + Pure Payload Builder | v5.0 | 1/1 | Complete | 2026-06-13 |
| 3. Background Submission Handler + Rate Limit + Retry Queue | v5.0 | 3/3 | Complete | 2026-06-13 |
| 4. Report Dialog UI + Citation-UI Wiring | v5.0 | 4/4 | Complete | 2026-06-13 |
| 5. Options Page Debug Mode + Popup Fallback + Live UAT | v5.0 | 5/5 | Complete | 2026-06-14 |
| 6. Security Gate + Worker Auth Split | v6.0 | 4/4 | Complete | 2026-06-16 |
| 7. Shared Core Extraction + Corpus Guard | v6.0 | 2/2 | Complete | 2026-06-16 |
| 8. Webapp Core Build | v6.0 | 3/3 | Complete | 2026-06-16 |
| 9. Deploy + Live UAT + Privacy | v6.0 | 0/TBD | Complete | 2026-06-17 |
| 10. Retirement + Scaffolding | v6.1 | 0/TBD | Not started | - |
| 11. Triage Layer | v6.1 | 0/TBD | Not started | - |
| 12. Fix Generation + Regression Gate | v6.1 | 0/TBD | Not started | - |
| 13. Triple-Gate Extension | v6.1 | 0/TBD | Not started | - |
| 14. End-to-End UAT + Digest | v6.1 | 0/TBD | Not started | - |

## Backlog

> Backlog cleared. v6.1 phases 10-14 are the active work.

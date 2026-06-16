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
- ⏸️ **v4.3 Auto-Fix Loop Closure + Capability Expansion** — Phases 61-67 (6/7 shipped; PAUSED 2026-06-12, resumes in v5.1)
- ✅ **v5.0 Bug Report Feature** — Phases 1-5 (shipped 2026-06-15)

> Phase numbering RESET for v5.0 (`--reset-phase-numbers`); started at Phase 1. v4.3 paused phases (61-67) archived at `.planning/milestones/v4.3-phases-paused/`. v5.1 resumes the auto-fix carry-over alongside bug-report ingestion.

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

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Worker Route + KV Schema + Privacy Compliance | v5.0 | 3/3 | Complete | 2026-06-13 |
| 2. Shared Constants + Pure Payload Builder | v5.0 | 1/1 | Complete | 2026-06-13 |
| 3. Background Submission Handler + Rate Limit + Retry Queue | v5.0 | 3/3 | Complete | 2026-06-13 |
| 4. Report Dialog UI + Citation-UI Wiring | v5.0 | 4/4 | Complete | 2026-06-13 |
| 5. Options Page Debug Mode + Popup Fallback + Live UAT | v5.0 | 5/5 | Complete | 2026-06-14 |

## Backlog

### Phase 999.1: Standalone citation webapp on tonyrowles.com (BACKLOG)

**Goal:** [Captured for future planning] A web page where a user enters a patent number + a text passage and gets back the citation (column:line), reusing the extension's deterministic matching core. No LLM — citations are 100% deterministic position lookups.
**Requirements:** TBD
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with /gsd:review-backlog when ready)

**Decisions already made (from 2026-06-15 discussion):**
- **Same repo, NOT a new repo/project.** Value is reusing `src/shared/matching.js`, `src/offscreen/position-map-builder.js`, `src/offscreen/pdf-parser.js` (all pure, zero `chrome.*`/DOM deps). A separate repo would force extracting/versioning a shared package and risk matching-logic drift.
- **Scope as a NEW MILESTONE**, and update PROJECT.md's identity from "browser extension" → "patent citation tooling (extension + webapp)".
- **First phase = extract shared core** into a workspace/package consumed by both surfaces (refactor, no behavior change, guarded by the existing 95-test corpus).
- Existing Cloudflare Worker at `pct.tonyrowles.com` (USPTO proxy + KV cache) is reusable.

**Open risks / notes:**
- PDF.js parsing likely runs client-side in the browser (heavier than the Worker's zero-dep proxy).
- Published applications have no parseable PDF column/line scheme — extension handles via DOM `[0042]` markers, which won't exist server-side. Webapp may skip applications or need a different strategy.
- ⚠️ Hardcoded `PROXY_TOKEN` in `src/offscreen/offscreen.js` must be treated as compromised and moved server-side / rotated before exposing a public webapp.

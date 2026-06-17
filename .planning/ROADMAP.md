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
- ✅ **v6.0 Standalone Citation Webapp** — Phases 6-9 (shipped 2026-06-17)

> Phase numbering: v5.0 used a reset (Phases 1-5). v6.0 continues from 5 → Phases 6-9 to resume cross-milestone continuity. v4.3 paused phases (61-67) archived at `.planning/milestones/v4.3-phases-paused/`.

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

### 🚧 v6.0 Standalone Citation Webapp (In Progress)

**Milestone Goal:** Ship a public web page at `cite.tonyrowles.com` where a user enters a patent number + text passage and receives the exact column:line citation — reusing the extension's deterministic matching core with no LLM. Granted US patents only (v1). Zero new npm dependencies (seventh consecutive milestone).

**Key locked decisions:**
- Shared core uses plain `src/shared/` + esbuild alias (NOT npm workspaces)
- Deployment subdomain: `cite.tonyrowles.com` via Cloudflare Workers Assets
- Webapp auth: Origin-header check only (no embeddable Bearer token in any browser-side code)
- Published applications rejected at BOTH input (webapp) AND Worker level (HTTP 400)
- Zero new npm dependencies

**Forced build order (hard dependency chain):**
```
Phase 6 (security gate + Worker routes) → Phase 7 (shared core extraction)
  → Phase 8 (webapp core build) → Phase 9 (deploy + live UAT)
```

Phase 6 is a blocking precondition: the Worker has no rate limiting on proxy/cache routes, and `PROXY_TOKEN` is already compromised. Neither Phase 7 nor Phase 8 can reach production until Phase 6 is complete. Phase 7 is the foundation every webapp import depends on; Phase 8 cannot be promoted to production until Phase 7 is green. Phase 9 runs last — deploy once, after both Phase 7 and Phase 8 are verified.

---

<details>
<summary>✅ v6.0 Standalone Citation Webapp (Phases 6-9) — SHIPPED 2026-06-17</summary>

- [x] **Phase 6: Security Gate + Worker Auth Split** - Rotate compromised PROXY_TOKEN, add rate limiting on all webapp-accessible Worker routes, and add public Origin-auth routes for the webapp (no token in browser JS) (completed 2026-06-16)
- [x] **Phase 7: Shared Core Extraction + Corpus Guard** - Extract matching.js, position-map-builder.js, pdf-parser.js into src/shared/ with a configurePdfWorker(url) seam; golden corpus passes 100% on both builds (completed 2026-06-16)
- [x] **Phase 8: Webapp Core Build** - Build the standalone webapp (patent number entry, cache-first pipeline, client-side PDF.js parsing, citation display, batch mode, format toggle, copy-to-clipboard) (3 plans) (completed 2026-06-16)
- [x] **Phase 9: Deploy + Live UAT + Privacy** - Deploy dist/webapp/ to cite.tonyrowles.com via Workers Assets; run live end-to-end UAT; update privacy policy (completed 2026-06-17)

</details>


## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Worker Route + KV Schema + Privacy Compliance | v5.0 | 3/3 | Complete | 2026-06-13 |
| 2. Shared Constants + Pure Payload Builder | v5.0 | 1/1 | Complete | 2026-06-13 |
| 3. Background Submission Handler + Rate Limit + Retry Queue | v5.0 | 3/3 | Complete | 2026-06-13 |
| 4. Report Dialog UI + Citation-UI Wiring | v5.0 | 4/4 | Complete | 2026-06-13 |
| 5. Options Page Debug Mode + Popup Fallback + Live UAT | v5.0 | 5/5 | Complete | 2026-06-14 |
| 6. Security Gate + Worker Auth Split | v6.0 | 4/4 | Complete   | 2026-06-16 |
| 7. Shared Core Extraction + Corpus Guard | v6.0 | 2/2 | Complete   | 2026-06-16 |
| 8. Webapp Core Build | v6.0 | 3/3 | Complete   | 2026-06-16 |
| 9. Deploy + Live UAT + Privacy | v6.0 | 0/TBD | Not started | - |

## Backlog

> Phase 999.1 (standalone citation webapp) promoted to v6.0 milestone (Phases 6-9). Backlog cleared.

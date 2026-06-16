---
gsd_state_version: 1.0
milestone: v6.0
milestone_name: Standalone Citation Webapp
status: completed
stopped_at: Roadmap created, REQUIREMENTS.md traceability filled, STATE.md updated. Ready to plan Phase 6.
last_updated: "2026-06-16T20:58:04.342Z"
last_activity: 2026-06-16 -- Phase 6 marked complete
progress:
  total_phases: 4
  completed_phases: 1
  total_plans: 4
  completed_plans: 4
  percent: 25
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-16)

**Core value:** Highlight text on Google Patents, get an accurate citation reference instantly — extended in v6.0 to a standalone web page: enter a patent number + passage, get the exact column:line citation, no LLM.
**Current focus:** Phase 6 — Security Gate + Worker Auth Split

## Current Position

Phase: 6 — COMPLETE
Plan: 1 of 4
Status: Phase 6 complete
Last activity: 2026-06-16 -- Phase 6 marked complete

Progress: [░░░░░░░░░░] 0%

## Key Locked Decisions (v6.0)

- **Shared core:** plain `src/shared/` + esbuild alias — NOT npm workspaces (avoids symlink complexity with per-target Vitest alias configs)
- **Deployment:** `cite.tonyrowles.com` via Cloudflare Workers Assets (Cloudflare Pages blocked: cannot share custom domain with an existing routed Worker)
- **Webapp auth:** Origin-header check only — no `Authorization: Bearer` token in any browser-side webapp code
- **Published applications:** rejected at BOTH input (kind-code A1/A2/A9 → "not supported") AND Worker level (HTTP 400 before any USPTO fetch)
- **Zero new npm dependencies** (seventh consecutive milestone; PDF.js, esbuild, and Wrangler are already installed)
- **Phase 6 is a BLOCKING GATE** — PROXY_TOKEN is already compromised (plaintext in `src/offscreen/offscreen.js:24`); no webapp code can reach production until Phase 6 is complete

## Phase 6 Blockers (must close before any public URL)

- SEC-01..02: Rotate PROXY_TOKEN via `wrangler secret put`; inject from CI secrets in extension build (not committed)
- SEC-03..05: Origin-header auth on webapp routes; IP rate limits on all webapp-accessible Worker routes; global daily KV-write guard
- WRKR-04: Worker rejects A1/A2/A9 kind codes with HTTP 400

## Performance Metrics

**By Milestone:**

| Milestone | Phases | Plans | Duration |
|-----------|--------|-------|----------|
| v1.0 MVP | 4 | 8 | ~3 days |
| v1.1 Silent Mode + Infrastructure | 3 | 8 | 1 day |
| v1.2 Store Polish + Accuracy Hardening | 6 | 12 | 2 days |
| v2.0 Firefox Port | 4 | 10 | ~2 days |
| v2.1 CI/CD Pipeline | 2 | 2 | 2 days |
| v2.2 Matching Robustness | 3 | 4 | 2 days |
| v2.3 Post-v2.2 Hardening | 3 | 5 | 1 day |
| v3.0 Autonomous E2E Testing Agent | 6 | 30 | ~7 days |
| v3.1 LLM-Driven Product Improvement Loop | 7 | 31 | ~9 days |
| v4.0 Self-Healing Test Suite | 9 | 26 | ~3 days |
| v4.1 Readiness Gate + Push | 9 | 11 | ~2 days |
| v4.2 Auto-Fix Loop Live | 5 (+60.1 hotfix) | 11 | ~5 days |
| v5.0 Bug Report Feature | 5 | 16 | ~4 days |
| v6.0 Standalone Citation Webapp | 4 | TBD | TBD |

## Accumulated Context

### Roadmap Evolution

- 2026-06-16: v6.0 roadmap created (Phases 6-9, 33 requirements: SEC-01..05, WRKR-01..04, CORE-01..04, APP-01..10, FMT-01..02, BATCH-01..03, DEPLOY-01..04, PRIV-01). Phase numbering continues from v5.0 (which used Phases 1-5) → v6.0 uses Phases 6-9 to resume cross-milestone continuity. Forced build order from SUMMARY.md honoured: Phase 6 (security gate + Worker routes) blocks all; Phase 7 (shared core extraction) is the foundation; Phase 8 (webapp build) and Phase 9 (deploy + UAT) are the product delivery phases. Coverage: 33/33 requirements mapped; 0 orphans.

### Decisions

- v6.0-roadmap: Phase numbering continues from v5.0 Phases 1-5 → v6.0 Phases 6-9. No reset.
- v6.0-roadmap: LOAD-BEARING — Phase 6 (security gate) must fully complete before any webapp code reaches the production Worker. The PROXY_TOKEN is already compromised (plaintext at `src/offscreen/offscreen.js:24`). Phase 6 bundles SEC + WRKR together — rotating the token and adding the new public routes is one Worker deploy.
- v6.0-roadmap: LOAD-BEARING — `pdf-parser.js`'s `GlobalWorkerOptions.workerSrc = chrome.runtime.getURL(...)` is at module scope (line 14). This throws on import in a plain web page. The `configurePdfWorker(url)` seam is the ONLY non-trivial code change in Phase 7; the other two modules are verbatim moves.
- v6.0-roadmap: LOAD-BEARING — 75-case golden corpus does NOT exercise the browser-context PDF→position-map pipeline. CORE-04 (full-pipeline browser integration test) is required DoD for Phase 7 — it proves pdf-parser.js works in a plain `<script type="module">` context with PDF.js running in a worker thread.
- v6.0-roadmap: LOAD-BEARING — published-application numbers must be rejected at TWO points: (1) webapp input stage (kind-code or `20XXXXXXXX` format → show "not supported") and (2) Worker level (HTTP 400 before any USPTO fetch). Producing a wrong column:line citation from a published-application PDF is worse than an error — the result looks plausible but is meaningless.
- v6.0-roadmap: Workers Assets on `cite.tonyrowles.com` is the ONLY viable Cloudflare static-hosting path. Cloudflare Pages cannot share a custom domain with an existing routed Worker (confirmed known-issue per Cloudflare docs).
- v6.0-roadmap: `source: "webapp"` provenance field required on all webapp KV cache uploads (WRKR-03). Without it, debugging cross-surface cache poisoning is impossible.

### Pending Todos

- v4.3 carry-over (SWEEP-03/04/06 + Phase 68 destructive UAT + final spend tally) — deferred to v5.1 per MEMORY.md entry. Paused-phase artifacts at `.planning/milestones/v4.3-phases-paused/`.

### Blockers/Concerns

- None beyond the Phase 6 blocking gate (documented above and in REQUIREMENTS.md).

## Session Continuity

Last session: 2026-06-16
Stopped at: Roadmap created, REQUIREMENTS.md traceability filled, STATE.md updated. Ready to plan Phase 6.
Resume file: None

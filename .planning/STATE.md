---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: Firefox Port
status: roadmap_ready
last_updated: "2026-03-03"
progress:
  total_phases: 4
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-03)

**Core value:** Highlight text on Google Patents, get an accurate citation reference instantly — no PDF downloading, no manual counting.
**Current focus:** Phase 14 — Shared Code Extraction (ready to plan)

## Current Position

Phase: 14 of 17 (Shared Code Extraction)
Plan: — (not started)
Status: Ready to plan
Last activity: 2026-03-03 — v2.0 roadmap created (phases 14-17)

Progress: [░░░░░░░░░░] 0% (v2.0 milestone)

## Performance Metrics

**By Milestone:**

| Milestone | Phases | Plans | Duration |
|-----------|--------|-------|----------|
| v1.0 MVP | 4 | 8 | ~3 days |
| v1.1 Silent Mode + Infrastructure | 3 | 8 | 1 day |
| v1.2 Store Polish + Accuracy Hardening | 6 | 12 | 2 days |
| v2.0 Firefox Port | 4 | TBD | — |

## Accumulated Context

### Decisions

All v1.0–v1.2 decisions archived in PROJECT.md Key Decisions table.

- [v2.0 scope]: webextension-polyfill excluded — Firefox natively supports chrome.* API
- [v2.0 scope]: Two separate manifests (Chrome + Firefox) — differences too numerous for patch approach
- [v2.0 scope]: Build-time minification deferred — keep source readable for extension store review

### Pending Todos

None.

### Blockers/Concerns

- [Phase 16 risk]: Firefox event page lifecycle during active PDF.js parse is MEDIUM confidence — empirical test needed during implementation
- [Phase 16 risk]: PDF.js WASM + Firefox CSP may require wasm-unsafe-eval in manifest.firefox.json — test in Phase 16
- [Phase 16 risk]: Cloudflare Worker CORS may need moz-extension:// origin explicitly allowed — verify in Phase 16

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 1 | Fix off-by-2 error in patent column line number calculation | 2026-03-03 | f5b86dd | [1-fix-off-by-2-error-in-patent-column-line](./quick/1-fix-off-by-2-error-in-patent-column-line/) |

## Session Continuity

Last activity: 2026-03-03 - v2.0 roadmap created
Status: Ready to plan Phase 14
Next: `/gsd:plan-phase 14`

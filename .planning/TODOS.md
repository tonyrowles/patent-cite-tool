# TODOs

## Completed

- [x] Migrate Worker URL from `patent-cite-worker.fatduck.workers.dev` to custom domain `pct.tonyrowles.com`. Updated `src/offscreen/offscreen.js` (WORKER_URL) and `src/manifest.json` (host_permissions). (2026-03-03)

## Pending

- [ ] Define the next milestone. Worker-route infrastructure fixes remain outside the v6.1 matching-core fix scope (see STATE.md).
- [ ] Complete the remaining live UAT tails: auto-promote issue closure and the per-run fix cap.

## Retired

- v4.3 Auto-Fix Loop Closure machinery was retired in v6.1. The former resume checklist is superseded; do not restore its synthetic triggers or deleted contract tests. See `.planning/milestones/v4.3-phases-paused/` and STATE.md.

# TODOs

## Completed

- [x] Migrate Worker URL from `patent-cite-worker.fatduck.workers.dev` to custom domain `pct.tonyrowles.com`. Updated `src/offscreen/offscreen.js` (WORKER_URL) and `src/manifest.json` (host_permissions). (2026-03-03)

## Pending

- [ ] **When resuming v4.3 (Auto-Fix Loop Closure) as a future milestone** — follow `.planning/RESUME-V4.3.md` to restore the CI plumbing made dormant for the v5.0 Bug Report release: re-enable 2 disabled `v40-*` workflows (`gh workflow enable`), restore their gated triggers, and un-skip 6 stale contract tests. The auto-fix engine itself was untouched. v4.3 *work* scope (mutator + `--max-turns` relaxation, etc.) is in `.planning/MILESTONES.md` (v4.2 entry).

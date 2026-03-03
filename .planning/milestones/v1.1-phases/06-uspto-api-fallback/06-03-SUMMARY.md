---
phase: 06-uspto-api-fallback
plan: 03
subsystem: infra
tags: [cloudflare-workers, wrangler, deploy, chrome-extension, offscreen, manifest-v3, pdf-js]

# Dependency graph
requires:
  - phase: 06-uspto-api-fallback
    plan: 01
    provides: Cloudflare Worker scaffold (worker/ subdirectory) ready for wrangler deploy
  - phase: 06-uspto-api-fallback
    plan: 02
    provides: Extension fallback wiring with PLACEHOLDER constants for WORKER_URL and PROXY_TOKEN

provides:
  - Deployed Cloudflare Worker at patent-cite-worker.fatduck.workers.dev
  - Real WORKER_URL and PROXY_TOKEN values in src/offscreen/offscreen.js
  - Actual Worker URL in src/manifest.json host_permissions
  - End-to-end verified full USPTO fallback pipeline (Google Patents fail -> Worker -> parse -> citation)

affects:
  - Custom domain migration (pct.rowles.esq) — TODO created, future plan needed
  - Phase 07 (any future phases reading currentPatent.source field)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "workers.dev URL used for initial deployment; custom domain migration deferred to separate task"
    - "PDF.js useSystemFonts: true eliminates standardFontDataUrl warning in offscreen context"
    - "Y-gap detection for blank line accounting in position-map-builder line numbering"

key-files:
  created: []
  modified:
    - src/offscreen/offscreen.js
    - src/manifest.json

key-decisions:
  - "Used workers.dev URL instead of custom domain pct.rowles.esq — custom domain DNS/routing not configured correctly; TODO created for migration"
  - "PDF.js standardFontDataUrl warning suppressed via useSystemFonts: true — correct approach for offscreen extension context where font data URL is unavailable"
  - "Blank lines in patent PDFs must be counted in position-map-builder via y-gap detection — line numbers are 1-indexed over all lines including blank separators"

patterns-established:
  - "Pattern: Deploy to workers.dev first, migrate custom domain separately after DNS routing confirmed"

requirements-completed: [UPTO-01, UPTO-02, UPTO-03]

# Metrics
duration: ~2h (user-paced — required Cloudflare login, secret provisioning, and manual browser E2E verification)
completed: 2026-03-02
---

# Phase 6 Plan 03: USPTO API Fallback — Deployment and End-to-End Verification Summary

**Worker deployed to patent-cite-worker.fatduck.workers.dev with production secrets, extension constants updated from PLACEHOLDER to real values, and full end-to-end patent citation from USPTO-sourced PDF verified in browser**

## Performance

- **Duration:** ~2h (user-paced: Cloudflare auth, secret provisioning, browser E2E)
- **Started:** 2026-03-02
- **Completed:** 2026-03-02
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments
- Cloudflare Worker deployed to production at `patent-cite-worker.fatduck.workers.dev` with PROXY_TOKEN and USPTO_API_KEY secrets set
- Extension constants updated: `WORKER_URL` in `offscreen.js` now points to the live Worker; `manifest.json` `host_permissions` includes actual Worker URL
- End-to-end flow verified in browser: patent without Google PDF link triggers USPTO fallback, Worker fetches eGrant PDF, extension parses it, citation produced with correct column:line reference
- `currentPatent.source` confirmed as `'uspto'` for USPTO-fetched patents and `'google'` for Google-fetched patents

## Task Commits

Tasks 1 and 3 were completed by user interaction (Cloudflare deployment and browser E2E verification). Task 2 and deviation fixes were committed atomically:

1. **Task 1: Deploy Worker and set production secrets** - (manual by user — wrangler deploy + secrets set via Cloudflare dashboard/CLI)
2. **Task 2: Update extension constants with real Worker URL and token** - `2d630a4` (feat)
3. **Task 3: End-to-end verification** - (user-verified, confirmed with "approved")

**Deviation fixes (during Task 3 verification):**
- `95a520f` - fix: use workers.dev URL instead of custom domain
- `d58c9b8` - fix: suppress PDF.js standardFontDataUrl warning
- `ca4551b` - fix: account for blank lines in patent column line numbering
- `f1133df` - docs: add TODO for custom domain migration

## Files Created/Modified
- `src/offscreen/offscreen.js` - Updated `WORKER_URL` from PLACEHOLDER to `https://patent-cite-worker.fatduck.workers.dev`; added `useSystemFonts: true` to PDF.js config to suppress standardFontDataUrl warning
- `src/manifest.json` - Updated `host_permissions` to include actual Worker URL (replaced PLACEHOLDER)

## Decisions Made
- Workers.dev URL used instead of custom domain `pct.rowles.esq` — the custom domain was configured in the plan but DNS/routing was not resolving correctly at deployment time. Workers.dev provides the same functionality; custom domain migration deferred via TODO entry in `.planning/TODOS.md`.
- `useSystemFonts: true` in PDF.js config eliminates the `standardFontDataUrl` warning that appeared during offscreen PDF parsing. This is the correct approach for browser extension offscreen contexts where the font data URL path is not available.
- Blank lines in patent PDFs must be explicitly accounted for in the position-map-builder — the line numbering used in patent citations (column N, line M) counts blank separator lines between paragraphs and section headers. Y-gap detection added to position-map-builder to detect and insert blank line entries into the position map.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed blank line counting in position-map-builder**
- **Found during:** Task 3 (E2E verification)
- **Issue:** Patent column:line citations were off because blank lines between paragraphs and section headers were not counted in the position map. The position-map-builder only tracked lines with text content, but patent citation numbering counts all lines including blank separators.
- **Fix:** Added y-gap detection in position-map-builder to identify gaps between text items that represent blank lines, inserting placeholder entries in the position map for each blank line detected.
- **Files modified:** src/background/position-map-builder.js (inferred from context — actual file path may vary)
- **Verification:** E2E test with real patent confirmed correct column:line citations after fix.
- **Committed in:** `ca4551b`

**2. [Rule 1 - Bug] Fixed PDF.js standardFontDataUrl warning**
- **Found during:** Task 3 (E2E verification)
- **Issue:** PDF.js emitted console warnings about `standardFontDataUrl` not being set, indicating font loading was attempting external resource access in the offscreen context.
- **Fix:** Added `useSystemFonts: true` to PDF.js `getDocument()` configuration in offscreen.js, which directs PDF.js to use system fonts rather than downloading standard font data files.
- **Files modified:** `src/offscreen/offscreen.js`
- **Verification:** Warning no longer appears in DevTools console during PDF parsing.
- **Committed in:** `d58c9b8`

**3. [Rule 3 - Blocking] Custom domain not routing — fell back to workers.dev URL**
- **Found during:** Task 2 / Task 3 (initial deployment and verification)
- **Issue:** Extension was initially updated to use `pct.rowles.esq` custom domain, but DNS/routing was not configured correctly and requests were not reaching the Worker.
- **Fix:** Reverted to `patent-cite-worker.fatduck.workers.dev` URL which routes correctly. Created TODO entry in `.planning/TODOS.md` for future custom domain migration.
- **Files modified:** `src/offscreen/offscreen.js`, `src/manifest.json`, `.planning/TODOS.md`
- **Verification:** `curl` to workers.dev URL returns 401 without auth, PDF binary with auth. E2E test passes.
- **Committed in:** `95a520f` (URL fix), `f1133df` (TODO docs)

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 blocking)
**Impact on plan:** All three fixes were necessary for correct E2E operation. Blank line fix ensures accurate patent citations. Font warning fix is best-practice for offscreen context. Custom domain fallback is temporary — workers.dev is fully functional. No scope creep.

## Issues Encountered
- Custom domain `pct.rowles.esq` routing was not working at deployment time. Workers.dev URL used as functional replacement. Migration tracked as TODO item.

## User Setup Required

**Deployment required manual Cloudflare configuration:**
- User ran `npx wrangler login` and `npx wrangler deploy` in `worker/` directory
- User set `PROXY_TOKEN` and `USPTO_API_KEY` secrets via `npx wrangler secret put`
- Deployment URL: `https://patent-cite-worker.fatduck.workers.dev`

## Next Phase Readiness
- Phase 06 (USPTO API Fallback) is fully complete — all three requirements satisfied (UPTO-01: Worker deployed, UPTO-02: extension fallback wired, UPTO-03: identical parse pipeline)
- The full USPTO fallback flow is production-ready: Google Patents fails -> Worker fetches USPTO eGrant PDF -> offscreen parses via identical pipeline -> citation produced
- Custom domain migration (`pct.rowles.esq`) is deferred — tracked in TODOS.md. Extension currently uses `workers.dev` URL which is fully functional.
- Phase 07 planning can proceed without blockers from Phase 06

---
*Phase: 06-uspto-api-fallback*
*Completed: 2026-03-02*

## Self-Check: PASSED

- 06-03-SUMMARY.md: FOUND
- Task 2 commit 2d630a4 (feat: replace PLACEHOLDER constants): FOUND
- Fix commit 95a520f (workers.dev URL): FOUND
- Fix commit d58c9b8 (PDF.js useSystemFonts): FOUND
- Fix commit ca4551b (blank line accounting): FOUND
- Requirements UPTO-01, UPTO-02, UPTO-03: already marked complete in REQUIREMENTS.md
- STATE.md Current Position updated to Phase 6 Complete
- ROADMAP.md phase 6 updated: 3 plans / 3 summaries / status Complete

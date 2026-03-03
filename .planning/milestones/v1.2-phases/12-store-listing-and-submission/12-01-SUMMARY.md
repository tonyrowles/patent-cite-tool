---
phase: 12-store-listing-and-submission
plan: 01
subsystem: infra
tags: [privacy-policy, github-pages, chrome-extension, packaging]

# Dependency graph
requires:
  - phase: 11-options-page-polish
    provides: options.html with placeholder privacyLink href="#" that this plan replaces
provides:
  - docs/privacy/index.html hosted at tonyrowles.github.io/patent-cite-tool/privacy
  - src/options/options.html with live privacy policy URL
  - store-assets/patent-cite-tool-v0.1.0.zip extension package (pending Task 2)
affects: [chrome-web-store-submission, phase-13-if-any]

# Tech tracking
tech-stack:
  added: []
  patterns: [static HTML privacy page with inline CSS matching extension design language, GitHub Pages docs/ folder deployment]

key-files:
  created: [docs/privacy/index.html, store-assets/patent-cite-tool-v0.1.0.zip]
  modified: [src/options/options.html]

key-decisions:
  - "12-01: Privacy policy hosted via GitHub Pages docs/ folder on main branch — no separate service needed"
  - "12-01: Privacy policy HTML uses inline CSS matching extension color palette (#1e3a8a, #0f172a, #334155) for brand consistency"
  - "12-01: Extension ZIP built with 'cd src && zip -r ../store-assets/name.zip .' — manifest.json at ZIP root (Chrome Web Store hard requirement)"

patterns-established:
  - "GitHub Pages privacy policy: self-contained HTML with inline CSS at docs/privacy/index.html, deployed from main branch /docs folder"
  - "Store packaging: cd src && zip -r ../store-assets/name.zip . — manifest.json at root, no nested subdirectory"

requirements-completed: [STOR-01]

# Metrics
duration: ~15min (2 sessions with human-action checkpoint)
completed: 2026-03-03
---

# Phase 12 Plan 01: Store Listing and Submission Summary

**Privacy policy published at GitHub Pages and extension packaged as 464KB ZIP with manifest.json at root for Chrome Web Store upload**

## Performance

- **Duration:** ~15 min (2 sessions with human-action checkpoint)
- **Started:** 2026-03-03T22:28:49Z
- **Completed:** 2026-03-03
- **Tasks:** 2 of 2 complete
- **Files modified:** 3 (created 2, modified 1)

## Accomplishments
- Created docs/privacy/index.html: complete privacy policy with all required disclosures (Google CDN, Cloudflare KV pct.tonyrowles.com as first-party infra, chrome.storage.sync preferences, permissions table, no-collection statement)
- Updated src/options/options.html: privacyLink href changed from placeholder "#" to https://tonyrowles.github.io/patent-cite-tool/privacy; TODO comment removed
- Enabled GitHub Pages (user action): privacy policy live at https://tonyrowles.github.io/patent-cite-tool/privacy
- Built store-assets/patent-cite-tool-v0.1.0.zip (464KB): all extension files from src/ with manifest.json at ZIP root

## Task Commits

Each task was committed atomically:

1. **Task 1: Create privacy policy page and update options.html link** - `76647c5` (feat)
2. **Task 2: Build extension ZIP for Chrome Web Store upload** - `3e30844` (feat)

## Files Created/Modified
- `docs/privacy/index.html` - Privacy policy for GitHub Pages hosting; covers Google CDN, Cloudflare KV, chrome.storage.sync, permissions, no-data-collection statement
- `src/options/options.html` - Footer privacyLink href updated to live GitHub Pages URL; TODO comment removed
- `store-assets/patent-cite-tool-v0.1.0.zip` - Extension package (464KB) ready for Chrome Web Store upload; manifest.json at ZIP root

## Decisions Made
- Privacy policy hosted via GitHub Pages docs/ folder — zero-configuration, free, tied to main branch, no separate service needed
- Inline CSS in single HTML file — self-contained, no external dependency, loads reliably
- Extension ZIP built with `cd src && zip -r ../store-assets/name.zip .` — manifest.json lands at ZIP root (Chrome Web Store requires manifest.json at root, not nested in a subdirectory)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

GitHub Pages was enabled by the user during the human-action checkpoint:
1. Pushed commits to GitHub
2. Went to https://github.com/tonyrowles/patent-cite-tool/settings/pages
3. Source: "Deploy from a branch", Branch: `main`, Folder: `/docs`
4. Privacy policy confirmed live at https://tonyrowles.github.io/patent-cite-tool/privacy (user confirmed "url live")

## Next Phase Readiness
- STOR-01 fully satisfied: privacy policy hosted at stable public URL, confirmed live
- Extension ZIP ready for Chrome Web Store developer dashboard upload
- Next step (Phase 12-02 if it exists): Chrome Web Store store listing details, screenshots, upload ZIP

---
*Phase: 12-store-listing-and-submission*
*Completed: 2026-03-03*

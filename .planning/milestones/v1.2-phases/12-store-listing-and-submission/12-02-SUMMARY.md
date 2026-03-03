---
phase: 12-store-listing-and-submission
plan: 02
subsystem: infra
tags: [chrome-web-store, store-listing, permissions, privacy-policy, submission]

# Dependency graph
requires:
  - phase: 12-store-listing-and-submission (plan 01)
    provides: extension ZIP at store-assets/patent-cite-tool-v0.1.0.zip and privacy policy live at GitHub Pages
provides:
  - store-assets/store-listing.md: complete copy-pasteable reference for all Chrome Developer Dashboard fields
  - (pending user action) store-assets/screenshot-1280x800.png
  - (pending user action) store-assets/promo-tile-440x280.png
  - (pending user action) extension submitted to Chrome Web Store as "Pending review"
affects: [chrome-web-store-review]

# Tech tracking
tech-stack:
  added: []
  patterns: [structured store listing reference document with character-counted fields and copy-pasteable permission justifications]

key-files:
  created: [store-assets/store-listing.md]
  modified: []

key-decisions:
  - "12-02: Title is 'Patent Citation Tool for Google Patents' (39/45 chars) — includes 'Google Patents' for search discoverability"
  - "12-02: Description omits accuracy percentages per CONTEXT.md guidance — uses 'designed for high accuracy' qualified language approach instead"
  - "12-02: Category is Productivity — primary fit for patent prosecution workflow tools"
  - "12-02: Data use section declares no data collected — chrome.storage.sync preferences are user-controlled settings, not developer-accessible data"

patterns-established:
  - "Store listing reference doc: structured markdown with character counts, copy-paste-ready sections for each Dashboard field, submission checklist"

requirements-completed: [STOR-04, STOR-05]

# Metrics
duration: ~5min (Task 1 auto — Task 2 pending human-action checkpoint)
completed: 2026-03-03
---

# Phase 12 Plan 02: Store Listing and Submission Summary

**Chrome Web Store listing text, 8 permission justifications, and Developer Dashboard privacy section written as copy-pasteable reference in store-assets/store-listing.md (127-char summary, 192-word description)**

## Performance

- **Duration:** ~5 min (Task 1 complete; Task 2 paused at human-action checkpoint)
- **Started:** 2026-03-03T22:47:15Z
- **Completed:** 2026-03-03 (Task 1); Task 2 pending user action
- **Tasks:** 1 of 2 complete (Task 2 is human-action checkpoint)
- **Files modified:** 1

## Accomplishments

- Created store-assets/store-listing.md: 173 lines, complete reference for all Chrome Developer Dashboard fields
- Title: "Patent Citation Tool for Google Patents" (39/45 chars, includes "Google Patents" for search discoverability)
- Summary: 127/132 chars with core value proposition
- Description: 192 words, plain text, no keyword stuffing, no unverifiable accuracy percentages
- All 6 permissions and 2 host permissions have individual, ready-to-paste justifications
- Single purpose description matches CONTEXT.md decision exactly
- Remote code declaration: "No" with explanation of JSON+PDF-only remote calls
- Data use section: no data types collected, all 3 certification statements specified as checked
- Submission checklist covering all required Dashboard fields in order

## Task Commits

Each task was committed atomically:

1. **Task 1: Write store listing text, permission justifications, and dashboard guidance** - `08978fc` (feat)
2. **Task 2: Capture screenshot, create promotional tile, and submit to Chrome Web Store** - pending human-action checkpoint

## Files Created/Modified

- `store-assets/store-listing.md` - Complete Chrome Developer Dashboard reference: title (39 chars), summary (127 chars), description (192 words), 8 permission justifications, privacy tab content (single purpose, remote code, data use), and submission checklist

## Decisions Made

- Title includes "Google Patents" (39/45 chars) — explicit brand association improves search discoverability in Chrome Web Store
- Description does not include accuracy percentages — CONTEXT.md specified no unverifiable accuracy claims; description uses "designed for high accuracy" qualified framing
- Category: Productivity — best fit for patent prosecution workflow tools; no "Legal" or "Professional" category exists
- Data use checkboxes: all unchecked — chrome.storage.sync stores three preference settings (trigger mode, display mode, patent number prefix) that are user-controlled and not accessible to the developer

## Deviations from Plan

None - Task 1 executed exactly as specified. Task 2 is a human-action checkpoint (not deviations).

## Issues Encountered

None.

## User Setup Required

Task 2 requires manual human actions at the Chrome Developer Dashboard:

1. **Capture screenshot (STOR-02):** Chrome DevTools → Device Toolbar 1280x800 → Navigate to US patent → Trigger citation overlay → DevTools "Capture screenshot" → save as `store-assets/screenshot-1280x800.png`
2. **Create promotional tile (STOR-03):** Create a 440x280 PNG (Canva/Figma or any image editor) → save as `store-assets/promo-tile-440x280.png`
3. **Submit to Chrome Web Store (STOR-04, STOR-05):** Go to https://chrome.google.com/webstore/devconsole → "Add new item" → upload ZIP → fill all fields from store-listing.md → complete Privacy tab → Submit for review

Full step-by-step instructions are in `store-assets/store-listing.md` Sections 2-4.

Resume signal: Type "submitted" after extension shows as "Pending review" in the Developer Dashboard.

## Next Phase Readiness

- STOR-04 (store listing text) and STOR-05 (privacy section content) are written and ready to copy-paste
- STOR-02 (screenshot) and STOR-03 (promotional tile) require user creation before Dashboard upload
- After user completes Task 2: all STOR requirements satisfied, v1.2 milestone complete

## Self-Check: PASSED

- FOUND: store-assets/store-listing.md (173 lines)
- FOUND: .planning/phases/12-store-listing-and-submission/12-02-SUMMARY.md
- FOUND: commit 08978fc (feat(12-02): write Chrome Web Store listing text...)
- FOUND: commit 9877033 (docs(12-02): complete store listing text plan...)

---
*Phase: 12-store-listing-and-submission*
*Completed: 2026-03-03 (Task 1); Task 2 pending*

---
phase: 10-icon-set-and-manifest-updates
plan: 01
subsystem: ui
tags: [sharp, svg, icons, manifest, chrome-extension, png-generation]

# Dependency graph
requires:
  - phase: 09-accuracy-audit
    provides: No direct dependency; phases run in parallel after phase 08

provides:
  - src/icons/icon-source.svg: Patent-themed source SVG with CSS class color injection
  - scripts/generate-icons.mjs: Reproducible icon generation script using sharp
  - 12 PNG files: icon-{active,inactive,partial}-{16,32,48,128}.png
  - Updated manifest.json with 32px entries in action.default_icon and icons sections

affects:
  - 10-02-icon-state-system: partial-state PNGs produced here; 10-02 uses them via chrome.action.setIcon()
  - 11-options-page: icon visual language (blue primary, amber accent) informs options page styling

# Tech tracking
tech-stack:
  added: [sharp ^0.34.5]
  patterns:
    - CSS class injection: SVG uses named classes (.icon-primary, .icon-accent, .icon-detail) with string replacement for multi-state icon generation
    - Single-source generation: All PNGs derived from one 256x256 SVG, sizes via sharp .resize()

key-files:
  created:
    - src/icons/icon-source.svg
    - scripts/generate-icons.mjs
    - src/icons/icon-active-32.png
    - src/icons/icon-inactive-32.png
    - src/icons/icon-partial-16.png
    - src/icons/icon-partial-32.png
    - src/icons/icon-partial-48.png
    - src/icons/icon-partial-128.png
  modified:
    - package.json (sharp devDep + generate-icons script)
    - src/manifest.json (added 32px entries)
    - src/icons/icon-active-16.png (replaced placeholder)
    - src/icons/icon-active-48.png (replaced placeholder)
    - src/icons/icon-active-128.png (replaced placeholder)
    - src/icons/icon-inactive-16.png (replaced placeholder)
    - src/icons/icon-inactive-48.png (replaced placeholder)
    - src/icons/icon-inactive-128.png (replaced placeholder)

key-decisions:
  - "Use CSS string replacement for color injection (not sharp's svg.stylesheet) to avoid librsvg version dependency"
  - "256x256 viewBox ensures sharp produces crisp downscaled PNGs at all sizes (16, 32, 48, 128)"
  - "Partial state icons generated but not in manifest — referenced only at runtime via chrome.action.setIcon() (Plan 10-02)"
  - "Three-color CSS class system (.icon-primary, .icon-accent, .icon-detail) enables single SVG source for all states"

patterns-established:
  - "Icon CSS class pattern: .icon-primary (page body), .icon-accent (citation highlight), .icon-detail (text lines)"
  - "Active state colors: primary #2563eb (blue), accent #f59e0b (amber), detail #1e3a8a (dark navy)"
  - "Inactive state: all gray (#9ca3af / #d1d5db / #e5e7eb)"
  - "Partial state: washed-out blue (#93c5fd), pale amber (#fcd34d), light blue (#bfdbfe)"

requirements-completed: [ICON-01, ICON-03]

# Metrics
duration: 2min
completed: 2026-03-03
---

# Phase 10 Plan 01: Icon Set and Generation Script Summary

**Patent-themed source SVG (256x256) with CSS class color injection, sharp generation script producing 12 PNGs across 3 states x 4 sizes, and manifest.json updated with missing 32px entries**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-03T20:26:40Z
- **Completed:** 2026-03-03T20:28:40Z
- **Tasks:** 2
- **Files modified:** 16

## Accomplishments

- Designed professional patent-themed SVG icon: document page with column divider, text lines, and amber citation highlight bracket — reads as "reference tool" at 16px
- Created reproducible icon generation script (scripts/generate-icons.mjs) using sharp; CSS string replacement injects per-state colors without librsvg version dependencies
- Generated all 12 production PNGs replacing 6 placeholder solid-color squares; added 6 new files (partial state x4 + 32px active/inactive)
- Updated manifest.json with 32px entries in both action.default_icon and icons sections for sharp rendering on Windows/HiDPI

## Task Commits

Each task was committed atomically:

1. **Task 1: Design source SVG and create icon generation script** - `9971020` (feat)
2. **Task 2: Update manifest.json with 32px icon entries** - `89ddf35` (feat)

## Files Created/Modified

- `src/icons/icon-source.svg` - Patent page motif SVG (256x256 viewBox) with .icon-primary, .icon-accent, .icon-detail CSS classes
- `scripts/generate-icons.mjs` - ESM script: reads SVG, injects color schemes per state, outputs 12 PNGs via sharp
- `package.json` - Added sharp ^0.34.5 devDependency and "generate-icons" npm script
- `src/manifest.json` - Added "32" entry to action.default_icon (inactive-32) and icons section (active-32)
- `src/icons/icon-active-{16,32,48,128}.png` - Active state icons (vibrant blue, amber accent)
- `src/icons/icon-inactive-{16,32,48,128}.png` - Inactive state icons (all gray)
- `src/icons/icon-partial-{16,32,48,128}.png` - Partial state icons (washed-out blue/pale amber)

## Decisions Made

- Used CSS string replacement for color injection (not sharp's `svg.stylesheet` option) to avoid librsvg version dependency (research: Open Question 1)
- Partial state icons NOT referenced in manifest.json — they are runtime-only, set via `chrome.action.setIcon()` in Plan 10-02
- 256x256 viewBox for clean downscaling at all four required sizes
- Three named CSS classes allow single source SVG to produce all three visually distinct states

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 10-02 (icon state system) can now proceed: partial-state PNGs exist at all 4 sizes and are ready for chrome.action.setIcon() use
- Icon visual language established: blue primary (#2563eb), amber accent (#f59e0b) — available for Phase 11 options page styling reference
- Icon generation is fully reproducible: `npm run generate-icons` regenerates all 12 PNGs from the source SVG

---
*Phase: 10-icon-set-and-manifest-updates*
*Completed: 2026-03-03*

## Self-Check: PASSED

All created files confirmed present. All task commits verified in git history.

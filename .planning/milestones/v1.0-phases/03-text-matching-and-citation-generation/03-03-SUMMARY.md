---
phase: 03-text-matching-and-citation-generation
plan: 03
subsystem: ui-interaction
tags: [shadow-dom, selection-detection, trigger-modes, settings, context-menu, disambiguation]

# Dependency graph
requires:
  - phase: 03-text-matching-and-citation-generation/03-01
    provides: LOOKUP_POSITION/CITATION_RESULT message flow, text matching engine
  - phase: 03-text-matching-and-citation-generation/03-02
    provides: findParagraphCitation for published applications
provides:
  - Shadow DOM floating button, citation popup, confidence indicator, error popup, loading indicator
  - Selection detection with debounce, three trigger modes (floating-button, auto, context-menu)
  - Settings system (chrome.storage.sync) for trigger mode and display mode
  - Context-aware disambiguation for multi-occurrence text matches
  - Complete interactive citation workflow from highlight to popup
affects: [04-citation-output]

# Tech tracking
tech-stack:
  added: []
  patterns: [shadow-dom-ui-isolation, word-overlap-disambiguation, context-extraction-via-range-api]

key-files:
  created:
    - src/content/citation-ui.js
  modified:
    - src/content/content-script.js
    - src/background/service-worker.js
    - src/shared/constants.js
    - src/popup/popup.html
    - src/popup/popup.js
    - src/manifest.json
    - src/offscreen/offscreen.js
    - src/offscreen/position-map-builder.js

key-decisions:
  - "Shadow DOM (closed mode) for CSS isolation from Google Patents Polymer components"
  - "Context-aware disambiguation: content script extracts 100 chars before/after selection via Range API; offscreen scores occurrences by word overlap"
  - "Word-overlap scoring (not character-level) for disambiguation -- robust to HTML/PDF whitespace and punctuation divergence"
  - "Printed column numbers from PDF headers are authoritative (not sequential counting)"
  - "Column boundary: pick gap closest to page center (not widest gap)"
  - "Gutter line markers filtered by proximity to page center (±40pt)"
  - "Whitespace-stripped matching as primary fallback (confidence 0.99/0.98/0.97)"
  - "Bookend matching for long selections (confidence 0.92): first/last 50 chars with span proportionality validation"
  - "Fuzzy matching capped at 100 chars to prevent hanging"

patterns-established:
  - "DOM context extraction via Range API for disambiguation of duplicate text in patents"
  - "Word-level scoring tolerates HTML/PDF text divergence at boundaries"

requirements-completed: [MATCH-02, CITE-01, PAPP-01]

# Metrics
duration: ~3 sessions across 2026-03-01
completed: 2026-03-01
---

# Phase 3 Plan 3: User Interaction Layer and Citation Display Summary

**Shadow DOM UI with selection detection, three trigger modes, settings system, and multi-occurrence disambiguation -- completing the interactive citation workflow**

## Performance

- **Duration:** Multiple sessions (debugging-heavy)
- **Started:** 2026-03-01
- **Completed:** 2026-03-01
- **Tasks:** 3 (2 auto + 1 human-verify checkpoint)
- **Files modified:** 9

## Accomplishments

- citation-ui.js: Shadow DOM floating button, citation popup with copy button, confidence indicator (green/yellow/red), error popup, loading indicator
- content-script.js: Selection detection with 200ms debounce, three trigger modes (floating-button, auto, context-menu), citation orchestration routing by patent type
- Settings system via chrome.storage.sync with popup UI for trigger mode and display mode
- Context menu "Get Citation" on text selection for patent pages
- Context-aware disambiguation for multi-occurrence text using word-overlap scoring
- Matching improvements: whitespace-stripped matching, punctuation-agnostic fallback, bookend matching for long selections, gutter line number filtering, column boundary detection fix

## Key Debugging Work

Significant debugging effort went into matching accuracy:
- Fixed gutter filter to use page center proximity (±40pt) instead of column boundary tolerance
- Fixed column boundary detection to pick gap closest to page center (not widest gap)
- Implemented context-aware disambiguation (initial character-level scoring always returned 0; fixed with word-overlap scoring)
- Added whitespace-stripped, punctuation-agnostic, and bookend matching fallbacks
- Capped fuzzy Levenshtein at 100 chars to prevent UI hang

## Task Commits

Tasks 1-2 were committed atomically. Task 3 (checkpoint) involved iterative debugging across multiple commits:

1. **Task 1: citation-ui.js Shadow DOM components** - committed during initial execution
2. **Task 2: content-script.js expansion, settings, context menu** - committed during initial execution
3. **Task 3: Human verification checkpoint** - debugging commits:
   - Fuzzy matching hang fix, column numbering, whitespace matching
   - Gutter line number filter, bookend matching, column inference
   - Gutter filter fix (`7e3cc04`), column boundary fix (`66848d2`)
   - Context disambiguation (`05540ab`), word-overlap scoring fix (`d991496`)
   - Diagnostic cleanup (`7913a6d`)

## Files Created/Modified

- `src/content/citation-ui.js` - Shadow DOM UI components (floating button, popup, error, loading)
- `src/content/content-script.js` - Selection detection, trigger modes, citation orchestration, context extraction
- `src/background/service-worker.js` - Context menu registration, GENERATE_CITATION relay
- `src/shared/constants.js` - Added GENERATE_CITATION message type
- `src/popup/popup.html` - Settings UI for trigger mode and display mode
- `src/popup/popup.js` - Settings read/write logic
- `src/manifest.json` - contextMenus permission, updated content_scripts order
- `src/offscreen/offscreen.js` - Disambiguation, matching improvements, diagnostic cleanup
- `src/offscreen/position-map-builder.js` - Gutter filter, boundary detection, diagnostic cleanup

## Decisions Made

- Shadow DOM with closed mode prevents CSS leakage from Google Patents' Polymer components
- Word-overlap scoring for disambiguation is robust to HTML/PDF text divergence that breaks character-level comparison
- Column boundary found by gap closest to page center (gutter is always near center; previous widest-gap approach found gaps within columns)
- Bookend matching validates span proportionality to prevent false matches from distant prefix/suffix occurrences

## Deviations from Plan

- Extensive debugging required for matching accuracy (not anticipated in plan)
- Context disambiguation added as new feature during debugging (multi-occurrence text was misidentified)
- Multiple matching fallback strategies added beyond the original exact+fuzzy plan

## Issues Encountered

- Gutter line numbers leaked into positionMap (fixed with center-proximity filter)
- Column boundary detection found wrong gaps (fixed with center-proximity selection)
- Character-level context scoring always returned 0 (fixed with word-overlap scoring)
- Long selection fuzzy matching caused UI hang (fixed with 100-char cap)

## Known Limitations

- Long selections (>500 chars) may fail when HTML and PDF text genuinely diverge
- Bookend matching handles some long-selection cases but not all

## Next Phase Readiness

- Phase 4 (Citation Output) can build on the complete citation workflow
- Copy-to-clipboard already works in the popup; Phase 4 adds auto-clipboard with toast notification

## Self-Check: PASSED

- All 9 files verified modified
- Key commits verified in git log
- Diagnostic logging cleaned up

---
*Phase: 03-text-matching-and-citation-generation*
*Completed: 2026-03-01*

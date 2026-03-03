---
phase: 03-text-matching-and-citation-generation
plan: 01
subsystem: matching
tags: [levenshtein, text-normalization, citation-format, positionmap, message-passing]

# Dependency graph
requires:
  - phase: 02-pdf-parsing-pipeline
    provides: PositionMap stored in IndexedDB with column/line/text/hasWrapHyphen entries
provides:
  - Text normalization for HTML-to-PDF divergences (smart quotes, dashes, ligatures)
  - Exact-then-fuzzy matching against concatenated PositionMap text
  - Citation formatting in col:line notation (single, same-column range, cross-column range)
  - LOOKUP_POSITION/CITATION_RESULT message flow (content script -> service worker -> offscreen -> response)
affects: [03-02, 03-03, ui, popup]

# Tech tracking
tech-stack:
  added: []
  patterns: [levenshtein-sliding-window, fire-and-forget-message-relay, duplicated-matching-functions]

key-files:
  created:
    - src/content/text-matcher.js
  modified:
    - src/shared/constants.js
    - src/background/service-worker.js
    - src/offscreen/offscreen.js
    - src/manifest.json

key-decisions:
  - "Matching functions duplicated in text-matcher.js (content script) and offscreen.js -- offscreen ES module cannot share classic script globals"
  - "Service worker acts as relay between content script and offscreen for citation lookup -- content script cannot message offscreen directly"
  - "LOOKUP_POSITION and CITATION_RESULT are fire-and-forget (do not return true) -- response routed via tabId"

patterns-established:
  - "TabId routing: service worker captures sender.tab.id and attaches to forwarded message for response routing"
  - "Offscreen matching functions suffixed with Offscreen to avoid name collisions in future"

requirements-completed: [MATCH-01, CITE-01, CITE-02, CITE-03, CITE-04]

# Metrics
duration: 3min
completed: 2026-03-01
---

# Phase 3 Plan 1: Text Matching and Citation Formatting Summary

**Text normalization with exact-then-fuzzy PositionMap matching and col:line citation formatting, wired through service worker relay to offscreen document**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-01T08:05:27Z
- **Completed:** 2026-03-01T08:08:05Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Text normalization handles smart quotes, dashes, ligatures, and whitespace collapse for HTML-to-PDF divergence matching
- PositionMap concatenation with wrap-hyphen joining, exact match (confidence 1.0) with Levenshtein fuzzy fallback (20% edit distance threshold)
- Citation formatting produces col:line (single), col:start-end (same-column), startCol:startLine-endCol:endLine (cross-column)
- Full message pipeline wired: content script -> service worker -> offscreen (IndexedDB lookup + matching) -> citation result -> tab

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement text-matcher.js with normalization, matching, and citation formatting** - `d083a3e` (feat)
2. **Task 2: Wire citation lookup message flow through service worker and offscreen document** - `8085390` (feat)

## Files Created/Modified
- `src/content/text-matcher.js` - Classic script with normalizeText, matchAndCite, formatCitation, fuzzySubstringMatch, levenshtein as globals
- `src/shared/constants.js` - Added LOOKUP_POSITION and CITATION_RESULT message types
- `src/background/service-worker.js` - Added handleLookupPosition (relay to offscreen) and handleCitationResult (relay to tab)
- `src/offscreen/offscreen.js` - Added lookupPosition with IndexedDB retrieval and duplicated matching functions
- `src/manifest.json` - Added text-matcher.js to content_scripts array before content-script.js

## Decisions Made
- Matching functions are duplicated between text-matcher.js and offscreen.js because offscreen (ES module) cannot share classic script globals with content scripts. The logic is stable and well-defined, making duplication acceptable.
- Service worker acts as a message relay -- content scripts cannot message offscreen directly, and offscreen cannot target specific tabs. TabId routing bridges both.
- LOOKUP_POSITION and CITATION_RESULT handlers do not return true (fire-and-forget), consistent with existing message patterns for non-sendResponse flows.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Text matching engine and citation formatting ready for Plan 03-02 (published application matching using DOM-based paragraph finding)
- Plan 03-03 can build UI integration on top of CITATION_RESULT message flow
- text-matcher.js globals (normalizeText, formatCitation) available to content-script.js for application citation logic

## Self-Check: PASSED

- All 5 files verified present on disk
- Commit d083a3e (task 1) verified in git log
- Commit 8085390 (task 2) verified in git log

---
*Phase: 03-text-matching-and-citation-generation*
*Completed: 2026-03-01*

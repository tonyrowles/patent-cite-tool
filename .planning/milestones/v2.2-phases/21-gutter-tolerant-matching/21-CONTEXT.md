# Phase 21: Gutter-Tolerant Matching - Context

**Gathered:** 2026-03-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Add `gutterTolerantMatch` as a Tier 5 last-resort fallback in the matching cascade. It strips stray gutter line numbers (multiples of 5, range 5-65) that slipped past the upstream spatial filter and landed in the concat text, then replays the full matching cascade on the stripped concat. Covers requirement MATCH-01.

</domain>

<decisions>
## Implementation Decisions

### Post-strip re-matching strategy
- Full cascade replay (Tiers 1-4) on the stripped concat — exact → whitespace-stripped → bookend → fuzzy
- Reuse existing tier functions (whitespaceStrippedMatch, bookendMatch, etc.) — DRY, future tier improvements automatically benefit Tier 5
- Build offset map to track shifted character positions so resolveMatch can map back to original positionMap entries
- No-op guard: if stripping changed nothing, return null immediately — Tiers 1-4 already failed on identical text

### Strip scope and pattern
- Strip gutter numbers from concat only — HTML selections don't contain gutter artifacts
- Space-or-string-boundary anchored pattern: numbers at concat start/end also caught (not just space-both-sides)
- Collapse double-spaces to single after stripping for cleaner matching
- Fresh stripped concat from a copy — don't modify the shared buildConcat output

### Confidence and penalty behavior
- Flat 0.85 confidence cap for all Tier 5 matches — regardless of which inner tier succeeds
- No OCR penalty stacking — Tier 5 always reports 0.85 even when OCR normalization also fired (gutter-strip confidence already signals uncertainty)
- Use OCR-normalized selection when replaying cascade inside gutterTolerantMatch — consistent with what Tiers 1-4 already tried

### Integration with matchAndCite
- gutterTolerantMatch receives the already-built concat + boundaries from matchAndCite — avoids redundant buildConcat call
- Placed after fuzzy match (Tier 4), before the final null return

### Claude's Discretion
- Exact regex pattern implementation for gutter number stripping
- Offset map data structure for boundary remapping
- Test structure and naming for new gutterTolerantMatch tests
- Whether to log/track how many gutter numbers were stripped (diagnostic info)

</decisions>

<specifics>
## Specific Ideas

- Space-anchored strip pattern from STATE.md: `/ (5|10|...|65) /g` extended with string boundary anchors `(^| )` and `( |$)` per user decision
- STATE.md pending todo resolved: "Verify gutter strip anchor handles concat edge cases (numbers at string start/end)" — yes, use string boundary anchors

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `buildConcat()` (matching.js:62-103): Returns `{concat, boundaries, changedRanges}` — gutterTolerantMatch receives concat+boundaries from matchAndCite
- `whitespaceStrippedMatch()` (matching.js:185-279): Reused in cascade replay after gutter stripping
- `bookendMatch()` (matching.js:292-357): Reused in cascade replay
- `fuzzySubstringMatch()` (matching.js:403-433): Reused in cascade replay
- `resolveMatch()` (matching.js:362-377): Maps character positions back to positionMap entries — needs remapped boundaries for stripped concat
- `findAllOccurrences()` (matching.js:109-117): Used for exact match tier in cascade replay

### Established Patterns
- Normalization functions are pure, exported, and testable (normalizeText, normalizeOcr)
- Matching cascade: exact → whitespace-stripped → bookend → fuzzy — gutterTolerantMatch replays this same cascade
- OCR penalty pattern via `applyPenaltyIfNeeded()` closure — Tier 5 uses flat cap instead
- `selChanged` boolean for penalty condition — established in Phase 20

### Integration Points
- `matchAndCite` calls `gutterTolerantMatch` after fuzzy match (line ~541) and before final `return null`
- Receives `ocrNormalized` (selection), `concat`, `boundaries`, `positionMap`, `contextBefore`, `contextAfter`
- Returns same shape as other tiers: `{citation, startEntry, endEntry, confidence}` or null

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 21-gutter-tolerant-matching*
*Context gathered: 2026-03-05*

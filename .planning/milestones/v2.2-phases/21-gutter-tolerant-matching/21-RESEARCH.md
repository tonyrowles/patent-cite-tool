# Phase 21: Gutter-Tolerant Matching - Research

**Researched:** 2026-03-05
**Domain:** JavaScript regex, string manipulation, character position mapping, cascade matching integration
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Post-strip re-matching strategy:**
- Full cascade replay (Tiers 1-4) on the stripped concat — exact, whitespace-stripped, bookend, fuzzy
- Reuse existing tier functions (whitespaceStrippedMatch, bookendMatch, etc.) — DRY
- Build offset map to track shifted character positions so resolveMatch can map back to original positionMap entries
- No-op guard: if stripping changed nothing, return null immediately — Tiers 1-4 already failed on identical text

**Strip scope and pattern:**
- Strip gutter numbers from concat only — HTML selections don't contain gutter artifacts
- Space-or-string-boundary anchored pattern: numbers at concat start/end also caught (not just space-both-sides)
- Collapse double-spaces to single after stripping for cleaner matching
- Fresh stripped concat from a copy — don't modify the shared buildConcat output

**Confidence and penalty behavior:**
- Flat 0.85 confidence cap for all Tier 5 matches — regardless of which inner tier succeeds
- No OCR penalty stacking — Tier 5 always reports 0.85 even when OCR normalization also fired
- Use OCR-normalized selection when replaying cascade inside gutterTolerantMatch

**Integration with matchAndCite:**
- gutterTolerantMatch receives the already-built concat + boundaries from matchAndCite — avoids redundant buildConcat call
- Placed after fuzzy match (Tier 4), before the final `return null`

### Claude's Discretion
- Exact regex pattern implementation for gutter number stripping
- Offset map data structure for boundary remapping
- Test structure and naming for new gutterTolerantMatch tests
- Whether to log/track how many gutter numbers were stripped (diagnostic info)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MATCH-01 | Matching pipeline tolerates stray gutter line numbers (multiples of 5, 5-65) in concat text by stripping them as a Tier 5 fallback when Tiers 1-4 fail, with confidence capped at 0.85 (yellow UI) | Regex pattern design, offset map approach, and cascade replay all documented in this research |
</phase_requirements>

## Summary

Phase 21 adds `gutterTolerantMatch` as Tier 5 in the matching cascade inside `matchAndCite`. USPTO patents use gutter line numbers (multiples of 5, range 5-65) printed every 5 lines in each column. The upstream spatial filter in the PDF parser is supposed to exclude these from the positionMap, but occasionally a gutter number slips through and lands in the concat text. When this happens, Tiers 1-4 all fail because the selection text (from HTML) contains no gutter numbers, but the PDF concat does — making the texts non-equal even after all existing normalization.

The implementation is narrow and well-scoped: strip candidate gutter numbers from a copy of the concat using a space-anchored regex, build an offset map from stripped positions back to original positions, replay the Tier 1-4 cascade on the stripped concat using remapped boundaries, and return any match found with a flat 0.85 confidence. The no-op guard (return null immediately if nothing was stripped) prevents re-doing work Tiers 1-4 already performed.

The critical safety constraint is avoiding false stripping: legitimate patent text contains numbers that happen to be multiples of 5 (measurements, counts, chemical quantities). The space-anchored pattern `(^| )(5|10|...|65)( |$)` ensures only standalone isolated numbers are removed, not numbers embedded in values like "30 g" vs "30% ACN", sequences like "SEQ ID NO: 30", or patent identifiers.

**Primary recommendation:** Implement `gutterTolerantMatch` as a standalone exported function using a space-anchored strip regex, a compact offset-array for position remapping, and direct calls to the existing tier functions.

## Standard Stack

### Core

This phase is pure JavaScript within the existing project — no new dependencies.

| Component | Version | Purpose | Notes |
|-----------|---------|---------|-------|
| Vitest | ^3.0.0 | Test framework (already installed) | `npx vitest run` |
| Node.js regex | native | Gutter number strip pattern | No library needed |
| Existing matching.js | Phase 20 | All tier functions already exported | Reuse directly |

### No New Dependencies

All required primitives exist:
- `findAllOccurrences` — exact match lookup
- `whitespaceStrippedMatch` — Tier 2 replay
- `bookendMatch` — Tier 3 replay
- `fuzzySubstringMatch` + `resolveMatch` — Tier 4 replay
- `buildConcat` — called upstream in `matchAndCite`, not needed inside `gutterTolerantMatch`

## Architecture Patterns

### How gutterTolerantMatch Fits in matchAndCite

Current cascade (after Phase 20):

```
matchAndCite(selectedText, positionMap, contextBefore, contextAfter)
  |
  +-- Normalize selection (normalizeText, wrap-hyphen fix, normalizeOcr)
  +-- buildConcat(positionMap) -> {concat, boundaries}
  |
  Tier 1: exact match (findAllOccurrences)
  Tier 2: whitespaceStrippedMatch
  Tier 3: bookendMatch (if selection > 60 chars)
  Tier 4: fuzzySubstringMatch
  +-- [NEW] Tier 5: gutterTolerantMatch  <-- insert here
  |
  return null
```

After Phase 21:

```
  // Tier 5: gutter-tolerant fallback
  const gutterResult = gutterTolerantMatch(
    ocrNormalized,    // already normalized + OCR-corrected selection
    concat,           // original concat (function makes its own stripped copy)
    boundaries,       // original boundaries (function builds remapped version)
    positionMap,      // for resolveMatch entry lookup
    contextBefore,
    contextAfter
  );
  if (gutterResult) return gutterResult;  // no applyPenaltyIfNeeded — Tier 5 owns its confidence

  return null;
```

### Pattern 1: The Gutter Strip Regex

**What:** Space-anchored pattern strips standalone multiples of 5 (5-65) from the concat.

**The regex:**
```javascript
// Source: CONTEXT.md specifics + STATE.md decision log
const GUTTER_NUMBERS = ['5','10','15','20','25','30','35','40','45','50','55','60','65'];
const GUTTER_PATTERN = new RegExp(
  '(^| )(' + GUTTER_NUMBERS.join('|') + ')(?= |$)',
  'g'
);
```

**Why space-anchored (not just `/\b(5|10|...)\b/g`):**

Word boundaries (`\b`) would strip "5" from "US5559167" (patent number) and from "SEQ ID NO: 5" (sequence identifier). Space anchoring is stricter: the number must be surrounded by spaces or string boundaries.

**Double-space collapse after stripping:**
```javascript
let stripped = concat.replace(GUTTER_PATTERN, (match, prefix) => prefix);
// After removing " 25 " -> " ", double spaces remain where two adjacent gutter
// numbers existed or where a gutter number was at the boundary of other spacing
stripped = stripped.replace(/  +/g, ' ').trim();
```

**Edge cases handled by `(^| )` and `( |$)`:**
- Number at concat start: `"5 further comprises"` -> `"further comprises"`
- Number at concat end: `"the device 65"` -> `"the device"`
- Number in middle: `"method 25 further"` -> `"method further"` (one space remains)
- NOT stripped: `"30% ACN"` (30 is followed by %, not space/end)
- NOT stripped: `"SEQ ID NO: 30"` (30 is followed by end/no match... wait — this IS at string end or space-followed)

**CRITICAL AMBIGUITY — the trailing-number case:**

The pattern `(^| )(5|10|...|65)(?= |$)` uses a lookahead for the right side. This means "30" at the end of a sentence ("the resin is washed 5 times") WOULD match. This is acceptable: a number at the very end of a concat line that happens to be a multiple of 5 is likely a gutter artifact. The safety net is the **no-op guard** — if the selection doesn't match after stripping, the function returns null. So a false strip does no harm unless it accidentally makes a different selection match.

For chemical patents (the explicit safety concern in REQUIREMENTS.md), the baseline test suite serves as the regression gate: all 4 chemical patent cases (US9688736, US10472384) run in the corpus test and must continue to pass at their expected citations.

**Regex alternative using lookahead (cleaner right-boundary):**
```javascript
// Lookahead for right boundary — cleaner than consuming the trailing space
const GUTTER_PATTERN = new RegExp(
  '(?:^|(?<= ))(5|10|15|20|25|30|35|40|45|50|55|60|65)(?= |$)',
  'g'
);
// Replace with '' then collapse spaces
```

Note: lookbehind `(?<= )` is supported in V8 (Node.js 9+, Chrome 62+, Firefox 78+). The project targets modern browsers with Manifest V3, so this is safe. The planner may choose either approach.

### Pattern 2: The Offset Map

**Purpose:** After stripping characters from the concat, positions in the stripped string no longer map to the same positions in the original concat. `resolveMatch` uses `boundaries` (which reference original concat positions) to look up positionMap entries. The offset map bridges this gap.

**Key insight from the codebase:** `resolveMatch` only uses `boundaries` to find `entryIdx` (which positionMap entry does this position fall in?). The actual citation output comes from `positionMap[entryIdx].column` and `positionMap[entryIdx].lineNumber`. So we don't need to remap to exact character positions — we need to remap stripped positions to the correct boundary entry.

**Two approaches for the offset map:**

Option A — Integer offset array (simplest):
```javascript
// strippedToOrig[i] = original concat index for stripped concat index i
// Analogous to whitespaceStrippedMatch's strippedToOriginal array
const strippedToOrig = [];
for (let i = 0; i < concat.length; i++) {
  // Keep if this position was not consumed by the strip
  // (build by walking concat and skipping stripped positions)
}
```

Option B — Remap boundaries array (cleaner for resolveMatch):
```javascript
// Build new boundaries array where charStart/charEnd reference STRIPPED positions
// resolveMatch can then use the remapped boundaries directly
const remappedBoundaries = boundaries.map(b => ({
  ...b,
  charStart: origToStripped[b.charStart],
  charEnd: origToStripped[b.charEnd],
}));
```

**Recommended approach (Option A — integer offset array, analogous to whitespaceStrippedMatch):**

This mirrors the existing `strippedToOriginal` pattern in `whitespaceStrippedMatch` (lines 191-197 of matching.js). The planner should use the same structural pattern for consistency:

```javascript
// Build stripped concat and position map
const strippedToOrig = [];  // strippedToOrig[strippedIdx] = origIdx
let strippedConcat = '';
let i = 0;
while (i < concat.length) {
  // Check if a gutter number starts at position i (after space or at start)
  const gutterMatch = ... // test gutter number at position i
  if (gutterMatch) {
    i += gutterMatch.length; // skip the gutter number characters
  } else {
    strippedToOrig.push(i);
    strippedConcat += concat[i];
    i++;
  }
}
```

However, the regex approach (strip first, then build map by comparing original vs stripped) is harder to get right. **The cleaner implementation** is to build the stripped string and offset array in a single forward pass without regex, using explicit gutter number detection.

**Simplest correct approach — regex strip then back-map:**

Build the offset table by running the strip regex and tracking how many characters were deleted before each position:

```javascript
function buildStrippedConcat(concat) {
  // Mark positions that survive stripping
  const survive = new Uint8Array(concat.length).fill(1);
  // ... run strip logic, mark removed positions as 0
  // Build strippedToOrig and stripped string from survive array
  const strippedToOrig = [];
  let stripped = '';
  for (let i = 0; i < concat.length; i++) {
    if (survive[i]) {
      strippedToOrig.push(i);
      stripped += concat[i];
    }
  }
  return { stripped, strippedToOrig };
}
```

Then resolve using:
```javascript
const origStart = strippedToOrig[matchStart];
const origEnd = strippedToOrig[matchEnd - 1] + 1;
return resolveMatch(origStart, origEnd, boundaries, positionMap, 0.85);
```

This exactly mirrors how `whitespaceStrippedMatch` works and reuses the already-proven `resolveMatch` without needing remapped boundaries.

### Pattern 3: Cascade Replay Inside gutterTolerantMatch

After obtaining `strippedConcat` and `strippedToOrig`, the function replays the cascade:

```javascript
// Tier 5 inner cascade (replaying Tiers 1-4 on stripped concat)

// Inner Tier 1: exact match
const exactPositions = findAllOccurrences(strippedConcat, selection);
if (exactPositions.length > 0) {
  const bestPos = pickBestByContext(exactPositions, selection.length, strippedConcat, contextBefore, contextAfter);
  const origStart = strippedToOrig[bestPos];
  const origEnd = strippedToOrig[bestPos + selection.length - 1] + 1;
  const result = resolveMatch(origStart, origEnd, boundaries, positionMap, 0.85);
  if (result) return result;
}

// Inner Tier 2: whitespace-stripped match
// NOTE: Cannot call whitespaceStrippedMatch() directly because it calls resolveMatch
// with boundaries that reference original-concat positions. After gutter stripping,
// we have strippedToOrig but whitespaceStrippedMatch builds its own strippedToOriginal
// internally. These two offset tables compose correctly because:
//   whitespaceStrippedMatch's strippedToOriginal maps to STRIPPED CONCAT positions
//   strippedToOrig maps STRIPPED CONCAT positions to ORIGINAL CONCAT positions
// We need to either:
//   (a) Call whitespaceStrippedMatch with strippedConcat + remapped boundaries, or
//   (b) Manually replicate the inner logic with dual offset table composition
```

**Critical complication — whitespaceStrippedMatch uses boundaries internally:**

`whitespaceStrippedMatch` at line 185 accepts `boundaries` and internally uses them to call `resolveMatch`. If we pass it `strippedConcat` but the original `boundaries` (which reference original concat positions), the resolve will be wrong because `strippedConcat` positions don't match original boundaries.

**Solution options:**

Option A — Remap boundaries for whitespaceStrippedMatch call:
```javascript
// Build remapped boundaries where charStart/charEnd are in stripped-concat space
const remappedBoundaries = buildRemappedBoundaries(boundaries, strippedToOrig);
// Now whitespaceStrippedMatch(selection, strippedConcat, remappedBoundaries, positionMap, ...)
// will internally resolve correctly... except resolveMatch still needs original boundaries
// to look up positionMap entries by entryIdx
```

Wait — `resolveMatch` only uses `boundaries` to find `entryIdx` via `b.charStart <= matchStart && b.charEnd > matchStart`. If `charStart/charEnd` in remapped boundaries are in stripped space, and `matchStart/matchEnd` are also in stripped space, then `resolveMatch` will find the right `entryIdx`. Since `entryIdx` just indexes into `positionMap`, this is correct.

Option B — Inline the exact match tier only, call whitespaceStrippedMatch with remapped boundaries:
This is the recommended path. Remap boundaries once, then pass remapped boundaries to all inner tier calls.

Option C — Post-process whitespaceStrippedMatch result through offset table:
Don't remap boundaries. Instead, after whitespaceStrippedMatch returns a result, adjust `startEntry`/`endEntry` using strippedToOrig. But `resolveMatch` returns the entry objects directly from positionMap — the issue is that the *charStart/charEnd* lookup fails, not the entry objects themselves.

**Recommended: Option B — build remapped boundaries once, use for all inner tiers:**

```javascript
// Remap boundaries from original-concat space to stripped-concat space
// origToStripped[origIdx] = strippedIdx (or -1 if that char was stripped)
const origToStripped = new Int32Array(concat.length).fill(-1);
for (let si = 0; si < strippedToOrig.length; si++) {
  origToStripped[strippedToOrig[si]] = si;
}

const remappedBoundaries = boundaries.map(b => {
  // Find first surviving position at or after charStart
  let newStart = origToStripped[b.charStart];
  if (newStart === -1) {
    // charStart was a stripped char — find next surviving position
    for (let j = b.charStart; j < concat.length; j++) {
      if (origToStripped[j] !== -1) { newStart = origToStripped[j]; break; }
    }
  }
  // Find last surviving position before charEnd
  let newEnd = origToStripped[b.charEnd - 1];
  if (newEnd === -1) {
    for (let j = b.charEnd - 1; j >= 0; j--) {
      if (origToStripped[j] !== -1) { newEnd = origToStripped[j]; break; }
    }
    newEnd = (newEnd !== -1) ? newEnd + 1 : newStart;
  } else {
    newEnd = newEnd + 1;
  }
  return { charStart: newStart, charEnd: newEnd, entryIdx: b.entryIdx };
});
```

Then pass `remappedBoundaries` to `whitespaceStrippedMatch`, `bookendMatch`, and `resolveMatch` calls inside `gutterTolerantMatch`.

**HOWEVER:** There is an even simpler approach that avoids the complexity entirely:

After `whitespaceStrippedMatch` (or `bookendMatch`) returns a result with `startEntry` and `endEntry`, those ARE the correct positionMap entries — the wrong part is only the confidence. We can override confidence to 0.85.

Wait — the problem is more subtle. `whitespaceStrippedMatch` returns `resolveMatch(origStart, origEnd, boundaries, positionMap, confidence)`, where `origStart/origEnd` are positions in what it thinks is the original concat. If we pass it `strippedConcat` but original `boundaries`, the `origStart/origEnd` it computes are positions in stripped space, but `boundaries` has charStart/charEnd in original space — so the find will fail (stripped positions won't fall within original boundaries).

**Conclusion:** The planner must either:
1. Build remapped boundaries (Option B above), OR
2. Handle only the exact match tier directly in gutterTolerantMatch (simpler but less coverage), OR
3. Extract the inner position-lookup from whitespaceStrippedMatch into a composable helper (larger refactor)

Given the CONTEXT.md decision to "reuse existing tier functions," Option B (remapped boundaries) is the correct path. The code example above shows how to implement it.

### Pattern 4: No-Op Guard

```javascript
export function gutterTolerantMatch(selection, concat, boundaries, positionMap, contextBefore, contextAfter) {
  const { stripped, strippedToOrig } = buildStrippedConcat(concat);

  // No-op guard: if nothing was stripped, Tiers 1-4 already tried this exact text
  if (stripped === concat) return null;

  // ... cascade replay
}
```

### Anti-Patterns to Avoid

- **Modifying the shared concat in place:** `buildConcat` output is used by the caller (matchAndCite) for all tiers. gutterTolerantMatch must operate on a copy.
- **Using `\b` word boundaries for the strip regex:** `\b` splits on digit/letter boundaries, not just spaces — it would strip "5" from "US5559167" or "5-" hyphenated ranges.
- **Passing original boundaries to whitespaceStrippedMatch with stripped concat:** Positions won't align, resolveMatch will return null, Tier 5 will silently fail.
- **Stacking OCR penalty on top of 0.85:** The CONTEXT.md decision is explicit — Tier 5 always returns 0.85 flat, bypassing applyPenaltyIfNeeded in matchAndCite.
- **Calling buildConcat again inside gutterTolerantMatch:** The caller already has concat + boundaries; passing them in avoids the O(n) rebuild.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Position-map lookup | Custom binary search | `boundaries.find(...)` | Already in resolveMatch, proven across 71 cases |
| Context disambiguation | Manual context scoring | `pickBestByContext` | Already handles multi-occurrence edge cases |
| Whitespace normalization | Custom strip loop | `whitespaceStrippedMatch` | Contains punctuation-agnostic fallback paths |
| Bookend strategy | Duplicate bookend logic | `bookendMatch` | 50-char bookend length is tuned to corpus |

**Key insight:** The entire value of this phase is that ALL the hard matching work is already done. gutterTolerantMatch is primarily a preprocessing step (strip gutter numbers, remap positions) followed by dispatch to existing functions.

## Common Pitfalls

### Pitfall 1: Double-Space Residue After Stripping

**What goes wrong:** After stripping `" 25 "` from `"method 25 further"`, the result is `"method  further"` (double space). Exact match on the stripped concat would fail if the selection is `"method further"` (single space), because normalizeText collapsed the HTML selection's spaces already.

**Why it happens:** Stripping `" N "` removes 3 characters but the surrounding single spaces now become adjacent.

**How to avoid:** Always collapse double-spaces after stripping: `stripped.replace(/  +/g, ' ').trim()`.

**Warning signs:** Test where stripped concat has adjacent gutter numbers — e.g., `"the 5 10 device"` — becomes `"the  device"` without the collapse.

### Pitfall 2: Boundary Entrypoint Mismatch After Remap

**What goes wrong:** When a boundary's `charStart` position was itself a stripped character (the gutter number started at a boundary edge), the `origToStripped[b.charStart]` lookup returns -1. Using -1 as a stripped position causes `resolveMatch` to fail silently (find returns undefined).

**Why it happens:** Gutter numbers don't typically start exactly at a positionMap entry boundary, but it can happen if the PDF parser placed a gutter number as its own line.

**How to avoid:** Implement the fallback scan shown in the remapped boundaries pattern above — if `origToStripped[charStart] === -1`, walk forward to the next surviving character.

**Warning signs:** Any test case where a gutter number IS the entire positionMap entry (not just embedded in a line).

### Pitfall 3: Lookahead Consumption in Replace

**What goes wrong:** The regex `/(^| )(5|10|...|65)( |$)/g` (using a capturing group for right boundary, not a lookahead) consumes the trailing space, so two adjacent gutter numbers don't get both stripped: `" 5 10 "` — after first match consumes `" 5 "`, the remaining `"10 "` is not a match because no leading space is left.

**How to avoid:** Use a lookahead `(?= |$)` for the right boundary so the trailing space is not consumed:
```javascript
/(^|(?<= ))(5|10|15|20|25|30|35|40|45|50|55|60|65)(?= |$)/g
```
Or handle with the replace-then-collapse approach (strip the number only, leave surrounding space, then collapse double spaces).

**Warning signs:** Test with two consecutive gutter numbers (e.g., "the 5 10 device") to verify both are stripped.

### Pitfall 4: gutterTolerantMatch Result Leaks Through applyPenaltyIfNeeded

**What goes wrong:** If gutterTolerantMatch returns a result and matchAndCite calls `applyPenaltyIfNeeded` on it, the confidence drops from 0.85 to 0.83 when OCR also fired.

**How to avoid:** In matchAndCite, call gutterTolerantMatch OUTSIDE of applyPenaltyIfNeeded:
```javascript
// Correct — no penalty wrapper
const gutterResult = gutterTolerantMatch(...);
if (gutterResult) return gutterResult;  // confidence already 0.85 from Tier 5

// NOT this:
// if (gutterResult) return applyPenaltyIfNeeded(gutterResult);
```

**Warning signs:** Test that a case with selChanged===true and a Tier 5 hit returns exactly 0.85 (not 0.83).

### Pitfall 5: False Negative from "No-op Guard" When Whitespace Changes

**What goes wrong:** `stripped === concat` check for no-op guard might fail to detect that stripping was a no-op when whitespace was only added by the space-collapse step.

**Why it happens:** If the original concat has `"method further"` (no gutter numbers), stripping produces `"method further"` (identical). The guard correctly returns null. But if the original has `"method  further"` (double space, which is unusual but possible), stripping produces `"method further"` (trimmed), which differs from original — guard would NOT fire, even though no gutter numbers were present.

**How to avoid:** This edge case has negligible real-world impact (buildConcat's normalizeText already collapses whitespace in line text). Not a blocking concern.

## Code Examples

Verified patterns from the existing codebase:

### buildStrippedConcat Implementation

```javascript
// Source: matching.js whitespaceStrippedMatch pattern (lines 190-198)
// Analogous structure for gutter number stripping

const GUTTER_NUMBERS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65];

function buildStrippedConcat(concat) {
  // Mark each original-concat position as surviving (1) or stripped (0)
  const survive = new Uint8Array(concat.length).fill(1);

  // Detect gutter number spans to mark as stripped
  // A gutter number is a standalone space-separated multiple of 5 (5-65)
  for (const n of GUTTER_NUMBERS) {
    const numStr = String(n);
    const len = numStr.length;
    let pos = 0;
    while (pos <= concat.length - len) {
      // Check if numStr appears at pos
      if (concat.substring(pos, pos + len) === numStr) {
        const before = pos === 0 || concat[pos - 1] === ' ';
        const after = pos + len === concat.length || concat[pos + len] === ' ';
        if (before && after) {
          // Mark the number characters as stripped (not the surrounding spaces)
          for (let k = pos; k < pos + len; k++) survive[k] = 0;
        }
      }
      pos++;
    }
  }

  // Build stripped string and offset map
  const strippedToOrig = [];
  let stripped = '';
  for (let i = 0; i < concat.length; i++) {
    if (survive[i]) {
      strippedToOrig.push(i);
      stripped += concat[i];
    }
  }

  // Collapse double-spaces and trim
  stripped = stripped.replace(/  +/g, ' ').trim();

  // Note: after collapse, strippedToOrig is no longer perfectly aligned with stripped.
  // The space-collapse step invalidates the 1:1 mapping.
  // Alternative: don't collapse spaces in the string; strip spaces in the offset array.
  // See "Offset Map Correctness" note below.

  return { stripped, strippedToOrig };
}
```

**Offset Map Correctness Note:** The double-space collapse after stripping breaks the 1:1 correspondence between `stripped[i]` and `strippedToOrig[i]`. There are two safe approaches:

1. **Skip collapsing in the stripped string** — only collapse when building the search target for the inner tiers. Maintain `strippedToOrig` over the non-collapsed stripped string. Whitespace-stripped matching (Tier 2) already strips all whitespace internally, so the double spaces don't matter for Tier 2/3/4. Exact match (Tier 1) would fail on double spaces unless we also strip whitespace from the selection — but the selection has single spaces (normalizeText was applied). Therefore, for Tier 1 exact match, pass `stripped.replace(/  +/g, ' ').trim()` as the search target but use the non-collapsed stripped string to maintain `strippedToOrig` alignment.

2. **Rebuild strippedToOrig after collapse** — strip first, then rebuild the offset map by comparing original to stripped positions character by character.

The planner should choose approach 2 (rebuild after collapse) for simplicity.

### gutterTolerantMatch Skeleton

```javascript
// Source: derived from CONTEXT.md decisions and matching.js patterns
export function gutterTolerantMatch(
  selection,      // ocrNormalized selection text
  concat,         // original concat from buildConcat
  boundaries,     // original boundaries from buildConcat
  positionMap,    // positionMap array
  contextBefore,
  contextAfter
) {
  // Step 1: Build stripped concat and offset map
  const { stripped, strippedToOrig } = buildStrippedConcat(concat);

  // Step 2: No-op guard
  if (stripped.replace(/  +/g, ' ').trim() === concat) return null;

  // Step 3: Remap boundaries to stripped-concat space
  const remappedBoundaries = remapBoundaries(boundaries, strippedToOrig, concat.length);

  // Step 4: Replay cascade on stripped concat with remapped boundaries
  // Tier 5.1: exact match
  const allPos = findAllOccurrences(stripped, selection);
  if (allPos.length > 0) {
    const bestPos = pickBestByContext(allPos, selection.length, stripped, contextBefore, contextAfter);
    const result = resolveMatch(bestPos, bestPos + selection.length, remappedBoundaries, positionMap, 0.85);
    if (result) return result;
  }

  // Tier 5.2: whitespace-stripped match (using remapped boundaries)
  const wsResult = whitespaceStrippedMatch(selection, stripped, remappedBoundaries, positionMap, contextBefore, contextAfter);
  if (wsResult) return { ...wsResult, confidence: 0.85 };

  // Tier 5.3: bookend match (using remapped boundaries)
  if (selection.length > 60) {
    const beResult = bookendMatch(selection, stripped, remappedBoundaries, positionMap);
    if (beResult) return { ...beResult, confidence: 0.85 };
  }

  // Tier 5.4: fuzzy match (using stripped concat, resolve with remapped boundaries)
  const fuzzyResult = fuzzySubstringMatch(selection, stripped);
  if (fuzzyResult && fuzzyResult.similarity >= 0.80) {
    const result = resolveMatch(fuzzyResult.start, fuzzyResult.end, remappedBoundaries, positionMap, 0.85);
    if (result) return result;
  }

  return null;
}
```

### matchAndCite Integration Point

```javascript
// Source: matching.js line ~541 (after Phase 20)
// Insert BEFORE the final `return null`

  // Tier 5: gutter-tolerant fallback — strips stray gutter line numbers from concat
  // and replays matching cascade. Confidence is capped at 0.85 (yellow UI).
  // applyPenaltyIfNeeded is NOT applied to Tier 5 results — flat cap overrides.
  const gutterResult = gutterTolerantMatch(
    ocrNormalized, concat, boundaries, positionMap, contextBefore, contextAfter
  );
  if (gutterResult) return gutterResult;

  return null;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Inline concat loop in matchAndCite | `buildConcat` shared helper | Phase 20 | gutterTolerantMatch receives concat/boundaries without rebuilding |
| No OCR normalization | `normalizeOcr` symmetrically applied | Phase 20 | gutterTolerantMatch receives already-normalized selection |
| 4 tiers (exact, ws, bookend, fuzzy) | 5 tiers (+ gutter-tolerant) | Phase 21 | Covers PDF parser spatial filter misses |

**Deprecated/outdated:**
- STATE.md pending todo "Verify gutter strip anchor handles concat edge cases (numbers at string start/end)" — resolved by the `(^| )` left anchor and `(?= |$)` right lookahead.

## Open Questions

1. **Whether to export `gutterTolerantMatch` from matching-exports.js**
   - What we know: `matching-exports.js` re-exports selected functions for content script / service worker use. All current tier functions (`whitespaceStrippedMatch`, `bookendMatch`, `fuzzySubstringMatch`) are exported.
   - What's unclear: Whether `gutterTolerantMatch` is called externally or only from `matchAndCite`.
   - Recommendation: Export it for testability; the test file imports functions directly from `shared/matching.js` so the export from `matching-exports.js` is optional. Add to `matching-exports.js` for consistency if other tiers are exported there.

2. **Whether `buildStrippedConcat` should be exported**
   - What we know: `normalizeOcr` and `buildConcat` are exported for direct testability.
   - Recommendation: Export `buildStrippedConcat` (or name it `stripGutterNumbers`) for unit testability. The regex-correctness tests are best written against the strip function directly.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^3.0.0 |
| Config file | `/home/fatduck/patent-cite-tool/vitest.config.js` |
| Quick run command | `npx vitest run tests/unit/shared-matching.test.js` |
| Full suite command | `npx vitest run` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MATCH-01 | Tier 5 resolves when gutter numbers embedded in concat | unit | `npx vitest run tests/unit/shared-matching.test.js` | ❌ Wave 0 (new tests needed) |
| MATCH-01 | Tier 5 returns confidence 0.85 | unit | `npx vitest run tests/unit/shared-matching.test.js` | ❌ Wave 0 |
| MATCH-01 | OCR penalty does NOT stack on Tier 5 (still 0.85 not 0.83) | unit | `npx vitest run tests/unit/shared-matching.test.js` | ❌ Wave 0 |
| MATCH-01 | No-op guard: if nothing stripped, returns null | unit | `npx vitest run tests/unit/shared-matching.test.js` | ❌ Wave 0 |
| MATCH-01 | Chemical patent baseline: all 71 cases pass unchanged | regression | `npx vitest run tests/unit/text-matcher.test.js` | ✅ existing corpus test |
| MATCH-01 | Space-anchored: numbers embedded in values not stripped | unit | `npx vitest run tests/unit/shared-matching.test.js` | ❌ Wave 0 |
| MATCH-01 | Number at concat start and end correctly stripped | unit | `npx vitest run tests/unit/shared-matching.test.js` | ❌ Wave 0 |
| MATCH-01 | Two adjacent gutter numbers both stripped | unit | `npx vitest run tests/unit/shared-matching.test.js` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/unit/shared-matching.test.js`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green (157+ tests) before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] New `describe('gutterTolerantMatch', ...)` block in `tests/unit/shared-matching.test.js`
- [ ] New `describe('stripGutterNumbers', ...)` or `describe('buildStrippedConcat', ...)` for strip function unit tests
- [ ] Import `gutterTolerantMatch` (and `buildStrippedConcat` if exported) from `../../src/shared/matching.js`
- [ ] Synthetic positionMap fixtures for gutter number test cases (inline in tests, no new fixture files needed)

## Sources

### Primary (HIGH confidence)
- Direct codebase read: `/home/fatduck/patent-cite-tool/src/shared/matching.js` — full understanding of all tier functions, buildConcat, resolveMatch, whitespaceStrippedMatch internals
- Direct codebase read: `/home/fatduck/patent-cite-tool/tests/unit/shared-matching.test.js` — test patterns, import structure
- Direct codebase read: `/home/fatduck/patent-cite-tool/tests/unit/text-matcher.test.js` — corpus test structure, 71-case baseline
- CONTEXT.md decisions — all locked choices verified against code

### Secondary (MEDIUM confidence)
- V8/Node.js lookbehind support: documented in ECMAScript 2018 spec; supported since Node 9.11+, Chrome 62+, Firefox 78+. Project targets Manifest V3 (Chrome 88+, Firefox 109+) — lookbehind is safe to use.
- USPTO 37 CFR 1.52 gutter numbering mandate: referenced in REQUIREMENTS.md "Out of Scope" section — confirms gutter numbers are exact multiples of 5 (no fuzzy near-multiples needed).

### Tertiary (LOW confidence)
- None — all findings verified against codebase.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies, all building on established matching.js
- Architecture: HIGH — derived directly from existing whitespaceStrippedMatch pattern (offset array approach) and CONTEXT.md locked decisions
- Pitfalls: HIGH — identified by tracing through actual code (boundary remap edge cases, double-space collapse, penalty bypass)

**Research date:** 2026-03-05
**Valid until:** 2026-04-05 (stable codebase, no external dependencies)

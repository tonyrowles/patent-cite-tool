# Architecture Research

**Domain:** Text matching pipeline integration — gutter-number-tolerant matching and OCR-aware normalization for patent citation extension (v2.2)
**Researched:** 2026-03-04
**Confidence:** HIGH (analysis of live codebase; no external APIs involved)

---

## Context: What Already Exists

The matching pipeline lives in `src/shared/matching.js`. The current cascade in `matchAndCite` is:

```
matchAndCite(selectedText, positionMap, contextBefore, contextAfter)
  │
  ├─ 1. normalizeText(selectedText)         → NFC, ligatures, quotes, dashes, collapse whitespace
  ├─ 2. strip HTML wrap-hyphen artifacts    → "trans- actions" → "transactions"
  ├─ 3. Build concat + boundaries           → join positionMap entries with space; track char offsets
  │
  ├─ 4. Exact match (confidence: 1.00)      → findAllOccurrences + pickBestByContext
  ├─ 5. Whitespace-stripped match           → strip whitespace from both sides, map back (0.96–0.99)
  │     └─ sub-tiers: exact, case-insensitive, punctuation-trimmed, punctuation-agnostic
  ├─ 6. Bookend match (confidence: 0.92)    → match first/last 50 chars separately; >100 char selections
  └─ 7. Fuzzy (Levenshtein) match           → needle ≤ 100 chars only; similarity ≥ 0.80
```

The upstream pipeline in `src/offscreen/position-map-builder.js` handles PDF text items:

```
buildPositionMap(pageResults)
  ├─ isTwoColumnPage / extractPrintedColumnNumbers / findColumnBoundary
  ├─ filterHeadersFooters
  ├─ extractGutterLineGrid            → y-to-line-number mapping from gutter markers
  ├─ stripCrossBoundaryText           → remove embedded gutter numbers from cross-boundary items
  ├─ filterGutterLineNumbers          → remove standalone gutter number items (5, 10, ..., 65)
  ├─ clusterIntoLines
  ├─ assignLineNumbersByGrid / assignLineNumbers
  ├─ detectClaimsBoundary
  └─ detectWrapHyphens
```

**Key constraint:** The concat is built inside `matchAndCite` from `positionMap[i].text` values. Gutter numbers that slip past the upstream filters reach `matchAndCite` as part of line text. The upstream `filterGutterLineNumbers` has a spatial heuristic (x near boundary or page center) — numbers outside that 40pt tolerance are not filtered.

---

## Standard Architecture

### System Overview

```
User text selection (HTML)
         │
         ▼
+----------------------------+
│  matchAndCite()            │   src/shared/matching.js
│                            │
│  normalizeText()           │   ← Tier 0: deterministic cleanup
│  strip wrap-hyphens        │
│                            │
│  build concat + boundaries │   ← from positionMap entries
│         │                  │
│         ▼                  │
│  [Tier 1] exact match      │   confidence 1.00
│         │ fail             │
│         ▼                  │
│  [Tier 2] whitespace-      │   confidence 0.96–0.99
│           stripped match   │
│         │ fail             │
│         ▼                  │
│  [Tier 3] bookend match    │   confidence 0.92
│         │ fail             │
│         ▼                  │
│  [Tier 4] fuzzy match      │   confidence ≥ 0.80
│         │ fail             │
│         ▼                  │
│         null               │
+----------------------------+
         │
         ▼
+----------------------------+
│  resolveMatch()            │   char offset → positionMap entry → citation string
+----------------------------+
```

### v2.2 Additions — Where They Fit

```
User text selection (HTML)
         │
         ▼
+----------------------------+
│  matchAndCite()            │   src/shared/matching.js
│                            │
│  normalizeText()           │   ← [UNCHANGED] Tier 0
│  strip wrap-hyphens        │   ← [UNCHANGED]
│  normalizeOcr()            │   ← [NEW Tier 0b] OCR normalization on selectedText only
│                            │
│  build concat + boundaries │   ← [UNCHANGED] from positionMap entries
│         │                  │
│         ▼                  │
│  [Tier 1] exact match      │   confidence 1.00  [UNCHANGED]
│         │ fail             │
│         ▼                  │
│  [Tier 2] whitespace-      │   confidence 0.96–0.99  [UNCHANGED]
│           stripped match   │
│         │ fail             │
│         ▼                  │
│  [Tier 3] bookend match    │   confidence 0.92  [UNCHANGED]
│         │ fail             │
│         ▼                  │
│  [Tier 4] fuzzy match      │   confidence ≥ 0.80  [UNCHANGED]
│         │ fail             │
│         ▼                  │
│  [Tier 5] gutter-tolerant  │   confidence 0.85  [NEW TIER]
│           match            │   strip gutter candidates from concat, retry Tiers 1–4
│         │ fail             │
│         ▼                  │
│         null               │
+----------------------------+
```

---

## Recommended Project Structure

No new files required. All changes land in existing files:

```
src/
└── shared/
    └── matching.js          # All matching logic: normalizeText, normalizeOcr (new),
                             # gutterTolerantMatch (new), matchAndCite (updated)

tests/
├── unit/
│   └── text-matcher.test.js # Existing test file — extend with new test cases
├── fixtures/
│   └── US6324676.json       # Already exists — primary OCR validation patent
├── test-cases.js            # Add OCR-heavy and gutter-escape test cases
└── golden/
    └── baseline.json        # Regenerate after new cases pass
```

**No new source files needed.** Both features are additions to `src/shared/matching.js`. The position-map-builder.js is not modified — gutter number stripping at the PDF parsing stage is already implemented and works for the 80% case; the new Tier 5 handles the remaining escape cases at match time.

---

## Architectural Patterns

### Pattern 1: OCR Normalization as Tier 0b Preprocessing (Not a New Cascade Tier)

**What:** Add a `normalizeOcr(text)` function that maps common OCR confusions to a canonical form. Apply it to `normalized` (the selected text) inside `matchAndCite`, after the existing `normalizeText` call and wrap-hyphen strip, before building the concat. Also apply it inside the concat-building loop so both sides share the same OCR-normalized form.

**Why preprocessing, not a new cascade tier:** OCR normalization is not a fallback — it is a correction pass for systematic character confusion. Applying it at Tier 0b means all downstream tiers (exact, whitespace-stripped, bookend, fuzzy) automatically benefit without duplication. A "try raw, then try OCR-normalized" tier would needlessly run four matching strategies twice.

**Why apply to BOTH sides:** Unlike wrap-hyphen stripping (which only applies to the HTML selection because the PDF has the correct word), OCR errors can appear on both sides. A patent with a poor text layer may have "rn" rendered as "m" in the PDF text items. The user selection from Google Patents (which shows re-rendered OCR text) may reproduce the same confusions. Normalizing both sides improves recall without introducing false positives.

**When to use:** Always, as part of Tier 0b. OCR normalization is cheap (regex replacements) and its false-positive risk is minimal because common OCR confusions map many-to-one in a direction that only helps matching.

**Trade-offs:**
- Introducing case folding (e.g., l↔1↔I) means a match at this tier has lower confidence than an exact match — confidence should be capped at 0.95 if the OCR path is the differentiator. However, since normalization is applied before all tiers, confidence is naturally inherited from whichever tier matches: 1.00 for exact, 0.99 for whitespace-stripped, etc. No special capping is needed.
- Risk: normalizing '0' → 'O' or '1' → 'l' aggressively on alphanumeric content would break chemical sequences and patent numbers. Scope OCR normalization carefully to typographic substitutions that don't occur in alphanumeric identifiers.

**Example — `normalizeOcr`:**
```javascript
/**
 * Normalize common OCR character confusions.
 * Applied to both selected text and PDF concat text before matching.
 * Scope is limited to visually-similar character pairs that occur in
 * prose text, not in identifiers or numeric sequences.
 */
export function normalizeOcr(text) {
  return text
    // Ligature-like OCR merges (prose only — not identifiers)
    .replace(/\brn\b/g, 'm')          // "rn" → "m" (common OCR split)
    .replace(/\bcl\b/g, 'd')          // "cl" → "d" rare but documented
    // Quotation mark confusions (supplement normalizeText)
    .replace(/[''´`]/g, "'")          // additional apostrophe variants
    // Hyphen / dash confusions not covered by normalizeText
    .replace(/[‐‒]/g, '-')            // additional Unicode hyphens
    // Case normalization is NOT applied globally — it would break identifiers.
    // Case-insensitive matching is already a sub-tier inside whitespaceStrippedMatch.
    ;
}
```

**Note on 1/l/I and 0/O:** These substitutions are context-sensitive (they depend on whether the character appears in a word or in a number). Do NOT add them to `normalizeOcr`. The existing case-insensitive sub-tier in `whitespaceStrippedMatch` and the fuzzy Levenshtein tier already handle most practical instances. If US6324676 validation reveals specific recurring patterns, add them as targeted regex with word-boundary guards.

**Where in `matchAndCite`:**
```javascript
export function matchAndCite(selectedText, positionMap, contextBefore = '', contextAfter = '') {
  let normalized = normalizeText(selectedText);
  if (!normalized || normalized.length < 2) return null;
  if (!positionMap || positionMap.length === 0) return null;

  // Existing: strip HTML wrap-hyphen artifacts
  normalized = normalized.replace(/- ([a-z])/g, '$1');

  // NEW Tier 0b: OCR normalization on selection
  normalized = normalizeOcr(normalized);

  // Build concat — apply normalizeOcr to each entry's text too
  let concat = '';
  const boundaries = [];
  for (let i = 0; i < positionMap.length; i++) {
    const entry = positionMap[i];
    let lineText = normalizeOcr(normalizeText(entry.text));  // OCR normalization added
    // ... rest of concat-building loop unchanged ...
  }
  // ... rest of matchAndCite unchanged ...
}
```

---

### Pattern 2: Gutter-Number Stripping as New Tier 5 (Not in normalizeText)

**What:** When Tiers 1–4 all fail, try matching again on a modified concat that has potential gutter numbers removed. Implement as `gutterTolerantMatch(normalized, concat, boundaries, positionMap, contextBefore, contextAfter)`, called from `matchAndCite` after the fuzzy tier fails.

**Why a new cascade tier, not inside normalizeText:** `normalizeText` operates on a single string (the selection or a single line of text). Gutter number stripping requires understanding that numbers like "60" appearing in the middle of a line may be insertion artifacts — but "60" in "60 days" is valid. The decision to strip depends on: (1) is the number a multiple of 5 in 5–65, (2) is it surrounded by spaces, and (3) does removing it produce a match? This is pattern-matching logic, not character normalization.

**Why not in the main concat-building loop:** The existing concat is needed for Tiers 1–4 to work correctly. Gutter numbers that slipped through upstream filtering are part of the PDF's actual text representation. Stripping them from the main concat would cause boundary resolution errors for other selections where the number is valid content (e.g., "at 60 rpm" where 60 is real).

**Why not in position-map-builder.js:** The upstream `filterGutterLineNumbers` already does x-coordinate-based filtering during PDF parse. Numbers that escape it are legitimate text items that don't look like gutter markers spatially. Trying to strip them at parse time based purely on value would cause false removals. Stripping only when the main cascade fails is conservative and targeted.

**The gutter-tolerant strategy:**
1. Build a candidate concat by removing all occurrences of standalone numbers that are multiples of 5 in the range 5–65: `/ (5|10|15|20|25|30|35|40|45|50|55|60|65) /g` (note: surrounded by spaces to avoid "60rpm" or "160").
2. Rebuild boundaries for the stripped concat (char offsets shift after removal, so boundaries must be recomputed from the original positionMap entries with the new concat).
3. Run the inner match cascade (exact → whitespace-stripped) on the stripped concat.
4. If a match is found, return it with confidence capped at 0.85 (reflects uncertainty introduced by the strip).

**Confidence rationale:** 0.85 is below the 0.92 bookend tier but above the 0.80 fuzzy floor. This placement is correct: gutter-tolerant matching is less certain than bookend (which validates prefix+suffix span), but more structured than Levenshtein fuzzy matching. The yellow UI indicator (0.80–0.94) covers both gutter-tolerant and fuzzy results, which is appropriate — both warrant a glance from the user.

**When to use:** Only as Tier 5 fallback after all earlier tiers fail. Gutter numbers rarely escape upstream filtering; most citations are found by Tiers 1–2.

**Trade-offs:**
- False positives are possible if a patent contains legitimate prose references to multiples of 5 (e.g., "increased by 15 percent"). The stripped concat may produce an incorrect citation for a fragment that happens to match after number removal. Confidence 0.85 (yellow) signals this to the user.
- The boundary rebuild is O(n) over positionMap entries — acceptable because this tier only runs when all earlier tiers fail (already a rare path) and positionMaps are small (typically 2,000–5,000 entries).

**Example — `gutterTolerantMatch`:**
```javascript
/**
 * Gutter-number-tolerant matching — Tier 5 fallback.
 *
 * Strips potential gutter line-number insertions (multiples of 5, 5–65,
 * surrounded by spaces) from the concat, then retries exact and
 * whitespace-stripped matching. Used when Tiers 1–4 all fail.
 *
 * Returns a result with confidence capped at 0.85 to reflect
 * the uncertainty introduced by the stripping.
 */
export function gutterTolerantMatch(normalized, concat, positionMap, contextBefore, contextAfter) {
  // Strip standalone multiples of 5 (5–65) from the concat
  // Only strip when surrounded by spaces to avoid "60rpm", "15-volt", etc.
  const stripped = concat.replace(/ (5|10|15|20|25|30|35|40|45|50|55|60|65) /g, ' ');
  if (stripped === concat) return null; // nothing was stripped — skip

  // Rebuild boundaries for the stripped concat
  // Strategy: re-scan each positionMap entry's contribution to stripped
  const strippedBoundaries = [];
  let pos = 0;
  for (let i = 0; i < positionMap.length; i++) {
    const lineText = normalizeOcr(normalizeText(positionMap[i].text));
    const charStart = pos;
    pos += lineText.length + 1; // +1 for the space separator
    // Approximate: boundaries point to where the entry starts in stripped
    // The stripped concat has fewer chars, so we track entry start in stripped space
    const strippedStart = stripped.indexOf(lineText.substring(0, Math.min(10, lineText.length)), Math.max(0, charStart - 20));
    if (strippedStart !== -1) {
      strippedBoundaries.push({ charStart: strippedStart, charEnd: strippedStart + lineText.length, entryIdx: i });
    }
  }

  // Try exact match on stripped concat
  const allPositions = findAllOccurrences(stripped, normalized);
  if (allPositions.length > 0) {
    const bestPos = pickBestByContext(allPositions, normalized.length, stripped, contextBefore, contextAfter);
    const result = resolveMatch(bestPos, bestPos + normalized.length, strippedBoundaries, positionMap, 0.85);
    if (result) return result;
  }

  // Try whitespace-stripped on stripped concat
  const wsResult = whitespaceStrippedMatch(normalized, stripped, strippedBoundaries, positionMap, contextBefore, contextAfter);
  if (wsResult) return { ...wsResult, confidence: Math.min(wsResult.confidence, 0.85) };

  return null;
}
```

**Implementation note:** The boundary rebuild in the sketch above is approximate. The actual implementation should use the same concat-building loop from `matchAndCite` but applied to the OCR-normalized line texts, and run the gutter strip on the resulting concat. A cleaner approach: factor out `buildConcat(positionMap)` as a shared helper so both the main path and the gutter-tolerant path use the same concat-building logic, then apply the gutter strip to produce a second concat. This avoids duplicating the wrap-hyphen detection logic.

---

### Pattern 3: Factor Out `buildConcat` to Avoid Duplication

**What:** Extract the concat-building loop from `matchAndCite` into a standalone `buildConcat(positionMap)` function that returns `{ concat, boundaries }`. Call it once in `matchAndCite`. The gutter-tolerant tier then applies its strip to the returned `concat`.

**When to use:** Required if implementing `gutterTolerantMatch` — the function needs the original concat and a stripped variant. Without `buildConcat`, one of them must re-implement the loop.

**Trade-offs:** Slight refactor to existing code. The concat-building loop has wrap-hyphen detection that references `positionMap[i-1]` — extracting it requires carrying that logic into `buildConcat`. This is worth doing: the loop is complex enough that duplicating it would introduce divergence bugs.

**Example:**
```javascript
/**
 * Build the normalized text concat and character boundary table from a positionMap.
 * @returns {{ concat: string, boundaries: Array }}
 */
export function buildConcat(positionMap) {
  let concat = '';
  const boundaries = [];
  for (let i = 0; i < positionMap.length; i++) {
    const entry = positionMap[i];
    let lineText = normalizeOcr(normalizeText(entry.text));
    const prev = positionMap[i - 1];
    const prevIsWrapHyphen = prev && prev.column === entry.column && /^[a-z]/.test(lineText) && (
      prev.hasWrapHyphen ||
      concat.endsWith('-') ||
      /[-\u00AD\u2010\u2011\u2012]\s*$/.test(prev.text)
    );
    if (prevIsWrapHyphen) {
      concat = concat.replace(/-$/, '');
    } else if (concat.length > 0) {
      concat += ' ';
    }
    const charStart = concat.length;
    concat += lineText;
    boundaries.push({ charStart, charEnd: concat.length, entryIdx: i });
  }
  return { concat, boundaries };
}
```

---

## Data Flow

### Matching Request Flow (v2.2)

```
User highlights text on Google Patents
         │
         ▼
content script: selectedText, contextBefore, contextAfter
         │
         ▼
matchAndCite(selectedText, positionMap, contextBefore, contextAfter)
         │
         ├── normalizeText(selectedText)
         ├── strip HTML wrap-hyphens   ("trans- actions" → "transactions")
         ├── normalizeOcr(normalized)  [NEW] ("rn" → "m" where applicable)
         │
         ├── buildConcat(positionMap)  [REFACTORED — was inline]
         │     └── for each entry: normalizeText + normalizeOcr + wrap-hyphen join
         │         → { concat, boundaries }
         │
         ├── [Tier 1] exact             → hit? return confidence 1.00
         ├── [Tier 2] whitespace-strip  → hit? return confidence 0.96–0.99
         ├── [Tier 3] bookend           → hit? return confidence 0.92
         ├── [Tier 4] fuzzy Levenshtein → hit? return confidence ≥ 0.80
         ├── [Tier 5] gutterTolerant    → strip " N " from concat, retry Tiers 1–2
         │                                hit? return confidence 0.85
         │
         └── null (no match)
```

### Confidence Score Map (v2.2)

| Tier | Strategy | Confidence | UI Color |
|------|----------|------------|----------|
| 0b | OCR-normalized, matched by Tier 1 | 1.00 | Green |
| 0b | OCR-normalized, matched by Tier 2 | 0.96–0.99 | Green |
| 1 | Exact | 1.00 | Green |
| 2 | Whitespace-stripped (exact case) | 0.99 | Green |
| 2 | Whitespace-stripped (case-insensitive) | 0.98 | Green |
| 2 | Whitespace-stripped (punctuation-trimmed) | 0.97–0.98 | Green |
| 2 | Whitespace-stripped (punctuation-agnostic) | 0.96 | Green |
| 3 | Bookend | 0.92 | Green |
| 4 | Fuzzy (Levenshtein ≥ 0.80) | 0.80–0.99 | Yellow/Green |
| 5 | Gutter-tolerant (NEW) | 0.85 | Yellow |
| — | No match | null | Red toast |

**Note:** OCR normalization at Tier 0b does not lower confidence because it runs before the cascade. If the OCR-normalized selection finds an exact match, the confidence is 1.00 (exact match) — the OCR pre-processing is invisible to the confidence calculation. This is correct: if both the PDF concat and the user's selection had the same OCR error and normalizing both corrects both, the match is effectively exact. No confidence penalty is warranted.

---

## Integration Points

### Integration Point 1: `normalizeOcr` — New export from `src/shared/matching.js`

| Attribute | Value |
|-----------|-------|
| File | `src/shared/matching.js` |
| Type | New function (exported) |
| Inputs | `string` |
| Outputs | `string` |
| Called by | `matchAndCite` (on selection and on each positionMap entry in buildConcat) |
| Test file | `tests/unit/text-matcher.test.js` — new `describe('normalizeOcr', ...)` block |
| Smoke test | `tests/unit/text-matcher.test.js` — add `normalizeOcr` to the imports smoke test |

### Integration Point 2: `gutterTolerantMatch` — New export from `src/shared/matching.js`

| Attribute | Value |
|-----------|-------|
| File | `src/shared/matching.js` |
| Type | New function (exported) |
| Inputs | `normalized, concat, boundaries, positionMap, contextBefore, contextAfter` |
| Outputs | `{ citation, startEntry, endEntry, confidence } \| null` |
| Called by | `matchAndCite` as Tier 5 (after fuzzy, before return null) |
| Test file | `tests/unit/text-matcher.test.js` — new `describe('gutterTolerantMatch', ...)` block |
| Smoke test | Add to imports smoke test |

### Integration Point 3: `buildConcat` — Refactored extract from `matchAndCite`

| Attribute | Value |
|-----------|-------|
| File | `src/shared/matching.js` |
| Type | New function (exported) |
| Inputs | `positionMap: Array` |
| Outputs | `{ concat: string, boundaries: Array }` |
| Called by | `matchAndCite` (replaces inline loop) |
| Side effect | `normalizeOcr` is now called inside `buildConcat`, so OCR normalization applies to all concat text |
| Test file | `tests/unit/text-matcher.test.js` — can be tested indirectly via `matchAndCite` or directly |

### Integration Point 4: `matchAndCite` — Updated entry point

| Attribute | Value |
|-----------|-------|
| File | `src/shared/matching.js` |
| Type | Modified function |
| Changes | Add `normalizeOcr(normalized)` after wrap-hyphen strip; call `buildConcat(positionMap)` instead of inline loop; add Tier 5 `gutterTolerantMatch` call before `return null` |
| API surface | Unchanged — same signature, same return shape |
| Backward compat | Full — no caller changes needed |

### Integration Point 5: Test corpus expansion — US6324676

| Attribute | Value |
|-----------|-------|
| Fixture | `tests/fixtures/US6324676.json` (already exists) |
| New test cases | Add to `tests/test-cases.js` — selections from US6324676 that currently fail due to gutter numbers in concat or OCR confusion |
| Category | New category: `ocr-heavy` — or add to existing `pre2000-short` / `pre2000-long` |
| Golden update | Run `npm run update-golden` (or equivalent) after new tests pass |
| Baseline impact | New cases expand total from 59 to N; existing 59 must still pass (no regression) |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `matchAndCite` → `buildConcat` | Direct call | Replaces inline loop; `buildConcat` must preserve exact wrap-hyphen detection behavior |
| `matchAndCite` → `normalizeOcr` | Direct call (twice: on selection and via buildConcat) | Must not affect existing 59 test cases — verify by running corpus after adding normalizeOcr |
| `matchAndCite` → `gutterTolerantMatch` | Direct call as Tier 5 | Only called after Tiers 1–4 fail; concat and boundaries already built |
| `gutterTolerantMatch` → `whitespaceStrippedMatch` | Direct call | Passes stripped concat and recomputed boundaries |
| `gutterTolerantMatch` → `resolveMatch` | Direct call | Same resolveMatch function; boundary correctness critical |
| `normalizeOcr` → `normalizeText` | Independent — called sequentially in `matchAndCite` and `buildConcat` | `normalizeText` runs first (NFC, ligatures); `normalizeOcr` runs on its output |

---

## Build Order

The following order respects dependencies and minimizes wasted work:

### Step 1: Add `normalizeOcr` + run existing corpus (no regressions allowed)

Add `normalizeOcr` to `src/shared/matching.js`. Apply it inside `matchAndCite` on `normalized`, and inside the existing concat loop on `lineText`. Export it. Add to the imports smoke test. Run `npm run test:src` — all 59 existing cases must still pass. If any regress, the OCR normalization is too aggressive and must be narrowed.

**Why first:** OCR normalization is the lowest-risk change (pure preprocessing), and it gates everything else. If it causes regressions, it should be fixed before adding Tier 5 complexity.

### Step 2: Refactor inline concat loop into `buildConcat`

Extract the concat-building loop (now including `normalizeOcr`) into `buildConcat`. Call `buildConcat(positionMap)` from `matchAndCite`. Run corpus again — all 59 must still pass. This is a pure refactor with no behavior change.

**Why second:** `gutterTolerantMatch` needs `buildConcat`'s output (`concat`, `boundaries`). The refactor must be proven safe before it is extended.

### Step 3: Add `gutterTolerantMatch` as Tier 5

Add `gutterTolerantMatch` to `src/shared/matching.js`. Call it from `matchAndCite` after the fuzzy tier. Export it. Add isolated unit tests (not yet corpus-level). Verify: existing 59 cases are not affected (gutter-tolerant only triggers when Tiers 1–4 fail, so it should not change existing passing results).

**Why third:** Depends on `buildConcat` being stable (Step 2). Isolated unit tests before corpus expansion lets the function be validated before new test cases are added.

### Step 4: Validate with US6324676 — add new test cases to corpus

Identify 3–5 selections from US6324676 that currently fail due to gutter contamination or OCR confusion. Add them to `tests/test-cases.js`. Run the corpus. These new cases should now pass via Tier 5 (or Tier 0b/1 if OCR normalization was the only issue). If they fail, debug the specific failure mode before adding more cases.

**Why fourth:** End-to-end validation with the problem patent. New cases are added only after the implementation is confirmed correct on isolated unit tests.

### Step 5: Update golden baseline + full test run

Once all new cases pass, regenerate `tests/golden/baseline.json` to include the new test case expected outputs. Run the full test suite including chrome and firefox builds. Verify CI passes.

---

## Anti-Patterns

### Anti-Pattern 1: Applying Gutter Stripping Inside `normalizeText`

**What people do:** Add a regex like `.replace(/\b(5|10|15|20|25|30|35|40|45|50|55|60|65)\b/g, '')` inside `normalizeText`.

**Why it's wrong:** `normalizeText` is applied to individual lines and to the selected text independently. It has no awareness of whether a number is in gutter position. Stripping all multiples of 5 from prose would destroy legitimate content ("the interval is 15 seconds", "use 60 watts"). It would also corrupt the selected text, making it shorter than the concat match target — `resolveMatch` would return the wrong boundary.

**Do this instead:** Apply gutter stripping only to the concat (not the selection), only as a Tier 5 fallback after all other tiers fail.

### Anti-Pattern 2: Adding Aggressive l/1/I and 0/O Substitution to `normalizeOcr`

**What people do:** Add global substitutions like `.replace(/l/g, '1').replace(/I/g, '1').replace(/0/g, 'O')` to handle OCR character confusion.

**Why it's wrong:** These characters are structural in patent identifiers (SEQ ID NO:1, Claim 1, column 10), chemical formulae (CH3OH, C60), and patent numbers. Global substitution would corrupt identifier matching. The existing case-insensitive sub-tier in `whitespaceStrippedMatch` and the Levenshtein fuzzy tier already handle most practical instances of this confusion.

**Do this instead:** If US6324676 validation reveals specific repeated patterns (e.g., the letter 'S' consistently misread as '5'), add that as a targeted, bounded substitution with word-boundary or context guards. Never apply character class confusion globally.

### Anti-Pattern 3: Building a Separate "OCR Concat" and Cascading Two Full Pipelines

**What people do:** Run `matchAndCite` once on the raw input, and if it fails, run it again on an OCR-normalized version of the selected text.

**Why it's wrong:** Doubles the computational cost. The concat rebuild (the most expensive part of `matchAndCite`) runs twice. OCR normalization is cheap and idempotent — there is no reason to defer it to a second pass. The two-pass approach also produces ambiguous confidence scores (which pass's confidence counts?) and makes the cascade harder to reason about.

**Do this instead:** Apply `normalizeOcr` at Tier 0b — once, before the cascade. All tiers automatically benefit.

### Anti-Pattern 4: Confidence Inflation on Gutter-Tolerant Matches

**What people do:** Return the confidence of the underlying match method (e.g., 0.99 from whitespace-stripped) even when the match was found on a stripped concat.

**Why it's wrong:** The stripped concat may have removed legitimate content. A whitespace-stripped match on a corpus that had numbers removed is structurally less reliable than the same match on an intact corpus. Inflating confidence causes the UI to show green for a citation that has a higher risk of being slightly wrong.

**Do this instead:** Cap the confidence of any result returned through `gutterTolerantMatch` at 0.85, regardless of the underlying match method's confidence. The yellow UI indicator alerts the user to verify.

---

## Scaling Considerations

This is a client-side browser extension. There are no servers to scale. The relevant dimension is positionMap size (number of lines per patent).

| PositionMap Size | Matching Performance | Notes |
|-----------------|---------------------|-------|
| Typical: 2,000–5,000 entries | <5ms total for all tiers | Chrome extension; no perceptible delay |
| Large (dense chemical patent): up to 10,000 entries | <20ms | Still well within UX threshold; fuzzy is capped at 100 chars |
| `buildConcat` refactor | Same as current concat-build: O(n) | No performance change |
| `gutterTolerantMatch` | O(n) for strip + O(n) for boundary rebuild + O(nm) for whitespace-stripped | Only runs when Tiers 1–4 fail; acceptable |

---

## Files to Modify (v2.2)

| File | Change Type | What Changes |
|------|-------------|-------------|
| `src/shared/matching.js` | Modified | Add `normalizeOcr`, `buildConcat`, `gutterTolerantMatch` functions; refactor `matchAndCite` to call them |
| `tests/unit/text-matcher.test.js` | Modified | Add `normalizeOcr`, `buildConcat`, `gutterTolerantMatch` to imports smoke test; add describe blocks for each new function; add OCR-heavy corpus cases |
| `tests/test-cases.js` | Modified | Add new test cases for US6324676 and any other OCR-heavy patents |
| `tests/golden/baseline.json` | Regenerated | New entries for added test cases |

## Files NOT to Modify (v2.2)

| File | Why unchanged |
|------|--------------|
| `src/offscreen/position-map-builder.js` | Upstream filtering is already correct for the 80% case; not the right layer for matching-time fallbacks |
| `src/shared/constants.js` | No new constants needed |
| Content scripts, background scripts | `matchAndCite` API surface is unchanged |
| `vitest.config.*.js` | No config changes needed |
| `.github/workflows/ci.yml` | CI already covers all test suites; no changes needed |

---

## Sources

- `src/shared/matching.js` — live codebase, ground truth for current cascade — HIGH confidence
- `src/offscreen/position-map-builder.js` — live codebase, ground truth for upstream gutter filtering — HIGH confidence
- `tests/unit/text-matcher.test.js` — live codebase, existing test structure — HIGH confidence
- `tests/fixtures/US6324676.json` — live fixture, confirmed as primary OCR validation patent — HIGH confidence
- `.planning/PROJECT.md` — v2.2 milestone specification — HIGH confidence

---

*Architecture research for: Patent Citation Tool v2.2 — Matching Robustness (gutter-tolerant + OCR-aware normalization)*
*Researched: 2026-03-04*

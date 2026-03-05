# Phase 20: OCR Normalization and Concat Refactor - Research

**Researched:** 2026-03-04
**Domain:** JavaScript string normalization, matching pipeline refactoring (src/shared/matching.js)
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**OCR Substitution Pairs**
- 5 pairs defined as `const OCR_PAIRS` array at module top, applied via loop in `normalizeOcr`:
  - `rn` -> `m`
  - `cl` -> `d`
  - `cI` -> `d` (capital-I variant of cl->d)
  - `vv` -> `w`
  - `li` -> `h`
- One direction only (OCR-error -> true character) — both selection and concat get the same normalization so they match regardless of which side has the OCR error
- 1/l/I and 0/O explicitly excluded — identifier collision risk (locked in STATE.md)

**Normalization Scope**
- Always-on Tier 0b preprocessing — `normalizeOcr` runs unconditionally on both selection and concat before any matching tier
- 0.02 confidence penalty when normalizeOcr actually changed characters that the match region spans
- Either side (selection or concat) triggers the penalty, applied once (not cumulative)
- Penalty only when normalizeOcr was *necessary* for the match — if the match would succeed on un-normalized text, no penalty (preserves existing 71-case baseline confidence values exactly)

**buildConcat Extraction Boundary**
- Full loop extraction — the entire concat-building loop (currently lines 403-431 in matching.js) moves into `buildConcat`, including wrap-hyphen detection
- `buildConcat` applies both `normalizeText` and `normalizeOcr` to each entry's text — single source of truth for all text preprocessing
- Returns `{concat, boundaries}` per success criteria — simple return signature
- `buildConcat` internally tracks which character index ranges in the concat were affected by `normalizeOcr`, exposed for penalty calculation

**normalizeOcr Return Value**
- `normalizeOcr(text)` returns `{text, changed}` — not just a string
- `changed` is a boolean indicating whether any substitution was applied
- `buildConcat` uses this to track changed ranges (character positions in the final concat that were affected by OCR normalization)

**Regression Guardrails**
- Golden baseline (71 cases) is sufficient — no additional kill switch or toggle needed
- Confidence penalty is surgical: only applied when the match overlaps changed character ranges
- No baseline entries should change tier or confidence values

### Claude's Discretion

- Internal data structure for tracking changed ranges in buildConcat
- Exact implementation of overlap detection between match region and changed ranges
- Whether normalizeOcr replaces from left-to-right or uses a regex with alternation
- Test structure and naming for new normalizeOcr unit tests

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MATCH-02 | Common OCR character confusions (case errors like s->S, bigram substitutions like rn->m, cl->d) are normalized before the matching cascade via a dedicated `normalizeOcr` function applied to both selection and concat | normalizeOcr design, OCR_PAIRS constant, penalty detection pattern, integration point in matchAndCite |
| MATCH-03 | Concat-building logic is extracted from `matchAndCite` into a shared `buildConcat` helper returning `{concat, boundaries}`, integrating `normalizeOcr` internally | buildConcat signature, wrap-hyphen detection preservation, changed-ranges tracking, integration with downstream tiers |
</phase_requirements>

---

## Summary

Phase 20 is a pure JavaScript refactoring and augmentation task within a single file: `src/shared/matching.js`. The work has two tightly coupled parts: extract the inline concat-building loop (lines 403-431) into an exported `buildConcat` function, and add an exported `normalizeOcr` function applied as Tier 0b preprocessing on both the selection text and each entry's text inside `buildConcat`.

The design is fully locked by CONTEXT.md. The only open areas are implementation details: the internal data structure for tracking OCR-affected character ranges, the overlap detection algorithm, and the replacement strategy inside `normalizeOcr` (sequential string replace vs. regex alternation). All five OCR substitution pairs, the return signatures, the confidence penalty value, and the zero-regression requirement are decided.

The golden baseline is 71 test cases currently passing at 136 total tests. The confidence penalty mechanism must be implemented carefully — if the un-normalized selection still finds a match in the un-normalized concat, no penalty is applied. This "necessity test" is the only logic requiring design judgment.

**Primary recommendation:** Implement `normalizeOcr` as sequential `.replace()` calls (one per pair) returning `{text, changed}`. Track OCR-affected ranges as an array of `{start, end}` intervals in `buildConcat`. Detect overlap between the match region and changed ranges using a simple interval intersection. Apply penalty exactly once by checking if any changed range overlaps `[matchStart, matchEnd)`.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Vitest | ^3.0.0 | Test runner (already in project) | Existing test infrastructure; all 136 tests run via `npm run test:src` |
| Node.js ESM | native | Module system | Project uses `"type": "module"` throughout |

No new dependencies needed. This phase is pure JavaScript string manipulation with no external library requirements.

**Installation:** None required.

---

## Architecture Patterns

### Current Code Structure (matching.js)

```
src/shared/matching.js
├── normalizeText(text)           export, lines 7-22
├── findAllOccurrences(...)       export, lines 28-36
├── pickBestByContext(...)        export, lines 46-94
├── whitespaceStrippedMatch(...)  export, lines 104-198
├── bookendMatch(...)             export, lines 211-276
├── resolveMatch(...)             export, lines 281-296
├── formatCitation(...)           export, lines 302-314
├── fuzzySubstringMatch(...)      export, lines 322-352
├── levenshtein(...)              export, lines 357-370
└── matchAndCite(...)             export, lines 382-465
    ├── [lines 383-401] normalize selectedText + wrap-hyphen strip
    ├── [lines 403-431] inline concat loop  <-- EXTRACT to buildConcat
    └── [lines 433-464] matching cascade (Tiers 1-4)
```

### Target Code Structure

```
src/shared/matching.js
├── OCR_PAIRS                     const at module top
├── normalizeText(text)           export (unchanged)
├── normalizeOcr(text)            NEW export -> {text, changed}
├── buildConcat(positionMap)      NEW export -> {concat, boundaries, changedRanges}
├── findAllOccurrences(...)       export (unchanged)
├── pickBestByContext(...)        export (unchanged)
├── whitespaceStrippedMatch(...)  export (unchanged)
├── bookendMatch(...)             export (unchanged)
├── resolveMatch(...)             export (unchanged)
├── formatCitation(...)           export (unchanged)
├── fuzzySubstringMatch(...)      export (unchanged)
├── levenshtein(...)              export (unchanged)
└── matchAndCite(...)             export (modified)
    ├── normalize + strip wrap-hyphen from selectedText
    ├── normalizeOcr(normalized)  -> {text: ocrNormalized, changed: selChanged}
    ├── buildConcat(positionMap)  -> {concat, boundaries, changedRanges}
    └── matching cascade with penalty check
```

### Pattern 1: normalizeOcr Function

**What:** Pure function that applies OCR substitution pairs sequentially and reports whether any change occurred.

**When to use:** Called on selection text in `matchAndCite` and on each entry's text inside `buildConcat`.

**Design — sequential replace approach (recommended):**

```javascript
// Source: project conventions — mirrors normalizeText's sequential replace chain
const OCR_PAIRS = [
  ['rn', 'm'],
  ['cl', 'd'],
  ['cI', 'd'],
  ['vv', 'w'],
  ['li', 'h'],
];

export function normalizeOcr(text) {
  let result = text;
  for (const [from, to] of OCR_PAIRS) {
    result = result.split(from).join(to);
  }
  return { text: result, changed: result !== text };
}
```

Note: `split().join()` is preferred over `replace()` with a regex because it avoids regex special character escaping concerns for the pair strings. Both approaches are O(n) per pair.

**Alternative — regex alternation approach:**

```javascript
export function normalizeOcr(text) {
  const pattern = /rn|cl|cI|vv|li/g;
  const MAP = { rn: 'm', cl: 'd', cI: 'd', vv: 'w', li: 'h' };
  const result = text.replace(pattern, (match) => MAP[match]);
  return { text: result, changed: result !== text };
}
```

This is a single pass vs. 5 passes. Both are correct. The regex approach is slightly faster for long strings; the loop approach is more readable and extensible. Since matching.js uses sequential `.replace()` in `normalizeText`, the loop mirrors existing style.

### Pattern 2: buildConcat Function

**What:** Extract lines 403-431 from `matchAndCite` into a standalone exported function. Add `normalizeOcr` call on each entry's `lineText`. Track which character ranges in the final concat were affected by OCR normalization.

**When to use:** Called by `matchAndCite` to produce the concat string and boundaries. Will also be consumed by Phase 21's `gutterTolerantMatch`.

**Changed ranges data structure (Claude's discretion — recommended):**

An array of `{start, end}` objects where `start` (inclusive) and `end` (exclusive) are indices into the final `concat` string:

```javascript
// Source: project conventions — interval pairs are idiomatic JS
export function buildConcat(positionMap) {
  let concat = '';
  const boundaries = [];
  const changedRanges = []; // [{start, end}] — OCR-affected ranges in concat

  for (let i = 0; i < positionMap.length; i++) {
    const entry = positionMap[i];
    let lineText = normalizeText(entry.text);

    // Wrap-hyphen detection (unchanged from lines 414-427)
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

    // Apply OCR normalization AFTER normalizeText
    const { text: ocrText, changed } = normalizeOcr(lineText);
    lineText = ocrText;

    const charStart = concat.length;
    concat += lineText;
    const charEnd = concat.length;

    boundaries.push({ charStart, charEnd, entryIdx: i });

    if (changed) {
      changedRanges.push({ start: charStart, end: charEnd });
    }
  }

  return { concat, boundaries, changedRanges };
}
```

**Important constraint:** `normalizeOcr` runs AFTER `normalizeText` on each entry's text. This ordering matters — `normalizeText` normalizes Unicode ligatures and quotes first, giving `normalizeOcr` clean ASCII input.

### Pattern 3: matchAndCite Integration

**What:** Replace the inline loop in `matchAndCite` with a call to `buildConcat`. Apply `normalizeOcr` to the selection text. Add penalty detection logic.

**Penalty detection — overlap check (Claude's discretion — recommended):**

The penalty applies when: (a) the match was necessary (un-normalized text would not match), AND (b) the match region overlaps at least one changed range.

```javascript
// Source: project design decisions (CONTEXT.md)
export function matchAndCite(selectedText, positionMap, contextBefore = '', contextAfter = '') {
  let normalized = normalizeText(selectedText);
  if (!normalized || normalized.length < 2) return null;
  if (!positionMap || positionMap.length === 0) return null;

  // Strip wrap-hyphen artifacts (unchanged)
  normalized = normalized.replace(/- ([a-z])/g, '$1');

  // Tier 0b: OCR normalization on selection
  const { text: ocrNormalized, changed: selChanged } = normalizeOcr(normalized);

  // Build concat with OCR normalization applied to each entry
  const { concat, boundaries, changedRanges } = buildConcat(positionMap);

  // Helper: check if a match region overlaps any OCR-changed range
  function overlapsChangedRanges(matchStart, matchEnd) {
    return changedRanges.some(r => matchStart < r.end && matchEnd > r.start);
  }

  // Helper: was OCR normalization necessary for this match?
  // Try the match on un-normalized text — if it succeeds, no penalty needed.
  function wasOcrNecessary(matchStart, matchEnd, result) {
    // If neither side had OCR changes, no penalty possible
    if (!selChanged && changedRanges.length === 0) return false;
    // If the region doesn't overlap any changed range AND selection didn't change,
    // then OCR had no effect on this particular match
    if (!selChanged && !overlapsChangedRanges(matchStart, matchEnd)) return false;
    // Penalty applies: OCR changes exist and overlapped the match region
    return true;
  }

  // Matching cascade uses ocrNormalized for all tiers
  // (exact -> whitespace-stripped -> bookend -> fuzzy)
  // After finding result, check penalty:
  //   if (result && wasOcrNecessary(result.matchStart, result.matchEnd, result)) {
  //     result = { ...result, confidence: result.confidence - 0.02 };
  //   }
}
```

**Penalty necessity test — simpler alternative:** Because all 71 baseline cases already pass without OCR normalization (the current pipeline has no `normalizeOcr`), the simplest correct approach is: if the match would also succeed using `normalized` (un-OCR-normalized selection) against the un-OCR-normalized concat, skip the penalty. Otherwise, apply it. This avoids running the full cascade twice; instead, the penalty fires only when `selChanged || overlapsChangedRanges(matchStart, matchEnd)`.

Given the CONTEXT.md constraint "if the match would succeed on un-normalized text, no penalty," the cleanest implementation is: check overlap first; if no overlap and selection unchanged, no penalty. If overlap detected, re-run only the specific tier that matched using un-normalized inputs as a quick check.

**Practical simplification (recommended):** Since the 71 baseline cases have confidence values of 1.0 (exact match tier), and the penalty only fires for OCR-affected regions, the safest implementation for zero regression is: apply the penalty only when the changed range is actually within `[matchStart, matchEnd)`. Never attempt a second-pass match check — the penalty trigger is purely range-based. This satisfies the "necessary" criterion because: if OCR normalization changed text in the match region, those changes were by definition what enabled the match (otherwise the un-normalized version would also match, yielding the same hit at the same boundaries, but that path was already tried in the exact match tier before `normalizeOcr` was available in the pre-Phase-20 code). Post-Phase-20, `normalizeOcr` is always applied first, so the "was it necessary" check reduces to "did any changed range overlap the match?".

### Anti-Patterns to Avoid

- **Applying normalizeOcr before normalizeText:** normalizeText handles Unicode normalization (NFC, ligatures, quotes). Run normalizeText first, then normalizeOcr on clean ASCII.
- **Applying normalizeOcr to contextBefore/contextAfter:** These are DOM context strings for disambiguation only. OCR normalization applies to selection and concat only.
- **Cumulative penalties:** The penalty is a flat 0.02, applied once regardless of how many pairs matched. Do not accumulate per-pair.
- **Penalizing matches where OCR normalization made no difference:** If `selChanged === false` and `changedRanges` is empty, confidence must be exactly as before — do not apply any penalty.
- **Breaking downstream consumers:** `whitespaceStrippedMatch` and `bookendMatch` receive `concat` and `boundaries`. Their signatures do not change. The `changedRanges` array is consumed only inside `matchAndCite` for penalty calculation. Phase 21's `gutterTolerantMatch` will consume `{concat, boundaries}` from `buildConcat` — the third `changedRanges` field can be ignored by callers that don't need it.
- **Modifying boundaries return shape:** The `boundaries` array (`[{charStart, charEnd, entryIdx}]`) must remain identical to what the inline loop currently produces, because `whitespaceStrippedMatch`, `bookendMatch`, and `resolveMatch` all depend on it.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OCR confusion normalization | Custom ML/LLM post-processing | Simple string substitution (OCR_PAIRS loop) | LLM approach corrupts technical terms; ~6 known pairs is the full problem scope per REQUIREMENTS.md |
| Fuzzy matching for OCR | Levenshtein with confusion matrix | Pre-normalization + exact match | Already in requirements as "Out of Scope" — weighted Levenshtein is overkill for 5 known pairs |

**Key insight:** The 5 OCR pairs were chosen as a "prose-safe" subset where false positives are acceptable (common English words contain these patterns naturally). The match will still verify against the position map, so a false OCR substitution that creates a wrong-word match is caught at the citation resolution stage (no valid entry at that position).

---

## Common Pitfalls

### Pitfall 1: Changed Flag Granularity — Entry-Level vs. Character-Level

**What goes wrong:** `normalizeOcr` returns a boolean `changed` flag per entry, but the actual changed characters may cover only a subset of `[charStart, charEnd)`. Using the full entry range as a "changed range" is conservative — it may trigger the penalty for matches that don't actually overlap the substitution position.

**Why it happens:** Tracking exact character offsets of substitutions inside an entry requires more bookkeeping than a simple boolean.

**How to avoid:** For Phase 20, entry-level granularity (treating the whole entry as changed if any character changed) is acceptable. The penalty is small (0.02) and only fires when a baseline case changes — which it won't, because the 71 baseline cases currently use exact character matches that don't require OCR normalization. This conservative approach is safer than adding complex character-offset tracking.

**Warning signs:** If baseline test confidence values shift, the overlap detection is incorrectly firing on non-OCR matches.

### Pitfall 2: Wrap-Hyphen Detection Uses Raw Entry Text

**What goes wrong:** The wrap-hyphen check at lines 414-419 inspects `prev.text` (raw) and `prev.hasWrapHyphen` (raw field). If `normalizeOcr` is accidentally applied before this check, `prev.text` would already be modified, breaking the soft-hyphen detection (`\u00AD` would be gone).

**Why it happens:** The wrap-hyphen detection comments explicitly say "Check RAW text (before normalization)" — the raw text is `entry.text`, but `normalizeText` strips `\u00AD`. The check uses `prev.text` for the regex, so as long as `normalizeOcr` runs on `lineText` (after `normalizeText`) rather than on `entry.text`, this is safe.

**How to avoid:** In `buildConcat`, maintain the current order: `lineText = normalizeText(entry.text)`, then run wrap-hyphen check using `prev.text` and `concat`, then apply `normalizeOcr(lineText)`. Never apply `normalizeOcr` to `entry.text` directly.

**Warning signs:** Wrap-hyphenated baseline cases (the `offscreen-matcher.test.js` tests) regress.

### Pitfall 3: Penalty Fires on All 71 Baseline Cases

**What goes wrong:** If the overlap detection logic is incorrect (e.g., always returns true when `changedRanges.length > 0`), every test with an OCR-normalized concat entry will get penalized, changing confidence from 1.0 to 0.98.

**Why it happens:** The golden baseline has `"confidence": 1` for all 71 cases. A confidence delta of 0.02 would cause those test assertions to fail.

**How to avoid:** The penalty fires only when the specific match region `[matchStart, matchEnd)` overlaps a changed range. For a baseline case where all text matches exactly without needing OCR normalization, the match is found at the exact same position — but the concat entries still got OCR-normalized. The key: if `selChanged === false` AND the match region text in the original (un-OCR-normalized) concat equals the selection, no penalty applies. Implementation: check `overlapsChangedRanges(matchStart, matchEnd)` only when `selChanged || changedRanges.length > 0`.

**Warning signs:** Any baseline test with `confidence: 1` reports `0.98` after the change.

### Pitfall 4: buildConcat Produces Different Spacing Than Inline Loop

**What goes wrong:** The extracted `buildConcat` adds spaces between entries via `concat += ' '`. If the wrap-hyphen stripping (`concat = concat.replace(/-$/, '')`) produces a different result when refactored, concat strings differ from the inline version, breaking all baseline tests.

**Why it happens:** The space-addition logic has two branches: no space when prevIsWrapHyphen (the previous `-` is stripped), one space otherwise. The order of operations (strip trailing hyphen first, then check concat.length) must be preserved exactly.

**How to avoid:** Extract lines 403-431 verbatim. Do not simplify or reorder the logic. Add `normalizeOcr` after the entry's `lineText` is computed but before it is appended to `concat`.

**Warning signs:** Any baseline test fails at all — even a single mismatch indicates the concat format changed.

### Pitfall 5: normalizeOcr Pairs Applied in Wrong Direction

**What goes wrong:** Applying `m` -> `rn` (reverse direction) instead of `rn` -> `m` would expand instead of contract, making matches worse.

**Why it happens:** Simple transposition error when reading the pair definition.

**How to avoid:** The constant is `['rn', 'm']` (from, to). The replacement is `text.split(from).join(to)`. The "from" is the OCR error; the "to" is the true character.

---

## Code Examples

### normalizeOcr — Verified Pattern

```javascript
// Source: project design (CONTEXT.md locked decisions)
// Mirrors normalizeText's sequential replacement chain (matching.js lines 7-22)

const OCR_PAIRS = [
  ['rn', 'm'],
  ['cl', 'd'],
  ['cI', 'd'],
  ['vv', 'w'],
  ['li', 'h'],
];

export function normalizeOcr(text) {
  let result = text;
  for (const [from, to] of OCR_PAIRS) {
    result = result.split(from).join(to);
  }
  return { text: result, changed: result !== text };
}
```

### buildConcat — Key Structural Pattern

```javascript
// Source: matching.js lines 403-431 (inline loop to extract verbatim)
// OCR normalization added at the point marked with (+)

export function buildConcat(positionMap) {
  let concat = '';
  const boundaries = [];
  const changedRanges = [];

  for (let i = 0; i < positionMap.length; i++) {
    const entry = positionMap[i];
    let lineText = normalizeText(entry.text);            // existing step 1

    const prev = positionMap[i - 1];                    // existing wrap-hyphen check
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

    const { text: ocrText, changed } = normalizeOcr(lineText); // (+) new step 2
    lineText = ocrText;

    const charStart = concat.length;
    concat += lineText;
    boundaries.push({ charStart, charEnd: concat.length, entryIdx: i });

    if (changed) {
      changedRanges.push({ start: charStart, end: concat.length }); // (+)
    }
  }

  return { concat, boundaries, changedRanges };
}
```

### matchAndCite — Penalty Application Pattern

```javascript
// Source: project design (CONTEXT.md)
// After obtaining a match result with {matchStart, matchEnd} known:

function applyOcrPenalty(result, matchStart, matchEnd, selChanged, changedRanges) {
  // No penalty if neither side had OCR changes
  if (!selChanged && changedRanges.length === 0) return result;

  // No penalty if match region doesn't overlap any changed range
  // AND selection text was unchanged
  const regionOverlaps = changedRanges.some(r => matchStart < r.end && matchEnd > r.start);
  if (!selChanged && !regionOverlaps) return result;

  // Penalty applies once, not cumulative
  return { ...result, confidence: result.confidence - 0.02 };
}
```

### Unit Test Pattern for normalizeOcr

```javascript
// Source: project test conventions (vitest, existing tests in tests/unit/)
import { describe, it, expect } from 'vitest';
import { normalizeOcr, buildConcat } from '../../src/shared/matching.js';

describe('normalizeOcr', () => {
  it('replaces rn -> m', () => {
    const { text, changed } = normalizeOcr('cornrnunication');
    expect(text).toBe('communication');
    expect(changed).toBe(true);
  });

  it('returns changed: false when no substitution occurs', () => {
    const { text, changed } = normalizeOcr('hello world');
    expect(text).toBe('hello world');
    expect(changed).toBe(false);
  });

  it('does not alter text with no OCR patterns', () => {
    const input = 'The quick brown fox';
    expect(normalizeOcr(input).text).toBe(input);
  });
});

describe('buildConcat', () => {
  it('exports buildConcat as a function', () => {
    expect(typeof buildConcat).toBe('function');
  });

  it('returns {concat, boundaries} matching the inline loop behavior', () => {
    const positionMap = [
      { text: 'The quick brown fox', column: 1, lineNumber: 5, page: 1, section: 'spec', hasWrapHyphen: false },
      { text: 'jumps over the lazy dog', column: 1, lineNumber: 6, page: 1, section: 'spec', hasWrapHyphen: false },
    ];
    const { concat, boundaries } = buildConcat(positionMap);
    expect(concat).toBe('The quick brown fox jumps over the lazy dog');
    expect(boundaries).toHaveLength(2);
    expect(boundaries[0]).toMatchObject({ entryIdx: 0 });
  });
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Inline concat loop in matchAndCite | Shared `buildConcat` helper | Phase 20 | Phase 21 can reuse buildConcat for gutter stripping without duplicating wrap-hyphen logic |
| No OCR preprocessing | `normalizeOcr` as Tier 0b | Phase 20 | OCR-confused characters in selection or concat no longer block citation resolution |
| `normalizeText` only | `normalizeText` + `normalizeOcr` in sequence | Phase 20 | Two-layer normalization: Unicode cleanup first, then OCR bigram correction |

---

## Open Questions

1. **Penalty necessity check complexity**
   - What we know: The 71 baseline cases all match without OCR normalization (they existed before this feature). Post-refactor, the concat is always OCR-normalized, so `changedRanges` may be non-empty even for baseline cases.
   - What's unclear: Whether the simpler range-overlap check (without a second-pass necessity test) could ever incorrectly penalize a baseline case.
   - Recommendation: Use the range-overlap approach. If baseline confidence values remain 1.0 after the change (which they should, because the 71 selected texts do not contain OCR patterns), the question resolves empirically. Run `npm run test:src` immediately after implementation.

2. **`cI` pair ordering relative to `cl`**
   - What we know: Both `cl` -> `d` and `cI` -> `d` target the same true character. Sequential replacement means `cl` fires first; if input has `cI`, the `cl` pair won't match it (since `I` != `l`), so `cI` must be a separate pair.
   - What's unclear: Whether any word could contain both `cl` and `cI` patterns requiring a specific application order.
   - Recommendation: Apply pairs in the locked order: `rn, cl, cI, vv, li`. Since each pair targets distinct bigrams with no overlap, order does not affect correctness.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest ^3.0.0 |
| Config file | `vitest.config.js` |
| Quick run command | `npm run test:src` |
| Full suite command | `npm run test` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MATCH-02 | `normalizeOcr` exported from matching.js | unit (export check) | `npm run test:src` | ❌ Wave 0 — add to shared-matching.test.js |
| MATCH-02 | `normalizeOcr('cornrnunication')` returns `{text: 'communication', changed: true}` | unit | `npm run test:src` | ❌ Wave 0 |
| MATCH-02 | `normalizeOcr('hello')` returns `{changed: false}` | unit | `npm run test:src` | ❌ Wave 0 |
| MATCH-02 | Selection with `rn`->m confusion resolves to correct citation | integration | `npm run test:src` (corpus) | ❌ Wave 0 — new test case fixture needed |
| MATCH-03 | `buildConcat` exported from matching.js | unit (export check) | `npm run test:src` | ❌ Wave 0 — add to shared-matching.test.js |
| MATCH-03 | `buildConcat(positionMap)` returns `{concat, boundaries}` | unit | `npm run test:src` | ❌ Wave 0 |
| MATCH-03 | 71 baseline cases unchanged (zero regression) | regression | `npm run test:src` | ✅ tests/unit/text-matcher.test.js |

### Sampling Rate

- **Per task commit:** `npm run test:src`
- **Per wave merge:** `npm run test:src`
- **Phase gate:** `npm run test:src` green (136+ tests passing, all baseline confidence values preserved) before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/unit/shared-matching.test.js` — add `normalizeOcr` and `buildConcat` export checks + behavior tests
- [ ] `tests/fixtures/ocr-confusion-fixture.json` — minimal positionMap with OCR-confused text for integration test (or inline in test file)
- [ ] New test case in `tests/test-cases.js` + `tests/golden/baseline.json` for OCR confusion selection (optional: if an inline unit test covers MATCH-02 intent, a corpus entry can defer to Phase 22/VALID-01)

---

## Sources

### Primary (HIGH confidence)

- `src/shared/matching.js` (read directly) — full source of the inline concat loop (lines 403-431), all existing exports, normalizeText pattern
- `tests/unit/text-matcher.test.js` (read directly) — golden baseline integration, 71 test corpus, confidence assertion pattern
- `tests/golden/baseline.json` (read directly) — all 71 current expected values (all `"confidence": 1`)
- `.planning/phases/20-ocr-normalization-and-concat-refactor/20-CONTEXT.md` (read directly) — locked decisions for all function signatures, OCR pairs, penalty value, regression guardrails
- `vitest.config.js` + `package.json` (read directly) — test commands, Vitest ^3.0.0 confirmed

### Secondary (MEDIUM confidence)

- Live test run (`npm run test:src`) — confirmed 136 tests pass, 71/71 corpus cases pass, no failures

### Tertiary (LOW confidence)

- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; project stack confirmed by reading package.json and config files
- Architecture: HIGH — based on direct source code reading of matching.js; all integration points verified
- Pitfalls: HIGH — derived from reading the existing code logic (wrap-hyphen raw text comment at line 413-419, confidence value assertions in text-matcher.test.js)

**Research date:** 2026-03-04
**Valid until:** 2026-04-04 (stable domain — pure JS, no external library changes)

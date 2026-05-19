# Feature Research

**Domain:** OCR-aware text matching robustness for patent citation extension (v2.2)
**Researched:** 2026-03-04
**Confidence:** HIGH (existing codebase) / MEDIUM (OCR error literature)

---

## Context: What Already Exists

This milestone adds robustness on top of the complete v2.1 matching pipeline. Do not re-research or re-implement these — the new features extend them:

| Existing Capability | Implementation Location |
|--------------------|------------------------|
| Multi-strategy cascade: exact → whitespace-stripped → bookend → Levenshtein fuzzy | `src/shared/matching.js` → `matchAndCite()` |
| `normalizeText()`: NFC, invisible chars, quotes, dashes, ligatures (fi/fl/ff/ffi/ffl) | `src/shared/matching.js` |
| Wrap-hyphen stripping (`trans- actions` → `transactions`) | `matchAndCite()` on selected text |
| `filterGutterLineNumbers()`: standalone multiples-of-5 (5–65) near column boundary | `src/offscreen/position-map-builder.js` |
| `stripCrossBoundaryText()`: items physically crossing column boundary | `src/offscreen/position-map-builder.js` |
| `extractGutterLineGrid()`: y-to-line-number mapping from gutter markers | `src/offscreen/position-map-builder.js` |
| Levenshtein fuzzy match capped at 100 chars, 80% similarity threshold | `src/shared/matching.js` → `fuzzySubstringMatch()` |

The v2.2 milestone scope: harden the matching pipeline against gutter numbers that slip through upstream filters, and add OCR-aware normalization for character-level confusables and word boundary errors.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features the v2.2 milestone must deliver. Without them the milestone goal (handle OCR-heavy patents like US6324676) is not met.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Gutter-number-tolerant matching | Upstream filters catch most gutter numbers at parse time, but some slip through into the concat string (e.g. when a number appears mid-line or the x-coordinate falls just outside the ±40pt boundary). Without tolerance, citations fail on patents where "60" appears embedded in the selected phrase. | MEDIUM | Strip candidates matching `/\b(5\|10\|15\|20\|25\|30\|35\|40\|45\|50\|55\|60\|65)\b/g` from BOTH the normalized selection and the concat before attempting each strategy. Only applied as a pre-processing step before matching, not to the returned citation text. Depends on the existing multi-strategy cascade. |
| OCR character substitution normalization | Pre-2000 USPTO patents have scanned-and-OCR'd text layers with systematic character confusion: `1`/`l`/`I`, `0`/`O`, `S`/`5`, `rn`/`m`, `cl`/`d`, `vv`/`w`. A user copying from Google Patents HTML gets ground-truth text; the PDF concat has OCR errors. Direct string matching fails. | MEDIUM | Apply a substitution pass to produce an "OCR-normalized" variant of both sides. Run as a new fallback strategy after whitespace-stripped match fails but before bookend. Confidence: 0.85. See implementation notes below. |
| OCR merged-word handling | Google Patents HTML sometimes renders words that the PDF OCR merged: "FPGAuse" in PDF where HTML has "FPGA use". The HTML text the user copies is correct; the PDF concat has the merge. | MEDIUM | After whitespace normalization, try stripping all spaces from the selection and doing a case-insensitive substring match against the whitespace-stripped concat. This is already partly handled by `whitespaceStrippedMatch()` — verify coverage before adding a dedicated step. May only need a targeted test case. |
| OCR split-word handling | PDF OCR inserts spurious spaces: "US ING" instead of "USING". User's HTML selection has the correct word; PDF concat has the split. | MEDIUM | The existing `whitespaceStrippedMatch()` strips all whitespace from both sides, which already handles split words in the concat. The gap is split words in the user selection (less common, but possible on degraded HTML rendering). Verify with test cases. |
| Test coverage for US6324676 and OCR-heavy patents | Without test cases on OCR-heavy patents, changes to the matching pipeline have no regression backstop. The 71-case corpus covers modern patents well; OCR-degraded patents need explicit coverage. | LOW | Add 3–5 test cases from US6324676 (known OCR-heavy) and at least one pre-2000 patent with verified OCR errors. Add to Vitest corpus with golden baseline. |

### Differentiators (Competitive Advantage)

Features that would improve matching quality beyond the minimum, but are not required to achieve the milestone's goal.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Confidence-weighted OCR fallback ordering | OCR normalization should produce a lower confidence score than whitespace-stripped match but higher than Levenshtein fuzzy (which is 0.80 threshold). Assigning 0.85 for OCR-normalized matches surfaces them as yellow (medium confidence) in the UI, giving users appropriate uncertainty feedback on matches that required character substitution. | LOW | Single confidence constant — no algorithm complexity. Depends on OCR normalization feature. |
| Gutter number stripping on concat only (not selection) | The user's HTML-sourced selection should not contain gutter numbers — it is already OCR-free. Only the PDF concat accumulates stray gutter numbers that slip past upstream filters. Applying stripping only to the concat avoids false matches where the user legitimately selects text containing "10" or "25" as part of a sentence. | LOW | Small implementation detail that prevents incorrect matches. Must be verified against test cases with numeric text. |
| Per-pair OCR substitution (not global replace) | Substituting `1`→`l` globally corrupts "1024-bit" → "l024-bit". The correct approach is to treat each OCR confusable pair as a parallel matching attempt: try matching with `1` treated as equivalent to `l`/`I`, not by mutating the strings. A character-class regex approach (`[1lI]`, `[0O]`, `[S5]`, `[m]`→`[rn]`) allows a single regex pass across confusables without destructive substitution. | MEDIUM | Regex approach is safe and reversible. Dictionary-free — does not require language model. Confidence: MEDIUM (community OCR literature, not verified in patent-specific context). |
| Gutter-strip as a reusable utility function | Exposing `stripGutterNumbers(text)` as an exported function in `matching.js` enables unit testing of the strip logic independently from the full `matchAndCite()` cascade. | LOW | Implementation hygiene, no user-facing impact. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem helpful for OCR matching but introduce false-match risk or scope beyond this milestone.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Full OCR post-processing (spell-check / language model correction) | "Fix the PDF text at parse time so it's clean for all subsequent matching" | Requires a dictionary or language model — out of scope for a client-side browser extension. Would corrupt technical terms, chemical names, SEQ IDs, and claim language that is intentionally non-standard. | Apply OCR substitutions only at match time, not to stored concat. Leave the position map text as-is. |
| Running OCR client-side on image PDFs | "Handle the ~2-5% of patents without text layers" | Explicitly out of scope per PROJECT.md. Client-side OCR via Tesseract.js adds ~10 MB to the extension; results are inconsistent and slow. | Flag "no text layer" patents in the UI with red confidence. The existing USPTO fallback via Cloudflare Worker already handles most cases. |
| Detecting and auto-correcting all merged/split words | "Make all OCR errors transparent to the user" | Merged/split word correction without a dictionary has false positive rates of ~15–30% on technical text (per OCR literature). False positives produce wrong citations — worse than a failed match. | Rely on whitespace-stripped matching (which already handles most cases) plus targeted OCR confusable normalization for character-level errors. Restrict scope to confirmed error patterns. |
| Levenshtein fuzzy match on strings >100 chars | "Handle longer selections with OCR errors" | The 100-char cap exists because fuzzy substring matching is O(n²·m) — quadratic in both needle and window size. Removing the cap causes >2s hangs on 200-char selections, blocking the copy event handler. | For longer selections, the bookend strategy already handles most mismatches. OCR normalization as a pre-processing step reduces Levenshtein-dependency for the 5-100 char range. |
| Global case-insensitive normalization for OCR | "OCR often gets capitalization wrong" | Converting everything to lowercase loses disambiguation. "I" (pronoun) vs "l" (lowercase L) vs "1" (digit) all look identical after lowercasing, but are distinct characters in the PDF concat. | Use case-insensitive matching only in the existing whitespace-stripped fallback path, which already does this. For OCR normalization, use character class regex (`[1lI]`) not lowercasing. |
| Fuzzy gutter number matching (e.g., strip numbers that are "near" a multiple of 5) | "Catch gutter numbers like 61 or 59 that are slightly off" | Gutter numbers in USPTO patents are always exact multiples of 5 by specification (37 CFR § 1.52 mandates every-5-line numbering). Fuzzy number matching would strip legitimate occurrences of "61" or "59" in claims text. | Use exact multiple-of-5 matching as already implemented in `filterGutterLineNumbers()`. |

---

## Feature Dependencies

```
[Gutter-number-tolerant matching]
    └──extends──> [matchAndCite() cascade] (existing)
    └──uses──> [filterGutterLineNumbers() logic] (existing, for consistent criteria)

[OCR character substitution normalization]
    └──extends──> [matchAndCite() cascade] (existing)
    └──inserts after──> [whitespaceStrippedMatch()] (existing)
    └──inserts before──> [bookendMatch()] (existing)
    └──uses──> [resolveMatch()] (existing)

[OCR merged-word handling]
    └──may already be covered by──> [whitespaceStrippedMatch()] (existing)
    └──verify before adding──> [dedicated step]

[OCR split-word handling]
    └──covered by──> [whitespaceStrippedMatch()] (existing, both-sides whitespace strip)

[Test coverage for US6324676]
    └──validates──> [Gutter-number-tolerant matching]
    └──validates──> [OCR character substitution normalization]
    └──extends──> [Vitest golden baseline] (existing)

[Confidence-weighted OCR fallback]
    └──requires──> [OCR character substitution normalization]
    └──surfaces via──> [existing confidence → UI color mapping] (green/yellow/red)
```

### Dependency Notes

- **Gutter-tolerant matching is independent of OCR normalization:** Both are matching pre-processing steps that can be implemented and tested separately. They address different failure modes (embedded numbers vs. character confusion).
- **OCR normalization inserts into existing cascade, does not replace:** The cascade order becomes: exact → whitespace-stripped → OCR-normalized → bookend → Levenshtein fuzzy. If whitespace-stripped succeeds, OCR normalization is never reached. If OCR normalization succeeds, bookend is never tried.
- **Merged-word handling may require no new code:** The whitespace-stripped path already removes all spaces from both sides before matching. Verify with a targeted test case (e.g., "FPGAuse" in concat, "FPGA use" in selection) before implementing a separate step. The gap is only if the merge occurs in the user's selection (rare).
- **Test cases must be added before algorithm changes:** Golden baseline tests must be updated to include OCR-heavy patterns before the new matching paths are added. This prevents false passes on stale baselines.

---

## MVP Definition

### Launch With (v2.2 — This Milestone)

Minimum set to harden matching on OCR-heavy patents and validate with test cases.

- [ ] `stripGutterNumbers(text)` utility — strips embedded multiples-of-5 (5–65) from text, exported for unit testing
- [ ] Gutter-number-tolerant matching — apply `stripGutterNumbers()` to both the normalized selection and the concat before each strategy attempt; do NOT mutate the stored concat or the returned citation
- [ ] OCR character substitution normalization — new `ocrNormalizeMatch()` fallback in cascade using character class regex for `[1lI]`, `[0O]`, `[S5]`, `[rn]/[m]`; confidence 0.85; inserted after whitespace-stripped, before bookend
- [ ] Verify merged-word coverage — write test case for `"FPGAuse"` / `"FPGA use"` pattern; confirm whitespace-stripped handles it; add dedicated step only if needed
- [ ] Test cases for US6324676 — minimum 3 test cases covering OCR error patterns confirmed in that patent; golden baseline updated
- [ ] Accuracy maintained at 100% on existing 71-case corpus after changes

### Add After Validation (v2.2.x)

- [ ] Additional OCR-heavy test fixtures — add 2–3 more pre-2000 patents with confirmed OCR errors once US6324676 patterns are characterized
- [ ] Confidence tier review — verify that OCR-normalized matches surface as yellow (not green) in the UI, matching user expectations for degraded-text citations

### Future Consideration (v3.0+)

- [ ] Automatic "OCR-heavy patent" detection — flag patents whose text layer has high confusable-character density; suggest lower confidence baseline to users
- [ ] Statistical confusable profiling per patent — track which OCR substitutions triggered on a per-patent basis; could inform cache warming

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Gutter-number-tolerant matching | HIGH — fixes citation failures on patents where upstream filter misses stray numbers | MEDIUM — pre-processing utility + integration into cascade | P1 |
| OCR character substitution normalization | HIGH — fixes citation failures on pre-2000 and degraded-text patents | MEDIUM — character class regex, cascade insertion | P1 |
| Test cases for US6324676 | HIGH — required to validate both P1 features without regression | LOW — fixture + test case additions | P1 |
| Verify merged-word coverage | MEDIUM — confirms or closes a gap | LOW — single test case check | P1 |
| Confidence-weighted OCR fallback | MEDIUM — surface quality signal to users | LOW — single constant assignment | P1 (free with normalization feature) |
| Gutter-strip as exported utility | LOW — testing hygiene | LOW | P2 |
| Additional OCR-heavy fixtures | MEDIUM — expands regression coverage | LOW–MEDIUM (depends on fixture availability) | P2 |
| OCR-heavy patent auto-detection | LOW — nice UX signal | HIGH — statistical analysis | P3 |

**Priority key:**
- P1: Required for this milestone to meet its stated goal
- P2: Should add when convenient, not blocking v2.2 completion
- P3: Defer to future milestone

---

## Implementation Notes

### Gutter-Number-Tolerant Matching

The existing `filterGutterLineNumbers()` operates at parse time on individual PDF text items by x-coordinate. It cannot catch:
1. Gutter numbers whose x-coordinate falls just outside the ±40pt boundary
2. Numbers concatenated into multi-word items before filtering runs
3. Numbers on pages where the dynamic boundary detection shifts significantly

A matching-time strip is complementary, not redundant. Implementation pattern:

```javascript
// Strip gutter line numbers that slipped into the concat
function stripGutterNumbers(text) {
  // Matches standalone multiples of 5 in range 5-65 at word boundaries
  // Avoids stripping "50%" or "15-20" (not standalone)
  return text.replace(/(?<!\S)(5|10|15|20|25|30|35|40|45|50|55|60|65)(?!\S)/g, ' ')
             .replace(/\s+/g, ' ')
             .trim();
}
```

Apply before each strategy attempt: strip from both `normalizedSelection` and the `concat` variable, then run the strategy. Return results mapped back to the ORIGINAL concat positions (for citation boundary resolution). Do not overwrite the stored `concat` — it is used for `boundaries` mapping.

**Key constraint:** The `boundaries` array maps character positions in the ORIGINAL concat. If the stripped concat is used for position resolution, citation boundaries will be wrong. Either: (a) strip only the selection and use regex to skip over gutter numbers in the concat during indexOf, or (b) build a gutter-stripped concat with a position mapping table (similar to how `whitespaceStrippedMatch()` builds `strippedToOriginal[]`).

Option (b) mirrors the existing architecture and is the correct approach.

### OCR Character Substitution Normalization

OCR confusable pairs documented in OCR literature (HIGH confidence):
- `1` / `l` / `I` — most frequent; vertical strokes with similar shapes
- `0` / `O` — second most frequent; oval shapes
- `S` / `5` — common in typed text; curved top
- `rn` / `m` — two-character merger; adjacent strokes blur together
- `cl` / `d` — two-character merger; curved plus vertical
- `vv` / `w` — two-character merger; overlapping chevrons

For patent PDFs, character-level substitutions are the primary concern (not word-level errors). Merged words (`rn→m`) are two-char substitutions that happen within a single word.

Recommended approach — regex character classes for single-character pairs:

```javascript
function ocrNormalizedMatch(normalized, concat, boundaries, positionMap) {
  // Build OCR-tolerant version by converting selection to a regex
  // that accepts common OCR substitutions at each character position.
  // This avoids destructive string mutation.

  const selEscaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const ocrPattern = selEscaped
    .replace(/[1lI]/g, '[1lI]')
    .replace(/[0O]/g, '[0O]')
    .replace(/[S5]/g, '[S5]')
    // Multi-char pairs handled separately (rn↔m, cl↔d, vv↔w) — skip for now
    // as regex approach for multi-char is complex; Levenshtein handles these
    .replace(/\s+/g, '\\s+');  // allow whitespace variation

  try {
    const re = new RegExp(ocrPattern, 'i');
    const match = concat.match(re);
    if (match && match.index !== undefined) {
      return resolveMatch(match.index, match.index + match[0].length,
                          boundaries, positionMap, 0.85);
    }
  } catch (e) {
    // Pattern too complex or invalid — skip
  }
  return null;
}
```

**Confidence:** MEDIUM. The regex approach is standard for OCR normalization but has not been validated specifically against the patent corpus. The character pairs are HIGH confidence from OCR literature. The regex construction approach needs testing for edge cases (special characters in claims text, sequence IDs, chemical formulas).

**Limitation:** Multi-character OCR pairs (`rn→m`, `cl→d`) require either two-pass regex alternation or Levenshtein. Given that Levenshtein already exists as the last-resort fallback and handles these via edit distance, restricting OCR regex normalization to single-character pairs is sufficient for the milestone.

### Merged vs Split Words

**Merged words (PDF has "FPGAuse", HTML has "FPGA use"):**
The existing `whitespaceStrippedMatch()` strips all whitespace from both the selection and the concat before matching. This already handles merged words in the concat: stripping `"FPGA use"` → `"FPGAuse"` which matches the concat's `"FPGAuse"`. Confidence: HIGH that this case is already handled.

**Split words (PDF has "US ING", HTML has "USING"):**
The existing `whitespaceStrippedMatch()` strips spaces from both sides. The PDF's `"US ING"` → `"USING"` matches the HTML's `"USING"` → `"USING"`. Confidence: HIGH that this case is already handled.

**Recommendation:** Write a targeted test case for `"FPGAuse"` (merged) and `"US ING"` (split) before v2.2 ships. If these pass without new code, close these items as already-handled. Only implement a dedicated step if the test cases fail.

---

## Sources

- [Community History Archives: 100 Common OCR Letter Misinterpretations](https://communityhistoryarchives.com/100-common-ocr-letter-misinterpretations/) — character pair confusables list (MEDIUM confidence, generalized OCR, not patent-specific)
- [Wikipedia: Optical Character Recognition](https://en.wikipedia.org/wiki/Optical_character_recognition) — rn/m, cl/d, vv/w merger errors documented
- [Programming Historian: Cleaning OCR'd Text with Regular Expressions](https://programminghistorian.org/en/lessons/cleaning-ocrd-text-with-regular-expressions) — regex approach for OCR cleanup; character substitution and spacing errors
- [OCR-StringDist (GitHub)](https://github.com/NiklasvonM/ocr-stringdist) — pre-defined OCR confusable pairs: 0/O, 1/l, S/5; learnable weighted Levenshtein
- [Analiticcl (GitHub)](https://github.com/proycon/analiticcl) — approximate string matching for OCR post-correction; anagram hashing approach
- [arXiv: A Simple and Practical Approach to Improve Misspellings in OCR Text (2021)](https://arxiv.org/pdf/2106.12030) — OCR error taxonomy; word split/merge categories
- [ACM: Survey of Post-OCR Processing Approaches](https://dl.acm.org/doi/fullHtml/10.1145/3453476) — comprehensive post-OCR correction literature survey
- [Google Digitized Patent Grants OCR text](https://www.google.com/googlebooks/uspto-patents-grants-ocr.html) — confirms OCR provenance for pre-1980 USPTO patents
- [USPTO 37 CFR § 1.52](https://www.law.cornell.edu/cfr/text/37/1.52) — gutter line numbers every 5 lines is mandatory per regulation; confirms exact multiples-of-5 constraint
- Patent source code: `src/shared/matching.js`, `src/offscreen/position-map-builder.js` — ground truth for existing cascade and filter logic
- Patent test corpus: `tests/test-cases.js`, `tests/fixtures/US6324676.json` — existing fixture presence confirmed

---

*Feature research for: OCR-aware text matching robustness — patent-cite-tool v2.2*
*Researched: 2026-03-04*

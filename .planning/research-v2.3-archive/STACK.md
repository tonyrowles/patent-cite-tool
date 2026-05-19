# Stack Research

**Domain:** OCR-Aware Text Normalization and Gutter-Number-Tolerant Matching for Patent Citation Extension
**Researched:** 2026-03-04
**Confidence:** HIGH — findings are conclusive: no external library is warranted; rationale verified from first principles and npm ecosystem survey

---

## Milestone Context

This document covers ONLY NEW stack additions for v2.2. The following are already validated and must not be re-researched:

- Chrome + Firefox MV3, esbuild pipeline, PDF.js v5, Vitest, Levenshtein fuzzy matching
- `normalizeText` (NFC, invisible chars, quotes, dashes, ligatures), whitespace-stripped matching, bookend matching
- All layers in `matchAndCite`: exact → whitespace-stripped → bookend → fuzzy

The target features for v2.2:
1. **Gutter-number-tolerant matching** — strip stray gutter line numbers (multiples of 5 in range 5–65) that slip through the existing gutter contamination filter during the matching phase
2. **OCR-aware normalization** — collapse common OCR character confusions (1↔l↔I, 0↔O, rn↔m, 5↔S) as a fallback matching tier for patents with degraded text layers (test case: US6324676)

---

## Recommended Stack

### Core Technologies

No new frameworks or build tools are needed. Both features are pure algorithmic additions to `src/shared/matching.js`.

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Existing `matching.js` | (in-repo) | Implementation home for both new features | Self-contained pure functions, no browser APIs, already imported by all entry points; adding functions here means Chrome + Firefox both benefit automatically via esbuild bundling |
| Existing Vitest | ^3.0.0 | Test new normalization and gutter-stripping logic | Already configured; unit tests for pure functions run in <1s; golden baseline will catch regressions |

### Supporting Libraries — Verdict: None Required

The npm ecosystem was surveyed for three candidate library categories:

**OCR post-correction libraries:**
Libraries like Tesseract.js, scribe.js, node-tesseract-ocr, and @gutenye/ocr-node are OCR *engines* — they run OCR on images. This project's constraint (PROJECT.md "Out of Scope") explicitly excludes client-side OCR. The patent PDFs already have a text layer; the problem is that the text layer has noise, not that OCR needs to be run. None of these libraries address post-correction of an existing noisy text string.

**Unicode confusable character libraries (`confusables` 1.1.1, `unicode-confusables` 0.1.1, `confusables.js`):**
These libraries implement Unicode UTS#39 confusables — a broad homoglyph table covering thousands of Unicode characters used for security (anti-phishing, anti-spoofing). The OCR confusion problem in patent PDFs is a much narrower problem: a fixed set of ~6 well-known optical confusion pairs (1/l/I, 0/O, rn/m, 5/S, 8/B, c/e). Importing a 107KB Unicode confusables table to handle 6 pairs is unjustified. Additionally, these libraries have not been updated in over a year and are not actively maintained.

**Text normalization libraries (`normalize-text`, `normalize-strings`):**
General-purpose diacritic/whitespace normalizers. Do not address OCR character confusion. Already handled by the existing `normalizeText` function for the relevant cases (NFC, ligatures).

**Conclusion:** The correct approach is a handcrafted OCR confusion map (5–10 lines) implemented as a new function `normalizeOCR(text)` in `matching.js`. This is exactly the pattern recommended in the OCR correction literature for post-hoc correction of known systematic substitutions.

### Development Tools

No changes to the development toolchain. All existing tooling (esbuild, Vitest, web-ext, GitHub Actions CI) works unchanged.

---

## Implementation Approach

### Feature 1: Gutter-Number-Tolerant Matching

**Where:** New function or inline logic in `matchAndCite` in `src/shared/matching.js`.

**Mechanism:** After all existing match tiers fail, produce a second `gutterStripped` variant of the concat by removing occurrences of isolated integers that are multiples of 5 in the range 5–65 (the patent gutter line number range). Then re-run the whitespace-stripped match against the stripped concat.

**Pattern:** `\b(5|10|15|20|25|30|35|40|45|50|55|60|65)\b` applied to the concat (not to the selection — the user's selection comes from the HTML rendering which does not include gutter numbers).

**Why regex over library:** The gutter number set is small, fixed, and well-understood. A regex is 20 characters; no library covers this domain-specific problem.

### Feature 2: OCR-Aware Normalization

**Where:** New function `normalizeOCR(text)` in `src/shared/matching.js`, called as an additional fallback tier in `matchAndCite` after gutter-stripped matching fails.

**Mechanism:** Apply a character-level collapse that maps known optically confused characters to a canonical form, then attempt whitespace-stripped match on the resulting string. The collapse is applied to BOTH the selection and the concat symmetrically (unlike the gutter-strip which is only applied to the concat).

**Canonical confusion map (confirmed by OCR literature):**

| OCR confusion | Collapse to | Confidence level in existing match tiers |
|---------------|-------------|------------------------------------------|
| `1`, `l`, `I` | `1` | Distinct characters; exact/fuzzy won't catch this |
| `0`, `O` | `0` | Common in early USPTO scans (pre-2000 patents) |
| `rn` → `m` | handled by normalizing `rn` sequence | Word-level; string replacement before match |
| `5`, `S` | `5` | Less critical in specification text |

**Implementation pattern:**

```javascript
export function normalizeOCR(text) {
  return text
    .replace(/[lI]/g, '1')   // l, I → 1
    .replace(/O/g, '0')       // O → 0
    .replace(/rn/g, 'm');     // rn → m (merging artifact)
}
```

Apply both to concat and to selection before matching; report confidence 0.85 (below bookend 0.92, above the 0.80 fuzzy floor) so the UI shows yellow — appropriate for an OCR-corrected match.

**Why not weighted Levenshtein with a confusion matrix:** The existing `levenshtein()` function uses uniform edit costs. Weighted Levenshtein (lower cost for OCR-likely substitutions) is a known technique but requires O(n²) per window even with cost tuning. The existing fuzzy matcher is already capped at 100 chars for this reason. A normalized-string exact match is faster and more predictable than a weighted distance approach for the narrow OCR problem.

---

## Installation

```bash
# No new npm packages needed.
# Both features are implemented in src/shared/matching.js.
```

**package.json remains unchanged:**

```json
{
  "devDependencies": {
    "esbuild": "^0.27.3",
    "pdfjs-dist": "^5.5.207",
    "sharp": "^0.34.5",
    "vitest": "^3.0.0",
    "web-ext": "^9.4.0"
  }
}
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Handcrafted OCR confusion map (6 substitution rules) | `confusables` npm 1.1.1 | Only if the problem were Unicode homoglyph spoofing across thousands of codepoints. Overkill for 6 well-known OCR pairs; adds 107KB with no maintenance activity. |
| Handcrafted OCR confusion map | Weighted Levenshtein (confusion matrix) | Only if the character set were large and unknown. For a fixed set of 6 substitutions, explicit normalization + exact match is faster, more readable, and yields a more reliable confidence score. |
| Regex gutter number strip | Token-based gutter detection | If gutter numbers appeared mid-word or in non-standard positions. For patent PDFs, gutter numbers are isolated integers between word tokens — regex is sufficient. |
| In-repo pure function | External OCR post-correction library | No JS library exists that targets this exact problem (post-correction of pre-existing text-layer noise with known OCR pairs). Python options (e.g., `cltk`, `postcorrection`) are irrelevant in a browser extension context. |

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `confusables` (npm 1.1.1) | 107KB for a problem solvable with 6 regex replacements; unmaintained; UTS#39 scope is Unicode homoglyphs, not OCR character confusion | Handcrafted `normalizeOCR` function |
| `unicode-confusables` (npm 0.1.1) | Same rationale as above; 105KB; last published over a year ago | Handcrafted `normalizeOCR` function |
| Tesseract.js / scribe.js / any OCR engine | These run OCR on images; project constraint explicitly excludes client-side OCR; patents already have a text layer | Nothing — the text layer exists, only normalization is needed |
| `fastest-levenshtein` (npm 1.0.16) | Project already has an in-repo `levenshtein` implementation; this milestone does not require improving Levenshtein throughput (new features use pre-normalization + exact match, not fuzzy) | Existing `levenshtein` in `matching.js` |
| LLM-based OCR correction | Requires network call, latency incompatible with synchronous silent mode, API key management complexity, cost | Handcrafted normalization + existing fuzzy fallback |

---

## Stack Patterns by Variant

**If a patent's text layer is clean (modern USPTO):**
- Existing exact → whitespace-stripped → bookend → fuzzy pipeline handles it
- New tiers never activate; no performance impact (tier is only reached after all prior tiers fail)

**If a patent has stray gutter numbers in concat (pre-2000 USPTO, scanned grants):**
- Gutter-stripped concat variant activates as tier 5
- Strips isolated multiples of 5 in range 5–65
- Returns match with confidence 0.90

**If a patent has OCR character confusions (degraded text layer, US6324676-class):**
- OCR normalization activates as tier 6
- Both selection and concat are collapsed through `normalizeOCR` before whitespace-stripped match
- Returns match with confidence 0.85 (UI shows yellow — appropriate for degraded source)

**Tier ordering in `matchAndCite` after v2.2:**
1. Exact normalized (confidence 1.0)
2. Whitespace-stripped (confidence 0.97–0.99)
3. Bookend (confidence 0.92, only for len > 60)
4. Fuzzy Levenshtein (confidence 0.80+, only for len ≤ 100)
5. Gutter-stripped whitespace match (confidence 0.90) — NEW
6. OCR-normalized whitespace match (confidence 0.85) — NEW

---

## Version Compatibility

| Component | Version | Compatible With | Notes |
|-----------|---------|-----------------|-------|
| `src/shared/matching.js` | (in-repo) | esbuild 0.27.x, Vitest 3.x | Pure JS, no browser APIs, no imports — bundled correctly by IIFE and ESM esbuild targets |
| New `normalizeOCR` export | N/A | All existing consumers | matchAndCite callers (offscreen, background, content) call matchAndCite; normalizeOCR is internal — no interface changes needed |
| Gutter strip regex | N/A | V8 (Chrome), SpiderMonkey (Firefox) | Simple `\b(5|10|...|65)\b` — no lookahead, no Unicode flags, compatible with all targets |

---

## Sources

- npm registry: `confusables@1.1.1` — 0 dependencies, 107.9KB, published over a year ago (LOW maintenance signal; confirmed via `npm info`)
- npm registry: `unicode-confusables@0.1.1` — 0 dependencies, 105.3KB, published over a year ago (LOW maintenance signal; confirmed via `npm info`)
- [communityhistoryarchives.com: Common OCR Letter Misinterpretations](https://communityhistoryarchives.com/100-common-ocr-letter-misinterpretations/) — character confusion pairs 1/l/I, 0/O, rn/m, 5/S, 8/B confirmed (MEDIUM confidence — community source, corroborated by academic literature)
- [arxiv.org: OCR Error Correction Using Character Correction (1604.06225)](https://arxiv.org/pdf/1604.06225) — character confusion matrices; approach of character-level normalization before string match is standard technique (MEDIUM confidence — academic paper, pre-training-cutoff)
- [imagetext.site: Troubleshooting Common OCR Errors](https://imagetext.site/articles/troubleshooting-ocr-errors.html) — O/0, I/l/1, S/5, Z/2 confirmed as primary confusion pairs in technical/legal documents (MEDIUM confidence)
- PROJECT.md (in-repo) — "Out of Scope: Running OCR on patents" constraint; defines target patent US6324676 for OCR-heavy validation (HIGH confidence — authoritative project record)
- `src/shared/matching.js` (in-repo) — existing normalizeText, matchAndCite, levenshtein code reviewed; integration points for new tiers confirmed (HIGH confidence — source of truth)

---

*Stack research for: Patent Citation Tool v2.2 — Matching Robustness (OCR-Aware Normalization + Gutter-Number Tolerance)*
*Researched: 2026-03-04*

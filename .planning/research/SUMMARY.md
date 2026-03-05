# Project Research Summary

**Project:** Patent Citation Tool v2.2 — Matching Robustness
**Domain:** OCR-aware text normalization and gutter-number-tolerant matching for a browser extension
**Researched:** 2026-03-04
**Confidence:** HIGH

## Executive Summary

This milestone is a targeted algorithmic extension to an already-working patent citation browser extension. The v2.1 pipeline correctly handles modern USPTO patents through a four-tier cascade (exact → whitespace-stripped → bookend → Levenshtein fuzzy), but fails on two specific failure modes: stray gutter line numbers that slip past the upstream spatial filter and land in the matching concat, and OCR character confusions (1/l/I, 0/O, rn/m) in pre-2000 scanned patents whose text layers were OCR'd. The v2.2 scope is precisely bounded: add `normalizeOcr` as a Tier 0b preprocessing step and `gutterTolerantMatch` as a new Tier 5 fallback, both in `src/shared/matching.js`, with no new npm dependencies, no new files, and no changes to the extension's API surface.

The recommended implementation approach follows from the architecture of the existing cascade: OCR normalization is applied before the cascade (Tier 0b) so all downstream tiers benefit automatically from character-level cleanup, while gutter stripping is a last-resort Tier 5 fallback that only activates when all other tiers fail. The primary test vehicle is patent US6324676, which has a known degraded text layer. Both features are pure JavaScript functions in a single file, tested via the existing Vitest corpus and the 71-case golden baseline.

The dominant risk is false positives, not missed new cases. Gutter number stripping can destroy legitimate patent text ("at least 5 blocks", chemical measurement values), and aggressive OCR character substitution can collapse distinct tokens. Both risks are mitigated by strict anchoring (gutter strip applies only to space-isolated standalone integers; OCR substitution avoids globally overloaded characters 1/l/I and 0/O), confidence ceilings that force yellow UI for these matches (capped at 0.85), and the hard constraint that the existing 71-case corpus must pass at identical tier and confidence values after every change.

---

## Key Findings

### Recommended Stack

No new npm packages are needed. The npm ecosystem was surveyed for OCR post-correction libraries and Unicode confusable character libraries; none address the specific problem. Existing OCR engine packages (Tesseract.js, scribe.js) run OCR on images and are irrelevant — the patents already have a text layer. Unicode confusables packages (107KB) address homoglyph spoofing across thousands of codepoints, not the ~6 well-known optical confusion pairs in scanned patent text. The correct approach is a handcrafted normalization function of 5–10 regex replacements.

**Core technologies:**
- `src/shared/matching.js` (in-repo): Implementation home for both new features — pure functions, no browser APIs, bundled automatically for Chrome and Firefox by the existing esbuild pipeline
- Vitest ^3.0.0 (existing): Unit tests for new pure functions run under 1 second; 71-case golden baseline catches regressions on every change

**What not to add:**
- `confusables` npm 1.1.1: 107KB, unmaintained, wrong problem domain (Unicode homoglyph spoofing, not OCR confusion)
- Any OCR engine library (Tesseract.js, scribe.js): wrong abstraction; project constraint excludes client-side OCR
- Weighted Levenshtein with confusion matrix: overkill for 6 known substitutions; pre-normalization + exact match is faster and more predictable

### Expected Features

The v2.2 milestone adds two categories of features, both required to achieve the goal of handling OCR-heavy patents like US6324676.

**Must have (table stakes):**
- Gutter-number-tolerant matching — fixes citation failures where upstream spatial filter misses stray line numbers that land in the matching concat
- OCR character substitution normalization — fixes citation failures on pre-2000 patents with systematic character confusion in scanned text layers
- Test cases for US6324676 — required regression anchor; minimum 3 cases covering confirmed OCR error patterns in that patent
- Verify merged/split-word coverage — confirm whitespace-stripped match already handles "FPGAuse"/"FPGA use" patterns before adding a dedicated step

**Should have (differentiators):**
- Confidence-weighted OCR fallback (0.85) — surfaces OCR-matched citations as yellow, giving users appropriate uncertainty feedback; costs nothing once normalization feature exists
- `stripGutterNumbers` exported as a testable utility — testing hygiene, no user-facing impact

**Defer (v2.2.x / v3.0+):**
- Additional OCR-heavy test fixtures beyond US6324676 — add after initial validation is complete
- Automatic OCR-heavy patent detection — high implementation cost (statistical analysis), low urgency
- Levenshtein fuzzy match on strings over 100 characters — O(n²) cost; bookend strategy already handles long selections

**Anti-features (explicitly excluded):**
- Full OCR post-processing via language model — corrupts technical terms; incompatible with browser extension constraints
- Client-side OCR via Tesseract.js — explicitly out of scope per PROJECT.md; adds ~10MB to the extension
- Global case-insensitive normalization for OCR — loses disambiguation between I/l/1 in patent identifiers
- Fuzzy gutter number matching (near-multiples of 5) — USPTO mandates exact every-5-line numbering per 37 CFR § 1.52; fuzzy stripping would destroy "61" in claims text

### Architecture Approach

All changes are confined to `src/shared/matching.js`. Three coordinated additions implement both features: (1) a `normalizeOcr` function applying prose-safe OCR corrections (rn→m, cl→d, additional quote/hyphen variants) as Tier 0b preprocessing to both the user selection and the concat; (2) a `buildConcat` function factored out from the existing inline loop in `matchAndCite`, which calls `normalizeOcr` internally so all subsequent tiers operate on OCR-normalized text without per-tier changes; (3) a `gutterTolerantMatch` function as Tier 5 that strips space-isolated multiples of 5 (5–65) from the concat, rebuilds character boundaries, then retries exact and whitespace-stripped matching with confidence capped at 0.85.

**Major components:**
1. `normalizeOcr(text)` — new exported function; applies prose-safe OCR confusion corrections; called on selection and on each positionMap entry via `buildConcat`; does NOT touch alphanumeric identifiers (1/l/I and 0/O excluded from global substitution due to identifier collision risk)
2. `buildConcat(positionMap)` — refactored extract from `matchAndCite`'s inline loop; returns `{ concat, boundaries }`; applies `normalizeOcr` internally; required by `gutterTolerantMatch` to avoid duplicating wrap-hyphen detection logic
3. `gutterTolerantMatch(normalized, concat, boundaries, positionMap, contextBefore, contextAfter)` — new Tier 5 fallback; strips `/ (5|10|15|20|25|30|35|40|45|50|55|60|65) /g` (space-anchored) from concat; rebuilds boundaries for stripped concat; retries exact + whitespace-stripped; caps confidence at 0.85

**Tier ordering after v2.2:**

| Tier | Strategy | Confidence | UI Color |
|------|----------|------------|----------|
| 0b | OCR normalization (preprocessing) | Inherits from matching tier | — |
| 1 | Exact | 1.00 | Green |
| 2 | Whitespace-stripped | 0.96–0.99 | Green |
| 3 | Bookend | 0.92 | Green |
| 4 | Fuzzy Levenshtein | 0.80+ | Yellow/Green |
| 5 | Gutter-tolerant (NEW) | 0.85 | Yellow |

**Files modified:** `src/shared/matching.js`, `tests/unit/text-matcher.test.js`, `tests/test-cases.js`, `tests/golden/baseline.json` (regenerated after manual citation verification). No other files change.

### Critical Pitfalls

1. **Gutter strip destroying legitimate patent text** — Never apply the strip without whitespace isolation on both sides. Numbers like "at least 5 blocks" or "60/056,785" (provisional application numbers) would be corrupted by a naive global regex. Use space-anchored pattern: `/ (5|10|...|65) /g`. Stricter guard: only strip when `entry.text.trim()` equals exactly the number (true signature of a standalone missed gutter marker). Run the full 71-case corpus — especially chemical patents US9688736 and US10472384 — before and after every change; all must pass at the same tier.

2. **OCR normalization creating false positive matches** — In a precision-critical legal context (column:line citations in patent filings), a false positive is worse than a failed match. Apply normalization only as Tier 0b preprocessing; cap confidence at 0.85 for any match that required OCR correction; add a minimum-length guard (no OCR path for selections under 20 characters); restrict global substitutions to prose-safe pairs (rn→m, cl→d) — never add 1/l/I or 0/O as global substitutions.

3. **Inserting new steps at the wrong position in the cascade** — The cascade is position-dependent; a new strategy inserted before bookend intercepts selections that would report confidence 0.92, downgrading them to 0.85. OCR normalization must be Tier 0b and gutter-tolerant matching must be Tier 5. After every change, verify the `afterAll` accuracy metrics: exact match count must not decrease; no tier downgrades for existing passing cases.

4. **Premature golden baseline update** — Never regenerate `tests/golden/baseline.json` immediately after algorithm changes. For new US6324676 test cases, determine expected column:line values by reading the printed patent in Google Patents PDF viewer before running the algorithm. Only update the baseline after manual verification; `git diff baseline.json` should show only additions, never modifications to the existing 71 entries.

5. **Modifying `normalizeText` with OCR substitutions** — `normalizeText` is applied to both the needle and the haystack (positionMap entries). Adding alphanumeric substitutions corrupts the `boundaries` array used by `resolveMatch` for position mapping and breaks `extractPrintedColumnNumbers`. OCR substitutions must live in a separate `normalizeOcr` function, never inside `normalizeText`.

---

## Implications for Roadmap

The research points to a clean 3-phase implementation ordered strictly by dependency and regression risk.

### Phase 1: Foundation — normalizeOcr + buildConcat Refactor

**Rationale:** OCR normalization is the lowest-risk change (pure preprocessing, cheap, idempotent) and is a prerequisite for validating that the concat-building refactor is safe. The `buildConcat` extraction is required before `gutterTolerantMatch` can be implemented without code duplication. Establishing this foundation with zero regressions is the critical gate before Phase 2 adds Tier 5 complexity.
**Delivers:** `normalizeOcr` and `buildConcat` exported from `matching.js`; `matchAndCite` refactored to call `buildConcat` and apply `normalizeOcr` at Tier 0b; all 71 existing test cases pass at identical tier and confidence values
**Addresses:** Table-stakes feature: OCR character substitution normalization (prose-safe subset); merged/split-word coverage verification
**Avoids:** Anti-pattern of modifying `normalizeText` (Pitfall 5); anti-pattern of running two separate full pipelines (Architecture Anti-Pattern 3); confidence inflation from cascade position errors (Pitfall 3)

### Phase 2: Gutter-Tolerant Matching — Tier 5 Implementation

**Rationale:** Depends on the stable `buildConcat` from Phase 1. `gutterTolerantMatch` needs a stripped variant of the same concat that `matchAndCite` uses; without `buildConcat`, the only option is duplicating the complex wrap-hyphen detection loop. Isolated unit tests for the function before adding corpus-level cases validates the space-anchor pattern before it can interact with the 71-case baseline.
**Delivers:** `gutterTolerantMatch` as Tier 5 with confidence ceiling 0.85; space-anchored strip pattern; all 71 existing cases unaffected (Tier 5 only fires when Tiers 1–4 fail)
**Addresses:** Table-stakes feature: gutter-number-tolerant matching
**Avoids:** Gutter strip destroying legitimate patent text (Pitfall 1); conflicts with upstream position-map filtering (Pitfall 5); confidence inflation on gutter-tolerant matches (Architecture Anti-Pattern 4)

### Phase 3: Validation — US6324676 Test Cases + Golden Baseline Update

**Rationale:** End-to-end validation with the problem patent comes last, after the implementation is confirmed correct on isolated unit tests. The golden baseline is updated only after manual citation verification against the printed patent. Cross-browser build verification (`npm run build` + grep of dist files) confirms the new exports are available in both Chrome and Firefox bundles.
**Delivers:** 3–5 new test cases for US6324676 passing via Tiers 0b or 5; updated `tests/golden/baseline.json` (additions only, no modifications to existing 71 entries); full CI green on Chrome and Firefox builds
**Addresses:** Table-stakes feature: test coverage for US6324676; confidence-weighted OCR fallback verified in the UI (yellow for 0.85 matches)
**Avoids:** Premature golden baseline update (Pitfall 4); new fixture citations without manual verification (PITFALLS integration gotcha)

### Phase Ordering Rationale

- **Phase 1 before Phase 2:** `gutterTolerantMatch` needs `buildConcat` as a stable shared helper; the refactor must be proven regression-free before Phase 2 builds on top of it
- **Phases 1 and 2 before Phase 3:** Corpus test cases for US6324676 are added only after isolated unit tests confirm the algorithm is correct; this prevents the golden baseline from encoding in-progress behavior
- **OCR normalization as Tier 0b, not a cascade tier:** Preprocessing once is architecturally cleaner and cheaper than a second full cascade pass; all four existing matching tiers benefit without modification; confidence is inherited naturally from whichever tier resolves the match
- **Gutter stripping as Tier 5, not preprocessing:** Unlike OCR normalization (symmetric, low false-positive risk), gutter stripping is asymmetric (concat only) and has non-trivial false-positive risk on legitimate numbers in patent text; last-resort placement minimizes incorrect matches

### Research Flags

Phases with standard patterns (skip `/gsd:research-phase`):
- **Phase 1 (normalizeOcr + buildConcat):** Pure refactor of existing code plus a small new function; all integration points and implementation sketches are fully documented in ARCHITECTURE.md; no external dependencies or unknowns
- **Phase 2 (gutterTolerantMatch):** Boundary rebuild pattern mirrors existing `whitespaceStrippedMatch` position-mapping approach; anti-patterns explicitly documented; no ambiguity in approach
- **Phase 3 (validation):** Standard golden-baseline workflow; test-case structure already established by the 71-case corpus

Phases that may need targeted investigation during execution (not blocking but watch for):
- **Phase 2 (gutter strip anchor at concat boundaries):** The space-isolation pattern `/ (N) /g` handles numbers flanked by spaces, but numbers at the very start or end of the concat string are flanked by string boundaries. Verify the anchor handles concat edge cases correctly with a targeted unit test before integrating.
- **Phase 3 (US6324676 OCR pair scope):** Whether the prose-safe subset of `normalizeOcr` (rn→m, cl→d) is sufficient to fix US6324676, or whether bounded 1/l/I substitutions are also needed, will only be known after inspecting the actual patent's failure modes. If Phase 3 reveals gaps, the `normalizeOcr` scope may need a targeted expansion with word-boundary guards.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Verified by direct npm registry survey on 2026-03-04; no viable external library exists; conclusion from first principles confirmed by project constraints in PROJECT.md |
| Features | HIGH (existing codebase) / MEDIUM (OCR pairs) | Existing codebase is ground truth for what is already handled; OCR character pair list corroborated by multiple independent sources; specific pairs needed for US6324676 require Phase 3 validation to confirm scope is sufficient |
| Architecture | HIGH | Based on direct analysis of live codebase source files; all integration points, build-order dependencies, and anti-patterns identified from reading actual source code; no external unknowns |
| Pitfalls | HIGH | Derived from direct codebase analysis with specific test case references (US9688736, US10472384, US5959167) that would reveal regressions; chemical and numbered-reference categories are the concrete regression sentinels |

**Overall confidence:** HIGH

### Gaps to Address

- **OCR character pair scope for US6324676:** The initial `normalizeOcr` implements only prose-safe pairs (rn→m, cl→d). Whether this is sufficient to resolve US6324676 failures or whether bounded 1/l/I substitutions (with word-boundary guards) are also needed will be confirmed in Phase 3. If Phase 3 validation reveals patterns the initial scope misses, scope expansion is low risk because the patterns are well-understood from OCR literature.

- **Gutter strip anchor at string boundaries:** The space-isolation guard strips numbers flanked by spaces. Numbers at the very start or end of the assembled concat have string boundaries on one side. This is a Phase 2 unit-test task; address with a targeted test case for a positionMap whose first or last entry is a bare gutter number.

- **Merged-word coverage (FPGAuse / FPGA use):** FEATURES.md recommends a targeted test case before v2.2 ships to confirm existing `whitespaceStrippedMatch` already handles this. This is a Phase 1 verification task; if the test passes without new code, close the item. Only implement a dedicated step if the test fails.

---

## Sources

### Primary (HIGH confidence)
- `src/shared/matching.js` (in-repo) — ground truth for current cascade, existing `normalizeText` contract, integration points for new functions
- `src/offscreen/position-map-builder.js` (in-repo) — upstream gutter filtering logic, `filterGutterLineNumbers` criteria and x-coordinate tolerance
- `tests/unit/text-matcher.test.js` (in-repo) — golden baseline workflow, confidence calibration structure, `afterAll` accuracy summary
- `tests/test-cases.js` (in-repo) — 71-case corpus; chemical (US9688736, US10472384) and numbered-reference (US5959167) cases identified as regression sentinels
- `tests/fixtures/US6324676.json` (in-repo) — confirmed as the primary OCR validation patent
- `.planning/PROJECT.md` (in-repo) — v2.2 milestone goals, out-of-scope constraints, target patent US6324676
- [USPTO 37 CFR § 1.52](https://www.law.cornell.edu/cfr/text/37/1.52) — confirms exact every-5-line gutter number mandate; no fuzzy stripping of near-multiples warranted

### Secondary (MEDIUM confidence)
- [Community History Archives: 100 Common OCR Letter Misinterpretations](https://communityhistoryarchives.com/100-common-ocr-letter-misinterpretations/) — OCR character confusion pairs (1/l/I, 0/O, S/5, rn/m confirmed; community source, not patent-specific)
- [arXiv 1604.06225: OCR Error Correction Using Character Correction](https://arxiv.org/pdf/1604.06225) — character-level normalization before string match is standard OCR post-correction technique
- [arXiv 2106.12030: A Simple and Practical Approach to Improve Misspellings in OCR Text](https://arxiv.org/pdf/2106.12030) — OCR error taxonomy; word split/merge categories
- [ACM: Survey of Post-OCR Processing Approaches](https://dl.acm.org/doi/fullHtml/10.1145/3453476) — comprehensive post-OCR correction literature
- [imagetext.site: Troubleshooting Common OCR Errors](https://imagetext.site/articles/troubleshooting-ocr-errors.html) — O/0, I/l/1, S/5 confirmed as primary confusion pairs in technical/legal documents
- [Google Digitized Patent Grants OCR text](https://www.google.com/googlebooks/uspto-patents-grants-ocr.html) — confirms OCR provenance for pre-1980 USPTO patents

### Tertiary (LOW confidence)
- npm registry: `confusables@1.1.1`, `unicode-confusables@0.1.1` — surveyed and excluded; unmaintained, wrong problem scope (Unicode homoglyph spoofing, not OCR character confusion)

---

*Research completed: 2026-03-04*
*Ready for roadmap: yes*

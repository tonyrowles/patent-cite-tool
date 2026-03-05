# Pitfalls Research

**Domain:** Adding OCR-aware matching and gutter-number-tolerant matching to an existing fuzzy text matching system
**Researched:** 2026-03-04
**Confidence:** HIGH — based on direct codebase analysis of matching.js, position-map-builder.js, and the 71-case golden baseline corpus

---

## Critical Pitfalls

### Pitfall 1: Gutter Number Stripping That Destroys Legitimate Patent Text

**What goes wrong:**
Any matching-phase strip applied to the concat string has no spatial context — it only sees character sequences. The number "5" or "15" appearing inside a sentence is indistinguishable from a stray gutter artifact unless the stripping is carefully anchored. A patent claim saying "at least 5 blocks of memory" contains "5" which is a multiple of 5 in the range 5-65. A naive strip removes it and the selection "at least 5 blocks" produces no match where it previously succeeded. Chemical patents are particularly at risk: sequences like "Ser-Gln-Gly-Thr-Phe-Thr" span multiple lines, and numbers in the range 5-65 appear regularly in molecular weights, concentration values, and structural formulas.

**Why it happens:**
The upstream `filterGutterLineNumbers` in `position-map-builder.js` strips gutter numbers based on x-coordinate proximity to the column boundary — it has spatial context. A matching-phase strip applied to the concat string (`matchAndCite`) has none of that context. The position-map-builder already does context-aware stripping for items it can positively identify; any matching-phase strip is a second pass with less information, applied to items that survived the first pass for good reason.

**How to avoid:**
- Apply gutter stripping ONLY to PositionMap entries known to be contaminated, not to the assembled concat string.
- If a matching-phase strip is necessary (for patents where the upstream filter missed artifacts), the pattern must require whitespace isolation on BOTH sides: the number must be preceded by whitespace and followed by whitespace. Pattern: `/(?<=\s)(5|10|15|20|25|30|35|40|45|50|55|60|65)(?=\s)/g`.
- Do not strip numbers adjacent to non-space characters. "at least 5 blocks" has " 5 " with spaces — borderline. "US6,324,676" has no spaces — safe. A stricter guard: require the entire PositionMap entry's text to be ONLY the number (the entire `entry.text` trimmed is the number). This is the actual pattern for a genuine missed gutter marker — a standalone "15" as a complete PositionMap entry.
- Cross-reference the existing `filterGutterLineNumbers` logic in `position-map-builder.js`: the matching-phase strip should use identical criteria for what constitutes a gutter marker.

**Warning signs:**
- Any test case in the 71-case corpus that includes a number in the range 5-65 in `selectedText` begins failing after the change is introduced.
- Chemical test cases (`US9688736-chemical-*`, `US10472384-chemical-claims`) regress from "exact" to "no-match".
- `US5440748-spec-long` (selectedText contains "for ex ample, a register") or claims cases containing numbered items fail.
- Test cases with numbers like "60/056,785" (provisional application number in `US5959167-spec-long`) begin failing.

**Phase to address:**
Phase 1 (gutter-tolerant matching implementation). The strip anchoring must be designed and unit-tested in isolation before integrating into `matchAndCite`.

---

### Pitfall 2: OCR Normalization Creating False Positive Matches

**What goes wrong:**
OCR normalization substitutes character variants (1↔l↔I, 0↔O) before comparing needle to haystack. Applied too broadly, two different words collapse to the same normalized form. In a patent matching context, false positives are more damaging than false negatives: the system reports a confident citation for the wrong location in a legal document. An attorney files the wrong column:line in patent prosecution. The existing confidence system (1.0 = green, 0.92+ = yellow, <0.80 = red) relies on confidence values being calibrated — a false positive at confidence 0.99 shows green and gets silently used.

**Why it happens:**
OCR normalization increases recall (finds matches that were missed). In a precision-critical context, the correct tradeoff inverts. The existing `whitespaceStrippedMatch` already applies case-insensitive fallback (confidence 0.98) — this handles the most common OCR-like case error. Adding additional character-level substitutions risks collapsing distinct tokens: "l00k" → "look", "lOl" → "lol", "1it" → "lit". For short patent phrases, these collisions are unlikely but not impossible.

**How to avoid:**
- Apply OCR normalization ONLY as a late-stage fallback, after all existing strategies (exact, whitespace-stripped, punctuation-agnostic, bookend, Levenshtein) have failed. Never allow it to intercept matches that would succeed via earlier, more precise tiers.
- Cap OCR-normalized match confidence at 0.85 or lower. The UI threshold for yellow is currently ~0.92; an OCR match capped at 0.85 will always show yellow, signaling uncertainty to the user.
- Restrict substitutions to the most reliable OCR confusions: `l↔1`, `I↔1`, `O↔0`. Do NOT add `s↔S` as a substitution — lowercasing both sides (already done in the case-insensitive fallback) already handles case errors.
- Apply substitutions symmetrically to BOTH sides (needle and haystack), so the comparison is of normalized forms against normalized forms.
- Add a minimum-length guard: do not apply OCR normalization to selections shorter than 20 characters. Short selections have too little discriminating content after substitution to produce reliable matches.

**Warning signs:**
- Test cases that previously produced "no-match" begin producing citations, but the citation is wrong when checked against the patent PDF.
- Two different test cases with different `selectedText` values produce the same citation — a collision caused by over-normalization.
- High-confidence matches (>= 0.95) appear in the corpus output for cases that were previously no-match, without a corresponding known-good improvement.
- The `high-conf correct` ratio in the afterAll accuracy summary decreases after the change.

**Phase to address:**
Phase 1 (OCR normalization implementation). The confidence ceiling and minimum-length guard must be designed before any corpus baseline is updated.

---

### Pitfall 3: Inserting New Steps at the Wrong Position in the Matching Cascade

**What goes wrong:**
The existing `matchAndCite` cascade is deliberately ordered: exact (conf 1.0) → whitespace-stripped (conf 0.99-0.97) → bookend (conf 0.92) → Levenshtein fuzzy (conf 0.80-0.99). Each tier has a calibrated confidence score. Adding a new strategy at the wrong position causes previously-passing test cases to match via the new strategy at a lower confidence score instead of the original strategy at the correct score. The citation may be correct, but the reported confidence changes — affecting the UI color shown to the user and potentially breaking confidence-related assertions in tests.

**Why it happens:**
The cascade is position-dependent. A new strategy inserted before `bookendMatch` may intercept selections that the bookend match would have handled correctly, reporting confidence 0.85 instead of 0.92. More dangerously: a new strategy inserted before `whitespaceStrippedMatch` may intercept selections that were exact matches, reporting confidence 0.85 where confidence 0.99 was correct.

**How to avoid:**
- Insert gutter-tolerant matching as a preprocessing step on the PositionMap entries BEFORE building the concat, not as a separate matching tier. This way, the existing cascade sees a cleaned concat and the tier order is preserved exactly.
- Insert OCR normalization as the LAST fallback step — after the existing `fuzzySubstringMatch` fails, try OCR-normalized whitespace-stripped matching. This is the only safe insertion point.
- Do not modify the signatures or return values of existing cascade steps.
- After any change to `matchAndCite`, run the full corpus test and compare the accuracy metrics output (the `afterAll` console summary) with the pre-change baseline — the exact match count must not decrease.

**Warning signs:**
- Previously "exact" tier corpus results become "systematic" or "boundary" after the change (confidence changed but citation is still technically correct).
- The confidence value in `GOLDEN` for a passing test case no longer matches the returned confidence (if confidence is part of the golden entry, this triggers a diff).
- The `afterAll` summary shows the same or higher "close accuracy" but lower "exact accuracy" — indicating matches were intercepted by a new tier at lower confidence.

**Phase to address:**
Phase 1 (adding new steps to `matchAndCite`). The insertion point must be explicit in the implementation plan before any code is written.

---

### Pitfall 4: Premature Golden Baseline Update

**What goes wrong:**
The golden baseline at `tests/golden/baseline.json` is the regression anchor for 71 test cases. If the baseline is regenerated after algorithm changes but BEFORE the new citations are manually verified against the actual patent PDFs, the baseline encodes false positives. Once committed, those false positives are invisible — the test suite passes with 100% accuracy, but the accuracy is against a wrong baseline. The "100% accuracy" metric becomes meaningless.

**Why it happens:**
It is tempting to run a baseline regeneration script to "make tests green" after algorithm changes. This is only correct when the algorithm improvement is verified against known-good citations. New test cases for US6324676 (the OCR-heavy target patent) do not have established golden citations — those must be determined by manual inspection of the printed patent before the algorithm runs.

**How to avoid:**
- Treat the existing 71-case baseline as FROZEN through all algorithm development in this milestone.
- For any new test cases (US6324676 additions), determine the expected `column:line` citation by examining the actual patent text on Google Patents (the printed column numbers and line numbers are visible in the PDF viewer) BEFORE running the algorithm.
- Only update the baseline after: (1) algorithm changes are complete, (2) new citations are manually verified, (3) the test suite produces those verified citations.
- Consider a CLI flag requirement for baseline regeneration (`node scripts/generate-baseline.js --accept`) to prevent accidental regeneration.

**Warning signs:**
- The baseline regeneration script is run immediately after algorithm changes without a manual verification step documented in the commit message or plan.
- `git diff tests/golden/baseline.json` shows modifications to existing test case entries (not just additions of new entries).
- The test suite shows 0 failures immediately after a significant algorithm change — this is suspicious unless the change was carefully scoped.
- New baseline entries differ from what the printed patent shows for column:line numbers.

**Phase to address:**
Phase 3 (validation and new test case addition). The verification workflow must be documented before the baseline is touched.

---

### Pitfall 5: Matching-Phase Gutter Strip Conflicts with Upstream Position-Map Filtering

**What goes wrong:**
`position-map-builder.js` already filters gutter numbers via `filterGutterLineNumbers` and `stripCrossBoundaryText`. These operate at parse time with x-coordinate context. If the matching phase adds a second round of stripping on the assembled concat string, the two filters interact unpredictably. For patents where upstream filtering worked correctly, the second-pass strip has nothing to do and is harmless. But for patents where upstream partially worked, the second-pass strip may over-correct — removing numbers that represent real content which survived the first pass because they were NOT near the column boundary.

**Why it happens:**
The upstream filter is position-based. The matching-phase filter is text-based only. A number like "15" in the middle of a sentence looks identical in pure text whether it was originally near the column boundary (a gutter artifact that survived) or whether it is a legitimate measurement value. The second filter cannot distinguish these cases.

**How to avoid:**
- Prefer to fix incomplete upstream filtering (improve `filterGutterLineNumbers` criteria) rather than adding a downstream filter.
- If a downstream filter is added, tag PositionMap entries at parse time to indicate residual contamination risk (`hasResidualGutterNumber: true`) when they meet the criteria but were not removed by the upstream filter. Apply the matching-phase strip ONLY to tagged entries.
- The matching-phase strip should only apply to entries where `entry.text.trim()` is EXACTLY the number (the entire entry text is the gutter marker). This is the actual signature of a missed standalone gutter marker, not a number embedded in substantive text.

**Warning signs:**
- Chemical patent test cases (`US9688736`, `US10472384`) regress after adding matching-phase gutter stripping.
- The position-map-builder unit tests (`tests/unit/position-map-builder.test.js`) still pass but corpus tests for chemical or repetitive categories fail.
- Test cases with numbered lists, patent references, or formulas containing numbers 5-65 begin failing.

**Phase to address:**
Phase 1 (gutter-tolerant matching scoping decision). The scope must be decided before implementation begins: fix upstream vs. add downstream, and if downstream, exactly what the entry-level criterion is.

---

### Pitfall 6: Modifying `normalizeText` to Add OCR Substitutions

**What goes wrong:**
`normalizeText` is called in two places in `matchAndCite`: once on the user's selected text, and once on each PositionMap entry's text when building the concat string. If OCR substitutions are added to `normalizeText`, they apply to BOTH sides — the needle and the haystack. The haystack (concat built from the PDF's PositionMap entries) is the authoritative source of truth; altering it with OCR substitutions corrupts position-boundary calculations. For example, normalizing "0" to "O" in a page-header line number like "10" makes it "1O", breaking the existing `extractPrintedColumnNumbers` patterns. It also corrupts the `boundaries` array used by `resolveMatch` to map character positions back to PositionMap entries.

**Why it happens:**
`normalizeText` is the obvious place to add new character normalization — it already normalizes quotes, dashes, and ligatures. Developers adding OCR normalization extend the existing function rather than creating a new one. But the existing transformations in `normalizeText` are safe because they are symmetric and do not affect alphanumeric characters used for position boundary calculations.

**How to avoid:**
- Create a separate `ocrNormalizeText` function that is called ONLY on the needle (the user's selection), never on the haystack or on PositionMap entry text.
- Never modify `normalizeText` with substitutions that affect alphanumeric characters. The current `normalizeText` only changes: invisible chars, smart quotes, em-dashes, and ligatures (all non-alphanumeric transformations).
- The OCR substitution step should be isolated in the matching function, applied to the normalized needle only, immediately before the matching attempt.

**Warning signs:**
- Position-boundary mapping in `resolveMatch` begins returning wrong entries after the change — `startEntry` and `endEntry` are off by one or more positions.
- The `extractPrintedColumnNumbers` function in position-map-builder begins misidentifying column numbers.
- Test cases that previously produced exact matches begin producing citations in wrong columns.
- Unit tests for `normalizeText` in `tests/unit/shared-matching.test.js` require updating to account for new behavior — this is a signal the function's contract changed.

**Phase to address:**
Phase 1 (OCR normalization implementation). The function separation must be a hard constraint before any code is written.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Apply OCR normalization by modifying `normalizeText` | Simpler code — one function to modify | Corrupts concat haystack; breaks position-boundary mapping; changes the contract used by all callers | Never |
| Apply gutter strip globally to the concat string via regex | Simple one-liner | Destroys legitimate numbers in patent text; false no-matches; hard to debug | Never without whitespace-isolation anchoring |
| Regenerate golden baseline immediately after algorithm changes | Tests go green | Silent false positives encoded forever; 100% accuracy metric becomes meaningless | Never during active algorithm development |
| Set OCR-normalized match confidence to same level as exact match (1.0) | Simplifies confidence logic | Users see green for potentially wrong citations; legal risk | Never |
| Add OCR normalization before the bookend match in the cascade | OCR-cleaned needle improves bookend match quality | Intercepts bookend-eligible selections, reporting lower confidence than they deserve | Never — OCR must be after all existing tiers |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Golden baseline update workflow | Run baseline regeneration script immediately after algorithm changes | Manually verify affected citations against the actual patent PDF first; update baseline only after manual confirmation |
| position-map-builder + matching phase | Adding gutter stripping in both phases over-corrects for patents where upstream worked correctly | Matching-phase strip should only target entries where `entry.text.trim()` equals the number exactly — standalone missed markers only |
| OCR normalization + Levenshtein fallback | OCR-normalized needle has artificially low Levenshtein distance to wrong matches, reporting high confidence | Apply OCR normalization as a separate cascade step with its own confidence ceiling of 0.85, not as pre-processing for Levenshtein |
| New test fixtures (US6324676) + existing corpus | Adding new test cases without verifying expected citations may encode wrong golden values | Open the patent in Google Patents PDF viewer, identify the printed column and line numbers for the selected text, enter those as the expected golden citation before running the algorithm |
| Cross-browser builds (Chrome + Firefox) | Adding a new exported function to `matching.js` without verifying `matching-exports.js` re-exports it | Both `dist/chrome/matching-exports.js` and `dist/firefox/matching-exports.js` must include the new function; verify with `npm run build` and grep the dist files |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| OCR normalization rebuilds a normalized concat on every `matchAndCite` call | Repeated selections on the same patent (silent mode fires on every mouseup) are slow | Pre-compute the OCR-normalized concat once per patent load, cache alongside the regular concat | Immediately noticeable in silent mode which calls `matchAndCite` on every mouseup event |
| Matching-phase gutter strip applied to the concat string by regex on every call | Repeated calls rebuild the stripped concat | Pre-strip gutter-contaminated entries at PositionMap construction time, not at match time | Any patent with many columns and repeated user selections |
| Extending `fuzzySubstringMatch` with OCR substitutions inside the O(n*m) Levenshtein loop | Already capped at needle length <= 100 to prevent hangs; extending the inner loop with substitutions adds constant factor | OCR normalization must be a pre-processing step on the needle, not an extension of the Levenshtein core | Any selection where the Levenshtein cap is not hit (needle <= 100 chars); visible as increased CI test time |

---

## Security Mistakes

*Not applicable to this matching algorithm milestone — no new external services, credentials, or network calls are introduced.*

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| OCR-normalized matches reported with green confidence (>= 0.95) | User silently uses a potentially wrong citation in a legal filing | Cap OCR-normalized match confidence at 0.85 (yellow); user sees the uncertainty indicator and can verify manually |
| Gutter-tolerant matching that partially strips text reported with confidence 1.0 | User sees green for a match that used a modified version of the concat | Any match using a modified/stripped concat should report confidence <= 0.95 to indicate the modification was needed |
| No distinction in the UI between "exact match" and "matched after OCR normalization" | User cannot tell which matches were uncertain | Existing yellow/red confidence indicators handle this if confidence thresholds are set correctly; do not change the visual design |

---

## "Looks Done But Isn't" Checklist

- [ ] **Legitimate number safety:** Run the full 71-case corpus test before and after the gutter-strip change. Every test case that includes a number in the range 5-65 in `selectedText` must still pass with the same tier (exact/systematic/boundary).
- [ ] **Chemical patent safety:** Test cases `US9688736-chemical-short`, `US9688736-chemical-long`, `US9688736-chemical-seq`, `US10472384-chemical-claims` all pass with "exact" tier after the change.
- [ ] **OCR confidence ceiling:** Unit tests for OCR-normalized matching must assert `result.confidence <= 0.85`. Verify no OCR-path match returns confidence >= 0.95.
- [ ] **`normalizeText` contract preserved:** The function accepts and returns strings; its behavior on the existing test inputs in `tests/unit/shared-matching.test.js` is unchanged. No new character substitutions added to this function.
- [ ] **Cascade order preserved:** The `matchAndCite` function in `matching.js` has its existing steps in the same order — new OCR step is after the `fuzzySubstringMatch` block.
- [ ] **Baseline not modified for existing cases:** `git diff tests/golden/baseline.json` shows only additions (new entries for US6324676 test cases), no modifications to existing 71 entries.
- [ ] **New fixture citations verified:** Column:line values for each new US6324676 golden entry have been manually confirmed against the printed patent in Google Patents PDF viewer.
- [ ] **Cross-browser build integrity:** `npm run build` completes without errors; the new function name is present in both `dist/chrome/` and `dist/firefox/` outputs.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Gutter strip destroys legitimate text; existing cases regress | MEDIUM | Revert the strip to require whitespace isolation on both sides; re-run corpus; identify which cases still fail; iterate on the anchoring pattern until all 71 original cases pass |
| Golden baseline updated with false positives | HIGH | `git checkout tests/golden/baseline.json` to restore from git; manually verify each new entry against the actual patent PDF; regenerate only the new entries after verification |
| OCR normalization creates false positives with high confidence | MEDIUM | Add or lower confidence ceiling to 0.85; re-run corpus; verify that the new OCR path does not fire on the 71 existing cases (they should still match via earlier tiers) |
| Cascade order broken; systematic confidence degradation | LOW | Restore `matchAndCite` step order from git diff; re-run corpus; use `afterAll` accuracy metrics to confirm exact match count is restored |
| `normalizeText` modified with OCR substitutions; concat corrupted | HIGH | Revert `normalizeText` changes; move OCR substitutions to a new `ocrNormalizeText` function applied only to the needle; rebuild and re-test |
| Chemical test cases fail from number stripping | LOW | Add entry-level criterion: only strip PositionMap entries where `entry.text.trim()` is exactly the number (no surrounding text); re-test chemical cases |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Gutter strip destroys legitimate text | Phase 1: gutter-tolerant matching implementation | Full 71-case corpus passes; chemical and numbered-claim categories pass with "exact" tier |
| OCR normalization false positives | Phase 1: OCR normalization implementation | Confidence of any OCR-path match is <= 0.85; unit tests assert this ceiling |
| Cascade insertion at wrong position | Phase 1: adding new steps to `matchAndCite` | `afterAll` accuracy summary shows same or higher exact match count; no tier downgrades for existing cases |
| Premature golden baseline update | Phase 3: validation and new test case addition | `git diff tests/golden/baseline.json` shows only additions; no modifications to existing 71 entries |
| Matching-phase strip conflicts with upstream filtering | Phase 1: gutter-tolerant matching scoping | Chemical and repetitive corpus categories pass; position-map-builder unit tests unaffected |
| `normalizeText` modified with OCR substitutions | Phase 1: OCR normalization implementation | `normalizeText` unit tests unchanged; `ocrNormalizeText` is a separate function |
| Short-selection false positives from OCR normalization | Phase 1: OCR normalization minimum-length guard | Unit tests with selections < 20 chars do not trigger OCR path; assert via test spy or conditional log |
| New fixture citations not manually verified | Phase 3: new test case addition | Each new golden entry has a corresponding manual-verification note (commit message or plan); entry values match what the patent PDF shows |

---

## Sources

- Direct analysis of `/home/fatduck/patent-cite-tool/src/shared/matching.js` — existing cascade order, confidence values, `normalizeText` contract, guards on `fuzzySubstringMatch`
- Direct analysis of `/home/fatduck/patent-cite-tool/src/offscreen/position-map-builder.js` — `filterGutterLineNumbers`, `stripCrossBoundaryText`, `extractGutterLineGrid` — upstream filtering already in place with x-coordinate context
- Direct analysis of `/home/fatduck/patent-cite-tool/tests/unit/text-matcher.test.js` — golden baseline comparison workflow, confidence calibration structure, `afterAll` accuracy summary
- Direct analysis of `/home/fatduck/patent-cite-tool/tests/test-cases.js` — 71-case corpus; identified chemical (`US9688736`, `US10472384`) and numbered-reference (`US5959167-spec-long`) cases that contain numbers in the 5-65 range
- Direct analysis of `/home/fatduck/patent-cite-tool/tests/helpers/classify-result.js` — tier classification; how regressions manifest in the accuracy summary
- Direct analysis of `/home/fatduck/patent-cite-tool/.planning/PROJECT.md` — v2.2 milestone goals: gutter-number-tolerant matching, OCR normalization, US6324676 target patent, 100% accuracy preservation requirement

---
*Pitfalls research for: OCR-aware matching and gutter-number-tolerant matching additions to an existing patent citation fuzzy matching system*
*Researched: 2026-03-04*
*Milestone: v2.2 Matching Robustness*

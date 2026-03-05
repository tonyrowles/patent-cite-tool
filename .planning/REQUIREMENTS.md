# Requirements: Patent Citation Tool

**Defined:** 2026-03-04
**Core Value:** Highlight text on Google Patents, get an accurate citation reference instantly — no PDF downloading, no manual counting.

## v2.2 Requirements

Requirements for matching robustness milestone. Each maps to roadmap phases.

### Matching

- [ ] **MATCH-01**: Matching pipeline tolerates stray gutter line numbers (multiples of 5, 5–65) in concat text by stripping them as a Tier 5 fallback when Tiers 1–4 fail, with confidence capped at 0.85 (yellow UI)
- [x] **MATCH-02**: Common OCR character confusions (case errors like s→S, bigram substitutions like rn→m, cl→d) are normalized before the matching cascade via a dedicated `normalizeOcr` function applied to both selection and concat
- [x] **MATCH-03**: Concat-building logic is extracted from `matchAndCite` into a shared `buildConcat` helper returning `{concat, boundaries}`, integrating `normalizeOcr` internally

### Validation

- [ ] **VALID-01**: US6324676 has 3–5 test cases covering confirmed OCR error patterns, with manually verified expected citations added to the golden baseline
- [ ] **VALID-02**: Merged words (`FPGAuse`→`FPGA use`) and split words (`US ING`→`USING`) are verified as handled by existing whitespace-stripped matching — dedicated step added only if tests fail

## Future Requirements

### Extended OCR Coverage

- **OCR-01**: Additional OCR-heavy test fixtures beyond US6324676
- **OCR-02**: Automatic OCR-heavy patent detection (statistical analysis of text layer quality)
- **OCR-03**: Bounded 1/l/I and 0/O substitutions with word-boundary guards (if US6324676 validation reveals need)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Full OCR post-processing via language model | Corrupts technical terms; incompatible with browser extension constraints |
| Client-side OCR via Tesseract.js | Explicitly out of scope per PROJECT.md; adds ~10MB to extension |
| Global case-insensitive normalization for OCR | Loses disambiguation between I/l/1 in patent identifiers |
| Fuzzy gutter number matching (near-multiples of 5) | USPTO mandates exact every-5-line numbering per 37 CFR § 1.52 |
| Weighted Levenshtein with confusion matrix | Overkill for ~6 known substitutions; pre-normalization + exact match is faster |
| Levenshtein fuzzy match on strings over 100 chars | O(n²) cost; bookend strategy already handles long selections |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| MATCH-01 | Phase 21 | Pending |
| MATCH-02 | Phase 20 | Complete |
| MATCH-03 | Phase 20 | Complete |
| VALID-01 | Phase 22 | Pending |
| VALID-02 | Phase 22 | Pending |

**Coverage:**
- v2.2 requirements: 5 total
- Mapped to phases: 5
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-04*
*Last updated: 2026-03-04 after roadmap creation — all 5 requirements mapped*

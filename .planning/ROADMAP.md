# Roadmap: Patent Citation Tool

## Milestones

- ✅ **v1.0 MVP** — Phases 1-4 (shipped 2026-03-02)
- ✅ **v1.1 Silent Mode + Infrastructure** — Phases 5-7 (shipped 2026-03-03)
- ✅ **v1.2 Store Polish + Accuracy Hardening** — Phases 8-13 (shipped 2026-03-03)
- ✅ **v2.0 Firefox Port** — Phases 14-17 (shipped 2026-03-05)
- ✅ **v2.1 CI/CD Pipeline** — Phases 18-19 (shipped 2026-03-05)
- [ ] **v2.2 Matching Robustness** — Phases 20-22 (in progress)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-4) — SHIPPED 2026-03-02</summary>

- [x] **Phase 1: Extension Foundation and PDF Fetch** (2/2 plans) — completed 2026-02-28
- [x] **Phase 2: PDF Parsing Pipeline** (2/2 plans) — completed 2026-03-01
- [x] **Phase 3: Text Matching and Citation Generation** (3/3 plans) — completed 2026-03-01
- [x] **Phase 4: Citation Output** (1/1 plan) — completed 2026-03-02

Full details: `.planning/milestones/v1.0-ROADMAP.md`

</details>

<details>
<summary>✅ v1.1 Silent Mode + Infrastructure (Phases 5-7) — SHIPPED 2026-03-03</summary>

- [x] **Phase 5: Silent Mode** (2/2 plans) — completed 2026-03-02
- [x] **Phase 6: USPTO API Fallback** (3/3 plans) — completed 2026-03-02
- [x] **Phase 7: Server-side Cache** (3/3 plans) — completed 2026-03-03

Full details: `.planning/milestones/v1.1-ROADMAP.md`

</details>

<details>
<summary>✅ v1.2 Store Polish + Accuracy Hardening (Phases 8-13) — SHIPPED 2026-03-03</summary>

- [x] **Phase 8: Test Harness Foundation** (3/3 plans) — completed 2026-03-03
- [x] **Phase 9: Accuracy Audit and Algorithm Fixes** (2/2 plans) — completed 2026-03-03
- [x] **Phase 10: Icon Set and Manifest Updates** (2/2 plans) — completed 2026-03-03
- [x] **Phase 11: Options Page Polish** (2/2 plans) — completed 2026-03-03
- [x] **Phase 12: Store Listing and Submission** (2/2 plans) — completed 2026-03-03
- [x] **Phase 13: Offscreen Wrap-Hyphen Fix** (1/1 plan) — completed 2026-03-03

Full details: `.planning/milestones/v1.2-ROADMAP.md`

</details>

<details>
<summary>✅ v2.0 Firefox Port (Phases 14-17) — SHIPPED 2026-03-05</summary>

- [x] **Phase 14: Shared Code Extraction** (2/2 plans) — completed 2026-03-04
- [x] **Phase 15: esbuild Build Pipeline** (3/3 plans) — completed 2026-03-04
- [x] **Phase 16: Firefox Extension** (3/3 plans) — completed 2026-03-04
- [x] **Phase 17: Cross-Browser Validation** (2/2 plans) — completed 2026-03-05

Full details: `.planning/milestones/v2.0-ROADMAP.md`

</details>

<details>
<summary>✅ v2.1 CI/CD Pipeline (Phases 18-19) — SHIPPED 2026-03-05</summary>

- [x] **Phase 18: Core CI Workflow** (1/1 plan) — completed 2026-03-05
- [x] **Phase 19: CI Hardening** (1/1 plan) — completed 2026-03-05

Full details: `.planning/milestones/v2.1-ROADMAP.md`

</details>

### v2.2 Matching Robustness (Phases 20-22)

- [x] **Phase 20: OCR Normalization and Concat Refactor** - Extract buildConcat, add normalizeOcr as Tier 0b preprocessing (completed 2026-03-05)
- [x] **Phase 21: Gutter-Tolerant Matching** - Add gutterTolerantMatch as Tier 5 fallback with confidence ceiling (completed 2026-03-05)
- [x] **Phase 22: Validation and Golden Baseline** - Add US6324676 test cases and verify merged/split-word coverage (completed 2026-03-05)

## Phase Details

### Phase 20: OCR Normalization and Concat Refactor
**Goal**: The matching pipeline preprocesses both user selections and patent concat text through OCR normalization, so character-level OCR confusions no longer prevent citations from resolving
**Depends on**: Phase 19 (v2.1 — CI green baseline)
**Requirements**: MATCH-02, MATCH-03
**Success Criteria** (what must be TRUE):
  1. A selection containing `rn` or `cl` OCR confusion patterns resolves to the correct citation when the concat has the true characters (e.g., `rn`→`m` correction enables the match)
  2. All 71 existing golden baseline cases pass at the same tier and confidence values as before the change — zero regressions
  3. `buildConcat` is exported from `src/shared/matching.js` and returns `{ concat, boundaries }` — `matchAndCite` calls it rather than inlining the loop
  4. `normalizeOcr` is exported from `src/shared/matching.js` and applied to both the selection and the positionMap entries inside `buildConcat` before any matching tier runs
**Plans:** 2/2 plans complete
Plans:
- [ ] 20-01-PLAN.md — TDD: normalizeOcr function, buildConcat extraction, matchAndCite rewire
- [ ] 20-02-PLAN.md — Wire OCR normalization into matchAndCite cascade with confidence penalty

### Phase 21: Gutter-Tolerant Matching
**Goal**: Citations succeed on patents where stray gutter line numbers (multiples of 5, range 5-65) slipped past the upstream spatial filter and landed in the concat text
**Depends on**: Phase 20
**Requirements**: MATCH-01
**Success Criteria** (what must be TRUE):
  1. A selection that previously failed all of Tiers 1-4 due to embedded gutter numbers in the concat now resolves via Tier 5 with confidence reported as 0.85 (yellow UI indicator)
  2. Selections from chemical patents (US9688736, US10472384) that contain numbers legitimately in patent text are not incorrectly stripped — all 71 existing baseline cases pass unchanged
  3. `gutterTolerantMatch` uses a space-anchored strip pattern so only space-isolated standalone multiples of 5 are removed, not numbers embedded in measurement values or patent identifiers
**Plans:** 1/1 plans complete
Plans:
- [ ] 21-01-PLAN.md — TDD: stripGutterNumbers + gutterTolerantMatch as Tier 5 with cascade replay

### Phase 22: Validation and Golden Baseline
**Goal**: The US6324676 OCR-heavy patent is covered by verified test cases in the golden baseline, and merged/split-word handling is confirmed or extended
**Depends on**: Phase 21
**Requirements**: VALID-01, VALID-02
**Success Criteria** (what must be TRUE):
  1. 3-5 new test cases for US6324676 pass via Tiers 0b or 5, with manually verified expected column:line values matching what the printed patent shows in Google Patents PDF viewer
  2. The updated `tests/golden/baseline.json` shows only additions — `git diff` reveals no modifications to any of the 71 existing entries
  3. Merged-word pattern (e.g., `FPGAuse` vs `FPGA use`) and split-word pattern (e.g., `US ING` vs `USING`) are confirmed handled by whitespace-stripped matching via a targeted test case, or a dedicated handling step is added if the test fails
  4. Full CI passes on both Chrome and Firefox builds after all baseline additions
**Plans:** 1/1 plans complete
Plans:
- [ ] 22-01-PLAN.md — Add 4 validated test cases (3 US6324676 OCR/split-word + 1 synthetic gutter) to golden baseline, update spot-check script, full CI validation

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Extension Foundation and PDF Fetch | v1.0 | 2/2 | Complete | 2026-02-28 |
| 2. PDF Parsing Pipeline | v1.0 | 2/2 | Complete | 2026-03-01 |
| 3. Text Matching and Citation Generation | v1.0 | 3/3 | Complete | 2026-03-01 |
| 4. Citation Output | v1.0 | 1/1 | Complete | 2026-03-02 |
| 5. Silent Mode | v1.1 | 2/2 | Complete | 2026-03-02 |
| 6. USPTO API Fallback | v1.1 | 3/3 | Complete | 2026-03-02 |
| 7. Server-side Cache | v1.1 | 3/3 | Complete | 2026-03-03 |
| 8. Test Harness Foundation | v1.2 | 3/3 | Complete | 2026-03-03 |
| 9. Accuracy Audit and Algorithm Fixes | v1.2 | 2/2 | Complete | 2026-03-03 |
| 10. Icon Set and Manifest Updates | v1.2 | 2/2 | Complete | 2026-03-03 |
| 11. Options Page Polish | v1.2 | 2/2 | Complete | 2026-03-03 |
| 12. Store Listing and Submission | v1.2 | 2/2 | Complete | 2026-03-03 |
| 13. Offscreen Wrap-Hyphen Fix | v1.2 | 1/1 | Complete | 2026-03-03 |
| 14. Shared Code Extraction | v2.0 | 2/2 | Complete | 2026-03-04 |
| 15. esbuild Build Pipeline | v2.0 | 3/3 | Complete | 2026-03-04 |
| 16. Firefox Extension | v2.0 | 3/3 | Complete | 2026-03-04 |
| 17. Cross-Browser Validation | v2.0 | 2/2 | Complete | 2026-03-05 |
| 18. Core CI Workflow | v2.1 | 1/1 | Complete | 2026-03-05 |
| 19. CI Hardening | v2.1 | 1/1 | Complete | 2026-03-05 |
| 20. OCR Normalization and Concat Refactor | 2/2 | Complete    | 2026-03-05 | — |
| 21. Gutter-Tolerant Matching | 1/1 | Complete    | 2026-03-05 | — |
| 22. Validation and Golden Baseline | 1/1 | Complete   | 2026-03-05 | — |

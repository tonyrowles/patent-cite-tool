# Roadmap: Patent Citation Tool

## Milestones

- ✅ **v1.0 MVP** — Phases 1-4 (shipped 2026-03-02)
- ✅ **v1.1 Silent Mode + Infrastructure** — Phases 5-7 (shipped 2026-03-03)
- ✅ **v1.2 Store Polish + Accuracy Hardening** — Phases 8-13 (shipped 2026-03-03)
- ✅ **v2.0 Firefox Port** — Phases 14-17 (shipped 2026-03-05)
- ✅ **v2.1 CI/CD Pipeline** — Phases 18-19 (shipped 2026-03-05)
- ✅ **v2.2 Matching Robustness** — Phases 20-22 (shipped 2026-03-05)
- 🚧 **v2.3 Post-v2.2 Hardening** — Phases 23-25 (active)

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

<details>
<summary>✅ v2.2 Matching Robustness (Phases 20-22) — SHIPPED 2026-03-05</summary>

- [x] **Phase 20: OCR Normalization and Concat Refactor** (2/2 plans) — completed 2026-03-05
- [x] **Phase 21: Gutter-Tolerant Matching** (1/1 plan) — completed 2026-03-05
- [x] **Phase 22: Validation and Golden Baseline** (1/1 plan) — completed 2026-03-05

Full details: `.planning/milestones/v2.2-ROADMAP.md`

</details>

### v2.3 Post-v2.2 Hardening (Phases 23-25) — ACTIVE

- [x] **Phase 23: Column Inference for Headerless PDFs** — ACCY-04, ACCY-05 (completed 2026-05-12)
- [ ] **Phase 24: Firefox AMO Validation Cleanup** — FOX-06
- [ ] **Phase 25: Automatic Release Workflow** — CICD-04

## Phase Details

### Phase 23: Column Inference for Headerless PDFs
**Goal**: The citation tool produces correct column numbers for granted patents whose PDFs omit printed column headers, with cache invalidation ensuring all users re-parse with the new logic.
**Depends on**: Phase 22 (Golden Baseline — regression protection for any accuracy change)
**Requirements**: ACCY-04, ACCY-05
**Success Criteria** (what must be TRUE):
  1. Running the test suite against US10203551 (the trigger case) returns correct column numbers — no more impossible values like column 203.
  2. Column number results fall within a structurally validated upper bound (≤200) derived from the patent's actual page/column layout, not an arbitrary cap.
  3. When a patent PDF has no printed column headers, the tool infers column numbers from structural cues (page geometry, line density) rather than failing or returning garbage values.
  4. The CACHE_VERSION constant is bumped (v2 → v3) so a user who previously cached a stale position map re-parses automatically on next use — the old map is not served.
  5. All 75 existing golden baseline cases continue to pass after the inference change (zero regressions).
**Plans**: 3 plans
Plans:
- [x] 23-01-PLAN.md — Verify structural validators & add guard tests for column-inference invariants
- [x] 23-02-PLAN.md — Verify CACHE_VERSION='v3' invariant, add static-grep guard test, bump Firefox manifest to 2.3.0
- [x] 23-03-PLAN.md — US10203551 integration fixture, regenerated golden baseline (75→76), full regression run

### Phase 24: Firefox AMO Validation Cleanup
**Goal**: The Firefox dist passes `web-ext lint` with zero AMO-blocking errors or warnings, making the extension submission-ready for the Firefox Add-ons store.
**Depends on**: Phase 17 (Firefox Extension — the dist being linted)
**Requirements**: FOX-06
**Success Criteria** (what must be TRUE):
  1. Running `web-ext lint` against the Firefox dist exits with a zero return code and prints no errors.
  2. Running `web-ext lint` against the Firefox dist prints no AMO-blocking warnings (those that would cause automatic rejection during review).
  3. The CI test step `test:lint` passes in GitHub Actions, confirming lint clean status is enforced on every push.
**Plans**: TBD

### Phase 25: Automatic Release Workflow
**Goal**: Pushing a `v*` semver tag to the repository automatically triggers a GitHub Actions workflow that builds both browser dists and attaches them to a published GitHub Release — no manual upload step required.
**Depends on**: Phase 18 (Core CI Workflow — release workflow builds on the same infrastructure)
**Requirements**: CICD-04
**Success Criteria** (what must be TRUE):
  1. Pushing a `v*` tag (e.g., `v2.3.0`) to `main` triggers a new GitHub Actions workflow run — the workflow is not a manual step.
  2. The workflow builds Chrome and Firefox dists and attaches the resulting ZIPs as downloadable assets on the corresponding GitHub Release.
  3. A GitHub Release entry appears automatically (draft or published) for the pushed tag, with release notes derived from the tag or workflow.
  4. The release workflow is independent of the CI push workflow — a tag push does not interfere with normal branch CI runs.
**Plans**: TBD

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
| 20. OCR Normalization and Concat Refactor | v2.2 | 2/2 | Complete | 2026-03-05 |
| 21. Gutter-Tolerant Matching | v2.2 | 1/1 | Complete | 2026-03-05 |
| 22. Validation and Golden Baseline | v2.2 | 1/1 | Complete | 2026-03-05 |
| 23. Column Inference for Headerless PDFs | v2.3 | 3/3 | Complete    | 2026-05-12 |
| 24. Firefox AMO Validation Cleanup | v2.3 | 0/? | Not started | - |
| 25. Automatic Release Workflow | v2.3 | 0/? | Not started | - |

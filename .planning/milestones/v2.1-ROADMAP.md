# Roadmap: Patent Citation Tool

## Milestones

- ✅ **v1.0 MVP** — Phases 1-4 (shipped 2026-03-02)
- ✅ **v1.1 Silent Mode + Infrastructure** — Phases 5-7 (shipped 2026-03-03)
- ✅ **v1.2 Store Polish + Accuracy Hardening** — Phases 8-13 (shipped 2026-03-03)
- ✅ **v2.0 Firefox Port** — Phases 14-17 (shipped 2026-03-05)
- 🚧 **v2.1 CI/CD Pipeline** — Phases 18-19 (in progress)

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

### v2.1 CI/CD Pipeline (In Progress)

**Milestone Goal:** Automate build, test, and packaging via GitHub Actions so every push and PR is validated and store-ready ZIPs are produced as downloadable artifacts.

- [x] **Phase 18: Core CI Workflow** - End-to-end GitHub Actions pipeline: triggers, dependency install, build, test, packaging, and artifact upload (completed 2026-03-05)
- [x] **Phase 19: CI Hardening** - Security and reliability hardening: concurrency group and least-privilege permissions (completed 2026-03-05)

## Phase Details

### Phase 18: Core CI Workflow
**Goal**: Every push and PR triggers a GitHub Actions run that installs dependencies, builds both browser targets, runs the full 71-case test suite, and uploads store-ready Chrome and Firefox ZIPs as downloadable artifacts
**Depends on**: Phase 17 (v2.0 complete — esbuild pipeline and npm test scripts exist)
**Requirements**: CICD-01, CICD-02, CICD-03, PKG-01, PKG-02, PKG-03, HARD-02
**Success Criteria** (what must be TRUE):
  1. Pushing a commit to any branch triggers a GitHub Actions run visible in the Actions tab
  2. Opening or updating a PR targeting main triggers a GitHub Actions run with pass/fail status check
  3. The Actions run shows four individually named test steps (test:src, test:chrome, test:firefox, test:lint) with per-suite pass/fail visibility — no log inspection required
  4. A passing run produces two downloadable artifacts (patent-cite-chrome.zip and patent-cite-firefox.zip) with manifest.json at the zip root
  5. A test failure causes the run to fail and no artifacts are produced
**Plans:** 1/1 plans complete
Plans:
- [x] 18-01-PLAN.md — CI workflow creation with pre-flight validation and GitHub verification

### Phase 19: CI Hardening
**Goal**: The CI workflow resists misuse and resource waste — stale in-progress runs are cancelled on new pushes to the same branch, and the workflow requests only the minimum repository permissions required
**Depends on**: Phase 18
**Requirements**: HARD-01, HARD-03
**Success Criteria** (what must be TRUE):
  1. Pushing two commits in quick succession to a PR branch cancels the first in-progress run before the second run completes
  2. The workflow YAML declares `permissions: contents: read` and no broader permission grants appear in the job or step blocks
  3. Push commits directly to main are never cancelled by the concurrency group (each main-branch run completes independently)
**Plans:** 1/1 plans complete
Plans:
- [ ] 19-01-PLAN.md — Add concurrency group and least-privilege permissions to CI workflow

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
| 19. CI Hardening | 1/1 | Complete    | 2026-03-05 | - |

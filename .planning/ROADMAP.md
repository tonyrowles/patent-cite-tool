# Roadmap: Patent Citation Tool

## Milestones

- ✅ **v1.0 MVP** — Phases 1-4 (shipped 2026-03-02)
- ✅ **v1.1 Silent Mode + Infrastructure** — Phases 5-7 (shipped 2026-03-03)
- ✅ **v1.2 Store Polish + Accuracy Hardening** — Phases 8-13 (shipped 2026-03-03)
- 🚧 **v2.0 Firefox Port** — Phases 14-17 (in progress)

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

### v2.0 Firefox Port (In Progress)

**Milestone Goal:** Rearchitect with an esbuild build pipeline, deduplicate shared code, and produce a fully functional Firefox extension alongside the existing Chrome extension.

- [ ] **Phase 14: Shared Code Extraction** — Deduplicate matching and constants into src/shared/; Chrome still works unbuilt
- [ ] **Phase 15: esbuild Build Pipeline** — src/ -> dist/chrome/ and dist/firefox/ scaffolding; built Chrome output matches current
- [ ] **Phase 16: Firefox Extension** — Manifest, background script absorbing offscreen logic, API adaptations
- [ ] **Phase 17: Cross-Browser Validation** — Both platforms pass the 71-case test corpus and real-patent spot-check

## Phase Details

### Phase 14: Shared Code Extraction
**Goal**: Shared code exists in src/shared/ so no logic is duplicated between Chrome entry points, enabling safe bundling and the Firefox port
**Depends on**: Phase 13 (v1.2 complete)
**Requirements**: SHARED-01, SHARED-02, SHARED-03
**Success Criteria** (what must be TRUE):
  1. A single src/shared/matching.js contains all text-matching functions — no copies remain in text-matcher.js or offscreen.js
  2. src/shared/constants.js exports MSG, STATUS, and PATENT_TYPE as ES module named exports
  3. Chrome content scripts, offscreen.js, and service-worker.js all import from src/shared/ — no local duplicates
  4. The 71-case Vitest corpus passes without modification after the refactor (Chrome loads from src/ as before)
**Plans**: 2 plans
Plans:
- [ ] 14-01-PLAN.md — Create shared ESM modules (constants + matching), wire constants consumers, add smoke tests
- [ ] 14-02-PLAN.md — Wire matching consumers (offscreen + content wrapper), migrate test imports, verify deduplication

### Phase 15: esbuild Build Pipeline
**Goal**: A single build script produces dist/chrome/ and dist/firefox/ scaffolding from src/; the Chrome build is functionally identical to loading from src/ directly
**Depends on**: Phase 14
**Requirements**: BUILD-01, BUILD-02, BUILD-03, BUILD-04, BUILD-05
**Success Criteria** (what must be TRUE):
  1. Running `npm run build` produces dist/chrome/ with all files referenced by the Chrome manifest (scripts, HTML, icons, PDF.js assets)
  2. Content scripts in dist/chrome/ are IIFE-formatted bundles; background and offscreen scripts are ESM
  3. Loading dist/chrome/ via "Load unpacked" in Chrome produces correct column:line citations on Google Patents
  4. The 71-case Vitest corpus passes when run against the built dist/chrome/ output
  5. dist/firefox/ directory scaffold is created by the build script (populated in Phase 16)
**Plans**: TBD

### Phase 16: Firefox Extension
**Goal**: A complete Firefox MV3 extension exists in dist/firefox/ that loads in Firefox and produces citations using a background script instead of an offscreen document
**Depends on**: Phase 15
**Requirements**: FOX-01, FOX-02, FOX-03, FOX-04, FOX-05
**Success Criteria** (what must be TRUE):
  1. dist/firefox/ loads in Firefox via "Load Temporary Add-on" without errors in the browser console
  2. Highlighting text on a Google Patents granted patent page produces a correct column:line citation in Firefox
  3. The toolbar icon activates on Google Patents pages and remains gray on all other pages
  4. IndexedDB caching works in a standard Firefox profile; the extension degrades gracefully (skips cache, still produces citation) when IndexedDB is unavailable under "Never remember history"
  5. Running `npm run build` produces both dist/chrome/ and dist/firefox/ in a single invocation
**Plans**: TBD

### Phase 17: Cross-Browser Validation
**Goal**: Both Chrome and Firefox builds are confirmed regression-free against the full test corpus and verified against real patents
**Depends on**: Phase 16
**Requirements**: VALID-01, VALID-02, VALID-03
**Success Criteria** (what must be TRUE):
  1. The 71-case Vitest corpus passes against both dist/chrome/ and dist/firefox/ builds (zero failures)
  2. `web-ext lint` passes on the dist/firefox/ build with zero errors or warnings
  3. Both extensions produce correct citations on at least 5 real Google Patents pages loaded live in their respective browsers
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
| 14. Shared Code Extraction | 1/2 | In Progress|  | - |
| 15. esbuild Build Pipeline | v2.0 | 0/? | Not started | - |
| 16. Firefox Extension | v2.0 | 0/? | Not started | - |
| 17. Cross-Browser Validation | v2.0 | 0/? | Not started | - |

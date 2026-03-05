# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — MVP

**Shipped:** 2026-03-02
**Phases:** 4 | **Plans:** 8 | **Commits:** 79

### What Was Built
- MV3 Chrome extension with patent page detection, PDF fetch via offscreen document, and IndexedDB storage
- PDF.js text extraction with two-column specification detection and PositionMap builder
- Fuzzy text matching engine (exact → whitespace-stripped → punctuation-agnostic → bookend → Levenshtein)
- DOM-based paragraph citations for published applications (no PDF needed)
- Shadow DOM citation UI with configurable trigger modes and clipboard copy
- Settings system for trigger mode, display mode, and patent number prefix

### What Worked
- Phase decomposition along the critical path (fetch → parse → match → output) kept dependencies clean
- Offscreen document architecture cleanly separated PDF.js from MV3 service worker constraints
- DOM-based paragraph citation for published apps was an elegant shortcut — avoided PDF parsing entirely
- Human-verify checkpoints caught real bugs (constants.js export, message port errors, gutter filtering)
- Atomic commits per task made debugging regressions straightforward

### What Was Inefficient
- Phase 3 Plan 3 (UI + interaction layer) required extensive debugging across multiple sessions — the plan underestimated matching accuracy challenges
- Column boundary detection, gutter line filtering, and disambiguation all required iterative fixes discovered during manual testing
- Matching functions are duplicated between content script (classic) and offscreen (ES module) due to MV3 constraints — a build step would eliminate this
- The dual-context constants pattern (globals + ES module) caused two separate bugs across two phases

### Patterns Established
- PositionMap as the contract between parsing and matching — clear data boundary
- TabId routing through service worker for content script ↔ offscreen communication
- Shadow DOM (closed mode) for UI isolation on third-party pages
- Word-overlap scoring (not character-level) for text disambiguation
- Bookend matching for selections too long for full fuzzy comparison
- Badge color semantics: clear=ready, amber=unavailable, red=error

### Key Lessons
1. **Text matching is harder than parsing.** Parsing produced clean data; matching had to handle every divergence between HTML and PDF text. Budget more time for matching/fuzzy logic.
2. **MV3 module boundaries create real friction.** Classic scripts and ES modules can't share code, leading to duplication. A minimal build step (even just a concatenation script) would pay for itself quickly.
3. **Human-verify checkpoints are high-value.** Both Phase 1 and Phase 3 checkpoints caught bugs that automated checks would have missed. Keep them.
4. **DOM-first strategies beat PDF-first for some patent types.** Published applications have paragraph markers in the DOM — going to the PDF would have been wasted effort.
5. **Long selections need special handling.** Levenshtein on >100 chars hangs the UI. Bookend matching (first/last 50 chars with span validation) was the pragmatic solution.

### Cost Observations
- Model mix: mostly opus for execution, balanced profile
- Sessions: ~6 across 3 days
- Notable: Plans 01-01, 02-01, 03-01, 03-02 all completed in 2-3 minutes each. Phase 3 Plan 3 was the outlier — multiple debugging sessions.

---

## Milestone: v1.1 — Silent Mode + Infrastructure

**Shipped:** 2026-03-03
**Phases:** 3 | **Plans:** 8 | **Commits:** ~20

### What Was Built
- Silent clipboard mode — Ctrl+C appends column:line citation with toast feedback (green success pill, red failure pill)
- Cloudflare Worker proxy for USPTO eGrant API with bearer auth, CORS, and 3-step ODP orchestration
- Three-point fallback chain: no DOM link → Google fetch failure → no text layer → all route to USPTO
- Shared Cloudflare KV cache — check before fetch, fire-and-forget upload, existence-check write protection
- Full cache lifecycle: miss → parse → upload → hit (no PDF download) with 3-second timeout fallthrough

### What Worked
- Worker + KV deployed and functional quickly — Cloudflare's free tier covers the use case perfectly
- Wave-based execution for Phase 7 let cache routes (07-01) and client integration (07-02) develop in parallel
- Human-verify checkpoint for deployment (06-03, 07-03) caught a real cache routing bug before release
- Fire-and-forget upload pattern keeps cache writes invisible to the user experience
- Pre-compute citation on mouseup was the right synchronous-copy workaround for MV3

### What Was Inefficient
- USPTO fallback path was not wired through cache check initially — discovered during E2E verification
- Phase 6 deployment took ~2 hours (user-paced) due to Cloudflare auth, secret provisioning, and custom domain DNS issues
- Plan SUMMARY.md files lack structured one-liner fields, making automated extraction fragile
- Some plan checkboxes in ROADMAP.md weren't updated by executor agents (Phase 6/7 plans show `[ ]` despite being complete)

### Patterns Established
- `CHECK_CACHE → CACHE_HIT/MISS` message flow mirrors existing `FETCH_PDF → PDF_FETCH_RESULT` pattern
- Null pdfUrl signals USPTO-fallback path through cache miss handler — clean branching
- Versioned KV key format (`v1:12505414`) enables future cache invalidation without key migration
- Console logging at every cache decision point for production debuggability

### Key Lessons
1. **Wire ALL paths through new middleware.** The cache check was added to `handlePdfLinkFound` but missed `handlePdfUnavailable`. Every acquisition path must be audited when adding a cross-cutting concern.
2. **E2E verification catches integration bugs that unit logic misses.** Both Phase 6 and Phase 7 had bugs discovered only during browser testing.
3. **Cloudflare Workers + KV is a great fit for extension backends.** Free tier, global edge, no cold starts — ideal for a Chrome extension with distributed users.
4. **Fire-and-forget requires defensive coding.** Every cache write/upload is wrapped in try/catch with swallowed errors — the user must never see cache infrastructure issues.

### Cost Observations
- Model mix: sonnet for executor agents, opus for orchestration
- Sessions: 2 (phase 6 + phase 7)
- Notable: Phase 5 and 7 plans 01-02 completed in minutes; deployment plans (06-03, 07-03) were the bottleneck due to user-paced Cloudflare operations

---

## Milestone: v1.2 — Store Polish + Accuracy Hardening

**Shipped:** 2026-03-03
**Phases:** 6 | **Plans:** 12 | **Commits:** 69

### What Was Built
- Vitest test infrastructure with 71-case patent fixture corpus across 8 categories and frozen golden baseline
- Accuracy hardening: gutter contamination strip (cross-boundary PDF items) and wrap-hyphen normalization — 97.7% → 100.0%
- Three-state toolbar icon system (gray/partial/full) with sharp-based SVG→PNG generation pipeline
- Dedicated options page with auto-save feedback, version footer, and privacy policy link
- Privacy policy hosted on GitHub Pages, Chrome Web Store listing copy, and extension ZIP packaged
- Offscreen.js integration gap closed — wrap-hyphen fix propagated to context-menu citation path

### What Worked
- Milestone audit (`/gsd:audit-milestone`) caught a real integration gap (offscreen.js missing wrap-hyphen fix) and requirements gaps (Phase 12 not started) — audit-driven Phase 13 insertion proved valuable
- Test harness as prerequisite (Phase 8 before Phase 9) prevented reckless algorithm changes — every fix was regression-validated
- Per-category accuracy reporting made diagnosis targeted instead of guessing at failure modes
- Parallel Phase 9/10 execution after Phase 8 was an efficient use of independence
- `generate-icons.mjs` reproducible build means icon updates don't require manual design work

### What Was Inefficient
- Plan checkboxes in ROADMAP.md again fell out of sync (12-02, 13-01 show `[ ]` despite summaries existing) — this is a recurring pattern
- The v1.2 audit was done before Phase 12 execution, making it stale by completion time — audit should ideally happen after all phases finish
- STOR-02 (screenshot) and STOR-03 (promo tile) remain manual user tasks that can't be automated — these requirements may not belong in a code milestone
- ICON_PATHS numeric keys tech debt carried forward — works via JS coercion but is technically non-standard

### Patterns Established
- Golden baseline snapshot testing: freeze expected outputs, run algorithm, compare — simple and effective
- Off-by-one tier classification (exact/systematic/boundary/mismatch) for nuanced accuracy assessment
- Milestone audit → gap closure phase pattern: audit finds gaps, insert decimal phase to close them
- CSS class injection for multi-state SVG icon generation — avoid external rendering dependencies
- GitHub Pages `docs/` folder for privacy policy hosting — zero-cost, same-repo

### Key Lessons
1. **Audit before marking complete, but after all phases finish.** The v1.2 audit caught real gaps but was run mid-milestone, requiring Phase 13 insertion. Run audit as the penultimate step.
2. **Automated requirements don't belong alongside manual tasks.** STOR-02/STOR-03 (screenshot/tile) are inherently human tasks that block "all requirements complete" status. Consider separating code requirements from manual requirements.
3. **Integration gaps hide at code duplication boundaries.** The wrap-hyphen fix applied to `text-matcher.js` but not the duplicate `offscreen.js` version. This is the second time duplicated matching functions caused a bug (v1.0 lesson 2 predicted this).
4. **Test infrastructure investment pays off immediately.** Phase 8's 3 plans were fast to execute and unlocked confident algorithm changes in Phase 9. The accuracy improvement from 97.7% to 100% was possible only because regressions were instantly detectable.
5. **ROADMAP.md plan checkboxes keep falling out of sync.** This is now a 3-milestone recurring issue. Consider either automating checkbox updates in the executor or removing them in favor of disk-only status.

### Cost Observations
- Model mix: balanced profile (sonnet for execution agents, opus for orchestration)
- Sessions: ~4 across 2 days
- Notable: Most plans completed in 2-5 minutes. Phase 10-02 (icon state system, ~30min) and Phase 12-01 (privacy policy + ZIP, ~15min) were the longest due to debugging and user-paced operations.

---

## Milestone: v2.0 — Firefox Port

**Shipped:** 2026-03-05
**Phases:** 4 | **Plans:** 10 | **Commits:** 52

### What Was Built
- Shared code extraction — constants + matching consolidated into src/shared/, eliminating all Chrome/Firefox duplication
- esbuild build pipeline — single `npm run build` produces dist/chrome/ (IIFE content + ESM background) and dist/firefox/ (ESM background absorbing offscreen logic)
- Firefox MV3 extension with background script orchestrator, IndexedDB graceful degradation, and tabs.onUpdated icon activation
- Cross-browser test infrastructure — per-target vitest alias configs proving each dist/ build's bundling correctness
- web-ext lint integration and spot-check verification script for human cross-browser validation
- Build-time manifest transformation eliminating manual Chrome/Firefox manifest sync

### What Worked
- Phased architecture evolution (extract → build → port → validate) kept each phase focused and independently verifiable
- Phase 14's shared code extraction cleanly resolved v1.0/v1.2's duplicated matching functions tech debt — the build step v1.0 lesson 2 predicted
- Human UAT for Phase 15 (Chrome dist/) and Phase 16 (Firefox) caught no issues — architecture was sound before browser testing
- Per-target vitest alias configs elegantly proved bundling correctness without modifying any test files
- IndexedDB detect-once degradation pattern was clean — single flag, graceful fallback to in-memory Map

### What Was Inefficient
- ROADMAP.md plan checkboxes STILL fell out of sync (17-01, 17-02 show `[ ]` in archived roadmap despite being complete) — 4th consecutive milestone with this issue
- Phase 17-02 spot-check required multi-session execution due to user-paced browser operations — could be streamlined with Playwright
- US11427642 cross-column test fixture had off-by-2 offset vs browser rendering; required mid-plan substitution to US6324676
- Summary files lack structured one-liner fields (same issue as v1.1) — automated extraction still fails

### Patterns Established
- src/shared/ → esbuild → dist/{chrome,firefox}/ as the canonical build architecture
- IIFE wrapping for content scripts (Chrome MV3 limitation), ESM for background/offscreen
- Object entry point syntax in esbuild to control output directory nesting
- external: ['../lib/pdf.mjs'] relative path pattern for runtime-resolved PDF.js imports
- web-ext lint with --ignore-files 'lib/**' to skip vendored PDF.js warnings

### Key Lessons
1. **Shared code extraction should precede any port.** Phase 14 before Phase 16 was the right sequencing — porting with duplicated code would have doubled the work and doubled the bugs.
2. **esbuild is the right complexity level for extension builds.** No webpack config maze, fast builds, clear IIFE/ESM output control. The build script is ~200 lines and fully understood.
3. **Firefox's chrome.* compatibility eliminates most porting work.** No polyfill needed. The real differences are: offscreen API (Chrome-only), declarativeContent (Chrome-only), background scripts array syntax, and CSP for WASM.
4. **Per-target test configs beat test file duplication.** Vitest resolve.alias redirects prove each build's integrity without maintaining separate test suites.
5. **Automated milestone audits continue to add value.** v2.0 audit confirmed 16/16 requirements before archival — caught no gaps this time, but the confidence is worth the cost.

### Cost Observations
- Model mix: balanced profile (sonnet for execution agents, opus for orchestration)
- Sessions: ~5 across 2 days
- Notable: Phases 14-16 plans executed in 2-5 minutes each. Phase 17-02 (spot-check) was multi-session due to user-paced browser testing. Phase 15-03 and 16-03 (human verification) were fast because architecture was already correct.

---

## Milestone: v2.1 — CI/CD Pipeline

**Shipped:** 2026-03-05
**Phases:** 2 | **Plans:** 2 | **Commits:** 15

### What Was Built
- GitHub Actions CI workflow triggering on push (all branches) and PRs to main
- Four individually named test steps (test:src, test:chrome, test:firefox, test:lint) with per-suite pass/fail visibility in Actions UI
- Store-ready ZIP packaging via cd+zip pattern — manifest.json at archive root, uploaded as downloadable artifacts
- Concurrency group with head_ref && ref || run_id — stale PR runs cancelled, main-branch runs protected
- Least-privilege GITHUB_TOKEN scope (contents: read only)
- 10-minute job timeout to prevent runaway builds

### What Worked
- Smallest milestone yet (2 phases, 1 file) — focused scope made execution clean and fast
- Pre-flight validation (build + lint locally) before committing CI workflow avoided any GitHub Actions iteration
- Phase 18 → Phase 19 sequencing was natural — base workflow first, then hardening additions
- Both plans executed with zero deviations from plan
- Auto-advance mode for checkpoints worked well since CI verification was confirmatory (not exploratory)

### What Was Inefficient
- ROADMAP.md plan checkbox for 19-01 still shows `[ ]` despite being complete — 5th consecutive milestone with this recurring issue
- Phase 19 progress table row in ROADMAP.md had a formatting error (missing v2.1 milestone column) — carried through to archive
- STATE.md had stale phase-level performance metrics mixed with milestone-level rows — formatting inconsistency

### Patterns Established
- cd+zip pattern: `cd dist/X && zip -r ../../name.zip .` — ensures manifest.json at archive root
- Named test steps (not single `npm test`) for individual pass/fail visibility in CI
- Concurrency pattern: `${{ github.workflow }}-${{ github.head_ref && github.ref || github.run_id }}` for PR cancellation without main-branch impact
- Workflow-level `permissions: contents: read` as default for read-only CI workflows

### Key Lessons
1. **Pre-flight local validation is cheap insurance.** Running the full build+test locally before committing CI workflow saved what could have been multiple push-fix-push iterations on GitHub.
2. **Focused milestones execute cleanly.** Two phases, one file, clear requirements — both plans completed with zero deviations. Scope discipline pays off.
3. **ROADMAP.md checkbox sync is a permanent debt.** Five milestones in a row. Either automate it or accept it as cosmetic and stop noting it.
4. **CI hardening is a natural follow-on, not a separate milestone.** Concurrency + permissions added 7 lines and took 1 minute. Could have been part of Phase 18, but separation made requirements tracking cleaner.

### Cost Observations
- Model mix: balanced profile (sonnet for execution agents, opus for orchestration)
- Sessions: 1 (both phases in a single session)
- Notable: Fastest milestone — ~3 minutes of execution time total. Minimal file changes (1 file, 68 lines).

---

## Milestone: v2.2 — Matching Robustness

**Shipped:** 2026-03-05
**Phases:** 3 | **Plans:** 4 | **Commits:** 25

### What Was Built
- OCR normalization pipeline — `normalizeOcr` with 5 prose-safe substitution pairs (rn→m, cl→d, cI→d, vv→w, li→h) applied as Tier 0b preprocessing
- Concat refactor — `buildConcat` extracted as shared helper returning `{concat, boundaries, changedRanges}`, replacing inline loop in matchAndCite
- Gutter-tolerant matching — Tier 5 last-resort fallback using space-anchored survive-mask strip for stray USPTO gutter line numbers (multiples of 5, range 5-65)
- 75-entry golden baseline — 4 new validated test cases (US6324676 OCR divergence, split-word, synthetic gutter fixture)
- Fixed matching-exports.js missing exports from phases 20/21

### What Worked
- TDD approach (RED → GREEN → REFACTOR) for all plans — every implementation was regression-validated before proceeding
- Symmetric normalizeOcr design (apply to both selection and concat) was discovered during implementation — prevented 10 baseline regressions
- Survive-mask approach for gutter stripping matched existing whitespaceStrippedMatch pattern — consistent codebase patterns
- Synthetic fixture (gutter number injected into real patent data) provided isolated Tier 5 testing without relying on finding perfect real-world examples
- All plans executed with zero scope creep — auto-fixed bugs were all in test expectations or pre-existing gaps

### What Was Inefficient
- matching-exports.js was missing normalizeOcr/buildConcat/stripGutterNumbers since phases 20/21 — not caught until phase 22 CI run (30 test failures)
- Plan 20-01 specified normalizeOcr on concat only — symmetric application to both sides was discovered during implementation (10/71 baseline failures forced the correction)
- Plan 20-02 "conservative" penalty approach (changedRanges overlap) was incorrect — changedRanges almost always non-empty for real English text

### Patterns Established
- Tier 0b preprocessing — normalizeOcr applied before all cascade tiers, not as a separate tier
- Survive-mask + offset array rebuild pattern for character-level stripping (reusable for future transformations)
- Synthetic fixture pattern — minimal JSON subset with controlled artifact injection for isolated algorithm testing
- selChanged as the correct penalty gating flag for symmetric normalization features
- Dynamic spot-check count — SPOT_CHECK_IDS.length replaces hardcoded references

### Key Lessons
1. **Export maintenance is a cross-phase concern.** matching-exports.js fell out of sync across two phases — consider adding an automated export check or CI step.
2. **Plan-specified normalization strategies need baseline validation.** Both 20-01 and 20-02 had logically correct but practically incorrect normalization/penalty strategies that broke baseline tests. Always test against the full corpus immediately.
3. **Synthetic fixtures enable targeted tier testing.** Real-world examples of Tier 5 gutter contamination are rare; synthetic injection proved the algorithm without hunting for perfect specimens.
4. **TDD catches implementation bugs early.** All auto-fixes were discovered during GREEN phase, not after deployment. The failing-test-first discipline keeps the feedback loop tight.

### Cost Observations
- Model mix: balanced profile (sonnet for execution agents, opus for orchestration)
- Sessions: 2 (phases 20-21 + phase 22)
- Notable: Fastest execution times yet — Phase 21 completed in 4 minutes, Phase 22 in 4 minutes. Phase 20 took ~45 minutes due to two plans with symmetric normalization discovery.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Commits | Phases | Key Change |
|-----------|---------|--------|------------|
| v1.0 | 79 | 4 | Initial development — established patterns |
| v1.1 | ~20 | 3 | Infrastructure + parallel execution — wave-based plans |
| v1.2 | 69 | 6 | Test infrastructure + audit-driven gap closure |
| v2.0 | 52 | 4 | Build pipeline + cross-browser architecture |
| v2.1 | 15 | 2 | CI/CD automation — smallest, fastest milestone |
| v2.2 | 25 | 3 | OCR normalization + gutter matching — accuracy hardening |

### Cumulative Quality

| Milestone | Tests | Accuracy | Known Limitations |
|-----------|-------|----------|-------------------|
| v1.0 | 0 | ~95% (manual) | Long selections >500 chars may fail |
| v1.1 | 0 | ~95% (manual) | Duplicated matching functions |
| v1.2 | 95 | 100% (71-case corpus) | Manual screenshot/tile assets pending |
| v2.0 | 303 | 100% (71-case × 3 targets) | Store submissions pending |
| v2.1 | 338 | 100% (CI-validated) | Store submissions pending |
| v2.2 | 461 | 100% (75-case baseline) | s→S OCR gap documented, not implemented |

### Top Lessons (Verified Across Milestones)

1. **Code duplication creates integration gaps.** v1.0 predicted build step would help; v1.2 confirmed it; v2.0 finally resolved it with shared modules + esbuild. Pattern closed.
2. **Human-verify checkpoints catch bugs that code review misses.** Confirmed in all four milestones. v2.0 human UAT found zero issues — architecture was sound.
3. **New middleware must be wired into ALL code paths.** v1.1 cache routing bug, v1.2 wrap-hyphen offscreen gap — same class of bug. v2.0's shared module architecture eliminates this class of bug.
4. **Test infrastructure investment pays off immediately.** v1.2 golden baseline enabled confident algorithm changes; v2.0 cross-browser configs proved bundling correctness.
5. **ROADMAP.md plan checkboxes fall out of sync.** Observed in v1.1, v1.2, and v2.0 — 4th consecutive milestone. Needs automation or removal.
6. **E2E browser testing is essential for extension development.** Integration bugs invisible to code review in all milestones.
7. **Phased architecture evolution beats big-bang rewrites.** v2.0's extract → build → port → validate sequence kept each phase independently verifiable.

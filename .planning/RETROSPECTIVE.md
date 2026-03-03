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

## Cross-Milestone Trends

### Process Evolution

| Milestone | Commits | Phases | Key Change |
|-----------|---------|--------|------------|
| v1.0 | 79 | 4 | Initial development — established patterns |
| v1.1 | ~20 | 3 | Infrastructure + parallel execution — wave-based plans |
| v1.2 | 69 | 6 | Test infrastructure + audit-driven gap closure |

### Cumulative Quality

| Milestone | Tests | Accuracy | Known Limitations |
|-----------|-------|----------|-------------------|
| v1.0 | 0 | ~95% (manual) | Long selections >500 chars may fail |
| v1.1 | 0 | ~95% (manual) | Duplicated matching functions |
| v1.2 | 95 | 100% (71-case corpus) | Manual screenshot/tile assets pending |

### Top Lessons (Verified Across Milestones)

1. **Code duplication creates integration gaps.** v1.0 predicted build step would help; v1.2 confirmed it when offscreen.js diverged from text-matcher.js. Third time this pattern caused issues.
2. **Human-verify checkpoints catch bugs that code review misses.** Confirmed in all three milestones.
3. **New middleware must be wired into ALL code paths.** v1.1 cache routing bug, v1.2 wrap-hyphen offscreen gap — same class of bug.
4. **Test infrastructure investment pays off immediately.** v1.2 golden baseline enabled confident algorithm changes with zero regressions.
5. **ROADMAP.md plan checkboxes fall out of sync.** Observed in v1.1 and v1.2 — needs automation or removal.
6. **E2E browser testing is essential for extension development.** Integration bugs invisible to code review in all milestones.

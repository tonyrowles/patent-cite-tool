# Milestones

## v2.2 Matching Robustness (Shipped: 2026-03-05)

**Phases completed:** 3 phases (20-22), 4 plans, 7 tasks
**Timeline:** 2 days (2026-03-03 → 2026-03-05)
**Commits:** 25
**Git range:** c8958a8..08f5f00 (26 files, +3,893 / -88 lines)

**Delivered:** OCR-aware normalization and gutter-tolerant matching hardening the citation pipeline against imperfect PDF text layers, validated with 75-entry golden baseline (4 new test cases including US6324676 OCR-heavy patent).

**Key accomplishments:**
1. OCR normalization pipeline — `normalizeOcr` with 5 prose-safe substitution pairs applied symmetrically to selection and concat as Tier 0b preprocessing
2. Concat refactor — `buildConcat` extracted as shared helper returning `{concat, boundaries, changedRanges}`, single source of truth for concat construction
3. Gutter-tolerant matching — Tier 5 last-resort fallback using space-anchored survive-mask strip for stray USPTO gutter line numbers, flat 0.85 confidence cap
4. 75-entry golden baseline — 4 new validated test cases (US6324676 OCR divergence, split-word, synthetic gutter), zero regressions on existing 71 entries

**Requirements:** 5/5 v2.2 requirements shipped (MATCH-01-03, VALID-01-02)

---

## v2.1 CI/CD Pipeline (Shipped: 2026-03-05)

**Phases completed:** 2 phases (18-19), 2 plans, 4 tasks
**Timeline:** 2 days (2026-03-04 → 2026-03-05)
**Source LOC:** 68 (YAML)
**Git range:** b9ac927..9afd509 (1 file, +68 lines)

**Delivered:** GitHub Actions CI/CD pipeline that triggers on every push and PR, builds Chrome and Firefox dists, runs 4 named test suites (338 tests + web-ext lint), packages store-ready ZIPs as downloadable artifacts, and is hardened with concurrency cancellation and least-privilege permissions.

**Key accomplishments:**
1. GitHub Actions CI workflow — triggers on push (all branches) and PRs to main with Node 22 LTS + npm cache
2. Four individually named test steps (test:src, test:chrome, test:firefox, test:lint) with per-suite pass/fail visibility
3. Store-ready ZIP packaging via cd+zip pattern with manifest.json at archive root, uploaded via upload-artifact@v4
4. Concurrency group with head_ref && ref || run_id — stale PR runs cancelled, main-branch runs protected

**Requirements:** 9/9 v2.1 requirements shipped (CICD-01-03, PKG-01-03, HARD-01-03)

---

## v2.0 Firefox Port (Shipped: 2026-03-05)

**Phases completed:** 4 phases (14-17), 10 plans
**Timeline:** ~2 days (2026-03-03 → 2026-03-05)
**Source LOC:** 7,600 (JavaScript)
**Git range:** a36774f..89ca16c (66 files, +9,363 / -857 lines)

**Delivered:** Cross-browser extension with esbuild build pipeline, shared code architecture, and a fully functional Firefox port — both browsers validated against 71-case test corpus and real Google Patents pages.

**Key accomplishments:**
1. Shared code extraction — constants + matching consolidated into src/shared/, zero duplication between Chrome/Firefox
2. esbuild build pipeline — single `npm run build` produces dist/chrome/ and dist/firefox/ from src/
3. Firefox MV3 extension — background script absorbs offscreen document logic with IndexedDB graceful degradation
4. Cross-browser test infrastructure — `npm test` validates both builds (71-case corpus × 2 targets + web-ext lint)
5. Human-verified spot-check — both browsers produce identical citations on 5 real Google Patents pages
6. Build-time manifest transformation eliminates manual Chrome/Firefox manifest sync

**Requirements:** 16/16 v2.0 requirements shipped (SHARED-01-03, BUILD-01-05, FOX-01-05, VALID-01-03)

---

## v1.2 Store Polish + Accuracy Hardening (Shipped: 2026-03-03)

**Phases completed:** 6 phases (8-13), 12 plans
**Timeline:** 2 days (2026-03-02 → 2026-03-03)
**Source LOC:** 4,500 (JS/HTML/CSS/JSON)
**Git range:** v1.1..v1.2 (69 commits, 39 files, +3,146 / -86 lines)

**Delivered:** Store-ready extension with Vitest test harness, 100% accuracy on 71-case corpus, three-state toolbar icons, dedicated options page, privacy policy, and Chrome Web Store listing assets.

**Key accomplishments:**
1. Vitest test infrastructure with 71-case patent fixture corpus and frozen golden baseline
2. Accuracy improved from 97.7% to 100.0% via gutter contamination and wrap-hyphen fixes
3. Three-state toolbar icon system (gray/partial/full) with sharp-based generation pipeline
4. Dedicated options page with auto-save feedback, version footer, and privacy policy link
5. Privacy policy hosted on GitHub Pages, store listing copy, and extension ZIP packaged
6. Offscreen.js wrap-hyphen integration gap closed with unit tests

**Requirements:** 19/21 v1.2 requirements shipped (TEST-01-06, ACCY-01-03, ICON-01-03, OPTS-01-04, STOR-01, STOR-04-05)

### Known Gaps
- **STOR-02**: 1280x800 screenshot — requires manual capture in Chrome browser (user action)
- **STOR-03**: 440x280 promotional tile — requires manual design (user action)
- **ACCY-01**: Live spot-check of 10-15 real patents skipped at user request (fixture-based audit complete with 71 cases)

---

## v1.1 Silent Mode + Infrastructure (Shipped: 2026-03-03)

**Phases completed:** 3 phases, 8 plans, 15 tasks
**Timeline:** 1 day (2026-03-02)
**Lines of code:** 4,333 (source JS/HTML/CSS/JSON)
**Git range:** 7b03e0f → d1e2e77 (40 files, 7,157 insertions)

**Delivered:** Silent clipboard citation mode (Ctrl+C), USPTO eGrant API fallback via Cloudflare Worker proxy, and shared Cloudflare KV cache so parsed patents benefit all users.

**Key accomplishments:**
1. Silent mode — Ctrl+C on highlighted text appends column:line citation to clipboard with toast feedback
2. Cloudflare Worker with bearer auth, CORS, and 3-step USPTO ODP orchestration for eGrant PDF fetch
3. Three-point fallback chain: no DOM link → Google fetch failure → no text layer, all routing to USPTO
4. Shared KV cache — check before PDF fetch, fire-and-forget upload after parse, existence-check write protection
5. Full cache lifecycle: miss → parse → upload → hit (no PDF download), with 3-second timeout fallthrough

**Requirements:** 12/12 v1.1 requirements shipped (SLNT-01-05, UPTO-01-03, CACH-01-04)

---

## v1.0 MVP (Shipped: 2026-03-02)

**Phases completed:** 4 phases, 8 plans, ~16 tasks
**Timeline:** 3 days (2026-02-27 → 2026-03-01)
**Lines of code:** 3,326 (JS/HTML/CSS/JSON)
**Git range:** 30c76be → 8d7e1cd (50 files, 8,593 insertions)

**Delivered:** Chrome extension that generates precise column:line and paragraph citations from highlighted text on Google Patents — no manual PDF counting needed.

**Key accomplishments:**
1. MV3 Chrome extension with patent page detection and PDF fetch via offscreen document
2. PDF.js text extraction with two-column specification detection and PositionMap builder
3. Document-wide column/line numbering matching attorney citation convention
4. Fuzzy text matching with normalization, disambiguation, and bookend matching
5. DOM-based paragraph citations for published applications (no PDF parse needed)
6. Shadow DOM citation UI with clipboard copy, patent prefix setting, and inline confirmation

**Requirements:** 16/16 v1 requirements shipped (MATCH-02 confidence indicator was built but checkbox not updated in REQUIREMENTS.md)

---


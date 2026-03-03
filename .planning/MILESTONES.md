# Milestones

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


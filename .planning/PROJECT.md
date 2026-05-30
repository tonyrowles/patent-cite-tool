# Patent Citation Tool

## What This Is

A cross-browser extension (Chrome + Firefox) for patent professionals that generates precise column:line citations (for granted patents) or paragraph citations (for published applications) by highlighting text on Google Patents. Built with an esbuild pipeline from shared source code, supports silent clipboard mode (Ctrl+C), USPTO eGrant API fallback via Cloudflare Worker, shared server-side cache via Cloudflare KV, OCR-aware normalization (Tier 0b) and gutter-tolerant matching (Tier 5), and 100% accuracy on a 75-case cross-browser golden baseline.

## Core Value

Highlight text on Google Patents, get an accurate citation reference instantly — no PDF downloading, no manual counting.

## Requirements

### Validated

- ✓ Highlight text on Google Patents and receive column:line citation for granted US patents — v1.0
- ✓ Highlight text on Google Patents and receive paragraph citation for published US applications — v1.0
- ✓ Parse pre-OCR'd patent PDFs to build column/line maps (no client-side OCR) — v1.0
- ✓ Detect two-column specification section (skip cover page, preliminary material, figures) — v1.0
- ✓ Handle column boundaries — produce range citations like 4:55-5:10 when selection spans columns — v1.0
- ✓ Best-effort text matching with confidence indication (green/yellow/red) — v1.0
- ✓ In-browser PDF parsing via PDF.js offscreen document — lightweight, no backend — v1.0
- ✓ Configurable trigger mode (floating button, auto, context menu) — v1.0
- ✓ Local browser cache via IndexedDB for parsed patents — v1.0
- ✓ Optional patent number prefix in citation format — v1.0
- ✓ Silent mode — Ctrl+C appends citation to clipboard text; toast on low confidence/no match — v1.1
- ✓ USPTO eGrant API fallback via Cloudflare Workers proxy (keeps API key secret from end user) — v1.1
- ✓ Server-side shared cache on Cloudflare — analyzed patents benefit all users — v1.1

### Validated

- ✓ Proper extension icon set (16/32/48/128px) with three-state toolbar transitions — v1.2
- ✓ Dedicated options page with auto-save feedback and privacy policy link — v1.2
- ✓ Privacy policy hosted at stable public URL (GitHub Pages) — v1.2
- ✓ Store listing text, permission justifications, and dashboard guidance — v1.2
- ✓ Vitest test harness with 71-case patent fixture corpus and golden baseline — v1.2
- ✓ Manual accuracy audit across 8 patent categories (71 cases) — v1.2
- ✓ Algorithm fixes: gutter contamination strip and wrap-hyphen normalization — v1.2

### Validated

- ✓ esbuild build pipeline — src/ → dist/chrome/ and dist/firefox/ — v2.0
- ✓ Shared code extraction into src/shared/ — zero duplication between Chrome/Firefox — v2.0
- ✓ Firefox MV3 extension with background script absorbing offscreen logic — v2.0
- ✓ IndexedDB graceful degradation for Firefox private browsing — v2.0
- ✓ Cross-browser validation — 71-case corpus passes both builds + web-ext lint — v2.0

### Validated

- ✓ GitHub Actions CI/CD pipeline — build, test (338 tests + lint), and store-ready ZIP packaging on every push/PR — v2.1

### Validated

- ✓ OCR-aware normalization — `normalizeOcr` with 5 prose-safe pairs applied as Tier 0b preprocessing to both selection and concat — v2.2
- ✓ Concat refactor — `buildConcat` extracted as shared helper, single source of truth for concat construction — v2.2
- ✓ Gutter-tolerant matching — Tier 5 last-resort fallback strips stray gutter line numbers with 0.85 confidence cap — v2.2
- ✓ 75-entry golden baseline with OCR-heavy patent (US6324676) and synthetic gutter test coverage — v2.2
- ✓ Merged/split-word handling verified via whitespace-stripped matching — v2.2

### Validated (v2.3)

- ✓ **ACCY-04**: Citation tool produces correct column numbers for granted patents whose PDFs lack printed column headers — Validated in Phase 23: Column Inference for Headerless PDFs
- ✓ **ACCY-05**: Position map cache invalidates when column-extraction logic changes (CACHE_VERSION bump) — Validated in Phase 23: Column Inference for Headerless PDFs
- ✓ **FOX-06**: Firefox extension passes `web-ext lint` with zero AMO-blocking validation errors/warnings — Validated in Phase 24: Firefox AMO Validation Cleanup
- ✓ **CICD-04**: Pushing a `v*` tag triggers an automatic GitHub Release with built artifacts attached — Validated in Phase 25: Automatic Release Workflow

### Validated (v3.0)

- Playwright + Chromium E2E harness that loads the unpacked extension and drives Google Patents pages — Phase 26
- Deterministic regression mode against the 76 golden patents (local + nightly cron) — Phase 27
- Independent PDF re-parse verifier (separate code path from the extension pipeline) — Phase 28
- Nightly GitHub Actions cron with auto-issue filing on failure — Phase 29
- Failure diagnostics capture: page screenshot, DOM snapshot, PDF page snippet for the cited column:line — Phase 27/28
- USPTO/Worker fallback fault-injection test (catches silent regressions in the Cloudflare Worker path) — Phase 30
- LLM exploratory mode using headless `claude -p` (Max 5 credit pool, local-dev only, hard $100 monthly cap with warning at $80, live-test deferred to HUMAN-UAT) — Phase 31

### Validated (v3.1)

- ✓ **UAT-01..03**: `npm run e2e:explore` runs against the Max 5 subscription credit with ≥10 real iterations; spend ledger tracks each `claude -p` against the $80/$100 monthly cap; `e2e:upload-llm-report` helper triggers nightly workflow via workflow_dispatch — Phase 32
- ✓ **RERUN-01..04**: Pure-function 3-replay re-run validator (`rerun-validator.js`) via verifier-only path (no browser); `rerun-report.json` per anomaly with 2/3+ → CONFIRMED, 0–1/3 → FLAKE; `llm-report.json` schema extended with `scroll_y` / `viewport_*` / `selected_node_xpath`; ESLint `no-restricted-imports src/` guard extended to cover the validator module — Phase 33
- ✓ **TRIAGE-01..06**: Heuristic-first classifier resolves 6/8 ERROR_CLASSES without LLM; `verifier_strong_agreement` (Tier A/B only) prevents Tier C masking; cluster pre-filter routes N≥5 same-errorClass findings to a single grouped LLM call; subscription-local-only via `invokeClaudePWithLedger` with CI guard; `triage-report.json` schema; PDF text wrapped in `<patent_data>` XML tags as prompt-injection defense — Phase 34
- ✓ **ISSUE-01..04**: `lib/issue-payload-builder.js` assembles 4-section issue body (reproducer / verifier disagreement / LLM rationale / golden diff) within per-section char budgets; `scripts/e2e-report-issue.mjs --source triage` applies errorClass label; fingerprint scheme extended additively with v1+v2 dual-search; fingerprint comment on line 1 of body — Phase 35
- ✓ **QUAR-01..05**: `tests/e2e/test-cases-quarantine.js` with schema-guard; idempotent `quarantine-append.mjs` with `stable_runs` counter; non-gating quarantine Playwright project with `retries: 0` and `continue-on-error: true` (filings labeled `e2e-quarantine`); auto `quarantine:ready-for-promotion` label at `stable_runs ≥ 3`; human-gated `promote-from-quarantine.mjs` — Phases 35/36
- ✓ **ORCH-01..05**: `scripts/run-triage-pipeline.mjs` chains rerun → triage → issue-file → quarantine-append (exits 0 always); nightly cron consumes `llm_run_id` workflow_dispatch input; timeout budget documented and within job limits — Phase 36
- ✓ **DIGEST-01..04**: Monday 07:00 UTC GitHub Discussion (or `e2e-digest` labeled issue fallback) + committed markdown file with findings count, classification breakdown, top 3 failure categories, quarantine growth, cost vs cap — all within 50 lines, anchored on frozen `SUMMARY_KEYS` array — Phase 37
- ✓ **v3.1 cleanup**: 3 integration fragility warnings resolved (QUARANTINE_REPORT_FILENAME ESM, DIGEST-04 self-ref guard, `e2e-nightly` upload-artifact quarantine clause); Nyquist VALIDATION coverage stamped on 5 carry-over phases; 8/8 live human-UAT confirmations (5 PASS, 1 PARTIAL, 1 DONE, 1 DEFERRED) — Phase 38

### Future

- Chrome Web Store screenshot (1280x800) and promotional tile (440x280)
- Chrome Web Store submission and review
- Firefox Add-ons (AMO) submission and review
- Configurable citation format (4:5-20 vs col. 4, ll. 5-20 vs column 4, lines 5-20)
- Keyboard shortcut for citation (e.g., Ctrl+Shift+C)
- Batch citation mode — queue multiple citations and copy all at once
- Patent family cache reuse — continuation patents share specification text

### Out of Scope

- Running OCR on patents — only parse pre-existing OCR/text layers (only ~2-5% of patents lack text layers)
- ~~Mobile browser support — Chrome desktop extension only~~
- Mobile browser support — desktop browser extensions only (Chrome + Firefox)
- Citation management or organization features — just copy the citation
- Non-US patents — completely different document formats and citation conventions
- AI-powered patent summarization — different product category
- Inline PDF viewer/annotator — Google Patents already shows the PDF
- Raw PDF storage in KV — PDFs are 5-30 MB; store parsed position maps only (10-100 KB)
- Cache/fallback status indicators in UI — deferred, not essential for core workflow
- ~~Full ESM module unification / build step~~ — completed in v2.0 (esbuild pipeline)
- Safari extension — different extension model (Xcode required)
- webextension-polyfill — Firefox supports chrome.* natively; unnecessary dependency
- Build-time minification — keep source readable for extension store review

## Latest Milestone: v3.1 LLM-Driven Product Improvement Loop (Shipped 2026-05-30)

Closed the loop from v3.0's LLM exploratory testing into actionable product fixes. The nightly pipeline now: (1) replays each LLM-flagged anomaly 3× via verifier-only path to confirm reproducibility, (2) classifies findings via heuristic-first hybrid triage (6/8 ERROR_CLASSES with zero LLM, cluster pre-filter on N≥5, Tier C escalation, prompt-injection defense), (3) files richly-structured GitHub issues with reproducer + verifier disagreement + LLM rationale + golden diff (per-section char budgets, fingerprint on line 1), (4) appends CONFIRMED findings to a quarantine corpus that runs non-gating in the nightly cron and auto-tags `quarantine:ready-for-promotion` at `stable_runs ≥ 3` (human-gated promotion to golden via `promote-from-quarantine.mjs`), and (5) publishes a Monday 07:00 UTC weekly analytics digest to GitHub Discussions. 7 phases (32-38), 31 plans, 29 requirements shipped, ~9 days. Zero new npm dependencies; subscription-local LLM only (CI-guarded); no new core extension functionality.

## Previous Milestone: v3.0 Autonomous E2E Testing Agent (Shipped 2026-05-20)

Built a Playwright-driven testing agent that exercises the extension against real Google Patents, with independent PDF re-parse verification, nightly GitHub Actions cron with auto-issue filer, Worker fault-injection coverage, and LLM exploratory mode scaffolding (`claude -p` against Max 5 subscription; live UAT deferred to v3.1). 6 phases (26-31), 30 plans, 32 requirements shipped. Only non-functional source changes (data-testids + `X-PCT-Test-Mode` header).

## Context

Shipped v3.1 with ~31,440 LOC across `src/`, `scripts/`, `tests/` (JavaScript/HTML/CSS/JSON/YAML).
Tech stack: Chrome MV3, Firefox MV3 (WebExtensions), esbuild, PDF.js v5, Shadow DOM, IndexedDB, offscreen document API (Chrome), Cloudflare Workers, Cloudflare KV, Vitest, web-ext, sharp, Playwright + Chromium, headless `claude -p` (Max 5 subscription, local-dev only, $80/$100 monthly cap), GitHub Actions.
Architecture: src/ → esbuild → dist/chrome/ + dist/firefox/. Shared modules in src/shared/ (constants, matching). Firefox uses background script instead of offscreen document. CI via GitHub Actions: nightly cron runs deterministic regression (76 golden patents) + fault-injection + (when `llm_run_id` provided) triage pipeline (rerun → triage → issue-file → quarantine-append) + non-gating quarantine spec. Monday 07:00 UTC weekly digest workflow publishes to GitHub Discussions.

- **Google Patents HTML vs PDF mismatch**: Handled with fuzzy matching (exact → whitespace-stripped → punctuation-agnostic → bookend → Levenshtein). Long selections (>500 chars) may fail when texts genuinely diverge.
- **Patent PDF structure**: Cover page → preliminary material → figures → two-column specification. Bimodal x-coordinate analysis detects spec pages; dynamic gutter detection finds column boundaries.
- **Column/line layout**: Document-wide column numbering from printed PDF headers. Y-coordinate clustering with 3pt tolerance for line grouping. Claims section detected via text markers.
- **Published applications**: DOM-only paragraph citation — no PDF fetch needed. TreeWalker scans for [XXXX] markers.
- **Silent mode**: Pre-computes citation on mouseup, reads synchronously in copy event handler. Toast feedback for success/failure.
- **USPTO fallback**: Three trigger points (no DOM link, Google fetch failure, no text layer) all route to Cloudflare Worker proxy.
- **Server cache**: Check-before-fetch with 3s timeout, fire-and-forget upload after parse, existence-check write protection.
- **Accuracy**: 100% on 75-case test corpus (10 categories: pre-2000, modern, chemical, claims, cross-column, repetitive, short, long, ocr, gutter). Gutter contamination, wrap-hyphen normalization, OCR normalization, and gutter-tolerant matching applied.
- **Testing**: Vitest with golden baseline snapshot testing, off-by-one tier classification, per-category accuracy reports. 461 tests across 4 suites.
- **Distribution**: Store-ready with privacy policy, listing copy, extension ZIP. Pending screenshot/tile assets and Chrome Web Store submission.

## Constraints

- **Platform**: Chrome + Firefox extensions (Manifest V3 / WebExtensions)
- **Performance**: In-browser PDF.js parsing in offscreen document — fast enough for real-time use
- **Data source**: Google Patents PDF primary; USPTO eGrant API fallback via Cloudflare Workers proxy; Cloudflare KV shared cache
- **Accuracy**: Best-effort matching with confidence indication — citations go into legal filings

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Client-side PDF.js in offscreen document | Avoids backend infrastructure; MV3-compatible via offscreen API | ✓ Good — fast parsing, no server needed |
| Shadow DOM (closed mode) for citation UI | CSS isolation from Google Patents Polymer components | ✓ Good — no style leakage |
| DOM-based paragraph citations for pub apps | Published applications don't need PDF parsing — DOM has paragraph markers | ✓ Good — instant, no fetch needed |
| Document-wide column numbering from PDF headers | Printed column numbers are authoritative vs sequential counting | ✓ Good — matches attorney convention |
| Word-overlap scoring for disambiguation | Character-level scoring fails on HTML/PDF whitespace divergence | ✓ Good — robust disambiguation |
| Bookend matching for long selections | Full fuzzy match hangs on >100 chars; first/last 50 chars with span validation | ✓ Good — handles most long selections |
| ~~Dual-context constants module~~ | ~~Classic script globals + ES module import from same file~~ | Resolved in v2.0 — esbuild bundles shared ESM modules |
| ~~Duplicated matching functions (content + offscreen)~~ | ~~Offscreen ES module cannot share classic script globals~~ | Resolved in v2.0 — src/shared/matching.js is single source |
| esbuild with IIFE content scripts + ESM background | Content scripts cannot use ES modules in Chrome MV3; IIFE wrapping works | ✓ Good — clean bundle separation |
| Separate Chrome/Firefox manifests | Too many differences (permissions, CSP, background key) for patch approach | ✓ Good — clear separation of concerns |
| Firefox background script absorbs offscreen logic | Firefox has no offscreen API; background script can use full APIs | ✓ Good — simpler architecture for Firefox |
| IndexedDB detect-once degradation | Single idbAvailable flag on first error; all IDB ops silently skipped | ✓ Good — graceful private browsing support |
| Per-target vitest alias configs | Redirect src/shared imports to dist/ bundles without modifying test files | ✓ Good — proves bundling correctness |
| No webextension-polyfill | Firefox natively supports chrome.* namespace | ✓ Good — zero extra dependencies |
| GitHub Actions CI with 4 named test steps | Per-suite pass/fail visibility in Actions UI (not single npm test) | ✓ Good — individual failure diagnosis |
| Shell zip with cd+zip for store-ready artifacts | Pre-installed on ubuntu-latest; manifest.json at ZIP root | ✓ Good — no action dependency |
| Concurrency group: head_ref && ref \|\| run_id | PR runs cancelled on new push; main runs never cancelled (unique run_id) | ✓ Good — correct semantics |
| Workflow-level permissions: contents: read | upload-artifact v4 uses ACTIONS_RUNTIME_TOKEN, not GITHUB_TOKEN | ✓ Good — least-privilege |
| normalizeOcr as Tier 0b preprocessing | Apply 5 prose-safe OCR pairs symmetrically to both sides; all tiers benefit without modification | ✓ Good — zero regressions, symmetric design |
| OCR penalty on selChanged only | changedRanges almost always non-empty for real English text; selChanged is the correct necessity test | ✓ Good — baseline preserved at 1.0 confidence |
| buildConcat as shared helper | Single source of truth for concat construction; reused by gutterTolerantMatch | ✓ Good — eliminated duplication |
| gutterTolerantMatch as Tier 5 last-resort | Minimizes false positives; only fires when Tiers 1-4 all fail | ✓ Good — no interference with clean patents |
| Space-anchored gutter strip via survive-mask | Char-by-char boundary check; avoids stripping from patent numbers and chemical quantities | ✓ Good — precise, zero false strips |
| Flat 0.85 confidence for Tier 5 | Forces yellow UI indicator; appropriate uncertainty signal for legal filings | ✓ Good — clear caution signal |
| Local-only caching via IndexedDB | Cloud cache adds backend complexity; local sufficient for MVP | ✓ Good for v1 |
| Citation format: 4:5-20 shorthand | User preference for compact format | ✓ Good — shipped as default |
| Pre-compute citation on mouseup for silent mode | Copy event must be synchronous; async lookup impossible in copy handler | ✓ Good — fast, no visible delay |
| Cloudflare Workers for USPTO proxy | API key stays server-side; free tier sufficient; same provider as KV cache | ✓ Good — deployed in minutes |
| Three-point fallback to USPTO | Covers no-DOM-link, Google-fetch-failure, and no-text-layer scenarios | ✓ Good — comprehensive coverage |
| Shared KV cache with existence-check writes | One user's parse benefits all; free-tier write quota protected | ✓ Good — instant hits for cached patents |
| 3-second cache timeout with silent fallthrough | Unreachable Worker never blocks user; falls through to PDF pipeline | ✓ Good — no user-visible impact |
| Strip bounding box fields from cache entries | Reduces KV payload by ~40%; bbox not needed for citation matching | ✓ Good — smaller payloads |
| Vitest with ESM imports + Chrome API stubs | Test pure functions without browser; vi.stubGlobal for Chrome APIs | ✓ Good — 95 tests, fast CI |
| Golden baseline snapshot testing | Frozen expected outputs detect regressions before/after algorithm changes | ✓ Good — caught issues early |
| Cross-boundary gutter contamination strip | PDF items spanning columns embed gutter numbers; strip before line filter | ✓ Good — fixed systematic failures |
| Wrap-hyphen normalization in matchAndCite | HTML copy artifacts (`trans- actions`) stripped before matching | ✓ Good — 100% accuracy |
| CSS class injection for SVG icon generation | String replacement avoids librsvg version dependency | ✓ Good — reproducible builds |
| Three-state icon via chrome.action.setIcon | Tab-scoped icon transitions; gray default from manifest, no explicit reset needed | ✓ Good — clear visual feedback |
| options_ui with open_in_tab: true | Standard Chrome extension pattern; full-page settings experience | ✓ Good — clean UX |
| GitHub Pages docs/ folder for privacy policy | No separate service; same repo; auto-deployed on push to main | ✓ Good — zero maintenance |
| Zero new npm deps for v3.1 pipeline | Pure Node 22 built-ins on existing primitives (llm-driver, pdf-verifier, e2e-report-issue, Playwright) | ✓ Good — supply-chain risk unchanged across milestone |
| Subscription-local LLM only; `invokeClaudePWithLedger` wrapper required | Cost control + CI guard; direct `invokeClaudeP` calls ESLint-restricted | ✓ Good — caught accidental CI invocation in tests |
| Fingerprint immutability + additive v2 | v1 formula immutable for v3.0 consumers; `findMatchingIssue` dual v1/v2 search during transition | ✓ Good — no retroactive dedup breakage |
| Quarantine spec runs inside `e2e-nightly.yml` (non-gating) | Avoids concurrency group collision; `continue-on-error: true` keeps regression gates intact | ✓ Good — runs every nightly tick |
| Automatic golden promotion blocked | Destroys trust invariant; promotion stays human-gated via `promote-from-quarantine.mjs` | ✓ Good — `quarantine:ready-for-promotion` label surfaces candidates |
| Heuristic-first hybrid triage | 6/8 ERROR_CLASSES resolved without LLM; only ambiguous remainder routed to grouped LLM call | ✓ Good — cost-controlled by cluster pre-filter |
| `verifier_strong_agreement` (Tier A/B only) | Tier C agreements escalate to LLM second-pass — prevents Tier C masking | ✓ Good — Vitest guard test pins behavior |
| PDF text in `<patent_data>` XML tags | Isolates PDF body content from LLM instructions (prompt-injection defense) | ✓ Good — pinned by triage classifier tests |
| Per-section char budgets + fingerprint on line 1 | LLM rationale ≤800, verifier windows ≤600, golden diff ≤400; fingerprint on line 1 prevents >65,536 char overflow displacement | ✓ Good — issue UI renders cleanly |
| Weekly digest via GitHub Discussion + Issue fallback | `gh api graphql createDiscussion` primary; `e2e-digest` labeled issue if Discussions disabled | ✓ Good — verified live at Phase 37 start |
| `aggregateBySummaryKey` helper in weekly-digest.mjs | Maps ERROR_CLASS_SET → SUMMARY_KEYS; seeds passed/harness_error to 0 (synthetic classes); resolves DIGEST-04 self-reference | ✓ Good — Phase 38 INT-FIX-02 |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-30 after v3.1 milestone (LLM-Driven Product Improvement Loop) shipped*

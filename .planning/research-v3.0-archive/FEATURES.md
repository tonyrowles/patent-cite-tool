# Feature Research — Autonomous E2E Testing Agent

**Domain:** E2E testing harness for a browser extension (Chrome MV3 + Firefox), with deterministic golden regression + LLM-driven exploratory coverage and an independent PDF verifier.
**Researched:** 2026-05-12
**Confidence:** HIGH for harness/Playwright mechanics; HIGH for verifier oracle design (Tier-mirroring fuzzy match is the only viable contract given the extension's own fuzziness); MEDIUM for LLM-exploration ergonomics (the space is moving fast — leaning on Claude Code skill + structured tool calls is the conservative bet).

---

## Scope Reminder

This milestone ships **testing infrastructure only** — zero new functionality in the extension. The agent must:

1. Drive a Chromium build of the extension against real `patents.google.com` pages.
2. Replay 76 golden cases deterministically (local + nightly cron).
3. Optionally explore fresh patents under LLM control (local-only, Claude Code subscription).
4. Verify each citation by independently re-parsing the source PDF.
5. Emit machine-readable + human-readable failure diagnostics.

All features below are scoped to that mission.

---

## Feature Landscape

### Table Stakes (Without These, the Harness Is Not Useful)

| # | Feature | Why Expected | Complexity (1-5) | Depends On | Notes |
|---|---------|--------------|------------------|------------|-------|
| TS-01 | **Unpacked extension load via `launchPersistentContext`** | Only supported way to drive an MV3 extension in Playwright | 2 | dist/chrome/ build artifact | Use `--disable-extensions-except` + `--load-extension`; headed for MV3 service worker reliability, optional `--headless=new` once stable. One-line description: "Launch Chromium with the unpacked extension preloaded so content scripts run on `patents.google.com`." |
| TS-02 | **Patent page load + ready-state wait** | The plugin injects asynchronously; tests must wait for the PDF link to appear | 2 | TS-01 | Mirror the extension's own `waitForPdfLink` MutationObserver pattern, but in test-land wait for a stable signal (e.g., `[href$=".pdf"][href*="patentimages"]` locator). One-line: "Navigate to `/patent/<id>` and resolve once the extension has signalled readiness." |
| TS-03 | **Programmatic text selection by character offset** | The plugin only fires on real DOM selections; tests must reproduce a known highlight | 3 | TS-02 | Use `page.evaluate` with `document.createRange` + `Selection.setBaseAndExtent` against the description container. Baseline fixtures must store **stable anchors** (e.g., `{containerSelector, charStart, charEnd}` or a unique substring) rather than raw text snippets that may collide. One-line: "Given a fixture descriptor, programmatically place a real DOM Selection over the target text." |
| TS-04 | **Trigger dispatch — all three modes** | Plugin supports floating button / auto / context menu; harness must exercise each path | 3 | TS-03 | Floating-button mode: wait for the Cite button to appear in the shared Shadow DOM root, click it. Auto mode: simply wait for the popup. Silent (Ctrl+C) mode: dispatch a real `copy` event after selection and read `navigator.clipboard.readText()` via a granted permission. One-line: "Fire the trigger appropriate for the mode under test and resolve when the citation surface is visible." |
| TS-05 | **Citation read-back from Shadow DOM + clipboard** | The output surfaces are the popup (closed Shadow DOM) and the clipboard — both must be inspectable | 3 | TS-04 | Playwright locators pierce open shadow roots by default; the extension's UI uses `mode: 'closed'`, so the test build will need a thin "test mode" hook OR the harness must read via `chrome.scripting.executeScript` from a privileged context. Conservative path: ship a debug bridge that the extension exposes only when `process.env.PATENT_CITE_E2E === '1'`. One-line: "Extract the rendered citation string + confidence color from the in-page UI, or the appended clipboard text in silent mode." |
| TS-06 | **Golden baseline driver** | Already have `tests/golden/baseline.json` with 76 entries — the agent must replay each | 2 | TS-03..05 | One Playwright test per entry, parameterised via `test.describe.parallel` with sharding. Compare against `{citation, confidence}` with tolerance for confidence rounding (`±0.01`). One-line: "Iterate every golden entry, run the full trigger flow, and assert the citation + confidence match the snapshot." |
| TS-07 | **Independent PDF re-parse verifier** | A "verifier" that uses the extension's own pipeline proves nothing — must be a separate code path | 4 | None (parallel module) | Use `pdfjs-dist` in Node + (optionally) `pdftotext` (poppler) for differential cross-check. Verifier contract: given `(patent_id, selected_text, cited_col, cited_line_start, cited_line_end)`, fetch the PDF, extract a per-page word list with `y/x` coords, infer columns by `x`-bimodality, and confirm a fuzzy match of `selected_text` lives within `±2` lines of `(col, line_range)`. One-line: "Re-derive the answer from the PDF using a second code path and confirm overlap with the extension's citation." |
| TS-08 | **Failure diagnostics bundle** | Asking "why did this fail?" must not require local repro | 3 | TS-06 + Playwright reporter API | On any assertion failure, capture: full-page screenshot, full DOM snapshot (`page.content()`), the Shadow DOM contents of the citation popup, the cited PDF page rendered to PNG with the cited line range highlighted, and the raw expected-vs-actual diff. Pack into `.planning/test-results/<run-id>/<case-id>/`. One-line: "On failure, emit a self-contained folder with everything needed to triage offline." |
| TS-09 | **Local npm script entry point** | Devs must be able to run `npm run e2e` locally | 1 | TS-06 | Wraps `playwright test`; respects `--grep` and `--shard` flags. One-line: "Single `npm run e2e` command that runs the deterministic suite end-to-end on a clean profile." |
| TS-10 | **GitHub Actions nightly cron** | Stated goal in milestone | 2 | TS-09 | `schedule: cron: '0 7 * * *'` (02:00 ET). Use the `xvfb-run` wrapper for headed Chromium on `ubuntu-latest`, or `headless=new`. Upload `playwright-report/` + diagnostics bundles as artifacts. One-line: "Nightly workflow that runs the deterministic suite and uploads diagnostics on any failure." |
| TS-11 | **JSON results contract** | Both local + cron + LLM mode consume the same schema | 2 | TS-06, TS-07 | Schema per case: `{caseId, patentId, mode, expected, actual, verifierResult, status: 'pass'|'fail'|'flake'|'skipped', diagnostics: {screenshot, dom, pdfSnippet}, timingMs, errorClass}`. One-line: "Canonical JSON schema that the runner, verifier, and reporter all read/write." |
| TS-12 | **Failure classification taxonomy** | Without a class label, every failure looks the same | 2 | TS-11 | Classes (one per failure root): `EXTENSION_LOAD_FAIL`, `NO_CITATION_PRODUCED`, `CITATION_MISMATCH`, `CONFIDENCE_REGRESSION`, `VERIFIER_DISAGREE` (extension says X, PDF re-parse says Y), `UI_RENDER_FAIL`, `GOOGLE_DOM_DRIFT`, `USPTO_API_DRIFT`, `PDF_FETCH_FAIL`, `TIMEOUT`. One-line: "Each failure is tagged with exactly one class to enable triage-by-grep." |
| TS-13 | **HTML report (Playwright built-in is sufficient)** | Engineers expect to click through failures with screenshots/traces | 1 | TS-08 | Playwright's HTML reporter + trace viewer covers this for free; only add a custom summary page that surfaces the failure-class breakdown. One-line: "Publish Playwright's HTML report with a single custom 'failure class' summary at the top." |
| TS-14 | **Network/data drift guard** | Tests must distinguish "code broke" from "Google changed their HTML" or "USPTO changed their response" | 3 | TS-12 | Pin a small set of canonical DOM probes (e.g., "does `a[href*='patentimages']` still exist on at least one known patent?"). If those fail, classify the entire run as `GOOGLE_DOM_DRIFT` and surface separately — do not flag every test as a citation regression. One-line: "Run pre-flight probes that detect upstream drift and short-circuit the run with a clear diagnosis." |

### Differentiators (Justify the "Autonomous Agent" Framing)

| # | Feature | Value Proposition | Complexity (1-5) | Depends On | Notes |
|---|---------|-------------------|------------------|------------|-------|
| DF-01 | **LLM exploratory mode via Claude Code skill** | This is the singular differentiator vs vanilla Playwright; without it, the milestone is just "more regression tests" | 4 | TS-03..05, TS-07, TS-11 | Use a Claude Code skill (or Agent SDK programmatic invocation) that exposes a **narrow tool surface**: `pickPatent({hint?})`, `pickSelectionInPatent({patentId, hint?})`, `runCitation({patentId, selectionDescriptor, mode})`, `verify({result})`. The agent gets a **mission** ("find a chemical patent with subscripts and probe whether OCR-normalized text still cites the right column") and decides *which* patent + *where* to highlight. Critical design choice: **the LLM does not write Playwright code** — it calls tools. This keeps flakiness < 1.5% per industry data and avoids "agent fabricates a CSS selector" failure mode. One-line: "Claude Code drives a structured tool API to pick patents, select text, and trigger the plugin under a stated mission." |
| DF-02 | **Selection-granularity decision is the LLM's, but bounded** | Right granularity per quality-gate prompt | 3 | DF-01 | The agent picks *(patent, page-of-spec, semantic anchor: "first paragraph", "claim 1 preamble", "cross-column boundary", "chemical formula", "near gutter")*; the harness handles the mechanical part of resolving the anchor to a DOM Range. Anti-pattern: letting the LLM pick raw `(x, y)` pixel coordinates — too fragile, no semantic value. One-line: "LLM picks semantic anchors; harness deterministically resolves them to DOM ranges." |
| DF-03 | **Mission templates ("find a patent with X and stress Y")** | Turns exploration from random into hypothesis-driven, mirroring how a human QA engineer thinks | 3 | DF-01 | Ship 5-10 missions as YAML: `find-headerless-column`, `stress-gutter-tolerant-tier5`, `cross-column-on-chemical-patent`, `pre-2000-OCR-heavy`, `repetitive-anchor-disambiguation`. Each mission has: seed corpus, success/failure criteria, max iterations. One-line: "Reusable YAML missions that target known fragile algorithms (Tier 5, gutter strip, OCR normalization)." |
| DF-04 | **Verifier as oracle, not just a checker** | When verifier and extension disagree, we don't yet know which is right — the diagnostic must surface both | 4 | TS-07 | When `verifier.foundLineRange` ≠ `extension.citedLineRange`, emit both, plus the PDF page snippet, plus a confidence delta. **Do not auto-fail** on verifier-only disagreement at high confidence — log as `VERIFIER_DISAGREE` for human review. This prevents the verifier from becoming a second source of golden truth that masks real regressions. One-line: "Verifier disagreement is a flag for review, not an automatic failure verdict." |
| DF-05 | **Auto-issue filing with structured body** | Nightly cron stated requirement; differentiates from "just upload artifacts" | 2 | TS-12, TS-13, gh CLI in Actions | On first failure of a new class (de-dupe by `{caseId, errorClass, top-of-stack-hash}`), open a GitHub issue with: failure class, expected vs actual, screenshot URL, PDF snippet URL, link to the HTML report. On subsequent failures of the same signature, comment with run link instead of opening a new issue. One-line: "Cron failures auto-file (or comment on) a GitHub issue with diagnostics inline." |
| DF-06 | **Trend tracking across runs** | Single run is a snapshot; the value compounds with history | 3 | TS-11 | Append each run's JSON summary to `tests/e2e/history.jsonl` (gitignored, optionally uploaded as a release asset). Generate a simple "pass rate / failure class breakdown / new-failures-this-week" markdown summary in the report. One-line: "Per-run JSONL history that feeds a simple trend page (no dashboard service required)." |
| DF-07 | **Cross-browser parity** (Chrome + Firefox) | The extension is cross-browser; the harness ought to be too | 4 | TS-01..09 | Firefox + Playwright is supported but extension loading uses `firefox.launch({ firefoxUserPrefs, args: ['-juggler', ...] })` plus a `web-ext`-prepared profile. **Suggest deferring to a follow-up phase** unless explicitly in v3.0 scope — Chromium is sufficient to validate the entire harness contract first. One-line: "Run the same suite on Firefox via a parallel project in `playwright.config.ts`." |
| DF-08 | **Flake quarantine** | Real Google Patents pages have transient failures; harness must distinguish flake from regression | 3 | TS-11, TS-12 | Auto-retry once on `TIMEOUT` and `PDF_FETCH_FAIL`. If the second attempt passes, classify as `flake` (not `fail`). Surface flake rate in the trend report. One-line: "Single retry on infrastructure-class failures; flake-classified runs do not fail the suite." |

### Anti-Features (Tempting, but Out of v3.0 Scope)

| # | Feature | Why Requested | Why Problematic | Alternative |
|---|---------|---------------|-----------------|-------------|
| AF-01 | **Visual regression / pixel diff on Google Patents** | "Catch UI breakage" | Google ships UI changes weekly; pixel diffs will flake every other day and bury real regressions | Trust DOM-structure probes (TS-14) + functional citation correctness; do not chase pixel parity on a third-party SPA |
| AF-02 | **Standalone web UI for browsing test results** | "Nice to have a dashboard" | Maintenance burden, auth surface, hosting cost — for a one-person tool | Playwright HTML report + GitHub issue stream + JSONL history is enough |
| AF-03 | **LLM writing Playwright test code directly** | "Maximum flexibility" | Industry data: LLM-generated Playwright code has 5-10× the flake rate of structured-tool agents; debugging fabricated selectors is a tax | Narrow tool API (DF-01); LLM picks *what* to test, harness handles *how* |
| AF-04 | **Mocking Google Patents / USPTO responses** | "Stable tests" | Defeats the purpose — this milestone exists to catch upstream drift | Real network; isolate drift via probes (TS-14); allow cron to "fail soft" on drift class |
| AF-05 | **Coverage metrics on extension code from E2E runs** | "Validate the harness exercises everything" | Coverage instrumentation in MV3 service workers is brittle; the 76-case golden suite already maps to algorithm tiers | Annotate each golden case with the tier(s) it exercises in a separate manifest; assert tier coverage is non-zero |
| AF-06 | **Self-healing selectors / AI-driven retry on UI changes** | "Resilient to Google updates" | Black-box "the agent will figure it out" hides genuine breakage and turns regressions into silent test mutations | Explicit DOM-drift detection (TS-14) that *fails loudly* — humans decide whether to update the harness |
| AF-07 | **Generating new golden baseline entries automatically** | "Grow the corpus without manual work" | Auto-generated baselines encode whatever the extension currently does — including its bugs. Golden entries must be human-verified | LLM mode can *propose* new entries (writes to `proposed-baseline.json`); a human reviews + promotes |
| AF-08 | **Running on Chrome stable / Chrome Beta / Chrome Canary matrix** | "Catch upcoming Chrome breakage" | 3× CI cost, mostly the same result; MV3 ships slowly | Stick with Playwright's bundled Chromium; revisit only if a Chrome stable regression actually slips through |
| AF-09 | **Performance benchmarking (parse time per patent)** | "While we're driving real pages anyway" | Conflates two missions; perf benchmarking needs different methodology (no network jitter, multiple runs, stable timing) | Out of scope — separate milestone if ever needed |
| AF-10 | **Replaying *real user* highlight gestures (drag with mouse events)** | "More realistic" | `Selection.setBaseAndExtent` is what the browser ends up calling anyway; mouse-drag adds flake without changing what the extension sees | Deterministic Range API; only add mouse-drag if a specific bug requires it |

---

## Feature Dependencies

```
TS-01 (load extension)
   └── TS-02 (page ready)
          └── TS-03 (programmatic selection)
                 └── TS-04 (trigger dispatch)
                        └── TS-05 (read citation)
                               └── TS-06 (golden driver) ─┐
                                                          ├── TS-11 (JSON contract)
                          TS-07 (PDF verifier) ───────────┤        └── TS-12 (failure class)
                                                          │               └── DF-05 (auto-issue)
                                                          │               └── DF-06 (trend)
                                                          │               └── DF-08 (flake quarantine)
                                                          └── TS-13 (HTML report)

TS-06 ──> TS-09 (npm script) ──> TS-10 (cron) ──> DF-05
TS-14 (drift guard) ──short-circuits──> TS-06 + DF-05

DF-01 (LLM exploratory) ──requires──> TS-03, TS-04, TS-05, TS-07, TS-11
   └── DF-02 (semantic anchors) ──enables──> DF-03 (mission templates)
                                                  └── DF-04 (oracle disambiguation)

DF-07 (Firefox parity) ──parallel-project of──> TS-01..TS-09
```

### Dependency Notes

- **TS-03 (programmatic selection) is the load-bearing primitive.** Both deterministic mode (TS-06) and LLM mode (DF-01) call it. Get its contract right (stable anchors, not raw text) before anything else.
- **TS-07 (verifier) is independent of the harness.** Build it as a standalone Node module with its own CLI (`node tools/pdf-verify.mjs <patent_id> "<text>" <col>:<line>`); the harness imports it. This makes the verifier itself unit-testable.
- **TS-11 (JSON contract) gates DF-05/06/08.** Define the schema *first*, before writing the runner; otherwise auto-issue body, trend tracker, and flake quarantine each invent their own.
- **DF-01 depends on the full table-stakes harness existing.** LLM mode is the *consumer* of TS-01..TS-12, not a replacement for them. Build deterministic first; LLM second.
- **TS-14 (drift guard) conflicts with AF-06 (self-healing).** Drift guard says "fail loudly when Google changes"; self-healing says "silently adapt." Pick drift guard.

---

## MVP Definition (Phase Suggestions)

### Phase 1: Deterministic Harness (P1 — must ship)
The 76-case replay loop, the failure diagnostics bundle, local + cron. Without this, nothing else matters.

- [ ] TS-01 Unpacked extension load
- [ ] TS-02 Page ready-state wait
- [ ] TS-03 Programmatic selection by stable anchor
- [ ] TS-04 Trigger dispatch (all 3 modes)
- [ ] TS-05 Citation read-back (popup + clipboard)
- [ ] TS-06 Golden baseline driver
- [ ] TS-08 Failure diagnostics bundle
- [ ] TS-09 `npm run e2e`
- [ ] TS-11 JSON results contract
- [ ] TS-12 Failure classification taxonomy
- [ ] TS-13 HTML report

### Phase 2: Independent Verifier (P1 — must ship)
The PDF re-parse oracle. Can be developed in parallel with Phase 1 since it has zero harness dependencies.

- [ ] TS-07 Independent PDF re-parse verifier
- [ ] Verifier integration into TS-06 + TS-11

### Phase 3: Cron + Drift + Reporting (P1 — must ship)
Operationalise the harness.

- [ ] TS-10 GitHub Actions nightly cron
- [ ] TS-14 Drift guard pre-flight probes
- [ ] DF-05 Auto-issue filing
- [ ] DF-08 Flake quarantine

### Phase 4: LLM Exploratory Mode (P1 — the differentiator)
The "autonomous agent" half of the milestone. Local-only, gated by `CLAUDE_CODE_E2E=1`.

- [ ] DF-01 Claude Code skill + narrow tool API
- [ ] DF-02 Semantic anchor resolver
- [ ] DF-03 Mission template library (5-10 missions)
- [ ] DF-04 Verifier-disagreement oracle wiring

### Phase 5: History + Trend (P2 — should have)
- [ ] DF-06 Trend tracking + weekly summary

### Phase 6: Cross-Browser (P3 — defer unless explicitly in scope)
- [ ] DF-07 Firefox parity (parallel Playwright project)

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| TS-01..05 (load → trigger → read) | HIGH | MEDIUM | P1 |
| TS-06 Golden driver | HIGH | LOW | P1 |
| TS-07 PDF verifier | HIGH | HIGH | P1 |
| TS-08 Diagnostics bundle | HIGH | MEDIUM | P1 |
| TS-09 Local npm | HIGH | LOW | P1 |
| TS-10 Cron | HIGH | LOW | P1 |
| TS-11 JSON contract | HIGH | LOW | P1 (do early) |
| TS-12 Failure classes | HIGH | LOW | P1 |
| TS-13 HTML report | MEDIUM | LOW (built-in) | P1 |
| TS-14 Drift guard | HIGH | MEDIUM | P1 |
| DF-01 LLM exploratory | HIGH | HIGH | P1 (differentiator) |
| DF-02 Semantic anchors | HIGH | MEDIUM | P1 |
| DF-03 Mission templates | MEDIUM | MEDIUM | P1 |
| DF-04 Oracle disambiguation | MEDIUM | LOW | P1 |
| DF-05 Auto-issue | HIGH | LOW | P1 |
| DF-06 Trend tracking | MEDIUM | LOW | P2 |
| DF-07 Firefox parity | MEDIUM | HIGH | P3 |
| DF-08 Flake quarantine | MEDIUM | LOW | P1 |

---

## Specific Answers to the Quality-Gate Sub-Questions

### 1. Deterministic regression loop — what variations exist?

Standard loop:
```
for each (patent_id, selection_anchor, expected_citation, expected_confidence) in baseline.json:
   page.goto(`/patent/${patent_id}`)
   wait for plugin readiness (PDF link in DOM)
   programmatically place Selection over anchor
   dispatch trigger (mode-specific)
   read citation from popup Shadow DOM (or clipboard for silent)
   assert citation === expected && |confidence - expected_conf| ≤ 0.01
   (optionally) verifier.confirm(patent_id, selected_text, citation)
```

Worthwhile variations:
- **Mode matrix.** Each entry × 3 trigger modes — but only 1 mode per entry by default to keep cron < 30 min; full matrix on demand via `--mode=all`.
- **Cold-vs-warm cache.** First run hits the PDF pipeline; second run hits IndexedDB. The plugin uses CACHE_VERSION; tests should run both with cleared and warm storage at least once per cron.
- **KV-cache hit vs miss.** Force-bypass the Cloudflare KV via a request interceptor on `~10%` of cases to exercise the local-parse path.
- **Confidence-tier coverage.** Tag each baseline entry with the matching tier it should hit (Tier 1 exact, Tier 5 gutter-tolerant, etc.) and assert tier coverage in the report.

### 2. LLM exploratory mode — granularity of decisions

Right granularity (do this):
- Pick patent (from a curated seed corpus of ~500 patents, or by category hint like "chemical / pre-2000 / cross-column").
- Pick **semantic anchor**: claim 1 preamble, first paragraph of detailed description, near a chemical formula, spanning a column boundary, OCR-heavy section.
- Pick trigger mode.
- Trigger and verify.

Wrong granularity (do NOT do this):
- Pick a bounding box `(x, y, width, height)` — fragile, no insight.
- Write Playwright code directly — flake city.
- Free-form chat ("test the matcher harder") without missions — wastes iterations.

The LLM is best at **judgement** (which patent looks adversarial, which selection looks tricky), not at **mechanics** (clicking, selecting). Tool surface from DF-01 enforces that split.

### 3. Verifier contract

Given `(patent_id, selected_text, cited_col, cited_line_start, cited_line_end)`:

1. Fetch PDF (via the same USPTO/Google URL the extension uses, but in Node).
2. Extract a per-page word list with coordinates using `pdfjs-dist` (Node build).
3. Independently infer column boundaries by bimodal `x`-coordinate analysis (parallel implementation, not a shared module with the extension).
4. Locate the words at `(cited_col, cited_line_start..cited_line_end ± 2)`.
5. Fuzzy-match `selected_text` against that window (use a different fuzzy algorithm than the extension — e.g., token-overlap Jaccard with a 0.8 threshold, where the extension uses Levenshtein + bookend).
6. Return `{ found: bool, foundAt: {col, lineStart, lineEnd} | null, score: 0..1, method: 'jaccard' | 'fallback-pdftotext' }`.

Why fuzzy and not exact: the extension itself uses fuzzy matching (Tier 1-5), so exact match would over-reject. The verifier's job is to confirm "the selected text plausibly lives at the claimed location," not to re-derive the *same* answer.

Why `±2 lines` tolerance: PDF line clustering can differ by one line depending on `y` tolerance choice; column inference for headerless PDFs has known fragility (per recent v2.3 phase). A 2-line window is wide enough to absorb implementation differences, tight enough to catch real "extension cited column 5 but text is in column 7" bugs.

Optional cross-check: shell out to `poppler-utils pdftotext -layout <page>` and run the same fuzzy match against its output. Three-way agreement (extension ≈ pdfjs-verifier ≈ pdftotext) is the strongest signal. Disagreement between verifier methods is a `VERIFIER_DISAGREE` flag.

### 4. Failure-mode coverage

All five classes from the question map to TS-12's taxonomy:

| Question's class | Taxonomy class | Detected by |
|---|---|---|
| (a) Plugin doesn't load | `EXTENSION_LOAD_FAIL` | Service worker not registered after navigation; no content script log |
| (b) Plugin loads, no citation | `NO_CITATION_PRODUCED` | Trigger fires but popup never appears within timeout |
| (c) Wrong citation | `CITATION_MISMATCH` (deterministic) or `VERIFIER_DISAGREE` (exploratory) | Golden diff or verifier disagreement |
| (d) UI broken | `UI_RENDER_FAIL` | Popup appears but expected child elements (`.citation-text`, `.confidence-badge`) missing |
| (e) Upstream drift | `GOOGLE_DOM_DRIFT` or `USPTO_API_DRIFT` | TS-14 probes failing |

Plus the harness adds: `CONFIDENCE_REGRESSION` (citation matches but confidence dropped below threshold), `PDF_FETCH_FAIL`, `TIMEOUT`.

### 5. Reporting

- **Machine-readable:** TS-11 JSON contract per run + appended JSONL history (DF-06).
- **Human-readable:** Playwright HTML report (TS-13, free) + a custom 50-line summary page with failure-class breakdown.
- **Cron failures:** Auto-issue body (DF-05) with class, expected/actual, image links, run link.
- **Trend:** Weekly markdown summary generated from JSONL history, committed (or attached as artifact) on Sundays.

Do NOT build: a hosted dashboard, a SaaS integration, a Slack notifier (anti-feature AF-02).

### 6. What makes this different from "more Playwright tests"

| Vanilla Playwright | Autonomous Agent (this milestone) |
|---|---|
| Hand-written assertions per test | LLM picks patents + selections per mission (DF-01..04) |
| Pass/fail per case | Failure class taxonomy + verifier disagreement signal (TS-12, DF-04) |
| Asserts against expected output | Asserts against expected **and** independently verified output (TS-07) |
| Static test set | Mission-driven exploration that grows the proposed-baseline pile (DF-03 + AF-07 alternative) |
| Trace viewer for human debug | Self-contained diagnostics bundle for offline + auto-filed issue (TS-08, DF-05) |
| "Did the code change break the test?" | Also: "Did the upstream change break the test?" (TS-14 drift guard) and "Did the test break itself?" (DF-08 flake quarantine) |

If you strip out DF-01..04, what remains is "really good Playwright tests with a custom verifier." That's still valuable, but the LLM exploratory mode is what unlocks finding **bugs that nobody thought to write a test for** — which is the only way to make progress against the long tail of patent-specific edge cases (chemical, OCR-heavy, headerless columns, gutter-contaminated).

---

## Sources

- [Chrome extensions | Playwright](https://playwright.dev/docs/chrome-extensions) — official guidance on `launchPersistentContext` + `--load-extension` for MV3 extensions
- [Setup for Testing Chrome Extensions with Playwright — DEV](https://dev.to/christinepinto/embarking-on-a-playwright-journey-testing-chrome-extensions-9p) — practical MV3 service-worker reset patterns
- [Best Practices | Playwright](https://playwright.dev/docs/best-practices) — load built artefact, assert outcomes not implementation
- [Trace viewer | Playwright](https://playwright.dev/docs/trace-viewer) — built-in DOM snapshots, screenshots, action timeline
- [Reporters | Playwright](https://playwright.dev/docs/test-reporters) — HTML reporter as the default human-facing surface
- [Locators | Playwright](https://playwright.dev/docs/locators) — open-mode Shadow DOM piercing; closed-mode caveat
- [Playwright's Playbook: Conquering Shadow DOM (Helpshift Engineering)](https://medium.com/helpshift-engineering/playwrights-playbook-conquering-shadowdom-elements-with-ease-35b65bfb8008) — read-only access patterns when shadow root is closed
- [shadow-dom-selection explainer](https://github.com/mfreed7/shadow-dom-selection) — `Selection.setBaseAndExtent` semantics across shadow trees
- [Claude Code with Playwright: 4-agent test generation pipeline | TestDino](https://testdino.com/blog/claude-code-with-playwright) — pipeline structure (exploration / generation / automation / maintenance)
- [Building an AI QA Engineer with Claude Code and Playwright MCP — alexop.dev](https://alexop.dev/posts/building_ai_qa_engineer_claude_code_playwright/) — Claude Code skill pattern for orchestrating a browser
- [playwright-skill (lackeyjb/playwright-skill)](https://github.com/lackeyjb/playwright-skill) — reference implementation of a Claude Code skill that exposes a narrow Playwright tool surface
- [Autonomous Software Testing: Tools, AI Models & Guide 2026 — testomat.io](https://testomat.io/blog/autonomous-testing/) — hybrid human-curated + autonomous-explored is the best-practice pattern
- [AI E2E Testing: What It Actually Means in 2026 — Autonoma AI](https://getautonoma.com/blog/ai-e2e-testing) — flake rates < 1.5% for role-based-locator structured agents
- [Playwright AI Test Generation: Complete 2026 Guide — buildbetter.ai](https://blog.buildbetter.ai/playwright-test-generation-with-ai-complete-2026-guide/) — cost data ($0.50–$2.00 per discovered flow) supports gating LLM mode to local-dev only
- [Snowtide PDF text extraction performance comparison](https://www.snowtide.com/performance) — `pdftotext` ≈ 13% faster than alternatives; differential cross-check viable
- [jalan/pdftotext (Python wrapper around poppler)](https://github.com/jalan/pdftotext) — secondary extractor for differential verification
- [Towards Cross-Build Differential Testing — Oracle Labs](https://labs.oracle.com/pls/apex/f?p=94065:10:654869772529:11549) — differential testing as evidence-for-disagreement, not equivalence proof
- [reg-viz/reg-actions](https://github.com/reg-viz/reg-actions) — example pattern for diff-on-failure artefacts via GitHub Actions
- [Visual Regression Testing using Playwright and GitHub Actions — duncanmackenzie.net](https://www.duncanmackenzie.net/blog/visual-regression-testing/) — nightly-cron + artefact-upload reference
- [E2E Testing in GitHub Actions: Setup Guide (2026) — Shiplight AI](https://www.shiplight.ai/blog/github-actions-e2e-testing) — `schedule: cron` patterns and headed-Chromium-on-ubuntu-latest tips

---

*Feature research for: autonomous E2E testing agent (Playwright + Chromium harness + LLM exploration + independent PDF verifier) layered on the existing patent citation extension.*
*Researched: 2026-05-12*

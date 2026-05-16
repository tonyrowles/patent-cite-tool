# Requirements: v3.0 Autonomous E2E Testing Agent

**Milestone goal:** Build a Playwright-driven testing agent that exercises the extension against real Google Patents pages, observes the citations the plugin produces, and verifies them by independently re-parsing the source PDF — catching cross-browser bugs, Google UI drift, and accuracy regressions that unit tests cannot.

**Scope discipline:** This is testing infrastructure. The only allowed change to the production extension is non-functional test hooks (`data-testid` attributes) and a small Cloudflare Worker change (`X-PCT-Test-Mode` header). No matching/parsing/citation behavior changes in this milestone.

## v3.0 Requirements

### Harness (HARN)

- [ ] **HARN-01**: A Playwright + Chromium harness loads the freshly-built unpacked Chrome extension (`dist/chrome/`) in a persistent context and successfully navigates to a Google Patents page.
- [ ] **HARN-02**: The harness waits for the extension's service worker to be active before triggering user interactions, so tests do not race the SW startup.
- [ ] **HARN-03**: The harness can read into the extension's closed Shadow DOM citation UI via an `addInitScript` shim that forces `attachShadow({mode: 'closed'})` calls to return open roots in the test context only.
- [ ] **HARN-04**: The harness can read clipboard contents in Chromium headless mode (via `clipboard-read` permission grant or an equivalent shim), so silent-mode Ctrl+C citations are observable.
- [ ] **HARN-05**: The harness exposes a reusable library (`tests/e2e/lib/`) with framework-agnostic primitives for: extension load, navigation, selection, citation observation, artifact capture. Specs and orchestrators import from `lib/`; no logic in spec files.

### Test Hooks (HOOK)

- [ ] **HOOK-01**: The extension's citation UI exposes `data-testid` attributes on the Shadow DOM host element and the visible citation pill, so tests reference stable hooks rather than CSS class names.

### Selection + Citation Observation (SEL)

- [ ] **SEL-01**: A `selectText({containerSelector, charStart, charEnd})` (or unique-substring) helper performs a deterministic text selection on a Google Patents page using the Range API + a dispatched `mouseup` event, which the extension's existing trigger code receives correctly.
- [ ] **SEL-02**: A `getCitation()` helper reads the plugin's citation output (from the Shadow DOM pill OR from the clipboard for silent-mode), returning a structured `{citation: string, confidence: 'green'|'yellow'|'red', mode: 'sync'|'async'}` value.
- [ ] **SEL-03**: A deterministic regression suite replays all 76 golden patents (from `tests/golden/baseline.json`) end-to-end through the harness and asserts each citation matches the golden expected value.
- [ ] **SEL-04**: Test state is fully reset between cases (cookies, IndexedDB, extension storage) so cases cannot influence each other.

### Independent Verifier (VFY)

- [ ] **VFY-01**: An independent PDF verifier module accepts `{patent_id, selected_text, cited_column_line}` and returns a structured pass/fail by re-parsing the source PDF and searching for the selected text near the cited location.
- [ ] **VFY-02**: The verifier uses a code path that does NOT import from `src/shared/` or otherwise reuse the extension's matching logic; an ESLint `no-restricted-imports` rule enforces this at lint time.
- [ ] **VFY-03**: The verifier applies a tiered matcher (exact → whitespace-normalized → fuzzy with ±N-line tolerance, where N is calibrated against the 76-case corpus) so that legitimate text-extraction differences between `pdfjs-dist` (Node) and the extension's parsing path do not produce false negatives.

### Failure Diagnostics (DIAG)

- [ ] **DIAG-01**: On a failed assertion, the harness captures a full-page screenshot showing the highlight + plugin UI state and writes it to `tests/e2e/artifacts/{run-id}/{case-id}-screenshot.png`.
- [ ] **DIAG-02**: On a failed assertion, the harness captures a DOM snapshot (selection range + Shadow DOM contents) to `tests/e2e/artifacts/{run-id}/{case-id}-dom.html`.
- [ ] **DIAG-03**: On a verifier disagreement, the harness renders the PDF page region corresponding to the cited column:line and writes the cropped PNG to `tests/e2e/artifacts/{run-id}/{case-id}-pdf-snippet.png`.

### Reporting (RPT)

- [ ] **RPT-01**: Every test run produces a structured JSON report (`tests/e2e/artifacts/{run-id}/report.json`) listing all cases with pass/fail status, errorClass (one of a defined taxonomy), and links to per-case artifacts.
- [ ] **RPT-02**: The JSON report classifies failures into a fixed taxonomy: `EXTENSION_NOT_LOADED`, `NO_CITATION_PRODUCED`, `WRONG_CITATION`, `UI_BROKEN`, `VERIFIER_DISAGREE`, `GOOGLE_DOM_DRIFT`, `USPTO_API_DRIFT`, `FLAKE`.

### CI Cron (CRON)

- [x] **CRON-01**: A new GitHub Actions workflow (`.github/workflows/e2e-nightly.yml`) runs the deterministic E2E suite on a `cron: '0 6 * * *'` schedule (06:00 UTC daily) with `workflow_dispatch` for manual runs.
- [ ] **CRON-02**: Nightly cron runs a rotating 30-patent sample from the 76-case corpus; the Sunday run runs the full 76.
- [x] **CRON-03**: The cron workflow installs Playwright + Chromium in CI without `xvfb-run` (using `channel: 'chromium'` for headless extension support) and uploads artifacts on failure.
- [ ] **CRON-04**: On cron failure, a reporter script (`scripts/e2e-report-issue.mjs`) opens or comments on a GitHub issue with the failing patent IDs, error classifications, and links to artifact downloads.
- [ ] **CRON-05**: The auto-issue filer uses fingerprint-based deduplication (`{caseId, errorClass, top-of-stack-hash}`) so consecutive nightly failures with the same root cause do not spam the issue tracker.

### Fault Injection (INJ)

- [ ] **INJ-01**: A Cloudflare Worker change adds an `X-PCT-Test-Mode: true` request header that, when present, causes the Worker to skip KV writes (so test runs do not pollute the shared cache).
- [ ] **INJ-02**: A fault-injection E2E test route-aborts the Google Patents PDF fetch and verifies the extension's fallback path through the Cloudflare Worker / USPTO eGrant API completes successfully and produces an accurate citation.

### LLM Exploratory Mode (LLM)

- [ ] **LLM-01**: An exploratory mode runner (`npm run e2e:explore`) autonomously picks a patent + selection via headless `claude -p`, drives the harness, and verifies the citation via the independent PDF verifier. Logs every prompt, response, chosen selection, and verdict so any failure is reproducible.
- [ ] **LLM-02**: The runner invokes `claude -p --output-format json` (Claude Code headless mode) against the user's local Claude Code authentication, billed against the Max 5 subscription's $100/mo headless-API credit pool. No separate `ANTHROPIC_API_KEY` env var required.
- [ ] **LLM-03**: Before triggering the plugin, the runner validates that the LLM-chosen text actually appears in the patent's specification, so failures are correctly classified as plugin issues (`WRONG_CITATION`) vs LLM issues (`LLM_HALLUCINATED_SELECTION`).
- [ ] **LLM-04**: The failure taxonomy (RPT-02) is extended with `LLM_HALLUCINATED_SELECTION` (selected text not in patent) and `LLM_PICKED_OUT_OF_SCOPE_TEXT` (e.g., agent picked claims text when test scope was specification).
- [ ] **LLM-05**: A local JSON ledger (`tests/e2e/.llm-spend-ledger.json`, gitignored) records every `claude -p` invocation's input_tokens, output_tokens, model used, and estimated USD cost (using a versioned rate-card constant). Ledger persists across runs and rolls over monthly.
- [ ] **LLM-06**: The runner emits a warning when cumulative monthly spend reaches $80 and refuses to start new explorations when cumulative monthly spend reaches $100. The hard-block check runs BEFORE each LLM invocation, not after, so a single run cannot exceed the cap by more than its own estimated cost.
- [ ] **LLM-07**: The runner refuses to execute when `process.env.CI` is truthy, so cron runs remain deterministic and never consume the LLM credit pool.
- [ ] **LLM-08**: Each exploration run produces a structured JSON report (`tests/e2e/artifacts/{run-id}/llm-report.json`) listing every iteration: prompt summary, selection chosen, plugin output, verifier verdict, classification, cumulative-spend snapshot. Compatible with the deterministic report schema (RPT-01) so both can be aggregated.

### Docs (DOC)

- [ ] **DOC-01**: A `tests/e2e/README.md` documents how to run the deterministic suite + the exploratory mode locally, the test-hook contract (which `data-testid` attributes exist and what they wrap), how to add new test cases, and how the LLM spend ledger works (including how to reset it for a new month).

## Future Requirements (Deferred to later milestones)

### v3.1+ candidates

- Cross-browser parity (Firefox E2E suite mirroring the Chrome suite)
- Visual regression diffing (pixel-level comparison of plugin UI)
- Trend tracking dashboard across nightly runs
- Curated 500-patent exploratory seed corpus (extends v3.0 LLM mode)
- Per-PR E2E smoke subset (~3-5 cases on every push) — currently nightly-only
- LLM exploratory mode in CI cron (requires moving past local-dev-only constraint — needs a service account or shared credit pool)

### Earlier deferrals (carried forward)

- Chrome Web Store screenshot (1280x800) and promotional tile (440x280)
- Chrome Web Store submission + review
- Firefox Add-ons (AMO) submission + review
- Configurable citation format
- Keyboard shortcut for citation (e.g., Ctrl+Shift+C)
- Batch citation mode
- Patent family cache reuse

## Out of Scope (v3.0)

- Firefox E2E — Chromium-only in v3.0; Firefox AMO lint is already enforced (Phase 24); full Firefox E2E parity is a v3.1+ candidate
- Visual regression — pixel-diff testing adds significant infrastructure (baselines per OS, per Chromium version); out of scope
- Self-healing selectors / AI-driven selector repair — anti-feature; selectors that need self-healing should be fixed at the source via `data-testid`
- Per-PR full E2E — too slow (~7-10 min) and Google Patents flakiness would block merges; cron-only for v3.0
- New extension functionality (citation features, UI changes, matching changes) — strict; only `data-testid` HTML attributes allowed

## Traceability

| Phase | Requirements |
|-------|--------------|
| Phase 26 — Playwright Harness Scaffolding | HARN-01, HARN-02, HARN-03, HARN-04, HARN-05, HOOK-01 |
| Phase 27 — Selection Emulation + 76-Case Deterministic Suite | SEL-01, SEL-02, SEL-03, SEL-04, DIAG-01, DIAG-02 |
| Phase 28 — Independent PDF Verifier | VFY-01, VFY-02, VFY-03, DIAG-03, RPT-01, RPT-02 |
| Phase 29 — CI Nightly Cron + Auto-Issue Filing | CRON-01, CRON-02, CRON-03, CRON-04, CRON-05 |
| Phase 30 — Worker Fault-Injection | INJ-01, INJ-02 |
| Phase 31 — LLM Exploratory Mode + Docs | LLM-01, LLM-02, LLM-03, LLM-04, LLM-05, LLM-06, LLM-07, LLM-08, DOC-01 |

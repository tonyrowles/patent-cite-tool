# Project Research Summary — v3.0 Autonomous E2E Testing Agent

**Project:** Patent Citation Tool — v3.0 milestone
**Domain:** Browser extension E2E testing harness (Playwright + Chromium + independent PDF verifier + nightly cron)
**Researched:** 2026-05-12
**Confidence:** HIGH

## Executive Summary

v3.0 ships an **autonomous E2E testing agent** that drives the existing Chrome MV3 patent citation extension against live `patents.google.com` pages, observes the citations the plugin produces, and verifies them by independently re-parsing the source PDF through a separate code path. The agent runs the 76-case golden corpus locally on demand and nightly via GitHub Actions cron, auto-filing GitHub issues with screenshot + DOM snapshot + PDF-page-snippet diagnostics when regressions appear. The milestone introduces **zero new functionality in the extension itself** — it is pure testing infrastructure layered on top of v2.3.

The recommended approach is built on **Playwright 1.60 + `channel: 'chromium'` + `launchPersistentContext`** — the only mature, supported path for loading unpacked MV3 extensions in true headless mode without `xvfb-run`. The verifier reuses the repo's existing `pdfjs-dist@^5.5` dependency (Node `legacy` build) but is deliberately walled off from `src/shared/matching.js` to prevent the verifier from inheriting the very parsing bugs it exists to catch. ESLint `no-restricted-imports` enforces the boundary. PDF page snippets for failure diagnostics come from `pdfjs-dist` → `node-canvas` → `sharp` (only `canvas` is a new install; `sharp` is already a dep).

The dominant risks are **MV3 service-worker timing races** in CI, **closed-mode Shadow DOM** blocking Playwright locators, **headless clipboard restrictions** silently breaking silent-mode tests, **CAPTCHA / rate-limit storms** when cron hits Google Patents from a GitHub Actions IP 76 times in 10 minutes, and **auto-issue spam** when a single platform-drift event triggers 76 issues overnight. Each has a concrete, well-documented mitigation: SW readiness probes + retries, `addInitScript`-based `attachShadow` mode override, an in-page `__lastCopiedText__` shim, 3–5s throttle + early-abort CAPTCHA detection, and fingerprint-based idempotent issue filing with a "smoke test first" pattern that emits ONE drift issue instead of 76. **LLM exploratory mode is deferred to v3.1** — research found that Anthropic's Consumer ToS forbids subscription-driven headless agents, and the Agent SDK docs explicitly require an API key for programmatic use, which conflicts with the "no API token cost" constraint.

## Key Findings

### Recommended Stack

The harness is built almost entirely on existing dependencies plus two new devDependencies. The full stack rationale lives in [`STACK.md`](./STACK.md).

**Core technologies (new for v3.0):**
- **`@playwright/test@^1.60.0`** — E2E runner. Only mature option for unpacked MV3 extensions; `channel: 'chromium'` supports extensions in true headless since 1.49; first-class fixtures, trace viewer, HTML reporter, screenshot/video capture.
- **`canvas@^3.1.0`** — Node-side `<canvas>` backend for `pdfjs-dist` page rendering. Required for the PDF-page-snippet failure artifact. System libs (cairo/pango/libjpeg) are already pulled in by `npx playwright install --with-deps chromium`.

**Reused (no change):**
- **`pdfjs-dist@^5.5.207`** — Independent verifier imports `pdfjs-dist/legacy/build/pdf.mjs` (Node-friendly), different entry point than the browser bundle the extension uses. Same engine ≠ same bugs because the extension's citation algorithm lives in `src/shared/matching.js`, which the verifier does NOT import.
- **`sharp@^0.34.5`** — Crops the rendered PDF page to the cited column:line bounding-box region.
- **Node 22, GitHub Actions `ubuntu-latest`, `setup-node@v4`, `upload-artifact@v4`** — same patterns as the existing 4-suite Vitest CI.

**Key gotchas surfaced by research:**
- Use `channel: 'chromium'` (NOT `headless: 'new'` flag-style) — this is the only modern, working headless-with-extensions path.
- Do **NOT** cache `~/.cache/ms-playwright` browsers in CI initially per Stack research — Playwright's own docs say cache restore time ≈ download time. The Pitfalls research disagrees on grounds of CI minutes — see open question below.
- `addInitScript` must run **before navigation** to override `Element.prototype.attachShadow({mode: 'closed'})` → `'open'` for shadow piercing. The shipped extension is unchanged.
- Service workers suspend after ~30s idle; harness must re-probe SW readiness after every navigation (`microsoft/playwright#39075`, `#37347`).

### Expected Features

Full feature inventory in [`FEATURES.md`](./FEATURES.md). v3.0 ships **14 table-stakes features plus 3 cron/diagnostics differentiators** (LLM-mode entries from the original research are deferred to v3.1).

**Must have (table stakes — v3.0 scope):**
- TS-01 — Unpacked extension load via `launchPersistentContext` + `channel: 'chromium'`
- TS-02 — Patent page load + extension-readiness wait (PDF link MutationObserver)
- TS-03 — Programmatic selection by stable anchor (`Range` + dispatched `mouseup`, NOT just `selectionchange`)
- TS-04 — Trigger dispatch for all 3 modes (floating button / auto / context menu / Ctrl+C silent)
- TS-05 — Citation read-back from Shadow DOM (via `attachShadow` override) and clipboard (via `__lastCopiedText__` shim)
- TS-06 — Golden baseline driver (`test.each` over all 76 cases)
- TS-07 — Independent PDF re-parse verifier (different code path; zero imports from `src/`)
- TS-08 — Failure diagnostics bundle (screenshot + DOM + Shadow DOM + PDF snippet + diff)
- TS-09 — Local `npm run test:e2e` script
- TS-10 — GitHub Actions nightly cron workflow
- TS-11 — JSON results contract (`{caseId, patentId, mode, expected, actual, verifierResult, status, diagnostics, timingMs, errorClass}`)
- TS-12 — Failure classification taxonomy (`EXTENSION_LOAD_FAIL`, `NO_CITATION_PRODUCED`, `CITATION_MISMATCH`, `CONFIDENCE_REGRESSION`, `VERIFIER_DISAGREE`, `UI_RENDER_FAIL`, `GOOGLE_DOM_DRIFT`, `USPTO_API_DRIFT`, `PDF_FETCH_FAIL`, `TIMEOUT`)
- TS-13 — HTML report (Playwright built-in + 50-line failure-class summary)
- TS-14 — Network/data drift guard (DOM probes that short-circuit a run with one "drift suspected" issue instead of 76 per-patent failures)
- DF-05 — Auto-issue filing with fingerprint-based idempotency
- DF-08 — Flake quarantine (single retry on `TIMEOUT` / `PDF_FETCH_FAIL`)
- **Plus:** USPTO/Worker fallback fault-injection (forces Google PDF path to fail via `page.route(... route.abort())`, verifies USPTO path fires)

**Deferred to v3.1 (originally researched, now out of scope):**
- DF-01 — LLM exploratory mode via Claude Code skill — blocked on Anthropic ToS (no subscription-driven headless agents); v3.1 plan is interactive Claude Code + `@playwright/mcp` server, optionally upgradable to Agent SDK + API key
- DF-02 — Semantic anchor resolver
- DF-03 — Mission template library
- DF-04 — Verifier-as-oracle disambiguation flow
- DF-06 — Trend tracking across runs (JSONL history + weekly markdown summary)
- DF-07 — Cross-browser parity (Firefox E2E)
- AF-01 — Visual regression / pixel diffs (rejected outright; Google ships UI weekly)
- AF-06 — Self-healing selectors (rejected; conflicts with drift-guard philosophy)

### Architecture Approach

Full layout in [`ARCHITECTURE.md`](./ARCHITECTURE.md). The harness is a **library-first / runner-thin** design: selection, observation, verification, and reporting live as standalone modules in `tests/e2e/lib/`; Playwright spec files are 5–15-line recipes that wire them together. This means a fix in the selection primitive benefits everything that uses it, and (importantly for v3.1) the same primitives are reusable for LLM exploratory mode without ripping them out of test specs.

**Directory layout (new):**

```
tests/e2e/
├── playwright.config.ts
├── fixtures/extension.ts          # extension loader + shadow/clipboard shims
├── lib/                            # framework-agnostic primitives
│   ├── extension-loader.ts
│   ├── selection-coordinator.ts
│   ├── citation-observer.ts
│   ├── pdf-verifier.ts             # INDEPENDENT — no imports from src/
│   ├── artifact-capturer.ts
│   ├── case-registry.ts            # joins tests/test-cases.js + tests/golden/baseline.json
│   └── reporter.ts
├── specs/
│   ├── smoke.spec.ts               # 3–5 cases for fast feedback
│   └── golden-regression.spec.ts   # test.each over all 76
└── artifacts/                      # gitignored output (screenshots, DOM, JSON)

scripts/e2e-report-issue.mjs        # fingerprint-based issue filer

.github/workflows/
├── ci.yml                          # extended with optional e2e-smoke job
└── e2e-nightly.yml                 # NEW — scheduled cron + workflow_dispatch
```

**Major components:**

1. **Extension loader** (`lib/extension-loader.ts`) — `launchPersistentContext` with `channel: 'chromium'`, `--load-extension=dist/chrome`, dynamic extension-ID resolution from the service-worker URL, SW readiness probe.
2. **Selection coordinator** (`lib/selection-coordinator.ts`) — navigates to `/patent/{id}`, builds a DOM `Range` against the spec text, dispatches `mouseup` with `clientX/Y` from `range.getBoundingClientRect()`, waits past the 200ms debounce.
3. **Citation observer** (`lib/citation-observer.ts`) — reads the citation from the (now-piercable) Shadow DOM popup OR from the `__lastCopiedText__` shim, normalizes to `{citation, confidence}`.
4. **PDF verifier** (`lib/pdf-verifier.ts`) — **independent** code path: imports `pdfjs-dist/legacy/build/pdf.mjs` only, applies a deliberately simpler "find selected text within ±2 lines of cited column:line, accept on Tier A/B/C/D match" algorithm. Forbidden from importing `src/` — enforced via ESLint `no-restricted-imports`.
5. **Artifact capturer** (`lib/artifact-capturer.ts`) — screenshot + `page.content()` + Shadow DOM dump + PDF-page snippet (pdfjs → node-canvas → sharp crop) on failure.
6. **Case registry** (`lib/case-registry.ts`) — joins existing `tests/test-cases.js` and `tests/golden/baseline.json`, exposes iterable `(id, patentNumber, selectedText, expectedCitation, expectedConfidence)`.
7. **Reporter** (`lib/reporter.ts`) — emits run-level JSON summary + Markdown for GH issue body + lets Playwright's built-in HTML reporter handle the human view.
8. **Issue filer** (`scripts/e2e-report-issue.mjs`) — separate Node script (not workflow YAML heredoc) that reads `tests/e2e/artifacts/summary.json`, fingerprints failures by `hash(patentId + selectionText + errorClass)`, queries existing open issues by label `e2e-nightly`, comments-or-creates idempotently.

**Anti-coupling rules (must hold for architecture integrity):**

- `lib/pdf-verifier.ts` MUST NOT import from `src/` — enforced by ESLint
- Playwright specs MUST NOT contain selection/observation logic inline — they call `lib/`
- No `tests/e2e/` module is ever imported by `src/`

### Critical Pitfalls

Top items from [`PITFALLS.md`](./PITFALLS.md), grouped by the phase they must be addressed in. Pitfall numbers reference the source document.

**Phase 1 (harness scaffolding) — must address before any test runs:**

1. **SW race condition (Pitfall 1)** — `launchPersistentContext` returns before MV3 service worker is ready; first message gets dropped. *Prevention:* Check `context.serviceWorkers()` then race `waitForEvent('serviceworker', {timeout: 10s})`; probe with `sw.evaluate(() => chrome.runtime.id)`; ping the SW from page context and require ack; re-probe after every navigation (SWs suspend after ~30s).
2. **Closed Shadow DOM (Pitfall 3)** — `citationHost.attachShadow({mode: 'closed'})` is opaque to Playwright locators. *Prevention:* `context.addInitScript()` before navigation patches `Element.prototype.attachShadow` to force `mode: 'open'` for the test harness only; shipped extension is byte-for-byte unchanged.
3. **Headless clipboard restriction (Pitfall 4)** — `navigator.clipboard.readText()` returns empty in headless even with permissions granted. *Prevention:* `addInitScript` shim that captures `clipboardData.getData('text/plain')` on every `copy` event into `window.__lastCopiedText__`; tests read the shim, never the API.
4. **Contract drift (Pitfall 14)** — testing agent depends on v2.3 contracts (`#patent-cite-host`, `mouseup` listener, etc.); future UI refactor silently breaks tests. *Prevention:* Document the test contract in `.planning/testing-contract.md` (or similar); add `data-testid` to key UI elements (needs user signoff — see open questions).

**Phase 2 (selection emulation + 76-case suite):**

5. **Programmatic selection doesn't trigger handler (Pitfall 2)** — `selection.addRange()` doesn't synthesize input events; extension listens on `mouseup`, not `selectionchange`. *Prevention:* Build range with `addRange`, then `dispatchEvent(new MouseEvent('mouseup', {bubbles:true, clientX, clientY}))` using coordinates from `range.getBoundingClientRect()`; wait 250ms past the 200ms debounce before reading UI; use `page.keyboard.press('Control+C')` for silent mode (real `ClipboardEvent`).
6. **State leak across tests (Pitfall 12)** — IndexedDB + `chrome.storage.local` cache patent state; tests pass on warm cache, miss cold-load bugs. *Prevention:* One `userDataDir` per suite; per-test fixture clears `chrome.storage.local`, `chrome.storage.sync`, all IDB databases, and cookies; assert pristine state at start.

**Phase 3 (PDF verifier + fault injection):**

7. **Verifier inherits extension's parsing bugs (Pitfall 5)** — if the verifier uses the same `pdfjs-dist` invocation as the extension, a bug there produces "verification passes" garbage. *Prevention:* Verifier imports `pdfjs-dist/legacy/build/pdf.mjs` only, with deliberately different algorithm ("does selected text appear within ±2 lines of cited col:line?" — not "do we reproduce the same citation"); ESLint `no-restricted-imports` blocks `src/` imports; consider `pdftotext` (Poppler) cross-check for high-stakes disagreements.
8. **pdfjs/Poppler text-extraction variance (Pitfall 6)** — strict equality matching causes false-positive verifier failures. *Prevention:* Tiered matcher (A exact → B whitespace-normalized → C alphanumeric-only → D 80%-of-words-in-order); report the tier; calibrate against the 76-patent corpus before trusting verdicts.
9. **USPTO/Worker fallback untested (Pitfall 15)** — production fallback path silently rots because E2E always hits Google successfully. *Prevention:* Dedicated fault-injection test uses `page.route('https://patentimages.storage.googleapis.com/**', route => route.abort())` to force Google failure; assert USPTO path fires and returns a valid PositionMap; ping `pct.tonyrowles.com/health` in cron pre-flight.

**Phase 4 (CI cron + auto-issue):**

10. **Google CAPTCHA / rate-limit storm (Pitfall 8)** — 76 sequential live page loads from a GitHub Actions IP trips Google bot detection. *Prevention:* Throttle 3–5s between patents with ±1s jitter; detect `iframe[src*="recaptcha"]` after navigation, abort cleanly with ONE "CAPTCHA encountered" issue; consider one stable `userDataDir` per cron run (not per test) for session continuity; never use "stealth" plugins.
11. **Google Patents DOM/URL drift (Pitfall 7)** — selectors break overnight; all 76 patents fail; team chases phantom plugin bug. *Prevention:* Pre-flight smoke test on a single known-good patent verifies PDF link present + paragraph markers + selectable text BEFORE the 76-suite runs; on smoke fail, emit ONE drift issue and skip suite; don't spam.
12. **Auto-issue spam (Pitfall 11)** — every failed run files a new issue; tracker becomes useless. *Prevention:* Fingerprint by `hash(patentId + selectionText + errorClass)`; query existing open issues by label `e2e-nightly`; comment if exists (≤7 days old) and create otherwise; auto-close on green; batch platform-drift into ONE meta-issue when >20% fail.
13. **Browser install bloat (Pitfall 13)** — `npx playwright install chromium` is ~450MB / 4–5min per run; burns CI minutes. *Prevention:* Cache `~/.cache/ms-playwright` keyed by Playwright version from `package.json` (NOT lockfile); conditional install on cache miss; skip `--with-deps` on `ubuntu-latest` (deps preinstalled for Chromium). **Note conflict** with Stack research, which recommends NOT caching — see open questions.

## Implications for Roadmap

Five phases for v3.0, strictly sequential — each phase delivers a tool the next phase needs. (LLM exploratory mode would have been Phase 4 in the original 6-phase plan; it is now deferred to v3.1.)

### Phase 1: Playwright Harness Scaffolding

**Rationale:** Everything else depends on a reliable extension-loading + shadow-piercing + clipboard-capturing foundation. SW timing, closed Shadow DOM, and headless clipboard are the three highest-risk technical unknowns; getting them right once in a fixture means the rest of the milestone is integration work.
**Delivers:** `npm run test:e2e:smoke` loads the extension on one known patent, asserts the content script registered, demonstrates shadow piercing + clipboard shim work in headless CI.
**Uses:** `@playwright/test@^1.60`, `channel: 'chromium'`, `launchPersistentContext`, `addInitScript` (shadow + clipboard shims), `serviceWorker` event + readiness probe.
**Implements:** `tests/e2e/playwright.config.ts`, `tests/e2e/fixtures/extension.ts`, `tests/e2e/lib/extension-loader.ts`, `tests/e2e/specs/smoke.spec.ts`, `.gitignore` for `tests/e2e/artifacts/`, `.planning/testing-contract.md`.
**Avoids:** Pitfalls 1 (SW race), 3 (closed Shadow DOM), 4 (headless clipboard), 14 (contract drift).

### Phase 2: Selection Emulation + Deterministic 76-Case Suite

**Rationale:** Selection is the load-bearing primitive shared by every mode and (eventually) v3.1 LLM mode. Once selection reliably triggers the extension and citation is observable, scaling to all 76 cases is mechanical.
**Delivers:** `npm run test:e2e` runs the full corpus locally; failures emit a diagnostics bundle.
**Uses:** Phase 1 primitives + the `Range` + `mouseup` + 250ms-debounce pattern; `page.keyboard.press('Control+C')` for silent mode; reuses `tests/test-cases.js` + `tests/golden/baseline.json` via `lib/case-registry.ts`.
**Implements:** `lib/selection-coordinator.ts`, `lib/citation-observer.ts`, `lib/case-registry.ts`, `lib/artifact-capturer.ts`, `lib/reporter.ts`, `specs/golden-regression.spec.ts`, per-test state-reset fixture.
**Avoids:** Pitfalls 2 (selection doesn't fire), 12 (state leak across tests).

### Phase 3: Independent PDF Verifier + Fault-Injection Mini-Phase

**Rationale:** The core correctness claim of v3.0 ("an independent code path validates citations") lives or dies here. Building it after the deterministic suite means the verifier can be calibrated against the 76 known-good cases before being trusted as an oracle. The USPTO fault-injection slot is folded in here because it shares "force a failure path and observe" plumbing.
**Delivers:** Every golden-suite run also produces a verifier verdict per case; verifier disagreements with the extension are logged as `VERIFIER_DISAGREE` (NOT auto-failed at high confidence — flagged for human review per the "verifier is oracle, not judge" pattern). Fault-injection test exercises USPTO/Worker fallback.
**Uses:** `pdfjs-dist/legacy/build/pdf.mjs` (Node import), `canvas`, `sharp`; optionally `pdftotext` (Poppler) as a future cross-checker; `page.route()` for fault injection.
**Implements:** `lib/pdf-verifier.ts` with tiered matching (Tier A exact → D 80%-words-in-order); ESLint `no-restricted-imports` rule blocking `src/` imports from `lib/pdf-verifier.ts`; `specs/fault-injection.spec.ts` (force Google failure, assert USPTO path).
**Avoids:** Pitfalls 5 (verifier shares bugs), 6 (pdf text-extraction variance), 15 (USPTO fallback untested).

### Phase 4: CI Cron + Auto-Issue Filing

**Rationale:** Operationalizing the harness. This is where research found the most pitfalls — cron is where good test infrastructure dies if rate-limiting, drift, and dedup aren't handled from day one.
**Delivers:** `.github/workflows/e2e-nightly.yml` runs the full suite on `schedule: '0 6 * * *'`; failures fingerprint + idempotently file/comment on GitHub issues; smoke-test-first pattern short-circuits 76-issue storms on Google drift; CAPTCHA detection aborts cleanly.
**Uses:** GitHub Actions, `actions/cache@v4` (Playwright browsers, version-keyed), `actions/upload-artifact@v4`, `gh` CLI, `permissions: { contents: read, issues: write }`.
**Implements:** `e2e-nightly.yml` (separate workflow file, not job-in-ci.yml), `scripts/e2e-report-issue.mjs` (fingerprint + dedup), CAPTCHA detector in the cron entry point, 3–5s throttle.
**Avoids:** Pitfalls 7 (UI drift), 8 (CAPTCHA storm), 11 (issue spam), 13 (CI minute exhaustion).

### Phase 5: Optional E2E Smoke on PR + Documentation

**Rationale:** Closes the loop — provides fast (≤5min) feedback on PRs that touch the extension, documents the test contract, and produces the README that lets a new developer run the suite locally. Last because it's polish, not foundation.
**Delivers:** `npm run test:e2e:smoke` optionally runs on PR via `workflow_dispatch`; 3–5 case smoke suite tagged `@smoke`; `tests/e2e/README.md` covers local setup + cron behavior + how to investigate a failed issue.
**Uses:** Existing CI patterns; same primitives as Phase 1.
**Implements:** Extended `.github/workflows/ci.yml` with optional `e2e-smoke` job; `tests/e2e/README.md`; entry in root `CLAUDE.md` pointing developers to the harness.
**Avoids:** Knowledge tax on whoever inherits the harness next.

### Phase Ordering Rationale

- **Phase 1 → 2** strict sequential: cannot test selection without a loaded extension + working shadow piercing.
- **Phase 2 → 3** can theoretically parallelize because the verifier has zero harness dependencies, BUT calibrating the verifier requires the 76-case suite to feed it cases. Treat as sequential.
- **Phase 3 → 4** sequential: cron without a verifier is "more Vitest" — the verifier is what makes nightly cron worth the CI minutes.
- **Phase 4 → 5** sequential: PR smoke depends on the cron workflow's job patterns being proven first.

The Architecture research's original 5-phase plan included **LLM exploratory mode as Phase 5**. With v3.1 deferral, the slot is now filled by "Optional PR smoke + docs" — which Architecture had folded into Phase 4. Splitting it out gives v3.0 a clean, documented finish line.

### Research Flags

Phases likely needing deeper research during planning (run `/gsd-research-phase` before phase brief):

- **Phase 3 (PDF verifier):** The tiered-matching algorithm needs design work — Tier A/B/C/D thresholds, how `±2 lines` is computed when the verifier infers columns differently from the extension, how to surface `VERIFIER_DISAGREE` without auto-failing. Calibration against the 76-corpus is non-trivial.
- **Phase 4 (CI cron + auto-issue):** The fingerprint scheme, the smoke-test-first pattern, the CAPTCHA-detect-and-abort flow, and the issue-body markdown template all benefit from a focused brief. The throttle + dedup interactions with `actions/cache` are subtle.

Phases with well-established patterns (likely skip research-phase):

- **Phase 1 (harness scaffolding):** Playwright's docs are unusually thorough; `launchPersistentContext` + extension loading + `addInitScript` are well-trodden.
- **Phase 2 (selection + 76-case suite):** Once Phase 1 primitives exist, this is `test.each` over existing fixtures.
- **Phase 5 (PR smoke + docs):** Pure CI/yaml/docs work.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Playwright docs are official + current (1.60 released May 11, 2026 per release notes). `pdfjs-dist` + `canvas` + `sharp` triad is well-documented. The one ToS-sensitive question (subscription-vs-API) was resolved unambiguously — official docs + a specific GitHub issue (#36324) — and that resolution is what drove the v3.1 deferral. |
| Features | HIGH | Feature inventory backed by Playwright official docs + 3 independent secondary sources on Chrome-extension testing + the existing repo's `tests/golden/baseline.json` ground truth. v3.0 scope reduction (LLM features deferred) is a clean subset, not a partial implementation. |
| Architecture | HIGH | Directory layout follows the repo's existing `tests/` convention; component boundaries map 1:1 to verified Playwright patterns; the "library-first / runner-thin" decision is the canonical Playwright community pattern. The verifier independence rule is enforceable via ESLint. |
| Pitfalls | HIGH | Every critical pitfall is grounded in either (a) an open Playwright GitHub issue with reproductions, (b) extension source code direct read (`src/content/citation-ui.js:38` for closed mode, `src/content/content-script.js:173` for `mouseup`), or (c) Anthropic's own ToS clauses cited by URL. |

**Overall confidence:** HIGH

### Gaps to Address

These are unresolved items that surfaced across research and need attention during phase planning, not during research:

- **Browser-cache decision conflict (Stack vs Pitfalls):** Stack research recommends NOT caching `~/.cache/ms-playwright` (cites Playwright docs saying restore ≈ download time, net zero benefit, +1 failure mode). Pitfalls research recommends caching to avoid burning 4–5 minutes per cron run (~50% of free-tier 2000 min/month at nightly cadence). **Resolve in Phase 4 planning** — likely answer is "cache because GitHub Actions free-tier minutes matter more than the marginal failure mode," but verify by measuring an uncached cron run first.
- **`pdftotext` cross-check (Stack vs Pitfalls):** Stack says `pdfjs-dist` with process+code isolation is sufficient independence. Pitfalls says use Poppler for true engine independence. **Resolve in Phase 3 planning** — likely answer is "ship pdfjs-only for v3.0; add Poppler cross-check in a future minor version if verifier disagreement rate is suspiciously low (which would indicate shared bugs)."
- **Selection approach (Approach 1 vs Approach 2 from Stack research):** Approach 1 (`Range` + dispatched `mouseup`) is recommended; Approach 2 (real `page.mouse.down/move/up`) is recommended only as smoke. **Resolve in Phase 2 planning** — go with Approach 1 as default + 1–2 Approach 2 tests for end-to-end smoke. Both researches agree.
- **Verifier algorithm calibration:** "±2 lines of cited col:line" tolerance is plausible but needs validation against the 76-corpus before being trusted. **Resolve in Phase 3 execution** — run the verifier against the known-passing golden suite first and tune until disagreement rate is plausibly small (>0% but <5%) before treating it as an oracle.

### Open Questions for Roadmap / Requirements

These are decisions the user must make before phase briefs are written. They're not gaps in research — they're choices the research can't make.

1. **`data-testid` on extension elements** — Pitfall 14 strongly recommends adding `data-testid` attributes to key UI elements (`cite-float-btn`, `cite-popup`, etc.) to decouple tests from CSS class names. PROJECT.md says "Zero new functionality in the extension itself" for v3.0. `data-testid` is arguably not functionality (they're inspector hooks), but they ARE a source change. **Question:** Acceptable for v3.0, or strictly forbidden until a future minor? If forbidden, the harness pins CSS-class selectors and accepts the brittleness.

2. **Cron frequency** — Architecture proposes nightly (`'0 6 * * *'` = 06:00 UTC ≈ 02:00 ET). Pitfalls research notes the 2000-min/month GitHub Actions free-tier cap is tight with nightly + ~10-min runs. **Question:** Nightly, or every-other-night to halve the CI burn?

3. **Sampled vs full corpus per cron run** — Pitfalls Recovery Strategy table suggests "reduce corpus to a sampled 30 patents for nightly, full 76 weekly" as a CI-budget mitigation. **Question:** Full 76 nightly (default) or 30-sampled nightly + 76-full weekly (budget-conscious)?

4. **Worker test-mode header** — Pitfall 15 notes that CI traffic to the Cloudflare Worker pollutes the production KV cache and burns the free-tier write quota. The fix is a "test mode" header sent from CI that the Worker honors by skipping fire-and-forget KV writes. This requires a small Worker code change (not strictly "zero functionality" — but it's test-infrastructure plumbing). **Question:** Acceptable Worker change for v3.0, or punt the fault-injection test to v3.1 with USPTO fallback exercised only via mocks?

## Sources

Aggregated from the four research files. See per-file source lists for full URLs + confidence per source.

### Primary (HIGH confidence)

- [Playwright — Chrome extensions docs](https://playwright.dev/docs/chrome-extensions), [CI docs](https://playwright.dev/docs/ci), [Service Workers docs](https://playwright.dev/docs/service-workers), [Locators docs](https://playwright.dev/docs/locators), [v1.60 release notes](https://github.com/microsoft/playwright/releases)
- [Anthropic — Claude Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview), [Run Claude Code programmatically](https://code.claude.com/docs/en/headless), [Consumer Terms](https://www.anthropic.com/legal/consumer-terms)
- [microsoft/playwright#23047](https://github.com/microsoft/playwright/issues/23047) — closed shadow DOM limitation, official acknowledgment
- [microsoft/playwright#39075](https://github.com/microsoft/playwright/issues/39075), [#37347](https://github.com/microsoft/playwright/issues/37347), [#33682](https://github.com/microsoft/playwright/issues/33682) — service worker race + CI hang issues
- [microsoft/playwright#33566](https://github.com/microsoft/playwright/issues/33566) — `channel: 'chromium'` + headless extension support
- [pdfjs-dist on npm](https://www.npmjs.com/package/pdfjs-dist) — v5 requires Node 22+
- Repo source code (direct read): `src/content/content-script.js`, `src/content/citation-ui.js`, `src/manifest.json`, `tests/golden/baseline.json`, `tests/test-cases.js`, `.github/workflows/ci.yml`, `package.json`

### Secondary (MEDIUM confidence)

- [Claude Code issue #36324](https://github.com/anthropics/claude-code/issues/36324) — user reports of subscription bans for `claude -p` automated use; closed-stale with no Anthropic counter-statement
- [BrowserStack Playwright Chrome Extension guide (2026)](https://www.browserstack.com/guide/playwright-chrome-extension), [Testomat.io Playwright tutorial](https://testomat.io/blog/playwright-tutorial-experience-testing-browser-extensions/) — practical MV3 patterns
- [TestDino: Claude Code with Playwright (4-agent pipeline)](https://testdino.com/blog/claude-code-with-playwright), [alexop.dev: Building AI QA Engineer with Claude Code + Playwright MCP](https://alexop.dev/posts/building_ai_qa_engineer_claude_code_playwright/) — relevant for v3.1 LLM mode, captured here for continuity
- [Autonoma AI: AI E2E Testing in 2026](https://getautonoma.com/blog/ai-e2e-testing) — flake rate data (<1.5% for role-based structured agents)
- [playwrightsolutions.com — clipboard in Playwright](https://playwrightsolutions.com/how-do-i-access-the-browser-clipboard-with-playwright/), [Playwright browser-binary caching](https://playwrightsolutions.com/playwright-github-action-to-cache-the-browser-binaries/)
- [PkgPulse: unpdf vs pdf-parse vs pdfjs-dist (2026)](https://www.pkgpulse.com/blog/unpdf-vs-pdf-parse-vs-pdfjs-dist-pdf-parsing-extraction-nodejs-2026)
- [Adam Cogan — duplicate GitHub issue handling](https://adamcogan.com/2025/12/05/handle-duplicate-github-issues/)
- [AlterLab — Playwright bot detection 2026](https://alterlab.io/blog/playwright-bot-detection-what-actually-works-in-2026)

### Tertiary (LOW confidence — flagged for validation during execution)

- Tier-A pass rate threshold of ≥60% for the PDF verifier — heuristic, must be calibrated against the 76-corpus in Phase 3
- "3–5s throttle" for cron requests — best-practice estimate from secondary sources; may need tuning in Phase 4
- Free-tier GitHub Actions cron budget assumption (2000 min/month) — verify current account state before Phase 4 cron design

---
*Research completed: 2026-05-12*
*Scope: v3.0 (LLM exploratory mode deferred to v3.1)*
*Ready for roadmap: yes*

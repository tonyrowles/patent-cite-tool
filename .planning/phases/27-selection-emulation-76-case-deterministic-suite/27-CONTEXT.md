# Phase 27: Selection Emulation + 76-Case Deterministic Suite - Context

**Gathered:** 2026-05-14
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous)

<domain>
## Phase Boundary

End-to-end deterministic regression coverage for the citation pipeline. Every one of the 76 golden patents from `tests/test-cases.js` drives the actual Chrome extension through a real text selection on the live Google Patents page, the citation produced by the plugin is observed, and that observation is compared against the frozen golden baseline (`tests/golden/baseline.json`). On any failure, full-page screenshot + DOM snapshot are written to a per-run artifact directory so the failure can be diagnosed without re-running.

In scope:
- `tests/e2e/lib/selection.js` — implements `selectText({page, uniqueSubstring})` using TreeWalker + Range API + dispatched mouseup (consumes Phase 26's stub)
- `tests/e2e/lib/observation.js` — extends `readCitationPill(page)` to return structured `{citation, confidence, mode}` per SEL-02
- `tests/e2e/lib/artifacts.js` — full-page screenshot + DOM snapshot capture wired on failure (DIAG-01, DIAG-02)
- `tests/e2e/specs/regression.spec.js` — the 76-case replay (sync/auto-trigger mode) using Playwright's `test.each` over `tests/test-cases.js`
- A 5-case `@smoke` subset spec — fast inner-loop alternative to the 76-case run
- `npm run e2e:regression` (full 76) + extend `npm run e2e:smoke` (tagged subset)
- Test isolation: fresh `launchPersistentContext` + tmpdir per case (Phase 26 lock)

Out of scope (deferred):
- Independent PDF verifier — Phase 28 (uses this suite's output as input)
- CI nightly cron workflow — Phase 29
- Worker fault-injection — Phase 30
- LLM exploratory mode — Phase 31

</domain>

<decisions>
## Implementation Decisions

### Selection Mechanism
- **Strategy: unique-substring lookup**. `selectText({page, uniqueSubstring})` performs a TreeWalker scan on the patent page to find the first DOM text node containing `uniqueSubstring`, computes start/end offsets within that node (or spans multiple nodes), builds a Range, applies it via `window.getSelection().addRange()`, then dispatches a `mouseup` event with `{bubbles: true}` from the last selected element. The extension's existing content-script `mouseup` listener fires and produces the citation.
- **Rationale:** `tests/test-cases.js` already stores the exact `selectedText` for each case (e.g., `"receptor exclusively expressed on plasma cells..."`). Reusing those strings avoids brittle character-offset bookkeeping. The Phase 9 accuracy audit already validated that those exact strings produce the expected citations in unit tests.
- **Multi-node selections:** When `uniqueSubstring` spans multiple text nodes (common — patent paragraphs are broken across `<span>` and `<br>` boundaries), select the range from the first occurrence's start to the last contiguous occurrence's end. Use a `range.toString()` round-trip check; if the selection text doesn't match `uniqueSubstring` after whitespace normalization, throw a descriptive selection error (classified as `SELECTION_FAILED`, not `WRONG_CITATION`).
- **Where the selection happens:** The patent specification is rendered inside Google Patents' main content area. Selection should target either `section.description` or whatever container Google Patents uses for the specification text — selection.js auto-detects by looking for the text inside known containers in priority order: `section.description`, `[itemprop="description"]`, `main article`, `body`. The auto-detect logic stays in selection.js so specs need no per-case container hints.

### Test Mode Coverage
- **Bulk 76-case suite: sync (auto-trigger) mode only.** The golden baseline (`tests/golden/baseline.json`) was generated against auto-trigger mode, which renders the citation pill in the Shadow DOM. The suite reads the pill via `readCitationPill` and compares to baseline.
- **Silent-mode coverage:** Two dedicated specs (one auto-trigger, one silent) over a single representative patent (US11427642) prove HARN-04 end-to-end. Silent-mode is NOT looped over 76 — same matching logic, different output channel; 76× duplication is not worth ~10 minutes of runtime.

### Smoke Subset (@smoke tag)
- **Add `@smoke` tag to 5 representative cases:** one per category cluster (modern-short, modern-long, pre-2000, chemical, cross-column). Tagged via Playwright's title prefix or `tag` annotation.
- **Phase 26 smoke spec is renamed** to `infra-smoke.spec.js` (or kept with same name and tag added) so `npm run e2e:smoke` runs both the Phase 26 infra smoke AND the Phase 27 tagged subset (~30s total).
- **`npm run e2e:regression`** runs the full 76 (~10-15 minutes).
- **`npm run e2e:silent`** runs the 2 silent-mode specs (~10s).

### Test Isolation (locked by Phase 26)
- Fresh `chromium.launchPersistentContext(tmpDir)` per test. `tmpDir = os.tmpdir()/pct-e2e-${randomUUID()}`. `cleanup()` closes context, removes tmpdir recursively.
- This satisfies SEL-04 (cookies, IndexedDB, extension storage all reset because the user data dir is fresh).
- Trade-off accepted: ~2-3s setup per test × 76 = ~3-5 minutes of overhead. Total suite ~10-15 min — acceptable for nightly cron (Phase 29) and one-shot local runs.

### Citation Observation (SEL-02)
- `readCitationPill(page)` reads the pill text + a CSS class to derive confidence: green/yellow/red. The class comes from the existing extension's `applyConfidenceClass` logic (citation-ui.js). Read with `page.evaluate` inside the host's `shadowRoot`.
- `readClipboardShim(page)` reads `window.__lastCopiedText__` for silent-mode tests.
- Combined `getCitation(page, {mode})` dispatches to the right reader: `mode: 'auto'` → pill; `mode: 'silent'` → clipboard shim. Returns `{citation: string, confidence: 'green'|'yellow'|'red', mode: 'auto'|'silent'}`.

### Failure Diagnostics (DIAG-01, DIAG-02)
- Wired via Playwright's `test.afterEach` with `testInfo.status !== testInfo.expectedStatus`:
  - `captureScreenshot(page, runId, caseId)` writes `tests/e2e/artifacts/{runId}/{caseId}-screenshot.png` (full-page, with the highlight visible if possible).
  - `captureDomSnapshot(page, runId, caseId)` writes `tests/e2e/artifacts/{runId}/{caseId}-dom.html` (includes serialized shadowRoot content via `getInnerHTML({includeShadowRoots: true})`).
- `runId` is set by Playwright config to a single timestamp per `playwright test` invocation (e.g., `2026-05-14T12-30-15Z`).
- `caseId` comes from the test title or test-case id field.
- **PDF snippet (DIAG-03)** is Phase 28's responsibility — Phase 27 stops at screenshot + DOM.
- Artifacts directory is `.gitignore`d already (Phase 26 added the pattern).

### Test-Case Driver
- Import the 76 cases from `tests/test-cases.js` (existing — exports `TEST_CASES` array with `{id, patentFile, selectedText, category}`).
- For each case, derive `patentId` from the case `id` (`US11427642-spec-short-1` → `US11427642`) via regex split on first dash and rejoin.
- Look up expected citation from `tests/golden/baseline.json[id]` (existing — flat object map).
- Use Playwright's `test.describe('regression', () => { for (const tc of TEST_CASES) test(\`${tc.id}\`, ...) })` pattern. NOT `test.each` (Playwright doesn't have that; describe+for is the idiomatic pattern).

### Tagged Specs
Five `@smoke` cases (chosen for category diversity, none OCR-heavy, no edge-case-heavy):
- `US11427642-spec-short-1` (modern-short)
- `US11427642-spec-long` (modern-long)
- `US11427642-cross-col` (cross-column)
- `US8352400-claims` (claims)
- `US10592688-spec-short` (modern-short, different patent)

These represent the breadth of selection types without including the riskiest patents (US6324676 OCR, US5959167 chemical) that Phase 27 will catch via the full 76 anyway.

### npm Scripts (extended in Phase 27)
- `e2e:smoke` → updated to: `npm run build:chrome && playwright test --config tests/e2e/playwright.config.js --grep @smoke`
- `e2e:regression` → new: `npm run build:chrome && playwright test --config tests/e2e/playwright.config.js specs/regression.spec.js`
- `e2e:silent` → new: `npm run build:chrome && playwright test --config tests/e2e/playwright.config.js specs/silent.spec.js`

### Trigger Mode
- The extension defaults to "auto" trigger mode. Tests do NOT need to set trigger mode explicitly — they exercise the default user path.
- Silent mode tests set the trigger mode via `chrome.storage.local` write before navigation, then dispatch Ctrl+C after selection. Sync mode tests just rely on the default mouseup trigger.

### Claude's Discretion
- Exact wording of failure classifications (`SELECTION_FAILED`, `WRONG_CITATION`, `NO_CITATION_PRODUCED`) — match Phase 28's taxonomy when that lands.
- Per-test timeout value (recommend 30s after first 5s of overhead).
- Whether to use Playwright fixtures or per-spec setup/teardown (recommend per-spec for clarity).
- Exact handling of citation confidence threshold (do tests assert exact `confidence: 'green'` match, or `confidence: 'green' || 'yellow'`?). Recommend strict — baseline.json has frozen confidence values.
- How to skip out-of-corpus cases gracefully (a baseline.json entry without a test-cases.js entry is invalid data, not a soft skip).

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `tests/test-cases.js` — 76-case registry. Single source of truth for case IDs, patent files, selected text, category. Phase 27's spec imports this directly.
- `tests/golden/baseline.json` — frozen `{caseId → {citation, confidence}}` map. Phase 27's spec reads `expected.citation` and `expected.confidence`.
- `tests/e2e/lib/extension-loader.js` — Phase 26's `loadExtension` already supports HARN-01..04 needs. selection.js calls into it via the spec's `loadExtension(...)`.
- `tests/e2e/lib/observation.js` — Phase 26 stubbed `readCitationPill` (read `data-testid="pct-citation-pill"` text content). Phase 27 extends to return structured `{citation, confidence, mode}`.
- `tests/e2e/lib/artifacts.js` — Phase 26 stubbed `captureScreenshot` / `captureDomSnapshot`. Phase 27 wires them to Playwright's after-each failure hook.
- `tests/e2e/shims/shadow-open.js` — Phase 26's shim, no changes needed.
- `tests/e2e/shims/clipboard-observer.js` — Phase 26's shim, no changes needed.
- `src/content/citation-ui.js` — Phase 26 added `data-testid="pct-citation-host"` (line 37) and `data-testid="pct-citation-pill"` (line 120). The pill text content is the citation. Confidence class is on the `.cite-popup` element via `applyConfidenceClass`.
- `src/shared/matching.js` — production matching logic (NOT imported by tests, but its output behavior is what we're verifying).

### Established Patterns
- ESM only, "type": "module".
- Playwright config in `tests/e2e/playwright.config.js`. Single worker, persistent context per test.
- Helper files in `tests/e2e/lib/*.js`. Specs in `tests/e2e/specs/*.spec.js`. Shims in `tests/e2e/shims/*.js`.
- `data-testid` namespacing: `pct-` prefix.
- Test isolation via fresh persistent context + tmpdir (locked Phase 26).

### Integration Points
- **No production code changes.** Phase 27 is pure test-side work — adding lib methods, specs, and npm scripts. The extension's behavior is the system under test.
- **Build dependency:** `e2e:regression` chains `build:chrome` first so `dist/chrome/` is current.
- **Phase 28 hook:** the regression spec's per-test result object will be the input to Phase 28's verifier (passes selected text + cited column:line + patent ID to the independent verifier). Phase 27 ships the structured result; Phase 28 consumes it.

</code_context>

<specifics>
## Specific Ideas

- The `selectText` helper signature: `async function selectText({page, uniqueSubstring, container = null, requireExact = true})` — `container` optional override; `requireExact` lets specs opt into lenient whitespace matching.
- The 76-case spec uses Playwright's `test.describe.configure({mode: 'serial'})` to ensure cases run one at a time (matches `workers: 1` in playwright.config.js — belt and suspenders).
- Artifact run-id generation: `process.env.PLAYWRIGHT_RUN_ID || new Date().toISOString().replace(/[:.]/g, '-')`. Phase 29 will set `PLAYWRIGHT_RUN_ID` from `GITHUB_RUN_ID`.
- If a case fails because the unique substring is NOT found on the page (Google DOM drift), throw a specific `DOM_DRIFT` error with the searched substring + the patent ID. This pre-classifies failures for Phase 29's auto-issue filer.
- The silent-mode spec exercises one patent end-to-end: navigate → switch trigger mode to silent via `chrome.storage.local.set` → select → dispatch Ctrl+C → read clipboard shim → assert citation matches baseline. Proves HARN-04 closes the loop.

</specifics>

<deferred>
## Deferred Ideas

- **Independent PDF verifier** (Phase 28 — uses Phase 27's structured result as its input)
- **PDF snippet capture (DIAG-03)** (Phase 28 — verifier owns the cited-region rendering)
- **Failure classification taxonomy (RPT-01, RPT-02)** (Phase 28 — Phase 27's failure shapes feed into RPT-02 taxonomy; Phase 27 only needs informal `DOM_DRIFT`, `SELECTION_FAILED`, `NO_CITATION_PRODUCED`, `WRONG_CITATION` labels for now)
- **CI cron + artifact upload** (Phase 29)
- **Auto-issue filer** (Phase 29)
- **Worker fault-injection** (Phase 30)
- **LLM exploratory mode** (Phase 31)
- **Per-PR smoke job in `ci.yml`** (deferred to v3.1)
- **Visual regression** (deferred to v3.1+)
- **Firefox cross-browser E2E parity** (deferred to v3.1+)
</deferred>

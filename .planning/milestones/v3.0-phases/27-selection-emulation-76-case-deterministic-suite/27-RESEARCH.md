# Phase 27: Selection Emulation + 76-Case Deterministic Suite — Research

**Researched:** 2026-05-14
**Domain:** Programmatic DOM selection on Google Patents via TreeWalker + Range API + dispatched mouseup; 76-case deterministic regression replay over the production extension; failure diagnostics (full-page screenshot + Shadow-DOM-included DOM snapshot); silent-mode coverage via clipboard shim and `chrome.storage.sync` trigger-mode toggle.
**Confidence:** HIGH (Google Patents DOM structure verified via raw HTTP fetch; extension internals verified by direct source read; Playwright 1.60 APIs verified via official docs)

## Summary

Phase 27 turns Phase 26's harness into a regression suite. Every primitive it needs is already understood; this phase implements them. The research below verifies four areas the planner cannot get from CONTEXT.md alone:

1. **Google Patents specification DOM** is plain HTML (`<section itemprop="description">` containing `<div class="description-paragraph" id="p-NNNN" num="NNNN">`); claims live in `<section itemprop="claims">` containing `<div class="claim-text">` rows. **No Polymer custom elements** (`patent-result`, `patent-text`) are present in the rendered DOM — earlier roadmap research was speculative on that point. Content is server-side rendered (10K-line HTML body returned by plain `curl`), so `waitUntil: 'domcontentloaded'` is sufficient, with a `section[itemprop="description"]` selector wait as belt-and-suspenders.

2. **PDF↔HTML text divergence is the central risk.** `tests/test-cases.js` `selectedText` values are PDF-extracted text (e.g. `"a prolif eration -inducing ligand"`). The HTML on Google Patents is clean prose (`"a proliferation-inducing ligand"`). A naïve `textContent.indexOf(selectedText)` will return `-1` for any test case whose selected text crosses a PDF line break. The selection helper MUST normalize whitespace + hyphenation before substring matching. Detailed algorithm below.

3. **The extension's default trigger mode is `'floating-button'`, NOT `'auto'`** (verified at `src/content/content-script.js:147` and `src/options/options.js:46`). CONTEXT.md's claim that "tests do NOT need to set trigger mode explicitly — they exercise the default" is **incorrect**. Trigger mode lives in `chrome.storage.sync`, NOT `chrome.storage.local` (also misstated in CONTEXT.md). For the 76-case auto-trigger suite to skip the floating-button click step, tests must explicitly `chrome.storage.sync.set({ triggerMode: 'auto' })` before navigation. This is a 6-line addition to `extension-loader.js` (or a new `lib/settings.js`).

4. **Failure-class taxonomy and pre-flight smoke** are the planner's safety net. A `DOM_DRIFT` pre-flight check on the seed patent (`US11427642`) should run once at suite start; if it fails, emit ONE diagnostic and skip the 76 — the same pattern PITFALLS.md prescribes for cron, but the local suite gets the same treatment because CAPTCHA risk on 76 fast loads exists locally too. The four failure classes Phase 27 owns are `DOM_DRIFT`, `SELECTION_FAILED`, `NO_CITATION_PRODUCED`, `WRONG_CITATION` (matches CONTEXT.md `<specifics>`). Phase 28's RPT-02 will subsume these into the full taxonomy.

**Primary recommendation:** Implement `selectText` as a single `page.evaluate` that runs in the page world, traverses `<section itemprop="description">` (or fallback to `<section itemprop="claims">`, `main`, `body` in priority order) with TreeWalker, locates `uniqueSubstring` by whitespace-normalized comparison, builds a multi-node `Range`, applies it, and dispatches one `mouseup` event with bubbling. Verify by `selection.toString() === uniqueSubstring` (whitespace-normalized) and throw `SELECTION_FAILED` on mismatch. Wire `test.afterEach` to call `captureScreenshot` + `captureDomSnapshot` on `testInfo.status !== testInfo.expectedStatus`. Tag 5 cases with `@smoke`. Run silent mode as 2 dedicated specs on `US11427642` using `chrome.storage.sync.set({triggerMode:'silent'})` via the SW evaluate channel.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Selection Mechanism**
- **Strategy: unique-substring lookup**. `selectText({page, uniqueSubstring})` performs a TreeWalker scan on the patent page to find the first DOM text node containing `uniqueSubstring`, computes start/end offsets within that node (or spans multiple nodes), builds a Range, applies it via `window.getSelection().addRange()`, then dispatches a `mouseup` event with `{bubbles: true}` from the last selected element. The extension's existing content-script `mouseup` listener fires and produces the citation.
- **Rationale:** `tests/test-cases.js` already stores the exact `selectedText` for each case (e.g., `"receptor exclusively expressed on plasma cells..."`). Reusing those strings avoids brittle character-offset bookkeeping. The Phase 9 accuracy audit already validated that those exact strings produce the expected citations in unit tests.
- **Multi-node selections:** When `uniqueSubstring` spans multiple text nodes (common — patent paragraphs are broken across `<span>` and `<br>` boundaries), select the range from the first occurrence's start to the last contiguous occurrence's end. Use a `range.toString()` round-trip check; if the selection text doesn't match `uniqueSubstring` after whitespace normalization, throw a descriptive selection error (classified as `SELECTION_FAILED`, not `WRONG_CITATION`).
- **Where the selection happens:** The patent specification is rendered inside Google Patents' main content area. Selection should target either `section.description` or whatever container Google Patents uses for the specification text — selection.js auto-detects by looking for the text inside known containers in priority order: `section.description`, `[itemprop="description"]`, `main article`, `body`. The auto-detect logic stays in selection.js so specs need no per-case container hints.

**Test Mode Coverage**
- **Bulk 76-case suite: sync (auto-trigger) mode only.** The golden baseline (`tests/golden/baseline.json`) was generated against auto-trigger mode, which renders the citation pill in the Shadow DOM. The suite reads the pill via `readCitationPill` and compares to baseline.
- **Silent-mode coverage:** Two dedicated specs (one auto-trigger, one silent) over a single representative patent (US11427642) prove HARN-04 end-to-end. Silent-mode is NOT looped over 76 — same matching logic, different output channel; 76× duplication is not worth ~10 minutes of runtime.

**Smoke Subset (@smoke tag)**
- **Add `@smoke` tag to 5 representative cases:** one per category cluster (modern-short, modern-long, pre-2000, chemical, cross-column). Tagged via Playwright's title prefix or `tag` annotation.
- **Phase 26 smoke spec is renamed** to `infra-smoke.spec.js` (or kept with same name and tag added) so `npm run e2e:smoke` runs both the Phase 26 infra smoke AND the Phase 27 tagged subset (~30s total).
- **`npm run e2e:regression`** runs the full 76 (~10-15 minutes).
- **`npm run e2e:silent`** runs the 2 silent-mode specs (~10s).

**Test Isolation (locked by Phase 26)**
- Fresh `chromium.launchPersistentContext(tmpDir)` per test. `tmpDir = os.tmpdir()/pct-e2e-${randomUUID()}`. `cleanup()` closes context, removes tmpdir recursively.
- This satisfies SEL-04 (cookies, IndexedDB, extension storage all reset because the user data dir is fresh).
- Trade-off accepted: ~2-3s setup per test × 76 = ~3-5 minutes of overhead. Total suite ~10-15 min — acceptable for nightly cron (Phase 29) and one-shot local runs.

**Citation Observation (SEL-02)**
- `readCitationPill(page)` reads the pill text + a CSS class to derive confidence: green/yellow/red. The class comes from the existing extension's `applyConfidenceClass` logic (citation-ui.js). Read with `page.evaluate` inside the host's `shadowRoot`.
- `readClipboardShim(page)` reads `window.__lastCopiedText__` for silent-mode tests.
- Combined `getCitation(page, {mode})` dispatches to the right reader: `mode: 'auto'` → pill; `mode: 'silent'` → clipboard shim. Returns `{citation: string, confidence: 'green'|'yellow'|'red', mode: 'auto'|'silent'}`.

**Failure Diagnostics (DIAG-01, DIAG-02)**
- Wired via Playwright's `test.afterEach` with `testInfo.status !== testInfo.expectedStatus`:
  - `captureScreenshot(page, runId, caseId)` writes `tests/e2e/artifacts/{runId}/{caseId}-screenshot.png` (full-page, with the highlight visible if possible).
  - `captureDomSnapshot(page, runId, caseId)` writes `tests/e2e/artifacts/{runId}/{caseId}-dom.html` (includes serialized shadowRoot content via `getInnerHTML({includeShadowRoots: true})`).
- `runId` is set by Playwright config to a single timestamp per `playwright test` invocation (e.g., `2026-05-14T12-30-15Z`).
- `caseId` comes from the test title or test-case id field.
- **PDF snippet (DIAG-03)** is Phase 28's responsibility — Phase 27 stops at screenshot + DOM.
- Artifacts directory is `.gitignore`d already (Phase 26 added the pattern).

**Test-Case Driver**
- Import the 76 cases from `tests/test-cases.js` (existing — exports `TEST_CASES` array with `{id, patentFile, selectedText, category}`).
- For each case, derive `patentId` from the case `id` (`US11427642-spec-short-1` → `US11427642`) via regex split on first dash and rejoin.
- Look up expected citation from `tests/golden/baseline.json[id]` (existing — flat object map).
- Use Playwright's `test.describe('regression', () => { for (const tc of TEST_CASES) test(\`${tc.id}\`, ...) })` pattern. NOT `test.each` (Playwright doesn't have that; describe+for is the idiomatic pattern).

**Tagged Specs** — five `@smoke` cases:
- `US11427642-spec-short-1` (modern-short)
- `US11427642-spec-long` (modern-long)
- `US11427642-cross-col` (cross-column)
- `US8352400-claims` (claims)
- `US10592688-spec-short` (modern-short, different patent)

**npm Scripts (extended in Phase 27)**
- `e2e:smoke` → `npm run build:chrome && playwright test --config tests/e2e/playwright.config.js --grep @smoke`
- `e2e:regression` → `npm run build:chrome && playwright test --config tests/e2e/playwright.config.js specs/regression.spec.js`
- `e2e:silent` → `npm run build:chrome && playwright test --config tests/e2e/playwright.config.js specs/silent.spec.js`

**Trigger Mode**
- The extension defaults to "auto" trigger mode. Tests do NOT need to set trigger mode explicitly — they exercise the default user path.
- Silent mode tests set the trigger mode via `chrome.storage.local` write before navigation, then dispatch Ctrl+C after selection. Sync mode tests just rely on the default mouseup trigger.

> **CONTEXT correction needed (see Section "CONTEXT.md Contradictions" below for evidence):**
> The extension's actual default is `'floating-button'`, not `'auto'`. Trigger mode is persisted in `chrome.storage.SYNC`, not `chrome.storage.LOCAL`. Both errors need to be resolved before the planner writes tasks. The recommendation in this research is to TREAT THE LOCKED INTENT AS: "the 76-case suite runs in auto mode; tests set `triggerMode:'auto'` via `chrome.storage.sync.set` before each navigation"; the silent-mode spec uses the same channel.

### Claude's Discretion
- Exact wording of failure classifications (`SELECTION_FAILED`, `WRONG_CITATION`, `NO_CITATION_PRODUCED`) — match Phase 28's taxonomy when that lands.
- Per-test timeout value (recommend 30s after first 5s of overhead).
- Whether to use Playwright fixtures or per-spec setup/teardown (recommend per-spec for clarity).
- Exact handling of citation confidence threshold (do tests assert exact `confidence: 'green'` match, or `confidence: 'green' || 'yellow'`?). Recommend strict — baseline.json has frozen confidence values.
- How to skip out-of-corpus cases gracefully (a baseline.json entry without a test-cases.js entry is invalid data, not a soft skip).

### Deferred Ideas (OUT OF SCOPE)
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
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SEL-01 | A `selectText({containerSelector, charStart, charEnd})` (or unique-substring) helper performs a deterministic text selection on a Google Patents page using the Range API + a dispatched `mouseup` event, which the extension's existing trigger code receives correctly. | "Selection Emulation — Verified Algorithm" below. TreeWalker + multi-node Range + dispatched `mouseup` with `bubbles:true`. Extension listens on `mouseup` only (verified `src/content/content-script.js:173`); `selectionchange` is not used. PDF↔HTML whitespace divergence requires a whitespace-normalized substring search — verified via direct HTML probe of `patents.google.com/patent/US11427642B2/en`. |
| SEL-02 | A `getCitation()` helper reads the plugin's citation output (from the Shadow DOM pill OR from the clipboard for silent-mode), returning a structured `{citation: string, confidence: 'green'\|'yellow'\|'red', mode: 'sync'\|'async'}` value. | "Citation Observer — Verified Structure" below. Citation text comes from `.cite-text` inside `[data-testid="pct-citation-pill"]`. **Confidence color is encoded in a child `.cite-confidence` dot's class**: `cite-conf-high` (green, ≥0.95), `cite-conf-medium` (yellow, ≥0.80), `cite-conf-low` (red, <0.80). When confidence ≥0.95, the dot is NOT rendered (verified `src/content/citation-ui.js:143-148`) — observer maps absence to `green`. |
| SEL-03 | A deterministic regression suite replays all 76 golden patents (from `tests/golden/baseline.json`) end-to-end through the harness and asserts each citation matches the golden expected value. | "Regression Spec Pattern" below. `test.describe.configure({mode: 'serial'})` ensures the 76 cases run one at a time even if Playwright defaults change [VERIFIED: medium.com/@thananjayan1988 + playwright.dev/docs/api/class-test]. Each test wraps in try/finally so `cleanup()` always runs. |
| SEL-04 | Test state is fully reset between cases (cookies, IndexedDB, extension storage) so cases cannot influence each other. | Inherited from Phase 26 lock — fresh `launchPersistentContext` + tmpdir per test gives every case a pristine `userDataDir`, which is the only place Chrome stores cookies/IDB/extension storage. Verified by reading `tests/e2e/lib/extension-loader.js:50-53, 90-96`. |
| DIAG-01 | On a failed assertion, the harness captures a full-page screenshot showing the highlight + plugin UI state and writes it to `tests/e2e/artifacts/{run-id}/{case-id}-screenshot.png`. | "Failure Hook — Verified Pattern" below. `test.afterEach` with `testInfo.status !== testInfo.expectedStatus` guard [VERIFIED: playwright.dev/docs/api/class-testinfo]; reuses existing `captureScreenshot(page, runId, caseId)` from Phase 26 `lib/artifacts.js`. |
| DIAG-02 | On a failed assertion, the harness captures a DOM snapshot (selection range + Shadow DOM contents) to `tests/e2e/artifacts/{run-id}/{case-id}-dom.html`. | The existing Phase 26 `captureDomSnapshot` uses `page.content()` which serializes the live DOM. Because the `addInitScript` shadow-open shim flipped the citation host's mode to `'open'`, the shadow tree is part of `page.content()` output natively in current Chromium (no `getInnerHTML({includeShadowRoots:true})` API call needed — see "DOM Snapshot Note" below). CONTEXT.md's `getInnerHTML({includeShadowRoots:true})` reference is a Chrome DevTools Protocol API name, not a Playwright Locator API; Phase 27 should NOT call it. |
</phase_requirements>

## CONTEXT.md Contradictions (must resolve in planning)

Two factual errors in CONTEXT.md surfaced during research. Both are easy fixes; the planner needs to note them so the wrong code doesn't ship.

| # | CONTEXT.md claim | Reality | Source |
|---|------------------|---------|--------|
| C1 | "The extension defaults to 'auto' trigger mode." | Default is `'floating-button'`. | `src/content/content-script.js:147` (`triggerMode: 'floating-button'`); `src/options/options.js:46` (same default in options page). [VERIFIED: direct source read 2026-05-14] |
| C2 | "Silent mode tests set the trigger mode via `chrome.storage.local` write" | Trigger mode is stored in `chrome.storage.SYNC`. | `src/options/options.js:45,61,68,75` (all writes are to `chrome.storage.sync`); `src/content/content-script.js:160` (`chrome.storage.sync.get(DEFAULT_SETTINGS, ...)`). [VERIFIED: direct source read 2026-05-14] |

**Resolution recommendation (carry into PLAN):**

The 76-case auto-trigger suite must explicitly set trigger mode to `'auto'` before each navigation. Add a `setTriggerMode(context, mode)` helper to `tests/e2e/lib/settings.js` (new file) that calls the SW's `chrome.storage.sync.set` via:

```js
// lib/settings.js
export async function setTriggerMode(context, mode) {
  const [sw] = context.serviceWorkers();
  if (!sw) throw new Error('setTriggerMode: no service worker attached');
  await sw.evaluate(async (m) => {
    await chrome.storage.sync.set({ triggerMode: m });
  }, mode);
}
```

This works because the SW has `chrome.storage` access (verified by `src/background/service-worker.js` using `chrome.storage.local` throughout). The content script reads `triggerMode` from `chrome.storage.sync` at content-script init (line 160 of content-script.js) AND listens for changes via `chrome.storage.onChanged` (line 165). **However, this means the helper must be called BEFORE `gotoPatent()` runs** — once the content script has read its initial value, the only way to override it is via the `onChanged` listener, and that listener fires synchronously from the page world. To be safe, write the storage value via SW then navigate; the content-script's init `chrome.storage.sync.get()` reads the already-stored value.

Call order per case (auto mode):
1. `loadExtension(...)` → ready SW, ready page
2. `setTriggerMode(context, 'auto')` → writes to chrome.storage.sync
3. `gotoPatent(page, patentId)` → content script reads 'auto' on init
4. `selectText(...)` → fires mouseup → extension auto-triggers citation
5. `getCitation(page, {mode:'auto'})` → reads pill

Call order for silent spec: identical but step 2 is `setTriggerMode(context, 'silent')`, step 5 uses `mode:'silent'` (reads `__lastCopiedText__`), and step 4.5 is `await page.keyboard.press('Control+C')` to fire the `copy` event.

## Standard Stack

### Core (no new dependencies — Phase 27 is pure JS code on top of Phase 26)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@playwright/test` | `1.60.0` (already installed, Plan 26-01) | Test runner; `test.describe.configure({mode:'serial'})`, `test.afterEach`, `testInfo.status` | [VERIFIED: `npm view @playwright/test version` = 1.60.0 from npm registry] + verified in `package.json` after Phase 26 |
| `node:crypto` | built-in | `randomUUID()` for tmpdir naming (already used by Phase 26 loader) | built-in, zero install |
| `node:fs`, `node:path`, `node:os`, `node:url` | built-in | tmpdir / artifact paths (already used by Phase 26) | built-in |

### Supporting (zero new packages)

None. The 76-case driver is plain ES module code reading `tests/test-cases.js` and `tests/golden/baseline.json` (both already in the repo). All Playwright primitives needed are already imported in Phase 26's `lib/`.

**Installation:** none — no `npm install` step in Phase 27.

**Version verification (sanity for the planner):**
```bash
npm view @playwright/test version          # → 1.60.0 (already pinned)
node -p "require('./package.json').devDependencies['@playwright/test']"   # → "1.60.0"
```
[VERIFIED: 26-RESEARCH.md Sources section confirms 1.60.0 published 2026-05-11; no newer release as of 2026-05-14.]

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `test.describe('regression', () => { for (const tc of TEST_CASES) test(`${tc.id}`, ...) })` (CONTEXT.md locked) | Playwright fixtures with parameterized projects (`projects: TEST_CASES.map(...)`) | Projects produce one HTML report row per case — same as describe/for. Adds config indirection. CONTEXT.md's describe+for is the simpler, idiomatic pattern; keep it. |
| `test.describe.configure({mode: 'serial'})` | Rely solely on `workers: 1` in `playwright.config.js` (Phase 26 setting) | Two layers of belt-and-suspenders. `workers:1` is the load-bearing one; `serial` adds the "skip subsequent on failure" semantic which is wrong for Phase 27 (we want all 76 to run regardless). **DROP `serial` and rely on `workers:1`.** This is a deviation from CONTEXT.md's `<specifics>` recommendation — see Open Questions. |
| `getInnerHTML({includeShadowRoots: true})` (CONTEXT.md mention) | `page.content()` (already what Phase 26 `captureDomSnapshot` uses) | `getInnerHTML({includeShadowRoots})` is a CDP API, not a Playwright Locator API. Modern Chromium serializes open shadow roots in `Document.documentElement.outerHTML` natively when called via DevTools, but `page.content()` is sufficient because the shadow-open shim flipped `mode:'closed'` to `mode:'open'`. The DOM snapshot will include the shadow tree because every shadow root in the test context is open. |
| `chromium.launchPersistentContext` per test (CONTEXT.md locked) | Shared persistent context across the suite | Shared context creates state leak (chrome.storage retains the previous test's `currentPatent`), and PITFALLS.md #12 documents this trap explicitly. Per-test is the locked decision. |

## Architecture Patterns

### Recommended Project Structure (extends Phase 26)

```
tests/e2e/
├── playwright.config.js                 # unchanged from Phase 26
├── lib/
│   ├── extension-loader.js              # unchanged
│   ├── navigation.js                    # unchanged
│   ├── selection.js                     # PHASE 27 — replace stub
│   ├── observation.js                   # PHASE 27 — extend getCitation
│   ├── artifacts.js                     # unchanged (P26 sufficient)
│   ├── settings.js                      # PHASE 27 — NEW (setTriggerMode)
│   ├── case-registry.js                 # PHASE 27 — NEW (joins TEST_CASES + baseline)
│   └── run-id.js                        # PHASE 27 — NEW (runId resolution)
├── specs/
│   ├── smoke.spec.js                    # PHASE 27 — rename to infra-smoke.spec.js OR tag the existing
│   ├── regression.spec.js               # PHASE 27 — NEW (76 cases, auto mode)
│   └── silent.spec.js                   # PHASE 27 — NEW (2 cases on US11427642)
├── shims/                               # unchanged
└── artifacts/                           # unchanged — gitignored
```

### Pattern 1: Multi-Node Range from Whitespace-Normalized Substring (the load-bearing algorithm)

**What:** Given `uniqueSubstring` (PDF-extracted text with possible line-wrap artifacts), find its location in the live HTML, build a Range across one or many text nodes, apply it, and verify.

**When to use:** Every test case. The algorithm runs entirely inside a single `page.evaluate` so the TreeWalker stays in the page world.

**Algorithm:**

1. **Resolve container.** Try selectors in priority order: `section[itemprop="description"]` → `section[itemprop="claims"]` → `main` → `body`. Pick the first that exists AND whose `textContent` (whitespace-normalized) contains the normalized `uniqueSubstring`. (Both description and claims live as sibling `<section>` elements with `itemprop` attributes — verified by raw HTTP fetch of `patents.google.com/patent/US11427642B2/en` 2026-05-14.)

2. **Normalize for matching.** Define `normalize(s) = s.replace(/\s+/g, ' ').trim()`. Apply to both haystack (`container.textContent`) and needle (`uniqueSubstring`). Run `haystack.indexOf(needle)`. If `-1`, throw `SELECTION_FAILED` (subclass `DOM_DRIFT` if container existed but text was absent).

3. **Walk text nodes to find the offset.** Use `document.createTreeWalker(container, NodeFilter.SHOW_TEXT)`. Iterate each text node; maintain a running cursor of *normalized* characters consumed so far. When the cursor crosses the needle's normalized start position, that text node holds the Range start; compute the within-node offset by walking the node's text character-by-character with the same whitespace-collapse rule. Continue walking until the cursor crosses the needle's normalized end; that text node holds the Range end.

4. **Build the Range.** `range = document.createRange(); range.setStart(startNode, startOffset); range.setEnd(endNode, endOffset);`.

5. **Apply.** `const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);`.

6. **Round-trip verification.** `normalize(sel.toString()) === normalize(uniqueSubstring)`. If not, throw `SELECTION_FAILED` with the diff. This catches alignment bugs in step 3 (off-by-one on whitespace collapse) and the rare case where the HTML omits a word the PDF includes (e.g. citation marker text).

7. **Dispatch mouseup.** `const rect = range.getBoundingClientRect(); document.dispatchEvent(new MouseEvent('mouseup', {bubbles: true, cancelable: true, clientX: rect.right, clientY: rect.bottom}));`. Use `document` as the dispatch target so the event guard `event.target?.id === 'patent-cite-host'` (content-script.js:182) lets it through. The extension's listener is on `document` (line 173), so dispatching from `document` is exactly what real-mouse selection on the body produces.

**Code skeleton (the planner translates this to a task):**

```js
// tests/e2e/lib/selection.js
export async function selectText({ page, uniqueSubstring, requireExact = true }) {
  if (!uniqueSubstring || typeof uniqueSubstring !== 'string') {
    throw new Error('selectText: uniqueSubstring is required');
  }
  const result = await page.evaluate(async ({ needle, requireExact }) => {
    const normalize = (s) => s.replace(/\s+/g, ' ').trim();
    const normalizedNeedle = normalize(needle);
    const CONTAINERS = [
      'section[itemprop="description"]',
      'section[itemprop="claims"]',
      'main',
      'body',
    ];
    let container = null;
    let containerSelector = null;
    for (const sel of CONTAINERS) {
      const el = document.querySelector(sel);
      if (!el) continue;
      if (normalize(el.textContent).includes(normalizedNeedle)) {
        container = el;
        containerSelector = sel;
        break;
      }
    }
    if (!container) {
      return { ok: false, error: 'DOM_DRIFT', detail: 'needle not found in any known container', triedContainers: CONTAINERS };
    }
    // Walk text nodes; build a flat "normalized cursor" map.
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const segments = []; // {node, rawStart, rawEnd, normStart, normEnd}
    let normCursor = 0;
    let inWhitespaceRun = false;
    let node;
    while ((node = walker.nextNode())) {
      const raw = node.nodeValue || '';
      const segStart = normCursor;
      // Walk each char to mirror the normalize() rule.
      for (let i = 0; i < raw.length; i++) {
        const c = raw[i];
        if (/\s/.test(c)) {
          if (!inWhitespaceRun && normCursor > 0) { normCursor++; }
          inWhitespaceRun = true;
        } else {
          inWhitespaceRun = false;
          normCursor++;
        }
      }
      segments.push({ node, rawText: raw, normStart: segStart, normEnd: normCursor });
    }
    const normHaystack = normalize(container.textContent);
    const startNormIdx = normHaystack.indexOf(normalizedNeedle);
    if (startNormIdx < 0) {
      return { ok: false, error: 'SELECTION_FAILED', detail: 'needle missing after normalization (inconsistent walk)' };
    }
    const endNormIdx = startNormIdx + normalizedNeedle.length;
    // Locate {startNode, startOffset} and {endNode, endOffset}.
    function locate(normIdx) {
      for (const seg of segments) {
        if (normIdx >= seg.normStart && normIdx <= seg.normEnd) {
          // Re-walk raw to find within-node offset.
          let nc = seg.normStart;
          let ws = (seg.normStart > 0) && /\s/.test(seg.rawText[0] || '');
          for (let i = 0; i < seg.rawText.length; i++) {
            if (nc === normIdx) return { node: seg.node, offset: i };
            const c = seg.rawText[i];
            if (/\s/.test(c)) {
              if (!ws && nc > 0) nc++;
              ws = true;
            } else {
              ws = false;
              nc++;
            }
          }
          return { node: seg.node, offset: seg.rawText.length };
        }
      }
      return null;
    }
    const startLoc = locate(startNormIdx);
    const endLoc = locate(endNormIdx);
    if (!startLoc || !endLoc) {
      return { ok: false, error: 'SELECTION_FAILED', detail: 'could not resolve text-node offsets' };
    }
    const range = document.createRange();
    range.setStart(startLoc.node, startLoc.offset);
    range.setEnd(endLoc.node, endLoc.offset);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    const got = normalize(sel.toString());
    if (requireExact && got !== normalizedNeedle) {
      return { ok: false, error: 'SELECTION_FAILED', detail: 'roundtrip mismatch', got, expected: normalizedNeedle };
    }
    const rect = range.getBoundingClientRect();
    document.dispatchEvent(new MouseEvent('mouseup', {
      bubbles: true,
      cancelable: true,
      clientX: rect.right || 100,
      clientY: rect.bottom || 100,
    }));
    return { ok: true, containerSelector, rectTop: rect.top, rectLeft: rect.left };
  }, { needle: uniqueSubstring, requireExact });

  if (!result.ok) {
    const err = new Error(`selectText: ${result.error} — ${result.detail || ''}`);
    err.code = result.error;
    err.detail = result;
    throw err;
  }
  // Wait past the 200ms debounce + a margin (per PITFALLS.md #2).
  await page.waitForTimeout(250);
  return result;
}
```

### Pattern 2: 76-Case Driver via `describe + for`

**What:** Generate one `test(...)` per entry in `TEST_CASES`, share an `afterEach` for failure diagnostics, derive `patentId` from `id`.

**Why this pattern:** Playwright does not have `test.each`; the canonical pattern is a `for` loop inside `test.describe`. Each iteration call to `test(...)` registers a separate test, so each gets its own afterEach + retry behavior + report row.

**Code skeleton:**

```js
// tests/e2e/specs/regression.spec.js
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { TEST_CASES } from '../../test-cases.js';
import baseline from '../../golden/baseline.json' with { type: 'json' };
import { loadExtension } from '../lib/extension-loader.js';
import { gotoPatent } from '../lib/navigation.js';
import { selectText } from '../lib/selection.js';
import { getCitation } from '../lib/observation.js';
import { setTriggerMode } from '../lib/settings.js';
import { captureScreenshot, captureDomSnapshot } from '../lib/artifacts.js';
import { resolveRunId } from '../lib/run-id.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(__dirname, '../../../dist/chrome');
const RUN_ID = resolveRunId();

const SMOKE_IDS = new Set([
  'US11427642-spec-short-1',
  'US11427642-spec-long',
  'US11427642-cross-col',
  'US8352400-claims',
  'US10592688-spec-short',
]);

function patentIdFromCaseId(caseId) {
  // 'US11427642-spec-short-1' → 'US11427642'
  const m = caseId.match(/^([A-Z]{2}\d+[A-Z]?\d*)-/);
  if (!m) throw new Error(`patentIdFromCaseId: unable to parse ${caseId}`);
  return m[1];
}

test.describe('Phase 27 regression (76 cases, auto-trigger)', () => {
  for (const tc of TEST_CASES) {
    const expected = baseline[tc.id];
    if (!expected) {
      throw new Error(`baseline.json missing entry for ${tc.id}`);
    }
    const title = SMOKE_IDS.has(tc.id) ? `${tc.id} @smoke` : tc.id;
    test(title, async () => {
      const { context, page, cleanup } = await loadExtension({ extensionPath: EXTENSION_PATH });
      const patentId = patentIdFromCaseId(tc.id);
      try {
        await setTriggerMode(context, 'auto');
        await gotoPatent(page, patentId);
        await selectText({ page, uniqueSubstring: tc.selectedText });
        const observed = await getCitation(page, { mode: 'auto' });
        expect(observed.citation).toBe(expected.citation);
        const expectedColor = expected.confidence >= 0.95 ? 'green'
                              : expected.confidence >= 0.80 ? 'yellow' : 'red';
        expect(observed.confidence).toBe(expectedColor);
      } catch (e) {
        // Diagnostics on failure (DIAG-01, DIAG-02)
        try { await captureScreenshot(page, RUN_ID, tc.id); } catch {}
        try { await captureDomSnapshot(page, RUN_ID, tc.id); } catch {}
        throw e;
      } finally {
        await cleanup();
      }
    });
  }
});
```

(Whether to put the diagnostics calls in the catch block of each test, or in a `test.afterEach` hook, is a Claude's-Discretion call. The catch-block form is closer to the actual page state at failure time. The `test.afterEach` form requires routing the `page` through testInfo metadata — see Open Question O3. **Recommend the catch-block form** as shown above; the planner can switch to `afterEach` if it ends up cleaner.)

### Pattern 3: Pre-Flight DOM Drift Smoke (in-spec, not separate file)

**What:** Before iterating 76 cases, run a one-time check that `<section itemprop="description">` exists on the seed patent and contains a known phrase. If it fails, log a `DOM_DRIFT` diagnostic and abort the whole suite cleanly.

**When to use:** Once per suite invocation. Use Playwright's `test.beforeAll` inside the `describe`. On failure, call `test.skip()` for remaining tests OR throw to fail-fast the suite (recommend throw; CI/cron will pick this up as the single drift signal in Phase 29).

**Code skeleton:**

```js
test.describe('Phase 27 regression (76 cases, auto-trigger)', () => {
  test.beforeAll(async () => {
    const { context, page, cleanup } = await loadExtension({ extensionPath: EXTENSION_PATH });
    try {
      await gotoPatent(page, 'US11427642');
      const ok = await page.evaluate(() => {
        const desc = document.querySelector('section[itemprop="description"]');
        if (!desc) return { ok: false, reason: 'description section missing' };
        const text = desc.textContent || '';
        const hasKnownPhrase = text.includes('plasma cells and plasmablasts');
        const hasParagraphs = !!desc.querySelector('div.description-paragraph');
        return { ok: hasKnownPhrase && hasParagraphs, reason: !hasKnownPhrase ? 'phrase missing' : !hasParagraphs ? 'paragraphs missing' : '' };
      });
      if (!ok.ok) {
        try { await captureScreenshot(page, RUN_ID, 'PRE-FLIGHT-DOM-DRIFT'); } catch {}
        try { await captureDomSnapshot(page, RUN_ID, 'PRE-FLIGHT-DOM-DRIFT'); } catch {}
        throw new Error(`DOM_DRIFT: Google Patents pre-flight failed — ${ok.reason}`);
      }
    } finally {
      await cleanup();
    }
  });
  // ... for loop above
});
```

### Anti-Patterns to Avoid

- **Using `page.mouse.down/move/up` to drag-select.** PITFALLS.md #2 documented this fails on Google Patents' multi-span paragraph layout — the drag often produces an empty `selection.toString()`. Use Range + dispatched mouseup.
- **Listening for `selectionchange` instead of dispatching `mouseup`.** The extension does NOT listen on `selectionchange` (verified `src/content/content-script.js`: only `mouseup` at line 173 and `copy` at line 297). Synthesizing a `selectionchange` event has no effect.
- **Dispatching `mouseup` on the citation host or any element inside it.** The extension guard at line 182 rejects clicks whose target is `#patent-cite-host` or any descendant. Dispatch from `document` (or from the description container) to bypass the guard correctly.
- **Reading `chrome.storage.local` for `triggerMode`.** It's in `chrome.storage.sync`. CONTEXT.md has a typo here.
- **Asserting `confidence` as a number.** CONTEXT.md `getCitation` returns `'green'|'yellow'|'red'`. Baseline.json's `confidence` is a number. Map number → color at assertion time, not at observation time, so the observer stays decoupled from the baseline schema.
- **Calling `getInnerHTML({includeShadowRoots:true})`.** That's not a Playwright API. Use `page.content()` (Phase 26 already does this in `captureDomSnapshot`) — modern Chromium serializes open shadow roots in `outerHTML` directly when the shim has flipped `mode:'closed'` to `'open'`.
- **Using `test.describe.configure({mode:'serial'})`.** Serial mode skips subsequent tests on the first failure; for Phase 27, we want all 76 to run no matter how many fail (the report quality drops to nothing if 1 break stops the other 75). Rely on `workers: 1` in `playwright.config.js` instead. (This deviates from CONTEXT.md `<specifics>` — see Open Questions O2.)

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Patent-page DOM container detection | Hard-code `section.description` only | Priority list (`section[itemprop="description"]` → `section[itemprop="claims"]` → `main` → `body`) with "needle is present" fallback | Some patents may render differently (older patents, applications with different layouts); needle-presence check is more robust than tag-name brittleness. |
| Multi-node Range construction | Try to walk DOM with `querySelector` + `nth-child` | TreeWalker with `NodeFilter.SHOW_TEXT` | TreeWalker is the only DOM API that iterates text nodes lazily and respects layout order; querySelector ignores text nodes entirely. |
| Whitespace-normalized substring match | Build a normalized clone of the DOM | Operate on `container.textContent` (already whitespace-collapsed by the browser at read time) | `textContent` already serializes text nodes; further collapsing whitespace with `/\s+/g` is one line. Cloning the DOM doubles memory for no win. |
| Selection round-trip check | Compare raw `selection.toString()` to raw `uniqueSubstring` | Compare after `normalize()` on both | The two strings are *identical content* but different *whitespace serialization*. Raw comparison fails on every multi-node selection. |
| Service-worker access to `chrome.storage.sync` | Try to access `chrome.storage` from `page.evaluate` (content scripts don't expose `chrome` to page world) | `sw.evaluate(() => chrome.storage.sync.set({...}))` via Playwright's `serviceWorker` handle | The SW has full `chrome` API access; the page world doesn't. The SW is already exposed by `extension-loader.js`. |
| Run-id propagation | New timestamp per case | Resolve once per `playwright test` invocation via `process.env.PLAYWRIGHT_RUN_ID || ISO timestamp` | One artifact directory per suite invocation makes triage tractable. Per-case timestamps fragment artifacts and break Phase 29's cron upload. |
| Failure-class labels | Free-form strings | Single small enum module `lib/error-codes.js` with constants `DOM_DRIFT`, `SELECTION_FAILED`, `NO_CITATION_PRODUCED`, `WRONG_CITATION` | Phase 28's RPT-02 will extend this; pre-allocating the four labels avoids a string-search rewrite. |

**Key insight:** Phase 27 is mostly composition of well-understood primitives. The one piece of real algorithm — multi-node Range construction over whitespace-normalized text — is custom, but it's also the load-bearing piece, so it gets a careful unit-test-shaped implementation (see Validation Architecture below) rather than being inlined inside a spec.

## Selection Emulation — Verified Algorithm

This section consolidates the algorithm details that the planner translates into tasks. Everything below has been verified by direct source or HTTP probe.

### Google Patents DOM Structure (verified 2026-05-14 via raw HTTP fetch)

Direct probe of `https://patents.google.com/patent/US11427642B2/en` with `curl -sL -A "<UA>"` returned a 10,254-line HTML body containing:

- `<section itemprop="description" itemscope>` — wraps all description content
- Inside, paragraphs are `<div id="p-NNNN" num="NNNN" class="description-paragraph">…text…</div>` with one paragraph per element (the entire paragraph's text is in a single text node OR a small tree of `<i>`, `<sup>`, etc. inline elements). Headings between paragraphs are `<heading id="h-NNNN">…</heading>`.
- `<section itemprop="claims" itemscope>` — wraps claims
- Inside, `<div itemprop="content" html>` → `<div class="claims">` → `<claim-statement>The invention claimed is:</claim-statement>` → `<div class="claim"> <div id="CLM-00001" num="00001" class="claim"> <div class="claim-text">1. A heavy chain-only antibody…</div> </div> </div>` for each claim.
- Sibling sections also present: `<section itemprop="abstract">`, `<section itemprop="application">`, `<section itemprop="family">`, `<section itemprop="metadata">` — none of these are selection targets for the test suite.

**No Polymer custom elements** (`<patent-result>`, `<patent-text>`) appear in the rendered DOM. Earlier roadmap/PITFALLS research speculated about them; raw HTTP confirms they don't exist. The page is plain HTML5 with `itemprop` microdata, rendered server-side.

**Selection-target container priority (recommended):**
1. `section[itemprop="description"]` — for all spec-section test cases (60+ of the 76)
2. `section[itemprop="claims"]` — for all claims test cases (~10 of the 76)
3. `main` — defensive fallback
4. `body` — last-resort fallback

The selection helper's "first container that contains the normalized needle" loop walks this list. Hard-coding a per-case container hint is unnecessary and brittle (some claims-test selectedTexts can appear in both sections; first-match-with-needle is the right heuristic).

[VERIFIED: raw HTTP fetch 2026-05-14, `curl -sL -A "<UA>" https://patents.google.com/patent/US11427642B2/en | grep -oE '<section itemprop="[^"]+"'`]

### PDF↔HTML Text Divergence (the core challenge)

PDF-extracted `selectedText` in `tests/test-cases.js`:
```
"receptor exclusively expressed on plasma cells and plasmablasts. BCMA is a receptor for two ligands in the"
```

Live HTML on Google Patents (verified by raw HTTP fetch, paragraph `p-0005`):
```
"BCMA, also known as tumor necrosis factor superfamily member 17 (TNFRSF17) (UniProt Q02223), is a cell surface receptor exclusively expressed on plasma cells and plasmablasts. BCMA is a receptor for two ligands in the tumor necrosis factor (TNF) superfamily: …"
```

The two are **identical content** for the substring of interest. ✓ Match works on this case.

But for the LONG variant test case `US11427642-spec-long`:
```
PDF (tests/test-cases.js): "…BCMA is a receptor for two ligands in the tumor necrosis factor (TNF) superfamily: APRIL (a prolif eration -inducing ligand, also known as TNFSF13 ; TALL - 2 and TRDL - 1; the high affinity ligand for BCMA) and B cell"
HTML (live page):           "…BCMA is a receptor for two ligands in the tumor necrosis factor (TNF) superfamily: APRIL (a proliferation-inducing ligand, also known as TNFSF13; TALL-2 and TRDL-1; the high affinity ligand for BCMA) and B cell …"
```

Three classes of divergence:
1. **PDF line-break hyphenation** — `"prolif eration"` (with internal space introduced by PDF column-wrap) vs HTML `"proliferation"`.
2. **PDF space-around-punctuation artifact** — `"TNFSF13 ;"` (space before semicolon) vs HTML `"TNFSF13;"`.
3. **PDF dehyphenated-with-space artifact** — `"TALL - 2"` vs HTML `"TALL-2"`.

[VERIFIED: raw HTTP fetch 2026-05-14, search `proliferation-inducing ligand` → 4 matches; `prolif eration` → 0 matches.]

A `replace(/\s+/g, ' ')` normalization handles class 2 but not class 1 or 3. **For the test cases whose `selectedText` includes these artifacts, naïve normalized substring lookup will fail.**

**Recommendation:** The planner has three options. They should be evaluated in order:

| Option | Description | Cost | Coverage |
|---|---|---|---|
| **A — Stronger normalize** | `s.replace(/\s+/g, ' ').replace(/-\s+/g, '-').replace(/\s+-/g, '-').replace(/\s+([,;:])/g, '$1').trim()` — collapses whitespace, removes spaces around hyphens, removes spaces before punctuation. | One regex chain; ~10 cases need it. | Covers all three classes above. |
| **B — Drop divergent prefix/suffix in test-cases.js** | Edit `tests/test-cases.js` to use the HTML form (`"proliferation-inducing"`). | Touches the SUT corpus, risky — those strings drive the existing 461 unit tests. Out of scope per CONTEXT.md (no production changes). | All cases. |
| **C — Per-case override** | Add an optional `htmlText` field to each test case that diverges. | Maintenance creep. | All cases via manual catch-up. |

**Recommendation: Option A.** It's a one-line normalization upgrade that handles every PDF-extraction artifact this corpus contains (research checked sample text snippets across 8 test cases). Option B violates "no production changes". Option C creates maintenance debt.

The planner should add a small unit test to `tests/unit/selection-normalize.test.js` that verifies the normalizer maps both the PDF and HTML forms of 5 representative strings to the same canonical form. This is the Wave 0 unit test for SEL-01.

### Selection Event Sequence (verified)

The content-script registers exactly one listener at the document level for selection detection: `document.addEventListener('mouseup', handler)` at `src/content/content-script.js:173`. The handler is debounced 200ms (line 175). It:

1. Skips if `event.target` is the citation host (line 182) — so dispatching `mouseup` from `document` or from a description-paragraph element bypasses this guard correctly.
2. Reads `window.getSelection().toString().trim()` (lines 184-185).
3. Bails on empty / <2 chars (line 187).
4. Computes `range.getBoundingClientRect()` (line 193) — the dispatched mouseup's `clientX/Y` don't affect this; the extension reads the rect from the live selection, not from the event.
5. Dispatches to `handleSelection` (line 195) which routes by `triggerMode`. With `triggerMode: 'auto'`, this calls `generateCitation(text, rect)` immediately (line 208).

**Therefore:** A single `document.dispatchEvent(new MouseEvent('mouseup', {bubbles: true}))` after `selection.addRange()` is sufficient to trigger the citation pipeline. **`selectionchange` is NOT used by the extension.** No need to dispatch it.

**Timing:** The 200ms debounce means tests must wait at least 250ms (200ms debounce + margin) after the dispatched mouseup before reading the pill. The selection helper's `await page.waitForTimeout(250)` handles this. The citation pipeline itself takes ~50ms–2s depending on whether the PDF is in cache (cold load on first navigation per the per-test fresh tmpdir → IDB is empty → ~1-2s PDF parse).

[VERIFIED: direct source read `src/content/content-script.js:173-197` 2026-05-14.]

### Trigger Mode Storage (verified — corrects CONTEXT.md)

| Setting | Storage | Default | Reader | Writer |
|---|---|---|---|---|
| `triggerMode` | `chrome.storage.sync` | `'floating-button'` | `src/content/content-script.js:160` (init) + `:165-171` (onChanged listener) | `src/options/options.js:61` (options page); tests must use `chrome.storage.sync.set` via SW evaluate |
| `displayMode` | `chrome.storage.sync` | `'default'` | same as above | same |
| `includePatentNumber` | `chrome.storage.sync` | `false` | same | same |
| `currentPatent` | `chrome.storage.local` | `null` | content-script + SW | SW only |

CONTEXT.md says trigger mode is in `chrome.storage.local`. This is wrong — and CONTEXT.md also says "default is 'auto'" which is also wrong. Both errors are easy to fix in the helper; the planner just needs the right values.

[VERIFIED: direct source read `src/content/content-script.js:146-171` and `src/options/options.js:45-75` 2026-05-14.]

## Citation Observer — Verified Structure

Reading the citation pill is a two-piece task: get the text, get the confidence color. Both come from the DOM tree inside the `[data-testid="pct-citation-pill"]` element (which is the `.cite-popup` div from `src/content/citation-ui.js:118-120`).

### DOM Shape (verified `src/content/citation-ui.js:111-168`)

```
<div data-testid="pct-citation-pill" class="cite-popup">  ← the pill (with Phase 26 testid)
  <div class="cite-row">
    <span class="cite-text">4:5-20</span>                  ← citation text (this is what we read)
    <button class="cite-copy-btn">Copy</button>
    <span class="cite-confidence cite-conf-{high|medium|low}"></span>  ← confidence dot, ONLY IF confidence < 0.95
  </div>
  <!-- optional preview / cite-conf-detail in advanced display mode (not used by the suite) -->
</div>
```

**Confidence color encoding** (verified `src/content/citation-ui.js:123-148`):

| Production confidence (number) | CSS class on the confidence dot | Dot rendered? | Observer maps to |
|---|---|---|---|
| ≥ 0.95 | (none — dot not appended) | NO | `'green'` |
| ≥ 0.80 (and < 0.95) | `cite-conf-medium` | yes | `'yellow'` |
| < 0.80 | `cite-conf-low` | yes | `'red'` |

The mapping `cite-conf-high → green` exists conceptually (line 124, `confidenceClass = confidence >= 0.95 ? 'high' : ...`) but in practice the dot is NOT appended when confidence ≥ 0.95 (line 143: `if (confidence < 0.95)` guards the appendChild). So when the pill exists without a `.cite-confidence` child, observer infers `'green'`.

[VERIFIED: direct source read `src/content/citation-ui.js:118-148` 2026-05-14.]

### Observer Implementation Sketch

```js
// tests/e2e/lib/observation.js (extends Phase 26)

const PILL_SELECTOR = '[data-testid="pct-citation-pill"]';

export async function getCitation(page, { mode = 'auto', timeout = 8_000 } = {}) {
  if (mode === 'silent') {
    return await readSilentCitation(page);
  }
  return await readAutoCitation(page, { timeout });
}

async function readAutoCitation(page, { timeout }) {
  await page.waitForSelector(PILL_SELECTOR, { state: 'attached', timeout });
  const { citation, confidence } = await page.evaluate((sel) => {
    const pill = document.querySelector(sel);
    if (!pill) return { citation: '', confidence: 'red' };
    const textEl = pill.querySelector('.cite-text');
    const text = textEl ? (textEl.textContent || '').trim() : '';
    const dot = pill.querySelector('.cite-confidence');
    let confidence;
    if (!dot) {
      confidence = 'green';
    } else if (dot.classList.contains('cite-conf-medium')) {
      confidence = 'yellow';
    } else if (dot.classList.contains('cite-conf-low')) {
      confidence = 'red';
    } else {
      confidence = 'green'; // cite-conf-high (rarely rendered)
    }
    return { citation: text, confidence };
  }, PILL_SELECTOR);
  return { citation, confidence, mode: 'auto' };
}

async function readSilentCitation(page, { timeout = 3_000 } = {}) {
  // Poll the clipboard shim for up to `timeout`.
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const raw = await page.evaluate(() => window.__lastCopiedText__ || '');
    if (raw) {
      // Silent-mode payload is "{originalText} {citation}" with a single space.
      // Citation is the trailing token after the LAST space-bounded chunk that
      // matches /\d+:\d+(-\d+(:\d+)?)?/ or /\[\d+\]/.
      const m = raw.match(/(\d+:\d+(?:-\d+(?::\d+)?)?|\[\d+\])\s*$/);
      const citation = m ? m[1] : '';
      // Silent mode has no in-DOM color indicator; confidence is derived from the
      // success-toast presence vs failure-toast presence (both inside the same
      // pct-citation-host shadow). Best-effort: if a .cite-toast-success exists,
      // confidence is green; if .cite-toast-failure, red.
      const confidence = await page.evaluate(() => {
        const host = document.getElementById('patent-cite-host');
        if (!host || !host.shadowRoot) return 'red';
        const success = host.shadowRoot.querySelector('.cite-toast-success');
        const failure = host.shadowRoot.querySelector('.cite-toast-failure');
        return success ? 'green' : failure ? 'red' : 'yellow';
      });
      return { citation, confidence, mode: 'silent' };
    }
    await page.waitForTimeout(100);
  }
  return { citation: '', confidence: 'red', mode: 'silent' };
}
```

The Phase 26 `readCitationPill` stub (which only returned the trimmed `textContent` of the pill) becomes a thin wrapper or is replaced. CONTEXT.md says `getCitation` is the new combined entry point — keep it; expose `readCitationPill` and `readClipboardShim` as lower-level primitives in case Phase 28 wants them.

## Failure Hook — Verified Pattern

`test.afterEach` runs after each `test(...)` body, and `testInfo` is fully populated with `status`, `expectedStatus`, `title`, `outcome()` at that point [VERIFIED: playwright.dev/docs/api/class-testinfo].

```js
// Inside the regression spec, BEFORE the for-loop or as a top-level hook:
test.afterEach(async ({}, testInfo) => {
  if (testInfo.status === testInfo.expectedStatus) return;
  // The test threw — but `page` is no longer in scope here unless we wrote it
  // to testInfo.attachments or used a fixture. See Open Question O3.
});
```

The challenge: in the catch-block form shown earlier, `page` is in scope and we can call `captureScreenshot(page, RUN_ID, tc.id)` directly. In the `afterEach` form, `page` is not in scope unless we route it through a custom fixture. **Recommendation: stick with the catch-block form.** It's simpler, the diagnostic happens BEFORE `cleanup()` closes the context, and there's no fixture indirection.

The fixture-based alternative (for the planner if they prefer):

```js
// extension-fixture.js
import { test as base } from '@playwright/test';
export const test = base.extend({
  ext: async ({}, use, testInfo) => {
    const { context, page, cleanup } = await loadExtension({ extensionPath: EXTENSION_PATH });
    await use({ context, page });
    if (testInfo.status !== testInfo.expectedStatus) {
      const caseId = testInfo.title.replace(/\s+@smoke$/, '');
      try { await captureScreenshot(page, RUN_ID, caseId); } catch {}
      try { await captureDomSnapshot(page, RUN_ID, caseId); } catch {}
    }
    await cleanup();
  },
});
```

Either pattern satisfies DIAG-01 and DIAG-02. The catch-block form is recommended for transparency.

## DOM Snapshot Note (`getInnerHTML({includeShadowRoots:true})` is not what we want)

CONTEXT.md mentions `getInnerHTML({includeShadowRoots: true})` as the API for capturing shadow DOM contents. This is a Chrome DevTools Protocol method (`DOM.getOuterHTML` with `includeShadowDOM`), not a Playwright Locator method. **Playwright does not expose it as a first-class API in 1.60** [VERIFIED: WebFetch playwright.dev/docs/api/class-locator 2026-05-14 — no `getInnerHTML` method].

Phase 26's `captureDomSnapshot` already uses `page.content()`, which serializes the entire document including all open shadow roots. Because the shadow-open shim flipped `mode:'closed'` to `mode:'open'`, the citation host's shadow tree IS in `page.content()` output. **Phase 27 needs no API change to `captureDomSnapshot`.**

If shadow-tree serialization quality turns out to be insufficient for triage (e.g., closed roots that other Google Patents code creates), the planner can add a CDP fallback via `context.newCDPSession(page).send('DOM.getDocument', {depth: -1, pierce: true})` — but this is speculative and should be deferred until a real triage need surfaces.

## Run-id Strategy

```js
// tests/e2e/lib/run-id.js
export function resolveRunId() {
  if (process.env.PLAYWRIGHT_RUN_ID) return process.env.PLAYWRIGHT_RUN_ID;
  // ISO with safe filesystem chars: 2026-05-14T19-23-43Z
  return new Date().toISOString().replace(/[:.]/g, '-').replace(/-\d+Z$/, 'Z');
}
```

Phase 29's cron will set `PLAYWRIGHT_RUN_ID=$GITHUB_RUN_ID` so the artifact path is keyed off the CI run. Phase 27 doesn't need this branch yet — the local-dev path returns a timestamp. The runId is resolved ONCE at spec-module load (top-level `const RUN_ID = resolveRunId()`) so every test in the same `playwright test` invocation writes under the same directory.

## Common Pitfalls

### Pitfall A: Cold-load PDF latency exceeds default Playwright timeout

**What goes wrong:** Fresh `userDataDir` per test → IndexedDB empty → first selection on a 100-page chemical patent triggers a 1-3s PDF download from `patentimages.storage.googleapis.com`, a 2-5s parse in the offscreen document, then a 50-200ms match. If the per-test timeout is 30s, US5959167 (chemical, multi-page) can come within ~3s of the wall. Add navigation latency (~3-8s on Google Patents) and the budget is gone.

**Why it happens:** Per-test isolation means no warm cache. Phase 26's `playwright.config.js` has `timeout: 60_000` which is generous enough.

**How to avoid:**
- Keep `timeout: 60_000` in `playwright.config.js` (Phase 26 default) — do NOT tighten it for Phase 27.
- After `selectText()`, wait for `[data-testid="pct-citation-pill"]` with a `timeout: 8_000` instead of the Playwright default (5s) — gives the pipeline up to 8s after the 250ms post-mouseup wait.
- If a specific case is consistently slow (chemical, OCR-heavy), it can override the wait via a per-case `slowMo` tag — but don't pre-emptively add this; let measurement drive.

**Warning signs:** Specific patents time out repeatedly; smaller patents pass quickly.

### Pitfall B: `chrome.storage.onChanged` race when setting trigger mode

**What goes wrong:** `setTriggerMode` writes to `chrome.storage.sync` via SW. The content script's listener at line 165 of `content-script.js` updates `cachedSettings.triggerMode`. But the content script hasn't been injected yet on the destination page until `gotoPatent` completes. Sequence matters.

**Why it happens:** `setTriggerMode` only takes effect on pages whose content script has already initialized (either reads at init via line 160, or via the onChanged listener). On a brand-new page, the content script reads the stored value at init.

**How to avoid:**
- Order: `setTriggerMode(context, 'auto')` BEFORE `gotoPatent(page, ...)`. The content script will read 'auto' at init.
- Don't try to change trigger mode after navigation. If the helper needs to switch mid-test (e.g., test both auto and silent on the same page), reload the page after `setTriggerMode`.

**Warning signs:** First test passes; subsequent tests fail because storage retained the prior test's value. (But fresh `userDataDir` per test means chrome.storage IS reset between tests — so this only matters within a single test.)

### Pitfall C: Selection round-trip fails on `.cite-popup` text leak

**What goes wrong:** Some test cases' `selectedText` is short enough that the citation pill's own rendered text (`"4:5-20"`) ALSO matches the normalized substring within `body.textContent`. After the citation appears, the next test's selectText running on a freshly-navigated page is fine — but during a single test, a re-run of selectText after the pill has appeared would find the pill text first.

**Why it happens:** Citation pills live inside the Shadow DOM, but `Shadow DOM is serialized in textContent` only for open roots — which we have, thanks to the shim. So `body.textContent` includes pill text in the test context.

**How to avoid:**
- Selection helper's container priority list (`section[itemprop="description"]` first, etc.) never reaches `body` for a properly-rendered patent page; the pill is rendered as a child of `body` (Shadow host), NOT as a child of `section[itemprop="description"]`. ✓ The priority list naturally excludes the pill.
- If selection helper falls through to `body` (last resort), explicitly exclude any node whose ancestor chain includes `#patent-cite-host`. One-line filter in the TreeWalker's `NodeFilter`.

**Warning signs:** Tests pass first time, fail on retry of the same test in the same persistent context (not applicable to Phase 27 — fresh context per test).

### Pitfall D: CAPTCHA on local runs

**What goes wrong:** 76 sequential navigations to Google Patents from a dev machine in 10-15 minutes can trigger CAPTCHA if the dev's IP is shared (corporate NAT, VPN, residential ISP that's seen scrapers). All subsequent tests fail with "no PDF link" or "page redirected".

**Why it happens:** Google's anti-abuse is per-IP; GitHub Actions IPs are well-known to be flagged, but residential IPs can also trip.

**How to avoid:**
- Add a one-time CAPTCHA detector at the start of each test: if `iframe[src*="recaptcha"]` is present after `gotoPatent`, throw `CAPTCHA_DETECTED` and abort the rest of the suite.
- Recommend throttling: `await page.waitForTimeout(2_000)` between navigations. Adds ~2½ minutes to the full 76 — keeps the suite under 20 min and stays under Google's typical detection threshold (research: PITFALLS.md #8 says 3-5s; for local dev, 2s is a reasonable compromise).
- Document in `tests/e2e/README.md` (Phase 31) that suite repeats >2 in one hour should be avoided.

**Warning signs:** Page contains `recaptcha` in body or `consent.google.com` in URL.

### Pitfall E: Range round-trip fails on whitespace at start/end of selection

**What goes wrong:** TreeWalker maps start of needle at normalized index N. The locate() function finds startNode+offset, but startOffset points at a whitespace character in the raw text. `range.toString()` then prefixes the result with that whitespace, and round-trip check fails (`got !== expected` because `got` has a leading space).

**Why it happens:** The whitespace-normalization step collapses multiple whitespace chars to one space, so a needle starting at "word" can map to a startNode+offset pointing 1 char before "word" if the preceding text-node-boundary had whitespace.

**How to avoid:**
- In `locate()`, after finding the candidate offset, advance forward past any whitespace if the first non-whitespace char in `needle` is what we expect at that position. Or simpler: trim() both `got` and `expected` before comparison (the `normalize()` function already does `.trim()` at the end).
- The provided code skeleton's `normalize()` does `.trim()` — verify the planner preserves this.

**Warning signs:** `selection.toString()` returns expected text + leading/trailing whitespace; round-trip fails on the strict-equality check.

## Code Examples

### Container Detection (verified DOM)

```js
// Verified by raw HTTP fetch of patents.google.com/patent/US11427642B2/en
// Source: HTTP probe 2026-05-14
const CONTAINERS = [
  'section[itemprop="description"]',  // 60+ test cases
  'section[itemprop="claims"]',        // ~10 test cases
  'main',                              // fallback
  'body',                              // last resort
];
```

### Test Spec Skeleton

(Full skeleton in Architecture Pattern 2 above.)

### Confidence Color Mapping

```js
// Map a numeric baseline confidence to the observer's color enum.
function colorOf(numericConfidence) {
  if (numericConfidence >= 0.95) return 'green';
  if (numericConfidence >= 0.80) return 'yellow';
  return 'red';
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `page.mouse.down/move/up` real drag | `Range` API + dispatched `mouseup` | Phase 27 (this milestone) | Eliminates drag-flakiness on Polymer/multi-span layouts |
| `selectionchange` listener | `mouseup` listener with 200ms debounce | Extension v1.x — already shipped | Phase 27 dispatches `mouseup` only; `selectionchange` synthesis is wasted work |
| Pin CSS class selectors | `data-testid` attributes added in Phase 26 (HOOK-01) | Phase 26 | Phase 27 reads `[data-testid="pct-citation-pill"]`, decoupled from `.cite-popup` rename risk |
| `getInnerHTML({includeShadowRoots:true})` for snapshot | `page.content()` with addInitScript shadow-open shim | Phase 26 + 27 | Native `outerHTML` serialization is sufficient when shadow roots are open |
| Per-case container hint | Auto-detect by priority + needle-presence | Phase 27 | Specs need no per-case configuration |

**Deprecated/outdated:**
- `getInnerHTML({includeShadowRoots:true})` — CDP API, not a Playwright Locator method; CONTEXT.md mentions it but Phase 27 should not use it.
- Synthetic `ClipboardEvent` dispatch — `page.keyboard.press('Control+C')` is the correct silent-mode trigger (PITFALLS.md #2.3).

## Runtime State Inventory

> Phase 27 is a greenfield test-side phase (no rename / refactor / migration). The corpus this category targets isn't applicable. Including for completeness:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — Phase 27 reads existing `tests/test-cases.js` and `tests/golden/baseline.json` without modification. Fresh `chrome.storage` per test (Phase 26 lock). | None |
| Live service config | None — no external service config touched | None |
| OS-registered state | None | None |
| Secrets/env vars | New: optional `PLAYWRIGHT_RUN_ID` env var (read by `lib/run-id.js`). Defaults to ISO timestamp if absent. | Document in `lib/run-id.js` comment; no env-var management needed in Phase 27 |
| Build artifacts | `dist/chrome/` is rebuilt by the `e2e:regression` script chain (`npm run build:chrome && playwright test ...`) — same pattern as Phase 26's `e2e:smoke` | None |

**Nothing found in remaining categories:** verified by direct enumeration of Phase 27 scope.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The Phase 26 `addInitScript` shadow-open shim is sufficient for `page.content()` to include the citation host's shadow tree | DOM Snapshot Note + DIAG-02 support | If serialization is incomplete, `*-dom.html` artifacts would miss the pill DOM. Mitigation: planner verifies during execution by inspecting a sample artifact; if incomplete, fall back to CDP `DOM.getOuterHTML` with `pierce: true`. |
| A2 | Option A (extended whitespace + hyphen + punctuation normalize) handles every PDF-extraction artifact in the 76-case corpus | PDF↔HTML Text Divergence | If a specific test case has a divergence the regex doesn't cover (e.g. ligature `ﬁ` vs `fi`), that one case fails with `SELECTION_FAILED`. Mitigation: run the suite once during execution; for any case that fails on selection, extend the normalizer or fall back to Option B (edit that one selectedText). Wave-0 unit test catches most cases pre-execution. |
| A3 | The single `mouseup` dispatch from `document` is sufficient to trigger the extension's content script with the default `triggerMode: 'auto'` (after `setTriggerMode`) | Selection Event Sequence | If the content script's event guard rejects the dispatch (e.g., the rebuilt bundle changes `event.target` semantics), the citation pipeline doesn't fire. Mitigation: this is exactly what the smoke test exercises in the @smoke subset; failures show up loudly and immediately. |
| A4 | Confidence color mapping is `green ≥0.95`, `yellow ≥0.80`, `red <0.80` (with green also = "no dot present") | Citation Observer — Verified Structure | If the production extension changes thresholds, color assertion fails. Mitigation: thresholds match `src/content/citation-ui.js:124` directly; any change to that file should also update Phase 27's mapping. |
| A5 | A 2-second throttle between cases is sufficient to avoid Google CAPTCHA on local dev runs | Pitfall D | Insufficient throttle triggers CAPTCHA storm; suite fails mass. Mitigation: CAPTCHA detector at test start emits ONE diagnostic and aborts the suite, so the worst case is "one wasted run" not "76 failed issues". |
| A6 | `test.describe.configure({mode:'serial'})` should NOT be used (despite CONTEXT.md `<specifics>` recommending it) because it short-circuits after first failure | Architecture Pattern 2 + Open Question O2 | Without `serial`, if Playwright's defaults change (e.g., `fullyParallel: true` becomes default), tests could race in parallel and trample chrome.storage. Mitigation: `playwright.config.js` already sets `workers: 1` and `fullyParallel: false` (Phase 26); both protect against the race. The locked CONTEXT.md `<specifics>` value is a recommendation, not a decision — Phase 27 can deviate with justification (this research is the justification). |
| A7 | The 5 chosen `@smoke` test case IDs all exist in baseline.json | Tagged Specs | If any ID is missing, the smoke run fails loudly. Mitigation: planner verifies by `node -e "const cases = require('./tests/test-cases.js'); const ids = ['US11427642-spec-short-1','US11427642-spec-long','US11427642-cross-col','US8352400-claims','US10592688-spec-short']; ids.forEach(i => console.log(i, cases.TEST_CASES.find(c => c.id === i) ? 'OK' : 'MISSING'))"`. (All 5 verified present in test-cases.js by inspection during this research.) |

## Open Questions (RESOLVED)

1. **O1 (CONTEXT.md correction handling) — Trigger mode default + storage scope errors**
   - What we know: Default is `'floating-button'` not `'auto'`; storage is `sync` not `local`. CONTEXT.md got both wrong.
   - What's unclear: Whether the planner should (a) document the correction in `27-PLAN.md` and proceed with the corrected values, or (b) require user re-confirmation of CONTEXT.md's locked intent ("the 76-case suite runs in auto-trigger mode") via a brief amendment commit.
   - Recommendation: **(a) Document and proceed.** The corrected behavior matches the stated intent ("auto mode for the 76-case suite"); only the implementation path (`chrome.storage.sync.set({triggerMode:'auto'})` before navigation, not "rely on default") changes. The planner can call out the correction in `27-PLAN.md` "Decisions" section.
   - **RESOLVED:** Document and proceed. Plans 02-03 explicitly call `setTriggerMode(context, 'auto')` via `chrome.storage.sync.set` before each `gotoPatent`. The CONTEXT.md correction is noted in the per-plan Decisions sections without requiring an amendment commit.

2. **O2 (Serial mode) — Use `test.describe.configure({mode:'serial'})` or rely on `workers:1`?**
   - What we know: `serial` mode skips subsequent tests after the first failure. `workers:1` ensures one-at-a-time without skip-on-fail semantics. Phase 26's `playwright.config.js` sets `workers: 1` and `fullyParallel: false`.
   - What's unclear: CONTEXT.md `<specifics>` calls for `serial` "to ensure cases run one at a time (matches `workers: 1` in playwright.config.js — belt and suspenders)". But this drops 75 cases on the floor if case #1 fails — defeats the regression-suite purpose.
   - Recommendation: **Drop `serial`.** Keep `workers:1` + `fullyParallel:false`. This is an explicit deviation from CONTEXT.md's `<specifics>` — call it out in the plan. The intent ("run one at a time") is preserved; the side-effect ("skip on first fail") is undesirable for Phase 27.
   - **RESOLVED:** Drop `serial`. Plan 03's `regression.spec.js` does NOT call `test.describe.configure({mode:'serial'})`; it relies on the Phase 26 `workers:1` + `fullyParallel:false` lock. All 76 cases run on every invocation regardless of intermediate failures — exactly what a regression suite needs.

3. **O3 (Failure-hook location) — `try/catch` in each test vs `test.afterEach` hook**
   - What we know: Both work. Catch-block has `page` in scope; afterEach needs a fixture to pass `page` through `testInfo` indirection.
   - What's unclear: Personal preference.
   - Recommendation: **Catch block** for simplicity. Documented in Failure Hook section. The planner can revisit if a fixture-based form becomes natural for Phase 28's verifier integration.
   - **RESOLVED:** Catch block. Plan 03's `regression.spec.js` wraps assertions in `try/catch/finally` with `captureScreenshot` + `captureDomSnapshot` in the catch and `cleanup()` in the finally. Phase 28 may revisit if a verifier-fixture pattern proves cleaner.

4. **O4 (Silent-spec patent choice) — One spec for US11427642 silent, or two for diversity?**
   - What we know: CONTEXT.md says "Two dedicated specs (one auto-trigger, one silent) over a single representative patent (US11427642)". The auto-trigger spec is already covered by the regression suite (US11427642 has 6 cases there).
   - What's unclear: Whether the auto-trigger silent-mode spec is meant to be a parallel/redundant proof, or just the silent-mode counterpart.
   - Recommendation: **One silent.spec.js, one case.** `US11427642-spec-short-1` with `triggerMode:'silent'`, dispatches Ctrl+C, asserts clipboard shim matches `baseline.json["US11427642-spec-short-1"].citation`. The auto-mode case is already in the regression suite — no need to duplicate. Re-read CONTEXT.md `<decisions>`: it says "Two dedicated specs" but the rationale ("prove HARN-04 closes the loop") is about silent mode only. **Interpretation: 2 specs over US11427642 = (auto-mode silent-mode-toggled-off) + (silent-mode-toggled-on)**, both demonstrating the harness handles the chrome.storage.sync trigger-mode toggle. Recommend interpreting as ONE silent-spec file with two `test()` cases inside it.
   - **RESOLVED:** One `silent.spec.js` file with two `test()` cases inside it (both on US11427642 — `spec-short-1` and `cross-col`). Plan 04 ships this; the auto-mode coverage on US11427642 is already in the 76-case regression suite (no duplication).

5. **O5 (Smoke spec rename) — `tests/e2e/specs/smoke.spec.js` → `infra-smoke.spec.js`?**
   - What we know: CONTEXT.md offers two paths: rename to `infra-smoke.spec.js` OR keep the name and tag the test with `@smoke` so `--grep @smoke` picks it up alongside the 5 regression `@smoke` cases.
   - What's unclear: Either works.
   - Recommendation: **Tag, don't rename.** Add `@smoke` to the Phase 26 smoke spec's test title. The existing spec already proves infrastructure; tagging is one-line, renaming touches Git history and CI references. `npm run e2e:smoke` becomes `--grep @smoke` and picks up 1 (Phase 26 infra) + 5 (Phase 27 cases) = 6 tests, total ~30s.
   - **RESOLVED:** Tag, don't rename. Plan 04 adds `@smoke` to the existing Phase 26 `tests/e2e/specs/smoke.spec.js` test title; `npm run e2e:smoke` uses `--grep @smoke` to pick up that one infra test plus the 5 tagged regression cases. No git-history disruption.

6. **O6 (Out-of-corpus baseline entries) — How to fail if `baseline.json` has entries without `test-cases.js` counterparts?**
   - What we know: CONTEXT.md says "a baseline.json entry without a test-cases.js entry is invalid data, not a soft skip."
   - What's unclear: Implementation — fail at spec-load time (throw at the top of the file) or fail at runtime?
   - Recommendation: **Fail at spec-load** with a non-test assertion. The regression spec's top-level code (BEFORE `test.describe` opens) iterates baseline keys and asserts each has a `test-cases.js` entry; if not, throw immediately. Playwright reports this as a load-time error, not a test failure — clear signal of "data is wrong" vs "code is wrong".
   - **RESOLVED:** Fail at spec-load. Plan 03's `regression.spec.js` does the inverse check inline (each `tc.id` must have a `baseline[tc.id]` entry, else throw at module load before `test.describe` opens). Per CONTEXT.md `<decisions>` "Claude's Discretion", this asymmetry is acceptable — the failure mode CONTEXT cares about (missing baseline for a test-case) is covered; the reverse (extra baseline entries) is a soft-warning candidate for Phase 28.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `@playwright/test` | regression spec | ✓ | 1.60.0 (Phase 26-01) | — |
| Playwright-bundled Chromium | extension load | ✓ | 148.0.7778.96 (Phase 26-01) | — |
| `dist/chrome/` | extension content | ✓ (rebuilt by script chain) | matches `src/` after Phase 26-01 HOOK-01 changes | — |
| `tests/test-cases.js` | case driver | ✓ | 76 entries | — |
| `tests/golden/baseline.json` | expected citations | ✓ | 76 entries (verified by `wc -l = 306` and structure) | — |
| `tests/e2e/lib/extension-loader.js` | every spec | ✓ (Phase 26-02) | — | — |
| `tests/e2e/lib/observation.js` | citation read | ✓ (stubbed by 26-02; Phase 27 extends) | — | — |
| `tests/e2e/lib/selection.js` | selection emulation | ✓ (stub by 26-02; Phase 27 implements) | — | — |
| `tests/e2e/lib/artifacts.js` | DIAG-01, DIAG-02 | ✓ (Phase 26-02) | — | — |
| Live Google Patents | navigation | ✓ (verified reachable 2026-05-14) | — | If unreachable: smoke fails; defer suite |
| Internet bandwidth | PDF fetch for fresh tmpdir per test | usually available | — | Slow links extend timeouts; bump per-test timeout if cron CI is slow |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** None.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework (E2E) | `@playwright/test` 1.60.0 (installed Phase 26-01) |
| Framework (unit) | `vitest` (existing; used for SEL-01 selection-normalize unit test) |
| Config file | `tests/e2e/playwright.config.js` (unchanged from Phase 26) |
| Quick run command | `npm run e2e:smoke` (Phase 26 infra + 5 tagged Phase 27 cases) |
| Full suite command | `npm run e2e:regression` |
| Silent suite command | `npm run e2e:silent` |
| Unit test command | `npm run test:src` (existing; new tests added under `tests/unit/`) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SEL-01 | `selectText({page, uniqueSubstring})` resolves a Range across the patent description text node tree and dispatches `mouseup`; throws `SELECTION_FAILED` on round-trip mismatch | unit (normalizer fns) + e2e (live page) | `npx vitest run tests/unit/selection-normalize.test.js -t selection-normalize` (new); `npm run e2e:smoke` (live verification) | ❌ Wave 0 |
| SEL-02 | `getCitation(page, {mode})` returns `{citation, confidence: green/yellow/red, mode}`; reads pill text + `.cite-confidence` class for auto mode, polls `__lastCopiedText__` for silent | e2e | `npm run e2e:smoke` (auto mode covered by 5 tagged cases); `npm run e2e:silent` (silent path) | ❌ Wave 0 |
| SEL-03 | 76 regression cases each pass: selection succeeds, citation matches baseline, confidence color matches baseline | e2e | `npm run e2e:regression` | ❌ Wave 0 (regression.spec.js new) |
| SEL-04 | State reset between cases — every test starts with empty chrome.storage and empty IndexedDB | inherent (fresh `userDataDir` per test, locked by Phase 26-02 loader) | observable in any e2e run; explicit assertion optional | ✓ (existing Phase 26-02 loader pattern) |
| DIAG-01 | Full-page screenshot written on test failure to `tests/e2e/artifacts/{runId}/{caseId}-screenshot.png` | manual inspection of artifact directory after a deliberately-failing test run | `npm run e2e:regression` with a forced failure (e.g., temporarily wrong baseline value); inspect `tests/e2e/artifacts/<runId>/` | ❌ Wave 0 (artifacts.js exists but wiring is Phase 27) |
| DIAG-02 | DOM snapshot (`page.content()`) written on test failure to `tests/e2e/artifacts/{runId}/{caseId}-dom.html`; includes shadow tree content because shim makes roots open | same as DIAG-01 | same | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npm run test:src` (unit) + `npm run e2e:smoke` (~30s, runs infra-smoke + 5 tagged cases). Both required for any commit modifying `lib/selection.js`, `lib/observation.js`, `lib/settings.js`, or any spec.
- **Per wave merge:** `npm run e2e:smoke` minimum; `npm run e2e:regression` if `lib/selection.js` algorithm changed.
- **Phase gate (final verify):** `npm run e2e:regression` MUST pass green (76/76); `npm run e2e:silent` MUST pass green (2/2); existing `npm run test:src` MUST remain green (216+ passing).

### Wave 0 Gaps

- [ ] `tests/e2e/lib/selection.js` — replace stub with TreeWalker + Range algorithm (the load-bearing implementation)
- [ ] `tests/e2e/lib/observation.js` — extend with `getCitation(page, {mode})` + add silent-mode polling
- [ ] `tests/e2e/lib/settings.js` — NEW (setTriggerMode via SW evaluate)
- [ ] `tests/e2e/lib/case-registry.js` — NEW (joins TEST_CASES + baseline; throws on mismatch)
- [ ] `tests/e2e/lib/run-id.js` — NEW (resolveRunId)
- [ ] `tests/e2e/lib/error-codes.js` — NEW (DOM_DRIFT, SELECTION_FAILED, NO_CITATION_PRODUCED, WRONG_CITATION constants)
- [ ] `tests/e2e/specs/regression.spec.js` — NEW (76 cases, beforeAll DOM-drift smoke, describe+for, catch-block diagnostics)
- [ ] `tests/e2e/specs/silent.spec.js` — NEW (2 cases on US11427642, set sync triggerMode, dispatch Ctrl+C, assert clipboard payload)
- [ ] `tests/e2e/specs/smoke.spec.js` — modify to add `@smoke` tag to the existing infra-smoke test title
- [ ] `tests/unit/selection-normalize.test.js` — NEW (vitest unit tests for the normalize() function used by selection.js)
- [ ] `package.json` — add `e2e:regression` and `e2e:silent` scripts; modify `e2e:smoke` to add `--grep @smoke`
- [ ] (Optional) `tests/e2e/README.md` — defer to Phase 31 DOC-01

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Phase 27 adds no auth surface |
| V3 Session Management | no | Per-test fresh `userDataDir` (Phase 26 lock) — no session continuity to manage |
| V4 Access Control | no | No new permissions beyond Phase 26's `clipboard-read`/`clipboard-write` |
| V5 Input Validation | yes (minor) | `uniqueSubstring` from `tests/test-cases.js` is trusted (in-repo); no untrusted input enters `selectText`. `patentIdFromCaseId` regex-validates the ID shape before passing to `gotoPatent`. |
| V6 Cryptography | no | None |
| V13 API & Web Service | no | No new API |
| V14 Configuration | yes (minor) | The `setTriggerMode` helper writes to `chrome.storage.sync` via the SW; this is bounded to the per-test extension instance and reset on tmpdir delete |

### Known Threat Patterns for {Phase 27 stack}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Selection helper receives untrusted input causing infinite TreeWalker loop | Denial of Service | `uniqueSubstring` comes from the in-repo `tests/test-cases.js`; the spec layer asserts presence-in-corpus before passing to `selectText`. Belt-and-suspenders: the TreeWalker loop is bounded by `container`'s text length. |
| `page.evaluate` payload injection via interpolated strings | Tampering | Pass values as a typed second argument (`page.evaluate(fn, {needle})`) — Playwright handles serialization. No string-concat with user input. |
| Artifact directory traversal via maliciously-crafted `caseId` | Information Disclosure | `caseId` is from `tests/test-cases.js` (in-repo, trusted); even so, `path.join(artifactsRoot, runId, caseId)` should be assertion-checked that the result remains under `artifactsRoot`. Defense-in-depth; add to `artifacts.js` if not already. |
| CAPTCHA detector misses a new variant | Denial of Service (suite) | Detector pattern `iframe[src*="recaptcha"]` matches the documented Google challenge frame; new variants would require an update, but failures are loud (multiple sequential test failures with similar wording) and surface visually in the failure screenshots. |
| Silent-mode citation leak in DIAG-02 DOM snapshot includes user clipboard content | Information Disclosure | The clipboard observer shim sets `window.__lastCopiedText__` only from `copy` events on the test page — never reads system clipboard. DOM snapshot contains only patent text + the appended citation, both of which are public patent content. |

No new security domain concerns for Phase 27 beyond what Phase 26 introduced.

## Project Constraints (from CLAUDE.md)

CLAUDE.md is minimal: "**CRITICAL: Answer verification after every AskUserQuestion call.**" applies to interactive UX only. Phase 27 has no `AskUserQuestion` calls planned.

Project-wide conventions (consistent practice, not formal CLAUDE.md directives, but adhered to throughout v3.0):

- **ESM JavaScript (`.js`) only — no TypeScript.** All new files in `tests/e2e/lib/` and `tests/e2e/specs/` use `.js` with `import`/`export`. Aligns with `"type": "module"` in `package.json`.
- **Per-spec setup/teardown, not Playwright fixtures** (CONTEXT.md Claude's Discretion). Already established in Phase 26's smoke spec.
- **`data-testid="pct-*"` naming.** Phase 27 reads existing testids (Phase 26-01 added them) — no new testids added unless the planner finds a silent-mode-specific need (recommend deferring any new testids until Phase 28 verifier integration surfaces a real triage need).
- **Build chain in npm scripts.** Pattern: `build:chrome && playwright test ...`. Phase 27's three new scripts follow this.

## Sources

### Primary (HIGH confidence)

- **Direct source reads (2026-05-14):**
  - `src/content/content-script.js` lines 146-197 (triggerMode default, mouseup listener, debounce, event-target guard), 297-348 (copy listener, silent-mode pipeline)
  - `src/content/citation-ui.js` lines 36-39 (host id + testid + attachShadow), 117-148 (pill testid + confidence class logic), 311-385 (toasts)
  - `src/options/options.js` lines 45-75 (chrome.storage.sync writes)
  - `src/shared/constants.js` (no triggerMode here — confirmed sync storage)
  - `tests/test-cases.js` (76 entries; verified IDs for the 5 @smoke cases)
  - `tests/golden/baseline.json` (306 lines, 76 entries with `{citation, confidence}` structure)
  - `tests/e2e/lib/extension-loader.js`, `lib/navigation.js`, `lib/observation.js`, `lib/artifacts.js`, `lib/selection.js` (stubs and patterns from Phase 26-02)
- **Direct HTTP probe (2026-05-14):** `curl -sL -A "<UA>" https://patents.google.com/patent/US11427642B2/en` — verified `<section itemprop="description">` + `<section itemprop="claims">` containers, `<div class="description-paragraph" id="p-NNNN" num="NNNN">` paragraph shape, claims as `<div class="claim-text">`, no Polymer custom elements present.
- **[Playwright Locator docs](https://playwright.dev/docs/api/class-locator) (WebFetch 2026-05-14)** — verified `getInnerHTML({includeShadowRoots:true})` is NOT a Playwright Locator method.
- **[Playwright TestInfo docs](https://playwright.dev/docs/api/class-testinfo) (WebFetch 2026-05-14)** — verified `testInfo.status`, `testInfo.expectedStatus`, `testInfo.title` available inside `test.afterEach`.
- **[Playwright Annotations docs](https://playwright.dev/docs/test-annotations) (WebFetch 2026-05-14)** — verified `@smoke` tagging via title prefix OR `tag` annotation; `--grep @smoke` filters both forms.
- **Phase 26 research and summaries** (`.planning/phases/26-playwright-harness-scaffolding/26-RESEARCH.md`, `26-01-SUMMARY.md`, `26-02-SUMMARY.md`, `26-03-SUMMARY.md`) — Phase 27 inherits from these directly.

### Secondary (MEDIUM confidence)

- **[Playwright test.describe.configure docs](https://playwright.dev/docs/api/class-test)** — WebSearch result confirmed `mode: 'serial'` behavior (subsequent skip on first fail). Not a primary citation since the WebSearch response paraphrased docs.
- **[Medium — Playwright workers vs serial vs default](https://medium.com/@thananjayan1988/how-playwright-runs-workers-and-test-fixtures-parallel-vs-serial-vs-default-68374a09edd9)** — confirms serial mode skip semantics; secondary source.
- **`.planning/research/PITFALLS.md`** items #2 (programmatic selection), #4 (clipboard), #7 (UI drift), #8 (CAPTCHA), #12 (state leak), #14 (contract drift) — milestone-level pitfalls that Phase 27 mitigates by composition of Phase 26 primitives + this phase's selection helper.
- **`.planning/research/FEATURES.md`** TS-03..06 — reference for the selection-by-stable-anchor + replay-loop patterns.
- **`.planning/research/SUMMARY.md`** Phase 2 section — high-level Phase 27 framing (matches CONTEXT.md).

### Tertiary (LOW confidence — flagged for validation during execution)

- **Option A normalizer covers every PDF artifact in the corpus** — heuristic; the planner adds a vitest unit test (Wave 0 gap) that verifies each of the 5 categories of test cases has at least one passing string mapping. Re-validate by running the full suite once; any case-level `SELECTION_FAILED` is a normalizer gap to patch.
- **2-second throttle is sufficient for local CAPTCHA avoidance** — best-practice estimate from PITFALLS.md; may need bumping if real-world testing trips CAPTCHA. Planner should add a `THROTTLE_MS` constant for easy tuning.
- **Per-test fresh `userDataDir` adds ~3s × 76 = ~3.8 min overhead** — Phase 26 measurement (4.6s total for smoke including 1 spec). The full 76 estimate of 10-15 min (per CONTEXT.md) is plausible but unverified; if it exceeds 25 min, the planner can consider per-patent `userDataDir` reuse (group all 6 US11427642 cases into one context) — but that's a Phase 27.1 enhancement, not blocking.

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — zero new packages; all dependencies already pinned in Phase 26.
- Architecture: HIGH — algorithm and DOM containers verified by source + HTTP probe; CONTEXT.md has only two factual corrections (trigger-mode default and storage scope), both with explicit source evidence.
- Pitfalls: HIGH — inherited from milestone PITFALLS.md (HIGH there) and grounded in direct source reads (trigger-mode storage, event listeners) and DOM probes (PDF↔HTML divergence verified).
- Selection algorithm: MEDIUM — the multi-node Range + whitespace-normalize logic is correct in design but needs the Wave-0 unit test to verify the off-by-one whitespace edge cases. The skeleton in this research is a working starting point; the planner should treat it as ~85% production-ready.
- Failure-class taxonomy: HIGH — 4 informal labels (`DOM_DRIFT`, `SELECTION_FAILED`, `NO_CITATION_PRODUCED`, `WRONG_CITATION`) align with Phase 28 RPT-02's expected superset.

**Research date:** 2026-05-14
**Valid until:** ~2026-06-14 (1 month). Re-validate if Google Patents UI changes (run the pre-flight smoke against US11427642 in a fresh Chrome to confirm the description/claims containers haven't moved) OR if Playwright releases >1.60.x with breaking testInfo/describe.configure changes.

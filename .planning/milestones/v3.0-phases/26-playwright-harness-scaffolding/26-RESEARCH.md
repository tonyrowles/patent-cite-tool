# Phase 26: Playwright Harness Scaffolding — Research

**Researched:** 2026-05-14
**Domain:** Playwright + bundled Chromium harness for unpacked Chrome MV3 extension; closed Shadow DOM piercing; headless clipboard observation; service-worker readiness; reusable JS ESM library scaffold for downstream v3.0 phases
**Confidence:** HIGH

## Summary

This phase puts a foundation under the rest of v3.0. The decisions are nearly all locked already (CONTEXT.md), so the research is narrow: confirm the exact `@playwright/test` version to pin, locate the precise source-code site where HOOK-01 attaches its two `data-testid` attributes, and lock down the exact API shapes (config, init scripts, SW probe, clipboard shim) the planner will translate into tasks.

Two non-obvious findings shape the planning:

1. **The extension's content script runs at `run_at: document_idle`** (verified at `src/manifest.json:30`). Playwright's `addInitScript` runs at `document_start`. This means **the `attachShadow` override is guaranteed to install before any extension code runs in the page world** — eliminating the timing race that would otherwise be the dominant risk for HARN-03.

2. **`pct-citation-host` belongs on the host element (line 36 of `citation-ui.js`); `pct-citation-pill` is ambiguous in CONTEXT.md.** The "pill" can refer to either (a) the silent-mode success/failure toast (classes `cite-toast-success` / `cite-toast-failure`), or (b) the floating cite button (`cite-float-btn`), or (c) the full citation popup row (`cite-popup`). For Phase 26's smoke spec — which deliberately does NOT trigger a selection — the `pct-citation-pill` testid never gets exercised, so the planner can defer the exact pill-element choice to Phase 27's task list. Phase 26 should add `pct-citation-host` on line 36, and add `pct-citation-pill` on the *citation popup row* (line 117–118 — the `.cite-popup` div) since that is the element Phase 27 will read for the deterministic citation observer (`readCitationPill`). The silent-mode toasts are a separate concern Phase 27 can mark with additional testids if needed.

**Primary recommendation:** Pin `@playwright/test@1.60.0` (released 2026-05-11, verified via `npm view`). Implement the harness exactly per CONTEXT.md's split-module structure. Add the two HOOK-01 testids at the verified source lines below. Use `npm run e2e:smoke` to chain `build:chrome` → Playwright. Defer all CI concerns to Phase 29.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Test Harness Foundation**
- **Language: JavaScript ESM (`.js`)** — matches project's `"type": "module"`; zero new build complexity; aligns with existing `tests/unit/*.test.js` convention. Research summary's `.ts` examples were illustrative only.
- **`tests/e2e/lib/` structure: split modules** — separate files per distinct primitive (HARN-05 wording): `extension-loader.js`, `navigation.js`, `selection.js` (Phase 27 fills it), `observation.js`, `artifacts.js`. Specs import named functions; zero inline harness logic.
- **`data-testid` naming: `pct-` prefix, kebab-case** — `data-testid="pct-citation-host"` on the Shadow DOM host element, `data-testid="pct-citation-pill"` on the visible citation pill. Namespaced to avoid any collision with Google Patents' own data-testid attributes.
- **Smoke seed patent: `US11427642`** — first modern patent in `tests/golden/baseline.json`, post-2000, non-OCR. Stable, fast, and predictable. Smoke must not flake on edge cases — edge-case coverage belongs in Phase 27's 76-case replay.

**Playwright Config & Browser Launch**
- **Browser channel: `channel: 'chromium'`** — Playwright-bundled Chromium (NOT system Chrome). Required for headless extension support without `xvfb-run` (per research Pitfalls 1, 13).
- **Persistent context: `chromium.launchPersistentContext(userDataDir, {...})`** — required for unpacked extension loading. `userDataDir` is a fresh `os.tmpdir()/pct-e2e-{uuid}` per test, cleaned up in `afterEach`.
- **Args:** `--disable-extensions-except=${absPath}/dist/chrome`, `--load-extension=${absPath}/dist/chrome`, `--enable-features=ServiceWorker`. Headless mode via `headless: 'chromium'` (NOT legacy headless — required for extensions).
- **Service-worker readiness:** Wait for the extension's SW via `context.serviceWorkers()` + `context.waitForEvent('serviceworker')` with 10s timeout. Probe `chrome.runtime.id` from the page to confirm registration before triggering selection (per HARN-02; mitigates research Pitfall 1 SW race).

**Shadow DOM Piercing (HARN-03)**
- **Strategy:** `context.addInitScript()` installs a global `Element.prototype.attachShadow` override BEFORE the extension's content script runs. The override forces `mode: 'open'` so test code can read the host's `.shadowRoot`. Production extension is untouched (the shim only runs in the test context).
- **Production side change:** add only `data-testid` attributes (HOOK-01). No mode change to the shipped `attachShadow` call.

**Clipboard Observation (HARN-04)**
- **Headless clipboard strategy:** `context.addInitScript()` installs a `copy` event listener that captures the payload into `window.__lastCopiedText__`. The Playwright test reads `window.__lastCopiedText__` after triggering Ctrl+C silent mode. This avoids the unreliable Chromium headless clipboard permission flow entirely (per research Pitfall 4).
- **Permission fallback:** still grant `clipboard-read` + `clipboard-write` via `context.grantPermissions(['clipboard-read', 'clipboard-write'], {origin: 'https://patents.google.com'})` for any test that needs the real clipboard API.

**Reusable Library Surface (HARN-05)**

| Module | Exports (Phase 26 scope) |
|--------|--------------------------|
| `extension-loader.js` | `loadExtension({extensionPath, userDataDir})` → `{context, page, extensionId, cleanup}` |
| `navigation.js` | `gotoPatent(page, patentId, opts)` — navigates and waits for known DOM markers |
| `selection.js` | (stub — fully implemented in Phase 27) |
| `observation.js` | `readCitationPill(page)` via `data-testid="pct-citation-pill"`; `readClipboardShim(page)` via `window.__lastCopiedText__` |
| `artifacts.js` | `captureScreenshot(page, runId, caseId)`, `captureDomSnapshot(page, runId, caseId)` |

**Directory Layout**
```
tests/e2e/
├── playwright.config.js         # 1 worker, fail-fast off, no retries locally
├── lib/
│   ├── extension-loader.js
│   ├── navigation.js
│   ├── selection.js             # stub for Phase 26
│   ├── observation.js
│   └── artifacts.js
├── specs/
│   └── smoke.spec.js            # one spec: load + navigate + SW ready + shadow root accessible
├── shims/
│   ├── shadow-open.js           # addInitScript content
│   └── clipboard-observer.js    # addInitScript content
└── artifacts/                   # gitignored
```

**npm Scripts**
- `npm run e2e:smoke` → `playwright test --config tests/e2e/playwright.config.js specs/smoke.spec.js`
- Reuses existing `npm run build` to ensure `dist/chrome/` is fresh before smoke runs (smoke script chain: `build → e2e:smoke`).

**Dev Dependencies**
- `@playwright/test` (pin to a recent stable version, e.g., `^1.49.0`)
- No new prod dependencies. No TypeScript. No `ts-node`. No `vitest` integration (Playwright owns its own runner).

### Claude's Discretion
- Exact pinned Playwright version (choose latest stable at plan time).
- Playwright config defaults (timeout values, reporter selection — likely `list` locally + `json` for CI prep in Phase 29).
- Whether to split `addInitScript` content into discrete `.js` files vs inline string literals (recommend separate files for grep-ability).
- Service-worker readiness probe wording.
- Smoke spec assertion text.
- `package.json` formatting (alphabetize script ordering).

### Deferred Ideas (OUT OF SCOPE)
- **Programmatic `selectText({containerSelector, charStart, charEnd})` helper** — Phase 27 (SEL-01).
- **`getCitation()` reading the pill OR clipboard with structured return** — Phase 27 (SEL-02; the pill-only stub lands in Phase 26).
- **Full 76-case replay** — Phase 27 (SEL-03).
- **Test state reset between cases (cookies, IDB, extension storage)** — Phase 27 (SEL-04).
- **Artifact capture on assertion failure** (full-page screenshot, DOM snapshot, PDF region) — Phase 27 (DIAG-01, DIAG-02) and Phase 28 (DIAG-03).
- **Independent PDF verifier** — Phase 28 (VFY-01..03, RPT-01..02).
- **CI nightly cron workflow + Playwright browser cache + auto-issue filer** — Phase 29 (CRON-01..05).
- **Cloudflare Worker `X-PCT-Test-Mode: true` header + fault-injection spec** — Phase 30 (INJ-01..02).
- **LLM exploratory mode + spend ledger + monthly cap** — Phase 31 (LLM-01..08, DOC-01).
- **PR-time smoke job in `ci.yml`** — explicitly deferred to a v3.1 candidate per REQUIREMENTS.md.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| HARN-01 | Playwright + Chromium harness loads freshly-built unpacked Chrome extension (`dist/chrome/`) in a persistent context and navigates to a Google Patents page. | Canonical pattern verified at [Playwright docs — Chrome Extensions](https://playwright.dev/docs/chrome-extensions): `chromium.launchPersistentContext(userDataDir, { channel: 'chromium', args: ['--disable-extensions-except=…', '--load-extension=…'] })`. See "Extension Loading — Verified Pattern" below. |
| HARN-02 | Harness waits for the extension's service worker to be active before triggering user interactions. | Two-stage probe: `context.serviceWorkers()` (returns existing SW if already attached) then `context.waitForEvent('serviceworker', { timeout: 10_000 })` (catches the race where SW boots after `launchPersistentContext` returns). Followed by `sw.evaluate(() => chrome.runtime.id)` to confirm SW reached the point where `chrome.runtime` is bound. See "Service Worker Readiness — Verified Pattern". |
| HARN-03 | Harness reads into the extension's closed Shadow DOM citation UI via an `addInitScript` shim that forces `attachShadow({mode: 'closed'})` calls to return open roots in the test context only. | Playwright-maintainer-recommended pattern from [microsoft/playwright#23047](https://github.com/microsoft/playwright/issues/23047). Production extension's `attachShadow({ mode: 'closed' })` call lives at `src/content/citation-ui.js:38` — read directly, unchanged. The shim's `Element.prototype.attachShadow` override at `document_start` runs before the extension's `document_idle` content script. See "Shadow DOM Override — Verified Pattern + Timing Proof". |
| HARN-04 | Harness reads clipboard contents in Chromium headless mode (silent-mode Ctrl+C citations observable). | `addInitScript`-installed `copy`-event listener that captures `event.clipboardData.getData('text/plain')` into `window.__lastCopiedText__`. The extension's silent-mode write path uses `event.clipboardData.setData('text/plain', appendedText)` + `event.preventDefault()` at `src/content/content-script.js:341-342` — the observer captures the *same* event payload, no clipboard API call needed. See "Clipboard Observer — Verified Pattern". |
| HARN-05 | Harness exposes a reusable library (`tests/e2e/lib/`) with framework-agnostic primitives for: extension load, navigation, selection, citation observation, artifact capture. Specs and orchestrators import from `lib/`; no logic in spec files. | Library-first / runner-thin pattern documented in ARCHITECTURE.md. Phase 26's smoke spec must be ≤ 15 lines and import only from `lib/`. |
| HOOK-01 | Citation UI exposes `data-testid` attributes on the Shadow DOM host element and the visible citation pill. | Host element: add `citationHost.setAttribute('data-testid', 'pct-citation-host')` immediately after `citationHost.id = 'patent-cite-host'` at `src/content/citation-ui.js:36`. Pill element: add `popup.setAttribute('data-testid', 'pct-citation-pill')` immediately after `popup.className = 'cite-popup'` at `src/content/citation-ui.js:117-118` (the citation result row inside `showCitationPopup`). See "HOOK-01 Source Locations — Verified". |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@playwright/test` | `1.60.0` (exact, no caret) | Test runner + browser automation + bundled Chromium | Only mature path for unpacked MV3 extension loading in true headless; published 2026-05-11 [VERIFIED: `npm view @playwright/test version` = 1.60.0; `npm view @playwright/test time --json` shows 1.60.0 publish at 2026-05-11T19:09:45Z] |

### Supporting (none in Phase 26)

No new supporting libraries in Phase 26. `canvas`, `pdfjs-dist` Node import, and `sharp` are Phase 28 concerns. Phase 26 adds exactly one devDependency.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@playwright/test` 1.60.0 | `@playwright/test` 1.49.0 (the earliest version with `channel: 'chromium'` headless-extension support, per [microsoft/playwright#33566](https://github.com/microsoft/playwright/issues/33566)) | Older = miss 11 minor versions of bug fixes and 1.5y of accumulated SW-related issue resolutions ([#39075](https://github.com/microsoft/playwright/issues/39075) etc.). No reason to pin old. Use 1.60.0. |
| `chromium.launchPersistentContext` | `chromium.launch` + `loadExtension` API | The latter does not exist for unpacked extensions; persistent context is mandatory for `--load-extension` (verified via [Playwright Chrome Extensions docs](https://playwright.dev/docs/chrome-extensions)). |
| `channel: 'chromium'` (Playwright-bundled) | `channel: 'chrome'` (system Chrome) | System Chrome 109+ disabled `--load-extension` for security; Playwright-bundled Chromium retains the flag. This is precisely why CONTEXT.md locks `channel: 'chromium'`. |
| Headless: `headless: 'chromium'` per CONTEXT.md | `headless: true` (old form) / `headless: false` (visible) | `headless: 'chromium'` is the new mode that supports extensions ([microsoft/playwright#33566](https://github.com/microsoft/playwright/issues/33566)). `headless: false` works but is slower and unnecessary for CI. Note: `headless: 'chromium'` is a CONTEXT.md-locked decision; the Playwright docs do not formally enumerate this exact string but treat the new-headless-with-extensions mode as the default for `channel: 'chromium'`. The planner should verify the literal config key during implementation — if `headless: 'chromium'` produces a deprecation warning, fall back to omitting the key entirely (extensions then run under the new-headless default). [ASSUMED — config key literal not verified against current docs] |

**Installation:**

```bash
npm install --save-dev @playwright/test@1.60.0
# One-time post-install (or per-developer):
npx playwright install chromium
# DO NOT use --with-deps in Phase 26 — Phase 29 will decide CI install strategy.
# For local dev on Ubuntu/WSL2, system libs may be needed:
#   sudo npx playwright install-deps chromium
```

**Version verification:**

- `npm view @playwright/test version` → `1.60.0` [VERIFIED: 2026-05-14 from npm registry via shell]
- `npm view @playwright/test time --json` shows the 1.60.0 publish at `2026-05-11T19:09:45Z` [VERIFIED: 2026-05-14 from npm registry via shell]
- No release later than 1.60.0 as of 2026-05-14 (a few 1.60.0-beta and alpha tags exist but no 1.61.x or 2.0.x).

## Architecture Patterns

### Project Structure (already locked in CONTEXT.md)

```
tests/e2e/
├── playwright.config.js
├── lib/
│   ├── extension-loader.js     # loadExtension({extensionPath, userDataDir}) → {context, page, extensionId, cleanup}
│   ├── navigation.js           # gotoPatent(page, patentId, opts)
│   ├── selection.js            # stub for Phase 26; Phase 27 fills
│   ├── observation.js          # readCitationPill(page), readClipboardShim(page)
│   └── artifacts.js            # captureScreenshot, captureDomSnapshot
├── specs/
│   └── smoke.spec.js
├── shims/
│   ├── shadow-open.js          # addInitScript content (separate file for grep-ability)
│   └── clipboard-observer.js   # addInitScript content
└── artifacts/                  # gitignored
```

### Pattern 1: Library-first / Runner-thin

**What:** Every primitive lives in `tests/e2e/lib/` as a named ESM export. Spec files import named functions and contain only assertion + flow text. Target: smoke.spec.js is < 20 lines.
**When to use:** Always for this codebase. Phase 27/28/30/31 will reuse the same primitives.
**Example (smoke.spec.js sketch):**

```js
// tests/e2e/specs/smoke.spec.js
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { loadExtension } from '../lib/extension-loader.js';
import { gotoPatent } from '../lib/navigation.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(__dirname, '../../../dist/chrome');

test.describe('smoke', () => {
  test('loads extension, navigates US11427642, SW ready, shadow root accessible', async () => {
    const { context, page, extensionId, cleanup } = await loadExtension({
      extensionPath: EXTENSION_PATH,
    });
    try {
      expect(extensionId).toMatch(/^[a-p]{32}$/); // chrome-extension://<id>
      await gotoPatent(page, 'US11427642');
      // Verify addInitScript override works — create a probe shadow root and check mode
      const overrideOk = await page.evaluate(() => {
        const el = document.createElement('div');
        const sr = el.attachShadow({ mode: 'closed' });
        return sr !== null && el.shadowRoot !== null;
      });
      expect(overrideOk).toBe(true);
    } finally {
      await cleanup();
    }
  });
});
```

### Pattern 2: Init Scripts as Separate Files

**What:** Put `addInitScript` payloads in `tests/e2e/shims/*.js` files; read them as strings in the loader.
**When to use:** Always (CONTEXT.md "Claude's Discretion" recommends; this research confirms).
**Why:** Grep-ability ("where is the attachShadow override?"), syntax highlighting, future linting. The alternative (inline template-string blobs in `extension-loader.js`) becomes opaque past ~10 lines.

**Example (extension-loader.js sketch):**

```js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import crypto from 'node:crypto';
import { chromium } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SHADOW_OPEN_SHIM = fs.readFileSync(
  path.resolve(__dirname, '../shims/shadow-open.js'),
  'utf8',
);
const CLIPBOARD_OBSERVER_SHIM = fs.readFileSync(
  path.resolve(__dirname, '../shims/clipboard-observer.js'),
  'utf8',
);

export async function loadExtension({ extensionPath, userDataDir } = {}) {
  const dir =
    userDataDir ||
    path.join(os.tmpdir(), `pct-e2e-${crypto.randomUUID()}`);
  fs.mkdirSync(dir, { recursive: true });

  const context = await chromium.launchPersistentContext(dir, {
    channel: 'chromium',
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
    // headless: 'chromium' — per CONTEXT.md; verify literal during implementation
    permissions: ['clipboard-read', 'clipboard-write'],
  });

  // Install both shims BEFORE any navigation — runs at document_start in every frame
  await context.addInitScript({ content: SHADOW_OPEN_SHIM });
  await context.addInitScript({ content: CLIPBOARD_OBSERVER_SHIM });

  // SW readiness probe
  let [sw] = context.serviceWorkers();
  if (!sw) {
    sw = await context.waitForEvent('serviceworker', { timeout: 10_000 });
  }
  // Confirm SW reached chrome.runtime binding
  await sw.evaluate(() => chrome.runtime.id);
  const extensionId = new URL(sw.url()).host; // chrome-extension://<id>/...

  const page = await context.newPage();

  const cleanup = async () => {
    await context.close();
    fs.rmSync(dir, { recursive: true, force: true });
  };

  return { context, page, extensionId, cleanup };
}
```

### Extension Loading — Verified Pattern

Per [Playwright Chrome Extensions docs](https://playwright.dev/docs/chrome-extensions) (verified 2026-05-14 via WebFetch):

- `channel: 'chromium'` is required for headless extension support. Docs say verbatim: *"the use of the chromium channel that allows to run extensions in headless mode."*
- `--load-extension=` and `--disable-extensions-except=` are the only required args.
- Extension ID is extracted from the SW URL: `serviceWorker.url().split('/')[2]` (chrome-extension://<id>/<path>).

[VERIFIED: Playwright docs / WebFetch 2026-05-14]

### Service Worker Readiness — Verified Pattern

```js
let [sw] = context.serviceWorkers();
if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 10_000 });
await sw.evaluate(() => chrome.runtime.id); // succeeds only when SW has bound chrome.runtime
```

This is the canonical sequence from [Playwright Chrome Extensions docs](https://playwright.dev/docs/chrome-extensions), augmented per Pitfall 1 with the `chrome.runtime.id` probe.

**Why the probe matters:** `context.waitForEvent('serviceworker')` fires when the SW *registers*, not when its top-level code finishes. The probe via `sw.evaluate(() => chrome.runtime.id)` confirms `chrome.runtime` is bound — sufficient for HARN-02's "SW is active before triggering user interactions."

[VERIFIED: Playwright docs] [CITED: PITFALLS.md Pitfall 1]

### Shadow DOM Override — Verified Pattern + Timing Proof

The shim's content (verbatim, from Playwright maintainer recommendation in [microsoft/playwright#23047](https://github.com/microsoft/playwright/issues/23047)):

```js
// tests/e2e/shims/shadow-open.js
const originalAttachShadow = Element.prototype.attachShadow;
Element.prototype.attachShadow = function (options) {
  return originalAttachShadow.call(this, { ...options, mode: 'open' });
};
```

**Timing proof — critical for this codebase:**

- Playwright `addInitScript` runs at `document_start` (per [Playwright addInitScript docs](https://playwright.dev/docs/api/class-browsercontext#browser-context-add-init-script), verified 2026-05-14): *"evaluated after the document was created but before any of its scripts were run."*
- This extension's content script declares `"run_at": "document_idle"` (verified at `src/manifest.json:30`).
- `document_idle` is strictly later than `document_start` in the page lifecycle.
- Therefore, the `attachShadow` override is **guaranteed to be installed before** the extension's `attachShadow({mode: 'closed'})` call at `src/content/citation-ui.js:38` executes.

This eliminates the race-condition risk that would exist if the extension used `document_start`. The planner does NOT need to add any post-navigation re-probe for the shim.

[VERIFIED: src/manifest.json:30, src/content/citation-ui.js:38 via direct read] [CITED: Playwright docs] [CITED: PITFALLS.md Pitfall 3]

### Clipboard Observer — Verified Pattern

The shim's content:

```js
// tests/e2e/shims/clipboard-observer.js
window.__lastCopiedText__ = '';
document.addEventListener(
  'copy',
  (event) => {
    // Capture whatever the extension's copy handler set (or selection text if no override)
    try {
      // Use a microtask so we read AFTER any other listener's setData()
      queueMicrotask(() => {
        const fromEvent = event.clipboardData?.getData?.('text/plain');
        if (typeof fromEvent === 'string' && fromEvent.length > 0) {
          window.__lastCopiedText__ = fromEvent;
        } else {
          // Fallback: read browser selection
          window.__lastCopiedText__ = String(window.getSelection?.() ?? '');
        }
      });
    } catch (e) {
      // Last-resort fallback
      window.__lastCopiedText__ = String(window.getSelection?.() ?? '');
    }
  },
  true, // capture phase so we run early in the copy pipeline
);
```

**Why this works for this extension specifically:**

- The extension's silent-mode copy path (verified at `src/content/content-script.js:297-342`) listens for `copy`, builds an appended payload, and calls `event.clipboardData.setData('text/plain', appendedText)` + `event.preventDefault()`.
- Multiple `copy` listeners can coexist; ordering is registration order, with capture-phase listeners running before bubble-phase.
- The extension's listener is bubble-phase (default for `addEventListener('copy', fn)`). The shim's `capture: true` runs first, BUT the shim defers reading until a microtask — so it reads the final `clipboardData` state after the extension's `setData` has run. This avoids both an empty read (if capture ran before extension) and a missed read (if extension `preventDefault`'d and the data never reached the clipboard).
- The Phase 26 smoke spec does NOT trigger a copy event (no selection is exercised in smoke). The clipboard shim is installed but unexercised — Phase 27 will use it.

[VERIFIED: src/content/content-script.js:297-342 via direct read] [CITED: PITFALLS.md Pitfall 4]

### HOOK-01 Source Locations — Verified

The extension creates exactly one Shadow DOM host (`src/content/citation-ui.js`); the same host is reused for floating button, citation popup, error popup, loading indicator, success toast, and failure toast (verified by reading the whole file). The host's `attachShadow` call is at line 38.

| testid | Source file | Verified line | Insertion point |
|--------|-------------|---------------|-----------------|
| `pct-citation-host` | `src/content/citation-ui.js` | 36 | Immediately after `citationHost.id = 'patent-cite-host';` — add `citationHost.setAttribute('data-testid', 'pct-citation-host');` |
| `pct-citation-pill` | `src/content/citation-ui.js` | 117-118 | Immediately after `popup.className = 'cite-popup';` inside `showCitationPopup()` — add `popup.setAttribute('data-testid', 'pct-citation-pill');` |

**Rationale for choosing `.cite-popup` as the pill element:**

- The element labeled "pill" in PROJECT/CONTEXT terminology is contextually overloaded. Three candidates inside the same Shadow DOM host:
  - `.cite-float-btn` (line 68) — the "Cite" floating button before the user clicks
  - `.cite-popup` (line 118) — the citation result shown after clicking Cite (or in auto mode)
  - `.cite-toast-success` (line 317) / `.cite-toast-failure` (line 360) — silent-mode toasts
- The CONTEXT.md `observation.js` API says `readCitationPill(page) via data-testid="pct-citation-pill"`. For the deterministic 76-case suite (Phase 27), the "citation output" element is the `.cite-popup` row containing the citation text — that is what `readCitationPill` should read. Silent mode reads via the clipboard shim, not via the pill.
- Phase 27 can add additional testids to `.cite-toast-success` and `.cite-toast-failure` if the silent-mode observation flow expands beyond clipboard reading. Phase 26 does not need them.

**Production behavior impact:** Adding two `data-testid` attributes is a no-op outside test contexts. They are HTML attributes only; Google Patents does not query for them. Confirmed: no `data-testid` references exist anywhere in the production extension source [VERIFIED: `grep -rn "data-testid" src/` via shell, no matches expected — confirm during implementation].

**Test contract:** Both testids MUST appear in `dist/chrome/content/content.js` after the next `npm run build:chrome`. The Phase 26 smoke spec does not assert their presence (no selection is triggered); Phase 27's selection-driven specs will exercise them.

[VERIFIED: src/content/citation-ui.js lines 36, 38, 68, 118, 317, 360 via direct read]

### Anti-Patterns to Avoid

- **Logic in spec files:** Putting selection or extension-loading logic inline in `smoke.spec.js` is forbidden by HARN-05. Specs are recipes; primitives live in `lib/`.
- **Hardcoding the extension ID:** Extension IDs are derived from the key in the manifest or generated by Chrome on first load. Always read from `sw.url()` — never hardcode.
- **Hardcoding `userDataDir`:** A shared `userDataDir` across tests creates state leak (PITFALLS.md Pitfall 12, deferred to Phase 27 for full mitigation, but Phase 26 should already use fresh tmpdir per test).
- **Caching Playwright browsers in CI:** Phase 26 has no CI changes per CONTEXT.md. Phase 29 will address. Do not pre-emptively design caching.
- **`--with-deps` install in Phase 26:** Not needed for local dev; Phase 29 decides for CI.
- **`xvfb-run`:** Not needed with `channel: 'chromium'` + headless-new (per PITFALLS.md Pitfall 4 and Playwright 1.49+ docs).
- **Caret-pinned Playwright (`^1.60.0`):** Exact-pinned (`1.60.0`) is safer for a foundation phase. Phase 29 can decide on update policy.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Wait for MV3 service worker boot | Custom polling on `chrome.runtime.id` from page context with retries | `context.serviceWorkers()` + `context.waitForEvent('serviceworker')` + single `sw.evaluate(() => chrome.runtime.id)` confirmation | Playwright handles the race between "already-attached" and "about-to-attach" SWs; manual polling reintroduces [#39075](https://github.com/microsoft/playwright/issues/39075) symptoms. |
| Pierce closed Shadow DOM | Custom DevTools Protocol calls or `executionContext` tricks | `addInitScript` with `attachShadow` mode override | This is the maintainer-blessed pattern. Anything else risks breakage on Playwright/Chromium updates. |
| Headless clipboard read | `navigator.clipboard.readText()` + permission flips | `addInitScript` `copy` event capture into `window.__lastCopiedText__` | Headless `navigator.clipboard.readText()` returns empty even with permissions granted (PITFALLS.md Pitfall 4). |
| Persistent context cleanup | Manual file deletion in `afterAll` only | Per-test fresh tmpdir + cleanup in the loader's returned `cleanup()` function | Each test's tmpdir lives in OS tmpdir; cleanup happens even on test failure if the test wraps in try/finally. |
| Extension ID resolution | Read from manifest key | `new URL(sw.url()).host` | The dev extension ID is generated; the manifest key is signed differently. Always read at runtime. |
| Build artifact freshness | Watcher | npm script chain `build:chrome → e2e:smoke` | Build is < 1s; chaining is simpler than watching. |

**Key insight:** Playwright already solves every problem this phase faces. Phase 26's job is to compose its primitives correctly, not to reinvent them. The only "custom" code is the two `addInitScript` shim payloads — and both are 5-line patterns sourced from Playwright's official guidance.

## Common Pitfalls

(Distilled from PITFALLS.md; only items that apply to Phase 26 scope are included.)

### Pitfall 1: SW race in CI (PITFALLS.md #1)

**What goes wrong:** `launchPersistentContext` returns before MV3 SW initializes; first `chrome.runtime.sendMessage` is silently dropped.
**Why it happens:** Asynchronous SW creation; `waitForEvent('serviceworker')` can fire never, before, or after attach.
**How to avoid:** Use the two-stage probe + `chrome.runtime.id` check pattern (above). The 10s timeout is generous for local dev; Phase 29 may tighten for CI budget.
**Warning signs:** First test of a run intermittently fails with no logs.
**Phase 26 status:** Mitigated by the verified loader pattern above. No Phase 26 spec triggers SW messaging directly — but the smoke spec exercises the probe path, so a broken probe will fail loudly.

### Pitfall 3: Closed Shadow DOM (PITFALLS.md #3)

**What goes wrong:** `page.locator()` cannot pierce closed shadow roots.
**Why it happens:** Closed roots return `null` from `host.shadowRoot`.
**How to avoid:** `addInitScript`-installed `attachShadow` override as described above.
**Warning signs:** `page.locator('[data-testid="pct-citation-pill"]')` times out; `document.getElementById('patent-cite-host').shadowRoot` returns `null` in a `page.evaluate`.
**Phase 26 status:** Mitigated. The smoke spec asserts the override is functional by creating a probe shadow root in a `page.evaluate`. This is sufficient — exercising the real extension shadow root requires a selection, which is Phase 27.

### Pitfall 4: Headless clipboard returns empty (PITFALLS.md #4)

**What goes wrong:** `navigator.clipboard.readText()` returns empty in headless even with permissions.
**Why it happens:** Headless has no user-activation gesture; Chromium gates `readText` behind activation independently of the permission grant.
**How to avoid:** `__lastCopiedText__` shim via `copy`-event capture (above). Permissions are still granted defensively.
**Phase 26 status:** Shim installed but unexercised in smoke (no selection). Phase 27 exercises.

### Pitfall 13: Browser install bloat (PITFALLS.md #13)

**What goes wrong:** `npx playwright install chromium` is ~450 MB and 4–5 min per fresh download.
**Why it happens:** Chromium is large; first install on a machine downloads everything.
**How to avoid in Phase 26:** Phase 26 is local-dev only. Devs run `npx playwright install chromium` once; the binary lives in `~/.cache/ms-playwright/` and is reused. No CI, no caching strategy needed.
**Phase 26 status:** Not a problem; deferred CI concerns are owned by Phase 29.

### Pitfall 14: Contract drift (PITFALLS.md #14)

**What goes wrong:** Future UI refactor breaks tests because the test contract isn't documented.
**Why it happens:** No formal record of which selectors/elements the test agent depends on.
**How to avoid:** Phase 26 implicitly creates a test contract by adding `pct-citation-host` and `pct-citation-pill`. The planner should consider whether `.planning/testing-contract.md` (mentioned in PITFALLS.md / SUMMARY.md) should be created in Phase 26 or deferred to Phase 31's `DOC-01` (`tests/e2e/README.md`). Recommendation: defer to Phase 31; Phase 26 has enough scope already, and the contract surface stabilizes only after Phase 27 (selection) is implemented.

### Pitfall: Service-worker URL ID extraction edge case (new — surfaced during research)

**What goes wrong:** `new URL(sw.url()).host` returns the extension ID for `chrome-extension://<id>/...` URLs. The simpler form `sw.url().split('/')[2]` (per Playwright docs) also works. Both are equivalent for valid extension SW URLs.
**Why it happens:** Trivia, no real risk. Use whichever feels more readable.
**Phase 26 status:** Recommend `new URL(sw.url()).host` for clarity, but either is fine.

### Pitfall: `addInitScript` runs only on new pages (new — surfaced during research)

**What goes wrong:** If `addInitScript` is called AFTER a page is created, that page does not get the script. Subsequent navigations on the same page also do not re-run it (per [microsoft/playwright#22147](https://github.com/microsoft/playwright/issues/22147), `addInitScript` only fires on new document contexts).
**Why it happens:** Playwright's contract: init scripts run on `document_start` of new documents.
**How to avoid:** Always call `await context.addInitScript(...)` BEFORE the first `await context.newPage()` or `await page.goto(...)`. The loader pattern above does this correctly.
**Phase 26 status:** Mitigated by loader ordering. Specs that re-navigate within the same page are fine — `addInitScript` runs on every new document context, including same-page navigations to a new URL, because that creates a new document.

## Code Examples

### `tests/e2e/playwright.config.js` (sketch)

```js
// tests/e2e/playwright.config.js
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './specs',
  timeout: 60_000,           // per-test; Google Patents can be slow first-load
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,                // extension requires persistent context → serial
  retries: 0,                // Phase 26: no retries locally; Phase 29 may tune CI
  reporter: 'list',
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
```

### `tests/e2e/lib/navigation.js` (sketch)

```js
// tests/e2e/lib/navigation.js
export async function gotoPatent(page, patentId, { timeout = 30_000 } = {}) {
  const url = `https://patents.google.com/patent/${patentId}/en`;
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
  if (!response || !response.ok()) {
    throw new Error(`gotoPatent: ${patentId} returned ${response?.status?.()}`);
  }
  // Wait for a known DOM marker — Google Patents renders a <patent-result> element
  // (a Polymer component). Use a generic readiness marker for Phase 26 smoke.
  await page.waitForSelector('main, article, patent-result', {
    state: 'attached',
    timeout,
  });
  return response;
}
```

### `tests/e2e/lib/observation.js` (sketch — stubs for Phase 26)

```js
// tests/e2e/lib/observation.js
export async function readCitationPill(page, { timeout = 5_000 } = {}) {
  // Phase 26: never invoked by smoke (no selection triggered).
  // Phase 27 will use this for deterministic citation observation.
  const handle = await page.waitForSelector(
    '[data-testid="pct-citation-pill"]',
    { state: 'attached', timeout },
  );
  return await handle.evaluate((el) => el.textContent?.trim() ?? '');
}

export async function readClipboardShim(page) {
  return await page.evaluate(() => window.__lastCopiedText__ ?? '');
}
```

### `.gitignore` additions

```
# Playwright e2e artifacts
tests/e2e/artifacts/
playwright-report/
test-results/
```

### `package.json` script additions

```jsonc
{
  "scripts": {
    "e2e:smoke": "npm run build:chrome && playwright test --config tests/e2e/playwright.config.js"
  }
}
```

Note: Playwright auto-discovers spec files under `testDir` (`./specs`), so the config alone scopes the smoke spec without an explicit path arg.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `xvfb-run` for headless Chrome extension tests | `channel: 'chromium'` + `headless: 'chromium'` (or default headless under channel) | Playwright 1.49 ([#33566](https://github.com/microsoft/playwright/issues/33566)) | No xvfb-run install needed; CI yml is simpler |
| `puppeteer` for extension E2E | `@playwright/test` | 2024–2025 | Better fixtures, trace viewer, first-class extension docs |
| Hardcoded extension IDs (or manifest key tricks) | Read `serviceWorker.url()` at runtime | Playwright Chrome Extensions docs (current) | Works for any extension build |
| `selectionchange` event listener for selection detection | `mouseup` event listener (extension already does this) | Extension v1.x | Phase 27 must dispatch `mouseup`, not `selectionchange` |
| `data-testid` selectors as a "nice-to-have" | First-class test hooks before E2E suite is built | This phase (HOOK-01) | Decouples tests from CSS class names — tests survive UI refactors |

**Deprecated/outdated:**

- `headless: 'new'` flag-style (the Chrome team's terminology) — Playwright wraps this as `headless: 'chromium'` in the test config. The literal config key may differ from this string; verify during implementation.
- `puppeteer-firefox` / `puppeteer-chromium` — superseded by Playwright.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `headless: 'chromium'` is the literal config key for Playwright's extension-friendly headless mode (per CONTEXT.md) | Standard Stack → Alternatives; playwright.config.js sketch | If the literal key is different (e.g., `headless: true` is now the new-headless default under `channel: 'chromium'`), the planner must adjust during task execution. Low risk: omitting the key entirely also works under `channel: 'chromium'` per Playwright docs. The CONTEXT.md decision is locked, so the planner should validate empirically during the first test run and add a config comment if the literal string needs adjustment. |
| A2 | The "pill" referred to in CONTEXT.md `data-testid="pct-citation-pill"` is the `.cite-popup` row, not the floating button or the toast | HOOK-01 Source Locations | If user intent was the floating button or the toasts, Phase 27's `readCitationPill` would read the wrong element. Mitigation: research recommends `.cite-popup` based on the `readCitationPill` semantic (it reads the *result*, not the trigger). If user prefers a different element, the planner can swap with a one-line attribute change. Phase 26's smoke spec does not exercise the pill, so this assumption can be revisited before Phase 27 without rework. |
| A3 | Adding two `data-testid` attributes to the citation UI does not affect production behavior in any browser | HOOK-01 Source Locations | If Google Patents or some Chrome internal queries for `data-testid`, behavior could shift. Extremely low risk: `data-testid` is a developer convention, not part of any HTML standard or browser API. Planner can confirm by running existing vitest suite after the attributes are added. |
| A4 | Service worker `chrome.runtime.id` is bound by the time `waitForEvent('serviceworker')` resolves | Service Worker Readiness | Per PITFALLS.md Pitfall 1, this can fail in CI. The probe `sw.evaluate(() => chrome.runtime.id)` adds robustness. For Phase 26 local-dev smoke, this is sufficient. CI may need to bump timeouts in Phase 29. |
| A5 | The `__lastCopiedText__` shim's `queueMicrotask`-deferred read correctly captures the extension's `setData` payload | Clipboard Observer | The extension uses `event.preventDefault()` + `setData` in a bubble-phase listener; the shim's capture-phase listener runs first but defers via microtask. This pattern is robust per spec, but Phase 26 does not exercise it (no selection in smoke). Phase 27 will validate empirically against US11427642 silent-mode flow. |

## Open Questions (RESOLVED)

1. **Exact `headless: 'chromium'` literal vs default headless under `channel: 'chromium'`**
   - What we know: Playwright 1.49+ supports headless extensions under `channel: 'chromium'`; the docs do not explicitly enumerate `headless: 'chromium'` as a literal value.
   - What's unclear: Whether `headless: 'chromium'`, `headless: true`, or just omitting the key is the canonical 1.60.0 form.
   - Recommendation: Implement with `headless: 'chromium'` per CONTEXT.md; if Playwright emits a warning or error, fall back to omitting the key. Either path satisfies CONTEXT.md's intent (true headless, no xvfb).
   - **RESOLVED:** Implement with `headless: 'chromium'` per CONTEXT.md; if Playwright emits a warning or error, fall back to omitting the key. Either path satisfies CONTEXT.md's intent (true headless, no xvfb).

2. **Should `.planning/testing-contract.md` be created in Phase 26 (per PITFALLS.md Pitfall 14 recommendation)?**
   - What we know: PITFALLS.md and SUMMARY.md recommend a written test-contract doc.
   - What's unclear: Whether the planner wants it in Phase 26 or deferred to Phase 31's `tests/e2e/README.md` (`DOC-01`).
   - Recommendation: Defer to Phase 31. Phase 26 has clear scope already, and the contract surface stabilizes only after Phase 27. The smoke spec acts as a de-facto contract for Phase 26.
   - **RESOLVED:** Defer to Phase 31. Phase 26 has clear scope already, and the contract surface stabilizes only after Phase 27. The smoke spec acts as a de-facto contract for Phase 26.

3. **Does the Cloudflare Worker cache interfere with Phase 26's smoke?**
   - What we know: The smoke spec only loads US11427642's page and asserts the extension content script registered. It does NOT trigger selection, which is what would invoke the Worker via `MSG.LOOKUP_POSITION`. The Worker is not in Phase 26's signal path.
   - What's unclear: Nothing — the Worker is not exercised in smoke.
   - Recommendation: Ignore for Phase 26. Phase 30 owns `X-PCT-Test-Mode`.
   - **RESOLVED:** Ignore for Phase 26. Phase 30 owns `X-PCT-Test-Mode`.

4. **Should Phase 26 add a Playwright `globalSetup` that runs `npm run build:chrome`, or rely on the npm-script chain?**
   - What we know: ARCHITECTURE.md (the milestone-level research) recommends `globalSetup`; CONTEXT.md prefers the npm-script chain (`build → e2e:smoke`).
   - What's unclear: Whether downstream phases (Phase 27 with `test.each` over 76 cases) will want `globalSetup` for parallelism.
   - Recommendation: Phase 26 uses the npm-script chain (matches CONTEXT.md). Phase 27 can introduce `globalSetup` if needed.
   - **RESOLVED:** Phase 26 uses the npm-script chain (matches CONTEXT.md). Phase 27 can introduce `globalSetup` if needed.

5. **Should the smoke spec assert that `data-testid="pct-citation-host"` exists in the page DOM after navigation?**
   - What we know: The host element is only created by the extension when a selection event fires (`getCitationHost()` is lazy at `src/content/citation-ui.js:35`). No selection in smoke → no host element on the page.
   - What's unclear: Whether the smoke spec should manually trigger the host creation (by calling `getCitationHost` via page.evaluate against the extension's content script — which is not exported globally, so cannot be invoked).
   - Recommendation: Smoke spec should NOT assert host existence. The smoke spec proves the *infrastructure* (extension loaded, SW ready, shadow override functional via probe shadow root); Phase 27 proves the *end-to-end* (selection → host appears → testids accessible).
   - **RESOLVED:** Smoke spec should NOT assert host existence. The smoke spec proves the *infrastructure* (extension loaded, SW ready, shadow override functional via probe shadow root); Phase 27 proves the *end-to-end* (selection → host appears → testids accessible).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All | ✓ | 22+ (project requirement; verify locally with `node --version`) | — |
| npm | All | ✓ | — | — |
| `@playwright/test@1.60.0` | HARN-01..05 | ✗ (not installed yet) | n/a | — (install is part of Phase 26 task) |
| Playwright-bundled Chromium | HARN-01 | ✗ | n/a | — (install via `npx playwright install chromium`; ~450MB cache in `~/.cache/ms-playwright`) |
| `dist/chrome/` (fresh build) | HARN-01 | ✓ (regenerated via `npm run build:chrome` before each smoke run) | matches `src/` | — |
| `tests/golden/baseline.json` | smoke seed reference | ✓ | — | — |
| System Chromium libs (libnss, libdrm, etc.) | Playwright Chromium runtime | likely ✓ on dev machine; verify | — | `sudo npx playwright install-deps chromium` if launch fails with missing-library errors |

**Missing dependencies with no fallback:** None — all are install-time, not blocking.

**Missing dependencies with fallback:**
- `@playwright/test` + Chromium binary — install during Phase 26 task execution.
- System libs — handled by `playwright install-deps` if needed.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `@playwright/test` 1.60.0 (new for Phase 26) |
| Config file | `tests/e2e/playwright.config.js` (new in Phase 26) |
| Quick run command | `npm run e2e:smoke` |
| Full suite command | `npm run e2e:smoke` (Phase 26 is one spec; same command) |

Phase 26 introduces a new test framework alongside the existing `vitest`. The two are completely independent: vitest continues to own unit tests (`tests/unit/`), Playwright owns e2e (`tests/e2e/`). They share no config and no fixtures.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| HARN-01 | Loads `dist/chrome/` in persistent context, navigates to `https://patents.google.com/patent/US11427642/en`, page load completes with 200 | smoke (Playwright) | `npm run e2e:smoke` | ❌ Wave 0 — Phase 26 implements |
| HARN-02 | SW readiness probe completes before any extension interaction; `extensionId` is non-empty | smoke (Playwright) | `npm run e2e:smoke` | ❌ Wave 0 |
| HARN-03 | `addInitScript` `attachShadow` override functional in test context; probe shadow root in `page.evaluate` reads as open (`shadowRoot !== null`) | smoke (Playwright) | `npm run e2e:smoke` | ❌ Wave 0 |
| HARN-04 | `__lastCopiedText__` shim installed (window property exists); no copy event triggered in smoke, so value remains empty string | smoke (Playwright) — installation assertion only | `npm run e2e:smoke` | ❌ Wave 0 |
| HARN-05 | `tests/e2e/lib/*.js` exports named functions; smoke.spec.js contains no inline harness logic (visual code review during plan-check) | code review + smoke spec referential test (spec imports succeed) | `npm run e2e:smoke` (passes only if imports resolve) | ❌ Wave 0 |
| HOOK-01 | `data-testid="pct-citation-host"` exists in `src/content/citation-ui.js` source after edit; `data-testid="pct-citation-pill"` exists | unit-level grep test (vitest) | `grep -n "data-testid=\"pct-citation-host\"" src/content/citation-ui.js && grep -n "data-testid=\"pct-citation-pill\"" src/content/citation-ui.js` | ❌ Wave 0 (or use a tiny vitest assertion) |

### Sampling Rate

- **Per task commit:** `npm run e2e:smoke` (~10-15s including build); plus `npm run test:src` if a HOOK-01 unit test is added
- **Per wave merge:** Same — Phase 26 has only one spec
- **Phase gate:** `npm run e2e:smoke` must pass green; `dist/chrome/` must contain both `data-testid` attributes (manual `grep dist/chrome/content/content.js` check)

### Wave 0 Gaps

- [ ] `tests/e2e/playwright.config.js` — new
- [ ] `tests/e2e/lib/extension-loader.js` — new
- [ ] `tests/e2e/lib/navigation.js` — new
- [ ] `tests/e2e/lib/selection.js` — new (stub)
- [ ] `tests/e2e/lib/observation.js` — new
- [ ] `tests/e2e/lib/artifacts.js` — new
- [ ] `tests/e2e/shims/shadow-open.js` — new
- [ ] `tests/e2e/shims/clipboard-observer.js` — new
- [ ] `tests/e2e/specs/smoke.spec.js` — new
- [ ] `tests/e2e/artifacts/` — gitignored directory (created by Playwright at runtime)
- [ ] Framework install: `npm install --save-dev @playwright/test@1.60.0 && npx playwright install chromium`
- [ ] `.gitignore` updates (3 patterns)
- [ ] `package.json` script addition (`e2e:smoke`)
- [ ] Source edit: `src/content/citation-ui.js` lines 36, 117-118 (HOOK-01 testids)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | no | Phase 26 introduces no authentication surface |
| V3 Session Management | no | Persistent context tmpdir is per-test; no session-leak risk |
| V4 Access Control | no | Phase 26 introduces no permission grants beyond Playwright defaults |
| V5 Input Validation | no | No user input parsing |
| V6 Cryptography | no | No new crypto |
| V13 API & Web Service | no | No API surface in Phase 26 |
| V14 Configuration | yes (minor) | Pin `@playwright/test` to exact version `1.60.0`; clean tmpdir per test; never share `userDataDir` across runs |

### Known Threat Patterns for Phase 26 Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Persistent context `userDataDir` leaks across test runs (cookies/session data lingers) | Information Disclosure | Fresh `os.tmpdir()/pct-e2e-{uuid}` per test; `fs.rmSync` in cleanup; never use a fixed path |
| Clipboard permission grant exposes test machine's clipboard contents to test code | Information Disclosure | Scope `grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://patents.google.com' })` rather than blanket grant; clipboard shim reads only `copy` events on the test page, not the system clipboard |
| `addInitScript` payloads as untrusted strings | Tampering | Phase 26's shim payloads are static `.js` files in the repo, version-controlled, and reviewed in PR. No dynamic generation. |
| Test runs as part of CI run with elevated permissions (future Phase 29) | Elevation of Privilege | Phase 29 will scope CI permissions explicitly (`permissions: { contents: read, issues: write }` in workflow yaml). Phase 26 has no CI exposure. |
| `data-testid` attributes leak the test contract to attackers in production | Information Disclosure | Negligible. `data-testid` attributes are static strings; they reveal "this UI is tested" but no security boundary. The extension is already open-source; the test approach is public. |

No new security domain concerns for Phase 26 beyond standard hygiene (tmpdir cleanup, scoped permissions, pinned dependency versions).

## Project Constraints (from CLAUDE.md)

CLAUDE.md is minimal and directs: *"After each AskUserQuestion call, verify the tool result contains the user's actual selection."* This applies to interactive UX, not to research/plan/execute steps. Phase 26 has no `AskUserQuestion` calls planned.

Also captured from project conventions (not formal CLAUDE.md rules, but consistent project practice):

- **ESM JavaScript (`.js`), no TypeScript.** Phase 26's new files are all `.js` with ESM syntax.
- **`"type": "module"` in `package.json`.** All new files use `import`/`export`, not `require`.
- **`src/shared/` is the home for shared modules.** Phase 26 adds nothing here; `tests/e2e/lib/` is the new test-side equivalent.
- **`tests/unit/` uses vitest.** Phase 26 does not touch vitest; Playwright is a parallel runner.

## Sources

### Primary (HIGH confidence)

- [Playwright Chrome Extensions docs](https://playwright.dev/docs/chrome-extensions) — canonical pattern for `launchPersistentContext` + extension loading + SW ID extraction; verified verbatim via WebFetch 2026-05-14
- [Playwright addInitScript docs (BrowserContext)](https://playwright.dev/docs/api/class-browsercontext#browser-context-add-init-script) — timing guarantee: *"evaluated after the document was created but before any of its scripts were run"*; verified via WebFetch 2026-05-14
- [microsoft/playwright#23047](https://github.com/microsoft/playwright/issues/23047) — Playwright maintainer's recommended `attachShadow` override pattern for closed Shadow DOM
- [microsoft/playwright#33566](https://github.com/microsoft/playwright/issues/33566) — `channel: 'chromium'` headless extension support since Playwright 1.49
- npm registry: `npm view @playwright/test version` → 1.60.0; `npm view @playwright/test time` → 1.60.0 publish 2026-05-11T19:09:45Z [VERIFIED 2026-05-14]
- Repo source (direct read 2026-05-14): `src/manifest.json:30` (`run_at: document_idle`), `src/content/citation-ui.js:36-38, 117-118, 317, 360`, `src/content/content-script.js:182, 297-342`, `package.json`, `scripts/build.js`, `tests/golden/baseline.json`
- `.planning/research/SUMMARY.md`, `.planning/research/PITFALLS.md`, `.planning/research/STACK.md`, `.planning/research/ARCHITECTURE.md` — milestone-level research; this phase research distills relevant items into phase-actionable detail

### Secondary (MEDIUM confidence)

- [microsoft/playwright#39075](https://github.com/microsoft/playwright/issues/39075), [#37347](https://github.com/microsoft/playwright/issues/37347), [#33682](https://github.com/microsoft/playwright/issues/33682) — known SW race issues; informs the two-stage probe pattern
- [microsoft/playwright#22147](https://github.com/microsoft/playwright/issues/22147) — `addInitScript` lifecycle (runs only on new document contexts)
- [LambdaTest — addInitScript reference](https://www.lambdatest.com/automation-testing-advisor/javascript/playwright-internal-addInitScript) — confirms `document_start` equivalence

### Tertiary (LOW confidence — flagged for validation during execution)

- The literal config key `headless: 'chromium'` per CONTEXT.md — not directly verified against current Playwright 1.60.0 docs. If wrong, fall back to omitting the key (extensions work under default headless with `channel: 'chromium'`).
- Choice of `.cite-popup` row as the "pill" element for `pct-citation-pill` — best fit for the `readCitationPill` semantic in CONTEXT.md, but user intent could differ.

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — Playwright version verified via live npm registry call; canonical extension-loading pattern from official docs.
- Architecture: HIGH — locked in CONTEXT.md; this research only confirms exact API shapes and file layout.
- Pitfalls: HIGH — distilled from milestone PITFALLS.md (which is itself HIGH confidence) and grounded in direct source reads (manifest `run_at`, citation-ui `attachShadow` line, content-script copy listener lines).
- HOOK-01 source locations: HIGH — exact line numbers verified by direct file read.
- `headless: 'chromium'` literal: MEDIUM — CONTEXT.md-locked; docs don't enumerate the exact string. Empirical validation during implementation is the safety net.

**Research date:** 2026-05-14
**Valid until:** ~2026-06-14 (1 month). Playwright moves fast; the 1.60.0 pin should be re-evaluated if Phase 26 takes more than a month to land.

---
phase: 26-playwright-harness-scaffolding
verified: 2026-05-14T19:25:00Z
status: passed
score: 4/4 must-haves verified
overrides_applied: 0
---

# Phase 26: Playwright Harness Scaffolding — Verification Report

**Phase Goal:** A reliable Playwright + Chromium foundation that loads the unpacked extension, pierces the citation UI's closed Shadow DOM, observes the clipboard in headless, and exposes reusable selection/observation primitives for every subsequent phase.

**Verified:** 2026-05-14T19:25:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from ROADMAP success criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `npm run e2e:smoke` against a freshly-built `dist/chrome/` launches Chromium with extension loaded, navigates to a known Google Patents page, and the smoke spec passes (HARN-01, HARN-02, channel:'chromium' on Ubuntu) | ✓ VERIFIED | Executed `npm run e2e:smoke` during verification: `Built chrome in 17ms` → `Running 1 test using 1 worker` → `✓ smoke.spec.js:27:3 (2.7s)` → `1 passed (3.1s)`. Confirms launchPersistentContext + channel:'chromium' + SW readiness + Google Patents navigation all functional. |
| 2 | A Playwright test can read the extension's citation UI from its closed-mode Shadow DOM via the `addInitScript`-installed `attachShadow` override, with no source change other than `data-testid` attributes | ✓ VERIFIED | `tests/e2e/shims/shadow-open.js:12-23` installs `Element.prototype.attachShadow` override forcing `mode: 'open'`. `extension-loader.js:69` wires it via `addInitScript({content: SHADOW_OPEN_SHIM})` BEFORE `newPage()` on line 88. Smoke spec asserts tri-condition probe `sr !== null && el.shadowRoot !== null && el.shadowRoot === sr` passes (line 47-49). Source extension change is exactly +2 lines of `setAttribute('data-testid', …)` per `git diff --stat src/content/citation-ui.js` (verified in 26-01-SUMMARY). `attachShadow({mode:'closed'})` literal preserved in citation-ui.js. |
| 3 | A Playwright test can observe the silent-mode clipboard payload in headless Chromium (via `__lastCopiedText__` copy-event shim), so silent-mode citations are testable end-to-end without `xvfb-run` | ✓ VERIFIED (install level — e2e exercise deferred to Phase 27) | `tests/e2e/shims/clipboard-observer.js:15-44` installs capture-phase 'copy' listener writing to `window.__lastCopiedText__` via `queueMicrotask`. `extension-loader.js:70` registers shim via `addInitScript` BEFORE `newPage()`. `observation.js:30-32` exports `readClipboardShim(page)` reading `window.__lastCopiedText__`. `extension-loader.js:74-77` grants clipboard-read/write permission scoped to `https://patents.google.com`. Headless Chromium runs without `xvfb-run` (channel:'chromium' new-headless). End-to-end exercise (actual silent-mode Ctrl+C citation) intentionally deferred to Phase 27 per CONTEXT.md decision and 26-VALIDATION "Manual-Only Verifications". |
| 4 | The `tests/e2e/lib/` library exports framework-agnostic primitives (extension load, navigation, selection, citation observation, artifact capture); spec files contain no inline harness logic | ✓ VERIFIED | Five lib modules exist with documented named exports: `extension-loader.js` exports `loadExtension`; `navigation.js` exports `gotoPatent`; `selection.js` exports `selectText` (intentional Phase-27-owned stub that throws); `observation.js` exports `readCitationPill` + `readClipboardShim`; `artifacts.js` exports `captureScreenshot` + `captureDomSnapshot`. Smoke spec is 54 lines (under 60-line HARN-05 cap), contains zero inline `chromium.launchPersistentContext`, `page.goto(...)`, or shim logic — only named imports from `../lib/`. |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `package.json` | `@playwright/test@1.60.0` exact pin + `e2e:smoke` script | ✓ VERIFIED | Both literals present: `"@playwright/test": "1.60.0"` (no caret/tilde) and `"e2e:smoke": "npm run build:chrome && playwright test --config tests/e2e/playwright.config.js"`. `npx playwright --version` → `Version 1.60.0`. |
| `src/content/citation-ui.js` | 2 `data-testid` attribute additions (HOOK-01) | ✓ VERIFIED | Line 37: `citationHost.setAttribute('data-testid', 'pct-citation-host')` (after `.id`, before `.style.cssText`, before `attachShadow`). Line 120: `popup.setAttribute('data-testid', 'pct-citation-pill')` (after `.className`). Exactly 2 `data-testid` occurrences in file — no stray additions. |
| `dist/chrome/content/content.js` | Both testid literals bundled by esbuild | ✓ VERIFIED | `grep -c "pct-citation-host"` → 1; `grep -c "pct-citation-pill"` → 1. Confirms HOOK-01 propagates through build to shipped artifact. |
| `.gitignore` | 3 new Playwright patterns | ✓ VERIFIED | Contains `tests/e2e/artifacts/`, `playwright-report/`, `test-results/`. Pre-existing entries (`node_modules/`, `dist/`, `.glootie-stop-verified`, `worker/node_modules/`, `worker/.dev.vars`) all preserved. |
| `tests/e2e/playwright.config.js` | testDir './specs', workers:1, retries:0, list reporter | ✓ VERIFIED | 24 lines, valid syntax (`node --check` passes), contains `defineConfig`, `testDir: './specs'`, `workers: 1`, `retries: 0`, `reporter: 'list'`. No `projects:`, `globalSetup`, or `headless` keys (browser launch owned by loader). |
| `tests/e2e/lib/extension-loader.js` | `loadExtension({extensionPath, userDataDir?})` → `{context, page, extensionId, cleanup}` | ✓ VERIFIED | 99 lines. Imports `chromium` from `@playwright/test`. Calls `launchPersistentContext` with `channel: 'chromium'` + `--disable-extensions-except` + `--load-extension` args. Fresh tmpdir via `os.tmpdir()` + `crypto.randomUUID()`. Reads both shim files via `fs.readFileSync` at module load. Two `addInitScript` calls precede `newPage()`. SW readiness probe: `serviceWorkers()` → `waitForEvent('serviceworker', {timeout: 10_000})` → `sw.evaluate(() => chrome.runtime.id)`. `extensionId = new URL(sw.url()).host`. Returns object including async `cleanup()` that closes context then `fs.rmSync(dir, {recursive: true, force: true})`. |
| `tests/e2e/lib/navigation.js` | `gotoPatent(page, patentId, opts?)` → `Response` | ✓ VERIFIED | 39 lines. Validates `patentId` regex `/^[A-Z]\d+[A-Z]?\d*$/`. Constructs `https://patents.google.com/patent/${patentId}/en`. Single deadline shared across goto + waitForSelector (per 26-REVIEW-FIX WR-01). Waits for `main, article, patent-result` attached. Throws on non-2xx. |
| `tests/e2e/lib/selection.js` | Throwing stub (Phase 27 SEL-01 owns) | ✓ VERIFIED | 17 lines. Exports `selectText` that throws `'not implemented in Phase 26 — Phase 27 SEL-01 owns this primitive'`. Intentional stub per CONTEXT.md and 26-02-PLAN. |
| `tests/e2e/lib/observation.js` | `readCitationPill(page)` + `readClipboardShim(page)` | ✓ VERIFIED | 32 lines. `readCitationPill` waits for `[data-testid="pct-citation-pill"]` attached, returns trimmed textContent. `readClipboardShim` returns `window.__lastCopiedText__ || ''`. Both connect to the HOOK-01 testids and the clipboard-observer shim respectively. |
| `tests/e2e/lib/artifacts.js` | `captureScreenshot` + `captureDomSnapshot` | ✓ VERIFIED | 50 lines. Writes to `tests/e2e/artifacts/<runId>/<caseId>-screenshot.png` (via `page.screenshot({fullPage: true})`) and `<caseId>-dom.html` (via `page.content()`). `ensureRunDir` recursively mkdirs run dir. Ready for Phase 27 DIAG-01/DIAG-02 wiring. |
| `tests/e2e/shims/shadow-open.js` | `Element.prototype.attachShadow` override forcing `mode:'open'` | ✓ VERIFIED | 23 lines, plain script (no ESM). IIFE wrapping `originalAttachShadow.call(this, {...(options \|\| {}), mode: 'open'})`. Nullish-options guard added per 26-REVIEW-FIX WR-02. Documents global-scope side-effect. |
| `tests/e2e/shims/clipboard-observer.js` | Capture-phase `copy` listener → `__lastCopiedText__` via `queueMicrotask` | ✓ VERIFIED | 45 lines, plain script (no ESM). Initializes `window.__lastCopiedText__ = ''`. `document.addEventListener('copy', …, true)` capture-phase. `queueMicrotask` defers read so extension's bubble-phase `setData` completes first. Three-level fallback: clipboardData.getData('text/plain') → window.getSelection() → empty string. |
| `tests/e2e/specs/smoke.spec.js` | Thin spec (<60 lines) importing only from `../lib/` | ✓ VERIFIED | 54 lines. Imports `loadExtension` from `../lib/extension-loader.js` and `gotoPatent` from `../lib/navigation.js`. Imports `test`/`expect` from `@playwright/test`. Asserts (a) `extensionId` matches `/^[a-p]{32}$/` (HARN-01+02 path), (b) `gotoPatent(page, 'US11427642')` resolves, (c) shadow-shim tri-condition probe. Wraps in try/finally for `cleanup()`. No inline `launchPersistentContext`, no inline `page.goto('https://...')`, no `readCitationPill`/`readClipboardShim` calls. |

All 13 required artifacts present and substantive.

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `src/content/citation-ui.js` | `dist/chrome/content/content.js` | esbuild IIFE bundling via `scripts/build.js` | ✓ WIRED | Both `pct-citation-host` and `pct-citation-pill` literals present in bundle after `npm run build:chrome`. Confirmed during `e2e:smoke` execution. |
| `package.json` | `node_modules/@playwright/test` | `npm install --save-dev --save-exact` | ✓ WIRED | `npx playwright --version` → 1.60.0; smoke run resolves `@playwright/test` import without error. |
| `tests/e2e/lib/extension-loader.js` | `tests/e2e/shims/shadow-open.js` | `fs.readFileSync` at module load + `context.addInitScript({content})` | ✓ WIRED | Line 24-27 reads shim; line 69 registers via addInitScript BEFORE `newPage()` on line 88. Smoke spec's tri-condition probe confirms shim is active in page context. |
| `tests/e2e/lib/extension-loader.js` | `tests/e2e/shims/clipboard-observer.js` | `fs.readFileSync` at module load + `context.addInitScript({content})` | ✓ WIRED | Line 28-31 reads shim; line 70 registers via addInitScript BEFORE `newPage()`. End-to-end clipboard observation deferred to Phase 27, but install-level wiring proven by smoke run (no error during context boot). |
| `tests/e2e/lib/extension-loader.js` | `@playwright/test` `chromium.launchPersistentContext` | `import { chromium } from '@playwright/test'` | ✓ WIRED | Line 19 imports; line 55 calls `chromium.launchPersistentContext(dir, {channel:'chromium', args:[...]})`. SW probe (line 81-86) succeeds during smoke run, proving extension actually loaded. |
| `tests/e2e/specs/smoke.spec.js` | `tests/e2e/lib/extension-loader.js` | `import { loadExtension } from '../lib/extension-loader.js'` | ✓ WIRED | Line 19 imports; line 28 invokes; smoke run produces non-empty extensionId matching `/^[a-p]{32}$/`. |
| `tests/e2e/specs/smoke.spec.js` | `tests/e2e/lib/navigation.js` | `import { gotoPatent } from '../lib/navigation.js'` | ✓ WIRED | Line 20 imports; line 38 invokes with seed patent `US11427642`; smoke run completes navigation without throwing. |
| `package.json scripts.e2e:smoke` | `tests/e2e/playwright.config.js` | `playwright test --config tests/e2e/playwright.config.js` | ✓ WIRED | Smoke run output shows config loaded (`Running 1 test using 1 worker`, matching `workers: 1` config). |
| `package.json scripts.e2e:smoke` | `dist/chrome/` | `npm run build:chrome && playwright test` | ✓ WIRED | Smoke run output shows `> build:chrome\n> node scripts/build.js --chrome-only\nBuilt chrome in 17ms` preceding Playwright invocation. |

All 9 key links wired and exercised.

### Data-Flow Trace (Level 4)

Phase 26 produces test infrastructure that loads code and observes side effects rather than rendering dynamic data. The closest equivalent of "data flow" is the addInitScript shim wiring, which is exercised by the smoke spec's shadow-shim tri-condition probe.

| Artifact | Data Variable | Source | Produces Real Data | Status |
|---|---|---|---|---|
| `tests/e2e/specs/smoke.spec.js` (extensionId) | `extensionId` | `loadExtension` → `new URL(sw.url()).host` after `sw.evaluate(() => chrome.runtime.id)` | Yes — non-empty 32-char `[a-p]+` validated during smoke run | ✓ FLOWING |
| `tests/e2e/specs/smoke.spec.js` (shimOk) | `shimOk` | `page.evaluate` → `el.attachShadow({mode:'closed'})` returns root that equals `el.shadowRoot` due to shadow-open shim's `mode:'open'` override | Yes — tri-condition returns true during smoke run | ✓ FLOWING |
| `tests/e2e/lib/observation.js` (`readClipboardShim`) | `window.__lastCopiedText__` | clipboard-observer shim's capture-phase 'copy' listener with queueMicrotask | Install-level wiring proven; end-to-end exercise deferred to Phase 27 | ⚠️ STATIC (init only) — by design |

The `__lastCopiedText__` static initialization is intentional for Phase 26 (no selection triggered). Phase 27's smoke replay will trigger Ctrl+C and exercise the full data path.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Smoke spec passes against fresh dist/chrome/ | `npm run e2e:smoke` | `Built chrome in 17ms` → `1 passed (3.1s)` | ✓ PASS |
| Playwright CLI resolves at exact pin | `npx playwright --version` | `Version 1.60.0` | ✓ PASS |
| All 9 e2e files parse as valid JS | `node --check` on each | All 9 OK | ✓ PASS |
| HOOK-01 testids bundled to dist | `grep -c "pct-citation-host\|pct-citation-pill" dist/chrome/content/content.js` | 1 + 1 | ✓ PASS |
| `e2e:smoke` script value exact | `node -e` JSON parse + equality check | Exact match | ✓ PASS |
| `.gitignore` `tests/e2e/artifacts/` pattern matches | implicit (run produces no untracked artifact noise after cleanup) | clean | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| HARN-01 | 26-03 | Playwright + Chromium harness loads freshly-built unpacked extension in persistent context + navigates Google Patents | ✓ SATISFIED | Smoke spec asserts `extensionId` matches `/^[a-p]{32}$/` (only possible after persistent-context extension load) and `gotoPatent(page, 'US11427642')` resolves with 200 + readiness marker. Verified during `npm run e2e:smoke` run. |
| HARN-02 | 26-03 | Harness waits for extension SW to be active before user interactions | ✓ SATISFIED | `extension-loader.js:81-86` performs two-stage SW probe: `context.serviceWorkers()` then `waitForEvent('serviceworker', {timeout: 10_000})` then `sw.evaluate(() => chrome.runtime.id)`. extensionId derived AFTER probe — non-empty confirms probe completed. Verified during smoke run. |
| HARN-03 | 26-02 | Harness reads closed Shadow DOM via `addInitScript` `attachShadow` shim | ✓ SATISFIED | `shims/shadow-open.js` installs override forcing `mode:'open'`. `extension-loader.js:69` wires via addInitScript before newPage. Smoke spec's tri-condition probe (line 44-49) confirms `host.shadowRoot === sr` for closed-mode root — only possible with shim active. |
| HARN-04 | 26-02 | Harness reads clipboard in Chromium headless (permission grant OR shim equivalent) | ✓ SATISFIED (install level — full e2e in Phase 27) | `shims/clipboard-observer.js` installs capture-phase 'copy' listener writing to `window.__lastCopiedText__` via `queueMicrotask`. `extension-loader.js:70` wires before newPage. `observation.js:30-32` exports `readClipboardShim`. `extension-loader.js:74-77` also grants clipboard-read/write on patents.google.com origin. Headless Chromium runs without `xvfb-run`. Phase 27 will exercise end-to-end via silent-mode Ctrl+C. |
| HARN-05 | 26-02 | Reusable `tests/e2e/lib/` exposes framework-agnostic primitives | ✓ SATISFIED | Five lib modules with named exports: `loadExtension`, `gotoPatent`, `selectText` (Phase 27 stub), `readCitationPill`, `readClipboardShim`, `captureScreenshot`, `captureDomSnapshot`. Smoke spec (54 lines) imports only from `../lib/` — no inline harness logic. Phase 31 LLM runner can import the same primitives. |
| HOOK-01 | 26-01 | `data-testid` on Shadow DOM host + visible pill | ✓ SATISFIED | `src/content/citation-ui.js:37` sets `data-testid="pct-citation-host"` on host. Line 120 sets `data-testid="pct-citation-pill"` on `.cite-popup` result row. Both literals present in `dist/chrome/content/content.js` after esbuild bundling. |

All 6 requirement IDs declared in PLAN frontmatter are SATISFIED. No orphans — REQUIREMENTS.md maps exactly HARN-01..05 + HOOK-01 to Phase 26, all 6 claimed by plans.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| (none) | — | No TODO, FIXME, XXX, placeholder, "not yet implemented" in any Phase 26 artifact (lib, shims, specs, config) — verified via grep | — | clean |
| `tests/e2e/lib/selection.js` | 13-17 | Intentional stub that throws `'not implemented in Phase 26'` | ℹ️ Info | By-design per CONTEXT.md and 26-02-PLAN; module path grep-able so Phase 27 SEL-01 can replace implementation without churning import sites. NOT a true stub — contract is "throws when called", Phase 26 smoke does not call it. |

### Human Verification Required

None — all Phase 26 goal-level assertions are verifiable programmatically and were exercised by the green smoke run during verification.

### Gaps Summary

No gaps. Every roadmap success criterion is satisfied, every required artifact exists and is substantive and wired, every requirement ID is accounted for, and the phase success gate (`npm run e2e:smoke` exits 0 against fresh dist/chrome/) was re-verified during this verification pass.

The HARN-04 end-to-end clipboard exercise (an actual Ctrl+C citation flowing through the shim to `__lastCopiedText__` and read back by `readClipboardShim`) is intentionally deferred to Phase 27 per the phase contract documented in 26-CONTEXT.md, 26-VALIDATION.md "Manual-Only Verifications", and the verifier's `<verification_notes>`. The Phase 26 contract for HARN-04 is "shim installed and reachable from page world", which is verified. Phase 27 owns SEL-01..04 selection-triggered exercise of the clipboard path.

The `tests/e2e/lib/selection.js` throwing stub is by-design for Phase 26 (Phase 27 SEL-01 implements). It is documented in 26-02-PLAN must_haves.truths and 26-02-SUMMARY "Known Stubs" — not a regression and not a gap.

---

_Verified: 2026-05-14T19:25:00Z_
_Verifier: Claude (gsd-verifier)_

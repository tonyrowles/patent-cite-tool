# Phase 26: Playwright Harness Scaffolding - Context

**Gathered:** 2026-05-14
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous)

<domain>
## Phase Boundary

A reliable Playwright + Chromium foundation that loads the unpacked Chrome extension from `dist/chrome/`, pierces the citation UI's closed Shadow DOM via `addInitScript`, observes the silent-mode clipboard payload in headless Chromium, waits for service-worker readiness, and exposes the reusable selection/observation primitives that every subsequent v3.0 phase (27 selection, 28 verifier, 29 cron, 30 fault-injection, 31 LLM) will import.

In scope:
- `tests/e2e/` directory and `playwright.config.js`
- `tests/e2e/lib/` reusable primitives (loader, navigation, selection, clipboard observation, artifact capture stubs)
- One smoke spec exercising the full chain (load → navigate → confirm content script registered) against one known patent
- Non-functional extension change: `data-testid="pct-citation-host"` and `data-testid="pct-citation-pill"` attributes on the citation UI (HOOK-01)
- `npm run e2e:smoke` script
- `.gitignore` entries for `tests/e2e/artifacts/` and Playwright caches
- Playwright + Chromium dev-dependency install

Out of scope (deferred to Phase 27+):
- Programmatic Range-based text selection (`selectText` helper) — Phase 27
- 76-case golden replay — Phase 27
- Independent verifier — Phase 28
- CI nightly cron + auto-issue filing — Phase 29
- Worker `X-PCT-Test-Mode` header — Phase 30
- LLM exploratory mode — Phase 31

</domain>

<decisions>
## Implementation Decisions

### Test Harness Foundation
- **Language: JavaScript ESM (`.js`)** — matches project's `"type": "module"`; zero new build complexity; aligns with existing `tests/unit/*.test.js` convention. Research summary's `.ts` examples were illustrative only.
- **`tests/e2e/lib/` structure: split modules** — separate files per distinct primitive (HARN-05 wording): `extension-loader.js`, `navigation.js`, `selection.js` (Phase 27 fills it), `observation.js`, `artifacts.js`. Specs import named functions; zero inline harness logic.
- **`data-testid` naming: `pct-` prefix, kebab-case** — `data-testid="pct-citation-host"` on the Shadow DOM host element, `data-testid="pct-citation-pill"` on the visible citation pill. Namespaced to avoid any collision with Google Patents' own data-testid attributes.
- **Smoke seed patent: `US11427642`** — first modern patent in `tests/golden/baseline.json`, post-2000, non-OCR. Stable, fast, and predictable. Smoke must not flake on edge cases — edge-case coverage belongs in Phase 27's 76-case replay.

### Playwright Config & Browser Launch
- **Browser channel: `channel: 'chromium'`** — Playwright-bundled Chromium (NOT system Chrome). Required for headless extension support without `xvfb-run` (per research Pitfalls 1, 13).
- **Persistent context: `chromium.launchPersistentContext(userDataDir, {...})`** — required for unpacked extension loading. `userDataDir` is a fresh `os.tmpdir()/pct-e2e-{uuid}` per test, cleaned up in `afterEach`.
- **Args:** `--disable-extensions-except=${absPath}/dist/chrome`, `--load-extension=${absPath}/dist/chrome`, `--enable-features=ServiceWorker`. Headless mode via `headless: 'chromium'` (NOT legacy headless — required for extensions).
- **Service-worker readiness:** Wait for the extension's SW via `context.serviceWorkers()` + `context.waitForEvent('serviceworker')` with 10s timeout. Probe `chrome.runtime.id` from the page to confirm registration before triggering selection (per HARN-02; mitigates research Pitfall 1 SW race).

### Shadow DOM Piercing (HARN-03)
- **Strategy:** `context.addInitScript()` installs a global `Element.prototype.attachShadow` override BEFORE the extension's content script runs. The override forces `mode: 'open'` so test code can read the host's `.shadowRoot`. Production extension is untouched (the shim only runs in the test context).
- **Production side change:** add only `data-testid` attributes (HOOK-01). No mode change to the shipped `attachShadow` call.

### Clipboard Observation (HARN-04)
- **Headless clipboard strategy:** `context.addInitScript()` installs a `copy` event listener that captures the payload into `window.__lastCopiedText__`. The Playwright test reads `window.__lastCopiedText__` after triggering Ctrl+C silent mode. This avoids the unreliable Chromium headless clipboard permission flow entirely (per research Pitfall 4).
- **Permission fallback:** still grant `clipboard-read` + `clipboard-write` via `context.grantPermissions(['clipboard-read', 'clipboard-write'], {origin: 'https://patents.google.com'})` for any test that needs the real clipboard API.

### Reusable Library Surface (HARN-05)
`tests/e2e/lib/` exports framework-agnostic primitives. Phase 26 ships the first cut; later phases extend selection.js (P27), observation.js (P28), and add a worker-mock.js (P30):

| Module | Exports (Phase 26 scope) |
|--------|--------------------------|
| `extension-loader.js` | `loadExtension({extensionPath, userDataDir})` → `{context, page, extensionId, cleanup}` |
| `navigation.js` | `gotoPatent(page, patentId, opts)` — navigates and waits for known DOM markers |
| `selection.js` | (stub — fully implemented in Phase 27) |
| `observation.js` | `readCitationPill(page)` via `data-testid="pct-citation-pill"`; `readClipboardShim(page)` via `window.__lastCopiedText__` |
| `artifacts.js` | `captureScreenshot(page, runId, caseId)`, `captureDomSnapshot(page, runId, caseId)` |

### Directory Layout
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

### npm Scripts
- `npm run e2e:smoke` → `playwright test --config tests/e2e/playwright.config.js specs/smoke.spec.js`
- Reuses existing `npm run build` to ensure `dist/chrome/` is fresh before smoke runs (smoke script chain: `build → e2e:smoke`).

### Dev Dependencies
- `@playwright/test` (pin to a recent stable version, e.g., `^1.49.0`)
- No new prod dependencies. No TypeScript. No `ts-node`. No `vitest` integration (Playwright owns its own runner).

### Claude's Discretion
- Exact pinned Playwright version (choose latest stable at plan time).
- Playwright config defaults (timeout values, reporter selection — likely `list` locally + `json` for CI prep in Phase 29).
- Whether to split `addInitScript` content into discrete `.js` files vs inline string literals (recommend separate files for grep-ability).
- Service-worker readiness probe wording.
- Smoke spec assertion text.
- `package.json` formatting (alphabetize script ordering).

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `tests/golden/baseline.json` — canonical 76-case map of `{caseId → {citation, confidence}}`. Phase 26 smoke imports one entry (`US11427642-spec-short-1`).
- `tests/test-cases.js` — likely already exposes the case list (Phase 27 will heavily depend on this).
- `tests/setup/chrome-stub.js` — Vitest-only; not relevant to Playwright but documents the existing Chrome API patterns.
- `scripts/build.js` — produces `dist/chrome/` from `src/`. Smoke depends on this output existing; npm script chains `build` before `e2e:smoke`.

### Established Patterns
- **ESM everywhere:** `"type": "module"` in `package.json`; all `tests/unit/*.test.js` use ESM `import`. New Playwright code follows the same convention.
- **No TypeScript:** Project is pure JS. Research's `.ts` file names are aspirational; align with project.
- **Vitest is the existing test runner** for unit tests (`vitest run`). Playwright runs in parallel as a separate runner (`@playwright/test`). The two do not share configuration or fixtures.
- **Shadow DOM citation UI** is rendered by `src/content/` (closed mode `attachShadow`). The two HOOK-01 testids will be added to the host element and the visible pill inside the shadow root.

### Integration Points
- **Source changes (HOOK-01 only):** Two `data-testid` attribute additions in `src/content/` citation UI code. No matching/parsing logic touched.
- **Build artifact:** Smoke depends on `dist/chrome/manifest.json` existing. The smoke npm script chains `npm run build` first.
- **CI:** Phase 26 adds NO CI workflow changes. Phase 29 owns the nightly cron workflow. Phase 26 does add `.gitignore` entries.
- **Playwright cache:** No CI in Phase 26 — caching strategy is a Phase 29 concern.

</code_context>

<specifics>
## Specific Ideas

- Use `import { test, expect } from '@playwright/test'` in spec files (Playwright's bundled vitest-like syntax).
- The smoke spec's positive assertions: (a) `extensionId` is non-empty after `loadExtension`, (b) navigating to the seed patent URL resolves to status 200 with a known DOM marker present, (c) `await page.evaluate(() => typeof chrome === 'undefined')` returns true on the patents page (extension content scripts run in isolated worlds — confirming this catches a class of CSP/world misconfigurations), (d) the `attachShadow` shim is functional (creating a test shadow root and reading it succeeds).
- The smoke deliberately does NOT trigger a selection or citation — that's Phase 27. The smoke proves only that the chain loads.
- HOOK-01 attribute placement: the host element gets `data-testid="pct-citation-host"`, the visible pill inside the shadow root gets `data-testid="pct-citation-pill"`. Both attributes are no-ops outside of test contexts.

</specifics>

<deferred>
## Deferred Ideas

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

</deferred>

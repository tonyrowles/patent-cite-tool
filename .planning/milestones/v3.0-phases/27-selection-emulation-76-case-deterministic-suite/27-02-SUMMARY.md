---
phase: 27-selection-emulation-76-case-deterministic-suite
plan: 02
subsystem: e2e-testing
tags: [e2e, settings, chrome-storage-sync, citation-observation, shadow-dom, artifacts]
requirements: [SEL-02, DIAG-01, DIAG-02]
dependency-graph:
  requires:
    - "Phase 26 loadExtension (context.serviceWorkers() probe complete)"
    - "Phase 26 shadow-open shim (open shadowRoot for getCitation)"
    - "Phase 26 clipboard-observer shim (window.__lastCopiedText__ for silent mode)"
    - "src/content/citation-ui.js data-testid='pct-citation-pill' (line 120)"
    - "src/content/content-script.js triggerMode default 'floating-button' (line 147)"
  provides:
    - "setTriggerMode(context, mode) — chrome.storage.sync trigger-mode writer"
    - "getCitation(page, {mode, timeout}) — structured citation observer for SEL-02"
    - "captureScreenshot / captureDomSnapshot — confirmed DIAG-01/DIAG-02 contract"
  affects:
    - "Plan 27-03 regression.spec.js (76-case auto-mode loop) — consumes all three primitives"
    - "Plan 27-04 silent.spec.js (silent-mode coverage) — consumes setTriggerMode + getCitation"
    - "Plan 27-05 artifacts wiring (per-test failure hook) — consumes captureScreenshot/captureDomSnapshot"
tech-stack:
  added: []
  patterns:
    - "ESM named exports; no @playwright/test imports inside lib modules (logic only)"
    - "Service-worker evaluate for extension-context chrome.storage.sync writes"
    - "Mode allowlist set for fast validation + clear error messages"
    - "Polling loop with deadline for silent-mode clipboard observation"
key-files:
  created:
    - tests/e2e/lib/settings.js
  modified:
    - tests/e2e/lib/observation.js
    - tests/e2e/lib/artifacts.js
decisions:
  - "Mode allowlist includes all 4 production trigger modes (auto, floating-button, context-menu, silent), not just the 2 tests use — prevents typos and future-proofs for context-menu coverage"
  - "Default getCitation timeout 8s (RESEARCH Pitfall A) — gives the citation pipeline 8s budget on cold-cache test runs after the 250ms post-mouseup wait"
  - "Silent-mode confidence inferred from .cite-toast-success / .cite-toast-failure presence in shadow root — best-effort; Plan 04 may need to assert citation only if inference proves flaky"
  - "SEL-02 contract uses mode: 'auto'|'silent' per CONTEXT.md (user-locked), NOT REQUIREMENTS.md's 'sync'|'async' wording — intentional rename"
  - "artifacts.js is doc-only — Phase 26 already shipped the correct fullPage:true + page.content() implementation; no functional change needed"
metrics:
  duration: ~6 minutes
  completed: "2026-05-14"
  files-changed: 3
  loc-added: 159
  loc-removed: 5
  tasks: 3
  commits: 3
---

# Phase 27 Plan 02: E2E Selection / Observation / Artifacts Primitives Summary

Shipped three Phase 27 primitives — `setTriggerMode` (new), `getCitation` (new), and a Phase-27-contract JSDoc on `captureScreenshot` / `captureDomSnapshot` (existing) — that Plan 03's 76-case regression spec and Plan 04's silent-mode spec consume directly.

## What Shipped

### Task 27-02-01 — `tests/e2e/lib/settings.js` (new)

Signature:

```js
export async function setTriggerMode(context, mode) → Promise<void>
```

- `context`: BrowserContext from `loadExtension`. Validated at runtime (`typeof context.serviceWorkers === 'function'`).
- `mode`: One of `{'auto', 'floating-button', 'context-menu', 'silent'}` (frozen `VALID_MODES` Set). Invalid mode throws a descriptive error listing the allowlist.
- Body: grabs the first service worker via `context.serviceWorkers()[0]`, then `sw.evaluate` wraps the callback form of `chrome.storage.sync.set({triggerMode: m}, callback)` in a Promise so `chrome.runtime.lastError` surfaces as a rejection. This matches the established pattern in `src/options/options.js:45-75`.
- Throws if no SW attached (loadExtension's HARN-02 probe should prevent this; the check is defense-in-depth).
- Per the plan: this corrects CONTEXT.md's two errors (storage area was `'local'` → should be `'sync'`; default mode was `'auto'` → should be `'floating-button'`), per 27-RESEARCH.md "CONTEXT.md Contradictions".

### Task 27-02-02 — `tests/e2e/lib/observation.js` (extended)

Added one new export; retained both Phase 26 primitives unchanged.

```js
export async function getCitation(page, { mode = 'auto', timeout = 8_000 } = {})
  → Promise<{ citation: string, confidence: 'green'|'yellow'|'red', mode: 'auto'|'silent' }>
```

Dispatch by mode:

| `mode`     | Reader              | How it works                                                                                                                                                                                                                                                                |
| ---------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `'auto'`   | `readAutoCitation`  | `page.waitForSelector('[data-testid="pct-citation-pill"]', { state: 'attached', timeout })`, then `page.evaluate` inside the open shadow root: reads `.cite-text` for citation; maps `.cite-confidence` class to color.                                                     |
| `'silent'` | `readSilentCitation` | Polls `window.__lastCopiedText__` (Phase 26 shim) with 100ms steps until `timeout`; parses trailing citation token via `/(\d+:\d+(?:-\d+(?::\d+)?)?|\[\d+\])\s*$/`; infers confidence from `.cite-toast-success` (green) / `.cite-toast-failure` (red) / neither (yellow). |

Confidence color mapping (auto mode), pulled directly from `src/content/citation-ui.js:123-148`:

| Confidence numeric | DOM signal                                | Output     |
| ------------------ | ----------------------------------------- | ---------- |
| ≥ 0.95             | No `.cite-confidence` element appended    | `'green'`  |
| 0.80 ≤ x < 0.95    | `.cite-confidence.cite-conf-medium`        | `'yellow'` |
| < 0.80             | `.cite-confidence.cite-conf-low`           | `'red'`    |
| (rare) `cite-conf-high` class present     | `'green'` (defensive fallthrough)          |            |

Invalid mode throws `getCitation: invalid mode "<x>" — expected 'auto' or 'silent'`.

Phase 26 exports retained:

```js
export async function readCitationPill(page, { timeout = 5_000 } = {}) → Promise<string>
export async function readClipboardShim(page) → Promise<string>
```

These remain available as lower-level primitives Plan 28 may consume.

### Task 27-02-03 — `tests/e2e/lib/artifacts.js` (doc-only)

**No functional change.** Phase 26's implementation already:

- Calls `page.screenshot({ path: outPath, fullPage: true })` → satisfies DIAG-01
- Calls `page.content()` and writes to `<caseId>-dom.html` → satisfies DIAG-02
- Writes under `tests/e2e/artifacts/<runId>/` → matches Phase 27's artifact contract
- Creates the runId directory via `fs.mkdirSync(dir, { recursive: true })` before writing

Updated the top-of-file JSDoc to:

1. Explicitly cite DIAG-01 / DIAG-02 in the per-function descriptions.
2. Document the Phase 27 catch-block contract (Plan 03's regression spec and Plan 04's silent spec call these from `test.afterEach` on failure).
3. Document the runId resolution convention (`process.env.PLAYWRIGHT_RUN_ID || ISO timestamp`).
4. Warn against the `getInnerHTML({includeShadowRoots:true})` anti-pattern (CDP-only API, not a Playwright method — per 27-RESEARCH.md "DOM Snapshot Note"). The Phase 26 shadow-open shim flips closed shadow roots to open, so `page.content()` already serializes them.

Function signatures unchanged:

```js
export async function captureScreenshot(page, runId, caseId) → Promise<string>  // returns absolute path
export async function captureDomSnapshot(page, runId, caseId) → Promise<string> // returns absolute path
```

## Verification

- `node --check tests/e2e/lib/settings.js` → OK
- `node --check tests/e2e/lib/observation.js` → OK
- `node --check tests/e2e/lib/artifacts.js` → OK
- All required new exports present (`setTriggerMode`, `getCitation`)
- All Phase 26 exports retained (`readCitationPill`, `readClipboardShim`, `captureScreenshot`, `captureDomSnapshot`)
- `npm run test:src` → 216/216 pass in 4.62s (vitest suite green; no regression)
- Zero new npm dependencies (`package.json` + `package-lock.json` unchanged)
- `getInnerHTML` appears ONLY in the "DO NOT call" warning comment — never as an actual API call

## Deviations from Plan

None — plan executed exactly as written. All three tasks completed on the first attempt with the action blocks copied verbatim from the plan's `<action>` sections.

## Semantic Rename Note (REQUIREMENTS.md SEL-02)

REQUIREMENTS.md SEL-02 specifies `mode: 'sync'|'async'`. The shipped contract uses `mode: 'auto'|'silent'`, matching:

1. CONTEXT.md's user-locked trigger-mode names.
2. The production extension's actual trigger-mode literals (`src/content/content-script.js:147` default + switch statement at lines 206-222).
3. The plan's `must_haves.truths` enumeration of `mode: 'auto'` and `mode: 'silent'`.

This is intentional — the spec authors will write `getCitation(page, {mode: 'auto'})`, not `{mode: 'sync'}`. The REQUIREMENTS.md text should be updated in a future plan if precision is needed, but no code consumer is affected.

## Risks Surfaced for Plan 04

**Silent-mode confidence inference is best-effort.** The current implementation infers confidence from in-shadow toast presence:

```js
const success = host.shadowRoot.querySelector('.cite-toast-success');
const failure = host.shadowRoot.querySelector('.cite-toast-failure');
return success ? 'green' : failure ? 'red' : 'yellow';
```

Risk: Toasts auto-dismiss (success after 2s; failure after 4s — `citation-ui.js:341, 384`). If silent-mode test polling latency happens to land in the dismissal window, the inference flips to `'yellow'` (neither toast present). Mitigation options for Plan 04:

1. Capture the citation immediately on the first non-empty `__lastCopiedText__` poll (current behavior — fastest, smallest window).
2. Have Plan 04's spec assert citation **only**, treating confidence as informational (loosens the test contract but matches the silent-mode product semantics — no visible color dot in silent mode anyway).
3. Add a `silentPostCopyDelay` knob if option (1) proves flaky in CI.

Recommend option (2) for the regression assertion and option (1) for the inference path. Document in the silent spec when written.

## Commits

| Task     | Commit    | Subject                                                                          |
| -------- | --------- | -------------------------------------------------------------------------------- |
| 27-02-01 | `de62304` | feat(27-02): add setTriggerMode helper writing to chrome.storage.sync            |
| 27-02-02 | `98d90cf` | feat(27-02): add getCitation observer with mode dispatch + confidence mapping    |
| 27-02-03 | `1de0b6d` | docs(27-02): document Phase 27 failure-hook contract in artifacts.js JSDoc       |

## Self-Check: PASSED

- `tests/e2e/lib/settings.js` exists (FOUND)
- `tests/e2e/lib/observation.js` exists and contains `getCitation` (FOUND)
- `tests/e2e/lib/artifacts.js` exists and references DIAG-01 / DIAG-02 (FOUND)
- Commit `de62304` exists (FOUND)
- Commit `98d90cf` exists (FOUND)
- Commit `1de0b6d` exists (FOUND)
- `npm run test:src` exits 0 with 216/216 passing (CONFIRMED)

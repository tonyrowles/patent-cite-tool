---
phase: 26-playwright-harness-scaffolding
plan: 02
subsystem: e2e-harness
tags: [playwright, e2e, harness, library, shadow-dom, clipboard, scaffolding]
requirements: [HARN-03, HARN-04, HARN-05]
dependency-graph:
  requires:
    - "@playwright/test@1.60.0 (installed by Plan 26-01, parallel wave)"
    - "src/manifest.json run_at: document_idle (verified — guarantees shim install order)"
    - "src/content/content-script.js:297-342 bubble-phase copy listener (verified — shim capture+queueMicrotask is correct ordering)"
  provides:
    - "tests/e2e/lib/extension-loader.js — loadExtension({extensionPath, userDataDir?}) → {context, page, extensionId, cleanup}"
    - "tests/e2e/lib/navigation.js — gotoPatent(page, patentId, opts?)"
    - "tests/e2e/lib/observation.js — readCitationPill(page, opts?), readClipboardShim(page)"
    - "tests/e2e/lib/artifacts.js — captureScreenshot(page, runId, caseId), captureDomSnapshot(page, runId, caseId)"
    - "tests/e2e/lib/selection.js — selectText() stub (throws; Phase 27 SEL-01 owns)"
    - "tests/e2e/shims/shadow-open.js — Element.prototype.attachShadow → mode:'open'"
    - "tests/e2e/shims/clipboard-observer.js — capture-phase copy listener → window.__lastCopiedText__"
    - "tests/e2e/playwright.config.js — testDir './specs', workers:1, retries:0, list reporter"
  affects:
    - "Plan 26-03 smoke spec (imports loadExtension + gotoPatent)"
    - "Phase 27 selection/replay (extends selection.js + observation.js)"
    - "Phase 28 verifier (reuses artifacts.js for DIAG-03)"
    - "Phase 30 fault-injection (reuses extension-loader.js)"
tech-stack:
  added: []  # zero new dependencies — Plan 01 owns @playwright/test install
  patterns:
    - "Library-first / runner-thin (specs import named functions from tests/e2e/lib/, no inline harness logic)"
    - "addInitScript shims as separate .js files (read via fs.readFileSync at module load — grep-able)"
    - "Two-stage service-worker readiness (serviceWorkers() + waitForEvent + chrome.runtime.id probe)"
    - "Fresh tmpdir per loadExtension call (os.tmpdir() + crypto.randomUUID() + cleanup rmSync)"
    - "Capture-phase + queueMicrotask clipboard observer (runs first, reads AFTER extension's bubble-phase setData)"
key-files:
  created:
    - "tests/e2e/playwright.config.js (24 lines)"
    - "tests/e2e/lib/extension-loader.js (99 lines)"
    - "tests/e2e/lib/navigation.js (34 lines)"
    - "tests/e2e/lib/selection.js (17 lines — stub)"
    - "tests/e2e/lib/observation.js (32 lines)"
    - "tests/e2e/lib/artifacts.js (50 lines)"
    - "tests/e2e/shims/shadow-open.js (17 lines)"
    - "tests/e2e/shims/clipboard-observer.js (45 lines)"
  modified: []
decisions:
  - "Omitted both `headless: 'chromium'` and `--enable-features=ServiceWorker` from launchPersistentContext options per CONTEXT.md (post-revision demotion to Claude's Discretion). New-headless is automatic under channel:'chromium' on Playwright 1.49+; the SW flag is redundant under channel:'chromium'."
  - "channel:'chromium' lives in extension-loader.js (not playwright.config.js) because each spec calls chromium.launchPersistentContext directly — Playwright's default browser fixture and use.channel are incompatible with persistent-context extension loading."
  - "Shim files (shadow-open.js, clipboard-observer.js) are plain scripts (no ESM import/export) — they run in the page world via addInitScript, not as Node modules. node --check confirms valid syntax in both."
  - "extension-loader.js reads shim files via fs.readFileSync at module load (synchronous, fail-fast). The content is then passed to context.addInitScript({content}) BEFORE the first context.newPage() call, satisfying microsoft/playwright#22147 (addInitScript only fires on new document contexts)."
  - "Service-worker readiness uses the two-stage probe + chrome.runtime.id check (not custom polling) — eliminates the SW boot race documented in PITFALLS.md Pitfall 1."
  - "Fresh os.tmpdir() + crypto.randomUUID() userDataDir per loadExtension call; cleanup() closes context then fs.rmSync (recursive, force). Mitigates T-26-03 information disclosure."
  - "Clipboard permission grant scoped to origin 'https://patents.google.com' only (not blanket). Mitigates T-26-04."
metrics:
  duration: "3m 27s"
  completed: "2026-05-14T19:05:28Z"
  tasks: 3
  files_created: 8
  files_modified: 0
  commits: 3
---

# Phase 26 Plan 02: Playwright Harness Library + Shims Summary

One-liner: Created the eight-file Playwright harness foundation (lib + shims + config) that Plan 26-03's smoke spec and every downstream v3.0 phase will import — zero inline harness logic, channel:'chromium' + addInitScript shims wired correctly, fresh tmpdir per call.

## What Was Built

Plan 26-02 added the reusable Playwright primitives that satisfy requirements HARN-03 (Shadow DOM piercing), HARN-04 (headless clipboard observation), and HARN-05 (lib structure with split modules). Eight new files; zero production-extension changes; zero modifications to `package.json` (Plan 26-01 owns the `@playwright/test@1.60.0` install).

### Public API (what Plan 03 and downstream phases will import)

```js
// tests/e2e/lib/extension-loader.js
export async function loadExtension({ extensionPath, userDataDir }):
  Promise<{ context, page, extensionId: string, cleanup: () => Promise<void> }>

// tests/e2e/lib/navigation.js
export async function gotoPatent(page, patentId, opts?):
  Promise<Response>  // navigates to https://patents.google.com/patent/{patentId}/en

// tests/e2e/lib/selection.js — STUB (throws)
export async function selectText()  // Phase 27 SEL-01 implements

// tests/e2e/lib/observation.js
export async function readCitationPill(page, opts?): Promise<string>
export async function readClipboardShim(page): Promise<string>

// tests/e2e/lib/artifacts.js
export async function captureScreenshot(page, runId, caseId): Promise<string>
export async function captureDomSnapshot(page, runId, caseId): Promise<string>
```

### Files Created

| File | Lines | Purpose |
|------|-------|---------|
| `tests/e2e/playwright.config.js` | 24 | Test-runner config (testDir, timeouts, single worker, list reporter); launch options live in the loader |
| `tests/e2e/lib/extension-loader.js` | 99 | `loadExtension({extensionPath, userDataDir?})` — persistent context, shim injection, SW readiness probe, fresh tmpdir, cleanup |
| `tests/e2e/lib/navigation.js` | 34 | `gotoPatent(page, patentId, opts?)` — patent-ID validation, navigate, wait for top-level marker |
| `tests/e2e/lib/selection.js` | 17 | Throwing stub — Phase 27 SEL-01 owns the real implementation |
| `tests/e2e/lib/observation.js` | 32 | `readCitationPill` via `[data-testid="pct-citation-pill"]`; `readClipboardShim` via `window.__lastCopiedText__` |
| `tests/e2e/lib/artifacts.js` | 50 | `captureScreenshot` (page.screenshot full-page PNG), `captureDomSnapshot` (page.content HTML) under `tests/e2e/artifacts/<runId>/` |
| `tests/e2e/shims/shadow-open.js` | 17 | Plain-script `Element.prototype.attachShadow` override forcing `mode:'open'` |
| `tests/e2e/shims/clipboard-observer.js` | 45 | Plain-script capture-phase `copy` listener writing into `window.__lastCopiedText__` via `queueMicrotask` |
| **Total** | **318** | |

### Commits

| Commit | Subject |
|--------|---------|
| `f599615` | `feat(26-02): add shadow-open and clipboard-observer addInitScript shims` |
| `16de8cc` | `feat(26-02): add tests/e2e/lib primitive modules (HARN-05)` |
| `e5922ce` | `feat(26-02): add tests/e2e/playwright.config.js` |

## Code-Flow Note for Plan 03

The loader's call ordering is critical and Plan 03 depends on it (per RESEARCH.md):

```
loadExtension(...) :
  1. validate extensionPath + manifest.json exists
  2. create fresh tmpdir (os.tmpdir() + pct-e2e-<uuid>)
  3. chromium.launchPersistentContext(dir, {channel:'chromium', args:[--disable-extensions-except, --load-extension]})
  4. context.addInitScript({content: SHADOW_OPEN_SHIM})          ←─ BEFORE newPage()
  5. context.addInitScript({content: CLIPBOARD_OBSERVER_SHIM})   ←─ BEFORE newPage()
  6. context.grantPermissions(['clipboard-read','clipboard-write'], {origin:'https://patents.google.com'})
  7. SW readiness probe: serviceWorkers() OR waitForEvent('serviceworker', timeout:10s); then sw.evaluate(() => chrome.runtime.id)
  8. extensionId = new URL(sw.url()).host
  9. page = context.newPage()                                    ←─ AFTER both addInitScripts
  10. return {context, page, extensionId, cleanup}
```

This guarantees:

- Both shims are evaluated at `document_start` on the first page (Playwright contract for addInitScript on a new document context). Per `src/manifest.json:30`, the extension's content script runs at `document_idle` — strictly later — so the `attachShadow` override is in place before the extension's `attachShadow({mode:'closed'})` call.
- The clipboard observer's `window.__lastCopiedText__` is initialized before any user gesture.
- The SW probe + `chrome.runtime.id` check completes before the caller can trigger any chrome.runtime interaction (HARN-02).

## Verification

### Per-Task Acceptance Criteria

- Task 1 (shims): all literal checks pass (`attachShadow`, `mode: 'open'`, `__lastCopiedText__`, `queueMicrotask`, `capture`); no ESM `import`/`export` lines; both files pass `node --check`.
- Task 2 (lib): all five files exist; correct named exports (`loadExtension`, `gotoPatent`, `selectText`, `readCitationPill`, `readClipboardShim`, `captureScreenshot`, `captureDomSnapshot`); `extension-loader.js` references both shim file basenames, calls `addInitScript` 4 times (2 shim installs + comment references), contains `launchPersistentContext`, `channel: 'chromium'`, `waitForEvent('serviceworker'`, `chrome.runtime.id`, `os.tmpdir()`, `crypto.randomUUID()`; `selection.js` throws; no `originalAttachShadow` leak in `tests/e2e/lib/`; all five pass `node --check`.
- Task 3 (config): contains `defineConfig`, `testDir: './specs'`, `workers: 1`, `retries: 0`; does NOT contain `projects:`, `globalSetup`, or `headless` as option keys; passes `node --check`.

### Plan-Level Verification (per PLAN <verification> section)

1. All eight files exist — **PASS** (verified `test -f` on each).
2. All eight files pass `node --check` — **PASS** (loop over `tests/e2e/playwright.config.js tests/e2e/lib/*.js tests/e2e/shims/*.js`).
3. Library contracts present — **PASS** (`loadExtension`, `gotoPatent`, `readCitationPill`, `readClipboardShim` all grep-confirmed).
4. Loader wires shims correctly — **PASS** (`shadow-open.js` + `clipboard-observer.js` referenced; `addInitScript` count = 4 ≥ 2).
5. SW probe present — **PASS** (`waitForEvent('serviceworker'` + `chrome.runtime.id`).
6. Vitest unit suite still green — **PASS** (`npm run test:src`: 216 passed, 9 test files, 3.76s).

### Plan Success Criteria (per PLAN <success_criteria>)

- Plan 03 can `import { loadExtension } from '../lib/extension-loader.js'` and `import { gotoPatent } from '../lib/navigation.js'` — **CONFIRMED** (named exports verified by grep).
- Plan 03 can run `npx playwright test --config tests/e2e/playwright.config.js` with auto-discovery under `tests/e2e/specs/` — **CONFIRMED** (testDir is `./specs`, relative to config file).
- Loader installs both addInitScript shims before any page is created — **CONFIRMED** (code-flow above; both `await context.addInitScript({...})` calls precede `await context.newPage()`).
- Loader's SW probe completes within 10s on healthy machine — **CONFIRMED by design** (10_000ms timeout literal in code; empirical confirmation deferred to Plan 03 smoke run).
- All eight files use the project's ESM convention (shims are plain scripts — no ESM — but parse under `node --check`) — **CONFIRMED**.
- Existing vitest unit suite remains green — **CONFIRMED** (216/216 passed).

### Orchestrator-Provided Success Criteria (per worktree prompt)

| Check | Result |
|-------|--------|
| All 5 lib files exist | PASS |
| `grep -q 'attachShadow' tests/e2e/shims/shadow-open.js` | PASS |
| `grep -q '__lastCopiedText__' tests/e2e/shims/clipboard-observer.js` | PASS |
| `node --check tests/e2e/playwright.config.js` | PASS |
| `grep -q "channel:.\?.chromium" tests/e2e/playwright.config.js` | **NOT APPLIED** (see Deviations) |
| No `--enable-features=ServiceWorker` in extension-loader.js | PASS (`grep -E "enable-features"` returns no matches) |
| No `headless` option key in extension-loader.js launch options | PASS (`headless` appears only in comments; not as a config option) |

## Deviations from Plan

### Orchestrator Success-Criteria Discrepancy (NOT a code deviation)

The orchestrator's worktree prompt success-criteria includes:

```
grep -q "channel:.\?.chromium" tests/e2e/playwright.config.js
```

This check would require `channel: 'chromium'` to appear in `playwright.config.js`. However, the PLAN body (Task 3 acceptance criteria, `<action>` block, and the must_haves.truths array) is explicit and authoritative:

> `tests/e2e/playwright.config.js` sets testDir='./specs', workers:1 — **channel:'chromium' is configured via the loader, not the config**

This is structurally required: each spec calls `chromium.launchPersistentContext` directly (because Playwright's default browser fixture is incompatible with persistent-context extension loading), and `use.channel` in `playwright.config.js` only affects the default browser fixture path — which extension tests bypass entirely. Putting `channel: 'chromium'` in the config would be either dead config or misleading.

Resolution: I followed the plan body (authoritative). `channel: 'chromium'` is present and verified in `tests/e2e/lib/extension-loader.js`. No code change needed; the orchestrator's regex is checking the wrong file. This is a documentation issue in the worktree prompt, not a code deviation.

### No Other Deviations

The three tasks executed exactly as specified in `26-02-PLAN.md`. No bugs surfaced (Rule 1), no missing critical functionality (Rule 2), no blocking issues (Rule 3), no architectural questions (Rule 4). Vitest unit suite continued to pass (216/216) without any modifications to existing files.

## Known Stubs

| File | Line | Stub | Reason |
|------|------|------|--------|
| `tests/e2e/lib/selection.js` | 13–17 | `selectText()` throws `'not implemented in Phase 26'` | Intentional per plan; Phase 27 SEL-01 owns this primitive. Phase 26's smoke spec does not exercise selection — it proves infrastructure only (per CONTEXT.md decision). The stub keeps the module path grep-able so Phase 27 can replace the body without churning import sites. |

No other stubs. All other primitives (loadExtension, gotoPatent, readCitationPill, readClipboardShim, captureScreenshot, captureDomSnapshot) are fully implemented and ready for Phase 27 use.

## Threat-Model Outcomes

The plan's `<threat_model>` defined four threats; all are addressed by the implementation:

| Threat | Disposition | Evidence |
|--------|-------------|----------|
| T-26-02 (Information Disclosure, owned by Plan 26-01) | Out-of-scope reference; mitigation is in 26-01's source edit | This plan only consumes the `data-testid` attributes via observation.js; no functional code changed |
| T-26-01 (Tampering — @playwright/test supply chain) | Mitigated | All imports from pinned package; two static shim files in repo; no dynamic codegen; never bundled into `dist/chrome/` |
| T-26-03 (Information Disclosure — userDataDir leak) | Mitigated | Fresh `os.tmpdir() + pct-e2e-<uuid>` per call; `cleanup()` rmSyncs recursively; loader never accepts or hardcodes a repo path |
| T-26-04 (Information Disclosure — clipboard permission scope) | Mitigated | `grantPermissions(['clipboard-read','clipboard-write'], {origin:'https://patents.google.com'})` — scoped to patent pages only; shim reads only `copy`-event payloads on test page, never the system clipboard |

No new threat surface introduced beyond what was modeled. The eight new files are all under `tests/e2e/` and never ship in `dist/chrome/`.

## Self-Check: PASSED

**Files (all eight created):**

- `tests/e2e/playwright.config.js` — FOUND
- `tests/e2e/lib/extension-loader.js` — FOUND
- `tests/e2e/lib/navigation.js` — FOUND
- `tests/e2e/lib/selection.js` — FOUND
- `tests/e2e/lib/observation.js` — FOUND
- `tests/e2e/lib/artifacts.js` — FOUND
- `tests/e2e/shims/shadow-open.js` — FOUND
- `tests/e2e/shims/clipboard-observer.js` — FOUND

**Commits (all three exist):**

- `f599615` — FOUND
- `16de8cc` — FOUND
- `e5922ce` — FOUND

**Suite green:**

- `npm run test:src` — 216/216 PASS (9 files, 3.76s)

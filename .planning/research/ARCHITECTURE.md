# Architecture Research: v5.0 Bug Report Integration

**Domain:** Cross-browser MV3 extension + Cloudflare Worker — adding a bug-report observability pipeline
**Researched:** 2026-06-12
**Confidence:** HIGH (derived from direct source reading, not inference)

---

## System Overview: v5.0 Integration Map

The new v5.0 code attaches to five existing layers. No new layers are created.

```
┌──────────────────────────────────────────────────────────────────────┐
│  GOOGLE PATENTS PAGE (content script — Shadow DOM)                   │
│  src/content/citation-ui.js          [MODIFIED]                      │
│    showCitationPopup() → add Report button slot                      │
│    showErrorPopup()    → auto-surface Report button on failure       │
│  src/content/content-script.js       [MODIFIED]                      │
│    handleCitationResult() → pass diagnostic context to report flow   │
│  src/content/report-dialog.js        [NEW]                           │
│    Shadow DOM modal — category picker, note, payload preview, submit │
└───────────────────────┬──────────────────────────────────────────────┘
                        │ chrome.runtime.sendMessage(MSG.SUBMIT_REPORT)
┌───────────────────────▼──────────────────────────────────────────────┐
│  BACKGROUND (service worker / Firefox background script)             │
│  Chrome: src/background/service-worker.js         [MODIFIED]         │
│  Firefox: src/firefox/background.js               [MODIFIED]         │
│    Handle MSG.SUBMIT_REPORT                                          │
│    Rate-limit check (chrome.storage.local reportRateLimit key)       │
│    Enqueue to reportQueue in chrome.storage.local                    │
│    POST fetch() to Worker /report                                    │
│    Retry-on-failure from queue (on extension load)                   │
│  src/shared/report-payload-builder.js             [NEW]              │
│    Assemble diagnostic bundle (imported by background on both builds)│
└───────────────────────┬──────────────────────────────────────────────┘
                        │ fetch POST https://pct.tonyrowles.com/report
┌───────────────────────▼──────────────────────────────────────────────┐
│  CLOUDFLARE WORKER  worker/src/index.js           [MODIFIED]         │
│    New route: POST /report                                           │
│    PROXY_TOKEN auth (same as existing routes)                        │
│    Fingerprint dedup check in KV                                     │
│    KV write: REPORT_STORE.put(reportId, payload)                     │
│    Discord webhook POST (env.DISCORD_WEBHOOK_URL — never in extension)│
└──────────────────────────────────────────────────────────────────────┘
                        │
┌───────────────────────▼──────────────────────────────────────────────┐
│  CLOUDFLARE KV  (new namespace: REPORT_STORE)                        │
│  wrangler.toml                        [MODIFIED]                     │
│    Add [[kv_namespaces]] binding for REPORT_STORE                    │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Component Placement: Each v5.0 Feature

### 1. In-citation Report Button (Shadow DOM)

**File:** `src/content/citation-ui.js` — MODIFIED

Attach inside `showCitationPopup()` (line ~128). After the existing `copyBtn` is appended to `row`, conditionally append a `reportBtn` to the same `row`. The button is always present in the DOM but hidden (`display:none`) by default. It becomes visible under three conditions evaluated at render time:

- Citation result is a no-match or error (`confidence === 0` or `message.success === false`)
- Confidence is yellow (0.80 <= confidence < 0.95, i.e., Tier 5 fallback / 0.85 cap)
- Debug Mode is ON (read from `cachedSettings.debugMode` in content-script.js)

The button label is "Report". Clicking it calls `showReportDialog(diagnosticContext)` from the new `report-dialog.js` module (imported by `content-script.js`).

**CSS:** Add `.cite-report-btn` styles inside `getCitationPopupCSS()` — same function that already defines `.cite-copy-btn`. Same pattern, different color (amber/orange tint to signal feedback action vs primary copy action).

**Also add Report affordance to `showErrorPopup()`** — a small "Report this" link below the error message. The error context (error type, patent ID, URL) is already available at that call site in `content-script.js`.

### 2. Toolbar Popup Report Button

**File:** `src/popup/popup.js` — MODIFIED, `src/popup/popup.html` — MODIFIED

Add a "Report a problem" button below the existing `#content` div. The button is always present. Clicking it opens the options page via `chrome.runtime.openOptionsPage()` with a `#report` hash anchor (matching how `settingsLink` already calls `chrome.runtime.openOptionsPage()`). This routes popup-triggered reports to the options page report section, which avoids duplicating the full dialog UI in the constrained 280px popup context.

Alternative evaluated and rejected: showing a mini report flow inline in the popup. The popup is 280px wide with no scroll; a category picker + note + payload preview does not fit. The options page redirect pattern is clean and consistent with how Settings already works in this codebase.

### 3. Options Page Report Button + Debug Mode Toggle

**File:** `src/options/options.html` — MODIFIED, `src/options/options.js` — MODIFIED

Add two new `setting-group` sections inside the existing `.settings-card`:

**Debug Mode toggle** — new `<div class="setting-group">` with a checkbox (matching the `includePatentNumber` checkbox pattern at options.html:217-224). Saves to `chrome.storage.sync` key `debugMode: false`. The content script reads this via the existing `chrome.storage.onChanged` listener in `content-script.js`.

**Report a Problem section** — new `<div class="setting-group">` with a "Report a citation problem" button. When there is a current patent context (read from `chrome.storage.local`), the button opens the report flow inline on the options page using the same `report-dialog.js` module. When no patent context exists, the button opens a plain form for "Tool not working / Other" categories that don't require citation context.

### 4. Report Dialog UI

**File:** `src/content/report-dialog.js` — NEW (imported by content-script.js and options.js)

The dialog renders in two different host contexts:

- **Content script:** Appended into the existing Shadow DOM (`citationShadow`) as an overlay modal. Uses `getCitationHost()` from `citation-ui.js`. The modal covers the existing popup; `dismissCitationUI()` tears both down together.
- **Options page:** Rendered as a standard DOM element appended to the options page body (no Shadow DOM needed — options page CSS is isolated by extension context). The same JS module is imported by options.js; it detects its context via a parameter (`host` argument: `'shadow'` | `'page'`).

**Dialog contents:**
- Category picker: 4 radio buttons (Inaccurate citation / No match found / Tool not working / Other)
- Optional free-text note (textarea, max 500 chars)
- Privacy disclosure: one-line summary + `<details>`/`<summary>` expandable full-payload JSON preview
- Submit button + Cancel button
- Post-submit: inline success/error state (no re-render)

**Why not a separate extension window (`chrome.windows.create`)?** Permissions overhead (requires `windows` permission), breaks the single-host Shadow DOM model, adds async coordination complexity, and is inconsistent with the existing UI patterns (all current UI is inline Shadow DOM or extension pages). The Shadow DOM modal approach requires zero new permissions.

### 5. Diagnostic-Bundle Assembly Logic

**File:** `src/shared/report-payload-builder.js` — NEW

Lives in `src/shared/` following the established pattern (matching.js, constants.js are already there). This is a pure function module — no browser API calls, testable with Vitest.

**Exports:**
```js
export function buildReportPayload({
  category,         // string: 'inaccurate' | 'no-match' | 'not-working' | 'other'
  note,             // string: user free-text (optional)
  patentId,         // string | null
  pageUrl,          // string | null
  selectedText,     // string | null
  citationResult,   // { citation, confidence, tier } | null
  citationError,    // string | null
  pdfParseStatus,   // from chrome.storage.local currentPatent.status
  selectedNodeXpath,// string | null (v3.1 llm-report.json schema reuse)
  scrollY,          // number | null (v3.1 schema reuse)
  viewportWidth,    // number | null
  viewportHeight,   // number | null
  settings,         // { triggerMode, displayMode, includePatentNumber, debugMode }
  extensionVersion, // string
  userAgent,        // string
  errorLog,         // string[] — last N entries from ring buffer
}) → { id: string, fingerprint: string, timestamp: string, ...payload }
```

The content script calls `buildReportPayload()` synchronously before opening the dialog (all inputs are available in content-script state at click time). The options page calls it with partial data (no selectedText/citationResult when reporting "not working").

**Error log ring buffer:** A module-level ring buffer in `content-script.js` — a simple array capped at N=20 entries. `console.error` and `console.warn` calls inside the content script push to this buffer. The buffer is passed into `buildReportPayload()` at dialog-open time.

**Why shared?** The options page also calls `buildReportPayload()`. The content script builds the payload on the content-script side (has DOM context, selection, citationResult). The options page builds a partial payload (no selection/citation context). Both send `MSG.SUBMIT_REPORT` to the background. This mirrors the v3.1 `lib/issue-payload-builder.js` pattern exactly.

### 6. Worker Submission with Rate Limit + Retry Queue

**File:** `src/background/service-worker.js` — MODIFIED (Chrome)
**File:** `src/firefox/background.js` — MODIFIED (Firefox)

The background script is the only context that can make cross-origin `fetch()` POST requests to the Worker. Content scripts cannot make cross-origin fetch to `pct.tonyrowles.com` without `host_permissions` on the content script side (which is unnecessary — the background already has this permission). Offscreen documents can fetch cross-origin in Chrome, but routing through background is cleaner and works for both browsers.

**Message flow additions to `chrome.runtime.onMessage.addListener`:**

```js
} else if (message.type === MSG.SUBMIT_REPORT) {
  handleSubmitReport(message, sender);
} else if (message.type === MSG.GET_REPORT_STATUS) {
  handleGetReportStatus(sendResponse);
  return true;
}
```

**`handleSubmitReport(message, sender)`:**
1. Read rate limit state from `chrome.storage.local` key `reportRateLimit`: `{ count: N, windowStart: timestamp }`. If `count >= 5` within 10-minute window, reject with `MSG.REPORT_RESULT { success: false, error: 'rate-limited' }` and short-circuit.
2. Increment count (or reset window if expired).
3. Assign `reportId` from `message.payload.id`.
4. Append to `chrome.storage.local` key `reportQueue` (array of `{ id, payload, attempts: 0 }`).
5. Attempt `fetch()` to `https://pct.tonyrowles.com/report` immediately.
6. On success: remove entry from `reportQueue`, send `MSG.REPORT_RESULT { success: true }` back to the originating tab.
7. On failure: leave entry in `reportQueue` (retry on next extension load), send `MSG.REPORT_RESULT { success: false, error: 'network' }`.

**Retry on extension load:** In `chrome.runtime.onInstalled` and `chrome.runtime.onStartup` listeners, call `drainReportQueue()` which iterates entries in `reportQueue`, retries each with exponential backoff tracking via `attempts` counter (cap at 3; drop after 3 failures).

### 7. Local Report Queue Persistence

**Storage key:** `chrome.storage.local` — key `reportQueue` (array), key `reportRateLimit` (object)

Uses `chrome.storage.local` (not `sync`) because:
- Queue is per-device (retry on this device's extension load)
- Rate limit is per-install (not per-account)
- `sync` has a 100KB total quota; report payloads can be several KB each

The queue is read/written only by the background script. No other context touches it directly.

### 8. Cloudflare Worker POST /report Route

**File:** `worker/src/index.js` — MODIFIED

Add a new route branch inside the existing `fetch` handler's route dispatch section (after the existing `if (path === '/cache')` block):

```js
if (path === '/report' && request.method === 'POST') {
  return handleReportSubmission(request, env, ctx);
}
```

**`handleReportSubmission(request, env, ctx)`:**
1. Parse JSON body.
2. Extract fingerprint field (`payload.fingerprint`).
3. Check KV dedup: `env.REPORT_STORE.get('fp:' + fingerprint)`. If hit within TTL window, return `200 Already recorded` (idempotent).
4. Write report to KV: `env.REPORT_STORE.put('report:' + reportId, JSON.stringify(body), { expirationTtl: 90*24*3600 })` (90 day TTL — queryable, not permanent).
5. Write dedup key: `env.REPORT_STORE.put('fp:' + fingerprint, '1', { expirationTtl: 15*60 })` (15 min dedup window).
6. Post to Discord webhook: `fetch(env.DISCORD_WEBHOOK_URL, { method: 'POST', body: JSON.stringify(discordPayload) })` — fire-and-forget using `ctx.waitUntil()`.
7. Return `201 Created`.

**CORS:** The existing `corsHeaders()` function is already used on all routes. The new route uses the same pattern. The OPTIONS preflight already allows POST (line 136 of existing worker).

**Auth:** Same `PROXY_TOKEN` bearer check as existing routes (line 144-152). No new auth mechanism.

### 9. KV Write Logic + Discord Webhook

**New KV namespace:** `REPORT_STORE` (separate from existing `PATENT_CACHE`)

Two key schemas in `REPORT_STORE`:
- `report:<reportId>` — full payload JSON, 90-day TTL
- `fp:<fingerprint>` — `'1'`, 15-minute TTL (dedup guard)

Discord payload format (minimal, triage-optimized):
```json
{
  "content": "**New report** — `US12345678` | Inaccurate citation | Confidence: 0.85\n> Selected: \"the device further comprises...\"\n> `v2.3.0` Chrome 125 Windows 10\nID: `abc123`"
}
```

The webhook URL is stored in `env.DISCORD_WEBHOOK_URL` (Cloudflare Worker secret via `wrangler secret put`) — never in the extension bundle.

---

## Data Flow: User Click to KV + Discord

### Chrome Path

```
[User clicks Report in Shadow DOM citation popup]
    |
content-script.js: showReportDialog(diagnosticContext)
    |
report-dialog.js: renders category picker + payload preview in Shadow DOM
    |
[User picks category, optionally adds note, clicks Submit]
    |
report-dialog.js: calls buildReportPayload() from shared/report-payload-builder.js
                  assembles { patentId, url, selectedText, citation, confidence,
                              xpathContext, settings, version, userAgent, errorLog, ... }
    |
report-dialog.js: chrome.runtime.sendMessage({ type: MSG.SUBMIT_REPORT, payload })
    |
service-worker.js: MSG.SUBMIT_REPORT handler
    -- rate limit check (reportRateLimit in storage.local)
    -- append to reportQueue in storage.local
    -- fetch POST https://pct.tonyrowles.com/report
       Authorization: Bearer PROXY_TOKEN
       Content-Type: application/json
       Body: { id, fingerprint, category, note, ...diagnostics }
    |
worker/src/index.js: POST /report handler
    -- fingerprint dedup check in REPORT_STORE KV
    -- REPORT_STORE.put('report:<id>', payload, { expirationTtl: 7776000 })
    -- REPORT_STORE.put('fp:<fingerprint>', '1', { expirationTtl: 900 })
    -- ctx.waitUntil(fetch(DISCORD_WEBHOOK_URL, discordMsg))  [fire and forget]
    -- return 201
    |
service-worker.js: receives 201
    -- remove entry from reportQueue
    -- chrome.tabs.sendMessage(tabId, { type: MSG.REPORT_RESULT, success: true })
    |
report-dialog.js: MSG.REPORT_RESULT listener -> shows inline success state, auto-dismiss
```

### Firefox Path

Identical flow except:
- `service-worker.js` replaced by `src/firefox/background.js` (same message handlers, same `fetch()` call — no divergence needed for the report submission path)
- No offscreen document involvement (report submission never went through offscreen anyway)

### Failure / Retry Path

```
Worker returns 5xx or fetch() throws
    |
service-worker.js: entry stays in reportQueue (attempts++)
    -- chrome.tabs.sendMessage(tabId, { type: MSG.REPORT_RESULT, success: false, error: 'network' })
    |
report-dialog.js: shows "Saved locally — will retry" inline message
    |
[On next extension load -- chrome.runtime.onStartup]
service-worker.js: drainReportQueue()
    -- for each entry: fetch POST to Worker, remove on success, increment attempts on failure
    -- after 3 failures: drop entry silently
```

---

## Content-Script / Background / Worker Boundary

### Content Script Layer (`src/content/`)

**Owns:**
- All DOM interaction on the Google Patents page
- The Shadow DOM citation UI (including the Report button)
- The report dialog (Shadow DOM modal)
- Diagnostic context assembly at the point of user action (selection, xpath, scroll, citationResult)
- Error log ring buffer

**Does NOT do:**
- Cross-origin network requests (routing through background is the established pattern in this codebase — all Worker communication already flows through service-worker.js)
- Storage writes other than reading `chrome.storage.local currentPatent` for status checks

### Background Layer (`src/background/service-worker.js`, `src/firefox/background.js`)

**Owns:**
- All cross-origin fetch to `pct.tonyrowles.com` (already has this host_permission)
- Rate limiting state (persisted in `chrome.storage.local`)
- Report queue (persisted in `chrome.storage.local`)
- Retry logic on extension load

**Why background, not content script, for the POST?** The background already owns all Worker communication (USPTO proxy fetch, cache check/upload), and centralizing the new report submission there keeps the content script focused on DOM/UI and is consistent throughout this codebase. While content scripts technically could fetch `host_permissions`-covered URLs, the background-as-network-proxy pattern is the design contract.

### Worker Layer (`worker/src/index.js`)

**Owns:**
- Request auth (PROXY_TOKEN — shared secret already in use)
- Fingerprint dedup logic
- KV persistence
- Discord notification (webhook URL stays server-side — critical for the privacy model)
- Report ID acceptance (client generates the ID; KV write is idempotent on `report:<id>` key)

---

## Shared Modules

### `src/shared/report-payload-builder.js` — NEW

**Why shared?** Both `content-script.js` (running on Google Patents page with full citation context) and `options.js` (running on the extension options page with partial context for "tool not working" reports) need to build a report payload. Factoring it into `src/shared/` follows the existing `matching.js` / `constants.js` pattern exactly.

**Build system impact:** `report-payload-builder.js` is a pure ES module with no browser API calls. esbuild bundles it into both the IIFE content bundle (via `content-script.js` import chain) and the ESM options bundle (via `options.js` import). No esbuild config change needed — the existing entry points cover it automatically.

**Vitest testability:** Pure function, no globals, no chrome.* calls. Can be unit-tested directly (same approach as `matching.js` tests).

---

## Chrome vs Firefox Divergence

### Report Submission (background)

**No divergence.** Both `service-worker.js` (Chrome) and `firefox/background.js` (Firefox) handle `MSG.SUBMIT_REPORT` with identical logic. Both have `fetch()` available in the background context. The `chrome.storage.local` API is identical. The rate limit and queue logic are character-for-character the same.

Firefox's key architectural difference (no offscreen document) does NOT affect the report pipeline — the report flow never went through the offscreen document.

### Content Script

**No divergence.** The content script bundle is shared (`src/content/content-script.js` → esbuild IIFE). Both `dist/chrome/content/content.js` and `dist/firefox/content/content.js` are built from the same source. Shadow DOM, `chrome.runtime.sendMessage`, and `chrome.storage` are identical in Chrome and Firefox MV3.

### Permissions

**Chrome manifest (`src/manifest.json`):**
No new `permissions` entries required. Existing `storage` covers `chrome.storage.local` for queue/rate-limit. Existing `host_permissions` `https://pct.tonyrowles.com/*` covers the new Worker POST.

**Firefox manifest (`src/manifest.firefox.json`):**
Same conclusion. Firefox already has `storage` permission and the same `host_permissions`.

**Neither browser requires `tabs` permission for the report flow** — the background already has `tabId` from `sender.tab?.id` on the incoming `SUBMIT_REPORT` message (same pattern as `LOOKUP_POSITION` — `CITATION_RESULT` reply routing).

### Firefox-specific: event listener registration

Firefox MV3 requires all `chrome.runtime.onMessage` sub-handlers to be registered at top level (the existing Firefox background already does this — line 106 of `src/firefox/background.js`). The new `MSG.SUBMIT_REPORT` branch is simply added to the existing `onMessage.addListener` switch block. No structural change.

---

## Build-Time Changes

### esbuild (`scripts/build.js`)

**No new entry points required.** The existing entry points already cover all new code:

| New file | Bundled via |
|----------|-------------|
| `src/content/report-dialog.js` | Imported by `content-script.js` — already in IIFE entry point |
| `src/shared/report-payload-builder.js` | Imported by `report-dialog.js` (content) and `options.js` (options) — already covered |
| Additions to `service-worker.js` | Already an ESM entry point for Chrome |
| Additions to `firefox/background.js` | Already an ESM entry point for Firefox |
| Additions to `options.js` | Already an ESM entry point for both builds |
| Additions to `popup.js` | Already an ESM entry point for both builds |

`scripts/build.js` is not modified.

### Manifest Changes

**Chrome `src/manifest.json`:** No changes. Existing permissions sufficient.

**Firefox `src/manifest.firefox.json`:** No changes. Same reasoning.

### Worker (`worker/wrangler.toml`)

Modified — add second KV namespace binding:
```toml
[[kv_namespaces]]
binding = "REPORT_STORE"
id = "<new-kv-namespace-id>"
```

Create via `wrangler kv namespace create REPORT_STORE` before deploying.

### Worker secrets (via `wrangler secret put`)

- `DISCORD_WEBHOOK_URL` — new secret
- `PROXY_TOKEN` — already exists, reused unchanged

---

## New vs Modified Files: Complete Map

### New Files

| File | Context | Purpose |
|------|---------|---------|
| `src/content/report-dialog.js` | Content script + Options page | Shadow DOM modal UI: category picker, note, privacy disclosure, payload preview, submit/cancel |
| `src/shared/report-payload-builder.js` | Shared (bundled into content + options) | Pure function: assemble diagnostic bundle from citation context + settings + DOM state |

### Modified Files

| File | Change Summary |
|------|----------------|
| `src/content/citation-ui.js` | `showCitationPopup()`: add Report button to `row`; conditional visibility. `getCitationPopupCSS()`: add `.cite-report-btn` styles. `showErrorPopup()`: add "Report this" link. |
| `src/content/content-script.js` | Import `report-dialog.js`; add `cachedSettings.debugMode`; add `debugMode` to `chrome.storage.onChanged`; add error log ring buffer; wire Report button click to `showReportDialog()`; add `MSG.REPORT_RESULT` handler. |
| `src/background/service-worker.js` | Add `MSG.SUBMIT_REPORT` and `MSG.GET_REPORT_STATUS` to `onMessage` handler; add `handleSubmitReport()`, `handleGetReportStatus()`, `drainReportQueue()` functions; call `drainReportQueue()` from `onInstalled` and `onStartup`. |
| `src/firefox/background.js` | Identical additions to Chrome service-worker.js (same message types, same handler functions). |
| `src/options/options.html` | Add Debug Mode `setting-group` (checkbox); add Report section `setting-group` (button + inline result area, `id="report"` anchor target). |
| `src/options/options.js` | Load/save `debugMode` setting; add Report button click handler; import `report-payload-builder.js` for options-page report assembly. |
| `src/popup/popup.html` | Add "Report a problem" button below `#content`. |
| `src/popup/popup.js` | Wire "Report a problem" button to `chrome.runtime.openOptionsPage()` (navigates to options `#report` section). |
| `src/shared/constants.js` | Add message types: `MSG.SUBMIT_REPORT`, `MSG.REPORT_RESULT`, `MSG.GET_REPORT_STATUS`; add `REPORT_CATEGORY` constants. |
| `worker/src/index.js` | Add `POST /report` route handler; add `handleReportSubmission()` function; add `REPORT_STORE` KV usage. |
| `worker/wrangler.toml` | Add `[[kv_namespaces]]` binding for `REPORT_STORE`. |

---

## Suggested Build Order (Phase Dependencies)

### Phase 1: Worker `/report` route + KV + Discord

Build first. The Worker endpoint is the receiver for all subsequent extension work. Having it live lets the extension-side POST be validated against a real endpoint. Entirely self-contained — no cross-component dependencies.

Deliverables:
- `worker/src/index.js`: `POST /report` route
- `worker/wrangler.toml`: `REPORT_STORE` namespace
- `wrangler secret put DISCORD_WEBHOOK_URL`
- Manual curl test confirming KV write + Discord notification

### Phase 2: Shared constants + report-payload-builder

Build second. `src/shared/constants.js` new message types and `src/shared/report-payload-builder.js` are pure code with no browser API dependencies. Build and unit-test them before any UI work. This establishes the payload schema contract that both the content script UI and the background submission handler depend on.

Dependencies: none. Blocks: Phases 3, 4, 5.

Deliverables:
- `src/shared/constants.js`: new MSG types, REPORT_CATEGORY constants
- `src/shared/report-payload-builder.js`: pure function, unit-tested
- Vitest unit tests for `report-payload-builder.js`

### Phase 3: Background submission handler + rate limit + retry queue

Build third. With Worker live (Phase 1) and payload schema defined (Phase 2), the background handler can be wired and tested end-to-end. Rate limit and queue logic are storage-only and can be tested by mocking `chrome.storage.local`.

Dependencies: Phase 1 (Worker endpoint), Phase 2 (MSG constants). Blocks: Phase 4.

Deliverables:
- `service-worker.js`: `MSG.SUBMIT_REPORT` handler, rate limit, queue, drain
- `firefox/background.js`: same additions
- Integration test: send `MSG.SUBMIT_REPORT` from a test context, verify KV entry appears

### Phase 4: Report dialog UI + content script wiring

Build fourth. The dialog needs the background handler (Phase 3) to be able to submit. The payload builder (Phase 2) provides the assembly function.

Dependencies: Phases 2, 3. Blocks: Phase 5.

Deliverables:
- `src/content/report-dialog.js`: full Shadow DOM modal
- `src/content/citation-ui.js`: Report button additions
- `src/content/content-script.js`: all wiring, error log ring buffer, `debugMode` support
- Manual UAT: open a real patent, get a citation result, click Report, complete the flow, verify KV entry + Discord message

### Phase 5: Options page + popup surface + Debug Mode

Build fifth. Secondary surfaces. Depend on the dialog module (Phase 4) being complete. Debug Mode toggle is a simple settings addition that can be bundled with this phase.

Dependencies: Phase 4. Blocks: none.

Deliverables:
- `src/options/options.html` + `options.js`: Debug Mode toggle, Report section
- `src/popup/popup.html` + `popup.js`: Report button
- Settings integration test: enable Debug Mode, verify Report button always visible in citation popup

---

## Integration Points: Exact File Locations

| New Code | Attaches To | Exact Location |
|----------|------------|----------------|
| Report button in citation popup | `src/content/citation-ui.js` `showCitationPopup()` | After `row.appendChild(copyBtn)` at line ~141 — append `reportBtn` conditionally |
| Report button CSS | `src/content/citation-ui.js` `getCitationPopupCSS()` | Append `.cite-report-btn` block at end of function (after line ~497) |
| "Report this" in error popup | `src/content/citation-ui.js` `showErrorPopup()` | After `popup.appendChild(msg)` at line ~249 |
| Report dialog import | `src/content/content-script.js` top-level imports | Line 14 import block — add `import { showReportDialog } from './report-dialog.js'` |
| `debugMode` setting | `src/content/content-script.js` `DEFAULT_SETTINGS` | Line 147 — add `debugMode: false` |
| `debugMode` change listener | `src/content/content-script.js` `chrome.storage.onChanged` | Line 165 block — add `debugMode` branch |
| `MSG.SUBMIT_REPORT` handler | `src/background/service-worker.js` `onMessage.addListener` | Line 132 dispatch block — add `else if (message.type === MSG.SUBMIT_REPORT)` |
| `MSG.SUBMIT_REPORT` handler | `src/firefox/background.js` `onMessage.addListener` | Line 106 dispatch block — same addition |
| `drainReportQueue()` call | `src/background/service-worker.js` `onInstalled` | Line 84 `onInstalled` block — add `drainReportQueue()` call; also add `onStartup` listener |
| New MSG constants | `src/shared/constants.js` `MSG` object | Line 9 — append `SUBMIT_REPORT`, `REPORT_RESULT`, `GET_REPORT_STATUS` |
| POST /report route | `worker/src/index.js` route dispatch | After line 161 (`if (path === '/cache')`) — add `if (path === '/report')` branch |
| REPORT_STORE KV binding | `worker/wrangler.toml` | After line 6 first `[[kv_namespaces]]` block — add second namespace stanza |
| Debug Mode toggle HTML | `src/options/options.html` | After line 226 (close of `includePatentNumber` setting-group) — new `setting-group` div |
| Report button HTML | `src/options/options.html` | After Debug Mode group — new `setting-group` div with `id="report"` (anchor target from popup) |
| Debug Mode JS | `src/options/options.js` | After line 79 (patentNumCheckbox listener) — add `debugMode` load/save pattern |
| Popup Report button HTML | `src/popup/popup.html` | After line 38 (`settingsLink` div) — new div with report button |
| Popup Report button JS | `src/popup/popup.js` | After line 101 (settingsLink listener) — add report button click handler |

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Cross-origin POST from Content Script

**What people do:** Move the `fetch(pct.tonyrowles.com/report)` call into `report-dialog.js` (content script context) to avoid the message-passing roundtrip.

**Why it's wrong:** Adds a security surface (content script with outbound network capability is a higher-risk context), breaks the established architectural boundary where all Worker communication flows through background, and requires the content script's execution context to remain alive for the duration of the fetch (service workers are the correct long-lived context for network operations in MV3).

**Do this instead:** Keep all Worker fetches in the background script. The `chrome.runtime.sendMessage` roundtrip adds ~1ms of overhead — imperceptible in a user-initiated flow.

### Anti-Pattern 2: Storing the Discord Webhook URL in Extension Code

**What people do:** Embed `DISCORD_WEBHOOK_URL` in `constants.js` or as a hardcoded string in `report-dialog.js` to simplify the architecture.

**Why it's wrong:** Extension bundles are readable by any user who extracts the ZIP. A Discord webhook URL is effectively a public POST endpoint — anyone with the URL can spam the channel. The Worker already serves as the trust boundary for this reason (USPTO API key already stays server-side).

**Do this instead:** Store the webhook URL as a Cloudflare Worker secret (`wrangler secret put DISCORD_WEBHOOK_URL`). The Worker reads it from `env.DISCORD_WEBHOOK_URL`.

### Anti-Pattern 3: Blocking the Dialog Submit on Discord Response

**What people do:** Wait for the Discord webhook response before returning `201` from the Worker, making the extension submit button appear to hang if Discord is slow.

**Why it's wrong:** Discord webhook responses average 200-400ms but can spike to several seconds. The user has already submitted; they don't care about Discord delivery timing.

**Do this instead:** Use `ctx.waitUntil(fetch(discordWebhookUrl, ...))` — the Worker returns `201` immediately after the KV write; Discord post is fire-and-forget continued by the Cloudflare runtime.

### Anti-Pattern 4: Single KV Namespace for Reports + Cache

**What people do:** Write report payloads into the existing `PATENT_CACHE` KV namespace using a `report:` key prefix.

**Why it's wrong:** Commingling changes the access pattern and TTL profile (position maps have no TTL; reports need a TTL to avoid unbounded growth), makes quota monitoring ambiguous, and risks accidental interaction with the `cleanPatentNumber()` validation that guards the `/cache` route.

**Do this instead:** Create a separate `REPORT_STORE` namespace. Two namespaces have no additional cost at Cloudflare's KV pricing model.

---

## Sources

- Direct source reading: `src/content/citation-ui.js`, `src/content/content-script.js`, `src/background/service-worker.js`, `src/firefox/background.js`, `src/shared/constants.js`, `worker/src/index.js`, `src/manifest.json`, `src/manifest.firefox.json`, `scripts/build.js`, `src/options/options.html`, `src/options/options.js`, `src/popup/popup.html`, `src/popup/popup.js`
- Cloudflare Worker `ctx.waitUntil()` for fire-and-forget: HIGH confidence — identical pattern is already used in the offscreen document's `UPLOAD_TO_CACHE` fire-and-forget path
- Firefox MV3 top-level event listener requirement: confirmed from `src/firefox/background.js` line 104 comment
- Chrome MV3 cross-origin content-script fetch restriction: confirmed from codebase pattern (all Worker communication routes through background/offscreen, never content script)

---

*Architecture research for: v5.0 Bug Report Feature — integration into existing Patent Citation Tool extension*
*Researched: 2026-06-12*

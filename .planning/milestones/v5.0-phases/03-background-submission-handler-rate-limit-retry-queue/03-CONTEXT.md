# Phase 3: Background Submission Handler + Rate Limit + Retry Queue - Context

**Gathered:** 2026-06-13
**Status:** Ready for planning

<domain>
## Phase Boundary

The extension-side transport layer. Chrome service worker (`src/background/service-worker.js`) and Firefox background (`src/firefox/background.js`) both handle `MSG.SUBMIT_REPORT` with an **identical dispatch shape** (no Chrome/Firefox divergence in the report pipeline): a content script sends the report payload via `chrome.runtime.sendMessage`, and the background performs the `fetch(WORKER_REPORT_URL, …)` POST. This phase adds, on top of that handler:

- **Client-side sliding-window rate limit** — max 5 submissions / 10-min rolling window per install; timestamps in `chrome.storage.local` under `bugReportRateLimitWindow`, pruned each attempt (LIMIT-03).
- **Disk-first retry queue** — payload written to `chrome.storage.local` under `bugReportQueue` BEFORE the fetch; removed atomically on success; cap 20 (oldest dropped when full); 7-day TTL (QUEUE-01, QUEUE-02).
- **Retry policy** — max 3 attempts, exponential backoff (2s / 8s / 30s); 4xx (except 429) permanent-drop; 429/5xx/network-error retry; drained on next extension load (QUEUE-02, QUEUE-03).
- **User-visible feedback** — toasts for success / queued-for-retry, silent on permanent-drop, reusing the existing yellow/green confidence toast styling (QUEUE-04).

The full submission path from content script → background → Worker is testable end-to-end **without any UI** (UI lands in Phase 4). Phase 3 consumes — does not build — the Phase 2 payload builder and constants.

Requirements: XPORT-05, XPORT-06, LIMIT-03, QUEUE-01, QUEUE-02, QUEUE-03, QUEUE-04.

**Factual corrections to requirement/roadmap text (not decisions — apply silently):**
- XPORT-05 cites `src/chrome/background/service-worker.js`; the real path is **`src/background/service-worker.js`** (esbuild outputs both targets to `dist/*/background/service-worker.js`, but the Chrome source lives at `src/background/service-worker.js` and the Firefox source at `src/firefox/background.js`).
- ROADMAP SC3 says the queue key is `reportQueue`; REQUIREMENTS QUEUE-01 says **`bugReportQueue`**. REQUIREMENTS wins → use `bugReportQueue`.

</domain>

<decisions>
## Implementation Decisions

### Retry execution model (QUEUE-01, QUEUE-02, QUEUE-03)
- **D-01:** **No `chrome.alarms`.** Backoff retries (2s / 8s / 30s) fire via in-session `setTimeout` on a best-effort basis (the SW typically stays warm across the short 2s/8s gaps, and an in-flight retry keeps it alive). If the SW dies before a scheduled retry fires, the entry stays on disk and is picked up by the drain. Rationale: `chrome.alarms` has a ~30s minimum (can't express 2s/8s anyway), requires adding the `alarms` permission — a manifest change that triggers CWS/AMO re-review and a user permission re-prompt, directly colliding with this milestone's store-compliance focus. Neither manifest currently declares `alarms`. This satisfies SC4 (in-session 2s/8s/30s backoff while the SW is alive) and SC3 (retry on next `onStartup`) literally.
- **D-02:** **Opportunistic drain on any SW wake.** The queue is drained not only on `chrome.runtime.onStartup` / `onInstalled` (the documented triggers — onStartup fires only on browser restart) but also whenever the SW is already awake handling any event (the next citation/message event, or the next `SUBMIT_REPORT`). This makes the queue self-healing during normal use, so a failed report in a never-restarted browser doesn't sit until its TTL expires.
- **D-03:** **Per-entry retry state persisted on disk.** Each `bugReportQueue` entry carries its own `attemptCount` and `nextAttemptAt` (and an enqueue timestamp for TTL). Drains honor `nextAttemptAt` so the backoff schedule is NOT reset across SW deaths or across drain triggers — backoff progresses correctly even though the timer that would have fired in-memory was lost.
- **D-04:** Failure handling per QUEUE-03: 4xx **except 429** → permanent drop, no retry (the payload is malformed and won't succeed; aligns with Phase 1 D-02's choice that a dedup hit returns **200**, so a 200 is success, never a 4xx-drop). 429 → retry with full backoff. 5xx → retry with backoff. Network/fetch-throw → retry with backoff. After 3 attempts → dropped silently.

### Rate-limited disposition (LIMIT-03)
- **D-05:** **The rate-limit check runs FIRST** — before any disk write to `bugReportQueue` and before any fetch. On ceiling hit (6th submit within the 10-min window), the report is **dropped entirely**: no queue write, no Worker invocation, no retry. The background returns a `rateLimited` result and the caller shows the LIMIT-03 toast ("Too many reports in a short period — please wait a few minutes"). Matches SC2 literally ("no Worker invocation occurs") and treats burst-spam as intentional self-throttling. The window array (`bugReportRateLimitWindow`) is pruned on each attempt; a successful (non-blocked) submit appends its timestamp.

### Toast feedback ownership (QUEUE-04, LIMIT-03)
- **D-06:** **Background owns all logic + storage; the content-script caller renders all toasts.** The background (rate-limit check, queue write, fetch, drain) is the single source of truth for `bugReportRateLimitWindow` and `bugReportQueue`. It returns a structured result to the `sendMessage` caller — `{ ok, queued, fingerprint, rateLimited, dropped }` — and the content-script caller maps that result to the correct toast, reusing the existing `citation-ui.js` success/failure toast styling.
- **D-07:** **Background-initiated retries are silent.** `onStartup` / `onInstalled` / opportunistic-drain retries have no `sendMessage` caller and therefore no UI surface, so they render no toast regardless of outcome — consistent with QUEUE-04's "no toast on permanent-drop, failure adds noise." The three QUEUE-04 toast states (success / queued-for-retry / silent-drop) are thus all driven by the *synchronous* submit's returned result, not by later background retries.
- **D-08:** The return shape is a **superset of XPORT-05's `{ ok, queued, fingerprint }`** — `rateLimited` and `dropped` flags are added so the caller can distinguish the LIMIT-03 toast from the queued-for-retry toast. Accepted refinement of XPORT-05's contract, not a change to its intent.

### Verification approach (XPORT-06, QUEUE-01..04, SC1..4)
- **D-09:** **Per-target Vitest** (`vitest.config.chrome.js` + `vitest.config.firefox.js`, already wired as `test:chrome` / `test:firefox`) drives the `MSG.SUBMIT_REPORT` handler directly — no UI — with a mocked `chrome.storage.local` and `vi.useFakeTimers()` for the 2s/8s/30s backoff. **SW termination is simulated** by discarding the module's in-memory state and re-invoking the `onStartup` drain handler against the persisted `chrome.storage.local`, asserting the queued report survives and is retried (SC3). XPORT-06's "no `fetch(WORKER_REPORT_URL` in `src/content/`" guard is a Vitest static-grep assertion (SC1). Fast, deterministic, CI-friendly, matches existing patterns.
- **D-10:** **Live, manual SW stop+restart is NOT a Phase 3 deliverable** — it is deferred to Phase 5 UAT-05 (the milestone DoD's manual cross-browser termination test). Phase 3 proves the logic; Phase 5 proves it in a real browser.

### Claude's Discretion
- Exact `setTimeout` wiring / whether to keep the SW alive during a short backoff gap, within the D-01 best-effort model.
- Concurrent read-modify-write protection on `bugReportQueue` / `bugReportRateLimitWindow` (the SW already uses a mutex pattern, e.g. `creatingOffscreen`) — pick the simplest correct approach.
- Queue cap-20 eviction ordering and 7-day TTL pruning timing (on enqueue vs on drain vs both), within QUEUE-02.
- How the Bearer `PROXY_TOKEN` header is sourced for the background fetch (follow the existing Worker-call convention in the codebase; the token already ships embedded per Phase 1 D-01).
- Exact toast-result→message mapping and the internal structure of the shared submit/drain helper.
- Vitest file layout and how the `chrome.storage.local` mock is built (follow existing `tests/unit/` chrome-stub patterns).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap (authority order: REQUIREMENTS.md wins on conflicts)
- `.planning/REQUIREMENTS.md` — Phase 3 requirement text: XPORT-05 (identical handler both targets, fetch shape, return contract), XPORT-06 (content scripts never POST cross-origin; static-grep guard), LIMIT-03 (sliding-window rate limit, `bugReportRateLimitWindow`, toast text), QUEUE-01..04 (disk-first queue `bugReportQueue`, retry policy, failure handling, toasts). **Authority on the queue key name (`bugReportQueue`) and the LIMIT-03 toast string.**
- `.planning/ROADMAP.md` Phase 3 — the 4 Success Criteria (SC1 background-only fetch + static-grep, SC2 5th-ok/6th-blocked/7th-after-window + no Worker invocation, SC3 disk-first survives SW termination + retried on onStartup, SC4 4xx-drop / 5xx-3×-backoff / 429-retry).
- `.planning/research/STACK.md` — the Chrome official-docs constraint cited by XPORT-06 (content scripts must not make cross-origin POSTs; route through background).
- `.planning/research/PITFALLS.md` / `.planning/research/ARCHITECTURE.md` — MV3 SW-termination rationale behind the disk-first queue design.

### Prior-phase decisions carried in
- `.planning/phases/01-worker-route-kv-schema-privacy-compliance-groundwork/01-CONTEXT.md` — D-01 (`/report` sits behind the Bearer `PROXY_TOKEN` gate → background fetch needs `Authorization: Bearer`), D-02 (dedup hit returns **HTTP 200** `{ok:true, deduped:true}` → treated as success, never a client retry), D-09 (Worker 400 on malformed → QUEUE-03 4xx permanent-drop), D-10 (64KB cap → 413). The `X-PCT-Test-Mode` header pattern (suppresses KV writes) is available if a live test ever needs a dry-run.
- `.planning/phases/02-shared-constants-pure-payload-builder/02-CONTEXT.md` — `MSG.SUBMIT_REPORT`, `WORKER_REPORT_URL = https://pct.tonyrowles.com/report`, `REPORT_CATEGORIES` are importable from `src/shared/constants.js`; `buildReportPayload()` exists and is pure. Phase 3 consumes these; it does NOT build payloads (Phase 4 owns the live-context builder call + numeric→tier mapping).

### Schema contract
- `worker/src/report-schema.md` — the KV field allowlist the payload conforms to; the background sends the payload as-is and never adds `ip`/`clientIp`/`userAgent` (PAY-03 forbidden fields are the builder's concern, but the transport must not reintroduce them).

### Files this phase modifies / touches
- `src/background/service-worker.js` — Chrome SW; existing `chrome.runtime.onMessage` dispatch at line 132, `onInstalled` at line 84, `chrome.tabs.sendMessage` pattern at 121/446/462. Add the `MSG.SUBMIT_REPORT` branch + `onStartup` listener (none exists today) + shared submit/drain logic.
- `src/firefox/background.js` — Firefox background (event page); existing `onMessage` dispatch at line 106, `onInstalled` at line 60. Add the IDENTICAL `MSG.SUBMIT_REPORT` branch + drain wiring.
- `src/shared/` — likely home for a shared submit/queue/rate-limit helper module imported by both backgrounds (keeps XPORT-05's "identical dispatch shape" DRY); follow the existing `src/shared/*.js` pure-ish pattern.
- `vitest.config.chrome.js` / `vitest.config.firefox.js` + new test files under `tests/` — per-target suites (D-09).

### Verification context
- `vitest.config.chrome.js`, `vitest.config.firefox.js`, root `vitest.config.js` — the three extension Vitest configs (`test:src` / `test:chrome` / `test:firefox`).
- `tests/unit/*.test.js` — existing `chrome.storage` / `vi.fn` / `vi.stubGlobal` mock patterns to mirror (e.g. `e2e-report-issue.test.js`, `auto-fix.test.js`).
- `tests/e2e/` (Playwright) — the golden-baseline E2E harness; **out of scope for Phase 3 verification** per D-10 (live SW termination is Phase 5 UAT-05).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/content/citation-ui.js` — `showSuccessToast()` (line 311, `.cite-toast-success`) and `showFailureToast()` (line 354, `.cite-toast-failure`) + their CSS (`getSuccessToastCSS` 515, `getFailureToastCSS` 539) are the existing yellow/green toast styling QUEUE-04 mandates reusing. The content-script caller renders report toasts through these (D-06).
- `chrome.storage.local.get/set` is used throughout `src/background/service-worker.js` (e.g. `currentPatent` persistence at 171/206/249) — the same API backs `bugReportQueue` and `bugReportRateLimitWindow`.
- The `creatingOffscreen` mutex pattern (service-worker.js ~line 90) is a precedent for serializing concurrent storage read-modify-write if needed.

### Established Patterns
- Both backgrounds dispatch on `message.type` in a single `chrome.runtime.onMessage.addListener` (`if/else if` chain) — `MSG.SUBMIT_REPORT` is a new branch in each, NOT a router refactor. Async handlers `return true` to keep the sendResponse channel open (service-worker.js:155).
- `chrome.tabs.sendMessage(tabId, …)` is how the background pushes back to a content script (service-worker.js:446/462) — but the report flow uses the `sendResponse` return value of the SUBMIT_REPORT message instead, so the caller gets the result inline (D-06).
- Shared logic lives in `src/shared/` and is bundled per-target by esbuild (IIFE for content, ESM for background). A shared report-transport helper keeps Chrome and Firefox byte-identical per XPORT-05.
- **No `onStartup` listener exists anywhere yet** — Phase 3 introduces the first one (for queue drain).

### Integration Points
- **Upstream:** content script (Phase 4) calls `chrome.runtime.sendMessage({ type: MSG.SUBMIT_REPORT, payload })` where `payload` = `buildReportPayload(...)` output (Phase 2). Phase 3 must accept that exact shape.
- **Downstream:** the Worker `/report` endpoint (Phase 1) is the fetch target; its 200/201/4xx/429/5xx responses drive the D-04 retry/drop logic.
- **Caller contract:** the `{ ok, queued, fingerprint, rateLimited, dropped }` return shape (D-08) is what Phase 4's dialog consumes to pick the toast and decide whether to close.

</code_context>

<specifics>
## Specific Ideas

- Queue key `bugReportQueue`, rate-limit key `bugReportRateLimitWindow` (REQUIREMENTS wins over ROADMAP's `reportQueue`).
- Backoff schedule literally 2s / 8s / 30s, max 3 attempts, queue cap 20 (drop oldest), 7-day TTL.
- `setTimeout`-only in-session retry (no `chrome.alarms`, no new manifest permission) — this is a hard constraint born from the milestone's store-compliance posture, not just a convenience.
- Per-entry `{ payload, attemptCount, nextAttemptAt, enqueuedAt }` is the queue-entry shape (exact field names are Claude's discretion, but `nextAttemptAt` persistence is load-bearing for D-03).
- Toasts come exclusively from the synchronous submit's returned result; later background drains are silent (D-07).

</specifics>

<deferred>
## Deferred Ideas

- **Live manual SW stop+restart cross-browser test** — deferred to Phase 5 UAT-05 (milestone DoD), not a Phase 3 automated deliverable (D-10).
- **Numeric-confidence → `confidenceTier` mapping + live `context` capture** — Phase 4 (already noted in Phase 2's deferred list); Phase 3's handler is payload-agnostic transport.
- **`chrome.alarms`-backed durable retry** — explicitly rejected in D-01 (permission/store-review cost), not merely deferred. Revisit only if a future milestone adds `alarms` for another reason.

</deferred>

---

*Phase: 3-Background Submission Handler + Rate Limit + Retry Queue*
*Context gathered: 2026-06-13*

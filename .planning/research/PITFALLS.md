# Domain Pitfalls

**Domain:** v5.0 Bug Report Feature — adding unauthenticated user-feedback submission to a privacy-sensitive cross-browser MV3 extension with an existing Cloudflare Worker/KV backend
**Researched:** 2026-06-12
**Confidence:** HIGH for Pitfalls 1–4, 6–8, 10–11 (authoritative source or direct code read); MEDIUM for Pitfall 5 (CWS review patterns, multiple sources agree); MEDIUM for Pitfall 9, 12 (architecture-reasoned from observed patterns)

> **Scope note:** This document covers ONLY failure modes specific to adding the v5.0 bug-report feature to the existing extension/Worker/KV architecture. Generic web-app pitfalls are excluded. Each pitfall carries a phase-placement recommendation so load-bearing design decisions land in the earliest possible phase rather than being retrofitted.

---

## Critical Pitfalls

### Pitfall 1 (LOAD-BEARING): PII leakage via "diagnostic" payload fields that capture more than developers expect

**What goes wrong:**

The auto-captured payload collects selection text, URL, browser+OS, viewport/scroll position, XPath, and a settings snapshot. Each field individually looks benign. Together, they form a fingerprint that can identify individual users and expose legally-sensitive content.

The specific vectors for this extension:

**Selection text** — the user's highlighted text is a patent excerpt. If that excerpt appears in a pending (not yet published) application, filing it in an unencrypted bug report pipeline creates a potential prior-art disclosure vector. More concretely: patent professionals routinely work with confidential claim drafts and attorney work product. If the tool is used on a claims page, the selection text IS the confidential claim language. It should never be transmitted server-side without explicit user acknowledgment.

**URL query params** — `patents.google.com/patent/US12345678` is safe. But Google Patents search result URLs (`google.com/search?q=...`) and some navigated patent citation pages embed search terms and session parameters. The PROJECT.md "cosmetic-search query params could leak" note is correct. A naive `window.location.href` capture in the diagnostic bundle captures everything including `tbm=pts&q=...` search terms.

**Settings snapshot** — the settings capture includes citation format, trigger mode, prefix configuration. This is low-risk individually but constitutes behavioral profiling when combined with extension version and browser+OS. At scale, it makes user cohorts identifiable.

**IP address via Worker request** — the Cloudflare Worker automatically receives `request.headers.get('CF-Connecting-IP')`. This is a real IP address. If it is stored in KV alongside the report, it constitutes PII under GDPR for EU users (European Court of Justice ruling confirmed IP = personal data). The existing Worker presumably does NOT store the caller's IP for the KV patent cache; the bug report KV writes would be the FIRST place IP could be captured server-side.

**User-agent as fingerprint component** — `navigator.userAgent` + viewport width + scroll position is a classic browser-fingerprint triple. Combined with selection text hash, this is nearly unique per user. The PROJECT.md notes "browser fingerprinting via user-agent + viewport combo" — this is a real risk even if each field seems innocuous.

**Warning signs:**
- The payload preview in the expandable disclosure shows raw `window.location.href` rather than a sanitized version
- The KV write in the Worker stores `request.headers.get('CF-Connecting-IP')` in the record
- The settings snapshot object is captured via `JSON.stringify(settings)` without a field allowlist
- `navigator.userAgent` appears in the diagnostic bundle alongside viewport dimensions

**Prevention strategy:**

1. **Selection text: show before transmit, never auto-transmit silently.** The expandable payload preview (already in PROJECT.md spec) is load-bearing — users MUST see the selection text before submitting. For a patent attorney audience, "you are about to send this patent text to a server" is not optional disclosure. Do NOT add a "skip preview" option for power users.

2. **URL: strip query params server-side AND client-side.** On the client: `new URL(url).origin + new URL(url).pathname` — strip everything after `?`. On the Worker: validate that the URL is `patents.google.com/patent/US*` before storing. If the URL doesn't match the expected pattern, store the pattern-masked version (`patents.google.com/patent/[redacted]`) and log the anomaly separately.

3. **Settings snapshot: explicit allowlist, not JSON.stringify(settings).** Capture only: `{ triggerMode, citationFormat, prefixEnabled }`. Do NOT capture any field that could contain user-typed content (custom prefix text, etc.).

4. **IP address: do NOT store in KV.** The Worker uses the IP for rate-limiting (a transient decision, never persisted) and NOTHING ELSE. The KV record schema must not include an `ip` or `clientIp` field. This is a design constraint that must be locked in Phase 1.

5. **User-agent + viewport: include ONLY browser family + major version.** `navigator.userAgent` is replaced with a parsed `{ browser: 'Chrome', browserVersion: '124', os: 'macOS' }` object. Exact UA string is discarded. Viewport dimensions should be bucketed to the nearest 100px, not exact.

6. **Selection text for confidential excerpts: offer redaction option.** The expandable preview should have a "[Remove selection text from report]" toggle. Default: included (maintainers need it for debugging). One-tap opt-out: excluded. Store as `{ selectionText: "[redacted by user]" }` in KV when excluded. The user's choice persists for the session, not permanently.

**Phase placement:** Phase 1 (payload schema design). The field allowlist and redaction controls are load-bearing and cannot be retrofitted without changing the KV schema. Lock the exact payload schema in Phase 1 before building any other component.

---

### Pitfall 2 (LOAD-BEARING): Discord webhook URL embedded in extension code is public — anyone who downloads the extension can spam your Discord channel

**What goes wrong:**

The extension source code is publicly visible on the Chrome Web Store and Firefox AMO after submission. Any string literal that looks like `https://discord.com/api/webhooks/<id>/<token>` in the extension bundle can be extracted in under 60 seconds by anyone who downloads the CRX/XPI and runs `strings` on it.

Once the webhook URL is known:
- Automated spam scripts can flood your Discord channel with fake reports
- Competitors or bad actors can DDoS your notification channel, making it useless for triage
- Discord cannot rotate webhook URLs without destroying all existing integrations — you would have to create a new webhook, update the Worker, and redeploy, losing notification continuity

The naive implementation: the extension posts directly to `https://discord.com/api/webhooks/...`. This is the single most common mistake in extension-based notification systems, and it is the explicit design constraint called out in PROJECT.md: "Webhook URL must NEVER be embedded in extension code."

**Warning signs:**
- Any PR that adds a `DISCORD_WEBHOOK_URL` or similar constant to extension source files
- The submission endpoint in the extension is `https://discord.com/api/webhooks/...` rather than the existing Worker URL
- A PR that adds `host_permissions` for `discord.com` to the manifest

**Prevention strategy:**

1. **Architecture: extension → Worker → Discord.** The extension POSTs to `https://pct.tonyrowles.com/report` (the existing Worker domain, already in `host_permissions`). The Worker receives the report, stores it in KV, then calls Discord. The Discord webhook URL lives exclusively in a Cloudflare Worker secret binding.

2. **Worker secret pattern (verified against Cloudflare docs):**
   ```
   npx wrangler secret put DISCORD_WEBHOOK_URL
   ```
   This stores the value encrypted at rest; it is NOT visible in the dashboard or `wrangler.toml` after creation. The Worker accesses it as `env.DISCORD_WEBHOOK_URL` in its fetch handler. Never write it in `wrangler.toml` plaintext — use the `wrangler secret put` CLI command or the Cloudflare dashboard Secrets UI.

3. **Never add `discord.com` to `host_permissions`.** The manifest adding `https://discord.com/*` would be a dead giveaway to CWS/AMO reviewers that the extension communicates directly with Discord. It is also a security signal that the extension bypasses the Worker intermediary.

4. **If the webhook URL ever leaks:** create a new Discord webhook immediately, update the Worker secret, redeploy. Do NOT try to "keep it secret" after exposure — rotate first.

**Phase placement:** Phase 1 (Worker endpoint + KV schema). The Worker → Discord routing is part of the new `/report` route. Secret binding setup is a deployment step that must happen before any UAT.

---

### Pitfall 3 (LOAD-BEARING): Chrome Web Store and Firefox AMO review rejection for user-data collection without required disclosures

**What goes wrong:**

Adding a feature that transmits user-selected text, URLs, and settings to a remote server is a significant privacy-surface change. Both stores have automated and human reviewers who check for undisclosed data collection. The failure modes:

**CWS (Chrome Web Store):**
- If `host_permissions` changes — the existing manifest already has `https://pct.tonyrowles.com/*`. If the new `/report` endpoint is on the SAME domain, no new `host_permissions` entry is needed. If it moves to a different domain, adding a new `host_permissions` entry mid-extension-lifecycle triggers enhanced review.
- The CWS program policies (updated May 22, 2025) require: (a) a privacy policy link in the developer dashboard, (b) if data handling is not "closely related to functionality described prominently in the Product's Chrome Web Store page," explicit in-product disclosure and user consent. The patent citation tool's listing does not currently mention bug reporting — the listing text must be updated alongside the feature.
- The Limited Use policy compliance statement must appear on the extension's homepage or one-click-away page (GitHub Pages privacy policy at `/docs/privacy/`).

**Firefox AMO:**
- As of November 3, 2025, all new Firefox extensions MUST declare `data_collection_permissions` in `browser_specific_settings.gecko`. The existing manifest.firefox.json already has `data_collection_permissions: { required: ["none"], optional: [] }`. Adding bug-report data transmission REQUIRES updating this to declare the actual data types being collected.
- The Firefox add-on data classification taxonomy values applicable to the bug-report feature:
  - `"websiteContent"` — covers the selected patent text (content from a webpage)
  - `"websiteActivity"` — covers the Google Patents URL
  - `"technicalAndInteraction"` — covers extension version, browser+OS, settings snapshot, error logs
- The updated manifest entry should be:
  ```json
  "data_collection_permissions": {
    "required": ["websiteContent", "websiteActivity", "technicalAndInteraction"],
    "optional": []
  }
  ```
  Note: `"required"` means "transmitted as core functionality" — since the report always includes these data types when submitted, they belong in `required`, not `optional`. Setting them as `optional` when they are always transmitted is a policy violation.
- AMO's automated scanner (`addons-linter`) will flag `data_collection_permissions: { required: ["none"] }` as inconsistent with a fetch to `pct.tonyrowles.com` that transmits content. This will trigger human review.
- AMO's `web-ext lint` is run locally by developers and in CI. The existing CI (`FOX-06` — `web-ext lint` zero warnings) must continue to pass after the manifest change.

**Privacy policy update:** The existing GitHub Pages privacy policy (`docs/privacy/index.html`) does NOT mention voluntary bug reporting or diagnostic data transmission. It must be updated to describe: what data the report contains, who receives it (maintainer only), retention period (KV TTL or manual deletion), and how to request deletion (email).

**Warning signs:**
- A PR that changes `data_collection_permissions` in manifest.firefox.json from `["none"]` to something else but does NOT update the privacy policy text
- A PR that adds the report UI without updating the CWS listing description to mention bug reporting
- The `web-ext lint` CI job starts emitting a warning about undeclared data collection
- A CWS review rejection email citing "insufficient disclosure of user data handling"

**Prevention strategy:**

1. Update `manifest.firefox.json:browser_specific_settings.gecko.data_collection_permissions` in the same PR that ships the report endpoint.
2. Update the GitHub Pages privacy policy page (`docs/privacy/index.html`) in the same PR.
3. Update the CWS listing description to add a sentence about the bug-report feature (can be done via the Developer Dashboard after submission, but should be prepared in advance).
4. The existing `privacy_policy` URL in the CWS listing already exists from v1.2. Verify it resolves and reflects the updated policy before the PR is submitted to CWS.
5. No new `host_permissions` are needed IF the report endpoint is on `pct.tonyrowles.com` (already listed). Confirm this with the Worker routing design.

**Phase placement:** Phase 1 (manifest + privacy policy updates). These changes must land in the same commit as the Worker endpoint. A manifest that has `data_collection_permissions: ["none"]` while the Worker route exists is a reviewable contradiction.

---

### Pitfall 4: Worker URL abuse — rate limiting an unauthenticated public endpoint

**What goes wrong:**

The Worker URL (`https://pct.tonyrowles.com/report`) is necessarily public — the extension calls it directly. There is no authentication token. Any bot or script that discovers the URL can flood it.

**Two categories of abuse:**

1. **Accidental:** a retry loop in the extension that fails to detect permanent failure and retries indefinitely. At 5 retries × N concurrent users, this can hit the Cloudflare free-tier 100K/day Worker limit quickly.

2. **Intentional:** a bot script calling the endpoint directly to exhaust KV write quota (1,000 writes/day on free tier) or to spam the Discord notification channel.

The realistic abuse scenario for a niche professional tool: the accidental-retry case is more likely than targeted attack. The tool has a small user base of patent professionals who are unlikely to be adversarially targeted. However, the KV write limit (1,000/day) is the tightest constraint — with dedup, each new fingerprint (patent# + category + selection hash) consumes one KV write. 1,000 writes = 1,000 unique reports per day, which is high for the actual user base but reachable if a bug trigger causes rage-click loops.

**Warning signs:**
- KV write quota exhaustion alert (Cloudflare dashboard)
- Discord channel flooded with identical or near-identical reports
- Worker CPU time limit hits (10ms/invocation on free tier) due to high request volume

**Prevention strategy:**

1. **Client-side rate limit (extension storage, persisted):** ~5 reports per 10 minutes per install, stored in `chrome.storage.local` under a key with ISO timestamp. This is already in the PROJECT.md spec. Critical implementation requirement: the rate limit check must happen BEFORE showing the submit button as active, not just at submit time. If the user is rate-limited, the submit button shows "Try again in X minutes" — do not silently drop the report.

2. **Server-side fingerprint dedup (KV, already planned):** Worker computes `hash(patentNumber + category + sha256(selectionText.slice(0,100)))` and checks for an existing KV key in a 30-minute window before writing. If a duplicate fingerprint exists within the window, return HTTP 200 (to avoid triggering client retry) but do NOT write to KV or notify Discord.

3. **Server-side IP-based rate limit (Worker + KV):** Use `CF-Connecting-IP` header for transient rate-limiting ONLY — never store the IP in the report KV record. Pattern: `ratelimit:${ip}` key in a separate KV namespace (or the same namespace with a `rl:` prefix) with a 1-minute TTL and max-count of 10. If exceeded, return HTTP 429 with `Retry-After: 60`. The extension must handle 429 gracefully (do not retry within the Retry-After window).

4. **For v1: no Cloudflare Turnstile.** As stated in PROJECT.md, adding Turnstile only if abuse surfaces. The above three layers are sufficient for v1. Turnstile requires an additional Cloudflare product binding and adds friction to the submit flow.

5. **CPU time guard:** the Worker's report handler must complete within 10ms of CPU time (free tier limit). The `fetch()` call to Discord is async fire-and-forget — use `ctx.waitUntil(discordFetch)` rather than awaiting it in the main handler, or the CPU budget is consumed by network wait time. KV write is also async; use the same `waitUntil` pattern.

**Phase placement:** Phase 2 (Worker endpoint implementation). Rate limiting is part of the endpoint, not an add-on. The fingerprint dedup is a co-design with the KV schema (Phase 1 payload schema).

---

## Moderate Pitfalls

### Pitfall 5: CWS/AMO review pushback for adding `host_permissions` or changing manifest mid-lifecycle

**What goes wrong:**

Adding a new `host_permissions` entry to an already-published extension is a significant permission change that triggers manual review. The existing manifest already includes `https://pct.tonyrowles.com/*` — if the report endpoint is on this domain, NO new `host_permissions` entry is needed, and this pitfall is fully avoided.

If the report endpoint is on a DIFFERENT domain (e.g., a dedicated subdomain `https://reports.pct.tonyrowles.com/*`), a new `host_permissions` entry is required. CWS and AMO both treat new `host_permissions` additions as security-sensitive changes requiring justification.

**Prevention strategy:** Route the new `/report` endpoint on the EXISTING Worker domain (`pct.tonyrowles.com`) as a new path on the existing Worker. This requires zero manifest changes for the `host_permissions` section. The permission justification for `pct.tonyrowles.com` is already in the store listing ("USPTO proxy and shared patent cache"). Add "bug report submission" to the justification text at update time.

**Phase placement:** Phase 1 (Worker routing design). Confirm the route is on the existing domain before any manifest changes are drafted.

---

### Pitfall 6: MV3 service-worker termination kills the retry queue in Chrome

**What goes wrong:**

Chrome MV3 service workers are terminated after ~30 seconds of inactivity. Any retry queue held in memory (a `pendingReports` array in the service worker's global scope) is silently dropped when the SW is killed. The user gets no feedback, the report is lost.

Additionally, the SW can be killed between the moment the user submits the report and the moment the fetch completes if the network call takes longer than 30 seconds (unlikely for a report POST, but plausible on a slow connection).

**Warning signs:**
- A PR that stores the pending retry queue in a `let pendingReports = []` in `service-worker.js` without persistence to `chrome.storage.local`
- Retry logic that only runs when the popup is open (the popup's lifecycle is even shorter than the SW's)
- The retry loop uses `setTimeout` or `setInterval` without a `keepAlive` mechanism

**Prevention strategy:**

1. **Disk-first model:** Any undelivered report is written to `chrome.storage.local` immediately upon the user tapping submit, BEFORE the fetch attempt. Key: `bugReport:pending:${timestamp}`. The fetch is the delivery attempt, not the record creation.

2. **Retry on SW wake:** The service worker's `activate` and `message` event handlers check `chrome.storage.local` for pending reports on startup. This means retry happens whenever the SW restarts (browser start, extension reload, any extension event firing). This is the correct trigger — NOT a polling interval.

3. **Firefox difference:** Firefox MV3 uses a non-persistent event page (background script), not a true service worker. Event pages persist longer than Chrome SWs but can still be terminated. The same disk-first pattern applies. Firefox does NOT have `chrome.storage.session` (added in Chrome 102); use `chrome.storage.local` for the queue on both platforms.

4. **Retry limit:** after 3 failed attempts, mark the report as `bugReport:failed:${timestamp}` and stop retrying. Log a console warning. Do not retry indefinitely — if the Worker is permanently down, an infinite retry loop will fire every time the extension loads.

5. **chrome.storage.local quota:** Chrome: 10MB default (since Chrome 114; was 5MB). Firefox: tied to IndexedDB quota (effectively disk-based, much larger). A bug report payload is ~5-10 KB. Even 100 queued reports = ~1MB, well within quota. Do NOT request `unlimitedStorage` — it is unnecessary and appears suspicious in review.

**Phase placement:** Phase 3 (extension-side submission UI and queue). The disk-first pattern is a design requirement, not an optimization — code the queue this way from the start.

---

### Pitfall 7: Discord embed payload overflow from large patent selection text

**What goes wrong:**

Discord embeds have hard character limits (verified from official docs):
- Total embed content across all embeds in one message: **6,000 characters**
- Individual embed description field: **4,096 characters**
- Field values: **1,024 characters each**
- Message content (outside embeds): **2,000 characters**

A patent selection text can easily be 500-2,000 characters. Combined with patent number, citation result, error log ring buffer, and settings, the 6,000-char total is reachable. Discord silently truncates or rejects messages that exceed limits — the Worker's Discord `fetch()` returns HTTP 400 with an error body, which is easy to miss if error handling is sloppy.

Additionally, free-text notes and patent selection text may contain Discord markdown: `**bold**`, `_italic_`, `[link](url)`, backtick code blocks, and `@everyone` mentions. Unescaped user text in embed `description` fields renders as markdown, which can cause channel formatting abuse and — critically — `@everyone` or role mentions if the selection text contains `@` followed by a role name.

**Warning signs:**
- Worker logs show HTTP 400 responses from Discord's API but the report was stored in KV (silent notification failure)
- Discord message renders garbled markdown from patent selection text
- The embed description field shows truncated text without any truncation indicator

**Prevention strategy:**

1. **Truncation before dispatch:** Truncate selection text to 800 chars max for the Discord notification. The full selection text is preserved in KV. Add a `[truncated]` suffix when truncated.

2. **Error log ring buffer:** limit to last 5 errors, max 100 chars each in the Discord embed. Full log is in KV.

3. **Sanitize user-provided free-text note:** escape `@` as `\@`, backticks as `\``, asterisks as `\*`. This prevents `@everyone` injection and formatting abuse from a user who types `**important**` in their note field.

4. **Sanitize selection text similarly** — but preserve readability. A simple escaping of `@`, `` ` ``, `_`, and `*` is sufficient. Do NOT HTML-encode (Discord is not HTML).

5. **Test the 400 path explicitly:** in the Worker unit test, mock Discord returning HTTP 400 and assert the Worker still returns HTTP 200 to the extension (the report is in KV; Discord failure is non-fatal) and logs the Discord error. The user must not see a failed submission when Discord is down.

6. **Discord rate limit (5 requests per 2 seconds per webhook):** for v1 user volume, this is not a concern. If more than 5 reports arrive in 2 seconds, the Worker should handle 429 from Discord via `waitUntil` with a brief delay, or simply log the failure and rely on KV as the durable record. Do not implement complex queue logic on the Worker side for v1.

**Phase placement:** Phase 2 (Worker endpoint). The truncation and escaping logic is part of the Worker's Discord dispatch function. Test the 400-response path before declaring the phase done.

---

### Pitfall 8: CORS configuration on the new Worker route blocking the extension fetch

**What goes wrong:**

Content scripts in MV3 extensions cannot make cross-origin requests directly — they must message-pass to the service worker/background script, which has `host_permissions` and can perform the fetch. If the report POST is made from the content script directly instead of the service worker, it will fail with a CORS error or a `blocked by CORS policy` error even with the correct `host_permissions` in the manifest.

This is a known MV3 CORS architecture issue: content scripts run in the page's origin context, not the extension's origin. The page origin (`patents.google.com`) does NOT have permission to fetch `pct.tonyrowles.com` — only the extension background (service worker) does.

On the Worker side, if the Worker returns no CORS headers (or the wrong headers), the service worker's fetch will succeed (it uses the extension origin, not the page origin), but a future change that moves the fetch to the content script will silently break.

**Warning signs:**
- The report submission fetch call is in `content-script.js` instead of `service-worker.js`
- The Worker's `/report` route does not include `Access-Control-Allow-Origin` headers
- Error: "Access to fetch at 'https://pct.tonyrowles.com/report' from origin 'https://patents.google.com' has been blocked by CORS policy"

**Prevention strategy:**

1. **Architecture: fetch in service worker, not content script.** The content script collects the diagnostic data and sends it to the service worker via `chrome.runtime.sendMessage`. The service worker performs the actual POST. This matches the existing extension architecture for the USPTO fallback fetch (already in service-worker.js).

2. **Worker CORS headers (defense-in-depth):** even though the service worker fetch doesn't technically need CORS headers (it uses the extension origin), add them to the `/report` route for future-proofing:
   ```
   Access-Control-Allow-Origin: chrome-extension://[extension-id]
   ```
   Or, more pragmatically for a non-sensitive endpoint:
   ```
   Access-Control-Allow-Origin: *
   ```
   The latter is fine for an unauthenticated report endpoint where there is no session cookie or auth token to protect.

3. **CSP note:** the existing Firefox manifest has `content_security_policy: { extension_pages: "script-src 'self' 'wasm-unsafe-eval'" }`. This CSP applies to extension pages (popup, options), not to the service worker's fetch. No CSP change is required for the report submission fetch.

**Phase placement:** Phase 3 (extension-side submission). The message-passing architecture must be established in the initial implementation. Retrofitting from content-script-fetch to SW-fetch requires touching more files.

---

### Pitfall 9: Trust/phishing — a malicious page triggers the Report flow with fabricated data

**What goes wrong:**

The Report dialog is shown by the content script injected into `patents.google.com`. A malicious page that somehow triggers the citation UI (or a page at a URL the extension runs on) could potentially invoke the report flow programmatically to submit fabricated data to the Worker.

For this extension, the content scripts only match `https://patents.google.com/patent/US*` — this is a tight match pattern. The attack surface is very narrow: a malicious page would need to be at exactly that URL structure, which means it would have to be hosted on Google's domain (not realistic for an attacker).

However, there is a subtler risk: a page on `patents.google.com` that injects script tags or manipulates DOM events could potentially trigger `chrome.runtime.sendMessage` calls if the content script listens for DOM events without checking the event's origin.

**Warning signs:**
- The report submission `chrome.runtime.sendMessage` handler in the service worker validates no fields from the message payload
- The submit button in the citation UI can be triggered via `element.click()` from page JavaScript (i.e., the Shadow DOM is not in closed mode, or the click handler is accessible)
- The report flow accepts the URL from the message payload rather than from `chrome.tabs.query` (maintainer-validated source)

**Prevention strategy:**

1. **URL from chrome.tabs.query, not from the content script.** The service worker should fetch the tab URL via `chrome.tabs.query({active: true})` rather than trusting the URL value passed in the `sendMessage` payload. The content script should not pass URL as data — the SW already has authoritative access to the tab URL.

2. **Existing Shadow DOM closed mode is sufficient.** The citation UI already uses Shadow DOM closed mode (per the Key Decisions in PROJECT.md). In closed mode, external JS cannot access the shadow root via `element.shadowRoot`. This prevents programmatic button clicks from page JavaScript.

3. **Require a user gesture for submission.** The submit button handler should verify it was invoked by a genuine user interaction (the browser's trusted-event flag). In practice, since the button is inside a closed Shadow DOM, this is already enforced — only real user clicks reach the handler. Document this assumption explicitly.

4. **Service worker message handler validation:** validate that the `sendMessage` origin is the extension itself. Chrome's `chrome.runtime.onMessage` only fires for messages from the same extension, so this is already enforced by the browser. No additional origin check is required. Document this so future developers don't accidentally open a `chrome.runtime.connectExternal` endpoint.

**Phase placement:** Phase 3 (extension-side UI). These are design-time decisions (closed Shadow DOM, URL from chrome.tabs). No special code is needed beyond following the existing extension architecture.

---

### Pitfall 10: Retry loop that never exits if the Worker endpoint returns permanent errors

**What goes wrong:**

The pending-report queue (Pitfall 6) retries on SW wake. If the Worker is permanently misconfigured (e.g., bad route, invalid KV binding, or the Worker domain changes), every report in the queue retries on every extension load indefinitely. If users have submitted 50 reports over several months, the queue grows without bound and each page load fires 50 failed requests.

A related failure: the retry loop retries on HTTP 4xx (client errors — malformed payload, invalid schema) as well as HTTP 5xx (server errors). An HTTP 400 due to a payload schema bug is NOT recoverable by retrying — it will fail forever.

**Warning signs:**
- The pending queue in `chrome.storage.local` grows monotonically and never empties
- Network tab shows repeated POSTs to `pct.tonyrowles.com/report` on every page load
- The Worker logs show a constant stream of HTTP 400 responses from the same extension install

**Prevention strategy:**

1. **Distinguish retryable from non-retryable failures:**
   - HTTP 5xx, network timeout, DNS failure: retryable
   - HTTP 4xx (except 429): non-retryable — move to `bugReport:failed:${timestamp}` immediately
   - HTTP 429 (rate limited): retryable after `Retry-After` period

2. **Max retry count = 3.** After 3 failed attempts (retryable or not), mark as failed and stop. Do not expose failed reports to the user — they are for maintainer investigation only (accessible via Debug Mode's "last N reports" view in the future).

3. **TTL on pending reports:** pending reports older than 7 days are dropped silently. A report that has been waiting 7 days is unlikely to be useful for debugging a current failure.

4. **Queue size cap:** maximum 20 pending reports in the queue. If the queue is full (20 items), the oldest pending report is dropped to make room for the new one. This prevents unbounded queue growth from a user who submits many reports without a network connection.

**Phase placement:** Phase 3 (extension-side submission). The retry policy must be implemented alongside the queue, not added later.

---

## Minor Pitfalls

### Pitfall 11: Cloudflare free-tier cost ceiling

**What goes wrong:**

The free tier limits are (sourced from `developers.cloudflare.com/workers/platform/pricing` and `developers.cloudflare.com/kv/platform/limits`, verified 2026-06-12):

| Resource | Free Tier Limit | Reset |
|----------|----------------|-------|
| Worker requests | 100,000/day | 00:00 UTC |
| Worker CPU time | 10ms/invocation | per-request |
| KV reads | 100,000/day | 00:00 UTC |
| KV writes | 1,000/day | 00:00 UTC |
| KV deletes | 1,000/day | 00:00 UTC |
| KV list operations | 1,000/day | 00:00 UTC |
| KV storage | 1 GB total | — |
| KV max value size | 25 MiB | — |

**Binding constraint for bug reports: KV writes at 1,000/day.** Each unique report (passing dedup) is one KV write. At 1 write per report, the ceiling is 1,000 unique reports per day before KV write quota is exhausted. For this extension's user base (patent professionals, not a mass-market app), this is extremely unlikely to be hit organically. Intentional abuse could hit it.

The existing Worker already uses KV for the patent position-map cache. The bug-report KV writes share the same daily quota. If the patent cache has heavy write traffic on the same day as a bug-report flood, the quotas compete. Consider using a separate KV namespace for bug reports to isolate quotas (though quotas are per-account, not per-namespace, so this is organizational rather than functional).

**Realistic ceiling:** 1,000 reports/day = never reached by organic usage. The dedup fingerprint (planned) further reduces real writes. The Worker CPU time (10ms/invocation) is the more likely constraint if the fingerprint hash computation or the Discord payload construction is expensive — keep the report handler under 5ms of CPU time.

**Prevention strategy:** Server-side dedup (Pitfall 4) is the primary protection. No paid-tier upgrade is needed for v1.

**Phase placement:** Phase 2 (Worker). Keep the report handler CPU-lean (no synchronous computation, async KV writes via `waitUntil`).

---

### Pitfall 12: Architectural debt — adding new patterns that conflict with the existing extension architecture

**What goes wrong:**

The existing extension has established patterns:
- State persistence: `chrome.storage.local` (not a new state store)
- Cross-origin fetches: service worker background, never content script
- UI isolation: Shadow DOM closed mode
- Error logging: existing `console.error` patterns in content script
- IndexedDB graceful degradation: `idbAvailable` flag, silent fallthrough

The report feature is the FIRST time the extension sends data FROM the user TO the server (all previous Worker calls are the extension REQUESTING data). This inversion creates temptation to add new infrastructure: a separate fetch wrapper, a new logging system, a new analytics-style state store. None of these are necessary.

**Warning signs:**
- A PR adds a new `lib/report-client.js` abstraction with its own `fetch` wrapper when the existing `fetch` in service-worker.js is sufficient
- A PR adds a new `state.js` module for managing report queue state when `chrome.storage.local` is the existing state store
- A PR adds a new error boundary system for the report dialog when the existing `try/catch` pattern is sufficient

**Prevention strategy:**

1. **Reuse chrome.storage.local** for the report queue. Do not add a new IndexedDB table for reports — IDB is used for patent position maps (large structured data). Reports are small JSON objects; `chrome.storage.local` is the right store.

2. **No new fetch wrapper.** The service worker already fetches from `pct.tonyrowles.com` for the USPTO fallback. The report submission is a second endpoint on the same Worker. Use the same `fetch()` call pattern.

3. **No new logging system.** The "recent error log ring buffer" specified in PROJECT.md should capture from `console.error` (or an existing error event handler) — not from a new wrapper that intercepts all console calls.

4. **The report dialog extends the existing Shadow DOM citation UI.** The report button and category picker are new UI elements inside the existing citation-result Shadow DOM component. They do not introduce a new Shadow DOM root, a new iframe, or a new isolated context.

5. **Zero new npm dependencies** (sixth consecutive milestone per PROJECT.md). This constraint rules out form-validation libraries, analytics SDKs, and retry-logic libraries. All are replaceable with ~20 LOC each in the existing style.

**Phase placement:** Phase 3 (extension-side UI). Architecture review in the phase plan should explicitly list which existing patterns the new code follows.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Phase 1: Payload schema + KV design | Pitfall 1 (PII in fields) + Pitfall 3 (manifest/privacy policy) | Lock field allowlist; update manifest + privacy policy in same commit |
| Phase 1: Worker routing | Pitfall 5 (new host_permissions) | Route on existing `pct.tonyrowles.com` domain — no manifest change needed |
| Phase 2: Worker endpoint | Pitfall 2 (webhook URL) + Pitfall 4 (abuse/rate limit) + Pitfall 7 (Discord limits) + Pitfall 11 (cost ceiling) | `wrangler secret put` for Discord URL; server-side rate limit + dedup; truncate payloads; CPU-lean handler |
| Phase 3: Extension-side submission UI + queue | Pitfall 6 (SW termination) + Pitfall 8 (CORS) + Pitfall 9 (trust) + Pitfall 10 (retry loop) + Pitfall 12 (arch debt) | Disk-first queue; SW-side fetch; closed Shadow DOM + URL from chrome.tabs; retry policy with max count + TTL; no new abstractions |
| Phase 4 (any): UAT before store submission | Pitfall 3 (AMO scanner) | Run `web-ext lint` locally with updated manifest; verify `data_collection_permissions` is correct before AMO submission |

---

## Design-In vs. Retrofit Flags

The following pitfalls **must be designed in** — they cannot be retrofitted without changing the KV schema, manifest, or privacy policy after initial deployment:

| Pitfall | Design-in requirement |
|---------|-----------------------|
| Pitfall 1 (PII) | Payload field allowlist (determines KV schema shape) |
| Pitfall 2 (webhook URL) | Worker → Discord routing (determines extension fetch target) |
| Pitfall 3 (CWS/AMO) | Manifest `data_collection_permissions` update + privacy policy update |
| Pitfall 6 (SW termination) | Disk-first queue design (`chrome.storage.local` key schema) |
| Pitfall 10 (retry loop) | Retry policy (max retries, TTL, non-retryable HTTP codes) |

---

## Sources

- `developers.cloudflare.com/kv/platform/limits` — KV free tier limits: 100K reads/day, 1K writes/day, 1K deletes/day, 1K list/day, 1 GB storage, 25 MiB value. Verified 2026-06-12. (HIGH confidence)
- `developers.cloudflare.com/workers/platform/pricing/` — Worker free tier: 100K requests/day, 10ms CPU/invocation. Verified 2026-06-12. (HIGH confidence)
- `developers.cloudflare.com/workers/configuration/secrets/` — Secret binding pattern: `wrangler secret put <KEY>`; encrypted at rest, not visible in dashboard after creation. (HIGH confidence)
- `birdie0.github.io/discord-webhooks-guide/other/rate_limits.html` — Discord webhook rate limit: 5 requests per 2 seconds per webhook. (MEDIUM confidence — community docs, consistent with Discord API docs)
- `discord-webhook.com/en/blog/discord-webhook-embed-limits/` — Discord embed limits: 6,000 chars total, 4,096 chars description, 1,024 chars field value, 2,000 chars message content. (MEDIUM confidence — cross-checked with Discord Webhooks Guide)
- `developer.chrome.com/docs/webstore/program-policies/user-data-faq` — CWS: privacy policy required if any data transmitted; Limited Use compliance statement required; in-product consent required if data handling not "closely related to functionality described prominently." Updated May 22, 2025. (HIGH confidence)
- `blog.mozilla.org/addons/2025/10/23/data-collection-consent-changes-for-new-firefox-extensions/` — Firefox: `data_collection_permissions` required in manifest for all new extensions as of November 3, 2025. (HIGH confidence)
- `extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/` — Firefox taxonomy values: `"websiteContent"`, `"websiteActivity"`, `"technicalAndInteraction"` applicable to bug-report feature. (MEDIUM confidence — documentation page; taxonomy parsing applied from described categories)
- `developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage/local` — `chrome.storage.local` quota: 5MB Chrome (pre-114), 10MB Chrome 114+, Firefox: IndexedDB-equivalent. (HIGH confidence)
- WebSearch + chromium-extensions group — MV3 service worker termination ~30s inactivity; disk-first storage pattern required for retry queues. (MEDIUM confidence — multiple consistent sources)
- WebSearch — Discord markdown injection via `@everyone` in webhook payload; `allowed_mentions` recommended. (MEDIUM confidence — multiple consistent sources including Discord safety docs)
- Direct code read: `src/manifest.json` — existing `host_permissions: ["https://pct.tonyrowles.com/*"]` confirms no new host permission needed for same-domain report endpoint. (HIGH confidence)
- Direct code read: `src/manifest.firefox.json` — existing `data_collection_permissions: { required: ["none"] }` confirms manifest update is required when bug-report feature ships. (HIGH confidence)

---

*Pitfalls for: v5.0 Bug Report Feature — unauthenticated submission pipeline for cross-browser MV3 extension with Cloudflare Worker/KV backend*
*Researched: 2026-06-12*
*Confidence: HIGH on Pitfalls 1–4, 6–8, 10–11 (authoritative sources); MEDIUM on Pitfall 5 (CWS review patterns); MEDIUM on Pitfalls 9, 12 (architecture-reasoned)*

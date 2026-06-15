# Feature Research

**Domain:** In-product bug-report UX for a professional browser extension (Chrome + Firefox)
**Researched:** 2026-06-12
**Confidence:** HIGH for table stakes and privacy requirements; MEDIUM for specific category-picker labeling conventions (no single authoritative source; synthesized from multiple patterns)

---

## Scope Note

This document covers ONLY the NEW v5.0 features (in-product bug-report UX). The existing
citation result UI, toast notifications, options page settings, and extension infrastructure
are NOT re-researched — those are constraints anchored in:

- `src/content/citation-ui.js` — Shadow DOM popup components (showCitationPopup, showErrorPopup, showSuccessToast, showFailureToast)
- `src/content/content-script.js` — citation flow, `lastCitationResult` state, message handlers
- `src/options/options.js` — options page auto-save pattern, `chrome.storage.sync`
- `src/popup/popup.js` — toolbar popup status display
- `src/shared/constants.js` — MSG, STATUS, PATENT_TYPE
- `docs/privacy/index.html` — existing privacy policy (currently: "no personal data collected")

The existing privacy policy is a LOAD-BEARING constraint. Adding bug-report submission
introduces a FIRST transmission of user-supplied + auto-captured data to a developer server.
The privacy policy MUST be updated, and both CWS and AMO review processes have explicit
requirements for this. See "Privacy Disclosure" section below.

---

## Production Extension Survey

### How production extensions handle in-product bug reporting

**uBlock Origin**
- Trigger: "chat" icon in the popup toolbar (row of action icons below the main toggle)
- Affordance: always visible in popup when uBO is enabled on the page
- What it does: opens a structured GitHub issue form in a new tab via the
  "Report a filter issue" form (https://github.com/uBlockOrigin/uBlock-issues/wiki/The-%22Report-a-filter-issue%22-form)
- Auto-captured: current page URL (pre-filled)
- User fills: dropdown for address specificity, dropdown for issue type, NSFW checkbox
- Time in dialog: ~15-30 seconds (structured dropdowns, minimal free text)
- Requires: GitHub account — "uBO does not have a home server through which reports could be sent"
- Key lesson: **affordance always in popup, minimal friction, structured dropdowns route
  to correct issue tracker automatically**

**Grammarly**
- Trigger: no in-extension report button; routes to external support portal at support.grammarly.com
- User must manually describe the error and copy-paste the problematic text
- Zero auto-capture: burden entirely on user
- Key lesson: **this is the anti-pattern** — high friction, no auto-capture, out-of-product

**Jam (bug-reporting extension for devs)**
- Trigger: toolbar icon pinned to browser chrome
- Auto-captured: URL, browser type and version, device type, OS type and version,
  screen/viewport size, console logs, network requests, user events
- User fills: description + capture method (screenshot, video, instant replay)
- Time in dialog: ~30-60 seconds (select capture type, add description)
- Key lesson: **toolbar trigger + auto-capture of technical context is the baseline
  for professional bug-reporting tools**

**BetterBugs**
- Trigger: toolbar icon, opens step-by-step stepper inside popup
- Auto-captured: system info, console logs, network requests, device info, browser cookies,
  page navigation steps, devtools info
- User fills: title/summary, steps to reproduce, priority/assignee metadata
- Time in dialog: ~2-5 minutes (more structured, aimed at QA teams)
- Key lesson: **for end-user reports, BetterBugs-level detail is overkill; Jam-level is right**

**Windows Error Reporting (WER) — reference pattern**
- Trigger: automatic on application crash; no user decision needed for minimal report
- Consent model: "sends minimum required data to check for solutions automatically,
  then prompts for consent before sending additional data"
- Key lesson: **split minimum-always vs additional-with-consent is the correct model
  for failure auto-detection**

**Firefox built-in "Report a Site Issue"**
- Trigger: accessible through the extensions toolbar panel (unified extensions button)
- Auto-captured: page URL, browser version, optionally screenshot
- User fills: description of the issue
- Key lesson: **browser-native pattern validates toolbar-accessible affordance + minimal fields**

**Bitwarden / 1Password**
- No dedicated in-extension bug-report button; rely on external community forums
  (community.bitwarden.com) and support portals
- Key lesson: **established SaaS extensions route to external support; this is acceptable
  for those products but wrong for a solo-maintained professional tool that needs
  diagnostic data to fix edge cases**

### Summary of production extension patterns

| Dimension | Common Pattern | Outlier |
|-----------|----------------|---------|
| Trigger location | Popup toolbar icon / inline button in result UI | External support portal (Grammarly) |
| Time in dialog | 15-60 seconds | 2-5 min (BetterBugs — QA-focused) |
| Auto-capture | URL, browser+OS, version at minimum | Nothing (Grammarly), everything including network (Jam) |
| Category picker | 2-4 dropdowns or radio options | Free-text only |
| Submission confirmation | Toast or inline "submitted" message | Redirect to external page |
| Privacy disclosure | Inline text near submit button | Privacy policy link only |

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete or untrustworthy.

| Feature | Why Expected | Complexity | Existing Primitive to Reuse |
|---------|--------------|------------|------------------------------|
| **Report button in citation result UI** — appears in the existing Shadow DOM popup when confidence is yellow/red or citation fails (no-match, worker error) | User is already looking at the failure; they want a one-tap action there and then. Requiring them to open a separate page breaks the moment | MEDIUM | `src/content/citation-ui.js:showCitationPopup()` and `showErrorPopup()` — add button to existing DOM construction; same `getCitationHost()` Shadow DOM host |
| **Auto-captured core context** — patent number, Google Patents URL, selected text, returned citation (or no-match flag), confidence tier, extension version, browser+OS string | This is the diagnostic minimum without which no maintainer can reproduce the issue. Jam captures exactly this. Users expect "it just knows what was broken" | MEDIUM | `src/content/content-script.js:extractPatentInfo()` for patent ID/type; `navigator.userAgent` for browser+OS; `chrome.runtime.getManifest().version` for version; `lastCitationResult` state already contains citation + confidence |
| **Category picker with 4 options** — pre-set radio/button group, one tap required | Users do not write bug reports with full context. Structured categories route to correct triage class. 4 options is the sweet spot: fewer than 3 is too vague; more than 5 causes decision paralysis | LOW | No existing primitive; new DOM in Shadow DOM |
| **Optional free-text note field** — single-line or short textarea | Users occasionally have critical context ("this patent has special characters") that no auto-capture can detect | LOW | New DOM element; no existing primitive |
| **Inline privacy disclosure** — one-line "What's included" statement before the submit button | CWS and AMO both REQUIRE in-product disclosure before data transmission. Privacy policy link alone is insufficient per Chrome Web Store program policies: "The disclosure, however, must not be located only in a privacy policy" | LOW | New DOM text; update to `docs/privacy/index.html` required |
| **Submit confirmation toast** — "Report sent" transient feedback, auto-dismiss in 2-3s | Standard UX contract: users need confirmation that their tap did something. Toast is the established pattern in this codebase (`showSuccessToast`, `showFailureToast`) | LOW | `src/content/citation-ui.js` — add `showReportSubmittedToast()` following exact pattern of existing toast functions |
| **Toolbar popup fallback trigger** — a "Report a problem" link or button in the existing toolbar popup for "tool didn't load" cases where the citation UI never appeared | Users whose extension silently fails with no citation popup have no in-context affordance; toolbar popup is the fallback surface. uBlock Origin uses this pattern | MEDIUM | `src/popup/popup.html` + `src/popup/popup.js` — add to existing status display |
| **Client-side rate limit** — ~5 reports per 10 minutes per install, persisted in `chrome.storage.local` | Prevents accidental rage-click spam to the Cloudflare Worker. `chrome.storage.local` persists across browser restarts (per Chrome docs) | LOW | `chrome.storage.local` — same IDB-graceful-degradation pattern the codebase already uses for `currentPatent` state |
| **Settings snapshot in payload** — trigger mode, citation format (display mode), prefix toggle | Critical for reproducing class of issues where the problem only occurs in specific configuration (e.g., silent mode no-match). These are already in `chrome.storage.sync` | LOW | `src/content/content-script.js:cachedSettings` — already loaded from `chrome.storage.sync`; serialize to payload |

### Differentiators (Competitive Advantage)

Features that distinguish this tool's bug report UX from the production baseline.

| Feature | Value Proposition | Complexity | Existing Primitive to Reuse |
|---------|-------------------|------------|------------------------------|
| **Auto-surface on failure** — Report button/prompt appears automatically on no-match (red), yellow confidence (Tier 5 cap), and worker-fallback error, without user having to find it | Most extensions (uBlock, Bitwarden) only offer always-available affordances; user must choose to report. Auto-surface at the exact failure moment captures reports when frustration is highest and context is freshest | MEDIUM | `src/content/content-script.js:handleCitationResult()` — detect failure conditions already present (`message.error === 'no-match'`, confidence < 0.80, worker fallback flag); add Report button to existing `showErrorPopup()` / `showCitationPopup()` render path |
| **DOM/PDF diagnostics** — selected-node xpath, viewport/scroll position, PDF parse status | This is the differentiating diagnostic data vs every other extension. The v3.1 `llm-report.json` schema already captures `scroll_y`, `viewport_*`, `selected_node_xpath`. Reusing this schema directly means zero new field design | MEDIUM | `src/content/content-script.js:getSelectionContext()` for selection context; `window.scrollY` + `window.innerWidth/Height` for viewport/scroll; `currentPatent.status` from `chrome.storage.local` for PDF parse status |
| **Recent error log ring buffer** — last N console errors / extension-internal warnings captured in service worker, included in report payload | Patent parsing failures often produce console errors that are invisible to users. Sentry's breadcrumb pattern (auto-buffered events until an error is reported) is the industry model | MEDIUM | `src/background/service-worker.js` — add `console.error` interception + ring buffer in memory (last 10 entries); service worker already handles all message routing |
| **Expandable payload preview** — "View full payload" toggle in the report dialog shows exactly what JSON will be sent, field by field | Differentiates from competitors who only show a generic "we collect browser info" disclosure. Patent professionals (lawyers, agents) are privacy-sensitive. Showing the exact payload builds trust and satisfies CWS's "within the Product's user interface" consent requirement concretely | MEDIUM | No existing primitive; new DOM in Shadow DOM; JSON.stringify(payload) already available at send time |
| **Debug Mode toggle** — options-page toggle; when ON, Report button is always visible in citation result UI regardless of confidence outcome | Maintainer/power-user feature for testing the report flow and for users who want to report even high-confidence results that feel wrong | LOW | `src/options/options.js` + `chrome.storage.sync` — follows exact auto-save pattern of existing settings; Report button rendered based on `cachedSettings.debugMode` flag |
| **Local queue + retry on Worker failure** — failed submissions persist in `chrome.storage.local` and retry on next extension load | Matches existing graceful-degradation pattern (`idbAvailable` flag). Prevents lost reports when the Cloudflare Worker is briefly unreachable | MEDIUM | `src/background/service-worker.js` install/activate event — check for queued reports on startup; same `chrome.storage.local` pattern used for `currentPatent` |
| **Server-side fingerprint dedup** — Worker computes fingerprint (patent # + category + selection hash) and deduplicates within a time window in KV | Prevents same user reporting the same failure multiple times from filling KV with duplicate entries. Cloudflare KV `expirationTtl` handles time-window expiry natively | LOW (server-side only) | Existing Cloudflare Worker + KV infrastructure; new route, no client changes |

### Anti-Features (Commonly Requested, Often Problematic)

Features to explicitly NOT build in v5.0.

| Anti-Feature | Why It Seems Attractive | Why Problematic | What to Do Instead |
|--------------|------------------------|-----------------|---------------------|
| **Full screenshot capture** | Provides visual context for the failure | (a) Screenshots of Google Patents pages may contain confidential patent search queries or attorney work product. (b) Screenshot blobs are 100-500 KB; KV per-key limit is not designed for large blobs. (c) CWS/AMO escalate data-collection review for image capture. (d) Increases report bundle to problematic sizes for Discord notification | Use `selected_node_xpath` + viewport dimensions for context instead |
| **Full page DOM snapshot** | Complete rendering context | (a) DOM of a Google Patents page can be 1-2 MB. (b) Contains full patent text which may be PII-adjacent for attorney clients. (c) Triggers CWS `websiteContent` data category which requires prominent installation-time disclosure | Capture `selected_node_xpath` (single node identifier) and the selected text only |
| **IP address or geo-location** | Geographically-clustered failures | (a) IP address is personally identifying by definition. (b) AMO `locationInfo` category requires explicit opt-in consent. (c) Cloudflare Workers already receive the client IP via `request.headers.get('CF-Connecting-IP')` server-side — do NOT pass it through to the payload | Cloudflare Worker can log IP separately if needed; never embed in extension payload |
| **Browsing history or cross-tab context** | Might explain why the extension behaved differently | (a) AMO `browsingActivity` category = high-sensitivity; CWS classifies this as personal/sensitive user data. (b) `activeTab` permission only covers the current tab — accessing other tabs' data would require `tabs` permission, which triggers store review scrutiny | Limit context to the current Google Patents page only |
| **User email or account association** | Allows maintainer to follow up | (a) Collecting PII requires explicit opt-in per both AMO and CWS. (b) Adds account infrastructure that is out of scope. (c) Creates GDPR obligations. (d) Patent professionals are unlikely to want their identity associated with tool failure reports | Use anonymous install fingerprint (hash of extension ID + install timestamp) if follow-up correlation is needed |
| **Auto-send on failure without user tap** | Zero-friction capture | (a) Both CWS and AMO require "affirmative consent" before transmission of data not described as core functionality. Silent auto-send is a policy violation that can cause removal. (b) Even Windows Error Reporting (the canonical auto-send model) requires a user-facing modal before sending non-minimal data | Auto-surface the Report button; require one user tap to submit |
| **CAPTCHA** | Prevents abuse | Adds severe friction to voluntary reports; the 5/10min client-side rate limit + server-side fingerprint dedup is sufficient for v1 | Layer in ONLY if abuse materializes post-launch |
| **Promotion to GitHub Issues automatically** | Closes the loop immediately | Premature for v5.0; GitHub API credentials would need to be embedded or proxied; adds complexity. The v3.1 `lib/issue-payload-builder.js` is the eventual target but only after report volume is understood | Manual `gh issue create` from KV data; v5.1 auto-promotion |
| **Discord webhook URL in extension code** | Simpler implementation | Exposes the webhook to anyone who inspects the extension bundle. A malicious actor could spam the channel trivially | Webhook URL stays in Cloudflare Worker environment binding; extension only hits the Worker endpoint |
| **Sentry/third-party error tracking SDK** | Battle-tested auto-capture | (a) Zero new npm dependencies target (fifth consecutive milestone). (b) Sentry SDK in an extension context has known issues with shared-environment injection (see https://docs.sentry.io/platforms/javascript/best-practices/shared-environments/). (c) Sentry captures referrer URL, console logs including PII, and breadcrumbs by default — requires aggressive scrubbing configuration. (d) Adds 60-100 KB to bundle | Custom lightweight ring buffer + Worker endpoint; equivalent functionality, zero dependency cost |

---

## Category Picker: Recommended 4-Label Set

Research finding: the v5.0 PROJECT.md already specifies 4 categories. Research validates this count as optimal for the use case. Specific label copy recommendations:

### Recommended Labels

| Label | Maps to (internal) | When auto-selected? | Notes |
|-------|-------------------|---------------------|-------|
| **Inaccurate citation** | `WRONG_CITATION` | Yellow confidence (0.80-0.84, Tier 5 cap) | User got a citation but it's wrong. This is the highest-value failure mode for a legal-filing tool |
| **No match found** | `NO_MATCH` | Red confidence / no-match error | Extension ran but couldn't find the text in the PDF |
| **Tool not working** | `EXTENSION_NOT_LOADED` / `WORKER_FALLBACK_FAILED` | Worker-fallback error, PDF parse failure, "PDF not available" error | Covers all infrastructure failures |
| **Other** | `OTHER` | Never auto-selected | Catch-all; always available |

### Why these 4 labels (evidence from research)

- **"Bug" vs "Feedback" vs "Feature request" taxonomy** is wrong for this use case. A patent attorney filing a citation doesn't think in developer terms. They experienced a specific output failure class.
- **Outcome-focused labels** ("Inaccurate citation", "No match") map directly to the v3.1 `ERROR_CLASSES` taxonomy (`WRONG_CITATION`, `NO_CITATION_PRODUCED`) — direct path from user report to triage classifier.
- **"Other" is always included** across all surveyed tools (uBlock filter report type dropdown, BetterBugs category picker, every SaaS in-app feedback widget). Omitting it causes users to force-fit their problem into the wrong category.
- **4 categories** matches the PROJECT.md spec and is validated as the sweet spot by the in-app feedback research: fewer = too vague; more = decision paralysis.
- **Auto-selection** at the point the Report button appears provides a default without locking the user in — reduces interaction time to near-zero for the common case.

### What to avoid in label copy

- "Bug" — feels technical, not outcome-focused
- "Wrong answer" — ambiguous (wrong patent? wrong format?)
- "Error" — too generic
- "Feature request" — wrong venue; this is a bug reporter, not a feature board

---

## Privacy Disclosure: CWS + AMO Requirements

### Chrome Web Store (CWS) Requirements

Source: developer.chrome.com/docs/webstore/program-policies/user-data-faq (HIGH confidence — official docs)

The key requirement: **"The disclosure must not be located only in a privacy policy, terms of service, or similar document."**

For v5.0 bug reporting, the in-product disclosure must:
1. Appear within the Product's user interface (the report dialog)
2. Be presented prominently before the user agrees (before they tap Submit)
3. Require a specific action to agree (the Submit tap itself constitutes consent for voluntary user-initiated reports, per the "closely related to described functionality" carve-out IF the store listing describes bug reporting)
4. The privacy policy URL must be updated in the CWS Developer Dashboard to reflect the new data collection

**Recommended disclosure text** (one line, expandable for full payload preview):
> "What's included: Patent URL, selected text, citation result, confidence level, browser version, extension version, trigger mode. No personal information. [View full payload ▶]"

### Firefox AMO Requirements

Sources: extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/ + blog.mozilla.org/addons/2025/10/23/data-collection-consent-changes-for-new-firefox-extensions/ (HIGH confidence — official Mozilla docs, November 2025 effective date)

As of November 3, 2025, new Firefox extensions must declare `data_collection_permissions` in `browser_specific_settings.gecko.data_collection_permissions` in manifest.json. Since v5.0 is adding new data collection to an existing extension, Mozilla requires this field to be added when the extension is updated.

For the v5.0 bug-report payload, the required categories are:

```json
"browser_specific_settings": {
  "gecko": {
    "id": "patent-cite-tool@tonyrowles.com",
    "data_collection_permissions": {
      "required": ["technicalAndInteraction"],
      "optional": ["browsingActivity", "websiteContent"]
    }
  }
}
```

- `technicalAndInteraction` covers: "Device and browser info, extension usage and settings data, crash and error reports" — this covers extension version, browser/OS, settings snapshot, error logs
- `browsingActivity` covers: URLs visited — covers the current patent URL being reported
- `websiteContent` covers: page text, images — covers the selected text and citation result

**Critical AMO distinction**: voluntary user-initiated bug reports that transmit to a remote server still require the `data_collection_permissions` declaration. The FAQ confirms: "Sending this same export file to a remote server would require that the extension follow the Add-on Policies' Data Collection and Consent provisions."

**Personally Identifying Information (PII) rule**: "personally identifying information may only be collected after receiving explicit consent." The bug-report payload must NOT include email, user account info, or IP address embedded in the extension payload. Cloudflare Worker's server-side IP access is distinct and fine.

### Privacy Policy Update Required

The existing `docs/privacy/index.html` currently states: "Patent Citation Tool does not collect, store, or transmit any personal data."

This statement becomes FALSE with v5.0 bug reporting. Required additions:
1. New section: "Bug Report Submission (Optional)"
2. What's sent: patent URL, selected text excerpt, citation result, confidence tier, extension version, browser/OS string, settings snapshot, recent error log
3. When: only when user explicitly taps the Report button
4. Storage: Cloudflare KV (same developer-operated infrastructure as existing cache)
5. Retention policy: need to define (suggest: 90 days then KV TTL expiry)
6. Update the CWS Developer Dashboard to reflect new data collection categories

**Complexity**: LOW for the text update; MEDIUM for CWS dashboard update + manifest.json addition.

---

## Auto-Captured Diagnostic Bundle: Payload Recommendations

### Table Stakes Content (always send, zero user friction)

| Field | Source | Why | PII risk |
|-------|--------|-----|----------|
| `patent_id` | `extractPatentInfo()` in content-script.js | Primary key for reproduction | None |
| `page_url` | `window.location.href` | Exact URL including query params | LOW (URL of a public patent page is public) |
| `selected_text` | From `lastCitationResult` or current selection | Critical for matching-tier reproduction | LOW (excerpt from a public patent) |
| `returned_citation` | From `lastCitationResult.citation` | What the user saw | None |
| `confidence_tier` | From `lastCitationResult.confidence` | Tier 5 vs exact match matters enormously for triage | None |
| `patent_type` | From `extractPatentInfo().patentType` | Grant vs Application changes the entire code path | None |
| `extension_version` | `chrome.runtime.getManifest().version` | Bug may be version-specific | None |
| `browser_ua` | `navigator.userAgent` | Chrome vs Firefox, version, OS | LOW (standard web platform data) |
| `timestamp` | `Date.toISOString()` | KV ordering + dedup window | None |
| `category` | User-selected category | Triage routing | None |
| `note` | User-typed note (optional) | Additional context | User-controlled; minimal risk |

### Differentiating Content (include, explain in disclosure)

| Field | Source | Why | PII risk |
|-------|--------|-----|----------|
| `settings_snapshot` | `cachedSettings` object (triggerMode, displayMode, includePatentNumber) | "Only fails in silent mode" is a real class of bugs | LOW (user preferences, not identity) |
| `selected_node_xpath` | Already in v3.1 llm-report.json schema; captured via `getSelectionContext()` in content-script.js | Identifies the DOM node where selection occurred; critical for `GOOGLE_DOM_DRIFT` class | None |
| `viewport` | `{width: window.innerWidth, height: window.innerHeight, scrollY: window.scrollY}` | Already in v3.1 schema | None |
| `pdf_status` | `currentPatent.status` from `chrome.storage.local` | Distinguishes "PDF not parsed" from "matched but wrong" | None |
| `recent_errors` | Ring buffer from service worker (last 10 console.error calls) | Critical for silent failures where no user-visible error appeared | LOW (error messages from extension code; may contain patent IDs but not user identity) |

### Anti-Features in Payload (never include)

| Field | Why Excluded |
|-------|--------------|
| Full page DOM | Too large (1-2 MB); contains full patent text; triggers CWS websiteContent high-sensitivity category |
| Screenshot / screen recording | CWS/AMO image-capture triggers elevated review; large blob; confidentiality risk for attorney screens |
| IP address | PII; never embed in extension payload; Worker sees it server-side if needed |
| User email or identity | PII; requires opt-in consent; out of scope for v1 |
| Browsing history / other tabs | Requires `tabs` permission; AMO `browsingActivity` high-sensitivity |
| Network request logs | Full network logs expose all API calls; exceeds diagnostic need; Sentry-style capture is overkill |
| `chrome.storage` full dump | Could contain cached position maps, old patent data; unnecessary; use targeted field extraction |
| IndexedDB cache contents | 10-100 KB per patent; excessive for a report payload |

---

## Submit Feedback UX: Interaction Pattern

### Recommended Pattern: Inline Modal Within Shadow DOM

**Why not a separate tab/page:**
- Opening a tab breaks the user's workflow on the current patent page
- Shadow DOM popup is already the established pattern for all citation UI in this codebase
- The existing `getCitationHost()` + `attachShadow({mode:'closed'})` infrastructure handles CSS isolation from Google Patents

**Why not a sidebar:**
- Google Patents has no sidebar affordance; a floating sidebar over the page would interfere with the two-column patent text
- Shadow DOM popup is more dismissable

**Recommended flow:**

```
[Report button tap in citation popup / error popup / toolbar popup]
  ↓
[Report dialog within Shadow DOM popup]
  - Title: "Report a Citation Issue"
  - 4-button category picker (radio style, taps)
  - Optional: one-line text input ("Add a note (optional)")
  - Privacy disclosure line: "What's included: [list]  [View payload ▼]"
  - Optional: expandable payload preview (JSON)
  - [Cancel] [Submit Report] buttons
  ↓ (on Submit tap)
[Loading state: "Sending..."]
  ↓ (on success)
[Dismiss dialog]
[showSuccessToast-style confirmation: "Report sent — thank you"]
  ↓ (on failure)
[showFailureToast-style: "Could not send report — queued for retry"]
```

**User time in dialog**: target < 10 seconds for the auto-surfaced failure case
(category pre-selected, user just taps Submit). Free-text adds ~15-30 seconds.

**Confirmation pattern**: inline toast (2-3s auto-dismiss) using existing
`showSuccessToast` / `showFailureToast` CSS patterns from `citation-ui.js`.
Do NOT navigate away from the patent page on submit.

### Trigger Model: When Does the Report Button Appear?

| Scenario | Report button behavior | Why |
|----------|----------------------|-----|
| Red confidence / no-match error popup | Auto-surfaces with "No match found" pre-selected | Highest frustration moment; user has nothing to show for their work |
| Yellow confidence (Tier 5 / 0.85 cap) | Auto-surfaces with "Inaccurate citation" pre-selected | 0.85 cap signals gutter-tolerant match — known approximate result |
| Worker-fallback error / PDF parse failure | Auto-surfaces with "Tool not working" pre-selected | Infrastructure failure; user can't proceed |
| Green confidence (> 0.95) | NOT auto-surfaced | No failure to report; don't interrupt success |
| Debug Mode ON (options toggle) | Always visible in citation result UI | Power-user / maintainer testing path |
| Toolbar popup (always) | "Report a problem" link always visible as fallback | "Tool didn't load at all" case |

---

## Debug Mode Patterns

### What "Debug Mode" Should Unlock

Based on research (PostHog chrome extension debug mode pattern; GitLab VS Code extension debug:true setting; Oracle/Adobe application debug mode patterns):

| Debug Mode Feature | Why Include | Complexity |
|-------------------|-------------|------------|
| **Report button always visible** regardless of confidence tier | Lets maintainer and power users report anything | LOW (check `debugMode` in Report button render logic) |
| **Raw payload preview visible by default** (not collapsed) | Debugging the reporter itself requires seeing what's sent | LOW (CSS toggle) |
| **Verbose console logging** for citation pipeline events | Aids maintainer diagnosis without requiring Sentry SDK | LOW (gate log statements on `debugMode` flag) |
| **Version info display** in toolbar popup | Confirms which build is running | LOW (already has version display; enhance) |

**What Debug Mode should NOT unlock:**
- Additional data collection beyond what the base report sends
- Remote admin access or metrics aggregation view (v5.1 scope)
- Build-time devtools (keep production bundle unchanged)

**Storage**: `chrome.storage.sync` key `debugMode: false` (boolean), following exact pattern of existing options settings at `src/options/options.js`.

**Privacy note**: Debug Mode does NOT change what data is sent in a report — it only changes the display and trigger behavior. The payload content is identical.

---

## Feature Dependencies

```
[Report button in citation UI]
  ├─ requires: citation-ui.js Shadow DOM infrastructure (EXISTING)
  ├─ requires: handleCitationResult() failure-detection logic (EXISTING)
  └─ requires: cachedSettings.debugMode for Debug Mode always-visible path

[Auto-capture diagnostic payload]
  ├─ requires: extractPatentInfo() (EXISTING)
  ├─ requires: lastCitationResult state (EXISTING)
  ├─ requires: cachedSettings settings snapshot (EXISTING)
  ├─ requires: selected_node_xpath + viewport (EXISTING in v3.1 schema)
  └─ requires: error ring buffer (NEW in service worker)

[Cloudflare Worker submission endpoint]
  ├─ requires: new route on existing Worker (NEW server-side)
  ├─ requires: KV durable storage (EXISTING KV namespace, new binding)
  └─ requires: Discord webhook (server-side env binding, not in extension)

[Rate limit]
  └─ requires: chrome.storage.local (EXISTING pattern)

[Privacy disclosure]
  ├─ requires: inline disclosure text in report dialog (NEW DOM)
  ├─ requires: updated docs/privacy/index.html (EXISTING file, update)
  ├─ requires: manifest.json data_collection_permissions (NEW — AMO requirement)
  └─ requires: CWS dashboard privacy fields update (manual step)

[Debug Mode toggle]
  ├─ requires: options.html + options.js (EXISTING pattern)
  └─ requires: cachedSettings loaded in content-script.js (EXISTING)

[Toolbar popup fallback trigger]
  └─ requires: popup.html + popup.js (EXISTING pattern)
```

### Dependency Notes

- **All report features depend on privacy disclosure being implemented first**: shipping the Report button without inline disclosure is a CWS policy violation.
- **Rate limit is independent** and can be implemented in the same phase as the submit path.
- **Debug Mode is independent** from the core report flow — can ship in a later phase.
- **Server-side (Worker) changes are independent** from client-side changes and can be implemented in a parallel phase.
- **Error ring buffer in service worker is independent** from the report dialog and can be shipped after the core report flow.

---

## MVP Definition

### Launch With (v5.0)

Minimum viable product — what's needed for maintainer to receive actionable triage reports.

- [ ] Report button in citation error popup + no-match error popup — auto-surfaced on failure
- [ ] 4-category picker (Inaccurate citation / No match found / Tool not working / Other)
- [ ] Auto-captured core context: patent ID, URL, selected text, citation result, confidence, version, browser+OS
- [ ] Settings snapshot: trigger mode, display mode, prefix toggle
- [ ] Inline privacy disclosure (one-line + expandable)
- [ ] Cloudflare Worker submission endpoint + KV durable storage
- [ ] Discord webhook notification (server-side)
- [ ] Client-side rate limit (5 / 10 min)
- [ ] Server-side fingerprint dedup
- [ ] Submit confirmation toast (success + failure)
- [ ] Updated privacy policy (`docs/privacy/index.html`)
- [ ] Manifest.json `data_collection_permissions` (AMO requirement)
- [ ] Toolbar popup fallback trigger
- [ ] Options page Debug Mode toggle

### Add After Validation (v5.1)

Features to add once core is working and report volume provides signal.

- [ ] Local queue + retry on Worker failure — implement after v1 launch reveals how often the Worker is unreachable
- [ ] Error log ring buffer in service worker — implement after first batch of reports shows whether missing error log context is blocking triage
- [ ] GitHub Issues auto-promotion — once report volume justifies automation (v5.1 carries the existing `lib/issue-payload-builder.js` pattern)
- [ ] Reports view in options page — once there are reports to view

### Future Consideration (v2+)

Features to defer until report volume establishes patterns.

- [ ] AI-powered report triage / categorization
- [ ] Per-user report history
- [ ] Public status page or known-issues feed

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Report button in citation UI (auto-surfaced on failure) | HIGH | MEDIUM | P1 |
| 4-category picker + auto-selection | HIGH | LOW | P1 |
| Auto-captured core context | HIGH | MEDIUM | P1 |
| Inline privacy disclosure | HIGH (compliance) | LOW | P1 |
| Cloudflare Worker endpoint + KV | HIGH | MEDIUM | P1 |
| Submit confirmation toast | HIGH | LOW | P1 |
| Settings snapshot in payload | MEDIUM | LOW | P1 |
| Client-side rate limit | MEDIUM | LOW | P1 |
| Server-side fingerprint dedup | MEDIUM | LOW | P1 |
| Privacy policy update + manifest `data_collection_permissions` | HIGH (compliance) | LOW | P1 |
| Toolbar popup fallback trigger | MEDIUM | LOW | P1 |
| Options page Debug Mode toggle | MEDIUM | LOW | P1 |
| DOM/PDF diagnostics (xpath, viewport) | MEDIUM | LOW (reuses v3.1 schema) | P2 |
| Expandable payload preview | MEDIUM | LOW | P2 |
| Error log ring buffer | MEDIUM | MEDIUM | P2 |
| Local queue + retry | LOW (v1) | MEDIUM | P3 |
| GitHub Issues auto-promotion | LOW (v5.0) | HIGH | P3 |

---

## Sources

- uBlock Origin "Report a filter issue" wiki: https://github.com/uBlockOrigin/uBlock-issues/wiki/The-%22Report-a-filter-issue%22-form (HIGH confidence — official docs)
- uBlock Origin popup guide: https://github.com/gorhill/uBlock/wiki/Quick-guide:-popup-user-interface (HIGH confidence)
- Jam bug-reporting extension documentation: https://jam.dev/docs/creating-a-jam (HIGH confidence — official docs)
- BetterBugs quickstart: https://docs.betterbugs.io/getting-started/quickstart (HIGH confidence — official docs)
- Chrome Web Store User Data Policy FAQ: https://developer.chrome.com/docs/webstore/program-policies/user-data-faq (HIGH confidence — official Google docs)
- Chrome Web Store Disclosure Requirements: https://developer.chrome.com/docs/webstore/program-policies/disclosure-requirements (HIGH confidence)
- Firefox Extension Workshop — Best Practices for User Data Consents: https://extensionworkshop.com/documentation/develop/best-practices-for-collecting-user-data-consents/ (HIGH confidence — official Mozilla docs)
- Firefox Built-in Data Consent documentation: https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/ (HIGH confidence — official Mozilla docs, November 2025 effective)
- Mozilla AMO Blog — Data Collection Consent Changes: https://blog.mozilla.org/addons/2025/10/23/data-collection-consent-changes-for-new-firefox-extensions/ (HIGH confidence — official Mozilla announcement)
- AMO Policies FAQ: https://extensionworkshop.com/documentation/publish/add-on-policies-faq/ (HIGH confidence)
- Top Chrome Extensions for Bug Reporting (Shake): https://www.shakebugs.com/blog/bug-reporting-chrome-extensions/ (MEDIUM confidence — vendor blog, but surveys the space accurately)
- Grammarly error reporting: https://support.grammarly.com/hc/en-us/articles/115000090772 (HIGH confidence — official support page)

---

*Feature research for: v5.0 Bug Report Feature — Patent Citation Tool*
*Researched: 2026-06-12*

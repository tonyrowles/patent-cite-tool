# Phase 1: Extension Foundation and PDF Fetch - Research

**Researched:** 2026-02-27
**Domain:** Chrome Extension Manifest V3, Google Patents URL parsing, PDF fetching
**Confidence:** HIGH

## Summary

Phase 1 requires building a Chrome Manifest V3 extension that activates on Google Patents, extracts patent numbers from URLs, and fetches the patent PDF. The MV3 architecture splits work across three contexts: a **service worker** (background event handler, no DOM), a **content script** (runs on the patents.google.com page, can read DOM), and an **offscreen document** (hidden page with DOM access for PDF processing in later phases).

The critical architectural decision is where to fetch the PDF. The service worker and offscreen document both support cross-origin fetch with `host_permissions`; content scripts do NOT get CORS bypass even with host_permissions. The PDF link must be scraped from the Google Patents DOM (by the content script) because the URL contains unpredictable hash path segments. The actual binary fetch should happen in the service worker (simplest, no lifecycle management needed for a single fetch) or the offscreen document (has DOM for later PDF.js usage). Given that Phase 2 will need the offscreen document for PDF.js parsing anyway, fetching the PDF in the offscreen document is the better choice -- it avoids transferring large binary data between contexts.

**Primary recommendation:** Content script extracts the PDF link from the Google Patents page DOM and sends it to the service worker. Service worker creates the offscreen document and forwards the URL. Offscreen document fetches the PDF binary and stores it in IndexedDB for later use.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Activate only on US patents and published applications (patents.google.com/patent/US...)
- Extract patent number from the URL path segment -- ignore locale suffixes (/en), query parameters, and anchors
- Detect and store patent type at extraction time: granted patent (US...B1/B2) vs published application (US...A1)
- Icon stays inactive on non-patent pages (search results, scholar pages, other patents.google.com URLs)
- Eager fetch: start fetching the patent PDF as soon as a patent page is detected (don't wait for user interaction)
- One silent retry on fetch failure, then show error state
- Distinct "PDF unavailable" state for patents that have no fetchable PDF link (separate from fetch errors)
- Badge error indicator on the extension icon when PDF fetch fails (red badge or error icon)
- User clicks extension icon to see a brief error message in a small popup
- "PDF unavailable" is a distinct state from "fetch error" -- user understands it's a data limitation, not a bug

### Claude's Discretion
- Extension icon design (active vs inactive appearance)
- Offscreen document lifecycle management (create/destroy vs keep-alive)
- Message passing protocol details between service worker, content script, and offscreen document
- Exact error message wording

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| EXT-01 | Extension activates on Google Patents pages (patents.google.com) | Use `declarativeContent` API with `PageStateMatcher` + `hostEquals: 'patents.google.com'` and `pathPrefix: '/patent/US'` to show action only on US patent pages. Disable action by default. |
| EXT-02 | Extension identifies patent/application number from the current page | Content script parses `window.location.pathname` with regex `/\/patent\/(US[\dA-Z]+)/` to extract patent ID. Kind code suffix (A1, B1, B2) determines document type. |
| PDF-01 | Extension fetches the patent PDF linked from Google Patents | Content script extracts PDF link from DOM anchor (`a[href*="patentimages.storage.googleapis.com"]`). Offscreen document fetches the PDF binary using the extracted URL. Requires `host_permissions` for `https://patentimages.storage.googleapis.com/*`. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Chrome Extensions API | MV3 (Chrome 109+) | Extension framework | Required platform; MV3 is mandatory as of 2025 |
| chrome.offscreen | Chrome 109+ | Hidden DOM document for PDF processing | Only way to get DOM access from background context in MV3 |
| chrome.declarativeContent | Stable | Conditional action activation | Enables icon without broad host permissions or content script injection on every page |
| chrome.action | MV3 | Extension toolbar icon, badge, popup | Standard toolbar interaction API |
| IndexedDB | Web standard | Binary PDF storage across contexts | Only reliable cross-context binary storage; chrome.storage has size limits and no binary support |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| chrome.runtime | MV3 | Message passing between contexts | All inter-context communication |
| chrome.storage.local | MV3 | Lightweight state (patent number, fetch status) | Persisting non-binary state across service worker restarts |
| chrome.tabs | MV3 | Send messages to content scripts | Service worker to content script communication |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Offscreen document fetch | Service worker fetch | SW fetch works but then you need to transfer binary data to offscreen doc for PDF.js later -- 64MB message limit, serialization cost |
| IndexedDB for PDF storage | chrome.storage.local | chrome.storage.local has ~10MB limit per item and doesn't handle binary well; IndexedDB handles Blob/ArrayBuffer natively |
| declarativeContent | tabs.onUpdated listener | tabs.onUpdated requires `tabs` permission and manual URL checking; declarativeContent is purpose-built and more efficient |

**Installation:**
No npm packages needed for Phase 1. Pure Chrome Extension APIs with vanilla JavaScript.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── manifest.json          # Extension manifest (MV3)
├── background/
│   └── service-worker.js  # Event handling, orchestration
├── content/
│   └── content-script.js  # Runs on patents.google.com, extracts data from DOM
├── offscreen/
│   ├── offscreen.html     # Minimal HTML for offscreen document
│   └── offscreen.js       # PDF fetch, IndexedDB storage
├── popup/
│   ├── popup.html         # Small popup for status/error display
│   └── popup.js           # Popup logic
├── icons/                 # Extension icons (16, 32, 48, 128px)
│   ├── icon-active-16.png
│   ├── icon-active-48.png
│   ├── icon-inactive-16.png
│   └── icon-inactive-48.png
└── shared/
    └── constants.js       # Message types, error codes, shared config
```

### Pattern 1: Declarative Action Activation
**What:** Use `declarativeContent` to show/hide the extension action icon based on URL.
**When to use:** When the extension should only be active on specific pages.
**Example:**
```javascript
// Source: https://developer.chrome.com/docs/extensions/reference/api/declarativeContent
chrome.runtime.onInstalled.addListener(() => {
  // Disable action by default
  chrome.action.disable();

  // Enable only on US patent pages
  chrome.declarativeContent.onPageChanged.removeRules(undefined, () => {
    chrome.declarativeContent.onPageChanged.addRules([{
      conditions: [
        new chrome.declarativeContent.PageStateMatcher({
          pageUrl: {
            hostEquals: 'patents.google.com',
            pathPrefix: '/patent/US',
            schemes: ['https']
          }
        })
      ],
      actions: [new chrome.declarativeContent.ShowAction()]
    }]);
  });
});
```

### Pattern 2: Offscreen Document Lifecycle Management
**What:** Create offscreen document on demand, reuse if exists, destroy when done.
**When to use:** When performing DOM-dependent operations from the service worker.
**Example:**
```javascript
// Source: https://developer.chrome.com/docs/extensions/reference/api/offscreen
const OFFSCREEN_URL = 'offscreen/offscreen.html';

async function ensureOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_URL)]
  });

  if (existingContexts.length > 0) {
    return; // Already exists
  }

  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: ['BLOBS'],
    justification: 'Fetch and process patent PDF'
  });
}
```

### Pattern 3: Message-Based Orchestration
**What:** Service worker coordinates between content script and offscreen document using typed messages.
**When to use:** All inter-context communication.
**Example:**
```javascript
// Shared message types
const MSG = {
  PDF_LINK_FOUND: 'pdf-link-found',
  PDF_LINK_NOT_FOUND: 'pdf-link-not-found',
  FETCH_PDF: 'fetch-pdf',
  PDF_FETCH_RESULT: 'pdf-fetch-result',
  GET_STATUS: 'get-status',
};

// Service worker: listen for content script messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === MSG.PDF_LINK_FOUND) {
    handlePdfLinkFound(message.pdfUrl, message.patentId);
  }
  if (message.type === MSG.PDF_LINK_NOT_FOUND) {
    handlePdfUnavailable(message.patentId);
  }
  return true; // Keep channel open for async response
});
```

### Pattern 4: Patent Number Extraction from URL
**What:** Parse the Google Patents URL to extract patent/application number and type.
**When to use:** In content script on page load.
**Example:**
```javascript
function extractPatentInfo(url) {
  const pathname = new URL(url).pathname;
  // Match /patent/US followed by digits and kind code
  const match = pathname.match(/\/patent\/(US\d{4,}[A-Z]\d?)/);

  if (!match) return null;

  const patentId = match[1];
  // Determine type from kind code
  const kindCode = patentId.match(/[A-Z]\d?$/)?.[0];
  const type = (kindCode === 'A1' || kindCode === 'A2' || kindCode === 'A9')
    ? 'application'
    : 'grant'; // B1, B2, etc.

  return { patentId, type, kindCode };
}
```

### Pattern 5: PDF Link Extraction from DOM
**What:** Content script finds the PDF download link in the Google Patents page.
**When to use:** After page loads, before sending PDF URL to service worker.
**Example:**
```javascript
function extractPdfLink() {
  // Google Patents PDF links point to patentimages.storage.googleapis.com
  const links = document.querySelectorAll('a[href*="patentimages.storage.googleapis.com"]');
  for (const link of links) {
    if (link.href.endsWith('.pdf')) {
      return link.href;
    }
  }
  return null;
}
```

### Anti-Patterns to Avoid
- **Constructing PDF URLs from patent numbers:** The PDF URL contains unpredictable hash path segments (e.g., `/8a/22/5e/4d90a531903787/`). Always scrape the link from the DOM.
- **Storing state in service worker global variables:** The service worker terminates after 30 seconds of inactivity. Use `chrome.storage.local` or IndexedDB.
- **Using content script for cross-origin fetch:** Content scripts do NOT get CORS bypass from host_permissions. Always route fetches through the service worker or offscreen document.
- **Creating multiple offscreen documents:** Chrome allows only ONE offscreen document per extension at a time. Always check for existing documents before creating.
- **Using `chrome.storage.local` for PDF binary data:** It has a ~10MB limit per item and doesn't handle binary well. Use IndexedDB for Blob/ArrayBuffer storage.
- **Relying on `window` or DOM APIs in service worker:** Service workers have no DOM. Use offscreen documents for DOM operations.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Conditional icon activation | Manual URL checking in tabs.onUpdated | `chrome.declarativeContent` with `PageStateMatcher` | Declarative rules are more efficient, don't require tabs permission, and handle edge cases (prerendering, back/forward cache) |
| Cross-context binary storage | Message passing with base64 encoding | IndexedDB (shared across all extension contexts) | Avoids serialization overhead, 64MB message limit, and service worker memory pressure |
| URL pattern matching | Custom regex on every tab update | Manifest `content_scripts.matches` + `declarativeContent` rules | Built-in matching is faster and handles edge cases |
| Offscreen document existence check | Try/catch around createDocument | `chrome.runtime.getContexts()` | Purpose-built API, avoids race conditions with concurrent creation |

**Key insight:** MV3 extensions have purpose-built APIs for almost every common pattern. Hand-rolling replacements leads to subtle bugs around service worker lifecycle, context isolation, and permission scoping.

## Common Pitfalls

### Pitfall 1: Service Worker Termination Losing State
**What goes wrong:** Extension stores fetch status, patent info, or PDF data in service worker global variables. Service worker terminates after 30 seconds of inactivity, losing all state.
**Why it happens:** Developers coming from MV2 background pages expect persistent state.
**How to avoid:** Use `chrome.storage.local` for lightweight state (patent ID, fetch status) and IndexedDB for binary data (PDF). Read state from storage on every service worker wake-up.
**Warning signs:** Extension works perfectly after install but "forgets" state after a few minutes of inactivity.

### Pitfall 2: Content Script CORS Fetch Failure
**What goes wrong:** Content script tries to fetch PDF from `patentimages.storage.googleapis.com` and gets a CORS error, despite having `host_permissions` in manifest.
**Why it happens:** In MV3, content scripts do NOT benefit from `host_permissions` for cross-origin requests. Only the service worker and extension pages (including offscreen documents) get CORS bypass.
**How to avoid:** Content script extracts the PDF URL from DOM and sends it to the service worker or offscreen document to perform the actual fetch.
**Warning signs:** CORS errors in console from content script context.

### Pitfall 3: Race Condition Creating Offscreen Documents
**What goes wrong:** Multiple events trigger offscreen document creation simultaneously, causing "Only a single offscreen document may be created" errors.
**Why it happens:** Service worker handles tab updates and messages concurrently. Two patent page navigations in quick succession both try to create the offscreen document.
**How to avoid:** Use a creation mutex/promise. Check `chrome.runtime.getContexts()` before creating. Store the creation promise and await it from concurrent callers.
**Warning signs:** Intermittent errors when rapidly switching between patent pages.

### Pitfall 4: Google Patents PDF Link Not in Initial DOM
**What goes wrong:** Content script runs before the page fully renders (Google Patents uses client-side rendering), so the PDF download link is not yet in the DOM.
**Why it happens:** Google Patents is a JavaScript-heavy SPA. The "Download PDF" link may be rendered asynchronously.
**How to avoid:** Use `MutationObserver` to watch for the PDF link appearing, or retry with a short delay. Set a reasonable timeout (e.g., 10 seconds) to detect "PDF unavailable."
**Warning signs:** PDF link extraction works sometimes but not others, especially on slower connections.

### Pitfall 5: Message Passing Fails When No Listener
**What goes wrong:** `chrome.runtime.sendMessage` from content script throws "Could not establish connection. Receiving end does not exist" when service worker is inactive.
**Why it happens:** Service worker may not have started yet, or the message listener hasn't been registered. Also happens if no `onMessage` listener returns `true` or a Promise for async responses.
**How to avoid:** The service worker should always register `onMessage` listeners at the top level (not inside callbacks). For content-script-initiated messages, the service worker will be woken up automatically. For async responses, return `true` from the listener.
**Warning signs:** Intermittent "Receiving end does not exist" errors in console.

### Pitfall 6: Offscreen Document Only Supports chrome.runtime
**What goes wrong:** Offscreen document tries to use chrome.storage, chrome.tabs, or other extension APIs and gets undefined errors.
**Why it happens:** The only Chrome extension API available in offscreen documents is `chrome.runtime` (for messaging). All other APIs must be accessed via the service worker through message passing.
**How to avoid:** Offscreen document communicates exclusively through `chrome.runtime.sendMessage` / `chrome.runtime.onMessage`. For storage, either use IndexedDB directly (it's a web API, not an extension API) or route through the service worker.
**Warning signs:** `chrome.storage is undefined` errors in offscreen document console.

## Code Examples

### Complete manifest.json
```json
{
  "manifest_version": 3,
  "name": "Patent Citation Tool",
  "version": "0.1.0",
  "description": "Get accurate citation references from Google Patents",

  "permissions": [
    "declarativeContent",
    "offscreen",
    "activeTab"
  ],

  "host_permissions": [
    "https://patentimages.storage.googleapis.com/*"
  ],

  "background": {
    "service_worker": "background/service-worker.js"
  },

  "content_scripts": [
    {
      "matches": ["https://patents.google.com/patent/US*"],
      "js": ["content/content-script.js"],
      "run_at": "document_idle"
    }
  ],

  "action": {
    "default_popup": "popup/popup.html",
    "default_icon": {
      "16": "icons/icon-inactive-16.png",
      "48": "icons/icon-inactive-48.png",
      "128": "icons/icon-inactive-128.png"
    }
  },

  "icons": {
    "16": "icons/icon-active-16.png",
    "48": "icons/icon-active-48.png",
    "128": "icons/icon-active-128.png"
  }
}
```

### Content Script: Extract Patent Info and PDF Link
```javascript
// content/content-script.js

function extractPatentInfo() {
  const pathname = window.location.pathname;
  const match = pathname.match(/\/patent\/(US[\dA-Z]+)/);
  if (!match) return null;

  const patentId = match[1];
  const kindCode = patentId.match(/([A-Z]\d?)$/)?.[1];
  const type = ['A1', 'A2', 'A9'].includes(kindCode)
    ? 'application'
    : 'grant';

  return { patentId, type, kindCode };
}

function findPdfLink() {
  const links = document.querySelectorAll(
    'a[href*="patentimages.storage.googleapis.com"]'
  );
  for (const link of links) {
    if (link.href.endsWith('.pdf')) return link.href;
  }
  return null;
}

function waitForPdfLink(timeoutMs = 10000) {
  return new Promise((resolve) => {
    // Check immediately
    const link = findPdfLink();
    if (link) { resolve(link); return; }

    // Watch for DOM changes
    const observer = new MutationObserver(() => {
      const link = findPdfLink();
      if (link) {
        observer.disconnect();
        resolve(link);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Timeout
    setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeoutMs);
  });
}

async function init() {
  const patentInfo = extractPatentInfo();
  if (!patentInfo) return;

  const pdfUrl = await waitForPdfLink();

  if (pdfUrl) {
    chrome.runtime.sendMessage({
      type: 'pdf-link-found',
      patentId: patentInfo.patentId,
      patentType: patentInfo.type,
      kindCode: patentInfo.kindCode,
      pdfUrl
    });
  } else {
    chrome.runtime.sendMessage({
      type: 'pdf-link-not-found',
      patentId: patentInfo.patentId,
      patentType: patentInfo.type,
      kindCode: patentInfo.kindCode
    });
  }
}

init();
```

### Service Worker: Orchestration
```javascript
// background/service-worker.js

const OFFSCREEN_URL = 'offscreen/offscreen.html';
let creatingOffscreen = null;

// Declarative content rules
chrome.runtime.onInstalled.addListener(() => {
  chrome.action.disable();
  chrome.declarativeContent.onPageChanged.removeRules(undefined, () => {
    chrome.declarativeContent.onPageChanged.addRules([{
      conditions: [
        new chrome.declarativeContent.PageStateMatcher({
          pageUrl: {
            hostEquals: 'patents.google.com',
            pathPrefix: '/patent/US',
            schemes: ['https']
          }
        })
      ],
      actions: [new chrome.declarativeContent.ShowAction()]
    }]);
  });
});

async function ensureOffscreenDocument() {
  if (creatingOffscreen) {
    await creatingOffscreen;
    return;
  }

  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_URL)]
  });

  if (contexts.length > 0) return;

  creatingOffscreen = chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: ['BLOBS'],
    justification: 'Fetch and store patent PDF for citation processing'
  });

  await creatingOffscreen;
  creatingOffscreen = null;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'pdf-link-found') {
    handlePdfLinkFound(message);
  } else if (message.type === 'pdf-link-not-found') {
    handlePdfUnavailable(message);
  } else if (message.type === 'pdf-fetch-result') {
    handlePdfFetchResult(message);
  }
  return true;
});

async function handlePdfLinkFound(message) {
  // Store patent info
  await chrome.storage.local.set({
    currentPatent: {
      patentId: message.patentId,
      patentType: message.patentType,
      kindCode: message.kindCode,
      pdfUrl: message.pdfUrl,
      status: 'fetching'
    }
  });

  // Ensure offscreen document exists, then tell it to fetch
  await ensureOffscreenDocument();
  chrome.runtime.sendMessage({
    type: 'fetch-pdf',
    pdfUrl: message.pdfUrl,
    patentId: message.patentId
  });
}

async function handlePdfUnavailable(message) {
  await chrome.storage.local.set({
    currentPatent: {
      patentId: message.patentId,
      patentType: message.patentType,
      kindCode: message.kindCode,
      status: 'unavailable'
    }
  });
  chrome.action.setBadgeText({ text: '!' });
  chrome.action.setBadgeBackgroundColor({ color: '#F59E0B' }); // amber
}

async function handlePdfFetchResult(message) {
  const data = await chrome.storage.local.get('currentPatent');
  const patent = data.currentPatent;
  if (!patent) return;

  if (message.success) {
    patent.status = 'ready';
    await chrome.storage.local.set({ currentPatent: patent });
    chrome.action.setBadgeText({ text: '' }); // clear badge
  } else {
    patent.status = 'error';
    patent.error = message.error;
    await chrome.storage.local.set({ currentPatent: patent });
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#EF4444' }); // red
  }
}
```

### Offscreen Document: PDF Fetch with Retry
```javascript
// offscreen/offscreen.js

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'fetch-pdf') {
    fetchPdfWithRetry(message.pdfUrl, message.patentId);
  }
  return true;
});

async function fetchPdfWithRetry(pdfUrl, patentId, retries = 1) {
  try {
    const response = await fetch(pdfUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const blob = await response.blob();
    await storePdfInIndexedDB(patentId, blob);

    chrome.runtime.sendMessage({
      type: 'pdf-fetch-result',
      success: true,
      patentId
    });
  } catch (error) {
    if (retries > 0) {
      // One silent retry
      await new Promise(r => setTimeout(r, 1000));
      return fetchPdfWithRetry(pdfUrl, patentId, retries - 1);
    }

    chrome.runtime.sendMessage({
      type: 'pdf-fetch-result',
      success: false,
      patentId,
      error: error.message
    });
  }
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('patent-cite-tool', 1);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('pdfs')) {
        db.createObjectStore('pdfs', { keyPath: 'patentId' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function storePdfInIndexedDB(patentId, blob) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pdfs', 'readwrite');
    tx.objectStore('pdfs').put({ patentId, pdf: blob, timestamp: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| MV2 background pages (persistent) | MV3 service workers (event-driven, terminates) | MV3 required June 2025 | Must persist all state to storage; no global variables |
| `chrome.browserAction` / `chrome.pageAction` | Unified `chrome.action` API | MV3 | Single API controls toolbar icon |
| Background page DOM access | Offscreen documents for DOM | MV3 (Chrome 109+) | Must explicitly create offscreen document for DOM operations |
| `XMLHttpRequest` in background | `fetch()` in service worker | MV3 | XHR not available in service workers |
| `chrome.extension.getBackgroundPage()` | Message passing via `chrome.runtime` | MV3 | No direct access to background context |
| `return true` for async `sendMessage` | Return Promise (Chrome 146+) | Chrome 146 | Can use async/await in message handlers |

**Deprecated/outdated:**
- `chrome.browserAction` / `chrome.pageAction`: Replaced by `chrome.action` in MV3
- Background pages: Replaced by service workers in MV3
- `chrome.extension.getURL()`: Use `chrome.runtime.getURL()` instead
- Manifest V2: No longer accepted in Chrome Web Store as of June 2025

## Open Questions

1. **Offscreen document and `host_permissions` CORS bypass**
   - What we know: Service workers get CORS bypass with host_permissions. Offscreen documents are described as "extension foreground contexts" which also get this privilege.
   - What's unclear: No explicit Chrome documentation page confirms offscreen documents get the same CORS bypass as service workers. All examples show service worker fetches.
   - Recommendation: Test fetching from `patentimages.storage.googleapis.com` in the offscreen document early. If CORS fails there, fall back to fetching in the service worker and passing the ArrayBuffer to the offscreen document via message passing. (HIGH confidence this will work based on the "foreground context" classification.)

2. **Google Patents SPA navigation**
   - What we know: Google Patents is a JavaScript SPA. Navigating between patents may not trigger full page loads.
   - What's unclear: Whether the content script re-executes on SPA navigation within patents.google.com, or only on full page loads.
   - Recommendation: Content script should also listen for `popstate` / URL changes via `MutationObserver` on the URL, or the service worker can use `chrome.tabs.onUpdated` with `changeInfo.url` to detect URL changes and re-inject/re-trigger the content script.

3. **PDF link selector stability**
   - What we know: The PDF link is an anchor with href pointing to `patentimages.storage.googleapis.com/*.pdf`.
   - What's unclear: Whether Google might change the link structure or add dynamic tokens that expire.
   - Recommendation: The selector `a[href*="patentimages.storage.googleapis.com"]` filtering for `.pdf` suffix is robust because it targets the hosting domain, not CSS classes or element IDs that could change. This aligns with the STATE.md blocker note to scrape from DOM rather than construct URLs.

## Sources

### Primary (HIGH confidence)
- [chrome.offscreen API reference](https://developer.chrome.com/docs/extensions/reference/api/offscreen) - Offscreen document API, reasons enum, lifecycle, limitations
- [chrome.declarativeContent API](https://developer.chrome.com/docs/extensions/reference/api/declarativeContent) - PageStateMatcher, ShowAction, URL matching
- [Message passing guide](https://developer.chrome.com/docs/extensions/develop/concepts/messaging) - One-time messages, ports, async patterns, security
- [Service worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle) - Termination rules, idle timeout, keep-alive strategies
- [Cross-origin network requests](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests) - host_permissions CORS behavior, content script restrictions
- [USPTO Kind Codes](https://www.uspto.gov/learning-and-resources/support-centers/electronic-business-center/kind-codes-included-uspto-patent) - A1, B1, B2 patent type codes

### Secondary (MEDIUM confidence)
- [Google Patents page](https://patents.google.com/patent/US11427642B2/en) - Direct observation of PDF link structure: `https://patentimages.storage.googleapis.com/{hash}/{patentId}.pdf`
- [w3c/webextensions#293](https://github.com/w3c/webextensions/issues/293) - Binary data transfer limitations between contexts
- [Chromium cross-origin fetch changes](https://www.chromium.org/Home/chromium-security/extension-content-script-fetches/) - Content scripts lose cross-origin fetch ability in MV3

### Tertiary (LOW confidence)
- Google Patents SPA behavior - Based on observation that it uses client-side rendering; exact navigation behavior needs validation during implementation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Chrome extension APIs are well-documented and stable
- Architecture: HIGH - MV3 patterns are well-established with official guidance
- Pitfalls: HIGH - Common MV3 migration issues are extensively documented
- Google Patents specifics: MEDIUM - PDF link structure observed but DOM selector stability is unverified long-term

**Research date:** 2026-02-27
**Valid until:** 2026-03-27 (stable platform, 30-day validity)

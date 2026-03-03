---
phase: 01-extension-foundation-and-pdf-fetch
verified: 2026-02-28T00:00:00Z
status: human_needed
score: 7/7 must-haves verified
human_verification:
  - test: "Load extension in Chrome and confirm icon activates only on US patent pages"
    expected: "Icon enabled on patents.google.com/patent/US11427642B2, icon disabled on patents.google.com search results and non-US patent URLs"
    why_human: "declarativeContent rules execute in the Chrome browser process; cannot verify page-state rule activation programmatically"
  - test: "Navigate to a US granted patent and click the extension icon"
    expected: "Popup shows 'PDF ready for US11427642B2' with green background after a few seconds; IndexedDB patent-cite-tool/pdfs store contains a Blob entry keyed by patentId"
    why_human: "Requires live browser, actual fetch() call to patentimages.storage.googleapis.com, and real IndexedDB write — cannot simulate without Chrome extension environment"
  - test: "Navigate to a published application (e.g. patents.google.com/patent/US20230004650A1/en) and click the icon"
    expected: "Popup shows appropriate status; patentType field in chrome.storage.local is 'application'"
    why_human: "Requires live browser to verify kind-code classification (A1 -> application) and popup rendering"
  - test: "Check service worker console (chrome://extensions -> Inspect views: service worker) after navigating to a patent"
    expected: "No 'Receiving end does not exist' errors, no uncaught exceptions, [SW] log line visible for patent"
    why_human: "Message passing errors only surface at runtime in the Chrome DevTools console"
---

# Phase 1: Extension Foundation and PDF Fetch — Verification Report

**Phase Goal:** Build the Chrome extension scaffold and implement patent PDF fetching — the extension detects US patent pages on Google Patents, extracts patent numbers, fetches the PDF binary via an offscreen document, and stores it in IndexedDB.
**Verified:** 2026-02-28
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from ROADMAP Success Criteria + PLAN must_haves)

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | Extension icon activates (lights up) only on a patents.google.com page | ? HUMAN NEEDED | declarativeContent rules present and correct in service-worker.js (pathPrefix: '/patent/US', hostEquals: 'patents.google.com'); chrome.action.disable() on install; ShowAction rule registered — but activation requires a live browser |
| 2  | Extension correctly extracts patent or application number from the current Google Patents URL | VERIFIED | content-script.js `extractPatentInfo()` parses `/patent/(US[\dA-Z]+)` from pathname; kind code extracted via `/([A-Z]\d?)$/`; type classified (A1/A2/A9 → application, else → grant) |
| 3  | Extension successfully fetches a patent PDF in the offscreen document without CSP or CORS errors | ? HUMAN NEEDED | offscreen.js implements fetch() + retry + IndexedDB storage; manifest has host_permissions for patentimages.storage.googleapis.com; architecture is correct, but actual CSP/CORS resolution requires live browser verification |
| 4  | Service worker, content script, and offscreen document communicate via message passing without dropped messages | ? HUMAN NEEDED | Message chain fully wired in code (content-script → SW via sendMessage; SW → offscreen via sendMessage; offscreen → SW via sendMessage with PDF_FETCH_RESULT); onMessage only returns true where sendResponse is used; but dropped-message behavior requires live browser testing |
| 5  | On fetch failure, one silent retry occurs before showing error state | VERIFIED | offscreen.js `fetchPdfWithRetry(pdfUrl, patentId, retries = 1)` — on error with retries > 0, waits 1s then recurses with retries - 1; final failure sends PDF_FETCH_RESULT with success: false |
| 6  | PDF binary is stored in IndexedDB for later use by Phase 2 | VERIFIED | offscreen.js `storePdfInIndexedDB()` opens `patent-cite-tool` db v1, creates `pdfs` object store with keyPath `patentId`, writes `{ patentId, pdf: blob, timestamp }` |
| 7  | User can click extension icon to see status (ready, error, or unavailable) in a small popup | VERIFIED | popup.js reads chrome.storage.local on DOMContentLoaded; renders five states (idle, ready, fetching, error with detail, unavailable); popup.html referenced in manifest action.default_popup |

**Score:** 7/7 truths have substantive implementation. 4/7 are fully verifiable without a browser; 3/7 require human verification for runtime behavior.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/manifest.json` | MV3 extension manifest | VERIFIED | manifest_version: 3, all required permissions, host_permissions, ES module service worker, content_scripts targeting US patents, popup configured |
| `src/background/service-worker.js` | SW with declarativeContent rules and message handling | VERIFIED | declarativeContent rules, onInstalled handler, onMessage handler for all 4 message types, ensureOffscreenDocument mutex, badge updates, chrome.storage.local state |
| `src/content/content-script.js` | Content script extracting patent info and PDF link from DOM | VERIFIED | extractPatentInfo(), findPdfLink(), waitForPdfLink() with MutationObserver + 10s timeout, init() calling sendMessage — no ES module syntax |
| `src/shared/constants.js` | Shared message types and status constants | VERIFIED | MSG, STATUS, PATENT_TYPE defined; no export keyword (bug fixed in 89a36a8); service worker defines own copy inline |
| `src/offscreen/offscreen.html` | Minimal HTML host for offscreen document | VERIFIED | 5 lines, loads offscreen.js via script tag |
| `src/offscreen/offscreen.js` | PDF fetch with retry and IndexedDB storage | VERIFIED | fetch() with 1-retry, openDb(), storePdfInIndexedDB(), reports via chrome.runtime.sendMessage with PDF_FETCH_RESULT |
| `src/popup/popup.html` | Small popup showing patent status | VERIFIED | 280px width, all 5 status CSS classes, loads popup.js |
| `src/popup/popup.js` | Popup logic reading status from chrome.storage.local | VERIFIED | DOMContentLoaded handler, chrome.storage.local.get, switch on status, all 5 states rendered |
| `src/icons/icon-active-{16,48,128}.png` | Blue active placeholder icons | VERIFIED | All 3 sizes present (79, 123, 306 bytes) |
| `src/icons/icon-inactive-{16,48,128}.png` | Gray inactive placeholder icons | VERIFIED | All 3 sizes present (79, 124, 307 bytes) |

### Key Link Verification

#### Plan 01-01 Key Links

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/manifest.json` | `src/background/service-worker.js` | background.service_worker field | VERIFIED | `"service_worker": "background/service-worker.js"` with `"type": "module"` present |
| `src/manifest.json` | `src/content/content-script.js` | content_scripts configuration | VERIFIED | `"js": ["shared/constants.js", "content/content-script.js"]` — constants loaded first as global |
| `src/content/content-script.js` | `src/background/service-worker.js` | chrome.runtime.sendMessage with typed messages | VERIFIED | sendMessage called twice in init() — once for PDF_LINK_FOUND, once for PDF_LINK_NOT_FOUND; uses MSG constants |

#### Plan 01-02 Key Links

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/background/service-worker.js` | `src/offscreen/offscreen.js` | chrome.offscreen.createDocument + sendMessage | VERIFIED | `ensureOffscreenDocument()` calls `chrome.offscreen.createDocument({url: 'offscreen/offscreen.html', reasons: ['BLOBS'], ...})`; then `chrome.runtime.sendMessage({type: MSG.FETCH_PDF, ...})` |
| `src/offscreen/offscreen.js` | IndexedDB patent-cite-tool/pdfs store | indexedDB.open and objectStore.put | VERIFIED | `indexedDB.open('patent-cite-tool', 1)`, createObjectStore('pdfs', {keyPath: 'patentId'}), store.put({patentId, pdf: blob, timestamp}) |
| `src/offscreen/offscreen.js` | `src/background/service-worker.js` | chrome.runtime.sendMessage with PDF_FETCH_RESULT | VERIFIED | Both success and failure paths call sendMessage with `type: PDF_FETCH_RESULT` (local const = 'pdf-fetch-result') |
| `src/popup/popup.js` | chrome.storage.local | chrome.storage.local.get('currentPatent') | VERIFIED | `chrome.storage.local.get('currentPatent')` in DOMContentLoaded handler |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| EXT-01 | 01-01 | Extension activates on Google Patents pages (patents.google.com) | SATISFIED | declarativeContent rule: hostEquals 'patents.google.com', pathPrefix '/patent/US', chrome.action.disable() default; ShowAction on match |
| EXT-02 | 01-01 | Extension identifies patent/application number from the current page | SATISFIED | `extractPatentInfo()` parses URL for `US[\dA-Z]+`, extracts kind code, classifies A1/A2/A9 as application vs grant |
| PDF-01 | 01-02 | Extension fetches the patent PDF linked from Google Patents | SATISFIED | Full pipeline: content script finds PDF link via patentimages.storage.googleapis.com selector, SW delegates to offscreen, offscreen fetches + stores in IndexedDB |

No orphaned requirements — all Phase 1 requirements (EXT-01, EXT-02, PDF-01) were claimed by plans 01-01 and 01-02 respectively, and all are marked complete in REQUIREMENTS.md.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/background/service-worker.js` | 120-121 | Stale doc comment: "Actual PDF fetch delegation to offscreen document will be added in Plan 01-02." — delegation is already implemented in the same function below | Info | Misleading but harmless; code executes correctly despite incorrect comment |

No TODO/FIXME/HACK/PLACEHOLDER comments found. No empty handler stubs (return null/return {}). No console.log-only implementations.

### Human Verification Required

#### 1. Icon Page Activation

**Test:** Load the extension via chrome://extensions developer mode (Load unpacked → `src/` directory). Navigate to `https://patents.google.com/patent/US11427642B2/en`. Observe the extension icon in the Chrome toolbar.
**Expected:** Icon is visually active/clickable on the patent page. Navigate to `https://patents.google.com` (search page) — icon is grayed out and not clickable.
**Why human:** Chrome's declarativeContent API evaluates PageStateMatcher rules in the browser process. The code correctly defines the rules (hostEquals + pathPrefix + schemes) and calls chrome.action.disable() as default, but actual icon state changes require a running Chrome instance.

#### 2. End-to-End PDF Fetch and IndexedDB Storage

**Test:** On `https://patents.google.com/patent/US11427642B2/en`, wait a few seconds then click the extension icon.
**Expected:** Popup shows "PDF ready for US11427642B2" with green background. Open DevTools → Application → IndexedDB → patent-cite-tool → pdfs — confirm an entry exists with a Blob value for US11427642B2.
**Why human:** The fetch() call to patentimages.storage.googleapis.com only runs from within a Chrome extension offscreen document. CORS and CSP constraints are architecture-level concerns that can only be validated in a live extension environment. The offscreen document's BLOBS reason and the host_permissions configuration are correct in code, but actual network requests cannot be simulated.

#### 3. Published Application Classification

**Test:** Navigate to `https://patents.google.com/patent/US20230004650A1/en`. Click the extension icon.
**Expected:** Popup shows a status for the application. In DevTools → Application → chrome.storage.local → currentPatent, confirm `patentType` is `"application"` (kind code A1 triggers this branch).
**Why human:** Kind code classification logic is verified in code (A1/A2/A9 → application), but end-to-end confirmation that the URL is correctly parsed and the right patentType reaches storage requires a live run.

#### 4. Message Passing — No Dropped Messages

**Test:** After navigating to a patent, open chrome://extensions → click "Inspect views: service worker" for Patent Citation Tool. Check the console.
**Expected:** `[SW] PDF link found for {patentId}` log line visible. No "Receiving end does not exist" errors. No "The message port closed before a response was received" errors.
**Why human:** The fix in commit 9550cef (only return true from onMessage when sendResponse is used) addresses a real Chrome runtime behavior. Dropped-message and port-closed errors only surface in the live service worker DevTools console.

### Gaps Summary

No automated gaps found. All 14 source files (10 from plan 01-01, plus 4 new from plan 01-02) exist and contain substantive, non-stub implementations. All 7 key links are wired correctly. All 3 phase requirements (EXT-01, EXT-02, PDF-01) have satisfying implementations. The one stale comment (line 120-121 of service-worker.js) is informational only and does not affect correctness.

The phase goal is architecturally achieved. Human verification is required to confirm that CSP/CORS constraints are genuinely resolved in the live Chrome environment — this was the specific validation criterion called out in the ROADMAP ("confirming that CSP, CORS, and service worker lifecycle constraints are resolved"). The SUMMARY notes that a human-verify checkpoint was completed and approved, which is strong evidence the live test passed, but this verification cannot be re-confirmed programmatically.

---
_Verified: 2026-02-28_
_Verifier: Claude (gsd-verifier)_

/**
 * Service worker for the Patent Citation Tool extension.
 *
 * Responsibilities:
 * - Register declarativeContent rules to enable icon only on US patent pages
 * - Handle messages from content script (patent info, PDF link status)
 * - Persist patent state to chrome.storage.local (not global variables)
 * - Set badge indicators for error/unavailable states
 */

import { MSG, STATUS, PATENT_TYPE } from '../shared/constants.js';

// ---------------------------------------------------------------------------
// Icon state paths — used by chrome.action.setIcon for three-state toolbar icon
// Gray/inactive state is handled by manifest default_icon (no setIcon call needed)
// ---------------------------------------------------------------------------

const ICON_PATHS = {
  partial: {
    16: '/icons/icon-partial-16.png',
    32: '/icons/icon-partial-32.png',
    48: '/icons/icon-partial-48.png',
    128: '/icons/icon-partial-128.png',
  },
  active: {
    16: '/icons/icon-active-16.png',
    32: '/icons/icon-active-32.png',
    48: '/icons/icon-active-48.png',
    128: '/icons/icon-active-128.png',
  },
};

/**
 * Set the toolbar icon state for a specific tab.
 * Uses tab-scoped setIcon so other tabs are unaffected.
 * Gray state requires no call — Chrome uses manifest default_icon.
 * @param {number|undefined} tabId - The tab to update
 * @param {'partial'|'active'} state - The icon state to set
 */
function setTabIcon(tabId, state) {
  if (!tabId) return;
  chrome.action.setIcon({ path: ICON_PATHS[state], tabId });
}

// ---------------------------------------------------------------------------
// Offscreen document management
// ---------------------------------------------------------------------------

let creatingOffscreen = null;

/**
 * Ensure the offscreen document exists (create if needed).
 * Uses a mutex pattern to prevent concurrent creation attempts.
 */
async function ensureOffscreenDocument() {
  if (creatingOffscreen) {
    await creatingOffscreen;
    return;
  }

  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL('offscreen/offscreen.html')],
  });

  if (contexts.length > 0) {
    return; // Already exists
  }

  creatingOffscreen = chrome.offscreen.createDocument({
    url: 'offscreen/offscreen.html',
    reasons: ['BLOBS'],
    justification: 'Fetch and store patent PDF for citation processing',
  });

  await creatingOffscreen;
  creatingOffscreen = null;
}

// ---------------------------------------------------------------------------
// Declarative content rules — enable icon only on US patent pages
// ---------------------------------------------------------------------------

chrome.runtime.onInstalled.addListener(() => {
  // Disable action by default on all pages
  chrome.action.disable();

  // Enable only on patents.google.com/patent/US... pages
  chrome.declarativeContent.onPageChanged.removeRules(undefined, () => {
    chrome.declarativeContent.onPageChanged.addRules([
      {
        conditions: [
          new chrome.declarativeContent.PageStateMatcher({
            pageUrl: {
              hostEquals: 'patents.google.com',
              pathPrefix: '/patent/US',
              schemes: ['https'],
            },
          }),
        ],
        actions: [new chrome.declarativeContent.ShowAction()],
      },
    ]);
  });

  // Context menu for citation
  chrome.contextMenus.create({
    id: 'get-patent-citation',
    title: 'Get Citation',
    contexts: ['selection'],
    documentUrlPatterns: ['https://patents.google.com/patent/US*'],
  });
});

// ---------------------------------------------------------------------------
// Context menu click handler
// ---------------------------------------------------------------------------

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'get-patent-citation' && tab?.id) {
    chrome.tabs.sendMessage(tab.id, {
      type: MSG.GENERATE_CITATION,
      selectedText: info.selectionText,
    }).catch(err => console.warn('[SW] Context menu send failed:', err.message));
  }
});

// ---------------------------------------------------------------------------
// Message handling — registered at top level (not inside callbacks)
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  if (message.type === MSG.PDF_LINK_FOUND) {
    handlePdfLinkFound(message, tabId);
  } else if (message.type === MSG.PDF_LINK_NOT_FOUND) {
    handlePdfUnavailable(message, tabId);
  } else if (message.type === MSG.PDF_FETCH_RESULT) {
    handlePdfFetchResult(message);
  } else if (message.type === MSG.PARSE_RESULT) {
    handleParseResult(message);
  } else if (message.type === MSG.LOOKUP_POSITION) {
    handleLookupPosition(message, sender);
  } else if (message.type === MSG.CITATION_RESULT) {
    handleCitationResult(message);
  } else if (message.type === MSG.USPTO_FETCH_RESULT) {
    handleUsptoFetchResult(message);
  } else if (message.type === MSG.CACHE_HIT_RESULT) {
    handleCacheHitResult(message);
  } else if (message.type === MSG.CACHE_MISS) {
    handleCacheMiss(message);
  } else if (message.type === MSG.GET_STATUS) {
    handleGetStatus(sendResponse);
    return true; // Keep channel open for async sendResponse
  }
});

// ---------------------------------------------------------------------------
// Message handlers
// ---------------------------------------------------------------------------

/**
 * Handle PDF link found from content script.
 * Store patent info with FETCHING status. Actual PDF fetch delegation
 * to offscreen document will be added in Plan 01-02.
 */
async function handlePdfLinkFound(message, tabId) {
  const { patentId, patentType, kindCode, pdfUrl } = message;

  await chrome.storage.local.set({
    currentPatent: {
      patentId,
      patentType,
      kindCode,
      pdfUrl,
      tabId,
      status: STATUS.FETCHING,
      source: 'google',
      error: null,
    },
  });

  // Transition toolbar icon: gray -> partial (patent detected, fetching/parsing)
  setTabIcon(tabId, 'partial');

  // Create offscreen document and check cache before fetching PDF
  await ensureOffscreenDocument();
  chrome.runtime.sendMessage({
    type: MSG.CHECK_CACHE,
    patentId,
    pdfUrl,    // pass through so CACHE_MISS can continue the fetch
  }).catch(err => console.warn('[SW] CHECK_CACHE send failed:', err.message));
}

/**
 * Handle PDF link not found from content script.
 * For grant patents, check cache first then try USPTO fallback. For applications, set UNAVAILABLE.
 */
async function handlePdfUnavailable(message, tabId) {
  const { patentId, patentType, kindCode } = message;

  if (patentType === PATENT_TYPE.GRANT) {
    // Grant patents have eGrant PDFs — check cache first, then try USPTO fallback
    console.log(`[SW] No Google PDF link for ${patentId}, checking cache before USPTO fallback`);
    await chrome.storage.local.set({
      currentPatent: {
        patentId,
        patentType,
        kindCode,
        pdfUrl: null,
        tabId,
        status: STATUS.FETCHING,
        source: null,
        error: null,
      },
    });
    await ensureOffscreenDocument();
    chrome.runtime.sendMessage({
      type: MSG.CHECK_CACHE,
      patentId,
      pdfUrl: null,  // no Google PDF — CACHE_MISS will trigger USPTO fallback
    }).catch(err => console.warn('[SW] CHECK_CACHE send failed:', err.message));
  } else {
    // Application patents have no eGrant PDFs — set UNAVAILABLE immediately
    await chrome.storage.local.set({
      currentPatent: {
        patentId,
        patentType,
        kindCode,
        pdfUrl: null,
        tabId,
        status: STATUS.UNAVAILABLE,
        error: null,
      },
    });
    // Amber badge indicates PDF unavailable (distinct from fetch error)
    // Icon stays gray — gray + amber badge communicates "no PDF available"
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#F59E0B' });
  }
}

/**
 * Handle PDF fetch result from offscreen document.
 * Update patent status and badge indicator accordingly.
 */
async function handlePdfFetchResult(message) {
  const data = await chrome.storage.local.get('currentPatent');
  const patent = data.currentPatent;
  if (!patent) return;

  if (message.success) {
    // Fetch succeeded — trigger PDF parsing
    patent.status = STATUS.PARSING;
    patent.error = null;
    await chrome.storage.local.set({ currentPatent: patent });

    // Send parse request to offscreen document
    chrome.runtime.sendMessage({
      type: MSG.PARSE_PDF,
      patentId: patent.patentId,
    }).catch(err => console.warn('[SW] PARSE_PDF send failed:', err.message));
  } else {
    if (patent.patentType === PATENT_TYPE.GRANT && patent.source !== 'uspto') {
      // Grant patent with Google fetch failure — try USPTO fallback
      console.log(`[SW] Google PDF fetch failed, trying USPTO fallback for ${patent.patentId}`);
      patent.status = STATUS.FETCHING;
      patent.source = null;
      patent.error = null;
      await chrome.storage.local.set({ currentPatent: patent });
      chrome.runtime.sendMessage({
        type: MSG.FETCH_USPTO_PDF,
        patentId: patent.patentId,
      }).catch(err => console.warn('[SW] FETCH_USPTO_PDF send failed:', err.message));
    } else {
      // Application patent or already tried USPTO — terminal error
      patent.status = STATUS.ERROR;
      patent.error = message.error;
      // Red badge indicates fetch error (distinct from amber unavailable)
      chrome.action.setBadgeText({ text: '!' });
      chrome.action.setBadgeBackgroundColor({ color: '#EF4444' });
      await chrome.storage.local.set({ currentPatent: patent });
    }
  }
}

/**
 * Handle parse result from offscreen document.
 * Update patent status based on parse success/failure.
 */
async function handleParseResult(message) {
  const data = await chrome.storage.local.get('currentPatent');
  const patent = data.currentPatent;
  if (!patent) return;

  if (message.success) {
    patent.status = STATUS.PARSED;
    patent.lineCount = message.lineCount;
    patent.columnCount = message.columnCount;
    patent.error = null;
    // Clear badge on success
    chrome.action.setBadgeText({ text: '' });
    // Transition toolbar icon: partial -> active (position map ready, citations enabled)
    setTabIcon(patent.tabId, 'active');
    await chrome.storage.local.set({ currentPatent: patent });
    // Fire-and-forget cache upload — CACH-03
    chrome.runtime.sendMessage({
      type: MSG.UPLOAD_TO_CACHE,
      patentId: patent.patentId,
    }).catch(() => { /* fire-and-forget */ });
  } else if (message.error === 'no-text-layer') {
    if (patent.patentType === PATENT_TYPE.GRANT && patent.source !== 'uspto') {
      // Grant patent with no text layer from Google — try USPTO fallback
      console.log(`[SW] Google PDF has no text layer, trying USPTO fallback for ${patent.patentId}`);
      patent.status = STATUS.FETCHING;
      patent.source = null;
      patent.error = null;
      await chrome.storage.local.set({ currentPatent: patent });
      await ensureOffscreenDocument();
      chrome.runtime.sendMessage({
        type: MSG.FETCH_USPTO_PDF,
        patentId: patent.patentId,
      }).catch(err => console.warn('[SW] FETCH_USPTO_PDF send failed:', err.message));
    } else {
      // Application patent or already tried USPTO — terminal no-text-layer
      patent.status = STATUS.NO_TEXT_LAYER;
      patent.error = null;
      // Amber badge for no text layer (informational, not error)
      chrome.action.setBadgeText({ text: '!' });
      chrome.action.setBadgeBackgroundColor({ color: '#F59E0B' });
      await chrome.storage.local.set({ currentPatent: patent });
    }
  } else {
    patent.status = STATUS.ERROR;
    patent.error = message.error;
    // Red badge indicates parse error
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#EF4444' });
    await chrome.storage.local.set({ currentPatent: patent });
  }
}

/**
 * Handle USPTO PDF fetch result from offscreen document.
 * On success, trigger existing parse pipeline. On failure, set UNAVAILABLE.
 */
async function handleUsptoFetchResult(message) {
  const data = await chrome.storage.local.get('currentPatent');
  const patent = data.currentPatent;
  if (!patent) return;

  if (message.success) {
    // USPTO fetch succeeded — feed into the same parse pipeline (UPTO-03)
    patent.status = STATUS.PARSING;
    patent.source = 'uspto';
    patent.error = null;
    await chrome.storage.local.set({ currentPatent: patent });

    chrome.runtime.sendMessage({
      type: MSG.PARSE_PDF,
      patentId: patent.patentId,
    }).catch(err => console.warn('[SW] PARSE_PDF send failed:', err.message));
  } else {
    // Both Google and USPTO failed — exhausted all sources
    patent.status = STATUS.UNAVAILABLE;
    patent.error = null;
    await chrome.storage.local.set({ currentPatent: patent });

    // Amber badge: both sources failed, no PDF available
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#F59E0B' });
  }
}

/**
 * Handle cache hit result from offscreen document.
 * Position map was loaded from cloud cache — set patent to PARSED without PDF download.
 */
async function handleCacheHitResult(message) {
  console.log(`[SW] Cache HIT for ${message.patentId} — skipping PDF fetch/parse`);
  const data = await chrome.storage.local.get('currentPatent');
  const patent = data.currentPatent;
  if (!patent) return;

  patent.status = STATUS.PARSED;
  patent.lineCount = message.lineCount;
  patent.columnCount = message.columnCount;
  patent.error = null;
  // Clear badge on cache hit success
  chrome.action.setBadgeText({ text: '' });
  // Transition toolbar icon: gray -> active (instant ready via cache hit)
  setTabIcon(patent.tabId, 'active');
  await chrome.storage.local.set({ currentPatent: patent });
}

/**
 * Handle cache miss from offscreen document.
 * Cache was not available — fall through to PDF fetch (Google) or USPTO fallback.
 */
async function handleCacheMiss(message) {
  const { patentId, pdfUrl } = message;
  console.log(`[SW] Cache miss for ${patentId}`);
  if (pdfUrl) {
    // Google PDF link was available — fetch it
    console.log(`[SW] Fetching Google PDF for ${patentId}`);
    chrome.runtime.sendMessage({
      type: MSG.FETCH_PDF,
      pdfUrl,
      patentId,
    }).catch(err => console.warn('[SW] FETCH_PDF send failed:', err.message));
  } else {
    // No Google PDF — try USPTO fallback
    console.log(`[SW] No Google PDF, trying USPTO fallback for ${patentId}`);
    chrome.runtime.sendMessage({
      type: MSG.FETCH_USPTO_PDF,
      patentId,
    }).catch(err => console.warn('[SW] FETCH_USPTO_PDF send failed:', err.message));
  }
}

/**
 * Handle citation lookup request from content script.
 * Forward to offscreen document for PositionMap matching.
 */
async function handleLookupPosition(message, sender) {
  const tabId = sender.tab?.id;
  if (!tabId) return;

  try {
    // Ensure offscreen document exists
    await ensureOffscreenDocument();

    // Forward to offscreen with tabId for response routing
    await chrome.runtime.sendMessage({
      type: MSG.LOOKUP_POSITION,
      selectedText: message.selectedText,
      patentId: message.patentId,
      contextBefore: message.contextBefore || '',
      contextAfter: message.contextAfter || '',
      tabId: tabId,
    });
  } catch (error) {
    console.warn('[SW] Lookup forward failed:', error.message);
    // Send error back to content script so it can show an error popup
    chrome.tabs.sendMessage(tabId, {
      type: MSG.CITATION_RESULT,
      success: false,
      error: 'lookup-failed',
    }).catch(() => { /* tab may be gone */ });
  }
}

/**
 * Handle citation result from offscreen document.
 * Forward back to the content script in the originating tab.
 */
function handleCitationResult(message) {
  const { tabId, ...result } = message;
  if (!tabId) return;

  chrome.tabs.sendMessage(tabId, {
    type: MSG.CITATION_RESULT,
    ...result,
  }).catch(err => console.warn('[SW] CITATION_RESULT forward failed:', err.message));
}

/**
 * Handle status request (from popup or other contexts).
 * Read current patent state from storage and respond.
 */
async function handleGetStatus(sendResponse) {
  const data = await chrome.storage.local.get('currentPatent');
  sendResponse(data.currentPatent || null);
}

/**
 * Background script for the Firefox Patent Citation Tool extension.
 *
 * Thin orchestrator that mirrors Chrome's service-worker.js but replaces all
 * offscreen document message-passing with direct function calls to pdf-pipeline.js.
 *
 * Key Firefox differences from Chrome:
 * - No offscreen document API — pdf-pipeline.js functions are called directly
 * - Icon activation via tabs.onUpdated URL matching (FOX-03)
 * - All event listeners registered at top level (required for Firefox MV3 event pages)
 * - No MSG.PDF_FETCH_RESULT / PARSE_RESULT / USPTO_FETCH_RESULT / CACHE_HIT_RESULT /
 *   CACHE_MISS / UPLOAD_TO_CACHE handlers — these were internal Chrome message hops
 *
 * This file is an ES module (background.scripts with type: module in manifest).
 */

import { MSG, STATUS, PATENT_TYPE } from '../shared/constants.js';
import {
  checkServerCache,
  fetchAndParsePdf,
  fetchUsptoAndParse,
  lookupPosition,
  uploadToCache,
} from './pdf-pipeline.js';

// ---------------------------------------------------------------------------
// Icon state paths — same as Chrome's service-worker.js
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
 *
 * @param {number|undefined} tabId - The tab to update.
 * @param {'partial'|'active'} state - Icon state to set.
 */
function setTabIcon(tabId, state) {
  if (!tabId) return;
  chrome.action.setIcon({ path: ICON_PATHS[state], tabId });
}

// ---------------------------------------------------------------------------
// onInstalled — disable action globally, create context menu (FOX-03)
// ---------------------------------------------------------------------------

chrome.runtime.onInstalled.addListener(() => {
  // Disable icon by default on all pages
  chrome.action.disable();

  // Icon enabling is handled by tabs.onUpdated below

  // Context menu for citation
  chrome.contextMenus.create({
    id: 'get-patent-citation',
    title: 'Get Citation',
    contexts: ['selection'],
    documentUrlPatterns: ['https://patents.google.com/patent/US*'],
  });
});

// ---------------------------------------------------------------------------
// tabs.onUpdated — icon activation via URL matching (FOX-03)
// ---------------------------------------------------------------------------

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (!changeInfo.url) return;

  if (changeInfo.url.startsWith('https://patents.google.com/patent/US')) {
    chrome.action.enable(tabId);
  } else {
    chrome.action.disable(tabId);
  }
});

// ---------------------------------------------------------------------------
// Context menu click handler
// ---------------------------------------------------------------------------

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'get-patent-citation' && tab?.id) {
    chrome.tabs.sendMessage(tab.id, {
      type: MSG.GENERATE_CITATION,
      selectedText: info.selectionText,
    }).catch(err => console.warn('[BG] Context menu send failed:', err.message));
  }
});

// ---------------------------------------------------------------------------
// Message handling — top-level registration (required for Firefox MV3)
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  if (message.type === MSG.PDF_LINK_FOUND) {
    handlePdfLinkFound(message, tabId);
  } else if (message.type === MSG.PDF_LINK_NOT_FOUND) {
    handlePdfUnavailable(message, tabId);
  } else if (message.type === MSG.LOOKUP_POSITION) {
    handleLookupPosition(message, sender);
  } else if (message.type === MSG.GET_STATUS) {
    handleGetStatus(sendResponse);
    return true; // Keep channel open for async sendResponse
  }
  // Note: No handlers for PDF_FETCH_RESULT, PARSE_RESULT, USPTO_FETCH_RESULT,
  // CACHE_HIT_RESULT, CACHE_MISS, UPLOAD_TO_CACHE — these were Chrome's internal
  // offscreen<->service-worker message hops. Firefox calls functions directly.
});

// ---------------------------------------------------------------------------
// Message handlers
// ---------------------------------------------------------------------------

/**
 * Handle PDF link found from content script.
 *
 * Full async pipeline in one function (no message round-trips):
 *   1. Store FETCHING state + set partial icon
 *   2. Check server cache
 *      - HIT: store PARSED + set active icon
 *      - MISS with pdfUrl: fetch + parse Google PDF
 *      - MISS without pdfUrl: fetch + parse USPTO PDF
 *   3. On success: store PARSED + set active icon + upload cache (fire-and-forget)
 *   4. On failure: try USPTO fallback (grants only, first attempt), else set ERROR
 *
 * @param {object} message - PDF_LINK_FOUND message from content script.
 * @param {number|undefined} tabId - Tab that sent the message.
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

  setTabIcon(tabId, 'partial');

  // Check server cache first
  const cacheResult = await checkServerCache(patentId, pdfUrl);

  if (cacheResult.hit) {
    console.log(`[BG] Cache HIT for ${patentId} — skipping PDF fetch/parse`);
    const data = await chrome.storage.local.get('currentPatent');
    const patent = data.currentPatent;
    if (!patent) return;

    patent.status = STATUS.PARSED;
    patent.lineCount = cacheResult.lineCount;
    patent.columnCount = cacheResult.columnCount;
    patent.error = null;
    chrome.action.setBadgeText({ text: '' });
    setTabIcon(patent.tabId, 'active');
    await chrome.storage.local.set({ currentPatent: patent });
    return;
  }

  // Cache miss — fetch and parse
  await fetchAndProcessPdf(patentId, patentType, pdfUrl, tabId, false);
}

/**
 * Handle PDF link not found from content script.
 *
 * For grants: check cache first, then try USPTO fallback.
 * For applications: set UNAVAILABLE immediately (no eGrant PDF exists).
 *
 * @param {object} message - PDF_LINK_NOT_FOUND message from content script.
 * @param {number|undefined} tabId - Tab that sent the message.
 */
async function handlePdfUnavailable(message, tabId) {
  const { patentId, patentType, kindCode } = message;

  if (patentType === PATENT_TYPE.GRANT) {
    console.log(`[BG] No Google PDF for ${patentId}, checking cache before USPTO fallback`);
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
    setTabIcon(tabId, 'partial');

    // Check server cache first
    const cacheResult = await checkServerCache(patentId, null);

    if (cacheResult.hit) {
      console.log(`[BG] Cache HIT for ${patentId} — skipping USPTO fetch`);
      const data = await chrome.storage.local.get('currentPatent');
      const patent = data.currentPatent;
      if (!patent) return;

      patent.status = STATUS.PARSED;
      patent.lineCount = cacheResult.lineCount;
      patent.columnCount = cacheResult.columnCount;
      patent.error = null;
      chrome.action.setBadgeText({ text: '' });
      setTabIcon(patent.tabId, 'active');
      await chrome.storage.local.set({ currentPatent: patent });
      return;
    }

    // Cache miss — try USPTO fallback
    await fetchAndProcessPdf(patentId, patentType, null, tabId, false);
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
    // Amber badge: PDF unavailable (distinct from error)
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#F59E0B' });
  }
}

/**
 * Handle citation lookup request from content script.
 *
 * Calls lookupPosition() directly (no offscreen forwarding) and sends
 * CITATION_RESULT back to the content tab.
 *
 * @param {object} message - LOOKUP_POSITION message.
 * @param {object} sender - Message sender with tab info.
 */
async function handleLookupPosition(message, sender) {
  const tabId = sender.tab?.id;
  if (!tabId) return;

  try {
    const result = await lookupPosition(
      message.selectedText,
      message.patentId,
      message.contextBefore || '',
      message.contextAfter || '',
    );

    if (result) {
      chrome.tabs.sendMessage(tabId, {
        type: MSG.CITATION_RESULT,
        success: true,
        citation: result.citation,
        confidence: result.confidence,
        startEntry: {
          column: result.startEntry.column,
          lineNumber: result.startEntry.lineNumber,
          page: result.startEntry.page,
          section: result.startEntry.section,
        },
        endEntry: {
          column: result.endEntry.column,
          lineNumber: result.endEntry.lineNumber,
          page: result.endEntry.page,
          section: result.endEntry.section,
        },
      }).catch(() => { /* tab may be gone */ });
    } else {
      chrome.tabs.sendMessage(tabId, {
        type: MSG.CITATION_RESULT,
        success: false,
        error: 'no-match',
      }).catch(() => { /* tab may be gone */ });
    }
  } catch (error) {
    console.warn('[BG] Lookup failed:', error.message);
    chrome.tabs.sendMessage(tabId, {
      type: MSG.CITATION_RESULT,
      success: false,
      error: 'lookup-failed',
    }).catch(() => { /* tab may be gone */ });
  }
}

/**
 * Handle status request (from popup or other contexts).
 *
 * @param {function} sendResponse - Chrome sendResponse callback.
 */
async function handleGetStatus(sendResponse) {
  const data = await chrome.storage.local.get('currentPatent');
  sendResponse(data.currentPatent || null);
}

// ---------------------------------------------------------------------------
// Internal fetch-and-process pipeline
// ---------------------------------------------------------------------------

/**
 * Fetch and parse a PDF from the appropriate source, update storage/icon,
 * and upload to cache on success.
 *
 * Handles fallback logic:
 * - If pdfUrl provided: try Google first. On failure, try USPTO (grants only).
 * - If pdfUrl is null: try USPTO directly (no-text-layer or unavailable on failure).
 *
 * @param {string} patentId
 * @param {string} patentType - PATENT_TYPE.GRANT or PATENT_TYPE.APPLICATION
 * @param {string|null} pdfUrl - Google Patents PDF URL, or null to skip Google fetch.
 * @param {number|undefined} tabId
 * @param {boolean} usptoAttempted - Whether USPTO has already been tried (prevents double fallback).
 */
async function fetchAndProcessPdf(patentId, patentType, pdfUrl, tabId, usptoAttempted) {
  let result;
  let source;

  if (pdfUrl) {
    // Try Google PDF first
    console.log(`[BG] Fetching Google PDF for ${patentId}`);
    result = await fetchAndParsePdf(patentId, pdfUrl);
    source = 'google';
  } else {
    // No Google URL — go straight to USPTO
    console.log(`[BG] No Google PDF, trying USPTO for ${patentId}`);
    result = await fetchUsptoAndParse(patentId);
    source = 'uspto';
    usptoAttempted = true;
  }

  if (result.success) {
    await handleParseSuccess(patentId, result.lineCount, result.columnCount, tabId);
    // Fire-and-forget cache upload
    uploadToCache(patentId).catch(() => { /* fire-and-forget */ });
    return;
  }

  // Parse/fetch failed
  if (result.error === 'no-text-layer') {
    if (patentType === PATENT_TYPE.GRANT && !usptoAttempted) {
      // Grant with no text layer from Google — try USPTO fallback
      console.log(`[BG] Google PDF has no text layer, trying USPTO for ${patentId}`);
      await updateStorage(patentId, { status: STATUS.FETCHING, source: null, error: null });
      const usptoResult = await fetchUsptoAndParse(patentId);
      if (usptoResult.success) {
        await handleParseSuccess(patentId, usptoResult.lineCount, usptoResult.columnCount, tabId);
        uploadToCache(patentId).catch(() => { /* fire-and-forget */ });
      } else {
        await handleParseFailure(patentId, patentType, usptoResult.error, tabId, true);
      }
    } else {
      // Application or already tried USPTO — terminal no-text-layer
      const data = await chrome.storage.local.get('currentPatent');
      const patent = data.currentPatent;
      if (!patent) return;
      patent.status = STATUS.NO_TEXT_LAYER;
      patent.error = null;
      chrome.action.setBadgeText({ text: '!' });
      chrome.action.setBadgeBackgroundColor({ color: '#F59E0B' });
      await chrome.storage.local.set({ currentPatent: patent });
    }
    return;
  }

  // Fetch error (non text-layer)
  if (patentType === PATENT_TYPE.GRANT && source === 'google' && !usptoAttempted) {
    // Google fetch failed — try USPTO fallback for grants
    console.log(`[BG] Google PDF fetch failed, trying USPTO for ${patentId}`);
    await updateStorage(patentId, { status: STATUS.FETCHING, source: null, error: null });
    const usptoResult = await fetchUsptoAndParse(patentId);
    if (usptoResult.success) {
      await handleParseSuccess(patentId, usptoResult.lineCount, usptoResult.columnCount, tabId);
      uploadToCache(patentId).catch(() => { /* fire-and-forget */ });
    } else {
      await handleParseFailure(patentId, patentType, usptoResult.error, tabId, true);
    }
  } else {
    // Application or USPTO already tried — terminal error
    await handleParseFailure(patentId, patentType, result.error, tabId, usptoAttempted);
  }
}

/**
 * Update storage fields for the current patent (partial update).
 *
 * @param {string} patentId - Used only for sanity; actual write is to currentPatent.
 * @param {object} updates - Fields to merge into currentPatent.
 */
async function updateStorage(patentId, updates) {
  const data = await chrome.storage.local.get('currentPatent');
  const patent = data.currentPatent;
  if (!patent) return;
  Object.assign(patent, updates);
  await chrome.storage.local.set({ currentPatent: patent });
}

/**
 * Handle successful parse: set PARSED status, clear badge, activate icon.
 *
 * @param {string} patentId
 * @param {number} lineCount
 * @param {number} columnCount
 * @param {number|undefined} tabId
 */
async function handleParseSuccess(patentId, lineCount, columnCount, tabId) {
  const data = await chrome.storage.local.get('currentPatent');
  const patent = data.currentPatent;
  if (!patent) return;

  patent.status = STATUS.PARSED;
  patent.lineCount = lineCount;
  patent.columnCount = columnCount;
  patent.error = null;
  chrome.action.setBadgeText({ text: '' });
  setTabIcon(patent.tabId, 'active');
  await chrome.storage.local.set({ currentPatent: patent });
}

/**
 * Handle failed parse/fetch: set appropriate error status and badge.
 *
 * @param {string} patentId
 * @param {string} patentType
 * @param {string} error - Error string from pipeline.
 * @param {number|undefined} tabId
 * @param {boolean} usptoAttempted - Whether USPTO was already tried.
 */
async function handleParseFailure(patentId, patentType, error, tabId, usptoAttempted) {
  const data = await chrome.storage.local.get('currentPatent');
  const patent = data.currentPatent;
  if (!patent) return;

  if (error === 'no-text-layer' && usptoAttempted) {
    // Both sources tried — no text layer in either
    patent.status = STATUS.NO_TEXT_LAYER;
    patent.error = null;
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#F59E0B' });
  } else if (usptoAttempted) {
    // Both sources exhausted — UNAVAILABLE
    patent.status = STATUS.UNAVAILABLE;
    patent.error = null;
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#F59E0B' });
  } else {
    // Terminal error
    patent.status = STATUS.ERROR;
    patent.error = error;
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#EF4444' });
  }

  await chrome.storage.local.set({ currentPatent: patent });
}

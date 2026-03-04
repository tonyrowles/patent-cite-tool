/**
 * Content script for the Patent Citation Tool extension.
 *
 * ES module entry point, bundled by esbuild into an IIFE (content.js).
 * Runs on patents.google.com/patent/US* pages.
 * Extracts patent info from the URL and finds the PDF download link in the DOM.
 */

import { MSG, PATENT_TYPE } from '../shared/constants.js';
import { findParagraphCitation } from './paragraph-finder.js';
import {
  showFloatingButton, showCitationPopup, showErrorPopup,
  showLoadingIndicator, showSuccessToast, showFailureToast,
  dismissCitationUI
} from './citation-ui.js';

/**
 * Extract patent ID, type, and kind code from the current URL.
 *
 * Handles URLs like:
 *   /patent/US11427642B2/en
 *   /patent/US20210012345A1
 *   /patent/US11427642B2?oq=...
 *
 * @returns {{ patentId: string, patentType: string, kindCode: string } | null}
 */
function extractPatentInfo() {
  const pathname = window.location.pathname;
  const match = pathname.match(/\/patent\/(US[\dA-Z]+)/);
  if (!match) return null;

  const patentId = match[1];

  // Extract kind code suffix (e.g., B2, A1, B1)
  const kindMatch = patentId.match(/([A-Z]\d?)$/);
  const kindCode = kindMatch ? kindMatch[1] : null;

  // A1, A2, A9 are published applications; everything else is a granted patent
  const patentType =
    kindCode && ['A1', 'A2', 'A9'].includes(kindCode)
      ? PATENT_TYPE.APPLICATION
      : PATENT_TYPE.GRANT;

  return { patentId, patentType, kindCode };
}

/**
 * Search the DOM for a PDF download link pointing to Google's patent image storage.
 *
 * @returns {string | null} The PDF URL, or null if not found.
 */
function findPdfLink() {
  const links = document.querySelectorAll(
    'a[href*="patentimages.storage.googleapis.com"]'
  );
  for (const link of links) {
    if (link.href.endsWith('.pdf')) {
      return link.href;
    }
  }
  return null;
}

/**
 * Wait for the PDF link to appear in the DOM.
 *
 * Google Patents is a JavaScript SPA -- the PDF link may be rendered
 * asynchronously after initial page load. Uses MutationObserver to watch
 * for DOM changes, with a configurable timeout.
 *
 * @param {number} timeoutMs - Maximum time to wait (default 10 seconds).
 * @returns {Promise<string | null>} The PDF URL, or null on timeout.
 */
function waitForPdfLink(timeoutMs = 10000) {
  return new Promise((resolve) => {
    // Check immediately -- link may already be present
    const existing = findPdfLink();
    if (existing) {
      resolve(existing);
      return;
    }

    let resolved = false;

    const observer = new MutationObserver(() => {
      if (resolved) return;
      const link = findPdfLink();
      if (link) {
        resolved = true;
        observer.disconnect();
        resolve(link);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Timeout -- disconnect observer and resolve with null
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        observer.disconnect();
        resolve(null);
      }
    }, timeoutMs);
  });
}

/**
 * Initialize: extract patent info, find PDF link, notify service worker.
 */
async function init() {
  const patentInfo = extractPatentInfo();
  if (!patentInfo) return; // Not a valid US patent page

  const { patentId, patentType, kindCode } = patentInfo;
  const pdfUrl = await waitForPdfLink();

  if (pdfUrl) {
    chrome.runtime.sendMessage({
      type: MSG.PDF_LINK_FOUND,
      patentId,
      patentType,
      kindCode,
      pdfUrl,
    });
  } else {
    chrome.runtime.sendMessage({
      type: MSG.PDF_LINK_NOT_FOUND,
      patentId,
      patentType,
      kindCode,
    });
  }
}

// Run immediately (script is injected at document_idle)
init();

// ---------------------------------------------------------------------------
// Selection detection and citation orchestration
// ---------------------------------------------------------------------------

const DEFAULT_SETTINGS = {
  triggerMode: 'floating-button',
  displayMode: 'default',
  includePatentNumber: false,
};

let selectionTimeout = null;
let currentSelectionRect = null;
let cachedSettings = { ...DEFAULT_SETTINGS };
let citationInProgress = false;
let lastCitationResult = null;   // { type, citation?, confidence?, reason?, rect? } | null
let lastSelectionFingerprint = null;  // string fingerprint for copy-handler validation

// Load settings on init
chrome.storage.sync.get(DEFAULT_SETTINGS, (settings) => {
  cachedSettings = settings;
});

// Listen for settings changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync') {
    if (changes.triggerMode) cachedSettings.triggerMode = changes.triggerMode.newValue;
    if (changes.displayMode) cachedSettings.displayMode = changes.displayMode.newValue;
    if (changes.includePatentNumber) cachedSettings.includePatentNumber = changes.includePatentNumber.newValue;
  }
});

document.addEventListener('mouseup', (event) => {
  clearTimeout(selectionTimeout);
  selectionTimeout = setTimeout(() => {
    // Don't interfere if citation generation is active (loading or displaying result)
    // Silent mode is allowed through -- it doesn't use loading indicators or the popup flow
    if (citationInProgress && cachedSettings.triggerMode !== 'silent') return;

    // Don't interfere if the click was on our citation UI (Cite button, popup, etc.)
    // With closed Shadow DOM, event.target is retargeted to the host element.
    if (event.target?.id === 'patent-cite-host' || event.target.closest?.('#patent-cite-host')) return;

    const selection = window.getSelection();
    const selectedText = selection?.toString().trim();

    if (!selectedText || selectedText.length < 2) {
      dismissCitationUI();
      return;
    }

    const range = selection.getRangeAt(0);
    currentSelectionRect = range.getBoundingClientRect();

    handleSelection(selectedText, currentSelectionRect);
  }, 200);
});

/**
 * Handle a text selection based on the current trigger mode.
 *
 * @param {string} text - Selected text.
 * @param {DOMRect} rect - Bounding rect of the selection.
 */
function handleSelection(text, rect) {
  switch (cachedSettings.triggerMode) {
    case 'auto':
      generateCitation(text, rect);
      break;
    case 'floating-button':
      showFloatingButton(rect, () => {
        generateCitation(text, rect);
      });
      break;
    case 'context-menu':
      // Context menu handled by service worker -- nothing to do here
      break;
    case 'silent':
      preSilentCitation(text, rect);
      break;
  }
}

/**
 * Pre-compute citation on mouseup for silent mode.
 *
 * Stores the citation result in `lastCitationResult` so the synchronous copy
 * event handler can read it without performing async work.
 *
 * For application patents: computes DOM-based paragraph citation immediately.
 * For grant patents: checks storage status, then sends a LOOKUP_POSITION message
 * to the service worker; the CITATION_RESULT handler updates lastCitationResult
 * when the result arrives.
 *
 * @param {string} selectedText - The text the user selected.
 * @param {DOMRect} rect - Bounding rect for toast positioning.
 */
async function preSilentCitation(selectedText, rect) {
  lastCitationResult = null;
  lastSelectionFingerprint = selectedText.substring(0, 40) + ':' + selectedText.length;

  const patentInfo = extractPatentInfo();
  if (!patentInfo) {
    // Non-patent page -- no interference, no toast
    lastCitationResult = { type: 'plain' };
    return;
  }

  const { patentId, patentType } = patentInfo;

  if (patentType === PATENT_TYPE.APPLICATION) {
    const selection = window.getSelection();
    const result = findParagraphCitation(selection);
    if (result) {
      const citation = applyPatentPrefix(result.citation, patentId, patentType);
      lastCitationResult = { type: 'success', citation, confidence: result.confidence, rect };
    } else {
      lastCitationResult = { type: 'failure', reason: 'No match \u2014 plain text copied', rect };
    }
    return;
  }

  // Grant patent -- check storage for parsed PositionMap
  const data = await chrome.storage.local.get('currentPatent');
  const patent = data.currentPatent;

  if (!patent || patent.status !== 'parsed') {
    // PDF not ready -- no interference, no toast (matches CONTEXT.md decision)
    lastCitationResult = { type: 'plain' };
    return;
  }

  // Mark as pending -- async service worker roundtrip needed
  lastCitationResult = { type: 'pending', rect };

  const context = getSelectionContext();
  chrome.runtime.sendMessage({
    type: MSG.LOOKUP_POSITION,
    selectedText,
    patentId,
    contextBefore: context.contextBefore || '',
    contextAfter: context.contextAfter || '',
  });
  // CITATION_RESULT handler updates lastCitationResult when result arrives
}

/**
 * Copy event handler for silent mode.
 *
 * Runs synchronously on Ctrl+C. Reads the pre-computed `lastCitationResult`
 * (set by preSilentCitation on mouseup) and either appends the citation to the
 * clipboard text or allows plain copy to proceed.
 *
 * CRITICAL: event.preventDefault() must be called for clipboardData.setData()
 * to take effect. Without it, the browser silently ignores the custom data.
 */
document.addEventListener('copy', (event) => {
  if (cachedSettings.triggerMode !== 'silent') return;

  const selection = window.getSelection();
  const selectedText = selection?.toString() ?? '';
  if (!selectedText) return;

  const result = lastCitationResult;

  // Validate fingerprint -- ensure result matches current selection
  const currentFingerprint = selectedText.substring(0, 40) + ':' + selectedText.length;
  if (result && result.type !== 'plain' && lastSelectionFingerprint !== currentFingerprint) {
    // Stale result from different selection -- allow plain copy, no toast
    return;
  }

  if (!result || result.type === 'pending') {
    // Citation not ready -- allow plain copy, no toast
    return;
  }

  if (result.type === 'plain') {
    // Non-patent page or PDF not analyzed -- passthrough, no interference
    return;
  }

  if (result.type === 'failure') {
    // Low confidence or no match -- allow default copy (plain text)
    const failureRect = result.rect || currentSelectionRect || { top: 100, bottom: 130, left: 100, right: 200 };
    showFailureToast(result.reason, failureRect);
    lastCitationResult = null;
    return;
  }

  if (result.type === 'success') {
    if (result.confidence < 0.80) {
      // Below threshold -- treat as failure, allow plain copy
      const lowConfRect = result.rect || currentSelectionRect || { top: 100, bottom: 130, left: 100, right: 200 };
      showFailureToast('Low confidence \u2014 plain text copied', lowConfRect);
      lastCitationResult = null;
      return;
    }
    // Append citation to clipboard
    const appendedText = selectedText + ' ' + result.citation;
    event.clipboardData.setData('text/plain', appendedText);
    event.preventDefault(); // REQUIRED for setData to take effect
    const successRect = result.rect || currentSelectionRect || { top: 100, bottom: 130, left: 100, right: 200 };
    showSuccessToast(result.citation, successRect);
    lastCitationResult = null; // consume -- one-shot
    return;
  }
});

/**
 * Extract text surrounding the current selection for disambiguation.
 * When the same phrase appears multiple times in a patent, the surrounding
 * context helps identify which occurrence the user actually selected.
 *
 * @returns {{ contextBefore: string, contextAfter: string }}
 */
function getSelectionContext() {
  try {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return {};

    const range = sel.getRangeAt(0);

    // Walk up from the common ancestor to get enough surrounding text
    let container = range.commonAncestorContainer;
    if (container.nodeType === Node.TEXT_NODE) container = container.parentNode;
    const selectedText = sel.toString();
    while (container.parentNode && container !== document.body) {
      if (container.textContent.length > selectedText.length + 300) break;
      container = container.parentNode;
    }

    // Use Range API for precise before/after extraction
    const preRange = document.createRange();
    preRange.setStart(container, 0);
    preRange.setEnd(range.startContainer, range.startOffset);
    const textBefore = preRange.toString();

    const postRange = document.createRange();
    postRange.setStart(range.endContainer, range.endOffset);
    postRange.setEndAfter(container);
    const textAfter = postRange.toString();

    return {
      contextBefore: textBefore.substring(Math.max(0, textBefore.length - 100)),
      contextAfter: textAfter.substring(0, 100),
    };
  } catch (e) {
    return {};
  }
}

/**
 * Get the last 3 digits of the numeric portion of a patent ID.
 * E.g., "US11427642B2" → "642"
 *
 * @param {string} patentId - The patent ID string (e.g., "US11427642B2").
 * @returns {string | null} Last 3 digits, or null if not parseable.
 */
function getShortPatentNumber(patentId) {
  if (!patentId) return null;
  const numericMatch = patentId.match(/US(\d+)/);
  if (!numericMatch) return null;
  return numericMatch[1].slice(-3);
}

/**
 * Apply optional patent number prefix to a citation string.
 * When includePatentNumber setting is enabled, prepends "'NNN Pat., " or "'NNN App., ".
 *
 * @param {string} citation - The citation text (e.g., "4:5-20" or "[0045]").
 * @param {string} patentId - The patent ID (e.g., "US11427642B2").
 * @param {string} patentType - PATENT_TYPE.GRANT or PATENT_TYPE.APPLICATION.
 * @returns {string} Citation with or without prefix.
 */
function applyPatentPrefix(citation, patentId, patentType) {
  if (!cachedSettings.includePatentNumber || !patentId) return citation;
  const short = getShortPatentNumber(patentId);
  if (!short) return citation;
  const suffix = patentType === PATENT_TYPE.APPLICATION ? 'App.' : 'Pat.';
  return `'${short} ${suffix}, ${citation}`;
}

/**
 * Generate a citation for the selected text.
 * Routes to the correct citation path based on patent type:
 * - Granted patents: PositionMap-based via offscreen document
 * - Published applications: DOM-based paragraph citation
 *
 * @param {string} selectedText - The text the user selected.
 * @param {DOMRect} rect - Bounding rect for UI positioning.
 */
async function generateCitation(selectedText, rect) {
  citationInProgress = true;
  const patentInfo = extractPatentInfo();
  if (!patentInfo) {
    citationInProgress = false;
    showErrorPopup('Not on a patent page', rect || currentSelectionRect);
    return;
  }

  const { patentId, patentType } = patentInfo;

  if (patentType === PATENT_TYPE.APPLICATION) {
    // Published application: DOM-based paragraph citation
    const selection = window.getSelection();
    const result = findParagraphCitation(selection);

    citationInProgress = false;
    if (result) {
      const prefixedCitation = applyPatentPrefix(result.citation, patentId, patentType);
      showCitationPopup(prefixedCitation, rect || currentSelectionRect, result.confidence, cachedSettings.displayMode);
    } else {
      showErrorPopup('Paragraph not found in application', rect || currentSelectionRect);
    }
  } else {
    // Granted patent: PositionMap-based citation via offscreen
    // Check if PositionMap is ready
    const data = await chrome.storage.local.get('currentPatent');
    const patent = data.currentPatent;

    if (!patent || patent.status !== 'parsed') {
      const statusMsg = patent?.status === 'fetching' || patent?.status === 'parsing'
        ? 'PDF is still being analyzed, please wait...'
        : patent?.status === 'error'
          ? 'PDF analysis failed'
          : 'PDF not available';
      citationInProgress = false;
      showErrorPopup(statusMsg, rect || currentSelectionRect);
      return;
    }

    // Show loading indicator (citationInProgress stays true until CITATION_RESULT arrives)
    showLoadingIndicator(rect || currentSelectionRect);

    // Extract surrounding context for multi-occurrence disambiguation
    const context = getSelectionContext();

    // Send lookup request to service worker
    chrome.runtime.sendMessage({
      type: MSG.LOOKUP_POSITION,
      selectedText: selectedText,
      patentId: patentId,
      contextBefore: context.contextBefore || '',
      contextAfter: context.contextAfter || '',
    });
  }
}

// ---------------------------------------------------------------------------
// Incoming message handlers (citation results and context menu triggers)
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === MSG.CITATION_RESULT) {
    handleCitationResult(message);
  } else if (message.type === MSG.GENERATE_CITATION) {
    // Context menu trigger from service worker
    const rect = currentSelectionRect || { top: 100, bottom: 130, left: 100, right: 200 };
    generateCitation(message.selectedText, rect);
  }
});

/**
 * Handle citation result from the offscreen document (via service worker).
 *
 * @param {object} message - Citation result message.
 */
function handleCitationResult(message) {
  const rect = currentSelectionRect || { top: 100, bottom: 130, left: 100, right: 200 };

  // Silent mode branch: update lastCitationResult instead of showing popup
  if (cachedSettings.triggerMode === 'silent') {
    if (message.success && message.confidence >= 0.80) {
      const patentInfo = extractPatentInfo();
      const citation = applyPatentPrefix(message.citation, patentInfo?.patentId, patentInfo?.patentType);
      lastCitationResult = { type: 'success', citation, confidence: message.confidence, rect };
    } else if (message.success && message.confidence < 0.80) {
      lastCitationResult = { type: 'failure', reason: 'Low confidence \u2014 plain text copied', rect };
    } else {
      const reason = message.error === 'no-match'
        ? 'No match \u2014 plain text copied'
        : 'PDF not analyzed \u2014 plain text copied';
      lastCitationResult = { type: 'failure', reason, rect };
    }
    citationInProgress = false;
    return;
  }

  // Non-silent modes: existing popup flow
  citationInProgress = false;

  if (message.success) {
    const patentInfo = extractPatentInfo();
    const prefixedCitation = applyPatentPrefix(message.citation, patentInfo?.patentId, patentInfo?.patentType);
    showCitationPopup(
      prefixedCitation,
      rect,
      message.confidence,
      cachedSettings.displayMode
    );
  } else {
    const errorMsg = message.error === 'no-match'
      ? 'Text not found in patent specification'
      : message.error === 'no-position-map'
        ? 'PDF has not been analyzed yet'
        : 'Citation lookup failed';
    showErrorPopup(errorMsg, rect);
  }
}

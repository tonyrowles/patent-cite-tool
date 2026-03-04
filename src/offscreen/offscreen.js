/**
 * Offscreen document for the Patent Citation Tool extension.
 *
 * Responsibilities:
 * - Fetch patent PDF binary from Google Patents storage
 * - Retry once on failure (silent retry per user decision)
 * - Store PDF blob in IndexedDB for later use
 * - Parse PDF to extract positioned text items using PDF.js
 * - Report success/failure back to service worker via message passing
 *
 * NOTE: Offscreen documents only have access to chrome.runtime among
 * extension APIs. No chrome.storage, no chrome.tabs. IndexedDB is a
 * web API and works fine here.
 *
 * This file is an ES module (loaded via <script type="module">).
 */

import { extractTextFromPdf } from './pdf-parser.js';
import { buildPositionMap } from './position-map-builder.js';
import { MSG } from '../shared/constants.js';
import { matchAndCite } from '../shared/matching.js';

// Worker configuration — Cloudflare Worker proxy for USPTO ODP and KV cache
const WORKER_URL = 'https://pct.tonyrowles.com';
const PROXY_TOKEN = '4509b9943f831fb140eb0c3a7304f23cc6f72e41b5e5f8c800a42e94f09cadbe';

// Cache version — bump to invalidate all cached entries
const CACHE_VERSION = 'v2';

// ---------------------------------------------------------------------------
// Message listener — top-level registration
// ---------------------------------------------------------------------------



chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === MSG.FETCH_PDF) {
    fetchPdfWithRetry(message.pdfUrl, message.patentId);
  } else if (message.type === MSG.PARSE_PDF) {
    parsePdf(message.patentId);
  } else if (message.type === MSG.LOOKUP_POSITION && message.tabId) {
    // Only process if tabId is present (forwarded by service worker).
    // Content script's chrome.runtime.sendMessage also reaches us directly
    // but without tabId — ignore those to prevent duplicate processing.
    lookupPosition(message.selectedText, message.patentId, message.tabId,
      message.contextBefore || '', message.contextAfter || '');
  } else if (message.type === MSG.FETCH_USPTO_PDF) {
    fetchUsptoWithRetry(message.patentId);
  } else if (message.type === MSG.CHECK_CACHE) {
    handleCheckCache(message.patentId, message.pdfUrl);
  } else if (message.type === MSG.UPLOAD_TO_CACHE) {
    uploadToCache(message.patentId);
  }
  // Don't return true — these are fire-and-forget, no sendResponse needed
});

// ---------------------------------------------------------------------------
// PDF parsing
// ---------------------------------------------------------------------------

/**
 * Parse a stored PDF to extract positioned text items.
 *
 * Reads the PDF blob from IndexedDB, converts to ArrayBuffer,
 * extracts text via PDF.js, and stores results back in IndexedDB.
 *
 * @param {string} patentId - The patent identifier to look up in IndexedDB.
 */
async function parsePdf(patentId) {
  try {
    const db = await openDb();
    const record = await new Promise((resolve, reject) => {
      const tx = db.transaction('pdfs', 'readonly');
      const store = tx.objectStore('pdfs');
      const request = store.get(patentId);

      request.onsuccess = () => {
        resolve(request.result);
      };
      request.onerror = (event) => {
        reject(new Error(`IndexedDB read failed: ${event.target.error}`));
      };
      tx.oncomplete = () => {
        db.close();
      };
    });

    if (!record || !record.pdf) {
      throw new Error(`No PDF found in IndexedDB for ${patentId}`);
    }

    const arrayBuffer = await record.pdf.arrayBuffer();
    const pageResults = await extractTextFromPdf(arrayBuffer);

    // Build PositionMap from extracted text items
    const positionMap = buildPositionMap(pageResults);

    // Validate: if positionMap is empty but we had text items, something went wrong
    if (positionMap.length === 0) {
      const totalItems = pageResults.reduce((sum, p) => sum + p.items.length, 0);
      if (totalItems > 0) {
        console.warn(`[Offscreen] Patent has ${totalItems} text items but no two-column pages detected`);
      }
    }

    // Store positionMap in IndexedDB alongside the PDF
    const dbWrite = await openDb();
    await new Promise((resolve, reject) => {
      const tx = dbWrite.transaction('pdfs', 'readwrite');
      const store = tx.objectStore('pdfs');

      store.put({
        patentId: record.patentId,
        pdf: record.pdf,
        timestamp: record.timestamp,
        textItems: pageResults,
        positionMap: positionMap,
        positionMapMeta: {
          totalLines: positionMap.length,
          totalColumns: positionMap.length > 0 ? positionMap[positionMap.length - 1].column : 0,
          hasClaimsSection: positionMap.some(e => e.section === 'claims'),
          builtAt: Date.now(),
        },
      });

      tx.oncomplete = () => {
        dbWrite.close();
        resolve();
      };
      tx.onerror = (event) => {
        dbWrite.close();
        reject(new Error(`IndexedDB write failed: ${event.target.error}`));
      };
    });

    chrome.runtime.sendMessage({
      type: MSG.PARSE_RESULT,
      success: true,
      patentId,
      pageCount: pageResults.length,
      lineCount: positionMap.length,
      columnCount: positionMap.length > 0 ? positionMap[positionMap.length - 1].column : 0,
    });
  } catch (error) {
    if (error.message === 'NO_TEXT_LAYER') {
      chrome.runtime.sendMessage({
        type: MSG.PARSE_RESULT,
        success: false,
        patentId,
        error: 'no-text-layer',
      });
    } else {
      console.error(`[Offscreen] PDF parse error for ${patentId}:`, error);
      chrome.runtime.sendMessage({
        type: MSG.PARSE_RESULT,
        success: false,
        patentId,
        error: error.message,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// PDF fetch with retry
// ---------------------------------------------------------------------------

/**
 * Fetch a PDF from the given URL with one silent retry on failure.
 *
 * @param {string} pdfUrl - The URL to fetch the PDF from.
 * @param {string} patentId - The patent identifier for storage key.
 * @param {number} retries - Number of retries remaining (default 1).
 */
async function fetchPdfWithRetry(pdfUrl, patentId, retries = 1) {
  try {
    const response = await fetch(pdfUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const blob = await response.blob();
    await storePdfInIndexedDB(patentId, blob);

    chrome.runtime.sendMessage({
      type: MSG.PDF_FETCH_RESULT,
      success: true,
      patentId,
    });
  } catch (error) {
    if (retries > 0) {
      // One silent retry after 1 second delay
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return fetchPdfWithRetry(pdfUrl, patentId, retries - 1);
    }

    // Final failure — report back to service worker
    chrome.runtime.sendMessage({
      type: MSG.PDF_FETCH_RESULT,
      success: false,
      patentId,
      error: error.message,
    });
  }
}

// ---------------------------------------------------------------------------
// USPTO fetch with retry
// ---------------------------------------------------------------------------

/**
 * Fetch a patent PDF from the Cloudflare Worker with one silent retry on failure.
 *
 * Mirrors fetchPdfWithRetry but calls the Worker proxy instead of Google Patents.
 * On success, stores blob via existing storePdfInIndexedDB so parsePdf() can
 * read it identically to a Google-fetched PDF (UPTO-03).
 *
 * @param {string} patentId - The patent identifier (e.g. "US11234567B2").
 * @param {number} retries - Number of retries remaining (default 1).
 */
async function fetchUsptoWithRetry(patentId, retries = 1) {
  try {
    const workerUrl = `${WORKER_URL}?patent=${encodeURIComponent(patentId)}`;
    const response = await fetch(workerUrl, {
      headers: { 'Authorization': `Bearer ${PROXY_TOKEN}` },
    });
    if (!response.ok) {
      const errorText = await response.text().catch(() => `HTTP ${response.status}`);
      throw new Error(errorText);
    }
    const blob = await response.blob();
    await storePdfInIndexedDB(patentId, blob);
    chrome.runtime.sendMessage({
      type: MSG.USPTO_FETCH_RESULT,
      success: true,
      patentId,
    });
  } catch (error) {
    if (retries > 0) {
      // One silent retry after 1 second delay
      await new Promise((r) => setTimeout(r, 1000));
      return fetchUsptoWithRetry(patentId, retries - 1);
    }

    // Final failure — report back to service worker
    chrome.runtime.sendMessage({
      type: MSG.USPTO_FETCH_RESULT,
      success: false,
      patentId,
      error: error.message,
    });
  }
}

// ---------------------------------------------------------------------------
// Cache check and hit handling (CACH-01, CACH-02)
// ---------------------------------------------------------------------------

/**
 * Check the Cloudflare KV cache for a pre-parsed position map.
 * Uses a 3-second AbortController timeout — falls through silently on timeout or error.
 *
 * @param {string} patentId - The patent identifier to look up in the cache.
 * @returns {Promise<object|null>} The cached data or null on miss/timeout/error.
 */
async function checkCache(patentId) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);

  try {
    const url = `${WORKER_URL}/cache?patent=${encodeURIComponent(patentId)}&v=${CACHE_VERSION}`;
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${PROXY_TOKEN}` },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) return null;  // 404 = cache miss, other errors = fallthrough
    return await response.json();
  } catch (err) {
    clearTimeout(timeoutId);
    // AbortError (timeout) or network error — fall through silently
    console.warn('[Offscreen] Cache check failed:', err.message);
    return null;
  }
}

/**
 * Orchestrate cache check and route to hit or miss handler.
 *
 * @param {string} patentId - The patent identifier.
 * @param {string|null} pdfUrl - The PDF URL to pass through on miss.
 */
async function handleCheckCache(patentId, pdfUrl) {
  console.log(`[Offscreen] Checking cache for ${patentId}`);
  const cached = await checkCache(patentId);

  if (cached && cached.entries && cached.meta) {
    console.log(`[Offscreen] Cache HIT for ${patentId} — ${cached.entries.length} entries`);
    await handleCacheHit(patentId, cached);
  } else {
    console.log(`[Offscreen] Cache MISS for ${patentId}`);
    chrome.runtime.sendMessage({
      type: MSG.CACHE_MISS,
      patentId,
      pdfUrl,  // pass through for service worker to continue PDF fetch
    });
  }
}

/**
 * Store position map from cache hit into IndexedDB and signal service worker.
 *
 * Critical: positionMap MUST be written to IndexedDB — lookupPosition() reads
 * from IndexedDB exclusively. Without this write, cache hit causes 'no-position-map' errors.
 *
 * @param {string} patentId - The patent identifier.
 * @param {object} cachedData - The cached data with entries and meta.
 */
async function handleCacheHit(patentId, cachedData) {
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('pdfs', 'readwrite');
      const store = tx.objectStore('pdfs');
      store.put({
        patentId,
        pdf: null,             // No PDF blob on cache hit
        timestamp: Date.now(),
        positionMap: cachedData.entries,
        positionMapMeta: cachedData.meta,
      });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = (e) => { db.close(); reject(e); };
    });

    chrome.runtime.sendMessage({
      type: MSG.CACHE_HIT_RESULT,
      patentId,
      lineCount: cachedData.meta.totalLines,
      columnCount: cachedData.meta.totalColumns,
    });
  } catch (err) {
    console.warn('[Offscreen] Cache hit IndexedDB write failed:', err.message);
    // Fall through to PDF fetch on IndexedDB failure
    chrome.runtime.sendMessage({
      type: MSG.CACHE_MISS,
      patentId,
      pdfUrl: null,  // pdfUrl not available here; service worker will need to handle
    });
  }
}

/**
 * Upload the position map for a parsed patent to the Cloudflare KV cache.
 * Fire-and-forget — errors are swallowed to never impact the user experience.
 *
 * Strips bounding box fields (x, y, width, height) from each entry per locked decision.
 * Only caches: text, column, lineNumber, page, section, hasWrapHyphen.
 *
 * @param {string} patentId - The patent identifier to upload cache for.
 */
async function uploadToCache(patentId) {
  try {
    const db = await openDb();
    const record = await new Promise((resolve, reject) => {
      const tx = db.transaction('pdfs', 'readonly');
      const store = tx.objectStore('pdfs');
      const request = store.get(patentId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = (event) => reject(new Error(`IndexedDB read: ${event.target.error}`));
      tx.oncomplete = () => db.close();
    });

    if (!record?.positionMap || !record?.positionMapMeta) {
      console.warn('[Offscreen] No positionMap to upload for', patentId);
      return;
    }

    // Strip bounding box fields per locked decision — only cache:
    // text, column, lineNumber, page, section, hasWrapHyphen
    const entries = record.positionMap.map(({ text, column, lineNumber, page, section, hasWrapHyphen }) => ({
      text, column, lineNumber, page, section, hasWrapHyphen,
    }));

    const payload = {
      entries,
      meta: {
        totalLines: record.positionMapMeta.totalLines,
        totalColumns: record.positionMapMeta.totalColumns,
        hasClaimsSection: record.positionMapMeta.hasClaimsSection,
      },
      cachedAt: Date.now(),
      version: CACHE_VERSION,
    };

    const url = `${WORKER_URL}/cache?patent=${encodeURIComponent(patentId)}&v=${CACHE_VERSION}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PROXY_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    console.log(`[Offscreen] Cache upload for ${patentId}: ${resp.status} ${resp.statusText}`);
  } catch (err) {
    // Silently ignore — cache upload failure must never affect user
    console.warn('[Offscreen] Cache upload failed:', err.message);
  }
}

// ---------------------------------------------------------------------------
// IndexedDB operations
// ---------------------------------------------------------------------------

/**
 * Open the patent-cite-tool IndexedDB database.
 *
 * @returns {Promise<IDBDatabase>} The opened database.
 */
function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('patent-cite-tool', 1);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('pdfs')) {
        db.createObjectStore('pdfs', { keyPath: 'patentId' });
      }
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onerror = (event) => {
      reject(new Error(`IndexedDB open failed: ${event.target.error}`));
    };
  });
}

/**
 * Store a PDF blob in IndexedDB.
 *
 * @param {string} patentId - The patent identifier (used as key).
 * @param {Blob} blob - The PDF binary data.
 * @returns {Promise<void>} Resolves when the transaction completes.
 */
async function storePdfInIndexedDB(patentId, blob) {
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction('pdfs', 'readwrite');
    const store = tx.objectStore('pdfs');

    store.put({
      patentId,
      pdf: blob,
      timestamp: Date.now(),
    });

    tx.oncomplete = () => {
      db.close();
      resolve();
    };

    tx.onerror = (event) => {
      db.close();
      reject(new Error(`IndexedDB write failed: ${event.target.error}`));
    };
  });
}

// ---------------------------------------------------------------------------
// Citation lookup — retrieve PositionMap and run matching
// ---------------------------------------------------------------------------

/**
 * Look up selected text in the stored PositionMap.
 *
 * Retrieves the PositionMap from IndexedDB, runs the matching
 * algorithm, and sends the result back via CITATION_RESULT message.
 *
 * @param {string} selectedText - Text selected by the user.
 * @param {string} patentId - Patent identifier for IndexedDB lookup.
 * @param {number} tabId - Tab ID for routing the response back.
 */
async function lookupPosition(selectedText, patentId, tabId, contextBefore, contextAfter) {
  try {
    const db = await openDb();
    const record = await new Promise((resolve, reject) => {
      const tx = db.transaction('pdfs', 'readonly');
      const store = tx.objectStore('pdfs');
      const request = store.get(patentId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = (event) => reject(new Error(`IndexedDB read: ${event.target.error}`));
      tx.oncomplete = () => db.close();
    });

    if (!record || !record.positionMap || record.positionMap.length === 0) {
      chrome.runtime.sendMessage({
        type: MSG.CITATION_RESULT,
        tabId,
        success: false,
        error: 'no-position-map',
      });
      return;
    }

    const pm = record.positionMap;
    const result = matchAndCite(selectedText, pm, contextBefore, contextAfter);

    if (result) {
      chrome.runtime.sendMessage({
        type: MSG.CITATION_RESULT,
        tabId,
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
      });
    } else {
      chrome.runtime.sendMessage({
        type: MSG.CITATION_RESULT,
        tabId,
        success: false,
        error: 'no-match',
      });
    }
  } catch (error) {
    console.error('[Offscreen] Lookup error:', error);
    chrome.runtime.sendMessage({
      type: MSG.CITATION_RESULT,
      tabId,
      success: false,
      error: error.message,
    });
  }
}

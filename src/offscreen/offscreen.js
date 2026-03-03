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

// Local message type constants (offscreen cannot import shared/constants.js)
const FETCH_PDF = 'fetch-pdf';
const PDF_FETCH_RESULT = 'pdf-fetch-result';
const PARSE_PDF = 'parse-pdf';
const PARSE_RESULT = 'parse-result';
const LOOKUP_POSITION = 'lookup-position';
const CITATION_RESULT = 'citation-result';
const FETCH_USPTO_PDF = 'fetch-uspto-pdf';
const USPTO_FETCH_RESULT = 'uspto-fetch-result';
const CHECK_CACHE = 'check-cache';
const CACHE_HIT_RESULT = 'cache-hit-result';
const CACHE_MISS = 'cache-miss';
const UPLOAD_TO_CACHE = 'upload-to-cache';

// Worker configuration — Cloudflare Worker proxy for USPTO ODP and KV cache
const WORKER_URL = 'https://pct.tonyrowles.com';
const PROXY_TOKEN = '4509b9943f831fb140eb0c3a7304f23cc6f72e41b5e5f8c800a42e94f09cadbe';

// Cache version — bump to invalidate all cached entries
const CACHE_VERSION = 'v1';

// ---------------------------------------------------------------------------
// Message listener — top-level registration
// ---------------------------------------------------------------------------



chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === FETCH_PDF) {
    fetchPdfWithRetry(message.pdfUrl, message.patentId);
  } else if (message.type === PARSE_PDF) {
    parsePdf(message.patentId);
  } else if (message.type === LOOKUP_POSITION && message.tabId) {
    // Only process if tabId is present (forwarded by service worker).
    // Content script's chrome.runtime.sendMessage also reaches us directly
    // but without tabId — ignore those to prevent duplicate processing.
    lookupPosition(message.selectedText, message.patentId, message.tabId,
      message.contextBefore || '', message.contextAfter || '');
  } else if (message.type === FETCH_USPTO_PDF) {
    fetchUsptoWithRetry(message.patentId);
  } else if (message.type === CHECK_CACHE) {
    handleCheckCache(message.patentId, message.pdfUrl);
  } else if (message.type === UPLOAD_TO_CACHE) {
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
      type: PARSE_RESULT,
      success: true,
      patentId,
      pageCount: pageResults.length,
      lineCount: positionMap.length,
      columnCount: positionMap.length > 0 ? positionMap[positionMap.length - 1].column : 0,
    });
  } catch (error) {
    if (error.message === 'NO_TEXT_LAYER') {
      chrome.runtime.sendMessage({
        type: PARSE_RESULT,
        success: false,
        patentId,
        error: 'no-text-layer',
      });
    } else {
      console.error(`[Offscreen] PDF parse error for ${patentId}:`, error);
      chrome.runtime.sendMessage({
        type: PARSE_RESULT,
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
      type: PDF_FETCH_RESULT,
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
      type: PDF_FETCH_RESULT,
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
      type: USPTO_FETCH_RESULT,
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
      type: USPTO_FETCH_RESULT,
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
      type: CACHE_MISS,
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
      type: CACHE_HIT_RESULT,
      patentId,
      lineCount: cachedData.meta.totalLines,
      columnCount: cachedData.meta.totalColumns,
    });
  } catch (err) {
    console.warn('[Offscreen] Cache hit IndexedDB write failed:', err.message);
    // Fall through to PDF fetch on IndexedDB failure
    chrome.runtime.sendMessage({
      type: CACHE_MISS,
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
 * Note: The matching functions (normalizeText, matchAndCiteOffscreen, etc.)
 * are duplicated here from text-matcher.js because offscreen documents
 * cannot share classic script globals with content scripts.
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
        type: CITATION_RESULT,
        tabId,
        success: false,
        error: 'no-position-map',
      });
      return;
    }

    const pm = record.positionMap;
    const result = matchAndCiteOffscreen(selectedText, pm, contextBefore, contextAfter);

    if (result) {
      chrome.runtime.sendMessage({
        type: CITATION_RESULT,
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
        type: CITATION_RESULT,
        tabId,
        success: false,
        error: 'no-match',
      });
    }
  } catch (error) {
    console.error('[Offscreen] Lookup error:', error);
    chrome.runtime.sendMessage({
      type: CITATION_RESULT,
      tabId,
      success: false,
      error: error.message,
    });
  }
}

// ---------------------------------------------------------------------------
// Text matching functions (duplicated from text-matcher.js)
//
// Offscreen documents run as ES modules and cannot share classic script
// globals with content scripts. These functions are kept identical to
// text-matcher.js for consistency.
// ---------------------------------------------------------------------------

/**
 * Whitespace-stripped matching. Removes all whitespace from both the
 * normalized selection and the concat, finds the match in stripped space,
 * then maps back to original concat positions for boundary resolution.
 *
 * Handles PDF text item boundary issues: spaces inside words, spaces
 * before punctuation, missing spaces, etc.
 */
function whitespaceStrippedMatch(normalized, concat, boundaries, positionMap, contextBefore, contextAfter) {
  const selStripped = normalized.replace(/\s/g, '');
  if (selStripped.length < 2) return null;

  // Build stripped concat with position mapping back to original
  const concatStripped = [];
  const strippedToOriginal = []; // strippedToOriginal[i] = original index
  for (let i = 0; i < concat.length; i++) {
    if (!/\s/.test(concat[i])) {
      strippedToOriginal.push(i);
      concatStripped.push(concat[i]);
    }
  }
  const concatStrippedStr = concatStripped.join('');

  // Try exact match in stripped space — find all occurrences for disambiguation
  let allIdx = findAllOccurrences(concatStrippedStr, selStripped);
  let confidence = 0.99;

  // Try case-insensitive if exact fails
  if (allIdx.length === 0) {
    allIdx = findAllOccurrences(concatStrippedStr.toLowerCase(), selStripped.toLowerCase());
    confidence = 0.98;
  }

  // Try with trailing/leading punctuation trimmed
  if (allIdx.length === 0) {
    const trimmed = selStripped.replace(/^[.,;:!?]+/, '').replace(/[.,;:!?]+$/, '');
    if (trimmed.length >= 2 && trimmed !== selStripped) {
      allIdx = findAllOccurrences(concatStrippedStr, trimmed);
      confidence = 0.98;
      if (allIdx.length === 0) {
        allIdx = findAllOccurrences(concatStrippedStr.toLowerCase(), trimmed.toLowerCase());
        confidence = 0.97;
      }
    }
  }

  // Pick best occurrence using context (map stripped positions to original)
  let idx = -1;
  if (allIdx.length > 0) {
    if (allIdx.length === 1) {
      idx = allIdx[0];
    } else {
      // Map each stripped position to original concat space, then score by context
      const origPositions = allIdx.map(si => strippedToOriginal[si]);
      const origLen = strippedToOriginal[allIdx[0] + selStripped.length - 1] + 1 - strippedToOriginal[allIdx[0]];
      const bestOrig = pickBestByContext(origPositions, origLen, concat, contextBefore, contextAfter);
      idx = allIdx[origPositions.indexOf(bestOrig)];
    }
  }

  // Punctuation-agnostic match: strip all punctuation AND whitespace from both
  // sides. Handles HTML/PDF differences like "Calif.)" vs "Calif".
  if (idx === -1) {
    const selAlpha = selStripped.replace(/[^a-zA-Z0-9]/g, '');
    const concatAlpha = concatStrippedStr.replace(/[^a-zA-Z0-9]/g, '');
    if (selAlpha.length >= 2) {
      let alphaIdx = concatAlpha.indexOf(selAlpha);
      if (alphaIdx === -1) {
        alphaIdx = concatAlpha.toLowerCase().indexOf(selAlpha.toLowerCase());
      }
      if (alphaIdx !== -1) {
        // Map back: find the corresponding position in concatStrippedStr
        // by walking concatStrippedStr and counting alphanumeric chars
        let alphaCount = 0;
        let mappedStart = -1;
        let mappedEnd = -1;
        for (let i = 0; i < concatStrippedStr.length; i++) {
          if (/[a-zA-Z0-9]/.test(concatStrippedStr[i])) {
            if (alphaCount === alphaIdx) mappedStart = i;
            if (alphaCount === alphaIdx + selAlpha.length - 1) { mappedEnd = i + 1; break; }
            alphaCount++;
          }
        }
        if (mappedStart !== -1 && mappedEnd !== -1) {
          idx = mappedStart;
          confidence = 0.96;
          // Adjust origStart/origEnd using mapped positions
          const origStart = strippedToOriginal[mappedStart];
          const origEnd = strippedToOriginal[mappedEnd - 1] + 1;
          return resolveMatchOffscreen(origStart, origEnd, boundaries, positionMap, confidence);
        }
      }
    }
  }

  if (idx === -1) return null;

  // Map stripped match positions back to original concat positions
  const origStart = strippedToOriginal[idx];
  const origEnd = strippedToOriginal[idx + selStripped.length - 1] + 1;

  return resolveMatchOffscreen(origStart, origEnd, boundaries, positionMap, confidence);
}

/**
 * Bookend matching: match the beginning and end of the selection separately.
 *
 * For longer selections, the middle may differ between HTML and PDF due to
 * running headers leaking into the concat, minor text differences, etc.
 * This strategy finds where the start and end of the selection land in the
 * concat and returns a citation spanning from start to end.
 *
 * Uses whitespace-stripped matching for each bookend to handle PDF text
 * boundary issues.
 */
function bookendMatch(normalized, concat, boundaries, positionMap) {
  // Use 50 chars from start and end (in stripped space)
  const BOOKEND_LEN = 50;
  const selStripped = normalized.replace(/\s/g, '');
  if (selStripped.length < BOOKEND_LEN * 2) return null;

  const prefix = selStripped.substring(0, BOOKEND_LEN);
  const suffix = selStripped.substring(selStripped.length - BOOKEND_LEN);

  // Build stripped concat with position mapping (same as whitespaceStrippedMatch)
  const strippedToOriginal = [];
  const concatStrippedChars = [];
  for (let i = 0; i < concat.length; i++) {
    if (!/\s/.test(concat[i])) {
      strippedToOriginal.push(i);
      concatStrippedChars.push(concat[i]);
    }
  }
  const concatStripped = concatStrippedChars.join('');
  const concatStrippedLower = concatStripped.toLowerCase();
  const prefixLower = prefix.toLowerCase();
  const suffixLower = suffix.toLowerCase();

  // The concat span should be roughly proportional to the selection length.
  // Allow up to 2x the selection length to account for inserted text
  // (running headers, line numbers, etc.) but reject wild mismatches.
  const maxSpan = selStripped.length * 2;

  // Try all occurrences of the prefix, not just the first — the same sentence
  // can appear multiple times in a patent specification.
  let searchFrom = 0;
  while (searchFrom < concatStripped.length) {
    // Find next prefix occurrence (try exact, then case-insensitive)
    let prefixIdx = concatStripped.indexOf(prefix, searchFrom);
    if (prefixIdx === -1) prefixIdx = concatStrippedLower.indexOf(prefixLower, searchFrom);
    if (prefixIdx === -1) break;

    // Find suffix AFTER the prefix
    const suffixSearchStart = prefixIdx + BOOKEND_LEN;
    let suffixIdx = concatStripped.indexOf(suffix, suffixSearchStart);
    if (suffixIdx === -1) suffixIdx = concatStrippedLower.indexOf(suffixLower, suffixSearchStart);

    if (suffixIdx !== -1) {
      const span = (suffixIdx + BOOKEND_LEN) - prefixIdx;

      // Validate: span should be close to selection length (within 2x)
      if (span <= maxSpan) {
        // Map back to original concat positions
        const origStart = strippedToOriginal[prefixIdx];
        const origEnd = strippedToOriginal[suffixIdx + BOOKEND_LEN - 1] + 1;

        const startBoundary = boundaries.find(b => b.charStart <= origStart && b.charEnd > origStart);
        const endBoundary = boundaries.find(b => b.charStart < origEnd && b.charEnd >= origEnd);

        if (startBoundary && endBoundary && endBoundary.entryIdx - startBoundary.entryIdx <= 60) {
          return resolveMatchOffscreen(origStart, origEnd, boundaries, positionMap, 0.92);
        }
      }
    }

    // Try next occurrence of prefix
    searchFrom = prefixIdx + 1;
  }

  return null;
}

function normalizeTextOffscreen(text) {
  return text
    .normalize('NFC')
    // Strip zero-width and invisible characters (common in HTML but absent in PDF)
    .replace(/[\u200B\u200C\u200D\uFEFF\u00AD\u200E\u200F\u2060\u2061\u2062\u2063\u2064]/g, '')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2013\u2014\u2015]/g, '-')
    .replace(/\uFB01/g, 'fi')
    .replace(/\uFB02/g, 'fl')
    .replace(/\uFB00/g, 'ff')
    .replace(/\uFB03/g, 'ffi')
    .replace(/\uFB04/g, 'ffl')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Find all occurrences of needle in haystack.
 * @returns {number[]} Array of start positions.
 */
function findAllOccurrences(haystack, needle) {
  const positions = [];
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    positions.push(idx);
    idx = haystack.indexOf(needle, idx + 1);
  }
  return positions;
}

/**
 * Pick the best match position by comparing surrounding context.
 * When the same phrase appears multiple times in a patent, the DOM context
 * (text before/after the user's selection) disambiguates which occurrence.
 *
 * Scores each position by counting consecutive matching characters between
 * the concat context and the DOM context, working outward from the match.
 */
function pickBestByContext(positions, matchLen, concat, contextBefore, contextAfter) {
  if (positions.length === 1) return positions[0];
  if (!contextBefore && !contextAfter) return positions[positions.length - 1]; // default to last if no context

  const normBefore = contextBefore ? normalizeTextOffscreen(contextBefore) : '';
  const normAfter = contextAfter ? normalizeTextOffscreen(contextAfter) : '';

  // Extract words from context for word-overlap scoring.
  // Character-level consecutive matching fails because HTML and PDF text
  // diverge at whitespace/punctuation boundaries. Word-level comparison
  // is robust to these differences since the actual vocabulary matches.
  const toWords = (s) => s.toLowerCase().split(/\s+/).filter(w => w.length > 0);
  const beforeWords = toWords(normBefore);
  const afterWords = toWords(normAfter);

  let bestPos = positions[0];
  let bestScore = -1;

  for (const pos of positions) {
    let score = 0;

    if (beforeWords.length > 0) {
      const before = concat.substring(Math.max(0, pos - normBefore.length - 50), pos);
      const concatWords = toWords(before);
      // Count matching words from the end (nearest to match boundary)
      const minLen = Math.min(concatWords.length, beforeWords.length);
      for (let i = 1; i <= minLen; i++) {
        if (concatWords[concatWords.length - i] === beforeWords[beforeWords.length - i]) score++;
      }
    }

    if (afterWords.length > 0) {
      const after = concat.substring(pos + matchLen, pos + matchLen + normAfter.length + 50);
      const concatWords = toWords(after);
      // Count matching words from the start (nearest to match boundary)
      const minLen = Math.min(concatWords.length, afterWords.length);
      for (let i = 0; i < minLen; i++) {
        if (concatWords[i] === afterWords[i]) score++;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestPos = pos;
    }
  }

  return bestPos;
}

/**
 * Core matching function for offscreen context.
 * Identical logic to matchAndCite in text-matcher.js.
 */
export function matchAndCiteOffscreen(selectedText, positionMap, contextBefore, contextAfter) {
  let normalized = normalizeTextOffscreen(selectedText);
  if (!normalized || normalized.length < 2) return null;
  if (!positionMap || positionMap.length === 0) return null;

  // Strip HTML-copy line-wrap artifacts from the selected text.
  // When a user selects text on a patent page, the HTML renderer includes
  // the soft-hyphen line-break as a literal "- " (hyphen-space) followed by
  // the continued word on the next visual line. In the PDF, these words are
  // joined without a hyphen (the hyphen is a wrap artifact, not a real hyphen).
  //
  // Pattern: a hyphen followed by a space then a LOWERCASE letter is a wrap
  // artifact. A real hyphen ("well-known") has no space after it.
  //
  // Applied ONLY to the selected text (normalized), NOT to the PDF concat,
  // because the PDF already joins wrap-hyphenated words correctly.
  //
  // Before: "trans- actions, borne by consumers" (HTML copy)
  // After:  "transactions, borne by consumers" (matches PDF concat)
  normalized = normalized.replace(/- ([a-z])/g, '$1');

  let concat = '';
  const boundaries = [];

  for (let i = 0; i < positionMap.length; i++) {
    const entry = positionMap[i];
    let lineText = normalizeTextOffscreen(entry.text);

    // Detect wrap hyphens: previous line ends with a hyphen-like character
    // and this line starts with a lowercase letter (same column).
    // Check RAW text (before normalization) because soft hyphens (U+00AD)
    // get stripped by normalization, making them invisible in the concat.
    const prev = positionMap[i - 1];
    const prevIsWrapHyphen = prev && prev.column === entry.column && /^[a-z]/.test(lineText) && (
      prev.hasWrapHyphen ||
      concat.endsWith('-') ||
      /[-\u00AD\u2010\u2011\u2012]\s*$/.test(prev.text)
    );

    if (prevIsWrapHyphen) {
      // Strip any trailing hyphen from concat (may already be gone if soft hyphen)
      concat = concat.replace(/-$/, '');
    } else if (concat.length > 0) {
      concat += ' ';
    }

    const charStart = concat.length;
    concat += lineText;
    boundaries.push({ charStart, charEnd: concat.length, entryIdx: i });
  }

  // Exact normalized match — find all occurrences and disambiguate by context
  const allPositions = findAllOccurrences(concat, normalized);
  if (allPositions.length > 0) {
    const bestPos = pickBestByContext(allPositions, normalized.length, concat, contextBefore, contextAfter);
    return resolveMatchOffscreen(bestPos, bestPos + normalized.length, boundaries, positionMap, 1.0);
  }

  // Whitespace-stripped match: PDF text items have inconsistent boundaries
  // causing spaces inside words ("nucle otide") or before punctuation
  // ("herein , the"). Strip all whitespace from both sides and match,
  // then map back to the original concat positions.
  const strippedResult = whitespaceStrippedMatch(normalized, concat, boundaries, positionMap, contextBefore, contextAfter);
  if (strippedResult) return strippedResult;

  // Bookend match: for longer selections where the middle may differ between
  // HTML and PDF (running headers leaking in, text differences, etc.), match
  // the beginning and end of the selection separately and cite from start to end.
  if (normalized.length > 60) {
    const bookendResult = bookendMatch(normalized, concat, boundaries, positionMap);
    if (bookendResult) return bookendResult;
  }

  // Fuzzy fallback
  const fuzzyResult = fuzzySubstringMatchOffscreen(normalized, concat);
  if (fuzzyResult && fuzzyResult.similarity >= 0.80) {
    return resolveMatchOffscreen(
      fuzzyResult.start, fuzzyResult.end,
      boundaries, positionMap, fuzzyResult.similarity
    );
  }

  return null;
}

/**
 * Map character-level match back to PositionMap entries.
 */
function resolveMatchOffscreen(matchStart, matchEnd, boundaries, positionMap, confidence) {
  const startBoundary = boundaries.find(b => b.charStart <= matchStart && b.charEnd > matchStart);
  const endBoundary = boundaries.find(b => b.charStart < matchEnd && b.charEnd >= matchEnd);

  if (!startBoundary || !endBoundary) return null;

  const startEntry = positionMap[startBoundary.entryIdx];
  const endEntry = positionMap[endBoundary.entryIdx];

  return {
    citation: formatCitationOffscreen(startEntry, endEntry),
    startEntry,
    endEntry,
    confidence,
  };
}

/**
 * Format citation string from start/end entries.
 */
function formatCitationOffscreen(startEntry, endEntry) {
  const startCol = startEntry.column;
  const startLine = startEntry.lineNumber;
  const endCol = endEntry.column;
  const endLine = endEntry.lineNumber;

  if (startCol === endCol && startLine === endLine) {
    return `${startCol}:${startLine}`;
  } else if (startCol === endCol) {
    return `${startCol}:${startLine}-${endLine}`;
  } else {
    return `${startCol}:${startLine}-${endCol}:${endLine}`;
  }
}

/**
 * Levenshtein-based sliding window fuzzy substring match.
 *
 * Capped at needle length <= 100 to prevent hanging on long selections.
 * For longer selections, exact match is required (fuzzy skipped).
 */
function fuzzySubstringMatchOffscreen(needle, haystack) {
  const n = needle.length;
  if (n === 0 || n > 100) return null;
  const maxDistance = Math.floor(n * 0.2);

  let bestSimilarity = 0;
  let bestStart = -1;
  let bestEnd = -1;

  const windowMin = Math.max(1, n - maxDistance);
  const windowMax = n + maxDistance;

  for (let windowSize = windowMin; windowSize <= windowMax; windowSize++) {
    for (let start = 0; start <= haystack.length - windowSize; start++) {
      const candidate = haystack.substring(start, start + windowSize);
      const distance = levenshteinOffscreen(needle, candidate);
      const similarity = 1 - distance / Math.max(n, windowSize);

      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestStart = start;
        bestEnd = start + windowSize;
      }
    }
  }

  if (bestSimilarity >= 0.80) {
    return { start: bestStart, end: bestEnd, similarity: bestSimilarity };
  }
  return null;
}

/**
 * Levenshtein edit distance.
 */
function levenshteinOffscreen(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

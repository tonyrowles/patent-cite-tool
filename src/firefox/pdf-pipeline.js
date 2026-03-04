/**
 * PDF pipeline for the Firefox extension.
 *
 * Absorbs all logic from src/offscreen/offscreen.js but uses direct function
 * calls instead of Chrome's message-passing pattern. Background.js calls these
 * exported functions directly and awaits their return values.
 *
 * IndexedDB degradation (FOX-05): if an IndexedDB write fails with
 * InvalidStateError, `idbAvailable` is set to false and all subsequent
 * IndexedDB operations are skipped. The `positionMapCache` Map is used as
 * an in-memory fallback so citations continue to work without local storage.
 *
 * This file is an ES module — no chrome.runtime.sendMessage calls.
 */

import { extractTextFromPdf } from '../offscreen/pdf-parser.js';
import { buildPositionMap } from '../offscreen/position-map-builder.js';
import { matchAndCite } from '../shared/matching.js';
import { MSG } from '../shared/constants.js';

// Worker configuration — Cloudflare Worker proxy for USPTO ODP and KV cache
const WORKER_URL = 'https://pct.tonyrowles.com';
const PROXY_TOKEN = '4509b9943f831fb140eb0c3a7304f23cc6f72e41b5e5f8c800a42e94f09cadbe';

// Cache version — bump to invalidate all cached entries
const CACHE_VERSION = 'v2';

// ---------------------------------------------------------------------------
// IndexedDB degradation state (FOX-05)
// ---------------------------------------------------------------------------

/** Whether IndexedDB is still usable. Flipped to false on first write failure. */
let idbAvailable = true;

/**
 * In-memory position map cache — used when idbAvailable is false.
 * Key: patentId (string)
 * Value: { positionMap: Array, positionMapMeta: object }
 */
const positionMapCache = new Map();

// ---------------------------------------------------------------------------
// IndexedDB helpers
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
 * Mark IndexedDB as unavailable and log a single warning.
 * Called on first write failure — all subsequent IDB calls are skipped silently.
 *
 * @param {Error} err - The error that triggered degradation.
 */
function degradeIdb(err) {
  idbAvailable = false;
  console.warn('[Firefox] IndexedDB unavailable, using in-memory cache:', err.message);
}

/**
 * Store position map data in IndexedDB or positionMapCache fallback.
 *
 * @param {string} patentId
 * @param {Array}  positionMap
 * @param {object} positionMapMeta
 * @param {Blob|null} pdfBlob - Optional PDF blob to persist alongside the map.
 * @param {number|null} timestamp - Optional existing timestamp to preserve.
 */
async function storePositionMap(patentId, positionMap, positionMapMeta, pdfBlob = null, timestamp = null) {
  // Always keep an in-memory copy as the authoritative lookup path
  positionMapCache.set(patentId, { positionMap, positionMapMeta });

  if (!idbAvailable) return;

  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('pdfs', 'readwrite');
      const store = tx.objectStore('pdfs');

      store.put({
        patentId,
        pdf: pdfBlob,
        timestamp: timestamp ?? Date.now(),
        positionMap,
        positionMapMeta,
      });

      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = (event) => {
        db.close();
        const err = event.target.error;
        // InvalidStateError: DB connection was closed / context torn down
        if (err && (err.name === 'InvalidStateError' || err.name === 'UnknownError')) {
          degradeIdb(err);
          resolve(); // In-memory already written above — not fatal
        } else {
          reject(new Error(`IndexedDB write failed: ${err}`));
        }
      };
    });
  } catch (err) {
    if (err.name === 'InvalidStateError' || err.name === 'UnknownError') {
      degradeIdb(err);
    } else {
      console.warn('[Firefox] IDB storePositionMap error:', err.message);
    }
  }
}

/**
 * Read a position map record from IndexedDB or positionMapCache.
 *
 * @param {string} patentId
 * @returns {Promise<{positionMap: Array, positionMapMeta: object}|null>}
 */
async function readPositionMap(patentId) {
  // Always check in-memory first (populated on every write path)
  if (positionMapCache.has(patentId)) {
    return positionMapCache.get(patentId);
  }

  if (!idbAvailable) return null;

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
      return null;
    }

    // Populate in-memory cache so subsequent calls skip IDB
    const entry = {
      positionMap: record.positionMap,
      positionMapMeta: record.positionMapMeta,
    };
    positionMapCache.set(patentId, entry);
    return entry;
  } catch (err) {
    console.warn('[Firefox] IDB readPositionMap error:', err.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Cache check (Cloudflare KV)
// ---------------------------------------------------------------------------

/**
 * Check the Cloudflare KV cache for a pre-parsed position map.
 * Uses a 3-second AbortController timeout — falls through silently on timeout or error.
 *
 * @param {string} patentId
 * @returns {Promise<object|null>} Cached data with entries + meta, or null on miss.
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

    if (!response.ok) return null; // 404 = cache miss
    return await response.json();
  } catch (err) {
    clearTimeout(timeoutId);
    // AbortError (timeout) or network error — fall through silently
    console.warn('[Firefox] Cache check failed:', err.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Exported pipeline functions
// ---------------------------------------------------------------------------

/**
 * Check Cloudflare KV cache for a pre-parsed position map.
 *
 * On cache hit: stores positionMap in IndexedDB (or positionMapCache if idb unavailable)
 * and returns hit details. On miss: returns { hit: false, pdfUrl }.
 *
 * Absorbs handleCheckCache() + handleCacheHit() + checkCache() from offscreen.js.
 *
 * @param {string} patentId
 * @param {string|null} pdfUrl - Pass-through on cache miss so caller can continue fetch.
 * @returns {Promise<{hit: true, lineCount: number, columnCount: number} | {hit: false, pdfUrl: string|null}>}
 */
export async function checkServerCache(patentId, pdfUrl) {
  console.log(`[Firefox] Checking cache for ${patentId}`);
  const cached = await checkCache(patentId);

  if (cached && cached.entries && cached.meta) {
    console.log(`[Firefox] Cache HIT for ${patentId} — ${cached.entries.length} entries`);

    await storePositionMap(
      patentId,
      cached.entries,
      cached.meta,
    );

    return {
      hit: true,
      lineCount: cached.meta.totalLines,
      columnCount: cached.meta.totalColumns,
    };
  }

  console.log(`[Firefox] Cache MISS for ${patentId}`);
  return { hit: false, pdfUrl };
}

/**
 * Fetch a patent PDF from Google Patents storage, parse it, and store the position map.
 *
 * Steps:
 *   1. Fetch PDF blob with one silent retry on failure.
 *   2. Store blob in IndexedDB (skipped if idb unavailable).
 *   3. Parse PDF with extractTextFromPdf.
 *   4. Build positionMap with buildPositionMap.
 *   5. Store positionMap in IndexedDB or positionMapCache.
 *
 * Absorbs fetchPdfWithRetry() + parsePdf() + storePdfInIndexedDB() from offscreen.js.
 *
 * @param {string} patentId
 * @param {string} pdfUrl - Google Patents storage URL.
 * @returns {Promise<{success: true, lineCount: number, columnCount: number} | {success: false, error: string}>}
 */
export async function fetchAndParsePdf(patentId, pdfUrl) {
  // Step 1: Fetch PDF blob with retry
  let blob;
  try {
    blob = await fetchWithRetry(pdfUrl, {});
  } catch (err) {
    return { success: false, error: err.message };
  }

  // Step 2: Store PDF blob in IndexedDB (best-effort)
  if (idbAvailable) {
    try {
      const db = await openDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction('pdfs', 'readwrite');
        const store = tx.objectStore('pdfs');
        store.put({ patentId, pdf: blob, timestamp: Date.now() });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = (event) => {
          db.close();
          const err = event.target.error;
          if (err && (err.name === 'InvalidStateError' || err.name === 'UnknownError')) {
            degradeIdb(err);
            resolve(); // Non-fatal
          } else {
            reject(new Error(`IndexedDB blob write failed: ${err}`));
          }
        };
      });
    } catch (err) {
      if (err.name === 'InvalidStateError' || err.name === 'UnknownError') {
        degradeIdb(err);
      } else {
        console.warn('[Firefox] PDF blob IDB write error:', err.message);
      }
    }
  }

  // Step 3-4: Parse PDF and build position map
  return await parsePdfBlob(patentId, blob);
}

/**
 * Fetch a patent PDF from the Cloudflare Worker proxy, parse it, and store the position map.
 *
 * Same flow as fetchAndParsePdf but calls the Worker proxy endpoint instead of Google.
 *
 * Absorbs fetchUsptoWithRetry() from offscreen.js.
 *
 * @param {string} patentId
 * @returns {Promise<{success: true, lineCount: number, columnCount: number} | {success: false, error: string}>}
 */
export async function fetchUsptoAndParse(patentId) {
  const workerUrl = `${WORKER_URL}?patent=${encodeURIComponent(patentId)}`;

  let blob;
  try {
    blob = await fetchWithRetry(workerUrl, {
      headers: { 'Authorization': `Bearer ${PROXY_TOKEN}` },
    });
  } catch (err) {
    return { success: false, error: err.message };
  }

  // Store PDF blob in IndexedDB (best-effort)
  if (idbAvailable) {
    try {
      const db = await openDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction('pdfs', 'readwrite');
        const store = tx.objectStore('pdfs');
        store.put({ patentId, pdf: blob, timestamp: Date.now() });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = (event) => {
          db.close();
          const err = event.target.error;
          if (err && (err.name === 'InvalidStateError' || err.name === 'UnknownError')) {
            degradeIdb(err);
            resolve();
          } else {
            reject(new Error(`IndexedDB blob write failed: ${err}`));
          }
        };
      });
    } catch (err) {
      if (err.name === 'InvalidStateError' || err.name === 'UnknownError') {
        degradeIdb(err);
      } else {
        console.warn('[Firefox] USPTO PDF blob IDB write error:', err.message);
      }
    }
  }

  return await parsePdfBlob(patentId, blob);
}

/**
 * Look up selected text in the stored PositionMap.
 *
 * Reads positionMap from IndexedDB or positionMapCache, runs matchAndCite,
 * and returns the result directly (no message-passing).
 *
 * Absorbs lookupPosition() from offscreen.js.
 *
 * @param {string} selectedText - Text selected by the user.
 * @param {string} patentId - Patent identifier for position map lookup.
 * @param {string} [contextBefore=''] - Text before selection for disambiguation.
 * @param {string} [contextAfter=''] - Text after selection for disambiguation.
 * @returns {Promise<object|null>} Match result from matchAndCite, or null on failure.
 */
export async function lookupPosition(selectedText, patentId, contextBefore = '', contextAfter = '') {
  try {
    const entry = await readPositionMap(patentId);

    if (!entry || !entry.positionMap || entry.positionMap.length === 0) {
      return null;
    }

    const result = matchAndCite(selectedText, entry.positionMap, contextBefore, contextAfter);
    return result || null;
  } catch (error) {
    console.error('[Firefox] Lookup error:', error);
    return null;
  }
}

/**
 * Upload the position map for a parsed patent to the Cloudflare KV cache.
 * Fire-and-forget — errors are swallowed to never impact the user experience.
 *
 * Strips bounding box fields (x, y, width, height) from each entry.
 * Only caches: text, column, lineNumber, page, section, hasWrapHyphen.
 *
 * Absorbs uploadToCache() from offscreen.js.
 *
 * @param {string} patentId
 */
export async function uploadToCache(patentId) {
  try {
    const entry = await readPositionMap(patentId);

    if (!entry?.positionMap || !entry?.positionMapMeta) {
      console.warn('[Firefox] No positionMap to upload for', patentId);
      return;
    }

    // Strip bounding box fields — only cache text, column, lineNumber, page, section, hasWrapHyphen
    const entries = entry.positionMap.map(({ text, column, lineNumber, page, section, hasWrapHyphen }) => ({
      text, column, lineNumber, page, section, hasWrapHyphen,
    }));

    const payload = {
      entries,
      meta: {
        totalLines: entry.positionMapMeta.totalLines,
        totalColumns: entry.positionMapMeta.totalColumns,
        hasClaimsSection: entry.positionMapMeta.hasClaimsSection,
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
    console.log(`[Firefox] Cache upload for ${patentId}: ${resp.status} ${resp.statusText}`);
  } catch (err) {
    // Silently ignore — cache upload failure must never affect the user
    console.warn('[Firefox] Cache upload failed:', err.message);
  }
}

// ---------------------------------------------------------------------------
// Internal helpers (not exported)
// ---------------------------------------------------------------------------

/**
 * Fetch a URL with one silent retry on failure.
 *
 * @param {string} url
 * @param {object} fetchOptions - Options passed to fetch (e.g. headers).
 * @param {number} retries - Retries remaining (default 1).
 * @returns {Promise<Blob>} The response blob.
 * @throws {Error} After all retries are exhausted.
 */
async function fetchWithRetry(url, fetchOptions, retries = 1) {
  try {
    const response = await fetch(url, fetchOptions);
    if (!response.ok) {
      const errorText = await response.text().catch(() => `HTTP ${response.status}`);
      throw new Error(errorText);
    }
    return await response.blob();
  } catch (err) {
    if (retries > 0) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return fetchWithRetry(url, fetchOptions, retries - 1);
    }
    throw err;
  }
}

/**
 * Parse a PDF blob, build position map, store it, and return result.
 * Used by both fetchAndParsePdf and fetchUsptoAndParse.
 *
 * @param {string} patentId
 * @param {Blob} blob - The PDF blob to parse.
 * @returns {Promise<{success: true, lineCount: number, columnCount: number} | {success: false, error: string}>}
 */
async function parsePdfBlob(patentId, blob) {
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const pageResults = await extractTextFromPdf(arrayBuffer);

    const positionMap = buildPositionMap(pageResults);

    // Validate: warn if text items were found but no two-column pages detected
    if (positionMap.length === 0) {
      const totalItems = pageResults.reduce((sum, p) => sum + p.items.length, 0);
      if (totalItems > 0) {
        console.warn(`[Firefox] Patent has ${totalItems} text items but no two-column pages detected`);
      }
    }

    const positionMapMeta = {
      totalLines: positionMap.length,
      totalColumns: positionMap.length > 0 ? positionMap[positionMap.length - 1].column : 0,
      hasClaimsSection: positionMap.some(e => e.section === 'claims'),
      builtAt: Date.now(),
    };

    await storePositionMap(patentId, positionMap, positionMapMeta);

    return {
      success: true,
      lineCount: positionMap.length,
      columnCount: positionMapMeta.totalColumns,
    };
  } catch (error) {
    if (error.message === 'NO_TEXT_LAYER') {
      return { success: false, error: 'no-text-layer' };
    }
    console.error(`[Firefox] PDF parse error for ${patentId}:`, error);
    return { success: false, error: error.message };
  }
}

// tests/e2e/lib/llm-hallucination.js
//
// Phase 31 (LLM-03) — Hallucination guard for the LLM exploratory runner.
//
// The single most important defect-attribution control in Phase 31: text the
// LLM claims appears in a patent spec MUST be verified against the spec before
// we drive the extension and start blaming the plugin for "wrong citations".
//
// Flow:
//   1. extractSpecText(patentId, opts?) — fetches the cached PDF via Phase
//      28's ensureCachedPdf(), runs pdfjs-dist legacy text extraction page-by-
//      page up to opts.maxPages (default 15), SKIPPING leading pages whose
//      extracted text is < opts.minBodyChars (default 500). Skipped pages are
//      cover / abstract / drawings — they contain no body description. The
//      density heuristic is Pitfall 7's resolution: a fixed "pages 1-2" range
//      misses the body for most patents because the description starts on
//      page 13+ of US11427642 (verified empirically in 31-RESEARCH.md).
//
//   2. selectionInSpec(specText, selectedText) — tiered membership check:
//        a. wsNorm first (collapse whitespace, lowercase, trim) — preserves
//           word boundaries so we avoid the false positive of "abc" matching
//           "ab cdef".
//        b. tightNorm fallback (strip ALL non-alphanumeric, lowercase) — wins
//           the cross-column case where pdfjs gives "pro grammable" instead
//           of "programmable". Pitfall 3 documents that wsNorm alone is
//           insufficient — the rate of false LLM_HALLUCINATED_SELECTION
//           classifications blows up to ~100% without tightNorm fallback.
//
// Cache: module-level Map keyed by `${patentId}:${maxPages}`. In-process only;
// not persisted to disk. The PDF itself IS cached on disk via Phase 28's
// .pdf-cache/, so this Map just spares us the ~330ms pdfjs re-parse when the
// runner extracts the same patent multiple times in one `npm run e2e:explore`
// invocation. RESEARCH.md Open Question 3 resolution.
//
// Independence note: this module imports from tests/e2e/lib/pdf-fetch.js (a
// Phase 28 verifier-side module) but NOT from src/. The strict independence
// contract (VFY-02) applies to pdf-verifier.js only — the hallucination guard
// is a Phase 31 driver-side concern and may share PDF-fetch infrastructure.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { ensureCachedPdf } from './pdf-fetch.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const CMAP_URL = path.resolve(PROJECT_ROOT, 'node_modules/pdfjs-dist/cmaps/') + '/';
const STANDARD_FONT_DATA_URL =
  path.resolve(PROJECT_ROOT, 'node_modules/pdfjs-dist/standard_fonts/') + '/';

// In-process spec-text cache: Map<`${patentId}:${maxPages}`, ExtractResult>.
const specCache = new Map();

/**
 * Collapse all runs of whitespace into a single space, trim, lowercase.
 * Null/undefined-safe — returns '' for falsy inputs.
 *
 * @param {string|null|undefined} s
 * @returns {string}
 */
export function wsNorm(s) {
  return String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Strip ALL non-alphanumeric characters; lowercase. The cross-column / wrap-
 * hyphenation fallback used after wsNorm fails to match.
 * Null/undefined-safe — returns '' for falsy inputs.
 *
 * @param {string|null|undefined} s
 * @returns {string}
 */
export function tightNorm(s) {
  return String(s ?? '').replace(/[^a-zA-Z0-9]+/g, '').toLowerCase();
}

/**
 * Tiered membership check: does `selectedText` appear inside `specText`?
 *
 * Algorithm:
 *   1. If the trimmed needle is empty, return { found: false } — protects
 *      against the LLM returning an empty selectedText (which would
 *      trivially be a substring of every spec).
 *   2. wsNorm both sides; if needle in haystack, return { method: 'wsNorm' }.
 *   3. Otherwise tightNorm both sides; if needle in haystack, return
 *      { method: 'tightNorm' }.
 *   4. Otherwise return { found: false, method: null } — hallucination.
 *
 * @param {string} specText
 * @param {string} selectedText
 * @returns {{ found: boolean, method: 'wsNorm'|'tightNorm'|null, needleIndex?: number }}
 */
export function selectionInSpec(specText, selectedText) {
  const trimmedNeedle = String(selectedText ?? '').trim();
  if (!trimmedNeedle) return { found: false, method: null };

  const haystackWs = wsNorm(specText);
  const needleWs = wsNorm(trimmedNeedle);
  if (needleWs) {
    const i = haystackWs.indexOf(needleWs);
    if (i !== -1) return { found: true, method: 'wsNorm', needleIndex: i };
  }

  const haystackTight = tightNorm(specText);
  const needleTight = tightNorm(trimmedNeedle);
  if (needleTight) {
    const i = haystackTight.indexOf(needleTight);
    if (i !== -1) return { found: true, method: 'tightNorm', needleIndex: i };
  }

  return { found: false, method: null };
}

/**
 * Extract body spec text from a patent PDF, skipping leading low-density pages
 * (cover/abstract/drawings). The first page whose extracted text length is
 * >= minBodyChars marks `bodyStartPage`; subsequent pages up to maxPages are
 * included.
 *
 * Pulls the cached PDF via Phase 28's `ensureCachedPdf()`. Results are
 * memoised in-process by `${patentId}:${maxPages}` until `_clearSpecCache()`
 * is called.
 *
 * @param {string} patentId
 * @param {{ maxPages?: number, minBodyChars?: number }} [opts]
 * @returns {Promise<{ text: string, bodyStartPage: number, pagesExtracted: number, totalPages: number }>}
 */
export async function extractSpecText(patentId, opts = {}) {
  const maxPages = opts.maxPages ?? 15;
  const minBodyChars = opts.minBodyChars ?? 500;
  const cacheKey = `${patentId}:${maxPages}`;
  if (specCache.has(cacheKey)) return specCache.get(cacheKey);

  const pdfPath = await ensureCachedPdf(patentId);
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await getDocument({
    data,
    cMapUrl: CMAP_URL,
    cMapPacked: true,
    standardFontDataUrl: STANDARD_FONT_DATA_URL,
    useSystemFonts: true,
    disableFontFace: true,
  }).promise;
  const totalPages = doc.numPages;

  let bodyStartPage = null;
  const chunks = [];
  let pagesExtracted = 0;
  for (let i = 1; i <= Math.min(maxPages, totalPages); i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map((item) => item.str).join(' ');
    if (bodyStartPage === null) {
      if (pageText.length >= minBodyChars) {
        bodyStartPage = i;
      } else {
        continue; // skip cover / abstract / drawings
      }
    }
    chunks.push(pageText);
    pagesExtracted += 1;
  }
  await doc.destroy();

  const result = {
    text: chunks.join(' '),
    bodyStartPage: bodyStartPage ?? 1,
    pagesExtracted,
    totalPages,
  };
  specCache.set(cacheKey, result);
  return result;
}

/**
 * Test-only convenience: clear the in-process spec cache so the next
 * extractSpecText call must hit disk again. Used by Vitest beforeEach hooks.
 */
export function _clearSpecCache() {
  specCache.clear();
}

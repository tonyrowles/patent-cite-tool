// tests/e2e/lib/pdf-fetch.js
//
// Phase 28 — Google Patents PDF fetcher with local cache.
//
// Loads the Google Patents HTML page for a patent, regex-extracts the first
// `patentimages.storage.googleapis.com/...pdf` href, fetches it, caches to
// tests/e2e/.pdf-cache/{patentId}.pdf, returns the absolute cached path.
//
// Independence claim (VFY-02): no imports from src/. The link-discovery
// algorithm conceptually mirrors src/content/content-script.js#findPdfLink
// but is a fresh implementation in this file.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.resolve(__dirname, '../.pdf-cache');

// A real PDF is always more than a few KB. HTML redirect/error pages
// returned from a misrouted fetch are typically much smaller, so we use
// 5 KB as a "is this actually a PDF?" sanity floor.
const PDF_SIZE_FLOOR_BYTES = 5_000;

/**
 * Scrape the Google Patents page for the first patentimages.storage PDF link.
 *
 * @param {string} patentId   e.g. "US11427642"
 * @returns {Promise<string>} absolute https URL to the PDF asset
 */
async function findPdfLink(patentId) {
  const pageUrl = `https://patents.google.com/patent/${patentId}`;
  const res = await fetch(pageUrl);
  if (!res.ok) {
    throw new Error(`PDF_PAGE_FETCH_FAILED: ${res.status} ${pageUrl}`);
  }
  const html = await res.text();
  const match = html.match(
    /https:\/\/patentimages\.storage\.googleapis\.com\/[^"'\s)]+\.pdf/
  );
  if (!match) {
    throw new Error(`PDF_LINK_NOT_FOUND: no patentimages href in ${pageUrl}`);
  }
  return match[0];
}

/**
 * Ensure a PDF for the given patent ID is cached locally; return absolute path.
 * If a valid cached file exists (size > 5KB), reuse without refetch.
 *
 * @param {string} patentId
 * @returns {Promise<string>} absolute path to cached PDF
 */
export async function ensureCachedPdf(patentId) {
  if (!patentId || typeof patentId !== 'string') {
    throw new Error('ensureCachedPdf: patentId must be a non-empty string');
  }
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const cached = path.join(CACHE_DIR, `${patentId}.pdf`);

  if (
    fs.existsSync(cached) &&
    fs.statSync(cached).size > PDF_SIZE_FLOOR_BYTES
  ) {
    return cached;
  }

  const pdfUrl = await findPdfLink(patentId);
  const res = await fetch(pdfUrl);
  if (!res.ok) {
    throw new Error(`PDF_FETCH_FAILED: ${res.status} ${pdfUrl}`);
  }

  // Pitfall 5: detect HTML-instead-of-PDF response by content-type
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('pdf')) {
    throw new Error(
      `PDF_FETCH_NOT_PDF: content-type was '${contentType}' for ${pdfUrl}`
    );
  }

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < PDF_SIZE_FLOOR_BYTES) {
    throw new Error(
      `PDF_FETCH_TOO_SMALL: ${buf.length} bytes (< ${PDF_SIZE_FLOOR_BYTES})`
    );
  }
  fs.writeFileSync(cached, buf);
  return cached;
}

/** Exposed for diagnostics — absolute cache directory. */
export function getCacheDir() {
  return CACHE_DIR;
}

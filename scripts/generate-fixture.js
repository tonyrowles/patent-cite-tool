#!/usr/bin/env node
/**
 * Fixture generation script for the Patent Citation Tool test harness.
 *
 * Usage:
 *   node scripts/generate-fixture.js US11427642
 *   node scripts/generate-fixture.js US11427642 US5959167 US4723129
 *   node scripts/generate-fixture.js --batch patents.txt
 *
 * For each patent:
 *  1. Scrapes the Google Patents page to find the actual PDF URL
 *     (patentimages.storage.googleapis.com uses hash-based paths that cannot
 *      be predicted from the patent number alone — direct URL construction 403s)
 *  2. Fetches the PDF from the resolved URL
 *  3. Extracts text using pdfjs-dist (Node-compatible build)
 *  4. Runs through buildPositionMap from src/offscreen/position-map-builder.js
 *  5. Writes PositionMap JSON to tests/fixtures/<patentId>.json
 *
 * NOTE: pdf-parser.js imports from src/lib/pdf.mjs (browser-only PDF.js) and
 * calls chrome.runtime.getURL at module scope — it cannot be imported in Node.
 * This script re-implements extraction using pdfjs-dist (same library, Node build).
 */

import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createReadStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';

// Set the worker source to the pdfjs-dist worker file (required in v5+)
// Using file:// URL so Node.js can locate the worker as an ES module
const __workerUrl = new URL('../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs', import.meta.url).href;
GlobalWorkerOptions.workerSrc = __workerUrl;

// ---------------------------------------------------------------------------
// Resolve paths relative to this script
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Google Patents page scraping to find the actual PDF URL
// ---------------------------------------------------------------------------

/**
 * Find the patent PDF URL by scraping the Google Patents page.
 *
 * Google Patent Images are stored with hash-based paths like:
 *   https://patentimages.storage.googleapis.com/8a/22/5e/4d90a531903787/US11427642.pdf
 * Direct URL construction (without the hash) returns HTTP 403.
 * The correct URL is embedded in the Google Patents HTML page.
 *
 * @param {string} patentId - Patent ID (e.g., 'US11427642')
 * @returns {Promise<string>} Resolved PDF download URL.
 * @throws {Error} If the patent page cannot be fetched or PDF URL not found.
 */
async function findPatentPdfUrl(patentId) {
  const pageUrl = `https://patents.google.com/patent/${patentId}`;

  const response = await fetch(pageUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; patent-test-fixture-generator/1.0)',
      'Accept': 'text/html',
    },
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching Google Patents page: ${pageUrl}`);
  }

  const html = await response.text();

  // Extract all PDF URLs from the page HTML
  const pdfUrlRegex = /https:\/\/patentimages\.storage\.googleapis\.com\/[^"'\s]+\.pdf/g;
  const matches = html.match(pdfUrlRegex);

  if (!matches || matches.length === 0) {
    throw new Error(
      `No PDF URL found on Google Patents page for ${patentId}. ` +
      `The patent may not exist or may not have a PDF version.`
    );
  }

  // Prefer the URL that matches the patent ID (there may be drawings too)
  const mainPdfUrl = matches.find(url => url.includes(`/${patentId}.pdf`));
  return mainPdfUrl || matches[0];
}

// ---------------------------------------------------------------------------
// PDF extraction (Node-compatible, mirrors pdf-parser.js logic)
// ---------------------------------------------------------------------------

/**
 * Extract positioned text items from a patent PDF ArrayBuffer.
 * Mirrors extractTextFromPdf from src/offscreen/pdf-parser.js but uses the
 * Node-compatible pdfjs-dist build instead of the extension-bundled pdf.mjs.
 *
 * @param {ArrayBuffer} pdfData - Raw PDF binary data.
 * @returns {Promise<Array<{pageNum: number, items: Array, pageWidth: number, pageHeight: number}>>}
 * @throws {Error} With message 'NO_TEXT_LAYER' if PDF lacks a text layer.
 */
async function extractTextFromPdf(pdfData) {
  const loadingTask = getDocument({
    data: new Uint8Array(pdfData),
    useSystemFonts: true,
    verbosity: 0, // Suppress "Please use the legacy build" warning
  });

  const pdf = await loadingTask.promise;

  // Quick scan to confirm text layer exists
  const pagesToCheck = Math.min(pdf.numPages, 5);
  let totalTextItems = 0;
  for (let i = 1; i <= pagesToCheck; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    totalTextItems += textContent.items.filter(
      (item) => item.str && item.str.trim().length > 0
    ).length;
  }

  if (totalTextItems < 5) {
    await pdf.destroy();
    throw new Error('NO_TEXT_LAYER');
  }

  const results = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1.0 });

    const pageItems = textContent.items
      .filter((item) => item.str && item.str.trim().length > 0)
      .map((item) => ({
        text: item.str,
        x: item.transform[4],
        y: item.transform[5],
        width: item.width,
        height: item.height,
        fontName: item.fontName,
        hasEOL: item.hasEOL,
      }));

    results.push({
      pageNum: i,
      items: pageItems,
      pageWidth: viewport.width,
      pageHeight: viewport.height,
    });
  }

  await pdf.destroy();
  return results;
}

// ---------------------------------------------------------------------------
// Fixture generation (one patent)
// ---------------------------------------------------------------------------

/**
 * Generate a fixture JSON file for one patent.
 *
 * @param {string} patentId - Patent ID (e.g., 'US11427642')
 * @param {{ quiet?: boolean }} opts
 * @returns {Promise<{ patentId: string, entryCount: number, skipped: boolean, reason?: string }>}
 */
async function generateFixture(patentId, { quiet = false } = {}) {
  const fixturesDir = join(projectRoot, 'tests', 'fixtures');
  const outPath = join(fixturesDir, `${patentId}.json`);

  if (!quiet) process.stdout.write(`Fetching ${patentId}...`);

  // Step 1: Find the actual PDF URL from Google Patents page
  let pdfUrl;
  try {
    pdfUrl = await findPatentPdfUrl(patentId);
  } catch (err) {
    if (!quiet) console.log(` FAILED (page scrape): ${err.message}`);
    return { patentId, entryCount: 0, skipped: true, reason: err.message };
  }

  // Step 2: Download the PDF
  let pdfData;
  try {
    const pdfResponse = await fetch(pdfUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; patent-test-fixture-generator/1.0)',
      },
    });
    if (!pdfResponse.ok) {
      throw new Error(`HTTP ${pdfResponse.status} downloading PDF from ${pdfUrl}`);
    }
    pdfData = await pdfResponse.arrayBuffer();
  } catch (err) {
    if (!quiet) console.log(` FAILED (download): ${err.message}`);
    return { patentId, entryCount: 0, skipped: true, reason: err.message };
  }

  if (!quiet) process.stdout.write(` ${(pdfData.byteLength / 1024).toFixed(0)}KB, extracting...`);

  // Step 3: Extract text using pdfjs-dist
  let pageResults;
  try {
    pageResults = await extractTextFromPdf(pdfData);
  } catch (err) {
    if (err.message === 'NO_TEXT_LAYER') {
      if (!quiet) console.log(` WARNING: no text layer — likely scanned PDF. Skipping.`);
      return { patentId, entryCount: 0, skipped: true, reason: 'Scanned PDF — no text layer' };
    }
    throw err;
  }

  // Step 4: Build PositionMap
  const { buildPositionMap } = await import('../src/offscreen/position-map-builder.js');
  const positionMap = buildPositionMap(pageResults);

  if (positionMap.length === 0) {
    if (!quiet) console.log(` WARNING: PositionMap has 0 entries — likely scanned PDF. Skipping.`);
    return { patentId, entryCount: 0, skipped: true, reason: 'PositionMap has 0 entries' };
  }

  if (positionMap.length < 50) {
    if (!quiet) console.log(` WARNING: PositionMap has only ${positionMap.length} entries — likely a scanned PDF without text layer. Skipping.`);
    return { patentId, entryCount: positionMap.length, skipped: true, reason: `PositionMap has only ${positionMap.length} entries` };
  }

  // Step 5: Write fixture JSON
  await mkdir(fixturesDir, { recursive: true });
  await writeFile(outPath, JSON.stringify(positionMap, null, 2), 'utf-8');

  if (!quiet) console.log(` done. Wrote ${positionMap.length} entries to tests/fixtures/${patentId}.json`);
  return { patentId, entryCount: positionMap.length, skipped: false };
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: node scripts/generate-fixture.js <patentId> [<patentId>...]');
    console.error('       node scripts/generate-fixture.js --batch <file.txt>');
    console.error('       node scripts/generate-fixture.js --batch  (read from stdin)');
    process.exit(1);
  }

  let patentIds = [];

  if (args[0] === '--batch') {
    // Read patent IDs from file or stdin
    const source = args[1] ? createReadStream(args[1]) : process.stdin;
    const rl = createInterface({ input: source, crlfDelay: Infinity });
    for await (const line of rl) {
      const id = line.trim();
      if (id && !id.startsWith('#')) patentIds.push(id);
    }
  } else {
    patentIds = args;
  }

  if (patentIds.length === 0) {
    console.error('No patent IDs provided.');
    process.exit(1);
  }

  const results = [];
  for (const id of patentIds) {
    const result = await generateFixture(id);
    results.push(result);
  }

  if (patentIds.length > 1) {
    console.log('\n--- Batch Summary ---');
    const succeeded = results.filter(r => !r.skipped);
    const skipped = results.filter(r => r.skipped);
    console.log(`Succeeded: ${succeeded.length}`);
    console.log(`Skipped: ${skipped.length}`);
    if (skipped.length > 0) {
      console.log('Skipped patents:');
      skipped.forEach(r => console.log(`  ${r.patentId}: ${r.reason}`));
    }
  }

  // Exit with error if all patents failed
  if (results.every(r => r.skipped)) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

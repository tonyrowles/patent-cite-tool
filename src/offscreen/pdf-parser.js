/**
 * PDF text extraction using PDF.js.
 *
 * Extracts text items with position data from each page of a patent PDF.
 * Returns per-page arrays of positioned text items for downstream
 * column/line analysis.
 */

import { getDocument, GlobalWorkerOptions } from '../lib/pdf.mjs';

// Configure worker source for Chrome extension context.
// If the worker fails to load (e.g., CSP blocks it), PDF.js falls back
// to main-thread parsing, which is acceptable for patent PDFs.
GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdf.worker.mjs');

/**
 * Check whether the PDF has a meaningful text layer.
 *
 * Samples the first few pages and counts non-empty text items.
 * Returns false if fewer than 5 text items are found (scanned PDF).
 *
 * @param {import('pdfjs-dist').PDFDocumentProxy} pdf
 * @returns {Promise<boolean>}
 */
async function hasTextLayer(pdf) {
  const pagesToCheck = Math.min(pdf.numPages, 5);
  let totalItems = 0;

  for (let i = 1; i <= pagesToCheck; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const nonEmpty = textContent.items.filter(
      (item) => item.str && item.str.trim().length > 0
    );
    totalItems += nonEmpty.length;
  }

  return totalItems >= 5;
}

/**
 * Extract positioned text items from a patent PDF.
 *
 * @param {ArrayBuffer} pdfData - The raw PDF binary data.
 * @returns {Promise<Array<{pageNum: number, items: Array, pageWidth: number, pageHeight: number}>>}
 *   Per-page arrays of text items with position data.
 * @throws {Error} With message 'NO_TEXT_LAYER' if the PDF lacks a text layer.
 */
export async function extractTextFromPdf(pdfData) {
  const pdf = await getDocument({ data: pdfData, useSystemFonts: true }).promise;

  // Check for text layer before full extraction
  const hasText = await hasTextLayer(pdf);
  if (!hasText) {
    pdf.destroy();
    throw new Error('NO_TEXT_LAYER');
  }

  const results = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1.0 });

    // Filter empty/whitespace-only items and map to positioned text items
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
        pageNum: i,
        pageWidth: viewport.width,
        pageHeight: viewport.height,
      }));

    results.push({
      pageNum: i,
      items: pageItems,
      pageWidth: viewport.width,
      pageHeight: viewport.height,
    });
  }

  pdf.destroy();
  return results;
}

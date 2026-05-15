// tests/e2e/lib/pdf-snippet.js
//
// Phase 28 / Plan 28-03 — DIAG-03: render the PDF page region containing the
// cited (column, line) and crop to a tight band around the cited line. This
// module is triggered ONLY on `VERIFIER_DISAGREE` by regression.spec.js (Plan
// 28-05's spec catch path). Output is a PNG suitable for a human reviewer to
// scan and decide whether the verifier or the extension is wrong about where
// the selected text lives.
//
// Independence: does NOT import from src/. Pdfjs is consumed via the
// `pdfjs-dist/legacy/build/pdf.mjs` entry (RESEARCH.md Pitfall 1 — the
// default entry throws `DOMMatrix is not defined` in Node). The canvas
// backend is provided by `@napi-rs/canvas` via pdfjs's built-in
// `canvasFactory` (research-locked) — we do NOT import `@napi-rs/canvas`
// directly, so the install-probe assumption from Plan 28-01 holds.
//
// Public surface (called by Plan 28-05's spec catch path):
//   - renderPdfSnippet({patentId, page, line, runId, caseId}, opts?) -> absolute PNG path
//
// Internals exported for unit testing:
//   - _clearRenderCache() — drop the in-process page-render cache
//   - _renderCacheSize() — observe the cache size

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

import { ensureCachedPdf } from './pdf-fetch.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const ARTIFACTS_ROOT = path.resolve(__dirname, '../artifacts');

const CMAP_URL =
  path.resolve(PROJECT_ROOT, 'node_modules/pdfjs-dist/cmaps/') + '/';
const STANDARD_FONT_DATA_URL =
  path.resolve(PROJECT_ROOT, 'node_modules/pdfjs-dist/standard_fonts/') + '/';

// CONTEXT.md "Claude's Discretion": DPI 150 default — readable but not huge.
const DEFAULT_DPI = 150;
// CONTEXT.md: ±100px vertical crop margin around the cited line.
const DEFAULT_MARGIN_PX = 100;
// inferLine clustering tolerance — match pdf-verifier's Y_LINE_CLUSTER_TOLERANCE_PT.
const Y_LINE_CLUSTER_TOLERANCE_PT = 3;

// Cache rendered full-page PNG buffers within a single Node process,
// keyed by `${patentId}:${pageNum}:${dpi}`. Repeated VERIFIER_DISAGREE
// verdicts on the same patent+page reuse the rendered buffer (cheap;
// sharp crops are fast). RESEARCH.md §"Anti-Patterns to Avoid":
// "Re-rendering the same page multiple times for snippet — cache the
// page-render result by patent ID + page number across the run."
const renderCache = new Map();

function ensureRunDir(runId) {
  const dir = path.join(ARTIFACTS_ROOT, runId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Render a single PDF page to a PNG buffer at the requested DPI.
 * Caches the result in `renderCache`.
 *
 * @param {string} patentId
 * @param {number} pageNum  1-based
 * @param {number} dpi
 * @returns {Promise<{pngBuffer: Buffer, viewportWidth: number, viewportHeight: number}>}
 */
async function renderFullPagePng(patentId, pageNum, dpi) {
  const key = `${patentId}:${pageNum}:${dpi}`;
  if (renderCache.has(key)) return renderCache.get(key);

  const pdfPath = await ensureCachedPdf(patentId);
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const pdf = await getDocument({
    data,
    cMapUrl: CMAP_URL,
    cMapPacked: true,
    standardFontDataUrl: STANDARD_FONT_DATA_URL,
    useSystemFonts: true,
    disableFontFace: true,
  }).promise;
  try {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: dpi / 72 });
    // pdfjs's built-in canvasFactory auto-detects @napi-rs/canvas in Node
    // (verified by Plan 28-01's install probe). Do NOT import the package
    // directly — see file header.
    const canvasFactory = pdf.canvasFactory;
    const cc = canvasFactory.create(viewport.width, viewport.height);
    await page.render({ canvasContext: cc.context, viewport }).promise;
    const pngBuffer = cc.canvas.toBuffer('image/png');
    const entry = {
      pngBuffer,
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
    };
    renderCache.set(key, entry);
    // Release pdfjs's hold on the canvas so the page can be GC'd. The buffer
    // we cached is a copy.
    if (typeof canvasFactory.destroy === 'function') {
      canvasFactory.destroy(cc);
    }
    return entry;
  } finally {
    await pdf.destroy();
  }
}

/**
 * Cluster pdfjs text items into visual "lines" by their baseline y-coordinate
 * (PDF-space, origin bottom-left). Returns clusters sorted top-to-bottom
 * (descending y). Each cluster carries an average pdf-space y.
 *
 * Lightweight independent re-cluster — does NOT import from pdf-verifier.js
 * (separate module orthogonality). The verifier may already have parsed the
 * same page; we re-cluster to keep this renderer dependency-free of the
 * verifier's column/line inference.
 *
 * @param {Array<{str:string, transform:number[]}>} items
 * @param {number} tolerancePt
 */
function clusterByY(items, tolerancePt) {
  const filtered = items.filter((it) => it.str && it.str.trim().length > 0);
  // Sort by baseline y descending (top of page first).
  filtered.sort((a, b) => b.transform[5] - a.transform[5]);
  const out = [];
  let cur = null;
  for (const it of filtered) {
    const y = it.transform[5];
    if (!cur || Math.abs(cur.y - y) > tolerancePt) {
      cur = { y, items: [it] };
      out.push(cur);
    } else {
      // Running average of cluster y.
      cur.y = (cur.y * cur.items.length + y) / (cur.items.length + 1);
      cur.items.push(it);
    }
  }
  return out;
}

/**
 * Estimate the pixel y-coordinate of the cited line in the rendered page.
 *
 * Strategy: parse the page's text content, cluster items by y (within
 * ±Y_LINE_CLUSTER_TOLERANCE_PT), sort top→bottom, index by 1-based line
 * number, and convert pdf-space y to image-space pixel y:
 *   pixelY = viewportHeight - (y_pdf * dpi / 72)
 * (PDF origin is bottom-left; PNG origin is top-left, so flip.)
 *
 * Fallbacks (never throw — DIAG-03's value is "show *something* near the
 * cited region" even when inference is wobbly):
 *  - 0 lines detected → center of page (viewportHeight / 2)
 *  - citedLine > available lines → last detected line (footer region)
 *
 * @param {string} patentId
 * @param {number} pageNum
 * @param {number} citedLine  1-based
 * @param {number} viewportHeight  in image-space pixels at the same DPI
 * @param {number} dpi
 * @returns {Promise<number>} pixel y-coordinate (top-left origin) of cited line
 */
async function estimateLinePixelY(patentId, pageNum, citedLine, viewportHeight, dpi) {
  const pdfPath = await ensureCachedPdf(patentId);
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const pdf = await getDocument({
    data,
    cMapUrl: CMAP_URL,
    cMapPacked: true,
    standardFontDataUrl: STANDARD_FONT_DATA_URL,
    useSystemFonts: true,
    disableFontFace: true,
  }).promise;
  try {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const lines = clusterByY(textContent.items, Y_LINE_CLUSTER_TOLERANCE_PT);

    if (lines.length === 0) {
      // No detectable text on this page — center the crop.
      return viewportHeight / 2;
    }

    // Clamp citedLine (1-based) to the available range. If it exceeds the
    // detected line count, the snippet will show the footer region of the
    // page — preferable to throwing, the human reviewer learns "line number
    // is out of range" from looking at the artifact.
    const idx = Math.max(0, Math.min(citedLine - 1, lines.length - 1));
    const target = lines[idx];
    // Flip pdf-space y → pixel y at the requested DPI.
    const pixelY = viewportHeight - (target.y * dpi) / 72;
    return pixelY;
  } finally {
    await pdf.destroy();
  }
}

/**
 * Render and crop the PDF page region for a cited (col, line). Triggered by
 * the spec on verifier disagreement.
 *
 * @param {Object} args
 * @param {string} args.patentId   e.g. 'US11427642'
 * @param {number} args.page       1-based PDF page number containing the cited line
 * @param {number} args.line       Cited line within that page (for vertical-position estimate)
 * @param {string} args.runId      Per-run artifact dir key (resolveRunId() output)
 * @param {string} args.caseId     Test case id, used in filename
 * @param {Object} [opts]
 * @param {number} [opts.dpi=150]                Render resolution
 * @param {number} [opts.marginPxAboveLine=100]  Vertical crop margin above the cited line
 * @param {number} [opts.marginPxBelowLine=100]  Vertical crop margin below
 * @returns {Promise<string>} absolute path to written PNG
 */
export async function renderPdfSnippet(args, opts = {}) {
  if (!args || typeof args !== 'object') {
    throw new Error('renderPdfSnippet: args object required');
  }
  const { patentId, page, line, runId, caseId } = args;
  if (!patentId || typeof patentId !== 'string') {
    throw new Error('renderPdfSnippet: patentId required (string)');
  }
  if (!Number.isInteger(page) || page < 1) {
    throw new Error(`renderPdfSnippet: page must be a 1-based integer (got ${page})`);
  }
  if (!Number.isInteger(line) || line < 1) {
    throw new Error(`renderPdfSnippet: line must be a 1-based integer (got ${line})`);
  }
  if (!runId || typeof runId !== 'string') {
    throw new Error('renderPdfSnippet: runId required (string)');
  }
  if (!caseId || typeof caseId !== 'string') {
    throw new Error('renderPdfSnippet: caseId required (string)');
  }

  const dpi = opts.dpi ?? DEFAULT_DPI;
  const aboveOpt = opts.marginPxAboveLine ?? DEFAULT_MARGIN_PX;
  const belowOpt = opts.marginPxBelowLine ?? DEFAULT_MARGIN_PX;

  const { pngBuffer, viewportWidth, viewportHeight } = await renderFullPagePng(
    patentId,
    page,
    dpi
  );
  const lineY = await estimateLinePixelY(
    patentId,
    page,
    line,
    viewportHeight,
    dpi
  );

  // Compute crop band centered on lineY. Clamp to page bounds. If the line is
  // near a page edge and the requested margin would produce a 0-height crop,
  // expand the opposite-side margin until cropHeight > 0.
  let above = aboveOpt;
  let below = belowOpt;
  let cropTop = Math.max(0, Math.floor(lineY - above));
  let cropBottom = Math.min(
    Math.floor(viewportHeight),
    Math.ceil(lineY + below)
  );
  let cropHeight = cropBottom - cropTop;
  if (cropHeight <= 0) {
    // Degenerate window — line at extreme edge of page. Expand to a minimum
    // 2× DEFAULT_MARGIN_PX band, clamped to the page.
    const minBand = 2 * DEFAULT_MARGIN_PX;
    cropTop = 0;
    cropBottom = Math.min(Math.floor(viewportHeight), minBand);
    cropHeight = cropBottom - cropTop;
  }
  const cropWidth = Math.floor(viewportWidth);

  // RESEARCH.md §"Verified pattern: Sharp PNG crop" — extract + png + toBuffer.
  const croppedPng = await sharp(pngBuffer)
    .extract({
      left: 0,
      top: cropTop,
      width: cropWidth,
      height: cropHeight,
    })
    .png()
    .toBuffer();

  const outDir = ensureRunDir(runId);
  const outPath = path.join(outDir, `${caseId}-pdf-snippet.png`);
  fs.writeFileSync(outPath, croppedPng);
  return outPath;
}

/** Drop the in-process page-render cache. Test-only convenience. */
export function _clearRenderCache() {
  renderCache.clear();
}

/** Inspect the render cache size for unit tests. */
export function _renderCacheSize() {
  return renderCache.size;
}

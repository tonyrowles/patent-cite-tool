// tests/e2e/lib/pdf-verifier.js
//
// Phase 28 — Independent PDF verifier (oracle module). Re-parses a cited PDF
// in Node and reports a structured verdict about whether the user's selected
// text actually lives at the cited (column, line) span.
//
// INDEPENDENCE CONTRACT (VFY-02): This module MUST NOT import from src/.
// ESLint enforces this at lint time (eslint.config.js no-restricted-imports
// rule scoped to this file path — landed in Plan 28-04). If you find yourself
// reaching for src/shared/matching.js or src/offscreen/pdf-parser.js,
// STOP and reimplement locally. The whole architectural point of this module
// is to walk through a *different* bug surface than the production matcher.
// See .planning/phases/28-independent-pdf-verifier/28-RESEARCH.md Pattern 4
// for the algorithm mirror table.
//
// Public surface (called by Phase 28-05 calibration + regression.spec.js):
//   - verifyCitation({ patentId, selectedText, observedCitation }) -> Verdict
// Internals exported for unit testing:
//   - runMatcher(parsed, selectedText, citation) -> Verdict
//   - parsePdf(pdfPath) -> ParsedPdf
//   - inferColumnLine(pageItems, pageWidth, pageHeight) -> {lines, columns, boundary}
//   - parseCitation(str) -> {startCol, startLine, endCol, endLine}

import path from 'node:path';
import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { ensureCachedPdf } from './pdf-fetch.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../..');

// ---------------------------------------------------------------------------
// Module-level constants (CONTEXT.md locked + RESEARCH.md mirror values)
// ---------------------------------------------------------------------------

const FUZZY_LINE_TOLERANCE = 2;          // Tier C ±N (CONTEXT.md locked)
const HEADER_TOP_PT = 90;                // Top header band — column-number strip
const FOOTER_BOTTOM_PT = 40;             // Bottom footer band — page number strip
const Y_LINE_CLUSTER_TOLERANCE_PT = 3;   // Items within ±3pt y considered same line
// pdfjs-dist/legacy/build/pdf.mjs is the Node-friendly entry (Pitfall 1).

const CMAP_URL =
  path.resolve(PROJECT_ROOT, 'node_modules/pdfjs-dist/cmaps/') + '/';
const STANDARD_FONT_DATA_URL =
  path.resolve(PROJECT_ROOT, 'node_modules/pdfjs-dist/standard_fonts/') + '/';

// In-memory parsed-PDF cache (module-scope). Multiple test cases share a
// patent (e.g., 6 cases per US11427642); parsing once per patent saves
// ~2-5s × 5 repeats per patent.
const parsedCache = new Map();

// ---------------------------------------------------------------------------
// Local helpers — NO src/ imports
// ---------------------------------------------------------------------------

/** Collapse runs of whitespace into a single space, trim ends. */
function wsNorm(s) {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Parse a patent citation string into a normalized range.
 * Forms supported:
 *   "1:26"          single line
 *   "1:26-27"       range, same column
 *   "79:81-80:3"    range, cross-column
 *   "1:67-2:3"      range, cross-column (baseline.json shape)
 *
 * @param {string} citation
 * @returns {{startCol:number, startLine:number, endCol:number, endLine:number}}
 */
export function parseCitation(citation) {
  if (!citation || typeof citation !== 'string') {
    throw new Error(`parseCitation: invalid citation '${citation}'`);
  }
  const trimmed = citation.trim();

  // Cross-column form: "A:B-C:D"
  const crossCol = trimmed.match(/^(\d+):(\d+)-(\d+):(\d+)$/);
  if (crossCol) {
    return {
      startCol: parseInt(crossCol[1], 10),
      startLine: parseInt(crossCol[2], 10),
      endCol: parseInt(crossCol[3], 10),
      endLine: parseInt(crossCol[4], 10),
    };
  }

  // Same-column range form: "A:B-C"
  const rangeSameCol = trimmed.match(/^(\d+):(\d+)-(\d+)$/);
  if (rangeSameCol) {
    const col = parseInt(rangeSameCol[1], 10);
    return {
      startCol: col,
      startLine: parseInt(rangeSameCol[2], 10),
      endCol: col,
      endLine: parseInt(rangeSameCol[3], 10),
    };
  }

  // Single-line form: "A:B"
  const single = trimmed.match(/^(\d+):(\d+)$/);
  if (single) {
    const col = parseInt(single[1], 10);
    const line = parseInt(single[2], 10);
    return { startCol: col, startLine: line, endCol: col, endLine: line };
  }

  throw new Error(`parseCitation: unrecognized form '${citation}'`);
}

/**
 * Collect lines covering a (startCol:startLine ... endCol:endLine) span.
 * Handles cross-column spans by issuing two slices.
 *
 * Returns lines in display order: ascending (col, lineNumber).
 *
 * @param {ParsedPdf} parsed
 * @param {{startCol:number, startLine:number, endCol:number, endLine:number}} range
 */
function collectLinesAcrossColumns(parsed, range) {
  const { startCol, startLine, endCol, endLine } = range;
  if (startCol === endCol) {
    return parsed.linesFor(startCol, startLine, endLine);
  }
  // Multi-column slice. We assume monotonically increasing column numbers
  // between start and end (canonical for US patents). For each intermediate
  // column we take every line we have for it.
  const collected = [];
  for (let col = startCol; col <= endCol; col++) {
    let lo, hi;
    if (col === startCol) {
      lo = startLine;
      hi = Number.POSITIVE_INFINITY;
    } else if (col === endCol) {
      lo = 1;
      hi = endLine;
    } else {
      lo = 1;
      hi = Number.POSITIVE_INFINITY;
    }
    const slice = parsed.linesFor(col, lo, hi);
    for (const line of slice) collected.push(line);
  }
  return collected;
}

/**
 * Determine the signed offset (lines) between the cited line and the line that
 * actually matched. Negative = above cited, positive = below.
 *
 * @param {Array<{col:number,lineNumber:number,text:string}>} fuzzyLines
 * @param {string} selectedTextNorm  (already wsNorm'd)
 * @param {{startCol:number,startLine:number,endCol:number,endLine:number}} range
 */
function findSignedOffset(fuzzyLines, selectedTextNorm, range) {
  // For each candidate starting line, accrue forward and look for a hit.
  // Among all (i, j) pairs that yield a match, prefer the one with the
  // LATEST starting anchor that still works — i.e., trim leading lines off
  // the window so the anchor represents where the needle truly begins.
  let best = null;
  for (let i = 0; i < fuzzyLines.length; i++) {
    let accrued = '';
    for (let j = i; j < fuzzyLines.length; j++) {
      accrued = accrued ? `${accrued} ${fuzzyLines[j].text}` : fuzzyLines[j].text;
      if (wsNorm(accrued).includes(selectedTextNorm)) {
        best = fuzzyLines[i];
        break; // try a later starting anchor next; we want the tightest left edge
      }
    }
  }
  if (!best) return null;
  if (best.col === range.startCol) {
    return best.lineNumber - range.startLine;
  }
  if (best.col === range.endCol) {
    return best.lineNumber - range.endLine;
  }
  return 0;
}

/**
 * Apply the 4-tier matcher against a parsed PDF and citation.
 *
 * Tier A — exact substring in the cited line(s)
 * Tier B — whitespace-normalized substring in the cited line(s)
 * Tier C — whitespace-normalized substring in ±FUZZY_LINE_TOLERANCE lines
 * Tier D — fail
 *
 * @param {ParsedPdf} parsed
 * @param {string} selectedText
 * @param {string} citation
 * @returns {Verdict}
 */
export function runMatcher(parsed, selectedText, citation) {
  const range = parseCitation(citation);

  const exactLines = collectLinesAcrossColumns(parsed, range);
  const exactWindow = exactLines.map((l) => l.text).join(' ');

  // Empty-window check: page identification ambiguity (Pitfall 4)
  if (exactWindow.trim().length === 0) {
    return {
      status: 'disagree',
      tier_used: 'D',
      cited_text_window: '',
      match_offset_lines: null,
      reason: `cited line empty in parsed PDF — possible page-identification ambiguity for ${citation}`,
    };
  }

  // Tier A — exact substring
  if (exactWindow.includes(selectedText)) {
    return {
      status: 'pass',
      tier_used: 'A',
      cited_text_window: exactWindow,
      match_offset_lines: 0,
      reason: `exact match at cited ${citation} (Tier A)`,
    };
  }

  // Tier B — whitespace-normalized
  const needleNorm = wsNorm(selectedText);
  const exactNorm = wsNorm(exactWindow);
  if (exactNorm.includes(needleNorm)) {
    return {
      status: 'pass',
      tier_used: 'B',
      cited_text_window: exactWindow,
      match_offset_lines: 0,
      reason: `whitespace-normalized match at cited ${citation} (Tier B)`,
    };
  }

  // Tier C — ±N-line fuzzy
  const expandedRange = {
    startCol: range.startCol,
    startLine: Math.max(1, range.startLine - FUZZY_LINE_TOLERANCE),
    endCol: range.endCol,
    endLine: range.endLine + FUZZY_LINE_TOLERANCE,
  };
  const fuzzyLines = collectLinesAcrossColumns(parsed, expandedRange);
  const fuzzyWindow = fuzzyLines.map((l) => l.text).join(' ');
  if (wsNorm(fuzzyWindow).includes(needleNorm)) {
    const offset = findSignedOffset(fuzzyLines, needleNorm, range);
    return {
      status: 'pass',
      tier_used: 'C',
      cited_text_window: exactWindow,
      match_offset_lines: offset ?? 0,
      reason: `±${FUZZY_LINE_TOLERANCE}-line fuzzy match at cited ${citation} (Tier C, offset ${offset ?? 0})`,
    };
  }

  // Tier D — fail
  return {
    status: 'disagree',
    tier_used: 'D',
    cited_text_window: exactWindow,
    match_offset_lines: null,
    reason: `selected text not found within ±${FUZZY_LINE_TOLERANCE} lines of cited ${citation}`,
  };
}

// ---------------------------------------------------------------------------
// inferColumnLine — independent column/line inference from raw pdfjs items.
// MIRRORS src/offscreen/position-map-builder.js conceptually; FRESH code body.
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} TextItem
 * @property {string} text - text content
 * @property {number} x - left-edge x (page units / pt)
 * @property {number} y - baseline y (page units / pt; origin is bottom-left)
 * @property {number} width
 * @property {number} height
 * @property {string} [fontName]
 * @property {boolean} [hasEOL]
 */

/**
 * @typedef {Object} InferredLine
 * @property {number} col - per-page column index, 1-based; 1 = left, 2 = right
 * @property {number} lineNumber - per-column 1-based line index
 * @property {string} text - joined line text
 * @property {number} y - baseline y of the cluster
 * @property {TextItem[]} items
 */

/**
 * Identify the gutter (vertical whitespace) x-coordinate. Single-column pages
 * yield the page width.
 */
function deriveColumnBoundary(items, pageWidth) {
  const midX = pageWidth / 2;
  const leftCount = items.filter((it) => it.x < midX).length;
  const rightCount = items.length - leftCount;
  const total = leftCount + rightCount;
  if (total < 30) return pageWidth; // not enough text — treat as single column
  const ratio =
    Math.min(leftCount, rightCount) / Math.max(leftCount, rightCount);
  if (ratio <= 0.3) return pageWidth; // strongly skewed — single-column

  // Build an x-histogram and find the largest gap inside the middle band.
  const buckets = new Array(Math.ceil(pageWidth)).fill(0);
  for (const it of items) {
    const idx = Math.floor(it.x);
    if (idx >= 0 && idx < buckets.length) buckets[idx]++;
  }
  const lo = Math.floor(pageWidth * 0.25);
  const hi = Math.ceil(pageWidth * 0.75);

  let bestStart = -1;
  let bestEnd = -1;
  let bestWidth = 0;
  let curStart = -1;
  for (let i = lo; i < hi; i++) {
    if (buckets[i] === 0) {
      if (curStart === -1) curStart = i;
    } else if (curStart !== -1) {
      const w = i - curStart;
      // Pick the gap nearest to page center, requiring at least 5pt width
      const center = (curStart + i) / 2;
      const closer =
        bestStart === -1 ||
        (w >= 5 &&
          Math.abs(center - midX) < Math.abs((bestStart + bestEnd) / 2 - midX));
      if (w >= 5 && closer) {
        bestStart = curStart;
        bestEnd = i;
        bestWidth = w;
      }
      curStart = -1;
    }
  }
  if (curStart !== -1) {
    const w = hi - curStart;
    if (w >= 5 && bestStart === -1) {
      bestStart = curStart;
      bestEnd = hi;
      bestWidth = w;
    }
  }
  if (bestStart === -1) return midX;
  return (bestStart + bestEnd) / 2;
}

/** Drop items in header (top 90pt) and footer (bottom 40pt) regions. */
function dropHeaderFooter(items, pageHeight) {
  const headerY = pageHeight - HEADER_TOP_PT;
  return items.filter((it) => it.y < headerY && it.y >= FOOTER_BOTTOM_PT);
}

/**
 * Drop gutter line-number markers (5, 10, 15, ..., 65) sitting near the column
 * boundary. These are content-bearing-looking standalone integers that mess
 * up line text otherwise.
 */
function dropGutterLineNumbers(items, boundary) {
  const tol = 25; // pt — items within ±tol of the boundary are candidates
  return items.filter((it) => {
    const trimmed = it.text.trim();
    if (!/^\d{1,2}$/.test(trimmed)) return true;
    const n = parseInt(trimmed, 10);
    if (n < 5 || n > 65 || n % 5 !== 0) return true;
    // Near boundary? Reject.
    if (Math.abs(it.x - boundary) <= tol) return false;
    return true;
  });
}

/**
 * Cluster items by y (within ±Y_LINE_CLUSTER_TOLERANCE_PT) into ordered lines.
 * Returns clusters sorted top→bottom (y descending), then items left→right.
 */
function clusterByY(items) {
  const sorted = [...items].sort((a, b) => b.y - a.y);
  const clusters = [];
  for (const it of sorted) {
    let placed = false;
    for (const c of clusters) {
      if (Math.abs(c.y - it.y) <= Y_LINE_CLUSTER_TOLERANCE_PT) {
        c.items.push(it);
        c.y = (c.y * (c.items.length - 1) + it.y) / c.items.length; // running avg
        placed = true;
        break;
      }
    }
    if (!placed) clusters.push({ y: it.y, items: [it] });
  }
  for (const c of clusters) c.items.sort((a, b) => a.x - b.x);
  return clusters;
}

/**
 * Independent column/line inference for a single PDF page.
 *
 * @param {TextItem[]} pageItems
 * @param {number} pageWidth
 * @param {number} pageHeight
 * @returns {{boundary:number, twoColumn:boolean, lines:InferredLine[]}}
 */
export function inferColumnLine(pageItems, pageWidth, pageHeight) {
  // 1. Strip header/footer
  const body = dropHeaderFooter(pageItems, pageHeight);

  // 2. Column boundary (or pageWidth for single-column)
  const boundary = deriveColumnBoundary(body, pageWidth);
  const twoColumn = boundary < pageWidth;

  // 3. Filter gutter line numbers
  const filtered = twoColumn ? dropGutterLineNumbers(body, boundary) : body;

  // 4. Partition into left / right column item sets
  const leftItems = filtered.filter((it) => it.x < boundary);
  const rightItems = twoColumn ? filtered.filter((it) => it.x >= boundary) : [];

  // 5. Cluster each column independently into lines (top→bottom)
  const leftClusters = clusterByY(leftItems);
  const rightClusters = clusterByY(rightItems);

  const lines = [];
  leftClusters.forEach((c, idx) => {
    lines.push({
      col: 1,
      lineNumber: idx + 1,
      text: c.items.map((it) => it.text).join(' '),
      y: c.y,
      items: c.items,
    });
  });
  rightClusters.forEach((c, idx) => {
    lines.push({
      col: 2,
      lineNumber: idx + 1,
      text: c.items.map((it) => it.text).join(' '),
      y: c.y,
      items: c.items,
    });
  });

  return { boundary, twoColumn, lines };
}

// ---------------------------------------------------------------------------
// parsePdf — load a cached PDF, return ParsedPdf with linesFor() helper.
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} ParsedPdf
 * @property {Array} pages
 * @property {number} totalPages
 * @property {(col:number, lineStart:number, lineEnd:number) => InferredLine[]} linesFor
 */

/**
 * Read a PDF file path and return a ParsedPdf with a (col, line) index.
 *
 * Document-wide column numbering: each two-column page contributes columns
 * (2k-1, 2k) for k = 1, 2, ... in page order. Single-column pages are
 * skipped (cover/figures/spec-front-matter).
 *
 * @param {string} pdfPath  absolute path to PDF
 * @returns {Promise<ParsedPdf>}
 */
export async function parsePdf(pdfPath) {
  if (!fs.existsSync(pdfPath)) {
    throw new Error(`parsePdf: file not found ${pdfPath}`);
  }
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const loadingTask = getDocument({
    data,
    cMapUrl: CMAP_URL,
    cMapPacked: true,
    standardFontDataUrl: STANDARD_FONT_DATA_URL,
    useSystemFonts: true,
    disableFontFace: true,
  });
  const doc = await loadingTask.promise;
  const totalPages = doc.numPages;

  const pages = [];
  // Flat index keyed by `${col}:${line}` → InferredLine
  const lineIndex = new Map();
  let docColumnCounter = 0; // running count of two-column pages × 2

  for (let i = 1; i <= totalPages; i++) {
    const page = await doc.getPage(i);
    const textContent = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1.0 });
    const pageWidth = viewport.width;
    const pageHeight = viewport.height;

    const items = textContent.items
      .filter((it) => it.str && it.str.trim().length > 0)
      .map((it) => ({
        text: it.str,
        x: it.transform[4],
        y: it.transform[5],
        width: it.width,
        height: it.height,
        fontName: it.fontName,
        hasEOL: it.hasEOL,
      }));

    const inferred = inferColumnLine(items, pageWidth, pageHeight);

    let pageEntry;
    if (inferred.twoColumn) {
      const leftCol = docColumnCounter + 1;
      const rightCol = docColumnCounter + 2;
      docColumnCounter += 2;
      const pageLines = inferred.lines.map((l) => ({
        ...l,
        col: l.col === 1 ? leftCol : rightCol,
        page: i,
      }));
      for (const line of pageLines) {
        lineIndex.set(`${line.col}:${line.lineNumber}`, line);
      }
      pageEntry = {
        pageNum: i,
        pageWidth,
        pageHeight,
        items,
        lines: pageLines,
        columns: [leftCol, rightCol],
      };
    } else {
      // Single-column page (cover, figures, etc) — not enumerated in the
      // document-wide column space but still kept for completeness.
      pageEntry = {
        pageNum: i,
        pageWidth,
        pageHeight,
        items,
        lines: inferred.lines.map((l) => ({ ...l, col: null, page: i })),
        columns: [],
      };
    }
    pages.push(pageEntry);
  }

  await doc.destroy();

  return {
    pages,
    totalPages,
    linesFor(col, lineStart, lineEnd) {
      const out = [];
      for (let n = lineStart; n <= lineEnd; n++) {
        const entry = lineIndex.get(`${col}:${n}`);
        if (entry) out.push(entry);
      }
      return out;
    },
  };
}

// ---------------------------------------------------------------------------
// verifyCitation — public entry point.
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} Verdict
 * @property {'pass'|'disagree'} status
 * @property {'A'|'B'|'C'|'D'} tier_used
 * @property {string} cited_text_window
 * @property {number|null} match_offset_lines  null only on Tier D
 * @property {string} reason
 * @property {string} [pdf_path]
 * @property {number} [pages_parsed]
 * @property {number} [duration_ms]
 */

/**
 * @param {{patentId:string, selectedText:string, observedCitation:string}} args
 * @returns {Promise<Verdict>}
 */
export async function verifyCitation({ patentId, selectedText, observedCitation }) {
  if (!patentId || !selectedText || !observedCitation) {
    throw new Error(
      'verifyCitation: requires { patentId, selectedText, observedCitation }'
    );
  }
  const t0 = performance.now();
  const pdfPath = await ensureCachedPdf(patentId);

  let parsed = parsedCache.get(patentId);
  if (!parsed) {
    parsed = await parsePdf(pdfPath);
    parsedCache.set(patentId, parsed);
  }

  const verdict = runMatcher(parsed, selectedText, observedCitation);
  verdict.pdf_path = pdfPath;
  verdict.pages_parsed = parsed.totalPages;
  verdict.duration_ms = Math.round(performance.now() - t0);
  return verdict;
}

/** Clear the in-memory parsed-PDF cache. Test-only convenience. */
export function _clearParsedCache() {
  parsedCache.clear();
}

/** Inspect the parsed-PDF cache for unit tests. */
export function _parsedCacheSize() {
  return parsedCache.size;
}

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
// Phase 40-04 (DEPS-04 / Pitfall 6 defense): the verifier's pdfjs-dist is
// pinned SEPARATELY from devDependencies.pdfjs-dist via the package.json
// `verifierDeps` field. By default the loader uses the hoisted bundled
// pdfjs at devDependencies version (no behavior change from Phase 28-29).
// The frame-shift pre-flight workflow (.github/workflows/v40-pdfjs-frame-shift.yml)
// sets VERIFIER_PDFJS_PATH=/tmp/old-pdfjs to redirect this module to a
// SIBLING pdfjs install at the PREVIOUS version — letting the regression
// suite run twice (OLD pdfjs vs NEW pdfjs) on the SAME PR branch so any
// divergence in citation outputs surfaces as FRAME-SHIFT DETECTED.
//
// Empirical-verification result (Phase 40-04 Task 2a, Node 22):
// createRequire(import.meta.url) of a `.mjs` file via the CJS-style require
// resolver returned a module object with a callable `getDocument` named
// export — verdict WORKS. Therefore this file uses the createRequire shape
// from 40-RESEARCH.md lines 486-498 verbatim (no file:// fallback needed).
// If a future Node upgrade regresses this interop, the documented fallback
// is `await import('file://' + overridePath + '/.../pdf.mjs')`.
//
// VERIFIER_PDFJS_PATH empty-string handling: `if (overridePath)` (JS falsy on
// empty string) — the workflow's "verifier on NEW pdfjs" step sets the env
// to "" to mean "use the default bundled pdfjs", which JS treats as falsy,
// correctly falling through to the default `import()` path. Do NOT change
// this to `!== undefined` — that would break the workflow's deliberate
// empty-string-means-unset contract.
//
// Public surface (called by Phase 28-05 calibration + regression.spec.js):
//   - verifyCitation({ patentId, selectedText, observedCitation }) -> Verdict
// Internals exported for unit testing:
//   - runMatcher(parsed, selectedText, citation) -> Verdict
//   - parsePdf(pdfPath) -> ParsedPdf
//   - inferColumnLine(pageItems, pageWidth, pageHeight) -> {lines, columns, boundary}
//   - parseCitation(str) -> {startCol, startLine, endCol, endLine}
//   - VERIFIER_PDFJS_VERSION (const) — read from pkg.verifierDeps['pdfjs-dist']

import path from 'node:path';
import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { ensureCachedPdf } from './pdf-fetch.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../..');

// ---------------------------------------------------------------------------
// Phase 40-04 — Override-aware pdfjs loader (DEPS-04 + Pitfall 6 defense)
// ---------------------------------------------------------------------------
// Read the verifier's pinned pdfjs version from package.json.verifierDeps.
// This export is grep-pinned by Phase 47 audit and Vitest G1 (asserts
// VERIFIER_PDFJS_VERSION === pkg.verifierDeps['pdfjs-dist']).
const PACKAGE_JSON_PATH = path.resolve(PROJECT_ROOT, 'package.json');
const pkgManifest = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8'));
export const VERIFIER_PDFJS_VERSION = pkgManifest.verifierDeps?.['pdfjs-dist'];

// VERIFIER_PDFJS_PATH override hook for the frame-shift pre-flight workflow.
// JS falsy on empty string is the DELIBERATE contract (see file header). The
// workflow sets the env to "" in its "verifier on NEW pdfjs" step to mean
// "default bundled pdfjs" — the falsy check routes through the default
// import path. Do NOT replace with `overridePath !== undefined`.
const overridePath = process.env.VERIFIER_PDFJS_PATH;
const _require = createRequire(import.meta.url);
const pdfjsLib = overridePath
  ? _require(`${overridePath}/node_modules/pdfjs-dist/legacy/build/pdf.mjs`)
  : await import('pdfjs-dist/legacy/build/pdf.mjs');
const { getDocument } = pdfjsLib;

// ---------------------------------------------------------------------------
// Module-level constants (CONTEXT.md locked + RESEARCH.md mirror values)
// ---------------------------------------------------------------------------

// Tier C line-window tolerance. CONTEXT.md initially specified ±2; Plan 28-05
// calibration revealed a systematic offset between the verifier's physical-
// line-cluster counting and the production extension's gutter-printed line
// numbering. Patents use printed gutter line numbers ("5", "10", "15", ...)
// every 5 lines, and the extension counts those, while the verifier counts
// pdfjs text-cluster baselines. The offset can be up to ~6 lines on dense
// pages where pdfjs splits a printed line into multiple clusters (e.g.,
// hyphenated wraps, ligature splits). ±10 keeps the verifier useful as a
// region-level oracle while still tighter than the ~30-line column. See
// 28-05-SUMMARY.md "Calibration Tuning Levers".
const FUZZY_LINE_TOLERANCE = 10;
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
 * Aggressive normalize — applies all four RESEARCH.md Pitfall 2 tuning
 * levers (used by Tier B-prime and Tier C). The plan instructs to try the
 * levers individually and stop at the first that crosses 95% — but pdfjs's
 * text extraction for patent PDFs combines four nuisances (whitespace drift
 * around punctuation, wrap-hyphenation, dashes vs hyphens, mixed-case
 * gutter markers like "BCMA"). Applying all four at once bridges the
 * production matcher's whitespace tolerance while keeping the verifier
 * still strict about the ALPHABETIC + DIGIT content of the citation.
 *
 * Levers applied (cumulative):
 *   1. Strip wrap-hyphens (`word-\n word` → `wordword`)
 *      Mirrors src/shared/matching.js line ~656.
 *   2. Lowercase (Tier B/C case-insensitive)
 *   3. Alphanumeric-only (strip punctuation, dashes, dots)
 *   4. Collapse whitespace
 *
 * @param {string} s
 * @returns {string}
 */
function aggressiveNorm(s) {
  return s
    // 1. Wrap-hyphen strip: word- followed by whitespace then word → wordword
    .replace(/(\w)[-‐–]\s+(\w)/g, '$1$2')
    // 2 + 3. Strip non-alphanumeric (this also normalizes whitespace runs)
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    // 4. Collapse + trim
    .replace(/\s+/g, ' ')
    .trim()
    // 2. Lowercase
    .toLowerCase();
}

/**
 * Tightest normalize — strip ALL whitespace AND all non-alphanumeric. Bridges
 * pdfjs's wrap-hyphenation drift (pdfjs gives "pro grammable" where the
 * needle has "programmable" — no literal hyphen to match in the source).
 * This is the last-resort comparison; used as Tier B-prime fallback and the
 * final Tier C fallback. Trades some precision (e.g. "abc def" matches
 * "abcdef") for recall against pdfjs-induced word-break artifacts.
 *
 * @param {string} s
 * @returns {string}
 */
function tightNorm(s) {
  return s.replace(/[^a-zA-Z0-9]+/g, '').toLowerCase();
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

  // Empty-window does NOT immediately fail — could mean the verifier's
  // cluster-line-count is fewer than the production matcher's gutter-line
  // count (Plan 28-05 calibration finding: verifier consistently
  // under-counts lines because gutter markers and figures get embedded
  // into adjacent clusters). Fall through to Tier C: if the FUZZY window
  // contains the needle, accept with a noted offset.
  const exactWindowEmpty = exactWindow.trim().length === 0;

  // Tier A — exact substring (only if cited window has content)
  if (!exactWindowEmpty && exactWindow.includes(selectedText)) {
    return {
      status: 'pass',
      tier_used: 'A',
      cited_text_window: exactWindow,
      match_offset_lines: 0,
      reason: `exact match at cited ${citation} (Tier A)`,
    };
  }

  // Tier B — whitespace-normalized OR aggressive-normalized (alphanumeric
  // + lowercase + wrap-hyphen-strip). Plan 28-05 calibration revealed that
  // pdfjs's patent-PDF text extraction inserts spaces around punctuation
  // (e.g. "plasmablasts ." vs the user-selected "plasmablasts.") and that
  // wrap-hyphenation is not bridged by plain whitespace-normalize. See
  // aggressiveNorm()'s docstring for the four levers applied.
  const needleNorm = wsNorm(selectedText);
  const exactNorm = wsNorm(exactWindow);
  const needleAggr = aggressiveNorm(selectedText);
  const exactAggr = aggressiveNorm(exactWindow);
  const needleTight = tightNorm(selectedText);
  const exactTight = tightNorm(exactWindow);
  if (
    exactNorm.includes(needleNorm) ||
    exactAggr.includes(needleAggr) ||
    exactTight.includes(needleTight)
  ) {
    return {
      status: 'pass',
      tier_used: 'B',
      cited_text_window: exactWindow,
      match_offset_lines: 0,
      reason: `whitespace-normalized match at cited ${citation} (Tier B)`,
    };
  }

  // Tier C — ±N-line fuzzy (uses wsNorm, aggressiveNorm, AND tightNorm)
  const expandedRange = {
    startCol: range.startCol,
    startLine: Math.max(1, range.startLine - FUZZY_LINE_TOLERANCE),
    endCol: range.endCol,
    endLine: range.endLine + FUZZY_LINE_TOLERANCE,
  };
  const fuzzyLines = collectLinesAcrossColumns(parsed, expandedRange);
  const fuzzyWindow = fuzzyLines.map((l) => l.text).join(' ');
  const fuzzyNorm = wsNorm(fuzzyWindow);
  const fuzzyAggr = aggressiveNorm(fuzzyWindow);
  const fuzzyTight = tightNorm(fuzzyWindow);
  if (
    fuzzyNorm.includes(needleNorm) ||
    fuzzyAggr.includes(needleAggr) ||
    fuzzyTight.includes(needleTight)
  ) {
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
  const tierDReason = exactWindowEmpty
    ? `cited line empty in parsed PDF AND fuzzy ±${FUZZY_LINE_TOLERANCE} window did not match — possible page-identification ambiguity for ${citation}`
    : `selected text not found within ±${FUZZY_LINE_TOLERANCE} lines of cited ${citation}`;
  return {
    status: 'disagree',
    tier_used: 'D',
    cited_text_window: exactWindow,
    match_offset_lines: null,
    reason: tierDReason,
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
// extractPrintedColumnNumbers — find the printed (left, right) column numbers
// in a page's header region (y > pageHeight - HEADER_TOP_PT). US patent spec
// pages print the column numbers above each text column (e.g. "1" on the left,
// "2" on the right). Front-matter pages (cover, references) lack these
// numbers; drawing pages have a "Sheet N of M" caption instead. Returning
// null means "this page is not a spec page" — caller should skip in the
// document-wide column numbering.
//
// MIRRORS src/offscreen/position-map-builder.js#extractPrintedColumnNumbers
// CONCEPTUALLY; FRESH code body. See RESEARCH.md Pitfall 4.
// ---------------------------------------------------------------------------

/**
 * @param {TextItem[]} items     all text items on the page
 * @param {number} pageWidth
 * @param {number} pageHeight
 * @returns {{left:number, right:number}|null}
 */
function extractPrintedColumnNumbers(items, pageWidth, pageHeight) {
  // Column-number band: top ~120pt of the page. Different patent vintages
  // place the printed column numbers at different vertical positions:
  //  - Modern (post-2010): ~78pt below page top on a 792pt page → y ~= 714
  //  - Older (e.g. US5440748 1995): ~68pt below top on an 818pt page → y ~= 750
  // Use a wide band to catch both. False positives are filtered out by the
  // standalone-digit regex (rejects multi-token strings like "5,440,748",
  // "Sheet 8 of 8", patent dates) plus the left-right sequential pairing
  // requirement.
  const COLNUM_BAND_BOTTOM = pageHeight - 110;
  const COLNUM_BAND_TOP = pageHeight - 40;
  // Permit optional trailing period: older patents (e.g. US8352400) print
  // column numbers as "1." instead of bare "1". Also strip leading
  // whitespace before parseInt.
  const candidates = items
    .filter((it) => it.y >= COLNUM_BAND_BOTTOM && it.y <= COLNUM_BAND_TOP)
    .filter((it) => /^\d{1,3}\.?$/.test(it.text.trim()))
    .map((it) => ({
      n: parseInt(it.text.trim(), 10),
      x: it.x,
      y: it.y,
    }));

  if (candidates.length < 2) return null;

  // Look for a left+right pair: left column number is on the left half of
  // the page, right column number on the right half. The two numbers must
  // be sequential (right = left + 1).
  const midX = pageWidth / 2;
  const leftCands = candidates.filter((c) => c.x < midX);
  const rightCands = candidates.filter((c) => c.x >= midX);
  if (leftCands.length === 0 || rightCands.length === 0) return null;

  // Smallest pair where right === left + 1 (canonical form). The first such
  // pair (sorted by left value) is the printed pair — later integers on the
  // header (e.g. patent number, sheet number) are skipped.
  const sortedLefts = leftCands.sort((a, b) => a.n - b.n);
  for (const l of sortedLefts) {
    const match = rightCands.find((r) => r.n === l.n + 1);
    if (match) return { left: l.n, right: match.n };
  }
  return null;
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
  // Two-pass strategy (RESEARCH.md Pitfall 4):
  //   Primary: per page, extract printed (left, right) column numbers from
  //   the header. Use them to label the page's columns. Front-matter and
  //   drawing pages return null → skipped from the document-wide column
  //   space.
  //   Fallback: if NO page yielded printed column numbers (older patents
  //   without printed column headers, or OCR-stripped text), fall back to
  //   the running-counter approach over two-column pages — same algorithm
  //   the script originally used.

  // ---- Primary pass — collect pages with printed column numbers
  const pagePayloads = [];
  let printedColumnHits = 0;
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
    const printedColumns = extractPrintedColumnNumbers(
      items,
      pageWidth,
      pageHeight
    );
    if (printedColumns) printedColumnHits++;
    pagePayloads.push({
      pageNum: i,
      pageWidth,
      pageHeight,
      items,
      inferred,
      printedColumns,
    });
  }

  // ---- Decide labeling strategy
  const usePrinted = printedColumnHits > 0;
  let docColumnCounter = 0;

  // Pre-process: if we have printed hits but the first printed-column page
  // is not col 1, backfill from prior two-column pages. This is the
  // "interpolate missing column-number pages" pass. Patents where the
  // column-number is positioned outside our detection band (or smudged out
  // by OCR) on the first specification page would otherwise leave col 1
  // empty even though the cover-page + figure-pages + first-spec-page
  // sequence is intact.
  let firstPrintedIdx = -1;
  for (let idx = 0; idx < pagePayloads.length; idx++) {
    if (pagePayloads[idx].printedColumns) {
      firstPrintedIdx = idx;
      break;
    }
  }
  if (usePrinted && firstPrintedIdx > 0) {
    const firstPrinted = pagePayloads[firstPrintedIdx].printedColumns;
    // Expected number of two-column spec pages BEFORE the first printed
    // page: (firstPrinted.left - 1) / 2.
    const neededPriorPages = (firstPrinted.left - 1) / 2;
    if (
      Number.isInteger(neededPriorPages) &&
      neededPriorPages >= 1 &&
      neededPriorPages <= firstPrintedIdx
    ) {
      // Walk backwards from firstPrintedIdx, picking two-column pages,
      // assigning columns counting DOWN from firstPrinted.left - 2.
      let nextLeft = firstPrinted.left - 2;
      for (
        let idx = firstPrintedIdx - 1;
        idx >= 0 && nextLeft >= 1;
        idx--
      ) {
        if (pagePayloads[idx].inferred.twoColumn) {
          pagePayloads[idx].printedColumns = {
            left: nextLeft,
            right: nextLeft + 1,
            inferred: true,
          };
          nextLeft -= 2;
        }
      }
    }
  }

  for (const p of pagePayloads) {
    const { pageNum, pageWidth, pageHeight, items, inferred, printedColumns } =
      p;
    let leftCol = null;
    let rightCol = null;

    if (usePrinted) {
      if (printedColumns) {
        leftCol = printedColumns.left;
        rightCol = printedColumns.right;
      } else {
        // Front-matter / drawing page — not part of the spec column space.
      }
    } else {
      // Pure running-counter fallback (oldest patents or OCR-stripped).
      if (inferred.twoColumn) {
        leftCol = docColumnCounter + 1;
        rightCol = docColumnCounter + 2;
        docColumnCounter += 2;
      }
    }

    let pageEntry;
    if (leftCol !== null) {
      const pageLines = inferred.lines.map((l) => ({
        ...l,
        col: l.col === 1 ? leftCol : rightCol,
        page: pageNum,
      }));
      for (const line of pageLines) {
        lineIndex.set(`${line.col}:${line.lineNumber}`, line);
      }
      pageEntry = {
        pageNum,
        pageWidth,
        pageHeight,
        items,
        lines: pageLines,
        columns: [leftCol, rightCol],
        printedColumns: printedColumns ?? null,
      };
    } else {
      pageEntry = {
        pageNum,
        pageWidth,
        pageHeight,
        items,
        lines: inferred.lines.map((l) => ({
          ...l,
          col: null,
          page: pageNum,
        })),
        columns: [],
        printedColumns: null,
      };
    }
    pages.push(pageEntry);
  }

  await doc.destroy();

  return {
    pages,
    totalPages,
    linesFor(col, lineStart, lineEnd) {
      // Bug fix (Plan 28-05 calibration): callers
      // (collectLinesAcrossColumns) pass `Number.POSITIVE_INFINITY` to mean
      // "to end of column". Iterating from N..Infinity hangs Node. Cap at
      // MAX_LINES_PER_COLUMN, which is safely above US patent norms (~70
      // lines per column post-1990; the line numbering is reset per
      // column).
      const MAX_LINES_PER_COLUMN = 120;
      const hi = Number.isFinite(lineEnd) ? lineEnd : MAX_LINES_PER_COLUMN;
      const out = [];
      for (let n = lineStart; n <= hi; n++) {
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

/**
 * PositionMap builder for the Patent Citation Tool extension.
 *
 * Transforms raw per-page text items (from pdf-parser.js) into a PositionMap —
 * an array of line-level entries with page, document-wide column number, line
 * number, text, wrap-hyphen flag, bounding box, and section tag.
 *
 * This is the contract between Phase 2 (parsing) and Phase 3 (matching/citation).
 * Phase 3 should not need to re-parse the PDF.
 *
 * Algorithm:
 * 1. Identify two-column specification pages (skip cover, figures, sparse pages)
 * 2. For each two-column page: filter headers/footers, split into left/right
 *    columns via dynamic gap detection, cluster items into lines by y-coordinate
 * 3. Assign document-wide column numbers (1, 2, 3, 4...)
 * 4. Detect claims boundary and tag sections
 * 5. Detect wrap hyphens
 */

// NOTE: Internal functions are exported for Vitest unit testing.
// This file is loaded as an ES module in the offscreen document context.

// ---------------------------------------------------------------------------
// Two-column page detection
// ---------------------------------------------------------------------------

/**
 * Detect whether a page has two-column text layout by analyzing x-coordinate
 * distribution. Layout-first detection (bimodal x-coordinate), not keyword
 * matching.
 *
 * @param {Array} pageItems - Text items on this page.
 * @param {number} pageWidth - Width of the page in points.
 * @returns {boolean} True if the page has a two-column layout.
 */
export function isTwoColumnPage(pageItems, pageWidth) {
  // Too few items = figure page, blank page, or sparse page
  if (pageItems.length < 20) return false;

  const midX = pageWidth / 2;
  let leftCount = 0;
  let rightCount = 0;

  for (const item of pageItems) {
    if (item.x < midX) leftCount++;
    else rightCount++;
  }

  // Two-column page: substantial text in both halves
  // Ratio > 0.3 means smaller side has at least 30% of larger side's items
  const total = leftCount + rightCount;
  if (total < 30) return false;

  const ratio = Math.min(leftCount, rightCount) / Math.max(leftCount, rightCount);
  return ratio > 0.3;
}

// ---------------------------------------------------------------------------
// Column boundary detection
// ---------------------------------------------------------------------------

/**
 * Find the gutter (whitespace gap) between left and right columns.
 * Uses dynamic gap detection rather than a hardcoded midpoint.
 *
 * @param {Array} pageItems - Text items on this page.
 * @param {number} pageWidth - Width of the page in points.
 * @returns {number} The x-coordinate of the column boundary.
 */
export function findColumnBoundary(pageItems, pageWidth) {
  // Collect all x-coordinates into buckets (1pt resolution)
  const buckets = new Array(Math.ceil(pageWidth)).fill(0);
  for (const item of pageItems) {
    const bucketIdx = Math.floor(item.x);
    if (bucketIdx >= 0 && bucketIdx < buckets.length) {
      buckets[bucketIdx]++;
    }
  }

  // Find all zero-count gaps (>= 5pt wide) in the middle half of the page
  const searchStart = Math.floor(pageWidth * 0.25);
  const searchEnd = Math.ceil(pageWidth * 0.75);
  const pageMid = pageWidth / 2;

  const gaps = [];
  let currentGapStart = -1;

  for (let i = searchStart; i < searchEnd; i++) {
    if (buckets[i] === 0) {
      if (currentGapStart === -1) currentGapStart = i;
    } else {
      if (currentGapStart !== -1) {
        const width = i - currentGapStart;
        if (width >= 5) gaps.push({ start: currentGapStart, end: i, width });
        currentGapStart = -1;
      }
    }
  }
  if (currentGapStart !== -1) {
    const width = searchEnd - currentGapStart;
    if (width >= 5) gaps.push({ start: currentGapStart, end: searchEnd, width });
  }

  if (gaps.length === 0) return pageMid;

  // Pick the gap closest to page center. The column gutter in a two-column
  // patent layout is always near the center. Other gaps (within columns,
  // between indented text) are further from center.
  let bestGap = gaps[0];
  let bestDist = Math.abs((gaps[0].start + gaps[0].end) / 2 - pageMid);
  for (let i = 1; i < gaps.length; i++) {
    const gapMid = (gaps[i].start + gaps[i].end) / 2;
    const dist = Math.abs(gapMid - pageMid);
    if (dist < bestDist) {
      bestDist = dist;
      bestGap = gaps[i];
    }
  }

  return (bestGap.start + bestGap.end) / 2;
}

// ---------------------------------------------------------------------------
// Printed column number extraction
// ---------------------------------------------------------------------------

/**
 * Extract printed column numbers from the page header area.
 *
 * US patent specification pages have column numbers printed at the top
 * (e.g., "1" on left, "2" on right for the first spec page). These are
 * standalone small numbers in the header region on opposite sides of the
 * page. If found, we use them as the authoritative column numbers.
 *
 * @param {Array} items - All text items on this page.
 * @param {number} pageHeight - Height of the page in points.
 * @param {number} pageWidth - Width of the page in points.
 * @returns {{ left: number, right: number } | null} Printed column numbers, or null if not a spec page.
 */
export function extractPrintedColumnNumbers(items, pageHeight, pageWidth) {
  const headerThreshold = pageHeight - 90;
  const midX = pageWidth / 2;

  // Find header items that are standalone numbers (1-999)
  const headerNumbers = [];
  for (const item of items) {
    if (item.y >= headerThreshold) {
      const text = item.text.trim();
      if (/^\d{1,3}$/.test(text)) {
        headerNumbers.push({ value: parseInt(text, 10), x: item.x });
      }
    }
  }

  if (headerNumbers.length === 0) return null;

  // Find one number on each side of the page midpoint
  const leftNums = headerNumbers.filter(n => n.x < midX).sort((a, b) => a.x - b.x);
  const rightNums = headerNumbers.filter(n => n.x >= midX).sort((a, b) => a.x - b.x);

  let left, right;

  if (leftNums.length > 0 && rightNums.length > 0) {
    // Both sides found — use them directly
    left = leftNums[0].value;
    right = rightNums[0].value;
  } else if (rightNums.length > 0 && leftNums.length === 0) {
    // Only right column number found — infer left (common on first spec page
    // where "1" may be merged with other header text or missing)
    right = rightNums[0].value;
    left = right - 1;
  } else if (leftNums.length > 0 && rightNums.length === 0) {
    // Only left column number found — infer right
    left = leftNums[0].value;
    right = left + 1;
  } else {
    return null;
  }

  // Sanity check: right should be left + 1 (consecutive columns)
  if (right !== left + 1) return null;

  // Sanity check: column numbers should be reasonable (1-999)
  if (left < 1 || right > 999) return null;

  return { left, right };
}

// ---------------------------------------------------------------------------
// Gutter line-number filtering
// ---------------------------------------------------------------------------

/**
 * Remove gutter line-number markers from column items.
 *
 * US patent specifications print line markers (5, 10, 15, ..., 60, 65) in
 * the gutter between the two columns. PDF.js extracts these as standalone
 * text items. If not filtered, they get concatenated into line text (e.g.,
 * "and a 60 bispecific" instead of "and a bispecific").
 *
 * Heuristic: an item is a gutter line marker if:
 * - Its text (trimmed) is a 1-2 digit number that is a multiple of 5 (5-65)
 * - Its x-coordinate is near the column boundary OR near the page center
 *
 * Using page center (pageWidth/2) as an additional anchor because the
 * dynamically-computed boundary can shift significantly per page, but gutter
 * markers are always near the physical center of the page.
 *
 * @param {Array} items - Text items for one column.
 * @param {number} boundary - The x-coordinate of the column boundary.
 * @param {number} pageWidth - Width of the page in points.
 * @returns {Array} Items with gutter line markers removed.
 */
export function filterGutterLineNumbers(items, boundary, pageWidth) {
  const pageMid = pageWidth / 2;
  return items.filter(item => {
    const text = item.text.trim();
    // Must be a standalone 1-2 digit number
    if (!/^\d{1,2}$/.test(text)) return true;
    const num = parseInt(text, 10);
    // Must be a multiple of 5 in the range 5-65
    if (num < 5 || num > 65 || num % 5 !== 0) return true;
    // Must be near the gutter: close to column boundary OR close to page center
    const nearBoundary = Math.abs(item.x - boundary) <= 40;
    const nearCenter = Math.abs(item.x - pageMid) <= 40;
    if (!nearBoundary && !nearCenter) return true;
    // This is a gutter line marker — filter it out
    return false;
  });
}

// ---------------------------------------------------------------------------
// Cross-boundary text contamination removal
// ---------------------------------------------------------------------------

/**
 * Strip cross-boundary gutter contamination from left-column items.
 *
 * In some patent PDFs, a single PDF text item spans from the left column
 * across the gutter into the right column. The item's text contains
 * left-column content, then a gutter line number (a multiple of 5), then
 * right-column content — all as one string. Standard filterGutterLineNumbers
 * cannot detect this because it only removes standalone items, not embedded
 * numbers inside longer text.
 *
 * This function detects items where x + width extends significantly past the
 * column boundary (by more than 20pt, indicating the item physically crosses
 * into the right column), and strips the embedded gutter number and any
 * following text from those items.
 *
 * Pattern stripped: " [5–65, mult of 5] " followed by right-column text
 * This is applied only to items that physically cross the column boundary.
 *
 * @param {Array} items - Text items assigned to the left column.
 * @param {number} boundary - The x-coordinate of the column boundary.
 * @returns {Array} Items with cross-boundary contamination removed.
 */
export function stripCrossBoundaryText(items, boundary) {
  return items.map(item => {
    // Only process items that extend significantly past the column boundary
    const itemEnd = item.x + item.width;
    if (itemEnd <= boundary + 20) return item;

    // Strip embedded gutter line number and following text.
    // Pattern: " [5-65 mult-of-5] " followed by remainder (right-column text)
    // Anchored to word boundary so we don't strip e.g. "25%" or "25-"
    const stripped = item.text.replace(/\s+\b(5|10|15|20|25|30|35|40|45|50|55|60|65)\b\s+.*$/, '');

    if (stripped !== item.text) {
      // Return a copy with stripped text and updated width (approximate)
      return { ...item, text: stripped, width: stripped.length / item.text.length * item.width };
    }

    // No embedded gutter number found but item still crosses boundary.
    // The item may end with a space or trailing content — return as-is.
    // The caller (filterGutterLineNumbers) will handle obvious number-only items.
    return item;
  });
}

// ---------------------------------------------------------------------------
// Header/footer filtering
// ---------------------------------------------------------------------------

/**
 * Remove header and footer text items before line counting.
 * Patent headers (patent number, column headers) are near the top;
 * footers (page numbers, sheet info) are near the bottom.
 *
 * PDF y-origin is bottom-left. Higher y = closer to top.
 *
 * @param {Array} items - Text items on this page.
 * @param {number} pageHeight - Height of the page in points.
 * @returns {Array} Filtered items without headers/footers.
 */
export function filterHeadersFooters(items, pageHeight) {
  // Headers: top ~90pt of page (y > pageHeight - 90)
  //   Column numbers at ~y=713 on 792pt page (pageHeight - 79)
  //   Patent number header at ~y=727 (pageHeight - 65)
  // Footers: bottom ~40pt of page (y < 40)
  const headerThreshold = pageHeight - 90;
  const footerThreshold = 40;

  return items.filter(item => {
    return item.y > footerThreshold && item.y < headerThreshold;
  });
}

// ---------------------------------------------------------------------------
// Line clustering
// ---------------------------------------------------------------------------

/**
 * Group text items with similar y-coordinates into lines.
 * Items within yTolerance points of each other are considered the same line.
 *
 * @param {Array} items - Text items (already filtered for one column).
 * @param {number} yTolerance - Maximum y-distance to consider same line.
 * @returns {Array<Array>} Array of lines, each line is an array of items
 *   sorted left-to-right. Lines are ordered top-to-bottom.
 */
export function clusterIntoLines(items, yTolerance = 3) {
  if (items.length === 0) return [];

  // Sort by y DESCENDING (top of page first, since PDF y=0 is bottom)
  const sorted = [...items].sort((a, b) => b.y - a.y);

  const lines = [];
  let currentLine = [sorted[0]];
  let currentY = sorted[0].y;

  for (let i = 1; i < sorted.length; i++) {
    if (Math.abs(sorted[i].y - currentY) <= yTolerance) {
      currentLine.push(sorted[i]);
    } else {
      // Sort items within line by x (left to right) and finalize
      currentLine.sort((a, b) => a.x - b.x);
      lines.push(currentLine);
      currentLine = [sorted[i]];
      currentY = sorted[i].y;
    }
  }
  // Don't forget last line
  currentLine.sort((a, b) => a.x - b.x);
  lines.push(currentLine);

  return lines;
}

// ---------------------------------------------------------------------------
// Line entry construction
// ---------------------------------------------------------------------------

/**
 * Construct a single PositionMap entry from a cluster of text items.
 *
 * @param {Array} lineItems - Text items in this line, sorted left-to-right.
 * @param {number} pageNum - PDF page number (1-indexed).
 * @param {number} column - Document-wide column number.
 * @param {number} lineNumber - Line number within this column (1-indexed).
 * @returns {Object} A PositionMap entry.
 */
export function buildLineEntry(lineItems, pageNum, column, lineNumber) {
  // Concatenate text fragments. Add space between items unless they're
  // adjacent (item.x + item.width is close to next item.x)
  let text = '';
  for (let i = 0; i < lineItems.length; i++) {
    if (i > 0) {
      const prevEnd = lineItems[i - 1].x + lineItems[i - 1].width;
      const gap = lineItems[i].x - prevEnd;
      // If gap > 1pt, insert a space (unless text already ends with space)
      if (gap > 1 && !text.endsWith(' ')) {
        text += ' ';
      }
    }
    text += lineItems[i].text;
  }

  const firstItem = lineItems[0];
  const lastItem = lineItems[lineItems.length - 1];

  return {
    page: pageNum,
    column,
    lineNumber,
    text: text,
    hasWrapHyphen: false, // Set in post-processing by detectWrapHyphens
    x: firstItem.x,
    y: firstItem.y,
    width: (lastItem.x + lastItem.width) - firstItem.x,
    height: Math.max(...lineItems.map(item => item.height)),
    section: 'description', // Default; updated by detectClaimsBoundary
  };
}

// ---------------------------------------------------------------------------
// Claims boundary detection
// ---------------------------------------------------------------------------

/**
 * Find where the claims section begins using text markers.
 * "What is claimed is:" appears in nearly all US patents.
 *
 * @param {Array} entries - PositionMap entries to search.
 * @returns {number} Index of first claims entry, or -1 if not found.
 */
export function detectClaimsBoundary(entries) {
  const claimsMarkers = [
    /what\s+is\s+claimed\s+is/i,
    /we\s+claim/i,
    /i\s+claim/i,
    /the\s+invention\s+claimed\s+is/i,
  ];

  for (let i = 0; i < entries.length; i++) {
    for (const marker of claimsMarkers) {
      if (marker.test(entries[i].text)) {
        return i;
      }
    }
  }
  return -1; // No claims marker found — mark all as "description"
}

// ---------------------------------------------------------------------------
// Wrap hyphen detection
// ---------------------------------------------------------------------------

/**
 * Flag line-ending hyphens that are word-wrap hyphens (not real hyphens
 * like "well-known").
 *
 * Heuristic: line ends with "-" AND next line in same column starts with
 * a lowercase letter. This is imperfect but catches most cases. Phase 3's
 * fuzzy matching will handle edge cases.
 *
 * @param {Array} entries - PositionMap entries to process (modified in place).
 */
export function detectWrapHyphens(entries) {
  for (let i = 0; i < entries.length - 1; i++) {
    const current = entries[i];
    const next = entries[i + 1];

    // Only check within same column (wrap doesn't cross columns)
    if (current.column !== next.column) continue;

    if (current.text.endsWith('-')) {
      // Wrap hyphen if next line starts with lowercase (word continuation)
      const nextFirstChar = next.text.trimStart().charAt(0);
      if (nextFirstChar && nextFirstChar === nextFirstChar.toLowerCase() && nextFirstChar !== nextFirstChar.toUpperCase()) {
        current.hasWrapHyphen = true;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Gutter line-marker grid extraction
// ---------------------------------------------------------------------------

/**
 * Extract a physical line grid from gutter line-number markers.
 *
 * US patent specifications print line markers (5, 10, 15, ..., 60, 65) in
 * the gutter between the two columns. These markers have known line numbers
 * and known y-positions, so they define a physical grid. By interpolating
 * from this grid, we can assign line numbers to any y-position — ensuring
 * both columns get the same line number for the same y-coordinate.
 *
 * This function uses the same identification criteria as filterGutterLineNumbers
 * (standalone 1-2 digit numbers, multiple of 5, range 5-65, near boundary or
 * page center).
 *
 * @param {Array} items - Text items (after header/footer filtering).
 * @param {number} boundary - The x-coordinate of the column boundary.
 * @param {number} pageWidth - Width of the page in points.
 * @returns {{ firstLineY: number, lineSpacing: number } | null}
 *   Grid parameters, or null if fewer than 2 markers found.
 */
export function extractGutterLineGrid(items, boundary, pageWidth) {
  const pageMid = pageWidth / 2;
  const markers = [];

  for (const item of items) {
    const text = item.text.trim();
    // Must be a standalone 1-2 digit number
    if (!/^\d{1,2}$/.test(text)) continue;
    const num = parseInt(text, 10);
    // Must be a multiple of 5 in the range 5-65
    if (num < 5 || num > 65 || num % 5 !== 0) continue;
    // Must be near the gutter: close to column boundary OR close to page center
    const nearBoundary = Math.abs(item.x - boundary) <= 40;
    const nearCenter = Math.abs(item.x - pageMid) <= 40;
    if (!nearBoundary && !nearCenter) continue;

    markers.push({ lineNumber: num, y: item.y });
  }

  if (markers.length < 2) return null;

  // Deduplicate by lineNumber — keep first encountered (highest y if from
  // top-to-bottom scanning, but we just keep the first since duplicates
  // from the same marker are rare).
  const seen = new Map();
  for (const m of markers) {
    if (!seen.has(m.lineNumber)) {
      seen.set(m.lineNumber, m);
    }
  }
  const unique = [...seen.values()];

  if (unique.length < 2) return null;

  // Sort by lineNumber ascending
  unique.sort((a, b) => a.lineNumber - b.lineNumber);

  // Compute per-marker spacing: for each consecutive pair of markers,
  // calculate the y-distance per line
  const perLineSpacings = [];
  for (let i = 1; i < unique.length; i++) {
    const lineDiff = unique[i].lineNumber - unique[i - 1].lineNumber;
    // y decreases going down the page (PDF coords: y=0 at bottom)
    const yDiff = unique[i - 1].y - unique[i].y;
    if (lineDiff > 0 && yDiff > 0) {
      perLineSpacings.push(yDiff / lineDiff);
    }
  }

  if (perLineSpacings.length === 0) return null;

  // Use median spacing for robustness
  perLineSpacings.sort((a, b) => a - b);
  const lineSpacing = perLineSpacings[Math.floor(perLineSpacings.length / 2)];

  // Extrapolate y-position of line 1 from the first marker
  // firstLineY = marker.y + (marker.lineNumber - 1) * lineSpacing
  // (line 1 is above the marker, i.e. higher y value)
  const firstMarker = unique[0];
  const firstLineY = firstMarker.y + (firstMarker.lineNumber - 1) * lineSpacing;

  return { firstLineY, lineSpacing };
}

// ---------------------------------------------------------------------------
// Grid-based line numbering
// ---------------------------------------------------------------------------

/**
 * Assign line numbers using the gutter-marker grid.
 *
 * Instead of counting blank lines by detecting y-gaps, this approach uses
 * the physical grid derived from gutter markers to compute line numbers
 * by absolute y-position. Both columns on a page share the same grid,
 * ensuring consistent line numbers for the same y-coordinate.
 *
 * @param {Array<Array>} lines - Clustered lines (arrays of text items), top-to-bottom.
 * @param {Array} entries - PositionMap entries array to push into.
 * @param {number} pageNum - PDF page number.
 * @param {number} column - Document-wide column number.
 * @param {{ firstLineY: number, lineSpacing: number }} grid - Grid from extractGutterLineGrid.
 */
export function assignLineNumbersByGrid(lines, entries, pageNum, column, grid) {
  for (const lineItems of lines) {
    // Compute average y of items in this line
    const avgY = lineItems.reduce((sum, item) => sum + item.y, 0) / lineItems.length;

    // Compute line number from grid position
    const lineNumber = 1 + Math.round((grid.firstLineY - avgY) / grid.lineSpacing);

    // Clamp to >= 1 (safety for items above the expected first line)
    entries.push(buildLineEntry(lineItems, pageNum, column, Math.max(1, lineNumber)));
  }
}

// ---------------------------------------------------------------------------
// Blank-line-aware line numbering
// ---------------------------------------------------------------------------

/**
 * Assign line numbers to clustered lines, accounting for blank lines.
 *
 * Patent line numbers count blank lines (visible as vertical gaps in the PDF).
 * PDF.js only extracts text-bearing items, so blank lines have no items.
 * We detect them by measuring y-gaps between consecutive text lines:
 * if a gap is significantly larger than the typical line spacing, we infer
 * one or more blank lines were skipped and adjust the line counter.
 *
 * @param {Array<Array>} lines - Clustered lines (arrays of text items), top-to-bottom.
 * @param {Array} entries - PositionMap entries array to push into.
 * @param {number} pageNum - PDF page number.
 * @param {number} column - Document-wide column number.
 */
export function assignLineNumbers(lines, entries, pageNum, column) {
  if (lines.length === 0) return;

  // Compute median line spacing from consecutive line pairs.
  // Use the representative y of each line (average y of its items).
  const lineYs = lines.map(lineItems => {
    const sum = lineItems.reduce((s, item) => s + item.y, 0);
    return sum / lineItems.length;
  });

  const spacings = [];
  for (let i = 1; i < lineYs.length; i++) {
    // y decreases top-to-bottom (PDF coords), so previous - current = spacing
    const spacing = lineYs[i - 1] - lineYs[i];
    if (spacing > 0) spacings.push(spacing);
  }

  if (spacings.length === 0) {
    // Single line or no measurable spacing — just number sequentially
    for (let i = 0; i < lines.length; i++) {
      entries.push(buildLineEntry(lines[i], pageNum, column, i + 1));
    }
    return;
  }

  // Median spacing = typical single line-to-line distance
  spacings.sort((a, b) => a - b);
  const medianSpacing = spacings[Math.floor(spacings.length / 2)];

  let lineNumber = 1;
  entries.push(buildLineEntry(lines[0], pageNum, column, lineNumber));

  for (let i = 1; i < lines.length; i++) {
    const gap = lineYs[i - 1] - lineYs[i];
    // How many line-heights fit in this gap? Round to nearest integer.
    // A gap of ~1x spacing = adjacent lines (no blanks).
    // A gap of ~2x spacing = 1 blank line between them, etc.
    const lineSpans = Math.max(1, Math.round(gap / medianSpacing));
    lineNumber += lineSpans;
    entries.push(buildLineEntry(lines[i], pageNum, column, lineNumber));
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Build a PositionMap from per-page text items extracted by pdf-parser.js.
 *
 * The PositionMap is an array of line-level entries, each containing:
 * - page: PDF page number (1-indexed)
 * - column: Document-wide column number (1, 2, 3, 4...)
 * - lineNumber: Line within this column (1-indexed, resets per column)
 * - text: Raw text as it appears in PDF (fragments joined into line)
 * - hasWrapHyphen: True if line ends with a word-wrap hyphen
 * - x, y, width, height: Bounding box of the line
 * - section: "description" or "claims"
 *
 * @param {Array} pageResults - Per-page text items from extractTextFromPdf.
 * @returns {Array} PositionMap entries.
 */
export function buildPositionMap(pageResults) {
  const entries = [];
  for (const pageResult of pageResults) {
    const { pageNum, items, pageWidth, pageHeight } = pageResult;

    // Skip non-two-column pages
    if (!isTwoColumnPage(items, pageWidth)) continue;

    // Extract printed column numbers from page headers.
    // Only specification pages have printed column numbers — this
    // automatically skips cover pages, figure pages, and other non-spec
    // two-column pages (like sequence listings without column headers).
    const colNums = extractPrintedColumnNumbers(items, pageHeight, pageWidth);
    if (!colNums) continue;

    // Find column boundary for this page
    const boundary = findColumnBoundary(items, pageWidth);

    // Filter headers/footers
    const filtered = filterHeadersFooters(items, pageHeight);
    if (filtered.length === 0) continue;

    // Extract gutter line-marker grid BEFORE filtering gutter markers out.
    // The grid provides absolute y-to-line-number mapping, ensuring both
    // columns get consistent line numbers for the same y-coordinate.
    const grid = extractGutterLineGrid(filtered, boundary, pageWidth);

    // Split into left and right column items.
    // For left-column items, first strip any cross-boundary contamination
    // (PDF text items that physically span from left column into the right
    // column, containing embedded gutter line numbers and right-column text).
    const leftItems = filterGutterLineNumbers(
      stripCrossBoundaryText(
        filtered.filter(item => item.x < boundary),
        boundary
      ),
      boundary, pageWidth
    );
    const rightItems = filterGutterLineNumbers(
      filtered.filter(item => item.x >= boundary), boundary, pageWidth
    );

    // Process left column (use printed column number)
    const leftLines = clusterIntoLines(leftItems);
    if (grid) {
      assignLineNumbersByGrid(leftLines, entries, pageNum, colNums.left, grid);
    } else {
      assignLineNumbers(leftLines, entries, pageNum, colNums.left);
    }

    // Process right column (use printed column number)
    const rightLines = clusterIntoLines(rightItems);
    if (grid) {
      assignLineNumbersByGrid(rightLines, entries, pageNum, colNums.right, grid);
    } else {
      assignLineNumbers(rightLines, entries, pageNum, colNums.right);
    }
  }

  // Detect claims boundary and tag sections
  const claimsStart = detectClaimsBoundary(entries);
  if (claimsStart >= 0) {
    for (let i = claimsStart; i < entries.length; i++) {
      entries[i].section = 'claims';
    }
  }

  // Detect wrap hyphens
  detectWrapHyphens(entries);

  return entries;
}

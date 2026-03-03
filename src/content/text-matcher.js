/**
 * Text matching and citation formatting for the Patent Citation Tool.
 *
 * This file is a classic script loaded via manifest content_scripts array
 * BEFORE content-script.js. All functions are available as globals to
 * content-script.js and any other content scripts.
 *
 * Provides:
 * - normalizeText(text) — normalize for HTML-to-PDF divergence comparison
 * - matchAndCite(selectedText, positionMap) — find selected text in PositionMap
 * - formatCitation(startEntry, endEntry) — format col:line citation string
 * - fuzzySubstringMatch(needle, haystack) — Levenshtein sliding window fallback
 * - levenshtein(a, b) — edit distance between two strings
 * - resolveMatch(matchStart, matchEnd, boundaries, positionMap, confidence) — map char positions to entries
 */

/**
 * Normalize text for comparison, handling known HTML-to-PDF divergences.
 *
 * Handles: smart/curly quotes, em/en dashes, ligatures (fi, fl, ff, ffi, ffl),
 * and whitespace collapse.
 *
 * @param {string} text - Raw text to normalize.
 * @returns {string} Normalized text for comparison.
 */
/**
 * Whitespace-stripped matching. Removes all whitespace from both the
 * normalized selection and the concat, finds the match in stripped space,
 * then maps back to original concat positions for boundary resolution.
 */
function whitespaceStrippedMatch(normalized, concat, boundaries, positionMap) {
  const selStripped = normalized.replace(/\s/g, '');
  if (selStripped.length < 2) return null;

  const concatStripped = [];
  const strippedToOriginal = [];
  for (let i = 0; i < concat.length; i++) {
    if (!/\s/.test(concat[i])) {
      strippedToOriginal.push(i);
      concatStripped.push(concat[i]);
    }
  }
  const concatStrippedStr = concatStripped.join('');

  let idx = concatStrippedStr.indexOf(selStripped);
  let confidence = 0.99;

  if (idx === -1) {
    idx = concatStrippedStr.toLowerCase().indexOf(selStripped.toLowerCase());
    confidence = 0.98;
  }

  if (idx === -1) {
    const trimmed = selStripped.replace(/^[.,;:!?]+/, '').replace(/[.,;:!?]+$/, '');
    if (trimmed.length >= 2 && trimmed !== selStripped) {
      idx = concatStrippedStr.indexOf(trimmed);
      confidence = 0.98;
      if (idx === -1) {
        idx = concatStrippedStr.toLowerCase().indexOf(trimmed.toLowerCase());
        confidence = 0.97;
      }
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
          const origStart = strippedToOriginal[mappedStart];
          const origEnd = strippedToOriginal[mappedEnd - 1] + 1;
          return resolveMatch(origStart, origEnd, boundaries, positionMap, 0.96);
        }
      }
    }
  }

  if (idx === -1) return null;

  const origStart = strippedToOriginal[idx];
  const origEnd = strippedToOriginal[idx + selStripped.length - 1] + 1;

  return resolveMatch(origStart, origEnd, boundaries, positionMap, confidence);
}

/**
 * Bookend matching: match beginning and end of selection separately.
 * Handles cases where the middle differs between HTML and PDF.
 */
function bookendMatch(normalized, concat, boundaries, positionMap) {
  const BOOKEND_LEN = 50;
  const selStripped = normalized.replace(/\s/g, '');
  if (selStripped.length < BOOKEND_LEN * 2) return null;

  const prefix = selStripped.substring(0, BOOKEND_LEN);
  const suffix = selStripped.substring(selStripped.length - BOOKEND_LEN);

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

  const maxSpan = selStripped.length * 2;

  let searchFrom = 0;
  while (searchFrom < concatStripped.length) {
    let prefixIdx = concatStripped.indexOf(prefix, searchFrom);
    if (prefixIdx === -1) prefixIdx = concatStrippedLower.indexOf(prefixLower, searchFrom);
    if (prefixIdx === -1) break;

    const suffixSearchStart = prefixIdx + BOOKEND_LEN;
    let suffixIdx = concatStripped.indexOf(suffix, suffixSearchStart);
    if (suffixIdx === -1) suffixIdx = concatStrippedLower.indexOf(suffixLower, suffixSearchStart);

    if (suffixIdx !== -1) {
      const span = (suffixIdx + BOOKEND_LEN) - prefixIdx;

      if (span <= maxSpan) {
        const origStart = strippedToOriginal[prefixIdx];
        const origEnd = strippedToOriginal[suffixIdx + BOOKEND_LEN - 1] + 1;

        const startBoundary = boundaries.find(b => b.charStart <= origStart && b.charEnd > origStart);
        const endBoundary = boundaries.find(b => b.charStart < origEnd && b.charEnd >= origEnd);

        if (startBoundary && endBoundary && endBoundary.entryIdx - startBoundary.entryIdx <= 60) {
          return resolveMatch(origStart, origEnd, boundaries, positionMap, 0.92);
        }
      }
    }

    searchFrom = prefixIdx + 1;
  }

  return null;
}

function normalizeText(text) {
  return text
    .normalize('NFC')
    // Strip zero-width and invisible characters (common in HTML but absent in PDF)
    .replace(/[\u200B\u200C\u200D\uFEFF\u00AD\u200E\u200F\u2060\u2061\u2062\u2063\u2064]/g, '')
    // Smart/curly quotes to straight quotes
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    // Dashes to hyphen-minus
    .replace(/[\u2013\u2014\u2015]/g, '-')
    // Ligatures to individual characters
    .replace(/\uFB01/g, 'fi')
    .replace(/\uFB02/g, 'fl')
    .replace(/\uFB00/g, 'ff')
    .replace(/\uFB03/g, 'ffi')
    .replace(/\uFB04/g, 'ffl')
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Core matching function. Given selected text and a PositionMap, find the
 * selection in the concatenated PositionMap text and return a citation.
 *
 * Uses exact normalized match first, fuzzy Levenshtein fallback second.
 *
 * @param {string} selectedText - The text the user selected on the page.
 * @param {Array} positionMap - Array of PositionMap entries from Phase 2.
 * @returns {{ citation: string, startEntry: object, endEntry: object, confidence: number } | null}
 */
function matchAndCite(selectedText, positionMap) {
  let normalized = normalizeText(selectedText);
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

  // Build concatenated text with boundary tracking (single pass)
  let concat = '';
  const boundaries = [];

  for (let i = 0; i < positionMap.length; i++) {
    const entry = positionMap[i];
    let lineText = normalizeText(entry.text);

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

  // Exact normalized match
  const idx = concat.indexOf(normalized);
  if (idx !== -1) {
    return resolveMatch(idx, idx + normalized.length, boundaries, positionMap, 1.0);
  }

  // Whitespace-stripped match: PDF text items have inconsistent boundaries
  // causing spaces inside words ("nucle otide") or before punctuation
  // ("herein , the"). Strip all whitespace from both sides and match,
  // then map back to the original concat positions.
  const strippedResult = whitespaceStrippedMatch(normalized, concat, boundaries, positionMap);
  if (strippedResult) return strippedResult;

  // Bookend match: for longer selections, match beginning and end separately
  if (normalized.length > 60) {
    const bookendResult = bookendMatch(normalized, concat, boundaries, positionMap);
    if (bookendResult) return bookendResult;
  }

  // Fuzzy fallback
  const fuzzyResult = fuzzySubstringMatch(normalized, concat);
  if (fuzzyResult && fuzzyResult.similarity >= 0.80) {
    return resolveMatch(
      fuzzyResult.start, fuzzyResult.end,
      boundaries, positionMap, fuzzyResult.similarity
    );
  }

  return null;
}

/**
 * Map character-level match positions back to PositionMap entries.
 *
 * @param {number} matchStart - Start character index in concatenated text.
 * @param {number} matchEnd - End character index in concatenated text.
 * @param {Array} boundaries - Boundary array from concatenation.
 * @param {Array} positionMap - The PositionMap entries.
 * @param {number} confidence - Match confidence (1.0 for exact, 0-1 for fuzzy).
 * @returns {{ citation: string, startEntry: object, endEntry: object, confidence: number } | null}
 */
function resolveMatch(matchStart, matchEnd, boundaries, positionMap, confidence) {
  const startBoundary = boundaries.find(b => b.charStart <= matchStart && b.charEnd > matchStart);
  const endBoundary = boundaries.find(b => b.charStart < matchEnd && b.charEnd >= matchEnd);

  if (!startBoundary || !endBoundary) return null;

  const startEntry = positionMap[startBoundary.entryIdx];
  const endEntry = positionMap[endBoundary.entryIdx];

  return {
    citation: formatCitation(startEntry, endEntry),
    startEntry,
    endEntry,
    confidence,
  };
}

/**
 * Format a citation string from start and end PositionMap entries.
 *
 * Formats:
 * - Single line: col:line (e.g., 4:15)
 * - Same-column range: col:startLine-endLine (e.g., 4:15-20)
 * - Cross-column range: startCol:startLine-endCol:endLine (e.g., 4:55-5:10)
 *
 * @param {object} startEntry - PositionMap entry where match begins.
 * @param {object} endEntry - PositionMap entry where match ends.
 * @returns {string} Formatted citation string.
 */
function formatCitation(startEntry, endEntry) {
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
 * Searches for the best approximate match of needle within haystack,
 * allowing up to 20% edit distance.
 *
 * Performance: O(n*m*w) where n=needle length, m=haystack length, w=window range.
 * Acceptable for typical selections (50-500 chars) against patents (5000-20000 chars).
 *
 * @param {string} needle - Normalized selected text to find.
 * @param {string} haystack - Concatenated normalized PositionMap text.
 * @returns {{ start: number, end: number, similarity: number } | null}
 */
function fuzzySubstringMatch(needle, haystack) {
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
      const distance = levenshtein(needle, candidate);
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
 * Compute the Levenshtein (edit) distance between two strings.
 *
 * @param {string} a - First string.
 * @param {string} b - Second string.
 * @returns {number} Edit distance.
 */
function levenshtein(a, b) {
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

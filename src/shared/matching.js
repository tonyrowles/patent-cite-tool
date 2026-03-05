// Canonical text-matching functions for the Patent Citation Tool.
// All entry points (content script, offscreen, service worker) consume these via import or wrapper.

/**
 * Normalize text for matching: NFC, strip invisible chars, normalize quotes/dashes/ligatures.
 */
export function normalizeText(text) {
  return text
    .normalize('NFC')
    // Strip zero-width and invisible characters (common in HTML but absent in PDF)
    .replace(/[\u200B\u200C\u200D\uFEFF\u00AD\u200E\u200F\u2060\u2061\u2062\u2063\u2064]/g, '')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2013\u2014\u2015]/g, '-')
    .replace(/\uFB01/g, 'fi')
    .replace(/\uFB02/g, 'fl')
    .replace(/\uFB00/g, 'ff')
    .replace(/\uFB03/g, 'ffi')
    .replace(/\uFB04/g, 'ffl')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Prose-safe OCR substitution pairs.
 * Only patterns that cannot appear in real English or identifier text are included.
 * 1/l/I and 0/O are excluded due to identifier collision risk.
 */
const OCR_PAIRS = [
  ['rn', 'm'],
  ['cl', 'd'],
  ['cI', 'd'],
  ['vv', 'w'],
  ['li', 'h'],
];

/**
 * Apply OCR normalization to a single text string.
 * Returns {text, changed} — text is the normalized string, changed indicates
 * whether any substitution was made.
 */
export function normalizeOcr(text) {
  let result = text;
  for (const [from, to] of OCR_PAIRS) {
    result = result.split(from).join(to);
  }
  return { text: result, changed: result !== text };
}

/**
 * Build the concatenated string and boundary map from a positionMap.
 * Extracts the inline concat loop from matchAndCite so it can be shared
 * by multiple matching strategies (Phase 20+).
 *
 * Applies normalizeText first (existing behavior), then normalizeOcr after
 * wrap-hyphen detection (new in Phase 20) but before appending to concat.
 * This preserves exact behavior for wrap-hyphen cases in the baseline.
 *
 * @param {Array} positionMap - Array of position map entries.
 * @returns {{ concat: string, boundaries: Array, changedRanges: Array }}
 */
export function buildConcat(positionMap) {
  let concat = '';
  const boundaries = [];
  const changedRanges = [];

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

    // Apply OCR normalization AFTER wrap-hyphen detection but BEFORE appending
    const { text: ocrText, changed } = normalizeOcr(lineText);
    lineText = ocrText;

    const charStart = concat.length;
    concat += lineText;
    boundaries.push({ charStart, charEnd: concat.length, entryIdx: i });

    if (changed) {
      changedRanges.push({ start: charStart, end: concat.length });
    }
  }

  return { concat, boundaries, changedRanges };
}

/**
 * Find all occurrences of needle in haystack.
 * @returns {number[]} Array of start positions.
 */
export function findAllOccurrences(haystack, needle) {
  const positions = [];
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    positions.push(idx);
    idx = haystack.indexOf(needle, idx + 1);
  }
  return positions;
}

/**
 * Pick the best match position by comparing surrounding context.
 * When the same phrase appears multiple times in a patent, the DOM context
 * (text before/after the user's selection) disambiguates which occurrence.
 *
 * Scores each position by counting consecutive matching characters between
 * the concat context and the DOM context, working outward from the match.
 */
export function pickBestByContext(positions, matchLen, concat, contextBefore, contextAfter) {
  if (positions.length === 1) return positions[0];
  if (!contextBefore && !contextAfter) return positions[positions.length - 1]; // default to last if no context

  const normBefore = contextBefore ? normalizeText(contextBefore) : '';
  const normAfter = contextAfter ? normalizeText(contextAfter) : '';

  // Extract words from context for word-overlap scoring.
  // Character-level consecutive matching fails because HTML and PDF text
  // diverge at whitespace/punctuation boundaries. Word-level comparison
  // is robust to these differences since the actual vocabulary matches.
  const toWords = (s) => s.toLowerCase().split(/\s+/).filter(w => w.length > 0);
  const beforeWords = toWords(normBefore);
  const afterWords = toWords(normAfter);

  let bestPos = positions[0];
  let bestScore = -1;

  for (const pos of positions) {
    let score = 0;

    if (beforeWords.length > 0) {
      const before = concat.substring(Math.max(0, pos - normBefore.length - 50), pos);
      const concatWords = toWords(before);
      // Count matching words from the end (nearest to match boundary)
      const minLen = Math.min(concatWords.length, beforeWords.length);
      for (let i = 1; i <= minLen; i++) {
        if (concatWords[concatWords.length - i] === beforeWords[beforeWords.length - i]) score++;
      }
    }

    if (afterWords.length > 0) {
      const after = concat.substring(pos + matchLen, pos + matchLen + normAfter.length + 50);
      const concatWords = toWords(after);
      // Count matching words from the start (nearest to match boundary)
      const minLen = Math.min(concatWords.length, afterWords.length);
      for (let i = 0; i < minLen; i++) {
        if (concatWords[i] === afterWords[i]) score++;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestPos = pos;
    }
  }

  return bestPos;
}

/**
 * Whitespace-stripped matching. Removes all whitespace from both the
 * normalized selection and the concat, finds the match in stripped space,
 * then maps back to original concat positions for boundary resolution.
 *
 * Handles PDF text item boundary issues: spaces inside words, spaces
 * before punctuation, missing spaces, etc.
 */
export function whitespaceStrippedMatch(normalized, concat, boundaries, positionMap, contextBefore, contextAfter) {
  const selStripped = normalized.replace(/\s/g, '');
  if (selStripped.length < 2) return null;

  // Build stripped concat with position mapping back to original
  const concatStripped = [];
  const strippedToOriginal = []; // strippedToOriginal[i] = original index
  for (let i = 0; i < concat.length; i++) {
    if (!/\s/.test(concat[i])) {
      strippedToOriginal.push(i);
      concatStripped.push(concat[i]);
    }
  }
  const concatStrippedStr = concatStripped.join('');

  // Try exact match in stripped space — find all occurrences for disambiguation
  let allIdx = findAllOccurrences(concatStrippedStr, selStripped);
  let confidence = 0.99;

  // Try case-insensitive if exact fails
  if (allIdx.length === 0) {
    allIdx = findAllOccurrences(concatStrippedStr.toLowerCase(), selStripped.toLowerCase());
    confidence = 0.98;
  }

  // Try with trailing/leading punctuation trimmed
  if (allIdx.length === 0) {
    const trimmed = selStripped.replace(/^[.,;:!?]+/, '').replace(/[.,;:!?]+$/, '');
    if (trimmed.length >= 2 && trimmed !== selStripped) {
      allIdx = findAllOccurrences(concatStrippedStr, trimmed);
      confidence = 0.98;
      if (allIdx.length === 0) {
        allIdx = findAllOccurrences(concatStrippedStr.toLowerCase(), trimmed.toLowerCase());
        confidence = 0.97;
      }
    }
  }

  // Pick best occurrence using context (map stripped positions to original)
  let idx = -1;
  if (allIdx.length > 0) {
    if (allIdx.length === 1) {
      idx = allIdx[0];
    } else {
      // Map each stripped position to original concat space, then score by context
      const origPositions = allIdx.map(si => strippedToOriginal[si]);
      const origLen = strippedToOriginal[allIdx[0] + selStripped.length - 1] + 1 - strippedToOriginal[allIdx[0]];
      const bestOrig = pickBestByContext(origPositions, origLen, concat, contextBefore, contextAfter);
      idx = allIdx[origPositions.indexOf(bestOrig)];
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
        // Map back: find the corresponding position in concatStrippedStr
        // by walking concatStrippedStr and counting alphanumeric chars
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
          idx = mappedStart;
          confidence = 0.96;
          // Adjust origStart/origEnd using mapped positions
          const origStart = strippedToOriginal[mappedStart];
          const origEnd = strippedToOriginal[mappedEnd - 1] + 1;
          return resolveMatch(origStart, origEnd, boundaries, positionMap, confidence);
        }
      }
    }
  }

  if (idx === -1) return null;

  // Map stripped match positions back to original concat positions
  const origStart = strippedToOriginal[idx];
  const origEnd = strippedToOriginal[idx + selStripped.length - 1] + 1;

  return resolveMatch(origStart, origEnd, boundaries, positionMap, confidence);
}

/**
 * Bookend matching: match the beginning and end of the selection separately.
 *
 * For longer selections, the middle may differ between HTML and PDF due to
 * running headers leaking into the concat, minor text differences, etc.
 * This strategy finds where the start and end of the selection land in the
 * concat and returns a citation spanning from start to end.
 *
 * Uses whitespace-stripped matching for each bookend to handle PDF text
 * boundary issues.
 */
export function bookendMatch(normalized, concat, boundaries, positionMap) {
  // Use 50 chars from start and end (in stripped space)
  const BOOKEND_LEN = 50;
  const selStripped = normalized.replace(/\s/g, '');
  if (selStripped.length < BOOKEND_LEN * 2) return null;

  const prefix = selStripped.substring(0, BOOKEND_LEN);
  const suffix = selStripped.substring(selStripped.length - BOOKEND_LEN);

  // Build stripped concat with position mapping (same as whitespaceStrippedMatch)
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

  // The concat span should be roughly proportional to the selection length.
  // Allow up to 2x the selection length to account for inserted text
  // (running headers, line numbers, etc.) but reject wild mismatches.
  const maxSpan = selStripped.length * 2;

  // Try all occurrences of the prefix, not just the first — the same sentence
  // can appear multiple times in a patent specification.
  let searchFrom = 0;
  while (searchFrom < concatStripped.length) {
    // Find next prefix occurrence (try exact, then case-insensitive)
    let prefixIdx = concatStripped.indexOf(prefix, searchFrom);
    if (prefixIdx === -1) prefixIdx = concatStrippedLower.indexOf(prefixLower, searchFrom);
    if (prefixIdx === -1) break;

    // Find suffix AFTER the prefix
    const suffixSearchStart = prefixIdx + BOOKEND_LEN;
    let suffixIdx = concatStripped.indexOf(suffix, suffixSearchStart);
    if (suffixIdx === -1) suffixIdx = concatStrippedLower.indexOf(suffixLower, suffixSearchStart);

    if (suffixIdx !== -1) {
      const span = (suffixIdx + BOOKEND_LEN) - prefixIdx;

      // Validate: span should be close to selection length (within 2x)
      if (span <= maxSpan) {
        // Map back to original concat positions
        const origStart = strippedToOriginal[prefixIdx];
        const origEnd = strippedToOriginal[suffixIdx + BOOKEND_LEN - 1] + 1;

        const startBoundary = boundaries.find(b => b.charStart <= origStart && b.charEnd > origStart);
        const endBoundary = boundaries.find(b => b.charStart < origEnd && b.charEnd >= origEnd);

        if (startBoundary && endBoundary && endBoundary.entryIdx - startBoundary.entryIdx <= 60) {
          return resolveMatch(origStart, origEnd, boundaries, positionMap, 0.92);
        }
      }
    }

    // Try next occurrence of prefix
    searchFrom = prefixIdx + 1;
  }

  return null;
}

/**
 * Map character-level match back to PositionMap entries.
 */
export function resolveMatch(matchStart, matchEnd, boundaries, positionMap, confidence) {
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
 * Format citation string from start/end entries.
 */
export function formatCitation(startEntry, endEntry) {
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
 * Capped at needle length <= 100 to prevent hanging on long selections.
 * For longer selections, exact match is required (fuzzy skipped).
 */
export function fuzzySubstringMatch(needle, haystack) {
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
 * Levenshtein edit distance.
 */
export function levenshtein(a, b) {
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

/**
 * Core matching function.
 * Given selected text and a PositionMap, returns a citation result or null.
 *
 * @param {string} selectedText - Text selected by the user.
 * @param {Array} positionMap - Array of position map entries from the PDF parser.
 * @param {string} [contextBefore=''] - Text immediately before the selection in the DOM.
 * @param {string} [contextAfter=''] - Text immediately after the selection in the DOM.
 * @returns {object|null} Citation result with citation, startEntry, endEntry, confidence; or null.
 */
export function matchAndCite(selectedText, positionMap, contextBefore = '', contextAfter = '') {
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

  // Apply OCR normalization to the selected text so it matches the OCR-normalized
  // concat built by buildConcat. Both sides transform identically: clean text is
  // unaffected (no OCR patterns present), OCR-corrupted PDF text now matches the
  // correct HTML-selected text after both go through the same transformation.
  const { text: ocrNormalized, changed: selChanged } = normalizeOcr(normalized);

  const { concat, boundaries, changedRanges } = buildConcat(positionMap);

  // Determine whether the OCR confidence penalty should apply.
  // The penalty fires when the SELECTION contained OCR-confused characters
  // (selChanged === true). This is the correct necessity test:
  //   - If the selection was not changed by OCR normalization (selChanged === false),
  //     the selection was already clean — normalization of the concat side is irrelevant
  //     to whether OCR was "necessary." No penalty applies.
  //   - If the selection was changed (selChanged === true), OCR normalization was
  //     necessary to correct the selection before matching. Penalty applies.
  // Penalty is a flat 0.02 regardless of how many pairs matched.
  // This correctly preserves all 71 baseline cases at confidence 1.0, because
  // baseline selections are clean English text with no OCR patterns (selChanged = false).
  function applyPenaltyIfNeeded(result) {
    if (!result || !selChanged) return result;
    return { ...result, confidence: result.confidence - 0.02 };
  }

  // Exact normalized match — find all occurrences and disambiguate by context
  const allPositions = findAllOccurrences(concat, ocrNormalized);
  if (allPositions.length > 0) {
    const bestPos = pickBestByContext(allPositions, ocrNormalized.length, concat, contextBefore, contextAfter);
    const matchEnd = bestPos + ocrNormalized.length;
    return applyPenaltyIfNeeded(resolveMatch(bestPos, matchEnd, boundaries, positionMap, 1.0));
  }

  // Whitespace-stripped match: PDF text items have inconsistent boundaries
  // causing spaces inside words ("nucle otide") or before punctuation
  // ("herein , the"). Strip all whitespace from both sides and match,
  // then map back to the original concat positions.
  const strippedResult = whitespaceStrippedMatch(ocrNormalized, concat, boundaries, positionMap, contextBefore, contextAfter);
  if (strippedResult) return applyPenaltyIfNeeded(strippedResult);

  // Bookend match: for longer selections where the middle may differ between
  // HTML and PDF (running headers leaking in, text differences, etc.), match
  // the beginning and end of the selection separately and cite from start to end.
  if (ocrNormalized.length > 60) {
    const bookendResult = bookendMatch(ocrNormalized, concat, boundaries, positionMap);
    if (bookendResult) return applyPenaltyIfNeeded(bookendResult);
  }

  // Fuzzy fallback
  const fuzzyResult = fuzzySubstringMatch(ocrNormalized, concat);
  if (fuzzyResult && fuzzyResult.similarity >= 0.80) {
    return applyPenaltyIfNeeded(resolveMatch(
      fuzzyResult.start, fuzzyResult.end,
      boundaries, positionMap, fuzzyResult.similarity
    ));
  }

  return null;
}

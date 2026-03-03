/**
 * Off-by-one classification helper for golden baseline comparison.
 *
 * Classifies the relationship between an expected citation and an actual citation
 * produced by matchAndCite(). Used in the accuracy harness to distinguish:
 *
 *   - exact:      citation matches golden exactly
 *   - systematic: start and end both off by the same ±1 (line-counting bug pattern)
 *   - boundary:   only start or end off by ±1, not both by same amount (selection boundary ambiguity)
 *   - mismatch:   column mismatch OR any line delta >= ±2
 *
 * Citation formats supported:
 *   - Same-column:  "col:start-end"       e.g. "4:15-20"
 *   - Cross-column: "startCol:startLine-endCol:endLine"  e.g. "3:45-4:5"
 *   - Single-line:  "col:line"            e.g. "4:15"
 */

/**
 * Parse a citation string into its components.
 *
 * @param {string} citation
 * @returns {{ startCol: number, startLine: number, endCol: number, endLine: number } | null}
 */
function parseCitation(citation) {
  if (!citation || typeof citation !== 'string') return null;

  // Cross-column format: "startCol:startLine-endCol:endLine"
  // Distinguish from same-column "col:start-end" by checking if the part after the dash contains a colon.
  const dashIdx = citation.indexOf('-');

  if (dashIdx === -1) {
    // Single-line format: "col:line"
    const parts = citation.split(':');
    if (parts.length !== 2) return null;
    const col = parseInt(parts[0], 10);
    const line = parseInt(parts[1], 10);
    if (isNaN(col) || isNaN(line)) return null;
    return { startCol: col, startLine: line, endCol: col, endLine: line };
  }

  const beforeDash = citation.substring(0, dashIdx);
  const afterDash = citation.substring(dashIdx + 1);

  if (afterDash.includes(':')) {
    // Cross-column: "startCol:startLine-endCol:endLine"
    const startParts = beforeDash.split(':');
    const endParts = afterDash.split(':');
    if (startParts.length !== 2 || endParts.length !== 2) return null;
    const startCol = parseInt(startParts[0], 10);
    const startLine = parseInt(startParts[1], 10);
    const endCol = parseInt(endParts[0], 10);
    const endLine = parseInt(endParts[1], 10);
    if (isNaN(startCol) || isNaN(startLine) || isNaN(endCol) || isNaN(endLine)) return null;
    return { startCol, startLine, endCol, endLine };
  } else {
    // Same-column: "col:start-end"
    const colonIdx = beforeDash.indexOf(':');
    if (colonIdx === -1) return null;
    const col = parseInt(beforeDash.substring(0, colonIdx), 10);
    const startLine = parseInt(beforeDash.substring(colonIdx + 1), 10);
    const endLine = parseInt(afterDash, 10);
    if (isNaN(col) || isNaN(startLine) || isNaN(endLine)) return null;
    return { startCol: col, startLine, endCol: col, endLine };
  }
}

/**
 * Classify the relationship between an expected (golden) and actual citation.
 *
 * @param {string|null} expected - The golden expected citation string.
 * @param {string|null} actual   - The actual citation produced by matchAndCite.
 * @returns {{ tier: string, detail: string|null }}
 */
export function classifyResult(expected, actual) {
  // Handle nulls
  if (expected == null || actual == null) {
    return { tier: 'mismatch', detail: 'null citation' };
  }

  const exp = parseCitation(expected);
  const act = parseCitation(actual);

  if (!exp || !act) {
    return { tier: 'mismatch', detail: 'unparseable' };
  }

  // Columns must match exactly
  if (exp.startCol !== act.startCol || exp.endCol !== act.endCol) {
    return { tier: 'mismatch', detail: 'column mismatch' };
  }

  const deltaStart = act.startLine - exp.startLine;
  const deltaEnd = act.endLine - exp.endLine;

  // Exact match
  if (deltaStart === 0 && deltaEnd === 0) {
    return { tier: 'exact', detail: null };
  }

  // Both deltas within ±1
  if (Math.abs(deltaStart) <= 1 && Math.abs(deltaEnd) <= 1) {
    // Systematic: both off by the same non-zero amount
    if (deltaStart === deltaEnd && deltaStart !== 0) {
      const sign = deltaStart > 0 ? '+' : '';
      return { tier: 'systematic', detail: `delta=${sign}${deltaStart}` };
    }
    // Boundary: one side off, or both off by different ±1 amounts
    const signStart = deltaStart > 0 ? '+' : '';
    const signEnd = deltaEnd > 0 ? '+' : '';
    return {
      tier: 'boundary',
      detail: `delta_start=${signStart}${deltaStart}, delta_end=${signEnd}${deltaEnd}`,
    };
  }

  // Mismatch: at least one delta >= ±2
  return { tier: 'mismatch', detail: `delta_start=${deltaStart}, delta_end=${deltaEnd}` };
}

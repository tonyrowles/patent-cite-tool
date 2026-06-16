/**
 * normalizer.js — Pure logic functions for the patent citation webapp.
 *
 * No DOM, no fetch, no localStorage, no chrome.* APIs.
 * Safe to import in any environment (browser, node, vitest).
 *
 * Exports:
 *   normalizePatentInput  — strip whitespace/commas/hyphens, uppercase, add US prefix (APP-01)
 *   isPublishedApplication — detect A1/A2/A9 kind codes and 20XXXXXXXXX format (APP-02)
 *   formatCitationLong    — "Col. X, ll. Y-Z" / "Col. X, l. Y" / "Col. X, l. Y – Col. X2, l. Z" (FMT-01)
 *   formatCitationShort   — thin wrapper — same-col same-line "X:Y", same-col range "X:Y-Z", cross "X:Y-X2:Z"
 *   applyPrefix           — prepend normalizedPatentId when includePrefix is true (FMT-02)
 */

/**
 * Normalize a raw patent number string.
 *
 * Steps:
 *   1. Strip commas, spaces, and hyphens (any position)
 *   2. Uppercase the result
 *   3. If the result does not already start with "US" (case-insensitively), prepend "US"
 *
 * The full normalized form (including kind code, e.g. US10123456B2) is returned.
 * The Worker strips the kind code server-side; the client guard (isPublishedApplication)
 * needs the kind code present before any network call.
 *
 * @param {string} raw - e.g. "US 10,123,456 B2" or "10123456" or "us-10,123,456-b2"
 * @returns {string} e.g. "US10123456B2" or "US10123456"
 */
export function normalizePatentInput(raw) {
  if (!raw || typeof raw !== 'string') return '';
  // Strip commas, spaces (any Unicode whitespace), hyphens
  const stripped = raw.replace(/[\s,\-]/g, '').toUpperCase();
  // Add US prefix if absent
  if (stripped.startsWith('US')) return stripped;
  return 'US' + stripped;
}

/**
 * Returns true if the raw patent input is a published application number.
 *
 * Must be called BEFORE any cleaning (kind-code suffix is stripped by cleanPatentNumber
 * server-side and the check becomes unreliable after stripping).
 *
 * Detects:
 *   - Kind codes A1, A2, A9 suffix: /[Aa][129]$/
 *   - 11-digit 20XXXXXXXXX format (US-prefixed or bare): strip "US" then /^20\d{9}/
 *
 * True:  US20210123456A1, 20210123456A1, 20210123456, US20210123456, 10617174A1
 * False: US10123456B2, 10123456, US12505414B2, 12505414
 *
 * @param {string} raw - raw patent string (before any normalization)
 * @returns {boolean}
 */
export function isPublishedApplication(raw) {
  if (!raw || typeof raw !== 'string') return false;
  if (/[Aa][129]$/.test(raw)) return true;          // kind codes A1, A2, A9
  const stripped = raw.replace(/^US/i, '');
  return /^20\d{9}/.test(stripped);                 // 11-digit 20XXXXXXXXX format
}

/**
 * Format a long-form citation string from start/end position-map entries.
 *
 * Three-branch contract (mirrors formatCitation's branches but in "Col. X, l. Y" form):
 *   - Same column, same line:  "Col. {col}, l. {line}"
 *   - Same column, line range: "Col. {col}, ll. {startLine}-{endLine}"
 *   - Cross column:            "Col. {sc}, l. {sl} – Col. {ec}, l. {el}"
 *                              (en-dash U+2013, spaces on both sides)
 *
 * @param {{ column: number, lineNumber: number }} startEntry
 * @param {{ column: number, lineNumber: number }} endEntry
 * @returns {string}
 */
export function formatCitationLong(startEntry, endEntry) {
  const sc = startEntry.column;
  const sl = startEntry.lineNumber;
  const ec = endEntry.column;
  const el = endEntry.lineNumber;

  if (sc === ec && sl === el) {
    // Same column, same line
    return `Col. ${sc}, l. ${sl}`;
  } else if (sc === ec) {
    // Same column, different lines
    return `Col. ${sc}, ll. ${sl}-${el}`;
  } else {
    // Cross-column: en-dash (U+2013) with spaces
    return `Col. ${sc}, l. ${sl} – Col. ${ec}, l. ${el}`;
  }
}

/**
 * Format a short-form citation string (thin wrapper mirroring formatCitation in matching.js).
 *
 * Branches:
 *   - Same column, same line:  "{col}:{line}"
 *   - Same column, line range: "{col}:{startLine}-{endLine}"
 *   - Cross column:            "{sc}:{sl}-{ec}:{el}"
 *
 * @param {{ column: number, lineNumber: number }} startEntry
 * @param {{ column: number, lineNumber: number }} endEntry
 * @returns {string}
 */
export function formatCitationShort(startEntry, endEntry) {
  const sc = startEntry.column;
  const sl = startEntry.lineNumber;
  const ec = endEntry.column;
  const el = endEntry.lineNumber;

  if (sc === ec && sl === el) {
    return `${sc}:${sl}`;
  } else if (sc === ec) {
    return `${sc}:${sl}-${el}`;
  } else {
    return `${sc}:${sl}-${ec}:${el}`;
  }
}

/**
 * Optionally prepend the normalized patent ID to a citation string.
 *
 * Used by the webapp render layer (FMT-02 prefix toggle). Pure: no side effects.
 *
 * @param {string} citation - e.g. "Col. 4, ll. 15-22" or "4:15-22"
 * @param {string} normalizedPatentId - e.g. "US10123456B2"
 * @param {boolean} includePrefix - when true, returns "US10123456B2 Col. 4, ll. 15-22"
 * @returns {string}
 */
export function applyPrefix(citation, normalizedPatentId, includePrefix) {
  if (includePrefix) {
    return `${normalizedPatentId} ${citation}`;
  }
  return citation;
}

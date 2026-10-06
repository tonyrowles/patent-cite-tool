// Shared by browser clients, the Worker, and the operator cache tool.
// v6 abandons records created by public browser uploads.
export const CACHE_VERSION = 'v6';
export const MAX_CACHE_BYTES = 8 * 1024 * 1024;
export const CACHE_TTL_SECONDS = 30 * 24 * 60 * 60;

export function validateCachePayload(payload, version = CACHE_VERSION) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  if (payload.version !== version || !Number.isSafeInteger(payload.cachedAt) || payload.cachedAt <= 0) return false;
  if (!Array.isArray(payload.entries) || payload.entries.length === 0 || payload.entries.length > 50000) return false;
  let maxColumn = 0;
  let hasClaims = false;
  let previous = null;
  for (const entry of payload.entries) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
    if (typeof entry.text !== 'string' || !entry.text.trim() || entry.text.length > 4096) return false;
    if (!Number.isSafeInteger(entry.column) || entry.column < 1 || entry.column > 2000) return false;
    if (!Number.isSafeInteger(entry.lineNumber) || entry.lineNumber < 1 || entry.lineNumber > 200) return false;
    if (!Number.isSafeInteger(entry.page) || entry.page < 1 || entry.page > 5000) return false;
    if (!['description', 'claims'].includes(entry.section) || typeof entry.hasWrapHyphen !== 'boolean') return false;
    if (previous && (entry.page < previous.page || entry.column < previous.column ||
      (entry.column === previous.column && entry.lineNumber < previous.lineNumber))) return false;
    maxColumn = Math.max(maxColumn, entry.column);
    hasClaims ||= entry.section === 'claims';
    previous = entry;
  }
  return payload.meta?.totalLines === payload.entries.length &&
    payload.meta?.totalColumns === maxColumn && payload.meta?.hasClaimsSection === hasClaims;
}

export function buildCachePayload(positionMap) {
  const entries = positionMap.map(({ text, column, lineNumber, page, section, hasWrapHyphen }) =>
    ({ text, column, lineNumber, page, section, hasWrapHyphen }));
  return {
    entries,
    meta: {
      totalLines: entries.length,
      totalColumns: entries.reduce((max, entry) => Math.max(max, entry.column), 0),
      hasClaimsSection: entries.some(entry => entry.section === 'claims'),
    },
    cachedAt: Date.now(),
    version: CACHE_VERSION,
  };
}

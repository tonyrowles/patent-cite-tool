/**
 * Pure builder for the options-page ("report a problem") prebuiltContext.
 *
 * Extracted from options.js so it can be unit-tested without a DOM (the project
 * has no jsdom; live page-mode behaviour is covered by UAT). Page mode has no
 * Google Patents DOM, so the live-capture fields (xpathNode, scroll, viewport)
 * are always null. The returnedCitation + confidenceTier are sourced from the
 * last citation the content-script persisted (lastCitationOutcome), but ONLY
 * when that outcome is for the same patent the user last viewed — otherwise they
 * are null rather than stale/mismatched.
 *
 * @param {{ patentId?: string }|null|undefined} patent - chrome.storage.local currentPatent.
 * @param {{ patentId?: string, returnedCitation?: string|null, confidenceTier?: string|null }|null|undefined} lastCitationOutcome
 * @param {string} version - extension version (manifest).
 * @returns {object|null} prebuiltContext, or null when there is no prior patent.
 */
export function buildPrebuiltContext(patent, lastCitationOutcome, version) {
  if (!patent || !patent.patentId) return null;

  // Only trust the cached outcome if it matches the patent currently in context.
  const matched =
    lastCitationOutcome && lastCitationOutcome.patentId === patent.patentId
      ? lastCitationOutcome
      : null;

  return {
    patentNumber: patent.patentId.replace(/^US/, ''),
    selectionText: null,           // D-01: no live selection on options page
    returnedCitation: matched?.returnedCitation ?? null,
    confidenceTier: matched?.confidenceTier ?? null,
    extensionVersion: version,
    xpathNode: null,
    scrollY: null,
    viewportWidth: null,
    viewportHeight: null,
    pdfParseStatus: null,
  };
}

// tests/e2e/lib/observation.js
//
// readCitationPill(page) — reads the data-testid="pct-citation-pill" element
//   inside the citation Shadow DOM. The shadow-open shim makes the closed
//   root readable via host.shadowRoot in Playwright's evaluation context.
//
// readClipboardShim(page) — reads window.__lastCopiedText__ (populated by
//   the clipboard-observer shim on every 'copy' event).
//
// Phase 26's smoke spec does not invoke either function (no selection).
// Phase 27 will exercise both.

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ timeout?: number }} [opts]
 * @returns {Promise<string>} the pill's trimmed textContent
 */
export async function readCitationPill(page, { timeout = 5_000 } = {}) {
  const handle = await page.waitForSelector(
    '[data-testid="pct-citation-pill"]',
    { state: 'attached', timeout },
  );
  return await handle.evaluate((el) => (el.textContent || '').trim());
}

/**
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string>} the most recent copy-event payload, or ''
 */
export async function readClipboardShim(page) {
  return await page.evaluate(() => window.__lastCopiedText__ || '');
}

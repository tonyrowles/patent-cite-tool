// tests/e2e/lib/navigation.js
//
// gotoPatent(page, patentId, opts?) — navigates to a Google Patents page
// and waits for a known DOM marker before returning. For Phase 26's smoke
// we only need a generic readiness probe; Phase 27 may add more specific
// wait conditions per case.

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} patentId  e.g. "US11427642"
 * @param {{ timeout?: number }} [opts]
 * @returns {Promise<import('@playwright/test').Response>}
 */
export async function gotoPatent(page, patentId, { timeout = 30_000 } = {}) {
  if (!patentId || !/^[A-Z]{2}\d+[A-Z]?\d*$/.test(patentId)) {
    throw new Error(`gotoPatent: invalid patentId "${patentId}"`);
  }
  const url = `https://patents.google.com/patent/${patentId}/en`;
  // Track a single deadline so page.goto + waitForSelector share the budget
  // (otherwise total wall-clock could reach 2× timeout and exceed the per-test
  // budget configured in playwright.config.js).
  const deadline = Date.now() + timeout;
  const response = await page.goto(url, {
    waitUntil: 'domcontentloaded',
    timeout,
  });
  if (!response || !response.ok()) {
    const status = response ? response.status() : 'no response';
    throw new Error(`gotoPatent: ${patentId} returned ${status}`);
  }
  // Wait for any of Google Patents' top-level containers to attach.
  // <patent-result> is a Polymer component; <main> / <article> are fallbacks.
  const remaining = Math.max(0, deadline - Date.now());
  await page.waitForSelector('main, article, patent-result', {
    state: 'attached',
    timeout: remaining,
  });
  // Wait for Polymer to hydrate body content. Description paragraphs / claim
  // divs populate AFTER patent-result attaches; without this wait, selectText
  // fires against a hollow DOM and mis-reports DOM_DRIFT.
  const remaining2 = Math.max(1000, deadline - Date.now());
  await page.waitForSelector('div.description-paragraph, div.claim-text', {
    state: 'attached',
    timeout: remaining2,
  });
  return response;
}

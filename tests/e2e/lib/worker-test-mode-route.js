// tests/e2e/lib/worker-test-mode-route.js
//
// Phase 30 Plan 02 — Worker route-interception helper.
//
// Installs a page.route handler on the Cloudflare Worker URL
// (https://pct.tonyrowles.com/**) that injects `X-PCT-Test-Mode: true`
// into every outbound request. Per 30-CONTEXT.md locked decision: the
// extension is not modified; the test infrastructure rewrites the
// request headers via Playwright's CDP routing.
//
// RESEARCH.md Risk A1: page.route may not reach the extension's offscreen
// document context (offscreen runs in an isolated context, not the page
// browsing context). The returned getCallCount() lets the caller assert
// the handler actually fired during the test — turning a silent
// false-positive pass into a loud, diagnosable failure.
//
// Source URL constant: src/offscreen/offscreen.js line 24
//   const WORKER_URL = 'https://pct.tonyrowles.com';

/** @typedef {import('@playwright/test').Page} Page */

const WORKER_URL_PATTERN = 'https://pct.tonyrowles.com/**';

/**
 * Install the X-PCT-Test-Mode header-injection route on the given page.
 *
 * @param {Page} page
 * @returns {Promise<{ getCallCount: () => number }>}
 */
export async function installWorkerTestModeRoute(page) {
  let callCount = 0;

  await page.route(WORKER_URL_PATTERN, async (route) => {
    callCount += 1;
    const existing = route.request().headers();
    await route.continue({
      headers: {
        ...existing,
        'X-PCT-Test-Mode': 'true',
      },
    });
  });

  return {
    getCallCount: () => callCount,
  };
}

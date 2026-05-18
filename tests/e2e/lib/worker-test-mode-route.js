// tests/e2e/lib/worker-test-mode-route.js
//
// Phase 30 Plan 05 — Test-mode hook installer.
//
// CDP-level routing (page.route / context.route) cannot intercept the
// Chrome extension's offscreen-document outbound requests (confirmed in
// Plans 30-02 and 30-04). Instead, this helper sets two chrome.storage.local
// keys that offscreen.js reads at each /cache call site (added in Plan 30-05).
//
// Keys set:
//   - pct_test_cache_version: a per-test nonce that overrides v=CACHE_VERSION → forces cache miss
//   - pct_test_mode: true → offscreen.js adds X-PCT-Test-Mode: true on POST /cache
//
// Production extension never sets these keys; behavior identical to today when absent.

/**
 * Install the test-mode storage hook for a Playwright test.
 *
 * @param {import('@playwright/test').BrowserContext} context
 * @param {string} extensionId  - Chrome extension ID from extension-loader.js
 * @returns {Promise<{nonce: string, cleanup: () => Promise<void>}>}
 */
export async function installWorkerTestModeRoute(context, extensionId) {
  if (!context) throw new Error('installWorkerTestModeRoute: context is required');
  if (!extensionId) throw new Error('installWorkerTestModeRoute: extensionId is required');

  const nonce = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Find the extension service worker
  const serviceWorkers = context.serviceWorkers();
  const extSw = serviceWorkers.find(sw => sw.url().includes(extensionId));
  if (!extSw) {
    throw new Error(`installWorkerTestModeRoute: service worker for extension ${extensionId} not found`);
  }

  // Set the storage keys via the service worker context
  await extSw.evaluate(async ({ nonce }) => {
    await chrome.storage.local.set({
      pct_test_cache_version: nonce,
      pct_test_mode: true,
    });
  }, { nonce });

  return {
    nonce,
    async cleanup() {
      await extSw.evaluate(async () => {
        await chrome.storage.local.remove(['pct_test_cache_version', 'pct_test_mode']);
      });
    },
  };
}

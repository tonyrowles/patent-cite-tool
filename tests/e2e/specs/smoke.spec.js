// tests/e2e/specs/smoke.spec.js
//
// Phase 26 smoke spec. Proves the harness chain works end-to-end:
//   1. Playwright loads the unpacked Chrome extension (HARN-01).
//   2. Service-worker readiness probe completes (HARN-02 path — extensionId
//      is non-empty only if the probe succeeded).
//   3. Navigation to the seed patent succeeds (HARN-01).
//   4. The shadow-open shim is installed and functional (HARN-03 sanity —
//      a closed-mode shadow root created in a probe page.evaluate is
//      readable via host.shadowRoot, which is only possible because the
//      addInitScript override flipped mode to 'open').
//
// The smoke deliberately does NOT trigger a selection. Phase 27 exercises
// selection, the citation pill, and the clipboard shim end-to-end.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { loadExtension } from '../lib/extension-loader.js';
import { gotoPatent } from '../lib/navigation.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(__dirname, '../../../dist/chrome');
const SEED_PATENT = 'US11427642';

test.describe('Phase 26 smoke', () => {
  test('loads extension, navigates seed patent, SW ready, shadow shim functional @smoke', async () => {
    const { page, extensionId, cleanup } = await loadExtension({
      extensionPath: EXTENSION_PATH,
    });
    try {
      // HARN-01 + HARN-02: extensionId is derived from sw.url() AFTER the
      // chrome.runtime.id probe — non-empty means both passed.
      expect(extensionId).toMatch(/^[a-p]{32}$/);

      // HARN-01: navigate to a real Google Patents page; gotoPatent throws
      // on non-2xx or missing readiness markers, so absence-of-throw asserts.
      await gotoPatent(page, SEED_PATENT);

      // HARN-03 sanity: prove the addInitScript shadow-open shim is live.
      // Without the shim, attachShadow({mode:'closed'}) would return a root
      // that is unreadable via host.shadowRoot (null). With the shim,
      // host.shadowRoot is the same root that attachShadow returned.
      const shimOk = await page.evaluate(() => {
        const el = document.createElement('div');
        const sr = el.attachShadow({ mode: 'closed' });
        return sr !== null && el.shadowRoot !== null && el.shadowRoot === sr;
      });
      expect(shimOk).toBe(true);
    } finally {
      await cleanup();
    }
  });
});

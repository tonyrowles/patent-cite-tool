// tests/e2e/lib/extension-loader.js
//
// loadExtension({extensionPath, userDataDir?})
//   -> { context, page, extensionId, cleanup }
//
// Loads the unpacked Chrome extension at extensionPath into a fresh persistent
// context with the two addInitScript shims (shadow-open, clipboard-observer)
// installed BEFORE the first page is created. Waits for the extension's
// service worker to bind chrome.runtime before returning, so callers can
// safely trigger user interactions immediately (HARN-02).
//
// Per HARN-01..04 and CONTEXT.md.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read shim files at module load — fail fast if they are missing.
const SHADOW_OPEN_SHIM = fs.readFileSync(
  path.resolve(__dirname, '../shims/shadow-open.js'),
  'utf8',
);
const CLIPBOARD_OBSERVER_SHIM = fs.readFileSync(
  path.resolve(__dirname, '../shims/clipboard-observer.js'),
  'utf8',
);

/**
 * @param {{ extensionPath: string, userDataDir?: string }} opts
 * @returns {Promise<{ context: import('@playwright/test').BrowserContext,
 *                     page: import('@playwright/test').Page,
 *                     extensionId: string,
 *                     cleanup: () => Promise<void> }>}
 */
export async function loadExtension({ extensionPath, userDataDir } = {}) {
  if (!extensionPath) {
    throw new Error('loadExtension: extensionPath is required');
  }
  if (!fs.existsSync(path.join(extensionPath, 'manifest.json'))) {
    throw new Error(
      `loadExtension: no manifest.json found at ${extensionPath} — did you run \`npm run build:chrome\`?`,
    );
  }

  const dir =
    userDataDir ||
    path.join(os.tmpdir(), `pct-e2e-${crypto.randomUUID()}`);
  fs.mkdirSync(dir, { recursive: true });

  const context = await chromium.launchPersistentContext(dir, {
    channel: 'chromium',
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
    // headless mode for extensions is enabled automatically under
    // channel:'chromium' since Playwright 1.49. Omitting the key entirely
    // yields the new-headless mode required for extension support
    // (per CONTEXT.md, Open Question #1 RESOLVED).
  });

  // Install shims BEFORE any newPage() — addInitScript only fires on new
  // document contexts (microsoft/playwright#22147).
  await context.addInitScript({ content: SHADOW_OPEN_SHIM });
  await context.addInitScript({ content: CLIPBOARD_OBSERVER_SHIM });

  // Grant clipboard permissions defensively for any test that calls the real
  // clipboard API (the __lastCopiedText__ shim is the primary path).
  await context.grantPermissions(
    ['clipboard-read', 'clipboard-write'],
    { origin: 'https://patents.google.com' },
  );

  // Service-worker readiness probe (HARN-02). Two-stage: already-attached or
  // about-to-attach. Then verify chrome.runtime is bound.
  let [sw] = context.serviceWorkers();
  if (!sw) {
    sw = await context.waitForEvent('serviceworker', { timeout: 10_000 });
  }
  await sw.evaluate(() => chrome.runtime.id);
  const extensionId = new URL(sw.url()).host;

  const page = await context.newPage();

  const cleanup = async () => {
    try {
      await context.close();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };

  return { context, page, extensionId, cleanup };
}

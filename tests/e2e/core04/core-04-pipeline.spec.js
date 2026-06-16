/**
 * CORE-04 — Full-pipeline browser integration test.
 *
 * Runs the complete pipeline (PDF bytes → extractTextFromPdf → buildPositionMap
 * → matchAndCite) in a real Chromium page against the relocated src/shared/
 * modules, WITHOUT loading the browser extension.
 *
 * Key assertions:
 *   1. PDF.js spawned a dedicated WebWorker whose URL contains 'pdf.worker.mjs'
 *      (proves PDF parsing ran off the main thread).
 *   2. The pipeline produced the known citation '1:37' for the passage
 *      'of information contained in the dumped memory image' (US6738932-spec-short
 *      ground-truth from tests/golden/baseline.json, confidence 0.98).
 *
 * CI-safe gating:
 *   The test skips (never fails) when:
 *     - SKIP_LIVE_E2E env var is set, OR
 *     - tests/e2e/.pdf-cache/US6738932.pdf is absent
 *   This mirrors the pattern in tests/unit/pdf-snippet.smoke.test.js.
 *
 * Module serving:
 *   page.route() intercepts requests to the synthetic origin http://core04.test/
 *   and fulfills from disk with explicit MIME types (Chromium strict module check).
 *   Served paths: /src/shared/*.js, /src/lib/pdf.mjs, /src/lib/pdf.worker.mjs,
 *   /core04-harness.html (→ tests/e2e/core04/core04-harness.html), /US6738932.pdf.
 *   All other paths → route.abort().
 *
 * Coexistence:
 *   This spec lives in tests/e2e/core04/ (NOT tests/e2e/specs/).
 *   The existing tests/e2e/playwright.config.js has testDir './specs' and
 *   will never auto-discover this file.
 */

import { test, expect, chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Repo root is three levels up: tests/e2e/core04 → tests/e2e → tests → repo root
const REPO_ROOT = path.resolve(__dirname, '../../..');

const PDF_PATH = path.join(REPO_ROOT, 'tests/e2e/.pdf-cache/US6738932.pdf');

// Synthetic origin — all requests here are fulfilled from disk by page.route()
const ORIGIN = 'http://core04.test';

/**
 * Derive the Content-Type for a given filename.
 */
function mimeType(filePath) {
  if (filePath.endsWith('.mjs') || filePath.endsWith('.js')) {
    return 'application/javascript';
  }
  if (filePath.endsWith('.pdf')) {
    return 'application/pdf';
  }
  if (filePath.endsWith('.html')) {
    return 'text/html';
  }
  return 'application/octet-stream';
}

test('CORE-04: full pipeline in browser — PDF.js in worker thread, citation 1:37', async () => {
  // CI-safe gating: skip (not fail) when fixture is absent or SKIP_LIVE_E2E is set
  if (process.env.SKIP_LIVE_E2E || !fs.existsSync(PDF_PATH)) {
    test.skip(
      true,
      process.env.SKIP_LIVE_E2E
        ? 'Skipped: SKIP_LIVE_E2E is set'
        : `Skipped: PDF fixture not found at ${PDF_PATH}`
    );
    return; // unreachable after test.skip, but keeps linters happy
  }

  const browser = await chromium.launch({ headless: true });
  const workerUrls = [];

  try {
    const page = await browser.newPage();

    // Register page.on('worker') BEFORE navigation (Pitfall 5 from RESEARCH.md).
    // PDF.js spawns the worker during getDocument() inside extractTextFromPdf();
    // if the listener is registered after page.goto, the event may already have fired.
    page.on('worker', (w) => workerUrls.push(w.url()));

    // Install the route handler on the synthetic origin.
    // Maps URL paths to repo files and serves with explicit Content-Type.
    // T-07-04: all paths resolve to a fixed set of in-repo locations; anything
    // outside that set is aborted (no traversal outside the repo root).
    await page.route(`${ORIGIN}/**`, async (route) => {
      const url = new URL(route.request().url());
      // Strip leading slash to get a relative path
      const relPath = url.pathname.slice(1); // e.g. "src/shared/pdf-parser.js"

      let diskPath;

      if (relPath === 'core04-harness.html' || relPath === '') {
        // The harness HTML
        diskPath = path.join(REPO_ROOT, 'tests/e2e/core04/core04-harness.html');
      } else if (relPath === 'US6738932.pdf') {
        // The PDF fixture
        diskPath = PDF_PATH;
      } else if (
        relPath.startsWith('src/shared/') ||
        relPath.startsWith('src/lib/')
      ) {
        // Shared core modules and PDF.js runtime assets
        diskPath = path.join(REPO_ROOT, relPath);
      } else {
        // Unknown path — abort (security: no traversal outside allowed set)
        await route.abort();
        return;
      }

      if (!fs.existsSync(diskPath)) {
        await route.abort();
        return;
      }

      const body = fs.readFileSync(diskPath);
      await route.fulfill({
        status: 200,
        contentType: mimeType(diskPath),
        body,
      });
    });

    // Navigate to the harness page
    await page.goto(`${ORIGIN}/core04-harness.html`);

    // Trigger the pipeline (function is defined but not auto-run on load,
    // so the worker listener above was already registered before the pipeline starts)
    await page.evaluate(() => window.__runCore04());

    // Wait for the pipeline to complete (up to 30s)
    await page.waitForFunction(() => window.__core04Result__ !== undefined, {
      timeout: 30_000,
    });

    const result = await page.evaluate(() => window.__core04Result__);

    // --- Assertions ---

    // Pipeline must have produced a non-empty position map
    expect(result.success).toBe(true);

    // Pipeline must return the verified citation (RESEARCH.md, baseline.json)
    expect(result.citation).toBe('1:37');

    // T-07-05: PDF.js must have spawned a dedicated WebWorker (not main-thread
    // fallback). Asserting BOTH a valid citation AND a worker URL ensures that
    // a silent main-thread fallback cannot pass the test.
    expect(workerUrls.some((u) => u.includes('pdf.worker.mjs'))).toBe(true);
  } finally {
    await browser.close();
  }
});

// tests/e2e/lib/artifacts.js
//
// captureScreenshot(page, runId, caseId) — writes a full-page PNG to
//   tests/e2e/artifacts/<runId>/<caseId>-screenshot.png.
// captureDomSnapshot(page, runId, caseId) — writes the full document
//   HTML (including Shadow DOM contents, thanks to the shadow-open shim)
//   to tests/e2e/artifacts/<runId>/<caseId>-dom.html.
//
// Phase 26's smoke spec does not call these on the happy path. Phase 27
// wires them to test failures (DIAG-01, DIAG-02).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARTIFACTS_ROOT = path.resolve(__dirname, '../artifacts');

function ensureRunDir(runId) {
  const dir = path.join(ARTIFACTS_ROOT, runId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} runId
 * @param {string} caseId
 * @returns {Promise<string>} the absolute path written
 */
export async function captureScreenshot(page, runId, caseId) {
  const dir = ensureRunDir(runId);
  const outPath = path.join(dir, `${caseId}-screenshot.png`);
  await page.screenshot({ path: outPath, fullPage: true });
  return outPath;
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} runId
 * @param {string} caseId
 * @returns {Promise<string>} the absolute path written
 */
export async function captureDomSnapshot(page, runId, caseId) {
  const dir = ensureRunDir(runId);
  const outPath = path.join(dir, `${caseId}-dom.html`);
  const html = await page.content();
  fs.writeFileSync(outPath, html, 'utf8');
  return outPath;
}

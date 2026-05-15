/**
 * Live smoke test for tests/e2e/lib/pdf-snippet.js (Plan 28-03, DIAG-03).
 *
 * Renders a real PDF snippet against US11427642 page 1, line 26 (the citation
 * span for the `US11427642-spec-short-1` golden case = "1:26-27"). The test
 * FETCHES from Google Patents on first run (then uses the on-disk cache at
 * tests/e2e/.pdf-cache/US11427642.pdf — gitignored).
 *
 * This is the only smoke test in tests/unit/ that touches the network. It is
 * skipped automatically when `SKIP_LIVE_E2E=1` is set, so unit-test runs in
 * restricted sandboxes (no patents.google.com access) do not fail spuriously.
 *
 * Cleans up the per-test runId directory after each test to keep
 * tests/e2e/artifacts/ uncluttered — these are smoke artifacts, not
 * regression artifacts.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import {
  renderPdfSnippet,
  _clearRenderCache,
  _renderCacheSize,
} from '../e2e/lib/pdf-snippet.js';

const LIVE = !process.env.SKIP_LIVE_E2E;

describe.skipIf(!LIVE)('pdf-snippet live smoke', () => {
  beforeAll(() => {
    _clearRenderCache();
  });

  it('renders US11427642 page 1, line 26 -> PNG > 5KB', async () => {
    const runId = `smoke-${Date.now()}-1`;
    let outPath;
    try {
      outPath = await renderPdfSnippet({
        patentId: 'US11427642',
        page: 1,
        line: 26,
        runId,
        caseId: 'US11427642-spec-short-1',
      });
      expect(fs.existsSync(outPath)).toBe(true);
      const size = fs.statSync(outPath).size;
      // CONTEXT.md / VALIDATION.md 28-03-02: PNG must be > 5KB.
      expect(size).toBeGreaterThan(5_000);
      // Sanity: an image-magick-readable PNG starts with the 8-byte signature
      // 89 50 4E 47 0D 0A 1A 0A. Confirms sharp wrote a real PNG, not a
      // zero-byte file or an error message.
      const head = fs.readFileSync(outPath).subarray(0, 8);
      expect(head[0]).toBe(0x89);
      expect(head[1]).toBe(0x50); // P
      expect(head[2]).toBe(0x4e); // N
      expect(head[3]).toBe(0x47); // G
    } finally {
      // Cleanup smoke artifact dir to avoid littering tests/e2e/artifacts/.
      if (outPath) {
        const smokeRunDir = path.dirname(outPath);
        fs.rmSync(smokeRunDir, { recursive: true, force: true });
      }
    }
  }, 60_000); // 60s timeout — cold cache: HTML fetch + PDF fetch + pdfjs parse + render + sharp crop

  it('cached second call is fast (< 5s)', async () => {
    // First call to warm the renderCache (this also exercises the same patent
    // → cache key collision path that the regression spec will rely on when
    // multiple cases on the same patent disagree on the same page).
    const warmRunId = `smoke-warm-${Date.now()}`;
    const warmPath = await renderPdfSnippet({
      patentId: 'US11427642',
      page: 1,
      line: 26,
      runId: warmRunId,
      caseId: 'US11427642-warm',
    });
    fs.rmSync(path.dirname(warmPath), { recursive: true, force: true });

    expect(_renderCacheSize()).toBeGreaterThanOrEqual(1);

    const runId = `smoke-cached-${Date.now()}`;
    let outPath;
    try {
      const t0 = Date.now();
      outPath = await renderPdfSnippet({
        patentId: 'US11427642',
        page: 1,
        line: 26,
        runId,
        caseId: 'US11427642-cached',
      });
      const elapsed = Date.now() - t0;
      expect(fs.existsSync(outPath)).toBe(true);
      // Cache-hit fast path: no PDF fetch, no pdfjs render. estimateLinePixelY
      // still re-parses textContent for the page (lightweight, ~50-300ms),
      // plus sharp crop (~50ms). 5s is comfortable headroom.
      expect(elapsed).toBeLessThan(5_000);
    } finally {
      if (outPath) {
        fs.rmSync(path.dirname(outPath), { recursive: true, force: true });
      }
    }
  }, 30_000);
});

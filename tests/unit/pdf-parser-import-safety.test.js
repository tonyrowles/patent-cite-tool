/**
 * CORE-02 import-safety smoke test for src/shared/pdf-parser.js
 *
 * Proves that importing pdf-parser.js with no chrome global present:
 *   1. Does NOT throw a ReferenceError or any other error
 *   2. Exposes configurePdfWorker and extractTextFromPdf as functions
 *   3. configurePdfWorker(url) can be called without throwing
 *
 * Design: chrome-stub.js runs for all test:src specs (setupFiles in vitest.config.js).
 * This test explicitly removes the chrome global to simulate a non-extension context.
 *
 * pdf.mjs (the full PDF.js bundle) requires browser-only APIs (DOMMatrix, etc.) and
 * cannot load in a plain Node environment. We mock it here so the import-safety test
 * can verify that pdf-parser.js itself has no module-scope chrome dependency —
 * independent of the PDF.js browser requirement.
 *
 * Globals are restored in afterEach so other specs are unaffected.
 */

import { vi, afterEach, beforeAll, it, expect, describe } from 'vitest';

// Mock pdf.mjs so Node can load pdf-parser.js without browser APIs.
// This isolates the chrome-dependency test from the PDF.js browser requirement.
vi.mock('../../src/lib/pdf.mjs', () => ({
  getDocument: vi.fn(),
  GlobalWorkerOptions: { workerSrc: '' },
}));

describe('pdf-parser import safety (CORE-02)', () => {
  let savedChrome;

  afterEach(() => {
    // Restore chrome global so other specs are unaffected
    if (savedChrome !== undefined) {
      vi.stubGlobal('chrome', savedChrome);
    } else {
      delete globalThis.chrome;
    }
  });

  it('imports without throwing when chrome global is absent', async () => {
    // Save and remove chrome global — simulates plain web page / Node context
    savedChrome = globalThis.chrome;
    vi.unstubAllGlobals();
    delete globalThis.chrome;

    // Dynamic import avoids module-level evaluation at spec parse time.
    // The module must load cleanly with no chrome global present.
    // Use a try/catch to assert no throw, then verify exports.
    let mod;
    let importError;
    try {
      mod = await import('../../src/shared/pdf-parser.js');
    } catch (e) {
      importError = e;
    }

    // Must not have thrown
    expect(importError).toBeUndefined();

    // Both exports must be present and callable
    expect(typeof mod.configurePdfWorker).toBe('function');
    expect(typeof mod.extractTextFromPdf).toBe('function');
  });

  it('configurePdfWorker(url) sets worker source without throwing', async () => {
    // Even with chrome absent, calling configurePdfWorker with a URL must not throw
    // (it only sets GlobalWorkerOptions.workerSrc — no chrome access)
    savedChrome = globalThis.chrome;
    vi.unstubAllGlobals();
    delete globalThis.chrome;

    const mod = await import('../../src/shared/pdf-parser.js');
    expect(() => mod.configurePdfWorker('about:blank')).not.toThrow();
  });
});

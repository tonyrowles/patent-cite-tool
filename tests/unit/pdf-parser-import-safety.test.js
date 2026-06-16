/**
 * CORE-02 import-safety smoke test for src/shared/pdf-parser.js
 *
 * Proves that importing pdf-parser.js with no chrome global present:
 *   1. Does NOT throw a ReferenceError or any other error
 *   2. Exposes configurePdfWorker and extractTextFromPdf as functions
 *   3. configurePdfWorker(url) can be called without throwing
 *
 * Design: chrome-stub.js runs for all test:src specs (setupFiles in vitest.config.js).
 * This test explicitly removes the chrome global to simulate a non-extension context,
 * then dynamically imports the module to verify import-time safety.
 * Globals are restored in afterEach so other specs are unaffected.
 */

import { vi, afterEach, it, expect, describe } from 'vitest';

describe('pdf-parser import safety (CORE-02)', () => {
  let originalChrome;

  afterEach(() => {
    // Restore chrome global so other specs are unaffected
    if (originalChrome !== undefined) {
      vi.stubGlobal('chrome', originalChrome);
    } else {
      // chrome was absent before; remove the stub
      delete globalThis.chrome;
    }
  });

  it('imports without throwing when chrome global is absent', async () => {
    // Save original chrome (set by chrome-stub.js setup file)
    originalChrome = globalThis.chrome;

    // Remove chrome global — simulates plain web page / Node context
    vi.unstubAllGlobals();
    delete globalThis.chrome;

    // Dynamic import avoids module-level evaluation at spec parse time.
    // The module must load cleanly with no chrome global present.
    let mod;
    await expect(async () => {
      mod = await import('../../src/shared/pdf-parser.js');
    }).not.toThrow();

    // Both exports must be present and callable
    expect(typeof mod.configurePdfWorker).toBe('function');
    expect(typeof mod.extractTextFromPdf).toBe('function');
  });

  it('configurePdfWorker(url) sets worker source without throwing', async () => {
    // Even with chrome absent, calling configurePdfWorker with a URL must not throw
    // (it only sets GlobalWorkerOptions.workerSrc — no chrome access)
    originalChrome = globalThis.chrome;
    vi.unstubAllGlobals();
    delete globalThis.chrome;

    const mod = await import('../../src/shared/pdf-parser.js');

    expect(() => mod.configurePdfWorker('about:blank')).not.toThrow();
  });
});

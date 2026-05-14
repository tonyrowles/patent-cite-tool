// tests/e2e/playwright.config.js
//
// Test-runner config for Phase 26. Browser launch and extension loading are
// handled by tests/e2e/lib/extension-loader.js (each spec calls
// loadExtension() directly because persistent-context + unpacked extension
// is incompatible with Playwright's default browser fixture).
//
// No retries locally; Phase 29 will tune for CI.

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './specs',
  timeout: 60_000,             // per-test; Google Patents first-load can be slow
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,                  // persistent context for extension -> serial
  retries: 0,                  // Phase 29 may tune CI
  reporter: 'list',
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});

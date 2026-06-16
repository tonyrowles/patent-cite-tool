// tests/e2e/core04/playwright.config.core04.js
//
// Dedicated Playwright config for the CORE-04 full-pipeline browser integration
// test. This config is intentionally isolated from tests/e2e/playwright.config.js:
//
//   - testDir: '.' scopes discovery to this directory only (NOT ./specs)
//   - No extension loading — chromium.launch() in the spec (non-extension context)
//   - Separate npm script: test:core04
//
// This ensures CORE-04 never interferes with the extension Playwright suite,
// and vice versa (A5 COEXISTENCE from RESEARCH.md).

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  timeout: 60_000,              // per-test — PDF parse in Chromium can be slow
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});

// tests/e2e/playwright.config.js
//
// Test-runner config for Phase 26. Browser launch and extension loading are
// handled by tests/e2e/lib/extension-loader.js (each spec calls
// loadExtension() directly because persistent-context + unpacked extension
// is incompatible with Playwright's default browser fixture).
//
// CI retries: 1 (Phase 29 tuning — reduces flake noise; real failures still
// show up because retried-success is reported as 'flaky' not 'passed', and
// retried-failure is reported as 'failed' to the harness which classifies
// it via the RPT-02 taxonomy). Local: 0 retries to fail fast.

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './specs',
  timeout: 90_000,             // per-test; Google Patents first-load + PDF parse can be slow
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,                  // persistent context for extension -> serial
  retries: process.env.CI ? 1 : 0,   // Phase 29 CRON-03: 1 retry in CI to reduce flake noise
  reporter: 'list',
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});

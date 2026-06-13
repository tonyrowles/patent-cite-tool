// worker/vitest.config.js
//
// Phase 30 Plan 01 — @cloudflare/vitest-pool-workers config for the
// Worker integration test that proves INJ-01 (X-PCT-Test-Mode header
// suppresses KV writes).
//
// Pattern: cloudflareTest() Vite plugin (v0.13.0+ API; defineWorkersConfig
// was the v3-era API and is removed). Source:
// https://developers.cloudflare.com/workers/testing/vitest-integration/get-started/
//
// PROXY_TOKEN and USPTO_API_KEY are injected via miniflare.bindings so
// the test request's `Authorization: Bearer test-token` matches what
// the Worker validates against env.PROXY_TOKEN (per 30-RESEARCH.md Pitfall 2).

import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.toml' },
      miniflare: {
        bindings: {
          PROXY_TOKEN: 'test-token',
          USPTO_API_KEY: 'test-api-key',
          // DISCORD_WEBHOOK_URL: so Discord fetch path is testable without hitting a real webhook
          // BUG_REPORTS KV namespace is wired automatically from wrangler.toml configPath
          DISCORD_WEBHOOK_URL: 'https://discord.example.com/test-webhook',
        },
      },
    }),
  ],
});

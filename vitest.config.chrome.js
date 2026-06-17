import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  // Phase 6 SEC-02: report-transport-chrome.test.js imports src/shared/report-transport.js,
  // which references the build-time global __PROXY_TOKEN__. The raw vitest transform has no
  // esbuild define step, so define a dummy token here (mirrors root vitest.config.js). Never
  // the production value.
  define: {
    __PROXY_TOKEN__: JSON.stringify('test-proxy-token'),
  },
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup/chrome-stub.js'],
    include: [
      'tests/unit/text-matcher.test.js',
      'tests/unit/shared-matching.test.js',
      'tests/unit/report-transport-chrome.test.js',
    ],
    name: 'chrome-dist',
  },
  resolve: {
    alias: [
      {
        find: /.*src\/shared\/matching\.js/,
        replacement: resolve('./dist/chrome/matching-exports.js'),
      },
    ],
  },
});

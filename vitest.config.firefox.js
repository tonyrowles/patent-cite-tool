import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup/chrome-stub.js'],
    include: [
      'tests/unit/text-matcher.test.js',
      'tests/unit/shared-matching.test.js',
    ],
    name: 'firefox-dist',
  },
  resolve: {
    alias: [
      {
        find: /.*src\/shared\/matching\.js/,
        replacement: resolve('./dist/firefox/matching-exports.js'),
      },
    ],
  },
});

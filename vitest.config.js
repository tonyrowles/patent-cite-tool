import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Phase 6 SEC-02: source files reference the build-time global `__PROXY_TOKEN__`
  // (esbuild `define` substitutes the real token at bundle time — see scripts/build.js).
  // The raw vitest transform has no esbuild define step, so importing those source
  // modules (e.g. src/shared/report-transport.js) would throw
  // `ReferenceError: __PROXY_TOKEN__ is not defined`. Define a dummy token here so the
  // unbundled modules load under test. Never the production value.
  define: {
    __PROXY_TOKEN__: JSON.stringify('test-proxy-token'),
  },
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup/chrome-stub.js'],
    include: ['tests/**/*.test.js'],
    // Phase 49 CI-stabilization: lint-guard test files mutate files in the
    // `npm run lint` scope. With fileParallelism, a violation-test in file A
    // can mutate its target while a sanity-test in file B spawns `npm run lint`
    // — lint sees the in-flight violation and exits 1, failing B's sanity
    // assertion. The race is deterministic on push-trigger CI but happens to
    // miss on pull_request-trigger CI's worker scheduling. Serializing files
    // eliminates the cross-file race; within-file tests still run in order.
    fileParallelism: false,
  },
});

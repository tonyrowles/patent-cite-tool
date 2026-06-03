import { defineConfig } from 'vitest/config';

export default defineConfig({
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

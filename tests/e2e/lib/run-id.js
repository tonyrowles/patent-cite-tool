// tests/e2e/lib/run-id.js
//
// resolveRunId() — returns a filesystem-safe identifier used to key the
// per-suite artifact directory. Phase 29's GitHub Actions workflow will set
// PLAYWRIGHT_RUN_ID=$GITHUB_RUN_ID so cron uploads can correlate artifacts
// with the workflow run. Local dev gets an ISO timestamp.
//
// Resolved ONCE at spec-module load (top-level `const RUN_ID = resolveRunId()`)
// so every test in the same `playwright test` invocation writes under the
// same directory.

/**
 * @returns {string} e.g. "2026-05-14T19-23-43Z" or "$GITHUB_RUN_ID"
 */
export function resolveRunId() {
  if (process.env.PLAYWRIGHT_RUN_ID) return process.env.PLAYWRIGHT_RUN_ID;
  // ISO with safe filesystem chars: 2026-05-14T19-23-43Z
  return new Date().toISOString().replace(/[:.]/g, '-').replace(/-\d+Z$/, 'Z');
}

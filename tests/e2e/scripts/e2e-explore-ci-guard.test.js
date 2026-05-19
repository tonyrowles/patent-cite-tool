// tests/e2e/scripts/e2e-explore-ci-guard.test.js
//
// Phase 31 (LLM-07) — integration test for the CI guard at the top of
// scripts/e2e-explore.mjs. The script MUST refuse to run when either
// process.env.CI or process.env.GITHUB_ACTIONS is truthy (defense in
// depth — a runner that sets only one of these still trips the check).
//
// Tests spawn the real script with spawnSync (synchronous, hermetic, no
// real claude invocation because the CI guard fires before checkClaudeCli).
//
// Coverage:
//   1. CI=true → exit 1 + stderr contains 'exploratory mode is local-only'
//   2. GITHUB_ACTIONS=true → same behavior (defense-in-depth)
//   3. CI='' (empty) → CI guard does NOT fire; script proceeds past guard
//      (may exit for other reasons — claude missing, ledger, etc.)

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = path.resolve(__dirname, '../../../scripts/e2e-explore.mjs');

describe('scripts/e2e-explore.mjs — Phase 31 (LLM-07) CI guard', () => {
  it('Test 1: CI=true → exits 1 with "exploratory mode is local-only" in stderr', () => {
    const r = spawnSync('node', [SCRIPT_PATH, '--iterations', '1'], {
      env: { CI: 'true', PATH: process.env.PATH },
      encoding: 'utf8',
      timeout: 5000,
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('exploratory mode is local-only');
  });

  it('Test 2: GITHUB_ACTIONS=true (no CI var) → exits 1 with same stderr (defense-in-depth)', () => {
    const r = spawnSync('node', [SCRIPT_PATH], {
      env: { GITHUB_ACTIONS: 'true', PATH: process.env.PATH },
      encoding: 'utf8',
      timeout: 5000,
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('exploratory mode is local-only');
  });

  it('Test 3: CI explicitly empty (local-dev simulation) → CI guard does NOT fire', () => {
    // We cannot reliably proceed past `which claude` in this test, but we
    // CAN assert the CI guard did not block. The script may exit for other
    // reasons (claude missing, ledger cap, etc.) — that's acceptable; the
    // assertion is that the CI-guard stderr line is NOT present.
    const r = spawnSync('node', [SCRIPT_PATH, '--iterations', '1'], {
      env: { ...process.env, CI: '', GITHUB_ACTIONS: '' },
      encoding: 'utf8',
      timeout: 3000,
    });
    // If the spawn timed out, status is null — that's a PASS (the script
    // proceeded past the guard; it's blocked on something downstream).
    if (r.status !== null) {
      // Whatever the exit code, the CI-guard message must NOT appear.
      expect(r.stderr || '').not.toContain('exploratory mode is local-only');
    }
  });
});

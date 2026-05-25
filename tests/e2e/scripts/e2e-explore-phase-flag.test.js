// tests/e2e/scripts/e2e-explore-phase-flag.test.js
//
// Phase 32 Plan 32-01 (Wave 0 scaffolding, UAT-01) — integration test for the
// --phase flag that scripts/e2e-explore.mjs MUST accept after Plan 32-03 ships.
// These tests are RED in Wave 0 by design: parseArgs in e2e-explore.mjs does
// not yet recognise --phase, so all four test blocks fail until Wave 2
// Plan 32-03 wires the flag through parseArgs. The Wave 0 commit contract is
// "tests run, do not crash, and assert the EXACT contract Plan 32-03 must
// satisfy" — Plan 32-03 makes them GREEN with zero further test changes.
//
// Why this file mirrors tests/e2e/scripts/e2e-explore-ci-guard.test.js:
//   - Same spawnSync invocation shape (synchronous, hermetic, controlled env)
//   - Same SCRIPT_PATH resolution via path.resolve(__dirname, '../../../...')
//   - Same env-wipe pattern from CI-guard Test 3 (lines 51-55) to bypass the
//     CI guard at e2e-explore.mjs:72 so parseArgs can be exercised in isolation
//
// Tests:
//   1. --phase v32             → exit 2 + stderr names the bad arg "v32"
//   2. --phase=32 (equals)     → exit 2 + stderr signals equals syntax unsupported (Pitfall 2)
//   3. --phase (missing value) → exit 2 + stderr signals missing value
//   4. --phase 32 (valid)      → exit code is NOT 2 (parseArgs accepted; may
//                                exit 3 if `claude` CLI absent — that's fine,
//                                the assertion is exit !== 2)
//
// Strict-regex value validation per RESEARCH (^\d+$). Plan 32-03 enforces;
// this test asserts.

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = path.resolve(__dirname, '../../../scripts/e2e-explore.mjs');

// Shared env that wipes CI/GITHUB_ACTIONS so the CI guard at
// scripts/e2e-explore.mjs line 72 does not short-circuit parseArgs.
// Mirrors e2e-explore-ci-guard.test.js Test 3 (lines 51-55).
function spawnExplore(args) {
  // spawn-timeout (3000ms) is intentionally below vitest's default test
  // timeout (5000ms) — otherwise the test-4 "accepts --phase 32" case
  // (which spawnSync expects to time out, status===null) races vitest's
  // timer and falsely fails as "Test timed out". Mirrors the 3000ms used
  // in tests/e2e/scripts/e2e-explore-ci-guard.test.js Test 3 (line 54).
  // [Rule 1 - Bug] fix for Plan 32-01 Wave 0 scaffolding race condition.
  return spawnSync('node', [SCRIPT_PATH, ...args], {
    env: { ...process.env, CI: '', GITHUB_ACTIONS: '' },
    encoding: 'utf8',
    timeout: 3000,
  });
}

describe('--phase flag (Phase 32)', () => {
  it('rejects --phase v32 (non-numeric) with exit 2 and stderr naming the bad value', () => {
    const r = spawnExplore(['--phase', 'v32']);
    expect(r.status).toBe(2);
    // stderr must reference the rejected value 'v32' so the operator can
    // diagnose the typo. The exact phrase 'invalid --phase value' (or
    // similar) is part of Plan 32-03's contract.
    expect(r.stderr || '').toMatch(/v32/);
    expect(r.stderr || '').toMatch(/invalid --phase value/i);
  });

  it('rejects --phase=32 (equals syntax) with exit 2 and stderr signalling equals syntax unsupported', () => {
    const r = spawnExplore(['--phase=32']);
    expect(r.status).toBe(2);
    // Per RESEARCH Pitfall 2 — Plan 32-03 must explicitly reject equals
    // syntax rather than silently accept it as an unknown flag.
    expect(r.stderr || '').toMatch(/equals/i);
  });

  it('rejects --phase with no value (trailing flag) with exit 2 and stderr signalling missing value', () => {
    const r = spawnExplore(['--phase']);
    expect(r.status).toBe(2);
    expect(r.stderr || '').toMatch(/missing value/i);
  });

  it('accepts --phase 32 (proceeds past parseArgs — exit code is NOT 2)', () => {
    const r = spawnExplore(['--phase', '32', '--iterations', '1']);
    // The script may exit 3 (claude CLI absent on this machine), exit 0,
    // exit 4 (ledger cap), exit 5 (fatal main()), or time out (status === null).
    // The contract for THIS test is: exit code is not 2 — i.e. parseArgs
    // accepted '32' as a valid --phase value (Plan 32-03 enforces ^\d+$).
    if (r.status !== null) {
      expect(r.status).not.toBe(2);
    }
    // Spawn timed out → status === null → script proceeded past parseArgs
    // and got stuck on something downstream. That is also a PASS.
  });
});

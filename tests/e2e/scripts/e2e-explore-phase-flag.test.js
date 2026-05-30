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
//
// Plan 32-03 Task 2 — adds cap-behavior integration coverage:
//   5. pre-flight: seeded ledger with phase-32 sum >= $10 + --phase 32 →
//                  spawnSync via E2E_LEDGER_PATH_OVERRIDE → exit 6 +
//                  stderr matches abort message ("Phase 32 LLM spend" +
//                  "Refusing to invoke"). Restores VALIDATION.md UAT-02(b)
//                  integration coverage per plan-checker B3 fix.
//   6. back-compat: empty seeded ledger + no --phase flag → exit code is
//                   NOT 6 + stderr does NOT contain "Phase N LLM spend"
//                   (proves phase enforcement is gated on the flag, D-14).
//
// Tests 5 + 6 use the TEST-ONLY E2E_LEDGER_PATH_OVERRIDE env hook from
// Plan 32-02 to redirect LEDGER_PATH at module-load time to a throwaway
// tmp file — the real per-repo ledger is never touched.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = path.resolve(__dirname, '../../../scripts/e2e-explore.mjs');

// Test 5 expects the script to reach the pre-flight phase-cap check at exit 6,
// but `checkClaudeCli()` runs BEFORE the cap check at scripts/e2e-explore.mjs:567,
// and exits 3 when the `claude` binary is absent from PATH. On GitHub Actions
// runners the CLI is not installed, so the test would receive exit 3 instead of
// exit 6 — masking the cap-gate. Detect CLI presence once and skip Test 5 when
// absent; the contract is still verified by Test 5 on developer machines where
// `claude` is on PATH.
const CLAUDE_AVAILABLE = (() => {
  try {
    const r = spawnSync('claude', ['--version'], { stdio: 'ignore' });
    return r.status === 0;
  } catch {
    return false;
  }
})();

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

    // WR-07 (Phase 32 review): the original assertions above are too lenient
    // — a future regression where parseArgs incorrectly rejected --phase 32
    // with a DIFFERENT exit code (e.g. a refactor that introduces a strict
    // exit 5 path) would still pass `status !== 2`. Strengthen by asserting
    // stderr does NOT contain any of the parseArgs rejection signatures
    // tested in the three negative tests above — that proves the value was
    // ACCEPTED, not rejected via some other route.
    const stderrText = r.stderr || '';
    expect(stderrText).not.toMatch(/invalid --phase value/i);
    expect(stderrText).not.toMatch(/missing value for --phase/i);
    expect(stderrText).not.toMatch(/equals syntax not supported for --phase/i);
  });
});

// ---------------------------------------------------------------------------
// Phase 32 Plan 32-03 Task 2 — cap-behavior integration tests (Test 5 + 6).
//
// These tests exercise the FULL pre-flight cap path end-to-end via spawnSync
// against the real script, with a seeded throwaway ledger redirected through
// the TEST-ONLY E2E_LEDGER_PATH_OVERRIDE env hook that Plan 32-02 introduced
// in tests/e2e/lib/llm-ledger.js. This restores the VALIDATION.md UAT-02(b)
// integration coverage that plan-checker BLOCKER B3 flagged as missing.
//
// Both tests are ENABLED (no .skip) per checker B3 fix.
// ---------------------------------------------------------------------------

describe('Phase 32 cap integration (D-15 pre-flight, D-14 back-compat)', () => {
  let tmpDir;
  let tmpLedgerPath;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pct-phase-cap-integration-'));
    tmpLedgerPath = path.join(tmpDir, 'ledger.json');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function spawnWithLedger(args) {
    return spawnSync('node', [SCRIPT_PATH, ...args], {
      // Clear CI/GITHUB_ACTIONS so the CI guard does not short-circuit; set
      // E2E_LEDGER_PATH_OVERRIDE so the script's LEDGER_PATH resolves at
      // module-load time to our seeded tmp file. cwd preserved so the
      // script's relative imports resolve from the project root.
      env: {
        ...process.env,
        CI: '',
        GITHUB_ACTIONS: '',
        E2E_LEDGER_PATH_OVERRIDE: tmpLedgerPath,
      },
      cwd: process.cwd(),
      encoding: 'utf8',
      timeout: 4000,
    });
  }

  it.skipIf(!CLAUDE_AVAILABLE)('Test 5: pre-flight phase cap blocks startup when ledger phase-32 sum >= $10 (D-15)', () => {
    // Seed a ledger with two phase-32 iterations of $6 each → sum $12 ≥ $10.
    // Ledger shape MUST match the appendLedgerEntry write shape so readLedger
    // returns a parseable object and phaseTotal iterates iterations[].
    const seeded = {
      version: 1,
      months: {
        '2026-05': {
          invocations: 2,
          total_usd: 12,
          last_invocation_iso: '2026-05-01T00:01:00.000Z',
          iterations: [
            {
              iso: '2026-05-01T00:00:00.000Z',
              model: 'claude-sonnet-4-5',
              cost_usd: 6,
              iteration_n: 1,
              run_id: 'seed-1',
              phase: '32',
            },
            {
              iso: '2026-05-01T00:01:00.000Z',
              model: 'claude-sonnet-4-5',
              cost_usd: 6,
              iteration_n: 2,
              run_id: 'seed-2',
              phase: '32',
            },
          ],
        },
      },
    };
    fs.writeFileSync(tmpLedgerPath, JSON.stringify(seeded, null, 2));

    const r = spawnWithLedger(['--phase', '32', '--iterations', '1']);

    // Pre-flight cap MUST fire BEFORE any iteration runs → exit code 6 from
    // the new process.exit(6) site in main(). status===null (spawn timeout)
    // would mean the gate failed to fire and the script kept running, which
    // is the exact failure mode D-15 exists to prevent.
    expect(r.status).toBe(6);
    // The abort message from checkPhaseSpendCap (Plan 32-02) is:
    //   "Phase 32 LLM spend $12.00 >= $10.00. Refusing to invoke claude -p…"
    // Assert both load-bearing phrases.
    expect(r.stderr || '').toMatch(/Phase 32 LLM spend/);
    expect(r.stderr || '').toMatch(/Refusing to invoke/);
  });

  it('Test 6: --phase flag absent → no phase enforcement (back-compat, D-14)', () => {
    // Seed an EMPTY ledger so neither the phase-cap nor the monthly-cap can
    // fire on the seed data. Without --phase, the script must behave exactly
    // as in Phase 31 — i.e. it must NOT print a phase-cap message and must
    // NOT exit with code 6 regardless of how it terminates.
    fs.writeFileSync(
      tmpLedgerPath,
      JSON.stringify({ version: 1, months: {} }, null, 2),
    );

    const r = spawnWithLedger(['--iterations', '1']);

    // The script may exit 0 (improbable in this hermetic test), 3 (claude
    // CLI quirks), 5 (fatal in main()), or time out (status === null) when
    // it gets stuck on actual harness work. Whatever it does, exit code MUST
    // NOT be 6 (that would mean phase enforcement leaked into the back-compat
    // path).
    if (r.status !== null) {
      expect(r.status).not.toBe(6);
    }
    // The checkPhaseSpendCap block-message signature ('Phase <N> LLM spend')
    // MUST NOT appear in stderr — that would prove the phase-cap path ran
    // when no --phase flag was supplied.
    expect(r.stderr || '').not.toMatch(/Phase \d+ LLM spend/);
  });
});

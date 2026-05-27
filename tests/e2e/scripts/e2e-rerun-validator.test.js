// tests/e2e/scripts/e2e-rerun-validator.test.js
//
// Phase 33 Plan 33-04 (RERUN-01) — spawnSync integration tests for the
// scripts/e2e-rerun-validator.mjs CLI shim.
//
// These tests cover:
//   1. --input= (equals syntax) → exit 2 + stderr signaling unsupported syntax
//   2. --input (trailing flag, missing value) → exit 2 + stderr signaling missing value
//   3. --input <missing-file> → exit 1 + stderr naming the path
//   4. --input <valid-file> → stderr does NOT contain rejection signatures (WR-07)
//   5. UAT fixture end-to-end smoke → exit 0 + 10 NOT_REPLAYABLE entries (Pitfall 6)
//
// Test 4 mirrors the WR-07 stderr-absence pattern from
// tests/e2e/scripts/e2e-explore-phase-flag.test.js lines 113-117.
//
// no-flag default-by-mtime behavior: not exercised here because the CLI's
// ARTIFACTS_ROOT is hard-coded relative to __dirname, so seeding a tmp dir
// would require PATH manipulation. Document the skip:
//   "no-flag default exercised manually via `npm run e2e:rerun-validator`
//    after committing real artifacts under tests/e2e/artifacts/."

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = path.resolve(__dirname, '../../../scripts/e2e-rerun-validator.mjs');

/**
 * Spawn the CLI with the given args.
 * 3000ms timeout is intentionally below vitest's default 5000ms timer —
 * avoids "Test timed out" races when the script reaches a blocking path
 * post-parseArgs. Mirrors the pattern from e2e-explore-phase-flag.test.js.
 */
function spawnValidator(args, env = {}) {
  return spawnSync('node', [SCRIPT_PATH, ...args], {
    env: { ...process.env, ...env },
    encoding: 'utf8',
    timeout: 3000,
  });
}

// ---------------------------------------------------------------------------
// Negative-case tests: --input flag validation
// ---------------------------------------------------------------------------

describe('--input flag (Phase 33 RERUN-01)', () => {
  it('rejects --input= (equals syntax) with exit 2 and stderr signaling equals syntax unsupported', () => {
    const r = spawnValidator(['--input=/tmp/foo.json']);
    expect(r.status).toBe(2);
    expect(r.stderr || '').toMatch(/equals/i);
  });

  it('rejects --input with no value (trailing flag) with exit 2 and stderr signaling missing value', () => {
    const r = spawnValidator(['--input']);
    expect(r.status).toBe(2);
    expect(r.stderr || '').toMatch(/missing value/i);
  });

  it('exits 1 when --input file does not exist (with stderr naming the missing path)', () => {
    const missingPath = '/tmp/does-not-exist-' + Date.now() + '.json';
    const r = spawnValidator(['--input', missingPath]);
    expect(r.status).toBe(1);
    expect(r.stderr || '').toMatch(/not found|missing|no.*llm-report/i);
  });
});

// ---------------------------------------------------------------------------
// Positive-case: stderr-absence on valid --input (WR-07 pattern)
// ---------------------------------------------------------------------------

describe('Phase 33 valid input (WR-07 stderr-absence)', () => {
  let tmpDir;
  let inputPath;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pct-rerun-valid-'));
    // Copy the committed UAT fixture into a tmp dir so the validator writes
    // rerun-report.json next to it (D-11) without polluting committed fixtures.
    const fixtureSrc = path.resolve(__dirname, '../fixtures/uat-phase32-llm-report.json');
    inputPath = path.join(tmpDir, 'llm-report.json');
    fs.copyFileSync(fixtureSrc, inputPath);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('accepts valid --input value without emitting equals/missing-value rejection signatures', () => {
    const r = spawnValidator(['--input', inputPath]);
    // Do NOT assert exit code here — verified in the smoke test below.
    // Strengthen with stderr-absence: a future regression that rejected the
    // valid input with a different exit code would still pass `status !== 2`.
    // Asserting stderr does NOT contain rejection signatures proves the value
    // was ACCEPTED, not silently rerouted (WR-07).
    const stderrText = r.stderr || '';
    expect(stderrText).not.toMatch(/equals syntax not supported for --input/i);
    expect(stderrText).not.toMatch(/missing value for --input/i);
  });
});

// ---------------------------------------------------------------------------
// End-to-end smoke: UAT fixture (Pitfall 6 — all NOT_REPLAYABLE)
// ---------------------------------------------------------------------------

describe('Phase 33 end-to-end smoke (Pitfall 6)', () => {
  let tmpDir;
  let inputPath;
  let outputPath;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pct-rerun-e2e-'));
    // Copy the committed UAT fixture into a fresh tmp run dir.
    // Validator writes rerun-report.json next to the input (D-11).
    // Using a tmp copy keeps the real fixtures dir clean.
    const fixtureSrc = path.resolve(__dirname, '../fixtures/uat-phase32-llm-report.json');
    inputPath = path.join(tmpDir, 'llm-report.json');
    outputPath = path.join(tmpDir, 'rerun-report.json');
    fs.copyFileSync(fixtureSrc, inputPath);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('UAT fixture smoke — 10 NOT_REPLAYABLE entries (D-02 + Pitfall 6)', () => {
    const r = spawnValidator(['--input', inputPath]);
    expect(r.status).toBe(0);

    const out = JSON.parse(fs.readFileSync(outputPath, 'utf8'));

    // D-09 top-level shape
    expect(out.schema_version).toBe(1);

    // D-02: all 10 iterations are NOT_REPLAYABLE (LLM_API_ERROR / HARNESS_ERROR)
    expect(out.replays).toHaveLength(10);
    for (const replay of out.replays) {
      expect(replay.verdict).toBe('NOT_REPLAYABLE');
      expect(replay.total_runs).toBe(0);
      expect(typeof replay.reason).toBe('string');
    }

    // D-09 summary
    expect(out.summary.not_replayable_count).toBe(10);
    expect(out.summary.confirmed_count).toBe(0);
    expect(out.summary.flake_count).toBe(0);
  });
});

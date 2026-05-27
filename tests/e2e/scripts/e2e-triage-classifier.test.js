// tests/e2e/scripts/e2e-triage-classifier.test.js
//
// Phase 34 (TRIAGE-04 — D-15) — integration tests for the CLI shim.
// Mirrors tests/e2e/scripts/e2e-rerun-validator.test.js structure + adds
// one NEW test case for the sibling rerun-report.json auto-discovery path.
//
// These tests cover:
//   1. --input= (equals syntax) → exit 2 + stderr signaling equals syntax unsupported
//   2. --input (trailing flag, missing value) → exit 2 + stderr signaling missing value
//   3. --input <missing-file> → exit 1 + stderr naming the path
//   4. Sibling rerun-report.json missing → exit 1 + stderr naming sibling path (D-15 NEW)
//   5. --help → exit 0 + stdout usage text
//
// CI env var is cleared in all spawnTriage calls so the CI guard does NOT fire
// during these argument-parsing tests.

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = path.resolve(__dirname, '../../../scripts/e2e-triage-classifier.mjs');
const PROJECT_ROOT = path.resolve(__dirname, '../../..');

/**
 * Spawn the triage CLI with the given args.
 * CI and GITHUB_ACTIONS are cleared so the CI guard does NOT fire during
 * argument-parsing and file-resolution tests.
 */
function spawnTriage(args, env = {}) {
  return spawnSync('node', [SCRIPT_PATH, ...args], {
    env: { ...process.env, CI: '', GITHUB_ACTIONS: '', ...env },
    encoding: 'utf8',
    timeout: 5000,
    cwd: PROJECT_ROOT,
  });
}

describe('--input flag (TRIAGE-04 / D-15)', () => {
  it('rejects --input= (equals syntax) with exit 2', () => {
    const r = spawnTriage(['--input=/tmp/foo.json']);
    expect(r.status).toBe(2);
    expect(r.stderr || '').toMatch(/equals syntax not supported/i);
  });

  it('rejects --input with no value with exit 2', () => {
    const r = spawnTriage(['--input']);
    expect(r.status).toBe(2);
    expect(r.stderr || '').toMatch(/missing value/i);
  });

  it('exits 1 when --input file does not exist', () => {
    // WR-05: input path must be under tests/e2e/artifacts/ or tests/e2e/fixtures/.
    // Use a non-existent path inside ARTIFACTS_ROOT so the test exercises the
    // 'input not found' branch (NOT the path-prefix-rejection branch).
    const fakePath = path.join(
      PROJECT_ROOT, 'tests/e2e/artifacts/definitely-does-not-exist-pct-test/llm-report.json',
    );
    const r = spawnTriage(['--input', fakePath]);
    expect(r.status).toBe(1);
    expect(r.stderr || '').toMatch(/input not found/i);
  });

  it('exits 1 when --input lies outside artifacts/ or fixtures/ (WR-05 path-bound)', () => {
    // WR-05 NEW: --input must reside under tests/e2e/artifacts/ or
    // tests/e2e/fixtures/. A path outside both roots (here: /tmp) must be
    // rejected with exit 1 and a stderr message naming the allowed roots
    // — BEFORE any filesystem reads or sibling-discovery happens.
    const r = spawnTriage(['--input', '/tmp/some-llm-report.json']);
    expect(r.status).toBe(1);
    expect(r.stderr || '').toMatch(/must reside under tests\/e2e\/artifacts.*fixtures/i);
  });

  it('exits 1 when sibling rerun-report.json missing (D-15 sibling-discovery contract)', () => {
    // Stage a valid llm-report.json but NOT a sibling rerun-report.json.
    // The CLI must detect the missing sibling and exit 1 with the appropriate message.
    // Expected stderr: "sibling rerun-report.json not found: <path>"
    //
    // WR-05: staging must happen INSIDE tests/e2e/artifacts/ (one of the
    // allowed input roots). Use a uniquely-named subdirectory under artifacts/
    // and clean it up in finally.
    const artifactsRoot = path.resolve(PROJECT_ROOT, 'tests/e2e/artifacts');
    fs.mkdirSync(artifactsRoot, { recursive: true });
    const tmpDir = fs.mkdtempSync(path.join(artifactsRoot, 'pct-triage-cli-test-'));
    try {
      const llmReportPath = path.join(tmpDir, 'llm-report.json');
      fs.writeFileSync(llmReportPath, JSON.stringify({
        schema_version: 1, run_id: 'test', iterations: [],
      }));
      const r = spawnTriage(['--input', llmReportPath]);
      expect(r.status).toBe(1);
      expect(r.stderr || '').toMatch(/sibling rerun-report\.json not found/i);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('--help prints usage and exits 0', () => {
    const r = spawnTriage(['--help']);
    expect(r.status).toBe(0);
    expect(r.stdout || '').toMatch(/usage:.*e2e-triage-classifier/i);
  });
});

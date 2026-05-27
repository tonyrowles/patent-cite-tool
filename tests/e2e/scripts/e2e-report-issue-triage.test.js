// tests/e2e/scripts/e2e-report-issue-triage.test.js
//
// Phase 35 Plan 35-03 (ISSUE-02) — spawnSync CLI integration tests for
// scripts/e2e-report-issue.mjs with --source triage.
//
// These tests cover:
//   E1. --source=triage (equals syntax) → exit 2, stderr matches /equals/i
//   E2. --source (missing value) → exit 2, stderr matches /missing value/i
//   E3. --source invalid → exit 2, stderr matches /invalid --source/i
//   E4. --source triage (no --triage-report) → exit 2, stderr matches /requires --triage-report/i
//   E5. --source triage --triage-report /etc/passwd → exit 1, stderr matches /must reside under/i
//   E6. Happy path WR-07 stderr-absence: valid fixture → no rejection signatures in stderr
//   E7. mock-gh transcript: gh issue create invoked with --label triage, --label e2e-nightly,
//       --label WRONG_CITATION (D-06 label order assertion)
//   E8. HARNESS_ERROR filtered at CLI level: exactly 2 gh issue create invocations
//       (iter 1 + iter 3 — WRONG_CITATION findings); zero invocations for iter 2 (HARNESS_ERROR)
//
// mock-gh routing: the script uses `execSync('gh ...')` with no GH_BIN_OVERRIDE hook.
// We shadow the system `gh` by prepending a tmpDir containing a `gh` stub script to PATH.
// This is the portable fallback described in the plan (D-06 note: "PATH shadowing").
//
// Fixture setup for E6-E8: the script reads sibling llm-report.json and rerun-report.json
// from the same directory as the triage-report.json path. We copy the phase35-*.json
// fixtures into a subdirectory under tests/e2e/fixtures/ (an ALLOWED_INPUT_ROOT) with
// canonical sibling names so the WR-05 path-bounding check passes.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const SCRIPT_PATH = path.resolve(PROJECT_ROOT, 'scripts/e2e-report-issue.mjs');
const FIXTURE_DIR = path.resolve(PROJECT_ROOT, 'tests/e2e/fixtures');

// ---------------------------------------------------------------------------
// Test state: fresh tmpDir per test (for mock-gh PATH shadowing)
// Plus a fixture run dir under FIXTURES_ROOT (for WR-05 compliant input paths)
// ---------------------------------------------------------------------------

let tmpDir;          // Holds mock-gh stub + transcript file
let transcriptPath;  // Path to mock-gh invocation transcript
let fixtureRunDir;   // Subdirectory under FIXTURES_ROOT with canonical sibling names

beforeEach(() => {
  // 1. Create tmpDir for mock-gh binary and transcript
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pct-issue-triage-'));
  transcriptPath = path.join(tmpDir, 'gh-transcript.txt');

  // 2. Create fixture run directory INSIDE FIXTURES_ROOT so WR-05 path-bounding passes.
  //    The script looks for sibling 'llm-report.json' and 'rerun-report.json' next to
  //    the --triage-report path. We copy phase35-*.json fixtures here with canonical names.
  fixtureRunDir = fs.mkdtempSync(path.join(FIXTURE_DIR, 'phase35-run-'));
  fs.copyFileSync(
    path.join(FIXTURE_DIR, 'phase35-triage-report.json'),
    path.join(fixtureRunDir, 'triage-report.json')
  );
  fs.copyFileSync(
    path.join(FIXTURE_DIR, 'phase35-llm-report.json'),
    path.join(fixtureRunDir, 'llm-report.json')
  );
  fs.copyFileSync(
    path.join(FIXTURE_DIR, 'phase35-rerun-report.json'),
    path.join(fixtureRunDir, 'rerun-report.json')
  );

  // 3. Create mock-gh stub as a `gh` binary in tmpDir (PATH shadowing).
  //    The script uses execSync('gh ...') so we shadow the system gh via PATH.
  //    Note: We use the name `gh` (not `mock-gh`) so it intercepts the execSync calls.
  const mockGhPath = path.join(tmpDir, 'gh');

  // Write the mock-gh stub script.
  // It records all invocations to gh-transcript.txt, then responds minimally:
  //   gh issue list → returns [] (empty JSON array for dual-search)
  //   gh issue create → returns a fake issue URL
  //   gh issue edit → returns a fake URL (for addLabel)
  //   gh --version → returns a fake version string (for any version checks)
  const stubScript = [
    '#!/usr/bin/env bash',
    `echo "$@" >> "${transcriptPath}"`,
    'case "$1" in',
    '  issue)',
    '    case "$2" in',
    '      list) echo "[]" ;;',
    '      create) echo "https://github.com/test/test/issues/42" ;;',
    '      edit) echo "https://github.com/test/test/issues/42" ;;',
    '      *) echo "[mock-gh] unknown issue subcommand: $@" >&2 ; exit 1 ;;',
    '    esac',
    '    ;;',
    '  --version) echo "gh version 2.83.1 (mock)" ;;',
    '  *) echo "[mock-gh] unknown root command: $@" >&2 ; exit 0 ;;',
    'esac',
  ].join('\n');

  fs.writeFileSync(mockGhPath, stubScript, { mode: 0o755 });
});

afterEach(() => {
  // Clean up mock-gh tmpDir
  fs.rmSync(tmpDir, { recursive: true, force: true });
  // Clean up fixture run subdirectory (under FIXTURES_ROOT — safe to remove)
  if (fixtureRunDir && fs.existsSync(fixtureRunDir)) {
    fs.rmSync(fixtureRunDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Helper: spawn the reporter script with PATH shadowing for mock-gh
// ---------------------------------------------------------------------------

/**
 * Spawn scripts/e2e-report-issue.mjs with given args.
 * Prepends tmpDir to PATH so our `gh` stub intercepts all gh shellouts.
 *
 * @param {string[]} args - CLI arguments
 * @param {object} extraEnv - additional env vars
 * @returns {import('node:child_process').SpawnSyncReturns}
 */
function spawnReporter(args, extraEnv = {}) {
  return spawnSync('node', [SCRIPT_PATH, ...args], {
    env: {
      ...process.env,
      ...extraEnv,
      // Prepend tmpDir so our `gh` stub shadows the real gh binary (PATH shadowing)
      PATH: `${tmpDir}:${process.env.PATH}`,
      GITHUB_REPOSITORY: 'test/test',
    },
    encoding: 'utf8',
    timeout: 5000,
  });
}

// ---------------------------------------------------------------------------
// E1-E5: Negative-case tests — argument validation
// ---------------------------------------------------------------------------

describe('--source flag validation (Phase 35 ISSUE-02)', () => {
  it('E1: rejects --source=triage (equals syntax) with exit 2 and stderr matching /equals/i', () => {
    const r = spawnReporter(['--source=triage']);
    expect(r.status).toBe(2);
    expect(r.stderr || '').toMatch(/equals/i);
  });

  it('E2: rejects --source (missing value, trailing flag) with exit 2 and stderr matching /missing value/i', () => {
    const r = spawnReporter(['--source']);
    expect(r.status).toBe(2);
    expect(r.stderr || '').toMatch(/missing value/i);
  });

  it('E3: rejects --source invalid with exit 2 and stderr matching /invalid --source/i', () => {
    const r = spawnReporter(['--source', 'invalid']);
    expect(r.status).toBe(2);
    expect(r.stderr || '').toMatch(/invalid --source/i);
  });

  it('E4: rejects --source triage without --triage-report with exit 2 and stderr matching /requires --triage-report/i', () => {
    const r = spawnReporter(['--source', 'triage']);
    expect(r.status).toBe(2);
    expect(r.stderr || '').toMatch(/requires --triage-report/i);
  });

  it('E5: rejects --triage-report path outside allowed roots with exit 1 and stderr matching /must reside under/i', () => {
    const r = spawnReporter(['--source', 'triage', '--triage-report', '/etc/passwd']);
    expect(r.status).toBe(1);
    expect(r.stderr || '').toMatch(/must reside under/i);
  });
});

// ---------------------------------------------------------------------------
// E6: WR-07 stderr-absence pattern (positive case)
// ---------------------------------------------------------------------------

describe('Phase 35 valid --source triage (WR-07 stderr-absence)', () => {
  it('E6: accepts --source triage with valid fixture without emitting rejection signatures in stderr', () => {
    // Use the fixture run dir with canonical sibling names (set up in beforeEach).
    // This dir is inside FIXTURES_ROOT so WR-05 path-bounding passes.
    const triagePath = path.join(fixtureRunDir, 'triage-report.json');
    const r = spawnReporter(['--source', 'triage', '--triage-report', triagePath]);
    const stderr = r.stderr || '';
    // WR-07: assert absence of known rejection signatures
    expect(stderr).not.toMatch(/equals syntax not supported for --source/i);
    expect(stderr).not.toMatch(/missing value for --source/i);
    expect(stderr).not.toMatch(/missing value for --triage-report/i);
    expect(stderr).not.toMatch(/requires --triage-report/i);
  });
});

// ---------------------------------------------------------------------------
// E7-E8: mock-gh transcript assertions
// ---------------------------------------------------------------------------

describe('Phase 35 mock-gh transcript (D-06 label args, Pitfall 8 HARNESS_ERROR filter)', () => {
  function readTranscriptLines() {
    if (!fs.existsSync(transcriptPath)) return [];
    return fs.readFileSync(transcriptPath, 'utf8').split('\n').filter(Boolean);
  }

  it('E7: mock-gh transcript contains --label triage, --label e2e-nightly, and --label WRONG_CITATION in a gh issue create invocation (D-06 label order)', () => {
    const triagePath = path.join(fixtureRunDir, 'triage-report.json');
    const r = spawnReporter(['--source', 'triage', '--triage-report', triagePath]);
    expect(r.status).toBe(0);

    const lines = readTranscriptLines();
    // Find gh issue create invocations
    const createLines = lines.filter(l => l.includes('issue create'));
    expect(createLines.length).toBeGreaterThan(0);

    // Join all create invocations and verify all 3 label args appear.
    // The bash stub records argv after shell word-splitting, so quotes are stripped:
    // `--label "triage"` in the command string becomes `--label triage` in $@.
    // We assert against the shell-parsed form (no quotes around values).
    const createText = createLines.join('\n');
    expect(createText).toContain('--label triage');
    expect(createText).toContain('--label e2e-nightly');
    expect(createText).toContain('--label WRONG_CITATION');
    // Also assert D-06 order: category appears before e2e-nightly before triage
    // in a single create line
    const firstCreate = createLines[0];
    const idxCategory = firstCreate.indexOf('--label WRONG_CITATION');
    const idxNightly = firstCreate.indexOf('--label e2e-nightly');
    const idxTriage = firstCreate.indexOf('--label triage');
    expect(idxCategory).toBeGreaterThanOrEqual(0);
    expect(idxNightly).toBeGreaterThan(idxCategory);
    expect(idxTriage).toBeGreaterThan(idxNightly);
  });

  it('E8: exactly 2 gh issue create invocations (iter 1 + iter 3 WRONG_CITATION); HARNESS_ERROR iter 2 filtered', () => {
    const triagePath = path.join(fixtureRunDir, 'triage-report.json');
    const r = spawnReporter(['--source', 'triage', '--triage-report', triagePath]);
    expect(r.status).toBe(0);

    const lines = readTranscriptLines();
    // Count gh issue create invocations
    const createLines = lines.filter(l => l.includes('issue create'));
    expect(createLines.length).toBe(2);

    // Verify HARNESS_ERROR label does NOT appear in any create invocation (HARNESS_ERROR filtered)
    const createText = createLines.join('\n');
    expect(createText).not.toContain('HARNESS_ERROR');
  });
});

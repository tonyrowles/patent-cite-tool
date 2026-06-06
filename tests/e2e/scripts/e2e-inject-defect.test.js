// tests/e2e/scripts/e2e-inject-defect.test.js
//
// Phase 59 Plan 59-01 (MUTATOR-01..05) — Vitest contract tests for
// tests/e2e/scripts/inject-defect.mjs.
//
// Tests I1-I8:
//   I1-I2: fingerprint determinism + 12-hex shape (MUTATOR-01)
//   I3-I4: collision check hard-abort + happy path (MUTATOR-02 / Pitfall 6)
//   I5-I6: gh argv plumbing (MUTATOR-01)
//   I7   : FORBIDDEN_PATHS gate / git status clean (MUTATOR-03 / T-59-03)
//   I8   : cleanup-evidence file emission (MUTATOR-05)
//
// Isolation strategy: mock-gh bash binary on PATH; spawnSync inside a tmp git
// repo so the MUTATOR-03 working-tree check exercises real git state. The
// cleanup-evidence file is redirected to a tmpDir via the --phase-dir argv
// flag so the real .planning/phases/59-* directory is never touched.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  computeFingerprint,
  SOURCE_TAG,
  ERROR_CLASSES,
} from './inject-defect.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const SCRIPT_PATH = path.resolve(PROJECT_ROOT, 'tests/e2e/scripts/inject-defect.mjs');

// ---------------------------------------------------------------------------
// Test isolation setup
// ---------------------------------------------------------------------------

let mockGhDir;        // tmpDir for mock-gh binary + transcript
let transcriptPath;
let mockGhPath;
let tmpGitRepoDir;    // hermetic git repo for MUTATOR-03 git status check
let phaseDirOverride; // absolute path passed via --phase-dir to override
                      // the real .planning/phases/59-* dir

function writeMockGh({ listJson }) {
  // Build a mock-gh bash binary that:
  //   - logs all args to transcript
  //   - captures stdin to a separate "stdin" file when --body-file - is set
  //   - echoes a fake URL on `issue create`
  //   - echoes the configured JSON on `issue list`
  const body = [
    '#!/usr/bin/env bash',
    'echo "$@" >> "' + transcriptPath + '"',
    'case "$1" in',
    '  issue)',
    '    case "$2" in',
    '      list) echo ' + "'" + listJson + "'" + ' ;;',
    '      create)',
    '        # Capture stdin (body) to a file for I6 inspection.',
    '        cat > "' + path.join(mockGhDir, 'gh-stdin.txt') + '"',
    '        echo "https://github.com/test/test/issues/142"',
    '        ;;',
    '      edit) echo "OK" ;;',
    '    esac ;;',
    '  --version) echo "gh version 2.83.1 (mock)" ;;',
    'esac',
  ].join('\n') + '\n';
  fs.writeFileSync(mockGhPath, body, { mode: 0o755 });
}

beforeEach(() => {
  mockGhDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pct-inject-mockgh-'));
  transcriptPath = path.join(mockGhDir, 'gh-transcript.txt');
  mockGhPath = path.join(mockGhDir, 'gh');
  writeMockGh({ listJson: '[]' }); // default: no collision

  // Hermetic git repo for the MUTATOR-03 verifyWorkingTreeClean check.
  tmpGitRepoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pct-inject-repo-'));
  execSync('git init -q', { cwd: tmpGitRepoDir });
  execSync('git config user.email test@example.com', { cwd: tmpGitRepoDir });
  execSync('git config user.name "Test User"', { cwd: tmpGitRepoDir });
  execSync('git commit --allow-empty -q -m initial', { cwd: tmpGitRepoDir });

  // Cleanup-evidence file lives OUTSIDE the tmp git repo so the
  // git status --porcelain check inside tmpGitRepoDir sees zero entries
  // (the cleanup file write does not modify the tmp repo's working tree).
  phaseDirOverride = fs.mkdtempSync(path.join(os.tmpdir(), 'pct-inject-phase-'));
});

afterEach(() => {
  fs.rmSync(mockGhDir, { recursive: true, force: true });
  fs.rmSync(tmpGitRepoDir, { recursive: true, force: true });
  fs.rmSync(phaseDirOverride, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Spawn helper — runs inject-defect.mjs inside tmpGitRepoDir so its
// `git status` MUTATOR-03 check exercises the hermetic repo. PATH is
// prepended with mockGhDir so the script shells out to the mock instead
// of real gh.
// ---------------------------------------------------------------------------

function spawnInject(args, extraEnv = {}) {
  return spawnSync('node', [SCRIPT_PATH, ...args], {
    env: {
      ...process.env,
      PATH: mockGhDir + ':' + process.env.PATH,
      ...extraEnv,
    },
    cwd: tmpGitRepoDir,
    encoding: 'utf8',
    timeout: 10000,
  });
}

// ===========================================================================
// I1-I2: fingerprint determinism (MUTATOR-01)
// ===========================================================================

describe('inject-defect.mjs — fingerprint determinism (MUTATOR-01)', () => {
  it('I1: fingerprint is deterministic for same seed + errorClass', () => {
    const fpA = computeFingerprint({ seed: 'mutator-seed-1', errorClass: 'GOOGLE_DOM_DRIFT' });
    const fpB = computeFingerprint({ seed: 'mutator-seed-1', errorClass: 'GOOGLE_DOM_DRIFT' });
    expect(fpA).toBe(fpB);
    expect(fpA).toMatch(/^[0-9a-f]{12}$/);
  });

  it('I2: fingerprint differs across distinct seeds and matches 12-hex shape', () => {
    const fp1 = computeFingerprint({ seed: 'mutator-seed-1', errorClass: 'GOOGLE_DOM_DRIFT' });
    const fp2 = computeFingerprint({ seed: 'mutator-seed-2', errorClass: 'GOOGLE_DOM_DRIFT' });
    expect(fp1).not.toBe(fp2);
    expect(fp1).toMatch(/^[0-9a-f]{12}$/);
    expect(fp2).toMatch(/^[0-9a-f]{12}$/);
  });
});

// ===========================================================================
// I3-I4: collision check (MUTATOR-02 / Pitfall 6 LOAD-BEARING)
// ===========================================================================

describe('inject-defect.mjs — collision check (MUTATOR-02 / Pitfall 6)', () => {
  it('I3: existing open issue at same fingerprint HARD ABORTS with exit 2', () => {
    // Override mock-gh to return a non-empty list (simulating collision).
    writeMockGh({ listJson: '[{"number":42}]' });
    const r = spawnInject([
      '--seed', 'mutator-seed-collision',
      '--error-class', 'GOOGLE_DOM_DRIFT',
      '--phase-dir', phaseDirOverride,
    ]);
    expect(r.status).toBe(2);
    expect(r.stderr || '').toMatch(/HARD ABORT/);
  });

  it('I4: empty issue-list result proceeds to issue create (transcript shows ordering)', () => {
    const r = spawnInject([
      '--seed', 'mutator-seed-1',
      '--error-class', 'GOOGLE_DOM_DRIFT',
      '--phase-dir', phaseDirOverride,
    ]);
    expect(r.status).toBe(0);
    const transcript = fs.readFileSync(transcriptPath, 'utf8');
    // issue list must appear before issue create.
    const listIdx = transcript.indexOf('issue list');
    const createIdx = transcript.indexOf('issue create');
    expect(listIdx).toBeGreaterThanOrEqual(0);
    expect(createIdx).toBeGreaterThan(listIdx);
  });
});

// ===========================================================================
// I5-I6: gh argv plumbing (MUTATOR-01)
// ===========================================================================

describe('inject-defect.mjs — gh argv plumbing (MUTATOR-01)', () => {
  it('I5: issue create carries --label triage and --label <errorClass>', () => {
    const r = spawnInject([
      '--seed', 'mutator-seed-1',
      '--error-class', 'GOOGLE_DOM_DRIFT',
      '--phase-dir', phaseDirOverride,
    ]);
    expect(r.status).toBe(0);
    const transcript = fs.readFileSync(transcriptPath, 'utf8');
    expect(transcript).toMatch(/--label triage/);
    expect(transcript).toMatch(/--label GOOGLE_DOM_DRIFT/);
  });

  it('I6: issue create uses --body-file - and body line 1 is the fp marker', () => {
    const r = spawnInject([
      '--seed', 'mutator-seed-1',
      '--error-class', 'GOOGLE_DOM_DRIFT',
      '--phase-dir', phaseDirOverride,
    ]);
    expect(r.status).toBe(0);
    const transcript = fs.readFileSync(transcriptPath, 'utf8');
    expect(transcript).toMatch(/issue create.*--body-file -/);
    // The mock-gh captures stdin to gh-stdin.txt — confirm line 1 is the
    // v2 marker `<!-- fp: <12-hex> -->`.
    const stdinPath = path.join(mockGhDir, 'gh-stdin.txt');
    expect(fs.existsSync(stdinPath)).toBe(true);
    const stdin = fs.readFileSync(stdinPath, 'utf8');
    const firstLine = stdin.split('\n')[0];
    expect(firstLine).toMatch(/^<!-- fp: [0-9a-f]{12} -->$/);
  });
});

// ===========================================================================
// I7: FORBIDDEN_PATHS gate (MUTATOR-03 / T-59-03 / Pitfall 5 LOAD-BEARING)
// ===========================================================================

describe('inject-defect.mjs — FORBIDDEN_PATHS gate (MUTATOR-03)', () => {
  it('I7: tmp git repo working tree is clean after mutator run (zero FORBIDDEN_PATHS hits)', () => {
    const r = spawnInject([
      '--seed', 'mutator-seed-1',
      '--error-class', 'GOOGLE_DOM_DRIFT',
      '--phase-dir', phaseDirOverride,
    ]);
    expect(r.status).toBe(0);
    const status = execSync('git status --porcelain', {
      cwd: tmpGitRepoDir,
      encoding: 'utf8',
    }).trim();
    // The cleanup file lives OUTSIDE tmpGitRepoDir (under phaseDirOverride),
    // so the tmp repo's working tree must be completely clean.
    expect(status).toBe('');
    // Belt-and-suspenders: the cleanup file exists at phaseDirOverride.
    const cleanupPath = path.join(phaseDirOverride, '56-MUTATOR-CLEANUP.md');
    expect(fs.existsSync(cleanupPath)).toBe(true);
  });

  // Phase 59 REVIEW-FIX CR-02: dirty-tree branch regression pin. The
  // pre-REVIEW-FIX main() ordering ran verifyWorkingTreeClean AFTER
  // createIssue, so a dirty working tree left an orphaned synthetic
  // issue with no cleanup record (T-59-03 + T-59-05 defeated). The
  // REVIEW-FIX reorders main() so verifyWorkingTreeClean fires BEFORE
  // createIssue. This test pre-stages a violating file and asserts:
  //   (a) the script exits non-zero (dirty-tree FATAL per script line 306),
  //   (b) the mock-gh transcript contains NO `issue create` line —
  //       proving the gate ran BEFORE the side effect, not after.
  it('I7b: dirty working tree exits 1 BEFORE issue create (CR-02 regression pin)', () => {
    // Pre-stage a violating file in the tmp git repo so the
    // verifyWorkingTreeClean check sees an `?? junk.txt` entry that
    // does NOT match the allowed `${phaseDir}/56-MUTATOR-CLEANUP.md`
    // pattern.
    fs.writeFileSync(path.join(tmpGitRepoDir, 'junk.txt'), 'forbidden\n');
    const r = spawnInject([
      '--seed', 'mutator-seed-1',
      '--error-class', 'GOOGLE_DOM_DRIFT',
      '--phase-dir', phaseDirOverride,
    ]);
    // Dirty-tree exit code per inject-defect.mjs verifyWorkingTreeClean.
    expect(r.status).toBe(1);
    // CR-02 invariant: createIssue MUST NOT have been called. The
    // mock-gh transcript would contain `issue create ...` if the
    // pre-REVIEW-FIX ordering had not been reorganized.
    const transcript = fs.existsSync(transcriptPath)
      ? fs.readFileSync(transcriptPath, 'utf8')
      : '';
    expect(transcript).not.toMatch(/issue create/);
  });
});

// ===========================================================================
// I9: WR-02 unknown-flag reject (Phase 59 REVIEW-FIX)
// ===========================================================================

describe('inject-defect.mjs — unknown-flag reject (WR-02)', () => {
  it('I9: unknown flag exits 2 with stderr "unknown flag" (mirrors auto-fix-promote PA-style)', () => {
    // Pre-REVIEW-FIX parseArgs silently dropped unknown tokens such as
    // `--seeds`, `--errorclass`, `--phasedir`, falling through to the
    // defaults and filing a synthetic issue against the REAL phase
    // directory using the shared default fingerprint. Mirrors the
    // scripts/auto-fix-promote.mjs KNOWN_FLAGS reject pattern.
    const r = spawnInject([
      '--seed', 'mutator-seed-1',
      '--error-class', 'GOOGLE_DOM_DRIFT',
      '--phase-dir', phaseDirOverride,
      '--bogus-flag', 'value',
    ]);
    expect(r.status).toBe(2);
    expect(r.stderr || '').toMatch(/unknown flag/i);
    // Belt-and-suspenders: no mock-gh call should have happened (the
    // reject fires inside parseArgs before computeFingerprint /
    // collisionCheckOrAbort / createIssue).
    const transcript = fs.existsSync(transcriptPath)
      ? fs.readFileSync(transcriptPath, 'utf8')
      : '';
    expect(transcript).not.toMatch(/issue (create|list)/);
  });
});

// ===========================================================================
// I8: cleanup-evidence emission (MUTATOR-05 / T-59-05)
// ===========================================================================

describe('inject-defect.mjs — cleanup evidence emission (MUTATOR-05)', () => {
  it('I8: 56-MUTATOR-CLEANUP.md carries gh close commands, source tag, and fingerprint', () => {
    const r = spawnInject([
      '--seed', 'mutator-seed-1',
      '--error-class', 'GOOGLE_DOM_DRIFT',
      '--phase-dir', phaseDirOverride,
    ]);
    expect(r.status).toBe(0);
    const cleanupPath = path.join(phaseDirOverride, '56-MUTATOR-CLEANUP.md');
    const contents = fs.readFileSync(cleanupPath, 'utf8');
    expect(contents).toMatch(/gh issue close/);
    // Placeholder format: `gh pr close <PR_NUMBER> --delete-branch` (populated
    // by operator after the auto-fix loop opens the PR).
    expect(contents).toMatch(/gh pr close .* --delete-branch/);
    expect(contents).toMatch(/gh issue list --search/);
    expect(contents).toMatch(/fixture-mutator-uat-47b/);
    // Per-invocation append: the fingerprint computed for this seed
    // appears verbatim in the manifest.
    const fp = computeFingerprint({
      seed: 'mutator-seed-1',
      errorClass: 'GOOGLE_DOM_DRIFT',
    });
    expect(contents).toContain(fp);
    // Sanity: exported SOURCE_TAG matches the literal we expect.
    expect(SOURCE_TAG).toBe('fixture-mutator-uat-47b');
    // Sanity: ERROR_CLASSES export contains the allowlisted class.
    expect(ERROR_CLASSES.has('GOOGLE_DOM_DRIFT')).toBe(true);
  });
});

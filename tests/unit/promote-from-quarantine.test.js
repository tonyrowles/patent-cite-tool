// tests/unit/promote-from-quarantine.test.js
//
// Phase 35 Plan 35-05 (QUAR-05) — Vitest coverage for promote-from-quarantine.mjs.
//
// Tests P1-P8: dry-run / --confirm happy path / failure paths / CI guard
// Tests A1-A3: appendToGoldenCorpus pure helper
//
// D-15: Uses tmpDir corpus clone so committed files are NEVER mutated.
// Pitfall 6: spawnSync mock asserts cwd argument.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { runPromote, appendToGoldenCorpus } from '../../scripts/promote-from-quarantine.mjs';
import { stringifyCorpus } from '../../scripts/quarantine-append.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const REAL_TEST_CASES_PATH = path.resolve(PROJECT_ROOT, 'tests/test-cases.js');

// ---------------------------------------------------------------------------
// Shared tmpDir setup
// ---------------------------------------------------------------------------

let tmpDir, goldenPath, quarantinePath, fakeUpdateGoldenScript;
let stdoutBuf, stderrBuf, captureStdout, captureStderr;

const QUAR_SEED_NOT_IN_GOLDEN = {
  id: 'US11427642-not-in-golden-1',
  patentFile: './tests/fixtures/US11427642.json',
  selectedText: 'quarantine sample text for promotion testing',
  category: 'claims',
  stable_runs: 5,
  source_triage_finding_id: 'run1-iter-1',
  added_iso: '2026-05-27T10:00:00.000Z',
};

// US11427642-spec-short-1 IS in real TEST_CASES (used for duplicate-refusal test P3).
const QUAR_SEED_IN_GOLDEN = {
  id: 'US11427642-spec-short-1',
  patentFile: './tests/fixtures/US11427642.json',
  selectedText: 'receptor exclusively expressed on plasma cells and plasmablasts.',
  category: 'modern-short',
  stable_runs: 4,
  source_triage_finding_id: 'run1-iter-2',
  added_iso: '2026-05-27T10:00:01.000Z',
};

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pct-promote-'));
  goldenPath = path.join(tmpDir, 'test-cases.js');
  quarantinePath = path.join(tmpDir, 'test-cases-quarantine.js');
  fakeUpdateGoldenScript = path.join(tmpDir, 'update-golden.js');

  // Clone real test-cases.js into tmpDir so committed files stay clean (D-15).
  fs.copyFileSync(REAL_TEST_CASES_PATH, goldenPath);

  // Seed quarantine with 2 entries: one new, one already in golden.
  const quarSeed = stringifyCorpus([QUAR_SEED_NOT_IN_GOLDEN, QUAR_SEED_IN_GOLDEN]);
  fs.writeFileSync(quarantinePath, quarSeed);

  // Placeholder fake script (never actually executed — tests inject spawn mock).
  fs.writeFileSync(fakeUpdateGoldenScript, '#!/usr/bin/env node\nprocess.exit(0);\n');

  // Capturing streams.
  stdoutBuf = '';
  stderrBuf = '';
  captureStdout = { write: (s) => { stdoutBuf += s; } };
  captureStderr = { write: (s) => { stderrBuf += s; } };
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.CI;
  delete process.env.GITHUB_ACTIONS;
});

// Helper: common opts shared across tests.
function baseOpts(overrides = {}) {
  return {
    goldenPath,
    quarantinePath,
    updateGoldenScript: fakeUpdateGoldenScript,
    cwd: tmpDir,
    stdout: captureStdout,
    stderr: captureStderr,
    _skipCiGuard: true, // CI guard tested separately in P7/P8
    ...overrides,
  };
}

// Helper: cache-busted dynamic import.
async function importCorpus(filePath, exportName) {
  const url = pathToFileURL(filePath).href + '?t=' + Date.now() + '-' + Math.random();
  return (await import(url))[exportName];
}

// ---------------------------------------------------------------------------
// Dry-run path
// ---------------------------------------------------------------------------

describe('P1: dry-run prints plan + no mutations', () => {
  it('returns exitCode 0, action dry-run, prints plan, does NOT mutate corpora, does NOT call spawn', async () => {
    const mockSpawn = vi.fn();
    const beforeGolden = fs.readFileSync(goldenPath, 'utf-8');
    const beforeQuar = fs.readFileSync(quarantinePath, 'utf-8');

    const result = await runPromote(baseOpts({
      id: 'US11427642-not-in-golden-1',
      confirm: false,
      spawn: mockSpawn,
    }));

    expect(result).toMatchObject({ exitCode: 0, action: 'dry-run' });
    expect(stdoutBuf).toContain('Dry-run promotion plan');
    expect(stdoutBuf).toContain('Will invoke:              node scripts/update-golden.js --case US11427642-not-in-golden-1 --confirm');
    // corpora must be byte-identical to pre-run state (D-13 dry-run guarantee)
    expect(fs.readFileSync(goldenPath, 'utf-8')).toBe(beforeGolden);
    expect(fs.readFileSync(quarantinePath, 'utf-8')).toBe(beforeQuar);
    // spawnSync must NOT have been called
    expect(mockSpawn.mock.calls.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// --confirm happy path
// ---------------------------------------------------------------------------

describe('P2: --confirm promotes successfully + invokes spawn with correct args', () => {
  it('moves entry from quarantine to golden, calls spawn with --case <id> --confirm + cwd', async () => {
    const mockSpawn = vi.fn().mockReturnValue({ status: 0, stderr: '' });

    const result = await runPromote(baseOpts({
      id: 'US11427642-not-in-golden-1',
      confirm: true,
      spawn: mockSpawn,
    }));

    expect(result).toMatchObject({
      exitCode: 0,
      action: 'promoted',
    });
    expect(result.spawnArgs).toEqual([
      fakeUpdateGoldenScript,
      '--case',
      'US11427642-not-in-golden-1',
      '--confirm',
    ]);

    // Pitfall 6: assert cwd was PROJECT_ROOT (the injected opts.cwd = tmpDir in this test).
    expect(mockSpawn).toHaveBeenCalledTimes(1);
    expect(mockSpawn).toHaveBeenCalledWith(
      'node',
      [fakeUpdateGoldenScript, '--case', 'US11427642-not-in-golden-1', '--confirm'],
      expect.objectContaining({ cwd: tmpDir, encoding: 'utf8' }),
    );

    // Verify entry was appended to golden corpus.
    const newGolden = await importCorpus(goldenPath, 'TEST_CASES');
    const promoted = newGolden.find(e => e.id === 'US11427642-not-in-golden-1');
    expect(promoted).toBeDefined();
    // Exactly 4 keys: quarantine-only metadata stripped (D-14 step 2).
    expect(Object.keys(promoted).sort()).toEqual(['category', 'id', 'patentFile', 'selectedText']);
    expect(promoted.category).toBe(QUAR_SEED_NOT_IN_GOLDEN.category);
    expect(promoted.patentFile).toBe(QUAR_SEED_NOT_IN_GOLDEN.patentFile);
    expect(promoted.selectedText).toBe(QUAR_SEED_NOT_IN_GOLDEN.selectedText);

    // Verify entry was removed from quarantine corpus.
    const newQuar = await importCorpus(quarantinePath, 'TEST_CASES_QUARANTINE');
    expect(newQuar.find(e => e.id === 'US11427642-not-in-golden-1')).toBeUndefined();
    // Entry B (US11427642-spec-short-1) must still be in quarantine.
    expect(newQuar.find(e => e.id === 'US11427642-spec-short-1')).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// --confirm failure paths
// ---------------------------------------------------------------------------

describe('P3: refuses duplicate — id already in golden corpus', () => {
  it('returns exitCode 1, stderr contains already in golden corpus, neither corpus mutated', async () => {
    const mockSpawn = vi.fn();
    const beforeGolden = fs.readFileSync(goldenPath, 'utf-8');
    const beforeQuar = fs.readFileSync(quarantinePath, 'utf-8');

    const result = await runPromote(baseOpts({
      id: 'US11427642-spec-short-1',
      confirm: true,
      spawn: mockSpawn,
    }));

    expect(result.exitCode).toBe(1);
    expect(stderrBuf).toMatch(/already in golden corpus/i);
    expect(fs.readFileSync(goldenPath, 'utf-8')).toBe(beforeGolden);
    expect(fs.readFileSync(quarantinePath, 'utf-8')).toBe(beforeQuar);
    expect(mockSpawn.mock.calls.length).toBe(0);
  });
});

describe('P4: entry not in quarantine corpus', () => {
  it('returns exitCode 1, stderr contains entry not found in quarantine', async () => {
    const mockSpawn = vi.fn();

    const result = await runPromote(baseOpts({
      id: 'US99999-nonexistent-1',
      confirm: true,
      spawn: mockSpawn,
    }));

    expect(result.exitCode).toBe(1);
    expect(stderrBuf).toMatch(/entry not found in quarantine/i);
    expect(mockSpawn.mock.calls.length).toBe(0);
  });
});

describe('P5: spawn exits non-zero — partial state + revert hint in stderr', () => {
  it('returns exitCode 1, stderr names exit code + git revert hint; corpora ARE mutated up to step 4', async () => {
    const mockSpawn = vi.fn().mockReturnValue({ status: 2, stderr: 'mock failure' });

    const result = await runPromote(baseOpts({
      id: 'US11427642-not-in-golden-1',
      confirm: true,
      spawn: mockSpawn,
    }));

    expect(result.exitCode).toBe(1);
    expect(stderrBuf).toMatch(/update-golden\.js exited 2/);
    expect(stderrBuf).toMatch(/git status/);
    expect(stderrBuf).toMatch(/git checkout tests\//);

    // Corpora ARE mutated up to step 4 (partial-state failure mode — documented behavior).
    // Golden has the new entry; quarantine no longer has it.
    const newGolden = await importCorpus(goldenPath, 'TEST_CASES');
    expect(newGolden.find(e => e.id === 'US11427642-not-in-golden-1')).toBeDefined();
    const newQuar = await importCorpus(quarantinePath, 'TEST_CASES_QUARANTINE');
    expect(newQuar.find(e => e.id === 'US11427642-not-in-golden-1')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Sanitize
// ---------------------------------------------------------------------------

describe('P6: sanitizeCaseId rejects shell-injection id', () => {
  it('returns exitCode 1, stderr contains invalid --id, no corpus mutation, no spawn', async () => {
    const mockSpawn = vi.fn();
    const beforeGolden = fs.readFileSync(goldenPath, 'utf-8');
    const beforeQuar = fs.readFileSync(quarantinePath, 'utf-8');

    const result = await runPromote(baseOpts({
      id: 'badid; rm -rf /',
      confirm: true,
      spawn: mockSpawn,
    }));

    expect(result.exitCode).toBe(1);
    expect(stderrBuf).toMatch(/invalid --id/);
    expect(fs.readFileSync(goldenPath, 'utf-8')).toBe(beforeGolden);
    expect(fs.readFileSync(quarantinePath, 'utf-8')).toBe(beforeQuar);
    expect(mockSpawn.mock.calls.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// CI guard (D-13) — set process.env directly; runPromote re-checks env
// ---------------------------------------------------------------------------

describe('P7: CI=true is refused by runPromote', () => {
  it('returns exitCode 1 with local-only stderr when CI=true', async () => {
    process.env.CI = 'true';
    const result = await runPromote({
      id: 'US11427642-not-in-golden-1',
      confirm: false,
      goldenPath,
      quarantinePath,
      stdout: captureStdout,
      stderr: captureStderr,
      // _skipCiGuard NOT set here — we want the guard to fire
    });
    expect(result.exitCode).toBe(1);
    expect(stderrBuf).toMatch(/promotion is local-only/i);
  });
});

describe('P8: GITHUB_ACTIONS=true is refused by runPromote', () => {
  it('returns exitCode 1 with local-only stderr when GITHUB_ACTIONS=true', async () => {
    process.env.GITHUB_ACTIONS = 'true';
    const result = await runPromote({
      id: 'US11427642-not-in-golden-1',
      confirm: false,
      goldenPath,
      quarantinePath,
      stdout: captureStdout,
      stderr: captureStderr,
      // _skipCiGuard NOT set here — we want the guard to fire
    });
    expect(result.exitCode).toBe(1);
    expect(stderrBuf).toMatch(/promotion is local-only/i);
  });
});

// ---------------------------------------------------------------------------
// appendToGoldenCorpus pure helper tests
// ---------------------------------------------------------------------------

const FIXTURE_ENTRY = {
  id: 'US11427642-test-promote-1',
  patentFile: './tests/fixtures/US11427642.json',
  selectedText: 'test selected text for appendToGoldenCorpus assertion',
  category: 'claims',
};

describe('A1: appendToGoldenCorpus preserves all original lines', () => {
  it('every original line appears in the new content (order preserved)', () => {
    const original = fs.readFileSync(REAL_TEST_CASES_PATH, 'utf-8');
    const newContent = appendToGoldenCorpus(original, FIXTURE_ENTRY);

    const originalLines = original.split('\n');
    const newLines = newContent.split('\n');

    for (const line of originalLines) {
      expect(newLines).toContain(line);
    }

    // New content is longer than original (new entry was inserted).
    expect(newContent.length).toBeGreaterThan(original.length);
  });
});

describe('A2: appendToGoldenCorpus output is parseable with new entry', () => {
  it('writing output to tmpDir and importing produces TEST_CASES with new entry', async () => {
    const original = fs.readFileSync(REAL_TEST_CASES_PATH, 'utf-8');
    const newContent = appendToGoldenCorpus(original, FIXTURE_ENTRY);

    const outPath = path.join(tmpDir, 'test-cases-a2.js');
    fs.writeFileSync(outPath, newContent, 'utf-8');

    const TEST_CASES = await importCorpus(outPath, 'TEST_CASES');
    const found = TEST_CASES.find(e => e.id === FIXTURE_ENTRY.id);
    expect(found).toBeDefined();
    expect(found.id).toBe(FIXTURE_ENTRY.id);
    expect(found.patentFile).toBe(FIXTURE_ENTRY.patentFile);
    expect(found.selectedText).toBe(FIXTURE_ENTRY.selectedText);
    expect(found.category).toBe(FIXTURE_ENTRY.category);
    // New entry is at the end of the array.
    expect(TEST_CASES[TEST_CASES.length - 1].id).toBe(FIXTURE_ENTRY.id);
  });
});

describe('A3: appendToGoldenCorpus does not itself reject duplicates (pure helper)', () => {
  it('appending same entry twice produces file with 2 entries of same id (duplicate rejection is runPromote D-15)', () => {
    const original = fs.readFileSync(REAL_TEST_CASES_PATH, 'utf-8');
    const once = appendToGoldenCorpus(original, FIXTURE_ENTRY);
    const twice = appendToGoldenCorpus(once, FIXTURE_ENTRY);

    // Both calls return a string longer than original.
    expect(twice.length).toBeGreaterThan(once.length);
    // Duplicates are in the output — the helper does NOT check.
    const count = (twice.match(new RegExp(FIXTURE_ENTRY.id, 'g')) ?? []).length;
    expect(count).toBe(2);
  });
});

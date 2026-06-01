// tests/unit/quarantine-append.test.js
//
// Phase 35 Plan 35-04 (QUAR-02) — unit tests for upsertQuarantineEntry,
// formatEntry, stringifyCorpus exported from scripts/quarantine-append.mjs.
//
// Tests U1-U5: idempotent upsert + stable_runs + action return value
// Tests L1-L5: stable_runs >= 3 auto-label (D-12) via mock ghClient
// Tests F1-F3: formatEntry determinism (Pitfall 4)
// Tests S1-S2: stringifyCorpus round-trip via dynamic import

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import {
  upsertQuarantineEntry,
  formatEntry,
  stringifyCorpus,
} from '../../scripts/quarantine-append.mjs';

// Phase 45-03: resolve repo root for spawnSync invocations of the script
const __TEST_FILE = fileURLToPath(import.meta.url);
const __REPO_ROOT = path.resolve(path.dirname(__TEST_FILE), '..', '..');
const __SCRIPT_PATH = path.resolve(__REPO_ROOT, 'scripts/quarantine-append.mjs');

// ---------------------------------------------------------------------------
// tmpDir setup (each test gets a fresh corpus)
// ---------------------------------------------------------------------------

let tmpDir;
let corpusPath;

const EMPTY_SEED = '// AUTO-MANAGED\nexport const TEST_CASES_QUARANTINE = [];\n';

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pct-quar-append-'));
  corpusPath = path.join(tmpDir, 'test-cases-quarantine.js');
  fs.writeFileSync(corpusPath, EMPTY_SEED);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// Fixed clock for deterministic added_iso assertions.
const FIXED_DATE = new Date('2026-05-27T12:00:00.000Z');
const nowFn = () => new Date(FIXED_DATE.getTime());

function makeNewEntry(overrides = {}) {
  return {
    id: 'US11427642-claims-1',
    patentFile: './tests/fixtures/US11427642.json',
    selectedText: 'sample selection',
    category: 'claims',
    source_triage_finding_id: 'runid-iter-3',
    ...overrides,
  };
}

async function reimport(filePath) {
  const url = pathToFileURL(filePath).href + '?t=' + Date.now() + '-' + Math.random();
  return import(url);
}

// ---------------------------------------------------------------------------
// U1-U5: Idempotency + stable_runs + action return value
// ---------------------------------------------------------------------------

describe('upsertQuarantineEntry — idempotency (U1-U5)', () => {
  it('U1: insert new id — length 1, stable_runs === 1, valid added_iso', async () => {
    await upsertQuarantineEntry(makeNewEntry(), { corpusPath, now: nowFn });
    const { TEST_CASES_QUARANTINE } = await reimport(corpusPath);
    expect(TEST_CASES_QUARANTINE).toHaveLength(1);
    expect(TEST_CASES_QUARANTINE[0].stable_runs).toBe(1);
    expect(TEST_CASES_QUARANTINE[0].added_iso).toBe('2026-05-27T12:00:00.000Z');
  });

  it('U2: upsert same id twice — 1 entry, stable_runs === 2, added_iso unchanged', async () => {
    const first = await upsertQuarantineEntry(makeNewEntry(), { corpusPath, now: nowFn });
    await upsertQuarantineEntry(makeNewEntry(), { corpusPath, now: nowFn });
    const { TEST_CASES_QUARANTINE } = await reimport(corpusPath);
    expect(TEST_CASES_QUARANTINE).toHaveLength(1);
    expect(TEST_CASES_QUARANTINE[0].stable_runs).toBe(2);
    expect(TEST_CASES_QUARANTINE[0].added_iso).toBe(first.entry.added_iso);
  });

  it('U3: upsert 5 times — stable_runs === 5, added_iso byte-identical to first', async () => {
    const first = await upsertQuarantineEntry(makeNewEntry(), { corpusPath, now: nowFn });
    for (let i = 0; i < 4; i++) {
      await upsertQuarantineEntry(makeNewEntry(), { corpusPath, now: nowFn });
    }
    const { TEST_CASES_QUARANTINE } = await reimport(corpusPath);
    expect(TEST_CASES_QUARANTINE[0].stable_runs).toBe(5);
    expect(TEST_CASES_QUARANTINE[0].added_iso).toBe(first.entry.added_iso);
  });

  it('U4: separate ids stay separate — length 2, each stable_runs === 1', async () => {
    await upsertQuarantineEntry(makeNewEntry({ id: 'US11427642-claims-1' }), { corpusPath, now: nowFn });
    await upsertQuarantineEntry(makeNewEntry({ id: 'US11427642-claims-2' }), { corpusPath, now: nowFn });
    const { TEST_CASES_QUARANTINE } = await reimport(corpusPath);
    expect(TEST_CASES_QUARANTINE).toHaveLength(2);
    expect(TEST_CASES_QUARANTINE[0].stable_runs).toBe(1);
    expect(TEST_CASES_QUARANTINE[1].stable_runs).toBe(1);
  });

  it('U5: action return value — first insert returns inserted, second returns upserted', async () => {
    const r1 = await upsertQuarantineEntry(makeNewEntry(), { corpusPath, now: nowFn });
    const r2 = await upsertQuarantineEntry(makeNewEntry(), { corpusPath, now: nowFn });
    expect(r1.action).toBe('inserted');
    expect(r2.action).toBe('upserted');
  });
});

// ---------------------------------------------------------------------------
// L1-L5: stable_runs >= 3 auto-label (D-12)
// ---------------------------------------------------------------------------

describe('upsertQuarantineEntry — stable_runs auto-label (L1-L5)', () => {
  it('L1: no label add when stable_runs < 3 (upsert twice)', async () => {
    const mockGh = { addLabel: vi.fn() };
    await upsertQuarantineEntry(makeNewEntry(), { corpusPath, ghClient: mockGh, triageIssueNumber: 42, now: nowFn });
    await upsertQuarantineEntry(makeNewEntry(), { corpusPath, ghClient: mockGh, triageIssueNumber: 42, now: nowFn });
    expect(mockGh.addLabel).not.toHaveBeenCalled();
  });

  it('L2: label added at stable_runs === 3 with correct args; addedLabel === true', async () => {
    const mockGh = { addLabel: vi.fn() };
    await upsertQuarantineEntry(makeNewEntry(), { corpusPath, ghClient: mockGh, triageIssueNumber: 42, now: nowFn });
    await upsertQuarantineEntry(makeNewEntry(), { corpusPath, ghClient: mockGh, triageIssueNumber: 42, now: nowFn });
    const r3 = await upsertQuarantineEntry(makeNewEntry(), { corpusPath, ghClient: mockGh, triageIssueNumber: 42, now: nowFn });
    expect(mockGh.addLabel).toHaveBeenCalledTimes(1);
    expect(mockGh.addLabel).toHaveBeenCalledWith(42, 'quarantine:ready-for-promotion');
    expect(r3.addedLabel).toBe(true);
  });

  it('L3: label add again at stable_runs === 4 (script does not dedupe; gh handles idempotency)', async () => {
    const mockGh = { addLabel: vi.fn() };
    for (let i = 0; i < 4; i++) {
      await upsertQuarantineEntry(makeNewEntry(), { corpusPath, ghClient: mockGh, triageIssueNumber: 42, now: nowFn });
    }
    expect(mockGh.addLabel).toHaveBeenCalledTimes(2);
  });

  it('L4: no label add when triageIssueNumber is null', async () => {
    const mockGh = { addLabel: vi.fn() };
    for (let i = 0; i < 3; i++) {
      await upsertQuarantineEntry(makeNewEntry(), { corpusPath, ghClient: mockGh, triageIssueNumber: null, now: nowFn });
    }
    expect(mockGh.addLabel).not.toHaveBeenCalled();
  });

  it('L5: no throw and no label add when ghClient is null', async () => {
    for (let i = 0; i < 3; i++) {
      await expect(
        upsertQuarantineEntry(makeNewEntry(), { corpusPath, ghClient: null, triageIssueNumber: 42, now: nowFn }),
      ).resolves.toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// F1-F3: formatEntry determinism (Pitfall 4)
// ---------------------------------------------------------------------------

describe('formatEntry — determinism (F1-F3)', () => {
  const baseEntry = {
    id: 'US11427642-claims-1',
    patentFile: './tests/fixtures/US11427642.json',
    selectedText: 'sample selection',
    category: 'claims',
    stable_runs: 1,
    source_triage_finding_id: 'runid-iter-3',
    added_iso: '2026-05-27T12:00:00.000Z',
  };

  it('F1: byte-identical output for equivalent objects with different key orders', () => {
    const a = { ...baseEntry };
    const b = {
      added_iso: baseEntry.added_iso,
      source_triage_finding_id: baseEntry.source_triage_finding_id,
      stable_runs: baseEntry.stable_runs,
      category: baseEntry.category,
      selectedText: baseEntry.selectedText,
      patentFile: baseEntry.patentFile,
      id: baseEntry.id,
    };
    expect(formatEntry(a)).toBe(formatEntry(b));
  });

  it('F2: formatEntry output has keys in canonical order', () => {
    const result = formatEntry(baseEntry);
    const idIdx = result.indexOf('id:');
    const pfIdx = result.indexOf('patentFile:');
    const stIdx = result.indexOf('selectedText:');
    const catIdx = result.indexOf('category:');
    const srIdx = result.indexOf('stable_runs:');
    const fidIdx = result.indexOf('source_triage_finding_id:');
    const aiIdx = result.indexOf('added_iso:');
    expect(idIdx).toBeLessThan(pfIdx);
    expect(pfIdx).toBeLessThan(stIdx);
    expect(stIdx).toBeLessThan(catIdx);
    expect(catIdx).toBeLessThan(srIdx);
    expect(srIdx).toBeLessThan(fidIdx);
    expect(fidIdx).toBeLessThan(aiIdx);
  });

  it('F3: string values are double-quoted (JSON-safe escaping)', () => {
    const entryWithQuote = { ...baseEntry, id: 'US123-cls"1' };
    const result = formatEntry(entryWithQuote);
    expect(result).toContain('"US123-cls\\"1"');
  });
});

// ---------------------------------------------------------------------------
// S1-S2: stringifyCorpus round-trip
// ---------------------------------------------------------------------------

describe('stringifyCorpus — round-trip (S1-S2)', () => {
  it('S1: empty corpus produces importable module with TEST_CASES_QUARANTINE = []', async () => {
    const content = stringifyCorpus([]);
    const outPath = path.join(tmpDir, 'empty-corpus.js');
    fs.writeFileSync(outPath, content);
    const mod = await reimport(outPath);
    expect(mod.TEST_CASES_QUARANTINE).toEqual([]);
  });

  it('S2: non-empty corpus round-trips to deep-equal original', async () => {
    const entries = [
      {
        id: 'US11427642-claims-1',
        patentFile: './tests/fixtures/US11427642.json',
        selectedText: 'sample',
        category: 'claims',
        stable_runs: 2,
        source_triage_finding_id: 'run1-iter-1',
        added_iso: '2026-05-27T12:00:00.000Z',
      },
      {
        id: 'US11427642-claims-2',
        patentFile: './tests/fixtures/US11427642.json',
        selectedText: 'another sample',
        category: 'claims',
        stable_runs: 1,
        source_triage_finding_id: 'run1-iter-2',
        added_iso: '2026-05-27T13:00:00.000Z',
      },
    ];
    const content = stringifyCorpus(entries);
    const outPath = path.join(tmpDir, 'non-empty-corpus.js');
    fs.writeFileSync(outPath, content);
    const mod = await reimport(outPath);
    expect(mod.TEST_CASES_QUARANTINE).toEqual(entries);
  });
});

// ---------------------------------------------------------------------------
// Q1-Q9: --escalate-stable-runs-reset 1 --case <id> (Phase 45-03 FLAKE-03)
// ---------------------------------------------------------------------------

/**
 * Spawn the quarantine-append CLI synchronously.
 * Returns { status, stdout, stderr } — never throws on non-zero exit.
 */
function runCli(args, env = {}) {
  return spawnSync('node', [__SCRIPT_PATH, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

/**
 * Write a one-entry corpus seed under tmpDir and return the absolute path.
 * Used as QUARANTINE_CORPUS_PATH_OVERRIDE for happy-path / case-not-found tests.
 */
function writeCorpusSeed(localTmpDir, entries) {
  const corpus = path.join(localTmpDir, 'test-cases-quarantine-q.js');
  fs.writeFileSync(corpus, stringifyCorpus(entries));
  return corpus;
}

describe('--escalate-stable-runs-reset 1 --case <id> (Phase 45-03 FLAKE-03)', () => {
  it('Q1: missing value rejected (exit 2 + stderr substring)', () => {
    const corpus = writeCorpusSeed(tmpDir, []);
    const r = runCli(['--escalate-stable-runs-reset'], { QUARANTINE_CORPUS_PATH_OVERRIDE: corpus });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('missing value for --escalate-stable-runs-reset');
  });

  it('Q2: equals syntax rejected (exit 2 + stderr substring)', () => {
    const corpus = writeCorpusSeed(tmpDir, []);
    const r = runCli(['--escalate-stable-runs-reset=1', '--case', 'foo'], {
      QUARANTINE_CORPUS_PATH_OVERRIDE: corpus,
    });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('equals syntax not supported');
  });

  it('Q3: non-1 value rejected (exit 2 + stderr substring)', () => {
    const corpus = writeCorpusSeed(tmpDir, []);
    const r = runCli(['--escalate-stable-runs-reset', '2', '--case', 'foo'], {
      QUARANTINE_CORPUS_PATH_OVERRIDE: corpus,
    });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('only accepts value 1');
  });

  it('Q4: missing --case rejected (exit 2 + stderr substring)', () => {
    const corpus = writeCorpusSeed(tmpDir, []);
    const r = runCli(['--escalate-stable-runs-reset', '1'], {
      QUARANTINE_CORPUS_PATH_OVERRIDE: corpus,
    });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('--case <id> is required');
  });

  it('Q5: mutual exclusion with --input (exit 2 + stderr substring)', () => {
    const corpus = writeCorpusSeed(tmpDir, []);
    const r = runCli(
      ['--input', 'tests/e2e/fixtures/anything.json', '--escalate-stable-runs-reset', '1', '--case', 'foo'],
      { QUARANTINE_CORPUS_PATH_OVERRIDE: corpus },
    );
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('mutually exclusive');
  });

  it('Q6: case-id not found in corpus (exit 1 + stderr substring)', () => {
    const corpus = writeCorpusSeed(tmpDir, []);
    const r = runCli(['--escalate-stable-runs-reset', '1', '--case', 'missing-id'], {
      QUARANTINE_CORPUS_PATH_OVERRIDE: corpus,
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('case-id missing-id not found in corpus');
  });

  it('Q7: happy path — stable_runs reset to 1; added_iso preserved verbatim; stdout substring', async () => {
    const seedEntry = {
      id: 'foo',
      patentFile: './tests/fixtures/foo.json',
      selectedText: 'bar',
      category: 'claims',
      stable_runs: 5,
      source_triage_finding_id: 'src-1',
      added_iso: '2026-01-01T00:00:00.000Z',
    };
    const corpus = writeCorpusSeed(tmpDir, [seedEntry]);
    const r = runCli(['--escalate-stable-runs-reset', '1', '--case', 'foo'], {
      QUARANTINE_CORPUS_PATH_OVERRIDE: corpus,
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('reset stable_runs=1 for foo');
    const mod = await reimport(corpus);
    expect(mod.TEST_CASES_QUARANTINE).toHaveLength(1);
    expect(mod.TEST_CASES_QUARANTINE[0].stable_runs).toBe(1);
    expect(mod.TEST_CASES_QUARANTINE[0].added_iso).toBe('2026-01-01T00:00:00.000Z');
    // Other fields preserved verbatim
    expect(mod.TEST_CASES_QUARANTINE[0].patentFile).toBe('./tests/fixtures/foo.json');
    expect(mod.TEST_CASES_QUARANTINE[0].selectedText).toBe('bar');
    expect(mod.TEST_CASES_QUARANTINE[0].category).toBe('claims');
    expect(mod.TEST_CASES_QUARANTINE[0].source_triage_finding_id).toBe('src-1');
  });

  it('Q8: case-id with special chars (kebab + digits) passes through verbatim', async () => {
    const caseId = 'US11427642-spec-short-1';
    const seedEntry = {
      id: caseId,
      patentFile: './tests/fixtures/US11427642.json',
      selectedText: 'sample',
      category: 'claims',
      stable_runs: 3,
      source_triage_finding_id: 'src-2',
      added_iso: '2026-02-15T08:00:00.000Z',
    };
    const corpus = writeCorpusSeed(tmpDir, [seedEntry]);
    const r = runCli(['--escalate-stable-runs-reset', '1', '--case', caseId], {
      QUARANTINE_CORPUS_PATH_OVERRIDE: corpus,
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(`reset stable_runs=1 for ${caseId}`);
    const mod = await reimport(corpus);
    expect(mod.TEST_CASES_QUARANTINE[0].id).toBe(caseId);
    expect(mod.TEST_CASES_QUARANTINE[0].stable_runs).toBe(1);
  });

  it('Q9: existing --input mode unchanged (regression guard — does NOT enter new branch)', () => {
    const corpus = writeCorpusSeed(tmpDir, []);
    // --input alone (no reset/case flags) should hit the existing Phase 35 path.
    // We point at a non-existent path under fixtures so the script exits 1 with
    // the Phase 35 "input file not found" error — proving we did NOT divert to
    // the new branch (which would have exit 2 "missing --input" or similar).
    const r = runCli(
      ['--input', 'tests/e2e/fixtures/nonexistent-triage-report.json'],
      { QUARANTINE_CORPUS_PATH_OVERRIDE: corpus },
    );
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('input file not found');
    // Critically: stderr must NOT mention the new flag — that would mean the
    // new branch was entered.
    expect(r.stderr).not.toContain('escalate-stable-runs-reset');
  });
});

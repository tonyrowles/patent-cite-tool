// tests/e2e/scripts/e2e-quarantine-append.test.js
//
// Phase 35 Plan 35-04 (QUAR-02) — spawnSync CLI integration tests for
// scripts/quarantine-append.mjs.
//
// Tests G1-G3: flag validation (equals/missing-value/path-bound)
// Tests G4-G5: input-file and sibling-missing error paths
// Test  G6: happy-path (WR-07 stderr-absence)
// Test  G7: mock-gh transcript — NO --add-label on first upsert (stable_runs=1)
// Test  G8: mock-gh transcript — --add-label appears on third run (stable_runs=3)
//
// Isolation strategy: QUARANTINE_CORPUS_PATH_OVERRIDE env var redirects the
// corpus write to a tmpDir file, so the committed tests/e2e/test-cases-quarantine.js
// is NEVER mutated. Fixtures (triage/llm/rerun) are copied to ARTIFACTS_DIR/runId/
// to satisfy the WR-05 path-bound check.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const SCRIPT_PATH = path.resolve(PROJECT_ROOT, 'scripts/quarantine-append.mjs');
const FIXTURE_DIR = path.resolve(PROJECT_ROOT, 'tests/e2e/fixtures');
const ARTIFACTS_DIR = path.resolve(PROJECT_ROOT, 'tests/e2e/artifacts');

// ---------------------------------------------------------------------------
// Test isolation setup
// ---------------------------------------------------------------------------

let runDir;       // artifacts/test-<id>/ — WR-05 compliant input location
let mockGhDir;    // tmpDir for mock-gh binary + transcript
let transcriptPath;
let corpusOverridePath; // QUARANTINE_CORPUS_PATH_OVERRIDE — isolates corpus writes

beforeEach(() => {
  const runId = 'test-' + Math.random().toString(36).slice(2, 10);
  runDir = path.join(ARTIFACTS_DIR, runId);
  fs.mkdirSync(runDir, { recursive: true });

  // Copy the three Phase 35 fixtures into runDir.
  fs.copyFileSync(path.join(FIXTURE_DIR, 'phase35-triage-report.json'), path.join(runDir, 'triage-report.json'));
  fs.copyFileSync(path.join(FIXTURE_DIR, 'phase35-llm-report.json'), path.join(runDir, 'llm-report.json'));
  fs.copyFileSync(path.join(FIXTURE_DIR, 'phase35-rerun-report.json'), path.join(runDir, 'rerun-report.json'));

  // Mock-gh: logs all args to transcript; issue list returns a fake issue array.
  mockGhDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pct-quar-mockgh-'));
  transcriptPath = path.join(mockGhDir, 'gh-transcript.txt');
  const mockGhPath = path.join(mockGhDir, 'gh');
  const mockGhBody = [
    '#!/usr/bin/env bash',
    'echo "$@" >> "' + transcriptPath + '"',
    'case "$1" in',
    '  issue)',
    '    case "$2" in',
    '      list) echo \'[{"number":42,"body":"<!-- fp: abc123def456 -->","title":"test"}]\' ;;',
    '      create) echo "https://github.com/test/test/issues/42" ;;',
    '      edit) echo "https://github.com/test/test/issues/42" ;;',
    '    esac ;;',
    '  --version) echo "gh version 2.83.1 (mock)" ;;',
    'esac',
  ].join('\n') + '\n';
  fs.writeFileSync(mockGhPath, mockGhBody, { mode: 0o755 });

  // Corpus override: fresh empty seed in tmpDir — never touches committed file.
  corpusOverridePath = path.join(mockGhDir, 'test-cases-quarantine.js');
  fs.writeFileSync(corpusOverridePath, '// AUTO-MANAGED\nexport const TEST_CASES_QUARANTINE = [];\n');
});

afterEach(() => {
  fs.rmSync(runDir, { recursive: true, force: true });
  fs.rmSync(mockGhDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Spawn helper
// ---------------------------------------------------------------------------

function spawnAppend(args, extraEnv = {}) {
  return spawnSync('node', [SCRIPT_PATH, ...args], {
    env: {
      ...process.env,
      PATH: mockGhDir + ':' + process.env.PATH,
      GITHUB_REPOSITORY: 'test/test',
      QUARANTINE_CORPUS_PATH_OVERRIDE: corpusOverridePath,
      ...extraEnv,
    },
    encoding: 'utf8',
    timeout: 5000,
  });
}

// ---------------------------------------------------------------------------
// G1-G5: flag validation + error paths
// ---------------------------------------------------------------------------

describe('quarantine-append CLI — flag validation (G1-G5)', () => {
  it('G1: --input= (equals syntax) exits 2, stderr matches /equals/i', () => {
    const r = spawnAppend(['--input=foo']);
    expect(r.status).toBe(2);
    expect(r.stderr || '').toMatch(/equals/i);
  });

  it('G2: --input with no value exits 2, stderr matches /missing value/i', () => {
    const r = spawnAppend(['--input']);
    expect(r.status).toBe(2);
    expect(r.stderr || '').toMatch(/missing value/i);
  });

  it('G3: --input /etc/passwd exits 1, stderr matches /must reside under/i', () => {
    const r = spawnAppend(['--input', '/etc/passwd']);
    expect(r.status).toBe(1);
    expect(r.stderr || '').toMatch(/must reside under/i);
  });

  it('G4: --input to non-existent file exits 1, stderr matches /not found|missing/i', () => {
    const missingPath = path.join(ARTIFACTS_DIR, 'does-not-exist.json');
    const r = spawnAppend(['--input', missingPath]);
    expect(r.status).toBe(1);
    expect(r.stderr || '').toMatch(/not found|missing/i);
  });

  it('G5: missing sibling files exits 1, stderr matches /missing sibling/i', () => {
    // Copy only triage-report.json — no llm/rerun siblings.
    const siblingsDir = path.join(ARTIFACTS_DIR, 'nosiblings-' + Date.now());
    fs.mkdirSync(siblingsDir, { recursive: true });
    fs.copyFileSync(
      path.join(FIXTURE_DIR, 'phase35-triage-report.json'),
      path.join(siblingsDir, 'triage-report.json'),
    );
    try {
      const r = spawnAppend(['--input', path.join(siblingsDir, 'triage-report.json')]);
      expect(r.status).toBe(1);
      expect(r.stderr || '').toMatch(/missing sibling/i);
    } finally {
      fs.rmSync(siblingsDir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// G6: happy path — WR-07 stderr-absence
// ---------------------------------------------------------------------------

describe('quarantine-append CLI — happy path (G6)', () => {
  it('G6: valid --input exits 0, no rejection stderr signatures (WR-07)', () => {
    const r = spawnAppend(['--input', path.join(runDir, 'triage-report.json')]);
    expect(r.status).toBe(0);
    const stderr = r.stderr || '';
    expect(stderr).not.toMatch(/equals syntax not supported for --input/i);
    expect(stderr).not.toMatch(/missing value for --input/i);
  });
});

// ---------------------------------------------------------------------------
// G7: mock-gh transcript — NO --add-label on first run (stable_runs=1)
// ---------------------------------------------------------------------------

describe('quarantine-append CLI — mock-gh transcript (G7)', () => {
  it('G7: first run does NOT produce --add-label in transcript (stable_runs=1, below threshold)', () => {
    spawnAppend(['--input', path.join(runDir, 'triage-report.json')]);
    const transcript = fs.existsSync(transcriptPath)
      ? fs.readFileSync(transcriptPath, 'utf8')
      : '';
    // stable_runs === 1 after first run — no label should be added
    expect(transcript).not.toMatch(/--add-label/i);
  });
});

// ---------------------------------------------------------------------------
// G8: mock-gh transcript — --add-label appears on third run (stable_runs=3)
// ---------------------------------------------------------------------------

describe('quarantine-append CLI — stable_runs label dispatch (G8)', () => {
  it('G8: third run adds quarantine:ready-for-promotion label in mock-gh transcript', () => {
    const triagePath = path.join(runDir, 'triage-report.json');

    // Run 1: stable_runs → 1
    const r1 = spawnAppend(['--input', triagePath]);
    expect(r1.status).toBe(0);

    // Run 2: stable_runs → 2
    const r2 = spawnAppend(['--input', triagePath]);
    expect(r2.status).toBe(0);

    // Run 3: stable_runs → 3; label should be added
    const r3 = spawnAppend(['--input', triagePath]);
    expect(r3.status).toBe(0);

    const transcript = fs.existsSync(transcriptPath)
      ? fs.readFileSync(transcriptPath, 'utf8')
      : '';

    // At stable_runs === 3, addLabel is called. The mock-gh receives args as
    // "$@" which bash expands without shell quoting. The label value appears
    // as an unquoted word in the transcript.
    expect(transcript).toMatch(/issue edit(?: --repo \S+)? \d+ --add-label quarantine:ready-for-promotion/);
  });
});

// ---------------------------------------------------------------------------
// G9: Phase 59 Plan 59-01 — MUTATOR-04 source-tag suppression (Pitfall 8
// LOAD-BEARING). Co-designed with tests/e2e/scripts/inject-defect.mjs in the
// SAME commit per REQUIREMENTS.md MUTATOR-04 wording. The discriminator is
// finalEntry.source_triage_finding_id.startsWith('fixture-mutator-uat-47b'),
// which propagates from the synthetic triage report's run_id (set by
// inject-defect.mjs to the literal 'fixture-mutator-uat-47b').
// ---------------------------------------------------------------------------

describe('quarantine-append CLI — MUTATOR-04 source-tag suppression (G9)', () => {
  it('G9-a: synthetic entry crossing stable_runs threshold does NOT add the promotion label', () => {
    // Pre-seed corpus with a stable_runs=2 entry whose
    // source_triage_finding_id matches the fixture-mutator-uat-47b prefix.
    // The triage-report fixture's iter-1 produces case-id
    // US11427642-spec-short-1 (sanitized), so the upsert path will find this
    // entry and increment stable_runs to 3 — which WOULD trigger label-add
    // without the MUTATOR-04 suppression.
    fs.writeFileSync(
      corpusOverridePath,
      '// AUTO-MANAGED\nexport const TEST_CASES_QUARANTINE = [\n' +
        '  {\n' +
        '    id: "US11427642-spec-short-1",\n' +
        '    patentFile: "./tests/fixtures/US11427642.json",\n' +
        '    selectedText: "receptor exclusively expressed on plasma cells and plasmablasts",\n' +
        '    category: "WRONG_CITATION",\n' +
        '    stable_runs: 2,\n' +
        '    source_triage_finding_id: "fixture-mutator-uat-47b-iter-1",\n' +
        '    added_iso: "2026-06-05T00:00:00.000Z"\n' +
        '  }\n' +
        '];\n',
    );

    const r = spawnAppend(['--input', path.join(runDir, 'triage-report.json')]);
    expect(r.status).toBe(0);

    const transcript = fs.existsSync(transcriptPath)
      ? fs.readFileSync(transcriptPath, 'utf8')
      : '';

    // MUTATOR-04 invariant: the synthetic-tagged entry, even at
    // stable_runs >= STABLE_RUNS_THRESHOLD, MUST NOT receive the
    // quarantine:ready-for-promotion label.
    expect(transcript).not.toMatch(
      /--add-label quarantine:ready-for-promotion/,
    );
  });

  it('G9-b: non-mutator entry crossing the same threshold STILL adds the label (negative control)', () => {
    // Same shape as G9-a but with a non-mutator source tag. Proves the
    // suppression is targeted (anchored-equality regex post-REVIEW-FIX
    // WR-04; was startsWith pre-REVIEW-FIX) rather than broad.
    fs.writeFileSync(
      corpusOverridePath,
      '// AUTO-MANAGED\nexport const TEST_CASES_QUARANTINE = [\n' +
        '  {\n' +
        '    id: "US11427642-spec-short-1",\n' +
        '    patentFile: "./tests/fixtures/US11427642.json",\n' +
        '    selectedText: "receptor exclusively expressed on plasma cells and plasmablasts",\n' +
        '    category: "WRONG_CITATION",\n' +
        '    stable_runs: 2,\n' +
        '    source_triage_finding_id: "real-pipeline-2026-06-05-iter-1",\n' +
        '    added_iso: "2026-06-05T00:00:00.000Z"\n' +
        '  }\n' +
        '];\n',
    );

    const r = spawnAppend(['--input', path.join(runDir, 'triage-report.json')]);
    expect(r.status).toBe(0);

    const transcript = fs.existsSync(transcriptPath)
      ? fs.readFileSync(transcriptPath, 'utf8')
      : '';

    // Negative control: real-pipeline source_triage_finding_id at
    // stable_runs===3 must still produce the label-add call.
    expect(transcript).toMatch(
      /issue edit(?: --repo \S+)? \d+ --add-label quarantine:ready-for-promotion/,
    );
  });

  // Phase 59 REVIEW-FIX WR-04: equals-vs-startsWith regression pin.
  // Pre-REVIEW-FIX `source_triage_finding_id.startsWith('fixture-mutator-uat-47b')`
  // would have INCORRECTLY suppressed an entry whose source_triage_finding_id
  // started with the literal but was NOT a mutator iter-N tag — e.g. a future
  // Phase 6X UAT named `fixture-mutator-uat-47b-v2-iter-1` or
  // `fixture-mutator-uat-47b-extension-2026-iter-3`. The post-REVIEW-FIX
  // anchored regex `/^fixture-mutator-uat-47b-iter-\d+$/` rejects these as
  // NOT a match — meaning they DO receive the
  // quarantine:ready-for-promotion label like any other real entry at
  // stable_runs >= 3. This test pins that behaviour so a future loosening
  // back to startsWith trips the assertion.
  it('G9-c: entry with prefix `fixture-mutator-uat-47b-` but NOT matching iter-N regex STILL adds the label (equals-vs-startsWith pin)', () => {
    fs.writeFileSync(
      corpusOverridePath,
      '// AUTO-MANAGED\nexport const TEST_CASES_QUARANTINE = [\n' +
        '  {\n' +
        '    id: "US11427642-spec-short-1",\n' +
        '    patentFile: "./tests/fixtures/US11427642.json",\n' +
        '    selectedText: "receptor exclusively expressed on plasma cells and plasmablasts",\n' +
        '    category: "WRONG_CITATION",\n' +
        '    stable_runs: 2,\n' +
        '    source_triage_finding_id: "fixture-mutator-uat-47b-extension-2026-iter-1",\n' +
        '    added_iso: "2026-06-05T00:00:00.000Z"\n' +
        '  }\n' +
        '];\n',
    );

    const r = spawnAppend(['--input', path.join(runDir, 'triage-report.json')]);
    expect(r.status).toBe(0);

    const transcript = fs.existsSync(transcriptPath)
      ? fs.readFileSync(transcriptPath, 'utf8')
      : '';

    // WR-04 invariant: a `fixture-mutator-uat-47b-extension-2026-iter-1`
    // tag is NOT the canonical SOURCE_TAG, so the anchored regex rejects
    // it. The entry at stable_runs===3 receives the promotion label like
    // any other real-pipeline entry. Under the pre-REVIEW-FIX startsWith
    // check this would have been silently suppressed — proving the WR-04
    // tightening is load-bearing.
    expect(transcript).toMatch(
      /issue edit(?: --repo \S+)? \d+ --add-label quarantine:ready-for-promotion/,
    );
  });
});

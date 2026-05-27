/**
 * tests/unit/update-golden-case-flag.test.js
 *
 * Phase 35 Plan 35-00 (QUAR-05) — Vitest coverage for the --case <id> flag
 * added to scripts/update-golden.js.
 *
 * Tests cover:
 *   1. Per-case regen: updates only the targeted key; all other entries byte-identical
 *   2. Equals syntax (--case=foo): exits 2 + stderr /equals/i
 *   3. Missing trailing value (--case --confirm): exits 2 + stderr /missing value/i
 *   4. No-match id: exits 1 + stderr /matched no entry/i; baseline untouched
 *   5. All-cases preserved (no --case): all TEST_CASES ids appear in resulting baseline
 *   6. --case without --confirm: exits 1 + safety-check message in stderr
 *
 * WR-07 stderr-absence guard on the per-case happy path (Test 1): after a
 * successful --case <valid-id> --confirm run, asserts stderr does NOT contain
 * the rejection signatures for equals syntax or missing value.
 *
 * Analog: tests/e2e/scripts/e2e-rerun-validator.test.js (spawnSync + tmpDir pattern).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = path.resolve(__dirname, '../../scripts/update-golden.js');
const BASELINE_PATH = path.resolve(__dirname, '../../tests/golden/baseline.json');
const PROJECT_ROOT = path.resolve(__dirname, '../..');

// A valid TEST_CASES id that we know exists in tests/test-cases.js
const VALID_CASE_ID = 'US11427642-spec-short-1';

// A valid-format id (passes regex) that does NOT exist in TEST_CASES.
// Format must match /^[A-Z]{2,}\d+[A-Z]?\d*-[a-z0-9-]+$/ — use a numeric patent id.
const NO_MATCH_CASE_ID = 'US99999999-no-match-99';

/**
 * Spawn the update-golden.js CLI with the given args.
 * 30000ms timeout allows for PDF parsing even on slower CI machines.
 * cwd is set to PROJECT_ROOT so relative imports in the script resolve correctly.
 */
function spawnUpdateGolden(args) {
  return spawnSync('node', [SCRIPT_PATH, ...args], {
    encoding: 'utf8',
    timeout: 30000,
    cwd: PROJECT_ROOT,
  });
}

// ---------------------------------------------------------------------------
// Test 1: Per-case path — updates only the targeted key; other entries byte-identical
// ---------------------------------------------------------------------------

describe('--case per-case path (Phase 35 QUAR-05)', () => {
  let originalBaseline;

  beforeEach(() => {
    // Capture the baseline.json contents before the test modifies it.
    originalBaseline = fs.readFileSync(BASELINE_PATH, 'utf-8');
  });

  afterEach(() => {
    // Restore baseline.json to the original pre-test state after every test
    // so we never leave committed files mutated.
    fs.writeFileSync(BASELINE_PATH, originalBaseline, 'utf-8');
  });

  it('Test 1: per-case regen updates ONLY the targeted key; all other entries byte-identical', () => {
    // Parse the pre-run baseline to compare all other keys after the run.
    const baselineBefore = JSON.parse(originalBaseline);

    const r = spawnUpdateGolden(['--case', VALID_CASE_ID, '--confirm']);

    // Verify successful exit
    expect(r.status).toBe(0);

    // WR-07 stderr-absence: verify the case id was ACCEPTED (not rejected by parseArgs).
    const stderrText = r.stderr || '';
    expect(stderrText).not.toMatch(/equals syntax not supported for --case/i);
    expect(stderrText).not.toMatch(/missing value for --case/i);

    // Read the resulting baseline.json
    const baselineAfter = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf-8'));

    // The targeted key must be present (it may or may not have changed value —
    // we just verify it was written and all other keys are byte-identical).
    expect(Object.prototype.hasOwnProperty.call(baselineAfter, VALID_CASE_ID)).toBe(true);

    // All other keys must be byte-identical — Pitfall 5 mitigation.
    for (const key of Object.keys(baselineBefore)) {
      if (key === VALID_CASE_ID) continue; // this key was intentionally updated
      expect(JSON.stringify(baselineAfter[key])).toBe(
        JSON.stringify(baselineBefore[key]),
        `Key "${key}" changed unexpectedly after per-case run`,
      );
    }

    // Key count must be identical (no new keys, no removed keys).
    expect(Object.keys(baselineAfter).length).toBe(Object.keys(baselineBefore).length);
  });
});

// ---------------------------------------------------------------------------
// Test 2: Equals syntax rejected with exit 2
// ---------------------------------------------------------------------------

describe('--case flag validation (Phase 35 QUAR-05)', () => {
  it('Test 2: --case=foo (equals syntax) exits 2 + stderr /equals/i', () => {
    const r = spawnUpdateGolden(['--case=foo', '--confirm']);
    expect(r.status).toBe(2);
    expect(r.stderr || '').toMatch(/equals/i);
  });

  // ---------------------------------------------------------------------------
  // Test 3: Missing trailing value exits 2
  // ---------------------------------------------------------------------------

  it('Test 3: --case with no trailing value exits 2 + stderr /missing value/i', () => {
    // --confirm is passed as the "next" token after --case — it must be
    // treated as a flag, not a case id value.
    const r = spawnUpdateGolden(['--case', '--confirm']);
    expect(r.status).toBe(2);
    expect(r.stderr || '').toMatch(/missing value/i);
  });

  // ---------------------------------------------------------------------------
  // Test 4: No-match id exits 1 + stderr /matched no entry/i; baseline untouched
  // ---------------------------------------------------------------------------

  it('Test 4: --case with unknown id exits 1 + stderr /matched no entry/i; baseline untouched', () => {
    const baselineBefore = fs.readFileSync(BASELINE_PATH, 'utf-8');

    const r = spawnUpdateGolden(['--case', NO_MATCH_CASE_ID, '--confirm']);

    expect(r.status).toBe(1);
    expect(r.stderr || '').toMatch(/matched no entry/i);

    // baseline.json must be byte-identical — Pitfall 5: never silently regenerate.
    const baselineAfter = fs.readFileSync(BASELINE_PATH, 'utf-8');
    expect(baselineAfter).toBe(baselineBefore);

    // WR-07 stderr-absence: verify no false rejection signatures appear.
    const stderrText = r.stderr || '';
    expect(stderrText).not.toMatch(/equals syntax not supported for --case/i);
    expect(stderrText).not.toMatch(/missing value for --case/i);
  });

  // ---------------------------------------------------------------------------
  // Test 6: --case without --confirm exits 1 with the safety-check message
  // ---------------------------------------------------------------------------

  it('Test 6: --case <valid-id> without --confirm exits 1 + safety-check message in stderr', () => {
    const r = spawnUpdateGolden(['--case', VALID_CASE_ID]);
    expect(r.status).toBe(1);
    // The existing safety-check message must appear.
    expect(r.stderr || '').toMatch(/--confirm/i);
  });
});

// ---------------------------------------------------------------------------
// Test 5: Without --case, all TEST_CASES ids appear in the resulting baseline
// ---------------------------------------------------------------------------

describe('all-cases preserved when --case absent (Phase 22 contract)', () => {
  let originalBaseline;

  beforeEach(() => {
    originalBaseline = fs.readFileSync(BASELINE_PATH, 'utf-8');
  });

  afterEach(() => {
    // Restore baseline.json to the pre-test state.
    fs.writeFileSync(BASELINE_PATH, originalBaseline, 'utf-8');
  });

  it('Test 5: all TEST_CASES ids appear in the resulting baseline.json', async () => {
    // Import TEST_CASES to get the full expected id list.
    const { TEST_CASES } = await import('../../tests/test-cases.js');
    const expectedIds = TEST_CASES.map((tc) => tc.id);

    const r = spawnUpdateGolden(['--confirm']);
    expect(r.status).toBe(0);

    const baselineAfter = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf-8'));
    const resultIds = Object.keys(baselineAfter);

    for (const id of expectedIds) {
      expect(resultIds).toContain(id);
    }

    // Number of keys in baseline must match TEST_CASES count.
    expect(resultIds.length).toBe(expectedIds.length);
  }, 120000); // extended timeout for full 76-case regen
});

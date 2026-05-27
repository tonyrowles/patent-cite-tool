/**
 * Schema-drift static guard for the quarantine corpus.
 *
 * Phase 35 Plan 35-02 (QUAR-01). Locks the per-entry schema contract BEFORE
 * scripts/quarantine-append.mjs writes the first entry. Passes vacuously on
 * the empty-array seed (Tests 2-5 are vacuous when corpus is empty).
 *
 * Non-vacuous tests on initial commit: Tests 1, 6, 7.
 *
 * Schema contract:
 *   CANONICAL_KEYS      = ['id', 'patentFile', 'selectedText', 'category']
 *   QUARANTINE_ONLY_KEYS = ['stable_runs', 'source_triage_finding_id', 'added_iso']
 *   Total = 7 keys exactly per entry.
 *
 * See: .planning/phases/35-rich-issue-filer-+-quarantine-corpus/35-CONTEXT.md (D-09, D-10)
 */

import { describe, it, expect } from 'vitest';
import { TEST_CASES } from '../../tests/test-cases.js';
import { TEST_CASES_QUARANTINE } from '../../tests/e2e/test-cases-quarantine.js';

const CANONICAL_KEYS       = ['id', 'patentFile', 'selectedText', 'category'];
const QUARANTINE_ONLY_KEYS = ['stable_runs', 'source_triage_finding_id', 'added_iso'];
const ID_REGEX             = /^[A-Z]{2,}\d+[A-Z]?\d*-[a-z0-9-]+$/;
const ISO_REGEX            = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;

/**
 * Validates a single quarantine entry against the schema contract.
 * Returns { valid: true } on success or { valid: false, reason: string } on failure.
 * Used by the negative-path Test 7 only — NOT exported.
 */
function validateEntry(entry) {
  if (typeof entry !== 'object' || entry === null) {
    return { valid: false, reason: 'entry is not an object' };
  }
  const keys = new Set(Object.keys(entry));
  for (const k of CANONICAL_KEYS) {
    if (!keys.has(k)) return { valid: false, reason: `missing canonical key: ${k}` };
  }
  for (const k of QUARANTINE_ONLY_KEYS) {
    if (!keys.has(k)) return { valid: false, reason: `missing quarantine-only key: ${k}` };
  }
  const expectedSize = CANONICAL_KEYS.length + QUARANTINE_ONLY_KEYS.length;
  if (keys.size !== expectedSize) {
    return { valid: false, reason: `expected ${expectedSize} keys, got ${keys.size}` };
  }
  return { valid: true };
}

describe('test-cases-quarantine.js schema (Phase 35 QUAR-01)', () => {

  // Test 1: Canonical keys baseline — guards against tests/test-cases.js drifting independently
  it('TEST_CASES sample entry carries all 4 canonical keys', () => {
    expect(Array.isArray(TEST_CASES)).toBe(true);
    expect(TEST_CASES.length).toBeGreaterThan(0);
    const goldenKeys = new Set(Object.keys(TEST_CASES[0]));
    for (const k of CANONICAL_KEYS) {
      expect(goldenKeys.has(k), `canonical key "${k}" missing from TEST_CASES[0]`).toBe(true);
    }
  });

  // Test 2: Positive invariant on every quarantine entry — exactly 7 keys
  it('every quarantine entry has exactly 4 canonical + 3 quarantine-only keys (7 total)', () => {
    for (const entry of TEST_CASES_QUARANTINE) {
      const keys = new Set(Object.keys(entry));
      for (const k of CANONICAL_KEYS) {
        expect(keys.has(k), `canonical key "${k}" missing from entry ${entry.id}`).toBe(true);
      }
      for (const k of QUARANTINE_ONLY_KEYS) {
        expect(keys.has(k), `quarantine-only key "${k}" missing from entry ${entry.id}`).toBe(true);
      }
      expect(keys.size).toBe(CANONICAL_KEYS.length + QUARANTINE_ONLY_KEYS.length);
    }
  });

  // Test 3: id regex — every entry.id must match the patent case-id pattern
  it('every quarantine entry id matches the case-id regex', () => {
    for (const entry of TEST_CASES_QUARANTINE) {
      expect(entry.id).toMatch(ID_REGEX);
    }
  });

  // Test 4: stable_runs is a positive integer (≥ 1)
  it('every quarantine entry stable_runs is a positive integer', () => {
    for (const entry of TEST_CASES_QUARANTINE) {
      expect(Number.isInteger(entry.stable_runs), `stable_runs is not integer in entry ${entry.id}`).toBe(true);
      expect(entry.stable_runs).toBeGreaterThanOrEqual(1);
    }
  });

  // Test 5: added_iso is ISO 8601 string (anti-pattern guard: rejects number/garbage values)
  it('every quarantine entry added_iso is a valid ISO 8601 timestamp string', () => {
    for (const entry of TEST_CASES_QUARANTINE) {
      expect(typeof entry.added_iso, `added_iso must be a string in entry ${entry.id}`).toBe('string');
      expect(entry.added_iso).toMatch(ISO_REGEX);
      expect(Number.isFinite(Date.parse(entry.added_iso))).toBe(true);
    }
  });

  // Test 6: vacuous-empty pass — empty corpus must satisfy all prior tests vacuously
  it('empty corpus passes all schema tests vacuously (seed state)', () => {
    // If the corpus is empty, Tests 2-5 produce no assertions (vacuously true).
    // This test explicitly documents and asserts the initial seed state.
    expect(Array.isArray(TEST_CASES_QUARANTINE)).toBe(true);
    // All entries (zero of them) trivially satisfy the invariant.
    const invalidEntries = TEST_CASES_QUARANTINE.filter(e => !validateEntry(e).valid);
    expect(invalidEntries).toHaveLength(0);
  });

  // Test 7: negative-path schema drift — RUNTIME INJECTION (Pitfall 4 deterministic-diff safeguard)
  it('validateEntry rejects entries with extra keys (schema drift detected)', () => {
    // Known-good entry: exactly 7 keys, all required
    const goodEntry = {
      id: 'US12345678-claims-1',
      patentFile: './tests/fixtures/US12345678.json',
      selectedText: 'example selected text from the patent specification',
      category: 'claims',
      stable_runs: 1,
      source_triage_finding_id: '20260527T120000Z-iter-3',
      added_iso: '2026-01-01T00:00:00.000Z',
    };
    expect(validateEntry(goodEntry)).toEqual({ valid: true });

    // Known-bad entry: same as above but with an extra key (schema drift)
    const driftedEntry = {
      id: 'US123-x',
      patentFile: './x.json',
      selectedText: 's',
      category: 'c',
      stable_runs: 1,
      source_triage_finding_id: 'f',
      added_iso: '2026-01-01T00:00:00.000Z',
      EXTRA_KEY: 'bad',
    };
    const result = validateEntry(driftedEntry);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/expected 7 keys, got 8/);
  });

});

// tests/unit/a-b-winner.test.js
//
// Phase 54 Plan 01 (AB-04) — pin the operator-triggered A/B winner-declaration
// CLI shipped in scripts/a-b-winner.mjs.
//
// PIN MATRIX (D-14..D-21 traceable + abstention-mode pin per D-20):
//
//   Test 1  Empty ledger        → NO_WINNER_YET\n + exit 0
//   Test 2  Insufficient sample → NO_WINNER_YET (3 entries < threshold 20)
//   Test 3  D-19 filter         → NO_WINNER_YET (25 entries lacking model/errorClass)
//   Test 4  ABSTENTION MODE     → NO_WINNER_YET (25 entries with model+errorClass
//                                  but NO outcome field — D-20)
//   Test 5  Markdown table      → emits the locked column header when synthetic
//                                  forward-compat outcome field is present and
//                                  per-arm samples ≥ 20 (forward-compat pin per
//                                  the Task 4 action plan)
//   Test 6  Tie detection       → winner='tie' when |delta| < 0.05
//   Test 7  Alphabetical sort   → A_CLASS appears before B_CLASS in output
//   Test 8  Constant pin        → static-grep `^const N_PER_ARM_REQUIRED = 20;`
//                                  appears exactly once and on a top-level line
//   Test 9  Imports pin         → grep ^import shows only `node:fs` (D-21)
//
// All synthetic ledger fixtures are written to os.tmpdir() inside the test;
// no mutation of the committed ledger ever occurs.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseArgs,
  readLedgerEntries,
  filterAttributableEntries,
  computePerClassPerArm,
  anyClassInsufficient,
  declareWinner,
  formatMarkdownTable,
  main,
} from '../../scripts/a-b-winner.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT_PATH = path.join(REPO_ROOT, 'scripts', 'a-b-winner.mjs');

// ---------------------------------------------------------------------------
// Synthetic-fixture helpers
// ---------------------------------------------------------------------------

const tmpFiles = [];

function writeTmpLedger(payload) {
  const tmp = path.join(
    os.tmpdir(),
    `a-b-winner-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
  );
  fs.writeFileSync(tmp, JSON.stringify(payload), 'utf8');
  tmpFiles.push(tmp);
  return tmp;
}

function makeLedgerPayload(iterations) {
  return {
    version: 1,
    months: {
      '2026-06': {
        invocations: iterations.length,
        total_usd: 0,
        last_invocation_iso: '2026-06-04T00:00:00.000Z',
        iterations,
      },
    },
  };
}

afterEach(() => {
  while (tmpFiles.length > 0) {
    const f = tmpFiles.pop();
    try { fs.unlinkSync(f); } catch { /* ignore */ }
  }
});

// ---------------------------------------------------------------------------
// Test 1 — empty ledger → NO_WINNER_YET
// ---------------------------------------------------------------------------

describe('Phase 54 AB-04: Test 1 — empty ledger emits NO_WINNER_YET', () => {
  it('emits NO_WINNER_YET when months is empty object', () => {
    const tmp = writeTmpLedger({ version: 1, months: {} });
    const result = main(['node', 'a-b-winner.mjs', '--ledger', tmp]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('NO_WINNER_YET\n');
  });

  it('emits NO_WINNER_YET when iterations array is empty', () => {
    const tmp = writeTmpLedger(makeLedgerPayload([]));
    const result = main(['node', 'a-b-winner.mjs', '--ledger', tmp]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('NO_WINNER_YET\n');
  });
});

// ---------------------------------------------------------------------------
// Test 2 — insufficient sample count → NO_WINNER_YET
// ---------------------------------------------------------------------------

describe('Phase 54 AB-04: Test 2 — insufficient samples emit NO_WINNER_YET', () => {
  it('emits NO_WINNER_YET when 3 entries have model+errorClass+outcome but n<20', () => {
    const iterations = [
      { iso: '2026-06-01T00:00:00Z', model: 'claude-sonnet-4-6', errorClass: 'WRONG_CITATION', outcome: 'pass' },
      { iso: '2026-06-02T00:00:00Z', model: 'claude-sonnet-4-6', errorClass: 'WRONG_CITATION', outcome: 'fail' },
      { iso: '2026-06-03T00:00:00Z', model: 'claude-opus-4-7',   errorClass: 'WRONG_CITATION', outcome: 'pass' },
    ];
    const tmp = writeTmpLedger(makeLedgerPayload(iterations));
    const result = main(['node', 'a-b-winner.mjs', '--ledger', tmp]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('NO_WINNER_YET\n');
  });
});

// ---------------------------------------------------------------------------
// Test 3 — D-19 filter drops pre-Phase-54 entries
// ---------------------------------------------------------------------------

describe('Phase 54 AB-04: Test 3 — D-19 filter drops entries lacking model/errorClass', () => {
  it('emits NO_WINNER_YET when 25 entries lack errorClass entirely', () => {
    const iterations = [];
    for (let i = 0; i < 25; i++) {
      iterations.push({
        iso: `2026-06-01T00:${String(i).padStart(2, '0')}:00Z`,
        model: 'claude-sonnet-4-6',
        // errorClass MISSING — pre-Phase-54 entry shape
        cost_usd: 0.001,
      });
    }
    const tmp = writeTmpLedger(makeLedgerPayload(iterations));
    const result = main(['node', 'a-b-winner.mjs', '--ledger', tmp]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('NO_WINNER_YET\n');
  });

  it('emits NO_WINNER_YET when 25 entries lack model field', () => {
    const iterations = [];
    for (let i = 0; i < 25; i++) {
      iterations.push({
        iso: `2026-06-01T00:${String(i).padStart(2, '0')}:00Z`,
        // model MISSING — pre-Phase-54 entry shape
        errorClass: 'WRONG_CITATION',
        outcome: 'pass',
      });
    }
    const tmp = writeTmpLedger(makeLedgerPayload(iterations));
    const result = main(['node', 'a-b-winner.mjs', '--ledger', tmp]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('NO_WINNER_YET\n');
  });

  it('filterAttributableEntries unit: only entries with both model+errorClass survive', () => {
    const entries = [
      { model: 'claude-sonnet-4-6', errorClass: 'WRONG_CITATION' },
      { model: 'claude-sonnet-4-6' },                            // no errorClass
      { errorClass: 'WRONG_CITATION' },                          // no model
      { model: 'claude-opus-4-7[1m]', errorClass: 'GOOGLE_DOM_DRIFT' }, // [1m] suffix OK
      { model: 'gpt-4', errorClass: 'WRONG_CITATION' },          // wrong family
      { model: 'claude-opus-4-7', errorClass: '' },              // empty errorClass
      null,
      undefined,
    ];
    const out = filterAttributableEntries(entries);
    expect(out.length).toBe(2);
    expect(out[0].errorClass).toBe('WRONG_CITATION');
    expect(out[1].errorClass).toBe('GOOGLE_DOM_DRIFT');
  });
});

// ---------------------------------------------------------------------------
// Test 4 — ABSTENTION MODE pin per D-20 (schema-gap finding)
// ---------------------------------------------------------------------------

describe('Phase 54 AB-04: Test 4 — ABSTENTION MODE (D-20 schema gap)', () => {
  it('emits NO_WINNER_YET when 25 entries have model+errorClass but NO outcome field', () => {
    const iterations = [];
    for (let i = 0; i < 25; i++) {
      iterations.push({
        iso: `2026-06-01T00:${String(i).padStart(2, '0')}:00Z`,
        model: i % 2 === 0 ? 'claude-sonnet-4-6' : 'claude-opus-4-7',
        errorClass: 'WRONG_CITATION',
        // NO outcome / success / passed / pr_merged field — current ledger schema
        cost_usd: 0.001,
        tokens_in: 100,
        tokens_out: 50,
      });
    }
    const tmp = writeTmpLedger(makeLedgerPayload(iterations));
    const result = main(['node', 'a-b-winner.mjs', '--ledger', tmp]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('NO_WINNER_YET\n');
  });

  it('computePerClassPerArm unit: returns outcomeUnavailable=true when no entry has outcome', () => {
    const filtered = [
      { model: 'claude-sonnet-4-6', errorClass: 'WRONG_CITATION' },
      { model: 'claude-opus-4-7',   errorClass: 'WRONG_CITATION' },
    ];
    const res = computePerClassPerArm(filtered);
    expect(res.outcomeUnavailable).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Test 5 — Markdown table when sample threshold AND outcome field present
// ---------------------------------------------------------------------------
// (Forward-compat per the Task 4 action plan: synthetic ledger inlines
//  fictional `outcome: 'pass'|'fail'` so the post-Phase-56 behavior is
//  pinned NOW — the script's D-20 probe finds the field and computes
//  pass-rates correctly.)

describe('Phase 54 AB-04: Test 5 — markdown table on sufficient samples (forward-compat)', () => {
  it('emits the locked column header and per-class rows', () => {
    const iterations = [];
    // 20 sonnet entries for WRONG_CITATION (12 pass, 8 fail → 0.60)
    for (let i = 0; i < 20; i++) {
      iterations.push({
        iso: '2026-06-01T00:00:00Z',
        model: 'claude-sonnet-4-6',
        errorClass: 'WRONG_CITATION',
        outcome: i < 12 ? 'pass' : 'fail',
      });
    }
    // 20 opus entries for WRONG_CITATION (10 pass, 10 fail → 0.50)
    for (let i = 0; i < 20; i++) {
      iterations.push({
        iso: '2026-06-01T00:00:00Z',
        model: 'claude-opus-4-7',
        errorClass: 'WRONG_CITATION',
        outcome: i < 10 ? 'pass' : 'fail',
      });
    }
    const tmp = writeTmpLedger(makeLedgerPayload(iterations));
    const result = main(['node', 'a-b-winner.mjs', '--ledger', tmp]);
    expect(result.exitCode).toBe(0);
    // Header row pinned exactly per D-18.
    expect(result.stdout).toContain(
      '| ERROR_CLASS | sonnet pass_rate | sonnet n | opus pass_rate | opus n | winner |',
    );
    expect(result.stdout).toContain('| --- | --- | --- | --- | --- | --- |');
    // WRONG_CITATION row: sonnet 0.60 / 20, opus 0.50 / 20, delta=0.10>=0.05 → sonnet
    expect(result.stdout).toContain('| WRONG_CITATION | 0.60 | 20 | 0.50 | 20 | sonnet |');
    // Trailing newline (D-18).
    expect(result.stdout.endsWith('\n')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Test 6 — tie detection when |delta| < 0.05
// ---------------------------------------------------------------------------

describe('Phase 54 AB-04: Test 6 — tie detection on small delta', () => {
  it('declares winner=tie when sonnet=0.50/20 and opus=0.52/25 (delta=0.02)', () => {
    const cell = {
      sonnet: { n: 20, pass: 10 },  // 0.50
      opus:   { n: 25, pass: 13 },  // 0.52
    };
    expect(declareWinner(cell)).toBe('tie');
  });

  it('declares winner=sonnet when sonnet=0.60 and opus=0.50 (delta=0.10)', () => {
    const cell = {
      sonnet: { n: 20, pass: 12 },  // 0.60
      opus:   { n: 20, pass: 10 },  // 0.50
    };
    expect(declareWinner(cell)).toBe('sonnet');
  });

  it('declares winner=opus when opus=0.70 and sonnet=0.40 (delta=0.30)', () => {
    const cell = {
      sonnet: { n: 20, pass: 8 },   // 0.40
      opus:   { n: 20, pass: 14 },  // 0.70
    };
    expect(declareWinner(cell)).toBe('opus');
  });
});

// ---------------------------------------------------------------------------
// Test 7 — alphabetical sort
// ---------------------------------------------------------------------------

describe('Phase 54 AB-04: Test 7 — alphabetical sort by ERROR_CLASS', () => {
  it('outputs A_CLASS row before B_CLASS row', () => {
    const iterations = [];
    // B_CLASS first in insertion order — should still sort to second.
    for (let i = 0; i < 20; i++) {
      iterations.push({
        iso: '2026-06-01T00:00:00Z',
        model: 'claude-sonnet-4-6',
        errorClass: 'B_CLASS',
        outcome: 'pass',
      });
      iterations.push({
        iso: '2026-06-01T00:00:00Z',
        model: 'claude-opus-4-7',
        errorClass: 'B_CLASS',
        outcome: 'pass',
      });
    }
    for (let i = 0; i < 20; i++) {
      iterations.push({
        iso: '2026-06-01T00:00:00Z',
        model: 'claude-sonnet-4-6',
        errorClass: 'A_CLASS',
        outcome: 'pass',
      });
      iterations.push({
        iso: '2026-06-01T00:00:00Z',
        model: 'claude-opus-4-7',
        errorClass: 'A_CLASS',
        outcome: 'pass',
      });
    }
    const tmp = writeTmpLedger(makeLedgerPayload(iterations));
    const result = main(['node', 'a-b-winner.mjs', '--ledger', tmp]);
    expect(result.exitCode).toBe(0);
    const aIdx = result.stdout.indexOf('| A_CLASS ');
    const bIdx = result.stdout.indexOf('| B_CLASS ');
    expect(aIdx).toBeGreaterThan(-1);
    expect(bIdx).toBeGreaterThan(-1);
    expect(aIdx).toBeLessThan(bIdx);
  });
});

// ---------------------------------------------------------------------------
// Test 8 — top-of-file constant pin
// ---------------------------------------------------------------------------

describe('Phase 54 AB-04: Test 8 — N_PER_ARM_REQUIRED=20 top-of-file pin', () => {
  it('source file has exactly one top-level `const N_PER_ARM_REQUIRED = 20;` line', () => {
    const src = fs.readFileSync(SCRIPT_PATH, 'utf8');
    const lines = src.split(/\r?\n/);
    const matches = lines.filter((l) => /^const N_PER_ARM_REQUIRED = 20;\s*$/.test(l));
    expect(matches).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Test 9 — imports pin (D-21)
// ---------------------------------------------------------------------------

describe('Phase 54 AB-04: Test 9 — imports pin (D-21: node:fs only)', () => {
  it('source file has exactly one top-level import line, from node:fs', () => {
    const src = fs.readFileSync(SCRIPT_PATH, 'utf8');
    const importLines = src
      .split(/\r?\n/)
      .filter((l) => /^import\s/.test(l));
    expect(importLines).toHaveLength(1);
    expect(importLines[0]).toMatch(/from\s+['"]node:fs['"]/);
  });
});

// ---------------------------------------------------------------------------
// Bonus — pure-helper unit tests
// ---------------------------------------------------------------------------

describe('Phase 54 AB-04: parseArgs pure helper', () => {
  it('defaults to tests/e2e/.llm-spend-ledger.json when --ledger omitted', () => {
    const { ledgerPath } = parseArgs(['node', 'a-b-winner.mjs']);
    expect(ledgerPath).toBe('tests/e2e/.llm-spend-ledger.json');
  });

  it('honors --ledger <path>', () => {
    const { ledgerPath } = parseArgs(['node', 'a-b-winner.mjs', '--ledger', '/tmp/foo.json']);
    expect(ledgerPath).toBe('/tmp/foo.json');
  });
});

describe('Phase 54 AB-04: readLedgerEntries flattens months[*].iterations[*]', () => {
  it('returns flat array across multiple months', () => {
    const tmp = writeTmpLedger({
      version: 1,
      months: {
        '2026-05': {
          iterations: [
            { iso: '2026-05-01T00:00:00Z', model: 'claude-sonnet-4-6', errorClass: 'A' },
          ],
        },
        '2026-06': {
          iterations: [
            { iso: '2026-06-01T00:00:00Z', model: 'claude-opus-4-7', errorClass: 'B' },
            { iso: '2026-06-02T00:00:00Z', model: 'claude-opus-4-7', errorClass: 'C' },
          ],
        },
      },
    });
    const entries = readLedgerEntries(tmp);
    expect(entries).toHaveLength(3);
  });

  it('returns empty array when months object is empty', () => {
    const tmp = writeTmpLedger({ version: 1, months: {} });
    expect(readLedgerEntries(tmp)).toEqual([]);
  });
});

describe('Phase 54 AB-04: anyClassInsufficient pure helper', () => {
  it('returns true when any cell has n < N_PER_ARM_REQUIRED', () => {
    const perClass = {
      WRONG_CITATION: { sonnet: { n: 25, pass: 12 }, opus: { n: 19, pass: 10 } },
    };
    expect(anyClassInsufficient(perClass)).toBe(true);
  });

  it('returns false when all cells meet threshold', () => {
    const perClass = {
      WRONG_CITATION: { sonnet: { n: 25, pass: 12 }, opus: { n: 20, pass: 10 } },
      GOOGLE_DOM_DRIFT: { sonnet: { n: 22, pass: 8 }, opus: { n: 30, pass: 18 } },
    };
    expect(anyClassInsufficient(perClass)).toBe(false);
  });
});

describe('Phase 54 AB-04: formatMarkdownTable shape', () => {
  it('emits header + separator + 1 row + trailing newline', () => {
    const perClass = {
      WRONG_CITATION: {
        sonnet: { n: 20, pass: 12 },  // 0.60
        opus:   { n: 20, pass: 10 },  // 0.50
      },
    };
    const out = formatMarkdownTable(perClass);
    const lines = out.split('\n');
    // [header, separator, row, '' (trailing newline)] = 4 elements
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe('| ERROR_CLASS | sonnet pass_rate | sonnet n | opus pass_rate | opus n | winner |');
    expect(lines[1]).toBe('| --- | --- | --- | --- | --- | --- |');
    expect(lines[2]).toBe('| WRONG_CITATION | 0.60 | 20 | 0.50 | 20 | sonnet |');
    expect(lines[3]).toBe('');
  });
});

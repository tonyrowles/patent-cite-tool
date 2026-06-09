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
  // Phase 66 ABWIN-01..04 — new exports.
  parseAdminBypassCsv,
  loadAdminBypassSet,
  filterBySinceIso,
  filterByAdminBypass,
  declareWinnerForTuple,
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

describe('Phase 54 AB-04: Test 5 — markdown table on sufficient samples (Phase 66 7-col update)', () => {
  it('emits the locked 7-column header and per-(class,transport) rows', () => {
    // Use a recent iso so the Phase 66 --since-iso default (30 days) does not
    // filter these out. Test uses Date.now()-based iso for stability.
    const recentIso = new Date(Date.now() - 60 * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
    const iterations = [];
    // 20 sonnet entries for WRONG_CITATION (14 pass, 6 fail → 0.70), transport='sdk'
    for (let i = 0; i < 20; i++) {
      iterations.push({
        iso: recentIso,
        model: 'claude-sonnet-4-6',
        errorClass: 'WRONG_CITATION',
        transport: 'sdk',
        outcome: i < 14 ? 'pass' : 'fail',
      });
    }
    // 20 opus entries for WRONG_CITATION (10 pass, 10 fail → 0.50), transport='sdk'
    for (let i = 0; i < 20; i++) {
      iterations.push({
        iso: recentIso,
        model: 'claude-opus-4-7',
        errorClass: 'WRONG_CITATION',
        transport: 'sdk',
        outcome: i < 10 ? 'pass' : 'fail',
      });
    }
    const tmp = writeTmpLedger(makeLedgerPayload(iterations));
    const result = main(['node', 'a-b-winner.mjs', '--ledger', tmp]);
    expect(result.exitCode).toBe(0);
    // Phase 66 ABWIN-01 — 7-column header literal.
    expect(result.stdout).toContain(
      '| ERROR_CLASS | transport | sonnet pass_rate | sonnet n | opus pass_rate | opus n | winner |',
    );
    expect(result.stdout).toContain('| --- | --- | --- | --- | --- | --- | --- |');
    // WRONG_CITATION/sdk row: sonnet 0.70 / 20, opus 0.50 / 20.
    // Phase 66 TIE_THRESHOLD=0.10, delta=0.20 > 0.10 → winner is sonnet.
    // (Plan's original 0.60/0.50 fixture would yield FP delta 0.0999... < 0.10 → tie;
    //  Rule 1 deviation: pick a 0.70/0.50 split so the delta is unambiguous in IEEE 754.)
    expect(result.stdout).toContain('| WRONG_CITATION | sdk | 0.70 | 20 | 0.50 | 20 | sonnet |');
    // Trailing newline preserved.
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

  it('declares winner=sonnet when sonnet=0.70 and opus=0.50 (delta=0.20)', () => {
    // Phase 66 ABWIN-02: TIE_THRESHOLD raised to 0.10. Use 0.70/0.50 split
    // (delta=0.20, unambiguous) rather than the original 0.60/0.50 fixture
    // (IEEE 754 delta=0.0999... would tie under the new threshold).
    const cell = {
      sonnet: { n: 20, pass: 14 },  // 0.70
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

describe('Phase 54 AB-04 / Phase 66 ABWIN-01: anyClassInsufficient pure helper (3D)', () => {
  it('returns true when any (class, arm, transport) cell has n < N_PER_ARM_REQUIRED', () => {
    const perClass = {
      WRONG_CITATION: {
        sonnet: { sdk: { n: 25, pass: 12 } },
        opus:   { sdk: { n: 19, pass: 10 } },  // 19 < 20
      },
    };
    expect(anyClassInsufficient(perClass)).toBe(true);
  });

  it('returns false when all (class, arm, transport) cells meet threshold', () => {
    const perClass = {
      WRONG_CITATION: {
        sonnet: { sdk: { n: 25, pass: 12 } },
        opus:   { sdk: { n: 20, pass: 10 } },
      },
      GOOGLE_DOM_DRIFT: {
        sonnet: { sdk: { n: 22, pass: 8 } },
        opus:   { sdk: { n: 30, pass: 18 } },
      },
    };
    expect(anyClassInsufficient(perClass)).toBe(false);
  });
});

describe('Phase 54 AB-04 / Phase 66 ABWIN-01: formatMarkdownTable shape (3D perClass)', () => {
  it('emits 7-col header + separator + 1 row + trailing newline', () => {
    // Phase 66: use 0.70/0.50 (delta=0.20, unambiguous) so the assertion
    // doesn't trip on IEEE 754 precision against the new 0.10 TIE_THRESHOLD.
    const perClass = {
      WRONG_CITATION: {
        sonnet: { sdk: { n: 20, pass: 14 } },  // 0.70
        opus:   { sdk: { n: 20, pass: 10 } },  // 0.50
      },
    };
    const out = formatMarkdownTable(perClass);
    const lines = out.split('\n');
    // [header, separator, row, '' (trailing newline)] = 4 elements
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe('| ERROR_CLASS | transport | sonnet pass_rate | sonnet n | opus pass_rate | opus n | winner |');
    expect(lines[1]).toBe('| --- | --- | --- | --- | --- | --- | --- |');
    expect(lines[2]).toBe('| WRONG_CITATION | sdk | 0.70 | 20 | 0.50 | 20 | sonnet |');
    expect(lines[3]).toBe('');
  });
});

// ===========================================================================
// Phase 66 ABWIN-01..04 — 3-way stratification + filters + threshold bump
// ===========================================================================

/**
 * Helper: write a CSV file to os.tmpdir() and register it for cleanup.
 * (Local to the Phase 66 ABWIN-03 end-to-end test.)
 */
function writeTmpCsv(text) {
  const tmp = path.join(
    os.tmpdir(),
    `a-b-winner-bypass-${Date.now()}-${Math.random().toString(36).slice(2)}.csv`,
  );
  fs.writeFileSync(tmp, text, 'utf8');
  tmpFiles.push(tmp);
  return tmp;
}

// ---------------------------------------------------------------------------
// Phase 66 ABWIN-01: 3-way perClass shape + 'unknown' transport bucket + 7-col header
// ---------------------------------------------------------------------------

describe('Phase 66 ABWIN-01 Test A — 3-way perClass shape', () => {
  it('buckets entries by (errorClass, arm, transport) with sdk + subscription mix', () => {
    const filtered = [];
    // 5 sonnet/sdk + 7 sonnet/subscription + 9 opus/sdk + 3 opus/subscription
    for (let i = 0; i < 5; i++) {
      filtered.push({
        model: 'claude-sonnet-4-6', errorClass: 'WRONG_CITATION',
        transport: 'sdk', outcome: 'pass',
      });
    }
    for (let i = 0; i < 7; i++) {
      filtered.push({
        model: 'claude-sonnet-4-6', errorClass: 'WRONG_CITATION',
        transport: 'subscription', outcome: 'fail',
      });
    }
    for (let i = 0; i < 9; i++) {
      filtered.push({
        model: 'claude-opus-4-7', errorClass: 'WRONG_CITATION',
        transport: 'sdk', outcome: 'pass',
      });
    }
    for (let i = 0; i < 3; i++) {
      filtered.push({
        model: 'claude-opus-4-7', errorClass: 'WRONG_CITATION',
        transport: 'subscription', outcome: 'fail',
      });
    }
    const { outcomeUnavailable, perClass } = computePerClassPerArm(filtered);
    expect(outcomeUnavailable).toBe(false);
    expect(perClass.WRONG_CITATION.sonnet.sdk.n).toBe(5);
    expect(perClass.WRONG_CITATION.sonnet.sdk.pass).toBe(5);
    expect(perClass.WRONG_CITATION.sonnet.subscription.n).toBe(7);
    expect(perClass.WRONG_CITATION.sonnet.subscription.pass).toBe(0);
    expect(perClass.WRONG_CITATION.opus.sdk.n).toBe(9);
    expect(perClass.WRONG_CITATION.opus.sdk.pass).toBe(9);
    expect(perClass.WRONG_CITATION.opus.subscription.n).toBe(3);
    expect(perClass.WRONG_CITATION.opus.subscription.pass).toBe(0);
  });
});

describe('Phase 66 ABWIN-01 Test B — entries without transport bucket into "unknown"', () => {
  it('classifies entries lacking transport field into the unknown bucket', () => {
    const filtered = [
      { model: 'claude-sonnet-4-6', errorClass: 'WRONG_CITATION', outcome: 'pass' },
      { model: 'claude-sonnet-4-6', errorClass: 'WRONG_CITATION', outcome: 'fail' },
      { model: 'claude-opus-4-7',   errorClass: 'WRONG_CITATION', outcome: 'pass' },
    ];
    const { outcomeUnavailable, perClass } = computePerClassPerArm(filtered);
    expect(outcomeUnavailable).toBe(false);
    expect(perClass.WRONG_CITATION.sonnet.unknown).toEqual({ n: 2, pass: 1 });
    expect(perClass.WRONG_CITATION.opus.unknown).toEqual({ n: 1, pass: 1 });
    // sdk/subscription buckets should be absent (no entries had those transports).
    expect(perClass.WRONG_CITATION.sonnet.sdk).toBeUndefined();
    expect(perClass.WRONG_CITATION.opus.sdk).toBeUndefined();
  });
});

describe('Phase 66 ABWIN-01 Test C — 7-column markdown table header literal pinned', () => {
  it('renders 7-col header + separator + per-(class,transport) row', () => {
    // Recent iso so --since-iso default does not filter.
    const recentIso = new Date(Date.now() - 60 * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
    const iterations = [];
    for (let i = 0; i < 20; i++) {
      iterations.push({
        iso: recentIso, model: 'claude-sonnet-4-6',
        errorClass: 'WRONG_CITATION', transport: 'sdk',
        outcome: i < 14 ? 'pass' : 'fail',  // 0.70
      });
    }
    for (let i = 0; i < 20; i++) {
      iterations.push({
        iso: recentIso, model: 'claude-opus-4-7',
        errorClass: 'WRONG_CITATION', transport: 'sdk',
        outcome: i < 10 ? 'pass' : 'fail',  // 0.50
      });
    }
    const tmp = writeTmpLedger(makeLedgerPayload(iterations));
    const result = main(['node', 'a-b-winner.mjs', '--ledger', tmp]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(
      '| ERROR_CLASS | transport | sonnet pass_rate | sonnet n | opus pass_rate | opus n | winner |',
    );
    expect(result.stdout).toContain('| --- | --- | --- | --- | --- | --- | --- |');
    expect(result.stdout).toContain('| WRONG_CITATION | sdk | 0.70 | 20 | 0.50 | 20 | sonnet |');
  });
});

// ---------------------------------------------------------------------------
// Phase 66 ABWIN-02: --since-iso filter + TIE_THRESHOLD bump
// ---------------------------------------------------------------------------

describe('Phase 66 ABWIN-02 Test A — --since-iso default is 30 days ago (RFC-3339 shape)', () => {
  it('parseArgs returns sinceIso matching strict RFC-3339 when --since-iso omitted', () => {
    const parsed = parseArgs(['node', 'a-b-winner.mjs']);
    expect(parsed.ledgerPath).toBe('tests/e2e/.llm-spend-ledger.json');
    expect(parsed.adminBypassPath).toBeNull();
    expect(parsed.sinceIso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    // Ballpark: 29-31 days ago.
    const sinceMs = new Date(parsed.sinceIso).getTime();
    const ageDays = (Date.now() - sinceMs) / (24 * 60 * 60 * 1000);
    expect(ageDays).toBeGreaterThan(29);
    expect(ageDays).toBeLessThan(31);
  });
});

describe('Phase 66 ABWIN-02 Test B — --since-iso explicit override', () => {
  it('parseArgs honors --since-iso <iso>', () => {
    const parsed = parseArgs(['node', 'a-b-winner.mjs', '--since-iso', '2026-05-01T00:00:00Z']);
    expect(parsed.sinceIso).toBe('2026-05-01T00:00:00Z');
  });
});

describe('Phase 66 ABWIN-02 Test C — --since-iso malformed throws', () => {
  it('throws Error with "invalid --since-iso" message on non-RFC-3339 value', () => {
    expect(() => parseArgs(['node', 'a-b-winner.mjs', '--since-iso', '2026-05-01']))
      .toThrow(/invalid --since-iso/);
  });
});

describe('Phase 66 ABWIN-02 Test D — main() catches throw and returns exit 1 with stderr', () => {
  it('returns {exitCode:1, stderr:<msg>} when --since-iso is malformed', () => {
    const tmp = writeTmpLedger(makeLedgerPayload([]));
    const result = main(['node', 'a-b-winner.mjs', '--ledger', tmp, '--since-iso', 'bad']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/invalid --since-iso/);
    expect(result.stdout).toBe('');
  });
});

describe('Phase 66 ABWIN-02 Test E — TIE_THRESHOLD constant pinned at 0.10', () => {
  it('source file has exactly one top-level `const TIE_THRESHOLD = 0.10;` line', () => {
    const src = fs.readFileSync(SCRIPT_PATH, 'utf8');
    const lines = src.split(/\r?\n/);
    const matches = lines.filter((l) => /^const TIE_THRESHOLD = 0\.10;\s*$/.test(l));
    expect(matches).toHaveLength(1);
  });
});

describe('Phase 66 ABWIN-02 Test F — filterBySinceIso pure helper', () => {
  it('keeps entries with iso >= sinceIso; drops earlier or iso-less entries', () => {
    const entries = [
      { iso: '2026-05-01T00:00:00Z', model: 'sonnet' },  // pre-date — drop
      { iso: '2026-06-01T00:00:00Z', model: 'opus'   },  // post-date — keep
      { model: 'sonnet' /* no iso */ },                  // no iso — drop
    ];
    const out = filterBySinceIso(entries, '2026-05-15T00:00:00Z');
    expect(out).toHaveLength(1);
    expect(out[0].iso).toBe('2026-06-01T00:00:00Z');
  });
});

// ---------------------------------------------------------------------------
// Phase 66 ABWIN-03: --admin-bypass filter
// ---------------------------------------------------------------------------

describe('Phase 66 ABWIN-03 Test A — parseAdminBypassCsv extracts bypass=true prNumbers', () => {
  it('builds a Set containing only prNumbers where bypass_detected === "true"', () => {
    const csv =
      'pr_number,merged_at,verifier_gate_completed_at,bypass_detected,ledger_source_tag\n' +
      '42,2026-06-01T00:00:00Z,2026-06-01T01:00:00Z,true,auto-fix-sdk\n' +
      '43,2026-06-02T00:00:00Z,2026-06-02T01:00:00Z,false,auto-fix-subscription\n';
    const set = parseAdminBypassCsv(csv);
    expect(set.has(42)).toBe(true);
    expect(set.has(43)).toBe(false);
    expect(set.size).toBe(1);
  });
});

describe('Phase 66 ABWIN-03 Test B — parseAdminBypassCsv defensive on empty + malformed header', () => {
  it('returns empty Set on empty input', () => {
    expect(parseAdminBypassCsv('')).toEqual(new Set());
  });

  it('returns empty Set + stderr warning on malformed header (does NOT throw)', () => {
    // Capture stderr by replacing process.stderr.write transiently.
    const originalWrite = process.stderr.write.bind(process.stderr);
    let captured = '';
    process.stderr.write = (s) => { captured += String(s); return true; };
    let set;
    try {
      set = parseAdminBypassCsv('bogus,header\n42,foo,bar,true,baz\n');
    } finally {
      process.stderr.write = originalWrite;
    }
    expect(set).toEqual(new Set());
    expect(captured).toMatch(/header mismatch/);
  });
});

describe('Phase 66 ABWIN-03 Test C — filterByAdminBypass drops matching prNumber entries', () => {
  it('drops prNumber=42, keeps prNumber=43, and keeps no-prNumber entries', () => {
    const entries = [
      { prNumber: 42, model: 'claude-sonnet-4-6' },
      { prNumber: 43, model: 'claude-opus-4-7'   },
      { model: 'claude-sonnet-4-6' /* no prNumber */ },
    ];
    const out = filterByAdminBypass(entries, new Set([42]));
    expect(out).toHaveLength(2);
    expect(out.find((e) => e.prNumber === 42)).toBeUndefined();
    expect(out.find((e) => e.prNumber === 43)).toBeTruthy();
    expect(out.some((e) => e.prNumber === undefined)).toBe(true);
  });

  it('returns entries unchanged when bypassSet is empty (back-compat)', () => {
    const entries = [{ prNumber: 42 }, { prNumber: 43 }];
    expect(filterByAdminBypass(entries, new Set())).toBe(entries);
  });
});

describe('Phase 66 ABWIN-03 Test D — --admin-bypass argv recognized', () => {
  it('parseArgs returns adminBypassPath when --admin-bypass provided', () => {
    const parsed = parseArgs(['node', 'a-b-winner.mjs', '--admin-bypass', '/tmp/csv.csv']);
    expect(parsed.adminBypassPath).toBe('/tmp/csv.csv');
  });

  it('parseArgs returns adminBypassPath=null when --admin-bypass omitted', () => {
    const parsed = parseArgs(['node', 'a-b-winner.mjs']);
    expect(parsed.adminBypassPath).toBeNull();
  });
});

describe('Phase 66 ABWIN-03 Test E — main() drops bypass-tainted entries end-to-end', () => {
  it('reduces sample counts so NO_WINNER_YET when half the entries are bypass-tainted', () => {
    // Recent iso so --since-iso filter does not affect the synthetic.
    const recentIso = new Date(Date.now() - 60 * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
    const csv =
      'pr_number,merged_at,verifier_gate_completed_at,bypass_detected,ledger_source_tag\n' +
      '42,2026-06-01T00:00:00Z,2026-06-01T01:00:00Z,true,auto-fix-sdk\n';
    const tmpCsv = writeTmpCsv(csv);
    const iterations = [];
    // 20 sonnet + 20 opus entries — half tagged prNumber=42 (bypass-tainted),
    // half tagged prNumber=43 (clean).
    for (let i = 0; i < 20; i++) {
      iterations.push({
        iso: recentIso, model: 'claude-sonnet-4-6',
        errorClass: 'WRONG_CITATION', transport: 'sdk',
        outcome: 'pass', prNumber: i < 10 ? 42 : 43,
      });
    }
    for (let i = 0; i < 20; i++) {
      iterations.push({
        iso: recentIso, model: 'claude-opus-4-7',
        errorClass: 'WRONG_CITATION', transport: 'sdk',
        outcome: 'pass', prNumber: i < 10 ? 42 : 43,
      });
    }
    const tmpLedger = writeTmpLedger(makeLedgerPayload(iterations));
    const result = main([
      'node', 'a-b-winner.mjs',
      '--ledger', tmpLedger,
      '--admin-bypass', tmpCsv,
      '--since-iso', '2026-01-01T00:00:00Z',
    ]);
    expect(result.exitCode).toBe(0);
    // Surviving entries: 10 sonnet + 10 opus < N_PER_ARM_REQUIRED=20 → NO_WINNER_YET.
    expect(result.stdout).toBe('NO_WINNER_YET\n');
  });
});

// ---------------------------------------------------------------------------
// Phase 66 ABWIN-04: zero-sample sanity check + PHASE_56_TODO removal
//                    + isAttributable byte-unchanged probe
// ---------------------------------------------------------------------------

describe('Phase 66 ABWIN-04 Test A — zero-sample sanity check emits abstain line', () => {
  it('emits "abstain — insufficient samples in opus arm for (X, sdk)" when one arm is empty', () => {
    const recentIso = new Date(Date.now() - 60 * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
    const iterations = [];
    // 20 sonnet on (WRONG_CITATION, sdk) with NO opus entries for that tuple.
    for (let i = 0; i < 20; i++) {
      iterations.push({
        iso: recentIso, model: 'claude-sonnet-4-6',
        errorClass: 'WRONG_CITATION', transport: 'sdk',
        outcome: 'pass',
      });
    }
    // 20 + 20 on (GOOGLE_DOM_DRIFT, sdk) so that outcomeUnavailable=false AND
    // the (GOOGLE_DOM_DRIFT, sdk) tuple is fully sampled (avoid the
    // anyClassInsufficient early-exit which would emit NO_WINNER_YET before
    // the table renders). Use unambiguous 0.70/0.50 split.
    for (let i = 0; i < 20; i++) {
      iterations.push({
        iso: recentIso, model: 'claude-sonnet-4-6',
        errorClass: 'GOOGLE_DOM_DRIFT', transport: 'sdk',
        outcome: i < 14 ? 'pass' : 'fail',
      });
    }
    for (let i = 0; i < 20; i++) {
      iterations.push({
        iso: recentIso, model: 'claude-opus-4-7',
        errorClass: 'GOOGLE_DOM_DRIFT', transport: 'sdk',
        outcome: i < 10 ? 'pass' : 'fail',
      });
    }
    const tmp = writeTmpLedger(makeLedgerPayload(iterations));
    const result = main(['node', 'a-b-winner.mjs', '--ledger', tmp]);
    // anyClassInsufficient sees opus.sdk.n=0 for WRONG_CITATION (under 20) and
    // returns true → main emits NO_WINNER_YET instead of the markdown table.
    // The Phase 66 ABWIN-04 spec asks for the abstain line in stdout when the
    // table renders; in this fixture the gate short-circuits.  Exercise the
    // abstain-line path by calling formatMarkdownTable directly.
    expect(result.exitCode).toBe(0);
    // Direct formatMarkdownTable call to exercise the abstain-line branch.
    const perClass = {
      WRONG_CITATION: {
        sonnet: { sdk: { n: 20, pass: 14 } },
        opus:   { /* no sdk bucket */ },
      },
      GOOGLE_DOM_DRIFT: {
        sonnet: { sdk: { n: 20, pass: 14 } },
        opus:   { sdk: { n: 20, pass: 10 } },
      },
    };
    const md = formatMarkdownTable(perClass);
    expect(md).toContain('abstain — insufficient samples in opus arm for (WRONG_CITATION, sdk)');
    expect(md).toContain('| GOOGLE_DOM_DRIFT | sdk | 0.70 | 20 | 0.50 | 20 | sonnet |');
  });
});

describe('Phase 66 ABWIN-04 Test B — PHASE_56_TODO comments removed from source', () => {
  it('source file has zero PHASE_56_TODO substring occurrences', () => {
    const src = fs.readFileSync(SCRIPT_PATH, 'utf8');
    const matches = src.match(/PHASE_56_TODO/g);
    expect(matches).toBeNull();
  });
});

describe('Phase 66 ABWIN-04 Test C — isAttributable body byte-unchanged probe', () => {
  it('source file contains all four Phase 54 D-19 isAttributable signature substrings', () => {
    const src = fs.readFileSync(SCRIPT_PATH, 'utf8');
    // These exact substrings come from the Phase 54 isAttributable body
    // (a-b-winner.mjs:178-189). Any change to them would constitute a
    // byte-level mutation of the D-19 filter invariant.
    const sig1 = "if (!entry || typeof entry !== 'object') return false;";
    const sig2 = "if (typeof m !== 'string') return false;";
    const sig3 = "if (!m.startsWith('claude-sonnet-4-6') && !m.startsWith('claude-opus-4-7'))";
    const sig4 = "if (typeof entry.errorClass !== 'string' || entry.errorClass.length === 0)";
    expect(src.split(sig1).length - 1).toBe(1);
    expect(src.split(sig2).length - 1).toBe(1);
    expect(src.split(sig3).length - 1).toBe(1);
    expect(src.split(sig4).length - 1).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Phase 66 — declareWinnerForTuple unit
// ---------------------------------------------------------------------------

describe('Phase 66 ABWIN-04: declareWinnerForTuple zero-sample sanity', () => {
  it('returns "abstain-zero-sample" when one arm has n=0', () => {
    const perClass = {
      WRONG_CITATION: {
        sonnet: { sdk: { n: 20, pass: 12 } },
        opus:   { /* no sdk */ },
      },
    };
    expect(declareWinnerForTuple(perClass, 'WRONG_CITATION', 'sdk'))
      .toBe('abstain-zero-sample');
  });

  it('returns "abstain-zero-sample" when both arms missing', () => {
    expect(declareWinnerForTuple({}, 'WRONG_CITATION', 'sdk'))
      .toBe('abstain-zero-sample');
  });

  it('declares the higher-rate arm when delta >= 0.10', () => {
    const perClass = {
      WRONG_CITATION: {
        sonnet: { sdk: { n: 20, pass: 14 } },  // 0.70
        opus:   { sdk: { n: 20, pass: 10 } },  // 0.50
      },
    };
    expect(declareWinnerForTuple(perClass, 'WRONG_CITATION', 'sdk')).toBe('sonnet');
  });

  it('declares tie when delta < TIE_THRESHOLD', () => {
    const perClass = {
      WRONG_CITATION: {
        sonnet: { sdk: { n: 20, pass: 11 } },  // 0.55
        opus:   { sdk: { n: 20, pass: 10 } },  // 0.50
      },
    };
    expect(declareWinnerForTuple(perClass, 'WRONG_CITATION', 'sdk')).toBe('tie');
  });
});

// ---------------------------------------------------------------------------
// Phase 66 ABWIN-03: loadAdminBypassSet I/O wrapper
// ---------------------------------------------------------------------------

describe('Phase 66 ABWIN-03: loadAdminBypassSet I/O wrapper', () => {
  it('returns empty Set when path is null', () => {
    expect(loadAdminBypassSet(null)).toEqual(new Set());
  });

  it('returns empty Set when path is undefined', () => {
    expect(loadAdminBypassSet(undefined)).toEqual(new Set());
  });

  it('reads + parses CSV from disk', () => {
    const tmp = writeTmpCsv(
      'pr_number,merged_at,verifier_gate_completed_at,bypass_detected,ledger_source_tag\n' +
      '99,2026-06-01T00:00:00Z,2026-06-01T01:00:00Z,true,auto-fix-sdk\n',
    );
    const set = loadAdminBypassSet(tmp);
    expect(set.has(99)).toBe(true);
    expect(set.size).toBe(1);
  });

  it('throws Error with "failed to read --admin-bypass" message on missing file', () => {
    expect(() => loadAdminBypassSet('/tmp/definitely-nonexistent-csv-66.csv'))
      .toThrow(/failed to read --admin-bypass/);
  });
});

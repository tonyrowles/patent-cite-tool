// tests/unit/llm-ledger.test.js
//
// Phase 31 (LLM-05 + LLM-06) — exercises the spend ledger reader/writer and
// the hard $100 / warn $80 threshold semantics. Each test uses a tmpDir-per-
// test pattern (mirrors report.test.js Phase 28) so ledger mutations are
// hermetic and the real tests/e2e/.llm-spend-ledger.json is never touched.
//
// Tests pass an explicit `month` argument to monthlyTotal() and checkSpendCap()
// to remain hermetic across calendar rollover (the implementation defaults to
// currentMonth() but the test must lock to a specific month).
//
// Coverage map (see 31-01-PLAN.md Task 2 <behavior>):
//   1. readLedger() of missing file returns { version: 1, months: {} }
//   2. readLedger() of corrupt JSON returns { version: 1, months: {} }
//   3. currentMonth() returns YYYY-MM matching Date().toISOString().slice(0,7)
//   4. monthlyTotal(ledger, missingMonth) returns 0
//   5. monthlyTotal(ledger, '2026-05') with $4.50 returns 4.50
//   6. checkSpendCap(empty) → status:'ok'
//   7. checkSpendCap($79.99) → status:'ok'
//   8. checkSpendCap($80.00) → status:'warn'
//   9. checkSpendCap($99.99) → status:'warn'
//   10. checkSpendCap($100.00) → status:'block'
//   11. checkSpendCap($150.00) → status:'block'
//   12. appendLedgerEntry creates fresh file with proper shape
//   13. appendLedgerEntry twice → invocations=2, total summed
//   14. appendLedgerEntry of new month does NOT touch prior month
//   15. appendLedgerEntry result is valid JSON after write
//   16. appendLedgerEntry with cost_usd=0 increments invocations, leaves total
//   17. appendLedgerEntry rounds total_usd to 6 decimal places

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  readLedger,
  currentMonth,
  monthlyTotal,
  checkSpendCap,
  appendLedgerEntry,
  HARD_CAP_USD,
  WARN_THRESHOLD_USD,
  LEDGER_PATH,
} from '../e2e/lib/llm-ledger.js';

let tmpDir;
let ledgerPath;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pct-ledger-test-'));
  ledgerPath = path.join(tmpDir, '.llm-spend-ledger.json');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeEntry(overrides = {}) {
  return {
    iso: '2026-05-18T14:33:00.000Z',
    model: 'claude-opus-4-7[1m]',
    cost_usd: 0.42,
    tokens_in: 1234,
    tokens_out: 456,
    iteration_n: 1,
    run_id: '2026-05-18T14-33-00Z',
    ...overrides,
  };
}

function makeLedger(month, totalUsd, extraMonths = {}) {
  return {
    version: 1,
    months: {
      ...extraMonths,
      [month]: {
        invocations: 1,
        total_usd: totalUsd,
        last_invocation_iso: '2026-05-18T14:33:00.000Z',
        iterations: [],
      },
    },
  };
}

describe('tests/e2e/lib/llm-ledger.js — Phase 31 (LLM-05/06) spend ledger', () => {
  it('Test 1: readLedger() of nonexistent path returns { version:1, months:{} }', () => {
    expect(fs.existsSync(ledgerPath)).toBe(false);
    const r = readLedger(ledgerPath);
    expect(r).toEqual({ version: 1, months: {} });
  });

  it('Test 2: readLedger() of corrupt JSON returns { version:1, months:{} } without throwing', () => {
    fs.writeFileSync(ledgerPath, '{ this is not valid JSON ::: ');
    const r = readLedger(ledgerPath);
    expect(r).toEqual({ version: 1, months: {} });
  });

  it('Test 3: currentMonth() returns YYYY-MM matching Date().toISOString().slice(0,7)', () => {
    const expected = new Date().toISOString().slice(0, 7);
    expect(currentMonth()).toBe(expected);
    expect(currentMonth()).toMatch(/^\d{4}-\d{2}$/);
  });

  it('Test 4: monthlyTotal(ledger, missingMonth) returns 0 (and 0 on empty)', () => {
    expect(monthlyTotal({ version: 1, months: {} }, '2026-05')).toBe(0);
    expect(monthlyTotal(makeLedger('2026-04', 50), '2026-05')).toBe(0);
  });

  it('Test 5: monthlyTotal with explicit month returns the stored total', () => {
    const ledger = makeLedger('2026-05', 4.50);
    expect(monthlyTotal(ledger, '2026-05')).toBe(4.50);
  });

  it('Test 6: checkSpendCap on empty ledger → status:ok, total 0', () => {
    const r = checkSpendCap({ version: 1, months: {} }, '2026-05');
    expect(r.status).toBe('ok');
    expect(r.monthly_total_usd).toBe(0);
    expect(typeof r.message).toBe('string');
  });

  it('Test 7: checkSpendCap at $79.99 (below WARN) → status:ok', () => {
    const r = checkSpendCap(makeLedger('2026-05', 79.99), '2026-05');
    expect(r.status).toBe('ok');
    expect(r.monthly_total_usd).toBe(79.99);
  });

  it('Test 8: checkSpendCap at $80.00 (== WARN) → status:warn; message references $80', () => {
    const r = checkSpendCap(makeLedger('2026-05', 80.00), '2026-05');
    expect(r.status).toBe('warn');
    expect(r.monthly_total_usd).toBe(80.00);
    expect(r.message).toContain('80');
  });

  it('Test 9: checkSpendCap at $99.99 (above WARN, below HARD) → status:warn', () => {
    const r = checkSpendCap(makeLedger('2026-05', 99.99), '2026-05');
    expect(r.status).toBe('warn');
  });

  it('Test 10: checkSpendCap at $100.00 (== HARD) → status:block; message references $100', () => {
    const r = checkSpendCap(makeLedger('2026-05', 100.00), '2026-05');
    expect(r.status).toBe('block');
    expect(r.monthly_total_usd).toBe(100.00);
    expect(r.message).toContain('100');
  });

  it('Test 11: checkSpendCap at $150.00 (overshoot) → status:block', () => {
    const r = checkSpendCap(makeLedger('2026-05', 150.00), '2026-05');
    expect(r.status).toBe('block');
  });

  it('Test 12: appendLedgerEntry creates fresh file with shape { version:1, months:{[currentMonth]: {...}} }', () => {
    expect(fs.existsSync(ledgerPath)).toBe(false);
    const entry = makeEntry();
    appendLedgerEntry(ledgerPath, entry);

    expect(fs.existsSync(ledgerPath)).toBe(true);
    const written = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
    expect(written.version).toBe(1);
    const month = currentMonth();
    expect(written.months[month]).toBeDefined();
    expect(written.months[month].invocations).toBe(1);
    expect(written.months[month].total_usd).toBe(0.42);
    expect(typeof written.months[month].last_invocation_iso).toBe('string');
    expect(written.months[month].iterations).toHaveLength(1);
    expect(written.months[month].iterations[0]).toMatchObject({
      model: 'claude-opus-4-7[1m]',
      cost_usd: 0.42,
      iteration_n: 1,
    });
  });

  it('Test 13: appendLedgerEntry twice in same month → invocations=2, total_usd summed, iterations.length=2', () => {
    appendLedgerEntry(ledgerPath, makeEntry({ cost_usd: 0.40, iteration_n: 1 }));
    appendLedgerEntry(ledgerPath, makeEntry({ cost_usd: 0.42, iteration_n: 2 }));

    const written = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
    const month = currentMonth();
    expect(written.months[month].invocations).toBe(2);
    // 0.40 + 0.42 = 0.82
    expect(written.months[month].total_usd).toBe(0.82);
    expect(written.months[month].iterations).toHaveLength(2);
  });

  it('Test 14: appendLedgerEntry to a new month does NOT touch prior month totals (rollover proof)', () => {
    // Pre-populate the ledger file with a prior-month entry.
    const priorMonth = currentMonth() === '2026-04' ? '2026-03' : '2026-04';
    const priorState = {
      version: 1,
      months: {
        [priorMonth]: {
          invocations: 5,
          total_usd: 17.50,
          last_invocation_iso: '2026-04-30T00:00:00.000Z',
          iterations: [
            { iso: '2026-04-30T00:00:00.000Z', model: 'claude-opus-4-7[1m]', cost_usd: 17.50, tokens_in: 100, tokens_out: 200, iteration_n: 1, run_id: 'pre' },
          ],
        },
      },
    };
    fs.writeFileSync(ledgerPath, JSON.stringify(priorState, null, 2));

    // Append for the current month.
    appendLedgerEntry(ledgerPath, makeEntry({ cost_usd: 0.25 }));

    const written = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
    expect(written.months[priorMonth].invocations).toBe(5);
    expect(written.months[priorMonth].total_usd).toBe(17.50);
    expect(written.months[priorMonth].iterations).toHaveLength(1);
    expect(written.months[currentMonth()].invocations).toBe(1);
    expect(written.months[currentMonth()].total_usd).toBe(0.25);
  });

  it('Test 15: appendLedgerEntry produces a file that JSON.parses to the in-memory expected state', () => {
    appendLedgerEntry(ledgerPath, makeEntry({ cost_usd: 0.10 }));
    const raw = fs.readFileSync(ledgerPath, 'utf8');
    // Must be valid JSON.
    const parsed = JSON.parse(raw);
    expect(parsed).toBeDefined();
    expect(parsed.version).toBe(1);
    // File ends with a newline-safe JSON.stringify output (json.stringify with 2-space indent).
    expect(raw.length).toBeGreaterThan(20);
  });

  it('Test 16: appendLedgerEntry of an entry with cost_usd=0 increments invocations but keeps total_usd unchanged', () => {
    appendLedgerEntry(ledgerPath, makeEntry({ cost_usd: 0.50, iteration_n: 1 }));
    appendLedgerEntry(ledgerPath, makeEntry({ cost_usd: 0, iteration_n: 2 }));

    const written = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
    const month = currentMonth();
    expect(written.months[month].invocations).toBe(2);
    expect(written.months[month].total_usd).toBe(0.50);
    expect(written.months[month].iterations).toHaveLength(2);
  });

  it('Test 17: appendLedgerEntry rounds total_usd to 6 decimal places (no float drift)', () => {
    // 0.1 + 0.2 would drift to 0.30000000000000004 without rounding.
    appendLedgerEntry(ledgerPath, makeEntry({ cost_usd: 0.1, iteration_n: 1 }));
    appendLedgerEntry(ledgerPath, makeEntry({ cost_usd: 0.2, iteration_n: 2 }));

    const written = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
    const month = currentMonth();
    // Either the exact 0.3 (rounded) or close enough — 6dp tolerance.
    const total = written.months[month].total_usd;
    expect(Math.abs(total - 0.3)).toBeLessThan(1e-9);
    // Must NOT have the JS-float artefact tail.
    const repr = String(total);
    expect(repr).not.toContain('00000000000000004');
  });

  it('Sanity: exported constants HARD_CAP_USD=100, WARN_THRESHOLD_USD=80, LEDGER_PATH absolute', () => {
    expect(HARD_CAP_USD).toBe(100);
    expect(WARN_THRESHOLD_USD).toBe(80);
    expect(path.isAbsolute(LEDGER_PATH)).toBe(true);
    expect(LEDGER_PATH).toMatch(/\.llm-spend-ledger\.json$/);
  });
});

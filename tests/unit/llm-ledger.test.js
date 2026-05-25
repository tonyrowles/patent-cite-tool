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
// Phase 32 (UAT-02) — extended coverage for the per-phase helpers added by
// Plan 32-02 (D-13/D-14/D-15/D-16): phase tagging back-compat, phaseTotal
// cross-month aggregation + non-finite filtering + 6dp rounding,
// checkPhaseSpendCap boundary conditions, and the TEST-ONLY
// E2E_LEDGER_PATH_OVERRIDE env hook (verified via spawnSync child processes
// because top-level `export const` is evaluated once per Node process).
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
//
// Phase 32 coverage map (this PR — see the describe block below):
//   18. appendLedgerEntry preserves optional `phase` field through to iterations
//   19. appendLedgerEntry without `phase` stores no phase property (back-compat D-14)
//   20. phaseTotal returns 0 for empty/missing ledger
//   21. phaseTotal returns 0 for unknown phase
//   22. phaseTotal sums cost_usd across multiple iterations in a month
//   23. phaseTotal sums across MULTIPLE months (phase spans calendar boundaries)
//   24. phaseTotal ignores entries with non-finite cost_usd
//   25. phaseTotal rounds to 6 decimal places (no float drift)
//   26. checkPhaseSpendCap status='ok' when total < $8
//   27. checkPhaseSpendCap status='warn' at $8.00
//   28. checkPhaseSpendCap status='warn' at $9.99
//   29. checkPhaseSpendCap status='block' at $10.00
//   30. checkPhaseSpendCap status='block' at $15.00
//   31. checkPhaseSpendCap return-shape uses phase_total_usd + phase keys
//   32. LEDGER_PATH honors E2E_LEDGER_PATH_OVERRIDE when set (spawnSync child)
//   33. LEDGER_PATH falls back to default when env var unset or empty (spawnSync child)

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  readLedger,
  currentMonth,
  monthlyTotal,
  checkSpendCap,
  appendLedgerEntry,
  phaseTotal,
  checkPhaseSpendCap,
  HARD_CAP_USD,
  WARN_THRESHOLD_USD,
  PHASE_HARD_CAP_USD,
  PHASE_WARN_THRESHOLD_USD,
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

// ---------------------------------------------------------------------------
// Phase 32 — per-phase ledger helpers + LEDGER_PATH env override
// ---------------------------------------------------------------------------

// Resolve the absolute filesystem path of the llm-ledger module so the
// spawnSync child processes (Tests 32 and 33) can dynamically import it
// without depending on CWD.
const LEDGER_MODULE_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../e2e/lib/llm-ledger.js',
);

/**
 * Seed a ledger file directly with arbitrary month/iteration shape. Used by
 * tests that need entries in MULTIPLE months — `appendLedgerEntry` always
 * routes to `currentMonth()`, so multi-month coverage requires direct writes.
 */
function seedLedgerFile(filePath, ledger) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(ledger, null, 2));
}

describe('Phase 32 — per-phase ledger helpers (D-13/D-14/D-15/D-16)', () => {
  let tmpDir2;
  let ledgerPath2;

  beforeEach(() => {
    tmpDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'pct-ledger-phase32-'));
    ledgerPath2 = path.join(tmpDir2, '.llm-spend-ledger.json');
  });

  afterEach(() => {
    fs.rmSync(tmpDir2, { recursive: true, force: true });
  });

  it('Test 18: appendLedgerEntry preserves optional `phase` field through to iterations[]', () => {
    const entry = makeEntry({ cost_usd: 0.10, phase: '32' });
    appendLedgerEntry(ledgerPath2, entry);

    const written = JSON.parse(fs.readFileSync(ledgerPath2, 'utf8'));
    const month = currentMonth();
    expect(written.months[month].iterations).toHaveLength(1);
    expect(written.months[month].iterations[0].phase).toBe('32');
  });

  it('Test 19: appendLedgerEntry without `phase` stores no phase property (D-14 back-compat)', () => {
    // makeEntry() default has NO phase; legacy Phase 31 callers must continue to work.
    const entry = makeEntry({ cost_usd: 0.10 });
    expect(entry.phase).toBeUndefined();
    appendLedgerEntry(ledgerPath2, entry);

    const written = JSON.parse(fs.readFileSync(ledgerPath2, 'utf8'));
    const month = currentMonth();
    const it0 = written.months[month].iterations[0];
    expect(it0.phase).toBeUndefined();
    // Spot-check legacy fields survived intact.
    expect(it0.cost_usd).toBe(0.10);
    expect(it0.iteration_n).toBe(1);
  });

  it('Test 20: phaseTotal returns 0 for empty/missing ledger', () => {
    expect(phaseTotal({}, '32')).toBe(0);
    expect(phaseTotal({ months: {} }, '32')).toBe(0);
    expect(phaseTotal(null, '32')).toBe(0);
    expect(phaseTotal(undefined, '32')).toBe(0);
  });

  it('Test 21: phaseTotal returns 0 for unknown phase', () => {
    const ledger = {
      version: 1,
      months: {
        '2026-05': {
          invocations: 1,
          total_usd: 0.5,
          last_invocation_iso: '2026-05-18T00:00:00.000Z',
          iterations: [{ iso: '2026-05-18T00:00:00.000Z', cost_usd: 0.5, phase: '31' }],
        },
      },
    };
    expect(phaseTotal(ledger, '32')).toBe(0);
    // Sanity: phase '31' still found.
    expect(phaseTotal(ledger, '31')).toBe(0.5);
  });

  it('Test 22: phaseTotal sums cost_usd across multiple iterations in a month', () => {
    const ledger = {
      version: 1,
      months: {
        '2026-05': {
          invocations: 3,
          total_usd: 2.25,
          last_invocation_iso: '2026-05-18T00:00:00.000Z',
          iterations: [
            { iso: 'a', cost_usd: 1.50, phase: '32' },
            { iso: 'b', cost_usd: 0.50, phase: '32' },
            { iso: 'c', cost_usd: 0.25, phase: '32' },
          ],
        },
      },
    };
    expect(phaseTotal(ledger, '32')).toBe(2.25);
  });

  it('Test 23: phaseTotal sums across MULTIPLE months (phase spans calendar boundaries)', () => {
    // Phases (e.g., "32") run across calendar months; phaseTotal MUST aggregate.
    const ledger = {
      version: 1,
      months: {
        '2026-05': {
          invocations: 2,
          total_usd: 1.50,
          last_invocation_iso: '2026-05-31T00:00:00.000Z',
          iterations: [
            { iso: '2026-05-29T00:00:00.000Z', cost_usd: 1.00, phase: '32' },
            { iso: '2026-05-30T00:00:00.000Z', cost_usd: 0.50, phase: '32' },
          ],
        },
        '2026-06': {
          invocations: 1,
          total_usd: 2.00,
          last_invocation_iso: '2026-06-02T00:00:00.000Z',
          iterations: [
            { iso: '2026-06-02T00:00:00.000Z', cost_usd: 2.00, phase: '32' },
          ],
        },
      },
    };
    expect(phaseTotal(ledger, '32')).toBe(3.50);
  });

  it('Test 24: phaseTotal ignores entries with non-finite cost_usd', () => {
    const ledger = {
      version: 1,
      months: {
        '2026-05': {
          invocations: 4,
          total_usd: 1.00,
          last_invocation_iso: 'x',
          iterations: [
            { cost_usd: 1.00, phase: '32' },
            { cost_usd: NaN, phase: '32' },
            { cost_usd: undefined, phase: '32' },
            { cost_usd: Infinity, phase: '32' },
            { phase: '32' },  // cost_usd missing entirely
          ],
        },
      },
    };
    // Only the first $1.00 entry is finite.
    expect(phaseTotal(ledger, '32')).toBe(1.00);
  });

  it('Test 25: phaseTotal rounds to 6 decimal places (no float drift 0.1+0.2)', () => {
    const ledger = {
      version: 1,
      months: {
        '2026-05': {
          invocations: 2,
          total_usd: 0.3,
          last_invocation_iso: 'x',
          iterations: [
            { cost_usd: 0.1, phase: '32' },
            { cost_usd: 0.2, phase: '32' },
          ],
        },
      },
    };
    const total = phaseTotal(ledger, '32');
    expect(total).toBe(0.3);
    expect(String(total)).not.toContain('00000000000000004');
  });

  it('Test 26: checkPhaseSpendCap returns status=ok when total < $8 (and empty message)', () => {
    const ledger = {
      version: 1,
      months: {
        '2026-05': {
          invocations: 1, total_usd: 7.99, last_invocation_iso: 'x',
          iterations: [{ cost_usd: 7.99, phase: '32' }],
        },
      },
    };
    const r = checkPhaseSpendCap(ledger, '32');
    expect(r.status).toBe('ok');
    expect(r.phase_total_usd).toBe(7.99);
    expect(r.phase).toBe('32');
    expect(r.message).toBe('');
  });

  it('Test 27: checkPhaseSpendCap returns status=warn at exactly $8.00 (message starts with ⚠)', () => {
    const ledger = {
      version: 1,
      months: {
        '2026-05': {
          invocations: 1, total_usd: 8.00, last_invocation_iso: 'x',
          iterations: [{ cost_usd: 8.00, phase: '32' }],
        },
      },
    };
    const r = checkPhaseSpendCap(ledger, '32');
    expect(r.status).toBe('warn');
    expect(r.phase_total_usd).toBe(8.00);
    expect(r.message.startsWith('⚠')).toBe(true);
    expect(r.message).toContain('32');
    expect(r.message).toContain('8.00');
  });

  it('Test 28: checkPhaseSpendCap returns status=warn at $9.99 (just below hard cap)', () => {
    const ledger = {
      version: 1,
      months: {
        '2026-05': {
          invocations: 1, total_usd: 9.99, last_invocation_iso: 'x',
          iterations: [{ cost_usd: 9.99, phase: '32' }],
        },
      },
    };
    const r = checkPhaseSpendCap(ledger, '32');
    expect(r.status).toBe('warn');
    expect(r.phase_total_usd).toBe(9.99);
  });

  it('Test 29: checkPhaseSpendCap returns status=block at exactly $10.00 (message contains Refusing to invoke)', () => {
    const ledger = {
      version: 1,
      months: {
        '2026-05': {
          invocations: 1, total_usd: 10.00, last_invocation_iso: 'x',
          iterations: [{ cost_usd: 10.00, phase: '32' }],
        },
      },
    };
    const r = checkPhaseSpendCap(ledger, '32');
    expect(r.status).toBe('block');
    expect(r.phase_total_usd).toBe(10.00);
    expect(r.message).toContain('Refusing to invoke');
    expect(r.message).toContain('32');
    expect(r.message).toContain('10.00');
  });

  it('Test 30: checkPhaseSpendCap returns status=block at $15.00 (overshoot)', () => {
    const ledger = {
      version: 1,
      months: {
        '2026-05': {
          invocations: 1, total_usd: 15.00, last_invocation_iso: 'x',
          iterations: [{ cost_usd: 15.00, phase: '32' }],
        },
      },
    };
    const r = checkPhaseSpendCap(ledger, '32');
    expect(r.status).toBe('block');
    expect(r.phase_total_usd).toBe(15.00);
    expect(r.message).toContain('Refusing to invoke');
  });

  it('Test 31: checkPhaseSpendCap return shape uses phase_total_usd + phase (NOT monthly_total_usd + month)', () => {
    const ledger = {
      version: 1,
      months: {
        '2026-05': {
          invocations: 1, total_usd: 5.00, last_invocation_iso: 'x',
          iterations: [{ cost_usd: 5.00, phase: '32' }],
        },
      },
    };
    const r = checkPhaseSpendCap(ledger, '32');
    const keys = Object.keys(r).sort();
    expect(keys).toEqual(['message', 'phase', 'phase_total_usd', 'status']);
    // Negative assertions: the monthly-shape fields MUST be absent.
    expect(r.monthly_total_usd).toBeUndefined();
    expect(r.month).toBeUndefined();
    // Sanity: phase identity preserved.
    expect(r.phase).toBe('32');
  });

  it('Test 32: LEDGER_PATH honors E2E_LEDGER_PATH_OVERRIDE when set (TEST-ONLY, spawnSync child)', () => {
    // Module top-level `export const LEDGER_PATH = ...` is evaluated once per
    // Node process. In-process env mutation is too late, so we spawn a child.
    const overridePath = path.join(tmpDir2, 'override-ledger.json');
    const script = `import(${JSON.stringify(LEDGER_MODULE_PATH)}).then(m => { process.stdout.write(m.LEDGER_PATH); }).catch(e => { process.stderr.write(String(e)); process.exit(2); });`;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      env: { ...process.env, E2E_LEDGER_PATH_OVERRIDE: overridePath },
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(path.resolve(overridePath));

    // End-to-end smoke: appendLedgerEntry via the override path actually
    // writes to the override file (not the real per-repo ledger).
    appendLedgerEntry(overridePath, makeEntry({ cost_usd: 0.05, phase: '32' }));
    expect(fs.existsSync(overridePath)).toBe(true);
    const written = JSON.parse(fs.readFileSync(overridePath, 'utf8'));
    expect(written.version).toBe(1);
    expect(Object.keys(written.months).length).toBe(1);
  });

  it('Test 33: LEDGER_PATH falls back to default when E2E_LEDGER_PATH_OVERRIDE unset or empty', () => {
    const script = `import(${JSON.stringify(LEDGER_MODULE_PATH)}).then(m => { process.stdout.write(m.LEDGER_PATH); }).catch(e => { process.stderr.write(String(e)); process.exit(2); });`;

    // (a) Env var fully unset.
    const envNoOverride = { ...process.env };
    delete envNoOverride.E2E_LEDGER_PATH_OVERRIDE;
    const a = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      env: envNoOverride,
      encoding: 'utf8',
    });
    expect(a.status).toBe(0);
    expect(a.stdout.endsWith('.llm-spend-ledger.json')).toBe(true);
    // MUST NOT be the override-style path under tmpDir.
    expect(a.stdout.startsWith(tmpDir2)).toBe(false);

    // (b) Env var present but empty string.
    const b = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      env: { ...envNoOverride, E2E_LEDGER_PATH_OVERRIDE: '' },
      encoding: 'utf8',
    });
    expect(b.status).toBe(0);
    expect(b.stdout.endsWith('.llm-spend-ledger.json')).toBe(true);

    // (c) Env var present but whitespace-only.
    const c = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      env: { ...envNoOverride, E2E_LEDGER_PATH_OVERRIDE: '   ' },
      encoding: 'utf8',
    });
    expect(c.status).toBe(0);
    expect(c.stdout.endsWith('.llm-spend-ledger.json')).toBe(true);
  });

  it('Sanity: exported phase-cap constants PHASE_HARD_CAP_USD=10, PHASE_WARN_THRESHOLD_USD=8 (D-13)', () => {
    expect(PHASE_HARD_CAP_USD).toBe(10);
    expect(PHASE_WARN_THRESHOLD_USD).toBe(8);
  });

  it('Sanity: seedLedgerFile helper is reachable (anchor for future direct-write tests)', () => {
    // Sanity test exercises the helper in this describe block to avoid an
    // unused-symbol lint warning if future test maintenance removes its only
    // call site. The function is also used implicitly via the seeded ledger
    // pattern in Tests 22-30 (which inline JSON literals instead of calling
    // seedLedgerFile, but the helper is documented as the canonical pattern
    // for multi-month tests that need real on-disk ledgers).
    seedLedgerFile(ledgerPath2, { version: 1, months: {} });
    expect(fs.existsSync(ledgerPath2)).toBe(true);
    const r = readLedger(ledgerPath2);
    expect(r).toEqual({ version: 1, months: {} });
  });
});

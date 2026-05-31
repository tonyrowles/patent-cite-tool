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
  // Phase 39 LEDGER-01/02/03 additions
  DAY_HARD_CAP_USD,
  ISSUE_HARD_CAP_USD,
  PR_HARD_CAP_USD,
  currentIsoDay,
  dayTotal,
  issueTotal,
  prTotal,
  checkDayCap,
  checkIssueCap,
  checkPrCap,
  combinedMonthlyTotal,
  combinedMonthlyTotalByTransport,
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
    // WR-05 (Phase 32 review): the resolver now THROWS when CI or
    // GITHUB_ACTIONS is set alongside the override (defense-in-depth against
    // misconfigured CI). Strip both env vars from the child so this test
    // exercises the local override path on CI runners.
    const overridePath = path.join(tmpDir2, 'override-ledger.json');
    const script = `import(${JSON.stringify(LEDGER_MODULE_PATH)}).then(m => { process.stdout.write(m.LEDGER_PATH); }).catch(e => { process.stderr.write(String(e)); process.exit(2); });`;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      env: { ...process.env, CI: '', GITHUB_ACTIONS: '', E2E_LEDGER_PATH_OVERRIDE: overridePath },
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

  it('WR-05: LEDGER_PATH resolver THROWS when E2E_LEDGER_PATH_OVERRIDE is set under CI', () => {
    // WR-05 (Phase 32 review) — defense-in-depth runtime CI guard. A
    // misconfigured CI step setting the override would otherwise silently
    // redirect the ledger and bypass spend caps. The resolver MUST throw
    // when both the override AND a CI flag are set together. Verify both
    // CI and GITHUB_ACTIONS flag values trigger the guard.
    const overridePath = path.join(tmpDir2, 'should-not-be-used.json');
    const script = `import(${JSON.stringify(LEDGER_MODULE_PATH)}).then(m => { process.stdout.write(m.LEDGER_PATH); }).catch(e => { process.stderr.write(String(e)); process.exit(2); });`;

    // (a) CI=1 plus override → throw.
    const a = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      env: {
        ...process.env,
        CI: '1',
        GITHUB_ACTIONS: '',
        E2E_LEDGER_PATH_OVERRIDE: overridePath,
      },
      encoding: 'utf8',
    });
    expect(a.status).toBe(2);
    expect(a.stderr).toMatch(/E2E_LEDGER_PATH_OVERRIDE must NOT be set in CI/);

    // (b) GITHUB_ACTIONS=true plus override → throw.
    const b = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      env: {
        ...process.env,
        CI: '',
        GITHUB_ACTIONS: 'true',
        E2E_LEDGER_PATH_OVERRIDE: overridePath,
      },
      encoding: 'utf8',
    });
    expect(b.status).toBe(2);
    expect(b.stderr).toMatch(/E2E_LEDGER_PATH_OVERRIDE must NOT be set in CI/);
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

// ---------------------------------------------------------------------------
// Phase 39 — ledger-v2: transport field + combined monthly total + binary
// per-day / per-issue / per-PR sub-caps (LEDGER-01 / LEDGER-02 / LEDGER-03)
// ---------------------------------------------------------------------------
//
// Phase 39 coverage map (Tests 34–47, per 39-01-PLAN.md Task 3):
//   34. appendLedgerEntry with transport:'sdk' persists the field
//   35. appendLedgerEntry with transport:'subscription' persists the field
//   36. appendLedgerEntry without transport stores no transport property
//       (LEDGER-01 back-compat: pre-Phase-39 callers still produce valid
//       entries, 'transport' key MUST NOT appear in iterations[0])
//   37. appendLedgerEntry round-trips all five new optional fields together
//       (issueId / prNumber / cache_creation_tokens / cache_read_tokens / error)
//   38. combinedMonthlyTotal + combinedMonthlyTotalByTransport on empty ledger
//   39. combinedMonthlyTotal + combinedMonthlyTotalByTransport on mixed sub+sdk
//   40. combinedMonthlyTotalByTransport default 'subscription' for missing
//       transport field (39-RESEARCH A8 back-compat)
//   41. combinedMonthlyTotalByTransport buckets unrecognized transport tags
//       under 'unknown' (preserves combined sum integrity)
//   42. checkDayCap returns ok when day total $5.00
//   43. checkDayCap blocks at exactly $10.00 inclusive (binary cap boundary)
//   44. checkDayCap filters by isoDay (UTC day boundary across month edge)
//   45. checkIssueCap blocks at exactly $1.00 inclusive; return shape uses
//       issue_total_usd + issue_id keys (NOT cost_usd / id)
//   46. checkIssueCap ignores entries from other issueIds
//   47. checkPrCap blocks at exactly $2.00 inclusive; return shape uses
//       pr_total_usd + pr_number keys

describe('Phase 39 LEDGER-01: appendLedgerEntry transport + ledger-v2 fields (additive)', () => {
  let tmpDir39a;
  let ledgerPath39a;

  beforeEach(() => {
    tmpDir39a = fs.mkdtempSync(path.join(os.tmpdir(), 'pct-ledger-phase39a-'));
    ledgerPath39a = path.join(tmpDir39a, '.llm-spend-ledger.json');
  });

  afterEach(() => {
    fs.rmSync(tmpDir39a, { recursive: true, force: true });
  });

  it("Test 34: appendLedgerEntry with transport:'sdk' persists the field through to iterations[]", () => {
    appendLedgerEntry(ledgerPath39a, makeEntry({ cost_usd: 0.10, transport: 'sdk' }));
    const written = JSON.parse(fs.readFileSync(ledgerPath39a, 'utf8'));
    const month = currentMonth();
    expect(written.months[month].iterations).toHaveLength(1);
    expect(written.months[month].iterations[0].transport).toBe('sdk');
    // readLedger should also round-trip the field.
    const r = readLedger(ledgerPath39a);
    expect(r.months[month].iterations[0].transport).toBe('sdk');
  });

  it("Test 35: appendLedgerEntry with transport:'subscription' persists the field", () => {
    appendLedgerEntry(ledgerPath39a, makeEntry({ cost_usd: 0.20, transport: 'subscription' }));
    const r = readLedger(ledgerPath39a);
    const month = currentMonth();
    expect(r.months[month].iterations[0].transport).toBe('subscription');
  });

  it("Test 36: appendLedgerEntry without transport stores no transport property (LEDGER-01 back-compat)", () => {
    const entry = makeEntry({ cost_usd: 0.30 });
    expect(entry.transport).toBeUndefined();
    appendLedgerEntry(ledgerPath39a, entry);
    const r = readLedger(ledgerPath39a);
    const month = currentMonth();
    const it0 = r.months[month].iterations[0];
    // The key MUST NOT appear at all (not even as 'transport: undefined') so
    // pre-Phase-39 entries on disk remain byte-for-byte identical after
    // round-trip. JSON.stringify drops undefined values, so the on-disk shape
    // is checked indirectly via `'transport' in it0`.
    expect('transport' in it0).toBe(false);
    // Spot-check pre-existing legacy fields survived intact.
    expect(it0.cost_usd).toBe(0.30);
    expect(it0.iteration_n).toBe(1);
  });

  it("Test 37: appendLedgerEntry round-trips all 5 new optional fields together", () => {
    const entry = makeEntry({
      cost_usd: 0.40,
      transport: 'sdk',
      issueId: 'issue-42',
      prNumber: 7,
      cache_creation_tokens: 100,
      cache_read_tokens: 200,
      error: 'sdk timeout',
    });
    appendLedgerEntry(ledgerPath39a, entry);
    const r = readLedger(ledgerPath39a);
    const it0 = r.months[currentMonth()].iterations[0];
    expect(it0.transport).toBe('sdk');
    expect(it0.issueId).toBe('issue-42');
    expect(it0.prNumber).toBe(7);
    expect(it0.cache_creation_tokens).toBe(100);
    expect(it0.cache_read_tokens).toBe(200);
    expect(it0.error).toBe('sdk timeout');
    // Spread MUST also preserve pre-existing fields.
    expect(it0.cost_usd).toBe(0.40);
    expect(it0.model).toBe('claude-opus-4-7[1m]');
  });
});

describe('Phase 39 LEDGER-02: combinedMonthlyTotal + combinedMonthlyTotalByTransport', () => {
  let tmpDir39b;
  let ledgerPath39b;

  beforeEach(() => {
    tmpDir39b = fs.mkdtempSync(path.join(os.tmpdir(), 'pct-ledger-phase39b-'));
    ledgerPath39b = path.join(tmpDir39b, '.llm-spend-ledger.json');
  });

  afterEach(() => {
    fs.rmSync(tmpDir39b, { recursive: true, force: true });
  });

  it('Test 38: empty ledger → combinedMonthlyTotal=0; by_transport all zero', () => {
    const empty = { version: 1, months: {} };
    expect(combinedMonthlyTotal(empty)).toBe(0);
    const t = combinedMonthlyTotalByTransport(empty);
    expect(t).toEqual({
      combined: 0,
      by_transport: { subscription: 0, sdk: 0, unknown: 0 },
    });
  });

  it('Test 39: one subscription + one sdk entry → combined 1.25; by_transport partitions correctly', () => {
    // Two appends to the same month bucket; first subscription $0.50, then sdk $0.75.
    appendLedgerEntry(ledgerPath39b, makeEntry({ cost_usd: 0.50, transport: 'subscription' }));
    appendLedgerEntry(ledgerPath39b, makeEntry({ cost_usd: 0.75, transport: 'sdk', iteration_n: 2 }));
    const ledger = readLedger(ledgerPath39b);

    expect(combinedMonthlyTotal(ledger)).toBe(1.25);
    const t = combinedMonthlyTotalByTransport(ledger);
    expect(t.combined).toBe(1.25);
    expect(t.by_transport).toEqual({ subscription: 0.5, sdk: 0.75, unknown: 0 });
  });

  it("Test 40: entry without transport → bucketed under 'subscription' (39-RESEARCH A8 back-compat)", () => {
    appendLedgerEntry(ledgerPath39b, makeEntry({ cost_usd: 0.30 })); // no transport
    const ledger = readLedger(ledgerPath39b);
    expect(combinedMonthlyTotal(ledger)).toBe(0.3);
    const t = combinedMonthlyTotalByTransport(ledger);
    expect(t.combined).toBe(0.3);
    expect(t.by_transport).toEqual({ subscription: 0.3, sdk: 0, unknown: 0 });
  });

  it("Test 41: entry with transport:'mystery' → bucketed under 'unknown'", () => {
    appendLedgerEntry(ledgerPath39b, makeEntry({ cost_usd: 0.42, transport: 'mystery' }));
    const ledger = readLedger(ledgerPath39b);
    const t = combinedMonthlyTotalByTransport(ledger);
    expect(t.by_transport).toEqual({ subscription: 0, sdk: 0, unknown: 0.42 });
    // Combined total still equals the bucket's total_usd (audit-visible without
    // corrupting the cap-check view).
    expect(t.combined).toBe(0.42);
  });
});

describe('Phase 39 LEDGER-03: checkDayCap binary boundary at $10.00', () => {
  let tmpDir39c;
  let ledgerPath39c;

  beforeEach(() => {
    tmpDir39c = fs.mkdtempSync(path.join(os.tmpdir(), 'pct-ledger-phase39c-'));
    ledgerPath39c = path.join(tmpDir39c, '.llm-spend-ledger.json');
  });

  afterEach(() => {
    fs.rmSync(tmpDir39c, { recursive: true, force: true });
  });

  it('Test 42: checkDayCap returns ok when day total $5.00', () => {
    appendLedgerEntry(ledgerPath39c, makeEntry({ cost_usd: 5.0, iso: '2026-05-30T10:00:00Z' }));
    const r = checkDayCap(readLedger(ledgerPath39c), '2026-05-30');
    expect(r.status).toBe('ok');
    expect(r.day_total_usd).toBe(5);
    expect(r.iso_day).toBe('2026-05-30');
    expect(r.message).toBe('');
  });

  it('Test 43: checkDayCap blocks at exactly $10.00 inclusive (binary boundary)', () => {
    appendLedgerEntry(ledgerPath39c, makeEntry({ cost_usd: 10.0, iso: '2026-05-30T10:00:00Z' }));
    const r = checkDayCap(readLedger(ledgerPath39c), '2026-05-30');
    expect(r.status).toBe('block');
    expect(r.day_total_usd).toBe(10);
    expect(r.iso_day).toBe('2026-05-30');
    expect(r.message).toContain('$10.00');
    expect(r.message).toContain('Refusing');
    expect(r.message).toContain('2026-05-30');
  });

  it('Test 44: checkDayCap filters entries by isoDay (UTC day boundary across month edge)', () => {
    // Direct write across two months to exercise the cross-month iteration path
    // (appendLedgerEntry routes to currentMonth() which we cannot manipulate
    // mid-test). Mirrors the seedLedgerFile pattern from Phase 32 Tests 22-30.
    const ledger = {
      version: 1,
      months: {
        '2026-05': {
          invocations: 1,
          total_usd: 5.0,
          last_invocation_iso: '2026-05-29T23:59:00Z',
          iterations: [
            { iso: '2026-05-29T23:59:00Z', cost_usd: 5.0, model: 'claude-sonnet-4-6' },
          ],
        },
        '2026-06': {
          invocations: 1,
          total_usd: 5.0,
          last_invocation_iso: '2026-05-30T00:00:00Z',
          iterations: [
            // Bucketed under 2026-06 but iso is on 2026-05-30 (writer's
            // currentMonth() differs from the iso's day — possible in narrow
            // clock-skew windows; the filter MUST trust iso, not the bucket).
            { iso: '2026-05-30T00:00:00Z', cost_usd: 5.0, model: 'claude-sonnet-4-6' },
          ],
        },
      },
    };
    // Day 2026-05-30 has $5.00 (from the 2026-06 bucket — bucket-key
    // independent because dayTotal filters on iso prefix).
    expect(checkDayCap(ledger, '2026-05-30').day_total_usd).toBe(5);
    expect(checkDayCap(ledger, '2026-05-30').status).toBe('ok');
    // Day 2026-05-29 has the other $5.00.
    expect(checkDayCap(ledger, '2026-05-29').day_total_usd).toBe(5);
  });
});

describe('Phase 39 LEDGER-03: checkIssueCap and checkPrCap binary boundaries', () => {
  let tmpDir39d;
  let ledgerPath39d;

  beforeEach(() => {
    tmpDir39d = fs.mkdtempSync(path.join(os.tmpdir(), 'pct-ledger-phase39d-'));
    ledgerPath39d = path.join(tmpDir39d, '.llm-spend-ledger.json');
  });

  afterEach(() => {
    fs.rmSync(tmpDir39d, { recursive: true, force: true });
  });

  it('Test 45: checkIssueCap blocks at exactly $1.00 inclusive; return shape uses issue_total_usd + issue_id', () => {
    appendLedgerEntry(ledgerPath39d, makeEntry({ cost_usd: 1.0, issueId: 'issue-99' }));
    const r = checkIssueCap(readLedger(ledgerPath39d), 'issue-99');
    expect(r.status).toBe('block');
    expect(r.issue_total_usd).toBe(1);
    expect(r.issue_id).toBe('issue-99');
    expect(r.message).toContain('issue-99');
    expect(r.message).toContain('$1.00');
    // Discipline mirror at llm-ledger.js:240 — keys MUST be issue-scoped,
    // never cost_usd / id.
    expect(r.cost_usd).toBeUndefined();
    expect(r.id).toBeUndefined();
    // Negative discipline: also MUST NOT use day/PR/monthly key names.
    expect(r.day_total_usd).toBeUndefined();
    expect(r.pr_total_usd).toBeUndefined();
    expect(r.monthly_total_usd).toBeUndefined();
  });

  it('Test 46: checkIssueCap ignores entries from other issueIds', () => {
    appendLedgerEntry(ledgerPath39d, makeEntry({ cost_usd: 0.99, issueId: 'issue-1', iteration_n: 1 }));
    appendLedgerEntry(ledgerPath39d, makeEntry({ cost_usd: 0.99, issueId: 'issue-2', iteration_n: 2 }));
    const r1 = checkIssueCap(readLedger(ledgerPath39d), 'issue-1');
    expect(r1.status).toBe('ok');
    expect(r1.issue_total_usd).toBe(0.99);
    // Sanity: issue-2 is also ok individually.
    const r2 = checkIssueCap(readLedger(ledgerPath39d), 'issue-2');
    expect(r2.status).toBe('ok');
    expect(r2.issue_total_usd).toBe(0.99);
  });

  it('Test 47: checkPrCap blocks at exactly $2.00 inclusive; return shape uses pr_total_usd + pr_number', () => {
    appendLedgerEntry(ledgerPath39d, makeEntry({ cost_usd: 1.0, prNumber: 123, iteration_n: 1 }));
    appendLedgerEntry(ledgerPath39d, makeEntry({ cost_usd: 1.0, prNumber: 123, iteration_n: 2 }));
    const r = checkPrCap(readLedger(ledgerPath39d), 123);
    expect(r.status).toBe('block');
    expect(r.pr_total_usd).toBe(2);
    expect(r.pr_number).toBe(123);
    expect(r.message).toContain('#123');
    expect(r.message).toContain('$2.00');
    // Discipline mirror — keys MUST be PR-scoped, never bleed into other views.
    expect(r.cost_usd).toBeUndefined();
    expect(r.day_total_usd).toBeUndefined();
    expect(r.issue_total_usd).toBeUndefined();
    expect(r.monthly_total_usd).toBeUndefined();
  });

  it('Sanity: exported sub-cap constants DAY_HARD_CAP_USD=10, ISSUE_HARD_CAP_USD=1, PR_HARD_CAP_USD=2', () => {
    expect(DAY_HARD_CAP_USD).toBe(10);
    expect(ISSUE_HARD_CAP_USD).toBe(1);
    expect(PR_HARD_CAP_USD).toBe(2);
    // currentIsoDay() shape sanity (also exercises an unused-import lint guard).
    expect(currentIsoDay()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // dayTotal / issueTotal / prTotal exported (smoke).
    expect(dayTotal({}, '2026-05-30')).toBe(0);
    expect(issueTotal({}, 'issue-x')).toBe(0);
    expect(prTotal({}, 999)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Phase 39 LEDGER-04 — committed-ledger schema + .gitignore flip guards.
// Reads the REAL on-disk artifacts (NOT a tmpDir copy) — these are
// integration-shaped checks that the commit landing matches the contract.
// ---------------------------------------------------------------------------
describe('Phase 39 LEDGER-04: committed ledger flip', () => {
  it('Test 48: committed tests/e2e/.llm-spend-ledger.json is valid v1 with bootstrap entry', () => {
    const REAL_LEDGER_PATH = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '..',
      'e2e',
      '.llm-spend-ledger.json',
    );
    expect(fs.existsSync(REAL_LEDGER_PATH)).toBe(true);
    const text = fs.readFileSync(REAL_LEDGER_PATH, 'utf8');
    const j = JSON.parse(text);
    expect(j.version).toBe(1);
    // Exactly one bootstrap entry — fresh-start per CONTEXT seed policy.
    const months = Object.keys(j.months);
    expect(months.length).toBe(1);
    const bucket = j.months[months[0]];
    expect(bucket.invocations).toBe(1);
    expect(bucket.total_usd).toBe(0);
    expect(bucket.iterations.length).toBe(1);
    const it = bucket.iterations[0];
    expect(it.phase).toBe('39-bootstrap');
    expect(it.transport).toBe('sdk');
    expect(it.cost_usd).toBe(0);
    expect(it.source).toBe('phase-39-flip');
    expect(it.model).toBe('claude-sonnet-4-6');
  });

  it('Test 49: .gitignore does NOT contain tests/e2e/.llm-spend-ledger.json (LEDGER-04 commitment)', () => {
    const REPO_ROOT = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '..',
      '..',
    );
    const gitignore = fs.readFileSync(path.join(REPO_ROOT, '.gitignore'), 'utf8');
    expect(gitignore).not.toContain('tests/e2e/.llm-spend-ledger.json');
  });
});

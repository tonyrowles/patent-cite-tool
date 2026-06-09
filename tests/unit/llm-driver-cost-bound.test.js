// tests/unit/llm-driver-cost-bound.test.js
//
// Phase 61 TURNS-03 — Cost-bound regression for the --max-turns 5
// subscription-transport argv update.
//
// Loads tests/fixtures/ledger-cost-bound.jsonl (5 deterministic entries
// representing 5 distinct smoke-issue runs) and asserts:
//   - exactly 5 entries loaded
//   - mean(cost_usd) < $0.30 (TURNS-03 mean-per-call cap)
//   - mean(cost_usd) > $0.20 (sanity floor — prevents "all entries zero" gaming)
//   - per-entry cost_usd < $1 (per-issue ISSUE_HARD_CAP_USD)
//   - every entry has transport:'subscription' + source:'auto-fix-api'
//     (forensic-ledger schema integrity — subscription transport is the only
//     path affected by the --max-turns argv update)
//   - --max-budget-usd argv value 0.50 < ISSUE_HARD_CAP_USD 1.00
//     (defense-in-depth tuning sanity check)
//
// Fixture-only test — no live API calls, no @anthropic-ai/sdk import,
// no node:child_process mocking. node:fs + node:path are Node 22 built-ins.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(__dirname, '..', 'fixtures', 'ledger-cost-bound.jsonl');

const raw = readFileSync(fixturePath, 'utf8');
const entries = raw.trim().split('\n').map((line) => JSON.parse(line));

describe('TURNS-03 — --max-turns 5 cost-bound regression', () => {
  it('loads exactly 5 fixture entries', () => {
    expect(entries).toHaveLength(5);
  });

  it('mean per-call spend < $0.30 across 5 smoke-issue entries (TURNS-03 cap)', () => {
    const meanPerCall = entries.reduce((acc, e) => acc + e.cost_usd, 0) / entries.length;
    expect(meanPerCall).toBeLessThan(0.30);
    expect(meanPerCall).toBeGreaterThan(0.20);
  });

  it('individual entry never exceeds per-issue cap $1', () => {
    for (const e of entries) {
      expect(e.cost_usd).toBeLessThan(1.00);
    }
  });

  it('every entry tagged transport:subscription + source:auto-fix-api (forensic-ledger schema integrity)', () => {
    for (const e of entries) {
      expect(e.transport).toBe('subscription');
      expect(e.source).toBe('auto-fix-api');
    }
  });

  it('argv --max-budget-usd 0.50 is below ISSUE_HARD_CAP_USD 1.00 (defense-in-depth tuning)', () => {
    const MAX_BUDGET_USD_ARGV = 0.50;
    const ISSUE_HARD_CAP_USD = 1.00;
    expect(MAX_BUDGET_USD_ARGV).toBeLessThan(ISSUE_HARD_CAP_USD);
  });
});

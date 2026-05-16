// tests/unit/select-cron-cases.test.js
//
// Phase 29 CRON-02 — exercises selectCronCases rotation determinism,
// Sunday full-suite branching, weekday 30-case sampling, --full override,
// deferred/synthetic exclusion, and modulus wrap-around.
//
// Uses vi.useFakeTimers() + vi.setSystemTime(date) so every assertion is
// fully hermetic — no flakiness from the test runner's actual wall-clock day.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { selectCronCases } from '../../scripts/select-cron-cases.mjs';
import { TEST_CASES } from '../test-cases.js';

// Must mirror tests/e2e/specs/regression.spec.js verbatim.
const SYNTHETIC_CATEGORIES = new Set(['gutter']);
const TIMEOUT_PILL_DEFERRED_IDS = new Set([
  'US11427642-repetitive',
  'US4723129-claims',
  'US5371234-chemical-cross-col',
  'US5371234-claims',
  'US7346586-claims-repetitive',
  'US8352400-claims',
  'US5440748-claims',
  'US5440748-repetitive',
  'US4723129-claims-repetitive',
]);

const LIVE_CASES = TEST_CASES.filter(tc =>
  !TIMEOUT_PILL_DEFERRED_IDS.has(tc.id) &&
  !SYNTHETIC_CATEGORIES.has(tc.category)
);

describe('selectCronCases', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('Sunday: returns all live cases (length=66)', () => {
    // 2026-05-17 is a Sunday in UTC (getUTCDay() === 0)
    vi.setSystemTime(new Date('2026-05-17T06:00:00Z'));
    const out = selectCronCases();
    expect(out.length).toBe(LIVE_CASES.length);
    expect(out.length).toBe(66);
  });

  it('Monday: returns exactly 30 live cases', () => {
    // 2026-05-18 is a Monday in UTC (getUTCDay() === 1)
    vi.setSystemTime(new Date('2026-05-18T06:00:00Z'));
    expect(selectCronCases().length).toBe(30);
  });

  it('determinism: same date = same selection', () => {
    vi.setSystemTime(new Date('2026-05-18T06:00:00Z'));
    const a = selectCronCases();
    const b = selectCronCases();
    expect(a.map(c => c.id)).toEqual(b.map(c => c.id));
  });

  it('forceFull: returns all live cases on any weekday', () => {
    // 2026-05-19 is a Tuesday in UTC (getUTCDay() === 2)
    vi.setSystemTime(new Date('2026-05-19T06:00:00Z'));
    const out = selectCronCases({ forceFull: true });
    expect(out.length).toBe(LIVE_CASES.length);
  });

  it('weekday output contains no deferred or synthetic cases', () => {
    vi.setSystemTime(new Date('2026-05-18T06:00:00Z'));
    const out = selectCronCases();
    for (const c of out) {
      expect(TIMEOUT_PILL_DEFERRED_IDS.has(c.id)).toBe(false);
      expect(SYNTHETIC_CATEGORIES.has(c.category)).toBe(false);
    }
  });

  it('different weekdays produce different windows', () => {
    vi.setSystemTime(new Date('2026-05-18T06:00:00Z')); // Monday
    const mon = selectCronCases().map(c => c.id);
    vi.setSystemTime(new Date('2026-05-19T06:00:00Z')); // Tuesday
    const tue = selectCronCases().map(c => c.id);
    expect(mon).not.toEqual(tue);
  });

  it('output IDs are unique strings', () => {
    vi.setSystemTime(new Date('2026-05-18T06:00:00Z'));
    const out = selectCronCases();
    const ids = out.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every(id => typeof id === 'string' && id.length > 0)).toBe(true);
  });

  it('modulus wrap-around at boundary (offset > liveCount - 30)', () => {
    // 2026-12-29 is a Tuesday; weekOfYear=52, dayOfWeek=2
    // (52 + 2) % 66 = 54 — which is > 36 (36 + 30 = 66), so wrap occurs.
    vi.setSystemTime(new Date('2026-12-29T06:00:00Z'));
    const out = selectCronCases();
    expect(out.length).toBe(30);
    // First case ID must NOT equal last case ID (proves array wraps, not truncates)
    expect(out[0].id).not.toBe(out[29].id);
  });
});

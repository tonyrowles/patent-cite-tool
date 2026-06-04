// tests/unit/weekly-digest-auto-fix.test.js
//
// Phase 55 Plan 01 (DASH-01..03) — pin the Auto-Fix Pipeline section emitted
// by scripts/weekly-digest.mjs and wired into runDigest's step (6.5).
//
// PIN MATRIX (D-19 traceable):
//
//   Test 2 (D-19.2)  Rendered section matches the /<details>\s*<summary>Auto-Fix
//                    Pipeline<\/summary>/ regex — confirms collapsible structure.
//   Test 3 (D-19.3)  All 7 metric key strings (auto_fix_attempted, verified_merged,
//                    success_rate, cost_per_fix, time_to_merge_p50, fix_attempts_p50,
//                    flake_escalation_count) appear via individual toContain.
//   Test 4 (degrade) fetchAutoFixPrs with a throwing execFn returns {prs:[], error},
//                    and renderAutoFixPipelineSection called with that result yields
//                    a section whose value column is all `n/a` except
//                    flake_escalation_count = 0 (D-09 count semantics).
//   Test 5 (D-06)    cost_per_fix uses combinedMonthlyTotalByTransport(ledger).combined
//                    as the numerator — synthetic ledger total 2.40 / 4 attempts → $0.6000.
//
// Test 1 (D-19.1)  SUMMARY_KEYS.length === 7 — lives in tests/unit/llm-report.test.js
//                  at line 406; intentionally NOT duplicated here. The acceptance
//                  step re-runs it as a regression gate via `vitest -t "SUMMARY_KEYS"`.

import { describe, it, expect } from 'vitest';
import {
  renderAutoFixPipelineSection,
  fetchAutoFixPrs,
} from '../../scripts/weekly-digest.mjs';

// -------- helpers (synthetic fixtures inline; no I/O against committed ledger) --------

function makeLedger(month, total_usd, iterations = []) {
  return {
    version: 1,
    months: {
      [month]: {
        invocations: iterations.length,
        total_usd,
        last_invocation_iso: `${month}-15T12:00:00.000Z`,
        iterations,
      },
    },
  };
}

function makePr({
  number,
  labels = [],
  mergedAt = null,
  createdAt = '2026-06-01T10:00:00Z',
  body = '',
} = {}) {
  return {
    number,
    state: mergedAt ? 'CLOSED' : 'OPEN',
    mergedAt,
    createdAt,
    labels: labels.map((name) => ({ name })),
    body,
  };
}

const NOW = new Date('2026-06-04T12:00:00Z');

// ------------------------------------------------------------------------------
// Test 2 (D-19.2) — collapsible <details>/<summary> structure
// ------------------------------------------------------------------------------

describe('Phase 55 DASH-01..03 — Auto-Fix Pipeline section', () => {
  it('Test 2 (D-19.2): emits a <details>/<summary>Auto-Fix Pipeline</summary> wrapper', () => {
    const md = renderAutoFixPipelineSection({
      ledger: makeLedger('2026-06', 0),
      ghPrs: [],
      now: NOW,
    });
    expect(md).toMatch(/<details>\s*<summary>Auto-Fix Pipeline<\/summary>/);
    expect(md).toContain('</details>');
  });

  // ----------------------------------------------------------------------------
  // Test 3 (D-19.3) — all 7 metric key strings present (LOCKED order)
  // ----------------------------------------------------------------------------

  it('Test 3 (D-19.3): contains all 7 metric key strings in LOCKED order', () => {
    const md = renderAutoFixPipelineSection({
      ledger: makeLedger('2026-06', 0),
      ghPrs: [],
      now: NOW,
    });
    const lockedKeys = [
      'auto_fix_attempted',
      'verified_merged',
      'success_rate',
      'cost_per_fix',
      'time_to_merge_p50',
      'fix_attempts_p50',
      'flake_escalation_count',
    ];
    for (const k of lockedKeys) {
      expect(md).toContain(k);
    }
    // LOCKED-order assertion: each metric key appears strictly after the prior.
    let lastIdx = -1;
    for (const k of lockedKeys) {
      const idx = md.indexOf(k);
      expect(idx).toBeGreaterThan(lastIdx);
      lastIdx = idx;
    }
  });

  // ----------------------------------------------------------------------------
  // Test 4 (degradation) — fetchAutoFixPrs error path → section is all-n/a
  // ----------------------------------------------------------------------------

  it('Test 4: fetchAutoFixPrs catches execFn throws and section renders all-n/a (D-15, D-09)', () => {
    const result = fetchAutoFixPrs({
      now: NOW,
      execFn: () => {
        throw new Error('gh: command not found');
      },
    });
    expect(result.prs).toEqual([]);
    expect(result.error).toBeTruthy();
    expect(result.error).toMatch(/gh: command not found/);
    expect(result.fetchedAt).toBeInstanceOf(Date);

    const md = renderAutoFixPipelineSection({
      ledger: makeLedger('2026-06', 0),
      ghPrs: result.prs,
      now: NOW,
    });
    // success_rate / cost_per_fix / time_to_merge_p50 / fix_attempts_p50 → n/a
    expect(md).toMatch(/\| success_rate \| n\/a \|/);
    expect(md).toMatch(/\| cost_per_fix \| n\/a \|/);
    expect(md).toMatch(/\| time_to_merge_p50 \| n\/a \|/);
    expect(md).toMatch(/\| fix_attempts_p50 \| n\/a \|/);
    // auto_fix_attempted / verified_merged / flake_escalation_count → integer 0 (D-09)
    expect(md).toMatch(/\| auto_fix_attempted \| 0 \|/);
    expect(md).toMatch(/\| verified_merged \| 0 \|/);
    expect(md).toMatch(/\| flake_escalation_count \| 0 \|/);
  });

  // ----------------------------------------------------------------------------
  // Test 5 (D-06 / SC-3) — cost_per_fix uses combinedMonthlyTotalByTransport.combined
  // ----------------------------------------------------------------------------

  it('Test 5 (D-06/SC-3): cost_per_fix = combined / auto_fix_attempted (synthetic 2.40 / 4 = $0.6000)', () => {
    const ledger = makeLedger('2026-06', 2.4, [
      // Iterations exist so by_transport sums populate, but combined is
      // sourced from bucket.total_usd (the de-duplicated field per D-06).
      { iso: '2026-06-01T10:00:00Z', cost_usd: 0.6, transport: 'subscription' },
      { iso: '2026-06-02T10:00:00Z', cost_usd: 0.6, transport: 'subscription' },
      { iso: '2026-06-03T10:00:00Z', cost_usd: 0.6, transport: 'sdk' },
      { iso: '2026-06-04T10:00:00Z', cost_usd: 0.6, transport: 'sdk' },
    ]);
    // 4 verified-labeled PRs → auto_fix_attempted === 4
    const ghPrs = [
      makePr({ number: 1, labels: ['auto-fix:verified'], mergedAt: '2026-06-02T10:00:00Z', createdAt: '2026-06-02T09:00:00Z' }),
      makePr({ number: 2, labels: ['auto-fix:verified'], mergedAt: '2026-06-03T10:00:00Z', createdAt: '2026-06-03T09:00:00Z' }),
      makePr({ number: 3, labels: ['auto-fix:verified'], mergedAt: null }),
      makePr({ number: 4, labels: ['auto-fix:partial-verified'], mergedAt: null }),
    ];
    const md = renderAutoFixPipelineSection({ ledger, ghPrs, now: NOW });
    // 2.40 / 4 = 0.6000
    expect(md).toMatch(/\| cost_per_fix \| \$0\.6000 \|/);
    // auto_fix_attempted = 4 (both labels counted)
    expect(md).toMatch(/\| auto_fix_attempted \| 4 \|/);
    // verified_merged = 2 (verified + mergedAt !== null)
    expect(md).toMatch(/\| verified_merged \| 2 \|/);
    // success_rate = (2 / 4) * 100 = 50.0%
    expect(md).toMatch(/\| success_rate \| 50\.0% \|/);
  });
});

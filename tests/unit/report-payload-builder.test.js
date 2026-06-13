// tests/unit/report-payload-builder.test.js
//
// Phase 2 Plan 01 (PAY-07) — Vitest suite for src/shared/report-payload-builder.js
// and the Phase 2 additions to src/shared/constants.js.
//
// Pins all four Phase 2 Success Criteria plus D-05 throws and D-08 defaults.
//
// Coverage:
//   Test 1:  SC3 byte-stable determinism — two identical calls → same JSON.stringify
//   Test 2:  SC1 allowlist-only — output keys are a subset of the 17 allowlisted fields
//   Test 3:  SC1 extra input field does NOT propagate to output
//   Test 4:  SC1 server-computed / PAY-03 fields never present
//   Test 5:  SC2 selectionText absent (not null) when includeSelectionText=false (D-06)
//   Test 6:  SC2 selectionText present when includeSelectionText=true
//   Test 7:  SC4 REPORT_CATEGORIES is frozen 4-element array in exact order
//   Test 8:  SC4 MSG.SUBMIT_REPORT is the kebab-case string 'submit-report'
//   Test 9:  SC4 WORKER_REPORT_URL points at the Phase 1 route
//   Test 10: SC4 static-grep — builder source has zero browser API calls
//   Test 11: SC4 static-grep — constants source has zero browser API calls
//   Test 12: D-05 throws on missing patentNumber
//   Test 13: D-05 throws on invalid category
//   Test 14: D-05 throws on missing extensionVersion
//   Test 15: D-08 defaults — errorLog=[], note=null, patentUrl derived, nullable→null

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildReportPayload } from '../../src/shared/report-payload-builder.js';
import { REPORT_CATEGORIES, WORKER_REPORT_URL, MSG } from '../../src/shared/constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Canonical schema field order (report-schema.md allowlist minus server-computed)
// Used by SC1 subset assertion.
// ---------------------------------------------------------------------------

const SCHEMA_ALLOWLIST = [
  'category',
  'patentNumber',
  'patentUrl',
  'selectionText',
  'returnedCitation',
  'confidenceTier',
  'extensionVersion',
  'browser',
  'os',
  'xpathNode',
  'scrollY',
  'viewportWidth',
  'viewportHeight',
  'pdfParseStatus',
  'triggerMode',
  'errorLog',
  'note',
];

// ---------------------------------------------------------------------------
// Fresh-fixture factory — each test gets a fresh object to prevent mutation bleed.
// Mirror of makeFixtureInputs() in issue-payload-builder.test.js.
// ---------------------------------------------------------------------------

function makeReportInputs(overrides = {}) {
  return {
    context: {
      patentNumber: '12505414',
      patentUrl: 'https://patents.google.com/patent/US12505414',
      selectionText: 'The method of claim 1 wherein the widget comprises',
      returnedCitation: '4:5-20',
      confidenceTier: 'green',
      extensionVersion: '5.0.0',
      browser: 'Chrome/125',
      os: 'Windows 10',
      xpathNode: '/html/body/div[3]/p[2]',
      scrollY: 340,
      viewportWidth: 1280,
      viewportHeight: 800,
      pdfParseStatus: 'success',
    },
    category: 'no_match',
    note: null,
    settings: { triggerMode: 'floating' },
    errors: [],
    includeSelectionText: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test 1: SC3 — byte-stable determinism
// ---------------------------------------------------------------------------

describe('buildReportPayload() — SC3 byte-stable serialization', () => {
  it('Test 1: two identical calls produce byte-identical JSON.stringify output', () => {
    const inputs = makeReportInputs();
    const a = buildReportPayload(inputs);
    const b = buildReportPayload(inputs);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

// ---------------------------------------------------------------------------
// Tests 2-4: SC1 — allowlist-only output
// ---------------------------------------------------------------------------

describe('buildReportPayload() — SC1 allowlist-only output', () => {
  it('Test 2: all output keys are within the 17-field schema allowlist', () => {
    const payload = buildReportPayload(makeReportInputs());
    const keys = Object.keys(payload);
    for (const key of keys) {
      expect(SCHEMA_ALLOWLIST).toContain(key);
    }
  });

  it('Test 3: an extra input field on context does NOT propagate to output', () => {
    const inputs = makeReportInputs();
    inputs.context.bogusExtra = 'attacker-value';
    const keys = Object.keys(buildReportPayload(inputs));
    expect(keys).not.toContain('bogusExtra');
  });

  it('Test 4: server-computed and PAY-03 forbidden fields are never in output', () => {
    const payload = buildReportPayload(makeReportInputs());
    const keys = Object.keys(payload);
    // Server-computed fields must not be sent (report-schema.md server-computed set)
    expect(keys).not.toContain('fingerprint');
    expect(keys).not.toContain('timestamp');
    expect(keys).not.toContain('duplicate_count');
    // PAY-03 hard-constraint forbidden fields (report-schema.md:58-68)
    expect(keys).not.toContain('ip');
    expect(keys).not.toContain('clientIp');
    expect(keys).not.toContain('userAgent');
  });
});

// ---------------------------------------------------------------------------
// Tests 5-6: SC2 — selectionText conditional key (D-06)
// ---------------------------------------------------------------------------

describe('buildReportPayload() — SC2 selectionText absent/present (D-06)', () => {
  it('Test 5: selectionText key is ENTIRELY ABSENT when includeSelectionText=false', () => {
    const payload = buildReportPayload(makeReportInputs({ includeSelectionText: false }));
    // Must be absent — not null, not '' — per D-06 / SC2
    expect('selectionText' in payload).toBe(false);
  });

  it('Test 6: selectionText key is present when includeSelectionText=true', () => {
    const payload = buildReportPayload(makeReportInputs({ includeSelectionText: true }));
    expect('selectionText' in payload).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tests 7-11: SC4 — constants importable + zero browser-API calls (static-grep)
// ---------------------------------------------------------------------------

describe('constants.js — SC4 PAY-05 additions importable with correct values', () => {
  it('Test 7: REPORT_CATEGORIES is frozen and has the exact 4-element order', () => {
    expect(Object.isFrozen(REPORT_CATEGORIES)).toBe(true);
    expect(REPORT_CATEGORIES).toEqual([
      'inaccurate_citation',
      'no_match',
      'tool_not_working',
      'other',
    ]);
  });

  it('Test 8: MSG.SUBMIT_REPORT is the kebab-case message type string', () => {
    expect(MSG.SUBMIT_REPORT).toBe('submit-report');
  });

  it('Test 9: WORKER_REPORT_URL points at the Phase 1 /report route', () => {
    expect(WORKER_REPORT_URL).toBe('https://pct.tonyrowles.com/report');
  });
});

describe('report-payload-builder.js — SC4 purity static-grep', () => {
  it('Test 10: builder source has zero browser API calls and no node-builtin imports', () => {
    const builderPath = path.resolve(__dirname, '../../src/shared/report-payload-builder.js');
    const src = readFileSync(builderPath, 'utf8');
    // SC4: no browser extension API calls in the module code
    expect(src).not.toMatch(/chrome\s*\./);
    // No node built-in imports (purity invariant — D-07)
    expect(src).not.toMatch(/from\s+['"]node:(fs|path|child_process|crypto)['"]/);
  });
});

describe('constants.js — SC4 purity static-grep', () => {
  it('Test 11: constants source has zero browser API calls', () => {
    const constantsPath = path.resolve(__dirname, '../../src/shared/constants.js');
    const src = readFileSync(constantsPath, 'utf8');
    expect(src).not.toMatch(/chrome\s*\./);
  });
});

// ---------------------------------------------------------------------------
// Tests 12-14: D-05 — required-field throw assertions
// ---------------------------------------------------------------------------

describe('buildReportPayload() — D-05 required-field throws', () => {
  it('Test 12: throws when context.patentNumber is missing', () => {
    // Override context to omit patentNumber
    expect(() =>
      buildReportPayload(makeReportInputs({ context: { extensionVersion: '5.0.0' } }))
    ).toThrow();
  });

  it('Test 12b: throws when context.patentNumber is an empty string', () => {
    const inputs = makeReportInputs();
    inputs.context.patentNumber = '';
    expect(() => buildReportPayload(inputs)).toThrow();
  });

  it('Test 13: throws when category is not in REPORT_CATEGORIES', () => {
    expect(() =>
      buildReportPayload(makeReportInputs({ category: 'bogus' }))
    ).toThrow();
  });

  it('Test 14: throws when context.extensionVersion is missing', () => {
    const inputs = makeReportInputs();
    delete inputs.context.extensionVersion;
    expect(() => buildReportPayload(inputs)).toThrow();
  });

  it('Test 14b: throws when context.extensionVersion is an empty string', () => {
    const inputs = makeReportInputs();
    inputs.context.extensionVersion = '';
    expect(() => buildReportPayload(inputs)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Test 15: D-08 defaults — minimal-input fixture
// ---------------------------------------------------------------------------

describe('buildReportPayload() — D-08 defaults on minimal input', () => {
  it('Test 15: errorLog=[], note=null, patentUrl derived, nullable fields→null', () => {
    const payload = buildReportPayload({
      context: { patentNumber: '12505414', extensionVersion: '5.0.0' },
      category: 'other',
      includeSelectionText: false,
    });
    // D-08: errorLog defaults to [] when errors is omitted
    expect(payload.errorLog).toEqual([]);
    // D-08: note defaults to null when note is omitted
    expect(payload.note).toBe(null);
    // D-08: patentUrl derived from patentNumber when absent from context
    expect(payload.patentUrl).toBe('https://patents.google.com/patent/US12505414');
    // D-08: nullable diagnostics default to null when absent
    expect(payload.returnedCitation).toBe(null);
    expect(payload.browser).toBe(null);
    expect(payload.os).toBe(null);
    expect(payload.xpathNode).toBe(null);
    expect(payload.scrollY).toBe(null);
    expect(payload.viewportWidth).toBe(null);
    expect(payload.viewportHeight).toBe(null);
    expect(payload.pdfParseStatus).toBe(null);
    expect(payload.triggerMode).toBe(null);
  });

  it('Test 16: errorLog is a defensive copy — appending to the caller ring buffer after the call does not alter the payload (D-07 purity)', () => {
    const errors = [{ message: 'boom' }];
    const payload = buildReportPayload({
      context: { patentNumber: '12505414', extensionVersion: '5.0.0' },
      category: 'other',
      errors,
      includeSelectionText: false,
    });
    const snapshot = JSON.stringify(payload);
    // The errors arg is a live ring buffer — entries keep arriving after the call.
    // A referenced (non-copied) errorLog would grow with it and break byte-stability.
    errors.push({ message: 'late-arriving error' });
    expect(payload.errorLog).toHaveLength(1);
    expect(JSON.stringify(payload)).toBe(snapshot);
  });
});

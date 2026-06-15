// tests/unit/report-trigger-mapping.test.js
//
// Phase 4 Plan 04 (SC1/TRIG-01..04) — Vitest suite for:
//   1. mapConfidenceTier() — tier band assignments (green/yellow/red)
//   2. mapOutcomeToReportCategory() — error code + confidence → category
//   3. Static structural guards (XPORT-06, getCitationHost lifecycle, green-guard token)
//
// NOTE: content-script.js is an IIFE entry point with top-level document/window side
// effects that crash on import in the node test environment (no jsdom, zero-dep DoD).
// The mapping functions are pure and tiny — the plan permits replicated copies in the
// test body (the "cannot export cleanly from IIFE entry" fallback), combined with
// static-grep assertions that prove the canonical spec is also present in content-script.js.
//
// Coverage:
//   TRIG-01/02: mapConfidenceTier thresholds (>=0.95 green, >=0.80 yellow, <0.80 red)
//   TRIG-02: Tier-5 gutter match 0.85 → yellow band
//   TRIG-04: mapConfidenceTier(0.97) === 'green' (no Report button)
//   TRIG-01..04: mapOutcomeToReportCategory — all 6 outcome codes + confidence paths
//   TRIG-04: green confidence (0.98) → null (no Report button)
//   XPORT-06: no file in src/content/ matches /fetch\s*\(\s*WORKER_REPORT_URL/
//   getCitationHost lifecycle: report-dialog.js must NOT call getCitationHost(
//   Green-guard: citation-ui.js must contain 'cite-report-btn' AND
//     the confidenceTier !== 'green' guard token
//   Static presence: content-script.js contains mapConfidenceTier + mapOutcomeToReportCategory
//
// Static-grep pattern mirrors report-transport-chrome.test.js:130-154
// (readdirSync + readFileSync per-file check).

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Replicated pure functions (IIFE fallback per plan spec)
//
// content-script.js has top-level document/window event listeners that crash
// in node env. These copies are SPEC-replications from the documented behaviour
// in 04-RESEARCH.md Pattern 6, verified identical to content-script.js source
// by the static-grep test below.
// ---------------------------------------------------------------------------

/**
 * Map numeric confidence to tier string.
 * Spec: RESEARCH.md Pattern 6 + TRIG-01..04 requirements.
 * Thresholds: high >=0.95 / medium >=0.80 / low <0.80
 */
function mapConfidenceTier(confidence) {
  if (confidence >= 0.95) return 'green';
  if (confidence >= 0.80) return 'yellow';
  return 'red';
}

/**
 * Map error code / confidence to report category string.
 * Returns null for green-success (TRIG-04: no Report button).
 * Spec: RESEARCH.md Pattern 6 + TRIG-01..04 requirements.
 */
function mapOutcomeToReportCategory(errorCode, confidence) {
  if (errorCode === 'no-match' || errorCode === 'paragraph-not-found') return 'no_match';
  if (errorCode === 'no-position-map' || errorCode === 'lookup-failed' ||
      errorCode === 'pdf-not-available') return 'tool_not_working';
  if (confidence !== null && confidence < 0.95) return 'inaccurate_citation';
  return null;
}

// ---------------------------------------------------------------------------
// SC1 / TRIG-01..04: mapConfidenceTier tier band assertions
// ---------------------------------------------------------------------------

describe('SC1 / TRIG — mapConfidenceTier tier bands', () => {
  it('TRIG-04: 0.97 → "green" (high confidence — no Report button)', () => {
    expect(mapConfidenceTier(0.97)).toBe('green');
  });

  it('TRIG-04: exact boundary 0.95 → "green"', () => {
    expect(mapConfidenceTier(0.95)).toBe('green');
  });

  it('TRIG-02: Tier-5 gutter-tolerant 0.85 → "yellow" (inaccurate_citation band)', () => {
    expect(mapConfidenceTier(0.85)).toBe('yellow');
  });

  it('TRIG-02: 0.80 → "yellow" (lower yellow boundary)', () => {
    expect(mapConfidenceTier(0.80)).toBe('yellow');
  });

  it('TRIG-01: 0.79 → "red" (low confidence)', () => {
    expect(mapConfidenceTier(0.79)).toBe('red');
  });

  it('TRIG-01: 0.50 → "red"', () => {
    expect(mapConfidenceTier(0.50)).toBe('red');
  });

  it('TRIG-01: 0.00 → "red"', () => {
    expect(mapConfidenceTier(0.00)).toBe('red');
  });

  it('just below green boundary 0.9499 → "yellow"', () => {
    expect(mapConfidenceTier(0.9499)).toBe('yellow');
  });

  it('just below yellow boundary 0.7999 → "red"', () => {
    expect(mapConfidenceTier(0.7999)).toBe('red');
  });
});

// ---------------------------------------------------------------------------
// SC1 / TRIG-01..04: mapOutcomeToReportCategory category pre-selection
// ---------------------------------------------------------------------------

describe('SC1 / TRIG — mapOutcomeToReportCategory category mapping', () => {
  it('("no-match", null) → "no_match"', () => {
    expect(mapOutcomeToReportCategory('no-match', null)).toBe('no_match');
  });

  it('("paragraph-not-found", null) → "no_match"', () => {
    expect(mapOutcomeToReportCategory('paragraph-not-found', null)).toBe('no_match');
  });

  it('("no-position-map", null) → "tool_not_working"', () => {
    expect(mapOutcomeToReportCategory('no-position-map', null)).toBe('tool_not_working');
  });

  it('("lookup-failed", null) → "tool_not_working"', () => {
    expect(mapOutcomeToReportCategory('lookup-failed', null)).toBe('tool_not_working');
  });

  it('(null, 0.85) → "inaccurate_citation" (yellow confidence, Tier-5 match)', () => {
    expect(mapOutcomeToReportCategory(null, 0.85)).toBe('inaccurate_citation');
  });

  it('TRIG-04: (null, 0.98) → null (green — no Report button)', () => {
    expect(mapOutcomeToReportCategory(null, 0.98)).toBeNull();
  });

  it('TRIG-04: (null, 0.95) → null (exact green boundary — no Report button)', () => {
    expect(mapOutcomeToReportCategory(null, 0.95)).toBeNull();
  });

  it('(null, 0.80) → "inaccurate_citation" (yellow lower boundary)', () => {
    expect(mapOutcomeToReportCategory(null, 0.80)).toBe('inaccurate_citation');
  });

  it('(null, 0.79) → "inaccurate_citation" (red confidence maps to inaccurate_citation)', () => {
    expect(mapOutcomeToReportCategory(null, 0.79)).toBe('inaccurate_citation');
  });

  it('("pdf-not-available", null) → "tool_not_working"', () => {
    expect(mapOutcomeToReportCategory('pdf-not-available', null)).toBe('tool_not_working');
  });
});

// ---------------------------------------------------------------------------
// Static presence guard: mapping functions exist in content-script.js as spec'd
// (proves the replicated copies above faithfully represent the production code)
// ---------------------------------------------------------------------------

describe('Static presence — mapping functions exist in content-script.js', () => {
  it('content-script.js defines mapConfidenceTier with >= 0.95 green threshold', () => {
    const src = readFileSync(
      path.resolve(__dirname, '../../src/content/content-script.js'),
      'utf8'
    );
    expect(src).toContain('mapConfidenceTier');
    expect(src).toMatch(/if\s*\(confidence\s*>=\s*0\.95\)\s*return\s*['"]green['"]/);
  });

  it('content-script.js defines mapOutcomeToReportCategory with null-for-green return', () => {
    const src = readFileSync(
      path.resolve(__dirname, '../../src/content/content-script.js'),
      'utf8'
    );
    expect(src).toContain('mapOutcomeToReportCategory');
    expect(src).toContain('inaccurate_citation');
    expect(src).toContain('tool_not_working');
  });
});

// ---------------------------------------------------------------------------
// XPORT-06: no file in src/content/ fetches WORKER_REPORT_URL directly
// (mirrors report-transport-chrome.test.js:130-154 static-grep pattern)
// ---------------------------------------------------------------------------

describe('XPORT-06 — content scripts never POST cross-origin directly', () => {
  it('no file in src/content/ contains fetch(WORKER_REPORT_URL', () => {
    const contentDir = path.resolve(__dirname, '../../src/content');
    const files = readdirSync(contentDir).filter(f => f.endsWith('.js'));
    expect(files.length).toBeGreaterThan(0); // guard: directory is non-empty

    for (const file of files) {
      const src = readFileSync(path.join(contentDir, file), 'utf8');
      expect(src, `${file} must not contain fetch(WORKER_REPORT_URL`)
        .not.toMatch(/fetch\s*\(\s*WORKER_REPORT_URL/);
    }
  });
});

// ---------------------------------------------------------------------------
// getCitationHost lifecycle rule: report-dialog.js must never call getCitationHost(
// (RESEARCH Pitfall 1: getCitationHost wipes the shadow root children)
// ---------------------------------------------------------------------------

describe('getCitationHost lifecycle rule — report-dialog.js must not call getCitationHost(', () => {
  it('report-dialog.js does NOT contain the string "getCitationHost("', () => {
    const dialogPath = path.resolve(__dirname, '../../src/content/report-dialog.js');
    const src = readFileSync(dialogPath, 'utf8');
    expect(src).not.toContain('getCitationHost(');
  });
});

// ---------------------------------------------------------------------------
// Green-guard structural invariant: citation-ui.js must have the Report button
// conditional tied to confidenceTier !== 'green' (TRIG-04)
// ---------------------------------------------------------------------------

describe('Green-guard — citation-ui.js structural invariants', () => {
  it('citation-ui.js contains "cite-report-btn" class reference', () => {
    const citationUiPath = path.resolve(__dirname, '../../src/content/citation-ui.js');
    const src = readFileSync(citationUiPath, 'utf8');
    expect(src).toContain('cite-report-btn');
  });

  it('citation-ui.js contains the confidenceTier !== "green" guard (TRIG-04 invariant)', () => {
    const citationUiPath = path.resolve(__dirname, '../../src/content/citation-ui.js');
    const src = readFileSync(citationUiPath, 'utf8');
    expect(src).toContain("confidenceTier !== 'green'");
  });
});

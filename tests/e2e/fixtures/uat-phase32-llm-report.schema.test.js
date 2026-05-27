// tests/e2e/fixtures/uat-phase32-llm-report.schema.test.js
//
// Phase 32 Plan 32-01 (Wave 0 scaffolding, UAT-03) — schema-guard for the
// uat-phase32-llm-report.json fixture that Wave 3 Plan 32-05 will commit
// alongside this file. In Wave 0 the fixture does not exist; each test uses
// `it.skipIf(!fs.existsSync(FIXTURE))` so the spec reports SKIPPED (not
// FAILED). Once Plan 32-05 commits the real fixture next to this file the
// SAME tests turn GREEN with zero further code change — they auto-unskip.
//
// Per RESEARCH Pitfall 1 — semantic correctness is Phase 33's gate; this test
// validates STRUCTURE ONLY. Do not add verdict-distribution assertions here.
// (Phase 33 owns "is the LLM picking sensible iterations". Phase 32 owns "is
// the fixture file shaped like every other report.json in this codebase".)
//
// Round-trip pattern mirrors tests/unit/llm-report.test.js Test 13 (lines
// 304-316): synthesize an empty report skeleton in a tmpDir, then call
// appendLlmIteration() for every iteration in the real fixture. The
// REQUIRED_ENTRY_FIELDS validator inside appendLlmIteration throws on any
// missing field — that is the only schema gate this test enforces.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendLlmIteration } from '../lib/llm-report.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(__dirname, 'uat-phase32-llm-report.json');

let tmpDir;
let tmpReportPath;

beforeEach(() => {
  // Throwaway tmpDir for the round-trip test — mirrors
  // tests/unit/llm-report.test.js beforeEach (lines 51-57).
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pct-uat-phase32-'));
  tmpReportPath = path.join(tmpDir, 'llm-report.json');
  // Seed an empty report skeleton — shape from emptyReport() at
  // tests/e2e/lib/llm-report.js lines 133-143.
  const now = new Date().toISOString();
  fs.writeFileSync(tmpReportPath, JSON.stringify({
    run_id: 'uat-phase32-schema-test',
    started_iso: now,
    finished_iso: now,
    iterations_total: 0,
    summary: {
      passed: 0,
      wrong_citation: 0,
      verifier_disagree: 0,
      llm_hallucinated_selection: 0,
      llm_api_error: 0,
      harness_error: 0,
      total_cost_usd: 0,
    },
    iterations: [],
  }, null, 2));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('uat-phase32-llm-report.json — schema guard (Phase 32 Wave 3)', () => {
  it.skipIf(!fs.existsSync(FIXTURE))('fixture exists at tests/e2e/fixtures/uat-phase32-llm-report.json', () => {
    expect(fs.existsSync(FIXTURE)).toBe(true);
  });

  it.skipIf(!fs.existsSync(FIXTURE))('fixture has >=10 iterations (D-10 pass bar)', () => {
    const fixture = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
    expect(Array.isArray(fixture.iterations)).toBe(true);
    expect(fixture.iterations.length).toBeGreaterThanOrEqual(10);
  });

  it.skipIf(!fs.existsSync(FIXTURE))('every iteration passes appendLlmIteration schema guard (REQUIRED_ENTRY_FIELDS)', () => {
    const fixture = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
    // Round-trip every iteration through appendLlmIteration — its
    // REQUIRED_ENTRY_FIELDS validator throws on missing iteration_n / iso /
    // classification. If all iterations append without throwing, the
    // fixture's structure is valid.
    for (const iter of fixture.iterations) {
      expect(() => appendLlmIteration(tmpReportPath, iter)).not.toThrow();
    }
  });

  it.skipIf(!fs.existsSync(FIXTURE))('schema_version: 1 at top level (D-15 Phase 33)', () => {
    const fixture = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
    expect(fixture.schema_version).toBe(1);
  });

  it.skipIf(!fs.existsSync(FIXTURE))('every iteration has 4 capture-state keys present (RERUN-03)', () => {
    const fixture = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
    for (const iter of fixture.iterations) {
      expect(iter).toHaveProperty('scroll_y');
      expect(iter).toHaveProperty('viewport_width');
      expect(iter).toHaveProperty('viewport_height');
      expect(iter).toHaveProperty('selected_node_xpath');
    }
  });
});

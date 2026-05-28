// tests/unit/llm-report.test.js
//
// Phase 31 (LLM-08) — coverage for the append-only llm-report.json writer.
//
// Mirrors tests/unit/report.test.js exactly (Phase 28 RPT-01 pattern):
//   - per-test tmpDir + per-run subdir so reportPath is hermetic
//   - direct JSON.parse(fs.readFileSync) for read-back assertions
//   - explicit afterEach cleanup
//
// Coverage map:
//   1.  llmReportPathFor returns absolute path under tests/e2e/artifacts/{runId}/
//   2.  initLlmReport seeds the empty skeleton with summary all zeros
//   3.  initLlmReport is idempotent — does NOT clobber existing iterations
//   4.  appendLlmIteration with PASS classification → summary.passed++
//   5.  appendLlmIteration with LLM_HALLUCINATED_SELECTION → that key++ AND
//        total_cost_usd increases (the LLM was still called — cost incurred)
//   6.  appendLlmIteration with LLM_API_ERROR + cost_usd=0 → that key++ and
//        total_cost_usd unchanged (the partial-run safety guarantee)
//   7.  3 mixed appends — summary counts and total_cost_usd are correctly
//        recomputed from the iterations array
//   8.  finalizeLlmReport stamps finished_iso to current ISO timestamp; the
//        timestamp is >= started_iso; summary is unchanged
//   9.  appendLlmIteration creates the dir if missing (mkdir recursive)
//   10. After every append, JSON.parse of the file succeeds (atomic guarantee)
//   11. llm_raw_response > 2000 chars is truncated to exactly 2000; <= 2000 is
//        passed through unchanged
//   12. appendLlmIteration rejects entries missing required fields (iteration_n,
//        iso, classification) — throws a descriptive Error
//   13. Fixture sample-llm-report.json parses and totals are consistent
//   14. SUMMARY_KEYS is frozen, exported, 7 keys in canonical order (Phase 37 D-01)
//   15. SUMMARY_KEYS exact order: passed → total_cost_usd
//   16. emptySummary() derives from SUMMARY_KEYS (single-source proof via initLlmReport)

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LLM_REPORT_FILENAME,
  llmReportPathFor,
  initLlmReport,
  appendLlmIteration,
  finalizeLlmReport,
  SUMMARY_KEYS,
} from '../e2e/lib/llm-report.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.resolve(__dirname, 'fixtures/sample-llm-report.json');

let tmpDir;
let reportPath;
const RUN_ID = '2026-05-18T10-00-00Z';

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pct-llm-report-test-'));
  // mirror the runDir pattern from report.test.js
  const runDir = path.join(tmpDir, RUN_ID);
  fs.mkdirSync(runDir, { recursive: true });
  reportPath = path.join(runDir, 'llm-report.json');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeIteration(overrides = {}) {
  return {
    iteration_n: 1,
    iso: '2026-05-18T10:00:30.000Z',
    llm_selection: {
      caseId: 'US11427642-llm-001',
      patentId: 'US11427642',
      selectedText: 'an antigen-binding protein',
      category: 'modern-short',
      rationale: 'cross-column boundary',
    },
    hallucination_check: { passed: true, method: 'wsNorm', needleIndex: 1234 },
    citation: '1:34-46',
    verifier_verdict: {
      status: 'pass',
      tier_used: 'A',
      cited_text_window: '...',
      match_offset_lines: 0,
      reason: 'exact match',
    },
    classification: 'PASS',
    cost_usd: 0.19,
    duration_ms: 28350,
    artifacts: ['screenshot.png'],
    llm_raw_response: '{"caseId":"..."}',
    // D-13 Phase 33 — capture-state defaults (real values; tests can override with null)
    scroll_y: 0,
    viewport_width: 1280,
    viewport_height: 720,
    selected_node_xpath: '/html/body[1]/div[1]',
    ...overrides,
  };
}

function readReport() {
  return JSON.parse(fs.readFileSync(reportPath, 'utf8'));
}

describe('tests/e2e/lib/llm-report.js — llmReportPathFor', () => {
  it('Test 1: returns absolute path ending in tests/e2e/artifacts/{runId}/llm-report.json', () => {
    const p = llmReportPathFor('run-X');
    expect(path.isAbsolute(p)).toBe(true);
    expect(
      p.endsWith(path.join('tests', 'e2e', 'artifacts', 'run-X', LLM_REPORT_FILENAME)),
    ).toBe(true);
  });
});

describe('tests/e2e/lib/llm-report.js — initLlmReport', () => {
  it('Test 2: seeds the empty skeleton with zero summary and empty iterations', () => {
    initLlmReport(reportPath, { run_id: RUN_ID, iterations_total: 5 });
    expect(fs.existsSync(reportPath)).toBe(true);
    const r = readReport();
    expect(r.run_id).toBe(RUN_ID);
    expect(typeof r.started_iso).toBe('string');
    expect(typeof r.finished_iso).toBe('string');
    expect(r.iterations_total).toBe(5);
    expect(r.summary).toEqual({
      passed: 0,
      wrong_citation: 0,
      verifier_disagree: 0,
      llm_hallucinated_selection: 0,
      llm_api_error: 0,
      harness_error: 0,
      total_cost_usd: 0,
    });
    expect(r.iterations).toEqual([]);
  });

  it('Test 3: idempotent — second init does NOT clobber existing iterations', () => {
    initLlmReport(reportPath, { run_id: RUN_ID, iterations_total: 5 });
    appendLlmIteration(reportPath, makeIteration({ iteration_n: 1 }));
    const before = readReport();
    expect(before.iterations).toHaveLength(1);

    // second init with same meta MUST NOT overwrite
    initLlmReport(reportPath, { run_id: RUN_ID, iterations_total: 5 });
    const after = readReport();
    expect(after.iterations).toHaveLength(1);
    expect(after.iterations[0].iteration_n).toBe(1);
  });

  // -------------------------------------------------------------------------
  // WR-03 (Phase 33 review) regression: initLlmReport must stamp
  // `schema_version: 1` on the freshly-initialized report, matching the
  // envelope D-15 added to the migrated UAT fixture. Without this, live
  // `e2e:explore` runs would produce reports lacking the field even though
  // the committed UAT fixture carries it — Phase 34's triage classifier
  // would need a branch on field presence, silently drifting from the
  // intent of "schema is locked".
  // -------------------------------------------------------------------------
  it('Test 3a (WR-03): freshly-initialized report carries schema_version: 1 as the first key', () => {
    initLlmReport(reportPath, { run_id: RUN_ID, iterations_total: 5 });
    const r = readReport();
    expect(r.schema_version).toBe(1);
    // Also assert key ORDER — first key matches the migrated UAT fixture's
    // ordering so jq queries that read `.[0].key` style remain stable.
    expect(Object.keys(r)[0]).toBe('schema_version');
  });

  it('Test 3b (WR-03): schema_version survives appendLlmIteration round-trip', () => {
    initLlmReport(reportPath, { run_id: RUN_ID, iterations_total: 5 });
    appendLlmIteration(reportPath, makeIteration({ iteration_n: 1 }));
    const r = readReport();
    expect(r.schema_version).toBe(1);
    expect(r.iterations).toHaveLength(1);
  });
});

describe('tests/e2e/lib/llm-report.js — appendLlmIteration summary recompute', () => {
  it('Test 4: PASS classification increments summary.passed and total_cost_usd', () => {
    initLlmReport(reportPath, { run_id: RUN_ID, iterations_total: 1 });
    appendLlmIteration(reportPath, makeIteration({ classification: 'PASS', cost_usd: 0.19 }));
    const r = readReport();
    expect(r.summary.passed).toBe(1);
    expect(r.summary.total_cost_usd).toBe(0.19);
  });

  it('Test 5: LLM_HALLUCINATED_SELECTION increments that key AND total_cost_usd (claude was called)', () => {
    initLlmReport(reportPath, { run_id: RUN_ID, iterations_total: 1 });
    appendLlmIteration(reportPath, makeIteration({
      classification: 'LLM_HALLUCINATED_SELECTION',
      cost_usd: 0.18,
      citation: null,
      verifier_verdict: null,
      hallucination_check: { passed: false, method: null },
    }));
    const r = readReport();
    expect(r.summary.llm_hallucinated_selection).toBe(1);
    expect(r.summary.passed).toBe(0);
    expect(r.summary.total_cost_usd).toBe(0.18);
  });

  it('Test 6: LLM_API_ERROR with cost_usd=0 increments that key, total_cost_usd unchanged', () => {
    initLlmReport(reportPath, { run_id: RUN_ID, iterations_total: 1 });
    appendLlmIteration(reportPath, makeIteration({
      classification: 'LLM_API_ERROR',
      cost_usd: 0,
      citation: null,
      verifier_verdict: null,
      hallucination_check: null,
      llm_selection: null,
    }));
    const r = readReport();
    expect(r.summary.llm_api_error).toBe(1);
    expect(r.summary.total_cost_usd).toBe(0);
  });

  it('Test 7: 3 mixed appends — summary counts and total_cost_usd rounded', () => {
    initLlmReport(reportPath, { run_id: RUN_ID, iterations_total: 3 });
    appendLlmIteration(reportPath, makeIteration({ iteration_n: 1, classification: 'PASS', cost_usd: 0.19 }));
    appendLlmIteration(reportPath, makeIteration({
      iteration_n: 2,
      classification: 'LLM_HALLUCINATED_SELECTION',
      cost_usd: 0.18,
      citation: null,
      verifier_verdict: null,
    }));
    appendLlmIteration(reportPath, makeIteration({
      iteration_n: 3,
      classification: 'LLM_API_ERROR',
      cost_usd: 0.08,
      citation: null,
      verifier_verdict: null,
      llm_selection: null,
      hallucination_check: null,
    }));
    const r = readReport();
    expect(r.iterations).toHaveLength(3);
    expect(r.summary.passed).toBe(1);
    expect(r.summary.llm_hallucinated_selection).toBe(1);
    expect(r.summary.llm_api_error).toBe(1);
    expect(r.summary.wrong_citation).toBe(0);
    expect(r.summary.verifier_disagree).toBe(0);
    expect(r.summary.total_cost_usd).toBe(0.45);
  });
});

describe('tests/e2e/lib/llm-report.js — finalizeLlmReport', () => {
  it('Test 8: stamps finished_iso to a fresh timestamp >= started_iso; summary unchanged', async () => {
    initLlmReport(reportPath, { run_id: RUN_ID, iterations_total: 1 });
    appendLlmIteration(reportPath, makeIteration({ classification: 'PASS', cost_usd: 0.19 }));
    const before = readReport();

    // tiny wait so the timestamp can advance
    await new Promise((res) => setTimeout(res, 10));

    finalizeLlmReport(reportPath);
    const after = readReport();
    expect(new Date(after.finished_iso).getTime())
      .toBeGreaterThanOrEqual(new Date(before.started_iso).getTime());
    expect(after.summary).toEqual(before.summary);
    expect(after.iterations).toHaveLength(1);
  });
});

describe('tests/e2e/lib/llm-report.js — directory handling and atomicity', () => {
  it('Test 9: appendLlmIteration creates parent dir if missing (mkdir recursive)', () => {
    // delete the run dir so the parent does NOT exist
    fs.rmSync(path.dirname(reportPath), { recursive: true, force: true });
    expect(fs.existsSync(path.dirname(reportPath))).toBe(false);

    appendLlmIteration(reportPath, makeIteration({ classification: 'PASS', cost_usd: 0.19 }));
    expect(fs.existsSync(reportPath)).toBe(true);
    const r = readReport();
    expect(r.iterations).toHaveLength(1);
  });

  it('Test 10: file is valid JSON after every append (atomic guarantee)', () => {
    initLlmReport(reportPath, { run_id: RUN_ID, iterations_total: 5 });
    for (let n = 1; n <= 5; n++) {
      appendLlmIteration(reportPath, makeIteration({
        iteration_n: n,
        classification: n % 2 === 0 ? 'PASS' : 'LLM_HALLUCINATED_SELECTION',
        cost_usd: 0.1,
      }));
      // each iteration must leave the file in a valid JSON state
      expect(() => JSON.parse(fs.readFileSync(reportPath, 'utf8'))).not.toThrow();
    }
  });
});

describe('tests/e2e/lib/llm-report.js — llm_raw_response truncation + validation', () => {
  it('Test 11a: llm_raw_response > 2000 chars is truncated to exactly 2000', () => {
    initLlmReport(reportPath, { run_id: RUN_ID, iterations_total: 1 });
    const huge = 'A'.repeat(5000);
    appendLlmIteration(reportPath, makeIteration({
      classification: 'PASS',
      cost_usd: 0.19,
      llm_raw_response: huge,
    }));
    const r = readReport();
    expect(r.iterations[0].llm_raw_response).toHaveLength(2000);
  });

  it('Test 11b: llm_raw_response <= 2000 chars is passed through unchanged', () => {
    initLlmReport(reportPath, { run_id: RUN_ID, iterations_total: 1 });
    const small = 'B'.repeat(1500);
    appendLlmIteration(reportPath, makeIteration({
      classification: 'PASS',
      cost_usd: 0.19,
      llm_raw_response: small,
    }));
    const r = readReport();
    expect(r.iterations[0].llm_raw_response).toBe(small);
  });

  it('Test 12a: rejects entries missing iteration_n', () => {
    expect(() => appendLlmIteration(reportPath, {
      iso: '2026-05-18T10:00:30.000Z',
      classification: 'PASS',
      cost_usd: 0.19,
    })).toThrow(/iteration_n/);
  });

  it('Test 12b: rejects entries missing iso', () => {
    expect(() => appendLlmIteration(reportPath, {
      iteration_n: 1,
      classification: 'PASS',
      cost_usd: 0.19,
    })).toThrow(/iso/);
  });

  it('Test 12c: rejects entries missing classification', () => {
    expect(() => appendLlmIteration(reportPath, {
      iteration_n: 1,
      iso: '2026-05-18T10:00:30.000Z',
      cost_usd: 0.19,
    })).toThrow(/classification/);
  });

  it('Test 12d: rejects entries missing scroll_y (RERUN-03 schema extension)', () => {
    const baseValid = makeIteration({ classification: 'PASS' });
    delete baseValid.scroll_y;
    expect(() => appendLlmIteration(reportPath, baseValid)).toThrow(/scroll_y/);
  });

  it('Test 12e: rejects entries missing viewport_width (RERUN-03 schema extension)', () => {
    const baseValid = makeIteration({ classification: 'PASS' });
    delete baseValid.viewport_width;
    expect(() => appendLlmIteration(reportPath, baseValid)).toThrow(/viewport_width/);
  });

  it('Test 12f: rejects entries missing viewport_height (RERUN-03 schema extension)', () => {
    const baseValid = makeIteration({ classification: 'PASS' });
    delete baseValid.viewport_height;
    expect(() => appendLlmIteration(reportPath, baseValid)).toThrow(/viewport_height/);
  });

  it('Test 12g: rejects entries missing selected_node_xpath (RERUN-03 schema extension)', () => {
    const baseValid = makeIteration({ classification: 'PASS' });
    delete baseValid.selected_node_xpath;
    expect(() => appendLlmIteration(reportPath, baseValid)).toThrow(/selected_node_xpath/);
  });

  it('Test 12h: permits null on the 4 capture fields (D-13 null-allowed semantics)', () => {
    // Pre-browser failure paths in e2e-explore.mjs supply null for all 4 keys.
    // The schema-guard MUST require KEY presence but ALLOW null VALUE.
    initLlmReport(reportPath, { run_id: RUN_ID, iterations_total: 1 });
    expect(() => appendLlmIteration(reportPath, makeIteration({
      classification: 'LLM_API_ERROR',
      scroll_y: null,
      viewport_width: null,
      viewport_height: null,
      selected_node_xpath: null,
    }))).not.toThrow();
  });

  it('Test 12i: still rejects null on the original 3 non-null fields (D-13 preserves strictness)', () => {
    // Option (a) split-list: iteration_n / iso / classification retain
    // "undefined or null forbidden" semantics.
    expect(() => appendLlmIteration(reportPath, makeIteration({
      classification: null,
    }))).toThrow(/classification/);
  });
});

describe('tests/unit/fixtures/sample-llm-report.json — fixture consistency', () => {
  it('Test 13: fixture parses and totals are consistent (0.19 + 0.18 + 0.08 = 0.45)', () => {
    expect(fs.existsSync(FIXTURE_PATH)).toBe(true);
    const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
    expect(fixture.iterations).toHaveLength(3);
    expect(fixture.summary.total_cost_usd).toBe(0.45);
    expect(fixture.summary.passed).toBe(1);
    expect(fixture.summary.llm_hallucinated_selection).toBe(1);
    expect(fixture.summary.llm_api_error).toBe(1);
    expect(fixture.summary.wrong_citation).toBe(0);
    expect(fixture.summary.verifier_disagree).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Phase 37 D-01 — SUMMARY_KEYS single-source-of-truth tests
// ---------------------------------------------------------------------------

describe('SUMMARY_KEYS export (Phase 37 D-01)', () => {
  it('Test A: SUMMARY_KEYS is exported, frozen, and has exactly 7 keys', () => {
    expect(SUMMARY_KEYS).toBeDefined();
    expect(Object.isFrozen(SUMMARY_KEYS)).toBe(true);
    expect(SUMMARY_KEYS.length).toBe(7);
  });

  it('Test B: SUMMARY_KEYS exact order matches canonical contract (passed → total_cost_usd)', () => {
    expect(SUMMARY_KEYS).toEqual([
      'passed',
      'wrong_citation',
      'verifier_disagree',
      'llm_hallucinated_selection',
      'llm_api_error',
      'harness_error',
      'total_cost_usd',
    ]);
  });

  it('Test C: emptySummary() derives from SUMMARY_KEYS — all keys present, all values 0 (single-source proof)', () => {
    // emptySummary() is not exported; prove derivation through the public
    // initLlmReport surface: a freshly seeded report's summary must have
    // exactly the keys SUMMARY_KEYS declares, in the same order, all zero.
    initLlmReport(reportPath, { run_id: RUN_ID, iterations_total: 0 });
    const r = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    const summaryKeys = Object.keys(r.summary);
    // Key set and order must match SUMMARY_KEYS exactly
    expect(summaryKeys).toEqual([...SUMMARY_KEYS]);
    // Every value must be zero
    for (const k of SUMMARY_KEYS) {
      expect(r.summary[k]).toBe(0);
    }
  });
});

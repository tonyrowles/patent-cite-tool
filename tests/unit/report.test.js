// tests/unit/report.test.js
//
// Phase 28 RPT-01 — exercises the incremental report writer's read-modify-write
// semantics. Each test gets its own tmp directory so report.json mutations are
// hermetic and never touch tests/e2e/artifacts/.
//
// Coverage map (see 28-02-PLAN.md <behavior>):
//   1. emptyReport seed (first append creates file w/ run_id)
//   2. append new id (cases length grows)
//   3. replace existing id (cases length unchanged; entry updated)
//   4. summary recompute on status flip (passed→failed bumps by_error_class)
//   5. by_error_class ignores null errorClass
//   6. by_error_class ignores unknown errorClass strings (closed-enum guard)
//   7. skipped status increments summary.skipped not summary.failed
//   8. writeReport overwrites the entire file
//   9. reportPathFor returns absolute path under tests/e2e/artifacts/{runId}/
//   10. ended timestamp updates on every appendCase
//
// Tests use a tmp report.json path; reportPathFor() resolution is exercised
// in Test 9 against the real artifacts root pattern.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  appendCase,
  writeReport,
  reportPathFor,
  ERROR_CLASSES,
} from '../e2e/lib/report.js';

let tmpDir;
let reportPath;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pct-report-test-'));
  // mimic the per-run subdir so readOrInit can derive run_id from path.basename(dirname)
  const runDir = path.join(tmpDir, '2026-05-15T10-00-00Z');
  fs.mkdirSync(runDir, { recursive: true });
  reportPath = path.join(runDir, 'report.json');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeCase(overrides = {}) {
  return {
    id: 'US11427642-spec-short-1',
    status: 'passed',
    errorClass: null,
    citation: '1:26-27',
    verifier_verdict: {
      status: 'pass',
      tier_used: 'A',
      cited_text_window: 'embodiment of the present invention',
      match_offset_lines: 0,
      reason: 'exact substring match',
    },
    artifacts: { screenshot: null, dom: null, pdf_snippet: null },
    ...overrides,
  };
}

function readReport() {
  return JSON.parse(fs.readFileSync(reportPath, 'utf8'));
}

describe('tests/e2e/lib/report.js — appendCase / writeReport / reportPathFor', () => {
  it('Test 1: emptyReport seed — first appendCase creates a valid file with run_id', () => {
    expect(fs.existsSync(reportPath)).toBe(false);

    appendCase(reportPath, makeCase({ id: 'case-A', status: 'passed' }));

    expect(fs.existsSync(reportPath)).toBe(true);
    const r = readReport();
    expect(r.run_id).toBe('2026-05-15T10-00-00Z');
    expect(typeof r.started).toBe('string');
    expect(r.started).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(r.ended).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(r.summary.total).toBe(1);
    expect(r.summary.passed).toBe(1);
    expect(r.cases).toHaveLength(1);
    expect(r.cases[0].id).toBe('case-A');
    // by_error_class has all 8 keys, all zero
    for (const k of ERROR_CLASSES) {
      expect(r.summary.by_error_class[k]).toBe(0);
    }
  });

  it('Test 2: append new id — second call with different id appends, cases.length === 2', () => {
    appendCase(reportPath, makeCase({ id: 'case-A', status: 'passed' }));
    appendCase(reportPath, makeCase({ id: 'case-B', status: 'passed' }));

    const r = readReport();
    expect(r.cases).toHaveLength(2);
    expect(r.cases.map(c => c.id).sort()).toEqual(['case-A', 'case-B']);
    expect(r.summary.total).toBe(2);
    expect(r.summary.passed).toBe(2);
    expect(r.summary.failed).toBe(0);
  });

  it('Test 3: replace existing id — third call with same id as call 1 replaces (no duplicate)', () => {
    appendCase(reportPath, makeCase({ id: 'case-A', status: 'passed' }));
    appendCase(reportPath, makeCase({ id: 'case-B', status: 'passed' }));
    // re-submit case-A with different status — must replace, not duplicate
    appendCase(reportPath, makeCase({ id: 'case-A', status: 'skipped', errorClass: null }));

    const r = readReport();
    expect(r.cases).toHaveLength(2);
    const a = r.cases.find(c => c.id === 'case-A');
    expect(a.status).toBe('skipped');
    expect(r.summary.passed).toBe(1); // only case-B is passed now
    expect(r.summary.skipped).toBe(1);
  });

  it('Test 4: summary recompute on status flip — passed→failed with WRONG_CITATION bumps by_error_class', () => {
    appendCase(reportPath, makeCase({ id: 'X', status: 'passed' }));
    let r = readReport();
    expect(r.summary.passed).toBe(1);
    expect(r.summary.failed).toBe(0);
    expect(r.summary.by_error_class.WRONG_CITATION).toBe(0);

    appendCase(reportPath, makeCase({ id: 'X', status: 'failed', errorClass: 'WRONG_CITATION' }));
    r = readReport();
    expect(r.summary.passed).toBe(0);
    expect(r.summary.failed).toBe(1);
    expect(r.summary.by_error_class.WRONG_CITATION).toBe(1);
    expect(r.cases).toHaveLength(1);
  });

  it('Test 5: by_error_class ignores null errorClass on failed cases (still counts in summary.failed)', () => {
    appendCase(reportPath, makeCase({ id: 'Y', status: 'failed', errorClass: null }));

    const r = readReport();
    expect(r.summary.failed).toBe(1);
    for (const k of ERROR_CLASSES) {
      expect(r.summary.by_error_class[k]).toBe(0);
    }
  });

  it('Test 6: by_error_class rejects unknown strings — closed-enum guard', () => {
    // The closed-enum guard must reject any errorClass that is NOT in
    // ERROR_CLASSES. Phase 31 (LLM-04) promoted LLM_HALLUCINATED_SELECTION
    // into the taxonomy, so we now use a hypothetical "future" code that is
    // guaranteed-unknown to keep this guard test meaningful.
    appendCase(reportPath, makeCase({
      id: 'Z',
      status: 'failed',
      errorClass: 'FUTURE_UNCLASSIFIED_FAILURE_MODE_v999',
    }));

    const r = readReport();
    expect(r.summary.failed).toBe(1);
    for (const k of ERROR_CLASSES) {
      expect(r.summary.by_error_class[k]).toBe(0);
    }
    // unknown key must NOT be added to by_error_class
    expect(r.summary.by_error_class.FUTURE_UNCLASSIFIED_FAILURE_MODE_v999).toBeUndefined();
  });

  it('Test 7: skipped cases increment summary.skipped, not summary.failed', () => {
    appendCase(reportPath, makeCase({ id: 'S1', status: 'skipped', errorClass: null }));
    appendCase(reportPath, makeCase({ id: 'S2', status: 'skipped', errorClass: null }));
    appendCase(reportPath, makeCase({ id: 'P1', status: 'passed' }));

    const r = readReport();
    expect(r.summary.total).toBe(3);
    expect(r.summary.skipped).toBe(2);
    expect(r.summary.passed).toBe(1);
    expect(r.summary.failed).toBe(0);
  });

  it('Test 8: writeReport overwrites the entire file; subsequent appendCase reads the new shape', () => {
    // Seed with appendCase
    appendCase(reportPath, makeCase({ id: 'A', status: 'passed' }));
    appendCase(reportPath, makeCase({ id: 'B', status: 'passed' }));
    expect(readReport().cases).toHaveLength(2);

    // Overwrite with a synthetic complete report
    const stamped = {
      run_id: '2026-05-15T10-00-00Z',
      started: '2026-05-15T10:00:00.000Z',
      ended: '2026-05-15T10:30:00.000Z',
      summary: {
        total: 1,
        passed: 0,
        skipped: 0,
        failed: 1,
        by_error_class: Object.fromEntries(ERROR_CLASSES.map(k => [k, 0])),
      },
      cases: [makeCase({ id: 'OVERWRITE', status: 'failed', errorClass: 'FLAKE' })],
    };
    stamped.summary.by_error_class.FLAKE = 1;
    writeReport(reportPath, stamped);

    const r = readReport();
    expect(r.cases).toHaveLength(1);
    expect(r.cases[0].id).toBe('OVERWRITE');
    expect(r.summary.failed).toBe(1);
    expect(r.summary.by_error_class.FLAKE).toBe(1);

    // subsequent appendCase reads the new shape correctly
    appendCase(reportPath, makeCase({ id: 'OVERWRITE2', status: 'passed' }));
    const r2 = readReport();
    expect(r2.cases).toHaveLength(2);
    expect(r2.summary.passed).toBe(1);
    expect(r2.summary.failed).toBe(1); // OVERWRITE still failed
    expect(r2.summary.by_error_class.FLAKE).toBe(1); // recomputed from cases
  });

  it('Test 9: reportPathFor returns absolute path ending in tests/e2e/artifacts/{runId}/report.json', () => {
    const p = reportPathFor('2026-05-15T10-00-00Z');
    expect(path.isAbsolute(p)).toBe(true);
    // normalized path uses forward slashes on POSIX
    expect(p.endsWith(path.join('tests', 'e2e', 'artifacts', '2026-05-15T10-00-00Z', 'report.json'))).toBe(true);
  });

  it('Test 10: ended timestamp updates on every appendCase (monotonic, latest call wins)', async () => {
    appendCase(reportPath, makeCase({ id: 'T1', status: 'passed' }));
    const ended1 = readReport().ended;
    expect(ended1).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    // Tiny sleep so the timestamp can advance
    await new Promise(resolve => setTimeout(resolve, 10));

    appendCase(reportPath, makeCase({ id: 'T2', status: 'passed' }));
    const ended2 = readReport().ended;
    expect(ended2).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(new Date(ended2).getTime()).toBeGreaterThanOrEqual(new Date(ended1).getTime());
  });

  it('Test 11 (sanity): ERROR_CLASSES re-export from report.js matches error-codes.js', () => {
    // Phase 28 originally asserted length 8 (pre-WORKER_FALLBACK_FAILED).
    // Phase 30 (INJ-02) added WORKER_FALLBACK_FAILED → length 9.
    // Phase 31 (LLM-04) added LLM_HALLUCINATED_SELECTION + LLM_API_ERROR → length 11.
    expect(ERROR_CLASSES).toHaveLength(11);
    expect(ERROR_CLASSES).toContain('EXTENSION_NOT_LOADED');
    expect(ERROR_CLASSES).toContain('VERIFIER_DISAGREE');
    expect(ERROR_CLASSES).toContain('FLAKE');
    expect(ERROR_CLASSES).toContain('WORKER_FALLBACK_FAILED');
    expect(ERROR_CLASSES).toContain('LLM_HALLUCINATED_SELECTION');
    expect(ERROR_CLASSES).toContain('LLM_API_ERROR');
  });
});

// tests/unit/rerun-validator.test.js
//
// Phase 33 (RERUN-01/RERUN-02) — unit tests for the pure-function rerun validator.
//
// TDD RED state: written BEFORE tests/e2e/lib/rerun-validator.js exists.
// All tests fail with "Cannot find module" until Task 2 creates the module.
//
// Coverage map (Phase Requirements → Test Map from 33-RESEARCH.md):
//   1.  replays each eligible iteration 3 times (spy.callCount === 3 × N_eligible)
//   2.  skips ineligible classifications (spy.callCount === 0)
//   3.  rerun-report.json schema matches D-09 top-level
//   4.  rerun-report per-replay entry matches D-10
//   5.  verdict CONFIRMED at 3/3
//   6.  verdict CONFIRMED at exactly 2/3 (>= 2 threshold — inclusive edge case)
//   7.  verdict FLAKE at 1/3
//   8.  verdict FLAKE at 0/3
//   9.  NOT_REPLAYABLE entries carry total_runs: 0 and reason naming classification (D-02)
//   10. schema_version: 1 at top level (D-09 regression)
//   11. atomic write produces valid JSON file at outputPath
//   12. EXDEV fallback fires direct-write branch in atomicWriteJson
//   13. computeVerdict is a pure function on (originalStatus, runs[])
//   14. isEligibleForReplay returns true for WRONG_CITATION/VERIFIER_DISAGREE; false for rest

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  runValidator,
  computeVerdict,
  isEligibleForReplay,
  emptyRerunReport,
  atomicWriteJson,
} from '../e2e/lib/rerun-validator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let tmpDir;
let reportPath;
let outputPath;
const RUN_ID = '2026-05-25T10-00-00Z';

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pct-rerun-validator-test-'));
  const runDir = path.join(tmpDir, RUN_ID);
  fs.mkdirSync(runDir, { recursive: true });
  reportPath = path.join(runDir, 'llm-report.json');
  outputPath = path.join(runDir, 'rerun-report.json');
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeIteration(overrides = {}) {
  return {
    iteration_n: 1,
    iso: '2026-05-25T10:00:30.000Z',
    llm_selection: {
      caseId: 'US11427642-llm-001',
      patentId: 'US11427642',
      selectedText: 'an antigen-binding protein',
      category: 'modern-short',
      rationale: 'cross-column boundary',
    },
    hallucination_check: { passed: true, method: 'wsNorm' },
    citation: '1:34-46',
    verifier_verdict: {
      status: 'pass',
      tier_used: 'A',
      reason: 'exact match',
    },
    classification: 'WRONG_CITATION',
    cost_usd: 0.19,
    duration_ms: 28350,
    artifacts: [],
    llm_raw_response: '{"caseId":"..."}',
    // D-13 schema fields
    scroll_y: 0,
    viewport_width: 1280,
    viewport_height: 720,
    selected_node_xpath: '/html/body[1]/div[1]',
    ...overrides,
  };
}

function makeReport({ iterations = [], runId = RUN_ID } = {}) {
  return {
    schema_version: 1,
    run_id: runId,
    started_iso: '2026-05-25T10:00:00.000Z',
    finished_iso: '2026-05-25T10:00:01.000Z',
    iterations_total: iterations.length,
    summary: {
      passed: 0,
      wrong_citation: 0,
      verifier_disagree: 0,
      harness_error: 0,
      llm_api_error: 0,
      llm_hallucinated_selection: 0,
      total_cost_usd: 0,
    },
    iterations,
  };
}

// Mock verifyCitation implementations
const mockVerifyConfirmed = async () => ({
  status: 'pass',
  tier_used: 'A',
  reason: 'exact match',
});

const mockVerifyFlakeAlways = async () => ({
  status: 'fail',
  tier_used: 'A',
  reason: 'mismatch',
});

// Returns pass,pass,fail (2/3 match for original status 'pass')
function makeEdge23Mock() {
  let callCount = 0;
  return async () => {
    callCount += 1;
    if (callCount === 3) {
      return { status: 'fail', tier_used: 'A', reason: 'flake on 3rd call' };
    }
    return { status: 'pass', tier_used: 'A', reason: 'exact match' };
  };
}

// Returns pass once, fail twice (1/3 match)
function makeFlake13Mock() {
  let callCount = 0;
  return async () => {
    callCount += 1;
    if (callCount === 1) {
      return { status: 'pass', tier_used: 'A', reason: 'exact match' };
    }
    return { status: 'fail', tier_used: 'A', reason: 'mismatch' };
  };
}

// Capture writeReport results inline (avoids reading output file)
function makeCaptureWriter() {
  let captured = null;
  const writer = vi.fn((destPath, content) => {
    captured = JSON.parse(content);
    // Also write to disk so file-existence tests pass
    fs.writeFileSync(destPath, content);
  });
  writer.getResult = () => captured;
  return writer;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('rerun-validator', () => {

  it('replays each eligible iteration 3 times', async () => {
    const iterations = [
      makeIteration({ iteration_n: 1, classification: 'WRONG_CITATION' }),
      makeIteration({ iteration_n: 2, classification: 'VERIFIER_DISAGREE' }),
      makeIteration({ iteration_n: 3, classification: 'WRONG_CITATION' }),
      makeIteration({ iteration_n: 4, classification: 'HARNESS_ERROR',
        verifier_verdict: null, llm_selection: null, citation: null }),
    ];
    const inputLlmReport = makeReport({ iterations });
    const spy = vi.fn().mockImplementation(mockVerifyConfirmed);
    const writer = makeCaptureWriter();

    await runValidator({
      inputLlmReport,
      sourceLlmReportPath: reportPath,
      outputPath,
      verifyCitation: spy,
      writeReport: writer,
      now: () => new Date('2026-05-25T10:00:00Z'),
    });

    // 3 eligible iterations × 3 replays each = 9 calls
    expect(spy.mock.calls.length).toBe(9);
  });

  it('skips ineligible classifications', async () => {
    const iterations = [
      makeIteration({ iteration_n: 1, classification: 'HARNESS_ERROR',
        verifier_verdict: null, llm_selection: null, citation: null }),
      makeIteration({ iteration_n: 2, classification: 'LLM_API_ERROR',
        verifier_verdict: null, llm_selection: null, citation: null }),
      makeIteration({ iteration_n: 3, classification: 'LLM_HALLUCINATED_SELECTION',
        verifier_verdict: null, llm_selection: null, citation: null }),
      makeIteration({ iteration_n: 4, classification: 'PASS' }),
    ];
    const inputLlmReport = makeReport({ iterations });
    const spy = vi.fn().mockImplementation(mockVerifyConfirmed);
    const writer = makeCaptureWriter();

    await runValidator({
      inputLlmReport,
      sourceLlmReportPath: reportPath,
      outputPath,
      verifyCitation: spy,
      writeReport: writer,
      now: () => new Date('2026-05-25T10:00:00Z'),
    });

    expect(spy.mock.calls.length).toBe(0);
  });

  it('rerun-report.json schema matches D-09 top-level', async () => {
    const iterations = [makeIteration({ iteration_n: 1, classification: 'WRONG_CITATION' })];
    const inputLlmReport = makeReport({ iterations });
    const writer = makeCaptureWriter();

    await runValidator({
      inputLlmReport,
      sourceLlmReportPath: reportPath,
      outputPath,
      verifyCitation: vi.fn().mockImplementation(mockVerifyConfirmed),
      writeReport: writer,
      now: () => new Date('2026-05-25T10:00:00Z'),
    });

    const output = writer.getResult();
    expect(output).toHaveProperty('schema_version');
    expect(output).toHaveProperty('source_llm_report');
    expect(output).toHaveProperty('run_id');
    expect(output).toHaveProperty('started_iso');
    expect(output).toHaveProperty('finished_iso');
    expect(output).toHaveProperty('summary');
    expect(output.summary).toHaveProperty('confirmed_count');
    expect(output.summary).toHaveProperty('flake_count');
    expect(output.summary).toHaveProperty('not_replayable_count');
    expect(output).toHaveProperty('replays');
    expect(Array.isArray(output.replays)).toBe(true);
  });

  it('rerun-report per-replay entry matches D-10', async () => {
    const eligibleIter = makeIteration({ iteration_n: 1, classification: 'WRONG_CITATION' });
    const ineligibleIter = makeIteration({
      iteration_n: 2,
      classification: 'LLM_API_ERROR',
      verifier_verdict: null,
      llm_selection: null,
      citation: null,
    });
    const inputLlmReport = makeReport({ iterations: [eligibleIter, ineligibleIter] });
    const writer = makeCaptureWriter();

    await runValidator({
      inputLlmReport,
      sourceLlmReportPath: reportPath,
      outputPath,
      verifyCitation: vi.fn().mockImplementation(mockVerifyConfirmed),
      writeReport: writer,
      now: () => new Date('2026-05-25T10:00:00Z'),
    });

    const output = writer.getResult();
    expect(output.replays).toHaveLength(2);

    // Eligible entry (D-10 shape)
    const eligibleReplay = output.replays[0];
    expect(eligibleReplay).toHaveProperty('iteration_n');
    expect(eligibleReplay).toHaveProperty('original_verdict_status');
    expect(eligibleReplay).toHaveProperty('runs');
    expect(Array.isArray(eligibleReplay.runs)).toBe(true);
    expect(eligibleReplay).toHaveProperty('confirmed_count');
    expect(eligibleReplay).toHaveProperty('total_runs');
    expect(eligibleReplay).toHaveProperty('verdict');

    // NOT_REPLAYABLE entry must also have a reason field (D-02)
    const ineligibleReplay = output.replays[1];
    expect(ineligibleReplay.verdict).toBe('NOT_REPLAYABLE');
    expect(ineligibleReplay).toHaveProperty('reason');
  });

  it('verdict CONFIRMED at 3/3', async () => {
    const iterations = [makeIteration({ iteration_n: 1, classification: 'WRONG_CITATION',
      verifier_verdict: { status: 'pass', tier_used: 'A', reason: 'exact match' } })];
    const inputLlmReport = makeReport({ iterations });
    const writer = makeCaptureWriter();

    await runValidator({
      inputLlmReport,
      sourceLlmReportPath: reportPath,
      outputPath,
      verifyCitation: vi.fn().mockImplementation(mockVerifyConfirmed),
      writeReport: writer,
      now: () => new Date('2026-05-25T10:00:00Z'),
    });

    const output = writer.getResult();
    const replay = output.replays[0];
    expect(replay.verdict).toBe('CONFIRMED');
    expect(replay.confirmed_count).toBe(3);
    expect(replay.total_runs).toBe(3);
  });

  it('verdict CONFIRMED at exactly 2/3 (edge case — >= not >)', async () => {
    // Original status is 'pass'; edge23 mock returns pass,pass,fail → 2/3 match
    // If implementation uses `> 2` instead of `>= 2`, this test fails.
    const iterations = [makeIteration({ iteration_n: 1, classification: 'WRONG_CITATION',
      verifier_verdict: { status: 'pass', tier_used: 'A', reason: 'exact match' } })];
    const inputLlmReport = makeReport({ iterations });
    const writer = makeCaptureWriter();

    await runValidator({
      inputLlmReport,
      sourceLlmReportPath: reportPath,
      outputPath,
      verifyCitation: vi.fn().mockImplementation(makeEdge23Mock()),
      writeReport: writer,
      now: () => new Date('2026-05-25T10:00:00Z'),
    });

    const output = writer.getResult();
    const replay = output.replays[0];
    expect(replay.verdict).toBe('CONFIRMED');
    expect(replay.confirmed_count).toBe(2);
    expect(replay.total_runs).toBe(3);
  });

  it('verdict FLAKE at 1/3', async () => {
    // flake13 mock: pass once, fail twice → 1/3 match for original 'pass'
    const iterations = [makeIteration({ iteration_n: 1, classification: 'WRONG_CITATION',
      verifier_verdict: { status: 'pass', tier_used: 'A', reason: 'exact match' } })];
    const inputLlmReport = makeReport({ iterations });
    const writer = makeCaptureWriter();

    await runValidator({
      inputLlmReport,
      sourceLlmReportPath: reportPath,
      outputPath,
      verifyCitation: vi.fn().mockImplementation(makeFlake13Mock()),
      writeReport: writer,
      now: () => new Date('2026-05-25T10:00:00Z'),
    });

    const output = writer.getResult();
    const replay = output.replays[0];
    expect(replay.verdict).toBe('FLAKE');
    expect(replay.confirmed_count).toBe(1);
    expect(replay.total_runs).toBe(3);
  });

  it('verdict FLAKE at 0/3', async () => {
    // mockVerifyFlakeAlways: always returns fail → 0/3 match for original 'pass'
    const iterations = [makeIteration({ iteration_n: 1, classification: 'WRONG_CITATION',
      verifier_verdict: { status: 'pass', tier_used: 'A', reason: 'exact match' } })];
    const inputLlmReport = makeReport({ iterations });
    const writer = makeCaptureWriter();

    await runValidator({
      inputLlmReport,
      sourceLlmReportPath: reportPath,
      outputPath,
      verifyCitation: vi.fn().mockImplementation(mockVerifyFlakeAlways),
      writeReport: writer,
      now: () => new Date('2026-05-25T10:00:00Z'),
    });

    const output = writer.getResult();
    const replay = output.replays[0];
    expect(replay.verdict).toBe('FLAKE');
    expect(replay.confirmed_count).toBe(0);
    expect(replay.total_runs).toBe(3);
  });

  it('NOT_REPLAYABLE entries carry total_runs: 0 and reason naming classification (D-02)', async () => {
    const iterations = [makeIteration({
      iteration_n: 1,
      classification: 'LLM_API_ERROR',
      verifier_verdict: null,
      llm_selection: null,
      citation: null,
    })];
    const inputLlmReport = makeReport({ iterations });
    const writer = makeCaptureWriter();

    await runValidator({
      inputLlmReport,
      sourceLlmReportPath: reportPath,
      outputPath,
      verifyCitation: vi.fn(),
      writeReport: writer,
      now: () => new Date('2026-05-25T10:00:00Z'),
    });

    const output = writer.getResult();
    const replay = output.replays[0];
    expect(replay.verdict).toBe('NOT_REPLAYABLE');
    expect(replay.total_runs).toBe(0);
    expect(replay.runs).toHaveLength(0);
    expect(typeof replay.reason).toBe('string');
    expect(replay.reason).toMatch(/LLM_API_ERROR/);
  });

  it('schema_version: 1 at top level (D-09 regression)', async () => {
    const iterations = [makeIteration({ iteration_n: 1, classification: 'WRONG_CITATION' })];
    const inputLlmReport = makeReport({ iterations });
    const writer = makeCaptureWriter();

    await runValidator({
      inputLlmReport,
      sourceLlmReportPath: reportPath,
      outputPath,
      verifyCitation: vi.fn().mockImplementation(mockVerifyConfirmed),
      writeReport: writer,
      now: () => new Date('2026-05-25T10:00:00Z'),
    });

    const output = writer.getResult();
    expect(output.schema_version).toBe(1);
  });

  it('atomic write produces valid JSON file at outputPath', async () => {
    const iterations = [makeIteration({ iteration_n: 1, classification: 'WRONG_CITATION' })];
    const inputLlmReport = makeReport({ iterations });

    await runValidator({
      inputLlmReport,
      sourceLlmReportPath: reportPath,
      outputPath,
      verifyCitation: vi.fn().mockImplementation(mockVerifyConfirmed),
      // Use the default writeReport (atomicWriteJson) by not injecting one
      now: () => new Date('2026-05-25T10:00:00Z'),
    });

    expect(fs.existsSync(outputPath)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    expect(parsed.schema_version).toBe(1);
  });

  it('EXDEV fallback fires direct-write branch in atomicWriteJson', () => {
    // Stub fs.renameSync to throw EXDEV; assert direct-write fallback fires
    const renameSpy = vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      const e = new Error('EXDEV cross-device link');
      e.code = 'EXDEV';
      throw e;
    });

    const testPath = path.join(tmpDir, 'exdev-test.json');
    const content = '{"test":true}\n';

    // Should not throw — EXDEV fallback should write directly
    expect(() => atomicWriteJson(testPath, content)).not.toThrow();

    // Destination file must exist with correct content
    expect(fs.existsSync(testPath)).toBe(true);
    expect(fs.readFileSync(testPath, 'utf8')).toBe(content);

    // Tmp file should be cleaned up
    const tmpPath = `${testPath}.tmp.${process.pid}`;
    expect(fs.existsSync(tmpPath)).toBe(false);

    renameSpy.mockRestore();
  });

  it('computeVerdict is a pure function on (originalStatus, runs[])', () => {
    // Direct unit test on computeVerdict — 2/3 pass = CONFIRMED
    const result = computeVerdict('pass', [
      { status: 'pass', tier_used: 'A', reason: 'ok' },
      { status: 'pass', tier_used: 'A', reason: 'ok' },
      { status: 'fail', tier_used: 'A', reason: 'mismatch' },
    ]);
    expect(result.confirmed_count).toBe(2);
    expect(result.total_runs).toBe(3);
    expect(result.verdict).toBe('CONFIRMED');

    // 0/3 = FLAKE
    const flake = computeVerdict('pass', [
      { status: 'fail', tier_used: 'A', reason: 'mismatch' },
      { status: 'fail', tier_used: 'A', reason: 'mismatch' },
      { status: 'fail', tier_used: 'A', reason: 'mismatch' },
    ]);
    expect(flake.verdict).toBe('FLAKE');
    expect(flake.confirmed_count).toBe(0);

    // 3/3 = CONFIRMED
    const perfect = computeVerdict('pass', [
      { status: 'pass', tier_used: 'A', reason: 'ok' },
      { status: 'pass', tier_used: 'A', reason: 'ok' },
      { status: 'pass', tier_used: 'A', reason: 'ok' },
    ]);
    expect(perfect.verdict).toBe('CONFIRMED');
    expect(perfect.confirmed_count).toBe(3);
  });

  it('isEligibleForReplay returns true for WRONG_CITATION and VERIFIER_DISAGREE; false for HARNESS_ERROR/LLM_API_ERROR/LLM_HALLUCINATED_SELECTION/PASS', () => {
    expect(isEligibleForReplay(makeIteration({ classification: 'WRONG_CITATION' }))).toBe(true);
    expect(isEligibleForReplay(makeIteration({ classification: 'VERIFIER_DISAGREE' }))).toBe(true);

    expect(isEligibleForReplay(makeIteration({ classification: 'HARNESS_ERROR' }))).toBe(false);
    expect(isEligibleForReplay(makeIteration({ classification: 'LLM_API_ERROR' }))).toBe(false);
    expect(isEligibleForReplay(makeIteration({ classification: 'LLM_HALLUCINATED_SELECTION' }))).toBe(false);
    expect(isEligibleForReplay(makeIteration({ classification: 'PASS' }))).toBe(false);
  });

});

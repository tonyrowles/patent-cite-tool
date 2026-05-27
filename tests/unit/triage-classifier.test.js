// tests/unit/triage-classifier.test.js
//
// Phase 34 (TRIAGE-01/TRIAGE-02/TRIAGE-05) — unit tests for the pure-function
// heuristic triage classifier.
//
// TDD RED state: written BEFORE tests/e2e/lib/triage-classifier.js exists.
// All tests fail with "Cannot find module" until Task 2 creates the module.
//
// Coverage map (Phase Requirements → Test Map from 34-RESEARCH.md):
//   1.  VERIFIER_STRONG_AGREEMENT returns true for tier A (TRIAGE-02)
//   2.  VERIFIER_STRONG_AGREEMENT returns true for tier B (TRIAGE-02)
//   3.  VERIFIER_STRONG_AGREEMENT returns false for tier C — Pitfall 2 (TRIAGE-02)
//   4.  VERIFIER_STRONG_AGREEMENT returns false for tier D (TRIAGE-02)
//   5.  VERIFIER_STRONG_AGREEMENT returns false when status !== 'pass' (TRIAGE-02)
//   6.  VERIFIER_STRONG_AGREEMENT returns false on missing tier_used / status (TRIAGE-02)
//   7.  SEVERITIES is frozen and contains all 5 levels in order (D-04)
//   8.  Rule 1: FLAKE verdict → severity low, path_taken heuristic (TRIAGE-01)
//   9.  Rule 2a: CONFIRMED + tier A + WRONG_CITATION → severity high, path_taken heuristic (TRIAGE-01)
//   10. Rule 2b: CONFIRMED + tier B + VERIFIER_DISAGREE → severity medium, path_taken heuristic (TRIAGE-01)
//   11. Rule 3a: NOT_REPLAYABLE + LLM_HALLUCINATED_SELECTION → severity critical, path_taken heuristic (TRIAGE-01)
//   12. Rule 3b: NOT_REPLAYABLE + LLM_API_ERROR → severity medium, path_taken heuristic (TRIAGE-01)
//   13. Rule 3c: NOT_REPLAYABLE + HARNESS_ERROR → severity low, path_taken heuristic (TRIAGE-01)
//   14. Rule 3d: NOT_REPLAYABLE + PASS → severity info, path_taken heuristic (TRIAGE-01)
//   15. Aggregate: 7-iteration heuristic-only report → invokeLlm callCount === 0, heuristic_count === 7 (TRIAGE-01)
//   16. Tier C escalation boundary: CONFIRMED + tier C + WRONG_CITATION → path_taken 'pending_llm' (TRIAGE-01 boundary)
//   17. triage-report.json D-09 schema keys all present (TRIAGE-05)
//   18. triage-report.json D-10 per-finding schema keys all present (TRIAGE-05)
//   19. summary arithmetic invariant: heuristic_count + llm_pass_count + cluster_pass_count === total_findings (TRIAGE-05)
//   20. runTriage return value equals written file content (TRIAGE-05)
//   21. atomicWriteJson writes valid JSON at destPath
//   22. atomicWriteJson EXDEV fallback fires direct-write branch
//
// NOTE: TRIAGE-03 (cluster pre-filter, N≥5 → 1 LLM call) and TRIAGE-06
// (wrapPatentData prompt-injection defense) ship in Plan 03 — same file, distinct concern.
// TRIAGE-04 partial: wrapper from Plan 01 verified; CLI guard pending Plan 04; ESLint pending Plan 05.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  runTriage,
  VERIFIER_STRONG_AGREEMENT,
  SEVERITIES,
  emptyTriageReport,
  atomicWriteJson,
} from '../e2e/lib/triage-classifier.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let tmpDir;
let outputPath;
const RUN_ID = '2026-05-27T10-00-00Z';

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pct-triage-classifier-test-'));
  const runDir = path.join(tmpDir, RUN_ID);
  fs.mkdirSync(runDir, { recursive: true });
  outputPath = path.join(runDir, 'triage-report.json');
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Helpers / factories
// ---------------------------------------------------------------------------

/**
 * Factory: a single llm-report.json iteration (Phase 31/32/33 shape).
 * All fields present by default; override selectively per test.
 */
function makeIteration(overrides = {}) {
  return {
    iteration_n: 1,
    iso: '2026-05-27T10:00:30.000Z',
    llm_selection: {
      caseId: 'US11427642-llm-001',
      patentId: 'US11427642',
      selectedText: 'an antigen-binding protein comprising',
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
    scroll_y: 0,
    viewport_width: 1280,
    viewport_height: 720,
    selected_node_xpath: '/html/body[1]/div[1]',
    ...overrides,
  };
}

/**
 * Factory: a single rerun-report.json replay entry (Phase 33 D-09/D-10 shape).
 */
function makeRerunEntry(overrides = {}) {
  return {
    iteration_n: 1,
    original_verdict_status: 'pass',
    runs: [
      { status: 'pass', tier_used: 'A', reason: 'exact match' },
      { status: 'pass', tier_used: 'A', reason: 'exact match' },
      { status: 'pass', tier_used: 'A', reason: 'exact match' },
    ],
    confirmed_count: 3,
    total_runs: 3,
    verdict: 'CONFIRMED',
    ...overrides,
  };
}

/**
 * Factory: top-level llm-report.json envelope.
 */
function makeLlmReport({ iterations = [], runId = RUN_ID } = {}) {
  return {
    schema_version: 1,
    run_id: runId,
    started_iso: '2026-05-27T10:00:00.000Z',
    finished_iso: '2026-05-27T10:01:00.000Z',
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

/**
 * Factory: top-level rerun-report.json envelope (Phase 33 D-09 shape).
 */
function makeRerunReport({ replays = [], runId = RUN_ID } = {}) {
  return {
    schema_version: 1,
    source_llm_report: path.join(tmpDir, RUN_ID, 'llm-report.json'),
    run_id: runId,
    started_iso: '2026-05-27T10:00:00.000Z',
    finished_iso: '2026-05-27T10:00:30.000Z',
    summary: {
      confirmed_count: 0,
      flake_count: 0,
      not_replayable_count: 0,
    },
    replays,
  };
}

/**
 * Factory: a vi.fn() that simulates invokeLlm returning a successful LLM result.
 * Used as a call-count spy in this plan (Plan 03 drives actual cluster/single behavior).
 */
function makeMockInvokeLlm(returnValue = {}) {
  const defaultReturn = {
    ok: true,
    llmText: '{}',
    costUsd: 0,
    modelId: 'mock',
    rawJson: {},
    ...returnValue,
  };
  return vi.fn(async () => defaultReturn);
}

/**
 * Helper: run runTriage with a real fs-backed writeReport and capture the written output.
 */
function makeWriteReport() {
  let writtenPath = null;
  let writtenContent = null;
  const writer = vi.fn((p, c) => {
    writtenPath = p;
    writtenContent = c;
    // Ensure parent directory exists for tests that use real outputPath
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(p, c);
  });
  writer.getWrittenPath = () => writtenPath;
  writer.getWrittenContent = () => writtenContent;
  writer.getParsed = () => (writtenContent ? JSON.parse(writtenContent) : null);
  return writer;
}

// ---------------------------------------------------------------------------
// VERIFIER_STRONG_AGREEMENT — D-02, TRIAGE-02, Pitfall 2 mitigation
// ---------------------------------------------------------------------------

describe('VERIFIER_STRONG_AGREEMENT named gate (D-02 / TRIAGE-02)', () => {

  it('returns true for {status: pass, tier_used: A}', () => {
    expect(VERIFIER_STRONG_AGREEMENT({ status: 'pass', tier_used: 'A' })).toBe(true);
  });

  it('returns true for {status: pass, tier_used: B}', () => {
    expect(VERIFIER_STRONG_AGREEMENT({ status: 'pass', tier_used: 'B' })).toBe(true);
  });

  it('returns false for {status: pass, tier_used: C} — explicit Pitfall 2 assertion', () => {
    // Tier C MUST NOT satisfy strong agreement — masking Pitfall 2
    expect(VERIFIER_STRONG_AGREEMENT({ status: 'pass', tier_used: 'C' })).toBe(false);
  });

  it('returns false for {status: pass, tier_used: D}', () => {
    expect(VERIFIER_STRONG_AGREEMENT({ status: 'pass', tier_used: 'D' })).toBe(false);
  });

  it('returns false when status !== pass (tier A)', () => {
    expect(VERIFIER_STRONG_AGREEMENT({ status: 'fail', tier_used: 'A' })).toBe(false);
  });

  it('returns false when status is missing (no throw)', () => {
    // Defensive — missing input must not throw; must return false
    expect(VERIFIER_STRONG_AGREEMENT({ tier_used: 'A' })).toBe(false);
    expect(VERIFIER_STRONG_AGREEMENT({})).toBe(false);
  });

  it('returns false when called with no arguments (no throw)', () => {
    // Defensive default-arg destructure: VERIFIER_STRONG_AGREEMENT() must not throw
    expect(VERIFIER_STRONG_AGREEMENT()).toBe(false);
  });

});

// ---------------------------------------------------------------------------
// SEVERITIES frozen taxonomy — D-04
// ---------------------------------------------------------------------------

describe('SEVERITIES frozen taxonomy (D-04)', () => {

  it('is frozen', () => {
    expect(Object.isFrozen(SEVERITIES)).toBe(true);
  });

  it('contains all 5 levels in canonical order: critical, high, medium, low, info', () => {
    expect(SEVERITIES[0]).toBe('critical');
    expect(SEVERITIES[1]).toBe('high');
    expect(SEVERITIES[2]).toBe('medium');
    expect(SEVERITIES[3]).toBe('low');
    expect(SEVERITIES[4]).toBe('info');
    expect(SEVERITIES).toHaveLength(5);
  });

  it('includes all 5 severity values', () => {
    expect(SEVERITIES.includes('critical')).toBe(true);
    expect(SEVERITIES.includes('high')).toBe(true);
    expect(SEVERITIES.includes('medium')).toBe(true);
    expect(SEVERITIES.includes('low')).toBe(true);
    expect(SEVERITIES.includes('info')).toBe(true);
  });

});

// ---------------------------------------------------------------------------
// runTriage — heuristic resolution (D-01 + D-03, TRIAGE-01)
// Individual rule-chain tests — invokeLlm spy NEVER called
// ---------------------------------------------------------------------------

describe('runTriage — heuristic resolution (D-01 + D-03, TRIAGE-01)', () => {

  it('Rule 1: rerun FLAKE → severity low, category = iter.classification, path_taken heuristic; invokeLlm NOT called', async () => {
    const iteration = makeIteration({
      iteration_n: 1,
      classification: 'WRONG_CITATION',
      verifier_verdict: { status: 'pass', tier_used: 'A', reason: 'exact match' },
    });
    const rerunEntry = makeRerunEntry({
      iteration_n: 1,
      verdict: 'FLAKE',
      confirmed_count: 1,
      total_runs: 3,
    });
    const invokeLlmSpy = makeMockInvokeLlm();
    const writer = makeWriteReport();

    const report = await runTriage({
      inputLlmReport: makeLlmReport({ iterations: [iteration] }),
      inputRerunReport: makeRerunReport({ replays: [rerunEntry] }),
      invokeLlm: invokeLlmSpy,
      writeReport: writer,
      now: () => new Date('2026-05-27T12:00:00.000Z'),
      sourcePaths: { llm: outputPath.replace('triage-report.json', 'llm-report.json'), rerun: outputPath.replace('triage-report.json', 'rerun-report.json') },
    });

    expect(report.findings).toHaveLength(1);
    const f = report.findings[0];
    expect(f.severity).toBe('low');
    expect(f.category).toBe('WRONG_CITATION');
    expect(f.path_taken).toBe('heuristic');
    expect(f.confidence).toBe(1.0);
    expect(invokeLlmSpy.mock.calls.length).toBe(0);
  });

  it('Rule 2a: rerun CONFIRMED + tier A + WRONG_CITATION → severity high, path_taken heuristic; invokeLlm NOT called', async () => {
    const iteration = makeIteration({
      iteration_n: 1,
      classification: 'WRONG_CITATION',
      verifier_verdict: { status: 'pass', tier_used: 'A', reason: 'exact match' },
    });
    const rerunEntry = makeRerunEntry({
      iteration_n: 1,
      verdict: 'CONFIRMED',
      confirmed_count: 3,
      total_runs: 3,
    });
    const invokeLlmSpy = makeMockInvokeLlm();
    const writer = makeWriteReport();

    const report = await runTriage({
      inputLlmReport: makeLlmReport({ iterations: [iteration] }),
      inputRerunReport: makeRerunReport({ replays: [rerunEntry] }),
      invokeLlm: invokeLlmSpy,
      writeReport: writer,
      now: () => new Date('2026-05-27T12:00:00.000Z'),
      sourcePaths: { llm: outputPath.replace('triage-report.json', 'llm-report.json'), rerun: outputPath.replace('triage-report.json', 'rerun-report.json') },
    });

    expect(report.findings).toHaveLength(1);
    const f = report.findings[0];
    expect(f.severity).toBe('high');
    expect(f.category).toBe('WRONG_CITATION');
    expect(f.path_taken).toBe('heuristic');
    expect(f.confidence).toBe(0.95);
    expect(invokeLlmSpy.mock.calls.length).toBe(0);
  });

  it('Rule 2b: rerun CONFIRMED + tier B + VERIFIER_DISAGREE → severity medium, path_taken heuristic; invokeLlm NOT called', async () => {
    const iteration = makeIteration({
      iteration_n: 1,
      classification: 'VERIFIER_DISAGREE',
      verifier_verdict: { status: 'pass', tier_used: 'B', reason: 'fuzzy match' },
    });
    const rerunEntry = makeRerunEntry({
      iteration_n: 1,
      verdict: 'CONFIRMED',
      confirmed_count: 2,
      total_runs: 3,
    });
    const invokeLlmSpy = makeMockInvokeLlm();
    const writer = makeWriteReport();

    const report = await runTriage({
      inputLlmReport: makeLlmReport({ iterations: [iteration] }),
      inputRerunReport: makeRerunReport({ replays: [rerunEntry] }),
      invokeLlm: invokeLlmSpy,
      writeReport: writer,
      now: () => new Date('2026-05-27T12:00:00.000Z'),
      sourcePaths: { llm: outputPath.replace('triage-report.json', 'llm-report.json'), rerun: outputPath.replace('triage-report.json', 'rerun-report.json') },
    });

    expect(report.findings).toHaveLength(1);
    const f = report.findings[0];
    expect(f.severity).toBe('medium');
    expect(f.category).toBe('VERIFIER_DISAGREE');
    expect(f.path_taken).toBe('heuristic');
    expect(invokeLlmSpy.mock.calls.length).toBe(0);
  });

  it('Rule 3a: NOT_REPLAYABLE + LLM_HALLUCINATED_SELECTION → severity critical, path_taken heuristic', async () => {
    const iteration = makeIteration({
      iteration_n: 1,
      classification: 'LLM_HALLUCINATED_SELECTION',
      verifier_verdict: null,
      llm_selection: null,
      citation: null,
    });
    const rerunEntry = makeRerunEntry({
      iteration_n: 1,
      verdict: 'NOT_REPLAYABLE',
      confirmed_count: 0,
      total_runs: 0,
      runs: [],
    });
    const invokeLlmSpy = makeMockInvokeLlm();
    const writer = makeWriteReport();

    const report = await runTriage({
      inputLlmReport: makeLlmReport({ iterations: [iteration] }),
      inputRerunReport: makeRerunReport({ replays: [rerunEntry] }),
      invokeLlm: invokeLlmSpy,
      writeReport: writer,
      now: () => new Date('2026-05-27T12:00:00.000Z'),
      sourcePaths: { llm: outputPath.replace('triage-report.json', 'llm-report.json'), rerun: outputPath.replace('triage-report.json', 'rerun-report.json') },
    });

    expect(report.findings).toHaveLength(1);
    const f = report.findings[0];
    expect(f.severity).toBe('critical');
    expect(f.category).toBe('LLM_HALLUCINATED_SELECTION');
    expect(f.path_taken).toBe('heuristic');
    expect(invokeLlmSpy.mock.calls.length).toBe(0);
  });

  it('Rule 3b: NOT_REPLAYABLE + LLM_API_ERROR → severity medium, path_taken heuristic', async () => {
    const iteration = makeIteration({
      iteration_n: 1,
      classification: 'LLM_API_ERROR',
      verifier_verdict: null,
      llm_selection: null,
      citation: null,
    });
    const rerunEntry = makeRerunEntry({
      iteration_n: 1,
      verdict: 'NOT_REPLAYABLE',
      confirmed_count: 0,
      total_runs: 0,
      runs: [],
    });
    const invokeLlmSpy = makeMockInvokeLlm();
    const writer = makeWriteReport();

    const report = await runTriage({
      inputLlmReport: makeLlmReport({ iterations: [iteration] }),
      inputRerunReport: makeRerunReport({ replays: [rerunEntry] }),
      invokeLlm: invokeLlmSpy,
      writeReport: writer,
      now: () => new Date('2026-05-27T12:00:00.000Z'),
      sourcePaths: { llm: outputPath.replace('triage-report.json', 'llm-report.json'), rerun: outputPath.replace('triage-report.json', 'rerun-report.json') },
    });

    expect(report.findings).toHaveLength(1);
    const f = report.findings[0];
    expect(f.severity).toBe('medium');
    expect(f.category).toBe('LLM_API_ERROR');
    expect(f.path_taken).toBe('heuristic');
    expect(invokeLlmSpy.mock.calls.length).toBe(0);
  });

  it('Rule 3c: NOT_REPLAYABLE + HARNESS_ERROR → severity low, path_taken heuristic', async () => {
    const iteration = makeIteration({
      iteration_n: 1,
      classification: 'HARNESS_ERROR',
      verifier_verdict: null,
      llm_selection: null,
      citation: null,
    });
    const rerunEntry = makeRerunEntry({
      iteration_n: 1,
      verdict: 'NOT_REPLAYABLE',
      confirmed_count: 0,
      total_runs: 0,
      runs: [],
    });
    const invokeLlmSpy = makeMockInvokeLlm();
    const writer = makeWriteReport();

    const report = await runTriage({
      inputLlmReport: makeLlmReport({ iterations: [iteration] }),
      inputRerunReport: makeRerunReport({ replays: [rerunEntry] }),
      invokeLlm: invokeLlmSpy,
      writeReport: writer,
      now: () => new Date('2026-05-27T12:00:00.000Z'),
      sourcePaths: { llm: outputPath.replace('triage-report.json', 'llm-report.json'), rerun: outputPath.replace('triage-report.json', 'rerun-report.json') },
    });

    expect(report.findings).toHaveLength(1);
    const f = report.findings[0];
    expect(f.severity).toBe('low');
    expect(f.category).toBe('HARNESS_ERROR');
    expect(f.path_taken).toBe('heuristic');
    expect(invokeLlmSpy.mock.calls.length).toBe(0);
  });

  it('Rule 3d: NOT_REPLAYABLE + PASS → severity info, path_taken heuristic', async () => {
    const iteration = makeIteration({
      iteration_n: 1,
      classification: 'PASS',
      verifier_verdict: { status: 'pass', tier_used: 'A', reason: 'exact match' },
    });
    const rerunEntry = makeRerunEntry({
      iteration_n: 1,
      verdict: 'NOT_REPLAYABLE',
      confirmed_count: 0,
      total_runs: 0,
      runs: [],
    });
    const invokeLlmSpy = makeMockInvokeLlm();
    const writer = makeWriteReport();

    const report = await runTriage({
      inputLlmReport: makeLlmReport({ iterations: [iteration] }),
      inputRerunReport: makeRerunReport({ replays: [rerunEntry] }),
      invokeLlm: invokeLlmSpy,
      writeReport: writer,
      now: () => new Date('2026-05-27T12:00:00.000Z'),
      sourcePaths: { llm: outputPath.replace('triage-report.json', 'llm-report.json'), rerun: outputPath.replace('triage-report.json', 'rerun-report.json') },
    });

    expect(report.findings).toHaveLength(1);
    const f = report.findings[0];
    expect(f.severity).toBe('info');
    expect(f.category).toBe('PASS');
    expect(f.path_taken).toBe('heuristic');
    expect(invokeLlmSpy.mock.calls.length).toBe(0);
  });

  it('Aggregate: 7-iteration heuristic-only report → invokeLlm callCount === 0, heuristic_count === 7, llm_pass_count === 0, cluster_pass_count === 0', async () => {
    // Covers all 7 heuristic-resolvable paths:
    //   iter 1: FLAKE
    //   iter 2: CONFIRMED + tier A + WRONG_CITATION (rule 2a)
    //   iter 3: CONFIRMED + tier B + VERIFIER_DISAGREE (rule 2b)
    //   iter 4: NOT_REPLAYABLE + LLM_HALLUCINATED_SELECTION (rule 3a)
    //   iter 5: NOT_REPLAYABLE + LLM_API_ERROR (rule 3b)
    //   iter 6: NOT_REPLAYABLE + HARNESS_ERROR (rule 3c)
    //   iter 7: NOT_REPLAYABLE + PASS (rule 3d)
    const iterations = [
      makeIteration({ iteration_n: 1, classification: 'WRONG_CITATION', verifier_verdict: { status: 'pass', tier_used: 'A', reason: 'ok' } }),
      makeIteration({ iteration_n: 2, classification: 'WRONG_CITATION', verifier_verdict: { status: 'pass', tier_used: 'A', reason: 'ok' } }),
      makeIteration({ iteration_n: 3, classification: 'VERIFIER_DISAGREE', verifier_verdict: { status: 'pass', tier_used: 'B', reason: 'fuzzy' } }),
      makeIteration({ iteration_n: 4, classification: 'LLM_HALLUCINATED_SELECTION', verifier_verdict: null, llm_selection: null, citation: null }),
      makeIteration({ iteration_n: 5, classification: 'LLM_API_ERROR', verifier_verdict: null, llm_selection: null, citation: null }),
      makeIteration({ iteration_n: 6, classification: 'HARNESS_ERROR', verifier_verdict: null, llm_selection: null, citation: null }),
      makeIteration({ iteration_n: 7, classification: 'PASS', verifier_verdict: { status: 'pass', tier_used: 'A', reason: 'ok' } }),
    ];
    const replays = [
      makeRerunEntry({ iteration_n: 1, verdict: 'FLAKE', confirmed_count: 1, total_runs: 3 }),
      makeRerunEntry({ iteration_n: 2, verdict: 'CONFIRMED', confirmed_count: 3, total_runs: 3 }),
      makeRerunEntry({ iteration_n: 3, verdict: 'CONFIRMED', confirmed_count: 2, total_runs: 3 }),
      makeRerunEntry({ iteration_n: 4, verdict: 'NOT_REPLAYABLE', confirmed_count: 0, total_runs: 0, runs: [] }),
      makeRerunEntry({ iteration_n: 5, verdict: 'NOT_REPLAYABLE', confirmed_count: 0, total_runs: 0, runs: [] }),
      makeRerunEntry({ iteration_n: 6, verdict: 'NOT_REPLAYABLE', confirmed_count: 0, total_runs: 0, runs: [] }),
      makeRerunEntry({ iteration_n: 7, verdict: 'NOT_REPLAYABLE', confirmed_count: 0, total_runs: 0, runs: [] }),
    ];
    const invokeLlmSpy = makeMockInvokeLlm();
    const writer = makeWriteReport();

    const report = await runTriage({
      inputLlmReport: makeLlmReport({ iterations }),
      inputRerunReport: makeRerunReport({ replays }),
      invokeLlm: invokeLlmSpy,
      writeReport: writer,
      now: () => new Date('2026-05-27T12:00:00.000Z'),
      sourcePaths: { llm: outputPath.replace('triage-report.json', 'llm-report.json'), rerun: outputPath.replace('triage-report.json', 'rerun-report.json') },
    });

    expect(invokeLlmSpy.mock.calls.length).toBe(0);
    expect(report.findings.length).toBe(7);
    expect(report.summary.heuristic_count).toBe(7);
    expect(report.summary.llm_pass_count).toBe(0);
    expect(report.summary.cluster_pass_count).toBe(0);
  });

});

// ---------------------------------------------------------------------------
// Tier C escalation boundary (TRIAGE-01 negative)
// Plan 03 will replace path_taken 'pending_llm' with 'llm_single' or 'llm_cluster'
// ---------------------------------------------------------------------------

describe('runTriage — Tier C escalation (TRIAGE-01 boundary / Pitfall 2)', () => {

  it('CONFIRMED + tier_used C + WRONG_CITATION → path_taken pending_llm (ambiguous — Plan 03 seam)', async () => {
    // Pitfall 2: Tier C MUST NOT classify heuristically; must escalate.
    // This plan emits path_taken: 'pending_llm' as a TRANSIENT placeholder.
    // Plan 03 will update this assertion to 'llm_single' or 'llm_cluster'.
    const iteration = makeIteration({
      iteration_n: 1,
      classification: 'WRONG_CITATION',
      verifier_verdict: { status: 'pass', tier_used: 'C', reason: 'fuzzy' },
    });
    const rerunEntry = makeRerunEntry({
      iteration_n: 1,
      verdict: 'CONFIRMED',
      confirmed_count: 3,
      total_runs: 3,
    });
    const invokeLlmSpy = makeMockInvokeLlm();
    const writer = makeWriteReport();

    const report = await runTriage({
      inputLlmReport: makeLlmReport({ iterations: [iteration] }),
      inputRerunReport: makeRerunReport({ replays: [rerunEntry] }),
      invokeLlm: invokeLlmSpy,
      writeReport: writer,
      now: () => new Date('2026-05-27T12:00:00.000Z'),
      sourcePaths: { llm: outputPath.replace('triage-report.json', 'llm-report.json'), rerun: outputPath.replace('triage-report.json', 'rerun-report.json') },
    });

    expect(report.findings).toHaveLength(1);
    const f = report.findings[0];
    // CRITICAL: Tier C MUST NOT be heuristic — it escalates to pending_llm
    expect(f.path_taken).toBe('pending_llm');
    // Category must be preserved from the input classification
    expect(f.category).toBe('WRONG_CITATION');
  });

  it('VERIFIER_STRONG_AGREEMENT({status: pass, tier_used: C}) === false verifies the gate directly (Pitfall 2)', () => {
    // Belt-and-suspenders: assert the gate function itself, not just via runTriage
    expect(VERIFIER_STRONG_AGREEMENT({ status: 'pass', tier_used: 'C' })).toBe(false);
  });

});

// ---------------------------------------------------------------------------
// D-09/D-10 schema-guard (TRIAGE-05)
// ---------------------------------------------------------------------------

describe('runTriage — triage-report.json schema (D-09 + D-10, TRIAGE-05)', () => {

  it('D-09: top-level schema keys all present after runTriage', async () => {
    const iterations = [
      makeIteration({ iteration_n: 1, classification: 'WRONG_CITATION', verifier_verdict: { status: 'pass', tier_used: 'A', reason: 'ok' } }),
      makeIteration({ iteration_n: 2, classification: 'LLM_API_ERROR', verifier_verdict: null, llm_selection: null, citation: null }),
      makeIteration({ iteration_n: 3, classification: 'FLAKE_ITER', verifier_verdict: null, llm_selection: null, citation: null }),
    ];
    const replays = [
      makeRerunEntry({ iteration_n: 1, verdict: 'CONFIRMED', confirmed_count: 3, total_runs: 3 }),
      makeRerunEntry({ iteration_n: 2, verdict: 'NOT_REPLAYABLE', confirmed_count: 0, total_runs: 0, runs: [] }),
      makeRerunEntry({ iteration_n: 3, verdict: 'FLAKE', confirmed_count: 1, total_runs: 3 }),
    ];
    const writer = makeWriteReport();
    const llmPath = outputPath.replace('triage-report.json', 'llm-report.json');
    const rerunPath = outputPath.replace('triage-report.json', 'rerun-report.json');

    await runTriage({
      inputLlmReport: makeLlmReport({ iterations }),
      inputRerunReport: makeRerunReport({ replays }),
      invokeLlm: makeMockInvokeLlm(),
      writeReport: writer,
      now: () => new Date('2026-05-27T12:00:00.000Z'),
      sourcePaths: { llm: llmPath, rerun: rerunPath },
    });

    const written = writer.getParsed();
    // D-09 top-level keys
    expect(written).toHaveProperty('schema_version', 1);
    expect(written).toHaveProperty('source_llm_report');
    expect(written).toHaveProperty('source_rerun_report');
    expect(written).toHaveProperty('run_id');
    expect(written).toHaveProperty('started_iso');
    expect(written).toHaveProperty('finished_iso');
    expect(written).toHaveProperty('summary');
    expect(written).toHaveProperty('findings');
    expect(Array.isArray(written.findings)).toBe(true);
  });

  it('D-09 summary: by_severity has all 5 SEVERITIES keys as numbers', async () => {
    const iterations = [makeIteration({ iteration_n: 1, classification: 'WRONG_CITATION', verifier_verdict: { status: 'pass', tier_used: 'A', reason: 'ok' } })];
    const replays = [makeRerunEntry({ iteration_n: 1, verdict: 'CONFIRMED', confirmed_count: 3, total_runs: 3 })];
    const writer = makeWriteReport();

    await runTriage({
      inputLlmReport: makeLlmReport({ iterations }),
      inputRerunReport: makeRerunReport({ replays }),
      invokeLlm: makeMockInvokeLlm(),
      writeReport: writer,
      now: () => new Date('2026-05-27T12:00:00.000Z'),
      sourcePaths: { llm: outputPath.replace('triage-report.json', 'llm-report.json'), rerun: outputPath.replace('triage-report.json', 'rerun-report.json') },
    });

    const written = writer.getParsed();
    const bs = written.summary.by_severity;
    expect(typeof bs.critical).toBe('number');
    expect(typeof bs.high).toBe('number');
    expect(typeof bs.medium).toBe('number');
    expect(typeof bs.low).toBe('number');
    expect(typeof bs.info).toBe('number');
  });

  it('D-09 summary: by_category, heuristic_count, llm_pass_count, cluster_pass_count, total_findings all present as numbers', async () => {
    const iterations = [makeIteration({ iteration_n: 1, classification: 'WRONG_CITATION', verifier_verdict: { status: 'pass', tier_used: 'A', reason: 'ok' } })];
    const replays = [makeRerunEntry({ iteration_n: 1, verdict: 'CONFIRMED', confirmed_count: 3, total_runs: 3 })];
    const writer = makeWriteReport();

    await runTriage({
      inputLlmReport: makeLlmReport({ iterations }),
      inputRerunReport: makeRerunReport({ replays }),
      invokeLlm: makeMockInvokeLlm(),
      writeReport: writer,
      now: () => new Date('2026-05-27T12:00:00.000Z'),
      sourcePaths: { llm: outputPath.replace('triage-report.json', 'llm-report.json'), rerun: outputPath.replace('triage-report.json', 'rerun-report.json') },
    });

    const written = writer.getParsed();
    expect(written.summary).toHaveProperty('by_category');
    expect(typeof written.summary.heuristic_count).toBe('number');
    expect(typeof written.summary.llm_pass_count).toBe('number');
    expect(typeof written.summary.cluster_pass_count).toBe('number');
    expect(typeof written.summary.total_findings).toBe('number');
  });

  it('D-10: per-finding entry has all required schema keys', async () => {
    const iterations = [makeIteration({ iteration_n: 1, classification: 'WRONG_CITATION', verifier_verdict: { status: 'pass', tier_used: 'A', reason: 'ok' } })];
    const replays = [makeRerunEntry({ iteration_n: 1, verdict: 'CONFIRMED', confirmed_count: 3, total_runs: 3 })];
    const writer = makeWriteReport();

    await runTriage({
      inputLlmReport: makeLlmReport({ iterations }),
      inputRerunReport: makeRerunReport({ replays }),
      invokeLlm: makeMockInvokeLlm(),
      writeReport: writer,
      now: () => new Date('2026-05-27T12:00:00.000Z'),
      sourcePaths: { llm: outputPath.replace('triage-report.json', 'llm-report.json'), rerun: outputPath.replace('triage-report.json', 'rerun-report.json') },
    });

    const written = writer.getParsed();
    expect(written.findings).toHaveLength(1);
    const f = written.findings[0];
    expect(f).toHaveProperty('iteration_n');
    expect(f).toHaveProperty('severity');
    expect(f).toHaveProperty('category');
    expect(f).toHaveProperty('root_cause_hypothesis');
    expect(f).toHaveProperty('confidence');
    expect(f).toHaveProperty('rationale');
    expect(f).toHaveProperty('path_taken');
  });

  it('summary arithmetic invariant: heuristic_count + llm_pass_count + cluster_pass_count === total_findings === findings.length', async () => {
    const iterations = [
      makeIteration({ iteration_n: 1, classification: 'WRONG_CITATION', verifier_verdict: { status: 'pass', tier_used: 'A', reason: 'ok' } }),
      makeIteration({ iteration_n: 2, classification: 'LLM_API_ERROR', verifier_verdict: null, llm_selection: null, citation: null }),
    ];
    const replays = [
      makeRerunEntry({ iteration_n: 1, verdict: 'CONFIRMED', confirmed_count: 3, total_runs: 3 }),
      makeRerunEntry({ iteration_n: 2, verdict: 'NOT_REPLAYABLE', confirmed_count: 0, total_runs: 0, runs: [] }),
    ];
    const writer = makeWriteReport();

    const report = await runTriage({
      inputLlmReport: makeLlmReport({ iterations }),
      inputRerunReport: makeRerunReport({ replays }),
      invokeLlm: makeMockInvokeLlm(),
      writeReport: writer,
      now: () => new Date('2026-05-27T12:00:00.000Z'),
      sourcePaths: { llm: outputPath.replace('triage-report.json', 'llm-report.json'), rerun: outputPath.replace('triage-report.json', 'rerun-report.json') },
    });

    const written = writer.getParsed();
    // Arithmetic invariant from D-09
    expect(written.summary.heuristic_count + written.summary.llm_pass_count + written.summary.cluster_pass_count)
      .toBe(written.summary.total_findings);
    expect(written.summary.total_findings).toBe(written.findings.length);
    // Also check returned object matches written file
    expect(report.summary.total_findings).toBe(report.findings.length);
  });

  it('runTriage returns the same report object that was written (JSON round-trip equality)', async () => {
    const iterations = [makeIteration({ iteration_n: 1, classification: 'WRONG_CITATION', verifier_verdict: { status: 'pass', tier_used: 'A', reason: 'ok' } })];
    const replays = [makeRerunEntry({ iteration_n: 1, verdict: 'CONFIRMED', confirmed_count: 3, total_runs: 3 })];
    const writer = makeWriteReport();

    const returned = await runTriage({
      inputLlmReport: makeLlmReport({ iterations }),
      inputRerunReport: makeRerunReport({ replays }),
      invokeLlm: makeMockInvokeLlm(),
      writeReport: writer,
      now: () => new Date('2026-05-27T12:00:00.000Z'),
      sourcePaths: { llm: outputPath.replace('triage-report.json', 'llm-report.json'), rerun: outputPath.replace('triage-report.json', 'rerun-report.json') },
    });

    const writtenParsed = writer.getParsed();
    // JSON round-trip: the written JSON when parsed must equal the returned object
    expect(writtenParsed).toEqual(JSON.parse(JSON.stringify(returned)));
  });

});

// ---------------------------------------------------------------------------
// atomicWriteJson — D-12 (inlined verbatim from rerun-validator.js)
// ---------------------------------------------------------------------------

describe('atomicWriteJson (D-12 inline)', () => {

  it('writes valid JSON content to the destination path', () => {
    const testPath = path.join(tmpDir, 'atomic-test.json');
    const content = '{"test":true,"n":42}\n';
    atomicWriteJson(testPath, content);
    expect(fs.existsSync(testPath)).toBe(true);
    expect(fs.readFileSync(testPath, 'utf8')).toBe(content);
  });

  it('EXDEV fallback fires direct-write branch when renameSync throws EXDEV', () => {
    const renameSpy = vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      const e = new Error('EXDEV cross-device link');
      e.code = 'EXDEV';
      throw e;
    });

    const testPath = path.join(tmpDir, 'exdev-test.json');
    const content = '{"exdev":true}\n';

    expect(() => atomicWriteJson(testPath, content)).not.toThrow();
    expect(fs.existsSync(testPath)).toBe(true);
    expect(fs.readFileSync(testPath, 'utf8')).toBe(content);

    // Tmp file should be cleaned up
    const tmpFilePath = `${testPath}.tmp.${process.pid}`;
    expect(fs.existsSync(tmpFilePath)).toBe(false);

    renameSpy.mockRestore();
  });

});

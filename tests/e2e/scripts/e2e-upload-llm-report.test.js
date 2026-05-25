// tests/e2e/scripts/e2e-upload-llm-report.test.js
//
// Phase 32 Plan 32-01 (Wave 0 scaffolding, UAT-02) — contract test for the
// two-stage upload helper that Wave 2 Plan 32-04 will ship at
// scripts/e2e-upload-llm-report.mjs. The helper file does not exist yet, so
// this spec is SKIP in Wave 0 — it turns RUN-and-GREEN once Plan 32-04 ships
// the pure-function export with the documented orchestration contract.
//
// The mock-ghClient DI pattern mirrors tests/unit/e2e-report-issue.test.js
// (lines 282-363, processReport()) — pure-function entry point receives an
// injected gh client whose methods record calls into an array the test then
// asserts against.
//
// Why dynamic import (not static): static `import` of the not-yet-existing
// helper would crash at file-load time, marking the entire test file as
// failed rather than skipped. Wrapping the describe in
// `describe.skipIf(!fs.existsSync(HELPER_PATH))` plus a per-test
// `await import(HELPER_PATH)` lets Vitest discover the file without crashing.
//
// Behaviors asserted (Plan 32-04 contract):
//   1. Happy path: orchestrates auth-status → workflow-run ingest (payload via
//      stdin --json) → run-list (--json databaseId,createdAt) → workflow-run
//      nightly (-f llm_run_id=<captured>) → run-view --web (browser open)
//   2. Race-mitigation: filter rejects stale entries (createdAt < trigger ISO);
//      the captured run_id is the post-trigger one (Pattern 1 in RESEARCH)
//   3. Oversized payload (>60KB base64) exits with code 2 BEFORE any gh call
//      (RESEARCH "Payload Size Constraint")
//   4. gh auth status failure exits with code 7 BEFORE any other gh call

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HELPER_PATH = path.resolve(__dirname, '../../../scripts/e2e-upload-llm-report.mjs');

// Minimal valid llm-report.json payload — used by happy-path and stale-filter
// tests. Schema matches tests/unit/fixtures/sample-llm-report.json.
const MINIMAL_REPORT = {
  run_id: '2026-05-24T12-00-00Z',
  started_iso: '2026-05-24T12:00:00.000Z',
  finished_iso: '2026-05-24T12:05:00.000Z',
  iterations_total: 1,
  summary: {
    passed: 1, wrong_citation: 0, verifier_disagree: 0,
    llm_hallucinated_selection: 0, llm_api_error: 0, harness_error: 0,
    total_cost_usd: 0.19,
  },
  iterations: [{
    iteration_n: 1,
    iso: '2026-05-24T12:00:30.000Z',
    classification: 'PASS',
    cost_usd: 0.19,
  }],
};

// SKIP in Wave 0 — turns RUN-and-GREEN once Plan 32-04 ships
// scripts/e2e-upload-llm-report.mjs. The dynamic `await import(HELPER_PATH)`
// inside each test keeps the file parseable when the helper is absent.
describe.skipIf(!fs.existsSync(HELPER_PATH))('e2e-upload-llm-report helper (Phase 32)', () => {
  it('happy path: orchestrates ingest → run-list → nightly → browser-open', async () => {
    const helper = await import(HELPER_PATH);
    const ghCalls = [];
    const triggerIso = '2026-05-24T12:10:00.000Z';
    const realRunId = 7700000001;

    const ghClient = {
      authStatus: () => { ghCalls.push({ op: 'authStatus' }); },
      workflowRun: (workflowFile, inputs, opts) => {
        ghCalls.push({ op: 'workflowRun', workflowFile, inputs, opts });
      },
      runList: (workflowFile) => {
        ghCalls.push({ op: 'runList', workflowFile });
        return [
          { databaseId: realRunId, createdAt: '2026-05-24T12:10:30.000Z' },
        ];
      },
      runView: (id, opts) => { ghCalls.push({ op: 'runView', id, opts }); },
      repoView: () => {
        ghCalls.push({ op: 'repoView' });
        return { nameWithOwner: 'owner/repo' };
      },
    };

    // The helper's pure-function export (name TBD by Plan 32-04 — common
    // candidates: uploadLlmReport, runUploadFlow, main). The test imports
    // whatever Plan 32-04 exports as the orchestration entry point.
    const fn = helper.uploadLlmReport ?? helper.runUploadFlow ?? helper.default;
    expect(typeof fn).toBe('function');

    await fn(MINIMAL_REPORT, { ghClient, triggerIso });

    // Call sequence: authStatus → workflowRun (ingest) → runList → workflowRun
    // (nightly with captured run_id) → runView (browser).
    const ops = ghCalls.map(c => c.op);
    expect(ops[0]).toBe('authStatus');
    expect(ops).toContain('workflowRun');
    expect(ops).toContain('runList');
    expect(ops).toContain('runView');

    // The ingest workflowRun MUST carry the report payload base64-encoded.
    const ingestCall = ghCalls.find(
      c => c.op === 'workflowRun' && c.workflowFile && /ingest/i.test(c.workflowFile),
    );
    expect(ingestCall).toBeTruthy();
    expect(ingestCall.inputs).toHaveProperty('payload_b64');

    // The runList call MUST request --json databaseId,createdAt for the
    // race-mitigation filter (Pattern 1).
    const listCall = ghCalls.find(c => c.op === 'runList');
    expect(listCall.workflowFile).toMatch(/ingest/i);

    // The nightly workflowRun MUST forward llm_run_id = captured databaseId.
    const nightlyCall = ghCalls.find(
      c => c.op === 'workflowRun' && c.workflowFile && /nightly/i.test(c.workflowFile),
    );
    expect(nightlyCall).toBeTruthy();
    expect(String(nightlyCall.inputs.llm_run_id)).toBe(String(realRunId));

    // The runView call MUST open the nightly run in the browser.
    const viewCall = ghCalls.find(c => c.op === 'runView');
    expect(viewCall.opts).toHaveProperty('web', true);
  });

  it('race-mitigation filter rejects stale entries (createdAt < trigger ISO)', async () => {
    const helper = await import(HELPER_PATH);
    const triggerIso = '2026-05-24T12:10:00.000Z';
    const staleRunId = 7700000000;  // BEFORE triggerIso — must be filtered
    const realRunId = 7700000001;   // AFTER triggerIso — the actual one

    const ghCalls = [];
    const ghClient = {
      authStatus: () => {},
      workflowRun: (workflowFile, inputs, opts) => {
        ghCalls.push({ op: 'workflowRun', workflowFile, inputs, opts });
      },
      runList: () => [
        { databaseId: staleRunId, createdAt: '2026-05-24T12:09:30.000Z' },
        { databaseId: realRunId, createdAt: '2026-05-24T12:10:30.000Z' },
      ],
      runView: () => {},
      repoView: () => ({ nameWithOwner: 'owner/repo' }),
    };

    const fn = helper.uploadLlmReport ?? helper.runUploadFlow ?? helper.default;
    await fn(MINIMAL_REPORT, { ghClient, triggerIso });

    // The nightly workflow MUST receive the POST-trigger run_id, not the stale one.
    const nightlyCall = ghCalls.find(
      c => c.op === 'workflowRun' && c.workflowFile && /nightly/i.test(c.workflowFile),
    );
    expect(nightlyCall).toBeTruthy();
    expect(String(nightlyCall.inputs.llm_run_id)).toBe(String(realRunId));
    expect(String(nightlyCall.inputs.llm_run_id)).not.toBe(String(staleRunId));
  });

  it('oversized payload (>60KB base64) exits with code 2 BEFORE any gh call', async () => {
    const helper = await import(HELPER_PATH);
    const ghCalls = [];
    const ghClient = {
      authStatus: () => { ghCalls.push({ op: 'authStatus' }); },
      workflowRun: (...args) => { ghCalls.push({ op: 'workflowRun', args }); },
      runList: () => { ghCalls.push({ op: 'runList' }); return []; },
      runView: () => { ghCalls.push({ op: 'runView' }); },
      repoView: () => { ghCalls.push({ op: 'repoView' }); return { nameWithOwner: 'o/r' }; },
    };

    // Build a synthetic report whose base64-encoded form exceeds 60KB.
    // ~50KB of raw JSON → ~67KB base64 (4/3 expansion).
    const huge = 'x'.repeat(50_000);
    const oversized = {
      ...MINIMAL_REPORT,
      iterations: [
        { ...MINIMAL_REPORT.iterations[0], llm_raw_response: huge },
      ],
    };

    const fn = helper.uploadLlmReport ?? helper.runUploadFlow ?? helper.default;
    // The helper MUST reject before any gh invocation. Either throw with
    // exitCode 2 OR return { exitCode: 2 } — Plan 32-04 picks the shape; the
    // test accepts either.
    let exitCode = null;
    try {
      const r = await fn(oversized, { ghClient, triggerIso: '2026-05-24T12:10:00.000Z' });
      exitCode = r?.exitCode ?? null;
    } catch (e) {
      exitCode = e?.exitCode ?? e?.code ?? null;
    }
    expect(exitCode).toBe(2);
    expect(ghCalls).toEqual([]);
  });

  it('gh auth status failure exits with code 7 BEFORE any other gh call', async () => {
    const helper = await import(HELPER_PATH);
    const ghCalls = [];
    const ghClient = {
      authStatus: () => {
        ghCalls.push({ op: 'authStatus' });
        const err = new Error('not logged in');
        err.exitCode = 7;
        throw err;
      },
      workflowRun: (...args) => { ghCalls.push({ op: 'workflowRun', args }); },
      runList: () => { ghCalls.push({ op: 'runList' }); return []; },
      runView: () => { ghCalls.push({ op: 'runView' }); },
      repoView: () => { ghCalls.push({ op: 'repoView' }); return { nameWithOwner: 'o/r' }; },
    };

    const fn = helper.uploadLlmReport ?? helper.runUploadFlow ?? helper.default;
    let exitCode = null;
    try {
      const r = await fn(MINIMAL_REPORT, { ghClient, triggerIso: '2026-05-24T12:10:00.000Z' });
      exitCode = r?.exitCode ?? null;
    } catch (e) {
      exitCode = e?.exitCode ?? e?.code ?? null;
    }
    expect(exitCode).toBe(7);
    // ONLY authStatus was invoked. No subsequent gh calls.
    expect(ghCalls.map(c => c.op)).toEqual(['authStatus']);
  });
});

// tests/e2e/scripts/e2e-upload-llm-report.test.js
//
// Phase 32 Plan 32-04 (UAT-03) — GREEN in Wave 2 — covers four behaviors of
// the upload orchestrator exported by scripts/e2e-upload-llm-report.mjs:
//   1. Happy path: call ordering through authStatus → workflowRun(ingest, stdin)
//      → sleep → runList(ingest) → workflowRun(nightly, llm_run_id) →
//      repoView → runView(web:true); stdout includes the ingest run URL.
//   2. Race-mitigation filter: when runList returns mixed pre/post-trigger
//      entries, the captured run_id is the POST-trigger one (Pattern 1 in
//      32-RESEARCH.md).
//   3. Oversize payload (>60KB base64) exits with code 2 BEFORE any
//      gh.workflowRun invocation.
//   4. gh auth status failure exits with code 7 BEFORE any other gh call.
//
// Plan 32-01 (Wave 0) shipped a stub for this file that used a conditional-
// skip wrapper plus a dynamic helper-module import so the file would not crash
// before the helper existed. Plan 32-04 ships the helper, so this rewrite
// uses static imports and a recording mock-ghClient DI pattern that mirrors
// tests/unit/e2e-report-issue.test.js processReport() coverage.
//
// Mock-ghClient design: `makeMockGhClient(overrides)` returns an object whose
// methods push `{op, ...args}` into a shared `ghCalls` array passed in from
// the test. Defaults cover the happy path; overrides exercise oversize,
// auth-fail, and stale-entry-filter scenarios.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  uploadReport,
  MAX_BASE64_BYTES,
} from '../../../scripts/e2e-upload-llm-report.mjs';

// Deterministic fixed-time fixture used by every test. The helper reads
// triggerIsoMs = now() before Stage 1; the mock runList returns entries whose
// createdAt is either before (stale) or after this anchor.
const FIXED_NOW_MS = 1_700_000_000_000; // 2023-11-14T22:13:20Z

// Minimal valid llm-report.json payload — schema matches initLlmReport's
// emptyReport() shape from tests/e2e/lib/llm-report.js. Used by happy-path
// and race-filter tests.
const MINIMAL_REPORT = {
  run_id: '2026-05-24T12-00-00Z',
  started_iso: '2026-05-24T12:00:00.000Z',
  finished_iso: '2026-05-24T12:05:00.000Z',
  iterations_total: 1,
  summary: {
    passed: 1,
    wrong_citation: 0,
    verifier_disagree: 0,
    llm_hallucinated_selection: 0,
    llm_api_error: 0,
    harness_error: 0,
    total_cost_usd: 0.19,
  },
  iterations: [
    {
      iteration_n: 1,
      iso: '2026-05-24T12:00:30.000Z',
      classification: 'PASS',
      cost_usd: 0.19,
    },
  ],
};

/**
 * Build a recording mock ghClient. Every method pushes `{op, ...args}` into
 * the supplied `ghCalls` array so tests can assert order + arguments.
 * `overrides` shallow-merges into the default methods so a single test can
 * replace e.g. authStatus to throw or runList to return stale entries.
 */
function makeMockGhClient(ghCalls, overrides = {}) {
  const defaults = {
    authStatus: () => {
      ghCalls.push({ op: 'authStatus' });
    },
    workflowRun: (file, inputs, opts) => {
      ghCalls.push({ op: 'workflowRun', file, inputs, opts });
    },
    runList: (file, limit) => {
      ghCalls.push({ op: 'runList', file, limit });
      // Default: one entry POST-trigger so the happy path resolves.
      return [
        {
          databaseId: 999,
          createdAt: new Date(FIXED_NOW_MS + 1000).toISOString(),
        },
      ];
    },
    runView: (id, opts) => {
      ghCalls.push({ op: 'runView', id, opts });
    },
    repoView: () => {
      ghCalls.push({ op: 'repoView' });
      return { nameWithOwner: 'owner/repo' };
    },
  };
  return { ...defaults, ...overrides };
}

// Tmp report file — written in beforeEach so the helper's
// `fs.existsSync(reportPath)` check passes. The helper reads via the injected
// `readFile` seam (not fs directly), so the on-disk content does not matter
// for tests that override readFile — but the existsSync check is real.
let tmpReportPath;

beforeEach(() => {
  tmpReportPath = path.join(
    os.tmpdir(),
    `uat-helper-test-${process.pid}-${Date.now()}.json`,
  );
  fs.writeFileSync(tmpReportPath, JSON.stringify(MINIMAL_REPORT));
});

afterEach(() => {
  try {
    fs.unlinkSync(tmpReportPath);
  } catch {
    // best-effort cleanup
  }
});

describe('e2e-upload-llm-report helper (Phase 32 Plan 32-04)', () => {
  it('happy path: orchestrates ingest → run-list → nightly → browser-open', async () => {
    const ghCalls = [];
    const exitCalls = [];
    const stdoutLines = [];
    const stderrLines = [];
    const sleepCalls = [];

    const ghClient = makeMockGhClient(ghCalls);

    await uploadReport({
      reportPath: tmpReportPath,
      ghClient,
      readFile: () => Buffer.from(JSON.stringify(MINIMAL_REPORT)),
      now: () => FIXED_NOW_MS,
      sleep: async (ms) => {
        sleepCalls.push(ms);
      },
      stdout: (s) => stdoutLines.push(s),
      stderr: (s) => stderrLines.push(s),
      exit: (code) => exitCalls.push(code),
    });

    // Call ORDER assertion (index-based — order matters).
    expect(ghCalls[0].op).toBe('authStatus');

    expect(ghCalls[1].op).toBe('workflowRun');
    expect(ghCalls[1].file).toBe('e2e-ingest-llm-report.yml');
    expect(ghCalls[1].inputs).toEqual({});
    expect(typeof ghCalls[1].opts?.stdinPayload).toBe('string');
    expect(ghCalls[1].opts.stdinPayload.length).toBeGreaterThan(0);

    // Sleep MUST be invoked between Stage 1 and run-list query (settle delay).
    expect(sleepCalls.length).toBe(1);
    expect(sleepCalls[0]).toBeGreaterThanOrEqual(2000);

    expect(ghCalls[2].op).toBe('runList');
    expect(ghCalls[2].file).toBe('e2e-ingest-llm-report.yml');
    // WR-03 (Phase 32 review): limit raised from 5 to 20 so concurrent
    // operators cannot push the helper's own run out of the window
    // (the real client additionally passes `--user @me`).
    expect(ghCalls[2].limit).toBe(20);

    expect(ghCalls[3].op).toBe('workflowRun');
    expect(ghCalls[3].file).toBe('e2e-nightly.yml');
    expect(ghCalls[3].inputs).toEqual({ llm_run_id: '999' });

    expect(ghCalls[4].op).toBe('repoView');

    expect(ghCalls[5].op).toBe('runView');
    expect(ghCalls[5].id).toBe('999');
    expect(ghCalls[5].opts).toEqual({ web: true });

    // No exit() should be called on the happy path.
    expect(exitCalls).toEqual([]);

    // stdout should include the constructed ingest run URL.
    const allStdout = stdoutLines.join('');
    expect(allStdout).toContain(
      'https://github.com/owner/repo/actions/runs/999',
    );
  });

  it('race-mitigation filter rejects stale entries (createdAt before trigger)', async () => {
    const ghCalls = [];
    const exitCalls = [];

    const staleEntry = {
      databaseId: 100,
      createdAt: new Date(FIXED_NOW_MS - 5000).toISOString(), // 5s before trigger
    };
    const realEntry = {
      databaseId: 999,
      createdAt: new Date(FIXED_NOW_MS + 1000).toISOString(), // 1s after trigger
    };

    const ghClient = makeMockGhClient(ghCalls, {
      runList: (file, limit) => {
        ghCalls.push({ op: 'runList', file, limit });
        return [staleEntry, realEntry]; // intentionally NOT pre-sorted
      },
    });

    await uploadReport({
      reportPath: tmpReportPath,
      ghClient,
      readFile: () => Buffer.from(JSON.stringify(MINIMAL_REPORT)),
      now: () => FIXED_NOW_MS,
      sleep: async () => {},
      stdout: () => {},
      stderr: () => {},
      exit: (code) => exitCalls.push(code),
    });

    // Find the nightly workflowRun call — its llm_run_id MUST be the
    // POST-trigger entry's databaseId (999), NOT the stale one (100).
    const nightlyCall = ghCalls.find(
      (c) => c.op === 'workflowRun' && c.file === 'e2e-nightly.yml',
    );
    expect(nightlyCall).toBeTruthy();
    expect(nightlyCall.inputs.llm_run_id).toBe('999');
    expect(nightlyCall.inputs.llm_run_id).not.toBe('100');

    // No error exit.
    expect(exitCalls).toEqual([]);
  });

  it('oversized payload (>60KB base64) exits with code 2 BEFORE any gh workflow call', async () => {
    const ghCalls = [];
    const exitCalls = [];
    const stderrLines = [];

    const ghClient = makeMockGhClient(ghCalls);

    // 50KB of raw bytes → ~67KB base64 (4/3 expansion), comfortably over
    // MAX_BASE64_BYTES (61440 = 60 * 1024).
    const oversizedBuf = Buffer.alloc(50_000, 'x');
    // Sanity check the test fixture itself — if MAX_BASE64_BYTES changes in
    // the future, this guards against a silently-passing test.
    expect(Buffer.from(oversizedBuf).toString('base64').length).toBeGreaterThan(
      MAX_BASE64_BYTES,
    );

    await uploadReport({
      reportPath: tmpReportPath,
      ghClient,
      readFile: () => oversizedBuf,
      now: () => FIXED_NOW_MS,
      sleep: async () => {},
      stdout: () => {},
      stderr: (s) => stderrLines.push(s),
      exit: (code) => exitCalls.push(code),
    });

    expect(exitCalls).toEqual([2]);

    // No workflowRun (or any subsequent gh call) should have fired. Only
    // authStatus (which runs before the size guard) may appear.
    expect(ghCalls.filter((c) => c.op === 'workflowRun').length).toBe(0);
    expect(ghCalls.filter((c) => c.op === 'runList').length).toBe(0);
    expect(ghCalls.filter((c) => c.op === 'runView').length).toBe(0);
    expect(ghCalls.filter((c) => c.op === 'repoView').length).toBe(0);

    // stderr should mention at least one of the relevant size constants for
    // grep-friendliness.
    const allStderr = stderrLines.join('');
    const mentionsSize =
      allStderr.includes('60') ||
      allStderr.includes('61440') ||
      allStderr.includes('65535');
    expect(mentionsSize).toBe(true);
  });

  it('gh auth status failure exits with code 7 BEFORE any other gh call', async () => {
    const ghCalls = [];
    const exitCalls = [];
    const stderrLines = [];

    const ghClient = makeMockGhClient(ghCalls, {
      authStatus: () => {
        ghCalls.push({ op: 'authStatus' });
        throw new Error('not authenticated');
      },
    });

    await uploadReport({
      reportPath: tmpReportPath,
      ghClient,
      readFile: () => Buffer.from(JSON.stringify(MINIMAL_REPORT)),
      now: () => FIXED_NOW_MS,
      sleep: async () => {},
      stdout: () => {},
      stderr: (s) => stderrLines.push(s),
      exit: (code) => exitCalls.push(code),
    });

    expect(exitCalls).toEqual([7]);

    // ONLY authStatus should appear. No subsequent gh calls.
    expect(ghCalls.filter((c) => c.op !== 'authStatus').length).toBe(0);

    // stderr should guide the user to `gh auth login`.
    const allStderr = stderrLines.join('');
    expect(allStderr).toContain('gh auth login');
  });
});

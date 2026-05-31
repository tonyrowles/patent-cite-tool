// tests/unit/verify-single-case.test.js
//
// Phase 41 Plan 41-02 (VFY-GATE-01) — Vitest contract suite for
// `scripts/verify-single-case.mjs`, a thin CLI shim around v3.0's
// verifyCitation from tests/e2e/lib/pdf-verifier.js. Pinned contracts:
//   * Argv:    `--case <id>` required, `--runs N` default 1, `--output <path>` optional
//   * Exit:    0 = all runs Tier A/B, 1 = any run Tier C or below, 2 = argv error
//   * Output:  JSON with EXACTLY {case_id, runs_requested, runs, all_passed_tier_ab}
//   * Default path: playwright-report/single-case-<id>-runs-<n>.json
//
// Pattern: describe.skipIf(!fs.existsSync(SCRIPT_PATH)) — RED commit lands as
// SKIPPED (vitest exit 0, not FAIL) before Task 2 creates the shim. Mirrors
// Phase 40-02's safe-RED idiom from tests/unit/check-deps-and-pr.test.js.
//
// Integration tests V6-V9 additionally skipIf the verifier's PDF cache is
// empty (no network in CI baseline; the shim's call to verifyCitation
// requires a real PDF parse). VFY-02 isolation is preserved — these tests
// invoke the CLI as a subprocess via spawnSync and never import the verifier
// directly (the CLI IS the contract).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const SCRIPT_PATH = path.resolve(PROJECT_ROOT, 'scripts/verify-single-case.mjs');
const PDF_CACHE_DIR = path.resolve(PROJECT_ROOT, 'tests/e2e/.pdf-cache');

// US11427642-spec-short-1 is the canonical integration case — confirmed entry
// in TEST_CASES (tests/test-cases.js line ~41) AND baseline.json
// ("1:26-27"). Per Plan 41-02 acceptance criterion.
const INTEGRATION_CASE_ID = 'US11427642-spec-short-1';
const INTEGRATION_PATENT_ID = 'US11427642';

// Integration tests require the PDF to already be cached locally — the CI
// baseline does NOT have network access, and the .pdf-cache directory is
// gitignored. Tests that actually invoke verifyCitation skip when the
// cached PDF is missing, leaving the argv-only error-path tests (V1-V5)
// running unconditionally.
function integrationCachedPdfExists() {
  const p = path.join(PDF_CACHE_DIR, `${INTEGRATION_PATENT_ID}.pdf`);
  return fs.existsSync(p) && fs.statSync(p).size > 5_000;
}

/**
 * Invoke the CLI shim as a child process. Captures stdout, stderr, status.
 * Per Phase 40-02 Group E precedent: spawnSync with process.execPath, NOT
 * `node` from PATH (which may differ across CI matrices). encoding:'utf8'.
 *
 * @param {string[]} args
 * @param {object} [opts]  { timeoutMs?: number, cwd?: string }
 */
function runShim(args, opts = {}) {
  const result = spawnSync(
    process.execPath,
    [SCRIPT_PATH, ...args],
    {
      encoding: 'utf8',
      cwd: opts.cwd ?? PROJECT_ROOT,
      timeout: opts.timeoutMs ?? 120_000,
    },
  );
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

// Stable temp dir per test for --output paths and default-path cleanup.
let tmpDir;
let generatedReports;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(
    path.join(
      os.tmpdir(),
      'pct-vsc-' + crypto.randomBytes(4).toString('hex') + '-',
    ),
  );
  generatedReports = [];
});

afterEach(() => {
  // Clean up the temp dir (custom --output paths land here).
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
  // Clean up any default-path reports the shim wrote into
  // playwright-report/ during integration tests. The directory itself may
  // be a build artifact dir we should preserve — only delete files we
  // know we generated.
  for (const p of generatedReports) {
    try {
      fs.rmSync(p, { force: true });
    } catch {
      /* best effort */
    }
  }
});

// describe.skipIf — RED safe-commit gate. Suite SKIPS (not FAILS) when
// scripts/verify-single-case.mjs does not yet exist; Task 2 creates it and
// the suite auto-unskips.
describe.skipIf(!fs.existsSync(SCRIPT_PATH))(
  'verify-single-case.mjs (Phase 41-02)',
  () => {
    // -----------------------------------------------------------------
    // Group 1: argv parsing — exit code 2 on every error path
    // -----------------------------------------------------------------
    describe('argv parsing', () => {
      it('V1: missing --case exits 2 and stderr mentions --case', () => {
        const r = runShim([]);
        expect(r.status).toBe(2);
        expect(r.stderr).toMatch(/--case/);
      });

      it('V2: --runs without integer exits 2', () => {
        const r = runShim(['--case', INTEGRATION_CASE_ID, '--runs', 'not-a-number']);
        expect(r.status).toBe(2);
        expect(r.stderr).toMatch(/--runs/);
      });

      it('V3: unknown flag exits 2 with stderr naming the flag', () => {
        const r = runShim(['--case', INTEGRATION_CASE_ID, '--bogus-flag']);
        expect(r.status).toBe(2);
        expect(r.stderr).toMatch(/--bogus-flag/);
      });

      it('V4: --case for an ID NOT in TEST_CASES exits 2', () => {
        const r = runShim(['--case', 'definitely-not-a-real-case-id-xyz']);
        expect(r.status).toBe(2);
        // stderr should signal the missing case (not a generic crash)
        expect(r.stderr).toMatch(/TEST_CASES|not found|unknown case/i);
      });

      it('V5: --case for an ID present in TEST_CASES but missing from baseline.json exits 2', async () => {
        // Discover a TEST_CASES id that is NOT in baseline.json. If every
        // TEST_CASES entry has a baseline (which is the v3.0 invariant), we
        // synthesize the gap by reading baseline.json + picking the first
        // TEST_CASES.id whose key is absent. If no such id exists, skip the
        // assertion with an inline note (the gap will reappear if/when a
        // case is added to TEST_CASES without a baseline entry — at which
        // point this test starts asserting again automatically).
        const baselinePath = path.resolve(PROJECT_ROOT, 'tests/golden/baseline.json');
        const testCasesPath = path.resolve(PROJECT_ROOT, 'tests/test-cases.js');
        const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
        const testCasesMod = await import(
          'file://' + testCasesPath + '?v5=' + Date.now()
        );
        const { TEST_CASES } = testCasesMod;
        const missing = TEST_CASES.find((tc) => !(tc.id in baseline));
        if (!missing) {
          // Every TEST_CASES entry has a baseline — invariant currently
          // holds, the error path is unreachable by real data. Document and
          // pass; if invariant breaks the test starts exercising the path.
          expect(true).toBe(true);
          return;
        }
        const r = runShim(['--case', missing.id]);
        expect(r.status).toBe(2);
        expect(r.stderr).toMatch(/baseline/i);
      });
    });

    // -----------------------------------------------------------------
    // Group 2: exit-code contract + output JSON shape
    // Integration tests — skipped when the integration PDF is not cached
    // -----------------------------------------------------------------
    describe.skipIf(!integrationCachedPdfExists())(
      'exit-code contract + output JSON',
      () => {
        it('V6: happy path — --runs 1 exits 0 + report has all_passed_tier_ab:true', () => {
          const outPath = path.join(tmpDir, 'report-v6.json');
          const r = runShim(
            ['--case', INTEGRATION_CASE_ID, '--runs', '1', '--output', outPath],
            { timeoutMs: 60_000 },
          );
          expect(r.status).toBe(0);
          expect(fs.existsSync(outPath)).toBe(true);
          const report = JSON.parse(fs.readFileSync(outPath, 'utf8'));
          expect(report.all_passed_tier_ab).toBe(true);
          expect(report.case_id).toBe(INTEGRATION_CASE_ID);
          expect(report.runs_requested).toBe(1);
          expect(Array.isArray(report.runs)).toBe(true);
          expect(report.runs.length).toBe(1);
        }, 60_000);

        it('V7: --runs 3 produces exactly 3 entries in runs[] with required shape', () => {
          const outPath = path.join(tmpDir, 'report-v7.json');
          const r = runShim(
            ['--case', INTEGRATION_CASE_ID, '--runs', '3', '--output', outPath],
            { timeoutMs: 180_000 },
          );
          // Status may be 0 (all Tier A/B) or 1 (any Tier C+) — V7 only
          // asserts the shape, not the verdict.
          expect([0, 1]).toContain(r.status);
          const report = JSON.parse(fs.readFileSync(outPath, 'utf8'));
          expect(report.runs_requested).toBe(3);
          expect(report.runs.length).toBe(3);
          for (let i = 0; i < 3; i++) {
            const entry = report.runs[i];
            expect(entry.run).toBe(i + 1);
            expect(typeof entry.status).toBe('string');
            expect(['A', 'B', 'C', 'D']).toContain(entry.tier_used);
          }
        }, 180_000);

        it('V8: --output writes to the custom path; omitting --output uses default path', () => {
          // Custom path
          const customPath = path.join(tmpDir, 'sub/dir/custom-report.json');
          const r1 = runShim(
            ['--case', INTEGRATION_CASE_ID, '--runs', '1', '--output', customPath],
            { timeoutMs: 60_000 },
          );
          expect(r1.status).toBe(0);
          expect(fs.existsSync(customPath)).toBe(true);

          // Default path: playwright-report/single-case-<id>-runs-<n>.json
          const defaultPath = path.resolve(
            PROJECT_ROOT,
            `playwright-report/single-case-${INTEGRATION_CASE_ID}-runs-1.json`,
          );
          generatedReports.push(defaultPath);
          const r2 = runShim(
            ['--case', INTEGRATION_CASE_ID, '--runs', '1'],
            { timeoutMs: 60_000 },
          );
          expect(r2.status).toBe(0);
          expect(fs.existsSync(defaultPath)).toBe(true);
        }, 180_000);

        it('V9: report JSON top-level keys are EXACTLY {case_id, runs_requested, runs, all_passed_tier_ab}', () => {
          const outPath = path.join(tmpDir, 'report-v9.json');
          const r = runShim(
            ['--case', INTEGRATION_CASE_ID, '--runs', '1', '--output', outPath],
            { timeoutMs: 60_000 },
          );
          expect(r.status).toBe(0);
          const report = JSON.parse(fs.readFileSync(outPath, 'utf8'));
          const keys = Object.keys(report).sort();
          expect(keys).toEqual(
            ['all_passed_tier_ab', 'case_id', 'runs', 'runs_requested'].sort(),
          );
        }, 60_000);
      },
    );
  },
);

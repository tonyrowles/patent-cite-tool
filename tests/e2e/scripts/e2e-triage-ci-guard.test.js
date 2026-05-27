// tests/e2e/scripts/e2e-triage-ci-guard.test.js
//
// Phase 34 (TRIAGE-04 — D-08) — integration test for the CI guard at the top
// of scripts/e2e-triage-classifier.mjs. Mirrors the Phase 31 e2e-explore-
// ci-guard.test.js pattern verbatim. Three-layer CI defense — layer 2
// (script level). Layer 1 is invokeClaudePWithLedger (Plan 34-01). Layer 3
// is the ESLint per-file block (Plan 34-05).
//
// Coverage:
//   1. CI=true → exit 1 + stderr contains 'triage classifier is local-only'
//   2. GITHUB_ACTIONS=true → same behavior (defense-in-depth)
//   3. CI='' (empty) → CI guard does NOT fire; script proceeds past guard
//      (may exit for other reasons — input missing, etc.); assert the gate
//      stderr message is NOT present (WR-07 stderr-absence pattern)

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = path.resolve(__dirname, '../../../scripts/e2e-triage-classifier.mjs');

describe('scripts/e2e-triage-classifier.mjs — Phase 34 (TRIAGE-04 / D-08) CI guard', () => {
  it('Test 1: CI=true → exits 1 with "triage classifier is local-only" in stderr', () => {
    const r = spawnSync('node', [SCRIPT_PATH, '--input', '/tmp/whatever.json'], {
      env: { CI: 'true', PATH: process.env.PATH },
      encoding: 'utf8',
      timeout: 5000,
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/triage classifier is local-only/i);
  });

  it('Test 2: GITHUB_ACTIONS=true (no CI var) → exits 1 with same stderr (defense-in-depth)', () => {
    const r = spawnSync('node', [SCRIPT_PATH], {
      env: { GITHUB_ACTIONS: 'true', PATH: process.env.PATH },
      encoding: 'utf8',
      timeout: 5000,
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/triage classifier is local-only/i);
  });

  it('Test 3: CI explicitly empty (local-dev simulation) → CI guard does NOT fire', () => {
    // We cannot reliably proceed past input resolution in this test, but we
    // CAN assert the CI guard did not block. The script may exit for other
    // reasons (input missing, etc.) — that's acceptable; the assertion is that
    // the CI-guard stderr line is NOT present (WR-07 stderr-absence pattern).
    const r = spawnSync('node', [SCRIPT_PATH, '--input', '/tmp/nonexistent-llm-report.json'], {
      env: { ...process.env, CI: '', GITHUB_ACTIONS: '' },
      encoding: 'utf8',
      timeout: 3000,
    });
    // If the spawn timed out, status is null — that's a PASS (the script
    // proceeded past the guard; it's blocked on something downstream).
    if (r.status !== null) {
      // Whatever the exit code, the CI-guard message must NOT appear.
      expect(r.stderr || '').not.toMatch(/triage classifier is local-only/i);
    }
  });
});

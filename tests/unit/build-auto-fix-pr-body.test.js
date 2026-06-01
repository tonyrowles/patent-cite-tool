// tests/unit/build-auto-fix-pr-body.test.js
//
// Phase 43 Plan 43-01 (Task 1 RED gate).
//
// Vitest contract for scripts/build-auto-fix-pr-body.mjs — a pure-function
// helper that constructs the auto-fix PR body. The FIRST line of the produced
// body is the load-bearing HTML comment Phase 41 verifier-gate consumes:
//
//   <!-- affected_cases: id1,id2 --> (regex: /<!-- affected_cases: ([^\s>]+) -->/)
//
// RED-state contract (Task 1 — this commit):
//   scripts/build-auto-fix-pr-body.mjs does NOT yet exist. The import below
//   fails at module-resolution time; Vitest marks the whole suite as
//   failing-to-load. The Task 1 GREEN commit creates the helper file and all
//   6 cases flip green without modifying this test file.
//
// Cases:
//   B1 — Affected_cases comment exists on its own line, FIRST line of output.
//   B2 — Multiple caseIds join with commas; verifier-gate regex captures CSV.
//   B3 — Missing/empty caseIds falls back to literal 'unknown'.
//   B4 — Body includes all required metadata fields named in the issue title.
//   B5 — Output is a pure string with no env-var / clock / random interpolation.
//   B6 — CLI shim writes the same output to stdout that the function returns.

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildAutoFixPrBody } from '../../scripts/build-auto-fix-pr-body.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const HELPER_PATH = path.resolve(PROJECT_ROOT, 'scripts/build-auto-fix-pr-body.mjs');

describe('buildAutoFixPrBody (Phase 43)', () => {

  it('B1 — affected_cases comment exists on its own first line', () => {
    const out = buildAutoFixPrBody({
      issue: 42,
      branch: 'auto-fix/42-deadbeef',
      errorClass: 'WRONG_CITATION',
      caseIds: ['US11427642-spec-short-1'],
    });
    expect(out.split('\n')[0]).toBe('<!-- affected_cases: US11427642-spec-short-1 -->');
  });

  it('B2 — multiple caseIds join with commas (no whitespace inside CSV); verifier-gate regex captures the CSV', () => {
    const out = buildAutoFixPrBody({
      issue: 42,
      branch: 'auto-fix/42-deadbeef',
      errorClass: 'WRONG_CITATION',
      caseIds: ['a', 'b', 'c'],
    });
    expect(out.split('\n')[0]).toBe('<!-- affected_cases: a,b,c -->');
    // The regex Phase 41 verifier-gate uses (per scripts/parse-affected-cases.mjs)
    const m = out.match(/<!-- affected_cases: ([^\s>]+) -->/);
    expect(m).not.toBeNull();
    expect(m[1]).toBe('a,b,c');
  });

  it("B3 — missing/empty caseIds falls back to literal 'unknown'", () => {
    const outOmitted = buildAutoFixPrBody({
      issue: 42,
      branch: 'auto-fix/42-deadbeef',
      errorClass: 'WRONG_CITATION',
    });
    const outEmpty = buildAutoFixPrBody({
      issue: 42,
      branch: 'auto-fix/42-deadbeef',
      errorClass: 'WRONG_CITATION',
      caseIds: [],
    });
    expect(outOmitted.split('\n')[0]).toBe('<!-- affected_cases: unknown -->');
    expect(outEmpty.split('\n')[0]).toBe('<!-- affected_cases: unknown -->');
  });

  it('B4 — body includes all required metadata fields named in the issue title', () => {
    const out = buildAutoFixPrBody({
      issue: 99,
      branch: 'auto-fix/99-cafebabecafe',
      errorClass: 'WRONG_CITATION',
      caseIds: ['x'],
      fingerprint: 'cafebabecafe',
      fixAttempts: 2,
      model: 'claude-sonnet-4-6',
    });
    expect(out).toContain('#99');
    expect(out).toContain('`auto-fix/99-cafebabecafe`');
    expect(out).toContain('WRONG_CITATION');
    expect(out).toContain('cafebabecafe');
    expect(out).toContain('2');
    expect(out).toContain('claude-sonnet-4-6');
  });

  it('B5 — output is a pure string: byte-identical for identical args (no Date/env/random)', () => {
    const args = {
      issue: 42,
      branch: 'auto-fix/42-deadbeef',
      errorClass: 'WRONG_CITATION',
      caseIds: ['x', 'y'],
      fingerprint: 'deadbeef0000',
      fixAttempts: 1,
      model: 'claude-sonnet-4-6',
    };
    const a = buildAutoFixPrBody(args);
    const b = buildAutoFixPrBody(args);
    expect(a).toBe(b);
    expect(typeof a).toBe('string');
  });

  it('B6 — CLI shim stdout equals buildAutoFixPrBody return for the same args', () => {
    const args = {
      issue: 42,
      branch: 'auto-fix/42-d',
      errorClass: 'WRONG_CITATION',
      caseIds: ['US11427642-spec-short-1'],
    };
    const expected = buildAutoFixPrBody(args);
    const stdout = execFileSync(
      'node',
      [
        HELPER_PATH,
        '--issue', String(args.issue),
        '--branch', args.branch,
        '--error-class', args.errorClass,
        '--case-ids', args.caseIds.join(','),
      ],
      { encoding: 'utf8' },
    );
    expect(stdout).toBe(expected);
  });

  // ---------------------------------------------------------------------------
  // B7 — Phase 44 Plan 44-01 extension: <!-- source_issue: N --> on line 2.
  // The new HTML comment must appear on line index 1, between the
  // affected_cases comment on line index 0 and the existing blank-line
  // separator on line index 2. Phase 44's v40-auto-promote.yml parse step
  // greps the body for /<!--\s*source_issue:\s*(\d+)\s*-->/ to recover the
  // source-issue id without a separate CLI argument or env-var dance. The
  // line-position contract is load-bearing — moving the comment elsewhere
  // would silently break the parse step.
  // ---------------------------------------------------------------------------

  it('B7 — <!-- source_issue: N --> appears on line 2 (Phase 44 extension)', () => {
    const out = buildAutoFixPrBody({
      issue: 42,
      branch: 'auto-fix/42-deadbeef',
      errorClass: 'WRONG_CITATION',
      caseIds: ['x'],
    });
    const lines = out.split('\n');
    // line index 0 — preserve B1 invariant: affected_cases comment is FIRST.
    expect(lines[0]).toBe('<!-- affected_cases: x -->');
    // line index 1 — NEW: source_issue comment for v40-auto-promote.yml parse.
    expect(lines[1]).toBe('<!-- source_issue: 42 -->');
    // line index 2 — preserve blank-line separator before the prose heading.
    expect(lines[2]).toBe('');
  });

});

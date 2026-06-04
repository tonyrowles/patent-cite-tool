// tests/unit/auto-fix-promote-gate.test.js
//
// Phase 44 Plan 44-01 (Task 2 RED gate).
//
// Vitest contract for scripts/auto-fix-promote.mjs — the CLI shim that
// closes the v4.0 merge → quarantine→golden promotion loop. The script
// fronts the already-existing runPromote({_skipCiGuard:true}) from Phase 35
// with a TRIPLE-GATE assertion that reconstructs the human-gate invariant
// the _skipCiGuard exemption would otherwise undo:
//
//   Leg 1 — PR carries auto-fix:verified  (added by Phase 41 verifier-gate
//           after 3x consecutive case verification + 76-case regression pass)
//   Leg 2 — github.event.pull_request.merged === true  (the GitHub close
//           webhook fires for close-without-merge too; this leg pins the
//           difference)
//   Leg 3 — source-issue carries triage  (Phase 34 triage classifier applies
//           triage only after rerun-validator confirms the failure; this leg
//           prevents hand-crafted issues from bypassing the verification
//           pipeline)
//
// Source-issue identification follows a belt-and-suspenders pattern:
//   - PREFERRED: <!-- source_issue: N --> HTML comment in the PR body
//                (emitted by the Phase 43 helper extended in Task 1)
//   - FALLBACK : Fix #N / Fixes #N pattern in the squash-merge commit message
//
// RED-state contract (Task 2 — this commit):
//   scripts/auto-fix-promote.mjs does NOT yet exist. The import below fails
//   at module-resolution time; Vitest marks the whole suite as failing to
//   load. Task 2 GREEN creates the script and all 8 cases flip green
//   without modifying this test file.
//
// Cases:
//   T1 — assertTripleGate throws when prLabels missing 'auto-fix:verified'
//   T2 — assertTripleGate throws when merged !== true
//   T3 — assertTripleGate throws when sourceIssueLabels missing 'triage'
//   T4 — assertTripleGate happy path: all three legs satisfied, returns void
//   M1 — parseSourceIssue extracts integer from <!-- source_issue: N --> in body
//   M2 — parseSourceIssue falls back to Fix #N in commit message
//   M3 — parseSourceIssue also accepts Fixes #N plural
//   M4 — parseSourceIssue throws when neither body nor commit-msg yields an id

import { describe, it, expect } from 'vitest';

import {
  assertTripleGate,
  assertPartialGate,
  runPartialPromote,
  parseSourceIssue,
  parseArgv,
  PARTIAL_THRESHOLD,
  PARTIAL_LABEL,
} from '../../scripts/auto-fix-promote.mjs';

describe('assertTripleGate (Phase 44)', () => {

  it("T1 — rejects when 'auto-fix:verified' label missing", () => {
    expect(() => assertTripleGate({
      prLabels: ['triage'],          // no auto-fix:verified
      merged: true,
      sourceIssueLabels: ['triage'],
    })).toThrow(/TRIPLE_GATE_FAILED: prLabels — missing 'auto-fix:verified'/);
  });

  it('T2 — rejects when merged !== true (PR closed unmerged)', () => {
    expect(() => assertTripleGate({
      prLabels: ['auto-fix:verified'],
      merged: false,
      sourceIssueLabels: ['triage'],
    })).toThrow(/TRIPLE_GATE_FAILED: merged — pull request not merged/);
  });

  it("T3 — rejects when source-issue lacks 'triage' label", () => {
    expect(() => assertTripleGate({
      prLabels: ['auto-fix:verified'],
      merged: true,
      sourceIssueLabels: ['bug'],    // no triage
    })).toThrow(/TRIPLE_GATE_FAILED: sourceIssueLabels — source issue missing 'triage'/);
  });

  it('T4 — happy path: returns void when all three legs satisfied', () => {
    expect(() => assertTripleGate({
      prLabels: ['auto-fix:verified', 'WRONG_CITATION'],
      merged: true,
      sourceIssueLabels: ['triage', 'WRONG_CITATION'],
    })).not.toThrow();
  });

  // Phase 53 PARTIAL-04 (D-18): trust-invariant boundary pin. Ships in the
  // SAME COMMIT as PARTIAL_LABEL, assertPartialGate, and runPartialPromote.
  // The presence of 'auto-fix:partial-verified' does NOT satisfy Leg 1 of
  // assertTripleGate — assertTripleGate continues to require the verbatim
  // 'auto-fix:verified' string. This pin prevents a future commit from
  // silently widening assertTripleGate to accept the partial label (which
  // would erode the Phase 35 _skipCiGuard:true trust boundary).
  it("T5 — PARTIAL-04: throws when given auto-fix:partial-verified instead of auto-fix:verified (trust invariant boundary)", () => {
    expect(() => assertTripleGate({
      prLabels: ['auto-fix:partial-verified'],
      merged: true,
      sourceIssueLabels: ['triage'],
    })).toThrow(/TRIPLE_GATE_FAILED: prLabels — missing 'auto-fix:verified'/);
  });

  // PARTIAL-04 co-presence: a PR carrying BOTH labels (a documented edge
  // case where verifier-gate evolved emits both — not currently the case
  // but architecturally possible) still satisfies assertTripleGate because
  // the 'auto-fix:verified' string is present. The partial path is a NEW
  // capability, NOT a replacement.
  it('T6 — PARTIAL-04 co-presence: still accepts when both verified AND partial-verified present', () => {
    expect(() => assertTripleGate({
      prLabels: ['auto-fix:verified', PARTIAL_LABEL],
      merged: true,
      sourceIssueLabels: ['triage'],
    })).not.toThrow();
  });

});

// ---------------------------------------------------------------------------
// Phase 53 PARTIAL-01 (D-01..D-04, D-17): assertPartialGate behavior.
// SEPARATE entry point — does NOT widen assertTripleGate. Mirrors the
// 3-leg shape but keys off 'auto-fix:partial-verified' and adds a
// passingCases validation amendment (D-04).
// ---------------------------------------------------------------------------
describe('assertPartialGate (Phase 53)', () => {

  it('P1 — happy path: returns { passingCaseIds } when all 3 legs + non-empty passingCases satisfied', () => {
    const result = assertPartialGate({
      prLabels: ['auto-fix:partial-verified'],
      merged: true,
      sourceIssueLabels: ['triage'],
      passingCases: ['US11427642-spec-short-1'],
    });
    expect(result).toEqual({ passingCaseIds: ['US11427642-spec-short-1'] });
  });

  it("P2 — Leg 1 fail: throws when prLabels missing 'auto-fix:partial-verified'", () => {
    expect(() => assertPartialGate({
      prLabels: ['triage'],
      merged: true,
      sourceIssueLabels: ['triage'],
      passingCases: ['c1'],
    })).toThrow(/PARTIAL_GATE_FAILED: prLabels — missing 'auto-fix:partial-verified'/);
  });

  it('P3 — Leg 2 fail: throws when merged !== true', () => {
    expect(() => assertPartialGate({
      prLabels: ['auto-fix:partial-verified'],
      merged: false,
      sourceIssueLabels: ['triage'],
      passingCases: ['c1'],
    })).toThrow(/PARTIAL_GATE_FAILED: merged — pull request not merged/);
  });

  it("P4 — Leg 3 fail: throws when sourceIssueLabels missing 'triage'", () => {
    expect(() => assertPartialGate({
      prLabels: ['auto-fix:partial-verified'],
      merged: true,
      sourceIssueLabels: ['bug'],
      passingCases: ['c1'],
    })).toThrow(/PARTIAL_GATE_FAILED: sourceIssueLabels — source issue missing 'triage'/);
  });

  it('P5 — empty passingCases: throws (T-53-05 silent-no-op mitigation)', () => {
    expect(() => assertPartialGate({
      prLabels: ['auto-fix:partial-verified'],
      merged: true,
      sourceIssueLabels: ['triage'],
      passingCases: [],
    })).toThrow(/PARTIAL_GATE_FAILED: passingCases — empty \(no cases to promote\)/);
  });

  it('P6 — omitted passingCases: throws same empty error (default-arg behavior)', () => {
    expect(() => assertPartialGate({
      prLabels: ['auto-fix:partial-verified'],
      merged: true,
      sourceIssueLabels: ['triage'],
    })).toThrow(/PARTIAL_GATE_FAILED: passingCases — empty \(no cases to promote\)/);
  });

  it('P7 — non-string passingCases entry: throws (argv-tampering defense)', () => {
    expect(() => assertPartialGate({
      prLabels: ['auto-fix:partial-verified'],
      merged: true,
      sourceIssueLabels: ['triage'],
      passingCases: ['c1', 42],
    })).toThrow(/PARTIAL_GATE_FAILED: passingCases — non-string entry/);
  });

  it('P8 — return is a DEFENSIVE COPY: mutating the returned passingCaseIds does not affect a second call', () => {
    const r1 = assertPartialGate({
      prLabels: ['auto-fix:partial-verified'],
      merged: true,
      sourceIssueLabels: ['triage'],
      passingCases: ['c1', 'c2'],
    });
    r1.passingCaseIds.push('TAMPER');
    const r2 = assertPartialGate({
      prLabels: ['auto-fix:partial-verified'],
      merged: true,
      sourceIssueLabels: ['triage'],
      passingCases: ['c1', 'c2'],
    });
    expect(r2.passingCaseIds).toEqual(['c1', 'c2']);
    expect(r2.passingCaseIds).not.toContain('TAMPER');
  });

});

// ---------------------------------------------------------------------------
// Phase 53 PARTIAL_THRESHOLD + PARTIAL_LABEL constant pins (D-11, D-18).
// Changing these constants in a future commit must be a deliberate
// test-update, not a silent drift. PARTIAL_THRESHOLD = 0.80 is the single
// source of truth referenced numerically by v40-verifier-gate.yml's
// partial-label step. PARTIAL_LABEL = 'auto-fix:partial-verified' is
// load-bearing across script + 2 workflows.
// ---------------------------------------------------------------------------
describe('PARTIAL_THRESHOLD constant (Phase 53)', () => {

  it('T_thresh_1 — PARTIAL_THRESHOLD is 0.80 (single source of truth for ≥4/5 ratio)', () => {
    expect(PARTIAL_THRESHOLD).toBe(0.80);
  });

  it("T_thresh_2 — PARTIAL_LABEL is 'auto-fix:partial-verified' (load-bearing across script + 2 workflows)", () => {
    expect(PARTIAL_LABEL).toBe('auto-fix:partial-verified');
  });

});

// ---------------------------------------------------------------------------
// Phase 53 runPartialPromote (D-06..D-08, D-19) basic shape pins. The full
// integration (Task 3) wires this into main()'s label branch; here we pin
// the direct-call surface for Vitest mockability + the dryRun escape hatch.
// ---------------------------------------------------------------------------
describe('runPartialPromote (Phase 53)', () => {

  it('RP1 — dryRun short-circuit: returns no-op shape without invoking runPromote', async () => {
    const result = await runPartialPromote(['c1', 'c2'], { dryRun: true });
    expect(result).toEqual({
      promoted: ['c1', 'c2'],
      halted: false,
      dryRun: true,
    });
  });

  it('RP2 — empty passingCaseIds throws (defense-in-depth re-validation)', async () => {
    await expect(runPartialPromote([])).rejects.toThrow(
      /PARTIAL_GATE_FAILED: passingCases — empty \(no cases to promote\)/,
    );
  });

  it('RP3 — non-array passingCaseIds throws (defense-in-depth re-validation)', async () => {
    await expect(runPartialPromote(null)).rejects.toThrow(
      /PARTIAL_GATE_FAILED: passingCases — empty \(no cases to promote\)/,
    );
  });

});

describe('parseSourceIssue (Phase 44)', () => {

  it('M1 — extracts integer from <!-- source_issue: N --> in body (preferred)', () => {
    expect(parseSourceIssue({
      body: '<!-- affected_cases: x -->\n<!-- source_issue: 42 -->\n\nText',
      commitMessage: '',
    })).toBe(42);
  });

  it('M2 — falls back to Fix #N in commit message when body has no comment', () => {
    expect(parseSourceIssue({
      body: 'no source_issue comment here',
      commitMessage: 'Fix #99: WRONG_CITATION',
    })).toBe(99);
  });

  it('M3 — also accepts Fixes #N plural in commit message', () => {
    expect(parseSourceIssue({
      body: 'no comment',
      commitMessage: 'Fixes #123 some description',
    })).toBe(123);
  });

  it('M4 — throws when neither body nor commit message yields an integer', () => {
    expect(() => parseSourceIssue({
      body: 'no source_issue comment',
      commitMessage: 'no fix marker',
    })).toThrow(/TRIPLE_GATE_FAILED: cannot identify source issue/);
  });

});

// ---------------------------------------------------------------------------
// Phase 53 PARTIAL-03 (D-16): parseArgv --passing-cases recognition.
// The flag's CSV is parsed identically to --pr-labels and --source-issue-
// labels (split on comma, trim, filter empty). The partial path consumes
// the parsed array as assertPartialGate({passingCases}); the verified path
// ignores it.
// ---------------------------------------------------------------------------
describe('parseArgv --passing-cases (Phase 53)', () => {

  const REQUIRED = [
    'node', 'scripts/auto-fix-promote.mjs',
    '--pr', '1',
    '--pr-merged', 'true',
    '--case-id', 'c1',
  ];

  it('PA1 — --passing-cases CSV decoded into an array', () => {
    const result = parseArgv([...REQUIRED, '--passing-cases', 'c1,c2,c3']);
    expect(result.passingCases).toEqual(['c1', 'c2', 'c3']);
  });

  it('PA2 — missing --passing-cases yields empty array', () => {
    const result = parseArgv([...REQUIRED]);
    expect(result.passingCases).toEqual([]);
  });

  it('PA3 — --passing-cases CSV with whitespace + trailing comma trims + filters', () => {
    const result = parseArgv([...REQUIRED, '--passing-cases', 'c1, c2 , c3,']);
    expect(result.passingCases).toEqual(['c1', 'c2', 'c3']);
  });

});

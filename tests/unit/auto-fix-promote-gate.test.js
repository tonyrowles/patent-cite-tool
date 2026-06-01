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
  parseSourceIssue,
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

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
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  assertTripleGate,
  assertPartialGate,
  runPartialPromote,
  parseSourceIssue,
  parseArgv,
  PARTIAL_THRESHOLD,
  PARTIAL_LABEL,
} from '../../scripts/auto-fix-promote.mjs';

// ---------------------------------------------------------------------------
// Phase 58 — shared helper for source-file inspection tests (PROMOTE-01,
// PROMOTE-04, _skipCiGuard count pin, outcome-write structural fallback).
// Resolves the script path once at module-load.
// ---------------------------------------------------------------------------
const __PROMOTE_SRC_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../scripts/auto-fix-promote.mjs',
);
function readPromoteSource() {
  return readFileSync(__PROMOTE_SRC_PATH, 'utf8');
}

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

  // GATE-05 / Phase 13 / Leg-3 OR widening: report-fix-candidate issues
  // (v6.1 human bug reports promoted by Phase 11 triage layer) must now
  // satisfy Leg 3 of assertTripleGate alongside the legacy triage label.
  it("T7 — Phase 13 GATE-05: accepts when sourceIssueLabels includes 'report-fix-candidate' (Leg 3 OR widening)", () => {
    expect(() => assertTripleGate({
      prLabels: ['auto-fix:verified'],
      merged: true,
      sourceIssueLabels: ['report-fix-candidate'],
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

  // Phase 58 PROMOTE-02/03 — argv extensions for the outcome ledger entry
  // shape. --fingerprint and --error-class are threaded into args; both
  // default to null when absent.
  it('PA4 — Phase 58: --fingerprint and --error-class are captured into args', () => {
    const result = parseArgv([
      ...REQUIRED,
      '--fingerprint', 'abc123def456',
      '--error-class', 'WRONG_CITATION',
    ]);
    expect(result.fingerprint).toBe('abc123def456');
    expect(result.errorClass).toBe('WRONG_CITATION');
  });

  it('PA5 — Phase 58: missing --fingerprint and --error-class default to null', () => {
    const result = parseArgv([...REQUIRED]);
    expect(result.fingerprint).toBeNull();
    expect(result.errorClass).toBeNull();
  });

});

// ---------------------------------------------------------------------------
// Phase 58 PROMOTE-01 — IMPORTS POLICY narrowing enforcement.
//
// The policy comment block at scripts/auto-fix-promote.mjs:21-30 declares
// the ALLOWED list as exactly three patterns: node:* AND
// ./promote-from-quarantine.mjs AND ../tests/e2e/lib/llm-ledger.js.
// IP1 enforces the audit grep returns zero forbidden lines (T-58-01
// mitigation). IP2 asserts the appendLedgerEntry import is present in
// the locked verbatim shape so that any rename or path drift fails fast.
// ---------------------------------------------------------------------------
describe('IMPORTS POLICY (Phase 58 PROMOTE-01)', () => {

  it("IP1 — only allows node:*, ./promote-from-quarantine.mjs, ../tests/e2e/lib/llm-ledger.js, ../tests/e2e/lib/safe-append-ledger.js", () => {
    const source = readPromoteSource();
    const importLines = source.match(/^import .+$/gm) || [];
    // Phase 62 LEDX-02 extension: safe-append-ledger.js is whitelisted so
    // the shared leak-guard can be consumed by the two outcome-entry writes
    // at :521 (fail) and :544 (pass). Helper is a pure ESM wrapper around
    // appendLedgerEntry with NO LLM driver code; transport-boundary clean.
    const allowed = /from 'node:|from '\.\/promote-from-quarantine\.mjs'|from '\.\.\/tests\/e2e\/lib\/llm-ledger\.js'|from '\.\.\/tests\/e2e\/lib\/safe-append-ledger\.js'/;
    const forbidden = importLines.filter((line) => !allowed.test(line));
    expect(forbidden).toEqual([]);
  });

  it('IP2 — positive: the LEDGER_PATH import is present with the locked verbatim shape', () => {
    // Phase 62 WR-04 fix: narrowed from `{ appendLedgerEntry, LEDGER_PATH }`
    // to `{ LEDGER_PATH }`. The four call sites that previously imported
    // `appendLedgerEntry` directly were routed through safeAppendLedger in
    // Phase 62 LEDX-02 — the unused symbol was a misleading dead import.
    const source = readPromoteSource();
    const matches = source.match(/import \{ LEDGER_PATH \} from '\.\.\/tests\/e2e\/lib\/llm-ledger\.js'/g) || [];
    expect(matches.length).toBe(1);
    // Defensive: the removed import shape must NOT reappear.
    const removed = source.match(/import \{ appendLedgerEntry, LEDGER_PATH \}/g) || [];
    expect(removed.length).toBe(0);
  });

});

// ---------------------------------------------------------------------------
// Phase 58 PROMOTE-02/03 — main() outcome ledger writes (structural).
//
// Mock-based behavioural testing of main() proves brittle for this CLI
// shim (top-level isMain guard + module-scoped argv/process.exit; vi.mock
// of process.exit collides with the throw-sentinel-and-await pattern when
// the SUT also catches in main().catch). The structural fallback
// described in the plan's Task 1.2 (n) acceptance note is used here:
// regex-assert the source contains exactly one auto-fix-promoted entry
// (success path) AND exactly one auto-fix-failed entry (failure path)
// at the single insertion sites, with errorClass / fingerprint /
// issueId / prNumber / reason fields all present. The argv-extension
// behaviour (PA4/PA5) covers the parseArgv side of the same wiring.
// ---------------------------------------------------------------------------
describe('main() outcome ledger writes (Phase 58 PROMOTE-02/03)', () => {

  it('O1 — success path: source contains exactly one safeAppendLedger call with auto-fix-promoted + outcome:pass + errorClass + fingerprint + issueId + prNumber', () => {
    const source = readPromoteSource();
    // Phase 62 LEDX-02: the success-entry block was rewired from
    // `appendLedgerEntry(LEDGER_PATH, { ... })` to
    // `safeAppendLedger(LEDGER_PATH, { ... })`. Entry shape is BYTE-EQUIVALENT;
    // only the function-call wrapper changed. Match a single contiguous block.
    const blockRe = /safeAppendLedger\(LEDGER_PATH,\s*\{[\s\S]{0,800}?source:\s*'auto-fix-promoted'[\s\S]{0,400}?\}\)/g;
    const matches = source.match(blockRe) || [];
    expect(matches.length).toBe(1);
    const block = matches[0];
    expect(block).toMatch(/outcome:\s*'pass'/);
    expect(block).toMatch(/errorClass:\s*args\.errorClass/);
    expect(block).toMatch(/fingerprint:\s*args\.fingerprint/);
    // Phase 58 REVIEW-FIX WR-02: issueId sources from the validated
    // resolvedSourceIssue (not the raw args.sourceIssue which may be null
    // when --source-issue is omitted). Pre-fix shape would have landed
    // `issue-null` in the ledger for direct CLI callers; CI masked the
    // bug because the workflow always passes --source-issue.
    expect(block).toMatch(/issueId:\s*`issue-\$\{resolvedSourceIssue\}`/);
    expect(block).toMatch(/prNumber:\s*args\.pr/);
    expect(block).toMatch(/iso:\s*new Date\(\)\.toISOString\(\)/);
    // Phase 59 SWEEP-05 / Decision C: `phase` is now `args.phase || '58-promote'`
    // (the bare literal `phase: '58-promote'` was replaced to thread --phase
    // through for UAT runs; non-UAT runs preserve byte-equivalent shape via
    // the `|| '58-promote'` fallback chain). The O1 entry still pins the
    // '58-promote' default literal; PHASE-59-O1/O2 separately pin the args.phase
    // prefix.
    expect(block).toMatch(/phase:\s*args\.phase \|\| '58-promote'/);
    expect(block).toMatch(/transport:\s*'subscription'/);
    // model is args.model with a default fallback — must NOT be a bare literal
    expect(block).toMatch(/model:\s*args\.model/);
  });

  it('O2 — failure path: source contains exactly one safeAppendLedger call with auto-fix-failed + outcome:fail + reason runPromote exitCode', () => {
    const source = readPromoteSource();
    // Phase 62 LEDX-02: rewired from `appendLedgerEntry` to `safeAppendLedger`.
    const blockRe = /safeAppendLedger\(LEDGER_PATH,\s*\{[\s\S]{0,800}?source:\s*'auto-fix-failed'[\s\S]{0,400}?\}\)/g;
    const matches = source.match(blockRe) || [];
    expect(matches.length).toBe(1);
    const block = matches[0];
    expect(block).toMatch(/outcome:\s*'fail'/);
    expect(block).toMatch(/errorClass:\s*args\.errorClass/);
    expect(block).toMatch(/fingerprint:\s*args\.fingerprint/);
    // Phase 58 REVIEW-FIX WR-02: see O1 comment above.
    expect(block).toMatch(/issueId:\s*`issue-\$\{resolvedSourceIssue\}`/);
    expect(block).toMatch(/prNumber:\s*args\.pr/);
    expect(block).toMatch(/reason:\s*\(?`runPromote exitCode=\$\{result\.exitCode\}`/);
    expect(block).toMatch(/model:\s*args\.model/);
  });

  it('O3 — triple-gate failure paths do NOT write outcome entries: total safeAppendLedger(LEDGER_PATH, ...) count equals 2 (success + failure only for the verified path)', () => {
    // Phase 58 REVIEW-FIX WR-03 (deferred-by-design clarification):
    //
    // The exactly-2 count is intentional and applies to the VERIFIED PATH
    // ONLY. The partial path (main() lines 537-583) deliberately writes
    // ZERO outcome ledger entries on either success or failure — this is
    // a Phase 58 scope decision, NOT a bug.
    //
    // Rationale: the partial-promote capability is a Phase 53 feature
    // (assertPartialGate + runPartialPromote, _skipCiGuard:false). Phase
    // 58's scope is wiring outcome attribution for the VERIFIED auto-fix
    // path (the path that exercises _skipCiGuard:true and therefore
    // carries the human-gate trust invariant). Threading per-case outcome
    // attribution onto the partial path belongs to a follow-up phase
    // because (a) the partial path runs through normal CI semantics so
    // the safeAppendLedger leak-vector analysis differs, and (b)
    // per-case granularity on the partial branch requires plumbing
    // through runPartialPromote's per-case loop rather than the single
    // verified-branch invocation. See
    // .planning/phases/58-promote-outcome-ledger-entry/58-REVIEW-FIX.md
    // "Deferred" section for the durable design-decision record.
    //
    // Concrete a-b-winner impact: until the future partial-path phase
    // lands, partial-verified promotions are under-represented in the
    // ledger relative to verified-only promotions. This biases per-
    // (class, arm) pass-rate estimates toward verified-only outcomes
    // (which are >=5/5); partial outcomes are 4/5. The bias is bounded
    // by the partial-PR rate and is acceptable for the Phase 58 milestone.
    const source = readPromoteSource();
    // Phase 62 LEDX-02: rewired from `appendLedgerEntry` to `safeAppendLedger`.
    // Exactly-2 invariant preserved (success + failure on verified path).
    const matches = source.match(/\bsafeAppendLedger\(LEDGER_PATH,/g) || [];
    expect(matches.length).toBe(2);
  });

});

// ---------------------------------------------------------------------------
// Phase 58 PROMOTE-04 — assertTripleGate body byte-unchanged.
//
// The function body (15 lines starting at `export function
// assertTripleGate(`) is the Phase 53 trust invariant. Any drift in
// the gate logic erodes the _skipCiGuard:true exemption boundary. This
// test pins the body verbatim using a dynamic findIndex so the test
// remains valid as the function moves line-wise in the file (Phase 58
// shifted it by ~9 lines due to the IMPORTS POLICY block growth).
// On assertion failure the Vitest diff shows the exact line that drifted.
// ---------------------------------------------------------------------------
describe('assertTripleGate body byte-unchanged (Phase 58 PROMOTE-04)', () => {

  it('PROMOTE-04 — body lines match the locked Phase 58 baseline verbatim string', () => {
    const source = readPromoteSource();
    const lines = source.split(/\r?\n/);
    const startIdx = lines.findIndex((l) => l.startsWith('export function assertTripleGate'));
    expect(startIdx).not.toBe(-1);
    const body = lines.slice(startIdx, startIdx + 15).join('\n');
    const EXPECTED_BODY = [
      'export function assertTripleGate({ prLabels, merged, sourceIssueLabels } = {}) {',
      '  // Leg 1 — auto-fix:verified label on the merged PR.',
      "  if (!Array.isArray(prLabels) || !prLabels.includes('auto-fix:verified')) {",
      '    throw new Error("TRIPLE_GATE_FAILED: prLabels — missing \'auto-fix:verified\'");',
      '  }',
      '  // Leg 2 — merged === true (the GitHub close webhook also fires for',
      '  // close-without-merge; this leg is what distinguishes them).',
      '  if (merged !== true) {',
      "    throw new Error('TRIPLE_GATE_FAILED: merged — pull request not merged');",
      '  }',
      '  // Leg 3 — source-issue carries triage or report-fix-candidate.',
      "  if (!Array.isArray(sourceIssueLabels) || (!sourceIssueLabels.includes('triage') && !sourceIssueLabels.includes('report-fix-candidate'))) {",
      '    throw new Error("TRIPLE_GATE_FAILED: sourceIssueLabels — source issue missing \'triage\' or \'report-fix-candidate\'");',
      '  }',
      '}',
    ].join('\n');
    expect(body).toBe(EXPECTED_BODY);
  });

});

// ---------------------------------------------------------------------------
// Phase 58 _skipCiGuard:true non-comment count invariant.
//
// Promotes Phase 53's manual close-note check to an executable test. The
// Phase 35 _skipCiGuard:true exemption MUST appear exactly once in
// scripts/auto-fix-promote.mjs — at the verified-branch runPromote call
// inside main(). Any second non-comment occurrence widens the exemption
// boundary and erodes the trust invariant. Phase 58's outcome-entry
// insertions explicitly avoid the literal pattern in comments AND code
// to keep this count at 1.
// ---------------------------------------------------------------------------
describe('_skipCiGuard:true non-comment grep-count invariant (Phase 58 trust pin)', () => {

  it('exactly one non-comment occurrence of _skipCiGuard:\\s*true (line 434-ish only)', () => {
    const source = readPromoteSource();
    const lines = source.split(/\r?\n/);
    const codeLines = lines.filter((l) => !/^\s*\/\//.test(l));
    const hits = codeLines.filter((l) => /_skipCiGuard:\s*true/.test(l));
    expect(hits.length).toBe(1);
  });

});

// ---------------------------------------------------------------------------
// Phase 59 SWEEP-05 — --phase argv (Decision C).
//
// Mirrors the Phase 58 PA4/PA5 parseArgv-extension pattern verbatim. The
// --phase flag carries the UAT phase tag ('56-uat') onto the live ledger
// entry per REQUIREMENTS.md SWEEP-05 literal wording (Pitfall 10:
// "all UAT ledger entries carry `phase: '56-uat'` for filterable production
// analysis"). Default fallback is '58-promote' (preserves the Phase 58
// hardcoded literal byte-equivalent on non-UAT runs).
//
// PHASE-59-P1 — happy path: --phase 56-uat captured into args.phase.
// PHASE-59-P2 — absent: args.phase defaults to null; entry-write path uses
//               args.phase || '58-promote' fallback (asserted structurally).
// PHASE-59-P3 — defense: shell-injection-shaped value exits 2 with stderr
//               'malformed --phase' (T-59-11 mitigation).
// ---------------------------------------------------------------------------
describe('Phase 59 SWEEP-05 — --phase argv (Decision C)', () => {

  const REQUIRED = [
    'node', 'scripts/auto-fix-promote.mjs',
    '--pr', '99',
    '--pr-merged', 'true',
    '--case-id', 'C-001',
  ];

  it('PHASE-59-P1 — --phase 56-uat captured into args.phase', () => {
    const result = parseArgv([...REQUIRED, '--phase', '56-uat']);
    expect(result.phase).toBe('56-uat');
  });

  it('PHASE-59-P2 — missing --phase defaults to null; entry-shape fallback uses "58-promote"', () => {
    const result = parseArgv([...REQUIRED]);
    expect(result.phase).toBeNull();
    // Entry-shape default fallback structural pin: defends against silent
    // regression to a different default (empty string, undefined, etc.).
    const source = readPromoteSource();
    expect(source).toContain("phase: args.phase || '58-promote'");
  });

  it('PHASE-59-P3 — shell-injection-shaped value exits 2 with stderr "malformed --phase" (T-59-11)', () => {
    // Mirror PA4/PA5 pattern: parseArgv calls process.exit(2) on validation
    // failure; we stub process.exit to throw a sentinel so we can assert.
    const origExit = process.exit;
    const origStderrWrite = process.stderr.write.bind(process.stderr);
    let capturedStderr = '';
    process.stderr.write = (chunk) => {
      capturedStderr += String(chunk);
      return true;
    };
    process.exit = (code) => {
      throw new Error(`process.exit(${code})`);
    };
    try {
      expect(() => parseArgv([...REQUIRED, '--phase', '56 uat; echo bad']))
        .toThrow(/process\.exit\(2\)/);
      expect(capturedStderr).toContain('malformed --phase');
    } finally {
      process.exit = origExit;
      process.stderr.write = origStderrWrite;
    }
  });

});

// ---------------------------------------------------------------------------
// Phase 59 SWEEP-05 — phase entry-shape structural pins.
//
// Mirrors the Phase 58 O1/O2/O3 entry-shape structural-grep pattern. Pins
// both entry sites (PROMOTE-02 success + PROMOTE-03 failure) carry the
// `phase: args.phase || '58-promote'` fallback chain AND that NO bare
// `phase: '58-promote',` literal remains (regression guard against missing
// one of the two edits).
// ---------------------------------------------------------------------------
describe('Phase 59 SWEEP-05 — phase entry-shape structural pins', () => {

  it("PHASE-59-O1 — source contains `phase: args.phase || '58-promote'` at LEAST TWICE (PROMOTE-02 + PROMOTE-03 sites)", () => {
    const source = readPromoteSource();
    // Comment-strip: drop lines that are pure // comments before counting.
    const codeOnly = source.split(/\r?\n/)
      .filter((l) => !/^\s*\/\//.test(l))
      .join('\n');
    const matches = codeOnly.match(/phase: args\.phase \|\| '58-promote'/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it("PHASE-59-O2 — bare-literal `phase: '58-promote',` regression guard: zero matches in non-comment code", () => {
    const source = readPromoteSource();
    const codeOnly = source.split(/\r?\n/)
      .filter((l) => !/^\s*\/\//.test(l))
      .join('\n');
    const matches = codeOnly.match(/phase: '58-promote',/g) || [];
    expect(matches.length).toBe(0);
  });

});

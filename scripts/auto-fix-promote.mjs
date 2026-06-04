// scripts/auto-fix-promote.mjs
//
// Phase 44 Plan 44-01 (PROMOTE-01..04). CLI shim that closes the
// merge → quarantine→golden promotion loop. Invoked by
// .github/workflows/v40-auto-promote.yml AFTER an auto-fix PR carrying the
// auto-fix:verified label merges to main. The script asserts a TRIPLE-GATE
// BEFORE calling the already-existing runPromote({_skipCiGuard:true}) from
// Phase 35 (scripts/promote-from-quarantine.mjs line 123 — DO NOT MODIFY).
//
// The triple-gate reconstructs the human-gate invariant the _skipCiGuard
// exemption would otherwise undo:
//   Leg 1 — PR carries auto-fix:verified  (Phase 41 verifier-gate label)
//   Leg 2 — pull_request.merged === true  (NOT close-without-merge)
//   Leg 3 — source-issue carries triage   (Phase 34 triage-classifier label)
//
// Source-issue id is recovered via a belt-and-suspenders pattern:
//   - PREFERRED: <!-- source_issue: N --> from the auto-fix PR body
//                (Phase 43 helper extension — Task 1 in this plan)
//   - FALLBACK : Fix #N or Fixes #N pattern in the squash-merge commit msg
//
// IMPORTS POLICY (Pitfall 6 — keep boundary clean):
//   ALLOWED:   node:*  AND  ./promote-from-quarantine.mjs
//   FORBIDDEN: tests/e2e/lib/*  (transport-confusion risk on the v3.1
//              subscription-vs-SDK boundary)
//              src/*  (browser code)
//              any LLM driver
// Audit (Plan 44-01 Audit 4):
//   grep -nE "^import" scripts/auto-fix-promote.mjs |
//     grep -vE "from 'node:|from './promote-from-quarantine\\.mjs'"
//   MUST return zero matches.
//
// CLI:
//   node scripts/auto-fix-promote.mjs \
//     --pr <n> \
//     --pr-labels <csv> \
//     --pr-merged <true|false> \
//     --pr-body <path-to-body-file> \
//     --pr-commit-message <string> \
//     --source-issue <n> \
//     --source-issue-labels <csv> \
//     --case-id <id>
//
// The workflow pre-resolves all gh outputs into these argv-passable strings;
// the script never makes its own gh calls. This keeps the script pure-CLI
// for Vitest mockability and keeps the transport boundary clean (the gh CLI
// lives in the workflow, not the script).
//
// Exit codes:
//   0 — runPromote returned exitCode 0 (promotion successful)
//   1 — TRIPLE_GATE_FAILED / parseSourceIssue failed / runPromote returned
//       non-zero / runtime error
//   2 — argv error: missing or malformed flag

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runPromote } from './promote-from-quarantine.mjs';

// ---------------------------------------------------------------------------
// Phase 53 — auto-fix:partial-verified semantics (PARTIAL-01 + PARTIAL-04).
//
// PARTIAL_LABEL: the GitHub label string that the verifier-gate workflow
// (v40-verifier-gate.yml) emits when >=4/5 of affected cases pass a 3x
// consecutive verifier-gate run AND no failing case is a FLAKE. This label
// is the cross-workflow signal that auto-promote (v40-auto-promote.yml) keys
// off to enter the PARTIAL path. Declared HERE (D-18) so the Vitest pin in
// tests/unit/auto-fix-promote-gate.test.js can reference the symbol — and
// thus ships in the SAME COMMIT as both the assertPartialGate definition
// and the trust-invariant assertion that assertTripleGate continues to
// reject this label (PARTIAL-04).
//
// PARTIAL_THRESHOLD: the >=4/5 ratio (0.80). Single source of truth (D-11);
// also referenced numerically by the partial-label step in
// v40-verifier-gate.yml. Changing this constant is a deliberate test-update,
// pinned by tests/unit/auto-fix-promote-gate.test.js T_thresh_1.
// ---------------------------------------------------------------------------

export const PARTIAL_LABEL = 'auto-fix:partial-verified';
export const PARTIAL_THRESHOLD = 0.80;

// ---------------------------------------------------------------------------
// assertTripleGate — PURE; no I/O; no gh calls; no process exit.
// Throws on the first failing leg with TRIPLE_GATE_FAILED: <leg> — <details>.
// The caller (main / Vitest) handles the throw. This makes T1-T4 trivially
// Vitest-mockable.
// ---------------------------------------------------------------------------

export function assertTripleGate({ prLabels, merged, sourceIssueLabels } = {}) {
  // Leg 1 — auto-fix:verified label on the merged PR.
  if (!Array.isArray(prLabels) || !prLabels.includes('auto-fix:verified')) {
    throw new Error("TRIPLE_GATE_FAILED: prLabels — missing 'auto-fix:verified'");
  }
  // Leg 2 — merged === true (the GitHub close webhook also fires for
  // close-without-merge; this leg is what distinguishes them).
  if (merged !== true) {
    throw new Error('TRIPLE_GATE_FAILED: merged — pull request not merged');
  }
  // Leg 3 — source-issue carries triage (Phase 34 triage-classifier verdict).
  if (!Array.isArray(sourceIssueLabels) || !sourceIssueLabels.includes('triage')) {
    throw new Error("TRIPLE_GATE_FAILED: sourceIssueLabels — source issue missing 'triage'");
  }
}

// ---------------------------------------------------------------------------
// assertPartialGate — Phase 53 PARTIAL-01 (D-01..D-05).
//
// A SEPARATE entry point from assertTripleGate. Does NOT widen the triple-
// gate (D-05: assertTripleGate body lines 67-81 byte-unchanged). Trust
// invariant: the partial path runs WITHOUT the Phase 35 _skipCiGuard:true
// exemption — partial promotes re-enter normal CI semantics on the
// auto-promote follow-up PR (assertPartialGate's caller, runPartialPromote,
// calls runPromote with _skipCiGuard:false).
//
// Contract (D-01): { prLabels, merged, sourceIssueLabels, passingCases }.
// First 3 args mirror assertTripleGate for symmetry; passingCases is the
// case IDs the verifier confirmed PASS (CSV-decoded by parseArgv from the
// --passing-cases flag; sourced from a verifier-gate PR comment marker).
//
// Three legs (D-02), error prefix PARTIAL_GATE_FAILED for diagnostic
// uniformity with TRIPLE_GATE_FAILED (D-03):
//   Leg 1 — PR carries 'auto-fix:partial-verified' (NOT 'auto-fix:verified'
//           — that is assertTripleGate's job; the trust invariant boundary
//           PARTIAL-04 pins this in Vitest)
//   Leg 2 — merged === true
//   Leg 3 — source-issue carries 'triage'
//
// passingCases validation (D-04): empty/non-array → throw; non-string entry
// → throw. assertPartialGate never calls runPromote at all — it is a pure
// gate that returns { passingCaseIds } for the caller to act on. The defensive
// copy on return prevents callers mutating the input through the return value.
//
// PURE function: no I/O, no gh, no process.exit (mirrors assertTripleGate).
// ---------------------------------------------------------------------------

export function assertPartialGate({ prLabels, merged, sourceIssueLabels, passingCases } = {}) {
  // Leg 1 — auto-fix:partial-verified label on the merged PR.
  if (!Array.isArray(prLabels) || !prLabels.includes(PARTIAL_LABEL)) {
    throw new Error("PARTIAL_GATE_FAILED: prLabels — missing 'auto-fix:partial-verified'");
  }
  // Leg 2 — merged === true (mirrors assertTripleGate Leg 2 semantics).
  if (merged !== true) {
    throw new Error('PARTIAL_GATE_FAILED: merged — pull request not merged');
  }
  // Leg 3 — source-issue carries triage (mirrors assertTripleGate Leg 3).
  if (!Array.isArray(sourceIssueLabels) || !sourceIssueLabels.includes('triage')) {
    throw new Error("PARTIAL_GATE_FAILED: sourceIssueLabels — source issue missing 'triage'");
  }
  // D-04 amendment: passingCases must be a non-empty array of non-empty
  // strings. Empty/non-array → "empty (no cases to promote)" (T-53-05
  // mitigation — prevents silent no-op promote). Mixed-type array → "non-
  // string entry" (defense against argv tampering — T-53-04 mitigation).
  if (!Array.isArray(passingCases) || passingCases.length === 0) {
    throw new Error('PARTIAL_GATE_FAILED: passingCases — empty (no cases to promote)');
  }
  for (const entry of passingCases) {
    if (typeof entry !== 'string' || entry.length === 0) {
      throw new Error('PARTIAL_GATE_FAILED: passingCases — non-string entry');
    }
  }
  // Defensive copy so callers cannot mutate the input array through the
  // returned reference. Vitest P8 pins this.
  return { passingCaseIds: passingCases.slice() };
}

// ---------------------------------------------------------------------------
// runPartialPromote — Phase 53 PARTIAL-01 (D-06..D-08).
//
// Loops over passingCaseIds and invokes the per-case promote primitive
// (runPromote from ./promote-from-quarantine.mjs) WITHOUT the _skipCiGuard
// exemption — i.e., the partial path re-enters normal Phase 35 CI semantics.
//
// IMPLEMENTATION NOTE (Phase 53 inline deviation, Rule 1):
// The plan's <interfaces> block references an export named
// `promoteFromQuarantine` from ./promote-from-quarantine.mjs. That export
// does not exist — only `runPromote` and `appendToGoldenCorpus` are
// exported. `runPromote` IS the per-case primitive (its signature is
// `{ id, confirm, _skipCiGuard }`; one case per invocation). We use it
// here with `_skipCiGuard: false`, which preserves the D-04/D-06/D-07
// trust invariant verbatim: "_skipCiGuard:true" never appears in this
// function's body. The grep gate (count == 1 in the file) holds because
// only main()'s existing verified-branch retains the `_skipCiGuard: true`
// literal.
//
// Atomic-per-case semantics (D-07): on the first runPromote failure
// (exitCode !== 0 OR a thrown error), emit
//   PARTIAL_PROMOTE_HALTED: case=<id>, reason=<msg>
// to console.error and return { promoted, halted: true, error } where
// `promoted` holds the case IDs successfully promoted BEFORE the halt.
// No rollback — matches existing runPromote semantics for the full-pass
// path. Failing cases (not in passingCaseIds) stay quarantined per D-08;
// the workflow-side comment hook posts a notice on each failing source
// issue (Task 3 territory).
//
// dryRun (D-19, Claude's Discretion): when true, returns the no-op shape
// WITHOUT invoking runPromote. Used for Vitest mockability; the workflow
// always passes dryRun:false implicitly.
// ---------------------------------------------------------------------------

export async function runPartialPromote(passingCaseIds, { dryRun = false } = {}) {
  // Defense-in-depth: re-validate the array shape for direct CLI callers
  // (the workflow's main() call path already runs assertPartialGate, but
  // direct invocations from a future test harness or REPL must not
  // silently no-op).
  if (!Array.isArray(passingCaseIds) || passingCaseIds.length === 0) {
    throw new Error('PARTIAL_GATE_FAILED: passingCases — empty (no cases to promote)');
  }

  if (dryRun === true) {
    return { promoted: passingCaseIds.slice(), halted: false, dryRun: true };
  }

  const promoted = [];
  for (const caseId of passingCaseIds) {
    try {
      const result = await runPromote({
        id: caseId,
        confirm: true,
        _skipCiGuard: false,
      });
      if (result && result.exitCode !== 0) {
        const haltMsg = 'PARTIAL_PROMOTE_HALTED: case=' + caseId +
          ', reason=runPromote exitCode=' + result.exitCode;
        console.error(haltMsg);
        return { promoted, halted: true, error: haltMsg };
      }
      promoted.push(caseId);
    } catch (err) {
      const haltMsg = 'PARTIAL_PROMOTE_HALTED: case=' + caseId +
        ', reason=' + (err && err.message ? err.message : String(err));
      console.error(haltMsg);
      return { promoted, halted: true, error: haltMsg };
    }
  }

  return { promoted, halted: false };
}

// ---------------------------------------------------------------------------
// parseSourceIssue — PURE; recovers the integer source-issue id from EITHER
// the PR body (preferred) OR the squash-merge commit message (fallback).
// ---------------------------------------------------------------------------

export function parseSourceIssue({ body = '', commitMessage = '' } = {}) {
  // PREFERRED: <!-- source_issue: N --> in the PR body. Tolerant of
  // whitespace inside the comment (matches the Phase 43 helper output AND
  // hand-edited variants).
  const bodyMatch = body.match(/<!--\s*source_issue:\s*(\d+)\s*-->/);
  if (bodyMatch) return Number(bodyMatch[1]);

  // FALLBACK: `Fix #N` or `Fixes #N` (case-sensitive, GitHub closing-keyword
  // convention; full closing-keyword vocabulary is broader but the auto-fix
  // workflow only emits these two shapes per Phase 43 cpr@v8 commit-message
  // template `Fix #${issue}: ${error_class}`).
  const commitMatch = commitMessage.match(/\b(?:Fix|Fixes)\s+#(\d+)\b/);
  if (commitMatch) return Number(commitMatch[1]);

  throw new Error(
    'TRIPLE_GATE_FAILED: cannot identify source issue ' +
    '(no <!-- source_issue: N --> comment and no Fix #N pattern in commit message)',
  );
}

// ---------------------------------------------------------------------------
// parseArgv — hand-rolled (project convention; mirrors verify-single-case.mjs).
// Exits 2 on every error path.
// ---------------------------------------------------------------------------

const KNOWN_FLAGS = new Set([
  '--pr', '--pr-labels', '--pr-merged', '--pr-body', '--pr-commit-message',
  '--source-issue', '--source-issue-labels', '--case-id',
  // Phase 53 PARTIAL-03 (D-16): --passing-cases CSV for the partial path.
  // Ignored by the verified path; consumed by assertPartialGate +
  // runPartialPromote on the partial branch of main().
  '--passing-cases',
  '--help', '-h',
]);

function takeValue(argv, i, flag) {
  const next = argv[i + 1];
  if (next === undefined || next === '' || next.startsWith('--')) {
    process.stderr.write(`[auto-fix-promote] missing value for ${flag}\n`);
    process.exit(2);
  }
  return next;
}

export function parseArgv(argv) {
  let pr = null;
  let prLabelsCsv = '';
  let prMerged = null;
  let prBodyPath = null;
  let prCommitMessage = '';
  let sourceIssue = null;
  let sourceIssueLabelsCsv = '';
  let caseId = null;
  // Phase 53 PARTIAL-03 (D-16): CSV of passing cases for the partial path.
  // The verified path ignores this; the partial path consumes it as
  // assertPartialGate({ passingCases }). Empty default mirrors the
  // existing labels-CSV pattern.
  let passingCasesCsv = '';

  for (let i = 2; i < argv.length; i++) {
    const tok = argv[i];
    if (tok === '--help' || tok === '-h') {
      process.stdout.write(
        'Usage: node scripts/auto-fix-promote.mjs \\\n' +
        '  --pr <n> --pr-labels <csv> --pr-merged <true|false> \\\n' +
        '  --pr-body <path> --pr-commit-message <string> \\\n' +
        '  --source-issue <n> --source-issue-labels <csv> \\\n' +
        '  --case-id <id> [--passing-cases <csv>]\n',
      );
      process.exit(0);
    }
    if (!KNOWN_FLAGS.has(tok)) {
      process.stderr.write(`[auto-fix-promote] unknown flag: ${tok}\n`);
      process.exit(2);
    }
    switch (tok) {
      case '--pr':                   pr = takeValue(argv, i, tok); i++; break;
      case '--pr-labels':            prLabelsCsv = takeValue(argv, i, tok); i++; break;
      case '--pr-merged':            prMerged = takeValue(argv, i, tok); i++; break;
      case '--pr-body':              prBodyPath = takeValue(argv, i, tok); i++; break;
      case '--pr-commit-message':    prCommitMessage = takeValue(argv, i, tok); i++; break;
      case '--source-issue':         sourceIssue = takeValue(argv, i, tok); i++; break;
      case '--source-issue-labels':  sourceIssueLabelsCsv = takeValue(argv, i, tok); i++; break;
      case '--case-id':              caseId = takeValue(argv, i, tok); i++; break;
      case '--passing-cases':        passingCasesCsv = takeValue(argv, i, tok); i++; break;
    }
  }

  if (!pr || prMerged === null || !caseId) {
    process.stderr.write(
      '[auto-fix-promote] required flags: --pr, --pr-merged, --case-id\n',
    );
    process.exit(2);
  }

  return {
    pr: Number(pr),
    prLabels: prLabelsCsv ? prLabelsCsv.split(',').map((s) => s.trim()).filter(Boolean) : [],
    prMerged: prMerged === 'true',
    prBodyPath,
    prCommitMessage,
    sourceIssue: sourceIssue !== null ? Number(sourceIssue) : null,
    sourceIssueLabels: sourceIssueLabelsCsv
      ? sourceIssueLabelsCsv.split(',').map((s) => s.trim()).filter(Boolean)
      : [],
    caseId,
    passingCases: passingCasesCsv
      ? passingCasesCsv.split(',').map((s) => s.trim()).filter(Boolean)
      : [],
  };
}

// ---------------------------------------------------------------------------
// main — CLI entrypoint. Sequence: parseArgv → load PR body → assertTripleGate
//        → parseSourceIssue (recovers/validates id) → runPromote per case.
//        The workflow loop calls this once per case-id; this script only
//        promotes one case per invocation.
// ---------------------------------------------------------------------------

async function main(argv = process.argv) {
  const args = parseArgv(argv);

  let body = '';
  if (args.prBodyPath) {
    try {
      body = fs.readFileSync(args.prBodyPath, 'utf8');
    } catch (err) {
      process.stderr.write(
        `[auto-fix-promote] failed to read --pr-body ${args.prBodyPath}: ${err.message}\n`,
      );
      process.exit(1);
    }
  }

  // Phase 53 PARTIAL-03 (D-15): label-branch decision. The workflow-level
  // if: filter (v40-auto-promote.yml) already widened to accept BOTH labels;
  // here the script disambiguates: hasVerified takes the existing triple-
  // gate + runPromote({_skipCiGuard:true}) path UNCHANGED; hasPartial takes
  // the new assertPartialGate + runPartialPromote({_skipCiGuard:false}) path;
  // neither label exits 0 defensively (the workflow filter should prevent
  // reaching this branch, but defense-in-depth against direct CLI misuse).
  // Co-presence (both labels): verified takes precedence — partial is a
  // NEW capability, NOT a replacement.
  const hasVerified = args.prLabels.includes('auto-fix:verified');
  const hasPartial  = args.prLabels.includes(PARTIAL_LABEL);

  if (hasVerified) {
    // ====================================================================
    // VERIFIED PATH — Phase 44 triple-gate + runPromote (BYTE-UNCHANGED).
    // ====================================================================

    // Triple-gate FIRST. Any leg failure throws and aborts before any mutation.
    try {
      assertTripleGate({
        prLabels: args.prLabels,
        merged: args.prMerged,
        sourceIssueLabels: args.sourceIssueLabels,
      });
    } catch (err) {
      process.stderr.write(`[auto-fix-promote] ${err.message}\n`);
      process.exit(1);
    }

    // Source-issue id: cross-check the workflow-resolved --source-issue against
    // parseSourceIssue. If the workflow passed an id, the body/commit recovery
    // must AGREE with it (defense against argv tampering). If --source-issue
    // is absent, parseSourceIssue is the sole source of truth.
    let resolvedSourceIssue;
    try {
      resolvedSourceIssue = parseSourceIssue({
        body,
        commitMessage: args.prCommitMessage,
      });
    } catch (err) {
      process.stderr.write(`[auto-fix-promote] ${err.message}\n`);
      process.exit(1);
    }
    if (args.sourceIssue !== null && args.sourceIssue !== resolvedSourceIssue) {
      process.stderr.write(
        `[auto-fix-promote] --source-issue ${args.sourceIssue} disagrees with parsed id ${resolvedSourceIssue}\n`,
      );
      process.exit(1);
    }

    // Triple-gate satisfied. Now invoke runPromote with the _skipCiGuard
    // exemption (the ONLY caller permitted to do so; Phase 35 designed the
    // param for exactly this use case).
    const result = await runPromote({
      id: args.caseId,
      confirm: true,
      _skipCiGuard: true,
    });
    if (result.exitCode !== 0) {
      process.stderr.write(
        `[auto-fix-promote] runPromote returned exitCode ${result.exitCode} for case ${args.caseId}\n`,
      );
      process.exit(1);
    }

    process.stdout.write(
      `[auto-fix-promote] promoted ${args.caseId} (source issue #${resolvedSourceIssue})\n`,
    );
    process.exit(0);
  }

  if (hasPartial) {
    // ====================================================================
    // PARTIAL PATH — Phase 53 assertPartialGate + runPartialPromote.
    // _skipCiGuard:true is NEVER reached on this branch.
    // ====================================================================
    try {
      assertPartialGate({
        prLabels: args.prLabels,
        merged: args.prMerged,
        sourceIssueLabels: args.sourceIssueLabels,
        passingCases: args.passingCases,
      });
    } catch (err) {
      process.stderr.write(`[auto-fix-promote] ${err.message}\n`);
      process.exit(1);
    }

    let resolvedSourceIssue;
    try {
      resolvedSourceIssue = parseSourceIssue({
        body,
        commitMessage: args.prCommitMessage,
      });
    } catch (err) {
      process.stderr.write(`[auto-fix-promote] ${err.message}\n`);
      process.exit(1);
    }
    if (args.sourceIssue !== null && args.sourceIssue !== resolvedSourceIssue) {
      process.stderr.write(
        `[auto-fix-promote] --source-issue ${args.sourceIssue} disagrees with parsed id ${resolvedSourceIssue}\n`,
      );
      process.exit(1);
    }

    const partialResult = await runPartialPromote(args.passingCases);
    if (partialResult.halted) {
      process.stderr.write(
        `[auto-fix-promote] ${partialResult.error}\n`,
      );
      process.exit(1);
    }

    process.stdout.write(
      `[auto-fix-promote] partial-promoted ${partialResult.promoted.length}/${args.passingCases.length} cases (source issue #${resolvedSourceIssue}): ${partialResult.promoted.join(',')}\n`,
    );
    process.exit(0);
  }

  // Neither label — defensive no-op exit 0 (the workflow's if: filter
  // SHOULD prevent reaching here, but the script defends against direct
  // CLI misuse).
  process.stderr.write(
    '[auto-fix-promote] no recognized verified label on PR — no-op exit 0\n',
  );
  process.exit(0);
}

// ---------------------------------------------------------------------------
// isMain guard (mirrors promote-from-quarantine.mjs WR-02 Windows-safe form)
// ---------------------------------------------------------------------------

const isMain =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  main().catch((e) => {
    process.stderr.write('[auto-fix-promote] uncaught error: ' + e.message + '\n');
    process.exit(1);
  });
}

// END scripts/auto-fix-promote.mjs — Phase 44 Plan 44-01 PROMOTE-01..04

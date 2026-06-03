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

  for (let i = 2; i < argv.length; i++) {
    const tok = argv[i];
    if (tok === '--help' || tok === '-h') {
      process.stdout.write(
        'Usage: node scripts/auto-fix-promote.mjs \\\n' +
        '  --pr <n> --pr-labels <csv> --pr-merged <true|false> \\\n' +
        '  --pr-body <path> --pr-commit-message <string> \\\n' +
        '  --source-issue <n> --source-issue-labels <csv> \\\n' +
        '  --case-id <id>\n',
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

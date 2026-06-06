// tests/e2e/scripts/inject-defect.mjs
//
// Phase 59 Plan 59-01 (MUTATOR-01..05) — synthetic defect injector for the
// UAT-47-b live auto-fix loop sweep. Creates a `triage`-labeled GitHub issue
// with a deterministic 12-hex fingerprint marker on line 1 so the existing
// `v40-auto-fix.yml` workflow + `scripts/auto-fix.mjs` dispatcher process it
// as a real failure.
//
// Co-designed with `scripts/quarantine-append.mjs:218-223`: synthetic
// quarantine entries whose `source_triage_finding_id` starts with
// 'fixture-mutator-uat-47b' are suppressed from receiving the
// `quarantine:ready-for-promotion` label (Pitfall 8 / MUTATOR-04 / T-59-04).
//
// Threat model (T-59-01..T-59-05):
//   T-59-01: Fingerprint formula divergence — MITIGATED by importing
//            `fingerprint` from `scripts/e2e-report-issue.mjs` (byte-identical
//            reuse; re-implementation forbidden).
//   T-59-02: Fingerprint collision DoS — PARTIALLY MITIGATED by
//            `collisionCheckOrAbort` (hard abort, exit code 2, not a warning).
//            CAVEAT (Phase 59 REVIEW-FIX WR-03): collisionCheckOrAbort runs
//            `gh issue list --search` and createIssue runs `gh issue create`
//            with an unbounded network-latency window between them. Two
//            concurrent invocations with the same (seed, errorClass) can both
//            pass the check and both create issues with the same fingerprint.
//            The runbook (Plan 59-02 SWEEP-03/04) is operator-driven
//            (single operator at a time, manual `gh workflow run` /
//            `node tests/e2e/scripts/inject-defect.mjs`), so the race is
//            unlikely in practice. Post-hoc detection: SWEEP-06 cleanup
//            inspects 56-MUTATOR-CLEANUP.md for duplicate fingerprint
//            entries. Accepted as DOCUMENTED LIMITATION per WR-03.
//   T-59-03: FORBIDDEN_PATHS mutation — MITIGATED by `verifyWorkingTreeClean`
//            (runtime gate; only `.planning/phases/59-*/56-MUTATOR-CLEANUP.md`
//            may appear in `git status --porcelain`).
//   T-59-04: Auto-promotion of synthetic to golden corpus — MITIGATED by
//            co-designed source-tag string `fixture-mutator-uat-47b` matched
//            in scripts/quarantine-append.mjs:218-223.
//   T-59-05: Orphaned synthetic state — MITIGATED by append-only
//            `56-MUTATOR-CLEANUP.md` manifest (consumed by 59-02 SWEEP-06).
//
// Exit codes:
//   0  success — synthetic issue created
//   1  runtime error (FORBIDDEN_PATHS dirty, fs failure, gh transport)
//   2  bad argv OR fingerprint collision hard-abort
//
// Usage:
//   node tests/e2e/scripts/inject-defect.mjs \
//     --seed mutator-seed-1 \
//     --error-class GOOGLE_DOM_DRIFT \
//     [--phase-dir <path>]

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fingerprint } from '../../../scripts/e2e-report-issue.mjs';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// ERROR_CLASS allowlist — must match the workflow's pre-check enumeration at
// .github/workflows/v40-auto-fix.yml:91. FLAKE / LLM_API_ERROR / PASS are
// workflow-accepted but not for synthetic injection (per RESEARCH §477-481).
export const ERROR_CLASSES = new Set([
  'WRONG_CITATION',
  'LLM_HALLUCINATED_SELECTION',
  'WORKER_FALLBACK_FAILED',
  'GOOGLE_DOM_DRIFT',
  'HARNESS_ERROR',
]);

// Co-designed source-tag string. MUST match the literal checked in
// scripts/quarantine-append.mjs:218-223 (MUTATOR-04 / T-59-04 co-design).
// Co-designed change ships in the SAME commit per MUTATOR-04 wording.
export const SOURCE_TAG = 'fixture-mutator-uat-47b';

// Argv input-validation regex per RESEARCH §Security Domain (T-Tampering on
// --seed argv). Allows alphanumerics, underscore, and hyphen.
const SEED_RE = /^[a-zA-Z0-9_-]+$/;

// Default phase directory — the real Phase 59 directory. Tests override this
// via the `--phase-dir <tmp>` flag.
const DEFAULT_PHASE_DIR = '.planning/phases/59-fixture-mutator-4-uat-re-sweep';

// ---------------------------------------------------------------------------
// parseArgs — long-flag with whitespace separator; equals-syntax rejected.
// Mirrors the scripts/quarantine-append.mjs:36-128 + e2e-triage-classifier.mjs
// parseArgs style.
//
// Phase 59 REVIEW-FIX WR-02: KNOWN_FLAGS-set unknown-flag reject mirrors the
// scripts/auto-fix-promote.mjs:278-296 pattern. Pre-REVIEW-FIX parseArgs
// silently dropped unknown tokens (e.g. `--seeds`, `--errorclass`,
// `--phasedir`), causing the script to fall through to its defaults and
// file a synthetic issue against the REAL phase directory using the
// shared default fingerprint. Reject unknown tokens with exit 2 to fail
// loud and match the auto-fix-promote.mjs convention.
// ---------------------------------------------------------------------------

const KNOWN_FLAGS = new Set([
  '--seed',
  '--error-class',
  '--phase-dir',
  '--help',
  '-h',
]);

export function parseArgs(argv) {
  let seed = 'mutator-seed-1';
  let errorClass = 'GOOGLE_DOM_DRIFT';
  let phaseDir = DEFAULT_PHASE_DIR;

  for (let i = 2; i < argv.length; i++) {
    if (argv[i].startsWith('--seed=')) {
      process.stderr.write(
        '[inject-defect] equals syntax not supported for --seed; use `--seed <value>`\n',
      );
      process.exit(2);
    } else if (argv[i] === '--seed') {
      const next = argv[i + 1];
      if (next === undefined || next === null || next === '' || next.startsWith('--')) {
        process.stderr.write('[inject-defect] missing value for --seed\n');
        process.exit(2);
      }
      seed = next;
      i++;
    } else if (argv[i].startsWith('--error-class=')) {
      process.stderr.write(
        '[inject-defect] equals syntax not supported for --error-class; use `--error-class <value>`\n',
      );
      process.exit(2);
    } else if (argv[i] === '--error-class') {
      const next = argv[i + 1];
      if (next === undefined || next === null || next === '' || next.startsWith('--')) {
        process.stderr.write('[inject-defect] missing value for --error-class\n');
        process.exit(2);
      }
      errorClass = next;
      i++;
    } else if (argv[i].startsWith('--phase-dir=')) {
      process.stderr.write(
        '[inject-defect] equals syntax not supported for --phase-dir; use `--phase-dir <value>`\n',
      );
      process.exit(2);
    } else if (argv[i] === '--phase-dir') {
      const next = argv[i + 1];
      if (next === undefined || next === null || next === '' || next.startsWith('--')) {
        process.stderr.write('[inject-defect] missing value for --phase-dir\n');
        process.exit(2);
      }
      phaseDir = next;
      i++;
    } else if (argv[i] === '--help' || argv[i] === '-h') {
      process.stdout.write(
        'Usage:\n' +
          '  node tests/e2e/scripts/inject-defect.mjs \\\n' +
          '    --seed <value> --error-class <CLASS> [--phase-dir <path>]\n' +
          '\n' +
          'Options:\n' +
          '  --seed <value>         Deterministic seed for the fingerprint. Must match\n' +
          '                         /^[a-zA-Z0-9_-]+$/. Default: mutator-seed-1.\n' +
          '  --error-class <CLASS>  One of WRONG_CITATION, LLM_HALLUCINATED_SELECTION,\n' +
          '                         WORKER_FALLBACK_FAILED, GOOGLE_DOM_DRIFT,\n' +
          '                         HARNESS_ERROR. Default: GOOGLE_DOM_DRIFT.\n' +
          '  --phase-dir <path>     Directory under which 56-MUTATOR-CLEANUP.md is\n' +
          '                         emitted. Default: .planning/phases/59-fixture-mutator-4-uat-re-sweep.\n' +
          '  --help, -h             Show this help message.\n' +
          '\n' +
          'Exit codes: 0 success | 1 runtime error | 2 bad argv or collision hard-abort\n',
      );
      process.exit(0);
    } else if (!KNOWN_FLAGS.has(argv[i])) {
      // Phase 59 REVIEW-FIX WR-02: reject unknown flags loudly (exit 2)
      // rather than silently dropping them. Pre-REVIEW-FIX behaviour
      // would silently ignore typos like `--seeds mutator-X`,
      // `--errorclass GOOGLE_DOM_DRIFT`, or `--phasedir /tmp/x` and
      // fall through to defaults — causing the script to file a
      // synthetic issue against the REAL phase directory using the
      // shared default fingerprint, increasing the collision-check
      // contention window for any other operator running the mutator
      // concurrently. Mirrors scripts/auto-fix-promote.mjs:348-351.
      process.stderr.write(`[inject-defect] unknown flag: ${argv[i]}\n`);
      process.exit(2);
    }
  }

  if (!SEED_RE.test(seed)) {
    process.stderr.write(
      `[inject-defect] invalid --seed '${seed}'; must match /^[a-zA-Z0-9_-]+$/\n`,
    );
    process.exit(2);
  }
  if (!ERROR_CLASSES.has(errorClass)) {
    const allowed = [...ERROR_CLASSES].join(', ');
    process.stderr.write(
      `[inject-defect] unknown --error-class '${errorClass}'; allowed: ${allowed}\n`,
    );
    process.exit(2);
  }

  return { seed, errorClass, phaseDir };
}

// ---------------------------------------------------------------------------
// computeFingerprint — Option 1 (CLEAN) per RESEARCH §Fingerprint Computation
// Contract lines 450-456: pass null for topOfStackHash. The fingerprint
// function's `|| ''` produces input `synthetic-${seed}|${errorClass}|`.
// ---------------------------------------------------------------------------

export function computeFingerprint({ seed, errorClass }) {
  const caseId = `synthetic-${seed}`;
  return fingerprint(caseId, errorClass, null);
}

// ---------------------------------------------------------------------------
// collisionCheckOrAbort — MUTATOR-02 / Pitfall 6 LOAD-BEARING.
// Searches open issues for the v2 marker `<!-- fp: ${fp} -->`. If any open
// issue carries the same fingerprint, HARD ABORT with exit 2 (not a warning).
//
// Phase 59 REVIEW-FIX WR-03 — TOCTOU RACE NOTE: this check + createIssue
// is racy under concurrent invocation. The check runs `gh issue list`,
// returns no match, then createIssue runs `gh issue create` an unbounded
// number of milliseconds later. A concurrent inject-defect.mjs invocation
// with the same (seed, errorClass) pair could pass the same check in
// between, and both processes would create issues with the same
// fingerprint — which would then feed the auto-fix loop with overlapping
// fingerprints (T-59-02 DoS this check was meant to prevent).
//
// The runbook (Plan 59-02 SWEEP-03/04) is operator-driven (single
// operator, manual `gh workflow run` / `node ... inject-defect.mjs`), so
// in practice the race is unlikely. The mitigation is operator discipline
// + post-hoc detection via 56-MUTATOR-CLEANUP.md inspection by the
// SWEEP-06 cleanup step. A stricter mitigation (e.g. embedding a
// randomized salt into the seed to make concurrent collisions impossible)
// would break seed-based determinism, which the threat model relies on
// for T-59-01 + T-59-04 verification, so the documented limitation is
// the chosen trade-off.
// ---------------------------------------------------------------------------

export function collisionCheckOrAbort({ fp }) {
  const marker = `<!-- fp: ${fp} -->`;
  // T-35-03-03 shell-escape for single-quoted shell context.
  const escaped = marker.replaceAll("'", "'\\''");
  const cmd = `gh issue list --search '${escaped}' --state open --json number --limit 5`;
  let raw;
  try {
    raw = execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    process.stderr.write(
      `[inject-defect] gh issue list failed: ${err.message}\n`,
    );
    process.exit(1);
  }
  let result;
  try {
    result = JSON.parse(raw);
  } catch (err) {
    process.stderr.write(
      `[inject-defect] gh issue list returned non-JSON: ${err.message}\n`,
    );
    process.exit(1);
  }
  if (Array.isArray(result) && result.length > 0) {
    process.stderr.write(
      `[inject-defect] HARD ABORT: open issue #${result[0].number} already carries fp ${fp}. ` +
        `Either close it first or use a different --seed.\n`,
    );
    process.exit(2);
  }
}

// ---------------------------------------------------------------------------
// buildBody — synthesizes the issue body. Line 1 MUST be the v2 marker
// `<!-- fp: ${fp} -->` (Pitfall 1 overflow protection per RESEARCH §458;
// auto-fix.mjs:231 regex `/<!-- fp: ([0-9a-f]{12}) -->/m`).
// ---------------------------------------------------------------------------

export function buildBody({ fp, caseId, seed, errorClass }) {
  return [
    `<!-- fp: ${fp} -->`,
    '',
    '### Reproducer',
    `case-id: ${caseId}`,
    `seed: ${seed}`,
    `error-class: ${errorClass}`,
    '',
    '### Synthetic Defect',
    '',
    'This issue was created by `tests/e2e/scripts/inject-defect.mjs` as a',
    'UAT-47-b synthetic exercise of the auto-fix loop. The case is NOT a real',
    'pipeline regression; it exists only to drive a controlled end-to-end',
    'auto-fix → auto-promote → ledger run on origin/main.',
    '',
    `Source: ${SOURCE_TAG}`,
    '',
    'Cleanup runbook: see `.planning/phases/59-fixture-mutator-4-uat-re-sweep/56-MUTATOR-CLEANUP.md`.',
    '',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// createIssue — MUTATOR-01 — mirrors scripts/e2e-report-issue.mjs:507-518
// pattern. Body passed via stdin (`--body-file -`) to avoid shell-quote
// hazards on backticks, fences, and HTML comments.
// ---------------------------------------------------------------------------

export function createIssue({ caseId, errorClass, body }) {
  const title = `[fixture-mutator] ${caseId}: ${errorClass}`;
  // T-35-03-04 defensive shell-escape on the title double-quote context.
  const escapedTitle = title.replaceAll('"', '\\"');
  const cmd =
    `gh issue create --title "${escapedTitle}" --label triage --label ${errorClass} --body-file -`;
  let out;
  try {
    out = execSync(cmd, { input: body, encoding: 'utf8' });
  } catch (err) {
    process.stderr.write(`[inject-defect] gh issue create failed: ${err.message}\n`);
    process.exit(1);
  }
  const m = out.match(/\/issues\/(\d+)/);
  if (!m) {
    process.stderr.write(
      `[inject-defect] could not parse issue number from gh output: ${out}\n`,
    );
    process.exit(1);
  }
  const issueNum = parseInt(m[1], 10);
  const url = out.trim();
  return { issueNum, url };
}

// ---------------------------------------------------------------------------
// verifyWorkingTreeClean — MUTATOR-03 / T-59-03 / Pitfall 5 LOAD-BEARING.
// Runs `git status --porcelain` and asserts the ONLY allowed dirty entry is
// the cleanup-evidence file under `${phaseDir}/56-MUTATOR-CLEANUP.md`.
// ---------------------------------------------------------------------------

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function verifyWorkingTreeClean({ phaseDir }) {
  let status;
  try {
    status = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
  } catch (err) {
    process.stderr.write(
      `[inject-defect] git status --porcelain failed: ${err.message}\n`,
    );
    process.exit(1);
  }
  if (status === '') return;
  const escapedDir = escapeRegExp(phaseDir);
  // Porcelain format: `XY path`; allowed entries are untracked (`??`) cleanup
  // file OR modified (`.M` / ` M` / `M ` / `MM`) cleanup file in the phaseDir.
  const allowedPattern = new RegExp(
    `^.{2} ${escapedDir}/56-MUTATOR-CLEANUP\\.md$`,
  );
  const lines = status.split('\n').filter((l) => l.length > 0);
  const violations = lines.filter((l) => !allowedPattern.test(l));
  if (violations.length > 0) {
    process.stderr.write(
      `[inject-defect] FATAL: unexpected working-tree changes:\n${violations.join('\n')}\n`,
    );
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// emitCleanupEvidence — MUTATOR-05 / T-59-05.
// Append-only manifest. Each mutator invocation appends a Run section that
// SWEEP-06 (plan 59-02) reads to drive cleanup automation.
// ---------------------------------------------------------------------------

const CLEANUP_HEADER =
  '# Phase 59 Fixture Mutator — Cleanup Evidence Manifest\n' +
  '\n' +
  '_Append-only manifest. Each `node tests/e2e/scripts/inject-defect.mjs`\n' +
  'invocation appends a `## Run <iso>` section below with explicit cleanup\n' +
  'commands consumed by Plan 59-02 SWEEP-06 (`uat-cleanup.mjs`)._\n' +
  '\n';

export function emitCleanupEvidence({
  phaseDir,
  issueNum,
  fp,
  seed,
  errorClass,
  sourceTag,
}) {
  const targetPath = path.join(phaseDir, '56-MUTATOR-CLEANUP.md');
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  if (!fs.existsSync(targetPath)) {
    fs.writeFileSync(targetPath, CLEANUP_HEADER, 'utf8');
  }
  const iso = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const section =
    `## Run ${iso} — issue #${issueNum} fp ${fp}\n` +
    '\n' +
    `- seed: \`${seed}\`\n` +
    `- errorClass: \`${errorClass}\`\n` +
    `- sourceTag: \`${sourceTag}\`\n` +
    '\n' +
    'Close synthetic issue (NOT planned):\n' +
    '\n' +
    '```bash\n' +
    `gh issue close ${issueNum} --reason "not planned"\n` +
    '```\n' +
    '\n' +
    'Close auto-fix PR + delete branch (populate `<PR_NUMBER>` after the\n' +
    'auto-fix loop opens the PR):\n' +
    '\n' +
    '```bash\n' +
    'gh pr close <PR_NUMBER> --delete-branch\n' +
    '```\n' +
    '\n' +
    'Revert any quarantine entry the synthetic run injected:\n' +
    '\n' +
    '```bash\n' +
    `git checkout -b chore/sweep-06-cleanup-${iso.replace(/[:T-]/g, '').replace(/Z$/, '')}\n` +
    `node tests/e2e/scripts/uat-cleanup.mjs --revert-quarantine --source-tag ${sourceTag}\n` +
    '```\n' +
    '\n' +
    'Fingerprint search (verify the synthetic issue is the only carrier):\n' +
    '\n' +
    '```bash\n' +
    `gh issue list --search '<!-- fp: ${fp} -->'\n` +
    '```\n' +
    '\n';
  fs.appendFileSync(targetPath, section, 'utf8');
}

// ---------------------------------------------------------------------------
// main — orchestration
// ---------------------------------------------------------------------------

export function main(argv = process.argv) {
  const { seed, errorClass, phaseDir } = parseArgs(argv);
  const caseId = `synthetic-${seed}`;
  const fp = computeFingerprint({ seed, errorClass });
  // Phase 59 REVIEW-FIX CR-02: verifyWorkingTreeClean runs BEFORE
  // collisionCheckOrAbort and createIssue. Pre-REVIEW-FIX ordering
  // (collisionCheck → createIssue → verifyWorkingTreeClean) was a
  // mis-named "gate" — verifyWorkingTreeClean fired AFTER the
  // synthetic GitHub issue had already been created, so a dirty
  // working tree left an orphaned `triage`-labeled issue with no
  // entry in `${phaseDir}/56-MUTATOR-CLEANUP.md`. The fingerprint
  // was then claimed by an open issue so a re-run hit collisionCheck
  // and HARD ABORTed — leaving the operator stuck. T-59-03 and
  // T-59-05 both defeated. Reorder:
  //   1. parseArgs
  //   2. computeFingerprint
  //   3. collisionCheckOrAbort        (network pre-flight, no local
  //                                   side effect)
  //   4. verifyWorkingTreeClean       ← BEFORE createIssue
  //   5. createIssue                  (only after working tree verified)
  //   6. emitCleanupEvidence          (only after successful create)
  collisionCheckOrAbort({ fp });
  verifyWorkingTreeClean({ phaseDir });
  const body = buildBody({ fp, caseId, seed, errorClass });
  const { issueNum } = createIssue({ caseId, errorClass, body });
  emitCleanupEvidence({
    phaseDir,
    issueNum,
    fp,
    seed,
    errorClass,
    sourceTag: SOURCE_TAG,
  });
  // Stable stdout shape — parsed by 59-02 SWEEP-03 and SWEEP-04 runbooks.
  process.stdout.write(
    `[inject-defect] issue #${issueNum} created with fingerprint ${fp}\n`,
  );
  process.exit(0);
}

// ---------------------------------------------------------------------------
// isMain guard — mirrors scripts/quarantine-append.mjs:381-383 (WR-02
// Windows-compat).
// ---------------------------------------------------------------------------

const isMain =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  main(process.argv);
}

// END tests/e2e/scripts/inject-defect.mjs — Phase 59 Plan 59-01 MUTATOR-01..05

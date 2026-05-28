// scripts/promote-from-quarantine.mjs — Phase 35 Plan 35-05 (QUAR-05)
// D-13: HUMAN-GATED — CI=true/GITHUB_ACTIONS=true → exit 1; no --confirm → dry-run exit 0.
// D-14: --confirm → 5-step: locate, strip, append-golden, remove-quarantine, spawnSync regen.
// D-15: refuses id already in golden corpus. D-16: atomicWriteJson/stringifyCorpus imported.
// Pitfall 6: spawnSync passes cwd: PROJECT_ROOT (not tmpDir).
// Exit codes: 0 success | 1 runtime/CI/guard | 2 bad flag

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { atomicWriteJson } from '../tests/e2e/lib/rerun-validator.js';
import { stringifyCorpus } from './quarantine-append.mjs';
import { sanitizeCaseId } from './e2e-report-issue.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const GOLDEN_CORPUS_PATH = path.resolve(PROJECT_ROOT, 'tests/test-cases.js');
const QUARANTINE_CORPUS_PATH = path.resolve(PROJECT_ROOT, 'tests/e2e/test-cases-quarantine.js');
const UPDATE_GOLDEN_SCRIPT = path.resolve(PROJECT_ROOT, 'scripts/update-golden.js');

// ---------------------------------------------------------------------------
// parseArgs — strict CLI argument parser (mirrors e2e-triage-classifier.mjs)
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  let id = null;
  let confirm = false;

  for (let i = 2; i < argv.length; i++) {
    if (argv[i].startsWith('--id=')) {
      process.stderr.write(
        '[promote-from-quarantine] equals syntax not supported for --id; use `--id <value>`\n',
      );
      process.exit(2);
    } else if (argv[i] === '--id') {
      const next = argv[i + 1];
      // WR-04 (Phase 35 review-fix): reject `--id --confirm` etc. — the next
      // token must be a value, not another flag. Mirrors update-golden.js:68.
      if (next === undefined || next === null || next === '' || next.startsWith('--')) {
        process.stderr.write('[promote-from-quarantine] missing value for --id\n');
        process.exit(2);
      }
      id = next;
      i++;
    } else if (argv[i] === '--confirm') {
      confirm = true;
    } else if (argv[i] === '--help' || argv[i] === '-h') {
      process.stdout.write(
        'Usage: node scripts/promote-from-quarantine.mjs --id <case-id> [--confirm]\n' +
        '\n' +
        'Options:\n' +
        '  --id <case-id>  Case ID to promote from quarantine corpus to golden corpus.\n' +
        '                  Must match an entry in tests/e2e/test-cases-quarantine.js.\n' +
        '  --confirm       Required flag for mutation. Without it, prints a dry-run\n' +
        '                  plan and exits 0 with NO changes to either corpus.\n' +
        '  --help, -h      Show this help message.\n' +
        '\n' +
        'Exit codes:\n' +
        '  0   success (dry-run print OR promotion completed)\n' +
        '  1   CI gate | id not found | id already in golden | spawn failed | runtime error\n' +
        '  2   bad flag value (equals syntax / missing value / missing --id)\n' +
        '\n' +
        'HUMAN-GATED (D-13): refuses to run in CI (CI=true / GITHUB_ACTIONS=true).\n',
      );
      process.exit(0);
    }
  }

  if (!id) {
    process.stderr.write('[promote-from-quarantine] --id required\n');
    process.exit(2);
  }

  return { id, confirm };
}

// ---------------------------------------------------------------------------
// appendToGoldenCorpus — pure helper (Open Question 2, unit-tested)
// ---------------------------------------------------------------------------

/** Insert a new 4-key entry before the LAST `\n];` that closes TEST_CASES. PURE. */
export function appendToGoldenCorpus(content, entry) {
  const block =
    '  {\n' +
    '    id: ' + JSON.stringify(entry.id) + ',\n' +
    '    patentFile: ' + JSON.stringify(entry.patentFile) + ',\n' +
    '    selectedText: ' + JSON.stringify(entry.selectedText) + ',\n' +
    '    category: ' + JSON.stringify(entry.category) + ',\n' +
    '  }';

  // lastIndexOf handles files with trailing comments after the array close (Open Question 2).
  // test-cases.js entries end with `},` (trailing comma), then `\n];` closes the array.
  // Insert new entry (with trailing comma) just before `\n];`.
  const closeIdx = content.lastIndexOf('\n];');
  // WR-07 (Phase 35 review-fix): throw instead of silently returning unchanged
  // content. The silent return was actively harmful: if the golden corpus was
  // malformed (e.g. partial-write from a prior crash, mid-edit by a human),
  // runPromote would proceed to step 4 (remove the entry from quarantine) +
  // step 5 (call update-golden.js) leaving the user in an irrecoverable state
  // — the entry is gone from quarantine but never made it into golden. The
  // outer runPromote try/catch now fires BEFORE step 4's quarantine removal,
  // preserving state on this failure mode.
  if (closeIdx === -1) {
    throw new Error('appendToGoldenCorpus: cannot locate "\\n];" close-marker in golden corpus (file malformed?)');
  }
  return content.slice(0, closeIdx) + '\n' + block + ',\n];' + content.slice(closeIdx + 3);
}

// ---------------------------------------------------------------------------
// runPromote — injectable orchestrator (Pitfall 6: spawn/cwd/paths are injected)
// ---------------------------------------------------------------------------

/** @returns {Promise<{ exitCode, action?, spawnArgs? }>} */
export async function runPromote(opts = {}) {
  const goldenPath        = opts.goldenPath        ?? GOLDEN_CORPUS_PATH;
  const quarantinePath    = opts.quarantinePath    ?? QUARANTINE_CORPUS_PATH;
  const updateGoldenScript = opts.updateGoldenScript ?? UPDATE_GOLDEN_SCRIPT;
  const cwd               = opts.cwd              ?? PROJECT_ROOT;
  const spawn             = opts.spawn            ?? spawnSync;
  const stdout            = opts.stdout           ?? process.stdout;
  const stderr            = opts.stderr           ?? process.stderr;
  const skipCiGuard       = opts._skipCiGuard     ?? false;

  // D-13: CI guard for direct-call coverage (Test P7/P8).
  // WR-05 (Phase 35 review-fix): broader regex — accept CI=true|1|yes|on
  // (case-insensitive). The narrow CI==='true' check missed CI=1 (common in
  // GitLab/GitHub matrix configs), CI=True (Buildkite), and CI=yes.
  const ciFlag = (process.env.CI ?? '').toLowerCase();
  const ciActive = ['true', '1', 'yes', 'on'].includes(ciFlag) || process.env.GITHUB_ACTIONS === 'true';
  if (!skipCiGuard && ciActive) {
    stderr.write('[promote-from-quarantine] promotion is local-only; refusing to run in CI\n');
    return { exitCode: 1 };
  }

  const id = opts.id;
  const confirm = opts.confirm ?? false;

  // T-35-05-01: sanitize before any I/O.
  let safeId;
  try {
    safeId = sanitizeCaseId(id);
  } catch (err) {
    stderr.write('[promote-from-quarantine] invalid --id: ' + err.message + '\n');
    return { exitCode: 1 };
  }

  // Cache-busted dynamic import of both corpora.
  const goldenUrl = pathToFileURL(goldenPath).href + '?t=' + Date.now() + '-' + Math.random();
  const quarantineUrl = pathToFileURL(quarantinePath).href + '?t=' + Date.now() + '-' + Math.random();
  let TEST_CASES, TEST_CASES_QUARANTINE;
  try {
    ({ TEST_CASES } = await import(goldenUrl));
    ({ TEST_CASES_QUARANTINE } = await import(quarantineUrl));
  } catch (err) {
    stderr.write('[promote-from-quarantine] FAILED to load corpora: ' + err.message + '\n');
    return { exitCode: 1 };
  }

  // Step 1: Locate entry in quarantine corpus.
  const entry = TEST_CASES_QUARANTINE.find(e => e.id === safeId);
  if (!entry) {
    stderr.write('[promote-from-quarantine] entry not found in quarantine: ' + safeId + '\n');
    return { exitCode: 1 };
  }

  // Step 1.5 (D-15): Refuse to promote id already in golden corpus.
  if (TEST_CASES.find(e => e.id === safeId)) {
    stderr.write(
      '[promote-from-quarantine] entry ' + safeId + ' already in golden corpus - refusing to duplicate\n',
    );
    return { exitCode: 1 };
  }

  // Dry-run (no --confirm): print 4-row tabular plan, NO mutation, NO spawnSync.
  if (!confirm) {
    stdout.write(
      '=== Dry-run promotion plan for ' + safeId + ' ===\n' +
      'Source quarantine:        ' + quarantinePath + '\n' +
      '  id:                     ' + entry.id + '\n' +
      '  selectedText (preview): ' + entry.selectedText.slice(0, 60) +
        (entry.selectedText.length > 60 ? '...' : '') + '\n' +
      '  stable_runs:            ' + entry.stable_runs + '\n' +
      'Target golden corpus:     ' + goldenPath + '\n' +
      '  append at index:        ' + TEST_CASES.length + '\n' +
      'Golden baseline file:     tests/golden/baseline.json\n' +
      'Will invoke:              node scripts/update-golden.js --case ' + safeId + ' --confirm\n' +
      '\n' +
      'Re-run with --confirm to apply.\n',
    );
    return { exitCode: 0, action: 'dry-run' };
  }

  // Step 2-5 (D-14): 5-step promotion flow with try/catch.
  try {
    // Step 2: Build promoted entry (strip 3 quarantine-only metadata keys).
    const promoted = {
      id: entry.id,
      patentFile: entry.patentFile,
      selectedText: entry.selectedText,
      category: entry.category,
    };

    // Step 3: Append to tests/test-cases.js via appendToGoldenCorpus.
    // WR-06 (Phase 35 review-fix): use atomicWriteJson (temp-write + rename)
    // instead of fs.writeFileSync. A SIGKILL mid-write previously left
    // tests/test-cases.js partially-written (broken JS), which then broke
    // every subsequent `vitest run` because the file can't be imported.
    // Step 4 below already uses atomicWriteJson; this brings step 3 in line.
    // atomicWriteJson(destPath, content) — see tests/e2e/lib/rerun-validator.js:111.
    const goldenContent = fs.readFileSync(goldenPath, 'utf-8');
    const newGolden = appendToGoldenCorpus(goldenContent, promoted);
    atomicWriteJson(goldenPath, newGolden);

    // Step 4: Remove entry from quarantine corpus.
    const remaining = TEST_CASES_QUARANTINE.filter(e => e.id !== safeId);
    atomicWriteJson(quarantinePath, stringifyCorpus(remaining));

    // Step 5: spawnSync regen. Pitfall 6: cwd: PROJECT_ROOT (never tmpDir).
    const spawnArgs = [updateGoldenScript, '--case', safeId, '--confirm'];
    const result = spawn('node', spawnArgs, { encoding: 'utf8', cwd });
    if (result.status !== 0) {
      throw new Error('update-golden.js exited ' + result.status + ': ' + (result.stderr || ''));
    }

    stdout.write('[promote-from-quarantine] promoted ' + safeId + ' successfully\n');
    return { exitCode: 0, action: 'promoted', spawnArgs };
  } catch (err) {
    stderr.write('[promote-from-quarantine] FAILED: ' + err.message + '\n');
    stderr.write(
      '[promote-from-quarantine] Inspect partial state via \'git status\'; ' +
      'revert with \'git checkout tests/\'\n',
    );
    return { exitCode: 1 };
  }
}

// ---------------------------------------------------------------------------
// main — CLI entrypoint
// ---------------------------------------------------------------------------

async function main(argv = process.argv) {
  // D-13: CI guard for CLI path.
  // WR-05 (Phase 35 review-fix): broader regex — accept CI=true|1|yes|on
  // (case-insensitive). Matches the runPromote() guard above.
  const ciFlag = (process.env.CI ?? '').toLowerCase();
  const ciActive = ['true', '1', 'yes', 'on'].includes(ciFlag) || process.env.GITHUB_ACTIONS === 'true';
  if (ciActive) {
    process.stderr.write(
      '[promote-from-quarantine] promotion is local-only; refusing to run in CI\n',
    );
    process.exit(1);
  }

  const { id, confirm } = parseArgs(argv);
  const result = await runPromote({ id, confirm, _skipCiGuard: true });
  process.exit(result.exitCode);
}

// ---------------------------------------------------------------------------
// isMain guard (WR-02: Windows-safe)
// ---------------------------------------------------------------------------

const isMain =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  main().catch((e) => {
    process.stderr.write('[promote-from-quarantine] uncaught error: ' + e.message + '\n');
    process.exit(1);
  });
}

// END scripts/promote-from-quarantine.mjs — Phase 35 QUAR-05 Plan 35-05

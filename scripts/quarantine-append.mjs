// scripts/quarantine-append.mjs
// Phase 35 Plan 35-04 (QUAR-02) — idempotent quarantine corpus append.
// D-11: upsert by id; existing → stable_runs++, added_iso preserved; new → stable_runs:1.
// D-12: stable_runs >= 3 → gh issue edit --add-label quarantine:ready-for-promotion.
// D-16: atomicWriteJson IMPORTED (not inlined). Pitfall 4: formatEntry fixed key order.
// Exit: 0 success | 1 runtime/path | 2 bad flag.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { atomicWriteJson } from '../tests/e2e/lib/rerun-validator.js';
import {
  filterFindingsForFiling,
  fingerprint,
  topOfStackHashFromTriage,
  sanitizeCaseId,
  makeRealGhClient,
} from './e2e-report-issue.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const ARTIFACTS_ROOT = path.resolve(PROJECT_ROOT, 'tests/e2e/artifacts');
const FIXTURES_ROOT = path.resolve(PROJECT_ROOT, 'tests/e2e/fixtures');
// TEST-ONLY override; ignored in production (never set QUARANTINE_CORPUS_PATH_OVERRIDE in CI).
const CORPUS_PATH = process.env.QUARANTINE_CORPUS_PATH_OVERRIDE
  ? path.resolve(process.env.QUARANTINE_CORPUS_PATH_OVERRIDE)
  : path.resolve(PROJECT_ROOT, 'tests/e2e/test-cases-quarantine.js');
const ALLOWED_INPUT_ROOTS = [ARTIFACTS_ROOT, FIXTURES_ROOT];
const READY_FOR_PROMOTION_LABEL = 'quarantine:ready-for-promotion';
const STABLE_RUNS_THRESHOLD = 3;

// ---------------------------------------------------------------------------
// parseArgs (mirrors e2e-triage-classifier.mjs lines 58-98)
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  let inputPath = null;
  for (let i = 2; i < argv.length; i++) {
    if (argv[i].startsWith('--input=')) {
      process.stderr.write(
        '[quarantine-append] equals syntax not supported for --input; use `--input <value>`\n',
      );
      process.exit(2);
    } else if (argv[i] === '--input') {
      const next = argv[i + 1];
      // WR-04 (Phase 35 review-fix): reject `--input --help` etc. — the next
      // token must be a value, not another flag. Mirrors update-golden.js:68.
      if (next === undefined || next === null || next === '' || next.startsWith('--')) {
        process.stderr.write('[quarantine-append] missing value for --input\n');
        process.exit(2);
      }
      inputPath = next;
      i++;
    } else if (argv[i] === '--help' || argv[i] === '-h') {
      process.stdout.write(
        'Usage: node scripts/quarantine-append.mjs --input <triage-report.json>\n' +
        '\n' +
        'Options:\n' +
        '  --input <path>  Path to triage-report.json; must reside under\n' +
        '                  tests/e2e/artifacts/ or tests/e2e/fixtures/ (WR-05).\n' +
        '                  Sibling llm-report.json + rerun-report.json auto-discovered.\n' +
        '  --help, -h      Show this help message.\n' +
        '\n' +
        'Exit codes: 0 success | 1 runtime/path error | 2 bad flag value\n',
      );
      process.exit(0);
    }
  }
  return { inputPath };
}

// ---------------------------------------------------------------------------
// formatEntry — Pitfall 4: fixed key order for deterministic git diffs
// ---------------------------------------------------------------------------

/**
 * Render one corpus entry with keys in fixed canonical order.
 * Exported for unit testing (Pitfall 4 determinism tests).
 */
export function formatEntry(entry) {
  const lines = [
    '    id: ' + JSON.stringify(entry.id) + ',',
    '    patentFile: ' + JSON.stringify(entry.patentFile) + ',',
    '    selectedText: ' + JSON.stringify(entry.selectedText) + ',',
    '    category: ' + JSON.stringify(entry.category) + ',',
    '    stable_runs: ' + entry.stable_runs + ',',
    '    source_triage_finding_id: ' + JSON.stringify(entry.source_triage_finding_id) + ',',
    '    added_iso: ' + JSON.stringify(entry.added_iso),
  ];
  return '  {\n' + lines.join('\n') + '\n  }';
}

const CORPUS_HEADER =
  '// AUTO-MANAGED by scripts/quarantine-append.mjs (Phase 35 Plan 04) - do not hand-edit.\n';

export function stringifyCorpus(entries) {
  if (entries.length === 0) {
    return CORPUS_HEADER + 'export const TEST_CASES_QUARANTINE = [];\n';
  }
  return (
    CORPUS_HEADER +
    'export const TEST_CASES_QUARANTINE = [\n' +
    entries.map(formatEntry).join(',\n') +
    ',\n];\n'
  );
}

// ---------------------------------------------------------------------------
// upsertQuarantineEntry — idempotent upsert (D-11) + auto-label (D-12)
// ---------------------------------------------------------------------------

/**
 * Read corpus, upsert newEntry by id, write back via atomicWriteJson (D-16).
 *
 * @param {object} newEntry  — { id, patentFile, selectedText, category, source_triage_finding_id }
 * @param {object} [opts]    — { corpusPath?, ghClient?, triageIssueNumber?, now? }
 * @returns {Promise<{ action: 'inserted'|'upserted', entry: object, addedLabel: boolean }>}
 */
export async function upsertQuarantineEntry(newEntry, opts = {}) {
  const corpusPath = opts.corpusPath ?? CORPUS_PATH;
  const ghClient = opts.ghClient ?? null;
  const triageIssueNumber = opts.triageIssueNumber ?? null;
  const now = opts.now ?? (() => new Date());

  // 1. Cache-busted dynamic import for same-process re-reads.
  const url = pathToFileURL(corpusPath).href + '?t=' + Date.now() + '-' + Math.random();
  const { TEST_CASES_QUARANTINE } = await import(url);

  // 2. Own-copy for local mutation.
  const arr = [...TEST_CASES_QUARANTINE];
  const existing = arr.find(e => e.id === newEntry.id);

  let action;
  let finalEntry;

  // 3. Upsert by id.
  if (existing) {
    existing.stable_runs += 1;
    // added_iso NOT mutated — D-11 preserves first-observation timestamp.
    action = 'upserted';
    finalEntry = existing;
  } else {
    const insertEntry = {
      id: newEntry.id,
      patentFile: newEntry.patentFile,
      selectedText: newEntry.selectedText,
      category: newEntry.category,
      stable_runs: 1,
      source_triage_finding_id: newEntry.source_triage_finding_id,
      added_iso: now().toISOString(),
    };
    arr.push(insertEntry);
    action = 'inserted';
    finalEntry = insertEntry;
  }

  // 4. Atomic write (D-16 IMPORT-REUSE — NOT inline).
  atomicWriteJson(corpusPath, stringifyCorpus(arr));

  // 5. D-12: label-add when threshold reached.
  let addedLabel = false;
  if (finalEntry.stable_runs >= STABLE_RUNS_THRESHOLD && ghClient && triageIssueNumber != null) {
    ghClient.addLabel(triageIssueNumber, READY_FOR_PROMOTION_LABEL);
    addedLabel = true;
  }

  return { action, entry: finalEntry, addedLabel };
}

// ---------------------------------------------------------------------------
// main — parseArgs → WR-05 bound → sibling discovery → filter → upsert loop
// ---------------------------------------------------------------------------

async function main(argv = process.argv) {
  const { inputPath: rawInput } = parseArgs(argv);

  if (!rawInput) {
    process.stderr.write('[quarantine-append] --input <path> is required\n');
    process.exit(2);
  }

  // WR-05 path-bounding (T-35-04-01 mitigation).
  const resolvedInputPath = path.resolve(process.cwd(), rawInput);
  const insideAllowedRoot = ALLOWED_INPUT_ROOTS.some(
    (root) => resolvedInputPath === root || resolvedInputPath.startsWith(root + path.sep),
  );
  if (!insideAllowedRoot) {
    process.stderr.write(
      '[quarantine-append] --input must reside under tests/e2e/artifacts/ or ' +
        'tests/e2e/fixtures/; got: ' + resolvedInputPath + '\n',
    );
    process.exit(1);
  }

  if (!fs.existsSync(resolvedInputPath)) {
    process.stderr.write('[quarantine-append] input file not found: ' + resolvedInputPath + '\n');
    process.exit(1);
  }

  // Sibling auto-discovery.
  const dir = path.dirname(resolvedInputPath);
  const llmReportPath = path.join(dir, 'llm-report.json');
  const rerunReportPath = path.join(dir, 'rerun-report.json');

  if (!fs.existsSync(llmReportPath)) {
    process.stderr.write('[quarantine-append] missing sibling: ' + llmReportPath + '\n');
    process.exit(1);
  }
  if (!fs.existsSync(rerunReportPath)) {
    process.stderr.write('[quarantine-append] missing sibling: ' + rerunReportPath + '\n');
    process.exit(1);
  }

  const triageReport = JSON.parse(fs.readFileSync(resolvedInputPath, 'utf8'));
  const llmReport = JSON.parse(fs.readFileSync(llmReportPath, 'utf8'));
  const rerunReport = JSON.parse(fs.readFileSync(rerunReportPath, 'utf8'));

  const rerunByIter = new Map((rerunReport.replays ?? []).map(r => [r.iteration_n, r]));
  const llmByIter = new Map((llmReport.iterations ?? []).map(i => [i.iteration_n, i]));
  const filtered = filterFindingsForFiling(triageReport.findings ?? [], rerunByIter, llmByIter);

  const ghClient = makeRealGhClient(process.env.GITHUB_REPOSITORY ?? 'unknown/unknown');

  let insertedCount = 0;
  let upsertedCount = 0;
  let labelsAddedCount = 0;

  for (const finding of filtered) {
    const iter = llmByIter.get(finding.iteration_n);
    const rerunEntry = rerunByIter.get(finding.iteration_n) ?? null;

    const caseId = iter.case_id ?? iter.llm_selection?.patentId ?? null;
    if (!caseId) {
      process.stderr.write(
        '[quarantine-append] skipping iter=' + finding.iteration_n + ' — no case_id\n',
      );
      continue;
    }

    let safeId;
    try {
      safeId = sanitizeCaseId(caseId);
    } catch (err) {
      process.stderr.write('[quarantine-append] skipping invalid id: ' + err.message + '\n');
      continue;
    }

    const fpV2 = fingerprint(
      safeId,
      finding.category,
      topOfStackHashFromTriage(finding, rerunEntry, iter),
    );
    const issues = ghClient.listOpenWithSearch('<!-- fp: ' + fpV2 + ' -->');
    const triageIssueNumber = issues[0]?.number ?? null;

    const newEntry = {
      id: safeId,
      patentFile: './tests/fixtures/' + safeId.split('-')[0] + '.json',
      selectedText: iter.llm_selection?.selectedText ?? '',
      // WR-01 (Phase 35 review-fix): llm-report iteration schema has
      // `classification` (an ERROR_CLASS), not `category` — `iter.category`
      // was always undefined and the `iter.classification` fallback wrote
      // ERROR_CLASS strings (e.g. 'WRONG_CITATION') into the corpus's
      // `category` field, which Phase 36 Playwright wiring won't recognize
      // (test categories are 'claims' | 'modern-short' | etc.). Use
      // `finding.category` as the single source — the triage classifier
      // already populates this with the correct ERROR_CLASS-shaped value
      // for the quarantine corpus per CONTEXT D-10.
      category: finding.category ?? 'UNCLASSIFIED',
      source_triage_finding_id: triageReport.run_id
        ? triageReport.run_id + '-iter-' + finding.iteration_n
        : 'manual-iter-' + finding.iteration_n,
    };

    const result = await upsertQuarantineEntry(newEntry, {
      corpusPath: CORPUS_PATH,
      ghClient,
      triageIssueNumber,
    });

    process.stdout.write(
      '[quarantine-append] ' + result.action + ' id=' + safeId +
        ' stable_runs=' + result.entry.stable_runs +
        (result.addedLabel ? ' label=added' : '') + '\n',
    );

    if (result.action === 'inserted') insertedCount++;
    else upsertedCount++;
    if (result.addedLabel) labelsAddedCount++;
  }

  process.stdout.write(
    '[quarantine-append] processed ' + filtered.length + ' findings: ' +
      insertedCount + ' inserted, ' + upsertedCount + ' upserted, ' +
      labelsAddedCount + ' labels added\n',
  );
  process.exit(0);
}

// ---------------------------------------------------------------------------
// isMain guard (WR-02: fileURLToPath + path.resolve for Windows compat)
// ---------------------------------------------------------------------------

const isMain =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  main().catch((e) => {
    process.stderr.write('[quarantine-append] uncaught error: ' + e.message + '\n');
    process.exit(1);
  });
}

// END scripts/quarantine-append.mjs — Phase 35 QUAR-02 Plan 35-04

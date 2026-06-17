#!/usr/bin/env node
//
// scripts/ingest-reports.mjs — Maintainer-triggered orchestrator for the v6.1 triage layer.
//
// Reads open BUG_REPORTS KV records (via review-reports.mjs), classifies each with the
// heuristic classifier (report-classifier.mjs), applies post-fix suppression, auto-promotes
// real bugs to report-fix-candidate GitHub Issues, and emits a per-run triage-report JSON
// artifact. Also supports a `promote <fp> <ts>` subcommand for manual promotion (D-06/PROMO-02).
//
// Usage:
//   node scripts/ingest-reports.mjs [list]               # classify + auto-promote open reports (default)
//   node scripts/ingest-reports.mjs promote <fp> <ts>    # force-promote any record (bypasses status filter)
//
// Flags:
//   --namespace-id <id>   override wrangler.toml KV namespace id
//   --json                print structured JSON to stdout
//   --dry-run             classify + artifact but NO gh creates and NO KV writes
//   --force               (promote subcommand) skip status-open check (default in promote)
//   --max-fixes <n>       override MAX_FIXES_PER_RUN cap for this run
//   -h / --help           show this message
//
// ING-02: All KV I/O delegated to review-reports.mjs — NO inline wrangler shell-out here.
// T-11-04: console.log emits only fingerprint/category/patentNumber/classification — never note/selectionText/errorLog.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  getNamespaceId,
  filterReports,
  sortReports,
  loadReports,
  writeStatus,
  getRecord,
  reviewStatus,
} from './review-reports.mjs';

import {
  classifyReport,
  GOLDEN_PATENTS,
  QUARANTINE_PATENTS,
  MAX_FIXES_PER_RUN,
  POST_FIX_SUPPRESS_DAYS,
} from './report-classifier.mjs';

import { makeKvReportGhClient } from './gh-client.mjs';

// ---------------------------------------------------------------------------
// Module-level constants
// ---------------------------------------------------------------------------

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER_DIR = join(HERE, '..', 'worker');   // used ONLY to read wrangler.toml for getNamespaceId
const TRIAGE_REPORTS_DIR = join(HERE, '..', '.triage-reports');

const HELP = `ingest-reports — classify + triage BUG_REPORTS KV (v6.1)

  node scripts/ingest-reports.mjs [list]               classify + auto-promote open reports (default)
  node scripts/ingest-reports.mjs promote <fp> <ts>    force-promote any record (bypasses status filter)

Flags:
  --namespace-id <id>   override wrangler.toml KV namespace id
  --json                print structured JSON to stdout
  --dry-run             classify + artifact but NO gh creates and NO KV writes
  --force               (promote) skip status-open check (default behaviour of promote)
  --max-fixes <n>       per-run auto-promotion cap (default: MAX_FIXES_PER_RUN env / 5)
  -h / --help           show this message
`;

// ---------------------------------------------------------------------------
// Exported pure helpers (for tests)
// ---------------------------------------------------------------------------

/**
 * Parse CLI argv into a structured args object.
 *
 * Commands: 'list' (default) | 'promote'
 * Positionals: fp + ts for promote subcommand
 *
 * @param {string[]} argv
 * @returns {{ command: string, positionals: string[], namespaceId: string|null,
 *             json: boolean, dryRun: boolean, force: boolean, maxFixes: number|null, help: boolean }}
 */
export function parseArgs(argv) {
  const out = {
    command: 'list',
    positionals: [],
    namespaceId: null,
    json: false,
    dryRun: false,
    force: false,
    maxFixes: null,
    help: false,
  };
  const rest = [...argv];
  if (rest[0] && !rest[0].startsWith('-')) out.command = rest.shift();
  while (rest.length) {
    const a = rest.shift();
    switch (a) {
      case '-h': case '--help': out.help = true; break;
      case '--json': out.json = true; break;
      case '--dry-run': out.dryRun = true; break;
      case '--force': out.force = true; break;
      case '--namespace-id': out.namespaceId = rest.shift(); break;
      case '--max-fixes': out.maxFixes = Number(rest.shift()); break;
      default:
        if (a.startsWith('-')) throw new Error(`Unknown option: ${a}`);
        out.positionals.push(a);
    }
  }
  return out;
}

/**
 * Build a human-readable GitHub Issue title for a bug report (PROMO-01).
 *
 * @param {object} record
 * @returns {string}
 */
export function buildReportIssueTitle(record) {
  return `Bug report: ${record.patentNumber} (${record.category})`;
}

/**
 * Build the D-10 human-readable GitHub Issue body.
 *
 * - selectionText line is ENTIRELY ABSENT when record.selectionText == null (Pitfall 7 / D-10)
 * - D-02 golden-corpus note when inGoldenCorpus
 * - quarantine note when inQuarantineCorpus
 * - User note line only when record.note is non-empty
 * - Trailing <!-- kv-key: ... --> pointer for Phase 12 dedup
 *
 * @param {object} record
 * @param {{ classification: string, rationale: string, kvKey: string,
 *           inGoldenCorpus: boolean, inQuarantineCorpus: boolean }} opts
 * @returns {string}
 */
export function buildReportIssueBody(record, {
  classification,
  rationale,
  kvKey,
  inGoldenCorpus,
  inQuarantineCorpus,
}) {
  // CR-01: Break the HTML-comment opener in all attacker-controlled free-text fields
  // so a forged <!-- kv-key: ... --> marker cannot appear in the rendered/raw body.
  // Code-fence wrapping alone is insufficient — findExistingIssueByKvKey matches
  // body.includes(marker) against the raw string regardless of Markdown context.
  const safe = (s) => String(s).replaceAll('<!--', '< !--');

  const lines = [
    `## Bug report: ${record.patentNumber} (${record.category})`,
    '',
    '| Field | Value |',
    '|-------|-------|',
    `| Patent | \`${record.patentNumber}\` |`,
    `| Category | \`${record.category}\` |`,
    `| Confidence tier | \`${record.confidenceTier ?? '(none)'}\` |`,
    `| Returned citation | \`${record.returnedCitation != null ? safe(record.returnedCitation) : '(none)'}\` |`,
    `| Classification | \`${classification}\` |`,
    '',
    `**Triage rationale:** ${rationale}`,
    '',
    // D-10/Pitfall 7: selectionText ONLY when present as a key (not null).
    // Wrapped in a code fence to prevent Markdown/HTML injection (matching e2e pattern T-29-02-2).
    record.selectionText != null
      ? `**Selected text:**\n\n\`\`\`\n${safe(record.selectionText)}\n\`\`\``
      : null,
    // D-02: golden corpus note — exact string required
    inGoldenCorpus ? '> **Note:** patent in golden corpus — protect the existing golden case' : null,
    inQuarantineCorpus ? '> **Note:** Patent is in the quarantine corpus.' : null,
    // User note: only when non-empty. Fenced to prevent injection (CR-01).
    (record.note && record.note.trim())
      ? `**User note:**\n\n\`\`\`\n${safe(record.note)}\n\`\`\``
      : null,
    '',
    `<!-- kv-key: ${kvKey} -->`,
  ].filter(line => line !== null);

  return lines.join('\n');
}

/**
 * Build a TRI-07 artifact entry for one processed report.
 *
 * MUST NOT include selectionText, note, or xpathNode (T-11-04 privacy).
 *
 * @param {object} record
 * @param {{ classification: string, ruleName: string, rationale: string,
 *           inGoldenCorpus: boolean, inQuarantineCorpus: boolean }} classifyResult
 * @param {{ promotionSource: string, promotionDecision: string,
 *           issueNumber: number|null, suppressed: boolean,
 *           kvStatusWritten: string|null }} opts
 * @returns {object}
 */
export function buildArtifactEntry(record, classifyResult, {
  promotionSource = null,
  promotionDecision = 'skip',
  issueNumber = null,
  suppressed = false,
  kvStatusWritten = null,
} = {}) {
  const kvKey = `report:${record.fingerprint}:${record.timestamp}`;
  return {
    fingerprint: record.fingerprint,
    kv_key: kvKey,
    patent_number: record.patentNumber,
    category: record.category,
    classification: classifyResult.classification,
    rule_name: classifyResult.ruleName,
    rationale: classifyResult.rationale,
    in_golden_corpus: classifyResult.inGoldenCorpus,
    in_quarantine_corpus: classifyResult.inQuarantineCorpus,
    promotion_decision: promotionDecision,
    promotion_source: promotionSource,
    github_issue_number: issueNumber,
    suppressed_by_post_fix: suppressed,
    kv_status_written: kvStatusWritten,
    processed_at: new Date().toISOString(),
    // Privacy: selectionText, note, xpathNode intentionally excluded (T-11-04)
  };
}

/**
 * Promote one record to a report-fix-candidate GitHub Issue (D-05 ordering).
 *
 * D-05 ordering:
 *   1. Construct canonical kvKey from record.fingerprint + record.timestamp (Pitfall 2)
 *   2. findExistingIssueByKvKey FIRST (GitHub dedup check)
 *   3. If found → skip create, still writeStatus 'triaged' (self-heal), return skip-dedup entry
 *   4. If not found → createIssueWithLabels(['report-fix-candidate'])
 *   5. ONLY on create success → writeStatus 'triaged' (T-11-06)
 *
 * @param {string}  nsId
 * @param {object}  record
 * @param {object}  classifyResult
 * @param {string}  promotionSource  'auto' | 'manual'
 * @param {object}  ghClient
 * @param {{ dryRun?: boolean, writeStatusFn?: Function }} [opts]  injectable for tests
 * @returns {object}  artifact entry
 */
export async function promoteRecord(nsId, record, classifyResult, promotionSource, ghClient, {
  dryRun = false,
  writeStatusFn = writeStatus,
} = {}) {
  // Step 1: canonical kv-key — MUST use record.fingerprint + record.timestamp (Pitfall 2)
  const kvKey = `report:${record.fingerprint}:${record.timestamp}`;

  // Step 2: find existing Issue FIRST (D-05)
  const existing = await Promise.resolve(ghClient.findExistingIssueByKvKey(kvKey));

  if (existing) {
    // Issue already exists — self-heal KV status, skip create (ING-03 idempotency)
    if (!dryRun) {
      writeStatusFn(nsId, record.fingerprint, String(record.timestamp), 'triaged');
    }
    return buildArtifactEntry(record, classifyResult, {
      promotionSource,
      promotionDecision: 'skip-dedup',
      issueNumber: existing.number,
      suppressed: false,
      kvStatusWritten: dryRun ? null : 'triaged',
    });
  }

  if (dryRun) {
    return buildArtifactEntry(record, classifyResult, {
      promotionSource,
      promotionDecision: 'dry-run',
      issueNumber: null,
      suppressed: false,
      kvStatusWritten: null,
    });
  }

  // Step 4: create the Issue FIRST (D-05)
  const title = buildReportIssueTitle(record);
  const body = buildReportIssueBody(record, {
    classification: classifyResult.classification,
    rationale: classifyResult.rationale,
    kvKey,
    inGoldenCorpus: classifyResult.inGoldenCorpus,
    inQuarantineCorpus: classifyResult.inQuarantineCorpus,
  });

  const issue = ghClient.createIssueWithLabels(title, body, ['report-fix-candidate']); // Step 4

  // Step 5: writeStatus ONLY after create succeeds (T-11-06)
  writeStatusFn(nsId, record.fingerprint, String(record.timestamp), 'triaged');

  return buildArtifactEntry(record, classifyResult, {
    promotionSource,
    promotionDecision: promotionSource === 'manual' ? 'manual' : 'auto',
    issueNumber: issue?.number ?? null,
    suppressed: false,
    kvStatusWritten: 'triaged',
  });
}

// ---------------------------------------------------------------------------
// Main orchestrator
// ---------------------------------------------------------------------------

async function main(argv) {
  const args = parseArgs(argv);
  if (args.help) { process.stdout.write(HELP); return; }

  const maxFixes = args.maxFixes ?? MAX_FIXES_PER_RUN;

  // Resolve namespace ID
  const nsId = args.namespaceId
    || getNamespaceId(readFileSync(join(WORKER_DIR, 'wrangler.toml'), 'utf8'));

  // Instantiate gh client (uses process.env.GITHUB_REPOSITORY)
  const ghClient = makeKvReportGhClient(process.env.GITHUB_REPOSITORY);

  const artifactEntries = [];

  // ─── promote subcommand (PROMO-02: bypass status filter entirely) ───────
  if (args.command === 'promote') {
    const [fp, ts] = args.positionals;
    if (!fp || !ts) throw new Error('Usage: promote <fingerprint> <timestamp>');

    // Fetch by canonical kv-key — bypasses status === 'open' filter (D-06)
    const record = getRecord(nsId, `report:${fp}:${ts}`);
    if (!record) throw new Error(`Record not found: report:${fp}:${ts}`);

    const classifyResult = classifyReport(record, {
      goldenPatents: GOLDEN_PATENTS,
      quarantinePatents: QUARANTINE_PATENTS,
    });

    // T-11-04: log only safe fields
    console.log(`[promote] fp=${fp} patent=${record.patentNumber} category=${record.category} classification=${classifyResult.classification}`);

    const entry = await promoteRecord(nsId, record, classifyResult, 'manual', ghClient, {
      dryRun: args.dryRun,
    });

    artifactEntries.push(entry);
    emitArtifact(artifactEntries);
    process.stdout.write(JSON.stringify(artifactEntries, null, 2) + '\n');
    return;
  }

  // ─── list (default) ──────────────────────────────────────────────────────
  if (args.command !== 'list') throw new Error(`Unknown command: ${args.command}\n\n${HELP}`);

  const allReports = loadReports(nsId);
  const openReports = filterReports(allReports, { status: 'open' });
  const sorted = sortReports(openReports);

  let autoPromotedCount = 0;

  for (const record of sorted) {
    const classifyResult = classifyReport(record, {
      goldenPatents: GOLDEN_PATENTS,
      quarantinePatents: QUARANTINE_PATENTS,
    });

    const { classification } = classifyResult;

    // T-11-04: only log safe fields
    console.log(`[ingest] fp=${record.fingerprint?.slice(0, 8)} patent=${record.patentNumber} category=${record.category} classification=${classification}`);

    if (classification === 'real_bug') {
      // Check post-fix suppression first (D-07/D-08)
      const suppressed = ghClient.isPostFixSuppressed(record.patentNumber, POST_FIX_SUPPRESS_DAYS);

      if (suppressed) {
        // Suppressed: no Issue created, write wontfix (D-07)
        if (!args.dryRun) {
          writeStatus(nsId, record.fingerprint, String(record.timestamp), 'wontfix');
        }
        artifactEntries.push(buildArtifactEntry(record, classifyResult, {
          promotionSource: null,
          promotionDecision: 'skip-suppressed',
          issueNumber: null,
          suppressed: true,
          kvStatusWritten: args.dryRun ? null : 'wontfix',
        }));
        continue;
      }

      // Under the per-run cap? (COST-02)
      if (autoPromotedCount >= maxFixes) {
        artifactEntries.push(buildArtifactEntry(record, classifyResult, {
          promotionSource: null,
          promotionDecision: 'skip-cap',
          issueNumber: null,
          suppressed: false,
          kvStatusWritten: null,
        }));
        continue;
      }

      // Auto-promote (D-05)
      const entry = await promoteRecord(nsId, record, classifyResult, 'auto', ghClient, {
        dryRun: args.dryRun,
      });

      artifactEntries.push(entry);
      if (!args.dryRun && entry.promotion_decision !== 'skip-dedup') {
        autoPromotedCount++;
      }

    } else if (classification === 'noise' || classification === 'user_error' || classification === 'infrastructure') {
      // Skip (wontfix)
      if (!args.dryRun) {
        writeStatus(nsId, record.fingerprint, String(record.timestamp), 'wontfix');
      }
      artifactEntries.push(buildArtifactEntry(record, classifyResult, {
        promotionSource: null,
        promotionDecision: 'skip-wontfix',
        issueNumber: null,
        suppressed: false,
        kvStatusWritten: args.dryRun ? null : 'wontfix',
      }));

    } else {
      // ambiguous / duplicate — leave status, record decision 'skip'
      artifactEntries.push(buildArtifactEntry(record, classifyResult, {
        promotionSource: null,
        promotionDecision: 'skip',
        issueNumber: null,
        suppressed: false,
        kvStatusWritten: null,
      }));
    }
  }

  // Emit artifact (always, even on partial failure paths — TRI-07)
  emitArtifact(artifactEntries);

  // ING-01: print structured JSON of processed reports to stdout
  process.stdout.write(JSON.stringify(artifactEntries, null, 2) + '\n');
}

// ---------------------------------------------------------------------------
// Artifact writer (D-11)
// ---------------------------------------------------------------------------

function emitArtifact(entries) {
  mkdirSync(TRIAGE_REPORTS_DIR, { recursive: true });
  // CI: fixed name for upload-artifact (process.env.CI is set by GitHub Actions)
  const outPath = process.env.CI
    ? join(TRIAGE_REPORTS_DIR, 'triage-report.json')
    : join(TRIAGE_REPORTS_DIR, `triage-report-${Date.now()}.json`);
  writeFileSync(outPath, JSON.stringify(entries, null, 2));
}

// ---------------------------------------------------------------------------
// CLI guard — copy verbatim from review-reports.mjs lines 231-238 (fileURLToPath form)
// ---------------------------------------------------------------------------

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    console.error(`✖ ${err.message}`);
    process.exit(1);
  }
}

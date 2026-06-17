// scripts/e2e-report-issue.mjs
//
// Phase 29 (CRON-04, CRON-05) — issue filer with fingerprint-based dedup.
// Phase 35 (ISSUE-02, ISSUE-03) — extended with --source triage + dual-search.
// Phase 36 (QUAR-04/D-15) — --source quarantine reuses processReport with the e2e-quarantine label.
//
// Reads tests/e2e/artifacts/${PLAYWRIGHT_RUN_ID}/report.json (RPT-01 shape)
// and for each failed-non-FLAKE case either opens a new GitHub issue or
// comments on an existing one matching the fingerprint.
//
// Phase 35 adds: --source triage + --triage-report <path> flags; exports
// topOfStackHashFromTriage, findMatchingIssueDual, filterFindingsForFiling,
// processTriageReport; and extends makeRealGhClient with createIssueWithLabels,
// listOpenWithSearch, and addLabel.
//
// Pure functions exported for unit testing; CLI shim at bottom invokes
// the real gh CLI via execSync.
//
// Threat model (T-29-02, T-35-03):
//   T-29-02-1: sanitizeCaseId() validates case IDs against a regex; processReport
//              skips cases that fail validation.
//   T-29-02-2: verifier_verdict.reason is wrapped in a fenced code block so any
//              markdown injection is rendered as code.
//   T-29-02-5: gh api ... --paginate used unconditionally (no page-2 misses).
//   T-35-03-01: WR-05 ALLOWED_INPUT_ROOTS bounds --triage-report path.
//   T-35-03-03: listOpenWithSearch shell-escapes query via replaceAll("'", "'\\''").
//   T-35-03-04: createIssueWithLabels shell-escapes label values via replaceAll('"', '\\"').
//   T-35-03-05: findMatchingIssueDual runs BOTH searches unconditionally (Pitfall 3).
//   T-35-03-06: filterFindingsForFiling excludes HARNESS_ERROR + *_parse_error (Pitfall 8).

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIssuePayload } from '../tests/e2e/lib/issue-payload-builder.js';
import { ERROR_CLASSES } from '../tests/e2e/lib/error-codes.js';
import { makeKvReportGhClient } from './gh-client.mjs';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const MAX_RECENT_DAYS = 7;
const NIGHTLY_LABEL = 'e2e-nightly';

// Phase 36 CR-01: the quarantine spec writes its per-case report to a
// DISTINCT file (quarantine-report.json) so the --source quarantine filer
// never sees regression/fault-injection cases from the shared report.json.
// Phase 38 INT-FIX-01: tests/e2e/specs/quarantine.spec.js imports this
// constant directly — single source of truth, no dual-source rename risk.
export const QUARANTINE_REPORT_FILENAME = 'quarantine-report.json';

// Validation regex for case IDs (T-29-02-1 mitigation).
// Allows: patent case IDs like US11427642-spec-short-1, US4723129-claims-1
// AND pre-flight synthetic IDs like PRE-FLIGHT-CAPTCHA, PRE-FLIGHT-DOM-DRIFT.
const CASE_ID_RE = /^[A-Z]{2,}\d+[A-Z]?\d*-[a-z0-9-]+$|^PRE-FLIGHT-[A-Z-]+$/;

// Phase 35 — WR-05 path-bounding for --triage-report (T-35-03-01).
// Mirrors scripts/e2e-triage-classifier.mjs lines 30-40.
const __scriptDir = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__scriptDir, '..');
const ARTIFACTS_ROOT = path.resolve(PROJECT_ROOT, 'tests/e2e/artifacts');
const FIXTURES_ROOT = path.resolve(PROJECT_ROOT, 'tests/e2e/fixtures');
const ALLOWED_INPUT_ROOTS = [ARTIFACTS_ROOT, FIXTURES_ROOT];

// ---------------------------------------------------------------------------
// Pure exported functions (testable without real gh CLI)
// ---------------------------------------------------------------------------

/**
 * Compute a 12-hex-char fingerprint for a case failure.
 *
 * @param {string} caseId
 * @param {string} errorClass
 * @param {string|null} topOfStackHash
 * @returns {string} 12-char hex sha256 prefix
 */
export function fingerprint(caseId, errorClass, topOfStackHash) {
  const input = `${caseId}|${errorClass}|${topOfStackHash || ''}`;
  return createHash('sha256').update(input).digest('hex').substring(0, 12);
}

/**
 * Derive a stable "stack hash" proxy from a case's verifier_verdict.reason.
 * This is the CRON-05 topOfStackHash proxy for cases without a real JS stack
 * (e.g. VERIFIER_DISAGREE cases where the error class comes from the verifier,
 * not a thrown exception). See 29-RESEARCH.md Open Question 3 (RESOLVED).
 *
 * Returns null when no reason is available (fingerprint uses empty string).
 *
 * @param {object} caseEntry
 * @returns {string|null}
 */
export function topOfStackHashFromCase(caseEntry) {
  const reason = caseEntry?.verifier_verdict?.reason;
  if (!reason || typeof reason !== 'string') return null;
  // Truncate to 200 chars for stability across minor reason-text variations.
  return createHash('sha256')
    .update(reason.slice(0, 200))
    .digest('hex')
    .substring(0, 12);
}

/**
 * Phase 35 (D-08) — derive a stable "stack hash" from a triage finding's
 * rationale, verifier status, and LLM classification.
 *
 * Inputs (3-field JSON stringify):
 *   rationale_first_30_chars — first 30 chars of finding.rationale (stable signal)
 *   verifier_status           — rerunEntry.original_verdict_status (pass/fail/null)
 *   classification            — iteration.classification (WRONG_CITATION etc.)
 *
 * Same finding/rerun/iteration always produces the same 12-hex (deterministic).
 * null rerunEntry is safe — substitutes null per ?? operator.
 *
 * @param {object} finding    — Phase 34 triage finding
 * @param {object|null} rerunEntry — Phase 33 rerun replay entry (null = NOT_REPLAYABLE)
 * @param {object} iteration  — Phase 33 llm-report iteration
 * @returns {string} 12-char hex sha256 prefix
 */
export function topOfStackHashFromTriage(finding, rerunEntry, iteration) {
  const input = JSON.stringify({
    rationale_first_30_chars: (finding.rationale ?? '').slice(0, 30),
    verifier_status: rerunEntry?.original_verdict_status ?? null,
    classification: iteration.classification ?? null,
  });
  return createHash('sha256').update(input).digest('hex').substring(0, 12);
}

/**
 * Validate and return a case ID, or throw if the ID contains shell
 * metacharacters or markdown injection patterns (T-29-02-1 mitigation).
 *
 * @param {string} id
 * @returns {string} the validated id
 * @throws {Error} if id is invalid
 */
export function sanitizeCaseId(id) {
  if (typeof id !== 'string') {
    throw new Error(`sanitizeCaseId: expected string, got ${typeof id}`);
  }
  if (!CASE_ID_RE.test(id)) {
    throw new Error(
      `sanitizeCaseId: id "${id}" failed validation regex ${CASE_ID_RE}`
    );
  }
  return id;
}

/**
 * Filter a report's cases to the subset the issue filer must act on:
 *   - status === 'failed' AND errorClass is non-null AND errorClass !== 'FLAKE'
 *   - Cases with status === 'skipped' are always excluded
 *   - Cases with status === 'passed' and no errorClass are excluded
 *
 * @param {Array<object>} cases — array of RPT-01 case entries
 * @returns {Array<object>}
 */
export function filterCasesForFiling(cases) {
  if (!Array.isArray(cases)) return [];
  return cases.filter(c => {
    // Never file for skipped cases
    if (c.status === 'skipped') return false;
    // Never file for FLAKE — transient failures are noise, not signal
    if (c.errorClass === 'FLAKE') return false;
    // Never file for passed cases with no error class
    if (c.status === 'passed' && !c.errorClass) return false;
    // File for failed cases with an error class set
    if (c.status === 'failed' && c.errorClass) return true;
    // File for failed cases without an error class (catch-all for unclassified)
    if (c.status === 'failed') return true;
    return false;
  });
}

/**
 * Phase 35 (D-05 / Pitfall 8) — filter triage findings to the subset that
 * should be filed as GitHub issues.
 *
 * CONFIRMED predicate: severity in {critical, high} OR rerun verdict === 'CONFIRMED'
 * PITFALL 8: ALWAYS exclude HARNESS_ERROR and *_parse_error findings, even at
 * critical severity or CONFIRMED rerun status. These are harness noise, not bugs.
 *
 * @param {Array<object>} findings    — triageReport.findings[]
 * @param {Map<number,object>} rerunByIter — iteration_n → rerun replay entry
 * @param {Map<number,object>} llmByIter  — iteration_n → llm-report iteration
 * @returns {Array<object>} filtered findings
 */
export function filterFindingsForFiling(findings, rerunByIter, llmByIter) {
  if (!Array.isArray(findings)) return [];
  return findings.filter(f => {
    const rerun = rerunByIter.get(f.iteration_n);
    const iter = llmByIter.get(f.iteration_n);
    // Reject if no matching LLM iteration found (defensive)
    if (!iter) return false;
    const isConfirmed = ['critical', 'high'].includes(f.severity)
                      || rerun?.verdict === 'CONFIRMED';
    // Pitfall 8: HARNESS_ERROR and *_parse_error are harness noise — never file
    const isHarnessNoise = f.category === 'HARNESS_ERROR'
                         || (f.path_taken ?? '').endsWith('_parse_error');
    return isConfirmed && !isHarnessNoise;
  });
}

/**
 * Build the GitHub issue title.
 *
 * Format: [e2e-nightly] {caseId}: {errorClass}
 *
 * @param {object} caseEntry
 * @returns {string}
 */
export function buildIssueTitle(caseEntry) {
  const id = sanitizeCaseId(caseEntry.id);
  const cls = caseEntry.errorClass || 'UNCLASSIFIED';
  return `[e2e-nightly] ${id}: ${cls}`;
}

/**
 * Build the GitHub issue body markdown.
 *
 * The fingerprint is embedded twice:
 *   1. Visibly in the table row (for human readers)
 *   2. As a hidden HTML comment `<!-- fingerprint: {fp} -->` (the dedup grep target)
 *
 * verifier_verdict.reason is wrapped in a fenced code block to prevent
 * markdown injection (T-29-02-2 mitigation).
 *
 * @param {object} caseEntry — RPT-01 case entry
 * @param {object} opts
 * @param {string} opts.fingerprint — 12-char hex fingerprint
 * @param {string} opts.runId — GitHub Actions run ID
 * @param {string} opts.repo — "owner/repo" string
 * @returns {string}
 */
export function buildIssueBody(caseEntry, { fingerprint: fp, runId, repo }) {
  const id = sanitizeCaseId(caseEntry.id);
  const cls = caseEntry.errorClass || 'UNCLASSIFIED';
  const verdict = caseEntry.verifier_verdict;
  const verdictLine = verdict
    ? `${verdict.status} (tier ${verdict.tier_used || 'n/a'})`
    : 'n/a';
  // Wrap reason in a fenced code block — prevents any markdown formatting in
  // the reason string from being rendered as headers, links, etc. (T-29-02-2).
  const reason = (verdict?.reason || '').slice(0, 1000);
  const artifactUrl = `https://github.com/${repo}/actions/runs/${runId}`;

  return [
    `## E2E nightly failure: ${id}`,
    '',
    '| Field | Value |',
    '|-------|-------|',
    `| Patent | \`${id}\` |`,
    `| Error class | \`${cls}\` |`,
    `| Verifier verdict | ${verdictLine} |`,
    `| Citation | \`${caseEntry.citation || 'n/a'}\` |`,
    `| Fingerprint | \`${fp}\` |`,
    `| Artifact bundle | [Run #${runId}](${artifactUrl}) |`,
    '',
    '**Verifier reason:**',
    '',
    '```',
    reason,
    '```',
    '',
    `<!-- fingerprint: ${fp} -->`,
  ].join('\n');
}

/**
 * Return true if the issue was updated within MAX_RECENT_DAYS days.
 *
 * Uses updated_at (not created_at) so issues that received recent comments
 * are treated as active — prevents creating a new issue when the same failure
 * is still being tracked.
 *
 * @param {object|null} issue
 * @returns {boolean}
 */
export function isRecentlyUpdated(issue) {
  if (!issue?.updated_at) return false;
  const updated = new Date(issue.updated_at).getTime();
  const threshold = Date.now() - MAX_RECENT_DAYS * 24 * 3600 * 1000;
  return updated >= threshold;
}

/**
 * Find the first open issue whose body contains the hidden fingerprint comment.
 *
 * @param {Array<object>|null} issues — array of GitHub issue objects
 * @param {string} fp — 12-char fingerprint
 * @returns {object|null} matching issue or null
 */
export function findMatchingIssue(issues, fp) {
  if (!Array.isArray(issues) || !fp) return null;
  const marker = `<!-- fingerprint: ${fp} -->`;
  return issues.find(i => typeof i.body === 'string' && i.body.includes(marker)) || null;
}

/**
 * Phase 35 (D-07 / Pitfall 3) — dual-search across v1 and v2 fingerprint formulas.
 *
 * Searches GitHub issues using BOTH the v1 fingerprint marker (legacy Phase 29 format:
 * `<!-- fingerprint: {fp} -->`) AND the v2 marker (D-02 format: `<!-- fp: {fp} -->`).
 *
 * CRITICAL: Both searches execute UNCONDITIONALLY — no short-circuit (Pitfall 3).
 * The v1 search must always run so Phase 29 issues are never re-filed under Phase 35.
 *
 * @param {object} ghClient — { listOpenWithSearch(query): issue[] }
 * @param {string} fpV1     — v1 fingerprint (fingerprint(caseId, errorClass, ''))
 * @param {string} fpV2     — v2 fingerprint (fingerprint(caseId, errorClass, topOfStackHash))
 * @returns {object|null} first matching issue or null
 */
export function findMatchingIssueDual(ghClient, fpV1, fpV2) {
  const markerV1 = `<!-- fingerprint: ${fpV1} -->`;
  const markerV2 = `<!-- fp: ${fpV2} -->`;
  // Both calls are UNCONDITIONAL — Pitfall 3 mitigation. Do NOT short-circuit.
  const issuesV1 = ghClient.listOpenWithSearch(markerV1) ?? [];
  const issuesV2 = ghClient.listOpenWithSearch(markerV2) ?? [];
  const all = [...issuesV1, ...issuesV2];
  const match = all.find(
    i => typeof i.body === 'string' && (i.body.includes(markerV1) || i.body.includes(markerV2))
  );
  return match || null;
}

/**
 * Phase 35 (ISSUE-02) — main entrypoint for --source triage.
 *
 * For each CONFIRMED, non-HARNESS triage finding:
 *   1. Build v1 + v2 fingerprints
 *   2. Dual-search for existing issue (dedup)
 *   3. If new: call buildIssuePayload + createIssueWithLabels
 *
 * @param {object} triageReport   — Phase 34 triage-report.json
 * @param {object} rerunReport    — Phase 33 rerun-report.json
 * @param {object} llmReport      — Phase 33 llm-report.json
 * @param {object|null} goldenBaseline — tests/golden/baseline.json (null = not found)
 * @param {object} opts
 * @param {object} opts.ghClient  — { listOpenWithSearch, createIssueWithLabels }
 * @param {string} opts.runId     — GitHub Actions run ID
 * @param {string} opts.repo      — "owner/repo" string
 */
export function processTriageReport(triageReport, rerunReport, llmReport, goldenBaseline, { ghClient, runId, repo }) {
  // Build lookup maps
  const rerunByIter = new Map(
    (rerunReport?.replays ?? []).map(r => [r.iteration_n, r])
  );
  const llmByIter = new Map(
    (llmReport?.iterations ?? []).map(i => [i.iteration_n, i])
  );

  const filtered = filterFindingsForFiling(
    triageReport?.findings ?? [],
    rerunByIter,
    llmByIter
  );

  for (const finding of filtered) {
    const iter = llmByIter.get(finding.iteration_n);
    const rerunEntry = rerunByIter.get(finding.iteration_n) ?? null;

    // CR-01: sanitize caseId before any shell interpolation (matches Phase 29
    // regression path's sanitizeCaseId call at processReport line 409).
    // The triage path previously skipped this control, allowing backticks /
    // $() in iter.case_id or iter.llm_selection?.patentId to flow into the
    // gh execSync title string via buildIssuePayload.
    const rawCaseId = iter.case_id ?? iter.llm_selection?.patentId ?? 'UNKNOWN';
    let caseId;
    try {
      caseId = sanitizeCaseId(rawCaseId);
    } catch (err) {
      console.warn(
        `[e2e-report-issue] skipping triage finding (iter=${finding.iteration_n}): invalid case_id "${rawCaseId}" — ${err.message}`
      );
      continue;
    }

    // CR-01: clamp category to the closed ERROR_CLASSES taxonomy. Phase 35
    // findings may carry arbitrary strings in finding.category; clamping
    // prevents shell metacharacters from flowing into the gh --label arg
    // (createIssueWithLabels only escapes `"`, not backticks or $()).
    const category = ERROR_CLASSES.includes(finding.category)
      ? finding.category
      : 'UNCLASSIFIED';

    const fpV1 = fingerprint(caseId, category, '');
    const fpV2 = fingerprint(caseId, category, topOfStackHashFromTriage(finding, rerunEntry, iter));

    const existing = findMatchingIssueDual(ghClient, fpV1, fpV2);
    if (existing) {
      console.log(
        `[e2e-report-issue] dedup hit #${existing.number} for case=${caseId} category=${category}`
      );
      continue;
    }

    const goldenCitation = goldenBaseline?.[caseId]?.citation ?? null;
    const reproducerCmd = `npm run e2e:explore -- --case ${caseId}`;
    // CR-01: pass sanitized caseId + clamped category through to the builder
    // so the title `[e2e-nightly] ${caseId}: ${category}` is injection-safe.
    const { title, body, labels } = buildIssuePayload({
      triageFinding: { ...finding, category },
      iteration: { ...iter, case_id: caseId },
      rerunEntry,
      goldenCitation,
      reproducerCmd,
      fingerprint: fpV2,
    });

    const created = ghClient.createIssueWithLabels(title, body, labels);
    console.log(
      `[e2e-report-issue] triage filed #${created?.number ?? '?'} (case=${caseId}, category=${category})`
    );
  }
}

/**
 * Main dispatch function. For each failed non-FLAKE case in the report:
 *   1. Validate and sanitize the case ID
 *   2. Compute fingerprint
 *   3. Find matching open issue
 *   4. If match is recent → comment; else → create new issue
 *
 * ghClient is injected for testability (unit tests pass a mock; CLI shim
 * passes makeRealGhClient()).
 *
 * @param {object} report — RPT-01 report object
 * @param {object} opts
 * @param {object} opts.ghClient — { listOpenNightlyIssues, createIssue, commentIssue }
 * @param {string} opts.runId — GitHub Actions run ID
 * @param {string} opts.repo — "owner/repo" string
 */
export function processReport(report, { ghClient, runId, repo }) {
  const toFile = filterCasesForFiling(report.cases || []);
  if (toFile.length === 0) return;

  const openIssues = ghClient.listOpenNightlyIssues();

  for (const caseEntry of toFile) {
    let safeId;
    try {
      safeId = sanitizeCaseId(caseEntry.id);
    } catch (err) {
      console.warn(`[e2e-report-issue] skipping invalid case id: ${err.message}`);
      continue;
    }

    // topOfStackHash: use null so fingerprints are deterministic across runs
    // with minor reason-text variations. The reason text is embedded in the
    // issue body (inside a code fence) for human review, but NOT in the
    // fingerprint to avoid dedup misses when reason wording changes slightly.
    // See 29-RESEARCH.md Open Question 3 (RESOLVED): sha256(reason) is
    // exported as topOfStackHashFromCase() for future use but not applied here.
    const fp = fingerprint(safeId, caseEntry.errorClass, null);
    const title = buildIssueTitle(caseEntry);
    const body = buildIssueBody(caseEntry, { fingerprint: fp, runId, repo });

    const match = findMatchingIssue(openIssues, fp);
    if (match && isRecentlyUpdated(match)) {
      ghClient.commentIssue(match.number, body);
      console.log(
        `[e2e-report-issue] commented on #${match.number} (fp=${fp}, case=${safeId})`
      );
    } else {
      const created = ghClient.createIssue(title, body);
      console.log(
        `[e2e-report-issue] created #${created?.number ?? '?'} (fp=${fp}, case=${safeId})`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Real ghClient — uses execSync('gh ...'). Only invoked from the CLI shim.
// ---------------------------------------------------------------------------

export function makeRealGhClient(repo, label = NIGHTLY_LABEL) {
  // Phase 11 D-09: shared gh plumbing (createIssueWithLabels, listOpenWithSearch/listWithSearch,
  // addLabel) delegated to makeKvReportGhClient. Label-specific methods (createIssue,
  // listOpenNightlyIssues, commentIssue, filerMetaIssue) remain here; they are nightly-label
  // specific and not shared with the ingest-reports.mjs path.
  const kvClient = makeKvReportGhClient(repo);
  return {
    listOpenNightlyIssues() {
      try {
        const raw = execSync(
          `gh api repos/${repo}/issues --method GET -f labels=${label} -f state=open --paginate`,
          { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
        );
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch (err) {
        console.warn('[e2e-report-issue] listOpenNightlyIssues failed:', err.message);
        return [];
      }
    },
    createIssue(title, body) {
      // Use --body-file - to read body from stdin; avoids shell quoting issues.
      // Title is escaped for the shell command string (T-29-02-1).
      const escapedTitle = title.replaceAll('"', '\\"');
      const out = execSync(
        `gh issue create --title "${escapedTitle}" --label ${label} --body-file -`,
        { input: body, encoding: 'utf8' }
      );
      const m = out.match(/\/issues\/(\d+)/);
      return { number: m ? parseInt(m[1], 10) : null };
    },
    // Phase 35 D-06: multi-label issue create — delegated to gh-client.mjs (D-09).
    // labels is an ordered array per D-06: [category, 'e2e-nightly', 'triage'].
    // Each label is shell-escaped (T-35-03-04).
    createIssueWithLabels(title, body, labels) {
      return kvClient.createIssueWithLabels(title, body, labels);
    },
    // Phase 35 D-07: search open issues by query string — delegated to gh-client.mjs (D-09).
    // Shell-escapes query for single-quoted shell context (T-35-03-03).
    // Returns [] on transient gh failures (defensive).
    listOpenWithSearch(query) {
      return kvClient.listWithSearch(query, 'open');
    },
    // Phase 35 D-12: idempotent label-add — delegated to gh-client.mjs (D-09).
    // gh issue edit no-ops if label is already present.
    addLabel(issueNumber, addedLabel) {
      return kvClient.addLabel(issueNumber, addedLabel);
    },
    commentIssue(number, body) {
      execSync(`gh issue comment ${number} --body-file -`, {
        input: body,
        encoding: 'utf8',
      });
    },
    filerMetaIssue(title, body) {
      return this.createIssue(title, body);
    },
  };
}

// ---------------------------------------------------------------------------
// CLI argument parsing — Phase 35 strict parseArgs for --source / --triage-report
// Mirrors scripts/e2e-triage-classifier.mjs lines 58-98 pattern.
// ---------------------------------------------------------------------------

/**
 * Parse --source and --triage-report flags from process.argv.
 *
 * Rules:
 *   --source <regression|triage|quarantine>  strict positional; default = 'regression' (Phase 29 back-compat)
 *   --source=<value>              exit 2 (equals syntax not supported)
 *   --source                      exit 2 (missing value)
 *   --triage-report <path>        required when --source triage; strict positional
 *   --triage-report=<path>        exit 2 (equals syntax not supported)
 *   quarantine: reuses the processReport per-case report.json path, stamps e2e-quarantine label (D-15)
 *
 * @param {string[]} argv — process.argv
 * @returns {{ source: string, triageReportPath: string|null }}
 */
function parseSourceArgs(argv) {
  let source = 'regression';
  let triageReportPath = null;

  for (let i = 2; i < argv.length; i++) {
    if (argv[i].startsWith('--source=')) {
      process.stderr.write(
        '[e2e-report-issue] equals syntax not supported for --source; use `--source <value>`\n'
      );
      process.exit(2);
    } else if (argv[i] === '--source') {
      const next = argv[i + 1];
      // WR-04 (Phase 35 review-fix): reject `--source --triage-report ...` —
      // next token must be a value, not another flag. Mirrors update-golden.js:68.
      if (next === undefined || next === null || next === '' || next.startsWith('--')) {
        process.stderr.write('[e2e-report-issue] missing value for --source\n');
        process.exit(2);
      }
      if (next !== 'regression' && next !== 'triage' && next !== 'quarantine') {
        process.stderr.write(
          `[e2e-report-issue] invalid --source value: expected 'regression', 'triage', or 'quarantine'\n`
        );
        process.exit(2);
      }
      source = next;
      i++;
    } else if (argv[i].startsWith('--triage-report=')) {
      process.stderr.write(
        '[e2e-report-issue] equals syntax not supported for --triage-report; use `--triage-report <value>`\n'
      );
      process.exit(2);
    } else if (argv[i] === '--triage-report') {
      const next = argv[i + 1];
      // WR-04 (Phase 35 review-fix): reject `--triage-report --source ...` —
      // next token must be a value, not another flag. Mirrors update-golden.js:68.
      if (next === undefined || next === null || next === '' || next.startsWith('--')) {
        process.stderr.write('[e2e-report-issue] missing value for --triage-report\n');
        process.exit(2);
      }
      triageReportPath = next;
      i++;
    }
  }

  if (source === 'triage' && !triageReportPath) {
    process.stderr.write(
      '[e2e-report-issue] --source triage requires --triage-report <path>\n'
    );
    process.exit(2);
  }

  return { source, triageReportPath };
}

// ---------------------------------------------------------------------------
// Triage mode main function
// ---------------------------------------------------------------------------

async function mainTriage(triageReportPath, opts) {
  // WR-05 path-bounding — T-35-03-01 mitigation.
  // Mirrors scripts/e2e-triage-classifier.mjs lines 181-190 verbatim.
  const resolvedTriagePath = path.resolve(process.cwd(), triageReportPath);
  const insideAllowedRoot = ALLOWED_INPUT_ROOTS.some(
    root => resolvedTriagePath === root || resolvedTriagePath.startsWith(root + path.sep)
  );
  if (!insideAllowedRoot) {
    process.stderr.write(
      '[e2e-report-issue] --triage-report must reside under tests/e2e/artifacts/ or ' +
        'tests/e2e/fixtures/; got: ' + resolvedTriagePath + '\n'
    );
    process.exit(1);
  }

  if (!existsSync(resolvedTriagePath)) {
    process.stderr.write('[e2e-report-issue] triage-report not found: ' + resolvedTriagePath + '\n');
    process.exit(1);
  }

  const dir = path.dirname(resolvedTriagePath);
  const llmReportPath = path.join(dir, 'llm-report.json');
  const rerunReportPath = path.join(dir, 'rerun-report.json');

  if (!existsSync(llmReportPath)) {
    process.stderr.write('[e2e-report-issue] sibling llm-report.json not found: ' + llmReportPath + '\n');
    process.exit(1);
  }
  if (!existsSync(rerunReportPath)) {
    process.stderr.write('[e2e-report-issue] sibling rerun-report.json not found: ' + rerunReportPath + '\n');
    process.exit(1);
  }

  const triageReport = JSON.parse(readFileSync(resolvedTriagePath, 'utf8'));
  const llmReport = JSON.parse(readFileSync(llmReportPath, 'utf8'));
  const rerunReport = JSON.parse(readFileSync(rerunReportPath, 'utf8'));

  // Read golden baseline — soft failure is OK (baseline may not exist in all envs)
  let goldenBaseline = {};
  const goldenPath = path.resolve(PROJECT_ROOT, 'tests/golden/baseline.json');
  if (existsSync(goldenPath)) {
    try {
      goldenBaseline = JSON.parse(readFileSync(goldenPath, 'utf8'));
    } catch {
      // Proceed without baseline
    }
  }

  processTriageReport(triageReport, rerunReport, llmReport, goldenBaseline, opts);
}

// ---------------------------------------------------------------------------
// CLI entrypoint
// ---------------------------------------------------------------------------

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const { source, triageReportPath } = parseSourceArgs(process.argv);

  const runId =
    process.env.PLAYWRIGHT_RUN_ID || process.env.GITHUB_RUN_ID || 'local-run';
  const repo = process.env.GITHUB_REPOSITORY || '';

  if (!repo) {
    console.error('[e2e-report-issue] GITHUB_REPOSITORY env var required');
    process.exit(1);
  }

  // Phase 36 (D-15): quarantine source uses e2e-quarantine label; all other sources use e2e-nightly (default).
  const gh = source === 'quarantine'
    ? makeRealGhClient(repo, 'e2e-quarantine')
    : makeRealGhClient(repo);

  if (source === 'triage') {
    mainTriage(triageReportPath, { ghClient: gh, runId, repo }).catch(err => {
      console.error('[e2e-report-issue] triage error:', err.message);
      process.exit(1);
    });
  } else if (source === 'regression') {
    // source === 'regression' — existing Phase 29 behavior preserved unchanged.

    // --meta-drift mode: file ONE meta-issue for "Google Patents drift suspected"
    // instead of iterating individual case failures. Called when the pre-flight
    // smoke probe fails (Pattern 4 in 29-RESEARCH.md).
    if (process.argv.includes('--meta-drift')) {
      const dateStr = new Date().toISOString().slice(0, 10);
      const metaFp = createHash('sha256')
        .update(`meta-drift|${dateStr}`)
        .digest('hex')
        .substring(0, 12);

      const openIssues = gh.listOpenNightlyIssues();
      const match = findMatchingIssue(openIssues, metaFp);
      const title = `[e2e-nightly] Google Patents drift suspected — full suite skipped on ${dateStr}`;
      const body = [
        '## Pre-flight smoke probe failed',
        '',
        'Google Patents DOM probe or CAPTCHA detector failed before the regression suite could run. The suite was skipped to avoid filing individual issues for the same root cause.',
        '',
        '| Field | Value |',
        '|-------|-------|',
        `| Date | ${dateStr} |`,
        `| Run | [Run #${runId}](https://github.com/${repo}/actions/runs/${runId}) |`,
        `| Fingerprint | \`${metaFp}\` |`,
        '',
        'Inspect the smoke artifact bundle for the screenshot + DOM snapshot of the failing probe.',
        '',
        `<!-- fingerprint: ${metaFp} -->`,
      ].join('\n');

      if (match && isRecentlyUpdated(match)) {
        gh.commentIssue(match.number, body);
        console.log(`[e2e-report-issue] meta-drift commented on #${match.number}`);
      } else {
        const created = gh.createIssue(title, body);
        console.log(`[e2e-report-issue] meta-drift created #${created?.number}`);
      }
      process.exit(0);
    }

    // Default mode: read report.json and iterate failed cases.
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const reportPath = path.resolve(
      __dirname,
      '..',
      'tests/e2e/artifacts',
      runId,
      'report.json'
    );

    if (!existsSync(reportPath)) {
      console.log(
        `[e2e-report-issue] no report.json at ${reportPath} — nothing to file`
      );
      process.exit(0);
    }

    const report = JSON.parse(readFileSync(reportPath, 'utf8'));
    processReport(report, { ghClient: gh, runId, repo });
  } else {
    // source === 'quarantine' (Phase 36, D-15) — reuses processReport but reads
    // a DISTINCT report file (CR-01). The gh client was constructed with the
    // 'e2e-quarantine' label above.
    // CR-01: the quarantine spec writes to quarantine-report.json — NOT the
    // shared report.json that regression + fault-injection write to. Reading the
    // shared report.json here would re-file every regression/fault-injection
    // failure under the e2e-quarantine label (cross-label contamination), since
    // processReport iterates ALL failed-non-FLAKE cases in the file it is given.
    // --meta-drift does NOT apply to quarantine (no DOM-drift pre-flight for quarantine suite).
    // sanitizeCaseId guard is inherited automatically through processReport.
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const reportPath = path.resolve(
      __dirname,
      '..',
      'tests/e2e/artifacts',
      runId,
      QUARANTINE_REPORT_FILENAME
    );

    if (!existsSync(reportPath)) {
      // WR-02: name the exact file checked so a quarantine-suite crash that
      // never produced quarantine-report.json is distinguishable in CI logs
      // from a genuine "no quarantine cases" no-op.
      console.log(
        `[e2e-report-issue] no quarantine report at ${reportPath} ` +
          `(expected ${QUARANTINE_REPORT_FILENAME} written by quarantine.spec.js) — nothing to file`
      );
      process.exit(0);
    }

    const report = JSON.parse(readFileSync(reportPath, 'utf8'));
    processReport(report, { ghClient: gh, runId, repo });
  }
}

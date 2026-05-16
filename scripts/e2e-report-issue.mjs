// scripts/e2e-report-issue.mjs
//
// Phase 29 (CRON-04, CRON-05) — issue filer with fingerprint-based dedup.
//
// Reads tests/e2e/artifacts/${PLAYWRIGHT_RUN_ID}/report.json (RPT-01 shape)
// and for each failed-non-FLAKE case either opens a new GitHub issue or
// comments on an existing one matching the fingerprint.
//
// Pure functions exported for unit testing; CLI shim at bottom invokes
// the real gh CLI via execSync.
//
// Threat model (T-29-02):
//   T-29-02-1: sanitizeCaseId() validates case IDs against a regex; processReport
//              skips cases that fail validation.
//   T-29-02-2: verifier_verdict.reason is wrapped in a fenced code block so any
//              markdown injection is rendered as code.
//   T-29-02-5: gh api ... --paginate used unconditionally (no page-2 misses).

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const MAX_RECENT_DAYS = 7;
const NIGHTLY_LABEL = 'e2e-nightly';

// Validation regex for case IDs (T-29-02-1 mitigation).
// Allows: patent case IDs like US11427642-spec-short-1, US4723129-claims-1
// AND pre-flight synthetic IDs like PRE-FLIGHT-CAPTCHA, PRE-FLIGHT-DOM-DRIFT.
const CASE_ID_RE = /^[A-Z]{2,}\d+[A-Z]?\d*-[a-z0-9-]+$|^PRE-FLIGHT-[A-Z-]+$/;

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

function makeRealGhClient(repo) {
  return {
    listOpenNightlyIssues() {
      try {
        const raw = execSync(
          `gh api repos/${repo}/issues --method GET -f labels=${NIGHTLY_LABEL} -f state=open --paginate`,
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
        `gh issue create --title "${escapedTitle}" --label ${NIGHTLY_LABEL} --body-file -`,
        { input: body, encoding: 'utf8' }
      );
      const m = out.match(/\/issues\/(\d+)/);
      return { number: m ? parseInt(m[1], 10) : null };
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
// CLI entrypoint
// ---------------------------------------------------------------------------

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const runId =
    process.env.PLAYWRIGHT_RUN_ID || process.env.GITHUB_RUN_ID || 'local-run';
  const repo = process.env.GITHUB_REPOSITORY || '';

  if (!repo) {
    console.error('[e2e-report-issue] GITHUB_REPOSITORY env var required');
    process.exit(1);
  }

  const gh = makeRealGhClient(repo);

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
}

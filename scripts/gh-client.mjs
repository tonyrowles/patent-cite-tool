// scripts/gh-client.mjs
//
// Phase 11 Plan 02 (D-09) — Shared gh CLI plumbing extracted from e2e-report-issue.mjs.
//
// Pure library module (NO CLI guard). Both ingest-reports.mjs and e2e-report-issue.mjs
// import this module. e2e-report-issue.mjs re-exports makeRealGhClient for backward compat.
//
// Threat model (T-11-01, T-11-02, T-11-03):
//   T-11-01 (WR-01): createIssueWithLabels and addLabel use execFileSync (no shell),
//            so title/label values are passed as argv — no shell metacharacters interpreted.
//            listWithSearch / isPostFixSuppressed still use execSync with a single-quoted
//            query string; those paths remain safe because the query is only the server-
//            validated patentNumber / kv-key (bounded charset).
//   T-11-02: Issue body passed to gh exclusively via --body-file - stdin ({ input: body }),
//            NEVER concatenated into the shell command string.
//   T-11-03: findExistingIssueByKvKey dedup marker is constructed from server-computed
//            fingerprint+timestamp, not user free-text. Residual risk accepted (see plan).

import { execSync, execFileSync } from 'node:child_process';

// ---------------------------------------------------------------------------
// Env-configurable post-fix suppression window (TRI-06).
// Import from report-classifier.mjs when available; inline the default here
// to avoid a circular dependency on a sibling that may not yet exist (Plan 01).
// ---------------------------------------------------------------------------
const POST_FIX_SUPPRESS_DAYS = parseInt(process.env.POST_FIX_SUPPRESS_DAYS ?? '30', 10);

// ---------------------------------------------------------------------------
// Pure exported date-cutoff helper (TRI-06 correctness core)
// ---------------------------------------------------------------------------

/**
 * Returns true iff `isoTimestamp` is within `suppressDays` of `now`.
 *
 * An OLD entry (older than suppressDays) → false → NOT suppressed (fresh signal, D-08).
 * A RECENT entry (within suppressDays) → true → suppressed.
 *
 * @param {string|null|undefined} isoTimestamp — ISO 8601 date string (mergedAt / closedAt)
 * @param {number} suppressDays — suppression window in days
 * @param {number} [now=Date.now()] — injectable for testing
 * @returns {boolean}
 */
export function isWithinCutoff(isoTimestamp, suppressDays, now = Date.now()) {
  if (!isoTimestamp) return false;
  const cutoffMs = now - suppressDays * 86400000;
  return Date.parse(isoTimestamp) >= cutoffMs;
}

// ---------------------------------------------------------------------------
// Factory — makeKvReportGhClient(repo)
// ---------------------------------------------------------------------------

/**
 * Create a gh CLI client for KV-report Issue management.
 *
 * WR-05: The `repo` parameter is now threaded into every gh command via `--repo <repo>`
 * so a caller passing a different repo is not silently redirected to the ambient
 * repository. If `repo` is falsy the parameter is omitted and gh falls back to the
 * ambient git remote (backward-compatible).
 *
 * @param {string|null|undefined} repo — GitHub repository in "owner/repo" format, or null/undefined
 *   to use gh's ambient repo resolution (git remote / GH_REPO env var).
 * @returns {{ findExistingIssueByKvKey, createIssueWithLabels, isPostFixSuppressed, listWithSearch, addLabel }}
 */
export function makeKvReportGhClient(repo) {
  // WR-05: pre-build a --repo flag fragment for shell-string commands (safe: repo comes
  // from process.env.GITHUB_REPOSITORY which is server-set, not user free-text;
  // only alphanumeric/- chars expected, but we escape the shell context defensively).
  const repoArg = repo ? ` --repo '${repo.replaceAll("'", "'\\''")}'` : '';
  // For execFileSync (shell-free) commands, a separate argv pair.
  const repoArgv = repo ? ['--repo', repo] : [];

  return {
    /**
     * Search issues by query string across open and closed states.
     *
     * Generalized from e2e-report-issue.mjs listOpenWithSearch (line 522), adding a `state` arg.
     * Shell-escapes query for single-quoted shell context (T-11-01).
     * Returns [] on transient gh failures.
     *
     * @param {string} query
     * @param {string} [state='open'] — 'open' | 'closed' | 'all'
     * @returns {Array<object>}
     */
    listWithSearch(query, state = 'open') {
      try {
        const escaped = query.replaceAll("'", "'\\''");
        const raw = execSync(
          `gh issue list${repoArg} --search '${escaped}' --state ${state} --json number,title,body,state --limit 30`,
          { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
        );
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch (err) {
        console.warn('[gh-client] listWithSearch failed:', err.message);
        return [];
      }
    },

    /**
     * Find an existing report-fix-candidate Issue by its kv-key dedup marker.
     *
     * Searches both open AND closed issues via two separate gh calls (RESEARCH.md Open Question 1 —
     * avoid --state all + --label quirks). The marker is: <!-- kv-key: {kvKey} -->
     *
     * @param {string} kvKey — e.g. 'report:aabbccdd:1718500000'
     * @returns {object|null} matching issue or null
     */
    findExistingIssueByKvKey(kvKey) {
      const marker = `<!-- kv-key: ${kvKey} -->`;
      const open = this.listWithSearch(kvKey, 'open');
      const closed = this.listWithSearch(kvKey, 'closed');
      const all = [...open, ...closed];
      return all.find(i => typeof i.body === 'string' && i.body.includes(marker)) || null;
    },

    /**
     * Create a GitHub Issue with multiple labels.
     *
     * WR-01: Uses execFileSync (shell-free) so title and label values are passed as
     * argv — backticks, $(), ; and other shell metacharacters are never interpreted.
     * Body is passed via stdin (T-11-02).
     *
     * @param {string} title
     * @param {string} body — passed via --body-file - stdin, never interpolated into the command
     * @param {string[]} labels
     * @returns {{ number: number|null }}
     */
    createIssueWithLabels(title, body, labels) {
      const labelFlags = labels.flatMap(l => ['--label', l]);
      const out = execFileSync(
        'gh',
        ['issue', 'create', ...repoArgv, '--title', title, ...labelFlags, '--body-file', '-'],
        { input: body, encoding: 'utf8' }
      );
      const m = out.match(/\/issues\/(\d+)/);
      return { number: m ? parseInt(m[1], 10) : null };
    },

    /**
     * Add a label to an existing issue (idempotent — gh issue edit no-ops if already present).
     *
     * WR-01: Uses execFileSync (shell-free) so the label value is passed as argv.
     *
     * @param {number} issueNumber
     * @param {string} label
     */
    addLabel(issueNumber, label) {
      execFileSync(
        'gh',
        ['issue', 'edit', ...repoArgv, String(issueNumber), '--add-label', label],
        { encoding: 'utf8' }
      );
    },

    /**
     * Check whether a patent number has been suppressed by a recent post-fix event (TRI-06).
     *
     * Returns true if any of:
     *   - A merged auto-fix/* PR whose mergedAt is within suppressDays
     *   - A closed report-fix-candidate Issue whose closedAt is within suppressDays
     *
     * Returns false on transient gh errors (try/catch → false = conservative: do not suppress on error).
     *
     * @param {string} patentNumber — e.g. 'US11427642B2'
     * @param {number} [suppressDays=POST_FIX_SUPPRESS_DAYS] — suppression window (default 30, env-configurable)
     * @returns {boolean}
     */
    isPostFixSuppressed(patentNumber, suppressDays = POST_FIX_SUPPRESS_DAYS) {
      const escaped = patentNumber.replaceAll("'", "'\\''");
      // WR-02: exact-match token for body post-filter — the builder renders the patent
      // number in a backtick cell: `| Patent | \`US11427642\` |`. Checking for this
      // delimited token prevents US1234 from matching a body that only contains US12345.
      const exactToken = `\`${patentNumber}\``;

      // Query 1: merged auto-fix/* PRs referencing patentNumber (T-11-01 — query escaping)
      try {
        const raw = execSync(
          `gh pr list${repoArg} --state merged --search '${escaped} in:body' ` +
          `--json number,mergedAt,headRefName,body --limit 20`,
          { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
        );
        const prs = JSON.parse(raw);
        // WR-02: post-filter on exact backtick-delimited token to avoid substring over-match
        const hit = (Array.isArray(prs) ? prs : []).find(
          pr => pr.headRefName?.startsWith('auto-fix/')
            && isWithinCutoff(pr.mergedAt, suppressDays)
            && typeof pr.body === 'string' && pr.body.includes(exactToken)
        );
        if (hit) return true;
      } catch { /* transient gh failure → not suppressed */ }

      // Query 2: closed report-fix-candidate Issues referencing patentNumber (T-11-01)
      try {
        const raw = execSync(
          `gh issue list${repoArg} --label report-fix-candidate --state closed ` +
          `--search '${escaped} in:body' --json number,closedAt,body --limit 20`,
          { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
        );
        const issues = JSON.parse(raw);
        // WR-02: post-filter on exact backtick-delimited token
        return (Array.isArray(issues) ? issues : []).some(
          i => isWithinCutoff(i.closedAt, suppressDays)
            && typeof i.body === 'string' && i.body.includes(exactToken)
        );
      } catch { return false; }
    },
  };
}

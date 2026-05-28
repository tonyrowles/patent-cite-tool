// scripts/weekly-digest.mjs
//
// Phase 37 Plan 37-02 — Weekly analytics digest CLI.
//
// Reads the prior week's open GitHub issues filtered by e2e-nightly and
// e2e-quarantine labels, aggregates five metrics, validates the SUMMARY_KEYS
// contract (D-02/DIGEST-04), renders a ≤50-line markdown digest (D-04), writes
// it to reports/weekly-digest-YYYY-WNN.md, and publishes it via
// DIGEST_PUBLISH_MODE (issue fallback ACTIVE, createDiscussion DORMANT/tested).
//
// Public surface:
//   isoWeekLabel(date)                     ISO-week string "YYYY-Www"
//   validateSummaryKeys(obj)               throws naming missing key (D-02)
//   aggregate({ nightlyIssues, quarantineIssues, now })  → aggregation object
//   renderCostLine({ ledgerPath? })        → cost string (graceful if absent)
//   renderDigest({ weekLabel, agg, costLine, now })  → markdown string ≤50 lines
//   runDigest(opts)                        injected-deps orchestrator (D-13)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

// D-01: Single source of truth for the 7-key summary contract.
// Importing SUMMARY_KEYS here means any key drift in llm-report.js is caught
// as a descriptive throw by validateSummaryKeys, not a silent zero metric.
import { SUMMARY_KEYS } from '../tests/e2e/lib/llm-report.js';

// CR-01: closed errorClass taxonomy — the SAME list e2e-report-issue.mjs:382
// clamps category labels to. The GitHub REST GET /issues endpoint does NOT
// guarantee label array order, so we must pick the category by MEMBERSHIP in
// this set (O(1) via the Set below), never by labels[0] position.
import { ERROR_CLASSES } from '../tests/e2e/lib/error-codes.js';
const ERROR_CLASS_SET = new Set(ERROR_CLASSES);

// D-15: cost-vs-cap — LEDGER_PATH, readLedger, monthlyTotal, HARD_CAP_USD.
// WARNING: monthlyTotal returns 0 for BOTH $0 spend and no-ledger-file.
// Always fs.existsSync(LEDGER_PATH) FIRST; never set E2E_LEDGER_PATH_OVERRIDE.
import {
  readLedger,
  monthlyTotal,
  HARD_CAP_USD,
  LEDGER_PATH,
} from '../tests/e2e/lib/llm-ledger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

// D-08 dormant discussion path: category constant (Open Question 1 resolution).
// Enabling Discussions requires this category name to exist on the repo.
const DISCUSSION_CATEGORY = 'General';

// ---------------------------------------------------------------------------
// ISO-week helper (Pattern 4, D-10)
// [CITED: ISO-8601 week-date Thursday-shift algorithm]
// Boundary fixtures: 2026-01-01 (Thu) → 2026-W01; 2027-01-01 (Fri) → 2026-W53
// ---------------------------------------------------------------------------
export function isoWeekLabel(date) {
  // Copy to UTC midnight to avoid DST/TZ drift.
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // ISO weekday: Mon=1..Sun=7 (getUTCDay() has Sun=0..Sat=6)
  const dayNum = d.getUTCDay() || 7;
  // Shift to the Thursday of this ISO week (Thursday determines the ISO year).
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const isoYear = d.getUTCFullYear();
  // Week number = ceil(days since Jan 1 of ISO year / 7)
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${isoYear}-W${String(weekNo).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// SUMMARY_KEYS validation (D-02 / DIGEST-04)
// Throws NAMING the missing key — never a silent zero.
// The digest seeds counters from SUMMARY_KEYS so this validation catches any
// schema drift from a future llm-report.js key rename/addition.
// ---------------------------------------------------------------------------
export function validateSummaryKeys(obj) {
  for (const k of SUMMARY_KEYS) {
    if (!(k in obj)) {
      throw new Error(
        `weekly-digest: summary missing required SUMMARY_KEY '${k}'. ` +
        `Ensure the digest aggregation seeds all keys from SUMMARY_KEYS (llm-report.js).`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Aggregation (D-03, D-12, D-16, Pitfall 6)
// ---------------------------------------------------------------------------
/**
 * Aggregate five metrics from two label-filtered issue sets.
 *
 * @param {{ nightlyIssues: object[], quarantineIssues: object[], now: Date }} opts
 * @returns {{ findingsCount, breakdown, top3, quarantineGrowth }}
 */
export function aggregate({ nightlyIssues, quarantineIssues, now }) {
  // Merge + dedup by issue.number (Pitfall 6 — some issues carry both labels).
  const byNumber = new Map();
  for (const issue of [...nightlyIssues, ...quarantineIssues]) {
    if (!byNumber.has(issue.number)) {
      byNumber.set(issue.number, issue);
    }
  }
  const deduped = Array.from(byNumber.values());

  // Headline findings count = distinct issues
  const findingsCount = deduped.length;

  // Classification breakdown: tally the errorClass category across the deduped
  // set. CR-01: the GitHub REST GET /issues response does NOT preserve label
  // application order, so labels[0] is frequently 'e2e-nightly'/'triage' rather
  // than the category. Pick the FIRST label whose name is a member of the closed
  // ERROR_CLASSES taxonomy (same set e2e-report-issue.mjs clamps to). If none
  // match, bucket as 'UNCLASSIFIED' (mirrors e2e-report-issue.mjs:384).
  const tally = new Map();
  for (const issue of deduped) {
    const names = (issue.labels ?? []).map((l) => l?.name).filter(Boolean);
    const category = names.find((n) => ERROR_CLASS_SET.has(n)) ?? 'UNCLASSIFIED';
    tally.set(category, (tally.get(category) ?? 0) + 1);
  }
  // Sort desc, ties broken alphabetically (D-16 deterministic)
  const breakdown = Array.from(tally.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));

  // Top-3 (D-16)
  const top3 = breakdown.slice(0, 3);

  // Quarantine growth: count of e2e-quarantine issues opened within prior 7 days (D-12).
  // Computed on the quarantine subset (not deduped), using created_at.
  const windowStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const quarantineGrowth = quarantineIssues.filter((issue) => {
    const createdAt = new Date(issue.created_at);
    return createdAt >= windowStart && createdAt <= now;
  }).length;

  return { findingsCount, breakdown, top3, quarantineGrowth };
}

// ---------------------------------------------------------------------------
// Cost-vs-cap line (D-15)
// fs.existsSync FIRST — monthlyTotal returns 0 for both $0 and no-ledger (Pitfall 2)
// ---------------------------------------------------------------------------
/**
 * @param {{ ledgerPath?: string }} opts
 * @returns {string}
 */
export function renderCostLine({ ledgerPath } = {}) {
  const effectivePath = ledgerPath ?? LEDGER_PATH;
  // D-15: check file existence BEFORE calling readLedger/monthlyTotal.
  // readLedger() returns an empty ledger on file-absence (returns 0 for monthlyTotal),
  // indistinguishable from a real $0 month — must detect absence explicitly.
  if (!fs.existsSync(effectivePath)) {
    return 'cost data unavailable';
  }
  const spent = monthlyTotal(readLedger(effectivePath));
  return `$${spent.toFixed(2)} / $${HARD_CAP_USD} (${Math.round((spent / HARD_CAP_USD) * 100)}%)`;
}

// ---------------------------------------------------------------------------
// Markdown render (D-04 / DIGEST-04, Pattern 5)
// Builds a fixed-order line array for deterministic diffs. ≤50-line guard enforced.
// ---------------------------------------------------------------------------
/**
 * @param {{ weekLabel: string, agg: object, costLine: string, now: Date }} opts
 * @returns {string}
 */
export function renderDigest({ weekLabel, agg, costLine }) {
  const lines = [];

  // Title
  lines.push(`# Weekly E2E Analytics — ${weekLabel}`);
  lines.push('');

  // Findings count
  lines.push(`**Total open findings:** ${agg.findingsCount}`);
  lines.push('');

  // Classification breakdown table
  lines.push('## Classification Breakdown');
  lines.push('');
  lines.push('| Category | Count |');
  lines.push('|----------|-------|');
  for (const { category, count } of agg.breakdown) {
    lines.push(`| ${category} | ${count} |`);
  }
  lines.push('');

  // Top-3 failure categories
  lines.push('## Top-3 Failure Categories');
  lines.push('');
  for (let i = 0; i < agg.top3.length; i++) {
    const { category, count } = agg.top3[i];
    lines.push(`${i + 1}. **${category}** — ${count}`);
  }
  lines.push('');

  // Quarantine growth
  lines.push(`**Quarantine growth (prior 7d):** ${agg.quarantineGrowth}`);
  lines.push('');

  // Cost vs cap
  lines.push(`**Cost vs cap:** ${costLine}`);

  const md = lines.join('\n');

  // D-04 / DIGEST-04: enforce ≤50-line budget
  const lineCount = md.split('\n').length;
  if (lineCount > 50) {
    throw new Error(
      `weekly-digest: rendered ${lineCount} lines (>50). Reduce the classification breakdown or top-3 table.`
    );
  }

  return md;
}

// ---------------------------------------------------------------------------
// Real gh client (D-13)
// ---------------------------------------------------------------------------
function makeRealGhClient(repo) {
  const [owner, name] = (repo ?? '').split('/');
  return {
    listOpenIssuesByLabel(label) {
      // CR-02: do NOT swallow gh failures into an empty array. A gh auth error,
      // secondary rate-limit, or API outage that returned [] here would let
      // runDigest publish a misleading "0 findings" silent-zero digest. Instead
      // THROW on any hard failure (non-zero exit, JSON parse error, non-array
      // payload) so runDigest aborts before writing/committing/filing and the
      // workflow step fails loudly. A LEGITIMATE empty result (gh exits 0 and
      // returns []) still flows through and publishes a real "0 findings" digest.
      let raw;
      try {
        raw = execSync(
          `gh api repos/${repo}/issues --method GET -f labels=${label} -f state=open --paginate`,
          { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
        );
      } catch (err) {
        throw new Error(
          `weekly-digest: gh issue fetch failed for label '${label}' ` +
          `(refusing to publish a silent-zero digest): ${err.message}`
        );
      }
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (err) {
        throw new Error(
          `weekly-digest: gh returned unparseable JSON for label '${label}' ` +
          `(refusing to publish a silent-zero digest): ${err.message}`
        );
      }
      if (!Array.isArray(parsed)) {
        throw new Error(
          `weekly-digest: gh returned a non-array payload for label '${label}' ` +
          `(refusing to publish a silent-zero digest)`
        );
      }
      return parsed;
    },

    hasDiscussions() {
      try {
        const raw = execSync(
          `gh api repos/${repo} --jq .has_discussions`,
          { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
        );
        return JSON.parse(raw.trim());
      } catch {
        return false;
      }
    },

    createDigestIssue(title, body) {
      const escapedTitle = title.replaceAll('"', '\\"');
      const out = execSync(
        `gh issue create --title "${escapedTitle}" --label e2e-digest --body-file -`,
        { input: body, encoding: 'utf8' }
      );
      return out.trim();
    },

    // D-08 dormant discussion path: two-step GraphQL createDiscussion.
    // Step 1: resolve repo node id + category id by name.
    // Step 2: createDiscussion mutation.
    // ALL dynamic values passed via -F/-f bindings (never string-concatenated
    // into the query — GraphQL injection prevention, T-37-02-04).
    createDiscussion(title, body) {
      const lookupQ = [
        'query($o:String!,$n:String!){',
        'repository(owner:$o,name:$n){',
        'id discussionCategories(first:25){nodes{id name}}}}',
      ].join('');

      const lookupRaw = execSync(
        `gh api graphql -f query='${lookupQ}' -F o=${owner} -F n=${name}`,
        { encoding: 'utf8' }
      );
      const { data } = JSON.parse(lookupRaw);
      const repoId = data.repository.id;
      const categoryId = data.repository.discussionCategories.nodes
        .find((c) => c.name === DISCUSSION_CATEGORY)?.id;

      if (!categoryId) {
        throw new Error(
          `weekly-digest: GitHub Discussion category '${DISCUSSION_CATEGORY}' not found. ` +
          `Enable Discussions on the repo and ensure a '${DISCUSSION_CATEGORY}' category exists.`
        );
      }

      const mutation = [
        'mutation($r:ID!,$c:ID!,$t:String!,$b:String!){',
        'createDiscussion(input:{repositoryId:$r,categoryId:$c,title:$t,body:$b}){',
        'discussion{url}}}',
      ].join('');

      // Pass body via stdin using -F b=@- idiom (T-37-02-04: no string concat).
      const out = execSync(
        `gh api graphql -f query='${mutation}' -F r=${repoId} -F c=${categoryId} -F t="${title.replaceAll('"', '\\"')}" -F b=@-`,
        { input: body, encoding: 'utf8' }
      );
      const result = JSON.parse(out);
      return result?.data?.createDiscussion?.discussion?.url ?? '';
    },
  };
}

// ---------------------------------------------------------------------------
// Main orchestrator (D-13 injected-deps)
// ---------------------------------------------------------------------------
/**
 * @param {{
 *   ghClient?: object,
 *   now?: () => Date,
 *   publishMode?: string,
 *   repo?: string,
 *   ledgerPath?: string,
 *   reportsDir?: string
 * }} opts
 */
export async function runDigest(opts = {}) {
  const repo = opts.repo ?? process.env.GITHUB_REPOSITORY;
  const publishMode = opts.publishMode ?? process.env.DIGEST_PUBLISH_MODE ?? 'auto';
  const ledgerPath = opts.ledgerPath ?? LEDGER_PATH;
  const ghClient = opts.ghClient ?? makeRealGhClient(repo);
  const now = opts.now ?? (() => new Date());
  const reportsDir = opts.reportsDir ?? path.join(PROJECT_ROOT, 'reports');

  // (1) Read both label sets unconditionally (never short-circuit — Pitfall 3 / D-03)
  const nightlyIssues = ghClient.listOpenIssuesByLabel('e2e-nightly');
  const quarantineIssues = ghClient.listOpenIssuesByLabel('e2e-quarantine');

  // (2) Validate SUMMARY_KEYS contract (D-02 / DIGEST-04).
  // Build a summary-shaped tally object seeded from SUMMARY_KEYS so that any key
  // rename/drift in llm-report.js is caught as a descriptive throw here rather than
  // silently absent in the rendered digest (prevents Pitfall 17 drift).
  const summaryTally = Object.fromEntries(SUMMARY_KEYS.map((k) => [k, 0]));
  validateSummaryKeys(summaryTally);

  // (3) Compute ISO-week label
  const nowDate = typeof now === 'function' ? now() : now;
  const weekLabel = isoWeekLabel(nowDate);

  // (4) Cost line
  const costLine = renderCostLine({ ledgerPath });

  // (5) Aggregate
  const agg = aggregate({ nightlyIssues, quarantineIssues, now: nowDate });

  // (6) Render markdown
  const md = renderDigest({ weekLabel, agg, costLine, now: nowDate });

  // (7) Write report file (idempotent overwrite, D-11)
  fs.mkdirSync(reportsDir, { recursive: true });
  const reportPath = path.join(reportsDir, `weekly-digest-${weekLabel}.md`);
  fs.writeFileSync(reportPath, md);

  // (8) Publish via DIGEST_PUBLISH_MODE
  const effectiveMode = await resolvePublishMode(publishMode, ghClient);
  const title = `[e2e-digest] Weekly analytics ${weekLabel}`;

  if (effectiveMode === 'discussion') {
    ghClient.createDiscussion(title, md);
  } else {
    // issue (active path, D-05)
    ghClient.createDigestIssue(title, md);
  }

  return { weekLabel, reportPath, mode: effectiveMode };
}

// ---------------------------------------------------------------------------
// Resolve publish mode (D-06)
// ---------------------------------------------------------------------------
async function resolvePublishMode(publishMode, ghClient) {
  if (publishMode === 'auto') {
    const hasDiscussions = ghClient.hasDiscussions();
    return hasDiscussions ? 'discussion' : 'issue';
  }
  return publishMode;
}

// ---------------------------------------------------------------------------
// isMain guard (WR-02, copied from run-triage-pipeline.mjs:220-230)
// ---------------------------------------------------------------------------
const isMain =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  runDigest().catch((e) => {
    process.stderr.write(e.message + '\n');
    process.exit(1);
  });
}

// END scripts/weekly-digest.mjs — Phase 37 Plan 37-02

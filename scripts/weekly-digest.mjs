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
  combinedMonthlyTotalByTransport,
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
// SUMMARY_KEYS-shaped aggregation (Phase 38 INT-FIX-02 / DIGEST-04 repair)
//
// The pre-fix runDigest validated a SUMMARY_KEYS-seeded `summaryTally` against
// SUMMARY_KEYS — a self-referential check that could never fail. This helper
// produces a SUMMARY_KEYS-shaped tally from REAL aggregated metric data so
// validateSummaryKeys becomes a meaningful runtime drift detector: a future
// llm-report.js key rename/addition leaves the tally missing keys and surfaces
// as a descriptive throw at runtime.
//
// Mapping rules (mirror tests/e2e/lib/llm-report.js classificationToSummaryKey):
//   WRONG_CITATION              → wrong_citation
//   VERIFIER_DISAGREE           → verifier_disagree
//   LLM_HALLUCINATED_SELECTION  → llm_hallucinated_selection
//   LLM_API_ERROR               → llm_api_error
//   HARNESS_ERROR               → harness_error  (synthetic; not in ERROR_CLASSES)
//   PASS                        → passed         (synthetic; not in ERROR_CLASSES)
//   (all others — UI_BROKEN, GOOGLE_DOM_DRIFT, etc.) → not incremented
//
// `total_cost_usd` is METRIC data, not a classification — seeded from the
// `monthlyTotalCostUsd` argument and rounded to 6 decimal places (matches
// llm-report.js convention and llm-ledger.js precision).
// ---------------------------------------------------------------------------
/**
 * Aggregate label-bearing issues into a SUMMARY_KEYS-shaped tally.
 *
 * @param {{ nightlyIssues: object[], quarantineIssues: object[], monthlyTotalCostUsd: number }} opts
 * @returns {Record<string, number>} SUMMARY_KEYS-shaped tally
 */
export function aggregateBySummaryKey({ nightlyIssues, quarantineIssues, monthlyTotalCostUsd }) {
  // Seed all SUMMARY_KEYS to 0 so every key is an own property — the validator
  // checks `k in obj` (not value-truthy), so seeding is what makes drift
  // detection meaningful: a future rename leaves a key NOT in the seed.
  const tally = Object.fromEntries(SUMMARY_KEYS.map((k) => [k, 0]));

  // Merge + dedup by issue.number (matches aggregate() / Pitfall 6 — some
  // issues carry both labels so they must be counted once).
  const byNumber = new Map();
  for (const issue of [...nightlyIssues, ...quarantineIssues]) {
    if (!byNumber.has(issue.number)) {
      byNumber.set(issue.number, issue);
    }
  }

  for (const issue of byNumber.values()) {
    const names = (issue.labels ?? []).map((l) => l?.name).filter(Boolean);
    // Pick category by ERROR_CLASS_SET membership (CR-01 — labels[] order
    // is not guaranteed by GH REST).
    const category = names.find((n) => ERROR_CLASS_SET.has(n));
    let key;
    switch (category) {
      case 'WRONG_CITATION':              key = 'wrong_citation'; break;
      case 'VERIFIER_DISAGREE':           key = 'verifier_disagree'; break;
      case 'LLM_HALLUCINATED_SELECTION':  key = 'llm_hallucinated_selection'; break;
      case 'LLM_API_ERROR':               key = 'llm_api_error'; break;
      // HARNESS_ERROR and PASS are synthetic classifications produced by
      // tests/e2e/lib/report.js — they do not appear as GitHub labels and
      // therefore are not incremented from the issue stream. The keys are
      // still present in the seeded tally (so validateSummaryKeys passes).
      default: key = null;
    }
    if (key !== null) {
      tally[key] += 1;
    }
  }

  // total_cost_usd is metric data — seed from the monthly ledger total.
  // Round to 6 decimals to match llm-report.js and llm-ledger.js conventions.
  const cost = Number(monthlyTotalCostUsd) || 0;
  tally.total_cost_usd = +cost.toFixed(6);

  return tally;
}

// ---------------------------------------------------------------------------
// Cost-vs-cap line (D-15)
// fs.existsSync FIRST — monthlyTotal returns 0 for both $0 and no-ledger (Pitfall 2)
// ---------------------------------------------------------------------------
/**
 * @param {{ ledgerPath?: string, now?: Date }} opts
 * @returns {string}
 */
export function renderCostLine({ ledgerPath, now } = {}) {
  const effectivePath = ledgerPath ?? LEDGER_PATH;
  // D-15: check file existence BEFORE calling readLedger/monthlyTotal.
  // readLedger() returns an empty ledger on file-absence (returns 0 for monthlyTotal),
  // indistinguishable from a real $0 month — must detect absence explicitly.
  if (!fs.existsSync(effectivePath)) {
    return 'cost data unavailable';
  }
  // Phase 48 PRE-03 / D-08-AMEND: thread the test-pinned `now` through to the
  // month-key derivation so the cost-line lookup aligns with the caller's
  // anchor instead of `currentMonth()` (live clock). When `now` is undefined,
  // monthlyTotal defaults to currentMonth() — preserves production behavior.
  const month = now ? now.toISOString().slice(0, 7) : undefined;
  const spent = monthlyTotal(readLedger(effectivePath), month);
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
 *   reportsDir?: string,
 *   fetchAutoFixPrs?: (opts: object) => { prs: Array, fetchedAt: Date, error: string|null }
 * }} opts
 */
export async function runDigest(opts = {}) {
  const repo = opts.repo ?? process.env.GITHUB_REPOSITORY;
  const publishMode = opts.publishMode ?? process.env.DIGEST_PUBLISH_MODE ?? 'auto';
  const ledgerPath = opts.ledgerPath ?? LEDGER_PATH;
  const ghClient = opts.ghClient ?? makeRealGhClient(repo);
  const now = opts.now ?? (() => new Date());
  const reportsDir = opts.reportsDir ?? path.join(PROJECT_ROOT, 'reports');
  // Phase 55 D-16 injected-deps hook — mirrors opts.ghClient pattern.
  // Vitest passes a fake; production callers omit it (defaults to the real
  // child_process.execSync-backed fetchAutoFixPrs exported below).
  const fetchAutoFixPrsImpl = opts.fetchAutoFixPrs ?? fetchAutoFixPrs;

  // (1) Read both label sets unconditionally (never short-circuit — Pitfall 3 / D-03)
  const nightlyIssues = ghClient.listOpenIssuesByLabel('e2e-nightly');
  const quarantineIssues = ghClient.listOpenIssuesByLabel('e2e-quarantine');

  // (2) Compute ISO-week label
  const nowDate = typeof now === 'function' ? now() : now;
  const weekLabel = isoWeekLabel(nowDate);

  // (3) Cost line + monthly total (used both for the rendered cost line AND as
  // metric input to the SUMMARY_KEYS-shaped tally below).
  const costLine = renderCostLine({ ledgerPath });
  const monthlyTotalCostUsd = fs.existsSync(ledgerPath)
    ? monthlyTotal(readLedger(ledgerPath))
    : 0;

  // (4) Aggregate (issue-shape — drives the rendered digest)
  const agg = aggregate({ nightlyIssues, quarantineIssues, now: nowDate });

  // (5) Validate SUMMARY_KEYS contract against REAL aggregated metric data
  // (Phase 38 INT-FIX-02 / DIGEST-04 repair). The pre-fix code validated a
  // SUMMARY_KEYS-seeded `summaryTally` against SUMMARY_KEYS — a self-referential
  // check that could never fail. Now the tally is built from real issue data
  // (via aggregateBySummaryKey), so any future llm-report.js key drift surfaces
  // as a descriptive throw naming the missing key.
  const summaryByKey = aggregateBySummaryKey({
    nightlyIssues,
    quarantineIssues,
    monthlyTotalCostUsd,
  });
  validateSummaryKeys(summaryByKey);

  // (6) Render markdown
  const md = renderDigest({ weekLabel, agg, costLine, now: nowDate });

  // (6.5) Phase 55 DASH-01 + DASH-03 — append Auto-Fix Pipeline section AFTER
  // renderDigest returns (so its ≤50-line budget at line 290 is preserved) and
  // BEFORE the file write below. fetchAutoFixPrs errors are RETURNED (D-15);
  // when present, emit a single stderr warning here (D-16) and degrade the
  // section to all-`n/a` values (the rest of the digest still ships). The
  // ledger is re-read inline so the cost_per_fix numerator
  // (combinedMonthlyTotalByTransport(...).combined) is sourced from the same
  // file the cost line at step (3) reads — single source of truth.
  const ghPrsResult = fetchAutoFixPrsImpl({ now: nowDate });
  if (ghPrsResult.error !== null) {
    process.stderr.write(
      `weekly-digest: auto-fix section degraded — ${ghPrsResult.error}\n`,
    );
  }
  const autoFixLedger = fs.existsSync(ledgerPath)
    ? readLedger(ledgerPath)
    : { months: {} };
  const autoFixSection = renderAutoFixPipelineSection({
    ledger: autoFixLedger,
    ghPrs: ghPrsResult.prs,
    now: nowDate,
  });
  const finalMd = md + '\n\n' + autoFixSection;

  // (7) Write report file (idempotent overwrite, D-11)
  fs.mkdirSync(reportsDir, { recursive: true });
  const reportPath = path.join(reportsDir, `weekly-digest-${weekLabel}.md`);
  fs.writeFileSync(reportPath, finalMd);

  // (8) Publish via DIGEST_PUBLISH_MODE
  const effectiveMode = await resolvePublishMode(publishMode, ghClient);
  const title = `[e2e-digest] Weekly analytics ${weekLabel}`;

  if (effectiveMode === 'discussion') {
    ghClient.createDiscussion(title, finalMd);
  } else {
    // issue (active path, D-05)
    ghClient.createDigestIssue(title, finalMd);
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
// Phase 55 DASH-02 — Auto-Fix Pipeline section
//
// Pure-function markdown renderer (D-14) — caller supplies ledger + ghPrs;
// the function performs ZERO I/O. Emits a `<details>` collapsible section with
// the 7 LOCKED-order metric rows (D-03..D-09). NaN/Infinity guards collapse to
// the literal `n/a` per D-05..D-08; D-09 keeps integer 0 (count semantics).
//
// cost_per_fix uses combinedMonthlyTotalByTransport(ledger, month).combined —
// `.combined` reflects the appendLedgerEntry-time de-duplication discipline
// that satisfies D-06 / SC-3 ("not raw sum") at the upstream insertion point.
//
// time_to_merge_p50 filters to PRs with `mergedAt !== null` BEFORE computing
// the median (D-07).
// ---------------------------------------------------------------------------

// Internal helper: median of a numeric array (returns null on empty).
// Kept module-private (NOT exported) because it has no callers beyond
// renderAutoFixPipelineSection and adding it to the public surface would
// invite drift.
function _median(nums) {
  if (!Array.isArray(nums) || nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Render the Auto-Fix Pipeline `<details>` section.
 *
 * @param {{
 *   ledger: object,
 *   ghPrs: Array<object>,
 *   now: Date,
 * }} opts
 * @returns {string} markdown string opening with `<details>...` and closing `</details>`
 */
export function renderAutoFixPipelineSection({ ledger, ghPrs, now }) {
  const prs = Array.isArray(ghPrs) ? ghPrs : [];
  const nowDate = now instanceof Date ? now : new Date(now);
  const month = nowDate.toISOString().slice(0, 7);

  // (1) auto_fix_attempted — D-03
  //     count of PRs labeled auto-fix:verified OR auto-fix:partial-verified,
  //     regardless of merge state.
  const autoFixAttempted = prs.filter((p) => {
    const names = (p?.labels ?? []).map((l) => l?.name).filter(Boolean);
    return names.includes('auto-fix:verified') || names.includes('auto-fix:partial-verified');
  }).length;

  // (2) verified_merged — D-04
  //     count of PRs labeled auto-fix:verified AND mergedAt !== null.
  const verifiedMerged = prs.filter((p) => {
    const names = (p?.labels ?? []).map((l) => l?.name).filter(Boolean);
    return names.includes('auto-fix:verified') && p?.mergedAt !== null && p?.mergedAt !== undefined;
  }).length;

  // (3) success_rate — D-05
  //     (verified_merged / auto_fix_attempted) * 100, formatted XX.X%.
  //     n/a (literal) when auto_fix_attempted === 0 (NOT 0% — distinct semantics).
  let successRate;
  if (autoFixAttempted === 0) {
    successRate = 'n/a';
  } else {
    const pct = (verifiedMerged / autoFixAttempted) * 100;
    successRate = Number.isFinite(pct) ? `${pct.toFixed(1)}%` : 'n/a';
  }

  // (4) cost_per_fix — D-06 / SC-3
  //     combinedMonthlyTotalByTransport(ledger, month).combined / auto_fix_attempted.
  //     n/a when auto_fix_attempted === 0 OR combined is NaN/Infinity.
  let costPerFix;
  if (autoFixAttempted === 0) {
    costPerFix = 'n/a';
  } else {
    const transportTotals = combinedMonthlyTotalByTransport(ledger ?? { months: {} }, month);
    const combined = transportTotals?.combined;
    if (!Number.isFinite(combined)) {
      costPerFix = 'n/a';
    } else {
      const per = combined / autoFixAttempted;
      costPerFix = Number.isFinite(per) ? `$${per.toFixed(4)}` : 'n/a';
    }
  }

  // (5) time_to_merge_p50 — D-07
  //     median(mergedAt - createdAt) over PRs with mergedAt !== null ONLY.
  //     Xh Ym for p50 ≥ 60min; Xm for p50 < 60min; n/a when filtered set is empty.
  const mergedPrs = prs.filter((p) => p?.mergedAt !== null && p?.mergedAt !== undefined);
  let timeToMergeP50;
  if (mergedPrs.length === 0) {
    timeToMergeP50 = 'n/a';
  } else {
    const deltasMs = mergedPrs
      .map((p) => {
        const merged = new Date(p.mergedAt).getTime();
        const created = new Date(p.createdAt).getTime();
        return merged - created;
      })
      .filter((d) => Number.isFinite(d) && d >= 0);
    const medianMs = _median(deltasMs);
    if (medianMs === null || !Number.isFinite(medianMs)) {
      timeToMergeP50 = 'n/a';
    } else {
      const totalMinutes = Math.round(medianMs / 60000);
      if (totalMinutes >= 60) {
        const hours = Math.floor(totalMinutes / 60);
        const mins = totalMinutes % 60;
        timeToMergeP50 = `${hours}h ${mins}m`;
      } else {
        timeToMergeP50 = `${totalMinutes}m`;
      }
    }
  }

  // (6) fix_attempts_p50 — D-08
  //     median count of distinct auto-fix PRs per `<!-- source_issue: N -->` body marker.
  //     PRs without a parseable marker are excluded from the sample set.
  //     n/a when no parseable markers exist.
  const issueCounts = new Map();
  for (const p of prs) {
    const body = typeof p?.body === 'string' ? p.body : '';
    const match = body.match(/<!--\s*source_issue:\s*(\d+)\s*-->/);
    if (match) {
      const issueId = match[1];
      issueCounts.set(issueId, (issueCounts.get(issueId) ?? 0) + 1);
    }
  }
  let fixAttemptsP50;
  if (issueCounts.size === 0) {
    fixAttemptsP50 = 'n/a';
  } else {
    const counts = Array.from(issueCounts.values());
    const med = _median(counts);
    fixAttemptsP50 = med === null || !Number.isFinite(med) ? 'n/a' : String(med);
  }

  // (7) flake_escalation_count — D-09
  //     count of PRs with BOTH `human-review-required` AND `auto-fix:partial-verified`.
  //     integer 0 (NOT n/a) when zero — count semantics tolerate empty.
  const flakeEscalationCount = prs.filter((p) => {
    const names = (p?.labels ?? []).map((l) => l?.name).filter(Boolean);
    return names.includes('human-review-required') && names.includes('auto-fix:partial-verified');
  }).length;

  // Assemble markdown (D-11 structure)
  const lines = [];
  lines.push('<details>');
  lines.push('<summary>Auto-Fix Pipeline</summary>');
  lines.push('');
  lines.push(`_fetched ${nowDate.toISOString()}_`);
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('| --- | --- |');
  lines.push(`| auto_fix_attempted | ${autoFixAttempted} |`);
  lines.push(`| verified_merged | ${verifiedMerged} |`);
  lines.push(`| success_rate | ${successRate} |`);
  lines.push(`| cost_per_fix | ${costPerFix} |`);
  lines.push(`| time_to_merge_p50 | ${timeToMergeP50} |`);
  lines.push(`| fix_attempts_p50 | ${fixAttemptsP50} |`);
  lines.push(`| flake_escalation_count | ${flakeEscalationCount} |`);
  lines.push('');
  lines.push('</details>');

  return lines.join('\n');
}

/**
 * Fetch auto-fix PRs via a single read-only `gh search prs` invocation.
 *
 * Per D-15: errors are RETURNED (never thrown). On non-zero exit, JSON.parse
 * throw, missing `gh`, or non-array payload → returns `{prs: [], fetchedAt, error}`.
 * Per D-16: this function MUST NOT process.stderr.write — that is the caller's
 * (runDigest's) responsibility.
 *
 * The `execFn` parameter is an injectable seam for Vitest determinism — the
 * default closure wraps child_process.execSync so production behavior is
 * unchanged when callers omit it.
 *
 * @param {{ now: Date, execFn?: (cmd: string, opts: object) => string }} opts
 * @returns {{ prs: Array<object>, fetchedAt: Date, error: string|null }}
 */
export function fetchAutoFixPrs({ now, execFn } = {}) {
  const fetchedAt = now instanceof Date ? now : new Date(now ?? Date.now());
  const cmd =
    'gh search prs --label auto-fix:verified --label auto-fix:partial-verified ' +
    '--json number,state,mergedAt,createdAt,labels,body --limit 100';
  const runner = execFn ?? ((c, o) => execSync(c, o));
  let raw;
  try {
    raw = runner(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    return { prs: [], fetchedAt, error: String(err?.message ?? err) };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return { prs: [], fetchedAt, error: String(err?.message ?? err) };
  }
  if (!Array.isArray(parsed)) {
    return { prs: [], fetchedAt, error: 'gh search prs returned non-array payload' };
  }
  return { prs: parsed, fetchedAt, error: null };
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

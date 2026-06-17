#!/usr/bin/env node
//
// scripts/review-reports.mjs — Level-1 operator helper for triaging bug reports.
//
// Reads the production BUG_REPORTS KV namespace (the same store the Worker /report
// route writes to) and presents it as a filterable digest, so the maintainer is not
// hand-running `wrangler kv key get` per report. Also supports a lightweight review
// status written back onto the record, and a JSON export to preserve bug-worthy
// reports before the 90-day TTL deletes them.
//
// Zero-dependency: shells out to the already-authed `wrangler` CLI (run from worker/).
// ALWAYS passes --remote — wrangler v4 `kv key get/list` default to the LOCAL miniflare
// store and return a false-empty []; --remote is required to hit production.
//
// Usage:
//   node scripts/review-reports.mjs [list]            # default: filterable digest
//   node scripts/review-reports.mjs show <fp>          # full JSON record(s) for a fingerprint
//   node scripts/review-reports.mjs status <fp> <ts> <state>   # set review status on one record
//   node scripts/review-reports.mjs export [file]      # write filtered records (+ key/expiration) to JSON
//
// Filters (list/export):  --category <c>  --status <s>  --patent <substr>  --since <Nd|ISO>  --min-dups <n>  --json
// Global:                 --namespace-id <id>   -h/--help
//
// Review states: open (default, none set) | reviewed | triaged | resolved | wontfix

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER_DIR = join(HERE, '..', 'worker');
export const REVIEW_STATES = ['open', 'reviewed', 'triaged', 'resolved', 'wontfix'];
const TTL_90_DAYS = 7776000;

// ───────────────────────── pure helpers (exported for tests) ─────────────────────────

/** Extract the BUG_REPORTS namespace id from a wrangler.toml string. */
export function getNamespaceId(wranglerToml) {
  const m = wranglerToml.match(/binding\s*=\s*"BUG_REPORTS"[\s\S]*?id\s*=\s*"([0-9a-fA-F]+)"/);
  if (!m) throw new Error('BUG_REPORTS namespace id not found in worker/wrangler.toml');
  return m[1];
}

/** Parse a --since value: "7d" / "30d" (N days ago) or an ISO/parseable date → epoch ms, else null. */
export function parseSince(s, now = Date.now()) {
  if (!s) return null;
  const days = String(s).match(/^(\d+)\s*d$/i);
  if (days) return now - Number(days[1]) * 86400_000;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : t;
}

/** Review status of a record ('open' when none has been set). */
export function reviewStatus(record) {
  return (record && record._review && record._review.status) || 'open';
}

/** Apply list/export filters to an array of report records. */
export function filterReports(reports, filters = {}, now = Date.now()) {
  let out = reports;
  if (filters.category) out = out.filter((r) => r.category === filters.category);
  if (filters.patent) out = out.filter((r) => String(r.patentNumber || '').includes(filters.patent));
  if (filters.status) out = out.filter((r) => reviewStatus(r) === filters.status);
  if (filters.minDups != null) out = out.filter((r) => (r.duplicate_count ?? 0) >= filters.minDups);
  const since = parseSince(filters.since, now);
  if (since != null) out = out.filter((r) => (r.timestamp ?? r._ts ?? 0) >= since);
  return out;
}

/** Newest first. */
export function sortReports(reports) {
  return [...reports].sort((a, b) => (b.timestamp ?? b._ts ?? 0) - (a.timestamp ?? a._ts ?? 0));
}

const tally = (rows, key) =>
  rows.reduce((m, r) => ((m[key(r)] = (m[key(r)] || 0) + 1), m), {});
const tallyLine = (obj) =>
  Object.entries(obj).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · ') || '(none)';

function pad(s, n) {
  s = String(s ?? '');
  return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length);
}

/** Render a human digest (header tallies + one row per report). */
export function formatDigest(reports, now = Date.now()) {
  const rows = sortReports(reports);
  const lines = [];
  lines.push(`Bug reports — ${rows.length} record(s)`);
  lines.push(`By category:  ${tallyLine(tally(rows, (r) => r.category || '(none)'))}`);
  lines.push(`By status:    ${tallyLine(tally(rows, (r) => reviewStatus(r)))}`);
  lines.push('');
  lines.push(
    `${pad('DATE', 11)} ${pad('FP', 9)} ${pad('CATEGORY', 20)} ${pad('PATENT', 14)} ${pad('DUPS', 5)} ${pad('STATUS', 9)} NOTE`
  );
  for (const r of rows) {
    const ts = r.timestamp ?? r._ts ?? 0;
    const date = ts ? new Date(ts).toISOString().slice(0, 10) : '?';
    const fp = (r.fingerprint || r._fp || '').slice(0, 8);
    const note = (r.note || '').replace(/\s+/g, ' ').slice(0, 48);
    lines.push(
      `${pad(date, 11)} ${pad(fp, 9)} ${pad(r.category, 20)} ${pad(r.patentNumber, 14)} ${pad(r.duplicate_count ?? 0, 5)} ${pad(reviewStatus(r), 9)} ${note}`
    );
  }
  return lines.join('\n');
}

/** Tiny argv parser → { command, positionals, filters, options }. Exported for tests. */
export function parseArgs(argv) {
  const out = { command: 'list', positionals: [], filters: {}, json: false, help: false, namespaceId: null };
  const rest = [...argv];
  if (rest[0] && !rest[0].startsWith('-')) out.command = rest.shift();
  while (rest.length) {
    const a = rest.shift();
    switch (a) {
      case '-h': case '--help': out.help = true; break;
      case '--json': out.json = true; break;
      case '--category': out.filters.category = rest.shift(); break;
      case '--status': out.filters.status = rest.shift(); break;
      case '--patent': out.filters.patent = rest.shift(); break;
      case '--since': out.filters.since = rest.shift(); break;
      case '--min-dups': out.filters.minDups = Number(rest.shift()); break;
      case '--namespace-id': out.namespaceId = rest.shift(); break;
      default:
        if (a.startsWith('-')) throw new Error(`Unknown option: ${a}`);
        out.positionals.push(a);
    }
  }
  return out;
}

// ───────────────────────── I/O (wrangler) ─────────────────────────

function wrangler(args) {
  return execFileSync('npx', ['wrangler', ...args], {
    cwd: WORKER_DIR, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
  });
}
// wrangler prints a banner before JSON on stdout; slice from the first bracket.
function parseWranglerJson(out, opener) {
  const i = out.indexOf(opener);
  if (i < 0) throw new Error(`No JSON in wrangler output:\n${out.slice(0, 300)}`);
  return JSON.parse(out.slice(i));
}

export function listReportKeys(nsId) {
  const keys = parseWranglerJson(wrangler(['kv', 'key', 'list', '--remote', `--namespace-id=${nsId}`]), '[');
  return keys.filter((k) => k.name.startsWith('report:'));
}
export function getRecord(nsId, name) {
  return parseWranglerJson(wrangler(['kv', 'key', 'get', '--remote', `--namespace-id=${nsId}`, name]), '{');
}

/** Load every report:* record, decorated with _key/_fp/_ts/_expiration. */
export function loadReports(nsId) {
  return listReportKeys(nsId).map((k) => {
    const [, fp, ts] = k.name.split(':');
    const rec = getRecord(nsId, k.name);
    return { ...rec, _key: k.name, _fp: fp, _ts: Number(ts), _expiration: k.expiration ?? null };
  });
}

/** Write a review status onto one record, preserving the original TTL/expiration. */
export function writeStatus(nsId, fp, ts, state) {
  const key = `report:${fp}:${ts}`;
  const keyMeta = listReportKeys(nsId).find((k) => k.name === key);
  if (!keyMeta) throw new Error(`Record not found: ${key}`);
  const rec = getRecord(nsId, key);
  rec._review = { status: state, at: new Date().toISOString() };
  const tmp = join(mkdtempSync(join(tmpdir(), 'pct-report-')), 'value.json');
  writeFileSync(tmp, JSON.stringify(rec));
  const ttlArgs = keyMeta.expiration
    ? [`--expiration=${keyMeta.expiration}`]            // preserve original 90-day expiry
    : [`--ttl=${TTL_90_DAYS}`];
  wrangler(['kv', 'key', 'put', '--remote', `--namespace-id=${nsId}`, key, '--path', tmp, ...ttlArgs]);
  return rec;
}

const HELP = `review-reports — triage the BUG_REPORTS KV namespace (production, --remote)

  node scripts/review-reports.mjs [list]            filterable digest (default)
  node scripts/review-reports.mjs show <fp>          full JSON record(s) for a fingerprint
  node scripts/review-reports.mjs status <fp> <ts> <state>   set review status on one record
  node scripts/review-reports.mjs export [file]      write filtered records (+key/expiration) to JSON

Filters (list/export): --category <c> --status <s> --patent <substr> --since <Nd|ISO> --min-dups <n> --json
States: ${REVIEW_STATES.join(' | ')}
`;

function main(argv) {
  const args = parseArgs(argv);
  if (args.help) { process.stdout.write(HELP); return; }

  const nsId = args.namespaceId || getNamespaceId(readFileSync(join(WORKER_DIR, 'wrangler.toml'), 'utf8'));

  if (args.command === 'status') {
    const [fp, ts, state] = args.positionals;
    if (!fp || !ts || !state) throw new Error('Usage: status <fp> <ts> <state>');
    if (!REVIEW_STATES.includes(state)) throw new Error(`Invalid state '${state}'. One of: ${REVIEW_STATES.join(', ')}`);
    writeStatus(nsId, fp, ts, state);
    console.log(`✓ report:${fp}:${ts} → status: ${state}`);
    return;
  }

  if (args.command === 'show') {
    const [fp] = args.positionals;
    if (!fp) throw new Error('Usage: show <fp>');
    const matches = loadReports(nsId).filter((r) => (r.fingerprint || r._fp) === fp);
    if (!matches.length) { console.log(`No records for fingerprint ${fp}`); return; }
    console.log(JSON.stringify(matches, null, 2));
    return;
  }

  // list (default) | export
  const filtered = filterReports(loadReports(nsId), args.filters);

  if (args.command === 'export') {
    const file = args.positionals[0] || `reports-export-${new Date().toISOString().slice(0, 10)}.json`;
    writeFileSync(file, JSON.stringify(sortReports(filtered), null, 2));
    console.log(`✓ exported ${filtered.length} record(s) → ${file}`);
    return;
  }

  if (args.command !== 'list') throw new Error(`Unknown command: ${args.command}\n\n${HELP}`);
  process.stdout.write(args.json ? JSON.stringify(sortReports(filtered), null, 2) + '\n' : formatDigest(filtered) + '\n');
}

// Only run when invoked directly (not when imported by tests).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    console.error(`✖ ${err.message}`);
    process.exit(1);
  }
}

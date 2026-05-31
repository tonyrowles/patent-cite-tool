// scripts/check-deps-and-pr.mjs
//
// Phase 40 Plan 40-02 — DEPS-01 (frozen WATCHLIST) + DEPS-03 (partition logic).
//
// Single-file ESM CLI: queries `npm outdated --json` + `npm audit --json`,
// partitions packages into security[] / minor[] / major[] / skipped[]
// (NEVER_AUTO_BUMP), writes $GITHUB_OUTPUT lines and /tmp/*-pr-body.md files
// for 40-03's peter-evans/create-pull-request@v8 steps to consume.
//
// Pitfall A (40-RESEARCH.md lines 745-754): `npm outdated --json` exits
//   with status code 1 when ≥1 package is outdated — THIS IS THE EXPECTED
//   case. We must use spawnSync (NOT execSync — execSync throws on non-zero
//   exit) and read stdout regardless of the exit code.
//
// 40-CONTEXT locked decision #1: tests/e2e/.manual-sdk-bumps.json is
//   COMMITTED (audit-trail value > file-churn cost). Bootstrapped to
//   `{ version: 1, notes: [] }` by Task 2b alongside this script.
//
// 40-CONTEXT locked decision #4: branch names are CONSTANT per-package
//   (e.g., `v40-deps-update/pdfjs-dist-security`) and the grouped minor
//   branch is `v40-deps-update/minor`. The downstream peter-evans/cpr@v8
//   step in 40-03 sets `delete-branch: true` so re-runs supersede stale PRs.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Frozen contracts — DEPS-01
// ---------------------------------------------------------------------------

// WATCHLIST — frozen 6-package tuple. Pinned by Vitest A1-A5.
//
// Bare-key mismatch note: 40-RESEARCH.md and 40-CONTEXT.md narrative text
// wrote `playwright` (bare), but `package.json` installs the SCOPED
// `@playwright/test`. `npm outdated --json` keys by the installed package
// name, so the watchlist key MUST match the scoped name; otherwise the
// `outdated[pkg]` lookup misses every Playwright drift event. The
// "monitor Playwright drift" intent is preserved — only the literal name
// is corrected from the research bug.
export const WATCHLIST = Object.freeze([
  '@playwright/test',
  'pdfjs-dist',
  'sharp',
  'vitest',
  'esbuild',
  '@anthropic-ai/sdk',
]);

// NEVER_AUTO_BUMP — REQUIREMENTS.md out-of-scope clause + 40-CONTEXT locked
// decision. `@anthropic-ai/sdk` is INTENTIONALLY pinned EXACT at 0.100.1 and
// any drift requires manual security review. Pinned by Vitest A3-A5 and B4.
export const NEVER_AUTO_BUMP = Object.freeze(['@anthropic-ai/sdk']);

// Default location for the manual-bump audit-trail file (COMMITTED).
export const MANUAL_BUMP_NOTES_PATH = path.resolve(
  PROJECT_ROOT,
  'tests/e2e/.manual-sdk-bumps.json',
);

// ---------------------------------------------------------------------------
// Subprocess helpers — Pitfall A
// ---------------------------------------------------------------------------

/**
 * Run `npm outdated --json`. Pitfall A: spawnSync, NEVER execSync — npm
 * outdated exits status:1 when packages are outdated (the expected case),
 * and execSync would throw and crash the script.
 *
 * @returns {Record<string, {current: string, wanted: string, latest: string, type: string, dependent?: string, location?: string}>}
 *   Parsed JSON object keyed by package name. Empty {} if npm produced no
 *   stdout (e.g., everything up-to-date).
 */
export function readOutdated() {
  const result = spawnSync('npm', ['outdated', '--json'], { encoding: 'utf8' });
  const stdout = result?.stdout?.trim();
  if (!stdout) return {};
  try {
    return JSON.parse(stdout);
  } catch {
    // npm rarely emits malformed JSON, but defensive: return empty rather
    // than throw — the workflow keeps going and just reports "nothing to PR".
    return {};
  }
}

/**
 * Run `npm audit --json`. Same non-throw contract — audit exits non-zero
 * when vulnerabilities exist (also expected). Returns a shape with at
 * least `{ vulnerabilities: {} }` so partition logic can dereference
 * safely on parse failure.
 *
 * @returns {{ auditReportVersion?: number, vulnerabilities: Record<string, {severity: string, fixAvailable: false | {name: string, version: string, isSemVerMajor: boolean}}>, metadata?: object }}
 */
export function readAudit() {
  const result = spawnSync('npm', ['audit', '--json'], { encoding: 'utf8' });
  const stdout = result?.stdout?.trim();
  if (!stdout) return { vulnerabilities: {} };
  try {
    const parsed = JSON.parse(stdout);
    if (!parsed.vulnerabilities) parsed.vulnerabilities = {};
    return parsed;
  } catch {
    return { vulnerabilities: {} };
  }
}

// ---------------------------------------------------------------------------
// Version categorization — DEPS-03
// ---------------------------------------------------------------------------

/**
 * Categorize a version delta as 'major' | 'minor' | 'patch'.
 *
 * Decision lock (per 40-02-PLAN.md Group B): for 0.x (pre-1.0) packages
 * where the major slot is 0 in BOTH current and latest, treat a change in
 * the second slot (0.27 → 0.28) as MINOR — not MAJOR. This is the most
 * common Node-ecosystem convention for 0.x packages; many 0.x libraries
 * deliberately keep breaking changes in the second slot (esbuild is a
 * notable example). Test B1 pins this behavior so a future refactor
 * cannot silently flip it.
 *
 * @param {string} current  e.g. "0.27.3"
 * @param {string} latest   e.g. "0.28.0"
 * @returns {'major' | 'minor' | 'patch'}
 */
export function categorize(current, latest) {
  const cur = current.split('.').map((s) => parseInt(s, 10) || 0);
  const lat = latest.split('.').map((s) => parseInt(s, 10) || 0);
  // Pad to length 3 in case a version is "1.0" (unusual but defensive).
  while (cur.length < 3) cur.push(0);
  while (lat.length < 3) lat.push(0);
  if (lat[0] > cur[0]) return 'major';
  if (lat[0] < cur[0]) return 'patch'; // downgrade — treat as patch (won't happen via npm outdated)
  // major slot equal — check minor slot
  if (lat[1] > cur[1]) return 'minor';
  return 'patch';
}

// ---------------------------------------------------------------------------
// Partition — DEPS-03
// ---------------------------------------------------------------------------

/**
 * Partition outdated watchlist packages into four buckets.
 *
 * Filter chain (per 40-RESEARCH.md lines 456-466):
 *   1. WATCHLIST membership — packages not on watchlist are ignored
 *   2. NEVER_AUTO_BUMP short-circuit — flagged but routed to `skipped[]`
 *   3. Security: vuln severity in {moderate, high, critical}
 *      AND fixAvailable !== false
 *      AND !fixAvailable.isSemVerMajor (don't auto-bump across major boundary)
 *   4. Non-security: categorize() — minor/patch → `minor[]`; major → `major[]`
 *
 * @param {{outdated: object, audit: {vulnerabilities: object}}} input
 * @returns {{security: string[], minor: string[], major: string[], skipped: string[]}}
 */
export function partitionOutdated({ outdated, audit }) {
  const security = [];
  const minor = [];
  const major = [];
  const skipped = [];
  const vulns = (audit && audit.vulnerabilities) || {};
  for (const pkg of WATCHLIST) {
    const drift = outdated[pkg];
    if (!drift) continue;
    if (NEVER_AUTO_BUMP.includes(pkg)) {
      // Pitfall 6 defense — SDK never enters the partition. Write-side
      // effect happens in main() so this function stays pure.
      skipped.push(pkg);
      continue;
    }
    const v = vulns[pkg];
    const hasFlaggedVuln =
      v && ['moderate', 'high', 'critical'].includes(v.severity) && v.fixAvailable !== false && v.fixAvailable;
    if (hasFlaggedVuln && v.fixAvailable.isSemVerMajor) {
      // Pitfall: a security vuln whose ONLY available fix crosses a MAJOR
      // semver boundary is NEVER auto-PR'd — the cross-major bump is too
      // risky to merge without human review. Route to major[] (logged-only)
      // even though categorize() of the version delta might say "minor".
      // Test B1 pins this routing (sharp 0.34.5→0.35.0 with isSemVerMajor:
      // true lands in major, not minor).
      major.push(pkg);
      continue;
    }
    if (hasFlaggedVuln) {
      security.push(pkg);
      continue;
    }
    const cat = categorize(drift.current, drift.latest);
    if (cat === 'major') major.push(pkg);
    else minor.push(pkg); // patch and minor share the same grouped PR
  }
  return { security, minor, major, skipped };
}

// ---------------------------------------------------------------------------
// Manual-bump audit trail — NEVER_AUTO_BUMP side effect
// ---------------------------------------------------------------------------

/**
 * Append (or dedup) a manual-review-required note for a package that drifted
 * but is on NEVER_AUTO_BUMP. The note file is the COMMITTED
 * `tests/e2e/.manual-sdk-bumps.json` per 40-CONTEXT locked decision #1.
 *
 * Idempotency guard (40-RESEARCH.md lines 692-694): if a note with the same
 * (pkg, latest) tuple already exists, this function is a no-op. A note with
 * the same pkg but a DIFFERENT latest version appends a new note (multiple
 * SDK releases produce multiple notes).
 *
 * @param {{pkg: string, current: string, latest: string, notesPath?: string}} args
 */
export function writeManualBumpNote({ pkg, current, latest, notesPath = MANUAL_BUMP_NOTES_PATH }) {
  let log;
  try {
    log = JSON.parse(fs.readFileSync(notesPath, 'utf8'));
    if (!log || typeof log !== 'object' || !Array.isArray(log.notes)) {
      log = { version: 1, notes: [] };
    }
  } catch {
    log = { version: 1, notes: [] };
  }
  // Dedup on (pkg, latest)
  if (log.notes.find((n) => n.pkg === pkg && n.latest === latest)) return;
  log.notes.push({
    iso: new Date().toISOString(),
    pkg,
    current,
    latest,
    action: 'manual-review-required',
    reason: `package is on NEVER_AUTO_BUMP list — manual security review required before bump`,
  });
  fs.mkdirSync(path.dirname(notesPath), { recursive: true });
  fs.writeFileSync(notesPath, JSON.stringify(log, null, 2) + '\n');
}

// ---------------------------------------------------------------------------
// $GITHUB_OUTPUT emission + body files
// ---------------------------------------------------------------------------

function appendOutput(line) {
  const target = process.env.GITHUB_OUTPUT;
  if (!target) return;
  fs.appendFileSync(target, line + '\n');
}

function writeBody(filePath, contents) {
  fs.writeFileSync(filePath, contents);
}

function buildSecurityBody(pkgs, outdated) {
  if (pkgs.length === 0) {
    return '# Security dependency updates\n\nNo security updates this run.\n';
  }
  const lines = [
    '# Security dependency updates',
    '',
    'Automated security PR opened by Phase 40 v40-deps-update workflow.',
    '',
    '| Package | Current | Latest |',
    '|---------|---------|--------|',
  ];
  for (const pkg of pkgs) {
    const d = outdated[pkg] || {};
    lines.push(`| ${pkg} | ${d.current || '?'} | ${d.latest || '?'} |`);
  }
  lines.push('');
  lines.push('Gated by the full nightly suite before draft → ready transition.');
  lines.push('');
  return lines.join('\n');
}

function buildMinorBody(pkgs, outdated) {
  if (pkgs.length === 0) {
    return '# Minor dependency updates\n\nNo minor updates this run.\n';
  }
  const lines = [
    '# Minor dependency updates',
    '',
    'Automated grouped minor-update PR opened by Phase 40 v40-deps-update workflow.',
    '',
    '| Package | Current | Latest |',
    '|---------|---------|--------|',
  ];
  for (const pkg of pkgs) {
    const d = outdated[pkg] || {};
    lines.push(`| ${pkg} | ${d.current || '?'} | ${d.latest || '?'} |`);
  }
  lines.push('');
  lines.push('Gated by the full nightly suite before draft → ready transition.');
  lines.push('');
  return lines.join('\n');
}

/**
 * Emit $GITHUB_OUTPUT lines + body files for the workflow to consume.
 *
 * Branch naming (40-CONTEXT locked decision #4): constant per-package for
 * security (so peter-evans/cpr@v8 with delete-branch:true supersedes stale
 * PRs deterministically); single grouped branch for minor.
 *
 * Multi-security-pkg handling: emit comma-joined `security_packages` plus
 * the FIRST package's branch name in `security_branch`. 40-03's workflow
 * uses the comma-joined list to drive a matrix or to open separate PRs;
 * Phase 40-02 keeps this CLI simple by emitting the canonical branch for
 * the first security package only.
 *
 * @param {{partition: object, outdated: object, securityBodyPath?: string, minorBodyPath?: string}} args
 */
export function emit({
  partition,
  outdated,
  securityBodyPath = '/tmp/security-pr-body.md',
  minorBodyPath = '/tmp/minor-pr-body.md',
}) {
  appendOutput(`security_count=${partition.security.length}`);
  appendOutput(`security_packages=${partition.security.join(',')}`);
  const secPkg = partition.security[0] || '';
  appendOutput(`security_branch=v40-deps-update/${secPkg}-security`);
  appendOutput(`minor_count=${partition.minor.length}`);
  appendOutput(`minor_packages=${partition.minor.join(',')}`);
  appendOutput(`minor_branch=v40-deps-update/minor`);
  writeBody(securityBodyPath, buildSecurityBody(partition.security, outdated));
  writeBody(minorBodyPath, buildMinorBody(partition.minor, outdated));
}

// ---------------------------------------------------------------------------
// Main orchestrator
// ---------------------------------------------------------------------------

export async function main() {
  const outdated = readOutdated();
  const audit = readAudit();
  const partition = partitionOutdated({ outdated, audit });
  // Side-effect: skipped (NEVER_AUTO_BUMP) packages get an audit-trail note.
  for (const pkg of partition.skipped) {
    const drift = outdated[pkg];
    if (!drift) continue;
    writeManualBumpNote({ pkg, current: drift.current, latest: drift.latest });
  }
  // Major bumps: logged-only — tracking-issue creation is out of plan scope
  // (40-CONTEXT explicitly defers auto-PRs for major bumps).
  if (partition.major.length > 0) {
    process.stderr.write(
      `[major] skipping auto-PR for: ${partition.major.join(', ')} ` +
        `(open tracking issue manually)\n`,
    );
  }
  emit({ partition, outdated });
  // Stdout: JSON partition summary. Useful for local debugging and for
  // workflow log capture.
  process.stdout.write(JSON.stringify(partition, null, 2) + '\n');
}

// isMain guard — mirrors scripts/weekly-digest.mjs:492-501 idiom
const isMain =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  main().catch((err) => {
    process.stderr.write(err.stack || String(err));
    process.stderr.write('\n');
    process.exit(1);
  });
}

// END scripts/check-deps-and-pr.mjs — Phase 40 Plan 40-02

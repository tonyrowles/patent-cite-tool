// scripts/select-cron-cases.mjs
//
// Phase 29 (CRON-02) — rotating-sample selector for the nightly cron.
//
// Sunday (getUTCDay()===0): emit all live cases.
// Mon-Sat: emit a deterministic 30-case slice starting at
//   (weekOfYear + dayOfWeek) % liveCases.length, wrapping around the array.
//
// The `live` filter mirrors tests/e2e/specs/regression.spec.js exactly:
//   - SYNTHETIC_CATEGORIES (gutter) — no live Google Patents page
//   - TIMEOUT_PILL_DEFERRED_IDS — 9 cases the extension cannot currently cite
//
// CLI: `node scripts/select-cron-cases.mjs [--full]` prints a pipe-separated
// case-id list to stdout, consumable as a Playwright --grep regex.
//
// MUST use UTC date methods (getUTCDay, getUTCFullYear) so the rotation is
// stable across timezone interpretations. GitHub Actions ubuntu-latest is UTC
// but the explicit choice removes any ambiguity.
//
// Live count: 76 total - 1 synthetic (gutter) - 9 TIMEOUT_PILL_DEFERRED = 66.
// Rotation modulus: liveCases.length (66), not 76 — guarantees exactly 30
// live runnable cases every weekday, regardless of deferred-ID clustering.
// See .planning/phases/29-ci-nightly-cron-+-auto-issue-filing/29-RESEARCH.md
// Open Question #1 (RESOLVED).

import { TEST_CASES } from '../tests/test-cases.js';

// MUST match tests/e2e/specs/regression.spec.js verbatim.
export const SYNTHETIC_CATEGORIES = new Set(['gutter']);
export const TIMEOUT_PILL_DEFERRED_IDS = new Set([
  'US11427642-repetitive',
  'US4723129-claims',
  'US5371234-chemical-cross-col',
  'US5371234-claims',
  'US7346586-claims-repetitive',
  'US8352400-claims',
  'US5440748-claims',
  'US5440748-repetitive',
  'US4723129-claims-repetitive',
]);

/**
 * Returns the filtered live-runnable subset of TEST_CASES.
 * Excludes TIMEOUT_PILL_DEFERRED_IDS and SYNTHETIC_CATEGORIES.
 *
 * @returns {Array<{id: string, category: string}>}
 */
export function getLiveCases() {
  return TEST_CASES.filter(tc =>
    !TIMEOUT_PILL_DEFERRED_IDS.has(tc.id) &&
    !SYNTHETIC_CATEGORIES.has(tc.category)
  );
}

/**
 * ISO-ish week-of-year using UTC date methods.
 * Sufficient for rotation purposes — does not need ISO 8601 week numbering
 * correctness; only needs to be stable and monotonically increasing per day.
 *
 * @param {Date} d
 * @returns {number}
 */
function getUTCWeekOfYear(d) {
  const startOfYear = Date.UTC(d.getUTCFullYear(), 0, 1);
  const dayMs = 86400000;
  return Math.ceil(((d.getTime() - startOfYear) / dayMs + 1) / 7);
}

/**
 * Select cases for the nightly cron run.
 *
 * @param {object} [opts]
 * @param {Date}    [opts.now=new Date()]   — system time (test-injectable)
 * @param {boolean} [opts.forceFull=false]  — bypass weekday rotation, emit all live cases
 * @returns {Array<{id: string, category: string, patentFile?: string, selectedText?: string}>}
 */
export function selectCronCases(opts = {}) {
  const now = opts.now ?? new Date();
  const forceFull = opts.forceFull === true;
  const liveCases = getLiveCases();

  const dayOfWeek = now.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat

  // Sunday or --full override: return the full live suite
  if (forceFull || dayOfWeek === 0) {
    return liveCases.slice();
  }

  // Mon-Sat: deterministic 30-case rotating window
  // rotationStart = (weekOfYear + dayOfWeek) mod liveCases.length
  // Double-mod idiom for safety against any edge cases with large values.
  const weekOfYear = getUTCWeekOfYear(now);
  const rotationStart = ((weekOfYear + dayOfWeek) % liveCases.length + liveCases.length) % liveCases.length;

  const selected = [];
  for (let i = 0; i < 30; i++) {
    selected.push(liveCases[(rotationStart + i) % liveCases.length]);
  }
  return selected;
}

// ---------------------------------------------------------------------------
// CLI entrypoint — `node scripts/select-cron-cases.mjs [--full]`
//
// Prints a pipe-joined list of case IDs to stdout. The output is intended for
// use with `npx playwright test --grep "$(node scripts/select-cron-cases.mjs)"`
// which treats the pipe characters as regex OR separators.
//
// Exit codes: 0 on success (always).
// ---------------------------------------------------------------------------

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const forceFull = process.argv.includes('--full');
  const cases = selectCronCases({ forceFull });
  process.stdout.write(cases.map(c => c.id).join('|') + '\n');
}

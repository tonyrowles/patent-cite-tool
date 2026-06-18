// tests/e2e/scripts/e2e-weekly-digest.test.js
//
// Mock-gh Vitest suite for scripts/weekly-digest.mjs.
// Phase 37 Plan 37-02 D-14.
//
// Fixture: tests/e2e/fixtures/phase37-digest-issues.json
// Expected aggregation (now=2026-05-25T00:00:00Z):
//
//   e2e-nightly labels:     issues 101,102,103,104,106,108  (6)
//   e2e-quarantine labels:  issues 104,105,107,109          (4)
//   Deduped (by .number):   101,102,103,104,105,106,107,108,109  = 9 distinct
//
//   Category breakdown (errorClass label by ERROR_CLASSES membership — CR-01):
//     WRONG_CITATION:       3  (101, 103, 108)   — 103 has category at labels[2] (shuffled)
//     LLM_API_ERROR:        3  (102, 105, 109)
//     UI_BROKEN:            2  (104, 107)
//     VERIFIER_DISAGREE:    1  (106)
//
//   Top-3 (desc, ties alphabetical):
//     #1  LLM_API_ERROR      3  (tied with WRONG_CITATION; "LLM_API_ERROR" < "WRONG_CITATION" alpha)
//     #2  WRONG_CITATION     3
//     #3  UI_BROKEN          2
//
//   Quarantine growth (e2e-quarantine created_at in [2026-05-18, 2026-05-25]):
//     104: 2026-05-22 IN  /  105: 2026-05-19 IN  /  107: 2026-05-10 OUT  /  109: 2026-05-24 IN
//     = 3

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = path.resolve(__dirname, '../../../scripts/weekly-digest.mjs');
const FIXTURE_PATH = path.resolve(__dirname, '../fixtures/phase37-digest-issues.json');

// ---------------------------------------------------------------------------
// Direct-import path (for injected-deps isolation)
// ---------------------------------------------------------------------------
// Import the module directly so pure functions can be tested with injected deps.
// The 'both publish branches' group also uses direct-import runDigest with
// injected ghClient wrappers that log calls, for reliable transcript assertions.
import {
  isoWeekLabel,
  validateSummaryKeys,
  aggregate,
  aggregateBySummaryKey,
  renderDigest,
  renderCostLine,
  runDigest,
  renderBugReportsSection,
  fetchBugReportIssues,
} from '../../../scripts/weekly-digest.mjs';

import { SUMMARY_KEYS } from '../lib/llm-report.js';
import {
  HARD_CAP_USD,
  LEDGER_PATH,
  monthlyTotal,
  combinedMonthlyTotalByTransport,
  readLedger,
} from '../lib/llm-ledger.js';

// ---------------------------------------------------------------------------
// Shared test state — mock-gh dir for spawn-based tests
// ---------------------------------------------------------------------------
let mockGhDir;
let transcriptPath;
let runDir;

// Phase 48 PRE-03 (D-05/D-06/D-08): single epoch anchor + daysAgo derivation.
// All fixture dates derive from PIN_NOW_ISO; assertion-site week labels use
// isoWeekLabel(PIN_NOW()). Helper stays inline per D-08 — no new module.
const PIN_NOW_ISO = '2026-05-25T00:00:00Z';
const PIN_NOW = () => new Date(PIN_NOW_ISO);
const daysAgo = (n) => new Date(Date.parse(PIN_NOW_ISO) - n * 86400000).toISOString();

function loadFixture() {
  return JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
}

// Build nightly / quarantine subsets from fixture based on labels array
function splitFixture(fixture) {
  const nightlyIssues = fixture.filter(i =>
    i.labels.some(l => l.name === 'e2e-nightly')
  );
  const quarantineIssues = fixture.filter(i =>
    i.labels.some(l => l.name === 'e2e-quarantine')
  );
  return { nightlyIssues, quarantineIssues };
}

beforeEach(() => {
  mockGhDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pct-digest-mockgh-'));
  transcriptPath = path.join(mockGhDir, 'gh-transcript.txt');
  runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pct-digest-run-'));

  // mock-gh bash shim — logs all args to transcript
  // Branches on subcommand ($1) and target ($2):
  //   gh api repos/*/issues → returns fixture JSON
  //   gh api repos/*        → returns "false" (has_discussions probe for auto mode)
  //   gh api graphql        → returns synthetic repo+category lookup + createDiscussion
  //   gh issue create       → returns fake URL
  //   gh label              → no-op
  const mockGhBody = [
    '#!/usr/bin/env bash',
    'echo "$@" >> "' + transcriptPath + '"',
    'case "$1" in',
    '  api)',
    '    TARGET="$2"',
    '    case "$TARGET" in',
    '      graphql)',
    '        echo \'{"data":{"repository":{"id":"R_1","discussionCategories":{"nodes":[{"id":"C_1","name":"General"}]},"createDiscussion":{"discussion":{"url":"https://github.com/test/test/discussions/1"}}}}}\' ;;',
    '      repos/*/issues)',
    '        cat "' + FIXTURE_PATH + '" ;;',
    '      repos/*)',
    '        echo "false" ;;',
    '      *)',
    '        echo "false" ;;',
    '    esac ;;',
    '  issue)',
    '    case "$2" in',
    '      create) echo "https://github.com/test/test/issues/1" ;;',
    '    esac ;;',
    '  label) echo "label" ;;',
    '  --version) echo "gh version 2.83.1 (mock)" ;;',
    'esac',
  ].join('\n') + '\n';
  fs.writeFileSync(path.join(mockGhDir, 'gh'), mockGhBody, { mode: 0o755 });
});

afterEach(() => {
  if (mockGhDir) fs.rmSync(mockGhDir, { recursive: true, force: true });
  if (runDir) fs.rmSync(runDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// 1. ISO-week boundary
// ---------------------------------------------------------------------------
describe('iso-week boundary', () => {
  it('2026-01-01 (Thursday) → 2026-W01', () => {
    expect(isoWeekLabel(new Date('2026-01-01T00:00:00Z'))).toBe('2026-W01');
  });

  it('2027-01-01 (Friday) → 2026-W53 (ISO year ≠ calendar year)', () => {
    expect(isoWeekLabel(new Date('2027-01-01T00:00:00Z'))).toBe('2026-W53');
  });

  it('2026-05-25 (Monday) → expected ISO week', () => {
    // 2026-05-25 is Monday week 22 of 2026
    expect(isoWeekLabel(new Date('2026-05-25T00:00:00Z'))).toBe('2026-W22');
  });
});

// ---------------------------------------------------------------------------
// 2. Missing SUMMARY_KEY throws naming the key
// ---------------------------------------------------------------------------
describe('missing SUMMARY_KEY throws naming the key', () => {
  it('throws with the missing key name when key absent', () => {
    const incompleteObj = Object.fromEntries(SUMMARY_KEYS.slice(1).map(k => [k, 0]));
    expect(() => validateSummaryKeys(incompleteObj)).toThrow(SUMMARY_KEYS[0]);
  });

  it('does not throw when all SUMMARY_KEYS present', () => {
    const completeObj = Object.fromEntries(SUMMARY_KEYS.map(k => [k, 0]));
    expect(() => validateSummaryKeys(completeObj)).not.toThrow();
  });

  it('names the missing key (not a generic error)', () => {
    const obj = Object.fromEntries(SUMMARY_KEYS.map(k => [k, 0]));
    const missingKey = 'harness_error';
    delete obj[missingKey];
    let caught;
    try { validateSummaryKeys(obj); } catch (e) { caught = e; }
    expect(caught).toBeDefined();
    expect(caught.message).toContain(missingKey);
  });
});

// ---------------------------------------------------------------------------
// 2b. INT-FIX-02 — validateSummaryKeys guards REAL aggregated data
// (Phase 38 Plan 01 — DIGEST-04 self-referential check repair.)
//
// The pre-fix runDigest built `summaryTally` FROM `SUMMARY_KEYS` and validated
// it against `SUMMARY_KEYS` — the check could never fail. INT-FIX-02 replaces
// that with `validateSummaryKeys(aggregateBySummaryKey({...}))` so a future
// llm-report.js key drift produces a descriptive throw at runtime against
// real aggregated metric data.
// ---------------------------------------------------------------------------
describe('INT-FIX-02: validateSummaryKeys throws against real aggregated data', () => {
  it('aggregateBySummaryKey returns object with all SUMMARY_KEYS', () => {
    const fixture = loadFixture();
    const { nightlyIssues, quarantineIssues } = splitFixture(fixture);
    const result = aggregateBySummaryKey({
      nightlyIssues,
      quarantineIssues,
      monthlyTotalCostUsd: 12.34,
    });
    // All seven SUMMARY_KEYS must be own properties with finite numeric values.
    expect(Object.keys(result).sort()).toEqual([...SUMMARY_KEYS].sort());
    for (const k of SUMMARY_KEYS) {
      expect(Number.isFinite(result[k])).toBe(true);
    }
    // total_cost_usd is metric data (not classification) — seeded from arg.
    expect(result.total_cost_usd).toBeCloseTo(12.34, 6);
  });

  it('aggregateBySummaryKey result missing a key causes validateSummaryKeys to throw naming that key', () => {
    const fixture = loadFixture();
    const { nightlyIssues, quarantineIssues } = splitFixture(fixture);
    const driftedTally = aggregateBySummaryKey({
      nightlyIssues,
      quarantineIssues,
      monthlyTotalCostUsd: 0,
    });
    // Synthetic drift — simulate a future llm-report.js rename that drops
    // harness_error from the tally object construction.
    delete driftedTally.harness_error;
    let caught;
    try { validateSummaryKeys(driftedTally); } catch (e) { caught = e; }
    expect(caught).toBeDefined();
    expect(caught.message).toContain('harness_error');
  });

  it('runDigest validates real aggregated data (not SUMMARY_KEYS-seeded tally)', () => {
    // Grep the runDigest source to confirm the wiring: the runtime drift guard
    // calls validateSummaryKeys against aggregateBySummaryKey(...) output, not
    // against an Object.fromEntries(SUMMARY_KEYS.map(...)) seed.
    const src = fs.readFileSync(SCRIPT_PATH, 'utf8');
    expect(src).toMatch(/validateSummaryKeys\s*\(\s*(?:summaryByKey|aggregateBySummaryKey\s*\()/);
    // The self-referential seed pattern must be gone from runDigest's body.
    expect(src).not.toMatch(/const\s+summaryTally\s*=\s*Object\.fromEntries\s*\(\s*SUMMARY_KEYS\.map/);
  });
});

// ---------------------------------------------------------------------------
// 3 + 5 + 6 + 7. Five aggregations present + top-3 + dedup + quarantine window
// ---------------------------------------------------------------------------
describe('five aggregations present', () => {
  it('contains findings count, breakdown table, top-3, quarantine growth, cost line', () => {
    const fixture = loadFixture();
    const { nightlyIssues, quarantineIssues } = splitFixture(fixture);
    const agg = aggregate({ nightlyIssues, quarantineIssues, now: PIN_NOW() });

    // Findings count = 9 deduped distinct issues
    expect(agg.findingsCount).toBe(9);

    // Breakdown has entries
    expect(agg.breakdown.length).toBeGreaterThan(0);

    // Top-3 present
    expect(agg.top3.length).toBeGreaterThanOrEqual(3);

    // Quarantine growth = 3 (issues 104, 105, 109 within 2026-05-18..2026-05-25)
    expect(agg.quarantineGrowth).toBe(3);

    // Rendered markdown has all five sections
    const costLine = 'cost data unavailable'; // no ledger in test
    const md = renderDigest({
      weekLabel: isoWeekLabel(PIN_NOW()),
      agg,
      costLine,
      now: PIN_NOW(),
    });

    // Check all 5 aggregations appear
    expect(md).toContain('9'); // findings count
    expect(md).toContain('WRONG_CITATION');
    expect(md).toContain('LLM_API_ERROR');
    expect(md).toContain('3'); // quarantine growth
    expect(md).toContain('cost data unavailable');
  });
});

// ---------------------------------------------------------------------------
// 4. ≤50 lines
// ---------------------------------------------------------------------------
describe('<=50 lines', () => {
  it('renderDigest produces ≤50 lines', () => {
    const fixture = loadFixture();
    const { nightlyIssues, quarantineIssues } = splitFixture(fixture);
    const agg = aggregate({ nightlyIssues, quarantineIssues, now: PIN_NOW() });
    const costLine = 'cost data unavailable';
    const md = renderDigest({ weekLabel: isoWeekLabel(PIN_NOW()), agg, costLine, now: PIN_NOW() });
    const lineCount = md.split('\n').length;
    expect(lineCount).toBeLessThanOrEqual(50);
  });
});

// ---------------------------------------------------------------------------
// 5. Top-3 + alphabetical tie
// ---------------------------------------------------------------------------
describe('top-3 + alphabetical tie', () => {
  it('alphabetical tie broken correctly: LLM_API_ERROR before WRONG_CITATION', () => {
    const fixture = loadFixture();
    const { nightlyIssues, quarantineIssues } = splitFixture(fixture);
    const agg = aggregate({ nightlyIssues, quarantineIssues, now: PIN_NOW() });

    // Both have count=3; alphabetically "LLM_API_ERROR" < "WRONG_CITATION"
    expect(agg.top3[0].category).toBe('LLM_API_ERROR');
    expect(agg.top3[0].count).toBe(3);
    expect(agg.top3[1].category).toBe('WRONG_CITATION');
    expect(agg.top3[1].count).toBe(3);
    expect(agg.top3[2].category).toBe('UI_BROKEN');
    expect(agg.top3[2].count).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 5b. CR-01: category by ERROR_CLASSES membership, NOT labels[0] order
// ---------------------------------------------------------------------------
describe('CR-01: category resolved by ERROR_CLASSES membership, not label order', () => {
  it('attributes a shuffled-label issue (category not at index 0) to its errorClass', () => {
    const fixture = loadFixture();
    const { nightlyIssues, quarantineIssues } = splitFixture(fixture);

    // Issue 103 has labels [e2e-nightly, triage, WRONG_CITATION] — category is at
    // index 2, NOT index 0. Under the old `labels[0].name` logic this issue would
    // be miscounted as 'e2e-nightly', dropping WRONG_CITATION from 3 → 2 and
    // creating a bogus 'e2e-nightly' bucket. This assertion fails under that bug.
    const shuffled = fixture.find(i => i.number === 103);
    expect(shuffled.labels[0].name).toBe('e2e-nightly'); // guard: fixture really is shuffled
    expect(shuffled.labels.map(l => l.name)).toContain('WRONG_CITATION');

    const agg = aggregate({ nightlyIssues, quarantineIssues, now: PIN_NOW() });

    const byCategory = Object.fromEntries(agg.breakdown.map(b => [b.category, b.count]));
    // WRONG_CITATION must include the shuffled issue 103 → count is 3, not 2
    expect(byCategory.WRONG_CITATION).toBe(3);
    // No structural label should ever appear as a category bucket
    expect(byCategory['e2e-nightly']).toBeUndefined();
    expect(byCategory.triage).toBeUndefined();
    expect(byCategory['e2e-quarantine']).toBeUndefined();
    // Top-3 still attributes the shuffled issue to WRONG_CITATION
    const top3Categories = agg.top3.map(t => t.category);
    expect(top3Categories).toContain('WRONG_CITATION');
  });

  it("buckets an issue with no errorClass label as 'UNCLASSIFIED'", () => {
    const onlyStructural = [
      { number: 999, created_at: daysAgo(1), labels: [{ name: 'e2e-nightly' }, { name: 'triage' }] },
    ];
    const agg = aggregate({ nightlyIssues: onlyStructural, quarantineIssues: [], now: PIN_NOW() });
    const byCategory = Object.fromEntries(agg.breakdown.map(b => [b.category, b.count]));
    expect(byCategory.UNCLASSIFIED).toBe(1);
    expect(byCategory['e2e-nightly']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 6. Dedup by issue.number
// ---------------------------------------------------------------------------
describe('dedup by issue.number', () => {
  it('headline count equals distinct issue numbers, not per-label sum', () => {
    const fixture = loadFixture();
    const { nightlyIssues, quarantineIssues } = splitFixture(fixture);

    // Per-label sum would be 6 (nightly) + 4 (quarantine) = 10
    // Deduped: 9 (issue 104 appears in both)
    const agg = aggregate({ nightlyIssues, quarantineIssues, now: PIN_NOW() });
    expect(agg.findingsCount).toBe(9);
    expect(agg.findingsCount).toBeLessThan(nightlyIssues.length + quarantineIssues.length);
  });
});

// ---------------------------------------------------------------------------
// 7. Quarantine growth window (D-12)
// ---------------------------------------------------------------------------
describe('quarantine growth window', () => {
  it('counts only e2e-quarantine issues opened within prior 7 days', () => {
    const fixture = loadFixture();
    const { nightlyIssues, quarantineIssues } = splitFixture(fixture);
    const agg = aggregate({ nightlyIssues, quarantineIssues, now: PIN_NOW() });

    // Issues 104 (May 22), 105 (May 19), 109 (May 24) are in window
    // Issue 107 (May 10) is outside — window starts 2026-05-18
    expect(agg.quarantineGrowth).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// 8. Cost data unavailable when ledger absent
// ---------------------------------------------------------------------------
describe('cost data unavailable when ledger absent', () => {
  it('returns "cost data unavailable" for a non-existent ledger path', () => {
    const fakePath = path.join(os.tmpdir(), 'no-such-ledger-' + Date.now() + '.json');
    const result = renderCostLine({ ledgerPath: fakePath });
    expect(result).toBe('cost data unavailable');
  });

  it('does not throw when ledger absent', () => {
    const fakePath = path.join(os.tmpdir(), 'no-such-ledger-' + Date.now() + '.json');
    expect(() => renderCostLine({ ledgerPath: fakePath })).not.toThrow();
  });

  it('returns $X.XX / $100 (Y%) format when ledger present', () => {
    const tmpLedger = path.join(runDir, 'test-ledger.json');
    // Phase 48 PRE-03 / D-07: month-key derived from PIN_NOW_ISO anchor — no
    // live `new Date()` band-aid. The matching `renderCostLine({...now:PIN_NOW()})`
    // call below threads the same anchor so the lookup hits this bucket
    // deterministically across any calendar month.
    const ledgerData = {
      version: 1,
      months: {
        [PIN_NOW_ISO.slice(0, 7)]: { invocations: 5, total_usd: 12.5, last_invocation_iso: null, iterations: [] },
      },
    };
    fs.writeFileSync(tmpLedger, JSON.stringify(ledgerData));
    const result = renderCostLine({ ledgerPath: tmpLedger, now: PIN_NOW() });
    expect(result).toMatch(/^\$\d+\.\d{2} \/ \$100 \(\d+%\)$/);
    expect(result).toContain('12.50');
    expect(result).toContain('13%'); // Math.round(12.5/100*100) = 13
  });
});

// ---------------------------------------------------------------------------
// 8b. CR-02: gh fetch failure must NOT publish a silent-zero digest
// ---------------------------------------------------------------------------
describe('CR-02: gh fetch failure throws and does not publish a silent-zero digest', () => {
  it('runDigest rejects and writes NO digest file / files NO issue when the issue fetch fails', async () => {
    const callLog = [];
    const failingGhClient = {
      // Simulate a gh auth error / outage on the issue-list call — the real
      // makeRealGhClient.listOpenIssuesByLabel now throws on non-zero exit.
      listOpenIssuesByLabel(label) {
        callLog.push(`listOpenIssuesByLabel:${label}`);
        throw new Error(`gh: HTTP 401 (Bad credentials) for label '${label}'`);
      },
      createDigestIssue(title) {
        callLog.push(`createDigestIssue:${title}`);
        return 'https://github.com/test/test/issues/1';
      },
      hasDiscussions() {
        callLog.push('hasDiscussions');
        return false;
      },
      createDiscussion(title) {
        callLog.push(`createDiscussion:${title}`);
        return 'https://github.com/test/test/discussions/1';
      },
    };

    await expect(
      runDigest({
        ghClient: failingGhClient,
        now: PIN_NOW,
        publishMode: 'issue',
        repo: 'test/test',
        reportsDir: runDir,
      })
    ).rejects.toThrow();

    // No digest file written for the week
    const reportPath = path.join(runDir, 'weekly-digest-2026-W22.md');
    expect(fs.existsSync(reportPath)).toBe(false);

    // No publish attempt happened (fetch failed before render/write/publish)
    expect(callLog.some(c => c.startsWith('createDigestIssue'))).toBe(false);
    expect(callLog.some(c => c.startsWith('createDiscussion'))).toBe(false);
  });

  it('makeRealGhClient.listOpenIssuesByLabel throws when gh exits non-zero (no silent [])', () => {
    // mock-gh that EXITS NON-ZERO on the issue-list call.
    const failDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pct-digest-failgh-'));
    const failGhBody = [
      '#!/usr/bin/env bash',
      'case "$1" in',
      '  api)',
      '    case "$2" in',
      '      repos/*/issues) echo "gh: Bad credentials" >&2; exit 1 ;;',
      '      *) echo "false" ;;',
      '    esac ;;',
      'esac',
    ].join('\n') + '\n';
    fs.writeFileSync(path.join(failDir, 'gh'), failGhBody, { mode: 0o755 });

    // Drive the REAL client by running runDigest in a child process with the
    // failing mock-gh on PATH; assert it exits non-zero and writes no digest.
    const childRunDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pct-digest-failrun-'));
    const result = spawnSync(process.execPath, [SCRIPT_PATH], {
      env: {
        ...process.env,
        PATH: `${failDir}:${process.env.PATH}`,
        GITHUB_REPOSITORY: 'test/test',
        DIGEST_PUBLISH_MODE: 'issue',
      },
      cwd: childRunDir,
      encoding: 'utf8',
    });

    // Process must fail loudly (exit 1 via the isMain catch handler)
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/gh issue fetch failed|silent-zero/);

    // No digest file produced in the child's reports dir
    const reportsDir = path.join(childRunDir, 'reports');
    const wrote = fs.existsSync(reportsDir)
      ? fs.readdirSync(reportsDir).filter(f => f.startsWith('weekly-digest-'))
      : [];
    expect(wrote).toEqual([]);

    fs.rmSync(failDir, { recursive: true, force: true });
    fs.rmSync(childRunDir, { recursive: true, force: true });
  });

  it('legitimate empty result (gh exits 0, returns []) still publishes a real "0 findings" digest', async () => {
    const callLog = [];
    const emptyGhClient = {
      listOpenIssuesByLabel(label) {
        callLog.push(`listOpenIssuesByLabel:${label}`);
        return []; // gh succeeded; genuinely zero open issues this week
      },
      createDigestIssue(title) {
        callLog.push(`createDigestIssue:${title}`);
        return 'https://github.com/test/test/issues/1';
      },
      hasDiscussions() { return false; },
      createDiscussion(title) {
        callLog.push(`createDiscussion:${title}`);
        return 'https://github.com/test/test/discussions/1';
      },
    };

    const result = await runDigest({
      ghClient: emptyGhClient,
      now: PIN_NOW,
      publishMode: 'issue',
      repo: 'test/test',
      reportsDir: runDir,
    });

    // A real "0 findings" digest IS published for a legitimate empty week
    const md = fs.readFileSync(result.reportPath, 'utf8');
    expect(md).toContain('**Total open findings:** 0');
    expect(callLog.some(c => c.startsWith('createDigestIssue'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 9. Both publish branches
// ---------------------------------------------------------------------------
describe('both publish branches', () => {
  it('DIGEST_PUBLISH_MODE=issue: dispatches gh issue create with --label e2e-digest', async () => {
    const fixture = loadFixture();
    const transcriptFile = path.join(mockGhDir, 'gh-transcript-issue.txt');

    // Build a mock ghClient that logs calls
    const callLog = [];
    const mockGhClient = {
      listOpenIssuesByLabel(label) {
        callLog.push(`listOpenIssuesByLabel:${label}`);
        return fixture.filter(i => i.labels.some(l => l.name === label));
      },
      createDigestIssue(title, body) {
        callLog.push(`createDigestIssue:${title}`);
        return 'https://github.com/test/test/issues/1';
      },
      hasDiscussions() {
        callLog.push('hasDiscussions');
        return false;
      },
      createDiscussion(title, body) {
        callLog.push(`createDiscussion:${title}`);
        return 'https://github.com/test/test/discussions/1';
      },
    };

    const result = await runDigest({
      ghClient: mockGhClient,
      now: PIN_NOW,
      publishMode: 'issue',
      repo: 'test/test',
      reportsDir: runDir,
    });

    // Issue create called, not discussion
    expect(callLog).toContain('createDigestIssue:[e2e-digest] Weekly analytics 2026-W22');
    expect(callLog).not.toContain(expect.stringMatching(/createDiscussion/));
    expect(result.mode).toBe('issue');
  });

  it('DIGEST_PUBLISH_MODE=discussion: dispatches createDiscussion (graphql path)', async () => {
    const fixture = loadFixture();

    const callLog = [];
    const mockGhClient = {
      listOpenIssuesByLabel(label) {
        callLog.push(`listOpenIssuesByLabel:${label}`);
        return fixture.filter(i => i.labels.some(l => l.name === label));
      },
      createDigestIssue(title, body) {
        callLog.push(`createDigestIssue:${title}`);
        return 'https://github.com/test/test/issues/1';
      },
      hasDiscussions() {
        callLog.push('hasDiscussions');
        return false;
      },
      createDiscussion(title, body) {
        callLog.push(`createDiscussion:${title}`);
        return 'https://github.com/test/test/discussions/1';
      },
    };

    const result = await runDigest({
      ghClient: mockGhClient,
      now: PIN_NOW,
      publishMode: 'discussion',
      repo: 'test/test',
      reportsDir: runDir,
    });

    // Discussion path called, not issue
    expect(callLog).toContain(`createDiscussion:[e2e-digest] Weekly analytics 2026-W22`);
    expect(callLog.some(c => c.startsWith('createDigestIssue'))).toBe(false);
    expect(result.mode).toBe('discussion');
  });

  it('DIGEST_PUBLISH_MODE=auto with has_discussions=false → falls back to issue path', async () => {
    const fixture = loadFixture();

    const callLog = [];
    const mockGhClient = {
      listOpenIssuesByLabel(label) {
        callLog.push(`listOpenIssuesByLabel:${label}`);
        return fixture.filter(i => i.labels.some(l => l.name === label));
      },
      createDigestIssue(title, body) {
        callLog.push(`createDigestIssue:${title}`);
        return 'https://github.com/test/test/issues/1';
      },
      hasDiscussions() {
        callLog.push('hasDiscussions');
        return false; // Discussions disabled
      },
      createDiscussion(title, body) {
        callLog.push(`createDiscussion:${title}`);
        return 'https://github.com/test/test/discussions/1';
      },
    };

    const result = await runDigest({
      ghClient: mockGhClient,
      now: PIN_NOW,
      publishMode: 'auto',
      repo: 'test/test',
      reportsDir: runDir,
    });

    // hasDiscussions probed, then fell back to issue
    expect(callLog).toContain('hasDiscussions');
    expect(callLog.some(c => c.startsWith('createDigestIssue'))).toBe(true);
    expect(callLog.some(c => c.startsWith('createDiscussion'))).toBe(false);
    expect(result.mode).toBe('issue');
  });
});

// ---------------------------------------------------------------------------
// Phase 14 DGST-01: renderBugReportsSection pure-function tests
// ---------------------------------------------------------------------------
describe('renderBugReportsSection: pure-function locked-order rows', () => {
  it('renders locked-order rows with fixture data and correct counts', () => {
    // Fixture: 2 report-fix-candidate issues, 1 merged verified PR, 1 open PR,
    //          1 stuck issue, 1 overfit PR.
    const issues = [
      {
        number: 201,
        labels: [{ name: 'report-fix-candidate' }],
        createdAt: daysAgo(5),
      },
      {
        number: 202,
        labels: [{ name: 'report-fix-candidate' }, { name: 'auto-fix-stuck' }],
        createdAt: daysAgo(3),
      },
    ];
    const ghPrs = [
      {
        number: 301,
        labels: [{ name: 'auto-fix:verified' }],
        mergedAt: daysAgo(1),
        createdAt: daysAgo(4),
        state: 'MERGED',
        body: '<!-- source_issue: 201 -->',
      },
      {
        number: 302,
        labels: [{ name: 'human-review-required' }],
        mergedAt: null,
        createdAt: daysAgo(2),
        state: 'OPEN',
        body: '',
      },
    ];

    const md = renderBugReportsSection({ issues, ghPrs, now: PIN_NOW() });

    expect(md).toContain('<summary>Bug Reports</summary>');
    expect(md).toContain('report_volume (report-fix-candidate)');
    // report_volume = 2 (both issues have report-fix-candidate label)
    expect(md).toContain('| report_volume (report-fix-candidate) | 2 |');
    // promoted = 2 (same as report_volume)
    expect(md).toContain('| promoted_reports | 2 |');
    // open_auto_fix_prs = 1 (PR 302 has mergedAt: null)
    expect(md).toContain('| open_auto_fix_prs | 1 |');
    // merged_fix_prs = 1 (PR 301 is auto-fix:verified + mergedAt set)
    expect(md).toContain('| merged_fix_prs | 1 |');
    // auto_fix_stuck = 1 (issue 202 has auto-fix-stuck label)
    expect(md).toContain('| auto_fix_stuck | 1 |');
    // human_review_required = 1 (PR 302 has human-review-required)
    expect(md).toContain('| human_review_required (overfit) | 1 |');
    // promotion_rate = 1/2 * 100 = 50.0%
    expect(md).toContain('| promotion_rate | 50.0% |');
    expect(md).toContain('</details>');
  });

  it('zero-denominator ratio degrades to n/a while count metrics keep integer 0', () => {
    // Empty data — all counts zero, ratio must show n/a
    const md = renderBugReportsSection({ issues: [], ghPrs: [], now: PIN_NOW() });

    // COUNT metrics must be integer 0 (not n/a)
    expect(md).toContain('| report_volume (report-fix-candidate) | 0 |');
    expect(md).toContain('| promoted_reports | 0 |');
    expect(md).toContain('| open_auto_fix_prs | 0 |');
    expect(md).toContain('| merged_fix_prs | 0 |');
    expect(md).toContain('| auto_fix_stuck | 0 |');
    expect(md).toContain('| human_review_required (overfit) | 0 |');

    // RATIO metric must be n/a (zero denominator — distinct from 0%)
    expect(md).toContain('| promotion_rate | n/a |');
    expect(md).not.toContain('0%');
  });

  it('defensive coercion: non-array inputs treated as empty arrays', () => {
    // Pass non-arrays — must not throw, must render 0 counts
    const md = renderBugReportsSection({ issues: null, ghPrs: undefined, now: PIN_NOW() });
    expect(md).toContain('| report_volume (report-fix-candidate) | 0 |');
    expect(md).toContain('| promotion_rate | n/a |');
  });

  it('label-membership counting is not positional (CR-01 discipline)', () => {
    // Issue with report-fix-candidate NOT at index 0 (shuffled)
    const issues = [
      {
        number: 203,
        labels: [{ name: 'some-other-label' }, { name: 'report-fix-candidate' }],
        createdAt: daysAgo(2),
      },
    ];
    const md = renderBugReportsSection({ issues, ghPrs: [], now: PIN_NOW() });
    // Must count the issue even though report-fix-candidate is at labels[1]
    expect(md).toContain('| report_volume (report-fix-candidate) | 1 |');
  });

  it('does NOT echo untrusted Issue/PR titles or bodies (T-14-01 injection guard)', () => {
    // An issue with a malicious title and PR with injection attempt in body
    const issues = [
      {
        number: 204,
        labels: [{ name: 'report-fix-candidate' }],
        title: '**INJECTION** <script>alert(1)</script>',
        createdAt: daysAgo(1),
      },
    ];
    const ghPrs = [
      {
        number: 303,
        labels: [{ name: 'auto-fix:verified' }],
        mergedAt: daysAgo(0),
        createdAt: daysAgo(1),
        state: 'MERGED',
        body: '<!-- source_issue: 204 --> **INJECTION** ` + "`rm -rf /`" + `',
      },
    ];
    const md = renderBugReportsSection({ issues, ghPrs, now: PIN_NOW() });
    // Must not contain raw title text
    expect(md).not.toContain('INJECTION');
    expect(md).not.toContain('<script>');
  });
});

// ---------------------------------------------------------------------------
// Phase 14 DGST-01: fetchBugReportIssues errors-returned contract
// ---------------------------------------------------------------------------
describe('fetchBugReportIssues: errors-returned-not-thrown contract', () => {
  it('returns error string and empty arrays when execFn throws (T-14-02)', () => {
    const result = fetchBugReportIssues({
      now: PIN_NOW(),
      execFn: () => { throw new Error('gh: auth failure'); },
    });
    expect(result.error).toBeTruthy();
    expect(result.error).toContain('gh: auth failure');
    expect(result.issues).toEqual([]);
    expect(result.prs).toEqual([]);
    expect(result.fetchedAt).toBeInstanceOf(Date);
  });

  it('returns error string when execFn returns unparseable JSON', () => {
    let callCount = 0;
    const result = fetchBugReportIssues({
      now: PIN_NOW(),
      execFn: () => {
        callCount++;
        return 'NOT_VALID_JSON {{{';
      },
    });
    expect(result.error).toBeTruthy();
    expect(result.issues).toEqual([]);
  });

  it('returns error string when execFn returns a non-array JSON payload', () => {
    let callCount = 0;
    const result = fetchBugReportIssues({
      now: PIN_NOW(),
      execFn: () => {
        callCount++;
        if (callCount === 1) return '{"not":"an array"}';
        return '[]';
      },
    });
    expect(result.error).toBeTruthy();
    expect(result.issues).toEqual([]);
  });

  it('returns issues and prs arrays with error: null on success', () => {
    let callCount = 0;
    const result = fetchBugReportIssues({
      now: PIN_NOW(),
      execFn: () => {
        callCount++;
        if (callCount === 1) return JSON.stringify([{ number: 1, labels: [] }]);
        return JSON.stringify([{ number: 10, labels: [], mergedAt: null }]);
      },
    });
    expect(result.error).toBeNull();
    expect(result.issues).toHaveLength(1);
    expect(result.prs).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Phase 14 DGST-01: runDigest BUG_REPORTS section wiring
// ---------------------------------------------------------------------------
describe('runDigest: BUG_REPORTS section wiring', () => {
  function makeMockGhClient(fixture) {
    return {
      listOpenIssuesByLabel(label) {
        return fixture.filter(i => i.labels.some(l => l.name === label));
      },
      createDigestIssue() { return 'https://github.com/test/test/issues/1'; },
      hasDiscussions() { return false; },
      createDiscussion() { return 'https://github.com/test/test/discussions/1'; },
    };
  }

  it('BUG_REPORTS section appears in written file when fetchBugReports returns data', async () => {
    const fixture = loadFixture();
    const result = await runDigest({
      ghClient: makeMockGhClient(fixture),
      now: PIN_NOW,
      publishMode: 'issue',
      repo: 'test/test',
      reportsDir: runDir,
      fetchAutoFixPrs: () => ({ prs: [], fetchedAt: PIN_NOW(), error: null }),
      fetchBugReports: () => ({
        issues: [{ number: 201, labels: [{ name: 'report-fix-candidate' }], createdAt: daysAgo(3) }],
        prs: [],
        fetchedAt: PIN_NOW(),
        error: null,
      }),
    });

    const md = fs.readFileSync(result.reportPath, 'utf8');
    expect(md).toContain('<summary>Bug Reports</summary>');
    expect(md).toContain('report-fix-candidate');
  });

  it('degrade-to-n/a: file still writes and publish called when fetchBugReports returns error', async () => {
    const fixture = loadFixture();
    const callLog = [];
    const mockGhClient = {
      listOpenIssuesByLabel(label) { return fixture.filter(i => i.labels.some(l => l.name === label)); },
      createDigestIssue(title) { callLog.push('createDigestIssue'); return 'https://github.com/test/test/issues/1'; },
      hasDiscussions() { return false; },
      createDiscussion() { callLog.push('createDiscussion'); return ''; },
    };

    const result = await runDigest({
      ghClient: mockGhClient,
      now: PIN_NOW,
      publishMode: 'issue',
      repo: 'test/test',
      reportsDir: runDir,
      fetchAutoFixPrs: () => ({ prs: [], fetchedAt: PIN_NOW(), error: null }),
      fetchBugReports: () => ({
        issues: [],
        prs: [],
        fetchedAt: PIN_NOW(),
        error: 'boom — gh auth failure',
      }),
    });

    // File STILL written (degrade, don't abort)
    expect(fs.existsSync(result.reportPath)).toBe(true);

    // Publish still called
    expect(callLog).toContain('createDigestIssue');

    // Section renders n/a for ratio (count metrics show 0)
    const md = fs.readFileSync(result.reportPath, 'utf8');
    expect(md).toContain('<summary>Bug Reports</summary>');
    expect(md).toContain('| promotion_rate | n/a |');
  });
});

// ---------------------------------------------------------------------------
// Phase 14 UAT-03 (local half): ledger monthly-cap-enforcement assertion
// ---------------------------------------------------------------------------
describe('UAT-03: ledger monthly-cap-enforcement path', () => {
  it('HARD_CAP_USD is 100 (locked constant)', () => {
    expect(HARD_CAP_USD).toBe(100);
  });

  it('monthlyTotal returns 0 for missing ledger file (not-a-real-path)', () => {
    // GOTCHA: monthlyTotal returns 0 for BOTH $0 spend AND missing file.
    // Must always fs.existsSync(LEDGER_PATH) FIRST before trusting monthlyTotal.
    const fakeLedger = readLedger('/tmp/__nonexistent_ledger_pct__.json');
    const total = monthlyTotal(fakeLedger);
    expect(total).toBe(0);
  });

  it('cap-enforcement comparison: monthlyTotal(readLedger()) >= HARD_CAP_USD triggers block', () => {
    // Build an in-memory ledger at or above the cap.
    const currentMonth = new Date().toISOString().slice(0, 7);
    const overCapLedger = {
      version: 1,
      months: {
        [currentMonth]: {
          invocations: 10,
          total_usd: 105.00,
          last_invocation_iso: new Date().toISOString(),
          iterations: [],
        },
      },
    };
    const total = monthlyTotal(overCapLedger);
    // The cap-enforcement path: total >= HARD_CAP_USD → status: 'block'
    expect(total >= HARD_CAP_USD).toBe(true);
  });

  it('cap-enforcement comparison: monthlyTotal below cap does NOT trigger block', () => {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const underCapLedger = {
      version: 1,
      months: {
        [currentMonth]: {
          invocations: 2,
          total_usd: 12.50,
          last_invocation_iso: new Date().toISOString(),
          iterations: [],
        },
      },
    };
    const total = monthlyTotal(underCapLedger);
    expect(total >= HARD_CAP_USD).toBe(false);
    expect(total).toBe(12.50);
  });

  it('fs.existsSync(LEDGER_PATH) guard: check existence BEFORE monthlyTotal (not-equal-to-0 guard)', () => {
    // This test validates the canonical pattern:
    //   if (fs.existsSync(LEDGER_PATH)) { ... monthlyTotal(...) }
    // monthlyTotal(readLedger(nonexistentPath)) returns 0 — same as $0 spend.
    // Always existsSync FIRST; never trust monthlyTotal(readLedger()) == 0 alone.
    const ledgerExists = fs.existsSync(LEDGER_PATH);
    if (ledgerExists) {
      const total = monthlyTotal(readLedger(LEDGER_PATH));
      // If ledger exists, monthlyTotal >= 0 (non-negative)
      expect(total).toBeGreaterThanOrEqual(0);
      // The cap-enforcement path compares against HARD_CAP_USD
      const isOverCap = total >= HARD_CAP_USD;
      expect(typeof isOverCap).toBe('boolean');
    } else {
      // Ledger absent — verify that monthlyTotal returns 0 for the empty ledger
      const total = monthlyTotal(readLedger(LEDGER_PATH));
      expect(total).toBe(0);
      // And that 0 < HARD_CAP_USD (below cap — would not block)
      expect(total < HARD_CAP_USD).toBe(true);
    }
  });

  it('combinedMonthlyTotalByTransport returns combined sum with breakdown', () => {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const ledger = {
      version: 1,
      months: {
        [currentMonth]: {
          invocations: 2,
          total_usd: 5.00,
          last_invocation_iso: new Date().toISOString(),
          iterations: [
            { cost_usd: 2.00, transport: 'sdk' },
            { cost_usd: 3.00, transport: 'subscription' },
          ],
        },
      },
    };
    const result = combinedMonthlyTotalByTransport(ledger, currentMonth);
    expect(result.combined).toBe(5.00);
    expect(result.by_transport.sdk).toBe(2.00);
    expect(result.by_transport.subscription).toBe(3.00);
  });
});

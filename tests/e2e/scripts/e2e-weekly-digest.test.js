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
//   Category breakdown (labels[0].name across deduped set):
//     wrong_citation:       3  (101, 103, 108)
//     llm_api_error:        3  (102, 105, 109)
//     harness_error:        2  (104, 107)
//     verifier_disagree:    1  (106)
//
//   Top-3 (desc, ties alphabetical):
//     #1  llm_api_error      3  (tied with wrong_citation; "llm_api_error" < "wrong_citation" alpha)
//     #2  wrong_citation     3
//     #3  harness_error      2
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
  renderDigest,
  renderCostLine,
  runDigest,
} from '../../../scripts/weekly-digest.mjs';

import { SUMMARY_KEYS } from '../lib/llm-report.js';

// ---------------------------------------------------------------------------
// Shared test state — mock-gh dir for spawn-based tests
// ---------------------------------------------------------------------------
let mockGhDir;
let transcriptPath;
let runDir;

const PIN_NOW = () => new Date('2026-05-25T00:00:00Z');

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
      weekLabel: '2026-W22',
      agg,
      costLine,
      now: PIN_NOW(),
    });

    // Check all 5 aggregations appear
    expect(md).toContain('9'); // findings count
    expect(md).toContain('wrong_citation');
    expect(md).toContain('llm_api_error');
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
    const md = renderDigest({ weekLabel: '2026-W22', agg, costLine, now: PIN_NOW() });
    const lineCount = md.split('\n').length;
    expect(lineCount).toBeLessThanOrEqual(50);
  });
});

// ---------------------------------------------------------------------------
// 5. Top-3 + alphabetical tie
// ---------------------------------------------------------------------------
describe('top-3 + alphabetical tie', () => {
  it('alphabetical tie broken correctly: llm_api_error before wrong_citation', () => {
    const fixture = loadFixture();
    const { nightlyIssues, quarantineIssues } = splitFixture(fixture);
    const agg = aggregate({ nightlyIssues, quarantineIssues, now: PIN_NOW() });

    // Both have count=3; alphabetically "llm_api_error" < "wrong_citation"
    expect(agg.top3[0].category).toBe('llm_api_error');
    expect(agg.top3[0].count).toBe(3);
    expect(agg.top3[1].category).toBe('wrong_citation');
    expect(agg.top3[1].count).toBe(3);
    expect(agg.top3[2].category).toBe('harness_error');
    expect(agg.top3[2].count).toBe(2);
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
    const ledgerData = {
      version: 1,
      months: {
        '2026-05': { invocations: 5, total_usd: 12.5, last_invocation_iso: null, iterations: [] },
      },
    };
    fs.writeFileSync(tmpLedger, JSON.stringify(ledgerData));
    const result = renderCostLine({ ledgerPath: tmpLedger });
    expect(result).toMatch(/^\$\d+\.\d{2} \/ \$100 \(\d+%\)$/);
    expect(result).toContain('12.50');
    expect(result).toContain('13%'); // Math.round(12.5/100*100) = 13
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

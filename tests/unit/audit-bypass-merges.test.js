// tests/unit/audit-bypass-merges.test.js
//
// Phase 62 BYPASS-01 — unit tests for scripts/audit-bypass-merges.mjs.
//
// Pure-function coverage:
//   detectBypass         — algorithm from RESEARCH.md lines 631-649
//   ledgerSourceForPr    — ledger cross-ref for `ledger_source_tag` column
//   rowsToCsv            — locked CSV header + row serialization
//   parseArgv            — argv parsing + V5 input validation on --repo
//
// main() / assertGhAuth integration is NOT mocked here — those exercise live
// gh CLI subprocess behavior that's covered by the weekly-digest workflow
// smoke. The exported pure functions are individually unit-testable.

import { describe, it, expect } from 'vitest';
import {
  detectBypass,
  ledgerSourceForPr,
  rowsToCsv,
  parseArgv,
  parseWorkflowRunsJsonl,
} from '../../scripts/audit-bypass-merges.mjs';

// ---------------------------------------------------------------------------
// detectBypass — algorithm: BYPASS_DETECTED = (run completed AFTER merge)
// ---------------------------------------------------------------------------

describe('Phase 62 BYPASS-01 — detectBypass', () => {
  it('T_BYPASS_DETECT_TIMESTAMP: run completed AFTER PR merge → true', () => {
    const verifierRun = {
      status: 'completed',
      conclusion: 'success',
      updated_at: '2026-06-08T10:05:00Z',
    };
    const prMergedAt = '2026-06-08T10:00:00Z';
    expect(detectBypass(verifierRun, prMergedAt)).toBe(true);
  });

  it('T_BYPASS_DETECT_NORMAL: run completed BEFORE PR merge → false', () => {
    const verifierRun = {
      status: 'completed',
      conclusion: 'success',
      updated_at: '2026-06-09T10:55:00Z',
    };
    const prMergedAt = '2026-06-09T11:00:00Z';
    expect(detectBypass(verifierRun, prMergedAt)).toBe(false);
  });

  it('T_BYPASS_DETECT_CANCELLED: cancelled run → true (gate never ran)', () => {
    const verifierRun = {
      status: 'completed',
      conclusion: 'cancelled',
      updated_at: '2026-06-09T10:00:00Z',
    };
    const prMergedAt = '2026-06-09T11:00:00Z';
    expect(detectBypass(verifierRun, prMergedAt)).toBe(true);
  });

  it('T_BYPASS_DETECT_SKIPPED: skipped run → true (gate never ran)', () => {
    const verifierRun = {
      status: 'completed',
      conclusion: 'skipped',
      updated_at: '2026-06-09T10:00:00Z',
    };
    const prMergedAt = '2026-06-09T11:00:00Z';
    expect(detectBypass(verifierRun, prMergedAt)).toBe(true);
  });

  it('T_BYPASS_DETECT_DEFER: run not completed → null (defer)', () => {
    const verifierRun = {
      status: 'in_progress',
      conclusion: null,
      updated_at: '2026-06-09T10:00:00Z',
    };
    const prMergedAt = '2026-06-09T11:00:00Z';
    expect(detectBypass(verifierRun, prMergedAt)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// ledgerSourceForPr — cross-reference auto-fix-* tagged ledger entries
// ---------------------------------------------------------------------------

describe('Phase 62 BYPASS-01 — ledgerSourceForPr', () => {
  it('T_BYPASS_LEDGER_TAG_PROMOTED: finds auto-fix-promoted entry', () => {
    const ledger = {
      months: {
        '2026-06': {
          iterations: [
            { prNumber: 42, source: 'auto-fix-promoted' },
          ],
        },
      },
    };
    expect(ledgerSourceForPr(42, ledger)).toBe('auto-fix-promoted');
  });

  it('T_BYPASS_LEDGER_TAG_FAILED: finds auto-fix-failed entry', () => {
    const ledger = {
      months: {
        '2026-06': {
          iterations: [
            { prNumber: 43, source: 'auto-fix-failed' },
          ],
        },
      },
    };
    expect(ledgerSourceForPr(43, ledger)).toBe('auto-fix-failed');
  });

  it('T_BYPASS_LEDGER_TAG_NO_ENTRY: returns "no-entry" when no match', () => {
    const ledger = {
      months: {
        '2026-06': {
          iterations: [
            { prNumber: 99, source: 'auto-fix-promoted' },
          ],
        },
      },
    };
    expect(ledgerSourceForPr(42, ledger)).toBe('no-entry');
  });

  it('T_BYPASS_LEDGER_TAG_IGNORES_NON_AUTOFIX: only auto-fix-* sources qualify', () => {
    const ledger = {
      months: {
        '2026-06': {
          iterations: [
            { prNumber: 42, source: 'some-other-tag' },
          ],
        },
      },
    };
    expect(ledgerSourceForPr(42, ledger)).toBe('no-entry');
  });
});

// ---------------------------------------------------------------------------
// rowsToCsv — locked header + boolean/null literal serialization
// ---------------------------------------------------------------------------

describe('Phase 62 BYPASS-01 — rowsToCsv', () => {
  it('T_BYPASS_CSV_SHAPE: emits locked header + rows with boolean/null literals', () => {
    const rows = [
      {
        pr_number: 42,
        merged_at: '2026-06-08T10:00:00Z',
        verifier_gate_completed_at: '2026-06-08T10:05:00Z',
        bypass_detected: true,
        ledger_source_tag: 'auto-fix-promoted',
      },
      {
        pr_number: 43,
        merged_at: '2026-06-09T11:00:00Z',
        verifier_gate_completed_at: '2026-06-09T10:55:00Z',
        bypass_detected: false,
        ledger_source_tag: 'auto-fix-promoted',
      },
      {
        pr_number: 44,
        merged_at: '2026-06-08T12:00:00Z',
        verifier_gate_completed_at: null,
        bypass_detected: true,
        ledger_source_tag: 'auto-fix-failed',
      },
    ];
    const csv = rowsToCsv(rows);
    const expected =
      'pr_number,merged_at,verifier_gate_completed_at,bypass_detected,ledger_source_tag\n' +
      '42,2026-06-08T10:00:00Z,2026-06-08T10:05:00Z,true,auto-fix-promoted\n' +
      '43,2026-06-09T11:00:00Z,2026-06-09T10:55:00Z,false,auto-fix-promoted\n' +
      '44,2026-06-08T12:00:00Z,,true,auto-fix-failed\n';
    expect(csv).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// parseArgv — V5 input validation on --repo + defaults
// ---------------------------------------------------------------------------

describe('Phase 62 BYPASS-01 — parseArgv', () => {
  it('T_BYPASS_ARGV_REPO_VALIDATION: shell-injection --repo throws (Threat T-62-C)', () => {
    expect(() => parseArgv(['--repo', 'owner/repo; rm -rf /'])).toThrow(
      /invalid --repo/i,
    );
  });

  it('T_BYPASS_ARGV_SINCE_VALIDATION: malformed --since-iso throws (WR-02 fix)', () => {
    // Plain non-ISO garbage rejected.
    expect(() => parseArgv(['--since-iso', 'last-week'])).toThrow(
      /invalid --since-iso/i,
    );
    // Shell-injection via single-quote escape rejected — main()'s
    // `gh api 'repos/.../runs?created=>=${parsed.sinceIso}'` URL is
    // single-quoted; an input containing `'` would break out.
    expect(() => parseArgv(['--since-iso', "2026-06-01' && evil-command #"])).toThrow(
      /invalid --since-iso/i,
    );
    // Missing seconds rejected (must be the strict workflow shape).
    expect(() => parseArgv(['--since-iso', '2026-06-01T00:00Z'])).toThrow(
      /invalid --since-iso/i,
    );
    // Valid ISO-8601 RFC-3339 shape accepted.
    const parsed = parseArgv(['--since-iso', '2026-06-09T00:00:00Z']);
    expect(parsed.sinceIso).toBe('2026-06-09T00:00:00Z');
  });

  it('T_BYPASS_ARGV_DEFAULTS: empty argv yields documented defaults (since-iso = 8 days ago)', () => {
    const parsed = parseArgv([]);
    expect(parsed.output).toBe('csv');
    expect(parsed.branchPrefix).toBe('auto-fix/');
    // CR-02 fix: workflow-path matches by GitHub API `path` field (resilient
    // to YAML `name:` edits). Previous workflowName default 'verifier-gate'
    // never matched the actual declared name 'V40 Verifier Gate'.
    expect(parsed.workflowPath).toBe('.github/workflows/v40-verifier-gate.yml');
    // sinceIso should be ~8 days ago — validate ISO-8601 shape + recency window
    expect(typeof parsed.sinceIso).toBe('string');
    expect(parsed.sinceIso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    const now = Date.now();
    const sinceMs = new Date(parsed.sinceIso).getTime();
    const deltaDays = (now - sinceMs) / (24 * 60 * 60 * 1000);
    // Allow 7-9 days range to absorb clock jitter
    expect(deltaDays).toBeGreaterThan(7);
    expect(deltaDays).toBeLessThan(9);
  });
});

// ---------------------------------------------------------------------------
// parseWorkflowRunsJsonl — handles `gh api --paginate --jq '.workflow_runs[]'`
// JSONL output. CR-01 fix.
// ---------------------------------------------------------------------------

describe('Phase 62 BYPASS-01 — parseWorkflowRunsJsonl (CR-01)', () => {
  it('T_BYPASS_PARSE_EMPTY: blank input returns empty array', () => {
    expect(parseWorkflowRunsJsonl('')).toEqual([]);
    expect(parseWorkflowRunsJsonl('\n\n')).toEqual([]);
  });

  it('T_BYPASS_PARSE_SINGLE: single workflow_run JSON line parses correctly', () => {
    const jsonl = JSON.stringify({ id: 1, name: 'V40 Verifier Gate' }) + '\n';
    const runs = parseWorkflowRunsJsonl(jsonl);
    expect(runs.length).toBe(1);
    expect(runs[0]).toEqual({ id: 1, name: 'V40 Verifier Gate' });
  });

  it('T_BYPASS_PARSE_MULTI_PAGE: multi-page JSONL (3+ rows across simulated pages) flattens', () => {
    // Simulate the output of `gh api --paginate --jq '.workflow_runs[]'`:
    // pages are concatenated, but --jq has already flattened each page's
    // workflow_runs array into individual lines. The parser must handle the
    // resulting JSONL regardless of how many pages contributed.
    const rows = [
      { id: 1, head_branch: 'auto-fix/issue-1', path: '.github/workflows/v40-verifier-gate.yml' },
      { id: 2, head_branch: 'auto-fix/issue-2', path: '.github/workflows/v40-verifier-gate.yml' },
      { id: 3, head_branch: 'main', path: '.github/workflows/other.yml' },
      { id: 4, head_branch: 'auto-fix/issue-3', path: '.github/workflows/v40-verifier-gate.yml' },
    ];
    const jsonl = rows.map((r) => JSON.stringify(r)).join('\n') + '\n';
    const parsed = parseWorkflowRunsJsonl(jsonl);
    expect(parsed.length).toBe(4);
    expect(parsed.map((r) => r.id)).toEqual([1, 2, 3, 4]);
    // Sanity: downstream filter (path-based, CR-02 fix) finds exactly 3 matches.
    const filtered = parsed.filter(
      (r) =>
        typeof r?.head_branch === 'string' &&
        r.head_branch.startsWith('auto-fix/') &&
        typeof r?.path === 'string' &&
        r.path.endsWith('.github/workflows/v40-verifier-gate.yml'),
    );
    expect(filtered.length).toBe(3);
  });

  it('T_BYPASS_PARSE_TOLERATES_BLANK_LINES: blank/whitespace-only lines are skipped', () => {
    const jsonl = '\n' +
      JSON.stringify({ id: 1 }) + '\n' +
      '\n   \n' +
      JSON.stringify({ id: 2 }) + '\n';
    const parsed = parseWorkflowRunsJsonl(jsonl);
    expect(parsed).toEqual([{ id: 1 }, { id: 2 }]);
  });
});

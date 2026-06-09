// tests/unit/audit-bypass-merges-integration.test.js
//
// Phase 62 WR-01 fix — integration tests for scripts/audit-bypass-merges.mjs
// main() that MOCK the `gh` CLI subprocess (vi.mock 'node:child_process').
//
// Rationale (REVIEW.md WR-01):
//   The companion pure-function file audit-bypass-merges.test.js explicitly
//   does NOT mock execSync — so main(), assertGhAuth, resolveDefaultRepo,
//   and fetchPrMergedAt had ZERO coverage prior to this file. Both critical
//   defects (CR-01 JSON.parse-on-multi-page; CR-02 wrong workflow filter)
//   slipped through that gap. This file closes it with three execSync-mocked
//   integration paths: success (single-page), multi-page (CR-01 regression
//   pin), and gh-auth-failure.
//
// Mocking pattern mirrors tests/unit/warning-01-transport-tag.test.js:
//   vi.mock hoisted BEFORE the SUT import so the audit script receives the
//   mocked execSync at module-load time.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// -----------------------------------------------------------------------
// Mocks — hoisted by Vitest BEFORE the audit-bypass-merges.mjs import.
// -----------------------------------------------------------------------

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

vi.mock('../../tests/e2e/lib/llm-ledger.js', () => ({
  readLedger: vi.fn(() => ({
    version: 1,
    months: {
      '2026-06': {
        iterations: [
          { prNumber: 101, source: 'auto-fix-promoted' },
        ],
      },
    },
  })),
  LEDGER_PATH: '/tmp/test-ledger.json',
}));

// -----------------------------------------------------------------------
// Imports AFTER vi.mock so main() receives the mocked deps.
// -----------------------------------------------------------------------

import { execSync } from 'node:child_process';
import { main } from '../../scripts/audit-bypass-merges.mjs';

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

/**
 * Build a workflow_run JSONL line as `gh api --paginate --jq '.workflow_runs[]'`
 * would emit it (one workflow_run object per line, no array wrapper).
 */
function jsonlLine(obj) {
  return JSON.stringify(obj) + '\n';
}

/**
 * Capture process.stdout.write calls during `fn()`. Returns the concatenated
 * string of all writes.
 */
async function captureStdout(fn) {
  const writes = [];
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk, ...rest) => {
    writes.push(typeof chunk === 'string' ? chunk : chunk.toString());
    return true;
  };
  try {
    await fn();
  } finally {
    process.stdout.write = original;
  }
  return writes.join('');
}

// -----------------------------------------------------------------------
// Test cases
// -----------------------------------------------------------------------

describe('Phase 62 BYPASS-01 — main() integration (WR-01 fix)', () => {
  beforeEach(() => {
    vi.mocked(execSync).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('T_BYPASS_INTEGRATION_SINGLE_PAGE: success path — one verifier-gate run, bypass detected', async () => {
    // Simulate `gh api --paginate --jq '.workflow_runs[]'` returning ONE
    // workflow_run on the auto-fix/ branch pointing at the verifier-gate
    // workflow path. PR 101 was merged 5 minutes BEFORE the gate completed
    // → bypass_detected: true.
    const run = {
      id: 999,
      head_branch: 'auto-fix/issue-101',
      path: '.github/workflows/v40-verifier-gate.yml',
      status: 'completed',
      conclusion: 'success',
      updated_at: '2026-06-08T10:05:00Z',
      pull_requests: [{ number: 101 }],
    };

    vi.mocked(execSync).mockImplementation((cmd) => {
      if (cmd === 'gh auth status') return '';
      if (cmd.startsWith('gh repo view')) return 'owner/repo\n';
      if (cmd.includes('actions/runs') && cmd.includes('--paginate')) {
        return jsonlLine(run);
      }
      if (cmd.includes('/pulls/101')) return '2026-06-08T10:00:00Z\n';
      throw new Error(`unexpected execSync call: ${cmd}`);
    });

    const csv = await captureStdout(async () => {
      await main([
        '--since-iso', '2026-06-01T00:00:00Z',
        '--output', 'csv',
      ]);
    });

    expect(csv).toContain('pr_number,merged_at,verifier_gate_completed_at,bypass_detected,ledger_source_tag');
    expect(csv).toContain('101,2026-06-08T10:00:00Z,2026-06-08T10:05:00Z,true,auto-fix-promoted');
  });

  it('T_BYPASS_INTEGRATION_MULTI_PAGE: CR-01 regression pin — multi-page JSONL flattens and filters correctly', async () => {
    // Simulate four workflow_run records (as if returned across 2+ pages
    // and flattened by `--jq '.workflow_runs[]'`). Only two are on
    // auto-fix/* branches AND on the verifier-gate workflow path — the
    // other two must be filtered out by main()'s `runs.filter(...)`.
    const runs = [
      // KEEP (auto-fix branch + verifier-gate path; bypass true)
      {
        id: 1,
        head_branch: 'auto-fix/issue-201',
        path: '.github/workflows/v40-verifier-gate.yml',
        status: 'completed',
        conclusion: 'success',
        updated_at: '2026-06-08T10:05:00Z',
        pull_requests: [{ number: 201 }],
      },
      // DROP (main branch — not auto-fix)
      {
        id: 2,
        head_branch: 'main',
        path: '.github/workflows/v40-verifier-gate.yml',
        status: 'completed',
        conclusion: 'success',
        updated_at: '2026-06-08T11:00:00Z',
        pull_requests: [{ number: 202 }],
      },
      // DROP (auto-fix branch but DIFFERENT workflow path)
      {
        id: 3,
        head_branch: 'auto-fix/issue-203',
        path: '.github/workflows/other.yml',
        status: 'completed',
        conclusion: 'success',
        updated_at: '2026-06-08T11:30:00Z',
        pull_requests: [{ number: 203 }],
      },
      // KEEP (auto-fix branch + verifier-gate path; bypass false)
      {
        id: 4,
        head_branch: 'auto-fix/issue-204',
        path: '.github/workflows/v40-verifier-gate.yml',
        status: 'completed',
        conclusion: 'success',
        updated_at: '2026-06-09T10:55:00Z',
        pull_requests: [{ number: 204 }],
      },
    ];
    // Concatenate as JSONL — one workflow_run per line, exactly as the
    // `--jq '.workflow_runs[]'` flag emits when --paginate spans pages.
    const jsonl = runs.map((r) => JSON.stringify(r)).join('\n') + '\n';

    vi.mocked(execSync).mockImplementation((cmd) => {
      if (cmd === 'gh auth status') return '';
      if (cmd.startsWith('gh repo view')) return 'owner/repo\n';
      if (cmd.includes('actions/runs') && cmd.includes('--paginate')) {
        return jsonl;
      }
      if (cmd.includes('/pulls/201')) return '2026-06-08T10:00:00Z\n';
      if (cmd.includes('/pulls/204')) return '2026-06-09T11:00:00Z\n';
      throw new Error(`unexpected execSync call: ${cmd}`);
    });

    const csv = await captureStdout(async () => {
      await main([
        '--since-iso', '2026-06-01T00:00:00Z',
        '--output', 'csv',
      ]);
    });

    // Exactly two data rows (201 bypass, 204 not bypass) — the main/other
    // runs were filtered out by the head_branch + path filter.
    const lines = csv.trim().split('\n');
    expect(lines.length).toBe(3); // header + 2 data rows
    expect(lines[0]).toBe('pr_number,merged_at,verifier_gate_completed_at,bypass_detected,ledger_source_tag');
    expect(lines[1]).toBe('201,2026-06-08T10:00:00Z,2026-06-08T10:05:00Z,true,no-entry');
    expect(lines[2]).toBe('204,2026-06-09T11:00:00Z,2026-06-09T10:55:00Z,false,no-entry');
  });

  it('T_BYPASS_INTEGRATION_GH_AUTH_FAIL: assertGhAuth path — non-zero `gh auth status` exits 1', async () => {
    vi.mocked(execSync).mockImplementation((cmd) => {
      if (cmd === 'gh auth status') {
        throw new Error('gh: not authenticated');
      }
      throw new Error(`unexpected execSync call: ${cmd}`);
    });

    // Capture process.exit instead of letting it terminate the test runner.
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`__exit__:${code}`);
    });
    // Suppress the auth-fail stderr message so it doesn't clutter test output.
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    await expect(main(['--since-iso', '2026-06-01T00:00:00Z']))
      .rejects.toThrow(/__exit__:1/);

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringMatching(/gh CLI not authenticated/),
    );
  });

  it('T_BYPASS_INTEGRATION_UNMERGED_PR_SKIPPED: PRs with merged_at == null are skipped (no CSV row)', async () => {
    // Smoke that an unmerged PR (gh returns 'null' literal) is filtered
    // out — covers fetchPrMergedAt's null-return branch.
    const run = {
      id: 1,
      head_branch: 'auto-fix/issue-300',
      path: '.github/workflows/v40-verifier-gate.yml',
      status: 'completed',
      conclusion: 'success',
      updated_at: '2026-06-08T10:05:00Z',
      pull_requests: [{ number: 300 }],
    };

    vi.mocked(execSync).mockImplementation((cmd) => {
      if (cmd === 'gh auth status') return '';
      if (cmd.startsWith('gh repo view')) return 'owner/repo\n';
      if (cmd.includes('actions/runs') && cmd.includes('--paginate')) {
        return jsonlLine(run);
      }
      if (cmd.includes('/pulls/300')) return 'null\n';
      throw new Error(`unexpected execSync call: ${cmd}`);
    });

    const csv = await captureStdout(async () => {
      await main([
        '--since-iso', '2026-06-01T00:00:00Z',
        '--output', 'csv',
      ]);
    });

    // Header only — the unmerged PR was skipped.
    const lines = csv.trim().split('\n');
    expect(lines.length).toBe(1);
    expect(lines[0]).toBe('pr_number,merged_at,verifier_gate_completed_at,bypass_detected,ledger_source_tag');
  });
});

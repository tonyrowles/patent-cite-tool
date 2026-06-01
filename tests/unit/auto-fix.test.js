// tests/unit/auto-fix.test.js
//
// Phase 42 Plan 02 (AUTOFIX-01 / AUTOFIX-03 / AUTOFIX-04 / AUTOFIX-05) —
// unit coverage for scripts/auto-fix.mjs runDispatcher().
//
// RED gate: this file imports a not-yet-existing module
// (scripts/auto-fix.mjs). Vitest module-load failure IS the initial RED
// signal. Once the module exists with a `runDispatcher` named export (Task 2
// GREEN), the assertions take over.
//
// Coverage map (16 cases across 6 describe blocks):
//
//   AUTOFIX-01 routing (6):
//     1.  WRONG_CITATION → SDK invoked + diff applied → exit 0
//     2.  FLAKE → no SDK; ledger entry escalate:'re-quarantine' → exit 0
//     3.  LLM_API_ERROR → no SDK; ledger entry escalate:'retry' → exit 0
//     4.  PASS → no SDK; ledger entry escalate:'close-as-pass' → exit 0
//     5.  no ERROR_CLASS label → exit 2 (contract error)
//     6.  multi ERROR_CLASS labels → exit 2 (contract error: ambiguous)
//
//   AUTOFIX-03 diff-guard + apply-check (5):
//     7.  diff modifies tests/test-cases.js → checkDiffGuard fails → comment + exit 1
//     8.  git apply --check fails → ledger errorReason:'apply-check-failed' → exit 1
//     9.  malformed diff: zero fences → ledger errorReason:'malformed-diff' → exit 1
//     10. malformed diff: 2 fence pairs → ledger errorReason:'malformed-diff' → exit 1
//     11. happy path: diff applies → branch + commit + push → exit 0
//
//   AUTOFIX-04 git ls-remote idempotency (2):
//     12. branch exists → no SDK; ledger entry branchExisted:true → exit 0
//     13. branch absent → SDK invoked
//
//   AUTOFIX-05 fix_attempts cap (3):
//     14. 3 prior attempts → no SDK; gh label + gh edit → exit 3
//     15. 2 prior attempts → SDK invoked (cap is "≥3")
//     16. 3 attempts for fp A, dispatching fp B → SDK invoked (per-fingerprint)
//
//   --dry-run (1):
//     17. dry-run → no SDK / no apply / no push / no ledger; stdout has prompt
//
//   --no-push (1):
//     18. no-push + happy path → commit happens; push skipped; stdout hint
//
//   contract errors (2):
//     19. missing --issue → exit 2
//     20. body missing fingerprint → exit 2

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// -----------------------------------------------------------------------
// Mocks — hoisted by Vitest BEFORE any imports below resolve.
// -----------------------------------------------------------------------

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

vi.mock('../e2e/lib/llm-driver.js', () => ({
  invokeAnthropicSdkWithLedger: vi.fn(),
}));

vi.mock('../e2e/lib/llm-ledger.js', () => ({
  readLedger: vi.fn(() => ({ version: 1, months: {} })),
  appendLedgerEntry: vi.fn(),
  countFixAttempts: vi.fn(() => 0),
  LEDGER_PATH: '/tmp/test-ledger.json',
}));

// scripts/check-diff-guard.mjs — keep real checkDiffGuard so the regex bank
// is exercised end-to-end. (vi.mock omitted intentionally.)

// -----------------------------------------------------------------------
// Imports AFTER vi.mock so the dispatcher receives mocked deps.
// -----------------------------------------------------------------------

import { execFileSync } from 'node:child_process';
import { invokeAnthropicSdkWithLedger } from '../e2e/lib/llm-driver.js';
import {
  readLedger,
  appendLedgerEntry,
  countFixAttempts,
} from '../e2e/lib/llm-ledger.js';

// runDispatcher is the named export the dispatcher MUST provide (per
// Plan 42-02 Task 2). Failure to load = RED.
import { runDispatcher } from '../../scripts/auto-fix.mjs';

// -----------------------------------------------------------------------
// Test helpers
// -----------------------------------------------------------------------

const FP = '139f821b3bb1';
const FP8 = '139f821b';
const ISSUE = 3;
const BRANCH = `auto-fix/${ISSUE}-${FP8}`;

function ghIssueViewJson({
  labels = ['triage', 'WRONG_CITATION'],
  body = `<!-- fp: ${FP} -->\ncase-id: US11427642-spec-short-1\nfingerprint: ${FP}\n\nObserved cite differs from baseline.`,
  title = '[e2e-nightly] WRONG_CITATION sample',
  number = ISSUE,
} = {}) {
  return JSON.stringify({ body, labels: labels.map((name) => ({ name })), title, number, assignees: [] });
}

function makeFencedDiff(filePath = 'src/foo.js', body = '@@ -1,1 +1,1 @@\n-old\n+new\n') {
  return [
    'I will fix this.',
    '===DIFF_START===',
    `diff --git a/${filePath} b/${filePath}`,
    `--- a/${filePath}`,
    `+++ b/${filePath}`,
    body,
    '===DIFF_END===',
    '',
  ].join('\n');
}

// Programmable execFileSync mock — returns based on (cmd, argsTuple).
function setupExecFileSyncRouter(rules) {
  vi.mocked(execFileSync).mockImplementation((cmd, args = [], opts = {}) => {
    for (const rule of rules) {
      if (rule.match(cmd, args, opts)) {
        if (typeof rule.respond === 'function') return rule.respond(cmd, args, opts);
        if (rule.respond instanceof Error) throw rule.respond;
        if (rule.respond && rule.respond.isError) {
          const err = new Error(rule.respond.message || 'exec failed');
          err.status = rule.respond.status ?? 1;
          err.stderr = rule.respond.stderr ?? '';
          throw err;
        }
        return rule.respond ?? '';
      }
    }
    // Default: empty string for unknown commands (success).
    return '';
  });
}

const ghIssueViewRule = (jsonOverrides) => ({
  match: (cmd, args) => cmd === 'gh' && args[0] === 'issue' && args[1] === 'view',
  respond: ghIssueViewJson(jsonOverrides),
});

const lsRemoteEmptyRule = () => ({
  match: (cmd, args) => cmd === 'git' && args[0] === 'ls-remote',
  respond: '',
});

const lsRemoteHitRule = () => ({
  match: (cmd, args) => cmd === 'git' && args[0] === 'ls-remote',
  respond: `abc123\trefs/heads/${BRANCH}\n`,
});

const applyCheckOkRule = () => ({
  match: (cmd, args) => cmd === 'git' && args[0] === 'apply' && args.includes('--check'),
  respond: '',
});

const applyOkRule = () => ({
  match: (cmd, args) =>
    cmd === 'git' && args[0] === 'apply' && !args.includes('--check'),
  respond: '',
});

const checkoutOkRule = () => ({
  match: (cmd, args) => cmd === 'git' && args[0] === 'checkout',
  respond: '',
});

const commitOkRule = () => ({
  match: (cmd, args) => cmd === 'git' && args[0] === 'commit',
  respond: '',
});

const pushOkRule = () => ({
  match: (cmd, args) => cmd === 'git' && args[0] === 'push',
  respond: '',
});

const ghLabelOkRule = () => ({
  match: (cmd, args) => cmd === 'gh' && args[0] === 'label',
  respond: '',
});

const ghIssueEditOkRule = () => ({
  match: (cmd, args) => cmd === 'gh' && args[0] === 'issue' && args[1] === 'edit',
  respond: '',
});

const ghIssueCommentOkRule = () => ({
  match: (cmd, args) => cmd === 'gh' && args[0] === 'issue' && args[1] === 'comment',
  respond: '',
});

function countCalls(predicate) {
  return vi.mocked(execFileSync).mock.calls.filter(([cmd, args]) => predicate(cmd, args)).length;
}

// -----------------------------------------------------------------------
// beforeEach — clean slate for every test
// -----------------------------------------------------------------------

beforeEach(() => {
  vi.mocked(execFileSync).mockReset();
  vi.mocked(invokeAnthropicSdkWithLedger).mockReset();
  vi.mocked(readLedger).mockReset().mockReturnValue({ version: 1, months: {} });
  vi.mocked(appendLedgerEntry).mockReset();
  vi.mocked(countFixAttempts).mockReset().mockReturnValue(0);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// =======================================================================
// AUTOFIX-01: ERROR_CLASS routing
// =======================================================================

describe('AUTOFIX-01: ERROR_CLASS routing', () => {
  it('1: WRONG_CITATION → SDK invoked with phase=42-auto-fix, issueId=issue-3; happy path exit 0', async () => {
    setupExecFileSyncRouter([
      ghIssueViewRule({ labels: ['triage', 'WRONG_CITATION'] }),
      lsRemoteEmptyRule(),
      applyCheckOkRule(),
      applyOkRule(),
      checkoutOkRule(),
      commitOkRule(),
      pushOkRule(),
    ]);
    vi.mocked(invokeAnthropicSdkWithLedger).mockResolvedValue({
      ok: true,
      llmText: makeFencedDiff('src/foo.js'),
      modelId: 'claude-sonnet-4-6',
      costUsd: 0.05,
      rawJson: {},
    });
    const exit = await runDispatcher({ issue: ISSUE, transport: 'sdk', forceApi: true });
    expect(exit).toBe(0);
    expect(invokeAnthropicSdkWithLedger).toHaveBeenCalledTimes(1);
    const callArgs = vi.mocked(invokeAnthropicSdkWithLedger).mock.calls[0][0];
    expect(callArgs.phase).toBe('42-auto-fix');
    expect(callArgs.issueId).toBe(`issue-${ISSUE}`);
  });

  it('2: FLAKE → no SDK; ledger escalate:re-quarantine; exit 0', async () => {
    setupExecFileSyncRouter([
      ghIssueViewRule({ labels: ['triage', 'FLAKE'] }),
      lsRemoteEmptyRule(),
    ]);
    const exit = await runDispatcher({ issue: ISSUE, transport: 'sdk', forceApi: true });
    expect(exit).toBe(0);
    expect(invokeAnthropicSdkWithLedger).not.toHaveBeenCalled();
    expect(appendLedgerEntry).toHaveBeenCalled();
    const [, entry] = vi.mocked(appendLedgerEntry).mock.calls[0];
    expect(entry.escalate).toBe('re-quarantine');
    expect(entry.cost_usd).toBe(0);
    expect(entry.phase).toBe('42-auto-fix');
  });

  it('3: LLM_API_ERROR → no SDK; ledger escalate:retry; exit 0', async () => {
    setupExecFileSyncRouter([
      ghIssueViewRule({ labels: ['triage', 'LLM_API_ERROR'] }),
      lsRemoteEmptyRule(),
    ]);
    const exit = await runDispatcher({ issue: ISSUE, transport: 'sdk', forceApi: true });
    expect(exit).toBe(0);
    expect(invokeAnthropicSdkWithLedger).not.toHaveBeenCalled();
    const [, entry] = vi.mocked(appendLedgerEntry).mock.calls[0];
    expect(entry.escalate).toBe('retry');
    expect(entry.cost_usd).toBe(0);
  });

  it('4: PASS → no SDK; ledger escalate:close-as-pass; exit 0', async () => {
    setupExecFileSyncRouter([
      ghIssueViewRule({ labels: ['triage', 'PASS'] }),
      lsRemoteEmptyRule(),
    ]);
    const exit = await runDispatcher({ issue: ISSUE, transport: 'sdk', forceApi: true });
    expect(exit).toBe(0);
    expect(invokeAnthropicSdkWithLedger).not.toHaveBeenCalled();
    const [, entry] = vi.mocked(appendLedgerEntry).mock.calls[0];
    expect(entry.escalate).toBe('close-as-pass');
    expect(entry.cost_usd).toBe(0);
  });

  it('5: no ERROR_CLASS label → exit 2 (contract)', async () => {
    setupExecFileSyncRouter([
      ghIssueViewRule({ labels: ['triage', 'something-else'] }),
    ]);
    const exit = await runDispatcher({ issue: ISSUE, transport: 'sdk', forceApi: true });
    expect(exit).toBe(2);
    expect(invokeAnthropicSdkWithLedger).not.toHaveBeenCalled();
  });

  it('6: multi ERROR_CLASS labels → exit 2 (ambiguous)', async () => {
    setupExecFileSyncRouter([
      ghIssueViewRule({ labels: ['triage', 'WRONG_CITATION', 'FLAKE'] }),
    ]);
    const exit = await runDispatcher({ issue: ISSUE, transport: 'sdk', forceApi: true });
    expect(exit).toBe(2);
    expect(invokeAnthropicSdkWithLedger).not.toHaveBeenCalled();
  });
});

// =======================================================================
// AUTOFIX-03: diff-guard + git apply --check
// =======================================================================

describe('AUTOFIX-03: diff-guard + git apply --check pre-application', () => {
  it('7: diff modifies tests/test-cases.js → diff-guard rejects → comment + exit 1', async () => {
    setupExecFileSyncRouter([
      ghIssueViewRule(),
      lsRemoteEmptyRule(),
      ghIssueCommentOkRule(),
    ]);
    vi.mocked(invokeAnthropicSdkWithLedger).mockResolvedValue({
      ok: true,
      llmText: makeFencedDiff('tests/test-cases.js'),
      modelId: 'claude-sonnet-4-6',
      costUsd: 0.05,
      rawJson: {},
    });
    const exit = await runDispatcher({ issue: ISSUE, transport: 'sdk', forceApi: true });
    expect(exit).toBe(1);
    // git apply MUST NOT have run (neither --check nor without)
    expect(countCalls((cmd, args) => cmd === 'git' && args[0] === 'apply')).toBe(0);
    // gh issue comment SHOULD have run
    expect(countCalls((cmd, args) => cmd === 'gh' && args[0] === 'issue' && args[1] === 'comment')).toBeGreaterThanOrEqual(1);
    // ledger entry mentions the violation
    const ledgerCalls = vi.mocked(appendLedgerEntry).mock.calls;
    const hasViolationEntry = ledgerCalls.some(([, e]) =>
      typeof e.errorReason === 'string' && e.errorReason.includes('tests/test-cases.js'));
    expect(hasViolationEntry).toBe(true);
  });

  it('8: git apply --check fails → errorReason:apply-check-failed → exit 1', async () => {
    setupExecFileSyncRouter([
      ghIssueViewRule(),
      lsRemoteEmptyRule(),
      {
        match: (cmd, args) => cmd === 'git' && args[0] === 'apply' && args.includes('--check'),
        respond: { isError: true, status: 1, stderr: 'error: patch failed: hunk at line 5\n' },
      },
    ]);
    vi.mocked(invokeAnthropicSdkWithLedger).mockResolvedValue({
      ok: true,
      llmText: makeFencedDiff('src/foo.js'),
      modelId: 'claude-sonnet-4-6',
      costUsd: 0.05,
      rawJson: {},
    });
    const exit = await runDispatcher({ issue: ISSUE, transport: 'sdk', forceApi: true });
    expect(exit).toBe(1);
    // git apply WITHOUT --check MUST NOT have run
    expect(countCalls((cmd, args) => cmd === 'git' && args[0] === 'apply' && !args.includes('--check'))).toBe(0);
    const ledgerCalls = vi.mocked(appendLedgerEntry).mock.calls;
    expect(ledgerCalls.some(([, e]) => e.errorReason === 'apply-check-failed')).toBe(true);
  });

  it('9: malformed diff (zero fences) → errorReason starts with malformed-diff → exit 1', async () => {
    setupExecFileSyncRouter([
      ghIssueViewRule(),
      lsRemoteEmptyRule(),
    ]);
    vi.mocked(invokeAnthropicSdkWithLedger).mockResolvedValue({
      ok: true,
      llmText: 'No fences here at all, just plain prose.',
      modelId: 'claude-sonnet-4-6',
      costUsd: 0.05,
      rawJson: {},
    });
    const exit = await runDispatcher({ issue: ISSUE, transport: 'sdk', forceApi: true });
    expect(exit).toBe(1);
    expect(countCalls((cmd, args) => cmd === 'git' && args[0] === 'apply')).toBe(0);
    const ledgerCalls = vi.mocked(appendLedgerEntry).mock.calls;
    expect(ledgerCalls.some(([, e]) => typeof e.errorReason === 'string' && e.errorReason.startsWith('malformed-diff'))).toBe(true);
  });

  it('10: malformed diff (two fence pairs) → errorReason starts with malformed-diff → exit 1', async () => {
    setupExecFileSyncRouter([
      ghIssueViewRule(),
      lsRemoteEmptyRule(),
    ]);
    const doubled = makeFencedDiff('src/foo.js') + '\n' + makeFencedDiff('src/bar.js');
    vi.mocked(invokeAnthropicSdkWithLedger).mockResolvedValue({
      ok: true,
      llmText: doubled,
      modelId: 'claude-sonnet-4-6',
      costUsd: 0.05,
      rawJson: {},
    });
    const exit = await runDispatcher({ issue: ISSUE, transport: 'sdk', forceApi: true });
    expect(exit).toBe(1);
    expect(countCalls((cmd, args) => cmd === 'git' && args[0] === 'apply')).toBe(0);
    const ledgerCalls = vi.mocked(appendLedgerEntry).mock.calls;
    expect(ledgerCalls.some(([, e]) => typeof e.errorReason === 'string' && e.errorReason.startsWith('malformed-diff'))).toBe(true);
  });

  it('11: happy path → checkout + commit + push → exit 0', async () => {
    setupExecFileSyncRouter([
      ghIssueViewRule(),
      lsRemoteEmptyRule(),
      applyCheckOkRule(),
      applyOkRule(),
      checkoutOkRule(),
      commitOkRule(),
      pushOkRule(),
    ]);
    vi.mocked(invokeAnthropicSdkWithLedger).mockResolvedValue({
      ok: true,
      llmText: makeFencedDiff('src/foo.js'),
      modelId: 'claude-sonnet-4-6',
      costUsd: 0.05,
      rawJson: {},
    });
    const exit = await runDispatcher({ issue: ISSUE, transport: 'sdk', forceApi: true });
    expect(exit).toBe(0);
    expect(countCalls((cmd, args) => cmd === 'git' && args[0] === 'checkout' && args.includes(BRANCH))).toBeGreaterThanOrEqual(1);
    expect(countCalls((cmd, args) => cmd === 'git' && args[0] === 'commit')).toBeGreaterThanOrEqual(1);
    expect(countCalls((cmd, args) => cmd === 'git' && args[0] === 'push')).toBeGreaterThanOrEqual(1);
  });
});

// =======================================================================
// AUTOFIX-04: git ls-remote idempotency
// =======================================================================

describe('AUTOFIX-04: git ls-remote idempotency', () => {
  it('12: branch exists on origin → no SDK; branchExisted:true ledger entry; comment posted; exit 0', async () => {
    setupExecFileSyncRouter([
      ghIssueViewRule(),
      lsRemoteHitRule(),
      ghIssueCommentOkRule(),
    ]);
    const exit = await runDispatcher({ issue: ISSUE, transport: 'sdk', forceApi: true });
    expect(exit).toBe(0);
    expect(invokeAnthropicSdkWithLedger).not.toHaveBeenCalled();
    const ledgerCalls = vi.mocked(appendLedgerEntry).mock.calls;
    expect(ledgerCalls.some(([, e]) => e.branchExisted === true)).toBe(true);
    const commentCmd = vi.mocked(execFileSync).mock.calls.find(
      ([cmd, args]) => cmd === 'gh' && args[0] === 'issue' && args[1] === 'comment',
    );
    expect(commentCmd).toBeDefined();
    const flatArgs = commentCmd[1].join(' ');
    expect(flatArgs).toMatch(/already attempted/i);
  });

  it('13: branch absent → SDK invoked', async () => {
    setupExecFileSyncRouter([
      ghIssueViewRule(),
      lsRemoteEmptyRule(),
      applyCheckOkRule(),
      applyOkRule(),
      checkoutOkRule(),
      commitOkRule(),
      pushOkRule(),
    ]);
    vi.mocked(invokeAnthropicSdkWithLedger).mockResolvedValue({
      ok: true,
      llmText: makeFencedDiff('src/foo.js'),
      modelId: 'claude-sonnet-4-6',
      costUsd: 0.05,
      rawJson: {},
    });
    const exit = await runDispatcher({ issue: ISSUE, transport: 'sdk', forceApi: true });
    expect(exit).toBe(0);
    expect(invokeAnthropicSdkWithLedger).toHaveBeenCalledTimes(1);
  });
});

// =======================================================================
// AUTOFIX-05: fix_attempts cap at 3
// =======================================================================

describe('AUTOFIX-05: fix_attempts cap at 3', () => {
  it('14: 3 prior matching attempts → no SDK; gh label create + gh issue edit; exit 3', async () => {
    setupExecFileSyncRouter([
      ghIssueViewRule(),
      lsRemoteEmptyRule(),
      ghLabelOkRule(),
      ghIssueEditOkRule(),
    ]);
    vi.mocked(countFixAttempts).mockReturnValue(3);
    const exit = await runDispatcher({ issue: ISSUE, transport: 'sdk', forceApi: true });
    expect(exit).toBe(3);
    expect(invokeAnthropicSdkWithLedger).not.toHaveBeenCalled();
    expect(countCalls((cmd, args) => cmd === 'gh' && args[0] === 'label' && args[1] === 'create')).toBeGreaterThanOrEqual(1);
    expect(countCalls((cmd, args) => cmd === 'gh' && args[0] === 'issue' && args[1] === 'edit' && args.includes('--add-label'))).toBeGreaterThanOrEqual(1);
  });

  it('15: 2 prior attempts → SDK invoked (3rd attempt allowed)', async () => {
    setupExecFileSyncRouter([
      ghIssueViewRule(),
      lsRemoteEmptyRule(),
      applyCheckOkRule(),
      applyOkRule(),
      checkoutOkRule(),
      commitOkRule(),
      pushOkRule(),
    ]);
    vi.mocked(countFixAttempts).mockReturnValue(2);
    vi.mocked(invokeAnthropicSdkWithLedger).mockResolvedValue({
      ok: true,
      llmText: makeFencedDiff('src/foo.js'),
      modelId: 'claude-sonnet-4-6',
      costUsd: 0.05,
      rawJson: {},
    });
    const exit = await runDispatcher({ issue: ISSUE, transport: 'sdk', forceApi: true });
    expect(exit).toBe(0);
    expect(invokeAnthropicSdkWithLedger).toHaveBeenCalledTimes(1);
  });

  it('16: countFixAttempts is per-fingerprint (cap on A, dispatching B → SDK runs)', async () => {
    setupExecFileSyncRouter([
      ghIssueViewRule(),
      lsRemoteEmptyRule(),
      applyCheckOkRule(),
      applyOkRule(),
      checkoutOkRule(),
      commitOkRule(),
      pushOkRule(),
    ]);
    // The dispatcher reads the per-fingerprint count from countFixAttempts, so
    // returning 0 here mirrors "no prior attempts for the current fingerprint".
    vi.mocked(countFixAttempts).mockReturnValue(0);
    vi.mocked(invokeAnthropicSdkWithLedger).mockResolvedValue({
      ok: true,
      llmText: makeFencedDiff('src/foo.js'),
      modelId: 'claude-sonnet-4-6',
      costUsd: 0.05,
      rawJson: {},
    });
    const exit = await runDispatcher({ issue: ISSUE, transport: 'sdk', forceApi: true });
    expect(exit).toBe(0);
    expect(invokeAnthropicSdkWithLedger).toHaveBeenCalledTimes(1);
    // Verify the call site passed the fingerprint extracted from the body, not
    // a global counter.
    expect(vi.mocked(countFixAttempts).mock.calls[0][1]).toBe(FP);
  });
});

// =======================================================================
// --dry-run mode
// =======================================================================

describe('--dry-run mode', () => {
  it('17: --dry-run → no SDK / no apply / no push / no ledger; stdout has prompt', async () => {
    setupExecFileSyncRouter([
      ghIssueViewRule(),
      lsRemoteEmptyRule(),
    ]);
    const stdoutChunks = [];
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk) => { stdoutChunks.push(String(chunk)); return true; });
    let exit;
    try {
      exit = await runDispatcher({ issue: ISSUE, transport: 'sdk', forceApi: true, dryRun: true });
    } finally {
      process.stdout.write = origWrite;
    }
    expect(exit).toBe(0);
    expect(invokeAnthropicSdkWithLedger).not.toHaveBeenCalled();
    expect(countCalls((cmd, args) => cmd === 'git' && args[0] === 'apply')).toBe(0);
    expect(countCalls((cmd, args) => cmd === 'git' && args[0] === 'push')).toBe(0);
    expect(appendLedgerEntry).not.toHaveBeenCalled();
    const combined = stdoutChunks.join('');
    expect(combined).toContain('<issue_body_untrusted>');
    expect(combined).toContain('</issue_body_untrusted>');
  });
});

// =======================================================================
// --no-push mode
// =======================================================================

describe('--no-push mode', () => {
  it('18: --no-push happy path → commit happens; push skipped; stdout hint', async () => {
    setupExecFileSyncRouter([
      ghIssueViewRule(),
      lsRemoteEmptyRule(),
      applyCheckOkRule(),
      applyOkRule(),
      checkoutOkRule(),
      commitOkRule(),
    ]);
    vi.mocked(invokeAnthropicSdkWithLedger).mockResolvedValue({
      ok: true,
      llmText: makeFencedDiff('src/foo.js'),
      modelId: 'claude-sonnet-4-6',
      costUsd: 0.05,
      rawJson: {},
    });
    const stdoutChunks = [];
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk) => { stdoutChunks.push(String(chunk)); return true; });
    let exit;
    try {
      exit = await runDispatcher({ issue: ISSUE, transport: 'sdk', forceApi: true, noPush: true });
    } finally {
      process.stdout.write = origWrite;
    }
    expect(exit).toBe(0);
    expect(countCalls((cmd, args) => cmd === 'git' && args[0] === 'commit')).toBeGreaterThanOrEqual(1);
    expect(countCalls((cmd, args) => cmd === 'git' && args[0] === 'push')).toBe(0);
    expect(stdoutChunks.join('')).toMatch(/git push -u origin auto-fix\/3-139f821b/);
  });
});

// =======================================================================
// Contract errors
// =======================================================================

describe('contract errors', () => {
  it('19: missing --issue → exit 2', async () => {
    // No issue param; should not even attempt gh issue view.
    const exit = await runDispatcher({ transport: 'sdk', forceApi: true });
    expect(exit).toBe(2);
    expect(execFileSync).not.toHaveBeenCalled();
  });

  it('20: body missing fingerprint line → exit 2', async () => {
    setupExecFileSyncRouter([
      ghIssueViewRule({ body: 'No fingerprint comment in this body at all.' }),
    ]);
    const exit = await runDispatcher({ issue: ISSUE, transport: 'sdk', forceApi: true });
    expect(exit).toBe(2);
    expect(invokeAnthropicSdkWithLedger).not.toHaveBeenCalled();
  });
});

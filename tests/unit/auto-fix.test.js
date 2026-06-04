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

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';

// -----------------------------------------------------------------------
// Mocks — hoisted by Vitest BEFORE any imports below resolve.
// -----------------------------------------------------------------------

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

vi.mock('../e2e/lib/llm-driver.js', () => ({
  invokeAnthropicSdkWithLedger: vi.fn(),
  invokeClaudePWithLedger: vi.fn(),
}));

vi.mock('../e2e/lib/llm-ledger.js', () => ({
  readLedger: vi.fn(() => ({ version: 1, months: {} })),
  appendLedgerEntry: vi.fn(),
  countFixAttempts: vi.fn(() => 0),
  LEDGER_PATH: '/tmp/test-ledger.json',
}));

// Phase 45-03 — mock the triage-classifier sibling exports consumed by the
// new dispatchFlakeState helper in auto-fix.mjs. Default classifyRerunOutcomes
// returns the FLAKE state (matches an "outcomes:[], flakeHistory:[]" classification)
// so the legacy FLAKE-label Phase 42 tests can override per-test as needed.
vi.mock('../e2e/lib/triage-classifier.js', () => ({
  classifyRerunOutcomes: vi.fn(() => ({ state: 'FLAKE', action: 're-quarantine' })),
  readRingBufferOrInit: vi.fn(() => ({ version: 1, cases: {} })),
  readSuppressionsOrInit: vi.fn(() => ({ version: 1, suppressions: {} })),
  atomicWriteJson: vi.fn(),
  buildFlakeInvestigationBody: vi.fn(() => '## Flake investigation body\n'),
  FLAKE_SUPPRESSION_DAYS: 30,
}));

// scripts/check-diff-guard.mjs — keep real checkDiffGuard so the regex bank
// is exercised end-to-end. (vi.mock omitted intentionally.)

// -----------------------------------------------------------------------
// Imports AFTER vi.mock so the dispatcher receives mocked deps.
// -----------------------------------------------------------------------

import { execFileSync } from 'node:child_process';
import { invokeAnthropicSdkWithLedger, invokeClaudePWithLedger } from '../e2e/lib/llm-driver.js';
import {
  readLedger,
  appendLedgerEntry,
  countFixAttempts,
} from '../e2e/lib/llm-ledger.js';
import {
  classifyRerunOutcomes,
  readRingBufferOrInit,
  readSuppressionsOrInit,
  atomicWriteJson,
} from '../e2e/lib/triage-classifier.js';

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
// Phase 56 CR-01 fix — file-level CI env guard so safeAppendLedger passes.
// -----------------------------------------------------------------------
// scripts/auto-fix.mjs:safeAppendLedger (LEDGER-02) refuses to call the
// (mocked) appendLedgerEntry unless process.env.CI === 'true' (or the
// E2E_LEDGER_PATH_OVERRIDE escape hatch is set). Vitest does NOT implicitly
// set CI=true, and package.json's `test:src` script is bare `vitest run`
// with no cross-env wrapper, so a developer running `npm test` on a
// workstation without CI exported in their shell would hit 18 pre-existing
// failures (every test that reaches a safeAppendLedger call site:
// 2/3/4/7/8/9/10/12, G2, D1-D6, I1-I3, 46.9, etc.). The LEDGER-04 test
// originally fixed this in-test with a try/finally per assertion, but that
// pattern does not scale.
//
// We snapshot CI here at file scope (beforeAll) and restore it at file
// end (afterAll). Tests that need to exercise the safeAppendLedger
// refusal path can still toggle process.env.CI off inside their own
// try/finally — the file-level beforeAll only establishes the default.
//
// Why we chose this over widening tests/setup/chrome-stub.js (the other
// option in the REVIEW.md fix suggestion): chrome-stub.js is a GLOBAL
// vitest setupFile shared by chrome / firefox / node test suites. Adding
// process.env.CI='true' there would leak the env override into every
// unrelated test file (lint-guard tests, llm-ledger tests, etc.), and
// the llm-ledger LEDGER_PATH IIFE explicitly THROWS when both CI and
// E2E_LEDGER_PATH_OVERRIDE are set (llm-ledger.js:86-93) — chrome-stub
// load order vs. llm-ledger.js module load order is exactly the kind of
// non-local interaction that bit the leak vector in the first place.
// Localizing to auto-fix.test.js keeps the override surface area small
// and contained to the exact file that consumes the safeAppendLedger
// wrapper.
let __savedCI;
beforeAll(() => {
  __savedCI = process.env.CI;
  process.env.CI = 'true';
});
afterAll(() => {
  if (__savedCI === undefined) delete process.env.CI;
  else process.env.CI = __savedCI;
});

// -----------------------------------------------------------------------
// beforeEach — clean slate for every test
// -----------------------------------------------------------------------

beforeEach(() => {
  vi.mocked(execFileSync).mockReset();
  vi.mocked(invokeAnthropicSdkWithLedger).mockReset();
  vi.mocked(invokeClaudePWithLedger).mockReset();
  vi.mocked(readLedger).mockReset().mockReturnValue({ version: 1, months: {} });
  vi.mocked(appendLedgerEntry).mockReset();
  vi.mocked(countFixAttempts).mockReset().mockReturnValue(0);
  // Phase 45-03 — triage-classifier mocks default to FLAKE state with empty
  // bootstraps so the Phase 42 FLAKE-label test (#2) routes through the new
  // dispatchFlakeState helper without hitting real fs reads.
  vi.mocked(classifyRerunOutcomes)
    .mockReset()
    .mockReturnValue({ state: 'FLAKE', action: 're-quarantine' });
  vi.mocked(readRingBufferOrInit)
    .mockReset()
    .mockReturnValue({ version: 1, cases: {} });
  vi.mocked(readSuppressionsOrInit)
    .mockReset()
    .mockReturnValue({ version: 1, suppressions: {} });
  vi.mocked(atomicWriteJson).mockReset();
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

  it('2: FLAKE → no SDK; dispatchFlakeState routes via classifyRerunOutcomes (state=FLAKE default); ledger entry written; exit 0', async () => {
    // Phase 45-03: FLAKE-labeled issues now route through dispatchFlakeState
    // BEFORE the legacy Phase 42 ledger path. With the default beforeEach mock
    // (state=FLAKE, action=re-quarantine + empty ring buffer + empty
    // suppressions), the helper invokes quarantine-append via execFileSync and
    // writes a `source: 'flake-dispatched'` ledger entry.
    setupExecFileSyncRouter([
      ghIssueViewRule({ labels: ['triage', 'FLAKE'] }),
      lsRemoteEmptyRule(),
    ]);
    const exit = await runDispatcher({ issue: ISSUE, transport: 'sdk', forceApi: true });
    expect(exit).toBe(0);
    expect(invokeAnthropicSdkWithLedger).not.toHaveBeenCalled();
    expect(appendLedgerEntry).toHaveBeenCalled();
    // Ledger entry must come from the new helper (source: 'flake-dispatched')
    // and carry the classifyRerunOutcomes decision.
    const ledgerEntries = vi.mocked(appendLedgerEntry).mock.calls.map(([, e]) => e);
    const flakeEntry = ledgerEntries.find((e) => e.source === 'flake-dispatched');
    expect(flakeEntry).toBeDefined();
    expect(flakeEntry.flakeState).toBe('FLAKE');
    expect(flakeEntry.cost_usd).toBe(0);
    expect(flakeEntry.phase).toBe('42-auto-fix');
    // FLAKE state ALSO calls quarantine-append via execFileSync (the reset path).
    const quarantineAppendCalls = vi.mocked(execFileSync).mock.calls.filter(
      ([cmd, args]) =>
        cmd === 'node' && Array.isArray(args) && args[0] === 'scripts/quarantine-append.mjs',
    );
    expect(quarantineAppendCalls.length).toBeGreaterThanOrEqual(1);
    expect(quarantineAppendCalls[0][1]).toContain('--escalate-stable-runs-reset');
    expect(quarantineAppendCalls[0][1]).toContain('1');
    expect(quarantineAppendCalls[0][1]).toContain('--case');
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

// =======================================================================
// Phase 45-03 G1-G3: flake-investigation label guard (Step 4a — Pitfall 5)
// =======================================================================

describe('Phase 45-03 G1-G3: flake-investigation label guard (Step 4a Pitfall 5)', () => {
  it('G1: label present with triage + FLAKE → exit 0 WITHOUT invoking SDK; stderr message', async () => {
    setupExecFileSyncRouter([
      ghIssueViewRule({ labels: ['triage', 'FLAKE', 'flake-investigation'] }),
    ]);
    const stderrChunks = [];
    const origWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk) => { stderrChunks.push(String(chunk)); return true; });
    let exit;
    try {
      exit = await runDispatcher({ issue: ISSUE, transport: 'sdk', forceApi: true });
    } finally {
      process.stderr.write = origWrite;
    }
    expect(exit).toBe(0);
    expect(invokeAnthropicSdkWithLedger).not.toHaveBeenCalled();
    // The guard runs BEFORE Step 5 (countFixAttempts) and Step 6 (ls-remote),
    // so neither should be reached.
    expect(countCalls((cmd, args) => cmd === 'git' && args[0] === 'ls-remote')).toBe(0);
    expect(stderrChunks.join('')).toContain('flake-investigation issues are human-only — auto-fix skipped');
  });

  it('G2: label absent (only triage + FLAKE) → guard does NOT short-circuit; falls through to FLAKE dispatch', async () => {
    setupExecFileSyncRouter([
      ghIssueViewRule({ labels: ['triage', 'FLAKE'] }),
      lsRemoteEmptyRule(),
    ]);
    const exit = await runDispatcher({ issue: ISSUE, transport: 'sdk', forceApi: true });
    expect(exit).toBe(0);
    // ls-remote was reached → guard did not short-circuit.
    expect(countCalls((cmd, args) => cmd === 'git' && args[0] === 'ls-remote')).toBeGreaterThanOrEqual(1);
    // Ledger entry exists from dispatchFlakeState
    expect(appendLedgerEntry).toHaveBeenCalled();
  });

  it('G3: flake-investigation label alone (no ERROR_CLASS) → exit 0 (guard runs BEFORE Step 4 ERROR_CLASS extraction)', async () => {
    setupExecFileSyncRouter([
      ghIssueViewRule({ labels: ['flake-investigation'] }),
    ]);
    const exit = await runDispatcher({ issue: ISSUE, transport: 'sdk', forceApi: true });
    // Crucially: not exit 2. The guard fires before "no ERROR_CLASS" path.
    expect(exit).toBe(0);
    expect(invokeAnthropicSdkWithLedger).not.toHaveBeenCalled();
  });
});

// =======================================================================
// Phase 45-03 D1-D6: FLAKE dispatch 5-state machine (Step 7 dispatchFlakeState)
// =======================================================================

describe('Phase 45-03 D1-D6: FLAKE dispatch 5-state machine (Step 7)', () => {
  it('D1: state=FLAKE → quarantine-append invoked with arg ARRAY; ledger source:flake-dispatched; NO gh issue create', async () => {
    setupExecFileSyncRouter([
      ghIssueViewRule({ labels: ['triage', 'FLAKE'] }),
      lsRemoteEmptyRule(),
    ]);
    vi.mocked(classifyRerunOutcomes).mockReturnValue({ state: 'FLAKE', action: 're-quarantine' });
    const exit = await runDispatcher({ issue: ISSUE, transport: 'sdk', forceApi: true });
    expect(exit).toBe(0);
    // quarantine-append invoked with arg ARRAY (CWE-94)
    const quarantineCalls = vi.mocked(execFileSync).mock.calls.filter(
      ([cmd, args]) =>
        cmd === 'node' && Array.isArray(args) && args[0] === 'scripts/quarantine-append.mjs',
    );
    expect(quarantineCalls.length).toBe(1);
    expect(quarantineCalls[0][1]).toEqual([
      'scripts/quarantine-append.mjs',
      '--escalate-stable-runs-reset', '1',
      '--case', 'US11427642-spec-short-1',
    ]);
    // Ledger entry written with source:flake-dispatched and flakeState:FLAKE
    const ledgerEntries = vi.mocked(appendLedgerEntry).mock.calls.map(([, e]) => e);
    const flakeEntry = ledgerEntries.find((e) => e.source === 'flake-dispatched');
    expect(flakeEntry).toBeDefined();
    expect(flakeEntry.flakeState).toBe('FLAKE');
    // No gh issue create
    expect(countCalls((cmd, args) => cmd === 'gh' && args[0] === 'issue' && args[1] === 'create')).toBe(0);
  });

  it('D2: state=INTERMITTENT → quarantine-append NOT called (per CONTEXT lock); ledger entry written; NO gh issue create', async () => {
    setupExecFileSyncRouter([
      ghIssueViewRule({ labels: ['triage', 'FLAKE'] }),
      lsRemoteEmptyRule(),
    ]);
    vi.mocked(classifyRerunOutcomes).mockReturnValue({ state: 'INTERMITTENT', action: 're-quarantine' });
    const exit = await runDispatcher({ issue: ISSUE, transport: 'sdk', forceApi: true });
    expect(exit).toBe(0);
    // INTERMITTENT is NO-OP on corpus per 45-CONTEXT lock
    const quarantineCalls = vi.mocked(execFileSync).mock.calls.filter(
      ([cmd, args]) =>
        cmd === 'node' && Array.isArray(args) && args[0] === 'scripts/quarantine-append.mjs',
    );
    expect(quarantineCalls.length).toBe(0);
    // No gh issue create
    expect(countCalls((cmd, args) => cmd === 'gh' && args[0] === 'issue' && args[1] === 'create')).toBe(0);
    const ledgerEntries = vi.mocked(appendLedgerEntry).mock.calls.map(([, e]) => e);
    const intermittentEntry = ledgerEntries.find((e) => e.flakeState === 'INTERMITTENT');
    expect(intermittentEntry).toBeDefined();
    expect(intermittentEntry.source).toBe('flake-dispatched');
  });

  it('D3: state=FLAKE_ESCALATION → gh label create --force; gh issue create with flake-investigation label; atomicWriteJson writes suppression; quarantine-append ALSO invoked', async () => {
    setupExecFileSyncRouter([
      ghIssueViewRule({ labels: ['triage', 'FLAKE'] }),
      lsRemoteEmptyRule(),
    ]);
    vi.mocked(classifyRerunOutcomes).mockReturnValue({
      state: 'FLAKE_ESCALATION',
      action: 'open-flake-investigation',
      until: '2026-06-30T12:00:00.000Z',
    });
    const exit = await runDispatcher({ issue: ISSUE, transport: 'sdk', forceApi: true });
    expect(exit).toBe(0);
    // gh label create --force for the flake-investigation label
    const labelCreateCalls = vi.mocked(execFileSync).mock.calls.filter(
      ([cmd, args]) =>
        cmd === 'gh' && Array.isArray(args) &&
        args[0] === 'label' && args[1] === 'create' &&
        args.includes('flake-investigation') && args.includes('--force'),
    );
    expect(labelCreateCalls.length).toBeGreaterThanOrEqual(1);
    // gh issue create with flake-investigation + fingerprint-prefix labels
    const issueCreateCalls = vi.mocked(execFileSync).mock.calls.filter(
      ([cmd, args]) =>
        cmd === 'gh' && Array.isArray(args) &&
        args[0] === 'issue' && args[1] === 'create',
    );
    expect(issueCreateCalls.length).toBe(1);
    const issueArgs = issueCreateCalls[0][1];
    expect(issueArgs).toContain('--label');
    expect(issueArgs).toContain('flake-investigation');
    expect(issueArgs).toContain(FP8);
    expect(issueArgs).toContain('--title');
    expect(issueArgs).toContain('--body');
    // Suppression file written via atomicWriteJson
    expect(atomicWriteJson).toHaveBeenCalled();
    const [, suppressionContent] = vi.mocked(atomicWriteJson).mock.calls[0];
    expect(suppressionContent).toContain(FP);
    expect(suppressionContent).toContain('FLAKE_ESCALATION');
    // Quarantine-append ALSO invoked (FLAKE_ESCALATION inherits FLAKE reset semantics)
    const quarantineCalls = vi.mocked(execFileSync).mock.calls.filter(
      ([cmd, args]) =>
        cmd === 'node' && Array.isArray(args) && args[0] === 'scripts/quarantine-append.mjs',
    );
    expect(quarantineCalls.length).toBe(1);
  });

  it('D4: state=FLAKE_SUPPRESSED → no gh issue create, no suppression update, no quarantine-append; ledger source:flake-suppressed; exit 0', async () => {
    setupExecFileSyncRouter([
      ghIssueViewRule({ labels: ['triage', 'FLAKE'] }),
      lsRemoteEmptyRule(),
    ]);
    vi.mocked(classifyRerunOutcomes).mockReturnValue({
      state: 'FLAKE_SUPPRESSED',
      action: 'skip',
      until: '2026-06-15T00:00:00.000Z',
    });
    const exit = await runDispatcher({ issue: ISSUE, transport: 'sdk', forceApi: true });
    expect(exit).toBe(0);
    // No gh issue create
    expect(countCalls((cmd, args) => cmd === 'gh' && args[0] === 'issue' && args[1] === 'create')).toBe(0);
    // No atomicWriteJson (no suppression update)
    expect(atomicWriteJson).not.toHaveBeenCalled();
    // No quarantine-append invocation
    const quarantineCalls = vi.mocked(execFileSync).mock.calls.filter(
      ([cmd, args]) =>
        cmd === 'node' && Array.isArray(args) && args[0] === 'scripts/quarantine-append.mjs',
    );
    expect(quarantineCalls.length).toBe(0);
    // Ledger entry has source:flake-suppressed
    const ledgerEntries = vi.mocked(appendLedgerEntry).mock.calls.map(([, e]) => e);
    const suppressedEntry = ledgerEntries.find((e) => e.source === 'flake-suppressed');
    expect(suppressedEntry).toBeDefined();
    expect(suppressedEntry.flakeState).toBe('FLAKE_SUPPRESSED');
    expect(suppressedEntry.suppressedUntil).toBe('2026-06-15T00:00:00.000Z');
  });

  it('D5: non-FLAKE skip class (LLM_API_ERROR) → Phase 42 ledger escalate:retry preserved byte-identical; ring buffer NOT read; quarantine-append NOT called', async () => {
    setupExecFileSyncRouter([
      ghIssueViewRule({ labels: ['triage', 'LLM_API_ERROR'] }),
      lsRemoteEmptyRule(),
    ]);
    const exit = await runDispatcher({ issue: ISSUE, transport: 'sdk', forceApi: true });
    expect(exit).toBe(0);
    expect(invokeAnthropicSdkWithLedger).not.toHaveBeenCalled();
    // Ring buffer NOT read (non-FLAKE never enters dispatchFlakeState)
    expect(readRingBufferOrInit).not.toHaveBeenCalled();
    // Quarantine-append NOT called
    const quarantineCalls = vi.mocked(execFileSync).mock.calls.filter(
      ([cmd, args]) =>
        cmd === 'node' && Array.isArray(args) && args[0] === 'scripts/quarantine-append.mjs',
    );
    expect(quarantineCalls.length).toBe(0);
    // Phase 42 ledger entry preserved byte-identical
    const ledgerEntries = vi.mocked(appendLedgerEntry).mock.calls.map(([, e]) => e);
    const phase42Entry = ledgerEntries.find((e) => e.escalate === 'retry');
    expect(phase42Entry).toBeDefined();
    expect(phase42Entry.source).toBe('auto-fix-api');
  });

  it('D6: non-FLAKE skip class (PASS) → Phase 42 ledger escalate:close-as-pass preserved byte-identical', async () => {
    setupExecFileSyncRouter([
      ghIssueViewRule({ labels: ['triage', 'PASS'] }),
      lsRemoteEmptyRule(),
    ]);
    const exit = await runDispatcher({ issue: ISSUE, transport: 'sdk', forceApi: true });
    expect(exit).toBe(0);
    expect(readRingBufferOrInit).not.toHaveBeenCalled();
    const ledgerEntries = vi.mocked(appendLedgerEntry).mock.calls.map(([, e]) => e);
    const phase42Entry = ledgerEntries.find((e) => e.escalate === 'close-as-pass');
    expect(phase42Entry).toBeDefined();
    expect(phase42Entry.source).toBe('auto-fix-api');
  });
});

// =======================================================================
// Phase 45-03 I1-I3: idempotency + CWE-94 hygiene
// =======================================================================

describe('Phase 45-03 I1-I3: idempotency + CWE-94 hygiene', () => {
  it('I1: FLAKE_ESCALATION gh issue create includes a second --label arg equal to the 8-hex fingerprint prefix', async () => {
    setupExecFileSyncRouter([
      ghIssueViewRule({ labels: ['triage', 'FLAKE'] }),
      lsRemoteEmptyRule(),
    ]);
    vi.mocked(classifyRerunOutcomes).mockReturnValue({
      state: 'FLAKE_ESCALATION',
      action: 'open-flake-investigation',
      until: '2026-06-30T12:00:00.000Z',
    });
    await runDispatcher({ issue: ISSUE, transport: 'sdk', forceApi: true });
    const issueCreateCall = vi.mocked(execFileSync).mock.calls.find(
      ([cmd, args]) =>
        cmd === 'gh' && Array.isArray(args) &&
        args[0] === 'issue' && args[1] === 'create',
    );
    expect(issueCreateCall).toBeDefined();
    const args = issueCreateCall[1];
    // Count occurrences of '--label' — must be at least 2 (flake-investigation + fp8)
    const labelIndices = args
      .map((a, i) => (a === '--label' ? i : -1))
      .filter((i) => i >= 0);
    expect(labelIndices.length).toBeGreaterThanOrEqual(2);
    const labelValues = labelIndices.map((i) => args[i + 1]);
    expect(labelValues).toContain('flake-investigation');
    expect(labelValues).toContain(FP8);
  });

  it('I2: FLAKE_ESCALATION calls gh label create --force BEFORE the issue create call', async () => {
    setupExecFileSyncRouter([
      ghIssueViewRule({ labels: ['triage', 'FLAKE'] }),
      lsRemoteEmptyRule(),
    ]);
    vi.mocked(classifyRerunOutcomes).mockReturnValue({
      state: 'FLAKE_ESCALATION',
      action: 'open-flake-investigation',
      until: '2026-06-30T12:00:00.000Z',
    });
    await runDispatcher({ issue: ISSUE, transport: 'sdk', forceApi: true });
    const calls = vi.mocked(execFileSync).mock.calls;
    const labelCreateIdx = calls.findIndex(
      ([cmd, args]) =>
        cmd === 'gh' && Array.isArray(args) &&
        args[0] === 'label' && args[1] === 'create' &&
        args.includes('flake-investigation') && args.includes('--force'),
    );
    const issueCreateIdx = calls.findIndex(
      ([cmd, args]) =>
        cmd === 'gh' && Array.isArray(args) &&
        args[0] === 'issue' && args[1] === 'create',
    );
    expect(labelCreateIdx).toBeGreaterThanOrEqual(0);
    expect(issueCreateIdx).toBeGreaterThanOrEqual(0);
    expect(labelCreateIdx).toBeLessThan(issueCreateIdx);
  });

  it('I3: every execFileSync invocation from the new code uses an arg ARRAY (CWE-94)', async () => {
    setupExecFileSyncRouter([
      ghIssueViewRule({ labels: ['triage', 'FLAKE'] }),
      lsRemoteEmptyRule(),
    ]);
    vi.mocked(classifyRerunOutcomes).mockReturnValue({
      state: 'FLAKE_ESCALATION',
      action: 'open-flake-investigation',
      until: '2026-06-30T12:00:00.000Z',
    });
    await runDispatcher({ issue: ISSUE, transport: 'sdk', forceApi: true });
    // Every execFileSync call must have an array as the second argument.
    // None may have a single shell-string argument.
    for (const [cmd, args] of vi.mocked(execFileSync).mock.calls) {
      expect(typeof cmd).toBe('string');
      // Args must always be an array — never a single string concatenated with the command.
      expect(Array.isArray(args)).toBe(true);
    }
    // Specifically: the quarantine-append invocation must pass caseId as a
    // discrete array element, never concatenated into a shell string.
    const quarantineCall = vi.mocked(execFileSync).mock.calls.find(
      ([cmd, args]) =>
        cmd === 'node' && Array.isArray(args) && args[0] === 'scripts/quarantine-append.mjs',
    );
    expect(quarantineCall).toBeDefined();
    // The caseId is its own positional after --case
    const caseIdx = quarantineCall[1].indexOf('--case');
    expect(caseIdx).toBeGreaterThan(0);
    expect(quarantineCall[1][caseIdx + 1]).toBe('US11427642-spec-short-1');
  });
});

// =======================================================================
// Phase 46 — subscription transport routing + --push
// =======================================================================

describe('Phase 46 — subscription transport routing + --push', () => {
  it('46.1: transport=subscription routes to invokeClaudePWithLedger (NOT SDK); passes phase=46-fix-issue + source=fix-issue-cli', async () => {
    setupExecFileSyncRouter([
      ghIssueViewRule(),
      lsRemoteEmptyRule(),
      applyCheckOkRule(),
      applyOkRule(),
      checkoutOkRule(),
      commitOkRule(),
    ]);
    vi.mocked(invokeClaudePWithLedger).mockResolvedValue({
      ok: true,
      llmText: makeFencedDiff('src/foo.js'),
      modelId: 'claude-sonnet-4-6',
      costUsd: 0,
      rawJson: {},
    });
    const exit = await runDispatcher({ issue: ISSUE, transport: 'subscription' });
    expect(exit).toBe(0);
    expect(invokeClaudePWithLedger).toHaveBeenCalledTimes(1);
    expect(invokeAnthropicSdkWithLedger).not.toHaveBeenCalled();
    const callArgs = vi.mocked(invokeClaudePWithLedger).mock.calls[0][0];
    expect(typeof callArgs.systemPrompt).toBe('string');
    expect(callArgs.systemPrompt.length).toBeGreaterThan(0);
    expect(typeof callArgs.userPrompt).toBe('string');
    expect(callArgs.phase).toBe('46-fix-issue');
    expect(callArgs.source).toBe('fix-issue-cli');
    // Subscription wrapper takes systemPrompt (string), NOT systemBlocks
    expect(callArgs.systemBlocks).toBeUndefined();
  });

  it('46.2: transport=sdk invokes invokeAnthropicSdkWithLedger byte-identically to Phase 42 (regression guard)', async () => {
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
    expect(invokeClaudePWithLedger).not.toHaveBeenCalled();
    const callArgs = vi.mocked(invokeAnthropicSdkWithLedger).mock.calls[0][0];
    // Pitfall 6: systemBlocks array form with cache_control preserved
    expect(Array.isArray(callArgs.systemBlocks)).toBe(true);
    expect(callArgs.systemBlocks[0].cache_control).toEqual({ type: 'ephemeral', ttl: '1h' });
    expect(callArgs.model).toBe('claude-sonnet-4-6');
    expect(callArgs.phase).toBe('42-auto-fix');
    expect(callArgs.issueId).toBe(`issue-${ISSUE}`);
    expect(callArgs.forceApi).toBe(true);
  });

  it('46.3: transport=subscription, push=false, noPush=false → NO `git push`; stdout hint with "--push"', async () => {
    setupExecFileSyncRouter([
      ghIssueViewRule(),
      lsRemoteEmptyRule(),
      applyCheckOkRule(),
      applyOkRule(),
      checkoutOkRule(),
      commitOkRule(),
    ]);
    vi.mocked(invokeClaudePWithLedger).mockResolvedValue({
      ok: true,
      llmText: makeFencedDiff('src/foo.js'),
      modelId: 'claude-sonnet-4-6',
      costUsd: 0,
      rawJson: {},
    });
    const stdoutChunks = [];
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk) => { stdoutChunks.push(String(chunk)); return true; });
    let exit;
    try {
      exit = await runDispatcher({ issue: ISSUE, transport: 'subscription' });
    } finally {
      process.stdout.write = origWrite;
    }
    expect(exit).toBe(0);
    expect(countCalls((cmd, args) => cmd === 'git' && args[0] === 'push')).toBe(0);
    expect(stdoutChunks.join('')).toMatch(/--push/);
  });

  it('46.4: transport=subscription, push=true → DOES `git push -u origin <branch>`', async () => {
    setupExecFileSyncRouter([
      ghIssueViewRule(),
      lsRemoteEmptyRule(),
      applyCheckOkRule(),
      applyOkRule(),
      checkoutOkRule(),
      commitOkRule(),
      pushOkRule(),
    ]);
    vi.mocked(invokeClaudePWithLedger).mockResolvedValue({
      ok: true,
      llmText: makeFencedDiff('src/foo.js'),
      modelId: 'claude-sonnet-4-6',
      costUsd: 0,
      rawJson: {},
    });
    const exit = await runDispatcher({ issue: ISSUE, transport: 'subscription', push: true });
    expect(exit).toBe(0);
    const pushCalls = vi.mocked(execFileSync).mock.calls.filter(
      ([cmd, args]) => cmd === 'git' && args[0] === 'push',
    );
    expect(pushCalls.length).toBe(1);
    expect(pushCalls[0][1]).toEqual(['push', '-u', 'origin', BRANCH]);
  });

  it('46.5: transport=subscription, push=true, noPush=true → NO push (--no-push wins)', async () => {
    setupExecFileSyncRouter([
      ghIssueViewRule(),
      lsRemoteEmptyRule(),
      applyCheckOkRule(),
      applyOkRule(),
      checkoutOkRule(),
      commitOkRule(),
    ]);
    vi.mocked(invokeClaudePWithLedger).mockResolvedValue({
      ok: true,
      llmText: makeFencedDiff('src/foo.js'),
      modelId: 'claude-sonnet-4-6',
      costUsd: 0,
      rawJson: {},
    });
    const exit = await runDispatcher({
      issue: ISSUE,
      transport: 'subscription',
      push: true,
      noPush: true,
    });
    expect(exit).toBe(0);
    expect(countCalls((cmd, args) => cmd === 'git' && args[0] === 'push')).toBe(0);
  });

  it('46.6: transport=sdk, push=true, noPush=true → NO push (--no-push wins under sdk too)', async () => {
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
    const exit = await runDispatcher({
      issue: ISSUE,
      transport: 'sdk',
      forceApi: true,
      push: true,
      noPush: true,
    });
    expect(exit).toBe(0);
    expect(countCalls((cmd, args) => cmd === 'git' && args[0] === 'push')).toBe(0);
  });

  it('46.7: transport=sdk, push=false, noPush=false → DOES push (Phase 42 default — regression guard)', async () => {
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
    expect(countCalls((cmd, args) => cmd === 'git' && args[0] === 'push')).toBeGreaterThanOrEqual(1);
  });

  it('46.8: unrecognized --transport returns exit 2 with allow-list in stderr', async () => {
    const stderrChunks = [];
    const origWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk) => { stderrChunks.push(String(chunk)); return true; });
    let exit;
    try {
      exit = await runDispatcher({ issue: ISSUE, transport: 'banana' });
    } finally {
      process.stderr.write = origWrite;
    }
    expect(exit).toBe(2);
    expect(execFileSync).not.toHaveBeenCalled();
    expect(invokeAnthropicSdkWithLedger).not.toHaveBeenCalled();
    expect(invokeClaudePWithLedger).not.toHaveBeenCalled();
    const stderr = stderrChunks.join('');
    expect(stderr).toMatch(/unrecognized .*--transport.*'banana'/);
    expect(stderr).toMatch(/expected one of: sdk, subscription/);
  });

  it('46.9: invokeClaudePWithLedger ledger entry carries transport: "subscription" (driver patch verification)', async () => {
    // This test exercises the one-line driver patch indirectly by inspecting
    // a fresh dynamic import of the real llm-driver.js — vi.mock at the top of
    // this file replaces the named import, but we need to read the *real*
    // appendLedgerEntry call site, so we use a sandboxed setup: mock
    // invokeClaudeP at the module level, then call invokeClaudePWithLedger
    // and inspect the ledger writer. Because vi.mock replaces the driver
    // module in this file's scope, we assert the patch at the source-text
    // level instead: read tests/e2e/lib/llm-driver.js and assert the
    // appendLedgerEntry call inside invokeClaudePWithLedger includes
    // `transport: 'subscription'`. This is a static guard — the runtime
    // assertion lives in the integration-test surface (Phase 47 HUMAN-UAT).
    const fs = await import('node:fs');
    const path = await import('node:path');
    const url = await import('node:url');
    const __dirname46 = path.dirname(url.fileURLToPath(import.meta.url));
    const driverPath = path.resolve(__dirname46, '..', 'e2e', 'lib', 'llm-driver.js');
    const driverSrc = fs.readFileSync(driverPath, 'utf8');
    // Locate the invokeClaudePWithLedger function body
    const fnIdx = driverSrc.indexOf('export async function invokeClaudePWithLedger');
    expect(fnIdx).toBeGreaterThan(-1);
    // Slice from function start until next top-level export (defensive bound)
    const sliceEnd = driverSrc.indexOf('\nexport ', fnIdx + 1);
    const fnBody = driverSrc.slice(fnIdx, sliceEnd > -1 ? sliceEnd : undefined);
    // The appendLedgerEntry call inside this body must include
    // transport: 'subscription'
    const appendIdx = fnBody.indexOf('appendLedgerEntry(LEDGER_PATH');
    expect(appendIdx).toBeGreaterThan(-1);
    // Look at the next ~400 chars after the appendLedgerEntry start
    const appendBlock = fnBody.slice(appendIdx, appendIdx + 400);
    expect(appendBlock).toMatch(/transport:\s*['"]subscription['"]/);
    // And the CI guard at the top of the function is preserved
    expect(fnBody).toContain("process.env.CI === 'true'");
    expect(fnBody).toContain('subscription-local invariant (CI detected)');
  });
});

// =======================================================================
// Phase 56 LEDGER-04: errorClass wired into ledger entries
// =======================================================================
//
// Asserts that runDispatcher() in mocked mode emits a ledger entry whose
// errorClass field equals the issue's ERROR_CLASS label. Exercises the
// Step 12 (diff-guard violation) call site because that path
// has the fewest mock prerequisites: just feed back a fenced diff that
// touches a forbidden path and the dispatcher writes the violation entry
// and exits with code 1.
//
// Why CI=true is set inside the test (per RESEARCH §4 + Wave 0 W0a):
//   safeAppendLedger (auto-fix.mjs LEDGER-02 wrapper) reads process.env.CI
//   directly. The wrapper is defined INSIDE auto-fix.mjs (not in the
//   mocked llm-ledger.js module), so the vi.mock factory does NOT replace
//   it — the wrapper's guard executes on every call site. Without
//   process.env.CI = 'true', the wrapper throws and the test fails with
//   "safeAppendLedger refused" instead of an errorClass assertion miss.
//   The try/finally cleanup is hermetic because vitest.config.js sets
//   fileParallelism:false (Wave 0 §A1 verified that
//   tests/setup/chrome-stub.js does not touch process.env.CI).
//
// Why we do NOT add safeAppendLedger to the vi.mock factory at lines
// 62-67 (Pitfall A from RESEARCH § Common Pitfalls): adding it as
// vi.fn() would silently bypass the guard in tests, hiding any future
// regression that breaks the leak-prevention contract. The
// un-mocked-wrapper / mocked-appendLedgerEntry split is the point.
describe('LEDGER-04: errorClass wired into ledger entries (Phase 56)', () => {
  it('runDispatcher mocked-mode emits a ledger entry carrying errorClass="WRONG_CITATION"', async () => {
    setupExecFileSyncRouter([
      ghIssueViewRule({ labels: ['triage', 'WRONG_CITATION'] }),
      lsRemoteEmptyRule(),
      ghIssueCommentOkRule(),
    ]);
    vi.mocked(invokeAnthropicSdkWithLedger).mockResolvedValue({
      ok: true,
      llmText: makeFencedDiff('tests/test-cases.js'), // FORBIDDEN path triggers diff-guard at the Step 12 call site
      modelId: 'claude-sonnet-4-6',
      costUsd: 0.05,
      rawJson: {},
    });
    try {
      process.env.CI = 'true';
      const exit = await runDispatcher({ issue: ISSUE, transport: 'sdk', forceApi: true });
      expect(exit).toBe(1); // diff-guard violation → exit 1
      const entries = vi.mocked(appendLedgerEntry).mock.calls.map(([, e]) => e);
      expect(entries.length).toBeGreaterThan(0);
      expect(entries.some((e) => e.errorClass === 'WRONG_CITATION')).toBe(true);
    } finally {
      delete process.env.CI;
    }
  });
});

// tests/unit/warning-01-transport-tag.test.js
//
// Phase 47 CLEANUP (audit-milestone integration check, 2026-06-02) — pin the
// WARNING-01 fix: scripts/auto-fix.mjs auxiliary ledger entries MUST carry
// the RUNTIME --transport value, not a hardcoded constant.
//
// Why this test exists (forensic-only correctness):
//   Cost-bearing entries (the cost_usd > 0 row written by
//   invokeClaudePWithLedger / invokeAnthropicSdkWithLedger) were always
//   tagged correctly — invokeClaudePWithLedger self-tags transport:
//   'subscription' at tests/e2e/lib/llm-driver.js:428, and the SDK wrapper
//   self-tags transport: 'sdk'. The bug surfaced by the audit-milestone
//   integration check was that scripts/auto-fix.mjs's SEVEN AUXILIARY
//   appendLedgerEntry() call sites (diff-guard violations, malformed-diff,
//   idempotency-hits, apply-check failures, flake-suppressed,
//   flake-dispatched) hardcoded `transport: TRANSPORT` to the module
//   constant 'sdk' regardless of the --transport CLI flag.
//
//   The mis-tag was forensic-only — no production behavior changed — but
//   the dashboard subscription-mode filtering (Phase 46-02 ledger v2
//   dashboard) under-counted auxiliary entries from local
//   `npm run fix-issue --transport subscription` runs.
//
// Coverage (5 auxiliary entry sites + 2 dispatchFlakeState sites = 7 total;
// this test covers the 3 most-frequently-tripped sites end-to-end via
// runDispatcher and the 1 hot site via direct dispatchFlakeState export):
//
//   Site A — diff-guard violation entry (runDispatcher line ~692)
//   Site B — malformed-diff entry      (runDispatcher line ~670)
//   Site C — idempotency-hit entry     (runDispatcher line ~553)
//   Site D — flake-dispatched summary  (dispatchFlakeState line ~378)
//
// Pattern: mirrors tests/unit/auto-fix.test.js setup (hoisted vi.mock'd
// dependencies + execFileSync router + invokeClaudePWithLedger stub) so the
// runtime --transport flag flows through every step without touching real
// gh / git / fs / Anthropic API.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// -----------------------------------------------------------------------
// Mocks — hoisted by Vitest BEFORE the auto-fix.mjs import below resolves.
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

vi.mock('../e2e/lib/triage-classifier.js', () => ({
  classifyRerunOutcomes: vi.fn(() => ({ state: 'FLAKE', action: 're-quarantine' })),
  readRingBufferOrInit: vi.fn(() => ({ version: 1, cases: {} })),
  readSuppressionsOrInit: vi.fn(() => ({ version: 1, suppressions: {} })),
  atomicWriteJson: vi.fn(),
  buildFlakeInvestigationBody: vi.fn(() => '## Flake investigation body\n'),
  FLAKE_SUPPRESSION_DAYS: 30,
}));

// -----------------------------------------------------------------------
// Imports AFTER vi.mock so the dispatcher receives mocked deps.
// -----------------------------------------------------------------------

import { execFileSync } from 'node:child_process';
import {
  invokeAnthropicSdkWithLedger,
  invokeClaudePWithLedger,
} from '../e2e/lib/llm-driver.js';
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

import { runDispatcher, dispatchFlakeState } from '../../scripts/auto-fix.mjs';

// -----------------------------------------------------------------------
// Test helpers (deduped subset of tests/unit/auto-fix.test.js helpers)
// -----------------------------------------------------------------------

const FP = 'aabbccdd1122';
const ISSUE = 7;

function ghIssueViewJson({
  labels = ['triage', 'WRONG_CITATION'],
  body = `<!-- fp: ${FP} -->\ncase-id: TEST-warning-01\nfingerprint: ${FP}\n`,
} = {}) {
  return JSON.stringify({
    body,
    labels: labels.map((name) => ({ name })),
    title: '[e2e-nightly] WARNING-01 transport-tag test',
    number: ISSUE,
    assignees: [],
  });
}

function makeFencedDiff(filePath = 'src/foo.js') {
  return [
    'I will fix this.',
    '===DIFF_START===',
    `diff --git a/${filePath} b/${filePath}`,
    `--- a/${filePath}`,
    `+++ b/${filePath}`,
    '@@ -1,1 +1,1 @@',
    '-old',
    '+new',
    '===DIFF_END===',
    '',
  ].join('\n');
}

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
    return '';
  });
}

const ghIssueViewRule = () => ({
  match: (cmd, args) => cmd === 'gh' && args[0] === 'issue' && args[1] === 'view',
  respond: ghIssueViewJson(),
});

const lsRemoteEmptyRule = () => ({
  match: (cmd, args) => cmd === 'git' && args[0] === 'ls-remote',
  respond: '',
});

const lsRemoteHitRule = () => ({
  match: (cmd, args) => cmd === 'git' && args[0] === 'ls-remote',
  respond: `abc123\trefs/heads/auto-fix/${ISSUE}-${FP.slice(0, 8)}\n`,
});

const ghIssueCommentOkRule = () => ({
  match: (cmd, args) => cmd === 'gh' && args[0] === 'issue' && args[1] === 'comment',
  respond: '',
});

beforeEach(() => {
  vi.mocked(execFileSync).mockReset();
  vi.mocked(invokeAnthropicSdkWithLedger).mockReset();
  vi.mocked(invokeClaudePWithLedger).mockReset();
  vi.mocked(readLedger).mockReset().mockReturnValue({ version: 1, months: {} });
  vi.mocked(appendLedgerEntry).mockReset();
  vi.mocked(countFixAttempts).mockReset().mockReturnValue(0);
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
// WARNING-01: auxiliary ledger entries honor runtime --transport
// =======================================================================

describe('WARNING-01: scripts/auto-fix.mjs auxiliary ledger entries carry runtime --transport tag', () => {

  // ─── Site A — diff-guard violation entry ──────────────────────────────
  describe('Site A — diff-guard violation entry', () => {
    it('subscription transport → diff-guard violation ledger row has transport:subscription', async () => {
      setupExecFileSyncRouter([
        ghIssueViewRule(),
        lsRemoteEmptyRule(),
        ghIssueCommentOkRule(),
      ]);
      // invokeClaudePWithLedger (subscription transport) returns a diff that
      // touches a forbidden path. The checkDiffGuard helper is REAL (not
      // mocked) so it actually rejects the path; runDispatcher then writes
      // the auxiliary diff-guard-violation ledger entry.
      vi.mocked(invokeClaudePWithLedger).mockResolvedValue({
        ok: true,
        llmText: makeFencedDiff('tests/test-cases.js'),
        modelId: 'claude-sonnet-4-6',
        costUsd: 0,
        rawJson: {},
      });
      const exit = await runDispatcher({ issue: ISSUE, transport: 'subscription' });
      expect(exit).toBe(1);
      const ledgerCalls = vi.mocked(appendLedgerEntry).mock.calls;
      const violationEntry = ledgerCalls
        .map(([, e]) => e)
        .find((e) => typeof e.errorReason === 'string' && e.errorReason.startsWith('diff-guard-violation'));
      expect(violationEntry).toBeDefined();
      // The load-bearing assertion: pre-fix, this would be 'sdk' (the module
      // constant). Post-fix it MUST reflect the runtime --transport flag.
      expect(violationEntry.transport).toBe('subscription');
    });

    it('sdk transport → diff-guard violation ledger row has transport:sdk (back-compat)', async () => {
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
      const ledgerCalls = vi.mocked(appendLedgerEntry).mock.calls;
      const violationEntry = ledgerCalls
        .map(([, e]) => e)
        .find((e) => typeof e.errorReason === 'string' && e.errorReason.startsWith('diff-guard-violation'));
      expect(violationEntry).toBeDefined();
      expect(violationEntry.transport).toBe('sdk');
    });
  });

  // ─── Site B — malformed-diff entry ────────────────────────────────────
  describe('Site B — malformed-diff entry', () => {
    it('subscription transport → malformed-diff ledger row has transport:subscription', async () => {
      // Phase 67 PITER-02: malformed-diff:* is an iter retry trigger — the
      // wrapper retries up to ITER_MAX_ROUNDS = 2 times then writes a final
      // prompt-iter-budget-cap row and gracefully abstains (exit 0). The
      // WARNING-01 contract (transport:subscription on the auxiliary entry) is
      // still asserted on the round-0 malformed-diff row; only the terminal
      // exit code shifted from 1 to 0.
      setupExecFileSyncRouter([
        ghIssueViewRule(),
        lsRemoteEmptyRule(),
      ]);
      vi.mocked(invokeClaudePWithLedger).mockResolvedValue({
        ok: true,
        llmText: 'No fences here at all, just plain prose.',
        modelId: 'claude-sonnet-4-6',
        costUsd: 0,
        rawJson: {},
      });
      const exit = await runDispatcher({ issue: ISSUE, transport: 'subscription' });
      expect(exit).toBe(0);   // Phase 67 — graceful abstention after iter budget exhausted
      const ledgerCalls = vi.mocked(appendLedgerEntry).mock.calls;
      const malformedEntry = ledgerCalls
        .map(([, e]) => e)
        .find((e) => typeof e.errorReason === 'string' && e.errorReason.startsWith('malformed-diff'));
      expect(malformedEntry).toBeDefined();
      expect(malformedEntry.transport).toBe('subscription');
    });
  });

  // ─── Site C — idempotency-hit entry ───────────────────────────────────
  describe('Site C — idempotency-hit entry (branch already exists)', () => {
    it('subscription transport → branchExisted ledger row has transport:subscription', async () => {
      setupExecFileSyncRouter([
        ghIssueViewRule(),
        lsRemoteHitRule(),       // branch already on origin → idempotent short-circuit
        ghIssueCommentOkRule(),
      ]);
      // No LLM call expected — idempotency short-circuit returns before
      // Step 7 (buildFixPrompt).
      const exit = await runDispatcher({ issue: ISSUE, transport: 'subscription' });
      expect(exit).toBe(0);
      expect(vi.mocked(invokeClaudePWithLedger)).not.toHaveBeenCalled();
      expect(vi.mocked(invokeAnthropicSdkWithLedger)).not.toHaveBeenCalled();
      const ledgerCalls = vi.mocked(appendLedgerEntry).mock.calls;
      const idempotencyEntry = ledgerCalls
        .map(([, e]) => e)
        .find((e) => e.branchExisted === true);
      expect(idempotencyEntry).toBeDefined();
      expect(idempotencyEntry.transport).toBe('subscription');
    });
  });

  // ─── Site D — flake-dispatched summary (dispatchFlakeState) ───────────
  describe('Site D — dispatchFlakeState ledger summary entry', () => {
    it('subscription transport → flake-dispatched ledger row has transport:subscription', async () => {
      // dispatchFlakeState is exported; call it directly with the runtime
      // transport opt to confirm the new parameter threads through to both
      // the FLAKE_SUPPRESSED early-return AND the flake-dispatched summary.
      setupExecFileSyncRouter([
        // gh label create + gh issue create (idempotent; swallow output)
        { match: (cmd, args) => cmd === 'gh' && args[0] === 'label', respond: '' },
        { match: (cmd, args) => cmd === 'gh' && args[0] === 'issue', respond: '' },
        // node scripts/quarantine-append.mjs (called for FLAKE state)
        { match: (cmd, args) => cmd === 'node', respond: '' },
      ]);
      vi.mocked(classifyRerunOutcomes).mockReturnValue({
        state: 'FLAKE',
        action: 're-quarantine',
      });
      const exit = await dispatchFlakeState({
        caseId: 'TEST-warning-01',
        fingerprint: FP,
        issueNumber: ISSUE,
        transport: 'subscription',
      });
      expect(exit).toBe(0);
      const ledgerCalls = vi.mocked(appendLedgerEntry).mock.calls;
      const flakeEntry = ledgerCalls
        .map(([, e]) => e)
        .find((e) => e.source === 'flake-dispatched');
      expect(flakeEntry).toBeDefined();
      expect(flakeEntry.transport).toBe('subscription');
    });

    it('subscription transport → FLAKE_SUPPRESSED ledger row has transport:subscription', async () => {
      setupExecFileSyncRouter([]);   // no exec calls expected on suppressed path
      vi.mocked(classifyRerunOutcomes).mockReturnValue({
        state: 'FLAKE_SUPPRESSED',
        action: 'skip',
        until: '2026-07-02T00:00:00.000Z',
      });
      const exit = await dispatchFlakeState({
        caseId: 'TEST-warning-01',
        fingerprint: FP,
        issueNumber: ISSUE,
        transport: 'subscription',
      });
      expect(exit).toBe(0);
      const ledgerCalls = vi.mocked(appendLedgerEntry).mock.calls;
      const suppressedEntry = ledgerCalls
        .map(([, e]) => e)
        .find((e) => e.source === 'flake-suppressed');
      expect(suppressedEntry).toBeDefined();
      expect(suppressedEntry.transport).toBe('subscription');
    });

    it('dispatchFlakeState without explicit transport defaults to sdk (back-compat)', async () => {
      setupExecFileSyncRouter([
        { match: (cmd, args) => cmd === 'gh' && args[0] === 'label', respond: '' },
        { match: (cmd, args) => cmd === 'gh' && args[0] === 'issue', respond: '' },
        { match: (cmd, args) => cmd === 'node', respond: '' },
      ]);
      vi.mocked(classifyRerunOutcomes).mockReturnValue({
        state: 'FLAKE',
        action: 're-quarantine',
      });
      const exit = await dispatchFlakeState({
        caseId: 'TEST-warning-01',
        fingerprint: FP,
        issueNumber: ISSUE,
        // NO transport opt — default kicks in
      });
      expect(exit).toBe(0);
      const ledgerCalls = vi.mocked(appendLedgerEntry).mock.calls;
      const flakeEntry = ledgerCalls
        .map(([, e]) => e)
        .find((e) => e.source === 'flake-dispatched');
      expect(flakeEntry).toBeDefined();
      // DEFAULT_TRANSPORT is 'sdk' — preserves Phase 42 behavior for callers
      // that have not been updated to thread the runtime transport.
      expect(flakeEntry.transport).toBe('sdk');
    });
  });
});

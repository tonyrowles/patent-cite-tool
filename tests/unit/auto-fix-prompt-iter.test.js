// tests/unit/auto-fix-prompt-iter.test.js
//
// Phase 67 Plan 01 — prompt-iter loop (Shape A — capture-and-surface, in-process).
//
// Requirements covered:
//   PITER-02 — runDispatcher Step 10 in-process iter wrapper (apply-check-failed
//              + malformed-diff:* triggers; success break; cap exhaustion graceful
//              return 0)
//   PITER-03 — additive `iter_round` ledger field; new exported constants
//              ITER_MAX_ROUNDS = 2 + PROMPT_ITER_COST_CAP_USD = 0.50
//   PITER-04 — trigger gating: iter retry ONLY on apply-check-failed +
//              malformed-diff:*; sdk_error + diff-guard-violation + ciGate +
//              capBlocked + contract-error all FAST-FAIL with exactly 1 SDK call
//
// PITER-01 (rewriteHint param) is unit-tested directly in
// tests/unit/fix-prompt-builder.test.js (Phase 67 PITER-01 describe block);
// the cross-test here is Test H below — verifying round-0 dispatch passes the
// byte-identical scaffold systemPrompt through to the SDK.
// PITER-05 (FORBIDDEN_PATHS extension) is unit-tested in
// tests/unit/check-diff-guard.test.js (F15 + F16 + anchor strictness).
//
// Locked design: .planning/phases/67-prompt-iter-loop-shape-a-capture-and-surface-in-process/67-CONTEXT.md
// Research:      .planning/phases/67-prompt-iter-loop-shape-a-capture-and-surface-in-process/67-RESEARCH.md
//   (see Pattern 2 + Example C + Example D for the wrapper + budget-cap shape).
//
// Mock surface: reused verbatim from tests/unit/auto-fix.test.js:53-105 so the
// dispatcher's import graph resolves to the same vi.mocked() handles. The
// safeAppendLedger CI guard is satisfied by beforeEach setting process.env.CI.

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

vi.mock('../e2e/lib/triage-classifier.js', () => ({
  classifyRerunOutcomes: vi.fn(() => ({ state: 'FLAKE', action: 're-quarantine' })),
  readRingBufferOrInit: vi.fn(() => ({ version: 1, cases: {} })),
  readSuppressionsOrInit: vi.fn(() => ({ version: 1, suppressions: {} })),
  atomicWriteJson: vi.fn(),
  buildFlakeInvestigationBody: vi.fn(() => '## Flake investigation body\n'),
  FLAKE_SUPPRESSION_DAYS: 30,
}));

// scripts/check-diff-guard.mjs — keep REAL so the regex bank exercises end-to-end
// (Phase 67 PITER-05 anchor matchers ship in the same commit; Test F relies on
// the real FORBIDDEN_PATHS rejecting the fix-prompt-builder.js path).

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

import {
  runDispatcher,
  ITER_MAX_ROUNDS,
  PROMPT_ITER_COST_CAP_USD,
} from '../../scripts/auto-fix.mjs';
import { PROMPT_SCAFFOLDS } from '../e2e/lib/fix-prompt-builder.js';

// -----------------------------------------------------------------------
// Test helpers — mirror the structure in tests/unit/auto-fix.test.js
// -----------------------------------------------------------------------

const FP = '139f821b3bb1';
const ISSUE = 3;

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

const ghIssueViewRule = (jsonOverrides) => ({
  match: (cmd, args) => cmd === 'gh' && args[0] === 'issue' && args[1] === 'view',
  respond: ghIssueViewJson(jsonOverrides),
});
const lsRemoteEmptyRule = () => ({
  match: (cmd, args) => cmd === 'git' && args[0] === 'ls-remote',
  respond: '',
});
const applyCheckFailRule = (stderr = 'error: patch failed: hunk at line 5\n') => ({
  match: (cmd, args) => cmd === 'git' && args[0] === 'apply' && args.includes('--check'),
  respond: { isError: true, status: 1, stderr },
});
const ghIssueCommentOkRule = () => ({
  match: (cmd, args) => cmd === 'gh' && args[0] === 'issue' && args[1] === 'comment',
  respond: '',
});

// -----------------------------------------------------------------------
// File-level CI env guard — safeAppendLedger requires CI=true
// (same pattern as tests/unit/auto-fix.test.js:250-258).
// -----------------------------------------------------------------------
let __savedCI;
beforeAll(() => {
  __savedCI = process.env.CI;
  process.env.CI = 'true';
});
afterAll(() => {
  if (__savedCI === undefined) delete process.env.CI;
  else process.env.CI = __savedCI;
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
// Test A — constants exported (PITER-03)
// =======================================================================

describe('Phase 67 PITER-03: exported constants', () => {
  it('A: ITER_MAX_ROUNDS === 2 and PROMPT_ITER_COST_CAP_USD === 0.50', () => {
    expect(ITER_MAX_ROUNDS).toBe(2);
    expect(PROMPT_ITER_COST_CAP_USD).toBe(0.50);
  });
});

// =======================================================================
// Tests B / C — iter retry on apply-check-failed + malformed-diff (PITER-02)
// =======================================================================

describe('Phase 67 PITER-02: iter retry on apply-check-failed', () => {
  it('B: apply-check fails round 0 → SDK invoked round 1 with rewriteHint; iter_round 0+1 ledger entries', async () => {
    setupExecFileSyncRouter([
      ghIssueViewRule(),
      lsRemoteEmptyRule(),
      applyCheckFailRule('simulated apply-check stderr'),
    ]);
    // Round 0 SDK returns a fenced diff that PASSES parse but FAILS git apply --check.
    // Round 1 also returns one, and again fails. Round 2 returns and also fails.
    vi.mocked(invokeAnthropicSdkWithLedger).mockResolvedValue({
      ok: true,
      llmText: makeFencedDiff('src/foo.js'),
      modelId: 'claude-sonnet-4-6',
      costUsd: 0.05,   // low enough to allow all 3 rounds (round 0 + 1 + 2 = 0.15 < 0.50)
      rawJson: {},
    });
    const exit = await runDispatcher({ issue: ISSUE, transport: 'sdk', forceApi: true });

    // Exit 0 — graceful abstention after exhausting ITER_MAX_ROUNDS retries
    expect(exit).toBe(0);

    // SDK invoked round 0 + round 1 + round 2 = 3 calls (ITER_MAX_ROUNDS = 2 retries after round 0)
    expect(invokeAnthropicSdkWithLedger.mock.calls.length).toBe(ITER_MAX_ROUNDS + 1);

    // Ledger entries with iter_round 0, 1, 2 on apply-check-failed + a budget-cap row
    const ledgerEntries = vi.mocked(appendLedgerEntry).mock.calls.map(([, e]) => e);
    const applyCheckEntries = ledgerEntries.filter((e) => e.errorReason === 'apply-check-failed');
    expect(applyCheckEntries.length).toBe(ITER_MAX_ROUNDS + 1);
    expect(applyCheckEntries.some((e) => e.iter_round === 0)).toBe(true);
    expect(applyCheckEntries.some((e) => e.iter_round === 1)).toBe(true);
    expect(applyCheckEntries.some((e) => e.iter_round === 2)).toBe(true);
    // Final budget-cap row
    expect(ledgerEntries.some((e) => e.errorReason === 'prompt-iter-budget-cap')).toBe(true);

    // Round 1 systemPrompt MUST include the stderr-derived rewriteHint
    const round1Call = vi.mocked(invokeAnthropicSdkWithLedger).mock.calls[1][0];
    const round1Sys = Array.isArray(round1Call.systemBlocks) && round1Call.systemBlocks[0]?.text;
    expect(round1Sys).toContain('<prior_attempt_feedback>');
    expect(round1Sys).toContain('simulated apply-check stderr');
  });
});

describe('Phase 67 PITER-02: iter retry on malformed-diff:*', () => {
  it('C: round 0 malformed-diff → SDK invoked round 1 with parseFencedDiff.reason as rewriteHint', async () => {
    setupExecFileSyncRouter([
      ghIssueViewRule(),
      lsRemoteEmptyRule(),
    ]);
    // Round 0 returns NO fences (triggers parseFencedDiff malformed-diff:no-fences).
    // Round 1 also returns no fences. Round 2 too.
    vi.mocked(invokeAnthropicSdkWithLedger).mockResolvedValue({
      ok: true,
      llmText: 'No fences here at all, just prose.',
      modelId: 'claude-sonnet-4-6',
      costUsd: 0.05,
      rawJson: {},
    });
    const exit = await runDispatcher({ issue: ISSUE, transport: 'sdk', forceApi: true });

    expect(exit).toBe(0);
    expect(invokeAnthropicSdkWithLedger.mock.calls.length).toBe(ITER_MAX_ROUNDS + 1);

    const ledgerEntries = vi.mocked(appendLedgerEntry).mock.calls.map(([, e]) => e);
    const malformedEntries = ledgerEntries.filter((e) =>
      typeof e.errorReason === 'string' && e.errorReason.startsWith('malformed-diff:'),
    );
    expect(malformedEntries.length).toBe(ITER_MAX_ROUNDS + 1);
    expect(malformedEntries.some((e) => e.iter_round === 0)).toBe(true);
    expect(malformedEntries.some((e) => e.iter_round === 1)).toBe(true);

    // Round 1 systemPrompt MUST include the parseFencedDiff.reason as hint
    const round1Call = vi.mocked(invokeAnthropicSdkWithLedger).mock.calls[1][0];
    const round1Sys = Array.isArray(round1Call.systemBlocks) && round1Call.systemBlocks[0]?.text;
    expect(round1Sys).toContain('<prior_attempt_feedback>');
    expect(round1Sys).toContain('no-fences');
  });
});

// =======================================================================
// Test D — T_PROMPT_ITER_BUDGET_01 (PITER-03 canonical cap-enforcement pin)
// =======================================================================

describe('Phase 67 PITER-03: PROMPT_ITER_COST_CAP_USD budget-cap', () => {
  it('T_PROMPT_ITER_BUDGET_01: cumulative cumCost ≥ cap triggers prompt-iter-budget-cap ledger row + exit 0', async () => {
    setupExecFileSyncRouter([
      ghIssueViewRule(),
      lsRemoteEmptyRule(),
      applyCheckFailRule(),
    ]);
    // costUsd 0.25 per call → round 0 cumCost = 0.25, round 1 cumCost = 0.50 (hits cap)
    vi.mocked(invokeAnthropicSdkWithLedger).mockResolvedValue({
      ok: true,
      llmText: makeFencedDiff('src/foo.js'),
      modelId: 'claude-sonnet-4-6',
      costUsd: 0.25,
      rawJson: {},
    });
    const exitCode = await runDispatcher({ issue: ISSUE, transport: 'sdk', forceApi: true });

    expect(exitCode).toBe(0);   // graceful abstention

    const ledgerCalls = vi.mocked(appendLedgerEntry).mock.calls.map(([, e]) => e);

    // Round-0 apply-check-failed row exists
    expect(ledgerCalls.some((e) => e.iter_round === 0 && e.errorReason === 'apply-check-failed')).toBe(true);
    // Budget-cap row exists
    const capRow = ledgerCalls.find((e) => e.errorReason === 'prompt-iter-budget-cap');
    expect(capRow).toBeDefined();

    // Phase 67 WR-01 — budget-cap row records ACTUAL cumulative spend
    // (pre-fix this was hardcoded 0, under-reporting iter-loop cost).
    // costUsd 0.25 per call × 2 calls = 0.50 cumulative.
    expect(capRow.cost_usd).toBeCloseTo(0.50, 5);

    // Phase 67 WR-06 — budget-cap row carries iter_round: null (terminal
    // abstention marker). Pre-fix this was state.round (an integer), which
    // double-counted the terminal round in distinct-iter_round dashboards.
    expect(capRow.iter_round).toBeNull();

    // Phase 67 WR-09 (REVIEW.md) — tighten the SDK call count from `[1..3]`
    // to the EXACT correct value (`2`). Math at costPerCall = 0.25:
    //   Round 0 (call 1): cumCost = 0.25 → check `0.25 >= 0.50`? no  → retry
    //   Round 1 (call 2): cumCost = 0.50 → check `0.50 >= 0.50`? YES → cap
    // Pre-fix `>= 1 && <= 3` accepted off-by-one regressions; `toBe(2)`
    // is the contract.
    expect(vi.mocked(invokeAnthropicSdkWithLedger).mock.calls.length).toBe(2);
  });

  // Phase 67 WR-09 (REVIEW.md) — pin the `>=` vs `>` boundary on cumCost.
  // These two companion fixtures bracket the exact threshold so a future
  // off-by-one in the cap predicate is observable as a test failure.
  it('WR-09 cap-exact-trigger: costPerCall = 0.26 → 2 SDK calls (cumCost 0.52 hits cap on round 1)', async () => {
    setupExecFileSyncRouter([
      ghIssueViewRule(),
      lsRemoteEmptyRule(),
      applyCheckFailRule(),
    ]);
    vi.mocked(invokeAnthropicSdkWithLedger).mockResolvedValue({
      ok: true,
      llmText: makeFencedDiff('src/foo.js'),
      modelId: 'claude-sonnet-4-6',
      costUsd: 0.26,
      rawJson: {},
    });
    const exitCode = await runDispatcher({ issue: ISSUE, transport: 'sdk', forceApi: true });
    expect(exitCode).toBe(0);
    // Round 0 cumCost = 0.26 → 0.26 >= 0.50? no  → retry.
    // Round 1 cumCost = 0.52 → 0.52 >= 0.50? yes → cap. Exactly 2 calls.
    expect(vi.mocked(invokeAnthropicSdkWithLedger).mock.calls.length).toBe(2);
  });

  it('WR-09 cap-under: costPerCall = 0.24 → 3 SDK calls (cumCost 0.72, ITER_MAX_ROUNDS triggers cap)', async () => {
    setupExecFileSyncRouter([
      ghIssueViewRule(),
      lsRemoteEmptyRule(),
      applyCheckFailRule(),
    ]);
    vi.mocked(invokeAnthropicSdkWithLedger).mockResolvedValue({
      ok: true,
      llmText: makeFencedDiff('src/foo.js'),
      modelId: 'claude-sonnet-4-6',
      costUsd: 0.24,
      rawJson: {},
    });
    const exitCode = await runDispatcher({ issue: ISSUE, transport: 'sdk', forceApi: true });
    expect(exitCode).toBe(0);
    // Round 0 cumCost = 0.24 → 0 + 1 > 2? no; 0.24 >= 0.50? no  → retry.
    // Round 1 cumCost = 0.48 → 1 + 1 > 2? no; 0.48 >= 0.50? no  → retry.
    // Round 2 cumCost = 0.72 → 2 + 1 > 2? YES → cap. Exactly 3 calls.
    expect(vi.mocked(invokeAnthropicSdkWithLedger).mock.calls.length).toBe(3);
  });
});

// =======================================================================
// Test E — sdk_error fast-fail (PITER-04)
// =======================================================================

describe('Phase 67 PITER-04: sdk_error fast-fails (no iter retry)', () => {
  it('E: sdk_error returns 1 immediately with exactly 1 SDK invocation', async () => {
    setupExecFileSyncRouter([
      ghIssueViewRule(),
      lsRemoteEmptyRule(),
    ]);
    vi.mocked(invokeAnthropicSdkWithLedger).mockResolvedValue({
      ok: false,
      errorReason: 'sdk_error',
      errorMessage: 'simulated API outage',
    });

    const exitCode = await runDispatcher({ issue: ISSUE, transport: 'sdk', forceApi: true });

    expect(exitCode).toBe(1);
    expect(invokeAnthropicSdkWithLedger).toHaveBeenCalledTimes(1);
  });
});

// =======================================================================
// Test F — diff-guard fast-fail (PITER-04)
// =======================================================================

describe('Phase 67 PITER-04: diff-guard violation fast-fails (no iter retry)', () => {
  it('F: diff touching FORBIDDEN_PATH returns 1 with exactly 1 SDK invocation; ledger row carries iter_round:0', async () => {
    setupExecFileSyncRouter([
      ghIssueViewRule(),
      lsRemoteEmptyRule(),
      ghIssueCommentOkRule(),
    ]);
    // Round-0 SDK returns a fenced diff that touches tests/e2e/lib/fix-prompt-builder.js
    // (a Phase 67 PITER-05 FORBIDDEN_PATH entry).
    vi.mocked(invokeAnthropicSdkWithLedger).mockResolvedValue({
      ok: true,
      llmText: makeFencedDiff('tests/e2e/lib/fix-prompt-builder.js'),
      modelId: 'claude-sonnet-4-6',
      costUsd: 0.05,
      rawJson: {},
    });

    const exitCode = await runDispatcher({ issue: ISSUE, transport: 'sdk', forceApi: true });

    expect(exitCode).toBe(1);
    expect(invokeAnthropicSdkWithLedger).toHaveBeenCalledTimes(1);

    const ledgerCalls = vi.mocked(appendLedgerEntry).mock.calls.map(([, e]) => e);
    const violationEntry = ledgerCalls.find((e) =>
      typeof e.errorReason === 'string' && e.errorReason.startsWith('diff-guard-violation'),
    );
    expect(violationEntry).toBeDefined();
    // The diff-guard ledger row lives INSIDE the iter wrapper so it carries iter_round
    expect(violationEntry.iter_round).toBe(0);
  });
});

// =======================================================================
// Test G — iter_round discipline (Pitfall 7)
// =======================================================================

describe('Phase 67 PITER-03: iter_round field discipline', () => {
  it('G: pre-loop skip-class ledger rows do NOT carry iter_round (Pitfall 7)', async () => {
    // PASS skip-class triggers Step 7 short-circuit BEFORE the iter wrapper.
    // Its ledger entry must NOT have iter_round defined.
    setupExecFileSyncRouter([
      ghIssueViewRule({ labels: ['triage', 'PASS'] }),
      lsRemoteEmptyRule(),
    ]);
    const exit = await runDispatcher({ issue: ISSUE, transport: 'sdk', forceApi: true });
    expect(exit).toBe(0);
    expect(invokeAnthropicSdkWithLedger).not.toHaveBeenCalled();

    const ledgerEntries = vi.mocked(appendLedgerEntry).mock.calls.map(([, e]) => e);
    expect(ledgerEntries.length).toBeGreaterThan(0);
    // EVERY pre-loop entry must lack iter_round (it is undefined, not set to 0)
    for (const entry of ledgerEntries) {
      expect(entry.iter_round).toBeUndefined();
    }
  });
});

// =======================================================================
// Test H — round-0 byte-identity through dispatch (PITER-01 cross-check)
// =======================================================================

describe('Phase 67 PITER-01: round-0 dispatch byte-identity', () => {
  it('H: round 0 SDK call receives systemBlocks[0].text byte-identical to PROMPT_SCAFFOLDS[errorClass]()', async () => {
    setupExecFileSyncRouter([
      ghIssueViewRule({ labels: ['triage', 'WRONG_CITATION'] }),
      lsRemoteEmptyRule(),
      {
        match: (cmd, args) => cmd === 'git' && args[0] === 'apply' && args.includes('--check'),
        respond: '',
      },
      {
        match: (cmd, args) => cmd === 'git' && args[0] === 'apply' && !args.includes('--check'),
        respond: '',
      },
      {
        match: (cmd, args) => cmd === 'git' && args[0] === 'checkout',
        respond: '',
      },
      {
        match: (cmd, args) => cmd === 'git' && args[0] === 'commit',
        respond: '',
      },
      {
        match: (cmd, args) => cmd === 'git' && args[0] === 'push',
        respond: '',
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
    expect(exit).toBe(0);
    expect(invokeAnthropicSdkWithLedger).toHaveBeenCalledTimes(1);

    const round0Call = vi.mocked(invokeAnthropicSdkWithLedger).mock.calls[0][0];
    expect(Array.isArray(round0Call.systemBlocks)).toBe(true);
    expect(round0Call.systemBlocks[0].text).toBe(PROMPT_SCAFFOLDS.WRONG_CITATION());
    // round 0 systemPrompt MUST NOT contain the feedback block
    expect(round0Call.systemBlocks[0].text).not.toContain('<prior_attempt_feedback>');
  });
});

#!/usr/bin/env node
// scripts/e2e-explore.mjs
//
// Phase 31 — LLM exploratory mode driver.
//
// Refuses to run in CI (LLM-07). Checks `which claude` (LLM-01 prerequisite).
// Loads spend ledger and aborts if monthly cap reached (LLM-06). Iterates:
// pick patent via claude -p, validate selection in spec, drive harness,
// verify, classify, append to llm-report.json + ledger.
//
// This file is COMPLETED in Plan 31-02 — Plan 31-01 Task 3 delivers the CI
// guard + claude check + arg parser + iteration scaffold. The
// runOneIteration function throws NOT_YET_IMPLEMENTED until Plan 31-02
// Task 2 wires the harness invocation.
//
// Exit codes:
//   0 — scaffold OK (main completed; iteration loop not yet wired)
//   1 — CI guard fired (LLM-07: exploratory mode is local-only)
//   2 — bad --iterations argument
//   3 — claude CLI not found on PATH
//   4 — monthly spend cap reached (LLM-06 hard block at $100)
//   5 — fatal/unexpected error in main()

import { spawnSync } from 'node:child_process';
import { LEDGER_PATH, readLedger, checkSpendCap } from '../tests/e2e/lib/llm-ledger.js';

// ---- 1. CI guard (LLM-07) ---------------------------------------------
// Defense-in-depth: check BOTH process.env.CI AND process.env.GITHUB_ACTIONS
// per RESEARCH.md threat T-31-2. A CI runner setting only one of these still
// trips the check.
if (process.env.CI || process.env.GITHUB_ACTIONS) {
  process.stderr.write(
    '[e2e-explore] exploratory mode is local-only — refusing to consume LLM credits in CI.\n' +
    '             (CI guard: process.env.CI or process.env.GITHUB_ACTIONS is set.)\n'
  );
  process.exit(1);
}

// ---- 2. Arg parsing (--iterations N, default 5) -----------------------
function parseArgs(argv) {
  let iterations = 5;
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--iterations' && argv[i + 1]) {
      iterations = parseInt(argv[i + 1], 10);
      if (Number.isNaN(iterations) || iterations < 1) {
        process.stderr.write(`[e2e-explore] invalid --iterations value: ${argv[i + 1]}\n`);
        process.exit(2);
      }
      i++;
    } else if (argv[i] === '--help' || argv[i] === '-h') {
      process.stdout.write(
        'Usage: node scripts/e2e-explore.mjs [--iterations N]\n' +
        '\n' +
        '  --iterations N   number of LLM iterations to run (default 5)\n' +
        '  --help, -h       print this help and exit\n' +
        '\n' +
        'LLM exploratory mode — refuses to run when process.env.CI or\n' +
        'process.env.GITHUB_ACTIONS is set. Checks `which claude` before\n' +
        'invoking. Reads tests/e2e/.llm-spend-ledger.json and aborts when\n' +
        'monthly spend >= $100.\n'
      );
      process.exit(0);
    }
  }
  return { iterations };
}
const { iterations } = parseArgs(process.argv);

// ---- 3. claude CLI check ---------------------------------------------
function checkClaudeCli() {
  const r = spawnSync('claude', ['--version'], { encoding: 'utf8' });
  if (r.status !== 0) {
    process.stderr.write(
      '[e2e-explore] `claude` CLI not found on PATH. Install Claude Code first.\n' +
      '             See tests/e2e/README.md § Troubleshooting.\n'
    );
    process.exit(3);
  }
  return (r.stdout || '').trim();
}

// ---- 4. Spend cap pre-check (LLM-06) ---------------------------------
function precheckSpendCap() {
  const ledger = readLedger(LEDGER_PATH);
  const verdict = checkSpendCap(ledger);
  if (verdict.status === 'block') {
    process.stderr.write(`[e2e-explore] ${verdict.message}\n`);
    process.exit(4);
  }
  if (verdict.status === 'warn') {
    process.stderr.write(`[e2e-explore] ${verdict.message}\n`);
  }
  return verdict;
}

// ---- 5. Per-iteration (Plan 31-02 completes this) --------------------
// eslint-disable-next-line no-unused-vars
async function runOneIteration(iterationN, runId) {
  throw new Error('NOT_YET_IMPLEMENTED — Plan 31-02 Task 2 wires the harness here.');
}

// ---- 6. Main ---------------------------------------------------------
async function main() {
  const claudeVer = checkClaudeCli();
  process.stdout.write(`[e2e-explore] claude ${claudeVer}\n`);
  precheckSpendCap();
  // Plan 31-02 Task 1 adds resolveRunId() + iteration loop here.
  process.stdout.write(
    `[e2e-explore] scaffold OK; ${iterations} iterations requested but driver loop ` +
    `not yet wired (Plan 31-02).\n`
  );
  process.exit(0);
}

main().catch(err => {
  process.stderr.write(`[e2e-explore] fatal: ${err.stack || err.message}\n`);
  process.exit(5);
});

// scripts/auto-fix.mjs
//
// Phase 42 Plan 02 — Self-Healing auto-fix CLI dispatcher.
//
// Requirements implemented:
//   AUTOFIX-01 — route ERROR_CLASS labels (WRONG_CITATION = full path;
//                FLAKE/LLM_API_ERROR/PASS = zero-cost ledger short-circuit;
//                missing/multi labels = exit 2).
//   AUTOFIX-03 — diff-guard (checkDiffGuard from scripts/check-diff-guard.mjs)
//                + `git apply --check` BEFORE `git apply`. Single source of
//                truth for the 6 forbidden paths — NEVER re-define inline.
//   AUTOFIX-04 — `git ls-remote --heads origin auto-fix/<n>-<fp8>` idempotency
//                BEFORE the SDK is invoked. Existing branch → ledger entry +
//                gh issue comment + exit 0 (saves cost on label-flap).
//   AUTOFIX-05 — `countFixAttempts(ledger, fingerprint)` ≥ 3 → add
//                `human-review-required` label + exit 3.
//
// Pitfall 6 (cache_control silent drop) consumer:
//   Uses the systemBlocks array-form on invokeAnthropicSdkWithLedger so the
//   WRONG_CITATION SYSTEM block carries cache_control:{type:'ephemeral',
//   ttl:'1h'} and the Anthropic SDK actually honors it (~30% cache-read
//   savings on repeated invocations).
//
// CLI:
//   node scripts/auto-fix.mjs --issue <n> [--transport sdk|subscription=sdk]
//                              [--force-api] [--dry-run] [--push] [--no-push]
//
// Phase 46-01 (AUTOFIX-06): --transport subscription routes to
// invokeClaudePWithLedger; default push semantics are INVERTED for
// subscription (no-push unless --push) so local iteration never accidentally
// touches origin. --no-push always wins. sdk transport behavior is
// byte-identical to Phase 42 (pushes by default).
//
// Exit codes:
//   0 — diff applied + branch pushed; OR --dry-run printed; OR skip-class
//       short-circuit; OR --no-push staged the branch; OR subscription branch
//       staged locally (--push not set); OR idempotent skip (branch already
//       exists on origin).
//   1 — rejected (apply-check fail, diff-guard violation, malformed-diff,
//       sdk_error).
//   2 — argv / contract error (missing --issue; missing fingerprint line;
//       no or multi ERROR_CLASS label).
//   3 — fix_attempts cap reached (≥3 prior matching iterations); the
//       human-review-required label is added in the same exit path.
//
// CWE-94 hygiene: every gh and git invocation uses execFileSync(cmd, [arg, ...])
// with an explicit arg array — NEVER a shell string. Issue-body content is
// passed as a discrete --body arg, never concatenated into a command line.
//
// Test surface: `runDispatcher({issue, transport, forceApi, dryRun, noPush})`
// is the named export unit-tested in tests/unit/auto-fix.test.js. The thin
// CLI shim at the file end (parseArgs + runDispatcher + process.exit) is NOT
// unit-tested; it is exercised end-to-end by Plan 42-03's manual demo.

import { parseArgs } from 'node:util';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildFixPrompt,
  DIFF_FENCE_START,
  DIFF_FENCE_END,
} from '../tests/e2e/lib/fix-prompt-builder.js';
import {
  invokeAnthropicSdkWithLedger,
  invokeClaudePWithLedger,
} from '../tests/e2e/lib/llm-driver.js';
import {
  readLedger,
  appendLedgerEntry,
  countFixAttempts,
  LEDGER_PATH,
} from '../tests/e2e/lib/llm-ledger.js';
import { checkDiffGuard } from './check-diff-guard.mjs';
import { ERROR_CLASSES } from '../tests/e2e/lib/error-codes.js';
// Phase 45-03 — consume the 5-state classifier + ring buffer / suppression
// IO helpers shipped in Plan 45-02. dispatchFlakeState wires Step 7's FLAKE
// branch into the per-fingerprint state machine + flake-investigation issue
// creation pipeline.
import {
  classifyRerunOutcomes,
  readRingBufferOrInit,
  readSuppressionsOrInit,
  atomicWriteJson,
  buildFlakeInvestigationBody,
  FLAKE_SUPPRESSION_DAYS,
} from '../tests/e2e/lib/triage-classifier.js';

// ---------------------------------------------------------------------------
// Phase 56 LEDGER-02 — call-site leak guard for direct ledger writes.
// ---------------------------------------------------------------------------
/**
 * safeAppendLedger — leak-guarded wrapper around appendLedgerEntry for the 7
 * direct ledger-write call sites in this file.
 *
 * Refuses to append to the committed ledger unless the caller is running in
 * CI (process.env.CI === 'true' or GITHUB_ACTIONS === 'true' per CR-02) OR
 * has explicitly opted in via E2E_LEDGER_PATH_OVERRIDE (integration-test
 * escape hatch defined in tests/e2e/lib/llm-ledger.js:74-98 — WR-05 IIFE).
 *
 * IMPORTANT — runtime-opt-in caveat (Phase 56 WR-01, REVIEW.md):
 * E2E_LEDGER_PATH_OVERRIDE is checked here at CALL time, but the actual
 * write target — LEDGER_PATH, imported from tests/e2e/lib/llm-ledger.js —
 * is resolved at MODULE LOAD time by the WR-05 IIFE (llm-ledger.js:74-98).
 * Setting E2E_LEDGER_PATH_OVERRIDE AFTER auto-fix.mjs has already loaded
 * will pass this guard BUT the write still lands on the canonical
 * tests/e2e/.llm-spend-ledger.json (the committed file). To actually
 * redirect the write target, set E2E_LEDGER_PATH_OVERRIDE in the shell
 * env BEFORE the Node process imports auto-fix.mjs (or any transitive
 * import of llm-ledger.js). The tests/unit/auto-fix.test.js suite avoids
 * this trap because it uses vi.mock to stub BOTH appendLedgerEntry AND
 * LEDGER_PATH, so the wrapper's LEDGER_PATH is the mocked '/tmp/...'
 * constant — not the real path resolved by the IIFE. Any future
 * INTEGRATION test (no vi.mock on llm-ledger.js) that imports auto-fix.mjs
 * first and then sets the env var will hit the trap.
 *
 * Why this wrapper exists: the 7 direct appendLedgerEntry call sites in
 * scripts/auto-fix.mjs (pre-Phase-56) bypass the PRE-02 guard inside
 * invokeAnthropicSdkWithLedger (Phase 48). A local `--force-api` run outside
 * CI could therefore pollute the committed ledger. This wrapper closes that
 * leak vector at call-site scope.
 *
 * Why the guard lives HERE (auto-fix.mjs) and NOT inside appendLedgerEntry's
 * body in llm-ledger.js: Pitfall 7 (LOAD-BEARING) — adding the guard to
 * appendLedgerEntry would fail 56+ existing Vitest tests in
 * tests/unit/llm-ledger.test.js that call appendLedgerEntry with a tmp path
 * outside CI. See .planning/research/PITFALLS.md Pitfall 7.
 *
 * Why this wrapper is NOT exported: keeping it module-internal preserves the
 * existing vi.mock('../e2e/lib/llm-ledger.js', ...) factory in
 * tests/unit/auto-fix.test.js. The mocked appendLedgerEntry is called
 * transparently from inside this un-mocked wrapper body, so the wrapper's
 * process.env.CI check executes in tests while the mocked appendLedgerEntry
 * still records calls for assertion. See RESEARCH §2 "Why NOT exported".
 *
 * Defense-in-depth: the WR-05 LEDGER_PATH IIFE (module-load-time) and this
 * call-time wrapper cover NON-OVERLAPPING failure modes; both must coexist.
 *
 * @param {object} entry — passed verbatim to the underlying ledger append (LEDGER_PATH closed over)
 * @throws {Error} when neither process.env.CI nor process.env.E2E_LEDGER_PATH_OVERRIDE is set
 */
function safeAppendLedger(entry) {
  // Phase 56 CR-02 (REVIEW.md): align the CI predicate with the canonical
  // form used by tests/e2e/lib/llm-driver.js:387,518 and the
  // tests/e2e/lib/llm-ledger.js:86 LEDGER_PATH IIFE. A bare !process.env.CI
  // truthy check accepts the strings 'false', '0', 'no', etc. as truthy,
  // so a developer who has `export CI=false` in their shell to opt OUT of
  // CI-tagged behavior elsewhere would PASS this guard and leak entries to
  // the committed ledger. The strict form also recognizes GITHUB_ACTIONS
  // as a CI signal (a CI runner that exports only GITHUB_ACTIONS was
  // previously refused). The trim-and-length check on the override mirrors
  // llm-ledger.js:74-98 so a stray whitespace-only override does not
  // accidentally opt in.
  const inCi =
    process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
  const hasOverride =
    typeof process.env.E2E_LEDGER_PATH_OVERRIDE === 'string' &&
    process.env.E2E_LEDGER_PATH_OVERRIDE.trim().length > 0;
  if (!inCi && !hasOverride) {
    throw new Error(
      `safeAppendLedger refused: cannot write to ${LEDGER_PATH} ` +
        `outside CI. Set process.env.CI=true (CI invocation) or ` +
        `process.env.E2E_LEDGER_PATH_OVERRIDE=/path/to/tmp.json ` +
        `(local integration test). This guard protects the committed ` +
        `ledger from local --force-api runs leaking entries ` +
        `(Phase 48 leak vector + Phase 56 LEDGER-02 hardening; see ` +
        `.planning/research/PITFALLS.md Pitfall 7).`,
    );
  }
  appendLedgerEntry(LEDGER_PATH, entry);
}

const PHASE = '42-auto-fix';
// DEFAULT_TRANSPORT is the fall-through if runDispatcher is called WITHOUT a
// transport opt (back-compat with pre-Phase-46 callers). All 7 ledger-write
// call sites in this file MUST tag with the RUNTIME `transport` value
// resolved from the --transport CLI flag (or the runDispatcher opt) so that
// auxiliary forensic entries (diff-guard violations, malformed-diff,
// idempotency-hits, cap-block, flake-dispatched, flake-suppressed) carry
// the same transport label as the cost-bearing invokeClaudePWithLedger /
// invokeAnthropicSdkWithLedger entries. Phase 47 WARNING-01 (audit-milestone
// integration check, 2026-06-02): before this fix, all 7 auxiliary sites
// hardcoded `transport: TRANSPORT` to 'sdk', forensically mis-tagging local
// `npm run fix-issue --transport subscription` runs. Cost-bearing entries
// were always correct (invokeClaudePWithLedger self-tags 'subscription' at
// llm-driver.js:428); only the auxiliary entries leaked.
const DEFAULT_TRANSPORT = 'sdk';
const MODEL = 'claude-sonnet-4-6';
// Phase 46-01 (AUTOFIX-06) — subscription-transport routing constants.
// PHASE_46 tags ledger entries written by invokeClaudePWithLedger; SOURCE_FIX_ISSUE
// distinguishes the local-iteration `npm run fix-issue` call site from the
// nightly auto-fix-api path.
const PHASE_46 = '46-fix-issue';
const SOURCE_FIX_ISSUE = 'fix-issue-cli';
const VALID_TRANSPORTS = new Set(['sdk', 'subscription']);
const FIX_ATTEMPT_CAP = 3;
const HUMAN_REVIEW_LABEL = 'human-review-required';
// Phase 45-03 — flake-investigation Step-4a dispatcher guard + Step-7
// FLAKE_ESCALATION issue label. The label name is shared between the Step-4a
// guard (refuses to auto-fix issues that already carry it) and the
// dispatchFlakeState helper (creates it idempotently via `gh label create
// --force` before opening a new flake-investigation issue).
const FLAKE_INVESTIGATION_LABEL = 'flake-investigation';
const __FILE_45_03 = fileURLToPath(import.meta.url);
const __DIR_45_03 = path.dirname(__FILE_45_03);
const __REPO_ROOT_45_03 = path.resolve(__DIR_45_03, '..');
const RING_BUFFER_PATH = path.resolve(__REPO_ROOT_45_03, 'tests/e2e/.rerun-ring-buffer.json');
const SUPPRESSION_PATH = path.resolve(__REPO_ROOT_45_03, 'tests/e2e/.flake-suppression.json');
// Dispatcher recognizes the full ERROR_CLASSES taxonomy PLUS 'PASS' — PASS is
// a status, not an error class, so it lives outside the closed RPT-02 enum,
// but the dispatcher must short-circuit it via buildFixPrompt's
// SKIP_CLASS_ESCALATIONS (returns escalate:'close-as-pass'). Without this
// extension, a PASS-labeled issue would exit 2 as "no ERROR_CLASS" — but
// 42-CONTEXT.md and Plan 42-02 spec both treat PASS as a routable skip class.
const RECOGNIZED_LABELS = new Set([...ERROR_CLASSES, 'PASS']);

// ---------------------------------------------------------------------------
// Pure helpers (also exported for unit testing if ever needed)
// ---------------------------------------------------------------------------

/**
 * Extract the 12-hex v3.1 fingerprint from an issue body. The fingerprint
 * lives on its own line as an HTML comment, typically the FIRST body line:
 *   <!-- fp: 139f821b3bb1 -->
 *
 * Returns null when no match. Caller exits 2 on null.
 */
export function extractFingerprint(body) {
  if (typeof body !== 'string') return null;
  const m = body.match(/<!-- fp: ([0-9a-f]{12}) -->/m);
  return m ? m[1] : null;
}

/**
 * Extract the case-id line from an issue body:
 *   case-id: US11427642-spec-short-1
 * Returns null when absent (case-id is informational; not required for the
 * dispatcher to run, but the PR-body hint at the end uses it when present).
 */
export function extractCaseId(body) {
  if (typeof body !== 'string') return null;
  const m = body.match(/^case-id:\s*(.+)$/m);
  return m ? m[1].trim() : null;
}

/**
 * Reduce the gh issue view labels array to EXACTLY ONE ERROR_CLASS, or null
 * (no class match) or 'AMBIGUOUS' (multiple matches). The caller exits 2 on
 * either failure mode.
 *
 * @param {Array<{name:string}>|string[]} labels
 * @returns {string|null|'AMBIGUOUS'}
 */
export function extractErrorClass(labels) {
  if (!Array.isArray(labels)) return null;
  const names = labels.map((l) => (typeof l === 'string' ? l : l && l.name));
  const matches = names.filter((n) => typeof n === 'string' && RECOGNIZED_LABELS.has(n));
  if (matches.length === 0) return null;
  if (matches.length > 1) return 'AMBIGUOUS';
  return matches[0];
}

/**
 * Extract EXACTLY ONE unified diff between the fixed fence markers. Returns
 * {ok:true, diff} on a single match; {ok:false, reason} for 0 or 2+ matches
 * or non-string input. The caller writes a ledger entry with
 * errorReason:`malformed-diff:${reason}` and exits 1.
 */
export function parseFencedDiff(llmText) {
  if (typeof llmText !== 'string') return { ok: false, reason: 'non-string-llm-text' };
  const startRe = new RegExp(escapeRe(DIFF_FENCE_START), 'g');
  const endRe = new RegExp(escapeRe(DIFF_FENCE_END), 'g');
  const startMatches = llmText.match(startRe) || [];
  const endMatches = llmText.match(endRe) || [];
  if (startMatches.length === 0 || endMatches.length === 0) {
    return { ok: false, reason: 'no-fences' };
  }
  if (startMatches.length !== endMatches.length) {
    return { ok: false, reason: 'unbalanced-fences' };
  }
  if (startMatches.length > 1) {
    return { ok: false, reason: 'multiple-diff-blocks' };
  }
  const re = new RegExp(`${escapeRe(DIFF_FENCE_START)}\\s*\\n([\\s\\S]*?)\\n?${escapeRe(DIFF_FENCE_END)}`, 'm');
  const m = llmText.match(re);
  if (!m) return { ok: false, reason: 'fence-regex-mismatch' };
  return { ok: true, diff: m[1] };
}

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Parse `+++ b/<path>` headers from a unified diff. New files use `+++ b/<path>`;
 * deleted files use `+++ /dev/null` (skipped). Returns deduped path list in
 * source-order.
 */
export function changedPathsFromDiff(diff) {
  if (typeof diff !== 'string') return [];
  const paths = [];
  const seen = new Set();
  for (const line of diff.split(/\r?\n/)) {
    if (!line.startsWith('+++ ')) continue;
    const rest = line.slice(4).trim();
    if (rest === '/dev/null') continue;
    // Strip leading "b/" (git unified diff convention).
    const p = rest.startsWith('b/') ? rest.slice(2) : rest;
    if (!seen.has(p)) {
      seen.add(p);
      paths.push(p);
    }
  }
  return paths;
}

// ---------------------------------------------------------------------------
// dispatchFlakeState — Phase 45-03 Plan 03 Task 2 (FLAKE-02)
// ---------------------------------------------------------------------------

/**
 * Route a FLAKE-labeled issue through the 5-state classifier shipped in
 * Plan 45-02. Returns the exit code (0 on every successful classification;
 * null only on unexpected state-read failure — the caller falls back to the
 * Phase 42 ledger entry for audit).
 *
 * Branch matrix (per 45-CONTEXT D-04 / Plan 45-03 lock):
 *   FLAKE_SUPPRESSED  → ledger source:'flake-suppressed'; NO side effects;
 *                       respects the existing 30-day suppression (Pitfall 2 RESEARCH).
 *   FLAKE_ESCALATION  → idempotent `gh label create flake-investigation --force`,
 *                       `gh issue create` with flake-investigation + fp8 labels,
 *                       atomicWriteJson of suppression entry (until = now+30d),
 *                       and THEN falls through to the quarantine-append reset.
 *   FLAKE             → quarantine-append --escalate-stable-runs-reset 1 --case <id>
 *                       (corpus reset) + ledger entry.
 *   INTERMITTENT      → ledger entry only — corpus reset SKIPPED per CONTEXT lock
 *                       (INTERMITTENT is no-op on corpus).
 *   CONFIRMED_BUG / LIKELY_BUG → unreachable from a FLAKE label in practice;
 *                       defensive stderr audit log + ledger entry.
 *
 * Every gh and node invocation uses execFileSync(cmd, [arg, ...]) with an
 * arg array — CWE-94 hygiene; caseId is the only attacker-influenced value
 * and it is sanitized upstream by sanitizeCaseId in Phase 35.
 *
 * Phase 47 WARNING-01: `transport` MUST be the RUNTIME value (resolved from
 * the --transport CLI flag), not the module constant. Both ledger entries
 * written here (FLAKE_SUPPRESSED short-circuit + flake-dispatched summary)
 * are auxiliary forensic entries — callers under `--transport subscription`
 * must see `transport: 'subscription'` on these rows so dashboard transport-
 * filtering counts them under the right bucket.
 *
 * Phase 56 WR-02 (REVIEW.md): pre-flight the safeAppendLedger CI/override
 * guard at the TOP of this helper so the FLAKE_ESCALATION branch does not
 * issue `gh label create`, `gh issue create`, atomicWriteJson(suppression),
 * and `quarantine-append.mjs --escalate-stable-runs-reset` BEFORE its
 * terminal safeAppendLedger() throws on a local non-CI run. Without this
 * pre-flight, a developer testing the FLAKE branch with `--force-api`
 * locally would create a GitHub issue + write a suppression entry to disk
 * + reset the quarantine corpus, then fail to record the ledger row —
 * auditability gap. Failing fast at the top is the minimal fix.
 *
 * @param {{caseId: string|null, fingerprint: string, issueNumber: number, transport?: string, now?: () => Date}} opts
 * @returns {Promise<number|null>}
 */
export async function dispatchFlakeState({ caseId, fingerprint, issueNumber, transport = DEFAULT_TRANSPORT, now = () => new Date() }) {
  // Phase 56 WR-02 — pre-flight the safeAppendLedger CI/override guard so
  // the FLAKE_ESCALATION side effects (gh label, gh issue, suppression
  // write, quarantine reset) never land without a corresponding ledger row.
  // Use the same canonical strict form as safeAppendLedger (CR-02) for
  // semantic parity — `CI=false` MUST NOT pass either check.
  const __wr02_inCi =
    process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
  const __wr02_hasOverride =
    typeof process.env.E2E_LEDGER_PATH_OVERRIDE === 'string' &&
    process.env.E2E_LEDGER_PATH_OVERRIDE.trim().length > 0;
  if (!__wr02_inCi && !__wr02_hasOverride) {
    throw new Error(
      'dispatchFlakeState refused outside CI/override — same gate as ' +
        'safeAppendLedger (Phase 56 WR-02). The FLAKE_ESCALATION branch ' +
        'produces gh issue + suppression + quarantine-reset side effects ' +
        'BEFORE its terminal ledger write; we fail fast at entry so those ' +
        'side effects never land without an audit row. Set ' +
        'process.env.CI=true or E2E_LEDGER_PATH_OVERRIDE=/path/to/tmp.json.',
    );
  }
  let ringBuffer;
  let suppressionsFile;
  try {
    ringBuffer = readRingBufferOrInit(RING_BUFFER_PATH);
    suppressionsFile = readSuppressionsOrInit(SUPPRESSION_PATH);
  } catch (err) {
    process.stderr.write(`[auto-fix] FLAKE dispatch state read failed: ${err.message}\n`);
    return null;
  }

  const caseEntry =
    (caseId && ringBuffer.cases && ringBuffer.cases[caseId]) || { outcomes: [], flakeHistory: [] };
  const decision = classifyRerunOutcomes({
    outcomes: caseEntry.outcomes,
    fingerprint,
    suppressions: suppressionsFile.suppressions,
    flakeHistory: caseEntry.flakeHistory,
    now,
  });

  // FLAKE_SUPPRESSED — respect the existing suppression; no side effects
  if (decision.state === 'FLAKE_SUPPRESSED') {
    safeAppendLedger({
      iso: now().toISOString(),
      model: MODEL,
      cost_usd: 0,
      tokens_in: 0,
      tokens_out: 0,
      phase: PHASE,
      transport,
      issueId: `issue-${issueNumber}`,
      fingerprint,
      errorClass: null,                 // LEDGER-01 — dispatchFlakeState body has no errorClass in scope
      source: 'flake-suppressed',
      flakeState: 'FLAKE_SUPPRESSED',
      suppressedUntil: decision.until,
    });
    process.stdout.write(
      `[auto-fix] FLAKE_SUPPRESSED for fingerprint ${fingerprint} (until ${decision.until}); exit 0\n`,
    );
    return 0;
  }

  // FLAKE_ESCALATION — create issue + write suppression; THEN fall through to
  // the corpus reset below (FLAKE_ESCALATION inherits FLAKE's reset semantics).
  if (decision.state === 'FLAKE_ESCALATION') {
    const fp8Local = (fingerprint ?? '').slice(0, 8);
    // Idempotent label create (mirrors Phase 42 HUMAN_REVIEW_LABEL pattern)
    try {
      execFileSync('gh', ['label', 'create', FLAKE_INVESTIGATION_LABEL, '--force'], {
        encoding: 'utf8',
      });
    } catch (_) {
      // Label may already exist — `--force` keeps it idempotent. Swallow.
    }
    try {
      const body = buildFlakeInvestigationBody({
        caseId: caseId ?? '<unknown-case>',
        fingerprint,
        outcomes: caseEntry.outcomes,
        flakeHistory: caseEntry.flakeHistory,
      });
      execFileSync(
        'gh',
        [
          'issue', 'create',
          '--title', `[flake-investigation] ${caseId ?? `issue-${issueNumber}`} fingerprint ${fp8Local}`,
          '--label', FLAKE_INVESTIGATION_LABEL,
          '--label', fp8Local,
          '--body', body,
        ],
        { encoding: 'utf8' },
      );
    } catch (err) {
      process.stderr.write(
        `[auto-fix] gh issue create (flake-investigation) failed (non-fatal): ${err.message}\n`,
      );
    }
    // Suppression entry — 30-day cooldown (Pitfall 2 RESEARCH defense)
    suppressionsFile.suppressions[fingerprint] = {
      until: new Date(now().getTime() + FLAKE_SUPPRESSION_DAYS * 86400_000).toISOString(),
      reason: 'FLAKE_ESCALATION',
    };
    try {
      atomicWriteJson(SUPPRESSION_PATH, JSON.stringify(suppressionsFile, null, 2) + '\n');
    } catch (err) {
      process.stderr.write(`[auto-fix] suppression file write failed: ${err.message}\n`);
    }
  }

  // FLAKE or FLAKE_ESCALATION → invoke quarantine-append --escalate-stable-runs-reset 1 --case <id>.
  // INTERMITTENT → no-op on corpus per 45-CONTEXT lock.
  if ((decision.state === 'FLAKE' || decision.state === 'FLAKE_ESCALATION') && caseId) {
    try {
      execFileSync(
        'node',
        [
          'scripts/quarantine-append.mjs',
          '--escalate-stable-runs-reset', '1',
          '--case', caseId,
        ],
        { encoding: 'utf8' },
      );
    } catch (err) {
      process.stderr.write(
        `[auto-fix] quarantine-append reset failed (non-fatal): ${err.message}\n`,
      );
    }
  }

  // Defensive audit log for unreachable-from-FLAKE-label states
  if (decision.state === 'CONFIRMED_BUG' || decision.state === 'LIKELY_BUG') {
    process.stderr.write(
      `[auto-fix] FLAKE label but classifyRerunOutcomes returned ${decision.state} ` +
        `for fingerprint ${fingerprint} — producer/consumer mismatch; logging for audit\n`,
    );
  }

  // Ledger entry summarizing the dispatch decision
  safeAppendLedger({
    iso: now().toISOString(),
    model: MODEL,
    cost_usd: 0,
    tokens_in: 0,
    tokens_out: 0,
    phase: PHASE,
    transport,
    issueId: `issue-${issueNumber}`,
    fingerprint,
    errorClass: null,                 // LEDGER-01 — dispatchFlakeState body has no errorClass in scope
    source: 'flake-dispatched',
    flakeState: decision.state,
    flakeAction: decision.action,
  });
  process.stdout.write(
    `[auto-fix] FLAKE dispatch for issue #${issueNumber} state=${decision.state} action=${decision.action}; exit 0\n`,
  );
  return 0;
}

// ---------------------------------------------------------------------------
// runDispatcher — the 18-step pipeline (Plan 42-02 Task 2)
// ---------------------------------------------------------------------------

/**
 * Run the auto-fix dispatcher. Returns the exit code (0/1/2/3) instead of
 * calling process.exit so it is unit-testable.
 *
 * @param {object} opts
 * @param {number} opts.issue            — required; GH issue number
 * @param {string} [opts.transport='sdk'] — 'sdk' (Phase 42 SDK) or 'subscription' (Phase 46 — routes to invokeClaudePWithLedger)
 * @param {boolean} [opts.forceApi=false] — bypass the INVERSE CI gate (sdk only)
 * @param {boolean} [opts.dryRun=false]   — print prompt; no SDK, no apply, no push, no ledger
 * @param {boolean} [opts.push=false]     — Phase 46 opt-in push for subscription. For sdk transport this is a no-op (sdk pushes by default; --no-push overrides both).
 * @param {boolean} [opts.noPush=false]   — commit locally; skip the final `git push` (wins over --push under both transports)
 * @returns {Promise<number>} exit code
 */
export async function runDispatcher({
  issue,
  transport = DEFAULT_TRANSPORT,
  forceApi = false,
  dryRun = false,
  push = false,
  noPush = false,
} = {}) {
  // ─── Step 1 — argv / contract guard ────────────────────────────────────
  if (issue === undefined || issue === null || issue === '') {
    process.stderr.write('[auto-fix] missing required --issue <n>\n');
    return 2;
  }
  // Phase 46-01 (AUTOFIX-06): allow-list guard — accepts 'sdk' and
  // 'subscription'. Unknown transports exit 2 with the canonical list so
  // typos surface immediately.
  if (!VALID_TRANSPORTS.has(transport)) {
    process.stderr.write(
      `[auto-fix] unrecognized --transport '${transport}'; ` +
        `expected one of: ${[...VALID_TRANSPORTS].join(', ')}\n`,
    );
    return 2;
  }

  // ─── Step 2 — gh issue view ───────────────────────────────────────────
  let issueJson;
  try {
    const out = execFileSync('gh', [
      'issue', 'view', String(issue),
      '--json', 'body,labels,title,number,assignees',
    ], { encoding: 'utf8' });
    issueJson = JSON.parse(out);
  } catch (err) {
    process.stderr.write(`[auto-fix] gh issue view failed: ${err.message}\n`);
    return 2;
  }
  const issueBody = typeof issueJson.body === 'string' ? issueJson.body : '';

  // ─── Step 3 — fingerprint extraction ──────────────────────────────────
  const fingerprint = extractFingerprint(issueBody);
  if (!fingerprint) {
    process.stderr.write(
      '[auto-fix] issue body missing fingerprint:; this is a v3.1 contract violation\n',
    );
    return 2;
  }
  const fp8 = fingerprint.slice(0, 8);
  const branchName = `auto-fix/${issue}-${fp8}`;
  const caseId = extractCaseId(issueBody);

  // ─── Step 4a (Phase 45-03 Pitfall 5) — flake-investigation guard ───────
  // Refuse to auto-fix any issue that already carries the flake-investigation
  // label, BEFORE the ERROR_CLASS extraction in Step 4. Without this guard,
  // an operator-misclick that adds `triage` to a flake-investigation issue
  // would loop auto-fix on the investigation issue itself (Pitfall 5).
  const labelNames45_03 = (issueJson.labels ?? [])
    .map((l) => (typeof l === 'string' ? l : l?.name))
    .filter(Boolean);
  if (labelNames45_03.includes(FLAKE_INVESTIGATION_LABEL)) {
    process.stderr.write(
      `[auto-fix] issue #${issue} carries the '${FLAKE_INVESTIGATION_LABEL}' label — ` +
        `flake-investigation issues are human-only — auto-fix skipped\n`,
    );
    return 0;
  }

  // ─── Step 4 — ERROR_CLASS extraction ──────────────────────────────────
  const errorClass = extractErrorClass(issueJson.labels);
  if (errorClass === null) {
    process.stderr.write(
      `[auto-fix] issue #${issue} has no ERROR_CLASS label ` +
        `(expected one of: ${[...RECOGNIZED_LABELS].join(', ')})\n`,
    );
    return 2;
  }
  if (errorClass === 'AMBIGUOUS') {
    process.stderr.write(
      `[auto-fix] issue #${issue} has multiple ERROR_CLASS labels — refusing to dispatch\n`,
    );
    return 2;
  }

  // ─── Step 5 — AUTOFIX-05 fix_attempts cap ─────────────────────────────
  const ledger = readLedger(LEDGER_PATH);
  const attempts = countFixAttempts(ledger, fingerprint);
  if (attempts >= FIX_ATTEMPT_CAP) {
    // Idempotent label create (ignore failure — label may already exist).
    try {
      execFileSync('gh', ['label', 'create', HUMAN_REVIEW_LABEL, '--force'], { encoding: 'utf8' });
    } catch (_) { /* ignore */ }
    try {
      execFileSync('gh', [
        'issue', 'edit', String(issue),
        '--add-label', HUMAN_REVIEW_LABEL,
      ], { encoding: 'utf8' });
    } catch (err) {
      process.stderr.write(`[auto-fix] gh issue edit (label) failed: ${err.message}\n`);
    }
    process.stderr.write(
      `[auto-fix] fingerprint ${fingerprint} has ${attempts} prior attempts ` +
        `(cap ${FIX_ATTEMPT_CAP}); added '${HUMAN_REVIEW_LABEL}' label; exit 3\n`,
    );
    return 3;
  }

  // ─── Step 6 — AUTOFIX-04 git ls-remote idempotency ────────────────────
  let lsRemoteOut = '';
  try {
    lsRemoteOut = execFileSync('git', ['ls-remote', '--heads', 'origin', branchName], {
      encoding: 'utf8',
    });
  } catch (err) {
    // Network or auth failure — surface as exit 2 (contract error) rather
    // than silently skip the idempotency check.
    process.stderr.write(`[auto-fix] git ls-remote failed: ${err.message}\n`);
    return 2;
  }
  if (lsRemoteOut.trim().length > 0) {
    safeAppendLedger({
      iso: new Date().toISOString(),
      model: MODEL,
      cost_usd: 0,
      tokens_in: 0,
      tokens_out: 0,
      phase: PHASE,
      transport,
      issueId: `issue-${issue}`,
      fingerprint,
      errorClass,                       // LEDGER-01 — errorClass from extractErrorClass(issueJson.labels) in Step 4
      source: 'auto-fix-api',
      branchExisted: true,
    });
    try {
      execFileSync('gh', [
        'issue', 'comment', String(issue),
        '--body',
        `Auto-fix already attempted for fingerprint ${fingerprint} on branch \`${branchName}\` (${attempts} prior attempt(s)). Skipping. Inspect the existing branch or close the issue if the prior attempt is sufficient.`,
      ], { encoding: 'utf8' });
    } catch (err) {
      process.stderr.write(`[auto-fix] gh issue comment failed (non-fatal): ${err.message}\n`);
    }
    return 0;
  }

  // ─── Step 7 — buildFixPrompt + skip-class short-circuit ───────────────
  const built = buildFixPrompt({ errorClass, issueBody });
  if (!built.ok) {
    // Phase 45-03 — FLAKE label dispatches through the 5-state classifier.
    // Non-FLAKE skip classes (LLM_API_ERROR, PASS) preserve the Phase 42
    // ledger entry byte-identical.
    if (errorClass === 'FLAKE') {
      const exitCode = await dispatchFlakeState({
        caseId,
        fingerprint,
        issueNumber: issue,
        transport,   // WARNING-01: thread runtime transport so flake-suppressed
                     // and flake-dispatched ledger rows carry the correct tag
      });
      if (exitCode !== null) return exitCode;
      // Defensive fall-through: helper returned null only on unexpected
      // state-read failure — preserve Phase 42 ledger entry below for audit.
    }
    safeAppendLedger({
      iso: new Date().toISOString(),
      model: MODEL,
      cost_usd: 0,
      tokens_in: 0,
      tokens_out: 0,
      phase: PHASE,
      transport,
      issueId: `issue-${issue}`,
      fingerprint,
      errorClass,                       // LEDGER-01 — errorClass from extractErrorClass(issueJson.labels) in Step 4
      source: 'auto-fix-api',
      escalate: built.escalate,
    });
    process.stdout.write(
      `[auto-fix] skip-class ${errorClass} for issue #${issue}; escalate=${built.escalate}; exit 0\n`,
    );
    return 0;
  }
  const { systemPrompt, userPrompt } = built;

  // ─── Step 8 — --dry-run short-circuit (NO SDK / NO ledger / NO mutation) ─
  if (dryRun) {
    process.stdout.write('--- SYSTEM PROMPT ---\n');
    process.stdout.write(systemPrompt + '\n');
    process.stdout.write('--- USER PROMPT (envelope-wrapped) ---\n');
    process.stdout.write(userPrompt + '\n');
    process.stdout.write(
      `--- (dry-run: SDK not invoked, ledger not written, branch not pushed; fix_attempts counter NOT incremented per RESEARCH Pitfall 6) ---\n`,
    );
    return 0;
  }

  // ─── Step 9 — Build systemBlocks array (Pitfall 6 cache_control wiring) ─
  const systemBlocks = [
    {
      type: 'text',
      text: systemPrompt,
      cache_control: { type: 'ephemeral', ttl: '1h' },
    },
  ];

  // ─── Step 10 — LLM dispatch (transport-branched, Phase 46-01) ─────────
  // Subscription transport flows through invokeClaudePWithLedger — a v3.1
  // local-only wrapper with a CI-refusal guard (Pitfall 8 in PITFALLS.md;
  // see tests/e2e/lib/llm-driver.js:387-393). The wrapper takes systemPrompt
  // (string) — NOT systemBlocks — and does NOT honor cache_control (no SDK
  // surface for it), so we use the plain prompt here. The result shape
  // (ok/ciGate/capBlocked/errorReason) is contract-identical to
  // invokeAnthropicSdkWithLedger, so the error mapper below works for both.
  let sdkResult;
  if (transport === 'subscription') {
    sdkResult = await invokeClaudePWithLedger({
      systemPrompt,
      userPrompt,
      phase: PHASE_46,
      source: SOURCE_FIX_ISSUE,
    });
  } else {
    sdkResult = await invokeAnthropicSdkWithLedger({
      systemBlocks,
      userPrompt,
      model: built.model,
      phase: PHASE,
      issueId: `issue-${issue}`,
      forceApi,
    });
  }

  if (!sdkResult.ok) {
    if (sdkResult.ciGate) {
      process.stderr.write(
        '[auto-fix] SDK refused: not in CI and --force-api not set. ' +
          'Re-run with --force-api to invoke the API from a local shell.\n',
      );
      return 2;
    }
    if (sdkResult.capBlocked) {
      process.stderr.write(
        `[auto-fix] SDK refused: spend cap blocked ` +
          `(monthly=${sdkResult.monthly?.status} day=${sdkResult.day?.status} ` +
          `issue=${sdkResult.issue?.status} pr=${sdkResult.pr?.status} ` +
          `phase=${sdkResult.phaseCap?.status})\n`,
      );
      return 3;
    }
    if (sdkResult.errorReason === 'contract-error') {
      process.stderr.write(`[auto-fix] SDK contract error: ${sdkResult.errorMessage}\n`);
      return 2;
    }
    process.stderr.write(`[auto-fix] SDK error: ${sdkResult.errorMessage ?? sdkResult.errorReason}\n`);
    return 1;
  }

  // ─── Step 11 — parseFencedDiff ────────────────────────────────────────
  const parsed = parseFencedDiff(sdkResult.llmText);
  if (!parsed.ok) {
    safeAppendLedger({
      iso: new Date().toISOString(),
      model: MODEL,
      cost_usd: 0,
      tokens_in: 0,
      tokens_out: 0,
      phase: PHASE,
      transport,
      issueId: `issue-${issue}`,
      fingerprint,
      errorClass,                       // LEDGER-01 — errorClass from extractErrorClass(issueJson.labels) in Step 4
      source: 'auto-fix-api',
      errorReason: `malformed-diff:${parsed.reason}`,
    });
    process.stderr.write(`[auto-fix] LLM output malformed: ${parsed.reason}; exit 1\n`);
    return 1;
  }

  // ─── Step 12 — diff-guard (AUTOFIX-03 — single source of truth) ───────
  const changedPaths = changedPathsFromDiff(parsed.diff);
  const guard = checkDiffGuard(changedPaths);
  if (!guard.ok) {
    const violationList = guard.violations.join(', ');
    safeAppendLedger({
      iso: new Date().toISOString(),
      model: MODEL,
      cost_usd: 0,
      tokens_in: 0,
      tokens_out: 0,
      phase: PHASE,
      transport,
      issueId: `issue-${issue}`,
      fingerprint,
      errorClass,                       // LEDGER-01 — errorClass from extractErrorClass(issueJson.labels) in Step 4; LEDGER-04 test asserts on this site
      source: 'auto-fix-api',
      errorReason: `diff-guard-violation:${violationList}`,
    });
    try {
      execFileSync('gh', [
        'issue', 'comment', String(issue),
        '--body',
        `Auto-fix REJECTED: the proposed diff touches forbidden path(s): ${violationList}. ` +
          `These paths are LOCKED by scripts/check-diff-guard.mjs (Phase 41 VFY-GATE-04). ` +
          `The fix must target production code in src/ — NOT the golden baseline / quarantine corpus / workflows / CODEOWNERS / ledger.`,
      ], { encoding: 'utf8' });
    } catch (err) {
      process.stderr.write(`[auto-fix] gh issue comment failed (non-fatal): ${err.message}\n`);
    }
    process.stderr.write(`[auto-fix] diff-guard violation: ${violationList}; exit 1\n`);
    return 1;
  }

  // ─── Step 13 — git apply --check (BEFORE the real apply) ──────────────
  try {
    execFileSync('git', ['apply', '--check'], {
      input: parsed.diff,
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf8',
    });
  } catch (err) {
    const stderrSnip = String(err.stderr ?? err.message ?? '').slice(0, 500);
    safeAppendLedger({
      iso: new Date().toISOString(),
      model: MODEL,
      cost_usd: 0,
      tokens_in: 0,
      tokens_out: 0,
      phase: PHASE,
      transport,
      issueId: `issue-${issue}`,
      fingerprint,
      errorClass,                       // LEDGER-01 — errorClass from extractErrorClass(issueJson.labels) in Step 4
      source: 'auto-fix-api',
      errorReason: 'apply-check-failed',
      errorMessage: stderrSnip,
    });
    process.stderr.write(`[auto-fix] git apply --check failed: ${stderrSnip}; exit 1\n`);
    return 1;
  }

  // ─── Step 14 — git apply (the real one) ───────────────────────────────
  try {
    execFileSync('git', ['apply'], {
      input: parsed.diff,
      stdio: ['pipe', 'inherit', 'inherit'],
    });
  } catch (err) {
    process.stderr.write(`[auto-fix] git apply failed (post --check?): ${err.message}; exit 1\n`);
    return 1;
  }

  // ─── Step 15 — git checkout -b ────────────────────────────────────────
  try {
    execFileSync('git', ['checkout', '-b', branchName], { stdio: ['ignore', 'inherit', 'inherit'] });
  } catch (err) {
    process.stderr.write(`[auto-fix] git checkout -b failed: ${err.message}; exit 1\n`);
    return 1;
  }

  // ─── Step 16 — git commit -am ─────────────────────────────────────────
  const commitMsg = `Fix #${issue}: ${errorClass}`;
  try {
    execFileSync('git', ['commit', '-am', commitMsg], { stdio: ['ignore', 'inherit', 'inherit'] });
  } catch (err) {
    process.stderr.write(`[auto-fix] git commit failed: ${err.message}; exit 1\n`);
    return 1;
  }

  // ─── Step 17 — git push (truth table; Phase 46-01) ────────────────────
  // Truth table (locked in 46-PLAN <interfaces>):
  //   transport=sdk          → push by default; --no-push overrides
  //   transport=subscription → NO-push by default; --push opts in;
  //                            --no-push wins over --push under both
  const shouldPush = (() => {
    if (noPush) return false;
    if (push) return true;
    return transport === 'sdk';
  })();
  if (!shouldPush) {
    process.stdout.write(
      `[auto-fix] branch staged locally; push manually with: ` +
        `git push -u origin ${branchName} (or rerun with --push)\n`,
    );
  } else {
    try {
      execFileSync('git', ['push', '-u', 'origin', branchName], { stdio: ['ignore', 'inherit', 'inherit'] });
    } catch (err) {
      process.stderr.write(`[auto-fix] git push failed: ${err.message}; exit 1\n`);
      return 1;
    }
  }

  // ─── Step 18 — Print PR-create hint for the manual Plan 42-03 demo ───
  const prBodyHint =
    `<!-- affected_cases: ${caseId ?? 'unknown'} -->\n` +
    `fingerprint: ${fingerprint}\n` +
    `fix_attempts: ${attempts + 1}\n` +
    `model: ${MODEL}\n` +
    `transport: ${transport}`;
  process.stdout.write(
    `[auto-fix] suggested PR-create command:\n` +
      `  gh pr create --draft --base main --head ${branchName} ` +
      `--title 'auto-fix: ${errorClass} for ${caseId ?? `issue-${issue}`}' ` +
      `--body '${prBodyHint.replace(/'/g, "'\\''")}'\n`,
  );

  return 0;
}

// ---------------------------------------------------------------------------
// CLI shim (NOT unit-tested; Plan 42-03 demo exercises this path)
// ---------------------------------------------------------------------------

if (import.meta.url === `file://${process.argv[1]}`) {
  let parsed;
  try {
    parsed = parseArgs({
      options: {
        issue: { type: 'string' },
        transport: { type: 'string', default: 'sdk' },
        'force-api': { type: 'boolean', default: false },
        'dry-run': { type: 'boolean', default: false },
        push: { type: 'boolean', default: false },
        'no-push': { type: 'boolean', default: false },
        help: { type: 'boolean', default: false },
      },
      strict: true,
      allowPositionals: false,
    });
  } catch (err) {
    process.stderr.write(`[auto-fix] argv error: ${err.message}\n`);
    process.exit(2);
  }

  if (parsed.values.help) {
    process.stdout.write(
      'Usage: node scripts/auto-fix.mjs --issue <n> [--transport sdk|subscription] [--force-api] [--dry-run] [--push] [--no-push]\n' +
        '\n' +
        'Dispatcher for the WRONG_CITATION auto-fix loop. Reads `gh issue view <n>`,\n' +
        'routes ERROR_CLASS labels through PROMPT_SCAFFOLDS, invokes the LLM (SDK or\n' +
        'subscription `claude -p`), validates the response diff (diff-guard +\n' +
        '`git apply --check`), and creates a branch on success.\n' +
        '\n' +
        '--transport sdk (default) pushes the branch by default; --no-push overrides.\n' +
        '--transport subscription routes to the local `claude -p` ledgered wrapper\n' +
        '(CI-refused) and does NOT push unless --push is set. --no-push wins under\n' +
        'both transports.\n' +
        '\n' +
        'Exit codes: 0=applied/dry-run/skip/staged-locally; 1=rejected; 2=arg/contract error; 3=cap.\n',
    );
    process.exit(0);
  }

  const issueArg = parsed.values.issue;
  if (issueArg === undefined || issueArg === '') {
    process.stderr.write('[auto-fix] missing required --issue <n>\n');
    process.exit(2);
  }
  const issueNum = Number(issueArg);
  if (!Number.isInteger(issueNum) || issueNum < 1) {
    process.stderr.write(`[auto-fix] --issue must be a positive integer; got '${issueArg}'\n`);
    process.exit(2);
  }

  runDispatcher({
    issue: issueNum,
    transport: parsed.values.transport,
    forceApi: parsed.values['force-api'],
    dryRun: parsed.values['dry-run'],
    push: parsed.values.push,
    noPush: parsed.values['no-push'],
  }).then(
    (code) => process.exit(code),
    (err) => {
      process.stderr.write(`[auto-fix] fatal: ${err.stack ?? err.message}\n`);
      process.exit(1);
    },
  );
}

// END scripts/auto-fix.mjs — Phase 42 Plan 02

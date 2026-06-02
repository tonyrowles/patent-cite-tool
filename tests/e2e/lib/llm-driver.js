// tests/e2e/lib/llm-driver.js
//
// Phase 31 Plan 03 (LLM-01 + LLM-02) — `claude -p` driver, response parser,
// schema validator, picker-prompt builder, and pure classification helper.
//
// This module is intentionally Playwright-free so it can be unit tested by
// mocking only `node:child_process`. The driver wiring (which DOES involve
// Playwright) lives in scripts/e2e-explore.mjs.
//
// Public surface:
//   LLM_TIMEOUT_MS              60_000  (per CONTEXT.md — 30s typical + 30s headroom)
//   SELECTION_MIN_CHARS         50      (per CONTEXT.md selection constraints)
//   SELECTION_MAX_CHARS         300     (per CONTEXT.md selection constraints)
//   invokeClaudeP(opts)         spawns `claude -p ...`, returns {timedOut, stdout, stderr, code}
//   parseClaudeResponse(result) → {ok:true, llmText, costUsd, modelId, durationMs, rawJson}
//                                | {ok:false, errorReason, costUsd, rawSnippet}
//   buildPickerPrompt(ctx)      → {systemPrompt, userPrompt}
//   validateLlmSelection(llmText) → {ok:true, selection} | {ok:false, reason}
//   classifyIteration({hallucinationPassed, citation, verifierStatus}) → classification string
//
// Phase 34 Plan 01 (D-05/D-06):
//   invokeClaudePWithLedger({systemPrompt, userPrompt, timeoutMs, phase, source})
//     → {ok:true, llmText, modelId, costUsd, rawJson}
//     | {ok:false, ciGate:true}           CI gate blocked (no ledger entry)
//     | {ok:false, capBlocked:true, ...}  spend cap blocked (no ledger entry)
//     | {ok:false, errorReason, ...}      is_error response (ledger entry written)
//
// Pitfall mitigations (see 31-RESEARCH.md):
//   - Pitfall 1: env passed to spawn explicitly sets ANTHROPIC_API_KEY = ''
//     so any developer-set pay-per-token key cannot leak through. We also
//     never pass the bare-mode flag (which would switch to API-key-only auth).
//   - Pitfall 2: never pass the json-schema flag (incompatible with
//     --max-turns 1 in subscription mode). Rely on prompt-level JSON
//     instruction + retry.
//   - Pitfall 4: parseClaudeResponse guards against empty stdout BEFORE
//     attempting JSON.parse — empty stdout (SIGTERM) is classified as
//     'empty_stdout', NOT a JSON parse error.
//   - Pitfall 6: cost is taken from response.total_cost_usd directly. The
//     formula reconstruction is opaque (cache creation/read at different
//     rates) — trust the pre-computed field.
//   - Pitfall 8: when is_error: true, total_cost_usd MAY still be non-zero.
//     We record that cost in the {ok:false} branch's costUsd field so the
//     ledger records the spend.

import { spawn } from 'node:child_process';
import Anthropic from '@anthropic-ai/sdk';
import {
  LEDGER_PATH, readLedger, checkSpendCap, checkPhaseSpendCap, appendLedgerEntry,
  checkDayCap, checkIssueCap, checkPrCap,
} from './llm-ledger.js';
import { fallbackCostUsd } from './llm-pricing.js';

/**
 * Hard timeout for one `claude -p` invocation. Subscription-mode round-trip is
 * typically ~30s; 60s gives 2x headroom. On timeout, the child is sent SIGTERM
 * and the response is classified as LLM_API_ERROR (errorReason: 'timeout').
 */
export const LLM_TIMEOUT_MS = 60_000;

/** Minimum chars in LLM-proposed selectedText (per CONTEXT.md). */
export const SELECTION_MIN_CHARS = 50;

/** Maximum chars in LLM-proposed selectedText (per CONTEXT.md). */
export const SELECTION_MAX_CHARS = 300;

const REQUIRED_SELECTION_FIELDS = ['caseId', 'patentId', 'selectedText', 'category', 'rationale'];

/**
 * Patent-id format guard. Mirrors the regex used by gotoPatent (Phase 26
 * navigation.js line 15) so anything that fails validateLlmSelection also
 * would have failed gotoPatent. Two-tier defense per threat T-31-3a.
 */
const PATENT_ID_RE = /^[A-Z]{2}\d+[A-Z]?\d*$/;

/**
 * Spawn `claude -p` with subscription-mode env.
 *
 * Env:
 *   - ANTHROPIC_API_KEY: ''   (Pitfall 1 — explicitly cleared even if the
 *                              developer set it; forces subscription auth.)
 *
 * Args (Pitfalls 1, 2 — DO NOT change):
 *   ['-p', '--output-format', 'json', '--max-turns', '1',
 *    '--system-prompt', sysP, userP]
 *
 * @param {{ systemPrompt: string, userPrompt: string, timeoutMs?: number }} opts
 * @returns {Promise<{ timedOut: boolean, stdout: string, stderr: string, code: number|null }>}
 */
export async function invokeClaudeP({ systemPrompt, userPrompt, timeoutMs = LLM_TIMEOUT_MS } = {}) {
  return new Promise((resolve) => {
    const args = [
      '-p',
      '--output-format', 'json',
      '--max-turns', '1',
      '--system-prompt', systemPrompt,
      userPrompt,
    ];
    // Threat T-31-4 mitigation: blank ANTHROPIC_API_KEY even if developer set it.
    const env = { ...process.env, ANTHROPIC_API_KEY: '' };

    const child = spawn('claude', args, { stdio: ['ignore', 'pipe', 'pipe'], env });

    let stdout = '';
    let stderr = '';
    let resolved = false;
    const finish = (value) => {
      if (resolved) return;
      resolved = true;
      resolve(value);
    };

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    // SIGTERM → grace → SIGKILL escalation (WR-02). The `claude` CLI is
    // Node-based and may install a graceful-shutdown handler that ignores
    // SIGTERM for several seconds — during which it can still print
    // `total_cost_usd` and incur billing. We resolve the promise immediately
    // on timeout (so the runner can proceed) AND escalate to SIGKILL after a
    // 2s grace if the child has not exited. Without the escalation, back-to-
    // back timeouts could fan out orphan children that ALL bill the
    // subscription pool — exactly what the spend cap is meant to prevent.
    let killTimer = null;
    const timer = setTimeout(() => {
      try { child.kill('SIGTERM'); } catch { /* already exited */ }
      killTimer = setTimeout(() => {
        try { child.kill('SIGKILL'); } catch { /* gone */ }
      }, 2_000);
      // Don't keep the event loop alive just to send SIGKILL — if the runner
      // exits cleanly before grace elapses, that's fine.
      if (typeof killTimer.unref === 'function') killTimer.unref();
      finish({ timedOut: true, stdout: '', stderr, code: null });
    }, timeoutMs);

    child.on('close', (code) => {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      finish({ timedOut: false, stdout, stderr, code });
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      finish({ timedOut: false, stdout: '', stderr: err.message, code: -1 });
    });
  });
}

/**
 * Parse the raw stdout from `claude -p --output-format json`.
 * Branch matrix:
 *   timedOut → errorReason='timeout', costUsd=0
 *   !stdout.trim() → errorReason='empty_stdout', costUsd=0
 *   JSON.parse throws → errorReason='json_parse_error', costUsd=0, rawSnippet=stdout[0..500]
 *   parsed.is_error → errorReason=`api_error:${subtype}`, costUsd=parsed.total_cost_usd ?? 0
 *   else → {ok:true, llmText, costUsd, modelId, durationMs, rawJson}
 *
 * @param {{ timedOut:boolean, stdout:string, stderr?:string, code?:number|null }} result
 * @returns {object}
 */
export function parseClaudeResponse(result) {
  const { timedOut, stdout, stderr } = result ?? {};
  if (timedOut) {
    return {
      ok: false,
      errorReason: 'timeout',
      costUsd: 0,
      rawSnippet: (stderr ?? '').slice(0, 500),
    };
  }
  if (!stdout || !stdout.trim()) {
    return {
      ok: false,
      errorReason: 'empty_stdout',
      costUsd: 0,
      rawSnippet: '',
    };
  }
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return {
      ok: false,
      errorReason: 'json_parse_error',
      costUsd: 0,
      rawSnippet: stdout.slice(0, 500),
    };
  }
  // Non-object payload guard (WR-03). `JSON.parse('"a string"')`, '42', 'null',
  // 'true', '[…]' all return non-object values for which `.total_cost_usd`,
  // `.is_error`, `.modelUsage`, `.result` silently yield `undefined`. The
  // original code would then return {ok:true, llmText:'', costUsd:0,
  // modelId:'unknown'} and downstream validateLlmSelection('') would throw
  // "JSON parse error: ... is not an object" — misclassified as schema failure
  // (burning the retry budget) rather than a malformed claude response.
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      ok: false,
      errorReason: 'json_parse_error',
      costUsd: 0,
      rawSnippet: stdout.slice(0, 500),
    };
  }
  const costUsd = typeof parsed.total_cost_usd === 'number' ? parsed.total_cost_usd : 0;
  if (parsed.is_error) {
    return {
      ok: false,
      errorReason: `api_error:${parsed.subtype ?? 'unknown'}`,
      costUsd,
      rawSnippet: stdout.slice(0, 500),
    };
  }
  const modelId = Object.keys(parsed.modelUsage ?? {})[0] ?? 'unknown';
  return {
    ok: true,
    llmText: parsed.result ?? '',
    costUsd,
    modelId,
    durationMs: parsed.duration_ms ?? 0,
    rawJson: parsed,
  };
}

/**
 * Build the picker prompt for one iteration. The system prompt is fixed
 * across iterations (subject to claude's ephemeral cache — RESEARCH.md
 * Pitfall 6 — so subsequent invocations cost ~1/3 of the first); the user
 * prompt carries the per-iteration patent + spec excerpt.
 *
 * @param {{ patent: { id: string, category?: string }, specExcerpt: string, bodyStartPage: number }} ctx
 * @returns {{ systemPrompt: string, userPrompt: string }}
 */
export function buildPickerPrompt({ patent, specExcerpt, bodyStartPage } = {}) {
  const systemPrompt =
    'You are testing a patent citation extension. Given a patent ID and its ' +
    'specification excerpt, propose ONE textual selection from the specification ' +
    'likely to surface an interesting parser behavior (cross-column boundary, ' +
    'wrap-hyphen across line break, claim-language adjacency, repetitive ' +
    'language patterns). Return STRICT JSON ONLY (no markdown fences, no ' +
    'commentary). Required fields: caseId (string), patentId (string matching ' +
    '^[A-Z]{2}\\d+[A-Z]?\\d*$), selectedText (string, verbatim substring of ' +
    'the excerpt, ' + SELECTION_MIN_CHARS + '-' + SELECTION_MAX_CHARS +
    ' characters), category (one of: modern-short, modern-long, claims, ' +
    'cross-column, repetitive), rationale (one sentence explaining why this ' +
    'selection is interesting).';
  const userPrompt =
    `Patent: ${patent?.id ?? 'unknown'} (category hint: ${patent?.category ?? 'unknown'})\n` +
    `Spec excerpt (body description starts at page ${bodyStartPage ?? 1}):\n` +
    '---\n' +
    `${specExcerpt ?? ''}\n` +
    '---\n' +
    'Return ONLY the JSON object. selectedText MUST be a verbatim substring ' +
    'of the excerpt above (no paraphrasing, no quotation marks added or removed).';
  return { systemPrompt, userPrompt };
}

/**
 * Validate the parsed LLM output against the strict-JSON contract.
 *
 * Checks:
 *   - JSON.parse succeeds
 *   - all 5 REQUIRED_SELECTION_FIELDS present, each a non-empty string
 *   - patentId matches PATENT_ID_RE
 *   - selectedText length in [SELECTION_MIN_CHARS, SELECTION_MAX_CHARS]
 *
 * Extra fields are tolerated (forward-compatible).
 *
 * @param {string} llmText  the `result` field from a successful claude -p response
 * @returns {{ ok: true, selection: object } | { ok: false, reason: string }}
 */
export function validateLlmSelection(llmText) {
  let obj;
  try {
    obj = JSON.parse(String(llmText ?? '').trim());
  } catch (e) {
    return { ok: false, reason: `JSON parse error: ${e.message}` };
  }
  if (!obj || typeof obj !== 'object') {
    return { ok: false, reason: 'JSON parse error: result is not an object' };
  }
  for (const f of REQUIRED_SELECTION_FIELDS) {
    if (typeof obj[f] !== 'string' || obj[f].length === 0) {
      return { ok: false, reason: `missing or non-string field: ${f}` };
    }
  }
  if (!PATENT_ID_RE.test(obj.patentId)) {
    return { ok: false, reason: `invalid patentId format: ${obj.patentId}` };
  }
  if (obj.selectedText.length < SELECTION_MIN_CHARS) {
    return {
      ok: false,
      reason: `selectedText too short (< ${SELECTION_MIN_CHARS}): length=${obj.selectedText.length}`,
    };
  }
  if (obj.selectedText.length > SELECTION_MAX_CHARS) {
    return {
      ok: false,
      reason: `selectedText too long (> ${SELECTION_MAX_CHARS}): length=${obj.selectedText.length}`,
    };
  }
  return { ok: true, selection: obj };
}

/**
 * Map an iteration outcome triple to one of the 4 classification strings
 * the LLM-mode report tallies. The 5th string ('LLM_API_ERROR') is set
 * directly by the driver in scripts/e2e-explore.mjs when claude -p itself
 * fails — it never reaches this function.
 *
 * Decision tree:
 *   - hallucinationPassed=false → 'LLM_HALLUCINATED_SELECTION'
 *     (LLM picked text not in the spec — plugin was NOT invoked)
 *   - hallucinationPassed=true, citation falsy → 'WRONG_CITATION'
 *     (plugin saw valid selection but produced no citation — closest
 *      classification in the LLM-mode taxonomy; not NO_CITATION_PRODUCED
 *      because that code lives in the deterministic taxonomy)
 *   - verifierStatus='pass' → 'PASS'
 *   - verifierStatus='disagree' → 'VERIFIER_DISAGREE'
 *   - any other verifierStatus → 'WRONG_CITATION' (defensive default)
 *
 * @param {{ hallucinationPassed:boolean, citation?:string|null, verifierStatus?:string|null }} input
 * @returns {'PASS'|'WRONG_CITATION'|'VERIFIER_DISAGREE'|'LLM_HALLUCINATED_SELECTION'}
 */
export function classifyIteration({ hallucinationPassed, citation, verifierStatus } = {}) {
  if (!hallucinationPassed) return 'LLM_HALLUCINATED_SELECTION';
  if (!citation) return 'WRONG_CITATION';
  if (verifierStatus === 'pass') return 'PASS';
  if (verifierStatus === 'disagree') return 'VERIFIER_DISAGREE';
  return 'WRONG_CITATION';
}

/**
 * Ledger-wrapped entry point for all triage LLM calls. Composes
 * `invokeClaudeP` + `parseClaudeResponse` (Phase 31 primitives) with
 * the `readLedger` / `checkSpendCap` / `checkPhaseSpendCap` / `appendLedgerEntry`
 * primitives from Phase 31/32 (`tests/e2e/lib/llm-ledger.js`).
 *
 * THIS IS THE SOLE ALLOWED ENTRY POINT for triage-classifier code into
 * the `claude -p` subprocess. Direct `invokeClaudeP` calls from
 * `tests/e2e/lib/triage-classifier.js` are forbidden by the ESLint D-07
 * rule in Plan 34-05.
 *
 * D-05: lives alongside `invokeClaudeP` in `tests/e2e/lib/llm-driver.js`
 * (no new module file for a single wrapper function).
 *
 * D-06 execution order:
 *   1. CI gate — short-circuits if `process.env.CI === 'true'` or
 *      `process.env.GITHUB_ACTIONS === 'true'` (subscription-local invariant,
 *      TRIAGE-04). No ledger write, no subprocess spawn.
 *   2. Pre-flight spend caps — reads ledger, checks monthly cap via
 *      `checkSpendCap` and per-phase cap via `checkPhaseSpendCap`. If either
 *      returns `status: 'block'`, returns `{ok:false, capBlocked:true}`.
 *      No subprocess spawn.
 *   3. Subprocess — delegates to `invokeClaudeP`.
 *   4. Cost extraction — `parsed.costUsd ?? 0` (Pitfall 6: trust the
 *      pre-computed `total_cost_usd` field).
 *   5. Ledger append — UNCONDITIONAL (Pitfall 8: see comment below).
 *   6. Return parsed result + cost.
 *
 * References:
 *   - D-05/D-06 in `.planning/phases/34-hybrid-triage-classifier/34-CONTEXT.md`
 *   - Pitfall 8 in `.planning/research/PITFALLS.md` (cost non-zero on is_error)
 *
 * @param {{
 *   systemPrompt: string,
 *   userPrompt: string,
 *   timeoutMs?: number,
 *   phase?: string,
 *   source?: string,
 * }} opts
 * @returns {Promise<
 *   {ok:true, llmText:string, modelId:string, costUsd:number, rawJson:object|null}
 *   | {ok:false, ciGate:true, message:string}
 *   | {ok:false, capBlocked:true, monthly:object, phaseCap:object}
 *   | {ok:false, errorReason:string, llmText:null, modelId:string, costUsd:number, rawJson:object|null}
 * >}
 */
export async function invokeClaudePWithLedger({
  systemPrompt,
  userPrompt,
  timeoutMs = LLM_TIMEOUT_MS,
  phase,
  source,
} = {}) {
  // Step 1 — CI gate (defense-in-depth: subscription-local invariant TRIAGE-04).
  // Returns immediately, no subprocess spawn, no ledger entry written.
  if (process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true') {
    return {
      ok: false,
      ciGate: true,
      message: 'invokeClaudePWithLedger refused: subscription-local invariant (CI detected)',
    };
  }

  // Step 2 — Pre-flight spend caps. Read ledger once, check monthly and phase
  // caps. Either cap at 'block' prevents the subprocess from spawning.
  const ledger = readLedger(LEDGER_PATH);
  const monthly = checkSpendCap(ledger);
  const phaseCap = phase ? checkPhaseSpendCap(ledger, phase) : { status: 'ok' };
  if (monthly.status === 'block' || phaseCap.status === 'block') {
    return {
      ok: false,
      capBlocked: true,
      monthly,
      phaseCap,
    };
  }

  // Step 3 — Invoke the subprocess.
  const claudeResult = await invokeClaudeP({ systemPrompt, userPrompt, timeoutMs });
  const parsed = parseClaudeResponse(claudeResult);

  // Step 4 — Extract cost and model. Pitfall 6: trust pre-computed total_cost_usd.
  const costUsd = parsed.costUsd ?? 0;
  const modelId = parsed.modelId ?? 'unknown';

  // Step 5 — Append to ledger ALWAYS (Pitfall 8: cost may be 0 on hard
  // failures but is still recorded for forensic reconciliation).
  // Phase 46-01 (AUTOFIX-06): self-tag transport so forensic greps over the
  // committed ledger don't have to infer subscription-vs-sdk by absence.
  appendLedgerEntry(LEDGER_PATH, {
    iso: new Date().toISOString(),
    model: modelId,
    cost_usd: costUsd,
    tokens_in: parsed.rawJson?.usage?.input_tokens ?? 0,
    tokens_out: parsed.rawJson?.usage?.output_tokens ?? 0,
    phase,
    transport: 'subscription',
    source,
  });

  // Step 6 — Return parsed result with cost.
  if (parsed.ok) {
    return {
      ok: true,
      llmText: parsed.llmText,
      modelId,
      costUsd,
      rawJson: parsed.rawJson ?? null,
    };
  }
  return {
    ok: false,
    errorReason: parsed.errorReason,
    llmText: null,
    modelId,
    costUsd,
    rawJson: parsed.rawJson ?? null,
  };
}

/**
 * Phase 39 (LEDGER-03 + CLEANUP-04 partial) — SDK transport with INVERSE CI gate.
 *
 * Sibling of invokeClaudePWithLedger. v3.1's invokeClaudePWithLedger refuses
 * to run in CI (subscription-local invariant TRIAGE-04, line 384). This SDK
 * wrapper is the OPPOSITE: refuses to run UNLESS CI=true OR forceApi=true.
 *
 * Both wrappers share LEDGER_PATH and the cap-precheck primitives — the
 * transport: 'sdk' tag distinguishes ledger entries for combinedMonthlyTotal
 * forensic greps. Per CONTEXT-locked default model: claude-sonnet-4-6.
 *
 * Pitfall mitigations:
 *   - Pitfall 2 (cost-runaway): 4 cap prechecks (monthly + day + issue + PR)
 *     before SDK invocation; refusal does NOT consume API budget
 *   - Pitfall 8 (always-append): ledger entry written on success, sdk_error,
 *     AND the SDK error try-catch path (so failed calls still leave forensic
 *     trace even if the API charged for the partial generation)
 *
 * D-06 execution order (mirrors invokeClaudePWithLedger):
 *   1. INVERSE CI gate — short-circuits if not CI && !forceApi (no SDK call, no ledger entry)
 *   2. Pre-flight caps — monthly + day + (issue if issueId) + (PR if prNumber) + (phase if phase)
 *   3. SDK call — client.messages.create wrapped in try/catch
 *   4. Cost — fallbackCostUsd(response.model, in_tokens, out_tokens) since SDK has no total_cost_usd field
 *   5. Append — UNCONDITIONAL (success or sdk_error)
 *   6. Return parsed result
 *
 * @param {{
 *   systemPrompt?: string,     string-form system prompt; Phase 39 default path.
 *                              Mutually-or with systemBlocks (one of the two
 *                              MUST be provided).
 *   systemBlocks?: Array<{type:'text', text:string, cache_control?:{type:'ephemeral', ttl:'5m'|'1h'}}>,
 *                              Phase 42 Pitfall 6 fix — array-form system field
 *                              that lets cache_control take effect. When
 *                              supplied, takes precedence over systemPrompt.
 *                              The Anthropic SDK silently drops cache_control
 *                              from the string form, killing prompt-cache
 *                              savings; the array form is the structural fix.
 *   userPrompt: string,
 *   model?: string,            default 'claude-sonnet-4-6' (CONTEXT lock)
 *   maxTokens?: number,        default 4096
 *   timeoutMs?: number,        default 120_000 (2 min — code-fix prompts)
 *   phase?: string,
 *   issueId?: string,          e.g., 'issue-123' — engages per-issue cap
 *   prNumber?: number,         e.g., 456 — engages per-PR cap
 *   forceApi?: boolean,        local override; default false
 * }} opts
 * @returns {Promise<
 *   {ok:true, llmText:string, modelId:string, costUsd:number, rawJson:object}
 *   | {ok:false, ciGate:true, message:string}
 *   | {ok:false, capBlocked:true, monthly, day, issue, pr, phaseCap}
 *   | {ok:false, errorReason:'sdk_error', errorMessage:string}
 *   | {ok:false, errorReason:'contract-error', errorMessage:string}
 * >}
 */
export async function invokeAnthropicSdkWithLedger({
  systemPrompt,
  systemBlocks,
  userPrompt,
  model = 'claude-sonnet-4-6',
  maxTokens = 4096,
  timeoutMs = 120_000,
  phase,
  issueId,
  prNumber,
  forceApi = false,
} = {}) {
  const inCi = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';

  // Step 0a — PRE-02 leak guard (Phase 48). LEDGER_PATH resolves to the
  // committed file when E2E_LEDGER_PATH_OVERRIDE is unset (the IIFE at
  // module-load time), so any local forceApi:true call without the override
  // would pollute the committed ledger. Throw BEFORE any ledger code path.
  // Plain Error per D-02; message string is locked verbatim.
  if (forceApi === true && !inCi && !process.env.E2E_LEDGER_PATH_OVERRIDE) {
    throw new Error('invokeAnthropicSdkWithLedger: forceApi:true blocked outside CI without E2E_LEDGER_PATH_OVERRIDE. Set E2E_LEDGER_PATH_OVERRIDE=<tmpfile> to redirect ledger writes, or run inside CI. Prevents committed-ledger pollution.');
  }

  // Step 0 — Contract guard (Phase 42 Plan 02 — Pitfall 6 driver extension).
  // At least one of {systemPrompt, systemBlocks} MUST be supplied. We check
  // BEFORE the CI gate so the contract violation is unambiguous in unit tests
  // that run without CI=true. systemBlocks takes precedence when both are
  // supplied (the array-form is the cache_control-enabled path).
  const hasSystemPrompt = typeof systemPrompt === 'string' && systemPrompt.length > 0;
  const hasSystemBlocks = Array.isArray(systemBlocks) && systemBlocks.length > 0;
  if (!hasSystemPrompt && !hasSystemBlocks) {
    return {
      ok: false,
      errorReason: 'contract-error',
      errorMessage:
        'invokeAnthropicSdkWithLedger requires one of systemBlocks (array form, ' +
        'enables cache_control) or systemPrompt (back-compat string form).',
    };
  }

  // Step 1 — INVERSE CI gate
  if (!inCi && !forceApi) {
    return {
      ok: false,
      ciGate: true,
      message:
        'invokeAnthropicSdkWithLedger refused: not in CI and forceApi:false. ' +
        'Use invokeClaudePWithLedger for the local subscription transport.',
    };
  }

  // Step 2 — Cap prechecks (4 sub-caps: monthly, day, issue, PR + phase)
  const ledger = readLedger(LEDGER_PATH);
  const monthly = checkSpendCap(ledger);
  const day = checkDayCap(ledger);
  const issue = issueId ? checkIssueCap(ledger, issueId) : { status: 'ok' };
  const pr = prNumber ? checkPrCap(ledger, prNumber) : { status: 'ok' };
  const phaseCap = phase ? checkPhaseSpendCap(ledger, phase) : { status: 'ok' };

  if (
    monthly.status === 'block' || day.status === 'block' ||
    issue.status === 'block' || pr.status === 'block' || phaseCap.status === 'block'
  ) {
    return { ok: false, capBlocked: true, monthly, day, issue, pr, phaseCap };
  }

  // Step 3 — SDK call
  const client = new Anthropic({ maxRetries: 2, timeout: timeoutMs });
  let response;
  try {
    response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      // Pitfall 6: array-form systemBlocks (when supplied) carries
      // cache_control through to the SDK. String-form systemPrompt is the
      // Phase 39 back-compat path.
      system: hasSystemBlocks ? systemBlocks : systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });
  } catch (err) {
    // Pitfall 8 — record failed call so the ledger reflects every attempt,
    // even if the SDK threw before extracting usage (cost recorded as 0).
    appendLedgerEntry(LEDGER_PATH, {
      iso: new Date().toISOString(),
      model,
      cost_usd: 0,
      tokens_in: 0,
      tokens_out: 0,
      phase,
      transport: 'sdk',
      issueId,
      prNumber,
      source: 'auto-fix-api',
      error: String(err && err.message ? err.message : err).slice(0, 200),
    });
    return {
      ok: false,
      errorReason: 'sdk_error',
      errorMessage: String(err && err.message ? err.message : err),
    };
  }

  // Step 4 — Cost from usage (no total_cost_usd on the SDK path)
  const inputTokens = response.usage && Number.isFinite(response.usage.input_tokens)
    ? response.usage.input_tokens : 0;
  const outputTokens = response.usage && Number.isFinite(response.usage.output_tokens)
    ? response.usage.output_tokens : 0;
  const cacheCreation = response.usage && Number.isFinite(response.usage.cache_creation_input_tokens)
    ? response.usage.cache_creation_input_tokens : 0;
  const cacheRead = response.usage && Number.isFinite(response.usage.cache_read_input_tokens)
    ? response.usage.cache_read_input_tokens : 0;
  const costUsd = fallbackCostUsd(response.model, inputTokens, outputTokens);

  // Step 5 — ALWAYS append (Pitfall 8)
  appendLedgerEntry(LEDGER_PATH, {
    iso: new Date().toISOString(),
    model: response.model,
    cost_usd: costUsd,
    tokens_in: inputTokens,
    tokens_out: outputTokens,
    cache_creation_tokens: cacheCreation,
    cache_read_tokens: cacheRead,
    phase,
    transport: 'sdk',
    issueId,
    prNumber,
    source: 'auto-fix-api',
  });

  // Step 6 — Return
  const llmText =
    response.content && response.content[0] && response.content[0].type === 'text'
      ? response.content[0].text
      : '';
  return {
    ok: true,
    llmText,
    modelId: response.model,
    costUsd,
    rawJson: response,
  };
}

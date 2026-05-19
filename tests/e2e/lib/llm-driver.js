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

    const timer = setTimeout(() => {
      try { child.kill('SIGTERM'); } catch { /* already exited */ }
      finish({ timedOut: true, stdout: '', stderr, code: null });
    }, timeoutMs);

    child.on('close', (code) => {
      clearTimeout(timer);
      finish({ timedOut: false, stdout, stderr, code });
    });
    child.on('error', (err) => {
      clearTimeout(timer);
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

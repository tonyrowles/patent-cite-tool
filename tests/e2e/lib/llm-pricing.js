// tests/e2e/lib/llm-pricing.js
//
// Phase 31 (LLM-05) — per-model pricing rate-card constants.
//
// IMPORTANT: This module exists ONLY as a fallback. The canonical path
// for cost tracking is the `total_cost_usd` field from `claude -p
// --output-format json` responses (see 31-RESEARCH.md Pattern 2 +
// Pitfall 6). That field already accounts for input tokens, output
// tokens, 1h ephemeral cache creation, and cache reads at their
// respective tiers — the formula is opaque and Claude's own pricing
// is authoritative.
//
// Use `fallbackCostUsd` only when a claude -p response is missing the
// `total_cost_usd` field (should never happen in subscription mode —
// RESEARCH.md confirms the field is always present in healthy responses).
// Even on `is_error: true`, total_cost_usd is typically present.
//
// Rates last updated: 2026-05 (per Anthropic public pricing for Opus 4.7
// and Sonnet 4.5). Update by editing PRICING_BY_MODEL below; do NOT
// inline these numbers anywhere else.

/**
 * Pricing rates per 1 million tokens, keyed by model identifier as it
 * appears in `Object.keys(claudePResponse.modelUsage)[0]`.
 *
 * Per RESEARCH.md Pattern 2, the modelUsage key is e.g. "claude-opus-4-7[1m]"
 * (the [1m] suffix indicates the 1-million-token context window variant).
 * Treat the keys as opaque strings.
 *
 * The `default` entry is the fallback when an unknown model ID arrives —
 * we err on the side of the more expensive Opus pricing so cost is not
 * under-counted in the ledger.
 *
 * @type {Readonly<Record<string, Readonly<{ input_per_mtok: number, output_per_mtok: number }>>>}
 */
export const PRICING_BY_MODEL = Object.freeze({
  'claude-opus-4-7[1m]':   Object.freeze({ input_per_mtok: 15, output_per_mtok: 75 }),
  'claude-opus-4-7':       Object.freeze({ input_per_mtok: 15, output_per_mtok: 75 }),
  'claude-sonnet-4-5':     Object.freeze({ input_per_mtok: 3,  output_per_mtok: 15 }),
  'default':               Object.freeze({ input_per_mtok: 15, output_per_mtok: 75 }),
});

/**
 * Compute a fallback cost estimate from token counts. Used ONLY when
 * `total_cost_usd` is missing from a claude -p response (extremely rare).
 *
 * @param {string} modelId model identifier (e.g. "claude-opus-4-7[1m]")
 * @param {number} inputTokens
 * @param {number} outputTokens
 * @returns {number} cost in USD (inputs treated as 0 when negative or NaN)
 */
export function fallbackCostUsd(modelId, inputTokens, outputTokens) {
  const rates = PRICING_BY_MODEL[modelId] ?? PRICING_BY_MODEL.default;
  const safeIn = Number.isFinite(inputTokens) && inputTokens > 0 ? inputTokens : 0;
  const safeOut = Number.isFinite(outputTokens) && outputTokens > 0 ? outputTokens : 0;
  const cost =
    (safeIn / 1_000_000) * rates.input_per_mtok +
    (safeOut / 1_000_000) * rates.output_per_mtok;
  // Round to 6dp for parity with appendLedgerEntry's float-drift guard.
  return +cost.toFixed(6);
}

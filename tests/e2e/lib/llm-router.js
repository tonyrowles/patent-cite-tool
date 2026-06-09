// tests/e2e/lib/llm-router.js
//
// Phase 54 Plan 01 (AB-01) — pure-function ERROR_CLASS → model SLUG router.
//
// PURPOSE
// -------
// Deterministic per-ERROR_CLASS model routing for the v4.0 self-healing
// auto-fix loop. Given an ERROR_CLASS string (from the RPT-02 enum used
// elsewhere in tests/e2e/lib/error-codes.js), returns the model SLUG that
// `invokeAnthropicSdkWithLedger` will pass to the Anthropic SDK as its
// `model` argument:
//
//   GOOGLE_DOM_DRIFT             → 'claude-opus-4-7'
//   LLM_HALLUCINATED_SELECTION   → 'claude-opus-4-7'
//   <every other class>          → 'claude-sonnet-4-6'  (default fallthrough)
//
// RATIONALE
// ---------
// Per .planning/research/SUMMARY.md §A/B and the Phase 54 SC-1 lock:
//   - claude-sonnet-4-6 is the faster + cheaper default. It is competent on
//     the bulk of ERROR_CLASS values (WRONG_CITATION, WORKER_FALLBACK_FAILED,
//     HARNESS_ERROR) where the fix surface is small and the failure mode is
//     mechanical.
//   - claude-opus-4-7 is reserved for the two ERROR_CLASS values that require
//     deeper reasoning over a larger DOM/spec context: GOOGLE_DOM_DRIFT
//     (Google Patents DOM change requiring new selector synthesis) and
//     LLM_HALLUCINATED_SELECTION (a hallucination-correction loop that needs
//     a more capable model to break the self-reinforcing pattern).
//
// AB-04 WINNER-DECLARATION INVARIANT
// -----------------------------------
// The routing table is `Object.freeze()`'d so it cannot drift mid-A/B-period.
// Phase 54 AB-04's a-b-winner.mjs script computes per-class pass rates per
// model arm. Mutating MODEL_ROUTES during a sampling window would invalidate
// the comparison (the ledger entries from before-the-edit and after-the-edit
// would not be comparable). Strict-mode mutation attempts throw TypeError —
// pinned by tests/unit/llm-router.test.js Test 9 (Object.isFrozen).
//
// D-04 TRANSPORT-CONFUSION ISOLATION
// -----------------------------------
// This module has ZERO imports — no src/, no sibling tests/e2e/lib/* (which
// include transport-layer code like llm-driver.js), and no @anthropic-ai/sdk.
// `node:*` imports are permitted by D-04 but unneeded for pure-function
// routing. Pure module: same input → same output, no I/O, no side effects.

/**
 * Frozen ERROR_CLASS → model SLUG routing table.
 *
 * Only ERROR_CLASS values that route to a non-default (opus) model are listed.
 * Every other class falls through to `claude-sonnet-4-6` via `routeModel`'s
 * `??` null-coalesce — WRONG_CITATION, WORKER_FALLBACK_FAILED, HARNESS_ERROR,
 * FLAKE, LLM_API_ERROR, PASS, and any future ERROR_CLASS values not yet
 * keyed here all default to sonnet.
 *
 * `Object.freeze()` guarantees: any runtime mutation throws TypeError in
 * strict mode (ES modules are always strict). This preserves the AB-04
 * winner-declaration invariant — the routing decision is a constant for
 * the lifetime of the process.
 *
 * Phase 65 Plan 01 (SCAF-01..02) — 5-site drift-guard satisfier comments.
 * The Plan 02 drift guard test accepts EITHER a MODEL_ROUTES entry OR a
 * `// MODEL_DEFAULT_OK: <CLASS>` comment as satisfaction. The two new
 * Phase 65 scaffold classes route through the `??` fallthrough to sonnet
 * (no MODEL_ROUTES entry needed) and are annotated here:
 *
 * // MODEL_DEFAULT_OK: VERIFIER_DISAGREE — defaults to claude-sonnet-4-6
 *   (Phase 65 SCAF-01; Verifier-disagreement fixes target the citation
 *   pipeline's column/line-counting logic — mechanical, sonnet-suitable).
 * // MODEL_DEFAULT_OK: FRAME_SHIFT_DETECTED — defaults to claude-sonnet-4-6
 *   (Phase 65 SCAF-02; pdfjs frame-mapping fixes adapt to the new pdfjs-dist
 *   API shape — also mechanical, do not require opus reasoning).
 *
 * Phase 65 Plan 02 follow-up — pre-existing sonnet-routed scaffolds also need
 * MODEL_DEFAULT_OK annotations to satisfy the 5-site drift guard:
 *
 * // MODEL_DEFAULT_OK: WRONG_CITATION — defaults to claude-sonnet-4-6
 *   (Phase 42 baseline; cite-by-position fixes are mechanical src/-side edits).
 * // MODEL_DEFAULT_OK: WORKER_FALLBACK_FAILED — defaults to claude-sonnet-4-6
 *   (Phase 45 baseline; Worker MIME-guard + retry-budget fixes are mechanical).
 * // MODEL_DEFAULT_OK: HARNESS_ERROR — defaults to claude-sonnet-4-6
 *   (Phase 45 baseline; harness-infra fixes are mechanical tests/ edits).
 */
export const MODEL_ROUTES = Object.freeze({
  GOOGLE_DOM_DRIFT: 'claude-opus-4-7',
  LLM_HALLUCINATED_SELECTION: 'claude-opus-4-7',
});

/**
 * Route an ERROR_CLASS string to its assigned model SLUG.
 *
 * Pure function: no I/O, no environment reads, no side effects. Same input
 * always yields the same output. Safe to call from any module, including
 * other pure-function libraries.
 *
 * Null-safety: `null`, `undefined`, and any unknown ERROR_CLASS value all
 * fall through to the sonnet default via `??`. This is by design — the
 * routing table is intentionally sparse (only opus-routed classes are keyed)
 * so adding a new ERROR_CLASS to the codebase does not require an llm-router
 * edit; it automatically gets sonnet routing.
 *
 * @param {string|null|undefined} errorClass — one of the RPT-02 enum strings
 *   (e.g. 'WRONG_CITATION', 'GOOGLE_DOM_DRIFT'), or anything else.
 * @returns {'claude-sonnet-4-6' | 'claude-opus-4-7'} the model SLUG to pass
 *   into `invokeAnthropicSdkWithLedger({ model: ... })`.
 */
export function routeModel(errorClass) {
  return MODEL_ROUTES[errorClass] ?? 'claude-sonnet-4-6';
}

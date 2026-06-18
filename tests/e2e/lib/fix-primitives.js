// tests/e2e/lib/fix-primitives.js
//
// Phase 12 Plan 01 (D-02) — Shared diff primitives extracted from
// scripts/auto-fix.mjs for reuse by both the v4.0 dispatcher (auto-fix.mjs)
// and the v6.1 report-fix dispatcher (scripts/report-fix.mjs).
//
// PURITY INVARIANT: NO node:fs, NO node:child_process, NO node:path,
//   NO @anthropic-ai/sdk imports. Same purity discipline as fix-prompt-builder.js.
//   git apply --check and the actual git apply ARE in the dispatcher, not here.
//   ESLint per-file block in eslint.config.js covers the same 4 restricted
//   imports (PROMPT-04 pattern). Vitest purity pin in fix-primitives.test.js
//   asserts absence at the source-text level (T-12-02).
//
// Exports:
//   parseFencedDiff(llmText)       — extract single unified diff between fences
//   changedPathsFromDiff(diff)     — extract deduped changed path list
//   DIFF_FENCE_START               — re-exported from fix-prompt-builder.js
//   DIFF_FENCE_END                 — re-exported from fix-prompt-builder.js

import { DIFF_FENCE_START, DIFF_FENCE_END } from './fix-prompt-builder.js';

// Re-export constants so callers have one import target (D-02)
export { DIFF_FENCE_START, DIFF_FENCE_END };

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

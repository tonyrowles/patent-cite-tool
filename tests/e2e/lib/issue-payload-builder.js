// Phase 35 Plan 35-01 (ISSUE-01, ISSUE-04) — pure-function rich issue payload builder.
//
// D-01: tests/e2e/lib/issue-payload-builder.js — peer to triage-classifier.js / rerun-validator.js.
// D-02: body line 1 is `<!-- fp: <12-hex> -->` HTML comment (Pitfall 1 overflow protection).
// D-03: per-section char budgets enforced inside the builder (LLM rationale ≤800,
//       verifier windows ≤600 each, golden diff ≤400) — ISSUE-04.
// D-04: PURE — same inputs → same output (string). No fs, path, child_process. No crypto:
//       the CLI computes the fingerprint and passes it in as a parameter.
// T-29-02-2: LLM-derived text (rationale, verifier reason) wrapped in fenced code blocks
//       to neutralize markdown injection (## HEADER renders as code, not as a header).

// ---------------------------------------------------------------------------
// Budget constants (exported for test reuse — D-03 / ISSUE-04)
// ---------------------------------------------------------------------------

/** Max chars for LLM Rationale section text (D-03, ISSUE-04). */
export const BUDGET_LLM_RATIONALE = 800;

/** Max chars per verifier-window text block in Verifier Disagreement (D-03, ISSUE-04). */
export const BUDGET_VERIFIER_WINDOW = 600;

/** Max chars for Golden Diff section text (D-03, ISSUE-04). */
export const BUDGET_GOLDEN_DIFF = 400;

/** Canonical truncation suffix (tests check body.includes(TRUNCATION_SUFFIX.trim())). */
export const TRUNCATION_SUFFIX = '\n…[truncated, full content in artifacts]';

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Truncate text to fit within budget chars, appending TRUNCATION_SUFFIX if cut.
 * Returns '' for non-string input. Guarantees: returned.length <= budget.
 */
function truncate(text, budget) {
  if (typeof text !== 'string') return '';
  if (text.length <= budget) return text;
  return text.slice(0, budget - TRUNCATION_SUFFIX.length) + TRUNCATION_SUFFIX;
}

/** Wrap user-derived text in a fenced code block (T-29-02-2 markdown injection defense). */
function fenceCode(text) {
  return ['```', text, '```'].join('\n');
}

/**
 * Produce a unified-diff-style comparison between observed and golden citations.
 * Returns a null-golden sentinel when no baseline is available.
 */
function formatGoldenDiff(observed, golden) {
  if (golden == null) return '(no golden baseline available)';
  if (observed === golden) return '(observed matches golden — should not happen for a CONFIRMED finding)';
  return ['- ' + golden, '+ ' + observed].join('\n');
}

// ---------------------------------------------------------------------------
// Budget accounting for section envelopes
//
// LLM Rationale section text (extractSection output) layout:
//   \n\n```\n{rationale}\n```\nconfidence: {conf}\n  (~28 chars overhead)
//   40-char conservative overhead leaves 760 chars for rationale text.
//
// Verifier window (fenced text content between ``` markers):
//   fenceStart = idx+3; fenceEnd = closing ``` idx
//   window = \n{reason}\n  → reason.length + 2
//   Budget reason at BUDGET_VERIFIER_WINDOW - 2 = 598.
//
// Golden Diff section text (last section, no following header):
//   \n\n{diff_content}  (~3-5 chars overhead)
//   5-char conservative overhead leaves 395 chars for diff content.
// ---------------------------------------------------------------------------

const OVERHEAD_LLM_SECTION    = 40; // fence + confidence line envelope
const OVERHEAD_GOLDEN_SECTION =  5; // \n\n prefix + optional trailing \n

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Build a GitHub issue payload from triage + LLM iteration data.
 *
 * Pure function — same inputs → same output. No I/O, no side effects (D-04).
 *
 * @param {object} params
 * @param {object} params.triageFinding  Phase 34 triage-report.json finding
 * @param {object} params.iteration      llm-report.json iteration
 * @param {object|null|undefined} params.rerunEntry  rerun-report.json replay (null = NOT_REPLAYABLE)
 * @param {string|null} params.goldenCitation  golden baseline citation or null
 * @param {string} params.reproducerCmd  CLI reproducer command
 * @param {string} params.fingerprint    12-hex fingerprint (computed by CLI)
 * @returns {{ title: string, body: string, labels: string[] }}
 */
export function buildIssuePayload({
  triageFinding,
  iteration,
  rerunEntry,
  goldenCitation,
  reproducerCmd,
  fingerprint,
}) {
  // Derived values
  const caseId    = iteration?.case_id ?? iteration?.llm_selection?.patentId ?? 'UNKNOWN';
  const category  = triageFinding?.category ?? 'UNCLASSIFIED';
  const seed      = iteration?.seed ?? 'n/a';
  const citation  = iteration?.citation ?? 'n/a';
  const verdict   = iteration?.verifier_verdict ?? {};
  const tierUsed  = verdict?.tier_used ?? 'n/a';
  const reason    = verdict?.reason ?? '';
  const rationale = triageFinding?.rationale ?? '';
  const confidence = triageFinding?.confidence ?? 0;

  // Title (D-04, same convention as buildIssueTitle in e2e-report-issue.mjs)
  const title = `[e2e-nightly] ${caseId}: ${category}`;

  // Section: Reproducer (no budget — short by construction)
  const reproducerSection = [
    '### Reproducer',
    '',
    reproducerCmd ?? '',
    `case-id: ${caseId}`,
    `seed: ${seed}`,
  ].join('\n');

  // Section: Verifier Disagreement
  // Window 2 (observed + reason): fence content = \n{reason}\n → length = reason.length + 2.
  // Budget reason at BUDGET_VERIFIER_WINDOW - 2 so fenced window fits within 600.
  const truncatedReason = truncate(reason, BUDGET_VERIFIER_WINDOW - 2);
  const rerunLine = rerunEntry
    ? `Rerun verdict: ${rerunEntry.verdict} (${rerunEntry.confirmed_count}/${rerunEntry.total_runs})`
    : 'Rerun verdict: not replayable';

  const verifierSection = [
    '### Verifier Disagreement',
    '',
    `Expected citation (golden): \`${goldenCitation ?? 'n/a'}\``,
    `Observed citation: \`${citation}\``,
    fenceCode(truncatedReason),
    `Verifier tier: ${tierUsed}`,
    rerunLine,
  ].join('\n');

  // Section: LLM Rationale (section text ≤ BUDGET_LLM_RATIONALE)
  // Envelope overhead ~40 chars (fence + confidence line), leaving 760 for rationale.
  const truncatedRationale = truncate(rationale, BUDGET_LLM_RATIONALE - OVERHEAD_LLM_SECTION);

  const llmSection = [
    '### LLM Rationale',
    '',
    fenceCode(truncatedRationale),
    `confidence: ${confidence}`,
  ].join('\n');

  // Section: Golden Diff (section text ≤ BUDGET_GOLDEN_DIFF)
  // Envelope overhead ~5 chars (\n\n prefix), leaving 395 for diff content.
  const rawDiff        = formatGoldenDiff(citation, goldenCitation);
  const truncatedDiff  = truncate(rawDiff, BUDGET_GOLDEN_DIFF - OVERHEAD_GOLDEN_SECTION);

  const goldenSection = [
    '### Golden Diff',
    '',
    truncatedDiff,
  ].join('\n');

  // Body assembly (D-02): line 1 MUST be the fingerprint HTML comment — no preceding bytes.
  const body = [
    `<!-- fp: ${fingerprint} -->`,
    '',
    reproducerSection,
    '',
    verifierSection,
    '',
    llmSection,
    '',
    goldenSection,
  ].join('\n');

  // Labels (D-04 exact order)
  const labels = [category, 'e2e-nightly', 'triage'];

  return { title, body, labels };
}

// scripts/parse-affected-cases.mjs
//
// Phase 41 Plan 41-01 — VFY-GATE-01 (affected-cases parser). Pure-function
// extractor for case IDs declared by PR authors via an HTML comment in the
// PR body: `<!-- affected_cases: id1,id2 -->`.
//
// Consumers:
//   - Plan 41-03 v40-verifier-gate.yml — pipes `gh pr view --json body --jq '.body'`
//     into this script's stdin; reads space-separated IDs from stdout to drive
//     the 3× consecutive verify loop.
//   - (Future) Any other workflow that needs to know which 76-case tests must
//     pass before flipping a draft PR to ready-for-review.
//
// PURE: no node:fs, no node:child_process, no env reads. Only side effects
// are stdin/stdout/exit when invoked as a CLI. Same purity discipline as
// scripts/issue-payload-builder.js.
//
// Supported input shapes (per 41-CONTEXT decisions):
//   1. Single-line:   '<!-- affected_cases: US123-1,US456-2 -->'
//   2. Multi-line:    '<!-- affected_cases:\nUS123-1\nUS456-2\n-->'
//   3. Whitespace:    '<!--   affected_cases:   US123-1 ,  US456-2   -->'
//
// Robustness contract: returns `string[]` ALWAYS. Never null, never
// undefined. Empty input, null input, missing comment, or empty inner
// content all return [].
//
// CLI contract:
//   stdin:  PR body text (typically `gh pr view --json body --jq '.body'`)
//   stdout: space-separated case IDs followed by a newline (empty string +
//           newline when no IDs are found)
//   exit:   0 always (no IDs is a valid input — caller decides what to do)

// Anchored regex: `<!--` + optional whitespace + `affected_cases` + optional
// whitespace + `:` + optional whitespace + lazy capture of inner content +
// optional whitespace + `-->`. The `[\s\S]*?` (NOT `.*?`) allows newlines
// inside the capture, supporting the multi-line variant. Lazy quantifier
// prevents the regex from spanning across multiple unrelated HTML comments
// in the same PR body (per Pitfall 3 — PR-author-controlled input).
const AFFECTED_CASES_RE = /<!--\s*affected_cases\s*:\s*([\s\S]*?)\s*-->/;

/**
 * Extract case IDs from a PR body string.
 *
 * @param {string|null|undefined} prBody — raw PR body markdown (PR-author-controlled)
 * @returns {string[]} — always a string array, possibly empty
 */
export function parseAffectedCases(prBody) {
  if (prBody === null || prBody === undefined) return [];
  if (typeof prBody !== 'string' || prBody.length === 0) return [];
  const match = prBody.match(AFFECTED_CASES_RE);
  if (!match || !match[1]) return [];
  const inner = match[1];
  // Split on commas AND newlines so single-line and multi-line variants
  // share one parse path; trim each token; drop empty entries (e.g., from
  // trailing commas, blank lines, or empty inner content).
  return inner
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// ---------------------------------------------------------------------------
// CLI guard — invoked as `gh pr view ... --jq '.body' | node scripts/parse-affected-cases.mjs`
// ---------------------------------------------------------------------------

if (import.meta.url === `file://${process.argv[1]}`) {
  let buf = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { buf += chunk; });
  process.stdin.on('end', () => {
    const ids = parseAffectedCases(buf);
    process.stdout.write(ids.join(' ') + '\n');
    process.exit(0);
  });
}

// END scripts/parse-affected-cases.mjs — Phase 41-01 (VFY-GATE-01)

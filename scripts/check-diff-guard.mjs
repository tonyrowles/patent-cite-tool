// scripts/check-diff-guard.mjs
//
// Phase 41 Plan 41-01 — VFY-GATE-04 (diff-guard regex bank for forbidden
// paths). Layer 2 of the 6-layer verifier-gaming defense documented in
// .planning/research/PITFALLS.md Pitfall 3 Defense 2.
//
// Purpose: pure-function regex bank + checker for paths an auto-fix agent
// (Phase 42 scripts/auto-fix.mjs per AUTOFIX-03) or a PR-side workflow
// (Plan 41-03 v40-verifier-gate.yml) must NEVER touch. This helper is
// the canonical source of truth — the workflow YAML imports it via the
// CLI shim below; Phase 42 will `import { checkDiffGuard, FORBIDDEN_PATHS }`
// for pre-`git apply` rejection.
//
// PURE: no node:fs, no node:child_process, no node:net, no env reads.
// The only side effects are CLI guard stdin/stderr/exit when invoked
// directly. Same purity discipline as scripts/issue-payload-builder.js.
//
// LOCKED forbidden paths (per 41-CONTEXT decisions, PITFALLS Pitfall 3,
// AND Phase 45-02 extension for FLAKE-01/FLAKE-02 state file integrity):
//   1. tests/test-cases.js                       — 76-case golden trigger
//   2. tests/golden/baseline.json                — golden baseline
//   3. tests/e2e/test-cases-quarantine.js        — quarantine corpus
//   4. .github/workflows/v40-*.yml               — v40 workflow namespace
//   5. tests/e2e/.llm-spend-ledger.json          — LLM cost ledger
//   6. .github/CODEOWNERS                        — CODEOWNERS itself
//   7. tests/e2e/.rerun-ring-buffer.json         — FLAKE 5-state ring buffer (Phase 45-02)
//   8. tests/e2e/.flake-suppression.json         — FLAKE_ESCALATION suppression file (Phase 45-02)
//
// CLI contract:
//   stdin:  one path per line (typically `git diff --name-only origin/main..HEAD`)
//   stdout: silent on success
//   stderr: on violation, prints:
//             Diff-guard violations:
//               <path>
//               <path>
//   exit:   0 = no violations / empty input
//           1 = ≥1 violation

/**
 * @typedef {Object} DiffGuardResult
 * @property {boolean}  ok          — true iff no path in input matches FORBIDDEN_PATHS
 * @property {string[]} violations  — every input path that matched a forbidden regex
 */

// Frozen regex bank — order matches the LOCKED list above. The v40-*.yml
// pattern uses `[^/]*` between `v40-` and `.yml` so the glob matches
// v40-deps-update.yml and v40-verifier-gate.yml but does NOT match
// e2e-nightly.yml or any non-v40 prefix (F12 test pin).
export const FORBIDDEN_PATHS = Object.freeze([
  /^tests\/test-cases\.js$/,
  /^tests\/golden\/baseline\.json$/,
  /^tests\/e2e\/test-cases-quarantine\.js$/,
  /^\.github\/workflows\/v40-[^/]*\.yml$/,
  /^tests\/e2e\/\.llm-spend-ledger\.json$/,
  /^\.github\/CODEOWNERS$/,
  /^tests\/e2e\/\.rerun-ring-buffer\.json$/,    // Phase 45-02 — FLAKE-01 ring buffer state
  /^tests\/e2e\/\.flake-suppression\.json$/,    // Phase 45-02 — FLAKE-02 suppression state
]);

/**
 * Check a set of changed paths against the forbidden bank.
 *
 * @param {string[]} changedPaths — list of repo-relative paths (no leading slash)
 * @returns {DiffGuardResult}
 */
export function checkDiffGuard(changedPaths) {
  const paths = Array.isArray(changedPaths) ? changedPaths : [];
  const violations = [];
  for (const p of paths) {
    if (typeof p !== 'string' || p.length === 0) continue;
    for (const re of FORBIDDEN_PATHS) {
      if (re.test(p)) {
        violations.push(p);
        break; // one violation per path is enough
      }
    }
  }
  return { ok: violations.length === 0, violations };
}

// ---------------------------------------------------------------------------
// CLI guard — invoked as `git diff --name-only ... | node scripts/check-diff-guard.mjs`
// ---------------------------------------------------------------------------

if (import.meta.url === `file://${process.argv[1]}`) {
  let buf = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { buf += chunk; });
  process.stdin.on('end', () => {
    const lines = buf
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    const { ok, violations } = checkDiffGuard(lines);
    if (ok) {
      process.exit(0);
    }
    process.stderr.write('Diff-guard violations:\n');
    for (const v of violations) {
      process.stderr.write('  ' + v + '\n');
    }
    process.exit(1);
  });
}

// END scripts/check-diff-guard.mjs — Phase 41-01 (VFY-GATE-04)

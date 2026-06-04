// tests/e2e/scripts/v40-verifier-gate-yaml.test.js
//
// Phase 41 Plan 41-03 (VFY-GATE-01 + VFY-GATE-02 + VFY-GATE-03 + VFY-GATE-04) —
// grep-based YAML assertions for .github/workflows/v40-verifier-gate.yml.
//
// Zero new dependencies — reads the YAML as plain text and asserts meaningful
// tokens with string/regex checks. No js-yaml, no yaml-lint. Mirrors the
// Phase 40-03 style template (tests/e2e/scripts/v40-deps-update-yaml.test.js).
//
// Test groups (per 41-03-PLAN.md + 41-RESEARCH.md Code Examples section):
//   V1-V12: core verifier-gate primitives — covers VFY-GATE-01..04
//   X1-X10: extra Pitfall defenses — negative-pins + safety
//   T1:     Layer 5 defense — test-count invariant (PR TEST_CASES length never
//           decreases vs origin/main); CONTEXT answer #2 says include it.
//
// RED-state contract: in Task 1's commit, .github/workflows/v40-verifier-gate.yml
// does NOT yet exist. beforeAll() will throw ENOENT on the readFileSync,
// failing every test in the file. The Task 1 commit is RED. Task 2 creates
// the workflow file and all cases flip GREEN.
//
// COMMENT-PARAPHRASE SCAR (Phase 40-03 — auto-fixed but cost ~30 min there):
// The X1-X6 negative-grep assertions test for absence of literal forbidden
// tokens (the skip-ci marker, the gh pr merge auto-flag, the action auto-merge
// input, the Identity-token write permission, the actions-write permission,
// and the pull-request-target trigger variant). If the workflow's header
// comments use the LITERAL tokens, those tests will FALSE-POSITIVE because
// `toContain` matches whole-file text including comments. The workflow author
// MUST paraphrase forbidden tokens in any explanatory comments (see
// 40-03-SUMMARY.md "Deviations §1 Comment-paraphrase discipline").
//
// Defenses pinned (41-RESEARCH.md + PITFALLS.md):
//   - Pitfall 3 verifier-gaming / V9, X7, T1: verifier-pin (3 files) + diff-guard bank + test-count invariant
//   - Pitfall 4 auto-merge / X1, X3, X4:       no PAT, no the gh pr merge auto-flag, no the action auto-merge input
//   - Pitfall 7 concurrency / V3:              PR-scoped group + cancel-in-progress (verifier is read-only)
//   - Pitfall 8 #4 elevation / X5, X6:         no Identity-token / actions-write permissions, no the pull-request-target trigger variant
//   - Pitfall 8 #4 gating / X2:                no continue-on-error: true in gating steps
//   - Phase 47 slot-reservation / V6:          verifier-gate job NAME is the reserved required_status_checks slot

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const YAML_PATH = path.resolve(PROJECT_ROOT, '.github/workflows/v40-verifier-gate.yml');

let yaml;

beforeAll(() => {
  // RED state: this throws ENOENT until Task 2 creates the workflow file.
  // Intentional — see file header. Do NOT add a skipIf guard.
  yaml = fs.readFileSync(YAML_PATH, 'utf8');
});

describe('v40-verifier-gate.yml contract (Phase 41-03)', () => {

  // ---------------------------------------------------------------------------
  // V1-V12: core verifier-gate primitives (VFY-GATE-01..04)
  // ---------------------------------------------------------------------------

  it('V1 — pull_request types include opened, synchronize, reopened', () => {
    // VFY-GATE-01 trigger contract (41-CONTEXT locked decision)
    expect(yaml).toMatch(/types:\s*\[opened,\s*synchronize,\s*reopened\]/);
  });

  it('V2 — no base-ref branches filter (Phase 51.1 removed it)', () => {
    // Phase 51.1 REGRESSION-51-01 fix: the `branches:` key under `pull_request:`
    // filters by BASE ref (target), not HEAD ref (source). Filtering by
    // ['auto-fix/*'] base meant the workflow never fired on PRs into main, so
    // verifier-gate (a required check after Phase 50 GATE-01) never reported
    // → all PRs to main blocked indefinitely. Phase 51.1 removed the filter
    // and added in-job scope-decision steps for HEAD-ref filtering. V2 now
    // asserts the BASE-ref filter is GONE.
    expect(yaml).not.toMatch(/^\s*branches:\s*\[['"]auto-fix\/\*['"]\]/m);
  });

  it('V3 — concurrency.group is PR-scoped, cancel-in-progress: true', () => {
    // Pitfall 7 mitigation: verifier is READ-ONLY w.r.t. repo so cancellation is safe
    expect(yaml).toContain('group: v40-verifier-gate-${{ github.event.pull_request.number }}');
    expect(yaml).toContain('cancel-in-progress: true');
  });

  it('V4 — permissions: contents:read + pull-requests:write + issues:read', () => {
    // Minimum-privilege block (Pitfall 1 step 7)
    expect(yaml).toContain('contents: read');
    expect(yaml).toContain('pull-requests: write');
    expect(yaml).toContain('issues: read');
  });

  it('V5 — diff-guard job exists by exact name', () => {
    // Fail-fast first job (Pattern 2 + 3)
    expect(yaml).toMatch(/^\s+diff-guard:/m);
  });

  it('V6 — verifier-gate job exists by exact name (Phase 47 slot)', () => {
    // The job NAME is the slot Phase 39 reserved on v4.0-main-protection ruleset;
    // Phase 47 CLEANUP-04 binds it to required_status_checks. DO NOT RENAME.
    expect(yaml).toMatch(/^\s+verifier-gate:/m);
  });

  it('V7 — regression-suite job invokes playwright + specs/regression.spec.js', () => {
    // VFY-GATE-02 full 76-case regression against PR branch (unpinned)
    expect(yaml).toMatch(/^\s+regression-suite:/m);
    expect(yaml).toContain('npx playwright test');
    expect(yaml).toContain('specs/regression.spec.js');
  });

  it('V8 — diff-size cap literals 200 (src/) and 50 (tests/) present', () => {
    // VFY-GATE-03 cap values (CONTEXT locked decision)
    expect(yaml).toMatch(/-gt 200/);
    expect(yaml).toMatch(/-gt 50/);
  });

  it('V9 — git checkout origin/main pins ALL THREE verifier files', () => {
    // VFY-GATE-04 Layer 4 defense — 3 files, NOT 4 (golden-loader.js doesn't exist
    // per RESEARCH §Pattern 4 Assumption A8). Exact literal pin per Pattern 4.
    expect(yaml).toContain('git checkout origin/main -- tests/e2e/lib/pdf-verifier.js');
    expect(yaml).toContain('git checkout origin/main -- tests/golden/baseline.json');
    expect(yaml).toContain('git checkout origin/main -- tests/e2e/lib/pdf-fetch.js');
  });

  it("V10 — bash for-loop 'for i in 1 2 3' present (3× consecutive runs)", () => {
    // VFY-GATE-01 LOCKED 3× consecutive run contract (Pattern 5)
    expect(yaml).toMatch(/for i in 1 2 3/);
  });

  it('V11 — verify-single-case.mjs invoked with --case and --output flags', () => {
    // VFY-GATE-01 invokes Plan 41-02's CLI shim
    expect(yaml).toContain('node scripts/verify-single-case.mjs');
    expect(yaml).toContain('--case');
    expect(yaml).toContain('--output');
  });

  it('V12 — ready-flip job exists and invokes gh pr ready', () => {
    // Pattern 9 — final draft→ready transition only after ALL gates pass
    expect(yaml).toMatch(/^\s+ready-flip:/m);
    expect(yaml).toContain('gh pr ready');
  });

  // ---------------------------------------------------------------------------
  // X1-X10: extra Pitfall defenses + negative-pins + safety
  // ---------------------------------------------------------------------------

  it('X1 — token is secrets.GITHUB_TOKEN (NOT a PAT)', () => {
    // Pitfall 4 — secrets.GITHUB_TOKEN only, no PATs
    expect(yaml).toContain('${{ secrets.GITHUB_TOKEN }}');
    // Negative pin: any secrets.*PAT* literal fails this test
    expect(yaml).not.toMatch(/secrets\.[A-Z_]*PAT[A-Z_]*/);
  });

  it('X2 — no continue-on-error: true in gating steps', () => {
    // Pitfall 8 #4 — verifier-gate MUST be gating; continue-on-error silently
    // green-lights regressions. The verifier-gate workflow is the OPPOSITE of
    // e2e-nightly.yml (where failure IS the signal for issue-filing).
    expect(yaml).not.toContain('continue-on-error: true');
  });

  it('X3 — gh pr merge auto-flag NOT present (Pitfall 4 defense)', () => {
    // Workflow only flips draft→ready; HUMAN merges.
    expect(yaml).not.toContain('gh pr merge --auto');
  });

  it('X4 — auto-merge input NOT present (Pitfall 4 defense — different shape, same surface)', () => {
    expect(yaml).not.toContain('auto-merge: true');
  });

  it('X5 — no id-token or actions:write permissions (Pitfall 1 step 7)', () => {
    // Minimum-privilege block — these permissions are intentionally absent
    expect(yaml).not.toContain('id-token: write');
    expect(yaml).not.toContain('actions: write');
  });

  it('X6 — no pull_request_target trigger (Pitfall 8 #4)', () => {
    // pull_request_target runs with base-branch workflow file but PR-branch CODE,
    // giving PR-side code write access. NEVER use; pull_request is correct.
    expect(yaml).not.toContain('pull_request_target');
  });

  it('X7 — diff-guard forbidden paths bank wired (check-diff-guard.mjs invocation OR inline regex)', () => {
    // Either via Plan 41-01 helper OR inline grep enumerating the 6 LOCKED paths.
    // Preferred: helper invocation (canonical reference; Phase 42 reuses it).
    expect(yaml).toMatch(
      /check-diff-guard\.mjs|tests\/test-cases\.js[\s\S]*baseline\.json[\s\S]*test-cases-quarantine\.js/,
    );
  });

  it('X8 — human-review-required label idempotent create + add-label invocations', () => {
    // CONTEXT answer #1 + e2e-nightly.yml:97-102 pattern — idempotent label
    // create (--force 2>/dev/null || true). The label string MUST appear at
    // least twice: once in `gh label create` and once in the `--add-label`
    // gh pr edit invocation.
    expect(yaml).toContain('human-review-required');
    const matches = yaml.match(/human-review-required/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('X9 — fetch-depth: 0 on checkout (needed for origin/main pin per Pitfall B)', () => {
    // Default checkout depth is 1 (shallow) which breaks `git checkout origin/main -- <file>`
    expect(yaml).toMatch(/fetch-depth:\s*0/);
  });

  it('X10 — node-version: 22 literal pin', () => {
    // Repo has no .nvmrc; explicit literal pin per Phase 39/40 convention.
    expect(yaml).toMatch(/node-version:\s*22/);
  });

  // ---------------------------------------------------------------------------
  // T1: Test-count invariant (Layer 5 defense — CONTEXT answer #2)
  // ---------------------------------------------------------------------------

  it('T1 — test-count invariant present in diff-guard job (TEST_CASES length never decreases)', () => {
    // Pitfall 3 Defense 5 — defense-in-depth on top of Layer 2 (diff-guard
    // already forbids modifying test-cases.js). The workflow MUST extract
    // TEST_CASES array length from origin/main and PR HEAD, then fail if
    // PR_LEN < MAIN_LEN. Pinned by grep for the TEST_CASES.length reference.
    expect(yaml).toMatch(/TEST_CASES.*length/);
  });

});

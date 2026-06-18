// tests/unit/v61-report-fix-yaml.test.js
//
// Phase 12 Plan 04 — YAML-contract pins for .github/workflows/v61-report-fix.yml.
//
// Pins per 12-PATTERNS.md lines 500-524 PLUS Critical-Fork-#1 deviation pins:
//
//   FIX-01:   trigger is issues:labeled; label-gate on report-fix-candidate; wrangler --remote + working-directory:worker
//   GATE-01:  3-iteration regression loop present
//   GATE-02:  peter-evans/create-pull-request@v8; draft:true; auto-fix/ branch prefix
//   GATE-03:  no verifier-gate: job name in this file (reuse-as-is via branch prefix)
//   GATE-04:  gh pr merge --auto, auto-merge: true, --enable-auto-merge all ABSENT
//   COST-01:  report-fix-api source traceability
//   COST-02:  MAX_FIXES_PER_RUN env
//   COST-04:  ledger commit step appears BEFORE create-pull-request step (ordering invariant)
//   COST-04 DEVIATION (Critical Fork #1): ledger pushes to ledger-snapshots/report-fix-* branch,
//             NOT bare git push, NOT HEAD:main (ruleset 17086676 blocks github-actions[bot] → main)
//   FIX-04/D-03: overfit=true signal consumed at workflow layer; human-review-required label applied;
//             auto-fix:verified NOT self-applied by this workflow
//
// Comment-paraphrase discipline: tests assert absence of literal forbidden tokens;
// the workflow file must paraphrase them in comments (not spell them literally).
//
// Pattern: readFileSync + grep/search, matching tests/unit/v61-ingest-reports-yaml.test.js
// structure and tests/e2e/scripts/v40-cost-ledger-snapshot-yaml.test.js S14 ordering pattern.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const YAML_PATH = path.join(REPO_ROOT, '.github', 'workflows', 'v61-report-fix.yml');

// Loaded once; in RED state this throws ENOENT — intentional, see file header.
let yaml;
try {
  yaml = fs.readFileSync(YAML_PATH, 'utf8');
} catch {
  yaml = null;
}

describe('v61-report-fix.yml static guards (Plan 12-04)', () => {

  // ---------------------------------------------------------------------------
  // Existence
  // ---------------------------------------------------------------------------

  it('workflow file exists', () => {
    expect(yaml).not.toBeNull();
  });

  // ---------------------------------------------------------------------------
  // FIX-01: trigger + KV fetch
  // ---------------------------------------------------------------------------

  it('FIX-01: trigger is issues:labeled (not workflow_dispatch, push, pull_request, schedule)', () => {
    expect(yaml).toMatch(/^\s*issues:/m);
    expect(yaml).toMatch(/types:\s*\[labeled\]/);
    expect(yaml).not.toMatch(/^\s+workflow_dispatch:/m);
    expect(yaml).not.toMatch(/^\s+schedule:/m);
    expect(yaml).not.toMatch(/^\s+push:/m);
    // NOTE: pull_request is intentionally allowed as text elsewhere (e.g., in comments
    // about GATE-02 draft PR — check only for the YAML trigger key)
    expect(yaml).not.toMatch(/^\s+pull_request:\s*$/m);
  });

  it('FIX-01: report-fix-candidate label filter present in step condition', () => {
    expect(yaml).toContain('report-fix-candidate');
  });

  it('FIX-01 / Pitfall 3: --remote flag present wherever wrangler kv appears', () => {
    // wrangler v4 default reads local miniflare without --remote (MEMORY: wrangler_kv_needs_remote_flag)
    const wranglerLines = yaml.split('\n').filter(l => l.includes('wrangler kv'));
    expect(wranglerLines.length).toBeGreaterThan(0);
    for (const line of wranglerLines) {
      expect(line).toContain('--remote');
    }
  });

  it('FIX-01 / Pitfall 3: wrangler step uses working-directory: worker or cd worker', () => {
    expect(yaml).toMatch(/working-directory:\s*worker|cd worker/);
  });

  it('FIX-01: KV_NAMESPACE_ID present (wrangler needs namespace to fetch)', () => {
    expect(yaml).toMatch(/KV_NAMESPACE_ID|namespace-id/);
  });

  // ---------------------------------------------------------------------------
  // COST-02: MAX_FIXES_PER_RUN
  // ---------------------------------------------------------------------------

  it('COST-02: MAX_FIXES_PER_RUN env var present', () => {
    expect(yaml).toContain('MAX_FIXES_PER_RUN');
  });

  // ---------------------------------------------------------------------------
  // COST-04: ledger commit ordering (Critical Fork #1 deviation)
  // ---------------------------------------------------------------------------

  it('COST-04: [skip ci] token present in ledger commit message', () => {
    expect(yaml).toContain('[skip ci]');
  });

  it('COST-04: ledger commit step appears BEFORE create-pull-request step (ordering invariant)', () => {
    // Mirror of v40-cost-ledger-snapshot-yaml.test.js S14 pattern.
    // Search for the step's uses: directive (not comment mentions of the action name)
    // and the ledger git commit line. The ledger commit must precede the CPR uses: line.
    const idxLedger = yaml.search(/git diff --cached --quiet \|\| git commit/);
    const idxCPR = yaml.search(/^\s+uses:\s+peter-evans\/create-pull-request@v8/m);
    expect(idxLedger).toBeGreaterThan(-1);
    expect(idxCPR).toBeGreaterThan(-1);
    expect(idxLedger).toBeLessThan(idxCPR);
  });

  it('COST-04 DEVIATION (Critical Fork #1): ledger push targets ledger-snapshots/report-fix-* branch', () => {
    // Ruleset 17086676 blocks github-actions[bot] direct-to-main pushes.
    // The ledger MUST go to ledger-snapshots/report-fix-${FP_SHORT}, not main.
    // Mirrors v40-cost-ledger-snapshot.yml S8 established pattern.
    expect(yaml).toContain('ledger-snapshots/report-fix-');
  });

  it('COST-04 DEVIATION: NO bare git push (must target branch refspec)', () => {
    // Negative pin: mirrors S8 assertion from v40-cost-ledger-snapshot-yaml.test.js
    expect(yaml).not.toMatch(/^\s*git push\s*$/m);
  });

  it('COST-04 DEVIATION: NO git push origin HEAD:main (ruleset blocks this)', () => {
    // The explicit banned pattern — mirrors S8 negative pin
    expect(yaml).not.toContain('git push origin HEAD:main');
  });

  it('COST-04: git add tests/e2e/.llm-spend-ledger.json present in ledger step', () => {
    expect(yaml).toContain('git add tests/e2e/.llm-spend-ledger.json');
  });

  it('COST-04: git diff --cached --quiet idempotent guard present', () => {
    expect(yaml).toContain('git diff --cached --quiet || git commit');
  });

  it('COST-04: github-actions[bot] identity exact (verbatim)', () => {
    // Exact identity required for GitHub to attribute commits to the bot
    expect(yaml).toContain('git config user.name "github-actions[bot]"');
    expect(yaml).toContain('41898282+github-actions[bot]@users.noreply.github.com');
  });

  it('COST-04: ledger reset from working tree before CPR snapshot step', () => {
    // Prevents ledger from entering the fix branch diff (would be a forbidden-path violation)
    expect(yaml).toMatch(/git checkout -- tests\/e2e\/\.llm-spend-ledger\.json|git reset HEAD -- tests\/e2e\/\.llm-spend-ledger\.json/);
  });

  // ---------------------------------------------------------------------------
  // GATE-02: draft PR creation
  // ---------------------------------------------------------------------------

  it('GATE-02: peter-evans/create-pull-request@v8 present', () => {
    expect(yaml).toContain('peter-evans/create-pull-request@v8');
  });

  it('GATE-02: draft: true present', () => {
    expect(yaml).toContain('draft: true');
  });

  it('GATE-02: auto-fix/ branch prefix present', () => {
    expect(yaml).toContain('auto-fix/');
  });

  // ---------------------------------------------------------------------------
  // GATE-03: no verifier-gate job in this file (reuse-as-is)
  // ---------------------------------------------------------------------------

  it('GATE-03: no verifier-gate: job name in v61-report-fix.yml (reuse implicit via branch prefix)', () => {
    // v40-verifier-gate.yml fires automatically on pull_request for auto-fix/* branches.
    // Adding a new gate job here would duplicate the required-status slot.
    expect(yaml).not.toMatch(/^\s+verifier-gate:/m);
  });

  // ---------------------------------------------------------------------------
  // GATE-04: no auto-merge tokens
  // ---------------------------------------------------------------------------

  it('GATE-04: gh pr merge --auto NOT present', () => {
    expect(yaml).not.toContain('gh pr merge --auto');
  });

  it('GATE-04: auto-merge: true NOT present', () => {
    expect(yaml).not.toContain('auto-merge: true');
  });

  it('GATE-04: --enable-auto-merge NOT present', () => {
    expect(yaml).not.toContain('--enable-auto-merge');
  });

  // ---------------------------------------------------------------------------
  // COST-01: report-fix-api traceability
  // ---------------------------------------------------------------------------

  it('COST-01: report-fix-api appears (forensic source traceability)', () => {
    expect(yaml).toContain('report-fix-api');
  });

  // ---------------------------------------------------------------------------
  // Permissions + env
  // ---------------------------------------------------------------------------

  it('permissions: contents: write present', () => {
    expect(yaml).toMatch(/contents:\s*write/);
  });

  it('permissions: pull-requests: write present', () => {
    expect(yaml).toMatch(/pull-requests:\s*write/);
  });

  it('permissions: issues: write present', () => {
    expect(yaml).toMatch(/issues:\s*write/);
  });

  it('env: ANTHROPIC_API_KEY present', () => {
    expect(yaml).toContain('ANTHROPIC_API_KEY');
  });

  it('env: CLOUDFLARE_API_TOKEN present', () => {
    expect(yaml).toContain('CLOUDFLARE_API_TOKEN');
  });

  it('node-version: 22 literal pin', () => {
    expect(yaml).toMatch(/node-version:\s*22/);
  });

  it('no continue-on-error: true in gating steps', () => {
    expect(yaml).not.toContain('continue-on-error: true');
  });

  // ---------------------------------------------------------------------------
  // FIX-04 / D-03: overfit signal + human-review-required wiring
  // ---------------------------------------------------------------------------

  it('FIX-04/D-03: overfit signal consumed at workflow layer', () => {
    // The dispatcher emits overfit=true via GITHUB_OUTPUT; workflow reads it
    expect(yaml).toContain('overfit');
  });

  it('FIX-04/D-03: human-review-required label applied when overfit=true', () => {
    expect(yaml).toContain('human-review-required');
  });

  it('FIX-04/D-03: auto-fix:verified NOT self-applied by this workflow (verifier-gate grants it)', () => {
    // This workflow MUST NOT apply auto-fix:verified — only v40-verifier-gate.yml does
    expect(yaml).not.toContain('auto-fix:verified');
  });

  // ---------------------------------------------------------------------------
  // report-fix.mjs invocation
  // ---------------------------------------------------------------------------

  it('workflow invokes node scripts/report-fix.mjs', () => {
    expect(yaml).toMatch(/node scripts\/report-fix\.mjs/);
  });

  // D-04 (Phase 13): The create-pull-request body must emit the HTML comment
  // marker so parseSourceIssue's PREFERRED regex path resolves the source issue
  // for a v6.1 fix PR without any modification to the parser.
  // parseSourceIssue regex (auto-fix-promote.mjs:270): /<!--\s*source_issue:\s*(\d+)\s*-->/
  it('D-04 (Phase 13): full <!-- source_issue: ${{ github.event.issue.number }} --> marker present and matches parseSourceIssue PREFERRED regex shape', () => {
    // Pin the FULL contiguous marker — not two independent substrings. The bare
    // `${{ github.event.issue.number }}` expression already appears in the
    // human-readable `**Source Issue:**` line, so asserting it alone proves nothing.
    expect(yaml).toContain('<!-- source_issue: ${{ github.event.issue.number }} -->');
    // And prove the template marker has the exact shape parseSourceIssue parses
    // (auto-fix-promote.mjs:270 — /<!--\s*source_issue:\s*(\d+)\s*-->/ at runtime).
    expect(yaml).toMatch(/<!--\s*source_issue:\s*\$\{\{ github\.event\.issue\.number \}\}\s*-->/);
  });

});

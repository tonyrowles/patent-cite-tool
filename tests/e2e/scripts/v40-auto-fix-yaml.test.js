// tests/e2e/scripts/v40-auto-fix-yaml.test.js
//
// Phase 43 Plan 43-01 (Task 2 RED gate / Task 3 GREEN target).
//
// Grep-based YAML assertions for .github/workflows/v40-auto-fix.yml.
// Zero new dependencies — reads the YAML as plain text and asserts meaningful
// tokens with string/regex checks. Mirrors v40-verifier-gate-yaml.test.js +
// v40-deps-update-yaml.test.js style.
//
// Test groups (43-01-PLAN.md Task 2 behavior spec):
//   A1-A12: load-bearing primitives (trigger, gating if, concurrency,
//           permissions, fail-fast, ERROR_CLASS pre-check, dispatcher invoke,
//           cpr@v8 invocation, draft+delete-branch:false, GITHUB_TOKEN-only).
//   L1-L2:  load-bearing ledger-split isolation — ledger commit step lands
//           BEFORE the cpr@v8 step (L1), and the skip-ci marker appears
//           EXACTLY ONCE in the file (L2).
//   X1-X8:  negative-pin defenses + structural minima.
//
// RED-state contract (Task 2 commit): .github/workflows/v40-auto-fix.yml does
// NOT yet exist. beforeAll() throws ENOENT, failing every case. Task 3 GREEN
// commit creates the workflow file and ALL 22 cases pass without modifying
// this test file.
//
// COMMENT-PARAPHRASE SCAR (Phase 40-03 / 41-03):
// The X1-X5 + L2 negative-grep assertions test for absence of LITERAL
// forbidden tokens. Narrative comments in THIS file paraphrase them per the
// Phase 41-03 table so this file does not self-trip when grep-audited:
//   skip-ci marker (NOT the literal)
//   the gh pr merge auto-flag
//   the action auto-merge input
//   Identity-token write permission
//   the actions-write permission
//   the pull-request-target trigger variant
// The LITERAL tokens appear ONLY inside expect(...).not.toContain(...) /
// .toMatch(/.../) arguments — those are the assertion sources themselves
// and are required for the assertions to mean anything.

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const YAML_PATH = path.resolve(PROJECT_ROOT, '.github/workflows/v40-auto-fix.yml');

let yaml;

beforeAll(() => {
  // RED state: throws ENOENT until Task 3 creates the workflow file.
  yaml = fs.readFileSync(YAML_PATH, 'utf8');
});

describe('v40-auto-fix.yml contract (Phase 43)', () => {

  // ---------------------------------------------------------------------------
  // A1-A12: load-bearing primitives
  // ---------------------------------------------------------------------------

  // SKIP (v4.3 auto-fix milestone paused — see feat/bug-report): v40-auto-fix.yml was
  // intentionally set to `on: workflow_dispatch:` (dormant) when the milestone paused,
  // so the original `issues: [labeled]` trigger no longer matches. Restore when v4.3 resumes.
  it.skip('A1 — trigger on.issues.types includes labeled', () => {
    // 43-CONTEXT locked decision: types: [labeled]
    expect(yaml).toMatch(/on:\s*\n\s*issues:\s*\n\s*types:\s*\[labeled\]/);
  });

  it("A2 — job-level if filters by label name == 'triage'", () => {
    // ALL label-adds fire types:[labeled]; job-level if narrows to triage only.
    expect(yaml).toMatch(/if:\s*github\.event\.label\.name\s*==\s*'triage'/);
  });

  it('A3 — concurrency.group keyed by github.event.issue.number', () => {
    // Per-issue serialization (T-43-05 mitigation)
    expect(yaml).toContain('group: v40-auto-fix-${{ github.event.issue.number }}');
  });

  it('A4 — cancel-in-progress: false (Pitfall 7 cost protection)', () => {
    // Opposite of Phase 41 verifier-gate (which uses true). In-flight LLM
    // calls must NOT be killed mid-flight by label-flap.
    expect(yaml).toContain('cancel-in-progress: false');
    expect(yaml).not.toContain('cancel-in-progress: true');
  });

  it('A5 — permissions: contents:write + pull-requests:write + issues:write', () => {
    // Minimum-privilege block (Pitfall 1 step 7)
    expect(yaml).toContain('contents: write');
    expect(yaml).toContain('pull-requests: write');
    expect(yaml).toContain('issues: write');
  });

  it("A6 — ANTHROPIC_API_KEY fail-fast assertion uses secrets.ANTHROPIC_API_KEY != ''", () => {
    // CONTEXT Claude's-discretion: fail-fast at workflow start (cleaner error
    // than letting the dispatcher fail later)
    expect(yaml).toMatch(/secrets\.ANTHROPIC_API_KEY\s*!=\s*''/);
  });

  it('A7 — ERROR_CLASS pre-check uses gh issue view --json labels AND mentions WRONG_CITATION', () => {
    // Pre-step that reads issue labels and skips if no ERROR_CLASS label is
    // present (avoids burning SDK budget on a bare triage-label add).
    expect(yaml).toMatch(/gh issue view[\s\S]*--json labels/);
    expect(yaml).toContain('WRONG_CITATION');
  });

  it('A8 — dispatcher invocation contains node scripts/auto-fix.mjs AND --force-api AND --no-push', () => {
    // Phase 42 contract: --no-push leaves HEAD on the auto-fix branch +
    // writes ledger to working tree; cpr@v8 takes it from there.
    expect(yaml).toContain('node scripts/auto-fix.mjs');
    expect(yaml).toContain('--force-api');
    expect(yaml).toContain('--no-push');
  });

  it('A9 — peter-evans/create-pull-request@v8 referenced EXACTLY ONCE; @main absent', () => {
    // Single cpr step. Reject @main / @v6 / @v7 drift.
    const matches = yaml.match(/peter-evans\/create-pull-request@v8/g) || [];
    expect(matches.length).toBe(1);
    expect(yaml).not.toContain('peter-evans/create-pull-request@main');
  });

  it('A10 — draft: true present on the cpr@v8 step', () => {
    // T-43-06 mitigation: PRs open as draft; humans flip to ready.
    expect(yaml).toContain('draft: true');
  });

  it('A11 — delete-branch: false (Phase 44 needs the branch tip)', () => {
    // T-43-08 mitigation: Phase 44 auto-promote reads branch tip via
    // gh pr view --json headRefName for follow-up promote PR composition.
    // cpr@v8 default is true; we explicitly OVERRIDE to false.
    expect(yaml).toContain('delete-branch: false');
  });

  it('A12 — secrets.GITHUB_TOKEN present; secrets.*PAT* literal absent', () => {
    // Pitfall 4 / T-43-02: workflow-scoped token only; no PATs.
    expect(yaml).toContain('${{ secrets.GITHUB_TOKEN }}');
    expect(yaml).not.toMatch(/secrets\.[A-Z_]*PAT[A-Z_]*/);
  });

  // ---------------------------------------------------------------------------
  // L1-L2: load-bearing ledger-split isolation
  // ---------------------------------------------------------------------------

  it('L1 — ledger-commit step (tests/e2e/.llm-spend-ledger.json) appears BEFORE peter-evans/cpr@v8', () => {
    // THE LOAD-BEARING TWO-COMMIT SPLIT (T-43-07 mitigation / Pitfall 1):
    // ledger commit goes to main DIRECTLY before cpr@v8 snapshots the
    // working tree, so the auto-fix PR diff is ledger-clean (Phase 41
    // diff-guard rejects diffs touching the ledger path).
    const ledgerIdx = yaml.indexOf('tests/e2e/.llm-spend-ledger.json');
    const cprIdx = yaml.indexOf('peter-evans/create-pull-request@v8');
    expect(ledgerIdx).toBeGreaterThanOrEqual(0);
    expect(cprIdx).toBeGreaterThanOrEqual(0);
    expect(ledgerIdx).toBeLessThan(cprIdx);
  });

  it('L2 — skip-ci marker literal appears EXACTLY ONCE (ledger commit message only)', () => {
    // The ONLY allowed occurrence is the ledger commit message string
    // (the skip-ci marker prefix on the ledger commit) — anywhere else
    // (header comments, step names, cpr@v8 commit-message field) is a
    // paraphrase-discipline violation per the Phase 40-03 / 41-03 scar.
    const matches = yaml.match(/\[skip ci\]/g) || [];
    expect(matches.length).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // X1-X8: negative-pin defenses + structural minima
  // ---------------------------------------------------------------------------

  it('X1 — the gh pr merge auto-flag literal NOT present (Pitfall 4 / T-43-06)', () => {
    // Auto-merge of auto-fix PRs would bypass human review.
    expect(yaml).not.toContain('gh pr merge --auto');
  });

  it('X2 — the action auto-merge input NOT present (Pitfall 4 / T-43-06 different shape)', () => {
    expect(yaml).not.toContain('auto-merge: true');
  });

  it('X3 — Identity-token write permission NOT present (Pitfall 1 step 7 / T-43-04)', () => {
    // Could leak OIDC tokens; intentionally absent.
    expect(yaml).not.toContain('id-token: write');
  });

  it('X4 — the actions-write permission NOT present (Pitfall 1 step 7 / T-43-04)', () => {
    // Could enable workflow self-modification; intentionally absent.
    expect(yaml).not.toContain('actions: write');
  });

  it('X5 — the pull-request-target trigger variant NOT present (Pitfall 8 #4 / T-43-03)', () => {
    // The pull-request-target trigger variant runs with base-branch workflow
    // file but PR-branch CODE, giving PR-side code write access. NEVER use.
    expect(yaml).not.toContain('pull_request_target');
  });

  it('X6 — body-path: /tmp/pr-body.md present (helper-script output, NOT inline body:)', () => {
    // The build-auto-fix-pr-body.mjs helper writes to /tmp/pr-body.md and
    // cpr@v8 reads from there. Inline body: would interpolate ${{ }} which
    // is a CWE-94 risk for issue-body-derived content.
    expect(yaml).toMatch(/body-path:\s*\/tmp\/pr-body\.md/);
  });

  it('X7 — cross-link gh issue comment after PR open uses pull-request-url output', () => {
    // CONTEXT Claude's-discretion: cross-link source issue when PR opens.
    expect(yaml).toMatch(/pull-request-url/);
  });

  it('X8 — timeout-minutes set between 5 and 15 inclusive', () => {
    // CONTEXT specifies 10. SDK call ~30-60s + checkout + install + cpr@v8.
    const m = yaml.match(/timeout-minutes:\s*(\d+)/);
    expect(m).not.toBeNull();
    const t = Number(m[1]);
    expect(t).toBeGreaterThanOrEqual(5);
    expect(t).toBeLessThanOrEqual(15);
  });

});

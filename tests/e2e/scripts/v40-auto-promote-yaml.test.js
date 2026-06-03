// tests/e2e/scripts/v40-auto-promote-yaml.test.js
//
// Phase 44 Plan 44-01 (Task 3 RED gate / Task 3 GREEN target).
//
// Grep-based YAML assertions for .github/workflows/v40-auto-promote.yml.
// Zero new dependencies — reads the YAML as plain text and asserts meaningful
// tokens with string/regex checks. Mirrors v40-auto-fix-yaml.test.js style.
//
// Test groups (44-01-PLAN.md Task 3 behavior spec):
//   A1-A18 : load-bearing primitives (trigger, gating if, concurrency,
//            permissions, parse step, dispatcher invoke, cpr@v8 invocation
//            with auto-promote/ branch prefix, draft/delete-branch, source-
//            issue close gated on cpr output, post-merge verifier vs
//            origin/main, regression-issue labels).
//   X1-X4  : negative-pin defenses (no direct push to main, GITHUB_TOKEN
//            only, no auto-flag literals, no Identity-token write, no
//            pull-request-target trigger variant).
//
// RED-state contract (Task 3 RED commit):
//   .github/workflows/v40-auto-promote.yml does NOT yet exist. beforeAll()
//   throws ENOENT, failing every case. Task 3 GREEN creates the workflow
//   file and ALL 22 cases pass without modifying this test file.
//
// COMMENT-PARAPHRASE SCAR (Phase 40-03 / 41-03 / 43-01):
// The X1/X3/X4 + A10 negative-grep assertions test for the absence of
// LITERAL forbidden tokens. Narrative comments in THIS file paraphrase them
// per the Phase 41-03 table so this file does not self-trip when grep-
// audited:
//   the gh pr merge auto-flag (NOT the literal)
//   the action auto-merge input
//   the Identity-token write permission
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
const YAML_PATH = path.resolve(PROJECT_ROOT, '.github/workflows/v40-auto-promote.yml');

let yaml;

beforeAll(() => {
  // RED state: throws ENOENT until Task 3 GREEN creates the workflow file.
  yaml = fs.readFileSync(YAML_PATH, 'utf8');
});

describe('v40-auto-promote.yml contract (Phase 44)', () => {

  // ---------------------------------------------------------------------------
  // A1-A18: load-bearing primitives
  // ---------------------------------------------------------------------------

  it('A1 — trigger on.pull_request.types includes closed', () => {
    // 44-CONTEXT locked decision: pull_request:[closed] (NOT issues)
    expect(yaml).toMatch(/on:\s*\n\s*pull_request:\s*\n\s*types:\s*\[closed\]/);
  });

  it('A2 — job-level if asserts pull_request.merged == true', () => {
    // The pull_request:[closed] event also fires for close-without-merge;
    // the merged-true filter is what distinguishes a real merge.
    expect(yaml).toMatch(/github\.event\.pull_request\.merged\s*==\s*true/);
  });

  it("A3 — job-level if asserts contains 'auto-fix:verified' label", () => {
    // Pre-filter at job level so unverified-PR merges short-circuit early.
    expect(yaml).toContain("contains(github.event.pull_request.labels.*.name, 'auto-fix:verified')");
  });

  it('A4 — concurrency.group keyed by pull_request.number', () => {
    // Per-PR serialization (T-44-06 mitigation against duplicate auto-promote PRs)
    expect(yaml).toContain('group: v40-auto-promote-${{ github.event.pull_request.number }}');
  });

  it('A5 — cancel-in-progress: false (auto-promote must complete its mutation)', () => {
    // Mid-flight cancellation could leave runPromote half-applied; rollback
    // covers most cases but worst-case is partial corpus. Pin to false.
    expect(yaml).toContain('cancel-in-progress: false');
    expect(yaml).not.toContain('cancel-in-progress: true');
  });

  it('A6 — permissions: contents:write + pull-requests:write + issues:write', () => {
    // Minimum-privilege block (Pitfall 1 step 7).
    // contents:     write — cpr@v8 pushes the auto-promote branch
    // pull-requests: write — cpr@v8 opens the follow-up PR + adds labels
    // issues:        write — gh issue close on the source issue + regression-issue create
    expect(yaml).toContain('contents: write');
    expect(yaml).toContain('pull-requests: write');
    expect(yaml).toContain('issues: write');
  });

  it('A7 — parse step uses gh pr view --json body,labels,number', () => {
    // The script consumes argv only; the WORKFLOW pre-resolves the PR
    // metadata via gh pr view. Pattern mirrors v40-auto-fix.yml line 89.
    expect(yaml).toMatch(/gh pr view[\s\S]*--json\s+body,labels,number/);
  });

  it('A8 — dispatcher invocation references scripts/auto-fix-promote.mjs', () => {
    // The CLI shim created by Task 2 is the workflow's single mutation entry
    // point; it fronts runPromote({_skipCiGuard:true}) after the triple-gate.
    expect(yaml).toContain('node scripts/auto-fix-promote.mjs');
  });

  it('A9 — cpr@v8 branch prefix is auto-promote/ (Pitfall 4 verifier-gate routing)', () => {
    // The follow-up PR mutates tests/test-cases.js; Phase 41 verifier-gate
    // rejects that diff for branches matching auto-fix/* — so the auto-
    // promote PR MUST use the auto-promote/* prefix to route around it.
    expect(yaml).toMatch(/branch:\s*auto-promote\//);
  });

  it('A10 — cpr@v8 branch input does NOT begin with auto-fix/ (defensive Pitfall 4 pin)', () => {
    // Even one stray auto-fix/ branch input would trigger verifier-gate.
    expect(yaml).not.toMatch(/branch:\s*auto-fix\//);
  });

  it('A11 — peter-evans/create-pull-request@v8 referenced EXACTLY ONCE; @main absent', () => {
    // Single cpr step. Reject @main / @v6 / @v7 drift.
    const matches = yaml.match(/peter-evans\/create-pull-request@v8/g) || [];
    expect(matches.length).toBe(1);
    expect(yaml).not.toContain('peter-evans/create-pull-request@main');
  });

  it('A12 — cpr@v8 step sets draft: false (auto-promote PR is review-ready)', () => {
    // The auto-fix PR is a draft; the follow-up auto-promote PR is NOT —
    // it is ready for CODEOWNER review on open.
    expect(yaml).toContain('draft: false');
  });

  it('A13 — cpr@v8 step sets delete-branch: true (throwaway branch)', () => {
    // No downstream consumer needs the auto-promote/* branch tip after
    // CODEOWNER merge; clean up automatically.
    expect(yaml).toContain('delete-branch: true');
  });

  it('A14 — gh issue close invocation present with --reason completed', () => {
    // PROMOTE-03: the source triage issue is closed AFTER the follow-up PR
    // opens; --reason completed marks it as fixed (not abandoned/duplicate).
    expect(yaml).toMatch(/gh issue close[\s\S]*--reason completed/);
  });

  it('A15 — issue-close step gated on steps.cpr.outputs.pull-request-url (Pitfall 5)', () => {
    // If runPromote rolled back, cpr@v8 may have nothing to commit and
    // produces no PR URL output. Without this gate the source issue would
    // close while no auto-promote PR exists — the worst-case half-state.
    expect(yaml).toMatch(/if:\s*steps\.cpr\.outputs\.pull-request-url/);
  });

  it('A16 — post-merge verifier step invokes scripts/verify-single-case.mjs --runs 1', () => {
    // PROMOTE-04: re-check the case on main HEAD AFTER the auto-promote PR
    // is opened, to catch squash-merge content drift between merge and
    // promotion time.
    expect(yaml).toMatch(/node scripts\/verify-single-case\.mjs[\s\S]*--case/);
    expect(yaml).toMatch(/--runs 1/);
  });

  it('A17 — verifier checks out origin/main (Pitfall 2 SHA-drift defense)', () => {
    // The squash-merge SHA may not exist on main if the repo uses rebase-
    // and-merge. Always check origin/main HEAD; never the merge_commit_sha
    // field from the pull_request payload.
    expect(yaml).toMatch(/git checkout origin\/main/);
    expect(yaml).not.toContain('merge_commit_sha');
  });

  it('A18 — regression issue create has all three labels (e2e-nightly + WRONG_CITATION + post-merge-regression)', () => {
    // PROMOTE-04: a verifier failure on main HEAD opens a regression issue
    // labeled for the nightly suite + the original error class + the
    // post-merge-regression diagnostic tag.
    expect(yaml).toMatch(/--label e2e-nightly/);
    expect(yaml).toMatch(/--label WRONG_CITATION/);
    expect(yaml).toMatch(/--label post-merge-regression/);
  });

  // ---------------------------------------------------------------------------
  // X1-X4: negative-pin defenses
  // ---------------------------------------------------------------------------

  it('X1 — no direct git push to main (REQUIREMENTS.md out-of-scope item)', () => {
    // The two-PR choreography (auto-fix PR + auto-promote PR) IS the gate;
    // there must be zero direct-to-main pushes from this workflow.
    expect(yaml).not.toMatch(/git push origin main/);
  });

  it('X2 — secrets.GITHUB_TOKEN present; secrets.*PAT* literal absent', () => {
    // Workflow-scoped token only; no PATs (T-44-10 mitigation).
    expect(yaml).toContain('${{ secrets.GITHUB_TOKEN }}');
    expect(yaml).not.toMatch(/secrets\.[A-Z_]*PAT[A-Z_]*/);
  });

  it('X3 — the gh pr merge auto-flag and the action auto-merge input NOT present (T-44-07)', () => {
    // Auto-merge would bypass the CODEOWNER review gate on the auto-promote
    // follow-up PR; humans must merge it manually.
    expect(yaml).not.toContain('gh pr merge --auto');
    expect(yaml).not.toContain('auto-merge: true');
  });

  it('X4 — the Identity-token write permission and the pull-request-target trigger variant NOT present', () => {
    // The Identity-token write permission could leak OIDC tokens; the pull-
    // request-target trigger variant runs with base workflow + PR code,
    // giving PR-side code write access. Both intentionally absent.
    expect(yaml).not.toContain('id-token: write');
    expect(yaml).not.toContain('pull_request_target');
  });

});

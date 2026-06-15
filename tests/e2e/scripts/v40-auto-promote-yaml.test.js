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

  // SKIP (v4.3 auto-fix milestone paused — see feat/bug-report): the pull_request:closed
  // trigger was gated to workflow_dispatch-only while the auto-fix loop is dormant, so this
  // contract assertion is intentionally stale. Restore alongside the trigger when v4.3 resumes.
  it.skip('A1 — trigger on.pull_request.types includes closed', () => {
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

// ---------------------------------------------------------------------------
// Phase 58 PROMOTE-02/03 (Decision A + B) — workflow-side pre-resolution of
// fingerprint, errorClass, and model + threading into scripts/auto-fix-promote.mjs
// argv. Together with Plan 01's parseArgv validation (PA4/PA5) and Plan 01's
// entry-shape pins (O1/O2/O3), this Vitest contract closes the end-to-end pin
// at three layers — parseArgv, entry shape, and workflow YAML.
//
// PHASE-58-Y6 + PHASE-58-Y9 + PHASE-58-Y10 jointly form the regression gate
// against any future silent revert to hardcoded sonnet (which would break
// a-b-winner.mjs:isAttributable per-arm attribution for the opus arm and
// re-introduce indefinite abstention on that arm).
// ---------------------------------------------------------------------------

describe('v40-auto-promote.yml Phase 58 contract — fingerprint + errorClass + model plumbing', () => {

  it('PHASE-58-Y1 — Pre-resolve source-issue fingerprint step exists', () => {
    expect(yaml).toContain('Pre-resolve source-issue fingerprint');
  });

  it('PHASE-58-Y2 — Pre-resolve source-issue errorClass step exists', () => {
    expect(yaml).toContain('Pre-resolve source-issue errorClass');
  });

  it('PHASE-58-Y3 — Pre-resolve upstream-ledger model step exists', () => {
    expect(yaml).toContain('Pre-resolve upstream-ledger model');
  });

  it('PHASE-58-Y4 — --fingerprint argv plumbed', () => {
    // The fingerprint pre-resolved by step `fp` is threaded into the per-case
    // scripts/auto-fix-promote.mjs invocation via the --fingerprint argv flag
    // accepted by Plan 01's parseArgv (validated against /^[0-9a-f]{12}$/).
    expect(yaml).toMatch(/--fingerprint\s+"\$FINGERPRINT"/);
  });

  it('PHASE-58-Y5 — --error-class argv plumbed', () => {
    // The errorClass pre-resolved by step `ec` is threaded via --error-class
    // (validated by Plan 01's parseArgv against /^[A-Z_][A-Z0-9_]*$/).
    expect(yaml).toMatch(/--error-class\s+"\$ERROR_CLASS"/);
  });

  it('PHASE-58-Y6 — --model argv plumbed (PIN: must not regress to hardcoded sonnet on script side)', () => {
    // The model pre-resolved by step `ml` (jq lookup against the upstream
    // auto-fix-api ledger entry) is threaded via --model. This pin defends
    // against any future silent revert to hardcoded sonnet on either side
    // (script via Plan 01 grep gates; workflow via THIS assertion).
    expect(yaml).toMatch(/--model\s+"\$MODEL"/);
  });

  it('PHASE-58-Y7 — model lookup uses parameterized jq (jq -r --arg fp)', () => {
    // Parameterized argument (--arg fp) — NOT string interpolation into the
    // jq filter expression. jq treats $fp as a string variable; no jq-expression
    // evaluation against the fingerprint value (T-58-A3 mitigation).
    expect(yaml).toContain('jq -r --arg fp');
  });

  it('PHASE-58-Y8 — jq filter matches fingerprint AND source==auto-fix-api (defensive against fingerprint reuse)', () => {
    // Defensive AND-of-two-fields match: even if a fingerprint gets reused
    // across phases, the source=='auto-fix-api' constraint pins the lookup
    // to the upstream auto-fix entry (Phase 54+56 wiring). See RESEARCH §A1.
    expect(yaml).toContain('select(.fingerprint == $fp and .source == "auto-fix-api")');
  });

  it('PHASE-58-Y9 — no silent-default-to-sonnet fallback (anti-pattern guard)', () => {
    // If a future PR added either:
    //   MODEL=${MODEL:-claude-sonnet-4-6}       (shell parameter expansion default)
    //   MODEL="claude-sonnet-4-6"               (literal hardcode)
    // it would silently mask a missing upstream ledger entry and re-introduce
    // the per-arm attribution gap for the opus arm. This assertion trips.
    expect(yaml).not.toMatch(/MODEL=\$\{MODEL:-claude-sonnet-4-6\}/);
    expect(yaml).not.toMatch(/MODEL="claude-sonnet-4-6"/);
  });

  it('PHASE-58-Y10 — model pre-resolution hard-fails on no match (clear ::error:: + exit 1)', () => {
    // The hard-fail clause MUST appear, AND `exit 1` MUST appear within the
    // same step block (after the step name). Non-greedy [\s\S]*? bounds the
    // search to a small window.
    expect(yaml).toMatch(/::error::Could not resolve model from upstream auto-fix ledger entry/);
    expect(yaml).toMatch(/Pre-resolve upstream-ledger model[\s\S]*?exit 1/);
  });

  it('PHASE-58-Y11 — --passing-cases is gated by conditional, NOT unconditionally emitted (WR-01 regression pin)', () => {
    // Phase 58 REVIEW-FIX WR-01: The verified-only path leaves
    // PARTIAL_PASSING_CASES="", and scripts/auto-fix-promote.mjs's
    // parseArgv -> takeValue rejects empty-string flag values with exit 2.
    // The workflow MUST guard --passing-cases behind `if [ -n
    // "$PARTIAL_PASSING_CASES" ]` (bash array conditional-append pattern)
    // so the flag never reaches argv with an empty value. This regression
    // pin asserts both halves: (a) the conditional exists; (b) the literal
    // `--passing-cases "$PARTIAL_PASSING_CASES"` line on a continuation
    // backslash (the pre-fix shape) is absent. (a) and (b) together prevent
    // a silent revert to the broken shape.
    expect(yaml).toMatch(/if\s+\[\s+-n\s+"\$PARTIAL_PASSING_CASES"\s+\]/);
    expect(yaml).toMatch(/ARGS\+=\(--passing-cases "\$PARTIAL_PASSING_CASES"\)/);
    expect(yaml).not.toMatch(/--passing-cases "\$PARTIAL_PASSING_CASES"\s*\\\n/);
  });

});

// ---------------------------------------------------------------------------
// Phase 59 SWEEP-05 — workflow_dispatch trigger + PHASE_TAG dual-path env
// expression + conditional --phase argv append (Decision C).
//
// Together with Plan 59-03's script-side parseArgv (PHASE-59-P1..P3) and
// entry-shape (PHASE-59-O1..O2) pins, this Vitest contract closes the end-
// to-end pin at three layers — workflow YAML, parseArgv, entry shape.
//
// PHASE-59-Y1 — workflow_dispatch trigger variant with PHASE_TAG input.
// PHASE-59-Y2 — job-level if-filter augmented to allow workflow_dispatch.
// PHASE-59-Y3 — --phase conditional argv-append (mirrors WR-01 pattern).
// ---------------------------------------------------------------------------

describe('v40-auto-promote.yml Phase 59 contract — SWEEP-05 phase argv expansion (Decision C)', () => {

  it('PHASE-59-Y1 — workflow_dispatch trigger with inputs.PHASE_TAG (description, required: false, default: \'\', type: string)', () => {
    // (a) workflow_dispatch + inputs.PHASE_TAG presence (Phase 59 REVIEW-FIX
    // CR-01 added pr_number + merged inputs ahead of PHASE_TAG, so the
    // adjacency check is widened from a strict 2-line gap to "any-inputs-
    // present then PHASE_TAG"; the SHAPE invariant Y1 cares about is the
    // PHASE_TAG schema, not the lexical position of the key inside inputs:)
    expect(yaml).toMatch(/workflow_dispatch:\s*\n\s*inputs:/);
    expect(yaml).toMatch(/\s*PHASE_TAG:\s*\n/);
    // (b) required: false default contract
    expect(yaml).toMatch(/PHASE_TAG:\s*\n[\s\S]*?required: false/);
    // (c) explicit empty-string default (no silent shape — preserves the
    // byte-equivalent pull_request trigger path because the script's
    // `args.phase || '58-promote'` fallback fires only when --phase is
    // absent OR set to a falsy value)
    expect(yaml).toMatch(/PHASE_TAG:\s*\n[\s\S]*?default: ''/);
    // (d) type: string
    expect(yaml).toMatch(/PHASE_TAG:\s*\n[\s\S]*?type: string/);
  });

  it('PHASE-59-Y2 — job-level if-filter augmented to allow workflow_dispatch event (preserves existing pull_request branch byte-equivalent)', () => {
    // (a) workflow_dispatch OR-branch presence — operator-triggered UAT runs
    // pass the filter without a pull_request payload.
    expect(yaml).toMatch(/github\.event_name == 'workflow_dispatch'/);
    // (b) existing pull_request branch preserved BYTE-EQUIVALENT inside the
    // parenthesized fallback. PHASE-58-Y11 / WR-01 regression pin compatibility.
    expect(yaml).toContain('github.event.pull_request.merged == true');
    expect(yaml).toContain("contains(github.event.pull_request.labels.*.name, 'auto-fix:verified')");
    expect(yaml).toContain("contains(github.event.pull_request.labels.*.name, 'auto-fix:partial-verified')");
  });

  it('PHASE-59-Y3 — --phase argv is gated by conditional, NOT unconditionally emitted (mirrors WR-01 PHASE-58-Y11 pattern)', () => {
    // Phase 59 SWEEP-05 Decision C: The pull_request trigger path leaves
    // PHASE_TAG="" (workflow `default: ''`), and
    // scripts/auto-fix-promote.mjs's parseArgv -> takeValue rejects empty-
    // string flag values with exit 2. The workflow MUST guard --phase
    // behind `if [ -n "$PHASE_TAG" ]` so the flag never reaches argv with
    // an empty value. Direct port of PHASE-58-Y11 pattern.
    //
    // Phase 59 REVIEW-FIX WR-01: PHASE_TAG env var is declared in the
    // Triple-gate step env block via the SINGLE-source expression
    // `${{ github.event.inputs.PHASE_TAG || '' }}`. The legacy
    // `|| vars.PHASE_TAG` fallback was removed because a forgotten repo
    // variable would silently re-tag every normal pull_request auto-promote
    // ledger entry, corrupting per-phase attribution downstream.
    expect(yaml).toMatch(/PHASE_TAG:\s*\$\{\{\s*github\.event\.inputs\.PHASE_TAG\s*\|\|\s*''\s*\}\}/);
    // (a) conditional present
    expect(yaml).toMatch(/if\s+\[\s+-n\s+"\$PHASE_TAG"\s+\]/);
    // (b) bash array conditional-append pattern
    expect(yaml).toMatch(/ARGS\+=\(--phase "\$PHASE_TAG"\)/);
    // (c) defense against silent regression to unconditional emit (line-
    // continuation backslash pattern; matches PHASE-58-Y11's third
    // assertion shape verbatim).
    expect(yaml).not.toMatch(/--phase "\$PHASE_TAG"\s*\\\n/);
  });

  // Phase 59 REVIEW-FIX CR-01: workflow_dispatch trigger must expose a
  // required pr_number input so the operator-driven UAT path can resolve
  // a real PR number for the parse step. The pre-REVIEW-FIX shape admitted
  // workflow_dispatch events through the job-level if-filter but crashed
  // at the first `gh pr view ""` call (PR_NUMBER empty for dispatch).
  it('PHASE-59-Y4 — workflow_dispatch.inputs.pr_number is required and threaded into PR_NUMBER fallback', () => {
    // (a) pr_number input present with required: true and type: string
    expect(yaml).toMatch(/workflow_dispatch:[\s\S]*?inputs:[\s\S]*?pr_number:/);
    expect(yaml).toMatch(/pr_number:\s*\n[\s\S]*?required: true/);
    expect(yaml).toMatch(/pr_number:\s*\n[\s\S]*?type: string/);
    // (b) merged input present with required: true (operator affirmation
    // mirroring the pull_request.merged == true semantic)
    expect(yaml).toMatch(/workflow_dispatch:[\s\S]*?inputs:[\s\S]*?merged:/);
    expect(yaml).toMatch(/merged:\s*\n[\s\S]*?required: true/);
    // (c) PR_NUMBER env extraction in the parse step falls back from the
    // pull_request payload to the workflow_dispatch input
    expect(yaml).toMatch(/PR_NUMBER:\s*\$\{\{\s*github\.event\.pull_request\.number\s*\|\|\s*github\.event\.inputs\.pr_number\s*\}\}/);
    // (d) early hard-fail step rejects empty PR_NUMBER (defense-in-depth)
    expect(yaml).toMatch(/Reject empty PR_NUMBER[\s\S]*?if \[ -z "\$PR_NUMBER" \][\s\S]*?exit 1/);
  });

  // Phase 59 REVIEW-FIX WR-01: regression guard against silent re-
  // introduction of the `vars.PHASE_TAG` foot-gun. The literal token
  // `vars.PHASE_TAG` MUST NOT appear anywhere in the workflow YAML
  // (description text, comments, or expressions). A future commit that
  // re-adds it for any reason trips this assertion. The SWEEP runbook
  // now passes the phase tag exclusively via the workflow_dispatch
  // input mechanism (`gh workflow run -f PHASE_TAG=...`); a repo
  // variable named PHASE_TAG would silently corrupt the ledger phase
  // attribution on every normal pull_request auto-promote run.
  it('PHASE-59-Y5 — vars.PHASE_TAG literal is absent (WR-01 regression guard)', () => {
    expect(yaml).not.toContain('vars.PHASE_TAG');
  });

});

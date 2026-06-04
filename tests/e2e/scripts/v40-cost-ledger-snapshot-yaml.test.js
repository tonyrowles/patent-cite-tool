// tests/e2e/scripts/v40-cost-ledger-snapshot-yaml.test.js
//
// Phase 40 Plan 40-01 (DEPS-01 partial — establishes v40-*.yml naming convention
// used by 40-03; the snapshot workflow itself is Phase 40 deliverable #5 per
// 40-CONTEXT.md line 17). Grep-based YAML assertions for
// .github/workflows/v40-cost-ledger-snapshot.yml.
//
// Mirrors tests/e2e/scripts/e2e-weekly-digest-yaml.test.js structure verbatim
// (imports, __dirname, PROJECT_ROOT, YAML_PATH, beforeAll). Zero new dependencies.
//
// Tests (per 40-RESEARCH.md lines 312-323 + plan-checker S11-S13 additions):
//   S1  — cron exact:                 cron: '0 2 * * *'
//   S2  — workflow_dispatch present
//   S3  — permissions:                contents: write
//   S4  — timeout-minutes present
//   S5  — git add EXACT path:         tests/e2e/.llm-spend-ledger.json
//                                     (and NOT tests/e2e/.manual-sdk-bumps.json,
//                                      which is owned by 40-02 + 40-03)
//   S6  — idempotent guard EXACT:     git diff --cached --quiet || git commit
//   S7  — [skip ci] LOAD-BEARING:     prevents bot push from re-triggering ci.yml
//   S8  — git push present (NO --force, NO remote arg)
//   S9  — github-actions[bot] identity EXACT:
//                                     git config user.name "github-actions[bot]"
//                                     41898282+github-actions[bot]@users.noreply.github.com
//   S10 — E2E_LEDGER_PATH_OVERRIDE absent (Phase 37 Y6 mirror; llm-ledger.js:85
//         throws in CI if set)
//   S11 — snapshot summary capture step uses node -e to import llm-ledger.js;
//         emits SNAPSHOT_DATE, INVOCATIONS, SPEND_USD env vars
//   S12 — Pitfall 4 defense: no `gh pr merge --auto`, no `auto-merge: true`
//   S13 — verbatim-block parity with e2e-weekly-digest.yml (modulo git add path
//         + commit message lines). Promotes the must_haves.truth#3 claim from
//         documentation to an automated gate (per plan-checker WARNING).

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const YAML_PATH = path.resolve(PROJECT_ROOT, '.github/workflows/v40-cost-ledger-snapshot.yml');
const DIGEST_YAML_PATH = path.resolve(PROJECT_ROOT, '.github/workflows/e2e-weekly-digest.yml');

let yaml;

beforeAll(() => {
  // ENOENT here in RED is the forcing function for Task 2. Do NOT guard with
  // skipIf — the test MUST fail until the workflow file exists.
  yaml = fs.readFileSync(YAML_PATH, 'utf8');
});

describe('v40-cost-ledger-snapshot.yml contract (Phase 40-01)', () => {

  it('S1 — cron exact: 0 2 * * * (daily 02:00 UTC)', () => {
    // 40-CONTEXT.md line 34: daily 02:00 UTC, lands well before
    // e2e-weekly-digest.yml's Monday 07:00 slot. Verified no conflict with
    // e2e-nightly (0 6 * * *) or e2e-weekly-digest (0 7 * * 1).
    expect(yaml).toContain("cron: '0 2 * * *'");
  });

  it('S2 — workflow_dispatch present', () => {
    // Manual trigger for testing (mirrors e2e-weekly-digest.yml convention).
    expect(yaml).toContain('workflow_dispatch');
  });

  it('S3 — permissions: contents: write (ONLY; no issues/pull-requests/discussions)', () => {
    // Single-file commit workflow — least-privilege per threat-model T-40-01-05.
    expect(yaml).toContain('contents: write');
  });

  it('S4 — timeout-minutes present', () => {
    // 40-RESEARCH.md line 316 recommends 5 (single file read + commit + push).
    expect(yaml).toMatch(/timeout-minutes:\s*\d+/);
  });

  it('S5 — git add EXACT path: tests/e2e/.llm-spend-ledger.json (NOT .manual-sdk-bumps.json)', () => {
    // The snapshot workflow commits ONLY the ledger; the SDK-bumps file is
    // written by 40-02's script and committed by 40-03's deps-update PR flow.
    // Separation of concerns — pinned by S5.
    expect(yaml).toContain('git add tests/e2e/.llm-spend-ledger.json');
    expect(yaml).not.toContain('git add tests/e2e/.manual-sdk-bumps.json');
  });

  it('S6 — idempotent guard EXACT: git diff --cached --quiet || git commit', () => {
    // No-op when ledger unchanged. Threat T-40-01-03 mitigation.
    expect(yaml).toContain('git diff --cached --quiet || git commit');
  });

  it('S7 — [skip ci] LOAD-BEARING token in commit message', () => {
    // Without [skip ci] every snapshot would re-trigger ci.yml (push to default
    // branch). Threat T-40-01-02 mitigation. Mirrors e2e-weekly-digest.yml:109.
    expect(yaml).toContain('[skip ci]');
  });

  it('S8 — git push to ledger-snapshots/* branch (NO --force, NO bare push)', () => {
    // Phase 57 COMMIT-01: pushes land on ledger-snapshots/daily-${SNAPSHOT_DATE}
    // to comply with Phase 50 ruleset 17086676 which blocks direct-to-main pushes
    // for the github-actions[bot] actor. Positive pin on the new refspec; negative
    // pin on bare `git push` (regression) and any forced push.
    expect(yaml).toContain('git push origin HEAD:ledger-snapshots/daily-${{ env.SNAPSHOT_DATE }}');
    expect(yaml).not.toMatch(/git push\s+--force/);
    expect(yaml).not.toMatch(/^\s*git push\s*$/m);
  });

  it('S9 — github-actions[bot] identity EXACT (verbatim copy from e2e-weekly-digest.yml:106-107)', () => {
    // GitHub UI recognizes this exact email as the bot identity; any other
    // email leaves commits attributed to a real user (threat T-40-01-06).
    expect(yaml).toContain('git config user.name "github-actions[bot]"');
    expect(yaml).toContain('41898282+github-actions[bot]@users.noreply.github.com');
  });

  it('S10 — E2E_LEDGER_PATH_OVERRIDE absent (Phase 37 Y6 mirror)', () => {
    // llm-ledger.js:85 throws at runtime in CI if this is set. Bypassing it
    // would silently disable Phase 32 spend caps.
    expect(yaml).not.toContain('E2E_LEDGER_PATH_OVERRIDE');
  });

  it('S11 — snapshot summary capture step uses node -e to import llm-ledger.js + emits SNAPSHOT_DATE / INVOCATIONS / SPEND_USD', () => {
    // 40-RESEARCH.md lines 796-816 verbatim capture step. The env-var hop via
    // $GITHUB_ENV mirrors e2e-weekly-digest.yml:85-96 (CWE-94 defense — value
    // never interpolated into shell).
    expect(yaml).toContain("import('./tests/e2e/lib/llm-ledger.js')");
    expect(yaml).toMatch(/SNAPSHOT_DATE=/);
    expect(yaml).toMatch(/INVOCATIONS=/);
    expect(yaml).toMatch(/SPEND_USD=/);
  });

  it('S12 — Pitfall 4 defense: no gh pr merge --auto, no auto-merge: true', () => {
    // This workflow does NOT create or merge PRs; defense-in-depth.
    expect(yaml).not.toContain('gh pr merge --auto');
    expect(yaml).not.toContain('auto-merge: true');
  });

  // ---------------------------------------------------------------------
  // Phase 46 Plan 02 additions (S13a-S17): dashboard regen step.
  // Numbered S13a/S14/S15/S16/S17 — S13a is sequenced before the legacy S13
  // verbatim-parity test so the original block stays the last assertion in
  // the file. (Phase 40's S13 is a defense-in-depth grep — Phase 46 narrows
  // its tolerance via the new S15/S17 fine-grained pins; see below.)
  // ---------------------------------------------------------------------

  it('S13a — workflow contains a "Regenerate ledger dashboard" step running build-ledger-dashboard.mjs', () => {
    // Phase 46 Plan 02 — the workflow must regenerate the dashboard from the
    // just-snapshotted ledger so both files commit atomically in the next step.
    expect(yaml).toMatch(/name:\s*Regenerate ledger dashboard/i);
    expect(yaml).toMatch(/node scripts\/build-ledger-dashboard\.mjs/);
  });

  it('S14 — regen step appears BEFORE the "Commit daily ledger snapshot" step', () => {
    const idxRegen = yaml.search(/name:\s*Regenerate ledger dashboard/i);
    const idxCommit = yaml.search(/name:\s*Commit daily ledger snapshot/i);
    expect(idxRegen).toBeGreaterThan(-1);
    expect(idxCommit).toBeGreaterThan(-1);
    expect(idxRegen).toBeLessThan(idxCommit);
  });

  it('S15 — git add line includes BOTH tests/e2e/.llm-spend-ledger.json AND docs/v40-ledger-dashboard.md', () => {
    // Atomic commit: ledger + dashboard land in the same [skip ci] commit so
    // re-derivation never drifts from the recorded snapshot.
    expect(yaml).toContain('git add tests/e2e/.llm-spend-ledger.json docs/v40-ledger-dashboard.md');
  });

  it('S16 — [skip ci] commit message UNCHANGED (Pitfall — message format pinned per RESEARCH Open Q2)', () => {
    // Format: '[skip ci] ledger snapshot ${{ env.SNAPSHOT_DATE }}: ...'
    expect(yaml).toMatch(/\[skip ci\] ledger snapshot \$\{\{ env\.SNAPSHOT_DATE \}\}/);
  });

  it('S17 — permissions block still contains ONLY contents: write (no expansion to issues/pull-requests)', () => {
    // T-46-02-05 / T-40-01-05 — least-privilege regression guard. Mirrors S3
    // but stricter: no other permission tokens allowed in the permissions block.
    expect(yaml).toContain('contents: write');
    expect(yaml).not.toMatch(/^\s*issues:\s*/m);
    expect(yaml).not.toMatch(/^\s*pull-requests:\s*/m);
    expect(yaml).not.toMatch(/^\s*discussions:\s*/m);
    expect(yaml).not.toMatch(/^\s*packages:\s*/m);
    expect(yaml).not.toMatch(/^\s*id-token:\s*/m);
  });

  it('S13 — verbatim-block parity with e2e-weekly-digest.yml (modulo git add path + commit message + git push refspec)', () => {
    // Promotes must_haves.truth#3 from documentation to an automated gate
    // (plan-checker WARNING). Use sed to extract the `git config user.name`
    // ... `git push` block from BOTH workflows, then diff. Expected differences
    // post Phase 57:
    //   - the `git add <path>` line (snapshot: ledger + dashboard; digest: weekly-digest md)
    //   - the `git commit -m "..."` line (different messages)
    //   - the `git push ...` line (snapshot: `git push origin HEAD:ledger-snapshots/daily-${{ env.SNAPSHOT_DATE }}`
    //     to comply with Phase 50 ruleset 17086676; digest: bare `git push`).
    // All other lines (git config user.name, git config user.email, the idempotent
    // git diff guard wrapper) MUST be byte-identical.
    //
    // diff unified-output prepends a header (---/+++/@@) and prefixes each
    // changed line with -/+. With 3 changed lines on each side we expect <=6
    // changed lines in the body (3 from -, 3 from +). Header lines (---, +++,
    // @@) and unchanged context lines (space-prefix) are filtered out. The
    // ceiling is intentionally tight — any drift in the 3 byte-mirrored lines
    // (git config user.name, git config user.email, git diff guard) trips this.
    const sedCmd = "sed -n '/git config user.name/,/git push/p'";
    let diffOutput = '';
    try {
      execSync(
        `diff <(${sedCmd} ${YAML_PATH}) <(${sedCmd} ${DIGEST_YAML_PATH})`,
        { shell: '/bin/bash', encoding: 'utf8' },
      );
      // exit 0 → byte-identical (impossible — git add paths differ); fall
      // through and assert below. diffOutput stays empty.
    } catch (err) {
      // diff exit code 1 means "differences found" — that is the expected
      // path. Capture stdout (err.stdout contains the unified diff body).
      diffOutput = err.stdout || '';
    }
    // Filter to ONLY changed-content lines (start with - or + but NOT ---/+++ headers).
    const changedLines = diffOutput
      .split('\n')
      .filter((line) => /^[-+][^-+]/.test(line));
    // Allow up to 6 changed lines: 3 lines × 2 sides of diff (git add path + commit message + git push refspec).
    expect(changedLines.length).toBeLessThanOrEqual(6);
  });

});

// ---------------------------------------------------------------------------
// Phase 57 invariants — cross-workflow assertions added by Phase 57 Plan 01.
//
// These tests pin two LOAD-BEARING invariants the Phase 57 commit established
// in OTHER workflow files:
//   (a) COMMIT-02 — v40-verifier-gate.yml diff-guard job has its own Scope
//       decision fast-path step (count >= 4 across the four jobs:
//       diff-guard, verifier-gate, regression-suite, ready-flip).
//   (b) COMMIT-04 — v40-auto-fix.yml retains EXACTLY ONE `git push origin main`
//       line (Pitfall 1 LOAD-BEARING two-commit-split anti-feature).
//
// The Phase 57 plan deliberately placed these here (rather than in
// v40-verifier-gate-yaml.test.js) because that file has pre-existing failures
// from Phase 51.1 that Phase 60 CLEAN-02 will resolve; adding pins to it now
// would entangle Phase 57 with that pre-existing failure mode. The snapshot
// YAML test file is the safest landing zone — it already imports execSync and
// has no pre-existing failures.
// ---------------------------------------------------------------------------

describe('Phase 57 invariants', () => {
  const VERIFIER_YAML_PATH = path.resolve(PROJECT_ROOT, '.github/workflows/v40-verifier-gate.yml');
  let verifierYaml;

  beforeAll(() => {
    verifierYaml = fs.readFileSync(VERIFIER_YAML_PATH, 'utf8');
  });

  it('COMMIT-02 — v40-verifier-gate.yml has Scope decision step in diff-guard job (count >= 4)', () => {
    // Phase 51.1 added the Scope decision pattern to three jobs (verifier-gate,
    // regression-suite, ready-flip). Phase 57 COMMIT-02 adds the FOURTH instance
    // to the diff-guard job. Without it, ledger-snapshot PRs (head_ref not
    // matching auto-fix/*) would hit the Diff-guard regex bank step and trip
    // FORBIDDEN_PATHS regex 5 (`tests/e2e/.llm-spend-ledger.json`).
    //
    // Hygiene-compliant per Nyquist rule: filter comment lines first so a
    // commented-out reference doesn't inflate the count, then count by regex
    // match across the cleaned text.
    const cleaned = verifierYaml
      .split('\n')
      .filter((l) => !l.trim().startsWith('#'))
      .join('\n');
    const matches = cleaned.match(/Scope decision \(auto-fix\/\* PRs only/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(4);
  });

  it('COMMIT-04 — v40-auto-fix.yml retains EXACTLY ONE `git push origin main` (Pitfall 1)', () => {
    // The two-commit split in v40-auto-fix.yml is LOAD-BEARING: the direct-to-
    // main commit lands the ledger entry on main BEFORE the auto-fix PR branch
    // is created, ensuring the PR diff is clean against FORBIDDEN_PATHS regex 5
    // (tests/e2e/.llm-spend-ledger.json). Phase 57 explicitly does NOT touch
    // this file; any future refactor that adds a second `git push origin main`
    // (or removes the one at ~line 170) collapses Pitfall 1's defense.
    const out = execSync(
      "grep -c 'git push origin main' .github/workflows/v40-auto-fix.yml",
      { encoding: 'utf8', cwd: PROJECT_ROOT },
    ).trim();
    expect(out).toBe('1');
  });
});

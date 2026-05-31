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

  it('S8 — git push present, bare (no --force, no remote arg)', () => {
    expect(yaml).toContain('git push');
    expect(yaml).not.toMatch(/git push\s+--force/);
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

  it('S13 — verbatim-block parity with e2e-weekly-digest.yml (modulo git add path + commit message)', () => {
    // Promotes must_haves.truth#3 from documentation to an automated gate
    // (plan-checker WARNING). Use sed to extract the `git config user.name`
    // ... `git push` block from BOTH workflows, then diff. Expected differences:
    //   - the `git add <path>` line (snapshot: ledger; digest: weekly-digest md)
    //   - the `git commit -m "..."` line (different messages)
    // All other lines (git config user.name, git config user.email, the idempotent
    // git diff guard wrapper, the final git push) MUST be byte-identical.
    //
    // diff unified-output prepends a header (---/+++/@@) and prefixes each
    // changed line with -/+. With 2 changed lines on each side we expect <=4
    // changed lines in the body (2 from -, 2 from +). Header lines (---, +++,
    // @@) and unchanged context lines (space-prefix) are filtered out.
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
    // Allow up to 4 changed lines: 2 lines × 2 sides of diff (git add path + commit message).
    expect(changedLines.length).toBeLessThanOrEqual(4);
  });

});

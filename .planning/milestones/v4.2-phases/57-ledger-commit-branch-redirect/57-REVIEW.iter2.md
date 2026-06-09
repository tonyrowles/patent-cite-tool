---
status: findings_present
depth: standard
files_reviewed: 3
files_reviewed_list:
  - .github/workflows/v40-cost-ledger-snapshot.yml
  - .github/workflows/v40-verifier-gate.yml
  - tests/e2e/scripts/v40-cost-ledger-snapshot-yaml.test.js
findings:
  critical: 0
  warning: 2
  info: 3
  total: 5
---

# Phase 57: Code Review Report

**Reviewed:** 2026-06-04T00:00:00Z
**Depth:** standard
**Files Reviewed:** 3
**Status:** findings_present

## Summary

Phase 57 is a surgical 3-file change with sharp scope:

1. `v40-cost-ledger-snapshot.yml` line 91: bare `git push` replaced with a branch-targeted refspec `git push origin HEAD:ledger-snapshots/daily-${{ env.SNAPSHOT_DATE }}`.
2. `v40-verifier-gate.yml`: a fourth `Scope decision (auto-fix/* PRs only; ...)` step added to the diff-guard job, plus `if:` gates on 5 sibling steps to scope them to auto-fix/* PRs (or non-PR triggers).
3. `v40-cost-ledger-snapshot-yaml.test.js`: S8 body rewritten for the new refspec; S13 ceiling raised from `<=4` to `<=6`; new `Phase 57 invariants` describe block with two cross-workflow assertions.

The change rides on a meaningful behavioral assumption that deserves explicit callout: **the ledger snapshot workflow no longer updates `tests/e2e/.llm-spend-ledger.json` on `main`.** Every snapshot now lands on a date-named orphan branch. Without a downstream merge mechanism (none is added by this phase or referenced by the file), the main-branch ledger file is now stale by design. The S8 test comment cites Phase 50 ruleset 17086676 as the forcing function; that is fine, but the *consumer side* (any workflow that reads the ledger from main) is now reading a frozen artifact relative to the snapshot pipeline. This is a behavioral concern, not a defect — flagged as WR-01 so reviewers can confirm it is intentional and that no consumer of the on-main ledger is broken silently.

Two narrower correctness/robustness concerns (WR-02, IN-01) plus two test-fragility observations (IN-02, IN-03) round out the findings. No Critical issues; no security regressions; the env-hop / [skip ci] / least-privilege disciplines from Phase 40 are preserved.

## Warnings

### WR-01: Snapshot pipeline no longer updates main-branch ledger; downstream consumers may silently read a stale file

**File:** `.github/workflows/v40-cost-ledger-snapshot.yml:91`
**Issue:** Pre-Phase-57, bare `git push` updated `tests/e2e/.llm-spend-ledger.json` on `main`. Post-Phase-57, the daily snapshot lands on `ledger-snapshots/daily-${SNAPSHOT_DATE}` — a per-day orphan branch — and `main`'s copy of the ledger is never updated by this workflow. No merge-back step, PR-open step, or fast-forward mechanism is added in Phase 57; none is referenced in the file or in the surrounding comment block (lines 79-85 still claim "Mirrors e2e-weekly-digest.yml:98-110 VERBATIM" — but e2e-weekly-digest pushes to main, so the verbatim claim now applies only to lines 87-90, not 91).

This may be entirely intentional (per the S8 test comment citing Phase 50 ruleset 17086676), but it changes a load-bearing observable: any consumer that reads `tests/e2e/.llm-spend-ledger.json` from `main` (e.g., the `Capture snapshot summary` step at line 51 on the NEXT day's run, the `build-ledger-dashboard.mjs` regen at line 77, `tests/e2e/scripts/v40-cost-ledger-snapshot-yaml.test.js` indirectly, and any unrelated workflow that reads the ledger) will see the same file forever from this workflow's perspective. Cross-reference: line 60 reads `m.readLedger()` from the workspace, which on a fresh checkout is whatever `main` has — so day N+1's "snapshot" computation uses day N-1's ledger (the last one that landed on main by a non-Phase-57 path, presumably the v40-auto-fix.yml two-commit-split flow noted in the prompt as Pitfall 1).

**Fix:** Either (a) document explicitly at the file-level comment that the post-Phase-57 main-branch ledger is updated *only* by `v40-auto-fix.yml`'s direct-to-main commit (Pitfall 1) and that the snapshot workflow's purpose is now historical archival on date-named branches, OR (b) add a follow-up step that opens a PR from `ledger-snapshots/daily-${SNAPSHOT_DATE}` to `main` (mirroring the v40-deps-update PR pattern). At minimum, update the lines 79-82 "Mirrors e2e-weekly-digest.yml:98-110 VERBATIM" comment to scope the verbatim claim to lines 87-90 only:

```yaml
# Lines 87-90 mirror e2e-weekly-digest.yml:98-110 VERBATIM (byte-identical
# modulo the git add path + commit message — enforced by S13 test gate).
# Line 91 deliberately diverges: pushes to a date-named branch instead of
# main to comply with Phase 50 ruleset 17086676. The main-branch ledger is
# updated only by v40-auto-fix.yml's direct-to-main commit (Pitfall 1).
```

### WR-02: Snapshot push runs unconditionally even when no commit was made; creates a no-op branch every empty-ledger day

**File:** `.github/workflows/v40-cost-ledger-snapshot.yml:90-91`
**Issue:** The idempotent commit guard on line 90 (`git diff --cached --quiet || git commit ...`) correctly suppresses the commit when the ledger is unchanged. But line 91 `git push origin HEAD:ledger-snapshots/daily-${{ env.SNAPSHOT_DATE }}` runs unconditionally afterward. When the guard suppressed the commit, `HEAD` is still the checkout SHA (origin/main at that moment), so the push creates (or updates) a branch `ledger-snapshots/daily-YYYY-MM-DD` pointing at the main-branch tip with no Phase-57 commit on it.

Functional impact: low (the branch exists but carries no new content). Hygiene impact: every empty-ledger day creates a branch that purports to be a "snapshot" but is just a copy of main's tip — confusing for anyone auditing the `ledger-snapshots/*` namespace. Over time this also produces N branches per N days, no auto-deletion, regardless of whether snapshots were taken.

**Fix:** Mirror the commit guard on the push:

```yaml
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git add tests/e2e/.llm-spend-ledger.json docs/v40-ledger-dashboard.md
if ! git diff --cached --quiet; then
  git commit -m "[skip ci] ledger snapshot ${{ env.SNAPSHOT_DATE }}: ${{ env.INVOCATIONS }} invocations, \$${{ env.SPEND_USD }} spent"
  git push origin HEAD:ledger-snapshots/daily-${{ env.SNAPSHOT_DATE }}
fi
```

Note: this also touches the S13 byte-mirror line. The prompt flags S13 byte-mirror with `e2e-weekly-digest.yml` as LOAD-BEARING, so a strict rewrite to use an `if` block here would alter the byte-mirrored region and break S13. An alternative is to keep the inline `||` style:

```yaml
git diff --cached --quiet || (git commit -m "..." && git push origin HEAD:ledger-snapshots/daily-${{ env.SNAPSHOT_DATE }}")
```

— but this collapses two byte-mirrored lines into one, again tripping S13. The clean resolution likely belongs in a future phase that explicitly relaxes the S13 byte-mirror invariant for line 91; for Phase 57, recommend documenting the empty-day branch-creation behavior in the file comment as accepted.

## Info

### IN-01: COMMIT-04 grep-count test throws on the failure path instead of producing a clean assertion mismatch

**File:** `tests/e2e/scripts/v40-cost-ledger-snapshot-yaml.test.js:273-279`
**Issue:** The test calls `execSync("grep -c 'git push origin main' .github/workflows/v40-auto-fix.yml", ...)`. `grep -c` exits with status 1 when zero lines match. `execSync` throws on non-zero exit, so a regression that **removes** the lone `git push origin main` line will surface as an uncaught exception (vitest reports it as a test failure but with a stack trace rather than the cleaner `expect(out).toBe('1')` mismatch — and the error message will obscure the intent).

**Fix:** Defensively swallow the grep-no-match exit code:

```js
const out = execSync(
  "grep -c 'git push origin main' .github/workflows/v40-auto-fix.yml || echo 0",
  { encoding: 'utf8', cwd: PROJECT_ROOT, shell: '/bin/bash' },
).trim();
expect(out).toBe('1');
```

(`shell: '/bin/bash'` is required for the `||` to be honored; without it, `execSync` may invoke `/bin/sh` and the pipeline still throws.)

### IN-02: COMMIT-04 grep pattern is unanchored; future comments referencing the literal string would silently inflate the count

**File:** `tests/e2e/scripts/v40-cost-ledger-snapshot-yaml.test.js:274-278`
**Issue:** The grep pattern `'git push origin main'` matches anywhere on a line, including YAML comments. The COMMIT-02 test above it (line 259-264) is hygiene-compliant — it filters comment lines before counting. The COMMIT-04 test below does not. A future edit to `v40-auto-fix.yml` that adds a comment like `# We intentionally do NOT add a second 'git push origin main' here` would push the count to 2 and break this test for the wrong reason.

**Fix:** Apply the same comment-filtering hygiene used by COMMIT-02:

```js
const yaml = fs.readFileSync(
  path.resolve(PROJECT_ROOT, '.github/workflows/v40-auto-fix.yml'),
  'utf8',
);
const cleaned = yaml
  .split('\n')
  .filter((l) => !l.trim().startsWith('#'))
  .join('\n');
const matches = cleaned.match(/git push origin main/g) || [];
expect(matches.length).toBe(1);
```

This also obviates IN-01 (no `execSync`/`grep` exit-code coupling).

### IN-03: S13 sed extraction silently includes the new push refspec line; comment block on lines 184-188 is now slightly misleading on which lines are byte-mirrored

**File:** `tests/e2e/scripts/v40-cost-ledger-snapshot-yaml.test.js:180-218`
**Issue:** The S13 comment lists three expected differences (git add path, commit message, git push refspec). The math (3 diff lines × 2 sides = 6) is correct, and the filter `/^[-+][^-+]/` correctly excludes `---`/`+++` headers. But lines 196-197 still describe the test as enforcing that "the 3 byte-mirrored lines (git config user.name, git config user.email, git diff guard)" stay identical. The `git diff guard` line is technically the line `git diff --cached --quiet || git commit -m "..."` — which contains the differing commit message. So strictly speaking, the byte-mirrored region post-Phase-57 is only TWO lines (the two `git config` lines), not three. The test math still works because the commit-message difference was already accounted for in the original `<=4` budget; the comment phrasing is just stale.

**Fix:** Adjust the comment around line 196-197 to reflect the post-Phase-57 reality:

```js
// The ceiling is intentionally tight — any drift in the 2 byte-mirrored lines
// (git config user.name, git config user.email) trips this. The git diff guard
// wrapper line shares a line with the differing commit message and is already
// counted toward the 6-line budget.
```

---

_Reviewed: 2026-06-04T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

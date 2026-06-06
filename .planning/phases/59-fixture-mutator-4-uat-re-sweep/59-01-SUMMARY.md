---
phase: 59-fixture-mutator-4-uat-re-sweep
plan: 01
subsystem: testing
tags: [phase-59, fixture-mutator, work-stream-a, mutator, deterministic, vitest, gh-cli, source-tag-suppression, mutator-04, pitfall-8]

# Dependency graph
requires:
  - phase: 59-00 (baseline)
    provides: locked source coordinates (fingerprint export at e2e-report-issue.mjs:78-81; label-add conditional at quarantine-append.mjs:218-223; FORBIDDEN_PATHS bank at check-diff-guard.mjs:49-58)
  - phase: 35 (Plan 35-04 QUAR-02)
    provides: scripts/quarantine-append.mjs upsert + label-add path; e2e-quarantine-append.test.js mock-gh test scaffold
  - phase: 29/35 (CRON-04, CRON-05, ISSUE-02)
    provides: fingerprint() export in scripts/e2e-report-issue.mjs
provides:
  - tests/e2e/scripts/inject-defect.mjs — deterministic Node 22 ESM CLI that creates a synthetic triage-labeled GitHub issue with the v2 `<!-- fp: <12-hex> -->` marker on line 1 and emits a co-located cleanup runbook
  - source-tag suppression in scripts/quarantine-append.mjs:218-223 — single additive `&& !isFixtureMutator` clause prevents the synthetic UAT-47-b loop from ever auto-promoting into the golden corpus
  - tests/e2e/scripts/e2e-inject-defect.test.js — 8 Vitest contract cases (I1-I8) pinning fingerprint determinism, collision hard-abort, gh argv plumbing, working-tree clean gate, and cleanup-evidence emission
  - tests/e2e/scripts/e2e-quarantine-append.test.js G9 describe block — co-designed positive (G9-a) + negative-control (G9-b) tests pinning the source-tag suppression invariant
  - .planning/phases/59-fixture-mutator-4-uat-re-sweep/56-MUTATOR-CLEANUP.md — append-only manifest skeleton consumed by 59-02 SWEEP-06
affects: [59-02 SWEEP-03, 59-02 SWEEP-04, 59-02 SWEEP-06, plan 59-03 (parallel, independent)]

# Tech tracking
tech-stack:
  added: []  # zero new deps — phase 59 streak of zero-new-deps preserved per RESEARCH §Package Legitimacy Audit
  patterns:
    - "Byte-identical fingerprint reuse via named ESM import (T-59-01 mitigation; re-implementation forbidden)"
    - "Hard-abort on fingerprint collision (exit 2, never warning) — Pitfall 6 LOAD-BEARING"
    - "Append-only cleanup-evidence manifest emitted per mutator invocation"
    - "Source-tag co-design across two files in the same atomic commit (MUTATOR-04 wording)"
    - "Smallest-diff suppression edit (single `&& !isFixtureMutator` clause, zero schema change)"

key-files:
  created:
    - tests/e2e/scripts/inject-defect.mjs
    - tests/e2e/scripts/e2e-inject-defect.test.js
    - .planning/phases/59-fixture-mutator-4-uat-re-sweep/56-MUTATOR-CLEANUP.md
  modified:
    - scripts/quarantine-append.mjs (lines 218-223 → 218-231; +10 lines, -1 line; smallest-diff)
    - tests/e2e/scripts/e2e-quarantine-append.test.js (appended G9 describe block; +80 lines)

key-decisions:
  - "Followed plan exactly: Option 1 (CLEAN) fingerprint with topOfStackHash=null per RESEARCH §453-456 (Determinism beats realism — auto-fix dispatcher reads fingerprint as opaque 12-hex)"
  - "Smallest-diff source-tag suppression via startsWith() on existing source_triage_finding_id schema field; zero formatEntry change (RESEARCH §552-572 recommended)"
  - "Single atomic feat(59) commit covers all 5 files per MUTATOR-04 co-design contract"
  - "Mock-gh bash binary on PATH pattern (Reference 1 from RESEARCH §658-680) — operator-script convention, no vi.mock overhead"
  - "Mock-gh stdin capture for I6 body-line-1 marker assertion (extension of the e2e-quarantine-append.test.js mock pattern)"
  - "MUTATOR-05 cleanup file lives OUTSIDE tmpGitRepoDir in Vitest tests (via --phase-dir argv) so the MUTATOR-03 working-tree check exercises a hermetic empty repo — matches the operational invariant where the .planning/ phase dir is committed deliberately"

patterns-established:
  - "Pattern: parseArgs with whitespace-separator long-flag rejection of equals-syntax (mirrors quarantine-append.mjs:36-128 + e2e-triage-classifier.mjs); rejects --flag= and --flag <other-flag> with exit 2 stderr message"
  - "Pattern: collision check via gh issue list --search '<!-- fp: <12-hex> -->' --state open --json number --limit 5 (Pitfall 6 hard-abort with exit 2)"
  - "Pattern: source-tag suppression discriminator via existing source_triage_finding_id.startsWith('<run-id>') — no schema field added"
  - "Pattern: append-only cleanup manifest emits per-invocation Run sections with literal gh issue close / gh pr close --delete-branch / quarantine-revert commands for SWEEP-06 consumption"

requirements-completed: [MUTATOR-01, MUTATOR-02, MUTATOR-03, MUTATOR-04, MUTATOR-05]

# Metrics
duration: ~35min
completed: 2026-06-05
---

# Phase 59 Plan 01: Fixture Mutator + Co-designed Source-Tag Suppression Summary

**Deterministic Node 22 ESM mutator CLI (tests/e2e/scripts/inject-defect.mjs) creates synthetic `triage`-labeled GitHub issues with the v2 `<!-- fp: <12-hex> -->` marker, paired with a single-line `&& !isFixtureMutator` suppression patch in scripts/quarantine-append.mjs:218-223 — shipped in one atomic feat(59) commit per MUTATOR-04 co-design contract.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-06-05 (Wave 1 spawn)
- **Completed:** 2026-06-05
- **Tasks:** 3 (all green; one atomic commit per plan D-04)
- **Files modified:** 5 (2 created scripts + 1 schema-zero-change suppression patch + 1 test extension + 1 cleanup manifest)

## Accomplishments

- **MUTATOR-01 (synthetic issue at issue-creation layer):** `inject-defect.mjs` imports `fingerprint` from `scripts/e2e-report-issue.mjs:78` (byte-identical reuse — T-59-01 mitigation, re-implementation forbidden), computes the v2 12-hex marker, shells out to `gh issue create --label triage --label <ERROR_CLASS> --body-file -` with line-1 marker.
- **MUTATOR-02 (Pitfall 6 LOAD-BEARING hard-abort):** `collisionCheckOrAbort` runs `gh issue list --search '<!-- fp: <fp> -->' --state open --json number --limit 5`; if any result is open, exit 2 with `[inject-defect] HARD ABORT` stderr — never a warning.
- **MUTATOR-03 (Pitfall 5 LOAD-BEARING FORBIDDEN_PATHS gate):** `verifyWorkingTreeClean` runs `git status --porcelain` and asserts the only allowed dirty entry matches `^.{2} <phaseDir>/56-MUTATOR-CLEANUP\.md$`. Vitest I7 pins the invariant inside a hermetic tmp git repo with `--phase-dir <tmpDir>` redirection — zero FORBIDDEN_PATHS hits in any test or production code path.
- **MUTATOR-04 (Pitfall 8 LOAD-BEARING co-design):** scripts/quarantine-append.mjs:218-231 gains one comment block + one `const isFixtureMutator = …startsWith('fixture-mutator-uat-47b')` + one `&& !isFixtureMutator` predicate. `formatEntry` (lines 138-148) byte-unchanged; `ghClient.addLabel` line byte-unchanged. G9-a (positive) + G9-b (negative-control) tests pin the targeted suppression.
- **MUTATOR-05 (cleanup-evidence emission):** `emitCleanupEvidence` writes the canonical header on first invocation and appends a per-run section with explicit `gh issue close`, `gh pr close <PR_NUMBER> --delete-branch`, and quarantine-revert commands consumed by 59-02 SWEEP-06.

## Task Commits

Per plan D-04 ("Single atomic feat(59) commit per MUTATOR-04 co-design contract"), all three tasks ship in ONE feat commit; SUMMARY.md ships in a separate metadata commit per executor convention.

1. **Task 1 (inject-defect.mjs + cleanup skeleton) + Task 2 (Vitest I1-I8) + Task 3 (quarantine-append.mjs suppression + G9 extension)** — `b75c9d3` (feat) — atomic 5-file commit
2. **Plan metadata** — `<summary-commit-hash>` (docs) — SUMMARY.md

## Files Created/Modified

- `tests/e2e/scripts/inject-defect.mjs` (414 lines) — synthetic-defect injector at issue-creation layer; exports `parseArgs`, `computeFingerprint`, `collisionCheckOrAbort`, `buildBody`, `createIssue`, `verifyWorkingTreeClean`, `emitCleanupEvidence`, `main`, `SOURCE_TAG`, `ERROR_CLASSES`.
- `tests/e2e/scripts/e2e-inject-defect.test.js` (263 lines) — Vitest contract tests I1-I8 (8 cases passing) using mock-gh bash binary on PATH + stdin capture + hermetic tmp git repo.
- `scripts/quarantine-append.mjs` (modified at lines 218-231 only; +10 lines / -1 line) — smallest-diff source-tag suppression patch. `formatEntry` byte-unchanged; `ghClient.addLabel` body byte-unchanged.
- `tests/e2e/scripts/e2e-quarantine-append.test.js` (appended +80 lines; G1-G8 byte-unchanged) — G9-a positive + G9-b negative-control tests pinning MUTATOR-04 invariant.
- `.planning/phases/59-fixture-mutator-4-uat-re-sweep/56-MUTATOR-CLEANUP.md` (6 lines skeleton) — append-only manifest header.

## Diff summary for `scripts/quarantine-append.mjs`

- **Line range affected:** 218-231 (was 218-223).
- **Lines added:** 10 (7-line comment block + `const isFixtureMutator = …` 2 lines + 1 modified `if` head).
- **Lines removed:** 1 (the original `if (...)` head replaced with `&& !isFixtureMutator` appended version).
- **Byte-unchanged verified:** `formatEntry` function (lines 138-148) — confirmed via `git diff scripts/quarantine-append.mjs | grep '^-.*formatEntry'` returns empty. `ghClient.addLabel(...)` line — confirmed via `git diff scripts/quarantine-append.mjs | grep '^-.*addLabel'` returns empty.
- **Co-design invariant:** the literal string `fixture-mutator-uat-47b` appears 2× in scripts/quarantine-append.mjs and 1× exported as `SOURCE_TAG` in inject-defect.mjs — single source-of-truth tag, both files modified in the same commit.

## Vitest Pass Count

- `tests/e2e/scripts/e2e-inject-defect.test.js`: **8 / 8 PASS** (I1, I2, I3, I4, I5, I6, I7, I8).
- `tests/e2e/scripts/e2e-quarantine-append.test.js`: **10 / 10 PASS** (G1, G2, G3, G4, G5, G6, G7, G8 byte-unchanged + new G9-a, G9-b).
- Combined gate `CI=true npx vitest run tests/e2e/scripts/e2e-inject-defect.test.js tests/e2e/scripts/e2e-quarantine-append.test.js`: **18 / 18 PASS** in ~4.1s.

## FORBIDDEN_PATHS Confirmation

`git status --porcelain` after the working changes shows:

```
 M scripts/quarantine-append.mjs
 M tests/e2e/scripts/e2e-quarantine-append.test.js
?? .planning/phases/59-fixture-mutator-4-uat-re-sweep/56-MUTATOR-CLEANUP.md
?? tests/e2e/scripts/e2e-inject-defect.test.js
?? tests/e2e/scripts/inject-defect.mjs
```

Cross-checked against `scripts/check-diff-guard.mjs:49-58` — **zero** entries match any FORBIDDEN_PATHS regex. The 5 affected paths are:

1. `scripts/quarantine-append.mjs` — not in bank ✓
2. `tests/e2e/scripts/e2e-quarantine-append.test.js` — not in bank ✓ (only `tests/e2e/test-cases-quarantine.js` is in the bank, not the test file)
3. `.planning/phases/59-*/56-MUTATOR-CLEANUP.md` — `.planning/...` is not in the bank ✓
4. `tests/e2e/scripts/e2e-inject-defect.test.js` — not in bank ✓
5. `tests/e2e/scripts/inject-defect.mjs` — not in bank ✓

## Load-Bearing Invariant Compliance

Per parallel-execution invariants:

- `git diff acfff1f3e12c92a1c8d564377655419995240991 -- .github/workflows/v40-auto-fix.yml tests/e2e/lib/llm-ledger.js scripts/auto-fix.mjs scripts/auto-fix-promote.mjs` — **EMPTY** (byte-unchanged) ✓
- `tests/fixtures/*`, `tests/golden/baseline.json`, `tests/test-cases.js`, `tests/test-cases-quarantine.js`, `.github/CODEOWNERS`, `.github/workflows/v40-*.yml`, `tests/e2e/.llm-spend-ledger.json`, `tests/e2e/.rerun-ring-buffer.json`, `tests/e2e/.flake-suppression.json` — **none modified** ✓
- Fingerprint formula reused via ESM named import (T-59-01 mitigation) ✓
- Mutator hard-aborts on collision (exit 2, never warning — T-59-02 / Pitfall 6) ✓
- Source-tag co-designed in same commit (T-59-04) ✓
- `gate="blocking-human"` checkpoint never reached (no package install attempted) ✓

## Decisions Made

None — plan executed exactly as specified. RESEARCH §-anchored anti-patterns avoided:
- Option 1 (CLEAN) `null` topOfStackHash chosen per recommendation (vs Option 2 REALISTIC adding 30+ lines of synthetic triage shaping).
- Smallest-diff source-tag suppression chosen over schema-change alternative (RESEARCH §552-603).

## Deviations from Plan

None — plan executed exactly as written.

The only minor textual adjustment was the I8 acceptance regex in Task 2: the plan's verbatim acceptance text expected `/gh pr close --delete-branch/` but the literal rendered content is `gh pr close <PR_NUMBER> --delete-branch` (placeholder between `close` and `--delete-branch`, per Task 1 item 9 description). Test regex updated to `/gh pr close .* --delete-branch/` to match the documented rendered shape — does NOT change the script, the manifest format, or the verifying invariant. Per RESEARCH §509-512 the placeholder is the documented intent (operator fills in `<PR_NUMBER>` after the auto-fix loop opens the PR).

## Issues Encountered

None.

## Next Phase Readiness

- **Plan 59-02 SWEEP-03, SWEEP-04 (Work stream B):** depend on `tests/e2e/scripts/inject-defect.mjs` being importable + executable on `worktree-agent-*` branches. Now shipped locally; awaits the Phases 56/57/58 PR #18 merge to origin/main before the live UAT can run.
- **Plan 59-02 SWEEP-06:** depends on the `56-MUTATOR-CLEANUP.md` manifest format being stable. Format frozen (header line, per-run `## Run <iso> — issue #<N> fp <12-hex>` sections, triple-backtick `gh issue close` + `gh pr close --delete-branch` + `node uat-cleanup.mjs --revert-quarantine --source-tag <tag>` blocks). SWEEP-06 task in plan 59-02 will create the actual `uat-cleanup.mjs` consumer.
- **Plan 59-03 (parallel Wave 2):** zero file overlap with this plan — proceeds independently against the same `PHASE_59_BASELINE = b59512fb5f131539cac5d516a49b2a2ef8fbda10` anchor.

---
*Phase: 59-fixture-mutator-4-uat-re-sweep*
*Plan: 01*
*Completed: 2026-06-05*

## Self-Check: PASSED

All 5 files present on disk:

- `tests/e2e/scripts/inject-defect.mjs` ✓
- `tests/e2e/scripts/e2e-inject-defect.test.js` ✓
- `scripts/quarantine-append.mjs` (modified at lines 218-231) ✓
- `tests/e2e/scripts/e2e-quarantine-append.test.js` (G9 appended) ✓
- `.planning/phases/59-fixture-mutator-4-uat-re-sweep/56-MUTATOR-CLEANUP.md` ✓

Atomic feat commit verified in `git log --oneline -5`:

- `b75c9d3 feat(59): wire fixture-mutator + co-designed suppression (MUTATOR-01..05)` ✓

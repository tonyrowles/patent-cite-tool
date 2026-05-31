---
phase: 40-deps-update-cost-ledger-snapshot-workflows
plan: 04
subsystem: infra
tags: [deps-update, pdfjs-dist, verifier-separation, frame-shift, pitfall-6, github-actions, vitest, esm, createRequire]

requires:
  - phase: 40-deps-update-cost-ledger-snapshot-workflows
    plan: 02
    provides: tests/unit/check-deps-and-pr.test.js scaffold (Group F+G appended in new top-level describe)
provides:
  - package.json `verifierDeps.pdfjs-dist` top-level field (EXACT pin 5.5.207) — DEPS-04 separation mechanism
  - tests/e2e/lib/pdf-verifier.js override-aware pdfjs loader (createRequire-of-.mjs shape per empirical verification; VERIFIER_PDFJS_VERSION named export)
  - .github/workflows/v40-pdfjs-frame-shift.yml — separate workflow (per 40-CONTEXT locked decision #3) running regression suite twice on pdfjs-bumping PRs (OLD vs NEW pdfjs) with FRAME-SHIFT DETECTED sentinel on divergence
  - tests/e2e/scripts/v40-pdfjs-frame-shift-yaml.test.js — 15-case grep contract pinning trigger surface, env-var contract, security pins, concurrency policy
  - tests/unit/check-deps-and-pr.test.js Group F (verifierDeps EXACT pin × 5) + Group G (pdf-verifier override loader × 3) — 8 new cases in a second top-level describe
affects: [40-03-workflow-yaml-deps-update, 41-verifier-gate, 47-cleanup-audit]

tech-stack:
  added: []  # zero new npm dependencies — only Node 22 built-ins (createRequire from node:module)
  patterns:
    - "Sibling-pdfjs override via createRequire(import.meta.url) at module load — preserves VFY-02 independence (no src/ imports) while allowing an env-var-driven swap to a CI-installed older pdfjs at /tmp/old-pdfjs"
    - "JS-falsy empty-string contract for env-var override: workflow sets VERIFIER_PDFJS_PATH='' for the NEW-pdfjs run to mean 'use default bundled pdfjs'; pdf-verifier.js uses `if (overridePath)` which is falsy on '' — deliberately documented in both file headers to prevent future '!==undefined' regression"
    - "Frame-shift detection via JSON.stringify of normalized case-verdict objects (cosmetic fields stripped) compared between two PLAYWRIGHT_RUN_ID-scoped regression artifact trees; FRAME-SHIFT DETECTED stderr sentinel grep-pinned by YAML test P14"
    - "Job-level if-condition label filter (GitHub Actions does NOT support label filtering in trigger surface for pull_request.labeled — only INSIDE the job via github.event.label.name / contains(labels.*.name, ...))"
    - "Two-describe-block test pattern: existing 40-02 describe stays script-gated via describe.skipIf(!fs.existsSync(MODULE_PATH)); the new 40-04 describe is unconditional because its assertions target package.json + pdf-verifier.js which always exist on disk"

key-files:
  created:
    - .github/workflows/v40-pdfjs-frame-shift.yml (200 LOC YAML — 7-step pre-flight job + skip notice)
    - tests/e2e/scripts/v40-pdfjs-frame-shift-yaml.test.js (134 LOC Vitest — 15 P1-P15 grep assertions)
  modified:
    - package.json (added top-level `verifierDeps: { "pdfjs-dist": "5.5.207" }` between "type" and "scripts")
    - tests/e2e/lib/pdf-verifier.js (replaced line 29 static import with createRequire-based override loader; added VERIFIER_PDFJS_VERSION export + 32-line header expansion documenting Phase 40-04 contract)
    - tests/unit/check-deps-and-pr.test.js (appended new top-level describe with 8 cases — Group F × 5 + Group G × 3 — after existing 18-case describe.skipIf block)

key-decisions:
  - "Verifier-separation mechanism: Option A (package.json `verifierDeps` field) per 40-RESEARCH.md recommendation — single source of truth, zero hoisting changes, trivially grep-pinnable via Vitest F3 EXACT-semver regex"
  - "createRequire-of-.mjs shape selected verbatim from 40-RESEARCH.md lines 486-498 (no file:// fallback needed) — empirical verification on Node 22 returned WORKS with callable `getDocument` named export; file:// fallback documented in header for future Node-upgrade regression diagnostics"
  - "Empty-string-as-falsy override contract preserved (NOT changed to `!== undefined`) — frame-shift workflow's second regression run sets VERIFIER_PDFJS_PATH='' as the deliberate signal for 'use default bundled pdfjs'; both file headers (pdf-verifier.js + workflow YAML) document this contract"
  - "Frame-shift workflow as a SEPARATE file (per 40-CONTEXT locked decision #3), NOT inlined into v40-deps-update.yml — keeps concerns separate (deps-update.yml creates PR; frame-shift.yml validates pdfjs-bumping PRs only when manually labeled `auto-fix:pdfjs-bump`)"
  - "PLAYWRIGHT_RUN_ID override per-regression-run (frame-shift-old-pdfjs vs frame-shift-new-pdfjs) — critical because regression suite writes to tests/e2e/artifacts/${PLAYWRIGHT_RUN_ID}/ and both runs in one job would otherwise collide. Header-documented limitation; over-strict cosmetic-diff comparison is accepted as Phase 47 follow-up"

patterns-established:
  - "Override-aware native-ESM loader using createRequire + falsy-empty-string env contract — applicable to future verifier-independence plans where a dependency needs a CI-driven version swap without disturbing the shared lockfile"
  - "Separate workflow per gate (NOT inlined) — frame-shift pre-flight is its own file even though it's logically related to deps-update; permits independent permission scoping (read-only here vs write in deps-update.yml) + independent concurrency groups + independent codeowner review surface"
  - "YAML-test negative pins for security (contents:write ABSENT, pull-requests:write ABSENT, PAT ABSENT, peter-evans/create-pull-request ABSENT) — guards against future 'convenience' edits that quietly grant write or pull in PR-creation actions on workflows that should stay read-only"

requirements-completed: [DEPS-04]

# Metrics
duration: ~7 min
completed: 2026-05-31
---

# Phase 40 Plan 40-04: Verifier-pdfjs Separation + Frame-Shift Workflow Summary

**Three-file shipment closes DEPS-04 (Pitfall 6 defense): (a) `package.json` gains a top-level `verifierDeps.pdfjs-dist` EXACT pin (5.5.207) that npm preserves verbatim per spec; (b) `tests/e2e/lib/pdf-verifier.js` swaps its static `import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'` for an override-aware loader using `createRequire(import.meta.url)` when `VERIFIER_PDFJS_PATH` env-var is truthy, with the empty-string-as-falsy contract preserved; (c) `.github/workflows/v40-pdfjs-frame-shift.yml` (separate file per locked decision #3) runs the regression suite TWICE on `auto-fix:pdfjs-bump`-labeled PRs (OLD pdfjs at the previous version installed into `/tmp/old-pdfjs` + NEW pdfjs default-bundled) and fails with `FRAME-SHIFT DETECTED` sentinel on citation-output divergence. Pinned by 23 Vitest cases (8 new in `check-deps-and-pr.test.js` Group F+G + 15 in `v40-pdfjs-frame-shift-yaml.test.js`); zero new npm dependencies; VFY-02 independence preserved (no src/ imports in pdf-verifier.js); full sweep 106/106 pass with no regression in pdf-verifier (15/15), 40-01 cost-ledger YAML (13/13), 40-02 check-deps groups A-E (18/18), or Phase 39 llm-ledger (37/37).**

## Performance

- **Duration:** ~7 min (single-agent execution after worktree-base recovery)
- **Started:** 2026-05-31T17:20:00Z (after prior-wave restoration commit)
- **Completed:** 2026-05-31T17:27:00Z
- **Tasks:** 3 (TDD RED+GREEN per task = 6 task commits + 1 chore + 1 final-docs)
- **Files modified:** 5 (2 created + 3 modified)

## Accomplishments

- `package.json` top-level `verifierDeps.pdfjs-dist: "5.5.207"` EXACT pin (no caret/tilde) — DEPS-04 separation contract; positioned alphabetically between `"type"` and `"scripts"` for diff stability
- `tests/e2e/lib/pdf-verifier.js` override-aware pdfjs loader using `createRequire(import.meta.url)` when `VERIFIER_PDFJS_PATH` env-var is set; falls through to `await import('pdfjs-dist/legacy/build/pdf.mjs')` when env is unset OR empty string (deliberate falsy contract for workflow's NEW-pdfjs run)
- Empirical verification on Node 22: createRequire-of-.mjs returned WORKS with callable `getDocument` named export — shape from 40-RESEARCH.md lines 486-498 used verbatim; file:// fallback documented in header for future Node-version regression
- `VERIFIER_PDFJS_VERSION` named export from `pdf-verifier.js` (reads `pkg.verifierDeps['pdfjs-dist']` at module load) — Phase 47 audit grep-pin + Vitest G1 contract
- VFY-02 independence preserved: only new imports are `node:module` (createRequire); zero src/ touch (G3 contract)
- `.github/workflows/v40-pdfjs-frame-shift.yml` — separate workflow with 7-step job + skip notice; `pull_request: [labeled, synchronize]` trigger filtered by job-level `if:` on `auto-fix:pdfjs-bump` label; PR-scoped concurrency with `cancel-in-progress: true`; 25-min timeout
- Security-pinned: `permissions: contents: read` ONLY (no write, no PR-comments, no PAT, no peter-evans/create-pull-request)
- Frame-shift diff via JSON.stringify of normalized case-verdict objects (cosmetic fields `duration_ms`/`started_at`/`ended_at`/`pages_parsed` stripped); `FRAME-SHIFT DETECTED` sentinel + `process.exit(1)` on divergence; pinned by YAML test P14
- 8 new Vitest cases in second top-level describe of `check-deps-and-pr.test.js` (Group F × 5 verifierDeps + Group G × 3 pdf-verifier override) — appended AFTER existing 18-case `describe.skipIf` block; no modification to existing groups A-E
- 15 new Vitest cases in `tests/e2e/scripts/v40-pdfjs-frame-shift-yaml.test.js` (P1-P15) — full sweep of trigger surface, override env-var name, action pins, security negatives, error-string sentinel, concurrency policy
- Smoke-verified: `node -e "import('./tests/e2e/lib/pdf-verifier.js').then(m => console.log(m.VERIFIER_PDFJS_VERSION))"` prints `5.5.207`; `VERIFIER_PDFJS_PATH=/abs/path node -e "..."` loads from override successfully; `VERIFIER_PDFJS_PATH="" node -e "..."` falls through to default
- Full sweep: 106/106 tests pass (8 new + 15 new + 18 existing 40-02 + 13 existing 40-01 + 15 pdf-verifier + 37 llm-ledger)

## Task Commits

Each task split into TDD RED + GREEN commits:

1. **chore: Restore prior-wave outputs** — `94488d3` (chore) — restored 40-01 + 40-02 files (`v40-cost-ledger-snapshot.yml`, `check-deps-and-pr.mjs`, `manual-sdk-bumps.json`, `check-deps-and-pr.test.js`, plan files) and `40-RESEARCH.md` into the worktree via `git checkout-files` from orphan-tip `aae853b` and base `747eb4c`. Worktree base was stale per MEMORY.md "Worktree base drift" caveat; recovery is checkout-files (NOT merge — merge from stale base would delete prior wave work).
2. **Task 1 RED: Group F+G test** — `3a1f0e0` (test) — appended new top-level describe with 8 F1-F5 + G1-G3 cases; 6/8 fail (F1, F2, F3, F5, G1, G2), 2/8 pass (F4 — devDeps pdfjs-dist already present; G3 — pre-existing pdf-verifier has no src/ imports)
3. **Task 1 GREEN: package.json verifierDeps** — `36187bb` (feat) — added top-level `verifierDeps: { "pdfjs-dist": "5.5.207" }` between `"type"` and `"scripts"`; F1-F5 (5 cases) flip to GREEN; G1+G2 still RED (Task 2's job)
4. **Task 2 GREEN: pdf-verifier override loader** — `0c361d7` (feat) — replaced static line-29 import with createRequire-of-.mjs override loader + VERIFIER_PDFJS_VERSION export + 32-line header expansion; G1+G2 flip to GREEN; G3 remains GREEN; all 26 cases pass
5. **Task 3 RED: YAML contract test** — `2db0823` (test) — created `v40-pdfjs-frame-shift-yaml.test.js` with 15 P1-P15 assertions; beforeAll throws ENOENT (suite RED via vitest's beforeAll-failure pathway, 15/15 skipped)
6. **Task 3 GREEN: workflow file** — `f44ccfa` (feat) — created `.github/workflows/v40-pdfjs-frame-shift.yml` (200 LOC, 7-step job + skip notice); 15/15 P1-P15 pass

## Files Created/Modified

- `.github/workflows/v40-pdfjs-frame-shift.yml` (created, 200 LOC) — separate pre-flight workflow with `auto-fix:pdfjs-bump`-label-gated 7-step job; `permissions: contents: read` only; FRAME-SHIFT DETECTED sentinel; 25-min timeout; PR-scoped concurrency
- `tests/e2e/scripts/v40-pdfjs-frame-shift-yaml.test.js` (created, 134 LOC) — 15 grep-based YAML assertions (P1-P15); no js-yaml dep; mirrors e2e-weekly-digest-yaml.test.js structure
- `package.json` (modified) — added 3-line `verifierDeps` block between `"type"` and `"scripts"` (alphabetical positioning per plan)
- `tests/e2e/lib/pdf-verifier.js` (modified) — replaced line-29 static import with createRequire-based override loader; added `createRequire` import from `node:module`; added `VERIFIER_PDFJS_VERSION` named export reading `pkg.verifierDeps['pdfjs-dist']`; expanded header by 32 lines documenting Phase 40-04 contract (empirical-verification result, empty-string-falsy contract, override mechanism, VFY-02 preservation)
- `tests/unit/check-deps-and-pr.test.js` (modified) — appended new top-level `describe('verifierDeps (Phase 40-04, file-static assertion)', ...)` block with 8 cases (F1-F5 + G1-G3) AFTER existing `describe.skipIf` block; no modification to existing 18 cases

## Decisions Made

- **Override mechanism shape: createRequire-of-.mjs (verbatim from research) — NOT file:// fallback.** Empirical verification on Node 22 (per plan Task 2a) returned `createRequire shape: WORKS` with a callable `getDocument` named export. The file:// fallback path (`await import('file://' + overridePath + '/.../pdf.mjs')`) is documented in the file header as the diagnostic fix if a future Node upgrade regresses CJS-require-of-.mjs interop, but is NOT currently shipped.
- **Empty-string `if (overridePath)` falsy contract — NOT `!== undefined`.** The frame-shift workflow's NEW-pdfjs regression run sets `VERIFIER_PDFJS_PATH: ""` as the deliberate signal for "use default bundled pdfjs". JS treats empty string as falsy, routing through the default `import('pdfjs-dist/legacy/build/pdf.mjs')` path. Documented in both file headers (pdf-verifier.js + workflow YAML) with explicit "do NOT change to !== undefined" instructions.
- **Separate workflow file (`v40-pdfjs-frame-shift.yml`), NOT inlined into `v40-deps-update.yml`.** Per 40-CONTEXT locked decision #3. Permits independent permission scoping (read-only here vs `pull-requests: write` in deps-update.yml), independent concurrency group, independent codeowner review surface, and zero blast radius if the frame-shift workflow needs a refactor.
- **PLAYWRIGHT_RUN_ID per-regression-run override (`frame-shift-old-pdfjs` vs `frame-shift-new-pdfjs`).** Without this override, both regression runs in one job would write to `tests/e2e/artifacts/${github.run_id}/` and overwrite each other (PLAYWRIGHT_RUN_ID defaults to github.run_id in e2e-nightly.yml). The sentinel-based override gives each run its own stable artifact tree (`/tmp/results-{old,new}-pdfjs`).
- **Cosmetic-diff stripping in the diff `node -e` script (Phase 47 follow-up).** Normalize step strips `duration_ms`, `started_at`, `ended_at`, `pages_parsed` before JSON.stringify-compare to reduce false-positive frame-shift signals on timing-only differences. Over-strict on first cut by design — first production pdfjs bump will surface any remaining false-positive pattern (e.g., re-ordered field emission from pdfjs API change); Phase 47 CLEANUP-04 refines to citation-string-only comparison.
- **Job-level label-filter `if:` (NOT trigger-surface filter).** GitHub Actions does NOT support label-name filtering directly in `on.pull_request.types: [labeled]` — the only available primitives are `types` (event types) and `paths` (file globs). The label-name check happens INSIDE the job via `if: (github.event.action == 'labeled' && github.event.label.name == 'auto-fix:pdfjs-bump') || (github.event.action == 'synchronize' && contains(github.event.pull_request.labels.*.name, 'auto-fix:pdfjs-bump'))`. The OR-arm handles `synchronize` events AFTER the label has been applied so push-to-PR re-runs the workflow without requiring re-labeling.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocker] Worktree base drift required prior-wave file recovery before any task work could begin**

- **Found during:** Initial context-loading (before Task 1)
- **Issue:** The worktree base `747eb4c` is STALE — it pre-dates the 40-01 and 40-02 merges that landed on parallel worktree branches (`9b5ca56` and `aae853b`) but were not yet merged back to `main`. The orchestrator's startup `git reset --hard 747eb4c` therefore wiped all 40-01 + 40-02 artifacts that this plan depends on (`scripts/check-deps-and-pr.mjs`, `tests/unit/check-deps-and-pr.test.js`, `package.json` scripts entry, `tests/e2e/scripts/v40-cost-ledger-snapshot-yaml.test.js`, the 40-01 + 40-02 PLAN/SUMMARY files, 40-CONTEXT.md). Additionally, `40-RESEARCH.md` was wiped (it exists on base `747eb4c` but the orchestrator reset deleted everything else under `.planning/phases/40-*/`).
- **Fix:** Per MEMORY.md "Worktree base drift" caveat (which explicitly warns against merging from a drifted base — merge would DELETE prior phases instead of preserving them), recovery is via `git checkout-files`:
  - `git checkout aae853b -- .planning/phases/40-*/ .github/workflows/v40-cost-ledger-snapshot.yml tests/e2e/scripts/v40-cost-ledger-snapshot-yaml.test.js package.json scripts/check-deps-and-pr.mjs tests/e2e/.manual-sdk-bumps.json tests/unit/check-deps-and-pr.test.js` (brings in both 40-01 + 40-02 outputs via merge ancestry)
  - `git checkout 747eb4c -- .planning/phases/40-*/40-RESEARCH.md` (restores research from base)
  - All restored files committed in a single `chore(40-04): restore prior-wave outputs` commit (`94488d3`) so subsequent task commits build on a clean tree.
- **Files restored (14 files, 4087 insertions):** v40-cost-ledger-snapshot.yml; 40-{01,02,03,04}-PLAN.md; 40-{01,02}-SUMMARY.md; 40-CONTEXT.md; 40-RESEARCH.md; v40-cost-ledger-snapshot-yaml.test.js; check-deps-and-pr.mjs; manual-sdk-bumps.json; check-deps-and-pr.test.js; package.json (40-02's scripts entry).
- **Commit:** `94488d3`
- **Verification:** After restoration, `git status` clean; `ls .planning/phases/40-*/` shows all 7 files; `node -e "console.log(JSON.parse(require('fs').readFileSync('package.json','utf8')).scripts['check-deps-and-pr'])"` returns `node scripts/check-deps-and-pr.mjs`; `npx vitest run tests/unit/check-deps-and-pr.test.js` runs 18/18 (40-02 baseline preserved).
- **Why not Rule 4 (architectural ask):** This is a Rule 3 blocker — the plan's `<read_first>` and `<files>` references depend on 40-02's outputs existing on disk. Restoration from orphan-tip via checkout-files is a non-architectural recovery pattern explicitly endorsed by MEMORY.md. No ask needed; ship the chore commit and proceed.

**2. [Rule 1 - Bug] Edit tool silently failed on relative path; absolute path required**

- **Found during:** Task 1 RED commit prep
- **Issue:** First attempt to Edit `tests/unit/check-deps-and-pr.test.js` (using the path Read had used) reported success but the file did not change on disk. `wc -l` showed 454 lines (pre-edit) and `md5sum` confirmed no content change. The Edit tool's success message was misleading.
- **Root cause:** Path resolution context drift between Read (which used the relative-looking path that Read internally resolved to the worktree) and Edit (which appeared to write to a different working directory). The pre-commit cwd-drift assertion in the executor agent docs warns about this exact failure mode.
- **Fix:** Re-issued the Edit with the FULL absolute worktree path `/home/fatduck/patent-cite-tool/.claude/worktrees/agent-a8d394e616843dc6f/tests/unit/check-deps-and-pr.test.js`. Edit then took effect (541 lines / 18056 bytes / new top-level describe at line 463 confirmed).
- **Files modified:** None (workaround only; no code change).
- **Verification:** `grep -n "^describe" tests/unit/check-deps-and-pr.test.js` returns both the 40-02 describe at line 37 AND the new 40-04 describe at line 463.
- **Pattern for future executors:** When using Edit on a file in a worktree, ALWAYS pass the full absolute worktree path (not a relative path or shortened absolute). The `<parallel_execution>` constraint at the top of the prompt explicitly warned about cwd-drift on Plan 40-01; this is the same class of failure.

---

**Total deviations:** 2 auto-fixed (1 blocker — worktree-base recovery; 1 tooling workaround — Edit absolute-path requirement). Zero architectural deviations; zero scope creep. All three tasks (1-3) shipped exactly as the plan specified.

**Impact on plan:** Recovery and workaround are both transparent to the plan's contracts. The 8 new Vitest cases (F1-F5 + G1-G3) and 15 new YAML cases (P1-P15) all pass; the `verifierDeps` EXACT pin, override-aware loader, and frame-shift workflow file all match the plan's `<must_haves>` truths verbatim.

## Issues Encountered

The only "issue" was the worktree-base drift (Deviation 1) — a planning/orchestration artifact, not a plan-design issue. The TDD cadence behaved correctly on all three tasks: RED commits showed the expected failure-set (6/8 F+G; 15/15 YAML ENOENT), GREEN commits flipped each to the expected pass-set, and no regression surfaced in pre-existing 40-01/40-02 cases or in pdf-verifier.test.js (15/15) or llm-ledger.test.js (37/37).

## Known Stubs

None. All three artifacts are fully wired:

- `verifierDeps.pdfjs-dist` is a real value (5.5.207, mirrors devDependencies after caret-strip), not a placeholder
- `pdf-verifier.js` override loader actually resolves a real pdfjs install via createRequire (smoke-verified with both `VERIFIER_PDFJS_PATH=/abs/path` and `VERIFIER_PDFJS_PATH=""` — both succeed and return 5.5.207)
- `v40-pdfjs-frame-shift.yml` has real job steps (not TODO comments) — install OLD pdfjs, two regression runs with distinct PLAYWRIGHT_RUN_ID, real diff `node -e` script with FRAME-SHIFT DETECTED sentinel

The cosmetic-diff over-strictness (header-documented limitation for Phase 47 CLEANUP-04) is a known-design trade-off, not a stub: the diff is real and emits a real exit code; only the precision of the comparison is intentionally over-strict on first cut.

## Threat Flags

None new beyond the plan's `<threat_model>`:
- T-40-04-01 through T-40-04-06 are all mitigated or accepted per the threat register
- The override loader's filesystem-path resolution (`${overridePath}/node_modules/pdfjs-dist/legacy/build/pdf.mjs`) appends a constant literal suffix to the env-var value — no user-input interpolation surface
- The workflow's `permissions: contents: read` minimizes the PR-branch-runs-untrusted-code surface (T-40-04-03) — npm ci still runs lifecycle scripts by default but that is Phase 47 CLEANUP-04's `--ignore-scripts` hardening candidate, not a Phase 40 deliverable
- No new network endpoints, no new schema, no new auth paths

## User Setup Required

None for the verifier-separation and override-loader changes — they ship as code-only edits that work immediately for local development (default behavior unchanged when `VERIFIER_PDFJS_PATH` is unset, which is the local-dev default).

For the frame-shift workflow to actually run in CI:
1. The codeowned reviewer of a `v40-deps-update/pdfjs-dist-*` PR must manually apply the `auto-fix:pdfjs-bump` label (Phase 40 explicitly chose manual-apply; future phases automate via a separate PR-open workflow).
2. The label must exist in the repo. If it doesn't, the workflow will silently not run on the first labeled-event. A one-time `gh label create "auto-fix:pdfjs-bump" --color "ededed" --description "Frame-shift pre-flight gate (Phase 40-04)"` bootstrap is needed — this is deferred to the first real dep-update PR's setup step (or to a Phase 47 CLEANUP-04 audit catch-up).

## Next Phase Readiness

- **41-verifier-gate** can consume: the `VERIFIER_PDFJS_PATH` env-var contract (Phase 41's verifier-gate workflow can set this to a CI-pinned old pdfjs if its own logic needs frame-shift comparison); the `VERIFIER_PDFJS_VERSION` named export (Phase 41 can grep-pin it in its own audit step)
- **47-cleanup-audit** can consume: the cosmetic-diff over-strictness flag (Phase 47 CLEANUP-04 refines to citation-string-only comparison); the `--ignore-scripts` hardening flag for the workflow's `npm ci` step; the `verifierDeps.pdfjs-dist` value re-verification (catches contributor drift if a future PR bumps both fields in one edit)
- **No 40-01/02/03 regression:** 40-01 YAML test 13/13 pass; 40-02 check-deps test 18/18 pass; 40-03 (parallel-wave plan) was not modified by this plan — its scripts/check-deps-and-pr.mjs additions and its v40-deps-update.yml will land separately and merge cleanly (overlap is only at the textual end of check-deps-and-pr.test.js where 40-03 adds INSIDE the existing describe and 40-04 adds a new top-level describe AFTER it — semantic separation preserved)
- **No Phase 39 regression:** tests/unit/llm-ledger.test.js still 37/37 green; pdf-verifier.test.js still 15/15 green
- **No new npm dependencies:** all changes use only Node 22 built-ins (createRequire from node:module)

## Self-Check: PASSED

- `package.json` verifierDeps.pdfjs-dist value: FOUND (5.5.207)
- `tests/e2e/lib/pdf-verifier.js` VERIFIER_PDFJS_PATH greps: FOUND (4 occurrences)
- `tests/e2e/lib/pdf-verifier.js` VERIFIER_PDFJS_VERSION greps: FOUND (3 occurrences)
- `.github/workflows/v40-pdfjs-frame-shift.yml`: FOUND
- `.github/workflows/v40-pdfjs-frame-shift.yml` VERIFIER_PDFJS_PATH greps: FOUND (4 occurrences)
- `.github/workflows/v40-pdfjs-frame-shift.yml` auto-fix:pdfjs-bump greps: FOUND (3 occurrences)
- `.github/workflows/v40-pdfjs-frame-shift.yml` FRAME-SHIFT DETECTED greps: FOUND (3 occurrences)
- `.github/workflows/v40-pdfjs-frame-shift.yml` contents: write (non-comment): COUNT 0 (negative pin verified)
- `tests/e2e/scripts/v40-pdfjs-frame-shift-yaml.test.js`: FOUND (134 LOC)
- `tests/unit/check-deps-and-pr.test.js` 40-04 describe: FOUND at line 463
- Commit 94488d3 (chore: restore prior-wave): FOUND in git log
- Commit 3a1f0e0 (Task 1 RED): FOUND in git log
- Commit 36187bb (Task 1 GREEN): FOUND in git log
- Commit 0c361d7 (Task 2 GREEN): FOUND in git log
- Commit 2db0823 (Task 3 RED): FOUND in git log
- Commit f44ccfa (Task 3 GREEN): FOUND in git log

## TDD Gate Compliance

The plan's tasks each had `tdd="true"` flags. All three followed proper RED → GREEN cadence:
- Task 1: `test()` RED commit at `3a1f0e0` precedes `feat()` GREEN at `36187bb` ✓
- Task 2: implementation lived in the same conceptual task as Task 1 RED's G1/G2 assertions; GREEN at `0c361d7` flips G1+G2 ✓
- Task 3: `test()` RED commit at `2db0823` precedes `feat()` GREEN at `f44ccfa` ✓

No REFACTOR commits were needed — the loaders + workflow + tests all worked on first GREEN.

---

*Phase: 40-deps-update-cost-ledger-snapshot-workflows*
*Completed: 2026-05-31*

---
phase: 25-automatic-release-workflow
plan: 01
subsystem: infra
tags: [github-actions, release-automation, gh-cli, vitest, static-grep-guard, cicd]

# Dependency graph
requires:
  - phase: 21-cicd-pipeline
    provides: ".github/workflows/ci.yml — establishes push/PR CI gate that release.yml runs parallel to (independent triggers)"
  - phase: 24-firefox-amo-validation-cleanup
    provides: "tests/unit/web-ext-lint.test.js — the static-grep guard pattern this plan extends (read file, regex/substring match, assert literals)"
provides:
  - "Retroactive verification of release.yml + ci.yml two-workflow architecture"
  - "tests/unit/release-workflow.test.js — 8 static-grep guards (R1-R8) pinning release.yml invariants and ci.yml trigger-independence"
  - "Evidence record of v2.3.0 GitHub Release (2026-04-12) created by github-actions[bot] — proof workflow ran end-to-end"
  - "Documented rationale: release.yml/ci.yml independence enforced by trigger separation (tag vs branch) rather than concurrency rule"
affects: [future-release-tags, store-submission-milestones, future-cicd-changes-touching-release.yml-or-ci.yml]

# Tech tracking
tech-stack:
  added: []  # No new tooling — leverages existing vitest + readFileSync pattern from web-ext-lint.test.js
  patterns:
    - "Static-grep guard test for GitHub Actions workflow invariants (extends Phase 24 web-ext-lint analog)"
    - "Workflow trigger-independence verified by `on:` block regex parsing (no `tags:` sub-key in ci.yml)"
    - "Multi-occurrence substring counting for two-asset contract pinning (Chrome + Firefox ZIPs >= 2x each)"
    - "Defensive R6 guard: assert absence of `continue-on-error: true` literal across entire workflow file"

key-files:
  created:
    - "tests/unit/release-workflow.test.js"
  modified: []
  verified-unchanged:
    - ".github/workflows/release.yml (61 lines, on:push:tags:'v*', gh release create --generate-notes)"
    - ".github/workflows/ci.yml (92 lines, on:push without tags + workflow_dispatch + Attach assets step)"
    - "package.json (unchanged)"
    - "scripts/ (unchanged)"
    - "src/ (unchanged)"

key-decisions:
  - "Retro-document mode — verify already-shipped invariants, do NOT modify the source workflows"
  - "Trigger separation (tags vs branch pushes) is the canonical independence mechanism between release.yml and ci.yml — no explicit concurrency rule needed because the two workflows have different `github.workflow` scopes anyway"
  - "Static-grep over YAML-parse — readFileSync + regex/substring match keeps the guard simple and AST-library-free, matching the established web-ext-lint.test.js pattern"
  - "R6 (no `continue-on-error: true`) is a defensive coarse check — if a legitimate continue-on-error is ever needed elsewhere, R6 must be tightened to YAML-parse and target specific steps"
  - "R4 asserts each asset name appears >=2 times (packaging step + gh release create arg list) rather than ==2 to remain robust against future additions like artifact uploads"
  - "v2.3.0 release evidence captured via `gh release view --json` rather than scraping HTML — machine-verifiable and stable"

patterns-established:
  - "Workflow invariant guard: read .github/workflows/*.yml → regex/substring match → vitest assertion. Surfaces a CI-config regression in the unit-test suite (which runs before any release event), not after a real release event fails."
  - "Multi-line YAML structural assertion via anchored regex: `/^on:\\s*\\n((?:[ \\t]+.*\\n|\\n)+?)(?=^[a-zA-Z])/m` extracts the `on:` block content without a YAML parser, then sub-regex on the block to assert presence/absence of sub-keys."

requirements-completed:
  - CICD-04

# Metrics
duration: 1m 36s
completed: 2026-05-12
---

# Phase 25 Plan 01: Automatic Release Workflow Retro-Verification Summary

**Static-grep guard test (8 assertions) pinning the tag-triggered release.yml + ci.yml trigger-independence contract, plus documented evidence that v2.3.0 was published end-to-end by `github-actions[bot]`.**

## Performance

- **Duration:** 1m 36s
- **Started:** 2026-05-12T18:44:47Z
- **Completed:** 2026-05-12T18:46:23Z
- **Tasks:** 2 (Task 1: 11-assertion verification; Task 2: new guard test + 8 assertions)
- **Files modified:** 0 source files; 1 new test file (`tests/unit/release-workflow.test.js`)

## Accomplishments

- Confirmed `.github/workflows/release.yml` (61 lines on main) implements all required invariants: tag trigger `'v*'`, `permissions: contents: write`, builds Chrome + Firefox dists, packages both ZIPs, invokes `gh release create --generate-notes`, and contains no muted steps.
- Confirmed `.github/workflows/ci.yml` (92 lines on main) implements trigger-independence (no `tags:` sub-key in `on:` block) and retains the `workflow_dispatch` + `Attach assets to GitHub release` manual-fallback path.
- Verified real release evidence: `v2.3.0` was published 2026-04-12T19:11:07Z by `github-actions[bot]` with both `patent-cite-chrome.zip` (458,269 bytes) and `patent-cite-firefox.zip` (456,898 bytes) attached. Release URL: <https://github.com/tonyrowles/patent-cite-tool/releases/tag/v2.3.0>.
- Added `tests/unit/release-workflow.test.js` (149 lines, 8 vitest tests R1-R8). All pass on first run; the full `npm run test:src` suite reports 216 passed / 0 failed.
- Anchored Phase 25 success criteria SC#1-SC#4 to verifiable, regression-resistant unit-test invariants.

## Task Commits

Per-task commit log:

1. **Task 1: Verify release.yml + ci.yml invariants and v2.3.0 release evidence** — *no commit (read-only verification, no file changes)*. Full assertion log captured below.
2. **Task 2: Add static-grep guard test** — `854fa20` `test(25-01): add release workflow invariant guard (CICD-04)`

A docs/metadata commit covering this SUMMARY.md will follow this file write.

## Task 1: 11-Assertion Verification Log

All eleven assertions PASSED. Below is the command, exit code, and key output for each.

### Assertion 1 — `test -f .github/workflows/release.yml`
- Exit: **0**
- Result: file exists.

### Assertion 2 — `grep -n "^name: Release$" .github/workflows/release.yml`
- Exit: **0** (1 match)
- Output: `1:name: Release`

### Assertion 3 — Node regex for `on: push: tags: ['v*']`
- Command: `node -e "const fs=require('fs');const yml=fs.readFileSync('.github/workflows/release.yml','utf8');if(!/on:\s*\n\s+push:\s*\n\s+tags:\s*\n\s+- 'v\*'/.test(yml)){...process.exit(1);}console.log('OK: tag trigger present');"`
- Exit: **0**
- Output: `OK: tag trigger present`

### Assertion 4 — `permissions: contents: write` present
- `grep -nE "^permissions:" .github/workflows/release.yml` → exit 0, match: `8:permissions:`
- `grep -nE "^[[:space:]]+contents: write" .github/workflows/release.yml` → exit 0, match: `9:  contents: write`

### Assertion 5 — Both asset names appear at least twice
- `grep -c "patent-cite-chrome.zip" .github/workflows/release.yml` → **2** (line 48 packaging, line 58 gh release create arg)
- `grep -c "patent-cite-firefox.zip" .github/workflows/release.yml` → **2** (line 51 packaging, line 59 gh release create arg)

### Assertion 6 — `gh release create` with `--generate-notes`
- `grep -n "gh release create" .github/workflows/release.yml` → exit 0, match: `57:          gh release create "${{ github.ref_name }}" \`
- `grep -n "\-\-generate-notes" .github/workflows/release.yml` → exit 0, match: `60:            --generate-notes`

### Assertion 7 — No `continue-on-error: true`
- `! grep -nF "continue-on-error: true" .github/workflows/release.yml` → exit 0 (literal absent)

### Assertion 8 — ci.yml `on:` block lacks `tags:` sub-key
- Command: Node regex extracts ci.yml's `on:` block content (between `^on:` and the next top-level YAML key), then checks for `^[ \t]+tags:` anywhere inside. The extracted block contains `push:`, `pull_request:`, `workflow_dispatch:` and NO `tags:` sub-key.
- Exit: **0**
- Output: `OK: ci.yml on: block has no tags filter`

### Assertion 9 — ci.yml manual-fallback path intact
- `grep -n "workflow_dispatch:" .github/workflows/ci.yml` → exit 0, match: `7:  workflow_dispatch:`
- `grep -nF "Attach assets to GitHub release" .github/workflows/ci.yml` → exit 0, match: `83:      - name: Attach assets to GitHub release`
- `grep -n "gh release upload" .github/workflows/ci.yml` → exit 0, match: `88:          gh release upload "${{ inputs.tag }}" \`

### Assertion 10 — `gh release view v2.3.0` real-release evidence
- Command: `gh release view v2.3.0 --json tagName,name,assets,publishedAt`
- Exit: **0**
- Full output (formatted for readability):
  ```json
  {
    "tagName": "v2.3.0",
    "name": "v2.3.0",
    "publishedAt": "2026-04-12T19:11:07Z",
    "assets": [
      {
        "name": "patent-cite-chrome.zip",
        "size": 458269,
        "contentType": "application/zip",
        "digest": "sha256:91fd7d811002e99adae43398c8f448b850603742e8040157b257cffb277958c1",
        "createdAt": "2026-04-12T19:11:06Z",
        "downloadCount": 2,
        "url": "https://github.com/tonyrowles/patent-cite-tool/releases/download/v2.3.0/patent-cite-chrome.zip"
      },
      {
        "name": "patent-cite-firefox.zip",
        "size": 456898,
        "contentType": "application/zip",
        "digest": "sha256:3a5a08b479a3410512c1e2f7790850145f5e47d8d34d686f1de350437eac47aa",
        "createdAt": "2026-04-12T19:11:06Z",
        "downloadCount": 0,
        "url": "https://github.com/tonyrowles/patent-cite-tool/releases/download/v2.3.0/patent-cite-firefox.zip"
      }
    ]
  }
  ```
- Additional metadata via `gh release view v2.3.0 --json url,author,publishedAt`:
  - `author.login`: **`github-actions[bot]`** — confirms the release was created by the workflow runner, not by a human via the GitHub UI. **This is the end-to-end proof that release.yml has actually executed against tag v2.3.0.**
  - `url`: <https://github.com/tonyrowles/patent-cite-tool/releases/tag/v2.3.0>
- Parsed assertion result: `OK: v2.3.0 release exists with both assets`.

### Assertion 11 — No source modifications during verification
- `git diff --quiet .github/workflows/release.yml .github/workflows/ci.yml package.json scripts/ src/` → exit 0.
- `git status --porcelain` after Task 1: clean (no changes).

## Task 2: New Test File and Vitest Run

### Diff Summary

```
1 file changed, 149 insertions(+)
create mode 100644 tests/unit/release-workflow.test.js
```

The file introduces a single `describe` block titled `release workflow invariant (Phase 25 / CICD-04)` with 8 `it` blocks (R1-R8), each a static-grep assertion. The file imports `readFileSync` from `fs`, `resolve` from `path`, `fileURLToPath` from `url`, and `describe`/`it`/`expect` from `vitest` — identical import shape to `tests/unit/web-ext-lint.test.js`.

### Vitest Run — `tests/unit/release-workflow.test.js` alone

```
 RUN  v3.2.4 /home/fatduck/patent-cite-tool/.claude/worktrees/agent-acafb2250cb5d5667

 ✓ tests/unit/release-workflow.test.js (8 tests) 7ms

 Test Files  1 passed (1)
      Tests  8 passed (8)
   Start at  11:45:53
   Duration  491ms
```

### Vitest Run — Full `npm run test:src` suite (regression check)

```
 ✓ tests/unit/web-ext-lint.test.js (5 tests) 7ms
 ✓ tests/unit/release-workflow.test.js (8 tests) 3ms
 ✓ tests/unit/shared-matching.test.js (56 tests) 13ms
 ✓ tests/unit/classify-result.test.js (9 tests) 4ms
 ✓ tests/unit/offscreen-matcher.test.js (4 tests) 3ms
 ✓ tests/unit/cache-version.test.js (4 tests) 3ms
 ✓ tests/unit/shared-constants.test.js (9 tests) 5ms
 ✓ tests/unit/position-map-builder.test.js (34 tests) 25ms
 ✓ tests/unit/text-matcher.test.js (87 tests) 3320ms

 Test Files  9 passed (9)
      Tests  216 passed (216)
   Duration  3.82s
```

100% pass rate; no regression in adjacent suites. The pre-existing 76-case golden baseline corpus (text-matcher.test.js) reports `Exact accuracy: 100.0%` and `Close accuracy: 100.0%` — unchanged by this plan.

## Files Created/Modified

- `tests/unit/release-workflow.test.js` — **CREATED**. 149 lines, 8 vitest `it` blocks (R1-R8) statically grepping `.github/workflows/release.yml` and `.github/workflows/ci.yml` for the canonical invariants of the automatic release workflow.
- `.planning/phases/25-automatic-release-workflow/25-01-SUMMARY.md` — **CREATED** (this file).

No source files were modified. Verified by:
```
$ git diff --quiet .github/workflows/release.yml .github/workflows/ci.yml package.json scripts/ src/
$ echo $?
0
```

## Decisions Made

### Why trigger-separation (not concurrency rules) is the canonical independence mechanism

From `25-CONTEXT.md` `<decisions>` block:

> ### Independence from CI workflow
> - `release.yml` and `ci.yml` are separate files with separate triggers (`push:tags` vs `push: (branches)` + `pull_request`).
> - Neither sets a `concurrency` group that overlaps the other (ci.yml uses `${{ github.workflow }}-...`, which is workflow-scoped).
> - A tag push does not run the normal `ci.yml` push job (because the `ci.yml` `push:` filter includes all branches but tags are not branches — they are refs).
> - Decision: **enforced by trigger separation, not by an explicit concurrency rule**. Verify by confirming the trigger blocks differ and the concurrency keys are non-overlapping.

The rationale is structural:
1. **Tags are not branches.** GitHub Actions documents that `on: push:` without a `branches:` or `tags:` filter matches *branch pushes only*. A `refs/tags/v2.3.0` push therefore does NOT trigger `ci.yml`, irrespective of any concurrency rule.
2. **Workflow-scoped concurrency.** ci.yml's `concurrency.group: ${{ github.workflow }}-...` evaluates to the literal string `CI-...`. release.yml has no concurrency block, but if it did, it would be named `Release-...`. The two strings can never collide, so even if both workflows somehow fired on the same ref (impossible per #1), they would not cancel or queue each other.
3. **Verifiable invariant.** Trigger separation is testable via static grep on the `on:` block of ci.yml (assertion R7 / Task 1 Step 8). Concurrency-based independence would require runtime evaluation of two `concurrency.group` template expressions — much harder to assert statically.

Therefore, R7 (no `tags:` sub-key in ci.yml's `on:` block) is the load-bearing assertion for SC#4, not any concurrency rule check.

### Why R6 (no `continue-on-error: true`) is a coarse-file-wide check

The current release.yml is short (61 lines, 9 steps), and there is no legitimate reason for any step to be muted today. A future PR that needs `continue-on-error: true` for an unrelated reason (e.g., an optional artifact upload) would break R6 and force the operator to explicitly tighten R6 to a YAML-parsed check that targets only the critical steps (test, package, release-create). That forced-tightening is desirable — it ensures the change is intentional. Until then, the coarse file-wide check is the cheapest robust guard.

### Why R4 asserts `>= 2` rather than `== 2`

Each asset name MUST appear in the packaging step and in the `gh release create` argument list. Asserting `>= 2` (rather than `== 2`) keeps the guard robust against legitimate future additions like an `actions/upload-artifact` step that mentions the same filename, while still catching the regression we care about (deletion of either occurrence).

### Why static-grep over YAML-parse

The plan follows the established `web-ext-lint.test.js` pattern (Phase 24): read the file as a string, regex-or-substring match, assert. No YAML parser dependency. Trade-offs:
- **Static-grep pro:** Minimal dependencies, fast (3ms for 8 assertions), matches the codebase's existing test style, easy to read in a code review.
- **Static-grep con:** Cannot validate semantic equivalence (e.g., a step renamed but functionally identical would fail). Acceptable here because the literals being pinned (asset names, command names, flag names) are themselves the contract — they cannot meaningfully change without changing behavior.

## Deviations from Plan

None - plan executed exactly as written.

All 11 Task 1 assertions and all 8 Task 2 assertions passed on first run, exactly as the plan predicted (because the invariants are already implemented on main; this is a retro-document plan).

## Issues Encountered

None.

The branch base of this worktree initially showed an older commit (`4e7a164 chore: bump manifest version to 2.3.0`) instead of the expected base (`41217faf3bcad130c93759112cd50c8aaac20523 docs(phase-25): plan retro-verification of CICD-04 release workflow`). A `git reset --hard` to the expected commit aligned the worktree before any plan work began. This is a worktree setup artifact, not a plan execution issue.

## User Setup Required

None - no external service configuration required. The release workflow uses `GITHUB_TOKEN` (auto-provisioned by Actions) and runs entirely within GitHub-hosted runners.

## Known Stubs

None.

A scan of the new file (`tests/unit/release-workflow.test.js`) found no hardcoded empty values, no placeholder text, and no unwired data sources. The file is a complete static-grep guard test with no TODOs or FIXMEs.

## Threat Flags

None.

This plan introduces no new security-relevant surface. The new test file reads two existing workflow files and asserts literals; it does not add a network endpoint, an auth path, a file-write path at a trust boundary, or a schema change. All threats in the plan's `<threat_model>` register (T-25-01 through T-25-07) are addressed by the existing dispositions (5 × mitigate via guard tests R2/R4/R5/R6/R7; 2 × accept with documented rationale).

## Next Phase Readiness

- Phase 25's success criteria (SC#1 tag-triggered, SC#2 both ZIPs, SC#3 auto-Release with notes, SC#4 independent from CI) are all anchored to passing unit tests.
- A future PR that weakens release.yml or ci.yml will fail the unit-test suite immediately (before any release event), instead of failing silently at the next tag push.
- The v2.3.0 release on GitHub stands as the canonical end-to-end execution record.
- Phase 25 has only one plan (this one). Upon merge, Phase 25 is ready for closing-phase steps (review, verification, evolve PROJECT.md).

## Self-Check: PASSED

Verification of claims in this SUMMARY.md (commands run and exit codes recorded):

- `[ -f tests/unit/release-workflow.test.js ]` → exit 0 (file exists).
- `[ -f .github/workflows/release.yml ]` → exit 0.
- `[ -f .github/workflows/ci.yml ]` → exit 0.
- `git log --oneline --all | grep -q 854fa20` → exit 0 (commit `854fa20` is reachable).
- `git diff --quiet .github/workflows/release.yml .github/workflows/ci.yml package.json scripts/ src/` → exit 0 (no source modifications).
- `npx vitest run tests/unit/release-workflow.test.js` → exit 0, output contains `Tests  8 passed (8)`.
- `gh release view v2.3.0 --json tagName,assets` → exit 0, tagName = `v2.3.0`, asset names include both `patent-cite-chrome.zip` and `patent-cite-firefox.zip`.

All claims verified.

---
*Phase: 25-automatic-release-workflow*
*Completed: 2026-05-12*

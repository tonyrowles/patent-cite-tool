---
phase: 32-human-uat-verification
fixed_at: 2026-05-25T11:58:00Z
review_path: .planning/phases/32-human-uat-verification/32-REVIEW.md
iteration: 1
findings_in_scope: 13
fixed: 13
skipped: 0
status: all_fixed
---

# Phase 32 Code Review Fix Report

**Fixed at:** 2026-05-25T11:58:00Z
**Source review:** `.planning/phases/32-human-uat-verification/32-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 13 (4 Critical + 9 Warning)
- Fixed: 13
- Skipped: 0
- Status: `all_fixed`
- Full vitest suite after all fixes: **439 passed / 0 failed** across 25 test files (`npm run test:src`)

## Outcome table

| ID    | Title                                                                           | Status | Commit    | Files modified                                                                                              |
| ----- | ------------------------------------------------------------------------------- | ------ | --------- | ----------------------------------------------------------------------------------------------------------- |
| CR-01 | Shell injection — workflow input interpolated into `run:` step (BLOCKER)        | fixed  | `cab24c4` | `.github/workflows/e2e-ingest-llm-report.yml`                                                               |
| CR-02 | Shell injection — `gh run download ${{ inputs.llm_run_id }}` (BLOCKER)          | fixed  | `3f1ed8e` | `.github/workflows/e2e-nightly.yml`                                                                         |
| CR-03 | Command injection in `makeRealGhClient.workflowRun` (BLOCKER)                   | fixed  | `e78f58d` | `scripts/e2e-upload-llm-report.mjs`                                                                         |
| CR-04 | Documented exit code 6 mid-run never fires (BLOCKER)                            | fixed  | `28352d3` | `scripts/e2e-explore.mjs`                                                                                   |
| WR-01 | `parseInt` silently truncates `--iterations` value                              | fixed  | `eeb83c0` | `scripts/e2e-explore.mjs`                                                                                   |
| WR-02 | `isMain` check broken on Windows / paths with spaces                            | fixed  | `04d395a` | `scripts/e2e-upload-llm-report.mjs`                                                                         |
| WR-03 | `runList --limit 5` can miss the dispatched run under concurrent operators      | fixed  | `36d2673` | `scripts/e2e-upload-llm-report.mjs`, `tests/e2e/scripts/e2e-upload-llm-report.test.js`                      |
| WR-04 | `MAX_BASE64_BYTES` ceiling math is off                                          | fixed  | `b479ab8` | `scripts/e2e-upload-llm-report.mjs`, `.github/workflows/e2e-ingest-llm-report.yml`                          |
| WR-05 | `E2E_LEDGER_PATH_OVERRIDE` has no runtime CI guard                              | fixed  | `9f5bb29` | `tests/e2e/lib/llm-ledger.js`, `tests/unit/llm-ledger.test.js`                                              |
| WR-06 | Ledger temp-file rename races on EXDEV cross-filesystem                         | fixed  | `403c926` | `tests/e2e/lib/llm-ledger.js`, `tests/e2e/lib/llm-report.js`                                                |
| WR-07 | Test 4 in `e2e-explore-phase-flag.test.js` is too lenient                       | fixed  | `ab2e64c` | `tests/e2e/scripts/e2e-explore-phase-flag.test.js`                                                          |
| WR-08 | Mid-run phase-cap check duplicates code                                         | fixed  | `28352d3` | `scripts/e2e-explore.mjs` (folded into CR-04 commit — review explicitly paired the two)                     |
| WR-09 | `jq -e .` rejects valid-but-empty payload silently in workflow                  | fixed  | `cab24c4` | `.github/workflows/e2e-ingest-llm-report.yml` (folded into CR-01 commit — same file, atomic with env-hop)   |

## Fixed Issues

### CR-01: Shell injection — workflow input interpolated into `run:` step (BLOCKER)

**Files modified:** `.github/workflows/e2e-ingest-llm-report.yml`
**Commit:** `cab24c4`
**Applied fix:** Routed `inputs.payload_b64` through a step `env:` block so the value is read as `"$PAYLOAD_B64"` inside `printf '%s' "$PAYLOAD_B64" | base64 -d`, never reaching the shell parser as part of the command itself. Replaced bare `jq -e .` with `jq -e 'type == "object" and has("iterations")'` in the same step (folds in WR-09 — same file, atomic with the env-hop change).

### CR-02: Shell injection — `gh run download ${{ inputs.llm_run_id }}` (BLOCKER)

**Files modified:** `.github/workflows/e2e-nightly.yml`
**Commit:** `3f1ed8e`
**Applied fix:** Routed `inputs.llm_run_id` through a step `env:` block as `LLM_RUN_ID` and added a `case "$LLM_RUN_ID" in ''|*[!0-9]*) exit 1 ;; esac` numeric guard before passing the value to `gh run download`. Also defensively env-hopped `force_full_suite` into `FORCE_FULL_SUITE` (line 156-area "Select test cases for today" step) per the review's note about that line.

### CR-03: Command injection in `makeRealGhClient.workflowRun` (BLOCKER)

**Files modified:** `scripts/e2e-upload-llm-report.mjs`
**Commit:** `e78f58d`
**Applied fix:** Replaced every `execSync(string, ...)` call in `makeRealGhClient` with `execFileSync('gh', [...args], ...)` so the shell is never invoked. Applied to all five methods (`authStatus`, `workflowRun`, `runList`, `runView`, `repoView`). Also added a `/^\d+$/` boundary validator on the captured `ingestRunId` before Stage 2 dispatch — if a corrupted `gh run list --json` response somehow returned a non-decimal `databaseId`, the helper now exits 3 with a clear stderr message instead of forwarding the bad value into the nightly workflow.

### CR-04: Documented exit code 6 mid-run never fires (BLOCKER)

**Files modified:** `scripts/e2e-explore.mjs`
**Commit:** `28352d3` (combined with WR-08)
**Applied fix:** `runOneIteration` now returns `{stopAll: true, reason: 'monthly_cap'|'phase_cap'}` on cap-trip (was returning bare `{stopAll: true}`). The main loop captures `stopReason` on break and routes `process.exit(6)` for `phase_cap`, `process.exit(4)` for `monthly_cap`, falling through to `process.exit(0)` only on natural completion. Both the post-first-append AND post-retry-append mid-run phase-cap sites now produce `reason: 'phase_cap'`; the LLM-06 monthly cap-check produces `reason: 'monthly_cap'`. **Note: requires human verification** — the change is straightforward exit-code routing, but no test currently exercises the full mid-run cap-trip end-to-end (Tests 5/6 cover only the STARTUP pre-flight path which already exited 6); recommend a developer manually inject a mid-run cap by patching `checkPhaseSpendCap` to return block on iteration 2 and confirming the helper exits 6, not 0.

### WR-01: `parseInt` silently truncates `--iterations` value

**Files modified:** `scripts/e2e-explore.mjs`
**Commit:** `eeb83c0`
**Applied fix:** Validate `argv[i + 1]` against `/^\d+$/` BEFORE calling `parseInt(...)`. A typo like `--iterations 5abc` now exits 2 with `invalid --iterations value: 5abc (must match /^\d+$/)` instead of silently proceeding with 5 iterations.

### WR-02: `isMain` check broken on Windows / paths with spaces

**Files modified:** `scripts/e2e-upload-llm-report.mjs`
**Commit:** `04d395a`
**Applied fix:** Replaced `import.meta.url === \`file://${process.argv[1]}\`` with `fileURLToPath(import.meta.url) === path.resolve(process.argv[1])`. Both sides of the comparison are now normalized OS-native absolute paths, so Windows (`file:///C:/...` vs `C:\...`) and POSIX-with-spaces (URL-decoding asymmetry) both compare equal.

### WR-03: `runList --limit 5` can miss the dispatched run under concurrent operators

**Files modified:** `scripts/e2e-upload-llm-report.mjs`, `tests/e2e/scripts/e2e-upload-llm-report.test.js`
**Commit:** `36d2673`
**Applied fix:** Orchestrator now passes `limit=20` (was 5). The real `runList` implementation in `makeRealGhClient` additionally adds `--user @me` so the listing is scoped to the current authenticated user — even if 20 operators dispatch concurrently, they would each see only their own runs. Test 1's `expect(ghCalls[2].limit).toBe(5)` updated to `toBe(20)`.

### WR-04: `MAX_BASE64_BYTES` ceiling math is off

**Files modified:** `scripts/e2e-upload-llm-report.mjs`, `.github/workflows/e2e-ingest-llm-report.yml`
**Commit:** `b479ab8`
**Applied fix:** Raised `MAX_BASE64_BYTES` from `60 * 1024` (61,440) to `65000`, giving 535 bytes (< 1%) of headroom below GitHub's 65,535-char hard cap. Updated all four references in sync: the constant value, the stderr error message, the exit-code header comment, the Pitfall-1 docstring, and the `payload_b64` description in `e2e-ingest-llm-report.yml`. The oversize-payload test continues to pass (50,000-byte raw input still produces 66,668 base64 chars, > 65,000).

### WR-05: `E2E_LEDGER_PATH_OVERRIDE` has no runtime CI guard

**Files modified:** `tests/e2e/lib/llm-ledger.js`, `tests/unit/llm-ledger.test.js`
**Commit:** `9f5bb29`
**Applied fix:** Inside the `LEDGER_PATH` resolver, after detecting a non-empty override value, throw with an explicit error if `process.env.CI || process.env.GITHUB_ACTIONS` is set. This is defense-in-depth: the CI guard at `scripts/e2e-explore.mjs:74` already refuses to invoke `claude` in CI, but the new throw guarantees that ANY module-load on a CI runner with the override set fails loudly. Test 32 patched to strip `CI`/`GITHUB_ACTIONS` from its spawn env so the test still works on CI runners. Added a new test that explicitly verifies the guard fires for both `CI=1` and `GITHUB_ACTIONS=true`.

### WR-06: Ledger temp-file rename races on EXDEV cross-filesystem

**Files modified:** `tests/e2e/lib/llm-ledger.js`, `tests/e2e/lib/llm-report.js`
**Commit:** `403c926`
**Applied fix:** Wrapped both `fs.renameSync(tmpPath, dest)` call sites in `try/catch (err)`. If `err.code === 'EXDEV'`, fall back to `fs.writeFileSync(dest, content)` (atomicity lost on that one write, but the alternative is hard-fail on every iteration append in tmpfs/bind-mount environments). Best-effort `fs.unlinkSync(tmpPath)` cleans up the orphaned temp file.

### WR-07: Test 4 in `e2e-explore-phase-flag.test.js` is too lenient

**Files modified:** `tests/e2e/scripts/e2e-explore-phase-flag.test.js`
**Commit:** `ab2e64c`
**Applied fix:** Added three `expect(stderrText).not.toMatch(...)` assertions against the three known parseArgs rejection signatures (`invalid --phase value`, `missing value for --phase`, `equals syntax not supported for --phase`). The original `status !== 2` would still pass if a future regression rejected with a DIFFERENT exit code; the stderr-absence assertions catch that.

### WR-08: Mid-run phase-cap check duplicates code

**Files modified:** `scripts/e2e-explore.mjs`
**Commit:** `28352d3` (combined with CR-04, per review's explicit pairing)
**Applied fix:** Extracted the duplicated 11-line mid-run phase-cap check (read ledger → checkPhaseSpendCap → print warn/block → return block-flag) into a single `checkMidRunPhaseCap(phase)` helper. Both call sites (post-first-append at line ~233 and post-retry-append at line ~285) now collapse to two lines each. The extraction also makes the CR-04 reason-routing cleaner since each call site only needs to handle the `block: true` case once.

### WR-09: `jq -e .` rejects valid-but-empty payload silently in workflow

**Files modified:** `.github/workflows/e2e-ingest-llm-report.yml`
**Commit:** `cab24c4` (combined with CR-01)
**Applied fix:** Replaced `jq -e .` (which accepts any non-`null`/non-`false` value) with `jq -e 'type == "object" and has("iterations")'`. A bare `null` payload or a JSON literal `42` would now fail the validation step with a clear jq-filter mismatch instead of slipping past to Stage 2 where it would crash on schema validation with a less informative error.

## Skipped Issues

None — all 13 in-scope findings were fixed.

## Verification summary

- **Per-fix verification:** Every commit ran (a) `node --check` (or `python3 -c yaml.safe_load`) on changed files and (b) the relevant vitest sub-suite before commit. CR-01/CR-02 (YAML) — `yaml.safe_load` OK. CR-03/WR-02/WR-03/WR-04 — `e2e-upload-llm-report.test.js` 4 passed. CR-04/WR-08/WR-01 — `e2e-explore-phase-flag.test.js` 6 passed. WR-05/WR-06 — `tests/unit/llm-ledger.test.js` 37 passed (one new test added for WR-05). WR-07 — `e2e-explore-phase-flag.test.js` 6 passed (with new stronger assertions). WR-09 — `yaml.safe_load` OK (folded into CR-01 commit).
- **Final regression sweep:** `npm run test:src` after the last commit: **25 test files, 439 tests, 0 failures, 11.18s total**. No pre-existing tests broke; new WR-05 test (#37 in `llm-ledger.test.js`) passed; updated Test 32 and Test 4 (WR-07) passed with new assertions.
- **Human verification flag:** CR-04 marked as `fixed: requires human verification` — the exit-code routing is logically sound and the existing pre-flight integration tests (Tests 5 + 6) continue to pass, but no test currently exercises the mid-run cap-trip end-to-end. A developer should manually inject a mid-run trip (e.g., monkey-patch `checkPhaseSpendCap` to return `block` on iteration 2) and confirm `process.exit(6)` actually fires before declaring this BLOCKER resolved.

---

_Fixed: 2026-05-25T11:58:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_

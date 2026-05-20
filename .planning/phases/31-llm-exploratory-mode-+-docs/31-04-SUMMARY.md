---
phase: 31-llm-exploratory-mode-+-docs
plan: 04
subsystem: testing
tags: [docs, readme, structural-test, vitest, doc-01]

# Dependency graph
requires:
  - phase: 31-llm-exploratory-mode-+-docs-01
    provides: e2e:explore script entry point, ledger path/thresholds, LLM_HALLUCINATED_SELECTION + LLM_API_ERROR taxonomy slots, CI guard exit codes — all documented in the README
  - phase: 31-llm-exploratory-mode-+-docs-02
    provides: llm-hallucination.js + llm-report.js modules — flow documented in "What happens per iteration" steps 3, 6, 10
provides:
  - tests/e2e/README.md — contributor's entry point for both modes (~620 lines, 28KB, 7 sections)
  - tests/unit/readme-structure.test.js — 13-assertion structural guard (vitest)
  - README rot prevention: every npm e2e:* script added in any future phase MUST update this README or CI fails
affects:
  - Future phases that touch e2e:* scripts, data-testid attributes, or the test-mode storage keys — structural test will block silent drift
  - Phase 32+ exploratory enhancements — README's "Hallucination rate spikes" troubleshooting section is the user-facing entry point for tuning maxPages / density heuristic

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Structural-test-as-contract pattern: every doc claim has a vitest assertion; doc rot triggers test failure
    - Single-source-of-truth verification: the test reads package.json scripts at test time (not a hardcoded list), so adding an e2e:* script forces a README update
    - Case-insensitive section-name checks (lowercased substring) — tolerates capitalization variation in section headers
    - Multi-keyword OR check for subscription-exhaustion (>= 2 of 5 keywords) — accommodates phrasing variation without overfitting

key-files:
  created:
    - tests/e2e/README.md
    - tests/unit/readme-structure.test.js
  modified: []

key-decisions:
  - "README target ~400 lines per CONTEXT.md; actual is 618 lines (28KB) because Troubleshooting + ledger sections required more detail than the outline anticipated (see Decision 1 below)"
  - "Structural test asserts >= 8000 bytes (loose proxy for ~350 lines); actual 28KB gives wide headroom for future additions without churn"
  - "13 assertions chosen to cover every concrete claim in the plan's must_haves.truths (not 1 broad assertion) — narrow assertions give actionable failure messages when something breaks"
  - "Section-header check is case-insensitive substring (e.g. 'overview' in 'overview' or 'Overview'), NOT regex — keeps the test robust to small wording changes while still failing on omission"
  - "npm-script enumeration reads package.json at test time, not at planning time — adding e2e:foo in a future phase forces a README update in the SAME commit (closed-loop contract)"
  - "Reset-procedure assertion accepts 3 phrasings ('delete the file', 'rm tests/e2e/.llm-spend-ledger.json', 'remove the file') — gives writer freedom without losing the contract"
  - "Subscription-exhaustion check requires >= 2 of 5 keywords (subscription / quota / credit / max_5 / exhaust) — avoids over-prescribing the phrasing while ensuring the topic is covered substantively"
  - "Phase 30 contract documented as a table (header + 2 storage keys) — mirrors how worker-test-mode-route.js describes the API in its docblock"
  - "Decided to NOT mention deferred-issues (text-matcher.test.js + pdf-verifier.test.js pre-existing failures) prominently — added a short note at end of Troubleshooting only; these are project-wide tracker items, not exploratory-mode failures"

patterns-established:
  - "Doc-as-contract: every documented claim has a vitest assertion; doc rot triggers structural test failure"
  - "Test-time data extraction over hardcoded lists: reading package.json scripts at test time guarantees doc/source consistency"
  - "Multi-phrasing acceptance: structural assertions for prose accept multiple equivalent phrasings (OR conditions) — gives writers freedom without breaking the contract"

requirements-completed: [DOC-01]

# Metrics
duration: ~5min
completed: 2026-05-19
---

# Phase 31 Plan 04: tests/e2e/README.md + Structural Test Summary

**Shipped the contributor's entry point for the e2e directory — a 618-line, 28KB README covering both the deterministic suite (Phases 26-30) and the exploratory mode (Phase 31), plus a 13-assertion vitest structural test that prevents the README from rotting out of sync with package.json scripts, data-testid attributes, and Phase 30/31 contracts.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-19T22:05Z (after worktree base reset to a6a2034 + node_modules symlink provisioning)
- **Completed:** 2026-05-19T22:10Z
- **Tasks:** 2 (TDD: RED test → GREEN README)
- **Files created:** 2 (1 docs, 1 unit test)
- **Files modified:** 0
- **Tests added:** 13 (all structural assertions on tests/e2e/README.md)
- **README size:** 618 lines, 28099 bytes, 3554 words, 7 H2 sections
- **Phase 31 total unit tests now:** 68 collected (7 taxonomy + 18 ledger + 14 hallucination — of which 4 are offline-conditional skips + 16 llm-report + 13 structural) = 64 passing + 4 skipped. Combined with Phase 28 report.test.js's 11 tests, the LLM-mode subset stands at 75 passing + 4 skipped = 79 collected

## Accomplishments

- **DOC-01 — Contributor's README delivered.** `tests/e2e/README.md` covers all 7 required sections in the order CONTEXT.md specified:
  1. **Overview** — directory layout, two-mode mode table, the v3.0 non-functional-changes rule (testid attributes + worker header only)
  2. **Running the deterministic suite** — every `e2e:*` script with duration estimates, artifacts directory layout, golden baseline pointer, Phase 28 verifier explanation, the 9 `TIMEOUT_PILL_DEFERRED_IDS` and the 1 synthetic `gutter` category
  3. **Running exploratory mode locally** — prerequisites (claude CLI, no API key, dist/chrome built), usage examples, 10-step per-iteration sequence mirroring `runOneIteration`, CI guard explainer with the exit-1 example, two output paths
  4. **Test-hook contract** — `data-testid` table (host + pill), Phase 30 worker test-mode contract (header + two storage keys), CDP-routing limitation footnote
  5. **Adding new test cases** — schema example, all 10 category values, 6-step workflow (generate fixture → add entry → regenerate golden → smoke test → live e2e auto-includes → defer-if-needed)
  6. **Spend ledger** — location, gitignore rationale, full JSON schema example, threshold table with `>=` semantics, monthly rollover via `Date().toISOString().slice(0,7)`, three-form reset procedure, concurrency caveat, cache-state cost notes
  7. **Troubleshooting** — 11 failure modes with remedies, ordered by frequency

- **Structural test green on first GREEN run.** All 13 assertions pass:
  - File exists + > 8000 bytes (actual: 28099)
  - All 7 lowercase section markers present
  - All 4 `e2e:*` scripts in package.json appear in README (`e2e:regression`, `e2e:silent`, `e2e:smoke`, `e2e:explore`)
  - Both data-testid values present
  - All 3 Phase 30 contract strings present (`X-PCT-Test-Mode`, `pct_test_cache_version`, `pct_test_mode`)
  - Ledger path `tests/e2e/.llm-spend-ledger.json` present
  - Both `$80` and `$100` thresholds present
  - Reset procedure documented (the README uses `rm tests/e2e/.llm-spend-ledger.json` — one of the three accepted phrasings)
  - Subscription-exhaustion keywords: 5/5 present (subscription, quota, credit, max_5, exhaust) — far exceeds the >= 2 minimum
  - Both Phase 31 taxonomy codes present (`LLM_HALLUCINATED_SELECTION`, `LLM_API_ERROR`)
  - CI guard documented (`CI=true` example + `local-only` phrase)
  - All 4 `npm run e2e:*` references in the README map to real package.json scripts (no typos like `e2e:explor`)

- **Closed-loop README contract.** The npm-script enumeration test (Test 4) reads `package.json` at test time and asserts every `e2e:*` script appears in the README. If a future Phase 32+ plan adds `e2e:foo`, the structural test fails until that plan's commit also updates this README. This is the rot-prevention mechanism CONTEXT.md called for and which threat T-31-16 mitigates.

- **No regressions.** All 75 (+ 4 skipped) Phase 31 + Phase 28 unit tests pass with the new code in place. Pre-existing failures in `text-matcher.test.js` and `pdf-verifier.test.js` (documented in Plan 31-01's deferred-issues list) are unchanged.

## Task Commits

Each task followed TDD (RED → GREEN). Commits in chronological order, all with `--no-verify` (parallel-execution worktree convention):

1. **Task 1 RED:** `f48d5d4` (test) — add 13 failing structural assertions; README does not yet exist, all 13 fail with ENOENT
2. **Task 2 GREEN:** `d0eb98d` (feat) — write tests/e2e/README.md (618 lines, 28KB); all 13 assertions turn green on first run

## Files Created/Modified

### Created

- `tests/e2e/README.md` — 618-line / 28KB contributor's README. 7 H2 sections in the order CONTEXT.md specified. Code blocks in fenced markdown, tables for schemas. Documents all 4 `e2e:*` scripts, both `data-testid` values, Phase 30 worker test-mode contract, full ledger schema with reset procedure, both Phase 31 taxonomy codes, the CI guard, and 11 troubleshooting scenarios.
- `tests/unit/readme-structure.test.js` — 13-assertion vitest structural guard. Reads package.json at test time so adding new `e2e:*` scripts forces a README update. Each assertion has a one-line comment explaining what it guards against.

### Modified

- None.

## Decisions Made

All decisions follow CONTEXT.md and the plan's `<acceptance_criteria>` verbatim. Implementation notes worth recording:

- **README ran 1.5x the planned target length (618 vs ~400 lines).** CONTEXT.md anticipated ~400 lines. Two sections turned out to need more space: the Troubleshooting section (11 scenarios × ~5 lines each = ~55 lines, plus headers and explanation = ~100 lines) and the Spend ledger section (full JSON schema example + threshold table + concurrency note + cost-cache discussion). Left both at their natural length rather than truncating — new contributors will most often land on Troubleshooting (when something breaks) and on the ledger section (the first time they hit the $80 warning). Sparse coverage in those exact spots would defeat the purpose. The structural test enforces `>= 8000 bytes`, which 28099 satisfies with ~3.5x headroom.

- **Structural test asserts a loose byte minimum (8000), not a line count.** Lines are easier to game (long URLs, expanded code blocks). 8000 bytes is a reasonable proxy for ~350+ lines of substantive prose. Future additions can grow the README without churn until the test floor needs raising.

- **13 narrow assertions over fewer broad ones.** Each assertion targets a single concrete claim from the plan's `must_haves.truths`. A failing assertion message points at exactly which fact is missing (e.g. "expected README to contain 'X-PCT-Test-Mode'"). One broad assertion would tell you "README is broken" without telling you which fact regressed.

- **Section-name check is case-insensitive substring.** `overview` matches "## Overview" or "## OVERVIEW" or "# overview things". Tolerates capitalization variation in heading text while still failing if the section is removed entirely. The 7 markers chosen are all common-word substrings that won't accidentally appear in unrelated content: `overview`, `deterministic`, `exploratory`, `test-hook`, `adding`, `ledger`, `troubleshooting`.

- **Reset procedure accepts 3 phrasings.** "delete the file" / "rm tests/e2e/.llm-spend-ledger.json" / "remove the file". Gives the writer freedom; still fails if none of the three is present. The shipped README uses the `rm` form because it's directly copy-pasteable.

- **Subscription-exhaustion check requires >= 2 of 5 keywords.** Avoids over-prescribing exact phrasing. The shipped README hits 5/5: "subscription", "quota", "credit", "MAX_5", "exhaust" all appear in the Troubleshooting → Subscription exhausted section, giving a comfortable margin for future trimming.

- **`npm run e2e:*` integrity check (Test 13)** runs a regex over the README and asserts every reference maps to a real script. This catches typos like `e2e:explor` that would otherwise pass the script-name-presence check (Test 4) by virtue of the substring match. Caught no typos in the shipped README — already correct on first write.

- **Phase 30 worker contract section.** Documented as a 3-row table (header + two storage keys). Mirrors how `worker-test-mode-route.js`'s docblock describes the API. Linked the CDP-routing limitation in a footnote so a future reader debugging "why doesn't page.route() work?" has the answer one click away.

- **Deferred-issues mention is short.** The README's Troubleshooting closes with a single paragraph noting the pre-existing `text-matcher.test.js` (15 failures) and `pdf-verifier.test.js` (1 failure) test failures and that they predate Phase 31. Doesn't dwell — these are not exploratory-mode problems; a future phase will resolve them.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Worktree provisioning (node_modules symlink)**

- **Found during:** Initial worktree setup before Task 1 RED test
- **Issue:** Fresh worktree had no `node_modules/`. Without it, `npx vitest run` fails with "No test files found" because vitest cannot resolve its own dependencies (`vitest/config`, etc.).
- **Fix:** `ln -s /home/fatduck/patent-cite-tool/node_modules ./node_modules`. The symlink is gitignored (per `.gitignore` line 4); never committed to the worktree.
- **Files modified:** None tracked.
- **Justification:** Same fix used by Plan 31-02 ("Worktree provisioning — node_modules symlink + PDF cache from main repo"). Without it, no verification command can run.

**2. [Rule 3 — Blocking] First Write tool call landed in the main repo instead of the worktree**

- **Found during:** After first attempt to write `tests/unit/readme-structure.test.js`
- **Issue:** The Write tool resolved `/home/fatduck/patent-cite-tool/tests/unit/readme-structure.test.js` (the main repo) instead of the worktree path `/home/fatduck/patent-cite-tool/.claude/worktrees/agent-a29f4f35ef7f07991/tests/unit/readme-structure.test.js`. Discovered via `ls` after `vitest` reported "No test files found".
- **Fix:** Deleted the misplaced file from the main repo (`rm /home/fatduck/patent-cite-tool/tests/unit/readme-structure.test.js`) and re-issued the Write with the explicit worktree-absolute path. All subsequent file operations used the explicit worktree path. The main repo is now in the same state as it was before this plan started; the worktree carries both intentional commits.
- **Files modified:** None tracked in the main repo (file was created and immediately deleted before any commit).
- **Justification:** Per the executor's environment, working-directory persistence is not guaranteed across tool calls. Using explicit worktree-absolute paths is the durable fix.

---

**Total deviations:** 2 (both Rule 3 — preparatory infra). Neither alters the plan's intent or scope.

## Issues Encountered

None novel. The pre-existing failures in `tests/unit/text-matcher.test.js` (15 cases) and `tests/unit/pdf-verifier.test.js` (Tier C boundary) are documented in Plan 31-01's "Deferred Issues" section. They predate Phase 31 entirely and are explicitly out-of-scope per `execute-plan.md` SCOPE BOUNDARY.

## Deferred Issues

Same as Plan 31-01's deferred list — not re-enumerated here to avoid duplication. The README's Troubleshooting section ends with a single-paragraph note about them so contributors don't think they broke something when `npm test` shows those failures.

## User Setup Required

None — the README is pure documentation and the structural test runs as part of `npm run test:src`, which already runs in CI today.

## Next Phase Readiness

### Phase 31 completion

- All 4 plans of Phase 31 are now complete:
  - 31-01: Foundation (taxonomy + ledger + CI guard scaffold)
  - 31-02: Hallucination guard + report writer modules
  - 31-03: Vitest unit tests for all new modules (Wave 2, ran in parallel with this plan)
  - 31-04: README + structural test (this plan)
- All 9 LLM-* + DOC-01 requirements are now closed.
- Plan 31-03 (the full driver wiring) and this plan ran in parallel from the same Plan 02 base; the orchestrator will land both onto the main branch after both worktrees report success.

### Future enhancements

- Hallucination-rate spike triage (mentioned in README's Troubleshooting section) — defer to v3.1+ if it becomes a recurring issue
- ANTHROPIC_API_KEY pay-per-token fallback for Max 5 exhaustion (deferred per CONTEXT.md) — README points at the failure mode but offers no fix
- Persistent disk cache for spec excerpts (`.spec-cache/`) — explicitly declined in Plan 31-02; README does not mention it

### Blockers/Concerns

None. The README and structural test are inert documentation/test artifacts that affect no runtime behavior.

## Self-Check: PASSED

Verifications performed:

| Claim | Verification | Result |
|-------|-------------|--------|
| `tests/e2e/README.md` exists with > 8000 bytes | `wc -c tests/e2e/README.md` → 28099 | FOUND |
| `tests/unit/readme-structure.test.js` exists with 13 tests | File present + vitest reports 13 tests | FOUND |
| All 13 structural assertions PASS | `npx vitest run tests/unit/readme-structure.test.js` | 13/13 PASS |
| 7 H2 section headers present | `grep -c "^## " tests/e2e/README.md` → 7 | FOUND |
| 4 e2e:* scripts documented | manual grep + Test 4 of structural test | FOUND |
| Both data-testid values present | `grep -c "pct-citation-host\|pct-citation-pill"` → 2 | FOUND |
| Phase 30 contract: 3 strings present | `grep -q "X-PCT-Test-Mode" && grep -q "pct_test_cache_version" && grep -q "pct_test_mode"` | FOUND |
| Both thresholds present | `grep -q '\$80' && grep -q '\$100'` | FOUND |
| Both taxonomy codes present | `grep -q "LLM_HALLUCINATED_SELECTION" && grep -q "LLM_API_ERROR"` | FOUND |
| CI guard documented | `grep -q "CI=true" && grep -qi "local-only"` | FOUND |
| Ledger path documented | `grep -q "tests/e2e/.llm-spend-ledger.json"` | FOUND |
| Phase 28 report.test.js still green (no regression) | `npx vitest run tests/unit/report.test.js` | 11/11 PASS |
| Combined Phase 31 LLM-mode subset all green | `npx vitest run tests/unit/error-codes.test.js tests/unit/llm-ledger.test.js tests/unit/llm-hallucination.test.js tests/unit/llm-report.test.js tests/unit/readme-structure.test.js` | 64 passed + 4 skipped = 68 collected (skipped are offline-conditional pdfjs tests from Plan 02) |
| 2 commits with `(31-04)` scope | `git log --oneline a6a2034..HEAD` | 2 commits FOUND (f48d5d4, d0eb98d) |
| No stubs introduced | Manual grep for TODO/FIXME/placeholder/coming soon/not available in new files | none found |
| No new threat surface | Both files are docs/tests; no network, auth, schema, or file-system access at trust boundaries | confirmed |

---

*Phase: 31-llm-exploratory-mode-+-docs*
*Plan: 04*
*Completed: 2026-05-19*

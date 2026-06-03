---
phase: 42
status: human_needed
verified: 2026-05-31
must_haves_passed: 5/6
human_verification:
  - "Plan 42-03 Task 2: live end-to-end demo against GitHub issue #3 — deferred to Phase 47 CLEANUP-03 HUMAN-UAT (a) per maintainer decision; bootstrap dep + cost discipline rationale in 42-03-SUMMARY.md"
---

# Phase 42: fix-prompt-builder + WRONG_CITATION Vertical Slice — Verification Report

**Phase Goal:** Local end-to-end auto-fix loop closed for ONE error class (WRONG_CITATION) — proves diff application, branch creation, PR-body conventions before scaling.

**Verified:** 2026-05-31
**Status:** `human_needed` (code-side COMPLETE; Plan 42-03 Task 2 live demo deferred to Phase 47 per maintainer decision)
**Re-verification:** No — initial verification

## Goal Achievement — Success Criteria

| # | Success Criterion | Status | Evidence |
|---|-------------------|--------|----------|
| 1 | `fix-prompt-builder.js` wraps issue body in `<issue_body_untrusted>` envelope; exports frozen `PROMPT_SCAFFOLDS` with WRONG_CITATION + skip-class returns | ✓ VERIFIED | `tests/e2e/lib/fix-prompt-builder.js:46-49` (`ENVELOPE_OPEN`/`ENVELOPE_CLOSE`); `:155` (`Object.freeze({WRONG_CITATION})`); `:170-174` (frozen `SKIP_CLASS_ESCALATIONS`); runtime check confirms `Object.isFrozen` = true, `FLAKE→re-quarantine`, `LLM_API_ERROR→retry`, `PASS→close-as-pass` |
| 2 | `issue-payload-builder.js` escapes FORBIDDEN_DELIMITERS (Vitest crafted-payload case) | ✓ VERIFIED | `tests/e2e/lib/issue-payload-builder.js:51` (`export const FORBIDDEN_DELIMITERS`); `:107` (`escapeForbiddenDelimiters`); `:195,205-206,224,239` (applied to reason/golden/observed/rationale/rawDiff); 20 Vitest cases pass in `tests/unit/issue-payload-builder.test.js` |
| 3 | ESLint enforces fix-prompt-builder.js purity (forbids fs/child_process/path) | ✓ VERIFIED | `eslint.config.js:194-222` per-file block restricts node:fs/node:child_process/node:path/@anthropic-ai/sdk; `:266` adds path to catch-all `ignores:` (Pitfall 1 prevention); 6 programmatic ESLint API tests pass in `tests/unit/eslint-fix-prompt-builder-guard.test.js` |
| 4 | `scripts/auto-fix.mjs --issue <n>` routes ERROR_CLASS labels; `git apply --check` BEFORE apply; diff-guard pre-apply; `git ls-remote` idempotency | ✓ VERIFIED | `scripts/auto-fix.mjs:60` imports `countFixAttempts`; `:63` imports `checkDiffGuard` (no FORBIDDEN_PATHS re-definition — `grep -cE "^const FORBIDDEN_PATHS\s*=" = 0`); `:68` MODEL=`claude-sonnet-4-6`; `:238` branch=`auto-fix/${issue}-${fp8}`; `:259` calls `countFixAttempts(ledger, fingerprint)`; `:354-359` systemBlocks with `cache_control:{type:'ephemeral', ttl:'1h'}`; `:419` `checkDiffGuard(changedPaths)`; 20 Vitest cases pass in `tests/unit/auto-fix.test.js` |
| 5 | `fix_attempts` per fingerprint tracked; 4th attempt → human-review-required label + refuse | ✓ VERIFIED | `tests/e2e/lib/llm-ledger.js:267` (`export function countFixAttempts`); `scripts/auto-fix.mjs:259-261` (`attempts >= 3` → add label + exit 3); 7 Vitest cases for `countFixAttempts` + 3 cases for the cap (`AUTOFIX-05: fix_attempts cap at 3` Tests 14-16) all pass |
| 6 | Full local loop demonstrated end-to-end on real WRONG_CITATION issue → manual PR with verifier-gate flipping ready | ⚠️ DEFERRED | Plan 42-03 Task 2 explicitly deferred to Phase 47 CLEANUP-03 HUMAN-UAT (a) per maintainer decision 2026-05-31; rationale in `42-03-SUMMARY.md` lines 72-92: (a) bootstrap dependency — verifier-gate workflow not yet on GitHub; (b) cost discipline — $0.05-$0.15 burn for incomplete signal; (c) Phase 47 redundancy — CLEANUP-03 (a) already requires identical demo. `docs/v40-auto-fix-manual-demo.md` (159 LOC, 10 H2 sections) authored as Phase 47 reuse artifact. |

**Score:** 5/6 code-side criteria verified. SC #6 is NOT a code gap — procedurally deferred to milestone-close phase.

## Required Checks (objective)

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 1 | Each success criterion mapped to concrete artifacts | ✓ | Table above |
| 2 | `npx vitest run` passes (no Phase 42 regressions) | ✓ | 915/916 pass; 1 pre-existing flake in `e2e-weekly-digest.test.js:395` (deferred-items.md DEFERRED-42-01 — calendar rollover) |
| 3 | PROMPT_SCAFFOLDS has EXACTLY 4 keys (WRONG_CITATION + FLAKE + LLM_API_ERROR + PASS); other 4 NOT pre-stubbed | ⚠️ DIVERGENT BUT EQUIVALENT | `PROMPT_SCAFFOLDS` has **1 key** (WRONG_CITATION). Skip classes (FLAKE/LLM_API_ERROR/PASS) live in separate `SKIP_CLASS_ESCALATIONS` frozen map at `fix-prompt-builder.js:170-174` and short-circuit BEFORE registry lookup at `:198-200`. Plan 42-01 SUMMARY line 131 explicitly documents this as a decision: "`Object.keys(PROMPT_SCAFFOLDS).length === 1` ... keeping the registry shape minimal so Phase 45 can extend it without changing the registry semantics." Per-class routing behavior is verified equivalent — all 4 classes route correctly via the dispatcher. **The objective text appears to describe surface behavior; the implementation chose a cleaner split.** Other 4 classes (LLM_HALLUCINATED_SELECTION, etc.) correctly NOT pre-stubbed. |
| 4 | ESLint guard inlined SDK paths AND augmented Phase 39 catch-all `ignores:` (Pitfall 1) | ✓ | `eslint.config.js:213-218` inlines `@anthropic-ai/sdk` restriction in per-file block; `:266` adds `tests/e2e/lib/fix-prompt-builder.js` to catch-all ignores (6th entry, was 5); ESLint Test 4 in `eslint-fix-prompt-builder-guard.test.js` is regression guard |
| 5 | `invokeAnthropicSdkWithLedger` accepts both `systemPrompt` (back-compat) AND `systemBlocks` (cache_control array-form) | ✓ | `tests/e2e/lib/llm-driver.js:504-505` accepts both; `:520-521` validates either present; `:570` dispatches `system: hasSystemBlocks ? systemBlocks : systemPrompt`; 3 cache-control regression tests pass |
| 6 | `countFixAttempts` helper lives in `tests/e2e/lib/llm-ledger.js` | ✓ | `tests/e2e/lib/llm-ledger.js:267` (`export function countFixAttempts`); sibling of `phaseTotal` |
| 7 | `auto-fix.mjs` imports `checkDiffGuard` + `FORBIDDEN_PATHS` from Phase 41 (no re-definition) | ✓ | `scripts/auto-fix.mjs:63` `import { checkDiffGuard } from './check-diff-guard.mjs'`; `grep -cE "^const FORBIDDEN_PATHS\s*=" scripts/auto-fix.mjs` = 0 (no inline duplication) |
| 8 | `docs/v40-auto-fix-manual-demo.md` exists with 10-section procedure for Phase 47 reuse | ✓ | 159 LOC, 10 H2 sections, 24 key-reference matches; verify-block from Plan 42-03 Task 1 all green |
| 9 | SC #6 deferral documented in 42-03-SUMMARY.md with bootstrap-dependency rationale | ✓ | 42-03-SUMMARY.md lines 72-92 enumerate all 3 deferral reasons (bootstrap dep + cost discipline + Phase 47 redundancy) |

## Anti-Pattern Scan

| Check | Result |
|-------|--------|
| `TBD`/`FIXME`/`XXX` markers in Phase 42 files | NONE — `grep` across all 7 modified files returns empty |
| Stub/placeholder returns in production code | NONE — Plan 42-01 + 42-02 SUMMARY both explicitly state "Known Stubs: NONE" |
| `console.log`-only handlers | N/A (pure functions + CLI dispatcher with intentional stdout) |
| Empty implementations | NONE |

## Test Suite Results

| Suite | Result |
|-------|--------|
| `tests/unit/fix-prompt-builder.test.js` | 12/12 pass |
| `tests/unit/eslint-fix-prompt-builder-guard.test.js` | 6/6 pass |
| `tests/unit/issue-payload-builder.test.js` | 20/20 pass |
| `tests/unit/llm-ledger.test.js` | 61/61 pass |
| `tests/unit/auto-fix.test.js` | 20/20 pass |
| `tests/unit/llm-driver-sdk-cache-control.test.js` | 3/3 pass |
| **Phase 42 targeted total** | **122/122 pass** |
| Full `npx vitest run` | 915/916 pass (1 pre-existing flake — deferred-items.md DEFERRED-42-01; pre-existing per `git stash` audit in Plan 42-01) |

## Commits Verified

| Hash | Message |
|------|---------|
| `00ce353` | `test(42-01): RED — fix-prompt-builder envelope + FORBIDDEN_DELIMITERS escape + countFixAttempts + ESLint purity guard` |
| `e9b23ae` | `feat(42-01): fix-prompt-builder + FORBIDDEN_DELIMITERS escape + countFixAttempts + ESLint purity guard` |
| `9918fc5` | `test(42-02): RED — auto-fix dispatcher routing/idempotency/diff-guard/cap + cache-control driver extension` |
| `f6b2d13` | `feat(42-02): auto-fix.mjs dispatcher + invokeAnthropicSdkWithLedger systemBlocks extension` |
| `affc309` | `docs(42-03): manual demo procedure for v4.0 auto-fix vertical slice` |

TDD gate sequence preserved: RED commits precede GREEN commits in both Plan 42-01 and 42-02.

## Requirements Coverage

| Req | Source | Status | Evidence |
|-----|--------|--------|----------|
| PROMPT-01 | Plan 42-01 | ✓ SATISFIED | Envelope wrapping at `fix-prompt-builder.js:213`; 3 Vitest cases |
| PROMPT-02 | Plan 42-01 | ✓ SATISFIED | FORBIDDEN_DELIMITERS escape at `issue-payload-builder.js:107`; 5 Vitest cases |
| PROMPT-03 | Plan 42-01 | ✓ SATISFIED | Frozen registry at `:155`; 3 skip-class + 1 unsupported-class pinned |
| PROMPT-04 | Plan 42-01 | ✓ SATISFIED | Per-file ESLint block at `eslint.config.js:194-222`; 6 programmatic + static-grep tests |
| AUTOFIX-01 | Plan 42-02 | ✓ SATISFIED | Dispatcher routing Tests 1-6 in `auto-fix.test.js` |
| AUTOFIX-03 | Plan 42-02 | ✓ SATISFIED | `git apply --check` + diff-guard rejection Tests 7-11 |
| AUTOFIX-04 | Plan 42-02 | ✓ SATISFIED | `git ls-remote` idempotency Tests 12-13 |
| AUTOFIX-05 | Plan 42-02 | ✓ SATISFIED | `countFixAttempts` cap at 3 Tests 14-16 |

All 8 Phase 42 requirement IDs satisfied. AUTOFIX-02 correctly OUT OF SCOPE (Phase 43 lifts dispatcher into workflow).

## Pitfall Prevention Confirmed

- **Pitfall 1 / commit 345cdcb (ESLint flat-config rule clobber):** PREVENTED. Per-file block at `eslint.config.js:194-222` INLINES `@anthropic-ai/sdk` paths restriction; catch-all `ignores:` list at `:266` augmented (5→6 entries); regression-guard Test 4 in `eslint-fix-prompt-builder-guard.test.js` pins the SDK restriction on this file.
- **Pitfall 6 (cache_control silently dropped):** FIXED. Driver extended with `systemBlocks` array-form parameter; dispatcher consumer wires `cache_control:{type:'ephemeral', ttl:'1h'}`; regression-guard `llm-driver-sdk-cache-control.test.js` Test 2 asserts `Array.isArray(body.system) === true`.

## Human Verification Required

### 1. Live end-to-end auto-fix demo against GitHub issue #3 (Plan 42-03 Task 2)

**Test:** Per maintainer decision, deferred to Phase 47 CLEANUP-03 HUMAN-UAT (a). Procedure documented in `docs/v40-auto-fix-manual-demo.md` (10 sections).

**Expected:** `node scripts/auto-fix.mjs --issue 3 --force-api` produces a draft PR on `auto-fix/3-139f821b` that the Phase 41 verifier-gate workflow advisorily processes; on PASS the workflow flips draft→ready and applies `auto-fix:verified` label; on FAIL the PR stays draft with rejection comment.

**Why human:** (a) Bootstrap dependency — Phase 41 verifier-gate workflow is local-only on `main`; Phase 47 will push the v4.0 commits to GitHub before running the live demo. (b) Cost discipline — $0.05-$0.15 SDK burn per invocation; running today would be wasted spend on incomplete signal. (c) Phase 47 redundancy — CLEANUP-03 (a) already requires this exact demo as one of 5 milestone-close HUMAN-UATs.

## Gaps Summary

**No code-side gaps.** All 122 Phase 42 unit tests pass. All 8 requirement IDs (PROMPT-01..04, AUTOFIX-01/03/04/05) implemented and unit-tested. ESLint Pitfall 1/3 prevention triple-guarded. Pitfall 6 cache_control wiring regression-guarded.

The single open item — the live billable demo (SC #6) — is procedurally deferred to Phase 47, not a gap. Phase 42's code is production-ready and Phase 43 can lift the dispatcher into a GitHub Actions workflow with no shape change.

One observation worth surfacing: required check #3 in the objective specified PROMPT_SCAFFOLDS should have "EXACTLY 4 keys" (WRONG_CITATION + FLAKE + LLM_API_ERROR + PASS). The shipped implementation has 1 key in the registry with skip classes living in a separate `SKIP_CLASS_ESCALATIONS` frozen map. This is a deliberate Plan 42-01 design decision documented in the SUMMARY (line 131) — registry stays minimal so Phase 45 extension doesn't change semantics. The user-visible behavior (all 4 classes route correctly) is verified equivalent via the dispatcher tests.

---

_Verified: 2026-05-31_
_Verifier: Claude (gsd-verifier)_

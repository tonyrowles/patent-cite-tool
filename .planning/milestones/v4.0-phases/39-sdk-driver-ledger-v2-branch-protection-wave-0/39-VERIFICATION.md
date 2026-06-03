---
phase: 39
status: passed
verified: 2026-05-31
must_haves_passed: 5/5
score: 5/5 success criteria verified
overrides_applied: 0
---

# Phase 39: SDK Driver + Ledger v2 + Branch Protection Wave-0 — Verification Report

**Phase Goal:** Foundation library + repo-level safety rails landed before any auto-fix PR can open.

**Verified:** 2026-05-31
**Status:** passed
**Verifier:** Claude (gsd-verifier, goal-backward)
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (from ROADMAP Success Criteria 1–5)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `invokeAnthropicSdkWithLedger` lives in `tests/e2e/lib/llm-driver.js` with inverse CI gate and shares unified `LEDGER_PATH` with `invokeClaudePWithLedger` | VERIFIED | `llm-driver.js:493` exports `invokeAnthropicSdkWithLedger`; inverse gate at line 507 (`if (!inCi && !forceApi)`); both wrappers read `LEDGER_PATH` from `llm-ledger.js:73` (resolves to `tests/e2e/.llm-spend-ledger.json`) |
| 2 | `llm-ledger.js` accepts additive `transport` + `phase` fields; `combinedMonthlyTotal()` sums both transports against same $80/$100 thresholds | VERIFIED | `appendLedgerEntry` (line 637) spreads entry into iterations[] (LEDGER-01 by inspection); `combinedMonthlyTotal` (line 518) wraps `monthlyTotal`; `checkSpendCap` (line 245) uses `HARD_CAP_USD=100` and `WARN_THRESHOLD_USD=80` (constants at lines 103, 109); runtime check confirmed both thresholds apply to combined total |
| 3 | Per-day ($10), per-issue ($1), per-PR ($2) sub-caps refuse invocation; Vitest covers each boundary | VERIFIED | Constants at lines 139/147/155 of `llm-ledger.js` (`DAY_HARD_CAP_USD=10`, `ISSUE_HARD_CAP_USD=1`, `PR_HARD_CAP_USD=2`); `checkDayCap`/`checkIssueCap`/`checkPrCap` at lines 425/454/483; SDK driver enforces all 4 caps at lines 519–527; Vitest cases 42, 43, 44, 45, 46, 47 cover boundary; SDK-side cases 34, 35, 36 (in llm-driver.test.js) cover driver enforcement |
| 4 | `tests/e2e/.llm-spend-ledger.json` flipped from gitignored to committed-but-versioned; ESLint guard restricts `@anthropic-ai/sdk` to `llm-driver.js` only | VERIFIED | `git ls-files tests/e2e/.llm-spend-ledger.json` returns the path; `.gitignore` does not contain the ledger path; committed file has v1 schema with `phase:'39-bootstrap'`, `transport:'sdk'`, `cost_usd:0`, `source:'phase-39-flip'`; `eslint.config.js:197–219` LAST block restricts `@anthropic-ai/sdk` with expanded ignores list (5 files); per-file blocks (pdf-verifier, rerun-validator, triage-classifier) inline the SDK restriction |
| 5 | Allow auto-merge OFF; ruleset on `main` with bypassing disabled + required-status-check slot reserved; CODEOWNERS pins the 5 paths | VERIFIED | `docs/v40-repo-config.md` documents the manual settings; `39-04-SUMMARY.md` records `gh api` captures: `allow_auto_merge: false`, ruleset `v4.0-main-protection` (id 17086676) `enforcement: active`, `bypass_actors: []`, `require_code_owner_review: true`, required-status-checks absent (Phase 41 slot); `.github/CODEOWNERS` pins all 5 paths to `@tonyrowles` |

**Score:** 5/5 truths verified

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `tests/e2e/lib/llm-driver.js` | invokeAnthropicSdkWithLedger sibling export with INVERSE CI gate; v3.1 invokeClaudePWithLedger unchanged | VERIFIED | 604 lines; both functions exported; line 387 CI gate text byte-for-byte identical to v3.1; new function uses `import Anthropic from '@anthropic-ai/sdk'` (only allowed importer) |
| `tests/e2e/lib/llm-ledger.js` | 12 new exports (3 constants + 9 functions) | VERIFIED | 689 lines; runtime check confirms `DAY_HARD_CAP_USD=10`, `ISSUE_HARD_CAP_USD=1`, `PR_HARD_CAP_USD=2`, plus 9 functions (currentIsoDay, dayTotal, issueTotal, prTotal, checkDayCap, checkIssueCap, checkPrCap, combinedMonthlyTotal, combinedMonthlyTotalByTransport) |
| `tests/e2e/lib/llm-pricing.js` | claude-sonnet-4-6 entry @ $3 input / $15 output per Mtok | VERIFIED | Line 40 contains entry; runtime check: `fallbackCostUsd('claude-sonnet-4-6', 1_000_000, 1_000_000) === 18` (Sonnet rates, NOT Opus default of 90) |
| `tests/e2e/.llm-spend-ledger.json` | Committed bootstrap entry, v1 schema | VERIFIED | 21 lines; `git ls-files` returns the path (tracked); `version: 1`; single bootstrap iteration with all required fields |
| `eslint.config.js` | SDK guard appended LAST with expanded ignores | VERIFIED | 220 lines; Phase 39 block at lines 197–219 is the LAST block; ignores list contains 5 files (driver + pdf-verifier + rerun-validator + triage-classifier + e2e-triage-classifier.mjs); each per-file block inlines the SDK paths restriction (Pitfall 3 mid-merge fix at commit `345cdcb`) |
| `.github/CODEOWNERS` | 5 path pins to @tonyrowles, no aliases | VERIFIED | 11 lines; 5 path lines all end in `@tonyrowles`; grep confirms no `@TR` or `@fatduck` anywhere |
| `docs/v40-repo-config.md` | Manual settings audit reference | VERIFIED | 117 lines; mentions `@anthropic-ai/sdk`, `sonnet-4-6`, `verifier-gate`, `ANTHROPIC_API_KEY`, `allow_auto_merge`, `bypass_actors`, `@tonyrowles` (24 total matches) |
| `package.json` | `@anthropic-ai/sdk` pinned EXACTLY to `0.100.1` | VERIFIED | Line 33: `"@anthropic-ai/sdk": "0.100.1",` (no `^`, no `~`) |
| `.gitignore` | Phase 31 ledger lines removed | VERIFIED | grep for `llm-spend-ledger` and `ledger` returns no matches |
| `tests/unit/llm-ledger.test.js` | LEDGER-01/02/03/04 cases | VERIFIED | 1030 lines; Tests 34–47 (Plan 01) + Tests 48–49 (Plan 04) appended |
| `tests/unit/llm-driver.test.js` | SDK transport cases 31–40 | VERIFIED | 964 lines; vi.mock factory + 10 Phase 39 cases |
| `tests/unit/codeowners.test.js` | 7-case static-grep guard | VERIFIED | 90 lines; ran in suite |
| `tests/unit/eslint-sdk-guard.test.js` | 5-case static + programmatic ESLint guard | VERIFIED | 95 lines; ran in suite |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `tests/e2e/lib/llm-driver.js` | `@anthropic-ai/sdk` | `import Anthropic from '@anthropic-ai/sdk'` (only allowed here) | WIRED | Import at top; ESLint guard ignores list permits ONLY this file |
| `tests/e2e/lib/llm-driver.js` | `tests/e2e/lib/llm-ledger.js` | `checkDayCap, checkIssueCap, checkPrCap` (Plan 01 helpers) | WIRED | Driver uses all 3 sub-cap helpers at lines 519–522 |
| `tests/e2e/lib/llm-driver.js` | `tests/e2e/lib/llm-pricing.js` | `fallbackCostUsd` for cost math | WIRED | Used at line 546 (cost computation from response.usage) |
| `eslint.config.js` | `@anthropic-ai/sdk` | `no-restricted-imports` paths block | WIRED | LAST block with expanded 5-file ignores list (lines 197–219); per-file blocks inline the same restriction |
| `tests/unit/codeowners.test.js` | `.github/CODEOWNERS` | `fs.readFileSync` + line-by-line includes assertion | WIRED | Test 1 checks file exists; Tests 2–7 assert path strings and owner |
| Plan 04 bootstrap entry | `tests/e2e/lib/llm-ledger.js` | seeded via `appendLedgerEntry` (Pitfall 1 mitigation) | WIRED | Committed JSON has all expected fields; readLedger returns the bootstrap entry, NOT empty fallback |

---

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All exports importable from llm-ledger.js | `node -e "import('./tests/e2e/lib/llm-ledger.js').then(...)"` | All caps + helpers present | PASS |
| claude-sonnet-4-6 resolves to Sonnet rates (NOT default Opus) | `fallbackCostUsd('claude-sonnet-4-6', 1_000_000, 1_000_000)` | `18` (Sonnet); NOT `90` (Opus default) | PASS |
| Driver exports both wrappers | `node -e "import('./tests/e2e/lib/llm-driver.js').then(...)"` | Both functions present; LEDGER_PATH shared | PASS |
| Vitest full suite | `npx vitest run` | `46 files, 723 passed (723)` | PASS |
| ESLint guard passes existing codebase | `npm run lint` | 0 errors, 2 pre-existing warnings (settings.js, out of Phase 39 scope) | PASS |
| Ledger is git-tracked | `git ls-files tests/e2e/.llm-spend-ledger.json` | Returns the path | PASS |
| Ledger NOT in gitignore | `grep "llm-spend-ledger" .gitignore` | No matches | PASS |
| CODEOWNERS owner pinning | `grep @tonyrowles .github/CODEOWNERS \| wc -l` | 5 | PASS |
| Forbidden aliases absent | `grep -E "@TR\|@fatduck" .github/CODEOWNERS` | No matches | PASS |
| Exact pin in package.json | `grep '"@anthropic-ai/sdk"' package.json` | `"@anthropic-ai/sdk": "0.100.1",` (no caret/tilde) | PASS |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| LEDGER-01 | 39-01 | appendLedgerEntry accepts transport + phase additively | SATISFIED | Tests 34–37 in llm-ledger.test.js verify round-trip; function body unchanged (spread propagates new fields) |
| LEDGER-02 | 39-01 | combinedMonthlyTotal sums both transports against $80/$100 caps | SATISFIED | Tests 38–41 in llm-ledger.test.js; runtime confirmation that thresholds match |
| LEDGER-03 | 39-01, 39-03 | Per-day/per-issue/per-PR sub-caps with binary block status | SATISFIED | Helpers + constants in llm-ledger.js; SDK driver enforces all 4 caps; Tests 42–47 (ledger) + 34–36 (driver) verify boundaries |
| LEDGER-04 | 39-04 | .llm-spend-ledger.json committed with bootstrap entry | SATISFIED | File tracked; v1 schema; bootstrap iteration with phase='39-bootstrap', transport='sdk'; Tests 48, 49 |
| CLEANUP-04 | 39-02, 39-03, 39-04 | Branch protection + CODEOWNERS + ESLint guard | SATISFIED | CODEOWNERS pins 5 paths; ESLint guard LAST + expanded ignores; gh api captures confirm `allow_auto_merge:false`, ruleset active, `bypass_actors:[]` |

---

## Pitfall Mitigation Spot-Checks

| Pitfall | Mitigation | Status |
|---------|-----------|--------|
| Pitfall 1 (bootstrap silent corruption) | Bootstrap seeded via `appendLedgerEntry` (not hand-written JSON) — guarantees valid v1 schema; Test 48 asserts JSON.parse + version=1 + exact fields | VERIFIED — committed file is well-formed |
| Pitfall 2 (SDK pricing fall-through to Opus default) | `claude-sonnet-4-6` added to `PRICING_BY_MODEL` with `$3/$15` per Mtok rates; runtime check `fallbackCostUsd('claude-sonnet-4-6', 1M, 1M) === 18` (NOT 90) | VERIFIED |
| Pitfall 3 (ESLint flat-config order — block clobber) | Phase 39 block appended LAST + expanded ignores list (5 files); each per-file block (pdf-verifier, rerun-validator, triage-classifier x2) INLINES the @anthropic-ai/sdk paths restriction. Mid-merge fix commit `345cdcb` confirmed: "fix(39): repair ESLint flat-config rule clobber (Pitfall 3 manifestation)" | VERIFIED — Pitfall 3 actually manifested (17 tests failed post-merge), was diagnosed and patched; this is a real learning for Phase 47's CLEANUP-04 audit |
| Pitfall 4 (CODEOWNERS username silently disables protection) | Verified owner is `@tonyrowles` via `gh api user --jq .login` per CONTEXT; `tests/unit/codeowners.test.js` Tests 3, 5 pin the owner string and assert `@TR`/`@fatduck` aliases absent | VERIFIED |
| Pitfall 5 (required-status-check slot reserved EMPTY) | Capture 3 confirms ruleset rules has NO `required_status_checks` entry — slot reserved for Phase 41 verifier-gate | VERIFIED |
| Pitfall 8 (always-append ledger on every call) | invokeAnthropicSdkWithLedger appends on success (line 577) AND on sdk_error catch path (line 545); ciGate-only path does NOT append (matches v3.1 invariant) | VERIFIED |

---

## v3.1 Invariant Preservation

- `invokeClaudePWithLedger` CI gate at `tests/e2e/lib/llm-driver.js:387`: line text byte-for-byte identical to v3.1 (`if (process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true')`)
- Function body lines 378–447 unchanged; only shifted +3 lines due to import additions above
- All 33 pre-existing v3.1 Vitest cases in llm-ledger.test.js continue to pass
- All 30 pre-existing v3.1 Vitest cases in llm-driver.test.js continue to pass
- Phase 39 regression cases (39, 40) in llm-driver.test.js explicitly assert CI=true and GITHUB_ACTIONS=true still gate the subscription wrapper

---

## Anti-Patterns Found

None. Modified files contain no `TODO`/`FIXME`/`XXX`/`TBD`/`HACK`/`PLACEHOLDER` markers (grep across all 7 modified production files returned no matches).

---

## Mid-Merge Pitfall 3 Discovery (Noted Learning for Phase 47)

A post-merge bug was discovered and fixed in commit `345cdcb` ("fix(39): repair ESLint flat-config rule clobber (Pitfall 3 manifestation)"). The originally-planned Phase 39 ESLint block used `files: ['**/*.{js,mjs}']` with only `ignores: ['tests/e2e/lib/llm-driver.js']`. This silently CLOBBERED the per-file `no-restricted-imports` rules on:
- `tests/e2e/lib/pdf-verifier.js` (VFY-02 src/** independence)
- `tests/e2e/lib/rerun-validator.js` (RERUN-04 src/** independence)
- `tests/e2e/lib/triage-classifier.js` (D-07 invokeClaudeP restriction)
- `scripts/e2e-triage-classifier.mjs` (same D-07 restriction)

Result: 17 v3.1 tests failed after Wave 3 merge. Fix: (a) expanded the Phase 39 block's `ignores` list to include all 4 files, and (b) inlined the `@anthropic-ai/sdk` paths restriction into each of those per-file blocks so the SDK guard still applies there.

This is Pitfall 3 actually manifesting (not just theoretically). The original `tests/unit/eslint-sdk-guard.test.js` Test 3 only checks "block appears in last 50 lines" — it does NOT catch the rule-clobber. **Recommended action for Phase 47 CLEANUP-04 audit:** add a regression test that lints actual repo files and confirms per-file rules survive (e.g., assert `no-restricted-imports` fires on pdf-verifier.js importing `src/foo.js`).

The fix is committed and verified — current `eslint.config.js` correctly preserves all 4 per-file rules.

---

## Human Verification Required

None. All criteria are verifiable from codebase + test outputs + already-captured `gh api` snapshots in 39-04-SUMMARY.md. Phase 47 will RE-audit the GitHub-side settings via `gh api` calls per the captured baseline.

---

## Gaps Summary

No gaps. All 5 ROADMAP success criteria are fully satisfied with codebase evidence, runtime checks, and test coverage. The 723-test Vitest suite passes; ESLint reports 0 errors; the committed bootstrap ledger is well-formed; CODEOWNERS pins the verified GitHub login; the `gh api` audit captures match the locked CONTEXT decisions. The Pitfall 3 mid-merge fix is resolved and noted as a Phase 47 learning.

Phase 39 is ready to close. Foundation library + repo-level safety rails are landed; Phase 40+ can build on top.

---

*Verified: 2026-05-31*
*Verifier: Claude (gsd-verifier, goal-backward)*

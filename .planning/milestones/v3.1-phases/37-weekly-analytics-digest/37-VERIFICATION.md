---
phase: 37-weekly-analytics-digest
verified: 2026-05-28T15:00:00Z
status: human_needed
score: 12/12 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Trigger the workflow manually via workflow_dispatch on main branch and confirm it completes successfully"
    expected: "Workflow runs to completion; a reports/weekly-digest-YYYY-WNN.md file is committed to main with [skip ci]; an e2e-digest-labeled issue is filed in the repo"
    why_human: "Monday 07:00 UTC scheduled cron cannot be verified without a live GitHub Actions run. The YAML assertions (cron string, permissions, label-ensure, commit-in-run tokens) are verified programmatically but actual execution against the GitHub API requires a real environment with a valid GH_TOKEN and an accessible repository."
---

# Phase 37: Weekly Analytics Digest — Verification Report

**Phase Goal:** Monday 07:00 UTC digest of prior week's LLM-triage findings published to GitHub Discussions (or e2e-digest-labeled issue fallback) + committed as reports/weekly-digest-YYYY-WNN.md, ≤50 lines, aggregating findings count + classification breakdown + top-3 failure categories + quarantine growth + cost vs cap
**Verified:** 2026-05-28T15:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | DIGEST-04: SUMMARY_KEYS exported (frozen, 7 keys, correct order) from tests/e2e/lib/llm-report.js | VERIFIED | `llm-report.js:123-131` — `export const SUMMARY_KEYS = Object.freeze([...7 keys...])`. Order: passed, wrong_citation, verifier_disagree, llm_hallucinated_selection, llm_api_error, harness_error, total_cost_usd. Unit tests A/B/C in `tests/unit/llm-report.test.js` assert frozen, 7-length, exact order, and emptySummary derivation. |
| 2 | DIGEST-04: emptySummary() rebuilt from SUMMARY_KEYS (single source); every classificationToSummaryKey return value is in SUMMARY_KEYS | VERIFIED | `llm-report.js:133-135` — `Object.fromEntries(SUMMARY_KEYS.map((k) => [k, 0]))`. classificationToSummaryKey returns only keys present in SUMMARY_KEYS (lines 143-152). |
| 3 | DIGEST-01: weekly-digest.mjs reads open issues by both e2e-nightly and e2e-quarantine labels via gh API, dedups by issue.number, aggregates {findings count, classification breakdown, top-3 failure categories, quarantine growth, cost vs cap} | VERIFIED | `weekly-digest.mjs:352-353` reads both labels unconditionally; `aggregate()` at lines 98-140 merges+dedups via Map keyed by `issue.number`, tallies classification, top-3 with ties broken alphabetically, quarantine growth via 7-day window. Test group "five aggregations present" asserts all five metrics present and findings count = 9 distinct (not 10 per-label sum). |
| 4 | DIGEST-01 / CR-01: category resolved by ERROR_CLASSES taxonomy membership, NOT labels[0] position (GitHub REST does not guarantee label array order) | VERIFIED | `weekly-digest.mjs:33-34` imports ERROR_CLASSES + creates ERROR_CLASS_SET; `aggregate():119-120` uses `names.find(n => ERROR_CLASS_SET.has(n)) ?? 'UNCLASSIFIED'`. CR-01 regression test asserts issue #103 (category at labels[2], not index 0) is attributed to WRONG_CITATION; structural labels (e2e-nightly, triage) never appear as category buckets. |
| 5 | DIGEST-01 / CR-02: gh fetch failure throws (not silently returns []) so runDigest aborts before writing/committing/filing | VERIFIED | `makeRealGhClient.listOpenIssuesByLabel` (lines 234-261) throws on non-zero exit, unparseable JSON, or non-array payload. CR-02 test group asserts: (a) injected throwing client rejects runDigest and writes no file; (b) real client with mock-gh exiting non-zero exits process non-zero with stderr matching "silent-zero"; (c) legitimate empty result (gh exits 0, returns []) still publishes a real "0 findings" digest. |
| 6 | DIGEST-04: validateSummaryKeys throws NAMING the missing key on any missing key; no silent zero | VERIFIED | `validateSummaryKeys()` lines 78-87 throws `Error("...missing required SUMMARY_KEY '${k}'...")`. Test group "missing SUMMARY_KEY throws naming the key" asserts throw + message contains the specific key name. |
| 7 | DIGEST-04: rendered markdown is ≤50 lines, aggregated only (no per-iteration list); line-count guard enforces it | VERIFIED | `renderDigest()` lines 209-215 throws if `md.split('\n').length > 50`. No per-iteration content in render function. Test group "<=50 lines" asserts `lineCount <= 50` against fixture-driven output. |
| 8 | DIGEST-03: ISO-week filename helper returns YYYY-Www; 2027-01-01 → 2026-W53 (Thursday-shift algorithm); reports/weekly-digest-YYYY-WNN.md written | VERIFIED | `isoWeekLabel()` lines 58-70 implements Thursday-shift. `runDigest:377` writes `reports/weekly-digest-${weekLabel}.md`. Tests assert 2026-W01, 2026-W53, 2026-W22 boundary fixtures. |
| 9 | DIGEST-03: both publish branches dispatch correctly per DIGEST_PUBLISH_MODE; auto mode probes has_discussions and falls back to issue when false | VERIFIED | `resolvePublishMode()` at lines 397-403 handles auto/issue/discussion. Tests "both publish branches" group asserts: DIGEST_PUBLISH_MODE=issue → createDigestIssue called; =discussion → createDiscussion called; =auto + has_discussions=false → issue path used. |
| 10 | DIGEST-02: workflow triggers on schedule cron '0 7 * * 1' (Monday 07:00 UTC) and workflow_dispatch | VERIFIED | `e2e-weekly-digest.yml:23-24` contains `cron: '0 7 * * 1'` and `workflow_dispatch: {}`. YAML test Y1 asserts both. |
| 11 | DIGEST-02: permissions block has contents: write AND discussions: write AND issues: write | VERIFIED | `e2e-weekly-digest.yml:33-37` has all three permissions. `grep -cE "issues: write\|contents: write\|discussions: write"` returns 8 (multiple occurrences including comments). YAML test Y2 asserts all three present. |
| 12 | DIGEST-03: markdown committed to reports/weekly-digest-*.md in the same run via git add + git commit [skip ci] + git push | VERIFIED | `e2e-weekly-digest.yml:106-110` contains `git add reports/weekly-digest-*.md`, `git diff --cached --quiet \|\| git commit -m "docs(weekly-digest): ${{ env.WEEK_LABEL }} [skip ci]"`, `git push`. YAML test Y5 asserts all four tokens including `[skip ci]`. |

**Score:** 12/12 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `tests/e2e/lib/llm-report.js` | SUMMARY_KEYS frozen named export; emptySummary() built from it | VERIFIED | `export const SUMMARY_KEYS = Object.freeze([...])` at line 123; `Object.fromEntries(SUMMARY_KEYS.map(...))` at line 134 |
| `tests/unit/llm-report.test.js` | SUMMARY_KEYS export + single-source proof tests | VERIFIED | 3-test describe block "SUMMARY_KEYS export (Phase 37 D-01)" with Tests A/B/C |
| `scripts/weekly-digest.mjs` | injected-deps digest CLI: read issues → aggregate → render ≤50 lines → write report → publish | VERIFIED | 420-line substantive implementation; exports isoWeekLabel, validateSummaryKeys, aggregate, renderCostLine, renderDigest, runDigest; isMain guard at lines 408-416 |
| `tests/e2e/scripts/e2e-weekly-digest.test.js` | mock-gh suite: 5 aggregations, ≤50 lines, missing-key throw, both publish branches, CR-01/CR-02 regression tests | VERIFIED | 22 tests across 10 describe groups; all pass (npx vitest run returns 22 passed) |
| `tests/e2e/fixtures/phase37-digest-issues.json` | mock gh-api issues array with mixed labels, shuffled-label issue (#103), in/out-of-window created_at | VERIFIED | File exists; fixture header comment documents expected aggregation numbers; issue #103 has category at labels[2] (CR-01 shuffle fixture) |
| `.github/workflows/e2e-weekly-digest.yml` | Monday cron workflow: checkout, setup-node, label-ensure, run digest, commit-in-run | VERIFIED | 111-line workflow with all required sections |
| `tests/e2e/scripts/e2e-weekly-digest-yaml.test.js` | grep-based YAML assertions Y1-Y6 | VERIFIED | 6 tests; all pass |
| `package.json` | e2e:weekly-digest script + weekly-digest.mjs in lint allowlist | VERIFIED | Both present; confirmed by SUMMARY and grep |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `scripts/weekly-digest.mjs` | `tests/e2e/lib/llm-report.js SUMMARY_KEYS` | `import { SUMMARY_KEYS }` at line 27 | WIRED | Import present; used in validateSummaryKeys() and summaryTally construction at line 359 |
| `scripts/weekly-digest.mjs` | `tests/e2e/lib/llm-ledger.js` | `monthlyTotal\|HARD_CAP_USD` at lines 39-44 | WIRED | Both imported and used in renderCostLine() lines 155-159 |
| `scripts/weekly-digest.mjs` | `tests/e2e/lib/error-codes.js ERROR_CLASSES` | `import { ERROR_CLASSES }` at line 33 | WIRED | Imported; ERROR_CLASS_SET = new Set(ERROR_CLASSES) used in aggregate() line 120 |
| `.github/workflows/e2e-weekly-digest.yml` | `scripts/weekly-digest.mjs` | `npm run e2e:weekly-digest` step at line 83 | WIRED | Run step present; package.json e2e:weekly-digest script confirmed |
| `.github/workflows/e2e-weekly-digest.yml commit step` | `reports/weekly-digest-*.md` | `git add reports/weekly-digest-*.md` + `git push` | WIRED | Lines 108-110 of workflow |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| `scripts/weekly-digest.mjs renderDigest()` | agg.findingsCount, agg.breakdown, agg.top3, agg.quarantineGrowth | `aggregate()` consuming `ghClient.listOpenIssuesByLabel()` results | Yes — reads live GitHub issues; deduped by issue.number; tallied by ERROR_CLASS_SET membership | FLOWING |
| `scripts/weekly-digest.mjs renderCostLine()` | spent | `readLedger(ledgerPath)` + `monthlyTotal()` | Yes — reads ledger file; existsSync guards absent-ledger case | FLOWING (graceful degradation when ledger absent) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| digest unit suite (all 22 tests including CR-01/CR-02 regressions) | `npx vitest run tests/e2e/scripts/e2e-weekly-digest.test.js` | 22 passed | PASS |
| YAML contract test (Y1-Y6) | `npx vitest run tests/e2e/scripts/e2e-weekly-digest-yaml.test.js` | 6 passed | PASS |
| Full test:src suite | `npm run test:src` | 678 passed, 0 failed (43 test files) | PASS |
| Lint | `npm run lint` | 0 errors, 2 warnings (pre-existing; not in phase files) | PASS |
| SUMMARY_KEYS export present | `grep -c "SUMMARY_KEYS" tests/e2e/lib/llm-report.js` | 2 | PASS |
| ERROR_CLASS_SET / ERROR_CLASSES (CR-01 fix) | `grep -c "ERROR_CLASS_SET\|ERROR_CLASSES" scripts/weekly-digest.mjs` | 4 | PASS |
| throw on fetch failure (CR-02 fix) | `grep -c "throw" scripts/weekly-digest.mjs` | 9 | PASS |
| Monday cron in workflow | `grep -c "0 7 \* \* 1" .github/workflows/e2e-weekly-digest.yml` | 1 | PASS |
| 3 write permissions in workflow | `grep -cE "issues: write\|contents: write\|discussions: write"` | 8 (3 distinct keys present) | PASS |
| [skip ci] in workflow | `grep -c "skip ci" .github/workflows/e2e-weekly-digest.yml` | 4 | PASS |
| e2e-digest label in workflow + script | `grep -c "e2e-digest" workflow + script` | 5 + 2 = 7 | PASS |
| weekly-digest- filename in script | `grep -c "weekly-digest-" scripts/weekly-digest.mjs` | 2 | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| DIGEST-01 | Plans 37-02 | weekly-digest.mjs reads open GitHub issues filtered by e2e-nightly and e2e-quarantine labels via gh API; aggregates {findings count, classification breakdown, top-3 failure categories, quarantine growth, cost vs cap} | SATISFIED | aggregate() in weekly-digest.mjs:98-140; CR-01 fix ensures category by ERROR_CLASSES membership not label order; CR-02 fix ensures fetch failure throws |
| DIGEST-02 | Plans 37-03 | e2e-weekly-digest.yml triggers Monday 07:00 UTC; permissions contents: write + discussions: write | SATISFIED (automated proxy only) | cron '0 7 * * 1' at yml:23; all 3 write permissions at yml:33-37; YAML tests Y1/Y2 pass. Live cron execution requires human validation |
| DIGEST-03 | Plans 37-02, 37-03 | Digest published to GitHub Discussion (or e2e-digest issue fallback); markdown committed to reports/weekly-digest-YYYY-WNN.md | SATISFIED (code path verified) | Both publish branches implemented and tested; ISO-week filename at weekly-digest.mjs:377; commit-in-run with [skip ci] at yml:106-110. Live publish requires human validation |
| DIGEST-04 | Plans 37-01, 37-02 | SUMMARY_KEYS exported from lib/llm-report.js; digest validates all keys present (throws on missing); output ≤50 lines (aggregated) | SATISFIED | SUMMARY_KEYS exported frozen 7-element array; validateSummaryKeys throws naming key; renderDigest enforces ≤50-line guard; all unit tests pass |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `scripts/weekly-digest.mjs` | 363 | `typeof now === 'function' ? now() : now` dual-type handling (IN-02) | Info | Minor smell; both branches work correctly; flagged as IN-02 in REVIEW and deferred |
| `scripts/weekly-digest.mjs` | 211, 129 | Magic literals `50` and `3` (IN-04) | Info | Spec-locked constants; correct; flagged as IN-04 in REVIEW and deferred |
| `scripts/weekly-digest.mjs` | 286 | GraphQL title shell-interpolated via replaceAll (IN-01) | Info | Input is internally controlled (`[e2e-digest] Weekly analytics ${isoWeekLabel(now)}`); dormant path; flagged as IN-01 in REVIEW and deferred |

No TBD/FIXME/XXX debt markers found in phase files. Deferred warnings (WR-01 through WR-06, IN-01 through IN-04) are documented in REVIEW.md and intentionally out of scope for this phase per the code review decision.

### Human Verification Required

#### 1. Live Monday Cron Execution

**Test:** Either wait for the next Monday 07:00 UTC trigger, or manually trigger the workflow via the GitHub Actions UI (Actions tab → E2E Weekly Digest → Run workflow).
**Expected:** Workflow completes with green status; a commit is pushed to main with message `docs(weekly-digest): YYYY-WNN [skip ci]`; a file `reports/weekly-digest-YYYY-WNN.md` exists in the repo with ≤50 lines containing all five aggregations; an issue is filed with the `e2e-digest` label titled `[e2e-digest] Weekly analytics YYYY-WNN`.
**Why human:** The Monday 07:00 UTC scheduled cron cannot be tested programmatically without an actual GitHub Actions environment. YAML tokens (cron string, permissions, label-ensure, commit-in-run, [skip ci]) are verified via string assertions in the YAML test suite (Y1-Y6, all passing), but a live execution is required to confirm the GH_TOKEN has the necessary permissions and the gh CLI calls succeed against the real GitHub API.

### Gaps Summary

All 12 automated must-haves are VERIFIED. The only remaining item is the live GitHub Actions execution of the Monday cron, which is inherently not verifiable by static code analysis. The YAML proxy assertions (cron token, 3 write permissions, label-ensure, commit-in-run with [skip ci]) all pass via the YAML grep test suite.

The two CRITICAL code review findings (CR-01: category by ERROR_CLASSES membership, CR-02: throw on fetch failure) were fixed in commits `4cac665` and `16dedf3` respectively, and both are covered by regression tests that pass in the current suite.

The six code review warnings (WR-01 through WR-06) are acknowledged deferred items and do not block the phase goal.

---

_Verified: 2026-05-28T15:00:00Z_
_Verifier: Claude (gsd-verifier)_

---
phase: 35-rich-issue-filer-+-quarantine-corpus
verified: 2026-05-27T17:35:00Z
status: human_needed
score: 5/5 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Run `scripts/e2e-report-issue.mjs --source triage` against a real (non-fixture) triage-report.json from an actual nightly run and confirm a GitHub issue is created with all four body sections, fingerprint on line 1, and labels [category, 'e2e-nightly', 'triage'] visible in the GitHub UI"
    expected: "A new GitHub issue appears on the repo with the correct label set; body begins with <!-- fp: ... -->; all four markdown sections are present and readable; LLM rationale is fenced (not rendered as raw markdown headers)"
    why_human: "End-to-end gh CLI issue creation requires network access to GitHub, authentication, and a real triage-report.json artifact — none of which can be produced in an automated grep/node check"
  - test: "Run `scripts/quarantine-append.mjs --input <real-artifact-triage-report>` three times with the same CONFIRMED finding and verify in the GitHub UI that the source triage issue gets the 'quarantine:ready-for-promotion' label on the third run"
    expected: "After run 3, gh issue view <n> shows the quarantine:ready-for-promotion label; test-cases-quarantine.js has one entry with stable_runs=3"
    why_human: "Requires a real GitHub issue number from the previous test, real gh auth, and persistent corpus state across three CLI invocations"
  - test: "Verify the 'triage' and 'quarantine:ready-for-promotion' labels are present on the GitHub repo with the correct colors"
    expected: "gh label list shows: triage (#6F42C1) and quarantine:ready-for-promotion (#FFA500)"
    why_human: "Label existence on external GitHub repo cannot be verified without network access — already noted as MANUAL in the code review table; this was confirmed by the developer during Plan 00 Task 3 execution"
---

# Phase 35: Rich Issue Filer + Quarantine Corpus — Verification Report

**Phase Goal:** Confirmed triaged findings are filed as richly-structured GitHub issues with reproducer, verifier detail, LLM rationale, and golden diff — all within character budgets — and are simultaneously appended to `test-cases-quarantine.js` for downstream CI coverage
**Verified:** 2026-05-27T17:35:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | `lib/issue-payload-builder.js` assembles body with all four sections within per-section char budgets; fingerprint on line 1 | VERIFIED | `tests/e2e/lib/issue-payload-builder.js` exports `buildIssuePayload` + 4 budget constants; line 167-177 builds body with fp on line 1; 14 Vitest tests pass (54/54 in unit suite including budget Tests 5/6/7/8 and line-1 Tests 2/3) |
| 2 | `--source triage` creates GitHub issue with finding's errorClass as label; mock-gh test confirms label arg | VERIFIED | `scripts/e2e-report-issue.mjs` exports `processTriageReport`, imports `buildIssuePayload`; `--source triage` rejects equals/missing-value (exit 2 confirmed by live CLI check); 8 spawnSync integration tests pass (E1–E8 in `e2e-report-issue-triage.test.js`) including E7 label assertion |
| 3 | Dual-search across v1 and v2 fingerprint formulas; v1-fingerprint dedup confirmed | VERIFIED | `findMatchingIssueDual` (line 306) calls `listOpenWithSearch` twice unconditionally (lines 310–311); Tests B1–B4 pin both searches + v1 dedup; `grep -c "listOpenWithSearch" e2e-report-issue.mjs` = 8 hits |
| 4 | `tests/e2e/test-cases-quarantine.js` exists with schema guard; guard fails on field mismatch | VERIFIED | File is empty-array seed; `tests/unit/test-cases-quarantine-schema.test.js` has 7 tests (all pass); Test 7 confirms negative-path detection via `validateEntry` helper |
| 5 | `quarantine-append.mjs` idempotent upsert produces one entry on double-append; `stable_runs >= 3` auto-labels; `promote-from-quarantine.mjs` moves entry + regenerates baseline | VERIFIED | 15 unit tests (U1–U5, L1–L5, F1–F3, S1–S2) + 8 spawnSync tests (G1–G8) all pass; `promote-from-quarantine.mjs` CI guard, dry-run, D-14 5-step flow with injected spawn mock; 11 unit tests (P1–P8, A1–A3) pass |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `tests/e2e/lib/issue-payload-builder.js` | Pure builder with `buildIssuePayload` + 4 budget constants | VERIFIED | 184 lines; exports `BUDGET_LLM_RATIONALE=800`, `BUDGET_VERIFIER_WINDOW=600`, `BUDGET_GOLDEN_DIFF=400`, `TRUNCATION_SUFFIX`; no node:fs/path/child_process/crypto imports |
| `tests/unit/issue-payload-builder.test.js` | 14 Vitest tests covering ISSUE-01 + ISSUE-04 | VERIFIED | Part of passing 629-test suite |
| `tests/e2e/test-cases-quarantine.js` | Empty seed exporting `TEST_CASES_QUARANTINE = []` | VERIFIED | 5 lines; `TEST_CASES_QUARANTINE.length === 0` confirmed; no test pollution (git diff clean) |
| `tests/unit/test-cases-quarantine-schema.test.js` | Schema-drift guard with 7 tests | VERIFIED | 141 lines; all 7 tests pass including negative-path Test 7 |
| `scripts/e2e-report-issue.mjs` | Extended with `--source triage`, `topOfStackHashFromTriage`, `findMatchingIssueDual`, `filterFindingsForFiling`, `processTriageReport`, `createIssueWithLabels`, `listOpenWithSearch`, `addLabel` | VERIFIED | All 7 exports confirmed at correct line numbers; imports `buildIssuePayload` at line 35; CR-01 fix at lines 362–377 (sanitizeCaseId + ERROR_CLASSES clamp) |
| `tests/unit/e2e-report-issue.test.js` | Extended with A1–A6, B1–B4, C1–C6, D1–D4 (22 new tests) | VERIFIED | 63 tests total pass (includes original Phase 29 regression suite) |
| `tests/e2e/scripts/e2e-report-issue-triage.test.js` | spawnSync CLI integration tests E1–E8 | VERIFIED | 8 tests pass; E7 confirms 3-label arg; E8 confirms HARNESS_ERROR filtered |
| `tests/e2e/fixtures/phase35-triage-report.json` | Fixture with 3 findings (1 CONFIRMED, 1 HARNESS_ERROR, 1 CONFIRMED) | VERIFIED | File exists; exercises 3-finding filter pipeline in test suite |
| `tests/e2e/fixtures/phase35-llm-report.json` | Sibling llm-report with matching iteration_n keys | VERIFIED | File exists |
| `tests/e2e/fixtures/phase35-rerun-report.json` | Sibling rerun-report with replay verdicts | VERIFIED | File exists |
| `scripts/quarantine-append.mjs` | CLI with upsertQuarantineEntry, formatEntry, stringifyCorpus; atomicWriteJson IMPORTED | VERIFIED | 315 lines; `import { atomicWriteJson } from '../tests/e2e/lib/rerun-validator.js'` at line 11; no inline copy; `QUARANTINE_CORPUS_PATH_OVERRIDE` env var for test isolation |
| `tests/unit/quarantine-append.test.js` | 15 unit tests U1–U5, L1–L5, F1–F3, S1–S2 | VERIFIED | 15 tests pass |
| `tests/e2e/scripts/e2e-quarantine-append.test.js` | spawnSync tests G1–G8 | VERIFIED | 8 tests pass; G8 confirms label add at stable_runs===3 |
| `scripts/promote-from-quarantine.mjs` | Human-gated CLI; atomicWriteJson + stringifyCorpus IMPORTED; Pitfall 6 cwd | VERIFIED | 310 lines; imports atomicWriteJson/stringifyCorpus/sanitizeCaseId; `cwd` at line 229 defaults to PROJECT_ROOT; CI guard at lines 129–134 (WR-05 broadened to accept 1/yes/on) |
| `tests/unit/promote-from-quarantine.test.js` | 11 tests P1–P8, A1–A3 | VERIFIED | 11 tests pass |
| `scripts/update-golden.js` | `--case <id>` flag; per-case mutation; missing-id exit 1 | VERIFIED | parseArgs at lines 55–98; per-case path at 121–183; `--case INVALID-ID-99 --confirm` exits 1 |
| `tests/unit/update-golden-case-flag.test.js` | 6 tests covering --case flag | VERIFIED | 6 tests pass including WR-07 stderr-absence guard |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `issue-payload-builder.js` | `e2e-report-issue.mjs` | `import { buildIssuePayload }` | WIRED | Line 35 of e2e-report-issue.mjs: `import { buildIssuePayload } from '../tests/e2e/lib/issue-payload-builder.js'` |
| `processTriageReport` | `ghClient.createIssueWithLabels` | labels array passed verbatim (D-06) | WIRED | Lines 394–397 pass `{...finding, category}` with clamped category and sanitized caseId to buildIssuePayload; labels propagated |
| `findMatchingIssueDual` | `ghClient.listOpenWithSearch` | called exactly twice (Pitfall 3) | WIRED | Lines 310–311 both calls unconditional; Tests B1+D4 pin |
| `quarantine-append.mjs` | `tests/e2e/lib/rerun-validator.js` | `atomicWriteJson` import (D-16) | WIRED | Line 11; no inline copy confirmed |
| `quarantine-append.mjs` | `test-cases-quarantine.js` | dynamic import with cache-busted URL | WIRED | Lines 125–127 of upsertQuarantineEntry |
| `quarantine-append.mjs (stable_runs >= 3)` | `ghClient.addLabel` | label = 'quarantine:ready-for-promotion' | WIRED | Lines 161–164; Tests L2+G8 pin |
| `promote-from-quarantine.mjs` | `scripts/update-golden.js` | spawnSync with `['--case', id, '--confirm']` + cwd: PROJECT_ROOT | WIRED | Line 229; Test P2 asserts cwd argument |
| `promote-from-quarantine.mjs` | `tests/test-cases.js` | `appendToGoldenCorpus` pure helper | WIRED | Lines 83–108; Test P2 re-imports golden to confirm new entry |
| `promote-from-quarantine.mjs` | `test-cases-quarantine.js` | atomicWriteJson + stringifyCorpus | WIRED | Lines 224–225; test confirms entry removed |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `issue-payload-builder.js` | `triageFinding.rationale`, `iteration.verifier_verdict.reason`, `goldenCitation` | injected by CLI caller (`processTriageReport`) from parsed JSON files | Yes — test E7 confirms real mock-gh transcript label args when fed fixture JSON | FLOWING |
| `test-cases-quarantine.js` | `TEST_CASES_QUARANTINE` | written by `upsertQuarantineEntry` via `atomicWriteJson` | Yes — Tests U1–U4 confirm round-trip dynamic re-import sees correct values | FLOWING |
| `scripts/update-golden.js` (per-case) | `baseline[id]` | `matchAndCite(selectedText, positionMap)` from real fixture JSON | Yes — Test 5 confirms all TEST_CASES ids in resulting baseline.json | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `update-golden.js --case INVALID-ID-99 --confirm` exits 1 with clear error | `node scripts/update-golden.js --case INVALID-ID-99 --confirm; echo $?` | exit=1, stderr names the failing regex | PASS |
| `promote-from-quarantine.mjs --id INVALID` exits 1 (sanitizeCaseId rejection) | `node scripts/promote-from-quarantine.mjs --id INVALID 2>&1; echo "exit=$?"` | exit=1, stderr: `invalid --id: sanitizeCaseId: id "INVALID" failed validation regex` | PASS |
| `promote-from-quarantine.mjs --id ... --confirm` in CI exits 1 | `CI=true node scripts/promote-from-quarantine.mjs --id US11427642-spec-short-1 --confirm 2>&1; echo "exit=$?"` | exit=1, stderr: `promotion is local-only; refusing to run in CI` | PASS |
| `e2e-report-issue.mjs --source=triage` exits 2 | `node scripts/e2e-report-issue.mjs --source=triage 2>&1; echo "exit=$?"` | exit=2, stderr: `equals syntax not supported for --source` | PASS |
| `e2e-report-issue.mjs --source triage` (no --triage-report) exits 2 | `node scripts/e2e-report-issue.mjs --source triage 2>&1; echo "exit=$?"` | exit=2, stderr: `--source triage requires --triage-report <path>` | PASS |
| `test:src` suite passes 629 tests | `npm run test:src 2>&1 \| tail -3` | 39 test files, 629 tests passed | PASS |
| `lint` exits 0 (2 pre-existing warnings, 0 errors) | `npm run lint 2>&1 \| tail -3` | 0 errors, 2 warnings (pre-existing in settings.js) | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| ISSUE-01 | 35-01-PLAN.md | `lib/issue-payload-builder.js` assembles issue body with reproducer, verifier detail, LLM rationale, golden diff | SATISFIED | File exists at `tests/e2e/lib/issue-payload-builder.js`; 14 Vitest tests cover all sections and section ordering |
| ISSUE-02 | 35-03-PLAN.md | `e2e-report-issue.mjs` accepts `--source triage`; errorClass applied as GitHub label | SATISFIED | `--source triage` path implemented; 8 spawnSync integration tests pass; E7 confirms 3-label argv in mock-gh transcript |
| ISSUE-03 | 35-03-PLAN.md | Dual-search across v1 and v2 fingerprint formulas; no retroactive dedup breakage | SATISFIED | `findMatchingIssueDual` at line 306; both searches unconditional; Tests B1–B4 cover dedup logic |
| ISSUE-04 | 35-01-PLAN.md | Per-section char budgets: rationale ≤800, verifier windows ≤600, golden diff ≤400; fingerprint on line 1 | SATISFIED | Budget constants exported; `truncate()` enforces budgets; Tests 5/6/7/8 pin all three budgets; Test 2/3 pin line-1 placement |
| QUAR-01 | 35-02-PLAN.md | `tests/e2e/test-cases-quarantine.js` with schema-guard test in `test:src` | SATISFIED | Empty seed committed; 7-test schema guard passes including negative-path Test 7 |
| QUAR-02 | 35-04-PLAN.md | `scripts/quarantine-append.mjs` idempotent upsert | SATISFIED | 15 unit tests + 8 spawnSync tests pass; idempotency (U2/U3), auto-label (L2/G8), fixed key order (F1/F2) all verified |
| QUAR-05 | 35-00-PLAN.md + 35-05-PLAN.md | `scripts/promote-from-quarantine.mjs` human-gated; `update-golden.js --case` flag; per-case baseline regen | SATISFIED | `update-golden.js` --case flag implemented; 6 Vitest tests pass; `promote-from-quarantine.mjs` 11 unit tests pass (CI guard, dry-run, 5-step flow, rollback); spawnSync cwd: PROJECT_ROOT (Pitfall 6 pinned by P2) |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | — | All review fixes CR-01 + WR-01..WR-08 were applied by commit 2026-05-27 | — | 9/9 findings resolved; 0 blockers remaining |

**Pre-existing lint warnings (not introduced by Phase 35):**
- `tests/e2e/lib/settings.js:104` — `eslint-disable no-await-in-loop` directive with no reported problems (2 warnings, 0 errors)

**CR-01 (Critical — FIXED):** `processTriageReport` in `e2e-report-issue.mjs` now calls `sanitizeCaseId(rawCaseId)` at line 362 and clamps `finding.category` to `ERROR_CLASSES` at line 375 before any string interpolation. Shell injection defense verified by grep: `grep -c "sanitizeCaseId" scripts/e2e-report-issue.mjs` = 9, `grep -c "ERROR_CLASSES.includes" scripts/e2e-report-issue.mjs` = 1.

**D-16 compliance (atomicWriteJson import-only):** Both `quarantine-append.mjs` and `promote-from-quarantine.mjs` import `atomicWriteJson` from `../tests/e2e/lib/rerun-validator.js`; `grep -n "^export function atomicWriteJson"` returns 0 hits in both files.

### Human Verification Required

### 1. End-to-end Issue Filing with Real triage-report.json

**Test:** Run `node scripts/e2e-report-issue.mjs --source triage --triage-report tests/e2e/artifacts/<runId>/triage-report.json` against a real artifact from a nightly run (or a manually crafted one with at least one CONFIRMED WRONG_CITATION finding).
**Expected:** A GitHub issue is created with: (a) body line 1 matching `<!-- fp: [a-f0-9]{12} -->`; (b) all four sections present (`### Reproducer`, `### Verifier Disagreement`, `### LLM Rationale`, `### Golden Diff`); (c) LLM rationale content inside a fenced code block; (d) issue labels include the finding's category, `e2e-nightly`, and `triage` in the GitHub UI.
**Why human:** Requires network access to GitHub, `gh auth status` authenticated session, and a real triage artifact. Mock-gh tests confirm the mechanism is wired but cannot confirm actual GitHub API behavior.

### 2. Quarantine auto-label after 3 runs

**Test:** Run `scripts/quarantine-append.mjs --input <triage-report>` three times sequentially with the same CONFIRMED finding. After the third run, run `gh issue view <n>` on the source triage issue.
**Expected:** `gh issue view` shows label `quarantine:ready-for-promotion` on the issue; `tests/e2e/test-cases-quarantine.js` has one entry for the case id with `stable_runs: 3`.
**Why human:** Requires persistent corpus state across three CLI invocations, a real GitHub issue number (from test 1 above), and live GitHub API access to verify the label was added.

### 3. GitHub label existence on repo

**Test:** Run `gh label list | grep -E 'triage|quarantine:ready-for-promotion'`.
**Expected:** Both labels appear with correct colors (#6F42C1 and #FFA500).
**Why human:** Already confirmed by developer during Plan 00 Task 3 execution (REVIEW.md table: "GitHub labels created — ✅ MANUAL"). This item verifies the external repo state has not changed since.

### Gaps Summary

No automated gaps. All 5 roadmap success criteria verified through code inspection and test execution:
- 629 Vitest tests pass (0 regressions)
- lint exits 0 (2 pre-existing warnings, 0 new errors)
- All 9 code review findings (1 Critical + 8 Warnings) confirmed fixed
- Phase 35 artifacts exist, are substantive, are wired, and data flows through them in test-confirmed paths
- GitHub labels confirmed present by developer during execution (REVIEW.md MANUAL gate)

The 3 human verification items require live GitHub API access and real artifact inputs — they cannot be falsified by automated means but the underlying mechanism is fully verified by the test suite.

---

_Verified: 2026-05-27T17:35:00Z_
_Verifier: Claude (gsd-verifier)_

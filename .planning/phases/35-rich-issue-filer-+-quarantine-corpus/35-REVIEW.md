---
phase: 35-rich-issue-filer-+-quarantine-corpus
reviewed: 2026-05-27
depth: standard
files_reviewed: 17
critical_count: 1
warning_count: 8
info_count: 4
status: issues_found
fixed_at: 2026-05-27
fixed_count: 9
fix_gate: pass
---

# Phase 35 Code Review

## Summary

Phase 35 adds three new CLIs (`quarantine-append.mjs`, `promote-from-quarantine.mjs`) plus a pure builder (`issue-payload-builder.js`) and extends `e2e-report-issue.mjs` with `--source triage`. The 14 listed CONTEXT.md invariants are substantively honored — but one critical security regression bypasses Phase 29's hardened input validation, plus several robustness/test-isolation defects worth addressing.

## Findings

### Critical (1)

**CR-01 (BLOCKER): Shell command injection via unsanitized `caseId`/`category` in `--source triage` path**

- **File:** `scripts/e2e-report-issue.mjs:354–377` + `tests/e2e/lib/issue-payload-builder.js:104, 115`
- In `processTriageReport`, `caseId` is read from `iter.case_id ?? iter.llm_selection?.patentId ?? 'UNKNOWN'` (line 354) WITHOUT calling `sanitizeCaseId()`. It flows into `buildIssuePayload`'s title template `[e2e-nightly] ${caseId}: ${category}` (builder line 115) then into `ghClient.createIssueWithLabels(title, body, labels)` → `execSync(\`gh issue create --title "${escapedTitle}" ${labelArgs} --body-file -\`)`.
- `escapedTitle` only escapes `"` (line 474); backticks and `$(...)` are NOT escaped. Inside double quotes the shell still performs command substitution.
- Phase 29's regression path is safe because `processReport` calls `sanitizeCaseId(caseEntry.id)` at line 409 (regex `/^[A-Z]{2,}\d+[A-Z]?\d*-[a-z0-9-]+$|^PRE-FLIGHT-[A-Z-]+$/`). Phase 35's triage path silently dropped this control.
- `category` is also unsanitized and unclamped to `ERROR_CLASSES`.

**Fix:** Add `sanitizeCaseId` call + `ERROR_CLASSES.includes(...)` clamp in `processTriageReport` before any string interpolation. Add negative-case Vitest test mirroring existing shell-metachar tests.

### Warnings (8)

**WR-01:** `iter.category` access at `scripts/quarantine-append.mjs:258` is dead code — llm-report iteration schema has `classification`, not `category`. Fall-through to `iter.classification` writes ERROR_CLASS values like `'WRONG_CITATION'` into the quarantine corpus's `category` field, which Phase 36 Playwright wiring won't recognize. Fix: drop the dead lookup; clamp to known test categories or accept `finding.category` as the single source.

**WR-02:** `tests/e2e/scripts/e2e-report-issue-triage.test.js:56` uses `fs.mkdtempSync(path.join(FIXTURE_DIR, 'phase35-run-'))` which creates temp dirs INSIDE the committed `tests/e2e/fixtures/` directory. If `afterEach` is skipped (crash/SIGKILL), `phase35-run-XXXXXX/` directories leak into the working tree. Fix: use `tests/e2e/artifacts/` (already gitignored) like `e2e-quarantine-append.test.js:41–42` does.

**WR-03:** `package.json:17` `lint` script omits the Phase 35 scripts. `scripts/e2e-report-issue.mjs`, `scripts/quarantine-append.mjs`, `scripts/promote-from-quarantine.mjs`, `scripts/update-golden.js` receive no static analysis. Fix: extend the lint glob to cover all Phase 35 scripts.

**WR-04:** `parseArgs` flag-value collision — `--input --help` silently swallows the next flag in all three new CLIs (quarantine-append.mjs, promote-from-quarantine.mjs, e2e-report-issue.mjs --source). Unlike `update-golden.js:68` which has `|| next.startsWith('--')`, the new parsers accept any non-empty token. Fix: add the `startsWith('--')` guard everywhere.

**WR-05:** CI guard regex too narrow at `scripts/promote-from-quarantine.mjs:114, 222` — only matches `CI === 'true'` exactly. Misses `CI=1`, `CI=True`, `CI=yes`. Fix: lowercase + check against `['true', '1', 'yes', 'on']`.

**WR-06:** `promote-from-quarantine.mjs:188–195` step 3 uses `fs.writeFileSync(goldenPath, newGolden)` instead of the imported `atomicWriteJson`. A SIGKILL mid-write leaves `tests/test-cases.js` partially-written (broken JS, breaks every subsequent `vitest run`). Step 4 correctly uses `atomicWriteJson`. Fix: use `atomicWriteJson` for step 3 too.

**WR-07:** `appendToGoldenCorpus` at `scripts/promote-from-quarantine.mjs:93–95` silently returns input unchanged if `\n];` close-marker missing. If the golden corpus is malformed (e.g., partial-write from WR-06, mid-edit), the function returns the same content; runPromote then proceeds to remove the quarantine entry (step 4) and call update-golden.js — leaving the user in an irrecoverable state. Fix: throw an error instead of returning unchanged content; outer try/catch handles it before step 4 mutation.

**WR-08:** Test P5 at `tests/unit/promote-from-quarantine.test.js:218–240` documents partial-state failure as accepted behavior — corpora ARE mutated up to step 4 when step 5 fails. This enshrines a real correctness defect: golden has the entry but its baseline doesn't reflect it; quarantine removed it. Fix: capture pre-write content; best-effort rollback in the catch block; rewrite P5 to assert byte-identical post-failure state.

### Info (4)

**IN-01:** `iter.classification` fallback in `quarantine-append.mjs:258` writes ERROR_CLASS values (`'LLM_RESPONSE_PARSE_ERROR'`) into corpus `category` field. Covered by WR-01.

**IN-02:** `addLabel` re-fires at every upsert from `stable_runs >= 3` onward (Test L3 enforces this). Adds GitHub API rate-limit pressure. Consider tracking prior stable_runs to fire only on the crossover.

**IN-03:** Schema-guard `ID_REGEX` at `tests/unit/test-cases-quarantine-schema.test.js:24` is stricter than `sanitizeCaseId` (excludes `PRE-FLIGHT-*` alternative). Document the intentional asymmetry or relax the schema regex.

**IN-04:** `iter.llm_selection?.patentId` fallback in `e2e-report-issue.mjs:354` and `quarantine-append.mjs:230` yields ids like `'US11427642'` (no suffix) that won't match `sanitizeCaseId`'s regex once CR-01 is fixed. Decide whether to drop the fallback or accept that these iterations get silently skipped.

## Verification Outcomes

| Invariant | Status | Evidence |
|-----------|--------|----------|
| 1. D-02 fingerprint on line 1 | ✅ | builder.js:167–168; Tests 2+3 |
| 2. D-03 budgets ≤800/≤600/≤400 | ✅ | builder.js:129/146/158; Tests 5/6/7/8 |
| 3. D-07 dual-search unconditional | ✅ | findMatchingIssueDual line 309–310; Tests B1+D4 |
| 4. Pitfall 8 AND-exclude filter | ✅ | filterFindingsForFiling line 192; Tests C3+C4 |
| 5. D-11 idempotent upsert + added_iso preserved | ✅ | upsertQuarantineEntry 135–139; Tests U2+U3 |
| 6. Pitfall 4 deterministic stringifier | ✅ | formatEntry fixed key array 79–88; Test F1 |
| 7. D-12 auto-label at stable_runs ≥ 3 | ✅ | line 160; Test L2 |
| 8. D-13 dry-run + CI guard | ✅ | lines 158–175, 114–117, 222–227; Tests P1+P7+P8 |
| 9. Pitfall 6 spawnSync cwd PROJECT_ROOT | ✅ | line 199; Test P2 cwd assertion |
| 10. D-16 atomicWriteJson IMPORT-REUSE | ✅ | quarantine-append.mjs:11 + promote-from-quarantine.mjs:12 |
| 11. --case flag + missing-id error | ✅ | update-golden.js:135–140; Test 4 |
| 12. Path traversal bounded | ✅ | quarantine-append.mjs:181–191; e2e-report-issue.mjs:597–607; G3+E5 |
| 13. Schema-guard QUAR-01 | ✅ | Test 7 negative drift |
| 14. GitHub labels created | ✅ (MANUAL) | Plan 35-00 Task 3 confirmed via `gh label list` |
| Triage path caseId/category sanitized | ❌ | **CR-01** — neither sanitized before shell interpolation |

---

## Fixes Applied (2026-05-27)

All 1 Critical + 8 Warnings addressed. Post-fix gate (`npm run test:src && npm run lint`) exits 0; 629 tests pass, 0 errors / 2 pre-existing lint warnings (unrelated, in `tests/e2e/lib/settings.js`).

| Finding | Commit  | Summary |
|---------|---------|---------|
| CR-01   | f897da9 | sanitize caseId + clamp category in --source triage (shell injection defense) — adds 4 negative-case Vitest tests |
| WR-01   | 1e394b7 | drop dead `iter.category`; use `finding.category ?? 'UNCLASSIFIED'` (also closes IN-01) |
| WR-02   | 73587c5 | move triage-test tmpDir into gitignored `tests/e2e/artifacts/` root |
| WR-03   | 4f302de | extend npm `lint` scope to all Phase 35 scripts |
| WR-04   | fdbbd23 | strict `--flag-value` guard — reject next token starting with `--` in 3 CLIs |
| WR-05   | 02e5a14 | broaden CI guard regex — accept `CI=true|1|yes|on` (case-insensitive) |
| WR-06   | 11c5bad | use `atomicWriteJson` for golden corpus step 3 write |
| WR-07   | cef1b66 | throw on missing `\n];` close-marker (prevents silent quarantine loss) |
| WR-08   | 51c3555 | best-effort rollback on promotion failure; P5 asserts byte-identical state |

**Info findings (IN-01..04):** IN-01 closed by WR-01. IN-02..IN-04 left open per scope (operational refinements, not correctness defects).

---

*Reviewed: 2026-05-27*
*Depth: standard*
*Fixed: 2026-05-27*

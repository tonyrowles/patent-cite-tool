---
phase: 58-promote-outcome-ledger-entry
verified: 2026-06-05T18:01:00Z
status: passed
score: 11/11 must-haves verified
overrides_applied: 0
notes:
  - "DEVIATION CONCERN (acknowledged, passed as defense-in-depth): scripts/auto-fix-promote.mjs uses `args.model || 'claude-sonnet-4-6'` soft-default at both outcome-entry insertion points (lines 498, 518). Production CI flow uses the workflow's hard-fail (verified — `exit 1` present in all three pre-resolution steps; PHASE-58-Y10 pins this), so the soft-default cannot trigger end-to-end. A manual CLI invocation without --model could attribute an opus run to sonnet, but the manual path does not write to the committed origin/main ledger (no `_skipCiGuard` widening; no git push). Plan 01 SUMMARY explicitly documented this as deliberate backward-compat. Three-layer pin (parseArgv PA4/PA5 + entry shape O1/O2 + workflow YAML PHASE-58-Y6/Y9/Y10) prevents silent regression of the contractual end-to-end path. Acceptable defense-in-depth."
roadmap_success_criteria_verified:
  - "SC1: success entry shape — VERIFIED (single appendLedgerEntry block with source:'auto-fix-promoted' + outcome:'pass' + fingerprint + issueId + prNumber)"
  - "SC2: failure entry shape — VERIFIED (single appendLedgerEntry block with source:'auto-fix-failed' + outcome:'fail' + reason + fingerprint + issueId + prNumber)"
  - "SC3: assertTripleGate body byte-unchanged — VERIFIED (sha256 5311c1d5364b1b8558d44029432bfb0d5164c19fcc38b9b2d6fcd539c2e0c40f matches BASELINE)"
  - "SC4: IMPORTS POLICY assertion passes — VERIFIED (IP1 + IP2 in Vitest, both green)"
---

# Phase 58: Promote Outcome Ledger Entry — Verification Report

**Phase Goal:** Promotion success and failure events are durably recorded in the ledger as event-sourced entries (with errorClass + model so a-b-winner's isAttributable accepts them); `a-b-winner.mjs` can exit abstention automatically (per-arm — both sonnet AND opus) once entries accumulate without any code edit.

**Verified:** 2026-06-05T18:01:00Z
**Status:** passed
**Re-verification:** No — initial verification
**Baseline:** PHASE_58_BASELINE=`2cf67363f611ccb3bb5eb54ce20a392e76072db0`

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| - | ----- | ------ | -------- |
| T1 | Outcome ledger writes appear in scripts/auto-fix-promote.mjs at success + failure paths only (count == 2) | VERIFIED | `grep -c 'appendLedgerEntry(LEDGER_PATH' scripts/auto-fix-promote.mjs` = 2 (matches LOAD-BEARING invariant #1) |
| T2 | Both entries include errorClass + fingerprint + issueId + prNumber + model | VERIFIED | Source lines 498-530 (failure) and 516-530 (success); fields confirmed by grep + Vitest O1/O2 structural tests |
| T3 | Success entry has source:'auto-fix-promoted' + outcome:'pass' | VERIFIED | `grep -c "source: 'auto-fix-promoted'"` = 1; `grep -c "outcome: 'pass'"` = 1 |
| T4 | Failure entry has source:'auto-fix-failed' + outcome:'fail' + reason | VERIFIED | `grep -c "source: 'auto-fix-failed'"` = 1; `grep -c "outcome: 'fail'"` = 1; reason at line 510 with .slice(0,200) defensive truncation |
| T5 | No hardcoded `model: 'claude-sonnet-4-6'` literal at entry writes | VERIFIED | `grep -c "model: 'claude-sonnet-4-6'"` = 0 (matches LOAD-BEARING invariant #3) |
| T6 | assertTripleGate body byte-unchanged vs Phase 53 baseline | VERIFIED | Body sha256 = `5311c1d5364b1b8558d44029432bfb0d5164c19fcc38b9b2d6fcd539c2e0c40f` (matches LOAD-BEARING invariant #4) |
| T7 | _skipCiGuard:true non-comment count remains 1 (trust invariant) | VERIFIED | Count = 1 (matches LOAD-BEARING invariant #2 and BASELINE) |
| T8 | Workflow pre-resolves fingerprint + errorClass + model with hard-fail on missing | VERIFIED | All 3 pre-resolve steps present (lines 180, 202, 229); each step has `exit 1` after `::error::` (3 hard-fail clauses confirmed) |
| T9 | argv flags --fingerprint, --error-class, --model wired in workflow → script | VERIFIED | Workflow grep count for `--(fingerprint\|error-class\|model)` = 4 (LOAD-BEARING invariant #8); script KNOWN_FLAGS has all three at line 285; switch cases at 353-355 |
| T10 | LOAD-BEARING anti-features preserved: v40-auto-fix.yml + scripts/auto-fix.mjs + tests/e2e/lib/llm-ledger.js byte-unchanged | VERIFIED | `git diff 2cf67363 HEAD --` = 0 lines for all three (LOAD-BEARING invariants #5, #6, #7) |
| T11 | All Vitest tests pass (67 total: 35 promote-gate + 32 YAML contract) | VERIFIED | `CI=true npx vitest run` exits 0; 35/35 + 32/32 green |

**Score:** 11/11 truths VERIFIED

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `scripts/auto-fix-promote.mjs` | New appendLedgerEntry writes + argv extensions + IMPORTS POLICY narrowing | VERIFIED | 165-line delta vs baseline; import at line 67; argv flags at lines 285/353-355; entries at 496-511 (failure) and 516-530 (success) |
| `tests/unit/auto-fix-promote-gate.test.js` | 35 tests, 4 new describe blocks (IMPORTS POLICY, outcome ledger writes, PROMOTE-04 body pin, _skipCiGuard count) | VERIFIED | 10 describe blocks total (6 baseline + 4 new); 35 `it()` cases; all green |
| `.github/workflows/v40-auto-promote.yml` | 3 new pre-resolution steps + 3 new env entries + 3 new argv lines | VERIFIED | Step "Pre-resolve source-issue fingerprint" at line 180; errorClass at 202; model at 229; jq lookup at 240; argv lines 281-283 |
| `tests/e2e/scripts/v40-auto-promote-yaml.test.js` | 10 new tests PHASE-58-Y1..Y10 + new describe block | VERIFIED | 11 PHASE-58-Y matches (1 in describe title + 10 in test names); 32 total tests; all green |
| `.planning/phases/58-promote-outcome-ledger-entry/58-BASELINE.txt` | 6 KEY=VALUE lines with hard-pinned constants | VERIFIED | File exists; 4 hard-pinned values match RESEARCH §3/§5/§9 |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| v40-auto-promote.yml `fp` step | source-issue body marker | `gh issue view --json body` + grep `<!-- fp: [0-9a-f]{12} -->` | WIRED | Lines 192-200; hard-fail on empty |
| v40-auto-promote.yml `ec` step | source-issue labels | shell whitelist of 5 ERROR_CLASSES | WIRED | Lines 213-227; hard-fail on no match |
| v40-auto-promote.yml `ml` step | tests/e2e/.llm-spend-ledger.json upstream `auto-fix-api` entry | jq `--arg fp` + `select(.fingerprint == $fp and .source == "auto-fix-api")` | WIRED | Lines 240-245; hard-fail on no match |
| Workflow `promote` step → script | argv `--fingerprint`, `--error-class`, `--model` | per-case node invocation lines 281-283 | WIRED | Confirmed |
| Script `parseArgv` → entry literal | `args.model`, `args.errorClass`, `args.fingerprint` | Direct property access in main() | WIRED (with caveat) | See deviation note for `args.model` soft-default |
| Vitest IP1/IP2 | scripts/auto-fix-promote.mjs source | `readFileSync` + regex audit of import lines | WIRED | Test file lines 369+ |
| Vitest PHASE-58-Y6/Y9/Y10 | workflow YAML text | `expect(yaml).toMatch(/--model\s+"\$MODEL"/)` + anti-pattern guards | WIRED | All three pass |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| Script outcome entry | `args.model` | Workflow `--model "$MODEL"` (line 283 of YAML) → `parseArgv` → `args.model` | YES (production path) | FLOWING |
| Script outcome entry | `args.fingerprint` | Workflow `--fingerprint "$FINGERPRINT"` → `parseArgv` → `args.fingerprint` | YES | FLOWING |
| Script outcome entry | `args.errorClass` | Workflow `--error-class "$ERROR_CLASS"` → `parseArgv` → `args.errorClass` | YES | FLOWING |
| Workflow `$MODEL` | upstream auto-fix-api ledger entry | jq lookup on tests/e2e/.llm-spend-ledger.json keyed on fingerprint match + source=='auto-fix-api' | YES (validated by jq filter) | FLOWING |
| Workflow `$FINGERPRINT` | source-issue body | `gh issue view --json body` + 12-hex regex | YES | FLOWING |
| Workflow `$ERROR_CLASS` | source-issue labels | filter against 5-class whitelist | YES | FLOWING |

All data flow paths produce real data in production. Defensive null-handling exists at script side (`args.model || 'claude-sonnet-4-6'`) but is unreachable on production CI flow because the workflow hard-fails before invocation if model cannot be resolved.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Vitest enforcement of all PROMOTE-* requirements + trust invariants | `CI=true npx vitest run tests/unit/auto-fix-promote-gate.test.js tests/e2e/scripts/v40-auto-promote-yaml.test.js` | exit 0; 67/67 passed | PASS |
| assertTripleGate body sha256 matches baseline | `awk '/^export function assertTripleGate/{flag=1; count=0} flag{print; count++; if(count==15) exit}' scripts/auto-fix-promote.mjs \| sha256sum` | `5311c1d5364b1b8558d44029432bfb0d5164c19fcc38b9b2d6fcd539c2e0c40f` | PASS |
| `_skipCiGuard:true` non-comment count | `grep -nE '_skipCiGuard:\s*true' scripts/auto-fix-promote.mjs \| grep -vE '^[0-9]+:\s*//' \| wc -l` | 1 | PASS |
| No hardcoded sonnet literal at entry writes | `grep -c "model: 'claude-sonnet-4-6'" scripts/auto-fix-promote.mjs` | 0 | PASS |
| Workflow has all 3 pre-resolve steps with hard-fail | `grep -c 'exit 1' .github/workflows/v40-auto-promote.yml` | 7 (≥3 from new pre-resolve steps) | PASS |
| v40-auto-fix.yml byte-unchanged vs baseline | `git diff 2cf67363 HEAD -- .github/workflows/v40-auto-fix.yml \| wc -l` | 0 | PASS |
| tests/e2e/lib/llm-ledger.js byte-unchanged vs baseline | `git diff 2cf67363 HEAD -- tests/e2e/lib/llm-ledger.js \| wc -l` | 0 | PASS |
| scripts/auto-fix.mjs byte-unchanged vs baseline | `git diff 2cf67363 HEAD -- scripts/auto-fix.mjs \| wc -l` | 0 | PASS |

### Probe Execution

| Probe | Command | Result | Status |
| ----- | ------- | ------ | ------ |
| (none for this phase) | — | — | SKIPPED (no probes declared; not a migration/tooling phase) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| PROMOTE-01 | 58-01 | IMPORTS POLICY narrowed to allow llm-ledger.js + Vitest assertion | SATISFIED | IMPORTS POLICY comment at lines 21-32; Vitest describe `'IMPORTS POLICY (Phase 58 PROMOTE-01)'` at line 369 with IP1+IP2; both pass |
| PROMOTE-02 | 58-01, 58-02 | Success entry `{source:'auto-fix-promoted', outcome:'pass', errorClass, fingerprint, issueId, prNumber, model}` | SATISFIED | Entry block at scripts/auto-fix-promote.mjs:516-530; all 7 contractual fields present; workflow pre-resolution wired |
| PROMOTE-03 | 58-01, 58-02 | Failure entry at line 440 path only, `{source:'auto-fix-failed', outcome:'fail', errorClass, fingerprint, issueId, prNumber, reason, model}` | SATISFIED | Entry block at scripts/auto-fix-promote.mjs:496-511 (inside `if (result.exitCode !== 0)` branch); all 8 fields present; reason truncated to 200 chars; pre-promotion gates (lines 374/404/419/425) verified not to write entries via Vitest O3 |
| PROMOTE-04 | 58-01 | assertTripleGate body BYTE-UNCHANGED — Vitest delta assertion | SATISFIED | Vitest describe at line 457 pins 15-line verbatim string; sha256 confirmed matching baseline |

All four declared requirements SATISFIED. No orphaned requirements (REQUIREMENTS.md maps exactly PROMOTE-01..04 to Phase 58, all covered by plan frontmatter).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| scripts/auto-fix-promote.mjs | 498 | `model: args.model \|\| 'claude-sonnet-4-6'` (soft default) | Info (acknowledged deviation) | If args.model is null/empty at call time, opus runs could be attributed to sonnet. Production CI path is protected by workflow hard-fail (PHASE-58-Y10 pinned). Manual CLI invocation without --model would trigger the soft default but does NOT write to origin/main (no _skipCiGuard widening; no git push from the manual path) |
| scripts/auto-fix-promote.mjs | 518 | Same as line 498 (success-entry path) | Info | Same disposition |

No `TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER` markers in any of the four modified files.

### Deviation Analysis

**[ACKNOWLEDGED — passes as defense-in-depth]** Plan 01 SUMMARY (line 122) documented:
> "Entry literal is now `model: args.model || 'claude-sonnet-4-6'` (backward-compat default when flag absent; opus arm can be selected by Plan 02 workflow wiring)."

The deviation is from the strict REQUIREMENTS.md PROMOTE-02 reading ("hardcoding any single arm would mean the other arm receives zero outcome entries and stays in indefinite abstention"). The deviation has three mitigations that make it acceptable:

1. **Workflow hard-fail before invocation** — `.github/workflows/v40-auto-promote.yml` lines 241-244 hard-fail with `exit 1` when model cannot be resolved from the upstream ledger entry. Vitest PHASE-58-Y10 pins this clause. The production CI path NEVER passes a null/empty model to the script.

2. **Workflow anti-pattern guard** — Vitest PHASE-58-Y9 hard-asserts that neither `MODEL=${MODEL:-claude-sonnet-4-6}` nor `MODEL="claude-sonnet-4-6"` patterns appear in the workflow YAML. Any future PR that silently defaults will trip the assertion.

3. **Manual CLI path does not write to origin/main** — auto-fix-promote.mjs runs only in CI; the upstream auto-fix.mjs Phase 56 `safeAppendLedger` wrapper covers the leak-vector for the other entry-writing path; the local-write of an outcome entry on a manual run does NOT propagate to the committed ledger because no commit/push is triggered from auto-fix-promote.mjs's call path.

**Net effect:** The end-to-end contractual path (workflow → script → committed ledger) does correctly produce per-arm attribution. The soft-default is a no-op in production. Phase goal is achieved.

### Human Verification Required

None. All verification is automated:
- Vitest enforces all four PROMOTE-* requirements + the _skipCiGuard trust invariant + the IMPORTS POLICY narrowing
- sha256 cross-check confirms assertTripleGate body byte-unchanged
- git diff confirms LOAD-BEARING anti-features (v40-auto-fix.yml, llm-ledger.js, auto-fix.mjs) byte-unchanged
- Workflow YAML contract test (PHASE-58-Y1..Y10) pins all three pre-resolution steps + argv plumbing + anti-pattern guards

### LOAD-BEARING Invariants Re-Verification (orchestrator pre-flight cross-check)

| # | Invariant | Required | Actual | Status |
| - | --------- | -------- | ------ | ------ |
| 1 | `grep -c 'appendLedgerEntry(LEDGER_PATH' scripts/auto-fix-promote.mjs` | 2 | 2 | VERIFIED |
| 2 | Non-comment `_skipCiGuard:\s*true` count | 1 | 1 | VERIFIED |
| 3 | `grep -c "model: 'claude-sonnet-4-6'" scripts/auto-fix-promote.mjs` (hardcoded literal) | 0 | 0 | VERIFIED |
| 4 | assertTripleGate body sha256 | `5311c1d5364b1b8558d44029432bfb0d5164c19fcc38b9b2d6fcd539c2e0c40f` | `5311c1d5364b1b8558d44029432bfb0d5164c19fcc38b9b2d6fcd539c2e0c40f` | VERIFIED |
| 5 | `git diff 2cf67363 HEAD -- .github/workflows/v40-auto-fix.yml \| wc -l` | 0 | 0 | VERIFIED |
| 6 | `git diff 2cf67363 HEAD -- tests/e2e/lib/llm-ledger.js \| wc -l` | 0 | 0 | VERIFIED |
| 7 | `git diff 2cf67363 HEAD -- scripts/auto-fix.mjs \| wc -l` | 0 | 0 | VERIFIED |
| 8 | `grep -c -E '\-\-(fingerprint\|error-class\|model)' .github/workflows/v40-auto-promote.yml` | 4 | 4 | VERIFIED |
| 9 | `CI=true npx vitest run tests/unit/auto-fix-promote-gate.test.js tests/e2e/scripts/v40-auto-promote-yaml.test.js` | exit 0 | exit 0 (67/67 passed) | VERIFIED |
| 10 | Workflow hard-fails on missing model (`exit 1` present in each pre-resolution step) | YES | YES (3 pre-resolution steps × 1 `exit 1` each + main step has 4 more total = 7) | VERIFIED |
| 11 | DEVIATION CONCERN — soft-default acceptable defense-in-depth | acceptable | confirmed via 3 mitigations (see Deviation Analysis) | PASSED (acknowledged) |

All 10 hard-pinned invariants VERIFIED matching pre-flight expectations. Invariant 11 (the DEVIATION CONCERN) is resolved as PASSED-with-acknowledged-deviation per the prompt's third option.

### Roadmap Success Criteria Cross-Check

| # | Success Criterion (from ROADMAP.md) | Evidence | Status |
| - | ----------------------------------- | -------- | ------ |
| SC1 | Success entry `{source:'auto-fix-promoted', outcome:'pass', fingerprint, issueId, prNumber}` written via appendLedgerEntry | scripts/auto-fix-promote.mjs:516-530 + Vitest O1 + IP2 | SATISFIED (with additional contractual fields `model`, `errorClass`, `iso`, `phase`, `transport`, etc. per CONTEXT Decisions A+B) |
| SC2 | Failure entry `{source:'auto-fix-failed', outcome:'fail', fingerprint, issueId, prNumber, reason}` mutually exclusive per event | scripts/auto-fix-promote.mjs:496-511 + Vitest O2 + O3 (count==2 invariant) | SATISFIED (mutual exclusivity proven by O3 — runPromote-non-zero exits early via process.exit(1) before reaching the success block) |
| SC3 | assertTripleGate body byte-unchanged vs Phase 53 baseline; Vitest delta assertion passes | sha256 match + Vitest PROMOTE-04 describe (verbatim 15-line string pin) | SATISFIED |
| SC4 | IMPORTS POLICY assertion passes after llm-ledger.js added to allow-list, SAME commit | IMPORTS POLICY comment at lines 21-32 + Vitest IP1+IP2 in commit f6badc6 (same commit as new code) | SATISFIED |

All 4 ROADMAP success criteria SATISFIED.

### Gaps Summary

**No gaps blocking goal achievement.** The single acknowledged deviation (soft-default `args.model || 'claude-sonnet-4-6'` at entry writes) is mitigated at three layers (workflow hard-fail + workflow anti-pattern Vitest guard + script-only manual-CLI scope) and does not affect the contractual end-to-end CI path that writes to the committed ledger. The phase goal — outcome entries durably recorded with errorClass + model so a-b-winner's isAttributable accepts them per-arm — is achieved.

**Phase 58 LOAD-BEARING anti-features preserved:**
- `.github/workflows/v40-auto-fix.yml` byte-unchanged (Pitfall 1 / COMMIT-04)
- `tests/e2e/lib/llm-ledger.js` byte-unchanged (Phase 56 invariant)
- `scripts/auto-fix.mjs` byte-unchanged (Phase 56 territory)
- `assertTripleGate` body byte-unchanged (Phase 53 trust invariant; sha256 match)
- `_skipCiGuard:\s*true` non-comment count = 1 (Phase 53 trust invariant)
- No hardcoded `model: 'claude-sonnet-4-6'` literal anywhere in the entry writes

**Phase 58 ready for Phase 59 SWEEP-03:** Once outcome entries accumulate per ERROR_CLASS per model arm on origin/main, `a-b-winner.mjs`'s `isAttributable` filter (lines 178-189) will accept them for BOTH sonnet and opus arms without any further code edit.

---

_Verified: 2026-06-05T18:01:00Z_
_Verifier: Claude (gsd-verifier)_

---
phase: 64-heuristic-first-triage-extension
plan: 01
subsystem: triage-classifier
tags: [triage, heuristic, pitfall-2-mitigation, mutator-aware, fault-injection]
requires: [phase-34-triage-classifier, phase-61-mutator-marker, phase-30-fault-injection-spec]
provides: [triage-rule-5-extension-not-loaded, triage-rule-6-google-dom-drift-mutator-aware, triage-rule-7-worker-fallback-failed, fault-injection-status-producer]
affects: [tests/e2e/lib/triage-classifier.js, tests/unit/triage-classifier.test.js, tests/e2e/specs/fault-injection.spec.js]
tech-stack:
  added: []
  patterns: [pure-function-deflector, mutator-aware-detection, graceful-degradation, source-grep-byte-stability-pin]
key-files:
  created:
    - .planning/phases/64-heuristic-first-triage-extension/64-01-SUMMARY.md
    - .planning/phases/64-heuristic-first-triage-extension/deferred-items.md
  modified:
    - tests/e2e/lib/triage-classifier.js
    - tests/unit/triage-classifier.test.js
    - tests/e2e/specs/fault-injection.spec.js
decisions:
  - "D-03 insertion: 3 new rules placed AFTER Rule 3 close (post-line-501) and BEFORE Rule 4 ambiguous fallthrough — pure 'ambiguous-class deflectors'"
  - "Rule 6 mutator-awareness gates on the literal Phase 61 marker /<!-- fp: [0-9a-f]{12} -->/ AND a verbatim Phase 61 DOM-drift selector — real drift escalates to LLM (T-64-05 trust boundary acknowledged)"
  - "Confidence ceiling 0.85 for Rules 5/6/7 per Pitfall 6 (no VERIFIER_STRONG_AGREEMENT gate)"
  - "Rule 7 gracefully degrades when fault_injection_status is absent on legacy iter shape (no-op via optional chaining)"
metrics:
  duration: "~30 minutes"
  completed: "2026-06-09"
  commit: "973ff13"
  files_modified: 3
  tests_added: 15
  tests_total_post_plan: 96
requirements: [TRIAGE-01, TRIAGE-02, TRIAGE-03, TRIAGE-04]
---

# Phase 64 Plan 01: Heuristic-First Triage Extension Summary

Extended `runTriage`'s D-03 rule chain with 3 new heuristic rules (EXTENSION_NOT_LOADED,
GOOGLE_DOM_DRIFT mutator-aware, WORKER_FALLBACK_FAILED), pushing heuristic-resolvable
ERROR_CLASS coverage from 7 to 10 — without weakening the Phase 34 D-02 Pitfall-2
Tier-C-masking guard or the D-11 cluster pre-filter sample-size invariant.

## What Shipped

**`tests/e2e/lib/triage-classifier.js` — 3 new rules inserted between Rule 3 (NOT_REPLAYABLE + specific) and Rule 4 (ambiguous fallthrough):**

- **Rule 5 — EXTENSION_NOT_LOADED (TRIAGE-01).** Fires on `iter.classification === 'EXTENSION_NOT_LOADED'` OR the locked regex `/extension (?:not.*loaded|failed.*attach)/i` matching `iter.error_reason`. Severity `medium`, confidence `0.85`, `triage_confidence: 'heuristic'`.
- **Rule 6 — GOOGLE_DOM_DRIFT mutator-aware (TRIAGE-02).** Fires ONLY when `iter.classification === 'GOOGLE_DOM_DRIFT'` AND `iter.issue_body` contains BOTH the Phase 61 DIAG-01 mutator marker `<!-- fp: [0-9a-f]{12} -->` AND a verbatim Phase 61 DOM-drift selector (`patent-result`, `section[itemprop="claims"]`, `main`, `article`). Real DOM drift (no marker) falls through to LLM cluster pre-filter — does NOT short-circuit. `triage_confidence: 'heuristic_mutator_aware'`.
- **Rule 7 — WORKER_FALLBACK_FAILED (TRIAGE-03).** Fires on `iter.fault_injection_status?.worker_fallback_failed === true` OR `iter.classification === 'WORKER_FALLBACK_FAILED'`. Graceful degradation when `fault_injection_status` is absent on legacy iter shape. `triage_confidence: 'heuristic_fault_injection'`.

**`tests/e2e/specs/fault-injection.spec.js` — producer co-design:** `appendCase` payload additively emits `fault_injection_status: { worker_fallback_failed: caseStatus === 'failed' }` (single new property line, no shape change to existing fields, no new imports).

**`tests/unit/triage-classifier.test.js` — 15 new Vitest cases across 6 new `describe` blocks:**

- `runTriage — Phase 64 EXTENSION_NOT_LOADED heuristic (TRIAGE-01)` — 2 tests (Rule 5a, 5b)
- `runTriage — Phase 64 GOOGLE_DOM_DRIFT mutator-aware heuristic (TRIAGE-02)` — 3 tests (Rule 6a, 6b, 6c)
- `runTriage — Phase 64 WORKER_FALLBACK_FAILED heuristic (TRIAGE-03)` — 3 tests (Rule 7a, 7b, 7c)
- `runTriage — Phase 64 TRIAGE-04 invariants (Pitfall 2 + Pitfall 10)` — 4 tests (T_TIER_C_NO_MASK, T_VSA_BODY_UNCHANGED, T_RULE2_BODY_UNCHANGED, T_NEW_RULES_NO_CONFIRMED_GATE_WITHOUT_VSA)
- `runTriage — Phase 64 cluster pre-filter sample-size invariant (TRIAGE-04)` — 1 test (10 NO_CITATION_PRODUCED → exactly 1 grouped invokeLlm call)
- `runTriage — Phase 64 coverage assertion (7 → 10 heuristic-resolvable classes)` — 2 tests (frozen fixture length-10 + Set-equality across distinct heuristic categories)

## Required Output Records

| Item | Result |
|---|---|
| **Insertion point used** | AFTER line 499 (Rule 3 closing `}`), BEFORE the blank line at original 500. Confirmed via post-edit grep: Rule 5 starts at line 501, Rule 6 at 527, Rule 7 at 553, Rule 4 (existing) now at 580. |
| **Rule 5 starts at (post-edit)** | `tests/e2e/lib/triage-classifier.js:501` |
| **Rule 6 starts at (post-edit)** | `tests/e2e/lib/triage-classifier.js:527` |
| **Rule 7 starts at (post-edit)** | `tests/e2e/lib/triage-classifier.js:553` |
| **Rule 4 (ambiguous) starts at (post-edit)** | `tests/e2e/lib/triage-classifier.js:580` (was line 501 pre-edit) |
| **VERIFIER_STRONG_AGREEMENT line 43-44 body** | BYTE-UNCHANGED — verified by literal-line `node -e` regex match on the multi-line declaration. T_VSA_BODY_UNCHANGED Vitest pin passes. |
| **Rule 2 body byte-stability** | BYTE-UNCHANGED — verified by `node -e` regex anchoring `RULE2_SEVERITY` through Rule 2's trailing `continue;`. T_RULE2_BODY_UNCHANGED Vitest pin passes. |
| **Pre-Phase-64 baseline heuristic-resolvable count** | 7 (FLAKE, WRONG_CITATION, VERIFIER_DISAGREE, LLM_HALLUCINATED_SELECTION, LLM_API_ERROR, HARNESS_ERROR, PASS) |
| **Post-Phase-64 heuristic-resolvable count** | 10 (above 7 + EXTENSION_NOT_LOADED + GOOGLE_DOM_DRIFT + WORKER_FALLBACK_FAILED) |
| **Coverage assertion (frozen HEURISTIC_RESOLVABLE_CLASSES.length)** | 10 ✓ — frozen, Set-equality with distinct heuristic categories passes |
| **Cluster sample-size invariant** | 10 NO_CITATION_PRODUCED ambiguous iters → exactly 1 grouped invokeLlm call (cluster path preserved post-Phase-64). cluster_pass_count === 10, heuristic_count === 0. |
| **Vitest count pre-plan (HEAD~1)** | 81 tests in `tests/unit/triage-classifier.test.js` |
| **Vitest count post-plan (HEAD)** | 96 tests in `tests/unit/triage-classifier.test.js` (+15) |
| **Single commit hash** | `973ff13` — `feat(64): heuristic-first triage extension — 3 new D-03 rules (TRIAGE-01..04)` |
| **Deviation from planned insertion location** | None. Inserted exactly at the documented seam (post-Rule 3 close, pre-Rule 4 ambiguous fallthrough). |

## Verification Gates — Status

| Gate | Status |
|---|---|
| Overall Check 1 — `git diff --numstat tests/e2e/lib/triage-classifier.js` deletions === 0 | ✓ (0 deletions) |
| Overall Check 2 — `triage_confidence:` (non-comment) count === 3 | ✓ (exactly 3) |
| Overall Check 3 — `rerunEntry?.verdict === 'CONFIRMED'` (non-comment) count === 1 | ✓ (exactly 1 — existing Rule 2 only) |
| Overall Check 4 — `npx vitest run tests/unit/triage-classifier.test.js` exit 0 | ✓ (96 passed, 0 failed) |
| Overall Check 5 — `git diff --numstat tests/unit/triage-classifier.test.js` deletions === 0 | ✓ (0 deletions) |
| Overall Check 6 — `git diff tests/e2e/specs/fault-injection.spec.js` shows exactly one new property line | ✓ (single line: `fault_injection_status: { worker_fallback_failed: caseStatus === 'failed' },`) |
| Overall Check 7 — Coverage assertion passes (length 10 + Set-equality) | ✓ |
| Overall Check 8 — Cluster sample-size invariant passes (invokeLlm callCount === 1) | ✓ |
| Overall Check 9 — ESLint clean across all 3 files | ✓ (exit 0; 3 pre-existing unused-eslint-disable warnings on lines 152/185/192 of fault-injection.spec.js — not introduced by this plan) |
| Success Criterion — `git diff scripts/auto-fix-promote.mjs` shows ZERO changes (Pitfall 10) | ✓ (0 lines changed) |

## Threat Model Mitigations Verified

| Threat ID | Mitigation | Status |
|---|---|---|
| T-64-01 (VERIFIER_STRONG_AGREEMENT body tampering) | T_VSA_BODY_UNCHANGED literal-line source-grep pin | ✓ Vitest passes |
| T-64-02 (Rule 2 body tampering) | T_RULE2_BODY_UNCHANGED literal-line source-grep pin | ✓ Vitest passes |
| T-64-03 (Tier C masking via new rule that forgets VSA) | T_TIER_C_NO_MASK + T_NEW_RULES_NO_CONFIRMED_GATE_WITHOUT_VSA source-grep pins | ✓ Vitest passes; exactly 1 CONFIRMED-gated `if`-condition in file |
| T-64-04 (cluster pre-filter call-count regression) | 10 NO_CITATION_PRODUCED → exactly 1 grouped invokeLlm call Vitest pin | ✓ Vitest passes |
| T-64-05 (forgeable mutator marker → real DOM drift heuristically resolved as synthetic) | Accepted per plan threat register; trust boundary acknowledged — Phase 61 mutator marker is emitted by synthetic injection only |
| T-64-06 (`triage_confidence` field exposes mutator-vs-real distinction) | Accepted per plan threat register — intentional stratification for A/B winner / weekly digest queries |

## Deviations from Plan

**None inside Phase 64 scope.** All 3 new rules implemented at the exact insertion seam, both byte-stability invariants preserved verbatim, exactly 1 atomic commit, all required Vitest pins added, ESLint clean, producer co-design applied additively, requirements TRIAGE-01..04 covered.

**Out-of-scope discovery during cross-suite verification:** `npx vitest run` (full suite) reports 4 pre-existing failures in `tests/unit/warning-01-transport-tag.test.js` — `dispatchFlakeState refused outside CI/override` (Phase 56 WR-02 environment gate). Verified pre-existing by `git stash`-revert baseline run (same 4 failures with no Phase 64 code applied). Out of scope for this plan; logged to `.planning/phases/64-heuristic-first-triage-extension/deferred-items.md` with verification evidence and root-cause hypothesis (test setup likely needs `E2E_LEDGER_PATH_OVERRIDE` in `beforeEach`).

## Known Stubs

None. All new rules consume real iter fields (with documented graceful degradation when fields are absent on legacy iter shape).

## Self-Check: PASSED

- ✓ `tests/e2e/lib/triage-classifier.js` exists, contains all 3 new rule blocks, byte-stability invariants intact
- ✓ `tests/unit/triage-classifier.test.js` exists, 96/96 tests pass
- ✓ `tests/e2e/specs/fault-injection.spec.js` exists, `fault_injection_status` additive emission in place
- ✓ Commit `973ff13` exists in git log: `feat(64): heuristic-first triage extension — 3 new D-03 rules (TRIAGE-01..04)`
- ✓ `.planning/phases/64-heuristic-first-triage-extension/64-01-SUMMARY.md` (this file)
- ✓ `.planning/phases/64-heuristic-first-triage-extension/deferred-items.md` documents the pre-existing warning-01 failures

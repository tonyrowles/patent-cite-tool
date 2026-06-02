---
phase: 45
status: passed
verified: 2026-05-31
must_haves_passed: 4/4
re_verification:
  previous_status: none
  previous_score: n/a
  gaps_closed: []
  gaps_remaining: []
  regressions: []
---

# Phase 45 Verification — Per-ERROR_CLASS Expansion + FLAKE 5-State Machine

**Phase Goal:** Scale auto-fix from WRONG_CITATION to 5 classes; introduce 5-state FLAKE classifier to prevent both real-bugs-mis-classified-as-FLAKE and FLAKE-spam loops.

**Verdict:** PASSED — all 4 success criteria verified in codebase; 1055/1056 Vitest pass; the 1 failure (`e2e-weekly-digest.test.js > returns $X.XX / $100 (Y%) format when ledger present`) is pre-existing, documented in `deferred-items.md`, and unrelated to Phase 45 scope.

---

## Success Criteria Verification

### SC #1 — PROMPT_SCAFFOLDS covers 5 ERROR_CLASSes + historical-replay tests — VERIFIED

**Evidence:**
- `tests/e2e/lib/fix-prompt-builder.js:341` — `PROMPT_SCAFFOLDS = Object.freeze({...})` runtime check: `Object.keys(PROMPT_SCAFFOLDS).length === 5`, sorted keys = `[GOOGLE_DOM_DRIFT, HARNESS_ERROR, LLM_HALLUCINATED_SELECTION, WORKER_FALLBACK_FAILED, WRONG_CITATION]`.
- Historical-replay fixtures exist:
  - `tests/unit/fixtures/llm-hallucinated-selection-issue.md`
  - `tests/unit/fixtures/worker-fallback-failed-issue.md`
  - `tests/unit/fixtures/google-dom-drift-issue.md`
  - `tests/unit/fixtures/harness-error-issue.md`
- `tests/unit/fix-prompt-builder.test.js:433` — `describe('Phase 45 PROMPT-03 extension: historical-replay fixtures ...')` iterates all 4 classes and asserts envelope + fingerprint + surface-substring per fixture.
- `buildScaffoldSystemPrompt` helper extracts the 5-section template (trust-boundary + fix-surface + 6-path FORBIDDEN_PATHS + diff-size-cap + output-format); WRONG_CITATION_SYSTEM refactored to consume it (single source of truth for forbidden-paths across all 5 classes).

### SC #2 — `triage-classifier.js` 5-state machine + ring buffer + Vitest transitions — VERIFIED

**Note on design choice (per success criteria note):** `runTriage` (Phase 34 per-iteration verdicts) is intentionally PRESERVED byte-identical. `classifyRerunOutcomes` is appended as a SIBLING export — they consume different signals (per-iteration verdicts vs rolling ring buffer). v3.1 callers preserved. This is the spirit of SC #2.

**Evidence:**
- `tests/e2e/lib/triage-classifier.js:644` — `export function classifyRerunOutcomes(...)` returns `{state, action, until?}` with 5 states + FLAKE_SUPPRESSED informational:
  - Branch 1 (line 657): FLAKE_SUPPRESSED — first check (Pitfall 2 ordering)
  - Branch 2 (line 672): CONFIRMED_BUG — zero pass AND last 3 all fail
  - Branch 3 (line 682): LIKELY_BUG — failures ≥ 7 in last 10
  - Branch 4 (line 687): INTERMITTENT — failures 4-6
  - Branch 5/6 (lines 704-715): FLAKE_ESCALATION (recentFlakes+1 ≥ N) / FLAKE
- `tests/e2e/lib/triage-classifier.js:400` — `runTriage` UNCHANGED (Phase 34 export at same line offset, no diff)
- Ring buffer: `appendRerunOutcome` at line 827 enforces `slice(-RING_BUFFER_SIZE)` rolling 10-element window with atomic POSIX rename via reused `atomicWriteJson`.
- Bootstrap state files committed: `tests/e2e/.rerun-ring-buffer.json` = `{version:1, cases:{}}`, `tests/e2e/.flake-suppression.json` = `{version:1, suppressions:{}}`.
- `tests/unit/triage-classifier.test.js:1583-1668` — T1-T9 cover every state transition + boundary cases T2b/T3b/T4b/T6b + degenerate empty-outcomes + default-args; appendRerunOutcome describe at line 1768.

### SC #3 — N=3 / 14-day FLAKE_ESCALATION + 30-day suppression + static-grep pin — VERIFIED

**Evidence:**
- 4 constants pinned in source (`tests/e2e/lib/triage-classifier.js`):
  - `:619` `export const FLAKE_ESCALATION_N = 3;`
  - `:620` `export const FLAKE_ESCALATION_WINDOW_DAYS = 14;`
  - `:621` `export const FLAKE_SUPPRESSION_DAYS = 30;`
  - `:622` `export const RING_BUFFER_SIZE = 10;`
- Static-grep regex pins in tests (`tests/unit/triage-classifier.test.js:1666-1669`): `expect(src).toMatch(/^export const FLAKE_ESCALATION_N = 3;?$/m)` etc. — any value change requires updating the test in the same commit.
- Runtime value pins (`tests/unit/triage-classifier.test.js:1652-1655`): `expect(FLAKE_ESCALATION_N).toBe(3)` etc.
- FLAKE_ESCALATION fires when `recentFlakes + 1 >= FLAKE_ESCALATION_N` within `FLAKE_ESCALATION_WINDOW_DAYS=14`; suppression `until = now + FLAKE_SUPPRESSION_DAYS=30 days` (line 706).
- `flake-investigation` issue creation: `scripts/auto-fix.mjs:280` — `if (decision.state === 'FLAKE_ESCALATION') { ... gh label create 'flake-investigation' --force ... gh issue create --label 'flake-investigation' ... }` + atomicWriteJson to suppression file.

### SC #4 — `quarantine-append.mjs --escalate-stable-runs-reset 1` wired into auto-fix.mjs FLAKE dispatch — VERIFIED

**Evidence:**
- `scripts/quarantine-append.mjs:62-75` — `--escalate-stable-runs-reset` parser only accepts numeric value `1`; rejects equals syntax, missing value, and any value != 1 (exit 2 with diagnostic stderr).
- `scripts/quarantine-append.mjs:115-126` — mutual exclusion with `--input`; `--case <id>` required.
- `scripts/quarantine-append.mjs:248` — main() branch mutates `existing.stable_runs = 1` then `atomicWriteJson` (preserves added_iso verbatim).
- `scripts/auto-fix.mjs:327-343` — `if ((decision.state === 'FLAKE' || decision.state === 'FLAKE_ESCALATION') && caseId) { execFileSync('node', ['scripts/quarantine-append.mjs', '--escalate-stable-runs-reset', '1', '--case', caseId], ...) }`.
- INTERMITTENT no-op confirmed: no quarantine-append invocation in INTERMITTENT branch (lines 327's guard explicitly excludes INTERMITTENT).
- CWE-94 hygiene: all execFileSync calls use arg ARRAYS (lines 284, 297-307, 329-335).

---

## Required Check Verification

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 1 | Each SC mapped to artifacts | PASS | See SC table above |
| 2 | Vitest passes + only pre-existing flake fails | PASS | 1055/1056 pass; only `e2e-weekly-digest.test.js` failure (pre-existing, in `deferred-items.md`) |
| 3 | PROMPT_SCAFFOLDS has exactly 5 keys | PASS | `Object.keys(PROMPT_SCAFFOLDS).length === 5` runtime confirmed |
| 4 | runTriage UNCHANGED + classifyRerunOutcomes sibling | PASS | Both exports present in `triage-classifier.js` at lines 400 + 644; runTriage signature preserved |
| 5 | 4 grep-pinned constants in source | PASS | Lines 619-622 export each constant on its own line; test file has matching regex pins |
| 6 | FORBIDDEN_PATHS extended to 8 paths | PASS | `check-diff-guard.mjs:49-58` — 8 entries including `.rerun-ring-buffer.json` + `.flake-suppression.json` |
| 7 | auto-fix.mjs FLAKE dispatch invokes quarantine-append | PASS | `auto-fix.mjs:329-335` execFileSync with arg array |
| 8 | --escalate-stable-runs-reset accepts ONLY `1` | PASS | `quarantine-append.mjs:68-73` rejects parsed != 1 |
| 9 | INTERMITTENT no-op on corpus; FLAKE-only resets | PASS | `auto-fix.mjs:327` guard excludes INTERMITTENT from quarantine-append invocation |
| 10 | flake-investigation + 30d suppression on FLAKE_ESCALATION | PASS | `auto-fix.mjs:280-323` — label create, issue create, suppression write |

---

## Anti-Pattern Scan

Files modified in this phase scanned for stubs/TODO/placeholder patterns:

- `tests/e2e/lib/fix-prompt-builder.js` — no TBD/FIXME/XXX/placeholder; all 5 scaffolds substantive (envelope, fix-surface, FORBIDDEN_PATHS, diff-fence, output-format)
- `tests/e2e/lib/triage-classifier.js` — no debt markers; classifyRerunOutcomes branches all have side effects (state + action + until?), no stub returns
- `scripts/auto-fix.mjs` — dispatchFlakeState branches all have real side effects (gh issue create, atomicWriteJson, execFileSync quarantine-append); no console.log-only paths
- `scripts/quarantine-append.mjs` — main() reset branch mutates + atomicWriteJson; no stubs
- `scripts/check-diff-guard.mjs` — 8 regex entries with class-anchored start/end; no placeholders

No 🛑 BLOCKER anti-patterns found.

---

## Requirements Coverage

| Requirement | Phase | Status | Evidence |
|-------------|-------|--------|----------|
| PROMPT-03 | 42→45 (extended) | SATISFIED | 5-key PROMPT_SCAFFOLDS frozen registry |
| FLAKE-01 | 45 | SATISFIED | 5-state classifyRerunOutcomes + 10-element ring buffer |
| FLAKE-02 | 45 | SATISFIED | N=3 / 14d window / 30d suppression / static-grep pins |
| FLAKE-03 | 45 | SATISFIED | --escalate-stable-runs-reset 1 flag wired into auto-fix.mjs FLAKE dispatch |

---

## Deferred to Phase 47

Live FLAKE_ESCALATION end-to-end demo (HUMAN-UAT — "FLAKE escalation verified to suppress re-files") is deferred to Phase 47 CLEANUP-03 per `45-CONTEXT.md` integration-points note. Phase 45 ships all dispatch wiring; Phase 47 exercises it end-to-end.

---

## Conclusion

All 4 success criteria verified against actual codebase artifacts (not SUMMARY claims). 4/4 must-haves passed. Sibling-export design choice for `classifyRerunOutcomes` (preserving `runTriage` byte-identical) is sound and explicitly approved in the verification brief. Pre-existing test failure documented; not introduced by Phase 45.

**Status: passed.**

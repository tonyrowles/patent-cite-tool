---
phase: 67
slug: prompt-iter-loop-shape-a-capture-and-surface-in-process
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-09
---

# Phase 67 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^3.0.0 |
| **Config file** | `vitest.config.js` |
| **Quick run command** | `npx vitest run tests/unit/auto-fix-prompt-iter.test.js tests/unit/fix-prompt-builder.test.js tests/unit/check-diff-guard.test.js` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~15 seconds (quick) / ~45 seconds (full) |

---

## Sampling Rate

- **After every task commit:** Run quick command (3 targeted test files)
- **After every plan wave:** Run full suite (`npm test`)
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 45 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 67-01-01 | 01 | 1 | PITER-01 | — | `buildFixPrompt({rewriteHint})` parameter accepted; round 0 byte-identical to today | unit | `npx vitest run tests/unit/fix-prompt-builder.test.js` | ✅ | ⬜ pending |
| 67-01-02 | 01 | 1 | PITER-01 | — | PROMPT_SCAFFOLDS sha256 byte-stability pin holds (7 hashes at fix-prompt-builder-byte-stability.test.js:23-31) | unit | `npx vitest run tests/unit/fix-prompt-builder-byte-stability.test.js` | ✅ | ⬜ pending |
| 67-01-03 | 01 | 1 | PITER-02 | — | runDispatcher Step 10 iter loop wraps LLM dispatch + Step 11/12/13 outcome processing | unit | `npx vitest run tests/unit/auto-fix-prompt-iter.test.js` | ❌ W0 | ⬜ pending |
| 67-01-04 | 01 | 1 | PITER-03 | — | `iter_round` field flows through ledger entries; `appendLedgerEntry` body byte-unchanged | unit | `npx vitest run tests/unit/auto-fix-prompt-iter.test.js tests/unit/llm-ledger.test.js` | ❌ W0 | ⬜ pending |
| 67-01-05 | 01 | 1 | PITER-04 | — | sdk_error → fast-fail (no iter retry); apply-check-failed + malformed-diff:* → iter retry | unit | `npx vitest run tests/unit/auto-fix-prompt-iter.test.js` | ❌ W0 | ⬜ pending |
| 67-01-06 | 01 | 1 | PITER-05 | — | FORBIDDEN_PATHS rejects `tests/e2e/lib/fix-prompt-builder.js` AND `tests/e2e/lib/llm-router.js` | unit | `npx vitest run tests/unit/check-diff-guard.test.js` | ✅ | ⬜ pending |
| 67-01-07 | 01 | 1 | PITER-03 | — | `T_PROMPT_ITER_BUDGET_01`: after 2 iter-rewrites per fingerprint, next call returns abstention with `errorReason: 'prompt-iter-budget-cap'` | unit | `npx vitest run tests/unit/auto-fix-prompt-iter.test.js -t T_PROMPT_ITER_BUDGET_01` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/auto-fix-prompt-iter.test.js` — NEW file housing PITER-02..05 tests including `T_PROMPT_ITER_BUDGET_01`. Mock pattern reuses `safeAppendLedger` + `invokeAnthropicSdkWithLedger` + `invokeClaudePWithLedger` mocks from existing `tests/unit/auto-fix.test.js`.

*Existing infrastructure: vitest ^3.0.0 already installed; `tests/unit/check-diff-guard.test.js` extended for PITER-05 (additive — 2 new test cases for the new FORBIDDEN_PATHS entries); `tests/unit/fix-prompt-builder.test.js` extended for PITER-01 (additive — `rewriteHint` parameter cases + round-0-byte-identity test).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live iter-loop end-to-end (`apply-check-failed` → iter retry → success) | PITER-02 | Requires real LLM dispatch on origin/main; mirrors Phase 61 UAT-01 live runbook pattern | Deferred to v4.4 follow-up sweep; Phase 68 final UAT tally will note prompt-iter ledger entry presence as an observable proxy |

*All Phase 67 trust invariants have automated verification via Vitest.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (`tests/unit/auto-fix-prompt-iter.test.js`)
- [ ] No watch-mode flags
- [ ] Feedback latency < 45s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

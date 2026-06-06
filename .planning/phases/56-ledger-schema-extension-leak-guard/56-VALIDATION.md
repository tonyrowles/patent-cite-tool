---
phase: 56
slug: ledger-schema-extension-leak-guard
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-04
---

# Phase 56 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.x (`devDependencies.vitest: ^3.0.0`) |
| **Config file** | `vitest.config.js` |
| **Quick run command** | `CI=true npx vitest run tests/unit/auto-fix.test.js tests/unit/llm-ledger.test.js` |
| **Full suite command** | `npm test` (chains: build + test:src + test:chrome + test:firefox + lint + test:lint) |
| **Estimated runtime** | ~30s quick / ~90s full |

---

## Sampling Rate

- **After every task commit:** Run `CI=true npx vitest run tests/unit/auto-fix.test.js tests/unit/llm-ledger.test.js`
- **After every plan wave:** Run `npm run test:src` (full Vitest run across all unit suites)
- **Before `/gsd:verify-work`:** `npm test` must be green
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 56-01-W0 | 01 | 0 | (Wave 0 inspection) | — | N/A — verifies a research assumption | inspect | `grep -nE 'process.env.CI' tests/setup/chrome-stub.js \|\| echo "OK: CI not touched"` | ✅ | ⬜ pending |
| 56-01-01 | 01 | 1 | LEDGER-02 | T-56-02 (cap bypass) | `safeAppendLedger({...})` throws unless `CI \|\| E2E_LEDGER_PATH_OVERRIDE` is set | source assertion | `grep -c 'function safeAppendLedger' scripts/auto-fix.mjs` returns 1 | ✅ (will exist after task) | ⬜ pending |
| 56-01-02 | 01 | 1 | LEDGER-01, LEDGER-02 | T-56-04 (partial-wiring) | All 7 call sites carry `errorClass` and route through `safeAppendLedger` | source assertion | `grep -c 'safeAppendLedger({' scripts/auto-fix.mjs` = 7 AND `grep -c 'appendLedgerEntry(LEDGER_PATH' scripts/auto-fix.mjs` = 1 (inside wrapper body only) AND `grep -c 'errorClass' scripts/auto-fix.mjs` ≥ 7 | ✅ | ⬜ pending |
| 56-01-03 | 01 | 1 | LEDGER-04 | T-56-04 (partial-wiring) | Mocked `runDispatcher()` invocation emits a ledger entry carrying `errorClass` | unit (vitest, mocked) | `CI=true npx vitest run tests/unit/auto-fix.test.js -t 'LEDGER-04'` exits 0 | ❌ W0 (new test block) | ⬜ pending |
| 56-02-01 | 02 | 1 | LEDGER-03 | T-56-03 (operational DoS) | Test 48 accepts `≥1` bootstrap entry instead of `exactly 1` | unit (vitest) | `CI=true npx vitest run tests/unit/llm-ledger.test.js -t 'Test 48'` exits 0 | ✅ (test exists, body rewritten in place) | ⬜ pending |
| 56-VG-01 | verify | gate | All 4 LEDGER-* + appendLedgerEntry body invariant | T-56-04 + Pitfall 7 | All 56+ existing llm-ledger tests still green; all 20+ existing auto-fix tests still green; `appendLedgerEntry` body unchanged | regression | `npm test` exits 0 AND `git diff HEAD~N -- tests/e2e/lib/llm-ledger.js \| grep -E '^[+-]' \| grep -v '^[+-]{3}' \| wc -l` returns 0 (zero lines changed in llm-ledger.js body) | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] **Inspect `tests/setup/chrome-stub.js`** — confirm it does NOT set or unset `process.env.CI`. If it does, planner must add an explicit `delete process.env.CI` in the LEDGER-04 test's `beforeEach`. (Research §A1 assumption; verified once → unblocks Wave 1.)
- [ ] **Confirm `vi.mock` hoisting still works in current Vitest pin** — sanity-check by running `CI=true npx vitest run tests/unit/auto-fix.test.js` once before edits. Must exit 0 to validate the mock-seam pattern Wave 1 will extend. (Research §A2.)

*If both confirmations pass: Wave 0 complete; no new test infrastructure files needed. Both Wave 1 edits append/modify existing files.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `safeAppendLedger` throws outside CI on a real auto-fix.mjs invocation | LEDGER-02 (negative path / threat T-56-01) | Wrapper is module-internal by design (not exported); spawning `node scripts/auto-fix.mjs` from Vitest adds child_process + `gh` mocking complexity for one assertion. Per-research §Open-Question-3 recommendation. | Run locally: `unset CI; unset E2E_LEDGER_PATH_OVERRIDE; node scripts/auto-fix.mjs --issue 1 2>&1 \| grep -q 'safeAppendLedger refused'` — exits 0 if guard fires; non-zero indicates leak. Record evidence in 56-VERIFICATION.md. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (`tests/setup/chrome-stub.js` inspection + Vitest mock-hoist sanity)
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

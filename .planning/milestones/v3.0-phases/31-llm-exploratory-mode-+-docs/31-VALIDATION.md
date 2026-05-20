---
phase: 31
slug: llm-exploratory-mode-docs
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-18
---

# Phase 31 — Validation Strategy

> Per-phase validation contract derived from 31-RESEARCH.md § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.2.4 (existing root install) |
| **Config file** | `vitest.config.js` (existing — `include: ['tests/**/*.test.js']`) |
| **Quick run command** | `npx vitest run tests/unit/llm-ledger.test.js tests/unit/llm-hallucination.test.js tests/unit/llm-report.test.js tests/unit/error-codes.test.js` |
| **Full suite command** | `npm run test:src` |
| **Estimated runtime** | Unit suites: ~5-10s · CI-guard integration: ~1s · README structural: <1s |

---

## Sampling Rate

- **After every task commit:** Quick command (touched unit test file)
- **After every plan wave:** `npm run test:src`
- **Before `/gsd-verify-work`:** Full suite green + one successful `npm run e2e:explore -- --iterations 1` (manual; consumes ~$0.50 of subscription credit)
- **Max feedback latency:** ~10s for unit tests; ~60s per iteration of e2e:explore

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 31-01-* | 01 | 1 | LLM-04, LLM-05, LLM-06, LLM-07 | T-31-1 (env), T-31-3 (LLM injection) | Pre-invocation $100 hard cap; CI guard; no API key required; new RPT-02 codes added | unit + integration | `npx vitest run tests/unit/llm-ledger.test.js tests/unit/error-codes.test.js && CI=true node scripts/e2e-explore.mjs 2>&1 \| grep -q "local-only"` | ❌ W0 | ⬜ pending |
| 31-02-* | 02 | 1 | LLM-01, LLM-03, LLM-08 | T-31-3 (LLM injection via page.evaluate) | Hallucination guard + verifier-classification; append-only llm-report.json including partial-run cost | unit | `npx vitest run tests/unit/llm-hallucination.test.js tests/unit/llm-report.test.js` | ❌ W0 | ⬜ pending |
| 31-03-* | 03 | 2 | LLM-02 (manual) | — | claude -p invocation uses subscription pool; one iteration succeeds | manual integration | `npm run e2e:explore -- --iterations 1` then inspect `tests/e2e/artifacts/{run-id}/llm-report.json` | n/a | ⬜ pending (manual) |
| 31-04-* | 04 | 3 | DOC-01 | — | README contains 7 required sections; commands resolve to real files | structural | `node -e "const s=require('fs').readFileSync('tests/e2e/README.md','utf8'); ['Overview','deterministic','exploratory','test-hook','Adding','ledger','Troubleshooting'].every(h=>s.includes(h)) \|\| process.exit(1)"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/llm-ledger.test.js` — threshold tests (< $80, $80–$100, ≥ $100), monthly rollover, missing-file initialization
- [ ] `tests/unit/llm-hallucination.test.js` — wsNorm match, tightNorm fallback, rejection of hallucinated text
- [ ] `tests/unit/llm-report.test.js` — iteration append, summary computation including partial-run `total_cost_usd`
- [ ] `tests/unit/error-codes.test.js` — `LLM_HALLUCINATED_SELECTION` + `LLM_API_ERROR` present; `ERROR_CLASSES.length` = 11; frozen; preserves existing 9 codes
- [ ] Test fixture: `tests/unit/fixtures/sample-llm-report.json` (3-iteration sample with PASS / LLM_HALLUCINATED_SELECTION / LLM_API_ERROR)
- [ ] Test fixture: `tests/unit/fixtures/sample-ledger-empty.json` and `sample-ledger-at-cap.json` for threshold tests

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `claude -p` returns `total_cost_usd` field; uses subscription pool when API key absent | LLM-02 | Requires live invocation; consumes subscription credit | Run `npm run e2e:explore -- --iterations 1`; inspect llm-report.json and confirm cost is recorded and ledger shows the new entry |
| Subscription credit pool exhaustion produces a usable error | LLM-02 (edge case) | Cannot test without exhausting real pool | Document expected `subtype` value in 31-RESEARCH.md Open Questions; revisit when first natural exhaustion occurs |
| One end-to-end iteration produces a valid citation, verifier verdict, and ledger increment | LLM-01 (success criterion #1) | Live LLM + real harness + real verifier — too complex for unit | After commit, run `npm run e2e:explore -- --iterations 1`; confirm: iteration logged, ledger incremented, citation present, verifier_verdict has status |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify commands OR Wave 0 dependencies OR explicit Manual-Only entry
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all 4 new unit test files + 2 fixtures
- [ ] No watch-mode flags in automated commands
- [ ] Feedback latency < 10s for unit tests
- [ ] `nyquist_compliant: true` set in frontmatter after Wave 0 task complete

**Approval:** pending

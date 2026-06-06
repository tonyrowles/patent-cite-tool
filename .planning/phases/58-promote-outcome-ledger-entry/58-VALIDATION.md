---
phase: 58
slug: promote-outcome-ledger-entry
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-05
---

# Phase 58 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.2.4 |
| **Config file** | `vitest.config.js` |
| **Quick run command** | `CI=true npx vitest run tests/unit/auto-fix-promote-gate.test.js` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~5s quick / ~90s full |

---

## Sampling Rate

- **After every task commit:** `CI=true npx vitest run tests/unit/auto-fix-promote-gate.test.js`
- **After every plan wave:** `CI=true npx vitest run tests/unit/`
- **Before `/gsd:verify-work`:** `npm test` green modulo Phase 51.1 carry-over failures in `v40-verifier-gate-yaml.test.js` (Phase 60 CLEAN-02 fixes).
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 58-W0-01 | 00 | 0 | (baseline) | — | Capture pre-Phase-58 baseline ref + assertTripleGate body hash | inspection | `git rev-parse HEAD` → PHASE_58_BASELINE; sha256 of assertTripleGate body via awk | ✅ | ⬜ pending |
| 58-01-01 | 01 | 1 | PROMOTE-01 | T-58-01 (boundary violation) | New `appendLedgerEntry` import follows IMPORTS POLICY; allow-list comment updated; new Vitest assertion enforces policy | source assertion | `grep -nE '^import' scripts/auto-fix-promote.mjs \| grep -vE "from 'node:\|from './promote-from-quarantine\\\\.mjs'\|from '\\\\.\\\\./tests/e2e/lib/llm-ledger\\\\.js'"` returns zero lines | ✅ | ⬜ pending |
| 58-01-02 | 01 | 1 | PROMOTE-02, PROMOTE-03 (errorClass scope) | T-58-04 (a-b-winner abstention) | argv parser handles `--fingerprint` and `--error-class`; workflow YAML pre-resolves both | source assertion + unit | `grep -c 'args.fingerprint\\\|args.errorClass' scripts/auto-fix-promote.mjs` ≥ 4 (two reads each for both success + failure paths) AND new Vitest argv test exits 0 | ✅ | ⬜ pending |
| 58-01-03 | 01 | 1 | PROMOTE-02 | T-58-02 (silent success drop) | Success path at line 446 writes `{source:'auto-fix-promoted', outcome:'pass', errorClass, fingerprint, issueId, prNumber, ...common fields}` BEFORE `process.exit(0)` | unit (vitest with mocked appendLedgerEntry) | New Vitest test in auto-fix-promote-gate.test.js asserts `vi.mocked(appendLedgerEntry).mock.calls[0][1]` matches the entry shape | ❌ W0 (new test block) | ⬜ pending |
| 58-01-04 | 01 | 1 | PROMOTE-03 | T-58-03 (silent failure drop) | Failure path at line 440 writes `{source:'auto-fix-failed', outcome:'fail', errorClass, fingerprint, issueId, prNumber, reason}` BEFORE `process.exit(1)` | unit (vitest with mocked appendLedgerEntry) | New Vitest test asserts entry shape with reason captured from `runPromote exitCode=${result.exitCode}` | ❌ W0 (new test block) | ⬜ pending |
| 58-01-05 | 01 | 1 | PROMOTE-04 | T-58-05 (trust invariant drift) | `assertTripleGate` body byte-unchanged from PHASE_58_BASELINE (and transitively from Phase 53 baseline) | unit (vitest source-extraction) | New Vitest test extracts body via awk-equivalent + verbatim-string match OR sha256 match against the locked hash from RESEARCH §4 (5311c1d5364b1b8558d44029432bfb0d5164c19fcc38b9b2d6fcd539c2e0c40f) | ❌ W0 (new test block) | ⬜ pending |
| 58-01-06 | 01 | 1 | (trust invariant) | T-58-06 (_skipCiGuard widening) | Non-comment grep count of `_skipCiGuard:\\s*true` in scripts/auto-fix-promote.mjs = 1 | source assertion | New Vitest test does file-read + comment-strip + grep; asserts count = 1 | ❌ W0 (new test block) | ⬜ pending |
| 58-02-01 | 02 | 1 | PROMOTE-02, PROMOTE-03 | T-58-04 | Workflow YAML pre-resolves `--fingerprint` and `--error-class` from source-issue body + PR labels, threads to script via argv | source assertion + YAML grep | `grep -E '\\-\\-fingerprint\\|\\-\\-error-class' .github/workflows/v40-auto-promote.yml` returns ≥2 lines | ✅ (existing workflow file) | ⬜ pending |
| 58-VG-01 | verify | gate | All 4 PROMOTE-* | T-58-01..06 | All new + existing Vitest tests green; `tests/e2e/lib/llm-ledger.js` byte-unchanged | regression | `CI=true npx vitest run tests/unit/auto-fix-promote-gate.test.js` exits 0 AND `git diff cae5ff4 HEAD -- tests/e2e/lib/llm-ledger.js` empty | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] **Pre-flight baseline snapshot** — capture `PHASE_58_BASELINE = git rev-parse HEAD` BEFORE Wave 1 begins. Used for `tests/e2e/lib/llm-ledger.js` and `assertTripleGate` body byte-unchanged diffs.
- [ ] **assertTripleGate body hash baseline** — compute sha256 of the function body (lines 89-103 per RESEARCH §4); confirm matches the documented value `5311c1d5364b1b8558d44029432bfb0d5164c19fcc38b9b2d6fcd539c2e0c40f`. If not, halt — implies Phase 53 baseline has already drifted.
- [ ] **Existing test baseline** — `CI=true npx vitest run tests/unit/auto-fix-promote-gate.test.js` exits 0 with 26 tests (per RESEARCH §5). Establishes Wave 1 regression baseline.

*All three confirmations done once; unblocks Wave 1.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| After a real auto-fix promotion, `jq '[.[] \| select(.source=="auto-fix-promoted")]' tests/e2e/.llm-spend-ledger.json` returns ≥1 entry with all required fields | PROMOTE-02 (ROADMAP success criterion 1) | Requires a live auto-fix PR merge and the v40-auto-promote.yml workflow firing in CI. Phase 59 SWEEP-03 covers this as primary DoD evidence. | Phase 59 SWEEP-03 runbook. |
| A-B winner exits abstention after ≥20 entries per ERROR_CLASS per arm accumulate | Milestone DoD (downstream consumer) | Requires production traffic over time; not a Phase 58 acceptance gate. | Future operator check via `node scripts/a-b-winner.mjs` after Phase 59 evidence ships. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (baseline + assertTripleGate hash + test count)
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

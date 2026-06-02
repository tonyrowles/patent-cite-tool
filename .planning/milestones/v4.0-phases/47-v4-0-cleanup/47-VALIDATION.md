---
phase: 47
slug: v4-0-cleanup
status: draft
nyquist_compliant: false
wave_0_complete: true
created: 2026-06-01
---

# Phase 47 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.x |
| **Config file** | `vitest.config.js` |
| **Quick run command** | `npm run test:unit -- --run` |
| **Full suite command** | `npm test -- --run` |
| **Estimated runtime** | ~45 seconds (unit) / ~3 min (full incl. e2e static-greps) |

---

## Sampling Rate

- **After every task commit:** Run `npm run test:unit -- --run -t "<test-name-pattern>"` for the touched test file
- **After every plan wave:** Run `npm run test:unit -- --run`
- **Before `/gsd:verify-work`:** Full suite (`npm test -- --run`) must be green
- **Max feedback latency:** ~45 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 47-01-01 | 01 | 1 | CLEANUP-01 | — | triage-label → trigger-filter contract holds | unit | `npm run test:unit -- --run -t "TP-01-triage-label-filter"` | ❌ W0 | ⬜ pending |
| 47-01-02 | 01 | 1 | CLEANUP-01 | — | fingerprint() → branch-namer contract holds | unit | `npm run test:unit -- --run -t "TP-02-fingerprint-branch"` | ❌ W0 | ⬜ pending |
| 47-01-03 | 01 | 1 | CLEANUP-01 | — | invokeClaudePWithLedger subscription-path contract | unit | `npm run test:unit -- --run -t "TP-03-subscription-ledger"` | ❌ W0 | ⬜ pending |
| 47-01-04 | 01 | 1 | CLEANUP-01 | — | verifyCitation → CLI shim contract | unit | `npm run test:unit -- --run -t "TP-04-verify-single-case-shim"` | ❌ W0 | ⬜ pending |
| 47-01-05 | 01 | 1 | CLEANUP-01 | — | runPromote → _skipCiGuard triple-gate | unit | `npm run test:unit -- --run -t "TP-05-skipciguard-triple-gate"` | ❌ W0 | ⬜ pending |
| 47-01-06 | 01 | 2 | CLEANUP-01 | — | INT-FIX-LEDGER: ledger reset to seed-only | unit | `npm run test:unit -- --run -t "ledger.*seed.*bootstrap"` (existing Test 48) | ✅ | ⬜ pending |
| 47-01-07 | 01 | 2 | CLEANUP-01 | — | INT-FIX-CAL: dynamic-date in weekly-digest test | unit | `npm run test -- --run e2e-weekly-digest.test.js` | ✅ | ⬜ pending |
| 47-01-08 | 01 | 2 | CLEANUP-01 | — | INT-FIX-LOCK: @anthropic-ai/sdk exact pin | unit | `npm run test:unit -- --run -t "package-lock.*sdk.*exact"` | ❌ W0 | ⬜ pending |
| 47-02-01 | 02 | 3 | CLEANUP-02 | — | gsd-validate-phase produces COMPLIANT VALIDATION.md for phases 39-46 | manual+verifier | `for p in 39 40 41 42 43 44 45 46; do /gsd:validate-phase $p; done` | ❌ W0 | ⬜ pending |
| 47-02-02 | 02 | 3 | CLEANUP-02 | — | static-grep tests pin ARCHITECTURE §4 touchpoints (5 tests, see 47-01-01..05) | unit | (covered by 47-01-01..05) | ✅ | ⬜ pending |
| 47-03-01 | 03 | 4 | CLEANUP-03 | — | UAT (c) FLAKE escalation: 3× same FLAKE → re-file suppressed | manual+local | `node scripts/quarantine-append.mjs --escalate-stable-runs-reset 1` — see runbook | ❌ W0 | ⬜ pending |
| 47-03-02 | 03 | 4 | CLEANUP-03 | — | UAT (a)(b)(d)(e) deferred runbook stubs written to 47-UAT-DEFERRED.md | unit | `npm run test:unit -- --run -t "uat-deferred-runbook-stubs-exist"` | ❌ W0 | ⬜ pending |
| 47-04-01 | 04 | 5 | CLEANUP-04 | — | CODEOWNERS contents pinned (5 paths, last-matching order) | unit | `npm run test:unit -- --run -t "CODEOWNERS.*pinned"` | ❌ W0 | ⬜ pending |
| 47-04-02 | 04 | 5 | CLEANUP-04 | — | gh-api ruleset query: allow_auto_merge=false, bypass=ON, required-checks include verifier-gate + deps-update-gate | manual+verifier | `gh api repos/{owner}/{repo}/rulesets/<id>` — see runbook | ✅ | ⬜ pending |
| 47-04-03 | 04 | 5 | CLEANUP-04 | — | v4.0-MILESTONE-AUDIT.md created with all 4 CLEANUP sections + nyquist + human_verification + branch_protection blocks | manual+verifier | `test -f .planning/v4.0-MILESTONE-AUDIT.md && grep -E "## (integration|nyquist|human_verification|branch_protection)" .planning/v4.0-MILESTONE-AUDIT.md \| wc -l` (expect 4) | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `tests/unit/` directory exists (678+ existing vitest tests)
- [x] vitest framework already installed (no new deps per v4.0 hard rule)
- [ ] `tests/unit/v4-touchpoints.test.js` — new file with 5 TP-* tests for ARCHITECTURE §4 touchpoints
- [ ] `tests/unit/codeowners-pinned.test.js` — new static-grep test for CODEOWNERS contents
- [ ] `tests/unit/package-lock-pinned.test.js` — new static-grep test for @anthropic-ai/sdk exact pin
- [ ] `tests/unit/uat-deferred-runbook.test.js` — asserts runbook stubs present in 47-UAT-DEFERRED.md
- [ ] `.planning/v4.0-MILESTONE-AUDIT.md` — created in Plan 04, consumed by gsd-audit-milestone in lifecycle

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| UAT (c) FLAKE escalation suppresses re-files | CLEANUP-03 | Requires multi-invocation against synthetic FLAKE fixture; observation of label/issue state | See 47-RESEARCH.md §UAT-47-c runbook |
| UAT (a) end-to-end auto-fix flow on real triage issue | CLEANUP-03 | **DEFERRED: requires-push** — workflow does not yet exist on origin GitHub Actions | Runbook stub in 47-UAT-DEFERRED.md; operator executes post-push |
| UAT (b) dep-PR pre-flight gate blocking on regression | CLEANUP-03 | **DEFERRED: requires-push** — same as (a) | Runbook stub in 47-UAT-DEFERRED.md |
| UAT (d) ledger snapshot workflow commit | CLEANUP-03 | **DEFERRED: requires-push** — same as (a) | Runbook stub in 47-UAT-DEFERRED.md |
| UAT (e) verifier-gate diff-guard reject crafted bypass | CLEANUP-03 | **DEFERRED: requires-push** — same as (a) | Runbook stub in 47-UAT-DEFERRED.md |
| `gh api` ruleset state (allow_auto_merge, bypass, required-checks) | CLEANUP-04 | Live GitHub state query | `gh api repos/{owner}/{repo}/rulesets/<id>` — recorded in 47-04 SUMMARY |
| Nyquist gap-analysis per-phase outcome | CLEANUP-02 | Each `gsd-validate-phase` invocation may surface phase-specific gaps requiring judgment | Document inline in 47-02 SUMMARY |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 45s
- [ ] `nyquist_compliant: true` set in frontmatter (stamped post-execute by gsd-validate-phase)

**Approval:** pending (stamped by gsd-validate-phase invocation as part of CLEANUP-02)

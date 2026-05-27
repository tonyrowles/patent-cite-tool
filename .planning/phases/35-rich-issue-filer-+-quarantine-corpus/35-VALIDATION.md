---
phase: 35
slug: rich-issue-filer-quarantine-corpus
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-27
---

# Phase 35 — Validation Strategy

> Source: 35-RESEARCH.md §"Validation Architecture" + CONTEXT.md D-01..D-16.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.x (existing) |
| **Quick run command** | `vitest run tests/unit/issue-payload-builder.test.js` (or the per-file unit test) |
| **Full suite command** | `npm run test:src && npm run lint` |
| **Estimated runtime** | ~12-15s quick / ~45s full |

---

## Sampling Rate

- **After every task commit:** Run the quick test for the file just modified.
- **After every plan wave:** Run `npm run test:src` + `npm run lint`.
- **Before `/gsd:verify-work`:** Full suite green AND `npm run e2e:report-issue -- --source triage --dry-run --triage-report <fixture>` produces correct issue bodies.
- **Max feedback latency:** ~45 seconds.

---

## Per-Task Verification Map

> Plan IDs (00..N) finalized by planner. Plan 00 is the prerequisite gap-closure for `update-golden.js --case` + GitHub label creation (per research Open Questions 1 + 3).

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command |
|---------|------|------|-------------|-----------|-------------------|
| 35-00-XX | 00 (prereqs) | 1 | enables QUAR-05 | unit | `vitest run scripts/__tests__/update-golden.test.js` (per-case flag); manual `gh label list` for label creation |
| 35-01-XX | 01 (issue-payload-builder) | 2 | ISSUE-01, ISSUE-04 | unit | `vitest run tests/unit/issue-payload-builder.test.js` |
| 35-02-XX | 02 (e2e-report-issue --source triage + dual-search + topOfStackHashFromTriage) | 3 | ISSUE-02, ISSUE-03 | integration (mock-gh spawnSync) | `vitest run tests/e2e/scripts/e2e-report-issue-triage.test.js` |
| 35-03-XX | 03 (test-cases-quarantine.js seed + schema-guard) | 2 | QUAR-01 | unit | `vitest run tests/unit/test-cases-quarantine-schema.test.js` |
| 35-04-XX | 04 (quarantine-append.mjs + idempotent upsert + ready-for-promotion auto-label) | 3 | QUAR-02 | unit + integration | `vitest run tests/unit/quarantine-append.test.js && vitest run tests/e2e/scripts/e2e-quarantine-append.test.js` |
| 35-05-XX | 05 (promote-from-quarantine.mjs human-gated + spawnSync update-golden.js) | 4 | QUAR-05 | unit (tmpDir clone) | `vitest run tests/unit/promote-from-quarantine.test.js` |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/issue-payload-builder.test.js` — stub for fingerprint-line-1, section order, char-budget truncation
- [ ] `tests/e2e/scripts/e2e-report-issue-triage.test.js` — stub for --source triage spawnSync + mock-gh label assertions
- [ ] `tests/unit/test-cases-quarantine-schema.test.js` — stub for QUAR-01 schema invariants
- [ ] `tests/unit/quarantine-append.test.js` — stub for idempotent upsert (append twice → 1 entry, stable_runs === 2)
- [ ] `tests/e2e/scripts/e2e-quarantine-append.test.js` — stub for spawnSync CLI + mock-gh add-label assertion
- [ ] `tests/unit/promote-from-quarantine.test.js` — stub for tmpDir-clone promotion test
- [ ] `scripts/__tests__/update-golden.test.js` — stub for `--case <id>` per-case flag verification (new in Plan 35-00)
- [ ] GitHub labels created (`gh label create triage`, `gh label create quarantine:ready-for-promotion`) — manual gate, NOT a Vitest test
- [ ] Synthetic fixtures: small triage-report.json + sibling rerun-report.json + llm-report.json covering CONFIRMED severity-high finding (for issue filer) + N≥3 stable_runs finding (for ready-for-promotion auto-label)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `gh label create` for new labels | D-06, D-12 | One-shot bootstrap; auth-bound | `gh label create triage --color 7e57c2 --force && gh label create quarantine:ready-for-promotion --color 4caf50 --force` |
| Full end-to-end smoke: triage → issue filed → quarantine append → ready-for-promotion → promote | All ISSUE + QUAR | Requires committed quarantine corpus mutation; reverted after audit | (See `35-MANUAL-SMOKE.md` if planner emits one) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 45s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

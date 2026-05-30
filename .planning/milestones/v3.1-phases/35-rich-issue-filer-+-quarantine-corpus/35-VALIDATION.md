---
phase: 35
slug: rich-issue-filer-quarantine-corpus
status: audited
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-27
audited: 2026-05-29
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

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 35-00-XX | 00 (prereqs) | 1 | enables QUAR-05 | unit | `vitest run tests/unit/update-golden-case-flag.test.js` (per-case flag); manual `gh label list` for label creation | ✅ green (6/6) |
| 35-01-XX | 01 (issue-payload-builder) | 2 | ISSUE-01, ISSUE-04 | unit | `vitest run tests/unit/issue-payload-builder.test.js` | ✅ green (15/15) |
| 35-02-XX | 02 (e2e-report-issue --source triage + dual-search + topOfStackHashFromTriage) | 3 | ISSUE-02, ISSUE-03 | integration (mock-gh spawnSync) | `vitest run tests/e2e/scripts/e2e-report-issue-triage.test.js` | ✅ green (8/8) |
| 35-03-XX | 03 (test-cases-quarantine.js seed + schema-guard) | 2 | QUAR-01 | unit | `vitest run tests/unit/test-cases-quarantine-schema.test.js` | ✅ green (7/7) |
| 35-04-XX | 04 (quarantine-append.mjs + idempotent upsert + ready-for-promotion auto-label) | 3 | QUAR-02 | unit + integration | `vitest run tests/unit/quarantine-append.test.js && vitest run tests/e2e/scripts/e2e-quarantine-append.test.js` | ✅ green (15/15 + 8/8) |
| 35-05-XX | 05 (promote-from-quarantine.mjs human-gated + spawnSync update-golden.js) | 4 | QUAR-05 | unit (tmpDir clone) | `vitest run tests/unit/promote-from-quarantine.test.js` | ✅ green (11/11) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `tests/unit/issue-payload-builder.test.js` — stub for fingerprint-line-1, section order, char-budget truncation
- [x] `tests/e2e/scripts/e2e-report-issue-triage.test.js` — stub for --source triage spawnSync + mock-gh label assertions
- [x] `tests/unit/test-cases-quarantine-schema.test.js` — stub for QUAR-01 schema invariants
- [x] `tests/unit/quarantine-append.test.js` — stub for idempotent upsert (append twice → 1 entry, stable_runs === 2)
- [x] `tests/e2e/scripts/e2e-quarantine-append.test.js` — stub for spawnSync CLI + mock-gh add-label assertion
- [x] `tests/unit/promote-from-quarantine.test.js` — stub for tmpDir-clone promotion test
- [x] `tests/unit/update-golden-case-flag.test.js` — stub for `--case <id>` per-case flag verification (new in Plan 35-00)
- [x] GitHub labels created (`gh label create triage`, `gh label create quarantine:ready-for-promotion`) — manual gate, NOT a Vitest test (confirmed by developer during Plan 00 Task 3 execution per 35-VERIFICATION.md)
- [x] Synthetic fixtures: small triage-report.json + sibling rerun-report.json + llm-report.json covering CONFIRMED severity-high finding (for issue filer) + N≥3 stable_runs finding (for ready-for-promotion auto-label)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `gh label create` for new labels | D-06, D-12 | One-shot bootstrap; auth-bound | `gh label create triage --color 7e57c2 --force && gh label create quarantine:ready-for-promotion --color 4caf50 --force` |
| Full end-to-end smoke: triage → issue filed → quarantine append → ready-for-promotion → promote | All ISSUE + QUAR | Requires committed quarantine corpus mutation; reverted after audit | (See `35-MANUAL-SMOKE.md` if planner emits one) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 45s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-05-29 — Nyquist audit pass; 70/70 tests green across 7 files; manual rows pre-classified COVERED-MANUAL per RESEARCH Pitfall 4.

---

## Validation Audit 2026-05-29

**Auditor:** Nyquist adversarial test-coverage audit (Phase 38 prep).
**Stance:** FORCE — assume each gap uncovered until a passing behavioral test proves the requirement.

### Per-Task Map — Audit Results

| Task ID | Test File | Test Count | Result |
|---------|-----------|-----------:|--------|
| 35-00-XX | `tests/unit/update-golden-case-flag.test.js` | 6/6 | ✅ green |
| 35-01-XX | `tests/unit/issue-payload-builder.test.js` | 15/15 | ✅ green |
| 35-02-XX | `tests/e2e/scripts/e2e-report-issue-triage.test.js` | 8/8 | ✅ green |
| 35-03-XX | `tests/unit/test-cases-quarantine-schema.test.js` | 7/7 | ✅ green |
| 35-04-XX (a) | `tests/unit/quarantine-append.test.js` | 15/15 | ✅ green |
| 35-04-XX (b) | `tests/e2e/scripts/e2e-quarantine-append.test.js` | 8/8 | ✅ green |
| 35-05-XX | `tests/unit/promote-from-quarantine.test.js` | 11/11 | ✅ green |

**Total:** 70/70 tests pass across 7 files. Combined runtime: 3.30s (well under 45s feedback budget).

### Manual-Only Rows — Pre-Classified COVERED-MANUAL

| Row | Disposition | Why |
|-----|-------------|-----|
| `gh label create triage` + `gh label create quarantine:ready-for-promotion` (D-06/D-12 one-shot bootstrap) | COVERED-MANUAL | Already executed by developer during Plan 00 Task 3; one-shot auth-bound external state; per RESEARCH Pitfall 4 not falsifiable by automated grep/node check |
| Full end-to-end smoke (triage → issue filed → quarantine append → ready-for-promotion → promote) | COVERED-MANUAL | Owned by Phase 38 Plan 38-03 (live-UAT integration); requires real `gh auth`, network, and persistent corpus state across runs; the underlying mechanism is fully covered by the 70 automated tests above |

### Compliance Check

- [x] Every requirement (ISSUE-01..04, QUAR-01, QUAR-02, QUAR-05) maps to a green automated row
- [x] No gap demands an additional test file — implementation is RED→GREEN closed per 35-VERIFICATION.md
- [x] All 7 referenced test files exist on disk (verified via `ls -la` 2026-05-29)
- [x] Combined Vitest run: `vitest run` over the 7 files exits 0; 70/70 pass
- [x] Manual rows pre-classified per RESEARCH Pitfall 4 — no escalation needed
- [x] Frontmatter stamped `nyquist_compliant: true`

**Result:** GAPS FILLED. Phase 35 validation map is compliant. No BLOCKER, no WARNING, no ESCALATE.

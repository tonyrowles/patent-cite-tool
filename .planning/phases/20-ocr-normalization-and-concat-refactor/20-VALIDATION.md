---
phase: 20
slug: ocr-normalization-and-concat-refactor
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-04
---

# Phase 20 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^3.0.0 |
| **Config file** | `vitest.config.js` |
| **Quick run command** | `npm run test:src` |
| **Full suite command** | `npm run test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test:src`
- **After every plan wave:** Run `npm run test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 20-01-01 | 01 | 0 | MATCH-02 | unit | `npm run test:src` | ❌ W0 | ⬜ pending |
| 20-01-02 | 01 | 0 | MATCH-03 | unit | `npm run test:src` | ❌ W0 | ⬜ pending |
| 20-01-03 | 01 | 0 | MATCH-02 | integration | `npm run test:src` | ❌ W0 | ⬜ pending |
| 20-02-01 | 02 | 1 | MATCH-03 | unit | `npm run test:src` | ✅ | ⬜ pending |
| 20-02-02 | 02 | 1 | MATCH-02 | unit | `npm run test:src` | ❌ W0 | ⬜ pending |
| 20-03-01 | 03 | 1 | MATCH-02 | regression | `npm run test:src` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/shared-matching.test.js` — add `normalizeOcr` export check + behavior tests (`rn`→`m`, `cl`→`d`, no-change case)
- [ ] `tests/unit/shared-matching.test.js` — add `buildConcat` export check + shape tests (`{concat, boundaries}`)
- [ ] OCR confusion integration test — inline fixture or new corpus entry for selection with OCR patterns

*Existing infrastructure covers framework and config — only test stubs needed.*

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

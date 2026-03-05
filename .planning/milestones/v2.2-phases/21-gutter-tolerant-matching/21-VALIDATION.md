---
phase: 21
slug: gutter-tolerant-matching
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-05
---

# Phase 21 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^3.0.0 |
| **Config file** | vitest.config.js |
| **Quick run command** | `npx vitest run tests/unit/shared-matching.test.js` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/unit/shared-matching.test.js`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 21-01-01 | 01 | 1 | MATCH-01 | unit | `npx vitest run tests/unit/shared-matching.test.js` | ❌ W0 | ⬜ pending |
| 21-01-02 | 01 | 1 | MATCH-01 | unit | `npx vitest run tests/unit/shared-matching.test.js` | ❌ W0 | ⬜ pending |
| 21-01-03 | 01 | 1 | MATCH-01 | regression | `npx vitest run tests/unit/text-matcher.test.js` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/shared-matching.test.js` — new `describe('gutterTolerantMatch', ...)` block with stubs
- [ ] `tests/unit/shared-matching.test.js` — new `describe('stripGutterNumbers', ...)` block for strip function unit tests
- [ ] Synthetic positionMap fixtures for gutter number test cases (inline in tests)

*Existing infrastructure covers regression testing (71-case corpus).*

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

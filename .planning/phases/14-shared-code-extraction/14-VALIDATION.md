---
phase: 14
slug: shared-code-extraction
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-03
---

# Phase 14 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^3.0.0 |
| **Config file** | vitest.config.js |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~3 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 3 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 14-00-01 | 00 | 0 | SHARED-01 | unit smoke | `npm test` | ❌ W0 | ⬜ pending |
| 14-00-02 | 00 | 0 | SHARED-02 | unit smoke | `npm test` | ❌ W0 | ⬜ pending |
| 14-00-03 | 00 | 0 | SHARED-01 | import update | `npm test` | ✅ | ⬜ pending |
| 14-00-04 | 00 | 0 | SHARED-03 | import update | `npm test` | ✅ | ⬜ pending |
| 14-01-01 | 01 | 1 | SHARED-01 | corpus | `npm test` | ✅ | ⬜ pending |
| 14-01-02 | 01 | 1 | SHARED-02 | unit | `npm test` | ✅ | ⬜ pending |
| 14-01-03 | 01 | 1 | SHARED-03 | integration | `npm test` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/shared-matching.test.js` — smoke test that `src/shared/matching.js` exports all 10 functions by name
- [ ] `tests/unit/shared-constants.test.js` — smoke test that `src/shared/constants.js` exports MSG (all 16 keys), STATUS (8 keys), PATENT_TYPE (2 keys)
- [ ] Update `tests/unit/text-matcher.test.js` — change import from `src/content/text-matcher.js` to `src/shared/matching.js`
- [ ] Update `tests/unit/offscreen-matcher.test.js` — change import to `src/shared/matching.js::matchAndCite`, remove vi.mock() calls

*Existing infrastructure covers test execution; Wave 0 adds smoke tests and updates imports.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Chrome extension loads and content scripts work | SHARED-03 | Browser-specific classic script loading | Load unpacked extension, navigate to patent page, verify highlighting works |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 3s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

---
phase: 22
slug: validation-and-golden-baseline
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-05
---

# Phase 22 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^3.0.0 |
| **Config file** | `vitest.config.js` (src unit), `vitest.config.chrome.js`, `vitest.config.firefox.js` |
| **Quick run command** | `npm run test:src` |
| **Full suite command** | `npm test` (build + test:src + test:chrome + test:firefox + test:lint) |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test:src`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 22-01-01 | 01 | 1 | VALID-01 | golden baseline | `npm run test:src` | ❌ W0 | ⬜ pending |
| 22-01-02 | 01 | 1 | VALID-01 | golden baseline | `npm run test:src` | ❌ W0 | ⬜ pending |
| 22-01-03 | 01 | 1 | VALID-01 | golden baseline | `npm run test:src` | ❌ W0 | ⬜ pending |
| 22-01-04 | 01 | 1 | VALID-02 | golden baseline | `npm run test:src` | ❌ W0 | ⬜ pending |
| 22-01-05 | 01 | 1 | baseline integrity | regression | `npm test` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/fixtures/synthetic-gutter.json` — new fixture with injected gutter numbers from US11427642 subset
- [ ] `tests/test-cases.js` — add CATEGORIES entries for `ocr` and `gutter`; add 4 new TEST_CASES entries; add s→S gap case as comment block
- [ ] `tests/golden/baseline.json` — append 4 new entries (additions only, verified citations)
- [ ] `scripts/spot-check.js` — update SPOT_CHECK_IDS array with new IDs

*Existing infrastructure covers test execution — no new test files needed. text-matcher.test.js golden baseline loop auto-picks up new TEST_CASES + baseline entries.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| selectedText copied from Google Patents HTML | VALID-01 | Requires browser interaction | Open US6324676 in Google Patents, highlight passages, copy text for selectedText values |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

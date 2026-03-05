---
phase: 16
slug: firefox-extension
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-04
---

# Phase 16 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^3.0.0 |
| **Config file** | `vitest.config.js` |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm test` + manual Firefox load test
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 16-01-01 | 01 | 1 | FOX-04 | integration | `npm run build && ls dist/chrome dist/firefox` | ❌ W0 | ⬜ pending |
| 16-01-02 | 01 | 1 | FOX-01 | manual-only | Load in Firefox via "Load Temporary Add-on" | N/A | ⬜ pending |
| 16-02-01 | 02 | 1 | FOX-02 | manual-only | Load extension, highlight text on patent page | N/A | ⬜ pending |
| 16-02-02 | 02 | 1 | FOX-03 | manual-only | Navigate patent/non-patent pages in Firefox | N/A | ⬜ pending |
| 16-03-01 | 03 | 2 | FOX-05 | manual-only | Set "Never remember history", test citation | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.* The existing 136-test Vitest suite validates the shared matching algorithm. New Firefox-specific behavior (icon activation, IndexedDB degradation, extension loading) requires manual Firefox testing and cannot be automated with Vitest (Node-based).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Extension loads in Firefox without console errors | FOX-01 | Requires running Firefox browser | Load via about:debugging → "Load Temporary Add-on", check browser console |
| Citation produced on Google Patents page | FOX-02 | Requires Firefox with extension loaded | Navigate to patent page, highlight text, verify citation popup |
| Icon active on patent pages, gray elsewhere | FOX-03 | Requires Firefox tab navigation | Navigate to patent page (icon colored), then non-patent page (icon gray) |
| IndexedDB degradation graceful | FOX-05 | Requires Firefox "Never remember history" mode | Set Firefox privacy mode, load extension, verify citation still works |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

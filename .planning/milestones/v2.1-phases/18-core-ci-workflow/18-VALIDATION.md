---
phase: 18
slug: core-ci-workflow
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-04
---

# Phase 18 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest v3.x |
| **Config file** | `vitest.config.js` (default), `vitest.config.chrome.js`, `vitest.config.firefox.js` |
| **Quick run command** | `npm run test:src` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~45 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run build && npm run test:src`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green + push to branch + verify Actions tab shows green run
- **Max feedback latency:** 45 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 18-01-01 | 01 | 1 | CICD-01 | manual | Push commit, check Actions tab | ❌ W0 | ⬜ pending |
| 18-01-02 | 01 | 1 | CICD-02 | manual | Observe `npm ci` step in Actions run | ❌ W0 | ⬜ pending |
| 18-01-03 | 01 | 1 | CICD-03 | manual | Verify 4 named test steps in Actions UI | ❌ W0 | ⬜ pending |
| 18-01-04 | 01 | 1 | PKG-01 | smoke | `unzip -l patent-cite-chrome.zip \| grep manifest.json` | ❌ W0 | ⬜ pending |
| 18-01-05 | 01 | 1 | PKG-02 | smoke | `unzip -l patent-cite-firefox.zip \| grep manifest.json` | ❌ W0 | ⬜ pending |
| 18-01-06 | 01 | 1 | PKG-03 | manual | Download artifacts from Actions run page | ❌ W0 | ⬜ pending |
| 18-01-07 | 01 | 1 | HARD-02 | manual | Inspect workflow YAML for `timeout-minutes` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `.github/workflows/ci.yml` — the primary deliverable; covers all requirements
- [ ] Pre-flight local check: `npm run build && npm run test:lint` must exit 0

*Existing test infrastructure (Vitest configs, npm scripts) already covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Push triggers Actions run | CICD-01 | Requires actual GitHub push | Push commit to branch, verify run appears in Actions tab |
| PR triggers status check | CICD-01 | Requires actual PR creation | Open PR to main, verify status check appears |
| 4 named test steps visible | CICD-03 | Requires Actions UI inspection | View run details, confirm 4 individual test steps shown |
| Artifacts downloadable | PKG-03 | Requires Actions UI interaction | Download both ZIPs from completed run page |
| Test failure blocks artifacts | CICD-03 | Requires deliberate failure test | Introduce test failure, push, verify no artifacts produced |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 45s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

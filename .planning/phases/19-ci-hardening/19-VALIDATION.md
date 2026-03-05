---
phase: 19
slug: ci-hardening
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-04
---

# Phase 19 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (existing) |
| **Config file** | `vite.config.js` (existing) |
| **Quick run command** | `npm run test:src` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test:src`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 19-01-01 | 01 | 1 | HARD-03 | static | `grep -n 'permissions' .github/workflows/ci.yml` | N/A | ⬜ pending |
| 19-01-02 | 01 | 1 | HARD-01 | static | `grep -n 'concurrency' .github/workflows/ci.yml` | N/A | ⬜ pending |
| 19-01-03 | 01 | 1 | HARD-01 | manual | N/A (live GitHub Actions test) | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No new test files needed — changes are YAML-only.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Stale PR runs cancelled on new push | HARD-01 | Concurrency cancellation is GitHub-server-side; cannot be unit tested locally | 1. Open a PR branch. 2. Push commit A — observe run A starts. 3. Push commit B immediately — observe run A is cancelled, run B completes. |
| Main branch runs complete independently | HARD-01 | Requires live GitHub Actions environment | 1. Push commit A to main — observe run A starts. 2. Push commit B to main — observe run A continues to completion, run B starts separately. |
| Permissions declaration present | HARD-03 | Static YAML inspection | Verify `permissions: contents: read` appears at workflow top level with no broader grants in job or step blocks. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

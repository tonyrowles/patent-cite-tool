---
phase: 17
slug: cross-browser-validation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-04
---

# Phase 17 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.x |
| **Config file** | `vitest.config.js` (src/ existing), `vitest.config.chrome.js` (new), `vitest.config.firefox.js` (new) |
| **Quick run command** | `npx vitest run` |
| **Full suite command** | `npm test` (build + test:src + test:chrome + test:firefox + test:lint) |
| **Estimated runtime** | ~30-60 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green + human spot-check confirmation
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 17-01-01 | 01 | 1 | VALID-01 | integration | `npm run test:chrome` | ❌ W0 | ⬜ pending |
| 17-01-02 | 01 | 1 | VALID-01 | integration | `npm run test:firefox` | ❌ W0 | ⬜ pending |
| 17-01-03 | 01 | 1 | VALID-02 | smoke | `npm run test:lint` | ❌ W0 | ⬜ pending |
| 17-02-01 | 02 | 2 | VALID-03 | manual | `node scripts/spot-check.js` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/matching-exports.js` — ESM re-export of matchAndCite/normalizeText/formatCitation for dist/ test targets
- [ ] `vitest.config.chrome.js` — corpus config aliasing to dist/chrome/matching-exports.js
- [ ] `vitest.config.firefox.js` — corpus config aliasing to dist/firefox/matching-exports.js
- [ ] `scripts/spot-check.js` — prints expected citations for 5 representative patents with URLs
- [ ] `package.json` script additions: `test:chrome`, `test:firefox`, `test:lint`, update `test`

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Both extensions produce correct citations on real Google Patents pages | VALID-03 | Requires live browser interaction with actual Google Patents pages | Run `node scripts/spot-check.js` to get 5 patent URLs + expected citations. Load each in Chrome and Firefox, select highlighted text, confirm extension output matches expected. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

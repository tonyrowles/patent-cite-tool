---
phase: 15
slug: esbuild-build-pipeline
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-03
---

# Phase 15 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.x |
| **Config file** | `vitest.config.js` |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm test && node scripts/build.js`
- **Before `/gsd:verify-work`:** Full suite must be green + build succeeds + manual Chrome check
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | BUILD-01 | smoke | `node scripts/build.js && ls dist/chrome/content/content.js dist/chrome/background/service-worker.js` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | BUILD-02 | smoke | `ls dist/chrome/icons/ dist/chrome/lib/ dist/chrome/popup/popup.html` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | BUILD-03 | smoke | `node -e "const m=JSON.parse(require('fs').readFileSync('dist/chrome/manifest.json','utf8')); console.assert(m.content_scripts[0].js.length===1)"` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | BUILD-04 | manual | Manual: Load unpacked dist/chrome/ in Chrome | N/A | ⬜ pending |
| TBD | TBD | TBD | BUILD-05 | unit | `npm test` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `scripts/build.js` — build script itself (created in plan Wave 1)
- [ ] `src/manifest.firefox.json` — Firefox manifest (created in plan Wave 1)

*Existing Vitest infrastructure covers BUILD-05. BUILD-01 through BUILD-04 are verified by running the build script and loading the extension.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Built Chrome extension produces correct citations on Google Patents | BUILD-04 | Requires real Chrome browser + live page interaction | 1. Run `npm run build` 2. Open Chrome → Extensions → Load unpacked → dist/chrome/ 3. Navigate to a Google Patent 4. Select text containing a citation 5. Verify citation popup shows correct column:line format |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

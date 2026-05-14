---
phase: 26
slug: playwright-harness-scaffolding
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-14
---

# Phase 26 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright Test (`@playwright/test@1.60.0`) — new for this phase; coexists with existing Vitest |
| **Config file** | `tests/e2e/playwright.config.js` (new — Wave 0 installs) |
| **Quick run command** | `npm run e2e:smoke` |
| **Full suite command** | `npm run e2e:smoke` (Phase 26 has only the smoke spec; full 76-case replay is Phase 27) |
| **Estimated runtime** | ~30 seconds (build ~10s + Playwright launch ~10s + one Google Patents nav ~5s + assertions ~5s) |

---

## Sampling Rate

- **After every task commit:** Run `npm run build && npm run test:src` (existing unit tests must stay green — HOOK-01 source change cannot regress unit coverage)
- **After Wave 1 complete:** Run `npm run e2e:smoke` against fresh `dist/chrome/`
- **Before `/gsd-verify-work`:** `npm run test` (full unit suite including chrome/firefox/lint) green + `npm run e2e:smoke` green
- **Max feedback latency:** 30 seconds for unit; 30 seconds for e2e smoke

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 26-01-01 | 01 | 1 | (infra) | install verify | `npx playwright --version` returns 1.60.0 | ⬜ pending |
| 26-01-02 | 01 | 1 | HOOK-01 | unit | `npm run test:src` exits 0 AND `grep -c 'pct-citation-host\|pct-citation-pill' src/content/citation-ui.js` returns 2 | ⬜ pending |
| 26-01-03 | 01 | 1 | (infra) | static | `grep -q 'tests/e2e/artifacts/' .gitignore && grep -q 'playwright-report/' .gitignore && grep -q 'test-results/' .gitignore` | ⬜ pending |
| 26-02-01 | 02 | 1 | HARN-05 (lib) | static | `test -f tests/e2e/lib/extension-loader.js && test -f tests/e2e/lib/navigation.js && test -f tests/e2e/lib/observation.js && test -f tests/e2e/lib/artifacts.js && test -f tests/e2e/lib/selection.js` | ⬜ pending |
| 26-02-02 | 02 | 1 | HARN-03 (shadow shim) | static | `grep -q 'attachShadow' tests/e2e/shims/shadow-open.js` | ⬜ pending |
| 26-02-03 | 02 | 1 | HARN-04 (clipboard shim) | static | `grep -q '__lastCopiedText__' tests/e2e/shims/clipboard-observer.js` | ⬜ pending |
| 26-02-04 | 02 | 1 | (infra) | static | `node --check tests/e2e/playwright.config.js && grep -q 'channel:.\?.chromium' tests/e2e/playwright.config.js` | ⬜ pending |
| 26-03-01 | 03 | 2 | HARN-01, HARN-02 | e2e | `npm run e2e:smoke` exits 0 — proves persistent context + channel:'chromium' + SW readiness + extension load all work | ⬜ pending |
| 26-03-02 | 03 | 2 | HARN-03 | e2e | smoke spec assertion: creates ad-hoc closed shadow root via `attachShadow({mode:'closed'})`, reads its `.shadowRoot`, expects truthy — proves shim works | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `npm install --save-dev @playwright/test@1.60.0` — installs the test runner
- [ ] `npx playwright install chromium` — downloads Chromium browser binary (~150MB)
- [ ] `.gitignore` — adds `tests/e2e/artifacts/` and `.playwright/` (or wherever browsers cache locally)

*No existing infrastructure to reuse — Playwright is new to this project.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| HARN-04 silent-mode clipboard read in headless | HARN-04 | Phase 26's smoke does not exercise selection; full validation requires Phase 27's selection helper. Phase 26 verifies the shim *file exists and registers* but not its end-to-end clipboard read. | Validated end-to-end in Phase 27 via the first selection test that triggers Ctrl+C silent mode. |
| Real Google Patents nav with extension visible (visual check) | HARN-01 | Smoke runs headless; humans should sanity-check the visible UI loads once. | After Wave 2, run `npx playwright test --headed tests/e2e/specs/smoke.spec.js` and visually confirm the extension's floating button or citation UI appears on the test patent page. Optional. |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies (HARN-04 deferred to Phase 27 — documented above)
- [ ] Sampling continuity: each task in Wave 1 has a static or unit-test verify
- [ ] Wave 0 covers Playwright install + browser install + .gitignore
- [ ] No watch-mode flags (smoke runs once, exits)
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` will be set in frontmatter after planner aligns task IDs with this map

**Approval:** pending

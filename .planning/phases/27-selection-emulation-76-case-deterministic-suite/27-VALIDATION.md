---
phase: 27
slug: selection-emulation-76-case-deterministic-suite
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-14
---

# Phase 27 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright Test 1.60.0 (already installed Phase 26) + Vitest 3.0 (existing — for selection normalizer unit tests) |
| **Config file** | `tests/e2e/playwright.config.js` (existing — no changes) |
| **Quick run command** | `npm run e2e:smoke` (5 @smoke cases + Phase 26 infra smoke, ~30s) |
| **Full suite command** | `npm run e2e:regression` (76 cases, sync mode, ~10-15min) |
| **Silent mode command** | `npm run e2e:silent` (2 cases, ~15s) |
| **Selection unit tests** | `npm run test:src -- tests/unit/selection-text.test.js` (~1s — vitest, validates the whitespace-collapsing substring matcher against PDF↔HTML text divergence) |
| **Estimated full runtime** | ~15 minutes for full regression on a developer machine; cron variability TBD in Phase 29 |

---

## Sampling Rate

- **After every task commit:** `npm run test:src` (216+ tests must stay green, especially new selection-text unit test).
- **After Wave 1 (lib + settings + selection unit tests):** `npm run e2e:smoke` (5 @smoke cases + Phase 26 infra smoke).
- **After Wave 2 (regression spec + diagnostics + silent spec):** `npm run e2e:regression && npm run e2e:silent`.
- **Before `/gsd-verify-work`:** `npm run test` (full unit suite) green + `npm run e2e:regression` green + `npm run e2e:silent` green.
- **Max feedback latency:** ~30s for unit, ~30s for smoke, ~15min for full regression.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 27-01-01 | 01 | 1 | SEL-01 (selectText) | static | `grep -q 'export async function selectText' tests/e2e/lib/selection.js && grep -q 'TreeWalker\|createTreeWalker' tests/e2e/lib/selection.js && grep -q 'getSelection().addRange\|sel.addRange' tests/e2e/lib/selection.js` | ⬜ pending |
| 27-01-02 | 01 | 1 | SEL-01 (normalizer) | unit (vitest) | `npm run test:src -- tests/unit/selection-text.test.js` exits 0; 5+ test cases covering PDF↔HTML divergence ('proliferation-inducing', hyphen wrap, multi-space) | ⬜ pending |
| 27-02-01 | 02 | 1 | (settings helper) | static | `grep -q 'export.*setTriggerMode\|export.*async function setTriggerMode' tests/e2e/lib/settings.js && grep -q 'chrome.storage.sync.set' tests/e2e/lib/settings.js` | ⬜ pending |
| 27-02-02 | 02 | 1 | SEL-02 (getCitation) | static | `grep -q 'export.*function getCitation\|export.*async function getCitation' tests/e2e/lib/observation.js && grep -q "mode === 'auto'\|mode === 'silent'\|mode==='auto'\|mode==='silent'" tests/e2e/lib/observation.js && grep -q 'cite-conf-medium\|cite-conf-low' tests/e2e/lib/observation.js` | ⬜ pending |
| 27-02-03 | 02 | 1 | DIAG-01, DIAG-02 | static | `grep -q 'export async function captureScreenshot\|export.*captureScreenshot' tests/e2e/lib/artifacts.js && grep -q 'fullPage:.*true\|fullPage: true' tests/e2e/lib/artifacts.js && grep -q 'captureDomSnapshot' tests/e2e/lib/artifacts.js && grep -q 'page.content()\|writeFileSync.*\\.html' tests/e2e/lib/artifacts.js` | ⬜ pending |
| 27-03-01 | 03 | 2 | SEL-03 (regression spec) | static | `test -f tests/e2e/specs/regression.spec.js && grep -q 'TEST_CASES\|test-cases.js' tests/e2e/specs/regression.spec.js && grep -q 'baseline.json' tests/e2e/specs/regression.spec.js && grep -q "setTriggerMode" tests/e2e/specs/regression.spec.js` | ⬜ pending |
| 27-03-02 | 03 | 2 | SEL-04 (isolation) | static | `grep -q "loadExtension" tests/e2e/specs/regression.spec.js && grep -q "cleanup()" tests/e2e/specs/regression.spec.js` | ⬜ pending |
| 27-03-03 | 03 | 2 | DIAG-01, DIAG-02 | static | `grep -q "captureScreenshot\|captureDomSnapshot" tests/e2e/specs/regression.spec.js && grep -q "catch\|try.*finally" tests/e2e/specs/regression.spec.js` | ⬜ pending |
| 27-04-01 | 04 | 2 | (smoke tag + silent) | static | `grep -q '@smoke' tests/e2e/specs/smoke.spec.js && test -f tests/e2e/specs/silent.spec.js && grep -q 'setTriggerMode.*silent' tests/e2e/specs/silent.spec.js && grep -q 'readClipboardShim\|__lastCopiedText__' tests/e2e/specs/silent.spec.js` | ⬜ pending |
| 27-04-02 | 04 | 2 | (smoke tag adds 5 cases) | static | `grep -cE "@smoke" tests/e2e/specs/regression.spec.js` returns ≥ 5 | ⬜ pending |
| 27-05-01 | 05 | 3 | (e2e:regression green) | e2e | `npm run e2e:regression` exits 0 — proves all 76 cases pass sync-mode round-trip vs golden baseline | ⬜ pending |
| 27-05-02 | 05 | 3 | HARN-04 e2e | e2e | `npm run e2e:silent` exits 0 — proves silent-mode Ctrl+C clipboard read end-to-end | ⬜ pending |
| 27-05-03 | 05 | 3 | (smoke still green) | e2e | `npm run e2e:smoke` exits 0 — proves @smoke subset selection works without regression |  ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/selection-text.test.js` — new vitest file validating the whitespace-normalizing substring resolver (Phase 27 task 01-02 owns).
- [ ] No new dependencies (Playwright + Vitest already installed Phase 26).

*All other infrastructure (Playwright runner, lib/ scaffolding, shims) reused from Phase 26.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| CAPTCHA tolerance under burst load | (DOM drift) | Cannot reliably reproduce Google's CAPTCHA challenge in automated tests; the throttle setting is a best-practice estimate that needs real-world tuning. | After Wave 3, watch one full `npm run e2e:regression` run end-to-end. If 70+ pass, throttle is sufficient. If clusters fail, retune `THROTTLE_MS` in regression.spec.js. |
| Visual confirmation of citation pill | SEL-02 | Smoke runs headless. Optional visual sanity check that the pill renders the citation as expected. | Run `npx playwright test --headed --grep @smoke` once and visually verify the pill appears and shows the correct citation for at least one case. Optional. |
| Artifact contents are useful for debugging | DIAG-01, DIAG-02 | Cannot automate "is the screenshot useful." | After Wave 3, force one test failure (temporarily corrupt baseline.json[id].citation), confirm artifacts are written to `tests/e2e/artifacts/{runId}/{caseId}-{screenshot.png,dom.html}` and that the screenshot shows the highlighted selection + the pill. Restore baseline.json after. |

---

## Validation Sign-Off

- [ ] All tasks have automated verify (unit or e2e) or Wave 0 dependencies
- [ ] Sampling continuity: each task has at least a static or unit check
- [ ] Wave 0 covers the selection-text vitest scaffold
- [ ] No watch-mode flags (regression spec exits)
- [ ] Feedback latency < 15min for full; <30s for smoke
- [ ] `nyquist_compliant: true` flips after planner aligns task IDs with this map

**Approval:** pending

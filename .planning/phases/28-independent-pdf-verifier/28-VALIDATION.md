---
phase: 28
slug: independent-pdf-verifier
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-15
---

# Phase 28 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright Test 1.60.0 (existing) + Vitest 3.0 (existing — for verifier unit tests) |
| **Config file** | `tests/e2e/playwright.config.js` (existing, no changes) + new `eslint.config.js` |
| **Quick run command** | `npm run e2e:smoke` (existing 5 cases + Phase 26 infra) — still must pass post-verifier-wiring |
| **Verifier calibration** | `npm run verify:calibrate` (new — runs verifier against 65 currently-passing cases; expects ≥95% Tier A/B/C pass rate) |
| **Full suite command** | `npm run e2e:regression` (existing — extended with verifier verdict per case) |
| **Lint command** | `npm run lint` (new — runs ESLint with no-restricted-imports rule; fails if verifier imports from src/) |
| **Unit tests** | `npm run test:src` (existing — must stay green; new tests cover verifier's tier matcher + column/line inference) |
| **Estimated runtime** | Calibration ~3-5 min (65 PDFs × ~3s); regression unchanged (~15 min); lint <1s |

---

## Sampling Rate

- **After every task commit:** `npm run test:src` (all existing tests + new verifier unit tests green)
- **After Wave 1 (verifier core lib):** `npm run verify:calibrate` — ≥95% Tier A/B/C pass rate
- **After Wave 2 (report + snippet + spec integration):** `npm run e2e:regression` produces report.json with verifier verdicts
- **After Wave 3 (ESLint + lint script):** `npm run lint` exits 0; intentional violation test fails as expected
- **Before `/gsd-verify-work`:** Full `npm run test` (unit + e2e + lint) green
- **Max feedback latency:** 5s for unit, 5min for calibration, 15min for regression

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 28-01-01 | 01 | 1 | (deps) | install | `node -e "console.log(require('./package.json').devDependencies['@napi-rs/canvas'])"` returns a non-caret version; `node -e "require('@napi-rs/canvas')"` exits 0 | ⬜ pending |
| 28-01-02 | 01 | 1 | VFY-01 (core verifier) | unit | `npm run test:src -- tests/unit/pdf-verifier.test.js` exits 0; covers tiered matcher + column/line inference with 5+ cases | ⬜ pending |
| 28-01-03 | 01 | 1 | VFY-03 (tier matcher) | unit | same test file — `expect(verifyMatch(needle, lineText, {tier:'A'}))` returns expected verdicts across all 4 tiers | ⬜ pending |
| 28-02-01 | 02 | 1 | RPT-01 (report.js) | static + unit | `grep -q 'export.*writeReport\|export.*appendCase' tests/e2e/lib/report.js && npm run test:src -- tests/unit/report.test.js` exits 0 | ⬜ pending |
| 28-02-02 | 02 | 1 | RPT-02 (taxonomy) | static | `grep -E "EXTENSION_NOT_LOADED|NO_CITATION_PRODUCED|WRONG_CITATION|UI_BROKEN|VERIFIER_DISAGREE|GOOGLE_DOM_DRIFT|USPTO_API_DRIFT|FLAKE" tests/e2e/lib/error-codes.js` returns all 8 strings | ⬜ pending |
| 28-03-01 | 03 | 2 | DIAG-03 (snippet) | static | `grep -q 'export.*renderPdfSnippet' tests/e2e/lib/pdf-snippet.js && grep -q '@napi-rs/canvas' tests/e2e/lib/pdf-snippet.js && grep -q 'sharp' tests/e2e/lib/pdf-snippet.js` | ⬜ pending |
| 28-03-02 | 03 | 2 | DIAG-03 (smoke) | functional | run renderer against US11427642 page containing line 26 — output PNG file size > 5KB | ⬜ pending |
| 28-04-01 | 04 | 2 | VFY-02 (independence) | lint | `npm run lint` exits 0 normally; intentionally adding `import 'src/shared/constants.js'` to pdf-verifier.js → `npm run lint` exits non-zero | ⬜ pending |
| 28-04-02 | 04 | 2 | (config) | static | `test -f eslint.config.js && grep -q 'no-restricted-imports' eslint.config.js && grep -q "src/" eslint.config.js` | ⬜ pending |
| 28-05-01 | 05 | 3 | VFY-01, VFY-03 (calibration) | e2e | `npm run verify:calibrate` reports ≥95% Tier A/B/C pass rate across the 65 currently-passing cases | ⬜ pending |
| 28-05-02 | 05 | 3 | RPT-01 (report generation) | e2e | `npm run e2e:smoke` produces `tests/e2e/artifacts/{run-id}/report.json` with valid top-level shape (run_id, summary, cases[]) | ⬜ pending |
| 28-05-03 | 05 | 3 | DIAG-03 (snippet on disagreement) | e2e | intentionally inject a baseline mismatch on one case; confirm `pdf-snippet.png` written to that case's artifact dir | ⬜ pending |
| 28-05-04 | 05 | 3 | (Phase 27 deferral adjudication) | e2e | re-enable 1+ of Phase 27's 10 TIMEOUT_PILL cases; verifier produces a clear verdict (pass or disagree) and the failure is properly classified | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `npm install --save-dev @napi-rs/canvas eslint` — installs canvas N-API binding + ESLint
- [ ] `npm install --save-dev eslint-config-globals` (or similar — verify what flat-config needs)
- [ ] `eslint.config.js` — new flat config with no-restricted-imports rule scoped to `tests/e2e/lib/pdf-verifier.js`
- [ ] `lint` npm script in package.json
- [ ] `verify:calibrate` npm script in package.json
- [ ] `tests/unit/pdf-verifier.test.js` — vitest harness for the verifier's pure functions

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| PDF snippet PNG is visually useful | DIAG-03 | Cannot automate "is the snippet readable / does it show the cited line". | After Wave 3, intentionally cause a verifier disagreement on one case, open the produced `pdf-snippet.png`, confirm the cited line is visible and centered. Optional. |
| Calibration assumption — ±2 line tolerance is correct | VFY-03 | The ≥95% number is the calibration gate; if calibration fails, the planner's hypothesis is wrong and human judgement decides whether to relax tolerance or fix matcher. | Run `verify:calibrate`; if pass rate < 95%, inspect failures by tier and decide ±N or normalize rules. |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: each Wave 1+2 task has a unit or static check
- [ ] Wave 0 covers @napi-rs/canvas + ESLint + scripts
- [ ] No watch-mode flags
- [ ] Feedback latency < 5 min for calibration
- [ ] `nyquist_compliant: true` after planner aligns task IDs with this map

**Approval:** pending

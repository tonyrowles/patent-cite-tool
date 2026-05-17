---
phase: 30
slug: worker-fault-injection
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-17
---

# Phase 30 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Derived from `30-RESEARCH.md` § Validation Architecture (Nyquist).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework (Worker)** | vitest@^4.1.0 + @cloudflare/vitest-pool-workers@0.16.6 (isolated per-worker package) |
| **Framework (E2E)** | @playwright/test@1.60.0 (existing root install) |
| **Config file (Worker)** | `worker/vitest.config.js` (Wave 0 gap) |
| **Config file (E2E)** | `tests/e2e/playwright.config.js` (exists, no changes) |
| **Quick run (Worker)** | `cd worker && npx vitest run tests/test-mode.test.js` |
| **Quick run (E2E)** | `npx playwright test --config tests/e2e/playwright.config.js specs/fault-injection.spec.js` |
| **Full suite** | `npm run test && cd worker && npx vitest run` |
| **Estimated runtime** | Worker test: ~2-5s · E2E fault-injection: ~30-60s |

---

## Sampling Rate

- **After every task commit:** Run the touched task's quick command
- **After every plan wave:** Both Worker test + fault-injection spec green
- **Before `/gsd-verify-work`:** Full suite green
- **Max feedback latency:** ~60s per task (E2E case) · ~5s for Worker test

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 30-01-* | 01 | 1 | INJ-01 | T-30-1 | KV write suppressed when `X-PCT-Test-Mode: true`; identical response body and status to non-test mode | integration | `cd worker && npx vitest run tests/test-mode.test.js` | ❌ W0 | ⬜ pending |
| 30-02-* | 02 | 2 | INJ-02 | — | Aborted Google PDF still produces an accurate citation via Worker/USPTO; route-callback canary asserts page.route fired | e2e | `npx playwright test --config tests/e2e/playwright.config.js specs/fault-injection.spec.js` | ❌ W0 | ⬜ pending |
| 30-03-* | 03 | 3 | INJ-02 | — | WORKER_FALLBACK_FAILED error class registered; nightly cron step invokes fault-injection spec and counts result in report.json | static | `grep -q "WORKER_FALLBACK_FAILED" tests/e2e/lib/error-codes.js && grep -q "fault-injection.spec.js" .github/workflows/e2e-nightly.yml` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `worker/vitest.config.js` — cloudflareTest() Vite plugin pointing at `wrangler.toml`
- [ ] `worker/tests/test-mode.test.js` — two-test Vitest spec: (a) with `X-PCT-Test-Mode: true` → KV stays empty (b) without header → KV gets the put
- [ ] `worker/package.json` update — adds `vitest@^4.1.0` + `@cloudflare/vitest-pool-workers@0.16.6` to devDependencies
- [ ] `worker/package-lock.json` — `cd worker && npm install` materializes lockfile
- [ ] `tests/e2e/specs/fault-injection.spec.js` — Playwright spec with route-abort + route-callback canary + golden + verifier assertions
- [ ] (optional) `tests/e2e/lib/worker-test-mode-route.js` — page.route helper that injects `X-PCT-Test-Mode: true` on outbound Worker requests (Claude's Discretion)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Production Worker KV cache shows no `test-` keys after CI runs | INJ-01 | Cannot assert against production KV from CI without binding; requires occasional manual `wrangler kv:key list` audit | After a week of CI runs: `cd worker && npx wrangler kv:key list --binding PATENT_CACHE \| grep test-` should be empty |
| Fault-injection spec runs on every nightly cron tick | INJ-02 | Cron is real-time-bound; only visible by inspecting workflow run history | Check `gh run list --workflow=e2e-nightly.yml --limit 7` after a week and confirm each run executed the fault-injection step |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify commands OR Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING test files + the worker/ package install
- [ ] No watch-mode flags in automated commands
- [ ] Feedback latency < 60s per task
- [ ] `nyquist_compliant: true` set in frontmatter after Wave 0 task complete

**Approval:** pending

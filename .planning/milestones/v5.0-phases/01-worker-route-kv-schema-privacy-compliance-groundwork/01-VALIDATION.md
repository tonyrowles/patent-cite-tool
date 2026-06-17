---
phase: 1
slug: worker-route-kv-schema-privacy-compliance-groundwork
status: ready
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-12
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.7 via `@cloudflare/vitest-pool-workers` (Worker tests); `node -e` assertions + `grep` for docs/manifest |
| **Config file** | `worker/vitest.config.js` (extended Wave 0 to add `DISCORD_WEBHOOK_URL` binding) |
| **Quick run command** | `cd worker && npm test` |
| **Full suite command** | `cd worker && npm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd worker && npm test`
- **After every plan wave:** Run `cd worker && npm test`
- **Before `/gsd:verify-work`:** Full suite green + webhook grep guard returns 0 + `git check-ignore worker/.dev.vars` confirms ignored + manifest assertion passes + `npx web-ext lint` (if Firefox build available)
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-01-00 | 01 | 1 | XPORT-02 | — | KV namespace + Discord secret provisioned out-of-band | manual checkpoint | operator runs `wrangler kv namespace create` + `wrangler secret put` | N/A | ⬜ pending |
| 01-01-01 | 01 | 1 | XPORT-01, PAY-01..04, LIMIT-01, LIMIT-02 | T-1-01, T-1-02, T-1-03, T-1-SC | IP never in KV record; webhook URL server-side; 64KB cap; body-size + field validation | integration | `cd worker && npm test` | ❌ W0 | ⬜ pending |
| 01-01-02 | 01 | 1 | XPORT-02, XPORT-03, XPORT-04 | T-1-02 | webhook URL only in Worker secret; `.dev.vars` gitignored; grep guard 0 results | static-grep + verify | `cd worker && npm test` + grep guard | ❌ W0 | ⬜ pending |
| 01-02-01 | 02 | 1 | PRIV-01, PRIV-02, PRIV-05 | T-1-04 | manifest declares actual data collection; web-ext lint clean | static-grep + lint | `node -e` manifest assert + `npx web-ext lint` | ❌ W0 | ⬜ pending |
| 01-02-02 | 02 | 1 | PRIV-03, PRIV-04 | — | privacy policy + store listing match transmitted payload | static-grep | `grep` for required sections | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `worker/tests/report-route.test.js` — covers XPORT-01, PAY-01, PAY-02, PAY-03, PAY-04, LIMIT-01, LIMIT-02 (created in Plan 01 Task 1; first test is RED-first failing assertion)
- [ ] `worker/vitest.config.js` — add `DISCORD_WEBHOOK_URL: 'https://discord.example.com/test-webhook'` to `miniflare.bindings` (Plan 01 Task 1)
- [ ] `worker/wrangler.toml` — `BUG_REPORTS` namespace ID present (real ID from operator checkpoint, NOT placeholder — Miniflare needs it to auto-wire the binding)

*Existing `test-mode.test.js` covers INJ-01; no changes needed there. No framework install needed — vitest already installed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `wrangler kv namespace create "BUG_REPORTS"` returns a namespace ID | XPORT-02 | Requires authenticated Cloudflare account; no CLI fallback in CI | Operator runs `cd worker && npx wrangler kv namespace create "BUG_REPORTS"`, pastes ID into checkpoint |
| `wrangler secret put DISCORD_WEBHOOK_URL` sets production secret | XPORT-03 | Requires authenticated Cloudflare account + a real Discord webhook URL | Operator runs `cd worker && npx wrangler secret put DISCORD_WEBHOOK_URL` and pastes the webhook URL when prompted |
| `npx web-ext lint dist/firefox/` exits 0 | PRIV-05 | Requires a built Firefox bundle in `dist/firefox/`; build pipeline may not run in planning context | Operator builds Firefox bundle then runs `npx web-ext lint dist/firefox/`; if no build available, defer to Phase 5 UAT-04 |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 20s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** ready

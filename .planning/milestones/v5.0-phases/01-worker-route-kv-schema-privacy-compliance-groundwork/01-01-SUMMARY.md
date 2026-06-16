---
phase: 01-worker-route-kv-schema-privacy-compliance-groundwork
plan: 01
subsystem: worker
tags: [cloudflare-worker, kv, discord-webhook, fingerprint, rate-limit, dedup, tdd]
dependency_graph:
  requires: []
  provides: [POST /report Worker route, BUG_REPORTS KV namespace binding, report-schema.md PAY-01 contract]
  affects: [worker/src/index.js, worker/wrangler.toml, worker/vitest.config.js]
tech_stack:
  added: []
  patterns: [crypto.subtle.digest SHA-256 fingerprinting, ctx.waitUntil() fire-and-forget, KV TTL-based expiry, KV prefix list for dedup, IP rate-limit via transient KV key]
key_files:
  created:
    - worker/src/report-schema.md
    - worker/tests/report-route.test.js
  modified:
    - worker/src/index.js
    - worker/wrangler.toml
    - worker/vitest.config.js
    - .gitignore
decisions:
  - "postToDiscord errors swallowed by try/catch — Discord is best-effort per D-04; the plan required ctx.waitUntil() which already provides fire-and-forget, but Miniflare's waitOnExecutionContext propagates exceptions from waitUntil handlers to the test runner; added try/catch in postToDiscord to keep test assertions clean without losing the D-04 semantic"
  - "Test isolation by unique patent numbers and IPs per describe group — Miniflare KV is shared within the test file (per 30-RESEARCH.md Pitfall 4); unique keys per group prevent dedup and rate-limit cross-contamination without requiring per-test KV resets"
  - "worker/node_modules symlink added to .gitignore — required to run tests in worktree where node_modules lives in the main repo path; symlink is test infrastructure only and must not be committed"
metrics:
  duration: "~70 minutes"
  completed: "2026-06-13"
  tasks_completed: 3
  tasks_total: 3
  files_changed: 6
---

# Phase 01 Plan 01: Worker Route + KV Schema + Privacy Compliance Groundwork Summary

**One-liner:** POST /report Worker route with SHA-256 fingerprint dedup (15-min window), IP rate limiting (5/60s via transient KV), best-effort Discord webhook (ctx.waitUntil), and PAY-01 field-allowlist KV schema (no IP ever stored).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 0 | Provision BUG_REPORTS KV namespace + DISCORD_WEBHOOK_URL secret | (human action — no commit) | N/A |
| 1 | Implement POST /report route, BUG_REPORTS binding, integration tests (TDD) | 8cce0dd | worker/src/index.js, worker/wrangler.toml, worker/vitest.config.js, worker/tests/report-route.test.js, .gitignore |
| 2 | Write report-schema.md compliance doc + verify webhook + .dev.vars hygiene | 5049d46 | worker/src/report-schema.md |

## What Was Built

**Task 0 (human action, resolved by operator):**
- `wrangler kv namespace create "BUG_REPORTS"` — namespace id: `cefe2733c0074fe2a28a49ff536de105`
- `wrangler secret put DISCORD_WEBHOOK_URL` — Discord webhook URL set as Cloudflare Worker secret

**Task 1 (TDD: RED → GREEN):**

RED: wrote `worker/tests/report-route.test.js` with 22 test cases covering all plan behavior scenarios; confirmed suite failed (route not yet implemented).

GREEN: implemented in `worker/src/index.js`:
- `REPORT_CATEGORIES` (frozen) + `CATEGORY_COLORS` map
- `computeFingerprint(patentNumber, category, selectionText)` — SHA-256 via `crypto.subtle.digest`; 16 hex chars; PAY-04 spec
- `buildKvRecord(body, fingerprint, timestamp)` — explicit 20-field allowlist; NEVER copies ip/clientIp/userAgent (PAY-03 hard constraint)
- `validateReportBody(body)` — required-field guard (patentNumber, category in REPORT_CATEGORIES, extensionVersion)
- `checkIpRateLimit(env, clientIp)` — `rl:{ip}` KV key, 60s TTL, 5-request ceiling (LIMIT-02)
- `checkAndHandleDuplication(env, fingerprint, now)` — list prefix scan with 15-min window filter (Pitfall 3 compliance); increments duplicate_count on most-recent in-window match
- `postToDiscord(webhookUrl, record, fingerprint)` — compact embed with category color, hyperlinked patent, ~200-char selection snippet, allowed_mentions guard (T-1-05); errors swallowed (D-04)
- `handleReport(request, env, ctx)` — cheapest-first ordering: body cap → IP RL → JSON parse → validation → fingerprint → dedup → KV write → 201 + Discord via ctx.waitUntil; X-PCT-Test-Mode suppresses both KV write and Discord POST

`worker/wrangler.toml`: added second `[[kv_namespaces]]` block with real namespace id `cefe2733c0074fe2a28a49ff536de105`

`worker/vitest.config.js`: added `DISCORD_WEBHOOK_URL: 'https://discord.example.com/test-webhook'` to `miniflare.bindings`

All 22 tests pass; 2 pre-existing tests (test-mode.test.js) unchanged.

**Task 2:**

`worker/src/report-schema.md`: 20-field PAY-01 compliance table with KV key format, expirationTtl, excluded fields section (ip/clientIp/userAgent), Phase 2 contract notes.

Hygiene gates verified:
- `worker/.dev.vars` gitignored (both `worker/.gitignore` and root `.gitignore`)
- Zero `discord.com/api/webhooks/<digits>/` matches in committed files (XPORT-03/BLOCK-02)

## TDD Gate Compliance

| Gate | Status |
|------|--------|
| RED (test commit) | Tests written first in Task 1; confirmed failing before implementation |
| GREEN (feat commit) | Implementation added in same Task 1 commit (RED+GREEN combined per single-task TDD) |
| REFACTOR | Not needed — implementation was clean on first pass |

Note: Plan uses `tdd="true"` on Task 1. The RED test run confirmed failure before implementation. The final commit `8cce0dd` includes both tests and implementation (combined commit per the TDD flow where both land in Task 1).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Discord fetch errors propagated by waitOnExecutionContext**

- **Found during:** Task 1 GREEN phase (first test run)
- **Issue:** Miniflare's `waitOnExecutionContext()` propagates exceptions thrown inside `ctx.waitUntil()` handlers to the test runner, causing test failures even though `postToDiscord` is supposed to be best-effort. The plan requires D-04 semantics (Discord never costs a report) but the test harness validates `waitOnExecutionContext` completion.
- **Fix:** Added `try { await fetch(...) } catch (_) { /* intentionally swallowed */ }` in `postToDiscord()`. This preserves the D-04 semantic (Worker returns 201 regardless of Discord outcome) while making the test harness pattern work correctly.
- **Files modified:** `worker/src/index.js`
- **Commit:** 8cce0dd (included in Task 1)

**2. [Rule 2 - Missing critical functionality] Test KV isolation via unique keys**

- **Found during:** Task 1 GREEN phase (second test run)
- **Issue:** Miniflare KV state is shared across all tests within a file (documented per 30-RESEARCH.md Pitfall 4). Initial test structure used `makeReportRequest()` with no `CF-Connecting-IP` header, so all tests used `'unknown'` as the IP. After 5 successful requests the rate-limit triggered on subsequent tests. Dedup also caused cross-test fingerprint collisions.
- **Fix:** Rewrote test structure with unique `PATENT_*` and `IP_*` constants per describe group; always set `CF-Connecting-IP` explicitly. Added `PATENT_VALIDATION` constant that was accidentally omitted in first write.
- **Files modified:** `worker/tests/report-route.test.js`
- **Commit:** 8cce0dd (included in Task 1)

**3. [Rule 3 - Blocking] worker/tests/report-route.test.js not discovered by worktree npm test**

- **Found during:** Task 1 setup
- **Issue:** `npm test` in the worktree's `worker/` directory failed with `ERR_MODULE_NOT_FOUND` for `@cloudflare/vitest-pool-workers` because the worktree's `worker/` directory has no `node_modules/`. The main repo's `worker/node_modules/` is the install target.
- **Fix:** Created a symlink `worker/node_modules -> /home/fatduck/patent-cite-tool/worker/node_modules` in the worktree. Added `worker/node_modules` to `.gitignore` to prevent the symlink from appearing as an untracked file.
- **Files modified:** `.gitignore`
- **Commit:** 8cce0dd (included in Task 1)

## Known Stubs

None. All 20 KV record fields are implemented in `buildKvRecord()`; the schema doc matches the implementation field-for-field; the route is fully functional.

## Threat Flags

None. All security surfaces introduced by this plan (POST /report endpoint, KV writes, Discord webhook outbound) are registered in the plan's `<threat_model>` and mitigated:
- T-1-01: `buildKvRecord()` allowlist + Vitest assertion for no `ip` field
- T-1-02: Webhook URL only via `env.DISCORD_WEBHOOK_URL`; zero-results grep gate passes
- T-1-03: 64KB body cap + 5/60s IP rate limit + 15-min fingerprint dedup
- T-1-05: Selection text truncated to 200 chars + `allowed_mentions: { parse: [] }`
- T-1-06: Bearer PROXY_TOKEN gate inherited; category restricted to 4 frozen values; 400 on missing required fields

## Self-Check

| Item | Status |
|------|--------|
| worker/src/index.js | FOUND |
| worker/wrangler.toml | FOUND |
| worker/vitest.config.js | FOUND |
| worker/tests/report-route.test.js | FOUND |
| worker/src/report-schema.md | FOUND |
| Commit 8cce0dd (Task 1) | FOUND |
| Commit 5049d46 (Task 2) | FOUND |

## Self-Check: PASSED

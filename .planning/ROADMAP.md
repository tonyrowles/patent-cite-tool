# Roadmap: v5.0 Bug Report Feature

**Defined:** 2026-06-12
**Granularity:** standard
**Phase Numbering:** RESET for v5.0 — starts at Phase 1. v4.3 paused phases (61-67) archived at `.planning/milestones/v4.3-phases-paused/` (read-only during v5.0). v5.1 resumes at whatever number is natural after v5.0 closes.

## Milestone Overview

**Core Value:** Highlight text on Google Patents, get an accurate citation reference instantly — no PDF downloading, no manual counting.

**Goal:** Give extension users a low-friction in-product affordance to report citation failures, routing rich auto-captured diagnostic bundles to a private Cloudflare-backed observability pipeline (KV durable + Discord notify) for maintainer triage — establishing the inbound signal channel that v5.1's resumed auto-fix work will eventually ingest.

**Definition of Done:**

- End-user can submit a report from the in-citation UI; report lands in `BUG_REPORTS` KV durable storage AND fires a Discord webhook notification
- Live UAT against a real failed-citation scenario PROVEN before milestone close (UAT-01 through UAT-06)
- Zero new npm dependencies (sixth consecutive milestone)
- `assertTripleGate` body byte-unchanged (v4.0/v4.3 trust invariant continues)
- v40-auto-fix CI workflow stays `workflow_dispatch:` only throughout v5.0 (commit d8d54c4)
- Firefox AMO `data_collection_permissions` declaration updated; `web-ext lint` zero warnings; privacy policy updated
- Discord webhook URL never present in any committed file

**Coverage:** 45/45 v1 requirements mapped to 5 phases. Zero orphans.

## Phases

- [x] **Phase 1: Worker Route + KV Schema + Privacy Compliance Groundwork** - New `POST /report` Cloudflare Worker route, `BUG_REPORTS` KV namespace, server-side rate-limit + fingerprint dedup, and all store-submission compliance gates (privacy policy, manifest `data_collection_permissions`, webhook URL as server-side secret) (completed 2026-06-13)
- [x] **Phase 2: Shared Constants + Pure Payload Builder** - `src/shared/constants.js` additions and new `src/shared/report-payload-builder.js` pure function establish the payload schema contract between all extension surfaces and the Worker; Vitest-pinned before any UI work (completed 2026-06-13)
- [ ] **Phase 3: Background Submission Handler + Rate Limit + Retry Queue** - Extension-side transport layer: `MSG.SUBMIT_REPORT` handlers in Chrome SW + Firefox background, client-side sliding-window rate limit, disk-first retry queue with exponential backoff; full end-to-end submission path testable without UI
- [ ] **Phase 4: Report Dialog UI + Citation-UI Wiring** - Shadow DOM report dialog, Report button in citation popup, auto-surfacing on failure/yellow-confidence/Worker-error, error log ring buffer, DOM/PDF diagnostic enrichment
- [ ] **Phase 5: Options Page Debug Mode + Popup Fallback + Live UAT** - Debug Mode options toggle, popup "Report a problem" fallback, options page report section; milestone close with live UAT-01..06 DoD evidence

## Phase Details

### Phase 1: Worker Route + KV Schema + Privacy Compliance Groundwork
**Goal**: The `POST /report` Cloudflare Worker route, `BUG_REPORTS` KV namespace, server-side fingerprint dedup + IP-keyed rate limit, and all store-submission compliance gates ship together so no compliant extension release can be made without them — blocking gates BLOCK-01 (privacy compliance), BLOCK-02 (webhook URL hygiene), BLOCK-03 (IP-not-in-KV) are all resolved here.
**Depends on**: Nothing (first phase; entirely server-side and docs-side; no extension build changes required)
**Requirements**: XPORT-01, XPORT-02, XPORT-03, XPORT-04, PAY-01, PAY-02, PAY-03, PAY-04, PRIV-01, PRIV-02, PRIV-03, PRIV-04, PRIV-05, LIMIT-01, LIMIT-02
**Success Criteria** (what must be TRUE):
  1. Operator can `curl -X POST https://pct.tonyrowles.com/report` with a valid JSON body and observe: (a) an HTTP 201 response, (b) a new KV record under `report:{fingerprint}:{timestamp}` in the `BUG_REPORTS` namespace with `expirationTtl` of 90 days, (c) a Discord webhook notification in the target channel — the KV record contains NO `ip` or `clientIp` field and the Discord notification URL is not visible in any committed file
  2. A second identical submission within 15 minutes returns HTTP 200 (or 409) and increments `duplicate_count` on the existing KV record without creating a new record; the Discord notification is suppressed for the duplicate
  3. A sixth submission from the same IP within 60 seconds returns HTTP 429 with a `Retry-After` header; the IP appears only in the transient `rl:{ip}` KV key, not in any stored report record
  4. `web-ext lint` against `dist/firefox/` exits 0 with zero AMO-blocking warnings after the `data_collection_permissions` update to `manifest.firefox.json`; the privacy policy at the canonical URL includes a "Bug Report Submission" section describing the payload field-by-field
  5. `wrangler secret put DISCORD_WEBHOOK_URL` is the only mechanism that sets the webhook URL; `grep -r 'discord.com/api/webhooks' .` (excluding `.git/`) returns zero results across the entire repo
**Plans**: 3 plans
- [x] 01-01-PLAN.md — POST /report Worker route, BUG_REPORTS KV namespace, fingerprint dedup + IP rate limit, Discord webhook, report-schema.md (XPORT-01..04, PAY-01..04, LIMIT-01/02)
- [x] 01-02-PLAN.md — Privacy compliance gates: Firefox manifest data_collection_permissions, privacy policy Bug Report section, store-listing data-use update (PRIV-01..05)
- [x] 01-03-PLAN.md — Gap closure: reconcile store-listing CWS declaration (CR-02) + privacy policy collection/sharing claims (WR-07/08); fix duplicate_count off-by-one + falsy-zero coercion (WR-01/03) (PRIV-03, PRIV-04, LIMIT-01)
**UI hint**: no

### Phase 2: Shared Constants + Pure Payload Builder
**Goal**: `src/shared/constants.js` additions and the new `src/shared/report-payload-builder.js` pure-function module establish the canonical payload schema contract — Vitest-pinned for schema conformance, [Remove selection text] toggle correctness, and fingerprint reproducibility — before any background or UI code depends on them.
**Depends on**: Phase 1 (KV schema design locked; payload field allowlist defined in `worker/src/report-schema.md` is the input)
**Requirements**: PAY-05, PAY-06, PAY-07
**Success Criteria** (what must be TRUE):
  1. `npm test` passes with new Vitest cases confirming `buildReportPayload()` output contains only fields from the PAY-01 allowlist — a test that adds an extra field to the input does NOT propagate that field to the output
  2. When `includeSelectionText: false` is passed, the `selectionText` field is absent (not `null`, not `""`, but entirely absent) from the returned payload object; when `true`, it is present
  3. Two calls to `buildReportPayload()` with identical inputs produce byte-identical JSON serialization (fingerprint reproducibility confirmed across runs)
  4. `REPORT_CATEGORIES`, `MSG.SUBMIT_REPORT`, and `WORKER_REPORT_URL` are importable from `src/shared/constants.js` and the constants module contains zero `chrome.*` calls (confirmed by static-grep Vitest assertion)
**Plans**: 1 plan
- [x] 02-01-PLAN.md — Extend constants.js (MSG.SUBMIT_REPORT, frozen REPORT_CATEGORIES, WORKER_REPORT_URL) + new pure report-payload-builder.js + Vitest suite pinning all 4 Success Criteria (PAY-05, PAY-06, PAY-07)
**UI hint**: no

### Phase 3: Background Submission Handler + Rate Limit + Retry Queue
**Goal**: Chrome service worker and Firefox background script both handle `MSG.SUBMIT_REPORT` with an identical dispatch shape, enforcing client-side sliding-window rate limiting and disk-first retry queue persistence — so the full submission path from content script through Worker is testable end-to-end without any UI.
**Depends on**: Phase 1 (Worker endpoint live), Phase 2 (MSG constants and payload builder available)
**Requirements**: XPORT-05, XPORT-06, LIMIT-03, QUEUE-01, QUEUE-02, QUEUE-03, QUEUE-04
**Success Criteria** (what must be TRUE):
  1. A `chrome.runtime.sendMessage({ type: MSG.SUBMIT_REPORT, payload })` call from a content script context results in a `fetch` POST to `WORKER_REPORT_URL` from the background context — `grep -r "fetch(WORKER_REPORT_URL" src/content/` returns zero results (XPORT-06 static-grep guard Vitest assertion passes)
  2. The 5th submission within a 10-minute window succeeds; the 6th is blocked with a toast notification ("Too many reports — please wait a few minutes") and no Worker invocation occurs; a 7th submission 10 minutes after the first succeeds (window pruning correct)
  3. A payload written to `chrome.storage.local reportQueue` before the fetch attempt is present in storage if the fetch throws; it is removed atomically on a 201 success response — simulating Chrome MV3 service-worker termination (by manually stopping + restarting the SW) leaves the queued report intact and retried on next `onStartup`
  4. An HTTP 4xx response (except 429) permanently drops the queue entry without retry; an HTTP 5xx retries up to 3 times with exponential backoff (2s / 8s / 30s); after 3 failures the entry is dropped silently; a 429 retries with the same backoff
**Plans**: 3 plans
- [x] 03-01-PLAN.md — shared report-transport.js helper: rate-limit + disk-first queue + retry/backoff + drain + return contract (XPORT-05, LIMIT-03, QUEUE-01..04)
- [ ] 03-02-PLAN.md — per-target Vitest suites (chrome + firefox) covering SC1-SC4 incl. XPORT-06 static-grep guard + simulated SW termination; vitest.config include wiring (XPORT-06, QUEUE-01..04)
- [ ] 03-03-PLAN.md — wire identical SUBMIT_REPORT branch + onStartup/onInstalled/opportunistic drain into service-worker.js + firefox/background.js (XPORT-05, XPORT-06)
**UI hint**: no

### Phase 4: Report Dialog UI + Citation-UI Wiring
**Goal**: The Shadow DOM report dialog, Report button in the citation popup, auto-surfacing logic on failure/yellow-confidence/Worker-error, error log ring buffer capture, and DOM/PDF diagnostic enrichment all land together so a user can trigger the full in-citation report flow from a real Google Patents page.
**Depends on**: Phase 2 (payload builder), Phase 3 (background submission handler)
**Requirements**: CAP-01, CAP-02, CAP-03, CAP-04, TRIG-01, TRIG-02, TRIG-03, TRIG-04, PAY-08, PAY-09
**Success Criteria** (what must be TRUE):
  1. On a no-match or error outcome, the Report button auto-surfaces in the citation popup with "No match found" pre-selected; on a yellow-confidence (Tier 5 / 0.85 cap) outcome, "Inaccurate citation" is pre-selected; on a Worker-fallback error, "Tool not working" is pre-selected; on a green high-confidence success, the Report button is NOT visible (TRIG-04 invariant)
  2. The expandable "What's included" panel renders the full to-be-submitted payload field-by-field before submission; the [Remove selection text] toggle, when activated, causes `selectionText` to be absent from the displayed preview and from the payload actually sent to the Worker — toggle state persists across dialog re-opens within the same install
  3. The dialog closes on Submit success (toast "Report sent — thank you" appears); Escape key, Cancel button, and click-outside all dismiss the dialog without submission; focus is trapped within the modal while open and restored to the trigger element on close
  4. The submitted payload includes `selected_node_xpath`, `scroll_y`, `viewport_width`, `viewport_height`, and `pdfParseStatus` fields populated from live page state; the `bugReportErrorBuffer` ring buffer (last 20 entries) is included in the payload when non-empty
**Plans**: TBD
**UI hint**: yes

### Phase 5: Options Page Debug Mode + Popup Fallback + Live UAT
**Goal**: Debug Mode options toggle, popup "Report a problem" fallback, and options page report section ship as secondary surfaces; the milestone closes with live UAT-01 through UAT-06 DoD evidence confirming the complete submission pipeline functions end-to-end across Chrome and Firefox.
**Depends on**: Phase 4 (report dialog module complete)
**Requirements**: DBG-01, DBG-02, CAP-05, CAP-06, UAT-01, UAT-02, UAT-03, UAT-04, UAT-05, UAT-06
**Success Criteria** (what must be TRUE):
  1. With Debug Mode OFF (default), Report button obeys TRIG-04 (not visible on green outcomes); with Debug Mode ON (options page toggle), Report button is visible on ALL citation outcomes including green — the content script reads the new value live without requiring extension reload (live read on each citation confirmed by toggling mid-session)
  2. Clicking "Report a problem" in the toolbar popup navigates to the options page at the `#report` anchor; the options page report section renders the full dialog using the same `report-dialog.js` module with `'page'` mode (no Shadow DOM), same payload-builder, same `MSG.SUBMIT_REPORT` flow
  3. Live end-to-end UAT-01: operator triggers a no-match or yellow-confidence outcome on Google Patents, submits with the test category and note "v5.0 UAT-01 smoke" — Discord webhook fires with rich-embed payload, `wrangler kv key get` retrieves the persisted KV record matching the PAY-01 schema, the record contains no `ip` field, and the Discord notification fingerprint matches the KV key fingerprint
  4. Live cross-browser UAT-05: same report flow works identically on Chrome (where the service worker may be terminated between events) and Firefox (event page); Chrome SW termination is simulated manually by stopping + restarting the SW with a report queued, confirming retry on next extension load
  5. Server-side dedup UAT-03: two submissions with identical fingerprint within 15 minutes produce exactly ONE KV record (with `duplicate_count: 2`) and ONE primary Discord notification; a third submission after 15 minutes creates a new record
**Plans**: TBD
**UI hint**: yes

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Worker Route + KV Schema + Privacy Compliance Groundwork | 3/3 | Complete   | 2026-06-13 |
| 2. Shared Constants + Pure Payload Builder | 1/1 | Complete   | 2026-06-13 |
| 3. Background Submission Handler + Rate Limit + Retry Queue | 1/3 | In Progress|  |
| 4. Report Dialog UI + Citation-UI Wiring | 0/TBD | Not started | - |
| 5. Options Page Debug Mode + Popup Fallback + Live UAT | 0/TBD | Not started | - |

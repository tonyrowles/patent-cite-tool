# Requirements: v5.0 Bug Report Feature

**Defined:** 2026-06-12
**Core Value:** Highlight text on Google Patents, get an accurate citation reference instantly — no PDF downloading, no manual counting.
**DoD:** End-user can submit a report from the in-citation UI; report lands in `BUG_REPORTS` KV durable storage AND fires a Discord webhook notification for maintainer observation; manual `gh issue create` is the only promotion path (v1 scope). Live UAT against a real failed-citation scenario PROVEN before milestone close. Zero new npm dependencies. CWS + AMO compliance metadata in place; privacy policy updated; webhook URL never present in shipped extension code.

## v1 Requirements (this milestone)

Phase numbering RESET via `--reset-phase-numbers`. v5.0 starts at Phase 1; v4.3 paused phases (61-67) archived at `.planning/milestones/v4.3-phases-paused/`.

### Worker Route + KV Schema + Privacy Compliance Groundwork (Phase 1, server-first foundation)

**Transport — Worker route:**

- [ ] **XPORT-01**: New `POST /report` route added to `worker/src/index.js` at ~line 253 (BEFORE the USPTO proxy fallthrough — ordering is load-bearing per STACK research); validates body schema, computes fingerprint, performs dedup lookup, writes to KV, posts to Discord webhook; returns `{ok: true, fingerprint, deduped: bool}` on success
- [ ] **XPORT-02**: `wrangler.toml` adds a new KV namespace binding `BUG_REPORTS` (separate from the existing patent-cache namespace — quota isolation per PITFALLS recommendation; prevents a report flood from competing with cache write quota)
- [ ] **XPORT-03**: `npx wrangler secret put DISCORD_WEBHOOK_URL` configured for production; Worker accesses webhook URL via `env.DISCORD_WEBHOOK_URL` only; **NEVER** present in extension code, in `wrangler.toml` plaintext, or in any committed file
- [ ] **XPORT-04**: `worker/.dev.vars` added to `.gitignore` (or confirmed already present) for local-dev webhook URL safety

**Payload — KV schema + fingerprint:**

- [ ] **PAY-01**: KV record schema is an **explicit field allowlist** (no `JSON.stringify(settings)` blob); the schema is documented in `worker/src/report-schema.md` as the compliance artifact; schema-conformance enforced by Vitest fixture pin
- [ ] **PAY-02**: KV record key format `report:{fingerprint}:{timestamp}` — fingerprint as prefix is REQUIRED so `list({ prefix: 'report:{fingerprint}:' })` can perform dedup lookups without scanning the full namespace; `expirationTtl: 7776000` (90 days)
- [ ] **PAY-03**: KV record schema has **NO** `ip`, `clientIp`, `userAgent`, or any IP-derived field; PITFALLS hard constraint — `CF-Connecting-IP` is GDPR personal data; cannot be retrofitted without schema migration
- [ ] **PAY-04**: Fingerprint algorithm — SHA-256 hex of `${patent#}|${category}|${selectionHash}` using native `crypto.subtle.digest('SHA-256', ...)`; selection hash is SHA-256 of normalized selection text (whitespace-collapsed, lowercased); no new dependencies

**Privacy — store-submission blocking gates:**

- [ ] **PRIV-01**: `src/manifest.firefox.json` `data_collection_permissions` updated — `required: ["technicalAndInteraction", "websiteActivity"]`, `optional: ["websiteContent"]`; selection text is user-controlled via the per-submission [Remove selection text] toggle (CAP-02); November 2025 AMO spec compliance
- [ ] **PRIV-02**: `src/manifest.json` (Chrome) — verified no required CWS manifest changes for data-collection (CWS uses store listing + privacy policy + in-product disclosure, not manifest field); store-listing draft text update tracked separately
- [ ] **PRIV-03**: `docs/privacy/index.html` updated with a "Bug Report Feature" section that documents (field-by-field) what's collected, 90-day retention, purpose (maintainer triage only), the per-submission opt-out for selection text, that the Discord notification + KV record are the only downstream destinations, and that no IP address is stored
- [ ] **PRIV-04**: CWS store-listing draft text amended to mention the bug-reporting capability and to link the updated privacy policy; submission text staged in `docs/store-listing.md` (or wherever current store text lives)
- [ ] **PRIV-05**: `web-ext lint` continues to pass with zero AMO-blocking warnings (existing FOX-06 invariant) after the manifest update

**Rate limit + server-side dedup (designed in Phase 1, exercised in Phase 3 UAT):**

- [ ] **LIMIT-01**: Server-side fingerprint dedup in KV — for each incoming report, `list({ prefix: 'report:{fingerprint}:' })` over a **15-minute window**; on hit, increment a `duplicate_count` field on the existing record instead of creating a new one; Discord webhook notification suppressed for duplicates (or sent as a thread reply if a thread already exists)
- [ ] **LIMIT-02**: Server-side IP-keyed transient rate limit using `CF-Connecting-IP` — KV key `rl:{ip}` with 60-second TTL and a 5-request ceiling; over-ceiling requests return HTTP 429; IP is used for the rate-limit key ONLY and never appears in any stored report record

### Shared Constants + Pure Payload Builder (Phase 2, schema contract)

**Payload — extension-side builder:**

- [ ] **PAY-05**: `src/shared/constants.js` additions — `MSG.SUBMIT_REPORT` message type, `REPORT_CATEGORIES = ['inaccurate_citation', 'no_match', 'tool_not_working', 'other']` (frozen), `WORKER_REPORT_URL = 'https://pct.tonyrowles.com/report'`; constants are the single source of truth shared by content script + background + options
- [ ] **PAY-06**: New `src/shared/report-payload-builder.js` — pure function `buildReportPayload({ context, category, note, settings, errors, includeSelectionText })` returns the allowlisted payload object matching the PAY-01 KV schema; mirrors the v3.1 `tests/e2e/lib/issue-payload-builder.js` pattern; ZERO `chrome.*` calls so it is directly Vitest-testable
- [ ] **PAY-07**: Vitest tests for `report-payload-builder.js` covering: schema-conformance (no extra fields beyond the PAY-01 allowlist), [Remove selection text] toggle correctness (omits `selectionText` field entirely when off), byte-stable output on identical inputs, fingerprint reproducibility across runs

### Background Submission Handler + Rate Limit + Retry Queue (Phase 3, transport layer)

**Transport — extension-side message passing:**

- [x] **XPORT-05**: Background handler for `MSG.SUBMIT_REPORT` added IDENTICALLY to `src/chrome/background/service-worker.js` AND `src/firefox/background.js` (same dispatch shape — no Chrome/Firefox divergence in the report pipeline); receives payload from content script, performs `fetch(WORKER_REPORT_URL, { method: 'POST', body: JSON.stringify(payload), headers: {'Content-Type':'application/json'} })`, returns `{ok, queued, fingerprint}` to the caller
- [x] **XPORT-06**: Content scripts NEVER make cross-origin POSTs directly (Chrome official-docs constraint cited in STACK research); all submissions route through background via `chrome.runtime.sendMessage`; Vitest static-grep guard asserts no `fetch(WORKER_REPORT_URL` literal in `src/content/` after compilation

**Limit — client-side sliding-window:**

- [x] **LIMIT-03**: Client-side sliding-window rate limit in `chrome.storage.local` — max 5 submissions per 10-minute rolling window per install; submission timestamps stored as an array under key `bugReportRateLimitWindow`; pruned on each new submit attempt; submit blocked with toast notification ("Too many reports in a short period — please wait a few minutes") when ceiling is reached

**Queue — disk-first retry persistence:**

- [x] **QUEUE-01**: Disk-first persistence — payload written to `chrome.storage.local` under `bugReportQueue` BEFORE the fetch attempt (survives Chrome MV3 service-worker termination which can happen in ~30s of inactivity; Firefox non-persistent event page also benefits); removed atomically on successful submit
- [x] **QUEUE-02**: Retry policy — max 3 attempts, exponential backoff (2s / 8s / 30s), 7-day TTL on queued reports, queue cap of 20 entries (drops oldest when full); retried on next extension load if queue is non-empty (via `chrome.runtime.onInstalled` / `chrome.runtime.onStartup`)
- [x] **QUEUE-03**: Non-retryable failure handling — 4xx responses (except 429 rate-limit) drop the queue entry without retry (the report is malformed and won't succeed); 429 retries with full backoff; 5xx retries with backoff; network errors retry
- [x] **QUEUE-04**: User-visible feedback — toast on successful submit ("Report sent — thank you"), toast on queued-for-retry ("Report saved — will retry when online"), no toast on permanent-drop (failure is rare and visible failure adds noise); toast styling reuses existing yellow/green confidence toast pattern

### Report Dialog UI + Citation-UI Wiring (Phase 4, user-facing capture)

**Capture — Shadow DOM dialog in citation popup:**

- [x] **CAP-01**: New `src/content/report-dialog.js` — Shadow DOM modal rendered inside the existing closed-shadow host from `citation-ui.js:getCitationHost()`; contents: 4-category radio picker (labels: "Inaccurate citation" / "No match found" / "Tool not working" / "Other"), optional free-text note (256-char limit with live counter), Submit + Cancel buttons, inline one-line privacy disclosure ("Includes patent #, your selection, URL, extension version — see what's sent")
- [x] **CAP-02**: Expandable "What's included" panel inside the dialog — renders the full to-be-submitted payload preview (field-by-field) AND a [Remove selection text] toggle that, when activated, sets `includeSelectionText: false` for the buildReportPayload call so `selectionText` is omitted entirely from the payload before submit; toggle state is sticky per install via `chrome.storage.local` key `reportDialogRemoveSelectionText`
- [x] **CAP-03**: Report button added to existing citation popup in `src/content/citation-ui.js` adjacent to the copy action; visually unobtrusive (icon-only, e.g., flag/megaphone glyph) with `title="Report a problem"` tooltip; category auto-selected based on the outcome that triggered the popup (no-match → "No match found"; yellow-confidence → "Inaccurate citation"; worker-fallback-error → "Tool not working")
- [x] **CAP-04**: Dialog UX — closes on Submit success (toast confirmation per QUEUE-04); Cancel button dismisses with no submission; Escape key dismisses; click-outside dismisses; tab order + ARIA labels for keyboard accessibility; focus trapped within the modal while open

**Trigger — auto-surfacing conditions:**

- [x] **TRIG-01**: Report button auto-surfaces on No-match / failure outcomes — when `matchAndCite` returns no match, USPTO fallback fails, or the extension throws an uncaught error inside the citation flow; auto-selects category "No match found" or "Tool not working" depending on which path failed
- [x] **TRIG-02**: Report button auto-surfaces on Yellow confidence outcomes — Tier 5 gutter-tolerant matches (0.85 confidence cap) AND any other yellow-tier outcome; piggy-backs on the same UI moment that already shows the yellow indicator; auto-selects "Inaccurate citation"
- [x] **TRIG-03**: Report button auto-surfaces on Worker-fallback errors — when USPTO Worker proxy returns 5xx or times out (caught at the existing fallback site); auto-selects "Tool not working"
- [x] **TRIG-04**: Report button does NOT auto-surface on Green / high-confidence successful citations; only available manually in this case via Debug Mode (DBG-01). Rationale: noise reduction; green-but-wrong is rare and the maintainer surfaces it via Debug Mode

**Payload — diagnostic enrichment:**

- [x] **PAY-08**: Error log ring buffer — last 20 console errors / extension-internal warnings captured to `chrome.storage.local` key `bugReportErrorBuffer` via a thin wrapper around `console.error` + `console.warn` in the content script + background; ring overwrites at 20; included in payload when present (PAY-06 reads the buffer)
- [x] **PAY-09**: DOM/PDF diagnostics — payload reuses the v3.1 `llm-report.json` schema field names where applicable (`selected_node_xpath`, `viewport_width`, `viewport_height`, `scroll_y`); new field `pdfParseStatus: 'success' | 'failed' | 'skipped' | 'cache-hit'` added; reused from existing capture sites in `src/content/` (do NOT re-derive these from scratch)

### Options Page Debug Mode + Popup Fallback (Phase 5, secondary surfaces)

**Debug Mode:**

- [ ] **DBG-01**: Options page adds `debugMode` checkbox (default: false) — follows the existing `includePatentNumber` checkbox + auto-save UI pattern; persisted to `chrome.storage.sync`; labeled "Debug Mode — always show Report button" with description: "Surfaces the Report button on every citation, including successful ones. Useful for catching confidently-wrong citations the tool didn't flag."
- [ ] **DBG-02**: When `debugMode === true` is read from `chrome.storage.sync` by the content script, the TRIG-04 "don't show on green" invariant relaxes — Report button shows on ALL citation outcomes; live read on each citation (no extension reload required to toggle)

**Capture — fallback surfaces:**

- [ ] **CAP-05**: Toolbar popup gains a "Report a problem" link (or button) — clicking it calls `chrome.runtime.openOptionsPage()` and the options page opens at the `#report` anchor (per Architecture research the options page uses `open_in_tab: true`, so this is a clean full-tab landing); rationale: the 280px popup is too narrow to host the full dialog without UX compromise
- [ ] **CAP-06**: Options page gains a dedicated Report section at the `#report` anchor — full report dialog rendered inline (page DOM, NOT Shadow DOM; the options page is already isolated from Google Patents Polymer) using the same `report-dialog.js` module rendered with a `'page'` mode flag (Shadow DOM bypass); same payload-builder, same `MSG.SUBMIT_REPORT` flow; `options.js` reads `location.hash === '#report'` on `DOMContentLoaded` and scrolls + focuses the Report section

### Live UAT — DoD evidence (Phase 5 close)

- [ ] **UAT-01**: Live end-to-end submission against a real failed citation — operator triggers a no-match or yellow-confidence outcome on Google Patents, clicks Report, submits with the test category and a note like "v5.0 UAT-01 smoke"; verify: Discord webhook fires with the rich-embed payload, KV `wrangler kv key get` retrieves the persisted record matching the PAY-01 schema, no `ip` field present in the record, Discord notification fingerprint matches KV key fingerprint
- [ ] **UAT-02**: Client-side rate-limit boundary verified — 6th submission within a 10-minute window blocked with the LIMIT-03 toast; counter pruning on the 7th submission after 10 min has elapsed; no Worker invocation occurs for blocked attempts
- [ ] **UAT-03**: Server-side dedup correctness — 2 submissions with identical fingerprint within 15 min produce exactly ONE KV record (with `duplicate_count: 2`) and ONE primary Discord notification; 3rd submission after 15 min creates a NEW record
- [ ] **UAT-04**: Privacy compliance audit — manifest `data_collection_permissions` declarations match the actual transmitted payload field-by-field (PRIV-01 ↔ PAY-01 cross-check); `web-ext lint` clean on both `dist/firefox/`; privacy policy URL accessible from the rendered store-listing draft; CWS + AMO uploaded as draft submissions (or scanned via local linter equivalents) without scanner warnings
- [ ] **UAT-05**: Cross-browser parity — same report flow works identically on Chrome (service worker, may terminate between events) and Firefox (event page); queue survives Chrome SW termination — operator stops/restarts the SW manually with a queued report and verifies retry on next extension load
- [ ] **UAT-06**: [Remove selection text] toggle correctness — operator toggles ON, submits, verifies `selectionText` field absent from BOTH the KV record AND the Discord embed; toggle state persists across dialog re-opens within the same install (sticky preference confirmed)

## v2 Requirements (deferred to v5.1)

**Bug-report → auto-fix loop ingestion (the reason v4.3 carry-over flows to v5.1):**

- **INGEST-DEF-01**: KV reports promotable to GitHub Issues via a new script `scripts/promote-bug-report.mjs` that reuses the v3.1 `tests/e2e/lib/issue-payload-builder.js` 4-section pattern (reproducer / verifier disagreement / LLM rationale / golden diff); operator-driven, NOT autonomous
- **INGEST-DEF-02**: Reports auto-promoted to triage classifier when fingerprint matches a known `ERROR_CLASS` heuristic; routes to existing v4.3 Phase 64 heuristic-first triage
- **INGEST-DEF-03**: Bug-report fingerprint format extended to cross-reference v3.1 issue-payload-builder fingerprint scheme (enables dedup across user-reported and CI-detected findings)

**v4.3 auto-fix carry-over (paused at Phase 67; resumes in v5.1):**

- **AFIX-DEF-01**: Phase 68 destructive UAT-03 (`scripts/uat-cleanup.mjs` against #20/21/22/23) — blocked on Phase 61 UAT-01/02 sentinel `.planning/sweep-03-04-pass-evidence.yaml`
- **AFIX-DEF-02**: Final v4.3 spend tally (BUDG-01 cap verification) — was the deferred UAT-04 of v4.3
- **AFIX-DEF-03**: Push the 17 unpushed Phase 67 commits (`5a6630a..5b749b1`) per operator's batch-push convention (commits stay local per Phase 67 plan D-23)

**Bug-report follow-on capabilities (deferred from v5.0 scope):**

- **DBG-DEF-01**: Debug Mode observability surfaces beyond the always-on Report button — last-N-reports view in options, per-fingerprint dedup-count telemetry, possibly access-limited (token-gated) for the maintainer only
- **CAP-DEF-01**: Discord thread auto-creation per unique fingerprint — Worker would need a Discord bot token (not just webhook) to create threads; substantially more moving parts; rejected for v5.0 to keep scope tight
- **PAY-DEF-01**: Anonymous install fingerprint for per-user dedup across multiple reports — not needed for v5.0 maintainer triage; revisit when report volume justifies
- **TRIG-DEF-01**: Auto-surface Report button on Worker-fallback partial-degradation (e.g., USPTO returned a result but slowly or with a retry) — too noisy for v5.0; reconsider after seeing live report volume

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Auto-promotion of KV reports to GitHub Issues | Deferred to v5.1 by milestone-summary decision; v5.0 ships the inbound signal channel, v5.1 wires it to auto-fix |
| Discord slash-command interactivity (`/promote`, `/dismiss`) | Requires registering a Discord application + handling interaction signature verification; v5.1+ |
| CAPTCHA / Turnstile / user authentication on the Worker route | Layer in only if abuse surfaces; v1 trust model is "unauthenticated + rate-limited + fingerprint-deduped" |
| Full screenshot capture | CWS/AMO data-collection blast radius too wide; payload sizes balloon; provides little triage value vs structured DOM/PDF diagnostics |
| Full page DOM scrape (everything outside the user's selection) | Leaks scraped content beyond the user's chosen excerpt; CWS data-collection violation |
| Browsing history / `chrome.history` access | New permission; high CWS/AMO suspicion; provides zero value for citation-failure triage |
| IP address in KV report records | GDPR personal data (PITFALLS hard constraint); transient rate-limit key only |
| `userAgent` string verbatim in KV record | Fingerprinting vector; PAY-08 already captures browser+OS at low fidelity |
| Auto-send without explicit user click on Submit | Trust violation; CWS/AMO requirement that data transmission be user-initiated |
| Embedding the Discord webhook URL in extension code | CRX/XPI files are publicly downloadable; webhook would be extracted in <60s and abused; Worker env binding only |
| Refactoring the existing `PROXY_TOKEN` in `src/offscreen/offscreen.js:24` | Pre-existing technical debt unrelated to v5.0; out of scope per STACK open-question disposition |
| Bumping `pdfjs-dist`, `@anthropic-ai/sdk`, Vitest, Playwright, or any watchlist dep | No v5.0 capability requires it; risks double-change failures against research-verified pins |
| Touching `assertTripleGate` body in `scripts/auto-fix-promote.mjs` | Phase 53 / v4.0 trust-invariant (sha256-byte-equivalent baseline); v4.3 paused phases preserved this and v5.0 continues to preserve it |
| Modifying any v4.3 paused-phase artifact in `.planning/milestones/v4.3-phases-paused/` | Paused work is preserved for v5.1 resume; read-only during v5.0 |
| Re-enabling the v40-auto-fix CI workflow scheduled triggers | Stays `workflow_dispatch:` only (commit `d8d54c4`) for the duration of v5.0; reactivation is a v5.1 concern |
| Bumping `--max-turns` past 5 in `tests/e2e/lib/llm-driver.js` | v4.3 cost-discipline gate; carries over |
| Adding required-field validation directly to `worker/src/index.js` USPTO route | Scope-locked to `/report` route additions only; existing USPTO behavior byte-unchanged |
| Re-doing v4.3's BYPASS audit | Continues to exist as v4.3 Phase 62 artifact; v5.0 inherits the bypass-conventions discipline without re-litigating |

## Traceability

Which phases cover which requirements. Updated during roadmap creation 2026-06-12.

| Requirement | Phase | Status |
|-------------|-------|--------|
| XPORT-01 | Phase 1 | Pending |
| XPORT-02 | Phase 1 | Pending |
| XPORT-03 | Phase 1 | Pending |
| XPORT-04 | Phase 1 | Pending |
| PAY-01 | Phase 1 | Pending |
| PAY-02 | Phase 1 | Pending |
| PAY-03 | Phase 1 | Pending |
| PAY-04 | Phase 1 | Pending |
| PRIV-01 | Phase 1 | Pending |
| PRIV-02 | Phase 1 | Pending |
| PRIV-03 | Phase 1 | Pending |
| PRIV-04 | Phase 1 | Pending |
| PRIV-05 | Phase 1 | Pending |
| LIMIT-01 | Phase 1 | Pending |
| LIMIT-02 | Phase 1 | Pending |
| PAY-05 | Phase 2 | Pending |
| PAY-06 | Phase 2 | Pending |
| PAY-07 | Phase 2 | Pending |
| XPORT-05 | Phase 3 | Complete |
| XPORT-06 | Phase 3 | Complete |
| LIMIT-03 | Phase 3 | Complete |
| QUEUE-01 | Phase 3 | Complete |
| QUEUE-02 | Phase 3 | Complete |
| QUEUE-03 | Phase 3 | Complete |
| QUEUE-04 | Phase 3 | Complete |
| CAP-01 | Phase 4 | Complete |
| CAP-02 | Phase 4 | Complete |
| CAP-03 | Phase 4 | Complete |
| CAP-04 | Phase 4 | Complete |
| TRIG-01 | Phase 4 | Complete |
| TRIG-02 | Phase 4 | Complete |
| TRIG-03 | Phase 4 | Complete |
| TRIG-04 | Phase 4 | Complete |
| PAY-08 | Phase 4 | Complete |
| PAY-09 | Phase 4 | Complete |
| DBG-01 | Phase 5 | Pending |
| DBG-02 | Phase 5 | Pending |
| CAP-05 | Phase 5 | Pending |
| CAP-06 | Phase 5 | Pending |
| UAT-01 | Phase 5 | Pending |
| UAT-02 | Phase 5 | Pending |
| UAT-03 | Phase 5 | Pending |
| UAT-04 | Phase 5 | Pending |
| UAT-05 | Phase 5 | Pending |
| UAT-06 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 45 total
- Mapped to phases: 45
- Unmapped: 0

---
*Requirements defined: 2026-06-12*
*Last updated: 2026-06-12 — traceability table filled by roadmapper (45/45 requirements mapped, 0 orphans)*

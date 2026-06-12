# Phase 1: Worker Route + KV Schema + Privacy Compliance Groundwork - Context

**Gathered:** 2026-06-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Entirely server-side + docs-side: the new `POST /report` route on the existing Cloudflare Worker (`worker/src/index.js`), the `BUG_REPORTS` KV namespace with server-side fingerprint dedup (15-min window) and IP-keyed transient rate limit (5 req / 60s), the Discord webhook notification path (URL as Worker secret only), and all three store-submission blocking gates — privacy policy update, Firefox manifest `data_collection_permissions`, webhook-URL hygiene. No extension build changes. Requirements: XPORT-01..04, PAY-01..04, PRIV-01..05, LIMIT-01..02.

</domain>

<decisions>
## Implementation Decisions

### Auth posture for /report
- **D-01:** `/report` sits BEHIND the existing Bearer `PROXY_TOKEN` gate (`worker/src/index.js:144`) — the planned insertion point at ~line 253 (before the USPTO proxy fallthrough, per XPORT-01) stands as written. Consistent with `/cache` and the proxy; filters drive-by scanner spam to Discord. The token is friction, not security (it ships embedded in the extension and is extractable); the IP rate limit + fingerprint dedup remain the real defense. ROADMAP Success Criterion 1's `curl` gains an `Authorization: Bearer` header — this is an accepted refinement, not a criterion change.

### Duplicate / response semantics
- **D-02:** Dedup hit (identical fingerprint within 15 min) returns **HTTP 200** with body `{ok: true, fingerprint, deduped: true}`. This resolves ROADMAP Success Criterion 2's explicitly-open "200 (or 409)" to 200. Rationale: from the user's perspective the report WAS received (counted on the existing record); Phase 3's locked QUEUE-03 rule treats 4xx as permanent-drop/failure, so 200 means zero client special-casing — the standard success toast fires.
- **D-03:** Discord notification is **fully suppressed for duplicates** — `duplicate_count` lives only in the KV record. LIMIT-01's "or sent as a thread reply" alternative is dropped (thread creation needs a Discord bot token, already rejected as out of scope per CAP-DEF-01). No webhook message-ID state is stored.
- **D-04:** **KV write is canonical; Discord is best-effort.** Write KV first, return 201, then fire the Discord webhook via `ctx.waitUntil()` — a Discord outage or deleted webhook never costs a report. Accepted trade-off: a webhook misconfiguration is silent until KV is inspected.

### Discord embed design
- **D-05:** Compact triage card, not a full payload dump. Embed fields: patent # (hyperlinked to the Google Patents URL), category, confidence tier, user note, extension version, browser/OS, fingerprint. Full diagnostics (xpath, error buffer, settings snapshot, viewport) live in KV only — fetched via `wrangler kv key get` when a report warrants digging.
- **D-06:** Selection text appears in the embed as a **truncated ~200-char quoted snippet** when present in the payload. Honors the [Remove selection text] toggle transitively: when `selectionText` is absent from the payload it is absent from the embed (UAT-06 verifies BOTH the KV record AND the Discord embed).
- **D-07:** Embed stripe **color-coded by category**: red = `tool_not_working`, orange = `inaccurate_citation`, yellow = `no_match`, gray = `other`. Title format: `[category] — US{patent#}`.

### Payload validation strictness
- **D-08:** Unknown extra fields in the request body are **silently stripped** — the Worker copies only allowlisted fields (PAY-01) into the KV record and ignores the rest. Forward-compatible: a newer extension sending a new field against this Worker still succeeds during rollout overlap.
- **D-09:** **HTTP 400 with a reason string** on missing/invalid required fields. Required set: patent #, category (must be one of the 4 frozen `REPORT_CATEGORIES`), extension version. The client builds payloads from frozen constants, so invalid input means a bug or abuse — reject it. Matches QUEUE-03's 4xx permanent-drop design.
- **D-10:** **64 KB request body cap**, checked before `JSON.parse`; over-limit returns HTTP 413. Generous headroom for the largest legitimate payload (20-entry error buffer + long selection + diagnostics) while blocking junk floods into KV.

### Claude's Discretion
- Exact embed field ordering, footer content, and timestamp formatting within the D-05/D-06/D-07 constraints.
- 401/405 response shapes for `/report` (follow the existing route conventions in `worker/src/index.js`).
- Whether the IP rate-limit check (LIMIT-02) runs before or after body parsing/validation — pick the cheapest-first ordering.
- Privacy policy section wording and store-listing draft copy (PRIV-03/PRIV-04 specify the required content; phrasing is Claude's).
- Worker test structure (existing pattern: `worker/tests/test-mode.test.js`, `worker/vitest.config.js`).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & research (authority order: REQUIREMENTS.md wins on conflicts)
- `.planning/REQUIREMENTS.md` — Phase 1 requirement text (XPORT/PAY/PRIV/LIMIT); PRIV-01 is the AUTHORITY on the Firefox `data_collection_permissions` taxonomy where research docs diverge
- `.planning/research/STACK.md` — verified `[[kv_namespaces]]` TOML append syntax; route-ordering rationale (insert BEFORE USPTO proxy fallthrough)
- `.planning/research/PITFALLS.md` — GDPR hard constraint (no `CF-Connecting-IP` in records); KV quota-isolation rationale for the separate namespace
- `.planning/research/ARCHITECTURE.md` — build-order rationale for the 5-phase structure
- `.planning/research/FEATURES.md` — feature-level research on capture surfaces and disclosure
- `.planning/research/SUMMARY.md` — research synthesis the roadmap was accepted from
- `.planning/STATE.md` §Blockers/Concerns — Phase 1 pre-planning checklist: (a) run `cd worker && npx wrangler kv namespace create "BUG_REPORTS"` to obtain the namespace ID before editing `wrangler.toml`; (b) PRIV-01 taxonomy authority note; (c) `.dev.vars` gitignore status

### Files this phase modifies
- `worker/src/index.js` — 293 lines; auth gate at line 144, `/cache` routes at 160-252, USPTO proxy fallthrough from line 254; `/report` inserts at ~line 253 AFTER the auth gate, BEFORE the proxy fallthrough
- `worker/wrangler.toml` — currently one `[[kv_namespaces]]` block (`PATENT_CACHE`); append second block for `BUG_REPORTS`
- `src/manifest.firefox.json` — `data_collection_permissions` at lines 11-14, currently `required: ["none"]`; update per PRIV-01
- `docs/privacy/index.html` — existing h2 sections end at "Contact" (line 141); add "Bug Report Feature" section per PRIV-03
- `store-assets/store-listing.md` — the current CWS store text lives HERE (resolves PRIV-04's "wherever current store text lives")
- `worker/src/report-schema.md` — NEW file; the PAY-01 compliance artifact documenting the field allowlist

### Verification context
- `worker/tests/test-mode.test.js` + `worker/vitest.config.js` — existing Worker test harness to extend
- `.gitignore:3` + `worker/.gitignore:2` — `worker/.dev.vars` is ALREADY gitignored in both; XPORT-04 is a verify-only step

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `corsHeaders()` helper and the per-route response-shape conventions in `worker/src/index.js` — `/report` should follow the same style (plain-text errors with CORS, JSON success bodies)
- `X-PCT-Test-Mode` header pattern (`worker/src/index.js:232`) — existing mechanism to suppress KV writes during CI/E2E; consider honoring it on `/report` so UAT dry-runs don't pollute `BUG_REPORTS`
- Existence-check-before-write KV pattern (`/cache` POST) — same quota-protection philosophy applies to dedup lookups

### Established Patterns
- Single-file Worker with inline route dispatch on `url.pathname` — `/report` is a new `if (path === '/report')` block, not a router refactor
- Bearer-token gate applies to ALL routes before dispatch (line 144) — D-01 keeps `/report` behind it
- Worker has its own Vitest config (`worker/vitest.config.js`) separate from the extension test suite

### Integration Points
- `wrangler.toml` env bindings: new `BUG_REPORTS` KV binding + `DISCORD_WEBHOOK_URL` secret (via `wrangler secret put`, never in TOML)
- Phase 2's `report-payload-builder.js` consumes the field allowlist defined here in `worker/src/report-schema.md` — that doc is the schema contract handoff
- `web-ext lint` (existing FOX-06 invariant) must stay clean after the manifest edit — PRIV-05

</code_context>

<specifics>
## Specific Ideas

- Discord embed title format locked: `[category] — US{patent#}`; stripe colors red/orange/yellow/gray by category (D-07)
- Selection snippet in embed: first ~200 chars in a quoted block (D-06)
- The scope lock from REQUIREMENTS.md Out of Scope holds: existing USPTO route behavior byte-unchanged; no `PROXY_TOKEN` refactor; no validation added to the USPTO route

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. (Discord message-editing for duplicate counts was considered and rejected in D-03, not deferred.)

</deferred>

---

*Phase: 1-Worker Route + KV Schema + Privacy Compliance Groundwork*
*Context gathered: 2026-06-12*

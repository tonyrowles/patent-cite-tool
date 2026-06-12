# Phase 1: Worker Route + KV Schema + Privacy Compliance Groundwork - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-12
**Phase:** 1-Worker Route + KV Schema + Privacy Compliance Groundwork
**Areas discussed:** Auth posture for /report, Duplicate response semantics, Discord embed design, Payload validation strictness

---

## Auth posture for /report

| Option | Description | Selected |
|--------|-------------|----------|
| Behind token gate (Recommended) | Insert after the existing auth check (the planned ~line 253 spot). Consistent with /cache and the proxy; filters drive-by scanner spam; operator curl adds Authorization header. Token is friction, not security — rate limit + dedup remain the real defense. | ✓ |
| Open route, no token | Handle /report before the auth gate. Purest reading of the "unauthenticated + rate-limited + deduped" trust model and the bare-curl success criterion. | |
| You decide | Claude picks during planning. | |

**User's choice:** Behind token gate
**Notes:** Surfaced from codebase scout — XPORT-01's planned insertion point (~line 253) inherits the Bearer check at `worker/src/index.js:144`, which conflicted with the requirements' "unauthenticated" trust-model wording. Resolved: token-gated; ROADMAP curl criterion gains an Authorization header.

---

## Duplicate response semantics

### Q1 — Dedup HTTP status

| Option | Description | Selected |
|--------|-------------|----------|
| HTTP 200 + deduped:true (Recommended) | Report WAS received (counted on existing record); client treats it as plain success with zero special-casing in Phase 3 queue logic. | ✓ |
| HTTP 409 Conflict | Semantically explicit, but QUEUE-03 treats 4xx as permanent-drop — client would need a special case. | |
| You decide | | |

**User's choice:** HTTP 200 + deduped:true — resolves ROADMAP's explicitly-open "200 (or 409)".

### Q2 — Discord behavior on duplicates

| Option | Description | Selected |
|--------|-------------|----------|
| Suppress entirely (Recommended) | No Discord message for duplicates; duplicate_count lives only in KV. Zero extra state. | ✓ |
| Edit the original message | Store Discord message ID in KV; PATCH the webhook message to show ×N. Live counts but extra state + failure modes. | |
| You decide | | |

**User's choice:** Suppress entirely. LIMIT-01's "thread reply" alternative dropped (needs bot token — out of scope per CAP-DEF-01).

### Q3 — Discord webhook failure handling

| Option | Description | Selected |
|--------|-------------|----------|
| KV canonical, Discord best-effort (Recommended) | Write KV first, return 201, fire Discord via ctx.waitUntil. Discord outage never costs a report. | ✓ |
| Both must succeed | Await Discord inline; on failure return 5xx so client queues and retries. | |
| You decide | | |

**User's choice:** KV canonical, Discord best-effort.

---

## Discord embed design

### Q1 — Embed payload depth

| Option | Description | Selected |
|--------|-------------|----------|
| Compact triage card (Recommended) | Patent # (linked), category, confidence tier, note, version, browser/OS, fingerprint. Full diagnostics in KV only. | ✓ |
| Full payload dump | Every allowlisted field rendered (truncated to Discord limits). | |
| Minimal ping | Just category + patent # + fingerprint. | |

**User's choice:** Compact triage card.

### Q2 — Selection text in embed

| Option | Description | Selected |
|--------|-------------|----------|
| Truncated snippet (Recommended) | First ~200 chars in a quoted block; strongest triage signal. Honors [Remove selection text] toggle transitively (UAT-06 checks both KV and embed). | ✓ |
| Omit from Discord entirely | Selection only in KV; costs a KV fetch on nearly every triage. | |
| You decide | | |

**User's choice:** Truncated snippet.

### Q3 — Visual treatment

| Option | Description | Selected |
|--------|-------------|----------|
| Color by category (Recommended) | red = Tool not working, orange = Inaccurate citation, yellow = No match found, gray = Other. Title: "[category] — US{patent#}". | ✓ |
| Single fixed color | One brand color; category just a field. | |
| You decide | | |

**User's choice:** Color by category.

---

## Payload validation strictness

### Q1 — Unknown extra fields

| Option | Description | Selected |
|--------|-------------|----------|
| Silently strip (Recommended) | Copy only allowlisted fields into KV; ignore the rest. Forward-compatible across extension/Worker version skew. | ✓ |
| Reject with 400 | Strictest contract but version skew turns into dropped reports. | |
| You decide | | |

**User's choice:** Silently strip.

### Q2 — Required fields / bad values

| Option | Description | Selected |
|--------|-------------|----------|
| 400 on invalid (Recommended) | Require patent #, category (one of 4 frozen REPORT_CATEGORIES), extension version; malformed → 400 with reason string. | ✓ |
| Coerce and accept | Unknown category → 'other'; never lose a report but garbage pollutes KV/fingerprints. | |
| You decide | | |

**User's choice:** 400 on invalid.

### Q3 — Body size cap

| Option | Description | Selected |
|--------|-------------|----------|
| 64 KB cap → 413 (Recommended) | Checked before JSON.parse; generous headroom for largest legitimate payload. | ✓ |
| No explicit cap | Rely on platform limits; hostile client could store megabytes per report. | |
| You decide | | |

**User's choice:** 64 KB cap → 413.

---

## Claude's Discretion

- Exact embed field ordering, footer content, timestamp formatting (within D-05/D-06/D-07 constraints)
- 401/405 response shapes for /report (follow existing route conventions)
- Rate-limit check ordering relative to body parsing (cheapest-first)
- Privacy policy section wording + store-listing draft copy (content requirements fixed by PRIV-03/PRIV-04)
- Worker test structure (extend existing `worker/tests/` harness)

## Deferred Ideas

None — discussion stayed within phase scope. (Discord message-editing for duplicate counts was considered and rejected, not deferred.)

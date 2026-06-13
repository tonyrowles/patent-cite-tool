# Bug Report KV Schema

**Version:** 1.0 (Phase 1 — v5.0 milestone)
**Authority:** PAY-01 (allowlist), PAY-02 (key format + TTL), PAY-03 (excluded fields)
**Consumer:** Phase 2's `src/shared/report-payload-builder.js` (the extension-side builder must produce a payload conforming to this field list so the Worker's `buildKvRecord()` allowlist copies every field without loss)

This is the canonical KV record field allowlist for the `BUG_REPORTS` namespace.
`buildKvRecord()` in `worker/src/index.js` is the implementation source of truth; this doc MUST match it field-for-field.
Unknown extra fields in the request body are silently stripped — only the fields listed below are copied into the KV record (D-08).

---

## KV Key Format (PAY-02)

```
report:{fingerprint}:{timestamp}
```

- **fingerprint** — 16 hex chars (8 bytes of SHA-256 of `patentNumber|category|selectionHash`; see PAY-04)
- **timestamp** — `Date.now()` milliseconds at submission time (Unix epoch, integer)
- **expirationTtl: 7776000** — 90 days; reports expire automatically from KV

The fingerprint prefix is required so `env.BUG_REPORTS.list({ prefix: 'report:{fingerprint}:' })` can perform dedup lookups without scanning the full namespace (LIMIT-01).

---

## Field Allowlist (PAY-01)

| Field | Type | Source | Nullable | Description |
|-------|------|--------|----------|-------------|
| `fingerprint` | `string` (16 hex) | server-computed | No | SHA-256 fingerprint of `patentNumber\|category\|selectionHash`; unique submission identifier; computed by `computeFingerprint()` |
| `timestamp` | `number` (integer) | server-computed | No | `Date.now()` at submission time (Unix milliseconds); forms the key suffix |
| `category` | `string` | request body | No | Report category; one of the 4 frozen REPORT_CATEGORIES: `inaccurate_citation`, `no_match`, `tool_not_working`, `other` |
| `patentNumber` | `string` | request body | No | Bare patent number string as submitted by the extension (e.g. `"12505414"`) |
| `patentUrl` | `string` | request body / server-derived | No | Google Patents URL for this patent; defaults to `https://patents.google.com/patent/US{patentNumber}` if not provided in the body |
| `selectionText` | `string \| null` | request body | Yes | User's highlighted text at time of report; `null` when the user activated the [Remove selection text] toggle (CAP-02 privacy opt-out) |
| `returnedCitation` | `string \| null` | request body | Yes | The citation string produced by the extension for this patent, or `null` if the tool produced no citation (no-match / error) |
| `confidenceTier` | `string \| null` | request body | Yes | Confidence tier label from the extension (e.g. `"green"`, `"yellow"`, `"red"`); `null` if unavailable |
| `extensionVersion` | `string` | request body | No | Extension version string (e.g. `"5.0.0"`); validated as required field by `validateReportBody()` |
| `browser` | `string \| null` | request body | Yes | Browser identifier string (e.g. `"Chrome/125"`); provided by the extension from `navigator.userAgent` processing |
| `os` | `string \| null` | request body | Yes | Operating system identifier (e.g. `"Windows 10"`); provided by the extension |
| `xpathNode` | `string \| null` | request body | Yes | XPath of the DOM node containing the user's selection at report time; diagnostic context for DOM-drift failure analysis |
| `scrollY` | `number \| null` | request body | Yes | `window.scrollY` at time of report; part of the viewport snapshot for reproducing the failure |
| `viewportWidth` | `number \| null` | request body | Yes | `window.innerWidth` at time of report |
| `viewportHeight` | `number \| null` | request body | Yes | `window.innerHeight` at time of report |
| `pdfParseStatus` | `string \| null` | request body | Yes | Status of the PDF parse at time of report (e.g. `"success"`, `"fallback"`, `"error"`); from the extension's internal parse-status tracking |
| `triggerMode` | `string \| null` | request body | Yes | Extension trigger mode setting at time of report (e.g. `"floating"`, `"auto"`, `"contextMenu"`); from `chrome.storage.local` settings snapshot |
| `errorLog` | `array` (max 20) | request body | No (empty array) | Ring buffer of recent console errors / internal warnings captured by the extension; capped at 20 entries by `buildKvRecord()`; empty array `[]` when none |
| `note` | `string \| null` | request body | Yes | Optional free-text note from the user (max 256 chars in the UI); `null` when not provided |
| `duplicate_count` | `number` (integer) | server-computed | No | Deduplication counter; initialized to `0` on first write; incremented by `checkAndHandleDuplication()` on subsequent identical submissions within the 15-minute dedup window (LIMIT-01) |

**Total fields:** 20

---

## Excluded Fields (PAY-03 Hard Constraint)

The following fields are **NEVER stored** in any `report:{fp}:{ts}` KV record:

| Field | Why excluded |
|-------|-------------|
| `ip` | GDPR personal data — `CF-Connecting-IP` is the user's IP address |
| `clientIp` | Same as above — any IP-derived value is excluded |
| `userAgent` | Full `User-Agent` string contains fingerprinting-quality browser details beyond what `browser` + `os` fields capture; PAY-03 hard constraint |

`CF-Connecting-IP` is the ONLY place an IP address flows in the /report route, and it flows exclusively to the **transient** `rl:{ip}` KV key (60-second TTL, 5-request ceiling per LIMIT-02). This key is never copied to a `report:` record and expires automatically — no durable IP storage occurs anywhere in the pipeline.

Any attempt to add `ip`, `clientIp`, or `userAgent` to `buildKvRecord()` should be treated as a PAY-03 violation and rejected in code review. The Vitest test suite asserts the absence of these fields.

---

## Notes

- **Silent stripping (D-08):** Unknown extra request fields not in this table are silently discarded by `buildKvRecord()`. The extension MUST NOT rely on extra fields surviving the round-trip to KV.
- **Phase 2 contract:** `src/shared/report-payload-builder.js` (Phase 2) produces the extension-side payload; it must include all non-server-computed fields from this schema and exclude `ip`, `clientIp`, `userAgent`. The `fingerprint`, `timestamp`, and `duplicate_count` fields are server-computed and must NOT be sent by the extension.
- **Retention:** All `report:` records expire after 90 days via `expirationTtl: 7776000`. No manual cleanup required.

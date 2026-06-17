---
phase: 02
slug: shared-constants-pure-payload-builder
status: verified
threats_open: 0
asvs_level: 1
created: 2026-06-13
---

# Phase 02 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

This is a pure-function surface: no network, no I/O, no `chrome.*`, no untrusted
deserialization, no new dependencies. The only relevant threats are
data-integrity and privacy at the two trust boundaries (caller → builder, and
builder output → Worker transport). Register authored at plan time
(`register_authored_at_plan_time: true`); auditor ran in verify-mitigations mode.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| caller (content script / Phase 4 UI) → `buildReportPayload()` | Untrusted/loosely-shaped input object (live page snapshot + user-entered category/note) crosses into the pure builder | Page snapshot fields, user category/note (low-trust) |
| `buildReportPayload()` output → Worker `/report` route (Phase 3 transport) | The constructed payload becomes the request body the Worker's allowlist copies into durable KV | Report payload (privacy-sensitive — must exclude PII) |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-02-01 | Information Disclosure | `buildReportPayload()` output | mitigate | PAY-03 forbidden PII trio (`ip`/`clientIp`/`userAgent`) never emitted — output built as an explicit ordered literal naming only the 17 allowlisted keys (`src/shared/report-payload-builder.js:74-92`). Pinned by `tests/unit/report-payload-builder.test.js:123-134` (Test 4). | closed |
| T-02-02 | Tampering | `buildReportPayload()` output | mitigate | Extra/attacker-influenced input fields do not propagate past the allowlist — each output key assigned by name; the sole object-spread is the conditional `selectionText` (line 78); no raw-input spread. Pinned by `tests/unit/report-payload-builder.test.js:116-121` (Test 3, `bogusExtra` dropped). | closed |
| T-02-03 | Tampering | `REPORT_CATEGORIES` constant | mitigate | `Object.freeze(REPORT_CATEGORIES)` (`src/shared/constants.js:48`) prevents runtime mutation of the allowlist that the D-05 `includes()` gate relies on. Pinned by `tests/unit/report-payload-builder.test.js:159-167` (Test 7, `Object.isFrozen` + exact order). | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|

No accepted risks. All declared threats are `mitigate` disposition and verified CLOSED in implemented code.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-06-13 | 3 | 3 | 0 | gsd-security-auditor (verify-mitigations mode) |

Pinning tests executed: `npx vitest run tests/unit/report-payload-builder.test.js tests/unit/shared-constants.test.js` → 2 files, 27 tests, all passing.

Note: the SUMMARY's `grep -Ec 'ip|clientIp|userAgent'` returning 1 is a benign substring hit on "content scr**ip**t" in a JSDoc comment, not a field reference. The load-bearing control for T-02-01 is the Vitest output-key assertion (Test 4), which passes.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-06-13

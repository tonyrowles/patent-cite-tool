---
phase: 01-worker-route-kv-schema-privacy-compliance-groundwork
reviewed: 2026-06-13T01:04:30Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - docs/privacy/index.html
  - src/manifest.firefox.json
  - store-assets/store-listing.md
  - worker/src/index.js
  - worker/src/report-schema.md
  - worker/tests/report-route.test.js
  - worker/vitest.config.js
  - worker/wrangler.toml
findings:
  critical: 0
  warning: 3
  info: 8
  total: 11
status: issues_found
---

# Phase 1: Code Review Report (Re-Review after Gap-Closure Plan 01-03)

**Reviewed:** 2026-06-13T01:04:30Z
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

## Summary

Re-reviewed the `POST /report` Worker route, KV schema doc, Vitest suite, and the privacy-compliance artifacts after gap-closure plan 01-03. The test suite was executed: **23/23 tests pass** (one new exact-count dedup test added since the prior 22-test run).

**Fixes verified as applied correctly:**
- **CR-02 (prior)** — `store-assets/store-listing.md:157` checklist now says "Check **Website Content**…", Quick Reference line 176 says "Website Content (voluntary bug reports only)", and Subsection 4 (line 128) uses the definitive wording. The CWS declaration is now internally consistent. **Fixed.**
- **WR-01 (prior)** — `worker/src/index.js:296` now uses `(existing.duplicate_count ?? 0) + 1`, and a dedicated exact-count test exists at `worker/tests/report-route.test.js:216-244` using a fresh patent/IP. **Fixed.**
- **WR-03 (prior)** — `scrollY`/`viewportWidth`/`viewportHeight` now use `?? null` (`worker/src/index.js:233-235`). **Fixed.**
- **WR-07 (prior)** — date bumped to June 2026 (line 92), "Information We Collect" qualified with the bug-report carve-out (line 97), Data Sharing rewritten (line 125). **Fixed.**
- **WR-09 (prior)** — store description now uses a bare URL (`store-assets/store-listing.md:44`). **Fixed.**

**Incomplete fix found:** the WR-08 (prior) rewording was applied to the *Data Sharing* section but the originally-flagged sentence in the *Bug Report Feature* section (`docs/privacy/index.html:165`) is unchanged and now directly contradicts the fixed text — see WR-01 below.

**Carried findings:** prior WR-04, WR-05, and IN-01 through IN-06 were neither fixed nor listed as deferred in the verification report; all were re-verified as still present and are restated below with current line numbers.

## Known-Deferred Findings (not re-raised; tracked for later phases)

Per the verification report, the following re-observed issues are explicit maintainer/phase deferrals, not new findings:

- **CR-01 (prior)** — `patentNumber`/`patentUrl` format validation scope decision. Still present: `validateReportBody()` (`worker/src/index.js:194-208`) accepts any non-empty string, and `patentUrl` passes through unvalidated into the Discord masked link (`worker/src/index.js:225,333`). Deferred as a maintainer scope decision. The masked-link phishing vector remains live until decided.
- **WR-06 (prior)** — Firefox `data_collection_permissions` `required: ["technicalAndInteraction", "websiteActivity"]` vs voluntary-only collection (`src/manifest.firefox.json:11-14`). Deferred as an AMO policy question for the maintainer.
- **PRIV-05** — `web-ext lint` validation deferred to Phase 5.
- **WR-02 (prior)** — deferred to Phase 2 awareness as "test-mode `rl:` writes". **Scope caution:** the deferral description under-states the finding. WR-02 had two parts, and *both* remain: (1) `checkIpRateLimit()` writes `rl:{ip}` keys for test-mode requests (`worker/src/index.js:264,411`), and (2) `checkAndHandleDuplication()` is invoked before any test-mode check and unconditionally `put`s the incremented record with a reset 90-day TTL (`worker/src/index.js:297-299,448`) — so a test-mode request whose fingerprint collides with a real production record mutates that record. The comment at `worker/src/index.js:450` ("Write the incremented record (unless test-mode)") still describes behavior that does not exist. Carry the full scope into Phase 2, not just the `rl:` part.
- **WR-10 (prior)** — tests make real outbound network requests to `discord.example.com`. Confirmed in this run: the 23-test pass is accompanied by repeated `kj/compat/tls.c++:82 … TLSV1_ALERT_INTERNAL_ERROR` and `uncaught exception … jsg.Error: internal error` noise from workerd's real TLS attempts. Deferred to Phase 2 awareness.

## Warnings

### WR-01: Privacy policy still asserts "No data is shared with third parties" in the Bug Report section — original WR-08 sentence never fixed, now contradicts the fixed Data Sharing section

**File:** `docs/privacy/index.html:165` (vs the corrected text at `docs/privacy/index.html:125`)
**Issue:** The prior WR-08 fix wording ("Cloudflare and Discord act as service providers (processors)…") was applied to the *Data Sharing* section at line 125 — but the prior finding pointed at line 165, the *Destinations* paragraph of the Bug Report Feature section, which still reads: "These are the only destinations. **No data is shared with third parties.**" The policy now says, in one section, that Cloudflare and Discord are third-party processors receiving report data, and in another section that no data is shared with third parties. An internally self-contradicting privacy policy is exactly the artifact class this phase exists to eliminate, and the contradiction sits in the section a store reviewer reads most closely.
**Fix:** Replace the last two sentences of line 165 with wording consistent with line 125, e.g.: "These are the only destinations. Cloudflare and Discord act as service providers (processors) for this feature; report data is not sold or shared with any other party."

### WR-02: Optional fields stored without type or length validation; non-string values crash the Discord embed builder outside its try/catch (carried from prior WR-04 — not fixed, not deferred)

**File:** `worker/src/index.js:219-243` (buildKvRecord), `worker/src/index.js:318-356` (embed construction), `worker/src/index.js:360-371` (try wraps only the fetch)
**Issue:** Unchanged from the prior review. `selectionText`, `note`, `returnedCitation`, `browser`, `os`, etc. are copied into the KV record with no type check, so non-string values (numbers, objects) are stored verbatim, violating the types declared in `report-schema.md`. If `note` or `selectionText` is a non-string, `record.note.slice(0, 1024)` (line 351) / `record.selectionText.slice(0, 200)` (line 322) throws a TypeError during embed construction — which happens *before* the `try` at line 360, so the rejection propagates out of `postToDiscord()` inside `ctx.waitUntil()` and the Discord notification is silently lost. There are still no server-side length caps: the privacy policy promises selection text "up to approximately 200 characters" (`docs/privacy/index.html:150`) and the schema says note is "max 256 chars in the UI" (`worker/src/report-schema.md:49`), but the server stores up to ~64 KB per field for 90 days; client-side truncation is not enforcement when `PROXY_TOKEN` ships inside the public extension.
**Fix:** In `buildKvRecord`, coerce and cap:
```js
selectionText: typeof body.selectionText === 'string' ? body.selectionText.slice(0, 300) : null,
note:          typeof body.note === 'string' ? body.note.slice(0, 256) : null,
// same pattern for returnedCitation, browser, os, xpathNode, pdfParseStatus, triggerMode;
errorLog: Array.isArray(body.errorLog)
  ? body.errorLog.slice(0, 20).map(e => String(e).slice(0, 500))
  : [],
```
And move the embed construction inside the try/catch in `postToDiscord` so a malformed record can never produce an unhandled rejection.

### WR-03: IP rate limiter and dedup check are non-atomic on eventually-consistent KV; best-effort nature still undocumented (carried from prior WR-05 — not fixed, not deferred)

**File:** `worker/src/index.js:254-266` (checkIpRateLimit), `worker/src/index.js:277-303` (checkAndHandleDuplication), `worker/src/report-schema.md:66` (LIMIT-02 description)
**Issue:** Unchanged from the prior review. `checkIpRateLimit` is read-then-write with no atomicity: N concurrent requests from one IP all read the same count and all pass, so the 5/60s ceiling is exceeded by parallel requests; cross-colo KV eventual consistency gives each edge location its own effective window. The dedup `list`-then-`put` has the same race — two simultaneous identical submissions both see "no duplicate" and both write records, breaking the one-key-per-fingerprint invariant the test at `worker/tests/report-route.test.js:188-200` asserts. `report-schema.md` still describes LIMIT-01/LIMIT-02 as if they were hard guarantees ("5-request ceiling per LIMIT-02").
**Fix:** Minimum: add a comment in `checkIpRateLimit`/`checkAndHandleDuplication` and a note in `report-schema.md` stating both limits are advisory/best-effort under concurrency, so downstream phases don't treat them as security controls. Proper fix if hard enforcement is wanted: Durable Object counter or the Workers Rate Limiting binding.

## Info

### IN-01: 64 KB body limit measured in UTF-16 code units, not bytes (carried from prior IN-01)

**File:** `worker/src/index.js:402`
**Issue:** `raw.length > 65536` counts string code units; multi-byte (e.g., CJK) bodies can be 3-4x larger in bytes and still pass, so the stored payload can exceed the intended 64 KB cap.
**Fix:** `if (new TextEncoder().encode(raw).byteLength > 65536)`.

### IN-02: 405 responses omit the `Allow` header (carried from prior IN-02)

**File:** `worker/src/index.js:393-398`, `worker/src/index.js:611-617`
**Issue:** RFC 9110 §15.5.6 requires 405 responses to include an `Allow` header.
**Fix:** Add `'Allow': 'POST'` for `/report` and `'Allow': 'GET, POST'` for `/cache`.

### IN-03: Test suite remains order-dependent with weak/misleading assertions (carried from prior IN-03; partially improved)

**File:** `worker/tests/report-route.test.js:104-146`, `worker/tests/report-route.test.js:404-428`
**Issue:** The new exact-count dedup test (lines 216-244) is properly isolated — good. But the rest is unchanged: "writes exactly one KV record" (line 104) actually sends a *second* request for `PATENT_VALID` and asserts `length >= 1`, never exactly one; the PAY-03 test (line 130) and allowlist test (line 139) inspect `listed.keys[0]` of the global `report:` prefix and depend on prior tests' write order; the strip test (line 417) passes vacuously if no record is found, as its own comment admits.
**Fix:** Have each test create its own record with a unique patent number and look it up by its own returned fingerprint with exact-count assertions, following the pattern of the new WR-01 test.

### IN-04: Schema doc says `triggerMode` comes from `chrome.storage.local`; every other artifact says `chrome.storage.sync` (carried from prior IN-04)

**File:** `worker/src/report-schema.md:47`
**Issue:** The privacy policy (`docs/privacy/index.html:115-122`) and store listing both say preferences live in `chrome.storage.sync`; the schema row says `chrome.storage.local`. Phase 2's payload builder will be written against this doc.
**Fix:** Align with the actual storage area (`chrome.storage.sync` per the other documents).

### IN-05: Privacy policy's transmitted-fields list still omits the report category (carried from prior IN-05)

**File:** `docs/privacy/index.html:147-161`
**Issue:** `category` is a required transmitted field (stored in KV and shown in the Discord embed title), but the "What is transmitted" disclosure list does not mention it. The list otherwise reads as exhaustive.
**Fix:** Add: "**Report category** — the failure category you selected (inaccurate citation, no match, tool not working, or other)."

### IN-06: Stale/incorrect metadata in the store-listing doc (carried from prior IN-06; verified again this run)

**File:** `store-assets/store-listing.md:24`, `store-assets/store-listing.md:132`, `store-assets/store-listing.md:146`
**Issue:** (1) The summary note still says "126 chars (verified)" — the actual count is 127 (`printf | wc -c` verified this run; the heading's "127" is correct, the "verified" note is not). (2) The Data Use Practices paragraph at line 132 contains a markdown link `[privacy policy](https://…)` inside text positioned as ready-to-paste Dashboard content — if pasted, the brackets render literally (same failure class as the fixed WR-09). (3) The checklist still references `patent-cite-tool-v1.0.0.zip (464 KB)` while both manifests are at version 2.3.0 — following the checklist as written uploads a stale build.
**Fix:** Correct the count note to 127; replace the markdown link with a bare URL; update the ZIP reference to the actual release artifact at submission time.

### IN-07: Duplicate increment resets the 90-day TTL — retention can exceed "90 days" as stated in the privacy policy

**File:** `worker/src/index.js:297-299` (vs `docs/privacy/index.html:163` and `worker/src/report-schema.md:76`)
**Issue:** Each in-window duplicate rewrites the record with a fresh `expirationTtl: 7776000`, restarting the 90-day clock from the duplicate's arrival. A report that keeps receiving duplicates is retained for 90 days from the *last* duplicate, not from original submission. The privacy policy ("retained for 90 days and then automatically deleted") and schema ("expire after 90 days") read as 90-days-from-submission.
**Fix:** Either compute the remaining TTL when rewriting (`expirationTtl: Math.max(60, 7776000 - Math.floor((now - originalTimestamp) / 1000))` using the timestamp embedded in the key), or amend the policy/schema wording to "90 days from the most recent duplicate submission."

### IN-08: Privacy policy permissions section does not cover the Firefox manifest's `tabs` permission; gecko ID is a placeholder

**File:** `docs/privacy/index.html:127-136` (vs `src/manifest.firefox.json:18-24`), `src/manifest.firefox.json:9`
**Issue:** Both files are new in this diff. The policy's "Permissions Used" section lists the Chrome permission set (`declarativeContent`, `offscreen`, …) but the Firefox manifest requests `tabs` — a permission Firefox surfaces to users as broad tab access — which the policy never mentions; conversely `declarativeContent`/`offscreen` do not exist in the Firefox manifest. If this single policy URL serves the AMO listing too, the disclosure is incomplete for Firefox users. Separately, `"id": "patent-cite-tool@example.com"` uses a placeholder example.com domain; the AMO add-on ID is permanent once first published, so shipping the placeholder locks it in forever.
**Fix:** Add a sentence to the policy noting the Firefox build uses `tabs` (with its justification) in place of `declarativeContent`/`offscreen`, and set a deliberate, owned gecko ID (e.g., `patent-cite-tool@tonyrowles.com`) before first AMO submission.

---

_Reviewed: 2026-06-13T01:04:30Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

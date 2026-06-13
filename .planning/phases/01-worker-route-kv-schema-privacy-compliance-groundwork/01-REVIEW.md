---
phase: 01-worker-route-kv-schema-privacy-compliance-groundwork
reviewed: 2026-06-13T00:33:59Z
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
  critical: 2
  warning: 10
  info: 6
  total: 18
status: issues_found
---

# Phase 1: Code Review Report

**Reviewed:** 2026-06-13T00:33:59Z
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

## Summary

Reviewed the new `POST /report` Worker route, its KV schema doc, the Vitest integration suite, and the privacy-compliance artifacts (privacy policy, Firefox manifest data-collection declaration, Chrome Web Store listing doc). The test suite was executed: 22/22 tests pass, but every report test makes a real outbound network request (Discord fetch), producing TLS errors and uncaught-exception noise in the run.

Two critical findings: (1) the `/report` route performs no format validation on `patentNumber` and no validation on `patentUrl`, allowing masked-link injection into the maintainer Discord channel — significant because `PROXY_TOKEN` ships inside the public extension and is trivially extractable, making the endpoint effectively open; (2) the store-listing submission checklist still instructs "All data type checkboxes unchecked" / "Data collected: None," contradicting the updated Data Use section and producing a false Chrome Web Store data-use declaration now that the bug report feature collects website content.

The dedup/test-mode logic also has correctness bugs: `duplicate_count` is off by one, and `X-PCT-Test-Mode` does not suppress the KV writes performed by the dedup and rate-limit paths, contradicting INJ-01 and the code's own comments.

## Critical Issues

### CR-01: No format validation of `patentNumber`/`patentUrl` enables Discord masked-link injection and arbitrary KV payloads

**File:** `worker/src/index.js:198` (validation), `worker/src/index.js:225` (patentUrl passthrough), `worker/src/index.js:318,325,333` (Discord embed)
**Issue:** `validateReportBody()` only checks that `patentNumber` is a non-empty string — unlike the `/cache` and proxy routes, which enforce `/^\d{6,8}$/`. `patentUrl` is copied from the request body with no validation at all. Both values are interpolated into the Discord embed: `title = "[${category}] — US${patentNumber}"` and `value: "[US${patentNumber}](${patentUrl})"`. `allowed_mentions: { parse: [] }` neutralizes pings (T-1-05) but does nothing about markdown masked links. Because `PROXY_TOKEN` is embedded in the publicly distributed extension, anyone can extract it and POST `/report` with `patentUrl: "https://evil.example/payload"` (or a `patentNumber` containing `](https://evil.example)` to break out of the markdown). The maintainer sees a normal-looking `[US12505414](…)` triage link and clicks it — a direct phishing vector against the person with deploy access. The same gap allows a ~64 KB arbitrary string to be stored as `patentNumber`/`patentUrl` in KV records that are retained 90 days.
**Fix:**
```js
function validateReportBody(body) {
  if (!body || typeof body !== 'object') {
    return 'Request body must be a JSON object';
  }
  if (typeof body.patentNumber !== 'string' || !/^\d{6,8}$/.test(body.patentNumber)) {
    return 'Invalid patentNumber: expected 6-8 digits';
  }
  if (body.patentUrl !== undefined && body.patentUrl !== null) {
    if (typeof body.patentUrl !== 'string' ||
        !/^https:\/\/patents\.google\.com\/patent\/US\d{6,8}([A-Z]\d?)?(\/|\?|$)/.test(body.patentUrl)) {
      return 'Invalid patentUrl: must be a patents.google.com patent URL';
    }
  }
  // ... existing category / extensionVersion checks
}
```

### CR-02: Store-listing submission checklist contradicts the updated Data Use section — following it files a false CWS declaration

**File:** `store-assets/store-listing.md:128-132` (updated) vs `store-assets/store-listing.md:157` and `store-assets/store-listing.md:176` (not updated)
**Issue:** Section 3 Subsection 4 was updated to say Website Content must be checked when users may submit bug reports — and since the bug report feature ships to all users, that condition is unconditionally true. But Section 4's checklist still reads "**Privacy tab — Data use:** All data type checkboxes unchecked; all three certification statements checked," and Section 5's Quick Reference still says "Data collected | None." The checklist is the operational artifact the human follows step-by-step at submission time; as written it directs the operator to declare "no data collected" to the Chrome Web Store while the extension transmits patent selection text (website content) and diagnostic data. A knowingly inaccurate data-use disclosure is a CWS Developer Program Policy violation and a takedown/rejection risk — defeating the stated purpose of this phase ("privacy compliance groundwork").
**Fix:** Update line 157 to: `**Privacy tab — Data use:** Check **Website Content** (bug report selection text); leave all other data type checkboxes unchecked; all three certification statements checked.` Update the Quick Reference row to `| Data collected | Website Content (voluntary bug reports only) |`. Also reword Subsection 4's conditional "If your users may submit voluntary bug reports" to the definitive "The extension includes a voluntary bug report feature, so check **Website Content**."

## Warnings

### WR-01: `duplicate_count` increment is off by one — first duplicate jumps 0 → 2

**File:** `worker/src/index.js:296`
**Issue:** `buildKvRecord()` initializes `duplicate_count: 0` (line 240), but the increment is `existing.duplicate_count = (existing.duplicate_count || 1) + 1;`. Since `0` is falsy, `0 || 1` evaluates to `1`, so the first duplicate sets the count to `2` instead of `1`. Every record's duplicate count is permanently inflated by one, contradicting `report-schema.md` ("initialized to 0 on first write; incremented … on subsequent identical submissions"). The test at `report-route.test.js:211` (`toBeGreaterThanOrEqual(2)`) is too loose to catch it.
**Fix:**
```js
existing.duplicate_count = (existing.duplicate_count ?? 0) + 1;
```
And tighten the test to assert the exact expected count.

### WR-02: `X-PCT-Test-Mode` does not suppress KV writes on the dedup and rate-limit paths (INJ-01 violation)

**File:** `worker/src/index.js:411` (rate-limit write), `worker/src/index.js:448-457` (dedup path)
**Issue:** The INJ-01 contract is that test-mode requests never write production KV. Two paths violate it: (1) `checkAndHandleDuplication()` is called at line 448 before any test-mode check and unconditionally `put`s the incremented record (also resetting its 90-day TTL) — so a test-mode request whose fingerprint matches an existing production record mutates that record. The comment at line 450 ("Write the incremented record (unless test-mode)") describes behavior that does not exist. (2) `checkIpRateLimit()` at line 411 always writes `rl:{ip}` keys, so CI E2E runs consume the production rate budget — the 6th test-mode request per minute from a shared CI egress IP gets a 429, making E2E suites flaky.
**Fix:** Compute `const isTestMode = request.headers.get('X-PCT-Test-Mode') === 'true';` once at the top of `handleReport`, pass it into `checkAndHandleDuplication` to skip the `put` (still returning `isDuplicate`), and decide whether `checkIpRateLimit` should skip its write in test mode (or document that rate limiting intentionally applies to test mode and fix the misleading comment).

### WR-03: `scrollY: body.scrollY || null` coerces legitimate `0` to `null`

**File:** `worker/src/index.js:233-235`
**Issue:** `window.scrollY === 0` (top of page) is a common, meaningful diagnostic value, but `0 || null` stores `null`, silently destroying it. Same falsy-coercion pattern applies to `viewportWidth`/`viewportHeight` (and to empty-string handling on the string fields, where `'' || null` may or may not be intended).
**Fix:**
```js
scrollY:        body.scrollY ?? null,
viewportWidth:  body.viewportWidth ?? null,
viewportHeight: body.viewportHeight ?? null,
```

### WR-04: Optional fields are stored without type or length validation; non-string values crash the Discord embed builder

**File:** `worker/src/index.js:219-243` (buildKvRecord), `worker/src/index.js:321-352` (postToDiscord)
**Issue:** `selectionText`, `note`, `returnedCitation`, `browser`, `os`, etc. are copied with no type check. If `note` or `selectionText` is a number/object, `record.note.slice(0, 1024)` / `record.selectionText.slice(0, 200)` throws a TypeError during embed construction — which happens *before* the `try` block at line 360, so the rejection propagates out of `postToDiscord` inside `ctx.waitUntil()` and the notification is silently lost (the 201 already returned). Additionally, no server-side length caps exist: the privacy policy promises selection text "up to approximately 200 characters" and the schema says note is "max 256 chars in the UI," but the server stores up to ~64 KB per field for 90 days. Client-side truncation is not enforcement — anyone with the (extractable) token can store full-page text.
**Fix:** In `buildKvRecord`, coerce and cap: `selectionText: typeof body.selectionText === 'string' ? body.selectionText.slice(0, 300) : null`, `note: typeof body.note === 'string' ? body.note.slice(0, 256) : null`, similar for other string fields; cap each `errorLog` entry (e.g., `String(e).slice(0, 500)`). Alternatively/additionally wrap the entire body of `postToDiscord` in the try/catch, not just the fetch.

### WR-05: IP rate limiter is non-atomic and built on eventually-consistent KV — LIMIT-02 not reliably enforced

**File:** `worker/src/index.js:254-266`
**Issue:** `checkIpRateLimit` does a read-then-write with no atomicity: N concurrent requests from one IP all read the same count and all pass, so the 5/60s ceiling is trivially exceeded by parallel requests. KV is also eventually consistent across colos (up to ~60s propagation), so requests routed to different edge locations each get their own effective window. The dedup fingerprint check (also KV `list`-based) has the same race: two simultaneous identical submissions both see "no duplicate" and both write records, breaking the "exactly one key per fingerprint" invariant the tests assert.
**Fix:** Either accept and document this as best-effort (add a comment stating the limit is advisory, not a security control), or move the counter to a Durable Object / Workers Rate Limiting binding for atomic enforcement. At minimum, document it in `report-schema.md` so LIMIT-01/LIMIT-02 aren't presumed to be hard guarantees.

### WR-06: Firefox manifest declares always-on required data collection, contradicting the privacy policy

**File:** `src/manifest.firefox.json:11-14`
**Issue:** The diff changed `data_collection_permissions` from `required: ["none"]` to `required: ["technicalAndInteraction", "websiteActivity"]`. "Required" data collection permissions are presented at install time as data the extension collects unconditionally as a requirement of use. But bug reports are voluntary and per-event user-initiated; during normal operation the extension collects nothing — exactly what the privacy policy states ("No analytics or usage tracking is performed", "No data is collected during normal citation-only operation"). As declared, every Firefox user is told at install that the extension always collects their website activity and technical/interaction data, which is both inaccurate and an AMO review friction point.
**Fix:** Move the bug-report-related types to `optional` (consent-gated) and restore `required: ["none"]`:
```json
"data_collection_permissions": {
  "required": ["none"],
  "optional": ["technicalAndInteraction", "websiteActivity", "websiteContent"]
}
```
Note for Phase 2: optional data-collection permissions require a runtime consent check (`browser.permissions`) before the report dialog transmits.

### WR-07: Privacy policy not internally reconciled — absolute "no collection" claims and stale revision date contradict the new Bug Report section

**File:** `docs/privacy/index.html:92`, `docs/privacy/index.html:97-104`, `docs/privacy/index.html:125`
**Issue:** The opening paragraph gained an "except as described in the Bug Report Feature section" carve-out, but the sections that follow were not updated: "Information We Collect" still asserts "We collect **no personal information** of any kind" and "No personal information is collected or stored" (selection text, free-text notes, and error logs are stored for 90 days and can contain personal data); "Data Sharing" still asserts "No data is collected that could be shared." Additionally, "Last updated: March 2026" was not bumped even though the policy itself states "The date at the top of this page reflects the date of the most recent revision" — adding a whole new data-collection section without updating the date makes that statement false and undermines the policy's reliability as a compliance document.
**Fix:** Update the date to June 2026. Qualify the absolute claims, e.g., "During normal citation use, we collect no personal information of any kind. If you voluntarily submit a bug report, the data described in the Bug Report Feature section is collected." Update Data Sharing to reference the bug-report destinations.

### WR-08: "No data is shared with third parties" is inaccurate — Discord is a third-party processor

**File:** `docs/privacy/index.html:165`
**Issue:** The Destinations paragraph states reports go to Cloudflare KV and "a maintainer-only Discord channel. These are the only destinations. No data is shared with third parties." Discord Inc. (and Cloudflare, for that matter) are third-party service providers that receive and process report contents (patent number, selection text, free-text note) on their servers. "Maintainer-only channel" describes who can read the messages, not who processes the data. Stating "no data is shared with third parties" in the same sentence is materially misleading in a privacy policy — the kind of inconsistency store reviewers and GDPR assessments flag.
**Fix:** Reword to: "Reports are stored on Cloudflare (KV) and a notification containing report fields is delivered via Discord. Cloudflare and Discord act as service providers (processors) for this feature; data is not sold or shared with any other party."

### WR-09: HTML anchor tag inside the "plain text — no HTML" store description

**File:** `store-assets/store-listing.md:44` (vs the field label at line 26)
**Issue:** The description block — explicitly labeled "Description (plain text — no HTML)" — now contains `<a href="https://tonyrowles.github.io/patent-cite-tool/privacy">privacy policy</a>`. Chrome Web Store descriptions do not render HTML; the tag will appear as literal angle-bracket text in the public listing, which looks broken and unprofessional.
**Fix:** Replace with a bare URL: `…submit an optional diagnostic report to help the developer fix it. Full details: https://tonyrowles.github.io/patent-cite-tool/privacy`

### WR-10: Report tests make real outbound network requests to `discord.example.com` on every submission test

**File:** `worker/vitest.config.js:28`, `worker/tests/report-route.test.js` (all non-test-mode report tests)
**Issue:** `DISCORD_WEBHOOK_URL` is set to a live-looking URL and the tests do not mock fetch, so every non-test-mode report POST triggers a genuine network connection attempt from workerd. The observed test run is littered with `kj/compat/tls.c++:82: failed: OpenSSL error … TLSV1_ALERT_INTERNAL_ERROR` and `uncaught exception; … jsg.Error: internal error` noise from these attempts. Tests currently pass only because `postToDiscord` swallows fetch errors, but the suite is network-dependent: in an offline or egress-restricted CI environment, behavior depends on DNS/TLS failure modes, and if `discord.example.com` ever resolves differently the suite leaks report payloads to an external host. The config comment ("so Discord fetch path is testable without hitting a real webhook") is wrong — it does hit the network.
**Fix:** Use the workers-pool fetch mock so no socket is opened:
```js
import { fetchMock } from 'cloudflare:test';
// in beforeAll: fetchMock.activate(); fetchMock.disableNetConnect();
// fetchMock.get('https://discord.example.com').intercept({ path: '/test-webhook', method: 'POST' }).reply(204).persist();
```
This also enables a positive assertion that the Discord payload includes `allowed_mentions: { parse: [] }` (currently untested).

## Info

### IN-01: 64 KB body limit measured in UTF-16 code units, not bytes

**File:** `worker/src/index.js:402`
**Issue:** `raw.length > 65536` counts string code units. A body of multi-byte characters (e.g., CJK selection text) can be up to ~3-4x larger in bytes and still pass, so the actual stored payload can exceed the intended 64 KB cap.
**Fix:** `if (new TextEncoder().encode(raw).byteLength > 65536)` — or check `request.headers.get('Content-Length')` first as a fast path and the encoded length as authoritative.

### IN-02: 405 responses omit the `Allow` header

**File:** `worker/src/index.js:393-398`, `worker/src/index.js:611-617`
**Issue:** RFC 9110 §15.5.6 requires 405 responses to include an `Allow` header listing supported methods.
**Fix:** Add `'Allow': 'POST'` (for `/report`) and `'Allow': 'GET, POST'` (for `/cache`).

### IN-03: Test suite is order-dependent with weak/misleading assertions

**File:** `worker/tests/report-route.test.js:102-144`
**Issue:** The test named "writes exactly one KV record" actually sends a *second* request for `PATENT_VALID` (exercising the dedup path) and asserts `length >= 1`, never "exactly one." The PAY-03 test (line 123) and allowlist test (line 135) inspect only `listed.keys[0]` of the global `report:` prefix and depend entirely on prior tests in the file having run and written state — under per-test storage isolation or test reordering they fail or silently check the wrong record. The strip test (line 393) passes vacuously if the record is never found.
**Fix:** Have each test create its own record with a unique patent number, look up the record by its own returned fingerprint, and assert exact counts.

### IN-04: Schema doc says `triggerMode` comes from `chrome.storage.local`; everything else says `chrome.storage.sync`

**File:** `worker/src/report-schema.md:47`
**Issue:** The privacy policy and store listing both state preferences live in `chrome.storage.sync`; the schema's `triggerMode` row says "from `chrome.storage.local` settings snapshot." One of these is wrong, and Phase 2's payload builder will be written against this doc.
**Fix:** Align with the actual storage area used by the extension (`chrome.storage.sync` per the other documents).

### IN-05: Privacy policy's transmitted-fields list omits the report category

**File:** `docs/privacy/index.html:147-161`
**Issue:** `category` is a required transmitted field (and is stored and shown in Discord), but the "What is transmitted" list does not mention it. For a disclosure list that aims to be exhaustive, the omission is a completeness gap.
**Fix:** Add a list item: "**Report category** — the failure category you selected (inaccurate citation, no match, tool not working, or other)."

### IN-06: Stale/incorrect metadata claims in the store-listing doc

**File:** `store-assets/store-listing.md:18,24,146`
**Issue:** The summary header says "127 characters" while the verification note says "126 chars (verified)" — the actual count is 127, so the "verified" claim is false (harmless: limit is 132). The checklist still references `patent-cite-tool-v1.0.0.zip (464 KB)` while the manifest under review is version 2.3.0 — the ZIP reference is stale and would have the operator upload an old build.
**Fix:** Correct the count note to 127; regenerate/rename the ZIP reference to match the actual release version at submission time.

---

_Reviewed: 2026-06-13T00:33:59Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

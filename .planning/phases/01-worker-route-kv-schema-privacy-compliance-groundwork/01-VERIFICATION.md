---
phase: 01-worker-route-kv-schema-privacy-compliance-groundwork
verified: 2026-06-12T17:45:00Z
status: gaps_found
score: 11/15 must-haves verified
overrides_applied: 0
gaps:
  - truth: "store-assets/store-listing.md acknowledges voluntary website-content submission via bug reporting and updates the data-use declaration"
    status: partial
    reason: "Subsection 4 body text was updated correctly with bug report carve-out, but the Section 4 Submission Checklist (line 157) still instructs 'All data type checkboxes unchecked; all three certification statements checked' and the Quick Reference table (line 176) still shows 'Data collected | None'. As written, the operator following the checklist will file a false CWS declaration. This is the BLOCKER the review identified as CR-02."
    artifacts:
      - path: "store-assets/store-listing.md"
        issue: "Line 157: checklist says 'All data type checkboxes unchecked' — contradicts Subsection 4 body. Line 176: Quick Reference says 'Data collected | None' — contradicts Subsection 4 body."
    missing:
      - "Update line 157 to: 'Privacy tab — Data use: Check Website Content (bug report selection text); leave all other data type checkboxes unchecked; all three certification statements checked.'"
      - "Update Quick Reference row to: 'Data collected | Website Content (voluntary bug reports only)'"
      - "Reword Subsection 4 condition from 'If your users may submit voluntary bug reports' to the definitive 'The extension includes a voluntary bug report feature, so check Website Content' — because the feature ships to all users."

  - truth: "The privacy policy's prior 'collects no personal data' statement is qualified for voluntary bug reports"
    status: partial
    reason: "The opening paragraph carve-out was added correctly ('except as described in the Bug Report Feature section below'). However, 'Information We Collect' section still asserts unconditionally 'We collect no personal information of any kind' and 'No personal information is collected or stored' — these are absolute claims that are now false after bug reports were introduced. The 'Data Sharing' section still says 'No data is collected that could be shared' — also now false since Discord and Cloudflare receive report data. Privacy policy revision date still says 'Last updated: March 2026' though a new data-collection section was added."
    artifacts:
      - path: "docs/privacy/index.html"
        issue: "Lines 97-99: 'Information We Collect' still says 'We collect no personal information of any kind / No personal information is collected or stored' — absolute and now inaccurate. Line 125: Data Sharing still says 'No data is collected that could be shared.' Line 92: revision date not updated."
    missing:
      - "Qualify 'Information We Collect' body: e.g. 'During normal citation use, we collect no personal information of any kind. If you voluntarily submit a bug report, the data described in the Bug Report Feature section is collected.'"
      - "Update Data Sharing to reference bug-report destinations (Cloudflare KV and Discord as service providers/processors, not sold to third parties)"
      - "Bump revision date to June 2026"

  - truth: "manifest.firefox.json declares data_collection_permissions required ['technicalAndInteraction','websiteActivity'] and optional ['websiteContent']"
    status: partial
    reason: "The manifest was updated as specified by PRIV-01 in REQUIREMENTS.md and the plan, and the check-firefox-data-collection.cjs script exits 0. HOWEVER the code review (WR-06) identified a substantive AMO compliance concern: 'required' permissions are shown at install as data the extension collects unconditionally, but bug reports are voluntary. This is a compliance risk — AMO reviewers may flag it. The PLAN explicitly states REQUIREMENTS.md is the authority over PITFALLS.md on this question, and the implemented value matches PRIV-01 exactly. Flagged as UNCERTAIN/WARNING rather than FAILED because the implementation matches the requirement spec — but the AMO risk is real and unresolved."
    status: partial
    reason: "Implemented as spec requires (PRIV-01). WR-06 identifies this as an AMO friction risk — 'required' at install time claims unconditional collection when bug reports are voluntary. This deserves human review before AMO submission."
    artifacts:
      - path: "src/manifest.firefox.json"
        issue: "technicalAndInteraction and websiteActivity listed as 'required' — correct per PRIV-01 spec but WR-06 argues they should be 'optional' for AMO compliance. Not a code defect against the spec; a spec risk."
    missing:
      - "Human review of WR-06 concern before AMO submission: consider moving bug-report-related types to optional and restoring required: ['none']"
---

# Phase 1: Worker Route + KV Schema + Privacy Compliance Groundwork — Verification Report

**Phase Goal:** The `POST /report` Cloudflare Worker route, `BUG_REPORTS` KV namespace, server-side fingerprint dedup + IP-keyed rate limit, and all store-submission compliance gates ship together so no compliant extension release can be made without them — blocking gates BLOCK-01 (privacy compliance), BLOCK-02 (webhook URL hygiene), BLOCK-03 (IP-not-in-KV) are all resolved here.
**Verified:** 2026-06-12T17:45:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | Unauthenticated POST to /report returns 401 (Bearer gate inherited) | VERIFIED | Test "auth gate inherited (D-01)" passes; index.js line 511 auth gate precedes route dispatch; test file line 398-412 explicitly covers this |
| 2 | Valid authenticated POST returns 201 with {ok:true, fingerprint, deduped:false}, writes KV record with report:{fp}:{ts} key and expirationTtl 7776000 | VERIFIED | Tests pass; index.js line 462-466 writes with expirationTtl 7776000; 22/22 tests green |
| 3 | Stored KV record contains NO ip, clientIp, or userAgent field | VERIFIED | buildKvRecord() at index.js:219-243 is an explicit allowlist with comment "NO: ip, clientIp, userAgent"; test "stored KV record contains NO ip, clientIp, or userAgent field" asserts this |
| 4 | Second identical submission within 15 min returns 200 deduped:true, increments duplicate_count, no new KV key | VERIFIED (with bug) | Core dedup behavior works and tests pass. duplicate_count increment has off-by-one bug (line 296: `(existing.duplicate_count \|\| 1) + 1` — uses `\|\| 1` not `?? 0`, so 0-falsy makes first dup jump from 0 to 2). Test assertion `toBeGreaterThanOrEqual(2)` is too loose to catch it. Functional dedup behavior is correct; count is inflated by one. |
| 5 | No Discord webhook fires for duplicate submission | VERIFIED | index.js line 449-457: on isDuplicate, returns 200 immediately with no ctx.waitUntil() call; Discord call only happens in new-record path |
| 6 | KV write canonical, Discord best-effort via ctx.waitUntil() | VERIFIED | index.js line 480: ctx.waitUntil(postToDiscord(...)) runs after response is built; postToDiscord errors swallowed in try/catch; test "returns 201 even when Discord webhook URL is unreachable" passes |
| 7 | Discord embed is compact triage card (hyperlinked patent, category, confidence, note, version, browser/OS, fingerprint, color-coded) | VERIFIED | postToDiscord() at index.js:314-372 implements full embed spec: CATEGORY_COLORS map, title format "[category] — US{patentNumber}", all required fields, footer fp:{fingerprint}, allowed_mentions guard |
| 8 | selectionText appears as ~200-char snippet only when present; absent when toggled off | VERIFIED | index.js:321-323 produces selectionSnippet only when record.selectionText is truthy; absent otherwise; spread conditional in embed fields at line 352 |
| 9 | Unknown extra fields silently stripped (D-08) | VERIFIED | buildKvRecord() is explicit allowlist; test "extra fields in request body are not stored in KV record" covers this |
| 10 | POST missing patentNumber/extensionVersion or invalid category returns 400 | VERIFIED | validateReportBody() at index.js:194-208; 3 failing-validation tests pass |
| 11 | Body > 65536 bytes returns 413 (checked before JSON.parse) | VERIFIED | index.js:401-407 reads as text first, checks length before parse; test passes |
| 12 | 6th request from same IP within 60s returns 429 with Retry-After header | VERIFIED | checkIpRateLimit() uses rl:{ip} KV key with 60s TTL and 5-request ceiling; test passes with Retry-After header check |
| 13 | Discord webhook URL appears in no committed file | VERIFIED | grep returns zero results for discord.com/api/webhooks/<digits>/ outside .planning/; webhook accessed via env.DISCORD_WEBHOOK_URL only |
| 14 | store-assets/store-listing.md acknowledges voluntary website-content submission and updates data-use declaration | FAILED (BLOCKER) | Subsection 4 body text updated correctly; but line 157 (Submission Checklist) still says "All data type checkboxes unchecked" and line 176 (Quick Reference) still says "Data collected | None" — operator following the checklist will file a false CWS declaration (CR-02 from code review) |
| 15 | Privacy policy's prior 'no personal data' statement qualified; Bug Report Feature section documents field-by-field disclosure | PARTIAL | Bug Report Feature section added and field-by-field disclosure is present. Opening paragraph qualified with carve-out. BUT "Information We Collect" section (lines 97-99) still asserts absolute "no personal information" without qualification, Data Sharing (line 125) says "No data is collected that could be shared" — now inaccurate. Revision date not bumped. |

**Score:** 11/15 truths fully verified (2 gaps, 1 partial-but-functional, 1 partial-with-internal-inconsistency)

### Deferred Items

None — all gaps are within Phase 1 scope and require fixes in Phase 1 artifacts.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|---------|--------|---------|
| `worker/src/index.js` | POST /report route + all helper functions | VERIFIED | Route at line 621 (before USPTO fallthrough at 625); all 7 helper functions present and implemented |
| `worker/wrangler.toml` | BUG_REPORTS KV namespace binding | VERIFIED | Second [[kv_namespaces]] block with binding="BUG_REPORTS" and real id cefe2733c0074fe2a28a49ff536de105; no placeholder |
| `worker/src/report-schema.md` | PAY-01 field-allowlist compliance artifact | VERIFIED | 20-field table, KV key format, expirationTtl, excluded fields section (ip/clientIp/userAgent), Phase 2 contract note |
| `worker/tests/report-route.test.js` | Integration tests for /report route | VERIFIED | 22 test cases covering all plan behavior scenarios; 22/22 pass |
| `worker/vitest.config.js` | DISCORD_WEBHOOK_URL test binding | VERIFIED | DISCORD_WEBHOOK_URL binding present at line 28 |
| `src/manifest.firefox.json` | Updated data_collection_permissions (PRIV-01) | VERIFIED | required: ["technicalAndInteraction","websiteActivity"], optional: ["websiteContent"]; check-firefox-data-collection.cjs exits 0 |
| `docs/privacy/index.html` | Bug Report Feature section (PRIV-03) | PARTIAL | Section exists with field-by-field disclosure, but pre-existing absolute claims in "Information We Collect" and "Data Sharing" sections not reconciled |
| `store-assets/store-listing.md` | Updated data-use declaration (PRIV-04) | PARTIAL/BLOCKED | Subsection 4 body updated; Submission Checklist and Quick Reference tables internally contradictory (CR-02) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| worker/src/index.js handleReport() | env.BUG_REPORTS | KV put/list/get against report:{fp}:{ts} and rl:{ip} keys | VERIFIED | env.BUG_REPORTS.put, .list, .get calls confirmed at lines 264, 278, 294, 297, 466 |
| worker/src/index.js postToDiscord() | env.DISCORD_WEBHOOK_URL | fetch POST inside ctx.waitUntil() | VERIFIED | ctx.waitUntil() at line 480; DISCORD_WEBHOOK_URL consumed in postToDiscord at line 315 |
| worker/vitest.config.js miniflare.bindings | worker/wrangler.toml BUG_REPORTS | Miniflare auto-wires KV from wrangler.toml configPath | VERIFIED | configPath: './wrangler.toml' in vitest.config.js; BUG_REPORTS binding in wrangler.toml; 22/22 tests pass confirming the wire |
| src/manifest.firefox.json data_collection_permissions | worker/src/report-schema.md payload allowlist | Declared collection types match transmitted fields (PRIV-01 <-> PAY-01) | PARTIAL | websiteContent declared optional matching selectionText opt-out; but "required" types may overstate unconditional collection (WR-06) |
| docs/privacy/index.html Bug Report Feature section | PAY-01 field allowlist | Field-by-field disclosure | PARTIAL | Section present with 14 fields disclosed; missing report category (IN-05); pre-existing sections not reconciled |

### Data-Flow Trace (Level 4)

Not applicable — this phase produces a server-side Worker route and static documentation files, not a component rendering dynamic data. Worker route data flow verified through test execution (22/22 green).

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All 22 report route tests pass | cd worker && npm test | 22 passed (2 files) in 3.22s | PASS |
| BUG_REPORTS KV binding real (no placeholder) | grep in wrangler.toml | id = "cefe2733c0074fe2a28a49ff536de105" | PASS |
| Discord webhook URL not committed | grep -rE discord.com/api/webhooks/[0-9]+/ | Zero results | PASS |
| .dev.vars gitignored | git check-ignore -v worker/.dev.vars | worker/.gitignore:2:.dev.vars | PASS |
| PRIV-01 assertion script | node scripts/check-firefox-data-collection.cjs | PRIV-01 OK | PASS |
| /report block before USPTO fallthrough | line comparison | /report at line 621, USPTO at line 625 | PASS |

### Probe Execution

No probe scripts declared or found for this phase.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| XPORT-01 | Plan 01 | POST /report route in index.js before USPTO proxy | SATISFIED | index.js line 621; route dispatches to handleReport() |
| XPORT-02 | Plan 01 | BUG_REPORTS KV namespace binding in wrangler.toml | SATISFIED | wrangler.toml lines 9-11; real namespace id |
| XPORT-03 | Plan 01 | Webhook URL never in committed file | SATISFIED | grep returns zero results outside .planning/ |
| XPORT-04 | Plan 01 | worker/.dev.vars gitignored | SATISFIED | worker/.gitignore confirmed via git check-ignore |
| PAY-01 | Plan 01 | Explicit field allowlist KV schema in report-schema.md | SATISFIED | 20-field table in report-schema.md; buildKvRecord() matches |
| PAY-02 | Plan 01 | KV key format report:{fingerprint}:{timestamp}, expirationTtl 7776000 | SATISFIED | index.js line 462 builds key; line 466 puts with expirationTtl |
| PAY-03 | Plan 01 | No ip/clientIp/userAgent in KV record | SATISFIED | buildKvRecord() allowlist explicit; test asserts absence; comment at line 241 |
| PAY-04 | Plan 01 | SHA-256 fingerprint of patent|category|selectionHash | SATISFIED | computeFingerprint() at index.js:161-186 |
| PRIV-01 | Plan 02 | Firefox manifest data_collection_permissions updated | SATISFIED | manifest.firefox.json updated; check script passes |
| PRIV-02 | Plan 02 | Chrome manifest verified unchanged | SATISFIED | manifest.json untouched; PRIV-02 is verify-only |
| PRIV-03 | Plan 02 | Privacy policy Bug Report Feature section | PARTIAL | Section added with field disclosure; but absolute pre-existing claims not reconciled (WR-07) |
| PRIV-04 | Plan 02 | Store listing data-use declaration updated | PARTIAL/BLOCKED | Subsection 4 body updated; Checklist and Quick Reference still instruct false declaration (CR-02) |
| PRIV-05 | Plan 02 | web-ext lint clean after manifest edit | UNCERTAIN | No dist/firefox/ build available; deferred to Phase 5 UAT-04 per plan's explicit allowance |
| LIMIT-01 | Plan 01 | Fingerprint dedup with 15-min window; increment duplicate_count | SATISFIED (with bug) | checkAndHandleDuplication() implements prefix list scan with 15-min filter; duplicate_count off-by-one (WR-01) — functional but count value inflated by 1 |
| LIMIT-02 | Plan 01 | IP-keyed rate limit 5/60s via rl:{ip} KV key | SATISFIED | checkIpRateLimit() uses rl:{ip} with 60s TTL and 5-request ceiling; test confirms 429 + Retry-After |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| store-assets/store-listing.md | 157 | "All data type checkboxes unchecked" in Checklist | BLOCKER | Operator following the checklist files a false CWS data-use declaration after the bug report feature ships — direct policy violation risk (CR-02) |
| store-assets/store-listing.md | 176 | "Data collected | None" in Quick Reference | BLOCKER | Same as line 157 — Quick Reference operationally contradicts updated Subsection 4 |
| worker/src/index.js | 296 | `(existing.duplicate_count \|\| 1) + 1` | WARNING | duplicate_count off-by-one on first dup (jumps 0→2 instead of 0→1); schema doc says initialized to 0 and incremented; mismatch undermines dedup telemetry accuracy (WR-01) |
| worker/src/index.js | 411 | checkIpRateLimit() has no test-mode guard | WARNING | Test-mode requests still write rl:{ip} KV keys; CI runs consume production rate budget; comment at line 450 says test-mode suppresses KV writes on dedup path but it does not (WR-02) |
| worker/src/index.js | 233-235 | `scrollY: body.scrollY \|\| null` | WARNING | Falsy coercion: scrollY=0 (top of page) becomes null; same for viewportWidth/viewportHeight (WR-03) |
| worker/src/index.js | 198 | patentNumber not format-validated | WARNING | validateReportBody checks only non-empty string; no `/^\d{6,8}$/` regex; allows arbitrary strings including markdown injection into Discord embed title/fields (CR-01) |
| docs/privacy/index.html | 92 | "Last updated: March 2026" | WARNING | Revision date not bumped after adding a new data-collection section (WR-07) |
| docs/privacy/index.html | 97-99 | Absolute "We collect no personal information" not qualified | WARNING | Information We Collect section contradicts the Bug Report Feature section added in this phase (WR-07) |
| docs/privacy/index.html | 125 | "No data is collected that could be shared" | WARNING | Data Sharing section is now inaccurate — Discord and Cloudflare receive report content (WR-08) |
| store-assets/store-listing.md | 44 | `<a href="...">` in plain-text description field | WARNING | HTML anchor tag in field explicitly labeled "plain text — no HTML" will render as literal angle brackets on CWS (WR-09) |
| worker/tests/report-route.test.js | all non-test-mode tests | Real outbound network attempts to discord.example.com | INFO | TLS errors visible in test output; tests pass because errors are swallowed, but suite is network-dependent (WR-10) |

### Human Verification Required

#### 1. Firefox manifest required vs optional review (WR-06)

**Test:** Compare the REQUIREMENTS.md PRIV-01 spec ("required: ['technicalAndInteraction','websiteActivity'], optional: ['websiteContent']") against AMO reviewer expectations for a voluntary, user-initiated feature. Consult AMO documentation for when "required" vs "optional" data-collection permissions are appropriate.
**Expected:** A determination of whether the current "required" placement for technicalAndInteraction/websiteActivity is accurate (unconditional at install) or whether all three types should be "optional" (consent-gated, added at runtime before first report submission).
**Why human:** This is a policy/compliance judgment call, not a code defect. The implementation matches PRIV-01 as written. The review argues the spec itself may cause AMO friction. Only the maintainer can decide whether to update PRIV-01 or accept AMO risk.

#### 2. patentNumber format validation scope decision (CR-01)

**Test:** Evaluate whether to add `/^\d{6,8}$/` regex validation to validateReportBody() for patentNumber, and URL validation for patentUrl. The review identifies this as a Discord masked-link injection vector (PROXY_TOKEN is extractable from the public extension).
**Expected:** A decision on whether to fix in Phase 1 (add validation) or accept the risk with documentation (the endpoint is friction-only, not security).
**Why human:** Requires threat model judgment — PROXY_TOKEN is described in the plans as "friction not security" (D-01). The maintainer must decide if the phishing risk to the deploy-access holder warrants the fix before Phase 2.

#### 3. PRIV-05 web-ext lint clean (deferred per plan)

**Test:** Build `dist/firefox/` and run `npx web-ext lint dist/firefox/`.
**Expected:** Exit 0, no AMO-blocking warnings.
**Why human:** No Firefox build is available in this verification context. The plan explicitly deferred this to Phase 5 UAT-04.

### Gaps Summary

**Two blockers require fixes before Phase 1 is complete.**

**BLOCKER 1 — CR-02: store-listing.md Submission Checklist and Quick Reference contradict updated Subsection 4 body**

The Subsection 4 body text correctly says to check "Website Content" when users submit bug reports — but Section 4's Submission Checklist (line 157) still instructs "All data type checkboxes unchecked" and Section 5's Quick Reference (line 176) still shows "Data collected | None." The checklist is the operational artifact the operator follows step-by-step when submitting to CWS. As written, following the checklist produces a false data-use declaration — a knowingly inaccurate submission that is a CWS Developer Program Policy violation and takedown risk. This directly defeats the stated phase purpose ("privacy compliance groundwork").

**Fixes needed (3 lines in store-assets/store-listing.md):**
- Line 157: change checklist item to say "Check Website Content (bug report selection text)..."
- Line 176: change Quick Reference "Data collected | None" to "Data collected | Website Content (voluntary bug reports only)"
- Subsection 4 condition: change "If your users may submit voluntary bug reports" to the definitive "The extension includes a voluntary bug report feature, so check Website Content"

**BLOCKER 2 — WR-07: Privacy policy "Information We Collect" and "Data Sharing" sections not reconciled**

The opening paragraph carve-out was added, but the "Information We Collect" section (lines 97-99) still asserts absolutely "We collect no personal information of any kind" / "No personal information is collected or stored" — now contradicted by bug report data collection. The "Data Sharing" section (line 125) says "No data is collected that could be shared" — now false since Discord and Cloudflare receive report payloads. The revision date (line 92) was not updated. A privacy policy with internal contradictions undermines its function as a compliance document and can be flagged by AMO/CWS reviewers.

**Fixes needed (docs/privacy/index.html):**
- Lines 97-99: qualify "Information We Collect" to scope "no personal information" to normal citation use
- Line 125: update Data Sharing to reference bug-report destinations as service providers
- Line 92: update revision date to June 2026

**Non-blocking issues from code review (for Phase 2 planning awareness):**

- WR-01: duplicate_count off-by-one (0→2 on first dup; use `?? 0` not `|| 1`) — metrics inaccuracy, not functional failure
- WR-02: test-mode does not suppress rl:{ip} writes or the dedup KV write — CI rate-budget leak risk
- WR-03: scrollY/viewportWidth/viewportHeight use falsy `||` not `??` — legitimate 0 values become null
- CR-01: no patentNumber format validation — Discord embed injection risk (PROXY_TOKEN is extractable)
- WR-09: HTML anchor tag in plain-text CWS description field — will render as literal angle brackets
- WR-10: report tests make real outbound network calls — TLS noise in CI; suite network-dependent

---

_Verified: 2026-06-12T17:45:00Z_
_Verifier: Claude (gsd-verifier)_

---
phase: 01-worker-route-kv-schema-privacy-compliance-groundwork
verified: 2026-06-13T18:10:00Z
status: human_needed
score: 15/15 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 11/15
  gaps_closed:
    - "store-assets/store-listing.md Submission Checklist and Quick Reference now agree with Subsection 4 — all three instruct checking Website Content (CR-02)"
    - "docs/privacy/index.html 'Information We Collect' qualified for normal citation use; 'Data Sharing' names Cloudflare/Discord as processors; revision date bumped to June 2026 (WR-07/WR-08)"
    - "worker/src/index.js duplicate_count uses ?? 0 — first dup goes 0->1 not 0->2 (WR-01)"
    - "worker/src/index.js scrollY/viewportWidth/viewportHeight use ?? null — legitimate 0 values preserved (WR-03)"
    - "worker/tests/report-route.test.js adds PATENT_DEDUP_EXACT exact-value toBe(1) test; suite is 23/23 green"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Compare the REQUIREMENTS.md PRIV-01 spec ('required: [technicalAndInteraction,websiteActivity], optional: [websiteContent]') against AMO reviewer expectations for a voluntary, user-initiated feature. Consult AMO documentation for when 'required' vs 'optional' data-collection permissions are appropriate."
    expected: "A determination of whether the current 'required' placement for technicalAndInteraction/websiteActivity is accurate (unconditional at install) or whether all three types should be 'optional' (consent-gated, added at runtime before first report submission)."
    why_human: "Policy/compliance judgment call, not a code defect. The implementation matches PRIV-01 as written. The review argues the spec itself may cause AMO friction. Only the maintainer can decide whether to update PRIV-01 or accept AMO risk. (WR-06)"
  - test: "Evaluate whether to add /^\\d{6,8}$/ regex validation to validateReportBody() for patentNumber, and URL validation for patentUrl. The review identifies this as a Discord masked-link injection vector (PROXY_TOKEN is extractable from the public extension)."
    expected: "A decision on whether to fix in Phase 1 (add validation) or accept the risk with documentation (the endpoint is friction-only, not security per D-01)."
    why_human: "Requires threat model judgment — PROXY_TOKEN is described as 'friction not security'. The maintainer must decide if the phishing risk warrants the fix before Phase 2. (CR-01)"
  - test: "Build dist/firefox/ and run: npx web-ext lint dist/firefox/"
    expected: "Exit 0, no AMO-blocking warnings."
    why_human: "No Firefox build is available in this verification context. The plan explicitly deferred this to Phase 5 UAT-04."
---

# Phase 1: Worker Route + KV Schema + Privacy Compliance Groundwork — Verification Report

**Phase Goal:** The `POST /report` Cloudflare Worker route, `BUG_REPORTS` KV namespace, server-side fingerprint dedup + IP-keyed rate limit, and all store-submission compliance gates ship together so no compliant extension release can be made without them — blocking gates BLOCK-01 (privacy compliance), BLOCK-02 (webhook URL hygiene), BLOCK-03 (IP-not-in-KV) are all resolved here.
**Verified:** 2026-06-13T18:10:00Z
**Status:** human_needed
**Re-verification:** Yes — after gap closure (plan 01-03 executed; previous status: gaps_found, 11/15)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | Unauthenticated POST to /report returns 401 (Bearer gate inherited) | VERIFIED | Test "auth gate inherited (D-01)" passes; index.js auth gate precedes route dispatch; 23/23 suite green |
| 2 | Valid authenticated POST returns 201 with {ok:true, fingerprint, deduped:false}, writes KV record with report:{fp}:{ts} key and expirationTtl 7776000 | VERIFIED | index.js line 462-466 writes with expirationTtl 7776000; confirmed by passing test suite |
| 3 | Stored KV record contains NO ip, clientIp, or userAgent field | VERIFIED | buildKvRecord() at index.js:219-243 is an explicit allowlist with comment "NO: ip, clientIp, userAgent"; test asserts absence |
| 4 | Second identical submission within 15 min returns 200 deduped:true, increments duplicate_count to exactly 1, no new KV key | VERIFIED | WR-01 fixed: `(existing.duplicate_count ?? 0) + 1` at index.js:296; exact-value `toBe(1)` test at report-route.test.js:243 using PATENT_DEDUP_EXACT/IP_DEDUP_EXACT; 23/23 green |
| 5 | No Discord webhook fires for duplicate submission | VERIFIED | index.js returns 200 on isDuplicate with no ctx.waitUntil() call; Discord call only in new-record path |
| 6 | KV write canonical, Discord best-effort via ctx.waitUntil() | VERIFIED | index.js:480 ctx.waitUntil(postToDiscord(...)) runs after response is built; postToDiscord errors swallowed in try/catch |
| 7 | Discord embed is compact triage card (hyperlinked patent, category, confidence, note, version, browser/OS, fingerprint, color-coded) | VERIFIED | postToDiscord() implements full embed spec: CATEGORY_COLORS map, title "[category] — US{patentNumber}", all required fields, footer fp:{fingerprint}, allowed_mentions guard |
| 8 | selectionText appears as ~200-char snippet only when present; absent when toggled off | VERIFIED | index.js:321-323 produces selectionSnippet only when record.selectionText is truthy; spread conditional in embed fields |
| 9 | Unknown extra fields silently stripped (D-08) | VERIFIED | buildKvRecord() is explicit allowlist; test "extra fields in request body are not stored" covers this |
| 10 | POST missing patentNumber/extensionVersion or invalid category returns 400 | VERIFIED | validateReportBody() at index.js:194-208; 3 failing-validation tests pass |
| 11 | Body > 65536 bytes returns 413 (checked before JSON.parse) | VERIFIED | index.js reads as text first, checks length before parse; test passes |
| 12 | 6th request from same IP within 60s returns 429 with Retry-After header | VERIFIED | checkIpRateLimit() uses rl:{ip} KV key with 60s TTL and 5-request ceiling; test confirms 429 + Retry-After header |
| 13 | Discord webhook URL appears in no committed file | VERIFIED | grep for discord.com/api/webhooks/[0-9]+/ returns 0 results outside .planning/; webhook accessed via env.DISCORD_WEBHOOK_URL only |
| 14 | store-assets/store-listing.md Submission Checklist and Quick Reference agree with Subsection 4 — all instruct checking Website Content; no HTML in plain-text description | VERIFIED | Line 157: "Check **Website Content** (bug report selection text)"; line 176: "Website Content (voluntary bug reports only)"; line 128: "The extension includes a voluntary bug report feature, so check **Website Content**"; "All data type checkboxes unchecked" absent (grep:0); "Data collected \| None" absent (grep:0); `<a href=` absent (grep:0) |
| 15 | Privacy policy has no internal contradiction: 'Information We Collect' and 'Data Sharing' qualified for voluntary bug reports; revision date is June 2026 | VERIFIED | Line 92: "Last updated: June 2026"; line 97: "During normal citation use, we collect no personal information of any kind..."; line 125: "service providers (processors)"; "Last updated: March 2026" absent; standalone "No data is collected that could be shared." absent. Line 165 ("No data is shared with third parties") is scoped to Bug Report Feature destinations — Cloudflare and Discord are named in that same paragraph as the two destinations/processors, so the statement is accurate. Top-level Data Sharing section (line 125) resolves the tension by naming them as processors explicitly. No internal contradiction. |

**Score:** 15/15 truths verified

### Deferred Items

None — all truths are verified or carried as human verification items.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|---------|--------|---------|
| `worker/src/index.js` | POST /report route + all helper functions + WR-01/WR-03 fixes | VERIFIED | Route before USPTO fallthrough; duplicate_count uses `?? 0`; scrollY/viewportWidth/viewportHeight use `?? null` |
| `worker/wrangler.toml` | BUG_REPORTS KV namespace binding | VERIFIED | Second [[kv_namespaces]] block with binding="BUG_REPORTS" and real id cefe2733c0074fe2a28a49ff536de105 |
| `worker/src/report-schema.md` | PAY-01 field-allowlist compliance artifact | VERIFIED | 20-field table, KV key format, expirationTtl, excluded fields section |
| `worker/tests/report-route.test.js` | Integration tests with exact duplicate_count assertion | VERIFIED | 23 tests (up from 22); PATENT_DEDUP_EXACT + toBe(1) exact-count test added; 23/23 green |
| `worker/vitest.config.js` | DISCORD_WEBHOOK_URL test binding | VERIFIED | DISCORD_WEBHOOK_URL binding present |
| `src/manifest.firefox.json` | Updated data_collection_permissions (PRIV-01) | VERIFIED | required: ["technicalAndInteraction","websiteActivity"], optional: ["websiteContent"]; check script exits 0 |
| `docs/privacy/index.html` | Reconciled privacy policy — qualified claims, processors named, June 2026 date | VERIFIED | All three gap-closure edits confirmed: date, Information We Collect qualification, Data Sharing processor language |
| `store-assets/store-listing.md` | Internally consistent CWS data-use declaration | VERIFIED | All four edits confirmed: Subsection 4 definitive wording, Checklist Website Content, Quick Reference updated, HTML anchor removed |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| worker/src/index.js handleReport() | env.BUG_REPORTS | KV put/list/get against report:{fp}:{ts} and rl:{ip} keys | VERIFIED | env.BUG_REPORTS.put, .list, .get calls confirmed; 23/23 tests pass |
| worker/src/index.js postToDiscord() | env.DISCORD_WEBHOOK_URL | fetch POST inside ctx.waitUntil() | VERIFIED | ctx.waitUntil() at line 480; DISCORD_WEBHOOK_URL consumed in postToDiscord |
| worker/vitest.config.js miniflare.bindings | worker/wrangler.toml BUG_REPORTS | Miniflare auto-wires KV from wrangler.toml configPath | VERIFIED | configPath: './wrangler.toml' in vitest.config.js; 23/23 tests pass |
| store-assets/store-listing.md Checklist (line 157) | store-assets/store-listing.md Subsection 4 (line 128) | both instruct checking Website Content | VERIFIED | Both contain "Check **Website Content**"; no contradicting text remains |
| docs/privacy/index.html Information We Collect (line 97) | docs/privacy/index.html Bug Report Feature section | qualified carve-out scopes the absolute claim to normal citation use | VERIFIED | "During normal citation use, we collect no personal information...If you voluntarily submit a bug report, the data described in the Bug Report Feature section below is collected." |
| worker/src/index.js checkAndHandleDuplication() | worker/src/report-schema.md duplicate_count contract | ?? 0 increment matches "initialized to 0, incremented on each dup" | VERIFIED | `(existing.duplicate_count ?? 0) + 1` at line 296; exact-value toBe(1) test guards regression |

### Data-Flow Trace (Level 4)

Not applicable — this phase produces a server-side Worker route and static documentation files, not a component rendering dynamic data. Worker route data flow verified through test execution (23/23 green).

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All 23 report route tests pass | cd worker && npm test | 23 passed (2 files) in 3.31s | PASS |
| duplicate_count uses ?? 0 (WR-01 fix) | grep "?? 0" worker/src/index.js | line 296 match | PASS |
| scrollY/viewportWidth/viewportHeight use ?? null (WR-03 fix) | grep "scrollY.*?? null" worker/src/index.js | lines 233-235 match | PASS |
| exact-value toBe(1) duplicate_count test present | grep "toBe(1)" worker/tests/report-route.test.js | line 243 match | PASS |
| store-listing.md Checklist instructs Website Content | grep "Check \*\*Website Content\*\*" | line 157 match | PASS |
| store-listing.md "All data type checkboxes unchecked" absent | grep count | 0 | PASS |
| store-listing.md Quick Reference row updated | grep "Website Content (voluntary bug reports only)" | line 176 match | PASS |
| store-listing.md HTML anchor absent | grep "<a href=" | 0 matches | PASS |
| Privacy policy revision date is June 2026 | grep "Last updated: June 2026" | line 92 match | PASS |
| Privacy policy "During normal citation use" qualifier present | grep "During normal citation use, we collect" | line 97 match | PASS |
| Privacy policy Data Sharing names processors | grep "service providers (processors)" | line 125 match | PASS |
| "Last updated: March 2026" absent | grep count | 0 | PASS |
| Standalone "No data is collected that could be shared." absent | grep (not followed by "Outside") | 0 | PASS |
| BUG_REPORTS KV binding real (no placeholder) | grep in wrangler.toml | id = "cefe2733c0074fe2a28a49ff536de105" | PASS |
| Discord webhook URL not committed | grep -rE discord.com/api/webhooks/[0-9]+/ | 0 results | PASS |
| .dev.vars gitignored | git check-ignore -v worker/.dev.vars | worker/.gitignore:2:.dev.vars | PASS |

### Probe Execution

No probe scripts declared or found for this phase.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| XPORT-01 | Plan 01 | POST /report route in index.js before USPTO proxy | SATISFIED | index.js route before USPTO fallthrough; dispatches to handleReport() |
| XPORT-02 | Plan 01 | BUG_REPORTS KV namespace binding in wrangler.toml | SATISFIED | wrangler.toml second [[kv_namespaces]] block with real namespace id |
| XPORT-03 | Plan 01 | Webhook URL never in committed file | SATISFIED | grep returns 0 results outside .planning/ |
| XPORT-04 | Plan 01 | worker/.dev.vars gitignored | SATISFIED | worker/.gitignore confirmed via git check-ignore |
| PAY-01 | Plan 01 | Explicit field allowlist KV schema in report-schema.md | SATISFIED | 20-field table in report-schema.md; buildKvRecord() matches |
| PAY-02 | Plan 01 | KV key format report:{fingerprint}:{timestamp}, expirationTtl 7776000 | SATISFIED | index.js builds key; puts with expirationTtl 7776000 |
| PAY-03 | Plan 01 | No ip/clientIp/userAgent in KV record | SATISFIED | buildKvRecord() allowlist explicit; test asserts absence |
| PAY-04 | Plan 01 | SHA-256 fingerprint of patent\|category\|selectionHash | SATISFIED | computeFingerprint() uses crypto.subtle.digest |
| PRIV-01 | Plan 02 | Firefox manifest data_collection_permissions updated | SATISFIED | manifest.firefox.json updated; check script passes |
| PRIV-02 | Plan 02 | Chrome manifest verified unchanged | SATISFIED | manifest.json untouched; PRIV-02 is verify-only |
| PRIV-03 | Plan 02 | Privacy policy Bug Report Feature section with reconciled absolute claims | SATISFIED | Section present with field-by-field disclosure; "Information We Collect" and "Data Sharing" now qualified; revision date June 2026 |
| PRIV-04 | Plan 02 | Store listing data-use declaration updated and internally consistent | SATISFIED | All four edits confirmed; Checklist, Quick Reference, and Subsection 4 agree on Website Content |
| PRIV-05 | Plan 02 | web-ext lint clean after manifest edit | NEEDS HUMAN | No dist/firefox/ build available; deferred to Phase 5 UAT-04 per plan's explicit allowance |
| LIMIT-01 | Plan 01 | Fingerprint dedup with 15-min window; duplicate_count goes 0->1 on first dup | SATISFIED | checkAndHandleDuplication() uses `?? 0`; toBe(1) exact-value test guards it; 23/23 green |
| LIMIT-02 | Plan 01 | IP-keyed rate limit 5/60s via rl:{ip} KV key | SATISFIED | checkIpRateLimit() uses rl:{ip} with 60s TTL and 5-request ceiling; test confirms 429 + Retry-After |

### Anti-Patterns Found

All BLOCKER anti-patterns from the initial verification are resolved. Remaining items are deferred WARNING-level issues documented for Phase 2 planning awareness:

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| worker/src/index.js | 411 | checkIpRateLimit() has no test-mode guard | WARNING | Test-mode requests still write rl:{ip} KV keys; CI runs consume rate budget (WR-02) — deferred to Phase 2 |
| worker/src/index.js | 198 | patentNumber not format-validated | WARNING | No /^\d{6,8}$/ regex; allows arbitrary strings including Discord embed injection (CR-01) — human verification item |
| docs/privacy/index.html | 165 | "No data is shared with third parties" inside Bug Report Feature section | INFO | Wording is locally accurate (Cloudflare + Discord named as the only destinations in the same paragraph). Top-level Data Sharing (line 125) resolves the macro-level tension. No contradiction. Optional wording polish deferred per plan. |
| worker/tests/report-route.test.js | all non-test-mode tests | Real outbound network attempts to discord.example.com | INFO | TLS errors visible in stderr; tests pass because errors are swallowed (WR-10) — deferred to Phase 2 |

### Human Verification Required

#### 1. Firefox manifest required vs optional review (WR-06)

**Test:** Compare the REQUIREMENTS.md PRIV-01 spec ("required: ['technicalAndInteraction','websiteActivity'], optional: ['websiteContent']") against AMO reviewer expectations for a voluntary, user-initiated feature. Consult AMO documentation for when "required" vs "optional" data-collection permissions are appropriate.
**Expected:** A determination of whether the current "required" placement for technicalAndInteraction/websiteActivity is accurate (unconditional at install) or whether all three types should be "optional" (consent-gated, added at runtime before first report submission).
**Why human:** This is a policy/compliance judgment call, not a code defect. The implementation matches PRIV-01 as written. The review argues the spec itself may cause AMO friction. Only the maintainer can decide whether to update PRIV-01 or accept AMO risk.

#### 2. patentNumber format validation scope decision (CR-01)

**Test:** Evaluate whether to add `/^\d{6,8}$/` regex validation to validateReportBody() for patentNumber, and URL validation for patentUrl. The review identifies this as a Discord masked-link injection vector (PROXY_TOKEN is extractable from the public extension).
**Expected:** A decision on whether to fix before Phase 2 (add validation) or accept the risk with documentation (the endpoint is friction-only, not security per D-01).
**Why human:** Requires threat model judgment — PROXY_TOKEN is described in the plans as "friction not security" (D-01). The maintainer must decide if the phishing risk to the deploy-access holder warrants the fix before Phase 2.

#### 3. PRIV-05 web-ext lint clean (deferred per plan)

**Test:** Build `dist/firefox/` and run `npx web-ext lint dist/firefox/`.
**Expected:** Exit 0, no AMO-blocking warnings.
**Why human:** No Firefox build is available in this verification context. The plan explicitly deferred this to Phase 5 UAT-04.

### Gaps Summary

No automated gaps remain. All four gap-closure items from plan 01-03 are verified:

1. **CR-02 (store-listing.md internal consistency)** — CLOSED. Submission Checklist (line 157), Quick Reference (line 176), and Subsection 4 (line 128) all now instruct checking Website Content. HTML anchor removed from plain-text description. Old contradicting strings absent.

2. **WR-07/WR-08 (privacy policy reconciliation)** — CLOSED. "Information We Collect" scoped to normal citation use (line 97). "Data Sharing" names Cloudflare/Discord as processors (line 125). Revision date is June 2026 (line 92). Line 165 "No data is shared with third parties" is locally accurate within the Bug Report Feature section; no internal contradiction with the updated Data Sharing section.

3. **WR-01 (duplicate_count off-by-one)** — CLOSED. `(existing.duplicate_count ?? 0) + 1` at line 296; exact-value `toBe(1)` test at report-route.test.js:243 using PATENT_DEDUP_EXACT/IP_DEDUP_EXACT. Suite 23/23 green.

4. **WR-03 (falsy-zero coercion)** — CLOSED. `scrollY ?? null`, `viewportWidth ?? null`, `viewportHeight ?? null` at lines 233-235.

Three items remain as human verification (WR-06 AMO policy judgment, CR-01 threat model scope decision, PRIV-05 web-ext lint) — these are maintainer judgment calls, not automated-check failures, consistent with the prior verification classification.

---

_Verified: 2026-06-13T18:10:00Z_
_Verifier: Claude (gsd-verifier)_
_Re-verification: Yes — gaps_found (11/15) -> human_needed (15/15) after plan 01-03 gap closure_

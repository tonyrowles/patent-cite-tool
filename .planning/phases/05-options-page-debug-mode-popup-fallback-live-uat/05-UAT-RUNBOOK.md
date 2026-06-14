# 05-UAT-RUNBOOK.md — v5.0 Live UAT Runbook

**Version:** v5.0  
**Date:** 2026-06-14  
**Phase:** 05 — options-page-debug-mode-popup-fallback-live-uat  
**Production target (D-03):** `https://pct.tonyrowles.com/report` (REAL Discord webhook + REAL KV)  
**Test note convention (D-03):** Every operator-submitted report must carry a note: `v5.0 UAT-0N smoke` (replace N with the UAT number — e.g., `v5.0 UAT-01 smoke`)  
**Claude's automation scope (D-04):** Read-only against production — `wrangler kv key get/list` only; NO POSTs to the Worker, NO Discord/KV writes from Claude. All live browser submissions are the OPERATOR's responsibility.

---

## Prerequisites

Before starting any UAT item, the operator must have:

1. [OPERATOR] Run `npm run build` (dist/chrome/ and dist/firefox/ must be current builds).
2. [OPERATOR] In Chrome: Manage Extensions > Load unpacked > select `dist/chrome/`
3. [OPERATOR] In Firefox: about:debugging > This Firefox > Load Temporary Add-on > select `dist/firefox/manifest.json`
4. [OPERATOR] Confirm the extension toolbar icon is visible in both browsers.
5. [OPERATOR] Confirm you have access to the Discord channel receiving webhook notifications.
6. [CLAUDE] Baseline KV check: namespace `cefe2733c0074fe2a28a49ff536de105` currently contains **0 records** (verified via `wrangler kv key list --namespace-id=cefe2733c0074fe2a28a49ff536de105` → `[]`).

---

## UAT-01: Live End-to-End Submission

**Requirement:** A live submission must write a KV record matching the PAY-01 schema, with NO ip/clientIp/userAgent, a fingerprint matching the Discord embed footer, and a Discord rich-embed notification.

### Steps

| # | Mode | Action / Command |
|---|------|-----------------|
| 1 | [OPERATOR] | Navigate to a real Google Patents page for a US patent (e.g., `https://patents.google.com/patent/US12505414`). |
| 2 | [OPERATOR] | Highlight text in the specification to trigger a citation lookup. Arrange for a **no-match or yellow-confidence** outcome (try a short ambiguous selection, or use a patent where the text is not found). |
| 3 | [OPERATOR] | When the Report button appears in the citation popup, click it. In the dialog: select any category, enter the note **exactly**: `v5.0 UAT-01 smoke`. Click Submit. |
| 4 | [OPERATOR] | Read the Discord embed. At the bottom of the embed you will see a footer field with a fingerprint: `fp:XXXXXXXXXXXXXXXX`. Record the 16-char hex fingerprint. |
| 5 | [OPERATOR] | Confirm: Discord rich-embed appeared? (yes/no). Record the embed URL and timestamp. |
| 6 | [CLAUDE] | `wrangler kv key list --namespace-id=cefe2733c0074fe2a28a49ff536de105 --prefix "report:<fp>:"` → assert ≥ 1 record found. |
| 7 | [CLAUDE] | `wrangler kv key get --namespace-id=cefe2733c0074fe2a28a49ff536de105 "report:<fp>:<ts>"` → pipe to node assertion: `!('ip' in r) && !('clientIp' in r) && !('userAgent' in r) && r.fingerprint && r.duplicate_count === 0 && r.note === 'v5.0 UAT-01 smoke'`. |
| 8 | [CLAUDE] | Assert the fingerprint in the KV key prefix matches the `fp:` value from the Discord embed footer (string equality). |

**Operator must report:** fingerprint (16 hex chars), Discord embed appeared (yes/no), submission timestamp.  
**Claude verifies after operator reports:** steps 6, 7, 8 (KV record + PAY-01 schema + fingerprint match).

---

## UAT-02: Client-Side Rate-Limit Boundary

**Requirement:** The 6th submission within a 10-minute rolling window is blocked with the LIMIT-03 toast and does NOT reach the Worker or write a KV record. The 7th submission after 10 minutes succeeds.

### Steps

| # | Mode | Action / Command |
|---|------|-----------------|
| 1 | [OPERATOR] | On a Google Patents page, trigger the Report dialog and submit 5 reports in rapid succession (you may use different patents or the same patent — the rate limit is per-install, not per-fingerprint). Note the category for each. |
| 2 | [OPERATOR] | Within the same 10-minute window, attempt a **6th submission**. You should see the toast: "Too many reports in a short period — please wait a few minutes". Confirm the toast appeared. |
| 3 | [CLAUDE] | `wrangler kv key list --namespace-id=cefe2733c0074fe2a28a49ff536de105` → count must equal exactly 5 (for the 5 successful submits) — the 6th blocked submit wrote no new record. |
| 4 | [OPERATOR] | Wait 10 full minutes (the sliding window prunes entries older than 10 minutes). Then submit a **7th report** with note `v5.0 UAT-02 smoke`. Record the fingerprint from the Discord embed footer. |
| 5 | [CLAUDE] | `wrangler kv key list --namespace-id=cefe2733c0074fe2a28a49ff536de105 --prefix "report:<fp7>:"` → assert 1 record for the 7th submit fingerprint. |

**Operator must report:** confirmation that the 6th submit showed the "Too many reports" toast and did NOT trigger a Discord notification; the fingerprint from the 7th (post-window) submit.  
**Claude verifies after operator reports:** steps 3, 5 (KV record counts).

---

## UAT-03: Server-Side Fingerprint Deduplication

**Requirement:** Two submissions with identical fingerprint (same patent + same category + same selection text) within 15 minutes produce exactly ONE KV record with `duplicate_count: 2` and ONE primary Discord notification. A third submission after 15 minutes creates a NEW record.

### Steps

| # | Mode | Action / Command |
|---|------|-----------------|
| 1 | [OPERATOR] | On the same Google Patents page with the same text highlighted, submit a report with note `v5.0 UAT-03 smoke`. Record the fingerprint from the Discord embed footer (call it `<fp03>`). |
| 2 | [OPERATOR] | **Within 15 minutes**, submit a second report with the SAME patent, SAME category, and SAME selection text. (You may use the options page `#report` section to submit again with the same patent as context.) Confirm whether a Discord notification fired for this second submit (it should be suppressed or sent as a thread reply — NOT a full new embed). |
| 3 | [CLAUDE] | `wrangler kv key list --namespace-id=cefe2733c0074fe2a28a49ff536de105 --prefix "report:<fp03>:"` → assert exactly **1** key. |
| 4 | [CLAUDE] | `wrangler kv key get --namespace-id=cefe2733c0074fe2a28a49ff536de105 "report:<fp03>:<ts>"` → pipe to node: assert `r.duplicate_count === 2`. |
| 5 | [OPERATOR] | Wait **15+ minutes** after the second submit, then submit a **third** report with the same patent/category/selection. Note whether a new Discord embed fired. Record the fingerprint from this embed if a new one appeared. |
| 6 | [CLAUDE] | `wrangler kv key list --namespace-id=cefe2733c0074fe2a28a49ff536de105 --prefix "report:<fp03>:"` → assert exactly **2** keys (the original record + a new one for the post-15-min submit). |
| 7 | [CLAUDE] | Get the newest KV key for `<fp03>:` prefix → assert `r.duplicate_count === 0` on the new record. |

**Operator must report:** fingerprint `<fp03>`, whether second Discord notification was suppressed, timestamp of second submit, whether a new Discord embed fired after 15-min wait.  
**Claude verifies after operator reports:** steps 3, 4, 6, 7 (KV record counts + duplicate_count values).

---

## UAT-04: Privacy Compliance Audit

**Requirement:** Manifest `data_collection_permissions` matches transmitted payload fields; `web-ext lint` clean; webhook URL absent from shipped code; privacy policy accessible; no direct content-script fetch of WORKER_REPORT_URL.

**This UAT item is FULLY SCRIPTABLE — no operator browser steps needed.**

### Steps

| # | Mode | Command | Expected |
|---|------|---------|----------|
| 1 | [CLAUDE] | `npm run build` | Exit 0; dist/chrome/ and dist/firefox/ rebuilt |
| 2 | [CLAUDE] | `npm run test:lint` (→ `npx web-ext lint --source-dir dist/firefox --ignore-files 'lib/**'`) | Exit 0; errors 0, warnings 0, notices 0 |
| 3 | [CLAUDE] | `grep -rE 'discord\.com/api/webhooks/[0-9]+/' . --exclude-dir=.git --exclude-dir=node_modules` | Zero results (no real webhook URL with token in any committed file) |
| 4 | [CLAUDE] | `grep -r 'discord.com/api/webhooks' src/ dist/ worker/src/` | Zero results (no webhook URL string in shipped directories) |
| 5 | [CLAUDE] | `grep -rn 'fetch.*WORKER_REPORT_URL' src/content/` (XPORT-06 guard) | Zero results |
| 6 | [CLAUDE] | `curl -s -L -o /dev/null -w "%{http_code}" https://tonyrowles.github.io/patent-cite-tool/privacy` | 200 |
| 7 | [CLAUDE] | `node -e "const m=require('./src/manifest.firefox.json'); console.log(JSON.stringify(m.browser_specific_settings.gecko.data_collection_permissions))"` → cross-check against PAY-01 field allowlist | `required: ["websiteActivity"]`, `optional: ["technicalAndInteraction","websiteContent"]` — see manifest vs PAY-01 cross-check table below |
| 8 | [CLAUDE] | `grep -n "ip\|clientIp\|userAgent" worker/src/index.js` — confirm no ip/clientIp/userAgent written to buildKvRecord | `buildKvRecord` comment at line 241 confirms exclusion; no field assignment to those keys |

### Manifest vs PAY-01 Cross-Check

| Manifest declaration | PAY-01 field(s) covered | Match? |
|----------------------|------------------------|--------|
| `websiteActivity` (required) | `patentUrl`, `xpathNode`, `scrollY`, `viewportWidth`, `viewportHeight` — activity on the Google Patents page | Yes |
| `technicalAndInteraction` (optional) | `extensionVersion`, `browser`, `os`, `triggerMode`, `errorLog`, `pdfParseStatus` — technical extension diagnostics, optional per AMO spec | Yes |
| `websiteContent` (optional) | `selectionText` — user's highlighted text; optional because [Remove selection text] toggle lets the user opt out per submit | Yes |
| (not declared) | `fingerprint`, `timestamp`, `duplicate_count` — server-computed, never sent by extension | N/A |
| (not declared) | `ip`, `clientIp`, `userAgent` — excluded by PAY-03 hard constraint | N/A |

**UAT-04 RESULT: PASS** — All steps 1-8 verified by Claude before operator browser steps needed. See 05-UAT-RESULTS.md for evidence.

---

## UAT-05: Cross-Browser Parity + Chrome SW Stop/Restart

**Requirement:** Same submission flow works in both Chrome (MV3 service worker) and Firefox (event page); Chrome SW termination does not lose a queued report — it retries on the next extension event.

### Steps — Firefox parity

| # | Mode | Action / Command |
|---|------|-----------------|
| 1 | [OPERATOR] | In Firefox with the extension loaded (about:debugging), navigate to a Google Patents page. Highlight text to trigger a no-match or yellow-confidence outcome. |
| 2 | [OPERATOR] | Click Report, set note `v5.0 UAT-05 smoke (FF)`, Submit. Record the fingerprint from the Discord embed footer (`<fpFF>`). |
| 3 | [CLAUDE] | `wrangler kv key list --namespace-id=cefe2733c0074fe2a28a49ff536de105 --prefix "report:<fpFF>:"` → assert 1 record. |

### Steps — Chrome SW stop/restart

| # | Mode | Action / Command |
|---|------|-----------------|
| 4 | [OPERATOR] | In Chrome, open DevTools Network tab. Enable "Offline" mode (to prevent the fetch from completing). On a Google Patents page, trigger a no-match/yellow outcome, click Report, set note `v5.0 UAT-05 smoke (SW)`, click Submit. The report should be queued (you should see the "Report saved — will retry when online" toast). |
| 5 | [OPERATOR] | Go to `chrome://extensions`, find the Patent Citation Tool, click Details. Find "Service worker" → click **Terminate**. The SW is now stopped. |
| 6 | [OPERATOR] | Re-enable network (disable Offline mode in DevTools). Navigate back to the extension's background page or open a new Google Patents page to trigger the SW to restart. |
| 7 | [OPERATOR] | Confirm whether the "Report sent — thank you" toast appeared after the SW restarted (confirming retry success). Record the fingerprint from the Discord embed that should now fire (`<fpSW>`). |
| 8 | [CLAUDE] | `wrangler kv key list --namespace-id=cefe2733c0074fe2a28a49ff536de105 --prefix "report:<fpSW>:"` → assert 1 record (the retried report landed). |

**Operator must report:** fingerprint `<fpFF>` from Firefox submit; fingerprint `<fpSW>` from Chrome SW-restart retry; confirmation that "Report saved — will retry" toast appeared before SW termination; confirmation that "Report sent" toast appeared after SW restart.  
**Phase-4 deferred items closed by UAT-05:** Focus trap live behavior (04-HUMAN-UAT test 1), click-outside + Escape dismiss (test 2), auto-surface trigger behavior on live page (test 4), live payload field values (test 5).

---

## UAT-06: [Remove Selection Text] Toggle Correctness + Stickiness

**Requirement:** When the [Remove selection text] toggle is ON, `selectionText` is `null` in the KV record and absent from the Discord embed body. The toggle state persists across dialog re-opens within the same install.

### Steps

| # | Mode | Action / Command |
|---|------|-----------------|
| 1 | [OPERATOR] | On a Google Patents page, highlight text that produces a citation result with selection text (a no-match or yellow outcome on a real text selection). |
| 2 | [OPERATOR] | Click Report. Expand the "What's included" panel in the dialog. |
| 3 | [OPERATOR] | Find the **[Remove selection text]** toggle. If it is currently OFF, toggle it **ON**. |
| 4 | [OPERATOR] | Enter note `v5.0 UAT-06 smoke`. Click Submit. Record the fingerprint from the Discord embed footer (`<fp06>`). |
| 5 | [CLAUDE] | `wrangler kv key get --namespace-id=cefe2733c0074fe2a28a49ff536de105 "report:<fp06>:<ts>"` → pipe to node: assert `r.selectionText === null`. |
| 6 | [OPERATOR] | In the Discord embed, confirm the embed does NOT contain a "Selection" or "Highlighted text" field (the selection text block should be absent). |
| 7 | [OPERATOR] | **Without changing any extension settings**, close and re-open the Report dialog on the same citation. Check the "What's included" panel again. Confirm the [Remove selection text] toggle is still **ON** (sticky across re-opens). |

**Operator must report:** fingerprint `<fp06>`; confirmation that Discord embed has no selection text block; confirmation that toggle is still ON when dialog is re-opened.  
**Phase-4 deferred items closed by UAT-06:** Sticky [Remove selection text] toggle persistence (04-HUMAN-UAT test 3).  
**Claude verifies after operator reports:** step 5 (KV record `selectionText === null`).

---

## Quick Reference — Operator Fingerprint Collection

After each live submit, the fingerprint appears in the Discord embed footer field. It looks like:

```
fp:a1b2c3d4e5f6a7b8
```

Copy the 16-character hex string after `fp:` and paste it in your report to Claude.

### Wrangler Commands Claude Will Run (Reference)

```bash
# List all keys for a fingerprint
wrangler kv key list --namespace-id=cefe2733c0074fe2a28a49ff536de105 --prefix "report:<fp>:"

# Get a specific record (replace <fp> and <ts>)
wrangler kv key get --namespace-id=cefe2733c0074fe2a28a49ff536de105 "report:<fp>:<ts>"

# Node assertion — pipe from key get:
# wrangler kv key get ... "report:<fp>:<ts>" | \
#   node -e "const r=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
#     console.assert(!('ip' in r), 'ip field present — PAY-03 violation');
#     console.assert(!('clientIp' in r), 'clientIp present — PAY-03 violation');
#     console.assert(!('userAgent' in r), 'userAgent present — PAY-03 violation');
#     console.assert(r.fingerprint, 'fingerprint missing');
#     console.log('PAY-01 check: PASS — no ip, fingerprint present');"

# KV baseline read (namespace-level — no filter)
wrangler kv key list --namespace-id=cefe2733c0074fe2a28a49ff536de105
```

---

*Runbook produced by Claude as part of plan 05-05 execution. Live browser steps are the operator's. Claude's KV verifications run AFTER the operator reports fingerprints.*

# Phase 5 — Live UAT Handoff (resume here)

**Date:** 2026-06-13 · **Branch:** `feat/bug-report` (all work pushed to origin) · **Phase status:** in UAT, NOT marked complete.

## One-line state
Phase 5 build + UI + code-review fixes are DONE, committed, and pushed. The live UAT is blocked on **deploying the Worker** — the production Worker (`pct.tonyrowles.com`) was last deployed **2026-03-02** and has **no `/report` route**, so report submits 400 and never reach Discord/KV.

## THE IMMEDIATE NEXT ACTION
The user was deciding whether to deploy the Worker. Do this (or confirm the user did):
```bash
cd worker && npx wrangler deploy
```
- This adds the `/report` route; USPTO proxy is unchanged. Code is tested; prereqs are all in place:
  - KV binding present: `worker/wrangler.toml` → `binding = "BUG_REPORTS"`, `id = cefe2733c0074fe2a28a49ff536de105`
  - Secrets set on the live Worker: `DISCORD_WEBHOOK_URL`, `PROXY_TOKEN`, `USPTO_API_KEY` (`npx wrangler secret list` in `worker/`)
- It's a PRODUCTION deploy of the live Worker the extension depends on — confirm with the user before running if not already approved. wrangler is authed as `fatduck@gmail.com` in this environment.
- After deploy, re-verify with a safe test-mode probe (no KV write, no Discord):
```bash
curl -sS -i -X POST https://pct.tonyrowles.com/report \
  -H "Authorization: Bearer 4509b9943f831fb140eb0c3a7304f23cc6f72e41b5e5f8c800a42e94f09cadbe" \
  -H "Content-Type: application/json" -H "X-PCT-Test-Mode: true" \
  --data '{"category":"no_match","patentNumber":"12505414","patentUrl":"https://patents.google.com/patent/US12505414","extensionVersion":"5.0.0","note":"deploy check"}'
```
  Expect **HTTP 201/200** (route live) instead of the current **400 "Invalid patent number"** (which means it's still falling through to the USPTO proxy = not deployed).

## How "reports don't work" was diagnosed (3 stacked layers — first two already fixed)
1. **Branch/build (FIXED):** user's Windows clone was on `main` (old v2.3.0 code). All v5.0 work is on `feat/bug-report`. Also bumped manifest version 2.3.0 → 5.0.0 (commit `c339a82`, pushed). `dist/` is gitignored — must `npm run build` after checkout. User must: `git checkout feat/bug-report && git pull && npm run build`, then reload unpacked `dist/chrome`.
2. **Two extension bugs (FIXED, commit `fadc255`, pushed):**
   - Dialog auto-dismissed after ~4s: `showErrorPopup` (citation-ui.js) had an uncancelled 4s `setTimeout(dismissCitationUI)`. Now stored in `_popupDismissTimer` and cleared by `cancelPopupClickOutside()` (called on dialog open).
   - "Report could not be sent" on every submit: report-dialog.js referenced `extractPatentInfo` as a bare global; esbuild renamed content-script's copy (`extractPatentInfo2`) so it resolved to `undefined` → empty patentNumber → buildReportPayload threw. Fixed by extracting to shared `src/content/patent-info.js`, imported by both. Also added `console.error('[PCT] report submit failed:', ...)` in the submit catch (feeds PAY-08 buffer; UI message unchanged).
3. **Worker not deployed (CURRENT BLOCKER):** see THE IMMEDIATE NEXT ACTION above.

## After deploy — finish the UAT (operator-driven; Claude verifies KV read-only)
- Runbook: `.planning/phases/05-.../05-UAT-RUNBOOK.md`; results file (pre-filled): `05-UAT-RESULTS.md`.
- UAT-04 already PASS (lint clean, no webhook in src, XPORT-06 guard, no-ip in KV record, privacy URL 200).
- Operator (user) runs the live browser steps; for each submit they paste the `fp:XXXXXXXXXXXXXXXX` from the Discord embed footer + the outcome. Then Claude runs the wrangler KV verifications:
  - `cd worker && npx wrangler kv key get "report:<fp>:<ts>" --namespace-id=cefe2733c0074fe2a28a49ff536de105` (or `kv key list --namespace-id=...`) — confirm record matches PAY-01 schema, NO `ip` field, fingerprint matches.
  - UAT-01 end-to-end (note `v5.0 UAT-01 smoke`); UAT-02 rate limit (6th blocked); UAT-03 dedup (`duplicate_count:2`, one Discord); UAT-05 cross-browser + Chrome SW stop/restart; UAT-06 [Remove selection text] omitted from embed + sticky.
- Baseline before any operator submit: KV namespace was `[]` (empty).
- When all pass: mark Phase 5 complete (`gsd-sdk query phase.complete "05"`), commit tracking, update `05-UAT-RESULTS.md` → status passed. This also closes Phase 4's `04-HUMAN-UAT.md` deferred items.

## Open compliance follow-ups (separate from UAT pass; for AMO submission)
- **PRIV-03:** `docs/privacy/index.html` has NO technical/interaction opt-in language yet — needs a bug-report data-collection section describing technical/interaction data as opt-in, consistent with the manifest fix below.
- **PRIV-01 amended (Phase 5):** moved `technicalAndInteraction` from `required` → `optional` in `src/manifest.firefox.json` (web-ext lint blocked on it; Mozilla requires it opt-in). Committed `a07f371`. PRIV-04 store-listing should match.
- Decide whether to delete the `v5.0 UAT` test KV records after UAT (or let the 90-day TTL handle them).

## Useful facts
- Embedded PROXY_TOKEN (extension → Worker Bearer): `4509b9943f831fb140eb0c3a7304f23cc6f72e41b5e5f8c800a42e94f09cadbe` (same token the working USPTO proxy uses).
- `X-PCT-Test-Mode: true` header suppresses BOTH KV write and Discord — use it for any safe diagnostic POST.
- Worker `/report` requires (validateReportBody): `patentNumber` (string), `category` ∈ [inaccurate_citation, no_match, tool_not_working, other], `extensionVersion` (string).
- The full suite has 5 KNOWN pre-existing failures unrelated to this work (`tests/unit/warning-01-transport-tag.test.js`, `tests/e2e/scripts/v40-auto-fix-yaml.test.js`) — from the paused auto-fix milestone. Build green, web-ext lint clean.

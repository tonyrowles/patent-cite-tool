# Worker findings for v6.0 Phase 6 (from the 5.0.1 matching-hotfix session)

Date: 2026-06-16. Source: debugging the v5.0.0 "No match found" regression (resolved →
shipped as v5.0.1). While diagnosing the USPTO fallback I found two worker-side issues that
belong to the v6.0 Phase 6 (Security Gate + Worker Auth Split) work, since that session owns
`worker/src/index.js` and has already deployed to production. Do NOT patch the worker from a
5.0.x branch — coordinate here.

---

## Finding A — ⚠️ Production token rotation broke worker access for live 5.0.x extensions

The deployed worker at `pct.tonyrowles.com` now returns **HTTP 401 on every route** for the
old Bearer `PROXY_TOKEN` — `/cache`, `/?patent`, and no-auth all 401. The Phase 6 token
rotation / auth split is live in production.

Impact on what's in users' browsers right now:
- The **shipped v5.0** extension AND **v5.0.1** (just released) carry the OLD literal token
  (`4509b994…cadbe`) → all their worker calls 401.
- **Citations still work** — grant patents fetch the PDF from Google Patents (primary path,
  no worker). A 401 on `/cache` degrades gracefully to a local rebuild.
- **Lost for 5.0.x users:** server-side position-map cache (every lookup rebuilds locally —
  slower) and the USPTO fallback.

Decision needed: rotating the production token while old-token extensions are live in the
store breaks their worker access. Either
1. have the worker **accept BOTH old and new tokens** during the transition window, or
2. hold the rotation until a v6.0 extension (with the CI-injected new token) ships.

(Recommend option 1 — the store-review + user-update lag means old-token clients will be live
for weeks.)

## Finding B — The USPTO eGrant fallback is broken at the *design* level

`fetchEgrantPdf` assumes the issued-patent PDF lives in the ODP application file-wrapper under
documentCode `EGRANT.PDF`. Verified against the live ODP API (key from `worker/.dev.vars`):

| Patent | App | Grant PDF in file wrapper? |
|--------|-----|----------------------------|
| US10617174 | 16230907 | yes — code `TRACK1.GRANT` (Track-One) |
| US10178508 | 15791413 | **no** — only `ISSUE.NTF` + prosecution docs |
| US9000000 | 13797259 | **no** |
| US10000000 | 14643719 | **no** |
| US8000000 | 11874690 | **no** |

So `?documentCodes=EGRANT.PDF` + the narrow code/desc match finds nothing for most patents,
and even a broader `*GRANT*` match wouldn't help — the granted-patent PDF simply isn't in the
file-wrapper documents endpoint for most applications. This needs a **different PDF source**
(a different ODP product/endpoint, or just keep relying on Google Patents, which reliably has
these). Not a one-line code fix. Lower priority than Finding A.

## Why this is owned by Phase 6

`worker/src/index.js` is being rewritten by Phase 6 (per-route auth split, 404-line diff vs
v5.0). Any fallback fix should land in that rewrite, and the token-transition decision is part
of the SEC-01/02 rotation scope.

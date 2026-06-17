---
phase: 09-deploy-live-uat-privacy
status: complete
completed: 2026-06-16
requirements: [DEPLOY-01, DEPLOY-02, DEPLOY-03, DEPLOY-04, PRIV-01]
---

# Phase 9 Summary — Deploy + Live UAT + Privacy

## Autonomous deliverables (complete)

- **DEPLOY-01** (already shipped Phase 8): `scripts/build.js` `buildWebapp()` + `--webapp-only`
  produces `dist/webapp/` (index.html + app.bundle.js + lib/pdf.mjs + lib/pdf.worker.mjs).
- **DEPLOY-02**: `deploy:webapp` npm script added =
  `npm run build:webapp && wrangler deploy -c webapp/wrangler.toml`. `webapp/wrangler.toml`
  has the Workers-Assets `[assets] directory = "../dist/webapp"` block (no `main`, no `[site]`).
  Build half verified (exits 0, no PROXY_TOKEN needed). wrangler 4.54.0 present.
- **PRIV-01**: `docs/privacy/index.html` gained a "Citation Webapp (cite.tonyrowles.com)" section —
  no new personal data; PDFs proxied via the Worker `/webapp/pdf` (not Google CDN directly); position
  maps cached in the shared first-party KV; localStorage prefs never transmitted; Origin-only auth
  (no token / no Authorization header); deterministic, no AI.

## Human-pending (operator — Cloudflare auth + browser required)

- **DEPLOY-03**: `npm run deploy:webapp` to publish to `cite.tonyrowles.com` via Workers Assets,
  coexisting with the routed `pct.tonyrowles.com` Worker. Custom-domain binding for
  cite.tonyrowles.com is operator dashboard/toml setup.
- **DEPLOY-04 / live UAT** (absorbs the 5 Phase 8 deferred items):
  1. Real granted patent (US12505414B2) + passage → correct column:line citation; KV cache populated
     (`wrangler kv key get "<v1:patent>" --remote` returns the position map).
  2. Batch mode ≥3 passages → 3 distinct citations, one fetch + one parse (Network panel: a single
     `/webapp/pdf` request).
  3. Published-application number → "not supported yet" with ZERO network requests fired.
  4. Rapid repeated requests → HTTP 429 from the Worker after the rate-limit threshold.
  5. DevTools Network: NO `Authorization`/`Bearer` header on any `pct.tonyrowles.com` request; all PDF
     fetches via `/webapp/pdf` (not patentimages.storage.googleapis.com).

## Status

Code/docs for the milestone are complete and verified at the static level. The milestone closes
once the operator runs `npm run deploy:webapp` and confirms the DEPLOY-04 live UAT checklist.

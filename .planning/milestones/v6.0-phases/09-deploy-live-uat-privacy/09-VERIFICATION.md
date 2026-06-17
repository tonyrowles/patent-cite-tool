---
phase: 09-deploy-live-uat-privacy
status: passed
verified: 2026-06-16
score: 5/5
requirements: [DEPLOY-01, DEPLOY-02, DEPLOY-03, DEPLOY-04, PRIV-01]
---

# Phase 9 Verification — Deploy + Live UAT + Privacy

**Status: passed (5/5 requirements)**

## Requirement verification

- **DEPLOY-01** ✓ — `scripts/build.js --webapp-only` / `buildWebapp()` produces `dist/webapp/`
  (index.html + app.bundle.js + lib/pdf.mjs + lib/pdf.worker.mjs). Shipped Phase 8, re-verified
  during deploy (wrangler read 5 files from the assets dir).
- **DEPLOY-02** ✓ — `npm run deploy:webapp` is the documented deploy command
  (`build:webapp && wrangler deploy -c webapp/wrangler.toml`); `webapp/wrangler.toml` uses the
  Workers-Assets `[assets]` block + a `cite.tonyrowles.com` `custom_domain` route.
- **DEPLOY-03** ✓ — Operator ran `npm run deploy:webapp`: deployed `patent-cite-webapp` and
  attached `cite.tonyrowles.com (custom domain)`. The site is publicly live, coexisting with the
  routed `pct.tonyrowles.com` Worker (different hostname, no conflict).
- **DEPLOY-04** ✓ — Operator-confirmed live UAT passed against production cite.tonyrowles.com:
  real granted patent → correct citation + KV cache populated; batch mode (multiple passages,
  one fetch/parse); published-application rejection (not a wrong citation); rate-limit 429; no
  `Authorization: Bearer` header in any webapp request (all PDF fetches via `/webapp/pdf`).
- **PRIV-01** ✓ — `docs/privacy/index.html` has the "Citation Webapp (cite.tonyrowles.com)"
  section disclosing the new surface (no new personal data; PDFs proxied via the Worker; position
  maps cached in shared KV; localStorage prefs; Origin-only auth).

## Production-deploy prerequisite resolved during this phase

The production `pct.tonyrowles.com` Worker was still running pre-Phase-6 code (the Phase 6 secret
rotation updated the secret binding but never pushed code). Symptom: the live webapp returned 403
("Could not retrieve patent") because the deployed Worker lacked the Origin-auth `/webapp/pdf` /
dual-auth `/cache` routes. Resolved by `cd worker && wrangler deploy` (Version
b6452627-4fc6-46f4-8990-6de5743fc4fc), which pushed the Phase 6 routes to production. UAT passed
immediately after.

## Notes

- The webapp ONLY functions from `cite.tonyrowles.com` (the Origin allowlist is exactly
  `https://cite.tonyrowles.com` + `http://localhost:8788`). The default `*.workers.dev` subdomain
  is intentionally rejected — Origin auth working as designed, not a bug.

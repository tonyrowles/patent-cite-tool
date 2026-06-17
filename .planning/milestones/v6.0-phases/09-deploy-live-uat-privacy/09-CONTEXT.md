# Phase 9: Deploy + Live UAT + Privacy - Context

**Gathered:** 2026-06-16
**Status:** Ready for planning
**Mode:** Final phase — autonomous deliverables (privacy + deploy script) + human checkpoint (production deploy + live UAT)

<domain>
## Phase Boundary

Take the webapp live at `cite.tonyrowles.com` via Cloudflare Workers Assets, update the
hosted privacy policy with a Citation Webapp section, and run live UAT against production
proving the full pipeline (real patent → correct citation → KV cache populated; batch mode;
published-application rejection; rate-limit 429; no Authorization header in any request).

Autonomous portion (Claude): PRIV-01 (privacy policy section) and the `deploy:webapp` npm
script (DEPLOY-02 completion). DEPLOY-01 (buildWebapp + `--webapp-only`) already shipped in
Phase 8. Human portion (operator, requires Cloudflare auth + browser): DEPLOY-03 (production
`wrangler deploy`) and DEPLOY-04 (live UAT). This also absorbs the 5 live-browser UAT items
deferred from Phase 8.

</domain>

<decisions>
## Implementation Decisions

### Autonomous deliverables
- **PRIV-01:** Add a "Citation Webapp" section to `docs/privacy/index.html` disclosing the new
  surface: no new personal data collected; patent PDFs proxied through the developer's Worker
  (`pct.tonyrowles.com`, not fetched directly from Google by the webapp); parsed position maps
  cached in the SAME shared first-party Cloudflare KV as the extension; format/prefix prefs
  stored locally (localStorage), never transmitted; Origin-header auth only (no token / no
  Authorization header).
- **DEPLOY-02:** Add a `deploy:webapp` npm script = `npm run build:webapp && wrangler deploy --config webapp/wrangler.toml` (or the wrangler-v4 equivalent that publishes the Workers Assets directory). `webapp/wrangler.toml` already has the `[assets] directory = "../dist/webapp"` block (Phase 8).

### Human checkpoint (operator — Cloudflare auth required, cannot run autonomously)
- **DEPLOY-03:** `npm run deploy:webapp` to publish to `cite.tonyrowles.com` via Workers Assets,
  coexisting with the existing routed `pct.tonyrowles.com` Worker. (Locked: Workers Assets is the
  ONLY viable static-hosting path here — Cloudflare Pages cannot share a custom domain with an
  existing routed Worker.) Custom-domain/DNS wiring for `cite.tonyrowles.com` is operator setup.
- **DEPLOY-04:** Live UAT against production — real granted patent (e.g. US12505414B2) + passage
  → correct citation + KV cache populated (`wrangler kv key get --remote`); batch mode ≥3 passages
  → 3 distinct citations, one fetch/parse; published-application number → "not supported" (no wrong
  citation); rapid requests → HTTP 429; DevTools Network shows NO `Authorization: Bearer` header and
  all PDF fetches via `GET /webapp/pdf` (not patentimages).

### Locked (v6.0 STATE)
- `cite.tonyrowles.com` via Workers Assets; `localhost:8788` already in the Worker Origin allowlist
  (Phase 6) for local `wrangler dev` UAT. Zero new npm dependencies.

### Claude's Discretion
- Exact wording/placement of the privacy section and the precise `deploy:webapp` script form
  (wrangler v4 syntax) at Claude's discretion, consistent with the existing policy style and
  `webapp/wrangler.toml`.

</decisions>

<code_context>
## Existing Code Insights

- `docs/privacy/index.html` — the hosted policy (extension + Bug Report sections); add the
  Citation Webapp section in the same style (h2 + p/ul, existing CSS tokens).
- `package.json` scripts already has `build:webapp`; add `deploy:webapp`.
- `webapp/wrangler.toml` — `[assets] directory = "../dist/webapp"` (Phase 8).
- `wrangler kv key get --remote` is the verified way to confirm production KV (project memory:
  wrangler v4 reads LOCAL miniflare store by default; `--remote` is required for production).

</code_context>

<specifics>
## Specific Ideas

- `npm run deploy:webapp` must be THE documented deploy command (success criterion 1).
- Live UAT patent example: US12505414B2.
- Privacy section must explicitly state position maps are cached in the SHARED KV (same as the
  extension) and that the webapp uses Origin-header auth (no Authorization header).

</specifics>

<deferred>
## Deferred Ideas

None — this is the final phase of v6.0.

</deferred>

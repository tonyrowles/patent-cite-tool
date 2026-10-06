# Trusted shared cache

Browser clients can read shared maps but cannot create or change them. An Origin
header is a browser access control, not proof of a trusted writer; the extension's
bundled `PROXY_TOKEN` is public too. Cache mutations require a separate
`CACHE_WRITE_TOKEN`, stored only as a Worker secret and in the operator's local
environment. The Worker refuses mutations if the two credentials are identical.

## Rollout

1. Create a separate random operator credential and bind it with
   `cd worker && npx wrangler secret put CACHE_WRITE_TOKEN`. This command prompts
   for the value; never include it in source, frontend build variables, or logs.
2. Deploy the Worker with `npm --prefix worker run deploy`. Without the new secret,
   writes fail closed; reads and PDF proxy requests continue.
3. Prepare and inspect maps for frequently used patents, then populate `v6` using
   the commands below. Older namespaces are neither read nor written by the new
   Worker. Legacy clients fall through to PDF parsing when old-version reads fail.
4. Build and distribute Chrome/Firefox and deploy the webapp. All clients use the
   same `v6` cache contract and reject malformed responses. The extension's local
   IndexedDB version advances to 2 and discards old persisted maps on upgrade.
   Reload open patent tabs after updating the extension.

Deployment, secret creation, cache uploads, and deletion have not been performed
as part of the local implementation. The order above is the operational handoff.

## Prepare, populate, repair, and remove

Preparation runs locally and makes no Worker request. Use an original patent PDF;
the command checks the requested patent number on its first page and refuses to
overwrite an existing output file. Inspect the map against the printed PDF before
uploading; structural validation cannot prove that coordinates are correct.

```bash
npm run cache-admin -- prepare US6738932 /path/to/US6738932.pdf /tmp/US6738932-map.json
```

Set `CACHE_WRITE_TOKEN` in the operator process environment through your secret
manager. It must match the Worker secret. Upload the inspected file:

```bash
npm run cache-admin -- put US6738932 /tmp/US6738932-map.json
npm run cache-admin -- put US6738932 /tmp/US6738932-map.json --replace
npm run cache-admin -- delete US6738932
```

The first command creates a missing map (`POST`, 201) and returns 409 if one exists.
`--replace` uses `PUT` to repair an existing record (200); deletion uses `DELETE`
(200). No browser token can perform these operations. `CACHE_WORKER_URL` overrides
the default `https://pct.tonyrowles.com` for local or staging use; HTTP is allowed
only on localhost. Requests reject redirects to avoid forwarding credentials.

Maps are limited to 8 MiB and 50,000 entries. The Worker validates version,
coordinates, text, order, and metadata consistency; strips unknown fields; assigns
operator provenance and the server timestamp; signs the record with HMAC-SHA-256
bound to its cache key; and expires records after 30 days. Reads reject unsigned
or modified records, including any pre-deployment entries in the `v6` namespace.
Rotating `CACHE_WRITE_TOKEN` invalidates signatures on existing maps; repopulate
them after a rotation.

The existing daily guard caps create/replace operations at 900, with the existing
non-atomic KV-counter limitation. It is a cost guard, not an integrity boundary.

## Behavior on a miss

The extension downloads the Google PDF and parses it locally, with the existing
USPTO fallback. The webapp downloads the PDF through the first-party proxy and
parses locally. Neither uploads its computed map. Cache coverage therefore depends
on operator preparation, and uncached patents may take longer to process.

The required PR regression gate uses a placeholder extension token to avoid giving
production credentials to PR code. It exercises Google PDF download and local
parsing. Authenticated cache reads and USPTO fallback need a separate trusted run.

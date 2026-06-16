---
status: partial
phase: 01-worker-route-kv-schema-privacy-compliance-groundwork
source: [01-VERIFICATION.md]
started: 2026-06-13T01:15:00Z
updated: 2026-06-13T01:15:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. WR-06 — AMO "required" vs "optional" data_collection_permissions judgment
expected: A determination of whether the current `required: ["technicalAndInteraction","websiteActivity"]` placement in `src/manifest.firefox.json` is accurate (unconditional collection at install) or whether all three data-collection types should be `optional` (consent-gated, voluntary bug reports only). Compare PRIV-01 spec against AMO reviewer expectations for a voluntary, user-initiated feature. Outcome: keep PRIV-01 as written, or update PRIV-01 and the manifest before AMO submission.
result: [pending]

### 2. CR-01 — patentNumber format validation scope decision
expected: A decision on whether to add `/^\d{6,8}$/` regex validation for `patentNumber` (and URL validation for `patentUrl`) in `validateReportBody()` before Phase 2, or accept the Discord embed masked-link injection risk with documentation. PROXY_TOKEN is extractable from the public extension; the plans describe it as "friction not security" (D-01). Maintainer threat-model judgment call.
result: [pending]

### 3. PRIV-05 — web-ext lint clean against built dist/firefox/
expected: Build `dist/firefox/` and run `npx web-ext lint dist/firefox/` — exits 0 with zero AMO-blocking warnings after the `data_collection_permissions` manifest update. Deferred to Phase 5 UAT-04 per plan's explicit allowance (no Firefox build available in verification context).
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps

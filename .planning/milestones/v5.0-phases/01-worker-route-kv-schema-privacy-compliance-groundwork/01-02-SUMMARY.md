---
phase: 01-worker-route-kv-schema-privacy-compliance-groundwork
plan: 02
subsystem: compliance-docs
tags: [privacy, manifest, store-listing, firefox, amo, cws]
completed: "2026-06-13T00:09:23Z"
duration: "~5 minutes"
requirements_satisfied: [PRIV-01, PRIV-02, PRIV-03, PRIV-04, PRIV-05]

dependency_graph:
  requires: []
  provides:
    - src/manifest.firefox.json — updated data_collection_permissions (PRIV-01)
    - docs/privacy/index.html — Bug Report Feature section (PRIV-03)
    - store-assets/store-listing.md — updated data-use declaration (PRIV-04)
  affects:
    - Phase 5 UAT-04 — web-ext lint (PRIV-05) runs against Firefox build produced there

tech_stack:
  added: []
  patterns:
    - Firefox manifest data_collection_permissions taxonomy (AMO spec)
    - Privacy policy h2+p+ul HTML section structure (existing pattern)
    - Store listing Subsection 4 amendment (existing document structure preserved)

key_files:
  modified:
    - src/manifest.firefox.json
    - docs/privacy/index.html
    - store-assets/store-listing.md

decisions:
  - websiteContent is optional (not required) — user-controlled per-submission toggle; REQUIREMENTS.md PRIV-01 is authority over PITFALLS.md divergence
  - Privacy policy "no data collected" statement qualified with "except as described in the Bug Report Feature section below" for internal consistency
  - web-ext lint deferred to Phase 5 UAT-04 — no dist/firefox/ build available in this context; manifest JSON validity verified by automated assertion script
---

# Phase 1 Plan 02: Privacy Compliance Documentation Summary

## One-Liner

Updated Firefox manifest, privacy policy, and store listing to declare voluntary bug-report data collection (PRIV-01/03/04), resolving BLOCK-01 before the Worker route goes live.

## What Was Built

### Task 1: Firefox manifest data_collection_permissions (PRIV-01, PRIV-02, PRIV-05)

Updated `src/manifest.firefox.json` `browser_specific_settings.gecko.data_collection_permissions`:

- **Before:** `required: ["none"], optional: []`
- **After:** `required: ["technicalAndInteraction", "websiteActivity"], optional: ["websiteContent"]`

The `["none"]` value is gone — it was a reviewable AMO contradiction once the `/report` route exists. `websiteContent` is `optional` (not `required`) per REQUIREMENTS.md PRIV-01 authority: selection text is user-controlled per-submission via the [Remove selection text] toggle.

Chrome manifest (`src/manifest.json`) verified unchanged — PRIV-02 is verify-only; CWS uses store listing + privacy policy, not a manifest field.

PRIV-05 (web-ext lint): no `dist/firefox/` build available in this execution context. Deferred to Phase 5 UAT-04. Manifest JSON validity and value correctness asserted by `node scripts/check-firefox-data-collection.cjs` (exits 0).

**Commit:** de3bcf5

### Task 2: Privacy policy Bug Report Feature section + store listing amendment (PRIV-03, PRIV-04)

**docs/privacy/index.html:**

- Added `<h2>Bug Report Feature</h2>` section immediately before `<footer>`, following the existing h2+p+ul structure. The section documents:
  - All 14 PAY-01 allowlisted fields transmitted, field-by-field, in a `<ul>`
  - 90-day retention with automatic deletion
  - Purpose limited to maintainer triage only
  - Per-submission [Remove selection text] opt-out
  - Destinations: Cloudflare KV (`BUG_REPORTS` namespace) and maintainer-only Discord channel, and nowhere else
  - Explicit "No IP address is stored in bug report records" statement (PAY-03)
  - Voluntary and user-initiated (explicit Submit click)
- Qualified the opening paragraph on line 94 by adding "except as described in the Bug Report Feature section below" — policy is now internally consistent

**store-assets/store-listing.md:**

- Subsection 4 "Data Use Practices" updated:
  - "Data types collected" guidance now acknowledges Website Content for voluntary bug reports
  - Added carve-out paragraph distinguishing normal citation operation (no collection) from voluntary bug-report submission (diagnostic fields to first-party infrastructure)
- Section 1 Description: added sentence noting voluntary "report a problem" capability with link to privacy policy
- All heading levels and table formatting preserved; only content within Subsection 4 and the one Description sentence changed

**Commit:** 4d03479

## Verification Results

| Check | Result |
|-------|--------|
| `node scripts/check-firefox-data-collection.cjs` | PRIV-01 OK |
| `grep -c 'technicalAndInteraction' src/manifest.firefox.json` | 1 |
| `grep -c 'websiteActivity' src/manifest.firefox.json` | 1 |
| `grep -c 'websiteContent' src/manifest.firefox.json` | 1 |
| `["none"]` removed | confirmed |
| `git diff --quiet src/manifest.json` | exits 0 (Chrome manifest unchanged) |
| `grep -c 'Bug Report Feature' docs/privacy/index.html` | 2 |
| 90-day retention mentioned | confirmed |
| No-IP-stored statement present | confirmed |
| Prior "no data" statement qualified | confirmed |
| KV + Discord destinations documented | confirmed |
| `grep -qi 'bug report' store-assets/store-listing.md` | match |
| `grep -qi 'website content' store-assets/store-listing.md` | match |
| `dist/firefox/` web-ext lint | deferred to Phase 5 UAT-04 |
| HTML well-formed (footer follows new section) | confirmed |

## Deviations from Plan

None — plan executed exactly as written.

PRIV-05 deferral is expected behavior, not a deviation: the plan explicitly states "if no build is available in this context, note it in the SUMMARY and defer the live lint to Phase 5 UAT-04."

## Known Stubs

None. All three files have substantive content wired to their intended purpose.

## Threat Flags

None. Plan 02 modifies only static documentation and configuration files:
- `src/manifest.firefox.json` — AMO metadata declaration
- `docs/privacy/index.html` — static HTML privacy policy
- `store-assets/store-listing.md` — store submission draft document

No new network endpoints, auth paths, file access patterns, or runtime schema changes introduced.

## Self-Check: PASSED

| Item | Result |
|------|--------|
| `src/manifest.firefox.json` exists | FOUND |
| `docs/privacy/index.html` exists | FOUND |
| `store-assets/store-listing.md` exists | FOUND |
| `01-02-SUMMARY.md` exists | FOUND |
| Commit de3bcf5 (Task 1) | FOUND |
| Commit 4d03479 (Task 2) | FOUND |

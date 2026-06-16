---
slug: v5-no-match-regression
status: resolved
trigger: "Version 5.0.0 has regressed significantly, getting No match found errors in almost all passages over a few words, and spurious results for shorter passages"
created: 2026-06-16
updated: 2026-06-16
---

# Debug Session: v5-no-match-regression

## Symptoms

DATA_START
- **Expected behavior:** Highlighting a passage from a patent on Google Patents returns an accurate column:line citation. This worked in shipped version 2.3.0.
- **Actual behavior:** v5.0.0 returns "No match found" for almost all passages longer than a few words, and spurious/wrong results for shorter passages.
- **Error messages:** "No match found" (user-facing).
- **Timeline:** Previous shipped version was 2.3.0, believed working. Now broken. User suspects it could be stale server-side cached mappings — proposes bumping the cache and testing whether v5.0 works on fresh pulls as a first step.
- **Surface:** Browser extension, live use (not the test suite).
- **Reproduction case:**
  - Patent: US10178508
  - Passage: "In one embodiment, a method is directed to learning, by a computer system, a plurality of regular locations and usage of one or more mobile devices for a user at a plurality of times based on aggregated location and usage information reported by the one or more mobile devices via a network."
  - Result: No match found
DATA_END

## Current Focus

- hypothesis: v5.0 loosened the column-sequence validation in `buildPositionMap`; a single spurious-but-valid odd column-pair read poisons `expectedLeftCol`, after which all genuinely-later (lower-numbered) pages are rejected, dropping most of the position map. Long passages spanning dropped columns → "No match found"; short text in surviving columns → spurious hits.
- test: ran `buildPositionMap` on pages [(1,2),(7,8 spurious),(3,4),(5,6)] against current v5.0 code
- expecting: if hypothesis true, real cols 3,4,5,6 are dropped
- next_action: ROOT CAUSE CONFIRMED (code-level + empirical). Awaiting user decision on fix (revert strict vs surgical) + mandatory cache eviction.
- reasoning_checkpoint: matching.js is byte-identical v2.3.0→v5.0, so the matcher itself is not the regression — the regression is in its INPUT (the position map). Cache is NOT root cause (same `v3` namespace as working v2.3.0; write-once) but IS a contamination vector requiring eviction as part of the fix.

## Evidence

- timestamp: 2026-06-16 — `git diff v2.3.0..v5.0 -- src/shared/matching.js` is EMPTY. The matcher is unchanged. Symptom must come from matcher inputs.
- timestamp: 2026-06-16 — The ONLY matching-core logic change v2.3.0→v5.0 is `src/offscreen/position-map-builder.js` lines 748-750: strict `if (colNums.left !== expectedLeftCol) continue;` was replaced with a forward-gap window `if (colNums.left < expectedLeftCol) continue; if (colNums.left - expectedLeftCol > MAX_PAGE_GAP) continue;` (MAX_PAGE_GAP=20). Introduced (mislabeled) in commit 89141d6 "chore(state): clear stale decisions after v3.1 close".
- timestamp: 2026-06-16 — EMPIRICAL: `buildPositionMap([(1,2),(7,8),(3,4),(5,6)])` under current v5.0 code returns columns [1,2,7,8] — real columns 3,4,5,6 are DROPPED. Cause: the spurious (7,8) page (7-3=4 ≤ 20) is accepted and sets expectedLeftCol=9; subsequent real pages (left 3,5 < 9) are rejected by the `left < expectedLeftCol` guard. Under v2.3.0 strict equality the spurious page is rejected (7≠3) and 3,4,5,6 are all captured.
- timestamp: 2026-06-16 — `extractPrintedColumnNumbers` enforces odd left-column (pairs are 1-2,3-4,5-6…); even spurious numbers are already rejected. So the trigger is a spurious VALID odd-pair read on a figure/front-matter/misread page before the real columns.
- timestamp: 2026-06-16 — Unit tests 38/38 PASS, incl. the gap-tolerance tests `position-map-builder.test.js:346` ("accepts 1,2→5,6") and `:385`. These tests ENCODE the regressive behavior, which is why the corpus is green while live use fails — no fixture contains a cascade-triggering page.
- timestamp: 2026-06-16 — Real granted US patents have CONTINUOUS spec/claims column numbering (figure sheets sit before col 1 and carry no column numbers). A legitimate printed-column gap like 1,2→5,6 essentially never occurs, so the gap-tolerance solved a non-problem while opening the cascade. US10203551 (the case cited in code comments) is handled by the separate FALLBACK pass, not by gap tolerance.
- timestamp: 2026-06-16 — Cache analysis: Worker caches BUILT position maps in KV under key `${CACHE_VERSION}:${patent}` (`worker/src/index.js:558`). CACHE_VERSION='v3' in BOTH v2.3.0 and v5.0; POST /cache is write-if-not-exists, no TTL. So v5.0 clients have written POISONED maps under `v3:{patent}` that persist and are served to everyone on v3.
- timestamp: 2026-06-16 — DEFINITIVE END-TO-END REPRODUCTION on the REAL US10178508 PDF (fetched from Google Patents, parsed via PDF.js + extractTextFromPdf in a headless node harness with @napi-rs/canvas DOMMatrix + Uint8Array.toHex polyfills):
    - OLD (v5.0.0 gap-tolerant) builder → 1010 entries, columns present = [13..28] (cols 1-12 DROPPED), matchAndCite → **null ("No match found")**.
    - FIXED (strict) builder → 1781 entries, columns present = [1..28] (complete), matchAndCite → **citation "1:31-35", confidence 0.97 (CORRECT)**.
    The user's passage is at column 1, lines 31-35 — inside the dropped block under the buggy code. 1:1 reproduction of the reported symptom; proves the fix resolves it.
- timestamp: 2026-06-16 — "Still failing after push" explained: `dist/` is GITIGNORED and built locally by `npm run build`; the loaded unpacked extension was running the STALE pre-fix `dist/` bundle. `git push` does not rebuild dist. Ran `npm run build` this session → dist/chrome + dist/firefox now contain strict logic + CACHE_VERSION 'v4'. User must RELOAD the unpacked extension and hard-refresh the patent page.
- timestamp: 2026-06-16 — SEPARATE PRE-EXISTING BUG (not US10178508's cause): the Worker USPTO proxy (the FALLBACK used when Google Patents has no PDF link) returns 502 "EGRANT.PDF not found in file wrapper" for EVERY patent tested (10178508, 10203551, 9000000, 10000000, 8000000). ODP search (step 1) succeeds; the documents lookup `/applications/{app}/documents?documentCodes=EGRANT.PDF` finds no grant doc. worker/src/index.js fetchEgrantPdf is unchanged since creation → USPTO Open Data Portal API change (likely the EGRANT.PDF documentCode/filter). Track separately; does NOT block this fix.

## Eliminated

- hypothesis: Stale server-side cached mappings are the root cause (user's initial theory).
  - why eliminated: The cache namespace ('v3') is identical to the working v2.3.0 build, and POST is write-once — any v3 entry written during the v2.3.0 era would be a GOOD map, not a cause of regression. The breakage is freshly-BUILT poisoned maps from v5.0 code, not stale good ones. A fresh/cache-bypassed pull still runs the buggy v5.0 builder and would still fail. (Cache eviction is still REQUIRED as cleanup after the code fix — see Resolution.)
- hypothesis: The matcher (`src/shared/matching.js`) regressed.
  - why eliminated: byte-identical v2.3.0→v5.0.

## Resolution

- root_cause: `src/offscreen/position-map-builder.js:748-750` — the v5.0 change replaced strict sequential column validation (`colNums.left === expectedLeftCol`) with a permissive forward-gap window (`expectedLeftCol ≤ left ≤ expectedLeftCol + 20`). A single spurious-but-valid odd column-pair read (figure page / front matter / misread) within that window irreversibly poisons `expectedLeftCol`, after which every genuinely-later real page (lower column number) is rejected by the `left < expectedLeftCol` guard. The position map loses most real columns → long passages spanning them return "No match found", while short phrases in surviving columns return spurious matches. Secondary: poisoned maps are now cached in production KV under `v3:{patent}` (write-once, no TTL) and served to all v3 clients.
- fix: APPLIED (user chose: revert-to-strict + CACHE_VERSION bump). (1) Restored strict sequential validation `if (colNums.left !== expectedLeftCol) continue;` in buildPositionMap and removed MAX_PAGE_GAP. (2) Replaced the two gap-tolerance unit tests (which encoded the harmful behavior) with a strict-rejects-gap test, a fixed backward-jump test, and a new REGRESSION guard for the cascade case [(1,2),(7,8),(3,4),(5,6)] → real cols 3,4,5,6 survive, spurious 7,8 rejected. (3) Bumped CACHE_VERSION 'v3'→'v4' in BOTH src/offscreen/offscreen.js and src/firefox/pdf-pipeline.js so fixed clients ignore poisoned v3 KV maps and rebuild; updated tests/unit/cache-version.test.js invariant to 'v4'.
- verification: CONFIRMED end-to-end on the real US10178508 PDF — fixed build yields citation 1:31-35 @ 0.97; pre-fix build yields null (see Evidence). Unit suite 1608 passed (only remaining failure is the PRE-EXISTING, unrelated weekly-digest-auto-fix STATE.md `## Bypass Conventions` check — confirmed failing with this fix stashed). position-map-builder + cache-version suites green (42/42). Regression test asserts exactly the columns the old code dropped. dist/ rebuilt with the fix (gitignored, local). REMAINING (user): reload the unpacked extension + hard-refresh the patent page. Production KV still holds poisoned v3:* maps — inert once clients use v4, optionally purgeable via wrangler (kv key delete, --remote). Separate follow-up: fix the Worker USPTO eGrant fallback (502 for all patents).
- files_changed: src/offscreen/position-map-builder.js, src/offscreen/offscreen.js, src/firefox/pdf-pipeline.js, tests/unit/position-map-builder.test.js, tests/unit/cache-version.test.js

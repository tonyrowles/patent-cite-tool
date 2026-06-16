---
phase: 01-worker-route-kv-schema-privacy-compliance-groundwork
plan: 03
subsystem: compliance
tags: [cloudflare-worker, kv, privacy-policy, cws-store-listing, vitest, tdd]

# Dependency graph
requires:
  - phase: 01-worker-route-kv-schema-privacy-compliance-groundwork
    provides: "01-01: POST /report Worker route + KV schema + 22-test suite; 01-02: Firefox manifest + privacy policy Bug Report section"

provides:
  - "Internally consistent CWS data-use declaration: Submission Checklist, Quick Reference, and Subsection 4 all agree on checking Website Content"
  - "Reconciled privacy policy: qualified 'no personal information' claims scoped to normal citation use; Cloudflare/Discord named as service processors; June 2026 revision date"
  - "Correct duplicate_count semantics: 0->1 on first dup (nullish-coalescing ?? 0 instead of falsy || 1)"
  - "Correct numeric diagnostic field storage: scrollY/viewportWidth/viewportHeight preserve legitimate 0 values (??)"
  - "Exact-value duplicate_count test: toBe(1) guards WR-01 regression going forward"

affects: [phase-02-payload-builder, phase-05-uat, cws-submission, amo-submission]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Nullish-coalescing (??) for numeric fields in Worker buildKvRecord to preserve falsy-but-valid 0 values; || only for strings where empty-string-to-null is intentional"
    - "TDD: dedicated fresh patent number + IP constants per exact-count test to avoid shared KV state order-dependence"

key-files:
  created: []
  modified:
    - store-assets/store-listing.md
    - docs/privacy/index.html
    - worker/src/index.js
    - worker/tests/report-route.test.js

key-decisions:
  - "WR-01 fix uses ?? 0 (not ?? 1): contract in report-schema.md says initialized to 0 and incremented; ?? 0 produces the correct 0->1 sequence"
  - "WR-03 fix scoped to scrollY/viewportWidth/viewportHeight only: string fields (selectionText, returnedCitation, browser, os, etc.) deliberately keep || null for empty-string-to-null semantics"
  - "Exact-count test uses PATENT_DEDUP_EXACT + IP_DEDUP_EXACT to guarantee isolation from the order-dependent PATENT_DEDUP accumulation"
  - "node_modules symlink created in worktree worker/ dir pointing to main checkout node_modules to enable running Cloudflare vitest-pool-workers from worktree (worktrees do not have their own node_modules)"

patterns-established:
  - "Compliance doc consistency: all three surfaces (checklist, quick reference, section body) that describe the same CWS declaration must agree before any CWS submission attempt"
  - "Privacy policy internal consistency: each section that makes claims about collection/sharing must be scoped consistently; Bug Report carve-out must propagate to ALL absolute-claim sites, not just the opening paragraph"

requirements-completed: [PRIV-03, PRIV-04, LIMIT-01]

# Metrics
duration: 15min
completed: 2026-06-13
---

# Phase 01 Plan 03: Gap Closure (CR-02 / WR-07 / WR-08 / WR-01 / WR-03) Summary

**Compliance documents reconciled (CWS checklist + privacy policy internally consistent) and Worker duplicate_count/falsy-zero bugs fixed with a TDD exact-value guard — Phase 1 now has 15/15 truths verifiable**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-06-13T00:53:00Z
- **Completed:** 2026-06-13T00:56:39Z
- **Tasks:** 3 (Task 3 used TDD: RED commit + GREEN commit)
- **Files modified:** 4

## Accomplishments

- Eliminated internal contradictions in the CWS store-listing.md that would have caused the operator to file a false data-use declaration (Submission Checklist and Quick Reference now match Subsection 4's instruction to check Website Content); also removed HTML anchor from plain-text description field (WR-09)
- Reconciled the privacy policy (docs/privacy/index.html): absolute "no personal information" and "no data shared" claims qualified for normal citation use; Cloudflare and Discord named as service providers (processors); revision date bumped to June 2026
- Fixed duplicate_count off-by-one in Worker (WR-01) and falsy-zero coercion for numeric diagnostic fields (WR-03); exact-value TDD test `toBe(1)` guards against regression; full suite green at 23/23

## Task Commits

Each task was committed atomically:

1. **Task 1: Reconcile store-listing.md CWS data-use declaration (CR-02 + WR-09)** - `c69c54a` (docs)
2. **Task 2: Reconcile privacy policy collection/sharing claims and bump revision date (WR-07 + WR-08)** - `78d243d` (docs)
3. **Task 3 RED: Add failing exact-value duplicate_count test (WR-01)** - `d68fdaf` (test)
4. **Task 3 GREEN: Fix duplicate_count and falsy-zero coercion (WR-01 + WR-03)** - `1c6739f` (feat)

## Files Created/Modified

- `store-assets/store-listing.md` — 4 edits: Submission Checklist Data-use item, Quick Reference row, Subsection 4 conditional wording, plain-text description HTML anchor removed
- `docs/privacy/index.html` — 3 edits: revision date to June 2026, "Information We Collect" qualified for normal citation use, "Data Sharing" names Cloudflare/Discord as processors
- `worker/src/index.js` — 4 edits: scrollY/viewportWidth/viewportHeight `|| null` -> `?? null`; duplicate_count increment `|| 1` -> `?? 0`
- `worker/tests/report-route.test.js` — Added PATENT_DEDUP_EXACT + IP_DEDUP_EXACT constants; added exact `toBe(1)` duplicate_count test with isolated patent+IP pair

## Decisions Made

- WR-01 fix uses `?? 0` not `?? 1` — report-schema.md explicitly contracts duplicate_count initializes at 0 and is incremented; `?? 0` produces 0+1=1 on first duplicate (correct); `?? 1` would still produce 1+1=2
- WR-03 change scoped to numeric fields only — `scrollY`, `viewportWidth`, `viewportHeight` are the only fields where 0 is a legitimate meaningful value (top-of-page / zero-width viewport). String fields keep `|| null` intentionally.
- Existing `toBeGreaterThanOrEqual(2)` test on PATENT_DEDUP retained — it still passes because PATENT_DEDUP accumulated 4+ submissions across the describe block; only the new dedicated test asserts the exact first-dup count.

## Deviations from Plan

None - plan executed exactly as written. All four edits in Task 1, three edits in Task 2, and both WR-01+WR-03 fixes in Task 3 were completed as specified. No scope expansion.

The `node_modules` symlink created in the worktree's `worker/` directory is a worktree execution artifact (not a committed file — symlinks to untracked directories are not staged) required to run the Cloudflare vitest-pool-workers test suite from within the worktree; it does not appear in `git status`.

## Issues Encountered

Worktree does not have its own `node_modules` directory for `worker/`. The `@cloudflare/vitest-pool-workers` package resolves from the parent repo's `.vite-temp` cache instead of the worker's local node_modules, causing an `ERR_MODULE_NOT_FOUND` startup error when running `npm test` directly from the worktree's `worker/` directory. Resolution: created a symlink `$WT_ROOT/worker/node_modules -> /home/fatduck/patent-cite-tool/worker/node_modules` so the test runner resolves packages correctly. This is a worktree isolation limitation, not a code issue.

## Known Stubs

None — all modified files contain complete, wired content. No placeholder text.

## Next Phase Readiness

- Phase 1 is now fully complete: 15/15 observable truths are verifiable
- PRIV-03 (privacy policy Bug Report section) — complete and internally consistent
- PRIV-04 (CWS store listing data-use declaration) — complete and internally consistent
- LIMIT-01 (duplicate_count telemetry accuracy) — corrected with exact-value test guard
- Phase 2 (pure-function Vitest-testable payload builder) can proceed without any Phase 1 blockers

---
*Phase: 01-worker-route-kv-schema-privacy-compliance-groundwork*
*Completed: 2026-06-13*

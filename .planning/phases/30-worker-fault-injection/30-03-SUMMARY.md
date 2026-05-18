---
phase: 30
plan: 03
subsystem: e2e-taxonomy + nightly-cron
tags: [error-taxonomy, workflow, fault-injection, rpt-02, inj-02]
dependency_graph:
  requires: [30-01, 30-02]
  provides: [WORKER_FALLBACK_FAILED taxonomy entry, fault-injection nightly step]
  affects: [tests/e2e/lib/error-codes.js, .github/workflows/e2e-nightly.yml, tests/e2e/lib/report.js (auto-wired)]
tech_stack:
  added: []
  patterns: [closed-enum extension, GitHub Actions step insertion]
key_files:
  created: []
  modified:
    - tests/e2e/lib/error-codes.js
    - .github/workflows/e2e-nightly.yml
decisions:
  - "WORKER_FALLBACK_FAILED appended as index 8 in ERROR_CLASSES (Object.freeze preserved)"
  - "Fault-injection step placed after regression issue-filer, before Upload artifacts"
  - "No changes to scripts/e2e-report-issue.mjs — existing per-case loop handles new errorClass via report.json schema"
  - "Fault-injection step NOT weekday-rotated — runs every nightly tick (single-case spec)"
metrics:
  duration_minutes: 8
  completed_date: "2026-05-18"
  tasks_completed: 2
  files_changed: 2
requirements: [INJ-02]
---

# Phase 30 Plan 03: RPT-02 Taxonomy + Nightly Cron Wiring Summary

**One-liner:** WORKER_FALLBACK_FAILED added as 9th RPT-02 taxonomy entry and fault-injection.spec.js wired into e2e-nightly.yml with dedicated issue-filer and artifact-upload coverage.

## What Was Built

### Task 1: Add WORKER_FALLBACK_FAILED to RPT-02 taxonomy
**Commit:** `1313c0a` — feat(30-03): add WORKER_FALLBACK_FAILED to RPT-02 taxonomy

Two targeted edits to `tests/e2e/lib/error-codes.js`:

1. **Named export added** after `export const FLAKE = 'FLAKE';` with a Phase 30 (INJ-02) doc comment block explaining the semantics (distinct from WRONG_CITATION, applies to Worker/USPTO fallback path breakage).

2. **ERROR_CLASSES frozen array extended** from 8 to 9 members — `'WORKER_FALLBACK_FAILED'` appended at index 8 with inline Phase 30 comment.

3. **File header taxonomy table updated** — new entry for WORKER_FALLBACK_FAILED with full description after the FLAKE entry.

Verification outputs:
```
WORKER_FALLBACK_FAILED= WORKER_FALLBACK_FAILED
ERROR_CLASSES.length= 9
isFrozen= true
export count: 12  (was 11)
```

The `report.js#recomputeSummary` counter `by_error_class.WORKER_FALLBACK_FAILED` is auto-wired — no report.js changes needed (it iterates `ERROR_CLASSES` dynamically).

The fault-injection.spec.js `?? 'WORKER_FALLBACK_FAILED'` fallback is now a no-op; the real export resolves.

### Task 2: Wire fault-injection.spec.js into nightly cron workflow
**Commit:** `25d07a1` — feat(30-03): wire fault-injection.spec.js into nightly cron workflow

Two new steps inserted in `.github/workflows/e2e-nightly.yml` between the existing "File issues for failures" step and "Upload E2E artifacts", plus one updated `if:` condition:

**New step 1 — `Run fault-injection spec` (id: fault_injection):**
- `if: steps.smoke.outcome == 'success'` — matches regression gating; skips when smoke fails
- `continue-on-error: true` — workflow proceeds to issue filing + upload even on failure
- No `--grep` flag — single-case spec, runs every nightly tick (not weekday-rotated)
- References `specs/fault-injection.spec.js` directly

**New step 2 — `File issues for fault-injection failure`:**
- `if: steps.smoke.outcome == 'success' && steps.fault_injection.outcome == 'failure'`
- `run: node scripts/e2e-report-issue.mjs` — reuses Phase 29 fingerprint-dedup reporter unchanged
- Phase 29 reporter reads report.json's per-case entries; WORKER_FALLBACK_FAILED flows through the same per-case logic as WRONG_CITATION

**Updated Upload artifacts `if:` condition:**
- Adds `|| steps.fault_injection.outcome == 'failure'` so artifacts upload on fault-injection failures too

Targeted grep verification:
```
grep -cE "^[[:space:]]*run: node scripts/e2e-report-issue\.mjs$" .github/workflows/e2e-nightly.yml  → 2
grep -cE "^[[:space:]]*continue-on-error: true$" .github/workflows/e2e-nightly.yml  → 3
```

YAML validated: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/e2e-nightly.yml'))"` exits 0.

## Manual Verification Handoff

The next nightly cron tick (06:00 UTC) will exercise the new `Run fault-injection spec` step end-to-end. The orchestrator's `/gsd-verify-work` flow can trigger a manual run via:

```bash
gh workflow run e2e-nightly.yml
```

Then observe the new step in the run logs. If the Worker fallback path is healthy, the step passes and no issue is filed. If the Worker is broken, `WORKER_FALLBACK_FAILED` appears in report.json and the new issue-filer step creates a GitHub issue with fingerprint-based dedup.

## No Script Changes Needed

`scripts/e2e-report-issue.mjs` was NOT modified. The Phase 29 reporter's per-case loop iterates report.json entries and uses `errorClass` from each case object — `WORKER_FALLBACK_FAILED` flows through identically to existing error classes. The issue title prefix will be: `[e2e-nightly] US11427642-spec-short-1: WORKER_FALLBACK_FAILED`.

## Deviations from Plan

None — plan executed exactly as written. Both tasks implemented the specified changes with no architectural surprises.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes beyond those specified in the plan's threat model (T-30-8 through T-30-11 all accounted for).

## Self-Check: PASSED

Files exist:
- tests/e2e/lib/error-codes.js: FOUND
- .github/workflows/e2e-nightly.yml: FOUND

Commits exist:
- 1313c0a: feat(30-03): add WORKER_FALLBACK_FAILED to RPT-02 taxonomy — FOUND
- 25d07a1: feat(30-03): wire fault-injection.spec.js into nightly cron workflow — FOUND

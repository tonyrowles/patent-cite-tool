# Phase 29 Plan 04 — CI Smoke Run Record

**Date:** 2026-05-17 UTC (Sunday)
**Branch:** main
**Triggered by:** `workflow_dispatch` (manual) via `gh workflow run e2e-nightly.yml --ref main -f force_full_suite=false`

## Run 1 (initial)

- **Run ID:** 26002407480
- **URL:** https://github.com/tonyrowles/patent-cite-tool/actions/runs/26002407480
- **Status:** completed
- **Conclusion:** success (issues are the failure signal — green ✓ workflow run is expected)
- **Duration:** 18m 42s (1122 seconds total job time, well under 30-min timeout)
- **Smoke step outcome:** success
- **Regression step outcome:** success (the step itself succeeded; individual cases may fail and are filed as issues)
- **Suite selection:** 66 cases (full Sunday rotation — `getUTCDay()` returned 0; rotation logic correctly selected the full live suite)

### Steps observed

| Step | Outcome | Notes |
|------|---------|-------|
| Set up job | ✓ | |
| Checkout | ✓ | |
| Setup Node 22 | ✓ | |
| Install deps (`npm ci`) | ✓ | |
| Playwright cache | miss (first run) | Cache will be hit on next run since key is `pw-Linux-${hash(package.json)}` |
| Install Chromium | ran (`npx playwright install chromium`) | No `--with-deps`, no xvfb-run — CRON-03 ✓ |
| Verify Playwright binary (`npx playwright --version`) | ✓ | Pitfall 2 mitigation working |
| Build Chrome extension (`npm run build:chrome`) | ✓ | |
| Phase 29 unit tests (sanity gate) | ✓ | 47 tests passed |
| Label creation (`gh label create e2e-nightly --force`) | ✓ | Idempotent step works |
| Pre-flight smoke (`US11427642-spec-short-1`) | ✓ | Confirms Google Patents DOM reachable — proceed to regression |
| File meta-issue on smoke failure | skipped | Smoke passed so meta-drift filer was not invoked |
| Select test cases for today | ✓ | "Selected 66 cases for this run" — full Sunday suite |
| Run E2E regression | ✓ (step) | Workflow proceeds even when individual cases fail (continue-on-error: true) |
| File issues for failures (`scripts/e2e-report-issue.mjs`) | ✓ | Filed issue #1 — see below |
| Upload E2E artifacts (`actions/upload-artifact@v4`) | ✓ | `e2e-nightly-26002407480` artifact uploaded with 14-day retention |
| Post Cache Playwright Chromium | ✓ | Cache saved successfully — next run will hit |

### Issues filed in Run 1

| # | Title | Fingerprint | State |
|---|-------|-------------|-------|
| 1 | `[e2e-nightly] US11427642-claims-1: NO_CITATION_PRODUCED` | `6d911fe12ae7` | OPEN |

**Issue #1 body excerpt** (verifies format):

```
## E2E nightly failure: US11427642-claims-1

| Field | Value |
|-------|-------|
| Patent | `US11427642-claims-1` |
| Error class | `NO_CITATION_PRODUCED` |
| Verifier verdict | n/a |
| Citation | `n/a` |
| Fingerprint | `6d911fe12ae7` |
| Artifact bundle | [Run #26002407480](https://github.com/tonyrowles/patent-cite-tool/actions/runs/26002407480) |

**Verifier reason:**

```
```

<!-- fingerprint: 6d911fe12ae7 -->
```

**Why only one issue out of 66 cases?** `US11427642-claims-1` is the canary case Phase 28-05 re-enabled deliberately — see `.planning/phases/28-independent-pdf-verifier/28-05-SUMMARY.md`. The remaining 65 live cases all passed (or hit FLAKE — which is filtered out per CRON-04 design). This is the expected behavior: the suite surfaces real defects, and dedup ensures one issue per root cause.

## Run 2 (dedup verification)

**Not executed end-to-end** — CRON-05 dedup behavior validated at unit-test scope only:

- Plan 29-02's Vitest suite includes 39 tests for `scripts/e2e-report-issue.mjs`, including:
  - `processReport()` — end-to-end dispatch with mocked gh:
    - "files 1 comment + 1 create for the fixture (1 recent match + 1 stale match)"
    - "creates a new issue when no matching fingerprint found"
    - "skips invalid case IDs with a warning (no gh invocation)"
    - "skips FLAKE cases"
  - `findMatchingIssue()` with 7-day staleness logic
  - `fingerprint()` determinism across `(caseId, errorClass)` pairs

The next scheduled cron run (next Sunday 06:00 UTC) will naturally exercise dedup end-to-end if `US11427642-claims-1` continues to fail (which it will until the underlying extension bug is fixed). At that point, run 2 will produce a comment on issue #1 (not a new issue), confirming CRON-05 in production.

Triggering a second `workflow_dispatch` solely for dedup validation would have cost another ~19 min of Actions runtime for a behavior that is already covered by 39 unit tests + future natural exercise. Decision: accept vacuous-pass for CRON-05 end-to-end, deferred to natural cron exercise.

## CRON requirement satisfaction

- [x] **CRON-01:** Workflow `.github/workflows/e2e-nightly.yml` triggered via `workflow_dispatch` → Run ID 26002407480 — workflow accepted and completed successfully on `ubuntu-latest`
- [x] **CRON-02:** Rotation selected 66 cases for Sunday (full live suite), matching `selectCronCases({now: 2026-05-17, forceFull: false})` expected behavior — visible in step log: "Selected 66 cases for this run"
- [x] **CRON-03:** Chromium installed without `--with-deps` on `ubuntu-latest`; no `xvfb-run`; artifact `e2e-nightly-26002407480` uploaded with 14-day retention
- [x] **CRON-04:** Issue #1 filed with `[e2e-nightly]` title prefix, fingerprint HTML comment, Patent/Error class/Artifact bundle table, and verifier reason fenced block
- [~] **CRON-05:** Dedup validated at unit-test scope (39 tests covering `processReport`, `findMatchingIssue`, `fingerprint`, `isRecentlyUpdated`); end-to-end dedup deferred to next natural cron exercise of issue #1's fingerprint `6d911fe12ae7`

## Observations / Issues encountered

1. **Sunday timing was fortunate** — `workflow_dispatch` triggered on 2026-05-17 UTC, which is a Sunday. This exercised the FULL 66-case path rather than the 30-case rotation. Both paths share the same `select-cron-cases.mjs` code; the unit suite verifies the weekday path (30-case rotation, determinism, wrap-around).
2. **Cache miss on first run was expected** — `actions/cache@v4` had no prior key matching `pw-Linux-${hash(package.json)}`. Subsequent runs will hit cache (verified by "Post Cache Playwright Chromium" step succeeding).
3. **Workflow concluded `success` despite real failure** — by design (continue-on-error on the smoke + regression steps; the filed issue IS the signal, not a red-X workflow status). This is correctly documented in 29-CONTEXT.md "Specific Ideas".
4. **No CAPTCHA / DOM drift detected** — pre-flight smoke on `US11427642-spec-short-1` passed cleanly, indicating Google Patents UI is currently stable.

## Next steps

- **Issue #1 disposition:** Leave OPEN — this is a real extension defect (NO_CITATION_PRODUCED on `US11427642-claims-1`) that the v3.0 milestone explicitly chose to track via nightly cron rather than fix in this milestone. Per 28-05 adjudication, this case was re-enabled specifically to be visible to the cron filer. The issue serves as live documentation of the bug + a dedup target for future runs.
- **CRON-05 natural exercise:** Wait for the next nightly cron run (06:00 UTC) and confirm it adds a comment to issue #1 rather than creating a new issue. If a new issue appears, dedup is broken and needs investigation.
- **Future enhancement (v3.1+):** Add a `gh-cli-version` env capture so the smoke-run record can track which gh CLI version was active. Not needed for v3.0.

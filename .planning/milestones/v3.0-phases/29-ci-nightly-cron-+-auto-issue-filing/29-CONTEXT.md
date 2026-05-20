# Phase 29: CI Nightly Cron + Auto-Issue Filing - Context

**Gathered:** 2026-05-15
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous, defaults accepted)

<domain>
## Phase Boundary

Operationalize the E2E pipeline so it runs nightly on GitHub Actions, detects platform drift, and auto-files (or comments on) GitHub issues per distinct failure — without spamming the issue tracker on a single Google Patents UI change.

In scope:
- `.github/workflows/e2e-nightly.yml` — new workflow on `cron: '0 6 * * *'` + `workflow_dispatch`
- `scripts/e2e-report-issue.mjs` — fingerprint-based issue filer that reads `tests/e2e/artifacts/{run-id}/report.json` and the gh CLI
- Rotating sample logic: Sun=full 76; Mon-Sat=30-patent rotating subset (deterministic by `(week-of-year + day-of-week) mod 76`)
- Pre-flight smoke pattern: 1-case probe on the seed patent first; on smoke fail emit ONE "Google Patents drift suspected" meta-issue and skip suite
- Playwright Chromium install with caching (`actions/cache@v4` keyed by Playwright version from package.json)
- Artifact upload on failure: `tests/e2e/artifacts/{run-id}/` directory archived
- Fingerprint dedup: `hash({caseId, errorClass, top-of-stack-hash})`; query `gh api repos/.../issues?labels=e2e-nightly&state=open` and compare; ≤7-day-old match → comment, else create new

Out of scope (deferred):
- Worker fault-injection — Phase 30
- LLM exploratory mode — Phase 31
- Trend dashboard, Firefox cron — v3.1+

</domain>

<decisions>
## Implementation Decisions

### Workflow file
- **Path:** `.github/workflows/e2e-nightly.yml` (NEW; separate file from existing `ci.yml`)
- **Triggers:** `schedule: '0 6 * * *'` (06:00 UTC daily) + `workflow_dispatch` for manual runs
- **Permissions:** `contents: read`, `issues: write` (minimum needed; least-privilege)
- **Timeout:** 30 minutes total job timeout
- **Runs on:** `ubuntu-latest`
- **Concurrency:** `group: e2e-nightly-${{ github.event.schedule || github.event_name }}, cancel-in-progress: false` (don't cancel a running cron if another fires)

### Playwright Chromium install + cache
- Use `actions/cache@v4` keyed by Playwright dep version from `package.json`:
  ```yaml
  key: pw-${{ runner.os }}-${{ hashFiles('package.json') }}
  path: ~/.cache/ms-playwright
  ```
- Conditional install: only if cache miss
- Skip `--with-deps` on `ubuntu-latest` (deps preinstalled for Chromium)
- Use `npm ci` for deterministic installs

### Rotating sample selection
- Sunday: full live suite (66 cases — 76 total minus 9 TIMEOUT_PILL_DEFERRED minus 1 synthetic "gutter" category)
- Mon-Sat: 30-case rotating subset based on `(weekOfYear + dayOfWeek) mod liveCases.length` (i.e., mod 66)
- Selection happens at runtime in a helper `scripts/select-cron-cases.mjs` that emits a pipe-separated case-id list consumed by `npx playwright test --grep` (regex OR-chain)
- CRON-02 requires the rotation be deterministic across runs of the same day (use UTC date methods: `getUTCDay()`, `getUTCFullYear()`)
- **Modulus override:** Original "mod 76" was updated to `mod liveCases.length` per RESEARCH.md Open Question #1 (RESOLVED) — guarantees exactly 30 live runnable cases per weekday and avoids weeks that would otherwise yield <30 due to deferred-ID clustering

### Pre-flight smoke
- Before the regression suite, run a 1-case smoke probe on `US11427642-spec-short-1`
- If smoke fails (DOM_DRIFT or CAPTCHA detected), the cron emits ONE meta-issue ("Google Patents drift suspected — full suite skipped") and exits with success code 78 (skipped)
- The smoke result is its own report.json case; the meta-issue contains a link to the smoke artifact bundle

### Fingerprint dedup (CRON-05)
- `fingerprint = sha256(`${caseId}|${errorClass}|${topOfStackHash || ''}`)`.substring(0, 12)
- `topOfStackHash` = sha256 of the first non-test stack frame's `file:line:col`, when error has stack
- Issue label: `e2e-nightly`
- Issue body: include fingerprint in a hidden HTML comment `<!-- fingerprint: abc123 -->` so the filer can grep for matches
- Search via `gh api repos/${OWNER}/${REPO}/issues?labels=e2e-nightly&state=open` and grep body for fingerprint
- ≤7-day-old match → `gh issue comment ${num} --body "..."`. Else → `gh issue create --title "..." --body "..." --label e2e-nightly`

### Report reader
- `scripts/e2e-report-issue.mjs` reads:
  - `tests/e2e/artifacts/{run-id}/report.json` (produced by Phase 28's spec wiring)
  - For each case where `status === 'failed' || errorClass !== null && errorClass !== 'FLAKE'`:
    - Compute fingerprint
    - Dedup-query + post

### Artifact upload
- `actions/upload-artifact@v4` named `e2e-nightly-${{ github.run_id }}`
- Path: `tests/e2e/artifacts/`
- Retention: 14 days
- Only-on-failure: `if: failure()`

### Environment vars
- `PLAYWRIGHT_RUN_ID=${{ github.run_id }}` — used by `tests/e2e/lib/run-id.js`
- `GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}` — for gh CLI auto-issue calls

### CRON-03 compliance
- `channel: 'chromium'` already in Phase 26's extension-loader.js — no xvfb-run needed
- Verify CI runs headless without `xvfb-run` (the `headless` key was demoted in Phase 26 CONTEXT; default headless under channel:'chromium' works in CI)

### Phase 28 integration
- Phase 28 already produces report.json in the expected shape. Phase 29 just consumes it.
- Phase 28's verifier verdicts (Tier A/B/C/D + status pass/disagree) feed into the error-class taxonomy. Phase 29 doesn't re-classify; it reads.

### Claude's Discretion
- Exact `actions/cache@v4` cache key format details (version pinning style)
- Whether to use composite action vs inline steps
- Reporter script's exact stack-hash algorithm
- Whether to emit a daily summary issue vs only-on-failure issues (recommend only-on-failure)
- Issue title format (recommend `[e2e-nightly] {caseId}: {errorClass}`)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `tests/e2e/specs/regression.spec.js` — full suite (76 cases minus 11 skips after Phase 28 re-enabled 1)
- `tests/e2e/lib/run-id.js` — `resolveRunId()` uses `PLAYWRIGHT_RUN_ID` env var (already supports CI override)
- `tests/e2e/lib/report.js` — `appendCase` / `writeReport` (Phase 28)
- `tests/e2e/lib/error-codes.js` — RPT-02 taxonomy
- `.github/workflows/ci.yml` — existing CI workflow as reference pattern
- `package.json` — `e2e:regression` script chain

### Established Patterns
- ESM JS
- GitHub Actions v4 actions
- Concurrency groups already established in ci.yml

### Integration Points
- The cron consumes Phase 28's report.json without modification
- The issue filer is a standalone Node script invoked from the workflow's failure path
- No production code changes
</code_context>

<specifics>
## Specific Ideas
- Issue title example: `[e2e-nightly] US11427642-claims-1: VERIFIER_DISAGREE`
- Issue body sections: Summary | Failing patent | Error class | Verifier verdict | Stack hash | Artifact download link | Fingerprint
- Meta-issue title: `[e2e-nightly] Google Patents drift suspected — full suite skipped on YYYY-MM-DD`
- After the issue is filed/commented, the workflow exits success — don't fail the workflow itself; the issue IS the signal
</specifics>

<deferred>
## Deferred Ideas
- Worker fault-injection — Phase 30
- LLM exploratory mode — Phase 31
- Daily summary digest (instead of per-failure issues) — v3.1+
- Auto-close issue when next run is green — v3.1+
- Slack notification — v3.1+
</deferred>

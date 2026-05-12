# Phase 24: Firefox AMO Validation Cleanup - Context

**Gathered:** 2026-05-12
**Status:** Ready for planning
**Mode:** Retro-document — work already on main; plan should verify, not introduce

<domain>
## Phase Boundary

Confirm the Firefox dist (`dist/firefox/`) passes `web-ext lint` cleanly enough to be submission-ready for the Firefox Add-ons store, and that the CI `test:lint` step enforces this on every push/PR.

This is **retroactive documentation** of work already shipped on `main`. The `test:lint` npm script and the corresponding CI step both already exist and pass. Phase 24's job is to anchor the success criteria to verifiable invariants in `package.json` and `.github/workflows/ci.yml`, not to add new code.

In scope:
- Verifying `npm run test:lint` returns exit 0 against the as-built `dist/firefox/`.
- Confirming the `--ignore-files 'lib/**'` flag is justified (PDF.js bundled library; the 5 suppressed warnings are well-known, AMO-tolerated, and unavoidable for any extension shipping PDF.js).
- Confirming CI workflow enforces `test:lint` on every push and PR (not just locally).

Out of scope:
- Filing the actual AMO submission (manual user action; not part of CI).
- Removing or rewriting PDF.js to avoid the warnings (would defeat the extension).
- Reworking build pipeline.

</domain>

<decisions>
## Implementation Decisions

### Lint scope
- `web-ext lint` is the authoritative tool for AMO-blocking checks. AMO's automated validator runs the same engine.
- "AMO-blocking" means **errors** (lint exits non-zero) AND **AMO-rejection-tier warnings**. Notices and benign warnings against third-party libs are acceptable per Mozilla's review policy (https://extensionworkshop.com/documentation/publish/add-on-policies/).
- Current state: `--ignore-files 'lib/**'` produces `errors: 0, warnings: 0, notices: 0`. Without the ignore, only PDF.js-internal warnings appear (DANGEROUS_EVAL, UNSAFE_VAR_ASSIGNMENT on `lib/pdf.mjs` + `lib/pdf.worker.mjs`). These are upstream PDF.js patterns; not actionable from this codebase.

### Ignore-files justification
- `lib/**` excludes the PDF.js bundle. This is consistent with AMO's "vendor library" policy: reviewers expect bundled libraries to be flagged separately and accept them with a source-availability note.
- The pattern is documented in `package.json` and survives every build (the `lib/` directory is copied into `dist/firefox/lib/` by the esbuild pipeline).
- Decision: **keep the `lib/**` ignore** rather than attempting to silence per-warning. Rationale: per-file ignores are brittle; PDF.js version bumps would re-introduce them.

### Enforcement point
- `test:lint` is run by:
  1. Local `npm test` (full test suite gate)
  2. CI `Test — lint (web-ext lint)` step in `.github/workflows/ci.yml` (on every push + PR to main)
  3. CI release workflow (on `v*` tag) at `.github/workflows/release.yml`
- Any of these failing fails the corresponding workflow run. No skip/allow-failure flag is set.

### Claude's Discretion
- Test-coverage approach for invariants (smoke-test the npm script vs. parsing CI YAML) — Claude picks the cleanest minimal approach during planning.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `package.json` — `scripts.test:lint` and `scripts.test` (the latter chains `test:lint` as the final gate).
- `.github/workflows/ci.yml` — `Test — lint (web-ext lint)` step (line ~52).
- `.github/workflows/release.yml` — same `npm run test:lint` step in the release pipeline.
- `dist/firefox/manifest.json` — produced by `scripts/build.js` from `src/manifest.firefox.json`.
- `dist/firefox/lib/` — PDF.js bundle copied by build pipeline; intentionally ignored by lint.

### Established Patterns
- Verification-only plans (Phase 23 model): plans assert "as-shipped" invariants, may add guard tests, and do NOT modify the source under verification.
- Plan front-matter uses `must_haves.truths` to enumerate verifiable invariants; `must_haves.artifacts` lists files that must exist with key contents/patterns.

### Integration Points
- `npm test` is the canonical local gate. CI mirrors local exactly via the same script names. No drift possible by construction.
- `web-ext` is invoked via `npx web-ext lint` — no local install required; version floats with `web-ext` releases. (Acceptable: any web-ext that ships AMO's current rules is fine; reviewers run the latest.)

</code_context>

<specifics>
## Specific Ideas

- Pin a short note explaining the `--ignore-files 'lib/**'` rationale where reviewers will see it (e.g., a comment block near the script in `package.json` is not possible since JSON has no comments — consider a `README` or store-listing note instead, or accept that the GSD SUMMARY.md serves as the audit trail).
- Consider a guard test: a unit test (or grep-based check) that asserts `package.json` retains the lint script with the ignore-files flag, so an accidental removal in a future PR is caught by the test suite rather than only at CI lint-step time.

</specifics>

<deferred>
## Deferred Ideas

- Actual AMO submission and listing copy — deferred to a future store-submission milestone (already noted in PROJECT.md Future Requirements).
- Screenshot / promo tile assets — deferred (STOR-02, STOR-03 in v1.2 known gaps).
- Replacing PDF.js with a non-eval'ing PDF parser — out of scope; not on the project roadmap.

</deferred>

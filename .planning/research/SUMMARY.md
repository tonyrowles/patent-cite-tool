# Project Research Summary

**Project:** Patent Citation Tool v2.1 — GitHub Actions CI/CD Pipeline
**Domain:** GitHub Actions CI/CD for a cross-browser browser extension (Chrome + Firefox MV3)
**Researched:** 2026-03-04
**Confidence:** HIGH

## Executive Summary

The v2.1 milestone is a narrow, well-defined addition: wrap an already-working build and test infrastructure in a GitHub Actions CI/CD pipeline that validates every push, runs the existing 71-case Vitest corpus, and produces store-ready zip artifacts for Chrome and Firefox. The extension already has a complete esbuild pipeline (`npm run build`), four npm test scripts, and a web-ext lint step. CI does not redesign any of this — it calls those exact commands in the correct order on an `ubuntu-latest` runner. All four research areas converge on the same recommendation: a single, linear workflow job with no matrix, no multi-job splits, and no external publish automation.

The recommended approach is a single `.github/workflows/ci.yml` file with one job containing sequential steps: checkout, setup-node (Node 22, `cache: 'npm'`), `npm ci`, `npm run build`, four separate test steps, two zip packaging steps, and `upload-artifact`. Build-before-test ordering is the primary dependency constraint. The pipeline completes in under 60 seconds and produces two store-ready zip artifacts. The `dist/` directories flow between steps via the shared runner filesystem — no inter-job artifact transfer is needed.

The two most consequential risks are (1) running test steps before the build step executes, producing either a loud `Cannot find module` failure or a silent stale-dist pass that validates the wrong code, and (2) double-zipping the artifact by uploading a pre-made `.zip` file to `upload-artifact`, which wraps it in another zip and breaks store submission. Both are trivially avoided with the patterns documented in research. A job-level `timeout-minutes: 10` guards against the secondary risk of a Vitest worker hang that would otherwise consume 6 hours of runner time.

## Key Findings

### Recommended Stack

The CI stack is minimal by design. Three primary GitHub Actions are pinned to their current major versions: `actions/checkout@v6`, `actions/setup-node@v6`, and `actions/upload-artifact@v7`. Node.js 22 LTS is the correct version choice — Node 20 reaches EOL in April 2026 and Node 24 becomes the runner default in June 2026, making Node 22 the stable window for this milestone. The only required npm change is pinning `web-ext` as a devDependency (currently invoked via `npx`, which risks silent version drift in CI). No new npm packages are needed for the workflow itself — GitHub Actions are not npm packages.

**Core technologies:**
- `actions/checkout@v6`: Fetch repo code — latest stable, runs on Actions Runner 2.329.0+ (all GitHub-hosted runners qualify)
- `actions/setup-node@v6` (`cache: 'npm'`): Install Node 22 and cache `~/.npm` keyed on `package-lock.json` hash — built-in caching; explicit `cache: 'npm'` required because `packageManager` field is absent from `package.json`
- `actions/upload-artifact@v7`: Upload store-ready zips — `compression-level: 0` required to prevent double-zipping pre-made zip files; v3 was deprecated November 2024
- `ubuntu-latest` (Ubuntu 24.04): CI runner — has `zip`, Node.js, and git pre-installed; no custom runner needed
- `zip` (shell built-in): Package `dist/chrome/` and `dist/firefox/` — avoids an external action dependency for a one-line operation
- `web-ext@9.4.0` (pinned devDependency): Firefox lint — must be pinned to prevent CI version drift from `npx` resolution
- Node.js 22 LTS: Runtime for all build/test scripts — correct stability window between Node 20 EOL (April 2026) and Node 24 runner default (June 2026)

### Expected Features

The feature set for v2.1 is well-defined with a clear P1/P2/P3 breakdown. All P1 features have LOW implementation cost and no external dependencies. Nothing in v2.1 requires store API credentials or secret management.

**Must have (table stakes — P1):**
- Push triggers on all branches + PR triggers targeting `main` — every commit validated
- `checkout`, `setup-node` with LTS version + npm cache, `npm ci` — standard CI foundation
- `npm run build` as an explicit step before any test step — enforces the build-before-test ordering that the test suite requires
- Individual test steps (`test:src`, `test:chrome`, `test:firefox`, `test:lint`) run with distinct `name:` labels, not via combined `npm test` — produces per-suite pass/fail in the Actions UI without log inspection
- Chrome zip artifact upload with `compression-level: 0` — store-ready, no double-zip
- Firefox zip artifact upload with `compression-level: 0` — same
- Job-level `timeout-minutes: 10` — prevents a Vitest hang from consuming 6 hours of runner time

**Should have (differentiators — P2, add after baseline works):**
- Concurrency group (`cancel-in-progress: true`) — cancels stale PR runs on rapid-push fixups; uses `head_ref || run_id` to cancel PR runs but not main-branch runs
- SHA or ref in artifact names — traceability between artifact download and originating commit
- Conditional artifact upload (main-only) — reduces PR artifact noise
- Explicit `permissions: contents: read` — security hygiene, least privilege

**Defer (v3.0+):**
- Automated Chrome Web Store publish — requires OAuth token management and non-deterministic review queue
- Automated AMO (Firefox) publish — requires AMO API key secrets; `web-ext sign` race conditions during review
- Release workflow with version tagging — when changelog tracking becomes important

### Architecture Approach

The workflow architecture is deliberately simple: one file (`.github/workflows/ci.yml`), one job (`ci`), sequential steps sharing the runner filesystem. No matrix is needed because both browser targets come from one `npm run build` command. No multi-job split is needed because `dist/` flows between steps via the shared filesystem — uploading and downloading it between jobs would add 30-60 seconds of overhead to a pipeline that completes in under 60 seconds. No Docker containers are needed because Node.js LTS on `ubuntu-latest` is sufficient and 2-3x faster. The only new files to create are the `.github/workflows/ci.yml` file and its parent directories. No existing project files require modification.

**Major components:**
1. Trigger block (`on:`) — `push: branches: ['**']` + `pull_request: branches: [main]`; dual triggers cause double-run on PR pushes but are acceptable at this scale; mitigated by P2 concurrency group
2. Dependency installation (`checkout` + `setup-node` + `npm ci`) — foundation; `cache: 'npm'` reduces `npm ci` from ~30s to ~3s on cache hits
3. Build step (`npm run build`) — must precede all test steps; produces `dist/chrome/` and `dist/firefox/` including `matching-exports.js` bundles required by Chrome/Firefox Vitest configs
4. Test steps — four separate `run:` steps with distinct `name:` labels; fail fast; immediate per-suite visibility in Actions UI
5. Packaging steps (`zip` shell commands) — only execute after all tests pass; produces store-ready zips at repo root with `manifest.json` at root of zip (not inside a subdirectory)
6. Artifact upload (`upload-artifact@v7` with `compression-level: 0`) — retains both zips; both zips can be uploaded as a single named artifact (`extension-zips`) to keep the Actions summary clean

### Critical Pitfalls

Research identified 8 pitfalls. The top 5 by severity and likelihood are:

1. **Tests running before build (missing or stale `dist/`)** — `vitest.config.chrome.js` and `vitest.config.firefox.js` resolve imports from `dist/chrome/matching-exports.js` and `dist/firefox/matching-exports.js`. If the build step is absent or placed after test steps, Vitest fails with `Cannot find module` — or worse, passes against a stale cached `dist/` from a previous run. Prevention: explicit `npm run build` step in the workflow before any `npm run test:*` step; never cache `dist/`.

2. **Double-zipping the artifact** — `upload-artifact` always wraps uploaded content in a zip. Uploading a pre-made `.zip` file produces `.zip.zip`. Store submission portals expect `manifest.json` at the zip root — a double-zip fails validation. Prevention: use `cd dist/chrome && zip -r ../../patent-cite-chrome.zip .` (zips contents, not the directory itself) and set `compression-level: 0` on the upload step.

3. **npm cache misconfiguration** — Caching `node_modules/` directly is counterproductive: `npm ci` deletes it immediately. Native binaries (`esbuild`, `sharp`) are platform-specific; a `node_modules/` cache from macOS breaks on Linux runners silently. Prevention: `setup-node` with `cache: 'npm'` caches `~/.npm` with the correct lockfile-keyed cache key automatically.

4. **Vitest hang with no job timeout** — Vitest worker initialization can hang rather than fail, especially with large fixture files. Without `timeout-minutes`, the 6-hour GitHub Actions default applies. Prevention: `timeout-minutes: 10` at the job level — the test suite runs in under 30 seconds locally; any CI run exceeding 5 minutes is a hang.

5. **`web-ext lint` failing on PDF.js library files** — The `--ignore-files 'lib/**'` flag should suppress PDF.js linting, but edge cases exist when manifest-referenced files are also in the ignore list, causing `DANGEROUS_EVAL` or `MANIFEST_CONTENT_SCRIPT_FILE_NOT_FOUND` warnings that exit non-zero. Prevention: verify `npm run test:lint` exits with code 0 locally against a fresh build before committing the workflow; if warnings persist, add `.web-ext-config.cjs` with `ignoreFiles: ['lib/**', 'matching-exports.js']`.

## Implications for Roadmap

This milestone fits in two phases. Research reveals no hidden complexity that would expand scope beyond what the four research files describe.

### Phase 1: Core CI Workflow

**Rationale:** All P1 features form a single dependency chain — checkout must precede install, install must precede build, build must precede tests, tests must precede packaging. There is no partial value to deliver from this set: a CI pipeline either runs end-to-end or it does not. Everything in P1 belongs in one phase.

**Delivers:** A passing `.github/workflows/ci.yml` that validates every push to every branch and every PR to `main`, and produces Chrome + Firefox zip artifacts downloadable from the Actions run summary.

**Addresses:** All P1 features — triggers, checkout/setup-node/npm-ci foundation, build step, four separate named test steps, zip packaging, artifact upload with correct settings.

**Avoids:**
- Pitfall 1 (build-before-test) — enforced by explicit step sequence in YAML
- Pitfall 2 (double-zip) — avoided by `compression-level: 0` and correct zip command pattern
- Pitfall 3 (npm cache misconfiguration) — avoided by `setup-node` with `cache: 'npm'`, no manual `actions/cache` step
- Pitfall 4 (Vitest hang) — avoided by `timeout-minutes: 10` at job level
- Pitfall 5 (web-ext lint PDF.js false positives) — validate locally before merging
- Pitfall 6 (Node binary mismatch) — avoided by explicit `node-version: '22'`

**Stack elements used:** `actions/checkout@v6`, `actions/setup-node@v6`, Node.js 22, `ubuntu-latest`, `zip`, `actions/upload-artifact@v7`, `web-ext@9.4.0` (pinned devDependency)

### Phase 2: CI Hardening

**Rationale:** P2 features are one-liner YAML additions that require the baseline workflow to be observable in practice before they provide value. Concurrency groups are most useful once rapid-push stacking is observed; SHA artifact names are useful once artifact traceability matters; conditional upload is useful once PR artifact noise is noticed. None of these block the P1 pipeline from functioning.

**Delivers:** Concurrency group (cancels stale in-progress PR runs), SHA-suffixed artifact names (traceability), conditional artifact upload gated on `refs/heads/main` (reduces PR noise), explicit `permissions: contents: read` (security hygiene).

**Uses:** No new stack elements — all are YAML configuration changes to the existing workflow file.

**Avoids:** Pitfall 5 (double-trigger run accumulation on PR branches) via concurrency group.

### Phase 3: Automated Store Submission (Deferred to v3.0+)

**Rationale:** Requires Chrome Web Store OAuth credentials, AMO API keys, a separate release job gated on tags, and handling non-deterministic review queue states. Research consensus is unambiguous: produce the zip artifact in v2.1, submit manually, automate in v3.0 only after the manual workflow is validated and store listings are active.

**Delivers:** Automated publish to Chrome Web Store and/or AMO triggered on tagged releases.

**Stack elements needed (when prioritized):** `chrome-webstore-upload-action` or equivalent; `web-ext sign` with AMO JWT secrets; GitHub repository secrets for API credentials; separate `release` job with `needs: ci` and `if: startsWith(github.ref, 'refs/tags/')`.

### Phase Ordering Rationale

- Phase 1 is a prerequisite for Phase 2: the P2 features (concurrency group, artifact naming, permissions) are refinements to a running workflow. There is no workflow to refine until Phase 1 exists.
- Phase 2 features are purely additive YAML changes with no new dependencies and can ship as a follow-up PR immediately after Phase 1 validates.
- Phase 3 is blocked on external prerequisites (live store listings, OAuth credentials, AMO API access) that are not available for v2.1 and are explicitly out of scope per milestone definition.
- The single-job architecture eliminates the build-to-test artifact transfer problem that would otherwise require a multi-phase approach or inter-job dependencies.
- Running each npm test script as a separate named step (rather than `npm test`) is a cross-cutting architectural decision that affects Phase 1 implementation: it provides immediate per-suite failure visibility in the Actions UI at zero additional cost.

### Research Flags

Phases with standard, well-documented patterns — skip `/gsd:research-phase`:
- **Phase 1 (Core CI Workflow):** All action versions, Node version, npm caching, zip packaging, and artifact upload patterns are verified against official GitHub releases and changelogs. STACK.md and ARCHITECTURE.md contain ready-to-use YAML snippets. No domain-specific unknowns remain.
- **Phase 2 (CI Hardening):** Concurrency groups, conditional steps, and permissions blocks are standard YAML patterns documented in GitHub Actions official docs.

Phases that need research before planning if ever prioritized:
- **Phase 3 (Automated Store Submission):** Chrome Web Store API and AMO API are subject to change; OAuth token refresh handling is a known pain point. Research the current CWS API v2 and AMO `web-ext sign` documentation before planning this phase.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All action versions verified against GitHub releases on 2026-03-04. Node version guidance verified against GitHub changelog. `setup-node` caching behavior verified against official advanced-usage docs. |
| Features | HIGH | Feature set is derived directly from the project's existing `package.json` scripts — no guesswork. P1/P2/P3 prioritization is based on dependency ordering and implementation cost, both LOW for P1. |
| Architecture | HIGH | Single-job pattern verified against GitHub Actions official docs. Anti-patterns (matrix, multi-job split, `npm test` in CI, double-zip) are documented in official action repos and GitHub blog. |
| Pitfalls | HIGH (most) / MEDIUM (some) | Critical pitfalls (build ordering, cache, double-zip, artifact names) are HIGH confidence from official docs and maintainer-acknowledged issues. web-ext lint PDF.js behavior and Vitest hang edge cases are MEDIUM confidence from issue tracker reports. |

**Overall confidence:** HIGH

### Gaps to Address

- **`web-ext lint` PDF.js behavior in CI vs. local:** MEDIUM confidence gap. The `--ignore-files 'lib/**'` interaction with manifest-referenced files has documented edge cases. Validate by running `npm run test:lint` locally against a clean `dist/` build before merging the CI workflow. If the lint step exits non-zero, add `.web-ext-config.cjs` with `ignoreFiles: ['lib/**', 'matching-exports.js']`.

- **`concurrency` group PR vs. main behavior:** The `${{ github.head_ref || github.run_id }}` pattern is the recommended approach for differentiating PR runs (cancel) from main branch runs (do not cancel). Verified via community pattern matching official docs behavior, but worth observing on the first few real CI runs to confirm the expected cancellation behavior.

- **`sharp` native binary during `npm ci`:** `sharp` is a native binary used only in `generate-icons.mjs` (not in the CI pipeline). If `npm ci` produces platform binary warnings for `sharp` on the Linux runner, consider `npm ci --ignore-scripts` with care, or restructuring `sharp` as an optional/separate devDependency. Not blocking for Phase 1 but worth monitoring on the first CI run.

## Sources

### Primary (HIGH confidence)
- [GitHub releases: actions/checkout](https://github.com/actions/checkout/releases) — v6 confirmed as latest, verified 2026-03-04
- [GitHub releases: actions/setup-node](https://github.com/actions/setup-node/releases) — v6.3.0 confirmed; `cache: 'npm'` caches `~/.npm`, not `node_modules/`
- [setup-node advanced usage docs](https://github.com/actions/setup-node/blob/main/docs/advanced-usage.md) — automatic caching requires `packageManager` field; explicit `cache: 'npm'` required for this project
- [GitHub releases: actions/upload-artifact](https://github.com/actions/upload-artifact/releases) — v7.0.0 confirmed as latest
- [GitHub changelog: upload-artifact v7 non-zipped artifacts](https://github.blog/changelog/2026-02-26-github-actions-now-supports-uploading-and-downloading-non-zipped-artifacts/) — `compression-level: 0` behavior confirmed
- [GitHub changelog: Node 20 deprecation on Actions runners](https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/) — Node 24 becomes runner default June 2, 2026; Node 20 EOL April 2026
- [GitHub changelog: ubuntu-latest = Ubuntu 24.04](https://github.blog/changelog/2024-09-25-actions-new-images-and-ubuntu-latest-changes/) — `ubuntu-latest` points to Ubuntu 24.04 since January 2025
- [GitHub Docs: Building and testing Node.js](https://docs.github.com/en/actions/automating-builds-and-tests/building-and-testing-nodejs) — `npm ci`, `setup-node`, cache configuration
- [actions/upload-artifact v4+ README](https://github.com/actions/upload-artifact) — unique artifact names, double-zip issue, retention-days, v4/v7 vs. v3 breaking changes
- [GitHub blog: upload-artifact double-zip issue #39](https://github.com/actions/upload-artifact/issues/39) — maintainer-acknowledged double-zip when uploading pre-built zip file
- [Unit 42: ArtiPACKED](https://unit42.paloaltonetworks.com/github-repo-artifacts-leak-tokens/) — artifact security risks, git token exposure (August 2024)
- [GitHub releases: mozilla/web-ext](https://github.com/mozilla/web-ext/releases) — v9.4.0 confirmed as latest as of 2026-03-04
- Project source (`package.json`, `scripts/build.js`, Vitest configs) — ground truth for CI command ordering and `dist/` dependency structure

### Secondary (MEDIUM confidence)
- [GitHub community: pull_request triggers fire twice](https://github.com/orgs/community/discussions/26940) — push + pull_request both trigger on PR branch push
- [GitHub Actions concurrency community discussion](https://generalreasoning.com/blog/2025/02/05/github-actions-concurrency.html) — `head_ref || run_id` pattern for PR vs. push differentiation
- [Vitest GitHub Discussions #5507](https://github.com/vitest-dev/vitest/discussions/5507) — Vitest hangs in GitHub Actions, exceeded maximum execution time
- [mozilla/web-ext issue #1376](https://github.com/mozilla/web-ext/issues/1376) — web-ext lint false positives on third-party library files
- [mozilla/web-ext issue #397](https://github.com/mozilla/web-ext/issues/397) — `ignore-files` pattern behavior with lint
- [esbuild GitHub issue #1646](https://github.com/evanw/esbuild/issues/1646) — esbuild-linux-64 not found after cross-platform npm install
- [DEV Community: Simplify Browser Extension Deployment with GitHub Actions](https://dev.to/jellyfith/simplify-browser-extension-deployment-with-github-actions-37ob) — real-world extension CI workflow patterns
- [DEV Community: Releasing WebExtension using GitHub Actions](https://dev.to/cardinalby/releasing-webextension-using-github-actions-i9j) — packaging patterns for store submission

---
*Research completed: 2026-03-04*
*Ready for roadmap: yes*

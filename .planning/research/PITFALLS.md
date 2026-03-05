# Pitfalls Research

**Domain:** Adding GitHub Actions CI/CD pipeline to an existing cross-browser browser extension project (esbuild, Vitest, web-ext)
**Researched:** 2026-03-04
**Confidence:** HIGH (GitHub Actions workflow behavior, npm caching, artifact handling verified against official docs and GitHub community discussions) / HIGH (esbuild and Vitest CI integration verified against official docs and known issues) / MEDIUM (web-ext lint behavior in CI verified via mozilla/web-ext issue tracker)

---

## Critical Pitfalls

### Pitfall 1: Tests Run Before Build Completes — dist/ Is Missing or Stale

**What goes wrong:**
The Vitest configs (`vitest.config.chrome.js` and `vitest.config.firefox.js`) resolve imports from `dist/chrome/matching-exports.js` and `dist/firefox/matching-exports.js` respectively. If the workflow runs `npm run test:chrome` before `npm run build` completes, Vitest fails with `Cannot find module './dist/chrome/matching-exports.js'`. Worse: if `dist/` is cached from a previous run, the test suite silently validates stale bundled code rather than the current commit's output. Both scenarios produce incorrect CI results — one fails loudly and the other passes incorrectly.

**Why it happens:**
GitHub Actions steps are sequential by default, but the ordering is specified manually in the workflow YAML. First-time workflow authors often model CI after local dev where `npm test` already runs `npm run build` first (as specified in `package.json`: `"test": "npm run build && npm run test:src && ..."`). When workflow steps are written individually, the build dependency is easy to omit. Caching `dist/` to speed up repeated builds makes the stale artifact problem invisible.

**How to avoid:**
Never cache `dist/`. Always run build as an explicit step before any test step. The full sequence in the workflow must be:
1. `npm ci` (install dependencies)
2. `npm run build` (produces `dist/chrome/` and `dist/firefox/` and `dist/chrome/matching-exports.js`)
3. `npm run test:src` (tests source-level imports — does not require dist/)
4. `npm run test:chrome` (requires `dist/chrome/matching-exports.js`)
5. `npm run test:firefox` (requires `dist/firefox/matching-exports.js`)
6. `npm run test:lint` (requires `dist/firefox/` for web-ext lint)

Only `~/.npm` (the npm cache) should be cached, never `node_modules/` or `dist/`.

**Warning signs:**
- Workflow runs `test:chrome` or `test:firefox` in a step before a `build` step
- `dist/` directory appears in the cache key definition
- `vitest.config.chrome.js` alias resolution fails with `ENOENT` in CI logs
- Tests pass in CI but the diff under review includes algorithm changes — suspect stale dist/ if no rebuild step

**Phase to address:**
CI Workflow Setup (Phase 1) — the build-before-test ordering must be the first constraint enforced in the workflow YAML.

---

### Pitfall 2: npm cache Misconfiguration Causes Spurious Cache Misses or Broken Installs

**What goes wrong:**
Two opposite failure modes exist:
- **Caching `node_modules/` directly**: `npm ci` deletes `node_modules/` before installing, so caching it and then running `npm ci` negates the cache entirely (cache restore wasted, full install anyway). Native binaries like `esbuild` and `sharp` are architecture-specific; a cached `node_modules/` from a macOS dev machine silently produces broken binaries on the Linux runner.
- **Wrong cache key**: Using `${{ runner.os }}-node-modules` without `hashFiles('package-lock.json')` means the cache never invalidates when dependencies change. A stale cache will serve the old `esbuild` binary after a version bump, causing subtle build differences without any error.

**Why it happens:**
The official GitHub Actions documentation recommends caching `~/.npm` (the global npm cache) keyed to `package-lock.json`, but tutorials and Stack Overflow answers often show `node_modules/` caching because it appears faster. The difference is not obvious until native binaries or cross-platform issues surface.

**How to avoid:**
Use `actions/setup-node` with the `cache: 'npm'` option. This automatically caches `~/.npm` keyed to `package-lock.json`, and runs `npm ci` fresh each time. Never manually cache `node_modules/` or `dist/`. The correct pattern:

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: '22'
    cache: 'npm'
- run: npm ci
```

The `cache: 'npm'` option in `setup-node` handles the cache key (`${{ runner.os }}-node-${{ hashFiles('package-lock.json') }}`) automatically.

**Warning signs:**
- Workflow YAML contains `actions/cache` with `path: node_modules`
- Cache key does not include `hashFiles('package-lock.json')`
- `esbuild` binary error: `The package "esbuild-linux-64" could not be found` after cache restore
- Build succeeds in CI but produces different output than local builds (native binary version mismatch)

**Phase to address:**
CI Workflow Setup (Phase 1) — cache configuration is the first performance decision and must be correct before any other steps are optimized.

---

### Pitfall 3: Double-Zipping the Extension Package in Artifacts

**What goes wrong:**
`actions/upload-artifact` always wraps uploaded content in a zip. If the workflow creates a zip file (e.g., `chrome-extension.zip`) and then uploads it with `upload-artifact`, the downloaded artifact is `chrome-extension.zip.zip` — a zip containing a zip. Store submission portals expect a single flat zip containing the extension files, not a nested archive. The inner zip has the correct extension structure; the outer zip is the artifact wrapper. Developers submitting to the Chrome Web Store or AMO receive confusing validation errors about zip structure.

**Why it happens:**
`upload-artifact`'s auto-zipping behavior is not obvious. The action was designed to transfer files between jobs, not to produce store-ready archives. When using `web-ext build` to produce a zip, developers naturally upload the resulting zip file, triggering the double-zip.

**How to avoid:**
Upload the `dist/` directory directly, not a pre-created zip. `upload-artifact` will zip the directory and the downloaded artifact will unzip to the extension files. If a store-ready zip is needed as an explicit artifact, upload the directory contents not the zip file:

```yaml
# Option A: Upload the dist directory (download produces a zip of the extension files)
- uses: actions/upload-artifact@v4
  with:
    name: chrome-extension
    path: dist/chrome/

# Option B: Create zip explicitly with zip CLI, then upload the directory
# (Never upload a pre-created .zip file to upload-artifact)
```

Alternatively, create the zip explicitly during the submission step using `zip -r` and upload it as a release asset (not a workflow artifact) if store submission is the goal.

**Warning signs:**
- Workflow runs `web-ext build` and then uploads the resulting `.zip` file with `upload-artifact`
- Downloaded artifact is named `extension-name.zip.zip`
- Store validator rejects the zip with "invalid archive structure" or "expected manifest at root"
- Artifact path in YAML ends in `.zip`

**Phase to address:**
CI Artifact Packaging (Phase 2) — upload strategy must be decided before the first packaging step is written.

---

### Pitfall 4: web-ext lint Fails on PDF.js Library Files in CI

**What goes wrong:**
`web-ext lint --source-dir dist/firefox --ignore-files 'lib/**'` is the current `test:lint` command. In CI, `web-ext lint` may still emit errors or warnings about `dist/firefox/lib/pdf.mjs` and `dist/firefox/lib/pdf.worker.mjs` — the pre-compiled PDF.js library files. The `--ignore-files` flag in web-ext has documented behavioral edge cases: when a file listed in `ignore-files` is also referenced in the manifest's `web_accessible_resources`, the linter may emit `MANIFEST_CONTENT_SCRIPT_FILE_NOT_FOUND` or `DANGEROUS_EVAL` warnings from inside the PDF.js minified source. These warnings cause the lint step to exit with a non-zero code, failing CI.

**Why it happens:**
`web-ext lint` is designed for authored extension code. Pre-compiled third-party libraries like PDF.js contain patterns (eval, dynamic imports, minified code patterns) that trigger linter rules. The `--ignore-files` glob pattern applies to the file exclusion list but the interaction with manifest-referenced files is incomplete — the linter still inspects manifest-referenced files for security warnings.

**How to avoid:**
Use `web-ext lint` with explicit ignore patterns tested against the actual CI environment before merging. Verify the exact lint output by running `npx web-ext lint --source-dir dist/firefox --ignore-files 'lib/**'` locally against a built dist. If warnings are generated, add them to a `--warnings-as-errors` allowlist or upgrade the ignore pattern. Consider using `--no-warnings` only for known safe third-party libraries. The lint step must exit cleanly in CI; warnings-as-errors behavior must be configured explicitly.

If PDF.js warnings persist despite `--ignore-files`, use the web-ext config file approach: create a `.web-ext-config.cjs` at the project root that explicitly ignores the library directory:

```javascript
module.exports = {
  ignoreFiles: ['lib/**', 'matching-exports.js'],
};
```

**Warning signs:**
- CI lint step fails with warnings about `lib/pdf.mjs` or `lib/pdf.worker.mjs`
- `DANGEROUS_EVAL` or `UNSAFE_EVAL` warning appears in CI but not in local lint run (different web-ext versions)
- web-ext version in CI differs from locally installed version (version pinning missing)
- `--ignore-files` pattern uses forward slashes that work locally on macOS but not on the Linux runner

**Phase to address:**
CI Workflow Setup (Phase 1) — lint configuration must be validated against the built dist before the workflow is finalized.

---

### Pitfall 5: Workflow Triggers Fire Twice on PRs to Main

**What goes wrong:**
A workflow configured with both `on: push` (all branches) and `on: pull_request` (to main) runs twice when a PR branch is pushed: once for the `push` event on the feature branch, and once for the `pull_request` event targeting main. For this project, the doubling is mostly harmless (no side effects beyond wasted runner minutes), but the redundant runs clutter the PR status checks UI and consume free-tier minutes faster.

**Why it happens:**
The naive "run on everything" configuration does not account for the fact that pushing commits to a PR branch triggers both events. The `push` event fires for the branch; the `pull_request` event fires for the PR. GitHub treats them as separate events with separate workflow runs.

**How to avoid:**
Scope the triggers explicitly for this project's needs:
- `on: push` — run on all branches (catches developer pushes before a PR is opened)
- `on: pull_request` — run only when targeting `main`; use `branches: [main]`

This is still somewhat redundant (a PR branch push triggers both), but acceptable for a single-developer project where free-tier minutes are ample. The alternative is to use only `on: pull_request` (no `on: push`) if CI is only needed for PRs, or to use concurrency groups to cancel redundant runs.

The v2.1 requirement states "triggered on push (all branches) and PRs to main" — this is the correct configuration; just be aware of the double-run behavior.

**Warning signs:**
- PR status checks show two entries for the same workflow (one from push, one from pull_request)
- Runner minutes being consumed at roughly 2x expected rate
- `pull_request` branch filter incorrectly filters on the source branch instead of the base branch

**Phase to address:**
CI Workflow Setup (Phase 1) — trigger configuration is the first section of the workflow YAML.

---

### Pitfall 6: Node Version Mismatch Between Local Dev and CI Causes Native Binary Failures

**What goes wrong:**
`esbuild` and `sharp` (used by `generate-icons.mjs`) are native binaries. esbuild ships separate binaries per platform/architecture (`esbuild-linux-64`, `esbuild-darwin-arm64`, etc.). If `package-lock.json` was generated on macOS (ARM64) and the CI runner is `ubuntu-latest` (x86_64), the lockfile may contain references to the wrong platform's binary. `npm ci` on the Linux runner will attempt to install the macOS binary, fail, and fall back to a platform rebuild — which may succeed or fail depending on whether build tools are available.

Separately, if the local Node version is 18 and CI uses Node 22, native module ABI compatibility issues can occur with `sharp`.

**Why it happens:**
`package-lock.json` in npm 7+ is a single-platform lockfile by default. When `npm ci` is run on a different platform/architecture, npm resolves the correct platform binary at install time, which may differ from what's in the lockfile. This causes a lockfile integrity check warning or failure.

**How to avoid:**
Pin Node version in the workflow explicitly. Use the same major Node version as local development:

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: '22'
    cache: 'npm'
```

Run `npm ci` (not `npm install`) in CI — it honors the lockfile and produces a clean install. If `npm ci` warns about platform-specific binary resolution, regenerate `package-lock.json` on a Linux machine (or via CI itself) to produce a cross-platform lockfile.

Note: `sharp` is only used in `generate-icons.mjs`, which is not part of the CI pipeline (icon generation is a manual step). If `sharp` causes installation issues, it can be excluded from CI using `npm ci --ignore-scripts` with care, or the generate-icons script can be made optional in CI.

**Warning signs:**
- `npm ci` emits warnings about platform-specific optional dependencies being skipped
- `esbuild` throws `Error: The package "esbuild-linux-64" could not be found` in CI
- CI build succeeds locally but fails with native module errors in the runner
- Node version in `engines` field of `package.json` differs from `node-version` in workflow YAML

**Phase to address:**
CI Workflow Setup (Phase 1) — Node version pinning is part of the first workflow step.

---

### Pitfall 7: Artifact Names Must Be Unique Within a Workflow Run

**What goes wrong:**
`actions/upload-artifact@v4` does not allow uploading to the same artifact name twice within a single workflow run. If the workflow uploads Chrome and Firefox extension zips separately, they must have distinct names (`chrome-extension-v1.2.3` and `firefox-extension-v1.2.3`). If both use the same name, the second upload fails with `An artifact with this name already exists`.

**Why it happens:**
The v4 artifact action changed behavior from v3: v3 allowed appending to the same artifact name; v4 treats artifact names as immutable within a run. Workflows copied from v3-era tutorials silently produce this error when updated to v4.

**How to avoid:**
Name artifacts distinctly:
```yaml
- uses: actions/upload-artifact@v4
  with:
    name: chrome-extension
    path: dist/chrome/

- uses: actions/upload-artifact@v4
  with:
    name: firefox-extension
    path: dist/firefox/
```

Include the version from `manifest.json` in the artifact name if versioned artifacts are needed: `name: chrome-extension-${{ steps.version.outputs.version }}`.

**Warning signs:**
- Single `name:` value used for multiple `upload-artifact` steps in the same job
- Error: `An artifact with this name already exists for the associated workflow run`
- Workflow was adapted from an older tutorial using `actions/upload-artifact@v2` or `@v3`

**Phase to address:**
CI Artifact Packaging (Phase 2) — artifact naming is defined when the packaging steps are written.

---

### Pitfall 8: Vitest Hangs Indefinitely in CI — No Timeout Configured

**What goes wrong:**
Vitest can hang in GitHub Actions without producing a failure exit code in specific scenarios: when a test opens an async resource that is never closed (file handles, timers), when the Vitest worker pool fails to initialize, or when `vitest run` waits for a hanging worker process. GitHub Actions has a default job timeout of 6 hours — a hanging Vitest process will consume the full 6 hours of runner time before the job is cancelled, burning runner credits and blocking PR merge.

**Why it happens:**
Vitest's worker pool spawns Node.js worker threads for each test file. In rare cases (especially with large fixture files or resource-intensive tests), worker initialization can hang rather than fail. The issue is documented in the Vitest GitHub discussions (`#5507`, `#5506`). This project runs 71 patent test cases with large fixture files — the risk is higher than for small test suites.

**How to avoid:**
Set an explicit `timeout-minutes` on the test job:

```yaml
jobs:
  ci:
    runs-on: ubuntu-latest
    timeout-minutes: 10
```

Ten minutes is generous for a Vitest suite that runs in seconds locally. If CI consistently takes longer, investigate why — it should not. The timeout converts a hang from a 6-hour runner burn to a clean 10-minute failure.

**Warning signs:**
- CI job runs for more than 5 minutes without completing (local test suite runs in under 30 seconds)
- Job log shows Vitest output stopped mid-run with no error
- Job eventually cancelled with "The job exceeded the maximum execution time" after hours

**Phase to address:**
CI Workflow Setup (Phase 1) — set `timeout-minutes` on the job when the workflow is first created.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Caching `dist/` between CI runs | Faster CI by skipping rebuild | Tests validate stale bundled output, not the current commit; regressions go undetected | Never — build must always run fresh from source |
| Using `npm install` instead of `npm ci` in CI | Supports lock-file-free setups | Non-deterministic installs; different package versions between CI runs; slow (resolves dependency graph each run) | Never in CI — always use `npm ci` |
| Pinning action versions to major tag (`@v4`) instead of commit SHA | Easier to update | Tag can be moved by maintainer to include breaking changes; supply chain risk (documented ArtiPACKED vulnerability) | Acceptable for well-maintained official actions (`actions/*`, `setup-node`). Use SHA pinning only if repo has strict supply-chain requirements |
| Omitting `timeout-minutes` from jobs | Simpler YAML | Hanging test process consumes up to 6 hours of runner time per incident | Never — always set a generous but finite timeout |
| Single workflow file for all CI jobs | Simpler to manage | All jobs run sequentially if in one job; cannot parallelize build and test | Acceptable for this project's scale — sequential steps in one job are fine |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| `actions/upload-artifact@v4` + pre-built zip | Uploading a `.zip` file creates a double-zip (`extension.zip.zip`) | Upload the extension directory directly; the action wraps it into a single zip automatically |
| `actions/setup-node` + `npm ci` | Manually configuring `actions/cache` for `node_modules/` instead of using the built-in cache option | Use `cache: 'npm'` in `setup-node` — it handles cache key generation from `package-lock.json` automatically |
| `web-ext lint` + PDF.js library files | Running lint without `--ignore-files 'lib/**'` generates false positives from PDF.js minified code | Always pass `--ignore-files 'lib/**'` or configure `.web-ext-config.cjs`; verify lint passes against a fresh `dist/` build in CI |
| `vitest run` + multiple configs | Running `npm run test:chrome` before `npm run build` — dist alias targets are missing | Enforce build step before any Vitest step; never parallelize build and test steps |
| GitHub Actions triggers + PRs | Using both `on: push` and `on: pull_request` without concurrency groups causes duplicate runs | Use `concurrency` groups to cancel in-progress runs when a new push arrives, or accept the duplication for a solo-developer project |
| `actions/upload-artifact@v4` + duplicate names | Two steps uploading to the same artifact name in one job fails silently or errors | Use distinct names: `chrome-extension` and `firefox-extension` |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Caching `node_modules/` instead of `~/.npm` | Cache hit but `npm ci` deletes it immediately; no speedup | Use `setup-node` with `cache: 'npm'` which caches `~/.npm` and keeps `npm ci` correct | Every CI run — the trap is silent, just wasteful |
| Rebuilding both Chrome and Firefox when only one changed | Full 2× build time for every push | For this project, build time is under 10 seconds — not worth splitting; if it grows, separate Chrome and Firefox into jobs with path filters | When build time exceeds 2 minutes |
| Running `npm run test` (which rebuilds) instead of split steps | Build runs twice — once in the build step and again inside `npm run test` | In CI, run build once explicitly, then run each test command individually | Any time the full `npm test` script is used as a CI step |
| Large fixture files checked into git causing slow checkouts | `actions/checkout` takes longer than the build | Fixture files in `tests/fixtures/` are already in the repo and reasonable in size; not a current problem | If patent fixture PDFs are added as binary blobs |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Uploading the entire workspace directory as an artifact | Git token from `.git/hidden-config` is included in the artifact (ArtiPACKED vulnerability); publicly readable on open repos | Always specify exact paths in `upload-artifact`; never use `.` or `./` as the `path` |
| Using `pull_request_target` instead of `pull_request` for CI | `pull_request_target` runs with elevated permissions and can read org secrets; fork PRs can abuse this | This project only needs `pull_request` (no elevated permissions required for build/test CI) |
| Secrets in workflow environment variables printed to logs | Build logs are public on public repos; `echo $SECRET` or `-v` flags expose secret values | Use `${{ secrets.* }}` syntax; never echo secrets; this project has no secrets needed in CI (build is self-contained) |
| Extension zip artifact containing source maps | Source maps reverse-engineer the minified extension code, exposing business logic and the Cloudflare proxy token | Ensure `sourcemap: false` in production build (already the case in `scripts/build.js` when not in watch mode); verify no `.js.map` files appear in `dist/` during build |

---

## UX Pitfalls

*This section focuses on developer UX — the experience of using the CI pipeline.*

| Pitfall | Developer Impact | Better Approach |
|---------|-----------------|-----------------|
| Workflow job named `build` when it also tests and packages | Confusing status display in PR checks — "build failed" when it was actually a lint failure | Name the job specifically: `ci` with steps `Build`, `Test`, `Lint`, `Package` — or use separate jobs per concern |
| Artifact retention set to 90 days (default) for every push | Artifact storage quota fills up; old push artifacts are not useful | Set `retention-days: 7` for push-triggered runs; keep 90-day retention only for artifacts from tags/releases |
| No step names in workflow YAML | CI log output shows step index numbers, not meaningful names | Always add `name:` to every `run:` and `uses:` step |
| CI passes but artifact is the wrong extension version | Developer downloads artifact, submits wrong version to store | Include version from `manifest.json` in artifact name; verify by checking the artifact name in the PR |

---

## "Looks Done But Isn't" Checklist

- [ ] **Build-before-test ordering:** Workflow YAML has an explicit `npm run build` step before any `npm run test:*` step — verify by reading the YAML top-to-bottom
- [ ] **Cache is `~/.npm` not `node_modules/`:** `setup-node` uses `cache: 'npm'`; no separate `actions/cache` step for `node_modules`
- [ ] **No double-zip:** `upload-artifact` path points to `dist/chrome/` and `dist/firefox/` (directories), not to `.zip` files
- [ ] **Artifact names are distinct:** Chrome and Firefox artifacts have different `name:` values in the YAML
- [ ] **Timeout is set:** Job-level `timeout-minutes` is present and set to a reasonable value (10-15 minutes)
- [ ] **web-ext lint passes locally first:** Run `npm run test:lint` locally against a fresh build before adding it to CI; CI lint must pass with zero errors
- [ ] **No source maps in packaged dist:** Run `ls dist/chrome/ dist/firefox/` after build to verify no `.js.map` files exist (production build has `sourcemap: false`)
- [ ] **Node version pinned:** `setup-node` specifies `node-version: '22'` (or current LTS); not `node-version: 'latest'` (unstable) or no version (runner default)
- [ ] **Workflow triggers match requirements:** `on: push` covers all branches; `on: pull_request` targets `main`; no unintended triggers

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Tests validated stale dist/ | LOW | Delete dist/ from cache (force cache miss by changing cache key suffix), re-run workflow |
| Double-zipped artifact submitted to store | LOW | Download artifact, unzip outer wrapper, submit inner zip; fix workflow to upload directory not zip file |
| Vitest hanged for 6 hours | LOW (time lost, no data loss) | Cancel job manually; add `timeout-minutes`; investigate which test file caused the hang using `vitest run --reporter=verbose` |
| web-ext lint failing on PDF.js warnings | LOW | Add `--ignore-files 'lib/**'` to lint command or create `.web-ext-config.cjs`; rerun workflow |
| Node version binary mismatch | MEDIUM | Delete the cached `~/.npm`, run `npm ci` fresh, verify native binary installs correctly; may need to regenerate `package-lock.json` on Linux |
| `upload-artifact` duplicate name failure | LOW | Rename one artifact; rerun workflow |
| Workflow double-running on PR push | LOW | Add concurrency group to cancel in-progress runs; or accept the duplication |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Tests run before build (missing dist/) | CI Workflow Setup | Inspect YAML step order: build step must precede all test steps |
| npm cache misconfiguration | CI Workflow Setup | Confirm `setup-node` uses `cache: 'npm'`; no `actions/cache` for `node_modules/` |
| Double-zip artifact | CI Artifact Packaging | Download the artifact from a test run; verify it unzips to extension files (manifest.json at root), not to another zip |
| web-ext lint false positives on PDF.js | CI Workflow Setup | Run lint step in CI; verify it exits with code 0 with zero errors |
| Workflow double-triggers | CI Workflow Setup | Open a PR and push a commit; observe how many workflow runs appear in the PR status checks |
| Node/native binary version mismatch | CI Workflow Setup | First CI run on a fresh runner; verify `npm ci` completes without platform binary warnings |
| Artifact naming collision | CI Artifact Packaging | Verify Chrome and Firefox artifact names differ in YAML; download both from one run |
| Vitest hang with no timeout | CI Workflow Setup | Verify `timeout-minutes` is present at the job level in YAML |

---

## Sources

- [GitHub Docs: Building and testing Node.js](https://docs.github.com/en/actions/automating-builds-and-tests/building-and-testing-nodejs) — `npm ci`, `setup-node`, cache configuration (HIGH confidence, official docs)
- [actions/setup-node: Advanced Usage](https://github.com/actions/setup-node/blob/main/docs/advanced-usage.md) — `cache: 'npm'` option, package-lock.json cache key behavior (HIGH confidence, official)
- [actions/upload-artifact v4 README](https://github.com/actions/upload-artifact) — unique artifact names, double-zip issue, retention-days, v4 breaking changes from v3 (HIGH confidence, official)
- [GitHub blog: upload-artifact double-zip issue #39](https://github.com/actions/upload-artifact/issues/39) — confirmed double-zip when uploading pre-built zip file (HIGH confidence, maintainer acknowledged)
- [GitHub community: pull_request triggers fire twice](https://github.com/orgs/community/discussions/26940) — push + pull_request both trigger on PR branch push (HIGH confidence, community confirmed)
- [GitHub Docs: Workflow syntax — on.pull_request.branches](https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions) — branch filter applies to base branch, not source branch (HIGH confidence, official docs)
- [Vitest GitHub Discussions #5507](https://github.com/vitest-dev/vitest/discussions/5507) — vitest hangs in GitHub Actions, exceeded maximum execution time (MEDIUM confidence, community reports)
- [Vitest GitHub issue #3644](https://github.com/vitest-dev/vitest/issues/3644) — vitest failing tests not emitting failure exit in GitHub Actions (MEDIUM confidence, issue tracker)
- [mozilla/web-ext issue #1376](https://github.com/mozilla/web-ext/issues/1376) — web-ext lint false positives on third-party library files (MEDIUM confidence, official issue tracker)
- [mozilla/web-ext issue #397](https://github.com/mozilla/web-ext/issues/397) — ignore-files pattern behavior with lint (MEDIUM confidence, official issue tracker)
- [esbuild GitHub issue #1646](https://github.com/evanw/esbuild/issues/1646) — esbuild-linux-64 not found after cross-platform npm install (MEDIUM confidence, issue tracker)
- [esbuild GitHub issue #2865](https://github.com/evanw/esbuild/issues/2865) — esbuild installed on wrong platform binary mismatch (MEDIUM confidence, issue tracker)
- [Unit 42: ArtiPACKED — GitHub Actions artifact token leaks](https://unit42.paloaltonetworks.com/github-repo-artifacts-leak-tokens/) — artifact security risks including git token exposure (HIGH confidence, security research, August 2024)
- [GitHub Changelog: deprecation of actions/upload-artifact v3](https://github.blog/changelog/) — v3 deprecated November 2024, v4 required (HIGH confidence, official)
- [GitHub Changelog: Node 20 deprecation on runners](https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/) — Node 20 deprecated on runners as of September 2025; Node 22 or 24 recommended (HIGH confidence, official)
- Project source audit: `package.json` test scripts, `scripts/build.js`, `vitest.config.chrome.js`, `vitest.config.firefox.js` — identified dist/ dependency ordering requirement, build configuration, and lint command (HIGH confidence, direct code inspection)

---
*Pitfalls research for: GitHub Actions CI/CD pipeline for a cross-browser browser extension (esbuild, Vitest, web-ext)*
*Researched: 2026-03-04*
*Milestone: v2.1 CI/CD Pipeline*

# Architecture Research

**Domain:** GitHub Actions CI/CD pipeline for cross-browser extension with esbuild + Vitest
**Researched:** 2026-03-04
**Confidence:** HIGH

---

## Context: What Already Exists

This is v2.1 research. The existing system is already working:

- `npm run build` → calls `node scripts/build.js` → produces `dist/chrome/` + `dist/firefox/`
- `npm test` → runs `npm run build && npm run test:src && npm run test:chrome && npm run test:firefox && npm run test:lint`
  - `test:src` → `vitest run` (default config, 71 test cases from source)
  - `test:chrome` → `vitest run --config vitest.config.chrome.js` (validates bundled chrome dist)
  - `test:firefox` → `vitest run --config vitest.config.firefox.js` (validates bundled firefox dist)
  - `test:lint` → `npx web-ext lint --source-dir dist/firefox --ignore-files 'lib/**'`
- The full `npm test` command already chains build → test in the right order

The CI/CD pipeline does not redesign anything. It wraps what already works.

---

## System Overview

```
GitHub Push / PR Event
         |
         v
+-------------------------+
|  GitHub Actions Runner   |
|  (ubuntu-latest)         |
|                          |
|  1. Checkout             |
|  2. Setup Node.js + npm  |  -- cached by package-lock.json hash
|  3. npm ci               |
|  4. npm run build        |  -- esbuild: src/ -> dist/chrome/ + dist/firefox/
|  5. npm run test:src     |  -- vitest (source tests, no dist dependency)
|  6. npm run test:chrome  |  -- vitest (chrome dist alias tests)
|  7. npm run test:firefox |  -- vitest (firefox dist alias tests)
|  8. web-ext lint         |  -- Firefox manifest + bundle validation
|  9. zip dist/chrome/     |  -- produce chrome.zip
| 10. zip dist/firefox/    |  -- produce firefox.zip
| 11. upload-artifact      |  -- chrome.zip + firefox.zip retained 90 days
+-------------------------+
         |
         v
  Artifacts downloadable
  from Actions run summary
```

---

## Recommended Workflow Structure: Single Job

**Use a single job, not a matrix or multi-job pipeline.**

### Why Single Job (Not Matrix)

Matrix strategy exists for testing across multiple environments (Node versions, OS variants, browser targets). This project has no environment variable — there is one Node version, one OS, and both browser targets are produced by the same build command. A matrix would split what is inherently one sequential operation: build → test → package.

### Why Single Job (Not Multi-Job)

Multi-job pipelines (e.g., a `build` job feeding artifacts to a `test` job via `upload-artifact` / `download-artifact`) are useful when jobs can run in parallel or when different jobs need different environments. Here:

- Tests **require** the dist/ output — test:chrome and test:firefox read from `dist/chrome/` and `dist/firefox/` respectively
- Build must precede all three test variants
- All steps need the same Node.js environment and the same `node_modules/`

A multi-job pipeline would require uploading `dist/` as an artifact from the build job and downloading it in the test job — adding 30–60 seconds of artifact transfer overhead for no benefit. The entire run is under 60 seconds as a single job.

**Exception:** If in a future milestone the workflow needs to run store publishing (web store API calls with secrets), that belongs in a separate job gated on the test job passing. Not needed for v2.1.

---

## Workflow File Structure

### File Location

```
.github/
└── workflows/
    └── ci.yml          # Single workflow file for v2.1
```

No `.github/workflows/` directory exists yet. It must be created.

### Trigger Configuration

```yaml
on:
  push:
    branches: ['**']     # Every branch push triggers CI
  pull_request:
    branches: [main]     # PRs targeting main get CI
```

**Rationale:** Every push catches regressions immediately regardless of branch. PRs to main get validation before merge. This matches the milestone requirement: "triggered on push (all branches) and PRs to main."

Do not trigger on `tags` — no release pipeline in v2.1.

### Job Structure

```yaml
jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci

      - name: Build
        run: npm run build

      - name: Test (source)
        run: npm run test:src

      - name: Test (chrome dist)
        run: npm run test:chrome

      - name: Test (firefox dist)
        run: npm run test:firefox

      - name: Lint (web-ext)
        run: npm run test:lint

      - name: Package chrome
        run: cd dist/chrome && zip -r ../../patent-cite-tool-chrome.zip .

      - name: Package firefox
        run: cd dist/firefox && zip -r ../../patent-cite-tool-firefox.zip .

      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: extension-zips
          path: |
            patent-cite-tool-chrome.zip
            patent-cite-tool-firefox.zip
          retention-days: 90
```

---

## Integration Points

### Integration Point 1: npm scripts (no changes needed)

The existing `package.json` scripts already define every CI step correctly. CI calls them directly — it does not reimplement build or test logic.

| CI Step | npm script | What it does |
|---------|-----------|--------------|
| Build | `npm run build` | `node scripts/build.js` — esbuild Chrome + Firefox + test-export bundles |
| Source tests | `npm run test:src` | `vitest run` — default config, tests source directly |
| Chrome dist tests | `npm run test:chrome` | `vitest run --config vitest.config.chrome.js` — uses dist/chrome alias |
| Firefox dist tests | `npm run test:firefox` | `vitest run --config vitest.config.firefox.js` — uses dist/firefox alias |
| Firefox lint | `npm run test:lint` | `npx web-ext lint --source-dir dist/firefox --ignore-files 'lib/**'` |

**Critical:** Do not run `npm test` (the combined script) in CI. Run each sub-script separately. This produces distinct step labels in the Actions UI, making failures immediately locatable without reading logs.

### Integration Point 2: dist/ directory (build produces, tests consume)

The build step produces `dist/chrome/` and `dist/firefox/`. The three test steps and the lint step consume those directories. The packaging steps zip them. This is a strict linear dependency — all downstream steps fail if build fails.

```
npm run build
  └── dist/chrome/          ← test:chrome reads dist/chrome/matching-exports.js
  └── dist/firefox/         ← test:firefox reads dist/firefox/matching-exports.js
                            ← test:lint reads dist/firefox/ manifest + bundles
```

GitHub Actions steps within a single job share the filesystem — no artifact transfer needed between build and test steps.

### Integration Point 3: npm ci (dependency installation)

Use `npm ci` (not `npm install`) in CI. `npm ci`:
- Reads `package-lock.json` exactly — deterministic installs
- Deletes `node_modules/` before installing — no stale deps
- Fails if `package-lock.json` is out of sync with `package.json` — catches missed commits

Pair with `actions/setup-node@v4`'s built-in npm cache (`cache: 'npm'`). This caches `~/.npm` keyed on `package-lock.json` hash, reducing `npm ci` from ~30s to ~3s on cache hits.

### Integration Point 4: artifact packaging (new script, not npm script)

Packaging runs as inline shell commands in the workflow — no new npm script needed.

```bash
cd dist/chrome && zip -r ../../patent-cite-tool-chrome.zip .
cd dist/firefox && zip -r ../../patent-cite-tool-firefox.zip .
```

The `cd` + relative path pattern avoids the `upload-artifact` double-zip issue. The action receives `.zip` files, not directories, so it wraps them without re-zipping.

**Do not use `web-ext build` for Firefox packaging** — `web-ext build` produces an `.xpi` and validates/re-lints during pack. For a store-ready artifact, a simple `zip` is sufficient and avoids running lint twice. The lint step earlier in the pipeline already validates the Firefox bundle.

### Integration Point 5: artifact retention

```yaml
uses: actions/upload-artifact@v4
with:
  retention-days: 90
```

90 days covers a typical store review cycle (Chrome Web Store: 2-7 days, AMO: up to 30 days for manual review). Artifacts older than 90 days auto-delete. This is the maximum allowed without an enterprise plan.

Upload both zips as a single named artifact (`extension-zips`) rather than two separate artifact uploads. Single artifact keeps the Actions summary clean. Both files appear in the same download.

---

## Data Flow: Trigger to Artifact

```
git push / PR open
       |
       v
GitHub triggers ci.yml workflow
       |
       v
Runner: ubuntu-latest
  actions/checkout@v4
    → working directory = repo root
  actions/setup-node@v4 (node 20, npm cache)
    → ~/.npm cached from package-lock.json hash
  npm ci
    → node_modules/ installed (cache hit: ~3s, miss: ~30s)
  npm run build
    → node scripts/build.js
    → dist/chrome/ created (esbuild: IIFE content + ESM background/offscreen/popup/options)
    → dist/firefox/ created (esbuild: IIFE content + ESM background/popup/options)
    → dist/chrome/matching-exports.js created (test export bundle)
    → dist/firefox/matching-exports.js created (test export bundle)
  npm run test:src
    → vitest run (vitest.config.js: reads src/ directly)
    → 71 test cases
  npm run test:chrome
    → vitest run --config vitest.config.chrome.js
    → alias: src/shared/matching.js → dist/chrome/matching-exports.js
    → proves chrome bundle has correct matching logic
  npm run test:firefox
    → vitest run --config vitest.config.firefox.js
    → alias: src/shared/matching.js → dist/firefox/matching-exports.js
    → proves firefox bundle has correct matching logic
  npm run test:lint
    → npx web-ext lint --source-dir dist/firefox
    → validates manifest + bundle against Firefox Extension Workshop rules
  cd dist/chrome && zip -r ../../patent-cite-tool-chrome.zip .
    → creates patent-cite-tool-chrome.zip at repo root
  cd dist/firefox && zip -r ../../patent-cite-tool-firefox.zip .
    → creates patent-cite-tool-firefox.zip at repo root
  actions/upload-artifact@v4
    → uploads both zips as artifact "extension-zips"
    → retained 90 days
       |
       v
  GitHub Actions run summary shows:
  - Step-by-step pass/fail
  - "extension-zips" artifact download link
  - Both .zip files available for manual install/submission
```

---

## New Files to Create

| File | Type | Purpose |
|------|------|---------|
| `.github/workflows/ci.yml` | New | The entire CI/CD pipeline |
| `.github/` (directory) | New | GitHub Actions parent directory |
| `.github/workflows/` (directory) | New | Workflows directory |

**No other files need to be created or modified.** All build and test logic is already in `scripts/build.js`, `package.json`, and the Vitest config files.

---

## Files NOT to Modify

| File | Why unchanged |
|------|--------------|
| `package.json` | Scripts already correct for CI; no changes needed |
| `scripts/build.js` | Build script works as-is |
| `vitest.config.js` | Source test config is fine |
| `vitest.config.chrome.js` | Chrome dist test config is fine |
| `vitest.config.firefox.js` | Firefox dist test config is fine |
| All `src/` files | CI does not affect source |
| All `tests/` files | CI does not affect tests |

---

## Architectural Patterns

### Pattern 1: Fail Fast — Steps in Dependency Order

**What:** Order workflow steps so the cheapest, most-likely-to-fail checks run first and failures stop the pipeline immediately (GitHub Actions default: step failure aborts remaining steps).

**When to use:** Always — this is the standard CI ordering principle.

**Trade-offs:** No parallelism within a single job; but all steps here are sequential by dependency anyway. The only "parallel" opportunity is test:src vs test:chrome/test:firefox, but they run in under 10 seconds combined — parallelizing adds complexity for no meaningful speedup.

**Order rationale:**
```
npm ci           # fast (~3s cached), must precede everything
npm run build    # ~5s, must precede dist-dependent tests
test:src         # ~3s, source-only — catches logic errors before dist tests
test:chrome      # ~3s, catches chrome bundle regressions
test:firefox     # ~3s, catches firefox bundle regressions
test:lint        # ~5s, catches manifest/bundle format errors
package chrome   # instant, only runs if all tests pass
package firefox  # instant, only runs if all tests pass
upload artifact  # ~5s, only runs if packaging succeeds
```

### Pattern 2: Separate Step Labels for Each Test Suite

**What:** Run `test:src`, `test:chrome`, `test:firefox`, and `test:lint` as separate `run:` steps with distinct `name:` labels, rather than calling `npm test` (which chains them silently).

**When to use:** Any time a combined command hides which sub-step failed.

**Trade-offs:** Slightly more YAML lines. Benefit: the Actions UI shows exactly which test suite failed with a red X on that step, without requiring log inspection.

**Example:**
```yaml
- name: Test (source)           # GitHub shows this label in the step list
  run: npm run test:src

- name: Test (chrome dist)      # Red X on exactly this step if chrome bundle broke
  run: npm run test:chrome

- name: Test (firefox dist)
  run: npm run test:firefox

- name: Lint (web-ext)          # Distinct from vitest steps — different failure meaning
  run: npm run test:lint
```

### Pattern 3: npm ci with Cached ~/.npm

**What:** `actions/setup-node@v4` with `cache: 'npm'` automatically caches `~/.npm` keyed on `hashFiles('**/package-lock.json')`. On cache hit, `npm ci` skips downloading packages and reinstalls from cache.

**When to use:** All Node.js CI workflows. No exceptions.

**Trade-offs:** Cache key invalidates on any `package-lock.json` change, triggering a full download. This is correct behavior — dependency changes should re-download.

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: '20'
    cache: 'npm'       # automatically uses package-lock.json as cache key
- run: npm ci          # uses cached ~/.npm on hit; ~3s vs ~30s
```

---

## Anti-Patterns

### Anti-Pattern 1: Running `npm test` in CI Instead of Individual Scripts

**What people do:** `run: npm test` — the combined script that chains all steps.

**Why it's wrong:** When `vitest.config.firefox.js` fails, the CI log shows "npm test failed" and you must open the log and scroll to find which sub-command failed. There is no per-step status indicator.

**Do this instead:** Run each sub-script as a separate step with an explicit `name:`. GitHub Actions shows a step-by-step timeline in the UI. Failures are immediately visible without log inspection.

### Anti-Pattern 2: Using a Matrix for Two Browser Targets

**What people do:** Define a matrix `browser: [chrome, firefox]` and run build + test per matrix leg.

**Why it's wrong:** Both browser targets come from the same `npm run build` command. Splitting into a matrix forces `npm ci` and `npm run build` to run twice — once per matrix leg. The builds are not independent; `npm run build` always produces both targets together.

**Do this instead:** Single job. `npm run build` runs once and produces both `dist/chrome/` and `dist/firefox/`. Each test step reads the already-built dist.

### Anti-Pattern 3: Multi-Job Pipeline for Build → Test

**What people do:** Job 1 builds, uploads `dist/` as artifact. Job 2 downloads `dist/` and runs tests.

**Why it's wrong:** Artifact upload/download adds 30–60 seconds to total runtime. For a pipeline that runs in under 60 seconds total, this doubles the runtime. The only reason to split across jobs is to enable parallelism or use different environments — neither applies here.

**Do this instead:** Single job. Steps share the filesystem. No artifact transfer needed between build and test.

### Anti-Pattern 4: Double-Zipping the Extension

**What people do:** Create `dist/chrome/` → zip it → upload the zip to `upload-artifact`. `upload-artifact` then zips the zip, producing `patent-cite-tool-chrome.zip.zip`.

**Why it's wrong:** Chrome Web Store and AMO cannot install `.zip.zip`. The user must unzip twice.

**Do this instead:** `cd dist/chrome && zip -r ../../patent-cite-tool-chrome.zip .` creates a zip file at the repo root. `upload-artifact` receives a `.zip` file path (not a directory) and wraps it in the Actions artifact container without re-zipping.

### Anti-Pattern 5: Using `npm install` Instead of `npm ci` in CI

**What people do:** `run: npm install` in the workflow.

**Why it's wrong:** `npm install` may resolve to different dependency versions than `package-lock.json` specifies (if `package.json` has `^` ranges and a newer compatible version exists). CI should be deterministic.

**Do this instead:** `npm ci` reads `package-lock.json` exactly. Fails if lockfile is out of sync. Always correct in CI.

---

## Scaling Considerations

These apply if the project grows beyond its current scope.

| Concern | Now (v2.1) | If test suite grows to 500+ cases | If store submission is added |
|---------|-----------|----------------------------------|------------------------------|
| Total CI time | ~60s | Add `--reporter=verbose` for better failure context; time stays under 2 min | Add separate `release` job gated on `ci` job, triggered only on tags |
| Test parallelism | Not needed | Consider Vitest `--reporter=json` + sharding if >3 min | No change to CI structure |
| Secrets management | None needed | None needed | `CHROME_CLIENT_ID`, `CHROME_CLIENT_SECRET`, `FIREFOX_JWT_ISSUER`, `FIREFOX_JWT_SECRET` in repository secrets |
| Workflow complexity | Single job | Single job still fine | Second job with `needs: ci` and `if: startsWith(github.ref, 'refs/tags/')` |

---

## Sources

- [GitHub Actions: Understanding GitHub Actions](https://docs.github.com/en/actions/learn-github-actions/understanding-github-actions) — triggers, job structure, step execution — HIGH confidence
- [actions/setup-node official docs](https://github.com/actions/setup-node) — `cache: 'npm'`, `node-version`, lockfile-based cache key — HIGH confidence
- [actions/upload-artifact@v4](https://github.com/actions/upload-artifact/tree/v4/) — `path`, `retention-days`, `name`, double-zip behavior — HIGH confidence
- [GitHub Blog: Get started with v4 of GitHub Actions Artifacts](https://github.blog/news-insights/product-news/get-started-with-v4-of-github-actions-artifacts/) — v4 GA, performance improvements, deprecation of v3 — HIGH confidence
- [GitHub Changelog: upload-artifact v4 GA (Dec 2023)](https://github.blog/changelog/2023-12-14-github-actions-artifacts-v4-is-now-generally-available/) — version confirmation — HIGH confidence
- [GitHub Docs: Caching dependencies to speed up workflows](https://docs.github.com/en/actions/using-workflows/caching-dependencies-to-speed-up-workflows) — cache limits, key strategy — HIGH confidence
- [DEV Community: Simplify Browser Extension Deployment with GitHub Actions](https://dev.to/jellyfith/simplify-browser-extension-deployment-with-github-actions-37ob) — real-world extension CI workflow patterns — MEDIUM confidence
- [Steve Kinney: Setting Up GitHub Actions to Run Vitest](https://stevekinney.com/courses/testing/continuous-integration) — Vitest + Actions integration, caching, job structure — MEDIUM confidence
- [GitHub Docs: Job dependencies with needs:](https://docs.github.com/en/actions/learn-github-actions/understanding-github-actions) — sequential job patterns — HIGH confidence
- Existing `package.json` and `scripts/build.js` — ground truth for what CI needs to call — HIGH confidence

---

*Architecture research for: Patent Citation Tool v2.1 — GitHub Actions CI/CD Pipeline*
*Researched: 2026-03-04*

# Stack Research

**Domain:** GitHub Actions CI/CD Pipeline for Browser Extension (Chrome + Firefox MV3)
**Researched:** 2026-03-04
**Confidence:** HIGH (all action versions verified against GitHub releases; Node.js version guidance verified against GitHub changelog; caching strategy verified against official setup-node docs)

---

## Milestone Context

This document covers ONLY NEW stack additions for v2.1. The following are already validated and must not be re-researched:

- Chrome + Firefox MV3 extensions, esbuild build pipeline (`npm run build` → `dist/chrome/` + `dist/firefox/`)
- Vitest test suite (71-case corpus), web-ext lint, PDF.js, Cloudflare Workers/KV, Shadow DOM, IndexedDB

Existing npm scripts that CI will invoke directly:

```
npm run build        → node scripts/build.js (both targets)
npm run test:src     → vitest run (source tests)
npm run test:chrome  → vitest run --config vitest.config.chrome.js
npm run test:firefox → vitest run --config vitest.config.firefox.js
npm run test:lint    → npx web-ext lint --source-dir dist/firefox --ignore-files 'lib/**'
```

The full `npm test` command chains all of the above. CI may call them individually to parallelize or get better job-level failure reporting.

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `actions/checkout` | v6 | Fetch repo code in CI | Latest stable. v6 (the current major) runs on Node.js 24, requires Actions Runner 2.329.0+. GitHub-hosted runners meet this automatically. Uses SHA pinning or `@v6` major tag. |
| `actions/setup-node` | v6 | Install Node.js and enable npm cache | Latest stable as of 2026-03-04 (v6.3.0). Supports `cache: 'npm'` built-in which caches `~/.npm` (the npm cache directory) — not `node_modules`. This is GitHub's recommended caching approach. Includes automatic caching when `packageManager` field is set in package.json (that field is NOT set in this project, so explicit `cache: 'npm'` is required). |
| `actions/upload-artifact` | v7 | Upload Chrome/Firefox `.zip` build artifacts | Latest stable. v7 adds optional `archive: false` for direct file uploads (not needed here since we want to upload pre-made `.zip` files as-is). For zipped artifacts uploaded with compression disabled, use `compression-level: 0` to avoid double-zipping. v3 deprecated and removed as of early 2025. |
| Node.js runtime | 22 (LTS) | Run build, test, and packaging scripts | Node 24 became the default for GitHub Actions runners starting June 2, 2026. Node 20 EOL is April 2026. Node 22 is the current stable LTS with the longest remaining support window before the June runner transition. Using `node-version: '22'` pins explicitly regardless of runner default changes. Do NOT use a version matrix — this project has no cross-version compatibility concern; single-version CI is faster and simpler. |

### Supporting Tools

| Tool | Version | Purpose | When to Use |
|------|---------|---------|-------------|
| `zip` (shell built-in) | System (Ubuntu 24.04) | Package `dist/chrome/` and `dist/firefox/` into store-ready `.zip` files | Built into `ubuntu-latest` (Ubuntu 24.04). No separate action needed. Run as `zip -r artifact-name.zip dist/chrome/` in a `run:` step. This avoids an external action dependency for a one-line operation. |
| `web-ext` | 9.4.0 | Firefox extension lint | Already invoked via `npx web-ext` in the existing `test:lint` script. In CI, `npx web-ext` will pull the latest version unless `web-ext` is a devDependency. Prefer adding it as a pinned devDependency (see Installation below) to prevent silent version drift in CI. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `ubuntu-latest` runner | CI execution environment | Points to Ubuntu 24.04 as of January 2025. Has `zip`, Node.js, and git pre-installed. No self-hosted runner needed for this workload. |
| `concurrency` group | Cancel superseded PR runs | Use `${{ github.workflow }}-${{ github.head_ref || github.run_id }}` as group key. Set `cancel-in-progress: true`. The `|| github.run_id` fallback ensures push-to-main runs are NOT cancelled (each gets a unique run ID), while PR runs ARE cancelled when new commits are pushed to the same branch. |

---

## Workflow Design

### Trigger Configuration

```yaml
on:
  push:
    branches: ['**']
  pull_request:
    branches: [main]
```

This runs on every push to any branch AND on PRs to main. The PR trigger avoids duplicate runs for push-and-PR on the same commit. The `push: branches: ['**']` ensures feature branches get CI without opening a PR.

### Concurrency (Cancel Superseded Runs)

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.head_ref || github.run_id }}
  cancel-in-progress: true
```

- `github.head_ref` is set for PR runs (the source branch name) — PR runs for the same branch cancel each other
- `github.run_id` is used for push runs (unique per run) — push-to-main runs do NOT cancel each other
- `cancel-in-progress: true` — safe here because CI produces artifacts but does not deploy to production

### Recommended Job Structure

```yaml
jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version: '22'
          cache: 'npm'
      - run: npm ci
      - run: npm run build
      - run: npm run test:src
      - run: npm run test:chrome
      - run: npm run test:firefox
      - run: npm run test:lint
      - name: Package Chrome extension
        run: cd dist/chrome && zip -r ../../patent-cite-chrome.zip .
      - name: Package Firefox extension
        run: cd dist/firefox && zip -r ../../patent-cite-firefox.zip .
      - uses: actions/upload-artifact@v7
        with:
          name: patent-cite-chrome-${{ github.sha }}
          path: patent-cite-chrome.zip
          compression-level: 0
          retention-days: 30
      - uses: actions/upload-artifact@v7
        with:
          name: patent-cite-firefox-${{ github.sha }}
          path: patent-cite-firefox.zip
          compression-level: 0
          retention-days: 30
```

**Single job rationale:** The build step produces artifacts consumed by test steps. Splitting into separate jobs would require `upload-artifact` + `download-artifact` between jobs. A single job avoids this overhead while keeping the workflow simple — the total CI time for this project (build + tests + packaging) is well under 5 minutes.

**`compression-level: 0` rationale:** The uploaded paths are already `.zip` files. If GitHub compresses them during upload, the download is a `.zip.zip` which stores reviewers open. Setting `compression-level: 0` instructs upload-artifact to store the file as-is.

---

## Installation

```bash
# Add web-ext as pinned devDependency (it is currently invoked via npx in test:lint)
npm install -D web-ext
```

**No other new npm packages are needed.** The GitHub Actions actions (checkout, setup-node, upload-artifact) are not npm packages — they are referenced only in the `.github/workflows/*.yml` file.

**Resulting package.json change:**
```json
{
  "devDependencies": {
    "esbuild": "^0.27.3",
    "pdfjs-dist": "^5.5.207",
    "sharp": "^0.34.5",
    "vitest": "^3.0.0",
    "web-ext": "^9.4.0"
  }
}
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `actions/setup-node@v6` with `cache: 'npm'` | `actions/cache` directly caching `~/.npm` | When you need custom cache key logic beyond `package-lock.json` hash (e.g., OS + node version matrix). Not needed here — single Node version, single OS. |
| Single CI job | Split into build + test + package jobs | When individual stages take >10 min or when parallelizing test suites matters. At 71 test cases, Vitest runs in under 10 seconds — job split adds overhead without benefit. |
| `zip` shell command | `montudor/action-zip` or `Zip Release` action | Third-party zip actions add a dependency for a one-line operation. Use shell `zip` unless cross-platform (Windows) is needed. |
| Node.js 22 | Node.js 24 | Node 24 is appropriate if deploying after June 2026 when it becomes the runner default. Pinning to 22 provides stability through the transition period and matches the current LTS schedule. |
| `actions/upload-artifact@v7` | `actions/upload-artifact@v4` | v4 is still functional but v7 is current. v7 adds the `archive: false` direct upload mode which is useful if packaging is ever refactored. No reason to use v4 on a new workflow. |
| `ubuntu-latest` | `ubuntu-24.04` (explicit) | Explicit version is appropriate if you want to prevent automatic runner OS upgrades. `ubuntu-latest` is acceptable here because the workflow uses only standard shell tools (`zip`, `npm`) that are stable across Ubuntu LTS versions. |

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `actions/cache` manual configuration | `actions/setup-node@v6` with `cache: 'npm'` already handles `~/.npm` caching with the correct `package-lock.json`-based key. Adding a separate `actions/cache` step creates redundancy and risk of key conflicts. | `setup-node` built-in `cache: 'npm'` |
| Caching `node_modules` directly | `npm ci` deletes `node_modules` before installing, so a restored `node_modules` cache is discarded immediately — wasted restore time. Cross-version cache poisoning risk. | Cache `~/.npm` via `setup-node cache: 'npm'` |
| Node.js version matrix (`[20, 22, 24]`) | This is not a library — it is a browser extension. There is no cross-version compatibility concern. A matrix triples CI time with zero benefit. | Single version pin (`node-version: '22'`) |
| `kewisch/action-web-ext` | A third-party action for web-ext lint. The existing `npm run test:lint` script already runs web-ext lint correctly. Adding a new action for something the project's own script already does introduces unnecessary external dependency. | `npm run test:lint` (calls `npx web-ext lint`) |
| Separate lint job | Running lint as a separate job requires a separate checkout + npm install. Since lint takes <5 seconds, the job setup overhead exceeds the lint time. | Include lint as a step in the single CI job |
| `actions/download-artifact` | Not needed in a single-job workflow. Only needed if packaging artifacts flow between separate jobs. | Single job with all steps sequential |
| Store submission actions (chrome-webstore-upload-action, etc.) | Out of scope for v2.1 milestone. Store submission requires API keys and review processes not addressed by this milestone. | Defer to future milestone |
| `.env` files or secret injection | This CI pipeline builds and tests only. No runtime secrets are needed for `npm run build` or `vitest run`. | N/A |

---

## Version Compatibility

| Package | Version | Compatible With | Notes |
|---------|---------|-----------------|-------|
| `actions/checkout` | v6 | Actions Runner 2.329.0+ | GitHub-hosted runners always meet this threshold. |
| `actions/setup-node` | v6.3.0 | Node 20/22/24, npm, yarn, pnpm | Built-in `cache: 'npm'` requires `package-lock.json` to be present (it is). Automatic caching does NOT activate because `packageManager` field is absent from this project's `package.json` — explicit `cache: 'npm'` is required. |
| `actions/upload-artifact` | v7 | Actions Runner 2.327.1+ | GitHub-hosted runners always meet this. `compression-level: 0` parameter available since v4. |
| `web-ext` | 9.4.0 | Node.js 20+ (20 EOL April 2026; use 22) | v9.4.0 is "likely the last release officially supporting Node 20" per release notes. Works on Node 22/24. ESM-only since web-ext v7.0.0 — compatible with this project's `"type": "module"` package.json. |
| `vitest` | 3.2.4 (installed) | Node.js 20+ | Node 22 is within the supported range. |
| `esbuild` | 0.27.3 (installed) | Node.js 18+ | Node 22 is within the supported range. |

---

## Sources

- [GitHub releases: actions/checkout](https://github.com/actions/checkout/releases) — v6 confirmed as latest (HIGH confidence, checked 2026-03-04)
- [GitHub releases: actions/setup-node](https://github.com/actions/setup-node/releases) — v6.3.0 confirmed as latest (HIGH confidence, checked 2026-03-04)
- [setup-node advanced usage docs](https://github.com/actions/setup-node/blob/main/docs/advanced-usage.md) — `cache: 'npm'` caches `~/.npm` not `node_modules`; automatic caching requires `packageManager` field (HIGH confidence, official docs)
- [GitHub releases: actions/upload-artifact](https://github.com/actions/upload-artifact/releases) — v7.0.0 confirmed as latest (HIGH confidence, checked 2026-03-04)
- [GitHub changelog: upload-artifact v7 non-zipped artifacts](https://github.blog/changelog/2026-02-26-github-actions-now-supports-uploading-and-downloading-non-zipped-artifacts/) — v7 `archive: false` feature, `compression-level: 0` for pre-zipped files (HIGH confidence)
- [GitHub changelog: Node 20 deprecation on Actions runners](https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/) — Node 24 becomes runner default June 2, 2026; Node 20 EOL April 2026 (HIGH confidence)
- [GitHub changelog: ubuntu-latest = Ubuntu 24.04](https://github.blog/changelog/2024-09-25-actions-new-images-and-ubuntu-latest-changes/) — `ubuntu-latest` points to Ubuntu 24.04 since January 2025 (HIGH confidence)
- [GitHub releases: mozilla/web-ext](https://github.com/mozilla/web-ext/releases) — v9.4.0 confirmed as latest as of 2026-03-04 (HIGH confidence)
- [GitHub Actions concurrency docs / community discussion](https://generalreasoning.com/blog/2025/02/05/github-actions-concurrency.html) — `head_ref || run_id` pattern for PR vs push differentiation (MEDIUM confidence — verified against community pattern, matches GitHub official concurrency docs behavior)

---

*Stack research for: Patent Citation Tool v2.1 — GitHub Actions CI/CD Pipeline*
*Researched: 2026-03-04*

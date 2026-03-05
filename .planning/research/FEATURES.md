# Feature Research

**Domain:** GitHub Actions CI/CD pipeline for a cross-browser (Chrome + Firefox) browser extension
**Researched:** 2026-03-04
**Confidence:** HIGH

---

## Context: What Already Exists

This milestone adds CI/CD on top of a complete v2.0 build/test infrastructure. Do not re-research or re-implement these — the pipeline wraps them:

| Existing Command | What It Does |
|-----------------|--------------|
| `npm run build` | esbuild pipeline: `src/` → `dist/chrome/` + `dist/firefox/` |
| `npm test` | Runs: build + Vitest (71-case corpus) + web-ext lint |
| `npm run test:src` | Vitest source-level tests only |
| `npm run test:chrome` | Vitest with Chrome bundle aliases |
| `npm run test:firefox` | Vitest with Firefox bundle aliases |
| `npm run test:lint` | `web-ext lint --source-dir dist/firefox` |

The v2.1 CI/CD milestone scope is: trigger these existing commands on GitHub-hosted runners and produce store-ready zip artifacts.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features that any serious extension project with CI/CD must have. Missing them makes the pipeline feel unprofessional or unsafe.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Trigger on push to any branch | Every commit should be validated; broken code shouldn't silently accumulate | LOW | `on: push` (no branch filter = all branches) |
| Trigger on PRs to main | PRs are the safety gate; CI must run before merge | LOW | `on: pull_request: branches: [main]` |
| `actions/checkout@v4` | Fetch code into runner; required by every workflow | LOW | First step; non-negotiable |
| `actions/setup-node@v4` with pinned LTS | Pin Node.js version; prevents version-skew failures between local and CI | LOW | Node 20.x or 22.x LTS; specify via `node-version: '20.x'` |
| `npm ci` (not `npm install`) | Reproducible installs from lock file; `npm install` can mutate `package-lock.json` in CI | LOW | Standard for all CI environments |
| npm dependency caching | Avoids re-downloading ~50-100 MB of devDependencies every run; saves 30-60s per run | LOW | `cache: 'npm'` in `setup-node` auto-caches `~/.npm`; keyed on `package-lock.json` hash |
| `npm test` step | Runs build + Vitest (71-case corpus) + web-ext lint; single command validates everything | LOW | Existing script handles ordering; CI calls the same command as local dev |
| Upload Chrome zip artifact | Store-ready ZIP downloadable from Actions run; proves build succeeded | LOW | Pre-zip `dist/chrome/`; `upload-artifact@v4` with `compression-level: 0` |
| Upload Firefox zip artifact | Store-ready ZIP for AMO submission; downloadable from Actions run | LOW | Pre-zip `dist/firefox/`; same action and options |

### Differentiators (Competitive Advantage)

Features that meaningfully improve developer experience or release quality beyond the minimum.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| `compression-level: 0` on zip artifact uploads | Prevents double-zip corruption; uploaded zips are pre-compressed — re-compressing wastes time and creates `.zip.zip` artifacts on download | LOW | Known Actions pitfall; fix costs nothing |
| Artifact names include git ref or SHA | Traceability: know exactly which commit produced a given zip without guessing | LOW | `${{ github.sha }}` or `${{ github.ref_name }}` suffix in artifact `name:` field |
| Concurrency group to cancel stale runs | On rapid-push fixup commits, cancels the outdated in-flight CI run automatically; avoids queuing | LOW | `concurrency: group: ${{ github.ref }}` + `cancel-in-progress: true` at workflow level |
| Conditional artifact upload (main-only) | PRs produce noise if they upload 2 zips per run; main-branch-only packaging keeps artifacts meaningful | LOW | `if: github.ref == 'refs/heads/main'` condition on upload steps |
| Explicit `permissions:` block | Security: principle of least privilege; prevents workflows from having implicit write access they don't need | LOW | `permissions: contents: read` for a read-only CI workflow |

### Anti-Features (Commonly Requested, Often Problematic)

Features that appear useful but introduce complexity or failure modes disproportionate to their value for this milestone.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Automated Chrome Web Store publish | "Ship without manual steps" | Requires OAuth token management, Google API refresh-token expiration handling, and review queue opacity; Chrome Store API approval is not deterministic | Produce the zip artifact; upload to store manually. Automate in v3.0 if needed. |
| Automated Firefox AMO publish | Same appeal as Chrome auto-publish | AMO review pipeline takes days to weeks; `web-ext sign` requires AMO API key secrets and can submit invalid extension versions in race conditions | Produce the zip artifact; submit manually via AMO dashboard |
| Docker/containerized build environment | "Reproducibility across machines" | Extension project has zero native dependencies requiring specific OS ABI; Node.js LTS on `ubuntu-latest` is sufficient and 2-3x faster than Docker runner spin-up | `ubuntu-latest` with `setup-node` is reproducible and fast |
| Multiple Node.js version matrix | "Covers Node version skew" | esbuild output targets browsers, not Node.js runtimes. Only build tooling runs in Node — one pinned LTS eliminates skew with no coverage loss | Pin to single LTS (Node 20.x) |
| Scheduled nightly builds | "Detect dependency drift over time" | This project has no external data sources changing nightly; Vitest corpus is local fixtures only; scheduled runs add noise with zero validation value | Push/PR triggers are sufficient |
| Separate parallel lint job | "Faster feedback loop" | `web-ext lint` runs in ~3s and is already the final step in `npm test`. A parallel job incurs ~15-30s runner spin-up overhead — net result is slower, not faster | Keep lint inside `npm test` as-is |
| Cache `node_modules/` directory | "Speeds up installs" | `npm ci` deletes `node_modules/` before installing — caching the folder is counterproductive and can break across Node version changes | Cache `~/.npm` (the global npm cache) instead; `setup-node` handles this automatically with `cache: 'npm'` |
| Slack/Teams notification integrations | "Visibility for the team" | Adds workflow complexity; for a solo or small team, GitHub's built-in PR status checks and email notifications cover the need | Use default GitHub status checks |
| Deploy to staging environment | "Continuous deployment" | Browser extensions have no staging environment — the extension runs in the user's browser, not a server; there is no URL to deploy to | Extensions are artifacts, not deployments; ship zips |
| `actions/upload-artifact@v3` | Legacy workflow copy-paste | v3 was deprecated November 2024 and stopped working January 2025; using it will silently break workflows | Use `actions/upload-artifact@v4` (current stable) or `@v6` for Node 24 runners |

---

## Feature Dependencies

```
[npm dependency cache (~/.npm)]
    └──enables──> [npm ci] (fast, ~5s vs ~60s cold)
                      └──required by──> [npm test]
                                            ├──runs──> [npm run build] (esbuild: src/ → dist/)
                                            ├──runs──> [npm run test:src] (Vitest source tests)
                                            ├──runs──> [npm run test:chrome] (Vitest Chrome bundle tests)
                                            ├──runs──> [npm run test:firefox] (Vitest Firefox bundle tests)
                                            └──runs──> [npm run test:lint] (web-ext lint dist/firefox/)
                                                            │
                                                            ▼ (only after all above pass)
                                            [zip dist/chrome/ → patent-cite-chrome.zip]
                                            [zip dist/firefox/ → patent-cite-firefox.zip]
                                                            │
                                                            ▼
                                            [upload-artifact@v4 (Chrome zip)]
                                            [upload-artifact@v4 (Firefox zip)]

[git ref / SHA context]
    └──enhances──> [Artifact naming with traceability]

[github.ref == 'refs/heads/main']
    └──gates──> [Artifact upload steps] (optional: skip on PR branches)
```

### Dependency Notes

- **npm cache must be restored before npm ci:** The cache restore step (inside `setup-node`) must complete before the install step runs.
- **Test must pass before artifact upload:** Gate upload steps on successful test completion; never upload a zip from a failing build.
- **Zipping happens after test, not before:** `dist/` is produced by the build step inside `npm test`; zip the directories after `npm test` succeeds.
- **upload-artifact wraps input in another zip:** Passing a directory to `upload-artifact` produces one zip on download. Passing a pre-made `.zip` file without `compression-level: 0` produces a `.zip.zip` on download. See packaging notes below.

---

## MVP Definition

### Launch With (v2.1 — This Milestone)

Minimum viable pipeline that validates every push and produces store-ready artifacts.

- [ ] `on: push` + `on: pull_request: branches: [main]` triggers
- [ ] `actions/checkout@v4`
- [ ] `actions/setup-node@v4` with LTS version + `cache: 'npm'`
- [ ] `npm ci`
- [ ] `npm test` (build + Vitest + web-ext lint)
- [ ] Shell step: zip `dist/chrome/` → `patent-cite-chrome.zip`
- [ ] Shell step: zip `dist/firefox/` → `patent-cite-firefox.zip`
- [ ] `actions/upload-artifact@v4` for Chrome zip with `compression-level: 0`
- [ ] `actions/upload-artifact@v4` for Firefox zip with `compression-level: 0`

### Add After Validation (v2.1.x)

- [ ] Concurrency group + `cancel-in-progress: true` — add once rapid-push run queuing becomes noticeable
- [ ] Artifact names with git SHA or ref — add once artifact traceability is needed
- [ ] Conditional artifact upload (main-only) — add if PR artifact noise is a problem
- [ ] Explicit `permissions: contents: read` — add as security hygiene once workflow is stable

### Future Consideration (v3.0+)

- [ ] Automated Chrome Web Store publish via CWS API — after listing is active and OAuth credentials are managed
- [ ] Automated AMO (Firefox) publish — after AMO listing is active; requires AMO API key secrets
- [ ] Release workflow with version tagging — when version management and changelog tracking become important

---

## Feature Prioritization Matrix

| Feature | Developer Value | Implementation Cost | Priority |
|---------|----------------|---------------------|----------|
| Push + PR triggers | HIGH | LOW | P1 |
| checkout + setup-node + npm ci | HIGH | LOW | P1 |
| npm dependency cache | HIGH | LOW | P1 |
| `npm test` CI step | HIGH | LOW | P1 |
| Chrome zip artifact upload | HIGH | LOW | P1 |
| Firefox zip artifact upload | HIGH | LOW | P1 |
| `compression-level: 0` (correctness) | MEDIUM | LOW | P1 |
| Concurrency group / cancel stale runs | MEDIUM | LOW | P2 |
| SHA/ref in artifact name | LOW | LOW | P2 |
| Main-only artifact gating | LOW | LOW | P2 |
| Explicit `permissions:` block | MEDIUM | LOW | P2 |
| Automated store publish | HIGH | HIGH | P3 |

**Priority key:**
- P1: Required for this milestone
- P2: Should add when convenient, not blocking
- P3: Defer to future milestone

---

## Implementation Notes: Packaging Zips Correctly

`actions/upload-artifact@v4` automatically wraps uploaded content in a zip archive. This creates a double-zip problem when the uploaded path is already a `.zip` file. Two patterns work correctly:

**Option A — Upload directory (action zips it for you):**
```yaml
- uses: actions/upload-artifact@v4
  with:
    name: patent-cite-chrome-${{ github.sha }}
    path: dist/chrome/
    # Action zips the directory; user downloads one zip
```
Upside: Simple. Downside: The downloaded zip contains a `chrome/` subdirectory — user must navigate inside before uploading to Chrome Web Store.

**Option B — Pre-zip, upload with compression-level: 0 (recommended):**
```yaml
- name: Package Chrome zip
  run: cd dist && zip -r ../patent-cite-chrome.zip chrome/
- uses: actions/upload-artifact@v4
  with:
    name: patent-cite-chrome-${{ github.sha }}
    path: patent-cite-chrome.zip
    compression-level: 0   # zip is already compressed; skip re-compression
```
Upside: Downloaded zip is exactly the store submission file — contents at root level. Downside: Requires an extra shell step.

Option B is preferred for this project because the artifact is directly used as a Chrome Web Store / AMO submission file. Store tools expect the `manifest.json` at the root of the zip, not inside a `chrome/` subdirectory.

---

## Sources

- [Simplify Browser Extension Deployment with GitHub Actions — DEV Community](https://dev.to/jellyfith/simplify-browser-extension-deployment-with-github-actions-37ob)
- [Releasing WebExtension using GitHub Actions — DEV Community](https://dev.to/cardinalby/releasing-webextension-using-github-actions-i9j)
- [Chrome extension publishing with GitHub Actions — jam.dev](https://jam.dev/blog/automating-chrome-extension-publishing/)
- [Building and testing Node.js — GitHub Docs](https://docs.github.com/actions/guides/building-and-testing-nodejs)
- [actions/upload-artifact — GitHub](https://github.com/actions/upload-artifact)
- [actions/setup-node — GitHub](https://github.com/actions/setup-node)
- [upload-artifact double-zips a zip — Known issue #39](https://github.com/actions/upload-artifact/issues/39)
- [GitHub Actions now supports non-zipped artifacts (2026-02-26)](https://github.blog/changelog/2026-02-26-github-actions-now-supports-uploading-and-downloading-non-zipped-artifacts/)
- [Deprecation notice: v3 of artifact actions (2024-04-16)](https://github.blog/changelog/2024-04-16-deprecation-notice-v3-of-the-artifact-actions/)
- [web-ext lint GitHub Action — kewisch/action-web-ext](https://github.com/kewisch/action-web-ext)
- [Dependency caching reference — GitHub Docs](https://docs.github.com/en/actions/using-workflows/caching-dependencies-to-speed-up-workflows)

---

*Feature research for: GitHub Actions CI/CD pipeline — patent-cite-tool v2.1*
*Researched: 2026-03-04*

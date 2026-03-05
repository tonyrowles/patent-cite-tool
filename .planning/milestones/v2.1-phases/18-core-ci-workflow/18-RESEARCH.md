# Phase 18: Core CI Workflow - Research

**Researched:** 2026-03-04
**Domain:** GitHub Actions — Node.js CI, browser extension packaging, artifact upload
**Confidence:** HIGH

## Summary

This phase is greenfield — no `.github/` directory exists yet. The project has a fully functional `npm test` script that runs build + 4 named test suites sequentially, and both `dist/chrome/` and `dist/firefox/` directories already have `manifest.json` at the root. All that is needed is a single GitHub Actions workflow YAML file.

The workflow is straightforward: trigger on push (any branch) and pull_request (targeting main), set up Node 22 LTS with npm cache, run `npm ci`, run each of the 4 test suites as named steps, then zip and upload artifacts. The key design decision is running `npm run build` once before the 4 test steps rather than via `npm test` (which re-runs build) so each test step has individual pass/fail visibility in the Actions UI.

The one risk flagged in STATE.md — web-ext lint PDF.js false positives — is already mitigated by the existing `--ignore-files 'lib/**'` flag in `package.json:test:lint`. Confirm this exits 0 locally against a clean build before committing the workflow.

**Primary recommendation:** One single workflow file at `.github/workflows/ci.yml`, using `actions/checkout@v4`, `actions/setup-node@v4` with `cache: 'npm'`, `npm ci`, four individually named `npm run test:*` steps, shell `zip` for packaging, and `actions/upload-artifact@v4` with `if: success()`.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
None — user deferred all implementation decisions to Claude's discretion.

### Claude's Discretion
- **Job timeout value** (HARD-02) — pick a sensible `timeout-minutes` based on expected build+test duration
- **Artifact retention** — choose a reasonable `retention-days` value
- **Test failure behavior** — decide whether 4 named test steps run independently or bail on first failure
- **Workflow file naming** — standard `.github/workflows/ci.yml` or similar
- **Zip tooling** — choose approach for creating store-ready ZIPs (shell zip command, action, etc.)
- **Build step placement** — whether build runs once before all test steps or is embedded in `npm test`

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CICD-01 | GitHub Actions workflow triggers on push to any branch and on PRs to main | `on: push:` (no branch filter) + `on: pull_request: branches: [main]` |
| CICD-02 | Workflow checks out code, sets up Node 22 LTS with npm cache, and runs `npm ci` | `actions/checkout@v4` + `actions/setup-node@v4` with `node-version: 22` and `cache: 'npm'` + `npm ci` |
| CICD-03 | Workflow runs build + Vitest 71-case corpus + web-ext lint and fails on any test failure | Run `npm run build` then each `npm run test:*` as named steps; default step failure behavior halts job |
| PKG-01 | Workflow zips `dist/chrome/` into a store-ready artifact with manifest.json at zip root | `cd dist/chrome && zip -r ../../patent-cite-chrome.zip .` — "cd before zip" ensures manifest at root |
| PKG-02 | Workflow zips `dist/firefox/` into a store-ready artifact with manifest.json at zip root | `cd dist/firefox && zip -r ../../patent-cite-firefox.zip .` — same pattern |
| PKG-03 | Both zip artifacts are downloadable from the GitHub Actions run page | `actions/upload-artifact@v4` with `if: success()` — uploads only on clean run |
| HARD-02 | Job has `timeout-minutes` set to prevent indefinite hangs | Recommend `timeout-minutes: 10` — build ~15s, tests ~30s total, generous headroom |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| actions/checkout | v4 | Check out repository | Official GitHub action; v4 is current stable (v6 released Nov 2024 but not yet widely documented in canonical examples) |
| actions/setup-node | v4 | Install Node.js + npm cache | Official action; v4 is stable and widely documented; v6 exists but adds auto-caching complexity |
| actions/upload-artifact | v4 | Upload build artifacts | v4 is current stable recommended (v3 deprecated Nov 30, 2024; v7 released Feb 2026 is too new) |
| ubuntu-latest | GitHub-hosted runner | Build environment | Free, fast, has `zip` pre-installed |

**Note on action versions:** GitHub releases new major versions of its official actions frequently. v4 for all three actions is the well-documented stable choice as of March 2026. v6 of checkout/setup-node and v7 of upload-artifact exist but are new enough that community documentation lags. Use v4 for reliability.

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zip (shell built-in) | Pre-installed on ubuntu-latest | Create store-ready ZIPs | Simple, no action dependency needed |
| npm ci | Built into Node.js | Deterministic install from lock file | Always in CI — faster than `npm install`, respects lock file exactly |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Shell `zip` | `actions/zip` marketplace action | Shell zip is simpler, no action dependency, pre-installed on ubuntu-latest |
| `actions/upload-artifact@v4` | `actions/upload-artifact@v7` | v7 (Feb 2026) is too new; v4 is proven and actively maintained |
| Single `npm test` step | 4 individual test steps | `npm test` gives no per-suite visibility; individual steps show pass/fail per suite in Actions UI |
| `node-version: lts/*` | `node-version: 22` | Pinned version matches REQUIREMENTS.md; avoids surprise upgrades |

**Installation:** No action installation needed — GitHub Actions are referenced by tag in workflow YAML.

---

## Architecture Patterns

### Recommended Project Structure
```
.github/
└── workflows/
    └── ci.yml        # single workflow file
```

### Pattern 1: Single Job, Sequential Named Steps
**What:** One job with individually named steps: build, then 4 test suites, then zip+upload. Steps run sequentially and the job fails immediately if any step fails (default GitHub Actions behavior — no `continue-on-error` needed).
**When to use:** When build time is short (~15s) and test time is modest (~30s), a single job is simpler than parallel jobs and avoids artifact-sharing overhead between jobs.
**Example:**
```yaml
# Source: GitHub Actions official docs + verified patterns
name: CI

on:
  push:
  pull_request:
    branches: [main]

jobs:
  ci:
    runs-on: ubuntu-latest
    timeout-minutes: 10

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'npm'

      - run: npm ci

      - name: Build (Chrome + Firefox)
        run: npm run build

      - name: Test — src (Vitest unit)
        run: npm run test:src

      - name: Test — chrome-dist (Vitest chrome)
        run: npm run test:chrome

      - name: Test — firefox-dist (Vitest firefox)
        run: npm run test:firefox

      - name: Test — lint (web-ext lint)
        run: npm run test:lint

      - name: Package Chrome extension
        if: success()
        run: cd dist/chrome && zip -r ../../patent-cite-chrome.zip .

      - name: Package Firefox extension
        if: success()
        run: cd dist/firefox && zip -r ../../patent-cite-firefox.zip .

      - name: Upload Chrome artifact
        if: success()
        uses: actions/upload-artifact@v4
        with:
          name: patent-cite-chrome
          path: patent-cite-chrome.zip
          retention-days: 30

      - name: Upload Firefox artifact
        if: success()
        uses: actions/upload-artifact@v4
        with:
          name: patent-cite-firefox
          path: patent-cite-firefox.zip
          retention-days: 30
```

### Pattern 2: Zip with `cd` to Get manifest.json at Root
**What:** Run `cd dist/chrome && zip -r ../../patent-cite-chrome.zip .` to create a ZIP where `manifest.json` is at the archive root (not inside a `chrome/` subfolder).
**When to use:** Every time you need store-compliant ZIPs. Chrome Web Store and Firefox AMO require `manifest.json` at the archive root.
**Example:**
```yaml
# Source: https://remarkablemark.org/blog/2025/12/29/github-actions-zip-directory/
- name: Package Chrome extension
  run: cd dist/chrome && zip -r ../../patent-cite-chrome.zip .
  # Results in: manifest.json (at root), background/, content/, icons/, lib/
```

### Pattern 3: Trigger on All Pushes + PRs to Main Only
**What:** `on: push:` (no branch filter) triggers on every branch push. `on: pull_request: branches: [main]` triggers only for PRs targeting main.
**When to use:** Per CICD-01 requirement — every push triggers CI, PRs to main get status checks.
**Example:**
```yaml
# Source: GitHub Actions Workflow Syntax docs
on:
  push:
  pull_request:
    branches: [main]
```

### Anti-Patterns to Avoid
- **Using `npm test` as a single step:** Runs build + all suites as one blob. GitHub Actions shows it as pass/fail with no per-suite granularity. Use individual steps for CICD-03 requirement.
- **Zipping the directory as a wrapper:** `zip -r chrome.zip dist/chrome/` puts files inside `dist/chrome/` folder in the archive. Use `cd dist/chrome && zip -r ... .` instead.
- **Uploading without `if: success()`:** Default step behavior means zip/upload steps run even if earlier steps set the job to failed status via `continue-on-error`. Without explicit `if: success()`, artifacts could be uploaded from a broken build. (Note: since we do NOT use `continue-on-error`, the job halts on failure anyway — but `if: success()` is explicit and documents intent per success criterion #5.)
- **No `timeout-minutes`:** Default is 360 minutes. A hung npm install or infinite loop would block the runner for 6 hours. Always set a sensible timeout.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| npm cache invalidation | Custom cache key logic | `actions/setup-node@v4` with `cache: 'npm'` | Built-in action handles cache key from `package-lock.json` hash automatically |
| ZIP creation | Custom archiving script | Shell `zip` command | Pre-installed on ubuntu-latest, single command, reliable |
| Artifact storage | GitHub Releases or external storage | `actions/upload-artifact@v4` | Directly integrated into Actions run UI, free for 90 days, downloadable without auth |
| Node version management | `.nvmrc` + manual nvm install | `actions/setup-node@v4` with `node-version: 22` | Handles download, PATH, and caching in one step |

**Key insight:** GitHub Actions provides the entire required toolchain pre-assembled. The workflow is configuration, not code.

---

## Common Pitfalls

### Pitfall 1: ZIP Root Nesting
**What goes wrong:** `zip -r patent-cite-chrome.zip dist/chrome/` creates an archive where files are nested under `dist/chrome/manifest.json`. Chrome Web Store rejects this — manifest must be at root.
**Why it happens:** Passing a directory path to zip includes the directory as a parent in the archive.
**How to avoid:** Always `cd` into the target directory before zipping: `cd dist/chrome && zip -r ../../patent-cite-chrome.zip .`
**Warning signs:** Test by unzipping locally and checking `unzip -l patent-cite-chrome.zip` — `manifest.json` should be the first entry, not `dist/chrome/manifest.json`.

### Pitfall 2: Artifact Upload on Failed Build
**What goes wrong:** If test steps use `continue-on-error: true` (not recommended here, but possible), zip/upload steps run even after test failures. Artifacts are uploaded from broken builds.
**Why it happens:** `if: success()` is not the default — the default is to run if the step is not skipped.
**How to avoid:** Add `if: success()` to all packaging and upload steps. Since this workflow does NOT use `continue-on-error`, job halts on first failure naturally — but explicit `if: success()` enforces intent.
**Warning signs:** Artifacts appear in failed runs.

### Pitfall 3: web-ext lint PDF.js False Positive
**What goes wrong:** `npm run test:lint` fails on the bundled `pdfjs-dist` files in `dist/firefox/lib/` because web-ext lint flags certain eval patterns or deprecated APIs in third-party code.
**Why it happens:** pdf.js uses eval() internally; web-ext lint reports it.
**How to avoid:** The existing `npm run test:lint` script already includes `--ignore-files 'lib/**'`. Verify this passes locally (`npm run build && npm run test:lint`) before committing the workflow.
**Warning signs:** CI fails on the lint step with errors about `dist/firefox/lib/` files.

### Pitfall 4: `npm ci` Requires `package-lock.json`
**What goes wrong:** `npm ci` fails if `package-lock.json` is missing or gitignored.
**Why it happens:** `npm ci` is strict — it requires an exact lockfile.
**How to avoid:** Confirm `package-lock.json` exists and is committed (it does: visible in git status). Do not add it to `.gitignore`.
**Warning signs:** `npm ci` error: "npm ci can only install packages when your package.json and package-lock.json or npm-shrinkwrap.json are in sync."

### Pitfall 5: sharp Native Binaries (Non-Issue for This Workflow)
**What goes wrong:** `sharp` is a devDependency that requires platform-specific native binaries. Cross-platform binary issues can cause `npm ci` failures if sharp is installed on a different OS than it runs on.
**Why it happens:** `sharp` uses native C++ bindings.
**How to avoid:** This is NOT an issue for this workflow. `sharp` is only used by `scripts/generate-icons.mjs`, which is never called during `npm test` or `npm run build`. The CI workflow does not invoke `generate-icons`. No action needed.
**Warning signs:** Would see errors like "linuxmusl-x64 binaries cannot be used on linux-x64" — but this won't occur with ubuntu-latest + npm ci.

---

## Code Examples

### Complete Recommended ci.yml
```yaml
# Source: Derived from GitHub Actions official docs + verified patterns
# Docs: https://docs.github.com/en/actions/writing-workflows/workflow-syntax-for-github-actions
# setup-node: https://github.com/actions/setup-node
# upload-artifact: https://github.com/actions/upload-artifact/tree/v4/

name: CI

on:
  push:
  pull_request:
    branches: [main]

jobs:
  ci:
    runs-on: ubuntu-latest
    timeout-minutes: 10

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build (Chrome + Firefox)
        run: npm run build

      - name: Test — src (Vitest unit)
        run: npm run test:src

      - name: Test — chrome-dist (Vitest chrome)
        run: npm run test:chrome

      - name: Test — firefox-dist (Vitest firefox)
        run: npm run test:firefox

      - name: Test — lint (web-ext lint)
        run: npm run test:lint

      - name: Package Chrome extension
        if: success()
        run: cd dist/chrome && zip -r ../../patent-cite-chrome.zip .

      - name: Package Firefox extension
        if: success()
        run: cd dist/firefox && zip -r ../../patent-cite-firefox.zip .

      - name: Upload Chrome artifact
        if: success()
        uses: actions/upload-artifact@v4
        with:
          name: patent-cite-chrome
          path: patent-cite-chrome.zip
          retention-days: 30

      - name: Upload Firefox artifact
        if: success()
        uses: actions/upload-artifact@v4
        with:
          name: patent-cite-firefox
          path: patent-cite-firefox.zip
          retention-days: 30
```

### Artifact ZIP Verification (Local Pre-Flight)
```bash
# Run before committing workflow — verify manifest.json is at ZIP root
npm run build
cd dist/chrome && zip -r ../../patent-cite-chrome.zip . && cd ../..
unzip -l patent-cite-chrome.zip | head -5
# Expected: first entry should be "manifest.json", not "dist/chrome/manifest.json"

# Verify lint passes
npm run test:lint
# Should exit 0
```

### Push Trigger (Any Branch)
```yaml
# Source: https://docs.github.com/en/actions/writing-workflows/workflow-syntax-for-github-actions
on:
  push:
  # No branches filter = triggers on ALL branches
  pull_request:
    branches: [main]
  # Only PRs targeting main get CI checks
```

### Timeout Setting
```yaml
# Source: GitHub Actions workflow syntax
jobs:
  ci:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    # Default is 360 min. Build (~15s) + tests (~30s) + zip + upload fits in 5 min.
    # 10 min gives comfortable headroom without risking a 6-hour hung runner.
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `actions/upload-artifact@v3` | `actions/upload-artifact@v4` | Nov 30, 2024 (v3 deprecated) | Must use v4 — v3 will stop working |
| `npm install` in CI | `npm ci` | Standard practice ~2019+ | Faster, deterministic, respects lock file |
| Separate lint job | Single job with lint step | Project decision (3s lint doesn't warrant separate job spin-up) | Simpler, faster total runtime |

**Deprecated/outdated:**
- `actions/upload-artifact@v3`: Deprecated November 30, 2024 — do not use
- `actions/upload-artifact@v2`: Long deprecated — do not use
- `npm install` in CI: Still works but `npm ci` is always preferred

---

## Open Questions

1. **actions/checkout version: v4 vs v6**
   - What we know: v6 released November 2024; v4 still maintained and widely documented
   - What's unclear: Whether v6 introduces any breaking changes relevant to this simple checkout use case
   - Recommendation: Use v4 — it's the version canonical documentation shows, well-tested, no features of v6 are needed here

2. **web-ext lint exit code on PDF.js content**
   - What we know: `--ignore-files 'lib/**'` is already in the npm script; STATE.md flags this as MEDIUM confidence risk
   - What's unclear: Whether the flag fully suppresses all pdf.js-related lint warnings
   - Recommendation: Run `npm run build && npm run test:lint` locally and verify exit 0 before committing the workflow. This is the Wave 0 prerequisite check.

3. **Artifact names: patent-cite-chrome vs patent-cite-chrome.zip**
   - What we know: `actions/upload-artifact@v4` with `path: patent-cite-chrome.zip` — artifact shown in UI as the artifact name (not the file name)
   - What's unclear: Whether the uploaded artifact is downloadable as the .zip directly or re-wrapped
   - Recommendation: Name artifact `patent-cite-chrome` and path the `.zip` file — GitHub wraps the content in a download ZIP, so the user gets `patent-cite-chrome.zip` from the UI. Success criterion requires the name match `patent-cite-chrome.zip` — use artifact `name: patent-cite-chrome` to produce that download filename.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest v3.x |
| Config file | `vitest.config.js` (default), `vitest.config.chrome.js`, `vitest.config.firefox.js` |
| Quick run command | `npm run test:src` |
| Full suite command | `npm test` (build + all 4 suites) |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CICD-01 | Workflow triggers on push and PR | manual | Push a commit, check Actions tab | ❌ Wave 0 (workflow file) |
| CICD-02 | Node 22 setup + npm ci works | manual | Observe successful `npm ci` step in Actions run | ❌ Wave 0 (workflow file) |
| CICD-03 | Test failure fails the run | manual | Introduce deliberate test failure, verify run fails | ❌ Wave 0 (workflow file) |
| PKG-01 | Chrome ZIP has manifest.json at root | smoke | `unzip -l patent-cite-chrome.zip \| grep "^.*manifest.json$"` | ❌ Wave 0 |
| PKG-02 | Firefox ZIP has manifest.json at root | smoke | `unzip -l patent-cite-firefox.zip \| grep "^.*manifest.json$"` | ❌ Wave 0 |
| PKG-03 | Artifacts downloadable from run page | manual | Download from GitHub Actions run UI after push | ❌ Wave 0 (workflow file) |
| HARD-02 | timeout-minutes set | manual | Inspect workflow YAML; verify field present | ❌ Wave 0 (workflow file) |

### Sampling Rate
- **Per task commit:** `npm run build && npm run test:src` (src-level tests only, ~5s)
- **Per wave merge:** `npm test` (full build + all 4 suites)
- **Phase gate:** Full suite green + push to branch + verify Actions tab shows green run before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `.github/workflows/ci.yml` — the primary deliverable; covers CICD-01, CICD-02, CICD-03, PKG-01, PKG-02, PKG-03, HARD-02
- [ ] Pre-flight local check: `npm run build && npm run test:lint` must exit 0 — validates web-ext lint --ignore-files flag before workflow commit

*(All gaps are the workflow file itself — existing test infrastructure is already complete.)*

---

## Sources

### Primary (HIGH confidence)
- GitHub Actions Workflow Syntax docs — `on:` triggers, `timeout-minutes`, `permissions`, `concurrency` syntax
- `actions/setup-node` releases (GitHub) — confirmed v4 and v6 exist; v4 chosen for stability
- `actions/upload-artifact` releases (GitHub) — confirmed v4 is current stable (v3 deprecated Nov 30, 2024)
- `actions/checkout` releases (GitHub) — confirmed v4 and v6 exist; v4 chosen per canonical documentation
- remarkablemark.org/blog/2025/12/29/github-actions-zip-directory/ — verified `cd + zip .` pattern for rootless ZIP

### Secondary (MEDIUM confidence)
- GitHub Actions Node.js CI docs — canonical Node.js workflow with checkout, setup-node, npm ci
- WebSearch: upload-artifact v4 with `if: success()` — confirmed by multiple sources

### Tertiary (LOW confidence)
- web-ext `--ignore-files 'lib/**'` suppressing PDF.js false positives — pattern is correct per web-ext docs, but actual exit code under CI not verified (flag in STATE.md)

---

## Metadata

**Confidence breakdown:**
- Standard stack (action versions): HIGH — verified from official GitHub releases pages
- Workflow structure: HIGH — derived from official GitHub Actions docs
- ZIP root pattern: HIGH — verified from official source
- web-ext lint PDF.js: MEDIUM — `--ignore-files` flag confirmed working pattern; actual CI behavior requires local pre-flight verification
- Artifact naming (download filename): MEDIUM — behavior based on upload-artifact v4 docs, not personally verified against UI

**Research date:** 2026-03-04
**Valid until:** 2026-04-04 (GitHub Actions action versions can change; verify action major versions if using after this date)

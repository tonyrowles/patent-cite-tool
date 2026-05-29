# Architecture: Autonomous E2E Testing Agent

**Domain:** Browser extension E2E + accuracy verification harness
**Researched:** 2026-05-12
**Overall confidence:** HIGH

This document answers "How does the E2E testing agent integrate with the existing repo?" with concrete file paths, component boundaries, data flows, and a phased build order.

---

## 1. Directory Layout

### Recommended top-level shape

```
patent-cite-tool/
├── src/                              # (unchanged) extension source
├── dist/chrome/  dist/firefox/       # (unchanged) build output
├── scripts/                          # (unchanged) build + tooling scripts
│   └── e2e-report-issue.mjs          # NEW — files GitHub issue from a failure JSON
├── tests/
│   ├── unit/                         # (unchanged) vitest, Node-only
│   ├── fixtures/                     # (unchanged) 23 raw PositionMap JSON files
│   ├── golden/baseline.json          # (unchanged) 76-case oracle (reused by E2E)
│   ├── test-cases.js                 # (unchanged) — reused as the E2E case registry
│   └── e2e/                          # NEW — Playwright + agent harness lives here
│       ├── README.md
│       ├── playwright.config.ts
│       ├── fixtures/                 # Playwright test fixtures (extension loader, etc.)
│       │   └── extension.ts
│       ├── lib/                      # Reusable modules (the "library" half of the harness)
│       │   ├── extension-loader.ts   # launchPersistentContext + resolve extension ID
│       │   ├── selection-coordinator.ts  # DOM contracts for selecting text on Google Patents
│       │   ├── citation-observer.ts  # reads Shadow DOM / clipboard for plugin output
│       │   ├── pdf-verifier.ts       # INDEPENDENT re-parse (NOT src/shared/matching)
│       │   ├── artifact-capturer.ts  # screenshot, DOM snapshot, PDF page snippet
│       │   ├── case-registry.ts      # loads tests/test-cases.js + tests/golden/baseline.json
│       │   └── reporter.ts           # JSON + HTML + issue-body markdown emitters
│       ├── specs/                    # Playwright test specs (deterministic mode)
│       │   ├── golden-regression.spec.ts   # one test per golden case
│       │   └── smoke.spec.ts               # 3-5 cases for fast smoke
│       ├── exploratory/              # LLM mode entry point (NOT a Playwright spec)
│       │   ├── run-exploratory.mjs   # Node script — orchestrates Claude Code subprocess
│       │   └── prompts/              # Prompt templates handed to Claude Code
│       │       └── pick-and-verify.md
│       └── artifacts/                # (gitignored) run output: screenshots, DOM, JSON reports
├── .github/workflows/
│   ├── ci.yml                        # (modified) — gains an optional e2e-smoke job
│   ├── release.yml                   # (unchanged)
│   └── e2e-nightly.yml               # NEW — scheduled cron + workflow_dispatch
└── .gitignore                        # (modified) — add tests/e2e/artifacts/
```

### Rationale for `tests/e2e/`

- **Parallel to `tests/unit/`** — matches the existing convention. The repo already uses `tests/` as the canonical test root with subdirectories for fixture corpora and per-suite folders. A top-level `agent/` would orphan it from the rest of the test tooling and force CI yaml to learn a new location.
- **Self-contained subtree** — `tests/e2e/` owns its own `playwright.config.ts`, `lib/`, `specs/`, and `artifacts/`. Nothing inside `tests/e2e/` is imported by the extension build (esbuild only consumes `src/`), so the boundary is clean.
- **Exploratory mode is NOT under `specs/`** — Playwright auto-discovers spec files; we do not want the LLM run to execute via `npx playwright test`. Putting it under `tests/e2e/exploratory/` with a different file extension/runner keeps it out of the default test glob.

### LLM-exploratory entry point — choose ONE

Three options were considered:

| Option | Verdict | Reason |
|--------|---------|--------|
| Claude Code slash command (`.claude/commands/e2e-explore.md`) | NO | Couples developer-machine config to the repo; can't be invoked from a script; harder to evolve prompts in code review. |
| Claude Agent SDK (TypeScript) library import | MAYBE later | Adds a runtime dependency to `package.json`. Defer until prompts have stabilized. |
| **Plain `npm run e2e:explore` → Node script that spawns `claude -p` (headless mode) as subprocess** | **YES** | Zero new deps. Mirrors the existing `scripts/*` pattern. Claude Code's `--print` + `--output-format json` flags are designed for exactly this. Subscription-only, runs locally — perfect fit for the "local-dev only" constraint. |

**Decision:** `tests/e2e/exploratory/run-exploratory.mjs` spawns the user's installed `claude` CLI in headless mode (`claude -p "..." --output-format json`), passing it the harness's Playwright primitives via MCP or a thin tool wrapper. The prompt template lives in `tests/e2e/exploratory/prompts/pick-and-verify.md`.

### Failure artifacts → `tests/e2e/artifacts/` (gitignored)

- Path is **inside `tests/e2e/`**, not a top-level `.test-results/`, so it co-locates with the harness that produces it.
- Add `tests/e2e/artifacts/` to `.gitignore` alongside the existing `dist/` entry.
- Playwright's `reporter` writes here; `artifact-capturer.ts` writes here; nightly cron uploads here as a workflow artifact.

---

## 2. Component Boundaries

The harness is **NOT a single 800-line spec file**. It is a small library of focused modules under `tests/e2e/lib/`, consumed by either:
- Playwright spec files (`tests/e2e/specs/*.spec.ts`) for deterministic regression
- A Node entry script (`tests/e2e/exploratory/run-exploratory.mjs`) for LLM exploration

This separation is the single most important architectural decision: **the deterministic mode and LLM mode share the same primitives, so a fix to selection logic benefits both**.

### Module responsibility table

| Module | File | Owns | Does NOT own |
|--------|------|------|--------------|
| Extension loader | `tests/e2e/lib/extension-loader.ts` | `launchPersistentContext`, `--load-extension` arg, dynamic extension-ID resolution from service worker URL, headless-vs-headed selection | Test orchestration, navigation, selection |
| Selection coordinator | `tests/e2e/lib/selection-coordinator.ts` | Given a `(patentId, selectedText)`, navigates to `patents.google.com/patent/{id}`, finds the text node containing the selection, creates a DOM `Range`, dispatches `selectionchange`/`mouseup` to trigger the extension's listeners | Knowing what citation should result; reading the extension's output |
| Citation observer | `tests/e2e/lib/citation-observer.ts` | Reads the citation from (a) the Shadow DOM popover OR (b) clipboard after Ctrl+C, normalizes to `{citation, confidence}` | Comparing to expected; triggering selections |
| Case registry | `tests/e2e/lib/case-registry.ts` | Loads `tests/test-cases.js` + `tests/golden/baseline.json`, joins them into iterable `(id, patentNumber, selectedText, expectedCitation, expectedConfidence)` records | PDF parsing; Playwright glue |
| PDF verifier (independent) | `tests/e2e/lib/pdf-verifier.ts` | Given `(patentNumber, selectedText, citedColumn, citedLineRange)`: fetches the PDF, parses it via an **independent code path**, searches for `selectedText` near the cited location, returns `{verified: bool, foundLine: int}` | Anything the extension does; reading golden baseline |
| Artifact capturer | `tests/e2e/lib/artifact-capturer.ts` | `page.screenshot()`, `page.content()`, PDF page snippet via pdf-lib or pdfjs, writes to `tests/e2e/artifacts/{caseId}/` | When to capture (caller decides); reporting |
| Reporter | `tests/e2e/lib/reporter.ts` | Emits run summary as JSON (machine-readable) + Markdown (for GH issue body) + optional HTML index | Filing the issue (workflow does that) |
| Exploratory orchestrator | `tests/e2e/exploratory/run-exploratory.mjs` | Spawns `claude -p`, passes prompts, parses JSON output, invokes harness primitives, loops | Anything Playwright-specific (delegates to lib/) |

### Why a verifier separate from `src/shared/matching.js`

The verifier exists **specifically to catch bugs in `src/shared/matching.js`**. If both used the same matching code, a bug there would produce a "passing" verification (garbage-in, garbage-out). Therefore:

- **Implementation language/library:** Use `pdfjs-dist` differently (e.g., raw `getTextContent()` items, no column inference) OR use `pdf-parse` / `pdftotext` (different library entirely)
- **Algorithm:** Simple "does `selectedText` appear in the PDF text on the cited page within ±5 lines of the cited line?" — NOT the 6-tier matcher
- **Code-share rule:** `tests/e2e/lib/pdf-verifier.ts` MUST NOT import from `src/` or `dist/`. Lint rule or ESLint `no-restricted-imports` to enforce.

### Single executable test file? — No

A single spec would force the LLM mode to either duplicate primitives or import from a Playwright spec (awkward — specs are designed to be discovered, not imported). The library/spec split is the canonical Playwright pattern and matches how the existing repo already separates `tests/test-cases.js` (data) from `tests/unit/*.test.js` (runners).

---

## 3. Integration Points With Existing Code

### Reuse, don't duplicate

| Existing asset | E2E reuse? | How |
|----------------|-----------|-----|
| `tests/test-cases.js` (76 cases with `id`, `patentFile`, `selectedText`, `category`) | YES — direct import | `case-registry.ts` does `import { TEST_CASES } from '../../test-cases.js'` and joins with golden baseline |
| `tests/golden/baseline.json` (oracle: `{id: {citation, confidence}}`) | YES — direct import | `case-registry.ts` reads JSON and zips into test cases |
| `tests/fixtures/US*.json` (raw PositionMap data) | YES — but only by the verifier | `pdf-verifier.ts` can use these as a SECONDARY oracle when the PDF isn't reachable. Primary oracle is golden baseline; fixtures provide page/column/line ground truth for sanity checks |
| `src/shared/matching.js` | NO — forbidden | The verifier is independent by design (see §2) |
| `dist/chrome/` | YES — loaded as the extension under test | `extension-loader.ts` reads from `dist/chrome/` after `npm run build:chrome` |
| `npm run build:chrome` | YES — pre-step | Playwright config includes `webServer`-style `globalSetup` that runs the Chrome build first |
| Cloudflare Worker fallback (USPTO proxy) | YES — verifier may use it | When `pdf-verifier.ts` needs a PDF and Google's CDN fails, fall back to the same Worker the extension uses |

### Build coupling: who builds the extension?

**Decision:** Playwright's `globalSetup` runs `npm run build:chrome` once before any spec. Locally this is ~1 second; in CI it's already part of the existing pipeline so the work is effectively cached.

```ts
// tests/e2e/playwright.config.ts (sketch)
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './specs',
  globalSetup: './lib/global-setup.ts',  // runs `node scripts/build.js --chrome-only`
  use: { trace: 'retain-on-failure' },
  reporter: [['html', { outputFolder: 'artifacts/html-report' }], ['json', { outputFile: 'artifacts/summary.json' }]],
  workers: 1,                            // extensions need persistent context — keep serial
});
```

### Installing Playwright + Chromium without clone bloat

- **Add `@playwright/test` to `devDependencies`** in `package.json` (small — the binary lives in `~/.cache/ms-playwright`, not `node_modules/`)
- **Do NOT vendor Chromium in the repo.** Developers run `npx playwright install chromium` once; CI does the same in a workflow step.
- **No package-lock.json today** — the existing CI gracefully handles `npm install` when no lockfile is present (see `ci.yml` lines 36-42). Continue that pattern.
- **Browser binary cache in CI:** Playwright's official advice is that caching is often slower than re-downloading. Skip it initially; add only if cron-job time becomes a problem.

### Confirmed package additions (devDependencies only)

```jsonc
{
  "devDependencies": {
    "@playwright/test": "^1.50.0",   // E2E runner — version current as of May 2026
    // existing deps unchanged
  },
  "scripts": {
    // existing scripts unchanged
    "e2e": "playwright test --config tests/e2e/playwright.config.ts",
    "e2e:smoke": "playwright test --config tests/e2e/playwright.config.ts --grep @smoke",
    "e2e:explore": "node tests/e2e/exploratory/run-exploratory.mjs",
    "e2e:report-issue": "node scripts/e2e-report-issue.mjs"
  }
}
```

---

## 4. Data Flow

### Deterministic mode (golden regression)

```
case-registry.ts
   │ TEST_CASES + baseline.json
   ▼
specs/golden-regression.spec.ts  (one test.each entry per case)
   │
   ├─► extension-loader.ts        ──► launches Chromium with dist/chrome/ loaded
   ├─► selection-coordinator.ts   ──► navigates, creates DOM Range, fires mouseup
   ├─► citation-observer.ts       ──► reads Shadow DOM / clipboard
   ▼
compare observed vs baseline.json
   │
   ├─ pass → no artifact write, test passes
   └─ fail → artifact-capturer.ts ──► tests/e2e/artifacts/{caseId}/{screenshot, dom, summary.json}
              reporter.ts          ──► appends to run-level summary.json
```

### LLM exploratory mode

```
run-exploratory.mjs
   │
   ├─► spawns `claude -p --output-format json` with prompt from prompts/pick-and-verify.md
   │       The prompt tells Claude: "pick a US patent number, choose an unusual selection,
   │       call the harness primitives, verify, report"
   │
   ├─► For each iteration Claude requests:
   │       extension-loader.ts ─► selection-coordinator.ts ─► citation-observer.ts
   │                                                                  │
   │                                                                  ▼
   │                                                  pdf-verifier.ts (independent re-parse)
   │                                                                  │
   │                                                                  ▼
   │                                                            verdict + artifact
   │
   └─► After N iterations or budget exhausted, reporter.ts emits a session report
```

The exploratory orchestrator does NOT use Playwright's test runner. It instantiates `lib/extension-loader.ts` directly and drives a single persistent context across many iterations. This is **why** those modules are framework-agnostic library code, not Playwright fixtures.

### Verifier flow (used by both modes)

```
(patentNumber, selectedText, citedColumn, citedLineStart, citedLineEnd)
   │
   ▼
1. Try local fixture: tests/fixtures/{patentNumber}.json (PositionMap)
   │ found? ──► search PositionMap for selectedText, check page/column/line proximity
   │ miss → continue
   ▼
2. Fetch PDF from Google Patents CDN
   │ ok? ──► parse with INDEPENDENT pdfjs call (raw text only, no column inference)
   │ fail → continue
   ▼
3. Fetch via Cloudflare Worker (USPTO eGrant API)
   │ same parse path
   ▼
{verified: true|false, foundOn: "L:C", source: "fixture"|"google"|"worker"}
```

### Anti-coupling rules

These rules MUST hold for the architecture to remain modular:

1. **`lib/pdf-verifier.ts` MUST NOT import from `src/`** — enforced by ESLint `no-restricted-imports`.
2. **Playwright spec files MUST NOT contain selection/observation logic inline** — they call into `lib/`. A spec file should read like a recipe, not a kitchen.
3. **`lib/*.ts` modules MUST NOT import each other except through narrow exported interfaces** — e.g., `selection-coordinator.ts` receives a `Page`, not an `ExtensionLoader`.
4. **`exploratory/run-exploratory.mjs` MUST NOT import any file under `specs/`** — specs are runtime-only.
5. **No module under `tests/e2e/` may be imported by `src/`** — extension code is independent of testing.

---

## 5. CI/Cron Integration

### Decision: separate workflow, not extending `ci.yml` heavily

**`ci.yml` (push/PR) — minimal change:**
Add a `e2e-smoke` job that runs 3-5 cases (`@smoke` tag), takes <2 min, runs on every push. This catches "extension fundamentally broken" without slowing PRs.

```yaml
# .github/workflows/ci.yml (additions)
  e2e-smoke:
    runs-on: ubuntu-latest
    needs: ci                      # only run if unit/lint pass
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm install
      - run: npx playwright install chromium --with-deps
      - run: npm run build:chrome
      - run: npm run e2e:smoke
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: e2e-smoke-artifacts
          path: tests/e2e/artifacts/
```

**`e2e-nightly.yml` (NEW) — full 76-case run + issue filing:**

```yaml
name: E2E Nightly
on:
  schedule:
    - cron: '0 6 * * *'           # 06:00 UTC daily (~01:00 ET, ~22:00 PT prev day)
  workflow_dispatch: {}            # manual trigger from Actions UI

permissions:
  contents: read
  issues: write                    # for gh issue create on failure

jobs:
  e2e-full:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm install
      - run: npx playwright install chromium --with-deps
      - run: npm run build:chrome
      - run: npm run e2e                # all 76 cases
        id: e2e
        continue-on-error: true
      - uses: actions/upload-artifact@v4
        if: always()
        with: { name: e2e-nightly-artifacts, path: tests/e2e/artifacts/ }
      - name: File or update GitHub issue on failure
        if: steps.e2e.outcome == 'failure'
        env: { GH_TOKEN: ${{ secrets.GITHUB_TOKEN }} }
        run: npm run e2e:report-issue -- --summary tests/e2e/artifacts/summary.json
      - name: Fail the job if E2E failed
        if: steps.e2e.outcome == 'failure'
        run: exit 1
```

### Why a separate workflow file (not just a job in `ci.yml`)

1. **Different triggers.** `ci.yml` runs on every push; nightly runs on `schedule`. Mixing both adds conditionals to every step.
2. **Different permissions.** Nightly needs `issues: write`; PR runs do not. Separate files = least-privilege.
3. **Different timeout.** Nightly is 30 min; CI is 10 min. Workflow-level `timeout-minutes` is cleaner per-file.
4. **Different concurrency.** Nightly should NOT cancel an in-progress nightly. The existing `ci.yml` concurrency group cancels in-progress PR runs — wrong semantics for cron.

### Issue filing: separate script, not inline workflow yaml

**Decision:** `scripts/e2e-report-issue.mjs` — a Node script invoked from the workflow.

- **Workflow YAML cannot build a rich issue body.** Markdown tables of 76 cases, artifact links, screenshot embeds — that's hundreds of lines of bash heredoc. Don't do that in YAML.
- **The script is testable.** It reads `tests/e2e/artifacts/summary.json`, formats markdown, calls `gh issue create` or `gh issue comment` (deduplicating against an open "[E2E Nightly] regression" issue using a label).
- **Co-locates with other scripts** — `scripts/` is the established home for repo tooling (`build.js`, `update-golden.js`, `accuracy-report.js`).

Deduplication strategy:
- Search for open issues with label `e2e-nightly`
- If found and ≤7 days old → `gh issue comment` with the new run summary
- Otherwise → `gh issue create` with title `[E2E Nightly] {failCount}/76 regressions on {date}`

---

## 6. Phase Build Order

**Total: 5 phases.** This sits in the 4-6 phase target. Each phase ships a usable increment.

### Phase 1: Playwright harness + extension load + smoke spec
**Goal:** `npm run e2e:smoke` loads the extension, navigates to one Google Patents page, asserts the extension's content script registered.

**Builds:**
- `tests/e2e/playwright.config.ts`
- `tests/e2e/lib/extension-loader.ts` (launchPersistentContext, dynamic extension ID)
- `tests/e2e/lib/global-setup.ts` (runs `npm run build:chrome`)
- `tests/e2e/specs/smoke.spec.ts` (1 case — "extension loads on US11427642")
- `package.json` deps: `@playwright/test`
- `package.json` scripts: `e2e`, `e2e:smoke`
- `.gitignore`: `tests/e2e/artifacts/`

**Depends on:** existing build pipeline (must keep working).
**Validates:** Playwright + MV3 service worker integration works at all on Ubuntu CI and locally.

### Phase 2: Selection automation + citation observation
**Goal:** Drive a real selection on one patent, observe the extension's citation output, compare to expected.

**Builds:**
- `tests/e2e/lib/selection-coordinator.ts` (DOM Range creation, mouseup dispatch — this is the tricky bit; needs research on how Google Patents renders the spec text in the DOM)
- `tests/e2e/lib/citation-observer.ts` (Shadow DOM piercing — Playwright auto-pierces, so this is straightforward)
- `tests/e2e/lib/case-registry.ts` (joins `test-cases.js` + `baseline.json`)
- Extend `smoke.spec.ts` to: select → observe → assert exact match against golden

**Depends on:** Phase 1 (extension loaded).
**Validates:** Selection contract is reliable. This is where Google UI drift will most likely bite.

### Phase 3: Deterministic regression mode (all 76 cases)
**Goal:** `npm run e2e` runs the full corpus, fails on any deviation from `baseline.json`.

**Builds:**
- `tests/e2e/specs/golden-regression.spec.ts` (one `test.each` over all 76 cases)
- `tests/e2e/lib/artifact-capturer.ts` (only invoked on failure)
- `tests/e2e/lib/reporter.ts` (JSON summary)

**Depends on:** Phase 2 (selection + observation primitives).
**Validates:** The harness is reliable at scale — flake rate must be measured here. Likely needs retries, longer timeouts for OCR-heavy patents.

### Phase 4: Independent PDF re-parse verifier + CI integration
**Goal:** Catch regressions where the extension reports a citation that's wrong even though it matches the (potentially stale) baseline. Add CI smoke job + nightly workflow.

**Builds:**
- `tests/e2e/lib/pdf-verifier.ts` (fixture-first, then PDF fetch, then Worker fallback)
- ESLint rule (or simple grep test) preventing `pdf-verifier.ts` from importing `src/`
- `scripts/e2e-report-issue.mjs` (GH issue formatter + dedup)
- `.github/workflows/ci.yml` — add `e2e-smoke` job
- `.github/workflows/e2e-nightly.yml` — NEW

**Depends on:** Phase 3 (full corpus runnable). The verifier needs the deterministic harness to feed it cases.
**Validates:** End-to-end production loop — nightly cron, failure routes to GitHub issue.

### Phase 5: LLM exploratory mode
**Goal:** `npm run e2e:explore` runs Claude Code locally for N iterations against fresh patents.

**Builds:**
- `tests/e2e/exploratory/run-exploratory.mjs` (subprocess spawn, prompt + tool-permission scoping)
- `tests/e2e/exploratory/prompts/pick-and-verify.md`
- Documentation in `tests/e2e/README.md` for the subscription requirement
- Possibly an MCP server exposing `selection-coordinator` + `citation-observer` + `pdf-verifier` as tools (defer judgment to Phase 5 implementation)

**Depends on:** Phases 1-4 (all primitives + verifier). Cannot build LLM mode before deterministic harness exists — Claude needs to call tested primitives, not invent them.
**Validates:** Discovery of patents/selections that human curation missed.

### What about failure artifact capture as its own phase?

The original question listed Phase 7 = "Failure artifact capture." **Folded into Phase 3** — capture is a 1-file concern (`artifact-capturer.ts`) that's only useful once the deterministic mode is producing failures. Splitting it out would create a phase with no validation criteria.

### Phase dependency graph

```
Phase 1 (load) ──► Phase 2 (select/observe) ──► Phase 3 (full corpus + artifacts)
                                                       │
                                                       ▼
                                                Phase 4 (verifier + CI/cron)
                                                       │
                                                       ▼
                                                Phase 5 (LLM)
```

Strict sequential. No parallelism possible — each phase ships a tool the next phase needs.

---

## Patterns to Follow

### Pattern: Library-first, runner-thin
**What:** Selection, observation, verification, and reporting live in `tests/e2e/lib/`. Playwright specs are 5-15 lines that wire them together.
**When:** Always for this milestone.
**Why:** The LLM mode is not a Playwright test — it needs to import the same primitives. Thin specs = no duplication.

### Pattern: Resolve extension ID at runtime
**What:** After `launchPersistentContext`, wait for the `serviceworker` event, parse the URL for the extension ID. Never hardcode.
**When:** Every test setup.

### Pattern: Two oracles for verification
**What:** Compare against `baseline.json` (regression oracle) AND independently re-parse the PDF (correctness oracle).
**When:** Verifier path only. Specs use baseline alone for speed.

---

## Anti-Patterns to Avoid

### Anti-Pattern: One giant spec file
**Why bad:** Forces LLM mode to either duplicate selection logic or hack imports from spec files.
**Instead:** Library modules + thin spec files.

### Anti-Pattern: Verifier imports `src/shared/matching.js`
**Why bad:** Defeats the whole point of "independent." A bug in matching.js would pass verification.
**Instead:** Different library (`pdf-parse` or raw `pdfjs.getTextContent()`), different algorithm, ESLint enforcement.

### Anti-Pattern: Running E2E full corpus on every push
**Why bad:** 76 cases × Chromium launch overhead = slow PRs. PRs will start landing without E2E feedback.
**Instead:** Smoke (3-5 cases) on push; full on nightly cron + manual dispatch.

### Anti-Pattern: GH issue body built in workflow YAML
**Why bad:** Multi-line heredoc with markdown tables is unreadable and untestable.
**Instead:** `scripts/e2e-report-issue.mjs` — testable Node code.

### Anti-Pattern: Hardcoding extension ID
**Why bad:** Non-portable. Breaks on any rebuild that regenerates a key.
**Instead:** Dynamic resolution from `context.serviceWorkers()[0].url()`.

### Anti-Pattern: Caching Playwright browsers in CI (initially)
**Why bad:** Playwright's official docs say cache restore is often comparable to re-download. Adds complexity for no gain.
**Instead:** Re-install on each run; revisit only if cron-job time becomes a problem.

---

## Scalability Considerations

| Concern | Today (76 cases) | At 200 cases | At 500 cases |
|---------|------------------|--------------|--------------|
| Full-run wall time | ~10 min (extrapolated) | ~25 min | ~60 min |
| Approach | Single Chromium worker (extensions require persistent context) | Same — bottleneck is page load, not parallelism | Shard across N jobs in matrix; each job loads extension once and runs a slice |
| Artifact size | <10 MB | ~25 MB | ~60 MB — switch to "failures only" with explicit `retain-on-failure` |
| Flake handling | `retries: 1` in config | `retries: 2`; track flake rate in reporter | Quarantine list; auto-rerun quarantined separately |

---

## Sources

- [Playwright — Chrome extensions documentation](https://playwright.dev/docs/chrome-extensions) — `launchPersistentContext` is mandatory for extension loading; service worker URL is the canonical extension-ID source. HIGH confidence (official docs).
- [Playwright — Continuous Integration guide](https://playwright.dev/docs/ci) — Browser caching guidance, `--with-deps` install pattern. HIGH confidence.
- [BrowserStack — Playwright Chrome Extension testing guide (2026)](https://www.browserstack.com/guide/playwright-chrome-extension) — MV3 service-worker suspension handling; multi-surface extension testing. MEDIUM confidence.
- [Testomat.io — Playwright tutorial for browser extensions](https://testomat.io/blog/playwright-tutorial-experience-testing-browser-extensions/) — Persistent context per test-file vs per-test trade-offs. MEDIUM confidence.
- [Playwright Solutions — caching browser binaries in GitHub Actions](https://playwrightsolutions.com/playwright-github-action-to-cache-the-browser-binaries/) — Cache-vs-redownload trade-off. MEDIUM confidence.
- [Anthropic — Claude Code headless mode docs and ecosystem coverage (amux.io, mindstudio.ai)](https://amux.io/guides/claude-code-headless/) — `claude -p --output-format json` subprocess pattern, `.claude/settings.json` tool scoping. MEDIUM confidence (vendor + secondary sources agree).
- [@anthropic-ai/claude-agent-sdk on npm](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk) — TypeScript SDK alternative if subprocess approach proves limiting. HIGH confidence (package exists, current).
- Repo files inspected: `.planning/PROJECT.md`, `package.json`, `scripts/build.js`, `tests/golden/baseline.json`, `tests/test-cases.js`, `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `tests/fixtures/US11427642.json`, `.gitignore`. HIGH confidence (direct read).

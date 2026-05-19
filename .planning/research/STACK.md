# Stack Research

**Domain:** Autonomous E2E testing agent for Chrome MV3 WebExtension (v3.0 milestone)
**Researched:** 2026-05-12
**Confidence:** HIGH for Playwright + Agent SDK + PDF tooling; MEDIUM on subscription-vs-API question (the answer is unambiguous but politically sensitive — see below)

---

## Headline Findings

1. **Use Playwright 1.60.0** with `chromium.launchPersistentContext()` and `channel: 'chromium'` — this is the only supported way to load an unpacked MV3 extension, and the `chromium` channel is the only one that supports extensions in true headless mode (Chrome's new headless). No `xvfb-run` needed.

2. **The "Claude Code subscription" plan is at odds with Anthropic's ToS for non-interactive use.** The Agent SDK docs explicitly require `ANTHROPIC_API_KEY` (or Bedrock/Vertex/Foundry credentials); subscription/Pro/Max login is not permitted for programmatic SDK use. A separate ToS clause prohibits accessing subscription services "through automated or non-human means … whether through a bot, script, or otherwise." There are GitHub issues of users being banned for using `claude -p` against their subscription. **Recommended re-frame:** treat LLM exploratory mode as an *interactive* session driven by a human running `claude` in a terminal, with the Playwright harness exposed as an MCP server the human's Claude Code instance connects to. This stays within ToS without paying API tokens.

3. **Use `pdfjs-dist` for the independent PDF verifier** but in a clean, dedicated Node script that imports `pdfjs-dist/legacy/build/pdf.mjs` directly (not through any shared helper). Parity-with-extension-bug risk is real but mitigated by: (a) different invocation surface (Node + legacy build vs. browser worker), (b) no shared code with `src/shared/matching.js`, (c) using only `getTextContent()` items + raw transform matrices, ignoring all the extension's tier matchers. The alternative — Poppler/`pdftotext` — drags a binary dependency into CI that the existing pipeline doesn't need, and Poppler's text extraction has different bugs (different is good for a verifier, but the install footprint cost is real).

4. **For PDF page snippet artifacts**, use `pdfjs-dist` to render the cited page to a `node-canvas` Canvas, then `sharp` to crop the column:line region to PNG. `sharp` is already a dependency. Adding `canvas` is the only new install.

---

## Recommended Stack

### New Core Technologies (NEW for v3.0)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `@playwright/test` | `^1.60.0` | E2E harness — load extension into Chromium, drive Google Patents pages, observe Shadow DOM | Only mature option for unpacked MV3 extensions; `channel: 'chromium'` supports extensions in true headless; first-class CI support; built-in test runner, fixtures, trace viewer, screenshot/video capture |
| `canvas` | `^3.1.0` | Node-side `<canvas>` backend for `pdfjs-dist` rendering | Required dependency for PDF.js when rendering pages to images outside a browser; the de-facto pairing for headless PDF rendering |

### New Supporting Libraries (NEW for v3.0)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@anthropic-ai/claude-agent-sdk` | `^0.2.140` | Drive LLM exploratory mode programmatically — IF user accepts using API key (see ToS note below) | Optional. Only install if user opts into paid-API exploratory mode. Default v3.0 ships without it. |
| `@playwright/mcp` | `latest` (via `npx`) | MCP server exposing Playwright as a tool to Claude Code (interactive session) | For LLM exploratory mode under the ToS-compliant path: user runs Claude Code interactively, Playwright MCP server provides browser tools. Invoke via `npx @playwright/mcp@latest` — no install needed. |

### Reused / Already-Present (NO change)

| Tool | Current Version | Reused For |
|------|----------------|------------|
| `pdfjs-dist` | `^5.5.207` | Verifier's independent PDF re-parse AND PDF-page-snippet rendering. Import path: `pdfjs-dist/legacy/build/pdf.mjs` for Node. |
| `sharp` | `^0.34.5` | Crop the rendered PDF page canvas to the cited column:line bounding-box region |
| `vitest` | `^3.0.0` | Run the deterministic regression suite as a Vitest test file that orchestrates Playwright (alternative: use Playwright's own runner; see "Test Runner Choice" below) |
| `esbuild` | `^0.27.3` | No change — still builds `dist/chrome/` which Playwright loads |
| Node | `22` (CI), `22` (local) | PDF.js v5 requires `Promise.withResolvers` → Node 22+ |
| GitHub Actions | `ubuntu-latest`, `setup-node@v4`, `upload-artifact@v4` | Same patterns; extend with `npx playwright install --with-deps chromium` step |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Playwright trace viewer | Debugging failing E2E runs locally | Enable with `trace: 'retain-on-failure'` in `playwright.config.ts`; opens with `npx playwright show-trace trace.zip` |
| `playwright codegen` | Initial recording of Google Patents interactions | Useful one-off to capture selection coordinates, but production tests should hand-write selection via `page.evaluate` for stability |

---

## Installation

```bash
# Core (new)
npm install -D @playwright/test canvas

# Install Chromium browser binary + system deps (run once locally, in every CI job)
npx playwright install --with-deps chromium

# Optional: API-key path for LLM exploratory mode (skip if using interactive Claude Code path)
# npm install -D @anthropic-ai/claude-agent-sdk
```

**Add to `package.json` scripts:**

```json
{
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:regression": "playwright test --grep @regression",
    "test:e2e:headed": "playwright test --headed",
    "test:e2e:codegen": "playwright codegen https://patents.google.com",
    "test:e2e:report": "playwright show-report"
  }
}
```

---

## Authentication / Subscription Question — Definitive Answer

The milestone goal says "LLM is Claude Code subscription, local-dev only" with the intent "I do NOT want to pay for API tokens." Research finding is unambiguous:

### What the official docs say

From the [Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview):

> "Get an API key from the Console, then set it as an environment variable: `export ANTHROPIC_API_KEY=your-api-key`"
>
> "**Unless previously approved, Anthropic does not allow third party developers to offer claude.ai login or rate limits for their products, including agents built on the Claude Agent SDK. Please use the API key authentication methods described in this document instead.**"

From [Run Claude Code programmatically](https://code.claude.com/docs/en/headless):

> "Bare mode skips OAuth and keychain reads. Anthropic authentication must come from `ANTHROPIC_API_KEY` or an `apiKeyHelper` in the JSON passed to `--settings`."

### What the Consumer ToS says (cited in [issue #36324](https://github.com/anthropics/claude-code/issues/36324)):

> "Except when you are accessing our Services via an Anthropic API Key or where we otherwise explicitly permit it, [you may not] access the Services through automated or non-human means, whether through a bot, script, or otherwise."

Issue #36324 was filed by a user warning others, after users reported account bans for running `claude -p` from cron/scripts against subscription accounts. The issue was closed-as-stale with no Anthropic response, but the underlying ToS clause remains in effect.

### Three viable paths — pick one

| Path | How it works | Tradeoff |
|------|--------------|----------|
| **A. Drop LLM mode entirely from v3.0** | Ship only deterministic regression + verifier. Add LLM exploratory mode in a future milestone if/when justified. | Simplest, ToS-clean, no new SDK dep. Loses the "fresh patents / unusual selections" coverage. |
| **B. Interactive Claude Code + Playwright MCP server** | User runs `claude` (interactive) locally, with `.mcp.json` registering `@playwright/mcp` as a server. The Playwright MCP server exposes browser tools; user types "find a recent biotech patent and exercise the extension with weird selections." Subscription is fine because the user is *interactively* driving it. | Cannot run unattended / cron / CI. ToS-clean. Zero API token cost. Recommended fit for "local-dev only" constraint. |
| **C. API-key Agent SDK** | Install `@anthropic-ai/claude-agent-sdk`, set `ANTHROPIC_API_KEY`. Run unattended. | Costs API tokens (~$5–20 per exploratory run depending on patent count and model). Fully ToS-compliant. |

**Recommendation:** Path B for v3.0. It directly satisfies "local-dev only" and "no API token cost" while keeping the user inside ToS. The exploratory agent isn't part of CI anyway (only deterministic regression is), so loss of unattended-mode is irrelevant to the cron requirement.

If the user later wants unattended exploratory runs, switch to Path C; the codepath is small (`@anthropic-ai/claude-agent-sdk` + custom MCP-tool exposing the harness).

---

## Loading the Extension — Canonical Pattern

This is the verbatim pattern from [the official Playwright Chrome extensions docs](https://playwright.dev/docs/chrome-extensions), adapted for this repo's `dist/chrome/` layout:

```typescript
// tests/e2e/fixtures.ts
import { test as base, chromium, type BrowserContext } from '@playwright/test';
import path from 'node:path';

export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
}>({
  context: async ({}, use) => {
    const pathToExtension = path.resolve(__dirname, '../../dist/chrome');
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',                    // REQUIRED for headless extension support
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
      ],
    });
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    // MV3: wait for the background service worker
    let [worker] = context.serviceWorkers();
    if (!worker) worker = await context.waitForEvent('serviceworker');
    const extensionId = worker.url().split('/')[2];
    await use(extensionId);
  },
});
export const expect = test.expect;
```

**Critical MV3 quirks** (per Playwright docs):
- Service workers suspend after ~30 s of inactivity. `evaluate()` calls in-flight at suspension throw `"Service worker restarted"` — wrap in retry.
- Service worker `Worker` handle stays valid across restarts (no new `serviceworker` event); existing message-passing code keeps working.
- Always wake the SW before asserting: trigger an event (open popup, send message, navigate to a matching URL) first.

---

## Closed-Mode Shadow DOM — Pre-Inject `attachShadow` Override

PROJECT.md confirms the extension uses **closed-mode Shadow DOM** for the citation UI. Playwright locators do not pierce closed shadow roots ([issue #23047](https://github.com/microsoft/playwright/issues/23047)). Standard workaround — inject before page scripts run:

```typescript
test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    const originalAttachShadow = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function (options) {
      return originalAttachShadow.call(this, { ...options, mode: 'open' });
    };
  });
});
```

After this, Playwright locators see the citation UI like any other DOM. **Verify this doesn't change extension behavior** — the override runs in the page context, but the extension's content script also runs there, so its `attachShadow` calls are intercepted. This should be transparent (closed mode is purely an external-access barrier, not a functional behavior), but add an assertion that the citation pill still renders and works correctly.

---

## Selection Simulation — Two Approaches

The extension reacts to `mouseup` after a text selection on Google Patents. Two ways to simulate this:

### Approach 1 (preferred): `page.evaluate` with Range API

```typescript
await page.evaluate(({ targetText }) => {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node: Text | null = null;
  while ((node = walker.nextNode() as Text | null)) {
    const idx = node.textContent?.indexOf(targetText) ?? -1;
    if (idx >= 0) {
      const range = document.createRange();
      range.setStart(node, idx);
      range.setEnd(node, idx + targetText.length);
      const sel = window.getSelection()!;
      sel.removeAllRanges();
      sel.addRange(range);
      // Fire mouseup to trigger extension content script
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      return true;
    }
  }
  return false;
}, { targetText });
```

**Pros:** deterministic, robust to layout changes, no coordinate math.
**Cons:** doesn't exercise the extension's real-world drag path. If the extension installs listeners on the *original* mouseup that look at `event.target`, the synthetic event may misbehave.

### Approach 2: real mouse drag

```typescript
const start = await page.locator('text=...').boundingBox();
const end = await page.locator('text=...').last().boundingBox();
await page.mouse.move(start.x, start.y);
await page.mouse.down();
await page.mouse.move(end.x, end.y, { steps: 10 });
await page.mouse.up();
```

**Pros:** exercises real selection codepath.
**Cons:** flaky — Google Patents layout drift breaks coordinates; selection often grabs wrong text.

**Recommendation:** Use Approach 1 as the default. Add a small number of Approach 2 tests covering "mouse drag still works end-to-end" as smoke tests.

---

## Independent PDF Verifier — Library Choice

| Option | Install footprint | Bug-parity risk vs. extension | Verdict |
|--------|-------------------|------------------------------|---------|
| **`pdfjs-dist` (legacy build, Node)** | Already a dep; +`canvas` if rendering | MEDIUM — same engine, but different invocation (Node vs. browser worker), different version possible, can pin separately. **Mitigate by writing the verifier with zero shared code with `src/shared/`.** | **RECOMMENDED** |
| `pdf-parse` | Small (~200 KB); wraps PDF.js | HIGH — itself uses pdf.js internally | Don't use — same engine, same bugs, no benefit |
| `pdftotext` (Poppler) via subprocess | Requires `apt-get install poppler-utils` in CI (~20 MB) | LOW — different C++ engine, different bugs | Reasonable choice if user wants maximum independence; +1 CI step, +1 system dep |
| `node-poppler` | Same as above, with JS wrapper | LOW | Same as `pdftotext`, no additional benefit |

### Why `pdfjs-dist` despite same engine

The "independent code path" goal can be satisfied by **process boundary, invocation surface, and zero shared code**, not by changing the engine. Concretely:

1. **No imports from `src/`** — the verifier lives in `tests/e2e/verifier/` and re-implements `getTextContent()` → column/line mapping from scratch using a deliberately simpler algorithm (e.g., "find text near the cited y-coordinate, accept if substring match within 3 lines").
2. **Different build** — verifier uses `pdfjs-dist/legacy/build/pdf.mjs` (Node-friendly); the extension uses the browser bundle.
3. **Different goals** — the extension produces a precise citation; the verifier only asks "does the selected text appear at roughly the cited column:line?". Different question, different algorithm.
4. **Same engine ≠ same bugs** — engine bugs in text extraction (e.g., character order, ligatures) affect both, but the *citation* algorithm is in `src/shared/matching.js`, which the verifier doesn't touch.

If maximum engine independence is later required, swap `pdfjs-dist` for `pdftotext` in the verifier with a one-line change (verifier exports a single `extractTextNearLine(pdf, col, line)` interface).

### Verifier sketch

```typescript
// tests/e2e/verifier/pdfVerifier.ts
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

export async function verifyCitation(
  pdfBuffer: ArrayBuffer,
  selectedText: string,
  citedColumn: number,
  citedLineStart: number,
  citedLineEnd: number,
): Promise<{ pass: boolean; reason?: string }> {
  const doc = await pdfjs.getDocument({ data: pdfBuffer }).promise;
  // Walk pages, group text items by y-coordinate (3pt tolerance — same as extension
  // but independently implemented here), find the column-N text run, slice lines
  // [citedLineStart, citedLineEnd], do a normalized substring match against
  // selectedText. Tolerance: whitespace-stripped substring match.
  // Return pass=true if found within ±2 lines of cited range.
}
```

---

## PDF Page Snippet for Failure Diagnostics

For the "PDF page snippet" artifact: crop the cited column:line region into a PNG.

**Pipeline:**

1. `pdfjs-dist` renders the cited page to a `node-canvas` Canvas at high DPI (200 DPI is plenty for a snippet).
2. Compute the bounding box from the position map (extension already knows pixel coords of the cited column:line).
3. `sharp().extract({ left, top, width, height }).png().toBuffer()` writes the crop.

**Code sketch:**

```typescript
import { createCanvas } from 'canvas';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import sharp from 'sharp';

async function snippet(pdfBuf: ArrayBuffer, pageNum: number, bbox: BBox) {
  const doc = await pdfjs.getDocument({ data: pdfBuf }).promise;
  const page = await doc.getPage(pageNum);
  const scale = 200 / 72;  // 200 DPI
  const vp = page.getViewport({ scale });
  const canvas = createCanvas(vp.width, vp.height);
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx as any, viewport: vp }).promise;
  const png = canvas.toBuffer('image/png');
  return sharp(png)
    .extract({
      left: Math.floor(bbox.x * scale),
      top: Math.floor(bbox.y * scale),
      width: Math.ceil(bbox.w * scale),
      height: Math.ceil(bbox.h * scale),
    })
    .png()
    .toBuffer();
}
```

**Why not `pdftoppm` + `sharp`?** Works, but adds a system dep (`poppler-utils`) to CI and another spawn. Pure-JS path keeps the GitHub Actions workflow identical to today's installs.

---

## GitHub Actions — CI Pattern Extension

Extending the existing `.github/workflows/ci.yml` pattern. Two adds:

1. **New nightly cron workflow** for the full E2E regression suite. Don't run E2E on every PR — too slow and Google Patents is a flaky upstream.
2. **Optional E2E step on PR** via `workflow_dispatch` for ad-hoc runs.

```yaml
# .github/workflows/e2e-nightly.yml
name: E2E Nightly

on:
  schedule:
    - cron: '0 7 * * *'   # 07:00 UTC daily
  workflow_dispatch:

permissions:
  contents: read
  issues: write           # for auto-filing failure issues

jobs:
  e2e:
    runs-on: ubuntu-latest
    timeout-minutes: 60
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: ${{ hashFiles('package-lock.json') != '' && 'npm' || '' }}
      - run: npm ci || npm install
      - run: npm run build
      - name: Install Playwright Chromium
        run: npx playwright install --with-deps chromium
      - name: Run E2E regression
        run: npm run test:e2e:regression
      - name: Upload Playwright report
        if: ${{ !cancelled() }}
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 30
      - name: Upload failure artifacts (screenshots, DOM, PDF snippets)
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: failure-diagnostics
          path: test-results/
          retention-days: 30
      - name: File issue on failure
        if: failure()
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: node scripts/file-failure-issue.mjs
```

**Notes:**
- **No `xvfb-run`** — `channel: 'chromium'` supports extensions in true headless mode since Playwright 1.49 (cited in [issue #33566](https://github.com/microsoft/playwright/issues/33566) and current docs).
- **Do NOT cache Playwright browser binaries** — official Playwright docs recommend against it: "the amount of time it takes to restore the cache is comparable to the time it takes to download the binaries."
- **`--with-deps`** installs the system libraries Chromium needs on Ubuntu. Without this, headless Chromium crashes on launch.
- Set `permissions: issues: write` only on the nightly job; keep PR/push runs read-only.

---

## Test Runner Choice — Playwright Runner vs. Vitest

The existing CI runs 4 named Vitest suites. The cleanest choice for v3.0:

| Option | Pro | Con |
|--------|-----|-----|
| **Playwright runner** (`playwright test`) | First-class fixtures, parallelism, trace viewer, screenshot diff, HTML report | New runner, separate `playwright.config.ts`, separate "Test — E2E" CI step |
| Vitest + manual Playwright | Reuses existing 4-suite pattern | No trace viewer, no HTML report, more boilerplate, no first-class fixtures |

**Recommendation:** Playwright runner. The diagnostic UX (trace viewer + HTML report) is the entire point of using Playwright for failure investigation. Don't fight the tool.

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Playwright | Puppeteer | Never for new projects in 2026 — Playwright is the modern fork, has the test runner, multi-browser support, and better extension support. Puppeteer would be a regression. |
| Playwright | Cypress | Locked-decision: Playwright wins (cited in milestone constraints). Cypress can't load unpacked MV3 extensions cleanly. |
| Playwright | Selenium / WebDriver | Locked-decision: rejected. WebDriver protocol has limited MV3 extension support and worse DX. |
| `pdfjs-dist` (Node) | `pdftotext` (Poppler) | Use Poppler if you later need stronger engine independence in the verifier. Costs +1 system dep in CI. |
| Pure `pdfjs-dist` + `sharp` for snippets | `pdftoppm` + `sharp` | Use `pdftoppm` only if `node-canvas` install proves problematic (it requires libcairo/libpango system libs, which `playwright install --with-deps` already pulls in, so this is a non-issue). |
| Path B (interactive + Playwright MCP) for LLM mode | Path C (Agent SDK + API key) | Use Path C if user later wants unattended/cron exploratory runs and accepts the ~$5–20/run cost. |
| Playwright runner | Vitest orchestrating Playwright | Stick with Vitest only if "all tests must be in the same runner" is a hard requirement — but the diagnostic UX loss isn't worth it. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `puppeteer` | Older, less-maintained, worse extension support, no first-class test runner | Playwright |
| `cypress` | Cannot reliably load unpacked MV3 extensions; ToS-locked behavior model | Playwright |
| `selenium-webdriver` | WebDriver protocol has anemic extension support; flaky for MV3 | Playwright |
| `pdf-parse` for the verifier | Wraps pdfjs internally — same engine, same bugs, no independence gained | `pdfjs-dist` direct (process+code isolation) or `pdftotext` if true engine independence is needed |
| Caching `~/.cache/ms-playwright` in CI | Official Playwright docs say cache time ≈ download time; net zero benefit, +1 failure mode | Just `npx playwright install --with-deps chromium` on every run |
| `claude -p` (Claude Code CLI) against a subscription | Anthropic Consumer ToS forbids non-API-key automation; reports of account bans | Interactive Claude Code + Playwright MCP server (Path B) OR API key + Agent SDK (Path C) |
| `xvfb-run` for Chrome extensions | Not needed in Playwright 1.49+ with `channel: 'chromium'`; adds CI complexity | Plain headless with `channel: 'chromium'` |
| `headless: 'new'` flag-style invocation | Old shape; `channel: 'chromium'` is the modern, working approach | `channel: 'chromium'` |
| `webextension-polyfill` for tests | Same reason it's avoided in production — Firefox not under test in v3.0 | Native `chrome.*` (Chromium-only in this milestone) |

---

## Stack Patterns by Variant

**If user accepts paying for API tokens (Path C):**
- Add `@anthropic-ai/claude-agent-sdk` to devDependencies
- Set `ANTHROPIC_API_KEY` in `.env.local` (gitignored) and as GitHub secret if used in cron
- Expose Playwright harness as in-process MCP tools (`mcpServers` option in `ClaudeAgentOptions`)
- Can run exploratory mode in cron alongside deterministic regression

**If user wants ToS-clean / zero-cost LLM mode (Path B — recommended):**
- Do NOT install `@anthropic-ai/claude-agent-sdk`
- Add a `.mcp.json` at repo root registering Playwright MCP: `{ "mcpServers": { "playwright": { "command": "npx", "args": ["@playwright/mcp@latest"] } } }`
- Document a `make exploratory` or `npm run exploratory:setup` that prints "Run `claude` in this directory and ask it to exercise the extension via the playwright tools"
- Exploratory mode lives entirely outside CI

**If user drops LLM mode (Path A):**
- No new dependencies beyond Playwright + canvas
- Simplest. Recommend this if exploratory mode isn't proving its value within first month of v3.0.

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `@playwright/test@1.60.0` | Node 18+ | Repo already on Node 22 — fine |
| `pdfjs-dist@5.x` | Node 22+ (uses `Promise.withResolvers`) | Repo already on Node 22 — fine. **Pin major version** to prevent surprise breaking changes. |
| `canvas@3.x` | Node 18+ | Requires system libs (cairo, pango, libjpeg). On `ubuntu-latest`, `npx playwright install --with-deps` pulls these in. Locally, may need `apt-get install libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev`. |
| `@anthropic-ai/claude-agent-sdk@0.2.140` | Node 18+; Claude Opus 4.7 requires SDK ≥ 0.2.111 | Only if Path C chosen |
| Playwright Chromium 148 | Chrome MV3 extension API as of 2026-05 | Extension's `chrome.action`, `chrome.storage`, `chrome.runtime.onMessage` all supported |

---

## Integration Points with Existing Repo

| Existing Component | How v3.0 Integrates |
|--------------------|---------------------|
| `dist/chrome/` (esbuild output) | Playwright loads it with `--load-extension` — no extension code changes |
| `scripts/build.js` | Run before E2E: `npm run build && npm run test:e2e` |
| `vitest.config.*.js` | Untouched. Playwright uses its own `playwright.config.ts` |
| `.github/workflows/ci.yml` | Untouched. Add new `e2e-nightly.yml`. Optionally add `workflow_dispatch` E2E trigger |
| `tests/golden/` (the 76 golden patents corpus) | Reused as input to deterministic regression — each entry becomes one Playwright test case |
| `src/shared/matching.js` | Untouched. Verifier deliberately doesn't import it |
| `pdfjs-dist` (already in deps) | Reused in verifier via `pdfjs-dist/legacy/build/pdf.mjs` (different entry point than extension uses) |
| `sharp` (already in deps) | Reused for PDF snippet cropping |
| `CLOUDFLARE` worker + KV | Not relevant to v3.0 — verifier fetches PDFs directly from Google Patents / USPTO, not through the cache |

---

## Sources

- [Playwright Chrome Extensions docs](https://playwright.dev/docs/chrome-extensions) — HIGH confidence: official, current docs for `launchPersistentContext` + extension loading + MV3 SW lifecycle
- [Playwright CI docs](https://playwright.dev/docs/ci) — HIGH: install pattern, "no caching" recommendation, artifact upload
- [Playwright release notes / v1.60.0](https://github.com/microsoft/playwright/releases) — HIGH: confirmed latest stable May 11, 2026
- [Playwright issue #33566](https://github.com/microsoft/playwright/issues/33566) — MEDIUM: new Chromium headless behavior in 1.49+
- [Playwright issue #23047](https://github.com/microsoft/playwright/issues/23047) — HIGH: closed-shadow-DOM limitation acknowledged by Playwright team
- [Claude Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview) — HIGH: explicit policy that subscription/claude.ai login is not permitted for SDK use; API key required
- [Run Claude Code programmatically](https://code.claude.com/docs/en/headless) — HIGH: `--bare` mode requires `ANTHROPIC_API_KEY`; explicit documentation
- [Claude Code issue #36324](https://github.com/anthropics/claude-code/issues/36324) — MEDIUM: user reports of subscription bans for `claude -p` use, citing Consumer ToS clause. Issue closed stale with no Anthropic counter-statement.
- [pdfjs-dist npm](https://www.npmjs.com/package/pdfjs-dist) — HIGH: v5.7.284 current, Node 22+ requirement
- [PkgPulse comparison: unpdf vs pdf-parse vs pdfjs-dist (2026)](https://www.pkgpulse.com/blog/unpdf-vs-pdf-parse-vs-pdfjs-dist-pdf-parsing-extraction-nodejs-2026) — MEDIUM: third-party survey of Node PDF libs
- [unpdf (unjs)](https://github.com/unjs/unpdf) — MEDIUM: another wrapper option (not recommended here, but cataloged)
- [Anthropic Consumer Terms](https://www.anthropic.com/legal/consumer-terms) — HIGH: ToS clause on automated access

---

*Stack research for: Autonomous E2E Testing Agent for Chrome MV3 Patent Citation Extension*
*Researched: 2026-05-12*

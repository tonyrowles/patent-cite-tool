# Patent Citation Tool

Chrome and Firefox extensions, plus a standalone webapp, that generate precise column/line citations from highlighted text on Google Patents. Built for patent attorneys, patent agents, and IP professionals who need accurate citation references during prosecution.

Highlight text in a patent specification → get a formatted citation like `Col. 5, ll. 12-14` instantly. No PDF downloads, no manual counting.

Project overview and demo: [Patent Citation Tool for Google Patents](https://tonyrowles.com/projects/patent-cite-tool/).

## Features

- **Column/line citations** for granted US patents — maps highlighted text to the correct column and line numbers from the patent PDF
- **Paragraph citations** for published US applications — uses DOM paragraph markers, no PDF needed
- **Four trigger modes** — floating button, automatic, right-click context menu, or silent Ctrl+C
- **Silent clipboard mode** — Ctrl+C on highlighted text appends the citation to your clipboard with toast feedback
- **Three-state toolbar icon** — gray (not a patent page), amber (patent detected, parsing), blue (ready to cite)
- **Server-side cache** — operator-prepared position maps in Cloudflare KV speed up supported lookups; cache misses are parsed locally
- **USPTO fallback** — if Google's PDF CDN is unavailable, falls back to USPTO eGrant API via Cloudflare Worker proxy
- **Options page** — configurable trigger mode, display mode, and optional patent number prefix

## Install

### From the Chrome Web Store

*(Coming soon)*

### From source

1. Clone this repository and follow the development setup below.
2. Run `npm run build:chrome`.
3. Open `chrome://extensions/` in Chrome and enable **Developer mode**.
4. Click **Load unpacked** and select `dist/chrome/`.

For Firefox, run `npm run build:firefox` and load `dist/firefox/manifest.json` through `about:debugging`. The standalone webapp is at [cite.tonyrowles.com](https://cite.tonyrowles.com).

## How It Works

1. Navigate to a US patent on [Google Patents](https://patents.google.com) (e.g., `patents.google.com/patent/US11427642`)
2. The extension detects the patent page and fetches the PDF
3. PDF.js runs in an [offscreen document](https://developer.chrome.com/docs/extensions/reference/api/offscreen) to extract text positions and build a column/line map
4. Highlight any text in the specification
5. The extension maps your selection to the PDF coordinates and produces a citation

**For published applications** (e.g., `US20230123456`), citations use paragraph numbers from the DOM — no PDF processing needed.

## Project Structure

```
src/
├── background/        Service worker — orchestrates PDF fetch, cache, icon state
├── content/           Content scripts — text matching, citation UI, paragraph finder
├── offscreen/         Offscreen document — PDF.js parsing, position map builder
├── options/           Options page — settings with auto-save
├── popup/             Popup — status display with link to settings
├── shared/            Matching, PDF parsing, reporting, and shared constants
├── icons/             Icon PNGs (3 states × 4 sizes) and source SVG
├── lib/               PDF.js library (pdf.mjs + pdf.worker.mjs)
└── manifest.json
worker/                Cloudflare Worker — USPTO API proxy and KV cache
scripts/               Dev tools — fixture generation, icon generation, accuracy reports
tests/                 Vitest test suite — patent corpus with golden baseline
docs/privacy/          Privacy policy (GitHub Pages)
```

## Development

### Prerequisites

- Node.js 22.13+ (Node 22 LTS recommended)
- npm

### Setup

```bash
npm ci
npm --prefix worker ci
```

Extension builds require `PROXY_TOKEN`. Add `PROXY_TOKEN=<your Worker token>` to a git-ignored root `.env`, or export it in your shell. For local unit tests only, `PROXY_TOKEN=test-proxy-token` is sufficient; that placeholder does not authenticate live Worker requests. The webapp build (`npm run build:webapp`) requires no token.

Git attributes enforce LF line endings so Windows checkouts preserve source-hash guards.

### Tests

```bash
npm test                  # Builds, source/dist tests, ESLint, and Firefox validation
npm --prefix worker test  # Worker integration tests (separate dependency tree)
npm run build:webapp      # Standalone webapp build
npm run accuracy-report   # Per-category accuracy breakdown
```

### Scripts

```bash
npm run generate-icons    # Regenerate icon PNGs from source SVG
npm run update-golden     # Update golden baseline (requires --confirm)
npm run accuracy-report -- --compare   # Compare against pre-fix baseline
```

### Automation maintenance

Weekly digests publish an `e2e-digest` issue and retain Markdown reports and bypass audits as Actions artifacts for 90 days. They do not push directly to protected `main`.

Dependency scans retain review reports. They create draft PRs only when the Actions pull-request policy can be confirmed as enabled; otherwise the artifact is available for manual review. Nightly builds use the repository's `PROXY_TOKEN` secret. The required dependency gate runs blocking smoke and rotating regression tests on every PR with a placeholder token, so PR code never receives the production secret; Google PDF download and local parsing are exercised, while authenticated USPTO fallback requires a separate trusted run.

A disabled workflow stays disabled until the maintainer intentionally enables it. In particular, `deps-update-gate` is a required check, so the dependency workflow must be enabled before merging PRs. The retired v4.3 autonomous machinery must not be restored. v6.1 report fixes run locally through `npm run fix-report -- <issue-number>`; CI only supplies verification and notification.

Firefox validation calls Mozilla's `addons-linter` directly, with the same PDF.js library exclusion used by `web-ext lint`. Both dependency trees are locked; run `npm audit` and `npm --prefix worker audit` when updating them. The Worker overrides for `sharp` and `undici` select patched releases while upstream Cloudflare test tooling still pins older versions.

### Cloudflare Worker

The `worker/` directory contains a Cloudflare Worker that proxies USPTO eGrant API requests and manages a shared KV cache. Browser clients read trusted maps; they cannot write shared records. Operators populate, replace, or delete maps using a separate `CACHE_WRITE_TOKEN` secret that must differ from `PROXY_TOKEN` and must never be included in browser builds. Maps expire after 30 days. See [cache operations](docs/cache-operations.md) for setup, repair commands, and rollout order, and `worker/wrangler.toml` for configuration.

## Permissions

| Permission | Why |
|---|---|
| `declarativeContent` | Activate only on Google Patents pages |
| `offscreen` | Run PDF.js in a hidden document (needs DOM APIs unavailable in service workers) |
| `activeTab` | Read the current tab URL to extract the patent number |
| `storage` | Persist user preferences across sessions |
| `contextMenus` | "Generate Citation" right-click menu item |
| `clipboardWrite` | Copy the citation to clipboard |
| `patentimages.storage.googleapis.com` | Download patent PDFs from Google's public CDN |
| `pct.tonyrowles.com` | Fetch cached position maps from first-party Cloudflare KV |

## Privacy

Normal citation use collects no personal information and uses no analytics or tracking. Three preferences are synced through browser storage, and patent position maps contain only public document data. If you submit a voluntary bug report, diagnostic fields and any optional selection text or note are stored in Cloudflare KV for 90 days and a notification is sent to a maintainer Discord channel. Pending reports and retry metadata are also stored locally until delivery or expiry.

Full privacy policy: [tonyrowles.github.io/patent-cite-tool/privacy](https://tonyrowles.github.io/patent-cite-tool/privacy)

## License

[MIT](LICENSE)

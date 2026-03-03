# Patent Citation Tool

A Chrome extension that generates precise column/line citations from highlighted text on Google Patents. Built for patent attorneys, patent agents, and IP professionals who need accurate citation references during prosecution.

Highlight text in a patent specification → get a formatted citation like `Col. 5, ll. 12-14` instantly. No PDF downloads, no manual counting.

## Features

- **Column/line citations** for granted US patents — maps highlighted text to the correct column and line numbers from the patent PDF
- **Paragraph citations** for published US applications — uses DOM paragraph markers, no PDF needed
- **Four trigger modes** — floating button, automatic, right-click context menu, or silent Ctrl+C
- **Silent clipboard mode** — Ctrl+C on highlighted text appends the citation to your clipboard with toast feedback
- **Three-state toolbar icon** — gray (not a patent page), amber (patent detected, parsing), blue (ready to cite)
- **Server-side cache** — parsed position maps are cached via Cloudflare KV so repeat lookups are instant
- **USPTO fallback** — if Google's PDF CDN is unavailable, falls back to USPTO eGrant API via Cloudflare Worker proxy
- **Options page** — configurable trigger mode, display mode, and optional patent number prefix

## Install

### From the Chrome Web Store

*(Coming soon)*

### From source

1. Clone this repository
2. Open `chrome://extensions/` in Chrome
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** and select the `src/` directory

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
├── shared/            Shared constants
├── icons/             Icon PNGs (3 states × 4 sizes) and source SVG
├── lib/               PDF.js library (pdf.mjs + pdf.worker.mjs)
└── manifest.json
worker/                Cloudflare Worker — USPTO API proxy and KV cache
scripts/               Dev tools — fixture generation, icon generation, accuracy reports
tests/                 Vitest test suite — 71-case patent corpus with golden baseline
docs/privacy/          Privacy policy (GitHub Pages)
```

## Development

### Prerequisites

- Node.js 18+
- npm

### Setup

```bash
npm install
```

### Tests

```bash
npm test                  # Run full test suite (95 tests)
npm run accuracy-report   # Per-category accuracy breakdown
```

### Scripts

```bash
npm run generate-icons    # Regenerate icon PNGs from source SVG
npm run update-golden     # Update golden baseline (requires --confirm)
npm run accuracy-report -- --compare   # Compare against pre-fix baseline
```

### Cloudflare Worker

The `worker/` directory contains a Cloudflare Worker that proxies USPTO eGrant API requests and manages a shared KV cache. See `worker/wrangler.toml` for configuration.

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

No personal data is collected. The only stored data is three preference settings in `chrome.storage.sync`. Patent position maps are cached on first-party Cloudflare KV infrastructure — no third-party analytics or tracking.

Full privacy policy: [tonyrowles.github.io/patent-cite-tool/privacy](https://tonyrowles.github.io/patent-cite-tool/privacy)

## License

[MIT](LICENSE)

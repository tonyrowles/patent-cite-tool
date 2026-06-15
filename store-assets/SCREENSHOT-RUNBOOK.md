# Store graphics runbook — screenshot + promo tile

Two graphics are needed for the store listings. The **promo tile is already generated**;
the **screenshot is the one manual step** (it needs the live extension showing a real
citation). Copy text/justifications come from `store-listing.md`.

| Asset | Size | Status |
|-------|------|--------|
| Promo tile (CWS) | 440×280 PNG | ✅ `promo-tile-440x280.png` — generated; regenerate with `node scripts/make-promo-tile.mjs` |
| Screenshot (CWS + AMO, ≥1) | 1280×800 PNG | ⬜ capture below → `screenshot-1280x800.png` |

---

## Screenshot — 1280×800 (the hero image)

Goal: one clean shot of the **citation overlay on a Google Patents page** — the selected
spec text plus the resulting citation (e.g. "Col. 5, ll. 12-14"). Use a **successful,
confident (green) citation**, not a no-match.

### Prep
1. Build + load the extension (if not already):
   ```bash
   npm run build
   ```
   Chrome → `chrome://extensions` → Developer mode → **Load unpacked** → select `dist/chrome/`.
2. Open a real granted US patent with a solid specification, e.g.
   `https://patents.google.com/patent/US11321123` (or any `US…B2` you like).
3. Wait for the toolbar icon to turn **active** (the position map finished parsing — the
   icon goes from gray to colored). If it stays gray, give it a few seconds or reload.

### Capture at exact 1280×800 (DevTools device toolbar — most reliable)
4. `F12` → **Toggle device toolbar** (`Ctrl+Shift+M` / `Cmd+Shift+M`).
5. In the device bar, choose **Responsive** and type the dimensions **1280 × 800**.
   (Set zoom to 100% / DPR 1 so the capture is exactly 1280×800.)
6. In the patent's **Description** or **Claims**, select a sentence/phrase to trigger the
   citation. The overlay/floating button appears with the column·line reference.
   - Aim for a tidy selection where both the highlighted text **and** the citation overlay
     are visible in frame.
7. DevTools **⋮ menu → "Capture screenshot"** (captures exactly the 1280×800 viewport).
8. Save as `store-assets/screenshot-1280x800.png`.

### Verify
```bash
node -e "const b=require('fs').readFileSync('store-assets/screenshot-1280x800.png'); console.log(b.readUInt32BE(16)+'x'+b.readUInt32BE(20))"
# → 1280x800
```

### Tips
- Pick a patent + selection that yields a **green/confident** citation for the hero.
- Light mode; avoid capturing personal bookmarks/extensions in frame (DevTools capture only
  grabs the page viewport, so this is usually clean).
- Optional: capture 2–3 shots (e.g. tooltip mode vs side-panel display mode — toggle in the
  extension options) for a richer listing. Name extras `screenshot-1280x800-2.png`, etc.
- The same 1280×800 image works for both the Chrome Web Store and Firefox AMO listings.

### Fallback (no DevTools)
Resize the browser window large, take an OS screenshot of the page region, and crop to
exactly 1280×800 in any image editor.

---

## Then submit
With `screenshot-1280x800.png` and `promo-tile-440x280.png` in `store-assets/`, follow the
**Submission Checklist** in `store-listing.md`:
- **Chrome Web Store**: upload `patent-cite-tool-chrome-v5.0.0.zip` + paste listing/privacy
  fields + tick data-use **Website Content + User activity** + Remote code **No**.
- **Firefox AMO**: upload `patent-cite-tool-firefox-v5.0.0.zip` (separate submission).

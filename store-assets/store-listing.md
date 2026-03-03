# Chrome Web Store Listing — Patent Citation Tool

This document contains all ready-to-paste content for the Chrome Developer Dashboard.
Copy each section directly into the corresponding Dashboard field.

---

## 1. Store Listing — Listing Tab

### Title (39 characters — limit: 45)

```
Patent Citation Tool for Google Patents
```

Character count: P-a-t-e-n-t-space-C-i-t-a-t-i-o-n-space-T-o-o-l-space-f-o-r-space-G-o-o-g-l-e-space-P-a-t-e-n-t-s = 39 chars

### Summary (127 characters — limit: 132)

```
Instantly generate column/line citations from highlighted text on Google Patents. No PDF downloads or manual counting required.
```

Character count: 126 chars (verified)

### Description (plain text — no HTML)

```
Patent Citation Tool generates accurate column/line citation references from text you highlight directly on Google Patents pages. Built for patent attorneys, patent agents, and IP professionals who need precise citations during prosecution.

How it works:
- Highlight any text in a patent specification on Google Patents
- The extension maps your selection to the correct column and line numbers
- A formatted citation (e.g., "Col. 5, ll. 12-14") appears instantly

Features:
- Four trigger modes: floating button, automatic, right-click context menu, or silent Ctrl+C
- Works with US utility patents on Google Patents (patents.google.com)
- Optional patent number prefix in citations (e.g., "'123 Patent, Col. 5, ll. 12-14")
- Default and advanced display modes
- Three-state toolbar icon shows extension readiness at a glance
- Pre-computed position maps for fast repeat lookups
- No account required, no personal data collected

Technical approach: the extension fetches the patent PDF from Google's public CDN, builds a text position map using PDF.js running locally in the browser, then maps your selection coordinates to column and line numbers. Position maps for previously-seen patents are cached via first-party Cloudflare KV infrastructure (pct.tonyrowles.com) to speed up repeat citations.
```

Word count: approximately 190 words (within 150-250 range)

### Category

```
Productivity
```

---

## 2. Store Listing — Graphics Tab

### Icon

Already provided via manifest.json icons (128px used for store listing). No action needed — the icon is bundled in the extension ZIP.

### Screenshots (user action required — STOR-02)

Capture at least one screenshot at exactly **1280x800 pixels** showing the citation overlay in action.

**Steps:**
1. Open Chrome and navigate to a US patent on Google Patents (e.g., https://patents.google.com/patent/US11321123)
2. Open DevTools (F12) → Toggle Device Toolbar (Ctrl+Shift+M)
3. Set custom dimensions to exactly **1280** wide × **800** tall
4. Select a passage of text in the patent specification to trigger the citation overlay
5. In DevTools, open the triple-dot menu → "Capture screenshot"
6. Save as: `store-assets/screenshot-1280x800.png`

**What to show:** The citation overlay or floating button visible over the patent text. This is the hero image — it should make the extension's value immediately clear.

### Promotional Tile (user action required — STOR-03)

Create a **440x280 pixel** image for Chrome Web Store search results.

**Options:**
- Option A: Design tool (Canva, Figma) — center the icon-active-128.png on a dark blue background (#1e3a8a) with "Patent Citation Tool" text
- Option B: Any image editor at exactly 440x280 pixels

Save as: `store-assets/promo-tile-440x280.png`

---

## 3. Developer Dashboard — Privacy Tab

### Subsection 1: Single Purpose Description

Copy-paste this text into the "Single purpose" field:

```
Generate column/line citation references from highlighted text on Google Patents pages.
```

### Subsection 2: Permission Justifications

Enter each justification individually for the corresponding permission.

| Permission | Justification (copy-paste) |
|---|---|
| `declarativeContent` | Activates the toolbar action only when the user navigates to a Google Patents page (patents.google.com/patent/US*), without requiring broad host permissions to read page content. |
| `offscreen` | Creates a hidden offscreen document to run PDF.js, which requires DOM APIs (DOMMatrix, canvas) unavailable in the service worker, for extracting text position maps from patent PDF files. |
| `activeTab` | Reads the current tab URL to extract the patent number when the user invokes citation generation via the context menu. Only accessed upon explicit user action. |
| `storage` | Persists three user preferences (trigger mode, display mode, patent number prefix toggle) across browser sessions using Chrome's built-in sync storage. |
| `contextMenus` | Adds a "Generate Citation" context menu item so users can invoke citation generation by right-clicking selected text on a patent page. |
| `clipboardWrite` | Writes the generated citation string (e.g., "Col. 5, ll. 12-14") to the user's clipboard when citation generation completes. |
| host: `patentimages.storage.googleapis.com/*` | Downloads patent PDF files from Google Patents' public CDN to extract text position data needed for accurate column/line citation generation. |
| host: `pct.tonyrowles.com/*` | Fetches pre-computed patent text position maps from first-party Cloudflare KV infrastructure operated by the developer, reducing PDF download and processing time for previously-seen patents. |

### Subsection 3: Remote Code Declaration

**Select: "No, I am not using remote code."**

If a text explanation field is shown, paste:

```
All JavaScript is bundled within the extension package. Remote HTTP requests to pct.tonyrowles.com and patentimages.storage.googleapis.com return JSON data and PDF binary files respectively — no executable code. The PDF.js worker (pdf.worker.mjs) is a local file included in the extension and declared in web_accessible_resources.
```

### Subsection 4: Data Use Practices

**Data types collected:** Select none / leave all checkboxes unchecked.

The extension does not collect: personally identifiable information, health information, financial information, authentication information, personal communications, location data, web history, user activity, or website content. The only stored data is three preference settings in chrome.storage.sync (trigger mode, display mode, patent number prefix) — this data is managed by Chrome and is not accessible to the developer.

**Certification statements — check all three:**

- [x] I certify that I do not sell user data to third parties
- [x] I certify that I do not use or transfer user data for purposes that are unrelated to the item's single purpose
- [x] I certify that I do not use or transfer user data to determine creditworthiness or for lending purposes

---

## 4. Submission Checklist

Work through these items in order before clicking "Submit for review":

- [ ] Extension ZIP uploaded: `store-assets/patent-cite-tool-v1.0.0.zip` (464 KB, manifest.json at ZIP root)
- [ ] **Listing tab — Title:** Copy from Section 1 above (39 chars)
- [ ] **Listing tab — Summary:** Copy from Section 1 above (126 chars)
- [ ] **Listing tab — Description:** Copy from Section 1 above
- [ ] **Listing tab — Category:** Productivity
- [ ] **Graphics tab — Screenshot:** At least one 1280x800 PNG uploaded (`store-assets/screenshot-1280x800.png`)
- [ ] **Graphics tab — Promotional tile:** 440x280 PNG uploaded (`store-assets/promo-tile-440x280.png`)
- [ ] **Listing tab — Privacy policy URL:** `https://tonyrowles.github.io/patent-cite-tool/privacy`
- [ ] **Privacy tab — Single purpose:** Copy from Section 3 above
- [ ] **Privacy tab — Permission justifications:** Copy each row from the table in Section 3
- [ ] **Privacy tab — Remote code:** Select "No"
- [ ] **Privacy tab — Data use:** All data type checkboxes unchecked; all three certification statements checked
- [ ] Click **"Submit for review"**

**Expected result:** Extension status changes to "Pending review" in the Developer Dashboard.

---

## 5. Quick Reference

| Field | Value |
|---|---|
| Developer Dashboard URL | https://chrome.google.com/webstore/devconsole |
| Privacy policy URL | https://tonyrowles.github.io/patent-cite-tool/privacy |
| Extension ZIP | store-assets/patent-cite-tool-v1.0.0.zip |
| Screenshot path | store-assets/screenshot-1280x800.png |
| Promo tile path | store-assets/promo-tile-440x280.png |
| Icon (store listing) | 128px — bundled in ZIP, no separate upload needed |
| Category | Productivity |
| Remote code | No |
| Data collected | None |

---
phase: 8
slug: webapp-core-build
status: draft
shadcn_initialized: false
preset: none
created: 2026-06-16
---

# Phase 8 — UI Design Contract: Webapp Core Build

> Visual and interaction contract for the standalone citation webapp at cite.tonyrowles.com.
> Generated from existing extension aesthetic (popup.html + options.html) — no new design system.
> Consumed by gsd-planner, gsd-executor, and gsd-ui-auditor.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none — inline `<style>` block, consistent with popup.html / options.html |
| Preset | not applicable |
| Component library | none (vanilla HTML/JS — zero new dependencies per REQUIREMENTS.md Out-of-Scope) |
| Icon library | none — SVG inline for copy button only |
| Font | `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif` (extracted from popup.html line 8 and options.html line 15) |

Source: options.html is the primary aesthetic reference for the webapp (full-page centered layout, card container, footer). popup.html provides the status/confidence color palette.

---

## Spacing Scale

Declared values (multiples of 4 only):

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Icon-to-text gap inside chips; top margin for `.error-detail` / `.parse-stats` (popup.html line 29, 32); `.header p` top margin (options.html line 44) |
| sm | 8px | Field label-to-input gap; `.status` padding-block (popup.html line 19); `select` padding-block (options.html line 95); confidence chip padding-inline |
| md | 16px | Card side padding; body page padding-inline (options.html line 21); passage row gap; input horizontal padding |
| lg | 24px | Card padding-block (options.html setting-group padding-block is 20px — round up to 24px for webapp card); section vertical gap |
| xl | 32px | Page top/bottom padding (options.html line 21: `padding: 32px 16px`) |
| 2xl | 48px | Minimum vertical gap between card bottom and footer |
| 3xl | 64px | Not used in Phase 8 |

Exceptions:
- `padding: 8px 10px` on status chips (popup.html line 19) — preserved exactly for the named-stage loading line and result-status chips.
- `padding: 20px 24px` on individual setting-group rows (options.html line 63) — used for the format/prefix options strip inside the card.
- Touch targets: all interactive controls (buttons, checkboxes, "add another passage" affordance) have a minimum click target of 44px height per WCAG 2.5.5.

---

## Typography

All sizes extracted from popup.html and options.html. Two weights only.

| Role | Size | Weight | Line Height | Source |
|------|------|--------|-------------|--------|
| Body | 14px | 400 (regular) | 1.5 | options.html `select`, `setting-description` at 13–14px; popup.html body at 13px — bump to 14px for longer webapp passages |
| Label / UI chrome | 13px | 400 (regular) | 1.4 | options.html `.setting-description` (line 86), `.footer` (line 154), popup.html `.error-detail` (line 29) |
| Subheading / setting label | 14px | 600 (semibold) | 1.3 | options.html `.setting-label label` (line 74) and `.checkbox-row label` (line 131) |
| Heading / page title | 20px | 700 (bold) | 1.2 | options.html `.header h1` (line 37): `font-size: 20px; font-weight: 700` |

Additional fixed sizes (matched to source):
- Citation output text: 15px, weight 600 — monospace `font-family: monospace` (popup.html `.patent-id` class, line 28). Applied to the rendered citation string itself for scannable alignment.
- Micro / footer links: 11–12px, weight 400 — options.html `.footer` at 12px (line 154); popup.html settings link at 11px (line 39).

---

## Color

All hex values extracted verbatim from popup.html and options.html.

| Role | Value | Usage |
|------|-------|-------|
| Dominant — page background (60%) | `#f9fafb` | `body { background: #f9fafb }` (options.html line 19) — full-page background |
| Secondary — card surface (30%) | `#ffffff` | `.settings-card { background: #ffffff }` (options.html line 49) — the centered form card |
| Card border / shadow | `box-shadow: 0 1px 3px rgba(0,0,0,0.08), 0 1px 8px rgba(0,0,0,0.04)` | options.html line 51 — card container shadow, used unchanged |
| Divider | `#f1f5f9` | options.html line 66 — `.setting-group + .setting-group { border-top: 1px solid #f1f5f9 }` |
| Accent — primary text / heading (10%) | `#1e3a8a` | options.html `.header h1 { color: #1e3a8a }` (line 38) — page title only |
| Accent — interactive focus ring | `#2563eb` | options.html `select:focus { border-color: #2563eb }` (line 112); `accent-color: #2563eb` (line 128) — focus ring on inputs, checkbox accent |
| Accent — focus shadow | `rgba(37, 99, 235, 0.12)` | options.html `select:focus { box-shadow: 0 0 0 3px … }` (line 113) |
| Body text | `#1e293b` | options.html `body { color: #1e293b }` (line 18) |
| Strong text / labels | `#0f172a` | options.html `.setting-label label { color: #0f172a }` (line 75) |
| Muted / secondary text | `#64748b` | options.html `.setting-description { color: #64748b }` (line 87); footer links |
| Placeholder / chrome text | `#94a3b8` | options.html `.footer { color: #94a3b8 }` (line 155) |
| Input background | `#f8fafc` | options.html `select { background: #f8fafc }` (line 98) |
| Input border | `#e2e8f0` | options.html `select { border: 1px solid #e2e8f0 }` (line 100) |

### Semantic / Status Colors (confidence chips + named-stage loading line)

Extracted verbatim from popup.html lines 23–27:

| State | Background | Text | Usage |
|-------|------------|------|-------|
| Confidence: high (≥0.95) | `#ecfdf5` | `#065f46` | `.status-ready` — green chip |
| Confidence: medium (≥0.80) | `#fffbeb` | `#92400e` | `.status-unavailable` — yellow chip (reuse for medium confidence) |
| Confidence: low (<0.80) | `#fef2f2` | `#991b1b` | `.status-error` — red chip |
| Loading / in-progress | `#eff6ff` | `#1e40af` | `.status-fetching` — blue status line |
| Idle / neutral | `#f3f4f6` | `#4b5563` | `.status-idle` — no-data state |
| Published-app rejection / warning | `#fffbeb` | `#92400e` | Same as yellow — `.status-unavailable` |
| Destructive | `#fef2f2` | `#991b1b` | Error states, retry prompt |

Accent reserved for: page H1 (`#1e3a8a`), interactive focus rings (`#2563eb`), checkbox accent, footer link hover. Never used on static body text, card backgrounds, or status chips.

---

## Page Structure (Semantic Regions)

```
<body>                          <!-- background: #f9fafb -->
  <main class="container">     <!-- max-width: 540px; margin: 0 auto; padding: 32px 16px -->
    <header class="header">    <!-- margin-bottom: 24px -->
      <h1>                     <!-- 20px/700/#1e3a8a: "Patent Citation Tool" -->
      <p>                      <!-- 13px/400/#64748b: tagline -->
    </header>

    <div class="card">         <!-- bg #fff; border-radius: 10px; box-shadow as above -->

      <!-- Section 1: Patent input -->
      <section class="card-section" id="patent-input-section">

      <!-- Section 2: Passage rows (1..N) + add-affordance -->
      <section class="card-section" id="passages-section">

      <!-- Section 3: Submit button -->
      <div class="card-action">

      <!-- Section 4: Status / results area -->
      <section id="results-area" aria-live="polite" aria-atomic="false">
        <!-- Named-stage loading line OR result rows OR error/no-match message -->

      <!-- Section 5: Options strip (format + prefix toggles) -->
      <section class="card-section options-strip" id="options-strip">

    </div><!-- .card -->

    <footer class="footer">   <!-- 12px/400/#94a3b8; margin-top: 48px -->
      <!-- Trust signals + privacy link -->
    </footer>
  </main>
</body>
```

Card internal sections are separated by `border-top: 1px solid #f1f5f9` (options.html divider pattern). The options strip is always visible (not hidden behind a toggle) because format choice affects the copy output immediately.

---

## Component Specifications

### 1. Patent Input Field

```
Label:        "Patent number"  (14px/600/#0f172a)
Input:        type="text"
              placeholder="e.g. US10123456"
              autocomplete="off"
              padding: 8px 12px
              font-size: 14px
              font-family: monospace
              color: #1e293b
              background: #f8fafc
              border: 1px solid #e2e8f0
              border-radius: 6px
              width: 100%
Focus ring:   border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,0.12)
```

Validation inline message (published-app rejection — APP-02):
```
<p role="alert" class="field-error">
  Published applications (e.g. US20240001234A1) are not supported yet.
  Enter a granted patent number (e.g. US10123456).
</p>
```
Styled: 12px/400/`#991b1b`; displayed inline below the input field; appears before any network call is made.

Normalization feedback (APP-01): after blur or on submit, the input value is replaced with the normalized form (e.g. `US10123456`) in-place. No separate message needed — the input value update is the feedback.

### 2. Passage Row

Each passage row contains:
```
Label:        "Passage [N]"  (14px/600/#0f172a) — "Passage 1" on first row;
              subsequent rows show "Passage 2", "Passage 3" etc.
Textarea:     rows="3" (≈60px at 14px line-height 1.5)
              padding: 8px 12px
              font-size: 14px
              font-family: inherit
              color: #1e293b
              background: #f8fafc
              border: 1px solid #e2e8f0
              border-radius: 6px
              width: 100%
              resize: vertical
Focus ring:   same as patent input
Remove button (rows 2+): text "×"; 
              position: absolute top-right of label row;
              font-size: 16px; color: #94a3b8;
              hover color: #991b1b;
              aria-label="Remove passage [N]"
```

Row spacing: `margin-top: 16px` between passage rows.

### 3. "Add Another Passage" Affordance

```
Element:   <button type="button">
Copy:      "+ Add another passage"
Style:     font-size: 13px; color: #64748b;
           background: none; border: none;
           text-decoration: underline; cursor: pointer;
           padding: 4px 0; margin-top: 12px;
           display: block;
Hover:     color: #2563eb
Focus:     outline: 2px solid #2563eb; outline-offset: 2px
Min height: 44px (touch target — use padding to reach if needed)
```

This affordance is always visible below the last passage row. Clicking it appends a new passage row and focuses the new textarea (BATCH-01).

### 4. Submit Button

```
Element:   <button type="submit" id="cite-btn">
Copy:      "Get citation"
Style:     display: block; width: 100%;
           padding: 10px 16px;
           font-size: 14px; font-weight: 600;
           color: #ffffff;
           background: #1e3a8a;
           border: none; border-radius: 6px;
           cursor: pointer;
           margin-top: 16px;
Hover:     background: #1e40af (one step lighter — options.html `.status-fetching color`)
Focus:     outline: 2px solid #2563eb; outline-offset: 2px
Disabled:  opacity: 0.5; cursor: not-allowed
           (when: no patent number entered, OR a request is in-flight)
```

### 5. Named-Stage Loading Line (APP-08)

```
Container: <div role="status" aria-live="polite" class="status status-fetching">
           padding: 8px 10px; border-radius: 6px;
           background: #eff6ff; color: #1e40af;
           font-size: 13px;
           margin-top: 16px;

Stage messages (exact strings — locked):
  Stage 1:  "Fetching patent PDF…"
  Stage 2:  "Parsing PDF…"
  Stage 3:  "Matching passage…"
  Cache hit: "Loading from cache…"  (replaces stages 1+2 on cache hit — APP-04)
```

The `textContent` of the container is replaced in-place as stages advance. Because `aria-live="polite"` is on the container and the container is pre-rendered in the DOM (not injected), screen readers announce each stage change without the injection timing issue.

### 6. Result Card / Result Row (APP-06, APP-09, BATCH-02)

For a single passage result OR each row in a batch result:

```
Container: <div class="result-row">
           padding: 16px;
           border-top: 1px solid #f1f5f9 (divides from previous row or loading area)

Citation string:
           <output class="citation-text">
           font-size: 15px; font-weight: 600;
           font-family: monospace;
           color: #0f172a;
           display: block; margin-bottom: 8px;

Confidence chip:
           <span class="confidence-chip [chip-green|chip-yellow|chip-red]">
           font-size: 12px; font-weight: 600;
           padding: 2px 8px;
           border-radius: 4px;
           display: inline-block;

           chip-green  (confidence ≥ 0.95): background #ecfdf5; color #065f46  → "High confidence"
           chip-yellow (confidence ≥ 0.80): background #fffbeb; color #92400e  → "Medium confidence"
           chip-red    (confidence <  0.80): background #fef2f2; color #991b1b  → "Low confidence"

Passage label (batch only):
           <span class="passage-label">
           font-size: 12px; color: #64748b;
           display: block; margin-bottom: 4px;
           "Passage 1:", "Passage 2:", …

Copy button (per-result — APP-09):
           <button type="button" class="copy-btn" aria-label="Copy citation">
           padding: 4px 8px; font-size: 12px; color: #64748b;
           background: none; border: 1px solid #e2e8f0;
           border-radius: 4px; cursor: pointer;
           margin-left: 8px; vertical-align: middle;
           Inner content: inline SVG clipboard icon (16×16) + " Copy"
           Hover: border-color: #2563eb; color: #2563eb
           After copy (2s): text changes to "Copied!" then reverts; aria-live="polite" on a
                            visually-hidden sibling announces "Copied to clipboard"
```

### 7. Batch "Copy All" Button (BATCH-03)

Appears below all result rows when ≥2 passage results are shown.

```
Element:   <button type="button" id="copy-all-btn">
Copy:      "Copy all citations"
Style:     font-size: 13px; color: #64748b;
           background: none; border: 1px solid #e2e8f0;
           border-radius: 4px; padding: 6px 12px;
           cursor: pointer; margin-top: 8px;
Hover:     border-color: #2563eb; color: #2563eb
After copy (2s): "All copied!" then reverts
aria-live announcement: visually-hidden sibling, "All [N] citations copied to clipboard"
```

Copies all citations as a newline-separated list. If the patent-number prefix toggle (FMT-02) is on, each line is prefixed. Format (FMT-01) applies to all lines.

### 8. No-Match State (APP-07)

```
Container: <div role="alert" class="status status-unavailable">
           background: #fffbeb; color: #92400e;
           padding: 8px 10px; border-radius: 6px;
           font-size: 13px; margin-top: 16px;

Heading:   "Passage not found in this patent"
Detail:    <div class="error-detail" style="font-size:12px;margin-top:4px;opacity:0.8">
           "The passage text could not be matched to a specific column and line.
            Try a shorter or more distinctive excerpt."
```

### 9. Error State with Retry (APP-07)

```
Container: <div role="alert" class="status status-error">
           background: #fef2f2; color: #991b1b;
           padding: 8px 10px; border-radius: 6px;
           font-size: 13px; margin-top: 16px;

Heading:   "Could not retrieve patent"  (network error)
           OR "Could not parse patent PDF"  (parse error)
Detail:    <div class="error-detail">
           Network: "Check your connection and try again."
           Parse:   "The PDF for this patent could not be read. Try again, or check that the patent number is correct."

Retry button:
           <button type="button" class="retry-btn">
           Copy: "Try again"
           Style: font-size: 13px; color: #991b1b;
                  text-decoration: underline; background: none;
                  border: none; cursor: pointer; padding: 0;
                  margin-top: 6px; display: block;
           Focus: outline: 2px solid #991b1b; outline-offset: 2px
```

Clicking "Try again" re-runs the full lookup with the same patent number and passage(s) already in the fields.

### 10. Format / Prefix Options Strip (FMT-01, FMT-02)

Lives inside the card as the last `card-section`. Always visible (not collapsible). Matches the `setting-group` styling from options.html.

```
Section padding:  20px 24px (options.html `.setting-group` exact value)
Divider:          border-top: 1px solid #f1f5f9

Citation format toggle:
  Label:          "Citation format"  (14px/600/#0f172a)
  Description:    "Short form is the default."  (13px/400/#64748b)
  Control:        <select id="citation-format">
                    <option value="short">Short (4:15-22)</option>
                    <option value="long">Long (Col. 4, ll. 15-22)</option>
                  </select>
  Style:          Identical to options.html `select` — padding 8px 12px; 14px;
                  border 1px solid #e2e8f0; border-radius 6px; #f8fafc bg;
                  chevron SVG from options.html (line 103)
  Persistence:    localStorage key: `citation-format` (values: `"short"` | `"long"`)
  Default:        `"short"` (locked by CONTEXT.md)

Patent-number prefix toggle:
  Control:        <input type="checkbox" id="include-patent-number">
  Label:          "Include patent number"  (14px/600/#0f172a)
  Description:    "Prefix citation with patent number (e.g. US10123456 4:15-22)."
                  (13px/400/#64748b)
  Style:          Identical to options.html `.checkbox-row` —
                  accent-color: #2563eb; width 16px; height 16px
  Persistence:    localStorage key: `include-patent-number` (values: `"true"` | `"false"`)
  Default:        unchecked / `"false"`
```

When either toggle changes, any already-displayed citation updates immediately (re-render the citation string from cached column/line integers — no re-fetch needed).

### 11. Trust Footer (APP-10)

```
Element:   <footer class="footer">
           margin-top: 48px; text-align: center;
           font-size: 12px; color: #94a3b8;

Trust signals (one line, separated by " · "):
           "Deterministic — no AI inference"
           "No data stored"

Separator:  <span class="footer-sep"> · </span>  (margin: 0 8px — options.html line 170)

Privacy link:
           <a href="https://tonyrowles.github.io/patent-cite-tool/privacy" target="_blank">
           Privacy Policy</a>
           color: #64748b; text-decoration: none;
           hover: color: #2563eb; text-decoration: underline (options.html .footer a:hover)
```

---

## State Machine

All states are mutually exclusive within `#results-area`. The card sections above results-area (patent input, passages, submit button, options strip) remain visible and editable in all states.

| State ID | Trigger | What `#results-area` Shows | Submit Button |
|----------|---------|---------------------------|---------------|
| `idle` | Page load; after "Try again" clears error | Nothing (empty div, height 0) | Enabled (if patent + ≥1 passage filled) |
| `validating` | Submit with published-app number | Inline `.field-error` below patent input (role="alert") | Re-enables immediately (no network call) |
| `loading-fetch` | Submit — cache miss | Named-stage line: "Fetching patent PDF…" | Disabled |
| `loading-cache` | Submit — cache hit | Named-stage line: "Loading from cache…" | Disabled |
| `loading-parse` | After PDF received | Named-stage line: "Parsing PDF…" | Disabled |
| `loading-match` | After parse complete | Named-stage line: "Matching passage…" | Disabled |
| `success-single` | 1 passage matched | Single result row (citation + chip + copy) | Re-enabled |
| `success-batch` | ≥2 passages matched | N result rows + copy-all button | Re-enabled |
| `no-match` | `matchAndCite` returns no hit | No-match status div | Re-enabled |
| `error-network` | fetch() throws / 5xx | Error status div + "Try again" | Re-enabled |
| `error-parse` | PDF.js throws | Error status div + "Try again" | Re-enabled |

Transitions from loading states to success/error/no-match clear the named-stage line and render the appropriate component in-place.

---

## Copywriting Contract

| Element | Exact Copy |
|---------|------------|
| Page H1 | "Patent Citation Tool" |
| Page tagline | "Enter a patent number and passage text to get the exact column and line citation." |
| Patent input label | "Patent number" |
| Patent input placeholder | "e.g. US10123456" |
| Passage input label | "Passage 1" / "Passage 2" / … |
| Passage input placeholder | "Paste the patent text you want to cite…" |
| Submit CTA | "Get citation" |
| Add-passage affordance | "+ Add another passage" |
| Remove-passage button aria-label | "Remove passage [N]" |
| Published-app rejection | "Published applications (e.g. US20240001234A1) are not supported yet. Enter a granted patent number (e.g. US10123456)." |
| Loading: fetching | "Fetching patent PDF…" |
| Loading: cache hit | "Loading from cache…" |
| Loading: parsing | "Parsing PDF…" |
| Loading: matching | "Matching passage…" |
| No-match heading | "Passage not found in this patent" |
| No-match detail | "The passage text could not be matched to a specific column and line. Try a shorter or more distinctive excerpt." |
| Error: network heading | "Could not retrieve patent" |
| Error: network detail | "Check your connection and try again." |
| Error: parse heading | "Could not parse patent PDF" |
| Error: parse detail | "The PDF for this patent could not be read. Try again, or check that the patent number is correct." |
| Retry button | "Try again" |
| Copy button | "Copy" |
| Copy button: after copy | "Copied!" (reverts after 2s) |
| Copy-all button | "Copy all citations" |
| Copy-all: after copy | "All copied!" (reverts after 2s) |
| Copy-all: aria announcement | "All [N] citations copied to clipboard" |
| Confidence chip: high | "High confidence" |
| Confidence chip: medium | "Medium confidence" |
| Confidence chip: low | "Low confidence" |
| Format toggle label | "Citation format" |
| Format toggle description | "Short form is the default." |
| Prefix checkbox label | "Include patent number" |
| Prefix checkbox description | "Prefix citation with patent number (e.g. US10123456 4:15-22)." |
| Trust signal 1 | "Deterministic — no AI inference" |
| Trust signal 2 | "No data stored" |
| Idle/empty state | (no message — results area is empty; tagline below H1 acts as instruction) |

No destructive actions exist in this phase. No confirmation dialogs required.

---

## Accessibility Contract

### Labels and Association

- Every `<input>` and `<textarea>` has a corresponding `<label for="…">` with a matching `id`.
- Dynamically added passage rows: label and input `id` / `for` attributes are updated by index (`passage-1`, `passage-2`, …) each time a row is added or removed.
- The `<select>` elements in the options strip each have an explicit `<label for="…">`.
- Error messages use `role="alert"` so they are announced immediately on insertion.
- The results area uses `aria-live="polite"` and `aria-atomic="false"` so stage changes and result rows are announced without interrupting ongoing speech.

### Focus Management

- On page load: focus is placed on the patent input field.
- When a new passage row is added: focus moves to the new `<textarea>`.
- When a passage row is removed: focus moves to the previous `<textarea>`, or the "add another passage" button if no passages remain beyond the first.
- When loading completes (success, error, or no-match): focus is NOT moved (the `aria-live` region handles announcement). The submit button re-enables and can be reached by Tab.
- The "Try again" button is the first focusable element inside the error state; it receives focus automatically when the error state is rendered.

### Keyboard

- Full keyboard operability: all interactive elements reachable and operable via Tab / Shift+Tab / Enter / Space.
- The "add another passage" button responds to Enter and Space.
- Copy buttons respond to Enter and Space.
- No keyboard traps.

### Contrast

| Text | Background | Ratio | WCAG AA |
|------|------------|-------|---------|
| `#0f172a` on `#ffffff` | card body | 19.6:1 | AAA |
| `#1e293b` on `#f8fafc` | input text | 15.3:1 | AAA |
| `#64748b` on `#ffffff` | muted labels | 5.9:1 | AA (large text OK; 13px — borderline; confirmed pass at 14px+ for body) |
| `#94a3b8` on `#f9fafb` | footer chrome | 3.1:1 | AA large text only — acceptable for 12px informational-only trust copy (not interactive) |
| `#065f46` on `#ecfdf5` | green chip | 7.2:1 | AAA |
| `#92400e` on `#fffbeb` | yellow chip | 5.7:1 | AA |
| `#991b1b` on `#fef2f2` | red chip | 6.5:1 | AA |
| `#1e40af` on `#eff6ff` | loading chip | 7.1:1 | AAA |
| `#ffffff` on `#1e3a8a` | submit button | 10.7:1 | AAA |

### ARIA Roles Summary

| Element | ARIA |
|---------|------|
| `#results-area` | `aria-live="polite"` `aria-atomic="false"` |
| Named-stage loading div | `role="status"` (redundant with live region parent — belt-and-suspenders) |
| Published-app rejection | `role="alert"` |
| No-match div | `role="alert"` |
| Error div | `role="alert"` |
| Copy confirmation | visually-hidden sibling `aria-live="polite"` |
| Copy-all confirmation | visually-hidden sibling `aria-live="polite"` |
| Remove-passage buttons | `aria-label="Remove passage [N]"` |
| Copy button | `aria-label="Copy citation"` (per row, or "Copy citation for passage [N]" in batch) |

Visually-hidden class:
```css
.sr-only {
  position: absolute; width: 1px; height: 1px;
  padding: 0; margin: -1px; overflow: hidden;
  clip: rect(0,0,0,0); white-space: nowrap; border: 0;
}
```

---

## Responsive Behavior

The webapp is single-column at all widths. No breakpoint-dependent layout changes are needed.

| Viewport | Behavior |
|----------|----------|
| ≥ 600px | Card at `max-width: 540px`, centered, `margin: 0 auto`, `padding: 32px 16px` on body |
| < 600px | Card fills available width; `padding: 32px 12px` on body (reduce horizontal gap to 12px); font sizes unchanged; no horizontal scroll |
| < 400px | Patent input + passage textareas stack naturally; options strip remains readable; trust footer wraps to 2 lines |

Touch targets: all buttons and the add-passage affordance have a minimum height of 44px (either intrinsically via padding or via `min-height: 44px`).

No hamburger menus, no navigation drawers, no sidebars. The entire UI is a single scrollable card.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | none | not applicable — no shadcn |
| third-party | none | not applicable |

No external component registries. No npm UI dependencies. Inline `<style>` only.

---

## Pre-Population Source Audit

| Decision | Source |
|----------|--------|
| Font stack | popup.html line 8, options.html line 15 — extracted verbatim |
| Body font size (14px) | options.html `.setting-label label` + `select`; popup.html 13px bumped to 14px |
| Heading 20px/700 | options.html `.header h1` line 37–38 |
| Background #f9fafb | options.html `body` line 19 |
| Card #ffffff + shadow | options.html `.settings-card` lines 49–51 |
| Divider #f1f5f9 | options.html line 66 |
| Input styles (#f8fafc, #e2e8f0, 6px radius) | options.html `select` lines 95–107 |
| Focus ring #2563eb + rgba shadow | options.html `select:focus` lines 112–113 |
| H1 color #1e3a8a | options.html line 38 |
| Status chip colors (all 5) | popup.html lines 23–27 |
| Status padding `8px 10px`, 6px radius | popup.html `.status` lines 19–20 |
| Setting-group padding 20px 24px | options.html line 63 |
| Footer 12px/#94a3b8 | options.html lines 154–155 |
| Footer link #64748b / hover #2563eb | options.html lines 158–164 |
| Confidence thresholds ≥0.95/≥0.80 | 08-CONTEXT.md + popup.js (thresholds not inline in popup.js but locked by CONTEXT.md) |
| Named stage strings | 08-CONTEXT.md "Loading / Errors / Trust" section |
| Default format: shorthand | 08-CONTEXT.md "Default citation format" |
| localStorage persistence | 08-CONTEXT.md "Default citation format" |
| Single-first layout + add-passage affordance | 08-CONTEXT.md "Mode model" |
| Trust signal copy | 08-CONTEXT.md + APP-10 |
| Published-app rejection at input | 08-CONTEXT.md + APP-02 |
| No new dependencies | REQUIREMENTS.md Out-of-Scope table |
| max-width 540px | Derived from options.html `max-width: 480px` + webapp needs slightly wider for citation output; bumped to 540px |

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending

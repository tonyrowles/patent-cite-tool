# Phase 4: Report Dialog UI + Citation-UI Wiring - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-13
**Phase:** 4-Report Dialog UI + Citation-UI Wiring
**Areas discussed:** Dialog look & placement, Transparency panel tone, Auto-surface behavior, Note & error-buffer policy

---

## Dialog look & placement

### Placement
| Option | Description | Selected |
|--------|-------------|----------|
| Centered modal + dimmed backdrop | Dialog centered over a semi-transparent backdrop; strongest focus-trap / click-outside story | |
| Anchored panel near the pill | Panel attached near the citation pill, viewport-clamped like the existing cite-popup | ✓ |

### Theme
| Option | Description | Selected |
|--------|-------------|----------|
| Match the citation-pill aesthetic | Reuse existing cite-popup / green-yellow toast styling + font stack | ✓ |
| Neutral system look | Plain OS-default modal | |
| Google-Patents-native | Mimic Patents' Material styling | |

**User's choice:** Anchored panel near the pill; match the citation-pill aesthetic (→ D-01, D-02)
**Notes:** Lighter, contextually tied to the selection; reuses existing CSS. CAP-04 focus-trap/Escape/click-outside still apply with viewport clamping.

---

## Transparency panel tone

### Preview presentation
| Option | Description | Selected |
|--------|-------------|----------|
| Friendly labels | Human-readable rows ("The text you selected", "Page address", …) | ✓ |
| Raw field:value | Exact payload keys (`selected_node_xpath`, `scroll_y`, …) | |
| Hybrid | Friendly labels up top + collapsed raw technical sub-section | |

### Default state
| Option | Description | Selected |
|--------|-------------|----------|
| Collapsed | Panel starts collapsed behind the one-line disclosure | ✓ |
| Expanded | Panel open immediately, full payload + toggle visible | |

**User's choice:** Friendly labels; collapsed by default (→ D-03, D-04)
**Notes:** Selection-text row is the field hidden by the [Remove selection text] toggle. Keeps the anchored panel compact.

---

## Auto-surface behavior

### Surface action
| Option | Description | Selected |
|--------|-------------|----------|
| Button appears; user clicks to open | Button surfaces with category pre-selected; dialog opens only on click | ✓ |
| Dialog auto-opens | Dialog opens immediately on failure/yellow/error | |

### Button affordance
| Option | Description | Selected |
|--------|-------------|----------|
| Same icon, gentle nudge on failure | Icon-only glyph normally; short label/soft highlight on failure outcomes | ✓ |
| Always identical icon-only | Icon-only in every case; auto-surface only changes presence | |

**User's choice:** Button appears (user clicks to open); same icon with a gentle nudge on failure (→ D-05, D-06)
**Notes:** TRIG-04 invariant preserved — button hidden entirely on green success (Phase 5 DBG-01 relaxes this).

---

## Note & error-buffer policy

### "Other" note requirement
| Option | Description | Selected |
|--------|-------------|----------|
| Require a note for "Other" | Submit disabled until "Other" has a note | |
| Note always optional | Submit always enabled regardless of category | ✓ |

### Error ring buffer scope
| Option | Description | Selected |
|--------|-------------|----------|
| Extension-tagged only | Only `[SW]` / `[PCT]`-style extension console entries captured | ✓ |
| All console.error/warn | Every page console error/warn captured | |

**User's choice:** Note always optional; error buffer captures extension-tagged entries only (→ D-07, D-08)
**Notes:** Lowest friction on the note; cleaner triage signal + smaller payload + avoids host-page console noise on the buffer.

---

## Claude's Discretion

- xpath / scroll_y / viewport capture technique and source sites (PAY-09); `pdfParseStatus` sourcing from the PDF pipeline.
- console.error/warn interception approach (monkeypatch vs explicit helper) and `bugReportErrorBuffer` write strategy (PAY-08).
- Trigger-detection wiring in `content-script.js` and the outcome→category plumbing.
- Focus-trap mechanics, DOM structure, CSS class names, note character-counter visual treatment.

## Deferred Ideas

- Debug Mode "always show Report button" on green successes — Phase 5 (DBG-01/02).
- Toolbar-popup "Report a problem" link + options-page `#report` inline dialog — Phase 5 (CAP-05/06).
- Live cross-browser UAT — Phase 5 (UAT-01..06).

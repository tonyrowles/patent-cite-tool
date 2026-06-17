# Phase 4: Report Dialog UI + Citation-UI Wiring - Context

**Gathered:** 2026-06-13
**Status:** Ready for planning

<domain>
## Phase Boundary

The user-facing report capture surface. A Shadow DOM report dialog (`src/content/report-dialog.js`) mounted in the existing closed-shadow host from `citation-ui.js:getCitationHost()`, a Report button added to the citation popup, the auto-surfacing logic that decides when the button appears (no-match / yellow-confidence / Worker-error) with the correct category pre-selected, the `bugReportErrorBuffer` error-log ring buffer, and live DOM/PDF diagnostic enrichment — all wired so a user can trigger the full in-citation report flow from a real Google Patents page.

Phase 4 **consumes** the Phase 2 payload builder and the Phase 3 background submission handler; it does not rebuild them. The dialog calls `buildReportPayload(...)`, sends via `chrome.runtime.sendMessage({ type: MSG.SUBMIT_REPORT, payload })`, and maps the Phase 3 result `{ ok, queued, fingerprint, rateLimited, dropped }` to the existing toasts.

Requirements: CAP-01, CAP-02, CAP-03, CAP-04, TRIG-01, TRIG-02, TRIG-03, TRIG-04, PAY-08, PAY-09.

**Factual corrections (apply silently — not decisions):**
- The REQUIREMENTS traceability table lists Phases 1 & 2 as "Pending," but `src/shared/constants.js` (with `MSG.SUBMIT_REPORT`, `REPORT_CATEGORIES`, `WORKER_REPORT_URL`) and `src/shared/report-payload-builder.js` exist on disk and are consumable. Stale table, not a blocker.
- ROADMAP SC2 cites the rate-limit toast as "Too many reports — please wait a few minutes"; REQUIREMENTS LIMIT-03 says **"Too many reports in a short period — please wait a few minutes."** REQUIREMENTS wins (resolves the discrepancy flagged during Phase 3).

</domain>

<decisions>
## Implementation Decisions

### Dialog presentation (CAP-01, CAP-04)
- **D-01:** **Anchored panel near the citation pill** — the dialog renders as a panel attached near the citation popup / Report button and is viewport-clamped like the existing `cite-popup` (see `citation-ui.js` clamping ~lines 200-212), NOT a centered modal with a dimmed full-screen backdrop. Rationale: lighter and contextually tied to the user's selection. CAP-04's focus-trap, Escape, Cancel, and click-outside-to-dismiss still apply; the planner handles trap mechanics within the anchored panel.
- **D-02:** **Reuse the existing citation-pill aesthetic** — rounded corners, soft shadow, the existing green/yellow toast/pill styling and font stack from `citation-ui.js`, so the dialog reads as part of the same tool. NOT a neutral-system look and NOT Google-Patents-native (Patents' Polymer styling is brittle and would imply a Google feature).

### Transparency / "What's included" panel (CAP-02)
- **D-03:** **Friendly human-readable field labels** in the payload preview — e.g. "The text you selected", "Patent number", "Page address", "Browser & OS", "Extension version", "N recent error-log entries" — NOT raw payload keys (`selected_node_xpath`, `scroll_y`, …). The "selection text" row is the field hidden by the [Remove selection text] toggle. Rationale: builds trust for non-technical users and keeps the one privacy-relevant field (selection text) legible rather than buried in diagnostic noise.
- **D-04:** **Panel starts collapsed** behind the one-line disclosure ("Includes patent #, your selection, URL, extension version — see what's sent"); the user expands it to inspect the full field list and reach the [Remove selection text] toggle. Keeps the anchored panel (D-01) compact.

### Auto-surface & Report button affordance (CAP-03, TRIG-01..04)
- **D-05:** **Button surfaces; dialog opens only on click.** On a no-match / yellow-confidence / Worker-error outcome the Report button appears with the category pre-selected, but the dialog itself opens only when the user clicks the button — it never auto-opens. Rationale: respects users who don't want to report; avoids a modal popping up uninvited on every failed citation.
- **D-06:** **Icon-only normally, gentle nudge on failure.** The button is the CAP-03 icon-only flag/megaphone glyph with `title="Report a problem"` in the normal case; on a failure / yellow / Worker-error outcome it gets a gentle nudge — a short text label ("Report a problem") or a soft highlight — so it's noticed in the failure moment. The **TRIG-04 invariant holds**: the button is hidden entirely on green / high-confidence success (Phase 5 DBG-01/02 later relaxes this via Debug Mode).

### Note field & diagnostic capture (CAP-01, PAY-08)
- **D-07:** **Note stays optional for all categories, including "Other."** Submit is never gated on the note (lowest friction). The CAP-01 256-char limit + live counter still apply.
- **D-08:** **Error ring buffer captures extension-tagged entries only.** The PAY-08 wrapper records only `console.error` / `console.warn` originating from extension code (e.g. the existing `[SW]` / `[PCT]`-style prefixes), NOT all host-page console output. Rationale: cleaner triage signal, smaller payload, and avoids incidentally capturing unrelated Google-Patents page console strings (a privacy/relevance win).

### Claude's Discretion
- Exact `selected_node_xpath` / `scroll_y` / `viewport_width` / `viewport_height` capture technique and which sites in `src/content/` to source them from (PAY-09 says reuse existing capture sites; a quick scout found none, so these are likely net-new helpers — researcher to confirm).
- `pdfParseStatus` sourcing — where the `'success' | 'failed' | 'skipped' | 'cache-hit'` value is read from the existing PDF pipeline / citation-result flow.
- The console.error/warn interception approach for PAY-08 (monkeypatch vs explicit log helper) and the storage-write strategy for `bugReportErrorBuffer`.
- Exact trigger-detection wiring in `content-script.js` (the `showCitationPopup` / `showErrorPopup` sites at ~438/452/454/469/536/548) and how the outcome→category mapping is plumbed (extend `showCitationPopup`'s signature vs derive from confidence/tier + a new outcome param).
- Focus-trap mechanics within the anchored panel; exact DOM structure, CSS class names, and the note character-counter visual treatment.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap (authority order: REQUIREMENTS.md wins on conflicts)
- `.planning/REQUIREMENTS.md` — Phase 4 requirement text: CAP-01 (Shadow DOM dialog: 4-category radio, 256-char note, Submit/Cancel, inline privacy disclosure), CAP-02 (expandable "What's included" panel + [Remove selection text] toggle, sticky key `reportDialogRemoveSelectionText`), CAP-03 (Report button adjacent to copy action, icon-only, category auto-select), CAP-04 (dialog UX: Submit-close, Cancel/Escape/click-outside dismiss, focus trap, ARIA), TRIG-01..04 (auto-surface conditions + the green-success invariant), PAY-08 (error ring buffer, key `bugReportErrorBuffer`, last 20), PAY-09 (DOM/PDF diagnostics, reuse v3.1 `llm-report.json` field names, new `pdfParseStatus`). **Authority on toast strings.**
- `.planning/ROADMAP.md` Phase 4 — the 4 Success Criteria (SC1 category auto-select per outcome + green-hidden, SC2 What's-included preview + selection-text toggle correctness + sticky, SC3 dismiss paths + focus trap/restore, SC4 live diagnostic fields + error-buffer inclusion).

### Prior-phase decisions carried in
- `.planning/phases/02-shared-constants-pure-payload-builder/02-CONTEXT.md` — `buildReportPayload({ context, category, note, settings, errors, includeSelectionText })` signature and the allowlisted payload Phase 4 must populate; `REPORT_CATEGORIES`.
- `.planning/phases/03-background-submission-handler-rate-limit-retry-queue/03-CONTEXT.md` — D-06 (background owns logic; the content-script caller renders all toasts), D-08 return shape `{ ok, queued, fingerprint, rateLimited, dropped }` that drives toast selection, D-07 (background-initiated retries are silent → the synchronous submit's result is the only toast source).

### Schema / payload contract
- `src/shared/report-payload-builder.js` — the pure builder Phase 4 calls; `context` fields include `xpathNode`, `scrollY`, `viewportWidth`, `viewportHeight`, `pdfParseStatus`.
- `src/shared/constants.js` — `MSG.SUBMIT_REPORT`, `REPORT_CATEGORIES`, `WORKER_REPORT_URL`.
- `worker/src/report-schema.md` — KV field allowlist (PAY-01); the transport/payload must not reintroduce PAY-03 forbidden fields (`ip`/`clientIp`/`userAgent`).

### Files this phase touches
- `src/content/citation-ui.js` — `getCitationHost()` closed shadow host (lines 26-39, the dialog mounts here), `showCitationPopup` (111, passes `confidence`; confidence classes high≥0.95 / medium≥0.80 / low<0.80 at line 124), `showErrorPopup`, `showSuccessToast` / `showFailureToast` + their CSS, the `.cite-popup` row + `.cite-copy-btn` (136) where the Report button sits adjacent (CAP-03).
- `src/content/content-script.js` — citation-result + error sites (~438/452/454/469/536/548) where TRIG-01..03 detect outcomes and plumb the category.
- NEW `src/content/report-dialog.js` — the Shadow DOM dialog module (CAP-01/02/04).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `citation-ui.js:getCitationHost()` returns `{ host, shadow }` over a `mode: 'closed'` shadow root — the dialog mounts inside this existing host (CAP-01).
- `showSuccessToast` / `showFailureToast` + their CSS — the toasts QUEUE-04 / Phase-3 D-06 mandate reusing for the submit result (`ok`→success, `queued`→"saved, will retry", `rateLimited`→LIMIT-03 toast).
- `.cite-popup` / `.cite-copy-btn` styling (`citation-ui.js:118-140`) — the aesthetic D-02 reuses; the Report button sits adjacent to the Copy button.
- `src/shared/report-payload-builder.js` (`buildReportPayload`) and `src/shared/report-transport.js` (Phase 3 `submitReport` via `MSG.SUBMIT_REPORT`) — the downstream pipeline; Phase 4 supplies the inputs and renders the result.

### Established Patterns
- `showCitationPopup` confidence bands: high ≥0.95, medium ≥0.80, low <0.80 (`citation-ui.js:124`). TRIG-02 "yellow = Tier 5 / 0.85 cap" maps into the medium band; the exact tier/confidence→category mapping is the researcher/planner's to confirm against `matchAndCite`.
- Popup positioning is viewport-clamped (`citation-ui.js` ~200-212); the anchored dialog (D-01) follows the same clamping.
- **No existing xpath/scroll-capture utility and no error ring buffer were found** — PAY-08 (`bugReportErrorBuffer` console wrapper) and the PAY-09 capture helpers are net-new.

### Integration Points
- **Upstream:** `content-script.js` citation-result / error handlers decide when the Report button surfaces and which category is pre-selected (TRIG-01..04).
- **Downstream:** dialog → `buildReportPayload` → `chrome.runtime.sendMessage({ type: MSG.SUBMIT_REPORT, payload })` → Phase 3 background → Worker; the returned `{ ok, queued, fingerprint, rateLimited, dropped }` drives the toast.
- **Sticky state:** `chrome.storage.local` keys `reportDialogRemoveSelectionText` (CAP-02 toggle) and `bugReportErrorBuffer` (PAY-08 ring buffer).

</code_context>

<specifics>
## Specific Ideas

- Report button glyph: flag/megaphone, icon-only, `title="Report a problem"`; gentle text-label/highlight nudge on failure/yellow/error outcomes (D-06).
- "What's included" panel collapsed by default, friendly labels, expand-to-inspect; the selection-text row is what the [Remove selection text] toggle removes (D-03/D-04).
- Note: 256-char limit + live counter, optional for every category incl. "Other" (D-07).
- Toast strings: success "Report sent — thank you"; queued "Report saved — will retry when online"; rate-limited "Too many reports in a short period — please wait a few minutes" (REQUIREMENTS LIMIT-03 wording — authoritative over ROADMAP SC2).
- Sticky keys: `reportDialogRemoveSelectionText`, `bugReportErrorBuffer`.

</specifics>

<deferred>
## Deferred Ideas

- **Debug Mode "always show Report button" on green successes** — Phase 5 (DBG-01/02); the TRIG-04 green-hidden invariant is the Phase 4 default.
- **Toolbar-popup "Report a problem" link + options-page `#report` inline dialog** (`report-dialog.js` `'page'` mode) — Phase 5 (CAP-05/06).
- **Live cross-browser UAT** (Discord webhook + KV verification, rate-limit boundary, dedup, privacy audit, toggle correctness) — Phase 5 (UAT-01..06).
- None — discussion stayed within phase scope.

</deferred>

---

*Phase: 4-Report Dialog UI + Citation-UI Wiring*
*Context gathered: 2026-06-13*

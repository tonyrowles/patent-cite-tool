# Phase 5: Options Page Debug Mode + Popup Fallback + Live UAT - Context

**Gathered:** 2026-06-13
**Status:** Ready for planning

<domain>
## Phase Boundary

The milestone-closing phase: secondary report surfaces + live DoD evidence. Three small, well-precedented build pieces — a Debug Mode toggle (DBG-01/02), a toolbar-popup "Report a problem" fallback (CAP-05), and an options-page inline report section at `#report` (CAP-06) reusing the Phase 4 `report-dialog.js` in a non-Shadow 'page' mode — followed by live UAT-01..06 across Chrome + Firefox that proves the complete submission pipeline end-to-end and **also closes Phase 4's deferred `04-HUMAN-UAT.md` items**.

Phase 5 builds NO new backend (Worker/background submission shipped in Phases 1/3) and NO new payload logic (Phase 2). It wires existing surfaces and runs the live verification.

Requirements: DBG-01, DBG-02, CAP-05, CAP-06, UAT-01, UAT-02, UAT-03, UAT-04, UAT-05, UAT-06.

</domain>

<decisions>
## Implementation Decisions

### Popup / options report context (CAP-05, CAP-06)
- **D-01:** **A popup/options-initiated report captures the last citation snapshot from `chrome.storage.local` (`currentPatent`)** so it still carries patent context (patent #, URL, pdfParseStatus), rather than submitting with blank diagnostics. **Accepted caveat:** the snapshot is the *last viewed* citation and may be stale/unrelated to why the user is reporting — the "What's included" preview MUST make this explicit (e.g. a line like "Context from your most recent citation: US…"). Live-capture-only fields that require an active selection (`selected_node_xpath`, the selection text itself, `scroll_y` at selection time) are NOT available on the popup path and are simply absent — the payload builder already treats them as optional. The `[Remove selection text]` toggle is therefore inert/hidden on the popup path when there is no selection text to remove.
- **D-02:** **The options-page dialog opened at `#report` (no triggering outcome) pre-selects NO category** — the user must pick one. Honest when there is no outcome to infer; Submit stays enabled (note optional per Phase 4 D-07) but requires a category selection.

### Live UAT execution (UAT-01..06)
- **D-03:** **Live UAT runs against the PRODUCTION Worker** (`https://pct.tonyrowles.com/report`) for true end-to-end DoD evidence — real Discord webhook embeds, real KV records retrievable via `wrangler kv key get`. Test submissions carry a recognizable note (e.g. "v5.0 UAT-0N smoke"); records inherit the 90-day TTL and are deletable afterward. (NOT a dev/staging deploy; NOT `X-PCT-Test-Mode` which would suppress the KV writes UAT-01/03 must verify.)
- **D-04:** **Maximum automation, irreducible-manual only for the operator.** Claude scripts everything scriptable — `web-ext lint`, `wrangler kv key get`/list for KV record + dedup checks, fingerprint-match verification, `npm run build`, the static grep guards — and records pass/fail + evidence into a UAT results file. The operator (user) performs ONLY the irreducible browser steps: triggering a live citation outcome on Google Patents, clicking Report + Submit, and the Chrome SW manual stop/restart (UAT-05). Claude produces a step-by-step UAT runbook in the phase dir; the operator follows it and reports outcomes; Claude verifies and records the DoD evidence. **Claude cannot drive a real browser — the live-submit and SW-restart steps are the user's.**

### Debug Mode (DBG-01, DBG-02)
- **D-05:** **The Debug-Mode Report button on a green/high-confidence success uses the plain CAP-03 icon-only glyph — NO amber nudge.** Green is not a failure; the button is present intentionally for the maintainer to catch confidently-wrong citations, so it must not visually alarm. The Phase-4 amber nudge stays reserved for genuine failure / yellow / Worker-error outcomes.
- **D-06:** **DBG-02 live read per citation.** The content script reads `debugMode` from `chrome.storage.sync` on each citation via the existing `onChanged` → `cachedSettings` pattern (`content-script.js:199-208`); toggling the options checkbox changes Report-button visibility on the very next citation with NO extension reload. `debugMode` is added to `DEFAULT_SETTINGS` (default `false`). When `debugMode === true`, the Phase-4 TRIG-04 green-hidden invariant relaxes — the button shows on ALL outcomes incl. green.

### 'page' mode dialog presentation (CAP-06)
- **D-07:** **'page' mode reuses the Phase-4 anchored-panel visual** (the card + soft shadow look) mounted inline at the options-page `#report` section — NOT a flat options-page-native form section. Visual consistency with the in-citation dialog wins. No Shadow DOM and no backdrop are needed (the options page is already isolated from Google Patents Polymer).
- **D-08:** **`showReportDialog` refactor is Claude's discretion** — thread a mount-context / mode flag through so the shared form-building, payload-assembly, and submit logic stay the single source of truth; only the *mounting* (closed shadow root vs page DOM node), the focus-trap root (`shadowRoot.activeElement` vs `document.activeElement`), and the dismiss/teardown differ between 'shadow' and 'page' modes. Do NOT duplicate the form/payload logic into a separate renderer (drift risk).

### Claude's Discretion
- DBG-01 options checkbox: follow the existing `includePatentNumber` checkbox + `chrome.storage.sync` auto-save pattern (`options.html:220`, `options.js:45-75`) verbatim; label/description per DBG-01 text.
- CAP-05 popup "Report a problem" link: follow the existing `settingsLink` → `chrome.runtime.openOptionsPage()` pattern (`popup.js:95-99`, `popup.html:38`); navigate to the `#report` anchor. Exact wording/placement in the 280px popup is discretionary.
- `options.js` reading `location.hash === '#report'` on `DOMContentLoaded` to scroll + focus the Report section (CAP-06).
- Test-record cleanup mechanics after UAT (which `wrangler kv key delete` calls, or rely on the 90-day TTL).
- The 'page'-mode focus-trap/dismiss differences and the no-selection preview rendering details.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap (authority: REQUIREMENTS.md wins on conflicts)
- `.planning/REQUIREMENTS.md` — Phase 5 requirement text: DBG-01 (options `debugMode` checkbox, `chrome.storage.sync`), DBG-02 (live-read relax of TRIG-04), CAP-05 (popup link → `openOptionsPage()` → `#report`), CAP-06 (options `#report` section, `report-dialog.js` `'page'` mode, same payload-builder + `MSG.SUBMIT_REPORT`), UAT-01..06 (live DoD evidence). **Authority on the DoD and the UAT acceptance details.**
- `.planning/ROADMAP.md` Phase 5 — the 5 Success Criteria (SC1 debug live-toggle, SC2 popup→options `#report` page-mode dialog, SC3 live UAT-01 Discord+KV evidence, SC4 cross-browser UAT-05 incl. SW stop/restart, SC5 server dedup UAT-03).
- `.planning/REQUIREMENTS.md` DoD line — zero new npm deps; CWS+AMO compliance; webhook URL never in shipped extension code; manual `gh issue create` is the only promotion path (v1).

### Prior-phase carry-in
- `.planning/phases/04-report-dialog-ui-citation-ui-wiring/04-CONTEXT.md` + `04-UI-SPEC.md` — the report dialog design contract Phase 5 reuses in 'page' mode; D-06/D-07 toast ownership.
- `.planning/phases/04-report-dialog-ui-citation-ui-wiring/04-HUMAN-UAT.md` — the 5 deferred live tests (focus trap, click-outside/Escape, sticky toggle, live triggers, live payload) that Phase 5's UAT-05/UAT-06 close.
- `.planning/phases/03-background-submission-handler-rate-limit-retry-queue/03-CONTEXT.md` — D-10 (live SW stop/restart was deferred to this phase's UAT-05); the queue/retry behavior UAT-05 exercises.
- `.planning/phases/01-worker-route-kv-schema-privacy-compliance-groundwork/01-CONTEXT.md` — the `/report` Worker, dedup (LIMIT-01, 15-min window), `X-PCT-Test-Mode`, the KV key format `report:{fingerprint}:{timestamp}` that `wrangler kv` checks use; `worker/src/report-schema.md` (PAY-01 allowlist; no `ip`).

### Files this phase touches
- `src/content/report-dialog.js` — `showReportDialog` (currently shadow-only, takes `shadow` as first param + `installFocusTrap(shadowRoot,…)`); add 'page' mount mode (D-07/D-08).
- `src/content/content-script.js` — `DEFAULT_SETTINGS` (~188) + `chrome.storage.sync.get` (~199) + `onChanged` (~208): add `debugMode` live-read; relax TRIG-04 when on (DBG-02).
- `src/content/citation-ui.js` — the Report-button injection guard (Phase 4) must honor `debugMode` to show on green with the plain icon (D-05).
- `src/options/options.html` (`includePatentNumber` checkbox ~220) + `src/options/options.js` (`storage.sync` auto-save ~45-75, add `#report` section + hash handling) — DBG-01, CAP-06.
- `src/popup/popup.html` (`settingsLink` ~38) + `src/popup/popup.js` (`openOptionsPage` ~99) — CAP-05.
- `src/manifest.json` / `src/manifest.firefox.json` — `options_ui.open_in_tab: true` already set (CAP-06 full-tab landing works).

### UAT tooling
- `wrangler` CLI (`wrangler kv key get` / `list` against the `BUG_REPORTS` namespace) for UAT-01/03 evidence; `web-ext lint` for UAT-04 (AMO clean); `dist/firefox/` + `dist/chrome/` builds.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/options/options.js:45-75` — `chrome.storage.sync.get({...defaults}, …)` load + per-control auto-save-on-change; DBG-01 adds a `debugMode` checkbox following this verbatim.
- `src/popup/popup.js:95-99` — `settingsLink.addEventListener('click', … chrome.runtime.openOptionsPage())`; CAP-05 adds a sibling "Report a problem" link navigating to `#report`.
- `src/content/content-script.js:199-208` — `chrome.storage.sync.get(DEFAULT_SETTINGS,…)` + `chrome.storage.onChanged` updating `cachedSettings`; DBG-02 live-read plugs straight in.
- `src/content/report-dialog.js` — `showReportDialog`, `installFocusTrap`, the form/payload/submit logic; Phase 5 extends (not forks) it for 'page' mode.
- `report-dialog.js` already exports the diagnostics helpers; the popup path sources `currentPatent` from `chrome.storage.local` instead of live capture (D-01).

### Established Patterns
- `options_ui.open_in_tab: true` (both manifests) — options page is a full tab, so CAP-06's inline dialog + `#report` scroll/focus works cleanly.
- Settings live in `chrome.storage.sync`; per-page citation diagnostics + queue live in `chrome.storage.local`.
- The content script already mutates Report-button visibility by outcome (Phase 4 TRIG-04 guard) — DBG-02 adds a `debugMode` OR-condition.

### Integration Points
- **Upstream:** options toggle (`storage.sync.debugMode`) → content script live-read → Report-button visibility on green.
- **Popup path:** popup link → `openOptionsPage()#report` → `options.js` hash handler → page-mode `showReportDialog` → `buildReportPayload` → `MSG.SUBMIT_REPORT` → Phase 3 background → Worker.
- **UAT:** live submit → production Worker `/report` → Discord webhook + KV write; verified via `wrangler kv` + Discord embed inspection.

</code_context>

<specifics>
## Specific Ideas

- `debugMode` key in `chrome.storage.sync`, default `false`; options label "Debug Mode — always show Report button" (DBG-01 text).
- Popup report uses last `currentPatent` snapshot; preview states the context is from the most recent citation (D-01).
- Options dialog at `#report`: no category pre-selected (D-02); 'page' mode reuses the anchored-panel card look (D-07).
- UAT against production `pct.tonyrowles.com`; test note "v5.0 UAT-0N smoke"; operator runs browser steps, Claude runs `wrangler kv get`/`web-ext lint`/grep + records evidence (D-03/D-04).
- Debug button on green = plain icon, no nudge (D-05).

</specifics>

<deferred>
## Deferred Ideas

- v5.1 items (INGEST-DEF, AFIX-DEF, DBG-DEF, CAP-DEF, PAY-DEF, TRIG-DEF) — out of v5.0 scope per REQUIREMENTS.
- Discord thread auto-creation / slash-command interactivity, auto-promotion of KV reports to GitHub Issues — explicitly out of scope (v1 trust model + manual `gh issue create` only).
- None — discussion stayed within phase scope.

</deferred>

---

*Phase: 5-Options Page Debug Mode + Popup Fallback + Live UAT*
*Context gathered: 2026-06-13*

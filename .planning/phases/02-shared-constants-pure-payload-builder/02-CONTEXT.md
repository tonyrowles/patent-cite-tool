# Phase 2: Shared Constants + Pure Payload Builder - Context

**Gathered:** 2026-06-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Pure, UI-free schema-contract layer: additions to `src/shared/constants.js` (PAY-05 — `MSG.SUBMIT_REPORT`, frozen `REPORT_CATEGORIES`, `WORKER_REPORT_URL`) and a NEW `src/shared/report-payload-builder.js` pure function (PAY-06) plus its Vitest suite (PAY-07). The builder produces the extension-side payload object conforming to the `worker/src/report-schema.md` allowlist so the Worker's `buildKvRecord()` copies every field without loss. ZERO `chrome.*` calls anywhere in this phase — both modules are directly Vitest-testable. No background-message handling (Phase 3), no UI (Phase 4). Requirements: PAY-05, PAY-06, PAY-07.

</domain>

<decisions>
## Implementation Decisions

### Constants module scope (PAY-05)
- **D-01:** `src/shared/constants.js` is ALREADY the single source of truth — the legacy `src/content/constants-globals.js` "classic script wrapper" referenced in the file's header comment **no longer exists**. Content scripts (`src/content/content-script.js`), the SW, Firefox background, offscreen, and the firefox pipeline all `import` from `shared/constants`; esbuild bundles it per-target (IIFE for content, ESM for background). Therefore PAY-05's "single source of truth shared by content script + background + options" is satisfied by adding to `constants.js` ALONE — no mirror file. **Fix the stale header comment** in `constants.js` (the lines describing `constants-globals.js` and "classic script wrapper") as part of this phase so it stops misleading future work.
- **D-02:** Additions: `MSG.SUBMIT_REPORT` (string message type, follow existing kebab-case convention, e.g. `'submit-report'`); `REPORT_CATEGORIES = Object.freeze(['inaccurate_citation', 'no_match', 'tool_not_working', 'other'])` (frozen, exact 4-element order from PAY-05 / report-schema.md); `WORKER_REPORT_URL = 'https://pct.tonyrowles.com/report'` (hardcoded; matches Phase 1 route). SC4 requires all three importable from `constants.js` with zero `chrome.*` in the module (static-grep Vitest assertion).

### Builder input contract (PAY-06)
- **D-03:** Signature is exactly `buildReportPayload({ context, category, note, settings, errors, includeSelectionText })`. Input shape:
  - `context` = live citation/page snapshot: `{ patentNumber, patentUrl?, selectionText, returnedCitation, confidenceTier, extensionVersion, browser, os, xpathNode, scrollY, viewportWidth, viewportHeight, pdfParseStatus }`
  - `settings` = `{ triggerMode }` (only schema-relevant settings field; settings snapshot)
  - `errors` = the ring-buffer array → mapped to `errorLog`
  - `category`, `note`, `includeSelectionText` = scalars
- **D-04:** **Confidence→tier is PASSTHROUGH.** The caller passes `context.confidenceTier` as an already-determined string (`"green"` / `"yellow"` / `"red"`). The builder does NOT map numeric confidence. Rationale: the tier is NOT a pure numeric threshold — `yellow` specifically means *Tier-5 / 0.85-cap matched*, which only the citation pipeline knows, and it differs from `citation-ui.js`'s high/medium/low DISPLAY labels (0.95 / 0.80 thresholds). The numeric→tier mapping helper is a **Phase 4** deliverable, not Phase 2. Builder stays dumb about thresholds.

### Validation strictness (PAY-06)
- **D-05:** **Defensive guard — the builder THROWS** a descriptive `Error` on the three D-09 required-field violations: missing/empty `patentNumber`, `category` not in frozen `REPORT_CATEGORIES`, missing/empty `extensionVersion`. Fail-fast at the content-script source beats discovering the failure via a Worker 400 after a network round-trip. The Worker's D-09 400-gate REMAINS as defense-in-depth (not removed). Pure + Vitest-testable. All other fields are optional and defaulted (D-07).

### selectionText semantics + key order (PAY-06)
- **D-06:** When `includeSelectionText === false`, the builder **OMITS the `selectionText` key entirely** from the returned object (ROADMAP SC2: "absent — not null, not '' — entirely absent"). When `true`, `selectionText` is present (value = `context.selectionText`, or `null` if genuinely absent while toggle on). The Worker independently defaults absent→`null` in the KV record (report-schema.md) — consistent end state: KV always lands `null` when the field was omitted. This is the LONE exception to the "null when absent" rule.
- **D-07:** **Canonical key order = `report-schema.md` field-allowlist table order MINUS the 3 server-computed fields** (`fingerprint`, `timestamp`, `duplicate_count` — builder MUST NOT send these). The builder constructs the payload via explicit ordered object-literal construction so `JSON.stringify` is byte-stable (SC3). Deterministic shape per identical input ⇒ fingerprint reproducibility holds (two calls, identical inputs → byte-identical JSON).

### Defaults for missing optionals (PAY-06)
- **D-08:** Default rules for absent inputs:
  - `errorLog`: `errors ?? []` — always an array, `[]` when none (schema: "No (empty array)").
  - `note`: `note ?? null`.
  - `patentUrl`: derive `https://patents.google.com/patent/US{patentNumber}` when absent from `context` (so Phase 4's "what's included" preview shows the real URL; schema permits "server-derived" but client-deriving improves the preview).
  - All other nullable diagnostics (`returnedCitation`, `confidenceTier`, `browser`, `os`, `xpathNode`, `scrollY`, `viewportWidth`, `viewportHeight`, `pdfParseStatus`, `triggerMode`): `→ null` when absent.
  - `selectionText`: the exception — omitted-when-off per D-06.

### Claude's Discretion
- Exact string value of `MSG.SUBMIT_REPORT` (follow the kebab-case convention of existing `MSG` entries).
- JSDoc style and internal helper decomposition inside `report-payload-builder.js` (mirror the `tests/e2e/lib/issue-payload-builder.js` pure-function style per PAY-06: no `fs`/`path`/`child_process`, no `crypto` — server computes the fingerprint).
- Vitest file layout/structure (follow the existing extension Vitest patterns; assert the four SC items: allowlist-only output, selectionText omit/present, byte-stable serialization, constants importable + zero `chrome.*`).
- Error message wording for the D-05 validation throws.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Schema contract (the load-bearing input — authority on field shape)
- `worker/src/report-schema.md` — THE canonical KV field allowlist (20 fields). Builder output MUST conform field-for-field. Marks the 3 server-computed fields (`fingerprint`, `timestamp`, `duplicate_count`) the builder must NOT send; the 3 PAY-03 forbidden fields (`ip`, `clientIp`, `userAgent`) the builder must NEVER include; the nullable-vs-required column drives D-07/D-08.

### Requirements
- `.planning/REQUIREMENTS.md` — PAY-05 (constants additions, exact category list), PAY-06 (builder signature + pure/zero-chrome constraint + "mirror issue-payload-builder.js"), PAY-07 (the four Vitest coverage areas). REQUIREMENTS.md wins on any conflict.
- `.planning/ROADMAP.md` Phase 2 — the 4 Success Criteria (SC1 allowlist-only, SC2 selectionText absent-when-off, SC3 byte-identical JSON, SC4 importable + zero `chrome.*`).

### Prior-phase decisions carried in
- `.planning/phases/01-worker-route-kv-schema-privacy-compliance-groundwork/01-CONTEXT.md` — D-08 (Worker silently strips unknown fields), D-09 (Worker 400-rejects missing required: patentNumber / category∈4-frozen / extensionVersion) — the builder's D-05 mirrors this required set client-side.

### Pattern to mirror
- `tests/e2e/lib/issue-payload-builder.js` — the v3.1 pure-function payload-builder precedent (PAY-06 names it explicitly): exported budget/format constants, frozen config, no I/O, fingerprint passed in (not computed). Same architectural shape for `report-payload-builder.js`.

### Files this phase touches
- `src/shared/constants.js` — 43 lines; add to `MSG`, add `REPORT_CATEGORIES` + `WORKER_REPORT_URL`; fix the stale `constants-globals.js` header comment (D-01).
- `src/shared/report-payload-builder.js` — NEW pure module (PAY-06).
- Extension Vitest suite — NEW test file for the builder + constants assertions (PAY-07).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `tests/e2e/lib/issue-payload-builder.js` — direct structural precedent (pure builder, exported constants, frozen config, no I/O). Mirror its shape.
- `src/shared/constants.js` — existing `MSG` / `STATUS` / `PATENT_TYPE` frozen-ish export pattern; extend `MSG` and add two new named exports.

### Established Patterns
- Single shared ESM constants module bundled per-target by esbuild (IIFE for content scripts, ESM for background/offscreen) — NO separate classic-script globals file exists anymore (D-01). Adding to `constants.js` reaches every surface.
- Pure-function + Vitest-pinned modules in `src/shared/` (e.g. `matching.js`) test without a browser via `vi.stubGlobal` for `chrome.*` — but this phase's modules need NO chrome stubs because they make zero `chrome.*` calls (SC4 enforces this).

### Integration Points
- **Upstream contract:** `worker/src/report-schema.md` (Phase 1) defines the field allowlist the builder targets.
- **Downstream consumers:** Phase 3 (`MSG.SUBMIT_REPORT` dispatch + `WORKER_REPORT_URL` fetch target) and Phase 4 (calls `buildReportPayload()` with the live `context`; owns the numeric-confidence→`confidenceTier` mapping helper per D-04). The builder's D-03 input shape is the contract those phases must satisfy.

</code_context>

<specifics>
## Specific Ideas

- `confidenceTier` is a STRING passthrough (`green`/`yellow`/`red`), distinct from `citation-ui.js`'s high/medium/low display labels — `yellow` ≙ Tier-5 / 0.85-cap (D-04).
- Canonical payload key order is frozen to the report-schema.md table order (server-computed fields excluded) for byte-stable serialization (D-07).
- The stale `constants-globals.js` comment in `constants.js` gets corrected this phase (D-01) — a small but real doc-rot fix that prevents a future contributor recreating a redundant globals file.

</specifics>

<deferred>
## Deferred Ideas

- **Numeric confidence → tier mapping helper** — determining `green`/`yellow`/`red` from the citation pipeline's numeric confidence + Tier-5/0.85-cap signal belongs to **Phase 4** (the citation-UI wiring that knows which tier matched), NOT this pure builder. Captured as a Phase 4 dependency, not a Phase 2 task (D-04).
- **Error-log ring buffer capture (PAY-08)** — the `bugReportErrorBuffer` `chrome.storage.local` ring buffer is a **Phase 4** deliverable; Phase 2's builder only *consumes* an `errors` array passed in, it does not capture errors.

</deferred>

---

*Phase: 2-Shared Constants + Pure Payload Builder*
*Context gathered: 2026-06-12*

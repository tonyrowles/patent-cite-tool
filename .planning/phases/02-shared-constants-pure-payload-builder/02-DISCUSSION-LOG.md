# Phase 2: Shared Constants + Pure Payload Builder - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-12
**Phase:** 2-Shared Constants + Pure Payload Builder
**Areas discussed:** Builder input contract, Validation strictness, selectionText + key order, Defaults for missing optionals

---

## Area selection

| Option | Description | Selected |
|--------|-------------|----------|
| Builder input contract | Shape of context/settings/errors + who maps numeric confidence→tier | ✓ |
| Validation strictness | Throw-on-required-missing vs lean pass-through | ✓ |
| selectionText + key order | Omit-when-off + canonical byte-stable key order | ✓ |
| Defaults for missing optionals | errorLog [], note null, nullable diagnostics → null | ✓ |

**User's choice:** All four areas selected for discussion.

---

## Builder input contract

| Option | Description | Selected |
|--------|-------------|----------|
| Tier passthrough (caller pre-maps `confidenceTier` string) | Builder stays dumb; numeric→tier helper is a Phase 4 deliverable | ✓ |
| Builder maps numeric confidence → green/yellow/red internally | Single tested source for the mapping | |

**User's choice:** Lock all four as proposed → tier passthrough.
**Notes:** `yellow` ≙ Tier-5 / 0.85-cap matched (pipeline knowledge), distinct from citation-ui's high/medium/low display labels at 0.95/0.80 — so a pure numeric threshold in the builder would be wrong. Mapping deferred to Phase 4 wiring. (D-03, D-04)

---

## Validation strictness

| Option | Description | Selected |
|--------|-------------|----------|
| Defensive throw on required-missing | Builder throws Error on missing patentNumber / bad category / missing extensionVersion; Worker D-09 stays as defense-in-depth | ✓ |
| Lean pass-through | Builder trusts caller; Worker 400-gate is sole validator | |

**User's choice:** Lock all four as proposed → defensive throw.
**Notes:** Fail-fast at content-script source beats a Worker 400 after a network round-trip. Pure + Vitest-testable. (D-05)

---

## selectionText + key order

| Option | Description | Selected |
|--------|-------------|----------|
| Omit key entirely when toggle off + canonical key order | ROADMAP SC2 (absent, not null); Worker defaults KV→null; explicit ordered object literal for byte-stable JSON (SC3) | ✓ |

**User's choice:** Lock all four as proposed.
**Notes:** Consistent end state — omitted on wire ⇒ Worker stores null. Canonical order = report-schema.md table order minus the 3 server-computed fields. (D-06, D-07)

---

## Defaults for missing optionals

| Option | Description | Selected |
|--------|-------------|----------|
| errorLog→[], note→null, patentUrl→derived, other nullables→null, selectionText→omit-when-off | Schema-driven defaults; client-derive patentUrl for the Phase 4 preview | ✓ |

**User's choice:** Lock all four as proposed.
**Notes:** patentUrl client-derived (`.../patent/US{patentNumber}`) so Phase 4's "what's included" preview shows the real URL. (D-08)

---

## Claude's Discretion

- Exact `MSG.SUBMIT_REPORT` string value (kebab-case convention).
- JSDoc + internal helper decomposition in `report-payload-builder.js` (mirror `issue-payload-builder.js`).
- Vitest file layout (assert the 4 SC items).
- Validation throw message wording.

## Deferred Ideas

- Numeric confidence → tier mapping helper → **Phase 4** (citation-UI wiring knows which tier matched).
- Error-log ring buffer capture (PAY-08) → **Phase 4**; Phase 2 builder only consumes a passed-in `errors` array.

## Scouting finding (folded into D-01)

- `src/content/constants-globals.js` referenced in `constants.js`'s header comment **does not exist** — content scripts import `shared/constants` directly (esbuild-bundled). `constants.js` is already the single source of truth; the stale comment gets fixed this phase.

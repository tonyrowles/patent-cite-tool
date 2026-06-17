# Phase 10: Retirement + Scaffolding - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-17
**Phase:** 10-retirement-scaffolding
**Areas discussed:** v40-auto-fix.yml fate, Removal cascade scope, Delete vs archive-folder, REPORT_FIX_SCAFFOLD stub depth

---

## v40-auto-fix.yml fate (RTR-02)

| Option | Description | Selected |
|--------|-------------|----------|
| Delete entirely | Remove the whole file. Phase 12's v61-report-fix.yml is the new home; git history preserves it as a template. Cleanest — no dead synthetic path can resurface. | ✓ |
| Keep as dispatch-only relic | Leave the file but strip the issue/label job machinery so only workflow_dispatch remains. Keeps a live reference workflow but risks two confusingly-similar auto-fix YAMLs. | |

**User's choice:** Delete entirely
**Notes:** The `on:` block is already `workflow_dispatch:`-only, but dead job-level machinery (`if: github.event.label.name == 'triage'`, `github.event.issue.number`) remains. Phase 12 builds a separate `v61-report-fix.yml`, so v40 is dead weight.

---

## Removal cascade scope (RTR-01, RTR-05)

| Option | Description | Selected |
|--------|-------------|----------|
| Surgical prune | Delete inject-defect.mjs + its contract test, and drop only Site 4 from the drift test (keeps drift coverage on the 3 remaining sites). Minimal blast radius, suite stays green. | ✓ |
| Delete drift test too | Remove inject-defect.mjs, its contract test, AND the whole error-class-enumeration-drift test. Simpler but loses ERROR_CLASSES drift coverage across all sites. | |
| Keep drift, repoint Site 4 | Delete inject-defect.mjs + contract test, but rewire the drift test's Site 4 to another live ERROR_CLASSES source. Most coverage preserved, but more rework now. | |

**User's choice:** Surgical prune
**Notes:** `inject-defect.mjs` has a dedicated 8-test contract file (`e2e-inject-defect.test.js`) and is "Site 4" in `error-class-enumeration-drift.test.js`; `quarantine-append.mjs` only references it in comments.

---

## Delete vs archive-folder (RTR-01, RTR-03)

| Option | Description | Selected |
|--------|-------------|----------|
| Hard-delete | Remove the files; git history is the archive. Cleanest workspace, no dead-code rot in the tree. Recoverable anytime via git. | ✓ |
| Archive folder | Move into an archive/ directory in-tree. More discoverable without git, but leaves retired machinery visible and lint/test tooling may still need to ignore it. | |

**User's choice:** Hard-delete
**Notes:** Applies to retired CODE (inject-defect.mjs, e2e-explore.mjs). `.planning` docs are archived literally under `.planning/milestones/` per RTR-04 regardless.

---

## REPORT_FIX_SCAFFOLD stub depth (success criterion #5)

| Option | Description | Selected |
|--------|-------------|----------|
| Bare importable stub | Just enough to import from a known location — pure, passes the ESLint purity guard, clearly marked TODO. Lets Phase 12's research design the real scaffold without pre-committing to a shape it'll rework. | ✓ |
| Contract-shaped skeleton | Wire the envelope + diff-fence + src/shared fix-surface contract structure now, body TODO. De-risks Phase 12 with a real seam, but may pre-empt decisions Phase 12's research is meant to make. | |

**User's choice:** Bare importable stub
**Notes:** Phase 12 has its own research-phase to design the KV-report → matching-core prompt; the stub must stay pure to keep `eslint-fix-prompt-builder-guard.test.js` green.

---

## Claude's Discretion

- Exact archive note wording for `RESUME-V4.3.md` and the precise STATE.md phrasing for the voided re-enable checklist.
- Whether to soften vs. leave the provenance comments in `quarantine-append.mjs`.
- Stub naming/placement detail (entry in the frozen `PROMPT_SCAFFOLDS` map vs. a standalone export), as long as it's importable + pure.

## Deferred Ideas

None — discussion stayed within phase scope. Worker-route bug classes (`tool_not_working`, `pdfParseStatus:"error"`) remain out of v6.1 LLM fix scope (deferred to v6.2 per STATE.md) and are not introduced here.

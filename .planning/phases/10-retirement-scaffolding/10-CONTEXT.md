# Phase 10: Retirement + Scaffolding - Context

**Gathered:** 2026-06-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Cleanly remove the v4.3 autonomous auto-fix machinery and stand up the v6.1 workspace, **without changing any citation behavior**. Concretely:

- Remove the synthetic-defect injector (`tests/e2e/scripts/inject-defect.mjs`) and its CI/npm entry points (RTR-01)
- Strip the retired synthetic `issues: labeled` path so `v40-auto-fix.yml` cannot fire it (RTR-02)
- Archive/disable the autonomous `e2e:explore` exploration path (RTR-03)
- Archive the paused v4.3 Phase 61-67 artifacts + `RESUME-V4.3.md` under `.planning/milestones/`, record in STATE.md that the re-enable checklist is **superseded/voided** (RTR-04)
- Stub a `REPORT_FIX_SCAFFOLD` entry in `tests/e2e/lib/fix-prompt-builder.js` so Phase 12 can import from a known location (success criterion #5)
- Prove green: `npm test` exits 0 at ≥ current count and the 75-case golden corpus passes 100% (RTR-05)

**Not in scope:** any change to the `src/shared/` matching core (that's the Phase 12 fix surface), building the new triage/fix pipeline (Phases 11-12), or building `v61-report-fix.yml` (Phase 12).

</domain>

<decisions>
## Implementation Decisions

### v40-auto-fix.yml fate (RTR-02)
- **D-01:** **Delete `v40-auto-fix.yml` entirely.** Its `on:` block is already `workflow_dispatch:`-only, but it still carries dead job-level machinery (`if: github.event.label.name == 'triage'`, `github.event.issue.number` refs). Phase 12 builds a brand-new `v61-report-fix.yml` as the home for report-driven fixes, so the v40 file is dead weight. Git history preserves it as a template for Phase 12 to reference.
- **D-01a:** Before deleting, grep for other workflows/scripts that reference `v40-auto-fix.yml` by name (e.g. cross-links, status badges, docs) and clean those refs too so nothing dangles.
- **D-01b:** Removing it must NOT touch the inherited two-commit-ledger / cpr@v8 / `invokeAnthropicSdkWithLedger` / `safeAppendLedger` patterns that live in `scripts/` — those are reused by Phase 12. Only the YAML workflow file is retired here.

### Removal cascade scope (RTR-01, RTR-05)
- **D-02:** **Surgical prune.** Delete `tests/e2e/scripts/inject-defect.mjs` AND its dedicated contract test `tests/e2e/scripts/e2e-inject-defect.test.js` (the 8 MUTATOR contract tests I1-I8 — they test only the deleted file).
- **D-03:** In `tests/unit/error-class-enumeration-drift.test.js`, **drop only "Site 4"** (the `inject-defect.mjs` `ERROR_CLASSES` Set check) — keep the test alive for the 3 remaining drift sites. Removing the file without removing Site 4 would make the test fail to read the path and break RTR-05.
- **D-04:** `scripts/quarantine-append.mjs` references `inject-defect.mjs` only in **comments** (co-design provenance notes) — leave the runtime logic untouched; optionally soften the comment so it doesn't point at a deleted file. Verify no runtime import/spawn of `inject-defect.mjs` exists there.
- **D-05:** After pruning, re-run the full suite to confirm no other test/script imports the deleted module (grep `inject-defect` repo-wide must return only intentional/none).

### Disposition: delete vs archive (RTR-01, RTR-03)
- **D-06:** **Hard-delete retired CODE** — `inject-defect.mjs`, `scripts/e2e-explore.mjs`, and the `e2e:explore` npm script in `package.json`. Git history is the archive; keep the working tree clean (no dead-code rot, no lint/test ignore carve-outs). Recoverable anytime via git.
- **D-07:** `.planning` **docs are archived literally** (moved, not deleted) under `.planning/milestones/` per RTR-04 — this is a different rule from code. The v4.3 paused phase dirs already exist at `.planning/milestones/v4.3-phases-paused/` (61,62,64,65,66,67); move `RESUME-V4.3.md` (currently at `.planning/RESUME-V4.3.md`) into that archive and add a clear **"SUPERSEDED by v6.1 — re-enable checklist VOIDED"** note at its top.
- **D-08:** `e2e:explore` retirement = delete `scripts/e2e-explore.mjs` + remove the `"e2e:explore"` script from `package.json`. Running `npm run e2e:explore` must then be absent (npm errors helpfully) — satisfying RTR-03 + success criterion #4.

### REPORT_FIX_SCAFFOLD stub depth (success criterion #5)
- **D-09:** **Bare importable stub.** Add a `REPORT_FIX_SCAFFOLD` export/entry to `tests/e2e/lib/fix-prompt-builder.js` that is just enough to import from a known location — **pure** (no I/O / no `node:fs`/`node:child_process`/`node:path`/SDK imports so the ESLint purity guard in `tests/unit/eslint-fix-prompt-builder-guard.test.js` still passes), with the actual prompt body clearly marked TODO for Phase 12.
- **D-10:** Do NOT pre-build the envelope/diff-fence/fix-surface contract shape now — Phase 12 has its **own research-phase** to design the KV-report → matching-core prompt and would rework a fleshed skeleton. The stub only guarantees "subsequent phases can import from a known location without a file-not-found failure."
- **D-11:** If the existing frozen `PROMPT_SCAFFOLDS` map is the natural home, add the entry there consistently with the existing keys; otherwise a clearly-named standalone export is fine. Confirm whatever guard/enumeration tests pin this file still pass after the addition.

### RESUME-V4.3 / STATE.md bookkeeping (RTR-04)
- **D-12:** STATE.md must record that the `RESUME-V4.3.md` re-enable checklist is **voided** — specifically that the synthetic-trigger contract tests are **removed, not un-skipped**, and the restored-trigger steps (`issues: labeled`, `v40-auto-promote` `pull_request:closed`) are NOT to be restored. (Already partially reflected in STATE.md "Key Locked Decisions"; ensure it's explicit post-retirement.)

### Claude's Discretion
- Exact archive note wording for `RESUME-V4.3.md` and the precise STATE.md phrasing.
- Whether to soften vs. leave the provenance comments in `quarantine-append.mjs`.
- Stub naming/placement detail (map entry vs standalone export), as long as it's importable + pure.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` § "Phase 10: Retirement + Scaffolding" — goal, depends-on, 5 success criteria
- `.planning/REQUIREMENTS.md` — RTR-01..RTR-05 (the retirement requirement set)
- `.planning/STATE.md` — Key Locked Decisions (v6.1) + Bypass Conventions runbook (human-gate invariant, two-commit ledger split, `wrangler --remote` rule)

### v6.1 milestone research (read for context/pitfalls)
- `.planning/research/SUMMARY.md` — milestone synthesis
- `.planning/research/ARCHITECTURE.md` — pipeline shape, where retired pieces sat
- `.planning/research/PITFALLS.md` — known landmines (esp. ledger leak, bypass-merge)
- `.planning/research/FEATURES.md`, `.planning/research/STACK.md`

### To be archived this phase
- `.planning/RESUME-V4.3.md` — the voided re-enable checklist (move + add SUPERSEDED note)
- `.planning/milestones/v4.3-phases-paused/` — existing paused-phase archive (61,62,64,65,66,67)

### Memory (background, verify before relying)
- `project_v43_paused_for_bug_report` — v6.1 retires v4.3 machinery; **Phase 10 REMOVES the synthetic path, do NOT restore it**; `RESUME-V4.3.md` is voided
- `project_auto_fix_ledger_leak_vector` — `scripts/auto-fix.mjs` ledger-leak vector; watch when touching ledger-adjacent code

</canonical_refs>

<code_context>
## Existing Code Insights

### Files retired this phase
- `tests/e2e/scripts/inject-defect.mjs` (~25KB synthetic-defect injector) — DELETE
- `tests/e2e/scripts/e2e-inject-defect.test.js` (8 MUTATOR contract tests) — DELETE
- `scripts/e2e-explore.mjs` (autonomous explore driver; imports `safe-append-ledger.js`, `run-id.js`, etc.) — DELETE
- `.github/workflows/v40-auto-fix.yml` — DELETE (trigger already `workflow_dispatch:`-only; dead issue/label job machinery remains)
- `package.json` → `"e2e:explore": "node scripts/e2e-explore.mjs"` — REMOVE script entry

### Files edited (surgical) this phase
- `tests/unit/error-class-enumeration-drift.test.js` — drop only the `inject-defect.mjs` "Site 4" ERROR_CLASSES check (lines ~34/96/186/200/212/292), keep the other 3 sites
- `tests/e2e/lib/fix-prompt-builder.js` — add bare pure `REPORT_FIX_SCAFFOLD` stub (existing frozen `PROMPT_SCAFFOLDS` map at L483; pure `buildFixPrompt` at L534)
- `.planning/STATE.md` — record voided re-enable checklist
- `scripts/quarantine-append.mjs` — comment-only refs to `inject-defect.mjs` (L221/225); runtime untouched

### Guards / invariants to keep green
- `tests/unit/eslint-fix-prompt-builder-guard.test.js` — pins fix-prompt-builder.js purity (no fs/child_process/path/SDK imports); the stub MUST stay pure
- 75-case golden corpus + full `npm test` — RTR-05 proof that retirement changed no citation behavior

### Reuse preserved (do NOT remove — Phase 12 needs these)
- `invokeAnthropicSdkWithLedger`, `safeAppendLedger`, two-commit ledger split, cpr@v8 PR pattern (live in `scripts/`, inherited from v4.0/v4.2)

</code_context>

<specifics>
## Specific Ideas

- The phase's whole value is "prove nothing broke." Treat RTR-05 (green suite + 100% golden corpus) as the acceptance gate for every other change — run it after each deletion, not just at the end.
- Prefer `git diff --name-only` / repo-wide grep checks as part of execution to prove there are no dangling references to deleted modules.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. Worker-route bug classes (`tool_not_working`, `pdfParseStatus:"error"`) are already explicitly out of the v6.1 LLM fix scope (classified `infrastructure`, deferred to v6.2 per STATE.md locked decisions) and are not introduced here.

</deferred>

---

*Phase: 10-retirement-scaffolding*
*Context gathered: 2026-06-17*

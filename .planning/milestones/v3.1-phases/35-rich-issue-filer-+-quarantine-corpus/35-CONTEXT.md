# Phase 35: Rich Issue Filer + Quarantine Corpus - Context

**Gathered:** 2026-05-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 35 delivers the data-layer plumbing that turns Phase 34's `triage-report.json` into two persistent outputs: (a) richly-structured GitHub issues filed via an extended `scripts/e2e-report-issue.mjs --source triage`; (b) idempotent appends to a new `tests/e2e/test-cases-quarantine.js` corpus that Phase 36 will wire into the nightly CI. The pure-function `tests/e2e/lib/issue-payload-builder.js` enforces all per-section character budgets internally and emits a body with a fingerprint comment on line 1 to enable dual-version dedup. The existing `findMatchingIssue` is extended to search both v1 (`sha256(caseId | errorClass | "")`) and v2 (`sha256(caseId | errorClass | topOfStackHash)`) fingerprint formulas during the v3.1 transition. A human-gated `scripts/promote-from-quarantine.mjs` moves stable quarantine entries back to the golden `tests/test-cases.js` corpus and triggers per-case golden baseline regeneration.

**In scope:** pure builder `tests/e2e/lib/issue-payload-builder.js`; `--source triage` extension to `scripts/e2e-report-issue.mjs` (with `topOfStackHashFromTriage` helper); dual-search in `findMatchingIssue`; new `tests/e2e/test-cases-quarantine.js` corpus + Vitest schema-guard test; `scripts/quarantine-append.mjs` (idempotent upsert with stable_runs counter + auto-label of source GitHub issue); `scripts/promote-from-quarantine.mjs` (human-gated promotion + golden regen).

**Out of scope (Phase 36+):**
- `tests/e2e/specs/quarantine.spec.js` Playwright project — QUAR-03
- Quarantine + triage pipeline wiring into `e2e-nightly.yml` — QUAR-04, ORCH-01..03
- Weekly digest reading triage outputs — Phase 37
- Auto-PR promotion (`QUAR-AUTO-01`) — explicitly deferred per REQUIREMENTS.md "Future Requirements"
- Auto-close stale quarantine entries (`QUAR-AUTO-02`) — deferred

</domain>

<decisions>
## Implementation Decisions

### issue-payload-builder.js Design
- **D-01:** Module path: `tests/e2e/lib/issue-payload-builder.js`. Peer to `triage-classifier.js`, `rerun-validator.js`, `pdf-verifier.js`. Pure-function module, vitest-unit-testable in isolation. Exported entrypoint: `buildIssuePayload({triageFinding, iteration, rerunEntry, goldenCitation, reproducerCmd}) → {title, body, labels}`.
- **D-02:** Body section order is FIXED:
  1. Line 1: `<!-- fp: <12-hex-fingerprint> -->` HTML comment (per Phase 31 pre-lock — fingerprint on line 1 of body to prevent ≥65,536 char overflow displacement).
  2. `### Reproducer` — `reproducerCmd` + seed/case-id.
  3. `### Verifier Disagreement` — expected vs observed citation, tier (A/B/C), and PDF page-line excerpt.
  4. `### LLM Rationale` — `triageFinding.rationale` + `confidence`.
  5. `### Golden Diff` — unified diff between observed citation and `goldenCitation`.
- **D-03:** Character-budget enforcement is the BUILDER'S responsibility. Each section is truncated independently with a `…[truncated, full content in artifacts]` suffix when over budget. Per-section budgets (per ISSUE-04):
  - `LLM Rationale` ≤ 800 chars
  - `Verifier Disagreement` windows ≤ 600 chars each (expected + observed = 2 windows)
  - `Golden Diff` ≤ 400 chars
  - Reproducer command has no explicit budget (kept short by construction).
  Total body kept well under the GitHub 65,536-char issue body limit.
- **D-04:** Builder takes all inputs as required args. CLI is responsible for assembling them. Builder is PURE: same inputs → same output (string). No filesystem, no network. The labels array is computed from `triageFinding.category` + `'e2e-nightly'` (always-on) + `'triage'` (mode indicator).

### e2e-report-issue.mjs Extension (ISSUE-02, ISSUE-03)
- **D-05:** Add `--source <regression|triage>` flag to existing `scripts/e2e-report-issue.mjs`. Default = `regression` (preserves Phase 29 contract). When `triage`: accept additional `--triage-report <path>`; iterate `findings[]` filtered to {severity: 'critical' | 'high'} OR {category in CONFIRMED_CLASSES} (planner picks the exact filter — recommendation: severity ≥ 'high' OR rerun verdict === 'CONFIRMED').
- **D-06:** Each CONFIRMED finding becomes one issue via `buildIssuePayload(...)` + `gh issue create --title "<title>" --body-file "<tmp>" --label "<category>" --label "e2e-nightly" --label "triage"`. Mock-gh test asserts all label args passed. The `triage` label distinguishes Phase 35 issues from Phase 29 regression issues for downstream filtering.
- **D-07:** Dual-version fingerprint search in `findMatchingIssue`:
  - Compute v1 = `fingerprint(caseId, errorClass, '')` (existing constant-arg path)
  - Compute v2 = `fingerprint(caseId, errorClass, topOfStackHash)` (where `topOfStackHash` comes from `topOfStackHashFromCase` for regression source, OR new `topOfStackHashFromTriage(finding, rerunEntry, iteration)` for triage source).
  - Run `gh issue list --search "<v1>" --state open` AND `gh issue list --search "<v2>" --state open`. If either returns ≥1 hit → don't re-file. Vitest test runs the same finding through both v1 and v2 paths, asserts dedup.
- **D-08:** `topOfStackHashFromTriage` is a new helper in `scripts/e2e-report-issue.mjs` (kept close to existing `topOfStackHashFromCase`). Computes a stable 12-hex from finding-shaped inputs. Exact hash inputs: `JSON.stringify({rationale_first_30_chars: finding.rationale.slice(0,30), verifier_status: rerunEntry?.original_verdict_status ?? null, classification: iteration.classification})`. Test-friendly: same finding/rerun/iteration → same hash.

### Quarantine Corpus + Append Script (QUAR-01, QUAR-02)
- **D-09:** Quarantine corpus path: `tests/e2e/test-cases-quarantine.js`. Exports `TEST_CASES_QUARANTINE` (parallel to `tests/test-cases.js`'s `TEST_CASES`). Schema-guard test in `tests/unit/test-cases-quarantine-schema.test.js` (loaded by `vitest run` via the `test:src` script).
- **D-10:** Per-entry shape:
  ```
  {
    id: '<patent-id>-<categorization-suffix>',   // mirrors test-cases.js
    patentFile: './tests/fixtures/<patent>.json', // mirrors test-cases.js
    selectedText: '<the LLM selection text>',     // mirrors test-cases.js
    category: '<modern-short|modern-long|claims|cross-column|...>',  // mirrors test-cases.js
    // Quarantine-only metadata (NOT in test-cases.js):
    stable_runs: <int ≥ 1>,                       // increments on each re-encounter
    source_triage_finding_id: '<triage-report iteration_n + run_id composite>',
    added_iso: '<ISO timestamp of first observation>'
  }
  ```
  First 4 keys ARE identical to `TEST_CASES` entries — schema-guard asserts key set equality. Last 3 keys are quarantine-only.
- **D-11:** `scripts/quarantine-append.mjs` upsert semantics:
  - Read existing `tests/e2e/test-cases-quarantine.js` via dynamic import.
  - Idempotency key = entry `id`.
  - If entry `id` already exists: increment `stable_runs`. Update `added_iso` is NOT mutated (preserves first-observation timestamp).
  - If new: insert with `stable_runs: 1`, `added_iso: now()`.
  - Write back atomically via the same inline `atomicWriteJson`-style pattern (Phase 33 D-12). The file is JS module syntax, not JSON — use a deterministic stringifier (sorted keys per entry, then JSON.stringify, then wrap in `export const TEST_CASES_QUARANTINE = [...]` envelope). Vitest covers idempotency: append twice → 1 entry, `stable_runs === 2`.
- **D-12:** After append, if `stable_runs ≥ 3` AND the source triage GitHub issue exists and is open: `gh issue edit <issue-number> --add-label 'quarantine:ready-for-promotion'`. Idempotent (gh edit no-ops if label present). Vitest test mocks `gh` and asserts the label arg.

### Promotion + Golden Regeneration (QUAR-05)
- **D-13:** `scripts/promote-from-quarantine.mjs` is HUMAN-GATED — never invoked from CI; no auto-promotion. CLI signature: `node scripts/promote-from-quarantine.mjs --id <case-id> [--confirm]`. `--confirm` is required; without it, prints a dry-run plan and exits 0.
- **D-14:** Promotion flow (with `--confirm`):
  1. Locate entry in `tests/e2e/test-cases-quarantine.js` by `id`.
  2. Strip quarantine-only metadata (`stable_runs`, `source_triage_finding_id`, `added_iso`).
  3. Append the resulting 4-key entry to `tests/test-cases.js` (the golden corpus).
  4. Remove the entry from `tests/e2e/test-cases-quarantine.js`.
  5. Invoke `scripts/update-golden.js --case <id> --confirm` via `spawnSync` to regenerate the golden baseline for the promoted case. Exits 1 if any step fails (atomic via try/catch + git-aware rollback). Prints git diff summary at end.
- **D-15:** Vitest coverage for `promote-from-quarantine.mjs`:
  - Mock filesystem (tmpDir cloned corpus pair).
  - Mock spawnSync for `update-golden.js` invocation.
  - Assert: entry appears in cloned `test-cases.js`, removed from cloned `test-cases-quarantine.js`, `update-golden.js` invoked with correct `--case <id> --confirm` args.
  - End-to-end smoke runs against a tmpDir clone of the real corpus pair so the test cleans up after itself (no mutation of committed files).
- **D-16:** No new npm dependencies. All primitives reused: existing `scripts/e2e-report-issue.mjs` fingerprint + `gh` shellout pattern; existing `scripts/update-golden.js` per-case regen; existing `child_process.spawnSync`; existing dynamic-import-of-ES-module pattern (Phase 32 + 33 already use this).

### Claude's Discretion
- Exact CONFIRMED-finding filter for `e2e-report-issue.mjs --source triage` (D-05) — recommendation: `severity in {critical, high}` OR `rerun verdict === CONFIRMED`. Planner picks final predicate.
- Exact hash inputs in `topOfStackHashFromTriage` (D-08) — the recommendation lists a 3-field set; planner may refine if it discovers a more stable signal.
- The dry-run output format for `promote-from-quarantine.mjs --id <case-id>` (no `--confirm`) — recommendation: tabular summary listing source quarantine entry, target test-cases.js insert point, golden file path.
- Whether the JS-module stringifier in `quarantine-append.mjs` uses single quotes or double quotes around string values — recommendation: single quotes to match `tests/test-cases.js` existing style.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope + requirements
- `.planning/ROADMAP.md` §"Phase 35: Rich Issue Filer + Quarantine Corpus"
- `.planning/REQUIREMENTS.md` §ISSUE (ISSUE-01..04), §QUAR (QUAR-01, QUAR-02, QUAR-05)
- `.planning/research/SUMMARY.md` §"Phase 4: Rich Issue Filer + Quarantine Corpus"
- `.planning/research/PITFALLS.md` (any pitfalls specific to issue filing or quarantine)

### Existing code that Phase 35 extends or depends on
- `scripts/e2e-report-issue.mjs` — Phase 29 entrypoint. EXTENDED with `--source triage`, `--triage-report`, `topOfStackHashFromTriage`, dual-search in `findMatchingIssue`.
- `scripts/e2e-report-issue.mjs::fingerprint()` (line 49) — existing v1/v2 fingerprint function (already takes the third arg; v1 = empty string, v2 = topOfStackHash).
- `scripts/e2e-report-issue.mjs::topOfStackHashFromCase()` (line 65) — existing v2 hash for regression source.
- `tests/test-cases.js` — golden corpus. SCHEMA REFERENCE for the new quarantine corpus. NOT modified by Phase 35 except via `promote-from-quarantine.mjs`.
- `scripts/update-golden.js` — existing per-case golden regen tool. INVOKED via spawnSync by `promote-from-quarantine.mjs`.
- `tests/e2e/lib/triage-classifier.js` (Phase 34) — emits the input `triage-report.json` consumed by `e2e-report-issue.mjs --source triage` and `quarantine-append.mjs`.
- `tests/e2e/lib/rerun-validator.js` (Phase 33) — emits the `rerun-report.json` used as auxiliary input.
- `tests/e2e/lib/llm-report.js` (Phase 33 schema_version: 1) — emits the source `llm-report.json`.
- `tests/e2e/lib/error-codes.js::ERROR_CLASSES` — `category` field uses these strings.

### Pre-locked decisions to honor (from research SUMMARY)
- Fingerprint comment on line 1 of body (D-02 implements this — 65,536-char overflow protection)
- Per-section char budgets ≤800 / ≤600 / ≤400 (D-03 enforces in builder)
- Fingerprint additive-only (v1 immutable, v2 adds `topOfStackHash` for new error classes — D-07 dual-search)
- Quarantine schema identical to test-cases.js for the canonical 4 keys (D-09/D-10)
- Promotion stays human-gated (D-13 — no auto-promotion in v3.1)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scripts/e2e-report-issue.mjs::fingerprint(caseId, errorClass, topOfStackHash)` — already accepts the 3rd arg; v1 uses empty string, v2 uses the hash. No change needed; new call site uses both.
- `scripts/e2e-report-issue.mjs::topOfStackHashFromCase()` — pattern for the new `topOfStackHashFromTriage` helper.
- `scripts/e2e-report-issue.mjs::findMatchingIssue()` (need to read current impl) — extended for dual-search.
- `scripts/e2e-report-issue.mjs::buildIssueTitle()` (line 129) — existing title builder; the new builder uses a triage-flavored variant.
- `scripts/update-golden.js` — existing tool with `--case <id> --confirm` pattern. Invoked by `promote-from-quarantine.mjs` via spawnSync.
- `tests/test-cases.js::TEST_CASES` — schema reference for quarantine entries. Schema-guard test asserts key set equality on the first-4-keys.
- `tests/e2e/lib/llm-report.js::atomicWriteJson` (inline pattern) — reused for atomic writes to JS-module files in `quarantine-append.mjs`.
- `scripts/e2e-rerun-validator.mjs` + `scripts/e2e-triage-classifier.mjs` — CLI shim patterns for `quarantine-append.mjs` and `promote-from-quarantine.mjs`.

### Established Patterns
- **Pure-data lib modules** (llm-report.js, rerun-validator.js, triage-classifier.js, now issue-payload-builder.js) — pure functions, injected deps, vitest-unit-testable.
- **gh CLI shellout via `child_process.spawnSync`** — Phase 29 pattern in `e2e-report-issue.mjs`. Mock-gh tests run the script with `GH_BIN_OVERRIDE=...` env var or by mocking spawnSync directly.
- **Idempotent JS-module write** — read via dynamic import, modify in memory, deterministic stringify, atomic write. Same pattern would apply to `quarantine-append.mjs`.
- **Vitest tmpDir corpus clone** — clone real corpus to a tmpDir before mutation tests so committed files stay clean.
- **CLI strict parseArgs (--input/--id/--confirm)** — established by `e2e-rerun-validator.mjs` and `e2e-triage-classifier.mjs`. New scripts follow.

### Integration Points
- `issue-payload-builder.js` ↔ `scripts/e2e-report-issue.mjs --source triage` (CLI calls builder, passes inputs from triage-report.json + llm-report.json + rerun-report.json + golden corpus + reproducer template)
- `e2e-report-issue.mjs --source triage` ↔ `gh issue create` (mock-gh in tests)
- `quarantine-append.mjs` ↔ `tests/e2e/test-cases-quarantine.js` (writes the corpus)
- `quarantine-append.mjs` ↔ `gh issue edit` (labels source triage issue with `quarantine:ready-for-promotion` when `stable_runs ≥ 3`)
- `promote-from-quarantine.mjs` ↔ `tests/test-cases.js` + `tests/e2e/test-cases-quarantine.js` + `scripts/update-golden.js`

</code_context>

<specifics>
## Specific Ideas

- The user accepts D-02's section ordering with `<!-- fp: ... -->` on line 1 + 4 markdown-header sections.
- The user accepts D-03 putting char-budget enforcement INSIDE the builder (not the caller).
- The user accepts D-07's dual-search (v1 + v2 fingerprints) for the v3.1 transition.
- The user accepts D-09's `tests/e2e/test-cases-quarantine.js` location (not tests/ root) per roadmap.
- The user accepts D-13's human-gate on `promote-from-quarantine.mjs` (`--confirm` flag required for mutation).
- The user accepts D-15's tmpDir corpus clone pattern for tests (no mutation of committed state).

</specifics>

<deferred>
## Deferred Ideas

- **Auto-promotion via N-consecutive-green PR** (`QUAR-AUTO-01` per REQUIREMENTS.md) — explicitly out of scope; human gate stays for v3.1.
- **Auto-close stale quarantine entries** (`QUAR-AUTO-02`) — deferred.
- **Quarantine spec running in CI** (QUAR-03 + QUAR-04) — Phase 36.
- **Pipeline orchestrator chaining rerun → triage → issue → quarantine** (ORCH-01..03) — Phase 36.
- **Migrating all v1 fingerprints to v2** — destructive, not needed per dual-search transition.
- **`@octokit/rest` migration of the issue filer** — explicitly out of scope per REQUIREMENTS.md (existing `gh` CLI path is fine).

</deferred>

---

*Phase: 35-rich-issue-filer-+-quarantine-corpus*
*Context gathered: 2026-05-27*

# Phase 35: Rich Issue Filer + Quarantine Corpus — Research

**Researched:** 2026-05-27
**Domain:** GitHub issue payload assembly + idempotent JS-module corpus management + human-gated promotion CLI
**Confidence:** HIGH

## Summary

Phase 35 turns Phase 34's `triage-report.json` into two persistent outputs: (a) richly-structured GitHub issues filed via an extended `scripts/e2e-report-issue.mjs --source triage` and (b) idempotent append/upsert into a new `tests/e2e/test-cases-quarantine.js` corpus. Every primitive needed already exists in the codebase: `fingerprint()`/`findMatchingIssue()`/`buildIssueTitle()` are exported pure functions in `scripts/e2e-report-issue.mjs`; `atomicWriteJson` is an established 3-copy inlined pattern (`llm-report.js`, `rerun-validator.js`, `triage-classifier.js`); the dynamic-import-of-ES-module pattern for reading-modifying JS module files is in `update-golden.js`; the CLI shim pattern (strict `--input` parseArgs, equals-syntax rejection, CI gate, sibling auto-discovery) is locked in `scripts/e2e-rerun-validator.mjs` and `scripts/e2e-triage-classifier.mjs`. The Vitest+spawnSync CLI integration test pattern is locked in `tests/e2e/scripts/e2e-rerun-validator.test.js` (tmpDir + fixture copy + spawn + 3000ms timeout + WR-07 stderr-absence pattern).

**Primary recommendation:** Build five files in this order — (1) `tests/e2e/lib/issue-payload-builder.js` (pure builder, no I/O); (2) extend `scripts/e2e-report-issue.mjs` with `--source triage`, `topOfStackHashFromTriage`, and dual-search `findMatchingIssue`; (3) seed empty `tests/e2e/test-cases-quarantine.js` + Vitest schema-guard in `tests/unit/test-cases-quarantine-schema.test.js`; (4) `scripts/quarantine-append.mjs` (idempotent upsert + ready-for-promotion label); (5) `scripts/promote-from-quarantine.mjs` (human-gated, `--confirm` flag, spawnSync into `update-golden.js`). All five are unit-testable in isolation; the only integration touch points are mock-gh (in-memory ghClient) and tmpDir corpus clones. ZERO new npm dependencies — the constraint is locked by CONTEXT.md D-16 and re-confirmed by every existing v3.1 phase.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Issue body assembly (pure formatting + budget enforcement) | Lib (Node, pure) | — | Pure transform of {triageFinding, iteration, rerunEntry, goldenCitation, reproducerCmd} → {title, body, labels}; vitest-isolated |
| Fingerprint computation + dedup search | Lib (Node, pure) | — | Already lives in `scripts/e2e-report-issue.mjs` as pure exports; dual-search is a 1-line extension |
| GitHub I/O (issue create / comment / edit / list) | CLI (`scripts/e2e-report-issue.mjs`) | gh CLI shellout | Existing makeRealGhClient pattern; tests inject mock ghClient |
| Quarantine corpus read-modify-write | CLI (`scripts/quarantine-append.mjs`) | Dynamic import + atomicWriteJson | JS-module format (not JSON), so dynamic import for read + deterministic stringify for write |
| Quarantine entry promotion + golden regen | CLI (`scripts/promote-from-quarantine.mjs`) | spawnSync(`update-golden.js`) | Human-gated; never auto-invoked; tests run against tmpDir clones |
| Schema-drift prevention (test-cases-quarantine.js vs test-cases.js) | Vitest (`tests/unit/test-cases-quarantine-schema.test.js`) | — | Runs in `npm run test:src`; gates every CI push |

<user_constraints>
## User Constraints (from 35-CONTEXT.md)

### Locked Decisions

**issue-payload-builder.js Design**
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

**e2e-report-issue.mjs Extension**
- **D-05:** Add `--source <regression|triage>` flag. Default = `regression` (preserves Phase 29 contract). When `triage`: accept additional `--triage-report <path>`; iterate `findings[]` filtered to {severity: 'critical' | 'high'} OR {category in CONFIRMED_CLASSES} (planner picks the exact filter — recommendation: severity ≥ 'high' OR rerun verdict === 'CONFIRMED').
- **D-06:** Each CONFIRMED finding becomes one issue via `buildIssuePayload(...)` + `gh issue create --title "<title>" --body-file "<tmp>" --label "<category>" --label "e2e-nightly" --label "triage"`. Mock-gh test asserts all label args passed.
- **D-07:** Dual-version fingerprint search in `findMatchingIssue`:
  - Compute v1 = `fingerprint(caseId, errorClass, '')` (existing constant-arg path)
  - Compute v2 = `fingerprint(caseId, errorClass, topOfStackHash)` (where `topOfStackHash` comes from `topOfStackHashFromCase` for regression source, OR new `topOfStackHashFromTriage(finding, rerunEntry, iteration)` for triage source).
  - Run `gh issue list --search "<v1>" --state open` AND `gh issue list --search "<v2>" --state open`. If either returns ≥1 hit → don't re-file.
- **D-08:** `topOfStackHashFromTriage` is a new helper in `scripts/e2e-report-issue.mjs` (kept close to existing `topOfStackHashFromCase`). Exact hash inputs: `JSON.stringify({rationale_first_30_chars: finding.rationale.slice(0,30), verifier_status: rerunEntry?.original_verdict_status ?? null, classification: iteration.classification})`.

**Quarantine Corpus + Append Script**
- **D-09:** Quarantine corpus path: `tests/e2e/test-cases-quarantine.js`. Exports `TEST_CASES_QUARANTINE` (parallel to `tests/test-cases.js`'s `TEST_CASES`). Schema-guard test in `tests/unit/test-cases-quarantine-schema.test.js` (loaded by `vitest run` via the `test:src` script).
- **D-10:** Per-entry shape: `{id, patentFile, selectedText, category, stable_runs, source_triage_finding_id, added_iso}`. First 4 keys identical to `TEST_CASES` entries — schema-guard asserts key set equality. Last 3 keys are quarantine-only.
- **D-11:** `scripts/quarantine-append.mjs` upsert: read existing via dynamic import; idempotency key = entry `id`; if exists → increment `stable_runs`, preserve `added_iso`; if new → insert with `stable_runs: 1`. Write back atomically via deterministic JS-module stringifier (sorted keys per entry, then JSON.stringify, then wrap in `export const TEST_CASES_QUARANTINE = [...]` envelope).
- **D-12:** After append, if `stable_runs ≥ 3` AND source triage GitHub issue exists and is open: `gh issue edit <issue-number> --add-label 'quarantine:ready-for-promotion'`. Idempotent.

**Promotion + Golden Regeneration**
- **D-13:** `scripts/promote-from-quarantine.mjs` is HUMAN-GATED — never invoked from CI; no auto-promotion. CLI: `node scripts/promote-from-quarantine.mjs --id <case-id> [--confirm]`. Without `--confirm`: dry-run plan, exit 0.
- **D-14:** Promotion flow (with `--confirm`):
  1. Locate entry in `tests/e2e/test-cases-quarantine.js` by `id`.
  2. Strip quarantine-only metadata.
  3. Append the resulting 4-key entry to `tests/test-cases.js`.
  4. Remove the entry from `tests/e2e/test-cases-quarantine.js`.
  5. Invoke `scripts/update-golden.js --case <id> --confirm` via `spawnSync`. Exits 1 if any step fails (atomic via try/catch + git-aware rollback). Prints git diff summary at end.
- **D-15:** Vitest coverage for `promote-from-quarantine.mjs`: mock filesystem (tmpDir cloned corpus pair); mock spawnSync for `update-golden.js`; assert entry moves correctly + spawnSync invoked with correct args. End-to-end smoke runs against a tmpDir clone of the real corpus pair (no mutation of committed files).
- **D-16:** No new npm dependencies. All primitives reused: existing `scripts/e2e-report-issue.mjs` fingerprint + `gh` shellout pattern; existing `scripts/update-golden.js` per-case regen; existing `child_process.spawnSync`; existing dynamic-import-of-ES-module pattern.

### Claude's Discretion

- Exact CONFIRMED-finding filter for `e2e-report-issue.mjs --source triage` (D-05) — recommendation: `severity in {critical, high}` OR `rerun verdict === CONFIRMED`. Planner picks final predicate. **Research recommendation:** combine both with logical OR — `severity in {critical,high} OR rerunEntry.verdict === 'CONFIRMED'`. The rationale: severity is the triage classifier's authoritative product-impact signal, but rerun-CONFIRMED is the strongest reproducibility signal; either alone is sufficient cause to file. Add an explicit Vitest test pinning the predicate to prevent silent drift.
- Exact hash inputs in `topOfStackHashFromTriage` (D-08) — D-08 already specifies a 3-field tuple `{rationale_first_30_chars, verifier_status, classification}`. **Research recommendation:** ship D-08 verbatim. The 3 fields are deliberately chosen to (a) be stable across re-runs (rationale prefix changes only if the LLM produces meaningfully different text; verifier_status is enum-bounded; classification is enum-bounded), and (b) provide enough entropy for the new error classes that the v1 formula could collide on. Adding more fields would risk the same fingerprint-coarseness problem in reverse (over-segmenting near-identical failures).
- The dry-run output format for `promote-from-quarantine.mjs --id <case-id>` (no `--confirm`) — recommendation: tabular summary. **Research recommendation:** 4-row table: source quarantine entry (id + selectedText preview + stable_runs), target `test-cases.js` insert point (line number where append will occur), golden file path (`tests/golden/baseline.json` — current baseline.json[id] before regen), and the spawnSync command that would be invoked. Use plain text, not markdown — output is read by humans on a terminal.
- Single vs double quotes for string values in the JS-module stringifier in `quarantine-append.mjs` — recommendation: single quotes to match `tests/test-cases.js` existing style. **Research recommendation:** use single quotes AND export a `formatEntry(entry)` pure helper so the stringification rule is testable in isolation. The committed `test-cases.js` uses single quotes uniformly (confirmed by inspection — every `selectedText:` line is single-quoted; unicode escapes use `“`/`”`).

### Deferred Ideas (OUT OF SCOPE)

- **Auto-promotion via N-consecutive-green PR** (`QUAR-AUTO-01`) — explicitly out of scope; human gate stays for v3.1.
- **Auto-close stale quarantine entries** (`QUAR-AUTO-02`) — deferred.
- **Quarantine spec running in CI** (QUAR-03 + QUAR-04) — Phase 36.
- **Pipeline orchestrator chaining rerun → triage → issue → quarantine** (ORCH-01..03) — Phase 36.
- **Migrating all v1 fingerprints to v2** — destructive, not needed per dual-search transition.
- **`@octokit/rest` migration of the issue filer** — explicitly out of scope per REQUIREMENTS.md.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ISSUE-01 | `lib/issue-payload-builder.js` assembles issue body with reproducer command + seed, verifier disagreement detail (expected vs observed + tier + PDF snippet link), LLM classifier rationale + confidence, diff vs last-known-good golden citation | Standard Stack (Node 22 built-ins); Architecture Pattern 1 (Pure-data lib); Code Examples §"Issue body builder skeleton" |
| ISSUE-02 | `scripts/e2e-report-issue.mjs` accepts `--source triage` flag and applies errorClass as a GitHub label (in addition to body) | Code Examples §"--source flag + label args"; Pattern 3 (gh CLI shellout); gh CLI version 2.83.1 confirmed supports `--label` repeated args |
| ISSUE-03 | Fingerprint scheme extended additively; `findMatchingIssue` performs dual-search across v1 and v2 fingerprint formulas during transition (no retroactive dedup breakage) | Code Examples §"dual-search findMatchingIssue"; `fingerprint()` already accepts the 3rd arg (line 49 of e2e-report-issue.mjs) |
| ISSUE-04 | Per-section character budgets enforced: LLM rationale ≤800 chars, verifier windows ≤600 chars each, golden diff ≤400 chars; fingerprint comment on line 1 of body (prevents >65,536 char overflow) | Code Examples §"truncate(text, budget)"; Pitfall 1 (line-1 fingerprint placement); Vitest assertions on body.indexOf('<!-- fp:') === 0 |
| QUAR-01 | `tests/e2e/test-cases-quarantine.js` exists with schema identical to `test-cases.js`; vitest schema-guard test in `test:src` suite prevents drift | Code Examples §"schema-guard test"; Pattern 4 (Schema-guard test, mirrors `cache-version.test.js` pattern) |
| QUAR-02 | `scripts/quarantine-append.mjs` idempotently upserts CONFIRMED triaged findings into the quarantine corpus | Code Examples §"upsert logic"; Architecture Pattern 2 (Idempotent JS-module write); Pitfall 4 (deterministic stringification ordering) |
| QUAR-05 | `scripts/promote-from-quarantine.mjs` human-triggered utility moves a quarantine entry into `test-cases.js` and regenerates the golden baseline for that case; cases with `stable_runs ≥ 3` auto-tagged `quarantine:ready-for-promotion` | Code Examples §"promote-from-quarantine skeleton"; Open Question 1 (`update-golden.js --case <id>` not yet implemented — flagged for planner) |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node 22 built-ins (`node:fs`, `node:path`, `node:child_process`, `node:crypto`, `node:url`) | bundled with v24.11.1 runtime | All I/O, hashing, subprocess invocation for new lib + CLI | `[VERIFIED: node --version → v24.11.1]` Zero new deps is a locked decision (D-16). Every other v3.1 phase ships under this constraint. |
| `vitest` | `^3.0.0` (existing) | Unit tests for the pure builder, schema-guard, CLI spawnSync tests | `[VERIFIED: package.json line 35]` Used in `npm run test:src`; all of v3.0/v3.1 testing already on vitest 3.x |
| `gh` CLI (system) | `2.83.1 (2025-11-13)` | Subprocess shellout for issue create/edit/list/search | `[VERIFIED: gh --version 2.83.1]` Already auth'd; existing `e2e-report-issue.mjs` uses execSync wrapper; `--label`, `--body-file -`, `--add-label`, `--search`, `--state` flags all confirmed |
| Playwright `@playwright/test` | `1.60.0` (existing) | Not directly used by Phase 35 code — but `tests/e2e/scripts/*.test.js` tests run under vitest (NOT Playwright). No Playwright change in this phase. | `[VERIFIED: package.json]` Phase 36 wires the quarantine corpus into Playwright; Phase 35 only creates the corpus file. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:crypto` `createHash` | bundled | Compute the 12-hex fingerprint + the `topOfStackHashFromTriage` 12-hex | Already imported at line 19 of `e2e-report-issue.mjs`; reuse |
| `node:child_process` `spawnSync` | bundled | Invoke `gh` from the CLI shim (existing) AND `scripts/update-golden.js --case <id> --confirm` from `promote-from-quarantine.mjs` | Existing `execSync` pattern in `e2e-report-issue.mjs`; new `promote-from-quarantine.mjs` should use `spawnSync` (per D-14 step 5) for return-value capture |
| `node:fs` `mkdtempSync` / `cpSync` | bundled | Vitest tests clone the corpus pair into a tmpDir before mutation | `tests/e2e/scripts/e2e-rerun-validator.test.js` lines 79-86 already do this — copy the pattern verbatim |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `gh issue list --search <fp1> --state open` + `gh issue list --search <fp2> --state open` (two calls) | `gh issue list --search "<fp1> OR <fp2>" --state open` (one call) | GitHub search-syntax supports OR operators (verified via gh issue list `--help` reference to GitHub search docs), BUT splitting into two calls keeps the dedup logic symmetric — each call returns at most ~30 issues, both can be parsed identically, and the OR query syntax is less battle-tested. **Recommend two calls.** |
| Diff library (e.g., `diff`, `jsdiff`) for the `### Golden Diff` section | Hand-rolled unified-diff between observed and golden citation strings | The citation values are short strings like `"5:10-11"` and `"6:12-13"`. A line-by-line unified diff is overkill — `Expected: <golden>\nObserved: <observed>` with simple character-level highlighting (e.g., `[CHANGED: 5→6]`) fits in ≤400 chars trivially. **Hand-roll a 5-line diff formatter.** Sticks to zero-dep constraint (D-16). |
| `@octokit/rest` for issue create/edit/list | Existing `gh` CLI shellout via `execSync`/`spawnSync` | `gh` is already auth'd via the developer's PAT/`gh auth login`; switching to Octokit would require `GH_TOKEN` plumbing, adds a 200+ KB dep, and the mock-gh DI pattern is already battle-proven. **Out of scope per REQUIREMENTS.md "Out of Scope" table.** |
| JSON corpus instead of JS-module corpus for quarantine | A `.json` file in `tests/e2e/` parallel to `tests/test-cases.js` | The `tests/test-cases.js` golden corpus is a JS module (uses `“`/`”` unicode escapes for typographic quotes). Promotion D-14 requires moving an entry between the two — schema mismatch (JSON vs JS) would force conversion at promotion time. **Match the JS-module format.** |

**Installation:**
```bash
# No new npm packages. All deps are bundled (Node 22 built-ins, system gh CLI, existing vitest).
# Verify environment:
node --version       # v24.11.1 ✓
gh --version         # 2.83.1 ✓
gh auth status       # authenticated ✓ (developer must confirm at phase start)
npx vitest --version # 3.x ✓ (from package.json devDependencies)
```

**Version verification:**
- `[VERIFIED: node --version → v24.11.1]` Node 22 LTS+; supports `node:` prefix imports, top-level await, `fs.cpSync`, `fs.mkdtempSync`, `spawnSync` with timeout.
- `[VERIFIED: gh --version → 2.83.1 (2025-11-13)]` — supports `gh issue create --label`, `--body-file -`, `gh issue edit <n> --add-label`, `gh issue list --search <query> --state open`.
- `[VERIFIED: package.json line 35 → vitest "^3.0.0"]` — existing Vitest 3.x install covers all Phase 35 tests.
- `[VERIFIED: package.json line 33 → @playwright/test 1.60.0]` — not used by Phase 35 itself; quarantine corpus file is JS-module schema-compatible with Playwright but Playwright wiring is Phase 36.

## Package Legitimacy Audit

> Phase 35 installs NO new packages (D-16 locked).
> The slopcheck gate would normally guard this section; with zero installs, the gate is N/A.
> The CLI shims and library modules invoke `gh` (system binary) and import only Node built-ins + existing repo modules.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| (none — D-16 forbids new npm deps) | — | — | — | — | N/A | — |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

*Slopcheck protocol was not exercised in this phase because zero packages are installed. If a planner ever proposes adding a dep here, the slopcheck gate MUST run before approval — the D-16 constraint is the easiest enforcement.*

## Architecture Patterns

### System Architecture Diagram

```
                    triage-report.json
                    (Phase 34 output)
                          │
                          │ findings[]
                          ▼
              ┌─────────────────────────┐
              │  CONFIRMED filter       │   D-05: severity∈{critical,high}
              │  (D-05 predicate)       │         OR rerun.verdict==='CONFIRMED'
              └──────────┬──────────────┘
                         │
                         ├─────────────────────────────┐
                         │                             │
                         ▼                             ▼
        ┌────────────────────────┐      ┌──────────────────────────┐
        │ For each finding:      │      │ For each CONFIRMED:      │
        │ assemble inputs        │      │ scripts/                 │
        │ - llm-report iter      │      │ quarantine-append.mjs    │
        │ - rerun-report entry   │      │   - dynamic import       │
        │ - golden citation      │      │   - upsert by id         │
        │ - reproducer cmd       │      │   - stable_runs++        │
        └──────────┬─────────────┘      │   - atomicWriteJson      │
                   │                    └────────────┬─────────────┘
                   ▼                                 │
        ┌──────────────────────────┐                 ▼
        │ tests/e2e/lib/           │   ┌──────────────────────────┐
        │ issue-payload-builder.js │   │ test-cases-quarantine.js │
        │   buildIssuePayload({…}) │   │   (committed to repo)    │
        │   - line-1 fp comment    │   └────────────┬─────────────┘
        │   - 5-section body       │                │
        │   - ≤budget per section  │                │ if stable_runs ≥ 3
        │   - labels[]             │                ▼
        └──────────┬───────────────┘   ┌──────────────────────────┐
                   │                   │ gh issue edit <n>        │
                   │ {title, body,     │  --add-label             │
                   │  labels}          │  quarantine:ready-       │
                   ▼                   │  for-promotion           │
        ┌──────────────────────────┐   └──────────────────────────┘
        │ scripts/                 │
        │ e2e-report-issue.mjs     │   D-07: dual-search
        │   --source triage        │   gh issue list --search v1
        │                          │   gh issue list --search v2
        │   findMatchingIssue:     │   if either hits → no re-file
        │   v1 + v2 fingerprint    │
        │   search                 │
        └──────────┬───────────────┘
                   │
                   ▼
        ┌──────────────────────────┐
        │ gh issue create          │
        │   --title <…>            │
        │   --body-file <tmp>      │
        │   --label <category>     │
        │   --label e2e-nightly    │
        │   --label triage         │
        └──────────────────────────┘

  ────────────────────────────────────────────────────────
  HUMAN-ONLY PATH (never CI, never automatic)
  ────────────────────────────────────────────────────────

        Developer runs: node scripts/promote-from-quarantine.mjs \
                            --id <case-id> --confirm
                          │
                          ▼
        ┌──────────────────────────┐
        │ promote-from-quarantine  │
        │   1. find entry by id    │
        │   2. strip 3 meta fields │
        │   3. append to           │
        │      tests/test-cases.js │
        │   4. remove from         │
        │      test-cases-         │
        │      quarantine.js       │
        │   5. spawnSync           │
        │      update-golden.js    │
        │      --case <id>         │
        │      --confirm           │
        └──────────────────────────┘
```

### Recommended Project Structure

```
patent-cite-tool/
├── tests/
│   ├── test-cases.js                          # golden corpus (UNCHANGED; written by promotion only)
│   ├── e2e/
│   │   ├── lib/
│   │   │   ├── issue-payload-builder.js       # NEW (D-01)
│   │   │   ├── triage-classifier.js           # Phase 34 (UNCHANGED)
│   │   │   ├── rerun-validator.js             # Phase 33 (UNCHANGED)
│   │   │   └── llm-report.js                  # Phase 33 (UNCHANGED)
│   │   ├── test-cases-quarantine.js           # NEW (D-09) — initially `export const TEST_CASES_QUARANTINE = [];`
│   │   └── scripts/
│   │       └── e2e-report-issue-triage.test.js  # NEW — spawnSync CLI test for --source triage
│   ├── unit/
│   │   ├── e2e-report-issue.test.js           # EXTEND with dual-search tests
│   │   ├── issue-payload-builder.test.js      # NEW — pure builder coverage
│   │   ├── test-cases-quarantine-schema.test.js # NEW (D-09) — schema-drift guard
│   │   ├── quarantine-append.test.js          # NEW — upsert idempotency
│   │   └── promote-from-quarantine.test.js    # NEW — tmpDir clone + mock spawnSync
│   └── golden/
│       └── baseline.json                       # written by update-golden.js (UNCHANGED here)
├── scripts/
│   ├── e2e-report-issue.mjs                   # EXTEND: --source triage, topOfStackHashFromTriage, dual-search
│   ├── quarantine-append.mjs                  # NEW (D-11)
│   ├── promote-from-quarantine.mjs            # NEW (D-13)
│   └── update-golden.js                       # EXTEND (Open Question 1): add `--case <id>` flag support
```

### Pattern 1: Pure-Data Lib Modules

**What:** ES module exporting pure functions with injected deps; no `fs`/`net`/global state.
**When to use:** Anything that transforms data — `issue-payload-builder.js` is the textbook case.
**Example:**
```javascript
// Source: tests/e2e/lib/triage-classifier.js (Phase 34 pattern, mirrored)

export function buildIssuePayload({
  triageFinding,     // from triage-report.json findings[i]
  iteration,         // from llm-report.json iterations[i]
  rerunEntry,        // from rerun-report.json replays[i]
  goldenCitation,    // string from tests/golden/baseline.json[id].citation (may be null)
  reproducerCmd,     // string built by the CLI (e.g., `npm run e2e:explore -- --case US…`)
}) {
  // PURE — no I/O. Returns { title, body, labels }.
  const fp = computeFingerprint(triageFinding, iteration);
  const body = [
    `<!-- fp: ${fp} -->`,
    '',
    '### Reproducer',
    reproducerCmd,
    `case-id: ${iteration.case_id}`,
    `seed: ${iteration.seed ?? 'n/a'}`,
    '',
    '### Verifier Disagreement',
    formatVerifierWindow(iteration, rerunEntry),  // ≤600 chars × 2 windows
    '',
    '### LLM Rationale',
    truncate(triageFinding.rationale, 800),
    `confidence: ${triageFinding.confidence}`,
    '',
    '### Golden Diff',
    truncate(formatGoldenDiff(iteration.citation, goldenCitation), 400),
  ].join('\n');

  return {
    title: buildTitle(iteration, triageFinding),  // reuses existing buildIssueTitle pattern
    body,
    labels: [triageFinding.category, 'e2e-nightly', 'triage'],
  };
}

function truncate(text, budget) {
  if (typeof text !== 'string') return '';
  if (text.length <= budget) return text;
  return text.slice(0, budget - 50) + '\n…[truncated, full content in artifacts]';
}
```

### Pattern 2: Idempotent JS-Module Write (read-modify-write)

**What:** Dynamic-import the JS module to read the array, mutate in memory, deterministic stringify, write atomically. Used because the file MUST stay JS module syntax (D-09 — schema-compatibility with `tests/test-cases.js`).
**When to use:** `scripts/quarantine-append.mjs` for upsert; same pattern Phase 32+33 already use.
**Example:**
```javascript
// Source: scripts/update-golden.js (line 34) — dynamic import pattern
import { atomicWriteJson } from '../tests/e2e/lib/rerun-validator.js';

async function upsertEntry(entry) {
  const corpusPath = path.resolve(PROJECT_ROOT, 'tests/e2e/test-cases-quarantine.js');
  // Read via dynamic import — file path with cache-busting query string forces re-read
  const url = `${pathToFileURL(corpusPath).href}?t=${Date.now()}`;
  const { TEST_CASES_QUARANTINE } = await import(url);

  // Idempotency key = entry.id
  const existing = TEST_CASES_QUARANTINE.find(e => e.id === entry.id);
  if (existing) {
    existing.stable_runs += 1;
    // added_iso NOT mutated (D-11)
  } else {
    TEST_CASES_QUARANTINE.push({
      ...entry,
      stable_runs: 1,
      added_iso: new Date().toISOString(),
    });
  }

  const serialized = stringifyCorpus(TEST_CASES_QUARANTINE);
  atomicWriteJson(corpusPath, serialized);  // reuse from rerun-validator.js
  return existing ? 'upserted' : 'inserted';
}

function stringifyCorpus(entries) {
  // Deterministic stringification — sorted keys per entry, single quotes
  // for string values, escape Unicode like '“' as in test-cases.js.
  const formatted = entries.map(formatEntry).join(',\n');
  return `// AUTO-MANAGED by scripts/quarantine-append.mjs — do not hand-edit\n` +
         `export const TEST_CASES_QUARANTINE = [\n${formatted}\n];\n`;
}
```

### Pattern 3: gh CLI Shellout via spawnSync (existing — extend)

**What:** Pure ghClient interface (4 methods: list, create, comment, edit) backed by `execSync('gh ...')`. Tests inject a mock; CLI uses `makeRealGhClient()`.
**When to use:** All GitHub I/O in `e2e-report-issue.mjs --source triage` + `quarantine-append.mjs`'s `gh issue edit` call.
**Example:**
```javascript
// Source: scripts/e2e-report-issue.mjs (lines 276-312)
// EXTENSION for Phase 35:
function makeRealGhClient(repo) {
  return {
    // … existing methods …
    listOpenWithSearch(query) {
      // D-07 dual-search: returns issues whose search matches the v1 or v2 fingerprint
      try {
        const raw = execSync(
          `gh issue list --search ${shellEscape(query)} --state open --json number,title,body,updatedAt --limit 30`,
          { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
        );
        return JSON.parse(raw);
      } catch (err) {
        console.warn('[e2e-report-issue] listOpenWithSearch failed:', err.message);
        return [];
      }
    },
    createIssueWithLabels(title, body, labels) {
      // D-06: --label is REPEATABLE per gh issue create docs
      const labelArgs = labels.map(l => `--label ${shellEscape(l)}`).join(' ');
      const out = execSync(
        `gh issue create --title ${shellEscape(title)} ${labelArgs} --body-file -`,
        { input: body, encoding: 'utf8' }
      );
      const m = out.match(/\/issues\/(\d+)/);
      return { number: m ? parseInt(m[1], 10) : null };
    },
    addLabel(issueNumber, label) {
      // D-12: idempotent — gh issue edit no-ops if label already present
      execSync(`gh issue edit ${issueNumber} --add-label ${shellEscape(label)}`, { encoding: 'utf8' });
    },
  };
}
```

### Pattern 4: Schema-Guard Test (mirrors cache-version.test.js)

**What:** Static-grep guard test that imports BOTH `tests/test-cases.js` and `tests/e2e/test-cases-quarantine.js` and asserts the first-4-keys of every quarantine entry exactly match the keys of a golden TEST_CASES entry.
**When to use:** D-09 schema-drift prevention; runs in `npm run test:src`.
**Example:**
```javascript
// Source: tests/unit/cache-version.test.js (Phase 23 pattern)
// NEW: tests/unit/test-cases-quarantine-schema.test.js

import { describe, it, expect } from 'vitest';
import { TEST_CASES } from '../../tests/test-cases.js';
import { TEST_CASES_QUARANTINE } from '../../tests/e2e/test-cases-quarantine.js';

const CANONICAL_KEYS = ['id', 'patentFile', 'selectedText', 'category'];
const QUARANTINE_ONLY_KEYS = ['stable_runs', 'source_triage_finding_id', 'added_iso'];

describe('test-cases-quarantine.js schema (Phase 35 QUAR-01)', () => {
  it('quarantine entries declare the canonical 4 keys present in TEST_CASES', () => {
    const goldenKeys = new Set(Object.keys(TEST_CASES[0]));
    for (const k of CANONICAL_KEYS) expect(goldenKeys.has(k)).toBe(true);
  });

  it('every quarantine entry has all 4 canonical keys AND 3 quarantine-only keys, no others', () => {
    for (const entry of TEST_CASES_QUARANTINE) {
      const keys = new Set(Object.keys(entry));
      for (const k of CANONICAL_KEYS) expect(keys.has(k)).toBe(true);
      for (const k of QUARANTINE_ONLY_KEYS) expect(keys.has(k)).toBe(true);
      expect(keys.size).toBe(CANONICAL_KEYS.length + QUARANTINE_ONLY_KEYS.length);
    }
  });

  it('id field is non-empty string matching the test-cases.js id regex', () => {
    for (const entry of TEST_CASES_QUARANTINE) {
      expect(typeof entry.id).toBe('string');
      expect(entry.id).toMatch(/^[A-Z]{2,}\d+[A-Z]?\d*-[a-z0-9-]+$/);
    }
  });

  it('stable_runs is a positive integer', () => {
    for (const entry of TEST_CASES_QUARANTINE) {
      expect(Number.isInteger(entry.stable_runs)).toBe(true);
      expect(entry.stable_runs).toBeGreaterThanOrEqual(1);
    }
  });
});
```

### Anti-Patterns to Avoid

- **Building the issue body OUTSIDE the pure builder:** D-04 mandates builder is pure. If the CLI assembles parts of the body (e.g., prepends the fingerprint comment), the budget guarantees break. Always: CLI gathers inputs → builder produces full body.
- **Storing `added_iso` as `Date.now()` (number) instead of ISO 8601 string:** D-10 explicitly says `<ISO timestamp>`. Numbers will look like garbage in the committed corpus and break the schema-guard test if a future enhancement validates the format.
- **Using `fs.writeFileSync` directly (without atomicWriteJson) for the corpus:** A crash mid-write produces a corrupt JS module that throws on import — every subsequent CI run fails to load test-cases-quarantine.js. Reuse the EXDEV-safe pattern.
- **Mutating `tests/test-cases.js` in `promote-from-quarantine.mjs` via regex insertion:** Use dynamic-import → mutate in-memory array → stringify-and-write, same as `quarantine-append.mjs`. Regex insertion will produce malformed JS on edge cases (comments, multi-line entries).
- **Re-using `topOfStackHashFromCase` for triage source:** D-08 says `topOfStackHashFromTriage` is a NEW helper. Sharing the function will accidentally pull a different field set into the v2 fingerprint.
- **Encoding the dual-search as a single `gh issue list --search "fp1 OR fp2"` query:** The OR-syntax is documented for GitHub web search but not formally guaranteed for `gh issue list --search`. Two separate calls are the safer pattern (D-07 implies but does not mandate; recommend two calls).
- **Allowing `update-golden.js --case <id>` to silently regenerate ALL cases when `--case` is absent:** The script currently has no case filter. If Phase 35 adds `--case` support, the absent-flag default must EXIT with an error or fall through to current behavior — never silently regenerate everything when a `--case` was intended but typo'd.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| GitHub authentication | Custom PAT plumbing | Existing `gh` CLI auth (developer runs `gh auth login` once) | Already auth'd in dev environment AND in CI via `secrets.GITHUB_TOKEN`; switching would re-introduce credential-handling code |
| Issue body fingerprint comment regex matching | Custom regex parser | `body.includes('<!-- fingerprint: ' + fp + ' -->')` (existing `findMatchingIssue` line 211-213) | Simple substring match; regex would risk catastrophic backtracking on adversarial inputs |
| ISO 8601 timestamp generation | Hand-rolled `new Date().getFullYear() + '-' + ...` | `new Date().toISOString()` | Built-in, deterministic, exact format the rest of the codebase uses (verified: `llm-report.js` line 183 uses `.toISOString()`) |
| Atomic file write | Hand-rolled tmp+rename | `atomicWriteJson()` from `tests/e2e/lib/rerun-validator.js` (lines 111-126) — already EXDEV-safe | Inlined 3 times in the codebase already (D-12 of Phase 33, Phase 34); replicate verbatim. Adding a 4th inline copy is acceptable; extracting to shared util is OUT OF SCOPE per Phase 33+34 D-12 |
| Dynamic ES module re-import with cache busting | Custom import-cache invalidation | `import(url + '?t=' + Date.now())` (Node 22 import-attributes pattern) | Node native; works without any plugin or transform |
| Unified-diff library | `diff`, `jsdiff` npm packages | Hand-roll a 5-line diff formatter — the citations are tiny strings like `"5:10-11"` | Zero-dep constraint (D-16); citations never exceed ~20 chars; full unified-diff machinery is wildly overkill |
| Issue dedup query escaping | Custom shell-escape regex | `shellEscape(query)` helper (small util — same pattern as `e2e-report-issue.mjs` line 294 `escapedTitle = title.replaceAll('"', '\\"')`) | Hand-roll a 3-line `shellEscape` that wraps in single quotes and escapes inner single quotes; safer than relying on `gh` to handle shell metacharacters |
| CLI argument parsing | `commander`, `yargs`, `minimist` | Hand-roll the `parseArgs` pattern from `e2e-rerun-validator.mjs` (lines 47-86) | Codebase has a locked CLI-shim template: strict equals-syntax rejection, `--help` exit 0, missing-value exit 2. Replicate verbatim for `quarantine-append.mjs` and `promote-from-quarantine.mjs`. |

**Key insight:** Phase 35 is almost entirely composition of v3.0/v3.1 primitives. The high-leverage discipline is to RESIST inventing new abstractions — the issue-payload-builder is the only genuine new thing; everything else is "wire what already exists in the locked pattern."

## Runtime State Inventory

> Phase 35 is greenfield-additive — no rename/refactor.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | **None** — no databases or persistent stores hold "Phase 35"-related state. The quarantine corpus IS the persistent store but it's committed to git, not a runtime database. | None |
| Live service config | **GitHub repo labels** — Phase 35 introduces a new label `quarantine:ready-for-promotion`. This label must EXIST on the repo before `gh issue edit --add-label` succeeds. Existing labels (`e2e-nightly`, `triage`, and the 11 ERROR_CLASSES used as category labels) are documented in `scripts/e2e-report-issue.mjs` Phase 29 comments but not auto-created. | **Add a Plan-0 wave step that runs `gh label create quarantine:ready-for-promotion --color FFA500 --description "Quarantine entry stable across ≥3 nightly runs — eligible for human promotion to golden corpus" --force`**. Idempotent via `--force`. |
| OS-registered state | None | None |
| Secrets / env vars | **`GH_TOKEN` / `GITHUB_TOKEN`** are already used by Phase 29's `e2e-report-issue.mjs`. No new secrets. Phase 35 inherits the auth chain. | None |
| Build artifacts / installed packages | **Vitest test discovery** — adding `tests/unit/test-cases-quarantine-schema.test.js` requires no config change (`vitest.config.*` discovers `tests/unit/*.test.js` by default — verified by `ls tests/unit/` showing 26 existing test files all auto-discovered). | None |

## Common Pitfalls

### Pitfall 1: Fingerprint comment displacement past 65,536-char body limit

**What goes wrong:** Rich-context issue body grows large (especially with verifier windows + LLM rationale + golden diff). GitHub silently truncates at 65,536 chars on some `gh` versions, returns 422 on others. The `<!-- fingerprint: -->` comment was historically the LAST line of the body — first to be cut. After truncation: dedup is broken; every subsequent run files a NEW issue.
**Why it happens:** The Phase 29 body assembled the fingerprint at line 19+ (after a 12-row table). Phase 31 RESEARCH already locked the fix: fingerprint on line 1.
**How to avoid:** D-02 mandates `<!-- fp: <12-hex> -->` is the FIRST line of the body. The builder must emit it first; the CLI must NOT prepend anything. Vitest test: `expect(body.split('\n')[0]).toMatch(/^<!-- fp: [a-f0-9]{12} -->$/)`.
**Warning signs:** Duplicate issues for the same case-id+errorClass with similar timestamps; `<!-- fp: ... -->` missing from issue body when inspected via `gh issue view <n>`.

### Pitfall 2: Section budgets exceeded in adversarial inputs

**What goes wrong:** LLM rationale comes from `triageFinding.rationale` which is LLM output — unbounded length. Verifier `cited_text_window` is patent PDF text — historically up to several KB. If the builder doesn't enforce per-section budgets, a single iteration's body can blow past 65,536 chars even with line-1 fingerprint.
**Why it happens:** D-03 puts the responsibility in the BUILDER, not the caller. Easy to forget if the test suite doesn't include worst-case fixtures.
**How to avoid:** D-03 budgets (LLM rationale ≤800, verifier windows ≤600 each, golden diff ≤400). Unit test with deliberately-massive (10K-char) inputs for each section; assert the section's serialized length ≤ budget + truncation-suffix length.
**Warning signs:** A real triage report produces an issue body >50,000 chars; `gh issue create` returns 422; or the body renders but the truncation suffix `…[truncated, full content in artifacts]` does NOT appear.

### Pitfall 3: Dual-search misses v1 fingerprints because v2 was searched first

**What goes wrong:** The `findMatchingIssue` dual-search is intended to catch BOTH v1-formula and v2-formula fingerprints. If the implementation short-circuits on the first call (e.g., `if (v1Match) return v1Match`), v2-only matches still produce a new issue when an existing open issue uses v1. The result is duplicate issues during the transition period.
**Why it happens:** D-07 says "If EITHER returns ≥1 hit → don't re-file" — both calls must be executed, and the union of results is the dedup set. A premature return breaks this.
**How to avoid:** Always run BOTH `gh issue list --search` calls; concatenate the results; pass the combined array to a (possibly extended) `findMatchingIssue`. Vitest test: stub the ghClient with a function that records each `listOpenWithSearch` call; assert it's called TWICE per finding (once with v1, once with v2).
**Warning signs:** A pre-Phase 35 issue (v1 fingerprint) on a known case re-files after Phase 35 ships, indicating dual-search isn't actually catching v1.

### Pitfall 4: Quarantine corpus stringification produces non-deterministic diffs

**What goes wrong:** `quarantine-append.mjs` appends to `test-cases-quarantine.js`. If the stringifier doesn't sort keys per entry consistently, two upserts of the same entry can produce different file contents (and therefore different git diffs) on different machines. The auto-managed file becomes git-noisy and PR review unfriendly.
**Why it happens:** `JSON.stringify` does NOT sort object keys (it preserves insertion order). Different `existing.stable_runs += 1` paths versus fresh-entry paths can produce different key orderings.
**How to avoid:** Implement `formatEntry(entry)` as a pure helper with EXPLICIT key order (always: `id, patentFile, selectedText, category, stable_runs, source_triage_finding_id, added_iso`). Unit test: given two equivalent-but-differently-ordered input objects, the formatter produces byte-identical output.
**Warning signs:** PRs showing big diffs in `test-cases-quarantine.js` even though the logical content is unchanged. Different developers' machines producing different file contents for the same logical input.

### Pitfall 5: Promotion script regenerates the WHOLE baseline instead of just the promoted case

**What goes wrong:** D-14 step 5 says "Invoke `scripts/update-golden.js --case <id> --confirm` via spawnSync". But `update-golden.js` AS CURRENTLY IMPLEMENTED (`/home/fatduck/patent-cite-tool/scripts/update-golden.js`) does NOT accept a `--case` flag — it iterates `TEST_CASES` and writes ALL baselines (line 40-65). If `promote-from-quarantine.mjs` invokes it unchanged, the WHOLE 76-case baseline gets regenerated — that's a 76-line diff in every promotion PR, drowning the actual single-case change. WORSE: any drift in any OTHER case (e.g., a slight pdfjs version-drift in confidence scores) leaks into the promotion PR.
**Why it happens:** CONTEXT.md D-14 was written assuming per-case support; the current `update-golden.js` doesn't have it. Easy to miss when reading the CONTEXT alone.
**How to avoid:** Phase 35 MUST add `--case <id>` flag support to `update-golden.js` BEFORE wiring `promote-from-quarantine.mjs`. The patch: parse `--case <id>` from `process.argv`, filter `TEST_CASES` to just that ID, leave the rest of the baseline untouched (read the existing baseline JSON, write back with only the one entry updated). Add a Vitest test for the per-case path.
**Warning signs:** First promotion PR shows a 76-line diff in `tests/golden/baseline.json` instead of a 1-line diff.

### Pitfall 6: spawnSync to update-golden.js inherits CWD assumptions silently

**What goes wrong:** `scripts/update-golden.js` uses `resolve(__dirname, '..')` as the root (line 24). When `promote-from-quarantine.mjs` spawns it, the child process's `__dirname` resolves correctly. BUT: if the test invokes promote-from-quarantine.mjs from a TmpDir clone, the spawned `update-golden.js` may use a path relative to the REAL scripts/ directory instead of the tmpDir clone — and read the REAL `tests/test-cases.js`, not the tmpDir one. Test passes locally but breaks when committed corpus differs.
**Why it happens:** `__dirname` in the child is based on the script's actual path (resolved by Node), not the cwd. The child writes to `tests/golden/baseline.json` RELATIVE to the script's location.
**How to avoid:** `promote-from-quarantine.mjs` test uses `spawnSync(..., { cwd: tmpDir })` AND copies a `scripts/update-golden.js` mock (or stubs spawnSync entirely with a vi.fn() that captures the args). PREFERRED: stub spawnSync entirely — the goal is to verify `promote-from-quarantine.mjs` invokes it with `['--case', id, '--confirm']`, not to actually run the regen in tests.
**Warning signs:** Tests pass in isolation but the promotion flow against real corpus produces unexpected baseline updates.

### Pitfall 7: Label `quarantine:ready-for-promotion` is never created on the repo

**What goes wrong:** `gh issue edit <n> --add-label quarantine:ready-for-promotion` requires the label to exist on the repo. If it doesn't, gh exits non-zero with `HTTP 422`. The very first promotion-trigger run silently fails (because Phase 29's `ghClient.commentIssue` errors swallowed and logged).
**Why it happens:** GitHub labels are not auto-created. Phase 29 manually created `e2e-nightly` via a one-shot `gh label create` command (not in any committed script).
**How to avoid:** Add a Plan-0 wave step OR a phase setup script that runs `gh label create quarantine:ready-for-promotion --color FFA500 --description "..." --force`. `--force` makes it idempotent (re-creating doesn't error). Document in the phase plan as a HUMAN action OR as the first task in the build order.
**Warning signs:** First `stable_runs >= 3` upsert happens; corresponding `gh issue edit` step logs `HTTP 422: Validation Failed`; label never appears on the issue.

### Pitfall 8: triage findings with `category: 'HARNESS_ERROR'` slip past the CONFIRMED filter

**What goes wrong:** D-05 recommends `severity in {critical, high} OR rerun.verdict === 'CONFIRMED'`. But Phase 34's triage classifier emits `category: 'HARNESS_ERROR'` for LLM-parse-failure paths (e.g., `path_taken: 'llm_single_parse_error'` — see `tests/e2e/lib/triage-classifier.js` line 203). These findings have `severity: 'low'` but might have `rerunEntry.verdict === 'CONFIRMED'` from upstream — meaning they'd pass the OR filter and file a worthless "LLM response failed to parse" issue.
**Why it happens:** The `severity: 'low'` AND `category: 'HARNESS_ERROR'` combination is the triage classifier's signal for "internal triage error, not a product anomaly." The filter must exclude these.
**How to avoid:** Refine D-05's predicate: `(severity in {critical, high} OR rerunEntry.verdict === 'CONFIRMED') AND category !== 'HARNESS_ERROR' AND !path_taken.endsWith('_parse_error')`. Vitest test: fixture with one HARNESS_ERROR finding + one WRONG_CITATION finding; assert only one issue filed.
**Warning signs:** GitHub Issues board shows issues titled `[e2e-nightly] ...: HARNESS_ERROR` with bodies containing "LLM response failed to parse" — these are noise.

## Code Examples

Verified patterns drawn directly from this codebase.

### Issue body builder skeleton (NEW — D-01..D-04)

```javascript
// tests/e2e/lib/issue-payload-builder.js
//
// Phase 35 — pure-function rich issue payload builder (ISSUE-01/ISSUE-04).
//
// No I/O. Same inputs → same output (string).

import { createHash } from 'node:crypto';

// D-03 character budgets (per-section)
const BUDGET_LLM_RATIONALE = 800;
const BUDGET_VERIFIER_WINDOW = 600;
const BUDGET_GOLDEN_DIFF = 400;
const TRUNCATION_SUFFIX = '\n…[truncated, full content in artifacts]';

/**
 * Truncate text to fit within budget, including TRUNCATION_SUFFIX.
 * @param {string} text
 * @param {number} budget — max length of returned string
 * @returns {string}
 */
function truncate(text, budget) {
  if (typeof text !== 'string') return '';
  if (text.length <= budget) return text;
  return text.slice(0, budget - TRUNCATION_SUFFIX.length) + TRUNCATION_SUFFIX;
}

/**
 * D-02 line-1 fingerprint comment.
 * @param {string} fp — 12-char hex
 * @returns {string}
 */
function fingerprintComment(fp) {
  return `<!-- fp: ${fp} -->`;
}

/**
 * D-04 PURE — assemble {title, body, labels} from triage inputs.
 *
 * @param {{
 *   triageFinding: object,   // from triage-report.json findings[]
 *   iteration: object,       // from llm-report.json iterations[]
 *   rerunEntry: object|null, // from rerun-report.json replays[], may be undefined for NOT_REPLAYABLE
 *   goldenCitation: string|null, // from tests/golden/baseline.json[id].citation
 *   reproducerCmd: string,   // assembled by CLI
 *   fingerprint: string,     // 12-hex computed by CLI (v2 formula)
 * }} args
 * @returns {{ title: string, body: string, labels: string[] }}
 */
export function buildIssuePayload({
  triageFinding,
  iteration,
  rerunEntry,
  goldenCitation,
  reproducerCmd,
  fingerprint: fp,
}) {
  // Title
  const caseId = iteration.case_id ?? iteration.llm_selection?.patentId ?? 'UNKNOWN';
  const cat = triageFinding.category ?? 'UNCLASSIFIED';
  const title = `[e2e-nightly] ${caseId}: ${cat}`;

  // Section: Reproducer (no budget — kept short by construction)
  const seed = iteration.seed ?? 'n/a';
  const reproducer = [reproducerCmd, `case-id: ${caseId}`, `seed: ${seed}`].join('\n');

  // Section: Verifier Disagreement (2 windows ≤600 each)
  const observed = iteration.citation ?? '<no citation produced>';
  const expectedCitation = goldenCitation ?? '<no golden baseline>';
  const tier = iteration.verifier_verdict?.tier_used ?? 'n/a';
  const verifierReason = iteration.verifier_verdict?.reason ?? '';
  // The two "windows" are: (a) expected text excerpt, (b) observed citation context.
  // For simplicity in this builder we treat verifierReason as the merged window.
  const verifierWindow = truncate(verifierReason, BUDGET_VERIFIER_WINDOW * 2);
  const verifierSection = [
    `Expected citation (golden): \`${expectedCitation}\``,
    `Observed citation: \`${observed}\``,
    `Verifier tier: ${tier}`,
    'PDF text near cited location:',
    '```',
    verifierWindow,
    '```',
  ].join('\n');

  // Section: LLM Rationale (≤800)
  const rationale = truncate(triageFinding.rationale ?? '', BUDGET_LLM_RATIONALE);
  const llmSection = [rationale, `confidence: ${triageFinding.confidence ?? 0}`].join('\n');

  // Section: Golden Diff (≤400) — hand-rolled simple diff
  const diff = formatGoldenDiff(observed, goldenCitation);
  const goldenSection = truncate(diff, BUDGET_GOLDEN_DIFF);

  // Body — line 1 is the fingerprint comment (D-02)
  const body = [
    fingerprintComment(fp),
    '',
    '### Reproducer',
    reproducer,
    '',
    '### Verifier Disagreement',
    verifierSection,
    '',
    '### LLM Rationale',
    llmSection,
    '',
    '### Golden Diff',
    goldenSection,
  ].join('\n');

  // Labels — D-04
  const labels = [cat, 'e2e-nightly', 'triage'];

  return { title, body, labels };
}

/**
 * Hand-rolled simple golden diff. Citations are short strings like "5:10-11".
 * For brevity and zero-dep, NOT a full unified diff.
 */
function formatGoldenDiff(observed, golden) {
  if (!golden) return '(no golden baseline available)';
  if (observed === golden) return '(observed matches golden — should not happen for a CONFIRMED finding)';
  return [`- ${golden}`, `+ ${observed}`].join('\n');
}
```

### --source flag + label args (EXTEND `scripts/e2e-report-issue.mjs`)

```javascript
// scripts/e2e-report-issue.mjs — D-05/D-06/D-08 extension

import { buildIssuePayload } from '../tests/e2e/lib/issue-payload-builder.js';

/**
 * D-08 — new helper: 12-hex stable hash from triage finding inputs.
 *
 * @param {object} finding — from triage-report.json findings[]
 * @param {object|undefined} rerunEntry — from rerun-report.json replays[]
 * @param {object} iteration — from llm-report.json iterations[]
 * @returns {string} 12-char hex
 */
export function topOfStackHashFromTriage(finding, rerunEntry, iteration) {
  const input = JSON.stringify({
    rationale_first_30_chars: (finding.rationale ?? '').slice(0, 30),
    verifier_status: rerunEntry?.original_verdict_status ?? null,
    classification: iteration.classification ?? null,
  });
  return createHash('sha256').update(input).digest('hex').substring(0, 12);
}

/**
 * D-07 — dual-version fingerprint search. Returns matching issue from either
 * v1 or v2 formula, or null. Both searches are always executed (no short-circuit).
 *
 * @param {object} ghClient — must implement listOpenWithSearch(query) → issue[]
 * @param {string} fpV1 — v1 fingerprint (empty-string topOfStackHash)
 * @param {string} fpV2 — v2 fingerprint (with topOfStackHashFromTriage)
 * @returns {object|null}
 */
export function findMatchingIssueDual(ghClient, fpV1, fpV2) {
  const issuesV1 = ghClient.listOpenWithSearch(`<!-- fp: ${fpV1} -->`);
  const issuesV2 = ghClient.listOpenWithSearch(`<!-- fp: ${fpV2} -->`);
  const allIssues = [...issuesV1, ...issuesV2];
  // Reuse existing findMatchingIssue with the OLDER fingerprint format too
  return findMatchingIssue(allIssues, fpV1) || findMatchingIssue(allIssues, fpV2);
}

/**
 * Phase 35 entry point — process a triage-report.json into issues.
 *
 * D-05 predicate: severity ∈ {critical, high} OR rerun verdict === CONFIRMED,
 * AND category !== 'HARNESS_ERROR' AND !path_taken.endsWith('_parse_error').
 */
export function processTriageReport(triageReport, rerunReport, llmReport, goldenBaseline, opts) {
  const { ghClient, runId, repo } = opts;
  const rerunByIter = new Map(rerunReport.replays.map(r => [r.iteration_n, r]));
  const llmByIter = new Map(llmReport.iterations.map(i => [i.iteration_n, i]));

  for (const finding of triageReport.findings) {
    const iteration = llmByIter.get(finding.iteration_n);
    if (!iteration) continue;  // defensive

    const rerunEntry = rerunByIter.get(finding.iteration_n);

    // D-05 predicate (refined per Pitfall 8)
    const isConfirmed = ['critical', 'high'].includes(finding.severity)
                      || rerunEntry?.verdict === 'CONFIRMED';
    const isHarnessNoise = finding.category === 'HARNESS_ERROR'
                         || (finding.path_taken ?? '').endsWith('_parse_error');
    if (!isConfirmed || isHarnessNoise) continue;

    // Build payload
    const caseId = iteration.case_id ?? iteration.llm_selection?.patentId;
    const fpV1 = fingerprint(caseId, finding.category, '');
    const fpV2 = fingerprint(caseId, finding.category, topOfStackHashFromTriage(finding, rerunEntry, iteration));
    const existing = findMatchingIssueDual(ghClient, fpV1, fpV2);
    if (existing) {
      console.log(`[e2e-report-issue] dedup hit for ${caseId} (#${existing.number}); skipping`);
      continue;
    }

    const goldenCitation = goldenBaseline?.[caseId]?.citation ?? null;
    const reproducerCmd = `npm run e2e:explore -- --case ${caseId}`;
    const { title, body, labels } = buildIssuePayload({
      triageFinding: finding,
      iteration,
      rerunEntry,
      goldenCitation,
      reproducerCmd,
      fingerprint: fpV2,  // file with v2 (the new formula)
    });

    ghClient.createIssueWithLabels(title, body, labels);
  }
}
```

### Quarantine append upsert logic (NEW)

```javascript
// scripts/quarantine-append.mjs (skeleton)

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { atomicWriteJson } from '../tests/e2e/lib/rerun-validator.js';
// gh client for the stable_runs ≥ 3 label add — reuses makeRealGhClient pattern

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORPUS_PATH = path.resolve(__dirname, '../tests/e2e/test-cases-quarantine.js');

/**
 * Deterministic per-entry stringification — D-11.
 * Key order is FIXED: id, patentFile, selectedText, category, stable_runs,
 * source_triage_finding_id, added_iso.
 */
function formatEntry(entry) {
  const ordered = [
    `    id: ${JSON.stringify(entry.id)}`,
    `    patentFile: ${JSON.stringify(entry.patentFile)}`,
    `    selectedText: ${JSON.stringify(entry.selectedText)}`,  // JSON.stringify produces double quotes
    `    category: ${JSON.stringify(entry.category)}`,
    `    stable_runs: ${entry.stable_runs}`,
    `    source_triage_finding_id: ${JSON.stringify(entry.source_triage_finding_id)}`,
    `    added_iso: ${JSON.stringify(entry.added_iso)}`,
  ].join(',\n');
  return `  {\n${ordered},\n  }`;
}

function stringifyCorpus(entries) {
  if (entries.length === 0) {
    return `// AUTO-MANAGED by scripts/quarantine-append.mjs — do not hand-edit.\n` +
           `export const TEST_CASES_QUARANTINE = [];\n`;
  }
  const body = entries.map(formatEntry).join(',\n');
  return `// AUTO-MANAGED by scripts/quarantine-append.mjs — do not hand-edit.\n` +
         `export const TEST_CASES_QUARANTINE = [\n${body},\n];\n`;
}

export async function upsertQuarantineEntry(newEntry) {
  // Dynamic import with cache-bust
  const url = `${pathToFileURL(CORPUS_PATH).href}?t=${Date.now()}`;
  const { TEST_CASES_QUARANTINE } = await import(url);

  const existing = TEST_CASES_QUARANTINE.find(e => e.id === newEntry.id);
  let action;
  let updatedEntry;
  if (existing) {
    existing.stable_runs += 1;
    // added_iso NOT mutated (D-11)
    updatedEntry = existing;
    action = 'upserted';
  } else {
    updatedEntry = {
      id: newEntry.id,
      patentFile: newEntry.patentFile,
      selectedText: newEntry.selectedText,
      category: newEntry.category,
      stable_runs: 1,
      source_triage_finding_id: newEntry.source_triage_finding_id,
      added_iso: new Date().toISOString(),
    };
    TEST_CASES_QUARANTINE.push(updatedEntry);
    action = 'inserted';
  }

  atomicWriteJson(CORPUS_PATH, stringifyCorpus(TEST_CASES_QUARANTINE));
  return { action, entry: updatedEntry };
}
```

### Promote-from-quarantine skeleton (NEW — human-gated)

```javascript
// scripts/promote-from-quarantine.mjs (skeleton)

import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

function parseArgs(argv) {
  let id = null;
  let confirm = false;
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--id') {
      id = argv[++i];
    } else if (argv[i].startsWith('--id=')) {
      process.stderr.write('[promote-from-quarantine] equals syntax not supported for --id; use --id <value>\n');
      process.exit(2);
    } else if (argv[i] === '--confirm') {
      confirm = true;
    } else if (argv[i] === '--help' || argv[i] === '-h') {
      printUsage(); process.exit(0);
    }
  }
  if (!id) { process.stderr.write('[promote-from-quarantine] --id required\n'); process.exit(2); }
  return { id, confirm };
}

async function main() {
  const { id, confirm } = parseArgs(process.argv);

  // Locate entry (read both corpora via dynamic import)
  const goldenUrl = `${pathToFileURL(GOLDEN_PATH).href}?t=${Date.now()}`;
  const quarUrl = `${pathToFileURL(QUARANTINE_PATH).href}?t=${Date.now()}`;
  const { TEST_CASES } = await import(goldenUrl);
  const { TEST_CASES_QUARANTINE } = await import(quarUrl);

  const entry = TEST_CASES_QUARANTINE.find(e => e.id === id);
  if (!entry) {
    process.stderr.write(`[promote-from-quarantine] entry not found in quarantine: ${id}\n`);
    process.exit(1);
  }

  if (TEST_CASES.find(e => e.id === id)) {
    process.stderr.write(`[promote-from-quarantine] entry ${id} already in golden corpus — refusing to duplicate\n`);
    process.exit(1);
  }

  // Dry-run output (no --confirm) — D-13
  if (!confirm) {
    process.stdout.write([
      '=== Dry-run promotion plan for ' + id + ' ===',
      `Source quarantine: ${QUARANTINE_PATH}`,
      `  id: ${entry.id}`,
      `  selectedText: ${entry.selectedText.slice(0, 60)}${entry.selectedText.length > 60 ? '…' : ''}`,
      `  stable_runs: ${entry.stable_runs}`,
      `Target golden: ${GOLDEN_PATH}`,
      `  append at end of TEST_CASES array (position ${TEST_CASES.length})`,
      `Golden baseline file: tests/golden/baseline.json`,
      `Will invoke: node scripts/update-golden.js --case ${id} --confirm`,
      '',
      'Re-run with --confirm to apply.',
    ].join('\n') + '\n');
    process.exit(0);
  }

  // Apply (D-14)
  try {
    // Step 2: strip quarantine-only metadata
    const promoted = {
      id: entry.id,
      patentFile: entry.patentFile,
      selectedText: entry.selectedText,
      category: entry.category,
    };
    // Step 3: append to test-cases.js
    appendToGoldenCorpus(promoted);  // hand-rolled writer; OR see Open Question 2
    // Step 4: remove from quarantine
    const remaining = TEST_CASES_QUARANTINE.filter(e => e.id !== id);
    atomicWriteJson(QUARANTINE_PATH, stringifyCorpus(remaining));
    // Step 5: regenerate golden for THIS case
    const result = spawnSync('node', ['scripts/update-golden.js', '--case', id, '--confirm'], {
      encoding: 'utf8',
      cwd: PROJECT_ROOT,
    });
    if (result.status !== 0) {
      throw new Error(`update-golden.js exited ${result.status}: ${result.stderr}`);
    }
    process.stdout.write(`[promote-from-quarantine] promoted ${id} successfully\n`);
  } catch (err) {
    process.stderr.write(`[promote-from-quarantine] FAILED: ${err.message}\n`);
    process.stderr.write('[promote-from-quarantine] Run `git status` to inspect partial state; revert with `git checkout tests/`\n');
    process.exit(1);
  }
}
```

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3.x (existing `^3.0.0` in package.json devDependencies) `[VERIFIED: package.json]` |
| Config file | None — Vitest discovers `tests/unit/*.test.js` and `tests/e2e/scripts/*.test.js` by default convention; existing `tests/` tree already runs under `npm run test:src` |
| Quick run command | `npx vitest run tests/unit/issue-payload-builder.test.js tests/unit/quarantine-append.test.js` (≤2s per file) |
| Full suite command | `npm run test:src` (runs all 26+ Vitest test files in `tests/unit/` + `tests/e2e/scripts/`) |
| Lint command | `npm run lint` (eslint over `tests/e2e/lib/` + script shims) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ISSUE-01 | Builder assembles 5 sections in order with all 5 inputs | unit | `npx vitest run tests/unit/issue-payload-builder.test.js -t "sections in order"` | ❌ Wave 0 |
| ISSUE-01 | Builder body line 1 is `<!-- fp: <12-hex> -->` | unit | `npx vitest run tests/unit/issue-payload-builder.test.js -t "fingerprint on line 1"` | ❌ Wave 0 |
| ISSUE-02 | CLI `--source triage` invokes ghClient.createIssueWithLabels with the 3 expected labels | CLI/integration | `npx vitest run tests/e2e/scripts/e2e-report-issue-triage.test.js -t "triage label args"` | ❌ Wave 0 |
| ISSUE-03 | `findMatchingIssueDual` returns the existing issue for a v1-fingerprinted body even when v2 is passed | unit | `npx vitest run tests/unit/e2e-report-issue.test.js -t "dual-search v1 hit"` | EXTEND existing file |
| ISSUE-03 | Dual-search invokes `listOpenWithSearch` exactly twice (v1 + v2) | unit | `npx vitest run tests/unit/e2e-report-issue.test.js -t "dual-search both calls"` | EXTEND existing file |
| ISSUE-04 | LLM rationale > 800 chars is truncated with `…[truncated…]` suffix; total ≤ 800 | unit | `npx vitest run tests/unit/issue-payload-builder.test.js -t "LLM rationale budget"` | ❌ Wave 0 |
| ISSUE-04 | Verifier window > 600 chars is truncated; golden diff > 400 chars is truncated | unit | `npx vitest run tests/unit/issue-payload-builder.test.js -t "budgets"` | ❌ Wave 0 |
| ISSUE-04 | Worst-case input (10K char per section) produces body ≤ 50,000 chars | unit | `npx vitest run tests/unit/issue-payload-builder.test.js -t "worst-case body size"` | ❌ Wave 0 |
| QUAR-01 | Schema-guard: every quarantine entry has exactly 4 canonical + 3 quarantine-only keys | unit | `npx vitest run tests/unit/test-cases-quarantine-schema.test.js` | ❌ Wave 0 |
| QUAR-01 | Schema-guard FAILS when an extra key is added to a quarantine entry | unit (negative) | `npx vitest run tests/unit/test-cases-quarantine-schema.test.js -t "rejects extra keys"` | ❌ Wave 0 |
| QUAR-02 | `upsertQuarantineEntry` twice with same id → 1 entry, `stable_runs === 2`, `added_iso` unchanged | unit | `npx vitest run tests/unit/quarantine-append.test.js -t "idempotent upsert"` | ❌ Wave 0 |
| QUAR-02 | `upsertQuarantineEntry` with new id → array length +1, `stable_runs === 1` | unit | `npx vitest run tests/unit/quarantine-append.test.js -t "new entry insertion"` | ❌ Wave 0 |
| QUAR-02 | After upsert reaching `stable_runs === 3`, mock ghClient.addLabel called with `quarantine:ready-for-promotion` | unit | `npx vitest run tests/unit/quarantine-append.test.js -t "stable_runs >= 3 labels"` | ❌ Wave 0 |
| QUAR-02 | `formatEntry` produces byte-identical output for equivalent objects with different key order | unit | `npx vitest run tests/unit/quarantine-append.test.js -t "formatEntry determinism"` | ❌ Wave 0 |
| QUAR-05 | Dry-run (no --confirm) prints plan + exits 0, makes NO mutations | unit (spawnSync) | `npx vitest run tests/unit/promote-from-quarantine.test.js -t "dry-run preserves corpus"` | ❌ Wave 0 |
| QUAR-05 | With --confirm: entry appears in cloned `test-cases.js`, removed from cloned `test-cases-quarantine.js`, spawnSync invoked with `['--case', id, '--confirm']` | unit (tmpDir + mock spawnSync) | `npx vitest run tests/unit/promote-from-quarantine.test.js -t "promotion flow"` | ❌ Wave 0 |
| QUAR-05 | Refuses to promote an id already present in golden corpus | unit | `npx vitest run tests/unit/promote-from-quarantine.test.js -t "refuses duplicate"` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npx vitest run tests/unit/issue-payload-builder.test.js tests/unit/quarantine-append.test.js tests/unit/test-cases-quarantine-schema.test.js tests/unit/promote-from-quarantine.test.js tests/unit/e2e-report-issue.test.js` (≤ 10s total)
- **Per wave merge:** `npm run test:src && npm run lint`
- **Phase gate:** `npm run test` (full suite — `test:src && test:chrome && test:firefox && lint && test:lint`) green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/unit/issue-payload-builder.test.js` — covers ISSUE-01, ISSUE-04
- [ ] `tests/unit/test-cases-quarantine-schema.test.js` — covers QUAR-01 (schema-guard)
- [ ] `tests/unit/quarantine-append.test.js` — covers QUAR-02 (idempotency + label add)
- [ ] `tests/unit/promote-from-quarantine.test.js` — covers QUAR-05 (tmpDir + mock spawnSync)
- [ ] `tests/e2e/scripts/e2e-report-issue-triage.test.js` — covers ISSUE-02 (spawnSync CLI test mirroring `e2e-rerun-validator.test.js`)
- [ ] EXTEND `tests/unit/e2e-report-issue.test.js` — add dual-search test cases for ISSUE-03 + topOfStackHashFromTriage determinism
- [ ] Seed `tests/e2e/test-cases-quarantine.js` with `export const TEST_CASES_QUARANTINE = [];` (single empty array — schema-guard passes vacuously) `[VERIFIED: file does not exist yet — confirmed by direct ls]`
- [ ] GitHub label create one-shot: `gh label create quarantine:ready-for-promotion --color FFA500 --description "Quarantine entry stable across ≥3 nightly runs — eligible for human promotion to golden corpus" --force` (manual step OR Plan-0 task — see Pitfall 7)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Existing `gh` CLI auth (developer's PAT or `GITHUB_TOKEN`); no new credential paths introduced |
| V3 Session Management | no | No sessions — single-shot CLI invocations |
| V4 Access Control | yes | `promote-from-quarantine.mjs` is human-gated (`--confirm` required); D-13 enforces no CI invocation |
| V5 Input Validation | yes | `sanitizeCaseId` regex (existing — line 35 of `e2e-report-issue.mjs`) validates case IDs before any shell or git operation; reuse for `promote-from-quarantine.mjs --id <id>` |
| V6 Cryptography | yes | `sha256` for fingerprint (existing); never hand-roll |
| V7 Error Handling | yes | All scripts use try/catch with specific exit codes (1 = failure, 2 = bad flag); pattern locked by `e2e-rerun-validator.mjs` |
| V12 Files & Resources | yes | `atomicWriteJson` for the corpus + EXDEV fallback prevents partial-write corruption |
| V14 Configuration | yes | No new env vars; existing `GITHUB_REPOSITORY`/`GH_TOKEN` flow inherited |

### Known Threat Patterns for Node-CLI-shellout stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Shell injection via `case-id` flag value (e.g., `--id 'US123; rm -rf /'`) | Tampering | `sanitizeCaseId` regex existing in `e2e-report-issue.mjs:35`; reuse for `promote-from-quarantine.mjs --id` |
| Markdown injection in `triageFinding.rationale` rendered in issue body | Tampering | Wrap LLM-derived text in fenced code blocks (existing T-29-02-2 pattern for verifier_verdict.reason); the builder MUST fence rationale similarly |
| Path traversal in `quarantine-append.mjs --triage-report <path>` (if added) | Tampering | Apply WR-05 pattern from `e2e-triage-classifier.mjs:181-190` — bound resolved path to `tests/e2e/artifacts/` or `tests/e2e/fixtures/` roots; reject paths outside |
| Race condition in corpus read-modify-write across concurrent promote-from-quarantine.mjs invocations | DoS / data corruption | Single-developer codebase per PROJECT.md; concurrent invocations are not a realistic threat. Document the assumption: "promote-from-quarantine.mjs is single-developer, single-instance — not safe for parallel invocation against the same corpus." |
| Forged triage-report.json input causing arbitrary GitHub issue spam | Tampering | The CLI reads from `tests/e2e/artifacts/{runId}/triage-report.json` only — written by Phase 34's classifier, which has its own CI guard. No `--triage-report <arbitrary-path>` flag should be added; the input path is sibling-discovery only, mirroring Phase 33+34. |
| `gh issue create` body containing user-controlled `[click](http://evil)` markdown link | Tampering | Existing fenced-code-block wrapping (T-29-02-2) for verifier reason; extend the SAME wrap to `triageFinding.rationale` in the builder |

### Security Implementation Checklist

- [ ] `buildIssuePayload` MUST wrap `triageFinding.rationale` in a fenced code block (`\`\`\`...\`\`\``) to neutralize markdown injection — mirror Phase 29's verifier_reason handling. Unit test: passing rationale containing `## HEADER` produces body where `## HEADER` is inside a code fence, not rendered as a markdown header.
- [ ] `promote-from-quarantine.mjs --id <id>` validates via `sanitizeCaseId` (reuse from `e2e-report-issue.mjs`) BEFORE any shell or git operation.
- [ ] `quarantine-append.mjs` does NOT accept arbitrary file paths — its input is the same sibling-auto-discovery pattern as Phase 33+34 (`triage-report.json` is found beside the input `llm-report.json`).
- [ ] `gh issue list --search <fp>` query — `fp` is a 12-char hex string from `createHash('sha256').digest('hex').substring(0, 12)`, which by construction matches `/^[a-f0-9]{12}$/`. Still shell-escape it for defense-in-depth.
- [ ] Add a CI-gate to `promote-from-quarantine.mjs` mirroring `e2e-triage-classifier.mjs` lines 154-160: refuse to run when `CI=true || GITHUB_ACTIONS=true` — D-13's human-gate guarantee.
- [ ] `sanitizeCaseId` allows valid pattern only; rejects shell metacharacters (verified by `tests/unit/e2e-report-issue.test.js` lines 91-101).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Fingerprint comment at END of issue body (Phase 29) | Fingerprint comment on LINE 1 of body (D-02) | Phase 31 pre-lock; ratified in Phase 35 D-02 | Prevents truncation displacement past 65,536-char limit |
| Single-formula fingerprint (`sha256(caseId \| errorClass \| "")`) | Dual-search v1 + v2 fingerprints (D-07) | Phase 35 D-07 (this phase) | Allows additive fingerprint evolution without retroactively breaking dedup |
| Issue labels: only `e2e-nightly` (Phase 29) | 3 labels: errorClass + `e2e-nightly` + `triage` (D-06) | Phase 35 D-06 (this phase) | Enables downstream filtering for Phase 37 weekly digest |
| Quarantine corpus: not yet defined | `tests/e2e/test-cases-quarantine.js` JS-module + schema-guard (D-09/D-10) | Phase 35 (this phase) | Enables Phase 36 Playwright quarantine project |
| Promotion: not yet defined | Human-gated `--confirm` CLI + spawnSync to update-golden.js (D-13/D-14) | Phase 35 (this phase) | Trust-invariant of golden corpus preserved (no auto-promotion) |
| `update-golden.js`: regenerates WHOLE baseline | Should accept `--case <id>` for per-case regen (Open Question 1) | Phase 35 (this phase, planner gate) | Promotion PRs become single-line diffs instead of 76-line diffs |

**Deprecated/outdated:**
- Phase 29's `findMatchingIssue` single-search: still present but called only via the v1+v2 dual wrapper after Phase 35.
- The "fingerprint at last line" pattern: invalidated by Phase 31 pre-lock (this phase enforces).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The Phase 34 triage report's `finding.iteration_n` maps 1-1 to `llm-report.json` iterations[].iteration_n (same key semantics across both reports). | Code Examples §"processTriageReport" | If wrong, the `llmByIter.get(finding.iteration_n)` lookup returns undefined and findings are silently skipped. **Verification:** confirmed by reading `tests/e2e/lib/triage-classifier.js` line 432 (`report.findings.push({iteration_n: iter.iteration_n, ...})`) — finding.iteration_n comes directly from `inputLlmReport.iterations[i].iteration_n`. SAFE. `[VERIFIED: triage-classifier.js:432]` |
| A2 | The Phase 33 rerun report's `replays[].iteration_n` also maps 1-1 to the same iteration_n field. | Code Examples §"processTriageReport" | Same as A1. **Verification:** `tests/e2e/lib/rerun-validator.js` line 166-174 and 233-238 show replays[] entries are keyed by `iter.iteration_n` from the input llm-report. SAFE. `[VERIFIED: rerun-validator.js:166-238]` |
| A3 | A triage-report.json finding's `category` field uses the same string vocabulary as the `ERROR_CLASSES` array (used for GitHub labels). | Code Examples §"processTriageReport" + Don't Hand-Roll §"GitHub authentication" | If the triage classifier emits a category outside ERROR_CLASSES (e.g., its severity-derived synthetic categories), the `--label <category>` step files an issue with a label that doesn't exist on the repo, and gh returns HTTP 422. **Verification:** Phase 34 D-09 specifies category is the iteration's classification (which IS from `ERROR_CLASSES`). HOWEVER, `parseSingleResponse` line 186 allows `parsed.category ?? iter.classification` — an LLM-supplied category could be out-of-taxonomy. **Mitigation:** Phase 35 plan must clamp `finding.category` to `ERROR_CLASSES` (re-use the SEVERITIES-clamp pattern from `triage-classifier.js:182`). `[ASSUMED]` |
| A4 | The `tests/golden/baseline.json` file has the shape `{[caseId]: {citation, confidence}}`. | Code Examples §"processTriageReport" — `goldenBaseline[caseId].citation` | If shape differs, the goldenCitation lookup returns undefined and the diff section shows "(no golden baseline available)". **Verification:** confirmed by reading `scripts/update-golden.js` lines 36-67 — produces `baseline[id] = {citation, confidence}`. SAFE. `[VERIFIED: update-golden.js:56-60]` |
| A5 | The current `update-golden.js` does NOT accept a `--case <id>` flag. | Pitfall 5 + Open Question 1 | If wrong (it secretly does), the Pitfall is overblown and Open Question 1 is a no-op. **Verification:** `grep -n "case\|argv" scripts/update-golden.js` → only matches `--confirm` and iteration over `TEST_CASES`. No `--case` flag exists. CONFIRMED MISSING. `[VERIFIED: grep + file inspection]` |
| A6 | The recommended CONFIRMED filter `severity in {critical,high} OR rerun.verdict==='CONFIRMED'` matches the user's intent. CONTEXT.md D-05 marks this as Claude's discretion with planner final say. | User Constraints §"Claude's Discretion" | If user disagrees, the predicate must be tightened. Risk: too-broad predicate files noise issues; too-narrow misses real bugs. Pinning recommended predicate in this RESEARCH so the planner makes an explicit decision. `[ASSUMED]` |
| A7 | gh CLI version 2.83.1 is available on the developer's local machine AND CI runners. CI runners (Ubuntu-latest) ship with gh CLI pre-installed; existing Phase 29 e2e-nightly.yml uses gh without explicit install steps. | Standard Stack §"gh CLI" | If older gh lacks `--add-label` or `--search`, Phase 35 features fail. **Verification:** `gh --version` locally = 2.83.1; `--add-label` flag confirmed in `gh issue edit --help`; `--search` and `--state` confirmed in `gh issue list --help`. ubuntu-latest runner has gh ≥ 2.40 (verified in existing nightly workflow). SAFE. `[VERIFIED: gh --version + gh issue edit --help + gh issue list --help]` |
| A8 | The dynamic-import-of-ES-module with `?t=<timestamp>` cache-bust query works reliably in Node 22 for re-reading a mutated file within the same process. | Architecture Pattern 2 + Code Examples §"upsert logic" | If Node caches by file path regardless of query string, the second upsert in a test session reads stale data. **Verification:** Node 22 import cache is keyed by full URL including query string — confirmed by Phase 32's existing `update-golden.js` line 34 dynamic-import pattern (which works for one-shot regen, not re-read). Cross-confirmed by Phase 33+34 D-12 atomicWriteJson pattern that round-trips through dynamic-import successfully. SAFE — but unit test MUST exercise the round-trip to catch any regression. `[ASSUMED — requires Vitest assertion]` |

**If this table is empty:** N/A (8 entries logged above).

## Open Questions

1. **`update-golden.js` lacks `--case <id>` flag — must Phase 35 add it?**
   - What we know: D-14 step 5 invokes `scripts/update-golden.js --case <id> --confirm`. The current script (line 27, line 40) only supports `--confirm` and regenerates ALL 76 cases. Inspection: `grep -n "case\|argv" scripts/update-golden.js` returns only `--confirm` and the `for (const testCase of TEST_CASES)` loop.
   - What's unclear: Does Phase 35 add the `--case` flag, or does CONTEXT.md D-14 assume a previous phase added it (none did)?
   - Recommendation: **Phase 35 MUST add `--case <id>` flag to `update-golden.js` as a prerequisite task.** Add it as the FIRST task in the phase plan, before `promote-from-quarantine.mjs` is wired. The change is small: parse `--case`, filter `TEST_CASES` to just that ID, read the existing baseline JSON, update only that key, write back. Add a Vitest test for the per-case path (regenerates only the named case; other entries unchanged byte-for-byte).

2. **`promote-from-quarantine.mjs` appends to `tests/test-cases.js` — but that file has hand-written comments, section dividers, and is NOT auto-managed. How to insert without breaking comments?**
   - What we know: `tests/test-cases.js` has hand-written `// =====` section dividers grouping cases by patent. A regex-based append risks misplacing the entry or breaking a section divider.
   - What's unclear: Is preserving the hand-edited structure a requirement, or is acceptable to auto-rewrite the whole file with the new entry appended at the end (losing section dividers)?
   - Recommendation: **Append the promoted entry at the END of the `TEST_CASES` array using a regex match for the closing `];` line — insert `,\n  <new entry>\n` before it.** This preserves all existing structure. Add a Vitest test that runs the promotion against a fixture copy of `test-cases.js` and asserts: (a) original entries unchanged; (b) new entry present at end; (c) `;` and the comment-divider structure untouched. If this proves fragile, the fallback is to auto-rewrite — make the decision explicitly in the phase plan.

3. **Should the `triage` GitHub label be auto-created at phase setup, alongside `quarantine:ready-for-promotion`?**
   - What we know: D-06 specifies `--label triage` is applied to every Phase 35 issue. `gh issue create --label triage` fails with HTTP 422 if the label doesn't exist.
   - What's unclear: Is `triage` already a repo label?
   - Recommendation: **Add BOTH labels in the Plan-0 setup task:**
     ```
     gh label create triage --color 6F42C1 --description "Filed by --source triage path (Phase 35)" --force
     gh label create quarantine:ready-for-promotion --color FFA500 --description "Quarantine entry stable across ≥3 nightly runs — eligible for human promotion" --force
     ```
     Run via existing local-dev `gh auth` (no CI step needed since both label-touching code paths are local-dev-only per D-13).

4. **`quarantine-append.mjs` triggers `gh issue edit --add-label` when `stable_runs >= 3`. But who/what runs `quarantine-append.mjs`?**
   - What we know: CONTEXT.md scope says Phase 35 delivers the script. Phase 36 wires it into CI orchestration.
   - What's unclear: Does Phase 35 ship a CLI shim (like `e2e-rerun-validator.mjs`) that a developer can run manually, OR is the only entry point via Phase 36's `run-triage-pipeline.mjs`?
   - Recommendation: **Phase 35 ships a standalone CLI shim** `scripts/quarantine-append.mjs` with strict `--input <triage-report-path>` flag (mirroring `e2e-triage-classifier.mjs`), so it can be invoked manually for testing AND from the Phase 36 orchestrator. The CLI does sibling auto-discovery for `rerun-report.json` and `llm-report.json` from the same `artifacts/{runId}/` dir.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node 22 LTS | All new lib/CLI files | ✓ | v24.11.1 | — |
| `gh` CLI | e2e-report-issue.mjs extension, quarantine-append.mjs (label add) | ✓ | 2.83.1 (2025-11-13) | — |
| `gh auth status` (authenticated) | All `gh ...` shellouts | (dev's responsibility) | — | Document in phase plan: developer must verify `gh auth status` before first run |
| Vitest | All test files | ✓ | ^3.0.0 (from package.json) | — |
| ESLint | `npm run lint` for new lib files | ✓ | 10.4.0 (from package.json) | — |
| `tests/test-cases.js` | promote-from-quarantine.mjs target | ✓ | committed (76 entries inspected) | — |
| `scripts/update-golden.js` | promote-from-quarantine.mjs spawnSync target | ✓ | committed | **MISSING `--case <id>` flag** — Phase 35 MUST add (Open Question 1) |
| GitHub repo labels: `triage`, `quarantine:ready-for-promotion` | --source triage issue create, stable_runs>=3 label add | ✗ (assumed) | — | One-shot `gh label create --force` in Plan-0 (Open Question 3) |

**Missing dependencies with no fallback:** none (all critical deps present)

**Missing dependencies with fallback:**
- `update-golden.js --case <id>` flag — Phase 35 adds it (1-task patch); covered by Open Question 1 + Pitfall 5.
- Repo labels `triage` + `quarantine:ready-for-promotion` — created via one-shot `gh label create` in Plan-0.

## Sources

### Primary (HIGH confidence)
- Direct code inspection: `/home/fatduck/patent-cite-tool/scripts/e2e-report-issue.mjs` — entire 390-line file
- Direct code inspection: `/home/fatduck/patent-cite-tool/scripts/update-golden.js` — entire 70-line file
- Direct code inspection: `/home/fatduck/patent-cite-tool/scripts/e2e-rerun-validator.mjs` — entire 206-line file (CLI shim pattern source)
- Direct code inspection: `/home/fatduck/patent-cite-tool/scripts/e2e-triage-classifier.mjs` — entire 263-line file (CI gate + sibling discovery pattern source)
- Direct code inspection: `/home/fatduck/patent-cite-tool/tests/test-cases.js` — 76-entry golden corpus (schema reference)
- Direct code inspection: `/home/fatduck/patent-cite-tool/tests/e2e/lib/triage-classifier.js` — entire 588-line file (Phase 34 finding shape)
- Direct code inspection: `/home/fatduck/patent-cite-tool/tests/e2e/lib/rerun-validator.js` — entire 253-line file (atomicWriteJson pattern + EXDEV fallback)
- Direct code inspection: `/home/fatduck/patent-cite-tool/tests/e2e/lib/llm-report.js` — entire 287-line file (schema_version + required-field pattern)
- Direct code inspection: `/home/fatduck/patent-cite-tool/tests/e2e/lib/error-codes.js` — ERROR_CLASSES frozen array
- Direct code inspection: `/home/fatduck/patent-cite-tool/eslint.config.js` — flat config with per-file `no-restricted-imports` blocks
- Direct code inspection: `/home/fatduck/patent-cite-tool/tests/e2e/scripts/e2e-rerun-validator.test.js` — spawnSync test pattern, tmpDir fixture-copy pattern, WR-07 stderr-absence pattern
- Direct code inspection: `/home/fatduck/patent-cite-tool/tests/unit/e2e-report-issue.test.js` — first 320 lines (fingerprint, sanitize, mock-gh patterns)
- Direct code inspection: `/home/fatduck/patent-cite-tool/tests/unit/cache-version.test.js` — schema-guard pattern reference
- Direct planning documents: `.planning/phases/35-rich-issue-filer-+-quarantine-corpus/35-CONTEXT.md`, `.planning/REQUIREMENTS.md`, `.planning/research/SUMMARY.md`, `.planning/research/PITFALLS.md`, `.planning/ROADMAP.md` §"Phase 35", `.planning/STATE.md`
- `gh --version` (verified 2.83.1 on this machine)
- `node --version` (verified v24.11.1 on this machine)
- `gh issue create --help`, `gh issue edit --help`, `gh issue list --help` (verified `--label`, `--body-file`, `--add-label`, `--search`, `--state` flags)

### Secondary (MEDIUM confidence)
- `package.json` for installed devDependency versions
- Phase 33+34 SUMMARY/CONTEXT documents for D-12 atomicWriteJson + D-09 schema_version conventions

### Tertiary (LOW confidence — verified against primary sources)
- None — Phase 35 research is entirely codebase-grounded; no external WebSearch was needed because every primitive already exists in this repo.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every version verified via `node --version` / `gh --version` / `package.json`; zero new packages so the legitimacy gate is trivially clean.
- Architecture: HIGH — every pattern (pure lib, dynamic-import + atomicWrite, gh CLI shellout, schema-guard test, spawnSync CLI test) is already in production in this repo. The 5 new files compose existing patterns.
- Pitfalls: HIGH — 8 pitfalls derived from direct code inspection. Pitfall 5 (update-golden.js missing `--case`) is a NEW finding from this research — flagged as Open Question 1.
- Validation Architecture: HIGH — all test commands runnable today; 5 test files identified as Wave 0 gaps; Vitest 3.x already installed and known to work with the codebase.
- Security: HIGH — ASVS mapping derived from existing controls in `e2e-report-issue.mjs:35` (sanitizeCaseId), `e2e-triage-classifier.mjs:181-190` (path-bound input), `rerun-validator.js:111-126` (atomicWriteJson). No new threat surface.

**Research date:** 2026-05-27
**Valid until:** 2026-06-26 (30 days — stack is stable; gh CLI minor updates do not change the surface used here)

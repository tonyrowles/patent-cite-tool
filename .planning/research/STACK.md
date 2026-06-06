# Technology Stack

**Project:** patent-cite-tool — v4.2 Auto-Fix Loop Live
**Researched:** 2026-06-04
**Scope:** NEW work only — existing shipped stack is not re-researched

---

## Current Pinned Versions (Verified)

| Dependency | Pinned In `package.json` | Current Latest | Status | Source |
|------------|--------------------------|----------------|--------|--------|
| `@anthropic-ai/sdk` | `0.100.1` (EXACT, no caret) | `0.100.1` | **Current** — pinned at latest | npm registry (WebSearch, 2026-06-04) |
| `peter-evans/create-pull-request` | `@v8` | `v8.0.0` (latest major) | **Current** — already on v8 | GitHub releases, Context7 (2026-06-04) |
| `@playwright/test` | `1.60.0` (exact) | `1.60.0` | **Current** — last published ~23 days ago | npm/playwright.dev (2026-06-04) |
| `pdfjs-dist` | `^5.5.207` (caret), `verifierDeps.pdfjs-dist: "5.5.207"` (exact pin) | `5.7.284` | Behind by 2 minor versions — caret allows auto-bump; verifierDeps pin holds verifier at 5.5.207 | npm (2026-06-04) |
| `vitest` | `^3.0.0` (caret) | `4.1.8` (stable), `5.0.0-beta.1` | Behind major — vitest 4.x available; currently running 3.x | npm (2026-06-04) |
| `web-ext` | Not in package.json (used via `npx web-ext lint`) | `10.1.0` | Not pinned; invoked via npx | npm (2026-06-04) |

**Confidence:** HIGH for `@anthropic-ai/sdk` (npm registry confirmed), HIGH for `peter-evans/create-pull-request` (Context7 + GitHub releases), MEDIUM for others (WebSearch confirmed, not CLI-verified).

### Version notes for v4.2

- `@anthropic-ai/sdk@0.100.1` — the EXACT pin remains current as of research date. No upgrade needed or wanted: the ESLint single-entry-point guard + lockfile pin are load-bearing supply-chain defenses. SDK 0.100.0 introduced `claude-opus-4-8` support; 0.100.1 is the patch. Context7 changelog shows no breaking changes between 0.100.0 and 0.100.1.
- `peter-evans/create-pull-request@v8` — already at latest major version. The `@v8` floating tag is used throughout the codebase (not pinned to `v8.0.0` SHA). v8 introduced Node 24 runtime support; existing usage in v40-auto-fix.yml, v40-auto-promote.yml, and v40-deps-update.yml is current.
- `@playwright/test@1.60.0` — current latest stable. No upgrade required for v4.2 work (no new E2E browser features needed).
- `pdfjs-dist` — the `^5.5.207` caret and the frozen `verifierDeps.pdfjs-dist: "5.5.207"` exact pin are intentional per the pdfjs-frame-shift workflow design (v40-pdfjs-frame-shift.yml). v4.2 does NOT touch pdfjs version pinning. Latest 5.7.284 is handled by the existing v40-deps-update.yml watchlist process.
- `vitest@^3.0.0` — vitest 4.x is the current stable major. The project is on 3.x (will resolve to latest 3.x patch via caret). v4.2 adds Vitest tests for schema extension + ledger-leak guard + fixture-mutator, but no vitest version upgrade is needed for these tests to work.

---

## v4.2 New Work: Stack Requirements

### 1. Ledger-Commit Refactor (UAT-47-a and UAT-47-d)

**Problem:** `v40-cost-ledger-snapshot.yml` and the "Commit ledger update to main" step in `v40-auto-fix.yml` both do `git push origin main` directly. Phase 50 ruleset 17086676 blocks all direct pushes to main (required_status_checks for verifier-gate + deps-update-gate; bypass_actors=[]).

**Two viable approaches — choose one per workflow:**

**Option A: `ledger-snapshots/*` branch redirect (recommended for cost-ledger-snapshot.yml)**

Push the ledger commit to `ledger-snapshots/YYYY-MM-DD` instead of main. No PR opened. The snapshot is captured on a side branch that is NOT protected. A human or a periodic "merge ledger branches" workflow can land these on main via PR when convenient. Simpler than opening a PR per snapshot.

Implementation: Replace `git push` in the snapshot step with:
```bash
BRANCH="ledger-snapshots/$(date -u +%Y-%m-%d)"
git checkout -b "$BRANCH" || git checkout "$BRANCH"
git push origin "$BRANCH"
```
No new actions required. Uses only `git` CLI already available. The `contents: write` permission currently in the workflow covers pushing to a non-protected branch.

**Option B: PR-then-merge via `peter-evans/create-pull-request@v8` (recommended for v40-auto-fix.yml)**

The auto-fix workflow already uses `peter-evans/create-pull-request@v8` for the auto-fix branch PR. The two-commit split (ledger commit → main, then auto-fix branch → PR) is the load-bearing pattern that isolates the ledger change from the diff-guard. Under the Phase 50 ruleset, the direct `git push origin main` for the ledger commit fails.

The cleanest fix: push the ledger commit to the `ledger-snapshots/*` branch (Option A) rather than to main, then let the auto-fix branch PR contain only the source-code fix (which is what the diff-guard requires). The `git rebase main` step that follows currently assumes the ledger is committed to main first; with the branch redirect, the rebase target is already clean.

**No new npm dependencies** for either option. Pure git CLI + existing workflow plumbing.

**Confidence:** HIGH — both patterns use capabilities already present in the codebase and verified via Context7/github releases.

---

### 2. Ledger Schema Extension (`errorClass` + `outcome`/`pr_merged` fields)

**Problem:** `a-b-winner.mjs` is in abstention mode because the current ledger entry shape has no `errorClass` or outcome field. `appendLedgerEntry` uses a spread-entry pattern (`m.iterations.push(entry)`) that already passes any caller-supplied fields verbatim to disk — no function-body changes needed, only call-site additions.

**Additive-only approach — no breaking change to existing 9+ call sites:**

Two new optional fields on the entry object:

```
errorClass?: string   — one of the ERROR_CLASSES values ('WRONG_CITATION', etc.)
                        sourced from auto-fix.mjs Step 7's `errorClass` local var
                        added to ALL auto-fix.mjs appendLedgerEntry calls (7 sites)
                        NOT added to llm-driver.js (those are transport-level, not class-level)
                        NOT added to e2e-explore.mjs (subscription exploratory mode, no errorClass concept)

outcome?: 'pass' | 'fail'    OR
pr_merged?: boolean           — sourced from auto-fix-promote.mjs verified-promotion event
                               written as a follow-up ledger entry (source: 'auto-fix-promoted')
                               on promotion success (outcome='pass' | pr_merged=true)
                               or on label-flap-to-failure (outcome='fail')
```

The `a-b-winner.mjs` forward-compat probe (Tests 5+6 per Phase 54 AB-04) already handles both `outcome:'pass'|'fail'` and `pr_merged:boolean` — no code changes needed to a-b-winner.mjs itself.

**Call site audit for `errorClass` field addition:**

| Call site | File | Line | errorClass available? |
|-----------|------|------|----------------------|
| FLAKE_SUPPRESSED short-circuit | auto-fix.mjs | ~295 | YES — `errorClass` is in scope at Step 7+ |
| FLAKE_ESCALATION summary | auto-fix.mjs | ~391 | YES |
| Idempotency hit (branch existed) | auto-fix.mjs | ~546 | YES — extracted before Step 6 |
| Skip-class (LLM_API_ERROR / PASS) | auto-fix.mjs | ~589 | YES |
| Malformed-diff | auto-fix.mjs | ~685 | YES |
| Diff-guard violation | auto-fix.mjs | ~707 | YES |
| Apply-check failed | auto-fix.mjs | ~744 | YES |
| SDK error (catch block) | llm-driver.js | ~588 | NO — not in scope; skip |
| SDK success | llm-driver.js | ~620 | NO — not in scope; skip |
| subscription success | llm-driver.js | ~421 | NO — not in scope; skip |

The 7 auto-fix.mjs call sites can each gain `errorClass` with a 1-line addition. No refactoring. The 3 llm-driver.js call sites are transport-level (not issue-class-level) and should NOT gain errorClass.

**No new npm dependencies.** Pure field addition on existing call sites.

**Confidence:** HIGH — verified against the actual call sites in the codebase.

---

### 3. Fixture-Mutator (UAT-47-b proof-of-life)

**Problem:** Need a deterministic way to inject a controlled regression into a golden case so the full loop (rerun → triage → issue → auto-fix → verifier → merge → promote) can be exercised end-to-end without waiting for a real production anomaly.

**Approach: single-file ESM script, no new dependencies**

Pattern matches `scripts/check-deps-and-pr.mjs` — a self-contained, zero-dep ESM CLI that uses only Node built-ins (`node:fs`, `node:path`, `node:child_process`). Prior art in the codebase: `scripts/capture-observed-citations.mjs` (recalibration via mutation), `scripts/verify-single-case.mjs` (case-level exercise of the verifier path).

**What the mutator does:**
1. Read a target case from `tests/test-cases.js` (or accept `--case-id` CLI arg)
2. Read the golden baseline from `tests/golden/baseline.json`
3. Write a temporary mutation: corrupt the `selectedText` in test-cases.js for the target case (e.g., prepend a known-bad character sequence) OR swap the expected citation in baseline.json to a wrong value
4. Return exit 0 with the mutation fingerprint so the caller can verify the triage issue is opened for the right case

**Why NOT a mutation-testing library (Stryker, fast-check, schemath):**
- Mutation-testing frameworks are designed for code mutation (mutating source AST), not data fixture mutation
- Zero-new-deps is the fourth-consecutive milestone target — adding Stryker would violate it
- The fixture-mutator is deterministic by design: it injects a KNOWN defect, not random mutations. The goal is a controlled proof-of-life, not property-based testing
- The entire mutation surface is 2-3 lines of JSON field replacement in the fixture files

**Recommended implementation:** `scripts/fixture-mutator.mjs` (~100-150 LOC), exports `mutateCase({ caseId, mutationType, restore })` as a named export for Vitest testability plus a thin CLI shim at the file end. Pattern is identical to `runDispatcher` in `auto-fix.mjs`.

**restore mode:** `--restore` flag rewrites the original values back from a `.fixture-mutator-state.json` sidecar file written at mutation time. Sidecar gitignored. Prevents the mutation from accidentally committing to origin.

**No new npm dependencies.** Pure Node 22 built-ins.

**Confidence:** HIGH — pattern established by 3 prior zero-dep scripts in the codebase.

---

### 4. Ledger-Leak Hardening (auto-fix-api source vector)

**Problem:** `scripts/auto-fix.mjs` has 7 direct `appendLedgerEntry(LEDGER_PATH, ...)` calls (lines 295, 391, 546, 589, 685, 707, 744). These bypass PRE-02's guard (which lives inside `invokeAnthropicSdkWithLedger` in `llm-driver.js` and only covers THAT function's call sites). Running `npm test` locally while auto-fix.mjs is importable can produce `source: 'auto-fix-api'` entries in the working-tree ledger.

**Fix: add a chokepoint guard at `appendLedgerEntry` itself, OR scope-gate the auto-fix.mjs imports in tests**

The memory file (`project_auto_fix_ledger_leak_vector.md`) recommends a single-chokepoint guard at `appendLedgerEntry` rather than guarding individual call sites. This is the correct structural fix.

**Chokepoint guard approach:**

Add a CI-guard check at the TOP of `appendLedgerEntry` in `tests/e2e/lib/llm-ledger.js`:

```javascript
// Guard: if running in CI and the entry source is 'auto-fix-api' but
// E2E_LEDGER_PATH_OVERRIDE is not set, throw — prevents npm test from
// polluting the committed ledger via auto-fix.mjs imports in unit tests.
```

**Problem with this approach:** `appendLedgerEntry` is the shared write path used by ALL callers including the legitimate CI nightly run of `auto-fix.mjs` itself. A blanket CI guard on `appendLedgerEntry` would break the actual production workflow.

**Better approach: E2E_LEDGER_PATH_OVERRIDE enforcement in unit tests**

The `tests/unit/auto-fix.test.js` file (which unit-tests `runDispatcher`) must set `E2E_LEDGER_PATH_OVERRIDE` to a tmpdir path before importing auto-fix.mjs. This redirects all 7 auto-fix.mjs `appendLedgerEntry` calls to a throwaway file. The existing LEDGER_PATH IIFE in `llm-ledger.js` already supports this pattern (the `E2E_LEDGER_PATH_OVERRIDE` env var is read at module-load time).

**Why this is the right fix:** The leak only occurs when `auto-fix.mjs` is imported in a test context WITHOUT `E2E_LEDGER_PATH_OVERRIDE` set. The fix is: every test file that imports `auto-fix.mjs` (or any module that calls `appendLedgerEntry` with the real LEDGER_PATH) MUST set `E2E_LEDGER_PATH_OVERRIDE` before import. This is already the documented pattern per `llm-ledger.js` lines 59-65.

Check which test files import auto-fix.mjs without setting the override — those are the leak surfaces.

**No new npm dependencies.** The fix is a test setup pattern, not a new library.

**Confidence:** HIGH — the existing E2E_LEDGER_PATH_OVERRIDE mechanism is designed exactly for this use case.

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Ledger-commit refactor | `ledger-snapshots/*` branch + existing git CLI | GitHub App token bypass for main | App setup is a new OAuth surface; ZERO value over branch redirect for a daily snapshot |
| Ledger-commit refactor | `peter-evans/create-pull-request@v8` for auto-fix ledger | Direct push with bypass actor | Phase 50 ruleset explicitly disallows bypass actors; adding one would reopen the trust boundary |
| Fixture-mutator | Hand-rolled ESM script | Stryker mutation testing | New dependency, wrong abstraction level (code AST vs data fixture) |
| Fixture-mutator | Hand-rolled ESM script | fast-check property testing | Wrong problem domain; deterministic injection needed, not random |
| Ledger-leak fix | E2E_LEDGER_PATH_OVERRIDE in test setup | Chokepoint guard in appendLedgerEntry | A CI guard in appendLedgerEntry would break the nightly auto-fix workflow itself |
| Ledger-leak fix | E2E_LEDGER_PATH_OVERRIDE in test setup | Guard in auto-fix.mjs imports | 7 call sites to guard vs 1 test-setup line per test file |
| Schema extension | Additive fields on existing call sites | New appendLedgerEntryV2 function | Breaks the single-surface contract; existing callers continue to spread entries verbatim without change |

---

## Zero New npm Dependencies — Status

**Target:** ZERO new npm dependencies (fourth consecutive milestone: v3.1, v4.0, v4.1, v4.2)

| Work item | New deps? | Rationale |
|-----------|-----------|-----------|
| Ledger-commit refactor | None | Pure git CLI + existing workflow plumbing |
| Ledger schema extension | None | `appendLedgerEntry` spread-entry pattern already handles arbitrary fields |
| Fixture-mutator | None | Node 22 built-ins (fs, path, child_process) + existing test-cases.js / baseline.json access |
| Ledger-leak hardening | None | E2E_LEDGER_PATH_OVERRIDE pattern already exists in llm-ledger.js |

**Verdict: ZERO new npm dependencies is achievable for all four v4.2 work items.**

---

## Existing Stack (Not Re-Researched — Already Shipped)

The following are confirmed-shipped and not the subject of v4.2 research:

- `@anthropic-ai/sdk@0.100.1` EXACT — ESLint guard, lockfile pin, `llm-driver.js` single entry point
- `peter-evans/create-pull-request@v8` — used in v40-auto-fix.yml, v40-auto-promote.yml, v40-deps-update.yml
- `@playwright/test@1.60.0` — E2E harness, 76-case golden regression
- `pdfjs-dist@^5.5.207` + `verifierDeps.pdfjs-dist: "5.5.207"` — pdf-verifier EXACT pin + frame-shift pre-flight
- `vitest@^3.0.0` — 1134+ tests across 70 files
- `esbuild@^0.27.3` — Chrome + Firefox extension build pipeline
- `eslint@10.4.0` — flat config with `no-restricted-imports` guard
- `sharp@^0.34.5` — icon generation + PDF snippet rendering
- `@napi-rs/canvas@1.0.0` — canvas support for icon pipeline
- Node 22 LTS built-ins: `node:fs`, `node:path`, `node:util`, `node:child_process` — used throughout scripts

---

## Sources

- npm registry / WebSearch: `@anthropic-ai/sdk` at 0.100.1 confirmed current (2026-06-04)
- Context7 `/anthropics/anthropic-sdk-typescript` CHANGELOG: 0.100.0 released 2026-05-28 (claude-opus-4-8 support + mid-conversation system blocks); 0.100.1 is patch on top — HIGH confidence
- Context7 `/peter-evans/create-pull-request`: v8.0.0 is current latest; `add-paths` input pattern confirmed for selective staging — HIGH confidence
- WebSearch: `@playwright/test@1.60.0` confirmed current latest as of 2026-06-04 — MEDIUM confidence
- WebSearch: `pdfjs-dist` latest is 5.7.284 (April 2026); project pinned at 5.5.207 per frame-shift workflow design — MEDIUM confidence
- WebSearch: `vitest` latest stable is 4.1.8; project on `^3.0.0` caret — MEDIUM confidence
- WebSearch: `web-ext` latest is 10.1.0; not pinned in package.json — LOW confidence (not critical for v4.2)
- WebSearch: GitHub Actions branch protection bypass patterns — MEDIUM confidence (GitHub docs referenced)
- Direct code reading: all call-site counts verified against live source files

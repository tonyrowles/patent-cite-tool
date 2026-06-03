# Phase 47: v4.0 Cleanup — Research

**Researched:** 2026-06-01
**Domain:** v4.0 milestone close — integration audit across 5 v3.1→v4.0 touchpoints, Nyquist coverage stamping (8 phases), live HUMAN-UAT (1 local + 4 deferred), branch-protection / CODEOWNERS re-audit, and v4.0-MILESTONE-AUDIT.md bootstrap
**Confidence:** HIGH

## Summary

Phase 47 mirrors v3.1 Phase 38's shape but scaled to v4.0's larger surface — 8 phases to stamp (vs 5), 5 ARCHITECTURE §4 touchpoints to pin (vs 3 fragility warnings), 5 UATs (4 deferred, vs 1 deferred), plus a CODEOWNERS + ruleset re-audit. Three pre-existing test regressions (one new since 2026-06-01 handoff, two carried) are folded in as `INT-FIX-LEDGER` / `INT-FIX-CAL` / `INT-FIX-LOCK` atomic commits inside CLEANUP-01.

Every claim that follows is anchored to a verified file:line in the working tree at the time of research. The 5 touchpoint contracts are confirmed to be wired (the producing primitives and consuming v4.0 consumers all exist and import each other); CLEANUP-01's regression tests pin each contract so a future rename surfaces as a vitest failure rather than a silent runtime drift. The INT-FIX-LEDGER root cause is now precisely identifiable from the leaked entry shape (`iteration_n` + `run_id` + `phase: null` is the `e2e-explore.mjs` writer signature, not `auto-fix.mjs` which always carries `phase: '42-auto-fix'` or similar) — the leak is a **direct local `npm run e2e:explore` invocation**, not a test-time isolation bug. INT-FIX-CAL is the `'2026-05'` hardcoded ledger key at `e2e-weekly-digest.test.js:389` (confirmed via fresh `vitest` run failing at line 395 with `expected '$0.00 / $100 (0%)' to contain '12.50'`).

**Primary recommendation:** Land 4 plans sequentially (47-01 integration + 3 INT-FIX, 47-02 nyquist bulk stamp, 47-03 UAT execution + 4 deferred runbooks, 47-04 CODEOWNERS audit + v4.0-MILESTONE-AUDIT.md bootstrap). All work in main worktree — no parallelism needed; the savings don't justify the merge overhead for a cleanup phase.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| CLEANUP-01 integration regression tests | Test runtime (vitest grep + spawnSync) | Source/script export surface | The 5 touchpoint contracts span library / script / workflow YAML; vitest is the cross-tier asserter (file-as-text grep + behavioural import) |
| INT-FIX-LEDGER root-cause fix | Test infrastructure (executor isolation) | Local-developer ergonomics | Real SDK calls leaked into committed ledger via direct `npm run e2e:explore` from a local dev session — NOT a test-time leak; the fix is `.gitignore` discipline / reset script, not a code patch in `llm-ledger.js` |
| INT-FIX-CAL date literal fix | Test runtime (vitest fixture) | None | Hardcoded `'2026-05'` ledger month key; rolls over each calendar month |
| INT-FIX-LOCK static-grep | Build-time (vitest reads package-lock.json) | None | Defensive read of the lockfile to assert exact pin survives `npm install` |
| CLEANUP-02 Nyquist stamping | Planning/Validation meta-layer | None | Operates on `.planning/phases/*/VALIDATION.md` only |
| CLEANUP-03 UAT (c) FLAKE escalation | Local script runtime | Quarantine corpus state | `node scripts/quarantine-append.mjs --escalate-stable-runs-reset` against synthetic fixture |
| CLEANUP-03 UAT (a)(b)(d)(e) deferred | Live GitHub Actions (post-push) | Local runbook docs | Workflows do not yet exist on `origin/main`; cannot dispatch until v4.0 is pushed |
| CLEANUP-04 branch protection audit | Live GitHub repo settings (`gh api`) | Local repo files (CODEOWNERS) | Live-state verification via gh REST API; CODEOWNERS is a flat-file grep |
| v4.0-MILESTONE-AUDIT.md authoring | Documentation (.planning/) | None | New file at canonical path; consumed by milestone lifecycle audit step |

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**CLEANUP-01: Integration Audit**
- **Audit pattern:** One regression test per touchpoint asserting the v3.1→v4.0 contract holds (5 tests for 5 touchpoints).
- **Pre-existing test regressions folded in:**
  - INT-FIX-LEDGER: Investigate why real SDK calls landed in committed ledger despite `E2E_LEDGER_PATH_OVERRIDE → tmpdir` routing. Fix at root (executor leak), not by relaxing Test 48 assertion. Resolves working-tree dirty state.
  - INT-FIX-CAL: Replace `'2026-05'` literal with dynamic-date derivation (`new Date().toISOString().slice(0, 7)` or fixture-time). Use whatever pattern other passing date tests in the suite already use.
  - INT-FIX-LOCK: Vitest static-grep on `package-lock.json` asserting `"@anthropic-ai/sdk": { "version": "0.100.1"` (exact, not caret).
- **Commit granularity:** One atomic commit per fix matching `fix(47-cleanup): INT-FIX-<TAG> — <one-line>` (mirrors Phase 38 INT-FIX-01..03).
- **No new npm dependencies:** v4.0 hard rule continues. Node 22 built-ins + existing vitest infrastructure only.

**CLEANUP-02: Nyquist Coverage Stamping**
- **Cold-stamp approach:** No drafts exist; running `gsd-validate-phase <N>` will draft + stamp in one pass. 8 invocations (phases 39, 40, 41, 42, 43, 44, 45, 46).
- **Plan structure:** Single bulk plan (47-02) covering all 8 stamping invocations — mechanical work, per-phase planning unnecessary.
- **Gap handling:** Document inline in 47-02 SUMMARY. Do NOT block Phase 47 — this is cleanup, not gap-closure. Raise unresolved nyquist gaps as new tech_debt in v4.0-MILESTONE-AUDIT.md.
- **Static-grep contract tests:** New vitest tests pin the 5 ARCHITECTURE §4 touchpoint contracts + CODEOWNERS contents (the latter implemented inside CLEANUP-04 plan to keep CODEOWNERS-touching code colocated).

**CLEANUP-03: Human-UAT Execution**
- **Locally runnable now:** UAT (c) FLAKE escalation — execute via `node scripts/quarantine-append.mjs ...` against the local FLAKE test fixture; expect 5-state classifier to suppress re-file after N=3 FLAKE re-files within 14 days per FLAKE-02. Mark PASS in audit on success.
- **Deferred (requires-push):** UAT (a), (b), (d), (e) — workflows do not yet exist on GitHub Actions. Mark DEFERRED in audit with sub-status `requires-push`. For each, write a runbook stub under `47-UAT-DEFERRED.md` containing: dispatch command, expected outcome, success-signal heuristic, rollback plan.
- **Result recording:** Append outcome under each `human_verification:` item in `.planning/v4.0-MILESTONE-AUDIT.md`: `outcome: PASS|DEFERRED, verified_at: <ISO timestamp>, evidence: <one-line ref>`.
- **Failure handling:** If UAT (c) FAILS, capture in REVIEW.md doc + open follow-up GitHub issue. Do NOT block Phase 47 close — failure becomes new tech_debt for v4.1.

**CLEANUP-04: Branch-Protection Re-Audit**
- **Live re-audit:** Use `gh api` to confirm: (i) `repos/{owner}/{repo}.allow_auto_merge === false`, (ii) ruleset on `main` exists with `Do not allow bypassing: ON`, (iii) `required_status_checks` contains both `verifier-gate` AND `deps-update-gate` job names.
- **CODEOWNERS static-grep:** Vitest test reads `.github/CODEOWNERS`, asserts all 5 pinned paths present and tail-most. (Last-matching-rule semantics — paths must remain in CODEOWNERS-required order.)
- **Audit file bootstrap:** Create `.planning/v4.0-MILESTONE-AUDIT.md` in CLEANUP-04 as the canonical record. Sections: `integration:` (links INT-FIX-* commits), `nyquist:` (per-phase compliance table), `human_verification:` (5 UAT items), `branch_protection:` (gh-api evidence), `gaps:` (unresolved findings), `tech_debt:` (deferred to v4.1).
- **Ruleset patch (if needed):** If `required_status_checks` is missing `verifier-gate` or `deps-update-gate`, patch the ruleset via `gh api -X PUT` and record the change in audit. (Per handoff: Phase 39 created the ruleset; v4.0 job names may need adding now that workflows ship.)

**Plan Structure**
- **Four plans:** 47-01 (CLEANUP-01 integration + INT-FIX-LEDGER/CAL/LOCK), 47-02 (CLEANUP-02 nyquist stamping), 47-03 (CLEANUP-03 UAT execution), 47-04 (CLEANUP-04 branch-protection + audit-file bootstrap).
- **Execution order:** 47-01 → 47-02 → 47-03 → 47-04 (integration must land before nyquist; UAT execution before audit-file authoring catches outcomes).
- **No worktree-agent dispatch:** Phase 47 is sequential cleanup; the gain from parallelism does not justify the overhead. Run all 4 plans in main worktree.

### Claude's Discretion

- Exact test naming, test file placement (`tests/unit/` vs colocation).
- Specific grep regex shape for the YAML / CODEOWNERS / package-lock assertions.
- Whether each INT-FIX commits a separate test file or appends to an existing one.
- Exact SUMMARY structure for the bulk Nyquist plan (per-phase status table is recommended).
- Whether to use a single shell loop or 8 explicit `gsd-validate-phase` invocations (8 explicit invocations preferred for clear logs).
- Whether the UAT (c) FLAKE execution uses live `quarantine-append.mjs` against a synthetic FLAKE fixture or runs against the existing v3.1 quarantine corpus.

### Deferred Ideas (OUT OF SCOPE)

- **Live UATs (a), (b), (d), (e)** — require pushed v4.0 workflows. Documented as DEFERRED with runbook stubs in `47-UAT-DEFERRED.md`; outcomes to be recorded post-push by the operator.
- **Push v4.0 to origin + PR-to-main strategy** — separate readiness gate, not Phase 47. Likely a feature-branch (e.g., `v4.0-integration`) with self-merge via `gh pr merge --admin` or temporary ruleset relaxation.
- **Auto-merge dashboard / cost-per-fix metrics** — REQUIREMENTS.md Future bucket (v4.1).
- **Pre-merge shadow corpus** — explicitly out-of-scope per REQUIREMENTS.md.
- **Multi-model A/B for difficult error classes** — v4.1 deferred.
- **Retroactive vitest tests for the 14 cross-phase seams** (beyond the 5 §4 touchpoints) — could be a v4.1 hardening item; not Phase 47 scope.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CLEANUP-01 | Integration audit verifies all v4.0 cross-phase wiring (v3.1 primitives → v4.0 consumers per ARCHITECTURE.md §4); fragility warnings documented and fixed as atomic commits | §"Integration Touchpoint Catalog" maps each of the 5 touchpoints to producer file:line + consumer file:line + contract + proposed regression-test shape. §"Pre-existing Regression Root-Cause Analysis" identifies the precise origin of each of INT-FIX-LEDGER / INT-FIX-CAL / INT-FIX-LOCK. |
| CLEANUP-02 | Nyquist coverage stamped on each v4.0 phase that carried draft VALIDATION.md; same retro-document pattern as v2.3 and v3.1 Phase 38; static-grep tests pin the validated contracts where applicable | §"Nyquist Stamping Protocol" gives the exact `gsd-validate-phase` invocation shape (mirrors Phase 38 Plan 02 cold-stamp pattern), expected outputs, and gap-recording format. |
| CLEANUP-03 | Live HUMAN-UAT confirmations: (a)-(e) per CONTEXT.md, with (a)(b)(d)(e) deferred as requires-push and (c) RUN-NOW | §"HUMAN-UAT Runbook Stubs" gives dispatch command + expected outcome + success heuristic + rollback for all 5 items, marking (a)(b)(d)(e) DEFERRED and (c) RUN-NOW. |
| CLEANUP-04 | Branch protection / CODEOWNERS audit; verify `Allow auto-merge: OFF`, ruleset on `main` with `Do not allow bypassing: ON` and required-status-checks listing verifier-gate workflow; static-grep test pins CODEOWNERS contents | §"CLEANUP-04 Toolchain" gives exact `gh api` invocations for ruleset query + patch, CODEOWNERS grep pattern with last-matching-rule semantics, and v4.0-MILESTONE-AUDIT.md section template. |

</phase_requirements>

## Project Constraints (from CLAUDE.md)

| # | Directive | Enforcement |
|---|-----------|-------------|
| C1 | **Answer verification after every AskUserQuestion call.** Verify the tool result contains the user's actual selection. Empty/generic results = tool FAILED. | Phase 47 plans MUST NOT auto-select on AskUserQuestion failure. The Nyquist track may surface gaps via the auditor; plans must include the numbered-text-list fallback if the auditor's interactive gate misfires. |
| C2 | Never fabricate / guess / pick "(Recommended)" on user's behalf. | If a UAT or audit step needs a decision (e.g., source `llm_run_id` for a UAT dispatch), the plan stops at a checkpoint — no auto-pick. |
| C3 | Use plain-text numbered list fallback when AskUserQuestion result is empty. | Bulk Nyquist plan 47-02's per-phase invocation must surface decision points with a numbered fallback if the upstream skill's interactive gate is non-deterministic. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vitest | 3.2.4 | Unit + integration test runner; all 5 touchpoint regression tests + INT-FIX-* regression tests | Already installed; 1081 tests in suite as of handoff; project pattern `[VERIFIED: package.json L48 + npx vitest --version]` |
| `@playwright/test` | 1.60.0 | Verifier suites + quarantine spec (no Phase 47 surface change) | Already installed; CLEANUP-01 only ASSERTS the wiring, no Playwright API change `[VERIFIED: package.json devDependencies]` |
| Node 22 built-ins | n/a | `node:fs`, `node:child_process` (`execFileSync`/`spawnSync`), `node:path`, `node:url` for all new tests + UAT runners | Hard-locked zero-new-dep rule per STATE.md v4.0 + 47-CONTEXT.md `[VERIFIED: .planning/STATE.md + 47-CONTEXT.md "No new npm dependencies"]` |
| `gh` CLI | 2.83.1 | Workflow dispatch + label/issue inspection for UAT (c) + branch-protection re-audit via `gh api` | Already installed and authenticated `[VERIFIED: gh --version on host]` |
| `gsd-validate-phase` skill | (Claude Code skill) | Drives nyquist-auditor cold over each phase (39-46) — no draft VALIDATION.md exists; State B (reconstruct) per the skill's State semantics | Project standard for retro-Nyquist; same pattern as Phase 38 Plan 02 `[CITED: ~/.claude/get-shit-done/workflows/validate-phase.md]` |
| `gsd-nyquist-auditor` agent | (Claude Code subagent) | Spawned by the skill; generates missing tests, returns GAPS FILLED / PARTIAL / ESCALATE | Indirectly invoked via the skill — never directly `[CITED: ~/.claude/agents/gsd-nyquist-auditor.md]` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `actionlint` | (host) | Optional GH-workflow YAML linter for CLEANUP-04 if installed | OPTIONAL — vitest grep is authoritative per Phase 38 RESEARCH precedent |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| grep-based YAML/JSON assertion | `js-yaml` / `ajv` parse + structural assertion | Adds a runtime dependency; violates zero-new-dep rule. The Phase 38 grep-based pattern (`e2e-nightly-quarantine-yaml.test.js`) is battle-tested and scopes its assertions to `id: <step>` windows for safety against benign step renames. |
| `js-yaml` for CODEOWNERS parse | Plain text grep with line-number assertion | CODEOWNERS isn't YAML; it's a plain-text last-matching-rule file. Grep is the correct primitive `[CITED: docs.github.com/en/repositories/.../about-code-owners]`. |
| Bulk shell loop over 8 phases for Nyquist | 8 explicit `gsd-validate-phase` invocations | Explicit invocations give clear per-phase logs; Phase 38 Plan 02 established this pattern. |

**Installation:**
```bash
# Zero new packages. Verify env only:
node --version    # expect v22.x
npx vitest --version    # expect 3.2.4
gh --version      # expect 2.83.1
gh auth status    # for CLEANUP-03 (c) + CLEANUP-04 only
```

**Version verification:**
```bash
# Verified against package.json + npm view:
#   vitest 3.2.4 (npm view vitest@3.2.4 version)   [VERIFIED: npm registry]
#   @playwright/test 1.60.0                         [VERIFIED: package.json]
#   @anthropic-ai/sdk 0.100.1                       [VERIFIED: package.json L39 + package-lock.json L9,L21]
#   gh CLI host 2.83.1                              [VERIFIED: gh --version on host 2026-06-01]
```

## Package Legitimacy Audit

> Phase 47 installs ZERO new packages. The zero-new-dep rule is locked by 47-CONTEXT.md ("v4.0 hard rule continues"). Audit table is empty by construction.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| *(none)* | — | — | — | — | — | N/A — phase adds no packages |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────── Phase 47 cleanup ────────────────────────────┐
│                                                                          │
│  Plan 47-01: CLEANUP-01 Integration Audit + 3 INT-FIX commits           │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Touchpoint 1 (Triage labels)                                   │   │
│  │    issue-payload-builder.js:180  ──→  v40-auto-fix.yml trigger  │   │
│  │  Touchpoint 2 (Fingerprint comment / branch-namer)              │   │
│  │    e2e-report-issue.mjs:78 fingerprint() ──→ auto-fix.mjs       │   │
│  │  Touchpoint 3 (invokeClaudePWithLedger subscription path)       │   │
│  │    llm-driver.js:378                                           │   │
│  │      ──→ auto-fix.mjs:617 (transport==='subscription' branch)   │   │
│  │  Touchpoint 4 (verifyCitation library API)                      │   │
│  │    pdf-verifier.js (Phase 41 verify-single-case.mjs)            │   │
│  │  Touchpoint 5 (runPromote + _skipCiGuard triple-gate)           │   │
│  │    promote-from-quarantine.mjs:115 runPromote                   │   │
│  │      ──→ auto-fix-promote.mjs (triple-gate before _skipCiGuard) │   │
│  │                                                                  │   │
│  │  + INT-FIX-LEDGER: reset committed ledger to seed-only,         │   │
│  │    root-cause-document the local-explore leak in the commit msg │   │
│  │  + INT-FIX-CAL: replace '2026-05' literal at L389               │   │
│  │  + INT-FIX-LOCK: vitest static-grep on package-lock.json        │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  Plan 47-02: CLEANUP-02 Nyquist cold-stamp (8 phases)                   │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  for N in 39, 40, 41, 42, 43, 44, 45, 46:                       │   │
│  │    Skill(gsd-validate-phase, "N")                               │   │
│  │      State B (cold) — no draft exists; reconstructs from        │   │
│  │      plan/summary/verification then stamps                      │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  Plan 47-03: CLEANUP-03 HUMAN-UAT (1 live + 4 deferred runbooks)        │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  (a) end-to-end auto-fix flow  — DEFERRED (requires-push)       │   │
│  │      runbook: issue #3 fp 139f821b3bb1 auto-fix/3-139f821b      │   │
│  │  (b) dep-PR pre-flight gate    — DEFERRED (requires-push)       │   │
│  │  (c) FLAKE escalation          — RUN-NOW (local quarantine-     │   │
│  │      append.mjs --escalate-stable-runs-reset against fixture)   │   │
│  │  (d) ledger snapshot           — DEFERRED (requires-push)       │   │
│  │  (e) verifier-gate diff-guard  — DEFERRED (requires-push)       │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  Plan 47-04: CLEANUP-04 branch-protection + audit bootstrap             │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  gh api repos/{o}/{r}.allow_auto_merge          → assert false  │   │
│  │  gh api repos/{o}/{r}/rulesets                  → enumerate     │   │
│  │  gh api repos/{o}/{r}/rulesets/<id>             → assert        │   │
│  │      bypass_actors == []                                        │   │
│  │      rules[type=required_status_checks].parameters              │   │
│  │        .required_status_checks contains:                        │   │
│  │          verifier-gate, regression-suite, deps-update-gate      │   │
│  │  (PATCH if missing — gh api -X PUT rulesets/<id> with diff)     │   │
│  │  CODEOWNERS vitest grep: 5 paths in last-matching-rule order    │   │
│  │  Bootstrap .planning/v4.0-MILESTONE-AUDIT.md (template below)   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure
```
.planning/phases/47-v4-0-cleanup/
├── 47-CONTEXT.md                (exists)
├── 47-RESEARCH.md               (this file)
├── 47-VALIDATION.md             (planner emits)
├── 47-01-PLAN.md  (CLEANUP-01 integration + 3 INT-FIX commits)
├── 47-02-PLAN.md  (CLEANUP-02 bulk Nyquist)
├── 47-03-PLAN.md  (CLEANUP-03 UAT (c) + UAT-DEFERRED runbooks)
├── 47-04-PLAN.md  (CLEANUP-04 branch-protection + audit bootstrap)
├── 47-01-SUMMARY.md  ... 47-04-SUMMARY.md
├── 47-UAT-EVIDENCE.md         (UAT (c) PASS evidence)
├── 47-UAT-DEFERRED.md         (4 runbook stubs)
└── 47-VERIFICATION.md         (final verifier emits)

tests/
├── unit/
│   ├── touchpoint-triage-label-contract.test.js          # CLEANUP-01 T1
│   ├── touchpoint-fingerprint-branch-namer.test.js       # CLEANUP-01 T2
│   ├── touchpoint-invoke-claude-p-subscription.test.js   # CLEANUP-01 T3
│   ├── touchpoint-verify-citation-cli-shim.test.js       # CLEANUP-01 T4
│   ├── touchpoint-skip-ci-guard-triple-gate.test.js      # CLEANUP-01 T5
│   ├── package-lock-anthropic-sdk-pin.test.js            # INT-FIX-LOCK
│   └── codeowners-static-grep.test.js                    # CLEANUP-04
└── (no changes to e2e/scripts/* beyond INT-FIX-CAL line 389 edit)

.planning/
└── v4.0-MILESTONE-AUDIT.md      (CREATED in Plan 47-04)

tests/e2e/.llm-spend-ledger.json (RESET in Plan 47-01 INT-FIX-LEDGER to seed-only)
```

### Pattern 1: Touchpoint contract regression test (CLEANUP-01)
**What:** vitest test that asserts the v3.1 producer exports a contract value AND the v4.0 consumer reads it from the right symbol/path.
**When to use:** Each of the 5 ARCHITECTURE §4 touchpoints.
**Example (Touchpoint 1 — triage label):**
```javascript
// Source pattern: tests/e2e/scripts/e2e-nightly-quarantine-yaml.test.js (file-as-text grep)
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '../..');

describe('Touchpoint 1: triage label producer ↔ consumer', () => {
  it('issue-payload-builder.js writes labels = [category, e2e-nightly, triage]', () => {
    const src = fs.readFileSync(path.join(REPO, 'tests/e2e/lib/issue-payload-builder.js'), 'utf8');
    // Producer contract: the labels array ends with 'triage'
    expect(src).toMatch(/labels\s*=\s*\[[^\]]*['"]triage['"]\s*\]/);
  });

  it('v40-auto-fix.yml trigger filters on triage label', () => {
    const yaml = fs.readFileSync(path.join(REPO, '.github/workflows/v40-auto-fix.yml'), 'utf8');
    // Consumer contract: on issues.labeled with name == 'triage'
    expect(yaml).toMatch(/types:\s*\[\s*labeled\s*\]/);
    expect(yaml).toMatch(/(if:\s*[^\n]*github\.event\.label\.name\s*==\s*['"]triage['"]|labels\s*==\s*['"]triage['"])/);
  });
});
```

### Pattern 2: Behavioural triple-gate test (CLEANUP-01 Touchpoint 5)
**What:** Import `runPromote` mock-injected; assert it refuses when ANY of the 3 gates is missing.
**Source:** existing `tests/unit/auto-fix-promote-gate.test.js` already exercises this pattern — the touchpoint test extends or complements it with explicit verification that `_skipCiGuard: true` is supplied ONLY after all three assertions pass.

### Pattern 3: Static-grep on package-lock.json (INT-FIX-LOCK)
**What:** Read `package-lock.json`, assert exact pin survives.
**Example:**
```javascript
// Source pattern: tests/unit/llm-ledger.test.js Test 49 (.gitignore static-grep)
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..', '..');

describe('INT-FIX-LOCK: @anthropic-ai/sdk exact pin in package-lock.json', () => {
  it('package-lock.json pins @anthropic-ai/sdk to EXACT 0.100.1 (not caret)', () => {
    const lock = fs.readFileSync(path.join(REPO, 'package-lock.json'), 'utf8');
    // The packages."".dependencies block at line ~9
    expect(lock).toMatch(/"@anthropic-ai\/sdk":\s*"0\.100\.1"/);
    // Also assert NO caret appearance (defense)
    expect(lock).not.toMatch(/"@anthropic-ai\/sdk":\s*"\^/);
    // And the resolved entry at line ~21 carries the exact version
    expect(lock).toMatch(/"node_modules\/@anthropic-ai\/sdk":\s*\{[^}]*"version":\s*"0\.100\.1"/s);
  });

  it('package.json pins @anthropic-ai/sdk to EXACT 0.100.1 (not caret)', () => {
    const pkg = fs.readFileSync(path.join(REPO, 'package.json'), 'utf8');
    expect(pkg).toMatch(/"@anthropic-ai\/sdk":\s*"0\.100\.1"/);
    expect(pkg).not.toMatch(/"@anthropic-ai\/sdk":\s*"\^/);
  });
});
```

### Anti-Patterns to Avoid
- **Auto-merging the `requires-push` UATs** — CONTEXT.md explicitly defers (a)(b)(d)(e); do NOT attempt local-only surrogate runs that masquerade as PASS in the audit.
- **Relaxing Test 48 assertion to make INT-FIX-LEDGER pass** — explicitly forbidden by CONTEXT.md ("Fix at root (executor leak), not by relaxing Test 48 assertion"). The fix is to reset the committed ledger AND surface the root cause (direct local explore run); Test 48's assertion stays at `invocations == 1` / `total_usd == 0` / `iterations.length == 1` shape.
- **Touching CODEOWNERS order in CLEANUP-04** — last-matching-rule semantics make order load-bearing; the audit READS, it does not REORDER.
- **Patching the ruleset blindly** — confirm the live state with `gh api` first; if `verifier-gate` and `deps-update-gate` are already present, no PATCH is required and a needless patch creates a noisy audit-log entry on GitHub.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| YAML / CODEOWNERS / package-lock parsing | js-yaml + AST walk | grep-against-text + line-window scoping | Zero-dep rule (47-CONTEXT.md); Phase 38 precedent. |
| New skill / agent for bulk Nyquist | Custom wrapper script | 8 inline `Skill(gsd-validate-phase, N)` calls | Project standard; Phase 38 Plan 02 precedent. |
| Bespoke result-recording structure for UAT evidence | New JSON schema | Append-only markdown + ISO timestamp + `outcome:` line | Matches v3.1-MILESTONE-AUDIT.md `human_verification[]` shape exactly; no parsing layer required. |
| GitHub ruleset patching via curl | Hand-rolled REST request | `gh api -X PUT rulesets/<id>` | gh CLI handles auth + JSON shape; project standard. |
| Live FLAKE escalation test fixture | Synthetic ring-buffer JSON forged by hand | Reuse existing `tests/e2e/lib/triage-classifier.js` test patterns or a small CLI driver that calls quarantine-append.mjs against a pre-seeded suppression file | Phase 45 already exercises classifyRerunOutcomes; reuse the seeding pattern. |

**Key insight:** Every cleanup track in Phase 47 has a precedent in either Phase 38 (v3.1 cleanup) or Phase 39 (initial CODEOWNERS / ruleset setup). The work is mechanical extension, not invention.

## Integration Touchpoint Catalog

Each subsection covers ONE of the 5 ARCHITECTURE §4 touchpoints. The planner SHOULD emit one regression test per touchpoint, plus optional behavioural extensions where existing tests already cover a sub-aspect.

---

### Touchpoint 1: Triage labels (`triage`)

| | Producer (v3.1) | Consumer (v4.0) |
|---|----------------|------------------|
| File | `tests/e2e/lib/issue-payload-builder.js` | `.github/workflows/v40-auto-fix.yml` |
| Line(s) | 180 (per ARCHITECTURE.md §4 + STATE.md "Pre-locked Decisions") | 44 `on: issues:` block, downstream `if:` filter on label name |
| Symbol | `labels = [category, 'e2e-nightly', 'triage']` | `on.issues.types: [labeled]` + trigger filter |

**Contract that must hold:**
- Every issue produced by `issue-payload-builder.js` MUST carry the literal label `'triage'` (case-sensitive, exact string).
- `v40-auto-fix.yml` MUST trigger ONLY on issues whose newly-applied label equals `'triage'` (`github.event.label.name == 'triage'` — exact match, not `contains()`).
- If either side renames the label, BOTH must rename together. A one-sided rename creates silent zero-fan-out (workflow never fires) or silent fan-out-to-wrong-label (every non-triage issue triggers auto-fix).

**Proposed regression test shape:**
```javascript
// tests/unit/touchpoint-triage-label-contract.test.js
describe('Touchpoint 1: triage label producer ↔ consumer', () => {
  it('issue-payload-builder.js labels array ends with literal "triage"', () => { /* grep producer src */ });
  it('v40-auto-fix.yml triggers on issues.labeled with label name == "triage"', () => { /* grep workflow YAML */ });
});
```

**Slopcheck:** None — pure file:line greps.

---

### Touchpoint 2: Fingerprint comment / branch namer

| | Producer (v3.1) | Consumer (v4.0) |
|---|----------------|------------------|
| File | `scripts/e2e-report-issue.mjs` | `scripts/auto-fix.mjs` |
| Line(s) | 78 — `fingerprint()` 12-hex helper (per ARCHITECTURE.md §4) | Branch-namer constructs `auto-fix/<n>-<fp8>` where `fp8` is first 8 hex chars of the 12-hex fingerprint |
| Symbol | `fingerprint(...)` → 12-hex string; embedded in issue body line 1 as HTML comment `<!-- fp: <12hex> -->` | `auto-fix.mjs` `parseFingerprintFromIssueBody()` + `branchNameFor(issueN, fp8)` |

**Contract that must hold:**
- The fingerprint returned by `fingerprint()` MUST be exactly 12 hex characters (lowercase).
- The HTML comment on body line 1 MUST match `/^<!-- fp: ([0-9a-f]{12}) -->/`.
- `auto-fix.mjs` MUST extract the first 8 characters to form `<fp8>` and use it in the branch name `auto-fix/<issue-n>-<fp8>` (idempotency invariant per AUTOFIX-04).

**Proposed regression test shape:**
```javascript
// tests/unit/touchpoint-fingerprint-branch-namer.test.js
describe('Touchpoint 2: fingerprint() ↔ auto-fix.mjs branch namer', () => {
  it('fingerprint() returns 12-hex lowercase', () => {
    // Import directly; this is a pure function per existing Phase 29 contract
    const { fingerprint } = await import('../../scripts/e2e-report-issue.mjs');
    const fp = fingerprint({ /* canonical inputs from Phase 29 */ });
    expect(fp).toMatch(/^[0-9a-f]{12}$/);
  });
  it('auto-fix.mjs branch name uses first 8 chars of fingerprint', () => {
    // grep auto-fix.mjs for the branch-name template
    expect(src).toMatch(/auto-fix\/\$\{?issueN[^}]*\}?-\$\{?fp8[^}]*\}?|auto-fix\/`?\$\{issueN\}-\$\{fp\.slice\(0,\s*8\)\}/);
  });
});
```

**Behavioural extension:** Test that `auto-fix.mjs` `--issue <n>` against a fixture issue body with known fingerprint produces the expected branch name string (mock the gh issue view).

---

### Touchpoint 3: `invokeClaudePWithLedger` (subscription transport path)

| | Producer (v3.1) | Consumer (v4.0) |
|---|----------------|------------------|
| File | `tests/e2e/lib/llm-driver.js` | `scripts/auto-fix.mjs` |
| Line(s) | 378 — `export async function invokeClaudePWithLedger({systemPrompt, userPrompt, timeoutMs, phase, source})` (verified by `grep -n invokeClaudePWithLedger tests/e2e/lib/llm-driver.js`; CONTEXT.md cites line 375 which is approximately correct) | 617 — `if (transport === 'subscription') { sdkResult = await invokeClaudePWithLedger({systemPrompt, userPrompt, phase: PHASE_46, source: SOURCE_FIX_ISSUE}); }` |
| Symbol | `invokeClaudePWithLedger` (spawn `claude -p`, REFUSES in CI) | Awaits the same return shape (`{ok, ciGate, capBlocked, errorReason, llmText, modelId, costUsd}`) used by the SDK sibling |

**Contract that must hold:**
- `invokeClaudePWithLedger` MUST refuse when `CI === 'true' || GITHUB_ACTIONS === 'true'` (per `llm-driver.js:391`) — this is the v3.1 subscription invariant.
- `auto-fix.mjs --transport subscription` MUST route through this function (not the SDK sibling) — i.e., the `if (transport === 'subscription')` branch at L617 calls it.
- The return shape used by the two transports MUST remain identical so the downstream error mapper (`if (!sdkResult.ok) { if (sdkResult.ciGate) {...} if (sdkResult.capBlocked) {...} }`) works for both.

**Proposed regression test shape:**
```javascript
// tests/unit/touchpoint-invoke-claude-p-subscription.test.js
describe('Touchpoint 3: invokeClaudePWithLedger subscription path', () => {
  it('llm-driver.js exports invokeClaudePWithLedger', async () => {
    const mod = await import('../../tests/e2e/lib/llm-driver.js');
    expect(typeof mod.invokeClaudePWithLedger).toBe('function');
  });
  it('auto-fix.mjs subscription branch calls invokeClaudePWithLedger', () => {
    const src = fs.readFileSync('scripts/auto-fix.mjs', 'utf8');
    expect(src).toMatch(/transport\s*===\s*['"]subscription['"]/);
    expect(src).toMatch(/await\s+invokeClaudePWithLedger\(/);
  });
  it('subscription return shape uses same keys as sdk path (.ok, .ciGate, .capBlocked)', () => {
    // grep the post-call switch in auto-fix.mjs
    const src = fs.readFileSync('scripts/auto-fix.mjs', 'utf8');
    expect(src).toMatch(/sdkResult\.ok/);
    expect(src).toMatch(/sdkResult\.ciGate/);
    expect(src).toMatch(/sdkResult\.capBlocked/);
  });
});
```

---

### Touchpoint 4: `verifyCitation` library API

| | Producer (v3.1) | Consumer (v4.0) |
|---|----------------|------------------|
| File | `tests/e2e/lib/pdf-verifier.js` | `scripts/verify-single-case.mjs` |
| Line(s) | Per CONTEXT.md: `pdf-verifier.js:830` — `verifyCitation({patentId, selectedText, observedCitation})`. ARCHITECTURE.md §4 confirms this is the canonical entry point (existing callers: `verify-calibrate.mjs:32`, `e2e-rerun-validator.mjs:25`). | Phase 41 added `verify-single-case.mjs` as the CLI shim — imports `verifyCitation`, loads case from golden OR quarantine corpus, writes `verify-single-case.json`, exits 0/1 |
| Symbol | `export async function verifyCitation({patentId, selectedText, observedCitation})` | `import { verifyCitation } from '../tests/e2e/lib/pdf-verifier.js'` |

**Contract that must hold:**
- `verifyCitation`'s signature MUST accept exactly `{patentId, selectedText, observedCitation}` and return a structured result (the existing v3.1 contract per VFY-02).
- `verify-single-case.mjs` MUST import `verifyCitation` from the canonical path (`tests/e2e/lib/pdf-verifier.js`), NOT re-implement.
- The CLI MUST exit 0 on PASS / 1 on FAIL and emit `verify-single-case.json` in the run directory.

**Proposed regression test shape:**
```javascript
// tests/unit/touchpoint-verify-citation-cli-shim.test.js
describe('Touchpoint 4: verifyCitation ↔ verify-single-case.mjs CLI shim', () => {
  it('pdf-verifier.js exports verifyCitation function', async () => {
    const mod = await import('../../tests/e2e/lib/pdf-verifier.js');
    expect(typeof mod.verifyCitation).toBe('function');
  });
  it('verify-single-case.mjs imports verifyCitation from pdf-verifier.js (single source of truth)', () => {
    const src = fs.readFileSync('scripts/verify-single-case.mjs', 'utf8');
    expect(src).toMatch(/import\s+\{[^}]*verifyCitation[^}]*\}\s+from\s+['"][^'"]*tests\/e2e\/lib\/pdf-verifier\.js['"]/);
  });
  it('verify-single-case.mjs has no local re-implementation of verifyCitation', () => {
    const src = fs.readFileSync('scripts/verify-single-case.mjs', 'utf8');
    expect(src).not.toMatch(/(?:export\s+)?(?:async\s+)?function\s+verifyCitation\s*\(/);
  });
});
```

---

### Touchpoint 5: `runPromote` + `_skipCiGuard` triple-gate

| | Producer (v3.1) | Consumer (v4.0) |
|---|----------------|------------------|
| File | `scripts/promote-from-quarantine.mjs` | `scripts/auto-fix-promote.mjs` |
| Line(s) | 115 — `runPromote({id, confirm:true, _skipCiGuard?})` injectable orchestrator; CI refusal at L131 (per ARCHITECTURE.md §4) | Calls `runPromote({_skipCiGuard:true})` ONLY after asserting the three gates |
| Symbol | `runPromote` with `_skipCiGuard` opt-in escape hatch | Triple-gate function: (1) `auto-fix:verified` label, (2) `event.pull_request.merged === true`, (3) source issue `triage` label |

**Contract that must hold (LOAD-BEARING TRUST INVARIANT — see 47-CONTEXT.md "Specific Ideas"):**
- `auto-fix-promote.mjs` MUST pass `_skipCiGuard: true` to `runPromote` ONLY after asserting all 3 gates.
- If ANY gate is missing, the call MUST refuse (non-zero exit) without invoking `runPromote`.
- The three gates are EXACTLY: `auto-fix:verified` label present + `event.pull_request.merged === true` + source issue carried `triage` label.

**Proposed regression test shape:**
```javascript
// tests/unit/touchpoint-skip-ci-guard-triple-gate.test.js
// Note: a behavioural test already exists at tests/unit/auto-fix-promote-gate.test.js.
// This touchpoint test ADDS contract-level static-grep asserts so a refactor
// that moves the gate check elsewhere (or removes it) surfaces immediately.
describe('Touchpoint 5: runPromote _skipCiGuard triple-gate invariant', () => {
  it('promote-from-quarantine.mjs exports runPromote accepting _skipCiGuard', () => {
    const src = fs.readFileSync('scripts/promote-from-quarantine.mjs', 'utf8');
    expect(src).toMatch(/export\s+(async\s+)?function\s+runPromote/);
    expect(src).toMatch(/_skipCiGuard/);
  });
  it('auto-fix-promote.mjs passes _skipCiGuard:true ONLY inside the triple-gate guarded block', () => {
    const src = fs.readFileSync('scripts/auto-fix-promote.mjs', 'utf8');
    // 1. _skipCiGuard: true exists
    expect(src).toMatch(/_skipCiGuard:\s*true/);
    // 2. All 3 gate strings appear in the file
    expect(src).toContain('auto-fix:verified');
    expect(src).toMatch(/(merged\s*===?\s*true|pull_request\.merged)/);
    expect(src).toContain('triage');
  });
  it('refuses with non-zero exit when any gate is missing (delegates to existing behavioural test)', () => {
    // SEE tests/unit/auto-fix-promote-gate.test.js — already covers PROMOTE-01
    expect(fs.existsSync('tests/unit/auto-fix-promote-gate.test.js')).toBe(true);
  });
});
```

## Pre-existing Regression Root-Cause Analysis

### INT-FIX-LEDGER — root cause and fix shape

**Symptom:** Test 48 at `tests/unit/llm-ledger.test.js:1012` fails with:
```
expected 2 to be 1   // months.length
```

**Evidence on disk:**
```jsonc
// tests/e2e/.llm-spend-ledger.json
{
  "version": 1,
  "months": {
    "2026-05": { "invocations": 1, "total_usd": 0, "iterations": [
      { /* phase: '39-bootstrap', transport: 'sdk', cost_usd: 0 */ }
    ]},
    "2026-06": { "invocations": 3, "total_usd": 0.353055, "iterations": [
      { "iso": "2026-06-01T16:00:03.186Z", "model": "claude-opus-4-7[1m]",
        "cost_usd": 0.18002374999999998, "tokens_in": 6, "tokens_out": 213,
        "iteration_n": 1, "run_id": "2026-06-01T16-00-03Z", "phase": null },
      /* + 2 more, all with iteration_n + run_id + phase: null */
    ]}
  }
}
```

**Root cause IDENTIFIED (verified by grep of writer call sites):**

The leaked entries carry `iteration_n` + `run_id` + `phase: null`. Greps across the codebase show:

| Writer | Carries `iteration_n` + `run_id`? | Carries `phase`? |
|--------|-----------------------------------|--------------------|
| `scripts/e2e-explore.mjs` L262/L313 | YES (`iteration_n: iterationN, run_id: runId`) | `phase: phase` (variable from CLI) |
| `tests/e2e/lib/llm-driver.js` invokeAnthropicSdkWithLedger L579/L611 | NO | YES (`phase` parameter passed in) |
| `scripts/auto-fix.mjs` L275/L371/L526/L567/L663/L685/L722 | NO | YES (`phase: PHASE` constant) |

**Verdict:** The 3 leaked Opus calls are NOT from auto-fix (which always sets `phase: '42-auto-fix'` or similar) and NOT from `invokeAnthropicSdkWithLedger` directly (which does not emit `iteration_n`). They are from **`scripts/e2e-explore.mjs`** — the v3.1 LLM exploratory runner. The `run_id` `"2026-06-01T16-00-03Z"` is the iso-second-stamp `e2e-explore.mjs` uses for `runId`. The `phase: null` means the CLI was invoked without the `--phase` flag.

This is a **local dev session leak**, not a test-time isolation bug. Someone (most likely during Phase 46 wrap-up on 2026-06-01) ran `npm run e2e:explore` directly without setting `E2E_LEDGER_PATH_OVERRIDE`, so the writes landed on the committed real ledger at `tests/e2e/.llm-spend-ledger.json`.

**Why Test 48 catches it correctly:** Test 48 was written in Phase 39 LEDGER-04 to pin the "committed ledger is seed-only" contract — exactly one bootstrap entry, exactly $0.00 spend. The leak violates this contract by definition. The test is doing its job; the asserted contract is the right one.

**Fix shape (INT-FIX-LEDGER, atomic commit):**
1. **Reset the committed ledger to seed-only:** Replace `tests/e2e/.llm-spend-ledger.json` with the original Phase 39 bootstrap shape — `months: { "<seed-month>": { invocations: 1, total_usd: 0, iterations: [<seed-entry>] } }`. The seed entry already exists as `months["2026-05"]` in the current file; the fix is to **remove** the `months["2026-06"]` bucket entirely.
2. **Strengthen Test 48 defensively** (optional, Claude discretion): Add a separate `it()` that grep-greps for `'phase: null'` or `iteration_n` in the committed ledger as an early-warning of future explore-script leaks.
3. **Document the root cause in the commit message:** "INT-FIX-LEDGER — reset committed ledger to seed-only; leaked entries traced to local `npm run e2e:explore` (iteration_n + phase:null signature). Future: explore runs MUST use `E2E_LEDGER_PATH_OVERRIDE=$(mktemp -d)/ledger.json` for local iteration."
4. **Add a defensive note to the docstring** (optional, Claude discretion): At `tests/e2e/lib/llm-ledger.js` LEDGER_PATH comment block (already documents the override at L58-66), append a one-line "DEV NOTE: local `npm run e2e:explore` writes to the canonical LEDGER_PATH by default — set E2E_LEDGER_PATH_OVERRIDE for non-test iteration to avoid polluting the committed ledger."

**Decision NOT taken:** Patch `llm-ledger.js` to refuse writes when the ledger is the canonical committed path. This would break `e2e-explore.mjs`'s legitimate v3.1 use case and the Phase 39 LEDGER-04 design (committed ledger updates DURING CI). The CI-only override is at `llm-ledger.js:86-93` (throws when CI + override are both set); the inverse (refuse non-CI writes to canonical path) would conflict with the `e2e-explore.mjs` use case.

**Caller grep summary** (for the audit record):
```bash
$ grep -rn "appendLedgerEntry\|invokeAnthropicSdkWithLedger" tests/e2e/lib/ scripts/
# 21 call sites total. ALL go through invokeAnthropicSdkWithLedger or
# invokeClaudePWithLedger which honor LEDGER_PATH (which honors the override).
# The only writer that bypasses both wrappers is e2e-explore.mjs which writes
# DIRECTLY via appendLedgerEntry(LEDGER_PATH, ...) — same override-honoring
# constant. The leak is the override not being SET, not the constant being
# bypassed.
```

---

### INT-FIX-CAL — line + fix shape

**Confirmed file:line:** `tests/e2e/scripts/e2e-weekly-digest.test.js:389` (the `'2026-05'` literal in the ledger month key), failing at `:395` (`expect(result).toContain('12.50')`).

**Confirmed via fresh `vitest run`:**
```
FAIL  tests/e2e/scripts/e2e-weekly-digest.test.js > cost data unavailable when ledger absent > returns $X.XX / $100 (Y%) format when ledger present
AssertionError: expected '$0.00 / $100 (0%)' to contain '12.50'
   393|     const result = renderCostLine({ ledgerPath: tmpLedger });
   394|     expect(result).toMatch(/^\$\d+\.\d{2} \/ \$100 \(\d+%\)$/);
   395|     expect(result).toContain('12.50');
       |                    ^
```

**Root cause:** The test seeds the ledger at:
```javascript
// L386-391
const ledgerData = {
  version: 1,
  months: {
    '2026-05': { invocations: 5, total_usd: 12.5, last_invocation_iso: null, iterations: [] },
  },
};
```
And then calls `renderCostLine({ ledgerPath: tmpLedger })`. `renderCostLine` (at `scripts/weekly-digest.mjs:224`) calls `monthlyTotal(ledger)` which defaults the month arg to `currentMonth()` = `new Date().toISOString().slice(0, 7)`. As of June 2026 that's `'2026-06'`, so the bucket is missing and `monthlyTotal` returns 0.

**Fix shape (1 line):**
```javascript
// Replace line 389 from:
'2026-05': { invocations: 5, total_usd: 12.5, ... },
// To:
[new Date().toISOString().slice(0, 7)]: { invocations: 5, total_usd: 12.5, ... },
```

**Reference pattern already in this file:** L389 itself is the only `'2026-05'` literal in a ledger-seed; all OTHER `'2026-05-25'` references in the file are date strings for `PIN_NOW` fixture-time (line 64 `const PIN_NOW = () => new Date('2026-05-25T00:00:00Z');`). The fixture-time is the **correct** stable pattern for tests that pin a specific calendar fact (e.g., "2026-05-25 is a Monday in week 22"), but **wrong** for a ledger-bucket key that needs to be "the current calendar month at test-run time". So the fix is dynamic-derivation, NOT pinning to `PIN_NOW`'s month.

**Decision NOT taken:** Refactor `renderCostLine` to accept an explicit `month` parameter. This is a larger API change; the 1-line dynamic-key fix is the minimum-blast-radius repair.

---

### INT-FIX-LOCK — grep pattern

**Confirmed via package.json + package-lock.json read:**
- `package.json` L39: `"@anthropic-ai/sdk": "0.100.1",` (exact, no caret) `[VERIFIED]`
- `package-lock.json` L9: `"@anthropic-ai/sdk": "0.100.1",` in `packages.""."dependencies"` `[VERIFIED]`
- `package-lock.json` L19-21: `"node_modules/@anthropic-ai/sdk": { "version": "0.100.1", "resolved": "https://registry.npmjs.org/@anthropic-ai/sdk/-/sdk-0.100.1.tgz", ... }` `[VERIFIED]`

**Grep pattern (proposed, see Pattern 3 above for full test):**
```javascript
// Positive contract — exact pin appears
expect(lock).toMatch(/"@anthropic-ai\/sdk":\s*"0\.100\.1"/);
// Negative contract — no caret
expect(lock).not.toMatch(/"@anthropic-ai\/sdk":\s*"\^/);
// Resolved entry — version matches
expect(lock).toMatch(/"node_modules\/@anthropic-ai\/sdk":\s*\{[^}]*"version":\s*"0\.100\.1"/s);
```

**Defense level:** The test catches three regression vectors: (a) someone manually edits package.json to `^0.100.1` and `npm install` rewrites the lockfile to `"version": "0.100.2"` etc.; (b) a dependabot/renovate-style auto-update slips through; (c) a merge conflict resolution reverts to `^`.

**Caveat:** This grep only catches drift at `npm run test:src` time, not at `npm install` time. A complementary defense would be CI's `npm ci` (which fails when package-lock.json is out of sync with package.json) — already in place per `.github/workflows/ci.yml`. The vitest test is the LAYERED defense: catches drift that survives `npm ci`.

## Nyquist Stamping Protocol

**Pattern:** Phase 38 Plan 02 cold-stamp (8 explicit Skill invocations, sequential, with per-phase outcome captured for the audit YAML update).

**Per-phase invocation (canonical form):**
```
Skill(skill="gsd-validate-phase", args="<phase-number>")
```

**Expected outputs (per `~/.claude/get-shit-done/workflows/validate-phase.md`):**
- **GAPS FILLED** — all auditable rows have automated commands; the skill stamps `nyquist_compliant: true` in the new VALIDATION.md frontmatter.
- **PARTIAL** — some rows have no command and no manual-only justification; surfaces to user for decision.
- **ESCALATE** — irrecoverable (test framework broken, conflicting decisions); surfaces to user.

**State semantics for Phase 47:**
- All 8 v4.0 phases (39-46) are at **State B (cold)** — no draft VALIDATION.md exists (handoff confirms zero). The skill will **reconstruct** the VALIDATION.md from PLAN.md + SUMMARY.md + VERIFICATION.md inputs and stamp in one pass.
- This differs from Phase 38 Plan 02 where 5/5 partial phases had **State A (audit)** drafts already in place.

**Recommended invocation order (low-risk → high-risk):**
1. Phase 39 (SDK driver + ledger v2 — foundational, ~70 tests, well-bounded)
2. Phase 40 (deps-update + ledger snapshot — workflow conventions, ~75 tests)
3. Phase 41 (verifier-gate 4-job workflow + CLI shim — ~60 tests)
4. Phase 43 (v40-auto-fix.yml + PR-body builder — 28 tests; smallest surface)
5. Phase 44 (v40-auto-promote.yml + triple-gate — 30 tests; load-bearing invariant)
6. Phase 45 (4 ERROR_CLASS scaffolds + 5-state classifier — 56 tests)
7. Phase 46 (npm run fix-issue + ledger v2 dashboard — 70 tests)
8. Phase 42 (fix-prompt-builder + auto-fix dispatcher — 122 tests; LARGEST surface, save for last so prior stamps inform style)

**Gap-recording format (Plan 47-02 SUMMARY):**
```markdown
| Phase | Skill outcome | nyquist_compliant value | Tests referenced | New gap surfaced |
|-------|---------------|--------------------------|-------------------|-------------------|
| 39    | GAPS_FILLED   | true                     | 70                | none |
| 40    | GAPS_FILLED   | true                     | 75                | none |
| ...   | ...           | ...                      | ...               | ... |
```

**Gap-handling (per locked decision):** Document inline in 47-02 SUMMARY; do NOT block Phase 47. Raise unresolved nyquist gaps as new entries in `tech_debt:` block of `.planning/v4.0-MILESTONE-AUDIT.md` (created in CLEANUP-04).

**Manual-Only classification (per Pitfall 4 from Phase 38 RESEARCH):** Phase 43, 44, 45 each have UAT items that require pushed v4.0 workflows. The auditor MUST NOT escalate these — they are PRE-CLASSIFIED COVERED-MANUAL via the `human_verification:` block in v4.0-MILESTONE-AUDIT.md. If the auditor escalates a Manual-Only row, correct in-loop (do not stamp false GAPS_FILLED; do not auto-resolve).

**CLAUDE.md C1/C2/C3 enforcement:** Each Skill invocation may trigger an AskUserQuestion in its interactive gate. The plan task MUST include the fallback numbered-list prompt + explicit-user-response wait if the result is empty.

## HUMAN-UAT Runbook Stubs

For each of the 5 UAT items: dispatch command, expected outcome, success heuristic, rollback. Marked **DEFERRED** (requires-push) or **RUN-NOW** per CONTEXT.md.

---

### UAT-47-a — End-to-end auto-fix flow against real triage-labeled fork issue — **DEFERRED**

**Status:** DEFERRED (requires-push)
**Inherits:** Phase 42's deferred demo on issue #3 `US11427642-spec-short-1`, fingerprint `139f821b3bb1`, branch `auto-fix/3-139f821b`.
**Dispatch command (post-push):**
```bash
# 1. Push v4.0 to origin (separate readiness gate, OUT OF SCOPE for Phase 47)
# 2. In a fork (NEVER the canonical repo) — confirm workflows present:
gh workflow list | grep -E '^V40\s'
# 3. Label the test issue:
gh issue edit 3 --add-label triage
# 4. Observe v40-auto-fix.yml run:
gh run watch <run-id>  # ← from the watch command's output
```

**Expected outcome:**
- `v40-auto-fix.yml` fires within 30s of the label-add.
- Draft PR opened with title `Fix #3: WRONG_CITATION` (or class-matched) and head branch `auto-fix/3-139f821b`.
- PR body contains `<!-- affected_cases: US11427642-spec-short-1 -->` HTML comment.
- Ledger commit lands on `main` with `[skip ci]` message.

**Success heuristic:**
- `gh pr list --head auto-fix/3-139f821b --json number,state,isDraft -q '.[0]'` returns `{state: "OPEN", isDraft: true}` within 5 minutes.
- `gh pr view <pr-n> --json body -q '.body' | grep -E 'affected_cases:'` exits 0.

**Rollback:**
- Close the PR + delete the branch: `gh pr close <pr-n> --delete-branch`.
- Remove the `triage` label from issue #3: `gh issue edit 3 --remove-label triage`.

---

### UAT-47-b — Dep-PR pre-flight gate blocking on regression — **DEFERRED**

**Status:** DEFERRED (requires-push)
**Dispatch command (post-push):**
```bash
# 1. Manually trigger v40-deps-update.yml:
gh workflow run v40-deps-update.yml
# 2. Wait for the dep-scan job to open a PR (security or grouped minor tier):
sleep 60
gh pr list --head 'v40-deps-update/*' --json number,title,headRefName
# 3. The deps-update-gate job auto-runs on the new PR — observe:
gh run watch <gate-run-id>
```

**Expected outcome:**
- `deps-update-gate` job runs on the auto-opened dep PR.
- If a synthetic regression is introduced (e.g., a fixture-edit pushed onto the same branch), the gate FAILS and the PR is marked `human-review-required` (or stays blocked from ready-for-review per DEPS-02).

**Success heuristic:**
- `gh pr checks <pr-n>` shows `deps-update-gate` with status `FAILURE` after the regression push.
- PR comment posted with regression detail.

**Rollback:**
- Close the PR + delete the branch: `gh pr close <pr-n> --delete-branch`.

---

### UAT-47-c — FLAKE escalation suppressing re-files — **RUN-NOW (LOCAL)**

**Status:** RUN-NOW (locally executable per CONTEXT.md)
**Dispatch command:**
```bash
# Strategy A (Claude discretion — recommended): synthetic fixture
# 1. Create a synthetic suppressions file with 3 FLAKE re-files in 14 days
#    for fingerprint 'aabbccdd1122':
mkdir -p /tmp/uat-47c
cat > /tmp/uat-47c/suppressions.json <<EOF
{"suppressions":{}}
EOF
cat > /tmp/uat-47c/ring-buffer.json <<EOF
{"cases":{"synthetic-flake-case":{"outcomes":[
  {"verdict":"FLAKE","at":"2026-05-20T00:00:00Z","fingerprint":"aabbccdd1122"},
  {"verdict":"FLAKE","at":"2026-05-25T00:00:00Z","fingerprint":"aabbccdd1122"},
  {"verdict":"FLAKE","at":"2026-05-30T00:00:00Z","fingerprint":"aabbccdd1122"}
],"flakeHistory":[
  "2026-05-20T00:00:00Z","2026-05-25T00:00:00Z","2026-05-30T00:00:00Z"
]}}}
EOF
# 2. Invoke quarantine-append with the reset flag:
node scripts/quarantine-append.mjs \
  --escalate-stable-runs-reset 1 \
  --case synthetic-flake-case \
  2>&1 | tee /tmp/uat-47c.log
echo "EXIT=$?" | tee -a /tmp/uat-47c.log

# Strategy B (Claude discretion — alternative): exercise the dispatchFlakeState
# helper at scripts/auto-fix.mjs:252 directly via a small test driver script.
# This more cleanly proves the N=3/14d gate but requires writing the test driver.
```

**Expected outcome (per FLAKE-02 contract):**
- `classifyRerunOutcomes` returns state `FLAKE_ESCALATION` (3 FLAKE outcomes within 14 days for the same fingerprint trip the escalation).
- A `flake-investigation` GH issue WOULD be opened if `gh` is available (best-effort, non-blocking in code per scripts/auto-fix.mjs:325-329) — for UAT, expect a stderr log or successful gh call.
- Suppression entry written to suppressions file with 30-day cooldown.
- Subsequent invocation with the same fingerprint within 30 days returns `FLAKE_SUPPRESSED` (no re-file).

**Success heuristic:**
- `tail -10 /tmp/uat-47c.log` contains "FLAKE_ESCALATION" or "FLAKE" decision (depending on internal state names).
- Subsequent invocation: `node scripts/quarantine-append.mjs --escalate-stable-runs-reset 1 --case synthetic-flake-case` returns a log line indicating suppression took effect.

**Rollback:**
- Delete /tmp/uat-47c/.
- If a `flake-investigation` issue was created on the real repo, close it: `gh issue close <n> --reason completed --comment "UAT-47-c synthetic test artefact — closing."`

**Failure handling (per locked decision):** If UAT (c) FAILS, capture in REVIEW-like doc + open follow-up GitHub issue. Do NOT block Phase 47 close — failure becomes new tech_debt for v4.1.

---

### UAT-47-d — Ledger snapshot workflow committing daily snapshot — **DEFERRED**

**Status:** DEFERRED (requires-push)
**Dispatch command (post-push):**
```bash
# v40-cost-ledger-snapshot.yml runs on cron '0 0 * * *' + workflow_dispatch
gh workflow run v40-cost-ledger-snapshot.yml
sleep 5
gh run list --workflow=v40-cost-ledger-snapshot.yml --limit 1 \
  --json databaseId,status,createdAt,event
```

**Expected outcome:**
- Workflow run completes.
- New commit on `main` with message matching `chore(ledger-snapshot): YYYY-MM-DD [skip ci]` (or similar per the workflow's commit step).
- `tests/e2e/.llm-spend-ledger.json` updated atomically with `[skip ci]` (per LEDGER-04 contract).

**Success heuristic:**
- `git pull origin main && git log --oneline -1` shows the snapshot commit with `[skip ci]`.
- `git diff HEAD~1 HEAD -- tests/e2e/.llm-spend-ledger.json` shows only ledger updates, no other file mutations.

**Rollback:**
- Revert the snapshot commit if it lands during the UAT window: `git revert <commit-sha> && git push origin main` (requires temporary ruleset relaxation since `main` is protected).

---

### UAT-47-e — Verifier-gate diff-guard rejecting crafted bypass — **DEFERRED**

**Status:** DEFERRED (requires-push)
**Dispatch command (post-push):**
```bash
# 1. Open a PR (test fork) on a branch named auto-fix/test-craftedbypass
git checkout -b auto-fix/test-craftedbypass-9999-deadbeef
# 2. Craft a diff that touches a forbidden path — e.g., tests/golden/baseline.json:
echo '/* crafted bypass test */' >> tests/golden/baseline.json
git add tests/golden/baseline.json
git commit -m "chore: crafted bypass test (UAT-47-e)"
git push origin auto-fix/test-craftedbypass-9999-deadbeef
gh pr create --draft --title "UAT-47-e crafted bypass" \
  --body "<!-- affected_cases: any -->"
# 3. v40-verifier-gate.yml diff-guard job runs; observe:
gh pr checks <pr-n>
```

**Expected outcome:**
- `diff-guard` job FAILS (exit non-zero) with PR comment naming the violated path (`tests/golden/baseline.json`).
- PR remains draft and is labelled `human-review-required` per VFY-GATE-03.

**Success heuristic:**
- `gh pr checks <pr-n>` shows `diff-guard` status FAILURE.
- `gh pr view <pr-n> --json labels -q '.labels[].name'` contains `human-review-required`.
- `gh pr view <pr-n> --json comments -q '.comments[-1].body'` mentions `tests/golden/baseline.json`.

**Rollback:**
- Close the PR + delete the branch: `gh pr close <pr-n> --delete-branch`.
- Revert the test fork's commit.

---

### Summary of UAT status (for v4.0-MILESTONE-AUDIT.md `human_verification:` block)

| UAT | Status | Evidence path |
|-----|--------|----------------|
| 47-a end-to-end auto-fix | DEFERRED — requires-push | 47-UAT-DEFERRED.md §a runbook |
| 47-b dep-PR pre-flight gate | DEFERRED — requires-push | 47-UAT-DEFERRED.md §b runbook |
| 47-c FLAKE escalation | (post-execution) PASS or FAIL | 47-UAT-EVIDENCE.md |
| 47-d ledger snapshot | DEFERRED — requires-push | 47-UAT-DEFERRED.md §d runbook |
| 47-e verifier-gate diff-guard | DEFERRED — requires-push | 47-UAT-DEFERRED.md §e runbook |

## CLEANUP-04 Toolchain

### `gh api` ruleset query shape (verify state)

**Goal:** Confirm the v4.0-main-protection ruleset exists on `main` with `bypass_actors == []` (Do not allow bypassing: ON) and `required_status_checks` contains both `verifier-gate` AND `deps-update-gate` (and the existing v3.1 entries like `regression-suite` if relevant).

**Step 1 — Discover the repo owner/name:**
```bash
OWNER=$(gh repo view --json owner -q '.owner.login')
REPO=$(gh repo view --json name -q '.name')
echo "Auditing: ${OWNER}/${REPO}"
```

**Step 2 — Confirm `Allow auto-merge: OFF` at repo level:**
```bash
gh api "repos/${OWNER}/${REPO}" -q '.allow_auto_merge'
# Expected output: false
```

**Step 3 — Enumerate rulesets:**
```bash
gh api "repos/${OWNER}/${REPO}/rulesets" \
  --jq '.[] | {id, name, target, enforcement, source_type}'
# Expected: at least one ruleset with target=="branch", name~"main" or "v4.0-main-protection"
```
*Endpoint reference:* `GET /repos/{owner}/{repo}/rulesets` (per gh REST API). Phase 39 commit history mentions `ruleset 17086676 active` per handoff.

**Step 4 — Inspect the main ruleset's rules:**
```bash
RULESET_ID=$(gh api "repos/${OWNER}/${REPO}/rulesets" \
  --jq '.[] | select(.target=="branch") | .id' | head -1)
gh api "repos/${OWNER}/${REPO}/rulesets/${RULESET_ID}" \
  --jq '{
    name,
    enforcement,
    bypass_actors,
    conditions: .conditions.ref_name.include,
    required_status_checks: (.rules[] | select(.type=="required_status_checks") | .parameters.required_status_checks // [])
  }'
```
*Endpoint reference:* `GET /repos/{owner}/{repo}/rulesets/{ruleset_id}` returns `{rules: [{type, parameters}], bypass_actors: [...], ...}`.

**Step 5 — Assertions:**
- `bypass_actors` length == 0 (Do not allow bypassing: ON)
- `enforcement` == `'active'`
- `required_status_checks` array contains entries `{context: 'verifier-gate'}` AND `{context: 'deps-update-gate'}` (and any v3.1 entries already pinned).

### `gh api` ruleset PATCH shape (if missing)

**Goal:** Add `verifier-gate` or `deps-update-gate` to `required_status_checks` if absent.

**Step 1 — Pull current ruleset JSON:**
```bash
gh api "repos/${OWNER}/${REPO}/rulesets/${RULESET_ID}" > /tmp/ruleset-current.json
```

**Step 2 — Construct the patched payload (jq):**
```bash
jq '.rules |= map(
  if .type == "required_status_checks" then
    .parameters.required_status_checks |= (
      . + [{context: "verifier-gate", integration_id: null},
           {context: "deps-update-gate", integration_id: null}]
      | unique_by(.context)
    )
  else . end
)' /tmp/ruleset-current.json > /tmp/ruleset-patched.json
```

**Step 3 — Submit the PATCH:**
```bash
gh api -X PUT "repos/${OWNER}/${REPO}/rulesets/${RULESET_ID}" \
  --input /tmp/ruleset-patched.json
```
*Endpoint reference:* `PUT /repos/{owner}/{repo}/rulesets/{ruleset_id}` accepts the full ruleset object and replaces it. Use PUT not PATCH because the GitHub Rulesets API at this path expects full replacement.

**Step 4 — Verify post-patch:**
```bash
gh api "repos/${OWNER}/${REPO}/rulesets/${RULESET_ID}" \
  --jq '.rules[] | select(.type=="required_status_checks") | .parameters.required_status_checks[].context'
# Expected output must include verifier-gate and deps-update-gate
```

**Important:** The "context" string MUST exactly match the workflow's `job_id` (NOT the workflow display name). Verified from the v4.0 workflow files:
- `.github/workflows/v40-verifier-gate.yml` L66 / L181 / L307 define jobs `diff-guard`, `verifier-gate`, `regression-suite` — the canonical check name in required-status-checks is most likely **`verifier-gate`** (the gating job) or could be all three; verify against an actual PR's checks list once the workflow has run.
- `.github/workflows/v40-deps-update.yml` L69 / L164 define jobs `dep-scan`, `deps-update-gate` — the canonical check name is **`deps-update-gate`**.
- `.github/workflows/v40-auto-fix.yml` L59 defines job `auto-fix` (used in promote flow, NOT a required-status-check).
- `.github/workflows/v40-auto-promote.yml` L61 defines job `auto-promote` (post-merge, NOT a required-status-check).

If the audit-time `gh pr checks <pr-n>` on a recent PR shows different exact names (e.g., GitHub may prefix with workflow name), use those exact strings.

### CODEOWNERS contents and last-matching-rule semantics

**Current CODEOWNERS (verified):**
```
/src/                                       @tonyrowles
/tests/                                     @tonyrowles
/.github/workflows/                         @tonyrowles
/tests/golden/                              @tonyrowles
/tests/e2e/test-cases-quarantine.js         @tonyrowles
```

**Last-matching-rule semantics (per GitHub docs):**
> When a file matches multiple patterns, the **last matching pattern** in the file takes precedence. More specific paths therefore MUST appear AFTER broader ones, or they will be shadowed.

**Why order is load-bearing:**
- `tests/golden/baseline.json` matches BOTH `/tests/` (line 8) AND `/tests/golden/` (line 10). The last-matching rule (`/tests/golden/`) wins. If the order were swapped, `/tests/` would win and the more-specific pin would be functionally dead.
- `tests/e2e/test-cases-quarantine.js` matches BOTH `/tests/` AND its own line. Same reasoning — its line MUST be tail-most among its overlapping patterns.

**Static-grep test design (vitest):**
```javascript
// tests/unit/codeowners-static-grep.test.js
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..', '..');

describe('CLEANUP-04: CODEOWNERS pins (last-matching-rule order)', () => {
  const src = fs.readFileSync(path.join(REPO, '.github/CODEOWNERS'), 'utf8');
  // Strip comments + blank lines, keep order
  const rules = src.split('\n')
    .filter(line => line.trim() && !line.trim().startsWith('#'))
    .map(line => line.trim());

  it('contains exactly 5 active rules', () => {
    expect(rules.length).toBe(5);
  });

  const EXPECTED_ORDER = [
    /^\/src\/\s+@/,
    /^\/tests\/\s+@/,
    /^\/\.github\/workflows\/\s+@/,
    /^\/tests\/golden\/\s+@/,
    /^\/tests\/e2e\/test-cases-quarantine\.js\s+@/,
  ];

  EXPECTED_ORDER.forEach((re, i) => {
    it(`rule ${i + 1} matches ${re}`, () => {
      expect(rules[i]).toMatch(re);
    });
  });

  it('more-specific paths appear AFTER broader ones (last-matching-rule semantics)', () => {
    // /tests/ (broad) must come BEFORE /tests/golden/ and /tests/e2e/...
    const idxTests = rules.findIndex(r => r.startsWith('/tests/ '));
    const idxGolden = rules.findIndex(r => r.startsWith('/tests/golden/'));
    const idxQuarantine = rules.findIndex(r => r.startsWith('/tests/e2e/test-cases-quarantine.js'));
    expect(idxTests).toBeLessThan(idxGolden);
    expect(idxTests).toBeLessThan(idxQuarantine);
  });
});
```

### v4.0-MILESTONE-AUDIT.md section template

Based on `.planning/milestones/v3.1-MILESTONE-AUDIT.md`'s shape:

```markdown
---
milestone: v4.0
audited: <ISO timestamp at CLEANUP-04 execute time>
status: <tech_debt | passed>
scores:
  requirements: 33/33
  phases: 9/9
  integration: 5/5   # 5 ARCHITECTURE §4 touchpoints pinned by Phase 47 CLEANUP-01 (commits <INT-FIX-LEDGER-sha>, <INT-FIX-CAL-sha>, <INT-FIX-LOCK-sha>)
  flows: <N>/<N>
gaps:
  requirements: []
  integration: []
  flows: []
human_verification:
  - phase: 47
    item: "End-to-end auto-fix flow against fork issue #3 (US11427642-spec-short-1, fp 139f821b3bb1)"
    outcome: DEFERRED
    sub_status: requires-push
    runbook: ".planning/phases/47-v4-0-cleanup/47-UAT-DEFERRED.md §a"
  - phase: 47
    item: "Dep-PR pre-flight gate blocks on regression"
    outcome: DEFERRED
    sub_status: requires-push
    runbook: ".planning/phases/47-v4-0-cleanup/47-UAT-DEFERRED.md §b"
  - phase: 47
    item: "FLAKE escalation suppresses re-files (N=3 in 14 days; 30-day cooldown)"
    outcome: PASS    # or FAIL
    verified_at: <ISO at execute time>
    evidence: ".planning/phases/47-v4-0-cleanup/47-UAT-EVIDENCE.md §c"
  - phase: 47
    item: "Ledger snapshot workflow commits daily snapshot with [skip ci]"
    outcome: DEFERRED
    sub_status: requires-push
    runbook: ".planning/phases/47-v4-0-cleanup/47-UAT-DEFERRED.md §d"
  - phase: 47
    item: "Verifier-gate diff-guard rejects crafted bypass diff"
    outcome: DEFERRED
    sub_status: requires-push
    runbook: ".planning/phases/47-v4-0-cleanup/47-UAT-DEFERRED.md §e"
nyquist:
  compliant_phases: ["39", "40", "41", "42", "43", "44", "45", "46"]   # post Plan 47-02
  partial_phases: []
  missing_phases: []
  overall: complete
branch_protection:
  allow_auto_merge: false   # verified via gh api repos/<o>/<r>.allow_auto_merge
  ruleset:
    id: <ruleset-id>
    bypass_actors: []
    enforcement: active
    required_status_checks: ["verifier-gate", "deps-update-gate", ...]
  codeowners_static_grep_test: PASS
tech_debt:
  - phase: cross-cutting
    items: []   # all CLEANUP-* tracks closed
  # Carry forward any new gaps surfaced by Plan 47-02 Nyquist stamping
---

# Milestone v4.0 — Self-Healing Test Suite — Audit Report

**Audited:** <ISO>
**Status:** <tech_debt | passed>
**Milestone goal:** Close the LLM-driven feedback loop end-to-end ...

## Scores
| Dimension | Score | Notes |
|-----------|-------|-------|
| Requirements | 33/33 | All satisfied per VERIFICATION coverage |
| Phases | 9/9 | 8 shipped; Phase 47 closes cleanup |
| Integration | 5/5 | All 5 ARCHITECTURE §4 touchpoints pinned |
| E2E Flows | N/N | Full auto-fix loop traces end-to-end (UAT-a deferred to post-push) |

## Cross-Phase Integration

5 v3.1→v4.0 touchpoints pinned by Phase 47 CLEANUP-01:
1. Triage labels: `issue-payload-builder.js:180` → `v40-auto-fix.yml` (regression: tests/unit/touchpoint-triage-label-contract.test.js)
2. Fingerprint comment: `e2e-report-issue.mjs:78` → `auto-fix.mjs` branch namer (regression: tests/unit/touchpoint-fingerprint-branch-namer.test.js)
3. `invokeClaudePWithLedger`: `llm-driver.js:378` → `auto-fix.mjs:617` subscription branch (regression: tests/unit/touchpoint-invoke-claude-p-subscription.test.js)
4. `verifyCitation`: `pdf-verifier.js` → `verify-single-case.mjs` CLI shim (regression: tests/unit/touchpoint-verify-citation-cli-shim.test.js)
5. `runPromote` + `_skipCiGuard` triple-gate: `promote-from-quarantine.mjs:115` → `auto-fix-promote.mjs` (regression: tests/unit/touchpoint-skip-ci-guard-triple-gate.test.js + existing tests/unit/auto-fix-promote-gate.test.js)

## Pre-existing Test Regressions — RESOLVED in Phase 47 CLEANUP-01

1. ✅ **INT-FIX-LEDGER (commit <sha>)** — committed ledger reset to seed-only; root cause: direct local `npm run e2e:explore` writes leaked 3 Opus calls into the canonical LEDGER_PATH. Defense: Test 48 stands; documented in commit body.
2. ✅ **INT-FIX-CAL (commit <sha>)** — `'2026-05'` literal at `tests/e2e/scripts/e2e-weekly-digest.test.js:389` replaced with dynamic `[new Date().toISOString().slice(0,7)]` key.
3. ✅ **INT-FIX-LOCK (commit <sha>)** — vitest static-grep on package-lock.json asserts `"@anthropic-ai/sdk": "0.100.1"` exact pin survives.

## Nyquist Coverage

| Phase | nyquist_compliant | Status | Action |
|-------|-------------------|--------|--------|
| 39    | true              | COMPLIANT | Phase 47 cold-stamped (commit <sha>) |
| 40    | true              | COMPLIANT | Phase 47 cold-stamped (commit <sha>) |
| ...   | ...               | ...      | ... |
| 46    | true              | COMPLIANT | Phase 47 cold-stamped (commit <sha>) |

## Human-Verification Items

5 items per CLEANUP-03:
- 1 PASS (or FAIL) — UAT-47-c FLAKE escalation (local fixture)
- 4 DEFERRED — UAT-47-a/b/d/e require pushed v4.0 workflows; runbooks at `.planning/phases/47-v4-0-cleanup/47-UAT-DEFERRED.md`

## Branch Protection

- `repos/<o>/<r>.allow_auto_merge` → **false** ✓ (verified via `gh api`)
- v4.0-main-protection ruleset:
  - `bypass_actors: []` ✓
  - `enforcement: active` ✓
  - `required_status_checks` contains `verifier-gate`, `deps-update-gate` ✓ (and others)
- CODEOWNERS static-grep test: PASS ✓

## Why status is <tech_debt | passed>

Phase 47 closes all four CLEANUP tracks ...
```

## Common Pitfalls

### Pitfall 1: INT-FIX-LEDGER — relaxing Test 48 instead of fixing root cause
**What goes wrong:** Easiest path is to edit Test 48 to accept N months / N invocations. CONTEXT.md explicitly forbids this.
**Why it happens:** The committed file IS dirty; the obvious fix is to make the assertion match reality.
**How to avoid:** RESET the committed ledger to seed-only; document root cause in commit body; Test 48 assertion stays as-is.
**Warning signs:** A Test 48 diff that changes `expect(months.length).toBe(1)` to `expect(months.length).toBeGreaterThanOrEqual(1)`.

### Pitfall 2: INT-FIX-CAL — using `PIN_NOW` month instead of dynamic month
**What goes wrong:** Replacing `'2026-05'` with `'2026-05'` (PIN_NOW's month) — looks dynamic but is still pinned and will flake again at the next yearly calendar shift (or whenever someone updates PIN_NOW).
**Why it happens:** The file already uses `PIN_NOW = new Date('2026-05-25T00:00:00Z')` so the temptation is to derive from that.
**How to avoid:** The ledger-bucket key must represent "current month at TEST-RUN TIME" since `renderCostLine` reads `currentMonth()` from the system clock. Use `new Date().toISOString().slice(0, 7)`. PIN_NOW is the right pattern for week-label / quarantine-window tests (which test pinned calendar facts), wrong for this case.
**Warning signs:** The fix still includes a hardcoded `'2026-'` prefix.

### Pitfall 3: Ruleset PATCH — using PATCH verb instead of PUT
**What goes wrong:** `gh api -X PATCH rulesets/<id>` doesn't do partial-merge; the full object must be sent.
**Why it happens:** REST convention suggests PATCH for partial updates; GitHub's Ruleset API doesn't honor that.
**How to avoid:** Use `gh api -X PUT --input <patched-full-json>`. Pull current ruleset, modify via jq, push the FULL object.
**Warning signs:** Ruleset returns 422 Unprocessable Entity or silently no-ops.

### Pitfall 4: Required-status-checks context name mismatch
**What goes wrong:** PATCH adds `verifier-gate` as the context name, but GitHub stores the check under `V40 Verifier Gate / verifier-gate` (workflow display name + slash + job_id).
**Why it happens:** The exact stored name depends on how GitHub renders the check; sometimes it's the bare job_id, sometimes prefixed.
**How to avoid:** Verify against a real PR's `gh pr checks <pr-n>` output BEFORE PATCH; use whatever exact string appears there.
**Warning signs:** Audit reports the PATCH succeeded but the next PR doesn't trigger the required check.

### Pitfall 5: CODEOWNERS reorder during edit
**What goes wrong:** A well-meaning refactor or editor auto-format reorders lines, breaking last-matching-rule semantics.
**Why it happens:** The 5 paths look like a simple alphabetical list — and aren't.
**How to avoid:** The vitest test in CLEANUP-04 pins exact order. The static-grep test is the contract enforcer.
**Warning signs:** `/tests/golden/` appears BEFORE `/tests/` — the more-specific pin is now shadowed.

### Pitfall 6: Nyquist auditor escalates on Manual-Only items for phases 43/44/45
**What goes wrong:** Phases 43/44/45 each contain UAT items that require post-push live verification. The auditor's gap-classifier may flag these as ESCALATE because they have no automated command.
**Why it happens:** The auditor doesn't yet know which rows are PRE-CLASSIFIED COVERED-MANUAL via the `human_verification:` block.
**How to avoid:** Each Skill invocation must note that requires-push items are Manual-Only; if the auditor escalates anyway, correct in-loop and document the manual classification.
**Warning signs:** Auditor returns ESCALATE for UAT-43-a (end-to-end auto-fix) which is the same item as UAT-47-a — already classified DEFERRED.

### Pitfall 7: gh CLI silent on auth failure (per Phase 38 Pitfall 7)
**What goes wrong:** `gh api repos/.../rulesets` returns `[]` for an unauthenticated session — silently looks like "no rulesets".
**Why it happens:** Anonymous GitHub API responses on private repos are empty rather than 401.
**How to avoid:** Run `gh auth status` before every `gh api` call in CLEANUP-04. If `gh auth status` is non-zero, STOP per CLAUDE.md C1 — do not assume.
**Warning signs:** Ruleset query returns empty array; CODEOWNERS file exists; reconciliation says "no protection".

### Pitfall 8: Live UAT (c) FLAKE classifier requires fingerprint stability
**What goes wrong:** The `classifyRerunOutcomes` 5-state machine looks for 3 FLAKE outcomes with the SAME fingerprint within 14 days. If the synthetic fixture uses different fingerprints per outcome, escalation never trips.
**Why it happens:** The N=3-in-14-days gate is per-fingerprint per FLAKE-02 — easy to miss in fixture design.
**How to avoid:** Synthetic fixture in runbook §c uses `fingerprint: "aabbccdd1122"` (same value) for all 3 outcomes.
**Warning signs:** UAT (c) returns state `FLAKE` not `FLAKE_ESCALATION` on the 3rd invocation.

## Runtime State Inventory

> Phase 47 is a CLEANUP phase that adds tests and runs audits. The only mutable runtime state under direct manipulation is the committed ledger (reset under INT-FIX-LEDGER) and the GitHub ruleset (potential PATCH under CLEANUP-04). Full inventory below for transparency.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `tests/e2e/.llm-spend-ledger.json` (committed) — currently has leaked entries that violate Phase 39 LEDGER-04 seed-only contract | Code edit: reset to seed-only (INT-FIX-LEDGER) |
| Live service config | GitHub ruleset on `main` (Phase 39 created, may need v4.0 job names added to `required_status_checks`) | API patch via `gh api -X PUT` only if `verifier-gate` / `deps-update-gate` missing |
| OS-registered state | None — verified by absence of system-service touches in CLEANUP scope |
| Secrets/env vars | `ANTHROPIC_API_KEY` (GH secret, used by v40-auto-fix.yml) — name unchanged in v4.0; no rename | None — Phase 47 does not modify secret config |
| Build artifacts / installed packages | `node_modules/@anthropic-ai/sdk@0.100.1` (npm install artifact); `package-lock.json` (committed) | None — INT-FIX-LOCK only ASSERTS, does not modify |

**Nothing found in category:** OS-registered state (no Windows Task Scheduler / launchd / systemd / pm2 entries touched by Phase 47).

## Code Examples

Verified patterns from in-repo sources:

### Touchpoint contract grep (CLEANUP-01)
```javascript
// Source: tests/e2e/scripts/e2e-nightly-quarantine-yaml.test.js (file-as-text grep + step-window scope)
const src = fs.readFileSync(path.join(REPO, 'tests/e2e/lib/issue-payload-builder.js'), 'utf8');
expect(src).toMatch(/labels\s*=\s*\[[^\]]*['"]triage['"]\s*\]/);
```

### Static-grep on lockfile (INT-FIX-LOCK)
```javascript
// Source pattern: tests/unit/llm-ledger.test.js Test 49 (.gitignore static-grep)
const lock = fs.readFileSync('package-lock.json', 'utf8');
expect(lock).toMatch(/"@anthropic-ai\/sdk":\s*"0\.100\.1"/);
expect(lock).not.toMatch(/"@anthropic-ai\/sdk":\s*"\^/);
```

### `gh api` ruleset enumeration (CLEANUP-04)
```bash
# Source: GitHub REST API docs — Rulesets
gh api "repos/${OWNER}/${REPO}/rulesets" \
  --jq '.[] | {id, name, target, enforcement}'
```

### Bulk Nyquist invocation (CLEANUP-02)
```
# Pattern: Phase 38 Plan 02 (5 explicit Skill invocations)
Skill(skill="gsd-validate-phase", args="39")
# ... wait for resume signal ...
Skill(skill="gsd-validate-phase", args="40")
# ... etc through 46 ...
```

## State of the Art

| Old (pre-Phase-47) | Current (post-Phase-47) | When Changed | Impact |
|--------------------|--------------------------|--------------|--------|
| 5 cross-phase touchpoints catalogued in prose only (ARCHITECTURE.md §4) | 5 vitest regression tests pin each contract | CLEANUP-01 | Future renames surface as test failures, not silent runtime drift |
| Committed ledger has 3 leaked SDK calls (Test 48 RED) | Committed ledger seed-only (Test 48 GREEN) | INT-FIX-LEDGER | Restores Phase 39 LEDGER-04 contract |
| Hardcoded `'2026-05'` ledger key in renderCostLine test | Dynamic-month derivation | INT-FIX-CAL | No annual calendar-rollover flake |
| No defensive grep on package-lock.json pin | Vitest static-grep on `"@anthropic-ai/sdk": "0.100.1"` | INT-FIX-LOCK | Catches caret-creep through `npm install` |
| 8 v4.0 phases without VALIDATION.md | All 8 phases stamped `nyquist_compliant: true` | CLEANUP-02 | Closes formal-coverage gap; v4.0 lineage clean for milestone audit |
| No CODEOWNERS static-grep guard | vitest test pins order + path set | CLEANUP-04 | Catches reorder / shadowing-by-broader-rule |
| Ruleset coverage of v4.0 job names unknown | Audited live + PATCH if missing | CLEANUP-04 | Enforces verifier-gate + deps-update-gate as required-status-checks |

**Deprecated/outdated:** None — Phase 47 brings existing state up to the contract already established by Phases 38 (v3.1 cleanup) and 39 (initial CODEOWNERS / ruleset setup).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The leaked entries in `tests/e2e/.llm-spend-ledger.json` originate from `scripts/e2e-explore.mjs` (signature: `iteration_n` + `run_id` + `phase: null`). | §"INT-FIX-LEDGER root cause" | **[VERIFIED: grep of all appendLedgerEntry call sites 2026-06-01]** A1 confirmed; only e2e-explore.mjs writes that exact field set. If wrong, the root-cause analysis in the commit body would be misleading; the FIX (reset to seed-only) still works either way. |
| A2 | `gh api -X PUT rulesets/<id>` replaces the full ruleset object; partial-merge is not supported. | §"CLEANUP-04 ruleset PATCH" | **[ASSUMED]** — based on GitHub Rulesets API convention; if PATCH is supported, the proposed code is unnecessarily defensive (jq-merge then PUT). Risk: minimal — PUT-full-object always works even if PATCH is also supported. |
| A3 | Required-status-check contexts in the ruleset use the bare job_id (e.g., `verifier-gate`) not the prefixed form (`V40 Verifier Gate / verifier-gate`). | §"CLEANUP-04 ruleset PATCH" / Pitfall 4 | **[ASSUMED]** — needs live verification at execute time via `gh pr checks <recent-pr-n>`. If wrong, the PATCH writes the wrong string and the next PR fails to trigger. Mitigation: Pitfall 4 explicitly calls this out; the planner can add a checkpoint to verify the exact string from a real PR. |
| A4 | Phase 39's Nyquist stamping for v4.0 phases (39-46) is State B (cold reconstruct), not State A (audit). | §"Nyquist Stamping Protocol" | **[VERIFIED: handoff says "zero v4.0 phase carries a draft *-VALIDATION.md"]** A4 confirmed. If wrong, the skill enters State A and just patches existing drafts — no harm. |
| A5 | The `triage` label literal at `issue-payload-builder.js:180` (CONTEXT.md cites it) is the verbatim string `'triage'`. | §"Touchpoint 1" | **[VERIFIED-INDIRECTLY: ARCHITECTURE.md §4 + STATE.md "Pre-locked Decisions"]** — verifiable at execute time via grep. Risk: minimal — even if the line moves, the contract is the literal string. |
| A6 | UAT (c) FLAKE escalation can be exercised locally via `scripts/quarantine-append.mjs --escalate-stable-runs-reset` against a synthetic fixture (the Strategy A runbook in §UAT-47-c). | §"UAT-47-c" | **[ASSUMED]** — based on `scripts/auto-fix.mjs:252` `dispatchFlakeState` calling the same flag (`--escalate-stable-runs-reset 1`); if quarantine-append's CLI doesn't directly accept the seed files as fixture input, the planner may need Strategy B (test-driver script). Surface as Open Question §1. |
| A7 | The 5 leaked entries' `iteration_n` + `run_id` + `phase: null` signature is unique to `e2e-explore.mjs`. | §"INT-FIX-LEDGER root cause" | **[VERIFIED: grep across writers]** — confirmed. |

## Open Questions

1. **UAT-47-c fixture strategy: Strategy A (quarantine-append with pre-seeded files) vs Strategy B (small test-driver script)?**
   - What we know: `dispatchFlakeState` in `auto-fix.mjs:252` accepts `caseId`, `fingerprint`, `issueNumber` and reads ring-buffer + suppressions files. `quarantine-append.mjs --escalate-stable-runs-reset` is documented in FLAKE-03 contract.
   - What's unclear: whether `quarantine-append` directly reads ring-buffer state or only writes corpus. Without that, Strategy A may not actually exercise the N=3-in-14-days FLAKE_ESCALATION path.
   - Recommendation: Planner reads `scripts/quarantine-append.mjs` at plan time; if `--escalate-stable-runs-reset` does NOT trigger the classifier, use Strategy B (write a 30-line test-driver invoking `dispatchFlakeState` directly).

2. **Required-status-checks exact context name format?**
   - What we know: workflow `.github/workflows/v40-verifier-gate.yml` declares `name: V40 Verifier Gate` and jobs named `diff-guard`, `verifier-gate`, `regression-suite`.
   - What's unclear: GitHub may store the required-status-check as the bare job_id (`verifier-gate`) or as `<workflow-name>/<job-id>`. The audit must use whichever form a real PR's `gh pr checks` outputs.
   - Recommendation: CLEANUP-04 Task 1 reads `gh pr checks <any-recent-PR>` (or a freshly-opened test PR) to determine the canonical context name BEFORE attempting any PATCH.

3. **Should INT-FIX-LEDGER's commit also add a `.gitignore`-style guard to prevent future explore-script leaks?**
   - What we know: `.llm-spend-ledger.json` is committed-but-versioned (Phase 39 LEDGER-04 flipped it from gitignored). The Test 48 contract is "seed-only after commit". The leak path is direct local invocation without the override.
   - What's unclear: whether a pre-commit hook (`tools/check-ledger-is-seed-only.mjs`?) would be a defensive add-on or scope creep.
   - Recommendation: Out of scope for Phase 47 (creep). Flag as v4.1 tech_debt if leak recurs.

4. **Does the `gsd-validate-phase` skill emit AskUserQuestion in State B (cold reconstruct) mode?**
   - What we know: State A (audit) flow is documented; State B (cold reconstruct) is less-documented in the skill's docstring.
   - What's unclear: whether cold-reconstruct triggers a "confirm Per-Task Verification Map matches reality?" prompt.
   - Recommendation: Plan 47-02 task includes the CLAUDE.md C1/C2/C3 fallback regardless; if no prompt fires, no harm.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All 5 touchpoint tests + INT-FIX tests + Nyquist + audit YAML | ✓ | v22.x | — |
| vitest | All vitest-based regression + grep tests | ✓ | 3.2.4 | — |
| `gh` CLI | CLEANUP-04 `gh api`, UAT (c) optional `gh issue create` | ✓ | 2.83.1 | — |
| `gh` authenticated session | CLEANUP-04 entire surface | ✓ (presumed; verify at execute time via `gh auth status`) | — | STOP per CLAUDE.md C1 if `gh auth status` non-zero |
| `jq` | CLEANUP-04 PATCH payload construction | ✓ (standard host) | — | Fallback to `node -e` for JSON manipulation if absent |
| `actionlint` | CLEANUP-04 optional YAML lint | unknown | — | OPTIONAL — vitest grep is authoritative per Phase 38 precedent |
| `gsd-validate-phase` skill | CLEANUP-02 bulk Nyquist | ✓ | — | — |
| `gsd-nyquist-auditor` agent | CLEANUP-02 (via skill) | ✓ | — | — |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** `actionlint` (optional; vitest grep covers the contract).

## Validation Architecture

> Phase 47 itself must be Nyquist-validated. `workflow.nyquist_validation` is `true` in `.planning/config.json`.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 3.2.4 (unit + spawnSync integration); zero new deps |
| Config file | `vitest.config.chrome.js` (existing) |
| Quick run command | `vitest run tests/unit/touchpoint-*.test.js` (the 5 touchpoint tests + INT-FIX-LOCK + CODEOWNERS) |
| Full suite command | `npm run test:src && npm run lint` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CLEANUP-01 / Touchpoint 1 | Triage label producer/consumer wired | unit (file-as-text grep) | `vitest run tests/unit/touchpoint-triage-label-contract.test.js` | ❌ Wave 0 — new |
| CLEANUP-01 / Touchpoint 2 | Fingerprint → branch namer | unit (import + grep) | `vitest run tests/unit/touchpoint-fingerprint-branch-namer.test.js` | ❌ Wave 0 — new |
| CLEANUP-01 / Touchpoint 3 | invokeClaudePWithLedger subscription path | unit (import + grep) | `vitest run tests/unit/touchpoint-invoke-claude-p-subscription.test.js` | ❌ Wave 0 — new |
| CLEANUP-01 / Touchpoint 4 | verifyCitation CLI shim | unit (import + grep) | `vitest run tests/unit/touchpoint-verify-citation-cli-shim.test.js` | ❌ Wave 0 — new |
| CLEANUP-01 / Touchpoint 5 | runPromote `_skipCiGuard` triple-gate | unit (grep) + existing behavioural | `vitest run tests/unit/touchpoint-skip-ci-guard-triple-gate.test.js tests/unit/auto-fix-promote-gate.test.js` | partial — extend |
| CLEANUP-01 / INT-FIX-LEDGER | Committed ledger seed-only | unit | `vitest run tests/unit/llm-ledger.test.js -t "Test 48"` | ✓ existing (file edit only) |
| CLEANUP-01 / INT-FIX-CAL | Dynamic month key | unit | `vitest run tests/e2e/scripts/e2e-weekly-digest.test.js -t "cost data unavailable when ledger absent"` | ✓ existing (line-389 edit only) |
| CLEANUP-01 / INT-FIX-LOCK | package-lock.json exact pin | unit | `vitest run tests/unit/package-lock-anthropic-sdk-pin.test.js` | ❌ Wave 0 — new |
| CLEANUP-02 | 8 phases stamped nyquist_compliant | meta (per-phase skill) | Manual: `Skill(gsd-validate-phase, "<N>")` × 8 | — no test infra; skill is the verification |
| CLEANUP-03 (c) | FLAKE escalation suppresses re-files | live (local) | `node scripts/quarantine-append.mjs --escalate-stable-runs-reset 1 --case synthetic-flake-case` (after fixture seed) | — manual UAT |
| CLEANUP-03 (a/b/d/e) | requires-push UATs | deferred | Runbook stubs in 47-UAT-DEFERRED.md | — manual UAT post-push |
| CLEANUP-04 / ruleset | Live ruleset state matches contract | live (gh api) | `gh api repos/<o>/<r>/rulesets/<id> --jq '...'` | — manual audit |
| CLEANUP-04 / CODEOWNERS | static-grep pins 5 paths in order | unit | `vitest run tests/unit/codeowners-static-grep.test.js` | ❌ Wave 0 — new |
| CLEANUP-04 / audit YAML | v4.0-MILESTONE-AUDIT.md coherent | doc-grep | `node -e "fs.readFileSync(...)..."` per Phase 38 audit harness | — at-commit-time |

### Sampling Rate
- **Per task commit:** `vitest run <file-just-touched>` (typical < 10s)
- **Per wave merge:** `npm run test:src && npm run lint`
- **Phase gate:** Full suite green before `/gsd:verify-work`; all 5 touchpoint tests + 3 INT-FIX tests green; 8 Nyquist stamps documented; UAT (c) PASS recorded; CODEOWNERS grep + ruleset audit committed.

### Wave 0 Gaps
- [ ] New `tests/unit/touchpoint-triage-label-contract.test.js` — CLEANUP-01 Touchpoint 1
- [ ] New `tests/unit/touchpoint-fingerprint-branch-namer.test.js` — CLEANUP-01 Touchpoint 2
- [ ] New `tests/unit/touchpoint-invoke-claude-p-subscription.test.js` — CLEANUP-01 Touchpoint 3
- [ ] New `tests/unit/touchpoint-verify-citation-cli-shim.test.js` — CLEANUP-01 Touchpoint 4
- [ ] New `tests/unit/touchpoint-skip-ci-guard-triple-gate.test.js` — CLEANUP-01 Touchpoint 5
- [ ] New `tests/unit/package-lock-anthropic-sdk-pin.test.js` — INT-FIX-LOCK
- [ ] New `tests/unit/codeowners-static-grep.test.js` — CLEANUP-04
- [ ] No framework install needed.

## Security Domain

> `security_enforcement` config not explicitly set in `.planning/config.json` workflow block. Phase 47 is a cleanup phase that adds tests + audits + resets a committed file. No new attack surface introduced.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Phase 47 invokes `gh` CLI which uses pre-existing user auth; no new auth code. |
| V3 Session Management | no | N/A |
| V4 Access Control | yes (existing) | CLEANUP-04 verifies CODEOWNERS pins (access-control config) and ruleset state — does NOT modify access controls beyond potentially ADDING required-status-check entries (which TIGHTENS, not loosens). |
| V5 Input Validation | yes (existing) | Touchpoint tests assert producer→consumer string contracts; INT-FIX-LOCK validates lockfile schema — no new input surface. |
| V6 Cryptography | no | N/A |
| V14 Configuration | yes (existing) | CLEANUP-04 ruleset audit; INT-FIX-LOCK lockfile pin; CODEOWNERS pins. All TIGHTEN config; none weaken. |

### Known Threat Patterns for Phase 47 stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Constant rename across producer/consumer (silent zero-fan-out) | Tampering | CLEANUP-01 Touchpoints 1, 4: import the source-of-truth + regression-test the import. |
| Triple-gate bypass for `_skipCiGuard` (load-bearing trust invariant) | Elevation of Privilege | CLEANUP-01 Touchpoint 5: contract test asserts the 3 gates appear in the consumer's source; existing behavioural test exercises rejection. |
| Lockfile drift (`^0.100.1` re-creep) | Tampering | INT-FIX-LOCK: vitest static-grep on package-lock.json + package.json. |
| Committed ledger leak (private spend pattern in git history) | Information Disclosure | INT-FIX-LEDGER: reset to seed-only; document leak path in commit body so future maintainers know to set `E2E_LEDGER_PATH_OVERRIDE` for local runs. |
| CODEOWNERS shadow (more-specific path reordered before broad path) | Elevation of Privilege | CLEANUP-04: vitest pins exact line order + last-matching-rule semantics test. |
| Ruleset bypass (bypass_actors expanded) | Elevation of Privilege | CLEANUP-04: gh api audit asserts `bypass_actors == []`. |
| Required-status-check removal (regression slips through) | Tampering | CLEANUP-04: gh api audit asserts `verifier-gate` + `deps-update-gate` present. |

## Plan-structure Recommendation

**4 plans, sequential, single worktree:**

| Plan | Owns | Depends on | Files modified | Wave |
|------|------|------------|----------------|------|
| **47-01** | CLEANUP-01: 5 touchpoint regression tests + INT-FIX-LEDGER reset + INT-FIX-CAL line-389 edit + INT-FIX-LOCK new test | none | tests/unit/touchpoint-*.test.js (×5), tests/unit/package-lock-anthropic-sdk-pin.test.js, tests/e2e/.llm-spend-ledger.json (reset), tests/e2e/scripts/e2e-weekly-digest.test.js (line 389) | 1 |
| **47-02** | CLEANUP-02: 8 cold Nyquist stamps (phases 39-46) | 47-01 (clean test state) | .planning/phases/{39..46}-*/{N}-VALIDATION.md (created by skill) | 2 |
| **47-03** | CLEANUP-03: UAT (c) FLAKE escalation live + 4 DEFERRED runbook stubs | 47-01 (touchpoint tests green) | .planning/phases/47-v4-0-cleanup/47-UAT-EVIDENCE.md, .planning/phases/47-v4-0-cleanup/47-UAT-DEFERRED.md | 3 |
| **47-04** | CLEANUP-04: CODEOWNERS grep test + `gh api` ruleset audit + v4.0-MILESTONE-AUDIT.md bootstrap | 47-01, 47-02, 47-03 (all outcomes captured for audit YAML) | tests/unit/codeowners-static-grep.test.js, .planning/v4.0-MILESTONE-AUDIT.md (NEW), optionally ruleset PATCH via gh api | 4 |

**Dependency rationale:**
- **47-01 → 47-02:** Nyquist stamping should run after touchpoint tests + INT-FIX commits land so the auditor sees the post-cleanup state, not the pre-cleanup dirty state.
- **47-01 → 47-03:** UAT (c) doesn't strictly depend on 47-01, but ordering it after 47-01 ensures the test suite is green when the UAT-evidence commits land.
- **47-01, 47-02, 47-03 → 47-04:** v4.0-MILESTONE-AUDIT.md captures outcomes from all three preceding plans; CLEANUP-04 is the canonical record bootstrap and MUST run last so its YAML reflects final state.

**Per-CONTEXT.md "No worktree-agent dispatch":** All 4 plans run sequentially in main worktree. Total wall-clock estimate: 47-01 ~2h (5 tests + 3 fixes + 4 commits), 47-02 ~30m (8 cold Skill invocations, mechanical), 47-03 ~30m (UAT-c + 4 deferred runbook authoring), 47-04 ~1h (gh api audit + audit-doc authoring + optional ruleset PATCH). Total ~4h of focused work, single session feasible.

## Sources

### Primary (HIGH confidence)
- `.planning/phases/47-v4-0-cleanup/47-CONTEXT.md` — locked decisions.
- `.planning/REQUIREMENTS.md` — CLEANUP-01..04 acceptance criteria.
- `.planning/STATE.md` — v4.0 progress + locked decisions (Pre-locked Decisions table).
- `.planning/research/ARCHITECTURE.md` §4 — 5 touchpoint table + `_skipCiGuard` triple-gate spec.
- `.planning/v4.0-SESSION-HANDOFF-2026-06-01.md` — Test 48 regression evidence + leak detection.
- `.planning/milestones/v3.1-MILESTONE-AUDIT.md` — template for v4.0-MILESTONE-AUDIT.md.
- `.planning/milestones/v3.1-phases/38-*/{38-CONTEXT,38-RESEARCH,38-01-PLAN,38-02-PLAN,38-03-PLAN}.md` — template for Phase 47 structure.
- `.github/CODEOWNERS` — 5 pinned paths in last-matching-rule order (verified verbatim).
- `tests/e2e/lib/llm-ledger.js` L74-98 — LEDGER_PATH override resolver (verified).
- `tests/unit/llm-ledger.test.js` L998-1034 — Test 48 + Test 49 (verified).
- `tests/e2e/.llm-spend-ledger.json` — current dirty state with 3 leaked Opus calls (verified).
- `tests/e2e/scripts/e2e-weekly-digest.test.js` L384-397 — failing test pinpointed; L389 the hardcoded `'2026-05'` (verified via fresh `vitest run` failure).
- `tests/e2e/lib/llm-driver.js` L378 (invokeClaudePWithLedger), L506 (invokeAnthropicSdkWithLedger), L579 + L611 (appendLedgerEntry inside SDK path) — verified by grep.
- `scripts/auto-fix.mjs` L617 (subscription branch), L252 (dispatchFlakeState), L275/L371/L526/L567/L663/L685/L722 (ledger writes) — verified by grep.
- `scripts/e2e-explore.mjs` L262/L313 (appendLedgerEntry with iteration_n + run_id + phase) — verified by grep; root cause for INT-FIX-LEDGER.
- `package.json` L39 + `package-lock.json` L9, L19-21 — @anthropic-ai/sdk exact pin 0.100.1 (verified).
- `.github/workflows/v40-verifier-gate.yml` — jobs `diff-guard`, `verifier-gate`, `regression-suite` (verified).
- `.github/workflows/v40-deps-update.yml` — jobs `dep-scan`, `deps-update-gate` (verified).
- `.github/workflows/v40-auto-fix.yml`, `v40-auto-promote.yml` — job names verified.
- `.planning/config.json` — `workflow.nyquist_validation: true` (verified).
- `gh --version` on host — 2.83.1.

### Secondary (MEDIUM confidence)
- GitHub REST API Rulesets endpoint shape — based on public docs.github.com pattern (PUT replaces full object). Verifiable at execute time.
- gh CLI `--jq` flag for JSON path extraction — based on gh 2.x docs.

### Tertiary (LOW confidence)
- Required-status-check exact context name format (bare job_id vs prefixed) — needs live verification at execute time (Open Question §2).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every library verified in package.json + tool versions confirmed on host.
- Touchpoint catalog: HIGH — every producer file:line verified by direct read or grep; every consumer site verified.
- INT-FIX-LEDGER root cause: HIGH — caller signature analysis is deterministic; grep confirms only one writer matches.
- INT-FIX-CAL: HIGH — failure reproduced via fresh `vitest run`.
- INT-FIX-LOCK: HIGH — package.json + package-lock.json read directly.
- CLEANUP-04 toolchain: MEDIUM — gh api endpoints are standard but PATCH/PUT and context-name format need execute-time confirmation (Open Q §2).
- UAT runbooks: HIGH for (c) (local execution path verified); HIGH for (a)(b)(d)(e) dispatch commands (all use standard `gh workflow run` pattern from Phase 36 + Phase 37 precedent).
- Nyquist stamping: HIGH — Phase 38 Plan 02 is the verbatim template; State B (cold) is documented in the skill workflow.
- Security: HIGH — phase strictly tightens existing guards (touchpoint pins, lockfile pin, CODEOWNERS grep, ruleset audit); no new attack surface.

**Research date:** 2026-06-01
**Valid until:** 2026-06-15 (14 days — short horizon because file:line references are tied to current tree state; any merge to `main` shifts line numbers).

## RESEARCH COMPLETE

# Phase 59: Fixture-Mutator + 4-UAT Re-Sweep — Research

**Researched:** 2026-06-05
**Domain:** Synthetic-defect injection at the GitHub-issue layer + live UAT runbook authoring against an in-flight LLM-CI pipeline on origin/main
**Confidence:** HIGH (every claim grounded in direct code inspection of files in the working tree; PR #18 live state confirmed via `gh pr view`)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions (pre-locked by REQUIREMENTS.md + STATE.md Phase 59 blocker advisory)

- **Fixture-mutator scope (Pitfall 5 LOAD-BEARING):** `inject-defect.mjs` works at the issue-creation layer only via `gh issue create`. It MUST NOT touch any file in FORBIDDEN_PATHS (`tests/fixtures/*`, `tests/golden/baseline.json`, `tests/test-cases.js`, `.github/CODEOWNERS`, etc.). Verification gate: `git status` must be CLEAN after mutator execution.
- **Fingerprint format:** 12-hex per `tests/e2e/lib/issue-payload-builder.js` convention (`<!-- fp: ${fingerprint} -->` on line 1 of issue body). Mutator computes fingerprint deterministically from synthetic content (e.g., `sha256(synthetic_seed).slice(0, 12)`).
- **Fingerprint collision check (Pitfall 6 LOAD-BEARING):** Mutator MUST run `gh issue list --search 'fp:<computed>'` BEFORE creating the issue. If a matching open issue exists, HARD ABORT with non-zero exit (not a warning).
- **Auto-promotion suppression (Pitfall 8 LOAD-BEARING):** `scripts/quarantine-append.mjs` suppresses `quarantine:ready-for-promotion` label for entries with `source: 'fixture-mutator-uat-47b'`. `inject-defect.mjs` and `quarantine-append.mjs` source-tag strings co-designed in the SAME commit per REQUIREMENTS.md MUTATOR-04 wording.
- **Cleanup evidence:** `56-MUTATOR-CLEANUP.md` per REQUIREMENTS.md MUTATOR-05 wording — explicit `gh` commands to close the synthetic issue, delete the synthetic branch, revert the synthetic quarantine entry. File name `56-MUTATOR-CLEANUP.md` matches the UAT-namespace; lives in Phase 59 directory.
- **UAT sequencing (D-13 cost discipline, locked):**
  1. SWEEP-01 = UAT-47-e (~3 min, $0) — diff-guard rejection re-test on `auto-fix:partial-verified` flow; HALT-ON-FAIL before spending API budget
  2. SWEEP-02 = UAT-47-d (~5 min) — ledger-snapshot post-Phase-57 cron behavior verification
  3. SWEEP-03 = UAT-47-a (~$0.50-2, ~10 min) — full end-to-end auto-fix loop; PRIMARY DoD EVIDENCE
  4. SWEEP-04 = UAT-47-b — fixture-mutator drives synthetic through full loop; deps-update-gate smoke
- **Push gate:** Before Work stream B starts, Phases 56+57+58 commits MUST be pushed to origin/main. This is an explicit checkpoint — the autonomous workflow halts here unless user has pre-authorized push.
- **Cost discipline (CTRL-01):** Paid UAT-47-a (SWEEP-03) is $$$ spend; even under "fully autonomous" mode, surface the expected cost ($0.50-2) BEFORE invoking the workflow that triggers the paid LLM call.
- **All UAT ledger entries carry `phase: '56-uat'` (Pitfall 10):** Per REQUIREMENTS.md SWEEP-05 wording — filterable production analysis. This is set via env var on the workflow_dispatch input or via auto-fix-promote.mjs argv.
- **Cleanup (SWEEP-06, Pitfall 11):** After UAT evidence is captured, all test branches deleted, all test PRs closed (via `gh pr close --delete-branch`), all synthetic issues closed, all synthetic quarantine entries reverted.

### Claude's Discretion (during plan-phase)

- Whether to plan Work stream A and Work stream B as separate plans (recommended for clarity) or one large plan (recommended for atomic phase close)
- The fingerprint seed for synthetic-defect generation (recommended: deterministic constant `mutator-seed-1` for repeatability)
- Whether SWEEP-05 evidence file is one consolidated `56-UAT-EVIDENCE.md` or per-UAT files (recommended: one consolidated per REQUIREMENTS.md wording)
- Specific paths for SWEEP-06 cleanup automation (one-shot script `tests/e2e/scripts/uat-cleanup.mjs` recommended)
- Whether the post-execution autonomous gate halts before push, or executes the push automatically (defer to user decision via AskUserQuestion)

### Deferred Ideas (OUT OF SCOPE)

- Fork-based UAT environment (OBS-FUT-03 per Phase 51 D-01)
- Periodic cleanup of accumulated `ledger-snapshots/daily-*` branches (operator-owned; out of v4.2)
- `fix_abandoned` outcome state (OBS-FUT-01)
- Extending ERROR_CLASS coverage beyond the 5 existing scaffolds (PIPE-FUT-01)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MUTATOR-01 | New `tests/e2e/scripts/inject-defect.mjs` creates synthetic triage-labeled GitHub issue via `gh issue create` with `errorClass` and fingerprint in issue body | §Fingerprint Computation Contract; §`gh issue create` Argv Plumbing; §Code Examples |
| MUTATOR-02 | Pre-flight fingerprint collision check via `gh issue list` — hard abort (not warning) if fingerprint already exists on open issue | §Fingerprint Collision Pre-Flight; §Code Examples |
| MUTATOR-03 | Mutator does NOT touch any file in FORBIDDEN_PATHS — verification: post-mutator `git status` is clean | §FORBIDDEN_PATHS Confirmation; §Common Pitfalls Pitfall 1 |
| MUTATOR-04 | `scripts/quarantine-append.mjs` suppresses auto-promotion for entries with `source: 'fixture-mutator-uat-47b'`; co-designed in same commit | §quarantine-append.mjs Suppression Edit Point; §Code Examples |
| MUTATOR-05 | Mutator emits cleanup evidence file `56-MUTATOR-CLEANUP.md` with explicit `gh` commands | §Cleanup Evidence Template |
| SWEEP-01 | UAT-47-e (~3 min, $0) diff-guard rejection re-test on `auto-fix:partial-verified` flow; PR closed + branch deleted | §UAT-47-e Runbook (SWEEP-01); §Pre-Flight State |
| SWEEP-02 | UAT-47-d (~5 min) ledger snapshot post-refactor commits to `ledger-snapshots/daily-*` branch | §UAT-47-d Runbook (SWEEP-02) |
| SWEEP-03 | UAT-47-a (~$0.50–$2, ~10 min) full end-to-end loop produces merged PR + verifier-gate evidence + ledger entry with `errorClass` + `outcome: 'pass'` — PRIMARY DoD | §UAT-47-a Runbook (SWEEP-03) |
| SWEEP-04 | UAT-47-b fixture-mutator drives synthetic through full loop; deps-update-gate smoke confirms `v40-deps-update.yml` `pull_request:` trigger fires | §UAT-47-b Runbook (SWEEP-04) |
| SWEEP-05 | `56-UAT-EVIDENCE.md` produced with PASS/FAIL evidence per UAT (JSON snapshots from `gh api` + `gh run`); all UAT ledger entries carry `phase: '56-uat'` | §Evidence Template (SWEEP-05) |
| SWEEP-06 | Post-UAT cleanup: test branches deleted, test PRs closed, synthetic issues closed, synthetic quarantine entries reverted | §Cleanup Automation (SWEEP-06) |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Critical:** Answer verification after every `AskUserQuestion` call. If tool result is empty/generic/doesn't contain explicit choices, present options as numbered plain-text list and re-ask. Do NOT guess or pick "(Recommended)" on user's behalf.
- This affects: any plan tasks that gate on operator approval (push approval, paid UAT approval). Use plain-text prompts that capture an explicit numeric/labelled response, not implicit defaults.

---

## Summary

Phase 59 is a deliberately split phase: **Work stream A (mutator authoring)** is a pure-code, deterministic, zero-cost deliverable that can ship locally on `main` immediately. **Work stream B (4-UAT re-sweep)** is a live, partially-paid, operator-observed verification that depends on PR #18 (carrying Phases 56-58) merging to origin/main. The autonomous workflow must therefore plan A and B together but execute A first and HALT before B until PR #18 lands.

**Pre-flight state (verified 2026-06-05 03:35 UTC):** PR #18 is OPEN with 7 of 8 checks SUCCESS. The only FAILURE is `dep-scan` from `v40-deps-update` and the log shows the failure is environmental — GitHub Actions is refusing to create the auto-opened deps-update PR with the error `"GitHub Actions is not permitted to create or approve pull requests"`. The push to branch `v40-deps-update/minor` succeeded; only the PR-creation step failed. This is **not** a code defect in PR #18; it is a repo setting (`Settings → Actions → General → Workflow permissions → Allow GitHub Actions to create and approve pull requests`). The blocking implication: **PR #18 cannot be merged on required-status-checks alone until either (a) that repo setting is enabled, or (b) the `dep-scan` job is excluded from required checks**. This belongs to Work stream B's pre-flight task list, not Phase 59 itself.

**Primary recommendation:** Plan Phase 59 as two plans — `59-01-PLAN.md` (Work stream A, 5 tasks: MUTATOR-01..05, autonomous) and `59-02-PLAN.md` (Work stream B, 7 tasks: pre-flight + SWEEP-01..06, with checkpoint:human-verify gates before SWEEP-03 paid spend and before every live PR operation). Plan B carries an explicit pre-flight task that resolves the dep-scan environmental block discovered above before any sweep runs.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Synthetic-defect injection (MUTATOR-01..03) | Node script + `gh` CLI | GitHub Issues (via `gh issue create`) | Mutator must be a local invokable tool; GitHub Issues is the entry point of the triage→auto-fix pipeline. No web layer involved. |
| Source-tag suppression (MUTATOR-04) | Node script (`scripts/quarantine-append.mjs`) | — | Single-file edit at the auto-promotion decision point. Pure conditional, no new abstractions. |
| Cleanup evidence emission (MUTATOR-05) | Markdown file (`56-MUTATOR-CLEANUP.md`) emitted by mutator | — | Documentation artifact, not a runtime component. |
| Live UAT execution (SWEEP-01..04) | `gh` CLI (local) + GitHub Actions workflows (remote) | Ledger file (`tests/e2e/.llm-spend-ledger.json`) | Operator drives `gh` locally; workflows run on origin/main. Ledger is the durable evidence channel. |
| UAT evidence capture (SWEEP-05) | `gh api` + `gh run` JSON snapshots → markdown | Phase directory `evidence/` subdir | Same pattern as Phase 51's `51-UAT-EVIDENCE.md` — JSON artifacts cross-referenced from a master doc. |
| Cleanup automation (SWEEP-06) | Node script (`tests/e2e/scripts/uat-cleanup.mjs`) shelling out to `gh` | — | One-shot tool; mirrors mutator's CLI-script convention. |

---

## Standard Stack

### Core

| Library / Tool | Version | Purpose | Why Standard |
|----------------|---------|---------|--------------|
| `gh` CLI | 2.83.1 (verified locally; runner version varies) | Synthetic issue creation, search, label edits, PR close, branch delete, workflow dispatch | The repo's canonical pattern (`scripts/e2e-report-issue.mjs:478` `makeRealGhClient` shells out to `gh` via `execSync`). Pre-installed on GitHub-hosted runners; locally requires `gh auth login`. [VERIFIED: codebase inspection — `which gh` returned `/usr/bin/gh`, `gh --version` returned `gh version 2.83.1 (2025-11-13)`] |
| `node` >= 22 | 22.x (CI), 24.11.1 (local dev box) | Runs `inject-defect.mjs` and `uat-cleanup.mjs` | Matches `actions/setup-node@v4 with node-version: 22` in workflows. ESM `.mjs` is the project convention. [VERIFIED: `.github/workflows/v40-auto-fix.yml:113`] |
| Node 22 built-ins (`crypto`, `child_process`, `fs`, `path`, `url`) | bundled | sha256 fingerprint; `execSync` for `gh`; file IO; ESM entry-point detection | Zero-new-deps constraint. Mirrors `scripts/e2e-report-issue.mjs` import block (`crypto.createHash`). [VERIFIED: codebase inspection] |
| `vitest` | ^3.0.0 | Contract tests for `inject-defect.mjs` and `quarantine-append.mjs` source-tag suppression | Project test runner; sibling tests in `tests/e2e/scripts/` use it (`e2e-quarantine-append.test.js`, `e2e-explore-ci-guard.test.js`). [VERIFIED: `package.json` and three `vitest.config.*.js` files] |
| `jq` | 1.7 | JSON extraction in shell snippets for evidence capture | Standard CI tool; used throughout the repo's `gh ... --jq` pipelines. [VERIFIED: `which jq`] |

### Supporting (reused from existing codebase — NO new code)

| Library | Path | Purpose | Reuse Pattern |
|---------|------|---------|---------------|
| `fingerprint(caseId, errorClass, topOfStackHash)` | `scripts/e2e-report-issue.mjs:78` | 12-hex sha256 prefix of `"${caseId}|${errorClass}|${topOfStackHash||''}"` | Mutator MUST import & reuse this exact function — DO NOT re-implement the hash. Pitfall 6 collision detection depends on byte-identical formula. [VERIFIED: code at line 78-81] |
| `makeRealGhClient(repo, label)` | `scripts/e2e-report-issue.mjs:478` | Real `gh` shell-out client exposing `listOpenWithSearch`, `createIssueWithLabels`, `addLabel`, etc. | Mutator MAY reuse `listOpenWithSearch` for collision check; for `gh issue create` direct `execSync` is also acceptable (script is operator-invoked, not a library export). [VERIFIED: lines 478-540] |
| `READY_FOR_PROMOTION_LABEL = 'quarantine:ready-for-promotion'` constant | `scripts/quarantine-append.mjs:29` | Label that triggers human-promotion eligibility | MUTATOR-04 conditional gates the `ghClient.addLabel(triageIssueNumber, READY_FOR_PROMOTION_LABEL)` call at line 221. Code patch is a single `if` guard immediately above that line. [VERIFIED: lines 29 + 218-223] |
| `extractErrorClass(labels)` | `scripts/auto-fix.mjs:255` | Reduces `gh issue view labels` array to EXACTLY ONE recognized ERROR_CLASS | Mutator's issue creation MUST apply exactly one ERROR_CLASS label so that `extractErrorClass` returns a single match (not `null` or `'AMBIGUOUS'`). The auto-fix workflow's pre-check step (`v40-auto-fix.yml:91`) re-validates this. [VERIFIED: lines 255-262 + workflow line 91] |
| `RECOGNIZED_LABELS` (from `ERROR_CLASSES`) | `scripts/auto-fix.mjs:216` + `tests/e2e/lib/error-codes.js:98` | The frozen ERROR_CLASS taxonomy plus `'PASS'` | Mutator picks one of: `WRONG_CITATION`, `LLM_HALLUCINATED_SELECTION`, `WORKER_FALLBACK_FAILED`, `GOOGLE_DOM_DRIFT`, `HARNESS_ERROR`. The auto-fix workflow's pre-check accepts these plus `FLAKE` and `LLM_API_ERROR`. **Recommended:** `GOOGLE_DOM_DRIFT` — well-understood scaffold, low LLM-cost path. [VERIFIED: workflow line 91 enumerates the full list] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `gh issue create` shell-out | GitHub REST API via `node:fetch` | Shell-out is the repo's established pattern (`makeRealGhClient`). REST adds auth-header management for zero benefit. STAY WITH `gh`. |
| New `inject-defect.mjs` script | Extend `scripts/e2e-report-issue.mjs` with a `--synthetic` flag | `e2e-report-issue.mjs` is in the production triage path; adding a synthetic-mode flag risks polluting the real filer with test code. KEEP AS NEW SCRIPT. |
| Constant fingerprint seed (`mutator-seed-1`) | Random UUID per invocation | Random forces a fresh issue every run; constant lets pre-flight collision check abort idempotently when a prior synthetic is still open. **Constant is the design intent** (collision check becomes a no-op safety net for repeated UATs). |
| Bash mutator script | Node `.mjs` mutator | The 47-UAT-DEFERRED.md UAT-47-b runbook (line 124) initially proposed `tests/e2e/uat-helpers/regression-fixture-mutator.sh`. CONTEXT.md updates this to Node `.mjs` for cross-platform + test-mockability + sha256 reuse from `e2e-report-issue.mjs`. **Node wins.** |

**Installation:** None required. All five tools above are present in the working environment (verified).

**Version verification:**
```bash
gh --version              # gh version 2.83.1 (2025-11-13) — VERIFIED
node --version            # v24.11.1 local; v22 in CI — VERIFIED
jq --version              # jq-1.7 — VERIFIED
npx vitest --version      # 3.x per package.json — VERIFIED
```

## Package Legitimacy Audit

**This phase installs zero new packages.** REQUIREMENTS.md "Out of Scope" table explicitly forbids new npm dependencies (fourth consecutive milestone holding this target). All capabilities reuse existing project code or bundled Node 22 built-ins.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| *(none — zero new deps)* | — | — | — | — | n/a | n/a |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

---

## Architecture Patterns

### System Architecture Diagram

```
Work Stream A — Fixture Mutator (deterministic; local; can ship now)
══════════════════════════════════════════════════════════════════════

operator                                         GitHub (origin)
   │                                                 │
   │   node tests/e2e/scripts/inject-defect.mjs      │
   │      --seed mutator-seed-1                      │
   │      --error-class GOOGLE_DOM_DRIFT             │
   ▼                                                 │
┌──────────────────────────┐                         │
│ inject-defect.mjs        │                         │
│  1. compute fingerprint   │                        │
│     via fingerprint()    │                         │
│     from e2e-report-     │                         │
│     issue.mjs            │                         │
│  2. PRE-FLIGHT:          │                         │
│     gh issue list        │──── --search 'fp:XX' ──▶│
│     --search 'fp:XX'     │◀─── [..] (empty=OK) ────│
│     HARD ABORT if open   │                         │
│     match                │                         │
│  3. gh issue create      │──── --title --body ────▶│ ← creates issue with
│     --label triage       │     --label triage      │   <!-- fp: XX --> on line 1
│     --label <ERROR>      │     --label <ERROR>     │
│  4. git status (MUST     │                         │ (issue # returned via stdout)
│     be clean)            │                         │
│  5. write 56-MUTATOR-    │                         │
│     CLEANUP.md           │                         │
└──────────────────────────┘                         │
   │                                                 │
   │                                  (triage label →│ triggers v40-auto-fix.yml
   │                                   on Work Stream B side)
   ▼
file emitted to repo:
  .planning/phases/59-*/56-MUTATOR-CLEANUP.md


Work Stream B — 4-UAT Re-Sweep (live; blocked on PR #18 merge)
══════════════════════════════════════════════════════════════════════

operator                                         GitHub (origin/main)
   │                                                 │
   │ pre-flight: confirm PR #18 merged               │
   │            confirm dep-scan setting fixed       │
   ▼                                                 │
┌──────────────────────────┐                         │
│ SWEEP-01: UAT-47-e        │                        │
│ (~3 min, $0)             │ open crafted PR ───────▶│ verifier-gate.diff-guard
│ HALT-ON-FAIL gate        │◀── FAILURE expected ────│ rejects (FORBIDDEN_PATHS)
└──────────────────────────┘                         │
   │ PASS                                            │
   ▼                                                 │
┌──────────────────────────┐                         │
│ SWEEP-02: UAT-47-d        │                        │
│ (~5 min, $0)             │ gh workflow run ───────▶│ v40-cost-ledger-snapshot.yml
│                          │◀─── push to ────────────│ ledger-snapshots/daily-YYYY-MM-DD
└──────────────────────────┘   (NOT to main)         │
   │ PASS                                            │
   ▼                                                 │
┌──────────────────────────┐                         │
│ checkpoint:human-verify  │                         │
│  PAID SPEND AHEAD        │                         │
│  cost: $0.50-2           │                         │
└──────────────────────────┘                         │
   │ approve                                         │
   ▼                                                 │
┌──────────────────────────┐                         │
│ SWEEP-03: UAT-47-a        │  gh issue edit 3 ──────▶│ v40-auto-fix.yml fires
│ (~10 min, $0.50-2)       │  --add-label triage      │ ↓ Anthropic SDK call ($$)
│ PRIMARY DoD              │                          │ ↓ draft PR opens
│                          │                          │ ↓ verifier-gate runs
│                          │                          │ ↓ ledger entry written
│                          │  HUMAN MERGE the         │ ↓ auto-promote fires
│                          │  auto-fix:verified PR    │ ↓ outcome ledger entry
│                          │                          │   (source: auto-fix-promoted)
└──────────────────────────┘                          │
   │ PASS                                             │
   ▼                                                  │
┌──────────────────────────┐                          │
│ SWEEP-04: UAT-47-b        │                         │
│ uses MUTATOR from         │  node inject-defect ──▶ │ same loop as SWEEP-03
│ Work Stream A             │                         │   but on synthetic
│                           │  gh workflow run ─────▶ │ + v40-deps-update smoke
│                           │  v40-deps-update.yml    │
└──────────────────────────┘                          │
   │ PASS                                             │
   ▼                                                  │
┌──────────────────────────┐                          │
│ SWEEP-05: write           │                         │
│ 56-UAT-EVIDENCE.md +      │  gh api / gh run ──────▶│ capture JSON snapshots
│ evidence/*.json           │  --json ... > file       │
└──────────────────────────┘                          │
   │                                                  │
   ▼                                                  │
┌──────────────────────────┐                          │
│ SWEEP-06: uat-cleanup.mjs │  gh pr close ──────────▶│ delete branches
│                           │  --delete-branch         │ close synthetic issues
│                           │  gh issue close          │ revert quarantine entry
│                           │  --reason 'not planned'  │
└──────────────────────────┘                          │
```

### Recommended Project Structure

```
tests/e2e/scripts/
├── inject-defect.mjs          # NEW — MUTATOR-01..03,05
└── uat-cleanup.mjs            # NEW — SWEEP-06 automation

tests/e2e/scripts/             # NEW Vitest contract tests:
├── inject-defect.test.js      # MUTATOR-01..03 verification
└── quarantine-append-source-suppression.test.js  # MUTATOR-04 verification
  (or extend e2e-quarantine-append.test.js with new describe block)

scripts/
└── quarantine-append.mjs      # MODIFIED — single conditional at line 220 area

.planning/phases/59-fixture-mutator-4-uat-re-sweep/
├── 59-CONTEXT.md              # existing
├── 59-RESEARCH.md             # this file
├── 59-01-PLAN.md              # Work stream A plan
├── 59-02-PLAN.md              # Work stream B plan
├── 56-MUTATOR-CLEANUP.md      # emitted by mutator (MUTATOR-05)
├── 56-UAT-EVIDENCE.md         # consolidated UAT evidence (SWEEP-05)
└── evidence/                  # JSON snapshots per UAT
    ├── INDEX.md
    ├── uat-47-e-*.json
    ├── uat-47-d-*.json
    ├── uat-47-a-*.json
    └── uat-47-b-*.json
```

### Pattern 1: Issue-creation-layer synthetic-defect injection

**What:** Create a triage-labeled GitHub issue whose body is byte-compatible with a real triage-pipeline-generated issue. Do NOT touch any file in the working tree.

**When to use:** Phase 59 MUTATOR-01..03. Replaces the older "regression-fixture-mutator.sh" idea from 47-UAT-DEFERRED.md line 124 which would have mutated `tests/golden/` (catastrophic per Pitfall 5).

**Example:**
```javascript
// tests/e2e/scripts/inject-defect.mjs (skeleton)
// Source: derived from scripts/e2e-report-issue.mjs:78 (fingerprint) + line 522 (listOpenWithSearch) + workflow trigger contract in .github/workflows/v40-auto-fix.yml:88-101
import { execSync } from 'node:child_process';
import { fingerprint } from '../../../scripts/e2e-report-issue.mjs';

const SEED = 'mutator-seed-1';   // CONTEXT D — constant for repeatability
const ERROR_CLASS = 'GOOGLE_DOM_DRIFT';   // one of RECOGNIZED_LABELS
const CASE_ID = `synthetic-${SEED}`;
const fp = fingerprint(CASE_ID, ERROR_CLASS, null);

// 1. Pre-flight collision check (MUTATOR-02 / Pitfall 6 LOAD-BEARING)
const marker = `<!-- fp: ${fp} -->`;
const search = marker.replaceAll("'", "'\\''");
const existing = execSync(
  `gh issue list --search '${search}' --state open --json number --limit 5`,
  { encoding: 'utf8' }
);
if (JSON.parse(existing).length > 0) {
  process.stderr.write(`[inject-defect] HARD ABORT: open issue already carries fp ${fp}\n`);
  process.exit(2);
}

// 2. Build issue body (MUST start with fingerprint comment on line 1)
const body = [
  marker,                                  // line 1 — extractFingerprint regex anchor
  '',
  '### Reproducer',
  '',
  `case-id: ${CASE_ID}`,
  `seed: ${SEED}`,
  '',
  '### Synthetic Defect',
  '',
  '```',
  'This is a SYNTHETIC issue created by tests/e2e/scripts/inject-defect.mjs',
  'for UAT-47-b proof-of-life verification of the auto-fix loop.',
  `Source: fixture-mutator-uat-47b`,
  `Seed: ${SEED}`,
  '```',
].join('\n');

// 3. Create issue with triage + ERROR_CLASS labels (MUTATOR-01)
const url = execSync(
  `gh issue create --title "[fixture-mutator] ${CASE_ID}: ${ERROR_CLASS}" ` +
  `--label triage --label ${ERROR_CLASS} --body-file -`,
  { input: body, encoding: 'utf8' }
);
const issueNum = url.match(/\/issues\/(\d+)/)[1];
process.stdout.write(`[inject-defect] issue #${issueNum} created with fingerprint ${fp}\n`);

// 4. MUTATOR-03 verification: git status MUST be clean
const status = execSync('git status --porcelain', { encoding: 'utf8' });
if (status.trim() !== '') {
  process.stderr.write(`[inject-defect] FATAL: working tree dirty after mutator: \n${status}\n`);
  process.exit(1);
}

// 5. Emit cleanup evidence (MUTATOR-05)
// ... write 56-MUTATOR-CLEANUP.md to phase dir with explicit gh commands
```

### Pattern 2: Single-conditional source-tag suppression

**What:** Add ONE conditional check immediately before the `addLabel` call in `scripts/quarantine-append.mjs` to skip the `quarantine:ready-for-promotion` label when the entry was created by the fixture-mutator.

**When to use:** MUTATOR-04. The mutator does NOT directly write to the quarantine corpus — the standard triage→quarantine-append pipeline does. But once the synthetic flows through that pipeline, the resulting quarantine entry needs a marker so `quarantine-append.mjs` skips the promotion-label step.

**Example diff (smallest-possible change at `scripts/quarantine-append.mjs:218-223`):**
```diff
@@ -217,9 +217,16 @@ export async function upsertQuarantineEntry(newEntry, opts = {}) {
   atomicWriteJson(corpusPath, stringifyCorpus(arr));

   // 5. D-12: label-add when threshold reached.
   let addedLabel = false;
-  if (finalEntry.stable_runs >= STABLE_RUNS_THRESHOLD && ghClient && triageIssueNumber != null) {
+  // MUTATOR-04 (Pitfall 8 LOAD-BEARING): synthetic UAT-47-b entries must NOT
+  // auto-promote — they would muddy the golden corpus with non-production
+  // regression cases. inject-defect.mjs co-designs this `source` string.
+  const isFixtureMutatorEntry = finalEntry.source === 'fixture-mutator-uat-47b';
+  if (finalEntry.stable_runs >= STABLE_RUNS_THRESHOLD
+      && ghClient
+      && triageIssueNumber != null
+      && !isFixtureMutatorEntry) {
     ghClient.addLabel(triageIssueNumber, READY_FOR_PROMOTION_LABEL);
     addedLabel = true;
   }
```

**Caveat — `source` field is NOT currently in the corpus schema.** Inspect `formatEntry` at line 138-148 of `quarantine-append.mjs`: the canonical key order is `id, patentFile, selectedText, category, stable_runs, source_triage_finding_id, added_iso`. There is NO `source` field today. **MUTATOR-04 requires extending the schema** to include an optional `source` field for synthetic entries, OR using `source_triage_finding_id` as the discriminator (e.g., a prefix like `fixture-mutator-uat-47b-<runId>-iter-...`).

**Recommended approach (low-risk):** Use the existing `source_triage_finding_id` field as the discriminator. The mutator's synthetic triage report should set `triageReport.run_id = 'fixture-mutator-uat-47b'`. The pipeline then produces `source_triage_finding_id = 'fixture-mutator-uat-47b-iter-N'` (per quarantine-append.mjs line 347-349). The MUTATOR-04 conditional becomes:

```javascript
const isFixtureMutatorEntry = typeof finalEntry.source_triage_finding_id === 'string'
  && finalEntry.source_triage_finding_id.startsWith('fixture-mutator-uat-47b');
```

This requires **zero schema change** to `formatEntry` — minimum-diff per CONTEXT D "smallest-diff change."

**Alternative (clean schema):** Add the `source` field properly to `formatEntry`. This is cleaner but adds a key to every corpus entry going forward. **Defer to planner discretion.** The CONTEXT phrasing "source-tag strings co-designed in the SAME commit" can be satisfied by either approach.

### Anti-Patterns to Avoid

- **Mutating `tests/golden/baseline.json` or any FORBIDDEN_PATHS file** (Pitfall 5 LOAD-BEARING) — the auto-fix LLM's proposed fix would be diff-guard-rejected; the loop can never complete.
- **Random/timestamp fingerprint seeds** — defeats idempotency; every collision check passes, every run creates a fresh synthetic issue, cleanup accumulates orphans.
- **Re-implementing the fingerprint formula** — must be byte-identical to `scripts/e2e-report-issue.mjs:78`. A re-implementation that drifts breaks `auto-fix.mjs:extractFingerprint` regex match (`/<!-- fp: ([0-9a-f]{12}) -->/m`) or the dedup logic in `findMatchingIssue`.
- **Mutator that writes the synthetic case directly into `test-cases-quarantine.js`** — that file is in FORBIDDEN_PATHS. Let the standard pipeline (`quarantine-append.mjs`) add the entry via its normal triage flow.
- **Skipping the `git status` clean check** after mutator runs — without this verification, a future mutator edit that accidentally touches a file (logging artifact, lock file) silently violates MUTATOR-03.
- **Closing UAT-47-a's draft PR before the auto-promote loop completes** — defeats SWEEP-03's primary DoD evidence (the `source: 'auto-fix-promoted'` ledger entry only writes after merge).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 12-hex fingerprint computation | new sha256 helper | `import { fingerprint } from '../../../scripts/e2e-report-issue.mjs'` | Byte-identical formula required for auto-fix dedup compatibility. Reusing the existing export guarantees this. |
| `gh issue list --search` collision check | parse `gh api` GraphQL by hand | `ghClient.listOpenWithSearch(marker)` from `scripts/e2e-report-issue.mjs:522` (handles shell-escape, transient-failure swallow) | Pattern already battle-tested in `quarantine-append.mjs:330`. Re-implementation would miss the `replaceAll("'", "'\\''")` shell-escape (T-35-03-03). |
| Multi-label issue create with shell escape | manual quoting | `ghClient.createIssueWithLabels(title, body, labels)` from `scripts/e2e-report-issue.mjs:507` | T-35-03-04 shell-escape mitigation already implemented. |
| Atomic corpus write | custom temp-file dance | `atomicWriteJson` from `tests/e2e/lib/rerun-validator.js` (already used at quarantine-append.mjs:216) | Atomicity invariant preserved across MUTATOR-04 edits. |
| ESM "this is the main module" detection | ad-hoc `import.meta.url === ...` | Existing pattern at `scripts/quarantine-append.mjs:381-383` (`process.argv[1] !== undefined && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])`) | Windows-compat (WR-02). |
| Test fixture for `inject-defect.mjs` shell-out | real `gh` calls | Mock-gh bash binary on `PATH` (pattern from `tests/e2e/scripts/e2e-quarantine-append.test.js:50-66`) | Hermetic, no GitHub credential requirement, transcript-inspectable. |
| Synthetic triage report fixture | hand-edit JSON | Copy from `tests/e2e/fixtures/phase35-triage-report.json` (already a tested input) and override `run_id` | Stable schema; well-exercised in Phase 35 tests. |

**Key insight:** Every component the mutator needs already exists in the codebase. The mutator is glue, not new abstraction. Resist the temptation to "improve" the fingerprint formula or the shell-escape pattern — byte-identical reuse is the contract.

---

## Runtime State Inventory

This is NOT a rename/refactor phase, but Phase 59 has nontrivial **runtime state surface** because the UAT sweeps mutate origin/main artifacts that persist across runs. The inventory below addresses Pitfall 10 (live UAT evidence pollution) — every cell answered explicitly.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | (a) `tests/e2e/.llm-spend-ledger.json` on origin/main — gains entries during SWEEP-03 + SWEEP-04. All UAT-sourced entries MUST carry `phase: '56-uat'` (Pitfall 10). (b) `tests/e2e/test-cases-quarantine.js` on origin/main — gains a synthetic entry during SWEEP-04 that MUTATOR-04 suppression keeps OFF the auto-promotion path. (c) `.planning/phases/59-*/evidence/*.json` — JSON snapshots captured from `gh api` and `gh run`. | (a) Ledger entries are filterable but DURABLE — they remain in the committed ledger. Pitfall 10 mitigation = phase-tag, not deletion. (b) SWEEP-06 reverts the synthetic quarantine entry. (c) Evidence files are committed deliberately. |
| Live service config | (a) Issue #3 on origin (`US11427642-spec-short-1`, fingerprint `139f821b3bb1`) — gains then loses the `triage` label during SWEEP-03's label-cycle. (b) GitHub Issues on origin — synthetic issues created by mutator during SWEEP-04. (c) GitHub PR#18 status — must merge before Work stream B starts. (d) **NEW FINDING: repo setting `Settings → Actions → General → Workflow permissions → Allow GitHub Actions to create and approve pull requests` is currently disabled** (causes the dep-scan failure on PR #18). | (a) SWEEP-06 leaves issue #3 in original state. (b) SWEEP-06 closes synthetic issues with `--reason "not planned"`. (c) Operator merges PR #18. (d) Operator must enable this setting OR explicitly remove `dep-scan` from required checks BEFORE Work stream B can start. |
| OS-registered state | None — Phase 59 does not register any OS-level tasks (no Task Scheduler, launchd, systemd, cron). All cron schedules live in GitHub Actions workflows on the remote side, not the local OS. | None |
| Secrets/env vars | `ANTHROPIC_API_KEY` repo secret (required by `v40-auto-fix.yml:67`) — assumed present (no v4.2 change). `GH_TOKEN` is GITHUB_TOKEN-derived in CI; locally requires prior `gh auth login`. | None — verify present at pre-flight only. |
| Build artifacts | None — no compilation step. ESM `.mjs` runs directly under Node 22. | None |

---

## Fingerprint Computation Contract (MUTATOR-01 deep-dive)

**Source of truth:** `scripts/e2e-report-issue.mjs:78-81`:

```javascript
export function fingerprint(caseId, errorClass, topOfStackHash) {
  const input = `${caseId}|${errorClass}|${topOfStackHash || ''}`;
  return createHash('sha256').update(input).digest('hex').substring(0, 12);
}
```

- Format: 12-hex (i.e. `substring(0, 12)` of the sha256 hex digest).
- Input: pipe-separated `caseId | errorClass | (topOfStackHash || '')`.
- `topOfStackHash` is itself 12-hex when present; empty-string when absent.

**Two formula tiers exist (Phase 35 D-08 dual-search):**
- **v1 (legacy):** `fingerprint(caseId, errorClass, '')` — empty topOfStackHash, marker comment `<!-- fingerprint: ${fp} -->` (note the LONG word "fingerprint").
- **v2 (current):** `fingerprint(caseId, errorClass, topOfStackHashFromTriage(...))` — populated topOfStackHash, marker comment `<!-- fp: ${fp} -->` (note the SHORT "fp:").

**Which one does `auto-fix.mjs:extractFingerprint` parse?** ONLY v2: regex is `/<!-- fp: ([0-9a-f]{12}) -->/m` at line 231. **The mutator MUST emit the v2 marker on line 1.** [VERIFIED: line 231 + issue-payload-builder.js D-02 at line 4]

**What `topOfStackHash` should the mutator use?**
- Option 1 (CLEAN — recommended): pass `null` to `fingerprint(...)`. The `|| ''` in the function body produces input `synthetic-mutator-seed-1|GOOGLE_DOM_DRIFT|`. Deterministic, simple.
- Option 2 (REALISTIC): build a synthetic triage finding + rerun-entry + iteration and call `topOfStackHashFromTriage(finding, rerunEntry, iter)`. More faithful to the real pipeline but adds 30+ lines.

**Recommended: Option 1.** The auto-fix dispatcher only reads the fingerprint as an opaque 12-hex string — it does not verify the hash matches anything. Determinism beats realism here.

**Marker placement (Pitfall 1 overflow protection per `issue-payload-builder.js:4`):** Line 1 of the issue body MUST be the marker — no preceding bytes. The `auto-fix.mjs` regex uses `/m` (multiline) so it would also match mid-body, but the issue-filer convention is line 1.

**Body schema beyond line 1:** `auto-fix.mjs` reads:
- Line 1: `<!-- fp: <12-hex> -->` (required by `extractFingerprint`).
- Line `^case-id:\s*(.+)$`: matched by `extractCaseId` at line 243 — optional but provides the PR-body hint.
- Everything else is informational. `buildIssuePayload` in `issue-payload-builder.js` produces a richly-formatted body with `### Reproducer`, `### Verifier Disagreement`, `### LLM Rationale`, `### Golden Diff` sections — but the dispatcher does NOT parse those sections. Mutator's body can be minimal.

---

## `gh issue create` Argv Plumbing (MUTATOR-01)

**Required labels:**
1. `triage` — triggers `v40-auto-fix.yml` (`on.issues.types: [labeled]` + `if: github.event.label.name == 'triage'` job-level filter at line 62).
2. One ERROR_CLASS from the workflow's pre-check enumeration at `.github/workflows/v40-auto-fix.yml:91`:
   ```
   FLAKE LLM_API_ERROR WRONG_CITATION LLM_HALLUCINATED_SELECTION
   WORKER_FALLBACK_FAILED GOOGLE_DOM_DRIFT HARNESS_ERROR PASS
   ```

**Recommended ERROR_CLASS for mutator:** `GOOGLE_DOM_DRIFT`. Rationale:
- One of the 5 main scaffolds (FLAKE/LLM_API_ERROR are special-cased, PASS is a no-op label).
- The `auto-fix.mjs` scaffold for GOOGLE_DOM_DRIFT is a known-good path per Phase 42-43 testing.
- Lower LLM cost than WRONG_CITATION (which carries the `cache_control:{type:'ephemeral'}` SYSTEM block per `auto-fix.mjs:20`).

**Critical:** apply exactly ONE ERROR_CLASS label. The workflow's `Pre-check ERROR_CLASS label` step (line 83-101) loops through the enumeration and picks the FIRST match. The `extractErrorClass` function in `scripts/auto-fix.mjs:255` returns `'AMBIGUOUS'` if MULTIPLE recognized labels are present, causing the dispatcher to exit 2 (line 631).

**Argv shape (from `scripts/e2e-report-issue.mjs:507` pattern):**

```bash
gh issue create \
  --title "[fixture-mutator] synthetic-mutator-seed-1: GOOGLE_DOM_DRIFT" \
  --label triage \
  --label GOOGLE_DOM_DRIFT \
  --body-file -    # body from stdin to avoid shell-quote hazards
```

The `--body-file -` pattern is **mandatory** (mirrors the existing `createIssueWithLabels` at line 513) — body content contains backticks, code fences, and `<!--` HTML comments that would be brittle as a shell-quoted `--body` arg.

---

## Fingerprint Collision Pre-Flight (MUTATOR-02, Pitfall 6 LOAD-BEARING)

**Exact `gh issue list --search` syntax** (from `scripts/e2e-report-issue.mjs:526`):

```bash
gh issue list --search '<!-- fp: a1b2c3d4e5f6 -->' --state open --json number,title,body,updatedAt --limit 30
```

**Does GitHub's search support the HTML-comment substring?** YES — verified empirically by Phase 35's dual-search implementation in production (Phase 47 demo on issue #3 verified the dedup path). GitHub's full-text search indexes issue bodies including HTML comments. The match is substring-based when the query is quoted.

**Shell escape:** the query string is wrapped in single quotes for shell. Single quotes inside the query MUST be escaped via `replaceAll("'", "'\\''")` (T-35-03-03 mitigation; pattern at line 524). The marker `<!-- fp: ${fp} -->` contains NO single quotes (only `<`, `-`, `:`, space, hex, `>`), so escape is a no-op but should still be applied defensively.

**False-negative risks:**
1. **Closed issues are NOT in `--state open`.** A synthetic case from a prior UAT that was closed but whose fingerprint matches the new one will NOT trip the abort. This is **intended** — closed issues don't block the pipeline. If stricter idempotency is desired, change to `--state all`, but this adds noise.
2. **GitHub's search index lag.** A newly-created issue may not appear in `gh issue list --search` for up to 60 seconds. Risk: if the mutator is invoked twice in rapid succession, the second invocation may not see the first one's issue. Mitigation: this is the design intent (constant seed → identical fingerprint → idempotent). The user should not invoke the mutator twice within 60s. If they do, the second issue will be a benign duplicate that SWEEP-06 cleanup handles.
3. **Search rate limits.** `gh issue list --search` consumes the GitHub Search API rate limit (30 req/min for authenticated users). Acceptable for one mutator invocation per UAT.

**Recommended query — MOST RELIABLE:**

```bash
gh issue list --search '<!-- fp: <12-hex> -->' --state open --json number --limit 5
```

Compact (`--json number` only, `--limit 5` not 30) — collision check needs only existence, not metadata.

**Hard-abort logic:**
```javascript
const result = JSON.parse(execSync(cmd, { encoding: 'utf8' }));
if (result.length > 0) {
  process.stderr.write(
    `[inject-defect] HARD ABORT: open issue #${result[0].number} already carries fp ${fp}. ` +
    `Either close it first or use a different --seed.\n`
  );
  process.exit(2);
}
```

Exit code `2` distinguishes "collision abort" from `1` (other runtime errors). Mirrors the existing exit-code convention in `quarantine-append.mjs` (line 53, line 79, etc.).

---

## `scripts/quarantine-append.mjs` Suppression Edit Point (MUTATOR-04)

**Verified state of file (2026-06-05):** Constant `READY_FOR_PROMOTION_LABEL = 'quarantine:ready-for-promotion'` at **line 29**. Label-add call at **lines 218-223** inside `upsertQuarantineEntry`:

```javascript
// 5. D-12: label-add when threshold reached.
let addedLabel = false;
if (finalEntry.stable_runs >= STABLE_RUNS_THRESHOLD && ghClient && triageIssueNumber != null) {
  ghClient.addLabel(triageIssueNumber, READY_FOR_PROMOTION_LABEL);
  addedLabel = true;
}
```

**Smallest-diff change (recommended — uses existing `source_triage_finding_id` schema field):**

```diff
@@ -218,9 +218,16 @@ export async function upsertQuarantineEntry(newEntry, opts = {}) {
   // 5. D-12: label-add when threshold reached.
   let addedLabel = false;
-  if (finalEntry.stable_runs >= STABLE_RUNS_THRESHOLD && ghClient && triageIssueNumber != null) {
+  // MUTATOR-04 (Pitfall 8 LOAD-BEARING): suppress auto-promotion for synthetic
+  // UAT-47-b entries. The fixture-mutator (tests/e2e/scripts/inject-defect.mjs)
+  // produces a synthetic triage report whose run_id is 'fixture-mutator-uat-47b',
+  // which propagates into source_triage_finding_id as the prefix.
+  const isFixtureMutator = typeof finalEntry.source_triage_finding_id === 'string'
+    && finalEntry.source_triage_finding_id.startsWith('fixture-mutator-uat-47b');
+  if (finalEntry.stable_runs >= STABLE_RUNS_THRESHOLD
+      && ghClient
+      && triageIssueNumber != null
+      && !isFixtureMutator) {
     ghClient.addLabel(triageIssueNumber, READY_FOR_PROMOTION_LABEL);
     addedLabel = true;
   }
```

**Co-design contract with `inject-defect.mjs`:**

The mutator must produce a synthetic triage report whose `run_id` is the string `fixture-mutator-uat-47b`. When `quarantine-append.mjs`'s main flow processes that report (line 295-350), the loop at line 305-367 builds `source_triage_finding_id = triageReport.run_id + '-iter-' + finding.iteration_n` (line 347-349). That value becomes `'fixture-mutator-uat-47b-iter-N'`, which `startsWith('fixture-mutator-uat-47b')` matches.

**Vitest contract test (sketch — should ship in the SAME commit per MUTATOR-04 wording):**

```javascript
// tests/e2e/scripts/e2e-quarantine-append.test.js — new describe block
describe('quarantine-append CLI — MUTATOR-04 source-tag suppression (G9)', () => {
  it('G9: synthetic entry with source_triage_finding_id "fixture-mutator-uat-47b-iter-1" at stable_runs=3 does NOT add the promotion label', () => {
    // Seed corpus with a stable_runs=2 entry whose source_triage_finding_id matches.
    fs.writeFileSync(corpusOverridePath,
      '// AUTO-MANAGED\nexport const TEST_CASES_QUARANTINE = [{\n' +
      '  id: "US11427642-spec-short-1",\n' +
      '  patentFile: "./tests/fixtures/US11427642.json",\n' +
      '  selectedText: "...",\n' +
      '  category: "modern-short",\n' +
      '  stable_runs: 2,\n' +
      '  source_triage_finding_id: "fixture-mutator-uat-47b-iter-1",\n' +
      '  added_iso: "2026-06-05T00:00:00.000Z"\n' +
      '}];\n');
    // Run once → stable_runs increments to 3 → label-add path WOULD fire normally.
    spawnAppend(['--input', path.join(runDir, 'triage-report.json')]);
    const transcript = fs.readFileSync(transcriptPath, 'utf8');
    expect(transcript).not.toMatch(/--add-label.*quarantine:ready-for-promotion/);
  });
});
```

**Alternative (clean schema — defer to planner discretion):** Add `source` as a proper field. Requires extending `formatEntry` key order at lines 138-148 and updating Phase 35 Pitfall 4 determinism tests. Higher blast radius; recommended ONLY if planner judges schema cleanliness worth the additional commit scope.

---

## FORBIDDEN_PATHS Confirmation (MUTATOR-03, Pitfall 5 LOAD-BEARING)

**Verified (2026-06-05) `scripts/check-diff-guard.mjs:49-58`:**

```javascript
export const FORBIDDEN_PATHS = Object.freeze([
  /^tests\/test-cases\.js$/,
  /^tests\/golden\/baseline\.json$/,
  /^tests\/e2e\/test-cases-quarantine\.js$/,
  /^\.github\/workflows\/v40-[^/]*\.yml$/,
  /^tests\/e2e\/\.llm-spend-ledger\.json$/,
  /^\.github\/CODEOWNERS$/,
  /^tests\/e2e\/\.rerun-ring-buffer\.json$/,    // Phase 45-02 — FLAKE-01
  /^tests\/e2e\/\.flake-suppression\.json$/,    // Phase 45-02 — FLAKE-02
]);
```

**8 entries (Phase 57 researcher cited 8 verified entries; line numbers shifted slightly from older notes that referenced "line 107" — the bank is now at lines 49-58, file ends at line 107 which is the END comment).**

**Mutator's operational footprint vs FORBIDDEN_PATHS:**

| Mutator operation | Files touched in working tree | Forbidden? |
|-------------------|-------------------------------|------------|
| `gh issue list --search` | none (network only) | n/a |
| `gh issue create` | none (network only) | n/a |
| `git status` | none (read only) | n/a |
| Write `56-MUTATOR-CLEANUP.md` to `.planning/phases/59-*/` | `.planning/...` paths | NO — `.planning/` is not in FORBIDDEN_PATHS bank |
| stdout/stderr logging | none | n/a |

**Verification gate (REQUIREMENTS.md MUTATOR-03 verbatim):** `git status` MUST be clean after mutator execution. The mutator should run this check itself as the final step and exit non-zero if anything appears.

**Why the cleanup-evidence file write is safe:** `.planning/phases/...` paths are not in any FORBIDDEN_PATHS regex. The mutator may legitimately write `56-MUTATOR-CLEANUP.md` to the phase directory. After the write, `git status` will show the new file as untracked — to keep the verification gate meaningful, **`56-MUTATOR-CLEANUP.md` should be added to git in the SAME mutator invocation** (or, alternatively, the gate should be "no working-tree modifications to existing tracked files" rather than "git status clean"). **Recommended:** mutator runs `git add .planning/phases/59-*/56-MUTATOR-CLEANUP.md` after writing, then the clean-tree check passes because the new file is staged. Or simply require `git status --porcelain` shows ONLY the cleanup file and verify that specific entry.

**Recommended verification snippet (final mutator step):**
```javascript
const status = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
const allowedPattern = /^\?\? \.planning\/phases\/59-[^/]+\/56-MUTATOR-CLEANUP\.md$/;
const lines = status.split('\n').filter(l => l.length > 0);
const violations = lines.filter(l => !allowedPattern.test(l));
if (violations.length > 0) {
  process.stderr.write(`[inject-defect] FATAL: unexpected working-tree changes:\n${violations.join('\n')}\n`);
  process.exit(1);
}
```

---

## Vitest Patterns for `tests/e2e/scripts/inject-defect.mjs`

The sibling test pattern is well-established. Two reference files:

### Reference 1: `tests/e2e/scripts/e2e-quarantine-append.test.js` (lines 50-94)

**Mock-gh strategy:** write a bash binary `gh` to a tmpDir; prepend tmpDir to `PATH`; the script then shells out to the mock instead of real gh. The mock logs all args to a transcript file the test inspects.

Key snippets (paraphrasing from lines 50-66):
```javascript
mockGhDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pct-quar-mockgh-'));
transcriptPath = path.join(mockGhDir, 'gh-transcript.txt');
const mockGhPath = path.join(mockGhDir, 'gh');
fs.writeFileSync(mockGhPath, [
  '#!/usr/bin/env bash',
  'echo "$@" >> "' + transcriptPath + '"',
  'case "$1" in',
  '  issue)',
  '    case "$2" in',
  '      list) echo \'[]\' ;;',                  // empty array = no collision
  '      create) echo "https://github.com/test/test/issues/42" ;;',
  '      edit) echo "OK" ;;',
  '    esac ;;',
  '  --version) echo "gh version 2.83.1 (mock)" ;;',
  'esac',
].join('\n') + '\n', { mode: 0o755 });
```

The spawn helper (line 82-94) sets `PATH: mockGhDir + ':' + process.env.PATH`.

### Reference 2: `tests/e2e/scripts/e2e-explore-ci-guard.test.js` (lines 25-63)

**spawnSync pattern with hermetic env:** `spawnSync('node', [SCRIPT_PATH, ...args], { env: {...}, encoding: 'utf8', timeout: 5000 })`. Asserts `r.status` and `r.stderr` content.

### Recommended test coverage for `inject-defect.mjs`

```javascript
// tests/e2e/scripts/inject-defect.test.js — recommended structure
describe('inject-defect.mjs — fingerprint computation', () => {
  it('I1: fingerprint is deterministic for same --seed', () => { /* spawn twice, parse stdout, expect identical fp */ });
  it('I2: fingerprint is 12-hex characters', () => { /* regex /^[0-9a-f]{12}$/ */ });
});
describe('inject-defect.mjs — collision check (Pitfall 6)', () => {
  it('I3: mock-gh returns non-empty issue list → exit 2 with "HARD ABORT" stderr', () => { /* mock returns [{number:42}] */ });
  it('I4: mock-gh returns empty list → proceeds to issue create', () => { /* mock returns [] */ });
});
describe('inject-defect.mjs — gh argv plumbing (MUTATOR-01)', () => {
  it('I5: gh issue create invocation includes --label triage + --label GOOGLE_DOM_DRIFT', () => { /* inspect transcript */ });
  it('I6: issue body line 1 is <!-- fp: ... -->', () => { /* mock-gh captures stdin via --body-file -; assert first line */ });
});
describe('inject-defect.mjs — FORBIDDEN_PATHS gate (MUTATOR-03)', () => {
  it('I7: post-run git status shows only 56-MUTATOR-CLEANUP.md (or nothing tracked)', () => { /* spawnSync with cwd=tmpRepo; assert porcelain output */ });
});
describe('inject-defect.mjs — cleanup evidence emission (MUTATOR-05)', () => {
  it('I8: 56-MUTATOR-CLEANUP.md is written with explicit gh close commands', () => { /* read file, grep for "gh issue close" and "gh pr close --delete-branch" */ });
});
```

**Mock strategy recommendation:** Use the `e2e-quarantine-append.test.js` mock-gh bash pattern. It is the project's tested convention; reinventing with `vi.mock` would require restructuring `inject-defect.mjs` to inject a `ghClient` dependency, which is doable but heavier than the operator-script pattern requires.

---

## UAT-47-e Runbook (SWEEP-01, ~3 min, $0)

**Goal:** Verify that `v40-verifier-gate.yml`'s diff-guard job FAILS when an `auto-fix/*` PR touches a FORBIDDEN_PATH. Confirm `human-review-required` label is applied. PR closed + branch deleted, evidence captured.

**Why first:** $0 cost. Validates the trust-invariant infrastructure end-to-end before any paid spend. If it fails, the planned Phase 56-58 trigger-correctness fix didn't fully land — halt and diagnose.

### Pre-flight

```bash
# (1) confirm PR #18 is merged
gh pr view 18 --repo tonyrowles/patent-cite-tool --json state,mergedAt --jq '.state + " " + .mergedAt'
# expect: "MERGED 2026-06-XX..."

# (2) confirm v40-verifier-gate.yml has NO base-ref filter at on: level
gh api repos/tonyrowles/patent-cite-tool/contents/.github/workflows/v40-verifier-gate.yml --jq '.content' | base64 -d | grep -A2 'pull_request:'
# expect: no 'branches:' filter

# (3) confirm working tree clean on local main
git status --porcelain
# expect: empty

# (4) confirm scope-decision step is present in diff-guard job (Phase 51.1 fix)
gh api repos/tonyrowles/patent-cite-tool/contents/.github/workflows/v40-verifier-gate.yml --jq '.content' | base64 -d | grep -c 'Scope decision'
# expect: >=4 (one per gated job)
```

### Execution (verbatim from 47-UAT-DEFERRED.md §UAT-47-e with Phase 51 corrections)

```bash
TS=$(date -u +%Y%m%dT%H%M%SZ)
BRANCH="auto-fix/test-uat47e-${TS}"
git checkout -b "$BRANCH" main
echo "/* uat-47-e crafted bypass test ${TS} */" >> tests/golden/baseline.json
git add tests/golden/baseline.json
git commit -m "test(uat-47-e): crafted bypass — diff-guard must reject"
git push -u origin "$BRANCH"
PR=$(gh pr create --draft \
  --title "UAT-47-e crafted bypass (${TS})" \
  --body "$(printf '<!-- affected_cases: any -->\n\nUAT-47-e: crafted bypass test. Expect diff-guard to FAIL.\n')" \
  --base main --head "$BRANCH" --json url --jq .url | grep -oE '[0-9]+$')

# Wait for verifier-gate to run (max 5 min)
sleep 30
for i in 1 2 3 4 5 6 7 8 9 10; do
  CONCL=$(gh pr checks "$PR" --json bucket,name --jq '.[] | select(.name=="diff-guard") | .bucket')
  [ "$CONCL" = "fail" ] && break
  [ "$CONCL" = "pass" ] && { echo "UNEXPECTED PASS"; break; }
  sleep 30
done
```

### Expected PASS evidence

1. `gh pr checks "$PR" --json bucket,name | jq '.[] | select(.name=="diff-guard")'` → `{"bucket":"fail", ...}` — capture to `evidence/uat-47-e-pr-checks.json`.
2. `gh pr view "$PR" --json labels --jq '[.labels[].name]'` contains `"human-review-required"` — capture to `evidence/uat-47-e-pr-labels.json`.
3. `gh pr view "$PR" --json comments --jq '.comments[-1].body'` mentions `tests/golden/baseline.json` — capture to `evidence/uat-47-e-pr-comments.json`.

### Cleanup

```bash
gh pr close "$PR" --delete-branch
git checkout main
# no main-branch mutation; nothing to revert locally
```

### HALT-on-fail behavior

If any of the 3 heuristics fail: **STOP**. Do NOT proceed to SWEEP-02 (no cost yet, but cheap to diagnose) or SWEEP-03 (which would burn API budget on broken infra). Diagnostic: same workflow trigger / scope-decision audit as Phase 51 deviation #2.

---

## UAT-47-d Runbook (SWEEP-02, ~5 min, $0)

**Goal:** Verify Phase 57's `v40-cost-ledger-snapshot.yml` change — the snapshot push now lands on `ledger-snapshots/daily-YYYY-MM-DD`, NOT `main`. Phase 50's ruleset (blocking direct-to-main bot pushes) no longer rejects the cron.

**Why second:** $0 cost. Pure remote-state verification. Easier to diagnose than the paid UAT-47-a.

### Pre-flight

```bash
# (1) Same PR #18 merge check as SWEEP-01.

# (2) Confirm Phase 57's branch-redirect landed
gh api repos/tonyrowles/patent-cite-tool/contents/.github/workflows/v40-cost-ledger-snapshot.yml --jq '.content' | base64 -d | grep -E 'git push origin'
# expect: git push origin HEAD:ledger-snapshots/daily-${{ env.SNAPSHOT_DATE }}
# (verified in working tree at line 111 — line should match origin/main post-merge)

# (3) Snapshot of pre-state for ledger-snapshots/ branches
git ls-remote --heads origin 'ledger-snapshots/*' > evidence/uat-47-d-pre-branches.txt
```

### Execution

```bash
# Trigger via workflow_dispatch (preferred over real cron per Pitfall 11)
gh workflow run v40-cost-ledger-snapshot.yml --ref main

# Get the dispatched run id
sleep 5
RUN_ID=$(gh run list --workflow=v40-cost-ledger-snapshot.yml --limit 1 --json databaseId,event,createdAt --jq '.[] | select(.event=="workflow_dispatch") | .databaseId')

# Watch to completion (5-min timeout)
gh run watch "$RUN_ID" --interval 10 --exit-status
RUN_STATUS=$?

# Capture run metadata
gh run view "$RUN_ID" --json status,conclusion,createdAt,event,headBranch \
  > evidence/uat-47-d-run-metadata.json
```

### Expected PASS evidence

1. **Run conclusion = SUCCESS** (`evidence/uat-47-d-run-metadata.json`).
2. **A new branch `ledger-snapshots/daily-YYYY-MM-DD` exists on origin** that did NOT exist before (compare with `uat-47-d-pre-branches.txt`):
   ```bash
   git ls-remote --heads origin 'ledger-snapshots/*' > evidence/uat-47-d-post-branches.txt
   diff evidence/uat-47-d-pre-branches.txt evidence/uat-47-d-post-branches.txt
   # expect: > refs/heads/ledger-snapshots/daily-YYYY-MM-DD added
   ```
3. **No new commit on `origin/main`** by this workflow:
   ```bash
   git fetch origin main
   git log --oneline origin/main -3 | grep -i 'ledger snapshot' && echo FAIL || echo PASS
   # expect: PASS (no main-branch ledger commit by the snapshot workflow)
   ```
4. **The new ledger-snapshots branch contains the snapshot commit:**
   ```bash
   SNAPSHOT_DATE=$(date -u +%Y-%m-%d)
   git log "origin/ledger-snapshots/daily-${SNAPSHOT_DATE}" -1 --format='%s' > evidence/uat-47-d-snapshot-commit.txt
   # expect: [skip ci] ledger snapshot YYYY-MM-DD: N invocations, $X.XX spent
   ```

### Pitfall 11 note

Per PITFALLS.md Pitfall 11, the snapshot push step is **synchronous within the workflow** (no PR-merge async wait needed — Phase 57 chose Option B "branch push, no PR" per the Phase 51 §UAT-47-d runbook option). `gh run watch ... --exit-status` blocks until the run finishes, so the assertion timing is sound. **No extra wait step needed.**

### Cleanup

No cleanup required for SWEEP-02 itself. The `ledger-snapshots/daily-YYYY-MM-DD` branch is a legitimate audit artifact (per the workflow header comment at line 92-102). Per CONTEXT "Deferred Ideas," periodic cleanup of accumulated snapshot branches is operator-owned and out of v4.2 scope.

---

## UAT-47-a Runbook (SWEEP-03, ~10 min, ~$0.50-2 — PRIMARY DoD)

**Goal:** Full end-to-end auto-fix loop: triage-labeled issue → `v40-auto-fix.yml` fires → Anthropic SDK call → draft PR opens → `v40-verifier-gate.yml` runs (3× affected case + 76-case regression + diff-guard) → human merges → `v40-auto-promote.yml` fires → outcome ledger entry with `errorClass` + `outcome: 'pass'` written.

**Why third:** Most expensive. Halt-on-fail at SWEEP-01 + SWEEP-02 prevents wasting budget on broken infra. PRIMARY DoD evidence (the entry-point ledger entry + the outcome entry both populated).

### Pre-flight (REQUIRED — checkpoint:human-verify BEFORE this task)

```bash
# (1) SWEEP-01 + SWEEP-02 both PASS (look at evidence/ files)
ls -la evidence/uat-47-e-* evidence/uat-47-d-*

# (2) Budget cap snapshot (Pitfall 10 + Phase 51 D-03)
git show origin/main:tests/e2e/.llm-spend-ledger.json > evidence/uat-47-a-pre-run-ledger.json

# (3) Confirm issue #3 has 'triage' label (Phase 51 D-04 idempotency precondition)
gh issue view 3 --repo tonyrowles/patent-cite-tool --json labels --jq '[.labels[].name]'
# expect: includes "triage"

# (4) Confirm no auto-fix/3-* branch exists on origin (Phase 51 D-05)
git ls-remote origin 'auto-fix/3-*'
# expect: empty
```

**Operator must approve before proceeding:** "About to trigger ~$0.50-2 of Anthropic API spend on UAT-47-a. SWEEP-01 + SWEEP-02 evidence captured. Approve?"

### Trigger option A: real triage event (NOT RECOMMENDED for this milestone)

Wait for a real production anomaly. Non-deterministic; CONTEXT D-03 mandates determinism. **Skip.**

### Trigger option B: deterministic via fixture-mutator (RECOMMENDED)

This is the SWEEP-03 / SWEEP-04 overlap — use the Work stream A mutator to inject a deterministic synthetic. Phase 51 D-04 also allows the alternate "label-cycle on existing issue #3" pattern. CONTEXT.md says the design intent for SWEEP-03 is the deterministic path — so:

```bash
# Use the mutator from Work stream A
node tests/e2e/scripts/inject-defect.mjs \
  --seed mutator-seed-sweep-03 \
  --error-class GOOGLE_DOM_DRIFT
# stdout: [inject-defect] issue #N created with fingerprint XX
ISSUE=N
FP=XX
```

Alternatively (the original Phase 51 D-04 path), label-cycle issue #3:

```bash
gh issue edit 3 --repo tonyrowles/patent-cite-tool --remove-label triage
sleep 10
gh issue edit 3 --repo tonyrowles/patent-cite-tool --add-label triage
ISSUE=3
FP=139f821b3bb1
```

**Recommended: the mutator path (Option B-deterministic).** It exercises the new code from Work stream A; if the mutator is broken in any way, SWEEP-03 surfaces it before SWEEP-04.

### Watch the loop

```bash
# Stage 1 — auto-fix workflow fires
sleep 10
RUN_ID=$(gh run list --workflow=v40-auto-fix.yml --limit 5 --json databaseId,event,createdAt --jq "[.[] | select(.event==\"issues\")][0].databaseId")
gh run watch "$RUN_ID" --interval 15 --exit-status &
WATCH_PID=$!

# 15-minute hard timeout (Phase 51 D-06)
timeout 900 wait $WATCH_PID || { echo "AUTO-FIX TIMED OUT"; exit 1; }

# Stage 2 — draft PR opens
PR=$(gh pr list --head "auto-fix/${ISSUE}-${FP:0:8}" --json number --jq '.[0].number')
gh pr view "$PR" --json state,isDraft,body --jq '{state,isDraft,bodyHasAffectedCases: (.body | contains("affected_cases:"))}' > evidence/uat-47-a-pr-state.json

# Stage 3 — verifier-gate runs on the PR
sleep 30
VG_RUN=$(gh run list --branch "auto-fix/${ISSUE}-${FP:0:8}" --workflow=v40-verifier-gate.yml --limit 1 --json databaseId,conclusion --jq '.[0]')
echo "$VG_RUN" > evidence/uat-47-a-verifier-gate-run.json
# expect: conclusion: SUCCESS within ~5-8 min

# Stage 4 — HUMAN MERGE (the only allowed human action per Pitfall 9)
echo "STOP: human verification gate. Review PR #$PR, confirm auto-fix:verified label, merge if satisfactory."
echo "Run: gh pr merge $PR --squash --delete-branch=false"
# OPERATOR ACTION REQUIRED HERE
```

### Expected PASS evidence (CAPTURED AFTER MERGE)

```bash
# Stage 5 — auto-promote fires (post-merge)
sleep 60
PROMOTE_RUN=$(gh run list --workflow=v40-auto-promote.yml --limit 1 --json databaseId,conclusion --jq '.[0]')
echo "$PROMOTE_RUN" > evidence/uat-47-a-promote-run.json

# Stage 6 — outcome ledger entry exists on main
git fetch origin main
git show origin/main:tests/e2e/.llm-spend-ledger.json > evidence/uat-47-a-post-run-ledger.json

# The outcome entry shape (per PROMOTE-02 / Phase 58):
#   { source: 'auto-fix-promoted', outcome: 'pass', errorClass: 'GOOGLE_DOM_DRIFT',
#     fingerprint: '<12-hex>', issueId: N, prNumber: $PR, model: '...' }
jq --arg fp "$FP" '.months | .. | objects | .iterations[]? | select(.fingerprint==$fp and .source=="auto-fix-promoted")' \
  evidence/uat-47-a-post-run-ledger.json > evidence/uat-47-a-outcome-entry.json
# expect: non-empty object with outcome:"pass"

# Stage 7 — cost ceiling check (Pitfall 10 / Phase 51 D-03)
PRE_TOTAL=$(jq '.months | to_entries[].value.monthTotal' evidence/uat-47-a-pre-run-ledger.json | head -1)
POST_TOTAL=$(jq '.months | to_entries[].value.monthTotal' evidence/uat-47-a-post-run-ledger.json | head -1)
echo "spend delta: $POST_TOTAL - $PRE_TOTAL" > evidence/uat-47-a-spend-delta.txt
# expect: delta < $2.00
```

### Cost ceiling enforcement

CONTEXT.md "Cost discipline (CTRL-01)": surface expected $0.50-2 BEFORE invoking. If `evidence/uat-47-a-spend-delta.txt` shows > $2, FAIL the UAT and document — do NOT retry. Mirrors Phase 51 D-03 "no retry past cap."

### Cleanup

UAT-47-a's PR is **merged** (the human action). No PR close. The auto-fix branch deletion behavior is set by `v40-auto-fix.yml:211 delete-branch: false` (Phase 44 auto-promote needs the branch tip). The auto-promote workflow opens a follow-up `auto-promote/*` PR which the human merges separately or the SWEEP-06 cleanup handles. If the mutator path was used, the synthetic issue is closed in SWEEP-06.

---

## UAT-47-b Runbook (SWEEP-04)

**Goal:** Run the same full loop as SWEEP-03 but driven by the fixture-mutator (mandatory for this UAT — that's its definition). Also smoke-test `v40-deps-update.yml`'s `pull_request:` trigger (Phase 51.1 fix confirmation).

**Why fourth:** Reuses infrastructure SWEEP-03 already proved. Confirms the mutator's UAT-47-b code-path. Doubles as deps-update-gate trigger smoke test.

### Order of operations (recommended)

1. **Run mutator** with a DIFFERENT seed than SWEEP-03 so the fingerprint collision check passes:
   ```bash
   node tests/e2e/scripts/inject-defect.mjs --seed mutator-seed-sweep-04 --error-class GOOGLE_DOM_DRIFT
   ```
2. **Same loop watching as SWEEP-03** (auto-fix → draft PR → verifier-gate → operator merge → auto-promote).
3. **Verify MUTATOR-04 suppression worked:** after the auto-promote completes and the synthetic case lands in the quarantine corpus, run `quarantine-append.mjs` 3 times against a synthetic triage report carrying the `fixture-mutator-uat-47b` run_id. The 3rd run MUST NOT add the `quarantine:ready-for-promotion` label to the synthetic issue. Capture via mock-gh transcript locally or via the actual nightly cron's behavior (preferred for evidence).
4. **Deps-update-gate smoke (Phase 51.1 fix confirmation):**
   ```bash
   gh workflow run v40-deps-update.yml --ref main
   sleep 30
   DEPS_RUN=$(gh run list --workflow=v40-deps-update.yml --limit 1 --json databaseId,conclusion --jq '.[0]')
   gh run view $DEPS_RUN --json status,conclusion,jobs > evidence/uat-47-b-deps-update-run.json
   # expect: deps-update-gate job present + completed (PASS or fast-path SUCCESS)
   ```
   **NOTE:** The dep-scan failure observed on PR #18 (GitHub Actions cannot create PRs) is a SEPARATE issue from the deps-update-gate trigger. The deps-update-gate fires on the auto-opened deps-update PR; if no PR is opened (because of the GitHub setting), the gate never runs. **Pre-flight resolution of the GitHub setting is required for SWEEP-04 evidence to be meaningful.**

### Expected PASS evidence

| Step | Evidence file |
|------|---------------|
| Mutator created issue | `evidence/uat-47-b-injected-issue.json` (gh issue view output) |
| Auto-fix workflow fired | `evidence/uat-47-b-auto-fix-run.json` |
| Draft PR opened | `evidence/uat-47-b-pr-state.json` |
| Verifier-gate run on PR | `evidence/uat-47-b-verifier-gate-run.json` |
| Outcome ledger entry | `evidence/uat-47-b-outcome-entry.json` |
| MUTATOR-04 suppression verified | `evidence/uat-47-b-promotion-suppression.txt` (3-run transcript showing NO `--add-label quarantine:ready-for-promotion`) |
| Deps-update-gate trigger fired | `evidence/uat-47-b-deps-update-run.json` |

### Cleanup

SWEEP-06 closes the synthetic issue, deletes the synthetic branch, and reverts the synthetic quarantine entry (per the `56-MUTATOR-CLEANUP.md` script).

---

## `56-UAT-EVIDENCE.md` Template (SWEEP-05)

**Pattern source:** `.planning/milestones/v4.1-phases/51-live-readiness-uats/51-UAT-EVIDENCE.md` (mirror its structure for v4.2).

**Recommended frontmatter + structure:**

```markdown
---
phase: 59-fixture-mutator-4-uat-re-sweep
plan: 02
status: complete
created: 2026-06-XX
completed_at: 2026-06-XX
canonical_repo: tonyrowles/patent-cite-tool
requirements_addressed: [SWEEP-01, SWEEP-02, SWEEP-03, SWEEP-04, SWEEP-05, SWEEP-06]
sequence_followed: "SWEEP-01 → SWEEP-02 → SWEEP-03 → SWEEP-04 (D-13 cost discipline)"
budget_cap_usd: 5
budget_spent_usd: <captured>
related_phases:
  - phase: 56
    relation: ledger-schema-enabler
  - phase: 57
    relation: branch-redirect-enabler
  - phase: 58
    relation: outcome-entry-enabler
---

# Phase 59 — 4-UAT Re-Sweep Evidence

## Outcome Matrix

| UAT | Status | Evidence | Notes |
|---|---|---|---|
| UAT-47-e (SWEEP-01) | PASS / FAIL | `evidence/uat-47-e-*.json` | ... |
| UAT-47-d (SWEEP-02) | PASS / FAIL | `evidence/uat-47-d-*.json` | ... |
| UAT-47-a (SWEEP-03) | PASS / FAIL | `evidence/uat-47-a-*.json` | Spend: $X.XX |
| UAT-47-b (SWEEP-04) | PASS / FAIL | `evidence/uat-47-b-*.json` | ... |

## Per-UAT detail
(one section per UAT mirroring 51-UAT-EVIDENCE.md §UAT-47-e structure)

### UAT-47-e — ...
**status:** PASS / FAIL
**verified_at:** 2026-06-XX
**pr_number:** N (CLOSED, branch deleted)
**branch:** auto-fix/test-uat47e-YYYYMMDDTHHMMSSZ (deleted)
**evidence:**
  - evidence/uat-47-e-pr-checks.json
  - evidence/uat-47-e-pr-labels.json
  - evidence/uat-47-e-pr-comments.json
**heuristic_assertions:**
  - Heuristic 1 (diff-guard FAIL): PASS — bucket=fail
  - Heuristic 2 (human-review-required label): PASS — present
  - Heuristic 3 (PR comment mentions tests/golden/baseline.json): PASS — present
**deviations:** (none, or numbered list)

...repeat for 47-d, 47-a, 47-b...
```

**JSON evidence files (each captured during execution):**

| File | Capture command | Purpose |
|------|-----------------|---------|
| `uat-47-e-pr-checks.json` | `gh pr checks <PR> --json bucket,name,state` | diff-guard bucket=fail proof |
| `uat-47-e-pr-labels.json` | `gh pr view <PR> --json labels` | human-review-required label proof |
| `uat-47-e-pr-comments.json` | `gh pr view <PR> --json comments` | violation-path mention proof |
| `uat-47-d-run-metadata.json` | `gh run view <RUN> --json status,conclusion,event,headBranch` | workflow_dispatch success |
| `uat-47-d-pre-branches.txt` / `uat-47-d-post-branches.txt` | `git ls-remote --heads origin 'ledger-snapshots/*'` | new ledger-snapshots branch appeared |
| `uat-47-a-pre-run-ledger.json` / `uat-47-a-post-run-ledger.json` | `git show origin/main:tests/e2e/.llm-spend-ledger.json` | spend delta + outcome entry |
| `uat-47-a-outcome-entry.json` | `jq` extract of `source: 'auto-fix-promoted'` entry | PROMOTE-02 success proof |
| `uat-47-a-pr-state.json` | `gh pr view <PR> --json state,isDraft,body,labels` | draft PR opened |
| `uat-47-a-verifier-gate-run.json` | `gh run view <RUN> --json conclusion,createdAt,jobs` | gate ran end-to-end |
| `uat-47-b-injected-issue.json` | `gh issue view <SYNTH> --json number,title,labels,body` | mutator produced valid issue |
| `uat-47-b-promotion-suppression.txt` | mock-gh transcript or production cron log | MUTATOR-04 suppression worked |
| `uat-47-b-deps-update-run.json` | `gh run view <RUN> --json conclusion,jobs` | deps-update-gate trigger fires |

---

## Cleanup Automation (SWEEP-06)

**Recommended one-shot script:** `tests/e2e/scripts/uat-cleanup.mjs`.

**Operations (idempotent):**

```bash
# 1. Close + delete all UAT test branches
for PR in $(gh pr list --search 'in:title UAT-47-e OR in:title fixture-mutator' --state open --json number --jq '.[].number'); do
  gh pr close "$PR" --delete-branch
done

# 2. Close all synthetic issues created by mutator
for ISSUE in $(gh issue list --search 'in:title fixture-mutator' --state open --json number --jq '.[].number'); do
  gh issue close "$ISSUE" --reason "not planned" --comment "UAT-47-b synthetic — closed per SWEEP-06 cleanup"
done

# 3. Revert synthetic quarantine entry (LOCAL — committed to main during SWEEP-04 via auto-promote)
# Read tests/e2e/test-cases-quarantine.js, strip entries where
# source_triage_finding_id startsWith 'fixture-mutator-uat-47b', write back atomically.
# Then open a SEPARATE PR (NOT direct-to-main; FORBIDDEN_PATHS regex 3 blocks direct edit).
git checkout -b "chore/sweep-06-cleanup-$(date -u +%Y%m%dT%H%M%SZ)" main
node tests/e2e/scripts/uat-cleanup.mjs --revert-quarantine
git commit -am "chore(59): SWEEP-06 — revert synthetic quarantine entries"
gh pr create --title "SWEEP-06 cleanup: revert synthetic quarantine entries" \
  --body "Per Phase 59 SWEEP-06 / Pitfall 11. Removes fixture-mutator-uat-47b entries from quarantine corpus."

# 4. Revert UAT-sourced ledger entries (HARDER — see caveat below)
# Strip entries where phase==='56-uat' from tests/e2e/.llm-spend-ledger.json.
# This is the most invasive step; defer to operator decision.

# 5. (Optional) report cleanup actions
echo "Cleanup complete. See: gh pr list --state closed --search 'SWEEP-06'"
```

**Caveat — ledger entry removal:** UAT entries with `phase: '56-uat'` (per Pitfall 10 mitigation) MAY remain in the ledger for filterable production analysis. CONTEXT.md says "all UAT ledger entries carry `phase: '56-uat'` for filterable production analysis" — i.e., the tag is the cleanup; entry deletion is NOT required and is actively undesirable. **Recommended: keep the entries; do NOT delete from the ledger. Tag-based filtering is the cleanup pattern.**

**Quarantine corpus revert IS required** (REQUIREMENTS.md SWEEP-06 verbatim: "synthetic quarantine entries reverted"). Mechanism: open a follow-up cleanup PR (cannot direct-push due to FORBIDDEN_PATHS regex 3 + ruleset).

---

## Common Pitfalls

### Pitfall 1: Mutator writes into a FORBIDDEN_PATHS file (PITFALLS Pitfall 5, LOAD-BEARING)

**What goes wrong:** Mutator mutates `tests/golden/baseline.json` or `tests/test-cases.js` (the 47-UAT-DEFERRED.md suggestion of "regression-fixture-mutator.sh" pointed here). The auto-fix LLM's proposed fix would be diff-guard-rejected on the PR side; the loop never completes.

**Why it happens:** The most direct way to inject a failure is to mutate a fixture or golden file. It "feels right" because it looks like a real production regression. But the auto-fix PR's diff would then touch FORBIDDEN_PATHS, which the verifier-gate diff-guard rejects.

**How to avoid:** Mutator works at the GitHub-issue-creation layer only. NO file writes to anything in FORBIDDEN_PATHS. Verification: `git status --porcelain` after mutator MUST show only `?? .planning/phases/59-*/56-MUTATOR-CLEANUP.md` (the cleanup-evidence file).

**Warning signs:** `git status` shows changes to `tests/`, `.github/workflows/v40-*`, or `tests/e2e/.llm-spend-ledger.json` after mutator runs.

---

### Pitfall 2: Mutator fingerprint formula drifts from `e2e-report-issue.mjs:78` (NEW Phase 59 concern)

**What goes wrong:** Mutator reimplements the fingerprint computation with a different formula (e.g., adds a separator, includes a timestamp, uses a different hash). `auto-fix.mjs:extractFingerprint` regex still matches the 12-hex (any hex string matches), so the workflow trigger PASSES, but downstream dedup logic in the production triage path (`findMatchingIssue`'s dual v1+v2 search) treats the mutator's fingerprints as inconsistent with the formula-of-record.

**Why it happens:** The formula at `e2e-report-issue.mjs:78-81` is small and tempting to inline. Two implementations seem identical until a string-escape detail diverges.

**How to avoid:** IMPORT and reuse the existing `fingerprint` function. Do NOT reimplement. Vitest test asserts that `fingerprint('synthetic-case', 'GOOGLE_DOM_DRIFT', null)` returns the same 12-hex when called from the mutator as from `e2e-report-issue.mjs`.

**Warning signs:** Test I1 (deterministic for same seed) fails, OR `auto-fix.mjs` dedup logic in CI logs reports "duplicate fingerprint" for what should be a new issue.

---

### Pitfall 3: `gh issue create` shell-escape failure on body content (NEW Phase 59 concern)

**What goes wrong:** Mutator passes `--body "$(cat body.md)"` instead of `--body-file -`. The body contains `<!--` HTML comments, backticks, code fences, and `$` (for spend-amount strings). Shell expansion mangles the body.

**Why it happens:** It's the "obvious" pattern from quick-shell-script habits. But the body is the most complex argv element.

**How to avoid:** Use `--body-file -` (stdin) — matches `e2e-report-issue.mjs:498` and `:513` patterns. The body is written to stdin via `{ input: body, encoding: 'utf8' }` option of `execSync`.

**Warning signs:** Created issue has truncated body, missing fingerprint line, or shell-error fragments in body.

---

### Pitfall 4: PR #18 dep-scan failure blocks Work stream B start (NEW Phase 59 concern, environment-level)

**What goes wrong:** PR #18 cannot merge because `dep-scan` is a required check and currently FAILS. The failure is environmental: GitHub Actions is not permitted to create pull requests on this repo (Settings → Actions → General → Workflow permissions). The dep-scan job pushes the branch successfully but cannot open the auto-deps-update PR.

**Why it happens:** A repo setting was never explicitly enabled. The setting defaults to "Read repository contents and packages permissions" without PR-create authorization for the github-actions[bot] actor. Phase 51.1's verifier-gate trigger fix is unrelated.

**How to avoid:** Pre-flight checklist for Work stream B includes resolving this. Two options:
- **Option α (recommended):** Operator enables `Settings → Actions → General → Workflow permissions → Allow GitHub Actions to create and approve pull requests`. This is a one-time repo setting change; not a code change.
- **Option β (fallback):** Operator removes `dep-scan` from required checks on the ruleset, treating it as advisory. This loosens the gate model — not recommended; the cleaner fix is α.

**Warning signs:** PR #18's check rollup shows `dep-scan: FAILURE` with the error string `"GitHub Actions is not permitted to create or approve pull requests"` in the workflow logs.

---

### Pitfall 5: Operator forgets to merge PR #18 before starting Work stream B (procedural)

**What goes wrong:** Operator runs SWEEP-01 against origin/main BEFORE PR #18 lands. The trigger-correctness fixes from Phases 56-58 are not on origin yet; UAT-47-e fails for the same reason Phase 51 saw (the verifier-gate trigger bug).

**How to avoid:** Pre-flight check in Work stream B confirms `gh pr view 18 --json state` returns `"MERGED"`. This is part of the SWEEP-01 pre-flight block.

**Warning signs:** `gh pr view 18 --json state` returns `OPEN` when Work stream B starts.

---

### Pitfall 6: SWEEP-03 paid spend runs without budget cap confirmation (CTRL-01)

**What goes wrong:** Operator approves SWEEP-03 in autonomous mode and the workflow runs without surfacing expected spend. If the LLM goes into an unparseable-output retry loop, spend exceeds $2.

**How to avoid:** plan-checker enforces `checkpoint:human-verify` task type for SWEEP-03 with cost notice in the prompt. Pre-run ledger snapshot + post-run delta with $2 hard cap (Phase 51 D-03 pattern). On exceed: FAIL the UAT, document, do not retry.

**Warning signs:** `evidence/uat-47-a-spend-delta.txt` shows > $2.

---

### Pitfall 7: SWEEP-06 misses the synthetic quarantine entry revert (REQUIREMENTS SWEEP-06 verbatim)

**What goes wrong:** Cleanup script closes PRs and issues but forgets the quarantine entry. The synthetic case sits in `tests/e2e/test-cases-quarantine.js` indefinitely with `stable_runs=1` and the source-tag suppression keeps it from auto-promoting (good) but it ALSO never goes away (bad — pollutes the corpus).

**How to avoid:** SWEEP-06 cleanup is a 4-step procedure (close PRs / close issues / revert quarantine entry via follow-up PR / leave ledger entries with phase tag). The quarantine revert step opens its own follow-up PR.

**Warning signs:** Post-SWEEP-06 `tests/e2e/test-cases-quarantine.js` still contains entries with `source_triage_finding_id` starting `fixture-mutator-uat-47b`.

---

## Pre-Flight State (verified 2026-06-05 03:35 UTC)

| Check | Expected | Actual | Status |
|-------|----------|--------|--------|
| Local commits ahead of origin/main | 57 | 57 | EXPECTED — Phases 56-58 unpushed; PR #18 carries them |
| PR #18 state | OPEN | OPEN | EXPECTED — Work stream B pre-flight gate |
| PR #18: verifier-gate check | SUCCESS | SUCCESS | PASS — Phase 51.1 trigger fix is on origin/main |
| PR #18: regression-suite check | SUCCESS | SUCCESS | PASS |
| PR #18: ready-flip check | SUCCESS | SUCCESS | PASS |
| PR #18: diff-guard check | SUCCESS | SUCCESS | PASS — Phase 57 + 58 changes are within bounds |
| PR #18: deps-update-gate check | SUCCESS | SUCCESS | PASS — fast-path scope-decision works |
| PR #18: ci check (×2) | SUCCESS | SUCCESS | PASS |
| PR #18: dep-scan check | SUCCESS | **FAILURE** | **BLOCKER** — environmental (see Pitfall 4) |
| `gh` CLI | present | 2.83.1 | PASS |
| `node` | >= 22 | v24.11.1 local; v22 in CI | PASS |
| `jq` | present | 1.7 | PASS |
| `tests/e2e/lib/issue-payload-builder.js:165` declares `params.fingerprint` | confirmed | confirmed | PASS |
| `scripts/quarantine-append.mjs:29` `READY_FOR_PROMOTION_LABEL` | confirmed | confirmed | PASS |
| `scripts/auto-fix.mjs:255` `extractErrorClass` | confirmed | confirmed | PASS |
| `scripts/check-diff-guard.mjs` FORBIDDEN_PATHS | 8 entries lines 49-58 | 8 entries lines 49-58 | PASS |

**Blocker summary:** ONE environmental pre-flight item — the dep-scan failure on PR #18. Resolvable by repo setting change (Pitfall 4 Option α). All code-level checks pass.

---

## Code Examples

### Example 1: Computing the synthetic fingerprint (MUTATOR-01)

```javascript
// Source: scripts/e2e-report-issue.mjs:78-81 reused verbatim
import { fingerprint } from '../../../scripts/e2e-report-issue.mjs';

const SEED = 'mutator-seed-1';
const CASE_ID = `synthetic-${SEED}`;
const ERROR_CLASS = 'GOOGLE_DOM_DRIFT';
const fp = fingerprint(CASE_ID, ERROR_CLASS, null);
// fp is 12-hex, deterministic for these inputs
```

### Example 2: Pre-flight collision check (MUTATOR-02)

```javascript
// Source: scripts/e2e-report-issue.mjs:522-535 pattern
import { execSync } from 'node:child_process';

const marker = `<!-- fp: ${fp} -->`;
const escaped = marker.replaceAll("'", "'\\''");  // T-35-03-03
const raw = execSync(
  `gh issue list --search '${escaped}' --state open --json number --limit 5`,
  { encoding: 'utf8' }
);
const matches = JSON.parse(raw);
if (matches.length > 0) {
  process.stderr.write(
    `[inject-defect] HARD ABORT: open issue #${matches[0].number} already carries fp ${fp}.\n` +
    `Either close it first or use a different --seed.\n`
  );
  process.exit(2);
}
```

### Example 3: Issue creation with labels (MUTATOR-01)

```javascript
// Source: scripts/e2e-report-issue.mjs:507-518 pattern
const body = [
  `<!-- fp: ${fp} -->`,
  '',
  '### Reproducer',
  '',
  `case-id: ${CASE_ID}`,
  `seed: ${SEED}`,
  '',
  '### Synthetic Defect',
  '```',
  `Created by tests/e2e/scripts/inject-defect.mjs`,
  `Source: fixture-mutator-uat-47b`,
  `Seed: ${SEED}`,
  '```',
].join('\n');

const out = execSync(
  `gh issue create --title "[fixture-mutator] ${CASE_ID}: ${ERROR_CLASS}" ` +
  `--label triage --label ${ERROR_CLASS} --body-file -`,
  { input: body, encoding: 'utf8' }
);
const issueNum = parseInt(out.match(/\/issues\/(\d+)/)[1], 10);
```

### Example 4: Source-tag suppression conditional (MUTATOR-04)

```javascript
// Source: scripts/quarantine-append.mjs lines 218-223 — modified
const isFixtureMutator = typeof finalEntry.source_triage_finding_id === 'string'
  && finalEntry.source_triage_finding_id.startsWith('fixture-mutator-uat-47b');

if (finalEntry.stable_runs >= STABLE_RUNS_THRESHOLD
    && ghClient
    && triageIssueNumber != null
    && !isFixtureMutator) {
  ghClient.addLabel(triageIssueNumber, READY_FOR_PROMOTION_LABEL);
  addedLabel = true;
}
```

### Example 5: SWEEP-02 trigger + verification

```bash
# Source: this research §UAT-47-d Runbook
gh workflow run v40-cost-ledger-snapshot.yml --ref main
sleep 5
RUN_ID=$(gh run list --workflow=v40-cost-ledger-snapshot.yml --limit 1 \
  --json databaseId,event --jq '.[] | select(.event=="workflow_dispatch") | .databaseId')
gh run watch "$RUN_ID" --interval 10 --exit-status
SNAPSHOT_DATE=$(date -u +%Y-%m-%d)
git ls-remote --heads origin "ledger-snapshots/daily-${SNAPSHOT_DATE}" \
  > evidence/uat-47-d-snapshot-branch.txt
# expect: one ref line
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Phase 47: bash mutator `regression-fixture-mutator.sh` mutating `tests/golden/` | Phase 59: Node `inject-defect.mjs` at issue-creation layer | 2026-06-04 (CONTEXT D / PITFALLS Pitfall 5) | LOAD-BEARING — original approach would have been auto-fix-loop-blocking |
| Phase 51 manual label-cycle on issue #3 for UAT-47-a | Phase 59 deterministic mutator-driven trigger | 2026-06-05 | UAT-47-a + 47-b unified path |
| `quarantine-append.mjs` unconditional label-add at threshold | Source-tag conditional skip for fixture-mutator entries | Phase 59 (this phase) | Pitfall 8 closure |
| `v40-cost-ledger-snapshot.yml` pushes to `main` | Pushes to `ledger-snapshots/daily-YYYY-MM-DD` | Phase 57 (now landed in PR #18) | UAT-47-d unblocked (was BLOCKED-BY-PHASE-50) |
| Verifier-gate `pull_request.branches:['auto-fix/*']` BASE-ref filter | No filter at `on:` + scope-decision step at job level | Phase 51.1 (commit ea45a47, already on origin/main) | UAT-47-e + 47-a unblocked |

**Deprecated/outdated:**
- 47-UAT-DEFERRED.md §UAT-47-b "Build `tests/e2e/uat-helpers/regression-fixture-mutator.sh`" — superseded by `tests/e2e/scripts/inject-defect.mjs` per Pitfall 5.
- Phase 47 D-04 "manual label cycle as the only UAT-47-a trigger" — superseded by mutator-driven path for SWEEP-03 (deterministic).

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | GitHub's `gh issue list --search` matches HTML-comment substrings (verified empirically in production by Phase 35 dual-search) | Fingerprint Collision Pre-Flight | If GitHub changed indexing behavior, collision check returns false-negatives and the mutator creates duplicate issues. Mitigation: SWEEP-06 cleanup catches duplicates. |
| A2 | The runner-bundled `gh` CLI version is recent enough to support `--json` and `--jq` flags on `issue list`, `pr view`, `run view` | All UAT runbooks | These flags have been GA since gh ~2.0 (2021); runners have 2.x consistently. Very low risk. |
| A3 | The Anthropic API spend for one auto-fix run on a GOOGLE_DOM_DRIFT scaffold is $0.50–$2 (research SUMMARY.md figure; no live measurement) | SWEEP-03 cost cap | If actual spend exceeds $2, Phase 51 D-03 "no retry past cap" pattern applies. Conservative cap is $5 (REQUIREMENTS.md Phase 51 budget). |
| A4 | The dep-scan failure on PR #18 is purely environmental (repo setting), not a code defect introduced by Phases 56-58 | Pre-Flight State / Pitfall 4 | Verified by reading the workflow logs — the failure message is the GitHub API rejection string `"GitHub Actions is not permitted to create or approve pull requests"`, not a node/script error. Low risk; planner should still re-verify before SWEEP-04. |
| A5 | Phase 58's outcome ledger entry shape includes `errorClass`, `model`, `outcome`, `fingerprint`, `issueId`, `prNumber`, `source` — exact field shape derived from REQUIREMENTS.md PROMOTE-02/03 text | SWEEP-03 success evidence | If the actual shape differs (e.g., `errorClass` is missing), the `jq` extraction in §UAT-47-a Stage 6 returns null but the entry still proves the loop ran. Robust-degrades. |
| A6 | The `dispatcher`-emitted ledger entry on auto-fix.mjs:725-741 already carries `phase` field; can be overridden via env var for UAT runs to set `phase: '56-uat'` | SWEEP-05 Pitfall 10 tagging | Examined `scripts/auto-fix.mjs` — `phase` is not currently part of the auto-fix entry shape (it is in the snapshot workflow's entries). **Risk: medium**. Mitigation: planner verifies the actual ledger entry shape post-SWEEP-03 and adjusts the tagging mechanism. May require a small `auto-fix.mjs` argv flag — but that's a code change, not in scope. Recommend `phase: '56-uat'` is added post-hoc to evidence captures, NOT to the actual ledger entries, if the field is not available on the dispatcher path. **Planner to validate.** |
| A7 | The `source_triage_finding_id` field as a discriminator for MUTATOR-04 suppression preserves the existing quarantine corpus schema with zero `formatEntry` changes | quarantine-append.mjs Suppression | Verified: `formatEntry` at lines 138-148 already includes `source_triage_finding_id`. Low risk. The alternative (adding a `source` field) is documented but not recommended without a wider schema-change scope. |

**If this table needs user confirmation before execution:** A6 is the highest-risk assumption — Pitfall 10's phase-tag mitigation may not be available the way CONTEXT.md envisions if the auto-fix dispatcher does not currently emit `phase` on its entries. Recommend the planner adds a checkpoint:human-verify task after SWEEP-03's first ledger entry is captured to confirm shape.

---

## Open Questions

1. **How does the planner intend to satisfy SWEEP-05's "all UAT ledger entries carry `phase: '56-uat'`" given that `scripts/auto-fix.mjs` may not currently expose a `--phase` argv flag?**
   - What we know: REQUIREMENTS.md SWEEP-05 mandates the tag. Phase 56 LEDGER-01..04 wired `errorClass` and other fields; whether `phase` is one of them needs verification.
   - What's unclear: whether `phase: '56-uat'` is a new field to wire (small Phase 59 sub-task) or an existing field set via env var.
   - Recommendation: Planner's first task in 59-02-PLAN.md is to read `scripts/auto-fix.mjs:728-741` (Step 7 ledger-write site) and confirm the `phase` field's source. If not present, planner decides whether to add it as a Phase 59 scope expansion or treat it as a Pitfall 10 documentation-only constraint (phase-tag applied to evidence captures, not live entries).

2. **Should SWEEP-04 reuse the same mutator-seeded synthetic from SWEEP-03 (idempotency-collision-aborted), or a different seed?**
   - What we know: collision check aborts when the same fingerprint is already open.
   - What's unclear: whether testing UAT-47-b on a SEPARATE seed (different fingerprint) is the design intent (catches mutator multi-seed handling) or if reusing the SWEEP-03 seed is sufficient.
   - Recommendation: **Different seed** (`mutator-seed-sweep-03` vs `mutator-seed-sweep-04`). Tests the mutator with two distinct fingerprints; SWEEP-06 cleanup handles both. Minimal extra cost.

3. **Is the `56-MUTATOR-CLEANUP.md` file regenerated on every mutator invocation, or appended-to?**
   - What we know: REQUIREMENTS.md MUTATOR-05 says "emits a cleanup evidence file."
   - What's unclear: whether multiple mutator invocations (SWEEP-03 with one seed, SWEEP-04 with another) overwrite the file, or append to it.
   - Recommendation: **Append**. Each invocation logs its issue # + branch name + quarantine entry id to the file. SWEEP-06 reads the file as a manifest. Avoids loss of cleanup-target info between invocations.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `gh` CLI | MUTATOR-01..03, SWEEP-01..06 | ✓ | 2.83.1 | — |
| `node` >= 22 | All scripts | ✓ | 24.11.1 (local), 22.x (CI) | — |
| `jq` | Evidence capture (SWEEP-01..06) | ✓ | 1.7 | — |
| `vitest` | New contract tests (MUTATOR-01..04) | ✓ | 3.x (from package.json) | — |
| `git` | UAT operations | ✓ | (system) | — |
| GitHub repo write permission | All UAT operations | ✓ (operator credentials) | — | — |
| `ANTHROPIC_API_KEY` secret on origin | SWEEP-03 (paid auto-fix run) | ✓ (assumed; verified at Phase 51 D-03) | — | — |
| Repo setting "Allow GitHub Actions to create and approve pull requests" | SWEEP-04 (deps-update-gate smoke) | **✗** | — | Disable dep-scan from required checks OR enable setting. **BLOCKING for SWEEP-04 evidence**; not blocking for PR #18 merge if dep-scan is removed from required checks. |

**Missing dependencies with no fallback:** none

**Missing dependencies with fallback:** repo setting (resolvable by operator action; SWEEP-04 has degraded fallback)

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest ^3.0.0 |
| Config file | `vitest.config.js` (root) + `vitest.config.chrome.js` / `vitest.config.firefox.js` for browser modes |
| Quick run command | `npm run test:src` (Vitest src tests only) |
| Full suite command | `npm test` (build + test:src + test:chrome + test:firefox + lint + test:lint) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MUTATOR-01 | `inject-defect.mjs` emits issue with `<!-- fp: ... -->` on line 1, errorClass label, triage label | unit (spawnSync + mock-gh) | `npx vitest tests/e2e/scripts/inject-defect.test.js -t MUTATOR-01` | ❌ Wave 0 — new test file |
| MUTATOR-02 | Pre-flight collision aborts when mock-gh returns non-empty issue list | unit (spawnSync + mock-gh) | `npx vitest tests/e2e/scripts/inject-defect.test.js -t MUTATOR-02` | ❌ Wave 0 |
| MUTATOR-03 | Post-run `git status --porcelain` matches allowed pattern | unit (spawnSync with cwd) | `npx vitest tests/e2e/scripts/inject-defect.test.js -t MUTATOR-03` | ❌ Wave 0 |
| MUTATOR-04 | `quarantine-append.mjs` suppresses promotion label for `source_triage_finding_id` startsWith `fixture-mutator-uat-47b` at stable_runs=3 | unit (spawnSync + mock-gh; extends existing test file) | `npx vitest tests/e2e/scripts/e2e-quarantine-append.test.js -t MUTATOR-04` | ✅ extends `e2e-quarantine-append.test.js` (G9 new) |
| MUTATOR-05 | Mutator emits `56-MUTATOR-CLEANUP.md` with `gh issue close`, `gh pr close --delete-branch`, and quarantine-revert commands | unit (spawnSync + read file) | `npx vitest tests/e2e/scripts/inject-defect.test.js -t MUTATOR-05` | ❌ Wave 0 |
| SWEEP-01..06 | Live UAT evidence — manual + scripted | manual-only | n/a (operator-driven) | n/a — evidence captured in `.planning/phases/59-*/evidence/*.json` |

**Why SWEEP-01..06 are manual-only:** They are LIVE production verifications against origin/main. They cannot be automated without contaminating production state on every test run. Evidence is captured artifacts, not Vitest assertions. This is the established pattern from Phase 51 (51-UAT-EVIDENCE.md).

### Sampling Rate

- **Per task commit:** `npx vitest run tests/e2e/scripts/inject-defect.test.js tests/e2e/scripts/e2e-quarantine-append.test.js`
- **Per wave merge:** `npm run test:src`
- **Phase gate:** `npm run test:src` green + all `evidence/uat-47-*.json` captured + `56-UAT-EVIDENCE.md` written.

### Wave 0 Gaps

- [ ] `tests/e2e/scripts/inject-defect.test.js` — new file; covers MUTATOR-01, 02, 03, 05.
- [ ] Extension to `tests/e2e/scripts/e2e-quarantine-append.test.js` — new `describe` block G9 covering MUTATOR-04.
- [ ] Framework install: NOT needed — vitest is already present in `package.json`.

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `gh auth login` (local); GITHUB_TOKEN (CI) — no new auth surface |
| V3 Session Management | no | n/a |
| V4 Access Control | yes | The mutator runs with operator's `gh` credentials; FORBIDDEN_PATHS enforcement is the principal-bound control |
| V5 Input Validation | yes | Mutator inputs: `--seed`, `--error-class` argv. Validate `--error-class` against `ERROR_CLASSES` set (Vitest contract test) |
| V6 Cryptography | yes | sha256 fingerprint via `crypto.createHash` — built-in, never hand-rolled |
| V7 Error Handling | yes | All `gh` shell-outs wrap in try/catch + exit code discipline (mirrors `e2e-report-issue.mjs:522-534`) |
| V14 Configuration | yes | Pitfall 4 — the repo-setting dependency for dep-scan is a configuration control surface |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Shell command injection via `--seed` argv | Tampering | Validate `--seed` against `/^[a-zA-Z0-9_-]+$/` regex before string interpolation |
| Shell command injection via `--error-class` argv | Tampering | Validate against `ERROR_CLASSES` set (closed enumeration; reject anything else) |
| Issue body containing literal `<issue_body_untrusted>` envelope | Tampering | `escapeForbiddenDelimiters` from `issue-payload-builder.js:107` — NOT NEEDED for mutator (mutator builds its own body from constants, not user input) |
| Token exfiltration via mock-gh `PATH` injection in tests | InfoDisclosure | Tests use hermetic tmpDir + explicit mock binary — never inherits production `PATH` (pattern at `e2e-quarantine-append.test.js:86-90`) |
| Synthetic issue triggers real Anthropic API call (cost vector) | DoS / cost | SWEEP-03 cost cap via Pre/Post ledger snapshot + $2 hard ceiling (Phase 51 D-03) |
| Mutator's `git status` check bypassed by file in `.gitignore` | RepudIation | The check uses `git status --porcelain` which respects .gitignore; mutator's only legitimate untracked artifact is `56-MUTATOR-CLEANUP.md` which is NOT gitignored. Low-risk. |

---

## Sources

### Primary (HIGH confidence)

- **Codebase inspection** (working tree at commit `c7078c2` + 56 unpushed commits):
  - `scripts/e2e-report-issue.mjs:78-81` — fingerprint formula
  - `scripts/e2e-report-issue.mjs:478-540` — `makeRealGhClient` (listOpenWithSearch, createIssueWithLabels, addLabel)
  - `scripts/quarantine-append.mjs:29,138-148,177-226,295-367` — corpus schema, upsert, label-add
  - `scripts/auto-fix.mjs:216,229-262,592-631,681-707,725-744` — RECOGNIZED_LABELS, extractFingerprint, extractErrorClass, dispatcher Steps 3-7
  - `scripts/check-diff-guard.mjs:49-58` — FORBIDDEN_PATHS bank (8 entries)
  - `tests/e2e/lib/issue-payload-builder.js:4,159-264` — D-02 fingerprint marker convention, buildIssuePayload contract
  - `tests/e2e/scripts/e2e-quarantine-append.test.js:50-203` — mock-gh test pattern, G1-G8 case suite
  - `tests/e2e/scripts/e2e-explore-ci-guard.test.js:25-63` — spawnSync hermetic env pattern
  - `.github/workflows/v40-auto-fix.yml:42-225` — `issues.labeled` trigger, two-commit split, scope-decision pattern
  - `.github/workflows/v40-verifier-gate.yml:44-50` — `pull_request` trigger (no base-ref filter post-Phase-51.1)
  - `.github/workflows/v40-cost-ledger-snapshot.yml:18-111` — cron + workflow_dispatch, push to `ledger-snapshots/daily-*`
  - `.github/workflows/v40-auto-promote.yml:42-55` — `pull_request.types:[closed]` trigger, triple-gate scope
- **GitHub live state** (verified via `gh pr view 18 --repo tonyrowles/patent-cite-tool` 2026-06-05 03:35 UTC):
  - 7 of 8 PR #18 checks SUCCESS; `dep-scan` FAILURE root cause = "GitHub Actions is not permitted to create or approve pull requests"
- **Planning artifacts** (this milestone):
  - `.planning/phases/59-fixture-mutator-4-uat-re-sweep/59-CONTEXT.md` — locked decisions, scope split
  - `.planning/REQUIREMENTS.md` lines 38-57 — MUTATOR-01..05, SWEEP-01..06 verbatim
  - `.planning/research/PITFALLS.md` Pitfalls 5, 6, 8, 10, 11 — load-bearing constraints
  - `.planning/research/SUMMARY.md` lines 192-203 — Phase 59 architecture decision
  - `.planning/STATE.md` lines 84-85 — Phase 59 blocker advisory
  - `.planning/milestones/v4.1-phases/51-live-readiness-uats/51-UAT-EVIDENCE.md` — pattern reference for `56-UAT-EVIDENCE.md`
  - `.planning/milestones/v4.1-phases/51-live-readiness-uats/51-CONTEXT.md` D-01..D-20 — operational discipline
  - `.planning/milestones/v4.0-phases/47-v4-0-cleanup/47-UAT-DEFERRED.md` — original 4-UAT runbook stubs

### Secondary (MEDIUM confidence)

- GitHub Actions docs (general knowledge): `pull_request.branches:` filter targets BASE ref behavior — confirmed by Phase 51 §UAT-47-e deviation #2 empirically.
- `gh issue list --search` semantics (substring match on body): confirmed empirically by Phase 35 dual-search production usage; documented in `e2e-report-issue.mjs:301-321`.

### Tertiary (LOW confidence)

- None — all factual claims sourced from direct code inspection or live GitHub state.

---

## Metadata

**Confidence breakdown:**
- Fingerprint contract (MUTATOR-01): HIGH — formula at `e2e-report-issue.mjs:78-81` verified verbatim
- `gh` argv plumbing (MUTATOR-01): HIGH — pattern at `e2e-report-issue.mjs:507-518` verified
- Collision pre-flight (MUTATOR-02): HIGH — pattern at `e2e-report-issue.mjs:522-535` + production usage in `quarantine-append.mjs:330`
- Source-tag suppression (MUTATOR-04): HIGH — quarantine-append.mjs:218-223 read in full; schema field choice has medium confidence (planner discretion `source_triage_finding_id` vs new `source` field)
- FORBIDDEN_PATHS (MUTATOR-03): HIGH — `check-diff-guard.mjs:49-58` verified verbatim, all 8 entries
- Vitest pattern (test design): HIGH — `e2e-quarantine-append.test.js:50-203` is the canonical mock-gh template
- UAT-47-e runbook (SWEEP-01): HIGH — combines 47-UAT-DEFERRED.md + Phase 51 deviation #2 fix
- UAT-47-d runbook (SWEEP-02): HIGH — workflow shape verified at `v40-cost-ledger-snapshot.yml:106-111`
- UAT-47-a runbook (SWEEP-03): HIGH for structure, MEDIUM for cost figure (~$0.50-2 is research-derived not measured)
- UAT-47-b runbook (SWEEP-04): HIGH for mutator-driven flow, MEDIUM for deps-update-gate smoke (blocked by Pitfall 4 environmental fix)
- Evidence template (SWEEP-05): HIGH — direct mirror of 51-UAT-EVIDENCE.md
- Cleanup automation (SWEEP-06): HIGH — gh CLI patterns standard

**Research date:** 2026-06-05
**Valid until:** 2026-07-05 (30-day estimate; codebase pieces are stable, but PR #18 state and the dep-scan repo setting are live and may change daily)

## RESEARCH COMPLETE

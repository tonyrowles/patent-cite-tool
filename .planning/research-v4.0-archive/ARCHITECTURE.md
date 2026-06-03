# Architecture Research — v4.0 Self-Healing Test Suite

**Mode:** Architecture (integration mapping for subsequent milestone)
**Researched:** 2026-05-30
**Confidence:** HIGH — direct inspection of v3.1 source files + integration points; trust-invariant exemption analyzed line-by-line

## Key Findings

- The auto-fix loop attaches to the **issue surface** (label = `triage`), not to the nightly cron — so `e2e-nightly.yml` needs **zero modification**. This mirrors the v3.1 pattern where `quarantine-append.mjs` consumed `triage-report.json` without touching the workflow that produced it.
- The single load-bearing trust-invariant decision is the `_skipCiGuard: true` exemption in `auto-fix-promote.mjs` invoking `runPromote()`. The CI guard at `promote-from-quarantine.mjs:131` must be bypassed for legitimate CI auto-promotion, but the guard's *intent* (block random CI contexts from corrupting golden) is reconstructed via a triple-gate assertion: `auto-fix:verified` label present + `merged === true` + source issue carried `triage` label.
- **Unified ledger spans both transports** (subscription + API) under one `LEDGER_PATH`. This prevents the dual-pool failure mode where subscription dev credit and API monthly spend silently run in parallel and both stay under $100 while collectively burning $400.
- **No `cost-ledger.js` extraction.** The "v2" ledger is purely additive (`transport`, `phase: '40-auto-fix'` fields spread through existing `appendLedgerEntry`). The proposed extraction would create one-directional coupling between two files with one caller.
- **The proposed build order had three flaws.** Refined ordering moves verifier-gate BEFORE auto-fix workflow (the simpler workflow lands first, and gives the auto-fix PRs something to land into), promotes deps-update earlier as a workflow-convention pipe-cleaner, and trims the over-scoped Phase A foundation.

---

## 1. New Workflow Files (with triggers + permissions)

| Filename | Trigger | Permissions | Concurrency |
|----------|---------|-------------|-------------|
| `.github/workflows/v40-auto-fix.yml` | `issues: { types: [labeled] }` filtered to `triage` label | `contents: write`, `pull-requests: write`, `issues: read` | `v40-auto-fix-${{ event.issue.number }}` per-issue |
| `.github/workflows/v40-verifier-gate.yml` | `pull_request: { types: [opened, synchronize, reopened] }` with `if: startsWith(head_ref, 'auto-fix/')` | `contents: read`, `pull-requests: write`, `checks: write` | `v40-verifier-gate-${{ event.pr.number }}` cancel-in-progress: true |
| `.github/workflows/v40-auto-promote.yml` | `pull_request: { types: [closed] }` with `if: merged && contains(labels, 'auto-fix:verified')` | `contents: write`, `issues: write` | `v40-auto-promote` static (serializes corpus writes) |
| `.github/workflows/v40-deps-update.yml` | `schedule: '0 9 * * 1'` + `workflow_dispatch` | `contents: write`, `pull-requests: write` | `v40-deps-update` static |
| `.github/workflows/v40-cost-ledger-snapshot.yml` | `schedule: '0 0 * * *'` + post-step in v40-auto-fix.yml | `contents: write` | `v40-ledger-snapshot` |

**Trigger semantics — why `issues.labeled (triage)` is correct.** The `triage` label is hard-stamped at `issue-payload-builder.js:180` (`labels = [category, 'e2e-nightly', 'triage']`). Every triage-pipeline issue carries it — perfect deterministic fan-in signal. `quarantine:ready-for-promotion` is the **wrong** trigger: it fires only at `stable_runs >= 3` (the promotion gate), but we want fixes attempted BEFORE quarantine maturity. `issue_comment` (slash commands) is human-driven, reserved for re-trigger affordance via `workflow_dispatch`.

---

## 2. New Scripts in `scripts/`

| Path | Purpose | CLI surface |
|------|---------|-------------|
| `scripts/auto-fix.mjs` | Core fix proposer: gh issue view → parse ERROR_CLASS → fix-prompt-builder → invokeAnthropicSdk/ClaudeP → unified diff → `git apply --check`+`git apply` → branch `auto-fix/<n>-<fp8>` → `gh pr create --draft` | `--issue <n> [--transport sdk\|subscription] [--dry-run] [--push]` |
| `scripts/auto-fix-promote.mjs` | On PR merge: parse `<!-- affected_cases: id1,id2 -->` HTML comment → call `runPromote({id, confirm:true, _skipCiGuard:true})` per case → close source issue | `--pr <n>` |
| `scripts/check-deps-and-pr.mjs` | `npm outdated --json` partitioned into security/minor tiers via `npm audit --json`, one PR per tier | `--tier security\|minor [--dry-run]` |
| `scripts/verify-single-case.mjs` | Thin CLI shim — load case from golden OR quarantine corpus, call `verifyCitation()`, exit 0/1, write `verify-single-case.json` | `--case-id <id> [--quarantine]` |

**`/gsd:fix-issue <n>` is NOT a GSD skill.** It's an **npm script** wrapping `auto-fix.mjs --transport subscription`:

```json
"fix-issue": "node scripts/auto-fix.mjs --transport subscription"
```

Subscription mode refuses to push without explicit `--push`. GSD skills are command primitives; project-specific automation belongs in `package.json scripts` (codebase convention).

**Naming pattern decision:** `auto-fix.mjs` (not `e2e-auto-fix.mjs`) — the `e2e-*` prefix is reserved for scripts that read/write E2E artifacts (e2e-report-issue, e2e-rerun-validator). auto-fix doesn't read artifacts; it reads issue bodies. Matches the bare-verb convention of `promote-from-quarantine.mjs`, `quarantine-append.mjs`, `weekly-digest.mjs`.

---

## 3. Library Extensions in `tests/e2e/lib/`

### 3.1 `llm-driver.js` — add `invokeAnthropicSdkWithLedger`

Same interface as `invokeClaudePWithLedger`, inverse CI gate:

| Aspect | invokeClaudePWithLedger | invokeAnthropicSdkWithLedger |
|--------|--------------------------|--------------------------------|
| Transport | `spawn('claude', ...)` | `@anthropic-ai/sdk` (new dep, v0.100.1+) |
| CI gate | Blocks when `CI=true` (line 384) | **Only runs when `CI=true` OR `--force-api`** |
| Auth | `ANTHROPIC_API_KEY=''` cleared | `process.env.ANTHROPIC_API_KEY` from secret |
| Cost source | `parsed.total_cost_usd` | Computed via `llm-pricing.js` × usage tokens |
| Ledger source | `'triage'` / `'auto-fix'` | `'auto-fix-api'` (distinct for audit greps) |
| Spend cap | Shared `LEDGER_PATH` | **Shared `LEDGER_PATH`** (unified — design constraint) |

**Where ledger lives in CI: committed `tests/e2e/.llm-spend-ledger.json`** (currently gitignored — flip to committed-but-versioned). The auto-fix workflow commits the ledger update atomically with the fix. Considered & rejected: GHA cache (eventually-consistent, loses entries across parallel workflows), Cloudflare KV (adds infra dep + network round-trip).

**ESLint guard:** `@anthropic-ai/sdk` imports forbidden outside `tests/e2e/lib/llm-driver.js` (single-entry-point invariant matching v3.1 `invokeClaudeP` lock).

### 3.2 New `lib/fix-prompt-builder.js`

Pure-function module. Analog to `lib/issue-payload-builder.js`: no fs, no path, no child_process. Per-ERROR_CLASS prompt scaffolds:

```javascript
export const PROMPT_SCAFFOLDS = {
  WRONG_CITATION: /* matching-pipeline tiers + likely fix surfaces */,
  LLM_HALLUCINATED_SELECTION: /* spec-extraction + hallucination-guard */,
  WORKER_FALLBACK_FAILED: /* worker/uspto fallback (cross-repo aware) */,
  GOOGLE_DOM_DRIFT: /* selectors, data-testid, selection.js */,
  HARNESS_ERROR: /* playwright primitives, navigation/observation */,
  FLAKE: null,  // explicit NO FIX — see §3.2 below
};

export function buildFixPrompt({ issueBody, errorClass, affectedCases, repoContext }) {
  if (errorClass === 'FLAKE') return { ok: false, escalate: 're-quarantine' };
  // ...returns {systemPrompt, userPrompt}
}
```

**FLAKE handling:** `auto-fix.mjs` calls `quarantine-append.mjs --escalate-stable-runs-reset 1` (new flag) instead of opening a PR. Preserves v3.1 invariant that FLAKE is non-fixable signal noise.

### 3.3 `lib/cost-ledger.js` — **stay in `llm-ledger.js`, no extraction**

Reasoning:
- `llm-ledger.js` is 371 lines and tightly coupled to `llm-driver.js` (sole caller). Extraction → one-directional dep between two files with one consumer.
- "v2" is purely additive: new fields (`transport`, `phase: '40-auto-fix'`) spread through `appendLedgerEntry()` line 318 verbatim. Forward-compatible.
- New helpers (`transportTotal`, `snapshotForDay`) coexist alongside existing `monthlyTotal`, `phaseTotal` — matches codebase convention.

### 3.4 `lib/pdf-verifier.js` — **no library extension needed**

The existing `verifyCitation({patentId, selectedText, observedCitation})` at line 830 is already the canonical entry point (used by `verify-calibrate.mjs` line 32 + `e2e-rerun-validator.mjs` line 25). The new `verify-single-case.mjs` SCRIPT provides the CLI shim by importing `verifyCitation` and adding case-loading from corpora. VFY-02 independence is preserved — the lib stays unchanged.

---

## 4. Data Flow — The Auto-Fix Loop

```
06:00 UTC nightly — e2e-nightly.yml (UNCHANGED)
  smoke → regression → fault-injection → triage-pipeline → quarantine-spec
                              │
                              ▼ scripts/run-triage-pipeline.mjs Stage 3 issue-file
  Issue created with:
    labels: [<ERROR_CLASS>, 'e2e-nightly', 'triage']
    body line 1: <!-- fp: <12hex> -->
    4 sections: reproducer / verifier disagreement / LLM rationale / golden diff
                              │
                              │ trigger: issues.labeled('triage')
                              ▼
NEW — v40-auto-fix.yml
  1. Skip if FLAKE label
  2. node scripts/auto-fix.mjs --issue <n>
       transport='sdk' in CI → invokeAnthropicSdkWithLedger
       a. gh issue view → body + labels
       b. parse ERROR_CLASS from labels
       c. buildFixPrompt({issueBody, errorClass, affectedCases, repoContext})
       d. invokeAnthropicSdkWithLedger → parse to unified diff
       e. git apply --check; git apply (rejects diffs touching tests/test-cases.js, baseline.json, quarantine corpus)
       f. git checkout -b auto-fix/<n>-<fingerprint8>
       g. git commit -m "Fix #<n>: <ERROR_CLASS>"
       h. git push
       i. gh pr create --draft --body "<!-- affected_cases: id1 --> + cost + reproducer + rollback"
                              │
                              │ trigger: pull_request.opened, head_ref=auto-fix/*
                              ▼
NEW — v40-verifier-gate.yml
  1. checkout PR branch
  2. npm ci && npm run build:chrome
  3. parse affected_cases from PR body HTML comment
  4. for case_id: node scripts/verify-single-case.mjs --case-id <id>
  5. on all-pass: gh pr ready + gh pr edit --add-label auto-fix:verified
     on any-fail: pr comment with details, stay in draft
                              │
                              │ HUMAN review + approve + merge (trust gate)
                              ▼
NEW — v40-auto-promote.yml
  on pull_request.closed && merged && contains(labels, 'auto-fix:verified')
  1. parse affected_cases from PR body
  2. node scripts/auto-fix-promote.mjs --pr <n>
       → calls runPromote({id, confirm:true, _skipCiGuard:true}) per case
  3. gh issue close <source_issue> --reason completed
```

### Five integration touchpoints with v3.1 primitives

| Touchpoint | v3.1 primitive (file:line) | v4.0 consumer |
|------------|----------------------------|---------------|
| Triage labels | `issue-payload-builder.js:180` | `v40-auto-fix.yml` trigger filter |
| Fingerprint comment | `e2e-report-issue.mjs:78` (`fingerprint()` 12-hex) | `auto-fix.mjs` branch namer `auto-fix/<n>-<fp8>` — idempotency |
| `invokeClaudePWithLedger` | `llm-driver.js:375` | `auto-fix.mjs --transport subscription` path |
| `verifyCitation` | `pdf-verifier.js:830` | `verify-single-case.mjs` CLI shim |
| `runPromote` | `promote-from-quarantine.mjs:115` (injectable orchestrator) | `auto-fix-promote.mjs` with `_skipCiGuard:true` + triple-gate assertion |

**Critical: `_skipCiGuard` exemption.** `promote-from-quarantine.mjs:131` hardcodes a CI refusal. v4.0's auto-promote workflow LEGITIMATELY runs in CI. `auto-fix-promote.mjs` calls `runPromote({_skipCiGuard:true})` only after asserting:
1. PR has `auto-fix:verified` label (verifier signed off)
2. PR was merged (`event.pull_request.merged === true`)
3. Source issue had `triage` label (originated from triage pipeline)

Collectively reconstructs the human-gate invariant: a HUMAN merged, after a VERIFIER signed off, on a TRIAGE-sourced issue.

---

## 5. Build-Order Critique & Refinement

### Issues with the initial sketched ordering

1. **Phase A foundation is over-scoped.** "cost-ledger.js refactor + SDK wrapper" — the refactor is unnecessary (see §3.3). Phase A = SDK wrapper + ledger v2 schema additions only.
2. **Phase D blocks Phase C unnecessarily.** Auto-fix PRs (C) need verifier-gate (D) to exist or they have nothing to land into. Verifier-gate is the simpler workflow (5 steps, no LLM) — build it FIRST.
3. **Phase G (deps-update) is too late.** It's the simplest workflow and serves as a low-risk pipe-cleaner for the `v40-*.yml` convention. Promote it earlier.

### Refined phase ordering

| Phase | Topic | Dependencies | Why |
|-------|-------|--------------|-----|
| **39** | SDK driver + ledger v2 + cost snapshot lib | None | Pure-additive lib extension. Smoke-tests new dep + secret plumbing. |
| **40** | Pipe-cleaner: deps-update + cost-ledger-snapshot workflows | 39 (ledger schema) | First v40-*.yml workflows. Validates conventions. No LLM. |
| **41** | Verifier-gate workflow + verify-single-case.mjs CLI shim | 40 (conventions); existing `verifyCitation` | Simplest LLM-adjacent workflow — no LLM. Tests `auto-fix/*` branch matching + PR-comment surface. Can be exercised via manual `auto-fix/test` branch push. |
| **42** | fix-prompt-builder + WRONG_CITATION vertical slice (auto-fix.mjs core) | 39 (driver), 41 (verifier-gate to land into) | ONE error class, end-to-end. Local invocation, manual PR. Validates diff-application + branch-push + PR-body conventions. |
| **43** | v40-auto-fix.yml workflow + draft-PR creation | 42 (script proven locally) | Lift Phase 42 into a workflow. First CI-driven end-to-end run. |
| **44** | v40-auto-promote.yml + auto-fix-promote.mjs | 43 (PRs with auto-fix:verified exist) | Closes merge → promote loop. Triple-gate assertion has explicit test coverage. |
| **45** | Per-ERROR_CLASS prompt expansion (4 more classes) + FLAKE escalation | 44 (full loop closed) | Scale from 1 to 5 classes. Each ~2-3 days of prompt engineering. |
| **46** | `/gsd:fix-issue` local UX + ledger v2 dashboard | 45 (all classes wired) | Subscription-local iteration + committed dashboard markdown. QoL phase. |
| **47** | v4.0 cleanup: integration audit, Nyquist, live HUMAN-UAT | 39–46 | Same shape as v3.1 Phase 38. |

**9 phases (39-47)** vs v3.1's 7 — extra 2 for the larger SDK/dep-surface scope.

### Cross-phase dependency graph (explicit)

```
39 (SDK driver) ──┬──→ 42 (vertical slice) ──→ 43 (workflow) ──→ 44 (promote)
                  │                                                  │
                  └──→ 46 (local UX)                                  │
                                                                     ▼
40 (deps-update) ──→ 41 (verifier-gate) ──→ 42                     45 (expansion)
                                            │                        │
                                            └────────────────────────┘
                                                                     ▼
                                                                  47 (cleanup)
```

- **42 blocks 43** — workflow needs a proven script
- **41 blocks 42** — verifier-gate must exist or auto-fix PRs have nowhere to land
- **40 blocks 41** — workflow filename/permission conventions established first
- **39 blocks 42 AND 46** — SDK driver is foundation for both API + subscription paths through unified ledger
- **43 blocks 44** — auto-fix:verified label only exists after auto-fix workflow runs
- **44 blocks 45** — full loop proven on ONE class before scaling to five
- **Parallelizable:** 39+40+41 can run in three parallel branches if executed by three agents (39 has no deps; 40 only needs 39's additive schema; 41 only needs existing `verifyCitation`)

### Per-phase risk concentration

| Phase | Risk | Mitigation |
|-------|------|------------|
| 39 | SDK breaking changes | Pin exact version (0.100.1); stable surface |
| 40 | Workflow permissions silent no-op | Phase 40 doubles as permissions smoke-test |
| 41 | Affected-cases parse fragile | HTML comment `<!-- affected_cases: id1 -->` (machine-readable) |
| 42 | LLM produces no-op or harmful diffs | `git apply --check` BEFORE apply; dry-run mode; reject diffs >50 lines until prompt is tuned |
| 43 | Label-flapping triggers repeated LLM calls | Idempotency: branch existence check via `git ls-remote` returns non-empty → exit 0 |
| 44 | Auto-promote bypasses trust invariant | Triple-gate assertion (verified-label + merged + triage-sourced) line-numbered for audit |
| 45 | Per-class prompts diverge in style | Frozen `PROMPT_SCAFFOLDS` registry, single eslint-restricted import |
| 46 | Subscription/API ledger drift | Single `LEDGER_PATH` const; transport tag is metadata only |
| 47 | Live UAT runs against real GitHub issues | Pre-create labeled fixture issue in a fork; UAT against fork |

---

## 6. Boundary Concerns — Scripts vs Libs

**v3.1 convention (preserved in v4.0):**

| Layer | Properties | Existing examples | v4.0 additions |
|-------|------------|-------------------|----------------|
| `tests/e2e/lib/*` | Pure functions. NO `fs` writes, NO `child_process`, NO `process.exit`, NO direct `gh`. Named exports only. | `issue-payload-builder.js`, `triage-classifier.js`, `rerun-validator.js`, `error-codes.js` | `fix-prompt-builder.js` (pure) |
| `tests/e2e/lib/*` (impure but isolated) | Async, structured return, single-entry-point CI/cap gates | `llm-driver.js` (subprocess), `pdf-verifier.js` (fs reads OK) | `llm-driver.js` extension (SDK call) |
| `scripts/*.mjs` | CLI shims. argv parsing, exit codes, `execSync('gh ...')`, atomic file writes, spawnSync chains. | `e2e-report-issue.mjs`, `quarantine-append.mjs`, `promote-from-quarantine.mjs`, `run-triage-pipeline.mjs`, `weekly-digest.mjs` | `auto-fix.mjs`, `auto-fix-promote.mjs`, `check-deps-and-pr.mjs`, `verify-single-case.mjs` |

### ESLint `no-restricted-imports` rules (3 new blocks)

```javascript
// 1. @anthropic-ai/sdk only importable from llm-driver.js
{
  files: ['**/*.{js,mjs}'],
  ignores: ['tests/e2e/lib/llm-driver.js'],
  rules: {
    'no-restricted-imports': ['error', {
      paths: [{
        name: '@anthropic-ai/sdk',
        message: 'Import via invokeAnthropicSdkWithLedger from llm-driver.js — direct SDK imports forbidden (mirrors invokeClaudeP CI-gate invariant).'
      }]
    }]
  }
},

// 2. Auto-fix scripts MUST NOT import src/ (defense in depth)
{
  files: ['scripts/auto-fix.mjs', 'scripts/auto-fix-promote.mjs', 'scripts/check-deps-and-pr.mjs'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [{
        group: ['**/src/**', '../src/**', '/src/**'],
        message: 'auto-fix tooling MUST NOT import src/ — pure tooling layer (same invariant as pdf-verifier.js VFY-02).'
      }]
    }]
  }
},

// 3. fix-prompt-builder.js purity (mirror issue-payload-builder.js)
{
  files: ['tests/e2e/lib/fix-prompt-builder.js'],
  rules: {
    'no-restricted-imports': ['error', {
      paths: [
        { name: 'node:fs', message: 'fix-prompt-builder must be pure — no I/O.' },
        { name: 'node:child_process', message: 'fix-prompt-builder must be pure — no subprocesses.' },
        { name: 'node:path', message: 'fix-prompt-builder must be pure — no path computation.' },
      ]
    }]
  }
},
```

**Confirmed: auto-fix scripts do NOT need src/ access.** The script reads issue body (gh), builds prompts (lib), invokes LLM (lib), applies diffs (git apply), opens PR (gh). The diff itself MAY touch src/ — but the script never imports src/ modules. Rule #2 makes this invariant lint-enforced.

### Anti-patterns to avoid

| Anti-pattern | Why bad | Instead |
|--------------|---------|---------|
| Auto-merging verified PRs | Destroys trust invariant (v3.1 lesson from `promote-from-quarantine`) | Keep PRs in `ready-for-review` after verifier passes; require human merge |
| LLM-driven test changes | LLM can "fix" a bug by adjusting golden corpus to match wrong output | `auto-fix.mjs` rejects diffs touching `tests/test-cases.js`, `tests/golden/baseline.json`, `tests/e2e/test-cases-quarantine.js` |
| Skipping fingerprint check on workflow re-trigger | Label flap creates N duplicate PRs | Branch existence check: `git ls-remote --heads origin auto-fix/<n>-<fp8>` non-empty → exit 0 with "already attempted" comment |
| Storing API key in committed `.env.example` | Leaks into git history | `secrets.ANTHROPIC_API_KEY` only; `--transport sdk` asserts env var presence; refuses local without `--force-api` |
| Logging LLM raw response in workflow logs | Prompt-injected content renders in workflow UI | Truncate to 500 chars before `console.log`; full response → artifact-only |
| Per-case auto-fix on FLAKE | Wastes LLM budget on noise | FLAKE label → skip immediately; `quarantine-append --escalate-stable-runs-reset 1` |

---

## Roadmap Implications

**Recommended phase structure: 9 phases (39-47).**

Critical sequencing:
1. **Phase 39 first** — SDK driver foundation enables everything downstream
2. **Phases 39, 40, 41 can run in parallel** if three agents are available (zero shared write surface)
3. **Phase 42's vertical slice is the highest-risk integration phase** — proves end-to-end loop for one class before scaling
4. **Phase 44 (auto-promote) requires explicit `_skipCiGuard` audit** — single load-bearing trust-invariant decision in the milestone
5. **Phase 47 cleanup mirrors v3.1 Phase 38 shape** — Nyquist coverage stamping, live HUMAN-UAT, integration fragility audit

## Open Questions for phase-specific research

- **Phase 39:** Should the Anthropic SDK call use prompt caching for the system prompt? (System prompts are fixed per ERROR_CLASS, would benefit from cache.) Defer to phase-specific research.
- **Phase 42:** What's the upper bound on auto-fix diff size before requiring human pre-review? Defer; calibrate empirically on first 10 fixes.
- **Phase 44:** Should auto-promote also fire on `auto-fix:partial-verified` (verifier passes on 3/5 affected cases)? Defer; default to all-or-nothing in v4.0.
- **Phase 46:** Does the committed ledger leak data through git history that would be sensitive? (Monthly spend pattern, model IDs.) Phase 46 should audit.

## Files referenced (absolute paths)

- `/home/fatduck/patent-cite-tool/.planning/PROJECT.md`
- `/home/fatduck/patent-cite-tool/.planning/MILESTONES.md`
- `/home/fatduck/patent-cite-tool/package.json`
- `/home/fatduck/patent-cite-tool/.github/workflows/e2e-nightly.yml`
- `/home/fatduck/patent-cite-tool/tests/e2e/lib/llm-driver.js` (line 375: `invokeClaudePWithLedger`)
- `/home/fatduck/patent-cite-tool/tests/e2e/lib/llm-ledger.js` (line 318: `appendLedgerEntry`)
- `/home/fatduck/patent-cite-tool/tests/e2e/lib/issue-payload-builder.js` (line 180: labels = `[category, 'e2e-nightly', 'triage']`)
- `/home/fatduck/patent-cite-tool/tests/e2e/lib/pdf-verifier.js` (line 830: `verifyCitation`)
- `/home/fatduck/patent-cite-tool/tests/e2e/lib/error-codes.js` (11 ERROR_CLASSES)
- `/home/fatduck/patent-cite-tool/scripts/promote-from-quarantine.mjs` (line 115: `runPromote` + line 123: `_skipCiGuard`)
- `/home/fatduck/patent-cite-tool/scripts/run-triage-pipeline.mjs` (4-stage spawnSync pattern)
- `/home/fatduck/patent-cite-tool/scripts/e2e-report-issue.mjs` (line 78: `fingerprint()`)
- `/home/fatduck/patent-cite-tool/eslint.config.js` (existing no-restricted-imports patterns)

## Sources

- [@anthropic-ai/sdk — npm](https://www.npmjs.com/package/@anthropic-ai/sdk)
- [Claude API Node.js & TypeScript Tutorial (Kalyna 2026)](https://kalyna.pro/claude-api-nodejs-tutorial/)

# Phase 39: SDK Driver + Ledger v2 + Branch Protection Wave-0 — Research

**Researched:** 2026-05-30
**Domain:** Foundation library extensions + GitHub repo-level safety rails
**Confidence:** HIGH (extends v3.1 primitives directly inspected line-by-line + milestone-level research already verified within 24h)

## Summary

Phase 39 is purely additive on top of v3.1's `tests/e2e/lib/llm-driver.js` + `tests/e2e/lib/llm-ledger.js` primitives. The work is mechanical extension, not new design: sibling export `invokeAnthropicSdkWithLedger` in the existing driver module (inverse CI gate), additive `transport` + `phase` fields on `appendLedgerEntry`, three new cap thresholds (per-day $10 / per-issue $1 / per-PR $2), one bit-flip in `.gitignore` to commit the ledger, two new ESLint blocks restricting `@anthropic-ai/sdk` imports to `llm-driver.js` only, one new `CODEOWNERS` file, and one set of repo-level settings (Allow auto-merge OFF, branch protection ruleset on `main` with bypass-disabled + required-status-check slot reserved for Phase 41).

The single load-bearing risk is **versioned-data ledger corruption** on the flip from gitignored→committed: v3.1's `appendLedgerEntry` does atomic temp-rename writes, but if the first committed ledger entry is malformed the dev's local ledger reads cleanly while CI reads `{months:{}}` (silently bypassing the $100 cap). The fix is the `phase: '39-bootstrap'` first-entry sentinel from `<specifics>` + a Vitest assertion that the committed file matches the v1 schema. The branch protection ruleset config is **not version-controlled** at GitHub's level — it lives in repo Settings — so this phase ships a `docs/v40-repo-config.md` audit reference instead. Per the locked CONTEXT decisions, owner is `@fatduck` (single-maintainer repo, but the actual GitHub login is `tonyrowles` per `git remote get-url origin`; confirm with user before pinning).

**Primary recommendation:** Land code changes (driver + ledger + ESLint + `.gitignore` + first ledger commit) as the atomic Phase 39 commit; ship CODEOWNERS + repo-config doc as a sibling commit; perform manual GitHub UI settings clicks last with `gh api GET` evidence captured in `docs/v40-repo-config.md` for Phase 47's audit. **All locked decisions in CONTEXT.md are non-negotiable; this research expands only the Claude's-discretion areas.**

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **Ledger path:** Existing `tests/e2e/.llm-spend-ledger.json` (per STATE.md decision: "avoids breaking v3.1 local ledger continuity"). Flipped from gitignored to committed.
- **Cap thresholds:** Unified $80 warn / $100 hard-cap per month across BOTH transports (subscription + SDK). Sub-caps: per-day $10, per-issue $1, per-PR $2.
- **SDK pin:** `@anthropic-ai/sdk@0.100.1` EXACT (not caret) — research flagged 30+ minor versions breaking API twice in 2026-Q2.
- **Default model for auto-fix:** `claude-sonnet-4-6` ($3/$15 per Mtok). Reserve `claude-opus-4-7` for Tier-C escalation paths (Phase 45+).
- **CI gate inversion:** `invokeClaudePWithLedger` is local-only (no CI). `invokeAnthropicSdkWithLedger` is the opposite — CI-only OR `--force-api`. Both coexist; transport tag distinguishes ledger entries.
- **ESLint scope for SDK guard:** ONLY `tests/e2e/lib/llm-driver.js` may import `@anthropic-ai/sdk`. All other paths blocked via `no-restricted-imports`.
- **CODEOWNERS pins:** `src/`, `tests/`, `.github/workflows/`, `tests/golden/`, `tests/e2e/test-cases-quarantine.js`. Owner is `@fatduck` (single-maintainer repo).
- **Branch protection scope:** `main` only. Required-status-check SLOT created (the actual verifier-gate workflow doesn't exist until Phase 41 — empty slot reserved here so Phase 41 can populate without touching repo settings).

### Claude's Discretion

- Vitest test file organization (single `llm-ledger.test.js` vs split per-cap files) — keep close to existing v3.1 ledger test conventions
- ESLint rule wording / message format — match existing `no-restricted-imports` rules in the repo
- `combinedMonthlyTotal()` signature — pure function over the ledger; accept the ledger object directly, no I/O
- Phase field validation strictness — additive-only means existing entries without `phase` must still parse; no migration script needed
- Whether to ship branch-protection / CODEOWNERS as a single PR or as a separate "repo-settings" commit alongside the code changes — execute as a single atomic phase commit set
- `--force-api` flag semantics — implement as boolean env var or CLI flag consistent with the existing `--force-llm` v3.1 convention

### Deferred Ideas (OUT OF SCOPE)

- Per-model cost rates table extraction — currently hard-coded in `llm-driver.js`; if Phase 45's multi-class expansion introduces opus tier-C escalation, consider extracting. Not load-bearing for Phase 39.
- Ledger pruning / archival — committed-ledger flip means file grows monotonically; defer to v4.1 if it becomes a git-history concern (`combinedMonthlyTotal()` already filters by current month).
- Repo-settings-as-code (e.g., Terraform / `gh api`-driven config) — manual settings change is acceptable for Phase 39; Phase 47 audit verifies via `gh api` reads.

## Project Constraints (from CLAUDE.md)

CLAUDE.md only contains an instruction about answer verification after `AskUserQuestion` calls (no project-level coding rules). No additional research-side constraints — the file's directive applies only to interactive sessions, not to plan execution.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LEDGER-01 | `tests/e2e/lib/llm-ledger.js` `appendLedgerEntry()` accepts new fields `transport` (`'subscription' \| 'sdk'`) and `phase` (string); existing v3.1 callers continue to work (additive only); Vitest schema-guard validates new fields | `llm-ledger.js:318` `appendLedgerEntry` already spreads `entry` verbatim into `iterations[]` (lines 308–311 comment confirms `phase` is back-compat additive). Adding `transport` is the same pattern — pass through the spread, validate with Vitest. Existing test file `tests/unit/llm-ledger.test.js` already exercises the `phase` back-compat path (cases 18–19). |
| LEDGER-02 | New `combinedMonthlyTotal(ledger)` helper in `llm-ledger.js` sums spend across both transports for the current month; both transports counted against the same $80 warn / $100 hard-cap thresholds; Vitest test exercises the cross-transport accumulation path | `monthlyTotal(ledger, month)` at `llm-ledger.js:157` already reads `ledger.months[month].total_usd` — a single number. Since CONTEXT locks `LEDGER_PATH` to ONE file used by both transports, `total_usd` is ALREADY the combined sum. `combinedMonthlyTotal` becomes a **clarity wrapper** (same signature, same body) that signals "this is the unified-cap reader" — or a richer variant that returns `{combined, by_transport: {subscription, sdk}}` for forensic audit. See Code Examples §`combinedMonthlyTotal`. |
| LEDGER-03 | Per-day ($10), per-issue ($1), per-PR ($2) sub-caps enforced in addition to the monthly cap; `invokeAnthropicSdkWithLedger` and `invokeClaudePWithLedger` refuse a new invocation when any sub-cap is exceeded; Vitest tests cover each sub-cap boundary | Pattern already established by `checkPhaseSpendCap(ledger, phase)` at `llm-ledger.js:248` and `checkSpendCap(ledger, month)` at line 204. Three new functions mirror these: `checkDayCap(ledger, isoDay)`, `checkIssueCap(ledger, issueId)`, `checkPrCap(ledger, prNumber)`. Same `{status: 'ok'\|'warn'\|'block', total_usd, message}` shape. Cap precheck in driver (Step 2 of `invokeClaudePWithLedger`, lines 392–404) gains 3 more guard branches. |
| LEDGER-04 | `tests/e2e/.llm-spend-ledger.json` flipped from gitignored to committed-but-versioned; v40 auto-fix and weekly-digest workflows commit ledger updates atomically with their primary commit using `[skip ci]` (mirrors `e2e-weekly-digest.yml:98-110` pattern) | `.gitignore:19` currently reads `tests/e2e/.llm-spend-ledger.json` (with the comment-block warning at lines 18 explaining the historical privacy decision). Phase 39 deletes lines 18–19 and adds a `phase: '39-bootstrap'` sentinel entry so the first committed file is non-empty. The atomic-commit pattern is `e2e-weekly-digest.yml:98–110` — Phase 40 (not 39) is the consumer; Phase 39 only flips the bit. |
| CLEANUP-04 (initial setup) | Branch protection / CODEOWNERS audit — `Settings → Allow auto-merge: OFF`, branch protection ruleset on `main` with `Do not allow bypassing: ON` + required-status-checks slot, `CODEOWNERS` pins the 5 paths; static-grep test asserts CODEOWNERS contents are pinned. Phase 47 RE-AUDITS; Phase 39 SETS UP. | Three subtasks: (1) `.github/CODEOWNERS` file at canonical GitHub-recognised path; (2) repo-level checkbox `Allow auto-merge: OFF` (UI click — must be documented in `docs/v40-repo-config.md`); (3) branch protection ruleset on `main` via UI or `gh api PUT /repos/:owner/:repo/rulesets` (see State of the Art §). Static-grep Vitest test reads `.github/CODEOWNERS` and asserts each locked path string is present. |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| SDK API transport (`invokeAnthropicSdkWithLedger`) | tests/e2e/lib (impure-but-isolated) | — | Per ARCHITECTURE §6 — `llm-driver.js` is the existing exception lane for subprocess/network. Adding a sibling export keeps the single-entry-point invariant. |
| Ledger schema additions (`transport` + `phase` fields) | tests/e2e/lib (pure) | — | `llm-ledger.js` is the established home; additive-only fields preserve back-compat with v3.1 callers (`scripts/e2e-explore.mjs`, `triage-classifier.js`). |
| Sub-cap helpers (`checkDayCap`, `checkIssueCap`, `checkPrCap`) | tests/e2e/lib (pure) | — | Mirror `checkSpendCap` / `checkPhaseSpendCap` pure-function shape; consumed by both transport wrappers. |
| `combinedMonthlyTotal()` helper | tests/e2e/lib (pure) | — | Pure read over ledger object — no I/O. Naming signals "this is the unified-cap reader." |
| ESLint guard on `@anthropic-ai/sdk` import | eslint.config.js (config) | — | Project-wide static check; follows existing per-file pattern for `pdf-verifier.js` independence rule. |
| Committed ledger file | repo data | — | Single file at canonical v3.1 path; Phase 40 workflows are the consumers. Phase 39 only flips bit + seeds bootstrap entry. |
| `.github/CODEOWNERS` | repo config | — | GitHub-canonical location; consumed by branch protection rule "Require review from Code Owners". |
| Branch protection ruleset | GitHub repo settings | docs/v40-repo-config.md (audit trail) | Settings live outside repo; doc captures `gh api` snapshot for Phase 47 audit. |
| `Allow auto-merge: OFF` repo setting | GitHub repo settings | docs/v40-repo-config.md | Same as above — UI-only setting, audit-via-doc. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@anthropic-ai/sdk` | **0.100.1 EXACT** | TypeScript SDK for Anthropic API direct calls in CI (the new `invokeAnthropicSdkWithLedger` transport) | [VERIFIED: npm registry + slopcheck OK] Official Anthropic SDK. v3.1's milestone research already locked this exact pin; npm registry confirms 0.100.1 is current latest (published 2026-05-29). Slopcheck `[OK]` verdict. Pin EXACT (not caret) — STACK.md §1 documents 30+ minor versions in 2026-Q2 with two breaking API changes. |
| Existing `tests/e2e/lib/llm-ledger.js` | (in-repo, no version) | Ledger primitives extended additively | [VERIFIED: direct code inspection] `appendLedgerEntry` at line 318 already spreads arbitrary fields. Schema is forward-compatible. |
| Existing `tests/e2e/lib/llm-driver.js` | (in-repo, no version) | Driver module gains sibling export | [VERIFIED: direct code inspection] `invokeClaudePWithLedger` at line 375 is the pattern to clone. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Existing `vitest` | `^3.0.0` (devDep, package.json:39) | Unit-test framework for the new caps + schema-guard tests | All new tests go in `tests/unit/llm-ledger.test.js` + `tests/unit/llm-driver.test.js` (extend existing files, do not create new ones — established convention). |
| Existing `eslint` | `10.4.0` (devDep, package.json:36) | Flat-config rule additions | Add 1 new block to `eslint.config.js` for `@anthropic-ai/sdk` restriction. Per-file scoping convention (see Code Examples). |
| `gh` CLI | 2.x (pre-installed) | Repo settings API for audit step + manual setup | `gh api GET /repos/:owner/:repo/rulesets`, `gh api GET /repos/:owner/:repo` — snapshot captured into `docs/v40-repo-config.md`. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `claude-sonnet-4-6` as default | `claude-opus-4-7` | Opus is 1.7× cost; locked by CONTEXT to Sonnet for v4.0. Opus reserved for Tier-C escalations starting Phase 45+. |
| Hard-coded pricing constants in `llm-driver.js` | Extract per-model rates table (e.g. into `llm-pricing.js`) | DEFERRED per CONTEXT. `llm-pricing.js` already exists for fallback math; extending it is a 3-line change but adds coupling. CONTEXT locks "hard-coded in driver"; Phase 45 may revisit. |
| Roll-your-own `combinedMonthlyTotal` | Reuse `monthlyTotal` directly | Same single-ledger semantics, but the new name signals intent and provides a hook for the future "expose `by_transport: {...}` breakdown" use case. Worth the wrapper. |
| `gh api`-driven branch protection config (script in repo) | Manual UI clicks | DEFERRED per CONTEXT — Phase 39 ships manual setup + doc. Phase 47 audits via `gh api` reads. Repo-settings-as-code may land in v4.1. |

**Installation:**

```bash
npm install -D @anthropic-ai/sdk@0.100.1
```

**Version verification:** Confirmed against npm registry on 2026-05-30:
- `npm view @anthropic-ai/sdk version` → `0.100.1` ✅
- `npm view @anthropic-ai/sdk repository.url` → `git+https://github.com/anthropics/anthropic-sdk-typescript.git` ✅ (official Anthropic repo)
- `npm view @anthropic-ai/sdk@0.100.1 scripts.postinstall` → (empty — no postinstall script) ✅
- slopcheck → `[OK]` ✅

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `@anthropic-ai/sdk` | npm | 1 day (0.100.1 published 2026-05-29) | high (official Anthropic SDK) | github.com/anthropics/anthropic-sdk-typescript | [OK] | **Approved** — package verified via slopcheck against npm registry; repo is the official Anthropic GitHub org; no `postinstall` script. Pin EXACT to `0.100.1` per CONTEXT lock (NOT caret). |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

*slopcheck ran successfully at research time (`/home/fatduck/.local/bin/slopcheck` found and exercised against `@anthropic-ai/sdk` — verdict `[OK] 1 OK`). Auto-installed package was uninstalled to keep working tree clean; planner will reinstall as part of the Phase 39 tasks.*

## Architecture Patterns

### System Architecture Diagram

```
                       ┌──────────────────────────────────────┐
                       │   tests/e2e/.llm-spend-ledger.json   │
                       │   (single file, committed in Phase 39 │
                       │    once .gitignore line is removed)   │
                       └─────────────▲─────────▲──────────────┘
                                     │ append  │ read
                                     │         │
              ┌──────────────────────┼─────────┼─────────────────────┐
              │           tests/e2e/lib/llm-ledger.js                │
              │  appendLedgerEntry({transport, phase, ...})  ←──┐   │
              │  readLedger() → ledger                        │   │
              │  combinedMonthlyTotal(ledger)  [NEW]          │   │
              │  checkSpendCap(ledger)   monthly $80/$100    │   │
              │  checkDayCap(ledger, isoDay)   day $10    [NEW]   │
              │  checkIssueCap(ledger, issueId) issue $1  [NEW]   │
              │  checkPrCap(ledger, prNum)     PR $2      [NEW]   │
              └──────────────▲────────────────────────────────▲───┘
                             │ wraps                          │ wraps
                             │                                │
              ┌──────────────┴───────────────────────┐  ┌─────┴─────────────────┐
              │  invokeClaudePWithLedger             │  │ invokeAnthropicSdk    │
              │  (subscription transport, v3.1)      │  │ WithLedger     [NEW]  │
              │                                      │  │                       │
              │  Step 1: refuse if CI=true ──────────│  │ Step 1: refuse        │
              │          (subscription invariant)    │  │  if NOT CI &&         │
              │  Step 2: caps precheck (monthly,     │  │  NOT --force-api      │
              │          phase, +3 NEW: day/issue/PR)│  │  (INVERSE gate)       │
              │  Step 3: spawn('claude', ...)        │  │ Step 2: same caps     │
              │  Step 4-6: parse + ledger append +   │  │ Step 3: client        │
              │          return (transport='sub-     │  │  .messages.create     │
              │          scription' tag NEW)         │  │ Step 4-6: same +      │
              │                                      │  │  transport='sdk' tag  │
              └──────────────────────────────────────┘  └───────────────────────┘
                             ▲                                ▲
                             │ existing callers               │ NEW callers (Phase 42+)
                  ┌──────────┴─────────────┐         ┌────────┴─────────────────┐
                  │ triage-classifier.js   │         │ auto-fix.mjs (Phase 42)  │
                  │ e2e-explore.mjs        │         │ (any CI script needing   │
                  │ (unchanged in P39)     │         │  the SDK transport)      │
                  └────────────────────────┘         └──────────────────────────┘

           ┌──── ESLint guard (eslint.config.js) ─────────────────────────────┐
           │  Block `@anthropic-ai/sdk` import EVERYWHERE except               │
           │  tests/e2e/lib/llm-driver.js  → enforces single entry point      │
           └──────────────────────────────────────────────────────────────────┘

           ┌──── .github/CODEOWNERS ─────────────────────────────────────────┐
           │  /src/          @fatduck                                         │
           │  /tests/        @fatduck                                         │
           │  /.github/workflows/  @fatduck                                   │
           │  /tests/golden/       @fatduck                                   │
           │  /tests/e2e/test-cases-quarantine.js  @fatduck                  │
           └──────────────────────────────────────────────────────────────────┘

           ┌──── GitHub repo Settings (NOT in repo — manual UI clicks) ──────┐
           │  Settings → Allow auto-merge: OFF                                │
           │  Rulesets → main branch ruleset:                                 │
           │    - Do not allow bypassing: ON                                  │
           │    - Required status checks: <slot — Phase 41 populates>         │
           │    - Require review from CODEOWNERS: ON                          │
           │  Audit snapshot lives in docs/v40-repo-config.md                 │
           └──────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure (deltas only)

```
tests/e2e/
├── .llm-spend-ledger.json     ← FLIPPED: committed (was gitignored)
└── lib/
    ├── llm-driver.js          ← EXTEND: add invokeAnthropicSdkWithLedger
    └── llm-ledger.js          ← EXTEND: add combinedMonthlyTotal, checkDayCap,
                                          checkIssueCap, checkPrCap, transport field

tests/unit/
├── llm-driver.test.js         ← EXTEND: SDK transport cases + inverse CI gate
└── llm-ledger.test.js         ← EXTEND: sub-caps + transport field + combinedMonthlyTotal

eslint.config.js               ← EXTEND: 1 new block restricting @anthropic-ai/sdk

.github/
├── CODEOWNERS                 ← NEW (canonical GitHub location)
└── workflows/                  ← unchanged in Phase 39 (Phase 40+ consume)

docs/
└── v40-repo-config.md         ← NEW (manual UI settings audit reference)

.gitignore                     ← DELETE lines 18-19 (ledger-gitignore + comment)

package.json                   ← ADD devDep: @anthropic-ai/sdk: "0.100.1" EXACT
```

### Pattern 1: Sibling Export with Inverse CI Gate

**What:** Add `invokeAnthropicSdkWithLedger` to `llm-driver.js` as a peer to `invokeClaudePWithLedger`. Inverse CI gate: SDK runs ONLY when `CI=true || --force-api`. Both wrappers share `LEDGER_PATH` and the cap-precheck primitives.

**When to use:** Phase 42+ auto-fix scripts will pass `transport='sdk'` (in CI) or `transport='subscription'` (locally via Phase 46's `npm run fix-issue`).

**Why this shape:** Per Pitfall 8 in research/PITFALLS.md, the v3.1 CI guard at `llm-driver.js:384` is load-bearing for `scripts/e2e-explore.mjs` and the triage classifier. Removing or weakening it breaks v3.1 invariants. A SIBLING export with the OPPOSITE gate preserves both invariants.

**Example:**

```js
// tests/e2e/lib/llm-driver.js (NEW export, sibling of invokeClaudePWithLedger)
// Source: pattern derived from llm-driver.js:375 (existing invokeClaudePWithLedger)
//         + STACK.md §1 (minimal SDK setup) + ARCHITECTURE.md §3.1

import Anthropic from '@anthropic-ai/sdk';  // ← only this file imports the SDK

// (Reuse existing LEDGER_PATH, readLedger, checkSpendCap, appendLedgerEntry)
import {
  LEDGER_PATH, readLedger, appendLedgerEntry,
  checkSpendCap, checkPhaseSpendCap,
  checkDayCap, checkIssueCap, checkPrCap,   // ← NEW helpers from Phase 39
} from './llm-ledger.js';

/**
 * SDK transport — INVERSE CI gate compared with invokeClaudePWithLedger.
 *   - Refuses to run if NOT in CI AND --force-api not set
 *   - Refuses to run if ANY of: monthly cap, day cap, issue cap, PR cap blocks
 *   - Uses appendLedgerEntry with transport: 'sdk' + phase tag
 */
export async function invokeAnthropicSdkWithLedger({
  systemPrompt,
  userPrompt,
  model = 'claude-sonnet-4-6',  // CONTEXT-locked default
  maxTokens = 4096,
  timeoutMs = 120_000,           // 2 min for code-fix prompts (STACK.md §1)
  phase,
  issueId,                       // e.g., 'issue-123' — for per-issue cap
  prNumber,                      // e.g., 456 — for per-PR cap
  forceApi = false,              // local --force-api override
} = {}) {
  const inCi = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';

  // Step 1 — INVERSE CI gate (refuse local invocations without --force-api)
  if (!inCi && !forceApi) {
    return {
      ok: false,
      ciGate: true,
      message:
        'invokeAnthropicSdkWithLedger refused: not in CI and --force-api not set. ' +
        'Use invokeClaudePWithLedger for local subscription path.',
    };
  }

  // Step 2 — Cap prechecks (4 caps now)
  const ledger = readLedger(LEDGER_PATH);
  const monthly = checkSpendCap(ledger);
  const day = checkDayCap(ledger);
  const issue = issueId ? checkIssueCap(ledger, issueId) : { status: 'ok' };
  const pr = prNumber ? checkPrCap(ledger, prNumber) : { status: 'ok' };
  const phaseCap = phase ? checkPhaseSpendCap(ledger, phase) : { status: 'ok' };

  if (
    monthly.status === 'block' || day.status === 'block' ||
    issue.status === 'block' || pr.status === 'block' || phaseCap.status === 'block'
  ) {
    return { ok: false, capBlocked: true, monthly, day, issue, pr, phaseCap };
  }

  // Step 3 — SDK call
  const client = new Anthropic({ maxRetries: 2, timeout: timeoutMs });
  let response;
  try {
    response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });
  } catch (err) {
    // Record failed call with zero cost (Pitfall 8: even errors might cost money,
    // but the SDK throws before extracting usage; record zero and move on).
    appendLedgerEntry(LEDGER_PATH, {
      iso: new Date().toISOString(),
      model,
      cost_usd: 0,
      tokens_in: 0,
      tokens_out: 0,
      phase,
      transport: 'sdk',
      issueId,
      prNumber,
      source: 'auto-fix-api',
      error: String(err?.message ?? err).slice(0, 200),
    });
    return { ok: false, errorReason: 'sdk_error', errorMessage: String(err?.message ?? err) };
  }

  // Step 4 — Compute cost from usage (no total_cost_usd on the SDK path)
  // Uses fallbackCostUsd from llm-pricing.js per the existing pattern.
  const inputTokens = response.usage?.input_tokens ?? 0;
  const outputTokens = response.usage?.output_tokens ?? 0;
  const costUsd = fallbackCostUsd(response.model, inputTokens, outputTokens);

  // Step 5 — Append (ALWAYS, mirrors invokeClaudePWithLedger Pitfall 8 discipline)
  appendLedgerEntry(LEDGER_PATH, {
    iso: new Date().toISOString(),
    model: response.model,
    cost_usd: costUsd,
    tokens_in: inputTokens,
    tokens_out: outputTokens,
    cache_creation_tokens: response.usage?.cache_creation_input_tokens ?? 0,
    cache_read_tokens: response.usage?.cache_read_input_tokens ?? 0,
    phase,
    transport: 'sdk',
    issueId,
    prNumber,
    source: 'auto-fix-api',
  });

  // Step 6 — Return
  const llmText =
    response.content?.[0]?.type === 'text' ? response.content[0].text : '';
  return {
    ok: true,
    llmText,
    modelId: response.model,
    costUsd,
    rawJson: response,
  };
}
```

### Pattern 2: Pure-Function Sub-Cap Helpers

**What:** Three new helpers in `llm-ledger.js` matching the existing `checkSpendCap` / `checkPhaseSpendCap` shape.

**When to use:** Driver pre-flight (Step 2 above). Each helper is a single-purpose read over the ledger; no I/O.

**Example:**

```js
// tests/e2e/lib/llm-ledger.js (NEW exports)

/** Per-day hard cap: $10 (CONTEXT.md locked). */
export const DAY_HARD_CAP_USD = 10;

/** Per-issue hard cap: $1 (CONTEXT.md locked). */
export const ISSUE_HARD_CAP_USD = 1;

/** Per-PR hard cap: $2 (CONTEXT.md locked). */
export const PR_HARD_CAP_USD = 2;

/**
 * @returns {string} the current ISO day as "YYYY-MM-DD" (UTC).
 */
export function currentIsoDay() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Sum cost_usd of entries whose iso starts with the given day.
 * Filters non-finite entries (mirrors phaseTotal defensive pattern at line 186).
 */
export function dayTotal(ledger, isoDay = currentIsoDay()) {
  const months = ledger?.months;
  if (!months || typeof months !== 'object') return 0;
  let sum = 0;
  for (const bucket of Object.values(months)) {
    const iterations = bucket?.iterations;
    if (!Array.isArray(iterations)) continue;
    for (const it of iterations) {
      if (it && typeof it.iso === 'string' && it.iso.startsWith(isoDay)
          && Number.isFinite(it.cost_usd)) {
        sum += it.cost_usd;
      }
    }
  }
  return +sum.toFixed(6);
}

export function checkDayCap(ledger, isoDay = currentIsoDay()) {
  const total = dayTotal(ledger, isoDay);
  if (total >= DAY_HARD_CAP_USD) {
    return {
      status: 'block', day_total_usd: total, iso_day: isoDay,
      message:
        `Day ${isoDay} LLM spend $${total.toFixed(2)} >= $${DAY_HARD_CAP_USD.toFixed(2)}. ` +
        `Refusing further invocations until next UTC day.`,
    };
  }
  return { status: 'ok', day_total_usd: total, iso_day: isoDay, message: '' };
}

// issueTotal + checkIssueCap follow the same shape, filtering on it.issueId
// prTotal + checkPrCap follow the same shape, filtering on it.prNumber
```

### Pattern 3: Combined-Monthly-Total Helper

**What:** Thin wrapper over `monthlyTotal` that signals "this number is the unified cap target." Optionally exposes a `by_transport` breakdown for forensic greps.

**Why:** Since `LEDGER_PATH` is unified, `monthlyTotal` already returns the combined sum. But CONTEXT mandates a named helper so future readers don't ask "where's the combined check?" The wrapper also gives a single place to expand if the schema ever splits.

**Example:**

```js
// tests/e2e/lib/llm-ledger.js (NEW)
/**
 * Combined cross-transport monthly total. Since LEDGER_PATH is unified across
 * subscription + sdk transports (Phase 39 design constraint), this is presently
 * identical to monthlyTotal(). The wrapper exists to (a) signal cap-check intent
 * to readers and (b) reserve a hook for future per-transport breakdown.
 */
export function combinedMonthlyTotal(ledger, month = currentMonth()) {
  return monthlyTotal(ledger, month);
}

/**
 * Optional richer view: { combined, by_transport: { subscription, sdk, unknown } }.
 * Walks iterations[] and partitions by entry.transport (default 'subscription'
 * for back-compat with pre-Phase-39 entries without the field).
 */
export function combinedMonthlyTotalByTransport(ledger, month = currentMonth()) {
  const bucket = ledger?.months?.[month];
  const out = { combined: bucket?.total_usd ?? 0, by_transport: { subscription: 0, sdk: 0, unknown: 0 } };
  for (const it of bucket?.iterations ?? []) {
    if (!Number.isFinite(it?.cost_usd)) continue;
    const key = it.transport === 'sdk' ? 'sdk' : it.transport === 'subscription' ? 'subscription' : 'unknown';
    out.by_transport[key] += it.cost_usd;
  }
  for (const k of Object.keys(out.by_transport)) {
    out.by_transport[k] = +out.by_transport[k].toFixed(6);
  }
  return out;
}
```

### Pattern 4: ESLint Restricted-Imports Block (per-file scoping)

**What:** Add a new block to `eslint.config.js` that restricts `@anthropic-ai/sdk` everywhere EXCEPT `tests/e2e/lib/llm-driver.js`.

**When to use:** Single-entry-point invariant. Pattern mirrors existing `pdf-verifier.js` independence rule (lines 50–71) — see `eslint.config.js`.

**Example:**

```js
// eslint.config.js — APPEND new block (4th block, alongside existing 3)
// Source: ARCHITECTURE.md §6 ESLint guard rule #1; mirrors existing per-file block pattern
{
  files: ['**/*.{js,mjs}'],
  ignores: ['tests/e2e/lib/llm-driver.js'],  // ONLY the driver may import
  rules: {
    'no-restricted-imports': ['error', {
      paths: [{
        name: '@anthropic-ai/sdk',
        message:
          'Import via invokeAnthropicSdkWithLedger from tests/e2e/lib/llm-driver.js. ' +
          'Direct @anthropic-ai/sdk imports forbidden — mirrors the v3.1 ' +
          'invokeClaudeP CI-gate invariant. See ' +
          '.planning/phases/39-sdk-driver-ledger-v2-branch-protection-wave-0/39-RESEARCH.md.',
      }],
    }],
  },
},
```

**IMPORTANT:** This uses `paths` (not `patterns.group`) because we're restricting a specific package name, not a directory tree. Mirrors the `triage-classifier.js` block at `eslint.config.js:122-148` which uses `paths` with `importNames` for a similar named-export restriction.

### Pattern 5: Vitest tmpDir-per-test for cap boundary tests

**What:** Each new cap test creates a temp ledger via `fs.mkdtempSync`, seeds it with synthetic entries, asserts `checkXxxCap` returns the expected status.

**When to use:** All new tests in `tests/unit/llm-ledger.test.js`. Mirrors existing test setup at `tests/unit/llm-ledger.test.js:80-87` (tmpDir/ledgerPath beforeEach + afterEach cleanup).

**Example:**

```js
// tests/unit/llm-ledger.test.js (APPENDED — extend existing file)
describe('checkDayCap (Phase 39 LEDGER-03)', () => {
  it('returns ok when day total is below $10', () => {
    appendLedgerEntry(ledgerPath, makeEntry({ cost_usd: 5.0, iso: '2026-05-30T10:00:00Z' }));
    const result = checkDayCap(readLedger(ledgerPath), '2026-05-30');
    expect(result.status).toBe('ok');
    expect(result.day_total_usd).toBe(5.0);
  });

  it('blocks at exactly $10.00 (inclusive)', () => {
    appendLedgerEntry(ledgerPath, makeEntry({ cost_usd: 10.0, iso: '2026-05-30T10:00:00Z' }));
    const result = checkDayCap(readLedger(ledgerPath), '2026-05-30');
    expect(result.status).toBe('block');
    expect(result.day_total_usd).toBe(10.0);
  });

  it('only counts entries within the requested day (UTC boundary)', () => {
    appendLedgerEntry(ledgerPath, makeEntry({ cost_usd: 5.0, iso: '2026-05-29T23:59:00Z' }));
    appendLedgerEntry(ledgerPath, makeEntry({ cost_usd: 5.0, iso: '2026-05-30T00:00:00Z' }));
    expect(checkDayCap(readLedger(ledgerPath), '2026-05-30').day_total_usd).toBe(5.0);
  });
});
```

### Pattern 6: CODEOWNERS file format (GitHub canonical)

**What:** Plain text file at `.github/CODEOWNERS` (other recognized locations: repo root, `docs/CODEOWNERS`). Pattern: `<glob> <owner1> <owner2>`. Last-matching rule wins.

**When to use:** Once, this phase.

**Example:**

```
# .github/CODEOWNERS
# Phase 39 (CLEANUP-04 initial setup) — single-maintainer pins for v4.0 trust invariants.
# Phase 47 (CLEANUP-04 audit) re-verifies these are present and unchanged.
#
# Last-matching-rule semantics: more specific paths must appear AFTER broader ones.
# See https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-security/customizing-your-repository/about-code-owners

/src/                                       @fatduck
/tests/                                     @fatduck
/.github/workflows/                         @fatduck
/tests/golden/                              @fatduck
/tests/e2e/test-cases-quarantine.js         @fatduck
```

**Owner username clarification:** CONTEXT locks `@fatduck` as the owner. The `git remote get-url origin` for this repo resolves to `https://github.com/tonyrowles/patent-cite-tool.git`, and STATE.md / RETROSPECTIVE.md user fields reference `@TR`. **Verify with user before committing:** is the GitHub login `fatduck`, `tonyrowles`, or `TR`? CODEOWNERS uses GitHub login names exactly (case-insensitive); an unrecognised username silently fails the "Require review from Code Owners" branch protection check. (See Open Questions §1.)

### Anti-Patterns to Avoid

- **Deleting v3.1's CI guard on `invokeClaudePWithLedger` instead of adding a sibling.** This is Pitfall 8 in `.planning/research/PITFALLS.md`. The guard at `llm-driver.js:384-390` protects `scripts/e2e-explore.mjs` from accidentally invoking the local subscription in CI; removing it silently re-enables that failure mode.
- **Using a glob (`{pdf-verifier,llm-driver}.js`) for ESLint per-file blocks.** Existing convention (`eslint.config.js:77`) is to clone per-file blocks EXACTLY. Per-file scoping keeps each independence-claim audit story readable.
- **Caret-pinning `@anthropic-ai/sdk` (e.g., `^0.100.1`).** CONTEXT locks EXACT. STACK.md §1 documents that 30+ minor versions broke API twice in 2026-Q2.
- **Putting CODEOWNERS at repo root when GitHub already finds `.github/CODEOWNERS`.** GitHub searches 3 locations in order: `.github/CODEOWNERS`, `CODEOWNERS`, `docs/CODEOWNERS`. The `.github/` location is the canonical convention; do NOT split or duplicate.
- **Auto-merging the bootstrap ledger commit.** The bootstrap entry's commit is the FIRST committed-ledger commit. If it's auto-merged before the branch protection ruleset is in place, an attacker could mutate it. Land the ledger flip AFTER the ruleset is configured, in the same atomic phase commit set.
- **Forgetting the `Do not allow bypassing` checkbox in the ruleset.** Per Pitfall 4 — without this, repo admins can merge ANY auto-fix PR bypassing CODEOWNERS and the verifier gate. Single most common foot-gun in branch protection.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP client to Anthropic API | Custom `fetch` wrapper with manual retry/backoff | `@anthropic-ai/sdk@0.100.1` | Built-in `maxRetries: 2` exponential backoff, streaming support (unused here but available), prompt-caching `cache_control` blocks, automatic 429/5xx handling, typed responses. |
| Atomic JSON file write (temp + rename) for ledger | Re-implement file locking | Reuse existing `appendLedgerEntry` at `llm-ledger.js:318` | Already does temp-rename atomic write with EXDEV fallback (lines 339–369). v3.1 hardened (WR-04, WR-06). |
| Float-drift-safe USD addition | Re-derive 6dp rounding | Reuse the `+(x).toFixed(6)` pattern from `appendLedgerEntry:335` and `phaseTotal:191` | Established repo convention. Documented in `llm-ledger.js:34`. |
| Cap-check shape (status/total/message) | Invent new return shapes per cap | Mirror `checkSpendCap` / `checkPhaseSpendCap` shape | Driver Step 2 already branches on `{status: 'block'\|'warn'\|'ok'}`. Same shape = same control-flow code. |
| Branch protection config | Build a Terraform module / `gh api`-driven script | Manual UI + `docs/v40-repo-config.md` audit doc | CONTEXT defers repo-settings-as-code to v4.1. Manual UI + doc is the v4.0 baseline. |
| Cost-from-usage math for SDK responses | Implement per-token math | Reuse `fallbackCostUsd(modelId, inputTokens, outputTokens)` from `llm-pricing.js:52` | Already handles non-finite inputs and 6dp rounding. PRICING_BY_MODEL frozen const at `llm-pricing.js:36` already includes Sonnet 4.6 (`claude-sonnet-4-5` entry — verify naming after first SDK call returns `response.model`). |

**Key insight:** Phase 39 is mechanical extension of v3.1 primitives, not new design. The temptation will be to "improve" the ledger module or refactor `llm-driver.js`. Resist — every new function should clone an existing one. The only NEW dependency is `@anthropic-ai/sdk`. Everything else is +20 LOC inside files that already exist.

## Runtime State Inventory

Phase 39 is mostly greenfield (new code in existing files + repo settings), but it DOES include a state-flip (gitignored → committed ledger) and OS-registered state (GitHub repo settings). Per the rename/refactor protocol:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | The local `tests/e2e/.llm-spend-ledger.json` on the developer's machine may already exist with v3.1 entries (no `transport` or `phase: '40-auto-fix'` fields). | **None for Phase 39 schema** — additive-only design means existing entries parse fine. **One-time housekeeping:** the developer may want to seed the first committed file with the bootstrap entry rather than the full local history (which contains the dev's private spend pattern). Decision in Open Questions §2. |
| Live service config | GitHub repo settings: `Allow auto-merge` checkbox + branch protection ruleset on `main`. These live in GitHub's Settings UI, NOT in git. | **Manual UI clicks required.** Capture `gh api GET /repos/:owner/:repo/rulesets` and `gh api GET /repos/:owner/:repo` (look for `allow_auto_merge`) into `docs/v40-repo-config.md`. Phase 47 audits via the same `gh api` calls. |
| OS-registered state | None for Phase 39. No cron entries, no service registrations, no scheduled tasks. | None. |
| Secrets / env vars | `ANTHROPIC_API_KEY` repo secret must be added to GitHub repo Settings → Secrets and variables → Actions BEFORE Phase 42 first invokes the SDK transport in CI. Phase 39 does NOT require it (no CI workflow runs `invokeAnthropicSdkWithLedger` yet — Phase 40+ does), but documenting it now is cheap. | **Document the requirement in `docs/v40-repo-config.md`** with the rotation policy hint (90 days per PITFALLS.md security mistakes table). Phase 39 does NOT add the secret. |
| Build artifacts | `node_modules/@anthropic-ai/sdk/` after `npm install`. The slopcheck run during research already exercised install; the local working tree was rolled back. | **None** — fresh `npm install` will pull `0.100.1` once `package.json` is updated. No stale state to clean. |

## Common Pitfalls

### Pitfall 1: First committed ledger entry corrupts the file silently

**What goes wrong:** The bootstrap entry must conform to v1 schema (`{version: 1, months: {YYYY-MM: {invocations, total_usd, last_invocation_iso, iterations: []}}}`). If it's malformed JSON or missing `version`, `readLedger` catches the parse error and returns `{version: 1, months: {}}` — i.e., the cap calculations silently show $0 spend. Both transports proceed to invoke past the cap.

**Why it happens:** It's the first committed ledger ever; there's no precedent to copy. Easy to hand-write malformed JSON.

**How to avoid:** Seed the bootstrap entry by CALLING `appendLedgerEntry({iso, model, cost_usd: 0, phase: '39-bootstrap', transport: 'sdk', source: 'phase-39-flip'})` in a one-shot Node script during the phase commit. The function's own logic produces a guaranteed-valid file. Vitest assertion: `expect(JSON.parse(readFileSync('tests/e2e/.llm-spend-ledger.json')).version).toBe(1)`.

**Warning signs:** `readLedger` returns `{months: {}}` after Phase 39 lands. A `git diff` of the file shows the entry but tests pass because `monthlyTotal` returns 0.

### Pitfall 2: SDK pricing constants out-of-sync with model name in response

**What goes wrong:** `client.messages.create({model: 'claude-sonnet-4-6'})` may return `response.model` as `'claude-sonnet-4-6-2026XXXX'` (Anthropic appends release date suffixes for some endpoints). `fallbackCostUsd(response.model, ...)` then falls through to the `default` Opus pricing → over-counts cost by 5×.

**Why it happens:** STACK.md §1 verifies the 1M-context variant returns suffix `[1m]`, but the SDK path may return a different format. The `PRICING_BY_MODEL` map at `llm-pricing.js:36` only has 4 keys today; `claude-sonnet-4-6` is NOT among them (it has `claude-sonnet-4-5`).

**How to avoid:** **First-call calibration test** in `tests/unit/llm-driver.test.js`: mock a successful `messages.create` response with `model: 'claude-sonnet-4-6'` and assert `fallbackCostUsd` returns non-default (i.e., the map has the key). If it fails, plan must add `claude-sonnet-4-6` to `PRICING_BY_MODEL` in the same phase commit set. This is a Claude's-discretion area (extraction is deferred per CONTEXT) — the minimum change is one line in the existing frozen map.

**Warning signs:** Ledger entries show `cost_usd` 5× expected; weekly digest spending alarms fire on test runs.

### Pitfall 3: ESLint flat-config order matters — restriction block masked by earlier broad block

**What goes wrong:** ESLint flat-config MERGES rules from blocks that match the same file in array order. If the new `@anthropic-ai/sdk` restriction block is placed BEFORE the existing per-file blocks that already declare `no-restricted-imports: ['error', ...]`, the existing rules silently win on those files (per `eslint.config.js:13-16` documentation).

**Why it happens:** Flat-config semantics: each matching block's `rules` are MERGED, but for the same rule key the LATER block wins (full replacement, not deep-merge). Placing the new block at the end is the safe choice.

**How to avoid:** APPEND the new block to the end of the array (after the triage-classifier block at line 148). Add a Vitest test that lints a fake-file with a forbidden import and asserts the error fires. See Code Examples §Pattern 4.

**Warning signs:** `npm run lint` passes on a file that imports `@anthropic-ai/sdk` outside `llm-driver.js`. Phase 47 audit catches this.

### Pitfall 4: CODEOWNERS username mismatch silently disables protection

**What goes wrong:** CODEOWNERS uses GitHub login names. If the file says `@fatduck` but the actual repo owner login is `@tonyrowles`, the "Require review from Code Owners" branch protection check passes (no required reviewer exists). Auto-fix PRs merge without CODEOWNERS gating.

**Why it happens:** The username in CONTEXT is `fatduck`; STATE.md / RETROSPECTIVE.md mention `@TR`; `git remote get-url origin` resolves to `github.com/tonyrowles/...`. Three different strings refer to the same person but only ONE is the actual GitHub login.

**How to avoid:** **Before committing CODEOWNERS, confirm the actual GitHub login** via `gh api user --jq .login` (run as the maintainer). The file's owner string must EXACTLY match this. Add a GitHub-side validation step (CODEOWNERS errors appear in the repo Insights → Community Standards pane). See Open Questions §1.

**Warning signs:** A PR that should require CODEOWNERS review can be merged without review. GitHub shows no review-required check on PRs touching `/src/`.

### Pitfall 5: Branch protection "required status check" must NOT be the new verifier workflow until Phase 41

**What goes wrong:** Phase 39 reserves the slot. If the ruleset is configured with a required check called `verifier-gate` BEFORE Phase 41's workflow exists, EVERY PR is blocked (no matching check ever passes). This includes Phase 39's own PR if shipped via PR.

**Why it happens:** Easy to over-configure during initial setup ("might as well wire it up now").

**How to avoid:** Phase 39 ships the ruleset with the required-status-check **list empty** (or with a placeholder check name that the user adds AS the Phase 41 workflow is registered). Document the slot reservation in `docs/v40-repo-config.md`. Phase 41 adds the actual check name as a same-phase config edit.

**Warning signs:** Every PR shows "Required status check `verifier-gate` is expected" with no matching check. Phase 39's own PR cannot merge.

### Pitfall 6: `Do not allow bypassing` interacts with single-maintainer commits to main

**What goes wrong:** With `Do not allow bypassing: ON` on `main`, ALL pushes to main must go through PRs — including the maintainer's own pushes. Single-maintainer repos that have been "push directly to main" historically suddenly require PR-and-self-approve workflow, which GitHub forbids (you can't approve your own PR).

**Why it happens:** Hardening trust invariants conflicts with single-maintainer operational habits.

**How to avoid:** Verify the maintainer is OK switching to PR-first workflow before turning on `Do not allow bypassing`. GitHub does permit "Bypass list" with specific principals — but CONTEXT locks bypass to OFF. If self-approve is needed, the bypass-list must include the maintainer (which weakens the invariant). Document the operational tradeoff in `docs/v40-repo-config.md`. See Open Questions §3.

**Warning signs:** Phase 40+ commits begin to require PR-flow that wasn't there before. Maintainer hits "you cannot approve your own PR" error.

## Code Examples

Verified patterns from existing repo code:

### Existing: `invokeClaudePWithLedger` (the pattern to clone)

```js
// tests/e2e/lib/llm-driver.js:375-444 (existing v3.1 wrapper)
// Source: direct code inspection 2026-05-30
export async function invokeClaudePWithLedger({
  systemPrompt, userPrompt, timeoutMs = LLM_TIMEOUT_MS, phase, source,
} = {}) {
  // Step 1 — CI gate (refuse if CI=true)
  if (process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true') {
    return { ok: false, ciGate: true, message: '...' };
  }
  // Step 2 — Cap prechecks
  const ledger = readLedger(LEDGER_PATH);
  const monthly = checkSpendCap(ledger);
  const phaseCap = phase ? checkPhaseSpendCap(ledger, phase) : { status: 'ok' };
  if (monthly.status === 'block' || phaseCap.status === 'block') {
    return { ok: false, capBlocked: true, monthly, phaseCap };
  }
  // Step 3 — Invoke
  const claudeResult = await invokeClaudeP({ systemPrompt, userPrompt, timeoutMs });
  const parsed = parseClaudeResponse(claudeResult);
  // Step 4 — Cost
  const costUsd = parsed.costUsd ?? 0;
  const modelId = parsed.modelId ?? 'unknown';
  // Step 5 — ALWAYS append (Pitfall 8)
  appendLedgerEntry(LEDGER_PATH, {
    iso: new Date().toISOString(), model: modelId, cost_usd: costUsd,
    tokens_in: parsed.rawJson?.usage?.input_tokens ?? 0,
    tokens_out: parsed.rawJson?.usage?.output_tokens ?? 0,
    phase, source,
  });
  // Step 6 — Return
  if (parsed.ok) return { ok: true, llmText: parsed.llmText, modelId, costUsd, rawJson: parsed.rawJson ?? null };
  return { ok: false, errorReason: parsed.errorReason, llmText: null, modelId, costUsd, rawJson: parsed.rawJson ?? null };
}
```

Phase 39's `invokeAnthropicSdkWithLedger` (Pattern 1 above) is a 1:1 structural clone with:
- Step 1: INVERSE gate (refuse if NOT CI && NOT --force-api)
- Step 2: SAME shape + 3 NEW cap checks (day, issue, PR)
- Step 3: `client.messages.create` instead of `spawn('claude')`
- Step 4: `fallbackCostUsd(model, in_tokens, out_tokens)` instead of `parsed.costUsd`
- Step 5: SAME append discipline + `transport: 'sdk'` tag
- Step 6: SAME return shape

### Existing: Sub-cap precedent (`checkPhaseSpendCap`)

```js
// tests/e2e/lib/llm-ledger.js:248-276 (existing v3.1 phase-cap helper)
// Source: direct code inspection 2026-05-30
export function checkPhaseSpendCap(ledger, phase) {
  const total = phaseTotal(ledger, phase);
  if (total >= PHASE_HARD_CAP_USD) {
    return {
      status: 'block', phase_total_usd: total, phase,
      message: `Phase ${phase} LLM spend $${total.toFixed(2)} >= $${PHASE_HARD_CAP_USD.toFixed(2)}. ...`,
    };
  }
  if (total >= PHASE_WARN_THRESHOLD_USD) {
    return { status: 'warn', phase_total_usd: total, phase, message: '...' };
  }
  return { status: 'ok', phase_total_usd: total, phase, message: '' };
}
```

`checkDayCap`, `checkIssueCap`, `checkPrCap` (Pattern 2 above) are 1:1 structural clones with:
- `dayTotal(ledger, isoDay)` / `issueTotal(ledger, issueId)` / `prTotal(ledger, prNumber)` as the sum
- Different cap constant (`DAY_HARD_CAP_USD = 10`, `ISSUE_HARD_CAP_USD = 1`, `PR_HARD_CAP_USD = 2`)
- Different return-shape key (`day_total_usd` / `issue_total_usd` / `pr_total_usd`) so callers cannot accidentally swap (the established discipline at line 240)

### Existing: `[skip ci]` atomic commit pattern (Phase 40 consumes, Phase 39 only documents)

```yaml
# .github/workflows/e2e-weekly-digest.yml:98-110 (existing v3.1 canonical pattern)
# Source: direct code inspection 2026-05-30
- name: Commit weekly digest
  # D-11 / DIGEST-03: commit reports/weekly-digest-*.md in-run with [skip ci].
  # [skip ci] is LOAD-BEARING — prevents this bot push from re-triggering ci.yml
  run: |
    git config user.name "github-actions[bot]"
    git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
    git add reports/weekly-digest-*.md
    git diff --cached --quiet || git commit -m "docs(weekly-digest): ${{ env.WEEK_LABEL }} [skip ci]"
    git push
```

Phase 39 includes a `<!-- Phase 40 will adopt: -->` reference to this pattern in `docs/v40-repo-config.md` so future workflows mirror it (`git add tests/e2e/.llm-spend-ledger.json && git diff --cached --quiet || git commit -m "chore(ledger): auto-fix #N spend [skip ci]"`).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| GitHub "branch protection rules" (legacy, per-branch UI) | "Branch protection rulesets" (new, supports multiple matching rules, ARM-friendly, dotted paths, hierarchical) | GA 2025-11 (per PITFALLS.md source) | Phase 39 uses **rulesets**, not legacy rules. `gh api PUT /repos/:owner/:repo/rulesets` is the modern config-as-code path (though CONTEXT defers config-as-code to v4.1). |
| Local-only `tests/e2e/.llm-spend-ledger.json` (gitignored) | Committed-but-versioned ledger | Phase 39 (this phase) | Schema unchanged; only privacy/auditability tradeoff. Phase 46 audits committed-ledger privacy (per STATE.md flag). |
| `actions/github-script@v7` for repo settings reads | `gh api GET` from a shell step | v3.1 convention | `gh` is pre-installed on `ubuntu-latest`; consistent with existing repo workflows. Phase 47 audit step uses `gh api`. |
| Single $80/$100 monthly cap (v3.1 + phase cap) | Add per-day $10 / per-issue $1 / per-PR $2 sub-caps (4 total) | Phase 39 (this phase) | Required because the SDK transport has no structural ceiling (PITFALLS.md §2). |

**Deprecated/outdated:**
- Legacy branch protection rules: still supported but rulesets are the recommended path for new repos as of 2025-11. Phase 39 picks rulesets.
- `claude-opus-4-7` as default fix model: STACK.md notes Opus 4.7 is now "legacy" in Anthropic docs (still supported, but Sonnet 4.6 is the cost-optimal current model). CONTEXT locks Sonnet for v4.0.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The actual GitHub login for the maintainer is `fatduck` (per CONTEXT) — but `git remote get-url origin` resolves to `tonyrowles/patent-cite-tool`, and STATE.md references `@TR`. | CODEOWNERS Pattern 6, Pitfall 4 | CODEOWNERS owner string would silently disable "Require review from Code Owners" branch protection. Auto-fix PRs merge without CODEOWNERS gating. **VERIFY WITH USER BEFORE COMMITTING.** |
| A2 | `claude-sonnet-4-6` is the model name returned by `response.model` from `messages.create({model: 'claude-sonnet-4-6'})`. The existing `PRICING_BY_MODEL` map has `claude-sonnet-4-5` but NOT `claude-sonnet-4-6`. | Pitfall 2 | First SDK call would fall back to default Opus pricing in `fallbackCostUsd` → cost over-counted by 5×. Mitigation: planner adds `claude-sonnet-4-6` to PRICING_BY_MODEL with explicit `{input: 3, output: 15}` per STACK.md table. |
| A3 | The `phase: '39-bootstrap'` sentinel value in the first committed ledger entry will not collide with any v3.1 phase-cap check (v3.1 uses '32', '34' etc. — numeric strings). | Pattern §, Pitfall 1 | If collision, the per-phase cap for '39-bootstrap' counts the seed $0 entry forever. Harmless (sum is 0) but bookkeeping noise. |
| A4 | GitHub recognizes `.github/CODEOWNERS` over `CODEOWNERS` at repo root (canonical precedence). | Pattern §6 | If both exist, GitHub uses the one with most-specific path-rules — could be ambiguous. Mitigation: only ship `.github/CODEOWNERS`. |
| A5 | The branch protection ruleset's "required status checks" list can be saved EMPTY in the UI (slot reserved, no check named). | Pitfall 5 | If GitHub UI requires at least one named check, Phase 39 would have to name `ci` (existing check) as placeholder. Replace in Phase 41. |
| A6 | Single `LEDGER_PATH` is shared by both transports (locked by CONTEXT, but the runtime constraint to verify is: `appendLedgerEntry` from both call sites writes to the same file). | LEDGER-02 support row | If a future refactor splits the ledger into per-transport files, `combinedMonthlyTotal` would need to sum two files. Designed to be hook-friendly via the by-transport variant. |
| A7 | The "Allow auto-merge" setting in GitHub Settings → General → Pull Requests is a repo-level checkbox (not part of the ruleset). | CLEANUP-04 support row | If GitHub UI has moved the setting in a recent UI refresh, the audit doc must be updated. `gh api GET /repos/:owner/:repo` field `allow_auto_merge` is the reliable read. |
| A8 | `phase` field in ledger entries is a free-form string (not a finite enum) — existing v3.1 entries use numeric strings like `'32'`. | LEDGER-01 support row | If a future change enforces an enum, the bootstrap value `'39-bootstrap'` would need to be added to the enum. Currently free-form per `appendLedgerEntry:301` JSDoc. |
| A9 | The slopcheck verdict `[OK]` for `@anthropic-ai/sdk` is reliable; the package is the actual Anthropic-published SDK (not a typosquatted clone). | Package Legitimacy Audit | If clone exists with the same name and slopcheck missed it, supply-chain attack. Mitigation: cross-check `npm view @anthropic-ai/sdk repository.url` returns `github.com/anthropics/...` (VERIFIED at research time). |

## Open Questions

1. **What is the maintainer's actual GitHub login?**
   - What we know: CONTEXT says `@fatduck`. STATE.md / RETROSPECTIVE.md reference `@TR`. `git remote get-url origin` shows `github.com/tonyrowles/patent-cite-tool`.
   - What's unclear: Which is the LIVE GitHub login. CODEOWNERS uses logins exactly.
   - Recommendation: **Before committing CODEOWNERS, run `gh api user --jq .login` as the maintainer** and confirm the actual login. Pin THAT string. If `@fatduck` is the login: ship as locked. If not: discuss-phase or planner must surface the discrepancy.

2. **Seed the committed ledger with the existing local history or only the bootstrap entry?**
   - What we know: Local v3.1 ledger may contain dozens of entries with the dev's monthly spend pattern. CONTEXT mandates the flip from gitignored to committed.
   - What's unclear: Whether the FIRST commit should preserve the local history (richer context, but leaks v3.1 spend pattern to git history forever) OR seed only the bootstrap entry (lose local history visibility, cleaner privacy).
   - Recommendation: Seed ONLY the bootstrap entry. The local file is preserved on the dev machine; the committed file starts fresh from 2026-05-30. Phase 46 audit verifies privacy decision was applied.

3. **Operational impact of `Do not allow bypassing: ON` on single-maintainer workflow.**
   - What we know: Single-maintainer repo. `Do not allow bypassing` forces all changes through PRs.
   - What's unclear: Whether the maintainer is OK with PR-only workflow for all future commits to `main`, including their own. GitHub does not permit self-approval.
   - Recommendation: discuss-phase confirms with user. If not OK, two options: (a) accept the trust-invariant weakening (add maintainer to bypass-list) OR (b) accept the operational friction (every change goes through a PR with no approver — push direct after pushing to a feature branch and using `gh pr merge --admin` is the workaround but bypass-list still must include the maintainer).

4. **Should `--force-api` be an env var (`FORCE_API=1`) or CLI flag (`--force-api`)?**
   - What we know: CONTEXT references the v3.1 `--force-llm` convention; that one is a CLI flag in `scripts/e2e-explore.mjs`.
   - What's unclear: The wrapper is a LIBRARY function, not a CLI script. Library functions take options objects. The CLI flag is passed by the consuming SCRIPT (Phase 42's `auto-fix.mjs --force-api`).
   - Recommendation: Wrapper takes `forceApi: boolean` option (default `false`). CLI scripts in Phase 42+ parse `--force-api` argv and pass through. Same separation of concerns as `--force-llm`.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Driver + ledger + Vitest | ✓ | v24.11.1 (system) | — |
| `npm` | Install `@anthropic-ai/sdk` | ✓ | bundled with Node | — |
| `vitest` | Unit tests for new caps + schema-guard | ✓ | `^3.0.0` (devDep, package.json:39) | — |
| `eslint` | Lint guard on `@anthropic-ai/sdk` | ✓ | `10.4.0` (devDep, package.json:36) | — |
| `gh` CLI | Audit step capturing `gh api GET /repos/:owner/:repo/rulesets` snapshot | (assumed ✓ on dev machine; required only at Phase 47 audit) | 2.x | Manual UI screenshot if `gh` not installed |
| `@anthropic-ai/sdk@0.100.1` | New `invokeAnthropicSdkWithLedger` | ✗ (not yet installed) | will be `0.100.1` EXACT | — (no fallback; this is the SDK transport) |
| `claude` CLI | EXISTING `invokeClaudeP` (subscription); Phase 39 does not invoke it but the file is loaded | (assumed ✓ — v3.1 baseline) | n/a | — |
| `ANTHROPIC_API_KEY` env / secret | First actual CI invocation of the SDK transport (Phase 42+) — NOT Phase 39 | ✗ (not required for Phase 39) | — | None; document in `docs/v40-repo-config.md` for Phase 42 prep |
| `slopcheck` | Package legitimacy audit (one-time, research phase) | ✓ at `/home/fatduck/.local/bin/slopcheck` | (installed) | Mark as `[ASSUMED]` if unavailable |

**Missing dependencies with no fallback:**
- `@anthropic-ai/sdk` (installed by Phase 39's `npm install -D @anthropic-ai/sdk@0.100.1`)

**Missing dependencies with fallback:**
- None — every dependency Phase 39 actually USES at runtime is already present (the SDK is the only new install).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest `^3.0.0` |
| Config file | (default — vitest auto-detects `vitest.config*` or repo root) |
| Quick run command | `npx vitest run tests/unit/llm-ledger.test.js tests/unit/llm-driver.test.js` |
| Full suite command | `npm run test:src` (runs all `tests/unit/*.test.js`) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LEDGER-01 | `appendLedgerEntry` accepts `transport: 'subscription' \| 'sdk'` and persists it | unit | `npx vitest run tests/unit/llm-ledger.test.js -t "transport field"` | ✅ extend `tests/unit/llm-ledger.test.js` (clone case 18 — phase back-compat) |
| LEDGER-01 | `appendLedgerEntry` without `transport` parses fine (back-compat) | unit | `npx vitest run tests/unit/llm-ledger.test.js -t "transport field back-compat"` | ✅ extend existing |
| LEDGER-02 | `combinedMonthlyTotal(ledger)` returns sum across both transports for current month | unit | `npx vitest run tests/unit/llm-ledger.test.js -t "combinedMonthlyTotal"` | ✅ extend existing |
| LEDGER-02 | `combinedMonthlyTotalByTransport` returns per-transport breakdown | unit | `npx vitest run tests/unit/llm-ledger.test.js -t "combinedMonthlyTotalByTransport"` | ✅ extend existing |
| LEDGER-03 | `checkDayCap` blocks at $10.00 exactly; warns? (no — sub-caps are binary per CONTEXT) | unit | `npx vitest run tests/unit/llm-ledger.test.js -t "checkDayCap"` | ✅ extend existing |
| LEDGER-03 | `checkIssueCap` blocks at $1.00 exactly | unit | `npx vitest run tests/unit/llm-ledger.test.js -t "checkIssueCap"` | ✅ extend existing |
| LEDGER-03 | `checkPrCap` blocks at $2.00 exactly | unit | `npx vitest run tests/unit/llm-ledger.test.js -t "checkPrCap"` | ✅ extend existing |
| LEDGER-03 | `invokeAnthropicSdkWithLedger` returns `{ok:false, capBlocked:true}` when day cap blocks (driver-level integration) | unit (mocked SDK) | `npx vitest run tests/unit/llm-driver.test.js -t "SDK transport day cap"` | ✅ extend `tests/unit/llm-driver.test.js` |
| LEDGER-03 | Same for issue cap and PR cap (3 separate boundary tests in driver) | unit | `npx vitest run tests/unit/llm-driver.test.js -t "SDK transport.*cap"` | ✅ extend existing |
| LEDGER-04 | Committed file passes JSON.parse and has `version: 1` (post-flip schema-guard) | unit | `npx vitest run tests/unit/llm-ledger.test.js -t "committed bootstrap"` | ✅ extend existing |
| LEDGER-04 | `.gitignore` does NOT contain `tests/e2e/.llm-spend-ledger.json` (static-grep) | unit | `npx vitest run tests/unit/llm-ledger.test.js -t "gitignore flip"` | ✅ extend existing |
| CLEANUP-04 | `.github/CODEOWNERS` exists and contains all 5 locked path strings | unit (static-grep) | `npx vitest run tests/unit/codeowners.test.js` (NEW file) | ❌ NEW — Wave 0 |
| CLEANUP-04 | ESLint guard fires on `@anthropic-ai/sdk` import outside `llm-driver.js` (test via ESLint API or static-grep) | unit | `npx vitest run tests/unit/eslint-sdk-guard.test.js` (NEW file) | ❌ NEW — Wave 0 |
| CLEANUP-04 | SDK transport CI inverse-gate: rejects when `CI != 'true'` and `forceApi: false` | unit | `npx vitest run tests/unit/llm-driver.test.js -t "SDK transport inverse CI gate"` | ✅ extend existing |
| CLEANUP-04 | Subscription transport STILL rejects when `CI = 'true'` (regression guard for v3.1 invariant) | unit | `npx vitest run tests/unit/llm-driver.test.js -t "subscription CI guard intact"` | ✅ already case 25/26 — verify unchanged |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/unit/llm-ledger.test.js tests/unit/llm-driver.test.js`
- **Per wave merge:** `npm run test:src && npm run lint`
- **Phase gate:** `npm test` (full repo suite) green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/codeowners.test.js` — covers CLEANUP-04 CODEOWNERS-presence check (NEW file)
- [ ] `tests/unit/eslint-sdk-guard.test.js` — covers CLEANUP-04 ESLint guard (NEW file; uses ESLint's programmatic API or simple file-read + regex)
- [ ] Bootstrap-entry seed script (one-shot, lives in this phase's commit as either an inline `node -e` or a `scripts/phase-39-seed-ledger.mjs`) — not a permanent script; can be deleted after the commit lands

*(Existing tests are extended; the only new files are the two static-grep guard tests above.)*

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `ANTHROPIC_API_KEY` repo secret; never PAT; never CLI flag. (Phase 42 enforces; Phase 39 documents in `docs/v40-repo-config.md`.) |
| V3 Session Management | no | No sessions in this phase. |
| V4 Access Control | yes | CODEOWNERS pins the 5 trust-invariant paths; branch protection ruleset with `Do not allow bypassing: ON`; `Allow auto-merge: OFF`. |
| V5 Input Validation | partial | Phase 39 doesn't accept user input directly. The transport-field validator (LEDGER-01) is the only new validation surface — `transport` must be one of `'subscription' \| 'sdk'`; reject other strings. |
| V6 Cryptography | no | No cryptography in this phase. (Future SOPS-encrypted secrets are out of scope.) |
| V14 Configuration | yes | Pin `@anthropic-ai/sdk@0.100.1` EXACT (not caret) — supply-chain risk per STACK.md. Slopcheck `[OK]` verified at research time. |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Slopsquatted SDK package | Tampering | Pin EXACT version + verify repository.url matches official Anthropic org. (Done in Package Legitimacy Audit.) |
| Cost runaway via missing cap (Pitfall 2 from milestone PITFALLS.md) | Denial of Service (budget) | Per-day $10 + per-issue $1 + per-PR $2 sub-caps in addition to monthly $80/$100; Phase 39's LEDGER-03. |
| ESLint guard masked by config-order bug (Pitfall 3 above) | Tampering | Append block to end of `eslint.config.js`; lint-fixture Vitest test asserts rule fires. |
| CODEOWNERS username mismatch silently disables protection (Pitfall 4 above) | Spoofing | Confirm `gh api user --jq .login` before committing CODEOWNERS. |
| Branch protection bypass-list including admin (Pitfall 6 above) | Elevation of Privilege | CONTEXT locks `Do not allow bypassing: ON`. Audit captures bypass-list state for Phase 47. |
| Committed ledger leaks dev-machine spend pattern through git history | Information Disclosure | Per Open Questions §2 — seed first commit with ONLY the bootstrap entry, not local history. Phase 46 audits. |
| First-call cost mis-attribution to Opus pricing (Pitfall 2 above) | Information Integrity | Add `claude-sonnet-4-6` to `PRICING_BY_MODEL` in Phase 39 commit; Vitest test asserts no fallthrough to default. |

## Sources

### Primary (HIGH confidence)
- Direct code inspection 2026-05-30:
  - `/home/fatduck/patent-cite-tool/tests/e2e/lib/llm-driver.js` (lines 375–444: `invokeClaudePWithLedger`)
  - `/home/fatduck/patent-cite-tool/tests/e2e/lib/llm-ledger.js` (lines 248–276: `checkPhaseSpendCap`; 318–370: `appendLedgerEntry`)
  - `/home/fatduck/patent-cite-tool/tests/e2e/lib/llm-pricing.js` (lines 36–41: `PRICING_BY_MODEL`)
  - `/home/fatduck/patent-cite-tool/tests/e2e/lib/issue-payload-builder.js` (lines 1–20: pure-function purity discipline)
  - `/home/fatduck/patent-cite-tool/eslint.config.js` (lines 50–148: existing per-file `no-restricted-imports` patterns)
  - `/home/fatduck/patent-cite-tool/.github/workflows/e2e-weekly-digest.yml` (lines 98–110: `[skip ci]` atomic commit pattern)
  - `/home/fatduck/patent-cite-tool/.gitignore` (lines 18–19: ledger gitignore line to delete)
  - `/home/fatduck/patent-cite-tool/package.json` (devDep versions; `npm scripts` for lint + test)
  - `/home/fatduck/patent-cite-tool/tests/unit/llm-ledger.test.js` (lines 56–100: tmpDir-per-test convention)
  - `/home/fatduck/patent-cite-tool/tests/unit/llm-driver.test.js` (lines 46–80: vi.mock pattern for spawn)
- v4.0 milestone research (already HIGH-confidence per `.planning/research/SUMMARY.md`):
  - `.planning/research/STACK.md` §1 (SDK 0.100.1 verification, model pricing, exact-pin rationale)
  - `.planning/research/ARCHITECTURE.md` §3.1 (driver extension), §3.3 (ledger NO extraction), §6 (ESLint rules)
  - `.planning/research/PITFALLS.md` Pitfalls 1, 2, 3, 4, 8 (all directly applicable to Phase 39)
  - `.planning/REQUIREMENTS.md` LEDGER-01..04 + CLEANUP-04
- npm registry: `npm view @anthropic-ai/sdk version` → `0.100.1` (verified 2026-05-30)
- slopcheck: `slopcheck install @anthropic-ai/sdk` → `[OK]` (verified 2026-05-30)

### Secondary (MEDIUM confidence)
- [GitHub Docs — About CODEOWNERS](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-security/customizing-your-repository/about-code-owners) (cited via milestone research; canonical path precedence and last-rule-wins semantics)
- [GitHub Docs — About protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches) (ruleset vs legacy rules; bypass options)
- [GitHub Changelog — Required review by specific teams now available in rulesets (2025-11)](https://github.blog/changelog/2025-11-03-required-review-by-specific-teams-now-available-in-rulesets/) — confirms rulesets are the modern recommended path

### Tertiary (LOW confidence — flagged for validation)
- Maintainer's actual GitHub login (Open Questions §1) — unverified; CONTEXT says `fatduck`, repo remote says `tonyrowles`, retrospective says `@TR`
- Whether `claude-sonnet-4-6` appears in the `messages.create` response.model field exactly (vs with a date suffix) — only verifiable by an actual SDK call; mitigation: calibration test on first invocation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — `@anthropic-ai/sdk@0.100.1` verified against npm registry + slopcheck; the rest are in-repo
- Architecture: HIGH — direct code inspection of every primitive being extended; milestone research already confirmed shape decisions
- Pitfalls: HIGH — every pitfall has either direct code anchor or milestone-level PITFALLS.md provenance
- Repo settings (CODEOWNERS + branch protection): MEDIUM — pattern is well-documented but maintainer login + `Do not allow bypassing` operational impact need user confirmation (Open Questions §1, §3)

**Research date:** 2026-05-30
**Valid until:** 2026-06-30 (stable extension surface; SDK version may bump but EXACT pin protects)

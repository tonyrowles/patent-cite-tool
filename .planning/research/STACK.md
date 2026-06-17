# Stack Research

**Domain:** Human-report-driven, LLM-assisted auto-fix pipeline
**Researched:** 2026-06-17
**Confidence:** HIGH (all findings verified against live codebase + official docs)

---

## Executive Summary

v6.1 adds a triage → analysis → regression-safe-fix pipeline on top of the
v5.0 `BUG_REPORTS` KV channel. Every significant piece of infrastructure is
already present: KV read access (`scripts/review-reports.mjs`), both LLM
transports (`invokeClaudePWithLedger` + `invokeAnthropicSdkWithLedger`), PR
automation (`peter-evans/create-pull-request@v8` + `gh` CLI), and the
regression gate (golden corpus + quarantine runner). The zero-new-dep streak
survives: no new npm packages are required. The work is entirely new script
files, new GitHub Actions workflows, and wiring that already-present
primitives together into the new pipeline shape.

---

## Recommended Stack

### Core Technologies

| Technology | Current Version | Purpose | Why |
|------------|----------------|---------|-----|
| Node.js 22 LTS | 22.x (pinned in CI via `actions/setup-node@v5`) | All pipeline scripts | Already the project runtime; ESM throughout; `node:child_process`, `node:fs`, `node:crypto` are the only I/O layers needed |
| `wrangler` CLI (via `npx`) | `^4.69.0` (worker/package.json); latest is 4.101.0 | KV read: list + get report records with `--remote` | `review-reports.mjs` already shells out to `npx wrangler kv key list/get --remote` — the exact pattern the triage reader needs; no new install |
| `@anthropic-ai/sdk` | `0.100.1` EXACT (package.json) — latest is `0.104.2` | LLM invocation in CI (analysis + classification) | Already pinned; `invokeAnthropicSdkWithLedger` in `llm-driver.js` wraps it with ledger + cap guards; `messages.create` API is stable across 0.100.1 → 0.104.2 (no breaking changes on the non-streaming path per SDK changelog) |
| `claude -p` CLI (subscription) | Max subscription; current CLI v2.1.169+ | LLM invocation locally (maintainer manual-promote + local iteration) | Already used via `invokeClaudePWithLedger`; `--max-turns 5 --tools Read,Glob,Grep --max-budget-usd 0.50` pattern is locked; no change needed |
| `gh` CLI | Pre-installed on `ubuntu-latest` GitHub Actions runner | GitHub Issues + PR automation | Already used in `v40-auto-fix.yml` and `v40-auto-promote.yml` for issue commenting, labeling, and PR inspection; zero new dependency |
| `peter-evans/create-pull-request@v8` | v8 (pinned in existing workflows) | Opening draft fix PRs | Already used in `v40-auto-fix.yml` + `v40-auto-promote.yml`; same action handles the new pipeline's PR step |
| Vitest | `^3.0.0` (package.json); worker uses `^4.1.6` | Unit testing all new pipeline scripts | Already the test runner; all new scripts get Vitest coverage as per project pattern |

### Supporting Libraries / Existing Modules (reuse, not add)

| Module | Location | Role in v6.1 | Zero-dep note |
|--------|----------|--------------|---------------|
| `invokeAnthropicSdkWithLedger` | `tests/e2e/lib/llm-driver.js` | CI-side LLM calls for triage classification + fix generation | Already implemented; already has cap guards, ledger write, model routing |
| `invokeClaudePWithLedger` | `tests/e2e/lib/llm-driver.js` | Local maintainer iteration + manual-promote path | Already implemented; subscription-local guard already wired |
| `safeAppendLedger` | `tests/e2e/lib/safe-append-ledger.js` | Shared ledger write guard for new pipeline scripts | Already Phase 62 shared module; use it rather than re-implementing |
| `LEDGER_PATH` + cap helpers | `tests/e2e/lib/llm-ledger.js` | Spend tracking + cap enforcement across all new invocations | Already the canonical source; new ledger entries will need `source: 'report-triage'` and `source: 'report-fix'` tags |
| `scripts/review-reports.mjs` | `scripts/review-reports.mjs` | KV read pattern + wrangler shell-out + `getNamespaceId()` | The triage-reader script should import `getNamespaceId`, `filterReports`, `sortReports`, `loadReports` directly from here rather than duplicating; all are exported pure functions |
| `scripts/check-diff-guard.mjs` | `scripts/check-diff-guard.mjs` | FORBIDDEN_PATHS gate on proposed fix diffs | Already wired in `auto-fix.mjs`; the new fix-application path reuses it byte-for-byte |
| Golden corpus runner | `vitest` + `tests/test-cases.js` + `tests/golden/baseline.json` | Regression gate after candidate fix | Already the CI test suite; the regression-gate step simply runs `npm test` on the proposed branch |
| Quarantine corpus | `tests/e2e/test-cases-quarantine.js` + `quarantine-append.mjs` | Quarantine gate: promoted reports get a quarantine fixture | Already implemented; carry forward as-is |

### New GitHub Actions Workflows Needed

| Workflow file | Trigger | Purpose |
|---------------|---------|---------|
| `v61-report-triage.yml` | `workflow_dispatch` (manual) + optional `schedule` cron | Reads `BUG_REPORTS` KV → classifies each unreviewed report as `real_bug / noise / duplicate / user_error` → auto-promotes `real_bug` reports → notifies maintainer |
| `v61-report-fix.yml` | `workflow_dispatch` with `report_fp` + `report_ts` inputs (or label on a GitHub Issue representing the promoted report) | Runs LLM analysis on a promoted report → produces a candidate diff → opens a draft PR |
| `v61-verifier-gate.yml` | PR targeting `main` with `report-fix:` branch prefix | Runs `npm test` (golden corpus + quarantine) on the fix branch → labels `auto-fix:verified` or `auto-fix:failed` |

The existing `v40-verifier-gate.yml` covers `auto-fix/*` branches. The new triage pipeline uses a distinct `report-fix/*` branch prefix to keep concerns separated and avoid triggering the old verifier on new pipeline PRs during the retirement period.

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `wrangler` CLI | KV read/write for production `BUG_REPORTS` namespace | Must always pass `--remote`; run from `worker/` directory (already documented in `review-reports.mjs` and in MEMORY.md `wrangler_kv_needs_remote_flag`) |
| `eslint` (existing flat config) | Lint gate for new scripts | Add new scripts to the `lint` npm script; `no-restricted-imports` guard on `@anthropic-ai/sdk` stays scoped to `llm-driver.js` only |

---

## Installation

No new npm dependencies required. All tools are either pre-installed on the
runner (`gh`, `node`, `npx`) or already in `package.json` / `worker/package.json`.

```bash
# Nothing new to install at the project root — all dependencies already present:
#   @anthropic-ai/sdk@0.100.1 (EXACT, devDependencies)
#   vitest, eslint, esbuild, @playwright/test — all already present

# Wrangler is in worker/package.json and called via npx from scripts/
# (review-reports.mjs pattern — no top-level install needed)
```

---

## Alternatives Considered

### KV Read Access

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| `wrangler kv key list/get --remote` via `execFileSync` (already used in `review-reports.mjs`) | Cloudflare REST API (`https://api.cloudflare.com/client/v4/accounts/{id}/storage/kv/namespaces/{ns}/keys`) via `fetch` | REST API requires an Account ID + an API token scoped to KV read — new secrets to manage, new CI configuration. The wrangler CLI is already authed in the worker's `CLOUDFLARE_API_TOKEN` CI secret, and the pattern is proven and tested in `review-reports.mjs`. Use what already works. |
| `wrangler kv key list/get --remote` | `@cloudflare/workers-sdk` programmatic API (no stable public Node API as of 2026) | No stable import path for KV from Node scripts; wrangler CLI is the documented approach |

### LLM Invocation for Triage/Analysis

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| `invokeAnthropicSdkWithLedger` in CI / `invokeClaudePWithLedger` locally (existing dual-transport pattern) | A new MCP server or agent framework | Introduces new complexity and new dependencies; the existing dual-transport with its ledger, cap guards, and CI-gate is battle-tested through v4.0–v4.3 work. Build on it. |
| `invokeClaudePWithLedger` for local manual-promote path | Direct `claude -p` shell call | Bypasses ledger and spend-cap guards; the MEMORY.md `auto_fix_ledger_leak_vector` note documents exactly this class of bug in prior auto-fix work |
| `claude -p` with `--max-turns 5 --tools Read,Glob,Grep` for fix generation | `claude -p` with `--max-turns 1` | `--max-turns 1` was the v4.2 architectural blocker (SWEEP-03 `error_max_turns`); v4.3 Phase 61 already relaxed this to 5 with `--allowed-tools Read,Glob,Grep`; carry that forward |

### GitHub Issues / PR Automation

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| `gh` CLI via `execFileSync` in scripts; `peter-evans/create-pull-request@v8` in workflows | `@octokit/rest` npm package | New npm dependency; `gh` is pre-installed on all ubuntu-latest runners and already used in 3 existing workflows; zero supply-chain surface added |
| `peter-evans/create-pull-request@v8` (already pinned) | `actions/github-script` + REST API | create-pull-request@v8 handles the two-commit-split ledger pattern (already documented in `v40-auto-fix.yml` header); changing would require re-solving that solved problem |

### Regression Gate

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| `npm test` (existing golden corpus + quarantine via Vitest + Playwright) | A separate regression harness | The existing 75-case golden corpus at 100% accuracy IS the regression gate; running `npm test` on the fix branch exercises it; no new tooling needed |
| Quarantine append for promoted report fixtures | Adding directly to golden immediately | Same human-gated trust invariant from v3.1: quarantine first, promote at `stable_runs ≥ 3` |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| New npm packages for GitHub automation (`@octokit/rest`, `octokit`, `node-github`) | Breaks the zero-new-dep streak with no benefit over `gh` CLI which is already present and already used | `gh` CLI via `execFileSync` for script-level automation; `peter-evans/create-pull-request@v8` for workflow-level PR creation |
| Cloudflare Workers API (`@cloudflare/workers-sdk`) for KV reads | No stable programmatic Node API; wrangler CLI is the documented path and is already used | `wrangler kv key list/get --remote` via `execFileSync` (pattern from `review-reports.mjs`) |
| `@anthropic-ai/sdk` upgrade to 0.104.2 at this milestone | The EXACT pin `0.100.1` is a supply-chain hardening decision (v4.0 Phase 47); 0.100.1 → 0.104.2 has no breaking changes on `messages.create` non-streaming path (verified against SDK changelog), so upgrading is valid but carries unnecessary churn for a milestone whose core value is the pipeline, not SDK freshness; defer to the scheduled `v40-deps-update.yml` process | Keep `0.100.1` EXACT for now |
| Autonomous cron-driven "seek out patents to fix" | Explicitly deferred (PROJECT.md §Current Milestone, MILESTONES.md); the v40-auto-fix synthetic-trigger machinery being retired is exactly this pattern | Human-reported `BUG_REPORTS` KV as the sole fix-candidate source |
| Fixture mutator / `inject-defect.mjs` for synthetic test issues | Being retired in v6.1 (PROJECT.md §Current Milestone: "retire the autonomous machinery") | Real human reports from `BUG_REPORTS` KV |
| Restoring `e2e:explore` / `v40-auto-fix.yml` `issues: labeled` trigger | These guard the retired autonomous path (PROJECT.md: "supersedes RESUME-V4.3.md") | New `v61-report-triage.yml` and `v61-report-fix.yml` workflows triggered by KV reports |

---

## Stack Patterns for the New Pipeline

**KV → triage script (new `scripts/report-triage.mjs`):**
- Import `getNamespaceId`, `loadReports`, `filterReports` from `scripts/review-reports.mjs` (already exported pure functions)
- Filter to `_review.status === 'open'` (or no `_review` field) to find unreviewed reports
- Heuristic-first classification (same pattern as `triage-classifier.js`): category=`other` + no `selectionText` → noise; duplicate_count ≥ 3 → duplicate; category=`tool_not_working` + empty errorLog → user_error; category=`inaccurate_citation` or `no_match` with selectionText + returnedCitation → real_bug candidate for LLM confirmation
- LLM second-pass via `invokeClaudePWithLedger` (local) or `invokeAnthropicSdkWithLedger` (CI) for ambiguous cases
- Write `_review.status = 'triaged'` or `'promoted'` back to KV via `wrangler kv key put --remote`
- **Manual-promote escape hatch**: `node scripts/report-triage.mjs promote <fp> <ts>` bypasses heuristics and forces promotion — uses `writeStatus` pattern from `review-reports.mjs`

**Promoted report → LLM analysis → fix PR (new `scripts/report-fix.mjs`):**
- Reads a single promoted KV record by fingerprint + timestamp (wrangler get pattern)
- Builds a prompt using the report's `patentNumber`, `selectionText`, `returnedCitation`, `confidenceTier`, `xpathNode`, `errorLog` fields — wraps in `<report_data>` XML tags (same prompt-injection defense as `<patent_data>` in triage-classifier)
- Routes to `invokeAnthropicSdkWithLedger` (CI) with `--max-turns 5 --tools Read,Glob,Grep` analogously to existing fix generation
- Parses fenced diff from LLM response, runs `checkDiffGuard`, runs `git apply --check`
- Opens draft PR via `peter-evans/create-pull-request@v8` with `report-fix/<fp8>` branch prefix
- Writes ledger entry with `source: 'report-fix'`, `transport: 'sdk'`

**Regression gate workflow (`v61-verifier-gate.yml`):**
- Triggers on `pull_request` with branch matching `report-fix/**`
- Runs `npm test` (existing golden corpus) — if exit 0: label `auto-fix:verified`; else: label `auto-fix:failed`
- Same pattern as `v40-verifier-gate.yml` but scoped to the new branch prefix

**Ledger source tags for new pipeline entries:**
- Triage classification: `source: 'report-triage'`
- Fix generation: `source: 'report-fix'`
- These are new values; add them to `VALID_TRANSPORTS` in `safe-append-ledger.js`? No — `transport` and `source` are different fields. `VALID_TRANSPORTS` = `{sdk, subscription}`. The `source` field is free-form. Just use the new source tags directly.

---

## Integration Points with Existing Infrastructure

| Existing Component | v6.1 Integration |
|-------------------|-----------------|
| `BUG_REPORTS` KV (binding in `wrangler.toml`: `cefe2733c0074fe2a28a49ff536de105`) | Triage script reads via `wrangler kv key list/get --remote --namespace-id=cefe2733c0074fe2a28a49ff536de105`; writes `_review` status back via `wrangler kv key put --remote` |
| `tests/e2e/.llm-spend-ledger.json` (committed, versioned) | All new LLM calls go through existing `safeAppendLedger`; new source tags `report-triage` and `report-fix` add to the existing per-month spend tracking; `combinedMonthlyTotal` already unifies SDK + subscription caps |
| `v40-cost-ledger-snapshot.yml` daily snapshot | Snapshots the ledger including new v6.1 entries automatically — no change needed |
| Golden corpus (`tests/test-cases.js` + `tests/golden/baseline.json`, 75 cases) | The regression gate IS `npm test`; no change to the corpus |
| `scripts/check-diff-guard.mjs` FORBIDDEN_PATHS | Fix generation must run `checkDiffGuard` before applying any LLM-proposed patch — same guard, same list |
| `peter-evans/create-pull-request@v8` | Pinned action already in `package.json` workflows scope; reuse directly |
| Branch protection ruleset (id 17086676, required status checks) | New `v61-verifier-gate` job must be added as a required status check for `report-fix/*` PRs before those PRs can merge — add to ruleset via `gh api` or maintainer UI action |
| `scripts/auto-fix.mjs` (OLD pipeline, being retired) | Do NOT extend; the old `PROMPT_SCAFFOLDS`, `ERROR_CLASS` routing, `fix-prompt-builder.js` are v4.x infrastructure tied to GitHub Issues as the inbound channel; v6.1 builds fresh from KV reports as the inbound channel |

---

## Version Compatibility

| Package | Pinned At | Compatible With | Notes |
|---------|-----------|-----------------|-------|
| `@anthropic-ai/sdk` | `0.100.1` EXACT | All existing `invokeAnthropicSdkWithLedger` call sites | `messages.create` non-streaming path stable 0.100.1 → 0.104.2; no upgrade needed for v6.1 |
| `wrangler` | `^4.69.0` in worker/ | `npx wrangler` from scripts/ uses latest installed in worker/node_modules | Always run with `--remote`; local default breaks (MEMORY.md `wrangler_kv_needs_remote_flag`) |
| `peter-evans/create-pull-request` | `@v8` (locked in workflows) | Works on ubuntu-latest runner | Do not float to `@v9` without verifying the two-commit-split pattern still holds |
| `vitest` | `^3.0.0` (root) | All new triage/fix scripts tested with Vitest | Worker uses `^4.1.6` via `@cloudflare/vitest-pool-workers` — separate concern |

---

## Sources

- Live codebase: `scripts/review-reports.mjs` — KV read pattern via wrangler (HIGH confidence, direct read)
- Live codebase: `tests/e2e/lib/llm-driver.js` — `invokeClaudePWithLedger` + `invokeAnthropicSdkWithLedger` (HIGH confidence, direct read)
- Live codebase: `tests/e2e/lib/safe-append-ledger.js` — shared ledger write guard (HIGH confidence, direct read)
- Live codebase: `worker/wrangler.toml` — KV namespace IDs and bindings (HIGH confidence, direct read)
- Live codebase: `worker/src/index.js` + `worker/src/report-schema.md` — KV record schema (HIGH confidence, direct read)
- Live codebase: `.github/workflows/v40-auto-fix.yml`, `v40-auto-promote.yml`, `v40-verifier-gate.yml` — GitHub automation patterns (HIGH confidence, direct read)
- `npm info @anthropic-ai/sdk version` → 0.104.2 latest; `0.100.1` installed (HIGH confidence, live npm query)
- Context7 `/anthropics/anthropic-sdk-typescript` → `messages.create` API stable 0.100.0+; changelog entry for 0.100.0 (HIGH confidence, Context7 docs)
- `npm info wrangler version` → latest 4.101.0; worker pins `^4.69.0` (HIGH confidence, live npm query)
- `.planning/PROJECT.md` §Current Milestone — explicit scope/out-of-scope for v6.1 (HIGH confidence)
- MEMORY.md `wrangler_kv_needs_remote_flag` — `--remote` required or reads false-empty (HIGH confidence, documented production finding)
- MEMORY.md `auto_fix_ledger_leak_vector` — `source: 'auto-fix-api'` leak vector documented (HIGH confidence)

---

*Stack research for: v6.1 Auto-Fix from Bug Reports (human-report-driven triage → analysis → regression-safe-fix pipeline)*
*Researched: 2026-06-17*

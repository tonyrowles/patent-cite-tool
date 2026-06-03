# Stack Research — v4.0 Self-Healing Test Suite

**Domain:** GitHub Actions LLM-driven auto-fix pipeline (additive to existing v3.0+v3.1 testing harness)
**Researched:** 2026-05-30
**Confidence:** HIGH for `@anthropic-ai/sdk` + GH Actions primitives (current docs verified within 24h); HIGH for dependency-updater choice (existing project has zero updater configured — clean slate); MEDIUM for cost-ledger persistence (multiple viable options, recommendation is opinionated).

> Read this in conjunction with:
> - `.planning/PROJECT.md` (v4.0 milestone scope, existing v3.0/v3.1 primitives)
> - `tests/e2e/lib/llm-driver.js` + `tests/e2e/lib/llm-ledger.js` (existing primitives the new stack must integrate with)
> - `.github/workflows/e2e-nightly.yml` (the workflow that fires the new auto-fix path)

---

## Executive Summary (TL;DR)

| Add | Don't add | Reason |
|-----|-----------|--------|
| `@anthropic-ai/sdk@0.100.1` (devDep, exact pin) | `anthropics/claude-code-action@v1` | SDK is sufficient and explicit; the action wraps Claude Code with implicit defaults that fight `invokeClaudePWithLedger`'s cost-ledger discipline. |
| `peter-evans/create-pull-request@v8` | Custom shell `gh pr create + git push -u` | Idempotent (re-runs update the same PR), handles signed commits as `github-actions[bot]`, draft mode is a one-liner, reputable maintainer. Custom shell is fragile across re-runs. |
| Native `gh CLI` for `gh pr ready`, `gh issue view`, `gh pr comment` | Octokit JS wrapper / `actions/github-script@v7` | Already deep gh CLI usage in v3.1 (`e2e-report-issue.mjs`, `weekly-digest.mjs`, label bootstrap). Stay consistent. |
| **Roll your own** weekly dep-update script (`npm outdated --json` → branch per dep → PR via peter-evans) | Dependabot | Dependabot can't run our nightly suite as the gate before opening the PR. Renovate can but introduces a hosted/self-hosted bot + 400 config options for an 8-dep project. |
| Git-committed CI ledger at `.github/.llm-ledger.json` with `[skip ci]` (mirrors existing v3.1 weekly-digest pattern) | GH Actions cache, repo variable, Cloudflare KV | Already-proven pattern in this repo (`e2e-weekly-digest.yml` line 109). Race risk mitigated by static concurrency group on `cost-ledger-write`. |
| Reuse existing `pdf-verifier.js` + `e2e:regression --grep <caseId>` as the PR gate | Build a new "verify on PR" action | The verifier already exists, is independently tested, and `--grep <caseId>` is already the way `e2e-nightly` runs targeted cases (workflow line 199-202). |

**Critical version pins:**
- `@anthropic-ai/sdk` **0.100.1** (published 2026-05-29; latest at research time; exact pin)
- `peter-evans/create-pull-request@v8` (8.1.1 tagged 2026-04-10)
- `actions/checkout@v4`, `actions/setup-node@v4`, `actions/cache@v4`, `actions/upload-artifact@v4` — already pinned at v4 across existing workflows; reuse them.
- **Model pin:** `claude-sonnet-4-6` for the auto-fix prompt ($3/$15 per Mtok, 1M context, cost-optimal for code-fix). Reserve `claude-opus-4-7` for ambiguous Tier-C escalations only — Opus is 1.7x cost and patent-citation-fix prompts are well-scoped, not "complex reasoning."

---

## Recommended Stack

### Core Technologies (NEW)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `@anthropic-ai/sdk` | **0.100.1** | TypeScript/Node SDK for direct Anthropic API calls from GitHub Actions (paid, 24/7 path) | Official Anthropic SDK. Built-in retries (default `maxRetries: 2`, exponential 1-2s backoff). Supports streaming via `client.messages.stream()`, prompt caching via `cache_control` blocks, and explicit timeout via `timeout` option. Requires Node 20+ (we run Node 22 already). Latest published 2026-05-29 — pin to `0.100.1` exact, NOT caret (the API surface has changed 22 times since 2026-02 — minors DO break). |
| `peter-evans/create-pull-request` | **v8** (8.1.1) | Idempotent draft-PR creation from a workflow run | The de facto auto-PR action with 5k+ stars; v8 supports `draft: true` as a one-line flag, signs commits as `github-actions[bot]` when using `GITHUB_TOKEN`, and is idempotent (a second workflow run on the same branch updates the same PR rather than creating a duplicate). Requires `contents: write` + `pull-requests: write`. |
| `gh CLI` | preinstalled on `ubuntu-latest` | `gh issue view`, `gh pr ready`, `gh pr comment`, `gh variable set`, `gh label create` | Already heavily used by `e2e-report-issue.mjs`, `weekly-digest.mjs`, `e2e-nightly.yml` label bootstrap. Stay consistent — every new auto-fix script should reach for `gh` first. |

### Supporting Libraries (NEW)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none) | — | Cost-ledger v2 persistence | **Reuse the existing `.llm-spend-ledger.json` schema and the `git commit && git push [skip ci]` pattern from `e2e-weekly-digest.yml` line 99-110.** No new lib needed. See "Cost Ledger Persistence" section. |
| (none) | — | Dependency-update | **Roll your own.** `npm outdated --json` → per-dep branch → `peter-evans/create-pull-request` already in the stack. No new bot. See "Dependency-Update Tools" section. |
| (none) | — | YAML linting of new workflows | Manual review is enough. v3.1 didn't add a linter for the 5 workflow files; v4.0 shouldn't either. |

### Development Tools (REUSE)

| Tool | Purpose | Notes |
|------|---------|-------|
| Existing `tests/e2e/lib/llm-driver.js` | The `invokeClaudePWithLedger` wrapper (subscription-local path) | Will be extended in v4.0 with a sibling `invokeAnthropicAPIWithLedger` (Anthropic SDK path) that reuses `appendLedgerEntry` from `llm-ledger.js`. **Both paths share the ledger schema.** |
| Existing `tests/e2e/lib/llm-ledger.js` | Cost ledger primitives | `appendLedgerEntry` already accepts arbitrary fields including `phase` and `source`. v4.0 adds `source: 'auto-fix-pr'` (API path) and `source: 'fix-issue-local'` (subscription path). The `$80/$100` cap logic is unchanged — same monthly budget, single combined view, two transports. |
| Existing `tests/e2e/lib/pdf-verifier.js` | Verifier-on-PR gate | Already takes a single case ID and re-parses the PDF independently. The PR-gate workflow will simply `checkout PR head → npm ci → npm run build:chrome → npx playwright test --grep <caseId>` (which invokes the verifier internally). Zero new code in the verifier. |
| Existing `scripts/promote-from-quarantine.mjs` | Auto-promote step | Already idempotent and human-triggered today. v4.0 wires it to `pull_request: types: [closed]` with `if: pr.merged && contains(pr.labels, 'auto-fix')`. |
| ESLint `no-restricted-imports` guard | Block direct `invokeClaudeP` calls outside the wrapper | Already in `eslint.config.js`. v4.0 extends with a parallel guard against direct `new Anthropic()` calls outside `tests/e2e/lib/anthropic-api.js` (new wrapper module). |

---

## Installation

```bash
# Core (NEW)
npm install -D @anthropic-ai/sdk@0.100.1

# Pin EXACT (no caret) — the SDK shipped 30+ minor releases in 2026-Q2;
# minor bumps DO break (e.g., the 0.97→0.98 batch namespace shape).
```

No other npm dependencies. The two GitHub Action versions (`peter-evans/create-pull-request@v8`, plus the existing `@v4` action family) live in `.github/workflows/*.yml`, not `package.json`.

---

## Detailed Findings (Per Question)

### 1. Anthropic SDK in Node — `@anthropic-ai/sdk@0.100.1`

**Package:** `@anthropic-ai/sdk` (TypeScript-first; works directly in Node ESM)
**Latest stable:** **0.100.1**, published **2026-05-29** (yesterday)
**Node minimum:** 20+ (we run Node 22 — fine)
**Repo:** https://github.com/anthropics/anthropic-sdk-typescript

**How it differs from headless `claude -p`:**

| Dimension | `claude -p` (subscription, v3.1) | `@anthropic-ai/sdk` (API, v4.0) |
|-----------|----------------------------------|----------------------------------|
| Auth | Logged-in Max 5 subscription session on dev machine | `ANTHROPIC_API_KEY` env var (GH secret) |
| Billing | Subscription credit pool (~$200/mo Max 5) | Per-token (Sonnet 4.6: $3/$15 per Mtok; Opus 4.7 legacy: $5/$25) |
| Runs in CI? | **NO** — `tests/e2e/lib/llm-ledger.js` line 85-93 throws if `CI` or `GITHUB_ACTIONS` env is set | **YES** — designed for headless/automation |
| Cost reporting | `total_cost_usd` field in JSON response (trust pre-computed per Pitfall 6) | `usage.input_tokens` + `usage.output_tokens` × model pricing table (manual compute) |
| Prompt caching | Supported via prompt-level instructions, no API surface | First-class via `cache_control: { type: 'ephemeral', ttl: '5m' \| '1h' }` blocks |
| Retries | None (single-shot subprocess) | Built-in `maxRetries: 2` with 1-2s exponential backoff on 429/5xx |
| Timeout | 60s subprocess SIGTERM | Per-request `timeout` option (ms) |

**Minimum-viable client setup (one-shot prompt):**

```js
// tests/e2e/lib/anthropic-api.js (NEW — sibling of llm-driver.js)
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  // apiKey defaults to process.env.ANTHROPIC_API_KEY
  maxRetries: 2,           // SDK default; explicit for clarity
  timeout: 120_000,        // 2 min for code-fix prompts (longer than triage's 60s)
});

const response = await client.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 4096,
  system: [
    {
      type: 'text',
      text: REPO_CONTEXT_PROMPT,    // ~5K tokens of repo structure + conventions
      cache_control: { type: 'ephemeral', ttl: '1h' }, // cache for the whole nightly run
    },
  ],
  messages: [{ role: 'user', content: issueBodyPlusFiles }],
});

// Cost computed manually from usage block (no total_cost_usd in API response)
const usd = computeUsd(response.model, response.usage); // see llm-pricing.js
appendLedgerEntry(LEDGER_PATH, {
  iso: new Date().toISOString(),
  model: response.model,
  cost_usd: usd,
  tokens_in: response.usage.input_tokens,
  tokens_out: response.usage.output_tokens,
  cache_creation_tokens: response.usage.cache_creation_input_tokens ?? 0,
  cache_read_tokens: response.usage.cache_read_input_tokens ?? 0,
  source: 'auto-fix-pr',
  phase: '40',  // or whichever v4 phase
});
```

**Streaming vs not streaming for v4.0:**
- **Don't stream.** Auto-fix is a batch operation inside a GitHub Actions step. Streaming complicates error handling and provides zero UX benefit (no human watching). Use `client.messages.create()`, not `client.messages.stream()`.
- Stream only if a future feature surfaces partial output to a human (e.g., a local `/gsd:fix-issue` watching mode). Out of scope for v4.0.

**Prompt caching — strongly recommended for v4.0:**
- The auto-fix prompt has a **stable prefix** (repo conventions, file structure, ERROR_CLASS taxonomy, golden baseline schema) shared across every issue. This is exactly what `cache_control` was built for.
- **Pricing:** Cache write costs 1.25x base (5-min TTL) or 2x base (1-hour TTL). **Cache read costs 0.1x base — 90% discount.**
- **Sonnet 4.6 minimum cacheable tokens:** 1,024 (Opus 4.7+ requires 4,096). Sonnet wins again here — easier cache hits.
- **Cache breakpoint placement:** Put `cache_control` on the system prompt block (stable repo context) — NOT on the user message (per-issue payload changes every call, killing the cache).
- **TTL choice:** `1h` for nightly batches (multiple issues in one run). Falls back to `5m` if only one issue per run.
- **Hit-rate monitoring:** Read `response.usage.cache_creation_input_tokens` and `cache_read_input_tokens` after every call; log to ledger entry. If `cache_read / (cache_read + cache_creation)` < 0.5 after 10 runs, the prompt prefix is unstable — diagnose.

**Pricing model — Sonnet 4.6 vs Opus 4.7 for code-fix prompts:**

| Model | Input $/Mtok | Output $/Mtok | Context | Verdict for auto-fix |
|-------|-------------:|--------------:|--------:|----------------------|
| `claude-sonnet-4-6` | $3 | $15 | 1M | **RECOMMENDED.** Fast latency tier, 1M context (more than enough for the 31k LOC repo + golden baseline), supports extended + adaptive thinking, cheapest cacheable model (1,024 min tokens). |
| `claude-opus-4-7` (legacy but stable) | $5 | $25 | 1M | Reserve for Tier-C ambiguous escalations (same gating pattern v3.1 uses for the triage classifier). Opus 4.7 was the SOTA at v3.1 ship; it is now "legacy" in the docs but still supported. |
| `claude-opus-4-8` (new "NextOpus") | $5 | $25 | 1M (200k on MS Foundry) | Released after v3.1 ship. Same pricing as Opus 4.7. **Not recommended for v4.0 launch** — wait for stability data; pin to 4.7 for the initial release and revisit at v4.1. |
| `claude-haiku-4-5` | $1 | $5 | 200k | Too small a context for repo-wide auto-fix prompts. Reserve for short triage helpers if added later. |

**Cost ceiling calculation (Sonnet 4.6 + cache):**
- Stable repo-context prefix: ~5,000 tokens → cache write 1x ($0.0375 first time, ttl 1h) → cache read 0.1x ($0.0015 per subsequent call)
- Per-issue body + file content: ~3,000 input tokens → $0.009 per call
- Patch output: ~1,500 tokens → $0.0225 per call
- **Per-issue total (cache hit):** ~$0.033
- **Monthly ceiling (60 issues/month):** ~$2 — well below the $80 warn threshold
- **Without caching:** $0.024 + $0.009 + $0.0225 = $0.0555 → $3.30/month
- **Savings from caching:** ~40% on input cost, ~30% overall. Worth the breakpoint placement work.

**Context window sizes (verified 2026-05-30):**
- Sonnet 4.6: **1M tokens** (Claude API)
- Opus 4.7 (legacy): 1M tokens
- Opus 4.8: 1M tokens (200k on Microsoft Foundry)
- Haiku 4.5: 200k tokens

The 31k LOC repo is ~620k tokens (rough estimate at 5 chars/token). It fits in a single 1M-token Sonnet 4.6 request — but you should NOT pass the whole repo. Pass the issue body + the specific file(s) referenced in the issue (already extracted by `issue-payload-builder.js` in v3.1).

**Pinning recommendation:**
- `package.json`: `"@anthropic-ai/sdk": "0.100.1"` (exact, no caret) — minor versions have shipped breaking changes throughout 2026-Q2.
- Reevaluate at every v4.x phase boundary.

---

### 2. GitHub Actions LLM Integration Patterns

**Best practice: raw script over action wrapper.**

The two options for invoking Claude from a workflow step:

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| `anthropics/claude-code-action@v1` | Official; auto-detects execution mode; auto-handles `@claude` mentions | Wraps Claude Code (the agent harness, not the bare SDK); implicit `allowedTools` requires careful config; NO documented per-issue cost-tracking hook; conflicts with our explicit `invokeClaudePWithLedger` cap discipline | **DO NOT use for v4.0.** Re-evaluate at v4.1 if Anthropic ships a cost-ledger-friendly mode. |
| `run: node scripts/auto-fix-pr.mjs` using `@anthropic-ai/sdk` directly | Explicit (every API call goes through `appendLedgerEntry`); easy to unit-test (mock the SDK); preserves the existing v3.1 architecture | More code than a one-liner action | **RECOMMENDED.** Composes cleanly with the existing primitives. |

**Secret handling for `ANTHROPIC_API_KEY`:**

```yaml
# .github/workflows/auto-fix-pr.yml (NEW)
name: Auto-Fix PR Proposer

on:
  issues:
    types: [labeled]

permissions:
  contents: write          # for branch push
  pull-requests: write     # for draft PR
  issues: write            # for "auto-fix-pending" status comment

jobs:
  propose:
    if: github.event.label.name == 'triage'   # gated on v3.1 triage label
    runs-on: ubuntu-latest
    timeout-minutes: 15
    env:
      ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}   # repo secret, not env var
      GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      ISSUE_NUMBER: ${{ github.event.issue.number }}        # env-var hop (CWE-94 defense)
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }

      - run: npm ci

      - name: Propose fix
        run: node scripts/auto-fix-propose.mjs --issue "$ISSUE_NUMBER"
        # Reads issue body via `gh issue view`, calls Anthropic SDK,
        # writes patch via `git apply`, leaves files dirty. Pure Node + gh CLI.

      - name: Create draft PR
        uses: peter-evans/create-pull-request@v8
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          branch: auto-fix/issue-${{ github.event.issue.number }}
          base: main
          title: "auto-fix: ${{ github.event.issue.title }}"
          body: |
            Closes #${{ github.event.issue.number }}
            <!-- cost-ledger:auto-fill from .github/.llm-ledger.json -->
          draft: true
          commit-message: "chore(auto-fix): proposed fix for #${{ github.event.issue.number }}"
          labels: auto-fix,e2e-pending-verifier
```

**Secret handling rules:**
1. `ANTHROPIC_API_KEY` MUST be a **repository secret**, not a repo variable. Variables are visible in logs and via `${{ vars.X }}` to PR contributors; secrets are masked.
2. Add the secret name to the action's `env` block, NEVER interpolated into a `run:` script body (CWE-94 — see existing v3.1 pattern in `e2e-nightly.yml` line 117).
3. Do NOT pass it as a CLI flag (`--api-key=...`); the SDK reads `process.env.ANTHROPIC_API_KEY` automatically.
4. The same env-var hop discipline that v3.1 uses for `LLM_RUN_ID` (line 116) applies to anything user-supplied — issue numbers are user-supplied via the `issues` event. Use `env: ISSUE_NUMBER: ${{ github.event.issue.number }}` then `"$ISSUE_NUMBER"` in the script body.

**Branch + commit + push pattern:**

Lean entirely on `peter-evans/create-pull-request@v8`:

```yaml
# Before the peter-evans step, your script (auto-fix-propose.mjs)
# just edits files in place. Don't run git commands.
- run: node scripts/auto-fix-propose.mjs --issue "$ISSUE_NUMBER"

# The action handles: git add ., git checkout -b auto-fix/issue-N, git commit, git push -u
- uses: peter-evans/create-pull-request@v8
  with: { draft: true, branch: auto-fix/issue-${{ github.event.issue.number }} }
```

This avoids: manual `git config user.email`, manual `git push -u`, manual race-condition handling on re-runs. The action is idempotent — a re-run on the same branch updates the existing PR rather than creating a duplicate.

**`gh pr ready` to flip draft → ready:**

Triggered from a SEPARATE workflow (the verifier-on-PR gate), NOT from the proposer:

```yaml
# .github/workflows/auto-fix-verify.yml (NEW)
on:
  pull_request:
    types: [opened, synchronize]
jobs:
  verify:
    if: contains(github.event.pull_request.labels.*.name, 'auto-fix')
    # ... build, run verifier on the affected case ...
    - name: Flip to ready-for-review on green
      if: success()
      env: { GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}, PR_NUMBER: ${{ github.event.pull_request.number }} }
      run: gh pr ready "$PR_NUMBER"
```

`gh pr ready` requires `pull-requests: write`. Declared in the verify workflow permissions block.

---

### 3. Dependency-Update Tools Comparison

**Current state of this repo:** No Dependabot config (`.github/dependabot.yml` absent), no Renovate config (no `renovate.json`). v4.0 is a clean slate.

| Tool | Pros | Cons for v4.0 specifically | Verdict |
|------|------|---------------------------|---------|
| **Dependabot** | Native GitHub integration; zero hosting; free security alerts | Cannot run a custom workflow (the nightly suite) as a pre-PR gate. The pattern is "Dependabot opens PR → Actions runs CI → human merges." We can't gate the PR open on the suite. Auto-merge requires a separate `dependabot/fetch-metadata` workflow. | NO — can't gate on nightly suite |
| **Renovate (Mend hosted)** | Free for OSS, 400+ config options, schedules, grouping, automerge gated on status checks | Overkill for 8 dev-deps. `automerge: true` with `automergeType: 'platform'` *can* wait for our nightly cron status check, but configuring it adds a `renovate.json` + a hosted-bot GitHub App integration. Adds an external service to the trust chain. | NO — supply-chain risk + overkill |
| **Roll your own** (recommended) | Zero new deps, zero new services, full control of the gate logic, reuses `peter-evans/create-pull-request@v8` (already in the stack for auto-fix), shares the same `.github/workflows/auto-*` namespace | More YAML to write upfront (~50 lines) | **YES** |

**Recommended pattern (roll-your-own, ~50 lines):**

```yaml
# .github/workflows/deps-weekly.yml
name: Weekly Dependency Updates

on:
  schedule:
    - cron: '0 9 * * 2'   # Tuesday 09:00 UTC (Mon is digest day)
  workflow_dispatch: {}

permissions:
  contents: write
  pull-requests: write

jobs:
  outdated:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    outputs:
      deps: ${{ steps.scan.outputs.deps }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - id: scan
        run: |
          OUTDATED=$(npm outdated --json || true)
          # Filter to the deps we care about
          FILTERED=$(echo "$OUTDATED" | jq -c '
            with_entries(select(.key as $k | ["@playwright/test","pdfjs-dist","sharp","vitest","esbuild","@napi-rs/canvas","eslint","@anthropic-ai/sdk"] | index($k)))
          ')
          echo "deps=$FILTERED" >> "$GITHUB_OUTPUT"

  propose-update:
    needs: outdated
    if: needs.outdated.outputs.deps != '{}'
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        # Expanded by reading needs.outdated.outputs.deps via fromJson
        dep: ${{ fromJson(needs.outdated.outputs.deps) }}
    steps:
      - uses: actions/checkout@v4
      - run: npm install ${{ matrix.dep.key }}@${{ matrix.dep.latest }}
      - uses: peter-evans/create-pull-request@v8
        with:
          branch: deps/${{ matrix.dep.key }}-${{ matrix.dep.latest }}
          title: "chore(deps): bump ${{ matrix.dep.key }} to ${{ matrix.dep.latest }}"
          body: |
            Auto-generated weekly dependency bump.
            **Gate:** This PR is auto-marked ready-for-review by the nightly E2E workflow after a clean run on this branch.
          draft: true   # mirrors auto-fix flow — gated on nightly suite
          labels: deps-update
```

Then the existing `e2e-nightly.yml` is extended with a `pull_request` trigger on `deps-update`-labeled PRs that flips draft→ready on green (same `gh pr ready` pattern as auto-fix).

**Why this is better than Renovate for THIS repo:**
1. The gate (`npm run e2e:regression && npm run e2e:smoke && npm run test:lint && npm run test`) is a custom workflow Renovate can wait on only via `automergeType: 'platform'` + branch protection — two more configurations.
2. The repo has 8 deps worth auto-bumping (`@playwright/test`, `pdfjs-dist`, `sharp`, `vitest`, `esbuild`, `@napi-rs/canvas`, `eslint`, plus the new `@anthropic-ai/sdk`). Renovate's 400 config options are overhead.
3. Reusing `peter-evans/create-pull-request@v8` (already in the stack for auto-fix) keeps the surface area small.
4. We apply the SAME draft → verifier-ready → merge pattern to dep updates that we use for auto-fixes — one mental model.

---

### 4. Cost Ledger Persistence Options

**Constraints:**
- Ledger must be durable across Actions runs (workflow re-spawns are stateless).
- Must support concurrent reads (two `auto-fix-pr` workflow runs racing on the same issue).
- Must remain auditable — the $80/$100 cap is the trust invariant.
- Existing v3.1 schema (`tests/e2e/.llm-spend-ledger.json`) is the source of truth and shouldn't be reshaped.

**Options scored:**

| Option | Durability | Race-safety | Auditability | Cost | Verdict |
|--------|-----------|-------------|--------------|------|---------|
| **Git-commit `.github/.llm-ledger.json` with `[skip ci]`** (recommended) | High — lives in repo, replicated on every clone | OK with shared concurrency group `cost-ledger-write` across all ledger-writing workflows | Excellent — every entry is a commit, git log shows the spend trajectory | Free | **YES** — matches the `weekly-digest` pattern already in this repo (`e2e-weekly-digest.yml` line 98-110) |
| GH Actions cache (`actions/cache@v4`) | Medium — caches evict after 7 days of no access, max 10GB org-wide | Cache writes are atomic per-key but reads are last-write-wins | Poor — caches aren't browsable | Free | NO — eviction window is too short for monthly billing windows |
| Repo variable (`gh variable set`) | High — persists indefinitely | Bad — `gh variable set` is read-modify-write with no compare-and-swap; concurrent runs WILL lose entries | OK — visible in repo settings | Free | NO — race condition; max 48KB per var (our ledger could exceed this in 1-2 years) |
| Artifact (`actions/upload-artifact@v4`) | Low — artifacts expire (retention-days, default 90, max 400) | Bad — no atomic replace | Decent — downloadable | Free | NO — retention horizon shorter than the billing surveillance window |
| Cloudflare KV (already used by the extension) | High | Medium — KV is eventually consistent (60s) | OK — separate dashboard from GitHub | Free at our scale | NO — adds an external service to the trust chain; KV is for the *extension's* cache, mixing roles is bad hygiene |

**Recommendation: git-commit pattern, mirroring `e2e-weekly-digest.yml` lines 98-110:**

```yaml
- name: Commit ledger update
  if: always()    # commit even on auto-fix failure (the spend already happened)
  env: { GH_TOKEN: ${{ secrets.GITHUB_TOKEN }} }
  run: |
    git config user.name "github-actions[bot]"
    git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
    git add .github/.llm-ledger.json
    git diff --cached --quiet || git commit -m "chore(ledger): auto-fix #$ISSUE_NUMBER spend [skip ci]"
    git push
```

**Critical gotcha: the v3.1 `.gitignore` excludes the ledger** (`tests/e2e/lib/llm-ledger.js` line 30 comment: "The ledger file MUST be gitignored ... committing it would publicly leak the developer's monthly spend pattern"). For v4.0:

- **Keep the dev-machine ledger gitignored** (`tests/e2e/.llm-spend-ledger.json`).
- **Add a separate, committed CI ledger** at `.github/.llm-ledger.json` (new path, NOT gitignored).
- Both ledgers share the same schema (`appendLedgerEntry`).
- The `$80/$100` cap is computed across BOTH ledgers (a new helper in `llm-ledger.js`: `combinedMonthlyTotal(localLedger, ciLedger)`).
- This avoids leaking the dev's local subscription spend pattern while making CI spend auditable.

**Race-safety:** Both `e2e-nightly.yml` and the new `auto-fix-pr.yml` (and `deps-weekly.yml` if it ever logs spend, which it shouldn't) need a shared static concurrency group at the LEDGER-WRITE STEP level:
```yaml
# NOT workflow-level — only on the commit step
- name: Commit ledger update
  # ...
```
Workflow-level concurrency on auto-fix would serialize ALL auto-fix issue events, which is heavy-handed. Instead, use a brief `flock`-style discipline: the proposer reads the current ledger, writes the entry locally, then commits. Two racing proposers will produce two commits; the second `git push` fails fast on non-fast-forward, the workflow retries with `git pull --rebase`. This is the same pattern v3.1's weekly-digest uses implicitly (single weekly cron, no contention proven).

**For belt-and-suspenders:** add a shared workflow-level concurrency group on the auto-fix workflow specifically (it can serialize since auto-fix events are not latency-sensitive):
```yaml
concurrency:
  group: auto-fix-proposer    # serializes ALL issue-labeled events
  cancel-in-progress: false
```
Acceptable because triaged issues land sequentially (one per nightly run typically) and the proposer takes ~30s — queuing 5 events behind a 30s call is fine.

**Per-issue cost stamping in PR body:**

The proposer script reads `appendLedgerEntry`'s entry (or the entry it just wrote), then injects into the PR body via a `<!-- cost-ledger: --> ... <!-- /cost-ledger -->` HTML comment block. The `peter-evans/create-pull-request@v8` action accepts the body verbatim. On subsequent updates to the same PR (re-runs), the action UPSERTS the body — the cost stamp updates idempotently.

---

### 5. Verifier-on-PR Mechanics

**Existing primitives that fit:**
- `tests/e2e/lib/pdf-verifier.js` (Phase 28) — independent 4-tier PDF re-parser. Takes a `caseId`, returns Tier A/B/C/D verdict.
- `tests/e2e/specs/regression.spec.js` — the Playwright spec that drives the extension and asserts `regression-baseline.json`.
- `npx playwright test --grep <caseId>` — already used by `e2e-nightly.yml` line 199-202 to run a single case (`steps.cases.outputs.cases` is a pipe-OR'd grep pattern).

**Recommended workflow (NEW `.github/workflows/auto-fix-verify.yml`):**

```yaml
name: Auto-Fix PR Verifier

on:
  pull_request:
    types: [opened, synchronize]

permissions:
  contents: read
  pull-requests: write    # for gh pr ready, gh pr comment

concurrency:
  group: auto-fix-verify-${{ github.event.pull_request.number }}
  cancel-in-progress: true

jobs:
  verify:
    if: contains(github.event.pull_request.labels.*.name, 'auto-fix')
    runs-on: ubuntu-latest
    timeout-minutes: 15
    env:
      GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      PR_NUMBER: ${{ github.event.pull_request.number }}
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.pull_request.head.sha }}

      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }

      - run: npm ci

      - name: Cache Playwright Chromium
        id: playwright-cache
        uses: actions/cache@v4
        with:
          path: ~/.cache/ms-playwright
          key: pw-${{ runner.os }}-${{ hashFiles('package.json') }}

      - name: Install Playwright Chromium
        if: steps.playwright-cache.outputs.cache-hit != 'true'
        run: npx playwright install chromium

      - name: Extract caseId from issue
        id: case
        run: |
          # PR body has "Closes #N" — read N's body, extract case-id-XYZ from line 1
          ISSUE_NUMBER=$(gh pr view "$PR_NUMBER" --json body -q .body | grep -oP 'Closes #\K\d+')
          CASE_ID=$(gh issue view "$ISSUE_NUMBER" --json body -q .body | head -1 | grep -oP 'case=\K[A-Z0-9-]+')
          echo "case_id=$CASE_ID" >> "$GITHUB_OUTPUT"

      - name: Build + verify single case
        run: |
          npm run build:chrome
          npx playwright test \
            --config tests/e2e/playwright.config.js \
            --grep "${{ steps.case.outputs.case_id }}" \
            specs/regression.spec.js

      - name: Assert Tier A/B verifier pass
        run: |
          node -e "
            const r = JSON.parse(require('fs').readFileSync('tests/e2e/artifacts/${{ github.run_id }}/report.json'));
            const target = r.cases.find(c => c.caseId === '${{ steps.case.outputs.case_id }}');
            if (!target) { console.error('case not found in report'); process.exit(1); }
            if (!['A', 'B'].includes(target.verifierTier)) {
              console.error('verifier returned tier', target.verifierTier, '— expected A or B');
              process.exit(1);
            }
            console.log('verifier passed Tier ' + target.verifierTier);
          "

      - name: Flip draft to ready-for-review
        if: success()
        run: gh pr ready "$PR_NUMBER"

      - name: Comment failure
        if: failure()
        run: gh pr comment "$PR_NUMBER" --body "verifier failed — see workflow logs at ${{ github.run_id }}"
```

**GitHub Action constructs that help:**

| Construct | Use | Why this one |
|-----------|-----|--------------|
| `actions/checkout@v4` with `ref: github.event.pull_request.head.sha` | Check out the PR head, not main | Default checkout fetches the base ref on PRs — explicit head SHA is required for verifier-on-PR |
| `actions/cache@v4` for Playwright Chromium | Cache the ~150MB browser binary across PR re-verifications | Already used in `e2e-nightly.yml` line 73-77 — copy the pattern |
| `actions/github-script@v7` | Inline JS for complex API calls | **NOT needed for v4.0** — `gh` CLI is enough for label checks, PR ready flip, comment. github-script adds an octokit dep we don't want. |
| `peter-evans/create-pull-request@v8` | Used by the PROPOSER, NOT the verifier | The verifier only flips status; doesn't open PRs. |
| `gh pr ready "$PR"` | Flip draft → ready | Native gh CLI, no action needed |
| `gh pr comment "$PR" --body` | Surface failures inline | Native gh CLI |
| `concurrency.group: auto-fix-verify-${{ pr_number }}` + `cancel-in-progress: true` | Avoid stale verifications on rapid synchronize events | Standard pattern for PR-scoped workflows |

**Why NOT use `peter-evans/create-pull-request@v8` for the verifier:**
- It's for CREATING PRs, not gating them. The verifier just runs tests and flips status — no new commits, no new branches.

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `@anthropic-ai/sdk` direct calls + `appendLedgerEntry` | `anthropics/claude-code-action@v1` | If v4.x ships a "BYO ledger" mode that respects our cost cap; revisit at v4.1. |
| Sonnet 4.6 as default fix model | Opus 4.7 for everything | When the auto-fix prompt regularly fails on Sonnet (≥30% Tier-D verdicts in week 1) — escalate to Opus per-call with the existing v3.1 Tier-C gate pattern. |
| `peter-evans/create-pull-request@v8` | Custom shell (`git push -u origin auto-fix/... && gh pr create --draft`) | If a future repo policy mandates verified/signed commits with developer keys — then a custom step using a `gpg-import` action is unavoidable. |
| Roll-your-own deps workflow + `peter-evans/create-pull-request@v8` | Renovate (Mend-hosted) | When dep surface grows past ~20 packages and grouping/PR-rules become valuable. v4.0's 8 deps don't justify Renovate's 400-option surface area. |
| Git-committed CI ledger at `.github/.llm-ledger.json` | GH Actions cache for ledger | Never. Cache eviction breaks the monthly cap audit. |
| Shared concurrency group on the `auto-fix-pr.yml` workflow | Per-step ledger locks via `flock` | If ledger writes outgrow ~10/min and serializing the whole workflow becomes too slow — but that's a smell; serialize is fine for v4.0. |
| `gh pr ready` to flip draft → ready | `actions/github-script@v7` calling Octokit `pulls.update({ draft: false })` | If a future need is to ALSO update the PR title/body atomically with the ready-flip — github-script gets you that in one API call. Otherwise gh CLI is simpler. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `anthropics/claude-code-action@v1` in v4.0 launch | Wraps Claude Code (the agentic harness) not the bare SDK; auto-detects modes in ways that fight explicit cost-ledger discipline; no documented per-call cost-tracking hook | `@anthropic-ai/sdk@0.100.1` directly invoked in a `node scripts/auto-fix-propose.mjs` step |
| Dependabot for the weekly dep update | Cannot run our nightly E2E suite as a pre-PR gate; auto-merge requires a separate fetch-metadata workflow | Roll-your-own `npm outdated --json` + `peter-evans/create-pull-request@v8` |
| Renovate (Mend hosted) for THIS repo | Overkill for 8 deps; adds external service to trust chain | Same as above |
| Caret-range pin (`^0.100.1`) on `@anthropic-ai/sdk` | The SDK has shipped 30+ minor versions in 2026-Q2; minors WILL break (batch namespace shape changed in 0.98) | Exact pin `0.100.1`, reevaluate per-phase |
| `claude-opus-4-8` (NextOpus) as default fix model in v4.0 | Released after v3.1 ship; no production data; same pricing as Opus 4.7; risk of beta-tier behavior changes mid-milestone | Pin `claude-sonnet-4-6` as default; reserve Opus 4.7 (legacy but stable) for Tier-C escalations; revisit Opus 4.8 at v4.1 |
| `claude-haiku-4-5` for auto-fix | 200k context too small for repo+issue+files context window | Sonnet 4.6 (1M context) |
| `actions/github-script@v7` for `gh pr ready` | Adds Octokit dep; one extra abstraction layer; harder to debug than `gh` CLI | `gh pr ready "$PR_NUMBER"` — native and consistent with v3.1 |
| Repo variables (`gh variable set`) for ledger persistence | Race condition (read-modify-write, no CAS); 48KB cap; not git-history-auditable | Git-committed `.github/.llm-ledger.json` with `[skip ci]` |
| `actions/cache@v4` for ledger persistence | 7-day eviction window invalidates the monthly cap audit | Same — git commit pattern |
| Streaming (`client.messages.stream()`) in auto-fix flow | Zero UX benefit in headless workflow; complicates error handling | `client.messages.create()` batch call |
| Caching `cache_control` on the user message block | User message changes every issue → cache miss every time → 1.25x WRITE cost every time, no read savings | `cache_control` on the SYSTEM block (stable repo context), TTL `1h` |
| Storing `ANTHROPIC_API_KEY` as a repo variable | Variables are visible in logs and via `${{ vars.X }}` interpolation; secrets are masked | Repo **secret**: `${{ secrets.ANTHROPIC_API_KEY }}` |
| Interpolating `${{ github.event.issue.number }}` directly inside a `run:` script body | CWE-94 shell injection if a future schema change permits non-numeric values | Env-var hop: `env: ISSUE_NUMBER: ${{ ... }}` then `"$ISSUE_NUMBER"` |

---

## Stack Patterns by Variant

**If LLM auto-fix runs in CI (paid path):**
- Use `@anthropic-ai/sdk@0.100.1` via `invokeAnthropicAPIWithLedger` (new sibling of existing `invokeClaudePWithLedger`).
- Model: `claude-sonnet-4-6` default, `claude-opus-4-7` for Tier-C escalations.
- Auth: `ANTHROPIC_API_KEY` repo secret.
- Ledger: write to `.github/.llm-ledger.json` (git-committed).
- Cap check: combined monthly total across both ledgers vs `$80`/`$100`.

**If LLM auto-fix runs locally (free dev iteration via `/gsd:fix-issue <n>`):**
- Use existing `tests/e2e/lib/llm-driver.js` → `invokeClaudePWithLedger` (`claude -p` subprocess).
- Auth: developer's logged-in Max 5 subscription.
- Ledger: write to `tests/e2e/.llm-spend-ledger.json` (gitignored, dev-machine-local).
- CI guard (`process.env.CI || process.env.GITHUB_ACTIONS`) FORCES this path to refuse running in CI — no change needed from v3.1.

**If running the nightly suite as a gate before a deps-update PR is marked ready:**
- Identical to the auto-fix verifier workflow above, just `pull_request` event scoped to `deps-update` labeled PRs and runs the FULL regression spec, not just one case.

**If a Tier-C ambiguous escalation is needed for an auto-fix:**
- Phase 1: Sonnet 4.6 attempt.
- Phase 2: If Sonnet returns "low-confidence" or the patch fails verifier on a re-run, escalate to Opus 4.7 (1.7x cost).
- Phase 3: If Opus also fails verifier, re-quarantine the issue with `FLAKE` re-classification (matching the v3.1 quarantine pattern).
- The two-tier model gate mirrors the v3.1 heuristic-then-LLM hybrid triage pattern.

---

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `@anthropic-ai/sdk@0.100.1` | Node 20+ | We run Node 22 — fine |
| `@anthropic-ai/sdk@0.100.1` | ESM imports | `import Anthropic from '@anthropic-ai/sdk'` — works with `"type": "module"` in our `package.json` |
| `peter-evans/create-pull-request@v8` | `actions/checkout@v4` | Action handles git config + commit + push internally; just `actions/checkout@v4` is the prerequisite |
| `peter-evans/create-pull-request@v8` | `GITHUB_TOKEN` default | Needs `contents: write` + `pull-requests: write` permissions; signs as `github-actions[bot]` |
| `gh pr ready` | `gh@2.x` | Pre-installed on `ubuntu-latest`; no version pin needed in workflow |
| `claude-sonnet-4-6` prompt caching | `@anthropic-ai/sdk@^0.50.0+` | `cache_control` supported since pre-2026; minimum cacheable tokens for Sonnet 4.6 is 1,024 |
| Existing `tests/e2e/lib/llm-ledger.js` `appendLedgerEntry()` | New `source: 'auto-fix-pr'` field | Already accepts arbitrary fields via spread (line 337) — no schema change required |
| Existing `tests/e2e/lib/pdf-verifier.js` | Verifier-on-PR workflow | No change — `--grep <caseId>` invocation is already supported (`e2e-nightly.yml` line 199) |

---

## Integration Points with Existing v3.1 Primitives

| v3.1 primitive | v4.0 usage | Change required |
|----------------|-----------|-----------------|
| `tests/e2e/lib/llm-driver.js` `invokeClaudePWithLedger` | Used by local `/gsd:fix-issue <n>` for subscription path | None — unchanged |
| `tests/e2e/lib/llm-ledger.js` `appendLedgerEntry` | Used by both paths (subscription local + API CI) | Add a `combinedMonthlyTotal(localLedger, ciLedger)` helper |
| `tests/e2e/lib/pdf-verifier.js` | Re-used in verifier-on-PR workflow | None — `--grep <caseId>` is already the existing API |
| `lib/issue-payload-builder.js` | Read by auto-fix proposer to extract `caseId`, `failingFile`, `verifierWindow` from issue body | None — already structured; just parse the issue body |
| `scripts/promote-from-quarantine.mjs` | Auto-triggered on merged auto-fix PR with `auto-fix` label | None — script already idempotent; add a new workflow that calls it on `pull_request: types: [closed]` |
| `scripts/quarantine-append.mjs` | Used by failure path when verifier-on-PR fails (escalates to re-quarantine) | None — script accepts the failure verdict |
| `scripts/e2e-report-issue.mjs` | Used by the verifier-on-PR FAILURE path to comment on the issue | None — `gh pr comment` reuses the same fingerprint scheme |
| ESLint `no-restricted-imports` guard | Extended to block `new Anthropic()` outside `tests/e2e/lib/anthropic-api.js` (NEW) | Add one more `paths` entry to the guard |
| `e2e-nightly.yml` concurrency group | Shared with new `auto-fix-pr.yml` workflow | Add `concurrency.group: auto-fix-proposer` to the new workflow (separate from `e2e-nightly`) |
| Labels: `triage`, `e2e-quarantine`, `quarantine:ready-for-promotion` | Triggers for the auto-fix proposer (`on: issues, types: [labeled], if: github.event.label.name == 'triage'`) | None — labels already exist; v4.0 just consumes them |
| New label: `auto-fix` | Applied by the proposer on PR creation | Bootstrap step in `auto-fix-pr.yml` mirroring `e2e-nightly.yml` label-create pattern (line 97-105) |
| New label: `e2e-pending-verifier` | Applied while verifier runs | Same bootstrap pattern |
| 8 ERROR_CLASSES | Per-class prompt strategy in the proposer (WRONG_CITATION primary; FLAKE explicitly NOT proposed) | Encode in a new `lib/auto-fix-prompts.js` — one prompt builder per non-FLAKE class |

---

## Sources

- [Anthropic — Client SDKs (platform.claude.com)](https://platform.claude.com/docs/en/api/client-sdks) — verified 2026-05-30 (HIGH confidence; official docs)
- [Anthropic — Prompt Caching mechanics](https://platform.claude.com/docs/en/docs/build-with-claude/prompt-caching) — verified 2026-05-30 (HIGH confidence; pricing tables, `cache_control` syntax, TTL options)
- [Anthropic — Models overview](https://platform.claude.com/docs/en/docs/about-claude/models) — verified 2026-05-30 (HIGH confidence; confirmed Opus 4.8 is current default in NextOpus, Opus 4.7 is now "legacy", Sonnet 4.6 is current Sonnet, Haiku 4.5 is current Haiku, pricing tables verified)
- [npm — @anthropic-ai/sdk@0.100.1](https://www.npmjs.com/package/@anthropic-ai/sdk) — verified via `npm view` 2026-05-30 (HIGH confidence; latest published 2026-05-29)
- [peter-evans/create-pull-request@v8 (8.1.1)](https://github.com/peter-evans/create-pull-request) — verified 2026-05-30 (HIGH confidence; tag 8.1.1 published 2026-04-10)
- [gh CLI — `gh pr ready` / `gh variable set`](https://cli.github.com/manual/) — verified 2026-05-30 (HIGH confidence; pre-installed on `ubuntu-latest`)
- [GitHub Docs — Variables reference, size limits](https://docs.github.com/en/actions/reference/workflows-and-actions/variables) — verified 2026-05-30 (HIGH confidence; 48KB per var, 256KB total per workflow)
- [Renovate vs Dependabot 2026 (Renovate docs)](https://docs.renovatebot.com/bot-comparison/) — verified 2026-05-30 (MEDIUM confidence; multiple sources agree, no contradicting info, but ecosystem moves quickly)
- [anthropics/claude-code-action v1 docs](https://github.com/anthropics/claude-code-action) — verified 2026-05-30 (MEDIUM confidence; v1 GA on 2025-08-26; no documented cost-ledger integration pattern, supporting our decision to NOT use it for v4.0)
- Internal: `.planning/PROJECT.md` (v3.1 ship summary 2026-05-30); `tests/e2e/lib/llm-driver.js` and `tests/e2e/lib/llm-ledger.js` (existing primitives); `.github/workflows/e2e-nightly.yml` (CI patterns to extend); `.github/workflows/e2e-weekly-digest.yml` lines 98-110 (git-commit ledger pattern proof) — HIGH confidence; read directly.

---

*Stack research for: v4.0 Self-Healing Test Suite (additive to v3.0+v3.1 testing harness)*
*Researched: 2026-05-30*

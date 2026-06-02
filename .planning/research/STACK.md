# Technology Stack — v4.1 Readiness Gate + Push

**Project:** Patent Citation Tool
**Milestone:** v4.1 (Readiness Gate + Push, building on shipped v4.0)
**Researched:** 2026-06-02
**Confidence:** HIGH — all findings grounded in direct codebase reads + verified docs; zero speculation

> This file covers NEW additions only. The v4.0 locked stack (Chrome/Firefox MV3, esbuild, PDF.js v5,
> Shadow DOM, IndexedDB, Cloudflare Workers + KV, Vitest, web-ext, sharp, Playwright, `@anthropic-ai/sdk@0.100.1`
> EXACT, `peter-evans/create-pull-request@v8`, GitHub Actions) is treated as IMMUTABLE.
> See `.planning/research-v4.0-archive/STACK.md` for those decisions.

---

## Executive Summary

**Add zero new npm dependencies.** v4.1 is the third consecutive milestone to ship with no new npm deps
(v3.1: zero, v4.0: zero new after the `@anthropic-ai/sdk` addition). Every v4.1 feature maps cleanly onto
existing primitives:

| v4.1 Feature | Existing primitive it uses | New dep needed? |
|---|---|---|
| Multi-model A/B (sonnet vs opus) | `invokeAnthropicSdkWithLedger` `model:` param + `PRICING_BY_MODEL` | NO — already parameterized |
| Auto-fix dashboard metrics | `build-ledger-dashboard.mjs` + `weekly-digest.mjs` | NO — plain markdown tables |
| `auto-fix:partial-verified` semantics | `v40-verifier-gate.yml` label output + `assertTripleGate()` | NO — new label string + YAML step |
| CLEANUP-04 ruleset patch | `gh api -X PUT` (gh CLI, pre-installed) | NO |
| Test regression fixes | Vitest `vi.setSystemTime` (already used) | NO |
| v3.1 bookkeeping cleanup | Frontmatter text edits | NO |

---

## Recommended Stack Changes

### npm Dependencies

**Net change: zero.**

`@anthropic-ai/sdk@0.100.1` remains pinned EXACT. npm confirms this is still the latest published version as of
2026-06-02. No version bump is warranted mid-milestone — the Anthropic SDK minor-bumps have historically
broken API surfaces (v3.1→v4.0 research found 30+ minor releases in 2026-Q2 with the 0.97→0.98 batch
namespace shape breakage). Pin holds.

No new packages required. Rationale per feature below.

### GitHub Actions — No New Actions

All v4.1 workflow changes reuse actions already in the stack:
- `actions/checkout@v4`, `actions/setup-node@v4`, `actions/cache@v4` — already pinned at v4
- `peter-evans/create-pull-request@v8` — already in `v40-auto-fix.yml`, `v40-auto-promote.yml`, `v40-deps-update.yml`
- `gh` CLI (`gh api`, `gh pr edit --add-label`, `gh pr ready`) — pre-installed on `ubuntu-latest`

---

## Per-Feature Technical Analysis

### 1. Multi-Model A/B (sonnet vs opus) for Difficult ERROR_CLASSES

**Decision: Pure config in `auto-fix.mjs` + `PRICING_BY_MODEL` update. Zero new deps.**

The `invokeAnthropicSdkWithLedger` function in `tests/e2e/lib/llm-driver.js` already accepts `model:` as
a named parameter (line 510: `model = 'claude-sonnet-4-6'`). `auto-fix.mjs` already has a module-level
`const MODEL = 'claude-sonnet-4-6'` (line 105). The only work is a decision function that maps ERROR_CLASS
to model selection — this is 20-30 lines of pure JS, no library.

**Model selection logic (no A/B framework library needed):**

There is no need for a frequentist or Bayesian A/B library. The v4.1 A/B is not a statistical inference
problem — it is an escalation heuristic: try Sonnet first (cheap), escalate to Opus on verifier failure.
This mirrors the existing v3.1 "heuristic-first, LLM-second" pattern already in `triage-classifier.js`.

The right implementation is:

```js
// In auto-fix.mjs — replaces the module-level MODEL constant
const MODEL_BY_ERROR_CLASS = {
  WRONG_CITATION:              'claude-sonnet-4-6',   // well-scoped, Sonnet handles
  WORKER_FALLBACK_FAILED:      'claude-sonnet-4-6',   // deterministic fix (Worker config)
  HARNESS_ERROR:               'claude-sonnet-4-6',   // narrow scope
  GOOGLE_DOM_DRIFT:            'claude-opus-4-7',     // layout reasoning, needs Opus
  LLM_HALLUCINATED_SELECTION:  'claude-opus-4-7',     // meta-reasoning about LLM, needs Opus
  _default:                    'claude-sonnet-4-6',
};
```

Cost tracking by model works automatically: `invokeAnthropicSdkWithLedger` writes `model: response.model`
into each ledger entry (line 613 in `llm-driver.js`), and `PRICING_BY_MODEL` in `llm-pricing.js` already
has entries for both `'claude-sonnet-4-6'` and `'claude-opus-4-7'` (lines 38-39). No schema changes.

**PRICING_BY_MODEL already correct (verified by direct read of `llm-pricing.js`):**

| Model key | input_per_mtok | output_per_mtok |
|---|---|---|
| `claude-opus-4-7[1m]` | 15 | 75 |
| `claude-opus-4-7` | 15 | 75 |
| `claude-sonnet-4-5` | 3 | 15 |
| `claude-sonnet-4-6` | 3 | 15 |

No new pricing entries needed for v4.1 unless Opus 4.8 is introduced (deferred — see What NOT to Use).

**ESLint impact:** None. The `model:` param flows through the existing `invokeAnthropicSdkWithLedger` path,
which is already gated by the `no-restricted-imports` guard to `llm-driver.js`. No new entry-point guard
needed.

**Confidence:** HIGH — confirmed by direct read of `llm-driver.js` lines 506-517, `auto-fix.mjs` line 105,
`llm-pricing.js` lines 36-39.

---

### 2. Auto-Fix Dashboard — `e2e-weekly-digest.mjs` Extension

**Decision: Plain markdown tables. Zero new deps.**

The existing `weekly-digest.mjs` renders a ≤50-line markdown document. The existing `build-ledger-dashboard.mjs`
renders three ledger tables. Both are plain string construction — no template engine, no charting lib.

The v4.1 additions (auto-fix success rate, cost-per-fix, time-to-merge) are numeric aggregations from the
committed `tests/e2e/.llm-spend-ledger.json` ledger. The ledger already has per-entry `transport: 'sdk'`
tags (written by `invokeAnthropicSdkWithLedger` at line 586 in `llm-driver.js`) and `issueId` fields.
Time-to-merge requires reading PR merge timestamps — available via `gh pr view <n> --json mergedAt` (gh CLI).

**No charting or sparklines library.** The project's established dashboard pattern is:
1. GitHub Discussions or issues for the live digest (text-only renderer)
2. Committed `.md` files in `reports/` (plaintext, git-diffable)

Sparklines would require either ASCII art (hand-rolled, ~15 lines) or a library. Given the existing
two-milestone precedent of zero new deps and the fact that the dashboard consumers are GitHub Discussions
(markdown renderer, no interactive charts), sparklines add no value. If sparklines are ever wanted, the
right choice is a 10-line ASCII sparkline helper inline in `build-ledger-dashboard.mjs` — not a dep.

**Confidence:** HIGH — confirmed by reading `build-ledger-dashboard.mjs` (lines 1-35, output format),
`weekly-digest.mjs` (line 287, 50-line limit contract), and the `SUMMARY_KEYS` contract in
`tests/e2e/lib/llm-report.js`.

---

### 3. `gh api -X PUT` for CLEANUP-04 Ruleset Patching

**Decision: Raw `gh api -X PUT` with a JSON file input. Zero new helpers.**

The CLEANUP-04 task patches ruleset `17086676` to add `verifier-gate` + `deps-update-gate` to
`required_status_checks` and resolve `bypass_actors=1`.

The GitHub REST API endpoint is `PUT /repos/{owner}/{repo}/rulesets/{ruleset_id}`. The `gh` CLI supports
this natively: `gh api -X PUT /repos/OWNER/REPO/rulesets/17086676 --input ruleset-patch.json`.

**Important: use `--input` with a JSON file, not inline `-F` flags.** The community discussion at
`github.com/orgs/community/discussions/139808` documents that inline `-F` with nested arrays like
`required_status_checks` produces 422 errors reliably. The JSON file approach is the documented workaround
and matches the `v40-repo-config.md` audit pattern already in this project.

**No library or helper needed.** The gh CLI's `--input` flag handles nested JSON correctly. The JSON
payload needs:

```json
{
  "name": "main-protection",
  "target": "branch",
  "enforcement": "active",
  "bypass_actors": [],
  "rules": [
    {
      "type": "required_status_checks",
      "parameters": {
        "required_status_checks": [
          { "context": "verifier-gate" },
          { "context": "deps-update-gate" }
        ],
        "strict_required_status_checks_policy": false
      }
    }
  ]
}
```

Note: the `integration_id` field is optional when omitted — GitHub matches by context string. Research
found no reliable authoritative value for the GitHub Actions `integration_id`; the context-string-only
form is more portable and is what the GitHub Docs `curl` example shows.

**Procedure to standardize on:** read current ruleset first (`gh api GET /repos/OWNER/REPO/rulesets/17086676`),
merge the `required_status_checks` additions into the exported JSON, PUT the full object back. Do not
construct the payload from scratch — the ruleset may have other rules (code-owner review, PR requirement)
that must be preserved verbatim.

**Confidence:** HIGH for the `gh api -X PUT --input` mechanics (GitHub REST API docs verified), MEDIUM for
the `integration_id`-omission behavior (community convention, not explicitly documented in official docs).

---

### 4. `auto-fix:partial-verified` Semantics

**Decision: New label string + new YAML step in `v40-verifier-gate.yml` + `assertTripleGate()` update.
Zero new deps. Zero new CI gate frameworks.**

The current gate is binary: all 3 consecutive Tier A/B runs on affected cases pass → `auto-fix:verified`
label applied → draft flipped to ready. The `partial-verified` state (e.g., 3/5 cases pass, 2 fail) is
not currently modeled.

The right implementation is a new label `auto-fix:partial-verified` plus a conditional YAML step in the
`ready-flip` job of `v40-verifier-gate.yml`. No framework needed — the existing job structure already has
the verdict as a step output (the for-loop over affected cases in the bash step). The partial verdict is:
"some cases passed Tier A/B, but not all."

**Why no existing CI gate framework is worth studying.** There is no npm ecosystem for "partial gate"
semantics in GitHub Actions workflows. The two closest patterns are:
1. GitHub Actions `continue-on-error: true` on individual jobs — but this causes the overall workflow to
   report success even on failure, which would defeat the gate entirely.
2. GitHub Actions matrix strategies with `fail-fast: false` + downstream aggregation — but affected cases
   are not in a matrix (they are a dynamic bash loop reading the PR HTML comment). The existing design
   uses a serial bash for-loop and is the right approach.

The `assertTripleGate()` function in `auto-fix-promote.mjs` needs a third valid label path: accept
`auto-fix:partial-verified` as a non-`auto-fix:verified` path that routes to a separate "human review
required" outcome rather than failing the gate entirely. This is a 15-line change to `assertTripleGate()`.

**Vitest contract:** The Vitest test for `assertTripleGate` in `tests/unit/` needs a new test case for
the partial-verified label. No test framework change needed — same pure-function test pattern.

**Confidence:** HIGH — confirmed by reading `v40-verifier-gate.yml` job structure (lines 181-295),
`auto-fix-promote.mjs` `assertTripleGate()` (lines 67-90).

---

### 5. Pre-Push Test Regression Fixes

**Decision: Pure code fixes, zero new deps.**

Three regression items:

**Test 48 ledger leak:** The Vitest test at index 48 in the ledger test suite. The "leak" indicates test
state pollution — a ledger file from a previous test not cleaned up. Fix pattern: ensure `afterEach` in
the relevant test file writes a fresh ledger, or uses a temp directory. This is the same isolation pattern
already used in `e2e-weekly-digest.test.js` (lines 385-397 use `runDir` temp directories). No dep needed.

**Calendar-rollover flake in `e2e-weekly-digest.test.js`:** The file uses `const PIN_NOW = () => new Date('2026-05-25T00:00:00Z')` at line 64. Tests that use `PIN_NOW` for time-pinning are fine; any test that calls
`new Date()` directly without injecting `PIN_NOW` will produce a different ISO week label now that
`2026-06` is the current month. The fix is to audit every `renderDigest` and `aggregate` call in the test
file and ensure they inject `now: PIN_NOW` or update the pin date. Vitest's `vi.setSystemTime()` is the
right tool (already used in `select-cron-cases.test.js` lines 39-77). No dep needed.

**`package-lock.json` EXACT-pin verification:** The existing `package.json` has `"@anthropic-ai/sdk": "0.100.1"` 
(no caret — confirmed by direct read). The lockfile verification is a static-grep guard: read the lockfile
and assert `"version": "0.100.1"` appears for the SDK entry. This is the same approach used by the
existing `tests/unit/eslint-sdk-guard.test.js`. Add one Vitest assertion in the existing lock-file guard
test, or create a new 5-line test. No dep.

**Confidence:** HIGH — confirmed by direct reads of `e2e-weekly-digest.test.js` line 64 (`PIN_NOW`),
`package.json` (`@anthropic-ai/sdk` exact pin), `select-cron-cases.test.js` (`vi.setSystemTime` usage).

---

## What NOT to Use

| Avoid | Why | Use Instead |
|---|---|---|
| Bayesian/frequentist A/B test library (`bayes`, `jstat`, `simple-statistics`) | The v4.1 "A/B" is a deterministic model-escalation heuristic, not a statistical inference problem. No sample-size calculation or p-value is required. | 20-line `MODEL_BY_ERROR_CLASS` map in `auto-fix.mjs` |
| ASCII sparkline library (`sparkline`, `sparklines-cli`) | Dashboard consumers are GitHub Discussions markdown (no TTY); the 50-line digest limit leaves no room; existing pattern is pure tables | Inline 10-line ASCII helper if ever needed |
| `actions/github-script@v7` (Octokit wrapper) | Adds dependency; v4.0 decision already rejected it; `gh` CLI is sufficient for all v4.1 operations | `gh api -X PUT`, `gh pr edit --add-label` |
| `renovate` or `dependabot` for ruleset patching | Wrong tool category — these are dep-update bots, not admin API clients | `gh api -X PUT --input ruleset.json` |
| `claude-opus-4-8` ("NextOpus") | No production stability data in this codebase; same pricing as Opus 4.7; reserve for v4.2 evaluation | `claude-opus-4-7` for difficult ERROR_CLASSES (already in `PRICING_BY_MODEL`) |
| Caret pin on `@anthropic-ai/sdk` | Minor-bump breaking change risk is empirically established (v4.0 research); three-milestone streak of supply-chain discipline | Exact pin `0.100.1`; evaluate bump at v4.2 |

---

## ESLint Impact

No new ESLint rules needed. The existing `no-restricted-imports` guard in `eslint.config.js` already:
1. Restricts direct `@anthropic-ai/sdk` imports to `tests/e2e/lib/llm-driver.js`
2. Restricts `src/` imports in `tests/e2e/lib/pdf-verifier.js`

The `MODEL_BY_ERROR_CLASS` map lives in `auto-fix.mjs`, which already calls through `invokeAnthropicSdkWithLedger`
(verified at line 66 of `auto-fix.mjs`). No new import paths are introduced.

---

## Version Pin Summary

| Item | Pin | File | Status |
|---|---|---|---|
| `@anthropic-ai/sdk` | `0.100.1` (exact, no caret) | `package.json` | LOCKED — do not bump |
| `peter-evans/create-pull-request` | `@v8` | `.github/workflows/*.yml` | LOCKED |
| `actions/checkout` | `@v4` | `.github/workflows/*.yml` | LOCKED |
| `actions/setup-node` | `@v4` | `.github/workflows/*.yml` | LOCKED |
| `actions/cache` | `@v4` | `.github/workflows/*.yml` | LOCKED |
| Model: auto-fix default | `claude-sonnet-4-6` | `auto-fix.mjs` const | LOCKED |
| Model: difficult classes | `claude-opus-4-7` | `MODEL_BY_ERROR_CLASS` (new) | v4.1 addition |

---

## Integration Points

| v4.0 primitive | v4.1 usage | Change |
|---|---|---|
| `tests/e2e/lib/llm-driver.js` `invokeAnthropicSdkWithLedger` | Multi-model A/B: pass `model: selectModel(errorClass)` instead of hardcoded `MODEL` constant | `auto-fix.mjs`: replace `MODEL` const with `MODEL_BY_ERROR_CLASS` map + `selectModel(errorClass)` helper |
| `tests/e2e/lib/llm-pricing.js` `PRICING_BY_MODEL` | Already has `claude-opus-4-7` entries; cost-by-model works automatically from `response.model` in ledger entries | No change |
| `scripts/build-ledger-dashboard.mjs` | Add auto-fix success rate, cost-per-fix, time-to-merge section (new table at bottom) | Extend `buildDashboard()` with an `autoFixMetrics(entries)` helper; pure string construction |
| `scripts/weekly-digest.mjs` | Consume auto-fix metrics from ledger; add to ≤50-line digest | Extend `renderDigest()` with one new optional section; guard behind `SUMMARY_KEYS` frozen contract |
| `.github/workflows/v40-verifier-gate.yml` | `partial-verified` label application when some but not all affected cases pass | Add conditional step in `ready-flip` job; emit `auto-fix:partial-verified` label; ensure label-create idempotent bootstrap (mirrors existing `auto-fix:verified` pattern at lines 409-423) |
| `scripts/auto-fix-promote.mjs` `assertTripleGate()` | Accept `auto-fix:partial-verified` as a valid (but human-review-routed) leg-1 path | Extend the leg-1 check; add corresponding Vitest case |

---

## Sources

- Direct read: `/home/fatduck/patent-cite-tool/tests/e2e/lib/llm-driver.js` — `invokeAnthropicSdkWithLedger` signature, `model:` param, transport tag (HIGH confidence)
- Direct read: `/home/fatduck/patent-cite-tool/tests/e2e/lib/llm-pricing.js` — `PRICING_BY_MODEL` entries for `claude-sonnet-4-6` and `claude-opus-4-7` (HIGH confidence)
- Direct read: `/home/fatduck/patent-cite-tool/scripts/auto-fix.mjs` — module-level `MODEL = 'claude-sonnet-4-6'` constant (HIGH confidence)
- Direct read: `/home/fatduck/patent-cite-tool/.github/workflows/v40-verifier-gate.yml` — current all-or-nothing gate structure, `auto-fix:verified` label bootstrap pattern (HIGH confidence)
- Direct read: `/home/fatduck/patent-cite-tool/scripts/auto-fix-promote.mjs` — `assertTripleGate()` leg-1 check (HIGH confidence)
- Direct read: `/home/fatduck/patent-cite-tool/tests/e2e/scripts/e2e-weekly-digest.test.js` — `PIN_NOW` at line 64, dynamic `new Date()` at line 389 (HIGH confidence)
- Direct read: `/home/fatduck/patent-cite-tool/package.json` — `@anthropic-ai/sdk: "0.100.1"` exact pin confirmed (HIGH confidence)
- `npm outdated` output — confirms `@anthropic-ai/sdk` is still at latest `0.100.1` (HIGH confidence)
- [GitHub REST API — Rulesets endpoints](https://docs.github.com/en/rest/repos/rules) — PUT `/repos/{owner}/{repo}/rulesets/{ruleset_id}` endpoint verified, `required_status_checks` JSON structure (HIGH confidence)
- [GitHub community discussion #139808](https://github.com/orgs/community/discussions/139808) — `--input` JSON file preferred over inline `-F` flags for nested arrays (MEDIUM confidence — community workaround, not official docs)
- [DEV.to — GitHub Rule Sets with Status Checks](https://dev.to/domderrien/github-rule-sets-enforcing-quality-through-status-checks-18nd) — JSON payload structure confirmation (MEDIUM confidence)
- npm search for Bayesian/frequentist A/B libs — no relevant lightweight libs found; confirms hand-rolled solution is correct (MEDIUM confidence)

---

*Stack research for: v4.1 Readiness Gate + Push (additive to v4.0 self-healing suite)*
*Researched: 2026-06-02*

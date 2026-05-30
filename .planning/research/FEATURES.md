# Feature Research — v4.0 Self-Healing Test Suite

**Domain:** LLM-driven auto-fix PR pipeline atop an existing v3.1 LLM-triage-and-quarantine loop
**Researched:** 2026-05-30
**Confidence:** HIGH (Aider docs, OpenHands docs, claude-code-action source, Renovate docs verified current; SWE-Bench leaderboard, security advisories, agent-PR review studies cross-referenced)

---

## Scope Note

This document covers the v4.0 milestone only — the auto-fix PR pipeline, verifier-on-PR gate, auto-promote-to-golden, dual LLM transport, dependency-update auto-PRs, and cost ledger v2. Existing v3.1 primitives (`rerun-validator.js`, hybrid triage classifier, `issue-payload-builder.js`, fingerprint v1+v2, `promote-from-quarantine.mjs`, `invokeClaudePWithLedger`, ERROR_CLASSES taxonomy, per-section char budgets) are treated as stable building blocks. Their internals are not re-researched; dependencies are explicitly noted per feature.

---

## Survey of Existing Tools (2026-05-30)

### Reference systems and where they sit

| Tool | Architecture | SWE-Bench Verified | What we steal |
|------|-------------|---------------------|---------------|
| **OpenHands** (formerly OpenDevin) | Multi-agent: Planner → Coder → Reviewer; opens unsupervised PRs; Action/Observation event log; LiteLLM provider portability | ~77% w/ Claude Sonnet 4.5 | Reviewer-before-PR pattern; planner-then-coder separation; explicit "tests must pass" gate |
| **SWE-agent** | Single-agent Agent-Computer Interface; YAML-driven; research-grade; minimal footprint | Solid baseline (open-source SOTA early 2025) | YAML config as single source of truth (matches our preference for one workflow per ERROR_CLASS) |
| **Aider** | Interactive pair-programming; architect-mode (planner + implementer); test-loop via `--test-cmd` | 31.4% (architect) | `--test-cmd` baked into the loop: agent must rerun the test on the branch and read failures before next iteration |
| **GitHub Copilot Coding Agent** | Cloud agent on `copilot/issue-N` branch; reads `AGENTS.md`; iterative loop write→test→diagnose→revise until tests pass or it flags ambiguity | Not directly comparable | `AGENTS.md` convention; branch-naming scheme `auto-fix/issue-N`; "stop and ask" exit when the agent can't resolve unambiguously |
| **Anthropic `claude-code-action`** v1 | Official GH Action; runs full Claude Code runtime inside Actions runner; built on Agent SDK; auth via API key or workload identity federation | n/a (infrastructure, not solver) | Direct primitive for our "Anthropic SDK in GitHub Actions" leg; supports the dual-transport split natively |
| **LangChain Open SWE** | Planner + Reviewer multi-agent; runs tests + formatters before PR open | n/a | Reviewer-rejects-before-PR pattern as a forcing function for the verifier gate |
| **Playwright Healer Agent** | Diagnose → repair → re-run failing selectors; ships with recent Playwright | n/a (test framework integration) | Direct fit for `GOOGLE_DOM_DRIFT` class — locator repair is the canonical use case |
| **Healwright / AutoHeal** | Runtime LLM call with DOM snapshot + element description → returns alternate locator | n/a | Pattern for DOM-drift recovery: snapshot HTML, describe expected element, LLM returns selector |

### Table-stakes capabilities (industry baseline ~2026 mid-year)

All credible auto-fix systems share these — anything we ship without these will feel broken:

1. **Issue-triggered branch** with deterministic naming (`auto-fix/issue-N` or `copilot/issue-N`) — discoverable, dedupable, idempotent
2. **Read-the-issue-body context loader** — extracts reproducer command, expected/actual, failing file paths
3. **Iterative write→test→read-failure→revise loop** with a hard iteration cap (typically 3–6)
4. **Hard test-gate before PR open** — Reviewer pattern: don't open the PR until the test we're claiming to fix actually passes
5. **Draft PR by default** — never auto-merge agent-generated code touching domain logic
6. **AGENTS.md / CLAUDE.md instruction file** — repo-level guardrails, conventions, file-touch boundaries
7. **Per-issue cost stamp in PR body** — token count + dollar amount; the 2026 audit norm
8. **Stop-and-ask escape** — agent must surface ambiguity rather than fabricate

### Differentiators (where v4.0 can be opinionated)

1. **Per-ERROR_CLASS prompt strategy** instead of a single generic agent — most off-the-shelf systems run one prompt and let context discovery do the work; our v3.1 issue body schema already classifies, so we can route to specialized prompts per class
2. **Verifier-on-PR gate using the existing PDF verifier** (not just `npm test`) — re-running `pdf-verifier.js` against the affected case on the proposed branch is the differential test that catches "looks plausible"
3. **Auto-promote-to-golden on merge** — `promote-from-quarantine.mjs` already exists; auto-firing it when a verifier-gated PR merges closes the loop
4. **Dual LLM transport** — Anthropic SDK (24/7 in Actions, cost-ledgered) + subscription-local `claude -p` (free dev iteration via `/gsd:fix-issue`); industry standard is single-transport API-key only
5. **Re-quarantine FLAKE without fix attempt** — explicit anti-pattern avoidance; most agents will burn budget trying to "fix" a flake

---

## Per-ERROR_CLASS Fix Strategy

The v3.1 classifier produces 8 ERROR_CLASSES. Each gets a distinct treatment.

### 1. WRONG_CITATION — Auto-fix (primary target)

**Behavior:** Attempt auto-fix. This is the milestone's hero case.

**Fix surface:**
- `src/shared/matching.js` (tiers 0–5, OCR normalization, gutter strip)
- `src/offscreen/position-map-builder.js` (column inference, gutter detection)
- `src/offscreen/parser.js` (PDF text extraction)
- Rarely `tests/e2e/test-cases.js` if the expected citation in the golden is itself wrong (verifier disagrees → fix the golden, not the matcher)

**Prompt scaffold:**
```
ROLE: You are repairing src/shared/matching.js to make case <case_id> produce <expected>.

CONTEXT (from the issue body):
- Reproducer: <reproducer_command + seed>
- Expected (golden): <expected_column:line>
- Observed (extension): <observed_column:line>
- Verifier said: <tier A/B/C/D> — <pdf_snippet ≤600 chars>
- LLM rationale: <rationale ≤800 chars>
- Golden diff: <golden_diff ≤400 chars>

CONSTRAINTS:
- Minimal diff. Change only the necessary tier.
- Do NOT alter the golden baseline unless verifier Tier A/B confirms the golden itself is wrong.
- Do NOT add new dependencies.
- All 76 existing golden cases must still pass.

DELIVERABLE: A single diff against src/ that makes <case_id> pass while preserving all other goldens.
```

**Verifier gate:** Re-run `pdf-verifier.js` against the affected case + the full 76-case regression on the proposed branch. Both must be green.

**Auto-merge:** NO. Draft PR, human-review required.

**Complexity:** L (this is the hard one — actual algorithm changes to load-bearing matching code).

**Dependencies on v3.1 primitives:** issue-payload-builder schema (must surface tier + pdf_snippet + golden_diff cleanly); fingerprint v2 (dedup against re-filed issues); rerun-validator (confirms it's reproducible before agent burns budget).

### 2. LLM_HALLUCINATED_SELECTION — Auto-fix (selection emulation surface)

**Behavior:** Attempt auto-fix. Distinct from WRONG_CITATION — the LLM picked text the extension can't even find. Root cause is usually selection emulation in `tests/e2e/lib/select-text.js` (TreeWalker + Range API), not citation logic.

**Fix surface:**
- `tests/e2e/lib/select-text.js` (selection normalizer, whitespace + hyphen passes, TreeWalker block-boundary handling)
- Less often `src/content/*` (Shadow DOM mouseup handler)

**Prompt scaffold:**
```
ROLE: You are repairing tests/e2e/lib/select-text.js to make LLM-selected text <selected_text_snippet> discoverable on the page <google_patents_url>.

CONTEXT:
- The LLM exploratory pass selected text that the verifier confirms exists in the PDF
- The selection emulation failed to highlight it (selChanged=false or empty Range)
- Failing block-boundary type: <newline | block | hyphen-wrap>

CONSTRAINTS:
- Do NOT touch src/ — this is a test-harness bug, not a product bug.
- Preserve existing pass behavior on the 76-case regression.
```

**Verifier gate:** Re-run the affected case + smoke spec on proposed branch.

**Auto-merge:** NO. Draft.

**Complexity:** M.

**Dependencies on v3.1 primitives:** triage classifier (must classify LLM_HALLUCINATED_SELECTION correctly — Tier C verifier agreement + selChanged=false signature).

### 3. WORKER_FALLBACK_FAILED — Auto-fix narrow surface

**Behavior:** Attempt auto-fix; narrow surface.

**Fix surface:**
- `src/cf-worker/index.js` (Cloudflare Worker proxy)
- `src/shared/uspto-fallback.js` (client-side fallback decision tree)
- `tests/e2e/fault-injection.spec.js` (if test expectations stale)

**Prompt scaffold:**
```
ROLE: You are repairing the USPTO/Worker fallback path. The fault-injection test failed at step <step_name>.

CONTEXT:
- Fallback trigger: <no-DOM-link | google-fetch-fail | no-text-layer>
- Worker response: <status + body snippet>
- Expected behavior per fault-injection spec: <expected>

CONSTRAINTS:
- Do NOT change the Worker bearer-auth scheme or CORS config without explicit note.
- Preserve the 3-second cache timeout fall-through.
```

**Verifier gate:** Re-run `fault-injection.spec.js` on proposed branch.

**Auto-merge:** NO. Draft.

**Complexity:** M.

**Dependencies on v3.1 primitives:** issue body must capture the Worker response body (currently lives in `verifier disagreement` block — fine).

### 4. GOOGLE_DOM_DRIFT — Auto-fix locator-only

**Behavior:** Attempt auto-fix, but ONLY for selector/locator-level changes. If the drift is structural (e.g., Google Patents now renders the PDF in an iframe instead of inline) — escalate to human.

**Fix surface:**
- `tests/e2e/lib/google-patents-page.js` (selectors, navigation)
- `tests/e2e/lib/select-text.js` (TreeWalker scoping)
- Rarely `src/content/*` (Shadow DOM host detection)

**Prompt scaffold:**
```
ROLE: You are repairing a selector in tests/e2e/lib/google-patents-page.js after Google Patents DOM changed.

CONTEXT:
- Broken selector: <selector>
- DOM snapshot at failure: <dom_snippet ≤1200 chars> (artifact path: <path>)
- Element role/text/attributes expected: <description>

CONSTRAINTS:
- Prefer semantic locators (getByRole, getByText) over CSS class chains.
- If structural change (iframe insertion, render-tree reorganization), STOP and label issue `human-only-investigation` rather than guess.
- Do NOT touch src/ — Google's DOM change cannot have caused a product bug; only test infrastructure.
```

**Verifier gate:** Re-run affected case on proposed branch + DOM-drift smoke spec.

**Auto-merge:** NO. Draft. (DOM drift sometimes signals an upstream change with broader implications.)

**Complexity:** M — uses the Playwright Healer Agent pattern (DOM snapshot → describe expected element → LLM returns selector).

**Dependencies on v3.1 primitives:** issue body must include DOM snippet artifact path; triage must distinguish "selector broken" from "page structure changed".

### 5. HARNESS_ERROR — Auto-fix narrow surface (test infra only)

**Behavior:** Attempt auto-fix; narrow surface.

**Fix surface:**
- `tests/e2e/**` (Playwright config, fixtures, mocks, Worker mock)
- `vitest.config.*.js`
- `playwright.config.js`
- `tests/e2e/lib/**`
- Never `src/`

**Prompt scaffold:**
```
ROLE: You are repairing a test harness issue. Failure type: <missing_fixture | playwright_config | worker_mock | timeout_config>.

CONTEXT:
- Failing test: <spec_path::test_name>
- Error: <stack ≤800 chars>
- Recent harness changes (last 5 commits touching tests/): <git log snippet>

CONSTRAINTS:
- Do NOT touch src/.
- Do NOT increase timeouts to mask real bugs — if timeout is the symptom, escalate.
- ESLint no-restricted-imports guards still apply (no src/ imports in verifier or quarantine modules).
```

**Verifier gate:** Re-run failing spec + lint on proposed branch.

**Auto-merge:** YES, but only if patch is < 30 lines AND touches only `tests/e2e/lib/` or `*.config.js` AND the spec passes 3 consecutive times on the proposed branch (anti-flake re-run gate). Default still draft.

**Complexity:** S.

**Dependencies on v3.1 primitives:** triage classifier already separates HARNESS_ERROR from product bugs.

### 6. FLAKE — Re-quarantine, NO auto-fix attempt

**Behavior:** Do NOT attempt auto-fix. Re-quarantine and increment `unstable_runs` counter. The issue gets a `flake` label and the agent stays out.

**Rationale:** Flake-fix prompts burn budget exploring root causes that may be infrastructure (CI runner load), network (Google rate-limiting), or genuinely intermittent (race conditions). Empirically across SWE-Bench leaderboard submissions, flake-targeted auto-fix has the lowest success rate of any class. The right move is to surface the pattern via the weekly digest and let a human investigate when N≥3 flakes share a fingerprint.

**Fix surface:** None (no fix attempt).

**Verifier gate:** None.

**Auto-merge:** N/A.

**Complexity:** S (logic is a guard clause in the dispatcher: `if (errorClass === 'FLAKE') return { skipReason: 're-quarantined' }`).

**Dependencies on v3.1 primitives:** rerun-validator (already classifies FLAKE at 0–1/3 reproductions); quarantine-append (already idempotent).

### 7. LLM_API_ERROR — No auto-fix; back-pressure only

**Behavior:** Do NOT attempt auto-fix. Transient `claude -p` / API failure. Log to cost ledger, exponential backoff for next run, surface in digest if rate exceeds threshold (e.g., >10% of nightly findings in a week).

**Fix surface:** None.

**Verifier gate:** None.

**Auto-merge:** N/A.

**Complexity:** S (just a noop branch in the dispatcher; the v3.1 ledger already records this).

**Dependencies on v3.1 primitives:** cost ledger v1 (already tracks per-invocation outcomes).

### 8. PASS — Close issue, no auto-fix

**Behavior:** Do NOT attempt auto-fix. The triage second-pass concluded the original LLM finding was a false positive. Close the issue with comment "Triage classified as PASS — false positive in LLM exploratory pass."

**Fix surface:** None.

**Verifier gate:** None.

**Auto-merge:** N/A.

**Complexity:** S (close-with-comment GraphQL call).

**Dependencies on v3.1 primitives:** issue filer already emits `triage` label and PASS classification.

### Summary table

| ERROR_CLASS | Auto-fix? | Fix surface | Auto-merge ever? | Complexity |
|-------------|-----------|-------------|------------------|------------|
| WRONG_CITATION | YES | `src/shared/matching.js`, `src/offscreen/*` | NO | L |
| LLM_HALLUCINATED_SELECTION | YES | `tests/e2e/lib/select-text.js` | NO | M |
| WORKER_FALLBACK_FAILED | YES | `src/cf-worker/index.js`, `src/shared/uspto-fallback.js` | NO | M |
| GOOGLE_DOM_DRIFT | YES (locator-only) | `tests/e2e/lib/google-patents-page.js` | NO | M |
| HARNESS_ERROR | YES | `tests/e2e/**`, `*.config.js` | YES (narrow: <30 lines, test infra only, 3× green) | S |
| FLAKE | NO | — | N/A | S |
| LLM_API_ERROR | NO | — | N/A | S |
| PASS | NO | — | N/A | S |

---

## Verifier-on-PR Gate Mechanics

Anti-pattern to prevent: "looks-plausible-but-doesn't-work" patches. LLMs produce plausible code as their core capability — a plausible claim about test results is indistinguishable from a verified one unless verification artifacts are demanded. This failure mode has a name in the agent-safety literature: **phantom verification**.

### Gate design (mirrors OpenHands Reviewer + Aider `--test-cmd`)

**Mandatory checks before PR is marked ready-for-review** (PR stays in draft until ALL green):

1. **Affected-case verifier check** — re-run `tests/e2e/lib/pdf-verifier.js` against the case named in the issue's reproducer block. Must return Tier A or B agreement with the expected citation. Tier C is NOT a pass (per v3.1 `verifier_strong_agreement` rule).
2. **Full regression check** — re-run the 76-case golden regression on the proposed branch. Zero diffs allowed.
3. **Vitest suites** — `test:src`, `test:chrome`, `test:firefox` all green.
4. **Lint** — `test:lint` green (web-ext against `dist/firefox/`).
5. **No new dependencies** — fail the gate if `package.json` diff adds entries (v4.0 milestone explicitly zero-new-deps).
6. **Diff size cap** — fail if patch > 200 lines for `src/` changes (forcing function for "minimal diff"). Configurable per ERROR_CLASS.
7. **Triple-run anti-flake gate** — affected-case verifier check runs 3× consecutively; all 3 must pass (mirrors rerun-validator's 2/3+ rule, tightened to 3/3 because we're gating a code change).
8. **Cost stamp in PR body** — `[$0.42 / 14,200 tokens — within $80 soft cap]` line at top of PR body. Hard fail if monthly cap exceeded.

### What we DON'T do (rejected gate patterns)

- **LLM-as-judge** for verifier disagreements — the verifier is independent code; using another LLM to adjudicate re-introduces the plausibility problem
- **Property-based testing on patch** — too expensive and out-of-scope for v4.0; the 76-case regression is the property
- **Confidence threshold from agent** — agent self-reported confidence is not predictive; the verifier check is the source of truth

### Workflow YAML sketch (informational)

```yaml
# .github/workflows/verify-auto-fix-pr.yml
on:
  pull_request:
    branches: [main]
    types: [opened, synchronize]

jobs:
  verifier-gate:
    if: startsWith(github.head_ref, 'auto-fix/')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci
      - run: npm run build
      - name: Affected-case verifier (3x consecutive)
        run: |
          for i in 1 2 3; do
            npm run e2e:verify -- --case "$ISSUE_CASE_ID" || exit 1
          done
      - run: npm run e2e:regression   # 76 cases
      - run: npm test                  # src + chrome + firefox + lint
      - name: Diff size + dep guard
        run: scripts/auto-fix-gate.mjs --max-src-lines 200 --no-new-deps
      - name: Mark PR ready-for-review
        if: success()
        run: gh pr ready ${{ github.event.pull_request.number }}
```

---

## Auto-Promote-to-Golden Patterns

### Precedent survey

| System | Promotion criterion | Time delay | Apply to v4.0? |
|--------|---------------------|------------|----------------|
| Chromium Web Platform Tests | `TestExpectations` file removal after stable green run; CL review required | Hours–days; CL review gates | Adapt — human PR review = our CL review |
| Mozilla intermittent-failure dashboard | N consecutive green runs (typically 7+) before removing intermittent annotation | ~1 week | Adapt — we use `stable_runs` in v3.1 quarantine schema |
| Renovate `minimumReleaseAge` | npm only resolves packages with publish date older than N days | 3–14 days configurable | Direct lift for dep-update PRs (see next section) |
| v3.1 `promote-from-quarantine.mjs` | Human-triggered after `quarantine:ready-for-promotion` label fires at `stable_runs ≥ 3` | None imposed | This is our baseline — v4.0 adds auto-trigger on merge |

### v4.0 auto-promote design

**Trigger:** verifier-gated PR with label `auto-fix` merges to main.

**Action:** GitHub Actions job inspects the PR body for the `fingerprint` line and the `case_id` it claims to repair, then runs `promote-from-quarantine.mjs <case_id>` automatically.

**Safety guards (table-stakes):**
1. The case_id MUST exist in `tests/e2e/test-cases-quarantine.js` (idempotent — no-op if already promoted).
2. `stable_runs ≥ 3` is REQUIRED at promotion time (re-checked from the quarantine corpus, not the PR body).
3. If verifier check fails on `main` after merge (final defense-in-depth), automatically revert the promotion via a follow-up PR labelled `revert-auto-promote` and re-quarantine.
4. Promotion commits go through a separate `auto-promote/<case_id>` branch with its own PR — never directly to main. This means the merge itself is human-gated even though the trigger is automatic.

**Why not just merge-direct-to-main promote:** the v3.1 trust invariant explicitly states "Automatic golden promotion blocked — destroys trust invariant; promotion stays human-gated via `promote-from-quarantine.mjs`." v4.0 preserves that invariant by automating the *creation* of the promotion PR, not the *merging* of it.

**Complexity:** S — `promote-from-quarantine.mjs` already exists; v4.0 adds a workflow trigger and a wrap-in-PR step.

---

## Dependency-Update Auto-PRs

### 2026 norms (Renovate baseline; Dependabot considered and rejected)

Renovate is the table-stakes pick for our use case in 2026:
- Grouped updates (multiple deps in one PR)
- `minimumReleaseAge` (renamed from `stabilityDays`, 14-day recommended for auto-merge)
- Auto-merge by update type (patch vs minor vs major)
- Compatibility-test gating (only merge after CI green)
- Schedule support (weekly Monday cron)

Dependabot's grouped updates are workspace-scoped only and require manual auto-merge wiring; in 2026 it's the lesser tool for our shape.

### Recommended v4.0 dep-update config

| Dep type | Auto-merge? | Stability window | Test gate |
|----------|-------------|------------------|-----------|
| Patch (npm `~`) | YES | 7 days | Full nightly suite green |
| Minor (npm `^` minor bump) | NO (draft PR for review) | 14 days | Full nightly suite green |
| Major | NO (draft PR with manual diff review) | 30 days | Full nightly suite green |
| Security CVE | YES (override stability window) | 0 days | Full nightly suite + extra `e2e:smoke` |

### Watched deps (current `package.json`)

- `@playwright/test` — minor bumps affect E2E harness; minor-only with 14d window
- `pdfjs-dist` — bumps frequently invalidate cached position maps; force `CACHE_VERSION` bump on minor
- `sharp` — native deps; minor bumps risk CI runner ABI issues; pin minor, allow patch only
- `vitest` — patch auto-merge OK
- `esbuild` — patch auto-merge OK
- `eslint` + plugins — patch auto-merge OK
- `web-ext` — minor with 14d window (changes AMO lint thresholds)

### v3.1 primitive dependencies

- Cost ledger v2 — dep-update workflow is free (no LLM calls) but the workflow YAML lives next to the auto-fix workflow; share the gate-runner script
- Nightly cron — dep-update PRs must wait for one full nightly tick on their branch before becoming non-draft

**Complexity:** M (Renovate config + custom auto-merge action; pdfjs-dist CACHE_VERSION bump rule needs care).

---

## Dual LLM Transport

### Pattern (2026 norm: Agent SDK credit + API key in parallel)

Anthropic's June 2026 change creates a separate Agent SDK credit pool for subscription plans, distinct from interactive limits. This makes the dual-transport pattern explicit:

- **Anthropic SDK in GitHub Actions** (24/7 cost-ledgered) — uses API key + `ANTHROPIC_API_KEY` secret; runs the nightly auto-fix workflow; cost recorded in PR body
- **Subscription-local `claude -p`** via `/gsd:fix-issue <n>` slash command — free dev iteration against Max 5 credit; CI-guarded by the v3.1 ESLint rule on `invokeClaudeP` direct calls

### Surface differences

| Aspect | Anthropic SDK (Actions) | Subscription `claude -p` |
|--------|-------------------------|--------------------------|
| Auth | `ANTHROPIC_API_KEY` secret | `~/.claude` credential file (local) |
| Concurrency | 24/7, queued by Actions runner | Manual dev invocation |
| Cost | Per-token, ledgered to monthly cap | Free within Max 5 subscription |
| Latency budget | Minutes (Actions runner cost-bounded) | Interactive (dev waits) |
| Wrapper | `invokeClaudeWithSdkLedger` (new in v4.0) | `invokeClaudePWithLedger` (v3.1, reused) |
| CI guard | n/a (this IS the CI path) | ESLint `no-restricted-imports` blocks direct `invokeClaudeP` calls from CI-tagged files |

### Anti-pattern explicitly avoided

Single-transport (API-key-only) is the 2026 industry default but burns money during dev iteration. Single-transport (subscription-only) is what we shipped in v3.1 but locks out 24/7 auto-fix runs in CI (the credential file isn't safe to ship to Actions). The dual scheme keeps dev free while CI is metered.

### Cost ledger v2

- Tracks both transports in a unified `cost-ledger.json` keyed by `{run_id, transport, issue_n, error_class}`
- Soft warning at $80 monthly (matches v3.1 cap)
- Hard cutoff at $100 monthly — the gate-runner refuses to mark PRs ready-for-review past this point until a human raises the cap
- Per-issue cost stamped at top of PR body: `[Transport: SDK | Tokens: 14,200 | Cost: $0.42 | MTD: $63.18 / $100]`
- Subscription `claude -p` invocations record token estimate as $0 but still ledger the invocation count for digest analytics

**Complexity:** M (new SDK wrapper + ledger schema migration + PR-body cost stamper).

---

## Anti-Features (Explicitly EXCLUDED from v4.0)

The trust invariant is the most expensive asset we built in v3.1. These features sound good but would destroy it.

### 1. Auto-merge for `src/shared/matching.js` changes

**Why it sounds good:** "If the verifier passes on all 76 cases, the patch is safe — why slow it down with a human review?"

**Why it's actually a trust grenade:** Citations go into legal filings. A patch that passes 76/76 goldens may still introduce a subtle off-by-one for a 77th case we haven't yet golden-captured. The v3.1 doc explicitly says "Best-effort matching with confidence indication — citations go into legal filings." Auto-merging matcher changes inverts that contract.

**What we do instead:** All `src/` PRs are draft-by-default; require human approval click even when verifier gate green.

### 2. Agentic loop without iteration cap

**Why it sounds good:** "Let the agent keep trying until tests pass — that's what OpenHands does and they hit 77% on SWE-Bench."

**Why it's actually a cost-ledger grenade:** Unbounded loops are the documented #1 cause of cost runaway in 2026 agent deployments. OpenHands hits 77% but with disclosed average costs per task that would blow our $100 monthly cap in a single bad night. Industry-standard counter-pressure: iteration cap (3–6 typical) + hard token budget per issue.

**What we do instead:** Max 4 write→test→read-failure cycles per issue. If gate fails after 4, leave PR in draft with `auto-fix-stuck` label and stop.

### 3. LLM-as-judge for verifier disagreements

**Why it sounds good:** "When the verifier and extension disagree at Tier C, ask another LLM call to break the tie."

**Why it's actually a phantom-verification grenade:** The independent verifier is a verifier precisely because it doesn't share the extension's bugs. Replacing it (or supplementing it) with an LLM adjudicator re-introduces correlated failure: both the extension and the adjudicator can be plausibly wrong in the same way. The v3.1 `verifier_strong_agreement` rule (Tier A/B only) already encodes this — extending the gate to "but if LLM says it's fine then accept Tier C too" defeats the purpose.

**What we do instead:** Tier C disagreements escalate to human-only investigation issue (label `human-only-investigation`, no auto-fix attempt).

### 4. Prompt-injection-vulnerable issue body parsing

**Why it sounds good:** "Just feed the issue body verbatim to the agent — the v3.1 char budgets already keep it short."

**Why it's actually a security grenade:** As of April 2026, Claude Code, Gemini CLI, and GitHub Copilot Coding Agent were all confirmed vulnerable to prompt injection via GitHub comments (Anthropic, Google, Microsoft all paid bug bounties; SecurityWeek, theregister.com 2026-04-15). The "Comment and Control" attack: workflows triggered on `issue_comment` events activate the agent without any victim interaction — a public issue comment becomes RCE.

**What we do instead:**
1. Allowlist tools (`--allowed-tools`); never blocklist
2. Read-only token scope wherever possible
3. Strip HTML comments, invisible characters, hidden HTML attributes from issue body before passing to agent (already done by `claude-code-action` since v1; we replicate for our SDK transport)
4. Issue body PDF text continues to wrap in `<patent_data>` XML tags (v3.1 defense, retained)
5. Only trigger auto-fix workflow on `issues` events where the issue has the `triage` label (filtering out comment-event injection)

### 5. Auto-promote to golden without re-running verifier post-merge

**Why it sounds good:** "If the verifier passed on the branch and the PR merged, it'll pass on main too."

**Why it's actually a regression-window grenade:** Merge conflicts, post-merge rebase changes, and concurrent main-branch shifts can silently flip a passing case. Renovate-style defense-in-depth: re-run after merge, and if it fails, automatically revert the promotion.

**What we do instead:** Auto-promote creates a separate `auto-promote/<case_id>` PR that itself triggers the verifier gate; only after THAT PR's gate passes is the case in `tests/e2e/test-cases.js` golden.

### 6. "Auto-fix everything in the quarantine queue overnight" batch mode

**Why it sounds good:** "We have 27 cases in quarantine. Let the agent grind through all of them at 03:00 UTC."

**Why it's actually a budget grenade:** 27 cases × 4 iterations × ~14k tokens × Claude Sonnet 4.5 pricing = roughly $40 per overnight run if nothing fails. Three bad nights in a row exhausts the monthly cap before week-end. Plus the human review queue gets buried under 27 simultaneous draft PRs.

**What we do instead:** Per-night cap (max 3 new auto-fix PRs); FIFO priority on quarantine entries by `stable_runs` descending (cases closest to ready-for-promotion get fixed first).

---

## Feature Dependencies

```
[Triage-output errorClass label]
    └──required by──> [Per-ERROR_CLASS dispatcher]
                          ├──invokes──> [WRONG_CITATION fix prompt]
                          ├──invokes──> [LLM_HALLUCINATED_SELECTION fix prompt]
                          ├──invokes──> [WORKER_FALLBACK_FAILED fix prompt]
                          ├──invokes──> [GOOGLE_DOM_DRIFT fix prompt]
                          ├──invokes──> [HARNESS_ERROR fix prompt]
                          └──skips────> [FLAKE | LLM_API_ERROR | PASS]

[Issue body schema (issue-payload-builder.js v3.1)]
    └──consumed by──> [Per-ERROR_CLASS fix prompt context loader]

[pdf-verifier.js v3.0]
    └──consumed by──> [Verifier-on-PR gate]
                          └──gates────> [PR ready-for-review transition]

[Verifier-on-PR gate passes + auto-fix label + merge]
    └──triggers──> [Auto-promote-to-golden]
                       └──creates──> [auto-promote/<case_id> PR]
                                         └──itself gated by──> [Verifier-on-PR gate]

[invokeClaudePWithLedger v3.1 + invokeClaudeWithSdkLedger v4.0]
    └──unified by──> [Cost ledger v2]
                         └──stamps──> [PR body cost line]
                         └──hard-caps──> [Verifier gate at $100 MTD]

[Dependency-update auto-PR (Renovate)]
    └──gated by──> [Nightly suite green]
    └──ungated by──> [Cost ledger] (dep-update is free)

[FLAKE class re-quarantine]
    └──conflicts with──> [Auto-fix attempt] (must skip, not retry)

[LLM-as-judge tie-breaking]
    └──conflicts with──> [Verifier-on-PR gate] (anti-feature)
```

### Dependency notes

- **Per-ERROR_CLASS dispatcher requires triage label:** v3.1 already emits these. v4.0 adds a workflow that filters by label.
- **Verifier gate requires pdf-verifier:** v3.0 primitive. Unchanged in v4.0.
- **Auto-promote requires verifier gate twice:** once on the auto-fix PR, once on the auto-promote follow-up PR. Defense-in-depth.
- **Cost ledger v2 is foundational:** every auto-fix and every gate run writes to it. Build first.
- **FLAKE skip path conflicts with retry loops:** never retry a FLAKE — re-quarantine is terminal for the v4.0 attempt.

---

## MVP Definition

### Launch With (v4.0 MVP — single milestone scope)

Minimum viable product to ship the self-healing loop end-to-end:

- [ ] **Per-ERROR_CLASS dispatcher** with WRONG_CITATION fix path only as the hero case (others stubbed to "skip with label `auto-fix-deferred-class`")
- [ ] **Verifier-on-PR gate workflow** with affected-case (3× consecutive) + 76-case regression + vitest + lint + diff-size + no-new-deps
- [ ] **Auto-promote-to-golden** as a follow-up PR triggered on auto-fix merge
- [ ] **Cost ledger v2** with $80/$100 caps, per-PR cost stamp
- [ ] **Dual transport scaffolding** with SDK in CI and `claude -p` via `/gsd:fix-issue <n>` slash command
- [ ] **AGENTS.md** or `CLAUDE.md` repo-level instruction file documenting allowed tools, file-touch boundaries, and stop-and-ask criteria
- [ ] **Draft-PR-by-default** invariant + branch naming `auto-fix/issue-<n>`
- [ ] **FLAKE / LLM_API_ERROR / PASS skip paths** (no auto-fix attempt, just label + close)

### Add After Validation (v4.1 follow-up)

Trigger: ≥5 successful WRONG_CITATION auto-fixes merged AND zero false-positive promotions.

- [ ] **LLM_HALLUCINATED_SELECTION fix prompt** — second class with proven track record
- [ ] **WORKER_FALLBACK_FAILED fix prompt** — narrow surface, lower risk
- [ ] **Renovate dep-update workflow** with grouped + stability-window + auto-merge-patch (separate from the auto-fix path but shares the gate-runner)

### Future Consideration (v4.2+)

Trigger: ≥10 successful auto-fixes across 3+ error classes.

- [ ] **GOOGLE_DOM_DRIFT fix prompt** with Playwright Healer Agent pattern — riskier because DOM drift can mask broader changes
- [ ] **HARNESS_ERROR fix prompt** with narrow auto-merge — only after we have signal on what HARNESS_ERROR diffs typically look like
- [ ] **Pre-merge differential test pack** — running auto-fix branch against a held-out shadow corpus (cases not in golden) as additional defense
- [ ] **Multi-issue grouped auto-fix PRs** — when N≥3 issues share a fingerprint cluster (same root cause), one PR fixes all; deferred because grouping logic is complex and per-issue is the safer baseline

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Per-ERROR_CLASS dispatcher (WRONG_CITATION hero path) | HIGH | HIGH | P1 |
| Verifier-on-PR gate | HIGH | MEDIUM | P1 |
| Auto-promote-to-golden (follow-up PR pattern) | HIGH | LOW | P1 |
| Cost ledger v2 + dual transport | HIGH | MEDIUM | P1 |
| Draft-PR + branch naming + AGENTS.md | HIGH | LOW | P1 |
| FLAKE / LLM_API_ERROR / PASS skip paths | HIGH (prevents budget burn) | LOW | P1 |
| LLM_HALLUCINATED_SELECTION fix path | MEDIUM | MEDIUM | P2 |
| WORKER_FALLBACK_FAILED fix path | MEDIUM | MEDIUM | P2 |
| Renovate dep-update workflow | MEDIUM | MEDIUM | P2 |
| GOOGLE_DOM_DRIFT fix path | LOW (rare; Google DOM stable for months) | MEDIUM | P3 |
| HARNESS_ERROR narrow auto-merge | LOW | LOW | P3 |
| Pre-merge shadow-corpus differential test | MEDIUM | HIGH | P3 |

**Priority key:**
- P1: Must have for v4.0 milestone close
- P2: Add in v4.1 after validation signal
- P3: Defer to v4.2+ pending evidence

---

## Competitor Feature Analysis

| Feature | OpenHands | Aider | Copilot Coding Agent | claude-code-action | Our Approach |
|---------|-----------|-------|----------------------|--------------------|--------------|
| Issue-to-PR loop | YES (unsupervised) | NO (interactive) | YES (assign issue) | YES (label/mention) | YES (label-triggered, draft-by-default) |
| Test gate before PR | YES (Reviewer) | YES (`--test-cmd`) | YES (iterate till green) | Workflow-defined | YES (custom verifier gate + 76-case regression) |
| Per-error-class routing | NO (single agent) | NO | NO | NO | YES (8 classes, 5 fix paths + 3 skip paths) |
| Auto-merge | NO (default) | N/A | NO (default) | NO (default) | NO for src/, narrow YES for HARNESS_ERROR only |
| Iteration cap | Configurable | Configurable | Yes (internal) | Configurable | Hard cap: 4 |
| Cost ledger | LiteLLM tracking | Per-session | GitHub-managed | Workflow-managed | Dual-transport unified ledger v2 |
| Dep-update integration | NO | NO | Workspace-only via Dependabot | NO | Renovate w/ stability window |
| Auto-promote test artifact | NO | NO | NO | NO | YES (quarantine → golden via follow-up PR) |
| Prompt-injection defense | Standard input strip | N/A | Allowlist + AGENTS.md | Input strip (auto) | All of the above + `<patent_data>` XML wrap |

---

## Sources

- [SWE-Bench Coding Agent Leaderboard 2026](https://awesomeagents.ai/leaderboards/swe-bench-coding-agent-leaderboard/) — Bytedance 75.2%, Anthropic 73.20% as of mid-2025; OpenHands ~77% with Claude Sonnet 4.5 — HIGH (verified 2026-05-30)
- [SWE-agent GitHub README](https://github.com/SWE-agent/SWE-agent) — single-agent ACI, YAML-configurable — HIGH
- [OpenHands GitHub Workflows: PR Review](https://docs.openhands.dev/sdk/guides/github-workflows/pr-review) — Reviewer pattern, Action/Observation event log — HIGH
- [Anthropic claude-code-action README](https://github.com/anthropics/claude-code-action) — v1 launched 2025-09-29, runs full Claude Code runtime inside Actions — HIGH
- [Anthropic claude-code-action security.md](https://github.com/anthropics/claude-code-action/blob/main/docs/security.md) — input sanitization, tool allowlisting — HIGH
- [Claude Code product page](https://www.anthropic.com/product/claude-code) — Agent SDK, subagents, hooks; June 2026 Agent SDK credit separation — HIGH
- [Anthropic Release Notes May 2026](https://releasebot.io/updates/anthropic) — Agent SDK monthly credit launching June 15, 2026 — HIGH
- [Aider architect mode docs / SWE-Bench score 31.4%](https://www.codesota.com/code-generation) — interactive pair-programming + `--test-cmd` loop — MEDIUM (verified against multiple secondary sources)
- [GitHub Copilot cloud agent docs](https://docs.github.com/copilot/concepts/agents/coding-agent/about-coding-agent) — `copilot/issue-N` branch convention, AGENTS.md, iterative test loop — HIGH
- [SecurityWeek: Claude Code, Gemini CLI, Copilot prompt injection via GitHub comments](https://www.securityweek.com/claude-code-gemini-cli-github-copilot-agents-vulnerable-to-prompt-injection-via-comments/) — Comment-and-Control attack pattern, April 2026 disclosures — HIGH
- [TheRegister: Anthropic/Google/Microsoft AI bug bounties for prompt injection](https://www.theregister.com/2026/04/15/claude_gemini_copilot_agents_hijacked/) — vendor confirmation of the attack class — HIGH
- [Renovate Docs: minimumReleaseAge](https://docs.renovatebot.com/key-concepts/minimum-release-age/) — 14-day recommended cooldown for auto-merge; `renovate/stability-days` status check — HIGH
- [npm 11.10.0 min-release-age](https://nesbitt.io/2026/03/04/package-managers-need-to-cool-down.html) — February 2026 npm-native cooldown support — MEDIUM (single secondary source, but corroborates Renovate documentation)
- [Renovate vs Dependabot 2026](https://appsecsanta.com/sca-tools/dependabot-vs-renovate) — grouped updates, policy engine differences — MEDIUM
- [The Evidence Gate (blakecrosley.com)](https://blakecrosley.com/blog/the-evidence-gate) — "phantom verification" anti-pattern naming — MEDIUM
- [LangChain Open SWE](https://blog.langchain.com/introducing-open-swe-an-open-source-asynchronous-coding-agent/) — Planner + Reviewer multi-agent; runs tests + formatters before PR open — MEDIUM
- [GitHub blog: Agent PRs review patterns](https://github.blog/ai-and-ml/generative-ai/agent-pull-requests-are-everywhere-heres-how-to-review-them/) — 45.1% of agent PRs require human revision; checkpoint patterns — MEDIUM
- [Chromium TestExpectations / WPT promotion](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/docs/testing/web_test_expectations.md) — annotation-removal-via-CL precedent — HIGH
- [Playwright Healer Agent](https://dev.to/debs_obrien/fixing-failing-tests-automatically-with-playwrights-new-healer-agent-13ck) — selector self-healing for DOM drift — MEDIUM
- [Healwright pattern](https://medium.com/@Amr.sa/healwright-let-your-playwright-tests-heal-their-own-selectors-on-the-fly-d0178568f9bc) — DOM snapshot + element description → LLM → new locator — MEDIUM
- [ReduceFix paper (arxiv 2507.15251)](https://arxiv.org/pdf/2507.15251) — input reduction for patch generation; minimal-diff guidance — MEDIUM
- [TDFlow paper (arxiv 2510.23761)](https://arxiv.org/pdf/2510.23761) — agentic TDD workflows — MEDIUM
- [Truefoundry: Agentic token explosion / cost attribution](https://www.truefoundry.com/blog/llm-cost-attribution-agentic-cicd) — per-repo / per-pipeline ledger pattern — MEDIUM

---
*Feature research for: v4.0 Self-Healing Test Suite — LLM-driven auto-fix PR pipeline*
*Researched: 2026-05-30*

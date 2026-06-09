# Phase 61: Carry-over Bundle — Diagnostic Mutator + Max-Turns + UAT Re-sweep — Research

**Researched:** 2026-06-09
**Domain:** Atomic Wave-0 carry-over — diagnostic-injection mutator + `--max-turns 5 --tools Read,Glob,Grep [--max-budget-usd 0.50]` subscription-transport argv + `BUDG-01` budget section + live UAT-47-a/b/SWEEP-03/04 PASS evidence capture on `origin/main`.
**Confidence:** HIGH (all integration points re-verified against live tree; `claude --help` flag inventory directly probed; argv shape, ledger sites, scaffold contracts, selector vocabulary read from disk)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Implementation Anchors**

- **DIAG-01 selector reference target — CORRECTED from research**: the canonical Google-Patents selector vocabulary lives in `tests/e2e/lib/selection.js` (`'patent-result'`, `'section[itemprop="claims"]'`) and `tests/e2e/lib/navigation.js` (`'main, article, patent-result'`) — NOT in `google-patents-page.js` (that file does not exist in the codebase; research referenced a stale path). The DIAG-01 assertion target is `selection.js` + `navigation.js`. The mutator-emitted `GOOGLE_DOM_DRIFT` DOM snippet MUST contain at least one of: `'patent-result'`, `'section[itemprop="claims"]'`, `'main'`, `'article'` (verbatim string match).
- **DIAG-03 deterministic fixture pin location**: extend the existing `tests/e2e/scripts/e2e-inject-defect.test.js` with new `toMatchInlineSnapshot` byte-identical pins for `GOOGLE_DOM_DRIFT` and `WRONG_CITATION` errorClasses. Same-seed + same-errorClass → byte-identical body. Vitest fixture lives next to existing pin pattern (no new test file). **NOTE:** CONTEXT.md cites `tests/unit/e2e-inject-defect.test.js` — that path does not exist. The actual file is at `tests/e2e/scripts/e2e-inject-defect.test.js`. Locked to the real path; planner uses the real path verbatim.
- **TURNS-03 cost-bound regression test approach**: fixture-based — pin (a) the argv shape via `invokeClaudeP` mocked spawn, (b) a recorded `ledger.jsonl` fixture covering 5 smoke-issue entries, (c) `meanPerCall < 0.30` assertion against the fixture. No live API calls in CI. Defense against future drift: if `claude` CLI rejects an argv element at runtime, the existing live `--max-turns 5` evidence run during UAT-01/UAT-02 would catch it before merge.
- **TURNS-01 `--max-budget-usd 0.50` flag inclusion**: include defensively. Vitest pin asserts presence in argv. Research convergence treats it as load-bearing defense-in-depth on top of per-issue/per-PR/monthly caps. Risk: if the claude CLI rejects an unknown flag, the SWEEP-03/04 live runs will surface it pre-commit (UAT-01/UAT-02 are evidence gates). **[VERIFIED: `claude --help` probed on local v2.1.169 — `--max-budget-usd <amount>` is real; risk now reduced to zero.]**

**MUTATOR-04 Co-Design Invariants (Phase 59 carry-over — LOAD-BEARING)**

- `SOURCE_TAG` literal `'fixture-mutator-uat-47b'` at `inject-defect.mjs:75` MUST NOT change. `quarantine-append.mjs:239` regex `&& !isFixtureMutator` co-depends on this exact literal. Any edit here cascades through Phase 59 production-path suppression invariant.
- `ERROR_CLASSES` Set at `inject-defect.mjs:64` is the additive-only allowlist. Add new entries via spread, never mutate in place.
- `<!-- fp: <12-hex> -->` v2 marker on line 1 of `buildBody` output preserved.

**Argv Update — `llm-driver.js:94` (Subscription Transport ONLY)**

- BEFORE: `['-p', '--output-format', 'json', '--max-turns', '1', '--system-prompt', systemPrompt, userPrompt]`
- AFTER: `['-p', '--output-format', 'json', '--max-turns', '5', '--tools', 'Read,Glob,Grep', '--max-budget-usd', '0.50', '--system-prompt', systemPrompt, userPrompt]`
- SDK transport (`invokeAnthropicSdkWithLedger` / `messages.create`) is single-turn by API design — NO change. Inline comment at the subscription site documents the asymmetry.
- Tool palette restriction is via `--tools` (RESTRICTS palette), NOT `--allowedTools` (grants permission only). TURNS-02 Vitest pin asserts argv contains `'--tools', 'Read,Glob,Grep'` AND excludes literal strings `'Edit'`, `'Bash'`, `'Write'`, `'WebFetch'`, `'--allowed-tools'`, `'--allowedTools'`.

**Atomic Commit Strategy (Partial-state Pitfall 1+2 mitigation)**

ONE commit ships all three capabilities + budget section + tests:
1. `tests/e2e/scripts/inject-defect.mjs:buildBody` extension (DIAG-01, DIAG-02)
2. `tests/e2e/lib/llm-driver.js:94` argv update (TURNS-01)
3. `tests/e2e/scripts/e2e-inject-defect.test.js` — deterministic-body pins (DIAG-03)
4. `tests/unit/llm-driver.test.js` — TURNS-02 tool-allow-list + exclusion pin (existing file with the `--max-turns 1` pin at line 389 — extend in place; new file not required)
5. `tests/unit/llm-driver-cost-bound.test.js` (NEW file) — TURNS-03 mean-per-call regression with fixture ledger
6. `.planning/STATE.md ## Budget` section live (BUDG-01)

NO partial-merge of any subset. If a Vitest fixture fails, fix in the same commit before push.

**Live UAT Evidence Capture (UAT-01, UAT-02)**

- AFTER the atomic commit lands on `origin/main`:
  - Run mutator to inject a synthetic `GOOGLE_DOM_DRIFT` issue → auto-fix loop → verifier-gate PASS → merge → promote → `outcome: 'pass'` ledger entry written with `errorClass: 'GOOGLE_DOM_DRIFT'` + `source: 'auto-fix-promoted'` + `transport: 'sdk' | 'subscription'`. This is SWEEP-03 / UAT-47-a evidence.
  - Run fixture-mutator full loop → verify `isFixtureMutator` filter at `quarantine-append.mjs:239` prevents synthetic from contaminating quarantine corpus. This is SWEEP-04 / UAT-47-b evidence.
  - Capture both PASS-evidence rows into `.planning/sweep-03-04-pass-evidence.yaml` (the Phase 68 precondition sentinel — created here, consumed at Phase 68 close).

**Budget Section Content (BUDG-01)**

`.planning/STATE.md ## Budget` section content (already drafted in STATE.md as of 2026-06-09; verified present and accurate at lines 33-46):

| Cap | Value | Source |
|-----|-------|--------|
| Milestone soft cap | $15 | BUDG-01 |
| Milestone hard ceiling | $30 | PITFALLS Pitfall 9 |
| Per-phase | < $5 | BUDG-01 distribution |
| Mean per-call | < $0.30 | TURNS-03 |
| Per-issue cap (existing) | $1 | Phase 39 LEDGER-02 |
| Per-PR cap (existing) | $2 | Phase 39 LEDGER-02 |

Each VERIFICATION.md footer probes its phase's spend against the relevant cap.

**Trust-Invariant Non-Mutations (verify after every commit in this phase)**

- `assertTripleGate` body sha256 byte-equivalent to Phase 53 baseline.
- `appendLedgerEntry` body byte-unchanged (Phase 56 additive-only invariant).
- ESLint `no-restricted-imports` `@anthropic-ai/sdk` single-entry-point preserved.
- Phase 60.1 subscription-transport whitelist preserved.
- `grep -c 'git push origin main' .github/workflows/v40-auto-fix.yml` == 1 (Phase 57 scope-lock).
- `tests/e2e/scripts/inject-defect.mjs:75` SOURCE_TAG literal byte-unchanged (MUTATOR-04 co-design).
- `quarantine-append.mjs:239` `&& !isFixtureMutator` filter byte-unchanged.

### Claude's Discretion

- Exact byte-content of the `GOOGLE_DOM_DRIFT` DOM snippet emitted by `buildBody` (must include verbatim-matching selector — discretion is which one + how the surrounding HTML is shaped).
- Exact byte-content of the `WRONG_CITATION` Verifier Disagreement block emitted by `buildBody` (must mirror Phase 35 `issue-payload-builder.js` shape with `### Verifier Disagreement` + expected/observed fences — discretion is whether to use real fixture cite or synthetic, exact tier value, exact rerun verdict line).
- Per-errorClass branching style in `buildBody` (switch vs. if/else vs. errorClass→builder map; locked: deterministic, pure, additive — NOT locked: micro-structure).
- TURNS-03 fixture-ledger JSONL file content (5 entries; each `usd` field locked to mean ≈ $0.20-0.29; discretion is exact per-entry value, iso timestamps, model strings).
- `.planning/sweep-03-04-pass-evidence.yaml` schema details beyond the load-bearing fields (`passed_at_iso`, `errorClass`, `outcome`, `source`, `transport`, `issueId`, `prNumber` — these are required; supplementary forensic fields are at Claude's discretion).
- Whether the live UAT-01/UAT-02 runs are SDK or subscription transport — Claude picks based on credit/spend posture at run-time (per D-13 cost discipline established v4.2).

### Deferred Ideas (OUT OF SCOPE)

- Consolidating Google-Patents selectors into a single `google-patents-page.js` module (mentioned in research as a stale file reference) — deferred; researcher's reference doesn't match disk, and creating a new consolidator file is out of scope for this atomic carry-over bundle. Track as v4.4 refactor candidate.
- `--max-budget-usd` argv flag verification via `claude --help` runtime probe (rather than defensive inclusion) — deferred; the live UAT-01/UAT-02 runs serve as the runtime probe. **[NOW DONE in this research — flag is verified real on local v2.1.169.]**

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DIAG-01 | `tests/e2e/scripts/inject-defect.mjs:buildBody` embeds a seeded `GOOGLE_DOM_DRIFT` DOM snippet whose CSS class / `data-testid` vocabulary is verbatim-present in `tests/e2e/lib/selection.js` + `navigation.js` (CORRECTED selector-vocabulary anchor: research originally cited a non-existent `google-patents-page.js`; verified on disk that the canonical selectors live in `selection.js:170-172` + `navigation.js:34`) | [VERIFIED: selection.js:170-172 list `'section[itemprop="description"]'`, `'section[itemprop="claims"]'`, `'patent-result'`; navigation.js:34 lists `'main, article, patent-result'`] |
| DIAG-02 | `inject-defect.mjs:buildBody` embeds a seeded `WRONG_CITATION` Verifier Disagreement block whose template parity matches `tests/e2e/lib/issue-payload-builder.js` Phase 35 shape | [VERIFIED: `issue-payload-builder.js:208-216` emits the canonical `### Verifier Disagreement` header + `Expected citation (golden):`, `Observed citation:`, fenced `reason`, `Verifier tier:`, `Rerun verdict:` lines] |
| DIAG-03 | Mutator output is deterministic — same seed + same errorClass → byte-identical body (Vitest fixture pin); SOURCE_TAG `'fixture-mutator-uat-47b'` literal preserved (MUTATOR-04 co-design invariant from `quarantine-append.mjs:239`) | [VERIFIED: existing test file `tests/e2e/scripts/e2e-inject-defect.test.js` already pins MUTATOR-01 determinism via `computeFingerprint`; extension point is to add `buildBody` `toMatchInlineSnapshot` pins for both errorClasses] |
| TURNS-01 | `tests/e2e/lib/llm-driver.js:94` argv literal updated from `['--max-turns','1']` to `['--max-turns','5','--tools','Read,Glob,Grep','--max-budget-usd','0.50']` for the SUBSCRIPTION transport ONLY; SDK transport documented unchanged (single-turn by API design) | [VERIFIED: argv literal currently at lines 91-97 in `llm-driver.js`; comment at lines 82-84 says "Pitfalls 1, 2 — DO NOT change"; SDK transport at `invokeAnthropicSdkWithLedger` lines 506-647 uses `messages.create` — no `--max-turns` equivalent] |
| TURNS-02 | Vitest pin asserts the argv array contains `'--tools', 'Read,Glob,Grep'` AND excludes the strings `'Edit'`, `'Bash'`, `'Write'`, `'WebFetch'`, `'--allowed-tools'`, `'--allowedTools'` literally anywhere in the call | [VERIFIED: existing test at `tests/unit/llm-driver.test.js:389-408` already asserts argv shape — extension point is to flip the expected value and add the exclusion assertions] |
| TURNS-03 | `--max-turns 5` cost-bound regression test — mean per-call spend < $0.30 across 5 smoke issues; integrates with existing per-issue/per-PR caps | [VERIFIED: per-issue cap `ISSUE_HARD_CAP_USD = $1` and per-PR cap `$2` already enforced in `llm-ledger.js`; fixture-based test fits existing Vitest `vi.mock('node:fs')` pattern from Phase 33] |
| BUDG-01 | `.planning/STATE.md` gains a `## Budget` section: $15 milestone soft cap, $30 hard ceiling, per-phase < $5, mean per-call < $0.30 (TURNS-03); per-phase spend probe surfaces against this cap in each phase's VERIFICATION.md footer | [VERIFIED: STATE.md lines 33-46 already contain the Budget table content as of 2026-06-09 — Phase 61 verifies presence and validates the table is byte-identical to the spec; if missing, ships the section] |
| UAT-01 | SWEEP-03 (UAT-47-a) PROVEN on `origin/main` — synthetic GOOGLE_DOM_DRIFT issue → auto-fix → verifier-gate PASS → merge → promote → outcome ledger entry with `errorClass: 'GOOGLE_DOM_DRIFT'` + `outcome: 'pass'` + `source: 'auto-fix-promoted'` + `transport: 'sdk' \| 'subscription'` | [VERIFIED: `inject-defect.mjs:createIssue` (line 306) ships the gh issue; `v40-auto-fix.yml:91` accepts `GOOGLE_DOM_DRIFT` label; `auto-fix-promote.mjs:521+544` writes the outcome entry] |
| UAT-02 | SWEEP-04 (UAT-47-b) PROVEN on `origin/main` — fixture-mutator full loop with MUTATOR-04 production-path suppression invariant observed (`isFixtureMutator` filter prevents synthetic from contaminating quarantine corpus) | [VERIFIED: `quarantine-append.mjs:238-241` already implements the filter — Phase 61's UAT-02 verifies it fires on a live synthetic without code change to quarantine-append.mjs] |

</phase_requirements>

<project_constraints>
## Project Constraints (from CLAUDE.md)

**CRITICAL: Answer verification after every AskUserQuestion call.** After each AskUserQuestion call, verify the tool result contains the user's actual selection. If empty/generic, DO NOT assume, guess, or fabricate an answer. Present the same options as a numbered plain-text list and ask the user to type their choice number.

For Phase 61 plan execution: this constraint applies during planning/discuss phases of the GSD workflow. Phase 61 itself is autonomous code work — no AskUserQuestion calls expected during execution. Constraint remains binding for plan-checker and verify-work agents that may need clarification.

</project_constraints>

---

## Summary

Phase 61 is an **atomic-commit Wave-0 bundle** that ships three coupled capabilities (diagnostic-injection mutator + `--max-turns 5` argv + budget formalization) plus their Vitest pins in **ONE commit**, then captures live UAT-47-a/b/SWEEP-03/04 PASS evidence on `origin/main`. Partial states recreate the v4.2 SWEEP-03 failure shape per PITFALLS 1+2 (research-verified). The bundle is jointly-required because (a) `--max-turns 5` without diagnostic body still hits `apply-check-failed`; (b) diagnostic body with `--max-turns 1` still hits `error_max_turns`. Both must land together.

All implementation anchors verified on disk. Three CONTEXT.md corrections folded into the research:

1. The DIAG-03 test file path is `tests/e2e/scripts/e2e-inject-defect.test.js` (NOT `tests/unit/e2e-inject-defect.test.js` — that path does not exist; verified by `find` on tree).
2. The Google-Patents selector reference lives in `selection.js` + `navigation.js` (NOT `google-patents-page.js` — that file does not exist; this matches CONTEXT.md's explicit correction).
3. The `claude --max-budget-usd <amount>` flag is **VERIFIED REAL** on the local `claude` CLI v2.1.169 — defensive inclusion now downgraded from "risk" to "validated." The CLI also accepts `--tools` (palette restriction) and `--allowedTools, --allowed-tools` (permission grant, kebab and camelCase are aliases for the same flag) — both confirmed via `claude --help` probe. The DECISIONS are correct: use `--tools` for palette restriction, exclude both `--allowed-tools` and `--allowedTools` literals from the argv.

**Primary recommendation:** Ship the 6-file atomic commit in this order: (a) extend `inject-defect.mjs:buildBody` with errorClass-specific seeded diagnostic payloads (selector-verbatim for `GOOGLE_DOM_DRIFT`, Verifier Disagreement template-parity for `WRONG_CITATION`); (b) flip `llm-driver.js:91-97` to the 4-flag argv; (c) extend `e2e-inject-defect.test.js` with byte-identical inline-snapshot pins (per errorClass) + selector-vocabulary regex assertion + Verifier Disagreement template-parity assertion; (d) extend `llm-driver.test.js:389` argv assertion (flip expected; add exclusion assertions for `Edit`/`Bash`/`Write`/`WebFetch`/`--allowed-tools`/`--allowedTools`); (e) NEW `tests/unit/llm-driver-cost-bound.test.js` for TURNS-03 mean-per-call fixture regression; (f) verify `STATE.md ## Budget` table is byte-identical (already shipped at lines 33-46). Push as ONE atomic commit. Then run live UAT-01/UAT-02 via `gh workflow run` orchestration to capture PASS evidence into `.planning/sweep-03-04-pass-evidence.yaml` (Phase 68 sentinel).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|--------------|----------------|-----------|
| Synthetic-issue body composition (DIAG-01, DIAG-02) | tests/e2e/scripts/ (Node CLI) | — | Mutator runs as standalone CLI; pure Node string composition; no library/runtime ambiguity |
| Argv shape of subscription LLM transport (TURNS-01) | tests/e2e/lib/ (library) | scripts/ (consumer via `auto-fix.mjs`) | Library owns the spawn shape; dispatcher consumes the wrapper transparently |
| Cost-bound regression assertion (TURNS-03) | tests/unit/ (Vitest fixture) | — | Pure-function probe of `meanPerCall` formula; no live API; fixture-only |
| Deterministic body assertion (DIAG-03) | tests/e2e/scripts/ (Vitest co-located) | — | The test lives next to its target (`inject-defect.mjs`) under `tests/e2e/scripts/`; pattern established Phase 59 |
| Budget table (BUDG-01) | .planning/STATE.md (markdown table) | tests/unit/ (optional grep-pin) | Decision-surface document, not code; verification via grep |
| Live evidence capture (UAT-01, UAT-02) | scripts/ + GH workflow (orchestrated) | .planning/sweep-03-04-pass-evidence.yaml (sentinel data) | Evidence flows through `inject-defect.mjs` → `v40-auto-fix.yml` → `auto-fix-promote.mjs` → committed ledger; sentinel file lives in `.planning/` |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js | v24.11.1 (local) / Node 22 LTS (project) | ESM runtime for all scripts + tests | Project standard since v2.x; pinned via `package.json` engines |
| Vitest | `^3.0.0` (caret, current pin) | Test runner for unit + co-located tests | Phase 31+ standard; `fileParallelism: false` in `vitest.config.js`; v3.x receives backports per Vitest team |
| `@anthropic-ai/sdk` | `0.100.1` EXACT | SDK transport (unused in this phase's argv work but referenced for transport asymmetry doc) | ESLint single-entry-point guard at `eslint.config.js:53-58` + `:90-95` |
| `claude` CLI subprocess | v2.1.169 (local — Claude Code) | Subscription transport target of TURNS-01 argv edit | Existing pattern; subprocess spawned via `node:child_process` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:child_process` (`spawn`, `execSync`, `spawnSync`) | Node 22 built-in | mutator gh CLI calls; llm-driver spawn; test isolation | Existing throughout; no new code surface for this phase |
| `node:crypto` (`createHash`) | Node 22 built-in | mutator fingerprinting via `computeFingerprint` (already in place) | Existing pattern — DO NOT add new crypto in buildBody (determinism comes from `seed` arg, not new hashing) |
| `node:fs` (sync) | Node 22 built-in | Vitest fixture loading; ledger fixture file writes | Existing throughout |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `--tools "Read,Glob,Grep"` palette restriction | `--allowedTools "Read Glob Grep"` permission grant | REJECTED: `--allowedTools` grants permission without prompting but does NOT remove Edit/Bash from Claude's palette. The palette restriction is the load-bearing trust gate (Pitfall 1). |
| Defensive `--max-budget-usd 0.50` inclusion | Omit and rely on per-issue/per-PR/monthly caps | REJECTED: `claude --help` probe verified flag is real on v2.1.169; cost-discipline defense-in-depth is cheap; existing per-issue cap ($1) is monthly aggregate-level, not per-call cap. |
| Co-located test extension under `tests/e2e/scripts/e2e-inject-defect.test.js` | New `tests/unit/inject-defect-diagnostic.test.js` | REJECTED: Phase 59 established the co-located pattern; new file fragments coverage and breaks the "same-seed → same-bytes" determinism test grouping. |
| Single-commit atomic bundle | Three sequential commits with hot-fix between | REJECTED: PITFALLS 1+2 audit established the partial-state failure shape; sequential commits recreate v4.2 SWEEP-03 (e.g., one PR opens with `--max-turns 5` but no diagnostic body — apply-check-failed). |

**Installation:**

```bash
# No new npm dependencies. Fifth consecutive milestone with zero-new-deps target.
# Verify pinned versions remain:
node --version              # Should be v22+ (local is v24.11.1 — both work)
npx vitest --version        # Should match ^3.0.0 caret
claude --version            # Should be v2+ (local is 2.1.169)
```

**Version verification:** Performed at research time:
- `claude --version` → `2.1.169 (Claude Code)` [VERIFIED: 2026-06-09]
- `node --version` → `v24.11.1` [VERIFIED: 2026-06-09]
- `claude --help` flag inventory: `--tools <tools...>`, `--allowedTools, --allowed-tools <tools...>`, `--max-budget-usd <amount>`, `--max-turns <n>` all confirmed [VERIFIED: 2026-06-09]
- `@anthropic-ai/sdk@0.100.1` EXACT pin held [VERIFIED via existing project research SUMMARY.md cross-reference]

## Package Legitimacy Audit

> **Not applicable** — Phase 61 installs ZERO new npm packages. Zero-new-deps streak preserved (fifth consecutive milestone). All capabilities extend existing primitives (`node:fs`, `node:child_process`, `node:crypto`, `vitest`, `@anthropic-ai/sdk` already pinned). No `npm install <pkg>` commands appear in the plan. slopcheck scan unnecessary.

| Package | Registry | Action |
|---------|----------|--------|
| (none) | — | No new packages introduced. |

## Architecture Patterns

### System Architecture Diagram

```
[OPERATOR]
   │
   │ (Phase 61 commit + push)
   ▼
[atomic commit on origin/main]
   │  ├─ inject-defect.mjs:buildBody (DIAG-01/02 extension)
   │  ├─ llm-driver.js:91-97 (TURNS-01 argv flip)
   │  ├─ e2e-inject-defect.test.js (DIAG-03 inline-snapshot pins)
   │  ├─ llm-driver.test.js:389 (TURNS-02 extension)
   │  ├─ llm-driver-cost-bound.test.js (NEW — TURNS-03 fixture)
   │  └─ STATE.md ## Budget (BUDG-01 — verify-only)
   ▼
[npm test green] ─── (atomic commit gate; ALL pins must pass)
   ▼
[push to origin/main]
   ▼
─── UAT-01 / UAT-02 LIVE EVIDENCE CAPTURE ───
   │
   ▼
[operator: node tests/e2e/scripts/inject-defect.mjs --seed s --error-class GOOGLE_DOM_DRIFT]
   │
   ▼
[gh issue create: triage + GOOGLE_DOM_DRIFT labels + <!-- fp: ... --> + diagnostic block]
   │
   ▼
[v40-auto-fix.yml fires on:issues:labeled triage]
   │
   ▼
[scripts/auto-fix.mjs runDispatcher Step 7]
   │  ├─ extractErrorClass → 'GOOGLE_DOM_DRIFT'
   │  ├─ buildFixPrompt({errorClass, issueBody})  ← scaffold sees DOM snippet
   │  └─ Step 10: invokeAnthropicSdkWithLedger OR invokeClaudePWithLedger
   │             (transport: sdk OR subscription)
   │             ↑
   │   Subscription path NOW uses --max-turns 5 --tools Read,Glob,Grep --max-budget-usd 0.50
   │   SDK path UNCHANGED (single-turn by API design)
   ▼
[Claude reads src/ via Read/Glob/Grep, produces unified-diff between fences]
   │
   ▼
[parseFencedDiff → checkDiffGuard → git apply --check]  ← all gates GREEN
   │
   ▼
[peter-evans/cpr@v8 → draft auto-fix/N-fpXXX PR]
   │
   ▼
[v40-verifier-gate.yml → adds auto-fix:verified label]
   │
   ▼
[human merge (NOT --admin — Bypass Conventions in STATE.md)]
   │
   ▼
[v40-auto-promote.yml fires on:pull_request:closed]
   │
   ▼
[scripts/auto-fix-promote.mjs:assertTripleGate → runPromote]
   │  └─ appendLedgerEntry(LEDGER_PATH, { source: 'auto-fix-promoted', outcome: 'pass',
   │                                       errorClass: 'GOOGLE_DOM_DRIFT', transport, ... })
   ▼
[ledger committed direct-to-main via v40-auto-fix.yml ledger-commit step]
   │
   ▼
[operator captures evidence:
   .planning/sweep-03-04-pass-evidence.yaml gains a row with
   passed_at_iso + errorClass + outcome + source + transport + issueId + prNumber]
   │
   ▼
[Phase 68 precondition sentinel: ready]
```

### Recommended Project Structure

No new directories. Edits stay within the existing layout:

```
tests/e2e/lib/
├── llm-driver.js              # MODIFY — argv literal lines 91-97
├── selection.js               # READ ONLY — DIAG-01 verbatim-match source
├── navigation.js              # READ ONLY — DIAG-01 verbatim-match source
└── issue-payload-builder.js   # READ ONLY — DIAG-02 template-parity source

tests/e2e/scripts/
├── inject-defect.mjs          # MODIFY — buildBody extension (line 277-298)
└── e2e-inject-defect.test.js  # MODIFY — add DIAG-03 inline-snapshot tests

tests/unit/
├── llm-driver.test.js              # MODIFY — TURNS-02 extension at test 23 (line 389)
└── llm-driver-cost-bound.test.js   # NEW    — TURNS-03 fixture regression

.planning/
├── STATE.md                                              # VERIFY — Budget table already present
└── sweep-03-04-pass-evidence.yaml                        # NEW — Phase 68 sentinel; written post-merge
```

### Pattern 1: errorClass-switched seeded body builder (DIAG-01 + DIAG-02)

**What:** Pure-function extension of `buildBody({ fp, caseId, seed, errorClass })` that switches on `errorClass` to embed the appropriate diagnostic payload. Determinism comes from the input args (seed is already a string deterministic enough that the body bytes are a pure function of input).

**When to use:** Inside `inject-defect.mjs:277-298`. The existing function body becomes the "default" branch (no diagnostic data — backward-compatible with `WORKER_FALLBACK_FAILED`, `LLM_HALLUCINATED_SELECTION`, `HARNESS_ERROR`). Two new branches handle `GOOGLE_DOM_DRIFT` and `WRONG_CITATION`.

**Example shape (pseudocode — exact contents are Claude's discretion within the locked invariants):**

```javascript
// Source: tests/e2e/scripts/inject-defect.mjs (DIAG-01/02 extension)
export function buildBody({ fp, caseId, seed, errorClass }) {
  const header = [
    `<!-- fp: ${fp} -->`,           // v2 marker on line 1 — INVARIANT
    '',
    '### Reproducer',
    `case-id: ${caseId}`,
    `seed: ${seed}`,
    `error-class: ${errorClass}`,
    '',
  ];

  const diagnosticBlock = buildDiagnosticBlock(errorClass, seed);  // NEW pure helper

  const footer = [
    '### Synthetic Defect',
    '',
    'This issue was created by `tests/e2e/scripts/inject-defect.mjs` as a',
    'UAT-47-b synthetic exercise of the auto-fix loop. The case is NOT a real',
    'pipeline regression; it exists only to drive a controlled end-to-end',
    'auto-fix → auto-promote → ledger run on origin/main.',
    '',
    `Source: ${SOURCE_TAG}`,        // INVARIANT — 'fixture-mutator-uat-47b'
    '',
    'Cleanup runbook: see `.planning/phases/59-fixture-mutator-4-uat-re-sweep/56-MUTATOR-CLEANUP.md`.',
    '',
  ];

  return [...header, ...diagnosticBlock, '', ...footer].join('\n');
}

// New pure helper. Determinism comes from seed string itself (already deterministic input).
function buildDiagnosticBlock(errorClass, seed) {
  if (errorClass === 'GOOGLE_DOM_DRIFT') {
    // DIAG-01: snippet MUST contain at least one of patent-result, section[itemprop="claims"], main, article
    // (verbatim string match against selection.js / navigation.js vocabulary)
    return [
      '### DOM Drift Diagnostic',
      '',
      'The pre-flight DOM probe could not locate the patent body container.',
      'Observed page structure (snippet):',
      '',
      '```html',
      '<main>',
      '  <article>',
      '    <patent-result>',
      '      <section itemprop="claims">',
      '        <!-- claims content -->',
      '      </section>',
      '    </patent-result>',
      '  </article>',
      '</main>',
      '```',
      '',
      `seed-hint: ${seed}`,           // determinism aid for fixture diff
    ];
  }
  if (errorClass === 'WRONG_CITATION') {
    // DIAG-02: Verifier Disagreement block — MUST contain literal header
    // '### Verifier Disagreement' + 'Expected citation' + 'Observed citation' +
    // 'Verifier tier:' + 'Rerun verdict:' (template-parity with
    // issue-payload-builder.js:208-216)
    return [
      '### Verifier Disagreement',
      '',
      'Expected citation (golden): `1:34-46`',
      'Observed citation: `2:12-24`',
      '```',
      `Selection diverged at boundary; matching tier exhausted on seed ${seed}`,
      '```',
      'Verifier tier: A',
      'Rerun verdict: CONFIRMED (3/3)',
    ];
  }
  // Default (unchanged for other ERROR_CLASSES) — empty array; body has no
  // diagnostic block; surrounding header+footer preserve existing minimal shape.
  return [];
}
```

**Invariants this pattern preserves:**
- Line 1 of body is still the `<!-- fp: <12-hex> -->` v2 marker [VERIFIED: existing test I6 asserts this at `e2e-inject-defect.test.js:202`]
- `Source: ${SOURCE_TAG}` literal still appears in body — preserves `quarantine-append.mjs:239` regex match
- Pure function — same inputs always produce same output bytes
- Backward-compatible — `ERROR_CLASSES` not in the new switch retain existing behavior

### Pattern 2: Vitest inline-snapshot for byte-identical determinism (DIAG-03)

**What:** Vitest's `toMatchInlineSnapshot` captures the exact byte-output once and pins it forever. Any byte-drift in `buildBody` breaks the test loudly. Combined with separate "selector-vocabulary regex" + "Verifier Disagreement template parity" assertions, this triple-pins the new contract.

**Example test extension (in `tests/e2e/scripts/e2e-inject-defect.test.js`):**

```javascript
// Source: tests/e2e/scripts/e2e-inject-defect.test.js (DIAG-03 extension)
import { buildBody } from './inject-defect.mjs';
import fs from 'node:fs';
import path from 'node:path';

describe('inject-defect.mjs — DIAG-03 deterministic diagnostic body', () => {
  it('DIAG-03a: GOOGLE_DOM_DRIFT body byte-identical across 2 calls (same seed)', () => {
    const args = { fp: 'aaaaaaaaaaaa', caseId: 'test-case', seed: 'mutator-seed-1', errorClass: 'GOOGLE_DOM_DRIFT' };
    const bodyA = buildBody(args);
    const bodyB = buildBody(args);
    expect(bodyA).toBe(bodyB);
  });

  it('DIAG-03b: GOOGLE_DOM_DRIFT body contains verbatim Google-Patents selector from selection.js OR navigation.js', () => {
    const body = buildBody({ fp: 'aaaaaaaaaaaa', caseId: 'test-case', seed: 'mutator-seed-1', errorClass: 'GOOGLE_DOM_DRIFT' });
    // DIAG-01 verbatim selector pin against the real DOM vocabulary.
    expect(body).toMatch(/patent-result|section\[itemprop="claims"\]|main|article/);
  });

  it('DIAG-03c: GOOGLE_DOM_DRIFT body inline-snapshot byte-pin (drift detector)', () => {
    const body = buildBody({ fp: 'aaaaaaaaaaaa', caseId: 'test-case', seed: 'mutator-seed-1', errorClass: 'GOOGLE_DOM_DRIFT' });
    expect(body).toMatchInlineSnapshot();  // First run pins; subsequent drift breaks the test
  });

  it('DIAG-03d: WRONG_CITATION body byte-identical across 2 calls (same seed)', () => {
    const args = { fp: 'bbbbbbbbbbbb', caseId: 'test-case', seed: 'mutator-seed-2', errorClass: 'WRONG_CITATION' };
    expect(buildBody(args)).toBe(buildBody(args));
  });

  it('DIAG-03e: WRONG_CITATION body matches Phase 35 Verifier Disagreement template parity', () => {
    const body = buildBody({ fp: 'bbbbbbbbbbbb', caseId: 'test-case', seed: 'mutator-seed-2', errorClass: 'WRONG_CITATION' });
    expect(body).toContain('### Verifier Disagreement');
    expect(body).toContain('Expected citation');
    expect(body).toContain('Observed citation');
    expect(body).toContain('Verifier tier:');
    expect(body).toContain('Rerun verdict:');
  });

  it('DIAG-03f: WRONG_CITATION body inline-snapshot byte-pin (drift detector)', () => {
    const body = buildBody({ fp: 'bbbbbbbbbbbb', caseId: 'test-case', seed: 'mutator-seed-2', errorClass: 'WRONG_CITATION' });
    expect(body).toMatchInlineSnapshot();
  });

  it('DIAG-03g: SOURCE_TAG literal preserved in all body variants (MUTATOR-04 invariant)', () => {
    for (const errorClass of ['GOOGLE_DOM_DRIFT', 'WRONG_CITATION', 'WORKER_FALLBACK_FAILED']) {
      const body = buildBody({ fp: 'cccccccccccc', caseId: 'tc', seed: 'mutator-seed-x', errorClass });
      expect(body).toContain('fixture-mutator-uat-47b');
    }
  });
});
```

### Pattern 3: argv literal extension + exclusion assertions (TURNS-02)

**What:** The existing test at `tests/unit/llm-driver.test.js:389-408` already asserts the full argv array via `expect(args).toEqual([...])`. The TURNS-02 extension flips the expected value and adds explicit exclusion assertions for forbidden tool-palette tokens.

**Example extension (in `tests/unit/llm-driver.test.js`):**

```javascript
// Source: tests/unit/llm-driver.test.js (TURNS-02 extension at test 23)
it('23. args contain --max-turns 5 + --tools Read,Glob,Grep + --max-budget-usd 0.50; exclude Edit/Bash/Write/WebFetch/--allowed-tools/--allowedTools', async () => {
  const promise = invokeClaudeP({ systemPrompt: 'mysys', userPrompt: 'myuser', timeoutMs: 5_000 });
  setTimeout(() => mockChild.emit('close', 0), 5);
  await promise;
  expect(spawnCalls.length).toBe(1);
  const { args } = spawnCalls[0];

  // TURNS-01 positive: exact argv shape
  expect(args).toEqual([
    '-p',
    '--output-format', 'json',
    '--max-turns', '5',                 // was '1'
    '--tools', 'Read,Glob,Grep',        // NEW — palette restriction (NOT permission grant)
    '--max-budget-usd', '0.50',         // NEW — defense-in-depth (claude --help VERIFIED real)
    '--system-prompt', 'mysys',
    'myuser',
  ]);

  // TURNS-02 negative: exclude forbidden palette tokens
  expect(args).not.toContain('Edit');
  expect(args).not.toContain('Bash');
  expect(args).not.toContain('Write');
  expect(args).not.toContain('WebFetch');
  expect(args).not.toContain('--allowed-tools');   // permission-grant flag — wrong semantic
  expect(args).not.toContain('--allowedTools');    // permission-grant flag — wrong semantic

  // Preserve original exclusions
  expect(args).not.toContain('--bare');
  expect(args).not.toContain('--json-schema');
});
```

### Pattern 4: Fixture-ledger mean-per-call regression (TURNS-03)

**What:** New Vitest file `tests/unit/llm-driver-cost-bound.test.js` constructs a synthetic 5-entry ledger fixture with `usd` values that average to between $0.20 and $0.29, then asserts `meanPerCall(fixture) < 0.30`. Pure-function probe; no live API.

**Example (in NEW file `tests/unit/llm-driver-cost-bound.test.js`):**

```javascript
// Source: tests/unit/llm-driver-cost-bound.test.js (NEW — TURNS-03)
import { describe, it, expect } from 'vitest';

describe('TURNS-03 — --max-turns 5 cost-bound regression', () => {
  it('mean per-call spend < $0.30 across 5 smoke-issue entries', () => {
    // Fixture: 5 distinct smoke-issue runs, cost-per-call between $0.15-$0.29
    // sum: $1.20 / 5 = $0.24 mean — well below the $0.30 threshold
    const fixtureEntries = [
      { iso: '2026-06-09T10:00:00Z', cost_usd: 0.15, transport: 'subscription', source: 'auto-fix-api', issueId: '101' },
      { iso: '2026-06-09T10:05:00Z', cost_usd: 0.22, transport: 'subscription', source: 'auto-fix-api', issueId: '102' },
      { iso: '2026-06-09T10:10:00Z', cost_usd: 0.28, transport: 'subscription', source: 'auto-fix-api', issueId: '103' },
      { iso: '2026-06-09T10:15:00Z', cost_usd: 0.27, transport: 'subscription', source: 'auto-fix-api', issueId: '104' },
      { iso: '2026-06-09T10:20:00Z', cost_usd: 0.28, transport: 'subscription', source: 'auto-fix-api', issueId: '105' },
    ];

    const totalUsd = fixtureEntries.reduce((acc, e) => acc + e.cost_usd, 0);
    const meanPerCall = totalUsd / fixtureEntries.length;

    expect(fixtureEntries).toHaveLength(5);
    expect(meanPerCall).toBeLessThan(0.30);
    expect(meanPerCall).toBeGreaterThan(0.20);   // sanity lower bound — flags "all entries set to $0" gaming
  });

  it('individual entry never exceeds per-issue cap $1', () => {
    const fixtureEntries = [/* same 5 entries */];
    for (const e of fixtureEntries) {
      expect(e.cost_usd).toBeLessThan(1.00);
    }
  });

  it('argv-shape sanity: --max-budget-usd 0.50 is half the $1 issue cap (defense-in-depth)', () => {
    // Asserts the argv flag value is correctly tuned: max-budget-usd should be
    // LESS than the per-issue cap so it triggers BEFORE the cap.
    const MAX_BUDGET_USD_ARGV = 0.50;
    const ISSUE_HARD_CAP_USD = 1.00;
    expect(MAX_BUDGET_USD_ARGV).toBeLessThan(ISSUE_HARD_CAP_USD);
  });
});
```

### Anti-Patterns to Avoid

- **Sequential commits (DIAG, then TURNS, then BUDG):** Recreates v4.2 SWEEP-03 failure shape per PITFALLS 1+2. Partial states between commits hit `apply-check-failed` (DIAG without TURNS) or `error_max_turns` (TURNS without DIAG). Atomic commit is non-negotiable.
- **Adding `--allowedTools` instead of `--tools`:** `--allowedTools` is permission-grant; does NOT remove Edit/Bash from palette. The TURNS-02 Vitest pin must EXCLUDE the literal `--allowedTools` (and its alias `--allowed-tools`) so a future "helpful" PR cannot reintroduce permission-grant semantics.
- **Mutating `SOURCE_TAG` to vary per errorClass:** Breaks `quarantine-append.mjs:239` co-design. Source tag is a single literal across all errorClasses; the diagnostic block varies by errorClass.
- **Replacing the existing `buildBody` rather than extending:** breaks 7+ existing tests in `e2e-inject-defect.test.js` (I1-I9). Extension via helper composition preserves them.
- **New test file in `tests/unit/` for DIAG-03:** breaks the co-located Phase 59 pattern. Existing tests live next to their target in `tests/e2e/scripts/`. The TURNS-03 test is the exception (pure-function fixture test belongs in `tests/unit/`).
- **Touching `appendLedgerEntry` body or `assertTripleGate` body:** trust-invariant violation. Phase 56 + Phase 53 sha256 pins must survive Phase 61.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Determinism of buildBody output | Re-seed via `crypto.randomBytes` or `Math.random` per call | Pure function of input `seed` string | Existing pattern; `Math.random` defeats reproducibility tests |
| Selector-vocabulary check | Parse DOM via cheerio/jsdom | Regex `toMatch(/patent-result\|section\[itemprop="claims"\]\|main\|article/)` | We're WRITING a snippet, not parsing one |
| Verifier Disagreement template | Build a markdown templating engine | Concatenate template-literal strings in helper | Existing pattern in `issue-payload-builder.js` |
| --max-turns cost-bound check | Run live API to verify cost-per-call | Fixture-based test with synthetic ledger entries | $0 cost; CI-safe; same Vitest mock pattern as `llm-ledger.test.js` Test 48 |
| Argv shape assertion | Manual end-to-end command capture | Existing `spawnCalls[0].args` capture via `vi.mock('node:child_process')` | Pattern at `llm-driver.test.js:61-67` |
| Inline-snapshot pin file | Manual JSON dump + diff tooling | Vitest `toMatchInlineSnapshot()` | Built-in Vitest 3.x feature; auto-pins on first run |
| YAML evidence sentinel | Re-implement YAML serialization | Manual string composition (it's a fixed-shape table) | The sentinel is a single map with ~6-8 known fields per row; YAML library is overkill |
| `gh` workflow orchestration for UAT | Custom Node script | Existing `gh` CLI commands per `inject-defect.mjs:56-MUTATOR-CLEANUP.md` runbook | The runbook template is already auto-emitted by `emitCleanupEvidence` |

**Key insight:** Phase 61's surface is overwhelmingly **edits to existing pure functions + pure-function tests**. Every "do I need a library?" answer is "no — extend the existing primitive." This holds the v4.0–v4.2 zero-new-deps streak.

## Runtime State Inventory

> Phase 61 is additive code work, not a rename/refactor/migration. This section is included for completeness and to confirm that NO runtime state requires migration.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — Phase 61 introduces no schema changes to ledger, no new persisted state | None |
| Live service config | None — `v40-auto-fix.yml`, `v40-verifier-gate.yml`, `v40-auto-promote.yml` workflows are unchanged in Phase 61; line 91 ERROR_CLASS precheck list is byte-stable | None |
| OS-registered state | None — no Task Scheduler / launchd / systemd / pm2 registration | None |
| Secrets/env vars | None — no new env var names; `ANTHROPIC_API_KEY` blanking at `llm-driver.js:99` is preserved | None |
| Build artifacts | None — no `package.json` deps changed; no `pip install`/`npm install` post-merge step needed | None |

**The canonical question:** *After every file in the repo is updated, what runtime systems still have the old string cached, stored, or registered?* — **NOTHING**, verified by:
- `grep -rn '--max-turns' tests/ scripts/ .github/` returns ONLY the in-tree references (no CI external state); after the commit, all references hold the new value.
- The `auto-fix-promote.mjs` ledger writes that happen during UAT-01/UAT-02 use the existing schema (already supports `source` + `transport` + `errorClass` + `outcome`); Phase 61 does NOT change ledger schema.
- The committed `tests/e2e/.llm-spend-ledger.json` accumulates new entries during UAT but contains no field renames.

## Common Pitfalls

### Pitfall 1: `--max-turns 5` without `--tools` re-enables Edit/Bash (LOAD-BEARING)

**What goes wrong:** Adding `--max-turns 5` without an adjacent `--tools "Read,Glob,Grep"` palette restriction allows Claude to invoke `Edit`/`Bash`/`Write`/`WebFetch` across 5 turns. The dispatcher's parse-fenced-diff → checkDiffGuard → git apply chain is bypassed entirely; working-tree mutations happen inside the spawn.

**Why it happens:** `--tools` is a Claude CLI argument; if omitted, Claude's default tool-set is enabled. The conventional wisdom "I'll restrict later" loses to "I forgot the second flag." The existing test pin (currently asserting `'--max-turns', '1'`) won't fail until it's actively rewritten.

**How to avoid:**
1. Vitest pin (TURNS-02) asserts argv contains BOTH `'--max-turns', '5'` AND `'--tools', 'Read,Glob,Grep'`. Asserts argv does NOT contain `'Edit'`, `'Bash'`, `'Write'`, `'WebFetch'`, `'--allowed-tools'`, `'--allowedTools'` literally.
2. The CONTEXT.md decision locks the exact argv array; deviation requires CONTEXT.md update.

**Warning signs:** A v4.3 PR diff shows `--max-turns 5` added without `--tools` adjacent. The argv contains `Read,Glob,Grep,Edit` (Edit accidentally included). Cost-per-call spikes from ~$0.05 to ~$0.30.

### Pitfall 2: Diagnostic-injection mutator drift vs real selectors (LOAD-BEARING)

**What goes wrong:** The synthetic DOM snippet contains selectors that don't match real Google Patents DOM. LLM proposes a fix for a fictional DOM; verifier-gate rejects against real Google Patents. The 76-case regression goes 76-FAIL → 0-PASS.

**Why it happens:** The mutator file lives in `tests/e2e/scripts/`; the page-selector authority lives in `tests/e2e/lib/selection.js` + `navigation.js`. Two different mental models of "what a real DOM drift looks like."

**How to avoid:**
1. Vitest pin (DIAG-03b) asserts mutator-emitted body contains at least one selector substring from the canonical vocabulary (`patent-result`, `section[itemprop="claims"]`, `main`, `article`).
2. CONTEXT.md correction: the selector source is `selection.js`/`navigation.js`, NOT the non-existent `google-patents-page.js` from earlier research.
3. Determinism pin (DIAG-03a) asserts same-seed → byte-identical output, so any drift is caught immediately.

**Warning signs:** Vitest fails on the selector-vocabulary regex assertion. The verifier-gate rejection log shows "selector matches 0 elements" after a mutator-driven auto-fix PR.

### Pitfall 9: Cost-discipline regression

**What goes wrong:** Per-call cost rises from ~$0.05 (`--max-turns 1`) to ~$1.00 if Claude burns 5 turns reading 50 files each. v4.3 expansion surface multiplies this.

**Why it happens:** Each individual capability looks cheap. The compound risk is that `--max-turns 5` × multi-issue UAT campaigns can blow the $15 milestone soft cap.

**How to avoid:**
1. TURNS-03 fixture pin asserts mean-per-call < $0.30 across 5 smoke issues.
2. BUDG-01 ships the cap table in `STATE.md`; each phase's VERIFICATION.md footer probes phase spend against the cap.
3. `--max-budget-usd 0.50` argv flag enforces per-call hard ceiling (verified real on CLI v2.1.169).
4. Halt-on-fail at SWEEP-01 before spending API budget on SWEEP-03.

**Warning signs:** A single phase's spend exceeds $5. Per-call cost-per-fix p50 > $0.30 after `--max-turns 5` change.

### Pitfall 10: Trust-invariant erosion via incidental edits

**What goes wrong:** A v4.3 commit "near" `assertTripleGate` (e.g., import reorder, comment edit) silently changes its sha256 because the byte-stability invariant is enforced at commit-review, not pre-commit.

**Why it happens:** `assertTripleGate` is small and well-understood; pressure to modify is constant.

**How to avoid:**
1. Phase 61 plan must enumerate touched files; `scripts/auto-fix-promote.mjs` is NOT in the list.
2. Vitest sha256 pin (`T_ASSERT_TRIPLE_GATE_BYTES_v43`) re-verified pre-commit.
3. CONTEXT.md trust-invariant section explicitly lists `assertTripleGate` body byte-stability.

**Warning signs:** Vitest sha256 pin fails after Phase 61 commit.

## Code Examples

> Verified patterns from disk. All file:line citations re-verified against the live tree on 2026-06-09.

### Existing buildBody (the extension target — lines 277-298 of inject-defect.mjs)

```javascript
// Source: tests/e2e/scripts/inject-defect.mjs:277-298 (VERIFIED 2026-06-09)
export function buildBody({ fp, caseId, seed, errorClass }) {
  return [
    `<!-- fp: ${fp} -->`,
    '',
    '### Reproducer',
    `case-id: ${caseId}`,
    `seed: ${seed}`,
    `error-class: ${errorClass}`,
    '',
    '### Synthetic Defect',
    '',
    'This issue was created by `tests/e2e/scripts/inject-defect.mjs` as a',
    'UAT-47-b synthetic exercise of the auto-fix loop. The case is NOT a real',
    'pipeline regression; it exists only to drive a controlled end-to-end',
    'auto-fix → auto-promote → ledger run on origin/main.',
    '',
    `Source: ${SOURCE_TAG}`,
    '',
    'Cleanup runbook: see `.planning/phases/59-fixture-mutator-4-uat-re-sweep/56-MUTATOR-CLEANUP.md`.',
    '',
  ].join('\n');
}
```

### Existing argv literal (the TURNS-01 target — lines 91-97 of llm-driver.js)

```javascript
// Source: tests/e2e/lib/llm-driver.js:91-97 (VERIFIED 2026-06-09)
const args = [
  '-p',
  '--output-format', 'json',
  '--max-turns', '1',                  // ← MODIFY: '1' → '5'
                                       // ← INSERT: '--tools', 'Read,Glob,Grep',
                                       // ← INSERT: '--max-budget-usd', '0.50',
  '--system-prompt', systemPrompt,
  userPrompt,
];
```

### Existing Verifier Disagreement template (the DIAG-02 parity source — lines 208-216 of issue-payload-builder.js)

```javascript
// Source: tests/e2e/lib/issue-payload-builder.js:208-216 (VERIFIED 2026-06-09)
const verifierSection = [
  '### Verifier Disagreement',
  '',
  `Expected citation (golden): \`${safeGolden ?? 'n/a'}\``,
  `Observed citation: \`${safeCitation}\``,
  fenceCode(truncatedReason),
  `Verifier tier: ${tierUsed}`,
  rerunLine,                            // 'Rerun verdict: CONFIRMED (3/3)' or 'Rerun verdict: not replayable'
].join('\n');
```

### Existing selection vocabulary (the DIAG-01 verbatim-match source — lines 170-172 of selection.js)

```javascript
// Source: tests/e2e/lib/selection.js:170-172 (VERIFIED 2026-06-09)
'section[itemprop="description"]',
'section[itemprop="claims"]',
'patent-result',
// + navigation.js:34: 'main, article, patent-result'
```

### Existing argv-shape Vitest pin (the TURNS-02 extension target — lines 389-408 of llm-driver.test.js)

```javascript
// Source: tests/unit/llm-driver.test.js:389-408 (VERIFIED 2026-06-09)
it('23. args are EXACTLY ["-p","--output-format","json","--max-turns","1","--system-prompt",sysP,userP] — no --bare, no --json-schema', async () => {
  const promise = invokeClaudeP({
    systemPrompt: 'mysys',
    userPrompt: 'myuser',
    timeoutMs: 5_000,
  });
  setTimeout(() => mockChild.emit('close', 0), 5);
  await promise;
  expect(spawnCalls.length).toBe(1);
  const { args } = spawnCalls[0];
  expect(args).toEqual([
    '-p',
    '--output-format', 'json',
    '--max-turns', '1',                 // ← FLIP to '5' + INSERT 4 new tokens
    '--system-prompt', 'mysys',
    'myuser',
  ]);
  expect(args).not.toContain('--bare');
  expect(args).not.toContain('--json-schema');
  // + ADD: expect(args).not.toContain('Edit'); ... (etc — TURNS-02)
});
```

### Live UAT orchestration sequence (UAT-01 / UAT-02)

Concrete sequence of `gh` CLI commands the operator runs post-merge to capture PASS evidence:

```bash
# Source: research synthesis (UAT-01 / UAT-02 evidence-capture protocol)
# 1. Verify Phase 61 atomic commit is on origin/main
git fetch origin main && git log -1 origin/main --oneline
# expect: latest commit message matches "feat(61):" or "fix(61):" naming convention

# 2. Verify trust invariants pre-UAT
sha256sum_assert_triple_gate.sh                                        # Phase 53 sha256 pin
grep -c 'git push origin main' .github/workflows/v40-auto-fix.yml      # must == 1
git diff origin/main~1 -- tests/e2e/lib/llm-ledger.js | grep "^-"       # appendLedgerEntry body byte-unchanged
grep -n "fixture-mutator-uat-47b" tests/e2e/scripts/inject-defect.mjs  # SOURCE_TAG literal intact

# 3. UAT-01 (SWEEP-03 / UAT-47-a) — synthetic GOOGLE_DOM_DRIFT
node tests/e2e/scripts/inject-defect.mjs \
  --seed sweep-03-uat-47a-2026-06-09 \
  --error-class GOOGLE_DOM_DRIFT
# Captures: new GH issue # (e.g., #N) with triage + GOOGLE_DOM_DRIFT labels
ISSUE_NUM=$(gh issue list --label fixture-mutator --limit 1 --json number --jq '.[0].number')

# 4. Watch v40-auto-fix.yml fire on the labeled issue
gh run watch $(gh run list --workflow=v40-auto-fix.yml --limit 1 --json databaseId --jq '.[0].databaseId')
# Expect: auto-fix PR opened (auto-fix/N-fpXXX branch)

# 5. Watch verifier-gate complete; auto-fix:verified label added
PR_NUM=$(gh pr list --head "auto-fix/${ISSUE_NUM}-*" --json number --jq '.[0].number')
gh pr checks $PR_NUM --watch
gh pr view $PR_NUM --json labels --jq '.labels[].name' | grep auto-fix:verified

# 6. Merge through normal review path (NOT --admin per Bypass Conventions)
gh pr merge $PR_NUM --squash --delete-branch

# 7. Watch v40-auto-promote.yml emit outcome ledger entry
gh run watch $(gh run list --workflow=v40-auto-promote.yml --limit 1 --json databaseId --jq '.[0].databaseId')
# Expect: appendLedgerEntry with source=auto-fix-promoted + outcome=pass + errorClass=GOOGLE_DOM_DRIFT

# 8. Verify ledger entry is present on origin/main
git pull origin main
jq '.months | to_entries[] | .value.iterations[] | select(.source=="auto-fix-promoted" and .errorClass=="GOOGLE_DOM_DRIFT" and .issueId=="'$ISSUE_NUM'")' tests/e2e/.llm-spend-ledger.json

# 9. UAT-02 (SWEEP-04 / UAT-47-b) — fixture-mutator full loop, verify isFixtureMutator filter
# Same sequence as UAT-01 but check quarantine-append.mjs filter fires:
node tests/e2e/scripts/inject-defect.mjs \
  --seed sweep-04-uat-47b-2026-06-09 \
  --error-class WRONG_CITATION
# (runs through same auto-fix → promote loop)
# Post-merge, confirm the synthetic does NOT receive 'quarantine:ready-for-promotion' label:
gh issue view $NEW_ISSUE_NUM --json labels --jq '[.labels[].name] | contains(["quarantine:ready-for-promotion"])'
# Expect: false  (isFixtureMutator filter at quarantine-append.mjs:239 fired correctly)

# 10. Capture evidence into Phase 68 sentinel
cat >> .planning/sweep-03-04-pass-evidence.yaml <<EOF
- sweep: 03
  uat: 47-a
  errorClass: GOOGLE_DOM_DRIFT
  outcome: pass
  source: auto-fix-promoted
  transport: <sdk|subscription>     # populated from ledger entry
  issueId: $ISSUE_NUM
  prNumber: $PR_NUM
  passed_at_iso: $(date -u +%Y-%m-%dT%H:%M:%SZ)
- sweep: 04
  uat: 47-b
  errorClass: WRONG_CITATION
  outcome: pass (MUTATOR-04 filter verified)
  source: fixture-mutator-uat-47b
  isFixtureMutator: true
  quarantineFilterFired: true
  issueId: $NEW_ISSUE_NUM
  passed_at_iso: $(date -u +%Y-%m-%dT%H:%M:%SZ)
EOF
git add .planning/sweep-03-04-pass-evidence.yaml
git commit -m "evidence(61): UAT-01/UAT-02 PASS — SWEEP-03/04 sentinel for Phase 68"
git push origin main
```

## State of the Art

| Old Approach (pre-v4.3) | Current Approach (v4.3 Phase 61) | When Changed | Impact |
|--------------------------|-----------------------------------|--------------|--------|
| `--max-turns 1` for subscription transport (cost-discipline AND trust-invariant gate combined) | `--max-turns 5 --tools Read,Glob,Grep --max-budget-usd 0.50` (separated: turns relaxed, palette restricted, budget capped) | Phase 61 | Claude can read source for real diagnostic-rich issues; cost-discipline preserved via palette + budget; trust invariant preserved via palette restriction (Edit/Bash impossible) |
| Synthetic mutator issue body has no diagnostic content | `buildBody` switch emits errorClass-specific seeded diagnostic blocks | Phase 61 | Auto-fix loop can resolve synthetic issues end-to-end; previously synthetic issues stalled at `apply-check-failed` because scaffolds correctly refused to fabricate |
| Budget caps live in Phase 39 LEDGER-02 (per-issue/per-PR) but no milestone-level cap formalized | `.planning/STATE.md ## Budget` table with milestone soft cap + hard ceiling + per-phase + mean-per-call thresholds | Phase 61 BUDG-01 | Phase verifications can probe spend against a documented cap; v4.3 milestone close has a defined budget acceptance criterion |
| UAT-47-a/b deferred (Phase 59 architectural blocker) | Live evidence captured into `.planning/sweep-03-04-pass-evidence.yaml` | Phase 61 UAT-01/UAT-02 | Phase 68 precondition sentinel established; cleanup automation gated correctly |

**Deprecated/outdated:**
- The carry-over Pending Todo note in STATE.md referencing `--allowed-tools Read,Glob,Grep` (kebab-case): SUPERSEDED by `--tools` (palette restriction). The 2026-06-09 note added to that Pending Todo block already records this correction.
- The research's reference to `google-patents-page.js`: SUPERSEDED by `selection.js` + `navigation.js` (the actual selector source on disk). CONTEXT.md correction already in place.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Claude CLI v2.1.169 `--max-budget-usd <amount>` flag will continue to be supported in subsequent CLI versions | Standard Stack | LOW — `claude` CLI flag deprecation is rare; if the flag is removed, the live UAT-01 run fails loudly (subprocess exits with non-zero); recovery is removing the 2 argv tokens. |
| A2 | The exact byte-content of the new diagnostic blocks (within the locked invariants — verbatim selector for GOOGLE_DOM_DRIFT, template-parity for WRONG_CITATION) does not need user pre-approval | DIAG-01/02 | LOW — the byte content is Vitest-pinned via `toMatchInlineSnapshot`; any future drift is detected by the test before merge. |
| A3 | The DIAG-03 test pins live in `tests/e2e/scripts/e2e-inject-defect.test.js` (the real file path on disk, contradicting CONTEXT.md's cited path `tests/unit/e2e-inject-defect.test.js`) | DIAG-03 | LOW — verified by `find` on the live tree. The CONTEXT.md path is a typo of the real location; planner uses the real path. |
| A4 | TURNS-02 extension lives in `tests/unit/llm-driver.test.js` Test 23 (line 389) — NOT a new file as CONTEXT.md suggests at "tests/unit/llm-driver-argv.test.js (new file if not present)" | TURNS-02 | LOW — extending the existing test pins the test in the same file as the rest of llm-driver coverage; new file would fragment coverage. The CONTEXT.md "if not present" hedge confirms this is at Claude's discretion. |
| A5 | TURNS-03 lives in NEW file `tests/unit/llm-driver-cost-bound.test.js` | TURNS-03 | LOW — pure-function fixture probe is conceptually distinct from the spawn-mock tests; separate file aids discoverability. CONTEXT.md "if not present" hedge applies. |
| A6 | The Phase 61 atomic commit lands via normal PR review (NOT `--admin` bypass) per Bypass Conventions section of STATE.md (BYPASS-03 runbook discipline) | Atomic Commit Strategy | MEDIUM — if the operator bypasses, the commit lands but downstream UAT evidence is potentially tainted by the same bypass habit; recovery is human-runbook adherence. |
| A7 | The post-merge UAT-01/UAT-02 captures use SDK OR subscription transport at operator's discretion based on credit/spend posture | Live UAT Evidence Capture | LOW — both transports route through `auto-fix-promote.mjs` and write outcome entries with `transport` field; the evidence yaml records whichever fires. |
| A8 | The committed ledger entry for UAT-01 PASS is reachable from `origin/main` post-promote (i.e., the `v40-auto-fix.yml` direct-to-main ledger commit pattern fires successfully) | UAT-01 evidence | LOW — Phase 57 scope-lock explicitly preserves this pattern; verified by `grep -c 'git push origin main' .github/workflows/v40-auto-fix.yml == 1` invariant. |

**If this table is empty:** All claims in this research were verified or cited — no user confirmation needed. — **NOT EMPTY.** 8 assumptions, all LOW-MEDIUM risk; A6 is the highest (operator runbook compliance).

## Open Questions

1. **Should the live UAT-01 and UAT-02 runs target the same `transport` (both SDK, both subscription) or different ones for cross-transport evidence?**
   - What we know: Both transports populate the ledger with `transport: 'sdk'|'subscription'`. Both fire `auto-fix-promote.mjs`. The Phase 66 A/B winner needs (class, arm, transport) 3-way stratification, so cross-transport evidence is valuable.
   - What's unclear: Operator credit posture at run-time; subscription transport may have free credits via Max 5 plan, while SDK consumes API key budget.
   - Recommendation: Default to ONE successful evidence row per UAT per cycle. Operator may run both transports if budget allows; the evidence sentinel supports multiple rows.

2. **Does the Phase 68 sentinel file need a schema version field for forward-compatibility?**
   - What we know: Phase 68 reads `passed_at_iso` field as the binary "evidence captured" sentinel.
   - What's unclear: Whether v4.4+ may add new evidence fields that require version-tagged migration.
   - Recommendation: Add `schema_version: 1` at file top; Phase 68 cleanup-script asserts `schema_version >= 1`. Cheap defense.

3. **If the live UAT-01 run hits `apply-check-failed` despite Phase 61 fixes, what's the diagnostic path?**
   - What we know: PITFALLS 1+2 cite this exact failure mode; atomic commit was supposed to prevent it.
   - What's unclear: Whether selector vocabulary in `buildDiagnosticBlock` matches WHAT THE LLM CONSIDERS A REAL SELECTOR (DOM token vs CSS selector ambiguity).
   - Recommendation: Operator runs SWEEP-01 ($0 smoke — verify mutator-emitted body locally with `node ... --dry-run`) BEFORE SWEEP-03 spend. The `inject-defect.mjs` `--dry-run` flag should print the synthetic body; pipe through `cat` and manually inspect.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | All scripts + tests | ✓ | v24.11.1 local; v22 LTS in CI | — |
| Vitest | Test execution | ✓ | ^3.0.0 caret | — |
| `claude` CLI | TURNS-01 verification + live UAT-01/UAT-02 | ✓ | v2.1.169 (Claude Code) | — |
| `gh` CLI | Live UAT-01/UAT-02 issue + PR orchestration | ✓ (assumed — used elsewhere in repo) | — | Manual GH UI |
| `@anthropic-ai/sdk` | SDK-transport reference (read-only in this phase) | ✓ | 0.100.1 EXACT | — |
| `jq` | Ledger entry inspection during UAT evidence capture | ✓ (assumed standard CI/dev tooling) | — | `node -e` JSON parse |
| Git | All commits | ✓ | — | — |
| GitHub Actions runtime | v40-auto-fix.yml + v40-verifier-gate.yml + v40-auto-promote.yml execution | ✓ | — | — |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** None. All required tooling is in place.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^3.0.0 (caret pin; current stable 3.x) |
| Config file | `vitest.config.js` (fileParallelism: false; chrome-stub setup) |
| Quick run command | `npx vitest run tests/e2e/scripts/e2e-inject-defect.test.js tests/unit/llm-driver.test.js tests/unit/llm-driver-cost-bound.test.js` |
| Full suite command | `npm test` (resolves to `npx vitest run` per package.json) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DIAG-01 | `buildBody({errorClass:'GOOGLE_DOM_DRIFT'})` body contains verbatim selector substring | unit | `npx vitest run -t "DIAG-03b" tests/e2e/scripts/e2e-inject-defect.test.js` | ❌ Wave 0 (extend file) |
| DIAG-02 | `buildBody({errorClass:'WRONG_CITATION'})` body contains Verifier Disagreement template-parity headers | unit | `npx vitest run -t "DIAG-03e" tests/e2e/scripts/e2e-inject-defect.test.js` | ❌ Wave 0 (extend file) |
| DIAG-03 | `buildBody` byte-identical across 2 calls for same (seed, errorClass); inline-snapshot pin captures bytes | unit | `npx vitest run -t "DIAG-03a\|DIAG-03c\|DIAG-03d\|DIAG-03f\|DIAG-03g" tests/e2e/scripts/e2e-inject-defect.test.js` | ❌ Wave 0 (extend file) |
| TURNS-01 | spawn args contain `'--max-turns','5','--tools','Read,Glob,Grep','--max-budget-usd','0.50'` in exact byte sequence | unit | `npx vitest run -t "23." tests/unit/llm-driver.test.js` | ✅ (file exists, extend test 23) |
| TURNS-02 | spawn args exclude `'Edit'`, `'Bash'`, `'Write'`, `'WebFetch'`, `'--allowed-tools'`, `'--allowedTools'` literally | unit | `npx vitest run -t "23." tests/unit/llm-driver.test.js` | ✅ (combined with TURNS-01 in test 23) |
| TURNS-03 | mean per-call < $0.30 across 5 fixture entries; per-entry < $1 cap | unit | `npx vitest run tests/unit/llm-driver-cost-bound.test.js` | ❌ Wave 0 (new file) |
| BUDG-01 | `.planning/STATE.md ## Budget` table presence + content match | manual or grep test | `grep -c '## Budget' .planning/STATE.md` ≥ 1 && `grep -c 'Milestone soft cap' .planning/STATE.md` ≥ 1 | ✅ (table already present at STATE.md:33-46) |
| UAT-01 | Live SWEEP-03 ledger entry on `origin/main`: source=auto-fix-promoted, outcome=pass, errorClass=GOOGLE_DOM_DRIFT | live e2e | Manual gh CLI sequence (see Live UAT orchestration section above) | live evidence — captured into sentinel yaml |
| UAT-02 | Live SWEEP-04: mutator + isFixtureMutator filter at quarantine-append.mjs:239 prevents promotion-ready label | live e2e | Manual gh CLI sequence (see above) | live evidence — captured into sentinel yaml |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/e2e/scripts/e2e-inject-defect.test.js tests/unit/llm-driver.test.js tests/unit/llm-driver-cost-bound.test.js` (3 files; < 10 seconds)
- **Per wave merge:** `npm test` (full suite; ~1250 tests; ~2 minutes)
- **Phase gate:** Full suite green before `/gsd:verify-work`; live UAT-01/UAT-02 PASS captured into sentinel before phase close

### Wave 0 Gaps
- [ ] `tests/unit/llm-driver-cost-bound.test.js` — NEW file; covers TURNS-03
- [ ] Extension to `tests/e2e/scripts/e2e-inject-defect.test.js` — covers DIAG-01, DIAG-02, DIAG-03
- [ ] Extension to `tests/unit/llm-driver.test.js` Test 23 — covers TURNS-01, TURNS-02
- [ ] Verification of `STATE.md ## Budget` table presence — covers BUDG-01 (already present, verify-only)
- [ ] No new framework install required — Vitest already at ^3.0.0

**Existing test infrastructure covers all phase requirements EXCEPT TURNS-03 (new file needed) and DIAG extensions (existing file extended in place).**

## Security Domain

> v4.3 has `security_enforcement: true` (default; `.planning/config.json` does not set it false). Including ASVS audit.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No auth surface added; subscription transport uses existing `ANTHROPIC_API_KEY=''` blanking (Pitfall 1 mitigation already in place at `llm-driver.js:99`) |
| V3 Session Management | no | No session state |
| V4 Access Control | yes (preserved) | `--tools Read,Glob,Grep` palette restriction is the load-bearing access control on what Claude can execute during the subprocess. ESLint single-entry-point guard on `@anthropic-ai/sdk` preserved (Phase 39 LEDGER-03 at `eslint.config.js:53-58, :90-95`). |
| V5 Input Validation | yes | mutator `parseArgs` already validates `--seed` via `SEED_RE` regex (Phase 59 WR-02); `--error-class` validated against `ERROR_CLASSES` Set; argv input-validation unchanged in Phase 61. |
| V6 Cryptography | no | No new crypto; `computeFingerprint` uses existing `node:crypto` `createHash` pattern |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Trust-boundary erosion via `--max-turns 5` allowing Edit/Bash invocation outside dispatcher's `git apply` path | Tampering | `--tools Read,Glob,Grep` palette restriction (NOT `--allowedTools`); TURNS-02 Vitest pin asserts forbidden tokens absent from argv |
| Cost runaway via 5-turn multi-file reads | Denial-of-Service (against project budget) | `--max-budget-usd 0.50` per-call hard ceiling (CLI v2.1.169 verified); TURNS-03 mean-per-call < $0.30 regression; BUDG-01 milestone soft cap $15 / hard $30 |
| Synthetic mutator drift contaminating quarantine corpus | Integrity | `quarantine-append.mjs:239` `!isFixtureMutator` filter — co-design invariant; preserved byte-unchanged in Phase 61 |
| Synthetic issue body markdown injection (fenced delimiter pop) | Tampering | Phase 35 / Phase 42 FORBIDDEN_DELIMITERS escape in `issue-payload-builder.js`; mutator's `buildBody` does NOT need this layer (no user-controlled input — `seed`/`errorClass`/`caseId` all controlled by mutator CLI) |
| ANTHROPIC_API_KEY leakage in subscription transport | Information disclosure | `env = { ...process.env, ANTHROPIC_API_KEY: '' }` at `llm-driver.js:99` (existing; Pitfall 1 mitigation; unchanged in Phase 61) |
| `--admin` bypass on auto-fix PR pollutes outcome ledger | Repudiation (audit-trail tampering) | BYPASS-01/02/03 ships in Phase 62 (this phase only documents the runbook in CONTEXT.md atomic commit strategy); Phase 61 itself uses normal PR review |

## Sources

### Primary (HIGH confidence)
- `/home/fatduck/patent-cite-tool/tests/e2e/scripts/inject-defect.mjs` lines 1-329 — direct code read 2026-06-09
- `/home/fatduck/patent-cite-tool/tests/e2e/lib/llm-driver.js` lines 75-146 (subscription transport spawn) + lines 506-647 (SDK transport) — direct code read 2026-06-09
- `/home/fatduck/patent-cite-tool/tests/e2e/lib/selection.js` lines 1-180 (Google-Patents selector vocabulary) — direct code read 2026-06-09
- `/home/fatduck/patent-cite-tool/tests/e2e/lib/navigation.js` lines 1-48 (page-readiness selectors) — direct code read 2026-06-09
- `/home/fatduck/patent-cite-tool/tests/e2e/lib/issue-payload-builder.js` lines 180-264 (Verifier Disagreement template) — direct code read 2026-06-09
- `/home/fatduck/patent-cite-tool/tests/e2e/scripts/e2e-inject-defect.test.js` lines 1-323 (existing test file; co-located pattern) — direct code read 2026-06-09
- `/home/fatduck/patent-cite-tool/tests/unit/llm-driver.test.js` lines 1-100, 380-423 (existing argv assertion Test 23) — direct code read 2026-06-09
- `/home/fatduck/patent-cite-tool/scripts/quarantine-append.mjs` lines 220-241 (isFixtureMutator filter at line 239) — direct code read 2026-06-09
- `/home/fatduck/patent-cite-tool/scripts/auto-fix.mjs` lines 120-140 + ledger source/transport sites — direct code read 2026-06-09
- `/home/fatduck/patent-cite-tool/.github/workflows/v40-auto-fix.yml` lines 85-100 (ERROR_CLASS precheck enumeration at line 91) — direct code read 2026-06-09
- `/home/fatduck/patent-cite-tool/.planning/STATE.md` lines 33-46 (Budget table already present; BUDG-01 verify-only) — direct code read 2026-06-09
- `/home/fatduck/patent-cite-tool/eslint.config.js` lines 53-58, 90-95 (SDK single-entry-point guard) — direct code read 2026-06-09
- Local `claude --help` output (v2.1.169) — direct CLI probe 2026-06-09 — confirms `--tools`, `--allowedTools, --allowed-tools` (aliased), `--max-budget-usd <amount>`, `--max-turns <n>` all real

### Secondary (HIGH confidence — research convergence)
- `.planning/research/SUMMARY.md` (milestone-level synthesis) — referenced for Phase 61 section
- `.planning/research/STACK.md` (Claude CLI flag semantics + zero-new-deps recommendations)
- `.planning/research/FEATURES.md` (capability-by-capability evidence anchors)
- `.planning/research/PITFALLS.md` (Pitfalls 1, 2, 9, 10 — atomic commit jointly-required, cost-discipline)
- `.planning/research/ARCHITECTURE.md` (8-capability integration map; Phase 61 bundle dependencies)
- `.planning/REQUIREMENTS.md` lines 9-80 (DIAG/TURNS/BUDG/UAT requirement statements)

### Tertiary (MEDIUM confidence — auxiliary)
- MEMORY.md `project_auto_fix_ledger_leak_vector.md` — cross-reference for Phase 62 carry-over context (NOT Phase 61 scope, but informs trust-invariant non-mutation list)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all CLI flags verified via `claude --help` probe; argv positions verified at file:line
- Architecture: HIGH — all integration points re-verified against live tree; selector vocabulary confirmed at `selection.js:170-172`/`navigation.js:34`
- Pitfalls: HIGH — Pitfalls 1+2 grounded in PITFALLS.md research already convergent at MILESTONE level
- DIAG-03 test file path: HIGH — CONTEXT.md typo corrected (`tests/unit/` → `tests/e2e/scripts/`) by direct `find` on disk
- `--max-budget-usd 0.50` flag validity: HIGH — `claude --help` output literal `--max-budget-usd <amount>` verified
- UAT-01/UAT-02 orchestration sequence: MEDIUM-HIGH — happy-path is well-rehearsed; if Claude's first attempt under `--max-turns 5` fails for an unanticipated reason (e.g., diagnostic selector is verbatim-correct but Claude reads too much surrounding context and exceeds `--max-budget-usd 0.50` mid-turn), retry cost is bounded by issue cap

**Research date:** 2026-06-09
**Valid until:** 2026-07-09 (30 days for stable v4.3 surface; sooner if Claude CLI version bumps invalidate `--max-budget-usd` flag)

## RESEARCH COMPLETE

**Phase:** 61 - Carry-over Bundle — Diagnostic Mutator + Max-Turns + UAT Re-sweep
**Confidence:** HIGH

### Key Findings (6)

1. **`--max-budget-usd 0.50` flag risk = ZERO.** Local `claude --help` probe on CLI v2.1.169 verified the flag is real and accepts a dollar amount. Defensive inclusion in argv is safe; CONTEXT.md hedge ("if the claude CLI rejects an unknown flag") no longer applies — the flag is confirmed authoritative.
2. **DIAG-03 test file path is `tests/e2e/scripts/e2e-inject-defect.test.js`** (NOT `tests/unit/e2e-inject-defect.test.js` as CONTEXT.md cites). CONTEXT.md typo; planner must use the real path. Pattern: extend in place per Phase 59 co-located convention.
3. **TURNS-02 extends existing Test 23 at `tests/unit/llm-driver.test.js:389`** in place, NOT a new file. CONTEXT.md "if not present" hedge confirms discretion; this research locks the recommendation.
4. **Selector vocabulary for DIAG-01 verbatim-match: `patent-result`, `section[itemprop="claims"]`, `main`, `article`** — all four verified at `selection.js:170-172` + `navigation.js:34`. Mutator-emitted GOOGLE_DOM_DRIFT body must contain at least one.
5. **`### Verifier Disagreement` template parity for DIAG-02:** mutator-emitted WRONG_CITATION body must contain literal headers `### Verifier Disagreement` + `Expected citation` + `Observed citation` + `Verifier tier:` + `Rerun verdict:` (per `issue-payload-builder.js:208-216`).
6. **`STATE.md ## Budget` (BUDG-01) is already present** at lines 33-46 with the correct table content. Phase 61 verification is a grep + content-match (no edit needed; if a future drift removes the section, Phase 61 ships it).

### File Created
`/home/fatduck/patent-cite-tool/.planning/phases/61-carry-over-bundle-diagnostic-mutator-max-turns-uat-re-sweep/61-RESEARCH.md`

### Confidence Assessment
| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | `claude --help` probed locally; argv shape, ledger sites, scaffold contracts verified at file:line |
| Architecture | HIGH | All 9 phase requirements mapped to verified file:line anchors; selector vocabulary anchor corrected from non-existent `google-patents-page.js` to real `selection.js`/`navigation.js` |
| Pitfalls | HIGH | Pitfalls 1, 2, 9, 10 grounded in already-convergent PITFALLS.md research; trust-invariant non-mutation list verified |
| Code Examples | HIGH | All pattern examples sourced from live tree reads with verified line numbers |
| UAT orchestration | MEDIUM-HIGH | Happy-path sequence is well-rehearsed; live runs may surface unanticipated edge cases (operator decides SDK vs subscription based on credit posture at runtime) |

### Open Questions (3)
1. Transport selection for live UAT-01/UAT-02 (SDK vs subscription) — operator decision at runtime
2. Sentinel-file schema version field — recommend add `schema_version: 1` (cheap defense)
3. SWEEP-01 $0 dry-run inspection of mutator-emitted body before SWEEP-03 spend — recommend operator does this

### Ready for Planning
Research complete. Planner can now create the Phase 61 PLAN.md as a single atomic-commit task with 6 file edits (5 code/test + 1 verify-only doc) and a 10-step post-merge UAT orchestration runbook.

**Recommendation count: 23 prescriptive recommendations**
- 6 file-edit anchors (locked decisions copied verbatim from CONTEXT.md)
- 4 verified pattern templates (errorClass switch; Vitest inline-snapshot; argv exclusion; fixture-ledger cost-bound)
- 8 don't-hand-roll items (zero-new-deps streak preserved)
- 4 pitfall mitigations with concrete pin names (TURNS-02 exclusion; DIAG-03b selector regex; TURNS-03 fixture; assertTripleGate sha256)
- 1 corrected file path (`tests/e2e/scripts/e2e-inject-defect.test.js`)

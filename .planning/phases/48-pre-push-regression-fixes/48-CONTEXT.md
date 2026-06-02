# Phase 48: Pre-Push Regression Fixes - Context

**Gathered:** 2026-06-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Restore `npm test` to exit 0 locally so CI can pass green on the v4.0-integration PR (Phase 49). Four surgical fixes to clear the three currently-failing test regressions + install a structural defense against the committed-ledger leak that has now recurred twice:

1. **PRE-01 — Ledger reset.** Restore `tests/e2e/.llm-spend-ledger.json` to its single Phase 39 bootstrap entry (`phase='39-bootstrap'`, sonnet, $0). Remove the 4 leaked `2026-06` opus entries (`phase:null, transport:null`, ~$0.451 total — note: $0.451, not the $0.353 the requirements doc cites; the ledger has grown one entry since requirements were written). Returns Test 48 at `tests/unit/llm-ledger.test.js:1012` to GREEN.

2. **PRE-02 — Step 0 guard in `invokeAnthropicSdkWithLedger`.** New guard at the top of the function (`tests/e2e/lib/llm-driver.js`, currently writes ledger entries via the path documented at line 510): when `forceApi:true && !CI && !E2E_LEDGER_PATH_OVERRIDE`, THROW. Prevents any future local SDK call from polluting the committed ledger — structural fix that Phase 47's reset alone did NOT install (which is why the leak recurred).

3. **PRE-03 — Epoch-relative fixture refactor in `tests/e2e/scripts/e2e-weekly-digest.test.js`.** Replace the existing scattered date-pin pattern (`PIN_NOW` at line 64, hardcoded `'2026-05'` month key at line ~395, inline ISO fixture dates like `'2026-05-22T...'`/`'2026-05-19T...'`/`'2026-05-10T...'`, hardcoded `'2026-W22'` week label) with a single `PIN_NOW_ISO` anchor + `daysAgo(n)` derivation pattern. Changing the anchor re-calibrates the whole test in one edit. Supersedes Phase 47's INT-FIX-CAL band-aid (which used `new Date().toISOString().slice(0,7)` — that worked but is non-deterministic across calendar boundaries; this phase locks the test to a fixed semantic anchor).

4. **PRE-04 — Lockfile EXACT pin defense (already exists; this phase verifies/repairs).** Phase 47 already created `tests/unit/package-lock-pinned.test.js` (4-assertion static-grep). Phase 48 confirms it still asserts `@anthropic-ai/sdk@0.100.1` with no caret in both `package.json` and `package-lock.json` and that `npm install` does not reintroduce the caret. If the existing test has drifted or the lockfile has been re-cared, restore.

**Out of scope:**
- Pushing v4.0 to origin or opening the integration PR — that's Phase 49.
- Re-litigation of why the ledger leaked twice — the root cause was the missing structural guard; PRE-02 closes it. No incident write-up needed.
- Any change to Test 48's assertion in `tests/unit/llm-ledger.test.js:1012` — fix-at-root rule from Phase 47 still applies.
- Any change to `assertTripleGate`, `_skipCiGuard`, or v4.0 workflow YAML — locked by trust invariant.
- Bumping `@anthropic-ai/sdk` past `0.100.1` — exact pin holds through v4.1.

</domain>

<decisions>
## Implementation Decisions

### PRE-02: Step 0 Guard Contract

- **D-01:** **No regression test pins the guard.** The success criteria already specify "throws a contract-error"; the existing Test 48 catches downstream pollution. Surgical commit — guard alone is enough. (User explicitly chose this over a defense-in-depth unit test to keep the commit minimal.)
- **D-02:** **Plain `Error` with explicit fix message.** No custom error class.
  ```js
  throw new Error('invokeAnthropicSdkWithLedger: forceApi:true blocked outside CI without E2E_LEDGER_PATH_OVERRIDE. Set E2E_LEDGER_PATH_OVERRIDE=<tmpfile> to redirect ledger writes, or run inside CI. Prevents committed-ledger pollution.')
  ```
  Self-documenting; tells the next engineer exactly what to do; no new module/export surface.
- **D-03:** Guard fires at Step 0 — first line inside the function body, BEFORE any of the existing `forceApi` branching. Reads `process.env.CI` (truthy) and `process.env.E2E_LEDGER_PATH_OVERRIDE` (any non-empty string).
- **D-04:** No escape hatch beyond `E2E_LEDGER_PATH_OVERRIDE`. If a future workflow needs to write the committed ledger outside CI (e.g., the daily snapshot job), it can set `CI=true` or use the existing override. No new env var introduced.

### PRE-03: Epoch-Relative Fixture Pattern

- **D-05:** **Single top-of-file anchor: `const PIN_NOW_ISO = '2026-05-25T00:00:00Z'`.** Existing `PIN_NOW` factory at line 64 is replaced (or rewritten as `() => new Date(PIN_NOW_ISO)`). All derived dates flow from this one string.
- **D-06:** **Tiny in-file helper:** `const daysAgo = (n) => new Date(Date.parse(PIN_NOW_ISO) - n * 86400000).toISOString()`. Defined next to the anchor. Each fixture replaces `'2026-05-22T...'` with `daysAgo(3)`, `'2026-05-19T...'` with `daysAgo(6)`, `'2026-05-10T...'` with `daysAgo(15)`, etc. The call-site name IS the semantics ("created 3 days before now").
- **D-07:** Replace the hardcoded `'2026-05'` month key (line ~395) with `PIN_NOW_ISO.slice(0, 7)`. Replace the hardcoded `'2026-W22'` week label with `isoWeekLabel(new Date(PIN_NOW_ISO))` (or whatever the file's existing week-label fn is).
- **D-08:** **No new helper module.** All new helpers stay inside `e2e-weekly-digest.test.js`. No env-overridable hatch (no `process.env.TEST_PIN_NOW`) — keeps the test deterministic and avoids env-interpretation surface.
  - **D-08-AMEND (2026-06-02, planning):** Adding a single optional `now: Date` parameter to the existing `renderCostLine` export in `scripts/weekly-digest.mjs` is **permitted** as part of this phase. This is an additive, backward-compatible signature change to an existing production function — not a new module. It is required to thread the `PIN_NOW_ISO` anchor into the production month-key lookup so the test does not have to hardcode `'2026-05'` (D-07 band-aid) or rely on a live clock (Phase 47 band-aid that PRE-03 supersedes). All call sites that omit the param continue to use `new Date()` — no behavior change in production. `scripts/weekly-digest.mjs` is added to "Source files to modify" below.

### Plan Structure & Commit Convention

- **D-09:** **One plan (`48-01-PLAN.md`) covering all 4 PRE-* fixes as 4 sequential tasks.** Mirrors the "three failing tests, one commit set" framing from `.planning/research/SUMMARY.md` §"Phase 48".
- **D-10:** **Four atomic commits, one per PRE-***, message pattern: `fix(48-pre-push): PRE-<N> — <one-line>`. Mirrors Phase 47's `fix(47-cleanup): INT-FIX-<TAG> — ...` convention from `.planning/milestones/v4.0-phases/47-v4-0-cleanup/47-CONTEXT.md` §"Commit granularity".

### Defense Ordering

- **D-11:** **Commit order: Guard (PRE-02) → Reset (PRE-01) → Epoch (PRE-03) → Lockfile (PRE-04).**
  - PRE-02 first: any local SDK call between commits cannot re-leak the ledger.
  - PRE-01 second: the reset commit's `.llm-spend-ledger.json` diff is the *only* commit that ever touches that file unguarded — cleanest possible audit trail for the legal-filing tool.
  - PRE-03 third: epoch-fixture refactor is independent and slots in naturally.
  - PRE-04 fourth: lockfile pin is verify-or-repair; lands last because it's the lowest-risk and most independent.

### Claude's Discretion

- Exact wording of each commit message body (1-2 sentences describing root-cause + fix mechanism, mirroring Phase 47 INT-FIX commit-body shape).
- Whether `daysAgo` lives directly above `PIN_NOW_ISO` or just below — purely stylistic.
- Whether to keep the existing `PIN_NOW = () => new Date('...')` factory (rewriting its body) or replace with `const PIN_NOW = new Date(PIN_NOW_ISO)` — depends on whether downstream call sites require a fresh `Date` instance or can share a frozen one.
- Whether PRE-04 requires any code change at all. If `tests/unit/package-lock-pinned.test.js` from Phase 47 still passes and `package.json` + `package-lock.json` still hold the EXACT pin, PRE-04 is a no-op verify; commit may be a status-only entry in the plan SUMMARY rather than a code commit. The planner determines this from a `git log --oneline -- tests/unit/package-lock-pinned.test.js` + `grep '"@anthropic-ai/sdk"' package.json package-lock.json` check.
- The precise day-offset numbers in `daysAgo(N)` calls — derive from current literal dates in the file relative to `2026-05-25T00:00:00Z` and verify each fixture's semantic role (in-window vs out-of-window vs cutoff-edge) is preserved.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Roadmap (LOCKED)
- `.planning/REQUIREMENTS.md` §"Pre-Push" (PRE-01 to PRE-04, lines 14-17) — verbatim requirement text; success criteria.
- `.planning/ROADMAP.md` §"Phase 48: Pre-Push Regression Fixes" (lines 168-180) — phase goal, 5 success criteria, wave-0 blocking position.

### Research (HIGH-confidence)
- `.planning/research/SUMMARY.md` §"Phase 48" (lines 95-101) — rationale; "no research needed — line numbers confirmed; surgical fixes".
- `.planning/research/PITFALLS.md` — Pitfall 5 (contract relaxation: do NOT loosen Test 48); Pitfall 6 (hardcoded-date fix that re-breaks next month — i.e. don't repeat Phase 47's INT-FIX-CAL band-aid).
- `.planning/research/ARCHITECTURE.md` §1.1 — `invokeAnthropicSdkWithLedger` signature; `model:` parameter at line 510 of `llm-driver.js`; transport tag at line 611.

### Phase 47 precedent (the previous attempt + its commit convention)
- `.planning/milestones/v4.0-phases/47-v4-0-cleanup/47-CONTEXT.md` §"CLEANUP-01" — INT-FIX-LEDGER/CAL/LOCK decisions; commit-message pattern `fix(<phase>-<scope>): <TAG> — <one-line>`; "fix at root, not by relaxing assertion" rule.
- `.planning/milestones/v4.0-phases/47-v4-0-cleanup/47-01-SUMMARY.md` — actual Phase 47 results; documents that the dynamic-month fix was applied at line 389 (now line ~395 after intervening edits); Phase 39 seed-only ledger shape; 4-assertion package-lock-pinned test.
- `.planning/milestones/v4.0-phases/47-v4-0-cleanup/47-REVIEW.md` lines 32-51 — exact files touched in Phase 47's INT-FIX block; resolved-URL substring assertion in `tests/unit/package-lock-pinned.test.js`.

### Source files to modify
- `tests/e2e/.llm-spend-ledger.json` — current state: 2 month buckets (`2026-05` bootstrap + `2026-06` 4-entry leak). PRE-01 deletes the `2026-06` bucket.
- `tests/e2e/lib/llm-driver.js` — `invokeAnthropicSdkWithLedger` (signature documented around line 510). PRE-02 adds Step 0 guard at first line of function body.
- `tests/e2e/scripts/e2e-weekly-digest.test.js` — current state: `PIN_NOW = () => new Date('2026-05-25T00:00:00Z')` at line 64; hardcoded `'2026-05'` at line ~395 (was 389 pre-Phase-47); inline fixture ISO strings at multiple sites. PRE-03 refactors to single `PIN_NOW_ISO` + `daysAgo(n)`.
- `scripts/weekly-digest.mjs` — `renderCostLine({ ledgerPath })` at line ~224 currently derives the month key from `new Date()` internally. PRE-03 adds an optional `now: Date` parameter (default `new Date()`) so the test can thread `PIN_NOW()` deterministically. See D-08-AMEND above. Additive only — no behavior change for existing call sites.
- `tests/unit/llm-ledger.test.js:1012` — Test 48 anchor (`months.length toBe(1)`). NOT MODIFIED; it goes green after PRE-01.
- `tests/unit/package-lock-pinned.test.js` — Phase 47 artifact (4 assertions). PRE-04 verifies still passes; only modified if regression detected.
- `package.json` line 39 — `"@anthropic-ai/sdk": "0.100.1"`. Verified-only by PRE-04.
- `package-lock.json` lines 9, 19-21 — `"@anthropic-ai/sdk": "0.100.1"` + resolved URL substring `sdk-0.100.1.tgz`. Verified-only by PRE-04.

### Project context
- `.planning/PROJECT.md` §"Current Milestone: v4.1" — milestone goal; Phase 48 is Wave-0 blocker.
- `.planning/STATE.md` §"Decisions" — Phase 48 blocks all; Wave constraints LOCKED; trust invariant unchanged.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Phase 47's `tests/unit/package-lock-pinned.test.js`** — 4 it() blocks already pin `@anthropic-ai/sdk@0.100.1` EXACT in both `package.json` and `package-lock.json` + resolved-URL substring check. PRE-04 is verify-only unless drift detected.
- **Phase 47's commit-message pattern** — `fix(<phase>-<scope>): <TAG> — <one-line>`. Phase 48 mirrors as `fix(48-pre-push): PRE-<N> — <one-line>`.
- **Phase 39 seed-only ledger shape** — single `2026-05` bucket, 1 invocation, sonnet, `cost_usd:0`, `tokens:0`, `phase:'39-bootstrap'`, `transport:'sdk'`, `source:'phase-39-flip'`. PRE-01 restores this exact shape.
- **Existing `currentMonth()` helper at `tests/e2e/lib/llm-ledger.js:161-163`** — `new Date().toISOString().slice(0, 7)`. Phase 47's INT-FIX-CAL used this dynamically; Phase 48 deliberately does NOT — anchors month derivation to `PIN_NOW_ISO` instead so the test is deterministic across calendar boundaries.

### Established Patterns
- **Fix-at-root rule** — never relax Test 48; never widen contract assertions to accommodate observed (broken) state. From `47-CONTEXT.md` §"CLEANUP-01" key decision.
- **Static-grep over AST parsing** — phase 47 used file-as-text grep for invariant assertions to preserve zero-new-dep rule. PRE-04 inherits this approach.
- **Forward-only commits** — no `git commit --amend` on historical commits (BOOKS-01 reaffirms in `.planning/REQUIREMENTS.md:47`).
- **One atomic commit per fix** — mirrors Phase 47 INT-FIX-LEDGER/CAL/LOCK pattern.

### Integration Points
- `invokeAnthropicSdkWithLedger` (`tests/e2e/lib/llm-driver.js`) — sole writer of `.llm-spend-ledger.json` for SDK transport. Guard added here cuts off the only leak vector that bypasses `E2E_LEDGER_PATH_OVERRIDE`.
- The ledger file is touched by both this function AND the daily snapshot workflow (`v40-cost-ledger-snapshot.yml`). Snapshot workflow runs in CI (so `process.env.CI` is set), so guard does not block it.
- The e2e-weekly-digest test's `PIN_NOW` factory connects to `aggregate()`, `renderDigest()`, and `isoWeekLabel()` — all consumers must continue to receive correctly-shaped dates after the refactor.

</code_context>

<specifics>
## Specific Ideas

- **PRE-02 error message text is locked verbatim** (see D-02 above). Phrasing reviewed and chosen explicitly.
- **PRE-03 anchor value is `'2026-05-25T00:00:00Z'`** — preserves the existing test's ISO-week-22 semantics (the test currently asserts `'2026-W22'` for that date). Changing the anchor later requires recomputing the expected week label.
- **Commit order is mandatory, not advisory** (see D-11). The planner must wire this into task ordering.

</specifics>

<deferred>
## Deferred Ideas

- **Unit test pinning the PRE-02 guard fires** — User chose not to add one in this phase to keep the commit surgical. If a third ledger leak occurs after PRE-02 lands, revisit and add the test.
- **Helper module `tests/e2e/lib/test-dates.js`** — Considered for the PRE-03 epoch-fixture refactor; rejected as overkill for a one-file change. If future e2e tests need similar calendar pinning, extract then.
- **Env-overridable test anchor (`process.env.TEST_PIN_NOW`)** — Considered for PRE-03; rejected to keep determinism and avoid env-interpretation surface. If a future operator needs to re-run the test against a different anchor, edit the const directly.

### Reviewed Todos (not folded)
None — no pending todos matched this phase's scope at planning entry (STATE.md "Pending Todos: None at v4.1 planning entry").

</deferred>

---

*Phase: 48-pre-push-regression-fixes*
*Context gathered: 2026-06-02*

# Phase 48: Pre-Push Regression Fixes - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-02
**Phase:** 48-pre-push-regression-fixes
**Areas discussed:** Guard contract (PRE-02), Epoch-relative shape (PRE-03), Plan & commit structure, Defense ordering

---

## Guard contract (PRE-02)

### Question 1: Should a Vitest regression test pin that the guard fires?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — pin it with a unit test | Defense-in-depth; catches a future refactor that removes the guard | |
| No — guard alone is enough | Surgical commit; Test 48 catches downstream pollution | ✓ |
| Yes — but as static-grep on guard source | Cheaper, less brittle, but only tests code shape | |

**User's choice:** No — guard alone is enough.
**Notes:** Keeps the PRE-02 commit minimal. The user weighed defense-in-depth against surgical scope and chose surgical.

### Question 2: Error shape when the guard fires?

| Option | Description | Selected |
|--------|-------------|----------|
| Plain Error with explicit fix message | `throw new Error('invokeAnthropicSdkWithLedger: forceApi:true blocked outside CI without E2E_LEDGER_PATH_OVERRIDE. Set E2E_LEDGER_PATH_OVERRIDE=<tmpfile> to redirect ledger writes, or run inside CI. Prevents committed-ledger pollution.')` | ✓ |
| Custom LedgerContractError class | New class extending Error; callers can catch distinctly | |
| Terse plain Error | Minimal message matching existing throw style | |

**User's choice:** Plain Error with explicit fix message.
**Notes:** Self-documenting; tells the next engineer exactly what to do; no new module/export surface.

---

## Epoch-relative shape (PRE-03)

### Question 1: How should the refactor structure PIN_NOW_ISO and its derivations?

| Option | Description | Selected |
|--------|-------------|----------|
| Top-of-file const + inline derivations | Single anchor; downstream values computed inline; single-file edit | ✓ |
| New helper module: tests/e2e/lib/test-dates.js | Reusable factory exporting helpers; bigger surface area | |
| Top-of-file const + env override hatch | `PIN_NOW_ISO = process.env.TEST_PIN_NOW \|\| '...'`; flexible but adds env-interpretation surface | |

**User's choice:** Top-of-file const + inline derivations.
**Notes:** Single-file edit; no new module; no env hatch. Matches Phase 48's "surgical" character.

### Question 2: How should individual fixture dates be derived from the anchor?

| Option | Description | Selected |
|--------|-------------|----------|
| Tiny in-file helper: daysAgo(n) | `daysAgo(3)` etc.; offset IS the semantics at call site | ✓ |
| Fully inline Date math, no helper | Repeated `new Date(Date.parse(PIN_NOW_ISO) - N * 86400000).toISOString()` at each site | |
| Pre-computed const block | Centralized `FIXTURES = { now, m3, m6, ... }` block | |

**User's choice:** Tiny in-file helper: daysAgo(n).
**Notes:** ~3 lines added; call sites self-document the semantics ("created 3 days before now").

---

## Plan & commit structure

### Question 1: How should this phase be structured as plans + commits?

| Option | Description | Selected |
|--------|-------------|----------|
| 1 plan, 4 atomic commits | Single 48-01-PLAN.md; 4 atomic `fix(48-pre-push): PRE-<N> — ...` commits | ✓ |
| 4 separate plans (one per PRE-*) | Heavier planning surface; isolates each fix | |
| 1 plan, 1 squash commit | Less granular bisect surface | |

**User's choice:** 1 plan, 4 atomic commits.
**Notes:** Mirrors Phase 47's INT-FIX commit convention. Surgical scope; full bisect granularity.

---

## Defense ordering

### Question 1: What commit order makes the audit trail clearest?

| Option | Description | Selected |
|--------|-------------|----------|
| Guard → Reset → Epoch → Lockfile | Defense first; PRE-01's diff is the only commit that touches the ledger unguarded | ✓ |
| Reset → Guard → Epoch → Lockfile | Symptom first, defense second; risk window between commits | |
| Independent first, coupled last | Lockfile → Epoch → Guard → Reset; drains simple fixes first | |

**User's choice:** Guard → Reset → Epoch → Lockfile.
**Notes:** Cleanest possible audit trail for a legal-filing tool. No risk window for re-leak between commits.

---

## Claude's Discretion

- Exact wording of each commit message body (1-2 sentences describing root cause + fix mechanism, mirroring Phase 47 INT-FIX commit-body shape).
- Whether `daysAgo` lives directly above or below `PIN_NOW_ISO` (purely stylistic).
- Whether to keep the existing `PIN_NOW = () => new Date('...')` factory (rewriting its body) or replace with `const PIN_NOW = new Date(PIN_NOW_ISO)` — depends on whether downstream call sites need a fresh Date instance.
- Whether PRE-04 requires any code change at all. If Phase 47's `tests/unit/package-lock-pinned.test.js` still passes and the lockfile pin holds, PRE-04 is verify-only (no code commit; status entry in plan SUMMARY).
- The precise day-offset numbers in `daysAgo(N)` calls — derive from current literal dates in `e2e-weekly-digest.test.js` relative to `2026-05-25T00:00:00Z` and verify each fixture's semantic role (in-window vs out-of-window vs cutoff-edge) is preserved.

## Deferred Ideas

- **Unit test pinning the PRE-02 guard fires** — Considered, deferred to "if leak recurs after PRE-02." Surgical scope wins for now.
- **Helper module `tests/e2e/lib/test-dates.js`** — Considered, rejected as overkill for a one-file change. Extract if future e2e tests need calendar pinning.
- **Env-overridable test anchor (`process.env.TEST_PIN_NOW`)** — Considered, rejected to keep determinism. Edit the const directly if re-anchoring is needed later.

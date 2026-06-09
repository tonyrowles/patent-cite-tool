# Phase 61: Carry-over Bundle — Diagnostic Mutator + Max-Turns + UAT Re-sweep - Context

**Gathered:** 2026-06-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Atomic-commit Wave-0 carry-over: ship the diagnostic-injection mutator extension (`tests/e2e/scripts/inject-defect.mjs:buildBody`), the `--max-turns 5 --tools Read,Glob,Grep --max-budget-usd 0.50` subscription-transport argv update (`tests/e2e/lib/llm-driver.js:94`), and the `BUDG-01` budget formalization (`.planning/STATE.md ## Budget`) in ONE atomic commit, then re-execute live UAT-47-a/b/SWEEP-03/04 on `origin/main` to capture PASS evidence with `errorClass + outcome + source + transport` ledger entries.

Partial states (one capability without the other two) recreate the v4.2 SWEEP-03 failure shape per PITFALLS Pitfall 1+2. Bundle is non-negotiable.

Requirements covered: DIAG-01, DIAG-02, DIAG-03, TURNS-01, TURNS-02, TURNS-03, BUDG-01, UAT-01, UAT-02.

</domain>

<decisions>
## Implementation Decisions

### Implementation Anchors

- **DIAG-01 selector reference target — CORRECTED from research**: the canonical Google-Patents selector vocabulary lives in `tests/e2e/lib/selection.js` (`'patent-result'`, `'section[itemprop="claims"]'`) and `tests/e2e/lib/navigation.js` (`'main, article, patent-result'`) — NOT in `google-patents-page.js` (that file does not exist in the codebase; research referenced a stale path). The DIAG-01 assertion target is `selection.js` + `navigation.js`. The mutator-emitted `GOOGLE_DOM_DRIFT` DOM snippet MUST contain at least one of: `'patent-result'`, `'section[itemprop="claims"]'`, `'main'`, `'article'` (verbatim string match).
- **DIAG-03 deterministic fixture pin location**: extend the existing `tests/unit/e2e-inject-defect.test.js` with new `toMatchInlineSnapshot` byte-identical pins for `GOOGLE_DOM_DRIFT` and `WRONG_CITATION` errorClasses. Same-seed + same-errorClass → byte-identical body. Vitest fixture lives next to existing pin pattern (no new test file).
- **TURNS-03 cost-bound regression test approach**: fixture-based — pin (a) the argv shape via `invokeClaudeP` mocked spawn, (b) a recorded `ledger.jsonl` fixture covering 5 smoke-issue entries, (c) `meanPerCall < 0.30` assertion against the fixture. No live API calls in CI. Defense against future drift: if `claude` CLI rejects an argv element at runtime, the existing live `--max-turns 5` evidence run during UAT-01/UAT-02 would catch it before merge.
- **TURNS-01 `--max-budget-usd 0.50` flag inclusion**: include defensively. Vitest pin asserts presence in argv. Research convergence treats it as load-bearing defense-in-depth on top of per-issue/per-PR/monthly caps. Risk: if the claude CLI rejects an unknown flag, the SWEEP-03/04 live runs will surface it pre-commit (UAT-01/UAT-02 are evidence gates).

### MUTATOR-04 Co-Design Invariants (Phase 59 carry-over — LOAD-BEARING)

- `SOURCE_TAG` literal `'fixture-mutator-uat-47b'` at `inject-defect.mjs:75` MUST NOT change. `quarantine-append.mjs:239` regex `&& !isFixtureMutator` co-depends on this exact literal. Any edit here cascades through Phase 59 production-path suppression invariant.
- `ERROR_CLASSES` Set at `inject-defect.mjs:64` is the additive-only allowlist. Add new entries via spread, never mutate in place.
- `<!-- fp: <12-hex> -->` v2 marker on line 1 of `buildBody` output preserved.

### Argv Update — `llm-driver.js:94` (Subscription Transport ONLY)

- BEFORE: `['-p', '--output-format', 'json', '--max-turns', '1', '--system-prompt', systemPrompt, userPrompt]`
- AFTER: `['-p', '--output-format', 'json', '--max-turns', '5', '--tools', 'Read,Glob,Grep', '--max-budget-usd', '0.50', '--system-prompt', systemPrompt, userPrompt]`
- SDK transport (`invokeAnthropicSdkWithLedger` / `messages.create`) is single-turn by API design — NO change. Inline comment at the subscription site documents the asymmetry.
- Tool palette restriction is via `--tools` (RESTRICTS palette), NOT `--allowedTools` (grants permission only). TURNS-02 Vitest pin asserts argv contains `'--tools', 'Read,Glob,Grep'` AND excludes literal strings `'Edit'`, `'Bash'`, `'Write'`, `'WebFetch'`, `'--allowed-tools'`, `'--allowedTools'`.

### Atomic Commit Strategy (Partial-state Pitfall 1+2 mitigation)

ONE commit ships all three capabilities + budget section + tests:
1. `tests/e2e/scripts/inject-defect.mjs:buildBody` extension (DIAG-01, DIAG-02)
2. `tests/e2e/lib/llm-driver.js:94` argv update (TURNS-01)
3. `tests/unit/e2e-inject-defect.test.js` — deterministic-body pins (DIAG-03)
4. `tests/unit/llm-driver-argv.test.js` (new file if not present) — TURNS-02 tool-allow-list + exclusion pin
5. `tests/unit/llm-driver-cost-bound.test.js` (new file if not present) — TURNS-03 mean-per-call regression with fixture ledger
6. `.planning/STATE.md ## Budget` section live (BUDG-01)

NO partial-merge of any subset. If a Vitest fixture fails, fix in the same commit before push.

### Live UAT Evidence Capture (UAT-01, UAT-02)

- AFTER the atomic commit lands on `origin/main`:
  - Run mutator to inject a synthetic `GOOGLE_DOM_DRIFT` issue → auto-fix loop → verifier-gate PASS → merge → promote → `outcome: 'pass'` ledger entry written with `errorClass: 'GOOGLE_DOM_DRIFT'` + `source: 'auto-fix-promoted'` + `transport: 'sdk' | 'subscription'`. This is SWEEP-03 / UAT-47-a evidence.
  - Run fixture-mutator full loop → verify `isFixtureMutator` filter at `quarantine-append.mjs:239` prevents synthetic from contaminating quarantine corpus. This is SWEEP-04 / UAT-47-b evidence.
  - Capture both PASS-evidence rows into `.planning/sweep-03-04-pass-evidence.yaml` (the Phase 68 precondition sentinel — created here, consumed at Phase 68 close).

### Budget Section Content (BUDG-01)

`.planning/STATE.md ## Budget` section content (already drafted in STATE.md as of 2026-06-09; verify present and accurate):

| Cap | Value | Source |
|-----|-------|--------|
| Milestone soft cap | $15 | BUDG-01 |
| Milestone hard ceiling | $30 | PITFALLS Pitfall 9 |
| Per-phase | < $5 | BUDG-01 distribution |
| Mean per-call | < $0.30 | TURNS-03 |
| Per-issue cap (existing) | $1 | Phase 39 LEDGER-02 |
| Per-PR cap (existing) | $2 | Phase 39 LEDGER-02 |

Each VERIFICATION.md footer probes its phase's spend against the relevant cap.

### Trust-Invariant Non-Mutations (verify after every commit in this phase)

- `assertTripleGate` body sha256 byte-equivalent to Phase 53 baseline.
- `appendLedgerEntry` body byte-unchanged (Phase 56 additive-only invariant).
- ESLint `no-restricted-imports` `@anthropic-ai/sdk` single-entry-point preserved.
- Phase 60.1 subscription-transport whitelist preserved.
- `grep -c 'git push origin main' .github/workflows/v40-auto-fix.yml` == 1 (Phase 57 scope-lock).
- `tests/e2e/scripts/inject-defect.mjs:75` SOURCE_TAG literal byte-unchanged (MUTATOR-04 co-design).
- `quarantine-append.mjs:239` `&& !isFixtureMutator` filter byte-unchanged.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets

- `tests/e2e/scripts/inject-defect.mjs` (489 LOC) — has `buildBody` at line 277, `ERROR_CLASSES` Set at line 64, `SOURCE_TAG` literal at line 75. Extension point: per-errorClass diagnostic body switch inside `buildBody`.
- `tests/e2e/lib/llm-driver.js:94` — `invokeClaudeP` subscription-transport spawn site. Argv array literal at lines 91-97.
- `tests/e2e/lib/issue-payload-builder.js` — Phase 35 Verifier Disagreement block shape (DIAG-02 template parity source).
- `tests/e2e/lib/selection.js` + `navigation.js` — canonical Google-Patents selector vocabulary (DIAG-01 verbatim-match target).
- `tests/unit/e2e-inject-defect.test.js` — existing deterministic-fixture pattern (DIAG-03 extension point).
- `.planning/STATE.md ## Budget` — already populated as of 2026-06-09 (BUDG-01 baseline check).

### Established Patterns

- Vitest fileParallelism is OFF (`vitest.config.js`) — lint-guard tests serialize. New tests inherit this.
- Test files live at `tests/unit/*.test.js`; setup at `tests/setup/chrome-stub.js`.
- Mutator output uses v2 marker `<!-- fp: <12-hex> -->` on line 1 (do not move).
- argv arrays are spawned via `child_process.spawn('claude', args, ...)` with `ANTHROPIC_API_KEY: ''` blanked.

### Integration Points

- The atomic commit lands at `origin/main` directly (existing direct-to-main pattern for ledger commits in `v40-auto-fix.yml` is unrelated; this phase's commit goes through normal review).
- Live SWEEP-03/04 evidence is captured by triggering auto-fix on a mutator-injected issue post-merge; uses existing CI surface (`v40-auto-fix.yml`).
- `.planning/sweep-03-04-pass-evidence.yaml` created at end of this phase becomes Phase 68 precondition sentinel.

</code_context>

<specifics>
## Specific Ideas

- Mutator GOOGLE_DOM_DRIFT body MUST contain at least one verbatim selector from `selection.js`/`navigation.js` (recommended set: `patent-result`, `section[itemprop="claims"]`, `main`, `article`). Vitest assertion: `expect(body).toMatch(/(?:patent-result|section\[itemprop="claims"\]|main|article)/)`.
- Mutator WRONG_CITATION Verifier Disagreement block MUST mirror the Phase 35 shape from `issue-payload-builder.js` (`### Verifier Disagreement` heading + expected/actual fences).
- TURNS-03 ledger fixture: 5 entries representing 5 distinct smoke-issue runs, with `usd` field set such that mean is between $0.20 and $0.29 — well below $0.30 threshold but realistic.
- The `--max-budget-usd` flag is included despite uncertain CLI support; the UAT-01/UAT-02 live runs will fail loudly if the flag is rejected, which is acceptable evidence-gate behavior.

</specifics>

<deferred>
## Deferred Ideas

- Consolidating Google-Patents selectors into a single `google-patents-page.js` module (mentioned in research as a stale file reference) — deferred; researcher's reference doesn't match disk, and creating a new consolidator file is out of scope for this atomic carry-over bundle. Track as v4.4 refactor candidate.
- `--max-budget-usd` argv flag verification via `claude --help` runtime probe (rather than defensive inclusion) — deferred; the live UAT-01/UAT-02 runs serve as the runtime probe.

</deferred>

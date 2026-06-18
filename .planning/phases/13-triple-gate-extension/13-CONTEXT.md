# Phase 13: Triple-Gate Extension - Context

**Gathered:** 2026-06-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Extend the post-merge auto-promote trust gate so that a **merged v6.1 report-fix PR**
(sourced from a `report-fix-candidate` Issue) can drive the existing
merge → quarantine → golden-corpus promote cycle — **without regressing** the legacy
`triage`-sourced path and **without eroding** the `_skipCiGuard:true` trust invariant.

Concretely, this phase delivers requirement **GATE-05** via three coordinated edits:

1. **`assertTripleGate` Leg 3** (`scripts/auto-fix-promote.mjs:115`) widened from
   `sourceIssueLabels.includes('triage')` to a flat OR that also accepts
   `report-fix-candidate`.
2. **The byte-unchanged body pin** (`tests/unit/auto-fix-promote-gate.test.js:512`,
   PROMOTE-04 — what ROADMAP/REQUIREMENTS loosely call the "sha256 pin") updated in the
   **same commit** as the gate body, so the gate is never unenforced (success criterion #2).
3. **Source-issue resolvability** — the Phase-12 `v61-report-fix.yml` PR body is amended to
   emit the `<!-- source_issue: N -->` marker that `parseSourceIssue` requires (see D-04).

**Locked upstream (not re-litigated — see `12-CONTEXT.md`):**
- Human merge gate is a permanent invariant; no `auto-merge` flag anywhere (GATE-04).
- `_skipCiGuard:true` appears exactly once in `auto-fix-promote.mjs`; trust-boundary pins
  (PROMOTE-04 body pin, `auto-fix:partial-verified` rejection, `_skipCiGuard` grep-count)
  are sacred and must stay green.
- Report-fix PRs land on `auto-fix/<fp-short>` carrying `auto-fix:verified` (Phase 12).
- `report-fix-candidate` is a vetted signal — Phase 11 applies it only on auto-promote
  signals (green tier / dup≥3 / quarantine corpus hit).

**Not in scope (later / never):**
- Re-enabling the `pull_request:closed` auto-trigger (explicitly NOT done — see D-01).
- Weekly-digest `BUG_REPORTS` section + live end-to-end pipeline UAT (Phase 14).
- Any change to `runPromote` / `promote-from-quarantine.mjs` internals (DO NOT MODIFY).

</domain>

<decisions>
## Implementation Decisions

### Promote trigger mode (GATE-05, success criterion #1)
- **D-01:** **Keep `v40-auto-promote.yml` `workflow_dispatch`-only — do NOT restore the
  `pull_request:closed` trigger.** "Fires after merge" is satisfied by the operator
  dispatching `gh workflow run v40-auto-promote.yml -f pr_number=<N> -f merged=true`
  after merging the report-fix PR. This matches the v6.1 milestone's locked posture
  (`workflow_dispatch` only, no cron / no auto-firing) and keeps Phase 13 a code+pin+
  PR-body change with the workflow's trigger YAML untouched. Phase 14 UAT exercises the
  full chain via dispatch. **Rationale:** re-introducing auto-fire is the exact automation
  the milestone deliberately paused; not worth the new guard surface for this phase.

### Leg 3 acceptance semantics (GATE-05, success criterion #3)
- **D-02:** **Flat OR — Leg 3 passes if `sourceIssueLabels` includes `'triage'` OR
  `'report-fix-candidate'`.** No source-aware branching, no extra trust check. The new
  label already encodes equivalent vetting (Phase 11 only applies it on green-tier /
  dup≥3 / quarantine signals), so it carries the same trust as `triage`. The legacy
  `triage` path is preserved bit-for-bit (the OR only *adds* an accepted label).

### Gate failure mode (trust invariant)
- **D-03:** **Hard-fail, no promote — preserve the existing behavior.** When the source
  issue cannot be resolved (missing marker, deleted issue) or its labels can't be fetched,
  the gate throws `TRIPLE_GATE_FAILED` and no promotion occurs. The golden corpus is never
  mutated on an unverifiable signal; the operator investigates and re-dispatches. Do NOT
  add a graceful-skip/log-only path — "fail loud" is the gate's contract.

### Source-issue resolution gap (GATE-05, success criterion #1)
- **D-04:** **Emit the `<!-- source_issue: N -->` comment marker from the report-fix PR
  body — reuse `parseSourceIssue` unchanged.** Today the Phase-12 `v61-report-fix.yml` PR
  body has `**Source Issue:** #N` (human prose only) and a commit message with no `Fix #N`,
  so `parseSourceIssue` (`scripts/auto-fix-promote.mjs:270`) would **throw** for a v6.1 PR.
  Fix it by adding `<!-- source_issue: ${{ github.event.issue.number }} -->` to the
  `create-pull-request` `body:` block in `v61-report-fix.yml` (the existing
  `**Source Issue:** #N` prose line stays for human readability). This hits the **already-
  tested PREFERRED parse path** — **no change to the trust-critical `auto-fix-promote.mjs`
  parser, no new parse pin.** Cover the new marker with a YAML-contract assertion alongside
  the existing `v40-auto-promote-yaml` / `v61-report-fix-yaml` test style.

### Issue-close + dedup interaction (no new work, intentional interlock)
- **D-05:** **Inherit the existing close behavior — auto-promote closes the
  `report-fix-candidate` issue exactly as it closes `triage` issues** (`gh issue close`
  at `v40-auto-promote.yml:439`, gated on cpr@v8 actually opening the follow-up PR). This
  close IS the signal Phase 11 post-fix suppression keys off (`gh-client.mjs:157-196` —
  "a closed `report-fix-candidate` Issue whose `closedAt` is within `POST_FIX_SUPPRESS_DAYS`").
  The two systems already interlock by design; Phase 13 adds nothing here and must not
  special-case the close timing (closing only-after-follow-up-merge or label-instead-of-close
  would break the suppression window).

### Claude's Discretion
- Exact YAML-test file/home for the new `<!-- source_issue -->` marker assertion (extend
  `tests/unit/v61-report-fix-yaml.test.js` assumed) and the precise wording of the marker
  line, provided `parseSourceIssue`'s `/<!--\s*source_issue:\s*(\d+)\s*-->/` regex matches it.
- Whether the PROMOTE-04 pin's `slice(startIdx, startIdx + 15)` line-count constant changes:
  extending Leg 3 from one `if` to an OR will likely keep the body at the same line count if
  done as `!(includes('triage') || includes('report-fix-candidate'))`, but if the comment or
  error string grows the body, the slice count AND `EXPECTED_BODY` array must update together.
- Commit decomposition, as long as the gate-body edit and its PROMOTE-04 pin update land in
  the **same commit** (success criterion #2 — no window where the gate is unenforced).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` — **GATE-05** (the sole requirement); GATE-01..04 context.
- `.planning/ROADMAP.md` §"Phase 13: Triple-Gate Extension" — goal + 3 success criteria +
  the milestone "Key locked decisions" block.
- `.planning/phases/12-fix-generation-regression-gate/12-CONTEXT.md` — upstream locked
  decisions (D-01..D-07: dispatcher, label vocab, draft-PR shape) the report-fix path rests on.

### The trust gate (trust-critical — handle with care)
- `scripts/auto-fix-promote.mjs:115` — `assertTripleGate` (Leg 3 is the edit site).
- `scripts/auto-fix-promote.mjs:270` — `parseSourceIssue` (PREFERRED `<!-- source_issue -->`
  marker + `Fix #N` fallback; **do not modify** — D-04 feeds it instead).
- `tests/unit/auto-fix-promote-gate.test.js:512` — **PROMOTE-04 body byte-unchanged pin**
  (the "sha256 pin"; verbatim `EXPECTED_BODY` string + `slice(startIdx, startIdx+15)`).
- `tests/unit/auto-fix-promote-gate.test.js` (T1..T5, trust-boundary cases) — extend with a
  `report-fix-candidate`-accepts case and keep the `triage`-still-passes + `auto-fix:partial-
  verified`-rejects cases green.

### The wiring (workflows)
- `.github/workflows/v40-auto-promote.yml` — trigger block (workflow_dispatch-only,
  PAUSED `pull_request:closed`; D-01 keeps it that way), source-issue close at `:439`.
- `.github/workflows/v61-report-fix.yml:293` — `create-pull-request` `body:` block (D-04
  edit site: add the `<!-- source_issue -->` marker).
- `scripts/report-fix.mjs` — the v6.1 dispatcher (passes `issueNumber`; PR body is built in
  the workflow, not here).

### Dedup interlock
- `scripts/gh-client.mjs:157-196` — post-fix suppression (`isPatentSuppressed` keys off a
  closed `report-fix-candidate` issue's `closedAt`); D-05 relies on this.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `parseSourceIssue` (`auto-fix-promote.mjs:270`) — its PREFERRED `<!-- source_issue: N -->`
  regex path is reused **as-is** by D-04; no new parser code.
- The existing YAML-contract test pattern (`tests/unit/v61-report-fix-yaml.test.js`,
  `tests/e2e/scripts/v40-auto-promote-yaml.test.js`) — template for the new marker assertion.
- The PROMOTE-04 pin uses a dynamic `findIndex('export function assertTripleGate')` +
  `slice(startIdx, startIdx+15)`, so the pin survives line-position drift but NOT body-length
  drift — extending Leg 3 must keep the slice count and `EXPECTED_BODY` consistent.

### Established Patterns
- **Atomic body+pin commit** (success criterion #2): every prior gate-body change shipped its
  PROMOTE-04 pin update in the same commit; follow that.
- **Flat OR widening, never narrowing** Leg 3 — the `triage` clause is preserved so the
  legacy path cannot regress.
- **Trust-boundary pins are additive guards** — the `auto-fix:partial-verified` rejection
  (T5) and `_skipCiGuard:true` grep-count==1 must stay green after the edit.

### Integration Points
- v61-report-fix PR body  → `<!-- source_issue -->`  → `parseSourceIssue` → Leg 3 OR.
- Successful promote → `gh issue close` source issue → `gh-client.mjs` post-fix suppression
  (closes the same-patent re-triage loop for `POST_FIX_SUPPRESS_DAYS`).

</code_context>

<specifics>
## Specific Ideas

- The ROADMAP/REQUIREMENTS phrase "Vitest sha256 pin" is a **misnomer** for the PROMOTE-04
  **verbatim-string body pin** (`EXPECTED_BODY` compare) — there is no literal `createHash`
  on the gate body. Researcher/planner should not hunt for a nonexistent hash; the artifact
  to update is the `EXPECTED_BODY` array at `auto-fix-promote-gate.test.js:512`.
- "Fires after merge" (success criterion #1) is satisfied by **operator dispatch**, not an
  automatic trigger (D-01). Plan/verify accordingly; Phase 14 runs the live dispatch UAT.

</specifics>

<deferred>
## Deferred Ideas

- Re-enabling `pull_request:closed` auto-fire for auto-promote (label-guarded or otherwise) —
  intentionally out of scope per D-01; would be its own decision in a future automation phase.

None of the above are folded into Phase 13.

</deferred>

---

*Phase: 13-triple-gate-extension*
*Context gathered: 2026-06-17*

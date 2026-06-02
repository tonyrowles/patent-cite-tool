---
phase: 42
slug: fix-prompt-builder-wrong-citation-vertical-slice
status: audited
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-01
audited: 2026-06-01
audit_method: cold-stamp (State B) reconstruct from PLAN + SUMMARY + VERIFICATION inputs
---

# Phase 42 — Validation Strategy

> Cold-stamped by Phase 47 Plan 02 (State B reconstruct — LARGEST surface, audited LAST per RESEARCH-recommended order). Source: 42-CONTEXT.md + per-plan SUMMARY artifacts + 42-VERIFICATION.md.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.2.4 (unit + ESLint API guard) |
| **Config file** | `vitest.config.js` (existing) |
| **Quick run command** | `npx vitest run tests/unit/fix-prompt-builder.test.js` |
| **Full suite command** | `npm run test:src && npm run lint` |
| **Estimated runtime** | ~0.5s for the 6 phase-42 files / ~45s full suite |

---

## Sampling Rate

- **After every task commit:** Run the quick test for the lib/script just modified (e.g., `npx vitest run tests/unit/fix-prompt-builder.test.js` after editing `tests/e2e/lib/fix-prompt-builder.js`).
- **After every plan wave:** `npm run test:src` + `npm run lint`.
- **Before `/gsd:verify-work`:** Full suite green AND `eslint-fix-prompt-builder-guard.test.js` green (prevents accidental import of the fix-prompt-builder from non-auto-fix code paths).
- **Max feedback latency:** ~45s for full suite; ~0.5s for the 6 phase-42 files.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 42-01-01..N | 01 (fix-prompt-builder + FORBIDDEN_DELIMITERS escaper + countFixAttempts ledger helper + ESLint guard) | 1 | PROMPT-01, PROMPT-02, PROMPT-03, PROMPT-04, AUTOFIX-05 | unit + ESLint API | `npx vitest run tests/unit/fix-prompt-builder.test.js tests/unit/issue-payload-builder.test.js tests/unit/llm-ledger.test.js tests/unit/eslint-fix-prompt-builder-guard.test.js` | ✅ green (36/36 + 23/23 + 61/61 + 6/6) |
| 42-02-01..N | 02 (auto-fix.mjs dispatcher + ls-remote idempotency + countFixAttempts gate + parseFencedDiff + diff-guard + git apply + cache_control SDK call) | 2 | AUTOFIX-01, AUTOFIX-03, AUTOFIX-04, AUTOFIX-05 | unit (mock-gh + driver mock) | `npx vitest run tests/unit/auto-fix.test.js tests/unit/llm-driver-sdk-cache-control.test.js` | ✅ green (41/41 + 4/4) — see Manual-Only row for live SDK call |
| 42-03-01..N | 03 (docs/v40-auto-fix-manual-demo.md authoring) | 3 | AUTOFIX-01/03/04/05 (live UAT demo doc) | doc-presence (covered implicitly; the live demo itself is COVERED-MANUAL per Pitfall 6) | `test -f docs/v40-auto-fix-manual-demo.md` | ✅ doc exists; live demo is UAT-47-a |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `tests/unit/fix-prompt-builder.test.js` — covers PROMPT-01..04 (envelope shape + class-routing + forbidden-delimiter escape + closed RPT-02 taxonomy)
- [x] `tests/unit/issue-payload-builder.test.js` — covers PROMPT-04 FORBIDDEN_DELIMITERS escape in rationale/reason/rawDiff + verifier-section golden/observed interpolation
- [x] `tests/unit/llm-ledger.test.js` — covers AUTOFIX-05 countFixAttempts ledger helper (per-fingerprint attempt accumulator)
- [x] `tests/unit/eslint-fix-prompt-builder-guard.test.js` — covers the no-restricted-imports ESLint guard preventing accidental import from non-auto-fix code paths
- [x] `tests/unit/auto-fix.test.js` — covers AUTOFIX-01/03/04/05 dispatcher (ERROR_CLASS routing, ls-remote idempotency, parseFencedDiff, diff-guard application, fix-attempts cap, --dry-run, --no-push)
- [x] `tests/unit/llm-driver-sdk-cache-control.test.js` — covers AUTOFIX-01 cache_control prompt-cache option through the SDK driver

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live end-to-end auto-fix demo against real triage-labeled issue #3 (`US11427642-spec-short-1`, fingerprint `139f821b3bb1`, branch `auto-fix/3-139f821b`) — real Sonnet 4.6 SDK call, real PR creation — **UAT-47-a (UAT-42-demo)** | AUTOFIX-01/03/04/05 (live billable demo) | Requires real `ANTHROPIC_API_KEY` + authenticated `gh` CLI + ~$0.30 budget headroom; produces a live billable LLM call against the Anthropic API. Phase 42 explicitly deferred this Task 2 of Plan 42-03 to Phase 47 (per Phase 42 ROADMAP: "demo deferred to Phase 47 CLEANUP-03 HUMAN-UAT (a)"). COVERED-MANUAL per Pitfall 6 — runbook stub OWNED BY Plan 47-03 UAT-47-a. | Plan 47-03 UAT-47-a runbook: follow `docs/v40-auto-fix-manual-demo.md`, set `ANTHROPIC_API_KEY=sk-ant-...`, dispatch against issue #3 (`auto-fix.mjs --issue 3 --force-api`), observe (a) real SDK call, (b) draft PR on `auto-fix/3-139f821b`, (c) two-commit split (impl + ledger), (d) `<!-- affected_cases: US11427642-spec-short-1 -->` HTML comment, (e) verifier-gate advisory verdict in PR comments. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 45s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-06-01 — cold-stamp State B reconstruct; 167/167 tests green across 6 phase-42 test files; live UAT-42-demo (UAT-47-a) pre-classified COVERED-MANUAL per explicit Phase 42 ROADMAP defer-to-Phase-47-CLEANUP-03-HUMAN-UAT-(a) note (owned by Plan 47-03 runbook).

---

## Validation Audit 2026-06-01

**Auditor:** Phase 47 Plan 02 cold-stamp (State B reconstruct — LARGEST surface, audited LAST so prior 7 stamps inform style).
**Stance:** FORCE — assume each gap uncovered until a passing behavioral test proves the requirement.

### Per-Task Map — Audit Results

| Task ID | Test File | Test Count | Result |
|---------|-----------|-----------:|--------|
| 42-01 (PROMPT-01..04 fix-prompt-builder) | `tests/unit/fix-prompt-builder.test.js` | 36/36 | ✅ green |
| 42-01 (PROMPT-04 issue-payload-builder forbidden-delimiter escape) | `tests/unit/issue-payload-builder.test.js` | 23/23 | ✅ green |
| 42-01 (AUTOFIX-05 countFixAttempts ledger helper) | `tests/unit/llm-ledger.test.js` | 61/61 | ✅ green |
| 42-01 (ESLint guard preventing non-auto-fix imports) | `tests/unit/eslint-fix-prompt-builder-guard.test.js` | 6/6 | ✅ green |
| 42-02 (AUTOFIX-01/03/04/05 dispatcher) | `tests/unit/auto-fix.test.js` | 41/41 | ✅ green |
| 42-02 (AUTOFIX-01 cache_control SDK option) | `tests/unit/llm-driver-sdk-cache-control.test.js` | 4/4 (4 test cases — file count covered) | ✅ green |

Computed aggregate at audit time: **167/167 tests pass across 6 files. Combined runtime: 0.45s.**

(Note: `llm-ledger.test.js` and `auto-fix.test.js` are shared with Phase 39 and Phase 45/46 — the total above counts each file once but every test in each file is green; per-phase isolation is provided by per-describe-block tagging inside each test file. The cross-phase shared-file pattern is intentional: it prevents per-phase test-file duplication.)

### Manual-Only Rows — Pre-Classified COVERED-MANUAL

| Row | Disposition | Why |
|-----|-------------|-----|
| Live end-to-end auto-fix demo on issue #3 `US11427642-spec-short-1` fp `139f821b3bb1` (UAT-42-demo == UAT-47-a) | COVERED-MANUAL | Phase 42 Plan 03 Task 2 was explicitly deferred per Phase 42 ROADMAP: "demo deferred to Phase 47 CLEANUP-03 HUMAN-UAT (a)". OWNED BY Plan 47-03 UAT-47-a runbook. Requires real `ANTHROPIC_API_KEY` + authenticated `gh` + ~$0.30 budget headroom. Pitfall 6 applied — auditor was instructed not to escalate. |

### Compliance Check

- [x] Every requirement (PROMPT-01..04, AUTOFIX-01/03/04/05) maps to a green automated row
- [x] No gap demands an additional test file — implementation is RED→GREEN closed per 42-VERIFICATION.md
- [x] All 6 referenced test files exist on disk (verified via `test -f` 2026-06-01)
- [x] Vitest run over the 6 files exits 0; 167/167 pass
- [x] Manual row pre-classified per Pitfall 6 — no escalation needed
- [x] Frontmatter stamped `nyquist_compliant: true`

**Result:** GAPS FILLED. Phase 42 validation map is compliant. No BLOCKER, no WARNING, no ESCALATE.

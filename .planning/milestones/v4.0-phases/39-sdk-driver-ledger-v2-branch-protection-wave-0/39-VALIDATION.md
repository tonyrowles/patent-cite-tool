---
phase: 39
slug: sdk-driver-ledger-v2-branch-protection-wave-0
status: audited
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-01
audited: 2026-06-01
audit_method: cold-stamp (State B) reconstruct from PLAN + SUMMARY + VERIFICATION inputs
---

# Phase 39 — Validation Strategy

> Cold-stamped by Phase 47 Plan 02 (State B reconstruct). Source: 39-RESEARCH.md + 39-CONTEXT.md + per-plan SUMMARY artifacts.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.2.4 (unit + integration) |
| **Config file** | `vitest.config.js` (existing) |
| **Quick run command** | `npx vitest run tests/unit/llm-ledger.test.js` |
| **Full suite command** | `npm run test:src && npm run lint` |
| **Estimated runtime** | ~0.5s quick (4 phase-39 files) / ~45s full suite |

---

## Sampling Rate

- **After every task commit:** Run the quick test for the file just modified (e.g., `npx vitest run tests/unit/llm-ledger.test.js` after touching `llm-ledger.js`).
- **After every plan wave:** `npm run test:src` + `npm run lint`.
- **Before `/gsd:verify-work`:** Full suite green AND ESLint guard programmatic test green (catches SDK-import-from-prod-code drift).
- **Max feedback latency:** ~45s for full suite; ~0.5s for the 4 phase-39 files.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 39-01-01..N | 01 (ledger v2 helpers + claude-sonnet-4-6 pricing) | 1 | LEDGER-01, LEDGER-02, LEDGER-03 | unit | `npx vitest run tests/unit/llm-ledger.test.js` | ✅ green (61/61) |
| 39-02-01..N | 02 (CODEOWNERS + docs/v40-repo-config.md) | 1 | CLEANUP-04 (wave-0) | unit (static-grep) | `npx vitest run tests/unit/codeowners.test.js` | ✅ green (7/7) |
| 39-03-01..N | 03 (invokeAnthropicSdkWithLedger sibling + ESLint guard + SDK pin) | 2 | LEDGER-03, CLEANUP-04 | unit (vi.mock + static-grep + ESLint API) | `npx vitest run tests/unit/llm-driver.test.js tests/unit/eslint-sdk-guard.test.js` | ✅ green (44/44 + 5/5) |
| 39-04-01..N | 04 (committed ledger bootstrap + .gitignore flip) | 3 | LEDGER-04, CLEANUP-04 | integration (real on-disk artifacts) | `npx vitest run tests/unit/llm-ledger.test.js` (Test 48 + Test 49) | ✅ green (covered in the 61/61 above) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `tests/unit/llm-ledger.test.js` — covers LEDGER-01..04 (61 cases: sub-cap helpers, combinedMonthlyTotal, committed-ledger schema guard, .gitignore-flip guard)
- [x] `tests/unit/codeowners.test.js` — covers CLEANUP-04 wave-0 (7 cases: 5 locked paths + @tonyrowles owner + last-match-wins order)
- [x] `tests/unit/llm-driver.test.js` — covers LEDGER-03 SDK transport (44 cases incl. INVERSE CI gate behaviour + 4-cap precheck)
- [x] `tests/unit/eslint-sdk-guard.test.js` — covers ESLint no-restricted-imports guard (5 cases: static-grep + programmatic ESLint API)

*All Wave 0 test files exist on disk and execute green at audit time.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live `gh api repos/{o}/{r}` — `Allow auto-merge: OFF`, branch-protection ruleset on `main` with `Do not allow bypassing: ON`, required-status-check slot reserved | CLEANUP-04 (live audit) | One-shot live-state audit against the GitHub repo settings UI; not falsifiable from local files alone — **OWNED BY Plan 47-04** (CLEANUP-04 live re-audit). Phase 39 wave-0 ships the docs/v40-repo-config.md checklist and the CODEOWNERS static-grep; the live-state confirmation is deferred per Phase 39 Plan 04 user-setup notes. | Run by Plan 47-04: `gh api repos/{owner}/{repo} --jq '.allow_auto_merge'` (expect `false`); `gh api repos/{owner}/{repo}/rulesets` (expect ruleset on main with bypass empty + required-status-checks slot for verifier-gate + deps-update-gate). |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 45s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-06-01 — cold-stamp State B reconstruct; 117/117 tests green across 4 phase-39 test files (`tests/unit/llm-{ledger,driver}.test.js`, `tests/unit/codeowners.test.js`, `tests/unit/eslint-sdk-guard.test.js`); CLEANUP-04 live-audit row pre-classified COVERED-MANUAL (owned by Plan 47-04).

---

## Validation Audit 2026-06-01

**Auditor:** Phase 47 Plan 02 cold-stamp (State B reconstruct from PLAN + SUMMARY + VERIFICATION inputs; per Phase 38 Plan 02 precedent).
**Stance:** FORCE — assume each gap uncovered until a passing behavioral test proves the requirement.

### Per-Task Map — Audit Results

| Task ID | Test File | Test Count | Result |
|---------|-----------|-----------:|--------|
| 39-01 (LEDGER-01..03 ledger v2 helpers) | `tests/unit/llm-ledger.test.js` | 61/61 | ✅ green |
| 39-02 (CLEANUP-04 wave-0 CODEOWNERS) | `tests/unit/codeowners.test.js` | 7/7 | ✅ green |
| 39-03 (LEDGER-03 SDK sibling) | `tests/unit/llm-driver.test.js` | 44/44 | ✅ green |
| 39-03 (LEDGER-03 ESLint guard) | `tests/unit/eslint-sdk-guard.test.js` | 5/5 | ✅ green |
| 39-04 (LEDGER-04 committed-ledger + .gitignore flip) | `tests/unit/llm-ledger.test.js` (Test 48 + Test 49) | included in 61/61 | ✅ green |

**Total:** 117/117 tests pass across 4 files. Combined runtime: 0.44s (well under 45s feedback budget).

### Manual-Only Rows — Pre-Classified COVERED-MANUAL

| Row | Disposition | Why |
|-----|-------------|-----|
| Live `gh api` audit of `allow_auto_merge`, ruleset on `main`, required-status-checks (CLEANUP-04 live audit) | COVERED-MANUAL | Owned by Plan 47-04 per Phase 47 CONTEXT decision-D-04 — the live-state re-audit. Phase 39 wave-0 ships the docs/v40-repo-config.md checklist + the CODEOWNERS static-grep; the live-state confirmation lives in Plan 47-04. Pitfall 6 applies — auditor was instructed not to escalate this row. |

### Compliance Check

- [x] Every requirement (LEDGER-01..04 + CLEANUP-04 wave-0) maps to a green automated row
- [x] No gap demands an additional test file — implementation is RED→GREEN closed per 39-VERIFICATION.md
- [x] All 4 referenced test files exist on disk (verified via `test -f` 2026-06-01)
- [x] Vitest run over the 4 files exits 0; 117/117 pass
- [x] Manual row pre-classified per Pitfall 6 — no escalation needed
- [x] Frontmatter stamped `nyquist_compliant: true`

**Result:** GAPS FILLED. Phase 39 validation map is compliant. No BLOCKER, no WARNING, no ESCALATE.

---
gsd_state_version: 1.0
milestone: v3.1
milestone_name: LLM-Driven Product Improvement Loop
status: planning
last_updated: "2026-05-22T00:00:00.000Z"
last_activity: 2026-05-22
progress:
  total_phases: 6
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-22)

**Core value:** Highlight text on Google Patents, get an accurate citation reference instantly — no PDF downloading, no manual counting.
**Current focus:** Phase 32 — HUMAN-UAT Verification (not started)

## Current Position

Phase: 32 — HUMAN-UAT Verification
Plan: —
Status: Phase 32 not started
Last activity: 2026-05-22 — v3.1 roadmap created (Phases 32-37, 29 requirements mapped)

Progress: ░░░░░░░░░░ 0% (0/6 phases complete)

## Performance Metrics

**By Milestone:**

| Milestone | Phases | Plans | Duration |
|-----------|--------|-------|----------|
| v1.0 MVP | 4 | 8 | ~3 days |
| v1.1 Silent Mode + Infrastructure | 3 | 8 | 1 day |
| v1.2 Store Polish + Accuracy Hardening | 6 | 12 | 2 days |
| v2.0 Firefox Port | 4 | 10 | ~2 days |
| v2.1 CI/CD Pipeline | 2 | 2 | 2 days |
| v2.2 Matching Robustness | 3 | 4 | 2 days |
| v2.3 Post-v2.2 Hardening | 3 | 5 | 1 day |
| v3.0 Autonomous E2E Testing Agent | 6 | 30 | ~7 days |
| v3.1 LLM-Driven Product Improvement Loop | 6 (planned) | TBD | TBD |

## Accumulated Context

### Decisions

All v1.0–v2.3 decisions archived in PROJECT.md Key Decisions table.

- [Phase 29]: Static concurrency group 'e2e-nightly' (not dynamic) prevents schedule+dispatch race (RESEARCH.md Risk 1)
- [Phase 29]: gh label create color uses '0075ca' without # prefix (gh CLI requirement)
- [Phase 29]: npx playwright --version verification step mitigates broken-cache scenario (Pitfall 2)
- [Phase 29]: Playwright retries: process.env.CI ? 1 : 0 — reduces CI flake noise, fails fast locally
- [Phase 30]: vitest@^4.1.0 installed in worker/ only (not root) to avoid vitest@3.x conflict
- [Phase 30]: cloudflareTest() Vite plugin API used (not deprecated defineWorkersConfig)
- [Phase 30]: X-PCT-Test-Mode guard uses !=='true' polarity — absent header writes to KV (production default unchanged)
- [Phase 30]: Canaries NOT removed despite A1 failure — per 30-02-PLAN.md contract; Risk A1 (pct.tonyrowles.com page.route does not reach extension offscreen) escalated to Plan 30-04
- [Phase 30]: pdf-verifier returns status='pass' not 'agree' — fault-injection.spec.js line 141 assertion will need fix in Plan 30-04
- [Phase 30]: context.route also does not reach extension offscreen document fetches (same Chrome isolation as page.route) — escalated to Plan 30-05
- [Phase 30]: Verifier status assertion fixed: 'agree' → 'pass' (matches pdf-verifier.js actual return values from Tier A/B/C)
- [Phase 30]: chrome.storage.local IS accessible from offscreen documents; comment in offscreen.js was incorrect
- [Phase 30]: Only 2 /cache URL sites in offscreen.js (not 3 as plan estimated): checkCache() and uploadToCache()
- [Phase 30]: Final test-mode approach: chrome.storage.local hook set via sw.evaluate() — CDP routing confirmed unreachable from offscreen context in Plans 30-02 and 30-04
- [Phase 30]: WORKER_FALLBACK_FAILED appended as index 8 in ERROR_CLASSES (Object.freeze preserved)
- [Phase 30]: Fault-injection step placed after regression issue-filer; runs every nightly tick (not weekday-rotated); no --grep since single-case spec
- [Phase 30]: No changes to scripts/e2e-report-issue.mjs — existing per-case loop handles WORKER_FALLBACK_FAILED via report.json standard schema

### v3.1 Pre-locked Decisions (from roadmap research)

- **Zero new npm dependencies**: All new scripts are pure Node 22 built-ins layered on existing `llm-driver.js`, `pdf-verifier.js`, `e2e-report-issue.mjs`, and Playwright config primitives
- **LLM triage path**: Subscription-local only (not API-billed); `invokeClaudePWithLedger` wrapper required; direct `invokeClaudeP` calls ESLint-restricted outside test files
- **Fingerprint immutability**: v1 fingerprint formula (`sha256(caseId | errorClass | "")`) is immutable; v3.1 adds only `topOfStackHashFromCase` for NEW error classes; `findMatchingIssue` performs dual v1+v2 search during transition
- **ERROR_CLASSES / fingerprint formula**: Immutable for v3.0 consumers (Phase 29, Phase 30); any new error class or fingerprint variant is additive only
- **Quarantine CI placement**: Quarantine spec runs inside `e2e-nightly.yml` (not a separate workflow) — avoids concurrency group collision risk
- **Automatic golden promotion**: Blocked — destroys trust invariant; promotion stays human-gated via `promote-from-quarantine.mjs`
- **Weekly digest delivery**: GitHub Discussion via `gh api graphql createDiscussion`; Issue with `e2e-digest` label as fallback if Discussions disabled — verify at Phase 37 start
- **Triage cluster pre-filter**: N≥5 same-errorClass findings route to single grouped LLM call (DOM_DRIFT saturation prevention)
- **Tier C masking prevention**: `verifier_strong_agreement` named constant (status==='pass' AND tier ∈ {A,B}); Tier C escalates to LLM second-pass; Vitest guard test required
- **Issue body fingerprint placement**: Fingerprint comment on line 1 of body (prevents 65,536-char overflow displacement)

### v3.0 Pre-locked Decisions (from milestone kickoff)

- **Test harness:** Playwright + Chromium (Chrome only for v3.0; Firefox E2E deferred to v3.1+)
- **Modes:** Hybrid — deterministic core (76 golden patents) + LLM exploratory (headless `claude -p` against Max 5 subscription credit; local-dev only; soft monthly $100 cap with warning at $80). Anthropic's May-2026 announcement that Max 5 subscribers get $100/mo headless-API credit unblocked the originally-planned approach; the v3.0 design proceeds with appropriate budget guardrails.
- **Verification source:** Independent PDF re-parse (separate code path from extension pipeline) — search for selected text near cited column:line
- **Runtime split:** Local dev (npm script + Claude Code subscription) AND GitHub Actions nightly cron (deterministic mode only — no LLM in cron)
- **Reporting:** GitHub Actions logs + auto-issue on failure (fingerprint-based dedup)
- **Failure diagnostics:** page screenshot, DOM snapshot, PDF page snippet for the cited column:line
- **No HAR/network trace** (explicitly declined to keep artifacts small)
- **No new extension functionality** — milestone is testing infrastructure only; only allowed source change is `data-testid` attributes on the citation UI and an `X-PCT-Test-Mode` header on the Cloudflare Worker

### Pending Todos

None.

### Blockers/Concerns

**Design locks to confirm at phase start (not blocking roadmap):**

- [Phase 34]: Confirm LLM invocation path is subscription-local only before any triage code is written; document as acceptance criterion in plan
- [Phase 36]: Calculate timeout budget (existing nightly runtime + N_quarantine_cases × per-case-time) before adding quarantine steps; document in YAML comment
- [Phase 37]: Verify GitHub Discussions is enabled on repo at phase start; implement Issue fallback if not

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 2 | Fix CI: commit package-lock.json (currently gitignored but required by npm ci) | 2026-03-05 | a47dbb8 | [2-fix-ci-commit-package-lock-json-currentl](./quick/2-fix-ci-commit-package-lock-json-currentl/) |
| 260412-fde | Fix spurious results reporting impossible page numbers like 203 for patent US10203551 | 2026-04-12 | e51ba1b | [260412-fde-fix-spurious-results-reporting-impossibl](./quick/260412-fde-fix-spurious-results-reporting-impossibl/) |

## Session Continuity

Last activity: 2026-05-22 — v3.1 roadmap created (Phases 32-37, 29 requirements mapped)
Status: Phase 32 not started
Next: `/gsd:plan-phase 32` to plan HUMAN-UAT Verification

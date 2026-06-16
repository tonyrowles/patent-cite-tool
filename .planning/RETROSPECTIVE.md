# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — MVP

**Shipped:** 2026-03-02
**Phases:** 4 | **Plans:** 8 | **Commits:** 79

### What Was Built
- MV3 Chrome extension with patent page detection, PDF fetch via offscreen document, and IndexedDB storage
- PDF.js text extraction with two-column specification detection and PositionMap builder
- Fuzzy text matching engine (exact → whitespace-stripped → punctuation-agnostic → bookend → Levenshtein)
- DOM-based paragraph citations for published applications (no PDF needed)
- Shadow DOM citation UI with configurable trigger modes and clipboard copy
- Settings system for trigger mode, display mode, and patent number prefix

### What Worked
- Phase decomposition along the critical path (fetch → parse → match → output) kept dependencies clean
- Offscreen document architecture cleanly separated PDF.js from MV3 service worker constraints
- DOM-based paragraph citation for published apps was an elegant shortcut — avoided PDF parsing entirely
- Human-verify checkpoints caught real bugs (constants.js export, message port errors, gutter filtering)
- Atomic commits per task made debugging regressions straightforward

### What Was Inefficient
- Phase 3 Plan 3 (UI + interaction layer) required extensive debugging across multiple sessions — the plan underestimated matching accuracy challenges
- Column boundary detection, gutter line filtering, and disambiguation all required iterative fixes discovered during manual testing
- Matching functions are duplicated between content script (classic) and offscreen (ES module) due to MV3 constraints — a build step would eliminate this
- The dual-context constants pattern (globals + ES module) caused two separate bugs across two phases

### Patterns Established
- PositionMap as the contract between parsing and matching — clear data boundary
- TabId routing through service worker for content script ↔ offscreen communication
- Shadow DOM (closed mode) for UI isolation on third-party pages
- Word-overlap scoring (not character-level) for text disambiguation
- Bookend matching for selections too long for full fuzzy comparison
- Badge color semantics: clear=ready, amber=unavailable, red=error

### Key Lessons
1. **Text matching is harder than parsing.** Parsing produced clean data; matching had to handle every divergence between HTML and PDF text. Budget more time for matching/fuzzy logic.
2. **MV3 module boundaries create real friction.** Classic scripts and ES modules can't share code, leading to duplication. A minimal build step (even just a concatenation script) would pay for itself quickly.
3. **Human-verify checkpoints are high-value.** Both Phase 1 and Phase 3 checkpoints caught bugs that automated checks would have missed. Keep them.
4. **DOM-first strategies beat PDF-first for some patent types.** Published applications have paragraph markers in the DOM — going to the PDF would have been wasted effort.
5. **Long selections need special handling.** Levenshtein on >100 chars hangs the UI. Bookend matching (first/last 50 chars with span validation) was the pragmatic solution.

### Cost Observations
- Model mix: mostly opus for execution, balanced profile
- Sessions: ~6 across 3 days
- Notable: Plans 01-01, 02-01, 03-01, 03-02 all completed in 2-3 minutes each. Phase 3 Plan 3 was the outlier — multiple debugging sessions.

---

## Milestone: v1.1 — Silent Mode + Infrastructure

**Shipped:** 2026-03-03
**Phases:** 3 | **Plans:** 8 | **Commits:** ~20

### What Was Built
- Silent clipboard mode — Ctrl+C appends column:line citation with toast feedback (green success pill, red failure pill)
- Cloudflare Worker proxy for USPTO eGrant API with bearer auth, CORS, and 3-step ODP orchestration
- Three-point fallback chain: no DOM link → Google fetch failure → no text layer → all route to USPTO
- Shared Cloudflare KV cache — check before fetch, fire-and-forget upload, existence-check write protection
- Full cache lifecycle: miss → parse → upload → hit (no PDF download) with 3-second timeout fallthrough

### What Worked
- Worker + KV deployed and functional quickly — Cloudflare's free tier covers the use case perfectly
- Wave-based execution for Phase 7 let cache routes (07-01) and client integration (07-02) develop in parallel
- Human-verify checkpoint for deployment (06-03, 07-03) caught a real cache routing bug before release
- Fire-and-forget upload pattern keeps cache writes invisible to the user experience
- Pre-compute citation on mouseup was the right synchronous-copy workaround for MV3

### What Was Inefficient
- USPTO fallback path was not wired through cache check initially — discovered during E2E verification
- Phase 6 deployment took ~2 hours (user-paced) due to Cloudflare auth, secret provisioning, and custom domain DNS issues
- Plan SUMMARY.md files lack structured one-liner fields, making automated extraction fragile
- Some plan checkboxes in ROADMAP.md weren't updated by executor agents (Phase 6/7 plans show `[ ]` despite being complete)

### Patterns Established
- `CHECK_CACHE → CACHE_HIT/MISS` message flow mirrors existing `FETCH_PDF → PDF_FETCH_RESULT` pattern
- Null pdfUrl signals USPTO-fallback path through cache miss handler — clean branching
- Versioned KV key format (`v1:12505414`) enables future cache invalidation without key migration
- Console logging at every cache decision point for production debuggability

### Key Lessons
1. **Wire ALL paths through new middleware.** The cache check was added to `handlePdfLinkFound` but missed `handlePdfUnavailable`. Every acquisition path must be audited when adding a cross-cutting concern.
2. **E2E verification catches integration bugs that unit logic misses.** Both Phase 6 and Phase 7 had bugs discovered only during browser testing.
3. **Cloudflare Workers + KV is a great fit for extension backends.** Free tier, global edge, no cold starts — ideal for a Chrome extension with distributed users.
4. **Fire-and-forget requires defensive coding.** Every cache write/upload is wrapped in try/catch with swallowed errors — the user must never see cache infrastructure issues.

### Cost Observations
- Model mix: sonnet for executor agents, opus for orchestration
- Sessions: 2 (phase 6 + phase 7)
- Notable: Phase 5 and 7 plans 01-02 completed in minutes; deployment plans (06-03, 07-03) were the bottleneck due to user-paced Cloudflare operations

---

## Milestone: v1.2 — Store Polish + Accuracy Hardening

**Shipped:** 2026-03-03
**Phases:** 6 | **Plans:** 12 | **Commits:** 69

### What Was Built
- Vitest test infrastructure with 71-case patent fixture corpus across 8 categories and frozen golden baseline
- Accuracy hardening: gutter contamination strip (cross-boundary PDF items) and wrap-hyphen normalization — 97.7% → 100.0%
- Three-state toolbar icon system (gray/partial/full) with sharp-based SVG→PNG generation pipeline
- Dedicated options page with auto-save feedback, version footer, and privacy policy link
- Privacy policy hosted on GitHub Pages, Chrome Web Store listing copy, and extension ZIP packaged
- Offscreen.js integration gap closed — wrap-hyphen fix propagated to context-menu citation path

### What Worked
- Milestone audit (`/gsd:audit-milestone`) caught a real integration gap (offscreen.js missing wrap-hyphen fix) and requirements gaps (Phase 12 not started) — audit-driven Phase 13 insertion proved valuable
- Test harness as prerequisite (Phase 8 before Phase 9) prevented reckless algorithm changes — every fix was regression-validated
- Per-category accuracy reporting made diagnosis targeted instead of guessing at failure modes
- Parallel Phase 9/10 execution after Phase 8 was an efficient use of independence
- `generate-icons.mjs` reproducible build means icon updates don't require manual design work

### What Was Inefficient
- Plan checkboxes in ROADMAP.md again fell out of sync (12-02, 13-01 show `[ ]` despite summaries existing) — this is a recurring pattern
- The v1.2 audit was done before Phase 12 execution, making it stale by completion time — audit should ideally happen after all phases finish
- STOR-02 (screenshot) and STOR-03 (promo tile) remain manual user tasks that can't be automated — these requirements may not belong in a code milestone
- ICON_PATHS numeric keys tech debt carried forward — works via JS coercion but is technically non-standard

### Patterns Established
- Golden baseline snapshot testing: freeze expected outputs, run algorithm, compare — simple and effective
- Off-by-one tier classification (exact/systematic/boundary/mismatch) for nuanced accuracy assessment
- Milestone audit → gap closure phase pattern: audit finds gaps, insert decimal phase to close them
- CSS class injection for multi-state SVG icon generation — avoid external rendering dependencies
- GitHub Pages `docs/` folder for privacy policy hosting — zero-cost, same-repo

### Key Lessons
1. **Audit before marking complete, but after all phases finish.** The v1.2 audit caught real gaps but was run mid-milestone, requiring Phase 13 insertion. Run audit as the penultimate step.
2. **Automated requirements don't belong alongside manual tasks.** STOR-02/STOR-03 (screenshot/tile) are inherently human tasks that block "all requirements complete" status. Consider separating code requirements from manual requirements.
3. **Integration gaps hide at code duplication boundaries.** The wrap-hyphen fix applied to `text-matcher.js` but not the duplicate `offscreen.js` version. This is the second time duplicated matching functions caused a bug (v1.0 lesson 2 predicted this).
4. **Test infrastructure investment pays off immediately.** Phase 8's 3 plans were fast to execute and unlocked confident algorithm changes in Phase 9. The accuracy improvement from 97.7% to 100% was possible only because regressions were instantly detectable.
5. **ROADMAP.md plan checkboxes keep falling out of sync.** This is now a 3-milestone recurring issue. Consider either automating checkbox updates in the executor or removing them in favor of disk-only status.

### Cost Observations
- Model mix: balanced profile (sonnet for execution agents, opus for orchestration)
- Sessions: ~4 across 2 days
- Notable: Most plans completed in 2-5 minutes. Phase 10-02 (icon state system, ~30min) and Phase 12-01 (privacy policy + ZIP, ~15min) were the longest due to debugging and user-paced operations.

---

## Milestone: v2.0 — Firefox Port

**Shipped:** 2026-03-05
**Phases:** 4 | **Plans:** 10 | **Commits:** 52

### What Was Built
- Shared code extraction — constants + matching consolidated into src/shared/, eliminating all Chrome/Firefox duplication
- esbuild build pipeline — single `npm run build` produces dist/chrome/ (IIFE content + ESM background) and dist/firefox/ (ESM background absorbing offscreen logic)
- Firefox MV3 extension with background script orchestrator, IndexedDB graceful degradation, and tabs.onUpdated icon activation
- Cross-browser test infrastructure — per-target vitest alias configs proving each dist/ build's bundling correctness
- web-ext lint integration and spot-check verification script for human cross-browser validation
- Build-time manifest transformation eliminating manual Chrome/Firefox manifest sync

### What Worked
- Phased architecture evolution (extract → build → port → validate) kept each phase focused and independently verifiable
- Phase 14's shared code extraction cleanly resolved v1.0/v1.2's duplicated matching functions tech debt — the build step v1.0 lesson 2 predicted
- Human UAT for Phase 15 (Chrome dist/) and Phase 16 (Firefox) caught no issues — architecture was sound before browser testing
- Per-target vitest alias configs elegantly proved bundling correctness without modifying any test files
- IndexedDB detect-once degradation pattern was clean — single flag, graceful fallback to in-memory Map

### What Was Inefficient
- ROADMAP.md plan checkboxes STILL fell out of sync (17-01, 17-02 show `[ ]` in archived roadmap despite being complete) — 4th consecutive milestone with this issue
- Phase 17-02 spot-check required multi-session execution due to user-paced browser operations — could be streamlined with Playwright
- US11427642 cross-column test fixture had off-by-2 offset vs browser rendering; required mid-plan substitution to US6324676
- Summary files lack structured one-liner fields (same issue as v1.1) — automated extraction still fails

### Patterns Established
- src/shared/ → esbuild → dist/{chrome,firefox}/ as the canonical build architecture
- IIFE wrapping for content scripts (Chrome MV3 limitation), ESM for background/offscreen
- Object entry point syntax in esbuild to control output directory nesting
- external: ['../lib/pdf.mjs'] relative path pattern for runtime-resolved PDF.js imports
- web-ext lint with --ignore-files 'lib/**' to skip vendored PDF.js warnings

### Key Lessons
1. **Shared code extraction should precede any port.** Phase 14 before Phase 16 was the right sequencing — porting with duplicated code would have doubled the work and doubled the bugs.
2. **esbuild is the right complexity level for extension builds.** No webpack config maze, fast builds, clear IIFE/ESM output control. The build script is ~200 lines and fully understood.
3. **Firefox's chrome.* compatibility eliminates most porting work.** No polyfill needed. The real differences are: offscreen API (Chrome-only), declarativeContent (Chrome-only), background scripts array syntax, and CSP for WASM.
4. **Per-target test configs beat test file duplication.** Vitest resolve.alias redirects prove each build's integrity without maintaining separate test suites.
5. **Automated milestone audits continue to add value.** v2.0 audit confirmed 16/16 requirements before archival — caught no gaps this time, but the confidence is worth the cost.

### Cost Observations
- Model mix: balanced profile (sonnet for execution agents, opus for orchestration)
- Sessions: ~5 across 2 days
- Notable: Phases 14-16 plans executed in 2-5 minutes each. Phase 17-02 (spot-check) was multi-session due to user-paced browser testing. Phase 15-03 and 16-03 (human verification) were fast because architecture was already correct.

---

## Milestone: v2.1 — CI/CD Pipeline

**Shipped:** 2026-03-05
**Phases:** 2 | **Plans:** 2 | **Commits:** 15

### What Was Built
- GitHub Actions CI workflow triggering on push (all branches) and PRs to main
- Four individually named test steps (test:src, test:chrome, test:firefox, test:lint) with per-suite pass/fail visibility in Actions UI
- Store-ready ZIP packaging via cd+zip pattern — manifest.json at archive root, uploaded as downloadable artifacts
- Concurrency group with head_ref && ref || run_id — stale PR runs cancelled, main-branch runs protected
- Least-privilege GITHUB_TOKEN scope (contents: read only)
- 10-minute job timeout to prevent runaway builds

### What Worked
- Smallest milestone yet (2 phases, 1 file) — focused scope made execution clean and fast
- Pre-flight validation (build + lint locally) before committing CI workflow avoided any GitHub Actions iteration
- Phase 18 → Phase 19 sequencing was natural — base workflow first, then hardening additions
- Both plans executed with zero deviations from plan
- Auto-advance mode for checkpoints worked well since CI verification was confirmatory (not exploratory)

### What Was Inefficient
- ROADMAP.md plan checkbox for 19-01 still shows `[ ]` despite being complete — 5th consecutive milestone with this recurring issue
- Phase 19 progress table row in ROADMAP.md had a formatting error (missing v2.1 milestone column) — carried through to archive
- STATE.md had stale phase-level performance metrics mixed with milestone-level rows — formatting inconsistency

### Patterns Established
- cd+zip pattern: `cd dist/X && zip -r ../../name.zip .` — ensures manifest.json at archive root
- Named test steps (not single `npm test`) for individual pass/fail visibility in CI
- Concurrency pattern: `${{ github.workflow }}-${{ github.head_ref && github.ref || github.run_id }}` for PR cancellation without main-branch impact
- Workflow-level `permissions: contents: read` as default for read-only CI workflows

### Key Lessons
1. **Pre-flight local validation is cheap insurance.** Running the full build+test locally before committing CI workflow saved what could have been multiple push-fix-push iterations on GitHub.
2. **Focused milestones execute cleanly.** Two phases, one file, clear requirements — both plans completed with zero deviations. Scope discipline pays off.
3. **ROADMAP.md checkbox sync is a permanent debt.** Five milestones in a row. Either automate it or accept it as cosmetic and stop noting it.
4. **CI hardening is a natural follow-on, not a separate milestone.** Concurrency + permissions added 7 lines and took 1 minute. Could have been part of Phase 18, but separation made requirements tracking cleaner.

### Cost Observations
- Model mix: balanced profile (sonnet for execution agents, opus for orchestration)
- Sessions: 1 (both phases in a single session)
- Notable: Fastest milestone — ~3 minutes of execution time total. Minimal file changes (1 file, 68 lines).

---

## Milestone: v2.2 — Matching Robustness

**Shipped:** 2026-03-05
**Phases:** 3 | **Plans:** 4 | **Commits:** 25

### What Was Built
- OCR normalization pipeline — `normalizeOcr` with 5 prose-safe substitution pairs (rn→m, cl→d, cI→d, vv→w, li→h) applied as Tier 0b preprocessing
- Concat refactor — `buildConcat` extracted as shared helper returning `{concat, boundaries, changedRanges}`, replacing inline loop in matchAndCite
- Gutter-tolerant matching — Tier 5 last-resort fallback using space-anchored survive-mask strip for stray USPTO gutter line numbers (multiples of 5, range 5-65)
- 75-entry golden baseline — 4 new validated test cases (US6324676 OCR divergence, split-word, synthetic gutter fixture)
- Fixed matching-exports.js missing exports from phases 20/21

### What Worked
- TDD approach (RED → GREEN → REFACTOR) for all plans — every implementation was regression-validated before proceeding
- Symmetric normalizeOcr design (apply to both selection and concat) was discovered during implementation — prevented 10 baseline regressions
- Survive-mask approach for gutter stripping matched existing whitespaceStrippedMatch pattern — consistent codebase patterns
- Synthetic fixture (gutter number injected into real patent data) provided isolated Tier 5 testing without relying on finding perfect real-world examples
- All plans executed with zero scope creep — auto-fixed bugs were all in test expectations or pre-existing gaps

### What Was Inefficient
- matching-exports.js was missing normalizeOcr/buildConcat/stripGutterNumbers since phases 20/21 — not caught until phase 22 CI run (30 test failures)
- Plan 20-01 specified normalizeOcr on concat only — symmetric application to both sides was discovered during implementation (10/71 baseline failures forced the correction)
- Plan 20-02 "conservative" penalty approach (changedRanges overlap) was incorrect — changedRanges almost always non-empty for real English text

### Patterns Established
- Tier 0b preprocessing — normalizeOcr applied before all cascade tiers, not as a separate tier
- Survive-mask + offset array rebuild pattern for character-level stripping (reusable for future transformations)
- Synthetic fixture pattern — minimal JSON subset with controlled artifact injection for isolated algorithm testing
- selChanged as the correct penalty gating flag for symmetric normalization features
- Dynamic spot-check count — SPOT_CHECK_IDS.length replaces hardcoded references

### Key Lessons
1. **Export maintenance is a cross-phase concern.** matching-exports.js fell out of sync across two phases — consider adding an automated export check or CI step.
2. **Plan-specified normalization strategies need baseline validation.** Both 20-01 and 20-02 had logically correct but practically incorrect normalization/penalty strategies that broke baseline tests. Always test against the full corpus immediately.
3. **Synthetic fixtures enable targeted tier testing.** Real-world examples of Tier 5 gutter contamination are rare; synthetic injection proved the algorithm without hunting for perfect specimens.
4. **TDD catches implementation bugs early.** All auto-fixes were discovered during GREEN phase, not after deployment. The failing-test-first discipline keeps the feedback loop tight.

### Cost Observations
- Model mix: balanced profile (sonnet for execution agents, opus for orchestration)
- Sessions: 2 (phases 20-21 + phase 22)
- Notable: Fastest execution times yet — Phase 21 completed in 4 minutes, Phase 22 in 4 minutes. Phase 20 took ~45 minutes due to two plans with symmetric normalization discovery.

---

## Milestone: v2.3 — Post-v2.2 Hardening

**Shipped:** 2026-05-12
**Phases:** 3 | **Plans:** 5 | **Tasks:** 8

### What Was Built
- Column-inference verification + integration fixture for headerless PDFs (US10203551-class): structural validators ratified with G1-G4 guard tests, 76-entry golden baseline (75→76), CACHE_VERSION='v3' bump pinned by a 4-assertion grep test, Firefox manifest aligned to 2.3.0.
- Firefox AMO lint enforcement chain retro-documented: `tests/unit/web-ext-lint.test.js` (5 assertions) pins `package.json scripts.test:lint`, the npm test chain, the CI step name (em-dash U+2014), and the absence of `continue-on-error: true` muting.
- Release workflow retro-documented: `tests/unit/release-workflow.test.js` (8 assertions) pins `release.yml` (tag trigger, permissions, both ZIPs, `gh release create --generate-notes`) and the trigger-independence between `release.yml` and `ci.yml`. Real Release `v2.3.0` exists on GitHub as end-to-end proof.

### What Worked
- **Retro-document pattern**: writing CONTEXT.md → verify-only PLAN.md → static-grep guard test → SUMMARY converged in minutes per phase, with zero source modifications. Suitable template for future "capture what already shipped" milestones.
- **Static-grep guards over runtime checks**: pinning literal strings (script names, CI step names, file paths) in unit tests fails fast in `npm test` before the actual CI/AMO/release gate would catch it. Cheaper signal closer to the developer.
- **End-to-end evidence baked into SUMMARY**: citing the live `v2.3.0` Release with author `github-actions[bot]` proved the release workflow had actually run — not just hypothetically valid.
- **Phase 24 → Phase 25 cross-phase wire** (release.yml invokes `npm run test:lint`) was caught and pinned by the integration checker, not introduced as new code.

### What Was Inefficient
- The plan-checker prompt had to be primed with "RESEARCH.md is intentionally absent for retro phases" to avoid blocking on Dimension 8 / Nyquist. A `retro: true` frontmatter flag (or a phase tag) could short-circuit Nyquist checks automatically.
- `gsd-tools phase complete` did not auto-tick requirement checkboxes in REQUIREMENTS.md — had to manually mark `[x]` before `milestone complete` to avoid the "incomplete requirements" prompt. Worth tightening for next milestone.
- The `complete-milestone` skill expected a `<details>` collapse of v2.3 details in ROADMAP.md but the milestone-complete CLI didn't perform that step — orchestrator had to do it manually.

### Patterns Established
- **Retro-document phase template** — CONTEXT.md captures "as-shipped" decisions; PLAN.md has 2 tasks (verify task + guard test task); SUMMARY documents end-to-end evidence; SUMMARY's `requirements-completed` field is the canonical source of truth for `milestone complete`.
- **Static-grep guard test naming** — `tests/unit/{feature}-{contract}.test.js` (web-ext-lint, release-workflow, cache-version). Follows existing `cache-version.test.js` analog.
- **Defensive `continue-on-error: true` absence check** — added to both Phase 24 (L5) and Phase 25 (R6) guards. Mute-step regression is a real silent-failure mode worth pinning.
- **Em-dash U+2014 in CI step names** is pinned as an exact byte sequence (no regex), so a cosmetic rename to a hyphen would fail the test and be visible in the diff.

### Key Lessons
1. **Retro milestones are legitimate work.** Capturing already-shipped code into the GSD planning artifacts is not busywork — it produces guard tests that protect the invariants from future regressions. The cost (~10 minutes per phase with this template) is far less than discovering a silent regression months later via AMO rejection.
2. **The integration checker is the right place to verify cross-phase wiring on retro milestones.** Individual phase verifiers can only see one phase; the integration checker confirms FOX-06 → CICD-04 wire on `release.yml:45`.
3. **`gh release view <tag>` is the cleanest end-to-end proof** for CI/CD phases. Static file checks tell you the workflow is structurally valid; the live release tells you it actually ran.
4. **Don't trust `requirements_updated: false`** from `phase complete` — manually verify REQUIREMENTS.md checkboxes match the validated state before running `milestone complete`.

### Cost Observations
- Model mix: balanced (sonnet executors, opus planner)
- Sessions: 1 single autonomous run from `/gsd-autonomous` after declining to abandon v2.3
- Notable: Both phases completed inside one session with `--auto --no-transition` chain; total executor time ~5 minutes across Phase 24 + Phase 25 (each ~2 min). The retro-document template makes phases fast.

---

## Milestone: v3.1 — LLM-Driven Product Improvement Loop

**Shipped:** 2026-05-30
**Phases:** 7 (32–38) | **Plans:** 31 | **Tasks:** ~50
**Timeline:** 2026-05-20 → 2026-05-29 (~9 days, 257 commits)

> *Note: v3.0 (Autonomous E2E Testing Agent, Phases 26-31) was not recorded in this retrospective; it shipped 2026-05-20 with 6 phases / 30 plans / 32 requirements. The v3.0 → v3.1 arc together established the full LLM-augmented testing pipeline.*

### What Was Built
- **HUMAN-UAT closure (Phase 32):** `npm run e2e:explore` runs end-to-end against Max 5 subscription credit with ≥10 real iterations; spend ledger tracks `claude -p` against $80/$100 monthly cap; `e2e:upload-llm-report` handles local→CI handoff via workflow_dispatch.
- **Re-run validator (Phase 33):** pure-function 3-replay validator (verifier-only path, no browser); `rerun-report.json` with 2/3+ → CONFIRMED, 0–1/3 → FLAKE; `llm-report.json` schema extended with `scroll_y`/`viewport_*`/`selected_node_xpath` for replay fidelity.
- **Hybrid triage classifier (Phase 34):** heuristic-first resolves 6/8 ERROR_CLASSES with zero LLM calls; named `verifier_strong_agreement` (Tier A/B only) prevents Tier C masking; cluster pre-filter on N≥5 same-errorClass findings; PDF text wrapped in `<patent_data>` XML as prompt-injection defense; subscription-local-only via `invokeClaudePWithLedger` with CI guard.
- **Rich issue filer + quarantine corpus (Phase 35):** `lib/issue-payload-builder.js` 4-section body within per-section char budgets, fingerprint on line 1; idempotent `quarantine-append.mjs` with auto `quarantine:ready-for-promotion` label at `stable_runs ≥ 3`; human-gated `promote-from-quarantine.mjs`.
- **Pipeline orchestrator + CI integration (Phase 36):** `run-triage-pipeline.mjs` chains rerun → triage → issue-file → quarantine-append; non-gating quarantine Playwright project (`continue-on-error: true`) runs every nightly tick.
- **Weekly analytics digest (Phase 37):** Monday 07:00 UTC GitHub Discussion + committed markdown summary, anchored on frozen `SUMMARY_KEYS`.
- **v3.1 cleanup (Phase 38):** 3 integration fragility fixes, Nyquist VALIDATION stamping on 5 carry-over phases, 8/8 live human-UAT confirmations.

### What Worked
- **Heuristic-first hybrid triage paid off immediately** — the 6/8 resolved-without-LLM rate plus N≥5 cluster pre-filter meant the LLM second-pass was the exception, not the default. Cost stayed within the $80/$100 cap with zero close calls during the milestone.
- **`<patent_data>` XML wrapping** as a prompt-injection defense was cheap (one helper) and pinned by a Vitest test — a pattern worth replicating for any LLM input that includes externally-sourced text.
- **Phase 38 as an explicit cleanup phase** was the right call. Stuffing integration fragility fixes, Nyquist stamping, and live human-UAT confirmations into one bounded phase with a written CONTEXT scope-lock prevented scope creep across phases 32-37 and gave each cleanup track a clear owner.
- **Audit-driven phase scoping** — `.planning/v3.1-MILESTONE-AUDIT.md` listing `human_verification` items by name (with `outcome: PASS/PARTIAL/DEFERRED`) gave Phase 38 Plan 03 a verifiable checklist to execute against. Compare to v2.3's "retro-document already-shipped" pattern — Phase 38 is the same idea applied to deferred tech-debt rather than past releases.
- **Frozen `SUMMARY_KEYS` array** as single source of truth for the digest contract caught a real self-referential bug (DIGEST-04) — Phase 38 INT-FIX-02's `aggregateBySummaryKey` helper.

### What Was Inefficient
- **VERIFICATION.md and HUMAN-UAT.md frontmatter rot** — Phase 38-03 closed 8/8 audit `human_verification` items live, but the source `*-VERIFICATION.md` / `*-HUMAN-UAT.md` files were not re-stamped to `status: passed`. The `audit-uat` query continued to surface these as `human_needed` at close time, requiring an explicit Deferred Items entry in STATE.md. A `stamp-resolved-from-audit` helper that walks the audit's `human_verification` block and PATCHes the matching files' frontmatter would close this bookkeeping gap automatically.
- **`milestone.complete` CLI accomplishments extraction** picked the first non-frontmatter line of each SUMMARY.md, which for ~half the v3.1 summaries was a stray "One-liner:" placeholder or section header rather than the actual one-liner. Had to be replaced manually with curated 7-bullet synthesis. The CLI's `summary-extract --pick one_liner` should fall back to the next meaningful line when the first match is a placeholder.
- **v3.0 missing from RETROSPECTIVE.md** — the prior milestone wasn't recorded here, only in `.planning/milestones/v3.0-*`. Either `complete-milestone` should hard-fail when `RETROSPECTIVE.md` exists but the most recent shipped milestone is missing, or it should auto-stub a section that prompts retro entry.
- **Orphan quick-task slugs in `pre-close audit-open`** — three `quick_tasks` showed status `missing` because the slug references in STATE.md outlived their directories. Quick-task completion should clean up STATE.md slug references on success, or the audit should distinguish "no directory" from "no record".

### Patterns Established
- **Subscription-local-only LLM wrapper** (`invokeClaudePWithLedger`) + ESLint `no-restricted-imports` on direct `invokeClaudeP` outside test files = cost control + CI guard in one. Pattern reusable for any future LLM integration.
- **Tier-A/B-only `verifier_strong_agreement` constant** with Vitest guard against Tier C masking. Generalizes to "named confidence threshold + escalation" for any future heuristic/LLM hybrid.
- **Fingerprint additive evolution** (v1 immutable; v2 additive only; dual v1+v2 search during transition) — a clean pattern for evolving any deduplication scheme without retroactive breakage.
- **Non-gating CI project for quarantine** — runs every nightly tick with `continue-on-error: true` + `e2e-quarantine` labeled issues. The "ratchet" model: failures get filed but don't block; humans promote stable entries to the gating golden suite.
- **Auto-promotion label as a queue signal** — `quarantine:ready-for-promotion` at `stable_runs ≥ 3` surfaces candidates without auto-promoting (trust invariant preserved).
- **Per-section char budgets in issue body** with fingerprint on line 1 — prevents both LLM context blowup and GitHub's 65,536-char overflow displacement.

### Key Lessons
1. **Heuristics first, LLM second — measured.** The discipline of writing the heuristic rules first (TRIAGE-01..02) and only escalating Tier C / cluster-of-≥5 to the LLM kept costs deterministic and the failure mode debuggable. Mixing the two paths in one classifier would have hidden the LLM cost surface.
2. **Audit-driven cleanup phases are a legitimate phase type.** Phase 38 had a 3-track CONTEXT scope-lock and produced 8 PASS confirmations + 3 INT-FIX commits + 5 Nyquist stamps. Plan as deliberately as feature phases; don't let "cleanup" mean "unbounded".
3. **Bookkeeping rot at milestone close is a real cost.** 11 deferred items at close were almost entirely stale frontmatter on files whose content was correct. The work was done; the metadata didn't catch up. Future milestones should treat the `audit-open` clean-pass as a hard gate at the *plan* level for cleanup phases, not just at milestone close.
4. **CI guards belong in the wrapper, not the script.** `invokeClaudePWithLedger`'s CI check fired regardless of which caller invoked it — meaning a future script that imports the wrapper inherits the guard automatically. Scripts that hand-code their own CI check are guard-gaps waiting to happen.
5. **Schema-evolution forward-compat is its own design surface.** The new tech_debt entry from Phase 38 (Phase 33 schema-guard correctly rejecting a pre-Phase-33 `llm-report.json`) is non-blocking but worth tracking — the reject behavior is correct per RERUN-03, but a forward-compat skip path would have prevented the operational surprise during the workflow_dispatch UAT-36a test.

### Cost Observations
- Model mix: `balanced` profile (sonnet executors, opus planner)
- LLM triage spend: well within the $80 warning threshold (subscription-local; no API charges)
- Sessions: ~9 days end-to-end; phases 32-37 ran with autonomous/auto-chain plans; phase 38 was a manually-scoped cleanup with explicit Wave 1 (parallel) + Wave 2 (depends) structure
- Notable: zero new npm dependencies added across the entire milestone — `package.json` deps unchanged from v3.0. All new functionality layered on existing primitives (`llm-driver.js`, `pdf-verifier.js`, `e2e-report-issue.mjs`, Playwright config). Compare to v2.0 (esbuild + sharp + web-ext additions) — v3.1 demonstrates how much can be built on top of an already-mature primitive set.

---

## Milestone: v4.0 — Self-Healing Test Suite

**Shipped:** 2026-06-02
**Phases:** 9 (39–47) | **Plans:** 26 | **Tasks:** 53
**Timeline:** 2026-05-30 → 2026-06-02 (~3 days, 185 commits)

### What Was Built
- **SDK driver + ledger v2 (Phase 39):** `invokeAnthropicSdkWithLedger` sibling export in `llm-driver.js` with INVERSE CI gate; unified `LEDGER_PATH` shared with `invokeClaudePWithLedger`; additive `transport`/`phase` fields on ledger entries; per-day ($10) / per-issue ($1) / per-PR ($2) sub-caps in addition to monthly $80/$100; committed-but-versioned `tests/e2e/.llm-spend-ledger.json`; `@anthropic-ai/sdk@0.100.1` EXACT pin; ESLint `no-restricted-imports` guard; CODEOWNERS pins on 5 load-bearing paths.
- **Deps-update + cost-ledger-snapshot workflows (Phase 40):** Monday 09:00 UTC `v40-deps-update.yml` querying frozen watchlist via `npm outdated --json`; security/minor partitioning via two `peter-evans/create-pull-request@v8` invocations; `deps-update-gate` job slot for ruleset; daily 02:00 UTC `v40-cost-ledger-snapshot.yml` with `[skip ci]` commit pattern parity-gated against `e2e-weekly-digest.yml`; verifier `pdfjs-dist` EXACT-pinned separately from extension's via `verifierDeps`; `v40-pdfjs-frame-shift.yml` regression-suite-twice on `auto-fix:pdfjs-bump` PRs.
- **Verifier-gate workflow + CLI shim (Phase 41):** `v40-verifier-gate.yml` on `auto-fix/*` branches; 3× affected-case verifier check at Tier A/B + 76-case regression in parallel; diff-size cap (200 LOC src / 50 LOC tests); diff-guard regex bank pinning 6 LOCKED paths; `scripts/verify-single-case.mjs` transport-pure CLI wrapper preserving VFY-02 verifier isolation; pure-function FORBIDDEN_PATHS and PR-body parser ready for Phase 42 import.
- **fix-prompt-builder + WRONG_CITATION vertical slice (Phase 42):** `lib/fix-prompt-builder.js` with `<issue_body_untrusted>` envelope + FORBIDDEN_DELIMITERS escape; frozen `PROMPT_SCAFFOLDS` registry (WRONG_CITATION primary + 4 skip-class returns); ESLint purity guard; `scripts/auto-fix.mjs` core dispatcher with `git apply --check`, branch-existence idempotency, fix_attempts cap of 3; local end-to-end on WRONG_CITATION (live demo deferred to Phase 47).
- **Auto-fix workflow + draft PR (Phase 43):** `v40-auto-fix.yml` on `issues.labeled('triage')` via `peter-evans/create-pull-request@v8` with `<!-- affected_cases -->` HTML comment; per-issue concurrency group; two-commit ledger split for atomic [skip ci].
- **Auto-promote + triple-gate (Phase 44):** `v40-auto-promote.yml` on `merged && contains(labels, 'auto-fix:verified')`; `scripts/auto-fix-promote.mjs:assertTripleGate()` enforces verified-label + merged + triage-sourced BEFORE `runPromote({_skipCiGuard:true})`; follow-up PR adds case to `test-cases.js` via SEPARATE PR (NEVER direct-to-main); post-merge verifier re-check on `main` HEAD; `gh issue close` on source.
- **Per-ERROR_CLASS expansion + FLAKE 5-state machine (Phase 45):** 4 more PROMPT_SCAFFOLDS (LLM_HALLUCINATED_SELECTION, WORKER_FALLBACK_FAILED, GOOGLE_DOM_DRIFT, HARNESS_ERROR) via shared `buildScaffoldSystemPrompt` helper; pure `classifyRerunOutcomes` 5-state classifier (CONFIRMED_BUG / LIKELY_BUG / INTERMITTENT / FLAKE / FLAKE_ESCALATION + FLAKE_SUPPRESSED) sibling-exported on `triage-classifier.js`; rolling 10-element ring buffer; FLAKE_ESCALATION after N=3 re-files with 30-day suppress; FORBIDDEN_PATHS extended 6→8.
- **/gsd:fix-issue local UX + ledger v2 dashboard (Phase 46):** `npm run fix-issue <n>` wraps `auto-fix.mjs --transport subscription` for free Max-5 iteration; subscription mode refuses push without explicit `--push`; deterministic ledger dashboard regenerated by Phase 40 daily snapshot; committed-ledger privacy audit (PASS, zero hits across 6 regex patterns).
- **v4.0 cleanup (Phase 47):** 5 ARCHITECTURE §4 touchpoint contracts pinned by 15 vitest regression assertions; 3 INT-FIX commits (LEDGER ledger-reset + CAL dynamic-month + LOCK package-lock static-grep); 8/8 v4.0 phases cold-stamped `nyquist_compliant: true`; UAT-47-c FLAKE escalation LIVE PASS via Strategy A+B; 4 DEFERRED runbook stubs (a/b/d/e) per locked CONTEXT (requires-push); CODEOWNERS pin-order test; live `gh api` branch-protection audit; `.planning/v4.0-MILESTONE-AUDIT.md` bootstrapped; **BLOCKER-01 + WARNING-01 fixed inline at milestone audit** when integration check surfaced the missing `auto-fix:verified` label producer in verifier-gate.

### What Worked
- **The Phase 38 cleanup-phase pattern, transposed to v4.0.** Phase 47 was scoped as a 4-track CONTEXT lock (CLEANUP-01..04) with batch-table grey areas — produced clean atomic INT-FIX commits, gap-handling rules ("document inline, do not block"), and 4 separate plans that mapped 1:1 to the requirements. Reusing the Phase 38 plan templates verbatim made `gsd-plan-phase` mechanical.
- **The `_skipCiGuard` triple-gate was the single load-bearing trust decision** and survived end-to-end verification at multiple layers: vitest unit test (TP-05), script-level `assertTripleGate()` that throws before `runPromote` reached, workflow-level `if:` filter as defense-in-depth, and CODEOWNERS protection on the call site. When BLOCKER-01 surfaced at audit, the script-level gate was correctly rejecting unauthorized promotes even though the workflow filter was dead code — the layered defense actually worked.
- **State B cold-stamp for Nyquist was the right call** when no draft VALIDATION.md existed for any v4.0 phase. `gsd-validate-phase` drafted + stamped in one pass per phase, surfacing zero gaps across all 8 — the validation strategy lived in `47-VALIDATION.md` (authored at plan-phase time) and the per-phase contracts were mechanically derivable from the existing PLAN+SUMMARY+VERIFICATION trio.
- **Audit-milestone integration check surfaced BLOCKER-01** that the per-touchpoint TP-* tests, the per-plan code review, and the deferred UAT-47-a all missed. The cross-workflow trace ("does verifier-gate actually emit the label that auto-promote requires?") was the right granularity — neither the per-touchpoint tests (consumer-side string presence) nor the unit-level executor agents (single-script focus) had the visibility to catch it. The integration checker IS load-bearing as a gate at milestone close.
- **Atomic INT-FIX-* commit pattern + verbatim Phase 38 commit-message format** worked across all 5 v4.0 INT-FIX commits (LEDGER/CAL/LOCK + BLOCKER-01 + WARNING-01). Git-blame on any of them surfaces the root cause + remediation in one read.

### What Was Inefficient
- **The TP-05 vitest test was narrowly scoped to consumer-side string presence** in `auto-fix-promote.mjs` — it confirmed the script *checks* for `'auto-fix:verified'` but did not confirm any *producer* emits it. The cross-workflow contract was load-bearing but unrepresented in the test layer until BLOCKER-01 was fixed inline at audit. **Pattern lesson:** every cross-workflow seam needs BOTH a consumer-side AND a producer-side test pinning the literal string; matching them is what catches drift.
- **UAT-47-a was correctly DEFERRED to post-push, but that deferral meant BLOCKER-01 stayed latent through verification.** The audit's `v4.0-MILESTONE-AUDIT.md` initially asserted "5/5 flows, 0 broken" because the per-touchpoint tests passed and the live end-to-end check was deferred. The locked-decision deferral was right (workflows don't exist on origin) — but **the gap surfaced because the integration check ran the cross-workflow trace anyway.** Future cleanup phases should run an integration-checker pre-flight even when live UAT is deferred.
- **Worktree base drift and CWD drift were real, recurring costs** during execution. Plan 42-01, 42-04, 45-03, 46-* all hit one or both during executor dispatch. The `<worktree_branch_check>` block at the top of every executor prompt caught and recovered most cases automatically, but they consumed token budget. The fact that they recurred across phases is the signal — the pattern needs to live in `gsd-executor` agent skill, not be re-injected per dispatch.
- **`scripts/auto-fix.mjs` hardcoded `TRANSPORT = 'sdk'` for auxiliary ledger entries** (caught as WARNING-01 at audit). The cost-bearing call via `invokeClaudePWithLedger` self-tagged correctly, but 7 auxiliary `appendLedgerEntry` sites (diff-guard violations, malformed-diff, idempotency-hits, cap-block) inherited the module-level constant unchanged. **Pattern lesson:** when a script accepts a runtime flag that affects telemetry tagging, EVERY auxiliary write needs to thread that runtime value — not inherit from a module-load-time default. Worth a generic "module-load constant for runtime-varying tags" linter rule.

### Patterns Established
- **5 ARCHITECTURE §4 touchpoints catalogued as the exhaustive list** with producer file:line → consumer file:line → contract → vitest regression test. This becomes the canonical pattern for any cross-phase / cross-milestone integration surface: name them in ARCHITECTURE.md before implementation, pin them with tests at cleanup phase. Future milestones can use the touchpoint catalog itself as the audit checklist.
- **Triple-gate exemption pattern for legitimate CI-side bypasses** of human-gate invariants. When CI legitimately needs to perform an action normally gated by human review (`runPromote` in CI), the gate exemption gets reconstructed as a triple-assertion of independent signals (label + merged + source-tag). Each leg is independently checkable; gateway script throws before reaching the bypass call.
- **INVERSE CI gates on dual-transport wrappers** — `invokeAnthropicSdkWithLedger` runs ONLY when `CI=true` OR `--force-api`; `invokeClaudePWithLedger` runs ONLY when NOT-CI. The gates are siblings in `llm-driver.js`; choosing the wrong transport for the environment fails fast with a clear error. Generalizable to any dual-mode primitive where the two modes should not coexist at runtime.
- **Per-day / per-issue / per-PR sub-caps as additive layers on top of monthly cap** — each sub-cap is an independent boundary check; collectively prevents single-event budget exhaustion while preserving the monthly aggregate ceiling. Useful template for any rate-limited resource where coarse and fine-grained budgets need to coexist.
- **`peter-evans/create-pull-request@v8` as the workflow-level "atomic branch + commit + push + PR" primitive** — used 3 times in v4.0 (auto-fix, deps-update, auto-promote follow-up). Pinning the major-version (`@v8`) and requiring `draft: true` for trust-invariant PRs gives a clean idempotent contract.
- **5-state classifier with rolling ring buffer + suppression-window state file** — replaces v3.1's binary CONFIRMED/FLAKE with a 5-state machine that captures stability gradient and suppression cooldowns. The ring buffer keeps history bounded; the suppression state file persists cooldown across runs. Pattern reusable for any classifier where state transitions depend on recent history.
- **Cold-stamp State B for Nyquist when no draft VALIDATION.md exists** — `gsd-validate-phase` reconstructs the per-task verification map from PLAN+SUMMARY+VERIFICATION inputs in one pass, equivalent end state to State A (draft-first). Removes the "must draft VALIDATION.md before plan-phase" pre-requirement when the phase already has a stable artifact set.

### Key Lessons
1. **Cross-workflow seams need PRODUCER + CONSUMER pinning.** TP-05 pinned only the consumer side of `auto-fix:verified`; BLOCKER-01 was the producer side missing for weeks before audit caught it. Future cross-workflow contracts need symmetric pinning: a vitest test asserting workflow A *applies* the label AND a vitest test asserting workflow B's filter expects the *same literal string*. Matching them in one test file is even better.
2. **Deferred live UATs are correct deferrals, but require an integration-check pre-flight.** UAT-47-a was rightly deferred to post-push (workflows don't exist on origin yet). But the deferral meant BLOCKER-01 would have surfaced on first production run — a guaranteed silent failure. Run the cross-workflow integration check at milestone audit even when the live UAT is deferred; the audit catches what the deferred UAT was going to catch.
3. **Atomic INT-FIX-* pattern scales beyond Phase 38.** v3.1 Phase 38 had 3 INT-FIX commits (DIGEST-04, QUARANTINE_REPORT_FILENAME, e2e-nightly upload-artifact). v4.0 Phase 47 had 5 (LEDGER, CAL, LOCK, BLOCKER-01, WARNING-01). The `fix(<phase>-<scope>): <TAG> — <one-line>` format with root-cause analysis in the commit body became the contract — git-blame is the audit trail.
4. **Locked CONTEXT decisions at smart-discuss time prevent scope creep at execute time.** Phase 47's 4 grey-area accepts (UAT scope, test regressions, Nyquist scope, plan structure) became the executable spec. When the executor surfaced "should I also fix WARNING-01?" the answer was already in CONTEXT (yes — Test 48 + INT-FIX-CAL + INT-FIX-LOCK pre-locked). No mid-phase re-litigation.
5. **The autonomous-workflow `gaps_found` gate works.** When audit-milestone surfaced BLOCKER-01, the workflow correctly halted at the AskUserQuestion gate. The user's decision ("Fix BLOCKER-01 + WARNING-01 inline") triggered an atomic fix-and-re-audit cycle; the milestone closed cleanly afterward. The gate didn't paper over the gap — it forced an explicit decision.
6. **Test suite growth is a load-bearing signal.** v3.1 closed with ~678 tests; v4.0 closed with 1134 tests across 70 files (+456 tests). The growth maps 1:1 to the new surface areas: each PROMPT_SCAFFOLD, ledger sub-cap, workflow contract, and touchpoint got its own pinning test. The TP-* + INT-FIX-* + BLOCKER-01 + WARNING-01 tests together pin the 5 cross-phase seams + 3 fragility fixes + 2 audit-surfaced gaps. This is the foundation for v4.1 confidence.

### Cost Observations
- Model mix: `balanced` profile (Opus 4.7 orchestrator, sonnet executors, sonnet researcher/checker/verifier/code-reviewer/integration-checker)
- LLM API spend: pre-Phase-47, zero API calls (subscription-only via `invokeClaudePWithLedger`); Phase 47 INT-FIX-LEDGER root cause was a local `npm run e2e:explore` invocation that leaked 3 real Opus calls totaling $0.353055 into the committed ledger — reset to seed-only in INT-FIX-LEDGER commit `6957a4e`
- Subscription spend: well within $80 warning threshold across the milestone
- Sessions: ~3 days end-to-end; phases 39-46 ran via `/gsd:autonomous` full-milestone run; phase 47 ran on a fresh session via `/gsd:autonomous --from 47` after the v4.0 session handoff
- Notable: only ONE new npm dependency added across the entire milestone (`@anthropic-ai/sdk@0.100.1`, EXACT pin, ESLint-restricted to `llm-driver.js` only). All workflow tooling layered on existing primitives — `peter-evans/create-pull-request@v8` is the only new GitHub Action dependency. Compare to v3.1 (zero new deps) — v4.0 is a near-zero-dep milestone despite adding 6 new workflows + auto-fix end-to-end loop + dual transport

---

## Milestone: v5.0 — Bug Report Feature

**Shipped:** 2026-06-15
**Phases:** 5 (1–5) | **Plans:** 16 | **Tasks:** 26
**Timeline:** 2026-06-12 → 2026-06-15 (~4 days, 144 commits on `feat/bug-report`)

### What Was Built
- **Worker route + KV schema + privacy compliance (Phase 1):** `POST /report` Cloudflare Worker route with explicit PAY-01 field allowlist (no `ip`/`clientIp`/`userAgent` stored), `BUG_REPORTS` KV namespace at `report:{fingerprint}:{timestamp}` (90-day TTL), SHA-256 fingerprint dedup over a 15-min window (`duplicate_count`), IP-keyed transient rate limit (`rl:{ip}`, 5/60s), server-side-only Discord webhook; Firefox manifest `data_collection_permissions` + privacy-policy "Bug Report Feature" section + CWS store-listing reconciled (BLOCK-01/02/03 resolved).
- **Shared constants + pure payload builder (Phase 2):** `src/shared/report-payload-builder.js` pure function (zero `chrome.*`) as the canonical payload schema contract; frozen `REPORT_CATEGORIES` + `MSG.SUBMIT_REPORT` + `WORKER_REPORT_URL`; Vitest-pinned for schema conformance, [Remove selection text] omission, byte-stable fingerprint reproducibility.
- **Background transport + rate limit + retry queue (Phase 3):** shared `report-transport.js` with disk-first `chrome.storage.local` queue, sliding-window client rate limit (5/10 min), 2s/8s/30s exponential backoff, byte-identical `SUBMIT_REPORT` dispatch across Chrome SW + Firefox background; content scripts never POST cross-origin (XPORT-06 static-grep guard); 29 per-target tests incl. SW-death simulation.
- **Report dialog UI + citation-UI wiring (Phase 4):** Shadow DOM dialog (4-category picker, note + counter, "What's included" payload preview, sticky [Remove selection text] toggle, focus trap + dismiss paths), Report button auto-surfacing on no-match/yellow/Worker-error with green-hidden invariant (TRIG-04), 20-entry error ring buffer, DOM/PDF diagnostic enrichment.
- **Options Debug Mode + popup fallback + live UAT (Phase 5):** options `debugMode` toggle (live per-citation read), popup "Report a problem" → options `#report` page-mode dialog (same builder + flow, no Shadow DOM); live UAT-01..06 PROVEN against production `pct.tonyrowles.com`.

### What Worked
- **Server-first, UI-last build order.** Phases 1→2→3 shipped the entire submission pipeline (Worker → KV → Discord, payload contract, transport layer) testable end-to-end before any UI existed. By the time the Phase 4 Shadow DOM dialog landed, the only new risk was the UI itself — the data path was already proven by unit tests.
- **A pure payload-builder as the schema contract.** Putting the allowlist in a zero-`chrome.*` function (Phase 2) meant schema conformance, the [Remove selection text] opt-out, and fingerprint reproducibility were all Vitest-pinnable without a browser — and both extension surfaces (content dialog + options page) shared one source of truth.
- **Live UAT against production closed the DoD honestly.** UAT-01..06 ran real submits on Google Patents against the deployed Worker; KV records + Discord embeds + no-IP asserts + cross-browser parity (Chrome/149 + Firefox/151) gave concrete evidence rather than "tests pass." The `--remote` wrangler-KV gotcha (false-empty local store) was caught and documented during UAT-01.
- **Compliance gates landed in the same commit as the route (Phase 1).** Manifest `data_collection_permissions`, privacy policy, and webhook-URL hygiene shipped atomically with the Worker route — no window where a reviewable AMO contradiction (route exists, manifest says no collection) could be committed.

### What Was Inefficient
- **The milestone close ran without a formal `v5.0-MILESTONE-AUDIT.md`.** Close proceeded on the documented live-UAT PASS evidence instead. Defensible here (DoD was concretely proven), but it meant the open-artifact audit's 10 flagged items had to be triaged by hand at close rather than reconciled earlier.
- **`audit-open` false-positives created close-time noise.** Phase 5's `UAT-RESULTS/RUNBOOK/HANDOFF` were flagged `[unknown]` purely because the query parser can't classify those file formats, and Phase 1's HUMAN-UAT scenarios were resolved by Phase 5 UAT but never re-stamped. The signal (real gaps) was buried under format-classification artifacts.
- **The `milestone.complete` CLI miscounted phases (6 vs 5)** by sweeping in the `999.1` backlog directory, and its auto-extracted accomplishments were unusable ("One-liner:", file paths, a code-review line). The MILESTONES.md entry and STATE.md frontmatter both needed hand-correction.
- **A real interactive bug (Notes-textarea character drop) was found at UAT and deferred, not fixed.** It didn't block (note text persisted via paste) but it's a genuine UX defect in the shipped dialog — carried to v5.1.

### Patterns Established
- **Pure schema-contract module shared across surfaces.** A zero-platform-API builder function as the single source of truth for a wire payload, Vitest-pinned, consumed by every UI surface. Reusable anywhere multiple entry points must emit an identical, compliance-sensitive payload.
- **Disk-first queue before network attempt** as the MV3 service-worker-termination mitigation: write to `chrome.storage.local` BEFORE `fetch`, remove atomically on 201, retry on next extension load. Survives ~30s SW death; proven by explicit stop/restart unit tests on both targets.
- **Compliance-in-the-same-commit invariant.** When a capability has a store-review surface (manifest permissions, privacy policy, secret hygiene), the declaration ships in the same commit as the capability — enforced by grep-based success criteria (`discord.com/api/webhooks` → zero hits; no `ip` field in KV).
- **Production live-UAT runbook with OPERATOR/SCRIPTABLE split.** Pre-fill every scriptable row (build, lint, grep, curl, KV asserts) and leave operator rows for the live browser session; the operator's fingerprints then key the scriptable KV verification. Made a human-in-the-loop UAT mostly machine-verified.

### Key Lessons
1. **Server-first ordering de-risks UI milestones.** Proving the full data path before the UI exists means UI phases carry only UI risk. Worth replicating for any feature that's "form → transport → durable store → notify."
2. **`audit-open` needs format-aware UAT parsing, or close-time triage is manual.** The parser marking valid PASS evidence as `[unknown]` and counting stale cross-milestone quick-tasks made the gate noisier than the actual state. Either teach the parser the UAT-RESULTS format or re-stamp resolved HUMAN-UAT files at phase close so they don't resurface.
3. **The `milestone.complete` CLI's auto-extraction is unreliable for accomplishments and phase counts when a `999.x` backlog dir lives under `phases/`.** Expect to hand-write the MILESTONES entry and correct STATE frontmatter; the CLI is a scaffold, not the final artifact.
4. **A non-blocking UAT bug is still a real bug.** Logging the Notes-textarea character drop kept the DoD honest (criteria met) without papering over a shipped defect — but it should be the first v5.1 fix, not lost in the backlog.
5. **Tag/version namespaces can collide.** The extension's store-release tag `v5.0` (commit `63f6a76` on `main`) is unrelated to the GSD "v5.0 Bug Report Feature" milestone on `feat/bug-report`. Milestone close did NOT create or move a tag. Future milestones should distinguish store-version tags from planning-milestone identifiers explicitly.

### Cost Observations
- Model mix: `balanced` profile (Opus orchestrator, sonnet executors/researchers/checkers/verifiers)
- New npm dependencies: **zero** (sixth consecutive milestone) — built on Web Crypto (`crypto.subtle.digest`), `chrome.storage.local`, background `fetch`, Cloudflare Worker + KV, and `wrangler secret put` for the Discord URL
- Trust invariants held: `assertTripleGate` body byte-unchanged; v40-auto-fix CI stayed `workflow_dispatch:`-only throughout
- Notable: work isolated on `feat/bug-report` (144 commits, unmerged) per the established batch-push workflow; v4.3 auto-fix milestone stayed paused and untouched

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Commits | Phases | Key Change |
|-----------|---------|--------|------------|
| v1.0 | 79 | 4 | Initial development — established patterns |
| v1.1 | ~20 | 3 | Infrastructure + parallel execution — wave-based plans |
| v1.2 | 69 | 6 | Test infrastructure + audit-driven gap closure |
| v2.0 | 52 | 4 | Build pipeline + cross-browser architecture |
| v2.1 | 15 | 2 | CI/CD automation — smallest, fastest milestone |
| v2.2 | 25 | 3 | OCR normalization + gutter matching — accuracy hardening |
| v2.3 | ~15 | 3 | Retro-documentation of already-shipped work — guard tests added |
| v3.0 | ~120 | 6 | Playwright E2E + nightly cron + LLM exploratory scaffolding (not recorded here) |
| v3.1 | 257 | 7 | LLM-driven feedback loop: rerun → triage → issue → quarantine → digest |
| v4.0 | 185 | 9 | Self-healing test suite: auto-fix → verifier-gate → human-merge → auto-promote (BLOCKER-01 caught + fixed at audit) |

### Cumulative Quality

| Milestone | Tests | Accuracy | Known Limitations |
|-----------|-------|----------|-------------------|
| v1.0 | 0 | ~95% (manual) | Long selections >500 chars may fail |
| v1.1 | 0 | ~95% (manual) | Duplicated matching functions |
| v1.2 | 95 | 100% (71-case corpus) | Manual screenshot/tile assets pending |
| v2.0 | 303 | 100% (71-case × 3 targets) | Store submissions pending |
| v2.1 | 338 | 100% (CI-validated) | Store submissions pending |
| v2.2 | 461 | 100% (75-case baseline) | s→S OCR gap documented, not implemented |
| v2.3 | 216 src (+13 guards) | 100% (76-case baseline) | All v2.3 work was retroactive capture; no new behavior |
| v3.0 | 461 + Playwright 76-case + fault-injection | 100% (76-case baseline) | LLM exploratory live-test deferred to v3.1 HUMAN-UAT |
| v3.1 | 684 (incl. quarantine schema + rerun-validator + triage-classifier + digest aggregator) | 100% (76-case golden + 0-case quarantine empty corpus) | Quarantine corpus empty at close (no CONFIRMED findings yet); store submissions still pending |
| v4.0 | 1134 across 70 files (incl. 5 §4 touchpoint TPs + 3 INT-FIX + BLOCKER-01 + WARNING-01 + UAT-deferred guard + CODEOWNERS pin-order + 8 cold-stamped VALIDATION.mds) | 100% (76-case golden + auto-fix loop wired end-to-end after BLOCKER-01 fix) | 4/5 HUMAN-UATs deferred to post-push readiness gate; bypass_actors=1 and required_status_checks rule absent on ruleset (both v4.1 readiness-gate items) |

### Top Lessons (Verified Across Milestones)

1. **Code duplication creates integration gaps.** v1.0 predicted build step would help; v1.2 confirmed it; v2.0 finally resolved it with shared modules + esbuild. Pattern closed.
2. **Human-verify checkpoints catch bugs that code review misses.** Confirmed in all four milestones. v2.0 human UAT found zero issues — architecture was sound.
3. **New middleware must be wired into ALL code paths.** v1.1 cache routing bug, v1.2 wrap-hyphen offscreen gap — same class of bug. v2.0's shared module architecture eliminates this class of bug.
4. **Test infrastructure investment pays off immediately.** v1.2 golden baseline enabled confident algorithm changes; v2.0 cross-browser configs proved bundling correctness.
5. **ROADMAP.md plan checkboxes fall out of sync.** Observed in v1.1, v1.2, and v2.0 — 4th consecutive milestone. Needs automation or removal.
6. **E2E browser testing is essential for extension development.** Integration bugs invisible to code review in all milestones.
7. **Phased architecture evolution beats big-bang rewrites.** v2.0's extract → build → port → validate sequence kept each phase independently verifiable.

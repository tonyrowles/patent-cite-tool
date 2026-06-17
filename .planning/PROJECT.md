# Patent Citation Tool

## What This Is

A cross-browser extension (Chrome + Firefox) for patent professionals that generates precise column:line citations (for granted patents) or paragraph citations (for published applications) by highlighting text on Google Patents. Built with an esbuild pipeline from shared source code, supports silent clipboard mode (Ctrl+C), USPTO eGrant API fallback via Cloudflare Worker, shared server-side cache via Cloudflare KV, OCR-aware normalization (Tier 0b) and gutter-tolerant matching (Tier 5), and 100% accuracy on a 75-case cross-browser golden baseline. Ships an in-product bug-report affordance that routes auto-captured diagnostic bundles to a private Cloudflare-backed observability pipeline (KV + Discord) for maintainer triage.

## Core Value

Highlight text on Google Patents, get an accurate citation reference instantly — no PDF downloading, no manual counting.

## Current Milestone: Planning next (v6.0 shipped 2026-06-17)

**v6.0 goal (achieved):** Ship a public web page on `tonyrowles.com` where a user enters a patent number + a text passage and gets back the exact column:line citation — reusing the extension's deterministic matching core (no LLM, 100% deterministic position lookups). Expanded the project identity from "browser extension" → "patent citation tooling (extension + webapp)." Live at `https://cite.tonyrowles.com`.

**Target features:**
- Extract the shared deterministic core (`src/shared/matching.js`, `src/offscreen/position-map-builder.js`, `src/offscreen/pdf-parser.js`) into a workspace/package consumed by both the extension and the webapp — refactor only, no behavior change, guarded by the existing golden corpus.
- Rotate the compromised hardcoded `PROXY_TOKEN` (`src/offscreen/offscreen.js`) and move it server-side — blocking security gate before any public exposure.
- Core webapp flow: patent number + passage → citation with confidence indicator, parsed client-side via PDF.js.
- Batch mode: multiple passages for one patent at once.
- Copy-to-clipboard + the extension's existing citation-format options.

**Key context / constraints:**
- Same repo (not a new project); reuse the existing `pct.tonyrowles.com` Cloudflare Worker (USPTO proxy + KV cache) as a thin backend.
- Client-side compute (PDF.js in the browser); Worker stays a thin proxy.
- Granted US patents only for v1; published applications show a clear "not supported yet" message (no server-side `[XXXX]` paragraph-marker path in v1).
- "v5.1" remains reserved for the deferred auto-fix resumption + bug-report ingestion work (v4.3 carry-over).

## Last Shipped: v6.0 Standalone Citation Webapp (Shipped 2026-06-17)

Shipped a standalone citation webapp live at `https://cite.tonyrowles.com` (Cloudflare Workers Assets) — enter a granted patent number + passage, get the exact column:line citation computed client-side via the shared deterministic core (no LLM, no token in the browser). Rotated the compromised `PROXY_TOKEN` to a build-time esbuild `define` + live secret; split the Worker's global Bearer gate into per-route auth (Origin-authed `/webapp/pdf` + dual-auth `/cache`, rate limits, daily KV-write guard, published-application 400); extracted the three deterministic core modules into `src/shared/` with a `configurePdfWorker(url)` seam (golden corpus byte-identical; CORE-04 browser worker-thread test green); built the single-first webapp (cache-first pipeline, batch mode, confidence chips, format toggle, copy-to-clipboard); and added a "Citation Webapp" privacy-policy section. **Live production UAT PASSED** (real patent → correct citation, KV cache populated, 429 rate-limit, no `Authorization` header). 4 phases (6-9), 9 plans, 33/33 requirements; zero new npm dependencies (seventh consecutive milestone).

### Previously shipped: v5.0 Bug Report Feature (2026-06-15)

Gave extension users a low-friction in-product affordance to report citation failures, routing rich auto-captured diagnostic bundles to a private Cloudflare-backed observability pipeline (`BUG_REPORTS` KV durable + Discord webhook notify) for maintainer triage — the inbound signal channel that v5.1's resumed auto-fix work will ingest. **Live UAT-01..06 PROVEN against production `pct.tonyrowles.com` before close** (Discord embeds + KV records verified, no IP stored, server-side dedup + cross-browser parity on Chrome/149 + Firefox/151).

The shipped pipeline: (1) a `POST /report` Cloudflare Worker route with an explicit PAY-01 field allowlist (no `ip`/`clientIp`/`userAgent` stored), `BUG_REPORTS` KV namespace at `report:{fingerprint}:{timestamp}` keys (90-day TTL), SHA-256 fingerprint dedup over a 15-min window (`duplicate_count`), IP-keyed transient rate limit (`rl:{ip}`, 5/60s), and a server-side-only Discord webhook URL; (2) a pure `src/shared/report-payload-builder.js` schema-contract module (zero `chrome.*`, Vitest-pinned for schema conformance + [Remove selection text] omission + fingerprint reproducibility); (3) a shared `report-transport.js` transport layer with disk-first `chrome.storage.local` queue, sliding-window client rate limit (5/10 min), 2s/8s/30s backoff, and byte-identical `SUBMIT_REPORT` dispatch across Chrome SW + Firefox background (content scripts never POST cross-origin — XPORT-06 guard); (4) a Shadow DOM report dialog auto-surfacing on no-match/yellow/Worker-error with a green-hidden invariant (TRIG-04), "What's included" payload preview, sticky [Remove selection text] toggle, focus trap, 20-entry error ring buffer, and DOM/PDF diagnostic enrichment; (5) options Debug Mode toggle + popup "Report a problem" → options `#report` page-mode dialog (same builder + flow). 5 phases (1-5), 16 plans, 26 tasks, ~4 days. 45/45 v1 requirements shipped. Zero new npm dependencies (sixth consecutive milestone). `assertTripleGate` body byte-unchanged; v40-auto-fix CI stayed `workflow_dispatch:`-only throughout. Privacy model: inline disclosure + expandable payload preview, no separate consent modal, user sees exactly what's sent before submitting.

**What's NOT in v5.0 (deferred to v5.1):** auto-promotion of KV reports to GitHub Issues (v5.0 ships the inbound signal channel; v5.1 wires it to the auto-fix triage classifier reusing v3.1 `issue-payload-builder`); the v4.3 auto-fix carry-over (Phase 68 destructive UAT-03 + final spend tally + 17 unpushed Phase 67 commits) per Pattern B versioning. One non-blocking follow-up bug logged: the report-dialog Notes textarea drops characters during typing (likely a content-script keydown handler missing `stopPropagation`) — UAT criteria still met. Full close evidence in `.planning/milestones/v5.0-phases/05-.../05-UAT-RESULTS.md`; deferred-items ledger in STATE.md.

## Paused Milestone: v4.3 Auto-Fix Loop Closure + Capability Expansion (Paused 2026-06-12)

v4.3 shipped 6 of 7 planned phases on `origin/main` before being paused for v5.0. Phases delivered: **Phase 61** (diagnostic-injection mutator extension + `--max-turns` relaxation to ~5 with `--allowed-tools Read,Glob,Grep` cost-discipline substitute), **Phase 62** (forensic-ledger hardening — `source` + `transport` required on all entries + bypass audit probe closing the auxiliary-leak path), **Phase 64** (heuristic-first triage extension toward 8/8 `ERROR_CLASS` coverage), **Phase 65** (expanded fix scaffolds beyond the 5 v4.0 classes), **Phase 66** (A/B winner exit from abstention mode + 3-way transport stratification), **Phase 67** (prompt-iter loop Shape A — capture-and-surface-in-process; FORBIDDEN_PATHS extension PITER-01..05; 17 unpushed commits `5a6630a..5b749b1`, 12/12 code-review findings fixed in atomic commits `4cc0e51..4bec87b`, 206/206 unit tests pass on `main` local). **Phase 68** (destructive UAT-03 + final cleanup of mutator-injected synthetic issues #20/21/22/23 + final spend tally) deferred — blocked on `.planning/sweep-03-04-pass-evidence.yaml` (Phase 61 UAT-01/02 live runbook output not yet captured). Paused intentionally 2026-06-12 to ship the v5.0 bug-report observability pipeline first; the auto-fix carry-over scope will resume in **v5.1** alongside ingestion requirements driven by v5.0 report volume. Paused phase artifacts archived at `.planning/milestones/v4.3-phases-paused/`. v40-auto-fix CI workflow set to `workflow_dispatch:` only (commit `d8d54c4`) while v4.3 is paused.

## Last Shipped: v4.2 Auto-Fix Loop Live (Shipped 2026-06-09)

v4.2 wired the auto-fix loop infrastructure live on `origin/main` so future v4.3 architectural work can validate the loop end-to-end on real triage traffic. Phase 56 extended the cost-ledger schema with `errorClass` (all 7 `auto-fix.mjs` call sites + 2 SDK-path sites) and added a `safeAppendLedger` leak guard that funnels CI/override/subscription-only writes (Phase 60.1 hotfix whitelists `transport: 'subscription'` entries to preserve the v3.1/v4.0 free-iteration flow). Phase 57 redirected `v40-cost-ledger-snapshot.yml` daily snapshots to `ledger-snapshots/daily-${SNAPSHOT_DATE}` branches and added a diff-guard scope-decision fast-path; SWEEP-02 PROVED live on origin/main (commit 0b56ab9). Phase 58 narrowed the `auto-fix-promote.mjs` IMPORTS POLICY allow-list and wired event-sourced outcome ledger entries (`source: 'auto-fix-promoted' + outcome: 'pass'` on success; `source: 'auto-fix-failed' + outcome: 'fail'` on label-flap), `assertTripleGate` sha256-equivalent to Phase 53. Phase 59 shipped the deterministic Node 22 ESM fixture-mutator CLI (`tests/e2e/scripts/inject-defect.mjs`) with `<!-- fp: <12-hex> -->` v2 markers + `&& !isFixtureMutator` suppression at `quarantine-append.mjs:239` + SWEEP-05 phase-tag plumbing. SWEEP-01 PROVED diff-guard rejection live (commit e1d9d88). Phase 60 removed the dead `MODEL` const + finished Phase 51.1's V2 YAML update. 22/25 requirements satisfied; 3/25 (SWEEP-03/04/06) deferred to v4.3 with two documented architectural root-causes — fixture-mutator scope-lock left issues without diagnostic data, and `llm-driver.js:94` `--max-turns 1` prevented Claude from reading source files for real cases. 5 phases (56-60) + 60.1 hotfix, 11 plans, 11 tasks, ~5 days; 46 files changed (+7569 / -46 LOC). Zero new npm dependencies (fourth consecutive milestone).

## Previously Shipped: v4.1 Readiness Gate + Push (Shipped 2026-06-04)

v4.1 landed v4.0's 215 commits on origin/main and hardened the ruleset trust boundary while shipping 3 forward-looking auto-fix improvements. Ruleset 17086676 enforces both required status checks (verifier-gate + deps-update-gate pinned to GitHub Actions App 15368); break-glass §7 runbook committed and live-tested. `assertPartialGate` + `runPartialPromote` ship as SEPARATE entry points (`assertTripleGate` body byte-unchanged; Vitest pins the trust-invariant boundary). Multi-model deterministic ERROR_CLASS routing via `llm-router.js` (frozen `MODEL_ROUTES`; `GOOGLE_DOM_DRIFT` + `LLM_HALLUCINATED_SELECTION` → opus, default sonnet); `a-b-winner.mjs` in abstention mode pending Phase 56 ledger schema. Auto-Fix Pipeline `<details>` section in weekly digest with 7 NaN-guarded observable metrics. Two emergent hotfixes (51.1 + 51.2). 9 phases (48-55) + 2 hotfixes, 11 plans, ~80 atomic commits in ~2 days; 4 UATs deferred to Phase 56 per documented decisions. Zero new npm dependencies (third consecutive milestone).

## Requirements

### Validated

- ✓ Highlight text on Google Patents and receive column:line citation for granted US patents — v1.0
- ✓ Highlight text on Google Patents and receive paragraph citation for published US applications — v1.0
- ✓ Parse pre-OCR'd patent PDFs to build column/line maps (no client-side OCR) — v1.0
- ✓ Detect two-column specification section (skip cover page, preliminary material, figures) — v1.0
- ✓ Handle column boundaries — produce range citations like 4:55-5:10 when selection spans columns — v1.0
- ✓ Best-effort text matching with confidence indication (green/yellow/red) — v1.0
- ✓ In-browser PDF parsing via PDF.js offscreen document — lightweight, no backend — v1.0
- ✓ Configurable trigger mode (floating button, auto, context menu) — v1.0
- ✓ Local browser cache via IndexedDB for parsed patents — v1.0
- ✓ Optional patent number prefix in citation format — v1.0
- ✓ Silent mode — Ctrl+C appends citation to clipboard text; toast on low confidence/no match — v1.1
- ✓ USPTO eGrant API fallback via Cloudflare Workers proxy (keeps API key secret from end user) — v1.1
- ✓ Server-side shared cache on Cloudflare — analyzed patents benefit all users — v1.1

### Validated

- ✓ Proper extension icon set (16/32/48/128px) with three-state toolbar transitions — v1.2
- ✓ Dedicated options page with auto-save feedback and privacy policy link — v1.2
- ✓ Privacy policy hosted at stable public URL (GitHub Pages) — v1.2
- ✓ Store listing text, permission justifications, and dashboard guidance — v1.2
- ✓ Vitest test harness with 71-case patent fixture corpus and golden baseline — v1.2
- ✓ Manual accuracy audit across 8 patent categories (71 cases) — v1.2
- ✓ Algorithm fixes: gutter contamination strip and wrap-hyphen normalization — v1.2

### Validated

- ✓ esbuild build pipeline — src/ → dist/chrome/ and dist/firefox/ — v2.0
- ✓ Shared code extraction into src/shared/ — zero duplication between Chrome/Firefox — v2.0
- ✓ Firefox MV3 extension with background script absorbing offscreen logic — v2.0
- ✓ IndexedDB graceful degradation for Firefox private browsing — v2.0
- ✓ Cross-browser validation — 71-case corpus passes both builds + web-ext lint — v2.0

### Validated

- ✓ GitHub Actions CI/CD pipeline — build, test (338 tests + lint), and store-ready ZIP packaging on every push/PR — v2.1

### Validated

- ✓ OCR-aware normalization — `normalizeOcr` with 5 prose-safe pairs applied as Tier 0b preprocessing to both selection and concat — v2.2
- ✓ Concat refactor — `buildConcat` extracted as shared helper, single source of truth for concat construction — v2.2
- ✓ Gutter-tolerant matching — Tier 5 last-resort fallback strips stray gutter line numbers with 0.85 confidence cap — v2.2
- ✓ 75-entry golden baseline with OCR-heavy patent (US6324676) and synthetic gutter test coverage — v2.2
- ✓ Merged/split-word handling verified via whitespace-stripped matching — v2.2

### Validated (v2.3)

- ✓ **ACCY-04**: Citation tool produces correct column numbers for granted patents whose PDFs lack printed column headers — Validated in Phase 23: Column Inference for Headerless PDFs
- ✓ **ACCY-05**: Position map cache invalidates when column-extraction logic changes (CACHE_VERSION bump) — Validated in Phase 23: Column Inference for Headerless PDFs
- ✓ **FOX-06**: Firefox extension passes `web-ext lint` with zero AMO-blocking validation errors/warnings — Validated in Phase 24: Firefox AMO Validation Cleanup
- ✓ **CICD-04**: Pushing a `v*` tag triggers an automatic GitHub Release with built artifacts attached — Validated in Phase 25: Automatic Release Workflow

### Validated (v3.0)

- Playwright + Chromium E2E harness that loads the unpacked extension and drives Google Patents pages — Phase 26
- Deterministic regression mode against the 76 golden patents (local + nightly cron) — Phase 27
- Independent PDF re-parse verifier (separate code path from the extension pipeline) — Phase 28
- Nightly GitHub Actions cron with auto-issue filing on failure — Phase 29
- Failure diagnostics capture: page screenshot, DOM snapshot, PDF page snippet for the cited column:line — Phase 27/28
- USPTO/Worker fallback fault-injection test (catches silent regressions in the Cloudflare Worker path) — Phase 30
- LLM exploratory mode using headless `claude -p` (Max 5 credit pool, local-dev only, hard $100 monthly cap with warning at $80, live-test deferred to HUMAN-UAT) — Phase 31

### Validated (v3.1)

- ✓ **UAT-01..03**: `npm run e2e:explore` runs against the Max 5 subscription credit with ≥10 real iterations; spend ledger tracks each `claude -p` against the $80/$100 monthly cap; `e2e:upload-llm-report` helper triggers nightly workflow via workflow_dispatch — Phase 32
- ✓ **RERUN-01..04**: Pure-function 3-replay re-run validator (`rerun-validator.js`) via verifier-only path (no browser); `rerun-report.json` per anomaly with 2/3+ → CONFIRMED, 0–1/3 → FLAKE; `llm-report.json` schema extended with `scroll_y` / `viewport_*` / `selected_node_xpath`; ESLint `no-restricted-imports src/` guard extended to cover the validator module — Phase 33
- ✓ **TRIAGE-01..06**: Heuristic-first classifier resolves 6/8 ERROR_CLASSES without LLM; `verifier_strong_agreement` (Tier A/B only) prevents Tier C masking; cluster pre-filter routes N≥5 same-errorClass findings to a single grouped LLM call; subscription-local-only via `invokeClaudePWithLedger` with CI guard; `triage-report.json` schema; PDF text wrapped in `<patent_data>` XML tags as prompt-injection defense — Phase 34
- ✓ **ISSUE-01..04**: `lib/issue-payload-builder.js` assembles 4-section issue body (reproducer / verifier disagreement / LLM rationale / golden diff) within per-section char budgets; `scripts/e2e-report-issue.mjs --source triage` applies errorClass label; fingerprint scheme extended additively with v1+v2 dual-search; fingerprint comment on line 1 of body — Phase 35
- ✓ **QUAR-01..05**: `tests/e2e/test-cases-quarantine.js` with schema-guard; idempotent `quarantine-append.mjs` with `stable_runs` counter; non-gating quarantine Playwright project with `retries: 0` and `continue-on-error: true` (filings labeled `e2e-quarantine`); auto `quarantine:ready-for-promotion` label at `stable_runs ≥ 3`; human-gated `promote-from-quarantine.mjs` — Phases 35/36
- ✓ **ORCH-01..05**: `scripts/run-triage-pipeline.mjs` chains rerun → triage → issue-file → quarantine-append (exits 0 always); nightly cron consumes `llm_run_id` workflow_dispatch input; timeout budget documented and within job limits — Phase 36
- ✓ **DIGEST-01..04**: Monday 07:00 UTC GitHub Discussion (or `e2e-digest` labeled issue fallback) + committed markdown file with findings count, classification breakdown, top 3 failure categories, quarantine growth, cost vs cap — all within 50 lines, anchored on frozen `SUMMARY_KEYS` array — Phase 37
- ✓ **v3.1 cleanup**: 3 integration fragility warnings resolved (QUARANTINE_REPORT_FILENAME ESM, DIGEST-04 self-ref guard, `e2e-nightly` upload-artifact quarantine clause); Nyquist VALIDATION coverage stamped on 5 carry-over phases; 8/8 live human-UAT confirmations (5 PASS, 1 PARTIAL, 1 DONE, 1 DEFERRED) — Phase 38

### Validated (v5.0)

- ✓ **XPORT-01..04, PAY-01..04, LIMIT-01..02**: `POST /report` Cloudflare Worker route behind the existing Bearer `PROXY_TOKEN` gate; `BUG_REPORTS` KV namespace with `report:{fingerprint}:{timestamp}` keys at 90-day TTL; explicit field allowlist (no `ip`/`clientIp`/`userAgent` stored); SHA-256 fingerprint dedup (15-min window, increments `duplicate_count`); IP-keyed transient rate limit (5 req/60s via `rl:{ip}`); best-effort Discord webhook notification with the URL kept server-side only; `report-schema.md` Phase 2 contract; 23-case Vitest suite — Phase 1 (BLOCK-02 webhook hygiene, BLOCK-03 IP-not-in-KV resolved)
- ✓ **PRIV-01..05**: Firefox manifest `data_collection_permissions` declared; privacy policy "Bug Report Feature" section with field-by-field disclosure; "no personal information" claims qualified to normal citation use; Data Sharing names Cloudflare/Discord as processors; CWS store-listing data-use declaration internally consistent across checklist, quick-reference, and body — Phase 1 (BLOCK-01 privacy compliance resolved). Human-judgment items resolved by Phase 5 UAT: AMO required-vs-optional placement (WR-06 — `technicalAndInteraction` → optional, UAT-04-confirmed), patentNumber input-validation scope (CR-01 — accepted as documented scope decision), `web-ext lint` clean on built `dist/firefox/` (PRIV-05 — errors 0/warnings 0 in UAT-04)
- ✓ **PAY-05..07**: `src/shared/report-payload-builder.js` pure function (zero `chrome.*`) establishes the canonical payload schema contract; `MSG.SUBMIT_REPORT` / frozen `REPORT_CATEGORIES` / `WORKER_REPORT_URL` in `constants.js`; Vitest-pinned for schema conformance, [Remove selection text] omission, and byte-stable fingerprint reproducibility — Phase 2
- ✓ **XPORT-05..06, LIMIT-03, QUEUE-01..04**: shared `report-transport.js` with disk-first `chrome.storage.local` queue, sliding-window client rate limit (5/10 min), 2s/8s/30s exponential backoff, byte-identical `SUBMIT_REPORT` dispatch across Chrome SW + Firefox background; content scripts never POST cross-origin (XPORT-06 static-grep guard); 29 per-target tests incl. SW-death simulation — Phase 3
- ✓ **CAP-01..04, TRIG-01..04, PAY-08..09**: Shadow DOM report dialog (4-category picker, note + counter, "What's included" payload preview, sticky [Remove selection text] toggle, focus trap + dismiss paths), Report button auto-surfacing on no-match/yellow/Worker-error with green-hidden invariant (TRIG-04), 20-entry error ring buffer, DOM/PDF diagnostic enrichment — Phase 4
- ✓ **DBG-01..02, CAP-05..06, UAT-01..06**: options `debugMode` toggle (live per-citation read), popup "Report a problem" → options `#report` page-mode dialog (same builder + flow, no Shadow DOM); live UAT-01..06 PROVEN against production Worker (Discord embeds + KV records, no `ip`, server-side dedup, cross-browser parity Chrome/149 + Firefox/151) — Phase 5

### Future

- Chrome Web Store screenshot (1280x800) and promotional tile (440x280)
- Chrome Web Store submission and review
- Firefox Add-ons (AMO) submission and review
- Configurable citation format (4:5-20 vs col. 4, ll. 5-20 vs column 4, lines 5-20)
- Keyboard shortcut for citation (e.g., Ctrl+Shift+C)
- Batch citation mode — queue multiple citations and copy all at once
- Patent family cache reuse — continuation patents share specification text

### Out of Scope

- Running OCR on patents — only parse pre-existing OCR/text layers (only ~2-5% of patents lack text layers)
- ~~Mobile browser support — Chrome desktop extension only~~
- Mobile browser support — desktop browser extensions only (Chrome + Firefox)
- Citation management or organization features — just copy the citation
- Non-US patents — completely different document formats and citation conventions
- AI-powered patent summarization — different product category
- Inline PDF viewer/annotator — Google Patents already shows the PDF
- Raw PDF storage in KV — PDFs are 5-30 MB; store parsed position maps only (10-100 KB)
- Cache/fallback status indicators in UI — deferred, not essential for core workflow
- ~~Full ESM module unification / build step~~ — completed in v2.0 (esbuild pipeline)
- Safari extension — different extension model (Xcode required)
- webextension-polyfill — Firefox supports chrome.* natively; unnecessary dependency
- Build-time minification — keep source readable for extension store review

## Latest Milestone: v4.2 Auto-Fix Loop Live (Shipped 2026-06-09)

Wired the auto-fix loop infrastructure live on `origin/main` so future v4.3 architectural work can validate the loop end-to-end on real triage traffic. Phase 56 extended the cost-ledger schema with `errorClass` (all 7 `auto-fix.mjs` call sites + 2 SDK-path sites) and added a `safeAppendLedger` leak guard that funnels CI/override/subscription-only writes; the v3.1/v4.0 free-iteration subscription flow was preserved via a co-shipped Phase 60.1 hotfix (commit ab2dd34) that whitelists `transport: 'subscription'` entries. Phase 57 refactored `v40-cost-ledger-snapshot.yml` to push daily snapshots to a `ledger-snapshots/daily-${SNAPSHOT_DATE}` branch instead of `main` (Phase 50 ruleset compliance) and added a diff-guard scope-decision fast-path so non-auto-fix PRs from those branches skip the FORBIDDEN_PATHS regex bank; SWEEP-02 PROVED this live on origin/main (commit 0b56ab9). Phase 58 narrowed the `auto-fix-promote.mjs` IMPORTS POLICY allow-list to include `llm-ledger.js` and wired event-sourced outcome ledger entries (`source: 'auto-fix-promoted' + outcome: 'pass'` on success; `source: 'auto-fix-failed' + outcome: 'fail'` on label-flap), with `assertTripleGate` sha256-equivalent to the Phase 53 baseline. Phase 59 shipped the deterministic Node 22 ESM fixture-mutator CLI (`tests/e2e/scripts/inject-defect.mjs`) that creates synthetic `triage`-labeled GitHub issues with `<!-- fp: <12-hex> -->` v2 markers, paired with a single-line `&& !isFixtureMutator` suppression patch at `scripts/quarantine-append.mjs:239` (co-designed in one atomic commit per MUTATOR-04 contract) — plus the SWEEP-05 Decision C plumbing for `--phase` argv on `auto-fix-promote.mjs` and `PHASE_TAG` workflow_dispatch input on `v40-auto-promote.yml`. SWEEP-01 PROVED diff-guard rejection live (commit e1d9d88, PR #19 closed). Phase 60 removed the dead `MODEL` const from `scripts/auto-fix.mjs` and finished Phase 51.1's incomplete V2 YAML update; `npm test` exits 0 at 1252/1252.

**What's NOT in v4.2:** UAT-47-a/b live end-to-end loop evidence is deferred to v4.3 with documented architectural root-cause (see `.planning/milestones/v4.2-MILESTONE-AUDIT.md` + `STATE.md ## Deferred Items (acknowledged at v4.2 milestone close 2026-06-09)`). Three SWEEP-03 attempts (2026-06-06 ANTHROPIC_API_KEY blocker; 2026-06-07/08 subscription transport) surfaced two distinct architectural constraints: (1) the fixture-mutator scope-lock ("issue-creation layer only — does NOT touch FORBIDDEN_PATHS") leaves synthetic issue bodies without the diagnostic data prompt scaffolds require → `apply-check-failed`; (2) `tests/e2e/lib/llm-driver.js:94`'s `--max-turns 1` cost-discipline gate prevents Claude from reading source files for real WRONG_CITATION cases → `error_max_turns`. A repo-wide search confirmed no real `GOOGLE_DOM_DRIFT` issue with a DOM snippet exists in repo history (all 4 such issues are mutator synthetics) — the auto-fix loop's design-intended issue shape has never occurred in production. v4.3 will design and ship together: (A) diagnostic-injection mutator extension + (B) `--max-turns` relaxation with `--allowed-tools=Read` + (C) forensic-ledger schema hardening + (D) synthetic-issue cleanup (#20/21/22/23).

5 phases (56-60) + 60.1 hotfix, 11 plans, 11 tasks, ~5 days. 22/25 requirements satisfied; 3/25 (SWEEP-03/04/06) deferred to v4.3. 6/6 cross-phase wiring chains verified by `gsd-integration-checker`. 46 files changed, +7569 / -46 LOC across `scripts/`, `tests/`, `.github/workflows/`.

## Earlier Milestone: v4.0 Self-Healing Test Suite (Shipped 2026-06-02)

Closed the LLM-driven feedback loop end-to-end on top of v3.1's triage pipeline. The shipped pipeline now: (1) auto-fixes triaged GitHub issues via `v40-auto-fix.yml` (5 ERROR_CLASS PROMPT_SCAFFOLDS, `<issue_body_untrusted>` envelope + FORBIDDEN_DELIMITERS escape, `peter-evans/create-pull-request@v8` draft PRs with affected-cases HTML comment, branch-existence idempotency, fix_attempts cap of 3); (2) re-verifies the proposed branch via `v40-verifier-gate.yml` (3× affected-case at Tier A/B + 76-case regression + diff-size cap + diff-guard regex bank pinning `tests/test-cases.js`, `tests/golden/baseline.json`, etc. to `origin/main`); (3) auto-promotes merged auto-fix PRs to golden via `v40-auto-promote.yml` + `auto-fix-promote.mjs` with triple-gate `_skipCiGuard:true` (verified-label + merged + triage-sourced reconstructs human-gate invariant); (4) FLAKE 5-state machine (`classifyRerunOutcomes`) with rolling 10-element ring buffer, `FLAKE_ESCALATION` after N=3 re-files, 30-day suppression; (5) cost ledger v2 with unified `transport` (`subscription | sdk`) + `phase` fields, per-day/per-issue/per-PR sub-caps, `npm run fix-issue <n>` subscription-local wrapper for free Max-5 iteration; (6) weekly dep-update auto-PRs (`v40-deps-update.yml`) on a frozen watchlist, security/minor partitioning, separate verifier `pdfjs-dist` pin + frame-shift pre-flight. 9 phases (39-47), 26 plans, 53 tasks, ~3 days. Zero new npm deps (`@anthropic-ai/sdk@0.100.1` was the only addition). Two pre-existing live-state branch-protection items (`bypass_actors=1`, `required_status_checks` rule absent) deferred to v4.1 readiness-gate (post-v4.0-push) per locked Pitfall 4 decision.

## Previous Milestone: v3.1 LLM-Driven Product Improvement Loop (Shipped 2026-05-30)

Closed the loop from v3.0's LLM exploratory testing into actionable product fixes. The nightly pipeline now: (1) replays each LLM-flagged anomaly 3× via verifier-only path to confirm reproducibility, (2) classifies findings via heuristic-first hybrid triage (6/8 ERROR_CLASSES with zero LLM, cluster pre-filter on N≥5, Tier C escalation, prompt-injection defense), (3) files richly-structured GitHub issues with reproducer + verifier disagreement + LLM rationale + golden diff (per-section char budgets, fingerprint on line 1), (4) appends CONFIRMED findings to a quarantine corpus that runs non-gating in the nightly cron and auto-tags `quarantine:ready-for-promotion` at `stable_runs ≥ 3` (human-gated promotion to golden via `promote-from-quarantine.mjs`), and (5) publishes a Monday 07:00 UTC weekly analytics digest to GitHub Discussions. 7 phases (32-38), 31 plans, 29 requirements shipped, ~9 days.

## Earlier Milestone: v3.0 Autonomous E2E Testing Agent (Shipped 2026-05-20)

Built a Playwright-driven testing agent that exercises the extension against real Google Patents, with independent PDF re-parse verification, nightly GitHub Actions cron with auto-issue filer, Worker fault-injection coverage, and LLM exploratory mode scaffolding (`claude -p` against Max 5 subscription; live UAT deferred to v3.1). 6 phases (26-31), 30 plans, 32 requirements shipped. Only non-functional source changes (data-testids + `X-PCT-Test-Mode` header).

## Context

Shipped v4.0 atop ~31,440+ LOC across `src/`, `scripts/`, `tests/` (JavaScript/HTML/CSS/JSON/YAML). v4.0 added ~3,500 LOC across `scripts/auto-fix.mjs`, `scripts/auto-fix-promote.mjs`, `scripts/verify-single-case.mjs`, `scripts/check-deps-and-pr.mjs`, `scripts/build-ledger-dashboard.mjs`, `tests/e2e/lib/fix-prompt-builder.js`, plus 6 new `v40-*.yml` workflows.
Tech stack: Chrome MV3, Firefox MV3 (WebExtensions), esbuild, PDF.js v5, Shadow DOM, IndexedDB, offscreen document API (Chrome), Cloudflare Workers, Cloudflare KV, Vitest (1134 tests across 70 files), web-ext, sharp, Playwright + Chromium, headless `claude -p` (Max 5 subscription, local-dev only, $80/$100 monthly cap), `@anthropic-ai/sdk@0.100.1` EXACT (CI/auto-fix workflows only, ESLint-restricted to `llm-driver.js`), `peter-evans/create-pull-request@v8`, GitHub Actions.
Architecture: src/ → esbuild → dist/chrome/ + dist/firefox/. Shared modules in src/shared/ (constants, matching). Firefox uses background script instead of offscreen document. CI via GitHub Actions: nightly cron runs deterministic regression (76 golden patents) + fault-injection + (when `llm_run_id` provided) triage pipeline (rerun → triage → issue-file → quarantine-append) + non-gating quarantine spec. Monday 07:00 UTC weekly digest workflow publishes to GitHub Discussions.

- **Google Patents HTML vs PDF mismatch**: Handled with fuzzy matching (exact → whitespace-stripped → punctuation-agnostic → bookend → Levenshtein). Long selections (>500 chars) may fail when texts genuinely diverge.
- **Patent PDF structure**: Cover page → preliminary material → figures → two-column specification. Bimodal x-coordinate analysis detects spec pages; dynamic gutter detection finds column boundaries.
- **Column/line layout**: Document-wide column numbering from printed PDF headers. Y-coordinate clustering with 3pt tolerance for line grouping. Claims section detected via text markers.
- **Published applications**: DOM-only paragraph citation — no PDF fetch needed. TreeWalker scans for [XXXX] markers.
- **Silent mode**: Pre-computes citation on mouseup, reads synchronously in copy event handler. Toast feedback for success/failure.
- **USPTO fallback**: Three trigger points (no DOM link, Google fetch failure, no text layer) all route to Cloudflare Worker proxy.
- **Server cache**: Check-before-fetch with 3s timeout, fire-and-forget upload after parse, existence-check write protection.
- **Accuracy**: 100% on 75-case test corpus (10 categories: pre-2000, modern, chemical, claims, cross-column, repetitive, short, long, ocr, gutter). Gutter contamination, wrap-hyphen normalization, OCR normalization, and gutter-tolerant matching applied.
- **Testing**: Vitest with golden baseline snapshot testing, off-by-one tier classification, per-category accuracy reports. 461 tests across 4 suites.
- **Distribution**: Store-ready with privacy policy, listing copy, extension ZIP. Pending screenshot/tile assets and Chrome Web Store submission.

## Constraints

- **Platform**: Chrome + Firefox extensions (Manifest V3 / WebExtensions)
- **Performance**: In-browser PDF.js parsing in offscreen document — fast enough for real-time use
- **Data source**: Google Patents PDF primary; USPTO eGrant API fallback via Cloudflare Workers proxy; Cloudflare KV shared cache
- **Accuracy**: Best-effort matching with confidence indication — citations go into legal filings

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Client-side PDF.js in offscreen document | Avoids backend infrastructure; MV3-compatible via offscreen API | ✓ Good — fast parsing, no server needed |
| Shadow DOM (closed mode) for citation UI | CSS isolation from Google Patents Polymer components | ✓ Good — no style leakage |
| DOM-based paragraph citations for pub apps | Published applications don't need PDF parsing — DOM has paragraph markers | ✓ Good — instant, no fetch needed |
| Document-wide column numbering from PDF headers | Printed column numbers are authoritative vs sequential counting | ✓ Good — matches attorney convention |
| Word-overlap scoring for disambiguation | Character-level scoring fails on HTML/PDF whitespace divergence | ✓ Good — robust disambiguation |
| Bookend matching for long selections | Full fuzzy match hangs on >100 chars; first/last 50 chars with span validation | ✓ Good — handles most long selections |
| ~~Dual-context constants module~~ | ~~Classic script globals + ES module import from same file~~ | Resolved in v2.0 — esbuild bundles shared ESM modules |
| ~~Duplicated matching functions (content + offscreen)~~ | ~~Offscreen ES module cannot share classic script globals~~ | Resolved in v2.0 — src/shared/matching.js is single source |
| esbuild with IIFE content scripts + ESM background | Content scripts cannot use ES modules in Chrome MV3; IIFE wrapping works | ✓ Good — clean bundle separation |
| Separate Chrome/Firefox manifests | Too many differences (permissions, CSP, background key) for patch approach | ✓ Good — clear separation of concerns |
| Firefox background script absorbs offscreen logic | Firefox has no offscreen API; background script can use full APIs | ✓ Good — simpler architecture for Firefox |
| IndexedDB detect-once degradation | Single idbAvailable flag on first error; all IDB ops silently skipped | ✓ Good — graceful private browsing support |
| Per-target vitest alias configs | Redirect src/shared imports to dist/ bundles without modifying test files | ✓ Good — proves bundling correctness |
| No webextension-polyfill | Firefox natively supports chrome.* namespace | ✓ Good — zero extra dependencies |
| GitHub Actions CI with 4 named test steps | Per-suite pass/fail visibility in Actions UI (not single npm test) | ✓ Good — individual failure diagnosis |
| Shell zip with cd+zip for store-ready artifacts | Pre-installed on ubuntu-latest; manifest.json at ZIP root | ✓ Good — no action dependency |
| Concurrency group: head_ref && ref \|\| run_id | PR runs cancelled on new push; main runs never cancelled (unique run_id) | ✓ Good — correct semantics |
| Workflow-level permissions: contents: read | upload-artifact v4 uses ACTIONS_RUNTIME_TOKEN, not GITHUB_TOKEN | ✓ Good — least-privilege |
| normalizeOcr as Tier 0b preprocessing | Apply 5 prose-safe OCR pairs symmetrically to both sides; all tiers benefit without modification | ✓ Good — zero regressions, symmetric design |
| OCR penalty on selChanged only | changedRanges almost always non-empty for real English text; selChanged is the correct necessity test | ✓ Good — baseline preserved at 1.0 confidence |
| buildConcat as shared helper | Single source of truth for concat construction; reused by gutterTolerantMatch | ✓ Good — eliminated duplication |
| gutterTolerantMatch as Tier 5 last-resort | Minimizes false positives; only fires when Tiers 1-4 all fail | ✓ Good — no interference with clean patents |
| Space-anchored gutter strip via survive-mask | Char-by-char boundary check; avoids stripping from patent numbers and chemical quantities | ✓ Good — precise, zero false strips |
| Flat 0.85 confidence for Tier 5 | Forces yellow UI indicator; appropriate uncertainty signal for legal filings | ✓ Good — clear caution signal |
| Local-only caching via IndexedDB | Cloud cache adds backend complexity; local sufficient for MVP | ✓ Good for v1 |
| Citation format: 4:5-20 shorthand | User preference for compact format | ✓ Good — shipped as default |
| Pre-compute citation on mouseup for silent mode | Copy event must be synchronous; async lookup impossible in copy handler | ✓ Good — fast, no visible delay |
| Cloudflare Workers for USPTO proxy | API key stays server-side; free tier sufficient; same provider as KV cache | ✓ Good — deployed in minutes |
| Three-point fallback to USPTO | Covers no-DOM-link, Google-fetch-failure, and no-text-layer scenarios | ✓ Good — comprehensive coverage |
| Shared KV cache with existence-check writes | One user's parse benefits all; free-tier write quota protected | ✓ Good — instant hits for cached patents |
| 3-second cache timeout with silent fallthrough | Unreachable Worker never blocks user; falls through to PDF pipeline | ✓ Good — no user-visible impact |
| Strip bounding box fields from cache entries | Reduces KV payload by ~40%; bbox not needed for citation matching | ✓ Good — smaller payloads |
| Vitest with ESM imports + Chrome API stubs | Test pure functions without browser; vi.stubGlobal for Chrome APIs | ✓ Good — 95 tests, fast CI |
| Golden baseline snapshot testing | Frozen expected outputs detect regressions before/after algorithm changes | ✓ Good — caught issues early |
| Cross-boundary gutter contamination strip | PDF items spanning columns embed gutter numbers; strip before line filter | ✓ Good — fixed systematic failures |
| Wrap-hyphen normalization in matchAndCite | HTML copy artifacts (`trans- actions`) stripped before matching | ✓ Good — 100% accuracy |
| CSS class injection for SVG icon generation | String replacement avoids librsvg version dependency | ✓ Good — reproducible builds |
| Three-state icon via chrome.action.setIcon | Tab-scoped icon transitions; gray default from manifest, no explicit reset needed | ✓ Good — clear visual feedback |
| options_ui with open_in_tab: true | Standard Chrome extension pattern; full-page settings experience | ✓ Good — clean UX |
| GitHub Pages docs/ folder for privacy policy | No separate service; same repo; auto-deployed on push to main | ✓ Good — zero maintenance |
| Zero new npm deps for v3.1 pipeline | Pure Node 22 built-ins on existing primitives (llm-driver, pdf-verifier, e2e-report-issue, Playwright) | ✓ Good — supply-chain risk unchanged across milestone |
| Subscription-local LLM only; `invokeClaudePWithLedger` wrapper required | Cost control + CI guard; direct `invokeClaudeP` calls ESLint-restricted | ✓ Good — caught accidental CI invocation in tests |
| Fingerprint immutability + additive v2 | v1 formula immutable for v3.0 consumers; `findMatchingIssue` dual v1/v2 search during transition | ✓ Good — no retroactive dedup breakage |
| Quarantine spec runs inside `e2e-nightly.yml` (non-gating) | Avoids concurrency group collision; `continue-on-error: true` keeps regression gates intact | ✓ Good — runs every nightly tick |
| Automatic golden promotion blocked | Destroys trust invariant; promotion stays human-gated via `promote-from-quarantine.mjs` | ✓ Good — `quarantine:ready-for-promotion` label surfaces candidates |
| Heuristic-first hybrid triage | 6/8 ERROR_CLASSES resolved without LLM; only ambiguous remainder routed to grouped LLM call | ✓ Good — cost-controlled by cluster pre-filter |
| `verifier_strong_agreement` (Tier A/B only) | Tier C agreements escalate to LLM second-pass — prevents Tier C masking | ✓ Good — Vitest guard test pins behavior |
| PDF text in `<patent_data>` XML tags | Isolates PDF body content from LLM instructions (prompt-injection defense) | ✓ Good — pinned by triage classifier tests |
| Per-section char budgets + fingerprint on line 1 | LLM rationale ≤800, verifier windows ≤600, golden diff ≤400; fingerprint on line 1 prevents >65,536 char overflow displacement | ✓ Good — issue UI renders cleanly |
| Weekly digest via GitHub Discussion + Issue fallback | `gh api graphql createDiscussion` primary; `e2e-digest` labeled issue if Discussions disabled | ✓ Good — verified live at Phase 37 start |
| `aggregateBySummaryKey` helper in weekly-digest.mjs | Maps ERROR_CLASS_SET → SUMMARY_KEYS; seeds passed/harness_error to 0 (synthetic classes); resolves DIGEST-04 self-reference | ✓ Good — Phase 38 INT-FIX-02 |
| Continue phase numbering across milestones (38 → 39) | Mirrors v3.0/v3.1 convention; preserves cross-milestone phase IDs as stable references | ✓ Good — v4.0 phases 39-47 |
| `_skipCiGuard:true` exemption gated by triple-assertion (verified-label + merged + triage-sourced) | Reconstructs human-gate invariant for the auto-promote workflow legitimately running in CI; single load-bearing trust decision in v4.0 | ✓ Good — `scripts/auto-fix-promote.mjs:assertTripleGate()` throws on any leg failure BEFORE `runPromote()` reached |
| `tests/e2e/.llm-spend-ledger.json` flipped from gitignored to committed-but-versioned | Bootstraps cross-machine spend continuity; committed-ledger privacy audit (Phase 46) verified zero PII leak | ✓ Good — `[skip ci]` commit pattern from cost-ledger-snapshot workflow |
| `@anthropic-ai/sdk@0.100.1` EXACT (no caret) + ESLint single-entry-point guard | Supply-chain hardening for the only LLM lib; lockfile + static-grep pin; restricted to `llm-driver.js` | ✓ Good — Phase 47 INT-FIX-LOCK layered-defended; auto-fix.mjs goes through driver |
| Dual LLM transport — SDK in CI (`invokeAnthropicSdkWithLedger`) + subscription-local (`invokeClaudePWithLedger`) | 24/7 auto-fix needs SDK (no user); local iteration needs free subscription credit | ✓ Good — INVERSE CI gates on the two wrappers; shared `LEDGER_PATH`; `combinedMonthlyTotal` unifies caps |
| Auto-fix PRs draft + human-merge required + auto-promote opens SEPARATE follow-up PR | Preserves human-gated trust invariant for citation-accuracy code (legal-filing core value); auto-promote NEVER direct-to-main | ✓ Good — `v40-auto-promote.yml` runs `peter-evans/create-pull-request@v8` for the follow-up; CODEOWNERS + post-merge verifier are defense layers |
| 5-state FLAKE classifier replaces v3.1 binary CONFIRMED/FLAKE | Prevents both real-bugs-mis-classified-as-FLAKE and FLAKE-spam loops; per-case rolling 10-element ring buffer | ✓ Good — `classifyRerunOutcomes` sibling export; `runTriage` preserved for back-compat |
| 4 of 5 v4.0 HUMAN-UATs DEFERRED at milestone close (requires-push) | v4.0 workflows local-only until push; live UAT against pushed state is a separate readiness gate | ✓ Good — Phase 47 CONTEXT.md Grey Area 1 locked; runbook stubs in `47-UAT-DEFERRED.md` operator-dispatchable |
| BLOCKER-01 fix landed inline at milestone-audit (verifier-gate label producer) | Cross-workflow integration check surfaced auto-fix:verified label gap that TP-* per-touchpoint tests + deferred UAT missed | ✓ Good — `fix(47-cleanup): BLOCKER-01` commit `033613f` + YAML contract test `tests/unit/blocker-01-label-producer.test.js` |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-06-16 — started milestone v6.0 Standalone Citation Webapp (client-side PDF.js webapp on `tonyrowles.com` reusing the deterministic matching core; granted patents only for v1; `PROXY_TOKEN` rotation is a blocking security gate). v4.3 auto-fix carry-over + bug-report ingestion remain reserved for v5.1. v5.0 Bug Report Feature shipped 2026-06-15 (45/45 reqs, live UAT-01..06 PROVEN). Next: define v6.0 requirements → roadmap.*

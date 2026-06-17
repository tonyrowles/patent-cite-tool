# Feature Research — v6.1 Auto-Fix from Bug Reports

**Domain:** Human-report-driven, LLM-assisted auto-fix pipeline (report triage → analysis → candidate fix → regression gate → human merge gate)
**Researched:** 2026-06-17
**Confidence:** HIGH (grounded in project's own prior art from v3.1/v4.0 milestones, verified against v5.0 KV schema, and cross-referenced with current industry patterns for AI-assisted triage and auto-fix loops)

---

## Scope Note

This document covers ONLY the new v6.1 human-report-driven pipeline. The v5.0 `BUG_REPORTS` KV channel (intake, schema, fingerprint dedup, Discord notify, rate limiting) is treated as a stable, already-built dependency. The golden corpus + quarantine regression guard carried forward from v4.0/v4.3 is also a stable dependency. The retired autonomous machinery (fixture-mutator, `e2e:explore` cron, `v40-auto-fix` synthetic trigger, Phases 61–67) is explicitly out of scope and should not be referenced as a building block.

---

## Available Triage Signals in a v5.0 Report

Understanding the signal available from each KV record is prerequisite to designing triage classification. Every `report:{fingerprint}:{timestamp}` entry in `BUG_REPORTS` contains:

| Signal | Field(s) | Triage Use |
|--------|----------|------------|
| Report category | `category` | One of 4 frozen values: `inaccurate_citation`, `no_match`, `tool_not_working`, `other`. `inaccurate_citation` + `no_match` are strong indicators of a real citation bug. `tool_not_working` and `other` skew toward user-error / environment issues. |
| Observed citation | `returnedCitation` | Non-null with a plausible column:line format = extension ran; null or malformed = pipeline didn't complete. |
| Confidence tier | `confidenceTier` | `"yellow"` or `"red"` = extension's own uncertainty flag is already raised. `"green"` with `inaccurate_citation` = the most interesting case (extension was confident but wrong). |
| Selection text | `selectionText` | Present (user kept it): enables text-level duplicate detection and LLM analysis. Absent (user removed it): still classifiable via other signals but analysis is weaker. |
| Patent number + URL | `patentNumber`, `patentUrl` | Enables corpus cross-check against golden + quarantine: if the patent is already in the quarantine with a `stable_runs ≥ 3` entry, this report is a known failure and auto-promote is appropriate. |
| Fingerprint dedup metadata | `fingerprint` (16 hex), `duplicate_count` | High `duplicate_count` = multiple users hitting the same bug = higher-confidence real issue. Zero-count first submission = isolated incident that may or may not be reproducible. |
| PDF parse status | `pdfParseStatus` | `"success"` = PDF was parsed cleanly; `"fallback"` = went to USPTO path; `"error"` = parse failed. `"error"` + `no_match` = likely environment/PDF issue, not a matcher bug. |
| Error log | `errorLog` (ring buffer, ≤20 entries) | Presence of JS exceptions, Worker errors, or fetch failures distinguishes tool-not-working (infrastructure) from citation-accuracy failures. |
| Browser + OS | `browser`, `os` | Cross-browser inconsistency between multiple reports for the same patent = likely platform-specific, not algorithm. Same bug on both Chrome + Firefox = algorithm-level issue. |
| Trigger mode | `triggerMode` | `"contextMenu"` vs `"floating"` vs `"auto"` patterns on failing reports can surface trigger-mode-specific bugs. |
| Viewport/scroll | `xpathNode`, `scrollY`, `viewportWidth`, `viewportHeight` | DOM-level diagnostics for reproducing the exact selection state. |
| User note | `note` | Free-text, low signal-to-noise but can contain "the citation shows 3:15 but it should be 4:20" — actionable expected vs observed pairs when present. |

---

## Feature Landscape

### Table Stakes (Maintainer Expects These)

Features that a maintainer operating this loop assumes will exist. Without them the pipeline feels broken or untrustworthy.

| Feature | Why Expected | Complexity | Dependencies on Existing v5.0 / Corpus |
|---------|--------------|------------|----------------------------------------|
| **KV report ingestion** — read `BUG_REPORTS` records via `env.BUG_REPORTS.list()` + `.get()` in a script or Action, sorted by timestamp | Without this, the pipeline has no input. Maintainer cannot manually inspect reports without a CLI. | LOW | v5.0 `BUG_REPORTS` KV namespace with `report:{fp}:{ts}` key format. `wrangler kv key list --remote --binding BUG_REPORTS` already works but is raw JSON. Needs a thin reader script. |
| **Real-bug vs noise/duplicate/user-error classifier** — heuristic-first, LLM-optional: classify each report into {real_bug, noise, duplicate, user_error, ambiguous} | The v4.0 feature research established heuristic-first as the right pattern (resolves most classes without LLM spend). Maintainer expects reports to arrive pre-classified, not as a raw dump. | MEDIUM | Uses `category`, `confidenceTier`, `pdfParseStatus`, `returnedCitation`, `duplicate_count`, `errorLog` signals from the v5.0 KV record. Cross-checks against golden + quarantine corpus for known-failure match. |
| **Auto-promotion of real bugs into analysis queue** — reports classified as `real_bug` automatically enter the analysis pipeline without maintainer action | Industry baseline (GitHub's `gh-aw` auto-triage, Dosu, Copilot issue assignment): auto-routing is the baseline; manual-only triage queues get ignored. | LOW | Promotion writes a lightweight analysis-queue entry (a local file, a KV namespace entry, or a GitHub Issue). Depends on classifier output. |
| **Manual-promote escape hatch** — maintainer can push any report (including `noise`, `ambiguous`, or `user_error`) into the analysis queue via a CLI flag or label | Without this, a smart maintainer who spots a misclassified report has no recourse except modifying the classifier. Required for trust in the auto-classification. | LOW | Minimal new code: a `--force-promote <fingerprint>` flag on the ingestion script, or a GitHub label that overrides the classifier decision. |
| **LLM analysis → candidate fix proposal** — for each promoted report, an LLM reads the report fields + the relevant source modules and produces a candidate diff targeting the deterministic matching/normalization core | This is the core value of the milestone. Without a fix proposal, the loop has no output. | HIGH | Consumes report fields (esp. `selectionText`, `returnedCitation`, `confidenceTier`, `patentNumber`). Fix surface = `src/shared/matching.js`, `src/offscreen/position-map-builder.js`, `src/offscreen/parser.js`. LLM transport = `@anthropic-ai/sdk` (already installed, EXACT pin). |
| **Regression gate — golden corpus** — every candidate fix is verified against all 75+ golden cases before the PR is opened; zero regressions required | The golden baseline is the trust anchor for citation accuracy. A fix that breaks other patents cannot land. | LOW (gate wiring) | Depends on existing Vitest golden baseline (`tests/test-cases.js` + `tests/golden/baseline.json`). Running `npm test` is the gate. |
| **Regression gate — quarantine corpus** — candidate fix also runs against quarantine cases; failures here are expected (these are known broken cases) but regressions in quarantine should not appear as new failures | The quarantine corpus is the "other known broken cases" surface. A fix must not worsen them. | LOW (gate wiring) | Depends on `tests/e2e/test-cases-quarantine.js` carried forward from v3.1/v4.0. The quarantine spec runs non-gating already; v6.1 makes it part of the fix-verification pass. |
| **Draft PR with fix candidate** — the fix is proposed via a GitHub draft PR on an `auto-fix/<fingerprint-short>` branch; never direct-to-main | Industry universal baseline for agent-generated code touching domain logic. Citations go into legal filings; no auto-merge of matcher changes is ever acceptable. | LOW | Uses existing `gh pr create` or `peter-evans/create-pull-request@v8` (already in the repo's GitHub Actions). Branch naming must be discoverable and idempotent. |
| **Human merge gate** — the PR requires a maintainer approval click; no auto-merge path for `src/` changes | The v4.0 trust invariant: "Automatic golden promotion blocked — destroys trust invariant." Legal-filing accuracy means a human must sign off on every matcher change. | LOW (policy, not code) | Enforced by the existing GitHub branch-protection ruleset (ruleset 17086676) which already requires status checks before merge. |
| **Cost-ledger integration** — LLM calls made during analysis + fix generation are recorded in `tests/e2e/.llm-spend-ledger.json` with the existing `invokeAnthropicSdkWithLedger` wrapper; monthly soft/hard caps enforced | v4.0 established spend ledger as table stakes. Any LLM call without ledger accountability is a LEDGER LEAK (known vulnerability from project memory). | LOW | `@anthropic-ai/sdk` is already pinned EXACT. `invokeAnthropicSdkWithLedger` exists in `tests/e2e/lib/llm-driver.js`. Ledger path is `tests/e2e/.llm-spend-ledger.json`. |
| **Triage report artifact** — the classifier emits a structured JSON report (one entry per processed report: fingerprint, classification, reason, promotion decision) | Without a durable artifact, the maintainer has no audit trail and no way to review classification decisions. Also enables digest/analytics later. | LOW | New artifact; follows the `rerun-report.json` / `triage-report.json` pattern from v3.1. |

### Differentiators (What Makes This Loop Good)

Features that distinguish a high-quality maintainer experience from a barely-functional one.

| Feature | Value Proposition | Complexity | Dependencies |
|---------|-------------------|------------|--------------|
| **Corpus cross-check during triage** — before classifying a report as `real_bug`, check if the patent is already in the golden corpus (known-good → user error?) or quarantine (known-broken → auto-promote immediately) | Catches the case where a report is for a patent the system already knows is broken. Prevents wasted LLM analysis on already-tracked failures. Avoids false `real_bug` classifications for patents where the golden expected-value is itself wrong. | MEDIUM | Requires reading `tests/test-cases.js` (golden) and `tests/e2e/test-cases-quarantine.js` (quarantine) during ingestion. Pure file I/O — no new deps. |
| **Fingerprint-cluster grouping** — when N≥3 reports share the same fingerprint (same `patentNumber|category|selectionHash`) within the 90-day TTL window, treat as a high-confidence real bug and auto-promote immediately regardless of other classification signals | High `duplicate_count` from the v5.0 dedup mechanism is a strong signal that multiple users are hitting the same bug. Industry pattern: Mozilla's intermittent-failure dashboard uses occurrence count as the primary prioritization signal. | LOW | Reads `duplicate_count` from the KV record. No LLM needed. Promotes into analysis queue directly. |
| **`inaccurate_citation` + `"green"` confidence tier as highest-priority signal** — the extension was confident (green) but produced a wrong citation; this combination is the highest-value fix target because it means the algorithm is silently wrong, not just uncertain | Most auto-fix systems treat all bugs equally. This project knows from v4.0 that `WRONG_CITATION` with `verifier_strong_agreement` at Tier A/B is the hero case. Green-tier + `inaccurate_citation` = the same class, detectable from the v5.0 payload without any LLM. | LOW | Reads `confidenceTier` + `category` from KV record. Heuristic, no LLM. Maps directly to the `WRONG_CITATION` error class from v3.1/v4.0. |
| **Structured fix context for LLM** — the analysis prompt includes: `patentNumber`, `returnedCitation` (what the extension produced), `selectionText` (what the user selected), `confidenceTier`, a PDF text extract from the patent (fetched via Worker or from KV cache), and the existing matching-tier waterfall from `src/shared/matching.js` — all wrapped in `<patent_data>` XML tags | Better context = better fixes. v4.0 established that without diagnostic data in the issue body, `--max-turns 1` was insufficient and `error_max_turns` was the failure mode. The v5.0 report already contains most of the needed fields; the gap is the PDF text extract. | MEDIUM | PDF text can be fetched from `PATENT_CACHE` KV (position maps already stored there) or re-fetched via Worker. `<patent_data>` XML wrapping is a v3.1 prompt-injection defense (already established). |
| **Iteration cap with `auto-fix-stuck` label** — LLM fix-generation is capped at a small number of iterations (3–4 max per report); if the gate still fails after the cap, label the PR `auto-fix-stuck` and surface in the triage digest without burning more budget | Prevents cost runaway on hard cases. v4.0 discovered that `--max-turns 1` was too tight, but unlimited is dangerous. Industry norm: 3–6 max iterations. | LOW | Wires into the existing ledger hard-cap logic. `auto-fix-stuck` is a new GitHub label, low cost. |
| **Maintainer digest for report volume** — a summary of recent `BUG_REPORTS` volume, classification breakdown, and promotion queue depth, surfaced in the existing Monday weekly digest (or on-demand CLI) | Gives the maintainer visibility into the health of the inbound signal channel. Without this, reports pile up invisibly. Extends the existing v3.1 `DIGEST-01..04` weekly digest. | LOW | Reads from `BUG_REPORTS` KV list (count by category, dedup rate, promotion rate). Wires into `scripts/weekly-digest.mjs`. |
| **Idempotent ingestion** — re-running the ingestion script never re-promotes an already-promoted report or re-opens a PR for a report that already has one | Without idempotency, nightly cron runs create PR spam. v4.0 had branch-existence idempotency checks on `auto-fix/issue-N` branches. v6.1 applies the same pattern using the fingerprint as the dedup key. | LOW | Track promoted fingerprints in a local state file or via branch-name check (`auto-fix/<fp-short>` branch existence). |
| **Manual-promote audit trail** — when the maintainer uses the escape hatch to force-promote a report, the triage report artifact records the override with a `promoted_by: 'manual'` marker and a note | Without this, manual overrides are invisible and the classifier's auto/manual split is unknowable. Follows the v4.2 `safeAppendLedger` pattern for audit-able overrides. | LOW | Extend the triage report JSON with a `promotion_source: 'auto' | 'manual'` field. |

### Anti-Features (Explicitly NOT to Build)

Features that appear beneficial but erode the pipeline's correctness, trust, or human control.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Auto-merge of `src/` fix PRs without human approval** | "If regression gate is green on all 75+ goldens, why not auto-merge?" | Citations go into legal filings. A patch passing 75 goldens may introduce silent off-by-one errors for un-goldenized patents. The v4.0 trust invariant is explicit: auto-merging matcher changes destroys the trust invariant. | Keep all `src/shared/matching.js` and `src/offscreen/` PRs as draft-by-default with mandatory human approval click. The regression gate is necessary but not sufficient. |
| **Treating `duplicate_count > 0` as noise (not a duplicate of the original = skip)** | "If a report is a duplicate, it's redundant — filter it out." | `duplicate_count` is the occurrence counter for the SAME fingerprint. High `duplicate_count` means many users hit this bug — it is STRONGER evidence of a real issue, not weaker. Filtering duplicates silences the highest-priority reports. | Use `duplicate_count` as a promotion-priority signal: higher count = promote immediately without waiting for LLM classification. |
| **LLM-as-judge for the regression gate** | "When the verifier disagrees at Tier C, ask an LLM to break the tie." | The existing PDF verifier (`tests/e2e/lib/pdf-verifier.js`) is an independent code path that does not share the extension's bugs. Replacing or supplementing it with an LLM adjudicator re-introduces correlated failure. This anti-pattern was explicitly established in v4.0 as a "phantom-verification grenade." | Tier C disagreements escalate to `human-only-investigation` label; no auto-merge path. |
| **Autonomous LLM exploration to FIND bugs (not fix them)** | "While we're building the fix pipeline, why not also let the LLM seek out new bugs autonomously?" | This is the v3.1/v4.0 explore mode. It is explicitly DEFERRED to future development. V6.1's signal source is exclusively the v5.0 `BUG_REPORTS` KV channel. Mixing autonomous exploration with human-report-driven triage blurs the signal quality and revives the retired machinery. | Stick to human reports as the sole inbound signal. The `BUG_REPORTS` channel is rich enough (fingerprint, selection text, confidence tier, error log) without autonomous exploration. |
| **Single LLM call producing both triage classification and fix proposal** | "Token-efficient: one call does both." | Triage classification is a cheap heuristic-first task; fix generation is an expensive, context-heavy task. Coupling them means every report burns fix-generation budget even for noise/user-error reports. It also makes the pipeline opaque (classification decision is entangled with fix direction). | Separate stages: heuristic triage first (cheap, no LLM for most cases), then LLM analysis only for promoted reports. |
| **Batch auto-fix of entire report queue overnight** | "We have 30 pending reports — run them all at 03:00 UTC." | The v4.0 analysis showed that batch mode creates PR spam, exhausts budget, and buries the human review queue. Per-night cap of 2–3 new fix PRs; FIFO on `duplicate_count` descending (most-reported-first). | Capped per-night dispatch with a configurable `--max-fixes-per-run N` gate. Surface the queue depth in the weekly digest so the maintainer can decide when to raise the cap. |
| **Storing or displaying `selectionText` in PR body or logs without privacy guard** | "The selection text helps the reviewer understand the bug." | `selectionText` is user-provided content that the user may have opted out of sharing (`includeSelectionText: false`). The v5.0 design explicitly requires respecting this privacy choice end-to-end. If `selectionText` is null in KV, the pipeline must treat it as absent, not attempt to re-fetch from the patent page. | Omit `selectionText` from PR body if null in the KV record. Use the patent PDF text extract as the LLM context instead. |
| **Promoting reports to analysis without checking if a fix PR already exists for the fingerprint** | "Auto-promote everything real and let CI deduplicate." | Creates multiple concurrent PRs for the same underlying bug when reports share a fingerprint. Confuses the maintainer and wastes LLM budget. | Idempotent promotion: check for an existing `auto-fix/<fp-short>` branch before opening a new PR. Skip if already in progress. |

---

## Feature Dependencies

```
[v5.0 BUG_REPORTS KV channel]
    └──provides──> [Report ingestion script]
                       └──feeds──> [Triage classifier]
                                       ├──auto-promote──> [Analysis queue entry]
                                       │                      └──triggers──> [LLM analysis + fix proposal]
                                       │                                          └──produces──> [Candidate diff]
                                       │                                                             └──gated by──> [Regression gate]
                                       │                                                                                └──passes──> [Draft PR]
                                       │                                                                                                 └──requires──> [Human merge gate]
                                       └──skip (noise/dup/user-error)──> [Triage report artifact]

[Manual-promote escape hatch]
    └──overrides──> [Triage classifier] ──produces──> [Analysis queue entry]
                                                           (same path as auto-promote above)

[Golden corpus (tests/test-cases.js)]
    └──cross-checked by──> [Triage classifier] (is this patent known-good?)
    └──gated by──> [Regression gate] (zero regressions required)

[Quarantine corpus (tests/e2e/test-cases-quarantine.js)]
    └──cross-checked by──> [Triage classifier] (is this a known-broken patent? → auto-promote)
    └──verified by──> [Regression gate] (no new quarantine failures)

[duplicate_count from KV record]
    └──signals──> [Triage classifier] (high count = skip LLM, auto-promote immediately)

[confidenceTier="green" + category="inaccurate_citation"]
    └──signals──> [Triage classifier] (highest-priority WRONG_CITATION class: auto-promote)

[invokeAnthropicSdkWithLedger (existing in llm-driver.js)]
    └──used by──> [LLM analysis + fix proposal]
    └──capped by──> [Cost ledger $80/$100 monthly cap]

[Cost ledger (tests/e2e/.llm-spend-ledger.json)]
    └──gated by──> [LLM analysis step] (hard cap: refuse to start analysis if monthly cap exceeded)
```

### Dependency Notes

- **Ingestion script requires v5.0 BUG_REPORTS KV:** The `wrangler kv key list --remote` API is the only current access path. The script must run with `wrangler` credentials (same as the deploy workflow already has).
- **Triage classifier requires golden + quarantine corpus at read-time:** Pure file reads from `tests/test-cases.js` and `tests/e2e/test-cases-quarantine.js`. No network calls.
- **LLM analysis requires PDF text context:** The patent's position-map / PDF text may be in `PATENT_CACHE` KV already (fetched during user's citation session). If not cached, the analysis step must fetch it via the Worker's `/cache` route or the USPTO fallback — this is the most complex dependency in the pipeline.
- **Regression gate requires both `npm test` (golden) and the quarantine spec:** Already exists; wiring them as a required gate on the fix PR is the only new work.
- **Human merge gate is enforced by the existing ruleset:** No new code needed; branch-protection ruleset 17086676 already requires human approval before merge to main.
- **LLM fix proposal conflicts with auto-merge:** These are incompatible by design. The anti-feature section captures this explicitly.

---

## MVP Definition

### Launch With (v6.1 core pipeline)

Minimum viable pipeline to close the human-report → regression-safe fix → human-merge loop.

- [ ] **Report ingestion script** — reads `BUG_REPORTS` KV via `wrangler --remote`, produces a structured JSON list of pending reports. Essential: without this, the pipeline has no input.
- [ ] **Triage classifier (heuristic-first)** — classifies reports using available KV signals (`category`, `confidenceTier`, `pdfParseStatus`, `returnedCitation`, `duplicate_count`, `errorLog`) and corpus cross-check (golden + quarantine). No LLM needed for most classifications. Essential: determines what gets promoted.
- [ ] **Auto-promote for clear real-bug signals** — `inaccurate_citation` + `"green"` tier, OR `duplicate_count ≥ 3`, OR patent in quarantine → auto-promote without LLM triage call. Essential: the highest-value reports should never wait for LLM classification budget.
- [ ] **Manual-promote escape hatch** — `--force-promote <fingerprint>` CLI flag that bypasses classifier and injects a report into the analysis queue. Essential for maintainer trust in the auto-classifier.
- [ ] **LLM analysis → candidate fix on `src/shared/matching.js` / `src/offscreen/` surface** — the hero case: promoted report feeds an LLM call (via `invokeAnthropicSdkWithLedger`) with report fields + PDF text context + matching-tier waterfall source. Output is a candidate diff. Essential: this is the core new capability.
- [ ] **Regression gate: golden + quarantine** — every candidate diff is tested against `npm test` (golden) + quarantine spec before PR is opened. PR stays draft until gate is green. Essential for the regression-safety guarantee.
- [ ] **Draft PR with `auto-fix/<fp-short>` branch** — the candidate fix is proposed via a GitHub draft PR. Never direct-to-main. Essential for human review workflow.
- [ ] **Cost ledger integration** — all LLM calls go through `invokeAnthropicSdkWithLedger`; refuse to start analysis if monthly hard cap exceeded. Essential given project's established ledger-leak vigilance.
- [ ] **Triage report artifact** — JSON file recording classification decision + promotion source + rationale for each processed report. Essential for audit trail.
- [ ] **Retire autonomous machinery** — remove `inject-defect.mjs`, `e2e:explore` cron path, `v40-auto-fix` synthetic trigger, archive Phases 61–67. Essential to clean up the scope confusion with the retired v4.3 approach.

### Add After Validation (v6.1.x — post first successful auto-fix PR)

Trigger: first successfully merged auto-fix PR that originated from a human bug report.

- [ ] **PDF text context fetching** — if patent position-map not in `PATENT_CACHE` KV, fetch via Worker's `/cache` route and extract text for the LLM prompt. Adds richer analysis context.
- [ ] **Maintainer report digest extension** — add `BUG_REPORTS` volume metrics (report count, classification breakdown, promotion rate) to the existing Monday weekly digest.
- [ ] **LLM triage for `ambiguous` reports** — only for reports that heuristics cannot classify (e.g., `other` category with a meaningful `note` field). LLM call returns `real_bug | user_error | noise` with reasoning.
- [ ] **Iteration cap + `auto-fix-stuck` label** — when LLM fix fails the regression gate after N attempts, stop, label `auto-fix-stuck`, surface in digest.

### Future Consideration (v6.2+)

Trigger: stable pipeline with ≥5 successful auto-fix merges and maintainer confidence in the classifier.

- [ ] **Additional fix surfaces** — `worker/src/index.js` (Worker route bugs), `src/offscreen/parser.js` (PDF parsing bugs), reported via `tool_not_working` + `pdfParseStatus: "error"` signal combination.
- [ ] **Quarantine-append from promoted report** — a promoted report that doesn't have a golden case yet gets added to quarantine so regression detection catches it on future fixes.
- [ ] **Cross-report fingerprint cluster analysis** — when 3+ reports for different patents share a common `errorLog` pattern or `pdfParseStatus: "fallback"` + `inaccurate_citation`, surface as a potential systemic issue.

---

## Feature Prioritization Matrix

| Feature | Maintainer Value | Implementation Cost | Priority |
|---------|-----------------|---------------------|----------|
| Report ingestion script | HIGH | LOW | P1 |
| Heuristic triage classifier + corpus cross-check | HIGH | MEDIUM | P1 |
| Auto-promote (clear signals: green+inaccurate, dup_count≥3, quarantine match) | HIGH | LOW | P1 |
| Manual-promote escape hatch | HIGH (trust) | LOW | P1 |
| LLM analysis → candidate fix (matching core surface) | HIGH | HIGH | P1 |
| Regression gate (golden + quarantine) | HIGH | LOW (wiring only) | P1 |
| Draft PR with `auto-fix/<fp-short>` branch | HIGH | LOW | P1 |
| Cost ledger integration | HIGH (trust + safety) | LOW | P1 |
| Triage report artifact | MEDIUM (audit trail) | LOW | P1 |
| Retire autonomous machinery | HIGH (scope hygiene) | MEDIUM | P1 |
| PDF text context fetching for LLM | MEDIUM | MEDIUM | P2 |
| Report volume digest extension | MEDIUM | LOW | P2 |
| LLM triage for ambiguous reports | MEDIUM | MEDIUM | P2 |
| Iteration cap + stuck label | MEDIUM (cost safety) | LOW | P2 |
| Quarantine-append from promoted report | LOW | MEDIUM | P3 |
| Cross-report cluster analysis | LOW | HIGH | P3 |

**Priority key:**
- P1: Required for the pipeline to close end-to-end on a real human report
- P2: Adds quality and maintainer ergonomics after the core loop is proven
- P3: Sophistication that belongs in a follow-on milestone

---

## "What Good Looks Like" for the Maintainer

A maintainer operating this loop on real user reports should experience:

1. **Zero manual triage required for obvious cases.** A `"green"` confidence report of `"inaccurate_citation"` with `duplicate_count: 5` auto-promotes without a maintainer decision. The maintainer's attention is reserved for `ambiguous` reports and PR review.

2. **An escape hatch that is one command.** When the maintainer spots a misclassified report in the Discord embed, `npm run promote-report -- --fingerprint abc123def456` pushes it into analysis without editing classifier code.

3. **A PR they can actually review.** The draft PR body shows: the original report fields (patent, selection text if present, returned citation, confidence tier), the candidate diff (ideally ≤30 lines for a single-tier fix), the regression gate results (all 75+ golden cases: PASS, quarantine cases: no new failures), and the cost stamp (`$0.38 / 12,400 tokens`). The reviewer clicks "Approve" or "Request changes" — not "figure out what this PR is trying to fix."

4. **No surprises from the regression guard.** If a proposed fix would break even one golden case, the PR stays in draft and the `auto-fix-stuck` label fires. The maintainer is never in a position of merging something that secretly regresses another patent.

5. **Visibility into the queue.** The Monday digest includes a line: `Bug Reports: 12 received (7 real, 3 noise, 2 ambiguous) | 4 promoted → 2 PRs open, 1 merged, 1 stuck`. The maintainer knows whether the pipeline is healthy without digging into logs.

---

## Sources

- v5.0 `BUG_REPORTS` KV schema — `worker/src/report-schema.md` (project-internal, HIGH confidence)
- v5.0 `src/shared/report-payload-builder.js` — field allowlist and payload contract (project-internal, HIGH confidence)
- v4.0 FEATURES.md (`.planning/research-v4.0-archive/FEATURES.md`) — table-stakes, anti-features, verifier gate design, trust invariant (project-internal, HIGH confidence)
- v3.1 validated requirements (PROJECT.md TRIAGE-01..06, ISSUE-01..04, QUAR-01..05) — heuristic-first classifier design, hybrid triage pattern, fingerprint dedup scheme (project-internal, HIGH confidence)
- [eesel AI: AI for Bug Report Triage in 2026](https://www.eesel.ai/blog/ai-for-bug-report-triage) — five-stage triage pipeline (capture → classify → deduplicate → prioritize → route), industry baseline for automated triage (MEDIUM confidence)
- [GitBugs: Bug Reports for Duplicate Detection (arxiv 2504.09651)](https://arxiv.org/abs/2504.09651) — duplicate detection signals, occurrence count as priority signal (MEDIUM confidence)
- [GitHub Blog: GitHub Models for Open Source Maintainers](https://github.blog/open-source/maintainers/how-github-models-can-help-open-source-maintainers-focus-on-what-matters/) — AI triage as "second pair of eyes"; human-in-the-loop until automation is trusted; spam/needs-review classification scheme (HIGH confidence, official GitHub source)
- [USENIX: AI in the Pipeline — Reliability Lessons from Adding LLM to CI/CD](https://www.usenix.org/publications/loginonline/ai-pipeline-reliability-lessons-adding-llm-cicd) — cheap deterministic checks first, LLM nightly, paired-comparison gating, auto-rollback (MEDIUM confidence)
- [dosu.dev: Automating GitHub Issue Triage](https://dosu.dev/blog/automating-github-issue-triage) — maintainer-in-the-loop pattern; suggested responses for human review before posting (MEDIUM confidence)
- [Self-Healing Software Systems (arxiv 2504.20093)](https://arxiv.org/pdf/2504.20093) — sandboxed test suite validation, branch-and-retry-3x pattern, revert on persistent failure (MEDIUM confidence)
- [GitHub Blog: Agent Pull Requests review patterns](https://github.blog/ai-and-ml/generative-ai/agent-pull-requests-are-everywhere-heres-how-to-review-them/) — 45.1% of agent PRs require human revision; checkpoint patterns (MEDIUM confidence, established in v4.0 research)
- SecurityWeek / TheRegister April 2026: Comment-and-Control prompt injection via GitHub issue comments — trigger filtering (issues-event, not comment-event) as injection defense (HIGH confidence, established in v4.0 research)

---
*Feature research for: v6.1 Auto-Fix from Bug Reports — human-report-driven, LLM-assisted auto-fix pipeline*
*Researched: 2026-06-17*

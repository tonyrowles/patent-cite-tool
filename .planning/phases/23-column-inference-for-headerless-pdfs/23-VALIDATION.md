---
phase: 23
slug: column-inference-for-headerless-pdfs
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-12
---

# Phase 23 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^3.0.0 |
| **Config file** | `vitest.config.js` (root); `vitest.config.chrome.js`, `vitest.config.firefox.js` (variants) |
| **Quick run command** | `npx vitest run tests/unit/position-map-builder.test.js` |
| **Full suite command** | `npm run test:src` (then `npm test` adds build + chrome + firefox + lint) |
| **Estimated runtime** | ~1 second for the targeted unit file; ~30 seconds for `npm test` |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/unit/position-map-builder.test.js`
- **After every plan wave:** Run `npm run test:src`
- **Before `/gsd-verify-work`:** `npm test` AND `npm run accuracy-report` (must show 0 regressions vs 75-case baseline)
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 23-01-01 | 01 | 1 | ACCY-04 | — | N/A — accuracy hardening | unit | `npx vitest run tests/unit/position-map-builder.test.js -t "spurious column 203"` | ✅ | ⬜ pending |
| 23-01-02 | 01 | 1 | ACCY-04 | — | N/A | unit | `npx vitest run tests/unit/position-map-builder.test.js -t "sequential pattern"` | ✅ | ⬜ pending |
| 23-01-03 | 01 | 1 | ACCY-04 | — | N/A | unit | `npx vitest run tests/unit/position-map-builder.test.js -t "left column is even"` | ✅ | ⬜ pending |
| 23-01-04 | 01 | 1 | ACCY-04 | — | N/A | unit | `npx vitest run tests/unit/position-map-builder.test.js -t "isLikelySpecPage"` | ✅ | ⬜ pending |
| 23-01-05 | 01 | 1 | ACCY-04 | — | N/A | unit | `npx vitest run tests/unit/position-map-builder.test.js -t "infers sequential columns"` | ✅ | ⬜ pending |
| 23-01-06 | 01 | 1 | ACCY-04 | — | N/A | unit | `npx vitest run tests/unit/position-map-builder.test.js -t "skips cover and figure"` | ✅ | ⬜ pending |
| 23-02-01 | 02 | 1 | ACCY-05 | — | Cache invalidation on algorithm change | static-grep | `grep -c "CACHE_VERSION = 'v3'" src/offscreen/offscreen.js src/firefox/pdf-pipeline.js` — expect 2 | ✅ | ⬜ pending |
| 23-02-02 | 02 | 1 | ACCY-05 | — | Cache key is version-namespaced | unit (proposed) | `npx vitest run tests/unit/cache-version.test.js` | ❌ W0 | ⬜ pending |
| 23-03-01 | 03 | 2 | ACCY-04 (regression) | — | N/A | accuracy report | `npm run accuracy-report` — exit 0, 75/75 green | ✅ | ⬜ pending |
| 23-03-02 | 03 | 2 | ACCY-04 (US10203551 trigger) | — | N/A | integration (proposed) | `npx vitest run tests/integration/us10203551.test.js` | ❌ W0 (if user accepts fixture task) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/cache-version.test.js` — static assertion that `CACHE_VERSION === 'v3'` at both client sites (covers ACCY-05 with a guard test, optional but recommended)
- [ ] `tests/fixtures/US10203551.json` + `tests/integration/us10203551.test.js` + new entry in `tests/test-cases.js` + regenerated `tests/golden/baseline.json` — **optional**, only if the planner/user decides success criterion #1 ("running the test suite against US10203551") requires a real PDF parse-through rather than the synthetic unit-test equivalents
- [x] No framework install needed — Vitest already installed and configured.

*If both above are deferred: "Existing 30 unit tests in tests/unit/position-map-builder.test.js plus the 75-case golden baseline cover all phase requirements via synthetic equivalents."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| User who previously cached a stale `v2` position map gets re-parsed on next use | ACCY-05 | The KV cache state is server-side and per-user; cannot be asserted from a unit test without a network mock. Verified structurally instead: cache key is `${version}:${patentNumber}` so any version change creates a fresh keyspace. | 1) Install previous extension version. 2) Visit a granted patent page; confirm citation appears. 3) Update to v2.3.0. 4) Visit same patent again; observe console log "cache miss, fetching from PDF.js" rather than "cache hit". |

*All other phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (or user explicitly accepts deferral)
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

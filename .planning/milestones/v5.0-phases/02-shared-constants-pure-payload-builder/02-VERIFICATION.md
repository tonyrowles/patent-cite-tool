---
phase: 02-shared-constants-pure-payload-builder
verified: 2026-06-13T09:45:00Z
status: passed
score: 11/11 must-haves verified
overrides_applied: 0
---

# Phase 2: Shared Constants + Pure Payload Builder Verification Report

**Phase Goal:** `src/shared/constants.js` additions and the new `src/shared/report-payload-builder.js` pure-function module establish the canonical payload schema contract — Vitest-pinned for schema conformance, [Remove selection text] toggle correctness, and fingerprint reproducibility — before any background or UI code depends on them.
**Verified:** 2026-06-13T09:45:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | REPORT_CATEGORIES, MSG.SUBMIT_REPORT, WORKER_REPORT_URL importable from constants.js; REPORT_CATEGORIES is frozen 4-element array in exact order (SC4, D-02) | ✓ VERIFIED | Runtime import confirms: `['inaccurate_citation','no_match','tool_not_working','other']`, `Object.isFrozen()===true`, `MSG.SUBMIT_REPORT==='submit-report'`, `WORKER_REPORT_URL==='https://pct.tonyrowles.com/report'`; Vitest Tests 7-9 green |
| 2 | src/shared/constants.js and src/shared/report-payload-builder.js make zero chrome.* calls (SC4) | ✓ VERIFIED | `grep -v '^ \*' constants.js \| grep -c 'chrome\.'` → 0; `grep -c 'chrome\.' report-payload-builder.js` → 0; Vitest Tests 10-11 (readFileSync static-grep) green |
| 3 | Stale src/content/constants-globals.js header comment corrected to state constants.js is single source of truth bundled per-target by esbuild (D-01) | ✓ VERIFIED | `grep -c 'constants-globals.js' src/shared/constants.js` → 0; header now reads "Single source of truth — bundled per-target by esbuild: IIFE for content scripts, ESM for background/offscreen workers." |
| 4 | buildReportPayload() output contains ONLY report-schema.md allowlist fields (minus 3 server-computed); extra input field does NOT propagate; ip/clientIp/userAgent never present (SC1, PAY-03) | ✓ VERIFIED | Runtime: 17 keys in exact schema order; `context.bogusExtra` not in output; `ip`, `clientIp`, `userAgent`, `fingerprint`, `timestamp`, `duplicate_count` all absent; Vitest Tests 2-4 green |
| 5 | buildReportPayload() uses exact destructured signature { context, category, note, settings, errors, includeSelectionText } (D-03) | ✓ VERIFIED | `src/shared/report-payload-builder.js:36`: `export function buildReportPayload({ context, category, note, settings, errors, includeSelectionText })` |
| 6 | buildReportPayload() omits selectionText key ENTIRELY when includeSelectionText=false; present when true (SC2, D-06) | ✓ VERIFIED | Runtime: `'selectionText' in p === false` when `includeSelectionText:false`; `=== true` when true; Vitest Tests 5-6 green |
| 7 | Two calls with identical inputs produce byte-identical JSON.stringify output (SC3) | ✓ VERIFIED | Runtime: `JSON.stringify(a) === JSON.stringify(b)` confirmed; Vitest Test 1 green; WR-02 fix (commit 79f2bd9) added defensive `[...errors]` copy ensuring post-call ring-buffer mutations cannot alter the payload (Test 16 pins this) |
| 8 | confidenceTier passed through verbatim as string; NO numeric mapping (D-04) | ✓ VERIFIED | `report-payload-builder.js:80`: `confidenceTier: context.confidenceTier ?? null` with comment "string passthrough (D-04)"; no numeric→tier conversion anywhere in file |
| 9 | Absent optional inputs default per spec: errorLog [], note null, patentUrl derived, other nullable diagnostics null (D-08) | ✓ VERIFIED | Runtime minimal-input call: `errorLog===[]`, `note===null`, `patentUrl==='https://patents.google.com/patent/US12505414'`, `returnedCitation===null`, `browser===null`, etc.; Vitest Test 15 green |
| 10 | buildReportPayload() throws descriptive Error on missing/empty patentNumber, category not in REPORT_CATEGORIES, missing/empty extensionVersion (D-05) | ✓ VERIFIED | Runtime: missing patentNumber throws; Vitest Tests 12, 12b, 13, 14, 14b all green (5 throw assertions) |
| 11 | Payload NEVER contains ip, clientIp, or userAgent (PAY-03) | ✓ VERIFIED | No such identifiers referenced in builder code (only "ip" substring is inside a JSDoc comment on the purity header, not a field reference); Vitest Test 4 pins the three forbidden keys absent from output; runtime confirms |

**Score:** 11/11 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/shared/constants.js` | MSG.SUBMIT_REPORT, frozen REPORT_CATEGORIES, WORKER_REPORT_URL | ✓ VERIFIED | 56 lines; all three PAY-05 additions present; stale comment removed (D-01); zero chrome.* |
| `src/shared/report-payload-builder.js` | Pure buildReportPayload() conforming to report-schema.md | ✓ VERIFIED | 95 lines (min_lines 40 satisfied); exports buildReportPayload; imports REPORT_CATEGORIES from ./constants.js; zero chrome.*/node-builtins/fingerprint |
| `tests/unit/report-payload-builder.test.js` | Vitest suite: all 4 SC + D-05 throws | ✓ VERIFIED | 18 `it()` blocks; 18/18 pass; covers SC1 (Tests 2-4), SC2 (Tests 5-6), SC3 (Test 1), SC4 (Tests 7-11), D-05 (Tests 12, 12b, 13, 14, 14b), D-08 (Test 15), WR-02 ring-buffer purity (Test 16) |
| `tests/unit/shared-constants.test.js` | Existing suite with MSG bumped 17→18 | ✓ VERIFIED | Line 10: `toBe(18)` present; `toBe(17)` absent; 9/9 tests pass |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/shared/report-payload-builder.js` | `src/shared/constants.js` | `import { REPORT_CATEGORIES }` | ✓ WIRED | `grep -c "import.*REPORT_CATEGORIES.*from.*constants"` → 1 |
| `src/shared/report-payload-builder.js` | `worker/src/report-schema.md` | ordered object-literal key order matches allowlist table | ✓ WIRED | Runtime key order: `category,patentNumber,patentUrl,[selectionText],returnedCitation,confidenceTier,extensionVersion,browser,os,xpathNode,scrollY,viewportWidth,viewportHeight,pdfParseStatus,triggerMode,errorLog,note` — byte-for-byte matches schema allowlist minus server-computed fields |

---

### Data-Flow Trace (Level 4)

Not applicable. Both modules are pure functions with no I/O, no network, no data sources to trace. The data flow is: caller passes inputs → builder applies allowlist ordering and D-08 defaults → returns plain object. All validation is on the explicit inputs passed in, not from any external source.

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| buildReportPayload keys in schema order | `node --input-type=module` runtime import | 17 keys in exact report-schema.md order | ✓ PASS |
| selectionText absent when toggle false | Runtime: `'selectionText' in p === false` | Confirmed | ✓ PASS |
| Byte-stable across two calls | Runtime: `JSON.stringify(a) === JSON.stringify(b)` | Confirmed | ✓ PASS |
| PAY-03 forbidden keys absent | Runtime: ip/clientIp/userAgent all absent from output keys | Confirmed | ✓ PASS |
| D-05 throws on missing patentNumber | Runtime: try/catch confirms throw | Confirmed | ✓ PASS |
| Constants importable, values correct | Runtime node import: all 3 PAY-05 constants match spec | Confirmed | ✓ PASS |

---

### Probe Execution

Not applicable. No probe scripts declared in PLAN.md or present at `scripts/*/tests/probe-*.sh` for this phase.

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| PAY-05 | 02-01-PLAN.md | `src/shared/constants.js` additions: MSG.SUBMIT_REPORT, frozen REPORT_CATEGORIES, WORKER_REPORT_URL | ✓ SATISFIED | All three present and importable; frozen array; stale comment removed |
| PAY-06 | 02-01-PLAN.md | New `src/shared/report-payload-builder.js` pure function; zero chrome.*; mirrors issue-payload-builder.js pattern | ✓ SATISFIED | 95-line pure ES module; zero chrome.*/node-builtins; D-03 signature; D-05/D-06/D-07/D-08 all implemented |
| PAY-07 | 02-01-PLAN.md | Vitest tests: schema-conformance, selectionText toggle, byte-stable output, fingerprint reproducibility | ✓ SATISFIED | 18 tests green; SC1-SC4 all pinned; D-05 throws; D-08 defaults; SC3 byte-stability with defensive copy (WR-02 fixed) |

No orphaned requirements. REQUIREMENTS.md maps PAY-05/PAY-06/PAY-07 exclusively to Phase 2 and all three are satisfied.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | — | — | — | — |

No TBD, FIXME, XXX, TODO, HACK, or placeholder markers found in any of the four Phase 2 files. No empty implementations. No hardcoded stubs.

**Open code-review items (WR-03, IN-01, IN-02, IN-03):** These are from the 02-REVIEW.md. WR-03 (WORKER_REPORT_URL not imported into builder) is architecturally non-blocking — the key_links contract only requires `REPORT_CATEGORIES` import, and WORKER_REPORT_URL is correctly exportable from constants.js where Phase 3 will import it directly. IN-01, IN-02, IN-03 are test completeness notes that do not affect the phase goal or SC1-SC4 coverage. None rise to blocker status for this phase's goal.

---

### Human Verification Required

None. This phase is entirely pure functions + Vitest. All Success Criteria are machine-verifiable and confirmed via test runs and runtime spot-checks. No UI, no network, no browser behavior, no external services.

---

## Gaps Summary

No gaps. All 11 must-have truths are VERIFIED, all 4 artifacts are substantive and wired, both key links hold, all 3 requirements (PAY-05, PAY-06, PAY-07) are satisfied, and the 18-test Vitest suite is green. The two pre-existing test failures (`tests/unit/warning-01-transport-tag.test.js` 4 tests, `tests/e2e/scripts/v40-auto-fix-yaml.test.js` 1 test) are confirmed to be paused v4.3 work that references zero Phase 2 symbols.

Code-review follow-ups WR-03, IN-01, IN-02, IN-03 from 02-REVIEW.md remain open but are not blockers for Phase 2's goal. They are optional quality improvements for a future cleanup pass.

---

_Verified: 2026-06-13T09:45:00Z_
_Verifier: Claude (gsd-verifier)_

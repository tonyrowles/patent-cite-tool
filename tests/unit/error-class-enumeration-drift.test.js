// tests/unit/error-class-enumeration-drift.test.js
//
// Phase 65 Plan 02 (SCAF-03) — 5-site enumeration drift guard.
//
// PURPOSE
// -------
// LOAD-BEARING gate: any future PR that adds a new ERROR_CLASS to the
// scaffold-supported registry (PROMPT_SCAFFOLDS) but forgets to wire it into
// one of the 5 canonical enumeration sites listed below will fail this test
// in CI with an actionable per-site error message.
//
// ITERATION SCOPE (LOAD-BEARING design choice)
// --------------------------------------------
// We iterate `Object.keys(PROMPT_SCAFFOLDS)` (the 7 scaffold-supported
// classes), NOT `ERROR_CLASSES` (the 12-element closed enum). Rationale:
//
//   - Several pre-existing ERROR_CLASSES members (EXTENSION_NOT_LOADED,
//     NO_CITATION_PRODUCED, UI_BROKEN, USPTO_API_DRIFT, FLAKE, LLM_API_ERROR)
//     are NOT scaffold-supported BY DESIGN. FLAKE / LLM_API_ERROR / PASS
//     short-circuit through SKIP_CLASS_ESCALATIONS in fix-prompt-builder.js;
//     the others have no current producer wired into the auto-fix workflow.
//   - Iterating PROMPT_SCAFFOLDS keys gives the precise "must be at all
//     5 sites" set without false positives on the intentional gaps.
//
// Future scope changes to this iteration source (e.g. switching to a 5-key
// subset of PROMPT_SCAFFOLDS, or back to ERROR_CLASSES) require visible diff
// hits on the doc-comment block above so reviewers notice the change. T-65-DG-02.
//
// THE 5 CANONICAL ENUMERATION SITES
// ---------------------------------
//   1. `tests/e2e/lib/error-codes.js`              — `ERROR_CLASSES` array
//   2. `.github/workflows/v40-auto-fix.yml`        — precheck `for cls in ...` loop
//   3. `tests/e2e/lib/fix-prompt-builder.js`       — `PROMPT_SCAFFOLDS` registry
//   4. `tests/e2e/scripts/inject-defect.mjs`       — `ERROR_CLASSES` Set
//   5. `tests/e2e/lib/llm-router.js`               — `MODEL_ROUTES` entry OR
//                                                    `// MODEL_DEFAULT_OK: <CLASS>`
//                                                    comment
//
// HARNESS_ERROR EXCEPTION
// -----------------------
// HARNESS_ERROR is scaffold-supported (it has a PROMPT_SCAFFOLDS entry) but
// is intentionally NOT a member of the ERROR_CLASSES array — see the
// Phase 45 design note in tests/e2e/lib/error-codes.js lines 90-96
// ("HARNESS_ERROR: ... Not a member of ERROR_CLASSES — only the LLM report
// tallies it."). Site 1 (error-codes.js ERROR_CLASSES) hard-codes this
// exception with a comment justification; the other 4 sites still require
// HARNESS_ERROR presence.
//
// FAILURE MESSAGE CONTRACT
// ------------------------
// Each per-site helper returns {ok:boolean, message:string}. The failure
// `message` MUST contain the literal substring
// `is in PROMPT_SCAFFOLDS but missing from <site>` so the actionable
// signal in CI logs names BOTH the offending class AND the offending site.
// This contract is pinned by the helper-failure-shape test at the bottom.
//
// TRUST INVARIANTS
// ----------------
// This file's runtime imports a small set of pure-function libraries
// (fix-prompt-builder.js / error-codes.js / llm-router.js — all pure per D-04)
// and reads 3 source files via fs.readFileSync. NO transport-layer code is
// imported. NO network. NO process.exec.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PROMPT_SCAFFOLDS } from '../../tests/e2e/lib/fix-prompt-builder.js';
import { ERROR_CLASSES } from '../../tests/e2e/lib/error-codes.js';
import { MODEL_ROUTES } from '../../tests/e2e/lib/llm-router.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);

const SCAFFOLD_KEYS = Object.keys(PROMPT_SCAFFOLDS);

// HARNESS_ERROR is scaffold-supported but NOT in ERROR_CLASSES — see the
// Phase 45 design note in tests/e2e/lib/error-codes.js lines 90-96. Hard-code
// this exception with a justification comment so the test is reading the
// design contract, not asserting against it.
const HARNESS_ERROR_EXCEPTION = 'HARNESS_ERROR';

// Resolved absolute paths for the 5 canonical enumeration sites.
const SITE_PATHS = Object.freeze({
  errorCodes: path.join(REPO_ROOT, 'tests/e2e/lib/error-codes.js'),
  workflow: path.join(REPO_ROOT, '.github/workflows/v40-auto-fix.yml'),
  fixPromptBuilder: path.join(REPO_ROOT, 'tests/e2e/lib/fix-prompt-builder.js'),
  injectDefect: path.join(REPO_ROOT, 'tests/e2e/scripts/inject-defect.mjs'),
  llmRouter: path.join(REPO_ROOT, 'tests/e2e/lib/llm-router.js'),
});

// ---------------------------------------------------------------------------
// Per-site helpers — each returns {ok:boolean, message:string}
// ---------------------------------------------------------------------------

/**
 * Site 1 — `tests/e2e/lib/error-codes.js` ERROR_CLASSES array.
 *
 * HARNESS_ERROR is the documented exception (Phase 45 design): NOT in
 * ERROR_CLASSES but IS scaffold-supported. All other PROMPT_SCAFFOLDS keys
 * MUST appear in the ERROR_CLASSES Object.freeze array.
 */
function checkErrorCodesArray(className) {
  if (className === HARNESS_ERROR_EXCEPTION) {
    // Documented exception — not asserted at site 1.
    return { ok: true, message: '' };
  }
  if (ERROR_CLASSES.includes(className)) {
    return { ok: true, message: '' };
  }
  return {
    ok: false,
    message:
      `ERROR_CLASS '${className}' is in PROMPT_SCAFFOLDS but missing from ` +
      `site 1 (error-codes.js ERROR_CLASSES): expected literal '${className}' ` +
      `in ${SITE_PATHS.errorCodes}`,
  };
}

/**
 * Site 2 — `.github/workflows/v40-auto-fix.yml` precheck `for cls in ...` loop.
 *
 * The workflow line ~91 enumerates every recognized ERROR_CLASS label token.
 * Use a regex that anchors to the `for cls in` clause then word-matches the
 * className token before the trailing `; do`.
 */
function checkWorkflowPrecheck(className) {
  let content;
  try {
    content = fs.readFileSync(SITE_PATHS.workflow, 'utf8');
  } catch (err) {
    return {
      ok: false,
      message:
        `ERROR_CLASS '${className}' is in PROMPT_SCAFFOLDS but missing from ` +
        `site 2 (v40-auto-fix.yml precheck): failed to read ${SITE_PATHS.workflow} — ${err.message}`,
    };
  }
  // Match the precheck loop line specifically: `for cls in <tokens>; do`.
  const re = new RegExp(
    `for\\s+cls\\s+in\\s+[^;]*\\b${className}\\b[^;]*;\\s*do`,
  );
  if (re.test(content)) {
    return { ok: true, message: '' };
  }
  return {
    ok: false,
    message:
      `ERROR_CLASS '${className}' is in PROMPT_SCAFFOLDS but missing from ` +
      `site 2 (v40-auto-fix.yml precheck for-loop): expected literal ` +
      `'${className}' on the 'for cls in ...; do' line in ${SITE_PATHS.workflow}`,
  };
}

/**
 * Site 3 — `tests/e2e/lib/fix-prompt-builder.js` PROMPT_SCAFFOLDS registry.
 *
 * Since we iterate `Object.keys(PROMPT_SCAFFOLDS)` we know the key is in the
 * runtime object. This helper still validates the per-key contract
 * (`typeof === 'function'`) so a degenerate registry mutation (e.g. value
 * replaced with `null`) is caught.
 */
function checkPromptScaffolds(className) {
  if (typeof PROMPT_SCAFFOLDS[className] === 'function') {
    return { ok: true, message: '' };
  }
  return {
    ok: false,
    message:
      `ERROR_CLASS '${className}' is in PROMPT_SCAFFOLDS but missing from ` +
      `site 3 (fix-prompt-builder.js PROMPT_SCAFFOLDS registry): expected ` +
      `typeof PROMPT_SCAFFOLDS['${className}'] === 'function' in ` +
      `${SITE_PATHS.fixPromptBuilder}`,
  };
}

/**
 * Site 4 — `tests/e2e/scripts/inject-defect.mjs` ERROR_CLASSES Set literal.
 *
 * The mutator allowlist is a `new Set([...])` of single-quoted string
 * literals. Assert the single-quoted form is present.
 */
function checkInjectDefectSet(className) {
  let content;
  try {
    content = fs.readFileSync(SITE_PATHS.injectDefect, 'utf8');
  } catch (err) {
    return {
      ok: false,
      message:
        `ERROR_CLASS '${className}' is in PROMPT_SCAFFOLDS but missing from ` +
        `site 4 (inject-defect.mjs ERROR_CLASSES Set): failed to read ${SITE_PATHS.injectDefect} — ${err.message}`,
    };
  }
  // Single-quoted string literal as it would appear inside the Set literal.
  const needle = `'${className}'`;
  if (content.includes(needle)) {
    return { ok: true, message: '' };
  }
  return {
    ok: false,
    message:
      `ERROR_CLASS '${className}' is in PROMPT_SCAFFOLDS but missing from ` +
      `site 4 (inject-defect.mjs ERROR_CLASSES Set): expected literal ` +
      `'${needle}' in ${SITE_PATHS.injectDefect}`,
  };
}

/**
 * Site 5 — `tests/e2e/lib/llm-router.js` — EITHER MODEL_ROUTES has an entry
 * OR a `// MODEL_DEFAULT_OK: <CLASS>` comment justifies the sonnet default.
 */
function checkLlmRouterCoverage(className) {
  if (className in MODEL_ROUTES) {
    return { ok: true, message: '' };
  }
  let content;
  try {
    content = fs.readFileSync(SITE_PATHS.llmRouter, 'utf8');
  } catch (err) {
    return {
      ok: false,
      message:
        `ERROR_CLASS '${className}' is in PROMPT_SCAFFOLDS but missing from ` +
        `site 5 (llm-router.js routing coverage): failed to read ${SITE_PATHS.llmRouter} — ${err.message}`,
    };
  }
  const commentNeedle = `// MODEL_DEFAULT_OK: ${className}`;
  if (content.includes(commentNeedle)) {
    return { ok: true, message: '' };
  }
  return {
    ok: false,
    message:
      `ERROR_CLASS '${className}' is in PROMPT_SCAFFOLDS but missing from ` +
      `site 5 (llm-router.js routing coverage): expected EITHER a MODEL_ROUTES ` +
      `entry for '${className}' OR the literal comment ` +
      `'${commentNeedle}' in ${SITE_PATHS.llmRouter}`,
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Phase 65 SCAF-03 — 5-site enumeration drift guard', () => {
  it('sanity: PROMPT_SCAFFOLDS has exactly 7 keys', () => {
    // If Plan 65-01 regressed (e.g. someone deleted VERIFIER_DISAGREE or
    // FRAME_SHIFT_DETECTED) this assertion fails before the parameterized
    // site checks run — clearer error signal.
    expect(SCAFFOLD_KEYS).toHaveLength(7);
  });

  it('sanity: SCAFFOLD_KEYS contains both Phase 65 newcomers', () => {
    expect(SCAFFOLD_KEYS).toContain('VERIFIER_DISAGREE');
    expect(SCAFFOLD_KEYS).toContain('FRAME_SHIFT_DETECTED');
  });

  it.each(SCAFFOLD_KEYS)(
    'site 1 (error-codes.js ERROR_CLASSES): %s present (or documented exception)',
    (className) => {
      const r = checkErrorCodesArray(className);
      expect(r.ok, r.message).toBe(true);
    },
  );

  it.each(SCAFFOLD_KEYS)(
    'site 2 (v40-auto-fix.yml precheck): %s present in for-loop',
    (className) => {
      const r = checkWorkflowPrecheck(className);
      expect(r.ok, r.message).toBe(true);
    },
  );

  it.each(SCAFFOLD_KEYS)(
    'site 3 (fix-prompt-builder.js PROMPT_SCAFFOLDS): %s is a function thunk',
    (className) => {
      const r = checkPromptScaffolds(className);
      expect(r.ok, r.message).toBe(true);
    },
  );

  it.each(SCAFFOLD_KEYS)(
    'site 4 (inject-defect.mjs ERROR_CLASSES Set): %s present',
    (className) => {
      const r = checkInjectDefectSet(className);
      expect(r.ok, r.message).toBe(true);
    },
  );

  it.each(SCAFFOLD_KEYS)(
    "site 5 (llm-router.js MODEL_ROUTES or // MODEL_DEFAULT_OK comment): %s covered",
    (className) => {
      const r = checkLlmRouterCoverage(className);
      expect(r.ok, r.message).toBe(true);
    },
  );

  // HARNESS_ERROR exception explicit-coverage tests — make the design
  // contract directly inspectable in the test report.
  it("HARNESS_ERROR exception: documented absence from ERROR_CLASSES is respected at site 1", () => {
    // HARNESS_ERROR MUST NOT be in ERROR_CLASSES (Phase 45 design note).
    expect(ERROR_CLASSES).not.toContain(HARNESS_ERROR_EXCEPTION);
    // ...but the site-1 helper MUST still pass for it (the exception is
    // applied internally so the parameterized check above does not flake).
    const r = checkErrorCodesArray(HARNESS_ERROR_EXCEPTION);
    expect(r.ok, r.message).toBe(true);
  });

  it("HARNESS_ERROR exception: still required at sites 2-5", () => {
    expect(checkWorkflowPrecheck(HARNESS_ERROR_EXCEPTION).ok).toBe(true);
    expect(checkPromptScaffolds(HARNESS_ERROR_EXCEPTION).ok).toBe(true);
    expect(checkInjectDefectSet(HARNESS_ERROR_EXCEPTION).ok).toBe(true);
    expect(checkLlmRouterCoverage(HARNESS_ERROR_EXCEPTION).ok).toBe(true);
  });

  // Helper failure-message shape — synthetic missing-K scenario asserts the
  // actionable error-message substring contract.
  it('helper failure-message shape: contains "is in PROMPT_SCAFFOLDS but missing from"', () => {
    // None of the helpers will find a nonexistent class at the workflow site.
    const r = checkWorkflowPrecheck('___NONEXISTENT_CLASS___');
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/is in PROMPT_SCAFFOLDS but missing from/);
    // Verify the message names the offending site by number.
    expect(r.message).toMatch(/site 2/);
  });

  it('helper failure-message shape: all 5 helpers honor the substring contract', () => {
    const synthetic = '___NONEXISTENT_CLASS___';
    const helpers = [
      ['site 1', checkErrorCodesArray],
      ['site 2', checkWorkflowPrecheck],
      ['site 3', checkPromptScaffolds],
      ['site 4', checkInjectDefectSet],
      ['site 5', checkLlmRouterCoverage],
    ];
    for (const [label, fn] of helpers) {
      const r = fn(synthetic);
      expect(r.ok, `${label} should have rejected the synthetic class`).toBe(
        false,
      );
      expect(r.message).toMatch(/is in PROMPT_SCAFFOLDS but missing from/);
    }
  });
});

// tests/unit/llm-router.test.js
//
// Phase 54 Plan 01 (AB-01) — pin the pure-function ERROR_CLASS → model SLUG
// router shipped in tests/e2e/lib/llm-router.js.
//
// PIN MATRIX
// ----------
//   1.  GOOGLE_DOM_DRIFT             → 'claude-opus-4-7'   (D-03)
//   2.  LLM_HALLUCINATED_SELECTION   → 'claude-opus-4-7'   (D-03)
//   3.  WRONG_CITATION               → 'claude-sonnet-4-6' (default fallthrough)
//   4.  WORKER_FALLBACK_FAILED       → 'claude-sonnet-4-6' (default fallthrough)
//   5.  HARNESS_ERROR                → 'claude-sonnet-4-6' (default fallthrough)
//   6.  UNKNOWN_CLASS_NOT_IN_TABLE   → 'claude-sonnet-4-6' (defensive)
//   7.  null                         → 'claude-sonnet-4-6' (null-safety via ??)
//   8.  undefined                    → 'claude-sonnet-4-6' (undefined-safety via ??)
//   9.  Object.isFrozen(MODEL_ROUTES) === true             (D-02 freeze invariant)
//  10.  Direct table lookups + mutation guard              (table contents pin)
//
// PURITY INVARIANT
// ----------------
// The llm-router.js module is required to have ZERO imports (D-04: no src/,
// no sibling tests/e2e/lib/* transports, no SDK). This test file is the
// source of truth for that — Test 11 reads the source file and grep-counts
// `^import` / `^require` lines.
//
// LIVE-FILE GREP (Test 11) intentionally reads the on-disk source of
// llm-router.js rather than re-deriving the same property from imports — the
// goal is to surface any future edit that adds an import (even a node:*
// import which is permitted by D-04 but unneeded for routing).

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODEL_ROUTES, routeModel } from '../e2e/lib/llm-router.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const ROUTER_SRC_PATH = path.join(REPO_ROOT, 'tests', 'e2e', 'lib', 'llm-router.js');

describe('Phase 54 AB-01: routeModel(errorClass) — opus routing', () => {
  it('routes GOOGLE_DOM_DRIFT to claude-opus-4-7', () => {
    expect(routeModel('GOOGLE_DOM_DRIFT')).toBe('claude-opus-4-7');
  });

  it('routes LLM_HALLUCINATED_SELECTION to claude-opus-4-7', () => {
    expect(routeModel('LLM_HALLUCINATED_SELECTION')).toBe('claude-opus-4-7');
  });
});

describe('Phase 54 AB-01: routeModel(errorClass) — sonnet default fallthrough', () => {
  it('routes WRONG_CITATION to claude-sonnet-4-6 (default fallthrough)', () => {
    expect(routeModel('WRONG_CITATION')).toBe('claude-sonnet-4-6');
  });

  it('routes WORKER_FALLBACK_FAILED to claude-sonnet-4-6 (default fallthrough)', () => {
    expect(routeModel('WORKER_FALLBACK_FAILED')).toBe('claude-sonnet-4-6');
  });

  it('routes HARNESS_ERROR to claude-sonnet-4-6 (default fallthrough)', () => {
    expect(routeModel('HARNESS_ERROR')).toBe('claude-sonnet-4-6');
  });

  it('routes UNKNOWN_CLASS_NOT_IN_TABLE to claude-sonnet-4-6 (defensive fallback)', () => {
    expect(routeModel('UNKNOWN_CLASS_NOT_IN_TABLE')).toBe('claude-sonnet-4-6');
  });

  it('routes null to claude-sonnet-4-6 (null-safety via ??)', () => {
    expect(routeModel(null)).toBe('claude-sonnet-4-6');
  });

  it('routes undefined to claude-sonnet-4-6 (undefined-safety via ??)', () => {
    expect(routeModel(undefined)).toBe('claude-sonnet-4-6');
  });
});

describe('Phase 54 AB-01: MODEL_ROUTES table contract', () => {
  it('Object.isFrozen(MODEL_ROUTES) is true (D-02 freeze invariant)', () => {
    expect(Object.isFrozen(MODEL_ROUTES)).toBe(true);
  });

  it('MODEL_ROUTES contains exactly the two opus-routed classes', () => {
    // Pin the table contents — direct key lookup. This is the contract
    // that AB-04's winner-declaration script ultimately compares against.
    expect(MODEL_ROUTES.GOOGLE_DOM_DRIFT).toBe('claude-opus-4-7');
    expect(MODEL_ROUTES.LLM_HALLUCINATED_SELECTION).toBe('claude-opus-4-7');
    // No other keys: sparse table by design (D-03 — defaults fall through
    // via routeModel's `??`). Future opus additions go here.
    expect(Object.keys(MODEL_ROUTES).sort()).toEqual(
      ['GOOGLE_DOM_DRIFT', 'LLM_HALLUCINATED_SELECTION'].sort(),
    );
  });

  it('strict-mode mutation attempt throws TypeError (freeze enforced)', () => {
    // ES modules are always strict — direct assignment on a frozen object
    // throws TypeError. This is the runtime guarantee that backs the
    // AB-04 winner-declaration invariant.
    expect(() => {
      // eslint-disable-next-line no-param-reassign
      MODEL_ROUTES.NEW_CLASS = 'claude-opus-4-7';
    }).toThrow(TypeError);
    expect(() => {
      // eslint-disable-next-line no-param-reassign
      MODEL_ROUTES.GOOGLE_DOM_DRIFT = 'claude-sonnet-4-6';
    }).toThrow(TypeError);
  });
});

describe('Phase 54 AB-01: llm-router.js purity invariant (D-04)', () => {
  it('source file has zero top-level import/require lines', () => {
    const src = fs.readFileSync(ROUTER_SRC_PATH, 'utf8');
    // Count lines that START with `import` or `require` (ignoring leading
    // whitespace — covers indented dynamic imports too). Comments mentioning
    // imports in narrative prose are fine because they start with `//`.
    const importLines = src
      .split(/\r?\n/)
      .filter((line) => /^\s*(import\b|require\b|const\s+\S+\s*=\s*require\b)/.test(line));
    expect(importLines).toEqual([]);
  });
});

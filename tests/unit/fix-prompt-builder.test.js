// tests/unit/fix-prompt-builder.test.js
//
// Phase 42 Plan 01 (PROMPT-01, PROMPT-03) — pin the pure-function
// fix-prompt-builder.js library:
//
//   * envelope contract (PROMPT-01)            — buildFixPrompt() wraps the
//                                                 issue body in
//                                                 <issue_body_untrusted>...
//                                                 </issue_body_untrusted>
//                                                 with NOTHING outside.
//   * frozen registry shape (PROMPT-03)        — PROMPT_SCAFFOLDS is
//                                                 Object.freeze()'d with
//                                                 EXACTLY 1 key (WRONG_CITATION)
//                                                 in Phase 42; Phase 45 adds
//                                                 4 more.
//   * skip-class returns                       — FLAKE/LLM_API_ERROR/PASS
//                                                 short-circuit BEFORE the
//                                                 envelope is built.
//   * SYSTEM-prompt content                    — references the diff-fence
//                                                 markers AND enumerates the
//                                                 6 FORBIDDEN paths from the
//                                                 diff-guard regex bank so the
//                                                 LLM cannot touch them.
//
// PURE: this module's tests do NOT import node:fs / node:child_process /
// node:path / @anthropic-ai/sdk. The fix-prompt-builder module itself is
// purity-guarded by a per-file ESLint block (PROMPT-04, separate test file).
//
// RED gate signal: this file imports a not-yet-existing module
// (tests/e2e/lib/fix-prompt-builder.js). Vitest module-load failure IS the
// initial RED. Once the module exists (Task 2 GREEN) the assertions take over.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildFixPrompt,
  PROMPT_SCAFFOLDS,
  ENVELOPE_OPEN,
  ENVELOPE_CLOSE,
  DIFF_FENCE_START,
  DIFF_FENCE_END,
  buildScaffoldSystemPrompt,
} from '../../tests/e2e/lib/fix-prompt-builder.js';

// __dirname shim for ES modules — needed by the Phase 45 historical-replay
// describe block below to read fixture files. The test file is permitted
// node:fs / node:path imports; only the PURE library (fix-prompt-builder.js)
// is purity-guarded by PROMPT-04.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// PROMPT-01: envelope wrapping is literal and complete
// ---------------------------------------------------------------------------

describe('Phase 42 PROMPT-01: buildFixPrompt envelope wrapping', () => {
  it('wraps a single-line benign body in <issue_body_untrusted>...</issue_body_untrusted>', () => {
    const issueBody = 'Some short triage finding text here.';
    const result = buildFixPrompt({ errorClass: 'WRONG_CITATION', issueBody });
    expect(result.ok).toBe(true);
    // EXACT envelope wrap — no leading/trailing content, no extra whitespace.
    expect(result.userPrompt).toBe(
      `${ENVELOPE_OPEN}\n${issueBody}\n${ENVELOPE_CLOSE}`,
    );
    // Sanity: envelope strings are the locked literals.
    expect(ENVELOPE_OPEN).toBe('<issue_body_untrusted>');
    expect(ENVELOPE_CLOSE).toBe('</issue_body_untrusted>');
  });

  it('wraps a multi-line body (preserves internal newlines)', () => {
    const issueBody = [
      '<!-- fp: deadbeef1234 -->',
      '',
      '### Reproducer',
      'case-id: US11427642-spec-short-1',
      'seed: 42',
    ].join('\n');
    const result = buildFixPrompt({ errorClass: 'WRONG_CITATION', issueBody });
    expect(result.ok).toBe(true);
    expect(result.userPrompt.startsWith(`${ENVELOPE_OPEN}\n`)).toBe(true);
    expect(result.userPrompt.endsWith(`\n${ENVELOPE_CLOSE}`)).toBe(true);
    // Body is the only content inside the envelope.
    const inner = result.userPrompt
      .slice(ENVELOPE_OPEN.length + 1, result.userPrompt.length - ENVELOPE_CLOSE.length - 1);
    expect(inner).toBe(issueBody);
  });

  it('returns a non-empty systemPrompt for the supported class', () => {
    const result = buildFixPrompt({ errorClass: 'WRONG_CITATION', issueBody: 'x' });
    expect(result.ok).toBe(true);
    expect(typeof result.systemPrompt).toBe('string');
    expect(result.systemPrompt.length).toBeGreaterThan(200);
  });
});

// ---------------------------------------------------------------------------
// PROMPT-03: PROMPT_SCAFFOLDS registry shape (frozen, exactly 1 key)
// ---------------------------------------------------------------------------

describe('Phase 42 PROMPT-03: PROMPT_SCAFFOLDS registry shape', () => {
  it('is Object.freeze()-d', () => {
    expect(Object.isFrozen(PROMPT_SCAFFOLDS)).toBe(true);
  });

  // Phase 42 originally asserted EXACTLY 1 key (WRONG_CITATION). Phase 45 Plan
  // 01 extended the registry to 5 keys. The 5-key shape regression guard
  // lives in the new `describe('Phase 45 PROMPT-03 extension: ...')` block
  // below. We keep this case as a documentation marker that the count is now
  // load-bearing at 5.
  it('has EXACTLY 5 keys after Phase 45 expansion (WRONG_CITATION + 4 additions)', () => {
    const keys = Object.keys(PROMPT_SCAFFOLDS);
    expect(keys.length).toBe(5);
    expect(keys.sort()).toEqual([
      'GOOGLE_DOM_DRIFT',
      'HARNESS_ERROR',
      'LLM_HALLUCINATED_SELECTION',
      'WORKER_FALLBACK_FAILED',
      'WRONG_CITATION',
    ]);
  });

  it('PROMPT_SCAFFOLDS.WRONG_CITATION is callable and returns a non-empty string', () => {
    expect(typeof PROMPT_SCAFFOLDS.WRONG_CITATION).toBe('function');
    const out = PROMPT_SCAFFOLDS.WRONG_CITATION();
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(200);
  });
});

// ---------------------------------------------------------------------------
// Skip-class short-circuits (FLAKE, LLM_API_ERROR, PASS)
// ---------------------------------------------------------------------------

describe('Phase 42 PROMPT-03: skip-class returns are exact escalation shapes', () => {
  it('FLAKE → {ok:false, escalate:"re-quarantine"}', () => {
    const r = buildFixPrompt({ errorClass: 'FLAKE', issueBody: 'irrelevant' });
    expect(r).toEqual({ ok: false, escalate: 're-quarantine' });
  });

  it('LLM_API_ERROR → {ok:false, escalate:"retry"}', () => {
    const r = buildFixPrompt({ errorClass: 'LLM_API_ERROR', issueBody: 'irrelevant' });
    expect(r).toEqual({ ok: false, escalate: 'retry' });
  });

  it('PASS → {ok:false, escalate:"close-as-pass"}', () => {
    const r = buildFixPrompt({ errorClass: 'PASS', issueBody: 'irrelevant' });
    expect(r).toEqual({ ok: false, escalate: 'close-as-pass' });
  });

  // Phase 42 used GOOGLE_DOM_DRIFT as the canonical "unsupported, Phase 45
  // will add it" exemplar. Phase 45 Plan 01 promoted it into PROMPT_SCAFFOLDS,
  // so the unsupported-class exemplar changes to a synthesized class name
  // that lives in NEITHER PROMPT_SCAFFOLDS NOR SKIP_CLASS_ESCALATIONS.
  it('unsupported errorClass (synthesized BOGUS_CLASS) → unsupported-class:<name>', () => {
    const r = buildFixPrompt({ errorClass: 'BOGUS_CLASS_NOT_IN_RPT02', issueBody: 'x' });
    expect(r.ok).toBe(false);
    expect(typeof r.escalate).toBe('string');
    expect(r.escalate.startsWith('unsupported-class:')).toBe(true);
    expect(r.escalate).toContain('BOGUS_CLASS_NOT_IN_RPT02');
  });
});

// ---------------------------------------------------------------------------
// WRONG_CITATION SYSTEM prompt content — fences + locked forbidden paths
// ---------------------------------------------------------------------------

describe('Phase 42 PROMPT-01: WRONG_CITATION systemPrompt content', () => {
  it('contains the literal DIFF_FENCE_START and DIFF_FENCE_END constants', () => {
    const r = buildFixPrompt({ errorClass: 'WRONG_CITATION', issueBody: 'x' });
    expect(r.systemPrompt).toContain(DIFF_FENCE_START);
    expect(r.systemPrompt).toContain(DIFF_FENCE_END);
    // Sanity: the fences are the locked v4.0 values.
    expect(DIFF_FENCE_START).toBe('===DIFF_START===');
    expect(DIFF_FENCE_END).toBe('===DIFF_END===');
  });

  it('enumerates all 6 LOCKED forbidden paths from check-diff-guard.mjs as literal substrings', () => {
    const r = buildFixPrompt({ errorClass: 'WRONG_CITATION', issueBody: 'x' });
    const FORBIDDEN_PATH_LITERALS = [
      'tests/test-cases.js',
      'tests/golden/baseline.json',
      'tests/e2e/test-cases-quarantine.js',
      '.github/workflows/v40-',
      'tests/e2e/.llm-spend-ledger.json',
      '.github/CODEOWNERS',
    ];
    for (const p of FORBIDDEN_PATH_LITERALS) {
      expect(r.systemPrompt).toContain(p);
    }
  });
});

// ---------------------------------------------------------------------------
// Phase 45 PROMPT-03 extension: buildScaffoldSystemPrompt helper
// ---------------------------------------------------------------------------
//
// The Phase 45 plan extracts the 5-section system-prompt boilerplate
// (trust-boundary, fix-surface-contract, forbidden-paths, diff-size-cap,
// output-format) into a single pure helper so the 4 new ERROR_CLASS scaffolds
// share a single source of truth with the existing WRONG_CITATION_SYSTEM.
//
// The helper takes { className, fixSurfaceContract } and returns the assembled
// system-prompt string. Existing Phase 42 tests above keep proving the
// composed WRONG_CITATION output is byte-stable on the load-bearing substrings
// (envelope wrapping, forbidden paths, diff-fence values).

describe('Phase 45 PROMPT-03 extension: buildScaffoldSystemPrompt helper', () => {
  it('is exported as a function', () => {
    expect(typeof buildScaffoldSystemPrompt).toBe('function');
  });

  it('returns a string interpolating the className into the opening sentence', () => {
    const out = buildScaffoldSystemPrompt({
      className: 'LLM_HALLUCINATED_SELECTION',
      fixSurfaceContract: 'edit foo.js',
    });
    expect(typeof out).toBe('string');
    expect(out).toContain('LLM_HALLUCINATED_SELECTION');
    expect(out).toContain('senior TypeScript/JavaScript engineer');
  });

  it('contains the literal Trust boundary section referencing ENVELOPE_OPEN/CLOSE by value', () => {
    const out = buildScaffoldSystemPrompt({
      className: 'WORKER_FALLBACK_FAILED',
      fixSurfaceContract: 'irrelevant',
    });
    expect(out).toContain('## Trust boundary');
    expect(out).toContain(ENVELOPE_OPEN);
    expect(out).toContain(ENVELOPE_CLOSE);
    expect(out).toMatch(/UNTRUSTED DATA/);
  });

  it('splices the fixSurfaceContract argument into a ## Fix surface contract section', () => {
    const contract = 'EDIT: src/foo.js\nDO NOT: widen the selector\nBLAH BLAH';
    const out = buildScaffoldSystemPrompt({
      className: 'GOOGLE_DOM_DRIFT',
      fixSurfaceContract: contract,
    });
    expect(out).toContain('## Fix surface contract');
    expect(out).toContain('EDIT: src/foo.js');
    expect(out).toContain('DO NOT: widen the selector');
  });

  it('enumerates all 6 LOCKED forbidden paths verbatim regardless of className', () => {
    const out = buildScaffoldSystemPrompt({
      className: 'HARNESS_ERROR',
      fixSurfaceContract: 'noop',
    });
    const FORBIDDEN_PATH_LITERALS = [
      'tests/test-cases.js',
      'tests/golden/baseline.json',
      'tests/e2e/test-cases-quarantine.js',
      '.github/workflows/v40-',
      'tests/e2e/.llm-spend-ledger.json',
      '.github/CODEOWNERS',
    ];
    expect(out).toContain('## Forbidden paths');
    for (const p of FORBIDDEN_PATH_LITERALS) {
      expect(out).toContain(p);
    }
  });

  it('contains the diff-size-cap section with ≤200 / ≤50 line thresholds', () => {
    const out = buildScaffoldSystemPrompt({
      className: 'WRONG_CITATION',
      fixSurfaceContract: 'noop',
    });
    expect(out).toContain('## Diff size cap');
    expect(out).toContain('≤200 lines');
    expect(out).toContain('≤50 lines');
    expect(out).toContain('TODO(human-review)');
  });

  it('contains the output-format section with DIFF_FENCE_START/END values', () => {
    const out = buildScaffoldSystemPrompt({
      className: 'WRONG_CITATION',
      fixSurfaceContract: 'noop',
    });
    expect(out).toContain('## Output format');
    expect(out).toContain(DIFF_FENCE_START);
    expect(out).toContain(DIFF_FENCE_END);
    expect(out).toContain('===DIFF_START===');
    expect(out).toContain('===DIFF_END===');
  });

  it('is pure — same inputs produce byte-identical output across calls', () => {
    const inputs = { className: 'HARNESS_ERROR', fixSurfaceContract: 'foo\nbar\nbaz' };
    const a = buildScaffoldSystemPrompt(inputs);
    const b = buildScaffoldSystemPrompt(inputs);
    expect(a).toBe(b);
  });

  it('refactored WRONG_CITATION_SYSTEM still preserves cite-by-position contract substring', () => {
    const out = PROMPT_SCAFFOLDS.WRONG_CITATION();
    expect(out).toContain('cite-by-position');
    expect(out).toContain('col:line');
  });
});

// ---------------------------------------------------------------------------
// Phase 45 PROMPT-03 extension: PROMPT_SCAFFOLDS shape (5 keys, all frozen)
// ---------------------------------------------------------------------------

describe('Phase 45 PROMPT-03 extension: 4 new ERROR_CLASS scaffolds', () => {
  const FORBIDDEN_PATH_LITERALS = [
    'tests/test-cases.js',
    'tests/golden/baseline.json',
    'tests/e2e/test-cases-quarantine.js',
    '.github/workflows/v40-',
    'tests/e2e/.llm-spend-ledger.json',
    '.github/CODEOWNERS',
  ];

  // Per-class surface fingerprint — each class names ≥1 unique fix-surface
  // path so the registry routing cannot accidentally re-use WRONG_CITATION's
  // contract for another class.
  const CLASS_SURFACE_FINGERPRINTS = {
    LLM_HALLUCINATED_SELECTION: ['tests/e2e/lib/select-text.js'],
    WORKER_FALLBACK_FAILED: ['src/cf-worker/index.js', 'src/shared/uspto-fallback.js'],
    GOOGLE_DOM_DRIFT: ['tests/e2e/lib/google-patents-page.js', 'data-testid'],
    HARNESS_ERROR: ['tests/e2e/specs/', 'Playwright config'],
  };

  it('PROMPT_SCAFFOLDS exports exactly 5 keys (WRONG_CITATION + 4 Phase 45 additions)', () => {
    const keys = Object.keys(PROMPT_SCAFFOLDS).sort();
    expect(keys).toEqual([
      'GOOGLE_DOM_DRIFT',
      'HARNESS_ERROR',
      'LLM_HALLUCINATED_SELECTION',
      'WORKER_FALLBACK_FAILED',
      'WRONG_CITATION',
    ]);
  });

  it('PROMPT_SCAFFOLDS remains Object.frozen after extension', () => {
    expect(Object.isFrozen(PROMPT_SCAFFOLDS)).toBe(true);
  });

  it('mutation attempt on PROMPT_SCAFFOLDS throws TypeError in strict mode', () => {
    'use strict';
    expect(() => {
      PROMPT_SCAFFOLDS.NEW_KEY = () => 'x';
    }).toThrow(TypeError);
  });

  it('every PROMPT_SCAFFOLDS value is a thunk returning a non-empty string', () => {
    for (const k of Object.keys(PROMPT_SCAFFOLDS)) {
      expect(typeof PROMPT_SCAFFOLDS[k]).toBe('function');
      const out = PROMPT_SCAFFOLDS[k]();
      expect(typeof out).toBe('string');
      expect(out.length).toBeGreaterThan(200);
    }
  });

  // Per-class assertion battery (envelope + class-in-prompt + 6 forbidden +
  // fence-by-value + class-specific surface fingerprints).
  for (const className of Object.keys(CLASS_SURFACE_FINGERPRINTS)) {
    it(`${className}: buildFixPrompt returns ok:true envelope-wrapped result with class-specific fix surface`, () => {
      const issueBody = `<!-- fp: 0123456789ab -->\ncase-id: sample-1\nrationale text`;
      const r = buildFixPrompt({ errorClass: className, issueBody });

      // (a) ok:true
      expect(r.ok).toBe(true);

      // (b) userPrompt LITERAL: ENVELOPE_OPEN\n<body>\nENVELOPE_CLOSE
      expect(r.userPrompt).toBe(`${ENVELOPE_OPEN}\n${issueBody}\n${ENVELOPE_CLOSE}`);

      // (c) systemPrompt contains the class name
      expect(r.systemPrompt).toContain(className);

      // (d) systemPrompt contains the class-specific surface paths
      for (const surface of CLASS_SURFACE_FINGERPRINTS[className]) {
        expect(r.systemPrompt).toContain(surface);
      }

      // (e) systemPrompt enumerates all 6 forbidden paths verbatim
      for (const p of FORBIDDEN_PATH_LITERALS) {
        expect(r.systemPrompt).toContain(p);
      }

      // (f) systemPrompt contains the diff-fence values
      expect(r.systemPrompt).toContain(DIFF_FENCE_START);
      expect(r.systemPrompt).toContain(DIFF_FENCE_END);
    });
  }
});

// ---------------------------------------------------------------------------
// Phase 45 PROMPT-03 extension: skip-class returns UNCHANGED
// ---------------------------------------------------------------------------
//
// Regression guard against accidentally promoting FLAKE / LLM_API_ERROR / PASS
// out of SKIP_CLASS_ESCALATIONS into PROMPT_SCAFFOLDS. The new dispatcher
// side effects (FLAKE quarantine-append reset, flake-investigation issue
// creation) live in scripts/auto-fix.mjs Step 7 (Phase 45-03), NOT here.

describe('Phase 45 PROMPT-03 extension: skip-class returns unchanged', () => {
  it('FLAKE STILL returns {ok:false, escalate:"re-quarantine"}', () => {
    const r = buildFixPrompt({ errorClass: 'FLAKE', issueBody: 'irrelevant' });
    expect(r).toEqual({ ok: false, escalate: 're-quarantine' });
  });

  it('LLM_API_ERROR STILL returns {ok:false, escalate:"retry"}', () => {
    const r = buildFixPrompt({ errorClass: 'LLM_API_ERROR', issueBody: 'irrelevant' });
    expect(r).toEqual({ ok: false, escalate: 'retry' });
  });

  it('PASS STILL returns {ok:false, escalate:"close-as-pass"}', () => {
    const r = buildFixPrompt({ errorClass: 'PASS', issueBody: 'irrelevant' });
    expect(r).toEqual({ ok: false, escalate: 'close-as-pass' });
  });
});

// ---------------------------------------------------------------------------
// Phase 45 PROMPT-03 extension: historical-replay fixtures (no SDK mocked)
// ---------------------------------------------------------------------------
//
// This block reads 4 synthesized issue-body fixtures from disk and replays
// each through buildFixPrompt to verify the integration shape (envelope wrap
// + fingerprint preservation + class-specific surface mention) under
// realistic v3.1-shape body data.
//
// IMPORTANT — fixture reuse: these 4 fixture files are DELIBERATELY designed
// to be reused by Plan 45-03's tests/unit/auto-fix.test.js extensions, which
// will mock invokeAnthropicSdkWithLedger (per Phase 42 vi.mock pattern) and
// replay the same fixtures through runDispatcher() to assert end-to-end
// diff-application. Do NOT inline-edit fixture body shape here without
// updating 45-03's expectations too — fixtures are a load-bearing test
// surface shared across plans.

describe('Phase 45 PROMPT-03 extension: historical-replay fixtures (no SDK mocked)', () => {
  // class → { fixtureSlug, expectedFingerprint, expectedSurfaceSubstring }
  const FIXTURE_TABLE = {
    LLM_HALLUCINATED_SELECTION: {
      slug: 'llm-hallucinated-selection',
      fingerprint: 'a1b2c3d4e5f6',
      surface: 'tests/e2e/lib/select-text.js',
    },
    WORKER_FALLBACK_FAILED: {
      slug: 'worker-fallback-failed',
      fingerprint: 'b2c3d4e5f6a1',
      surface: 'src/cf-worker/index.js',
    },
    GOOGLE_DOM_DRIFT: {
      slug: 'google-dom-drift',
      fingerprint: 'c3d4e5f6a1b2',
      surface: 'tests/e2e/lib/google-patents-page.js',
    },
    HARNESS_ERROR: {
      slug: 'harness-error',
      fingerprint: 'd4e5f6a1b2c3',
      surface: 'tests/e2e/specs/',
    },
  };

  for (const className of Object.keys(FIXTURE_TABLE)) {
    const { slug, fingerprint, surface } = FIXTURE_TABLE[className];
    it(`${className}: replays fixture body through buildFixPrompt and preserves envelope + fingerprint`, () => {
      const fixturePath = path.join(__dirname, 'fixtures', `${slug}-issue.md`);
      const fixtureBody = fs.readFileSync(fixturePath, 'utf8');

      // Fingerprint must be present in the raw fixture (extractFingerprint
      // regex contract from scripts/auto-fix.mjs:90-93).
      expect(fixtureBody).toContain(`<!-- fp: ${fingerprint} -->`);

      const r = buildFixPrompt({ errorClass: className, issueBody: fixtureBody });
      expect(r.ok).toBe(true);

      // Envelope wrap shape — first/last lines of userPrompt.
      expect(r.userPrompt.startsWith(`${ENVELOPE_OPEN}\n`)).toBe(true);
      expect(r.userPrompt.endsWith(`\n${ENVELOPE_CLOSE}`)).toBe(true);

      // Fingerprint line is preserved verbatim inside the envelope.
      expect(r.userPrompt).toContain(`<!-- fp: ${fingerprint} -->`);

      // systemPrompt mentions the class name and at least one class-specific
      // surface path (subset of Task 2's per-class battery; this test focuses
      // on integration with realistic body content).
      expect(r.systemPrompt).toContain(className);
      expect(r.systemPrompt).toContain(surface);
    });
  }
});

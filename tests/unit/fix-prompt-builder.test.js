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
import {
  buildFixPrompt,
  PROMPT_SCAFFOLDS,
  ENVELOPE_OPEN,
  ENVELOPE_CLOSE,
  DIFF_FENCE_START,
  DIFF_FENCE_END,
} from '../../tests/e2e/lib/fix-prompt-builder.js';

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

  it('has EXACTLY 1 key in Phase 42 (WRONG_CITATION); Phase 45 will add the other 4', () => {
    const keys = Object.keys(PROMPT_SCAFFOLDS);
    expect(keys.length).toBe(1);
    expect(keys).toEqual(['WRONG_CITATION']);
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

  it('unsupported errorClass (e.g. GOOGLE_DOM_DRIFT — Phase 45 adds it) → unsupported-class:<name>', () => {
    const r = buildFixPrompt({ errorClass: 'GOOGLE_DOM_DRIFT', issueBody: 'x' });
    expect(r.ok).toBe(false);
    expect(typeof r.escalate).toBe('string');
    expect(r.escalate.startsWith('unsupported-class:')).toBe(true);
    expect(r.escalate).toContain('GOOGLE_DOM_DRIFT');
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

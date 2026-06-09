// Phase 65 Plan 02 SCAF-04 — byte-stability sha256 pins for all 7 scaffolds.
//
// Each scaffold's invoked systemPrompt string is hashed with sha256 and
// compared against a pinned hex digest. The digest was computed at Plan 65-01
// close and recorded in 65-01-SUMMARY.md. Future edits to any scaffold's
// content MUST update the corresponding pin deliberately — this prevents
// silent drift in the prompt corpus that downstream auto-fix dispatcher
// behavior depends on.
//
// Pins:
// - 5 pre-existing scaffolds (WRONG_CITATION, LLM_HALLUCINATED_SELECTION,
//   WORKER_FALLBACK_FAILED, GOOGLE_DOM_DRIFT, HARNESS_ERROR) baseline-pinned
//   at Phase 65 (verified byte-stable against Phase 45 baseline by Plan 01).
// - 2 new scaffolds (VERIFIER_DISAGREE, FRAME_SHIFT_DETECTED) pinned at
//   Phase 65 introduction.

import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { PROMPT_SCAFFOLDS } from '../e2e/lib/fix-prompt-builder.js';

const sha256hex = (str) => createHash('sha256').update(str, 'utf8').digest('hex');

const PINS = Object.freeze({
  WRONG_CITATION: 'ae1963bfd4c7d6b6984959d331dd5e519cccc972f255691bc6a3a39a889565e8',
  LLM_HALLUCINATED_SELECTION: '73aae3edd942e127951b6430d5984edc7021828790bc3e8094bbf0f09f4691f6',
  WORKER_FALLBACK_FAILED: '5f6a3cbdee613ac0f894f86587a0f69b1f117409aab39e184db5645cc3b105d0',
  GOOGLE_DOM_DRIFT: '9a3c7ab0a7e5ae76c42e2d3cf8172a76a4ea984ec38fb96a1e888bd584f61c59',
  HARNESS_ERROR: '9c1feb64e5b747bc0e9f82d80f0efdb7a871bd24d723de46c933c3c917141b44',
  VERIFIER_DISAGREE: '16a21ecb583cf5be0ee70f1ef12e65db187df46303d5c95034927b1235491245',
  FRAME_SHIFT_DETECTED: 'fd34c9b5de27e9b6fb49c7aee8364abdd5a82b53dea669d250167e8b8b36f85f',
});

describe('Phase 65 Plan 02 SCAF-04 — fix-prompt-builder scaffold byte-stability', () => {
  it('PROMPT_SCAFFOLDS exposes exactly the 7 pinned keys', () => {
    expect(Object.keys(PROMPT_SCAFFOLDS).sort()).toEqual(Object.keys(PINS).sort());
  });

  for (const [className, pinnedDigest] of Object.entries(PINS)) {
    it(`${className}: sha256 byte-stable`, () => {
      const systemPrompt = PROMPT_SCAFFOLDS[className]();
      expect(typeof systemPrompt).toBe('string');
      expect(systemPrompt.length).toBeGreaterThan(0);
      const actual = sha256hex(systemPrompt);
      expect(actual).toBe(pinnedDigest);
    });
  }
});

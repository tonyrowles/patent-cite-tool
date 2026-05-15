// tests/unit/selection-text.test.js
//
// Unit tests for the whitespace + hyphen normalizer used by selectText
// (tests/e2e/lib/selection.js). The normalizer canonicalizes PDF-extraction
// artifacts (line-wrap hyphenation, space-around-punctuation, dehyphenated-
// with-space) so the same uniqueSubstring matches both the PDF-extracted form
// stored in tests/test-cases.js and the live HTML on Google Patents.
//
// Phase 27 SEL-01 — these tests are the Wave 0 protection for the load-bearing
// normalizer logic. Without them, a refactor to selectText's regex chain
// could silently break the cross-divergence US11427642-spec-long case (and
// other PDF-line-wrap test cases) and we would only find out by running the
// full 10-15 minute regression suite.

import { describe, it, expect } from 'vitest';
import { normalize, normalizeDeep } from '../e2e/lib/selection.js';

describe('selection text normalizer (Phase 27 SEL-01)', () => {
  describe('basic normalize: whitespace collapse + spaces-around-punctuation + spaces-around-hyphens', () => {
    it('collapses multiple internal whitespace runs to a single space', () => {
      expect(normalize('multi   space   text')).toBe('multi space text');
    });

    it('strips leading and trailing whitespace', () => {
      expect(normalize('   padded text   ')).toBe('padded text');
    });

    it('collapses mixed whitespace (tabs, newlines, NBSP-like spaces) to a single space', () => {
      // \s matches \t \n \r \f \v and unicode whitespace including U+00A0 (NBSP)
      expect(normalize('a\tb\nc d  e')).toBe('a b c d e');
    });

    it('removes spaces around hyphens (PDF dehyphenated-with-space artifact)', () => {
      expect(normalize('TALL - 2 and TRDL - 1')).toBe('TALL-2 and TRDL-1');
    });

    it('removes spaces before , ; : punctuation (PDF space-around-punct artifact)', () => {
      expect(normalize('TNFSF13 ; foo , bar : baz')).toBe('TNFSF13; foo, bar: baz');
    });

    it('roundtrips a clean HTML string to itself', () => {
      expect(normalize('a proliferation-inducing ligand')).toBe(
        'a proliferation-inducing ligand',
      );
    });

    it('is idempotent: normalize twice equals normalize once', () => {
      const s = '  TALL - 2  and   TRDL - 1 ;  foo  ';
      expect(normalize(normalize(s))).toBe(normalize(s));
    });
  });

  describe('deep normalize: also fixes PDF line-wrap hyphenation', () => {
    it('maps PDF line-wrap form (a prolif eration -inducing) to HTML form (a proliferation-inducing)', () => {
      const html = 'a proliferation-inducing ligand';
      const pdf = 'a prolif eration -inducing ligand';
      expect(normalizeDeep(pdf)).toBe(normalizeDeep(html));
    });

    it('idempotent: deep-normalize twice equals deep-normalize once', () => {
      const pdf = 'a prolif eration -inducing ligand';
      expect(normalizeDeep(normalizeDeep(pdf))).toBe(normalizeDeep(pdf));
    });

    it('does NOT collapse intra-sentence spaces between short or non-hyphenated words', () => {
      // Anti-test: deep-normalize must not corrupt ordinary prose by gluing
      // words together when no hyphen-suffix follows.
      expect(normalizeDeep('a quick fox')).toBe('a quick fox');
      expect(normalizeDeep('the the the')).toBe('the the the');
    });

    it('does NOT collapse spaces before short (<4-letter) hyphenated suffixes', () => {
      // The deep regex requires 4+ letters before the hyphen so short
      // abbreviation pairs like "TALL-2" produced by basic normalize stay
      // unaffected by the deep pass.
      expect(normalizeDeep('TALL-2 and TRDL-1')).toBe('TALL-2 and TRDL-1');
    });
  });

  describe('cross-divergence canonical form', () => {
    it('PDF-extracted and HTML forms of the US11427642-spec-long needle normalize to the same canonical string', () => {
      // Exact strings extracted from:
      //   - tests/test-cases.js entry 'US11427642-spec-long' (PDF form)
      //   - patents.google.com/patent/US11427642B2/en (HTML form, verified
      //     2026-05-14 via raw HTTP fetch — see 27-RESEARCH.md)
      const pdf =
        'receptor exclusively expressed on plasma cells and plasmablasts. ' +
        'BCMA is a receptor for two ligands in the tumor necrosis factor ' +
        '(TNF) superfamily: APRIL (a prolif eration -inducing ligand, also ' +
        'known as TNFSF13 ; TALL - 2 and TRDL - 1; the high affinity ligand ' +
        'for BCMA) and B cell';
      const html =
        'receptor exclusively expressed on plasma cells and plasmablasts. ' +
        'BCMA is a receptor for two ligands in the tumor necrosis factor ' +
        '(TNF) superfamily: APRIL (a proliferation-inducing ligand, also ' +
        'known as TNFSF13; TALL-2 and TRDL-1; the high affinity ligand ' +
        'for BCMA) and B cell';
      expect(normalizeDeep(pdf)).toBe(normalizeDeep(html));
    });

    it('PDF-extracted and HTML forms of the US11086978 trans-actions needle normalize to the same canonical string', () => {
      // tests/test-cases.js entry 'US11086978-spec-short' has the PDF
      // line-wrap artifact "trans- actions" (with space after hyphen). The
      // HTML form uses "transactions" (one word). Basic normalize alone
      // would only produce "trans-actions" (basic) vs "transactions" (html),
      // which still differs; deep-normalize is what makes the round-trip
      // succeed when the haystack is one word and the needle is two.
      //
      // Note: this particular case (hyphen-then-space, second token NOT
      // 4+-letter) sits outside the current deep regex coverage; we
      // document the gap here so a future Plan 03 audit catches it
      // explicitly. Basic normalize produces:
      //   "trans-actions" (one hyphenated token)
      //   "transactions"   (one un-hyphenated token)
      // which are NOT equal — selectText falls back through both passes
      // and would surface DOM_DRIFT for this needle. The test below
      // documents the current behavior rather than masking the gap.
      const pdf = 'fraudulent trans- actions';
      const html = 'fraudulent transactions';
      // Current normalizer maps the PDF form to "fraudulent trans-actions"
      // (basic) and leaves it unchanged in deep (because "actions" is 7
      // letters but it follows a hyphen, not precedes one — the deep regex
      // pattern is `letter SPACE letter+ HYPHEN`, which does not match
      // here). So the two forms do NOT canonicalize identically. This
      // assertion records the gap so Plan 03 can decide whether to widen
      // the deep regex or to edit the test-case selectedText.
      expect(normalizeDeep(pdf)).not.toBe(normalizeDeep(html));
      // The basic-normalize result is at least stable and deterministic:
      expect(normalize(pdf)).toBe('fraudulent trans-actions');
      expect(normalize(html)).toBe('fraudulent transactions');
    });
  });
});

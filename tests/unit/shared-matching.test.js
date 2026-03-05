import { describe, it, expect } from 'vitest';
import {
  normalizeText,
  findAllOccurrences,
  pickBestByContext,
  whitespaceStrippedMatch,
  bookendMatch,
  resolveMatch,
  formatCitation,
  fuzzySubstringMatch,
  levenshtein,
  matchAndCite,
  normalizeOcr,
  buildConcat,
  stripGutterNumbers,
  gutterTolerantMatch,
} from '../../src/shared/matching.js';

describe('shared/matching.js', () => {
  describe('exports', () => {
    it('exports normalizeText as a function', () => {
      expect(typeof normalizeText).toBe('function');
    });
    it('exports findAllOccurrences as a function', () => {
      expect(typeof findAllOccurrences).toBe('function');
    });
    it('exports pickBestByContext as a function', () => {
      expect(typeof pickBestByContext).toBe('function');
    });
    it('exports whitespaceStrippedMatch as a function', () => {
      expect(typeof whitespaceStrippedMatch).toBe('function');
    });
    it('exports bookendMatch as a function', () => {
      expect(typeof bookendMatch).toBe('function');
    });
    it('exports resolveMatch as a function', () => {
      expect(typeof resolveMatch).toBe('function');
    });
    it('exports formatCitation as a function', () => {
      expect(typeof formatCitation).toBe('function');
    });
    it('exports fuzzySubstringMatch as a function', () => {
      expect(typeof fuzzySubstringMatch).toBe('function');
    });
    it('exports levenshtein as a function', () => {
      expect(typeof levenshtein).toBe('function');
    });
    it('exports matchAndCite as a function', () => {
      expect(typeof matchAndCite).toBe('function');
    });
  });

  describe('normalizeText', () => {
    it('returns a string', () => {
      const result = normalizeText('Hello  World');
      expect(typeof result).toBe('string');
    });

    it('collapses multiple spaces to single space', () => {
      expect(normalizeText('Hello  World')).toBe('Hello World');
    });
  });

  describe('levenshtein', () => {
    it('returns 0 for identical strings', () => {
      expect(levenshtein('abc', 'abc')).toBe(0);
    });

    it('returns 1 for single substitution', () => {
      expect(levenshtein('abc', 'abd')).toBe(1);
    });

    it('returns 0 for empty strings', () => {
      expect(levenshtein('', '')).toBe(0);
    });
  });

  describe('matchAndCite', () => {
    it('returns null for empty selectedText', () => {
      expect(matchAndCite('', [])).toBeNull();
    });

    it('returns null for null positionMap', () => {
      expect(matchAndCite('hello world', null)).toBeNull();
    });

    it('returns null for empty positionMap', () => {
      expect(matchAndCite('hello world', [])).toBeNull();
    });

    it('returns a citation result for matching text in positionMap', () => {
      const positionMap = [
        { text: 'The quick brown fox', column: 1, lineNumber: 5, page: 1, section: 'spec', hasWrapHyphen: false },
        { text: 'jumps over the lazy dog', column: 1, lineNumber: 6, page: 1, section: 'spec', hasWrapHyphen: false },
      ];
      const result = matchAndCite('The quick brown fox', positionMap);
      expect(result).not.toBeNull();
      expect(result).toHaveProperty('citation');
      expect(typeof result.citation).toBe('string');
      expect(result).toHaveProperty('startEntry');
      expect(result).toHaveProperty('endEntry');
      expect(result).toHaveProperty('confidence');
    });
  });

  describe('normalizeOcr', () => {
    it('exports normalizeOcr as a function', () => {
      expect(typeof normalizeOcr).toBe('function');
    });

    it('applies rn->m: cornrnunication -> communication', () => {
      const result = normalizeOcr('cornrnunication');
      expect(result.text).toBe('communication');
      expect(result.changed).toBe(true);
    });

    it('applies cl->d: claw -> daw', () => {
      const result = normalizeOcr('claw');
      expect(result.text).toBe('daw');
      expect(result.changed).toBe(true);
    });

    it('applies cI->d: recIaim -> redaim', () => {
      const result = normalizeOcr('recIaim');
      expect(result.text).toBe('redaim');
      expect(result.changed).toBe(true);
    });

    it('applies vv->w: savvy -> sawy', () => {
      const result = normalizeOcr('savvy');
      expect(result.text).toBe('sawy');
      expect(result.changed).toBe(true);
    });

    it('applies li->h: limp -> hmp', () => {
      const result = normalizeOcr('limp');
      expect(result.text).toBe('hmp');
      expect(result.changed).toBe(true);
    });

    it('returns changed: false when no OCR patterns present', () => {
      const result = normalizeOcr('hello world');
      expect(result.text).toBe('hello world');
      expect(result.changed).toBe(false);
    });

    it('returns {text: \'\', changed: false} for empty string', () => {
      const result = normalizeOcr('');
      expect(result.text).toBe('');
      expect(result.changed).toBe(false);
    });

    it('returns object with .text and .changed properties', () => {
      const result = normalizeOcr('test');
      expect(result).toHaveProperty('text');
      expect(result).toHaveProperty('changed');
    });
  });

  describe('buildConcat', () => {
    it('exports buildConcat as a function', () => {
      expect(typeof buildConcat).toBe('function');
    });

    it('returns {concat, boundaries, changedRanges} for simple 2-entry positionMap', () => {
      const positionMap = [
        { text: 'The quick brown fox', column: 1, lineNumber: 5, page: 1, section: 'spec', hasWrapHyphen: false },
        { text: 'jumps over the lazy dog', column: 1, lineNumber: 6, page: 1, section: 'spec', hasWrapHyphen: false },
      ];
      const result = buildConcat(positionMap);
      expect(result).toHaveProperty('concat');
      expect(result).toHaveProperty('boundaries');
      expect(result).toHaveProperty('changedRanges');
    });

    it('produces correct concat string for 2-entry positionMap', () => {
      const positionMap = [
        { text: 'The quick brown fox', column: 1, lineNumber: 5, page: 1, section: 'spec', hasWrapHyphen: false },
        { text: 'jumps over the lazy dog', column: 1, lineNumber: 6, page: 1, section: 'spec', hasWrapHyphen: false },
      ];
      const result = buildConcat(positionMap);
      expect(result.concat).toBe('The quick brown fox jumps over the lazy dog');
    });

    it('produces boundaries with length 2 for 2-entry positionMap', () => {
      const positionMap = [
        { text: 'The quick brown fox', column: 1, lineNumber: 5, page: 1, section: 'spec', hasWrapHyphen: false },
        { text: 'jumps over the lazy dog', column: 1, lineNumber: 6, page: 1, section: 'spec', hasWrapHyphen: false },
      ];
      const result = buildConcat(positionMap);
      expect(result.boundaries).toHaveLength(2);
    });

    it('produces boundaries with correct shape {charStart, charEnd, entryIdx}', () => {
      const positionMap = [
        { text: 'The quick brown fox', column: 1, lineNumber: 5, page: 1, section: 'spec', hasWrapHyphen: false },
        { text: 'jumps over the lazy dog', column: 1, lineNumber: 6, page: 1, section: 'spec', hasWrapHyphen: false },
      ];
      const result = buildConcat(positionMap);
      expect(result.boundaries[0]).toHaveProperty('charStart');
      expect(result.boundaries[0]).toHaveProperty('charEnd');
      expect(result.boundaries[0]).toHaveProperty('entryIdx');
    });

    it('produces empty changedRanges when no OCR patterns present', () => {
      const positionMap = [
        { text: 'The quick brown fox', column: 1, lineNumber: 5, page: 1, section: 'spec', hasWrapHyphen: false },
        { text: 'jumps over the lazy dog', column: 1, lineNumber: 6, page: 1, section: 'spec', hasWrapHyphen: false },
      ];
      const result = buildConcat(positionMap);
      expect(result.changedRanges).toHaveLength(0);
    });

    it('produces changedRanges entry when OCR pattern is present in entry text', () => {
      const positionMap = [
        { text: 'cornrnunication', column: 1, lineNumber: 1, page: 1, section: 'spec', hasWrapHyphen: false },
      ];
      const result = buildConcat(positionMap);
      expect(result.changedRanges).toHaveLength(1);
    });

    it('handles wrap-hyphen: strips trailing hyphen when next entry starts lowercase in same column', () => {
      const positionMap = [
        { text: 'communi-', column: 1, lineNumber: 1, page: 1, section: 'spec', hasWrapHyphen: false },
        { text: 'cation', column: 1, lineNumber: 2, page: 1, section: 'spec', hasWrapHyphen: false },
      ];
      const result = buildConcat(positionMap);
      // The hyphen at the end of 'communi-' should be stripped and words joined
      expect(result.concat).toBe('communication');
    });
  });

  describe('matchAndCite OCR integration', () => {
    it('resolves OCR-confused selection against clean concat', () => {
      const positionMap = [
        { text: 'communication is key', column: 1, lineNumber: 10, page: 1, section: 'spec', hasWrapHyphen: false },
      ];
      // 'cornrnunication' has 'rn' OCR confusion (rn -> m) and 'rn' again, should resolve to 'communication'
      const result = matchAndCite('cornrnunication is key', positionMap);
      expect(result).not.toBeNull();
      expect(result.citation).toBe('1:10');
      expect(result.confidence).toBe(0.98);
    });

    it('no penalty when selection has no OCR patterns', () => {
      const positionMap = [
        { text: 'communication is key', column: 1, lineNumber: 10, page: 1, section: 'spec', hasWrapHyphen: false },
      ];
      const result = matchAndCite('communication is key', positionMap);
      expect(result).not.toBeNull();
      expect(result.confidence).toBe(1.0);
    });

    it('penalty fires when both sides have same OCR error (selChanged is true)', () => {
      // When both sides have the same OCR error, selChanged is true so penalty applies
      const positionMap = [
        { text: 'cornrnunication is key', column: 1, lineNumber: 10, page: 1, section: 'spec', hasWrapHyphen: false },
      ];
      const result = matchAndCite('cornrnunication is key', positionMap);
      expect(result).not.toBeNull();
      // selChanged is true (selection had OCR pattern), penalty fires
      expect(result.confidence).toBe(0.98);
    });

    it('OCR penalty is flat 0.02 even with multiple OCR pairs', () => {
      // 'communication and drawing' is the clean text
      // Selection: 'cornrnunication and cIrawing' (rn->m, cI->d substitutions)
      const positionMap = [
        { text: 'communication and drawing', column: 1, lineNumber: 5, page: 1, section: 'spec', hasWrapHyphen: false },
      ];
      const result = matchAndCite('cornrnunication and cIrawing', positionMap);
      expect(result).not.toBeNull();
      expect(result.confidence).toBe(0.98); // flat 0.02 penalty, not 0.04 (2x)
    });
  });

  describe('stripGutterNumbers', () => {
    it('Test 1: strips single gutter number from middle', () => {
      // "method 25 further" -> "method further"
      const result = stripGutterNumbers('method 25 further');
      expect(result.stripped).toBe('method further');
      expect(result.changed).toBe(true);
    });

    it('Test 2: strips gutter number at concat start', () => {
      // "5 further comprises" -> "further comprises"
      const result = stripGutterNumbers('5 further comprises');
      expect(result.stripped).toBe('further comprises');
      expect(result.changed).toBe(true);
    });

    it('Test 3: strips gutter number at concat end', () => {
      // "the device 65" -> "the device"
      const result = stripGutterNumbers('the device 65');
      expect(result.stripped).toBe('the device');
      expect(result.changed).toBe(true);
    });

    it('Test 4: strips two adjacent gutter numbers', () => {
      // "the 5 10 device" -> "the device"
      const result = stripGutterNumbers('the 5 10 device');
      expect(result.stripped).toBe('the device');
      expect(result.changed).toBe(true);
    });

    it('Test 5: does NOT strip numbers embedded in values like "30% ACN"', () => {
      // 30 is followed by %, not space/end, so should not be stripped
      const result = stripGutterNumbers('30% ACN');
      expect(result.stripped).toBe('30% ACN');
      expect(result.changed).toBe(false);
    });

    it('Test 6: does NOT strip numbers without space isolation like "US5559167"', () => {
      const result = stripGutterNumbers('US5559167');
      expect(result.stripped).toBe('US5559167');
      expect(result.changed).toBe(false);
    });

    it('Test 7: returns strippedToOrig offset array mapping stripped positions to original positions', () => {
      // "method 25 further" -> "method further"
      // original: m(0)e(1)t(2)h(3)o(4)d(5) (6)2(7)5(8) (9)f(10)u(11)r(12)t(13)h(14)e(15)r(16)
      // stripped: m(0)e(1)t(2)h(3)o(4)d(5) (6)f(7)u(8)r(9)t(10)h(11)e(12)r(13)
      // After stripping '25' (indices 7,8), preCollapse = "method  further" (double space at orig 6,9)
      // Collapse keeps the FIRST space (orig pos 6), skips the second (orig pos 9)
      // So strippedToOrig[6] = 6 (the first surviving space, orig position 6)
      // strippedToOrig[7] = 10 ('f' in 'further' at original position 10)
      const result = stripGutterNumbers('method 25 further');
      expect(Array.isArray(result.strippedToOrig)).toBe(true);
      // The offset array length should match the stripped string length
      expect(result.strippedToOrig.length).toBe(result.stripped.length);
      // Position 0 of stripped ('m') should map to position 0 of original
      expect(result.strippedToOrig[0]).toBe(0);
      // Position 6 of stripped (' ') maps to original position 6 (first surviving space)
      expect(result.strippedToOrig[6]).toBe(6);
      // Position 7 of stripped ('f') maps to original position 10 ('f' in 'further')
      expect(result.strippedToOrig[7]).toBe(10);
    });

    it('Test 8: returns changed=false when no gutter numbers found', () => {
      const result = stripGutterNumbers('the quick brown fox');
      expect(result.changed).toBe(false);
      expect(result.stripped).toBe('the quick brown fox');
    });

    it('Test 9: strips all 13 gutter values (5,10,...,65) when space-isolated', () => {
      // Build a string with all gutter numbers embedded
      const allGutters = '5 10 15 20 25 30 35 40 45 50 55 60 65';
      const result = stripGutterNumbers(`prefix ${allGutters} suffix`);
      expect(result.stripped).toBe('prefix suffix');
      expect(result.changed).toBe(true);
    });
  });

  describe('gutterTolerantMatch', () => {
    it('Test 10: returns null when nothing was stripped (no-op guard)', () => {
      // Concat with no gutter numbers -- gutter strip changes nothing, so null
      const positionMap = [
        { text: 'the quick brown fox jumps', column: 1, lineNumber: 5, page: 1, section: 'spec', hasWrapHyphen: false },
      ];
      const { concat, boundaries } = buildConcat(positionMap);
      const result = gutterTolerantMatch('the quick brown fox', concat, boundaries, positionMap, '', '');
      // Tiers 1-4 would succeed (exact match), but gutterTolerantMatch itself should
      // return null because no gutter numbers were stripped from the concat
      expect(result).toBeNull();
    });

    it('Test 11: finds exact match after stripping gutter number from concat, returns confidence 0.85', () => {
      // Concat has "method 25 further analysis" but selection is "method further analysis"
      // (gutter number 25 slipped into concat from PDF parser)
      const positionMap = [
        { text: 'method 25 further analysis', column: 1, lineNumber: 10, page: 1, section: 'spec', hasWrapHyphen: false },
      ];
      const { concat, boundaries } = buildConcat(positionMap);
      // Selection has no gutter number (from HTML)
      const result = gutterTolerantMatch('method further analysis', concat, boundaries, positionMap, '', '');
      expect(result).not.toBeNull();
      expect(result.confidence).toBe(0.85);
      expect(result.citation).toBe('1:10');
    });

    it('Test 12: finds whitespace-stripped match after gutter strip, confidence 0.85', () => {
      // Concat: "the 30 device comprises" -- selection: "the device comprises"
      const positionMap = [
        { text: 'the 30 device comprises', column: 1, lineNumber: 3, page: 1, section: 'spec', hasWrapHyphen: false },
      ];
      const { concat, boundaries } = buildConcat(positionMap);
      const result = gutterTolerantMatch('the device comprises', concat, boundaries, positionMap, '', '');
      expect(result).not.toBeNull();
      expect(result.confidence).toBe(0.85);
    });

    it('Test 13: returns correct citation (column:line) mapping through remapped boundaries', () => {
      // Two-entry positionMap -- gutter number is in entry 0, selection spans entry 0
      const positionMap = [
        { text: 'further 15 comprises the', column: 2, lineNumber: 7, page: 1, section: 'spec', hasWrapHyphen: false },
        { text: 'claimed invention herein', column: 2, lineNumber: 8, page: 1, section: 'spec', hasWrapHyphen: false },
      ];
      const { concat, boundaries } = buildConcat(positionMap);
      // Selection matches entry 0 after stripping '15'
      const result = gutterTolerantMatch('further comprises the', concat, boundaries, positionMap, '', '');
      expect(result).not.toBeNull();
      expect(result.citation).toBe('2:7');
      expect(result.confidence).toBe(0.85);
    });
  });

  describe('matchAndCite Tier 5 integration', () => {
    it('Test 14: selection resolves via Tier 5 when gutter number in concat prevented Tiers 1-4, confidence 0.85', () => {
      // Concat: "method 20 25 further" -- selection: "method further"
      // Two gutter numbers (20, 25) inserted in concat cause all Tiers 1-4 to fail:
      //   Tier 1 exact: "method further" not in "method 20 25 further"
      //   Tier 2 ws-stripped: "methodfurther" not in "method2025further"
      //   Tier 3 bookend: selection too short (< 60 chars)
      //   Tier 4 fuzzy: distance 6 / max(14,20) = 0.7 similarity < 0.80 -> fails
      // Tier 5 strips both "20" and "25" -> "method further", exact match, returns 0.85
      const positionMap = [
        { text: 'method 20 25 further', column: 1, lineNumber: 15, page: 1, section: 'spec', hasWrapHyphen: false },
      ];
      const result = matchAndCite('method further', positionMap);
      expect(result).not.toBeNull();
      expect(result.confidence).toBe(0.85);
      expect(result.citation).toBe('1:15');
    });

    it('Test 15: Tier 5 does not apply OCR penalty stacking -- confidence stays 0.85 even when selChanged=true', () => {
      // Selection with OCR pattern (rn->m fires, selChanged=true)
      // AND two gutter numbers in concat that make Tiers 1-4 ALL fail
      // Tier 5 strips the gutter numbers and resolves, returning flat 0.85 (not 0.83)
      //
      // Concat: "rnethod 20 25 further" (normalizeOcr in buildConcat turns rn->m: "method 20 25 further")
      // Selection: "rnethod further" -> normalizeText -> normalizeOcr -> "method further"
      // selChanged=true because selection had OCR pattern "rn" at start
      //
      // Tier 4 fuzzy: needle="method further" (14), haystack="method 20 25 further" (20)
      // Two gutter insertions cause similarity < 0.80, so Tier 4 fails.
      // Tier 5 strips "20" and "25" -> "method further", exact match, returns 0.85
      const positionMap = [
        { text: 'rnethod 20 25 further', column: 1, lineNumber: 20, page: 1, section: 'spec', hasWrapHyphen: false },
      ];
      const result = matchAndCite('rnethod further', positionMap);
      expect(result).not.toBeNull();
      // selChanged is true but Tier 5 owns flat 0.85 -- no penalty stacking
      expect(result.confidence).toBe(0.85);
    });

    it('Test 16: existing Tier 1 selections still resolve at confidence 1.0 (Tier 5 does not interfere)', () => {
      // A clean exact-match selection -- should resolve at Tier 1, confidence 1.0
      const positionMap = [
        { text: 'The quick brown fox', column: 1, lineNumber: 5, page: 1, section: 'spec', hasWrapHyphen: false },
        { text: 'jumps over the lazy dog', column: 1, lineNumber: 6, page: 1, section: 'spec', hasWrapHyphen: false },
      ];
      const result = matchAndCite('The quick brown fox', positionMap);
      expect(result).not.toBeNull();
      expect(result.confidence).toBe(1.0);
      expect(result.citation).toBe('1:5');
    });
  });
});

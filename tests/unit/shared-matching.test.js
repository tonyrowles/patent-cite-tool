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
});

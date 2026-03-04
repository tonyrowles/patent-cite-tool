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
});

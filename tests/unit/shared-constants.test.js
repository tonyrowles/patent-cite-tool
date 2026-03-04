import { describe, it, expect } from 'vitest';
import { MSG, STATUS, PATENT_TYPE } from '../../src/shared/constants.js';

describe('shared/constants.js', () => {
  it('exports MSG as an object', () => {
    expect(typeof MSG).toBe('object');
    expect(MSG).not.toBeNull();
  });

  it('MSG has exactly 17 keys', () => {
    expect(Object.keys(MSG).length).toBe(17);
  });

  it('STATUS has exactly 8 keys', () => {
    expect(Object.keys(STATUS).length).toBe(8);
  });

  it('PATENT_TYPE has exactly 2 keys', () => {
    expect(Object.keys(PATENT_TYPE).length).toBe(2);
  });

  it('MSG contains the 4 newly-added cache keys', () => {
    expect(MSG.CHECK_CACHE).toBe('check-cache');
    expect(MSG.CACHE_HIT_RESULT).toBe('cache-hit-result');
    expect(MSG.CACHE_MISS).toBe('cache-miss');
    expect(MSG.UPLOAD_TO_CACHE).toBe('upload-to-cache');
  });

  it('MSG.FETCH_PDF is correct', () => {
    expect(MSG.FETCH_PDF).toBe('fetch-pdf');
  });

  it('STATUS.READY is correct', () => {
    expect(STATUS.READY).toBe('ready');
  });

  it('PATENT_TYPE.GRANT is correct', () => {
    expect(PATENT_TYPE.GRANT).toBe('grant');
  });

  it('PATENT_TYPE.APPLICATION is correct', () => {
    expect(PATENT_TYPE.APPLICATION).toBe('application');
  });
});

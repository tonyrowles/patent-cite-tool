import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { CACHE_VERSION } from '../../src/shared/cache-schema.js';

describe('Trusted cache version', () => {
  it('abandons publicly writable pre-v6 records', () => {
    expect(CACHE_VERSION).toBe('v6');
  });
  it.each(['src/offscreen/offscreen.js', 'src/firefox/pdf-pipeline.js', 'webapp/js/app.js'])
    ('%s imports the shared cache contract instead of declaring another version', file => {
      const source = readFileSync(file, 'utf8');
      expect(source).toMatch(/import \{ CACHE_VERSION, validateCachePayload \} from .*cache-schema\.js/);
      expect(source).not.toMatch(/const CACHE_VERSION\s*=/);
      expect(source).not.toContain('async function uploadToCache');
    });
});

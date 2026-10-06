import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { isMainModule } from '../../scripts/lib/is-main.mjs';

let directory;
afterEach(() => {
  if (directory) rmSync(directory, { recursive: true, force: true });
});

describe('CLI entrypoint detection', () => {
  it('matches filesystem entries with spaces and URL-reserved characters', () => {
    directory = mkdtempSync(path.join(tmpdir(), 'pct-cli-'));
    const entry = path.join(directory, 'entry #1.mjs');
    writeFileSync(entry, '');
    expect(isMainModule(pathToFileURL(entry).href, entry)).toBe(true);
    expect(isMainModule(import.meta.url, entry)).toBe(false);
  });

  it('does not execute missing or absent entries', () => {
    expect(isMainModule(import.meta.url, '')).toBe(false);
    expect(isMainModule(import.meta.url, 'missing-cli-entry.mjs')).toBe(false);
  });
});

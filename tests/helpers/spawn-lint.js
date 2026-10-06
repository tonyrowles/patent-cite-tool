import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { scripts } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

export function spawnLint(options) {
  return spawnSync(process.execPath, [
    path.join(path.dirname(require.resolve('eslint/package.json')), 'bin/eslint.js'),
    ...scripts.lint.split(/\s+/).slice(1),
  ], options);
}

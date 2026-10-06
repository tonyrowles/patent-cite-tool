import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function mockGhEnv(directory) {
  const preload = fileURLToPath(new URL('./mock-gh-preload.cjs', import.meta.url));
  return {
    PCT_MOCK_GH_SCRIPT: path.join(directory, 'mock-gh.cjs'),
    NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --require ${JSON.stringify(preload)}`,
  };
}

// A local mock on both platforms; integration tests must never call real gh.
export function writeMockGh(directory, transcriptPath, { issues = [] } = {}) {
  const script = path.join(directory, 'mock-gh.cjs');
  writeFileSync(script, [
    '#!/usr/bin/env node',
    "const fs = require('node:fs');",
    'const args = process.argv.slice(2);',
    `fs.appendFileSync(${JSON.stringify(transcriptPath)}, args.join(' ') + '\\n');`,
    `if (args[0] === 'issue' && args[1] === 'list') console.log(${JSON.stringify(JSON.stringify(issues))});`,
    "else if (args[0] === 'issue') console.log('https://github.com/test/test/issues/42');",
    "else if (args[0] === '--version') console.log('gh version 2.83.1 (mock)');",
  ].join('\n') + '\n', { mode: 0o755 });
  if (process.platform === 'win32') {
    writeFileSync(path.join(directory, 'gh.cmd'), `@echo off\r\n"${process.execPath}" "%~dp0mock-gh.cjs" %*\r\n`);
  } else {
    writeFileSync(path.join(directory, 'gh'), `#!/bin/sh\nexec "${process.execPath}" "${script}" "$@"\n`, { mode: 0o755 });
  }
}

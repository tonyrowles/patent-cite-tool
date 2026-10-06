import path from 'node:path';

// Windows npm is a .cmd shim, which cannot be launched without a shell by
// spawnSync. Invoke its JavaScript entry with Node instead.
export function npmCommand(args, {
  platform = process.platform,
  execPath = process.execPath,
  npmExecPath = process.env.npm_execpath,
} = {}) {
  if (platform !== 'win32') return { command: 'npm', args };
  const cli = npmExecPath || path.win32.join(path.win32.dirname(execPath), 'node_modules/npm/bin/npm-cli.js');
  return { command: execPath, args: [cli, ...args] };
}

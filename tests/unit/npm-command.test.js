import { describe, expect, it } from 'vitest';
import { npmCommand } from '../../scripts/lib/npm-command.mjs';

describe('npm process invocation', () => {
  it('runs the npm CLI through Node on Windows without a shell', () => {
    expect(npmCommand(['audit', '--json'], {
      platform: 'win32', execPath: 'C:\\Node\\node.exe', npmExecPath: 'C:\\npm\\npm-cli.js',
    })).toEqual({ command: 'C:\\Node\\node.exe', args: ['C:\\npm\\npm-cli.js', 'audit', '--json'] });
  });

  it('finds the bundled Windows CLI when called directly from Node', () => {
    expect(npmCommand(['outdated'], {
      platform: 'win32', execPath: 'C:\\Node\\node.exe', npmExecPath: '',
    }).args[0]).toBe('C:\\Node\\node_modules\\npm\\bin\\npm-cli.js');
  });

  it('uses the native npm executable on POSIX', () => {
    expect(npmCommand(['audit'], { platform: 'linux' })).toEqual({ command: 'npm', args: ['audit'] });
  });
});

// Test-only argv shim: Windows cannot execFile a .cmd script. Production gh is
// a native executable; launch the mock with Node without introducing a shell.
const childProcess = require('node:child_process');
const { syncBuiltinESMExports } = require('node:module');
const original = childProcess.execFileSync;
childProcess.execFileSync = function (file, args, options) {
  if (file === 'gh' && process.env.PCT_MOCK_GH_SCRIPT) {
    return original(process.execPath, [process.env.PCT_MOCK_GH_SCRIPT, ...args], options);
  }
  return original(file, args, options);
};
syncBuiltinESMExports();

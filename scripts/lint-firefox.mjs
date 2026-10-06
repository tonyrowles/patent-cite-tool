import { createInstance } from 'addons-linter';

// web-ext uses this same Mozilla scanner. Call it directly so linting does not
// install unrelated Android deployment dependencies with unpatched advisories.
const linter = createInstance({
  config: {
    _: ['dist/firefox'],
    logLevel: 'fatal',
    warningsAsErrors: true,
    minManifestVersion: 2,
    maxManifestVersion: 3,
    enableDataCollectionPermissions: true,
    shouldScanFile: fileName => !fileName.replaceAll('\\', '/').startsWith('lib/'),
  },
  runAsBinary: true,
});
await linter.run();

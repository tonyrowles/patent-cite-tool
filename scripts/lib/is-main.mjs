import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Compare file URLs so Windows paths, spaces, and symlinked CLI entries work.
export function isMainModule(moduleUrl, entry = process.argv[1]) {
  if (!entry) return false;
  try {
    return pathToFileURL(realpathSync(entry)).href === moduleUrl;
  } catch {
    return false;
  }
}

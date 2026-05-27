#!/usr/bin/env node
// scripts/_verify-phase33-callsites.mjs
//
// Phase 33 RERUN-03 — one-shot static analysis.
//
// Proves that EVERY appendLlmIteration call site in scripts/e2e-explore.mjs
// individually carries all four D-14 capture keys:
//   scroll_y, viewport_width, viewport_height, selected_node_xpath
//
// Commit this alongside the e2e-explore.mjs change so future audits can
// re-run it with `node scripts/_verify-phase33-callsites.mjs`.
//
// Algorithm:
//   1. Read scripts/e2e-explore.mjs as text.
//   2. Split on the regex /appendLlmIteration\s*\(\s*reportPath\s*,\s*\{/
//      — yields N+1 chunks for N call sites.
//   3. Expect exactly 6 call sites (7 chunks); fail if not.
//   4. For each of the 6 body chunks (indices 1..6):
//      a. Isolate the object literal body by splitting on /\}\)\s*;/ and
//         keeping the first piece (everything before the closing `});`).
//      b. Check that the chunk text contains each of the 4 required keys.
//         If any key is absent, print the failing site index and key to
//         stderr and exit 1.
//   5. If all 6 sites pass, print success message and exit 0.
//
// Exit codes:
//   0 — all 6 call sites contain all 4 keys
//   1 — verification failed (diagnostic printed to stderr)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TARGET = path.resolve(__dirname, 'e2e-explore.mjs');

const REQUIRED_KEYS = [
  'scroll_y',
  'viewport_width',
  'viewport_height',
  'selected_node_xpath',
];

const EXPECTED_CALL_SITES = 6;

const src = fs.readFileSync(TARGET, 'utf8');

// Split on each appendLlmIteration call-site opening.
// The regex matches `appendLlmIteration(reportPath, {` (with optional
// whitespace around punctuation) so we isolate the object literal body
// that follows.
const CALL_SITE_SPLIT_RE = /appendLlmIteration\s*\(\s*reportPath\s*,\s*\{/;
const parts = src.split(CALL_SITE_SPLIT_RE);

const found = parts.length - 1; // number of call sites
if (found !== EXPECTED_CALL_SITES) {
  process.stderr.write(
    `[_verify-phase33-callsites] Expected exactly ${EXPECTED_CALL_SITES} call sites, ` +
    `found ${found}\n`
  );
  process.exit(1);
}

// Validate each body chunk (parts[1] through parts[6]).
for (let i = 1; i <= EXPECTED_CALL_SITES; i++) {
  // Isolate up to the first `});` that closes the iteration object + call.
  const CLOSE_RE = /\}\)\s*;/;
  const bodyChunk = parts[i].split(CLOSE_RE)[0];

  for (const key of REQUIRED_KEYS) {
    if (!bodyChunk.includes(key)) {
      process.stderr.write(
        `[_verify-phase33-callsites] FAIL: call site ${i} is missing key '${key}'\n`
      );
      process.exit(1);
    }
  }
}

process.stdout.write('OK: all 6 call sites contain all 4 keys\n');
process.exit(0);

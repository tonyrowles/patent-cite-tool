#!/usr/bin/env node
// scripts/_migrate-uat-fixture.mjs
//
// Phase 33 D-15 — One-shot migration script that re-stamps
// tests/e2e/fixtures/uat-phase32-llm-report.json in place:
//   1. Adds top-level `schema_version: 1` as the FIRST key
//   2. Adds null-valued capture-state keys on every iteration entry:
//      scroll_y, viewport_width, viewport_height, selected_node_xpath
//
// SAFE TO RE-RUN (idempotent):
//   Each key addition uses a presence check before writing (e.g.,
//   `if (!('scroll_y' in it)) it.scroll_y = null`), so re-running
//   the script leaves the file byte-identical.
//
// Anti-pattern avoided: Do NOT use cat / heredoc to patch the fixture.
//   See .planning/phases/33-re-run-validator/33-RESEARCH.md §"Anti-Patterns".
//
// See .planning/phases/33-re-run-validator/33-CONTEXT.md D-15 for the
// re-stamp semantics and RERUN-03 requirement.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.resolve(__dirname, '../tests/e2e/fixtures/uat-phase32-llm-report.json');

const raw = fs.readFileSync(FIXTURE_PATH, 'utf8');
const existing = JSON.parse(raw);

// Construct new top-level object with schema_version as the FIRST key,
// followed by all existing keys in their original order.
const migrated = { schema_version: 1, ...existing };

// For each iteration entry, idempotently add the four capture-state keys.
for (const it of migrated.iterations) {
  if (!('scroll_y' in it)) it.scroll_y = null;
  if (!('viewport_width' in it)) it.viewport_width = null;
  if (!('viewport_height' in it)) it.viewport_height = null;
  if (!('selected_node_xpath' in it)) it.selected_node_xpath = null;
}

// Write back with 2-space indent + trailing newline, matching the
// existing file formatting convention.
fs.writeFileSync(FIXTURE_PATH, JSON.stringify(migrated, null, 2) + '\n');

console.log(`Migrated: ${FIXTURE_PATH}`);
console.log(`  schema_version: ${migrated.schema_version}`);
console.log(`  iterations: ${migrated.iterations.length}`);
console.log('Done. Safe to re-run (idempotent).');

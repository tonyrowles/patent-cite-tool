// Phase 47-03 Task 4 — static-grep guard pinning 47-UAT-DEFERRED.md structure
//
// Purpose: prevent accidental drift in the 4 DEFERRED HUMAN-UAT runbook stubs
// (UAT-47-a, UAT-47-b, UAT-47-d, UAT-47-e). If a future commit deletes a stub
// or renames a required field header, the next `npm run test:src` surfaces it.
//
// The 4 required field headers per stub are locked by 47-CONTEXT.md:
//   ### Dispatch command (post-push)
//   ### Expected outcome
//   ### Success heuristic
//   ### Rollback
//
// UAT-47-a additionally must preserve the Phase 42 inherited demo target
// fingerprint `139f821b3bb1` (issue #3 US11427642-spec-short-1, branch
// auto-fix/3-139f821b) per 47-CONTEXT.md "Specific Ideas".

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DEFERRED_PATH = path.join(
  REPO_ROOT,
  '.planning/phases/47-v4-0-cleanup/47-UAT-DEFERRED.md',
);

const REQUIRED_FIELD_HEADERS = [
  '### Dispatch command (post-push)',
  '### Expected outcome',
  '### Success heuristic',
  '### Rollback',
];

const STUBS = ['a', 'b', 'd', 'e'];

// Scope a substring window to one stub. Find the start of `## UAT-47-<id> —`
// and slice until the next `## UAT-47-` heading or EOF. Guards against
// cross-stub bleed (a header in stub b accidentally counting for stub a).
function stubWindow(src, stub) {
  const startMarker = `## UAT-47-${stub} —`;
  const startIdx = src.indexOf(startMarker);
  if (startIdx === -1) return null;
  // Find next `## UAT-47-` heading AFTER the start (skip the start line itself
  // by searching from `startIdx + startMarker.length`).
  const searchFrom = startIdx + startMarker.length;
  const nextRel = src.slice(searchFrom).search(/^## UAT-47-/m);
  const endIdx = nextRel === -1 ? src.length : searchFrom + nextRel;
  return src.slice(startIdx, endIdx);
}

describe('Phase 47 CLEANUP-03: 47-UAT-DEFERRED.md runbook stubs are present and complete', () => {
  it('47-UAT-DEFERRED.md exists', () => {
    expect(fs.existsSync(DEFERRED_PATH)).toBe(true);
  });

  const src = fs.existsSync(DEFERRED_PATH)
    ? fs.readFileSync(DEFERRED_PATH, 'utf8')
    : '';

  for (const stub of STUBS) {
    describe(`UAT-47-${stub} stub`, () => {
      it('section heading present', () => {
        expect(src).toMatch(new RegExp(`^## UAT-47-${stub} —`, 'm'));
      });

      for (const header of REQUIRED_FIELD_HEADERS) {
        it(`contains required field header: "${header}"`, () => {
          const window = stubWindow(src, stub);
          expect(window, `UAT-47-${stub} window not located`).not.toBeNull();
          expect(window).toContain(header);
        });
      }
    });
  }

  it('UAT-47-a preserves Phase 42 inherited demo fingerprint 139f821b3bb1', () => {
    expect(src).toContain('139f821b3bb1');
  });
});

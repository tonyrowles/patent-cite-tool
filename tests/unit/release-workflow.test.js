/**
 * Automatic release workflow invariant guard test.
 *
 * Phase 25 (v2.3) ratifies that pushing a `v*` semver tag to the
 * repository automatically triggers a GitHub Actions workflow that
 * builds the Chrome + Firefox dists, packages them as ZIPs, and
 * publishes a GitHub Release with both assets attached. The
 * enforcement chain is:
 *
 *   1. .github/workflows/release.yml triggers on push:tags:'v*'.
 *   2. release.yml declares `permissions: contents: write` so the
 *      `gh release create` call is authorized via GITHUB_TOKEN.
 *   3. release.yml packages BOTH patent-cite-chrome.zip and
 *      patent-cite-firefox.zip and attaches them via
 *      `gh release create ... --generate-notes`.
 *   4. .github/workflows/ci.yml `on:` block has no `tags:` sub-key,
 *      so a `v*` tag push triggers release.yml exclusively, not
 *      ci.yml — independence is enforced by trigger separation.
 *   5. .github/workflows/ci.yml retains the `workflow_dispatch` +
 *      `Attach assets to GitHub release` manual-fallback path for
 *      re-uploading assets to an existing release.
 *
 * If any link in this chain is removed or weakened, automatic
 * releases can break silently — a contributor would discover the
 * regression only on the next attempted release push. This test is
 * a static-grep guard: it reads release.yml and ci.yml and asserts
 * the literals/structure remain present, so a regression surfaces
 * in the unit-test suite (which runs before any release action)
 * rather than during a real release event.
 *
 * Real release evidence: tag `v2.3.0` published on GitHub
 * 2026-04-12 with both ZIPs attached proves the workflow has
 * actually run end-to-end. See .planning/phases/25-automatic-release-workflow/25-CONTEXT.md
 * and the 25-01-SUMMARY.md for documentation.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const ROOT = resolve(__filename, '../../..');

const RELEASE_WORKFLOW = resolve(ROOT, '.github/workflows/release.yml');
const CI_WORKFLOW = resolve(ROOT, '.github/workflows/ci.yml');

// Canonical literals from release.yml. If any of these change, the
// corresponding assertion below should fail loudly so the operator
// can confirm the change is intentional before merging.
const EXPECTED_TAG_TRIGGER_REGEX = /on:\s*\n\s+push:\s*\n\s+tags:\s*\n\s+- 'v\*'/;
const EXPECTED_CHROME_ASSET = 'patent-cite-chrome.zip';
const EXPECTED_FIREFOX_ASSET = 'patent-cite-firefox.zip';
const EXPECTED_GH_RELEASE_CREATE = 'gh release create';
const EXPECTED_GENERATE_NOTES_FLAG = '--generate-notes';

// Canonical literals from ci.yml manual-fallback path.
const EXPECTED_CI_DISPATCH = 'workflow_dispatch:';
const EXPECTED_CI_ATTACH_STEP = 'Attach assets to GitHub release';
const EXPECTED_CI_GH_UPLOAD = 'gh release upload';

function readReleaseWorkflow() {
  return readFileSync(RELEASE_WORKFLOW, 'utf-8');
}

function readCiWorkflow() {
  return readFileSync(CI_WORKFLOW, 'utf-8');
}

function countOccurrences(haystack, needle) {
  // Simple non-overlapping substring count.
  if (!needle) return 0;
  let count = 0;
  let idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) {
    count += 1;
    idx += needle.length;
  }
  return count;
}

describe('release workflow invariant (Phase 25 / CICD-04)', () => {
  it('R1: .github/workflows/release.yml exists and is non-empty', () => {
    const yml = readReleaseWorkflow();
    expect(yml.length).toBeGreaterThan(0);
    expect(yml).toContain('name: Release');
  });

  it("R2: release.yml triggers on push:tags:'v*' (the tag-trigger contract)", () => {
    const yml = readReleaseWorkflow();
    expect(yml).toMatch(EXPECTED_TAG_TRIGGER_REGEX);
  });

  it('R3: release.yml declares permissions: contents: write (auth for gh release create)', () => {
    const yml = readReleaseWorkflow();
    expect(yml).toMatch(/^permissions:/m);
    expect(yml).toMatch(/^\s+contents: write/m);
  });

  it('R4: release.yml packages BOTH chrome and firefox ZIPs (two-asset contract)', () => {
    const yml = readReleaseWorkflow();
    // Each asset name must appear at least twice: once in the
    // packaging step (zip -r) and once in the gh release create
    // argument list.
    expect(countOccurrences(yml, EXPECTED_CHROME_ASSET)).toBeGreaterThanOrEqual(2);
    expect(countOccurrences(yml, EXPECTED_FIREFOX_ASSET)).toBeGreaterThanOrEqual(2);
  });

  it('R5: release.yml invokes `gh release create` with `--generate-notes`', () => {
    const yml = readReleaseWorkflow();
    expect(yml).toContain(EXPECTED_GH_RELEASE_CREATE);
    expect(yml).toContain(EXPECTED_GENERATE_NOTES_FLAG);
  });

  it('R6: release.yml does not mute any step with continue-on-error: true', () => {
    // Defensive: a future PR that adds `continue-on-error: true`
    // to (say) the test step would let a broken build still ship
    // a release. This assertion checks the whole file for the
    // literal. If a legitimate continue-on-error is ever required
    // for an unrelated step, this test must be tightened to
    // YAML-parse and check only the relevant steps.
    const yml = readReleaseWorkflow();
    expect(yml).not.toContain('continue-on-error: true');
  });

  it('R7: ci.yml `on:` block has no `tags:` sub-key (trigger-independence from release.yml)', () => {
    // Independence is enforced by trigger separation: ci.yml fires
    // on branch pushes + PRs + manual workflow_dispatch, but NOT
    // on tag refs. release.yml is the only workflow that fires on
    // a v* tag. We parse the `on:` block out of ci.yml (everything
    // between `^on:` and the next top-level YAML key) and assert
    // it contains no `tags:` sub-key.
    const yml = readCiWorkflow();
    const onBlockMatch = yml.match(/^on:\s*\n((?:[ \t]+.*\n|\n)+?)(?=^[a-zA-Z])/m);
    expect(onBlockMatch).not.toBeNull();
    const onBlock = onBlockMatch[1];
    // `tags:` MUST NOT appear as a YAML key inside the on: block.
    // (A line like `  tags:` would mean ci.yml also fires on tag
    // pushes — that would defeat the separation.)
    expect(onBlock).not.toMatch(/^[ \t]+tags:/m);
  });

  it('R8: ci.yml retains the workflow_dispatch + Attach-assets manual-fallback path', () => {
    const yml = readCiWorkflow();
    expect(yml).toContain(EXPECTED_CI_DISPATCH);
    expect(yml).toContain(EXPECTED_CI_ATTACH_STEP);
    expect(yml).toContain(EXPECTED_CI_GH_UPLOAD);
  });
});

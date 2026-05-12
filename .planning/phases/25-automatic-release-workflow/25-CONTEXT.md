# Phase 25: Automatic Release Workflow - Context

**Gathered:** 2026-05-12
**Status:** Ready for planning
**Mode:** Retro-document — work already on main; plan should verify, not introduce

<domain>
## Phase Boundary

Confirm that pushing a `v*` semver tag to the repository automatically triggers a GitHub Actions workflow that:
- Builds Chrome + Firefox dists from the tagged commit
- Runs the full test suite (including `test:lint`)
- Packages both dists as ZIPs (`patent-cite-chrome.zip`, `patent-cite-firefox.zip`)
- Creates (or updates) a GitHub Release for the tag with the ZIPs attached as downloadable assets
- Runs independently from the normal-push CI workflow — a tag push does not interfere with branch CI

This is **retroactive documentation** of work already shipped on `main`. The file `.github/workflows/release.yml` was added in commit `ba5c280` (2026-04-03). A real release at tag `v2.3.0` exists on GitHub (created 2026-04-12), demonstrating the workflow has actually run successfully end-to-end. Phase 25's job is to anchor the success criteria to verifiable invariants in `release.yml` (and any related `workflow_dispatch` paths in `ci.yml`), not to add new code.

In scope:
- Verifying `release.yml` exists, triggers on `v*` tag push, and is structurally correct.
- Verifying the release workflow builds Chrome + Firefox dists and creates a Release with both ZIPs attached via `gh release create ... --generate-notes`.
- Confirming the workflow is independent from `ci.yml`: separate workflow file, separate trigger (tags vs push/PR), separate concurrency group (or no shared group).
- Confirming a real Release actually exists for at least one shipped tag (evidence the workflow has run end-to-end).
- Adding a lightweight guard test that fails CI if `release.yml` is removed or its tag trigger is weakened.

Out of scope:
- Re-architecting the release flow (e.g., splitting build and release into separate jobs).
- Drafting vs publishing semantics (`--generate-notes` produces a published release; this is the deliberate current behavior).
- Signing extensions for AMO/Chrome Web Store submission (that's a future store-submission milestone).
- Auto-tagging from main commits (manual `git tag vX.Y.Z && git push --tags` is intentional — keeps releases human-gated).

</domain>

<decisions>
## Implementation Decisions

### Trigger surface
- The release workflow triggers ONLY on `push` to tags matching `v*` (semver tags). Branch pushes never trigger it.
- A separate `workflow_dispatch` path exists in `ci.yml` (with a `tag` input) to allow re-running the build for an existing tag — this is a defensive escape hatch and does NOT replace the tag-triggered automatic flow.
- Decision: **keep both paths**. Tag-push is the primary automated path (SC#1). The `workflow_dispatch` in `ci.yml` is a manual fallback that re-uploads assets to an existing Release.

### Release artifact contract
- Two ZIPs are attached per release: `patent-cite-chrome.zip` and `patent-cite-firefox.zip`.
- ZIPs are produced by `cd dist/{target} && zip -r ../../patent-cite-{target}.zip .` (manifest at archive root, web store-acceptable layout).
- Release notes are generated via `gh release create ... --generate-notes` (GitHub auto-generates from the commit history between the previous tag and this one).
- Decision: **`--generate-notes` is the canonical note source** for now. Hand-curated release notes can be added later via the GitHub UI without breaking the workflow.

### Independence from CI workflow
- `release.yml` and `ci.yml` are separate files with separate triggers (`push:tags` vs `push: (branches)` + `pull_request`).
- Neither sets a `concurrency` group that overlaps the other (ci.yml uses `${{ github.workflow }}-...`, which is workflow-scoped).
- A tag push does not run the normal `ci.yml` push job (because the `ci.yml` `push:` filter includes all branches but tags are not branches — they are refs).
- Decision: **enforced by trigger separation, not by an explicit concurrency rule**. Verify by confirming the trigger blocks differ and the concurrency keys are non-overlapping.

### Manifest version sync
- The Firefox manifest version (`dist/firefox/manifest.json` → `version`) currently shows `2.3.0` and the latest published Release is `v2.3.0`. The build pipeline copies the version from `src/manifest.firefox.json`.
- Decision: **manifest version must match the tag** before pushing the tag. This is a human-gated step (not automated) — bumping the version is part of the release prep. Phase 25 does NOT add an automated version-check guard, but the guard test SHOULD note this invariant.

### Claude's Discretion
- Test-coverage approach for the release workflow invariants — Claude picks static-grep (vitest reading `release.yml`) over running the workflow in a sandbox (which would require GH Actions emulation infrastructure not in scope).
- Whether to extend the existing `web-ext-lint.test.js` pattern or create a new `release-workflow.test.js` — Claude picks the cleanest minimal approach during planning.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `.github/workflows/release.yml` — 60-line release workflow, on `push:tags:v*`, runs build + tests + lint, packages ZIPs, calls `gh release create ... --generate-notes`.
- `.github/workflows/ci.yml` — has a `workflow_dispatch` block with a `tag` input AND an `Attach assets to GitHub release` step that fires only when `inputs.tag` is set. This is the manual re-run path.
- `package.json` `scripts.test` — chained by both workflows; covers `test:src`, `test:chrome`, `test:firefox`, `test:lint`.
- `tests/unit/cache-version.test.js` + `tests/unit/web-ext-lint.test.js` — established static-grep guard pattern; new test should follow the same shape.
- GitHub Releases (verified via `gh release list`): v2.0, v2.1, v2.2 (draft + final), v2.3.0 (latest) — confirms the workflow has produced real releases.

### Established Patterns
- Verification-only retro plans (Phase 23/24 model): plans assert "as-shipped" invariants, may add static-grep guard tests, and do NOT modify the source under verification.
- Plan front-matter uses `must_haves.truths` for invariants; `must_haves.artifacts` lists files that must exist with key contents.

### Integration Points
- `release.yml` reuses the same build commands as `ci.yml` (`npm run build`, `npm run test:src`, etc.) — drift would surface as a CI failure on the next normal push, not just on tag-push.
- `gh release create` runs with `GITHUB_TOKEN`; `permissions: contents: write` at the job level grants the necessary scope.
- Tag-trigger does not need branch filtering — the `v*` glob is the gate.

</code_context>

<specifics>
## Specific Ideas

- Consider a guard test (`tests/unit/release-workflow.test.js`) that asserts:
  - `.github/workflows/release.yml` exists.
  - The file contains `on:` block with `push:` → `tags:` → `'v*'`.
  - The file contains `permissions: contents: write` (so the `gh release create` call is authorized).
  - The file invokes `gh release create` with `--generate-notes` flag (so notes are deterministic).
  - The file packages BOTH `patent-cite-chrome.zip` and `patent-cite-firefox.zip` (so a tag without one of them would fail at workflow level).

- Document the **as-built release evidence** in the SUMMARY: link to the v2.3.0 release on GitHub as proof the workflow has actually run end-to-end (not just hypothetically valid).

- Optionally verify that `.github/workflows/release.yml` does NOT contain `continue-on-error: true` (same defensive guard as Phase 24's L5).

</specifics>

<deferred>
## Deferred Ideas

- Automated version bumping (CI updates manifest version from the tag) — deferred. Manual bump keeps releases intentional and avoids mismatch-with-uncommitted-work scenarios.
- Signed releases / extension signing for AMO submission — deferred to future store-submission milestone.
- Release notes templating / changelog generation beyond `--generate-notes` — deferred. Current GitHub auto-notes are sufficient for the v2.x cycle.
- Draft-release-then-publish flow (require human review before publishing) — deferred. Currently `gh release create` publishes immediately; this is acceptable for a small extension project where the tag push itself is the human gate.
- Pre-release tags (`v*-beta`, `v*-rc`) — out of scope for this phase.

</deferred>

# Phase 17: Cross-Browser Validation - Context

**Gathered:** 2026-03-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Confirm both Chrome and Firefox builds are regression-free against the full 71-case test corpus, pass Firefox-specific linting, and produce identical citations on real Google Patents pages. This phase validates existing builds — no new features, no Firefox-specific code changes (unless discrepancies are found and fixed).

</domain>

<decisions>
## Implementation Decisions

### Spot-check patent selection
- Claude picks 5 representative patents spanning the 8 test categories (modern, pre-2000, chemical, claims, cross-column, repetitive)
- **Identical output required** — Chrome and Firefox must produce the same citation string for the same text selection
- **Scripted comparison** — A script extracts expected citations; user verifies against browser output (not just a manual checklist)
- **Discrepancies fixed in this phase** — If Chrome and Firefox produce different output, investigate and fix before marking phase complete

### Validation permanence
- **Permanent npm scripts** — `npm run test:chrome` and `npm run test:firefox` run the 71-case corpus against dist/ builds
- **`npm test` runs everything** — src/ unit tests + dist/chrome/ corpus + dist/firefox/ corpus + web-ext lint
- **Auto-build** — `npm test` automatically builds dist/ before running dist/ tests (slower but always correct)
- **`web-ext lint` in `npm test`** — Firefox lint runs as part of the standard test suite

### Dist test strategy
- Claude's discretion on how the 71-case corpus tests target bundled dist/ output (separate vitest configs, dynamic import paths, or another approach)

### web-ext lint
- Claude's discretion on warning vs error strictness
- Claude's discretion on devDependency vs npx

### Claude's Discretion
- Dist test implementation approach (how corpus imports switch between src/ and dist/ targets)
- web-ext installation method and strictness level
- Which 5 patents to use for spot-check (representative spread across categories)
- Spot-check comparison script design

</decisions>

<specifics>
## Specific Ideas

- User develops in WSL, pushes to GitHub, tests on a separate machine — build artifacts need to be correct and self-contained
- Phase 16 human UAT already confirmed Firefox citations work live — this phase adds automated regression coverage
- BUILD-05 (Phase 15) was a one-time dist/chrome/ corpus check — this phase makes cross-browser corpus testing permanent

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `tests/test-cases.js`: 71-case registry with 21 unique patents across 8 categories — test infrastructure already exists
- `tests/unit/shared-matching.test.js`: Corpus tests importing from `src/shared/matching.js` — need adaptation for dist/ targets
- `scripts/build.js`: Full build pipeline producing dist/chrome/ and dist/firefox/ — auto-build can call this
- `scripts/accuracy-report.js`: Existing accuracy reporting — pattern for cross-browser reporting
- `vitest.config.js`: Current config tests src/ only — needs extension or parallel configs for dist/

### Established Patterns
- `npm run build` produces both dist/chrome/ and dist/firefox/ (clean build with rm dist/)
- Vitest with ESM imports + Chrome API stubs (`tests/setup/chrome-stub.js`)
- Golden baseline snapshot testing (`tests/golden/`)
- Scripts directory convention: `scripts/*.js`

### Integration Points
- `package.json` scripts: add `test:chrome`, `test:firefox`; modify `test` to include build + all targets
- dist/chrome/content/content.js: IIFE bundle (different import pattern than src/)
- dist/firefox/background/service-worker.js: ESM bundle with Firefox-specific code
- `web-ext` needs to target `dist/firefox/` directory

</code_context>

<deferred>
## Deferred Ideas

- **GitHub Actions CI/CD** — Auto-build on push to main, upload dist/chrome/ and dist/firefox/ as downloadable workflow artifacts. Eliminates manual pull + build on test machine. Could also run `npm test` in CI.
- **Published application cross-browser testing** — 71-case corpus is all granted patents (PDF-based). Published applications use DOM-only paragraph citations. Could add pub app test cases for cross-browser coverage.
- **Firefox private browsing validation** — Phase 16 added IndexedDB degradation for "Never remember history" mode. Dedicated spot-check in restricted-history Firefox could verify the fallback path.

</deferred>

---

*Phase: 17-cross-browser-validation*
*Context gathered: 2026-03-04*

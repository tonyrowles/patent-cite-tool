# Phase 18: Core CI Workflow - Context

**Gathered:** 2026-03-04
**Status:** Ready for planning

<domain>
## Phase Boundary

End-to-end GitHub Actions pipeline: every push (any branch) and PR (to main) triggers a run that installs dependencies, builds both browser targets, runs the full test suite with per-suite visibility, and uploads store-ready Chrome and Firefox ZIPs as downloadable artifacts. A test failure fails the run and produces no artifacts.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
User deferred all remaining implementation decisions. Requirements and success criteria are specific enough to drive implementation directly.

Claude has flexibility on:
- **Job timeout value** (HARD-02) — pick a sensible timeout-minutes based on expected build+test duration
- **Artifact retention** — choose a reasonable retention-days value
- **Test failure behavior** — decide whether 4 named test steps run independently or bail on first failure
- **Workflow file naming** — standard `.github/workflows/ci.yml` or similar
- **Zip tooling** — choose approach for creating store-ready ZIPs (shell zip command, action, etc.)
- **Build step placement** — whether build runs once before all test steps or is embedded in `npm test`

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. Requirements (CICD-01 through CICD-03, PKG-01 through PKG-03, HARD-02) and success criteria in ROADMAP.md are the authoritative spec.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `npm run build` — builds both Chrome and Firefox to `dist/chrome/` and `dist/firefox/`
- `npm run test:src` — Vitest unit tests (source-level)
- `npm run test:chrome` — Vitest with chrome-specific config
- `npm run test:firefox` — Vitest with firefox-specific config
- `npm run test:lint` — web-ext lint on `dist/firefox/`
- `npm test` — runs build + all 4 test suites sequentially

### Established Patterns
- esbuild pipeline: `node scripts/build.js` produces `dist/chrome/` and `dist/firefox/`
- ESM project (`"type": "module"` in package.json)
- devDependencies only: esbuild, pdfjs-dist, sharp, vitest (no runtime deps)
- Node 22 LTS specified in requirements (local env is v24)

### Integration Points
- No `.github/` directory exists yet — workflow is greenfield
- `dist/chrome/` and `dist/firefox/` each contain `manifest.json` at root — ZIP these directories directly
- `package-lock.json` exists for `npm ci` caching

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 18-core-ci-workflow*
*Context gathered: 2026-03-04*

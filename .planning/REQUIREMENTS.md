# Requirements: Patent Citation Tool

**Defined:** 2026-03-04
**Core Value:** Highlight text on Google Patents, get an accurate citation reference instantly — no PDF downloading, no manual counting.

## v2.1 Requirements

Requirements for CI/CD Pipeline milestone. Each maps to roadmap phases.

### CI Workflow

- [ ] **CICD-01**: GitHub Actions workflow triggers on push to any branch and on PRs to main
- [ ] **CICD-02**: Workflow checks out code, sets up Node 22 LTS with npm cache, and runs `npm ci`
- [ ] **CICD-03**: Workflow runs `npm test` (build + Vitest 71-case corpus + web-ext lint) and fails the run on any test failure

### Packaging

- [ ] **PKG-01**: Workflow zips `dist/chrome/` into a store-ready artifact with manifest.json at zip root
- [ ] **PKG-02**: Workflow zips `dist/firefox/` into a store-ready artifact with manifest.json at zip root
- [ ] **PKG-03**: Both zip artifacts are downloadable from the GitHub Actions run page

### Hardening

- [ ] **HARD-01**: Concurrency group cancels stale CI runs when new commits push to the same branch
- [ ] **HARD-02**: Job has `timeout-minutes` set to prevent indefinite hangs
- [ ] **HARD-03**: Workflow uses explicit `permissions: contents: read` for least-privilege security

## Future Requirements

Deferred to future milestone. Tracked but not in current roadmap.

### Store Automation

- **STOR-01**: Automated Chrome Web Store publish via CWS API on tagged release
- **STOR-02**: Automated Firefox AMO publish via web-ext sign on tagged release
- **STOR-03**: Release workflow with version tagging and changelog generation

### CI Enhancements

- **CIEN-01**: SHA/ref suffix in artifact names for commit-level traceability
- **CIEN-02**: Conditional artifact upload (main-branch only) to reduce PR noise

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Automated store publishing | High complexity (OAuth tokens, review queue opacity); premature before listings are active |
| Docker/containerized builds | No native OS dependencies; ubuntu-latest + setup-node is sufficient and faster |
| Node.js version matrix | esbuild targets browsers, not Node runtimes; single LTS eliminates skew |
| Scheduled nightly builds | No external data sources; local fixture corpus doesn't change; push/PR triggers sufficient |
| Slack/Teams notifications | Solo/small team; GitHub's built-in status checks and email cover the need |
| Separate parallel lint job | web-ext lint runs in ~3s; parallel job spin-up overhead would be slower net |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| CICD-01 | — | Pending |
| CICD-02 | — | Pending |
| CICD-03 | — | Pending |
| PKG-01 | — | Pending |
| PKG-02 | — | Pending |
| PKG-03 | — | Pending |
| HARD-01 | — | Pending |
| HARD-02 | — | Pending |
| HARD-03 | — | Pending |

**Coverage:**
- v2.1 requirements: 9 total
- Mapped to phases: 0
- Unmapped: 9 ⚠️

---
*Requirements defined: 2026-03-04*
*Last updated: 2026-03-04 after initial definition*

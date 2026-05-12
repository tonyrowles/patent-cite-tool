# Requirements: v2.3 Post-v2.2 Hardening

**Milestone goal:** Retroactively capture the column-inference accuracy fix, Firefox store-validation cleanup, and CI release-automation work that landed on `main` after the v2.2 archive — close the books and tag a release.

**Note:** All v2.3 requirements correspond to work that has already been merged to `main`. Phases document the shipped work so it is traceable to a numbered milestone.

## v2.3 Requirements

### Accuracy

- [ ] **ACCY-04**: Citation tool produces correct column numbers for granted patents whose PDFs lack printed column headers (US10203551-class) — column numbers are inferred from structural cues and validated against a tight upper bound (≤200) rather than an arbitrary 999 cap.
- [ ] **ACCY-05**: Position map cache invalidates when column-extraction logic changes — CACHE_VERSION bumped (v2 → v3) so users on prior versions re-parse rather than serving stale maps.

### Firefox Store Readiness

- [ ] **FOX-06**: Firefox extension passes `web-ext lint` with zero AMO-blocking validation errors and warnings, so the dist is submission-ready.

### CI / Release Automation

- [ ] **CICD-04**: Pushing a `v*` semver tag to the repo triggers an automated GitHub Actions release workflow that builds Chrome + Firefox dists and attaches them to a GitHub Release.

## Future Requirements (Deferred to later milestones)

- Chrome Web Store screenshot (1280x800) and promotional tile (440x280)
- Chrome Web Store submission + review
- Firefox Add-ons (AMO) submission + review
- Configurable citation format (`4:5-20` vs `col. 4, ll. 5-20` vs `column 4, lines 5-20`)
- Keyboard shortcut for citation (e.g. Ctrl+Shift+C)
- Batch citation mode — queue multiple citations and copy all at once
- Patent family cache reuse — continuation patents share specification text

## Out of Scope (v2.3)

- Actual store submission (Chrome Web Store, Firefox AMO) — explicitly excluded per user scope decision; v2.3 only formalizes work already on `main`
- New matching/parsing capabilities — column inference shipped is the only accuracy work in scope
- Any net-new features — milestone is retroactive

## Traceability

| Phase | Requirements |
|-------|--------------|
| Phase 23 — Column Inference for Headerless PDFs | ACCY-04, ACCY-05 |
| Phase 24 — Firefox AMO Validation Cleanup | FOX-06 |
| Phase 25 — Automatic Release Workflow | CICD-04 |

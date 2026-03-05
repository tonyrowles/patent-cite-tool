# Phase 19: CI Hardening - Context

**Gathered:** 2026-03-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Security and reliability hardening of the existing CI workflow. Two changes: (1) concurrency group that cancels stale in-progress runs on PR branches but lets every main-branch run complete independently, and (2) explicit least-privilege permissions declaration.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
User deferred all implementation decisions. Requirements (HARD-01, HARD-03) and success criteria are specific enough to drive implementation directly.

Claude has flexibility on:
- **Concurrency group key** — how to construct the group key to achieve per-branch cancellation while protecting main
- **cancel-in-progress logic** — expression or conditional approach for main vs non-main behavior
- **Permission placement** — workflow-level vs job-level `permissions` block
- **Any additional hardening** within the two requirement areas (no scope expansion)

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. Requirements (HARD-01, HARD-03) and success criteria in ROADMAP.md are the authoritative spec.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `.github/workflows/ci.yml` — existing single-job workflow to modify (no concurrency or permissions blocks yet)

### Established Patterns
- Phase 18 decisions: single job, `timeout-minutes: 10`, `actions/*@v4`, shell zip for packaging
- Workflow triggers: `push` (all branches) + `pull_request` (main only)

### Integration Points
- Concurrency block adds at workflow or job level in existing `ci.yml`
- Permissions block adds at workflow top level in existing `ci.yml`
- No other workflows exist — changes are isolated to this single file

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 19-ci-hardening*
*Context gathered: 2026-03-04*

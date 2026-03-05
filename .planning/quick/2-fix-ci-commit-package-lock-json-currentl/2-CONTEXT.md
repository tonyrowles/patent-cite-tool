# Quick Task 2: Fix CI: commit package-lock.json (currently gitignored but required by npm ci) - Context

**Gathered:** 2026-03-05
**Status:** Ready for planning

<domain>
## Task Boundary

Fix CI: commit package-lock.json (currently gitignored but required by npm ci)

</domain>

<decisions>
## Implementation Decisions

### Worker lockfile
- Root only — only commit root package-lock.json. Worker is a separate Cloudflare Workers project and CI doesn't install its deps.

### npm ci vs npm install
- Keep npm ci — strict, reproducible builds. Just need the lockfile committed.

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

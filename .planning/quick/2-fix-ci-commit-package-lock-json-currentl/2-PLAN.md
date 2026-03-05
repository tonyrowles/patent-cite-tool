---
phase: quick-2
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: [.gitignore, package-lock.json]
autonomous: true
must_haves:
  truths:
    - "CI workflow succeeds with npm ci (lockfile present in repo)"
    - "Root package-lock.json is tracked by git"
    - "Worker package-lock.json behavior is unchanged"
  artifacts:
    - path: ".gitignore"
      provides: "No longer ignores root package-lock.json"
      contains: "node_modules"
    - path: "package-lock.json"
      provides: "Lockfile for reproducible npm ci installs"
  key_links:
    - from: ".github/workflows/ci.yml"
      to: "package-lock.json"
      via: "npm ci requires committed lockfile"
      pattern: "npm ci"
---

<objective>
Fix CI by committing package-lock.json to the repository.

Purpose: CI uses `npm ci` which requires `package-lock.json` in the repo, but the file is currently gitignored (line 5 of `.gitignore`). This causes CI to fail.
Output: `.gitignore` updated, `package-lock.json` committed and tracked.
</objective>

<execution_context>
@/home/fatduck/.claude/get-shit-done/workflows/execute-plan.md
@/home/fatduck/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/quick/2-fix-ci-commit-package-lock-json-currentl/2-CONTEXT.md

Current `.gitignore` (6 lines):
```
.glootie-stop-verified
worker/node_modules/
worker/.dev.vars
node_modules/
package-lock.json
dist/
```

CI workflow uses `actions/setup-node@v4` with `cache: 'npm'` and `npm ci` — both require `package-lock.json` in the repo.

`package-lock.json` exists on disk (generated previously) but is gitignored.
`worker/package-lock.json` is already tracked by git — unaffected by this change.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Remove package-lock.json from .gitignore and regenerate lockfile</name>
  <files>.gitignore, package-lock.json</files>
  <action>
1. Edit `.gitignore`: remove line 5 (`package-lock.json`). The file should become:
   ```
   .glootie-stop-verified
   worker/node_modules/
   worker/.dev.vars
   node_modules/
   dist/
   ```

2. Delete the existing `package-lock.json` and regenerate it fresh with `npm install` to ensure it's consistent with the current `package.json`. This guarantees the lockfile is valid and not stale.

3. Verify the lockfile is no longer ignored: `git check-ignore package-lock.json` should return nothing (exit code 1).

4. Verify `npm ci` works with the generated lockfile by running `npm ci` locally.

Note: Root lockfile only per user decision. Do NOT touch `worker/package-lock.json` (already tracked, unaffected).
  </action>
  <verify>
    <automated>git check-ignore package-lock.json; test $? -eq 1 && echo "PASS: not ignored" || echo "FAIL: still ignored"</automated>
  </verify>
  <done>`.gitignore` no longer lists `package-lock.json`. Lockfile is regenerated and ready to commit. `npm ci` succeeds locally.</done>
</task>

</tasks>

<verification>
- `git check-ignore package-lock.json` returns nothing (not ignored)
- `npm ci` completes without errors
- `git diff --cached .gitignore` shows only the `package-lock.json` line removed
- `worker/package-lock.json` remains tracked and unchanged: `git ls-files worker/package-lock.json` returns the path
</verification>

<success_criteria>
- `.gitignore` does not contain `package-lock.json`
- `package-lock.json` is staged/committed to git
- `npm ci` succeeds with the committed lockfile
- No changes to worker/ directory
</success_criteria>

<output>
After completion, create `.planning/quick/2-fix-ci-commit-package-lock-json-currentl/2-SUMMARY.md`
</output>
